/**
 * Weitere Shop-Sachen neben der Kleidung: Namens-Tags (Rangliste), Avatar-Hintergründe und Titel.
 * Werden per QR-Code mitübertragen, damit Freunde sie sehen.
 * WICHTIG: Listen nur hinten ergänzen, der Index steckt im QR-Code.
 */
import type { Rarity } from './avatar';

export type CosKind = 'tag' | 'backdrop' | 'title';
export const COS_KINDS: CosKind[] = ['tag', 'backdrop', 'title'];

interface Base { id: string; name: string; price: number; rarity: Rarity; minLevel?: number }

export interface TagStyle extends Base {
  /** CSS-Hintergrund der Plakette */
  bg: string;
  /** Rahmenfarbe */
  border: string;
  /** Schriftfarbe */
  text: string;
  /** Leuchten (CSS-Farbe) */
  glow?: string;
  /** Animation: Lichtstreifen, Pulsieren oder funkelnde Sterne */
  fx?: 'shine' | 'pulse' | 'stars';
}

export interface Backdrop extends Base {
  /** CSS-Hintergrund (mehrere Ebenen) hinter dem Avatar */
  bg: string;
  fx?: 'shine' | 'pulse' | 'stars';
}

export interface Title extends Base { text: string }

/**
 * Wie schnell man Gems verdient (Annahme aus den Regeln in scoring.ts/quests.ts):
 * erstes Training +1, Training ≥ 50 P +1, Rekord +3, Glücksfund 25 % +1, Tagesauftrag je +2 (3 am Tag),
 * Streak-Meilensteine 7/30/100/365 Tage. Wer täglich trainiert und die meisten Aufträge schafft: ~7 Gems/Tag.
 */
export const GEM_PACE = 7;

export const TAGS: TagStyle[] = [
  { id: 'tag_plain', name: 'Standard', price: 0, rarity: 'common', bg: 'rgba(255,255,255,0.06)', border: 'rgba(255,255,255,0.12)', text: 'inherit' },
  { id: 'tag_carbon', name: 'Carbon', price: 60, rarity: 'common', bg: 'repeating-linear-gradient(45deg,#1a1a1c 0 4px,#252528 4px 8px)', border: '#3a3a3e', text: '#f3f0ea' },
  { id: 'tag_glut', name: 'Glut', price: 80, rarity: 'common', bg: 'linear-gradient(90deg,#ff6b35,#c2410c)', border: '#ff9a6b', text: '#1a0d06' },
  { id: 'tag_ocean', name: 'Ozean', price: 140, rarity: 'rare', bg: 'linear-gradient(90deg,#0a5f80,#2ec4e6)', border: '#a8f0ff', text: '#04171c', glow: '#2ec4e6' },
  { id: 'tag_toxic', name: 'Toxic', price: 140, rarity: 'rare', bg: 'linear-gradient(90deg,#2f7a12,#8be04e)', border: '#d4ff8a', text: '#0c1a05', glow: '#8be04e' },
  { id: 'tag_camo', name: 'Tarnung', price: 180, rarity: 'rare', minLevel: 6, bg: 'radial-gradient(circle at 20% 30%,#5a6b45 0 18%,transparent 19%),radial-gradient(circle at 70% 60%,#2c3524 0 22%,transparent 23%),radial-gradient(circle at 45% 80%,#7a6a48 0 15%,transparent 16%),#3f4b33', border: '#7a8a5a', text: '#f3f0ea' },
  { id: 'tag_neon', name: 'Neon', price: 320, rarity: 'epic', minLevel: 10, bg: 'linear-gradient(90deg,#24051e,#3a0b55)', border: '#ff4fd8', text: '#ffd6f6', glow: '#ff4fd8', fx: 'pulse' },
  { id: 'tag_holo', name: 'Hologramm', price: 420, rarity: 'epic', minLevel: 15, bg: 'linear-gradient(110deg,#7af9ff,#c9b8ff,#ff9ae6,#fff3a8,#7af9ff)', border: '#ffffff', text: '#14102a', fx: 'shine' },
  { id: 'tag_lava', name: 'Lava', price: 450, rarity: 'epic', minLevel: 18, bg: 'radial-gradient(circle at 30% 120%,#ffd36b 0 20%,transparent 45%),linear-gradient(90deg,#8a0f0f,#ff4d4d,#ff8a3d)', border: '#ffb36b', text: '#220505', glow: '#ff4d4d', fx: 'pulse' },
  { id: 'tag_gold', name: 'Gold', price: 700, rarity: 'legendary', minLevel: 25, bg: 'linear-gradient(100deg,#9a6b07,#f2c94c 40%,#fff3c2 50%,#f2c94c 60%,#9a6b07)', border: '#fff3c2', text: '#241b02', glow: '#f2c94c', fx: 'shine' },
  { id: 'tag_galaxy', name: 'Galaxie', price: 850, rarity: 'legendary', minLevel: 30, bg: 'radial-gradient(circle at 20% 40%,#ff4fd855,transparent 40%),radial-gradient(circle at 80% 60%,#2ec4e655,transparent 40%),linear-gradient(90deg,#0b0820,#1b1145)', border: '#c9b8ff', text: '#ffffff', glow: '#a98bff', fx: 'stars' },
  { id: 'tag_phantom', name: 'Phantom', price: 1500, rarity: 'legendary', minLevel: 45, bg: 'linear-gradient(100deg,#ffffff,#c9b8ff 30%,#ff6b35 60%,#2ec4e6)', border: '#ffffff', text: '#14102a', glow: '#c9b8ff', fx: 'shine' },
];

export const BACKDROPS: Backdrop[] = [
  { id: 'bd_none', name: 'Ohne', price: 0, rarity: 'common', bg: 'transparent' },
  { id: 'bd_gym', name: 'Gym', price: 90, rarity: 'common', bg: 'repeating-linear-gradient(90deg,transparent 0 38px,rgba(255,255,255,0.04) 38px 40px),linear-gradient(180deg,#1f2226 0%,#15171a 70%,#2a2d31 70.5%,#1b1d20 100%)' },
  { id: 'bd_sunset', name: 'Sonnenuntergang', price: 150, rarity: 'rare', bg: 'radial-gradient(circle at 50% 78%,#ffd36b 0 12%,transparent 13%),linear-gradient(180deg,#2a1a4a 0%,#c2410c 60%,#ff8a3d 75%,#3a1d12 75.5%,#1a0d06 100%)' },
  { id: 'bd_forest', name: 'Waldlauf', price: 150, rarity: 'rare', bg: 'linear-gradient(180deg,#0f2a1c 0%,#1d4a2c 55%,#2f6a3a 70%,#3b2a1a 70.5%,#22180f 100%)' },
  { id: 'bd_stadium', name: 'Stadion', price: 280, rarity: 'epic', minLevel: 10, bg: 'radial-gradient(ellipse at 20% 0%,rgba(255,255,255,0.55),transparent 35%),radial-gradient(ellipse at 80% 0%,rgba(255,255,255,0.55),transparent 35%),linear-gradient(180deg,#0b1730 0%,#14244a 60%,#2f7a3a 60.5%,#1f5a2a 100%)', fx: 'pulse' },
  { id: 'bd_city', name: 'Stadt bei Nacht', price: 320, rarity: 'epic', minLevel: 14, bg: 'repeating-linear-gradient(90deg,#14182a 0 18px,#1c2238 18px 30px,#0f1222 30px 44px),linear-gradient(180deg,#0a0c1a 0%,#1a1f3a 100%)', fx: 'stars' },
  { id: 'bd_aurora', name: 'Polarlicht', price: 520, rarity: 'epic', minLevel: 20, bg: 'radial-gradient(ellipse at 30% 20%,rgba(139,224,78,0.55),transparent 45%),radial-gradient(ellipse at 70% 30%,rgba(46,196,230,0.5),transparent 45%),linear-gradient(180deg,#050a18 0%,#0b1a2e 100%)', fx: 'pulse' },
  { id: 'bd_podium', name: 'Siegerpodest', price: 900, rarity: 'legendary', minLevel: 28, bg: 'radial-gradient(ellipse at 50% 0%,rgba(242,201,76,0.7),transparent 55%),linear-gradient(180deg,#1a1405 0%,#2a1f05 72%,#c9a227 72.5%,#7a5a0a 100%)', fx: 'shine' },
  { id: 'bd_space', name: 'Weltall', price: 1100, rarity: 'legendary', minLevel: 35, bg: 'radial-gradient(circle at 75% 25%,#ffb36b 0 6%,transparent 7%),radial-gradient(circle at 20% 70%,#a98bff44,transparent 40%),linear-gradient(180deg,#02020a 0%,#0b0820 100%)', fx: 'stars' },
];

export const TITLES: Title[] = [
  { id: 'ti_none', name: 'Kein Titel', text: '', price: 0, rarity: 'common' },
  { id: 'ti_rookie', name: 'Neuling', text: 'Neuling', price: 20, rarity: 'common' },
  { id: 'ti_early', name: 'Frühaufsteher', text: 'Frühaufsteher', price: 60, rarity: 'common' },
  { id: 'ti_grinder', name: 'Dranbleiber', text: 'Dranbleiber', price: 90, rarity: 'common' },
  { id: 'ti_runner', name: 'Kilometerfresser', text: 'Kilometerfresser', price: 160, rarity: 'rare', minLevel: 8 },
  { id: 'ti_iron', name: 'Eisenfaust', text: 'Eisenfaust', price: 180, rarity: 'rare', minLevel: 10 },
  { id: 'ti_machine', name: 'Maschine', text: 'Maschine', price: 260, rarity: 'rare', minLevel: 15 },
  { id: 'ti_beast', name: 'Biest', text: 'Biest', price: 400, rarity: 'epic', minLevel: 20 },
  { id: 'ti_unstoppable', name: 'Unaufhaltsam', text: 'Unaufhaltsam', price: 480, rarity: 'epic', minLevel: 25 },
  { id: 'ti_legend', name: 'Legende', text: 'Legende', price: 900, rarity: 'legendary', minLevel: 35 },
  { id: 'ti_phantom', name: 'Das Phantom', text: 'Das Phantom', price: 1400, rarity: 'legendary', minLevel: 50 },
];

export const COS_LISTS: Record<CosKind, Base[]> = { tag: TAGS, backdrop: BACKDROPS, title: TITLES };
export const COS_NAMES: Record<CosKind, string> = { tag: 'Namens-Tag', backdrop: 'Hintergrund', title: 'Titel' };
const FREE: Record<CosKind, string> = { tag: 'tag_plain', backdrop: 'bd_none', title: 'ti_none' };

export function cosItem(kind: CosKind, id: string | undefined): Base | undefined {
  return id ? COS_LISTS[kind].find((x) => x.id === id) : undefined;
}
export const tagById = (id?: string) => TAGS.find((t) => t.id === id) ?? TAGS[0];
export const backdropById = (id?: string) => BACKDROPS.find((t) => t.id === id) ?? BACKDROPS[0];
export const titleById = (id?: string) => TITLES.find((t) => t.id === id) ?? TITLES[0];

/** Was ausgerüstet ist (wird per QR übertragen) */
export interface CosLook { tag?: string; backdrop?: string; title?: string }
/** Gespeichert in kv 'cosmetics' */
export interface CosState extends CosLook { owned: string[] }

export const defaultCos = (): CosState => ({ owned: Object.values(FREE) });

export function normalizeCos(c: Partial<CosState> | null | undefined): CosState {
  const all = new Set(COS_KINDS.flatMap((k) => COS_LISTS[k].map((x) => x.id)));
  const owned = Array.from(new Set([...(Array.isArray(c?.owned) ? c!.owned : []), ...Object.values(FREE)])).filter((id) => all.has(id));
  const out: CosState = { owned };
  for (const k of COS_KINDS) {
    const id = c?.[k];
    if (id && owned.includes(id) && cosItem(k, id)) out[k] = id;
  }
  return out;
}

/** Nur das Ausgerüstete, ohne Standardwerte; undefined wenn nichts */
export function cosLookOf(c: CosState): CosLook | undefined {
  const out: CosLook = {};
  for (const k of COS_KINDS) if (c[k]) out[k] = c[k];
  return Object.keys(out).length ? out : undefined;
}

export type CosBuy = { ok: true; state: CosState; gems: number } | { ok: false; reason: string };

export function buyCos(state: CosState, gems: number, kind: CosKind, id: string, level: number): CosBuy {
  const it = cosItem(kind, id);
  if (!it) return { ok: false, reason: 'Gibt es nicht.' };
  if (state.owned.includes(id)) return { ok: false, reason: 'Hast du schon.' };
  if (it.minLevel && level < it.minLevel) return { ok: false, reason: `Erst ab Level ${it.minLevel}.` };
  if (gems < it.price) return { ok: false, reason: `Dir fehlen ${it.price - gems} Gems.` };
  return { ok: true, gems: gems - it.price, state: { ...state, owned: [...state.owned, id], [kind]: id } };
}

export function equipCos(state: CosState, kind: CosKind, id: string | null): CosState {
  if (id === null || id === FREE[kind]) { const s = { ...state }; delete s[kind]; return s; }
  if (!state.owned.includes(id) || !cosItem(kind, id)) return state;
  return { ...state, [kind]: id };
}

/** QR: [tag, backdrop, title] als Index, -1 = Standard */
export function cosToWire(c: CosLook): number[] {
  return COS_KINDS.map((k) => (c[k] ? COS_LISTS[k].findIndex((x) => x.id === c[k]) : -1));
}
export function cosFromWire(w: unknown): CosLook | undefined {
  if (!Array.isArray(w) || !w.every((x) => typeof x === 'number' && Number.isInteger(x))) return undefined;
  const out: CosLook = {};
  COS_KINDS.forEach((k, i) => {
    const it = COS_LISTS[k][w[i] as number];
    if (it && it.id !== FREE[k]) out[k] = it.id;
  });
  return out;
}

/** Ungefähre Tage Training, bis man sich etwas leisten kann (für die Anzeige im Shop) */
export function daysToAfford(price: number, gems: number): number {
  return Math.max(0, Math.ceil((price - gems) / GEM_PACE));
}
