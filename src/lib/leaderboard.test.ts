import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { buildRanking, CARD_PREFIX, decodeCard, isCardText, encodeCard, fmtAgo, mergeFriend, recordActivities, weekKey, type PlayerCard } from './leaderboard';
import { db, setKV } from './db';
import { buildMyCard, exportAll, getPlayerId, importAll, removeFriend, saveFriend, wipeAll } from './game';

const card = (o: Partial<PlayerCard> = {}): PlayerCard => ({
  id: 'abcd-1234', name: 'Jörg Müller', level: 7, total: 4200, week: 310, weekKey: '2026-11-16',
  streak: 12, longest: 30, rec: { pushup: 45, plank: 95, jog: 5.25 }, at: 1_795_000_000_000, ...o,
});

describe('Woche', () => {
  it('Montag als Wochenschlüssel', () => {
    expect(weekKey('2026-11-21')).toBe('2026-11-16'); // Samstag
    expect(weekKey('2026-11-22')).toBe('2026-11-16'); // Sonntag
    expect(weekKey('2026-11-23')).toBe('2026-11-23'); // Montag
    expect(weekKey('2027-01-01')).toBe('2026-12-28'); // über den Jahreswechsel
  });
});

describe('QR-Karte', () => {
  it('kodieren und dekodieren (mit Umlauten)', () => {
    const c = card();
    const text = encodeCard(c);
    expect(text.startsWith(CARD_PREFIX)).toBe(true);
    expect(text.length).toBeLessThan(700);
    expect(decodeCard(text)).toEqual(c);
  });
  it('alle 18 Übungen passen in einen QR-Code', () => {
    const rec = Object.fromEntries(['pushup', 'situp', 'pullup', 'squat', 'lunge', 'dip', 'burpee', 'plank', 'sideplank', 'crunch', 'mountain', 'jacks', 'highknees', 'jumprope', 'jog', 'walk', 'sprint', 'bike'].map((k) => [k, 999.99]));
    expect(encodeCard(card({ rec, name: 'X'.repeat(24) })).length).toBeLessThan(1000);
  });
  it('liest auch alte PHANTOM1-Codes (App hieß früher PHANTOM)', () => {
    const c = card();
    const text = encodeCard(c);
    expect(text.startsWith('SB1:')).toBe(true);
    const old = 'PHANTOM1:' + text.slice(CARD_PREFIX.length);
    expect(isCardText(old)).toBe(true);
    expect(decodeCard(old)).toEqual(c);
  });
  it('lehnt fremde oder kaputte Codes ab', () => {
    expect(() => decodeCard('https://example.com')).toThrow('kein gültiger');
    expect(() => decodeCard(CARD_PREFIX + 'kaputt!!')).toThrow('kein gültiger');
    const bad = encodeCard(card({ total: -5 }));
    expect(() => decodeCard(bad)).toThrow('kein gültiger');
  });
  it('ignoriert unbekannte Übungen und kürzt lange Namen', () => {
    const raw = { i: 'abcd-1234', n: 'A'.repeat(50), l: 1, t: 1, w: 1, wk: '2026-11-16', s: 1, ls: 1, r: { pushup: 3, hack: 9 }, a: 1 };
    const text = CARD_PREFIX + btoa(JSON.stringify(raw));
    const c = decodeCard(text);
    expect(c.name).toHaveLength(24);
    expect(c.rec).toEqual({ pushup: 3 });
  });
});

describe('Freunde zusammenführen', () => {
  it('neu, aktualisiert, ältere Karte wird ignoriert', () => {
    expect(mergeFriend(undefined, card(), 5).status).toBe('new');
    const f = mergeFriend(undefined, card({ at: 100 }), 5).friend;
    expect(mergeFriend(f, card({ at: 200, total: 9 }), 6)).toMatchObject({ status: 'updated', friend: { total: 9, scannedAt: 6 } });
    expect(mergeFriend(f, card({ at: 50, total: 1 }), 7)).toMatchObject({ status: 'older', friend: { total: 4200, scannedAt: 7 } });
  });
});

describe('Rangliste', () => {
  const me = card({ id: 'me-0001', name: 'Alex', total: 1000, week: 50, streak: 3, rec: { pushup: 30 } });
  const a = card({ id: 'a-0001', name: 'Anna', total: 2000, week: 80, weekKey: '2026-11-09', streak: 3, rec: {} });
  const b = card({ id: 'b-0001', name: 'Ben', total: 500, week: 60, streak: 9, rec: { pushup: 40 } });
  it('Gesamtpunkte absteigend', () => {
    expect(buildRanking(me, [a, b], 'total', '2026-11-16').map((r) => [r.name, r.rank])).toEqual([['Anna', 1], ['Alex', 2], ['Ben', 3]]);
  });
  it('Woche: alte Woche zählt 0', () => {
    const rows = buildRanking(me, [a, b], 'week', '2026-11-16');
    expect(rows.map((r) => r.name)).toEqual(['Ben', 'Alex', 'Anna']);
    expect(rows[2]).toMatchObject({ value: 0, staleWeek: true });
  });
  it('Gleichstand teilt sich den Platz, ich stehe vorne', () => {
    const rows = buildRanking(me, [a, b], 'streak', '2026-11-16');
    expect(rows.map((r) => [r.name, r.rank])).toEqual([['Ben', 1], ['Alex', 2], ['Anna', 2]]);
  });
  it('Rekord: nur wer die Übung gemacht hat', () => {
    expect(buildRanking(me, [a, b], 'rec:pushup', '2026-11-16').map((r) => r.name)).toEqual(['Ben', 'Alex']);
    expect(recordActivities([me, a, b])).toEqual(['pushup']);
  });
  it('eigene Karte taucht nie doppelt auf', () => {
    expect(buildRanking(me, [me, b], 'total', '2026-11-16')).toHaveLength(2);
  });
  it('Zeitangabe', () => {
    const now = Date.UTC(2026, 10, 21, 15);
    expect(fmtAgo(now - 30_000, now, '2026-11-21', '2026-11-21')).toBe('gerade eben');
    expect(fmtAgo(now - 5 * 60_000, now, '2026-11-21', '2026-11-21')).toBe('vor 5 Min.');
    expect(fmtAgo(now - 3 * 3_600_000, now, '2026-11-21', '2026-11-21')).toBe('vor 3 Std.');
    expect(fmtAgo(now - 86_400_000, now, '2026-11-21', '2026-11-20')).toBe('gestern');
    expect(fmtAgo(now - 4 * 86_400_000, now, '2026-11-21', '2026-11-17')).toBe('vor 4 Tagen');
  });
});

describe('Datenbank', () => {
  beforeEach(async () => { await db.workouts.clear(); await db.kv.clear(); await db.friends.clear(); });

  it('eigene Karte aus lokalen Daten', async () => {
    await setKV('profile', { name: 'Alex', createdAt: 0 });
    await setKV('wallet', { points: 900, gems: 3, xp: 900 });
    await setKV('records', { pushup: { reps: 33 }, plank: { seconds: 70 }, jog: { km: 4, pace: 5.5 } });
    const w = { activityId: 'pushup' as const, mode: 'manual' as const, start: 0, end: 0, reps: 1, invalid: 0, seconds: 0, km: 0, gems: 0, isRecord: false, gemAwards: [], breakdown: { base: 0, formBonus: 0, paceBonus: 0, streakBonus: 0, recordBonus: 0, antiFarmCut: 0, total: 0 } };
    await db.workouts.bulkAdd([{ ...w, day: '2026-11-15', points: 100 }, { ...w, day: '2026-11-16', points: 40 }, { ...w, day: '2026-11-21', points: 25 }]);
    const c = await buildMyCard(new Date(2026, 10, 21, 12));
    expect(c).toMatchObject({ name: 'Alex', total: 900, week: 65, weekKey: '2026-11-16', rec: { pushup: 33, plank: 70, jog: 4 } });
    expect(c.id).toBe(await getPlayerId());
  });

  it('Freund speichern, aktualisieren, eigenen Code ablehnen, löschen', async () => {
    expect((await saveFriend(card({ at: 10 }))).status).toBe('new');
    expect((await saveFriend(card({ at: 20, total: 1 }))).status).toBe('updated');
    expect((await db.friends.get('abcd-1234'))?.total).toBe(1);
    expect((await saveFriend(card({ id: await getPlayerId() }))).status).toBe('self');
    await removeFriend('abcd-1234');
    expect(await db.friends.count()).toBe(0);
  });

  it('Backup enthält Freunde, Löschen behält die Spieler-ID', async () => {
    await saveFriend(card());
    const id = await getPlayerId();
    const json = await exportAll();
    await wipeAll();
    expect(await db.friends.count()).toBe(0);
    expect(await getPlayerId()).toBe(id);
    await importAll(json);
    expect(await db.friends.count()).toBe(1);
  });
});

describe('QR-Code Ende zu Ende', () => {
  it('erzeugter QR-Code wird vom Scanner gelesen', async () => {
    const QRCode = (await import('qrcode')).default;
    const jsQR = (await import('jsqr')).default;
    const text = encodeCard(card());
    const qr = QRCode.create(text, { errorCorrectionLevel: 'M' });
    const n = qr.modules.size, px = 4, margin = 4, size = (n + margin * 2) * px;
    const data = new Uint8ClampedArray(size * size * 4).fill(255);
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      if (!qr.modules.get(x, y)) continue;
      for (let dy = 0; dy < px; dy++) for (let dx = 0; dx < px; dx++) {
        const i = (((y + margin) * px + dy) * size + (x + margin) * px + dx) * 4;
        data[i] = data[i + 1] = data[i + 2] = 0;
      }
    }
    const read = jsQR(data, size, size);
    expect(read?.data).toBe(text);
    expect(decodeCard(read!.data)).toEqual(card());
  });
});
