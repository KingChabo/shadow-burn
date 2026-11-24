import { describe, expect, it } from 'vitest';
import { angleDeg, createJumpCounter, G, JUMP, motionCounterFor, type MotionCounter } from '../features/motion';
import { ACT, ACTIVITIES, startMode } from '../data/activities';

let t = 0;

describe('Winkel', () => {
  it('rechnet Grad zwischen Richtungen', () => {
    expect(angleDeg({ x: 0, y: 1, z: 0 }, { x: 0, y: 0, z: 1 })).toBeCloseTo(90);
    expect(angleDeg({ x: 0, y: 1, z: 0 }, { x: 0, y: 1, z: 1 })).toBeCloseTo(45);
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
  it('jede Übung mit Sprung-Zähler hat einen Zähler', () => {
    for (const a of ACTIVITIES) {
      if (a.modes.includes('jump')) expect(motionCounterFor(a.id), a.id).not.toBeNull();
      if (a.modes.includes('gps')) expect(a.unit, a.id).toBe('distance');
    }
  });
  it('Hosentasche gibt es nicht mehr', () => {
    for (const a of ACTIVITIES) expect(a.modes as string[], a.id).not.toContain('pocket');
  });
  it('wer Hosentasche gespeichert hatte, zählt wieder selbst bzw. mit Timer', () => {
    for (const id of ['squat', 'lunge', 'splitsquat', 'stepup', 'jumpsquat'] as const) expect(startMode(ACT[id], 'pocket'), id).toBe('manual');
    expect(startMode(ACT.wallsit, 'pocket')).toBe('timer');
    expect(startMode(ACT.squat, 'camera')).toBe('camera');
    expect(startMode(ACT.squat, undefined)).toBe('camera');
  });
});
