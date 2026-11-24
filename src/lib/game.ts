import { APP_DASH } from './brand';
import { ACT, type ActivityId, type Mode } from '../data/activities';
import { db, getKV, setKV, type Workout } from './db';
import { dayKey } from './date';
import { computeGems, computePoints, plausibleKm, plausibleReps, type GemAward, type ScoreBreakdown } from './scoring';
import { applyPlan, checkStreak, emptyStreak, registerActiveDay, STREAK_MIN_POINTS, type StreakState } from './streak';
import { canMove, cleanDays, movePlanDay, validDays, type WeekPlan } from './weekPlan';
import { questProgress, questsFor, type QuestSwap } from './quests';
import { levelFromXp } from './level';
import { mergeFriend, recordValue, STAT_BODY, STAT_CATS, weekKey, type Friend, type PlayerCard, type SharedStats } from './leaderboard';
import { normalizeAvatar, type AvatarState } from './avatar';
import { cosLookOf, normalizeCos, type CosState } from './cosmetics';
import { bodyPartShare, pointsByCategory, pointsPerDay, totals, weeklyPoints } from './stats';
import type { GymLog } from './db';
import { undoSideEffects } from './undo';
import { bestOfSets, cleanSetList, type SetMode, type SetPlan } from './sets';
import { ensureDayQuests } from './dayQuests';
import { trackOf, type QuestLevels, type Track } from './fitness';

export interface Wallet { points: number; gems: number; xp: number }
export interface Profile { name: string; createdAt: number }
export interface Settings {
  /** Spiele in der Satzpause; fehlt/'off' = aus (Standard). Gewählt wird in jeder Pause neu. */
  restGame?: 'off' | 'on' | 'laeufer' | 'roehre' | 'flieger';
  sound: boolean; voice: boolean; vibration: boolean;
  /** Freunde sehen über meinen QR-Code auch meine Statistik (Annahme: standardmäßig aus) */
  shareStats?: boolean;
  /** Körper der Muskelgrafik: Mann (Standard) oder Frau */
  sex?: 'm' | 'f';
  /** Erscheinungsbild: wie das Handy (Standard), hell oder dunkel */
  look?: 'auto' | 'light' | 'dark';
  /** Eigenes Tagesziel in Punkten, nur für den Ring auf Home (Streak zählt weiter ab STREAK_MIN_POINTS) */
  dailyGoal?: number;
  /** Blog-Seite in der unteren Leiste zeigen (Standard: an) */
  blog?: boolean;
  /** Beim QR-Austausch den Blog mitschicken (Standard: an). Aus = nur Rangliste */
  qrBlog?: boolean;
  /** Welche Blog-Beiträge beim Tauschen mitgehen: letzte X Tage (1–365) oder 'all'. Standard: 7 */
  shareDays?: number | 'all';
  /** Bluetooth-Austausch bei Treffen (nur Android-App). Standard: aus, muss man selbst einschalten */
  bluetooth?: boolean;
  /** Extra sichere Bluetooth-Übertragung: nur Kopplung per QR-Code, Anfragen ohne Code werden abgelehnt. Standard: aus */
  btSecure?: boolean;
}
export interface Prefs {
  favorites: ActivityId[]; lastMode: Partial<Record<ActivityId, Mode>>; /** zuletzt gewählte Trainingsart */ kind?: 'body' | 'gym' | 'plans';
  /** Sätze vorher festlegen ('plan') oder frei trainieren und danach erfassen ('free', Standard) */
  setMode?: SetMode;
  /** Zuletzt geplante Sätze je Übung (ohne Gerät) */
  setPlans?: Partial<Record<string, SetPlan>>;
  /** Pause zwischen Geräte-Sätzen in Sekunden (geplanter Modus) */
  gymRest?: number;
}
/** Rekorde: reps = max Reps, seconds = längste Zeit, km = längste Distanz, pace = schnellste min/km */
export type Records = Partial<Record<ActivityId, { reps?: number; seconds?: number; km?: number; pace?: number }>>;
export interface LockNotice { usedLocks: number; usedRest?: boolean; broken: boolean; lostStreak: number; day: string }

export const defaultWallet = (): Wallet => ({ points: 0, gems: 0, xp: 0 });
export const defaultSettings = (): Settings => ({ sound: true, voice: true, vibration: true, shareStats: false });
export const defaultPrefs = (): Prefs => ({ favorites: [], lastMode: {} });

export interface WorkoutInput {
  activityId: ActivityId;
  mode: Mode;
  start: number;
  end: number;
  reps?: number;
  invalid?: number;
  seconds?: number;
  km?: number;
  /** Einzelne Sätze (Wdh. bzw. Sekunden); reps/seconds sind die Summe */
  sets?: number[];
}

export interface Summary {
  workout: Workout;
  breakdown: ScoreBreakdown;
  gems: GemAward[];
  isRecord: boolean;
  recordText: string | null;
  streakBefore: number;
  streakAfter: number;
  streakIncreased: boolean;
  levelBefore: number;
  levelAfter: number;
  questsCompleted: string[];
  /** Eingetragene Wiederholungen, falls sie als unrealistisch gekürzt wurden */
  repsCappedFrom?: number;
  /** Punkte, die heute noch bis zur Streak fehlen (0 = Tag gesichert) */
  streakMissing: number;
}

/** Beim App-Start: Streak prüfen, ggf. Locks verbrauchen. */
export async function startupCheck(now = new Date()): Promise<LockNotice | null> {
  const today = dayKey(now);
  const s = await getKV<StreakState>('streak', emptyStreak());
  const r = checkStreak(s, today);
  // Wochenplan: Ruhetage zählen mit (ohne Hinweis), Meilensteine gibt es dabei auch
  if (r.restDays && !r.broken) {
    await setKV('streak', r.state);
    if (r.milestoneGems) {
      const wallet = await getKV<Wallet>('wallet', defaultWallet());
      await setKV('wallet', { ...wallet, gems: wallet.gems + r.milestoneGems });
    }
  }
  if (r.usedLocks || r.usedRest || r.broken) {
    await setKV('streak', r.state);
    const notice: LockNotice = { usedLocks: r.usedLocks, usedRest: r.usedRest, broken: r.broken, lostStreak: r.lostStreak, day: today };
    await setKV('lockNotice', notice);
    return notice;
  }
  return null;
}

/**
 * Wochenplan speichern (on = false: "jeden Tag"). Ändert man die Tage, gelten sie sofort
 * und ersetzen Verschiebungen dieser Woche. Die laufende Streak bleibt erhalten.
 */
export async function saveWeekPlan(on: boolean, days: (string | null)[], now = new Date()): Promise<string | null> {
  const today = dayKey(now);
  const clean = cleanDays(days);
  if (on && !validDays(clean)) return 'Mindestens 2 Trainingstage pro Woche.';
  await db.transaction('rw', db.kv, async () => {
    const s = await getKV<StreakState>('streak', emptyStreak());
    const old = s.plan;
    const same = !!old && old.days.every((d, i) => d === clean[i]);
    const plan: WeekPlan = { on, days: clean, week: same ? old?.week ?? null : null };
    await setKV('streak', applyPlan(s, plan, today));
  });
  return null;
}

/** Einen Trainingstag dieser Woche verschieben (z. B. Mi → Do). Gibt bei Fehler den Grund zurück. */
export async function moveTrainingDay(from: string, to: string, now = new Date()): Promise<string | null> {
  const today = dayKey(now);
  let err: string | null = null;
  await db.transaction('rw', db.kv, async () => {
    const s = checkStreak(await getKV<StreakState>('streak', emptyStreak()), today).state;
    if (!s.plan) { err = 'Kein Wochenplan aktiv.'; return; }
    const doneToday = s.lastActiveDay === today && s.restCounted !== today;
    const c = canMove(s.plan, from, to, today, doneToday);
    if (!c.ok) { err = c.reason ?? 'Geht nicht.'; return; }
    await setKV('streak', applyPlan(s, movePlanDay(s.plan, from, to), today));
  });
  return err;
}

function recordCheck(activityId: ActivityId, rec: Records, w: WorkoutInput, pace: number | undefined) {
  const unit = ACT[activityId].unit;
  const prev = rec[activityId] ?? {};
  const next = { ...prev };
  let isRecord = false;
  let text: string | null = null;
  // Sportarten nach Dauer (Fußball, Yoga …): längste Einheit ist kein Rekord, sonst lohnt sich Aufrunden
  if (ACT[activityId].perMin) return { isRecord, text, next: undefined };
  // Rekord = am meisten am Stück: bei mehreren Sätzen zählt der beste Satz
  const multi = !!w.sets && w.sets.length > 1;
  if (unit === 'reps' && (w.reps ?? 0) > 0) {
    const best = bestOfSets(w.sets, w.reps ?? 0);
    if (prev.reps !== undefined && best > prev.reps) { isRecord = true; text = `${best} Wiederholungen${multi ? ' am Stück' : ''} (vorher ${prev.reps})`; }
    next.reps = Math.max(prev.reps ?? 0, best);
  }
  if (unit === 'time' && (w.seconds ?? 0) > 0) {
    const best = bestOfSets(w.sets, w.seconds ?? 0);
    if (prev.seconds !== undefined && best > prev.seconds) { isRecord = true; text = `${best} s${multi ? ' am Stück' : ''} (vorher ${prev.seconds} s)`; }
    next.seconds = Math.max(prev.seconds ?? 0, best);
  }
  if (unit === 'distance' && (w.km ?? 0) > 0) {
    if (prev.km !== undefined && (w.km ?? 0) > prev.km) { isRecord = true; text = `${w.km} km – längste Strecke`; }
    next.km = Math.max(prev.km ?? 0, w.km ?? 0);
    if (pace && (w.km ?? 0) >= 1) {
      if (prev.pace !== undefined && pace < prev.pace) { isRecord = true; text = text ?? 'Schnellste Pace'; }
      next.pace = prev.pace === undefined ? pace : Math.min(prev.pace, pace);
    }
  }
  return { isRecord, text, next };
}

export async function finishWorkout(w: WorkoutInput, rng: () => number = Math.random): Promise<Summary> {
  const today = dayKey(new Date(w.end));
  return db.transaction('rw', db.workouts, db.gymLogs, db.kv, async () => {
    const wallet = await getKV<Wallet>('wallet', defaultWallet());
    const streak0 = checkStreak(await getKV<StreakState>('streak', emptyStreak()), today).state;
    const records = await getKV<Records>('records', {});
    const claimed = await getKV<string[]>('questsClaimed', []);
    const todays = await db.workouts.where('day').equals(today).toArray();
    const gymToday = await db.gymLogs.where('day').equals(today).toArray();
    // Tageslimit und Streak gelten für den ganzen Tag, also inklusive Geräteübungen
    const pointsTodayBefore = todays.reduce((s, x) => s + x.points, 0) + gymToday.reduce((s, x) => s + x.points, 0);
    const repsIn = w.reps;
    w = { ...w, reps: w.reps === undefined ? undefined : plausibleReps(w.reps, w.seconds ?? 0, w.mode) };
    // Sätze müssen zur Summe passen; wurde gekürzt oder passt es nicht, gilt alles als ein Satz
    const sets = cleanSetList(w.sets);
    const sum = sets?.reduce((a, b) => a + b, 0);
    const timedAct = ACT[w.activityId].unit === 'time';
    w = { ...w, sets: sets && sum === (timedAct ? w.seconds : w.reps) ? sets : undefined };
    // Strecke gegen Tippfehler/Schummeln prüfen (zu weit oder schneller als Weltrekord)
    if (w.km !== undefined) w = { ...w, km: plausibleKm(w.activityId, w.km, w.seconds ?? 0) };

    const pace = w.km && w.km > 0 && w.seconds ? w.seconds / 60 / w.km : undefined;
    const rc = recordCheck(w.activityId, records, w, pace);
    const breakdown = computePoints({
      activityId: w.activityId,
      reps: w.reps,
      seconds: w.seconds,
      km: w.km,
      pace,
      formValidated: w.mode === 'camera',
      streakDays: streak0.current,
      isRecord: rc.isRecord,
      pointsTodayBefore,
    });

    const gems = computeGems({ points: breakdown.total, firstToday: todays.length + gymToday.length === 0, isRecord: rc.isRecord, rng });

    let streak = streak0;
    let streakIncreased = false;
    // Ein Tag zählt für die Streak, sobald an dem Tag zusammen genug Punkte gesammelt sind
    if (pointsTodayBefore + breakdown.total >= STREAK_MIN_POINTS) {
      const r = registerActiveDay(streak0, today);
      streak = r.state;
      streakIncreased = r.increased;
      if (r.milestoneGems) gems.push({ reason: `Streak-Meilenstein: ${streak.current} Tage`, amount: r.milestoneGems });
    }

    const workout: Workout = {
      day: today,
      activityId: w.activityId,
      mode: w.mode,
      start: w.start,
      end: w.end,
      reps: w.reps ?? 0,
      invalid: w.invalid ?? 0,
      seconds: w.seconds ?? 0,
      km: w.km ?? 0,
      points: breakdown.total,
      gems: 0,
      isRecord: rc.isRecord,
      breakdown,
      gemAwards: [],
      ...(w.sets ? { sets: w.sets } : {}),
    };

    // Tagesaufträge
    const questsCompleted: string[] = [];
    const after = [...todays, workout];
    const dayQuests = await ensureDayQuests(today, w.end);
    const levelsUp: QuestLevels = {};
    for (const q of questsFor(today, await getKV<QuestSwap | null>('questSwap', null), dayQuests)) {
      if (claimed.includes(q.id)) continue;
      if (questProgress(q, after) >= q.target) {
        questsCompleted.push(q.label);
        claimed.push(q.id);
        // Fortschritt im Bereich: künftige Aufträge werden etwas schwerer
        const t = trackOf(q.activityId);
        if (t) levelsUp[t] = (levelsUp[t] ?? 0) + 1;
        gems.push({ reason: `Tagesauftrag: ${q.label}`, amount: 2 });
      }
    }

    const gemSum = gems.reduce((s, g) => s + g.amount, 0);
    workout.gems = gemSum;
    workout.gemAwards = gems;
    const levelBefore = levelFromXp(wallet.xp).level;
    const newWallet: Wallet = { points: wallet.points + breakdown.total, xp: wallet.xp + breakdown.total, gems: wallet.gems + gemSum };

    workout.id = await db.workouts.add(workout);
    await setKV('wallet', newWallet);
    await setKV('streak', streak);
    await setKV('records', rc.next ? { ...records, [w.activityId]: rc.next } : records);
    await setKV('questsClaimed', claimed.slice(-60));
    if (Object.keys(levelsUp).length) {
      const lv = await getKV<QuestLevels>('questLevels', {});
      for (const t of Object.keys(levelsUp) as Track[]) lv[t] = (lv[t] ?? 0) + levelsUp[t]!;
      await setKV('questLevels', lv);
    }

    return {
      workout,
      breakdown,
      gems,
      isRecord: rc.isRecord,
      recordText: rc.text,
      streakBefore: streak0.current,
      streakAfter: streak.current,
      streakIncreased,
      levelBefore,
      levelAfter: levelFromXp(newWallet.xp).level,
      questsCompleted,
      streakMissing: streak.lastActiveDay === today ? 0 : Math.max(0, STREAK_MIN_POINTS - pointsTodayBefore - breakdown.total),
      repsCappedFrom: repsIn !== undefined && w.reps !== undefined && w.reps < repsIn ? repsIn : undefined,
    };
  });
}

/** Letztes Training einer Übung ohne Gerät (für „Letztes Mal“) */
export async function lastWorkoutFor(activityId: ActivityId): Promise<Workout | undefined> {
  const ws = await db.workouts.where('activityId').equals(activityId).toArray();
  return ws.sort((a, b) => b.start - a.start)[0];
}

/** Kennzeichen in Sicherungsdateien. Ältere Sicherungen (App hieß früher PHANTOM) tragen noch 'phantom'. */
export const BACKUP_APP = 'shadow-burn';
export const isBackupApp = (app: unknown): boolean => app === BACKUP_APP || app === 'phantom';

/** Backup: alle Daten als JSON */
export async function exportAll(): Promise<string> {
  const workouts = await db.workouts.toArray();
  const kv = await db.kv.toArray();
  const friends = await db.friends.toArray();
  const gymLogs = await db.gymLogs.toArray();
  const weights = await db.weights.toArray();
  const posts = await db.posts.toArray();
  return JSON.stringify({ app: BACKUP_APP, version: 4, exportedAt: new Date().toISOString(), workouts, kv, friends, gymLogs, weights, posts }, null, 1);
}

export async function importAll(json: string): Promise<void> {
  const data = JSON.parse(json);
  if (!isBackupApp(data?.app) || !Array.isArray(data.workouts) || !Array.isArray(data.kv)) throw new Error(`Keine gültige ${APP_DASH}-Sicherung`);
  await db.transaction('rw', [db.workouts, db.kv, db.friends, db.gymLogs, db.weights, db.posts], async () => {
    await db.workouts.clear();
    await db.kv.clear();
    // Ältere Sicherungen (bis v3) haben keinen Blog: dann bleiben die aktuellen Beiträge erhalten.
    if (Array.isArray(data.posts)) {
      await db.posts.clear();
      await db.posts.bulkPut(data.posts);
    }
    // Geräteübungen gehören zu Punkten/Wallet aus der Sicherung, also immer mit ersetzen.
    await db.gymLogs.clear();
    await db.workouts.bulkAdd(data.workouts);
    if (Array.isArray(data.gymLogs)) await db.gymLogs.bulkAdd(data.gymLogs);
    // Ältere Sicherungen (v1/v2) haben kein Gewicht: dann bleiben die aktuellen Einträge erhalten.
    if (Array.isArray(data.weights)) {
      await db.weights.clear();
      await db.weights.bulkPut(data.weights);
    }
    await db.kv.bulkPut(data.kv);
    // Ältere Sicherungen (v1) haben keine Freunde: dann bleiben die aktuellen erhalten.
    if (Array.isArray(data.friends)) {
      await db.friends.clear();
      await db.friends.bulkPut(data.friends);
    }
  });
}

export async function wipeAll(): Promise<void> {
  await db.transaction('rw', [db.workouts, db.kv, db.friends, db.gymLogs, db.weights, db.posts], async () => {
    // Spieler-ID behalten, damit Freunde dich nach dem Löschen nicht doppelt haben
    const playerId = await getKV<string | null>('playerId', null);
    await db.workouts.clear();
    await db.kv.clear();
    await db.friends.clear();
    await db.gymLogs.clear();
    await db.weights.clear();
    await db.posts.clear();
    if (playerId) await setKV('playerId', playerId);
  });
}

// ---------- Rangliste ----------

function newPlayerId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return Array.from({ length: 4 }, () => Math.random().toString(36).slice(2, 8)).join('-');
}

/** Feste Spieler-ID dieser Installation (wird beim ersten Aufruf angelegt). */
export async function getPlayerId(): Promise<string> {
  let id = await getKV<string | null>('playerId', null);
  if (!id) { id = newPlayerId(); await setKV('playerId', id); }
  return id;
}

/** Eigene Spielerkarte aus den lokalen Daten zusammenbauen. */
export async function buildMyCard(now = new Date()): Promise<PlayerCard> {
  const today = dayKey(now);
  const wk = weekKey(today);
  const [id, profile, wallet, streakRaw, records, weekWorkouts, weekGym, avatarRaw, settings, cosRaw] = await Promise.all([
    getPlayerId(),
    getKV<Profile | null>('profile', null),
    getKV<Wallet>('wallet', defaultWallet()),
    getKV<StreakState>('streak', emptyStreak()),
    getKV<Records>('records', {}),
    db.workouts.where('day').aboveOrEqual(wk).toArray(),
    db.gymLogs.where('day').aboveOrEqual(wk).toArray(),
    getKV<AvatarState | null>('avatar', null),
    getKV<Settings>('settings', defaultSettings()),
    getKV<CosState | null>('cosmetics', null),
  ]);
  const av = normalizeAvatar(avatarRaw);
  const streak = checkStreak(streakRaw, today).state;
  const rec: PlayerCard['rec'] = {};
  for (const [k, r] of Object.entries(records)) {
    const v = recordValue(k as ActivityId, r);
    if (v > 0) rec[k as ActivityId] = v;
  }
  return {
    id,
    name: profile?.name ?? 'Ich',
    level: levelFromXp(wallet.xp).level,
    total: wallet.points,
    week: [...weekWorkouts, ...weekGym].filter((w) => w.day <= today).reduce((s, w) => s + w.points, 0),
    weekKey: wk,
    streak: streak.current,
    longest: streak.longest,
    rec,
    at: now.getTime(),
    av: { skin: av.skin, hair: av.hair, equipped: av.equipped },
    ...(cosLookOf(normalizeCos(cosRaw)) ? { cs: cosLookOf(normalizeCos(cosRaw)) } : {}),
    ...(settings.shareStats ? { st: await buildSharedStats(today) } : {}),
  };
}

/** Statistik-Auszug für die Spielerkarte (nur wenn "Statistik teilen" an ist). */
export async function buildSharedStats(today: string): Promise<SharedStats> {
  const [workouts, gymLogs] = await Promise.all([db.workouts.toArray(), db.gymLogs.toArray()]);
  return sharedStatsFrom(workouts, gymLogs, today);
}

export function sharedStatsFrom(workouts: Workout[], gymLogs: GymLog[], today: string): SharedStats {
  const ws = workouts.filter((w) => w.day <= today);
  const gs = gymLogs.filter((l) => l.day <= today);
  const t = totals(ws, gs);
  const cats = pointsByCategory(ws, gs);
  const body = bodyPartShare(ws, gs);
  const bodySum = body.reduce((s, b) => s + b.value, 0) || 1;
  return {
    sessions: t.sessions,
    activeDays: t.activeDays,
    volume: t.volume,
    weeks: weeklyPoints(pointsPerDay(ws, gs), today, 8).map((w) => w.points),
    cats: STAT_CATS.map((k) => cats.find((c) => c.key === k)?.value ?? 0),
    body: STAT_BODY.map((k) => Math.round(((body.find((b) => b.key === k)?.value ?? 0) / bodySum) * 100)),
  };
}

export type SaveFriendResult = { status: 'new' | 'updated' | 'older' | 'self'; friend?: Friend };

/** Gescannte Karte speichern (neuere Karte gewinnt). */
export async function saveFriend(card: PlayerCard, now = Date.now()): Promise<SaveFriendResult> {
  if (card.id === (await getPlayerId())) return { status: 'self' };
  return db.transaction('rw', db.friends, async () => {
    const r = mergeFriend(await db.friends.get(card.id), card, now);
    await db.friends.put(r.friend);
    return { status: r.status, friend: r.friend };
  });
}

export async function removeFriend(id: string): Promise<void> {
  await db.friends.delete(id);
}

/**
 * Ein Training löschen (z. B. war es ungültig): Punkte, Erfahrung und Gems werden abgezogen,
 * der Rekord der Übung aus den übrigen Trainings neu berechnet. Ein Blog-Beitrag dazu bleibt stehen.
 * Streak, Tagesauftrag und Abzeichen dreht undoSideEffects zurück.
 */
export async function deleteWorkout(id: number, now = new Date()): Promise<void> {
  await db.transaction('rw', [db.workouts, db.gymLogs, db.kv, db.friends], async () => {
    const wk = await db.workouts.get(id);
    if (!wk) return;
    await db.workouts.delete(id);
    const w = await getKV<Wallet>('wallet', defaultWallet());
    await setKV('wallet', { points: Math.max(0, w.points - wk.points), xp: Math.max(0, w.xp - wk.points), gems: Math.max(0, w.gems - wk.gems) });
    const records = await getKV<Records>('records', {});
    const rest = await db.workouts.where('activityId').equals(wk.activityId).toArray();
    const r: NonNullable<Records[ActivityId]> = {};
    for (const x of rest) {
      // Rekord = bester Satz (ältere Einträge ohne Sätze: das ganze Training)
      if (x.reps > 0) r.reps = Math.max(r.reps ?? 0, bestOfSets(ACT[x.activityId].unit === 'reps' ? x.sets : undefined, x.reps));
      if (x.seconds > 0 && ACT[x.activityId].unit === 'time') r.seconds = Math.max(r.seconds ?? 0, bestOfSets(x.sets, x.seconds));
      if (x.km > 0) {
        r.km = Math.max(r.km ?? 0, x.km);
        if (x.km >= 1 && x.seconds > 0) r.pace = Math.min(r.pace ?? Infinity, x.seconds / 60 / x.km);
      }
    }
    const next = { ...records };
    if (Object.keys(r).length) next[wk.activityId] = r; else delete next[wk.activityId];
    await setKV('records', next);
    await undoSideEffects({ day: wk.day, points: wk.points, gemAwards: wk.gemAwards }, dayKey(now));
  });
}
