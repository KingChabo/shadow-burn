import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { describe, expect, it } from 'vitest';

describe('Datenbank-Update v2 → v4', () => {
  it('bestehende Trainings, Werte und Freunde bleiben erhalten', async () => {
    const old = new Dexie('phantom');
    old.version(1).stores({ workouts: '++id, day, activityId, start', kv: 'key' });
    old.version(2).stores({ friends: 'id' });
    await old.open();
    await old.table('workouts').add({ day: '2026-11-20', activityId: 'pushup', start: 1, points: 40 });
    await old.table('kv').put({ key: 'wallet', value: { points: 40, gems: 1, xp: 40 } });
    await old.table('friends').put({ id: 'f1', name: 'Jörg' });
    old.close();

    const { db } = await import('./db');
    await db.open();
    expect(db.verno).toBe(4);
    expect(await db.workouts.count()).toBe(1);
    expect((await db.kv.get('wallet'))?.value).toEqual({ points: 40, gems: 1, xp: 40 });
    expect(await db.friends.get('f1')).toMatchObject({ name: 'Jörg' });
    expect(await db.gymLogs.count()).toBe(0);
    expect(await db.weights.count()).toBe(0);
    expect(await db.posts.count()).toBe(0);
  });
});
