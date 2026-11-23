import { APP_DASH } from './brand';
import { ACT, ACTIVITIES, type ActivityId } from '../data/activities';
import { daysBetween } from './date';
import { lookFromWire, lookToWire, type AvatarLook } from './avatar';
import { cosFromWire, cosToWire, type CosLook } from './cosmetics';
import { bestRecord, fmtRecord, selectionScore } from './recordScore';

/**
 * Rangliste ohne Server: Jedes Handy erzeugt eine "Spielerkarte" und zeigt sie
 * als QR-Code. Freunde scannen den Code und speichern die Karte lokal.
 */

export const CARD_PREFIX = 'SB1:';
/** Alter Vorsatz (App hieß früher PHANTOM): wird beim Scannen weiter angenommen */
export const OLD_CARD_PREFIXES = ['PHANTOM1:'];
const ALL_CARD_PREFIXES = [CARD_PREFIX, ...OLD_CARD_PREFIXES];
/** Ist das der Text einer Spielerkarte (neuer oder alter Vorsatz)? */
export const isCardText = (text: string): boolean => { const t = text.trim(); return ALL_CARD_PREFIXES.some((p) => t.startsWith(p)); };
export const NAME_MAX = 24;

export interface PlayerCard {
  /** zufällige, feste ID pro Installation */
  id: string;
  name: string;
  level: number;
  /** Gesamtpunkte seit Beginn */
  total: number;
  /** Punkte in der Woche `weekKey` */
  week: number;
  /** Montag der Woche als YYYY-MM-DD */
  weekKey: string;
  streak: number;
  longest: number;
  /** Bester Wert je Übung: Reps, Sekunden oder km (je nach Einheit) */
  rec: Partial<Record<ActivityId, number>>;
  /** Zeitpunkt, an dem die Karte erzeugt wurde (ms) */
  at: number;
  /** Aussehen des Avatars (fehlt bei Karten aus älteren App-Versionen) */
  av?: AvatarLook;
  /** Namens-Tag, Avatar-Hintergrund, Titel aus dem Gem-Shop */
  cs?: CosLook;
  /** Statistik, nur wenn der Spieler "Statistik teilen" eingeschaltet hat */
  st?: SharedStats;
}

/** Statistik-Auszug für Freunde (kompakt, damit der QR-Code scannbar bleibt) */
export interface SharedStats {
  /** Trainings gesamt (Übungen + Geräte) */
  sessions: number;
  /** Tage mit Training */
  activeDays: number;
  /** Bewegtes Gewicht an Geräten in kg */
  volume: number;
  /** Punkte der letzten 8 Wochen, älteste zuerst */
  weeks: number[];
  /** Punkte nach Kategorie: kraft, core, cardio, ausdauer, geraete, sport */
  cats: number[];
  /** Anteil je Körperpartie in Prozent: brust, ruecken, schultern, arme, bauch, beine */
  body: number[];
}
// Nur hinten ergänzen: die Reihenfolge steckt in den QR-Karten (ältere Apps lesen die ersten 5)
export const STAT_CATS = ['kraft', 'core', 'cardio', 'ausdauer', 'geraete', 'sport'];
export const STAT_BODY = ['brust', 'ruecken', 'schultern', 'arme', 'bauch', 'beine'];

export interface Friend extends PlayerCard {
  /** wann zuletzt gescannt (ms) */
  scannedAt: number;
}

/**
 * `rec:<id>`  = eine Übung, roher Rekord
 * `sel:<id>,<id>` = mehrere Übungen, Durchschnitt der Leistung in %
 * `best`      = jeder mit seinem stärksten Rekord, Leistung in %
 */
export type Board = 'total' | 'week' | 'streak' | 'best' | `rec:${ActivityId}` | `sel:${string}`;

/** Board für eine Auswahl von Übungen (eine Übung = roher Rekord) */
export function selectionBoard(ids: ActivityId[]): Board | null {
  if (!ids.length) return null;
  return ids.length === 1 ? `rec:${ids[0]}` : `sel:${ids.join(',')}`;
}

/** Übungen aus einem `sel:`-Board */
export function boardIds(board: Board): ActivityId[] {
  if (board.startsWith('rec:')) return [board.slice(4) as ActivityId];
  if (board.startsWith('sel:')) return board.slice(4).split(',').filter((k) => k in ACT) as ActivityId[];
  return [];
}

/** Rangliste aus Rekorden (nur Leute mit Wert zeigen) */
export const isRecordBoard = (b: Board) => b === 'best' || b.startsWith('rec:') || b.startsWith('sel:');

export interface RankRow {
  id: string;
  name: string;
  level: number;
  value: number;
  isMe: boolean;
  /** Zeitpunkt der Daten (für "Stand: vor …") */
  at: number;
  /** Wochenwert stammt aus einer älteren Woche und zählt deshalb 0 */
  staleWeek: boolean;
  rank: number;
  /** Zusatz bei Rekord-Vergleich, z. B. "Plank 4:00 min" */
  note?: string;
}

/** Montag der Woche, in der `day` liegt (YYYY-MM-DD). */
export function weekKey(day: string): string {
  const [y, m, d] = day.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  const dow = (dt.getUTCDay() + 6) % 7; // Mo=0 … So=6
  dt.setUTCDate(dt.getUTCDate() - dow);
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`;
}

/** Hauptwert eines Rekords passend zur Einheit der Übung. */
export function recordValue(activityId: ActivityId, r: { reps?: number; seconds?: number; km?: number } | undefined): number {
  if (!r) return 0;
  const unit = ACT[activityId].unit;
  if (unit === 'reps') return r.reps ?? 0;
  if (unit === 'time') return r.seconds ?? 0;
  return r.km ?? 0;
}

// ---------- Kodieren / Dekodieren ----------

function toBase64Url(s: string): string {
  const bytes = new TextEncoder().encode(s);
  let bin = '';
  bytes.forEach((b) => { bin += String.fromCharCode(b); });
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(s: string): string {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4);
  const bin = atob(b64);
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

/** Kurze Feldnamen, damit der QR-Code klein und gut scannbar bleibt. */
interface Wire {
  i: string; n: string; l: number; t: number; w: number; wk: string; s: number; ls: number; r: Record<string, number>; a: number;
  /** Avatar: [Haut, Haare, top, bottom, shoes, head] */
  av?: number[];
  /** Shop-Sachen: [tag, backdrop, title] */
  cs?: number[];
  /** Statistik: [sessions, activeDays, volume, weeks[8], cats[5], body[6]] */
  st?: [number, number, number, number[], number[], number[]];
}

export function encodeCard(c: PlayerCard): string {
  const r: Record<string, number> = {};
  for (const [k, v] of Object.entries(c.rec)) if (v && v > 0) r[k] = Math.round(v * 100) / 100;
  const wire: Wire = { i: c.id, n: c.name.slice(0, NAME_MAX), l: c.level, t: c.total, w: c.week, wk: c.weekKey, s: c.streak, ls: c.longest, r, a: c.at };
  if (c.av) wire.av = lookToWire(c.av);
  if (c.cs && Object.keys(c.cs).length) wire.cs = cosToWire(c.cs);
  if (c.st) {
    const R = (x: number) => Math.round(x);
    wire.st = [R(c.st.sessions), R(c.st.activeDays), R(c.st.volume), c.st.weeks.map(R), c.st.cats.map(R), c.st.body.map(R)];
  }
  return CARD_PREFIX + toBase64Url(JSON.stringify(wire));
}

const INVALID = `Das ist kein gültiger ${APP_DASH}-Code.`;
const num = (x: unknown, max = 1e9): number => {
  if (typeof x !== 'number' || !Number.isFinite(x) || x < 0) throw new Error(INVALID);
  return Math.min(x, max);
};

export function decodeCard(text: string): PlayerCard {
  const t = text.trim();
  const prefix = ALL_CARD_PREFIXES.find((p) => t.startsWith(p));
  if (!prefix) throw new Error(INVALID);
  let w: Wire;
  try { w = JSON.parse(fromBase64Url(t.slice(prefix.length))); } catch { throw new Error(INVALID); }
  if (!w || typeof w !== 'object') throw new Error(INVALID);
  if (typeof w.i !== 'string' || w.i.length < 4 || w.i.length > 64) throw new Error(INVALID);
  if (typeof w.n !== 'string') throw new Error(INVALID);
  if (typeof w.wk !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(w.wk)) throw new Error(INVALID);
  const rec: PlayerCard['rec'] = {};
  if (w.r && typeof w.r === 'object') {
    for (const [k, v] of Object.entries(w.r)) if (k in ACT) rec[k as ActivityId] = num(v, 1e6);
  }
  return {
    id: w.i,
    name: w.n.replace(/[\u0000-\u001f]/g, '').trim().slice(0, NAME_MAX) || 'Unbekannt',
    level: Math.floor(num(w.l, 10_000)),
    total: Math.round(num(w.t)),
    week: Math.round(num(w.w)),
    weekKey: w.wk,
    streak: Math.floor(num(w.s, 100_000)),
    longest: Math.floor(num(w.ls, 100_000)),
    rec,
    at: num(w.a, 1e14),
    ...(w.av !== undefined && lookFromWire(w.av) ? { av: lookFromWire(w.av) } : {}),
    ...(w.cs !== undefined && cosFromWire(w.cs) && Object.keys(cosFromWire(w.cs)!).length ? { cs: cosFromWire(w.cs) } : {}),
    ...(w.st !== undefined ? { st: decodeStats(w.st) } : {}),
  };
}

function decodeStats(st: unknown): SharedStats {
  if (!Array.isArray(st) || st.length < 6) throw new Error(INVALID);
  const arr = (x: unknown, len: number, max: number): number[] => {
    if (!Array.isArray(x)) throw new Error(INVALID);
    return Array.from({ length: len }, (_, k) => Math.round(num(x[k] ?? 0, max)));
  };
  return {
    sessions: Math.round(num(st[0], 1e7)),
    activeDays: Math.round(num(st[1], 1e6)),
    volume: Math.round(num(st[2])),
    weeks: arr(st[3], 8, 1e8),
    cats: arr(st[4], STAT_CATS.length, 1e9),
    body: arr(st[5], STAT_BODY.length, 100),
  };
}

// ---------- Freunde zusammenführen ----------

/** Neue Karte übernehmen, außer die gespeicherte ist neuer. */
export function mergeFriend(existing: Friend | undefined, incoming: PlayerCard, now: number): { friend: Friend; status: 'new' | 'updated' | 'older' } {
  if (!existing) return { friend: { ...incoming, scannedAt: now }, status: 'new' };
  if (incoming.at < existing.at) return { friend: { ...existing, scannedAt: now }, status: 'older' };
  return { friend: { ...incoming, scannedAt: now }, status: 'updated' };
}

// ---------- Ranglisten ----------

function boardValue(c: PlayerCard, board: Board, currentWeek: string): { value: number; staleWeek: boolean; note?: string } {
  if (board === 'total') return { value: c.total, staleWeek: false };
  if (board === 'streak') return { value: c.streak, staleWeek: false };
  if (board === 'week') {
    const stale = c.weekKey !== currentWeek;
    return { value: stale ? 0 : c.week, staleWeek: stale };
  }
  if (board === 'best') {
    const b = bestRecord(c.rec);
    return b ? { value: b.score, staleWeek: false, note: `${ACT[b.id].name} ${fmtRecord(b.id, b.value)}` } : { value: 0, staleWeek: false };
  }
  if (board.startsWith('sel:')) {
    const ids = boardIds(board);
    const done = ids.filter((id) => (c.rec[id] ?? 0) > 0);
    const note = done.length === ids.length ? undefined : `${done.length} von ${ids.length} Übungen`;
    return { value: selectionScore(c.rec, ids), staleWeek: false, note };
  }
  const id = board.slice(4) as ActivityId;
  return { value: c.rec[id] ?? 0, staleWeek: false };
}

/** Sortiert absteigend; gleiche Werte teilen sich den Platz (1, 2, 2, 4). */
export function buildRanking(me: PlayerCard, friends: PlayerCard[], board: Board, currentWeek: string): RankRow[] {
  const all = [me, ...friends.filter((f) => f.id !== me.id)];
  let rows = all.map((c) => {
    const { value, staleWeek, note } = boardValue(c, board, currentWeek);
    return { id: c.id, name: c.name, level: c.level, value, isMe: c.id === me.id, at: c.at, staleWeek, rank: 0, ...(note ? { note } : {}) };
  });
  // Bei Rekorden nur Leute zeigen, die die Übung gemacht haben (sich selbst immer)
  if (isRecordBoard(board)) rows = rows.filter((r) => r.value > 0 || r.isMe);
  rows.sort((a, b) => b.value - a.value || Number(b.isMe) - Number(a.isMe) || a.name.localeCompare(b.name, 'de'));
  rows.forEach((r, i) => { r.rank = i > 0 && rows[i - 1].value === r.value ? rows[i - 1].rank : i + 1; });
  return rows;
}

/** Übungen, für die mindestens einer einen Rekord hat (in Katalog-Reihenfolge). */
export function recordActivities(cards: PlayerCard[]): ActivityId[] {
  return ACTIVITIES.filter((a) => cards.some((c) => (c.rec[a.id] ?? 0) > 0)).map((a) => a.id);
}

export function fmtBoardValue(board: Board, v: number): string {
  if (board === 'best' || board.startsWith('sel:')) return `${v.toLocaleString('de-DE')} %`;
  if (!board.startsWith('rec:')) return v.toLocaleString('de-DE');
  return fmtRecord(board.slice(4) as ActivityId, v);
}

/** "gerade eben", "vor 5 Min.", "vor 3 Std.", "gestern", "vor 4 Tagen" */
export function fmtAgo(at: number, now: number, todayKey: string, atKey: string): string {
  const min = Math.floor((now - at) / 60_000);
  if (min < 2) return 'gerade eben';
  if (min < 60) return `vor ${min} Min.`;
  const days = daysBetween(atKey, todayKey);
  if (days <= 0) return `vor ${Math.floor(min / 60)} Std.`;
  if (days === 1) return 'gestern';
  return `vor ${days} Tagen`;
}
