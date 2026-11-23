import { Fragment, memo, cloneElement, isValidElement, useId, useMemo, type ReactElement, type ReactNode } from 'react';
import { HAIRS, ITEM, SKINS, bodyStrength, type AvatarLook, type ShopItem, type Slot } from '../lib/avatar';

/**
 * Ganzkörper-Avatar als SVG (viewBox 0 0 200 400). Der Körper wird stufenlos aus
 * bodyStrength(level) berechnet: 0 = sehr mager, 1 = extrem muskulös.
 * Alle Formen sind Parameter-Pfade (Catmull-Rom → Bézier), keine festen Bilder.
 */

type P = [number, number];
type Cap = 'round' | 'flat';
/** Breitenprofil eines Glieds: [Abstand entlang der Achse, außen schwach, außen stark, innen schwach, innen stark] */
type Profile = number[][];

// ---------- Farben ----------

function hexToRgb(h: string): [number, number, number] {
  const v = h.replace('#', '');
  const n = parseInt(v.length === 3 ? v.split('').map((c) => c + c).join('') : v, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function mix(a: string, b: string, t: number): string {
  const x = hexToRgb(a);
  const y = hexToRgb(b);
  return '#' + x.map((c, i) => Math.round(c + (y[i] - c) * t).toString(16).padStart(2, '0')).join('');
}
const darken = (c: string, t: number) => mix(c, '#000000', t);
const lighten = (c: string, t: number) => mix(c, '#ffffff', t);

// ---------- Geometrie ----------

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const r1 = (n: number) => Math.round(n * 10) / 10;
const add = (a: P, b: P, k = 1): P => [a[0] + b[0] * k, a[1] + b[1] * k];
const mx = (p: P, side: number): P => [100 + (p[0] - 100) * side, p[1]];

function bez(p0: P, p1: P, p2: P, p3: P): string {
  const c1: P = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
  const c2: P = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
  return `C${r1(c1[0])} ${r1(c1[1])} ${r1(c2[0])} ${r1(c2[1])} ${r1(p2[0])} ${r1(p2[1])}`;
}

/** Geschlossene, weiche Form; Orientierung wird vereinheitlicht, damit Teilpfade sich vereinigen (nonzero). */
function closedPath(input: P[]): string {
  let area = 0;
  for (let i = 0; i < input.length; i++) {
    const a = input[i];
    const b = input[(i + 1) % input.length];
    area += a[0] * b[1] - b[0] * a[1];
  }
  const pts = area < 0 ? [...input].reverse() : input;
  const n = pts.length;
  let d = `M${r1(pts[0][0])} ${r1(pts[0][1])}`;
  for (let i = 0; i < n; i++) d += bez(pts[(i - 1 + n) % n], pts[i], pts[(i + 1) % n], pts[(i + 2) % n]);
  return d + 'Z';
}

function openPath(pts: P[]): string {
  const n = pts.length;
  let d = `M${r1(pts[0][0])} ${r1(pts[0][1])}`;
  for (let i = 0; i < n - 1; i++) d += bez(pts[Math.max(0, i - 1)], pts[i], pts[i + 1], pts[Math.min(n - 1, i + 2)]);
  return d;
}

/** Offene Punktreihe (rechte Körperseite, oben → unten) nach außen versetzen */
function offsetOpen(pts: P[], d: number): P[] {
  return pts.map((p, i) => {
    const a = pts[Math.max(0, i - 1)];
    const c = pts[Math.min(pts.length - 1, i + 1)];
    const l = Math.hypot(c[0] - a[0], c[1] - a[1]) || 1;
    return [p[0] + ((c[1] - a[1]) / l) * d, p[1] - ((c[0] - a[0]) / l) * d];
  });
}

/** Polygon mit geraden Kanten */
const polyPath = (pts: P[]) => 'M' + pts.map((p) => `${r1(p[0])} ${r1(p[1])}`).join('L') + 'Z';

class Chain {
  lens: number[] = [];
  constructor(public pts: P[]) {
    for (let i = 0; i < pts.length - 1; i++) this.lens.push(Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]));
  }
  pos(d: number): P {
    let rest = d;
    for (let i = 0; i < this.lens.length; i++) {
      const last = i === this.lens.length - 1;
      if (rest <= this.lens[i] || last || (i === 0 && rest < 0)) {
        const t = rest / this.lens[i];
        const a = this.pts[i];
        const b = this.pts[i + 1];
        return [lerp(a[0], b[0], t), lerp(a[1], b[1], t)];
      }
      rest -= this.lens[i];
    }
    return this.pts[this.pts.length - 1];
  }
  /** Punkt und Außen-Normale (side +1 = rechts im Bild) */
  frame(d: number, side: number): { p: P; t: P; n: P } {
    const a = this.pos(d - 5);
    const b = this.pos(d + 5);
    const l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    const t: P = [(b[0] - a[0]) / l, (b[1] - a[1]) / l];
    return { p: this.pos(d), t, n: [t[1] * side, -t[0] * side] };
  }
}

function widthAt(pr: Profile, d: number, s: number): { o: number; i: number } {
  const row = (r: number[]) => ({ o: lerp(r[1], r[2], s), i: lerp(r[3], r[4], s) });
  if (d <= pr[0][0]) return row(pr[0]);
  for (let k = 0; k < pr.length - 1; k++) {
    const a = pr[k];
    const b = pr[k + 1];
    if (d <= b[0]) {
      const f = (1 - Math.cos(Math.PI * ((d - a[0]) / (b[0] - a[0])))) / 2;
      const A = row(a);
      const B = row(b);
      return { o: lerp(A.o, B.o, f), i: lerp(A.i, B.i, f) };
    }
  }
  return row(pr[pr.length - 1]);
}

interface Limb {
  chain: Chain;
  prof: Profile;
  side: number;
  s: number;
}

function limbOutline(L: Limb, d0: number, d1: number, padIn: number | ((d: number) => number), capTop: Cap, capBot: Cap): P[] {
  const steps = Math.max(2, Math.ceil((d1 - d0) / 5));
  const outer: P[] = [];
  const inner: P[] = [];
  const padAt = typeof padIn === 'number' ? () => padIn : padIn;
  for (let k = 0; k <= steps; k++) {
    const d = lerp(d0, d1, k / steps);
    const { p, n } = L.chain.frame(d, L.side);
    const w = widthAt(L.prof, d, L.s);
    const pad = padAt(d);
    outer.push(add(p, n, w.o + pad));
    inner.push(add(p, n, -(w.i + pad)));
  }
  const cap = (d: number, dir: number, kind: Cap): P[] => {
    const { p, n, t } = L.chain.frame(d, L.side);
    const w = widthAt(L.prof, d, L.s);
    const mid = add(p, n, (w.o - w.i) / 2);
    if (kind === 'flat') return [add(mid, t, dir * 0.3)];
    return [add(mid, t, dir * (Math.min(w.o, w.i) + padAt(d)) * 0.6)];
  };
  return [...outer, ...cap(d1, 1, capBot), ...inner.reverse(), ...cap(d0, -1, capTop)];
}

/** Wie offsetOpen, aber mit eigenem Abstand je Punkt */
function offsetVar(pts: P[], ds: number[]): P[] {
  return offsetOpen(pts, 1).map((q, i) => [pts[i][0] + (q[0] - pts[i][0]) * ds[i], pts[i][1] + (q[1] - pts[i][1]) * ds[i]] as P);
}

/** Kleiner deterministischer Zufall (für Tarnmuster) */
function rng(seed: number): () => number {
  let x = seed;
  return () => {
    x = (x * 1103515245 + 12345) & 0x7fffffff;
    return x / 0x7fffffff;
  };
}

/** Punkt auf dem Glied: f > 0 Anteil der Außenbreite, f < 0 Anteil der Innenbreite */
function lp(L: Limb, d: number, f: number): P {
  const { p, n } = L.chain.frame(d, L.side);
  const w = widthAt(L.prof, d, L.s);
  return add(p, n, f >= 0 ? f * w.o : f * w.i);
}


const smooth = (a: number, b: number, v: number) => {
  const t = clamp01((v - a) / (b - a));
  return t * t * (3 - 2 * t);
};

/** Ellipse als weicher Pfad (8 Punkte) */
function ellPts(c: P, rx: number, ry: number, deg = 0): P[] {
  const a = (deg * Math.PI) / 180;
  const pts: P[] = [];
  for (let k = 0; k < 8; k++) {
    const t = (k / 8) * Math.PI * 2;
    const x = Math.cos(t) * rx;
    const y = Math.sin(t) * ry;
    pts.push([c[0] + x * Math.cos(a) - y * Math.sin(a), c[1] + x * Math.sin(a) + y * Math.cos(a)]);
  }
  return pts;
}
const ell = (c: P, rx: number, ry: number, deg = 0) => closedPath(ellPts(c, rx, ry, deg));

/** Ellipse entlang der Glied-Achse: ra längs, rb quer */
function limbEll(L: Limb, d: number, f: number, ra: number, rb: number): string {
  const { t, n } = L.chain.frame(d, L.side);
  const c = lp(L, d, f);
  const pts: P[] = [];
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2;
    pts.push([c[0] + t[0] * Math.cos(a) * ra + n[0] * Math.sin(a) * rb, c[1] + t[1] * Math.cos(a) * ra + n[1] * Math.sin(a) * rb]);
  }
  return closedPath(pts);
}
const wAt = (L: Limb, d: number) => {
  const w = widthAt(L.prof, d, L.s);
  return (w.o + w.i) / 2;
};

// ---------- Körpermaße ----------

const ARM: Profile = [
  [-9, 3.5, 7, 3.5, 7],
  [0, 6.4, 14.5, 5.6, 11.5],
  [10, 6.4, 16, 5.3, 12.5],
  [22, 4.9, 12.8, 4.9, 14],
  [30, 4.5, 12, 4.6, 14.5],
  [44, 4.3, 10.5, 4.3, 12],
  [54, 4.6, 8.4, 4.5, 8.6],
  [62, 4.1, 9.6, 4.0, 9],
  [74, 4.3, 11.2, 4.0, 9.8],
  [92, 3.5, 8.2, 3.3, 7],
  [112, 2.9, 5.2, 2.9, 5.2],
];
const LEG: Profile = [
  [-16, 10, 17, 10, 16],
  [0, 10, 17.5, 9.8, 16],
  [18, 9, 19.5, 8.4, 16],
  [45, 7, 16.5, 6.4, 14.5],
  [68, 5.6, 13.5, 5.6, 14],
  [84, 6.4, 10, 6.4, 10.5],
  [94, 5.5, 10.8, 5.5, 11],
  [110, 5.6, 12, 6, 13.8],
  [130, 4.7, 10, 4.8, 10],
  [150, 3.7, 7, 3.7, 6.5],
  [166, 4.4, 6.2, 4.4, 6.2],
];

interface Body {
  s: number;
  nw: number;
  shW: number;
  hipW: number;
  cw: number;
  pecY: number;
  torsoR: P[];
  torsoX: (y: number) => number;
  arms: Limb[];
  legs: Limb[];
  ankles: P[];
}

function makeBody(s: number): Body {
  const nw = 6 + 5 * s;
  const shW = 30 + 18 * s;
  const legX = 10.5 + 5 * s;
  const hipW = legX + lerp(10, 17.5, s) * 0.96;
  const torsoR: P[] = [
    [100 + nw, 70],
    [100 + nw + 8 + 8 * s, 81 - 6 * s],
    [100 + shW, 88 + 5 * (1 - s)],
    [100 + 24 + 15 * s, 108],
    [100 + 22.5 + 12.5 * s, 135],
    [100 + 19.5 + 7.5 * s, 168],
    [100 + hipW, 192],
    [100 + hipW - 1, 208],
  ];
  const torsoX = (y: number) => {
    for (let k = 0; k < torsoR.length - 1; k++) {
      const a = torsoR[k];
      const b = torsoR[k + 1];
      if (y <= b[1]) return lerp(a[0], b[0], clamp01((y - a[1]) / (b[1] - a[1]))) - 100;
    }
    return torsoR[torsoR.length - 1][0] - 100;
  };
  const a1 = ((7 + 9 * s) * Math.PI) / 180;
  const a2 = ((3 + 6 * s) * Math.PI) / 180;
  const arms: Limb[] = [-1, 1].map((side) => {
    const J: P = [100 + shW - 5 - 1.5 * s, 94 + 4 * (1 - s)];
    const E: P = [J[0] + 58 * Math.sin(a1), J[1] + 58 * Math.cos(a1)];
    const W: P = [E[0] + 54 * Math.sin(a2), E[1] + 54 * Math.cos(a2)];
    return { chain: new Chain([mx(J, side), mx(E, side), mx(W, side)]), prof: ARM, side, s };
  });
  const ankles: P[] = [];
  const legs: Limb[] = [-1, 1].map((side) => {
    const H: P = [100 + legX, 196];
    const K: P = [100 + 12.5 + 6 * s, 282];
    const A: P = [100 + 14 + 5 * s, 362];
    ankles.push(mx(A, side));
    return { chain: new Chain([mx(H, side), mx(K, side), mx(A, side)]), prof: LEG, side, s };
  });
  return { s, nw, shW, hipW, cw: 24 + 15 * s, pecY: 112 + 8 * s, torsoR, torsoX, arms, legs, ankles };
}

function torsoPath(b: Body): string {
  const right = b.torsoR;
  const left = [...right].reverse().map((p) => mx(p, -1));
  return closedPath([...right, [100, 216], ...left]);
}

/** Entspannt hängende Hand (Handfläche zum Oberschenkel, Daumen vorne) */
function handGeo(L: Limb): { hand: P[]; thumb: P[]; loc: (x: number, y: number) => P; hw: number; len: number } {
  const { t, n } = L.chain.frame(115, L.side);
  const base = L.chain.pos(110);
  const hw = 4.4 + 2.2 * L.s;
  const len = 27 + 2.5 * L.s;
  const loc = (x: number, y: number): P => [base[0] + n[0] * x + t[0] * y, base[1] + n[1] * x + t[1] * y];
  const k = len / 27;
  const hand: P[] = [
    loc(3.1 + 2.2 * L.s, 0),
    loc(hw * 1.02, 6 * k),
    loc(hw * 1.12, 12 * k),
    loc(hw * 1.02, 18 * k),
    loc(hw * 0.7, 23.5 * k),
    loc(hw * 0.2, 27 * k),
    loc(-hw * 0.35, 26.2 * k),
    loc(-hw * 0.72, 22.5 * k),
    loc(-hw * 0.9, 16 * k),
    loc(-hw * 0.98, 9 * k),
    loc(-3.1 - 2.2 * L.s, 0),
  ];
  const thumb: P[] = [
    loc(-hw * 0.7, 5 * k),
    loc(-hw * 1.18, 9 * k),
    loc(-hw * 1.2, 14.5 * k),
    loc(-hw * 0.85, 19.5 * k),
    loc(-hw * 0.45, 19.8 * k),
    loc(-hw * 0.3, 15 * k),
    loc(-hw * 0.25, 9 * k),
  ];
  return { hand, thumb, loc, hw, len };
}

/** Fuß von vorne, Zehen leicht nach außen. side +1 = rechts im Bild */
function footPts(a: P, side: number, e = 0): P[] {
  const f = (x: number, y: number): P => [a[0] + x * side, y];
  return [
    f(-4.6 - e, 361 - e * 3),
    f(4.6 + e, 361 - e * 3),
    f(6.2 + e, 366),
    f(8.6 + e, 374),
    f(11.4 + e, 379),
    f(11.8 + e, 383 + e * 0.4),
    f(9 + e, 385.6 + e * 0.6),
    f(0, 386.2 + e * 0.6),
    f(-6.5 - e, 385.6 + e * 0.6),
    f(-8.6 - e, 382.5),
    f(-7.8 - e, 376),
    f(-5.8 - e, 367),
  ];
}

// ---------- Schattierung ----------

type Tone = 'hl' | 'sh' | 'ao';
interface Mark {
  k: Tone;
  d: string;
  o: number;
  /** Strichbreite: dann als weicher Strich statt Fläche */
  w?: number;
  fine?: boolean;
  tf?: string;
}
type Pal = Record<Tone, string>;

/** Gleich gestylte Pfade zu einem Pfad zusammenfassen (weniger DOM-Elemente) */
function mergePaths(nodes: ReactNode): ReactNode {
  if (!Array.isArray(nodes)) return nodes;
  const out: ReactNode[] = [];
  const idx = new Map<string, number>();
  for (const n of nodes.flat(3) as ReactNode[]) {
    if (isValidElement(n) && n.type === 'path') {
      const p = n.props as Record<string, unknown>;
      if (!p.transform && !p.filter && !p.clipPath) {
        const key = [p.fill, p.stroke, p.strokeWidth, p.opacity, p.strokeDasharray, p.strokeLinecap, p.fillRule].join('|');
        const at = idx.get(key);
        if (at !== undefined) {
          const prev = out[at] as ReactElement<{ d: string }>;
          out[at] = cloneElement(prev, { d: prev.props.d + (p.d as string) });
          continue;
        }
        idx.set(key, out.length);
      }
    }
    out.push(n);
  }
  return out;
}

// ---------- Komponente ----------

export const AvatarFigure = memo(function AvatarFigure(props: {
  look: AvatarLook;
  level: number;
  className?: string;
  /** Vorschau eines Teils, das noch nicht gekauft ist */
  preview?: Partial<Record<Slot, string | null>>;
  animate?: boolean;
}): JSX.Element {
  const { look, level, className, preview, animate = false } = props;
  const uid = 'av' + useId().replace(/[^a-zA-Z0-9]/g, '');

  const resolve = (slot: Slot): ShopItem | null => {
    const id = preview && slot in preview ? preview[slot] ?? null : look.equipped[slot] ?? null;
    const it = id ? ITEM[id] : undefined;
    return it && it.slot === slot ? it : null;
  };
  const top = resolve('top');
  const bottom = resolve('bottom');
  const shoes = resolve('shoes');
  const head = resolve('head');
  const acc = resolve('acc');
  const s = clamp01(bodyStrength(level));
  const skinIdx = look.skin;
  const hairIdx = look.hair;

  const content = useMemo(
    () => drawFigure(uid, s, SKINS[skinIdx] ?? SKINS[1], HAIRS[hairIdx] ?? HAIRS[0], top, bottom, shoes, head, acc),
    [uid, s, skinIdx, hairIdx, top, bottom, shoes, head, acc],
  );

  return (
    <svg viewBox="0 0 200 400" className={className} role="img" aria-label="Avatar" xmlns="http://www.w3.org/2000/svg">
      {animate && (
        <style>{`@keyframes ${uid}b{0%,100%{transform:scale(1,1) translateY(0)}50%{transform:scale(1.012,1.008) translateY(-0.5px)}}
.${uid}b{transform-origin:100px 200px;transform-box:view-box;animation:${uid}b 3.8s ease-in-out infinite}
@media (prefers-reduced-motion: reduce){.${uid}b{animation:none}}`}</style>
      )}
      {content(animate ? `${uid}b` : undefined)}
    </svg>
  );
});

function drawFigure(
  uid: string,
  s: number,
  skin: string,
  hair: (typeof HAIRS)[number],
  top: ShopItem | null,
  bottom: ShopItem | null,
  shoes: ShopItem | null,
  head: ShopItem | null,
  acc: ShopItem | null,
): (breathe: string | undefined) => JSX.Element {
  const b = makeBody(s);
  const { nw, cw, pecY } = b;
  // Hauttöne: warmes Licht, rötliche Schatten
  const lum = hexToRgb(skin).reduce((a, c) => a + c, 0) / 765;
  const sk = {
    base: skin,
    hl: mix(skin, '#fff4e8', 0.2 + 0.12 * (1 - lum)),
    sh: mix(skin, '#3b1608', 0.3),
    ao: mix(skin, '#1a0703', 0.55),
    line: mix(skin, '#1a0703', 0.62),
  };
  const skinPal: Pal = { hl: sk.hl, sh: sk.sh, ao: sk.ao };
  const fabPal = (c: string): Pal => ({ hl: lighten(c, 0.28), sh: darken(c, 0.35), ao: darken(c, 0.6) });

  // Muskelkurven
  const def = smooth(0.12, 0.88, s);
  const absF = smooth(0.32, 0.74, s);
  const serF = smooth(0.5, 0.95, s);
  const ribF = 1 - smooth(0.04, 0.42, s);
  const bone = 1 - 0.65 * smooth(0.15, 0.8, s);

  const FB = `url(#${uid}fb)`;
  const FF = `url(#${uid}ff)`;
  let clipN = 0;

  const renderMarks = (key: string, marks: Mark[], pal: Pal, f = 1): ReactNode => {
    const el = (m: Mark, i: number) => {
      const o = m.o;
      if (o <= 0.01) return null;
      return m.w ? (
        <path key={i} d={m.d} fill="none" stroke={pal[m.k]} strokeWidth={m.w} strokeLinecap="round" opacity={o} transform={m.tf} />
      ) : (
        <path key={i} d={m.d} fill={pal[m.k]} opacity={o} transform={m.tf} />
      );
    };
    const soft = marks.flatMap((m): Mark[] =>
      m.fine && m.w && m.k === 'ao'
        ? [{ ...m, o: m.o * 0.6, w: m.w * 1.35 }, { ...m, k: 'hl', o: m.o * 0.45, w: m.w * 0.9, tf: 'translate(0.5 1.5)' }]
        : [m],
    );
    // Gleichartige Markierungen (Ton, Breite, Deckkraft in 0,05-Schritten) zu einem Pfad bündeln → weniger Elemente
    const merge = (list: Mark[]) => {
      const groups = new Map<string, Mark>();
      for (const m of list) {
        const o = Math.round(clamp01(m.o * f) * 20) / 20;
        if (o <= 0.01) continue;
        const key = `${m.k}|${m.w ?? 0}|${o}|${m.tf ?? ''}`;
        const g = groups.get(key);
        if (g) g.d += m.d;
        else groups.set(key, { ...m, o });
      }
      return [...groups.values()];
    };
    const broad = merge(soft.filter((m) => m.d !== RIM && !m.fine)).map(el).filter(Boolean);
    const fine = merge(soft.filter((m) => m.fine)).map(el).filter(Boolean);
    return (
      <Fragment key={key}>
        {broad.length > 0 && <g filter={FB}>{broad}</g>}
        {fine.length > 0 && <g filter={FF}>{fine}</g>}
      </Fragment>
    );
  };
  /** Markierung: Teil bekommt Innenschatten/-licht an den Kanten (Filter, funktioniert auch für vereinigte Pfade) */
  const RIM = '#rim';
  const rim = (_d: string, o = 1, _wide = 1): Mark[] => [{ k: 'sh', d: RIM, o }];
  const innerFilters = new Map<string, { id: string; pal: Pal }>();
  const innerFilter = (pal: Pal) => {
    const isSkin = pal === skinPal;
    const key = isSkin ? 'skin' : 'neutral';
    let f = innerFilters.get(key);
    if (!f) {
      f = { id: `${uid}i${innerFilters.size}`, pal: isSkin ? pal : { hl: '#ffffff', sh: '#000000', ao: '#000000' } };
      innerFilters.set(key, f);
    }
    return f.id;
  };
  /** Geschlossener Körper-/Stoffteil mit Grundfüllung, Kontur und weich geblendeter, beschnittener Schattierung */
  const part = (key: string, d: string, fill: string, line: string, marks: Mark[], pal: Pal, extra?: ReactNode, lw = 0.9, openOutline?: string): ReactNode => {
    const id = `${uid}c${clipN++}`;
    const rimM = marks.find((m) => m.d === RIM);
    marks = marks.filter((m) => m.d !== RIM);
    return (
      <Fragment key={key}>
        <clipPath id={id}>
          <path d={d} />
        </clipPath>
        {openOutline ? <path d={d} fill={fill} /> : <path d={d} fill={fill} stroke={line} strokeWidth={lw} strokeLinejoin="round" paintOrder="stroke" />}
        <g clipPath={`url(#${id})`}>
          {renderMarks('m', marks, pal)}
          {mergePaths(extra)}
        </g>
        {rimM && <path d={d} fill="#000" filter={`url(#${innerFilter(pal)})`} opacity={rimM.o} />}
        {openOutline && <path d={openOutline} fill="none" stroke={line} strokeWidth={lw / 2} strokeLinejoin="round" />}
      </Fragment>
    );
  };
  const line = (key: string, d: string, color: string, w: number, o: number, dash?: string): ReactNode =>
    o <= 0.01 ? null : (
      <path key={key} d={d} fill="none" stroke={color} strokeWidth={w} strokeLinecap="round" strokeLinejoin="round" opacity={r1(o * 100) / 100} strokeDasharray={dash} />
    );

  const L = b.legs;
  const A = b.arms;
  const armPaths = A.map((arm) => closedPath(limbOutline(arm, -9, 115, 0, 'round', 'flat')));
  const legPaths = L.map((leg) => closedPath(limbOutline(leg, -6, shoes ? 166 : 170, 0, 'round', 'flat')));
  const tPath = torsoPath(b);
  const skinFill = `url(#${uid}sk)`;

  // ---------- Muskel-Markierungen (auch für Kompressionsstoff) ----------
  const torsoMarks: Mark[] = [];
  const torsoMuscle: Mark[] = []; // nur Muskeln (für eng anliegende Stoffe)
  for (const side of [-1, 1]) {
    const m = (p: P) => mx(p, side);
    const mm = (pts: P[]) => pts.map(m);
    // Brust
    const pec: Mark[] = [
      { k: 'hl', d: ell(m([100 + cw * 0.5, 98 + 3 * s]), cw * 0.32, 4.5 + 2.5 * s, -14 * side), o: 0.1 + 0.4 * def },
      { k: 'hl', d: ell(m([100 + cw * 0.38, 97 + 2 * s]), cw * 0.16, 2.5 + 1.5 * s, -12 * side), o: 0.5 * def },
      { k: 'sh', d: closedPath(mm([[101.5, pecY - 3], [100 + cw * 0.5, pecY + 0.5], [100 + cw * 0.9, pecY - 9], [100 + cw * 0.97, pecY - 5], [100 + cw * 0.55, pecY + 5.5], [101.5, pecY + 3]])), o: 0.08 + 0.62 * def },
      { k: 'ao', d: openPath(mm([[101.2, pecY - 1.5], [100 + cw * 0.5, pecY + 1], [100 + cw * 0.88, pecY - 8], [100 + cw * 0.96, 101]])), w: 1.3, o: 0.05 + 0.6 * def, fine: true },
      // Deltoid-Brust-Furche
      { k: 'ao', d: openPath(mm([[100 + cw * 0.78, 90], [100 + cw * 0.9, 98], [100 + cw * 0.96, 104]])), w: 1.4, o: def * 0.5, fine: true },
    ];
    // Bauch
    const absW = 9.5 + 5 * s;
    const rows = [pecY + 4, 140, 157, 174];
    const abs: Mark[] = [];
    for (let r = 0; r < 3; r++) {
      abs.push({ k: 'hl', d: ell(m([100 + absW * 0.52, (rows[r] + rows[r + 1]) / 2 - 1]), absW * 0.4, (rows[r + 1] - rows[r]) * 0.34), o: absF * 0.7 });
      abs.push({ k: 'ao', d: openPath(mm([[101, rows[r + 1]], [100 + absW * 0.5, rows[r + 1] + 0.6], [100 + absW, rows[r + 1] - 1.6]])), w: 1.5, o: absF * 0.75, fine: true });
    }
    abs.push({ k: 'hl', d: ell(m([100 + absW * 0.45, 184]), absW * 0.36, 6), o: absF * 0.35 });
    abs.push({ k: 'ao', d: openPath(mm([[100 + absW + 1.5, pecY + 5], [100 + absW + 2, 150], [100 + absW - 0.5, 182], [104, 198]])), w: 1.5, o: absF * 0.65, fine: true });
    // Obliques + V-Linie
    const ox = b.torsoX(172);
    abs.push({ k: 'hl', d: ell(m([100 + ox - 5, 170]), 3.6, 9, 8 * side), o: def * 0.4 });
    abs.push({ k: 'ao', d: openPath(mm([[100 + b.torsoX(176) - 3, 176], [100 + b.hipW - 7, 190], [107, 204]])), w: 1.6, o: absF * 0.6 + def * 0.1, fine: true });
    // Serratus
    for (let r = 0; r < 3; r++) {
      const y = 116 + r * 7;
      const x = 100 + b.torsoX(y) - 5;
      abs.push({ k: 'hl', d: ell(m([x, y]), 3.4, 1.9, 28 * side), o: serF * 0.55 });
      abs.push({ k: 'ao', d: openPath(mm([[x + 3, y + 2.2], [x - 3, y + 4.6]])), w: 1.1, o: serF * 0.6, fine: true });
    }
    // Trapez von vorne
    const tr: Mark = { k: 'hl', d: ell(m([100 + nw + 8, 81 - 2 * s]), 6 + 2 * s, 2.4, 22 * side), o: 0.15 + 0.35 * def };
    torsoMuscle.push(...pec, ...abs, tr);
    torsoMarks.push(...pec, ...abs, tr);
    // Schlüsselbein + Grube darüber
    const cl: P[] = mm([[103, 83.5], [100 + nw + 6, 84.2], [100 + b.shW - 5, 86.5 + 4 * (1 - s)]]);
    torsoMarks.push({ k: 'hl', d: openPath(cl), w: 1.5, o: 0.25 + 0.4 * bone, fine: true });
    torsoMarks.push({ k: 'sh', d: openPath(cl.map((p) => [p[0], p[1] + 2] as P)), w: 1.4, o: 0.2 + 0.3 * bone, fine: true });
    torsoMarks.push({ k: 'sh', d: ell(m([100 + nw + 7, 81.5]), 5, 1.8, 6 * side), o: 0.35 * bone });
    // Rippen (mager)
    for (let r = 0; r < 4; r++) {
      const y = 113 + r * 7.5;
      const xo = 100 + b.torsoX(y + 6) - 1;
      const rib = mm([[lerp(100, xo, 0.42), y], [lerp(100, xo, 0.72), y + 2], [xo, y + 6]]);
      torsoMarks.push({ k: 'sh', d: openPath(rib), w: 1.9, o: ribF * 0.42, fine: true });
      torsoMarks.push({ k: 'hl', d: openPath(rib.map((p) => [p[0], p[1] - 2.1] as P)), w: 1.5, o: ribF * 0.35, fine: true });
    }
    torsoMarks.push({ k: 'sh', d: openPath(mm([[101.5, 117], [108, 126], [100 + b.torsoX(142) - 3, 143]])), w: 1.6, o: ribF * 0.35, fine: true });
  }
  torsoMarks.push({ k: 'ao', d: openPath([[100, pecY + 1], [100, 150], [100, 190]]), w: 1.6, o: absF * 0.7 + def * 0.15, fine: true });
  torsoMuscle.push(torsoMarks[torsoMarks.length - 1]);
  torsoMarks.push({ k: 'ao', d: ell([100, 83.2], 2.2, 1.4), o: 0.5, fine: true });
  torsoMarks.push({ k: 'ao', d: ell([100, 182.5], 1.2, 1.8), o: 0.7, fine: true });
  torsoMarks.push({ k: 'hl', d: ell([100, 179.6], 1.6, 0.7), o: 0.4, fine: true });
  // Schatten des Kopfes und der Arme auf dem Rumpf
  for (const ap of armPaths) torsoMarks.push({ k: 'ao', d: ap, o: 0.4, tf: 'translate(2 1.5)' });

  const armMarks = (arm: Limb): Mark[] => {
    const w = (d: number) => wAt(arm, d);
    return [
      { k: 'hl', d: limbEll(arm, 6, 0.2, 10 + 2 * s, w(6) * 0.55), o: 0.18 + 0.42 * def },
      { k: 'ao', d: openPath([lp(arm, -4, -0.05), lp(arm, 8, 0.1), lp(arm, 20, 0.3)]), w: 1.2, o: def * 0.3, fine: true },
      { k: 'ao', d: openPath([lp(arm, 16, -0.8), lp(arm, 27, -0.05), lp(arm, 18, 0.85)]), w: 1.4, o: def * 0.6, fine: true },
      { k: 'hl', d: limbEll(arm, 35, -0.3, 11, w(35) * 0.45), o: 0.08 + 0.5 * def },
      { k: 'sh', d: limbEll(arm, 49, -0.2, 4.5, 4), o: def * 0.45 },
      { k: 'ao', d: openPath([lp(arm, 26, 0.5), lp(arm, 40, 0.45), lp(arm, 50, 0.6)]), w: 1.2, o: def * 0.3, fine: true },
      { k: 'hl', d: limbEll(arm, 37, 0.65, 9, w(37) * 0.25), o: def * 0.3 },
      { k: 'hl', d: limbEll(arm, 56, 0.35, 2.6, 2.2), o: 0.15 + 0.3 * bone },
      { k: 'sh', d: openPath([lp(arm, 56, -0.7), lp(arm, 58, -0.1)]), w: 1.1, o: 0.35, fine: true },
      { k: 'hl', d: limbEll(arm, 72, 0.25, 10, w(72) * 0.5), o: 0.12 + 0.4 * def },
      { k: 'ao', d: openPath([lp(arm, 64, -0.3), lp(arm, 80, -0.2), lp(arm, 98, -0.35)]), w: 1.2, o: def * 0.45, fine: true },
    ];
  };
  const legMarks = (leg: Limb): Mark[] => {
    const w = (d: number) => wAt(leg, d);
    return [
      { k: 'hl', d: limbEll(leg, 32, 0.5, 18, w(32) * 0.33), o: 0.1 + 0.4 * def },
      { k: 'hl', d: limbEll(leg, 38, -0.05, 20, w(38) * 0.3), o: 0.14 + 0.36 * def },
      { k: 'ao', d: openPath([lp(leg, 16, 0.34), lp(leg, 40, 0.26), lp(leg, 62, 0.12)]), w: 1.3, o: def * 0.25, fine: true },
      { k: 'hl', d: limbEll(leg, 72, -0.5, 8, w(72) * 0.42), o: def * 0.6 },
      { k: 'ao', d: openPath([lp(leg, 52, -0.45), lp(leg, 66, -0.9), lp(leg, 80, -0.75), lp(leg, 86, -0.3)]), w: 1.2, o: def * 0.55, fine: true },
      { k: 'sh', d: limbEll(leg, 8, -0.75, 12, 3), o: 0.4 },
      { k: 'hl', d: limbEll(leg, 85, 0, 4, 3.6), o: 0.3 + 0.15 * bone },
      { k: 'sh', d: openPath([lp(leg, 90, -0.45), lp(leg, 92.5, 0), lp(leg, 90, 0.45)]), w: 1.4, o: 0.35, fine: true },
      { k: 'sh', d: openPath([lp(leg, 80, -0.5), lp(leg, 78, 0), lp(leg, 80, 0.5)]), w: 1.1, o: 0.15 + 0.2 * bone, fine: true },
      { k: 'hl', d: limbEll(leg, 110, -0.55, 12, w(110) * 0.35), o: 0.12 + 0.4 * def },
      { k: 'hl', d: limbEll(leg, 108, 0.55, 11, w(108) * 0.3), o: 0.08 + 0.3 * def },
      { k: 'sh', d: limbEll(leg, 128, -0.55, 6, 3), o: def * 0.4 },
      { k: 'hl', d: openPath([lp(leg, 96, 0.02), lp(leg, 150, -0.1)]), w: 1.6, o: 0.3, fine: true },
      { k: 'hl', d: limbEll(leg, 163, -0.7, 2, 1.6), o: 0.35, fine: true },
      { k: 'hl', d: limbEll(leg, 165, 0.7, 2, 1.6), o: 0.3, fine: true },
    ];
  };

  // ---------- Beine & Füße ----------
  // Verdeckte Haut braucht keine Muskel-Details (spart Elemente)
  const legsCovered = !!bottom && ['joggers_black', 'leggings_grey', 'track_pants'].includes(bottom.id);
  const torsoCovered = !!top && !['tank_black', 'stringer_black', 'vest_weighted', 'robe_champion'].includes(top.id);
  const armsCovered = !!top && ['hoodie_grey', 'compression_blue', 'track_jacket', 'robe_champion'].includes(top.id);
  const legNodes: ReactNode[] = L.map((leg, k) => part(`leg${k}`, legPaths[k], skinFill, sk.line, [...rim(legPaths[k]), ...(legsCovered ? [] : legMarks(leg))], skinPal));
  const footNodes: ReactNode[] = [];
  if (!shoes) {
    b.ankles.forEach((a, k) => {
      const side = k === 0 ? -1 : 1;
      const f = (x: number, y: number): P => [a[0] + x * side, y];
      const fp = footPts(a, side);
      const d = closedPath(fp);
      const toes: number[] = [-5.6, -1.3, 2.4, 5.8, 9.2];
      const marks: Mark[] = [
        { k: 'sh', d: ell(f(8 * side, 376), 4, 9, 15), o: 0.5 },
        { k: 'sh', d: ell(f(-8 * side, 376), 3, 8), o: 0.25 },
        { k: 'hl', d: ell(f(0, 370), 3.2, 6, -20 * side), o: 0.45 },
        { k: 'hl', d: ell(f(-5.6, 381), 2.2, 1.6), o: 0.4 },
        { k: 'sh', d: openPath([f(-8.6, 380.5), f(2, 381), f(11.6, 380.5)]), w: 1.4, o: 0.3 },
        { k: 'hl', d: limbEll(L[k], 164, -0.7, 2, 1.6), o: 0.4, fine: true },
        { k: 'hl', d: limbEll(L[k], 166, 0.7, 2, 1.6), o: 0.3, fine: true },
      ];
      const extra: ReactNode[] = [];
      toes.forEach((x, i) => {
        if (i > 0) extra.push(line(`tl${i}`, openPath([f(x - 1.9 + i * 0.1, 381.2), f(x - 1.9, 386)]), sk.ao, 0.7, 0.55));
        extra.push(<path key={`tn${i}`} d={ell(f(x, 383.4), i === 0 ? 1.5 : 1, 0.75)} fill={sk.hl} opacity={0.55} />);
      });
      footNodes.push(part(`ft${k}`, d, skinFill, sk.line, marks, skinPal, extra, 0.9, openPath([...fp.slice(2), fp[0]])));
    });
  }

  // ---------- Rumpf & Hals ----------
  const torsoNode = part('torso', tPath, skinFill, sk.line, [...rim(tPath, 0.9, 1.3), ...(torsoCovered ? [] : torsoMarks)], skinPal);
  const neckD = closedPath([[100 - nw, 52], [100 + nw, 52], [100 + nw, 66], [100 + nw + 4, 76], [100 + nw + 2, 82], [100 - nw - 2, 82], [100 - nw - 4, 76], [100 - nw, 66]]);
  const neckNode = (
    <g key="neck">
      <clipPath id={`${uid}cn`}>
        <path d={neckD} />
      </clipPath>
      <path d={neckD} fill={`url(#${uid}nk)`} />
      <g filter={FB} clipPath={`url(#${uid}cn)`}>
        <path d={closedPath([[100 + nw - 3, 54], [100 + nw + 1, 54], [100 + nw + 1, 68], [100 + nw + 5, 78], [100 + nw - 1, 74]])} fill={sk.sh} opacity={0.6} />
        <path d={ell([100, 62], nw + 1.5, 5.5)} fill={sk.ao} opacity={0.55} />
        <path d={closedPath([[100 - nw + 1, 56], [100 - nw + 3.5, 58], [100 - nw + 3, 70], [100 - nw + 1, 68]])} fill={sk.hl} opacity={0.35} />
      </g>
      <g filter={FF}>
        {line('scmL', openPath([[100 - nw + 1.2, 60], [97.5, 74], [98.2, 82]]), sk.hl, 1.5, 0.25 + 0.3 * s)}
        {line('scmR', openPath([[100 + nw - 1.2, 60], [102.5, 74], [101.8, 82]]), sk.sh, 1.5, 0.25 + 0.3 * s)}
        {line('adam', ell([100, 70.5], 1.3, 2), sk.hl, 1, 0.3 * bone)}
      </g>
      {line('neckL', openPath([[100 - nw, 56], [100 - nw - 0.1, 64], [100 - nw - 1.2, 69.5]]), sk.line, 0.9, 0.9)}
      {line('neckR', openPath([[100 + nw, 56], [100 + nw + 0.1, 64], [100 + nw + 1.2, 69.5]]), sk.line, 0.9, 0.9)}
    </g>
  );

  // ---------- Arme & Hände ----------
  const armNodes: ReactNode[] = A.map((arm, k) => part(`arm${k}`, armPaths[k], skinFill, sk.line, [...rim(armPaths[k]), ...(armsCovered ? [] : armMarks(arm))], skinPal));
  const handNodes: ReactNode[] = A.map((arm, k) => {
    const g = handGeo(arm);
    const hd = closedPath(g.hand);
    const th = closedPath(g.thumb);
    const k2 = g.len / 27;
    const fingers: ReactNode[] = [0.35, 0.0, -0.35].map((x, i) =>
      line(`f${i}`, openPath([g.loc(g.hw * x, 19 * k2), g.loc(g.hw * (x - 0.05), 22.5 * k2), g.loc(g.hw * (x - 0.12), 26 * k2)]), sk.ao, 0.6, 0.35),
    );
    const knuckles = line('kn', openPath([g.loc(g.hw * 0.9, 13.5 * k2), g.loc(0, 14.5 * k2), g.loc(-g.hw * 0.6, 14 * k2)]), sk.hl, 1.2, 0.45);
    return (
      <g key={`hand${k}`}>
        {part('h', hd, skinFill, sk.line, [
          { k: 'hl', d: ell(g.loc(g.hw * 0.25, 10 * k2), g.hw * 0.55, 5), o: 0.4 },
          { k: 'sh', d: ell(g.loc(-g.hw * 0.7, 12 * k2), g.hw * 0.5, 9), o: 0.35 },
          { k: 'sh', d: ell(g.loc(g.hw * 0.2, 25 * k2), g.hw * 0.8, 2.5), o: 0.35 },
        ], skinPal, [...fingers, knuckles], 0.9, openPath(g.hand.slice(1, -1)))}
        {part('t', th, sk.base, sk.line, [{ k: 'sh', d: th, o: 0.4, tf: 'translate(1.2 1)' }, { k: 'hl', d: th, o: 0.35, tf: 'translate(-1.2 -0.6)' }], skinPal, line('nail', openPath([g.loc(-g.hw * 0.95, 15 * k2), g.loc(-g.hw * 0.75, 18.5 * k2)]), sk.hl, 0.7, 0.4), 0.9, openPath(g.thumb.slice(1, 5)))}
      </g>
    );
  });

  // ---------- Oberteil ----------
  const topBody: ReactNode[] = [];
  const sleeves: ReactNode[] = [];
  const robeOver: ReactNode[] = [];
  const robeBack: ReactNode[] = [];
  if (top) {
    const c = top.color;
    const ac = top.accent;
    const pal = fabPal(c);
    const fill = `url(#${uid}${top.id})`;
    const ol = darken(c, 0.6);
    const tight = top.id === 'compression_blue';
    const hood = top.id === 'hoodie_grey';
    const jacket = top.id === 'track_jacket';
    const phantom = top.id === 'tee_phantom';
    const robe = top.id === 'robe_champion';
    const loose = hood ? 3.5 : tight ? 0.6 : jacket ? 2.6 : phantom ? 1.1 : 1.8;
    const hemY = hood ? 210 : tight ? 200 : jacket ? 208 : phantom ? 202 : 205;
    const seam = darken(c, 0.4);
    const shirtR = (): P[] => {
      const off = offsetOpen(b.torsoR.slice(0, 6), loose + 0.8).slice(1);
      const offTop = offsetOpen(b.torsoR.slice(0, 6), hood ? 3 : jacket ? 1.6 : 0.9).slice(1);
      off[0] = offTop[0];
      off[1] = offTop[1];
      const hx = Math.max(b.torsoX(hemY - 4) + loose * 0.6, b.hipW + 4.6);
      return [[100 + nw + 2.5, 75], ...off, [100 + Math.max(b.torsoX(186) + loose, b.hipW + 3.6), 186], [100 + hx, hemY - 5], [100 + hx - 0.3, hemY]];
    };
    const bodyPts = (neckDip: number): P[] => {
      const r = shirtR();
      const l = [...r].reverse().map((p) => mx(p, -1));
      const hemR = r[r.length - 1];
      return [...r, [lerp(hemR[0], 100, 0.5), hemY + 0.6], [100, hemY + 1], [lerp(200 - hemR[0], 100, 0.5), hemY + 0.6], ...l, [100 - nw - 1, 80], [100, 78 + neckDip], [100 + nw + 1, 80]];
    };
    // Gemeinsame Stofffalten am Rumpf
    const folds: Mark[] = [];
    for (const side of [-1, 1]) {
      const m = (p: P) => mx(p, side);
      const sx = b.torsoX(112);
      folds.push({ k: 'sh', d: openPath([m([100 + sx - 1, 112]), m([100 + sx - 7, 126]), m([100 + sx - 9, 136])]), w: 1.8, o: 0.4, fine: true });
      folds.push({ k: 'hl', d: openPath([m([100 + sx - 3, 111]), m([100 + sx - 9, 124])]), w: 1.6, o: 0.3, fine: true });
      folds.push({ k: 'sh', d: openPath([m([100 + b.torsoX(180) - 1, 178]), m([100 + b.torsoX(180) - 9, 190])]), w: 1.8, o: 0.35, fine: true });
      folds.push({ k: 'sh', d: openPath([m([100 + 4, hemY - 6]), m([100 + 10, hemY - 14])]), w: 1.4, o: 0.3, fine: true });
    }
    // Stoff liegt auf der Brust auf
    const drape: Mark[] = [
      { k: 'sh', d: closedPath([[100 - cw * 0.9, pecY - 6], [100, pecY + 1], [100 + cw * 0.9, pecY - 6], [100 + cw * 0.8, pecY + 8], [100, pecY + 9], [100 - cw * 0.8, pecY + 8]]), o: 0.15 + 0.4 * def },
      { k: 'hl', d: ell([100 - cw * 0.45, 99 + 3 * s], cw * 0.3, 5 + 2 * s), o: 0.15 + 0.3 * def },
      { k: 'hl', d: ell([100 + cw * 0.45, 99 + 3 * s], cw * 0.3, 5 + 2 * s), o: 0.1 + 0.2 * def },
    ];

    if (top.id === 'tank_black') {
      const r: P[] = [
        [100 + nw + 2, 76],
        [100 + nw + 7 + 3 * s, 77],
        [100 + nw + 7.5 + 4 * s, 90],
        [100 + 16 + 9 * s, 108],
        [100 + 20 + 12 * s, 122],
        [100 + 22.5 + 12.5 * s + 1.5, 136],
        [100 + 19.5 + 7.5 * s + 2, 168],
        [100 + Math.max(b.torsoX(198) + 2, b.hipW + 4.6), 198],
        [100 + Math.max(b.torsoX(198) + 1.8, b.hipW + 4.4), 203],
      ];
      const l = [...r].reverse().map((p) => mx(p, -1));
      const d = closedPath([...r, [100, 204], ...l, [100 - nw - 6, 88], [100, 97 + 2 * s], [100 + nw + 6, 88]]);
      const trims: ReactNode[] = [line('trim', openPath([[100 - nw - 6.5, 88], [100, 97.5 + 2 * s], [100 + nw + 6.5, 88]]), ac, 1.5, 0.9)];
      for (const side of [-1, 1]) {
        trims.push(line(`ah${side}`, openPath([mx([100 + nw + 7.5 + 4 * s, 90], side), mx([100 + 16 + 9 * s, 108], side), mx([100 + 20 + 12 * s, 122], side)]), ac, 1.4, 0.9));
      }
      topBody.push(part('top', d, fill, ol, [...rim(d, 1, 1.2), ...drape, ...folds, ...torsoMuscle.filter((x) => x.k === 'sh' && !x.fine)], pal, trims));
    } else if (top.id === 'stringer_black') {
      // Stringer: sehr tiefe Armausschnitte, dünne Träger, viel Seite frei
      const sx = (y: number) => b.torsoX(y);
      const r: P[] = [
        [100 + nw + 2.5, 76],
        [100 + nw + 6.2 + 1.5 * s, 76.6],
        [100 + nw + 6.8 + 2.5 * s, 92],
        [100 + nw + 8 + 3.5 * s, 106],
        [100 + cw * 0.64, 136],
        [100 + sx(160) + 1.4, 160],
        [100 + sx(178) + 1.8, 178],
        [100 + Math.max(sx(198) + 2, b.hipW + 4.6), 198],
        [100 + Math.max(sx(198) + 1.8, b.hipW + 4.4), 203],
      ];
      const l = [...r].reverse().map((p) => mx(p, -1));
      const neckPts: P[] = [[100 - nw - 3.4, 92], [100, 105 + 4 * s], [100 + nw + 3.4, 92]];
      const d = closedPath([...r, [100, 204], ...l, ...neckPts]);
      const hx = Math.max(sx(200) + 2.2, b.hipW + 4.8);
      const trims: ReactNode[] = [
        line('trim', openPath([[100 - nw - 3.9, 91], [100, 105.6 + 4 * s], [100 + nw + 3.9, 91]]), ac, 1.3, 0.95),
        <rect key="hem" x={r1(100 - hx)} y={199.6} width={r1(2 * hx)} height={4} fill={ac} />,
        line('hemS', openPath([[100 - hx, 199.9], [100 + hx, 199.9]]), darken(ac, 0.4), 0.6, 0.6),
      ];
      for (const side of [-1, 1]) {
        trims.push(line(`ah${side}`, openPath(r.slice(1, 6).map((p) => mx([p[0] - 0.6, p[1]], side))), ac, 1.2, 0.95));
      }
      const marks: Mark[] = [...rim(d, 1, 1.2), ...drape, ...torsoMuscle.filter((x) => !x.fine || x.k === 'ao')];
      marks.push({ k: 'sh', d: openPath([[100 - 6, 182], [100 - 12, 196]]), w: 1.6, o: 0.3, fine: true }, { k: 'sh', d: openPath([[100 + 6, 182], [100 + 12, 196]]), w: 1.6, o: 0.3, fine: true });
      topBody.push(part('top', d, fill, ol, marks, pal, trims));
    } else if (top.id === 'vest_weighted') {
      // Gewichtsweste: dicke Platten mit Taschen und Riemen, direkt auf der Haut
      const sx = (y: number) => b.torsoX(y);
      const r: P[] = [
        [100 + nw + 2, 73.5],
        [100 + nw + 11 + 6 * s, 76.5 - 3 * s],
        [100 + nw + 13.5 + 8 * s, 88],
        [100 + sx(118) + 2.4, 117],
        [100 + sx(145) + 2.8, 145],
        [100 + sx(172) + 2.8, 172],
        [100 + sx(178) + 2.4, 179],
      ];
      const l = [...r].reverse().map((p) => mx(p, -1));
      const d = closedPath([...r, [100 + cw * 0.5, 180.6], [100, 181.2], [100 - cw * 0.5, 180.6], ...l, [100 - nw - 4.5, 84], [100, 91 + 2 * s], [100 + nw + 4.5, 84]]);
      const extra: ReactNode[] = [];
      const pk = darken(c, 0.12);
      const blocks: string[] = [];
      const flaps: string[] = [];
      const molle: string[] = [];
      for (const side of [-1, 1]) {
        for (const [y0, y1] of [[97 + 2 * s, 133], [138, 172]]) {
          const xo = Math.min(sx(y0), sx(y1)) - 3.2;
          const xi = 2.6;
          const q = (x: number, y: number) => mx([100 + x, y], side);
          blocks.push(polyPath([q(xi + 1.2, y0), q(xo - 1.2, y0), q(xo, y0 + 1.2), q(xo, y1 - 1.2), q(xo - 1.2, y1), q(xi + 1.2, y1), q(xi, y1 - 1.2), q(xi, y0 + 1.2)]));
          flaps.push(polyPath([q(xi + 0.6, y0 + 0.6), q(xo - 0.6, y0 + 0.6), q(xo - 0.3, y0 + 6.5), q(xi + 0.3, y0 + 6.5)]));
          for (let yy = y0 + 10; yy < y1 - 2; yy += 5) molle.push(openPath([q(xi + 1.5, yy), q(xo - 1.5, yy)]));
        }
      }
      extra.push(<path key="blk" d={blocks.join('')} fill={pk} stroke={ol} strokeWidth={0.7} />);
      extra.push(<path key="blkS" d={blocks.join('')} fill="none" stroke={pal.ao} strokeWidth={2.4} opacity={0.35} transform="translate(0.6 1)" />);
      extra.push(<path key="flp" d={flaps.join('')} fill={darken(c, 0.04)} stroke={darken(c, 0.5)} strokeWidth={0.5} />);
      extra.push(<path key="mol" d={molle.join('')} fill="none" stroke={darken(c, 0.45)} strokeWidth={0.9} strokeDasharray="2.2 1.3" />);
      // Querriemen mit Steckschnallen
      for (const y of [150, 168]) {
        const hx = sx(y) + 3;
        extra.push(<path key={`str${y}`} d={polyPath([[100 - hx, y - 2.8], [100 + hx, y - 2.8], [100 + hx, y + 2.8], [100 - hx, y + 2.8]])} fill={darken(c, 0.35)} />);
        extra.push(line(`strH${y}`, openPath([[100 - hx, y - 2.2], [100 + hx, y - 2.2]]), lighten(c, 0.15), 0.5, 0.6));
        extra.push(<path key={`bk${y}`} d={polyPath([[95, y - 3.6], [105, y - 3.6], [105.8, y], [105, y + 3.6], [95, y + 3.6], [94.2, y]])} fill={ac} stroke={darken(ac, 0.55)} strokeWidth={0.6} />);
        extra.push(line(`bkL${y}`, openPath([[100, y - 3.2], [100, y + 3.2]]), darken(ac, 0.5), 0.6, 0.9));
        extra.push(line(`bkH${y}`, openPath([[96, y - 2.4], [104, y - 2.4]]), lighten(ac, 0.5), 0.6, 0.8));
      }
      // gepolsterte Schulterriemen
      const marks: Mark[] = [...rim(d, 1, 1.3)];
      for (const side of [-1, 1]) {
        marks.push({ k: 'hl', d: ell(mx([100 + nw + 8 + 4 * s, 79 - 1.5 * s], side), 4 + 2 * s, 2, 18 * side), o: 0.5 });
        marks.push({ k: 'sh', d: openPath([mx([100 + sx(150) + 2, 120], side), mx([100 + sx(150) + 2, 176], side)]), w: 3, o: 0.5 });
      }
      marks.push({ k: 'ao', d: openPath([[100 - cw, 181], [100, 182], [100 + cw, 181]]), w: 2.4, o: 0.4 });
      topBody.push(part('top', d, fill, ol, marks, pal, extra, 1.1));
    } else if (robe) {
      // Champions-Mantel: offen, Satin, goldener Schalkragen und Saum
      const hemOut = b.hipW + 9 + 2 * s;
      const hemIn = 12 + 4 * s;
      const outerR: P[] = [
        [100 + nw + 1, 69],
        [100 + nw + 9 + 8 * s, 77.5 - 4 * s],
        [100 + b.shW + 3.5, 89 + 5 * (1 - s)],
        ...offsetOpen(b.torsoR.slice(2, 6), 3.6).slice(1),
        [100 + b.hipW + 6.5, 202],
        [100 + hemOut, 254],
      ];
      const innerR: P[] = [[100 + nw + 1, 69], [100 + nw + 2.5, 78], [100 + nw + 6, 92], [100 + cw * 0.56, 120], [100 + cw * 0.58, 160], [100 + hemIn - 0.5, 215], [100 + hemIn, 257]];
      const panel = (side: number) => [...outerR, [100 + lerp(hemOut, hemIn, 0.5), 257] as P, ...innerR.slice(1).reverse()].map((p) => mx(p, side));
      const d = closedPath(panel(1)) + closedPath(panel(-1));
      const marks: Mark[] = [...rim(d, 1, 1.2)];
      const extra: ReactNode[] = [];
      for (const side of [-1, 1]) {
        const m = (p: P) => mx(p, side);
        // Satinglanz: lange helle Bahnen, tiefe Falten im Rockteil
        marks.push({ k: 'hl', d: openPath([m([100 + cw * 0.85, 100]), m([100 + b.torsoX(140) - 2, 140]), m([100 + b.hipW + 1, 200]), m([100 + hemOut - 7, 250])]), w: 3.2, o: 0.55 });
        marks.push({ k: 'hl', d: openPath([m([100 + cw * 0.8, 104]), m([100 + b.torsoX(140) - 3, 140]), m([100 + b.hipW, 196])]), w: 1.2, o: 0.6, fine: true });
        marks.push({ k: 'sh', d: openPath([m([100 + b.torsoX(150), 150]), m([100 + b.hipW + 3, 205]), m([100 + hemOut - 2, 254])]), w: 3, o: 0.5 });
        for (const [x0, x1, o] of [[hemIn + 5, hemIn + 7, 0.5], [lerp(hemIn, hemOut, 0.55), lerp(hemIn, hemOut, 0.62), 0.45]] as number[][]) {
          marks.push({ k: 'sh', d: openPath([m([100 + x0, 205]), m([100 + x1, 256])]), w: 1.8, o, fine: true });
          marks.push({ k: 'hl', d: openPath([m([100 + x0 + 2.2, 210]), m([100 + x1 + 2.4, 255])]), w: 1.4, o: 0.45, fine: true });
        }
        marks.push({ k: 'sh', d: openPath([m([100 + cw * 0.62, 186]), m([100 + b.hipW + 2, 188])]), w: 2, o: 0.4, fine: true });
        extra.push(line(`hm${side}`, openPath([m([100 + hemOut + 1, 254]), m([100 + lerp(hemOut, hemIn, 0.5), 257]), m([100 + hemIn - 1, 257])]), ac, 7, 1));
        extra.push(line(`hmS${side}`, openPath([m([100 + hemOut + 1, 250.6]), m([100 + lerp(hemOut, hemIn, 0.5), 253.6]), m([100 + hemIn - 1, 253.6])]), darken(ac, 0.45), 0.6, 0.8));
        // Schalkragen (gold), wird nach Kette gezeichnet
        const ws = [3.5, 4.5, 6, 5.5, 4.4, 3.8, 3.6];
        const outerC = offsetVar(innerR, ws);
        const col = closedPath([...innerR, ...outerC.reverse()].map(m));
        robeOver.push(part(`rc${side}`, col, `url(#${uid}rc)`, darken(ac, 0.6), [{ k: 'sh', d: openPath(offsetVar(innerR, ws.map((w) => w - 0.6)).map(m)), w: 1.4, o: 0.5, fine: true }, { k: 'hl', d: openPath(offsetVar(innerR, ws.map((w) => w * 0.35)).slice(1, 6).map(m)), w: 1.1, o: 0.7, fine: true }], fabPal(ac), null, 0.7));
      }
      topBody.push(part('top', d, fill, ol, marks, pal, extra));
      // Rückenteil (zwischen den Beinen sichtbar) und Kragen hinter dem Nacken
      const backD = closedPath([[100 - b.hipW - 6, 200], [100 + b.hipW + 6, 200], [100 + hemOut - 2, 251], [100, 253], [100 - hemOut + 2, 251]]);
      robeBack.push(<path key="rb" d={backD} fill={darken(c, 0.45)} />);
      robeBack.push(<path key="rbn" d={closedPath([[100 - nw - 5, 75], [100 - nw - 3, 63], [100, 60.5], [100 + nw + 3, 63], [100 + nw + 5, 75], [100, 72]])} fill={darken(ac, 0.2)} stroke={darken(ac, 0.6)} strokeWidth={0.7} />);
    } else if (jacket) {
      // Trainingsjacke: Reißverschluss, Stehkragen, Bündchen
      const d = closedPath(bodyPts(4));
      const zc = '#c9cbd0';
      const extra: ReactNode[] = [
        <rect key="hem" x={r1(100 - b.torsoX(206) - 8)} y={hemY - 5.5} width={r1(2 * (b.torsoX(206) + 8))} height={6} fill={darken(c, 0.18)} />,
        line('hemS', openPath([[100 - b.torsoX(206) - 8, hemY - 5.2], [100 + b.torsoX(206) + 8, hemY - 5.2]]), pal.sh, 1.2, 0.6),
        line('zipT', openPath([[100, 80], [100, hemY]]), darken(c, 0.55), 2.2, 1),
        line('zip', openPath([[100, 80], [100, hemY]]), zc, 1.1, 0.75, '0.45 0.65'),
        <path key="pull" d={polyPath([[99.2, 96], [101.4, 96], [101.8, 102.5], [98.8, 102.5]])} fill={zc} stroke={darken(c, 0.5)} strokeWidth={0.4} />,
      ];
      for (let r = 0; r < 10; r++) {
        const x = lerp(100 - b.torsoX(206) - 6, 100 + b.torsoX(206) + 6, r / 9);
        if (Math.abs(x - 100) > 2) extra.push(line(`hr${r}`, openPath([[x, hemY - 4.5], [x, hemY - 0.5]]), pal.sh, 0.5, 0.6));
      }
      for (const side of [-1, 1]) {
        const m = (p: P) => mx(p, side);
        extra.push(line(`pk${side}`, openPath([m([100 + 7 + 2 * s, 182]), m([100 + 13 + 4 * s, 197])]), darken(c, 0.5), 1, 0.9));
        extra.push(line(`ps${side}`, openPath([m([100 + b.torsoX(112) - 2, 104]), m([100 + 4, 96])]), ac, 1.2, 0.9));
        extra.push(line(`pss${side}`, openPath([m([100 + b.torsoX(112) - 1.5, 107]), m([100 + 4, 99])]), ac, 1.2, 0.9));
      }
      topBody.push(part('top', d, fill, ol, [...rim(d, 1, 1.2), ...drape, ...folds], pal, extra));
      const colD = [-1, 1].map((side) => closedPath([[100.3, 74], [100 + nw + 2.4, 68.5], [100 + nw + 4.4, 81], [100 + nw + 3, 84], [100.3, 86.5]].map((p) => mx(p as P, side)))).join('');
      topBody.push(part('collar', colD, fill, ol, [...rim(colD, 1, 0.6), { k: 'ao', d: openPath([[100 - nw - 4, 84.5], [100, 87.5], [100 + nw + 4, 84.5]]), w: 2.2, o: 0.4 }], pal, [
        line('cTop', openPath([[100.3, 74.6], [100 + nw + 2.4, 69.3]]), ac, 0.9, 0.9),
        line('cTop2', openPath([[99.7, 74.6], [100 - nw - 2.4, 69.3]]), ac, 0.9, 0.9),
      ], 0.8));
    } else if (hood) {
      const d = closedPath(bodyPts(6));
      const pw = 15 + 6 * s;
      const pocket = closedPath([[100 - pw + 4, 162], [100 + pw - 4, 162], [100 + pw + 1, 196], [100 - pw - 1, 196]]);
      const extra: ReactNode[] = [
        <path key="pk" d={pocket} fill={darken(c, 0.08)} stroke={ol} strokeWidth={0.7} />,
        line('pkS', openPath([[100 - pw + 4, 163.5], [100 + pw - 4, 163.5]]), pal.sh, 1.6, 0.5),
        line('pkSeam', openPath([[100 - pw + 5, 164.5], [100 + pw - 5, 164.5]]), seam, 0.5, 0.8, '1.2 1'),
        <rect key="hem" x={r1(100 - b.torsoX(206) - 8)} y={203} width={r1(2 * (b.torsoX(206) + 8))} height={7} fill={darken(c, 0.12)} />,
        line('hemS', openPath([[100 - b.torsoX(206) - 8, 203.4], [100 + b.torsoX(206) + 8, 203.4]]), pal.sh, 1.4, 0.6),
      ];
      for (let r = 0; r < 12; r++) extra.push(line(`hr${r}`, openPath([[100 - pw - 8 + r * ((2 * pw + 16) / 11), 204.5], [100 - pw - 8 + r * ((2 * pw + 16) / 11), 209]]), pal.sh, 0.6, 0.6));
      topBody.push(part('top', d, fill, ol, [...rim(d, 1, 1.3), ...drape, ...folds], pal, extra));
      const hoodD = closedPath([[100 - nw - 14, 90], [100 - nw - 10, 70], [100, 64], [100 + nw + 10, 70], [100 + nw + 14, 90], [100 + nw + 4, 96], [100, 99], [100 - nw - 4, 96]]);
      const hole = closedPath([[100 - nw - 1.5, 68], [100 + nw + 1.5, 68], [100 + nw + 2, 82], [100, 93], [100 - nw - 2, 82]]);
      const hid = `${uid}c${clipN++}`;
      topBody.push(
        <g key="hood">
          <clipPath id={hid}>
            <path d={hoodD + hole} clipRule="evenodd" />
          </clipPath>
          <path d={hoodD + hole} fill={darken(c, 0.08)} fillRule="evenodd" stroke={ol} strokeWidth={0.9} paintOrder="stroke" />
          <g clipPath={`url(#${hid})`}>
            {renderMarks('hm', [...rim(hoodD, 1, 0.8), { k: 'ao', d: hole, w: 5, o: 0.7 }, { k: 'hl', d: ell([100 - nw - 8, 78], 3, 8, 20), o: 0.4 }, { k: 'hl', d: ell([100 + nw + 8, 78], 3, 8, -20), o: 0.2 }], pal)}
          </g>
          {line('cordL', openPath([[97, 91], [96.6, 104], [96.2, 115]]), lighten(c, 0.6), 1.2, 1)}
          {line('cordR', openPath([[103, 91], [103.4, 103], [103.8, 113]]), lighten(c, 0.6), 1.2, 1)}
          <circle cx={96.2} cy={116} r={1.1} fill={lighten(c, 0.6)} />
          <circle cx={103.8} cy={114} r={1.1} fill={lighten(c, 0.6)} />
        </g>,
      );
    } else {
      const jersey = top.id === 'jersey_red';
      const dip = jersey ? 13 : tight ? 4 : phantom ? 4.5 : 6;
      const d = closedPath(bodyPts(dip));
      const extra: ReactNode[] = [];
      const neckLine = openPath([[100 - nw - 1.5, 80], [100, 78 + dip], [100 + nw + 1.5, 80]]);
      extra.push(line('neckSh', neckLine, pal.ao, 3, 0.35));
      extra.push(line('neckBand', neckLine, jersey ? ac : darken(c, 0.12), jersey ? 2.4 : 2, 1));
      extra.push(line('neckSeam', openPath([[100 - nw - 1.8, 82], [100, 80 + dip], [100 + nw + 1.8, 82]]), seam, 0.45, 0.8, '1 0.9'));
      let marks: Mark[] = [...rim(d, 1, 1.2)];
      if (tight) {
        marks = [...marks, ...torsoMuscle];
        for (const side of [-1, 1]) {
          const m = (p: P) => mx(p, side);
          extra.push(line(`cs${side}`, openPath([m([100 + cw - 2, 106]), m([100 + b.torsoX(140) - 4, 140]), m([100 + b.torsoX(170) - 3, 170]), m([100 + b.torsoX(196) - 2, 198])]), ac, 0.9, 0.85));
        }
        extra.push(<rect key="hem" x={r1(100 - b.torsoX(198) - 6)} y={197} width={r1(2 * (b.torsoX(198) + 6))} height={3.5} fill={darken(c, 0.2)} />);
      } else if (phantom) {
        // eng: Brust und Bauch zeichnen sich ab, wenige Falten
        marks = [...marks, ...drape, ...folds.filter((_, i) => i % 4 !== 3), ...torsoMuscle.filter((x) => x.k === 'hl' && !x.fine).map((x) => ({ ...x, o: x.o * 0.7 }))];
        extra.push(line('hemSeam', openPath([[100 - b.torsoX(200) - 8, hemY - 2.2], [100 + b.torsoX(200) + 8, hemY - 2.2]]), seam, 0.5, 0.8, '1.2 1'));
        // Emblem: stilisierter Blitz über einem Schriftzug-Balken (keine echte Schrift)
        const sc = 1 + 0.3 * s;
        const em = (pts: P[]) => polyPath(pts.map(([x, y]) => [100 + x * sc, 104 + 4 * s + y * sc] as P));
        const bolt: P[] = [[2.2, -10], [-5.2, 1.4], [-0.6, 1.4], [-2.6, 10.5], [5.2, -1.8], [0.6, -1.8], [3.6, -10]];
        const bars: string[] = [];
        for (let i = 0; i < 7; i++) {
          const x0 = -11.6 + i * 3.4;
          bars.push(em([[x0, 13.6], [x0 + 2.7, 13.6], [x0 + 2.7, 16.4], [x0, 16.4]]));
        }
        extra.push(<path key="emS" d={em(bolt) + bars.join('')} fill={pal.ao} opacity={0.45} transform="translate(0.6 0.8)" />);
        extra.push(<path key="em" d={em(bolt) + bars.join('')} fill={ac} />);
        extra.push(<path key="emH" d={em([[2.2, -10], [3.6, -10], [0.6, -1.8], [-0.4, -1.8]])} fill={lighten(ac, 0.45)} opacity={0.7} />);
        extra.push(line('emL', openPath([[100 - 12 * sc, 104 + 4 * s + 19 * sc], [100 + 12 * sc, 104 + 4 * s + 19 * sc]]), ac, 0.7, 0.8));
      } else {
        marks = [...marks, ...drape, ...folds];
        extra.push(line('hemSeam', openPath([[100 - b.torsoX(200) - 8, hemY - 2.2], [100 + b.torsoX(200) + 8, hemY - 2.2]]), seam, 0.5, 0.8, '1.2 1'));
      }
      if (jersey) {
        for (const side of [-1, 1]) {
          const st: P[] = [mx([100 + cw - 1, 110], side), mx([100 + b.torsoX(150) - 1, 150], side), mx([100 + b.torsoX(202) + 2, 205], side), mx([100 + b.torsoX(202) - 3.5, 205], side), mx([100 + b.torsoX(150) - 5, 150], side), mx([100 + cw - 5, 112], side)];
          extra.push(<path key={`jst${side}`} d={polyPath(st)} fill={ac} opacity={0.95} />);
        }
        // Rückennummer-Stil vorne: eine „7“ als Pfad
        const sc = 0.9 + 0.25 * s;
        const n7 = (pts: P[]) => polyPath(pts.map(([x, y]) => [100 + x * sc, 122 + y * sc] as P));
        const seven: P[] = [[-8, 0], [8, 0], [8, 4.6], [1.6, 28], [-3.6, 28], [2.4, 4.6], [-8, 4.6]];
        extra.push(<path key="n7s" d={n7(seven)} fill="none" stroke={pal.ao} strokeWidth={2.4} opacity={0.35} transform="translate(0.8 0.8)" />);
        extra.push(<path key="n7" d={n7(seven)} fill={ac} stroke={darken(c, 0.35)} strokeWidth={0.7} strokeLinejoin="round" />);
      }
      if (!tight && !jersey) {
        for (const side of [-1, 1]) extra.push(line(`ss${side}`, openPath([mx([100 + b.torsoX(112) + 1.8, 112], side), mx([100 + b.torsoX(160) + 2.5, 160], side), mx([100 + b.hipW + 4, 200], side)]), seam, 0.45, 0.6, '1.2 1'));
      }
      topBody.push(part('top', d, fill, ol, marks, pal, extra));
    }

    const sleeveTo: number = ({ tee_basic: 30, jersey_red: 24, tee_phantom: 27, tank_black: 0, stringer_black: 0, vest_weighted: 0, robe_champion: 0 } as Record<string, number>)[top.id] ?? 111;
    if (robe) {
      // weite Ärmel, die zum Handgelenk hin aufgehen
      const padF = (d: number) => lerp(2.6, 7, smooth(5, 100, d));
      A.forEach((arm, k) => {
        const d = closedPath(limbOutline(arm, -11, 100, padF, 'round', 'flat'));
        const marks: Mark[] = [
          ...rim(d),
          { k: 'hl', d: openPath([lp(arm, -2, 0.4), lp(arm, 40, 0.75), lp(arm, 95, 1.1)]), w: 3, o: 0.5 },
          { k: 'hl', d: openPath([lp(arm, 4, 0.5), lp(arm, 40, 0.8), lp(arm, 90, 1.1)]), w: 1.1, o: 0.6, fine: true },
          { k: 'sh', d: openPath([lp(arm, 46, -1.6), lp(arm, 56, -0.3), lp(arm, 60, 1)]), w: 2, o: 0.55, fine: true },
          { k: 'sh', d: openPath([lp(arm, 66, -1.8), lp(arm, 92, -1.6)]), w: 2.6, o: 0.45 },
          { k: 'sh', d: openPath([lp(arm, 70, 0.2), lp(arm, 93, 0)]), w: 1.4, o: 0.35, fine: true },
        ];
        sleeves.push(part(`sl${k}`, d, fill, ol, marks, pal));
        const cd = closedPath(limbOutline(arm, 93.5, 100, (x) => padF(x) + 0.3, 'flat', 'flat'));
        sleeves.push(part(`cf${k}`, cd, `url(#${uid}rc)`, darken(ac, 0.6), [...rim(cd, 0.8, 0.5)], fabPal(ac), line('cfl', openPath([lp(arm, 95, 1.6), lp(arm, 95, -1.6)]), lighten(ac, 0.5), 0.6, 0.7), 0.7));
      });
    }
    if (sleeveTo > 0) {
      A.forEach((arm, k) => {
        const pad = tight ? 0.7 : hood ? 3 : jacket ? 1.8 : phantom ? 0.8 : 1.1;
        const d = closedPath(limbOutline(arm, hood ? -8 : -9.5, sleeveTo, pad, 'round', 'flat'));
        let marks: Mark[] = [...rim(d)];
        const extra: ReactNode[] = [];
        if (hood || jacket) {
          marks = marks.concat([
            { k: 'sh', d: openPath([lp(arm, 50, -1.1), lp(arm, 55, -0.3), lp(arm, 59, 0.6)]), w: 1.8, o: 0.6, fine: true },
            { k: 'hl', d: openPath([lp(arm, 47, -1), lp(arm, 52, -0.2)]), w: 1.4, o: 0.4, fine: true },
            { k: 'sh', d: openPath([lp(arm, 60, -0.9), lp(arm, 63, 0.4)]), w: 1.6, o: 0.45, fine: true },
            { k: 'sh', d: openPath([lp(arm, 92, -0.9), lp(arm, 97, 0.2)]), w: 1.6, o: 0.5, fine: true },
            { k: 'sh', d: openPath([lp(arm, 18, -0.9), lp(arm, 24, 0.1)]), w: 1.6, o: 0.4, fine: true },
            { k: 'hl', d: limbEll(arm, 8, 0.15, 12, 7 + 4 * s), o: 0.35 },
          ]);
          if (jacket) {
            for (const f of [0.42, 0.78]) extra.push(line(`stp${f}`, openPath([lp(arm, -5, f + 0.05), lp(arm, 20, f), lp(arm, 55, f), lp(arm, 80, f), lp(arm, 103, f)]), ac, 1.3, 0.95));
          } else extra.push(line('sseam', openPath([lp(arm, -2, -1.15), lp(arm, 6, -0.4), lp(arm, 8, 0.5), lp(arm, 4, 1.2)]), seam, 0.5, 0.7, '1.2 1'));
        } else if (tight) {
          marks = marks.concat(armMarks(arm).filter((x) => x.k !== 'sh' || x.fine));
          extra.push(line('cseam', openPath([lp(arm, 0, 0.9), lp(arm, 30, 0.9), lp(arm, 60, 0.9), lp(arm, 106, 0.85)]), ac, 0.9, 0.85));
        } else {
          if (phantom) marks = marks.concat(armMarks(arm).filter((x) => x.k === 'hl' && !x.fine).map((x) => ({ ...x, o: x.o * 0.6 })));
          marks = marks.concat([
            { k: 'hl', d: limbEll(arm, 6, 0.15, 10 + 2 * s, wAt(arm, 6) * 0.6), o: 0.25 + 0.25 * def },
            { k: 'sh', d: openPath([lp(arm, 8, -1.1), lp(arm, 16, -0.2)]), w: 1.6, o: 0.45, fine: true },
            { k: 'sh', d: openPath([lp(arm, 18, -1.1), lp(arm, sleeveTo - 3, -0.3)]), w: 1.4, o: 0.35, fine: true },
          ]);
          extra.push(line('sseam', openPath([lp(arm, -1, -1.15), lp(arm, 6, -0.4), lp(arm, 8, 0.5), lp(arm, 4, 1.2)]), seam, 0.5, 0.7, '1.2 1'));
        }
        sleeves.push(part(`sl${k}`, d, fill, ol, marks, pal, extra));
        // Bündchen / Saum
        const cuffFrom = hood ? 102 : jacket ? 103 : tight ? 106 : sleeveTo - 3.5;
        const cuffTo = hood ? 112 : jacket ? 111 : tight ? 112 : sleeveTo;
        const cuffPad = hood ? 1.8 : jacket ? 1.5 : tight ? 1.1 : phantom ? 1.1 : 1.4;
        const cd = closedPath(limbOutline(arm, cuffFrom, cuffTo, cuffPad, 'flat', 'flat'));
        const cuffCol = top.id === 'jersey_red' ? ac : hood ? ac : jacket ? darken(c, 0.18) : darken(c, 0.12);
        sleeves.push(part(`cf${k}`, cd, cuffCol, ol, [...rim(cd, 0.8, 0.5)], fabPal(cuffCol), phantom ? line('cfa', openPath([lp(arm, cuffFrom + 0.4, 1.3), lp(arm, cuffFrom + 0.4, -1.3)]), ac, 0.8, 0.9) : hood || jacket ? [0.25, 0.5, 0.75].map((t) => line(`cr${t}`, openPath([lp(arm, lerp(cuffFrom, cuffTo, t), 1.25), lp(arm, lerp(cuffFrom, cuffTo, t), -1.25)]), darken(cuffCol, 0.3), 0.5, 0.6)) : null, 0.7));
      });
    }
  }

  // ---------- Hose / Unterhose ----------
  const bottomNodes: ReactNode[] = [];
  {
    const it = bottom;
    const id = it ? it.id : 'underwear';
    const color = it ? it.color : '#232327';
    const ac = it ? it.accent : '#3a3a40';
    const pal = fabPal(color);
    const fill = it ? `url(#${uid}${it.id})` : color;
    const ol = darken(color, 0.6);
    const seam = lighten(color, 0.18);
    const cfg: Record<string, { wy: number; to: number; pad: number }> = {
      underwear: { wy: 189, to: 16, pad: 0.8 },
      shorts_basic: { wy: 186, to: 58, pad: 2.8 },
      shorts_red: { wy: 186, to: 42, pad: 2.6 },
      joggers_black: { wy: 185, to: 164, pad: 3 },
      leggings_grey: { wy: 186, to: 166, pad: 0.7 },
      track_pants: { wy: 185, to: 165, pad: 2.6 },
      shorts_camo: { wy: 186, to: 60, pad: 3.2 },
      shorts_gold: { wy: 183, to: 48, pad: 4.2 },
    };
    const c = cfg[id] ?? cfg.shorts_basic;
    const hw = (y: number) => b.torsoX(y);
    const trunk: P[] = [
      [100 - hw(c.wy) - 1, c.wy],
      [100, c.wy + 0.6],
      [100 + hw(c.wy) + 1, c.wy],
      [100 + b.hipW + c.pad + 0.6, 201],
      [100 + b.hipW - 2, 214],
      [100, 222],
      [100 - b.hipW + 2, 214],
      [100 - b.hipW - c.pad - 0.6, 201],
    ];
    const d = closedPath(trunk) + L.map((leg) => closedPath(limbOutline(leg, -1, c.to, c.pad, 'flat', 'flat'))).join('');
    const marks: Mark[] = [...rim(d, 0.9, 1.1)];
    const extra: ReactNode[] = [];
    const band = (h: number, f: string) => (
      <path key={'band'} d={polyPath([[100 - hw(c.wy) - 1, c.wy], [100 + hw(c.wy) + 1, c.wy], [100 + hw(c.wy + h) + 1.2, c.wy + h], [100 - hw(c.wy + h) - 1.2, c.wy + h]])} fill={f} />
    );
    // Schrittfalten
    for (const side of id === 'underwear' ? [] : [-1, 1]) {
      marks.push({ k: 'sh', d: openPath([mx([101.5, 216], side), mx([107 + 2 * s, 209], side), mx([112 + 4 * s, 206], side)]), w: 1.6, o: 0.3, fine: true });
    }
    marks.push({ k: 'ao', d: openPath([[100, c.wy + 10], [100, 214], [100, 222]]), w: 1.4, o: id === 'underwear' ? 0.25 : 0.5, fine: true });
    if (id === 'underwear') {
      extra.push(band(4, ac));
      L.forEach((leg, k) => marks.push({ k: 'hl', d: limbEll(leg, 6, 0.1, 8, wAt(leg, 6) * 0.5), o: 0.25 }));
      void L;
    } else {
      extra.push(line('fly', openPath([[100.8, c.wy + 6], [101.2, 208]]), seam, 0.5, 0.7, '1.2 1'));
      L.forEach((leg) => {
        marks.push({ k: 'hl', d: limbEll(leg, Math.min(30, c.to / 2), 0.1, Math.min(22, c.to / 2.2), wAt(leg, 20) * 0.7), o: 0.14 });
        if (c.to > 100) {
          marks.push({ k: 'sh', d: openPath([lp(leg, 80, -1.1), lp(leg, 86, -0.2), lp(leg, 88, 0.8)]), w: 1.8, o: 0.55, fine: true });
          marks.push({ k: 'hl', d: openPath([lp(leg, 76, -1), lp(leg, 82, 0)]), w: 1.4, o: 0.35, fine: true });
          marks.push({ k: 'sh', d: openPath([lp(leg, 94, -0.8), lp(leg, 97, 0.6)]), w: 1.5, o: 0.4, fine: true });
        }
      });
      if (id === 'shorts_basic') {
        extra.push(band(5, ac));
        L.forEach((leg, k) => {
          extra.push(<path key={`h${k}`} d={closedPath(limbOutline(leg, c.to - 3.5, c.to, c.pad + 0.1, 'flat', 'flat'))} fill={ac} />);
          extra.push(line(`st${k}`, openPath([lp(leg, -10, 1.08), lp(leg, 20, 1.1), lp(leg, c.to - 4, 1.12)]), ac, 1.6, 0.9));
          extra.push(line(`sm${k}`, openPath([lp(leg, c.to - 4.3, 1.4), lp(leg, c.to - 4.3, -1.4)]), seam, 0.45, 0.7, '1.2 1'));
        });
      } else if (id === 'shorts_red') {
        extra.push(band(4.5, darken(color, 0.25)));
        L.forEach((leg, k) => {
          extra.push(<path key={`h${k}`} d={closedPath(limbOutline(leg, c.to - 2.6, c.to, c.pad + 0.1, 'flat', 'flat'))} fill={ac} />);
          const { p, n, t } = leg.chain.frame(c.to, leg.side);
          const w = widthAt(leg.prof, c.to, leg.s).o + c.pad;
          const e = add(p, n, w + 0.6);
          const tip = add(add(p, n, w - 2.6), t, -9);
          extra.push(<path key={`sl${k}`} d={polyPath([add(e, n, -5.5), tip, add(e, t, 1)])} fill={skinFill} stroke={ac} strokeWidth={0.9} strokeLinejoin="round" />);
        });
      } else if (id === 'joggers_black') {
        extra.push(band(6, darken(color, 0.3)));
        extra.push(line('dcL', openPath([[97.5, c.wy + 3], [96.5, c.wy + 12]]), ac, 0.9, 0.9));
        extra.push(line('dcR', openPath([[102.5, c.wy + 3], [103.5, c.wy + 12]]), ac, 0.9, 0.9));
        L.forEach((leg, k) => {
          extra.push(line(`js${k}`, openPath([lp(leg, -8, 1.1), lp(leg, 30, 1.05), lp(leg, 86, 0.95), lp(leg, 120, 1.0), lp(leg, 152, 1.0)]), ac, 1.6, 0.95));
          extra.push(<path key={`jc${k}`} d={closedPath(limbOutline(leg, 152, 166, 1.2, 'flat', 'flat'))} fill={darken(color, 0.3)} />);
          for (let r = 0; r < 4; r++) extra.push(line(`jr${k}${r}`, openPath([lp(leg, 154 + r * 3.4, 1.3), lp(leg, 154 + r * 3.4, -1.3)]), lighten(color, 0.12), 0.5, 0.7));
          marks.push({ k: 'sh', d: openPath([lp(leg, 140, -1), lp(leg, 147, 0.3)]), w: 1.6, o: 0.5, fine: true });
          marks.push({ k: 'hl', d: openPath([lp(leg, 136, -0.9), lp(leg, 143, 0.2)]), w: 1.2, o: 0.35, fine: true });
        });
      } else if (id === 'track_pants') {
        extra.push(band(6, darken(color, 0.3)));
        extra.push(line('dcL', openPath([[97.5, c.wy + 3], [96.8, c.wy + 11]]), ac, 0.8, 0.9));
        extra.push(line('dcR', openPath([[102.5, c.wy + 3], [103.2, c.wy + 11]]), ac, 0.8, 0.9));
        L.forEach((leg, k) => {
          for (const f of [0.55, 0.92]) extra.push(line(`tp${k}${f}`, openPath([lp(leg, -9, f + 0.08), lp(leg, 30, f), lp(leg, 86, f - 0.05), lp(leg, 125, f), lp(leg, 164, f)]), ac, 1.3, 0.95));
          extra.push(<path key={`th${k}`} d={closedPath(limbOutline(leg, 160, 165, c.pad + 0.1, 'flat', 'flat'))} fill={darken(color, 0.22)} />);
          extra.push(line(`thS${k}`, openPath([lp(leg, 159.6, 1.5), lp(leg, 159.6, -1.5)]), seam, 0.45, 0.7, '1.2 1'));
          marks.push({ k: 'sh', d: openPath([lp(leg, 138, -1), lp(leg, 146, 0.4)]), w: 1.6, o: 0.45, fine: true });
          marks.push({ k: 'sh', d: openPath([lp(leg, 150, 0.9), lp(leg, 156, -0.3)]), w: 1.4, o: 0.4, fine: true });
          marks.push({ k: 'hl', d: openPath([lp(leg, 134, -0.9), lp(leg, 141, 0.2)]), w: 1.2, o: 0.35, fine: true });
        });
      } else if (id === 'shorts_camo') {
        // Tarnmuster: unregelmäßige Flecken in drei Tönen
        const rnd = rng(7);
        const cols = [ac, darken(ac, 0.45), mix(color, '#a89a6a', 0.45)];
        const blobs: string[][] = [[], [], []];
        for (let i = 0; i < 30; i++) {
          const cx = 54 + rnd() * 92;
          const cy = 190 + rnd() * 76;
          const rr = 3.2 + rnd() * 3.6;
          const ang = rnd() * Math.PI;
          const pts: P[] = [];
          for (let j = 0; j < 6; j++) {
            const a = ang + (j / 6) * Math.PI * 2;
            const q = rr * (0.6 + rnd() * 0.6);
            pts.push([cx + Math.cos(a) * q * 1.5, cy + Math.sin(a) * q]);
          }
          blobs[i % 3].push(closedPath(pts));
        }
        blobs.forEach((bl, i) => extra.push(<path key={`cm${i}`} d={bl.join('')} fill={cols[i]} opacity={0.92} />));
        extra.push(band(5, ac));
        for (const x of [-1, 1].flatMap((sd) => [100 + sd * (hw(c.wy) - 2), 100 + sd * 7])) extra.push(<rect key={`lp${x}`} x={r1(x - 1)} y={c.wy - 0.5} width={2} height={6.5} rx={0.6} fill={darken(ac, 0.25)} />);
        L.forEach((leg, k) => {
          // Cargotasche außen am Oberschenkel
          const q = (d: number, f: number): P => {
            const { p, n } = leg.chain.frame(d, leg.side);
            return add(p, n, f * widthAt(leg.prof, d, leg.s).o + (f > 0.9 ? c.pad - 0.8 : 0));
          };
          const pocket = polyPath([q(22, 0.15), q(22, 1), q(47, 1), q(48, 0.55), q(47, 0.15)]);
          extra.push(<path key={`pkS${k}`} d={pocket} fill="none" stroke={pal.ao} strokeWidth={2.2} opacity={0.4} transform="translate(0.5 1)" />);
          extra.push(<path key={`pk${k}`} d={pocket} fill="none" stroke={darken(color, 0.5)} strokeWidth={0.8} />);
          extra.push(<path key={`fl${k}`} d={polyPath([q(20.5, 0.1), q(20.5, 1.02), q(28, 1.02), q(28.5, 0.1)])} fill={darken(color, 0.1)} stroke={darken(color, 0.5)} strokeWidth={0.7} />);
          extra.push(<circle key={`sn${k}`} cx={r1(q(26, 0.55)[0])} cy={r1(q(26, 0.55)[1])} r={0.9} fill={darken(ac, 0.5)} />);
          extra.push(<path key={`h${k}`} d={closedPath(limbOutline(leg, c.to - 3, c.to, c.pad + 0.1, 'flat', 'flat'))} fill={darken(color, 0.15)} />);
          extra.push(line(`hs${k}`, openPath([lp(leg, c.to - 3.4, 1.45), lp(leg, c.to - 3.4, -1.45)]), lighten(color, 0.25), 0.45, 0.7, '1.2 1'));
          marks.push({ k: 'sh', d: openPath([lp(leg, 34, -1.2), lp(leg, 44, -0.2)]), w: 1.8, o: 0.45, fine: true });
        });
      } else if (id === 'shorts_gold') {
        extra.push(band(9, ac));
        extra.push(line('bandHl', openPath([[100 - hw(c.wy) - 1, c.wy + 1.2], [100 + hw(c.wy) + 1, c.wy + 1.2]]), '#55555c', 0.8, 0.8));
        extra.push(line('bandSh', openPath([[100 - hw(c.wy + 9) - 1.2, c.wy + 9.4], [100 + hw(c.wy + 9) + 1.2, c.wy + 9.4]]), pal.ao, 1.6, 0.6));
        L.forEach((leg, k) => {
          extra.push(<path key={`h${k}`} d={closedPath(limbOutline(leg, c.to - 2.6, c.to, c.pad + 0.1, 'flat', 'flat'))} fill={ac} />);
          // Glanzbahnen
          extra.push(line(`gl${k}`, openPath([lp(leg, -2, -0.2 * leg.side), lp(leg, 22, -0.3 * leg.side), lp(leg, c.to - 5, -0.4 * leg.side)]), lighten(color, 0.7), 2.2, 0.55));
          extra.push(line(`gl2${k}`, openPath([lp(leg, 4, -0.6), lp(leg, 28, -0.75)]), lighten(color, 0.5), 1, 0.45));
          const { p, n, t } = leg.chain.frame(c.to, leg.side);
          const w = widthAt(leg.prof, c.to, leg.s).o + c.pad;
          const e = add(p, n, w + 0.6);
          const tip = add(add(p, n, w - 3), t, -11);
          extra.push(<path key={`sl${k}`} d={polyPath([add(e, n, -6), tip, add(e, t, 1)])} fill={skinFill} stroke={ac} strokeWidth={1.1} strokeLinejoin="round" />);
          marks.push({ k: 'sh', d: openPath([lp(leg, 26, -1.2), lp(leg, 40, -0.5)]), w: 2, o: 0.5, fine: true });
        });
      } else if (id === 'leggings_grey') {
        extra.push(band(5, ac));
        L.forEach((leg, k) => {
          marks.push(...legMarks(leg).filter((x) => x.k !== 'sh' || x.fine));
          extra.push(line(`lg${k}`, openPath([lp(leg, -6, 0.8), lp(leg, 40, 0.72), lp(leg, 86, 0.6), lp(leg, 130, 0.62), lp(leg, 160, 0.55)]), ac, 1, 0.9));
        });
      }
    }
    bottomNodes.push(part('pants', d, fill, ol, marks, pal, extra));
  }

  // ---------- Schuhe ----------
  const shoeNodes: ReactNode[] = [];
  if (shoes) {
    const c = shoes.color;
    const ac = shoes.accent;
    const pal = fabPal(c);
    const fill = `url(#${uid}${shoes.id})`;
    const ol = darken(c, 0.65);
    b.ankles.forEach((a, k) => {
      const side = k === 0 ? -1 : 1;
      const f = (x: number, y: number): P => [a[0] + x * side, y];
      if (shoes.id === 'boots_black') {
        const d = closedPath([f(-7.5, 338), f(7.5, 338), f(8.5, 360), f(11, 370), f(14.5, 378), f(13.5, 385.5), f(-9.5, 385.5), f(-10.5, 378), f(-9.5, 362)]);
        const extra: ReactNode[] = [
          <path key="sole" d={polyPath([f(-10.8, 381), f(14.6, 381), f(13.8, 387.2), f(-10.2, 387.2)])} fill={darken(c, 0.3)} stroke={ol} strokeWidth={0.6} />,
          <rect key="col" x={r1(a[0] - 8)} y={337} width={16} height={4} rx={1.5} fill={lighten(c, 0.14)} />,
          <rect key="tab" x={r1(a[0] + side * 6.5 - 1.2)} y={332} width={2.4} height={7} rx={1} fill={ac} />,
        ];
        for (let r = 0; r < 5; r++) {
          extra.push(line(`l${r}a`, openPath([f(-3.2, 344 + r * 5.5), f(3.2, 347 + r * 5.5)]), ac, 1.1, 1));
          extra.push(line(`l${r}b`, openPath([f(3.2, 344 + r * 5.5), f(-3.2, 347 + r * 5.5)]), ac, 1.1, 1));
        }
        for (let r = 0; r < 6; r++) extra.push(line(`lug${r}`, openPath([f(-9 + r * 4.2, 384.6), f(-9 + r * 4.2, 387)]), lighten(c, 0.12), 0.6, 0.7));
        const marks: Mark[] = [...rim(d, 1, 0.8), { k: 'hl', d: ell(f(-2, 372), 4, 9), o: 0.35 }, { k: 'hl', d: ell(f(6, 377), 5, 2.5, 25 * side), o: 0.4 }];
        shoeNodes.push(part(`boot${k}`, d, fill, ol, marks, pal, extra));
      } else if (shoes.id === 'hightops_black') {
        const tw = 7.6 + 0.8 * s;
        const d = closedPath([f(-tw, 340), f(tw, 340), f(tw + 0.6, 358), f(10.6, 369), f(13.8, 377.5), f(13.4, 385.5), f(-9.6, 385.5), f(-10.4, 378), f(-tw - 1, 360)]);
        const extra: ReactNode[] = [
          <path key="toe" d={closedPath([f(-9.6, 378.5), f(-5, 374.6), f(4, 373.6), f(11.5, 374.2), f(13.8, 379), f(2, 380.5)])} fill={ac} opacity={0.95} />,
          <path key="sole" d={openPath([f(-10.6, 380.6), f(2, 381.8), f(14.2, 380.8)]) + `L${r1(f(13.6, 386.6)[0])} 387.3L${r1(f(-9.6, 386.6)[0])} 387.3Z`} fill={ac} stroke={ol} strokeWidth={0.5} />,
          line('mid', openPath([f(-10.2, 384), f(2, 384.8), f(14, 384)]), darken(ac, 0.25), 0.6, 0.8),
          <rect key="col" x={r1(a[0] - tw)} y={339.4} width={r1(2 * tw)} height={4.2} rx={1.6} fill={lighten(c, 0.12)} />,
          <path key="tg" d={closedPath([f(-4.2, 336.5), f(4.2, 336.5), f(3.8, 345), f(-3.8, 345)])} fill={lighten(c, 0.08)} stroke={ol} strokeWidth={0.4} />,
          <circle key="pt" cx={r1(f(-tw + 1.6, 351)[0])} cy={351} r={2.6} fill={ac} />,
          <path key="pts" d={`M${r1(f(-tw + 1.6, 349.4)[0])} 349.4l0.5 1.1 1.2 0.1-0.9 0.8 0.3 1.2-1.1-0.7-1.1 0.7 0.3-1.2-0.9-0.8 1.2-0.1Z`} fill={c} />,
          line('sw', openPath([f(-9, 371), f(-3, 366), f(7, 365), f(12, 371)]), ac, 1.3, 0.85),
        ];
        for (let r = 0; r < 5; r++) {
          extra.push(line(`l${r}a`, openPath([f(-3.2, 347 + r * 5), f(3.2, 349.6 + r * 5)]), ac, 1, 1));
          extra.push(line(`l${r}b`, openPath([f(3.2, 347 + r * 5), f(-3.2, 349.6 + r * 5)]), ac, 1, 1));
        }
        const marks: Mark[] = [...rim(d, 1, 0.8), { k: 'hl', d: ell(f(-3, 360), 3, 12), o: 0.35 }, { k: 'hl', d: ell(f(4, 376), 5, 1.8, 15 * side), o: 0.4 }, { k: 'sh', d: openPath([f(-tw + 0.5, 346), f(-tw, 356)]), w: 1.5, o: 0.5 }];
        shoeNodes.push(part(`ht${k}`, d, fill, ol, marks, pal, extra));
      } else if (shoes.id === 'lifters_red') {
        const fp = footPts(a, side, 2.4);
        const d = closedPath(fp);
        const heel = '#2d2a29';
        const extra: ReactNode[] = [
          line('col', openPath([f(-7, 356.4), f(0, 359), f(7, 356.4)]), darken(c, 0.45), 1.6, 0.9),
          <path key="tg" d={closedPath([f(-4.4, 353.4), f(4.4, 353.4), f(4, 360.5), f(-4, 360.5)])} fill={darken(c, 0.12)} />,
        ];
        for (let r = 0; r < 2; r++) {
          extra.push(line(`l${r}a`, openPath([f(-3.2, 361.5 + r * 3.4), f(3.2, 363.8 + r * 3.4)]), ac, 0.9, 0.95));
          extra.push(line(`l${r}b`, openPath([f(3.2, 361.5 + r * 3.4), f(-3.2, 363.8 + r * 3.4)]), ac, 0.9, 0.95));
        }
        // Klettriemen über dem Spann
        const strap = closedPath([f(-8.2, 366.5), f(0, 367.6), f(9.6, 369.6), f(10.6, 374.6), f(0, 372.8), f(-8.6, 371.6)]);
        extra.push(<path key="strS" d={strap} fill={pal.ao} opacity={0.5} transform="translate(0.4 1.2)" />);
        extra.push(<path key="str" d={strap} fill={ac} stroke={darken(ac, 0.45)} strokeWidth={0.5} />);
        extra.push(line('strSt', openPath([f(-7.8, 367.8), f(0, 369), f(9.6, 371)]), darken(ac, 0.3), 0.4, 0.8, '0.9 0.7'));
        extra.push(<rect key="ring" x={r1(f(9.6, 0)[0] - 1.4)} y={368.8} width={2.8} height={6.4} rx={0.8} fill="none" stroke="#b9bcc2" strokeWidth={0.9} />);
        extra.push(line('toe', openPath([f(-8.6, 377), f(2, 375.8), f(13, 378)]), darken(c, 0.4), 0.7, 0.6, '1.2 1'));
        // erhöhte feste Ferse: dicke, nach hinten ansteigende Sohle
        const sole = closedPath([f(-11, 376.4), f(-6, 380.4), f(2, 381.8), f(10, 380.6), f(14.6, 377.6), f(14.2, 387.4), f(2, 387.6), f(-10.4, 387.4)]);
        const soleNode = (
          <g key="sole">
            <path d={sole} fill={heel} stroke="#141313" strokeWidth={0.6} />
            <path d={openPath([f(-10.6, 383.4), f(2, 384.6), f(14.3, 383.4)])} fill="none" stroke="#5b5654" strokeWidth={0.7} />
            <path d={openPath([f(-10.2, 378.2), f(-6, 381.2), f(2, 382.4), f(10, 381.4), f(14, 378.6)])} fill="none" stroke="#6c6664" strokeWidth={0.8} opacity={0.8} />
          </g>
        );
        const marks: Mark[] = [...rim(d, 1, 0.7), { k: 'hl', d: ell(f(1, 377), 7, 2.4, 12 * side), o: 0.5 }, { k: 'hl', d: ell(f(-3, 362), 2.2, 5), o: 0.35 }];
        shoeNodes.push(<g key={`lf${k}`}>{part('u', d, fill, ol, marks, pal, extra)}{soleNode}</g>);
      } else {
        const d = closedPath(footPts(a, side, 2.2));
        const neon = shoes.id === 'runner_neon';
        const gold = shoes.id === 'sneaker_gold';
        const soleCol = neon ? ac : '#ffffff';
        const extra: ReactNode[] = [
          <path key="sole" d={openPath([f(-10.4, 380.8), f(2, 382), f(14.2, 381)]) + `L${r1(f(13.6, 386.4)[0])} 387.2L${r1(f(-9, 386.4)[0])} 387.2Z`} fill={soleCol} stroke={ol} strokeWidth={0.5} />,
          line('mid', openPath([f(-10, 383.8), f(2, 384.6), f(14, 383.8)]), neon ? lighten(ac, 0.2) : darken(c, 0.18), 0.6, 0.8),
          <path key="tg" d={closedPath([f(-4.5, 354.5), f(4.5, 354.5), f(4, 361), f(-4, 361)])} fill={neon ? ac : darken(c, 0.08)} />,
          line('col', openPath([f(-6.8, 356.8), f(0, 359.4), f(6.8, 356.8)]), darken(c, 0.35), 1.6, 0.9),
        ];
        for (let r = 0; r < 3; r++) {
          extra.push(line(`l${r}a`, openPath([f(-3.4, 362 + r * 3.8), f(3.4, 364.4 + r * 3.8)]), neon ? ac : darken(c, 0.25), 1, 1));
          extra.push(line(`l${r}b`, openPath([f(3.4, 362 + r * 3.8), f(-3.4, 364.4 + r * 3.8)]), neon ? ac : darken(c, 0.25), 1, 1));
        }
        if (neon) extra.push(line('sw', openPath([f(-8, 378), f(1, 376.5), f(9.5, 371.5), f(13, 375)]), ac, 1.5, 0.95));
        else if (gold) {
          extra.push(line('sw', openPath([f(-8, 377.5), f(1, 375.6), f(9.5, 371.8), f(13, 375.4)]), darken(c, 0.3), 1.2, 0.8));
          extra.push(line('gl1', openPath([f(-6.5, 373), f(-2, 369.5), f(3, 368.6)]), ac, 1.3, 0.9));
          extra.push(line('gl2', openPath([f(4, 378.3), f(9, 377.6)]), ac, 1, 0.85));
          const g = f(-5.6, 370.4);
          extra.push(<path key="spk" d={`M${r1(g[0])} ${r1(g[1] - 2.6)}L${r1(g[0] + 0.6)} ${r1(g[1] - 0.6)}L${r1(g[0] + 2.6)} ${r1(g[1])}L${r1(g[0] + 0.6)} ${r1(g[1] + 0.6)}L${r1(g[0])} ${r1(g[1] + 2.6)}L${r1(g[0] - 0.6)} ${r1(g[1] + 0.6)}L${r1(g[0] - 2.6)} ${r1(g[1])}L${r1(g[0] - 0.6)} ${r1(g[1] - 0.6)}Z`} fill="#ffffff" opacity={0.9} />);
        } else extra.push(line('toe', openPath([f(-9, 377.5), f(2, 376), f(13.5, 378.5)]), shoes.accent, 0.8, 0.8, '1.2 1'));
        const marks: Mark[] = [...rim(d, 1, 0.7), { k: 'hl', d: ell(f(1, 377.5), 7, 2.6, 12 * side), o: 0.5 }, { k: 'sh', d: ell(f(1.5, 368), 6, 4), o: 0.25 }];
        shoeNodes.push(part(`shoe${k}`, d, fill, ol, marks, pal, extra));
      }
    });
  }

  // ---------- Kopf ----------
  const jw = s;
  const headPts: P[] = [
    [100, 24],
    [108.6, 25.8],
    [114, 31],
    [116, 39],
    [115.8, 46],
    [115 + 0.6 * jw, 51],
    [112.6 + 1.6 * jw, 59],
    [108.3 + 1.2 * jw, 64.6],
    [104.2 + 0.6 * jw, 68],
    [100, 69],
  ];
  const headD = closedPath([...headPts, ...headPts.slice(1, -1).reverse().map((p) => mx(p, -1))]);
  const style = hair.style;
  const hc = hair.color;
  const hairDark = darken(hc, 0.45);
  const browCol = style === 'bald' ? mix(skin, '#1a120c', 0.7) : mix(hc, '#120c08', lum > 0.5 || hc === '#c9a25a' ? 0.25 : 0.35);
  const headBack: ReactNode[] = [];
  const headFront: ReactNode[] = [];
  if (style === 'long') {
    const backD = closedPath([[100, 21], [112, 23], [119, 34], [120.5, 56], [119, 80], [111, 86], [107, 66], [93, 66], [89, 86], [81, 80], [79.5, 56], [81, 34], [88, 23]]);
    headBack.push(part('hairBack', backD, darken(hc, 0.25), darken(hc, 0.6), [...rim(backD, 1, 0.8)], fabPal(darken(hc, 0.2)), [0, 1, 2, 3].map((i) => line(`hb${i}`, openPath([[83 + i * 2, 46], [82.5 + i * 2.5, 66], [84 + i * 2, 82]]), lighten(hc, 0.15), 0.6, 0.4))));
  }
  // Ohren
  for (const side of [-1, 1]) {
    const ed = closedPath([mx([115.4, 43], side), mx([118.4, 42], side), mx([119.6, 46.5], side), mx([118, 52.5], side), mx([115.4, 55], side)]);
    headBack.push(
      part(`ear${side}`, ed, sk.base, sk.line, [{ k: 'sh', d: ed, o: 0.5, tf: `translate(${-1.6 * side} 0.6)` }], skinPal, [
        line('in', openPath([mx([116.4, 44.6], side), mx([118.2, 46.5], side), mx([117.4, 50.5], side)]), sk.ao, 0.7, 0.6),
        line('hi', openPath([mx([117.8, 43.4], side), mx([119, 46.5], side)]), sk.hl, 0.6, 0.5),
      ], 0.7),
    );
  }
  const faceMarks: Mark[] = [
    ...rim(headD, 0.9, 0.9),
    { k: 'sh', d: ell([111.5, 53], 5, 13, -8), o: 0.35 },
    { k: 'hl', d: ell([95.5, 32], 8, 5), o: 0.4 },
    { k: 'sh', d: ell([93.6, 45.6], 4.4, 2.8), o: 0.4 },
    { k: 'sh', d: ell([106.4, 45.6], 4.4, 2.8), o: 0.45 },
    { k: 'hl', d: ell([92.5, 51], 3.6, 2.4), o: 0.35 },
    { k: 'sh', d: ell([90.5, 57], 2.6, 3.6, 10), o: 0.12 + 0.3 * s },
    { k: 'sh', d: ell([109.5, 57], 2.6, 3.6, -10), o: 0.15 + 0.35 * s },
    { k: 'hl', d: openPath([[99.5, 43], [99.4, 51.5]]), w: 1.3, o: 0.45, fine: true },
    { k: 'sh', d: openPath([[102, 46.5], [102.6, 53]]), w: 1.5, o: 0.45, fine: true },
    { k: 'sh', d: ell([100, 56.3], 2.6, 0.9), o: 0.5, fine: true },
    { k: 'sh', d: ell([100, 63.6], 2.8, 1), o: 0.45, fine: true },
    { k: 'hl', d: ell([99.6, 66.2], 3, 1.5), o: 0.35, fine: true },
    { k: 'sh', d: openPath([[87.5 - 0.8 * s, 58], [92, 64.5], [100, 68.2], [108, 64.5], [112.5 + 0.8 * s, 58]]), w: 2, o: 0.2 + 0.3 * s },
  ];
  const face: ReactNode[] = [];
  // Augen
  for (const side of [-1, 1]) {
    const x = 100 + 6.4 * side;
    const e = (dx: number, y: number): P => [x + dx * side, y];
    face.push(<path key={`sc${side}`} d={closedPath([e(-3.1, 46.3), e(-1.2, 45.1), e(1.4, 45), e(3.3, 46.1), e(1.3, 47.3), e(-1.3, 47.4)])} fill={mix('#e6ddd0', skin, 0.22)} />);
    face.push(<path key={`ss${side}`} d={openPath([e(-2.8, 46), e(0, 45.3), e(2.9, 45.9)])} fill="none" stroke={sk.sh} strokeWidth={0.9} opacity={0.45} />);
    face.push(<circle key={`ir${side}`} cx={x} cy={46.2} r={1.35} fill={mix(hc === '#c9a25a' ? '#3f6a8a' : '#4a3020', skin, 0.1)} />);
    face.push(<circle key={`pu${side}`} cx={x} cy={46.2} r={0.62} fill="#0e0a08" />);
    face.push(<circle key={`gl${side}`} cx={x - 0.45} cy={45.7} r={0.32} fill="#ffffff" opacity={0.9} />);
    face.push(line(`ul${side}`, openPath([e(-3.4, 46.5), e(-1.3, 44.8), e(1.4, 44.7), e(3.5, 46.1)]), mix(sk.line, '#000', 0.3), 1, 0.95));
    face.push(line(`cr${side}`, openPath([e(-2.8, 44.6), e(0, 43.4), e(2.9, 44.4)]), sk.sh, 0.5, 0.6));
    face.push(line(`ll${side}`, openPath([e(-2.6, 47.4), e(0, 47.9), e(2.6, 47.2)]), sk.sh, 0.45, 0.55));
    // Braue: spitz zulaufend, bei Stärke tiefer und gerader
    const lo = 0.7 * s;
    face.push(<path key={`br${side}`} d={closedPath([e(-3.4, 42.5 + lo), e(-1, 41.1 + lo * 0.6), e(2.2, 40.8 + lo * 0.3), e(4.4, 41.8), e(2.2, 41.7 + lo * 0.3), e(-1, 42.3 + lo * 0.6), e(-3.3, 43.6 + lo)])} fill={browCol} opacity={0.92} />);
  }
  // Nase
  face.push(line('nos', openPath([[97.4, 54.4], [98.4, 55.6], [100, 55.9], [101.6, 55.6], [102.6, 54.4]]), sk.ao, 0.7, 0.75));
  face.push(<path key="nl" d={ell([98.5, 55.2], 0.8, 0.45)} fill={sk.ao} opacity={0.7} />);
  face.push(<path key="nr" d={ell([101.5, 55.2], 0.8, 0.45)} fill={sk.ao} opacity={0.7} />);
  face.push(<path key="nt" d={ell([99.8, 53.6], 1.1, 0.8)} fill={sk.hl} opacity={0.6} />);
  // Lippen
  const lipD = mix(skin, '#6e2c22', 0.32);
  const lipL = mix(skin, '#9c4e40', 0.22);
  face.push(<path key="ulip" d={closedPath([[96, 60], [98.1, 59.1], [100, 59.5], [101.9, 59.1], [104, 60], [100, 60.4]])} fill={lipD} />);
  face.push(<path key="llip" d={closedPath([[96.4, 60.3], [100, 60.6], [103.6, 60.3], [102, 62.1], [100, 62.4], [98, 62.1]])} fill={lipL} />);
  face.push(line('mouth', openPath([[95.7, 60.1], [100, 60.5], [104.3, 60.1]]), sk.line, 0.65, 0.9));
  face.push(<path key="lh" d={ell([99.6, 61.4], 1.5, 0.4)} fill={sk.hl} opacity={0.5} />);

  // Haare
  const hairNodes: ReactNode[] = [];
  const hairFill = `url(#${uid}hr)`;
  const strands = (key: string, ds: string[], o = 1) =>
    ds.map((dd, i) => line(`${key}${i}`, dd, i % 2 ? hairDark : lighten(hc, 0.3), 0.45, (i % 2 ? 0.4 : 0.28) * o));
  if (style === 'short') {
    const d = closedPath([[84.3, 46], [83.4, 37], [85.4, 29], [91, 23.4], [100, 21.4], [109, 23.4], [114.6, 29], [116.6, 37], [115.7, 46], [114.6, 40.5], [113, 35], [108, 32.6], [101, 33.4], [94, 32.4], [88.2, 34.4], [85.7, 40.5]]);
    const ds: string[] = [];
    for (let i = 0; i < 12; i++) {
      const j = ((i * 7) % 5) * 0.45 - 0.9;
      const x = 85.5 + i * 2.5 + j;
      const y0 = 34 - Math.sin((i / 11) * Math.PI) * 1.6;
      ds.push(openPath([[x, y0 + 0.5], [x + 2.6, 28 + j * 0.5], [x + 6.5, 23.5 + Math.abs(x - 100) * 0.12]]));
    }
    hairNodes.push(part('hair', d, hairFill, darken(hc, 0.65), [...rim(d, 0.8, 0.6), { k: 'hl', d: ell([97, 26.5], 8, 2.4, -6), o: 0.5 }], fabPal(hc), strands('s', ds), 0.7));
  } else if (style === 'long') {
    const d = closedPath([[83.2, 60], [82.4, 38], [86, 26], [93, 21.6], [100, 20.6], [109, 22.4], [115, 27], [118, 38], [117, 60], [114.8, 47], [113.6, 36], [107, 31.8], [99, 34.6], [93, 32.4], [87.6, 36.2], [85.6, 47]]);
    const ds: string[] = [];
    for (let i = 0; i < 6; i++) ds.push(openPath([[101 - i * 2.4, 22], [91 - i * 0.8, 30], [86.4 - i * 0.2, 44 + i * 2], [85 - i * 0.2, 58]]));
    for (let i = 0; i < 5; i++) ds.push(openPath([[101 + i * 2.6, 22], [110 + i * 0.6, 29], [114.6 + i * 0.1, 44 + i * 2], [115.6, 58]]));
    hairNodes.push(part('hair', d, hairFill, darken(hc, 0.65), [...rim(d, 0.8, 0.6), { k: 'hl', d: ell([95.5, 26], 7, 2.4, -14), o: 0.55 }], fabPal(hc), strands('s', ds), 0.7));
  } else if (style === 'buzz') {
    const d = closedPath([[84.6, 43], [84.4, 33], [89, 25.4], [100, 22.6], [111, 25.4], [115.6, 33], [115.4, 43], [114, 37], [110.5, 33.4], [100, 32.4], [89.5, 33.4], [86, 37]]);
    hairNodes.push(
      <g key="buzz" opacity={0.85}>
        <path d={d} fill={hairFill} />
        <g filter={FF}>
          <path d={d} fill="none" stroke={hc} strokeWidth={1.2} opacity={0.6} />
        </g>
        <path d={ell([98, 27], 7, 2)} fill={lighten(hc, 0.35)} opacity={0.3} filter={FB} />
      </g>,
    );
  } else {
    faceMarks.push({ k: 'hl', d: ell([97, 28], 7, 3, -8), o: 0.55 });
  }

  // Kopfbedeckung (in Kopf-Koordinaten der ersten Version, auf den schmaleren Kopf skaliert)
  const hatNodes: ReactNode[] = [];
  if (head) {
    const c = head.color;
    const ac = head.accent;
    const pal = fabPal(c);
    const fill = `url(#${uid}${head.id})`;
    const ol = darken(c, 0.6);
    if (head.id === 'cap_black') {
      const crown = closedPath([[81, 38.5], [81.5, 28], [88, 18.5], [100, 14.5], [112, 18.5], [118.5, 28], [119, 38.5], [100, 37]]);
      const brim = closedPath([[79, 38.2], [100, 35.5], [121, 38.2], [117, 42.8], [100, 41.6], [83, 42.8]]);
      hatNodes.push(part('crown', crown, fill, ol, [...rim(crown, 1, 0.8), { k: 'hl', d: ell([94, 24], 7, 4, -15), o: 0.4 }], pal, [
        line('p1', openPath([[100, 15], [100, 36.5]]), lighten(c, 0.15), 0.6, 0.8),
        line('p2', openPath([[91, 17.5], [87, 37.2]]), lighten(c, 0.12), 0.5, 0.6),
        line('p3', openPath([[109, 17.5], [113, 37.2]]), lighten(c, 0.12), 0.5, 0.6),
        <path key="logo" d="M95.5 31L100 23.5L104.5 31Z" fill={ac} />,
      ]));
      hatNodes.push(<circle key="btn" cx={100} cy={15.2} r={1.5} fill={ac} />);
      hatNodes.push(part('brim', brim, darken(c, 0.05), ol, [{ k: 'hl', d: openPath([[86, 39.2], [100, 37], [114, 39.2]]), w: 1.6, o: 0.5 }, { k: 'sh', d: openPath([[84, 42], [100, 40.8], [116, 42]]), w: 2, o: 0.6 }], pal));
    } else if (head.id === 'beanie_grey') {
      const dome = closedPath([[80.6, 41], [80.5, 28], [86.5, 16.5], [100, 11.5], [113.5, 16.5], [119.5, 28], [119.4, 41], [100, 40]]);
      const cuff = closedPath([[80.2, 31.5], [100, 30], [119.8, 31.5], [119.6, 41.5], [100, 40.5], [80.4, 41.5]]);
      const knit: ReactNode[] = [];
      for (let r = 0; r < 7; r++) knit.push(line(`k${r}`, openPath([[86 + r * 4.7, 29], [lerp(86 + r * 4.7, 100, 0.55), 15]]), darken(c, 0.18), 0.6, 0.6));
      hatNodes.push(part('dome', dome, fill, ol, [...rim(dome, 1, 0.8), { k: 'hl', d: ell([95, 20], 8, 4, -12), o: 0.4 }], pal, knit));
      const ribs: ReactNode[] = [];
      for (let r = 0; r < 13; r++) ribs.push(line(`r${r}`, openPath([[82 + r * 3, 31.5], [82 + r * 3, 41]]), darken(ac, 0.25), 0.6, 0.8));
      hatNodes.push(part('cuff', cuff, ac, ol, [...rim(cuff, 0.8, 0.5)], fabPal(ac), ribs));
    } else if (head.id === 'cap_back') {
      // rückwärts: Schirm hinten (nur seitlich zu sehen), vorne Verschluss-Bogen
      const brim = closedPath([[78.6, 33.6], [100, 30.6], [121.4, 33.6], [121, 37.2], [100, 34.6], [79, 37.2]]);
      hatNodes.push(<path key="brimB" d={brim} fill={darken(c, 0.45)} stroke={ol} strokeWidth={0.6} />);
      const crown = closedPath([[81, 39.5], [81.5, 28.5], [88, 18.8], [100, 14.8], [112, 18.8], [118.5, 28.5], [119, 39.5], [100, 38.2]]);
      const arch = closedPath([[92.6, 38.6], [93.2, 32], [100, 27.4], [106.8, 32], [107.4, 38.6], [100, 38.4]]);
      hatNodes.push(part('crown', crown, fill, ol, [...rim(crown, 1, 0.8), { k: 'hl', d: ell([93, 24], 7, 4, -15), o: 0.4 }, { k: 'ao', d: arch, w: 2.4, o: 0.5 }], pal, [
        line('p2', openPath([[91, 17.6], [88, 38]]), lighten(c, 0.12), 0.5, 0.6),
        line('p3', openPath([[109, 17.6], [112, 38]]), lighten(c, 0.12), 0.5, 0.6),
        line('p1', openPath([[100, 15.2], [100, 27.4]]), lighten(c, 0.15), 0.6, 0.8),
        <path key="arch" d={arch} fill={style === 'bald' ? sk.sh : hairFill} />,
        <path key="archS" d={openPath([[93.2, 33], [100, 28.6], [106.8, 33]])} fill="none" stroke={pal.ao} strokeWidth={1.6} opacity={0.6} />,
        <path key="strap" d={polyPath([[92.4, 34.4], [107.6, 34.4], [107.8, 38], [92.2, 38]])} fill={darken(c, 0.15)} stroke={ol} strokeWidth={0.4} />,
        line('arT', openPath([[92.8, 38.4], [93.2, 32], [100, 27.4], [106.8, 32], [107.2, 38.4]]), ac, 0.8, 0.9, '1 0.8'),
        ...[95, 98.2, 101.4, 104.6].map((x) => <circle key={`sn${x}`} cx={x} cy={36.2} r={0.75} fill={ac} />),
      ]));
      hatNodes.push(<circle key="btn" cx={100} cy={15.4} r={1.5} fill={lighten(c, 0.1)} stroke={ol} strokeWidth={0.4} />);
    } else if (head.id === 'visor_white') {
      const band = closedPath([[81.2, 31.5], [100, 28.4], [118.8, 31.5], [118.8, 37.6], [100, 35], [81.2, 37.6]]);
      hatNodes.push(part('band', band, fill, darken(c, 0.45), [...rim(band, 1, 0.6)], pal, [
        line('pip', openPath([[81.4, 31.9], [100, 28.9], [118.6, 31.9]]), ac, 0.8, 0.9),
      ], 0.8));
      const brim = closedPath([[78.4, 37.4], [100, 34.4], [121.6, 37.4], [118, 43.8], [100, 42.4], [82, 43.8]]);
      hatNodes.push(part('brim', brim, fill, darken(c, 0.45), [{ k: 'hl', d: openPath([[86, 38.6], [100, 36.6], [114, 38.6]]), w: 1.6, o: 0.6 }, { k: 'sh', d: openPath([[84, 41.6], [100, 40.4], [116, 41.6]]), w: 1.8, o: 0.5 }], pal, [
        line('und', openPath([[82.4, 43.4], [100, 42], [117.6, 43.4]]), ac, 1.4, 0.85),
      ], 0.8));
    } else if (head.id === 'crown_gold') {
      // Krone: steht auf dem Kopf, rote Steine, Glanz
      const velvet = ell([100, 21], 13.5, 5.5);
      hatNodes.push(<path key="vel" d={velvet} fill={darken(ac, 0.3)} />);
      hatNodes.push(<path key="back" d={closedPath([[84.6, 23], [100, 19.2], [115.4, 23], [115.4, 25], [84.6, 25]])} fill={darken(c, 0.35)} />);
      const body = polyPath([[83.6, 30], [84.2, 23], [85, 11.5], [88.8, 19.8], [92.5, 8.6], [96.2, 20.4], [100, 6], [103.8, 20.4], [107.5, 8.6], [111.2, 19.8], [115, 11.5], [115.8, 23], [116.4, 30], [108, 31.4], [100, 31.9], [92, 31.4]]);
      const bandD = closedPath([[83.8, 24], [100, 25.8], [116.2, 24], [116.4, 30], [100, 31.9], [83.6, 30]]);
      hatNodes.push(part('crownB', body, fill, darken(c, 0.6), [...rim(body, 1, 0.6), { k: 'hl', d: ell([93, 17], 3.5, 7), o: 0.6 }], pal, [
        <path key="band" d={bandD} fill={darken(c, 0.12)} />,
        line('bandT', openPath([[83.8, 24], [100, 25.8], [116.2, 24]]), lighten(c, 0.45), 0.9, 0.9),
        line('bandB', openPath([[83.8, 29.6], [100, 31.4], [116.2, 29.6]]), darken(c, 0.4), 0.8, 0.8),
        line('shine', openPath([[86.5, 21.5], [87, 14]]), '#ffffff', 0.9, 0.7),
        line('shine2', openPath([[98.6, 20], [99.4, 9.5]]), '#ffffff', 0.8, 0.6),
      ], 0.7));
      for (const [x, y, r] of [[85, 11.2, 1.7], [92.5, 8.2, 1.7], [100, 5.6, 1.9], [107.5, 8.2, 1.7], [115, 11.2, 1.7]]) {
        hatNodes.push(<circle key={`bl${x}`} cx={x} cy={y} r={r} fill={c} stroke={darken(c, 0.55)} strokeWidth={0.5} />);
        hatNodes.push(<circle key={`bh${x}`} cx={x - 0.5} cy={y - 0.6} r={0.6} fill="#fffbe6" />);
      }
      for (const [x, y, rx] of [[91.5, 28.3, 2], [100, 29, 2.4], [108.5, 28.3, 2]]) {
        hatNodes.push(<path key={`st${x}`} d={ell([x, y], rx, 1.9)} fill={ac} stroke={darken(ac, 0.5)} strokeWidth={0.5} />);
        hatNodes.push(<path key={`sth${x}`} d={ell([x - 0.6, y - 0.7], rx * 0.35, 0.5)} fill="#ffd6d0" opacity={0.85} />);
      }
    } else if (head.id === 'headband_red') {
      const band = closedPath([[81.4, 30.5], [100, 27.5], [118.6, 30.5], [118.6, 37], [100, 34.2], [81.4, 37]]);
      hatNodes.push(part('band', band, fill, ol, [...rim(band, 1, 0.6)], pal, line('st', openPath([[81.6, 33.6], [100, 30.8], [118.4, 33.6]]), ac, 1, 0.95)));
    }
  }
  // ---------- Extras ----------
  const accHand: ReactNode[] = [];
  const accChain: ReactNode[] = [];
  const accNeck: ReactNode[] = [];
  const accFace: ReactNode[] = [];
  let beltNode: ReactNode = null;
  if (acc) {
    const c = acc.color;
    const ac = acc.accent;
    const pal = fabPal(c);
    const ol = darken(c, 0.6);
    if (acc.id === 'gloves_black') {
      A.forEach((arm, k) => {
        const g = handGeo(arm);
        const k2 = g.len / 27;
        const hw = g.hw;
        const gw = 3.1 + 2.2 * s;
        const palm = closedPath([g.loc(gw + 0.7, -3.2), g.loc(hw * 1.08, 6 * k2), g.loc(hw * 1.18, 12 * k2), g.loc(hw * 1.09, 18.4 * k2), g.loc(hw * 0.55, 19.8 * k2), g.loc(0, 19.9 * k2), g.loc(-hw * 0.5, 19.5 * k2), g.loc(-hw * 0.96, 16 * k2), g.loc(-hw * 1.02, 9 * k2), g.loc(-gw - 0.7, -3.2)]);
        const thumb = closedPath([g.loc(-hw * 0.7, 4.5 * k2), g.loc(-hw * 1.25, 8.6 * k2), g.loc(-hw * 1.28, 13.6 * k2), g.loc(-hw * 0.84, 15.2 * k2), g.loc(-hw * 0.3, 13.6 * k2), g.loc(-hw * 0.22, 8.6 * k2)]);
        const strap = closedPath([g.loc(gw + 1.2, -3.8), g.loc(hw * 1.1, 0), g.loc(hw * 1.16, 4.4 * k2), g.loc(0, 4.8 * k2), g.loc(-hw * 1.1, 4.4 * k2), g.loc(-hw * 1.04, 0), g.loc(-gw - 1.2, -3.8)]);
        accHand.push(
          <g key={`gl${k}`}>
            {part('p', palm, c, ol, [...rim(palm, 1, 0.6), { k: 'hl', d: ell(g.loc(hw * 0.3, 12 * k2), hw * 0.6, 3.2), o: 0.45 }], pal, [
              line('kn', openPath([g.loc(hw * 0.95, 14.6 * k2), g.loc(0, 15.6 * k2), g.loc(-hw * 0.7, 15.2 * k2)]), lighten(c, 0.3), 1.6, 0.55),
              ...[0.55, 0.1, -0.35].map((x, i) => line(`fs${i}`, openPath([g.loc(hw * x, 17.2 * k2), g.loc(hw * (x - 0.04), 20 * k2)]), darken(c, 0.6), 0.6, 0.8)),
              line('vent', openPath([g.loc(hw * 0.7, 7 * k2), g.loc(hw * 0.1, 7.6 * k2)]), darken(c, 0.6), 0.5, 0.7, '0.6 0.6'),
            ], 0.8)}
            {part('t', thumb, c, ol, [...rim(thumb, 1, 0.5)], pal, null, 0.8)}
            {part('s', strap, lighten(c, 0.08), ol, [], pal, line('ac', openPath([g.loc(gw + 0.8, -1.6), g.loc(hw * 1.05, 1.6), g.loc(0, 2), g.loc(-hw, 1.6), g.loc(-gw - 0.8, -1.6)]), ac, 1.3, 0.95), 0.7)}
          </g>,
        );
      });
    } else if (acc.id === 'watch_sport') {
      // linkes Handgelenk (vom Betrachter aus rechts), über einem langen Ärmel weiter außen
      const arm = A[1];
      const sl = top ? top.id : '';
      const pd = sl === 'hoodie_grey' ? 2.4 : sl === 'track_jacket' ? 2.1 : sl === 'compression_blue' ? 1.7 : 0.5;
      const dW = pd > 1 ? 107 : 104.5;
      const strapD = closedPath(limbOutline(arm, dW - 2.8, dW + 2.8, pd, 'flat', 'flat'));
      const wr = wAt(arm, dW) + pd;
      const caseD = limbEll(arm, dW, 0.05, 4.6, wr * 0.82 + 0.6);
      accHand.push(
        <g key="watch">
          {part('st', strapD, c, '#000000', [...rim(strapD, 1, 0.5)], pal, null, 0.6)}
          {part('cs', caseD, darken(c, 0.2), '#000000', [{ k: 'hl', d: caseD, o: 0.5, tf: 'translate(-0.8 -0.8)' }], fabPal('#5a5a60'), null, 0.6)}
          <path d={limbEll(arm, dW, 0.05, 3.1, wr * 0.58)} fill={darken(ac, 0.35)} />
          <path d={limbEll(arm, dW + 0.3, 0.05, 1.8, wr * 0.42)} fill={ac} opacity={0.9} />
          {line('gl', openPath([lp(arm, dW - 2, -0.3), lp(arm, dW - 2.4, 0.3)]), '#ffffff', 0.6, 0.7)}
        </g>,
      );
    } else if (acc.id === 'belt_lifting') {
      const hwB = (y: number) => Math.max(b.torsoX(y) + 5, b.hipW + 5.2);
      const R: P[] = [[100 + hwB(176) * 0.55, 179.4], [100 + hwB(177) - 0.8, 177.8], [100 + hwB(178), 179.5], [100 + hwB(194), 193.8], [100 + hwB(195) - 0.8, 195.6], [100 + hwB(196) * 0.55, 194]];
      const d = closedPath([[100, 180.4], ...R, [100, 193.2], ...[...R].reverse().map((p) => mx(p, -1))]);
      const st = (y0: number, y1: number, yc: number) => openPath([[100 - hwB(y0) + 1.6, y0], [100 - hwB(y0) * 0.55, yc], [100, yc + (y0 < 186 ? 0.8 : -0.6)], [100 + hwB(y0) * 0.55, yc], [100 + hwB(y0) - 1.6, y0]].map((p) => [p[0], p[1] + y1] as P));
      const lc = darken(c, 0.4);
      const extra: ReactNode[] = [
        line('stT', st(177.8, 1.6, 179.4), ac, 0.55, 0.8, '1.2 0.9'),
        line('stB', st(195.6, -1.6, 194), ac, 0.55, 0.8, '1.2 0.9'),
        ...[9, 12.5, 16].map((x) => <path key={`ho${x}`} d={ell([100 + x, 186.8], 0.9, 1.1)} fill={darken(c, 0.65)} />),
      ];
      const buckle = (
        <g key="bk">
          <path d={polyPath([[94, 179.2], [106, 179.2], [106, 194.4], [94, 194.4]])} fill={pal.ao} opacity={0.45} transform="translate(0.6 1)" />
          <path d={polyPath([[94, 179.2], [106, 179.2], [106, 194.4], [94, 194.4]]) + polyPath([[96.2, 181.4], [96.2, 192.2], [103.8, 192.2], [103.8, 181.4]])} fill={ac} fillRule="evenodd" stroke={darken(ac, 0.55)} strokeWidth={0.5} />
          <path d={polyPath([[96.2, 181.4], [103.8, 181.4], [103.8, 192.2], [96.2, 192.2]])} fill={lc} />
          {line('pr1', openPath([[95.4, 184.6], [104.6, 184.6]]), lighten(ac, 0.2), 1, 1)}
          {line('pr2', openPath([[95.4, 189.2], [104.6, 189.2]]), lighten(ac, 0.2), 1, 1)}
          {line('bkH', openPath([[94.6, 180], [105.4, 180]]), lighten(ac, 0.55), 0.6, 0.8)}
        </g>
      );
      beltNode = (
        <g key="belt">
          {part('belt', d, `url(#${uid}${acc.id})`, darken(c, 0.65), [...rim(d, 1, 0.8), { k: 'hl', d: openPath([[100 - hwB(180) + 3, 180.5], [100, 183], [100 + hwB(180) - 3, 180.5]]), w: 2.4, o: 0.35 }, { k: 'sh', d: openPath([[100 - hwB(194) + 2, 194.6], [100, 192.6], [100 + hwB(194) - 2, 194.6]]), w: 2.4, o: 0.5 }], pal, extra, 1)}
          {buckle}
        </g>
      );
    } else if (acc.id === 'sunglasses') {
      const lens = (side: number) => {
        const e = (dx: number, y: number): P => [100 + 6.4 * side + dx * side, y];
        return closedPath([e(-4.7, 43.4), e(-1, 42.4), e(3.6, 42.3), e(5.8, 43.5), e(5.5, 47.4), e(3, 49.8), e(-1.6, 50), e(-4.3, 48.5), e(-5, 46)]);
      };
      const lensD = lens(-1) + lens(1);
      accFace.push(
        <g key="sg">
          <path d={lensD} fill={sk.ao} opacity={0.35} transform="translate(0.5 1.4)" filter={FF} />
          {line('tL', openPath([[100 - 11.8, 43.8], [100 - 14.4, 44.2], [100 - 15.9, 45]]), c, 1.5, 1)}
          {line('tR', openPath([[100 + 11.8, 43.8], [100 + 14.4, 44.2], [100 + 15.9, 45]]), c, 1.5, 1)}
          {part('lens', lensD, `url(#${uid}sg)`, c, [], pal, [
            <path key="rf" d={polyPath([[89, 50], [93.6, 42], [96.4, 42], [91.8, 50]]) + polyPath([[104.4, 50], [109, 42], [110.6, 42], [106, 50]])} fill={ac} opacity={0.55} />,
            <path key="rf2" d={polyPath([[93.4, 50], [96.6, 44], [97.6, 44], [94.4, 50]]) + polyPath([[107, 50], [110.4, 44], [111.2, 44], [107.8, 50]])} fill={lighten(ac, 0.5)} opacity={0.45} />,
          ], 1)}
          {line('fr', openPath([[100 - 11.9, 43.5], [100 - 6.4, 42.1], [100 - 1.9, 43.1], [100, 43.6], [100 + 1.9, 43.1], [100 + 6.4, 42.1], [100 + 11.9, 43.5]]), c, 1.5, 1)}
          {line('frH', openPath([[100 - 10, 42.5], [100 - 6.4, 41.8], [100 - 3, 42.3]]), '#ffffff', 0.5, 0.35)}
        </g>,
      );
    } else if (acc.id === 'chain_gold') {
      const p0: P = [100 - nw - 0.8, 73.5];
      const p2: P = [100 + nw + 0.8, 73.5];
      const low = 98 + 4 * s;
      const q1: P = [100, 2 * low - 73.5];
      const Q = (t: number): P => [lerp(lerp(p0[0], q1[0], t), lerp(q1[0], p2[0], t), t), lerp(lerp(p0[1], q1[1], t), lerp(q1[1], p2[1], t), t)];
      let len = 0;
      for (let i = 0; i < 20; i++) len += Math.hypot(Q((i + 1) / 20)[0] - Q(i / 20)[0], Q((i + 1) / 20)[1] - Q(i / 20)[1]);
      const N = Math.round(len / 2.9);
      const outer: string[] = [];
      const gold: string[] = [];
      const holes: string[] = [];
      const shine: string[] = [];
      for (let i = 0; i < N; i++) {
        const t = (i + 0.5) / N;
        const p = Q(t);
        const a = Q(Math.min(1, t + 0.01));
        const bq = Q(Math.max(0, t - 0.01));
        const deg = (Math.atan2(a[1] - bq[1], a[0] - bq[0]) * 180) / Math.PI;
        const flat = i % 2 === 1;
        outer.push(ell(p, 2.6, flat ? 1.15 : 1.85, deg));
        gold.push(ell(p, 2.2, flat ? 0.75 : 1.45, deg));
        if (!flat) holes.push(ell(p, 1.05, 0.5, deg));
        shine.push(ell([p[0] - 0.6, p[1] - 0.5], 0.9, 0.35, deg));
      }
      accChain.push(
        <g key="chain">
          <path d={openPath([p0, Q(0.25), Q(0.5), Q(0.75), p2])} fill="none" stroke={darken(c, 0.85)} strokeWidth={3.4} opacity={0.35} transform="translate(0.4 1.3)" filter={FF} />
          <path d={outer.join('')} fill={ac} />
          <path d={gold.join('')} fill={`url(#${uid}${acc.id})`} />
          <path d={holes.join('')} fill={darken(ac, 0.35)} />
          <path d={shine.join('')} fill="#fffbe6" opacity={0.85} />
        </g>,
      );
    } else if (acc.id === 'headphones') {
      for (const side of [-1, 1]) {
        const cc: P = [100 + side * (nw + 9 + 1.5 * s), 82 - 3 * s];
        const band = openPath([[cc[0] + side * 4.2, cc[1] - 2.6], [100 + side * (nw + 7.5), 68.5], [100 + side * (nw + 1.6), 64.4]]);
        const shell = ell(cc, 6.8, 5.2, side * 16);
        accNeck.push(
          <g key={`hp${side}`}>
            <path d={shell} fill={darken(c, 0.9)} opacity={0.35} transform="translate(0.6 1.6)" filter={FB} />
            {line('bnd', band, darken(c, 0.55), 3.4, 1)}
            {line('bnd2', band, c, 2.2, 1)}
            {line('bndP', band, ac, 0.8, 0.8)}
            {part('sh', shell, c, darken(c, 0.55), [...rim(shell, 1, 0.6), { k: 'hl', d: ell([cc[0] - 1.5, cc[1] + 1], 2.6, 1.5), o: 0.6 }], pal, [
              <path key="cu" d={ell([cc[0] - side * 0.6, cc[1] - 1.9], 5.4, 2.8, side * 16)} fill={ac} />,
              <path key="cu2" d={ell([cc[0] - side * 0.6, cc[1] - 2.2], 3.5, 1.4, side * 16)} fill={lighten(ac, 0.12)} />,
              <circle key="lg" cx={r1(cc[0] + side * 2.2)} cy={r1(cc[1] + 1.8)} r={0.9} fill={darken(c, 0.35)} />,
            ], 0.7)}
          </g>,
        );
      }
    }
  }

  const hatScaled = hatNodes.length > 0 && <g transform="translate(100 0) scale(0.87 1) translate(-100 2.4)">{hatNodes}</g>;

  const headNode = part('head', headD, `url(#${uid}hd)`, sk.line, faceMarks, skinPal, null, 0.9);

  const items = [top, bottom, shoes, head, acc].filter((x): x is ShopItem => !!x);
  const SHINY = ['robe_champion', 'shorts_gold', 'sneaker_gold', 'crown_gold', 'chain_gold'];
  const grad = (id: string, c: string, shiny = false) =>
    shiny ? (
      <linearGradient key={id} id={id} x1="0" y1="0" x2="1" y2="0.25">
        <stop offset="0" stopColor={darken(c, 0.1)} />
        <stop offset="0.28" stopColor={id.endsWith('robe_champion') ? mix(c, '#ff9a7a', 0.18) : lighten(c, 0.38)} />
        <stop offset="0.45" stopColor={c} />
        <stop offset="0.72" stopColor={darken(c, 0.3)} />
        <stop offset="0.86" stopColor={lighten(c, 0.12)} />
        <stop offset="1" stopColor={darken(c, 0.35)} />
      </linearGradient>
    ) : (
      <linearGradient key={id} id={id} x1="0" y1="0" x2="1" y2="0.15">
        <stop offset="0" stopColor={lighten(c, 0.12)} />
        <stop offset="0.45" stopColor={c} />
        <stop offset="0.62" stopColor={c} />
        <stop offset="1" stopColor={darken(c, 0.25)} />
      </linearGradient>
    );

  return (breathe) => (
    <>
      <defs>
        <filter id={`${uid}fb`} filterUnits="userSpaceOnUse" x="-20" y="-20" width="240" height="440">
          <feGaussianBlur stdDeviation="2.1" />
        </filter>
        <filter id={`${uid}ff`} filterUnits="userSpaceOnUse" x="-20" y="-20" width="240" height="440">
          <feGaussianBlur stdDeviation="0.85" />
        </filter>
        <linearGradient id={`${uid}sk`} x1="0" y1="0" x2="1" y2="0.12">
          <stop offset="0" stopColor={mix(sk.base, sk.hl, 0.6)} />
          <stop offset="0.42" stopColor={sk.base} />
          <stop offset="0.62" stopColor={sk.base} />
          <stop offset="1" stopColor={mix(sk.base, sk.sh, 0.7)} />
        </linearGradient>
        <radialGradient id={`${uid}hd`} cx="0.4" cy="0.38" r="0.72">
          <stop offset="0" stopColor={mix(sk.base, sk.hl, 0.5)} />
          <stop offset="0.6" stopColor={sk.base} />
          <stop offset="1" stopColor={mix(sk.base, sk.sh, 0.8)} />
        </radialGradient>
        <linearGradient id={`${uid}hr`} x1="0" y1="0" x2="0.3" y2="1">
          <stop offset="0" stopColor={lighten(hc, 0.18)} />
          <stop offset="0.5" stopColor={hc} />
          <stop offset="1" stopColor={darken(hc, 0.3)} />
        </linearGradient>
        <linearGradient id={`${uid}nk`} gradientUnits="userSpaceOnUse" x1="0" y1="67" x2="0" y2="80">
          <stop offset="0" stopColor={sk.base} />
          <stop offset="1" stopColor={sk.base} stopOpacity="0" />
        </linearGradient>
        <radialGradient id={`${uid}gs`}>
          <stop offset="0" stopColor="#000" stopOpacity="0.6" />
          <stop offset="0.6" stopColor="#000" stopOpacity="0.25" />
          <stop offset="1" stopColor="#000" stopOpacity="0" />
        </radialGradient>
        {items.map((it) => grad(`${uid}${it.id}`, it.color, SHINY.includes(it.id)))}
        {top?.id === 'robe_champion' && grad(`${uid}rc`, top.accent, true)}
        {acc?.id === 'sunglasses' && (
          <linearGradient id={`${uid}sg`} x1="0" y1="0" x2="0.3" y2="1">
            <stop offset="0" stopColor={lighten(acc.color, 0.18)} />
            <stop offset="0.5" stopColor={acc.color} />
            <stop offset="1" stopColor={mix(acc.color, acc.accent, 0.55)} />
          </linearGradient>
        )}
        {[...innerFilters.values()].map(({ id, pal }) => (
          <filter key={id} id={id} filterUnits="userSpaceOnUse" x="-20" y="-20" width="240" height="440" colorInterpolationFilters="sRGB">
            <feComponentTransfer in="SourceAlpha" result="inv">
              <feFuncA type="table" tableValues="1 0" />
            </feComponentTransfer>
            <feOffset in="inv" dx="-2.2" dy="-1.3" result="o1" />
            <feGaussianBlur in="o1" stdDeviation="1.9" result="b1" />
            <feComposite in="b1" in2="SourceAlpha" operator="in" result="m1" />
            <feFlood floodColor={pal.sh} floodOpacity={pal.sh === '#000000' ? 0.5 : 0.8} />
            <feComposite in2="m1" operator="in" result="s1" />
            <feOffset in="inv" dx="2.4" dy="1.5" result="o2" />
            <feGaussianBlur in="o2" stdDeviation="2" result="b2" />
            <feComposite in="b2" in2="SourceAlpha" operator="in" result="m2" />
            <feFlood floodColor={pal.hl} floodOpacity={pal.hl === '#ffffff' ? 0.2 : 0.6} />
            <feComposite in2="m2" operator="in" result="s2" />
            <feMerge>
              <feMergeNode in="s1" />
              <feMergeNode in="s2" />
            </feMerge>
          </filter>
        ))}
      </defs>
      <ellipse cx={100} cy={387} rx={46 + 14 * s} ry={7.5} fill={`url(#${uid}gs)`} />
      <g className={breathe}>
        {headBack.slice(0, style === 'long' ? 1 : 0)}
        {robeBack}
      </g>
      {legNodes}
      {footNodes}
      <g className={breathe}>
        {torsoNode}
        {neckNode}
      </g>
      {bottomNodes}
      {shoeNodes}
      <g className={breathe}>
        {top?.id === 'robe_champion' && beltNode}
        {topBody}
        {top?.id !== 'robe_champion' && beltNode}
        {armNodes}
        {sleeves}
        {handNodes}
        {accHand}
        {accChain}
        {robeOver}
        {accNeck}
        {headBack.slice(style === 'long' ? 1 : 0)}
        {headNode}
        <g>{mergePaths(face)}</g>
        {accFace}
        {hairNodes}
        {hatScaled}
      </g>
    </>
  );
}
