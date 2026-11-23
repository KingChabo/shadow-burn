import { APP_DASH } from './brand';
import { ACT, type ActivityId } from '../data/activities';
import type { AvatarLook } from './avatar';
import { decodeCard, type PlayerCard } from './leaderboard';

/**
 * Blog: Trainingsberichte von Ausdauer-Sessions (Joggen, Radeln …) mit Text, Fotos und
 * optional der gelaufenen Route. Alles bleibt auf dem Handy. Freunde tauschen ihre Blogs
 * über einen animierten QR-Code aus (viele kleine Codes nacheinander).
 */

/** [Breite, Länge] in Grad */
export type LatLon = [number, number];

export interface BlogPost {
  /** zufällige ID, bleibt beim Austausch gleich (kein Doppeltes beim zweiten Scan) */
  id: string;
  /** Spieler-ID des Verfassers */
  author: string;
  authorName: string;
  authorLevel: number;
  av?: AvatarLook;
  /** von mir (true) oder per QR empfangen (false) */
  mine: boolean;
  /** Beispiel-Eintrag (zum Ausprobieren, lässt sich entfernen) */
  demo?: boolean;
  /** Zeitpunkt des Postens */
  at: number;
  activityId: ActivityId;
  start: number;
  /** aktive Zeit in Sekunden (ohne Pausen) */
  seconds: number;
  km: number;
  points: number;
  /** per GPS gemessene Strecke (nur wenn Route freigegeben) */
  gpsKm?: number;
  /** Route als Polyline-Text (Google-Format, 5 Nachkommastellen), nur wenn freigegeben */
  route?: string;
  text: string;
  /** Fotos als data:-URL, schon verkleinert */
  images: string[];
  /** zugehöriges Training in db.workouts (nur eigene) */
  workoutId?: number;
  /** wann empfangen */
  receivedAt?: number;
}

export const TEXT_MAX = 600;
export const MAX_IMAGES = 3;
/** Fotos im Blog: längste Seite in Pixel */
export const IMAGE_EDGE = 900;
/** Fotos für den QR-Austausch: viel kleiner, damit es nicht ewig dauert */
export const SHARE_IMAGE_EDGE = 220;
/** Standard: beim Tausch nur Beiträge der letzten 7 Tage senden (einstellbar, siehe shareDays) */
export const SHARE_DAYS = 7;
/** Einstellbarer Zeitraum: 1 bis 365 Tage oder 'all' */
export const SHARE_DAYS_MAX = 365;
/** Höchstens so viele Beiträge per QR-Code (sonst werden es zu viele Codes) */
export const SHARE_POSTS = 20;
/** Höchstens so viele Beiträge per Bluetooth */
export const SHARE_POSTS_BT = 200;
/** So viele Beiträge nimmt der Empfänger höchstens an (ältere Apps: 20, nehmen dann die ersten 20) */
export const RECEIVE_POSTS = SHARE_POSTS_BT;

export type ShareDays = number | 'all';

/** Eingestellten Zeitraum prüfen: ganze Tage 1–365, 'all' oder Standard 7 */
export function shareDays(v: unknown): ShareDays {
  if (v === 'all') return 'all';
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() ? Number(v) : NaN;
  if (!Number.isFinite(n)) return SHARE_DAYS;
  return Math.min(SHARE_DAYS_MAX, Math.max(1, Math.round(n)));
}

/** "der letzten 7 Tage", "von gestern und heute", "aus der ganzen Zeit" */
export function shareDaysText(d: ShareDays): string {
  if (d === 'all') return 'aus der ganzen Zeit';
  return d === 1 ? 'der letzten 24 Stunden' : `der letzten ${d} Tage`;
}

/**
 * Eigene Beiträge für den Tausch auswählen: keine Beispiele, nur im Zeitraum, neueste zuerst,
 * höchstens `max`. `total` = wie viele im Zeitraum gewesen wären.
 */
export function pickShare(all: BlogPost[], days: ShareDays, max: number, now = Date.now()): { posts: BlogPost[]; total: number } {
  const since = days === 'all' ? -Infinity : now - days * 86_400_000;
  const ok = all.filter((p) => p.mine && !p.demo && p.at >= since).sort((a, b) => b.at - a.at);
  return { posts: ok.slice(0, max), total: ok.length };
}

/** Sportarten für die Session: zuerst die mit Strecke, dann Sportarten nach Zeit */
export const BLOG_DISTANCE: ActivityId[] = ['jog', 'bike', 'walk', 'hike', 'inline', 'nordic', 'rowing', 'swim'];
export const BLOG_TIME: ActivityId[] = ['football', 'tennis', 'basketball', 'climbing', 'ski', 'dance', 'spinning', 'crosstrainer'];
export const usesKm = (id: ActivityId) => ACT[id]?.unit === 'distance';

// ---------- Route / GPS ----------

const R_EARTH = 6371.0088;
const rad = (d: number) => (d * Math.PI) / 180;

/** Abstand zweier Punkte in km (Haversine) */
export function distKm(a: LatLon, b: LatLon): number {
  const dLat = rad(b[0] - a[0]);
  const dLon = rad(b[1] - a[1]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a[0])) * Math.cos(rad(b[0])) * Math.sin(dLon / 2) ** 2;
  return 2 * R_EARTH * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function routeKm(pts: LatLon[]): number {
  let s = 0;
  for (let i = 1; i < pts.length; i++) s += distKm(pts[i - 1], pts[i]);
  return s;
}

export interface GpsFix { lat: number; lon: number; acc: number; t: number }

/** Höchstgeschwindigkeit je Sportart in km/h, schneller = GPS-Sprung, wird verworfen */
export function maxKmh(id: ActivityId): number {
  if (id === 'bike' || id === 'inline' || id === 'ski') return 90;
  return 45;
}

/**
 * Neuen GPS-Punkt prüfen: ungenaue Punkte (> 35 m), Zittern (< 4 m) und Sprünge verwerfen.
 * Gibt den Punkt zurück, der an die Route gehängt wird, sonst null.
 */
export function acceptFix(last: (GpsFix | null), f: GpsFix, id: ActivityId): GpsFix | null {
  if (!Number.isFinite(f.lat) || !Number.isFinite(f.lon) || f.acc > 35) return null;
  if (!last) return f;
  const d = distKm([last.lat, last.lon], [f.lat, f.lon]);
  if (d < 0.004) return null;
  const h = Math.max(1, f.t - last.t) / 3_600_000;
  if (d / h > maxKmh(id)) return null;
  return f;
}

/** Linie vereinfachen (Douglas-Peucker), Toleranz in Metern */
export function simplify(pts: LatLon[], tolM = 6): LatLon[] {
  if (pts.length < 3) return pts.slice();
  const lat0 = rad(pts[0][0]);
  const xy = pts.map(([la, lo]) => [lo * Math.cos(lat0) * 111_320, la * 110_574] as const);
  const keep = new Uint8Array(pts.length);
  keep[0] = keep[pts.length - 1] = 1;
  const stack: [number, number][] = [[0, pts.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop()!;
    const [ax, ay] = xy[a], [bx, by] = xy[b];
    const dx = bx - ax, dy = by - ay;
    const len = Math.hypot(dx, dy);
    let best = -1, bi = -1;
    for (let i = a + 1; i < b; i++) {
      // Rundkurs (Start = Ziel): Abstand zum Startpunkt statt zur Linie
      const d = len < 1 ? Math.hypot(xy[i][0] - ax, xy[i][1] - ay) : Math.abs(dy * xy[i][0] - dx * xy[i][1] + bx * ay - by * ax) / len;
      if (d > best) { best = d; bi = i; }
    }
    if (best > tolM && bi > 0) { keep[bi] = 1; stack.push([a, bi], [bi, b]); }
  }
  return pts.filter((_, i) => keep[i]);
}

/** Polyline-Kodierung (Google-Format), sehr kompakt für QR-Codes */
export function encodeRoute(pts: LatLon[]): string {
  let out = '', pLat = 0, pLon = 0;
  const enc = (v: number) => {
    let x = v < 0 ? ~(v << 1) : v << 1;
    while (x >= 0x20) { out += String.fromCharCode((0x20 | (x & 0x1f)) + 63); x >>= 5; }
    out += String.fromCharCode(x + 63);
  };
  for (const [la, lo] of pts) {
    const a = Math.round(la * 1e5), b = Math.round(lo * 1e5);
    enc(a - pLat); enc(b - pLon);
    pLat = a; pLon = b;
  }
  return out;
}

export function decodeRoute(s: string): LatLon[] {
  const pts: LatLon[] = [];
  let i = 0, lat = 0, lon = 0;
  const dec = () => {
    let shift = 0, res = 0, b: number;
    do {
      if (i >= s.length) throw new Error('Route kaputt');
      b = s.charCodeAt(i++) - 63;
      res |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20 && shift < 35);
    return res & 1 ? ~(res >> 1) : res >> 1;
  };
  while (i < s.length) {
    lat += dec(); lon += dec();
    pts.push([lat / 1e5, lon / 1e5]);
  }
  return pts;
}

// ---------- Eingabe prüfen ----------

/** km-Eingabe "5,2" oder "5.2" */
export function parseKm(s: string): number {
  const v = parseFloat(s.replace(',', '.'));
  return Number.isFinite(v) && v > 0 ? Math.round(v * 100) / 100 : 0;
}

export function cleanText(s: string): string {
  return s.replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, '').slice(0, TEXT_MAX);
}

const IMG_RE = /^data:image\/(jpeg|webp|png);base64,[A-Za-z0-9+/=]+$/;
/** Nur echte, kleine Bilder annehmen */
export function validImage(s: unknown, maxLen = 60_000): s is string {
  return typeof s === 'string' && s.length <= maxLen && IMG_RE.test(s);
}

// ---------- Austausch per animiertem QR-Code ----------

export const FRAME_PREFIX = 'SBB1';
/** Alter Vorsatz (App hieß früher PHANTOM): wird beim Empfangen weiter angenommen */
export const OLD_FRAME_PREFIXES = ['PHB1'];
/** Zeichen pro QR-Code: klein genug, dass jsQR den Code vom Bildschirm sicher liest */
export const CHUNK = 480;
/** Wie lange jeder Code stehen bleibt (ms) */
export const FRAME_MS = 260;

interface WirePost {
  i: string; a: number; s: string; st: number; t: number; k: number; p: number;
  g?: number; r?: string; x: string; im: string[];
}
interface WireBundle { v: 1; c: string; p: WirePost[] }

function toB64Url(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function fromB64Url(s: string): Uint8Array {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4);
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

async function pipe(bytes: Uint8Array, stream: TransformStream<Uint8Array, Uint8Array>): Promise<Uint8Array> {
  const out = new Response(new Blob([bytes as BlobPart]).stream().pipeThrough(stream));
  return new Uint8Array(await out.arrayBuffer());
}
const canZip = () => typeof CompressionStream !== 'undefined' && typeof DecompressionStream !== 'undefined';

/** Eigene Beiträge + Spielerkarte zu einem Text packen (gepackt mit deflate, falls möglich) */
export async function packBlog(cardText: string, posts: BlogPost[]): Promise<string> {
  const bundle: WireBundle = {
    v: 1,
    c: cardText,
    p: posts.map((p) => ({
      i: p.id, a: p.at, s: p.activityId, st: p.start, t: Math.round(p.seconds), k: p.km, p: p.points,
      ...(p.gpsKm ? { g: Math.round(p.gpsKm * 100) / 100 } : {}),
      ...(p.route ? { r: p.route } : {}),
      x: p.text, im: p.images,
    })),
  };
  const raw = new TextEncoder().encode(JSON.stringify(bundle));
  if (!canZip()) return 'J' + toB64Url(raw);
  return 'Z' + toB64Url(await pipe(raw, new CompressionStream('deflate-raw') as unknown as TransformStream<Uint8Array, Uint8Array>));
}

const BAD = `Das ist kein gültiger ${APP_DASH}-Blog.`;

export interface Unpacked { card: PlayerCard; posts: BlogPost[] }

export async function unpackBlog(text: string, now = Date.now()): Promise<Unpacked> {
  let json: string;
  try {
    const bytes = fromB64Url(text.slice(1));
    if (text[0] === 'Z') json = new TextDecoder().decode(await pipe(bytes, new DecompressionStream('deflate-raw') as unknown as TransformStream<Uint8Array, Uint8Array>));
    else if (text[0] === 'J') json = new TextDecoder().decode(bytes);
    else throw new Error(BAD);
  } catch { throw new Error(BAD); }
  let b: WireBundle;
  try { b = JSON.parse(json); } catch { throw new Error(BAD); }
  if (!b || b.v !== 1 || typeof b.c !== 'string' || !Array.isArray(b.p)) throw new Error(BAD);
  const card = decodeCard(b.c);
  const n = (x: unknown, max: number) => (typeof x === 'number' && Number.isFinite(x) && x >= 0 ? Math.min(x, max) : 0);
  const posts: BlogPost[] = [];
  for (const w of b.p.slice(0, RECEIVE_POSTS)) {
    if (!w || typeof w.i !== 'string' || w.i.length < 4 || w.i.length > 64) continue;
    if (typeof w.s !== 'string' || !(w.s in ACT)) continue;
    let route: string | undefined;
    if (typeof w.r === 'string' && w.r.length <= 6000) {
      try { if (decodeRoute(w.r).length >= 2) route = w.r; } catch { route = undefined; }
    }
    posts.push({
      id: w.i,
      author: card.id,
      authorName: card.name,
      authorLevel: card.level,
      ...(card.av ? { av: card.av } : {}),
      mine: false,
      at: n(w.a, 1e14),
      activityId: w.s as ActivityId,
      start: n(w.st, 1e14),
      seconds: Math.round(n(w.t, 48 * 3600)),
      km: Math.round(n(w.k, 1000) * 100) / 100,
      points: Math.round(n(w.p, 100_000)),
      ...(w.g ? { gpsKm: Math.round(n(w.g, 1000) * 100) / 100 } : {}),
      ...(route ? { route } : {}),
      text: cleanText(typeof w.x === 'string' ? w.x : ''),
      images: (Array.isArray(w.im) ? w.im : []).filter((s) => validImage(s)).slice(0, MAX_IMAGES),
      receivedAt: now,
    });
  }
  return { card, posts };
}

/** Text in viele QR-Codes zerlegen: "SBB1|sid|i|n|daten" */
export function toFrames(payload: string, sid: string, size = CHUNK): string[] {
  const n = Math.max(1, Math.ceil(payload.length / size));
  return Array.from({ length: n }, (_, i) => `${FRAME_PREFIX}|${sid}|${i}|${n}|${payload.slice(i * size, (i + 1) * size)}`);
}

export interface Frame { sid: string; i: number; n: number; data: string }

export function parseFrame(text: string): Frame | null {
  const m = /^(?:SBB1|PHB1)\|([A-Za-z0-9]{2,12})\|(\d{1,4})\|(\d{1,4})\|([A-Za-z0-9_-]*)$/.exec(text.trim());
  if (!m) return null;
  const i = +m[2], n = +m[3];
  if (n < 1 || n > 2000 || i >= n) return null;
  return { sid: m[1], i, n, data: m[4] };
}

/** Sammelt Codes in beliebiger Reihenfolge, bis alle Teile da sind. */
export class FrameCollector {
  sid: string | null = null;
  n = 0;
  parts: (string | undefined)[] = [];
  got = 0;
  /** true, wenn der Code neu war */
  add(text: string): boolean {
    const f = parseFrame(text);
    if (!f) return false;
    if (this.sid !== f.sid || this.n !== f.n) { this.sid = f.sid; this.n = f.n; this.parts = new Array(f.n); this.got = 0; }
    if (this.parts[f.i] !== undefined) return false;
    this.parts[f.i] = f.data;
    this.got++;
    return true;
  }
  get done(): boolean { return this.n > 0 && this.got === this.n; }
  get payload(): string { return this.parts.join(''); }
}

export function newSid(): string {
  return Math.random().toString(36).slice(2, 8);
}

export function newPostId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return Array.from({ length: 4 }, () => Math.random().toString(36).slice(2, 8)).join('-');
}

/** Empfangene Beiträge einsortieren: gleiche ID wird ersetzt, eigene Beiträge nie überschrieben */
export function mergePosts(existing: BlogPost[], incoming: BlogPost[]): { put: BlogPost[]; added: number; updated: number } {
  const byId = new Map(existing.map((p) => [p.id, p]));
  const put: BlogPost[] = [];
  let added = 0, updated = 0;
  for (const p of incoming) {
    const old = byId.get(p.id);
    if (old?.mine) continue;
    if (old && old.author !== p.author) continue;
    put.push(p);
    if (old) updated++; else added++;
  }
  return { put, added, updated };
}

// ---------- Beispiel-Einträge ----------

/** Runde, etwas wellige Strecke um einen erfundenen Punkt (für die Beispiele) */
function demoLoop(c: LatLon, rKm: number, n: number, wob: number, seed: number): LatLon[] {
  const pts: LatLon[] = [];
  for (let i = 0; i <= n; i++) {
    const t = (i / n) * Math.PI * 2;
    const r = rKm * (1 + wob * Math.sin(t * 3 + seed) + wob * 0.6 * Math.cos(t * 5 + seed * 2));
    const dLat = (r * Math.sin(t)) / 110.574;
    const dLon = (r * Math.cos(t) * 1.35) / (111.32 * Math.cos(rad(c[0])));
    pts.push([c[0] + dLat, c[1] + dLon]);
  }
  return pts;
}

function demoOut(c: LatLon, n: number, seed: number, k = 1): LatLon[] {
  const pts: LatLon[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    pts.push([c[0] + k * (t * 0.11 + 0.012 * Math.sin(t * 9 + seed)), c[1] + k * (t * 0.16 + 0.01 * Math.sin(t * 13 + seed))]);
  }
  return pts;
}

/** Bild als SVG-data-URL, damit die Beispiele ohne Fotos auskommen */
function scene(sky: [string, string], hill: string, hill2: string, sun: string, extra = ''): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 260"><defs><linearGradient id="s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${sky[0]}"/><stop offset="1" stop-color="${sky[1]}"/></linearGradient></defs><rect width="400" height="260" fill="url(#s)"/><circle cx="300" cy="90" r="34" fill="${sun}" opacity=".9"/><path d="M0 170 Q80 120 160 160 T320 150 T400 140 V260 H0Z" fill="${hill2}"/><path d="M0 200 Q100 160 200 195 T400 185 V260 H0Z" fill="${hill}"/><path d="M190 260 C200 230 230 215 260 200 S330 185 400 182" stroke="#f3e9d8" stroke-width="7" fill="none" opacity=".75" stroke-linecap="round"/>${extra}</svg>`;
  return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);
}

export const DEMO_IMAGES = {
  sunset: scene(['#ff9a5a', '#ffd3a1'], '#3b2a3f', '#6b3d4f', '#fff3c4'),
  morning: scene(['#8fc8ff', '#e8f4ff'], '#3f7d4f', '#7fb36a', '#fff6cf', '<circle cx="80" cy="60" r="16" fill="#fff" opacity=".8"/><circle cx="100" cy="58" r="20" fill="#fff" opacity=".8"/>'),
  lake: scene(['#2b3a67', '#7f8fc9'], '#1f2a44', '#3b4a7a', '#ffe9a8', '<rect x="0" y="215" width="400" height="45" fill="#6fa0d8" opacity=".55"/>'),
};

/** Ein paar Beispiel-Beiträge (zwei eigene, drei von Freunden), damit man die Seite sofort sieht */
export function demoPosts(me: { id: string; name: string; level: number; av?: AvatarLook }, now = Date.now()): BlogPost[] {
  const H = 3_600_000;
  const home: LatLon = [52.5112, 13.3731];
  const mk = (o: Partial<BlogPost> & Pick<BlogPost, 'id' | 'activityId' | 'seconds' | 'km' | 'points'>): BlogPost => ({
    author: me.id, authorName: me.name, authorLevel: me.level, ...(me.av ? { av: me.av } : {}),
    mine: true, demo: true, at: now, start: now - o.seconds * 1000, text: '', images: [], ...o,
  });
  const lena: AvatarLook = { skin: 0, hair: 3, equipped: { top: 'tee_basic', bottom: 'shorts_basic', shoes: 'sneaker_white' } };
  const jonas: AvatarLook = { skin: 3, hair: 1, equipped: { top: 'tee_basic', bottom: 'shorts_basic', shoes: 'sneaker_white' } };
  // Strecken so skalieren, dass die GPS-Länge zur eingetragenen Distanz passt
  const fit = (mk: (r: number) => LatLon[], km: number) => { const r0 = routeKm(mk(1)); return mk(km / r0); };
  const loop1 = simplify(fit((r) => demoLoop(home, r, 120, 0.12, 1.3), 5.32), 4);
  const loop2 = simplify(fit((r) => demoLoop([52.5201, 13.3902], r, 160, 0.18, 0.4), 8.13), 5);
  const ride = simplify(fit((r) => demoOut([52.49, 13.33], 200, 2.1, r), 28.4), 8);
  return [
    mk({
      id: 'demo-mine-1', activityId: 'jog', at: now - 2 * H, seconds: 31 * 60 + 12, km: 5.4, points: 62, gpsKm: Math.round(routeKm(loop1) * 100) / 100,
      route: encodeRoute(loop1), text: 'Abendrunde um den See. Die letzten zwei Kilometer richtig Gas gegeben, neue Bestzeit auf der Strecke!',
      images: [DEMO_IMAGES.sunset],
    }),
    mk({
      id: 'demo-mine-2', activityId: 'bike', at: now - 26 * H, seconds: 74 * 60, km: 28.6, points: 94, gpsKm: Math.round(routeKm(ride) * 100) / 100,
      route: encodeRoute(ride), text: 'Mit dem Rad raus aus der Stadt. Gegenwind auf dem Rückweg war brutal.',
    }),
    {
      ...mk({ id: 'demo-lena-1', activityId: 'jog', at: now - 5 * H, seconds: 48 * 60 + 40, km: 8.2, points: 98, gpsKm: Math.round(routeKm(loop2) * 100) / 100, route: encodeRoute(loop2),
        text: 'Morgenlauf vor der Arbeit. 8 km, ohne Pause durch. Wer kommt nächstes Mal mit?', images: [DEMO_IMAGES.morning] }),
      author: 'demo-lena', authorName: 'Lena', authorLevel: 14, av: lena, mine: false, receivedAt: now - 4 * H,
    },
    {
      ...mk({ id: 'demo-jonas-1', activityId: 'football', at: now - 30 * H, seconds: 90 * 60, km: 0, points: 113,
        text: 'Spiel gegen die Nachbarschaft. 4:3 gewonnen, zwei Tore von mir.' }),
      author: 'demo-jonas', authorName: 'Jonas', authorLevel: 9, av: jonas, mine: false, receivedAt: now - 20 * H,
    },
    {
      ...mk({ id: 'demo-lena-2', activityId: 'hike', at: now - 50 * H, seconds: 3 * 3600 + 20 * 60, km: 13.1, points: 96,
        text: 'Wandern am Wochenende, oben am Gipfel gab es den besten Ausblick des Jahres.', images: [DEMO_IMAGES.lake] }),
      author: 'demo-lena', authorName: 'Lena', authorLevel: 14, av: lena, mine: false, receivedAt: now - 4 * H,
    },
  ];
}
