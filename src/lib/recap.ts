import { ACT, type MuscleId } from '../data/activities';
import { GYM_EXERCISES } from '../data/gym';
import { addDays } from './date';
import type { GymLog, Workout } from './db';
import { hitsOf, muscleWork, muscleName } from './muscles';

/**
 * Monatsrückblick: alles aus den gespeicherten Trainings eines Kalendermonats.
 * Monat als "YYYY-MM".
 */

export const monthOf = (day: string) => day.slice(0, 7);

export function prevMonth(month: string): string {
  const [y, m] = month.split('-').map(Number);
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`;
}

export function monthName(month: string, withYear = true): string {
  const [y, m] = month.split('-').map(Number);
  return new Date(y, m - 1, 15).toLocaleDateString('de-DE', withYear ? { month: 'long', year: 'numeric' } : { month: 'long' });
}

export function daysInMonth(month: string): number {
  const [y, m] = month.split('-').map(Number);
  return new Date(y, m, 0).getDate();
}

export interface Recap {
  month: string;
  sessions: number;
  activeDays: number;
  days: number;
  points: number;
  minutes: number;
  reps: number;
  km: number;
  kg: number;
  /** Längste Serie aktiver Tage in diesem Monat */
  bestRun: number;
  records: number;
  gems: number;
  /** Lieblingsübung: am häufigsten gemacht */
  top: { name: string; count: number } | null;
  /** Bester Tag nach Punkten */
  bestDay: { day: string; points: number } | null;
  /** Meist trainierte Muskeln */
  muscles: { id: MuscleId; name: string; share: number }[];
  /** Punkte je Woche des Monats (für ein kleines Diagramm) */
  weeks: number[];
  /** Vergleich zum Vormonat in Prozent (null = kein Vormonat) */
  vsPrev: number | null;
  /** Wochentag mit den meisten Trainings */
  favWeekday: string | null;
}

const WEEKDAYS = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];

export function buildRecap(month: string, allWorkouts: Workout[], allGym: GymLog[]): Recap {
  const w = allWorkouts.filter((x) => monthOf(x.day) === month);
  const l = allGym.filter((x) => monthOf(x.day) === month);
  const perDay = new Map<string, number>();
  for (const x of [...w, ...l]) perDay.set(x.day, (perDay.get(x.day) ?? 0) + x.points);

  const days = daysInMonth(month);
  let run = 0, bestRun = 0;
  for (let d = 1; d <= days; d++) {
    const key = `${month}-${String(d).padStart(2, '0')}`;
    if (perDay.has(key)) { run++; bestRun = Math.max(bestRun, run); } else run = 0;
  }

  const count = new Map<string, number>();
  for (const x of w) { const n = ACT[x.activityId]?.name ?? x.activityId; count.set(n, (count.get(n) ?? 0) + 1); }
  for (const x of l) { const n = GYM_EXERCISES.find((e) => e.id === x.exerciseId)?.name ?? x.name; count.set(n, (count.get(n) ?? 0) + 1); }
  const topE = [...count.entries()].sort((a, b) => b[1] - a[1])[0];

  const best = [...perDay.entries()].sort((a, b) => b[1] - a[1])[0];

  const work = muscleWork(hitsOf(w, l));
  const sum = Object.values(work).reduce((s, v) => s + v, 0) || 1;
  const muscles = (Object.entries(work) as [MuscleId, number][])
    .filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]).slice(0, 3)
    .map(([id, v]) => ({ id, name: muscleName(id), share: v / sum }));

  const weeks = [0, 0, 0, 0, 0];
  for (const [day, p] of perDay) weeks[Math.min(4, Math.floor((Number(day.slice(8)) - 1) / 7))] += p;

  const points = [...perDay.values()].reduce((s, v) => s + v, 0);
  const prev = prevMonth(month);
  const prevPoints = [...allWorkouts, ...allGym].filter((x) => monthOf(x.day) === prev).reduce((s, x) => s + x.points, 0);

  const wd = [0, 0, 0, 0, 0, 0, 0];
  for (const x of [...w, ...l]) wd[new Date(x.day + 'T12:00').getDay()]++;
  const maxWd = Math.max(...wd);

  const seconds = w.reduce((s, x) => s + (x.seconds || Math.max(0, (x.end - x.start) / 1000)), 0)
    + l.reduce((s, x) => s + Math.max(0, (x.end - x.start) / 1000), 0);

  return {
    month,
    sessions: w.length + l.length,
    activeDays: perDay.size,
    days,
    points,
    minutes: Math.round(seconds / 60),
    reps: w.reduce((s, x) => s + (x.reps || 0), 0) + l.reduce((s, x) => s + x.sets.filter((z) => !z.warmup).reduce((a, z) => a + z.reps, 0), 0),
    km: Math.round(w.reduce((s, x) => s + (x.km || 0), 0) * 10) / 10,
    kg: Math.round(l.reduce((s, x) => s + (x.volume || 0), 0)),
    bestRun,
    records: w.filter((x) => x.isRecord).length + l.filter((x) => x.isRecord).length,
    gems: w.reduce((s, x) => s + (x.gems || 0), 0) + l.reduce((s, x) => s + (x.gems || 0), 0),
    top: topE ? { name: topE[0], count: topE[1] } : null,
    bestDay: best ? { day: best[0], points: best[1] } : null,
    muscles,
    weeks: weeks.slice(0, Math.ceil(days / 7)),
    vsPrev: prevPoints > 0 ? Math.round(((points - prevPoints) / prevPoints) * 100) : null,
    favWeekday: maxWd > 0 ? WEEKDAYS[wd.indexOf(maxWd)] : null,
  };
}

/** Alle Monate mit Training, neueste zuerst. Der laufende Monat ist dabei (als "bisher"). */
export function recapMonths(allWorkouts: Workout[], allGym: GymLog[]): string[] {
  return [...new Set([...allWorkouts, ...allGym].map((x) => monthOf(x.day)))].sort().reverse();
}

/**
 * Banner auf Home: In den ersten 7 Tagen eines Monats wird der Rückblick des Vormonats angeboten,
 * bis man ihn angesehen hat. Liefert den Monat oder null.
 */
export function pendingRecap(today: string, seen: string | null, months: string[]): string | null {
  if (Number(today.slice(8)) > 7) return null;
  const last = prevMonth(monthOf(today));
  if (seen === last || !months.includes(last)) return null;
  return last;
}

/** Erster Tag des Monats (für Tests und Anzeige) */
export const firstDay = (month: string) => `${month}-01`;
export const lastDay = (month: string) => addDays(`${month}-01`, daysInMonth(month) - 1);
