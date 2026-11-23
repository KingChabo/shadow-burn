import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db, getKV, setKV } from './db';
import { deleteWorkout, finishWorkout, buildMyCard, type Wallet } from './game';
import { deleteGymLog, finishGym } from './gym';
import { streakWithout } from './undo';
import type { StreakState } from './streak';
import { GYM_EXERCISES } from '../data/gym';
import type { Claimed } from './badges';

const at = (day: string, h = 18) => new Date(`${day}T${String(h).padStart(2, '0')}:00:00`).getTime();
const push = (day: string, reps: number, h = 18) =>
  finishWorkout({ activityId: 'pushup', mode: 'manual', start: at(day, h) - 60000, end: at(day, h), reps, seconds: 60 }, () => 1);

beforeEach(async () => {
  await db.workouts.clear(); await db.kv.clear(); await db.friends.clear(); await db.gymLogs.clear(); await db.posts.clear();
});

describe('streakWithout', () => {
  const s: StreakState = { current: 5, longest: 5, lastActiveDay: '2026-11-22', locks: 1, restDay: null };
  it('heute zählt nicht mehr: Streak −1, gestern bleibt letzter Tag', () => {
    expect(streakWithout(s, '2026-11-22')).toMatchObject({ current: 4, longest: 4, lastActiveDay: '2026-11-21' });
  });
  it('einziger Tag: Streak weg', () => {
    expect(streakWithout({ ...s, current: 1, longest: 3 }, '2026-11-22')).toMatchObject({ current: 0, longest: 3, lastActiveDay: null });
  });
  it('früherer Tag: freier Ruhetag', () => {
    expect(streakWithout(s, '2026-11-20')).toMatchObject({ current: 4, restDay: '2026-11-20', locks: 1 });
  });
  it('früherer Tag ohne Ruhetag: Lock', () => {
    expect(streakWithout({ ...s, restDay: '2026-11-19' }, '2026-11-20')).toMatchObject({ current: 4, locks: 0 });
  });
  it('früherer Tag ohne Ruhetag und Lock: Streak reißt', () => {
    expect(streakWithout({ ...s, restDay: '2026-11-19', locks: 0 }, '2026-11-20')).toMatchObject({ current: 2, longest: 2 });
  });
  it('Tag außerhalb der Streak: nichts ändert sich', () => {
    expect(streakWithout(s, '2026-11-10')).toEqual(s);
  });
});

describe('Training löschen wirkt überall', () => {
  it('Punkte, Streak, Rangliste-Karte; Blog-Beitrag bleibt', async () => {
    await push('2026-11-21', 40);
    const w = await push('2026-11-22', 40);
    expect((await getKV<StreakState>('streak', null as never)).current).toBe(2);
    await db.posts.put({ id: 'p1', author: 'me', workoutId: w.workout.id } as never);
    await db.posts.put({ id: 'p2', author: 'friend', workoutId: w.workout.id, receivedAt: 1 } as never);

    await deleteWorkout(w.workout.id!, new Date(at('2026-11-22', 20)));

    const streak = await getKV<StreakState>('streak', null as never);
    expect(streak.current).toBe(1);
    expect(streak.lastActiveDay).toBe('2026-11-21');
    const wallet = await getKV<Wallet>('wallet', null as never);
    const rest = await db.workouts.toArray();
    expect(wallet.points).toBe(rest.reduce((s, x) => s + x.points, 0));
    expect(wallet.gems).toBe(rest.reduce((s, x) => s + x.gems, 0));
    const card = await buildMyCard(new Date(at('2026-11-22', 20)));
    expect(card.total).toBe(wallet.points);
    expect(card.streak).toBe(1);
    expect((await db.posts.toArray()).map((p) => p.id).sort()).toEqual(['p1', 'p2']);
  });

  it('Tag bleibt über 30 Punkte: Streak unverändert', async () => {
    await push('2026-11-22', 60, 10);
    const w = await push('2026-11-22', 40, 12);
    await deleteWorkout(w.workout.id!, new Date(at('2026-11-22', 20)));
    expect((await getKV<StreakState>('streak', null as never)).current).toBe(1);
  });

  it('Tagesauftrag wird wieder offen', async () => {
    const w = await push('2026-11-22', 100);
    const quest = w.gems.find((g) => g.reason.startsWith('Tagesauftrag'));
    const before = await getKV<string[]>('questsClaimed', []);
    await deleteWorkout(w.workout.id!, new Date(at('2026-11-22', 20)));
    const after = await getKV<string[]>('questsClaimed', []);
    if (quest) expect(after.length).toBe(before.length - 1);
    else expect(after).toEqual(before);
  });

  it('Abzeichen-Stufe und ihre Gems gehen zurück', async () => {
    const w = await push('2026-11-22', 100);
    await setKV<Claimed>('badges', { pushups: 1 });
    await setKV<Wallet>('wallet', { ...(await getKV<Wallet>('wallet', null as never)), gems: 50 });
    await deleteWorkout(w.workout.id!, new Date(at('2026-11-22', 20)));
    expect((await getKV<Claimed>('badges', {})).pushups).toBe(0);
    expect((await getKV<Wallet>('wallet', null as never)).gems).toBe(Math.max(0, 50 - w.workout.gems - 10));
  });

  it('Geräteübung löschen: Streak zurück', async () => {
    const bench = GYM_EXERCISES.find((e) => e.id === 'bench')!;
    const r = await finishGym({ exercise: bench, sets: [{ reps: 10, kg: 60 }, { reps: 10, kg: 60 }, { reps: 10, kg: 60 }], start: at('2026-11-22'), end: at('2026-11-22') }, () => 1);
    expect((await getKV<StreakState>('streak', null as never)).current).toBe(1);
    await deleteGymLog(r.log.id!, new Date(at('2026-11-22', 20)));
    expect((await getKV<StreakState>('streak', null as never)).current).toBe(0);
  });
});
