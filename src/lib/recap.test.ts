import { describe, expect, it } from 'vitest';
import { buildRecap, daysInMonth, pendingRecap, prevMonth, recapMonths } from './recap';
import type { GymLog, Workout } from './db';

const wo = (day: string, points: number, extra: Partial<Workout> = {}): Workout => ({
  day, activityId: 'pushup', mode: 'manual', start: 0, end: 600_000, reps: 30, invalid: 0, seconds: 0, km: 0, points, gems: 2, isRecord: false,
  breakdown: { base: points, streakBonus: 0, formBonus: 0, recordBonus: 0, questBonus: 0, antiFarmCut: 0, total: points } as unknown as Workout['breakdown'], gemAwards: [], ...extra,
});
const gl = (day: string, points: number): GymLog => ({
  day, start: 0, end: 1_200_000, exerciseId: 'bench', name: 'Bankdrücken', group: 'brust', sets: [{ reps: 10, kg: 60 }, { reps: 8, kg: 60 }], volume: 1080, points, gems: 1, isRecord: true,
  breakdown: { base: points, streakBonus: 0, formBonus: 0, recordBonus: 0, questBonus: 0, antiFarmCut: 0, total: points } as unknown as GymLog['breakdown'],
});

describe('Monatsrückblick', () => {
  it('Monate', () => {
    expect(prevMonth('2026-01')).toBe('2025-12');
    expect(prevMonth('2026-11')).toBe('2026-10');
    expect(daysInMonth('2028-02')).toBe(29);
  });
  it('zählt nur den Monat', () => {
    const r = buildRecap('2026-10', [wo('2026-10-01', 40), wo('2026-10-02', 60), wo('2026-09-30', 999), wo('2026-10-05', 20)], [gl('2026-10-02', 30)]);
    expect(r.points).toBe(150);
    expect(r.activeDays).toBe(3);
    expect(r.sessions).toBe(4);
    expect(r.bestRun).toBe(2);
    expect(r.reps).toBe(30 * 3 + 18);
    expect(r.kg).toBe(1080);
    expect(r.records).toBe(1);
    expect(r.top?.name).toBe('Liegestütze');
    expect(r.bestDay).toEqual({ day: '2026-10-02', points: 90 });
    expect(r.vsPrev).toBe(Math.round(((150 - 999) / 999) * 100));
    expect(r.muscles[0].id).toBe('chest');
  });
  it('leerer Monat', () => {
    const r = buildRecap('2026-08', [], []);
    expect(r.sessions).toBe(0);
    expect(r.vsPrev).toBeNull();
    expect(r.top).toBeNull();
  });
  it('Banner nur in der ersten Woche und nur einmal', () => {
    const months = recapMonths([wo('2026-10-03', 10)], []);
    expect(pendingRecap('2026-11-02', null, months)).toBe('2026-10');
    expect(pendingRecap('2026-11-02', '2026-10', months)).toBeNull();
    expect(pendingRecap('2026-11-09', null, months)).toBeNull();
    expect(pendingRecap('2026-12-01', null, months)).toBeNull();
  });
});
