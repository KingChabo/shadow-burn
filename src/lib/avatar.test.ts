import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  bodyStage, bodyStrength, buyItem, defaultAvatar, equipItem, ITEMS, lookFromWire, lookToWire, normalizeAvatar, STARTER_ITEMS,
} from './avatar';
import { activeTheme, chooseTheme, hexToRgbTriplet, nextTheme, THEMES, unlockedThemes } from './themes';
import { decodeCard, encodeCard, type PlayerCard } from './leaderboard';
import { db, setKV } from './db';
import { buildMyCard, defaultSettings, sharedStatsFrom } from './game';

describe('Avatar-Körper', () => {
  it('Stufe 0 bis Level 4, dann alle 5 Level eine Stufe, ab 30 Maximum', () => {
    expect([1, 4, 5, 9, 10, 14, 15, 20, 25, 29, 30, 99].map(bodyStage)).toEqual([0, 0, 1, 1, 2, 2, 3, 4, 5, 5, 6, 6]);
  });
  it('Stärke wächst mit jedem Level, Level 1 = 0, ab 30 = 1', () => {
    expect(bodyStrength(1)).toBe(0);
    expect(bodyStrength(30)).toBe(1);
    expect(bodyStrength(80)).toBe(1);
    for (let l = 1; l < 30; l++) expect(bodyStrength(l + 1)).toBeGreaterThan(bodyStrength(l));
  });
});

describe('Gem-Shop', () => {
  it('Start: Basisteile besessen und angezogen', () => {
    const a = defaultAvatar();
    expect(a.owned).toEqual(STARTER_ITEMS);
    expect(a.equipped.top).toBe('tee_basic');
  });
  it('kaufen zieht ab, zieht an; zu wenig Gems oder doppelt geht nicht', () => {
    const a = defaultAvatar();
    expect(buyItem(a, 10, 'hoodie_grey')).toEqual({ ok: false, reason: 'Dir fehlen 80 Gems.' });
    const r = buyItem(a, 100, 'hoodie_grey');
    expect(r.ok && r.gems).toBe(10);
    if (!r.ok) throw new Error();
    expect(r.state.equipped.top).toBe('hoodie_grey');
    expect(buyItem(r.state, 100, 'hoodie_grey').ok).toBe(false);
    expect(buyItem(a, 100, 'gibtsnicht').ok).toBe(false);
  });
  it('anziehen nur Gekauftes im passenden Slot, ausziehen geht', () => {
    const a = defaultAvatar();
    expect(equipItem(a, 'top', 'jersey_red')).toBe(a);
    expect(equipItem(a, 'bottom', 'tee_basic')).toBe(a);
    expect(equipItem(a, 'top', null).equipped.top).toBeUndefined();
  });
  it('kaputte/alte Daten werden repariert', () => {
    const n = normalizeAvatar({ skin: 99, owned: ['jersey_red', 'quatsch'], equipped: { top: 'jersey_red', head: 'tee_basic' } });
    expect(n.skin).toBe(defaultAvatar().skin);
    expect(n.owned).toContain('tee_basic');
    expect(n.owned).not.toContain('quatsch');
    expect(n.equipped).toEqual({ top: 'jersey_red' });
  });
  it('Aussehen übersteht den QR-Weg', () => {
    const look = { skin: 3, hair: 2, equipped: { top: 'compression_blue', shoes: 'runner_neon' } };
    expect(lookFromWire(lookToWire(look))).toEqual(look);
    expect(lookFromWire(['x'])).toBeUndefined();
    // Index eines Teils aus dem falschen Slot wird ignoriert
    expect(lookFromWire([0, 0, ITEMS.findIndex((i) => i.id === 'cap_black'), -1, -1, -1])?.equipped).toEqual({});
  });
});

describe('Level-Themes', () => {
  it('alle 5 Level ein neues', () => {
    expect(unlockedThemes(4).map((t) => t.id)).toEqual(['glut']);
    expect(unlockedThemes(10).length).toBe(3);
    expect(nextTheme(10)?.level).toBe(15);
    THEMES.slice(1).forEach((t, k) => expect(t.level).toBe((k + 1) * 5));
  });
  it('ohne Wahl gilt das neueste', () => {
    expect(activeTheme(12, null).id).toBe('toxic');
  });
  it('ältere Wahl bleibt, bis ein neues Theme dazukommt', () => {
    const c = chooseTheme(12, 'stahl')!;
    expect(activeTheme(14, c).id).toBe('stahl');
    expect(activeTheme(15, c).id).toBe('ozean'); // Level 15: neues wird automatisch aktiv
    expect(chooseTheme(12, 'gold')).toBeNull(); // noch gesperrt
  });
  it('Farbe als CSS-Triplet', () => {
    expect(hexToRgbTriplet('#FF6B35')).toBe('255 107 53');
  });
});

const base = (o: Partial<PlayerCard> = {}): PlayerCard => ({
  id: 'abcd-1234', name: 'Alex', level: 12, total: 4200, week: 310, weekKey: '2026-11-16', streak: 3, longest: 9, rec: { pushup: 40 }, at: 1_795_000_000_000, ...o,
});

describe('QR-Karte mit Avatar und Statistik', () => {
  it('Avatar und Statistik kommen an, Code bleibt klein', () => {
    const c = base({
      av: { skin: 2, hair: 1, equipped: { top: 'jersey_red', bottom: 'joggers_black', shoes: 'boots_black', head: 'cap_black' } },
      st: { sessions: 812, activeDays: 301, volume: 1_234_567, weeks: [1200, 900, 0, 450, 3000, 2500, 1999, 1500], cats: [10000, 2000, 500, 300, 9000, 700], body: [20, 15, 10, 25, 10, 20] },
    });
    const text = encodeCard(c);
    expect(text.length).toBeLessThan(900);
    expect(decodeCard(text)).toEqual(c);
  });
  it('Karten älterer Apps (5 Kategorien, ohne Sportarten) werden mit 0 aufgefüllt', () => {
    const c = base({ st: { sessions: 1, activeDays: 1, volume: 0, weeks: [0, 0, 0, 0, 0, 0, 0, 5], cats: [1, 2, 3, 4, 5], body: [0, 0, 0, 0, 0, 100] } });
    expect(decodeCard(encodeCard(c)).st?.cats).toEqual([1, 2, 3, 4, 5, 0]);
  });
  it('alte Karten ohne Avatar bleiben gültig', () => {
    expect(decodeCard(encodeCard(base())).av).toBeUndefined();
  });
  it('kaputte Statistik wird abgelehnt', () => {
    const t = encodeCard(base({ st: { sessions: -1, activeDays: 0, volume: 0, weeks: [], cats: [], body: [] } }));
    expect(() => decodeCard(t)).toThrow('kein gültiger');
  });
});

describe('eigene Karte', () => {
  beforeEach(async () => { await db.kv.clear(); await db.workouts.clear(); await db.gymLogs.clear(); });
  it('enthält Avatar; Statistik nur wenn Teilen an ist', async () => {
    await setKV('avatar', { ...defaultAvatar(), skin: 4 });
    const off = await buildMyCard(new Date('2026-11-21T12:00:00'));
    expect(off.av?.skin).toBe(4);
    expect(off.st).toBeUndefined();
    await setKV('settings', { ...defaultSettings(), shareStats: true });
    const on = await buildMyCard(new Date('2026-11-21T12:00:00'));
    expect(on.st?.weeks).toHaveLength(8);
    expect(decodeCard(encodeCard(on)).st).toEqual(on.st);
  });
  it('Statistik ohne Training ist leer, aber gültig', () => {
    const st = sharedStatsFrom([], [], '2026-11-21');
    expect(st.sessions).toBe(0);
    expect(st.body).toEqual([0, 0, 0, 0, 0, 0]);
  });
});
