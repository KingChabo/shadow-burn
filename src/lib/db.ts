import Dexie, { type Table } from 'dexie';
import type { ActivityId, Mode } from '../data/activities';
import type { ScoreBreakdown, GemAward } from './scoring';
import type { Friend } from './leaderboard';
import type { BlogPost } from './blog';

export interface Workout {
  id?: number;
  day: string;
  activityId: ActivityId;
  mode: Mode;
  start: number;
  end: number;
  reps: number;
  invalid: number;
  seconds: number;
  km: number;
  points: number;
  gems: number;
  isRecord: boolean;
  breakdown: ScoreBreakdown;
  gemAwards: GemAward[];
  /** Einzelne Sätze (Wdh. bzw. Sekunden), nur wenn es mehr als einer war. Ältere Einträge haben keine. */
  sets?: number[];
}

export interface KV { key: string; value: unknown }

/** Ein Satz an Gerät/Hantel */
/** warmup: Aufwärmsatz – zählt nicht für Punkte, Volumen und Rekorde */
export interface GymSet { reps: number; kg: number; warmup?: boolean }

/** Eine Geräteübung mit allen Sätzen (manuell eingetragen) */
export interface GymLog {
  id?: number;
  day: string;
  start: number;
  end: number;
  exerciseId: string;
  /** Name zum Zeitpunkt des Trainings (auch für eigene Übungen) */
  name: string;
  group: string;
  sets: GymSet[];
  /** Summe Wiederholungen × kg */
  volume: number;
  points: number;
  gems: number;
  isRecord: boolean;
  breakdown: ScoreBreakdown;
}

/** Körpergewicht, ein Eintrag pro Tag */
export interface WeightEntry { day: string; kg: number; at: number }

/**
 * Aufbau der Datenbank, Version für Version (Index 0 = Version 1).
 * WICHTIG für Updates ohne Datenverlust: nur NEUE Einträge hinten anhängen, alte nie ändern oder löschen.
 * Eine Tabelle fällt nie weg; neue Felder brauchen keinen Eintrag, nur neue Tabellen oder Indizes.
 * src/lib/upgrade.test.ts prüft bei jedem APK-Build, dass Daten aus jeder alten Version erhalten bleiben.
 */
export const SCHEMAS: Record<string, string>[] = [
  { workouts: '++id, day, activityId, start', kv: 'key' },
  // v2: Freunde für die Rangliste (per QR-Code übertragen)
  { friends: 'id' },
  // v3: Geräteübungen und Körpergewicht (bestehende Tabellen bleiben unverändert)
  { gymLogs: '++id, day, exerciseId, start', weights: 'day' },
  // v4: Blog (eigene und empfangene Trainingsberichte)
  { posts: 'id, at, author' },
];

export class ShadowBurnDB extends Dexie {
  workouts!: Table<Workout, number>;
  kv!: Table<KV, string>;
  friends!: Table<Friend, string>;
  gymLogs!: Table<GymLog, number>;
  weights!: Table<WeightEntry, string>;
  posts!: Table<BlogPost, string>;
  constructor() {
    // Interner Speichername bleibt 'phantom' (alter App-Name): Umbenennen würde alle Daten auf dem Handy verlieren.
    super('phantom');
    SCHEMAS.forEach((s, i) => this.version(i + 1).stores(s));
  }
}

export const db = new ShadowBurnDB();

export async function getKV<T>(key: string, fallback: T): Promise<T> {
  const row = await db.kv.get(key);
  return row ? (row.value as T) : fallback;
}
export async function setKV<T>(key: string, value: T): Promise<void> {
  await db.kv.put({ key, value });
}
