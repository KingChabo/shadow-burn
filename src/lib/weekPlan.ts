import { addDays, daysBetween } from './date';

/**
 * Wochenplan: feste Trainingstage (mindestens 2), der Rest sind Ruhetage.
 * Ein Eintrag pro Wochentag, Montag zuerst: null = Ruhetag,
 * sonst Trainingstag mit dem, was dran ist ('' = nichts festgelegt).
 */
export type PlanDays = (string | null)[];

export interface WeekPlan {
  /** false = "jeden Tag" (Plan bleibt gespeichert, falls man zurückwechselt) */
  on: boolean;
  days: PlanDays;
  /** Verschobene Tage, gelten nur für die Woche ab `start` (Montag) */
  week?: { start: string; days: PlanDays } | null;
}

export const MIN_TRAINING_DAYS = 2;
export const MAX_FOCUS = 24;
export const WEEKDAYS = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];
export const WEEKDAYS_LONG = ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag'];
/** Vorschläge für "was ist dran" (frei änderbar) */
export const FOCUS_IDEAS = ['Ganzkörper', 'Oberkörper', 'Beine', 'Brust', 'Rücken', 'Arme', 'Bauch', 'Laufen', 'Ausdauer'];

/** Vorschlag beim ersten Öffnen: Mo / Mi / Fr */
export const defaultPlanDays = (): PlanDays => ['', null, '', null, '', null, null];

/** 0 = Montag … 6 = Sonntag */
export function weekdayOf(day: string): number {
  // 2024-01-01 war ein Montag
  return ((daysBetween('2024-01-01', day) % 7) + 7) % 7;
}

export function mondayOf(day: string): string {
  return addDays(day, -weekdayOf(day));
}

export const trainingCount = (days: PlanDays) => days.filter((d) => d !== null).length;

/** Plan säubern (aus Speicher / Eingabe): genau 7 Tage, Texte gekürzt */
export function cleanDays(raw: unknown): PlanDays {
  const arr = Array.isArray(raw) ? raw : [];
  return Array.from({ length: 7 }, (_, i) => {
    const v = arr[i];
    return typeof v === 'string' ? v.trim().slice(0, MAX_FOCUS) : null;
  });
}

export function validDays(days: PlanDays): boolean {
  return days.length === 7 && trainingCount(days) >= MIN_TRAINING_DAYS;
}

export function planActive(plan: WeekPlan | null | undefined): plan is WeekPlan {
  return !!plan && plan.on && validDays(plan.days);
}

/** Die Tage, die in der Woche von `day` gelten (mit Verschiebungen) */
export function daysForWeek(plan: WeekPlan, day: string): PlanDays {
  const start = mondayOf(day);
  return plan.week && plan.week.start === start && plan.week.days.length === 7 ? plan.week.days : plan.days;
}

/** Was an `day` dran ist: null = Ruhetag, sonst Trainingstag (Text kann leer sein) */
export function entryFor(plan: WeekPlan, day: string): string | null {
  return daysForWeek(plan, day)[weekdayOf(day)];
}

export function isTrainingDay(plan: WeekPlan | null | undefined, day: string): boolean {
  if (!planActive(plan)) return true; // "jeden Tag"
  return entryFor(plan, day) !== null;
}

export interface MoveCheck { ok: boolean; reason?: string }

/**
 * Darf der Trainingstag `from` auf `to` verschoben werden?
 * Nur innerhalb der laufenden Woche, nur auf heute oder später, nur auf einen Ruhetag.
 * `doneToday`: heute wurde schon für die Streak trainiert.
 */
export function canMove(plan: WeekPlan, from: string, to: string, today: string, doneToday: boolean): MoveCheck {
  if (!planActive(plan)) return { ok: false, reason: 'Kein Wochenplan aktiv.' };
  const start = mondayOf(today);
  if (mondayOf(from) !== start || mondayOf(to) !== start) return { ok: false, reason: 'Nur innerhalb dieser Woche.' };
  if (from < today || to < today) return { ok: false, reason: 'Vergangene Tage lassen sich nicht mehr ändern.' };
  if (from === to) return { ok: false, reason: 'Gleicher Tag.' };
  if (entryFor(plan, from) === null) return { ok: false, reason: 'Das ist kein Trainingstag.' };
  if (entryFor(plan, to) !== null) return { ok: false, reason: 'An dem Tag trainierst du schon.' };
  if (from === today && doneToday) return { ok: false, reason: 'Heute hast du schon trainiert.' };
  return { ok: true };
}

/** Trainingstag verschieben (nur für diese Woche). Vorher canMove prüfen. */
export function movePlanDay(plan: WeekPlan, from: string, to: string): WeekPlan {
  const days = [...daysForWeek(plan, from)];
  days[weekdayOf(to)] = days[weekdayOf(from)];
  days[weekdayOf(from)] = null;
  return { ...plan, week: { start: mondayOf(from), days } };
}

/** Ist diese Woche etwas verschoben? */
export function hasMoves(plan: WeekPlan, today: string): boolean {
  const w = daysForWeek(plan, today);
  return w !== plan.days && w.some((d, i) => d !== plan.days[i]);
}

/** Die 7 Tage der laufenden Woche mit Datum und Eintrag */
export function weekView(plan: WeekPlan, today: string): { day: string; wd: number; entry: string | null }[] {
  const start = mondayOf(today);
  const days = daysForWeek(plan, today);
  return days.map((entry, wd) => ({ day: addDays(start, wd), wd, entry }));
}
