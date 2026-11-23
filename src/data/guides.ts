import type { ActivityId } from './activities';
import raw from './guides.json';

/**
 * Vorgerenderte Vorlagen-Videos (Blender, realistischer Mensch): public/guides/<set>.mp4 + .jpg.
 * Erzeugt mit blender/shadowburn_render.py und blender/assemble.py.
 */
export interface GuideMeta {
  fps: number;
  /** pro Videobild: [Ellbogen°, Hüfte°, Ellbogen x,y, Hüfte x,y, Kopf x,y, Brust x,y] (x,y in 0..1) */
  f: number[][];
}

const META = raw as Record<string, GuideMeta>;

/** Welche Aufnahme zu welcher Übung gehört und wie schnell sie läuft */
const SET: Partial<Record<ActivityId, { set: string; rate: number }>> = {
  jog: { set: 'run', rate: 1 },
  walk: { set: 'run', rate: 0.57 },
  sprint: { set: 'run', rate: 1.6 },
};

export function guideOf(id: ActivityId) {
  const s = SET[id] ?? { set: id, rate: 1 };
  const base = import.meta.env.BASE_URL;
  return {
    ...s,
    video: `${base}guides/${s.set}.mp4`,
    poster: `${base}guides/${s.set}.jpg`,
    meta: META[s.set] as GuideMeta | undefined,
    /** Gibt es für diese Übung schon ein gerendertes Video? (guides.json kommt aus blender/assemble.py) */
    has: s.set in META,
  };
}
