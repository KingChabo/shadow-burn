import type { ActivityId, MuscleId } from '../data/activities';
import { ACT } from '../data/activities';

export interface Quest { id: string; activityId: ActivityId; target: number; metric: 'reps' | 'seconds' | 'km'; label: string }

const POOL: Omit<Quest, 'id' | 'label'>[] = [
  { activityId: 'pushup', target: 30, metric: 'reps' },
  { activityId: 'pushup', target: 50, metric: 'reps' },
  { activityId: 'situp', target: 40, metric: 'reps' },
  { activityId: 'situp', target: 25, metric: 'reps' },
  { activityId: 'squat', target: 50, metric: 'reps' },
  { activityId: 'lunge', target: 30, metric: 'reps' },
  { activityId: 'burpee', target: 15, metric: 'reps' },
  { activityId: 'crunch', target: 50, metric: 'reps' },
  { activityId: 'jacks', target: 80, metric: 'reps' },
  { activityId: 'mountain', target: 60, metric: 'reps' },
  { activityId: 'plank', target: 60, metric: 'seconds' },
  { activityId: 'plank', target: 120, metric: 'seconds' },
  { activityId: 'sideplank', target: 45, metric: 'seconds' },
  { activityId: 'jog', target: 2, metric: 'km' },
  { activityId: 'walk', target: 3, metric: 'km' },
  { activityId: 'pullup', target: 10, metric: 'reps' },
];

function hash(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
function mulberry32(a: number) {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function label(q: Omit<Quest, 'id' | 'label'>): string {
  const name = ACT[q.activityId].name;
  if (q.metric === 'seconds') return q.target >= 60 ? `${q.target / 60} Min. ${name}` : `${q.target} s ${name}`;
  if (q.metric === 'km') return `${q.target} km ${name}`;
  return `${q.target} ${name}`;
}

/** Ein Auftrag pro Tag darf getauscht werden (z. B. Burpees bei Rückenproblemen) */
export interface QuestSwap { day: string; index: number }

/** Täglich 3 Aufträge, deterministisch aus dem Datum (keine doppelte Übung). Optional ist einer getauscht. */
export function questsFor(day: string, swap?: QuestSwap | null, stored?: DayQuests | null): Quest[] {
  // Für heute gespeicherte Auswahl (nach Erholung der Muskeln) hat Vorrang
  const list = stored && stored.day === day && stored.list.length >= 3 ? stored.list : legacyList(day);
  const picked = list.slice(0, 4);
  if (swap && swap.day === day && picked.length === 4) picked.splice(swap.index, 1, picked.pop()!);
  return picked.slice(0, 3);
}

/** Alte Auswahl nur aus dem Datum: 4 Aufträge (der vierte ist der Ersatz beim Tauschen) */
function legacyList(day: string): Quest[] {
  const rnd = mulberry32(hash('phantom-' + day));
  const picked: Quest[] = [];
  const pool = [...POOL];
  while (picked.length < 4 && pool.length) {
    const i = Math.floor(rnd() * pool.length);
    const q = pool.splice(i, 1)[0];
    if (picked.some((p) => p.activityId === q.activityId)) continue;
    picked.push(make(day, q));
  }
  return picked;
}

const make = (day: string, q: Omit<Quest, 'id' | 'label'>): Quest => ({ ...q, id: `${day}:${q.activityId}:${q.target}`, label: label(q) });

/** Für einen Tag festgelegte Aufträge (4 Stück, der vierte ist der Ersatz beim Tauschen) */
export interface DayQuests { day: string; list: Quest[] }

/** Ab so viel Erholung (0–1) gilt ein Muskel als bereit für einen Auftrag */
export const QUEST_READY = 0.9;

/**
 * Aufträge für erholte Muskeln: Übungen, deren Hauptmuskeln alle erholt sind, kommen zuerst
 * (Reihenfolge zufällig aus dem Datum). Reicht das nicht, folgen die am besten erholten.
 * rec = Erholung je Muskel (0 = gerade trainiert, 1 = erholt), siehe muscles.ts.
 * pool = mögliche Aufträge (Standard: feste Liste; sonst passend zum Fitness-Stand, siehe fitness.ts).
 */
export function pickQuests(day: string, rec: Partial<Record<MuscleId, number>>, pool: Omit<Quest, 'id' | 'label'>[] = POOL): DayQuests {
  const rnd = mulberry32(hash('phantom-rec-' + day));
  const ready = (q: Omit<Quest, 'id' | 'label'>) => Math.min(...ACT[q.activityId].muscles.primary.map((m) => rec[m] ?? 1));
  const order = pool.map((q) => ({ q, r: ready(q), k: rnd() }))
    .sort((a, b) => (Number(b.r >= QUEST_READY) - Number(a.r >= QUEST_READY)) || (a.r >= QUEST_READY ? a.k - b.k : b.r - a.r));
  const list: Quest[] = [];
  for (const { q } of order) {
    if (list.length >= 4) break;
    if (list.some((p) => p.activityId === q.activityId)) continue;
    list.push(make(day, q));
  }
  return { day, list };
}

export interface WorkoutLike { activityId: ActivityId; reps: number; seconds: number; km: number }

export function questProgress(q: Quest, todays: WorkoutLike[]): number {
  let sum = 0;
  for (const w of todays) if (w.activityId === q.activityId) sum += q.metric === 'reps' ? w.reps : q.metric === 'seconds' ? w.seconds : w.km;
  return sum;
}
