import { describe, expect, it } from 'vitest';
import { angleDeg, createJumpCounter, createPocketCounter, createPocketHoldCounter, G, JUMP, motionCounterFor, POCKET_HOLD, POCKET_REPS, type MotionCounter, type Vec } from '../features/motion';
import { ACTIVITIES } from '../data/activities';

const rad = (d: number) => (d * Math.PI) / 180;
/** Handy steckt in der Tasche, Oberschenkel um `deg` aus der Senkrechten gekippt. `roll` dreht das Handy in der Tasche. */
function thigh(deg: number, roll = 0): Vec {
  const y = G * Math.cos(rad(deg)), z = G * Math.sin(rad(deg));
  return { x: z * Math.sin(rad(roll)), y, z: z * Math.cos(rad(roll)) };
}
let t = 0;
const run = (c: MotionCounter, deg: number, ms: number, roll = 0) => { for (let e = 0; e < ms; e += 20) c.update(thigh(deg, roll), (t += 20)); };
/** Weich von a nach b in ms */
const move = (c: MotionCounter, a: number, b: number, ms: number) => { for (let e = 0; e <= ms; e += 20) c.update(thigh(a + ((b - a) * e) / ms), (t += 20)); };

describe('Winkel', () => {
  it('rechnet Grad zwischen Richtungen', () => {
    expect(angleDeg({ x: 0, y: 1, z: 0 }, { x: 0, y: 0, z: 1 })).toBeCloseTo(90);
    expect(angleDeg(thigh(0), thigh(70, 40))).toBeCloseTo(70, 0);
  });
});

describe('Hosentasche: Kniebeugen', () => {
  it('wartet erst auf Ruhe, dann zählt jede tiefe Kniebeuge', () => {
    const c = createPocketCounter(POCKET_REPS.squat!);
    // Handy wird eingesteckt: wackelt
    for (let i = 0; i < 30; i++) c.update({ x: Math.sin(i) * 6, y: G + Math.cos(i * 1.7) * 5, z: 2 }, (t += 20));
    expect(c.state().ready).toBe(false);
    run(c, 3, 1200);
    expect(c.state().ready).toBe(true);
    for (let r = 0; r < 5; r++) { move(c, 3, 85, 900); run(c, 85, 200); move(c, 85, 3, 900); run(c, 3, 300); }
    expect(c.state().reps).toBe(5);
    expect(c.state().invalid).toBe(0);
  });
  it('halbe Kniebeugen sind ungültig, Gehen zählt nicht', () => {
    const c = createPocketCounter(POCKET_REPS.squat!);
    run(c, 0, 1200);
    move(c, 0, 45, 700); move(c, 45, 0, 700); run(c, 0, 300);
    expect(c.state().reps).toBe(0);
    expect(c.state().invalid).toBe(1);
    // Gehen: Oberschenkel schwingt ±25°
    for (let i = 0; i < 20; i++) { move(c, 0, 25, 300); move(c, 25, 0, 300); }
    expect(c.state().reps).toBe(0);
    expect(c.state().invalid).toBe(1);
  });
  it('egal wie herum das Handy steckt', () => {
    const c = createPocketCounter(POCKET_REPS.squat!);
    for (let e = 0; e < 1200; e += 20) c.update(thigh(0, 0), (t += 20));
    for (let r = 0; r < 3; r++) {
      for (let e = 0; e <= 900; e += 20) c.update(thigh((85 * e) / 900, 120), (t += 20));
      for (let e = 0; e <= 900; e += 20) c.update(thigh(85 - (85 * e) / 900, 120), (t += 20));
      run(c, 0, 300);
    }
    expect(c.state().reps).toBe(3);
  });
  it('neu kalibrieren setzt die Startlage zurück', () => {
    const c = createPocketCounter(POCKET_REPS.squat!);
    run(c, 0, 1200);
    c.recalibrate();
    expect(c.state().ready).toBe(false);
    run(c, 30, 1200); // Handy steckt jetzt schräg
    move(c, 30, 110, 900); move(c, 110, 30, 900); run(c, 30, 300);
    expect(c.state().reps).toBe(1);
  });
});

describe('Hosentasche: Wandsitzen', () => {
  it('Uhr läuft nur mit waagerechtem Oberschenkel', () => {
    const c = createPocketHoldCounter(POCKET_HOLD.wallsit!);
    run(c, 0, 1200);
    move(c, 0, 88, 1000);
    run(c, 88, 10000);
    expect(c.state().reps).toBeGreaterThanOrEqual(9);
    expect(c.state().reps).toBeLessThanOrEqual(11);
    const before = c.state().reps;
    move(c, 88, 45, 300);
    run(c, 45, 3000); // zu hoch
    expect(c.state().reps).toBeLessThanOrEqual(before + 1);
    expect(c.state().invalid).toBe(1);
  });
});

describe('Sprung-Zähler', () => {
  /** Ein Sprung: kurz fast schwerelos, dann harte Landung */
  const jump = (c: MotionCounter, landG: number, gapMs: number) => {
    for (let e = 0; e < gapMs - 60; e += 10) c.update({ x: 0, y: G * 0.3, z: 0 }, (t += 10));
    for (let e = 0; e < 40; e += 10) c.update({ x: 0, y: G * landG, z: 1 }, (t += 10));
    for (let e = 0; e < 20; e += 10) c.update({ x: 0, y: G, z: 0 }, (t += 10));
  };
  it('zählt jede Landung, erst nach kurzer Ruhe', () => {
    const c = createJumpCounter(JUMP.jumprope!);
    jump(c, 2.5, 300); // noch nicht bereit (Handy wird eingesteckt)
    expect(c.state().reps).toBe(0);
    for (let e = 0; e < 800; e += 20) c.update({ x: 0, y: G, z: 0 }, (t += 20));
    expect(c.state().ready).toBe(true);
    for (let i = 0; i < 50; i++) jump(c, 2.2, 400);
    expect(c.state().reps).toBe(50);
  });
  it('Doppelstoß in einer Landung zählt einmal', () => {
    const c = createJumpCounter(JUMP.jacks!);
    for (let e = 0; e < 800; e += 20) c.update({ x: 0, y: G, z: 0 }, (t += 20));
    for (let i = 0; i < 10; i++) { jump(c, 2, 600); jump(c, 1.9, 100); }
    expect(c.state().reps).toBe(10);
  });
  it('leichte Schritte zählen nicht', () => {
    const c = createJumpCounter(JUMP.tuckjump!);
    for (let e = 0; e < 800; e += 20) c.update({ x: 0, y: G, z: 0 }, (t += 20));
    for (let i = 0; i < 10; i++) jump(c, 1.4, 800);
    expect(c.state().reps).toBe(0);
  });
});

describe('Modi in den Übungen', () => {
  it('jede Übung mit Hosentasche/Sprung hat einen Zähler', () => {
    for (const a of ACTIVITIES) {
      if (a.modes.includes('pocket')) expect(motionCounterFor(a.id, 'pocket'), a.id).not.toBeNull();
      if (a.modes.includes('jump')) expect(motionCounterFor(a.id, 'jump'), a.id).not.toBeNull();
      if (a.modes.includes('gps')) expect(a.unit, a.id).toBe('distance');
    }
  });
  it('Halte-Übungen mit Hosentasche sind Zeit-Übungen', () => {
    for (const id of Object.keys(POCKET_HOLD)) expect(ACTIVITIES.find((a) => a.id === id)!.unit).toBe('time');
  });
});
