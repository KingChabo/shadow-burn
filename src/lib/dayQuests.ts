import { db, getKV, setKV } from './db';
import { hitsOf, recovery } from './muscles';
import { adaptivePool, type Fitness, type QuestLevels } from './fitness';
import type { Records } from './game';
import { pickQuests, questsFor, type DayQuests, type Quest, type QuestSwap } from './quests';

/**
 * Tagesaufträge für heute festlegen und speichern (einmal pro Tag).
 * Gewählt wird nach Erholung der Muskeln beim ersten Öffnen des Tages. Danach bleibt die Auswahl,
 * damit sich Aufträge nach dem Training nicht ändern.
 * Hat man heute schon trainiert, bevor es diese Auswahl gab (App-Update am Tag), bleibt die alte Auswahl.
 * Muss in einer Transaktion mit workouts, gymLogs und kv laufen (oder ohne Transaktion).
 */
export async function ensureDayQuests(day: string, now = Date.now(), force = false): Promise<DayQuests> {
  const cur = await getKV<DayQuests | null>('questsDay', null);
  if (!force && cur && cur.day === day && cur.list.length >= 3) return cur;
  const since = now - 4 * 24 * 3_600_000;
  const [ws, gs] = await Promise.all([
    db.workouts.where('start').above(since).toArray(),
    db.gymLogs.where('start').above(since).toArray(),
  ]);
  const trainedToday = ws.some((w) => w.day === day) || gs.some((l) => l.day === day);
  const claimed = await getKV<string[]>('questsClaimed', []);
  let next: DayQuests;
  if (!force && (trainedToday || claimed.some((id) => id.startsWith(day + ':')))) {
    // Alte Auswahl aus dem Datum übernehmen (4 Stück wie beim Tauschen)
    const a = questsFor(day), b = questsFor(day, { day, index: 0 });
    next = { day, list: [...a, b[0]] };
  } else {
    const [fit, records, levels] = await Promise.all([
      getKV<Fitness | null>('fitness', null),
      getKV<Records>('records', {}),
      getKV<QuestLevels>('questLevels', {}),
    ]);
    next = pickQuests(day, recovery(hitsOf(ws, gs), now), adaptivePool(fit, records, levels));
  }
  await setKV('questsDay', next);
  return next;
}

/** Heutige Aufträge (mit Tausch), liest die gespeicherte Auswahl */
export async function todaysQuests(day: string): Promise<Quest[]> {
  const [stored, swap] = await Promise.all([
    getKV<DayQuests | null>('questsDay', null),
    getKV<QuestSwap | null>('questSwap', null),
  ]);
  return questsFor(day, swap, stored);
}

/**
 * Einstufung speichern und die heutigen Aufträge gleich danach neu wählen
 * (sonst gäbe es erst morgen passende Aufträge). Ein Tausch von heute verfällt.
 */
export async function saveFitness(fit: Fitness, day: string, now = Date.now()): Promise<DayQuests> {
  await setKV('fitness', fit);
  await setKV('questSwap', null);
  return ensureDayQuests(day, now, true);
}
