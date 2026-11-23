import { describe, expect, it } from 'vitest';
import { muscleDetail, type Hit } from './muscles';
describe('Muskel-Details', () => {
  const now = Date.UTC(2026, 10, 22, 12);
  const hit = (hoursAgo: number, effort: number): Hit => ({ at: now - hoursAgo * 3_600_000, muscles: { primary: ['chest'], secondary: ['triceps'] }, effort });
  it('Level, Fortschritt und Erholung', () => {
    const d = muscleDetail([hit(10, 3), hit(24 * 10, 10)], 'chest', now);
    expect(d.work).toBe(13);
    expect(d.level).toBe(1);
    expect(d.toNext).toBe(7);
    expect(d.progress).toBeCloseTo(12 / 19);
    expect(d.hoursLeft).toBeCloseTo(38);
    expect(d.count30).toBe(2);
    expect(d.lastAt).toBe(now - 10 * 3_600_000);
  });
  it('Hilfsmuskel erholt sich doppelt so schnell', () => {
    expect(muscleDetail([hit(10, 3)], 'triceps', now).hoursLeft).toBeCloseTo(14);
  });
  it('nie trainiert', () => {
    const d = muscleDetail([], 'calves', now);
    expect(d).toMatchObject({ level: 0, lastAt: null, recovery: 1, hoursLeft: 0, toNext: 1 });
  });
});
