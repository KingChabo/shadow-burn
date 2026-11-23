import { ACT, type MuscleId } from '../data/activities';
import { GYM_EXERCISES, GROUP_MUSCLES, type GymGroup } from '../data/gym';
import type { GymLog, WeightEntry, Workout } from './db';
import { addDays, daysBetween } from './date';
import { weekKey } from './leaderboard';

// Reine Rechenfunktionen für die Statistik-Seite (ohne Datenbank, gut testbar).

export type Slice = { key: string; label: string; value: number; color: string };

export const CAT_COLORS: Record<string, string> = {
  kraft: '#FF6B35', core: '#F5A524', cardio: '#4CB782', ausdauer: '#8FA3B8', geraete: '#9C86F0', sport: '#E5484D',
};
const CAT_LABEL: Record<string, string> = { kraft: 'Kraft', core: 'Core', cardio: 'Cardio', ausdauer: 'Ausdauer', sport: 'Sportarten', geraete: 'Geräte' };

export const BODY_PARTS: { id: string; label: string; color: string; muscles: MuscleId[] }[] = [
  { id: 'brust', label: 'Brust', color: '#FF6B35', muscles: ['chest'] },
  { id: 'ruecken', label: 'Rücken', color: '#9C86F0', muscles: ['lats', 'traps', 'lowerback'] },
  { id: 'schultern', label: 'Schultern', color: '#F5A524', muscles: ['shoulders'] },
  { id: 'arme', label: 'Arme', color: '#E8D5B0', muscles: ['biceps', 'triceps', 'forearms'] },
  { id: 'bauch', label: 'Bauch', color: '#4CB782', muscles: ['abs', 'obliques', 'hipflexors'] },
  { id: 'beine', label: 'Beine', color: '#8FA3B8', muscles: ['quads', 'hamstrings', 'glutes', 'calves'] },
];

export interface StatsInput {
  workouts: Workout[];
  gymLogs: GymLog[];
  weights: WeightEntry[];
  today: string;
  /** Zeitraum in Tagen (inkl. heute); null = alles */
  rangeDays: number | null;
}

export function inRange(day: string, today: string, rangeDays: number | null): boolean {
  if (day > today) return false;
  if (rangeDays === null) return true;
  return daysBetween(day, today) < rangeDays;
}

export function filterRange(i: StatsInput) {
  return {
    workouts: i.workouts.filter((w) => inRange(w.day, i.today, i.rangeDays)),
    gymLogs: i.gymLogs.filter((l) => inRange(l.day, i.today, i.rangeDays)),
    weights: i.weights.filter((w) => inRange(w.day, i.today, i.rangeDays)).sort((a, b) => (a.day < b.day ? -1 : 1)),
  };
}

export interface Totals { sessions: number; points: number; activeDays: number; volume: number; sets: number }

export function totals(workouts: Workout[], gymLogs: GymLog[]): Totals {
  const days = new Set([...workouts.map((w) => w.day), ...gymLogs.map((l) => l.day)]);
  return {
    sessions: workouts.length + gymLogs.length,
    points: workouts.reduce((s, w) => s + w.points, 0) + gymLogs.reduce((s, l) => s + l.points, 0),
    activeDays: days.size,
    volume: Math.round(gymLogs.reduce((s, l) => s + l.volume, 0)),
    sets: gymLogs.reduce((s, l) => s + l.sets.filter((x) => !x.warmup).length, 0),
  };
}

/** Punkte nach Kategorie (Kraft, Core, Cardio, Ausdauer, Geräte) */
export function pointsByCategory(workouts: Workout[], gymLogs: GymLog[]): Slice[] {
  const m: Record<string, number> = {};
  for (const w of workouts) {
    const cat = ACT[w.activityId]?.category ?? 'kraft';
    m[cat] = (m[cat] ?? 0) + w.points;
  }
  const g = gymLogs.reduce((s, l) => s + l.points, 0);
  if (g) m.geraete = g;
  return Object.keys(CAT_LABEL)
    .filter((k) => (m[k] ?? 0) > 0)
    .map((k) => ({ key: k, label: CAT_LABEL[k], value: m[k], color: CAT_COLORS[k] }));
}

function gymMuscles(l: GymLog): { primary: MuscleId[]; secondary: MuscleId[] } {
  return GYM_EXERCISES.find((e) => e.id === l.exerciseId)?.muscles ?? GROUP_MUSCLES[l.group as GymGroup] ?? { primary: [], secondary: [] };
}

/**
 * Welche Körperpartie wie oft trainiert wurde.
 * Jedes Training zählt 1 für Hauptmuskeln und ½ für Hilfsmuskeln (je Körperpartie höchstens einmal).
 */
export function bodyPartShare(workouts: Workout[], gymLogs: GymLog[]): Slice[] {
  const m: Record<string, number> = {};
  const add = (mus: { primary: MuscleId[]; secondary: MuscleId[] }, weight = 1) => {
    const score: Record<string, number> = {};
    for (const p of BODY_PARTS) {
      if (mus.primary.some((x) => p.muscles.includes(x))) score[p.id] = 1;
      else if (mus.secondary.some((x) => p.muscles.includes(x))) score[p.id] = 0.5;
    }
    for (const [k, v] of Object.entries(score)) m[k] = (m[k] ?? 0) + v * weight;
  };
  for (const w of workouts) { const a = ACT[w.activityId]; if (a) add(a.muscles); }
  // Geräte: nach Arbeitssätzen gewichtet (5 Sätze Bankdrücken zählen mehr als 1 Satz Seitheben)
  for (const l of gymLogs) add(gymMuscles(l), Math.max(1, l.sets.filter((s) => !s.warmup).length));
  return BODY_PARTS.filter((p) => (m[p.id] ?? 0) > 0).map((p) => ({ key: p.id, label: p.label, value: m[p.id], color: p.color }));
}

/** Punkte je Tag (für den Aktivitätskalender) */
export function pointsPerDay(workouts: Workout[], gymLogs: GymLog[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const x of [...workouts, ...gymLogs]) m.set(x.day, (m.get(x.day) ?? 0) + x.points);
  return m;
}

/** Kalender: Wochen (Mo–So) als Spalten, die letzten `weeks` Wochen bis heute. */
export function calendarWeeks(today: string, weeks: number): string[][] {
  const lastMonday = weekKey(today);
  const first = addDays(lastMonday, -(weeks - 1) * 7);
  return Array.from({ length: weeks }, (_, w) => Array.from({ length: 7 }, (_, d) => addDays(first, w * 7 + d)));
}

/** Punkte pro Woche, älteste zuerst */
export function weeklyPoints(perDay: Map<string, number>, today: string, weeks: number): { week: string; points: number }[] {
  return calendarWeeks(today, weeks).map((days) => ({
    week: days[0],
    points: days.reduce((s, d) => s + (d <= today ? perDay.get(d) ?? 0 : 0), 0),
  }));
}

/** Aktuelle und längste Serie aktiver Tage (rein aus dem Verlauf, ohne Streak-Locks) */
export function activeRuns(perDay: Map<string, number>, today: string): { current: number; longest: number } {
  const days = [...perDay.keys()].filter((d) => d <= today).sort();
  let longest = 0, run = 0, prev: string | null = null;
  for (const d of days) {
    run = prev && daysBetween(prev, d) === 1 ? run + 1 : 1;
    longest = Math.max(longest, run);
    prev = d;
  }
  let current = 0;
  let d = perDay.has(today) ? today : addDays(today, -1);
  while (perDay.has(d)) { current++; d = addDays(d, -1); }
  return { current, longest };
}

/** Trainings je Wochentag (Mo = 0) */
export function weekdayCounts(workouts: Workout[], gymLogs: GymLog[]): number[] {
  const c = [0, 0, 0, 0, 0, 0, 0];
  const seen = new Set<string>();
  for (const x of [...workouts, ...gymLogs]) {
    if (seen.has(x.day)) continue;
    seen.add(x.day);
    const wd = (new Date(x.day + 'T12:00').getDay() + 6) % 7;
    c[wd]++;
  }
  return c;
}

export interface WeightStats { first: WeightEntry; last: WeightEntry; change: number; min: number; max: number }

export function weightStats(weights: WeightEntry[]): WeightStats | null {
  if (weights.length === 0) return null;
  const s = [...weights].sort((a, b) => (a.day < b.day ? -1 : 1));
  const kgs = s.map((w) => w.kg);
  return {
    first: s[0], last: s[s.length - 1],
    change: Math.round((s[s.length - 1].kg - s[0].kg) * 10) / 10,
    min: Math.min(...kgs), max: Math.max(...kgs),
  };
}

export interface ExerciseProgress { exerciseId: string; name: string; sessions: number; bestKg: number; bestReps: number; lastDay: string; series: { day: string; kg: number }[] }

/** Pro Geräteübung: schwerstes Gewicht je Training (für den Kraftverlauf) */
export function exerciseProgress(gymLogs: GymLog[]): ExerciseProgress[] {
  const m = new Map<string, ExerciseProgress>();
  for (const l of [...gymLogs].sort((a, b) => a.start - b.start)) {
    const top = l.sets.filter((s) => !s.warmup).reduce((b, s) => (s.kg > b.kg || (s.kg === b.kg && s.reps > b.reps) ? s : b), { reps: 0, kg: 0 });
    const p = m.get(l.exerciseId) ?? { exerciseId: l.exerciseId, name: l.name, sessions: 0, bestKg: 0, bestReps: 0, lastDay: l.day, series: [] };
    // Mehrere Einträge am selben Tag sind eine Einheit: ein Punkt pro Tag mit dem schwersten Gewicht
    const lastPt = p.series[p.series.length - 1];
    if (lastPt && lastPt.day === l.day) lastPt.kg = Math.max(lastPt.kg, top.kg);
    else { p.sessions++; p.series.push({ day: l.day, kg: top.kg }); }
    p.name = l.name;
    p.lastDay = l.day;
    if (top.kg > p.bestKg || (top.kg === p.bestKg && top.reps > p.bestReps)) { p.bestKg = top.kg; p.bestReps = top.reps; }
    m.set(l.exerciseId, p);
  }
  return [...m.values()].sort((a, b) => b.sessions - a.sessions || (a.name < b.name ? -1 : 1));
}
