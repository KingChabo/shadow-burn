import { APP_DASH } from '../lib/brand';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import QRCode from 'qrcode';
import { useGame } from '../lib/store';
import { db } from '../lib/db';
import { ACT, ACTIVITIES, type ActivityId } from '../data/activities';
import { Btn, Card, Header } from '../components/ui';
import { Icon } from '../components/Icon';
import { Receiver, Sender } from '../components/QrExchange';
import { NearbyExchange } from '../components/NearbyExchange';
import { bleAvailable } from '../lib/bluetooth';
import { bluetoothOn } from '../lib/bleProtocol';
import type { ReceiveResult } from '../lib/blogDb';
import { buildMyCard, removeFriend } from '../lib/game';
import {
  buildRanking, encodeCard, fmtAgo, fmtBoardValue, recordActivities, weekKey,
  type Board, type Friend, type PlayerCard,
} from '../lib/leaderboard';
import { fmtMedian, fmtRecord, recordScore } from '../lib/recordScore';
import { dayKey } from '../lib/date';
import { buzz, sfx } from '../lib/fx';
import { Avatar } from '../components/Avatar';
import { AvatarBackdrop, NameTag } from '../components/Cosmetics';
import { LevelBadge } from '../components/LevelBadge';
import { activeTheme } from '../lib/themes';
import { defaultAvatar } from '../lib/avatar';
import { STAT_BODY, STAT_CATS, type SharedStats } from '../lib/leaderboard';
import { CAT_COLORS, BODY_PARTS } from '../lib/stats';

/** Gewählte Rekord-Übung merken (nur Komfort, darf fehlen) */
const REC_KEY = 'sb.recAct';
function loadRecAct(): string {
  try { return localStorage.getItem(REC_KEY) ?? ''; } catch { return ''; }
}
function saveRecAct(id: string) {
  try { localStorage.setItem(REC_KEY, id); } catch { /* egal */ }
}

type Overlay = null | 'show' | 'scan' | 'near' | { result: string; ok: boolean; near?: boolean };

const BOARDS: { id: 'total' | 'week' | 'streak' | 'rec'; label: string }[] = [
  { id: 'week', label: 'Woche' },
  { id: 'total', label: 'Gesamt' },
  { id: 'streak', label: 'Streak' },
  { id: 'rec', label: 'Rekorde' },
];

export function Leaderboard({ onFullscreen }: { onFullscreen: (b: boolean) => void }) {
  const g = useGame();
  const [me, setMe] = useState<PlayerCard | null>(null);
  const [friends, setFriends] = useState<Friend[]>([]);
  const [kind, setKind] = useState<'total' | 'week' | 'streak' | 'rec'>('week');
  const [recAct, setRecActState] = useState(loadRecAct);
  const setRecAct = (id: string) => { setRecActState(id); saveRecAct(id); };
  const [overlay, setOverlay] = useState<Overlay>(null);
  const [manage, setManage] = useState(false);
  const [detail, setDetail] = useState<PlayerCard | null>(null);

  const load = useCallback(async () => {
    setMe(await buildMyCard());
    setFriends(await db.friends.toArray());
  }, []);
  useEffect(() => { void load(); }, [load, g.wallet.xp, g.profile?.name]);
  useEffect(() => { onFullscreen(overlay !== null || detail !== null); }, [overlay, detail, onFullscreen]);
  useEffect(() => () => onFullscreen(false), [onFullscreen]);

  const today = dayKey();
  const currentWeek = weekKey(today);
  const recActs = useMemo(() => (me ? recordActivities([me, ...friends]) : []), [me, friends]);
  // Eine Disziplin auf einmal; gespeicherte Übung, sonst die erste mit Rekord
  const activeRec = recActs.includes(recAct as ActivityId) ? (recAct as ActivityId) : recActs[0];
  const recBoard: Board | null = activeRec ? `rec:${activeRec}` : null;
  const board: Board | null = kind === 'rec' ? recBoard : kind;
  const rows = me && board ? buildRanking(me, friends, board, currentWeek) : [];

  // Ein Scan aktualisiert Rangliste und Blog zusammen (abschaltbar in den Einstellungen)
  const withBlog = g.settings.qrBlog !== false && g.settings.blog !== false;
  // Bluetooth-Austausch bei Treffen: nur in der Android-App und nur, wenn in den Einstellungen eingeschaltet
  const bt = bleAvailable() && bluetoothOn(g.settings);

  /** Ergebnis nach QR-Scan oder Bluetooth-Tausch anzeigen (gleiche Meldung für beide Wege) */
  const showResult = async (r: ReceiveResult | { error: string }, near = false) => {
    if ('error' in r) { sfx('invalid'); buzz(200); setOverlay({ result: r.error, ok: false, near }); return; }
    const msg = r.friend === 'self' ? 'Das ist dein eigener Code.'
      : (r.friend === 'new' ? `${r.name} ist jetzt in deiner Rangliste!` : r.friend === 'updated' ? `${r.name} aktualisiert.` : `Du hast von ${r.name} schon neuere Daten.`)
        + (r.cardOnly ? '' : r.added + r.updated > 0 ? ` Blog: ${r.added} neu${r.updated ? `, ${r.updated} aktualisiert` : ''}.` : ' Blog ist auf dem neuesten Stand.');
    setOverlay({ result: msg, ok: r.friend !== 'self', near });
    await load();
  };

  const del = async (f: Friend) => {
    if (!window.confirm(`${f.name} aus der Rangliste entfernen? `)) return;
    await removeFriend(f.id);
    await load();
  };

  const subtitle = kind === 'week' ? 'Punkte seit Montag'
    : kind === 'total' ? 'Alle Punkte seit Beginn'
    : kind === 'streak' ? 'Aktuelle Streak in Tagen'
    : 'Bester Wert je Übung';

  return (
    <div className="pb-8">
      <Header title="Rangliste" right={
        <div className="flex gap-2" data-tour="rank-actions">
          {bt && <button onClick={() => setOverlay('near')} aria-label="In der Nähe tauschen" className="grid h-11 w-11 place-items-center rounded-full bg-panel shadow-card"><Icon name="bluetooth" /></button>}
          <button onClick={() => setOverlay('scan')} aria-label="Scannen" className="grid h-11 w-11 place-items-center rounded-full bg-panel shadow-card"><Icon name="scan" /></button>
          <button onClick={() => setOverlay('show')} aria-label="Mein Code" className="bg-hot grid h-11 w-11 place-items-center rounded-full"><Icon name="qr" /></button>
        </div>
      } />
      <div className="px-4 space-y-4">
        <div className="flex gap-1 rounded-full bg-panel p-1 shadow-card" data-tour="rank-boards">
          {BOARDS.map((b) => (
            <button key={b.id} onClick={() => setKind(b.id)}
              className={`font-sport flex-1 rounded-full py-2 text-[14px] font-semibold tracking-[0.05em] transition ${kind === b.id ? 'bg-ink text-bg' : 'text-mute'}`}>
              {b.label}
            </button>
          ))}
        </div>

        {kind === 'rec' && recActs.length > 0 && (
          <div className="flex gap-2 overflow-x-auto no-scrollbar -mx-4 px-4">
            {recActs.map((id) => (
              <button key={id} onClick={() => setRecAct(id)} aria-pressed={activeRec === id}
                className={`shrink-0 rounded-full px-3 py-1.5 text-sm border ${activeRec === id ? 'border-ink bg-ink text-bg' : 'border-line text-mute'}`}>
                {ACT[id].name}
              </button>
            ))}
          </div>
        )}

        <p className="kicker px-1">{subtitle}</p>
        {kind === 'rec' && recActs.length === 0 && <p className="px-1 text-sm text-mute">Noch keine Rekorde.</p>}

        {/* Siegertreppchen für die ersten drei (Reihenfolge 2 – 1 – 3) */}
        {rows.length > 0 && (
          <div className="flex items-end gap-2.5 pt-2">
            {[rows[1], rows[0], rows[2]].map((r, k) => {
              const place = [2, 1, 3][k];
              if (!r) return <div key={place} className="flex-1" />;
              const card = r.isMe ? me : friends.find((f) => f.id === r.id);
              const h = place === 1 ? 92 : place === 2 ? 66 : 48;
              return (
                <button key={r.id} onClick={() => setDetail(card ?? null)} className={`flex min-w-0 flex-1 flex-col items-center text-center ${!r.isMe && Date.now() - r.at > 14 * 864e5 ? 'opacity-50' : ''}`}>
                  <Avatar look={card?.av ?? defaultAvatar()} level={r.level} className={place === 1 ? 'h-24 w-12' : 'h-20 w-10'} />
                  <div className="mt-1 flex w-full justify-center text-[13px]"><NameTag name={r.name} cs={card?.cs} size="sm" suffix={r.isMe ? '(du)' : undefined} className="items-center" /></div>
                  <div className="font-sport num text-[15px] font-medium text-mute">{board ? fmtBoardValue(board, r.value) : ''}</div>
                  {r.note && <div className="w-full truncate text-[11px] leading-tight text-mute">{r.note}</div>}
                  <div className={`mt-2 grid w-full place-items-center rounded-t-[18px] rounded-b-md ${place === 1 ? 'bg-hot' : 'bg-panel shadow-card'}`} style={{ height: h }}>
                    <span className="font-sport text-[38px] leading-none">{place}</span>
                  </div>
                </button>
              );
            })}
          </div>
        )}

        {rows.length > 3 && (
          <Card className="!px-4 !py-0.5">
            <div className="divide-y divide-line">
              {/* Zeilen ohne layout-Prop: der blockierte sonst die Tab-Ausblendung, danach blieb jeder Tab schwarz */}
              {rows.slice(3).map((r) => (
                <motion.button key={r.id} onClick={() => setDetail(r.isMe ? me : friends.find((f) => f.id === r.id) ?? null)}
                  className={`flex w-full items-center gap-3 py-2.5 text-left ${!r.isMe && Date.now() - r.at > 14 * 864e5 ? 'opacity-50' : ''}`}>
                  <span className={`font-sport num w-6 text-xl ${r.isMe ? 'text-neon' : 'text-mute'}`}>{r.rank}</span>
                  <Avatar look={(r.isMe ? me : friends.find((f) => f.id === r.id))?.av ?? defaultAvatar()} level={r.level} className="h-11 w-[22px] shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="flex min-w-0 items-center gap-1.5">
                      <NameTag name={r.name} cs={(r.isMe ? me : friends.find((f) => f.id === r.id))?.cs} size="sm" suffix={r.isMe ? <span className="font-semibold">(du)</span> : undefined} />
                      <span className="shrink-0 text-xs font-semibold text-mute">Lv {r.level}</span>
                    </div>
                    {r.note && <div className="truncate text-xs text-mute">{r.note}</div>}
                    {!r.isMe && (
                      <div className="text-xs text-mute">
                        Stand: {fmtAgo(r.at, Date.now(), today, dayKey(new Date(r.at)))}
                        {r.staleWeek && <> · aus alter Woche</>}
                        {Date.now() - r.at > 14 * 864e5 && <> · mal wieder scannen</>}
                      </div>
                    )}
                  </div>
                  <span className="font-sport num text-[19px]">{board ? fmtBoardValue(board, r.value) : ''}</span>
                </motion.button>
              ))}
            </div>
          </Card>
        )}

        {friends.length === 0 ? (
          <Card>
            <p className="font-sport mb-1 text-lg font-semibold">Freunde hinzufügen</p>
            <p className="text-sm text-mute">Oben rechts <b className="text-ink">Mein Code</b> zeigen, Freund tippt <b className="text-ink">Scannen</b>. Dann umgekehrt.</p>
          </Card>
        ) : (
          <Card>
            <button className="w-full flex items-center justify-between" onClick={() => setManage((m) => !m)}>
              <span className="font-sport text-lg font-semibold">Freunde ({friends.length})</span>
              <span className="text-sm text-mute">{manage ? 'Fertig' : 'Bearbeiten'}</span>
            </button>
            {manage && (
              <div className="divide-y divide-line mt-2">
                {[...friends].sort((a, b) => a.name.localeCompare(b.name, 'de')).map((f) => (
                  <div key={f.id} className="flex items-center gap-3 py-2 text-sm">
                    <div className="flex-1 min-w-0">
                      <div className="truncate">{f.name}</div>
                      <div className="text-xs text-mute">Zuletzt gescannt: {new Date(f.scannedAt).toLocaleDateString('de-DE')}</div>
                    </div>
                    <button onClick={() => void del(f)} className="w-9 h-9 grid place-items-center rounded-full text-bad active:bg-bad/15" aria-label={`${f.name} entfernen`}>
                      <Icon name="trash" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </Card>
        )}
      </div>

      <AnimatePresence>
        {detail && (
          <motion.div key="detail" initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 24 }}
            className="fixed inset-0 z-50 bg-bg flex flex-col max-w-lg mx-auto">
            <Header title={detail.id === me?.id ? 'Du' : detail.name} onBack={() => setDetail(null)} />
            <div className="flex-1 overflow-y-auto px-4 pb-6">
              <PlayerDetail card={detail} me={me} isMe={detail.id === me?.id} shareOn={!!g.settings.shareStats} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {overlay && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-bg flex flex-col max-w-lg mx-auto">
            <Header title={overlay === 'show' ? 'Mein Code' : overlay === 'scan' ? 'Code scannen' : overlay === 'near' ? 'In der Nähe tauschen' : 'Rangliste'} onBack={() => setOverlay(null)} />
            <div className="flex-1 overflow-y-auto px-4 pb-6 flex flex-col gap-4">
              {overlay === 'show' && (withBlog
                ? <><Sender blog onSwitch={() => setOverlay('scan')} /><MyCardLine /></>
                : <ShowCode onScan={() => setOverlay('scan')} />)}
              {overlay === 'scan' && (
                <Receiver hint={`Halte die Kamera auf den ${APP_DASH}-Code deines Freundes.`} onDone={(r) => void showResult(r)} />
              )}
              {overlay === 'near' && <NearbyExchange withBlog={withBlog} onDone={(r) => void showResult(r, true)} />}
              {typeof overlay === 'object' && (
                <div className="flex-1 flex flex-col items-center justify-center gap-6 text-center">
                  <div className={`w-20 h-20 rounded-full grid place-items-center ${overlay.ok ? 'bg-good/15 text-good' : 'bg-bad/15 text-bad'}`}>
                    <Icon name={overlay.ok ? 'check' : 'x'} className="w-10 h-10" strokeWidth={2.5} />
                  </div>
                  <p className="font-display text-xl">{overlay.result}</p>
                  <div className="w-full space-y-2">
                    {overlay.ok && !overlay.near && <Btn className="w-full" onClick={() => setOverlay('show')}>Jetzt meinen Code zeigen</Btn>}
                    {!overlay.ok && <Btn className="w-full" onClick={() => setOverlay(overlay.near ? 'near' : 'scan')}>{overlay.near ? 'Nochmal' : 'Nochmal scannen'}</Btn>}
                    <Btn kind="ghost" className="w-full" onClick={() => setOverlay(null)}>Zur Rangliste</Btn>
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/** Name, Level und Punkte unter dem animierten Code */
function MyCardLine() {
  const [card, setCard] = useState<PlayerCard | null>(null);
  useEffect(() => { void buildMyCard().then(setCard); }, []);
  if (!card) return null;
  return (
    <div className="flex items-center justify-center gap-3">
      {card.av && <Avatar look={card.av} level={card.level} className="h-20 w-10 shrink-0" />}
      <div className="text-left">
        <NameTag name={card.name} cs={card.cs} size="lg" />
        <p className="text-sm text-mute">Level {card.level} · {card.total.toLocaleString('de-DE')} Punkte · {card.week.toLocaleString('de-DE')} diese Woche</p>
      </div>
    </div>
  );
}

function ShowCode({ onScan }: { onScan: () => void }) {
  const [src, setSrc] = useState('');
  const [card, setCard] = useState<PlayerCard | null>(null);
  useEffect(() => {
    (async () => {
      const c = await buildMyCard();
      setCard(c);
      // Schwarz auf Weiß und niedrige Fehlerkorrektur (weniger Punkte): lässt sich gut vom Bildschirm scannen
      setSrc(await QRCode.toDataURL(encodeCard(c), { errorCorrectionLevel: 'L', margin: 2, width: 720, color: { dark: '#000000', light: '#ffffff' } }));
    })();
  }, []);
  return (
    <>
      <div className="rounded-3xl bg-white p-3 aspect-square w-full grid place-items-center">
        {src ? <img src={src} alt={`Dein ${APP_DASH}-Code`} className="w-full h-full" style={{ imageRendering: 'pixelated' }} /> : <span className="text-mute">Code wird erstellt …</span>}
      </div>
      {card && (
        <div className="flex items-center justify-center gap-3">
          {card.av && <Avatar look={card.av} level={card.level} className="h-20 w-10 shrink-0" />}
          <div className="text-left">
            <NameTag name={card.name} cs={card.cs} size="lg" />
            <p className="text-sm text-mute">Level {card.level} · {card.total.toLocaleString('de-DE')} Punkte · {card.week.toLocaleString('de-DE')} diese Woche</p>
          </div>
        </div>
      )}
      <p className="text-center text-xs text-mute">Tipp: Helligkeit hoch.</p>
      <Btn kind="ghost" className="w-full" onClick={onScan}><span className="flex items-center justify-center gap-2"><Icon name="scan" /> Jetzt Freund scannen</span></Btn>
    </>
  );
}

const CAT_NAMES: Record<string, string> = { kraft: 'Kraft', core: 'Core', cardio: 'Cardio', ausdauer: 'Ausdauer', geraete: 'Geräte', sport: 'Sportarten' };

function PlayerDetail({ card, me, isMe, shareOn }: { card: PlayerCard; me: PlayerCard | null; isMe: boolean; shareOn: boolean }) {
  const theme = activeTheme(card.level, null);
  return (
    <div className="space-y-4">
      <div className="relative flex flex-col items-center overflow-hidden rounded-3xl bg-panel pb-4">
        <AvatarBackdrop cs={card.cs} className="relative flex w-full justify-center pt-6">
          {!card.cs?.backdrop && <div className="pointer-events-none absolute inset-0 opacity-30" style={{ background: `radial-gradient(circle at 50% 40%, ${theme.glow}, transparent 65%)` }} />}
          <Avatar look={card.av ?? defaultAvatar()} level={card.level} className="relative h-72 w-36" animate />
        </AvatarBackdrop>
        <div className="relative mt-3 flex items-center gap-3">
          <LevelBadge level={card.level} theme={theme} size={48} />
          <div>
            <NameTag name={card.name} cs={card.cs} size="lg" />
            <p className="text-xs text-mute">{card.total.toLocaleString('de-DE')} Punkte · Streak {card.streak} · beste {card.longest}</p>
          </div>
        </div>
        {!card.av && <p className="relative mt-2 px-4 text-center text-xs text-mute">Avatar kommt beim nächsten Scan.</p>}
      </div>

      <RecordCompare card={card} me={isMe ? null : me} />

      {card.st ? <StatsBlock st={card.st} /> : (
        <Card>
          <p className="font-display mb-1">Statistik</p>
          <p className="text-sm text-mute">
            {isMe
              ? (shareOn ? 'Wird geteilt.' : 'Nicht geteilt (Ich → Account).')
              : `${card.name} teilt die Statistik nicht.`}
          </p>
        </Card>
      )}
    </div>
  );
}

function StatsBlock({ st }: { st: SharedStats }) {
  const maxW = Math.max(1, ...st.weeks);
  const catSum = st.cats.reduce((a, b) => a + b, 0) || 1;
  return (
    <>
      <div className="grid grid-cols-3 gap-2">
        {[[st.sessions, 'Trainings'], [st.activeDays, 'Aktive Tage'], [Math.round(st.volume / 1000 * 10) / 10, 't bewegt']].map(([v, l]) => (
          <div key={l as string} className="rounded-2xl bg-panel py-3 text-center">
            <div className="num font-display text-2xl">{(v as number).toLocaleString('de-DE')}</div>
            <div className="text-[10px] text-mute">{l}</div>
          </div>
        ))}
      </div>
      <Card>
        <p className="font-display mb-3">Punkte der letzten 8 Wochen</p>
        <div className="flex h-24 items-end gap-1.5">
          {st.weeks.map((w, k) => (
            <div key={k} className="flex h-full flex-1 flex-col justify-end">
              <div className={`w-full rounded-t-md ${k === st.weeks.length - 1 ? 'bg-neon' : 'bg-ink/25'}`} style={{ height: `${(w / maxW) * 100}%`, minHeight: w ? 4 : 2 }} />
            </div>
          ))}
        </div>
      </Card>
      <Card>
        <p className="font-display mb-2">Trainingsart</p>
        <div className="flex h-3 overflow-hidden rounded-full bg-raised">
          {STAT_CATS.map((c, k) => st.cats[k] > 0 && <div key={c} style={{ width: `${(st.cats[k] / catSum) * 100}%`, background: CAT_COLORS[c] }} />)}
        </div>
        <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-mute">
          {STAT_CATS.map((c, k) => st.cats[k] > 0 && <span key={c} className="flex items-center gap-1"><span className="h-2 w-2 rounded-full" style={{ background: CAT_COLORS[c] }} />{CAT_NAMES[c]} {Math.round((st.cats[k] / catSum) * 100)} %</span>)}
        </div>
      </Card>
      <Card>
        <p className="font-display mb-2">Körperpartien</p>
        <div className="space-y-1.5">
          {STAT_BODY.map((b, k) => {
            const part = BODY_PARTS.find((p) => p.id === b)!;
            return (
              <div key={b} className="flex items-center gap-2 text-sm">
                <span className="w-20 shrink-0 text-mute">{part.label}</span>
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-raised"><div className="h-full rounded-full" style={{ width: `${st.body[k]}%`, background: part.color }} /></div>
                <span className="num w-10 text-right text-xs text-mute">{st.body[k]} %</span>
              </div>
            );
          })}
        </div>
      </Card>
    </>
  );
}

/**
 * Rekorde nebeneinander: jede Übung mit Wert und Leistung in %.
 * Auch verschiedene Übungen lassen sich so einordnen (60 % Liegestütze vs. 45 % Plank).
 */
function RecordCompare({ card, me }: { card: PlayerCard; me: PlayerCard | null }) {
  const ids = ACTIVITIES.filter((a) => (card.rec[a.id] ?? 0) > 0 || (me && (me.rec[a.id] ?? 0) > 0)).map((a) => a.id);
  if (!ids.length) return null;
  // Stärkste Rekorde zuerst
  const top = (id: ActivityId) => Math.max(recordScore(id, card.rec[id]), me ? recordScore(id, me.rec[id]) : 0);
  ids.sort((a, b) => top(b) - top(a));
  const scale = Math.max(100, ...ids.map(top));
  const Bar = ({ v, cls }: { v: number; cls: string }) => (
    <div className="h-2 flex-1 overflow-hidden rounded-full bg-raised"><div className={`h-full rounded-full ${cls}`} style={{ width: `${(v / scale) * 100}%`, minWidth: v ? 4 : 0 }} /></div>
  );
  return (
    <Card>
      <p className="font-display">{me ? 'Rekorde im Vergleich' : 'Deine Rekorde'}</p>
      <p className="mb-3 text-xs text-mute">Je Übung · % = besser als so viele Erwachsene (20–39 J.) laut Fitness-Normen.</p>
      {me && (
        <div className="mb-2 flex gap-3 text-xs text-mute">
          <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-neon" />{card.name}</span>
          <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-ink/40" />Du</span>
        </div>
      )}
      <div className="space-y-3">
        {ids.map((id) => {
          const their = card.rec[id] ?? 0, mine = me?.rec[id] ?? 0;
          const ts = recordScore(id, their), ms = recordScore(id, mine);
          return (
            <div key={id} className="text-sm">
              <div className="mb-1 flex items-baseline justify-between gap-2">
                <span className="truncate font-semibold">{ACT[id].name}</span>
                <span className="shrink-0 text-xs text-mute">Mitte: {fmtMedian(id)}</span>
              </div>
              <div className="flex items-center gap-2">
                <Bar v={ts} cls="bg-neon" />
                <span className="num w-28 shrink-0 text-right text-xs">{their ? `${fmtRecord(id, their)} · ${ts} %` : '–'}</span>
              </div>
              {me && (
                <div className="mt-1 flex items-center gap-2">
                  <Bar v={ms} cls="bg-ink/40" />
                  <span className="num w-28 shrink-0 text-right text-xs text-mute">{mine ? `${fmtRecord(id, mine)} · ${ms} %` : '–'}</span>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </Card>
  );
}
