// Zählen mit dem Bewegungssensor des Handys (Beschleunigung inkl. Schwerkraft, "devicemotion").
// Reine Logik ohne DOM → gut testbar. Die Bildschirme dazu: screens/live/MotionLive.tsx.
import type { ActivityId } from '../data/activities';
import { repMachine } from './pose/counters';

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
  /** Wiederholungen bzw. (bei Halte-Übungen) gehaltene Sekunden */
  reps: number;
  invalid: number;
  /** Erst still stehen, dann wird die Startlage gemerkt */
  ready: boolean;
  /** Neigung des Oberschenkels gegenüber dem Stehen (Grad) bzw. Stärke des letzten Stoßes (in g) */
  value: number;
  /** 0..1 für den Balken */
  depth: number;
  hint: string;
}

export interface MotionCounter {
  update(acc: Vec, t: number): { state: MotionState; event: MotionEvent };
  state(): MotionState;
  /** Startlage neu bestimmen (wieder still stehen) */
  recalibrate(): void;
}

/**
 * Wartet, bis das Handy ruhig ist (Gesamtbeschleunigung ≈ 1 g und Richtung ändert sich kaum),
 * und meldet dann die Richtung der Schwerkraft. So wird die Lage in der Hosentasche beim Stehen gemerkt.
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

// ---------- Hosentasche: Oberschenkel-Neigung ----------

export interface PocketConfig {
  /** Ab dieser Neigung (Grad) zählt die Wdh. als tief genug */
  downDeg: number;
  /** Bis hierhin zurück = wieder oben */
  upDeg: number;
  /** So weit runter und wieder hoch, ohne downDeg zu erreichen = "Tiefer runter!" */
  partialDeg: number;
}

/** Kniebeuge & Co.: Oberschenkel waagerecht ≈ 80–90°. 60° ist etwas über "parallel", auch mit lockerer Tasche. */
export const POCKET_REPS: Partial<Record<ActivityId, PocketConfig>> = {
  squat: { downDeg: 60, upDeg: 20, partialDeg: 35 },
  jumpsquat: { downDeg: 60, upDeg: 20, partialDeg: 35 },
  splitsquat: { downDeg: 60, upDeg: 20, partialDeg: 35 },
  lunge: { downDeg: 60, upDeg: 20, partialDeg: 35 },
  stepup: { downDeg: 45, upDeg: 15, partialDeg: 28 },
};
/** Halte-Übungen: Uhr läuft nur bei waagerechtem Oberschenkel */
export const POCKET_HOLD: Partial<Record<ActivityId, { minDeg: number; maxDeg: number }>> = {
  wallsit: { minDeg: 65, maxDeg: 120 },
};

const CALIB_HINT = 'Still stehen …';

/**
 * Wiederholungen über die Neigung des Oberschenkels. Das Handy steckt in der Hosentasche und dreht sich mit dem Bein.
 * Gemessen wird der Winkel zwischen der Schwerkraft jetzt und im Stehen. Dadurch ist egal, wie herum das Handy steckt.
 */
export function createPocketCounter(cfg: PocketConfig): MotionCounter {
  const st: MotionState = { reps: 0, invalid: 0, ready: false, value: 0, depth: 0, hint: CALIB_HINT };
  const lp = lowPass(0.15);
  const still = stillness(800);
  let base: Vec | null = null;
  const m = repMachine(1, cfg.upDeg / cfg.downDeg, cfg.partialDeg / cfg.downDeg);
  return {
    state: () => ({ ...st }),
    recalibrate() { base = null; still.reset(); lp.reset(); m.reset(); st.ready = false; st.hint = CALIB_HINT; st.value = 0; st.depth = 0; },
    update(acc, t) {
      const g = lp.step(acc);
      let event: MotionEvent = null;
      if (!base) {
        const b = still.step(acc, g, t);
        if (!b) return { state: { ...st }, event };
        base = { ...b }; st.ready = true; m.reset(); event = { type: 'ready' };
      }
      const tilt = angleDeg(g, base);
      st.value = tilt;
      const d = tilt / cfg.downDeg;
      st.depth = clamp01(d);
      const r = m.step(d);
      if (r === 'rep') { st.reps++; event = { type: 'rep' }; }
      else if (r === 'partial') { st.invalid++; event = { type: 'invalid', reason: 'Tiefer runter!' }; }
      // Oben und ruhig: Startlage langsam nachführen (Handy rutscht in der Tasche)
      if (m.phase === 'up' && tilt < cfg.upDeg * 0.6 && Math.abs(len(acc) - G) < 0.8) {
        base = norm({ x: base.x * 0.98 + norm(g).x * 0.02, y: base.y * 0.98 + norm(g).y * 0.02, z: base.z * 0.98 + norm(g).z * 0.02 });
      }
      st.hint = m.phase === 'none' ? 'Gerade hinstellen' : m.phase === 'down' ? 'Hoch!' : d > cfg.partialDeg / cfg.downDeg ? 'Tiefer!' : 'Runter!';
      return { state: { ...st }, event };
    },
  };
}

/** Halten (Wandsitzen): Sekunden, solange der Oberschenkel waagerecht ist. "reps" = gehaltene Sekunden. */
export function createPocketHoldCounter(cfg: { minDeg: number; maxDeg: number }): MotionCounter {
  const st: MotionState = { reps: 0, invalid: 0, ready: false, value: 0, depth: 0, hint: CALIB_HINT };
  const lp = lowPass(0.15);
  const still = stillness(800);
  let base: Vec | null = null;
  let held = 0, last: number | null = null, started = false, badSince: number | null = null;
  return {
    state: () => ({ ...st }),
    recalibrate() { base = null; still.reset(); lp.reset(); st.ready = false; st.hint = CALIB_HINT; last = null; started = false; badSince = null; },
    update(acc, t) {
      const g = lp.step(acc);
      const dt = last === null ? 0 : Math.min(0.5, (t - last) / 1000);
      last = t;
      let event: MotionEvent = null;
      if (!base) {
        const b = still.step(acc, g, t);
        if (!b) return { state: { ...st }, event };
        base = { ...b }; st.ready = true; event = { type: 'ready' };
      }
      const tilt = angleDeg(g, base);
      st.value = tilt;
      st.depth = clamp01(tilt / 90);
      if (tilt >= cfg.minDeg && tilt <= cfg.maxDeg) {
        started = true; held += dt; badSince = null;
        const sec = Math.floor(held + 1e-6);
        if (sec > st.reps) { st.reps = sec; if (sec % 15 === 0) event = { type: 'rep' }; }
        st.hint = 'Halten!';
      } else if (!started || tilt < 25) {
        badSince = null;
        st.hint = started ? 'Wieder runter in die Sitzposition' : 'Runter, bis die Oberschenkel waagerecht sind';
      } else {
        if (badSince === null) badSince = t;
        st.hint = tilt < cfg.minDeg ? 'Tiefer, Oberschenkel waagerecht!' : 'Nicht so tief';
        if (t - badSince > 1500 && badSince !== -1) { st.invalid++; event = { type: 'invalid', reason: 'Oberschenkel waagerecht!' }; badSince = -1; }
      }
      return { state: { ...st }, event };
    },
  };
}

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
 * Zählt Landungen: kurzer, starker Ruck über peakG. Erst nach kurzer Ruhe geht es los (Handy einstecken),
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

/** Passender Zähler für Übung und Modus, null wenn es keinen gibt */
export function motionCounterFor(id: ActivityId, mode: 'pocket' | 'jump'): MotionCounter | null {
  if (mode === 'jump') { const c = JUMP[id]; return c ? createJumpCounter(c) : null; }
  const h = POCKET_HOLD[id];
  if (h) return createPocketHoldCounter(h);
  const r = POCKET_REPS[id];
  return r ? createPocketCounter(r) : null;
}
