import type { Activity, ActivityId, Mode } from '../data/activities';
import type { Workout } from './db';

/**
 * Sätze für Übungen ohne Gerät und an Geräten.
 * „Geplant“: Anzahl, Ziel (Wdh. oder Sekunden) und Pause vorher festlegen, nach jedem Satz startet die Pause von selbst.
 * „Frei“: einfach trainieren, „Satz fertig“ antippen; Pause per Knopf (Start 1:30).
 */
export type SetMode = 'free' | 'plan';

export interface SetPlan {
  sets: number;
  /** Ziel je Satz: Wiederholungen bzw. Sekunden (Plank). Bei `targets` der größte Wert. */
  target: number;
  /** Eigenes Ziel für jeden Satz (Länge = sets), nur wenn die Sätze verschieden sind */
  targets?: number[];
  /** Pause zwischen den Sätzen in Sekunden */
  rest: number;
}

/** Start der Pause im freien Modus und Standard bei geplanten Sätzen */
export const DEFAULT_REST = 90;
/** Schritt für „Pause verlängern/kürzen“ */
export const REST_STEP = 15;
export const MIN_REST = 15;
export const MAX_REST = 600;
export const MAX_PLAN_SETS = 10;

/** Was die Live-Seite bekommt: frei oder ein Plan */
export type LiveSets = { mode: 'free' } | { mode: 'plan'; plan: SetPlan };

/** Sätze gibt es bei Wiederholungs- und Halte-Übungen, nicht bei Strecken oder Sportarten nach Dauer */
export function supportsSets(a: Activity, mode?: Mode): boolean {
  if (a.perMin || a.unit === 'distance') return false;
  return !mode || (mode !== 'distance' && mode !== 'duration');
}

export const clampRest = (s: number) => Math.min(MAX_REST, Math.max(MIN_REST, Math.round(s)));

/** Startziel je Satz, wenn es noch keinen Verlauf gibt (Wdh., bei Halte-Übungen Sekunden). Sonst 10 bzw. 30 s. */
export const DEFAULT_TARGET: Partial<Record<ActivityId, number>> = {
  jumprope: 50, jacks: 20, highknees: 20, buttkicks: 20, mountain: 20, skater: 12,
  russiantwist: 20, flutterkick: 20, bicyclecrunch: 20, crunch: 15, calfraise: 15,
  pullup: 5, chinup: 5, dip: 8, burpee: 8, tuckjump: 8, boxjump: 8, pikepush: 8, diamondpush: 8,
  wallsit: 30, deadhang: 20, hollowhold: 20,
};

export function cleanPlan(p: Partial<SetPlan> | undefined, a: Activity): SetPlan {
  const timed = a.unit === 'time';
  const max = timed ? 600 : 200;
  const clampT = (x: number) => Math.min(max, Math.max(1, Math.round(x)));
  const t = Math.round(Number(p?.target) || 0);
  const sets = Math.min(MAX_PLAN_SETS, Math.max(1, Math.round(Number(p?.sets) || 3)));
  const target = clampT(t || DEFAULT_TARGET[a.id] || (timed ? 30 : 10));
  const plan: SetPlan = { sets, target, rest: clampRest(Number(p?.rest) || DEFAULT_REST) };
  const raw = Array.isArray(p?.targets) ? p!.targets.map(Number).filter((x) => x > 0) : [];
  if (raw.length) {
    // Auf die Satzanzahl bringen: fehlende Sätze bekommen das Ziel des letzten
    const list = Array.from({ length: sets }, (_, i) => clampT(raw[Math.min(i, raw.length - 1)]));
    if (list.some((x) => x !== list[0])) { plan.targets = list; plan.target = Math.max(...list); }
    else plan.target = list[0];
  }
  return plan;
}

/** Ziel für Satz i (ab 0). Extra-Sätze nach dem Plan nehmen das Ziel des letzten Satzes. */
export function targetOf(p: SetPlan, i: number): number {
  const t = p.targets;
  return t && t.length ? t[Math.min(Math.max(0, i), t.length - 1)] : p.target;
}

/** Kurztext für den Plan: „3 × 10“ oder „12 · 10 · 8“ */
export function planText(p: SetPlan, timed: boolean): string {
  const f = (x: number) => (timed ? fmtSec(x) : String(x));
  return p.targets ? p.targets.map(f).join(' · ') : `${p.sets} × ${f(p.target)}`;
}

/**
 * Vorschlag für den Plan: gespeicherter Plan, sonst aus dem letzten Training
 * (so viele Sätze wie letztes Mal, Ziel = bester Satz), sonst 3 Sätze mit dem Startziel der Übung
 * (DEFAULT_TARGET, z. B. Seilspringen 50, Klimmzüge 5; sonst 10 bzw. 30 s).
 */
export function suggestPlan(a: Activity, saved?: Partial<SetPlan>, last?: Workout): SetPlan {
  if (saved) return cleanPlan(saved, a);
  const s = last ? setsOf(last) : [];
  if (s.length) return cleanPlan({ sets: Math.max(s.length, 1), target: Math.max(...s) }, a);
  return cleanPlan(undefined, a);
}

/** Sätze eines gespeicherten Trainings; ältere Einträge ohne Sätze zählen als ein Satz */
export function setsOf(w: Pick<Workout, 'sets' | 'reps' | 'seconds'> & { activityId?: string }, timed = false): number[] {
  if (w.sets && w.sets.length) return w.sets;
  const v = timed ? w.seconds : w.reps;
  return v > 0 ? [v] : [];
}

/** Bester Satz (meiste Wdh. bzw. längste Zeit am Stück) */
export function bestOfSets(sets: number[] | undefined, total: number): number {
  return sets && sets.length ? Math.max(0, ...sets) : total;
}

/** Nur gültige Sätze (> 0), ganze Zahlen */
export function cleanSetList(sets: number[] | undefined): number[] | undefined {
  if (!sets) return undefined;
  const s = sets.map((x) => Math.max(0, Math.round(Number(x) || 0))).filter((x) => x > 0);
  return s.length > 1 ? s : undefined;
}

export function fmtSec(s: number): string {
  return s >= 60 ? `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}` : `${s} s`;
}

/** Kurztext für „Letztes Mal“, z. B. „3 Sätze: 12 · 10 · 8“ oder „25 Liegestütze“ */
export function lastText(w: Workout, a: Activity): string {
  const timed = a.unit === 'time';
  const s = setsOf(w, timed);
  const f = (x: number) => (timed ? fmtSec(x) : String(x));
  if (s.length > 1) return `${s.length} Sätze: ${s.map(f).join(' · ')}`;
  return timed ? fmtSec(w.seconds) : `${w.reps} ${a.unitLabel}`;
}

/** Rekord-Text für eine Übung ohne Gerät (am Stück) */
export function recordText(rec: { reps?: number; seconds?: number } | undefined, a: Activity): string | null {
  if (!rec) return null;
  if (a.unit === 'time') return rec.seconds ? `${fmtSec(rec.seconds)} am Stück` : null;
  return rec.reps ? `${rec.reps} ${a.unitLabel} am Stück` : null;
}
