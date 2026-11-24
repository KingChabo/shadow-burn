import { GROUP_MUSCLES, GYM_EXERCISES, type GymExercise, type GymGroup } from '../data/gym';
import { db, getKV, setKV, type GymLog, type GymSet } from './db';
import { dayKey } from './date';
import { computeGems, DAILY_SOFT_CAP, RECORD_BONUS, streakMultiplier, type GemAward, type ScoreBreakdown } from './scoring';
import { checkStreak, emptyStreak, registerActiveDay, STREAK_MIN_POINTS, type StreakState } from './streak';
import { levelFromXp } from './level';
import { defaultWallet, type Wallet } from './game';
import { undoSideEffects } from './undo';

// ---------- Punkte ----------

export const MAX_REPS = 100;
export const MAX_KG = 1000;

/** Nur gültige Sätze (mind. 1 Wiederholung), Werte begrenzt. */
export function cleanSets(sets: GymSet[]): GymSet[] {
  return sets
    .map((s) => ({
      reps: Math.min(MAX_REPS, Math.max(0, Math.round(Number(s.reps) || 0))),
      kg: Math.min(MAX_KG, Math.max(0, Math.round((Number(s.kg) || 0) * 4) / 4)),
      ...(s.warmup ? { warmup: true } : {}),
    }))
    .filter((s) => s.reps > 0);
}

/**
 * Punkte für einen Satz: 0,5 P pro Wiederholung, plus 0,5 P je 20 kg Last.
 * Beispiel: 12 × 60 kg Bankdrücken = 12 × 0,5 × (1 + 3) = 24 P – etwa so viel wie 12 Liegestütze.
 */
/** Höchstens so viele Punkte bringt ein einzelner Satz (gegen Fantasie-Sätze wie 100 × 500 kg) */
export const MAX_SET_POINTS = 60;
/**
 * Körpergewichtsübungen mit Zusatzgewicht: Basis wie beim normalen Training (Klimmzug 5 P, Dip 3 P),
 * das Zusatzgewicht legt obendrauf. So lohnt sich die schwerere Variante nie weniger als die leichte.
 */
export const BODYWEIGHT_RATE: Record<string, number> = { weighted_pullup: 5, dips_weighted: 3, hanging_leg_raise: 2, ab_wheel: 1.5, decline_situp: 1 };

/** Gewichtsfaktor je Übung (Beinpresse & Co. zählen kg nur anteilig) */
const LOAD_OF: Record<string, number> = Object.fromEntries(GYM_EXERCISES.filter((e) => e.load).map((e) => [e.id, e.load!]));

export function setPoints(s: GymSet, exerciseId?: string): number {
  if (s.warmup) return 0;
  const bw = exerciseId ? BODYWEIGHT_RATE[exerciseId] : undefined;
  const kg = s.kg * ((exerciseId && LOAD_OF[exerciseId]) || 1);
  const p = bw ? s.reps * bw * (1 + kg / 40) : s.reps * 0.5 * (1 + kg / 20);
  return Math.min(MAX_SET_POINTS, p);
}

/** Bewegte Last (Volumen) in kg */
export function volume(sets: GymSet[]): number {
  return sets.reduce((v, s) => v + (s.warmup ? 0 : s.reps * s.kg), 0);
}

/** Geschätztes 1-Wiederholungs-Maximum (Epley) */
export function oneRepMax(s: GymSet): number {
  if (s.warmup || s.reps <= 0 || s.kg <= 0) return 0;
  if (s.reps === 1) return s.kg;
  return Math.round(s.kg * (1 + s.reps / 30) * 10) / 10;
}

export function bestSet(sets: GymSet[]): GymSet | null {
  let best: GymSet | null = null;
  for (const s of sets) if (!s.warmup && s.reps > 0 && (!best || s.kg > best.kg || (s.kg === best.kg && s.reps > best.reps))) best = s;
  return best;
}

export interface GymScoreInput { sets: GymSet[]; streakDays: number; isRecord: boolean; pointsTodayBefore: number; exerciseId?: string }

export function computeGymPoints(i: GymScoreInput): ScoreBreakdown {
  const base = i.sets.reduce((p, s) => p + setPoints(s, i.exerciseId), 0);
  const afterStreak = base * streakMultiplier(i.streakDays);
  const streakBonus = afterStreak - base;
  const recordBonus = i.isRecord ? RECORD_BONUS : 0;
  const raw = afterStreak + recordBonus;
  const room = Math.max(0, DAILY_SOFT_CAP - i.pointsTodayBefore);
  const full = Math.min(raw, room);
  const capped = full + (raw - full) * 0.5;
  return {
    base: Math.round(base), paceBonus: 0, formBonus: 0,
    streakBonus: Math.round(streakBonus), recordBonus,
    antiFarmCut: Math.round(raw - capped), total: Math.round(capped),
  };
}

// ---------- Übungen (inkl. eigene) ----------

export async function getCustomExercises(): Promise<GymExercise[]> {
  return getKV<GymExercise[]>('gymCustom', []);
}

export async function addCustomExercise(name: string, group: GymGroup): Promise<GymExercise> {
  const list = await getCustomExercises();
  const e: GymExercise = {
    id: 'c_' + Date.now().toString(36), name: name.trim().slice(0, 40), group, equipment: 'Maschine',
    muscles: GROUP_MUSCLES[group], custom: true,
  };
  await setKV('gymCustom', [...list, e]);
  return e;
}

/** Eigene Übung entfernen. Bereits gespeicherte Trainings bleiben erhalten (Name steht im Eintrag). */
export async function deleteCustomExercise(id: string): Promise<void> {
  await setKV('gymCustom', (await getCustomExercises()).filter((e) => e.id !== id));
}

export async function allExercises(): Promise<GymExercise[]> {
  return [...GYM_EXERCISES, ...(await getCustomExercises())];
}

// ---------- Speichern ----------

/** day = Tag, an dem es zuletzt einen Rekord-Bonus gab (höchstens einer pro Übung und Tag) */
export type GymRecords = Record<string, { kg: number; reps: number; e1rm: number; day?: string }>;

export interface GymInput { exercise: GymExercise; sets: GymSet[]; start: number; end: number }

export interface GymSummary {
  log: GymLog;
  breakdown: ScoreBreakdown;
  gems: GemAward[];
  isRecord: boolean;
  recordText: string | null;
  streakAfter: number;
  streakIncreased: boolean;
  levelBefore: number;
  levelAfter: number;
  /** Punkte, die heute noch bis zur Streak fehlen (0 = Tag gesichert) */
  streakMissing: number;
}

/** Letzte Einheit einer Übung: alle Einträge des letzten Trainingstags zusammen (z. B. Hauptsätze + Back-off) */
export async function lastLogFor(exerciseId: string): Promise<GymLog | undefined> {
  const logs = (await db.gymLogs.where('exerciseId').equals(exerciseId).toArray()).sort((a, b) => a.start - b.start);
  const last = logs[logs.length - 1];
  if (!last) return undefined;
  const sameDay = logs.filter((l) => l.day === last.day);
  return { ...last, start: sameDay[0].start, sets: sameDay.flatMap((l) => l.sets) };
}

export async function finishGym(input: GymInput, rng: () => number = Math.random): Promise<GymSummary> {
  const sets = cleanSets(input.sets);
  if (sets.length === 0) throw new Error('Mindestens ein Satz mit Wiederholungen');
  if (sets.every((s) => s.warmup)) throw new Error('Mindestens ein Arbeitssatz (nicht nur Aufwärmen)');
  const today = dayKey(new Date(input.end));
  return db.transaction('rw', db.gymLogs, db.workouts, db.kv, async () => {
    const wallet = await getKV<Wallet>('wallet', defaultWallet());
    const streak0 = checkStreak(await getKV<StreakState>('streak', emptyStreak()), today).state;
    const records = await getKV<GymRecords>('gymRecords', {});
    const [wsToday, gymToday] = await Promise.all([
      db.workouts.where('day').equals(today).toArray(),
      db.gymLogs.where('day').equals(today).toArray(),
    ]);
    const pointsTodayBefore = wsToday.reduce((s, x) => s + x.points, 0) + gymToday.reduce((s, x) => s + x.points, 0);

    // Rekord = schwerster Satz (bei gleichem Gewicht: mehr Wiederholungen)
    const best = bestSet(sets)!;
    const prev = records[input.exercise.id];
    let isRecord = false;
    let recordText: string | null = null;
    // Gegen Rekord-Farmen (+0,25 kg pro Eintrag): nur spürbare Steigerung zählt, und nur ein Bonus pro Übung und Tag.
    const bestE1rm = Math.max(0, ...sets.map(oneRepMax));
    const heavier = !!prev && best.kg >= prev.kg + 1;
    const moreReps = !!prev && best.kg === prev.kg && best.reps > prev.reps;
    const strongerE1rm = !!prev && prev.e1rm > 0 && bestE1rm >= prev.e1rm * 1.025;
    if (prev && best.kg > 0 && prev.day !== today && (heavier || moreReps || strongerE1rm)) {
      isRecord = true;
      recordText = heavier || moreReps
        ? `${best.reps} × ${fmtKg(best.kg)} (vorher ${prev.reps} × ${fmtKg(prev.kg)})`
        : `Geschätztes Maximum ${fmtKg(Math.round(bestE1rm))} (vorher ${fmtKg(Math.round(prev.e1rm))})`;
    }
    const heaviest = !prev || best.kg > prev.kg || (best.kg === prev.kg && best.reps > prev.reps);
    const nextRec = {
      ...(heaviest ? { kg: best.kg, reps: best.reps } : { kg: prev.kg, reps: prev.reps }),
      e1rm: Math.max(prev?.e1rm ?? 0, bestE1rm),
      day: isRecord ? today : prev?.day,
    };

    const breakdown = computeGymPoints({ sets, streakDays: streak0.current, isRecord, pointsTodayBefore, exerciseId: input.exercise.id });
    const gems = computeGems({ points: breakdown.total, firstToday: wsToday.length + gymToday.length === 0, isRecord, rng });

    let streak = streak0;
    let streakIncreased = false;
    // Ein Tag zählt für die Streak, sobald an dem Tag zusammen genug Punkte gesammelt sind
    if (pointsTodayBefore + breakdown.total >= STREAK_MIN_POINTS) {
      const r = registerActiveDay(streak0, today);
      streak = r.state;
      streakIncreased = r.increased;
      if (r.milestoneGems) gems.push({ reason: `Streak-Meilenstein: ${streak.current} Tage`, amount: r.milestoneGems });
    }
    const gemSum = gems.reduce((s, g) => s + g.amount, 0);

    const log: GymLog = {
      day: today, start: input.start, end: input.end,
      exerciseId: input.exercise.id, name: input.exercise.name, group: input.exercise.group,
      sets, volume: volume(sets), points: breakdown.total, gems: gemSum, isRecord, breakdown,
    };
    log.id = await db.gymLogs.add(log);
    const newWallet: Wallet = { points: wallet.points + breakdown.total, xp: wallet.xp + breakdown.total, gems: wallet.gems + gemSum };
    await setKV('wallet', newWallet);
    await setKV('streak', streak);
    await setKV('gymRecords', { ...records, [input.exercise.id]: nextRec });

    return {
      log, breakdown, gems, isRecord, recordText,
      streakAfter: streak.current, streakIncreased,
      streakMissing: streak.lastActiveDay === today ? 0 : Math.max(0, STREAK_MIN_POINTS - pointsTodayBefore - breakdown.total),
      levelBefore: levelFromXp(wallet.xp).level, levelAfter: levelFromXp(newWallet.xp).level,
    };
  });
}

/**
 * Schlägt dieser Satz den Rekord? Gleiche Regel wie beim Speichern: mindestens 1 kg schwerer,
 * oder gleiches Gewicht mit mehr Wiederholungen. Ohne bisherigen Rekord gibt es keinen.
 */
export function beatsRecord(rec: { kg: number; reps: number } | undefined, reps: number, kg: number): boolean {
  if (!rec || !(reps > 0) || !(kg > 0)) return false;
  return kg >= rec.kg + 1 || (kg === rec.kg && reps > rec.reps);
}

export function fmtKg(kg: number): string {
  return `${kg.toLocaleString('de-DE', { maximumFractionDigits: 2 })} kg`;
}

// ---------- Löschen ----------

/**
 * Einen Geräte-Eintrag löschen (z. B. Tippfehler 1100 statt 110 kg).
 * Punkte, Erfahrung und Gems des Eintrags werden abgezogen, der Rekord der Übung aus den übrigen Einträgen neu berechnet.
 * Die Streak bleibt unverändert.
 */
export async function deleteGymLog(id: number, now = new Date()): Promise<void> {
  await db.transaction('rw', [db.workouts, db.gymLogs, db.kv, db.friends], async () => {
    const log = await db.gymLogs.get(id);
    if (!log) return;
    await db.gymLogs.delete(id);
    const w = await getKV<Wallet>('wallet', defaultWallet());
    await setKV('wallet', { points: Math.max(0, w.points - log.points), xp: Math.max(0, w.xp - log.points), gems: Math.max(0, w.gems - log.gems) });
    const records = await getKV<GymRecords>('gymRecords', {});
    const rest = await db.gymLogs.where('exerciseId').equals(log.exerciseId).toArray();
    const all = rest.flatMap((l) => l.sets);
    const best = bestSet(all);
    const next = { ...records };
    if (best) next[log.exerciseId] = { kg: best.kg, reps: best.reps, e1rm: Math.max(0, ...all.map(oneRepMax)), day: records[log.exerciseId]?.day };
    else delete next[log.exerciseId];
    await setKV('gymRecords', next);
    // Streak, Abzeichen (Geräte haben keine Tagesaufträge)
    await undoSideEffects({ day: log.day, points: log.points }, dayKey(now));
  });
}

// ---------- Hinweis: mehr Gewicht ----------

/** Ab so vielen Wiederholungen in jedem Arbeitssatz ist das Gewicht zu leicht */
export const HIGH_REPS = 20;
/** So viele Arbeitssätze müssen es mindestens sein */
export const HIGH_REP_SETS = 3;

export interface WeightHint { from: number; to: number; text: string }

/** Nächste sinnvolle Stufe: +5 %, mindestens 1 kg (leicht) bzw. 2,5 kg, auf 0,5/2,5 kg gerundet */
export function nextKg(kg: number): number {
  if (kg < 10) return Math.round((kg + 1) * 2) / 2;
  const step = 2.5;
  return Math.max(kg + step, Math.ceil((kg * 1.05) / step) * step);
}

/**
 * Nur wenn jemand zu viele Wiederholungen macht: mindestens 3 Arbeitssätze und jeder mit 20+ Wdh.
 * Dann schlägt die App mehr Gewicht vor. Sonst null (kein Hinweis).
 */
export function weightHint(sets: GymSet[]): WeightHint | null {
  const work = sets.filter((s) => !s.warmup && s.reps > 0);
  if (work.length < HIGH_REP_SETS || !work.every((s) => s.reps >= HIGH_REPS)) return null;
  const kg = Math.max(...work.map((s) => s.kg));
  if (kg <= 0) {
    return { from: 0, to: 0, text: `${work.length} Sätze mit ${HIGH_REPS}+ Wdh. sind dir zu leicht. Nimm Zusatzgewicht oder eine schwerere Variante.` };
  }
  const to = nextKg(kg);
  return { from: kg, to, text: `${work.length} Sätze mit ${HIGH_REPS}+ Wdh. sind dir zu leicht. Probier nächstes Mal ${fmtKg(to)} statt ${fmtKg(kg)}.` };
}
