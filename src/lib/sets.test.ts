import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db, getKV, setKV } from './db';
import { deleteWorkout, finishWorkout, lastWorkoutFor, type Records } from './game';
import { pickQuests, questsFor, type DayQuests } from './quests';
import { ensureDayQuests } from './dayQuests';
import { ALL_MUSCLES } from './muscles';
import { ACT } from '../data/activities';
import { beatsRecord } from './gym';
import { cleanPlan, lastText, planText, suggestPlan, supportsSets, targetOf } from './sets';

const at = (day: string, h = 18) => new Date(`${day}T${String(h).padStart(2, '0')}:00:00`).getTime();

beforeEach(async () => {
  await db.workouts.clear(); await db.kv.clear(); await db.gymLogs.clear();
});

describe('Tagesaufträge nach Erholung', () => {
  const rested: Record<string, number> = Object.fromEntries(ALL_MUSCLES.map((m) => [m, 1]));
  it('müde Muskeln bekommen keinen Auftrag', () => {
    const tired: Record<string, number> = { ...rested, chest: 0.1, triceps: 0.2, abs: 0.1 };
    for (const day of ['2026-11-23', '2026-11-24', '2026-11-25', '2026-11-26']) {
      const q = pickQuests(day, tired);
      expect(q.list).toHaveLength(4);
      for (const x of q.list) for (const m of ACT[x.activityId].muscles.primary) expect(tired[m]).toBeGreaterThanOrEqual(0.9);
      expect(new Set(q.list.map((x) => x.activityId)).size).toBe(4);
    }
  });
  it('alles müde: trotzdem 4 Aufträge, die am besten erholten zuerst', () => {
    const all = Object.fromEntries(ALL_MUSCLES.map((m) => [m, 0.2]));
    const q = pickQuests('2026-11-23', { ...all, calves: 0.8, quads: 0.8, hipflexors: 0.8 });
    expect(q.list).toHaveLength(4);
    expect(['walk', 'jog']).toContain(q.list[0].activityId);
  });
  it('gespeicherte Auswahl gilt, Tauschen nimmt den vierten', () => {
    const stored = pickQuests('2026-11-23', rested);
    expect(questsFor('2026-11-23', null, stored)).toEqual(stored.list.slice(0, 3));
    const sw = questsFor('2026-11-23', { day: '2026-11-23', index: 1 }, stored);
    expect(sw[1]).toEqual(stored.list[3]);
    // Anderer Tag: gespeicherte Auswahl gilt nicht
    expect(questsFor('2026-11-24', null, stored)).toEqual(questsFor('2026-11-24'));
  });
  it('Liegestütze gestern → heute kein Brust-Auftrag, und die Auswahl bleibt den ganzen Tag', async () => {
    await finishWorkout({ activityId: 'pushup', mode: 'manual', start: at('2026-11-22', 20) - 300000, end: at('2026-11-22', 20), reps: 80, seconds: 300, sets: [30, 25, 25] }, () => 1);
    const q = await ensureDayQuests('2026-11-23', at('2026-11-23', 8));
    expect(q.list.map((x) => x.activityId)).not.toContain('pushup');
    // Training heute ändert die Auswahl nicht mehr
    await finishWorkout({ activityId: 'squat', mode: 'manual', start: at('2026-11-23', 9) - 60000, end: at('2026-11-23', 9), reps: 20, seconds: 60 }, () => 1);
    expect(await ensureDayQuests('2026-11-23', at('2026-11-23', 12))).toEqual(q);
  });
  it('Update am Tag nach schon begonnenem Training: alte Auswahl bleibt', async () => {
    await db.workouts.add({ day: '2026-11-23', activityId: 'squat', mode: 'manual', start: at('2026-11-23', 7), end: at('2026-11-23', 7), reps: 10, invalid: 0, seconds: 30, km: 0, points: 10, gems: 0, isRecord: false, breakdown: {} as never, gemAwards: [] });
    const q = await ensureDayQuests('2026-11-23', at('2026-11-23', 8));
    expect(q.list.slice(0, 3)).toEqual(questsFor('2026-11-23'));
    expect(questsFor('2026-11-23', { day: '2026-11-23', index: 2 }, q)).toEqual(questsFor('2026-11-23', { day: '2026-11-23', index: 2 }));
    expect((await getKV<DayQuests>('questsDay', null as never)).day).toBe('2026-11-23');
  });
});

describe('Sätze ohne Gerät', () => {
  it('Summe zählt für Punkte, bester Satz für den Rekord', async () => {
    await finishWorkout({ activityId: 'pushup', mode: 'manual', start: at('2026-11-20') - 60000, end: at('2026-11-20'), reps: 20, seconds: 60 }, () => 1);
    const s = await finishWorkout({ activityId: 'pushup', mode: 'manual', start: at('2026-11-21') - 400000, end: at('2026-11-21'), reps: 60, seconds: 400, sets: [25, 20, 15] }, () => 1);
    expect(s.workout.reps).toBe(60);
    expect(s.workout.sets).toEqual([25, 20, 15]);
    expect(s.isRecord).toBe(true);
    expect(s.recordText).toContain('25 Wiederholungen am Stück');
    expect((await getKV<Records>('records', {})).pushup!.reps).toBe(25);
    // Mehr gesamt, aber kein Satz über 25: kein Rekord
    const t = await finishWorkout({ activityId: 'pushup', mode: 'manual', start: at('2026-11-22') - 600000, end: at('2026-11-22'), reps: 80, seconds: 600, sets: [20, 20, 20, 20] }, () => 1);
    expect(t.isRecord).toBe(false);
    expect((await lastWorkoutFor('pushup'))!.id).toBe(t.workout.id);
    // Löschen rechnet den Rekord aus den Sätzen neu
    await deleteWorkout(s.workout.id!);
    expect((await getKV<Records>('records', {})).pushup!.reps).toBe(20);
  });
  it('Sätze, die nicht zur Summe passen, werden verworfen', async () => {
    const s = await finishWorkout({ activityId: 'squat', mode: 'manual', start: at('2026-11-21') - 300000, end: at('2026-11-21'), reps: 30, seconds: 300, sets: [10, 10] }, () => 1);
    expect(s.workout.sets).toBeUndefined();
    expect(s.workout.reps).toBe(30);
  });
  it('Plank: Sekunden je Satz', async () => {
    await setKV('records', { plank: { seconds: 50 } });
    const s = await finishWorkout({ activityId: 'plank', mode: 'timer', start: at('2026-11-21') - 300000, end: at('2026-11-21'), seconds: 130, sets: [60, 40, 30] }, () => 1);
    expect(s.isRecord).toBe(true);
    expect((await getKV<Records>('records', {})).plank!.seconds).toBe(60);
  });
  it('Texte und Vorschlag', () => {
    const w = { sets: [12, 10, 8], reps: 30, seconds: 200 } as never;
    expect(lastText(w, ACT.pushup)).toBe('3 Sätze: 12 · 10 · 8');
    expect(lastText({ reps: 25, seconds: 60 } as never, ACT.pushup)).toBe(`25 ${ACT.pushup.unitLabel}`);
    expect(suggestPlan(ACT.pushup, undefined, w)).toEqual({ sets: 3, target: 12, rest: 90 });
    expect(suggestPlan(ACT.plank)).toEqual({ sets: 3, target: 30, rest: 90 });
    expect(supportsSets(ACT.pushup)).toBe(true);
    expect(supportsSets(ACT.jog)).toBe(false);
  });

  it('Startziel ohne Verlauf passt zur Übung', () => {
    expect(suggestPlan(ACT.jumprope).target).toBe(50);
    expect(suggestPlan(ACT.pullup).target).toBe(5);
    expect(suggestPlan(ACT.pushup).target).toBe(10);
  });
});

describe('Geräte-Rekord live', () => {
  it('gleiche Regel wie beim Speichern', () => {
    const rec = { kg: 80, reps: 8 };
    expect(beatsRecord(rec, 9, 80)).toBe(true);
    expect(beatsRecord(rec, 8, 80)).toBe(false);
    expect(beatsRecord(rec, 3, 81)).toBe(true);
    expect(beatsRecord(rec, 3, 80.5)).toBe(false);
    expect(beatsRecord(undefined, 10, 100)).toBe(false);
  });
});

describe('eigenes Ziel pro Satz', () => {
  it('passt die Ziele an die Satzanzahl an und nimmt für neue Sätze das letzte Ziel', () => {
    const p = cleanPlan({ sets: 4, target: 10, targets: [12, 10, 8], rest: 90 }, ACT.pushup);
    expect(p.targets).toEqual([12, 10, 8, 8]);
    expect(p.target).toBe(12);
    expect(planText(p, false)).toBe('12 · 10 · 8 · 8');
    const fewer = cleanPlan({ ...p, sets: 2 }, ACT.pushup);
    expect(fewer.targets).toEqual([12, 10]);
  });
  it('lässt gleiche Ziele wieder zu einem Wert zusammenfallen', () => {
    const p = cleanPlan({ sets: 3, target: 5, targets: [9, 9, 9], rest: 90 }, ACT.pushup);
    expect(p.targets).toBeUndefined();
    expect(p.target).toBe(9);
    expect(planText(p, false)).toBe('3 × 9');
  });
  it('liefert das Ziel je Satz, Extra-Sätze wie der letzte', () => {
    const p = cleanPlan({ sets: 3, targets: [12, 10, 8], rest: 90 }, ACT.pushup);
    expect([0, 1, 2, 3].map((i) => targetOf(p, i))).toEqual([12, 10, 8, 8]);
    const same = cleanPlan({ sets: 3, target: 10, rest: 90 }, ACT.pushup);
    expect(targetOf(same, 2)).toBe(10);
  });
});
