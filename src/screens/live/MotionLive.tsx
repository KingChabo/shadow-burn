import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import type { Activity } from '../../data/activities';
import { motionCounterFor, type MotionCounter, type MotionState, type Vec } from '../../features/motion';
import { buzz, say, sfx } from '../../lib/fx';
import { fmtTime } from '../../lib/date';
import { Btn } from '../../components/ui';
import { Icon } from '../../components/Icon';
import { TopBar, useEnd, useStopwatch, useWakeLock, type FinishFn } from './common';
import { CountRing, RestScreen, SetBar, useExerciseInfo, useSets } from './sets';
import type { LiveSets } from '../../lib/sets';

type Props = { activity: Activity; mode: 'pocket' | 'jump'; onFinish: FinishFn; onManual?: () => void; sets?: LiveSets };
type Flash = { text: string; id: number } | null;

/** Nach so vielen ms ohne Berührung sperrt sich der Bildschirm wieder (gegen Tippen in der Hosentasche) */
const RELOCK_MS = 8000;
const HOLD_MS = 900;

/**
 * Hosentasche (Oberschenkel-Neigung) und Sprung-Zähler. Das Handy steckt in der Tasche, darum ist der
 * Bildschirm gesperrt: Erst langes Drücken gibt die Knöpfe frei, sonst würde der Stoff "Fertig" tippen.
 */
export function MotionLive({ activity: a, mode, onFinish, onManual, sets: cfg }: Props) {
  const counter = useRef<MotionCounter | null>(motionCounterFor(a.id, mode));
  const timed = a.unit === 'time';
  const [ms, setMs] = useState<MotionState | null>(counter.current?.state() ?? null);
  const [noData, setNoData] = useState(false);
  const [locked, setLocked] = useState(true);
  const [flash, setFlash] = useState<Flash>(null);
  const start = useRef(Date.now());
  const sec = useStopwatch();
  useWakeLock();
  const info = useExerciseInfo(a);
  const endRef = useRef(() => {});
  const reps = ms?.reps ?? 0;
  const s = useSets(a, cfg, reps, () => endRef.current());
  const restingRef = useRef(false);
  restingRef.current = s.rest.running;
  const baseRef = useRef(0);
  baseRef.current = s.base;

  useEffect(() => {
    const c = counter.current;
    if (!c) return;
    let got = false;
    let lastUi = 0;
    const on = (e: DeviceMotionEvent) => {
      const g = e.accelerationIncludingGravity;
      if (!g || g.x === null || g.y === null || g.z === null) return;
      got = true;
      const v: Vec = { x: g.x, y: g.y, z: g.z };
      const { state, event } = c.update(v, e.timeStamp || performance.now());
      if (event?.type === 'ready') { sfx('go'); buzz(150); say(timed ? 'Bereit' : 'Los'); }
      else if (event?.type === 'rep' && !restingRef.current) {
        const n = state.reps - baseRef.current;
        if (timed) { sfx('rep'); buzz(50); say(`${n} Sekunden`); }
        else if (mode === 'jump') { sfx('tap'); if (n % 10 === 0) say(String(n)); }
        else { sfx('rep'); buzz(50); say(String(n)); }
      } else if (event?.type === 'invalid' && !restingRef.current) {
        sfx('invalid'); buzz([80, 60, 80]); say(event.reason.replace('!', ''));
        setFlash({ text: event.reason, id: Date.now() });
      }
      // Anzeige nicht bei jedem Messwert (60× pro Sekunde) neu zeichnen
      const now = performance.now();
      if (event || now - lastUi > 80) { lastUi = now; setMs(state); }
    };
    window.addEventListener('devicemotion', on);
    const t = setTimeout(() => { if (!got) setNoData(true); }, 2500);
    return () => { window.removeEventListener('devicemotion', on); clearTimeout(t); };
  }, [a.id, mode, timed]);

  // Automatisch wieder sperren
  const touched = useRef(Date.now());
  useEffect(() => {
    if (locked) return;
    touched.current = Date.now();
    const id = setInterval(() => { if (Date.now() - touched.current > RELOCK_MS) setLocked(true); }, 1000);
    return () => clearInterval(id);
  }, [locked]);

  const { end, sheet, open } = useEnd(s.total, onFinish, () => (timed
    ? { activityId: a.id, mode, start: start.current, end: Date.now(), seconds: s.total, invalid: ms?.invalid, sets: s.setList }
    : { activityId: a.id, mode, start: start.current, end: Date.now(), reps: s.total, invalid: ms?.invalid, seconds: Math.round(sec), sets: s.setList }),
    timed ? `${a.name} · ${fmtTime(s.total)} gehalten` : `${s.total} ${a.unitLabel} · ${fmtTime(sec)}`);
  endRef.current = end;

  if (!counter.current) return null;
  const ready = ms?.ready ?? false;
  const shut = locked && !open;

  return (
    <div className="fixed inset-0 z-40 bg-bg flex flex-col" onPointerDown={() => { touched.current = Date.now(); }}>
      {sheet}
      <TopBar seconds={sec} onEnd={end} title={a.name} />
      <RestScreen a={a} s={s} />

      <AnimatePresence>
        {flash && (
          <motion.div key={flash.id} initial={{ opacity: 0.85 }} animate={{ opacity: 0 }} transition={{ duration: 1.1 }} onAnimationComplete={() => setFlash(null)}
            className="absolute inset-0 z-20 pointer-events-none grid place-items-center bg-bad/40">
            <div className="text-center">
              <div className="font-display text-6xl text-white drop-shadow">Ungültig</div>
              <div className="font-display text-2xl text-white/90 mt-1">{flash.text}</div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="flex-1 grid place-items-center pt-20">
        {ready
          ? (
            <div className="grid justify-items-center gap-1">
              <CountRing value={s.current} s={s} record={info.record} unit={timed ? 'gehalten' : a.unitLabel}
                text={timed ? fmtTime(s.current) : undefined} pulseKey={timed ? undefined : reps} />
              {!!ms?.invalid && <p className="text-xs text-fire">{ms.invalid} ungültig</p>}
            </div>
          )
          : (
            <div className="px-8 text-center">
              <motion.div className="mx-auto mb-6 grid h-28 w-28 place-items-center rounded-full border-4 border-neon/60" animate={{ scale: [1, 1.08, 1] }} transition={{ repeat: Infinity, duration: 1.4 }}>
                <Icon name={mode === 'jump' ? 'jump' : 'phone'} className="h-12 w-12 text-neon" />
              </motion.div>
              <p className="font-display text-3xl">Handy einstecken</p>
              <p className="mt-2 text-mute">Dann kurz still stehen. Es piept, sobald es losgeht.</p>
            </div>
          )}
      </div>

      {/* Gesperrt (in der Tasche): nur Zahl, Satz-Balken und Rekord, Knöpfe erst nach dem Entsperren */}
      <div className={`px-4 space-y-3 ${shut ? 'pb-36' : 'pb-[max(env(safe-area-inset-bottom),16px)]'}`}>
        {ready && <p className={`text-center font-display text-3xl ${ms?.hint === 'Halten!' || ms?.hint === 'Gut so!' ? 'text-ink' : 'text-fire'}`}>{ms?.hint}</p>}
        {ready && (
          <div className="h-3 rounded-full bg-line overflow-hidden">
            <div className="h-full bg-gradient-to-r from-volt to-neon transition-[width] duration-100" style={{ width: `${(ms?.depth ?? 0) * 100}%` }} />
          </div>
        )}
        {ready && mode === 'pocket' && !shut && <p className="text-center text-xs text-mute">Oberschenkel {Math.round(ms?.value ?? 0)}° geneigt</p>}
        {noData && (
          <div className="space-y-2 text-center">
            <p className="text-fire">Keine Bewegungsdaten. Dieses Gerät hat wohl keinen Bewegungssensor.</p>
            {onManual && <Btn className="w-full" onClick={onManual}>{timed ? 'Stattdessen mit Timer' : 'Stattdessen von Hand zählen'}</Btn>}
          </div>
        )}
        <SetBar a={a} s={s} record={info.record} last={info.last} buttons={!shut} />
        {!shut && <Btn kind="ghost" className="w-full !py-3" onClick={() => { counter.current?.recalibrate(); setMs(counter.current?.state() ?? null); }}>Neu starten (still stehen)</Btn>}
      </div>

      {shut && <LockOverlay onUnlock={() => setLocked(false)} />}
    </div>
  );
}

/** Fängt alle Berührungen ab. Nur langes Drücken auf den Knopf entsperrt. */
function LockOverlay({ onUnlock }: { onUnlock: () => void }) {
  const [holding, setHolding] = useState(false);
  const timer = useRef<number | null>(null);
  const stop = () => { setHolding(false); if (timer.current) { clearTimeout(timer.current); timer.current = null; } };
  useEffect(() => stop, []);
  return (
    <div className="absolute inset-x-0 bottom-0 top-0 z-30 flex flex-col justify-end" onPointerDown={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()}>
      <div className="px-4 pb-[max(env(safe-area-inset-bottom),16px)] pt-10 bg-gradient-to-t from-bg via-bg/95 to-transparent">
        <button
          onPointerDown={(e) => { e.preventDefault(); setHolding(true); timer.current = window.setTimeout(() => { stop(); buzz(40); onUnlock(); }, HOLD_MS); }}
          onPointerUp={stop} onPointerLeave={stop} onPointerCancel={stop} onContextMenu={(e) => e.preventDefault()}
          className="relative w-full overflow-hidden rounded-2xl bg-panel py-4 text-center select-none touch-none ring-1 ring-line">
          <span className="absolute inset-y-0 left-0 bg-hot/40" style={{ width: holding ? '100%' : '0%', transition: holding ? `width ${HOLD_MS}ms linear` : 'none' }} />
          <span className="relative flex items-center justify-center gap-2 font-semibold"><Icon name="lock" className="h-5 w-5" /> Gedrückt halten zum Entsperren</span>
        </button>
        <p className="mt-2 text-center text-xs text-mute">Gesperrt, damit in der Tasche nichts aus Versehen getippt wird.</p>
      </div>
    </div>
  );
}
