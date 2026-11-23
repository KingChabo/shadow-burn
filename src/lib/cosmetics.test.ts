import { describe, expect, it } from 'vitest';
import { buyItem, defaultAvatar, ITEMS, lookFromWire, lookToWire, SLOTS } from './avatar';
import {
  BACKDROPS, buyCos, cosFromWire, cosToWire, defaultCos, equipCos, GEM_PACE, normalizeCos, TAGS, TITLES,
} from './cosmetics';
import { decodeCard, encodeCard, type PlayerCard } from './leaderboard';

const card = (o: Partial<PlayerCard> = {}): PlayerCard => ({
  id: 'abcd-1234', name: 'Alex', level: 30, total: 99999, week: 999, weekKey: '2026-11-16', streak: 40, longest: 90, rec: { pushup: 80 }, at: 1_795_000_000_000, ...o,
});

describe('Shop-Sortiment', () => {
  it('IDs sind eindeutig', () => {
    const ids = [...ITEMS, ...TAGS, ...BACKDROPS, ...TITLES].map((x) => x.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
  it('jede Seltenheit hat ihren Preisbereich', () => {
    const band = { common: [0, 100], rare: [100, 300], epic: [280, 600], legendary: [600, 1600] } as const;
    for (const x of [...ITEMS, ...TAGS, ...BACKDROPS, ...TITLES]) {
      const [lo, hi] = band[x.rarity];
      expect(x.price, x.id).toBeGreaterThanOrEqual(lo);
      expect(x.price, x.id).toBeLessThanOrEqual(hi);
    }
  });
  it('alles zu kaufen dauert bei täglichem Training deutlich über ein Jahr', () => {
    const total = [...ITEMS, ...TAGS, ...BACKDROPS, ...TITLES].reduce((s, x) => s + x.price, 0);
    expect(total / GEM_PACE).toBeGreaterThan(365);
  });
  it('legendäre Sachen brauchen ein hohes Level', () => {
    for (const x of [...ITEMS, ...TAGS, ...BACKDROPS, ...TITLES].filter((x) => x.rarity === 'legendary')) {
      expect(x.minLevel ?? 0, x.id).toBeGreaterThanOrEqual(22);
    }
  });
});

describe('Level-Sperre', () => {
  it('Kleidung und Tags erst ab dem Level', () => {
    expect(buyItem(defaultAvatar(), 9999, 'crown_gold', 10)).toEqual({ ok: false, reason: 'Erst ab Level 35.' });
    expect(buyItem(defaultAvatar(), 9999, 'crown_gold', 35).ok).toBe(true);
    expect(buyCos(defaultCos(), 9999, 'tag', 'tag_gold', 3)).toEqual({ ok: false, reason: 'Erst ab Level 25.' });
  });
});

describe('Tags, Hintergründe, Titel', () => {
  it('kaufen zieht Gems ab und aktiviert', () => {
    const r = buyCos(defaultCos(), 100, 'tag', 'tag_glut', 1);
    expect(r.ok && r.gems).toBe(20);
    if (!r.ok) throw new Error();
    expect(r.state.tag).toBe('tag_glut');
    expect(buyCos(r.state, 100, 'tag', 'tag_glut', 1)).toEqual({ ok: false, reason: 'Hast du schon.' });
    expect(buyCos(defaultCos(), 10, 'title', 'ti_early', 1)).toEqual({ ok: false, reason: 'Dir fehlen 50 Gems.' });
  });
  it('anlegen nur Gekauftes; Standard = ablegen', () => {
    const c = defaultCos();
    expect(equipCos(c, 'backdrop', 'bd_space')).toBe(c);
    const own = { ...c, owned: [...c.owned, 'bd_gym'] };
    expect(equipCos(own, 'backdrop', 'bd_gym').backdrop).toBe('bd_gym');
    expect(equipCos({ ...own, backdrop: 'bd_gym' }, 'backdrop', 'bd_none').backdrop).toBeUndefined();
  });
  it('kaputte Daten werden repariert', () => {
    const n = normalizeCos({ owned: ['quatsch', 'tag_glut'], tag: 'tag_gold', title: 'ti_none' });
    expect(n.owned).toContain('tag_plain');
    expect(n.owned).not.toContain('quatsch');
    expect(n.tag).toBeUndefined();
  });
  it('QR-Weg', () => {
    const cs = { tag: 'tag_galaxy', backdrop: 'bd_city', title: 'ti_beast' };
    expect(cosFromWire(cosToWire(cs))).toEqual(cs);
    expect(cosFromWire(cosToWire({}))).toEqual({});
    expect(cosFromWire('x')).toBeUndefined();
  });
});

describe('Spielerkarte mit allem', () => {
  it('Extras-Slot, Tag, Hintergrund und Titel kommen an', () => {
    const c = card({
      av: { skin: 1, hair: 2, equipped: { top: 'robe_champion', bottom: 'shorts_gold', shoes: 'sneaker_gold', head: 'crown_gold', acc: 'chain_gold' } },
      cs: { tag: 'tag_phantom', backdrop: 'bd_space', title: 'ti_phantom' },
    });
    const t = encodeCard(c);
    expect(t.length).toBeLessThan(800);
    expect(decodeCard(t)).toEqual(c);
  });
  it('alte Avatar-Daten mit 4 Bereichen bleiben lesbar', () => {
    const w = lookToWire({ skin: 0, hair: 0, equipped: { top: 'tee_basic' } }).slice(0, 6);
    expect(lookFromWire(w)?.equipped).toEqual({ top: 'tee_basic' });
    expect(SLOTS.length).toBe(5);
  });
});
