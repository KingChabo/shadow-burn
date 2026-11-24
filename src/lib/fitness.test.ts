import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db, getKV, setKV } from './db';
import { adaptivePool, capacity, goalFactor, REFERENCE, trackOf, trackQuest } from './fitness';
import { saveFitness, ensureDayQuests } from './dayQuests';
import { deleteWorkout, finishWorkout } from './game';
import type { QuestLevels } from './fitness';

const at = (day: string, h = 18) => new Date(`${day}T${String(h).padStart(2, '0')}:00:00`).getTime();
beforeEach(async () => { await db.workouts.clear(); await db.kv.clear(); await db.gymLogs.clear(); });

describe('Fitness-Stand', () => {
  it('ohne Einstufung und Rekorde: Durchschnitt (wie die alten festen Aufträge)', () => {
    expect(capacity(null, {})).toEqual(REFERENCE);
    expect(trackQuest('push', 20, 0)).toEqual({ activityId: 'pushup', metric: 'reps', target: 30 });
  });
  it('Einstufung bestimmt Ziel und Variante', () => {
    const cap = capacity({ push: 4, core: 30, legs: 80, at: 0 }, {});
    expect(trackQuest('push', cap.push, 0).activityId).toBe('kneepush');
    expect(trackQuest('core', cap.core, 0)).toEqual({ activityId: 'situp', metric: 'reps', target: 45 });
    expect(trackQuest('legs', cap.legs, 0).activityId).toBe('jumpsquat');
    expect(trackQuest('push', 60, 0).activityId).toBe('diamondpush');
    // 0 Liegestütze: ganz leicht, aber nie 0
    expect(trackQuest('push', capacity({ push: 0, at: 0 }, {}).push, 0)).toEqual({ activityId: 'kneepush', metric: 'reps', target: 5 });
  });
  it('Rekorde heben den Stand, auch aus Varianten umgerechnet', () => {
    expect(capacity({ push: 10, at: 0 }, { pushup: { reps: 18 } }).push).toBe(18);
    expect(capacity({ push: 10, at: 0 }, { diamondpush: { reps: 20 } }).push).toBe(32);
    expect(capacity({ push: 30, at: 0 }, { kneepush: { reps: 20 } }).push).toBe(30);
  });
  it('erledigte Aufträge machen Ziele mit der Zeit höher', () => {
    expect(goalFactor(0)).toBe(1.5);
    expect(goalFactor(10)).toBe(2);
    expect(goalFactor(100)).toBe(2.5);
    expect(trackQuest('push', 20, 10).target).toBeGreaterThan(trackQuest('push', 20, 0).target);
  });
  it('Pool: Anfänger bekommt kleinere Ziele, jede Übung nur einmal', () => {
    const weak = adaptivePool({ push: 3, core: 5, legs: 8, at: 0 }, {});
    const strong = adaptivePool({ push: 40, core: 50, legs: 60, at: 0 }, {});
    const t = (p: typeof weak, id: string) => p.find((q) => q.activityId === id)?.target ?? 0;
    expect(t(weak, 'burpee')).toBeLessThan(t(strong, 'burpee'));
    expect(t(weak, 'jog')).toBe(t(strong, 'jog'));
    expect(new Set(weak.map((q) => q.activityId)).size).toBe(weak.length);
    expect(weak.find((q) => q.activityId === 'crunch')?.target).toBeLessThan(20);
    // Klimmzüge richten sich nach dem Oberkörper, nicht nach starken Beinen
    expect(t(adaptivePool({ push: 4, core: 30, legs: 80, at: 0 }, {}), 'pullup')).toBeLessThanOrEqual(3);
    expect(trackOf('diamondpush')).toBe('push');
    expect(trackOf('jog')).toBeNull();
  });
});

describe('Einstufung und Fortschritt gespeichert', () => {
  it('Einstufung wählt die heutigen Aufträge neu, auch nach einem Test-Training', async () => {
    await finishWorkout({ activityId: 'pushup', mode: 'manual', start: at('2026-11-23', 9) - 60000, end: at('2026-11-23', 9), reps: 4, seconds: 60 }, () => 1);
    const q = await saveFitness({ push: 4, core: 6, legs: 10, at: 0 }, '2026-11-23', at('2026-11-23', 9));
    const pushQ = q.list.find((x) => x.activityId === 'kneepush' || x.activityId === 'pushup');
    if (pushQ) expect(pushQ.target).toBeLessThanOrEqual(15);
    expect(await ensureDayQuests('2026-11-23', at('2026-11-23', 12))).toEqual(q);
  });
  it('erledigter Auftrag zählt Fortschritt hoch, Löschen nimmt ihn zurück', async () => {
    await setKV('questsDay', { day: '2026-11-23', list: [
      { id: '2026-11-23:squat:20', activityId: 'squat', target: 20, metric: 'reps', label: '20 Kniebeugen' },
      { id: '2026-11-23:jog:2', activityId: 'jog', target: 2, metric: 'km', label: '2 km Joggen' },
      { id: '2026-11-23:plank:60', activityId: 'plank', target: 60, metric: 'seconds', label: '1 Min. Plank' },
      { id: '2026-11-23:burpee:15', activityId: 'burpee', target: 15, metric: 'reps', label: '15 Burpees' },
    ] });
    const s = await finishWorkout({ activityId: 'squat', mode: 'manual', start: at('2026-11-23', 10) - 120000, end: at('2026-11-23', 10), reps: 25, seconds: 120 }, () => 1);
    expect(s.questsCompleted).toContain('20 Kniebeugen');
    expect((await getKV<QuestLevels>('questLevels', {})).legs).toBe(1);
    await deleteWorkout(s.workout.id!, new Date(at('2026-11-23', 11)));
    expect((await getKV<QuestLevels>('questLevels', {})).legs).toBe(0);
  });
});
