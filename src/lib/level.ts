/** XP, die man braucht, um von Level n auf Level n+1 zu kommen. */
export function xpForLevel(n: number): number {
  return Math.round(100 * Math.pow(n, 1.5));
}

export interface LevelInfo {
  level: number;
  intoLevel: number; // XP innerhalb des aktuellen Levels
  needed: number; // XP für den nächsten Level
  progress: number; // 0..1
}

export function levelFromXp(xp: number): LevelInfo {
  let level = 1;
  let rest = Math.max(0, Math.floor(xp));
  while (rest >= xpForLevel(level)) {
    rest -= xpForLevel(level);
    level++;
  }
  const needed = xpForLevel(level);
  return { level, intoLevel: rest, needed, progress: rest / needed };
}
