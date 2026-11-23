import type { ActivityId } from '../data/activities';
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
export function questsFor(day: string, swap?: QuestSwap | null): Quest[] {
  const rnd = mulberry32(hash('phantom-' + day));
  const picked: Quest[] = [];
  const pool = [...POOL];
  const want = swap && swap.day === day ? 4 : 3;
  while (picked.length < want && pool.length) {
    const i = Math.floor(rnd() * pool.length);
    const q = pool.splice(i, 1)[0];
    if (picked.some((p) => p.activityId === q.activityId)) continue;
    picked.push({ ...q, id: `${day}:${q.activityId}:${q.target}`, label: label(q) });
  }
  if (want === 4 && picked.length === 4) picked.splice(swap!.index, 1, picked.pop()!);
  return picked.slice(0, 3);
}

export interface WorkoutLike { activityId: ActivityId; reps: number; seconds: number; km: number }

export function questProgress(q: Quest, todays: WorkoutLike[]): number {
  let sum = 0;
  for (const w of todays) if (w.activityId === q.activityId) sum += q.metric === 'reps' ? w.reps : q.metric === 'seconds' ? w.seconds : w.km;
  return sum;
}
