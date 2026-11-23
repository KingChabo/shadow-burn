import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db, getKV, type GymLog, type Workout } from './db';
import { cleanSets, computeGymPoints, finishGym, nextKg, oneRepMax, setPoints, volume, weightHint } from './gym';
import { saveWeight, allWeights } from './body';
import { exportAll, importAll, wipeAll, buildMyCard } from './game';
import {
  activeRuns, bodyPartShare, calendarWeeks, exerciseProgress, filterRange, pointsByCategory, pointsPerDay, totals, weeklyPoints, weightStats,
} from './stats';
import { GYM_EXERCISES } from '../data/gym';
import type { StreakState } from './streak';
import type { Wallet } from './game';

const bench = GYM_EXERCISES.find((e) => e.id === 'bench')!;
const at = (day: string, h = 18) => new Date(`${day}T${String(h).padStart(2, '0')}:00:00`).getTime();

beforeEach(async () => {
  await db.workouts.clear(); await db.kv.clear(); await db.friends.clear(); await db.gymLogs.clear(); await db.weights.clear();
});

describe('Geräte-Punkte', () => {
  it('12 × 60 kg = 24 Punkte', () => {
    expect(setPoints({ reps: 12, kg: 60 })).toBe(24);
    expect(setPoints({ reps: 10, kg: 0 })).toBe(5);
  });
  it('Sätze säubern: leere raus, Grenzen, Viertel-kg', () => {
    expect(cleanSets([{ reps: 0, kg: 50 }, { reps: 12.4, kg: 22.6 }, { reps: 999, kg: 9999 }])).toEqual([
      { reps: 12, kg: 22.5 }, { reps: 100, kg: 1000 },
    ]);
  });
  it('Volumen und 1RM', () => {
    expect(volume([{ reps: 10, kg: 50 }, { reps: 8, kg: 60 }])).toBe(980);
    expect(oneRepMax({ reps: 1, kg: 100 })).toBe(100);
    expect(oneRepMax({ reps: 10, kg: 60 })).toBe(80);
  });
  it('Streak-Bonus und Tageslimit', () => {
    const b = computeGymPoints({ sets: [{ reps: 10, kg: 100 }], streakDays: 25, isRecord: false, pointsTodayBefore: 0 });
    expect(b.base).toBe(30);
    expect(b.total).toBe(45);
    const c = computeGymPoints({ sets: [{ reps: 10, kg: 100 }], streakDays: 0, isRecord: false, pointsTodayBefore: 1500 });
    expect(c.total).toBe(15);
    expect(c.antiFarmCut).toBe(15);
  });
});

describe('Geräteübung speichern', () => {
  it('Punkte, Gems, Streak und Rekord', async () => {
    const s1 = await finishGym({ exercise: bench, sets: [{ reps: 12, kg: 60 }, { reps: 10, kg: 60 }], start: at('2026-11-20'), end: at('2026-11-20') }, () => 0.9);
    expect(s1.breakdown.total).toBe(44);
    expect(s1.isRecord).toBe(false); // erstes Mal setzt nur die Messlatte
    expect(s1.streakIncreased).toBe(true);
    const w1 = await getKV<Wallet>('wallet', { points: 0, gems: 0, xp: 0 });
    expect(w1.points).toBe(44);
    expect(w1.gems).toBe(1); // erstes Training heute (unter 50 Punkten)

    const s2 = await finishGym({ exercise: bench, sets: [{ reps: 8, kg: 65 }], start: at('2026-11-21'), end: at('2026-11-21') }, () => 0.9);
    expect(s2.isRecord).toBe(true);
    expect(s2.recordText).toContain('65 kg');
    expect(s2.breakdown.recordBonus).toBe(50);
    expect((await getKV<StreakState>('streak', null as never)).current).toBe(2);
    expect(await db.gymLogs.count()).toBe(2);
  });
  it('ohne gültigen Satz wird nichts gespeichert', async () => {
    await expect(finishGym({ exercise: bench, sets: [{ reps: 0, kg: 50 }], start: 1, end: 2 })).rejects.toThrow();
    expect(await db.gymLogs.count()).toBe(0);
  });
  it('Wochenpunkte der Rangliste zählen Geräte mit', async () => {
    await finishGym({ exercise: bench, sets: [{ reps: 10, kg: 100 }], start: at('2026-11-21'), end: at('2026-11-21') }, () => 0.9);
    const card = await buildMyCard(new Date(at('2026-11-21', 20)));
    expect(card.week).toBe(30);
  });
});

describe('Körpergewicht', () => {
  it('ein Wert pro Tag, Grenzen', async () => {
    await saveWeight(80.24, '2026-11-01');
    await saveWeight(79.5, '2026-11-01');
    await saveWeight(78, '2026-11-10');
    expect(await allWeights()).toEqual([
      expect.objectContaining({ day: '2026-11-01', kg: 79.5 }),
      expect.objectContaining({ day: '2026-11-10', kg: 78 }),
    ]);
    await expect(saveWeight(5)).rejects.toThrow();
  });
});

describe('Sicherung', () => {
  it('Export/Import mit Geräten und Gewicht; alte Sicherung behält Gewicht', async () => {
    await finishGym({ exercise: bench, sets: [{ reps: 5, kg: 80 }], start: at('2026-11-21'), end: at('2026-11-21') }, () => 0.9);
    await saveWeight(80, '2026-11-21');
    const json = await exportAll();
    await wipeAll();
    expect(await db.gymLogs.count()).toBe(0);
    expect(await db.weights.count()).toBe(0);
    await importAll(json);
    expect(await db.gymLogs.count()).toBe(1);
    expect(await db.weights.count()).toBe(1);
    // v2-Sicherung ohne gymLogs/weights
    const old = JSON.parse(json); delete old.gymLogs; delete old.weights; old.version = 2;
    await importAll(JSON.stringify(old));
    expect(await db.gymLogs.count()).toBe(0);
    expect(await db.weights.count()).toBe(1);
  });
});

const wo = (day: string, activityId: Workout['activityId'], points: number): Workout => ({
  day, activityId, mode: 'manual', start: at(day), end: at(day), reps: 10, invalid: 0, seconds: 60, km: 0, points, gems: 0, isRecord: false,
  breakdown: { base: points, formBonus: 0, paceBonus: 0, streakBonus: 0, recordBonus: 0, antiFarmCut: 0, total: points }, gemAwards: [],
});
const gl = (day: string, exerciseId: string, sets: { reps: number; kg: number }[], points: number): GymLog => ({
  day, start: at(day), end: at(day), exerciseId, name: GYM_EXERCISES.find((e) => e.id === exerciseId)?.name ?? exerciseId, group: 'brust', sets,
  volume: volume(sets), points, gems: 0, isRecord: false,
  breakdown: { base: points, formBonus: 0, paceBonus: 0, streakBonus: 0, recordBonus: 0, antiFarmCut: 0, total: points },
});

describe('Statistik', () => {
  const today = '2026-11-21';
  const workouts = [wo('2026-11-21', 'pushup', 40), wo('2026-11-20', 'jog', 50), wo('2026-10-01', 'plank', 10)];
  const gymLogs = [gl('2026-11-19', 'bench', [{ reps: 10, kg: 60 }], 20), gl('2026-11-21', 'bench', [{ reps: 8, kg: 70 }], 22)];

  it('Zeitraum filtern und Summen', () => {
    const f = filterRange({ workouts, gymLogs, weights: [], today, rangeDays: 7 });
    expect(f.workouts.length).toBe(2);
    expect(totals(f.workouts, f.gymLogs)).toEqual({ sessions: 4, points: 132, activeDays: 3, volume: 1160, sets: 2 });
  });
  it('Kreisdiagramm nach Art und Körperpartie', () => {
    expect(pointsByCategory(workouts, gymLogs).map((s) => [s.key, s.value])).toEqual([
      ['kraft', 40], ['core', 10], ['ausdauer', 50], ['geraete', 42],
    ]);
    const body = Object.fromEntries(bodyPartShare([wo(today, 'pushup', 1)], [gl(today, 'bench', [], 0)]).map((s) => [s.key, s.value]));
    // Liegestütze: Brust/Arme/Schultern voll, Bauch halb; Bankdrücken: Brust/Arme voll, Schultern halb
    expect(body).toEqual({ brust: 2, arme: 2, schultern: 1.5, bauch: 0.5 });
  });
  it('Kalender, Wochen und Serien', () => {
    const per = pointsPerDay(workouts, gymLogs);
    expect(per.get('2026-11-21')).toBe(62);
    const weeks = calendarWeeks(today, 2);
    expect(weeks[0][0]).toBe('2026-11-09');
    expect(weeks[1][6]).toBe('2026-11-22');
    expect(weeklyPoints(per, today, 1)).toEqual([{ week: '2026-11-16', points: 132 }]);
    expect(activeRuns(per, today)).toEqual({ current: 3, longest: 3 });
    expect(activeRuns(per, '2026-11-23').current).toBe(0);
  });
  it('Gewichtsverlauf', () => {
    const s = weightStats([{ day: '2026-11-10', kg: 78, at: 0 }, { day: '2026-11-01', kg: 80.5, at: 0 }, { day: '2026-11-20', kg: 78.4, at: 0 }])!;
    expect(s.first.day).toBe('2026-11-01');
    expect(s.change).toBe(-2.1);
    expect(s.min).toBe(78);
    expect(weightStats([])).toBeNull();
  });
  it('Kraftentwicklung pro Übung', () => {
    const p = exerciseProgress(gymLogs);
    expect(p[0]).toMatchObject({ exerciseId: 'bench', sessions: 2, bestKg: 70, bestReps: 8 });
    expect(p[0].series).toEqual([{ day: '2026-11-19', kg: 60 }, { day: '2026-11-21', kg: 70 }]);
  });
});

describe('Hinweis mehr Gewicht', () => {
  it('kein Hinweis bei normalen Sätzen', () => {
    expect(weightHint([{ reps: 10, kg: 60 }, { reps: 10, kg: 60 }, { reps: 10, kg: 60 }])).toBeNull();
  });
  it('kein Hinweis bei nur 2 Sätzen', () => {
    expect(weightHint([{ reps: 25, kg: 40 }, { reps: 22, kg: 40 }])).toBeNull();
  });
  it('kein Hinweis, wenn ein Satz unter 20 liegt', () => {
    expect(weightHint([{ reps: 20, kg: 40 }, { reps: 20, kg: 40 }, { reps: 18, kg: 40 }])).toBeNull();
  });
  it('Aufwärmsätze zählen nicht', () => {
    expect(weightHint([{ reps: 25, kg: 20, warmup: true }, { reps: 20, kg: 40 }, { reps: 20, kg: 40 }])).toBeNull();
  });
  it('3 × 20 → mehr Gewicht', () => {
    const h = weightHint([{ reps: 20, kg: 40 }, { reps: 21, kg: 40 }, { reps: 20, kg: 40 }]);
    expect(h?.to).toBe(42.5);
  });
  it('ohne Gewicht → Zusatzgewicht', () => {
    expect(weightHint([{ reps: 25, kg: 0 }, { reps: 25, kg: 0 }, { reps: 25, kg: 0 }])?.text).toMatch(/Zusatzgewicht/);
  });
  it('Stufen', () => {
    expect(nextKg(5)).toBe(6);
    expect(nextKg(100)).toBe(105);
    expect(nextKg(20)).toBe(22.5);
  });
});
