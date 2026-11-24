export type RestGameId = 'laeufer' | 'roehre' | 'flieger' | 'entspannen';
export const FINALE_SEC: number;
export const REST_GAMES: { id: RestGameId; name: string; hint: string }[];
export function createRestGame(
  canvas: HTMLCanvasElement,
  id: RestGameId,
  opts: { getLeft: () => number; total: number; sound?: boolean; vibrate?: (p: number | number[]) => void },
): { destroy(): void; _game?: unknown };
