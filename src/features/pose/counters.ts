// Reine Zähl-Logik für Kamera-Reps. Keine Abhängigkeit zu TF/DOM → gut testbar.

export interface Keypoint { x: number; y: number; score: number }
// MoveNet-Reihenfolge
export const KP = {
  nose: 0, lEye: 1, rEye: 2, lEar: 3, rEar: 4,
  lShoulder: 5, rShoulder: 6, lElbow: 7, rElbow: 8, lWrist: 9, rWrist: 10,
  lHip: 11, rHip: 12, lKnee: 13, rKnee: 14, lAnkle: 15, rAnkle: 16,
} as const;

export const SKELETON: [number, number][] = [
  [5, 6], [5, 7], [7, 9], [6, 8], [8, 10], [5, 11], [6, 12], [11, 12],
  [11, 13], [13, 15], [12, 14], [14, 16], [0, 5], [0, 6],
];

/** Ab dieser Sicherheit gilt ein Punkt als erkannt. Etwas lockerer als früher, damit
 * auch schlecht beleuchtete oder liegende Körper noch erkannt werden. */
export const MIN_SCORE = 0.25;

/** Winkel bei b (in Grad) zwischen a-b-c */
export function angle(a: Keypoint, b: Keypoint, c: Keypoint): number {
  const v1x = a.x - b.x, v1y = a.y - b.y, v2x = c.x - b.x, v2y = c.y - b.y;
  const dot = v1x * v2x + v1y * v2y;
  const n = Math.hypot(v1x, v1y) * Math.hypot(v2x, v2y);
  if (n === 0) return 180;
  return (Math.acos(Math.max(-1, Math.min(1, dot / n))) * 180) / Math.PI;
}

interface Side { shoulder: Keypoint; elbow: Keypoint; wrist: Keypoint; hip: Keypoint; knee: Keypoint; ankle: Keypoint; conf: number }
type Joint = 'shoulder' | 'elbow' | 'wrist' | 'hip' | 'knee' | 'ankle';
const JOINTS: Joint[] = ['shoulder', 'elbow', 'wrist', 'hip', 'knee', 'ankle'];
const L_IDX = [5, 7, 9, 11, 13, 15], R_IDX = [6, 8, 10, 12, 14, 16];

function sideOf(k: Keypoint[], idx: number[]): Side {
  const [shoulder, elbow, wrist, hip, knee, ankle] = idx.map((i) => k[i]);
  return { shoulder, elbow, wrist, hip, knee, ankle, conf: Math.min(shoulder.score, elbow.score, wrist.score, hip.score, knee.score, ankle.score) };
}

/** Die Körperseite, die der Kamera zugewandt ist (höhere Sicherheit). */
export function bestSide(k: Keypoint[]): Side {
  const sum = (idx: number[]) => idx.reduce((s, i) => s + k[i].score, 0);
  return sideOf(k, sum(L_IDX) >= sum(R_IDX) ? L_IDX : R_IDX);
}

/**
 * Die Seite, auf der alle genannten Gelenke erkannt sind (bei beiden: die sicherere).
 * null, wenn keine Seite sie alle hat. So reicht z. B. für Liegestütze der Arm,
 * auch wenn die Beine gar nicht im Bild sind.
 */
export function pickSide(k: Keypoint[], need: Joint[]): Side | null {
  const pos = need.map((j) => JOINTS.indexOf(j));
  const score = (idx: number[]) => (pos.every((p) => k[idx[p]].score >= MIN_SCORE) ? pos.reduce((s, p) => s + k[idx[p]].score, 0) : -1);
  const l = score(L_IDX), r = score(R_IDX);
  if (l < 0 && r < 0) return null;
  return sideOf(k, l >= r ? L_IDX : R_IDX);
}

const vis = (p: Keypoint | undefined) => !!p && p.score >= MIN_SCORE;
/** Mittlere Höhe der erkannten Punkte (oder null) */
function meanY(k: Keypoint[], idx: number[]): number | null {
  const ps = idx.map((i) => k[i]).filter(vis);
  return ps.length ? ps.reduce((s, p) => s + p.y, 0) / ps.length : null;
}
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

export type RepEvent = { type: 'rep' } | { type: 'invalid'; reason: string } | null;

export interface CounterState {
  reps: number;
  invalid: number;
  phase: 'up' | 'down' | 'none';
  /** geglätteter Hauptwinkel */
  angle: number | null;
  visible: boolean;
  hint: string;
  /** 0..1, wie weit die aktuelle Bewegung ist (für den Fortschrittsbalken) */
  depth: number;
  /** Womit gerade gemessen wird (nur Anzeige), z. B. "Arm" oder "Oberkörper" */
  source?: string;
}

export interface RepCounter {
  update(k: Keypoint[]): { state: CounterState; event: RepEvent };
  state(): CounterState;
}

const ema = (prev: number | null, v: number, a = 0.5) => (prev === null ? v : prev + a * (v - prev));
const ok = (...p: Keypoint[]) => p.every((q) => q.score >= MIN_SCORE);

/**
 * Wiederholungs-Automat auf einer "Tiefe" von 0 (oben/Start) bis 1 (ganz unten).
 * Wdh. = oben → mindestens `down` tief → wieder oben (≤ `up`).
 * Wer nur bis `partial` runterkommt und wieder hochgeht, macht eine halbe Wdh.
 */
function repMachine(down = 0.7, up = 0.2, partial = 0.35) {
  let phase: 'none' | 'up' | 'down' = 'none';
  let deepest = 0;
  return {
    get phase() { return phase; },
    reset() { phase = 'none'; deepest = 0; },
    /** 'rep' = ganze Wdh. fertig, 'partial' = nur halb runter, null = nichts */
    step(depth: number): 'rep' | 'partial' | null {
      if (phase === 'none') { if (depth <= up) phase = 'up'; return null; }
      deepest = Math.max(deepest, depth);
      if (phase === 'up' && depth >= down) phase = 'down';
      if (depth <= up) {
        const was = phase, d = deepest;
        phase = 'up'; deepest = 0;
        if (was === 'down') return 'rep';
        if (d >= partial) return 'partial';
      }
      return null;
    },
  };
}

/** Langsam vergessendes Maximum (z. B. Armlänge oben), passt sich an, wenn man näher/weiter weg geht */
function decayMax() {
  let m = 0;
  return { push(v: number) { m = Math.max(v, m * 0.997); return m; }, get value() { return m; }, reset() { m = 0; } };
}

function lostState(st: CounterState, lost: number, hint: string) {
  if (lost > 5) { st.visible = false; st.hint = hint; }
  return { state: { ...st }, event: null as RepEvent };
}

/**
 * Liegestütz. Braucht NICHT mehr den ganzen Körper:
 *  - Seitlich mit Arm im Bild: Ellbogenwinkel (unten < ~110°, oben > ~150°).
 *  - Sonst (z. B. Handy vorn am Kopf): Höhe der Schultern über den Händen,
 *    bezogen auf die Höhe in der oberen Position.
 * Beide Messungen laufen parallel, es zählt die tiefere.
 * Sind Hüfte und Bein auch im Bild, wird zusätzlich die Körperlinie geprüft.
 */
export function createPushupCounter(): RepCounter {
  const HINT = 'Oberkörper und Arme ins Bild';
  const st: CounterState = { reps: 0, invalid: 0, phase: 'none', angle: null, visible: false, hint: HINT, depth: 0 };
  const m = repMachine(0.7, 0.2, 0.4);
  const top = decayMax();
  let depth: number | null = null;
  let worstLine = 180;
  let lost = 0;

  return {
    state: () => ({ ...st }),
    update(k) {
      const arm = pickSide(k, ['shoulder', 'elbow', 'wrist']);
      const shY = meanY(k, [KP.lShoulder, KP.rShoulder]);
      const wrY = meanY(k, [KP.lWrist, KP.rWrist]);
      const hasHeight = shY !== null && wrY !== null;
      if (!arm && !hasHeight) return lostState(st, ++lost, HINT);
      lost = 0;
      st.visible = true;

      // Steht die Person (Rumpf senkrecht)? Dann ist das kein Liegestütz, z. B. Bizeps-Curls.
      const torso = pickSide(k, ['shoulder', 'hip']);
      if (torso) {
        const dy = torso.hip.y - torso.shoulder.y, dx = Math.abs(torso.hip.x - torso.shoulder.x);
        if (dy > 0 && dy > dx * 1.3) {
          m.reset(); depth = null; st.phase = 'none'; st.depth = 0;
          st.hint = 'In die Liegestütz-Position gehen';
          return { state: { ...st }, event: null };
        }
      }

      let dArm = -1, dHeight = -1;
      if (arm) {
        const a = angle(arm.shoulder, arm.elbow, arm.wrist);
        st.angle = ema(st.angle, a);
        dArm = clamp01((158 - st.angle) / 70);
      } else st.angle = null;
      if (hasHeight) {
        const h = wrY! - shY!; // Hände liegen unter den Schultern → positiv
        const ref = top.push(Math.max(0, h));
        if (ref > 12) dHeight = clamp01((1 - Math.max(0, h) / ref) / 0.55);
      }
      if (dArm < 0 && dHeight < 0) { st.hint = 'Oben in Position gehen'; return { state: { ...st }, event: null }; }
      depth = ema(depth, Math.max(dArm, dHeight), 0.6);
      st.depth = depth;
      st.source = dArm >= dHeight ? 'Arm' : 'Schulterhöhe';

      // Körperlinie nur, wenn Hüfte und Bein (Knöchel oder Knie) zu sehen sind
      const legs = pickSide(k, ['shoulder', 'hip', 'knee']);
      let line: number | null = null;
      if (legs) line = angle(legs.shoulder, legs.hip, vis(legs.ankle) ? legs.ankle : legs.knee);
      if (line !== null && depth > 0.25) worstLine = Math.min(worstLine, line);

      let event: RepEvent = null;
      const r = m.step(depth);
      if (r === 'rep') {
        if (worstLine < 140) { st.invalid++; event = { type: 'invalid', reason: 'Körper gerade halten!' }; }
        else { st.reps++; event = { type: 'rep' }; }
      } else if (r === 'partial') { st.invalid++; event = { type: 'invalid', reason: 'Tiefer runter!' }; }
      if (r) worstLine = 180;
      st.phase = m.phase;

      st.hint = m.phase === 'none' ? 'Arme strecken, oben starten'
        : line !== null && line < 140 ? 'Hüfte gerade – Körper als Linie!'
          : m.phase === 'down' ? 'Hoch drücken!' : 'Runter, Brust zum Boden';
      return { state: { ...st }, event };
    },
  };
}

/**
 * Sit-up (Seitenansicht). Hüftwinkel Schulter-Hüfte-Knie:
 * liegend > 115°, oben < 70°. Ungültig: nur halb hoch (Minimum zwischen 70° und 100°).
 */
export function createSitupCounter(): RepCounter {
  const st: CounterState = { reps: 0, invalid: 0, phase: 'none', angle: null, visible: false, hint: 'Kopf, Hüfte und Knie seitlich ins Bild', depth: 0 };
  let minAngle = 180;
  let rising = false;
  let lostFrames = 0;

  return {
    state: () => ({ ...st }),
    update(k) {
      const s = pickSide(k, ['shoulder', 'hip', 'knee']) ?? bestSide(k);
      if (!ok(s.shoulder, s.hip, s.knee)) {
        lostFrames++;
        if (lostFrames > 5) { st.visible = false; st.hint = 'Kopf, Hüfte und Knie seitlich ins Bild'; }
        return { state: { ...st }, event: null };
      }
      lostFrames = 0;
      st.visible = true;
      st.angle = ema(st.angle, angle(s.shoulder, s.hip, s.knee));
      const a = st.angle;
      st.depth = Math.max(0, Math.min(1, (125 - a) / 60));
      let event: RepEvent = null;

      if (st.phase === 'none') {
        if (a > 115) st.phase = 'down';
        st.hint = 'Hinlegen, Knie anwinkeln';
        return { state: { ...st }, event };
      }
      if (st.phase === 'down') {
        if (a < 105) rising = true;
        if (rising) minAngle = Math.min(minAngle, a);
        if (a < 70) {
          st.phase = 'up'; st.reps++; event = { type: 'rep' };
          rising = false; minAngle = 180;
        } else if (rising && a > 115) {
          if (minAngle < 100) { st.invalid++; event = { type: 'invalid', reason: 'Höher hochkommen!' }; }
          rising = false; minAngle = 180;
        }
      } else if (st.phase === 'up' && a > 115) {
        st.phase = 'down';
      }
      st.hint = st.phase === 'up' ? 'Ganz ablegen' : rising ? 'Weiter hoch!' : 'Hochkommen!';
      return { state: { ...st }, event };
    },
  };
}

/**
 * Sit-up per Neigungssensor (Handy auf der Brust).
 * beta ≈ 0° liegend, > 55° aufgerichtet. Hysterese: zurück unter 20°.
 */
export function createTiltCounter() {
  let up = false;
  let reps = 0;
  let base: number | null = null;
  return {
    update(beta: number): boolean {
      if (base === null) base = beta;
      const t = Math.abs(beta - base);
      if (!up && t > 55) { up = true; reps++; return true; }
      if (up && t < 20) up = false;
      return false;
    },
    get reps() { return reps; },
    /** aktueller Neigungswinkel relativ zur Startlage */
    tiltOf(beta: number) { return base === null ? 0 : Math.abs(beta - base); },
    reset() { base = null; up = false; },
  };
}

/**
 * Kniebeuge. Je nachdem, was im Bild ist:
 *  - Hüfte, Knie, Knöchel: Kniewinkel (unten < ~112°, oben > ~150°).
 *  - Ohne Füße: wie waagerecht der Oberschenkel ist (Knie-Hüfte-Höhe im Vergleich zum Stehen).
 *  - Nur Oberkörper bis Hüfte: wie weit die Hüfte absinkt, bezogen auf die Rumpflänge.
 * "Tiefer runter!" gibt es nur bei den ersten beiden Messarten (sonst zu unsicher).
 */
export function createSquatCounter(): RepCounter {
  const HINT = 'Mindestens Oberkörper bis Hüfte ins Bild';
  const st: CounterState = { reps: 0, invalid: 0, phase: 'none', angle: null, visible: false, hint: HINT, depth: 0 };
  const m = repMachine(0.7, 0.2, 0.35);
  const thighTop = decayMax();
  let hipTop: number | null = null;
  let torsoRef = 0;
  let depth: number | null = null;
  let lost = 0;
  let strict = false;

  return {
    state: () => ({ ...st }),
    update(k) {
      const full = pickSide(k, ['hip', 'knee', 'ankle']);
      const thigh = full ?? pickSide(k, ['hip', 'knee']);
      const torso = pickSide(k, ['shoulder', 'hip']);
      if (!thigh && !torso) return lostState(st, ++lost, HINT);
      lost = 0;
      st.visible = true;

      // Aufrecht? Schulter über der Hüfte (Vorlehnen bis ~60° ist ok), Hüfte über dem Knie
      const s = torso ?? thigh!;
      const dy = s.hip.y - s.shoulder.y, dx = Math.abs(s.hip.x - s.shoulder.x);
      const upright = (!torso || (dy > 0 && dy > dx * 0.55)) && (!thigh || thigh.hip.y < thigh.knee.y + Math.abs(thigh.knee.x - thigh.hip.x));
      if (!upright) {
        m.reset(); depth = null; st.phase = 'none'; st.depth = 0;
        st.hint = 'Aufrecht hinstellen';
        return { state: { ...st }, event: null };
      }
      if (torso && dy > 0) torsoRef = Math.max(Math.hypot(dx, dy), torsoRef * 0.997);

      let d: number;
      if (full) {
        st.angle = ema(st.angle, angle(full.hip, full.knee, full.ankle));
        d = clamp01((165 - st.angle) / 75);
        st.source = 'Knie';
      } else if (thigh) {
        st.angle = null;
        const h = Math.max(0, thigh.knee.y - thigh.hip.y);
        const ref = thighTop.push(h);
        d = ref > 10 ? clamp01((1 - h / ref) / 0.8) : 0;
        st.source = 'Oberschenkel';
      } else {
        st.angle = null;
        const hipY = meanY(k, [KP.lHip, KP.rHip])!;
        hipTop = hipTop === null ? hipY : Math.min(hipY, hipTop + torsoRef * 0.003);
        d = torsoRef > 10 ? clamp01((hipY - hipTop) / (0.6 * torsoRef)) : 0;
        st.source = 'Hüfte';
      }
      strict = !!thigh;
      if (thigh) hipTop = null;
      depth = ema(depth, d, 0.6);
      st.depth = depth;

      let event: RepEvent = null;
      const r = m.step(depth);
      if (r === 'rep') { st.reps++; event = { type: 'rep' }; }
      else if (r === 'partial' && strict) { st.invalid++; event = { type: 'invalid', reason: 'Tiefer runter!' }; }
      st.phase = m.phase;
      st.hint = m.phase === 'none' ? 'Gerade hinstellen' : m.phase === 'down' ? 'Hochdrücken!' : depth > 0.3 ? 'Tiefer!' : 'Runter, Po nach hinten';
      return { state: { ...st }, event };
    },
  };
}

/**
 * Hampelmann (von vorn). Offen: Hände über dem Kopf und Füße weit auseinander.
 * Zu: Hände unten und Füße zusammen. Eine Wdh. = zu → offen → zu.
 * Ungültig: Arme hoch, aber Beine nicht gespreizt.
 * Sind die Füße nicht im Bild, werden die Knie genommen; sind die Beine gar nicht
 * im Bild, zählen nur die Arme.
 */
export function createJacksCounter(): RepCounter {
  const HINT = 'Von vorn, Oberkörper und Arme ins Bild';
  const st: CounterState = { reps: 0, invalid: 0, phase: 'none', angle: null, visible: false, hint: HINT, depth: 0 };
  let lost = 0;
  let armsUp = false, legsWide = false;

  return {
    state: () => ({ ...st }),
    update(k) {
      const ls = k[KP.lShoulder], rs = k[KP.rShoulder], lw = k[KP.lWrist], rw = k[KP.rWrist];
      const lh = k[KP.lHip], rh = k[KP.rHip];
      if (!ok(ls, rs, lw, rw)) return lostState(st, ++lost, HINT);
      lost = 0;
      st.visible = true;
      const shoulderW = Math.max(1, Math.abs(ls.x - rs.x));
      const shoulderY = (ls.y + rs.y) / 2, noseY = vis(k[KP.nose]) ? k[KP.nose].y : shoulderY - shoulderW * 0.6;
      const hipW = ok(lh, rh) ? Math.max(1, Math.abs(lh.x - rh.x)) : shoulderW * 0.7;
      // Beine: Füße, sonst Knie (die gehen weniger weit auseinander), sonst gar nicht
      let feet: number | null = null, wideAt = 1.6, closeAt = 1.3;
      if (ok(k[KP.lAnkle], k[KP.rAnkle])) feet = Math.abs(k[KP.lAnkle].x - k[KP.rAnkle].x) / hipW;
      else if (ok(k[KP.lKnee], k[KP.rKnee])) { feet = Math.abs(k[KP.lKnee].x - k[KP.rKnee].x) / hipW; wideAt = 1.35; closeAt = 1.15; }
      const handsUp = lw.y < noseY && rw.y < noseY;
      const handsDown = lw.y > shoulderY && rw.y > shoulderY;
      // "angle" zeigt hier die Fußbreite in % der Hüftbreite (nur Anzeige)
      st.angle = feet === null ? null : ema(st.angle, feet * 100);
      st.source = feet === null ? 'nur Arme' : 'Arme + Beine';
      st.depth = clamp01((shoulderY - Math.min(lw.y, rw.y)) / Math.max(1, shoulderY - noseY + hipW));
      let event: RepEvent = null;

      const wide = feet === null || feet > wideAt;
      const narrow = feet === null || feet < closeAt;
      const open = handsUp && wide;
      const closed = handsDown && narrow;
      if (st.phase === 'none') { if (closed) st.phase = 'down'; st.hint = 'Gerade hinstellen, Arme unten'; return { state: { ...st }, event }; }
      if (st.phase === 'down') {
        if (handsUp) armsUp = true;
        if (feet !== null && feet > wideAt) legsWide = true;
        if (open) st.phase = 'up';
        else if (closed && armsUp && !legsWide) { st.invalid++; event = { type: 'invalid', reason: 'Beine mitspringen!' }; armsUp = false; }
      } else if (st.phase === 'up' && closed) {
        st.phase = 'down'; st.reps++; event = { type: 'rep' }; armsUp = false; legsWide = false;
      }
      st.hint = st.phase === 'up' ? 'Zusammen!' : 'Auf!';
      return { state: { ...st }, event };
    },
  };
}

/**
 * Plank (Seitenansicht). Zählt Sekunden, solange der Körper eine gerade Linie bildet
 * (Schulter-Hüfte-Knöchel bzw. -Knie > 160°) und waagerecht liegt. "reps" = gehaltene Sekunden.
 * Sind die Beine nicht im Bild, reicht ein waagerechter Rumpf, der sich auf Unterarme
 * oder Hände stützt; die Linie kann dann nicht geprüft werden.
 */
export function createPlankCounter(clock: () => number = () => performance.now()): RepCounter {
  const HINT = 'Seitlich, Schulter und Hüfte ins Bild';
  const st: CounterState = { reps: 0, invalid: 0, phase: 'none', angle: null, visible: false, hint: HINT, depth: 0 };
  let lost = 0;
  let held = 0;
  let last: number | null = null;
  let badSince: number | null = null;

  return {
    state: () => ({ ...st }),
    update(k) {
      const now = clock();
      const dt = last === null ? 0 : Math.min(0.5, (now - last) / 1000);
      last = now;
      const s = pickSide(k, ['shoulder', 'hip']);
      if (!s) { const r = lostState(st, ++lost, HINT); if (lost > 5) st.phase = 'none'; return { ...r, state: { ...st } }; }
      lost = 0;
      st.visible = true;
      const foot = vis(s.ankle) ? s.ankle : vis(s.knee) ? s.knee : null;
      let horizontal: boolean, straight: boolean;
      if (foot) {
        st.angle = ema(st.angle, angle(s.shoulder, s.hip, foot), 0.3);
        horizontal = Math.abs(s.shoulder.y - foot.y) < Math.abs(s.shoulder.x - foot.x) * 0.7;
        straight = st.angle > 160;
        st.depth = clamp01((st.angle - 130) / 50);
        st.source = 'Körperlinie';
      } else {
        // Nur Oberkörper: Rumpf waagerecht und Ellbogen oder Hand stützt unter der Schulter
        st.angle = null;
        const support = (vis(s.elbow) && s.elbow.y > s.shoulder.y) || (vis(s.wrist) && s.wrist.y > s.shoulder.y);
        horizontal = support && Math.abs(s.shoulder.y - s.hip.y) < Math.abs(s.shoulder.x - s.hip.x) * 0.6;
        straight = true;
        st.depth = horizontal ? 1 : 0;
        st.source = 'Rumpf';
      }
      let event: RepEvent = null;
      if (!horizontal) { st.phase = 'none'; st.hint = 'In die Plank-Position gehen'; badSince = null; return { state: { ...st }, event }; }
      if (straight) {
        held += dt; badSince = null; st.phase = 'up';
        const sec = Math.floor(held + 1e-6);
        if (sec > st.reps) { st.reps = sec; if (sec % 15 === 0) event = { type: 'rep' }; }
        st.hint = foot ? 'Halten!' : 'Halten! (Beine nicht im Bild)';
      } else {
        if (badSince === null) badSince = now;
        st.phase = 'down';
        st.hint = 'Hüfte gerade – Körper als Linie!';
        // Nach 1 s krummer Haltung einmal melden, Zeit läuft dann nicht weiter
        if (now - badSince > 1000 && badSince !== -1) { st.invalid++; event = { type: 'invalid', reason: 'Körper gerade halten!' }; badSince = -1; }
      }
      return { state: { ...st }, event };
    },
  };
}

/** Welche Übungen die Kamera zählen kann */
export const CAMERA_COUNTERS: Record<string, (clock?: () => number) => RepCounter> = {
  pushup: createPushupCounter,
  situp: createSitupCounter,
  squat: createSquatCounter,
  jacks: createJacksCounter,
  plank: createPlankCounter,
};
