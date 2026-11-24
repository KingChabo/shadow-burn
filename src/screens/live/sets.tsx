import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { inkColor } from './common';
import type { Activity } from '../../data/activities';
import type { Workout } from '../../lib/db';
import { lastWorkoutFor } from '../../lib/game';
import { useGame } from '../../lib/store';
import { buzz, say, sfx } from '../../lib/fx';
import { DEFAULT_REST, fmtSec, REST_STEP, setsOf, targetOf, type LiveSets } from '../../lib/sets';
import { fmtClock, useRest } from '../../components/RestTimer';
import { Icon } from '../../components/Icon';
import { RestGame, RestPicker, useRestPick } from '../../features/restgames/RestGame';

/** Rekord (am Stück) und letztes Training einer Übung ohne Gerät */
export function useExerciseInfo(a: Activity) {
  const g = useGame();
  const [last, setLast] = useState<Workout | undefined>();
  useEffect(() => { void lastWorkoutFor(a.id).then(setLast); }, [a.id]);
  const r = g.records[a.id];
  const record = a.unit === 'time' ? r?.seconds : r?.reps;
  return { record: record && record > 0 ? record : undefined, last };
}

/**
 * Sätze während einer Live-Übung. count = laufender Zähler der Übung (Wdh. oder Sekunden, wächst immer weiter).
 * Ein Satz = was seit Satzbeginn dazukam. Während der Pause gezählte Wiederholungen fallen weg.
 * Ohne `cfg` (z. B. in Workouts) ist alles wie früher: ein einziger Satz.
 */
export function useSets(a: Activity, cfg: LiveSets | undefined, count: number, onAllDone: () => void) {
  const timed = a.unit === 'time';
  const [done, setDone] = useState<number[]>([]);
  const [base, setBase] = useState(0);
  const countRef = useRef(count);
  countRef.current = count;
  const plan = cfg?.mode === 'plan' ? cfg.plan : null;
  const rest = useRest(() => setBase(countRef.current));
  const current = rest.running ? 0 : Math.max(0, count - base);
  const total = done.reduce((s, x) => s + x, 0) + current;
  const allDone = useRef(onAllDone);
  allDone.current = onAllDone;
  // Alle geplanten Sätze geschafft → nach dem Rendern (mit dem letzten Satz) Beenden öffnen
  const [finished, setFinished] = useState(0);
  useEffect(() => { if (finished > 0) allDone.current(); }, [finished]);

  /** Satz abschließen; withRest = danach Pause starten */
  const finishSet = (withRest: boolean) => {
    if (rest.running) return;
    const cur = Math.max(0, countRef.current - base);
    const next = cur > 0 ? [...done, cur] : done;
    setDone(next);
    setBase(countRef.current);
    if (cur > 0) { sfx('success'); buzz([60, 40, 60]); }
    if (plan && next.length >= plan.sets) { setFinished((x) => x + 1); return; }
    if (withRest) {
      rest.start(plan?.rest ?? DEFAULT_REST);
      say(plan ? `Satz ${next.length} geschafft. Pause` : 'Pause');
    }
  };

  // Geplant: Ziel erreicht → Satz fertig, Pause startet sofort
  useEffect(() => {
    if (plan && !rest.running && current >= targetOf(plan, done.length)) finishSet(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current, plan, rest.running]);

  /** Für die Speicherung: alle Sätze inkl. des laufenden */
  const all = current > 0 ? [...done, current] : done;
  return {
    /** Ziel des laufenden Satzes (nur bei geplanten Sätzen) */
    goal: plan ? targetOf(plan, done.length) : undefined,
    enabled: !!cfg, plan, timed, done, current, total, base, rest, finishSet,
    /** Sätze fürs Speichern (nur bei mehr als einem) */
    setList: cfg && all.length > 1 ? all : undefined,
  };
}

export type SetsState = ReturnType<typeof useSets>;

/** Ab so viel Abstand zum Rekord wird die Rekord-Zeile orange (Wdh. bzw. Sekunden) */
const CLOSE_REPS = 3;
const CLOSE_SEC = 10;

/**
 * Rekord-Zeile: normalerweise grau „Letztes Mal 21 · Rekord 21“. Wird es knapp, orange „Noch 3 bis zum Rekord“,
 * geschafft „Neuer Rekord!“ (mit Ton und Ansage).
 */
export function RecordLine({ value, record, last, timed, className = '' }: { value: number; record?: number; last?: Workout; timed: boolean; className?: string }) {
  const beat = record !== undefined && value > record;
  const said = useRef(false);
  useEffect(() => {
    if (beat && !said.current) { said.current = true; sfx('gem'); buzz([80, 40, 80, 40, 160]); say('Neuer Rekord'); }
  }, [beat]);
  const f = (x: number) => (timed ? fmtSec(x) : String(x));
  const missing = record !== undefined ? record - value + 1 : 0;
  const close = record !== undefined && !beat && value > 0 && missing <= (timed ? CLOSE_SEC : CLOSE_REPS);
  if (beat || close) {
    return (
      <p className={`flex items-center justify-center gap-1.5 text-sm font-semibold text-neon ${className}`}>
        <Icon name="trophy" className="h-4 w-4" />
        {beat ? `Neuer Rekord! Vorher ${f(record!)}` : `Noch ${timed ? fmtSec(missing) : missing} bis zum Rekord`}
      </p>
    );
  }
  const ls = last ? setsOf(last, timed) : [];
  const lastTxt = ls.length > 1 ? (ls.every((x) => x === ls[0]) ? `${ls.length} × ${f(ls[0])}` : ls.map(f).join(' · ')) : ls.length ? f(ls[0]) : '';
  const parts = [lastTxt ? `Letztes Mal ${lastTxt}` : null, record !== undefined ? `Rekord ${f(record)}` : 'Noch kein Rekord'].filter(Boolean);
  return <p className={`text-center text-sm text-mute ${className}`}>{parts.join(' · ')}</p>;
}

/**
 * Große Zahl in der Mitte. Mit Ziel (geplanter Satz) oder Rekord (freier Satz) füllt sich ein Ring:
 * bei geplanten Sätzen bis zum Satz-Ziel, sonst bis zum Rekord. Ohne beides nur die Zahl.
 * `small` für die Ecke über dem Kamerabild.
 */
export function CountRing({ value, s, record, unit, pulseKey, small = false, text }: {
  value: number; s: SetsState; record?: number; unit: string; pulseKey?: number; small?: boolean; text?: string;
}) {
  const goal = s.plan ? s.goal : record;
  const toRecord = !s.plan && record !== undefined;
  const pct = goal ? Math.min(1, value / goal) : 0;
  const size = small ? 96 : 232;
  const R = small ? 42 : 104;
  const sw = small ? 6 : 12;
  const C = 2 * Math.PI * R;
  const shown = text ?? String(value);
  const fontSize = small ? (shown.length > 3 ? 26 : 36) : shown.length > 3 ? 76 : shown.length > 2 ? 96 : 120;
  const sub = s.plan ? `von ${s.timed ? fmtSec(s.goal!) : s.goal}` : toRecord ? (value > record! ? 'Neuer Rekord' : `Rekord ${s.timed ? fmtSec(record!) : record}`) : unit;
  return (
    <div className="relative grid place-items-center" style={{ width: size, height: size }}>
      {goal ? (
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="absolute inset-0" aria-hidden="true">
          <circle cx={size / 2} cy={size / 2} r={R} fill="none" stroke="rgb(var(--raised))" strokeWidth={sw} />
          <circle cx={size / 2} cy={size / 2} r={R} fill="none" stroke="rgb(var(--accent))" strokeWidth={sw} strokeLinecap="round"
            strokeDasharray={C} strokeDashoffset={C * (1 - pct)} transform={`rotate(-90 ${size / 2} ${size / 2})`}
            style={{ transition: 'stroke-dashoffset 200ms' }} />
          {toRecord && (
            // Pokal am Ende des Rings: dort liegt der Rekord
            <g transform={`translate(${size / 2} ${size / 2 - R})`}>
              <circle r={small ? 7 : 11} fill="rgb(var(--bg))" stroke="rgb(var(--accent))" strokeWidth="2" />
              <path d={small ? 'M-3 -3h6v2a3 3 0 0 1-6 0zM-1 1.5h2v1.5h1v1h-4v-1h1z' : 'M-5 -5h10v3.5a5 5 0 0 1-10 0zM-1.5 2.5h3v2h2v1.5h-7v-1.5h2z'} fill="rgb(var(--accent))" />
            </g>
          )}
        </svg>
      ) : null}
      <div className="relative text-center">
        <motion.div key={pulseKey} initial={{ scale: 1.25, color: '#FF6B35' }} animate={{ scale: 1, color: inkColor() }} transition={{ type: 'spring', stiffness: 400, damping: 15 }}
          className="font-display leading-none tabular-nums text-ink" style={{ fontSize }}>
          {shown}
        </motion.div>
        <div className={`${small ? 'text-[10px]' : 'mt-1 text-sm'} text-mute`}>{sub}</div>
      </div>
    </div>
  );
}

/** Ein Balken pro Satz: fertige zeigen ihre Zahl, der laufende füllt sich, kommende zeigen das Ziel */
export function SetProgress({ s, className = '' }: { s: SetsState; className?: string }) {
  if (!s.enabled) return null;
  const f = (x: number) => (s.timed ? fmtSec(x) : String(x));
  const nextNo = s.done.length + 1;
  const planned = s.plan ? Math.max(s.plan.sets, nextNo) : nextNo;
  const resting = s.rest.running;
  const title = s.plan ? (nextNo > s.plan.sets ? `Extra-Satz ${nextNo}` : `Satz ${nextNo} von ${s.plan.sets}`) : `Satz ${nextNo}`;
  return (
    <div className={`space-y-1.5 ${className}`}>
      <div className="flex items-baseline justify-between text-sm">
        <span className="font-semibold">{resting ? `${s.done.length} ${s.done.length === 1 ? 'Satz' : 'Sätze'} geschafft` : title}</span>
        {s.done.length > 0 && <span className="num text-xs text-mute">gesamt {f(s.total)}</span>}
      </div>
      {(s.plan || s.done.length > 0) && <div className="flex gap-1.5">
        {Array.from({ length: planned }, (_, i) => {
          const done = i < s.done.length;
          const cur = i === s.done.length && !resting;
          const tg = s.plan ? targetOf(s.plan, i) : 0;
          const fill = done ? 1 : cur && s.plan ? Math.min(1, s.current / tg) : 0;
          return (
            <div key={i} className="min-w-0 flex-1 space-y-1 text-center">
              <div className="h-1.5 overflow-hidden rounded-full bg-raised">
                <div className={`h-full rounded-full ${done ? 'bg-mute' : 'bg-neon'}`} style={{ width: `${fill * 100}%` }} />
              </div>
              <div className={`num truncate text-[11px] ${cur ? 'font-semibold text-ink' : 'text-mute'}`}>
                {done ? f(s.done[i]) : cur ? (s.plan ? `${f(s.current)} / ${f(tg)}` : f(s.current)) : s.plan ? f(tg) : ''}
              </div>
            </div>
          );
        })}
      </div>}
    </div>
  );
}

/**
 * Leiste unter der Zahl: Satz-Balken, Rekord-Zeile und die Knöpfe „Satz fertig“ und „Pause“.
 * `buttons={false}` z. B. wenn die Hosentasche gesperrt ist.
 */
export function SetBar({ a, s, record, last, dark = false, buttons = true }: { a: Activity; s: SetsState; record?: number; last?: Workout; dark?: boolean; buttons?: boolean }) {
  void a;
  return (
    <div className={`space-y-2.5 ${dark ? 'text-white' : ''}`}>
      <SetProgress s={s} />
      <RecordLine value={s.current} record={record} last={last} timed={s.timed} />
      {s.enabled && buttons && (
        <div className="grid grid-cols-2 gap-2">
          <button onClick={() => s.finishSet(!!s.plan)} disabled={s.current <= 0}
            className={`rounded-xl py-3 font-semibold disabled:opacity-40 ${dark ? 'bg-white/15' : 'bg-raised'}`}>Satz fertig</button>
          <button onClick={() => s.finishSet(true)} className="rounded-xl bg-hot py-3 font-semibold text-white">
            Pause {s.plan ? fmtSec(s.plan.rest) : fmtSec(DEFAULT_REST)}
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * Satzpause über den ganzen Bildschirm (unter der oberen Leiste): Uhr,
 * was als Nächstes kommt und −15 s / +15 s / Weiter. Zähler und Zähl-Knöpfe sind solange weg.
 * Gehört direkt in den Live-Bildschirm (nicht in einen Unterbereich), damit es alles überdeckt.
 */
export function RestScreen({ a, s }: { a: Activity; s: SetsState }) {
  const rest = s.rest;
  const { pick, setPick } = useRestPick(rest);
  if (!rest.running) return null;
  const playing = pick !== 'x';
  const f = (x: number) => (s.timed ? fmtSec(x) : String(x));
  const nextNo = s.done.length + 1;
  const what = s.timed ? a.name : a.unitLabel;
  const next = s.plan
    ? `${nextNo > s.plan.sets ? `Extra-Satz ${nextNo}` : `Satz ${nextNo} von ${s.plan.sets}`}, ${f(targetOf(s.plan, nextNo - 1))} ${what}`
    : `Satz ${nextNo}`;
  return (
    <div role="timer" aria-label="Pause"
      className="absolute inset-0 z-[25] flex flex-col bg-bg px-4 pt-[calc(max(env(safe-area-inset-top),12px)+64px)] pb-[max(env(safe-area-inset-bottom),16px)] text-ink">
      {playing ? (
        <div className="flex min-h-0 flex-1 flex-col gap-2">
          <div className="flex items-end justify-between gap-3">
            <div>
              <p className="text-xs text-mute">Pause</p>
              <div className="num font-display text-5xl leading-none text-neon">{fmtClock(rest.left)}</div>
            </div>
            <p className="pb-1 text-right text-sm font-semibold">Als Nächstes:<br /><span className="font-normal text-mute">{next}</span></p>
          </div>
          {pick ? <RestGame rest={rest} id={pick} className="min-h-0 flex-1 rounded-2xl" />
            : <RestPicker onPick={setPick} className="my-auto" />}
        </div>
      ) : (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
        <p className="text-sm text-mute">Pause</p>
        <div className="num font-display text-[7rem] leading-none text-neon">{fmtClock(rest.left)}</div>
        <SetProgress s={s} className="w-full max-w-xs" />
        <p className="font-semibold">Als Nächstes: {next}</p>
      </div>
      )}
      <div className="space-y-2">
        <div className="grid grid-cols-3 gap-2">
          <button onClick={() => rest.add(-REST_STEP)} className="rounded-xl bg-raised py-3.5 font-semibold">−{REST_STEP} s</button>
          <button onClick={() => rest.add(REST_STEP)} className="rounded-xl bg-raised py-3.5 font-semibold">+{REST_STEP} s</button>
          <button onClick={rest.skip} className="rounded-xl bg-hot py-3.5 font-semibold text-white">Weiter</button>
        </div>
      </div>
    </div>
  );
}
