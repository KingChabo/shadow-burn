import { useCallback, useEffect, useRef, useState } from 'react';
import { buzz, say, sfx } from '../lib/fx';
import { clampRest, REST_STEP } from '../lib/sets';
import { RestGame, RestPicker, useRestPick } from '../features/restgames/RestGame';

/** Pausentimer: läuft bis endAt, kann verlängert/gekürzt werden; piept und vibriert am Ende */
export function useRest(onDone?: () => void) {
  const [endAt, setEndAt] = useState<number | null>(null);
  const [now, setNow] = useState(Date.now());
  const done = useRef(onDone);
  done.current = onDone;
  useEffect(() => {
    if (endAt === null) return;
    const tick = () => {
      const t = Date.now();
      setNow(t);
      if (t >= endAt) {
        setEndAt(null);
        sfx('success'); buzz([200, 100, 200]); say('Pause vorbei. Weiter geht\'s');
        done.current?.();
      }
    };
    tick();
    const id = setInterval(tick, 250);
    return () => clearInterval(id);
  }, [endAt]);
  const start = useCallback((sec: number) => { const t = Date.now(); setNow(t); setEndAt(t + clampRest(sec) * 1000); }, []);
  /** Verlängern (+) oder kürzen (−); nie unter 5 Sekunden Rest */
  const add = useCallback((d: number) => setEndAt((e) => (e === null ? e : Math.max(Date.now() + 5000, e + d * 1000))), []);
  /** Pause abbrechen und gleich weitermachen */
  const skip = useCallback(() => { setEndAt(null); done.current?.(); }, []);
  const left = endAt === null ? 0 : Math.max(0, Math.ceil((endAt - now) / 1000));
  return { running: endAt !== null, left, endAt, start, add, skip };
}

export type Rest = ReturnType<typeof useRest>;

export const fmtClock = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

/** Anzeige der laufenden Pause mit −15 s / +15 s und „Weiter“ */
export function RestPanel({ rest, next, className = '' }: { rest: Rest; next?: string; className?: string }) {
  const { pick, setPick } = useRestPick(rest);
  if (!rest.running) return null;
  return (
    <div role="timer" aria-label="Pause" className={`rounded-3xl bg-panel p-4 text-center shadow-card ring-1 ring-neon/40 ${className}`}>
      <p className="text-xs text-mute">Pause</p>
      <div className="num font-display text-6xl leading-tight text-neon">{fmtClock(rest.left)}</div>
      {next && <p className="text-sm text-mute">{next}</p>}
      {pick === null && <RestPicker onPick={setPick} className="mt-3 bg-raised/40" />}
      {pick && pick !== 'x' && <RestGame rest={rest} id={pick} className="mt-3 h-[22rem] rounded-2xl" />}
      <div className="mt-3 grid grid-cols-3 gap-2">
        <button onClick={() => rest.add(-REST_STEP)} className="rounded-xl bg-raised py-3 font-semibold">−{REST_STEP} s</button>
        <button onClick={() => rest.add(REST_STEP)} className="rounded-xl bg-raised py-3 font-semibold">+{REST_STEP} s</button>
        <button onClick={rest.skip} className="rounded-xl bg-hot py-3 font-semibold text-white">Weiter</button>
      </div>
    </div>
  );
}
