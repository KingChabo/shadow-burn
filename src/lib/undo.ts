import { db, getKV, setKV, type Workout } from './db';
import { addDays, daysBetween } from './date';
import { emptyStreak, REST_DAY_EVERY, STREAK_MIN_POINTS, type StreakState } from './streak';
import { badgeStates, TIER_GEMS, type Claimed } from './badges';
import type { Wallet } from './game';
import { questsFor, type DayQuests, type QuestSwap } from './quests';
import { trackOf, type QuestLevels } from './fitness';

/**
 * Was nach dem Löschen eines Trainings (normal oder Gerät) zusätzlich zurückgedreht wird:
 * Streak, Streak-Meilenstein-Gems, Tagesauftrag und Abzeichen-Stufen.
 * Punkte, XP, Gems des Trainings und Rekorde zieht deleteWorkout/deleteGymLog selbst ab.
 * Alles andere (Startseite, Statistik, Muskelkarte, Rangliste-Karte) wird ohnehin aus den Trainings berechnet.
 */

/**
 * Streak, wenn der Tag `day` nicht mehr zählt (weniger als STREAK_MIN_POINTS übrig).
 * - letzter aktiver Tag (meist heute): Streak −1, der Tag ist wieder offen
 * - ein früherer Tag der laufenden Streak: gilt wie ein verpasster Tag
 *   (freier Ruhetag, sonst ein Streak-Lock, sonst reißt die Streak ab diesem Tag)
 */
export function streakWithout(s: StreakState, day: string): StreakState {
  if (!s.lastActiveDay || s.current <= 0 || day > s.lastActiveDay) return s;
  const after = daysBetween(day, s.lastActiveDay); // Tage nach `day` bis zum letzten aktiven Tag
  if (after >= s.current) return s; // gehört nicht (mehr) zur laufenden Streak
  const wasLongest = s.longest === s.current;
  if (after === 0) {
    const current = s.current - 1;
    return {
      ...s,
      current,
      longest: wasLongest ? current : s.longest,
      lastActiveDay: current > 0 ? addDays(day, -1) : null,
    };
  }
  const restFree = !s.restDay || Math.abs(daysBetween(s.restDay, day)) >= REST_DAY_EVERY;
  if (restFree) {
    const current = s.current - 1;
    return { ...s, current, longest: wasLongest ? current : s.longest, restDay: day };
  }
  if (s.locks > 0) {
    const current = s.current - 1;
    return { ...s, current, longest: wasLongest ? current : s.longest, locks: s.locks - 1 };
  }
  // Streak reißt: es zählen nur noch die Tage danach
  const current = after;
  const before = s.current - after - 1;
  return { ...s, current, longest: wasLongest ? Math.max(current, before) : s.longest };
}

const MILESTONE = 'Streak-Meilenstein';
const QUEST = 'Tagesauftrag: ';

export interface Removed {
  day: string;
  /** Punkte des gelöschten Eintrags */
  points: number;
  /** Gem-Gründe des gelöschten Eintrags (nur normale Trainings haben sie) */
  gemAwards?: { reason: string; amount: number }[];
}

/**
 * Nach dem Löschen aufrufen, innerhalb derselben Transaktion
 * (Tabellen workouts, gymLogs, kv, friends). Der Eintrag ist da schon weg.
 */
export async function undoSideEffects(r: Removed, today: string): Promise<void> {
  const [ws, gs] = await Promise.all([
    db.workouts.where('day').equals(r.day).toArray(),
    db.gymLogs.where('day').equals(r.day).toArray(),
  ]);
  const left = ws.reduce((s, x) => s + x.points, 0) + gs.reduce((s, x) => s + x.points, 0);
  let gemsBack = 0;

  // 1) Streak: zählte der Tag vorher und jetzt nicht mehr?
  if (left + r.points >= STREAK_MIN_POINTS && left < STREAK_MIN_POINTS) {
    const s = await getKV<StreakState>('streak', emptyStreak());
    await setKV('streak', streakWithout(s, r.day));
    // Meilenstein-Gems eines anderen Trainings an diesem Tag zurücknehmen (sonst gäbe es sie doppelt)
    for (const w of ws) gemsBack += await stripAwards(w, (a) => a.reason.startsWith(MILESTONE));
  }

  // 2) Tagesauftrag: durch dieses Training erfüllt → wieder offen
  const quests = (r.gemAwards ?? []).filter((a) => a.reason.startsWith(QUEST)).map((a) => a.reason.slice(QUEST.length));
  if (quests.length && r.day === today) {
    const swap = await getKV<QuestSwap | null>('questSwap', null);
    const stored = await getKV<DayQuests | null>('questsDay', null);
    const reopened = questsFor(r.day, swap, stored).filter((q) => quests.includes(q.label));
    const ids = reopened.map((q) => q.id);
    const claimed = await getKV<string[]>('questsClaimed', []);
    await setKV('questsClaimed', claimed.filter((id) => !ids.includes(id)));
    // Fortschritt im Bereich zurücknehmen
    const lv = await getKV<QuestLevels>('questLevels', {});
    let changed = false;
    for (const q of reopened) { const t = trackOf(q.activityId); if (t && lv[t]) { lv[t] = lv[t]! - 1; changed = true; } }
    if (changed) await setKV('questLevels', lv);
  }

  if (gemsBack) await takeGems(gemsBack);

  // 3) Abzeichen-Stufen, die jetzt nicht mehr erreicht sind (inkl. ihrer Gems)
  await rollbackBadges();
}

/** Gem-Gründe aus einem Training entfernen, gibt die abgezogenen Gems zurück */
async function stripAwards(w: Workout, match: (a: { reason: string; amount: number }) => boolean): Promise<number> {
  const drop = (w.gemAwards ?? []).filter(match);
  if (!drop.length || w.id === undefined) return 0;
  const sum = drop.reduce((s, a) => s + a.amount, 0);
  await db.workouts.update(w.id, { gemAwards: w.gemAwards.filter((a) => !match(a)), gems: Math.max(0, w.gems - sum) });
  return sum;
}

async function takeGems(n: number): Promise<void> {
  const w = await getKV<Wallet | null>('wallet', null);
  if (w) await setKV('wallet', { ...w, gems: Math.max(0, w.gems - n) });
}

/** Belohnte Abzeichen-Stufen auf das senken, was die übrigen Trainings noch hergeben */
export async function rollbackBadges(): Promise<void> {
  const [workouts, gymLogs, streak, wallet, friends, claimed, notice] = await Promise.all([
    db.workouts.toArray(), db.gymLogs.toArray(),
    getKV<StreakState>('streak', emptyStreak()),
    getKV<Wallet | null>('wallet', null), db.friends.count(),
    getKV<Claimed>('badges', {}), getKV<string[]>('badgeNotice', []),
  ]);
  if (!wallet) return;
  const gemsOf = TIER_GEMS as readonly number[];
  const next: Claimed = { ...claimed };
  const lost: string[] = [];
  let gems = 0;
  for (const s of badgeStates({ workouts, gymLogs, streak, xp: wallet.xp, friends })) {
    const had = (claimed[s.def.id] ?? 0) as number;
    if (had <= s.tier) continue;
    for (let t = s.tier + 1; t <= had; t++) gems += gemsOf[t] ?? 0;
    next[s.def.id] = s.tier;
    lost.push(s.def.id);
  }
  if (!lost.length) return;
  await setKV('badges', next);
  await setKV('wallet', { ...wallet, gems: Math.max(0, wallet.gems - gems) });
  await setKV('badgeNotice', notice.filter((id) => !lost.includes(id)));
}
