import { ACT, MUSCLE_NAMES, type MuscleId } from '../data/activities';
import { GROUP_MUSCLES, GYM_EXERCISES, type GymGroup } from '../data/gym';
import type { GymLog, Workout } from './db';

/**
 * Muskel-Level und Erholung für die Karte auf dem Startbildschirm.
 * Alles wird aus den gespeicherten Trainings berechnet, nichts extra gespeichert.
 */

export const ALL_MUSCLES: MuscleId[] = ['chest', 'shoulders', 'triceps', 'biceps', 'forearms', 'abs', 'obliques', 'hipflexors', 'quads',
  'hamstrings', 'glutes', 'calves', 'lats', 'traps', 'lowerback'];

type Mus = { primary: MuscleId[]; secondary: MuscleId[] };

function gymMuscles(l: GymLog): Mus {
  return GYM_EXERCISES.find((e) => e.id === l.exerciseId)?.muscles ?? GROUP_MUSCLES[l.group as GymGroup] ?? { primary: [], secondary: [] };
}

/** Ein Training als "Arbeit" je Muskel: Hauptmuskel 1, Hilfsmuskel ½, mal Umfang */
export interface Hit { at: number; muscles: Mus; effort: number }

/**
 * Umfang eines Trainings (ungefähr "Sätze"):
 * Geräte = Arbeitssätze, ohne Gerät = Punkte / 15 (z. B. 30 Liegestütze ≈ 2), zwischen ½ und 6.
 */
export function hitsOf(workouts: Workout[], gymLogs: GymLog[]): Hit[] {
  const out: Hit[] = [];
  for (const w of workouts) {
    const a = ACT[w.activityId];
    if (!a) continue;
    out.push({ at: w.end || w.start, muscles: a.muscles, effort: Math.min(6, Math.max(0.5, (w.points || 0) / 15)) });
  }
  for (const l of gymLogs) {
    const sets = l.sets.filter((s) => !s.warmup).length;
    if (!sets) continue;
    out.push({ at: l.end || l.start, muscles: gymMuscles(l), effort: Math.min(10, sets) });
  }
  return out;
}

// ---------- Level ----------

export interface MuscleLevelInfo { level: number; name: string; color: [number, number, number] }

/** Ab so viel Arbeit (≈ Sätze) erreicht ein Muskel das Level */
export const LEVEL_STEPS = [0, 1, 20, 60, 150, 300, 600];
export const LEVELS: MuscleLevelInfo[] = [
  { level: 0, name: 'Untrainiert', color: [0, 0, 0] },
  { level: 1, name: 'Anfänger', color: [96, 165, 250] },
  { level: 2, name: 'Aktiv', color: [52, 211, 153] },
  { level: 3, name: 'Fit', color: [250, 204, 21] },
  { level: 4, name: 'Stark', color: [255, 107, 53] },
  { level: 5, name: 'Elite', color: [239, 68, 68] },
  { level: 6, name: 'Legende', color: [192, 132, 252] },
];

export function muscleWork(hits: Hit[]): Record<MuscleId, number> {
  const m = Object.fromEntries(ALL_MUSCLES.map((x) => [x, 0])) as Record<MuscleId, number>;
  for (const h of hits) {
    for (const p of h.muscles.primary) m[p] += h.effort;
    for (const s of h.muscles.secondary) if (!h.muscles.primary.includes(s)) m[s] += h.effort / 2;
  }
  return m;
}

export function levelFor(work: number): number {
  let lv = 0;
  for (let i = 0; i < LEVEL_STEPS.length; i++) if (work >= LEVEL_STEPS[i] && (i > 0 ? work > 0 : true)) lv = i;
  return work > 0 ? Math.max(1, lv) : 0;
}

/** Wie viel fehlt bis zum nächsten Level (0–1) */
export function levelProgress(work: number): number {
  const lv = levelFor(work);
  if (lv >= LEVEL_STEPS.length - 1) return 1;
  const a = LEVEL_STEPS[lv], b = LEVEL_STEPS[lv + 1];
  return Math.min(1, Math.max(0, (work - a) / (b - a)));
}

// ---------- Erholung ----------

/** Stunden, bis ein Hauptmuskel nach einem normalen Training wieder voll da ist */
export const RECOVERY_HOURS = 48;

/**
 * Erholung je Muskel, 0 = gerade erst trainiert, 1 = voll erholt.
 * Großer Umfang braucht länger (bis 72 h), Hilfsmuskeln halb so lang. Nie trainiert = 1.
 */
export function recovery(hits: Hit[], now = Date.now()): Record<MuscleId, number> {
  const r = Object.fromEntries(ALL_MUSCLES.map((x) => [x, 1])) as Record<MuscleId, number>;
  for (const h of hits) {
    const hours = (now - h.at) / 3_600_000;
    if (hours < 0 || hours > 96) continue;
    const need = RECOVERY_HOURS * Math.min(1.5, Math.max(0.5, h.effort / 3));
    for (const p of h.muscles.primary) r[p] = Math.min(r[p], Math.min(1, hours / need));
    for (const s of h.muscles.secondary) r[s] = Math.min(r[s], Math.min(1, hours / (need / 2)));
  }
  return r;
}

export function recoveryColor(v: number): [number, number, number] {
  // rot (müde) → gelb → grün (erholt)
  const red: [number, number, number] = [239, 68, 68], yel: [number, number, number] = [250, 204, 21], grn: [number, number, number] = [52, 211, 153];
  const mix = (a: number[], b: number[], t: number) => a.map((x, i) => Math.round(x + (b[i] - x) * t)) as [number, number, number];
  return v < 0.5 ? mix(red, yel, v / 0.5) : mix(yel, grn, (v - 0.5) / 0.5);
}

export function recoveryLabel(v: number): string {
  if (v >= 1) return 'erholt';
  if (v >= 0.66) return 'fast erholt';
  if (v >= 0.33) return 'erholt sich';
  return 'müde';
}

/** Körperpartien für den Vorschlag "Heute dran" */
const PARTS: { label: string; muscles: MuscleId[] }[] = [
  { label: 'Brust', muscles: ['chest'] },
  { label: 'Rücken', muscles: ['lats', 'traps', 'lowerback'] },
  { label: 'Schultern', muscles: ['shoulders'] },
  { label: 'Arme', muscles: ['biceps', 'triceps', 'forearms'] },
  { label: 'Bauch', muscles: ['abs', 'obliques'] },
  { label: 'Beine', muscles: ['quads', 'hamstrings', 'glutes', 'calves'] },
];

/**
 * Was heute dran ist: voll erholte Körperpartien, die am längsten nicht trainiert wurden.
 */
export function suggestToday(hits: Hit[], now = Date.now()): string[] {
  const rec = recovery(hits, now);
  const last = (ms: MuscleId[]) => Math.max(0, ...hits.filter((h) => h.muscles.primary.some((p) => ms.includes(p))).map((h) => h.at));
  return PARTS
    .filter((p) => p.muscles.every((m) => rec[m] >= 0.9))
    .sort((a, b) => last(a.muscles) - last(b.muscles))
    .slice(0, 2)
    .map((p) => p.label);
}

export const muscleName = (m: MuscleId) => MUSCLE_NAMES[m];

// ---------- Details zu einem Muskel (langes Drücken auf der Karte) ----------

export interface MuscleDetail {
  muscle: MuscleId;
  work: number;
  level: number;
  /** 0–1 bis zum nächsten Level (1 bei Höchststufe) */
  progress: number;
  /** fehlende Arbeit (≈ Sätze) bis zum nächsten Level, 0 bei Höchststufe */
  toNext: number;
  recovery: number;
  /** Stunden, bis der Muskel wieder voll erholt ist (0 = erholt) */
  hoursLeft: number;
  /** Zeitpunkt des letzten Trainings (Haupt- oder Hilfsmuskel), null = nie */
  lastAt: number | null;
  /** Trainings in den letzten 30 Tagen */
  count30: number;
}

export function muscleDetail(hits: Hit[], m: MuscleId, now = Date.now()): MuscleDetail {
  const work = muscleWork(hits)[m];
  const level = levelFor(work);
  const max = LEVEL_STEPS.length - 1;
  let hoursLeft = 0, lastAt: number | null = null, count30 = 0;
  for (const h of hits) {
    const prim = h.muscles.primary.includes(m), sec = h.muscles.secondary.includes(m);
    if (!prim && !sec) continue;
    if (lastAt === null || h.at > lastAt) lastAt = h.at;
    const hours = (now - h.at) / 3_600_000;
    if (hours >= 0 && hours <= 30 * 24) count30++;
    if (hours < 0 || hours > 96) continue;
    const need = RECOVERY_HOURS * Math.min(1.5, Math.max(0.5, h.effort / 3)) / (prim ? 1 : 2);
    hoursLeft = Math.max(hoursLeft, need - hours);
  }
  return {
    muscle: m, work, level,
    progress: levelProgress(work),
    toNext: level >= max ? 0 : Math.max(0, LEVEL_STEPS[level + 1] - work),
    recovery: recovery(hits, now)[m],
    hoursLeft: Math.max(0, hoursLeft),
    lastAt, count30,
  };
}
