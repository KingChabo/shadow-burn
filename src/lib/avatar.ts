import { APP_DASH } from './brand';
/**
 * Avatar: Körper wächst mit dem Level, Kleidung kauft man im Gem-Shop.
 * Reine Logik ohne React/DB, damit sie testbar bleibt.
 */

export type Slot = 'top' | 'bottom' | 'shoes' | 'head' | 'acc';
/** Nur hinten ergänzen: die Reihenfolge steckt im QR-Code (ältere Apps lesen die ersten 4) */
export const SLOTS: Slot[] = ['top', 'bottom', 'shoes', 'head', 'acc'];
export const SLOT_NAMES: Record<Slot, string> = { top: 'Oberteil', bottom: 'Hose', shoes: 'Schuhe', head: 'Kopf', acc: 'Extras' };

/** Seltenheit: bestimmt Preisbereich und Farbe im Shop */
export type Rarity = 'common' | 'rare' | 'epic' | 'legendary';
export const RARITY: Record<Rarity, { name: string; color: string }> = {
  common: { name: 'Gewöhnlich', color: '#9a958c' },
  rare: { name: 'Selten', color: '#4ea8ff' },
  epic: { name: 'Episch', color: '#b07cff' },
  legendary: { name: 'Legendär', color: '#f2c94c' },
};

export interface ShopItem {
  id: string;
  slot: Slot;
  name: string;
  /** Preis in Gems (0 = von Anfang an da) */
  price: number;
  /** Hauptfarbe und Akzentfarbe für die SVG-Zeichnung */
  color: string;
  accent: string;
  rarity: Rarity;
  /** erst ab diesem Level kaufbar */
  minLevel?: number;
}

/**
 * WICHTIG: Reihenfolge nur hinten ergänzen. Der Index steckt im QR-Code (Spielerkarte),
 * eine Umsortierung würde bei Freunden falsche Kleidung zeigen.
 * Preise (Annahme, siehe src/lib/cosmetics.ts → GEM_PACE): Wer jeden Tag trainiert, verdient
 * etwa 6–8 Gems. Gewöhnlich ≈ 1 Woche, Selten ≈ 2–4 Wochen, Episch ≈ 1–2 Monate, Legendär ≈ 3–4 Monate.
 */
export const ITEMS: ShopItem[] = [
  { id: 'tee_basic', slot: 'top', name: 'Basic-Shirt', price: 0, color: '#8a8780', accent: '#6f6c66', rarity: 'common' },
  { id: 'tank_black', slot: 'top', name: 'Tanktop schwarz', price: 40, color: '#1d1d1f', accent: '#3a3a3d', rarity: 'common' },
  { id: 'hoodie_grey', slot: 'top', name: 'Hoodie grau', price: 90, color: '#5d6066', accent: '#45484d', rarity: 'common' },
  { id: 'jersey_red', slot: 'top', name: 'Trikot rot', price: 160, color: '#c8342b', accent: '#f3f0ea', rarity: 'rare' },
  { id: 'compression_blue', slot: 'top', name: 'Kompressionsshirt', price: 220, color: '#1f4f9a', accent: '#5fa3ff', rarity: 'rare', minLevel: 8 },
  { id: 'shorts_basic', slot: 'bottom', name: 'Sportshorts', price: 0, color: '#26262a', accent: '#3d3d42', rarity: 'common' },
  { id: 'joggers_black', slot: 'bottom', name: 'Jogginghose', price: 70, color: '#18181b', accent: '#ffffff', rarity: 'common' },
  { id: 'shorts_red', slot: 'bottom', name: 'Laufshorts rot', price: 50, color: '#c8342b', accent: '#f3f0ea', rarity: 'common' },
  { id: 'leggings_grey', slot: 'bottom', name: 'Tights grau', price: 80, color: '#4a4c52', accent: '#2f3034', rarity: 'common' },
  { id: 'sneaker_white', slot: 'shoes', name: 'Sneaker weiß', price: 0, color: '#eeeae2', accent: '#b9b4aa', rarity: 'common' },
  { id: 'runner_neon', slot: 'shoes', name: 'Laufschuhe neon', price: 90, color: '#d7f23a', accent: '#1d1d1f', rarity: 'common' },
  { id: 'boots_black', slot: 'shoes', name: 'Trainingsstiefel', price: 150, color: '#141416', accent: '#ff6b35', rarity: 'rare' },
  { id: 'cap_black', slot: 'head', name: 'Cap schwarz', price: 50, color: '#1d1d1f', accent: '#ff6b35', rarity: 'common' },
  { id: 'headband_red', slot: 'head', name: 'Stirnband rot', price: 30, color: '#c8342b', accent: '#f3f0ea', rarity: 'common' },
  { id: 'beanie_grey', slot: 'head', name: 'Mütze grau', price: 60, color: '#6b6e75', accent: '#8d9097', rarity: 'common' },
  // --- Erweiterung 21.11. (nur hinten anhängen!) ---
  { id: 'stringer_black', slot: 'top', name: 'Stringer-Tanktop', price: 120, color: '#151517', accent: '#ff6b35', rarity: 'rare', minLevel: 5 },
  { id: 'track_jacket', slot: 'top', name: 'Trainingsjacke', price: 180, color: '#1c2a4a', accent: '#f3f0ea', rarity: 'rare' },
  { id: 'tee_phantom', slot: 'top', name: `${APP_DASH}-Shirt`, price: 350, color: '#101012', accent: '#ff6b35', rarity: 'epic', minLevel: 12 },
  { id: 'vest_weighted', slot: 'top', name: 'Gewichtsweste', price: 520, color: '#2f3a2a', accent: '#c9b26b', rarity: 'epic', minLevel: 18 },
  { id: 'robe_champion', slot: 'top', name: 'Champions-Mantel', price: 900, color: '#6b0f1a', accent: '#f2c94c', rarity: 'legendary', minLevel: 30 },
  { id: 'track_pants', slot: 'bottom', name: 'Trainingshose', price: 140, color: '#1c2a4a', accent: '#f3f0ea', rarity: 'rare' },
  { id: 'shorts_camo', slot: 'bottom', name: 'Camo-Shorts', price: 130, color: '#4b5a3a', accent: '#2c3524', rarity: 'rare', minLevel: 6 },
  { id: 'shorts_gold', slot: 'bottom', name: 'Boxer-Shorts gold', price: 480, color: '#c9a227', accent: '#101012', rarity: 'epic', minLevel: 20 },
  { id: 'lifters_red', slot: 'shoes', name: 'Gewichtheberschuhe', price: 260, color: '#b3261e', accent: '#f3f0ea', rarity: 'rare', minLevel: 10 },
  { id: 'hightops_black', slot: 'shoes', name: 'High-Tops', price: 200, color: '#18181b', accent: '#e9e4da', rarity: 'rare' },
  { id: 'sneaker_gold', slot: 'shoes', name: 'Goldene Sneaker', price: 800, color: '#e0b43a', accent: '#fff3c2', rarity: 'legendary', minLevel: 25 },
  { id: 'cap_back', slot: 'head', name: 'Cap rückwärts', price: 70, color: '#2a3f8f', accent: '#f3f0ea', rarity: 'common' },
  { id: 'visor_white', slot: 'head', name: 'Sonnenschild', price: 110, color: '#f3f0ea', accent: '#1d1d1f', rarity: 'rare' },
  { id: 'crown_gold', slot: 'head', name: 'Goldkrone', price: 1200, color: '#f2c94c', accent: '#c8342b', rarity: 'legendary', minLevel: 35 },
  { id: 'gloves_black', slot: 'acc', name: 'Trainingshandschuhe', price: 80, color: '#18181b', accent: '#ff6b35', rarity: 'common' },
  { id: 'watch_sport', slot: 'acc', name: 'Sportuhr', price: 120, color: '#18181b', accent: '#4ea8ff', rarity: 'rare' },
  { id: 'headphones', slot: 'acc', name: 'Kopfhörer', price: 190, color: '#f3f0ea', accent: '#1d1d1f', rarity: 'rare', minLevel: 4 },
  { id: 'belt_lifting', slot: 'acc', name: 'Gewichthebergürtel', price: 300, color: '#5a3a22', accent: '#c9b26b', rarity: 'epic', minLevel: 15 },
  { id: 'sunglasses', slot: 'acc', name: 'Sonnenbrille', price: 160, color: '#101012', accent: '#c9a227', rarity: 'rare' },
  { id: 'chain_gold', slot: 'acc', name: 'Goldkette', price: 650, color: '#f2c94c', accent: '#9a6b07', rarity: 'legendary', minLevel: 22 },
];
export const ITEM = Object.fromEntries(ITEMS.map((i) => [i.id, i])) as Record<string, ShopItem>;

/** Hautfarben und Haare: frei wählbar, kosten nichts. Nur hinten ergänzen (QR-Code). */
export const SKINS = ['#f1c9a5', '#e0ac7e', '#c68a5a', '#9a6440', '#6b4428', '#4a2e1b'];
export const HAIRS: { name: string; color: string; style: 'short' | 'buzz' | 'long' | 'bald' }[] = [
  { name: 'Kurz dunkel', color: '#2b211a', style: 'short' },
  { name: 'Kurz blond', color: '#c9a25a', style: 'short' },
  { name: 'Raspel', color: '#1a1512', style: 'buzz' },
  { name: 'Lang braun', color: '#5a3a22', style: 'long' },
  { name: 'Glatze', color: '#000000', style: 'bald' },
  { name: 'Kurz rot', color: '#9c3d1c', style: 'short' },
];

/** Das, was man sieht: wird auch per QR-Code übertragen. */
export interface AvatarLook {
  skin: number;
  hair: number;
  equipped: Partial<Record<Slot, string>>;
}

/** Gespeichert in kv 'avatar' */
export interface AvatarState extends AvatarLook {
  owned: string[];
}

export const STARTER_ITEMS = ITEMS.filter((i) => i.price === 0).map((i) => i.id);
export const defaultAvatar = (): AvatarState => ({
  skin: 1,
  hair: 0,
  owned: [...STARTER_ITEMS],
  equipped: { top: 'tee_basic', bottom: 'shorts_basic', shoes: 'sneaker_white' },
});

/** Ältere oder kaputte Daten reparieren (z. B. neue Startteile nachreichen). */
export function normalizeAvatar(a: Partial<AvatarState> | null | undefined): AvatarState {
  const d = defaultAvatar();
  if (!a) return d;
  const owned = Array.from(new Set([...(Array.isArray(a.owned) ? a.owned : []), ...STARTER_ITEMS])).filter((id) => id in ITEM);
  const equipped: AvatarState['equipped'] = {};
  for (const s of SLOTS) {
    const id = a.equipped?.[s];
    if (id && ITEM[id]?.slot === s && owned.includes(id)) equipped[s] = id;
  }
  return {
    skin: clampIdx(a.skin, SKINS.length, d.skin),
    hair: clampIdx(a.hair, HAIRS.length, d.hair),
    owned,
    equipped: a.equipped ? equipped : d.equipped,
  };
}

function clampIdx(v: unknown, len: number, fallback: number): number {
  return typeof v === 'number' && Number.isInteger(v) && v >= 0 && v < len ? v : fallback;
}

// ---------- Körperstufen ----------

export const BODY_STAGES = 7;
/** Ab welchem Level welche Stufe gilt: s0 sehr mager … s6 sehr muskulös */
export const STAGE_LEVELS = [1, 5, 10, 15, 20, 25, 30];
export const STAGE_NAMES = ['Hänfling', 'Anfänger', 'Fit', 'Athletisch', 'Stark', 'Kraftpaket', 'Phantom'];

export function bodyStage(level: number): number {
  let s = 0;
  for (let i = 0; i < STAGE_LEVELS.length; i++) if (level >= STAGE_LEVELS[i]) s = i;
  return s;
}

/**
 * Stufenlose Stärke 0..1 für die SVG-Figur: wächst innerhalb einer Stufe leicht mit,
 * damit sich jedes Level-Up ein bisschen bemerkbar macht.
 */
export function bodyStrength(level: number): number {
  const lv = Math.max(1, level);
  if (lv >= 30) return 1;
  // Level 1 → 0, Level 30 → 1, leicht verzögerter Anfang
  return Math.min(1, Math.pow((lv - 1) / 29, 0.9));
}

// ---------- Shop ----------

export type BuyResult = { ok: true; state: AvatarState; gems: number } | { ok: false; reason: string };

export function buyItem(state: AvatarState, gems: number, id: string, level = Infinity): BuyResult {
  const item = ITEM[id];
  if (!item) return { ok: false, reason: 'Gibt es nicht.' };
  if (state.owned.includes(id)) return { ok: false, reason: 'Hast du schon.' };
  if (item.minLevel && level < item.minLevel) return { ok: false, reason: `Erst ab Level ${item.minLevel}.` };
  if (gems < item.price) return { ok: false, reason: `Dir fehlen ${item.price - gems} Gems.` };
  // Gekauftes Teil gleich anziehen
  return { ok: true, gems: gems - item.price, state: { ...state, owned: [...state.owned, id], equipped: { ...state.equipped, [item.slot]: id } } };
}

/** Anziehen oder (id = null) ausziehen. Nur gekaufte Teile. */
export function equipItem(state: AvatarState, slot: Slot, id: string | null): AvatarState {
  if (id === null) {
    const e = { ...state.equipped };
    delete e[slot];
    return { ...state, equipped: e };
  }
  if (!state.owned.includes(id) || ITEM[id]?.slot !== slot) return state;
  return { ...state, equipped: { ...state.equipped, [slot]: id } };
}

// ---------- QR-Code ----------

/** Kompakt für den QR-Code: [Haut, Haare, top, bottom, shoes, head] mit Index in ITEMS, -1 = nichts */
export type WireLook = number[];

export function lookToWire(l: AvatarLook): WireLook {
  return [l.skin, l.hair, ...SLOTS.map((s) => (l.equipped[s] ? ITEMS.findIndex((i) => i.id === l.equipped[s]) : -1))];
}

export function lookFromWire(w: unknown): AvatarLook | undefined {
  if (!Array.isArray(w) || w.length < 2 || !w.every((x) => typeof x === 'number' && Number.isInteger(x))) return undefined;
  const equipped: AvatarLook['equipped'] = {};
  SLOTS.forEach((s, k) => {
    const it = ITEMS[w[k + 2] as number];
    if (it && it.slot === s) equipped[s] = it.id;
  });
  return { skin: clampIdx(w[0], SKINS.length, 1), hair: clampIdx(w[1], HAIRS.length, 0), equipped };
}
