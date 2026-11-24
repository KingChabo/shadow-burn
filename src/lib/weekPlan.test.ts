import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db, getKV, setKV, type Workout } from './db';
import { applyPlan, checkStreak, registerActiveDay, type StreakState } from './streak';
import { canMove, defaultPlanDays, entryFor, mondayOf, movePlanDay, validDays, weekdayOf, type WeekPlan } from './weekPlan';
import { finishWorkout, moveTrainingDay, saveWeekPlan, startupCheck, type Wallet } from './game';
import { streakWithout } from './undo';

// Woche: Mo 23.11. · Di 24. · Mi 25. · Do 26. · Fr 27. · Sa 28. · So 29. · Mo 30.
const MO_MI_FR: WeekPlan = { on: true, days: ['Brust', null, 'Beine', null, '', null, null] };
const base = (over: Partial<StreakState> = {}): StreakState =>
  ({ current: 5, longest: 5, lastActiveDay: '2026-11-23', locks: 0, plan: MO_MI_FR, ...over });

describe('Wochenplan Grundlagen', () => {
  it('Wochentag und Montag', () => {
    expect(weekdayOf('2026-11-23')).toBe(0);
    expect(weekdayOf('2026-11-29')).toBe(6);
    expect(mondayOf('2026-11-29')).toBe('2026-11-23');
    expect(mondayOf('2026-11-30')).toBe('2026-11-30');
  });
  it('mindestens 2 Trainingstage', () => {
    expect(validDays(defaultPlanDays())).toBe(true);
    expect(validDays(['', null, null, null, null, null, null])).toBe(false);
  });
  it('zeigt, was an einem Tag dran ist', () => {
    expect(entryFor(MO_MI_FR, '2026-11-25')).toBe('Beine');
    expect(entryFor(MO_MI_FR, '2026-11-24')).toBeNull();
  });
});

describe('Streak mit Wochenplan', () => {
  it('Ruhetag zählt mit, heute sofort', () => {
    const r = checkStreak(base(), '2026-11-24');
    expect(r.state.current).toBe(6);
    expect(r.state.lastActiveDay).toBe('2026-11-24');
    expect(r.broken).toBe(false);
  });
  it('heutiger Trainingstag bleibt bis Mitternacht offen', () => {
    const r = checkStreak(base(), '2026-11-25');
    expect(r.state.current).toBe(6); // Di Ruhetag gezählt
    expect(r.state.lastActiveDay).toBe('2026-11-24');
    expect(r.broken).toBe(false);
  });
  it('geplanter Trainingstag ohne Training: Streak gelöscht', () => {
    const r = checkStreak(base(), '2026-11-26');
    expect(r.broken).toBe(true);
    expect(r.lostStreak).toBe(5);
    expect(r.state.current).toBe(0);
  });
  it('Streak-Schutz rettet einen verpassten Trainingstag', () => {
    const r = checkStreak(base({ locks: 1 }), '2026-11-26');
    expect(r.broken).toBe(false);
    expect(r.usedLocks).toBe(1);
    expect(r.state.current).toBe(7); // Di und Do Ruhetage, Mi überbrückt
  });
  it('Training am Ruhetag: Streak bleibt gleich', () => {
    const s = checkStreak(base(), '2026-11-24').state;
    const r = registerActiveDay(s, '2026-11-24');
    expect(r.increased).toBe(false);
    expect(r.state.current).toBe(6);
  });
  it('Training am Trainingstag: +1', () => {
    const r = registerActiveDay(base(), '2026-11-25');
    expect(r.state.current).toBe(7); // Di Ruhetag + Mi Training
  });
  it('ohne Streak startet sie mit dem ersten Training, auch an einem Ruhetag', () => {
    const s = base({ current: 0, longest: 0, lastActiveDay: null });
    expect(checkStreak(s, '2026-11-24').state.current).toBe(0);
    expect(registerActiveDay(s, '2026-11-24').state.current).toBe(1);
  });
  it('kein freier Ruhetag im Plan-Modus', () => {
    // Mi verpasst, obwohl restDay lange her ist
    expect(checkStreak(base({ restDay: null }), '2026-11-26').broken).toBe(true);
  });
  it('Meilenstein durch einen Ruhetag', () => {
    const r = checkStreak(base({ current: 6, longest: 6 }), '2026-11-24');
    expect(r.state.current).toBe(7);
    expect(r.milestoneGems).toBe(10);
  });
  it('Gelöschtes Training an einem Ruhetag ändert nichts', () => {
    const s = base({ current: 6, lastActiveDay: '2026-11-24' });
    expect(streakWithout(s, '2026-11-24')).toEqual(s);
  });
  it('Gelöschtes Training an einem vergangenen Trainingstag: ohne Schutz reißt die Streak', () => {
    const s = base({ current: 8, longest: 8, lastActiveDay: '2026-11-26' }); // Mo 23. trainiert, … Do 26.
    const r = streakWithout(s, '2026-11-23');
    expect(r.current).toBe(3);
  });
});

describe('Trainingstage verschieben', () => {
  it('Mi → Do am Mittwoch', () => {
    expect(canMove(MO_MI_FR, '2026-11-25', '2026-11-26', '2026-11-25', false).ok).toBe(true);
    const p = movePlanDay(MO_MI_FR, '2026-11-25', '2026-11-26');
    expect(entryFor(p, '2026-11-25')).toBeNull();
    expect(entryFor(p, '2026-11-26')).toBe('Beine');
    // nächste Woche gilt wieder der normale Plan
    expect(entryFor(p, '2026-12-02')).toBe('Beine');
    expect(entryFor(p, '2026-12-03')).toBeNull();
  });
  it('Verschieben zählt nicht als verpasst', () => {
    // Mittwoch, Training noch nicht gemacht → auf Do verschoben → Mi ist jetzt Ruhetag und zählt
    const s = checkStreak(base(), '2026-11-25').state;
    const moved = applyPlan(s, movePlanDay(MO_MI_FR, '2026-11-25', '2026-11-26'), '2026-11-25');
    expect(moved.current).toBe(7);
    expect(moved.lastActiveDay).toBe('2026-11-25');
    // Do wird trainiert → 8, Fr verpasst → reißt erst am Samstag
    const thu = registerActiveDay(moved, '2026-11-26').state;
    expect(thu.current).toBe(8);
    expect(checkStreak(thu, '2026-11-28').broken).toBe(true);
  });
  it('Verbote: Vergangenheit, andere Woche, Ruhetag→, auf Trainingstag, heute schon trainiert', () => {
    expect(canMove(MO_MI_FR, '2026-11-23', '2026-11-24', '2026-11-24', false).ok).toBe(false);
    expect(canMove(MO_MI_FR, '2026-11-25', '2026-11-24', '2026-11-25', false).ok).toBe(false);
    expect(canMove(MO_MI_FR, '2026-11-27', '2026-11-30', '2026-11-25', false).ok).toBe(false);
    expect(canMove(MO_MI_FR, '2026-11-26', '2026-11-28', '2026-11-25', false).ok).toBe(false);
    expect(canMove(MO_MI_FR, '2026-11-25', '2026-11-27', '2026-11-25', false).ok).toBe(false);
    expect(canMove(MO_MI_FR, '2026-11-25', '2026-11-26', '2026-11-25', true).ok).toBe(false);
  });
  it('Training auf heute (gezählter Ruhetag) vorziehen: heute wird wieder offen', () => {
    const s = checkStreak(base(), '2026-11-24').state; // Di als Ruhetag gezählt → 6
    const moved = applyPlan(s, movePlanDay(MO_MI_FR, '2026-11-25', '2026-11-24'), '2026-11-24');
    expect(moved.current).toBe(5);
    expect(moved.lastActiveDay).toBe('2026-11-23');
    // Mi ist jetzt Ruhetag; Di trainiert → 6, Mi zählt automatisch → 7
    const tue = registerActiveDay(moved, '2026-11-24').state;
    expect(checkStreak(tue, '2026-11-25').state.current).toBe(7);
  });
});

describe('Umstellen ohne Streak-Verlust', () => {
  it('jeden Tag → Plan: Streak bleibt, heutiger Ruhetag zählt', () => {
    const daily: StreakState = { current: 12, longest: 12, lastActiveDay: '2026-11-23', locks: 0 };
    const r = applyPlan(daily, MO_MI_FR, '2026-11-24');
    expect(r.current).toBe(13);
    expect(r.plan?.on).toBe(true);
  });
  it('Plan → jeden Tag am Ruhetag: heute muss wieder trainiert werden, Streak bleibt', () => {
    const s = checkStreak(base(), '2026-11-24').state;
    const r = applyPlan(s, { ...MO_MI_FR, on: false }, '2026-11-24');
    expect(r.current).toBe(5);
    expect(r.lastActiveDay).toBe('2026-11-23');
    expect(checkStreak(r, '2026-11-24').broken).toBe(false);
  });
  it('ausgeschalteter Plan verhält sich wie vorher (freier Ruhetag)', () => {
    const s: StreakState = { current: 5, longest: 5, lastActiveDay: '2026-11-23', locks: 0, plan: { ...MO_MI_FR, on: false } };
    const r = checkStreak(s, '2026-11-25');
    expect(r.usedRest).toBe(true);
    expect(r.broken).toBe(false);
  });
});

describe('Speichern in der App', () => {
  const at = (day: string, h = 18) => new Date(`${day}T${String(h).padStart(2, '0')}:00:00`);
  const push = (day: string, reps = 40) =>
    finishWorkout({ activityId: 'pushup', mode: 'manual', start: at(day).getTime() - 60000, end: at(day).getTime(), reps, seconds: 60 }, () => 1);

  beforeEach(async () => { await db.workouts.clear(); await db.kv.clear(); await db.gymLogs.clear(); });

  it('Plan speichern, Ruhetag zählt beim Start, Training am Ruhetag bleibt gleich', async () => {
    await push('2026-11-23');
    expect(await saveWeekPlan(true, ['', null, null, null, null, null, null], at('2026-11-23'))).toMatch(/2 Trainingstage/);
    expect(await saveWeekPlan(true, MO_MI_FR.days, at('2026-11-23'))).toBeNull();
    await startupCheck(at('2026-11-24', 8));
    let s = await getKV<StreakState>('streak', null as never);
    expect(s.current).toBe(2);
    const w = await push('2026-11-24');
    expect(w.streakIncreased).toBe(false);
    s = await getKV<StreakState>('streak', null as never);
    expect(s.current).toBe(2);
  });

  it('Verschieben über die App und Meilenstein-Gems am Ruhetag', async () => {
    await setKV<StreakState>('streak', { ...base({ current: 6, longest: 6, lastActiveDay: '2026-11-25' }) });
    await setKV<Wallet>('wallet', { points: 0, xp: 0, gems: 0 });
    expect(await moveTrainingDay('2026-11-27', '2026-11-26', at('2026-11-25'))).toBeNull();
    // Do ist jetzt Training, Fr Ruhetag
    await push('2026-11-26');
    await startupCheck(at('2026-11-27', 8));
    const s = await getKV<StreakState>('streak', null as never);
    expect(s.current).toBe(8);
    const wallet = await getKV<Wallet>('wallet', null as never);
    expect(wallet.gems).toBeGreaterThan(0);
    expect(await moveTrainingDay('2026-11-25', '2026-11-28', at('2026-11-27'))).not.toBeNull();
  });

  it('Bestehende Daten ohne Plan bleiben unverändert', async () => {
    const old: StreakState = { current: 9, longest: 9, lastActiveDay: '2026-11-23', locks: 1 };
    await setKV('streak', old);
    await startupCheck(at('2026-11-24', 8));
    expect(await getKV<StreakState>('streak', null as never)).toEqual(old);
    const ws: Workout[] = await db.workouts.toArray();
    expect(ws.length).toBe(0);
  });
});
