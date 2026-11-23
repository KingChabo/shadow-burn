import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db, getKV } from './db';
import { deleteWorkout, finishWorkout } from './game';
import { questsFor } from './quests';
import { getWeightGoal, setWeightGoal } from './body';
import type { Wallet, Records } from './game';
import { deleteGymLog, finishGym, lastLogFor, setPoints, volume, type GymRecords } from './gym';
import { plausibleReps } from './scoring';
import { GYM_EXERCISES } from '../data/gym';
import type { StreakState } from './streak';

const lat = GYM_EXERCISES.find((e) => e.id === 'lat_pulldown')!;
const row = GYM_EXERCISES.find((e) => e.id === 'cable_row')!;
const at = (day: string, h = 18) => new Date(`${day}T${String(h).padStart(2, '0')}:00:00`).getTime();

beforeEach(async () => {
  await db.workouts.clear(); await db.kv.clear(); await db.friends.clear(); await db.gymLogs.clear(); await db.weights.clear();
});

describe('Plausible Wiederholungen', () => {
  it('von Hand bis 100 immer ok, mehr nur mit genug Zeit', () => {
    expect(plausibleReps(80, 2, 'manual')).toBe(80);
    expect(plausibleReps(9999, 2, 'manual')).toBe(100);
    expect(plausibleReps(200, 120, 'manual')).toBe(200);
    expect(plausibleReps(9999, 3600, 'manual')).toBe(500);
  });
  it('Kamera/Nasen-Tap: nur Obergrenze pro Training', () => {
    expect(plausibleReps(300, 10, 'camera')).toBe(300);
    expect(plausibleReps(800, 9999, 'nosetap')).toBe(500);
  });
  it('9999 Hampelmänner in 2 Sekunden bringen keine Tausende Punkte', async () => {
    const s = await finishWorkout({ activityId: 'jacks', mode: 'manual', start: at('2026-11-20') - 2000, end: at('2026-11-20'), reps: 9999, seconds: 2 }, () => 1);
    expect(s.workout.reps).toBe(100);
    expect(s.repsCappedFrom).toBe(9999);
    expect(s.breakdown.total).toBe(50);
  });
});

describe('Streak nach Tagespunkten', () => {
  it('zwei kleine Geräteübungen am selben Tag ergeben zusammen die Streak', async () => {
    const a = await finishGym({ exercise: lat, sets: [{ reps: 12, kg: 20 }], start: at('2026-11-18'), end: at('2026-11-18') }, () => 1);
    expect(a.breakdown.total).toBe(12);
    expect(a.streakIncreased).toBe(false);
    expect(a.streakMissing).toBe(18);
    const b = await finishGym({ exercise: row, sets: [{ reps: 12, kg: 20 }, { reps: 12, kg: 20 }], start: at('2026-11-18', 19), end: at('2026-11-18', 19) }, () => 1);
    expect(b.streakIncreased).toBe(true);
    expect(b.streakMissing).toBe(0);
    expect((await getKV<StreakState>('streak', null as never)).current).toBe(1);
  });
  it('Gerät + Körpergewicht zählen zusammen, auch fürs Tageslimit', async () => {
    await finishGym({ exercise: lat, sets: [{ reps: 12, kg: 20 }], start: at('2026-11-18'), end: at('2026-11-18') }, () => 1);
    const s = await finishWorkout({ activityId: 'squat', mode: 'manual', start: at('2026-11-18', 19), end: at('2026-11-18', 19), reps: 15, seconds: 60 }, () => 1);
    expect(s.breakdown.total).toBe(23);
    expect(s.streakIncreased).toBe(true);
  });
});

const lateral = GYM_EXERCISES.find((e) => e.id === 'lateral_raise')!;
const pull = GYM_EXERCISES.find((e) => e.id === 'weighted_pullup')!;
const bench = GYM_EXERCISES.find((e) => e.id === 'bench')!;

describe('Fairness Geräte', () => {
  it('Rekord-Bonus nicht per +0,25 kg farmbar: höchstens einer pro Übung und Tag', async () => {
    await finishGym({ exercise: lateral, sets: [{ reps: 1, kg: 20 }], start: at('2026-11-17'), end: at('2026-11-17') }, () => 1);
    let records = 0;
    for (let i = 1; i <= 10; i++) {
      const r = await finishGym({ exercise: lateral, sets: [{ reps: 1, kg: 20 + i * 0.25 }], start: at('2026-11-18', 8) + i * 60000, end: at('2026-11-18', 8) + i * 60000 }, () => 1);
      if (r.isRecord) records++;
    }
    expect(records).toBe(0); // +0,25 kg ist keine spürbare Steigerung
    const big = await finishGym({ exercise: lateral, sets: [{ reps: 1, kg: 25 }], start: at('2026-11-18', 20), end: at('2026-11-18', 20) }, () => 1);
    expect(big.isRecord).toBe(true);
    const again = await finishGym({ exercise: lateral, sets: [{ reps: 1, kg: 30 }], start: at('2026-11-18', 21), end: at('2026-11-18', 21) }, () => 1);
    expect(again.isRecord).toBe(false); // zweiter Rekord am selben Tag gibt keinen Bonus
  });
  it('Fantasie-Satz 100 × 500 kg bringt höchstens 60 Punkte', () => {
    expect(setPoints({ reps: 100, kg: 500 })).toBe(60);
    expect(setPoints({ reps: 12, kg: 60 })).toBe(24);
  });
  it('Klimmzüge mit Gewicht sind mindestens so viel wert wie normale Klimmzüge', () => {
    expect(setPoints({ reps: 8, kg: 0 }, pull.id)).toBe(40);
    expect(setPoints({ reps: 8, kg: 10 }, pull.id)).toBe(50);
  });
  it('„Letztes Mal“ fasst alle Einträge des letzten Tages zusammen', async () => {
    await finishGym({ exercise: bench, sets: [{ reps: 5, kg: 100 }, { reps: 3, kg: 110 }], start: at('2026-11-12', 18), end: at('2026-11-12', 18) }, () => 1);
    await finishGym({ exercise: bench, sets: [{ reps: 8, kg: 90 }], start: at('2026-11-12', 19), end: at('2026-11-12', 19) }, () => 1);
    const l = await lastLogFor(bench.id);
    expect(l!.sets).toEqual([{ reps: 5, kg: 100 }, { reps: 3, kg: 110 }, { reps: 8, kg: 90 }]);
  });
});

describe('Zweite Runde', () => {
  it('Aufwärmsätze zählen nicht für Punkte, Volumen und Rekord', async () => {
    const sets = [{ reps: 10, kg: 60, warmup: true }, { reps: 5, kg: 100 }];
    expect(volume(sets)).toBe(500);
    const r = await finishGym({ exercise: bench, sets, start: at('2026-11-12'), end: at('2026-11-12') }, () => 1);
    expect(r.breakdown.base).toBe(15);
    expect(r.log.sets[0].warmup).toBe(true);
    await expect(finishGym({ exercise: bench, sets: [{ reps: 10, kg: 60, warmup: true }], start: 1, end: 2 })).rejects.toThrow();
  });
  it('Geräte-Eintrag löschen zieht Punkte ab und berechnet den Rekord neu', async () => {
    await finishGym({ exercise: bench, sets: [{ reps: 5, kg: 100 }], start: at('2026-11-12'), end: at('2026-11-12') }, () => 1);
    const typo = await finishGym({ exercise: bench, sets: [{ reps: 5, kg: 1000 }], start: at('2026-11-13'), end: at('2026-11-13') }, () => 1);
    await deleteGymLog(typo.log.id!);
    const rec = await getKV<GymRecords>('gymRecords', {});
    expect(rec.bench.kg).toBe(100);
    const w = await getKV<Wallet>('wallet', null as never);
    expect(w.points).toBe(await db.gymLogs.toArray().then((l) => l.reduce((s, x) => s + x.points, 0)));
  });
  it('Training löschen: Rekord aus den übrigen', async () => {
    await finishWorkout({ activityId: 'pushup', mode: 'manual', start: at('2026-11-12'), end: at('2026-11-12'), reps: 20, seconds: 60 }, () => 1);
    const big = await finishWorkout({ activityId: 'pushup', mode: 'manual', start: at('2026-11-13'), end: at('2026-11-13'), reps: 90, seconds: 60 }, () => 1);
    await deleteWorkout(big.workout.id!);
    expect((await getKV<Records>('records', {})).pushup!.reps).toBe(20);
    expect((await getKV<Wallet>('wallet', null as never)).points).toBe(40);
  });
  it('ein Auftrag pro Tag tauschbar, Rest bleibt gleich', () => {
    const a = questsFor('2026-11-21');
    const b = questsFor('2026-11-21', { day: '2026-11-21', index: 1 });
    expect(b[0]).toEqual(a[0]);
    expect(b[2]).toEqual(a[2]);
    expect(b[1].activityId).not.toBe(a[1].activityId);
    expect(new Set(b.map((q) => q.activityId)).size).toBe(3);
    expect(questsFor('2026-11-22', { day: '2026-11-21', index: 1 })).toEqual(questsFor('2026-11-22'));
  });
  it('Zielgewicht', async () => {
    expect(await getWeightGoal()).toBeNull();
    await setWeightGoal(75);
    expect(await getWeightGoal()).toBe(75);
    await expect(setWeightGoal(5)).rejects.toThrow();
  });
});
