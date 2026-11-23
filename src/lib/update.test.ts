import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { setKV, getKV } from './db';
import { listSnapshots, MAX_SNAPS, updateGuard } from './update';

describe('Automatische Sicherung', () => {
  it('ohne Profil keine Sicherung, Version wird gemerkt', async () => {
    await updateGuard(1_000);
    expect(await listSnapshots()).toHaveLength(0);
    expect(await getKV('appVersion', null)).toBe('dev');
  });
  it('einmal am Tag, höchstens drei, neueste zuerst', async () => {
    await setKV('profile', { name: 'Alex', createdAt: 1 });
    const D = 24 * 3600 * 1000;
    await updateGuard(10 * D);
    await updateGuard(10 * D + 3600_000); // gleicher Tag: keine neue
    expect(await listSnapshots()).toHaveLength(1);
    for (let k = 1; k <= 4; k++) await updateGuard(10 * D + k * 2 * D);
    const s = await listSnapshots();
    expect(s).toHaveLength(MAX_SNAPS);
    expect(s[0].at).toBe(18 * D);
    expect(JSON.parse(s[0].json).kv.some((r: { key: string }) => r.key === 'profile')).toBe(true);
  });
  it('neue App-Version: sofort sichern', async () => {
    await setKV('appVersion', '1.0.1');
    const before = (await listSnapshots())[0].at;
    await updateGuard(before + 1000);
    const s = await listSnapshots();
    expect(s[0].reason).toBe('update');
    expect(await getKV('appVersionPrev', null)).toBe('1.0.1');
  });
});

describe('Sicherungsdatei nach der Umbenennung', () => {
  it('neue Sicherungen heißen shadow-burn, alte phantom-Sicherungen lassen sich einspielen', async () => {
    const { exportAll, importAll } = await import('./game');
    const json = JSON.parse(await exportAll());
    expect(json.app).toBe('shadow-burn');
    const old = { ...json, app: 'phantom', kv: [...json.kv, { key: 'altTest', value: 42 }] };
    await importAll(JSON.stringify(old));
    expect(await getKV('altTest', null)).toBe(42);
    await expect(importAll(JSON.stringify({ ...json, app: 'fremd' }))).rejects.toThrow();
  });
});
