import { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { Btn } from './ui';
import { Icon } from './Icon';
import { QrScanner } from './QrScanner';
import { buzz, sfx } from '../lib/fx';
import { saveFriend } from '../lib/game';
import { decodeCard, isCardText } from '../lib/leaderboard';
import { FRAME_MS, FrameCollector, newSid, SHARE_IMAGE_EDGE, SHARE_POSTS, shareDays, shareDaysText, toFrames } from '../lib/blog';
import { useGame } from '../lib/store';
import { packMine, receiveBlog, type ReceiveResult } from '../lib/blogDb';

/**
 * Austausch per animiertem QR-Code (Rangliste und Blog in einem Scan).
 * Wird in der Rangliste und auf der Blog-Seite benutzt.
 */

/** Foto verkleinern und als WebP (sonst JPEG) speichern */
export async function shrinkImage(src: string | Blob, edge: number, quality: number): Promise<string | null> {
  try {
    const url = typeof src === 'string' ? src : URL.createObjectURL(src);
    const img = new Image();
    img.decoding = 'async';
    await new Promise<void>((ok, fail) => { img.onload = () => ok(); img.onerror = () => fail(new Error('Bild')); img.src = url; });
    if (typeof src !== 'string') URL.revokeObjectURL(url);
    const w = img.naturalWidth || 400, h = img.naturalHeight || 260;
    const k = Math.min(1, edge / Math.max(w, h));
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(w * k)); c.height = Math.max(1, Math.round(h * k));
    c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
    const webp = c.toDataURL('image/webp', quality);
    return webp.startsWith('data:image/webp') ? webp : c.toDataURL('image/jpeg', quality);
  } catch { return null; }
}

/** Animierter Code: Spielerkarte für die Rangliste plus (wenn `blog`) die eigenen Blog-Beiträge im eingestellten Zeitraum */
export function Sender({ onSwitch, blog = true }: { onSwitch: () => void; blog?: boolean }) {
  const days = shareDays(useGame().settings.shareDays);
  const [frames, setFrames] = useState<string[]>([]);
  const [info, setInfo] = useState<{ posts: number; images: number; total: number } | null>(null);
  const [i, setI] = useState(0);
  useEffect(() => {
    let on = true;
    (async () => {
      const r = await packMine((img) => shrinkImage(img, SHARE_IMAGE_EDGE, 0.5), blog, Date.now(), { days, max: SHARE_POSTS });
      const fr = toFrames(r.payload, newSid());
      // Schwarz auf Weiß, niedrige Fehlerkorrektur: so passen die meisten Daten in einen gut lesbaren Code
      const urls = await Promise.all(fr.map((f) => QRCode.toDataURL(f, { errorCorrectionLevel: 'L', margin: 2, width: 720, color: { dark: '#000000', light: '#ffffff' } })));
      if (!on) return;
      setInfo(r); setFrames(urls);
    })();
    return () => { on = false; };
  }, []);
  useEffect(() => {
    if (frames.length < 2) return;
    const t = setInterval(() => setI((x) => (x + 1) % frames.length), FRAME_MS);
    return () => clearInterval(t);
  }, [frames.length]);
  const secs = Math.ceil((frames.length * FRAME_MS) / 1000);
  return (
    <div className="space-y-4">
      <div className="relative grid aspect-square w-full place-items-center rounded-3xl bg-white p-3">
        {frames.length ? <img src={frames[i]} alt="Animierter Code" className="h-full w-full" style={{ imageRendering: 'pixelated' }} /> : <span className="text-[#777]">Code wird erstellt …</span>}
      </div>
      {frames.length > 0 && (
        <div className="h-1.5 overflow-hidden rounded-full bg-raised">
          <div className="h-full bg-hot transition-[width] duration-200" style={{ width: `${((i + 1) / frames.length) * 100}%` }} />
        </div>
      )}
      {info && (
        <p className="text-center text-sm text-mute">
          Rangliste{info.posts ? <> + {info.posts} {info.posts === 1 ? 'Beitrag' : 'Beiträge'} {shareDaysText(days)} · {info.images} {info.images === 1 ? 'Foto' : 'Fotos'}</> : blog ? ` (keine Blog-Beiträge ${shareDaysText(days)})` : ''} · {frames.length} {frames.length === 1 ? 'Code' : 'Codes'} · ca. {secs} s
        </p>
      )}
      {info && info.total > info.posts && (
        <p className="rounded-2xl bg-raised px-3 py-2 text-center text-xs text-mute">{info.posts} von {info.total} Beiträgen werden gesendet (die neuesten). Per QR-Code gehen höchstens {SHARE_POSTS}.</p>
      )}
      <p className="text-center text-xs text-mute">Anderes Handy auf „Empfangen“ und drauf halten. Die Codes wechseln, bis alles da ist.</p>
      <Btn kind="ghost" className="w-full" onClick={onSwitch}><span className="flex items-center justify-center gap-2"><Icon name="scan" /> Fertig? Jetzt empfangen</span></Btn>
    </div>
  );
}

/** Liest den animierten Code und auch einzelne Ranglisten-Codes (ältere Versionen oder „nur Rangliste“) */
export function Receiver({ onDone, hint }: { onDone: (r: ReceiveResult | { error: string }) => void; hint: string }) {
  const col = useRef(new FrameCollector());
  const [prog, setProg] = useState({ got: 0, n: 0, have: [] as boolean[] });
  const finished = useRef(false);
  const onText = async (t: string) => {
    if (finished.current) return;
    if (!col.current.add(t)) {
      if (isCardText(t)) {
        finished.current = true;
        try {
          const card = decodeCard(t);
          const r = await saveFriend(card);
          if (r.status !== 'self') { sfx('success'); buzz([40, 60, 40]); }
          onDone({ name: card.name, added: 0, updated: 0, friend: r.status, cardOnly: true });
        } catch (e) { onDone({ error: e instanceof Error ? e.message : 'Fehler beim Lesen' }); }
      }
      return;
    }
    const c = col.current;
    buzz(12);
    setProg({ got: c.got, n: c.n, have: Array.from({ length: c.n }, (_, k) => c.parts[k] !== undefined) });
    if (c.done) {
      finished.current = true;
      sfx('success'); buzz([60, 40, 120]);
      try { onDone(await receiveBlog(c.payload)); } catch (e) { onDone({ error: e instanceof Error ? e.message : 'Fehler beim Lesen' }); }
    }
  };
  const pct = prog.n ? prog.got / prog.n : 0;
  return (
    <div className="space-y-4">
      <div className="relative">
        <QrScanner continuous onResult={(t) => void onText(t)} onError={(m) => onDone({ error: m })} />
        {prog.n > 0 && (
          <div className="absolute inset-x-3 bottom-3 rounded-2xl bg-black/70 px-3 py-2 text-white">
            <div className="flex items-center justify-between text-sm font-semibold"><span>Empfange …</span><span className="num">{prog.got}/{prog.n}</span></div>
            <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white/20"><div className="h-full bg-hot transition-[width]" style={{ width: `${pct * 100}%` }} /></div>
          </div>
        )}
      </div>
      {prog.n > 0 && (
        <div className="flex flex-wrap justify-center gap-1">
          {prog.have.map((h, k) => <span key={k} className={`h-2.5 w-2.5 rounded-[3px] ${h ? 'bg-neon' : 'bg-raised'}`} />)}
        </div>
      )}
      <p className="text-center text-sm text-mute">{prog.n ? 'Ruhig halten. Fehlende Codes kommen in der nächsten Runde.' : hint}</p>
    </div>
  );
}
