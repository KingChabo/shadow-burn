import type { ActivityId } from '../data/activities';
import type { Records } from './game';
import type { Quest } from './quests';

/**
 * Fitness-Stand für die Tagesaufträge.
 * Drei Bereiche, gemessen als „meiste Wiederholungen am Stück“ der Grundübung:
 * Oberkörper = Liegestütze, Bauch = Sit-ups, Beine = Kniebeugen.
 * Startwert aus der Einstufung (Einführung), danach wächst er mit den Rekorden mit.
 */
export type Track = 'push' | 'core' | 'legs';
export const TRACKS: Track[] = ['push', 'core', 'legs'];

/** Ergebnis der Einstufung; fehlt ein Bereich, wurde er übersprungen */
export interface Fitness { push?: number; core?: number; legs?: number; at: number }

/** Grundübung je Bereich (wird bei der Einstufung getestet) */
export const TRACK_BASE: Record<Track, ActivityId> = { push: 'pushup', core: 'situp', legs: 'squat' };
export const TRACK_NAME: Record<Track, string> = { push: 'Oberkörper', core: 'Bauch', legs: 'Beine' };

/** Durchschnittswerte, wenn nichts bekannt ist (passt zu den bisherigen festen Aufträgen) */
export const REFERENCE: Record<Track, number> = { push: 20, core: 25, legs: 30 };

/**
 * Varianten je Bereich mit Umrechnung: 1 Wdh. der Variante ≈ `factor` Wdh. der Grundübung.
 * Leichte Variante bis `upTo`, schwere ab `from` (am Stück in der Grundübung).
 */
const VARIANTS: Record<Track, { id: ActivityId; factor: number; upTo?: number; from?: number }[]> = {
  push: [{ id: 'kneepush', factor: 0.6, upTo: 7 }, { id: 'pushup', factor: 1 }, { id: 'diamondpush', factor: 1.6, from: 45 }],
  core: [{ id: 'crunch', factor: 0.8, upTo: 9 }, { id: 'situp', factor: 1 }],
  legs: [{ id: 'squat', factor: 1 }, { id: 'jumpsquat', factor: 2, from: 70 }],
};

export const trackOf = (id: ActivityId): Track | null =>
  (TRACKS.find((t) => VARIANTS[t].some((v) => v.id === id)) ?? null);

/** Stand je Bereich: Einstufung oder Rekorde (umgerechnet), je nachdem was höher ist */
export function capacity(fit: Fitness | null, rec: Records): Record<Track, number> {
  const out = {} as Record<Track, number>;
  for (const t of TRACKS) {
    const a = fit?.[t];
    let best = a ?? 0;
    for (const v of VARIANTS[t]) best = Math.max(best, Math.round((rec[v.id]?.reps ?? 0) * v.factor));
    // Eingestuft mit 0 (z. B. noch kein Liegestütz): ganz leicht anfangen
    out[t] = best > 0 ? best : a !== undefined ? 1 : REFERENCE[t];
  }
  return out;
}

/**
 * Faktor für das Tagesziel: Anfangs das 1,5-fache des besten Satzes (über den Tag verteilt).
 * Jeder erledigte Auftrag im Bereich hebt ihn um 0,05, höchstens bis 2,5.
 */
export function goalFactor(done: number): number {
  return Math.min(2.5, 1.5 + 0.05 * Math.max(0, done));
}

const round5 = (x: number) => Math.max(5, Math.round(x / 5) * 5);

/** Übung und Ziel für einen Bereich */
export function trackQuest(t: Track, cap: number, done: number): Omit<Quest, 'id' | 'label'> {
  const vs = VARIANTS[t];
  const v = vs.find((x) => x.upTo !== undefined && cap <= x.upTo)
    ?? [...vs].reverse().find((x) => x.from !== undefined && cap >= x.from)
    ?? vs.find((x) => x.upTo === undefined && x.from === undefined)!;
  return { activityId: v.id, metric: 'reps', target: Math.min(300, round5((cap / v.factor) * goalFactor(done))) };
}

/** Alle anderen Aufträge: feste Grundwerte, angepasst an den Stand im passenden Bereich (rel) bzw. allgemein */
const OTHERS: (Omit<Quest, 'id' | 'label'> & { step: number; rel?: Track; min?: number })[] = [
  { activityId: 'lunge', target: 30, metric: 'reps', step: 5, rel: 'legs' },
  { activityId: 'burpee', target: 15, metric: 'reps', step: 5 },
  { activityId: 'jacks', target: 80, metric: 'reps', step: 10 },
  { activityId: 'mountain', target: 60, metric: 'reps', step: 10, rel: 'core' },
  { activityId: 'plank', target: 60, metric: 'seconds', step: 15, rel: 'core' },
  { activityId: 'sideplank', target: 45, metric: 'seconds', step: 15, rel: 'core' },
  { activityId: 'pullup', target: 10, metric: 'reps', step: 1, rel: 'push', min: 0.3 },
  { activityId: 'jog', target: 2, metric: 'km', step: 1 },
  { activityId: 'walk', target: 3, metric: 'km', step: 1 },
];

export type QuestLevels = Partial<Record<Track, number>>;

/** Auftrags-Auswahl, passend zum Stand und zum Fortschritt (erledigte Aufträge je Bereich) */
export function adaptivePool(fit: Fitness | null, rec: Records, levels: QuestLevels = {}): Omit<Quest, 'id' | 'label'>[] {
  const cap = capacity(fit, rec);
  const ratio = Math.min(2, Math.max(0.5, TRACKS.reduce((s, t) => s + cap[t] / REFERENCE[t], 0) / TRACKS.length));
  const done = TRACKS.reduce((s, t) => s + (levels[t] ?? 0), 0);
  const grow = Math.min(1.5, 1 + 0.02 * done);
  const tracks = TRACKS.map((t) => trackQuest(t, cap[t], levels[t] ?? 0));
  const others = OTHERS.map(({ step, rel, min, ...q }) => {
    const r = rel ? Math.min(2, Math.max(min ?? 0.5, cap[rel] / REFERENCE[rel])) : ratio;
    const scale = q.metric === 'km' ? 1 : r * grow;
    return { ...q, target: Math.max(step, Math.round((q.target * scale) / step) * step) };
  });
  return [...tracks, ...others.filter((o) => !tracks.some((t) => t.activityId === o.activityId))];
}

/** Bester Satz einer Einstufungs-Eingabe prüfen (0–300) */
export const cleanAssess = (n: number) => Math.min(300, Math.max(0, Math.round(Number(n) || 0)));
