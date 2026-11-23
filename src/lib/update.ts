import Dexie, { type Table } from 'dexie';
import { getKV, setKV } from './db';
import { exportAll } from './game';

/**
 * Updates ohne Datenverlust.
 * Android behält die Daten beim Installieren einer neuen APK (gleiche App-ID, gleicher Schlüssel, siehe build-apk.sh).
 * Zusätzlich legt die App selbst Sicherungen in einer eigenen Datenbank an:
 *  - bei jeder neuen App-Version (gleich nach dem Start) und
 *  - sonst höchstens einmal am Tag.
 * Die letzten MAX_SNAPS bleiben liegen und lassen sich in Einstellungen → App & Daten zurückholen.
 */

/** Versionsname aus build-apk.sh (z. B. "1.0.7"), im Browser "dev" */
export const APP_VERSION: string = import.meta.env.VITE_APP_VERSION || 'dev';
export const MAX_SNAPS = 3;
const DAY = 24 * 3600 * 1000;

export interface Snapshot { at: number; version: string; reason: 'update' | 'daily'; json: string }

class SnapDB extends Dexie {
  snaps!: Table<Snapshot, number>;
  constructor() {
    // Name bleibt (alter App-Name), sonst wären vorhandene Sicherungen weg
    super('phantom-sicherung');
    this.version(1).stores({ snaps: 'at' });
  }
}
let sdb: SnapDB | null = null;
const snapDb = () => (sdb ??= new SnapDB());

export async function listSnapshots(): Promise<Snapshot[]> {
  return (await snapDb().snaps.orderBy('at').reverse().toArray());
}

/** Sicherung jetzt anlegen (beim Start durch updateGuard, vor "App aktualisieren" in den Einstellungen) */
export async function takeSnapshot(reason: Snapshot['reason'], now = Date.now()): Promise<void> {
  const json = await exportAll();
  const s = snapDb();
  await s.snaps.put({ at: now, version: APP_VERSION, reason, json });
  const old = (await s.snaps.orderBy('at').reverse().toArray()).slice(MAX_SNAPS);
  if (old.length) await s.snaps.bulkDelete(old.map((o) => o.at));
}

/** Beim Start aufrufen. Fehler hier dürfen den Start nie blockieren. */
export async function updateGuard(now = Date.now()): Promise<void> {
  try {
    const last = await getKV<string | null>('appVersion', null);
    const lastSnap = (await snapDb().snaps.orderBy('at').last())?.at ?? 0;
    const hasProfile = (await getKV<unknown>('profile', null)) !== null;
    if (last !== APP_VERSION) {
      if (hasProfile) await takeSnapshot('update', now);
      await setKV('appVersion', APP_VERSION);
      await setKV('appVersionPrev', last);
    } else if (hasProfile && now - lastSnap > DAY) {
      await takeSnapshot('daily', now);
    }
  } catch (e) {
    console.warn('Sicherung beim Start fehlgeschlagen', e);
  }
}
