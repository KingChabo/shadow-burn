import { db, getKV, setKV, type WeightEntry } from './db';
import { dayKey } from './date';

export const MIN_WEIGHT = 20;
export const MAX_WEIGHT = 400;

/** Körpergewicht für einen Tag speichern (ein Wert pro Tag, neuer Eintrag ersetzt den alten). */
export async function saveWeight(kg: number, day = dayKey()): Promise<WeightEntry> {
  const v = Math.round(Number(kg) * 10) / 10;
  if (!isFinite(v) || v < MIN_WEIGHT || v > MAX_WEIGHT) throw new Error(`Gewicht zwischen ${MIN_WEIGHT} und ${MAX_WEIGHT} kg eintragen`);
  const e: WeightEntry = { day, kg: v, at: Date.now() };
  await db.weights.put(e);
  return e;
}

export async function deleteWeight(day: string): Promise<void> {
  await db.weights.delete(day);
}

export async function allWeights(): Promise<WeightEntry[]> {
  return db.weights.orderBy('day').toArray();
}

/** Zielgewicht (null = kein Ziel) */
export async function getWeightGoal(): Promise<number | null> {
  return getKV<number | null>('weightGoal', null);
}

export async function setWeightGoal(kg: number | null): Promise<void> {
  if (kg === null) { await setKV('weightGoal', null); return; }
  const v = Math.round(Number(kg) * 10) / 10;
  if (!isFinite(v) || v < MIN_WEIGHT || v > MAX_WEIGHT) throw new Error(`Ziel zwischen ${MIN_WEIGHT} und ${MAX_WEIGHT} kg eintragen`);
  await setKV('weightGoal', v);
}
