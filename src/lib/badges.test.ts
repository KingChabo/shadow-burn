import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { BADGES, badgeStates, MAX_TIER, newTiers, syncBadges, tierOf, TIER_GEMS } from './badges';
import { db, getKV, setKV, type Workout } from './db';

const wo = (activityId: Workout['activityId'], reps: number, extra: Partial<Workout> = {}): Workout => ({
  day: '2026-11-01', activityId, mode: 'manual', start: new Date('2026-11-01T10:00').getTime(), end: 0, reps, invalid: 0, seconds: 0, km: 0, points: 10, gems: 0,
  isRecord: false, breakdown: {} as Workout['breakdown'], gemAwards: [], ...extra,
});
const base = { gymLogs: [], streak: { current: 0, longest: 0, lastActiveDay: null, locks: 0 }, xp: 0, friends: 0 };

describe('Abzeichen', () => {
  it('Stufen', () => {
    expect(tierOf(0, [10, 20, 30])).toBe(0);
    expect(tierOf(10, [10, 20, 30])).toBe(1);
    expect(tierOf(29, [10, 20, 30])).toBe(2);
    expect(tierOf(31, [10, 20, 30])).toBe(3);
    const seven = [10, 20, 30, 40, 50, 60, 70];
    expect(tierOf(30, seven)).toBe(3);
    expect(tierOf(45, seven)).toBe(4);
    expect(tierOf(69, seven)).toBe(6);
    expect(tierOf(10_000, seven)).toBe(7);
  });
  it('Bronze, Silber und Gold bleiben wie vorher, darüber 4 neue Stufen', () => {
    const gold: Record<string, number[]> = {
      pushups: [100, 500, 2000], squats: [100, 500, 2000], situps: [100, 500, 2000], run: [10, 50, 200], distance: [25, 150, 600],
      plank: [5, 30, 120], camera: [50, 500, 2000], gymsets: [50, 300, 1500], tons: [1, 25, 250], streak: [7, 30, 100],
      days: [10, 60, 250], early: [1, 10, 40], records: [5, 25, 100], level: [10, 25, 50], friends: [1, 5, 15],
    };
    for (const b of BADGES) {
      expect(b.steps).toHaveLength(MAX_TIER);
      expect(b.steps.slice(0, 3)).toEqual(gold[b.id]);
      for (let i = 1; i < b.steps.length; i++) expect(b.steps[i]).toBeGreaterThan(b.steps[i - 1]);
    }
    expect(TIER_GEMS.slice(0, 4)).toEqual([0, 10, 25, 60]);
  });
  it('Shadow: Ring voll, Ziel bleibt das Shadow-Ziel', () => {
    const s = badgeStates({ ...base, workouts: [wo('pushup', 120_000)] }).find((b) => b.def.id === 'pushups')!;
    expect(s.tier).toBe(7);
    expect(s.target).toBe(100_000);
    expect(s.progress).toBe(1);
  });
  it('Gold → Platin: Fortschritt ab dem Gold-Ziel', () => {
    const s = badgeStates({ ...base, workouts: [wo('pushup', 3500)] }).find((b) => b.def.id === 'pushups')!;
    expect(s.tier).toBe(3);
    expect(s.target).toBe(5000);
    expect(s.progress).toBeCloseTo(0.5);
  });
  it('alter Stand (Gold belohnt) bleibt gültig, nur neue Stufen geben Gems', () => {
    const states = badgeStates({ ...base, workouts: [wo('pushup', 16_000)] });
    expect(newTiers(states, { pushups: 3 }).gems).toBe(125 + 250);
    expect(newTiers(badgeStates({ ...base, workouts: [wo('pushup', 2500)] }), { pushups: 3 }).badges).toHaveLength(0);
  });
  it('Fortschritt zum nächsten Ziel', () => {
    const s = badgeStates({ ...base, workouts: [wo('pushup', 300)] }).find((b) => b.def.id === 'pushups')!;
    expect(s.tier).toBe(1);
    expect(s.target).toBe(500);
    expect(s.progress).toBeCloseTo(0.5);
  });
  it('Gems nur für neue Stufen', () => {
    const states = badgeStates({ ...base, workouts: [wo('pushup', 600)] });
    expect(newTiers(states, {}).gems).toBe(10 + 25);
    expect(newTiers(states, { pushups: 1 }).gems).toBe(25);
    expect(newTiers(states, { pushups: 2 }).badges.find((b) => b.def.id === 'pushups')).toBeUndefined();
  });
  it('eindeutige IDs und Kürzel', () => {
    expect(new Set(BADGES.map((b) => b.id)).size).toBe(BADGES.length);
    expect(new Set(BADGES.map((b) => b.short)).size).toBe(BADGES.length);
  });
});

describe('Abzeichen speichern', () => {
  beforeEach(async () => { await db.delete(); await db.open(); });
  it('schreibt Gems einmal gut', async () => {
    await setKV('wallet', { points: 0, gems: 5, xp: 0 });
    await db.workouts.add(wo('pushup', 120));
    await syncBadges();
    await syncBadges();
    expect((await getKV<{ gems: number }>('wallet', { gems: 0 })).gems).toBe(15);
    expect(await getKV('badgeNotice', [])).toEqual(['pushups']);
  });
  it('Update: gespeicherte Gold-Stufe bleibt, Platin kommt dazu', async () => {
    await setKV('wallet', { points: 0, gems: 0, xp: 0 });
    await setKV('badges', { pushups: 3, squats: 2 });
    await db.workouts.add(wo('pushup', 5200));
    await syncBadges();
    expect(await getKV('badges', {})).toEqual({ pushups: 4, squats: 2 });
    expect((await getKV<{ gems: number }>('wallet', { gems: 0 })).gems).toBe(125);
  });
});
