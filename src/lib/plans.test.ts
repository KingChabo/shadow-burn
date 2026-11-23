import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from './db';
import { ACT } from '../data/activities';
import { GYM_EXERCISES } from '../data/gym';
import { exportAll, importAll } from './game';
import {
  bodyItem, cleanPlan, deletePlan, emptyPlan, getPlans, getRun, gymItem, itemSummary, markPlanDone, nextOpen, planFromRun,
  runChanged, saveRun, savePlan, speakSet, startRun, targetText, type Plan,
} from './plans';

const bench = GYM_EXERCISES.find((e) => e.id === 'bench')!;

beforeEach(async () => { await db.kv.clear(); });

function samplePlan(): Plan {
  const p = emptyPlan('Push-Tag');
  p.items = [
    gymItem(bench, [{ reps: 12, kg: 20, warmup: true }, { reps: 10, kg: 60 }, { reps: 10, kg: 60 }, { reps: 8, kg: 62.5 }]),
    bodyItem(ACT.pushup, [15, 15]),
    bodyItem(ACT.plank, [90]),
  ];
  return p;
}

describe('Workouts speichern', () => {
  it('anlegen, ändern, löschen', async () => {
    const p = await savePlan(samplePlan(), 1000);
    expect(p.createdAt).toBe(1000);
    expect(await getPlans()).toHaveLength(1);
    await savePlan({ ...p, name: 'Push A' }, 2000);
    const [q] = await getPlans();
    expect(q.name).toBe('Push A');
    expect(q.createdAt).toBe(1000);
    expect(q.updatedAt).toBe(2000);
    await markPlanDone(p.id, 3000);
    expect((await getPlans())[0]).toMatchObject({ lastDone: 3000, timesDone: 1 });
    await deletePlan(p.id);
    expect(await getPlans()).toHaveLength(0);
  });

  it('Werte werden begrenzt, leere Übungen fallen raus', () => {
    const p = samplePlan();
    p.name = '   ';
    p.items.push(gymItem(bench, [{ reps: 0, kg: 50 }]));
    p.items.push(bodyItem(ACT.pushup, [0]));
    p.items[0] = { ...p.items[0], sets: [{ reps: 999, kg: 5000.3 }] } as typeof p.items[0];
    const c = cleanPlan(p);
    expect(c.name).toBe('Mein Workout');
    expect(c.items).toHaveLength(3);
    expect(c.items[0]).toMatchObject({ sets: [{ reps: 100, kg: 1000 }] });
  });

  it('ist im Backup enthalten', async () => {
    await savePlan(samplePlan());
    const json = await exportAll();
    await db.kv.clear();
    await importAll(json);
    expect((await getPlans())[0].name).toBe('Push-Tag');
  });
});

describe('Texte und Ansage', () => {
  it('Kurzbeschreibung', () => {
    const p = samplePlan();
    expect(itemSummary(p.items[0])).toBe('1 Aufw. + 10×60, 10×60, 8×62,5 kg');
    expect(itemSummary(gymItem(bench, [{ reps: 10, kg: 60 }, { reps: 10, kg: 60 }]))).toBe('2 × 10 · 60 kg');
    expect(itemSummary(p.items[1])).toBe('2 × 15 Wdh.');
    expect(targetText(ACT.plank, 90)).toBe('1:30 min');
  });
  it('Ansage nennt Übung, Satz, Wiederholungen und Gewicht', () => {
    const p = samplePlan();
    expect(speakSet(p.items[0], 3)).toBe('Bankdrücken. Satz 4 von 4. 8 Wiederholungen mit 62,5 Kilo');
    expect(speakSet(p.items[1], 0)).toBe('Liegestütze. Satz 1 von 2. 15 Wiederholungen');
    expect(speakSet(p.items[2], 0)).toBe('Plank. 1 Minute 30 Sekunden');
  });
});

describe('Laufendes Training', () => {
  it('nächste offene Übung, Änderungen erkennen, als Vorlage übernehmen', async () => {
    const p = await savePlan(samplePlan());
    const r = startRun(p, 5);
    expect(runChanged(r, p)).toBe(false);
    const [a, b, c] = r.items;
    r.progress[a.id] = { done: 4, saved: 4, points: 50 };
    r.progress[b.id] = { done: 0, saved: 0, points: 0, skipped: true };
    expect(nextOpen(r, 0)).toBe(2);
    r.progress[c.id] = { done: 1, saved: 1, points: 10 };
    expect(nextOpen(r)).toBe(-1);
    // Gewicht während des Trainings geändert
    if (a.kind !== 'gym') throw new Error('erwartet Geräteübung');
    r.items[0] = { ...a, sets: a.sets.map((s) => ({ ...s, kg: s.warmup ? s.kg : 65 })) };
    expect(runChanged(r, p)).toBe(true);
    // Vorlage selbst bleibt unverändert, bis man übernimmt
    expect((await getPlans())[0].items[0]).toMatchObject({ sets: [{ kg: 20 }, { kg: 60 }, { kg: 60 }, { kg: 62.5 }] });
    await savePlan(planFromRun(r, p));
    expect((await getPlans())[0].items[0]).toMatchObject({ sets: [{ kg: 20 }, { kg: 65 }, { kg: 65 }, { kg: 65 }] });
    expect(await getPlans()).toHaveLength(1);
  });

  it('freies Training mitschreiben wird zu neuem Workout', async () => {
    const r = startRun(null);
    expect(runChanged(r, null)).toBe(false);
    r.items.push(gymItem(bench, [{ reps: 8, kg: 70 }]));
    expect(runChanged(r, null)).toBe(true);
    await savePlan(planFromRun(r, null, 'Brust'));
    const [p] = await getPlans();
    expect(p).toMatchObject({ name: 'Brust', items: [{ kind: 'gym', exerciseId: 'bench', sets: [{ reps: 8, kg: 70 }] }] });
  });

  it('wird gesichert und kann fortgesetzt werden', async () => {
    const r = startRun(samplePlan(), 7);
    await saveRun(r);
    expect((await getRun())?.startedAt).toBe(7);
    await saveRun(null);
    expect(await getRun()).toBeNull();
  });
});
