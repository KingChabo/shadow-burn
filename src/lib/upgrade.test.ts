import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { describe, expect, it } from 'vitest';
import { ShadowBurnDB, SCHEMAS } from './db';

/**
 * Update-Schutz: läuft bei jedem APK-Build (build-apk.sh bricht sonst ab).
 * Für JEDE alte Datenbank-Version wird eine App mit Daten angelegt und dann mit der aktuellen Version geöffnet.
 * Alles, was vorher da war, muss danach unverändert da sein.
 */

/** Beispiel-Zeile je Tabelle */
const ROWS: Record<string, Record<string, unknown>> = {
  workouts: { day: '2026-11-20', activityId: 'pushup', start: 1, points: 40 },
  kv: { key: 'wallet', value: { points: 40, gems: 3, xp: 40 } },
  friends: { id: 'f1', name: 'Jörg' },
  gymLogs: { day: '2026-11-20', exerciseId: 'bench', start: 2, sets: [{ reps: 10, kg: 60 }] },
  weights: { day: '2026-11-20', kg: 80, at: 3 },
  posts: { id: 'p1', at: 4, author: 'me', mine: true, text: 'Lauf' },
};

describe('App-Update behält alle Daten', () => {
  it('Schema wird nur hinten erweitert, keine Tabelle fällt weg', () => {
    const cur = new ShadowBurnDB();
    const names = cur.tables.map((t) => t.name).sort();
    const all = [...new Set(SCHEMAS.flatMap((s) => Object.keys(s)))].sort();
    expect(names).toEqual(all);
    for (const s of SCHEMAS) for (const v of Object.values(s)) expect(v).not.toBeNull(); // null würde eine Tabelle löschen
    for (const t of all) expect(ROWS[t], `Beispiel-Zeile für neue Tabelle "${t}" in upgrade.test.ts ergänzen`).toBeDefined();
  });

  for (let v = 1; v <= SCHEMAS.length; v++) {
    it(`von Datenbank-Version ${v} auf ${SCHEMAS.length}`, async () => {
      const name = `upgrade-test-${v}`;
      const old = new Dexie(name);
      SCHEMAS.slice(0, v).forEach((s, i) => old.version(i + 1).stores(s));
      await old.open();
      const tables = old.tables.map((t) => t.name);
      for (const t of tables) await old.table(t).add(ROWS[t]);
      old.close();

      // aktueller Aufbau wie in ShadowBurnDB, nur unter dem Testnamen
      const db2 = new Dexie(name);
      SCHEMAS.forEach((s, i) => db2.version(i + 1).stores(s));
      await db2.open();
      expect(db2.verno).toBe(SCHEMAS.length);
      for (const t of tables) {
        const rows = await db2.table(t).toArray();
        expect(rows, `Tabelle ${t}`).toHaveLength(1);
        expect(rows[0]).toMatchObject(ROWS[t]);
      }
      db2.close();
    });
  }
});
