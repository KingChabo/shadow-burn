import { describe, expect, it } from 'vitest';
import {
  CAMERA_COUNTERS, createBurpeeCounter, createDipCounter, createGluteBridgeCounter, createHighKneesCounter, createLungeCounter,
  createMountainCounter, createPullupCounter, createWallSitCounter, type Keypoint, type RepCounter,
} from '../features/pose/counters';
import { ACTIVITIES } from '../data/activities';

const kp = (x: number, y: number): Keypoint => ({ x, y, score: 0.9 });
function body(points: Record<number, [number, number]>): Keypoint[] {
  return Array.from({ length: 17 }, (_, i) => (points[i] ? kp(...points[i]) : { x: 0, y: 0, score: 0.05 }));
}
const feed = (c: RepCounter, frames: Keypoint[][], times = 3) => { for (const f of frames) for (let i = 0; i < times; i++) c.update(f); };
const rad = (d: number) => (d * Math.PI) / 180;
/** Punkt in Abstand len von p, so dass der Winkel zwischen (q - p) und dem Ergebnis `deg` Grad ist (gegen den Uhrzeigersinn im Bild) */
function at(p: [number, number], q: [number, number], deg: number, len: number, flip = 1): [number, number] {
  const u = Math.atan2(q[1] - p[1], q[0] - p[0]) + flip * rad(deg);
  return [p[0] + len * Math.cos(u), p[1] + len * Math.sin(u)];
}

describe('Klimmzug-Zähler', () => {
  // p = 0 hängen, 1 Kopf auf Höhe der Hände
  const f = (p: number) => body({ 0: [300, 220 - 125 * p], 5: [270, 250 - 125 * p], 6: [330, 250 - 125 * p], 9: [260, 100], 10: [340, 100] });
  it('zählt ganz hoch und ganz runter, halbe sind ungültig', () => {
    const c = createPullupCounter();
    const full = [0, 0.3, 0.6, 0.9, 1, 1, 0.7, 0.3, 0, 0];
    const half = [0, 0.3, 0.55, 0.6, 0.3, 0, 0];
    feed(c, [...full, ...full].map(f));
    feed(c, half.map(f));
    expect(c.state().reps).toBe(2);
    expect(c.state().invalid).toBe(1);
  });
  it('Hände unten (nicht an der Stange) zählt nichts', () => {
    const c = createPullupCounter();
    const stand = (p: number) => body({ 0: [300, 100 - 20 * p], 5: [270, 150], 6: [330, 150], 9: [260, 300], 10: [340, 300] });
    feed(c, [0, 1, 0, 1, 0].map(stand));
    expect(c.state().reps).toBe(0);
  });
  it('Chin-ups nutzen denselben Zähler', () => expect(CAMERA_COUNTERS.chinup).toBe(createPullupCounter));
});

describe('Dip-Zähler', () => {
  const f = (a: number) => { const S: [number, number] = [300, 200], E: [number, number] = [300, 300]; return body({ 5: S, 7: E, 9: [300 + 90 * Math.sin(rad(a)), 300 - 90 * Math.cos(rad(a))], 11: [305, 420] }); };
  it('zählt tiefe Dips, halbe sind ungültig', () => {
    const c = createDipCounter();
    const full = [175, 160, 130, 100, 88, 100, 140, 170, 175];
    const half = [175, 150, 130, 125, 140, 170, 175];
    feed(c, [...full, ...full].map(f));
    feed(c, half.map(f));
    expect(c.state().reps).toBe(2);
    expect(c.state().invalid).toBe(1);
  });
});

describe('Ausfallschritt-Zähler', () => {
  const f = (a: number) => {
    const L = { a: [250, 600] as [number, number], k: [270, 480] as [number, number] };
    const R = { a: [450, 600] as [number, number], k: [420, 520] as [number, number] };
    const hip = at(L.k, L.a, a, 120);
    const hipR = at(R.k, R.a, Math.min(178, a + 5), 120, -1);
    return body({ 5: [hip[0], hip[1] - 150], 11: hip, 13: L.k, 15: L.a, 12: hipR, 14: R.k, 16: R.a });
  };
  it('zählt tiefe Ausfallschritte', () => {
    const c = createLungeCounter();
    const full = [175, 160, 130, 100, 90, 100, 140, 170, 175];
    feed(c, [...full, ...full, ...full].map(f));
    expect(c.state().reps).toBe(3);
  });
});

describe('High-Knees-Zähler', () => {
  const f = (l: number, r: number) => body({ 11: [280, 320], 12: [320, 320], 13: [280, 440 - 120 * l], 14: [320, 440 - 120 * r] });
  it('zählt jedes Knie bis Hüfthöhe', () => {
    const c = createHighKneesCounter();
    const frames: Keypoint[][] = [f(0, 0)];
    for (let i = 0; i < 4; i++) for (const p of [0.4, 0.9, 1, 0.5, 0]) frames.push(i % 2 ? f(0, p) : f(p, 0));
    feed(c, frames, 2);
    expect(c.state().reps).toBe(4);
  });
  it('zu niedrig = ungültig', () => {
    const c = createHighKneesCounter();
    feed(c, [f(0, 0), f(0.3, 0), f(0.6, 0), f(0.3, 0), f(0, 0)], 2);
    expect(c.state().reps).toBe(0);
    expect(c.state().invalid).toBe(1);
  });
});

describe('Mountain-Climber-Zähler', () => {
  const S: [number, number] = [150, 400], H: [number, number] = [300, 405];
  const f = (l: number, r: number) => body({ 5: S, 6: [152, 402], 11: H, 12: [302, 406], 13: at(H, S, l, 100, -1), 14: at([302, 406], [152, 402], r, 100, -1) });
  it('zählt jedes Knie zur Brust, abwechselnd', () => {
    let t = 0;
    const c = createMountainCounter(() => (t += 50));
    const frames: Keypoint[][] = [f(170, 170)];
    for (let i = 0; i < 6; i++) for (const a of [150, 120, 95, 120, 170]) frames.push(i % 2 ? f(170, a) : f(a, 170));
    feed(c, frames, 2);
    expect(c.state().reps).toBe(6);
  });
  it('stehend zählt nichts', () => {
    const c = createMountainCounter();
    feed(c, [body({ 5: [300, 200], 11: [300, 350], 13: [300, 470] }), body({ 5: [300, 200], 11: [300, 350], 13: [380, 350] })], 5);
    expect(c.state().reps).toBe(0);
  });
});

describe('Burpee-Zähler', () => {
  const stand = (hands = false) => body({ 0: [300, 160], 5: [300, 200], 11: [300, 350], 9: hands ? [300, 100] : [300, 330] });
  const floor = body({ 0: [180, 495], 5: [200, 500], 11: [350, 505], 9: [200, 600] });
  it('zählt Stehen → Liegestütz → Stehen → Sprung mit Armen hoch', () => {
    let t = 0;
    const c = createBurpeeCounter(() => (t += 100));
    for (let i = 0; i < 3; i++) feed(c, [stand(), floor, stand(), stand(true)]);
    expect(c.state().reps).toBe(3);
  });
  it('ohne Sprung = ungültig', () => {
    let t = 0;
    const c = createBurpeeCounter(() => (t += 100));
    feed(c, [stand(), floor, stand()]);
    for (let i = 0; i < 30; i++) c.update(stand());
    expect(c.state().reps).toBe(0);
    expect(c.state().invalid).toBe(1);
  });
});

describe('Glute-Bridge-Zähler', () => {
  const S: [number, number] = [100, 500], H: [number, number] = [250, 500];
  const f = (a: number) => body({ 5: S, 11: H, 13: [H[0] - 100 * Math.cos(rad(a)), H[1] - 100 * Math.sin(rad(a))] });
  it('zählt Hüfte ganz hoch, halb hoch = ungültig', () => {
    const c = createGluteBridgeCounter();
    const full = [135, 145, 155, 165, 170, 160, 145, 135];
    const half = [135, 142, 148, 150, 142, 135];
    feed(c, [...full, ...full].map(f));
    feed(c, half.map(f));
    expect(c.state().reps).toBe(2);
    expect(c.state().invalid).toBe(1);
  });
});

describe('Wandsitzen-Zähler', () => {
  function sit(kneeAngle: number): Keypoint[] {
    const ankle: [number, number] = [300, 600], knee: [number, number] = [320, 480];
    const hip = at(knee, ankle, kneeAngle, 120);
    return body({ 5: [hip[0] + 5, hip[1] - 150], 11: hip, 13: knee, 15: ankle });
  }
  it('zählt nur Sekunden mit rechtwinkligem Knie', () => {
    let t = 0;
    const c = createWallSitCounter(() => t);
    for (let i = 0; i < 20; i++) { t += 100; c.update(sit(175)); } // steht noch
    expect(c.state().reps).toBe(0);
    for (let i = 0; i <= 100; i++) { t += 100; c.update(sit(92)); } // 10 s sitzen (Glättung kostet ~0,5 s)
    expect(c.state().reps).toBeGreaterThanOrEqual(9);
    expect(c.state().reps).toBeLessThanOrEqual(10);
    for (let i = 0; i < 30; i++) { t += 100; c.update(sit(130)); } // zu hoch
    expect(c.state().reps).toBeLessThanOrEqual(11);
    expect(c.state().invalid).toBe(1);
  });
});

describe('Kamera-Modus in den Übungen', () => {
  it('jede Übung mit Kamera-Modus hat einen Zähler', () => {
    for (const a of ACTIVITIES) if (a.modes.includes('camera')) expect(CAMERA_COUNTERS[a.id], a.id).toBeTypeOf('function');
  });
});
