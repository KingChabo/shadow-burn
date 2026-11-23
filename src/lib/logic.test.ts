import { describe, expect, it } from 'vitest';
import { computePoints, computeGems, basePoints } from './scoring';
import { checkStreak, registerActiveDay, buyLock, emptyStreak } from './streak';
import { levelFromXp, xpForLevel } from './level';
import { addDays, daysBetween, dayKey } from './date';
import { questsFor } from './quests';
import { createPushupCounter, createSitupCounter, createTiltCounter, type Keypoint } from '../features/pose/counters';

const base = { formValidated: false, streakDays: 0, isRecord: false, pointsTodayBefore: 0 };

describe('Punkte', () => {
  it('Basis je Übung', () => {
    expect(basePoints({ activityId: 'pushup', reps: 10 })).toBe(20);
    expect(basePoints({ activityId: 'plank', seconds: 64 })).toBe(12);
    expect(basePoints({ activityId: 'jog', km: 3 })).toBe(30);
  });
  it('Formbonus, Streak, Rekord', () => {
    const p = computePoints({ ...base, activityId: 'pushup', reps: 10, formValidated: true, streakDays: 10, isRecord: true });
    // 20 * 1.2 = 24 * 1.2 = 28.8 + 50
    expect(p.total).toBe(79);
  });
  it('Streak-Bonus max +50 %', () => {
    expect(computePoints({ ...base, activityId: 'squat', reps: 100, streakDays: 400 }).total).toBe(225);
  });
  it('Pace-Bonus', () => {
    expect(computePoints({ ...base, activityId: 'jog', km: 10, pace: 4.5 }).total).toBe(130);
    expect(computePoints({ ...base, activityId: 'jog', km: 10, pace: 5.5 }).total).toBe(110);
    expect(computePoints({ ...base, activityId: 'jog', km: 10, pace: 3.5 }).total).toBe(140);
    expect(computePoints({ ...base, activityId: 'jog', km: 10, pace: 6.5 }).total).toBe(100);
  });
  it('Anti-Farming über 1500', () => {
    const p = computePoints({ ...base, activityId: 'pushup', reps: 100, pointsTodayBefore: 1450 });
    expect(p.total).toBe(50 + 75);
  });
  it('Gems', () => {
    const g = computeGems({ points: 60, firstToday: true, isRecord: true, rng: () => 0.1 });
    expect(g.reduce((s, x) => s + x.amount, 0)).toBe(6);
    expect(computeGems({ points: 10, firstToday: false, isRecord: false, rng: () => 0.9 })).toHaveLength(0);
  });
});

describe('Streak', () => {
  it('zählt hoch und nur einmal pro Tag', () => {
    let s = emptyStreak();
    s = registerActiveDay(s, '2026-01-01').state;
    s = registerActiveDay(s, '2026-01-01').state;
    s = registerActiveDay(s, '2026-01-02').state;
    expect(s.current).toBe(2);
    expect(s.longest).toBe(2);
  });
  it('Meilenstein Tag 7', () => {
    let s = { ...emptyStreak(), current: 6, longest: 6, lastActiveDay: '2026-03-06' };
    const r = registerActiveDay(s, '2026-03-07');
    expect(r.milestoneGems).toBe(10);
  });
  it('ein verpasster Tag pro Woche ist ein freier Ruhetag', () => {
    const s = { current: 5, longest: 5, lastActiveDay: '2026-01-01', locks: 0 };
    const r = checkStreak(s, '2026-01-03');
    expect(r.broken).toBe(false);
    expect(r.usedRest).toBe(true);
    expect(r.state.restDay).toBe('2026-01-02');
    expect(registerActiveDay(r.state, '2026-01-03').state.current).toBe(6);
    // drei Tage später wieder ein Tag Pause: Ruhetag noch nicht wieder frei, ohne Lock reißt sie
    const r2 = checkStreak({ ...registerActiveDay(r.state, '2026-01-04').state }, '2026-01-06');
    expect(r2.broken).toBe(true);
    // nach 7 Tagen ist er wieder frei
    const r3 = checkStreak({ current: 9, longest: 9, lastActiveDay: '2026-01-08', locks: 0, restDay: '2026-01-02' }, '2026-01-10');
    expect(r3.broken).toBe(false);
  });
  it('Lock rettet einen verpassten Tag', () => {
    const s = { current: 5, longest: 5, lastActiveDay: '2026-01-01', locks: 2, restDay: '2025-12-30' };
    const r = checkStreak(s, '2026-01-03');
    expect(r.usedLocks).toBe(1);
    expect(r.state.locks).toBe(1);
    expect(r.state.current).toBe(5);
    expect(registerActiveDay(r.state, '2026-01-03').state.current).toBe(6);
  });
  it('zu wenig Locks → Streak reißt, Locks bleiben', () => {
    const r = checkStreak({ current: 9, longest: 9, lastActiveDay: '2026-01-01', locks: 1 }, '2026-01-05');
    expect(r.broken).toBe(true);
    expect(r.state.current).toBe(0);
    expect(r.state.locks).toBe(1);
    expect(r.state.longest).toBe(9);
  });
  it('gestern aktiv → nichts passiert', () => {
    expect(checkStreak({ current: 3, longest: 3, lastActiveDay: '2026-01-01', locks: 0 }, '2026-01-02').broken).toBe(false);
  });
  it('Sommerzeit-Wechsel (29./30. März) zählt korrekt', () => {
    expect(daysBetween('2026-03-28', '2026-03-30')).toBe(2);
    expect(daysBetween('2026-10-24', '2026-10-26')).toBe(2);
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
  });
  it('Mitternacht: lokales Datum', () => {
    expect(dayKey(new Date(2026, 4, 1, 23, 59, 59))).toBe('2026-05-01');
    expect(dayKey(new Date(2026, 4, 2, 0, 0, 1))).toBe('2026-05-02');
  });
  it('Lock kaufen: 30 Gems, max 2', () => {
    expect(buyLock(emptyStreak(), 29)).toBeNull();
    expect(buyLock(emptyStreak(), 30)!.gems).toBe(0);
    expect(buyLock({ ...emptyStreak(), locks: 2 }, 100)).toBeNull();
  });
});

describe('Level', () => {
  it('Kurve 100 * n^1.5', () => {
    expect(xpForLevel(1)).toBe(100);
    expect(xpForLevel(4)).toBe(800);
    expect(levelFromXp(0).level).toBe(1);
    expect(levelFromXp(99).level).toBe(1);
    expect(levelFromXp(100).level).toBe(2);
    expect(levelFromXp(100 + 283).level).toBe(3);
  });
});

describe('Tagesaufträge', () => {
  it('deterministisch, 3 verschiedene', () => {
    const a = questsFor('2026-11-21'), b = questsFor('2026-11-21');
    expect(a).toEqual(b);
    expect(new Set(a.map((q) => q.activityId)).size).toBe(3);
  });
});

// ---------- Kamera-Zähler mit synthetischen Skeletten ----------
const kp = (x: number, y: number): Keypoint => ({ x, y, score: 0.9 });
function body(points: Record<number, [number, number]>): Keypoint[] {
  return Array.from({ length: 17 }, (_, i) => (points[i] ? kp(...points[i]) : { x: 0, y: 0, score: 0.05 }));
}
// Liegestütz in Seitenansicht (linke Seite), Elbogenwinkel über Ellbogenposition gesteuert
function pushupFrame(elbowAngle: number, sag = 0): Keypoint[] {
  const shoulder: [number, number] = [400, 300];
  const wrist: [number, number] = [400, 400];
  // Gleichschenkliges Dreieck mit Basis Schulter–Handgelenk (100): Ellbogen so legen, dass der Winkel stimmt
  const L = 50 / Math.sin((elbowAngle / 2) * (Math.PI / 180));
  const dx = Math.sqrt(Math.max(0, L * L - 50 * 50));
  return body({ 5: shoulder, 7: [400 - dx, 350], 9: wrist, 11: [250, 310 + sag], 13: [170, 315], 15: [100, 320] });
}

describe('Liegestütz-Zähler', () => {
  it('zählt saubere Reps mit Hysterese', () => {
    const c = createPushupCounter();
    const seq = [170, 170, 140, 110, 90, 85, 90, 120, 150, 165, 170];
    let reps = 0;
    for (let r = 0; r < 3; r++) for (const a of seq) for (let i = 0; i < 3; i++) { const e = c.update(pushupFrame(a)).event; if (e?.type === 'rep') reps++; }
    expect(reps).toBe(3);
    expect(c.state().reps).toBe(3);
  });
  it('halbe Rep → ungültig', () => {
    const c = createPushupCounter();
    let inv = 0;
    for (const a of [170, 150, 125, 115, 125, 150, 170]) for (let i = 0; i < 4; i++) if (c.update(pushupFrame(a)).event?.type === 'invalid') inv++;
    expect(inv).toBe(1);
    expect(c.state().reps).toBe(0);
  });
  it('hängende Hüfte → ungültig', () => {
    const c = createPushupCounter();
    for (const a of [170, 140, 90, 85]) for (let i = 0; i < 4; i++) c.update(pushupFrame(a, 70));
    for (const a of [130, 170]) for (let i = 0; i < 4; i++) c.update(pushupFrame(a, 0));
    expect(c.state().invalid).toBe(1);
    expect(c.state().reps).toBe(0);
  });
});

function situpFrame(hipAngle: number): Keypoint[] {
  const hip: [number, number] = [300, 400];
  const knee: [number, number] = [380, 340]; // Richtung Knie
  const kneeDir = Math.atan2(knee[1] - hip[1], knee[0] - hip[0]);
  const torsoDir = kneeDir - (hipAngle * Math.PI) / 180; // Winkel zwischen Oberkörper und Oberschenkel
  const shoulder: [number, number] = [hip[0] + 120 * Math.cos(torsoDir), hip[1] + 120 * Math.sin(torsoDir)];
  return body({ 5: shoulder, 11: hip, 13: knee, 15: [440, 400], 0: [shoulder[0] - 20, shoulder[1]] });
}

describe('Sit-up-Zähler', () => {
  it('zählt volle Sit-ups, halbe sind ungültig', () => {
    const c = createSitupCounter();
    const full = [140, 140, 120, 100, 80, 60, 55, 70, 100, 130, 140];
    const half = [140, 110, 90, 95, 120, 140];
    for (const a of [...full, ...full, ...half]) for (let i = 0; i < 3; i++) c.update(situpFrame(a));
    expect(c.state().reps).toBe(2);
    expect(c.state().invalid).toBe(1);
  });
});

describe('Neigungssensor', () => {
  it('zählt Aufrichten mit Hysterese', () => {
    const t = createTiltCounter();
    let n = 0;
    for (const b of [0, 10, 30, 60, 70, 65, 50, 30, 10, 0, 40, 58, 30, 15, 2]) if (t.update(b)) n++;
    expect(n).toBe(2);
  });
});
