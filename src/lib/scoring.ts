import { ACT, distanceLimits, type Activity, type ActivityId } from '../data/activities';

/**
 * Basis-Punkte pro Einheit: Wiederholung, 5 Sekunden (Halten), Minute (Sportarten mit perMin) oder km.
 * Neue Werte (21.11.2026) sind an der Anstrengung (MET-Werte, Compendium of Physical Activities) ausgerichtet:
 * etwa 0,17 P pro MET und Minute, so wie Joggen (10 P/km, ca. 6 min/km, MET ≈ 10).
 */
export const RATE: Record<ActivityId, number> = {
  pushup: 2,
  situp: 1,
  crunch: 1,
  pullup: 5,
  dip: 3,
  squat: 1.5,
  lunge: 1.5,
  burpee: 4,
  jacks: 0.5,
  mountain: 0.5,
  highknees: 0.5,
  jumprope: 0.3,
  plank: 1, // pro 5 s
  sideplank: 1, // pro 5 s
  jog: 10, // pro km (+ Pace-Bonus)
  sprint: 10,
  walk: 5,
  bike: 3,
  // --- Kraft ohne Gerät (pro Wdh.) ---
  kneepush: 1,
  diamondpush: 2.5,
  pikepush: 2.5,
  chinup: 5,
  invrow: 2,
  glutebridge: 1,
  jumpsquat: 2,
  splitsquat: 1.5,
  stepup: 1,
  calfraise: 0.5,
  superman: 0.5,
  wallsit: 1, // pro 5 s
  deadhang: 1.2, // pro 5 s
  // --- Core ---
  legraise: 1.5,
  russiantwist: 0.5,
  bicyclecrunch: 0.5,
  flutterkick: 0.3,
  vup: 1.5,
  hollowhold: 1.2, // pro 5 s
  deadbug: 0.5,
  hangingknee: 2,
  // --- Cardio ---
  skater: 0.5,
  buttkicks: 0.3,
  tuckjump: 1.5,
  boxjump: 1.5,
  shadowbox: 1.3, // pro Minute (MET 7,8)
  // --- Ausdauer ---
  hike: 7, // pro km (MET 6, ca. 12 min/km)
  swim: 30, // pro km (MET 7, ca. 25 min/km)
  nordic: 6, // pro km
  rowing: 6, // pro km (MET 8,5, ca. 4,5 min/km)
  inline: 3, // pro km wie Radfahren
  spinning: 1.4, // pro Minute (MET 8,5)
  crosstrainer: 1.2, // pro Minute (MET 7)
  // --- Sportarten, pro Minute ---
  football: 1.2, // MET 7
  yoga: 0.4, // MET 2,5
  tennis: 1.1, // MET 7,3 Einzel
  dance: 1, // MET 6,5 Fitness-Dance
  pilates: 0.5, // MET 3
  climbing: 1, // MET 5,8 Bouldern
  volleyball: 0.7, // MET 4
  basketball: 1.1, // MET 6,5
  tabletennis: 0.7, // MET 4
  badminton: 0.9, // MET 5,5
  martial: 1.3, // MET 7,8
  handball: 1.3, // MET 8
  padel: 1, // MET 6
  ski: 0.9, // MET 5,3
};

/** Anzeige des Punktesatzes, z. B. "2 P / Rep", "1,2 P / Min." */
export function rateLabel(a: Activity): string {
  const r = RATE[a.id].toLocaleString('de-DE');
  if (a.unit === 'time') return a.perMin ? `${r} P / Min.` : `${r} P / 5 s`;
  if (a.unit === 'distance') return `${r} P / km`;
  return `${r} P / Rep`;
}

/** Sekunden, die für Punkte zählen (Obergrenze je Übung, z. B. 3 h Fußball, 10 min Wandsitzen) */
export function countedSeconds(activityId: ActivityId, seconds: number): number {
  const s = Math.max(0, seconds || 0);
  return Math.min(s, ACT[activityId]?.maxSec ?? Infinity);
}

/**
 * Plausible Strecke: nie mehr als maxKm und nie schneller als die schnellste mögliche Pace.
 * Ohne Zeit (alte Einträge) bleibt nur die maxKm-Grenze.
 */
export function plausibleKm(activityId: ActivityId, km: number, seconds: number): number {
  const a = ACT[activityId];
  let k = Math.max(0, km || 0);
  if (!a || a.unit !== 'distance') return k;
  const { minPace, maxKm } = distanceLimits(a);
  k = Math.min(k, maxKm);
  if (seconds > 0) k = Math.min(k, seconds / 60 / minPace);
  return Math.round(k * 100) / 100;
}

export const DAILY_SOFT_CAP = 1500;
/** Höchstens so viele Wiederholungen zählen in einem Training */
export const MAX_SESSION_REPS = 500;
/** Bis zu so vielen Wiederholungen darf man von Hand eintragen, ohne dass die Zeit geprüft wird */
export const MANUAL_FREE_REPS = 100;
/** Schneller als 3 Wiederholungen pro Sekunde schafft niemand dauerhaft */
export const MAX_REPS_PER_SEC = 3;

/**
 * Plausible Wiederholungen: von Hand eingetragen sind bis 100 immer ok (man darf auch nachtragen),
 * mehr nur, wenn genug Zeit vergangen ist. Nie mehr als 500 pro Training.
 */
export function plausibleReps(reps: number, seconds: number, mode: string): number {
  const r = Math.max(0, Math.floor(reps || 0));
  const timeCap = mode === 'manual' ? Math.max(MANUAL_FREE_REPS, Math.floor(seconds * MAX_REPS_PER_SEC)) : Infinity;
  return Math.min(r, MAX_SESSION_REPS, timeCap);
}
export const RECORD_BONUS = 50;
export const FORM_BONUS = 1.2;

export interface ScoreInput {
  activityId: ActivityId;
  reps?: number;
  seconds?: number;
  km?: number;
  /** min/km, nur für Läufe */
  pace?: number;
  /** Reps wurden von der Kamera validiert */
  formValidated: boolean;
  streakDays: number;
  isRecord: boolean;
  /** Punkte, die heute schon verdient wurden (vor diesem Training) */
  pointsTodayBefore: number;
}

export interface ScoreBreakdown {
  base: number;
  formBonus: number;
  paceBonus: number;
  streakBonus: number;
  recordBonus: number;
  antiFarmCut: number;
  total: number;
}

export function basePoints(i: Pick<ScoreInput, 'activityId' | 'reps' | 'seconds' | 'km'>): number {
  const r = RATE[i.activityId];
  const a = ACT[i.activityId];
  if (a.unit === 'time') {
    const sec = countedSeconds(i.activityId, i.seconds ?? 0);
    return a.perMin ? (sec / 60) * r : Math.floor(sec / 5) * r;
  }
  if (a.unit === 'distance') return (i.km ?? 0) * r;
  return (i.reps ?? 0) * r;
}

export function paceMultiplier(activityId: ActivityId, pace?: number): number {
  if (activityId !== 'jog' && activityId !== 'sprint') return 1;
  if (!pace || !isFinite(pace) || pace <= 0) return 1;
  // Fließend statt in Stufen: 6:00/km = ×1, jede Minute schneller +0,2, höchstens ×1,4 (ab 4:00/km)
  return Math.min(1.4, Math.max(1, 1 + (6 - pace) * 0.2));
}

export function streakMultiplier(streakDays: number): number {
  return 1 + Math.min(0.5, Math.max(0, streakDays) * 0.02);
}

export function computePoints(i: ScoreInput): ScoreBreakdown {
  const base = basePoints(i);
  const afterPace = base * paceMultiplier(i.activityId, i.pace);
  const paceBonus = afterPace - base;
  const afterForm = afterPace * (i.formValidated ? FORM_BONUS : 1);
  const formBonus = afterForm - afterPace;
  const afterStreak = afterForm * streakMultiplier(i.streakDays);
  const streakBonus = afterStreak - afterForm;
  const recordBonus = i.isRecord ? RECORD_BONUS : 0;
  const raw = afterStreak + recordBonus;

  // Anti-Farming: alles über 1500 Tagespunkten zählt nur halb.
  const room = Math.max(0, DAILY_SOFT_CAP - i.pointsTodayBefore);
  const full = Math.min(raw, room);
  const over = raw - full;
  const capped = full + over * 0.5;
  const total = Math.round(capped);
  return {
    base: Math.round(base),
    paceBonus: Math.round(paceBonus),
    formBonus: Math.round(formBonus),
    streakBonus: Math.round(streakBonus),
    recordBonus,
    antiFarmCut: Math.round(raw - capped),
    total,
  };
}

export interface GemAward {
  reason: string;
  amount: number;
  lucky?: boolean;
}

export function computeGems(o: {
  points: number;
  firstToday: boolean;
  isRecord: boolean;
  rng?: () => number;
}): GemAward[] {
  const rng = o.rng ?? Math.random;
  const out: GemAward[] = [];
  if (o.points >= 50) out.push({ reason: 'Training ≥ 50 Punkte', amount: 1 });
  if (o.firstToday) out.push({ reason: 'Erstes Training heute', amount: 1 });
  if (o.isRecord) out.push({ reason: 'Persönlicher Rekord', amount: 3 });
  if (rng() < 0.25) out.push({ reason: 'Glücksfund!', amount: 1, lucky: true });
  return out;
}
