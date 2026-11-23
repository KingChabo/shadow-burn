import { describe, expect, it } from 'vitest';
import { createJacksCounter, createPlankCounter, createSquatCounter, type Keypoint } from '../features/pose/counters';

const kp = (x: number, y: number): Keypoint => ({ x, y, score: 0.9 });
function body(points: Record<number, [number, number]>): Keypoint[] {
  return Array.from({ length: 17 }, (_, i) => (points[i] ? kp(...points[i]) : { x: 0, y: 0, score: 0.05 }));
}

/** Kniebeuge seitlich: Knöchel fest, Knie vorn, Hüfte so gesetzt, dass der Kniewinkel stimmt */
function squatFrame(kneeAngle: number): Keypoint[] {
  const ankle: [number, number] = [300, 600];
  const knee: [number, number] = [320, 480];
  const shin = Math.atan2(ankle[1] - knee[1], ankle[0] - knee[0]);
  const thigh = shin + (kneeAngle * Math.PI) / 180; // Oberschenkel nach hinten-oben
  const hip: [number, number] = [knee[0] + 120 * Math.cos(thigh), knee[1] + 120 * Math.sin(thigh)];
  return body({ 5: [hip[0] + 20, hip[1] - 150], 11: hip, 13: knee, 15: ankle });
}

describe('Kniebeugen-Zähler', () => {
  it('zählt tiefe Kniebeugen, halbe sind ungültig', () => {
    const c = createSquatCounter();
    const full = [175, 170, 150, 120, 95, 85, 95, 130, 165, 175];
    const half = [175, 150, 125, 115, 125, 150, 175];
    for (let r = 0; r < 2; r++) for (const a of full) for (let i = 0; i < 3; i++) c.update(squatFrame(a));
    for (const a of half) for (let i = 0; i < 3; i++) c.update(squatFrame(a));
    expect(c.state().reps).toBe(2);
    expect(c.state().invalid).toBe(1);
  });
  it('liegend zählt nichts', () => {
    const c = createSquatCounter();
    const lying = body({ 5: [100, 500], 11: [250, 505], 13: [380, 505], 15: [500, 510] });
    for (let i = 0; i < 20; i++) c.update(lying);
    expect(c.state().reps).toBe(0);
  });
});

/** Hampelmann von vorn */
function jackFrame(open: boolean, legs = open): Keypoint[] {
  const p: Record<number, [number, number]> = {
    0: [300, 100], 5: [270, 160], 6: [330, 160], 11: [280, 320], 12: [320, 320],
    9: open ? [240, 60] : [250, 330], 10: open ? [360, 60] : [350, 330],
    15: legs ? [230, 560] : [290, 560], 16: legs ? [370, 560] : [310, 560],
  };
  return body(p);
}

describe('Hampelmann-Zähler', () => {
  it('zählt zu → auf → zu', () => {
    const c = createJacksCounter();
    for (let r = 0; r < 4; r++) for (const o of [false, true, false]) for (let i = 0; i < 2; i++) c.update(jackFrame(o));
    expect(c.state().reps).toBe(4);
  });
  it('nur Arme ohne Beine → ungültig', () => {
    const c = createJacksCounter();
    for (const o of [false, true, false]) for (let i = 0; i < 2; i++) c.update(jackFrame(o, false));
    expect(c.state().reps).toBe(0);
    expect(c.state().invalid).toBe(1);
  });
});

function plankFrame(sag = 0): Keypoint[] {
  return body({ 5: [150, 400], 7: [150, 460], 11: [300, 405 + sag], 13: [400, 410], 15: [480, 415] });
}

describe('Plank-Zähler', () => {
  it('zählt nur Sekunden mit gerader Linie', () => {
    let t = 0;
    const c = createPlankCounter(() => t);
    for (let i = 0; i <= 100; i++) { t += 100; c.update(plankFrame()); } // 10 s gerade
    expect(c.state().reps).toBe(10);
    for (let i = 0; i < 50; i++) { t += 100; c.update(plankFrame(90)); } // 5 s Hüfte hängt
    expect(c.state().reps).toBeLessThanOrEqual(11);
    expect(c.state().invalid).toBe(1);
  });
});

// ---------- Teilkörper: nicht mehr der ganze Körper nötig ----------
import { createPushupCounter, type RepCounter } from '../features/pose/counters';

/** Liegestütz seitlich: Hand auf dem Boden, Schulter senkrecht darüber, Ellbogen nach hinten */
function pushFrame(elbowDeg: number, opts: { legs?: boolean; sag?: number; arm?: boolean } = {}): Keypoint[] {
  const { legs = false, sag = 0, arm = true } = opts;
  const wrist: [number, number] = [100, 500];
  const L = 60;
  const d = Math.sqrt(2 * L * L - 2 * L * L * Math.cos((elbowDeg * Math.PI) / 180));
  const shoulder: [number, number] = [100, 500 - d];
  const h = Math.sqrt(Math.max(0, L * L - (d / 2) ** 2));
  const elbow: [number, number] = [100 + h, 500 - d / 2];
  const p: Record<number, [number, number]> = { 0: [70, shoulder[1] - 10], 5: shoulder, 9: wrist };
  if (arm) p[7] = elbow;
  if (legs) {
    const ankle: [number, number] = [480, 495];
    p[11] = [(shoulder[0] + ankle[0]) / 2, (shoulder[1] + ankle[1]) / 2 + sag];
    p[13] = [(p[11][0] + ankle[0]) / 2, (p[11][1] + ankle[1]) / 2];
    p[15] = ankle;
  }
  return body(p);
}
const feed = (c: RepCounter, frames: Keypoint[][], n = 3) => { for (const f of frames) for (let i = 0; i < n; i++) c.update(f); };
const FULL = [178, 165, 140, 115, 95, 85, 95, 120, 150, 170, 178];

describe('Liegestütz-Zähler', () => {
  it('zählt seitlich nur mit Arm im Bild (Beine fehlen)', () => {
    const c = createPushupCounter();
    for (let r = 0; r < 3; r++) feed(c, FULL.map((a) => pushFrame(a)));
    expect(c.state().reps).toBe(3);
    expect(c.state().invalid).toBe(0);
  });
  it('zählt mit ganzem Körper, hängende Hüfte ist ungültig', () => {
    const c = createPushupCounter();
    feed(c, FULL.map((a) => pushFrame(a, { legs: true })));
    expect(c.state().reps).toBe(1);
    feed(c, FULL.map((a) => pushFrame(a, { legs: true, sag: 100 })));
    expect(c.state().reps).toBe(1);
    expect(c.state().invalid).toBe(1);
  });
  it('halbe Liegestütze sind ungültig', () => {
    const c = createPushupCounter();
    feed(c, [178, 160, 140, 125, 140, 160, 178].map((a) => pushFrame(a)));
    expect(c.state().reps).toBe(0);
    expect(c.state().invalid).toBe(1);
  });
  it('zählt auch ohne erkannten Ellbogen (Handy vorn): Schulterhöhe über den Händen', () => {
    const c = createPushupCounter();
    // Von vorn: beide Schultern und Hände, kein Ellbogen
    const front = (drop: number) => body({ 0: [300, 370 + drop], 5: [260, 380 + drop], 6: [340, 380 + drop], 9: [250, 500], 10: [350, 500] });
    for (let r = 0; r < 2; r++) feed(c, [0, 20, 50, 80, 100, 80, 40, 10, 0].map(front));
    expect(c.state().reps).toBe(2);
  });
  it('stehende Bizeps-Curls zählen nicht', () => {
    const c = createPushupCounter();
    const curl = (y: number) => body({ 5: [300, 200], 7: [300, 280], 9: [330, y], 11: [300, 400] });
    for (let r = 0; r < 3; r++) feed(c, [350, 320, 280, 230, 210, 230, 280, 350].map(curl));
    expect(c.state().reps).toBe(0);
  });
});

describe('Kniebeuge ohne Füße im Bild', () => {
  it('Oberschenkel reicht (Füße fehlen)', () => {
    const c = createSquatCounter();
    // Knie fest, Oberschenkel kippt von senkrecht (0°) bis waagerecht (85°)
    const f = (deg: number) => {
      const knee: [number, number] = [320, 480];
      const t = (deg * Math.PI) / 180;
      const hip: [number, number] = [knee[0] - 120 * Math.sin(t), knee[1] - 120 * Math.cos(t)];
      return body({ 5: [hip[0] + 30, hip[1] - 150], 11: hip, 13: knee });
    };
    for (let r = 0; r < 2; r++) feed(c, [0, 20, 45, 70, 85, 70, 40, 15, 0].map(f));
    feed(c, [0, 25, 50, 25, 0].map(f)); // nur halb
    expect(c.state().reps).toBe(2);
    expect(c.state().invalid).toBe(1);
  });
  it('nur Oberkörper bis Hüfte (Handy nah dran)', () => {
    const c = createSquatCounter();
    const f = (drop: number) => body({ 0: [300, 60 + drop], 5: [300, 100 + drop], 11: [300, 300 + drop] });
    for (let r = 0; r < 3; r++) feed(c, [0, 30, 70, 120, 150, 120, 60, 20, 0].map(f));
    expect(c.state().reps).toBe(3);
  });
});

describe('Hampelmann ohne Beine im Bild', () => {
  it('zählt nur mit Armen', () => {
    const c = createJacksCounter();
    const f = (open: boolean) => body({ 0: [300, 100], 5: [270, 160], 6: [330, 160], 9: open ? [240, 60] : [250, 330], 10: open ? [360, 60] : [350, 330] });
    for (let r = 0; r < 3; r++) for (const o of [false, true, false]) for (let i = 0; i < 2; i++) c.update(f(o));
    expect(c.state().reps).toBe(3);
  });
});

describe('Plank ohne Beine im Bild', () => {
  it('zählt Sekunden mit waagerechtem Rumpf auf den Unterarmen', () => {
    let t = 0;
    const c = createPlankCounter(() => t);
    const f = body({ 5: [150, 400], 7: [150, 460], 11: [300, 405] });
    for (let i = 0; i <= 50; i++) { t += 100; c.update(f); }
    expect(c.state().reps).toBe(5);
    // Aufrecht sitzen zählt nicht
    const sit = body({ 5: [300, 200], 7: [300, 280], 11: [300, 400] });
    for (let i = 0; i < 30; i++) { t += 100; c.update(sit); }
    expect(c.state().reps).toBe(5);
  });
});

import { cropAround } from '../features/pose/movenet';
describe('Bildausschnitt für die KI', () => {
  it('schneidet um eine kleine Person herum aus, bei zu wenig Punkten ganzes Bild', () => {
    const small = body({ 0: [300, 400], 5: [290, 410], 6: [310, 410], 9: [280, 450], 10: [320, 450], 11: [300, 440] });
    const b = cropAround(small, 640, 480)!;
    expect(b.size).toBeCloseTo(320); // mind. halbes Bild
    expect(b.x + b.size / 2).toBeCloseTo(300);
    expect(cropAround(body({ 5: [10, 10], 6: [20, 10] }), 640, 480)).toBeNull();
  });
});
