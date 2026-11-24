// Zählen mit dem Bewegungssensor des Handys (Beschleunigung inkl. Schwerkraft, "devicemotion").
// Reine Logik ohne DOM → gut testbar. Die Bildschirme dazu: screens/live/MotionLive.tsx.
import type { ActivityId } from '../data/activities';

export interface Vec { x: number; y: number; z: number }
export const G = 9.81;

const len = (v: Vec) => Math.hypot(v.x, v.y, v.z);
const norm = (v: Vec): Vec => { const l = len(v) || 1; return { x: v.x / l, y: v.y / l, z: v.z / l }; };
/** Winkel zwischen zwei Richtungen in Grad */
export function angleDeg(a: Vec, b: Vec): number {
  const na = norm(a), nb = norm(b);
  const d = Math.max(-1, Math.min(1, na.x * nb.x + na.y * nb.y + na.z * nb.z));
  return (Math.acos(d) * 180) / Math.PI;
}
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

export type MotionEvent = { type: 'rep' } | { type: 'invalid'; reason: string } | { type: 'ready' } | null;

export interface MotionState {
  /** Gezählte Sprünge */
  reps: number;
  invalid: number;
  /** Erst still stehen, dann wird die Startlage gemerkt */
  ready: boolean;
  /** Stärke des letzten Stoßes (in g) */
  value: number;
  /** 0..1 für den Balken */
  depth: number;
  hint: string;
}

export interface MotionCounter {
  update(acc: Vec, t: number): { state: MotionState; event: MotionEvent };
  state(): MotionState;
  /** Neu starten (wieder still stehen) */
  recalibrate(): void;
}

/**
 * Wartet, bis das Handy ruhig ist (Gesamtbeschleunigung ≈ 1 g und Richtung ändert sich kaum),
 * und meldet dann die Richtung der Schwerkraft. Erst danach beginnt das Zählen.
 */
function stillness(holdMs: number) {
  let since: number | null = null;
  let ref: Vec | null = null;
  return {
    reset() { since = null; ref = null; },
    /** Richtung der Schwerkraft, sobald das Handy holdMs lang ruhig war, sonst null */
    step(raw: Vec, grav: Vec, t: number): Vec | null {
      const calm = Math.abs(len(raw) - G) < 1.2;
      if (!calm || !ref || angleDeg(ref, grav) > 6) { since = calm ? t : null; ref = calm ? grav : null; return null; }
      if (since !== null && t - since >= holdMs) return grav;
      return null;
    },
  };
}

/** Tiefpass: trennt die Schwerkraft (langsam) vom Zappeln (schnell) */
function lowPass(alpha: number) {
  let g: Vec | null = null;
  return {
    step(v: Vec): Vec { g = g === null ? { ...v } : { x: g.x + alpha * (v.x - g.x), y: g.y + alpha * (v.y - g.y), z: g.z + alpha * (v.z - g.z) }; return g; },
    reset() { g = null; },
  };
}

const CALIB_HINT = 'Still stehen …';

// ---------- Sprung-Zähler: Stoß beim Landen ----------

export interface JumpConfig {
  /** Ab dieser Gesamtbeschleunigung (in g) zählt ein Stoß als Landung */
  peakG: number;
  /** Erst wieder unter diesen Wert, bevor der nächste Stoß zählt */
  resetG: number;
  /** Mindestabstand zwischen zwei Sprüngen (ms) */
  minGapMs: number;
}

export const JUMP: Partial<Record<ActivityId, JumpConfig>> = {
  jumprope: { peakG: 1.5, resetG: 1.15, minGapMs: 220 },
  jacks: { peakG: 1.6, resetG: 1.15, minGapMs: 450 },
  highknees: { peakG: 1.5, resetG: 1.15, minGapMs: 200 },
  buttkicks: { peakG: 1.45, resetG: 1.15, minGapMs: 200 },
  tuckjump: { peakG: 2, resetG: 1.2, minGapMs: 700 },
  skater: { peakG: 1.6, resetG: 1.15, minGapMs: 450 },
};

/**
 * Zählt Landungen: kurzer, starker Ruck über peakG. Erst nach kurzer Ruhe geht es los (Handy anlegen),
 * danach zählt jeder Stoß, der weit genug vom letzten entfernt ist.
 */
export function createJumpCounter(cfg: JumpConfig): MotionCounter {
  const st: MotionState = { reps: 0, invalid: 0, ready: false, value: 0, depth: 0, hint: CALIB_HINT };
  const lp = lowPass(0.15);
  const still = stillness(600);
  let armed = true, lastT = -1e9, peak = 0;
  return {
    state: () => ({ ...st }),
    recalibrate() { still.reset(); lp.reset(); st.ready = false; st.hint = CALIB_HINT; armed = true; },
    update(acc, t) {
      const g = lp.step(acc);
      let event: MotionEvent = null;
      if (!st.ready) {
        if (!still.step(acc, g, t)) return { state: { ...st }, event };
        st.ready = true; event = { type: 'ready' }; st.hint = 'Los!';
        return { state: { ...st }, event };
      }
      const mag = len(acc) / G;
      st.depth = clamp01((mag - 1) / (cfg.peakG - 1));
      if (mag < cfg.resetG) armed = true;
      if (armed && mag > cfg.peakG) {
        armed = false;
        peak = mag;
        if (t - lastT >= cfg.minGapMs) { st.reps++; lastT = t; event = { type: 'rep' }; st.value = peak; }
      }
      st.hint = t - lastT > 3000 ? 'Weiter springen!' : 'Gut so!';
      return { state: { ...st }, event };
    },
  };
}

/** Passender Sprung-Zähler für die Übung, null wenn es keinen gibt */
export function motionCounterFor(id: ActivityId): MotionCounter | null {
  const c = JUMP[id];
  return c ? createJumpCounter(c) : null;
}
