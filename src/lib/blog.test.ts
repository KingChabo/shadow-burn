import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import QRCode from 'qrcode';
import jsQR from 'jsqr';
import {
  acceptFix, decodeRoute, demoPosts, distKm, encodeRoute, FrameCollector, mergePosts, packBlog, parseFrame, parseKm,
  pickShare, routeKm, RECEIVE_POSTS, SHARE_POSTS, SHARE_POSTS_BT, shareDays, shareDaysText, simplify, toFrames, unpackBlog, validImage,
  type BlogPost, type LatLon,
} from './blog';
import { encodeCard, type PlayerCard } from './leaderboard';

const card: PlayerCard = { id: 'abcd-1234', name: 'Lena', level: 7, total: 900, week: 120, weekKey: '2026-11-16', streak: 3, longest: 9, rec: { jog: 8.2 }, at: 1_795_000_000_000 };
const me = { id: 'me-1', name: 'Alex', level: 5 };

describe('Blog: Route', () => {
  it('misst Strecken realistisch', () => {
    // 1/100 Grad Breite ≈ 1,11 km
    expect(distKm([52, 13], [52.01, 13])).toBeCloseTo(1.112, 2);
  });
  it('Polyline hin und zurück', () => {
    const pts: LatLon[] = [[52.51123, 13.37311], [52.51201, 13.37401], [52.50999, 13.3701]];
    expect(decodeRoute(encodeRoute(pts))).toEqual(pts);
  });
  it('vereinfacht gerade Strecken auf wenige Punkte', () => {
    const line: LatLon[] = Array.from({ length: 50 }, (_, i) => [52 + i * 0.0001, 13]);
    expect(simplify(line).length).toBe(2);
  });
  it('verwirft ungenaue Punkte, Zittern und Sprünge', () => {
    const a = { lat: 52, lon: 13, acc: 5, t: 0 };
    expect(acceptFix(null, { ...a, acc: 80 }, 'jog')).toBeNull();
    expect(acceptFix(a, { lat: 52.00001, lon: 13, acc: 5, t: 1000 }, 'jog')).toBeNull(); // ~1 m
    expect(acceptFix(a, { lat: 52.01, lon: 13, acc: 5, t: 10_000 }, 'jog')).toBeNull(); // 1,1 km in 10 s
    expect(acceptFix(a, { lat: 52.0001, lon: 13, acc: 5, t: 10_000 }, 'jog')).not.toBeNull(); // 11 m in 10 s
  });
  it('km-Eingabe mit Komma', () => {
    expect(parseKm('5,25')).toBe(5.25);
    expect(parseKm('abc')).toBe(0);
  });
});

describe('Blog: Austausch per animiertem QR-Code', () => {
  const posts = demoPosts(me, 1_795_000_000_000).filter((p) => p.mine);

  it('packt und entpackt Beiträge samt Karte', async () => {
    const payload = await packBlog(encodeCard(card), posts.map((p) => ({ ...p, images: [] })));
    const r = await unpackBlog(payload, 5);
    expect(r.card.name).toBe('Lena');
    expect(r.posts).toHaveLength(2);
    expect(r.posts[0]).toMatchObject({ author: 'abcd-1234', authorName: 'Lena', mine: false, activityId: 'jog', km: 5.4, receivedAt: 5 });
    expect(decodeRoute(r.posts[0].route!).length).toBeGreaterThan(10);
  });

  it('zerlegt in Teile und setzt in beliebiger Reihenfolge zusammen', async () => {
    const payload = await packBlog(encodeCard(card), posts.map((p) => ({ ...p, images: [] })));
    const frames = toFrames(payload, 'x7k2p', 100);
    expect(frames.length).toBeGreaterThan(3);
    const c = new FrameCollector();
    // rückwärts, mit Doppelten und einem fremden Code dazwischen
    for (const f of [...frames].reverse()) { c.add(f); c.add(f); c.add('PHANTOM1:xyz'); }
    expect(c.done).toBe(true);
    expect(c.payload).toBe(payload);
  });

  it('jeder Teil ist als echter QR-Code lesbar', async () => {
    const payload = 'Z' + 'A'.repeat(2000);
    const frames = toFrames(payload, 'ab12cd');
    const c = new FrameCollector();
    for (const f of frames) {
      const qr = QRCode.create(f, { errorCorrectionLevel: 'L' });
      const n = qr.modules.size, s = 3, m = 4, w = (n + 2 * m) * s;
      const px = new Uint8ClampedArray(w * w * 4).fill(255);
      for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (qr.modules.get(y, x)) {
        for (let dy = 0; dy < s; dy++) for (let dx = 0; dx < s; dx++) {
          const o = (((y + m) * s + dy) * w + (x + m) * s + dx) * 4;
          px[o] = px[o + 1] = px[o + 2] = 0;
        }
      }
      const read = jsQR(px, w, w);
      expect(read?.data).toBe(f);
      c.add(read!.data);
    }
    expect(c.payload).toBe(payload);
  });

  it('wechselt bei neuem Absender auf dessen Codes', () => {
    const c = new FrameCollector();
    c.add('PHB1|aaa|0|2|xx');
    c.add('PHB1|bbb|0|1|yy');
    expect(c.done).toBe(true);
    expect(c.payload).toBe('yy');
  });

  it('neue Codes beginnen mit SBB1, alte PHB1-Codes werden weiter gelesen', () => {
    expect(toFrames('abc', 'sid1')[0].startsWith('SBB1|')).toBe(true);
    expect(parseFrame('PHB1|ab|0|1|xx')).toEqual({ sid: 'ab', i: 0, n: 1, data: 'xx' });
    expect(parseFrame('SBB1|ab|0|1|xx')).toEqual({ sid: 'ab', i: 0, n: 1, data: 'xx' });
  });

  it('lehnt kaputte Daten ab', async () => {
    await expect(unpackBlog('Zkaputt')).rejects.toThrow();
    expect(parseFrame('PHB1|ab|5|3|xx')).toBeNull();
    expect(validImage('data:image/svg+xml;utf8,<svg onload=x>')).toBe(false);
    expect(validImage('data:image/webp;base64,AAAA')).toBe(true);
  });

  it('filtert fremde Bilder und kürzt Werte', async () => {
    const evil: BlogPost = { ...posts[0], km: 99999, text: 'x'.repeat(5000), images: ['data:text/html;base64,AAAA', 'data:image/jpeg;base64,AAAA'] };
    const r = await unpackBlog(await packBlog(encodeCard(card), [evil]));
    expect(r.posts[0].km).toBe(1000);
    expect(r.posts[0].text.length).toBe(600);
    expect(r.posts[0].images).toEqual(['data:image/jpeg;base64,AAAA']);
  });
});

describe('Blog: Zusammenführen', () => {
  const base = demoPosts(me, 1);
  it('überschreibt nie eigene Beiträge und keine Beiträge anderer Verfasser', () => {
    const mine = base[0];
    const fake = { ...mine, mine: false, author: 'abcd-1234', text: 'gefälscht' };
    const lena = base[2];
    const r = mergePosts([mine, lena], [fake, { ...lena, author: 'jemand-anders' }, { ...lena, id: 'neu-1' }, { ...lena, text: 'neu' }]);
    expect(r.put.map((p) => p.id)).toEqual(['neu-1', 'demo-lena-1']);
    expect(r).toMatchObject({ added: 1, updated: 1 });
  });
  it('Beispiele haben gültige Routen', () => {
    for (const p of base.filter((x) => x.route)) expect(routeKm(decodeRoute(p.route!))).toBeGreaterThan(3);
  });
});

describe('Blog: Datenbank', () => {
  it('Empfangen speichert Beiträge und den Freund für die Rangliste', async () => {
    const { db } = await import('./db');
    const { receiveBlog, ensureDemo, removeDemo, listPosts } = await import('./blogDb');
    await db.kv.put({ key: 'playerId', value: 'me-1' });
    const lena = { ...demoPosts(me, 1)[0], id: 'lena-post-1', images: [] };
    const r = await receiveBlog(await packBlog(encodeCard(card), [lena]));
    expect(r).toMatchObject({ name: 'Lena', added: 1, friend: 'new' });
    expect(await db.friends.get('abcd-1234')).toMatchObject({ name: 'Lena' });
    expect((await db.posts.get('lena-post-1'))?.mine).toBe(false);
    // zweiter Scan: nichts doppelt
    const r2 = await receiveBlog(await packBlog(encodeCard({ ...card, at: card.at + 1 }), [lena]));
    expect(r2).toMatchObject({ added: 0, updated: 1 });
    expect(await ensureDemo()).toBe(true);
    expect(await ensureDemo()).toBe(false);
    expect((await listPosts()).length).toBe(6);
    await removeDemo();
    expect((await listPosts()).map((p) => p.id)).toEqual(['lena-post-1']);
  });
  it('Tausch schickt nur eigene Beiträge der letzten 7 Tage', async () => {
    const { db } = await import('./db');
    const { packMine } = await import('./blogDb');
    const now = 1_796_000_000_000, day = 86_400_000;
    const base = { ...demoPosts(me, now)[0], mine: true, demo: false, images: [] as string[] };
    await db.posts.bulkPut([
      { ...base, id: 'w-neu', at: now - day },
      { ...base, id: 'w-grenze', at: now - 7 * day },
      { ...base, id: 'w-alt', at: now - 8 * day },
    ]);
    const r = await packMine(async () => null, true, now);
    const { posts } = await unpackBlog(r.payload, now);
    expect(posts.map((p) => p.id).sort()).toEqual(['w-grenze', 'w-neu']);
    expect(r.posts).toBe(2);
    await db.posts.bulkDelete(['w-neu', 'w-grenze', 'w-alt']);
  });

  it('Zeitraum "Alle", eigene Tage und Grenzen für QR und Bluetooth', async () => {
    const { db } = await import('./db');
    const { packMine, countShare } = await import('./blogDb');
    const now = 1_796_000_000_000, day = 86_400_000;
    const base = { ...demoPosts(me, now)[0], mine: true, demo: false, images: [] as string[] };
    // 250 eigene Beiträge, einer pro Tag, plus ein Beispiel und ein fremder (die gehen nie mit)
    const many = Array.from({ length: 250 }, (_, i) => ({ ...base, id: `z-${String(i).padStart(3, '0')}`, at: now - i * day }));
    await db.posts.bulkPut([...many, { ...base, id: 'z-demo', demo: true }, { ...base, id: 'z-fremd', mine: false }]);
    const ids = (r: { payload: string }) => unpackBlog(r.payload, now).then((u) => u.posts.map((p) => p.id));

    // 30 Tage: Tage 0..30 = 31 Beiträge, per QR nur die 20 neuesten
    const qr = await packMine(async () => null, true, now, { days: 30, max: SHARE_POSTS });
    expect(qr).toMatchObject({ posts: 20, total: 31 });
    expect((await ids(qr))[0]).toBe('z-000');
    expect((await ids(qr))[19]).toBe('z-019');
    // per Bluetooth alle 31
    const bt30 = await packMine(async () => null, true, now, { days: 30, max: SHARE_POSTS_BT });
    expect(bt30).toMatchObject({ posts: 31, total: 31 });
    // "Alle": 250 im Zeitraum, Bluetooth schickt 200, Empfänger nimmt alle 200 an
    const all = await packMine(async () => null, true, now, { days: 'all', max: SHARE_POSTS_BT });
    expect(all).toMatchObject({ posts: 200, total: 250 });
    expect((await ids(all)).length).toBe(200);
    expect(RECEIVE_POSTS).toBe(SHARE_POSTS_BT);
    expect(await countShare('all', now)).toBe(250);
    expect(await countShare(1, now)).toBe(2);
    // ohne Blog: nur die Karte
    expect(await packMine(async () => null, false, now, { days: 'all' })).toMatchObject({ posts: 0, total: 0 });
    await db.posts.bulkDelete([...many.map((p) => p.id), 'z-demo', 'z-fremd']);
  });

  it('Bluetooth: Fotos nur bis zur Grenze, danach Beiträge ohne Foto', async () => {
    const { db } = await import('./db');
    const { packMine } = await import('./blogDb');
    const now = 1_796_000_000_000;
    const img = 'data:image/jpeg;base64,' + 'A'.repeat(1000);
    const base = { ...demoPosts(me, now)[0], mine: true, demo: false, images: [img] };
    await db.posts.bulkPut([0, 1, 2, 3].map((i) => ({ ...base, id: `foto-${i}`, at: now - i * 1000 })));
    const r = await packMine(async (x) => x, true, now, { days: 7, max: SHARE_POSTS_BT, imageBudget: 2500 });
    expect(r).toMatchObject({ posts: 4, images: 2 });
    const u = await unpackBlog(r.payload, now);
    expect(u.posts.map((p) => p.images.length)).toEqual([1, 1, 0, 0]);
    await db.posts.bulkDelete([0, 1, 2, 3].map((i) => `foto-${i}`));
  });
});

describe('Blog: Zeitraum-Einstellung', () => {
  it('prüft die Eingabe', () => {
    expect(shareDays(undefined)).toBe(7);
    expect(shareDays('all')).toBe('all');
    expect(shareDays(30)).toBe(30);
    expect(shareDays('14')).toBe(14);
    expect(shareDays(0)).toBe(1);
    expect(shareDays(-5)).toBe(1);
    expect(shareDays(9999)).toBe(365);
    expect(shareDays(2.6)).toBe(3);
    expect(shareDays('abc')).toBe(7);
    expect(shareDays('')).toBe(7);
    expect(shareDays(NaN)).toBe(7);
  });
  it('Text für den Zeitraum', () => {
    expect(shareDaysText(7)).toBe('der letzten 7 Tage');
    expect(shareDaysText(1)).toBe('der letzten 24 Stunden');
    expect(shareDaysText('all')).toBe('aus der ganzen Zeit');
  });
  it('pickShare: Grenze am Tag genau, neueste zuerst, "Alle" ohne Grenze', () => {
    const now = 1_796_000_000_000, day = 86_400_000;
    const base = { ...demoPosts(me, now)[0], mine: true, demo: false };
    const posts = [
      { ...base, id: 'b', at: now - 3 * day },
      { ...base, id: 'a', at: now - day },
      { ...base, id: 'c', at: now - 3 * day - 1 },
      { ...base, id: 'd', at: now - 400 * day },
    ];
    expect(pickShare(posts, 3, 99, now).posts.map((p) => p.id)).toEqual(['a', 'b']);
    expect(pickShare(posts, 'all', 99, now).posts.map((p) => p.id)).toEqual(['a', 'b', 'c', 'd']);
    expect(pickShare(posts, 'all', 2, now)).toMatchObject({ total: 4 });
    expect(pickShare(posts, 'all', 2, now).posts.length).toBe(2);
  });
});

