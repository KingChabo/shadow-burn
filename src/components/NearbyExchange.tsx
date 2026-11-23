import { useEffect, useRef, useState, type ReactNode } from 'react';
import { motion } from 'framer-motion';
import QRCode from 'qrcode';
import { QrScanner } from './QrScanner';
import { Btn } from './ui';
import { Icon } from './Icon';
import { shrinkImage } from './QrExchange';
import { useGame } from '../lib/store';
import { buzz, sfx } from '../lib/fx';
import { Ble } from '../lib/bluetooth';
import { bluetoothSecure } from '../lib/bleProtocol';
import { NearbySession, type NearPeer } from '../lib/nearby';
import { SHARE_IMAGE_EDGE, SHARE_POSTS_BT, shareDays, shareDaysText, validImage } from '../lib/blog';
import { packMine, receiveBlog, type Packed, type ReceiveResult } from '../lib/blogDb';

/**
 * "In der Nähe tauschen": dieselben Daten wie beim QR-Tausch, aber per Bluetooth.
 * Bluetooth läuft nur, solange dieser Bildschirm offen ist.
 */

/** Fotos per Bluetooth etwas größer als beim QR-Code (passt trotzdem unter die Empfangsgrenze) */
const BT_IMAGE_EDGE = 360;
/** Alle Fotos zusammen höchstens ca. 2,5 MB: so bleibt die Nachricht sicher unter 4 MB (Grenze auch bei älteren Apps) */
const BT_IMAGE_BUDGET = 2_500_000;

async function shrinkForBt(img: string): Promise<string | null> {
  const big = await shrinkImage(img, BT_IMAGE_EDGE, 0.6);
  if (big && validImage(big, 58_000)) return big;
  return shrinkImage(img, SHARE_IMAGE_EDGE, 0.5);
}

export function NearbyExchange({ withBlog, onDone }: { withBlog: boolean; onDone: (r: ReceiveResult | { error: string }) => void }) {
  const g = useGame();
  const [, render] = useState(0);
  const [ask, setAsk] = useState<NearPeer | null>(null);
  const [pair, setPair] = useState<null | 'show' | 'scan'>(null);
  const [scanErr, setScanErr] = useState('');
  const [scanKey, setScanKey] = useState(0);
  const [qrImg, setQrImg] = useState('');
  const info = useRef<Packed | null>(null);
  const days = shareDays(g.settings.shareDays);
  // Extra sicher: nur QR-Kopplung, keine Geräteliste (gilt für die ganze Sitzung)
  const [secure] = useState(() => bluetoothSecure(g.settings));
  const what = withBlog ? `Rangliste und Blog-Beiträge ${shareDaysText(days)}` : 'eure Ranglisten-Karte';
  const done = useRef(onDone);
  done.current = onDone;
  const ref = useRef<NearbySession<ReceiveResult> | null>(null);
  if (!ref.current) {
    ref.current = new NearbySession<ReceiveResult>({
      ble: Ble,
      name: g.profile?.name ?? 'Shadow Burn',
      secure,
      payload: async () => {
        const r = await packMine(shrinkForBt, withBlog, Date.now(), { days, max: SHARE_POSTS_BT, imageBudget: BT_IMAGE_BUDGET });
        info.current = r;
        render((x) => x + 1);
        return r.payload;
      },
      receive: receiveBlog,
      onChange: () => render((x) => x + 1),
      onResult: (r) => {
        if (!('error' in r) && r.friend !== 'self') { sfx('success'); buzz([60, 40, 120]); }
        done.current(r);
      },
    });
  }
  const s = ref.current;

  useEffect(() => {
    void s.start();
    // App wieder im Vordergrund: weitersuchen (im Hintergrund hat Android alles beendet)
    const onVis = () => { if (document.visibilityState === 'visible' && s.phase.k === 'paused') void s.start(); };
    document.addEventListener('visibilitychange', onVis);
    return () => { document.removeEventListener('visibilitychange', onVis); void s.stop(); };
  }, [s]);

  const ph = s.phase;
  useEffect(() => { if (ph.k === 'invited') { buzz([30, 60, 30]); sfx('tap'); } }, [ph.k]);
  useEffect(() => { if (ph.k !== 'search') { setAsk(null); setPair(null); setScanErr(''); } }, [ph.k]);
  // Kopplungs-QR-Code erzeugen, solange er gezeigt wird
  const pairText = pair === 'show' ? s.pairText() : null;
  useEffect(() => {
    if (!pairText) { setQrImg(''); return; }
    let on = true;
    void QRCode.toDataURL(pairText, { errorCorrectionLevel: 'M', margin: 2, width: 560, color: { dark: '#000000', light: '#ffffff' } }).then((u) => { if (on) setQrImg(u); });
    return () => { on = false; };
  }, [pairText]);
  const closePair = () => { if (pair === 'show') s.dropPair(); setPair(null); setScanErr(''); };

  if (ph.k === 'starting') return <Center icon="bluetooth" title="Bluetooth wird vorbereitet …" />;

  if (ph.k === 'off') {
    const isOff = ph.msg === 'Bluetooth ist aus.';
    return (
      <Center icon="bluetooth" title={isOff ? 'Bluetooth ist aus' : 'Bluetooth geht gerade nicht'} text={isOff ? 'Zum Tauschen in der Nähe muss Bluetooth am Handy eingeschaltet sein.' : ph.msg}>
        {isOff ? <Btn className="w-full" onClick={() => void s.enable()}>Bluetooth einschalten</Btn> : <Btn className="w-full" onClick={() => void s.start()}>Nochmal versuchen</Btn>}
      </Center>
    );
  }

  if (ph.k === 'paused') {
    return <Center icon="bluetooth" title="Pausiert" text="Bluetooth ist aus, solange die App im Hintergrund ist."><Btn className="w-full" onClick={() => void s.start()}>Weiter suchen</Btn></Center>;
  }

  if (ph.k === 'notice') {
    return <Center icon="x" bad title={ph.msg}><Btn className="w-full" onClick={() => s.back()}>Weiter suchen</Btn></Center>;
  }

  if (ph.k === 'seeking') {
    return (
      <Center icon="bluetooth" pulse title="Suche das Handy deines Freundes …" text="Code gescannt. Haltet die Handys nah beieinander.">
        <Btn kind="ghost" className="w-full" onClick={() => s.cancel()}>Abbrechen</Btn>
      </Center>
    );
  }

  if (ph.k === 'connecting' || ph.k === 'waiting') {
    return (
      <Center icon="bluetooth" pulse title={ph.k === 'connecting' ? `Verbinde mit ${ph.name} …` : ph.qr ? 'Code wird geprüft …' : `Warte auf ${ph.name} …`}
        text={ph.k === 'waiting' ? (ph.qr ? `${ph.name} prüft den Code. Danach startet der Tausch von selbst.` : `${ph.name} muss den Tausch auf dem eigenen Handy bestätigen.`) : 'Haltet die Handys nah beieinander.'}>
        <Btn kind="ghost" className="w-full" onClick={() => s.cancel()}>Abbrechen</Btn>
      </Center>
    );
  }

  if (ph.k === 'invited') {
    return (
      <Center icon="bluetooth" pulse title={`${ph.name} möchte mit dir tauschen`}
        text={`Ihr bekommt gegenseitig ${what}.`}>
        <Btn className="w-full" onClick={() => s.accept()}>Tauschen</Btn>
        <Btn kind="ghost" className="w-full" onClick={() => s.decline()}>Ablehnen</Btn>
      </Center>
    );
  }

  if (ph.k === 'transfer' || ph.k === 'finished') {
    const t = ph.k === 'transfer' ? ph : null;
    return (
      <Center icon="bluetooth" pulse={!!t} title={t ? `Tausche mit ${ph.name} …` : 'Fertig'}>
        {t && (
          <div className="w-full space-y-3 text-left">
            <Bar label="Senden" a={t.sent} b={t.sentTotal} />
            <Bar label="Empfangen" a={t.got} b={t.gotTotal} />
            <p className="text-center text-xs text-mute">Handys nah beieinander lassen, bis beide fertig sind.</p>
            <Btn kind="ghost" className="w-full" onClick={() => s.cancel()}>Abbrechen</Btn>
          </div>
        )}
      </Center>
    );
  }

  // Suche
  const list = s.list;
  return (
    <div className="space-y-4">
      {secure ? (
        <div className="flex flex-col items-center gap-3 pt-4 text-center">
          <div className="grid h-20 w-20 place-items-center rounded-full bg-hot/15 text-hot"><Icon name="lock" className="h-10 w-10" strokeWidth={2.2} /></div>
          <p className="font-display text-lg">Extra sicher tauschen</p>
          <p className="text-sm text-mute">Einer zeigt seinen Code, der andere scannt ihn. Nur dann startet der Tausch. Anfragen ohne Code werden abgelehnt.</p>
          <div className="flex w-full gap-2 pt-1">
            <Btn className="flex-1 !py-3" onClick={() => { setScanErr(''); setPair('show'); }}><span className="flex items-center justify-center gap-2"><Icon name="qr" /> Code zeigen</span></Btn>
            <Btn kind="ghost" className="flex-1 !py-3" onClick={() => { s.dropPair(); setScanErr(''); setPair('scan'); }}><span className="flex items-center justify-center gap-2"><Icon name="scan" /> Code scannen</span></Btn>
          </div>
          {s.pairError && !pair && <p className="rounded-2xl bg-bad/10 px-3 py-2 text-xs text-bad">{s.pairError}</p>}
          <p className="text-xs text-mute">Dein Freund muss die extra sichere Bluetooth-Übertragung auch eingeschaltet haben (Ich → Account → Bluetooth).</p>
        </div>
      ) : (
        <>
          <div className="flex flex-col items-center gap-3 pt-4 text-center">
            <Radar />
            <p className="font-display text-lg">Suche Handys in der Nähe …</p>
            <p className="text-sm text-mute">Dein Freund öffnet bei sich auch <b className="text-ink">In der Nähe tauschen</b>. Dann tippt einer auf den Namen des anderen.</p>
            {!s.visible && <p className="rounded-2xl bg-bad/10 px-3 py-2 text-xs text-bad">Dein Handy kann für andere nicht sichtbar sein. Tippe du auf deinen Freund.</p>}
          </div>
          <div className="space-y-2">
            {list.map((p) => (
              <button key={p.sid} onClick={() => setAsk(p)} className="flex w-full items-center gap-3 rounded-2xl bg-panel px-4 py-3 text-left shadow-card active:bg-raised">
                <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-hot/15 text-hot"><Icon name="phone" className="h-5 w-5" /></div>
                <span className="min-w-0 flex-1 truncate font-semibold">{p.name}</span>
                <Signal rssi={p.rssi} />
              </button>
            ))}
            {list.length === 0 && <p className="py-2 text-center text-xs text-mute">Noch niemand gefunden.</p>}
          </div>
        </>
      )}
      {info.current && withBlog && info.current.total > info.current.posts && (
        <p className="rounded-2xl bg-raised px-3 py-2 text-center text-xs text-mute">{info.current.posts} von {info.current.total} Beiträgen werden gesendet (die neuesten, höchstens {SHARE_POSTS_BT}).</p>
      )}
      <p className="text-center text-xs text-mute">Sichtbar als „{g.profile?.name ?? 'Shadow Burn'}“, nur solange dieser Bildschirm offen ist.</p>

      {pair && (
        <div className="fixed inset-0 z-[60] flex items-end bg-black/50 p-4" onClick={closePair}>
          <motion.div initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} onClick={(e) => e.stopPropagation()}
            className="mx-auto w-full max-w-lg space-y-3 rounded-3xl bg-bg p-5 shadow-card">
            {pair === 'show' ? (
              <>
                <p className="font-display text-xl">Dein Kopplungscode</p>
                <div className="mx-auto grid aspect-square w-full max-w-[260px] place-items-center rounded-2xl bg-white p-2">
                  {qrImg ? <img src={qrImg} alt="Kopplungscode" className="h-full w-full" style={{ imageRendering: 'pixelated' }} /> : <span className="text-[#777]">…</span>}
                </div>
                <p className="text-sm text-mute">Dein Freund öffnet „In der Nähe tauschen“ → <b className="text-ink">Code scannen</b>. Ihr bekommt gegenseitig {what}. Der Code gilt nur für einen Tausch und verfällt, wenn du diesen Bildschirm schließt.</p>
                {s.pairError && <p className="rounded-2xl bg-bad/10 px-3 py-2 text-xs text-bad">{s.pairError}</p>}
              </>
            ) : (
              <>
                <p className="font-display text-xl">Code scannen</p>
                {scanErr ? (
                  <>
                    <p className="rounded-2xl bg-bad/10 px-3 py-2 text-sm text-bad">{scanErr}</p>
                    <Btn className="w-full" onClick={() => { setScanErr(''); setScanKey((k) => k + 1); }}>Nochmal scannen</Btn>
                  </>
                ) : (
                  <QrScanner key={scanKey} onResult={(t) => { const e = s.pairWith(t); if (e) setScanErr(e); }} onError={(m) => setScanErr(m)} />
                )}
                <p className="text-sm text-mute">Halte die Kamera auf den Kopplungscode deines Freundes. Ihr bekommt gegenseitig {what}.</p>
              </>
            )}
            <Btn kind="ghost" className="w-full" onClick={closePair}>Schließen</Btn>
          </motion.div>
        </div>
      )}

      {ask && (
        <div className="fixed inset-0 z-[60] flex items-end bg-black/50 p-4" onClick={() => setAsk(null)}>
          <motion.div initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} onClick={(e) => e.stopPropagation()}
            className="mx-auto w-full max-w-lg space-y-3 rounded-3xl bg-bg p-5 shadow-card">
            <p className="font-display text-xl">Mit {ask.name} tauschen?</p>
            <p className="text-sm text-mute">Ihr bekommt gegenseitig {what}. {ask.name} muss auch bestätigen.</p>
            <Btn className="w-full" onClick={() => { const p = ask; setAsk(null); void s.invite(p.sid); }}>Tauschen</Btn>
            <Btn kind="ghost" className="w-full" onClick={() => setAsk(null)}>Abbrechen</Btn>
          </motion.div>
        </div>
      )}
    </div>
  );
}

function Center({ icon, title, text, children, pulse, bad }: { icon: 'bluetooth' | 'x'; title: string; text?: string; children?: ReactNode; pulse?: boolean; bad?: boolean }) {
  return (
    <div className="flex flex-col items-center gap-5 pt-10 text-center">
      <div className={`relative grid h-20 w-20 place-items-center rounded-full ${bad ? 'bg-bad/15 text-bad' : 'bg-hot/15 text-hot'}`}>
        {pulse && <motion.span className="absolute inset-0 rounded-full bg-hot/20" animate={{ scale: [1, 1.5], opacity: [0.7, 0] }} transition={{ duration: 1.4, repeat: Infinity }} />}
        <Icon name={icon} className="relative h-10 w-10" strokeWidth={2.2} />
      </div>
      <p className="font-display text-xl">{title}</p>
      {text && <p className="-mt-3 text-sm text-mute">{text}</p>}
      {children && <div className="w-full space-y-2">{children}</div>}
    </div>
  );
}

function Radar() {
  return (
    <div className="relative grid h-24 w-24 place-items-center">
      {[0, 0.6, 1.2].map((d) => (
        <motion.span key={d} className="absolute inset-0 rounded-full border-2 border-hot/60"
          initial={{ scale: 0.4, opacity: 0.9 }} animate={{ scale: 1.25, opacity: 0 }} transition={{ duration: 1.8, delay: d, repeat: Infinity, ease: 'easeOut' }} />
      ))}
      <div className="grid h-14 w-14 place-items-center rounded-full bg-hot"><Icon name="bluetooth" className="h-7 w-7" strokeWidth={2.2} /></div>
    </div>
  );
}

function Bar({ label, a, b }: { label: string; a: number; b: number }) {
  const pct = b ? Math.min(1, a / b) : 0;
  return (
    <div>
      <div className="flex justify-between text-sm"><span>{label}</span><span className="num text-mute">{b ? `${Math.round(pct * 100)} %` : '…'}</span></div>
      <div className="mt-1 h-2 overflow-hidden rounded-full bg-raised"><div className="h-full bg-hot transition-[width] duration-200" style={{ width: `${pct * 100}%` }} /></div>
    </div>
  );
}

/** Signalstärke als drei Balken */
function Signal({ rssi }: { rssi: number }) {
  const n = rssi > -60 ? 3 : rssi > -75 ? 2 : 1;
  return (
    <span className="flex items-end gap-0.5" aria-label={n === 3 ? 'ganz nah' : n === 2 ? 'nah' : 'weiter weg'}>
      {[1, 2, 3].map((k) => <span key={k} className={`w-1 rounded-sm ${k <= n ? 'bg-hot' : 'bg-line'}`} style={{ height: 4 + k * 4 }} />)}
    </span>
  );
}
