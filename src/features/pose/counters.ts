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
export function repMachine(down = 0.7, up = 0.2, partial = 0.35) {
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

// ---------- Weitere Kamera-Übungen (23.11.2026) ----------

/** Rumpf: Schulter und Hüfte einer Seite. upright = steht/sitzt aufrecht, flat = liegt waagerecht. */
function torsoOf(k: Keypoint[]) {
  const s = pickSide(k, ['shoulder', 'hip']);
  if (!s) return null;
  const dy = s.hip.y - s.shoulder.y, dx = Math.abs(s.hip.x - s.shoulder.x);
  return { s, dy, dx, len: Math.hypot(dx, dy), upright: dy > 0 && dy > dx * 1.3, flat: Math.abs(dy) < dx * 0.7 };
}
function headY(k: Keypoint[]): number | null {
  return vis(k[KP.nose]) ? k[KP.nose].y : meanY(k, [KP.lEye, KP.rEye, KP.lEar, KP.rEar]);
}

/**
 * Klimmzug / Chin-up. Handy schräg vor sich auf den Boden, Kopf und Hände im Bild.
 * Gemessen: wie weit der Kopf zu den Händen hochkommt (bezogen auf den Abstand beim Hängen).
 * Wdh. = ganz hängen → Kopf auf Höhe der Hände (Kinn über der Stange) → wieder ganz hängen.
 */
export function createPullupCounter(): RepCounter {
  const HINT = 'Kopf und Hände ins Bild';
  const st: CounterState = { reps: 0, invalid: 0, phase: 'none', angle: null, visible: false, hint: HINT, depth: 0 };
  const m = repMachine(0.95, 0.25, 0.5);
  const hang = decayMax();
  let depth: number | null = null;
  let lost = 0;
  return {
    state: () => ({ ...st }),
    update(k) {
      const hy = headY(k), wy = meanY(k, [KP.lWrist, KP.rWrist]), sy = meanY(k, [KP.lShoulder, KP.rShoulder]);
      if (hy === null || wy === null || sy === null) return lostState(st, ++lost, HINT);
      lost = 0;
      st.visible = true;
      st.angle = null;
      st.source = 'Kopf zu den Händen';
      if (wy > sy) {
        m.reset(); depth = null; st.phase = 'none'; st.depth = 0;
        st.hint = 'An die Stange hängen, Arme hoch';
        return { state: { ...st }, event: null };
      }
      const gap = hy - wy; // hängend groß, oben 0 oder negativ
      const ref = hang.push(Math.max(0, gap));
      if (ref < 15) { st.hint = 'Arme ganz strecken'; return { state: { ...st }, event: null }; }
      depth = ema(depth, clamp01((ref - gap) / ref), 0.6);
      st.depth = depth;
      let event: RepEvent = null;
      const r = m.step(depth);
      if (r === 'rep') { st.reps++; event = { type: 'rep' }; }
      else if (r === 'partial') { st.invalid++; event = { type: 'invalid', reason: 'Kinn über die Stange!' }; }
      st.phase = m.phase;
      st.hint = m.phase === 'none' ? 'Ganz hängen, Arme gestreckt' : m.phase === 'down' ? 'Runter, Arme ganz strecken' : depth > 0.5 ? 'Höher, Kinn über die Stange!' : 'Hochziehen!';
      return { state: { ...st }, event };
    },
  };
}

/**
 * Dips (Barren oder Stuhlkante, seitlich). Ellbogenwinkel: oben > ~150°, unten < ~95°.
 * Oberkörper muss aufrecht sein (sonst wäre es ein Liegestütz).
 */
export function createDipCounter(): RepCounter {
  const HINT = 'Seitlich: Schulter, Ellbogen und Hand ins Bild';
  const st: CounterState = { reps: 0, invalid: 0, phase: 'none', angle: null, visible: false, hint: HINT, depth: 0 };
  const m = repMachine(0.7, 0.2, 0.4);
  let depth: number | null = null;
  let lost = 0;
  return {
    state: () => ({ ...st }),
    update(k) {
      const arm = pickSide(k, ['shoulder', 'elbow', 'wrist']);
      if (!arm) return lostState(st, ++lost, HINT);
      lost = 0;
      st.visible = true;
      const t = torsoOf(k);
      if ((t && !(t.dy > 0 && t.dy > t.dx * 0.8)) || arm.wrist.y < arm.shoulder.y) {
        m.reset(); depth = null; st.phase = 'none'; st.depth = 0;
        st.hint = 'Aufrecht stützen, Hände neben der Hüfte';
        return { state: { ...st }, event: null };
      }
      st.angle = ema(st.angle, angle(arm.shoulder, arm.elbow, arm.wrist));
      st.source = 'Ellbogen';
      depth = ema(depth, clamp01((160 - st.angle) / 65), 0.6);
      st.depth = depth;
      let event: RepEvent = null;
      const r = m.step(depth);
      if (r === 'rep') { st.reps++; event = { type: 'rep' }; }
      else if (r === 'partial') { st.invalid++; event = { type: 'invalid', reason: 'Tiefer runter!' }; }
      st.phase = m.phase;
      st.hint = m.phase === 'none' ? 'Arme strecken, oben starten' : m.phase === 'down' ? 'Hochdrücken!' : 'Runter, bis der Oberarm waagerecht ist';
      return { state: { ...st }, event };
    },
  };
}

/** Kniewinkel aller Beine, bei denen Hüfte, Knie und Fuß erkannt sind */
function kneeAngles(k: Keypoint[]): number[] {
  const out: number[] = [];
  for (const [h, kn, a] of [[KP.lHip, KP.lKnee, KP.lAnkle], [KP.rHip, KP.rKnee, KP.rAnkle]]) {
    if (ok(k[h], k[kn], k[a])) out.push(angle(k[h], k[kn], k[a]));
  }
  return out;
}

/**
 * Ausfallschritt (seitlich). Beim richtigen Ausfallschritt beugen sich beide Knie auf ~90°.
 * Gemessen wird das stärker gebeugte Knie: oben > ~150°, unten < ~100°.
 */
export function createLungeCounter(): RepCounter {
  const HINT = 'Seitlich: Hüfte, Knie und Füße ins Bild';
  const st: CounterState = { reps: 0, invalid: 0, phase: 'none', angle: null, visible: false, hint: HINT, depth: 0 };
  const m = repMachine(0.7, 0.2, 0.4);
  let depth: number | null = null;
  let lost = 0;
  return {
    state: () => ({ ...st }),
    update(k) {
      const ks = kneeAngles(k);
      if (!ks.length) return lostState(st, ++lost, HINT);
      lost = 0;
      st.visible = true;
      const t = torsoOf(k);
      if (t && !(t.dy > 0 && t.dy > t.dx * 0.55)) {
        m.reset(); depth = null; st.phase = 'none'; st.depth = 0;
        st.hint = 'Aufrecht hinstellen';
        return { state: { ...st }, event: null };
      }
      st.angle = ema(st.angle, Math.min(...ks));
      st.source = 'Knie';
      depth = ema(depth, clamp01((165 - st.angle) / 70), 0.6);
      st.depth = depth;
      let event: RepEvent = null;
      const r = m.step(depth);
      if (r === 'rep') { st.reps++; event = { type: 'rep' }; }
      else if (r === 'partial') { st.invalid++; event = { type: 'invalid', reason: 'Tiefer runter!' }; }
      st.phase = m.phase;
      st.hint = m.phase === 'none' ? 'Gerade hinstellen' : m.phase === 'down' ? 'Zurück in den Stand' : 'Großer Schritt, hinteres Knie Richtung Boden';
      return { state: { ...st }, event };
    },
  };
}

/**
 * High Knees (von vorn). Jedes Knie, das bis etwa auf Hüfthöhe kommt, zählt 1.
 * Gemessen: Höhe des Knies unter der Hüfte im Vergleich zum Stehen (je Bein).
 */
export function createHighKneesCounter(): RepCounter {
  const HINT = 'Von vorn: Hüfte und Knie ins Bild';
  const st: CounterState = { reps: 0, invalid: 0, phase: 'none', angle: null, visible: false, hint: HINT, depth: 0 };
  const legs = [KP.lHip, KP.rHip].map((hip, i) => ({ hip, knee: i ? KP.rKnee : KP.lKnee, m: repMachine(0.75, 0.3, 0.5), ref: decayMax(), d: null as number | null }));
  let lost = 0;
  return {
    state: () => ({ ...st }),
    update(k) {
      const seen = legs.filter((l) => ok(k[l.hip], k[l.knee]));
      if (!seen.length) return lostState(st, ++lost, HINT);
      lost = 0;
      st.visible = true;
      st.angle = null;
      st.source = seen.length === 2 ? 'beide Knie' : 'ein Knie';
      let event: RepEvent = null;
      let deepest = 0;
      for (const l of seen) {
        const thigh = Math.max(0, k[l.knee].y - k[l.hip].y);
        const ref = l.ref.push(thigh);
        if (ref < 10) continue;
        l.d = ema(l.d, clamp01(1 - thigh / ref), 0.6);
        deepest = Math.max(deepest, l.d);
        const r = l.m.step(l.d);
        if (r === 'rep') { st.reps++; event = { type: 'rep' }; }
        else if (r === 'partial' && !event) { st.invalid++; event = { type: 'invalid', reason: 'Knie höher!' }; }
      }
      st.depth = deepest;
      st.phase = legs.some((l) => l.m.phase === 'down') ? 'down' : legs.some((l) => l.m.phase === 'up') ? 'up' : 'none';
      st.hint = st.phase === 'none' ? 'Gerade hinstellen' : 'Knie bis auf Hüfthöhe!';
      return { state: { ...st }, event };
    },
  };
}

/**
 * Mountain Climbers (seitlich, Liegestütz-Position). Jedes Knie, das Richtung Brust kommt, zählt 1.
 * Gemessen: Hüftwinkel Schulter-Hüfte-Knie je Bein (gestreckt ~170°, Knie vorn < ~105°).
 * Liegen beide Knie fast an derselben Stelle (das verdeckte Bein wird oft auf das sichtbare gelegt),
 * zählt ein gleichzeitiger zweiter Treffer nicht.
 */
export function createMountainCounter(clock: () => number = () => performance.now()): RepCounter {
  const HINT = 'Seitlich: Schulter, Hüfte und Knie ins Bild';
  const st: CounterState = { reps: 0, invalid: 0, phase: 'none', angle: null, visible: false, hint: HINT, depth: 0 };
  const legs = [0, 1].map((i) => ({ knee: i ? KP.rKnee : KP.lKnee, hip: i ? KP.rHip : KP.lHip, sh: i ? KP.rShoulder : KP.lShoulder, m: repMachine(0.7, 0.25, 0.45), d: null as number | null }));
  let lost = 0;
  let lastRep = -1e9;
  return {
    state: () => ({ ...st }),
    update(k) {
      const now = clock();
      const t = torsoOf(k);
      if (!t) return lostState(st, ++lost, HINT);
      lost = 0;
      st.visible = true;
      st.angle = null;
      st.source = 'Hüfte';
      if (!(Math.abs(t.dy) < t.dx * 0.8)) {
        for (const l of legs) { l.m.reset(); l.d = null; }
        st.phase = 'none'; st.depth = 0; st.hint = 'In den Liegestütz gehen';
        return { state: { ...st }, event: null };
      }
      const kneesTogether = ok(k[KP.lKnee], k[KP.rKnee]) && Math.hypot(k[KP.lKnee].x - k[KP.rKnee].x, k[KP.lKnee].y - k[KP.rKnee].y) < t.len * 0.2;
      let event: RepEvent = null;
      let deepest = 0;
      for (const l of legs) {
        if (!ok(k[l.sh], k[l.hip], k[l.knee])) continue;
        l.d = ema(l.d, clamp01((165 - angle(k[l.sh], k[l.hip], k[l.knee])) / 75), 0.6);
        deepest = Math.max(deepest, l.d);
        const r = l.m.step(l.d);
        if (r === 'rep') {
          if (kneesTogether && now - lastRep < 300) continue;
          st.reps++; event = { type: 'rep' }; lastRep = now;
        } else if (r === 'partial' && !event) { st.invalid++; event = { type: 'invalid', reason: 'Knie weiter zur Brust!' }; }
      }
      st.depth = deepest;
      st.phase = legs.some((l) => l.m.phase === 'down') ? 'down' : legs.some((l) => l.m.phase === 'up') ? 'up' : 'none';
      st.hint = st.phase === 'none' ? 'Beine strecken, Liegestütz-Position' : 'Knie abwechselnd zur Brust!';
      return { state: { ...st }, event };
    },
  };
}

/**
 * Burpee (seitlich, ganzer Körper). Ablauf: Stehen → Liegestütz (Rumpf waagerecht) → Stehen → Sprung mit Armen über dem Kopf.
 * Erst wenn alles in dieser Reihenfolge kommt, zählt 1. Wer sich wieder hinlegt oder nach dem Aufstehen
 * 2,5 s lang nicht mit den Armen nach oben springt, bekommt "ungültig".
 */
export function createBurpeeCounter(clock: () => number = () => performance.now()): RepCounter {
  const HINT = 'Seitlich, ganzer Körper ins Bild (ca. 3 m weg)';
  const st: CounterState = { reps: 0, invalid: 0, phase: 'none', angle: null, visible: false, hint: HINT, depth: 0 };
  let stage: 'none' | 'stand' | 'floor' | 'back' = 'none';
  let backSince = 0;
  let lost = 0;
  return {
    state: () => ({ ...st }),
    update(k) {
      const now = clock();
      const t = torsoOf(k);
      if (!t) return lostState(st, ++lost, HINT);
      lost = 0;
      st.visible = true;
      st.angle = null;
      const hy = headY(k) ?? t.s.shoulder.y;
      const handsUp = [k[KP.lWrist], k[KP.rWrist]].some((w) => vis(w) && w.y < hy);
      let event: RepEvent = null;
      if (stage === 'none') { if (t.upright) stage = 'stand'; }
      else if (stage === 'stand') { if (t.flat) stage = 'floor'; }
      else if (stage === 'floor') { if (t.upright) { stage = 'back'; backSince = now; } }
      else if (stage === 'back') {
        if (handsUp) { st.reps++; event = { type: 'rep' }; stage = 'stand'; }
        else if (t.flat) { st.invalid++; event = { type: 'invalid', reason: 'Hochspringen, Arme hoch!' }; stage = 'floor'; }
        else if (now - backSince > 2500) { st.invalid++; event = { type: 'invalid', reason: 'Hochspringen, Arme hoch!' }; stage = 'stand'; }
      }
      st.source = stage === 'floor' ? 'liegt' : t.upright ? 'steht' : 'Übergang';
      st.depth = stage === 'floor' ? 1 : stage === 'back' ? 0.5 : 0;
      st.phase = stage === 'none' ? 'none' : stage === 'floor' ? 'down' : 'up';
      st.hint = stage === 'none' ? 'Gerade hinstellen' : stage === 'stand' ? 'Runter in den Liegestütz' : stage === 'floor' ? 'Füße ran und aufstehen' : 'Hochspringen, Arme über den Kopf!';
      return { state: { ...st }, event };
    },
  };
}

/**
 * Glute Bridge (seitlich, auf dem Rücken). Hüftwinkel Schulter-Hüfte-Knie:
 * unten ~135°, oben gerade Linie > ~160°. Nur halb hoch (bis ~148°) = "Hüfte höher!".
 */
export function createGluteBridgeCounter(): RepCounter {
  const HINT = 'Seitlich liegend: Schulter, Hüfte und Knie ins Bild';
  const st: CounterState = { reps: 0, invalid: 0, phase: 'none', angle: null, visible: false, hint: HINT, depth: 0 };
  const m = repMachine(0.85, 0.3, 0.5);
  let depth: number | null = null;
  let lost = 0;
  return {
    state: () => ({ ...st }),
    update(k) {
      const s = pickSide(k, ['shoulder', 'hip', 'knee']);
      if (!s) return lostState(st, ++lost, HINT);
      lost = 0;
      st.visible = true;
      const t = torsoOf(k);
      if (t?.upright) {
        m.reset(); depth = null; st.phase = 'none'; st.depth = 0;
        st.hint = 'Auf den Rücken legen, Füße aufstellen';
        return { state: { ...st }, event: null };
      }
      st.angle = ema(st.angle, angle(s.shoulder, s.hip, s.knee));
      st.source = 'Hüfte';
      depth = ema(depth, clamp01((st.angle - 130) / 35), 0.6);
      st.depth = depth;
      let event: RepEvent = null;
      const r = m.step(depth);
      if (r === 'rep') { st.reps++; event = { type: 'rep' }; }
      else if (r === 'partial') { st.invalid++; event = { type: 'invalid', reason: 'Hüfte höher!' }; }
      st.phase = m.phase;
      st.hint = m.phase === 'none' ? 'Hüfte ablegen' : m.phase === 'down' ? 'Langsam ablegen' : 'Hüfte hoch, Po anspannen!';
      return { state: { ...st }, event };
    },
  };
}

/**
 * Wandsitzen (seitlich). Zählt Sekunden, solange das Knie etwa rechtwinklig ist (70–115°),
 * ohne Füße im Bild: solange der Oberschenkel waagerecht ist. "reps" = gehaltene Sekunden.
 */
export function createWallSitCounter(clock: () => number = () => performance.now()): RepCounter {
  const HINT = 'Seitlich: Hüfte und Knie ins Bild';
  const st: CounterState = { reps: 0, invalid: 0, phase: 'none', angle: null, visible: false, hint: HINT, depth: 0 };
  let lost = 0, held = 0, last: number | null = null, badSince: number | null = null, started = false;
  return {
    state: () => ({ ...st }),
    update(k) {
      const now = clock();
      const dt = last === null ? 0 : Math.min(0.5, (now - last) / 1000);
      last = now;
      const s = pickSide(k, ['hip', 'knee']);
      if (!s) { const r = lostState(st, ++lost, HINT); if (lost > 5) st.phase = 'none'; return { ...r, state: { ...st } }; }
      lost = 0;
      st.visible = true;
      let good: boolean, standing: boolean;
      if (vis(s.ankle)) {
        st.angle = ema(st.angle, angle(s.hip, s.knee, s.ankle), 0.3);
        good = st.angle >= 70 && st.angle <= 115;
        standing = st.angle > 150;
        st.depth = clamp01((170 - st.angle) / 80);
        st.source = 'Knie';
      } else {
        st.angle = null;
        const dy = Math.abs(s.knee.y - s.hip.y), dx = Math.abs(s.knee.x - s.hip.x);
        good = dy < dx * 0.4;
        standing = dy > dx * 1.5;
        st.depth = clamp01(1 - dy / Math.max(1, dx + dy));
        st.source = 'Oberschenkel';
      }
      let event: RepEvent = null;
      if (good) {
        started = true; held += dt; badSince = null; st.phase = 'up';
        const sec = Math.floor(held + 1e-6);
        if (sec > st.reps) { st.reps = sec; if (sec % 15 === 0) event = { type: 'rep' }; }
        st.hint = 'Halten!';
      } else if (!started || standing) {
        st.phase = 'none'; badSince = null;
        st.hint = 'Rücken an die Wand, runter bis die Oberschenkel waagerecht sind';
      } else {
        if (badSince === null) badSince = now;
        st.phase = 'down';
        st.hint = 'Tiefer, Oberschenkel waagerecht!';
        if (now - badSince > 1000 && badSince !== -1) { st.invalid++; event = { type: 'invalid', reason: 'Oberschenkel waagerecht!' }; badSince = -1; }
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
  pullup: createPullupCounter,
  chinup: createPullupCounter,
  dip: createDipCounter,
  lunge: createLungeCounter,
  highknees: createHighKneesCounter,
  mountain: createMountainCounter,
  burpee: createBurpeeCounter,
  glutebridge: createGluteBridgeCounter,
  wallsit: createWallSitCounter,
};

/** Was bei der Kamera unten links als Winkel angezeigt wird */
export const ANGLE_LABEL: Record<string, string> = {
  pushup: 'Ellbogen', dip: 'Ellbogen', squat: 'Knie', lunge: 'Knie', wallsit: 'Knie', plank: 'Körperlinie', situp: 'Hüfte', glutebridge: 'Hüfte',
};
