/**
 * Level-Themes: Alle 5 Level wird ein neues Design freigeschaltet.
 * Beim Erreichen wird es automatisch aktiv. Per langem Druck aufs Level-Symbol
 * kann man aus allen freigeschalteten Themes ein älteres wählen.
 */

export interface Theme {
  id: string;
  /** ab diesem Level freigeschaltet */
  level: number;
  name: string;
  /** Akzentfarbe der ganzen App (Knöpfe, Fortschritt, Zahlen) */
  accent: string;
  /** Schriftfarbe auf Akzent-Flächen */
  onAccent: string;
  /** Verlauf des Level-Abzeichens (2–3 Farben) */
  gradient: string[];
  /** Leuchten um das Abzeichen */
  glow: string;
  /** Form des Abzeichens */
  shape: 'circle' | 'hex' | 'shield' | 'star' | 'diamond' | 'crown' | 'flame' | 'wings';
  /** Animation: none, pulse (leuchtet), shine (Lichtstreifen), spin (Ring dreht), aura (Partikel) */
  fx: 'none' | 'pulse' | 'shine' | 'spin' | 'aura';
}

/** Annahme: 11 Themes bis Level 50, danach bleibt das letzte. Reihenfolge = Level aufsteigend. */
export const THEMES: Theme[] = [
  { id: 'glut', level: 1, name: 'Glut', accent: '#FF6B35', onAccent: '#1a0d06', gradient: ['#FF6B35', '#c2410c'], glow: '#FF6B35', shape: 'circle', fx: 'none' },
  { id: 'stahl', level: 5, name: 'Stahl', accent: '#8FB3D9', onAccent: '#0b1420', gradient: ['#dbe7f3', '#8FB3D9', '#4a6a8c'], glow: '#8FB3D9', shape: 'hex', fx: 'pulse' },
  { id: 'toxic', level: 10, name: 'Toxic', accent: '#8BE04E', onAccent: '#0c1a05', gradient: ['#d4ff8a', '#8BE04E', '#2f7a12'], glow: '#8BE04E', shape: 'shield', fx: 'pulse' },
  { id: 'ozean', level: 15, name: 'Ozean', accent: '#2EC4E6', onAccent: '#04171c', gradient: ['#a8f0ff', '#2EC4E6', '#0a5f80'], glow: '#2EC4E6', shape: 'diamond', fx: 'shine' },
  { id: 'amethyst', level: 20, name: 'Amethyst', accent: '#A98BFF', onAccent: '#140c2a', gradient: ['#e2d6ff', '#A98BFF', '#5b3bc4'], glow: '#A98BFF', shape: 'star', fx: 'shine' },
  { id: 'inferno', level: 25, name: 'Inferno', accent: '#FF4D4D', onAccent: '#220505', gradient: ['#ffd36b', '#FF4D4D', '#8a0f0f'], glow: '#FF4D4D', shape: 'flame', fx: 'aura' },
  { id: 'gold', level: 30, name: 'Gold', accent: '#F2C94C', onAccent: '#241b02', gradient: ['#fff3c2', '#F2C94C', '#9a6b07'], glow: '#F2C94C', shape: 'crown', fx: 'shine' },
  { id: 'neonnacht', level: 35, name: 'Neon-Nacht', accent: '#FF4FD8', onAccent: '#24051e', gradient: ['#7af9ff', '#FF4FD8', '#6b16c9'], glow: '#FF4FD8', shape: 'hex', fx: 'spin' },
  { id: 'eis', level: 40, name: 'Eiskönig', accent: '#BDEBFF', onAccent: '#06202b', gradient: ['#ffffff', '#BDEBFF', '#4fa8d1'], glow: '#BDEBFF', shape: 'diamond', fx: 'spin' },
  { id: 'obsidian', level: 45, name: 'Obsidian', accent: '#FF8A3D', onAccent: '#1a0d06', gradient: ['#ff8a3d', '#3a2a40', '#0a0a0f'], glow: '#ff8a3d', shape: 'shield', fx: 'aura' },
  { id: 'phantom', level: 50, name: 'Phantom', accent: '#E9E4FF', onAccent: '#14102a', gradient: ['#ffffff', '#c9b8ff', '#ff6b35', '#2ec4e6'], glow: '#c9b8ff', shape: 'wings', fx: 'aura' },
];
export const THEME = Object.fromEntries(THEMES.map((t) => [t.id, t])) as Record<string, Theme>;

/** Gespeichert in kv 'theme'. `tier` = Anzahl freigeschalteter Themes, als gewählt wurde. */
export interface ThemeChoice { id: string; tier: number }

export function unlockedThemes(level: number): Theme[] {
  return THEMES.filter((t) => level >= t.level);
}

export function nextTheme(level: number): Theme | undefined {
  return THEMES.find((t) => t.level > level);
}

/**
 * Welches Theme gilt gerade?
 * - Nichts gewählt → das neueste freigeschaltete.
 * - Gewählt, und seitdem kam ein neues dazu → das neue wird automatisch aktiv.
 * - Sonst die Wahl (falls noch freigeschaltet, z. B. nach Backup-Import mit weniger XP).
 */
export function activeTheme(level: number, choice: ThemeChoice | null | undefined): Theme {
  const unlocked = unlockedThemes(level);
  const newest = unlocked[unlocked.length - 1] ?? THEMES[0];
  if (!choice) return newest;
  if (unlocked.length > choice.tier) return newest;
  return unlocked.find((t) => t.id === choice.id) ?? newest;
}

export function chooseTheme(level: number, id: string): ThemeChoice | null {
  const unlocked = unlockedThemes(level);
  if (!unlocked.some((t) => t.id === id)) return null;
  return { id, tier: unlocked.length };
}

/** "#RRGGBB" → "R G B" für CSS-Variablen (Tailwind-Alpha wie bg-neon/20 funktioniert weiter) */
export function hexToRgbTriplet(hex: string): string {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
  return `${(n >> 16) & 255} ${(n >> 8) & 255} ${n & 255}`;
}
