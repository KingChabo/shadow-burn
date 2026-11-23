import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { ACT, ACTIVITIES, CATEGORIES, MODE_INFO, searchText } from '../data/activities';
import { GYM_EXERCISES, GYM_GROUPS, GYM_ALIASES } from '../data/gym';
import { basePoints, computePoints, plausibleKm, RATE, rateLabel } from './scoring';
import { setPoints } from './gym';
import { db, getKV } from './db';
import { finishWorkout, type Records } from './game';

const at = (day: string, h = 18) => new Date(`${day}T${String(h).padStart(2, '0')}:00:00`).getTime();

beforeEach(async () => {
  await db.workouts.clear(); await db.kv.clear(); await db.gymLogs.clear();
});

describe('Übungsliste', () => {
  it('jede Übung hat Punkte, Modus, Kategorie und Muskeln', () => {
    for (const a of ACTIVITIES) {
      expect(RATE[a.id], a.id).toBeGreaterThan(0);
      expect(a.modes.length, a.id).toBeGreaterThan(0);
      for (const m of a.modes) expect(MODE_INFO[m], `${a.id} ${m}`).toBeDefined();
      expect(CATEGORIES.some((c) => c.id === a.category), a.id).toBe(true);
      expect(a.muscles.primary.length, a.id).toBeGreaterThan(0);
      expect(a.guide.tips.length, a.id).toBeGreaterThan(0);
      if (a.perMin) expect(a.unit, a.id).toBe('time');
    }
  });
  it('viele Übungen, keine doppelten IDs, jede Kategorie gefüllt', () => {
    expect(ACTIVITIES.length).toBeGreaterThanOrEqual(60);
    expect(new Set(ACTIVITIES.map((a) => a.id)).size).toBe(ACTIVITIES.length);
    for (const c of CATEGORIES) expect(ACTIVITIES.filter((a) => a.category === c.id).length, c.id).toBeGreaterThanOrEqual(5);
  });
  it('je Kategorie nach Beliebtheit sortiert', () => {
    for (const c of CATEGORIES) {
      const pops = ACTIVITIES.filter((a) => a.category === c.id).map((a) => a.pop);
      expect(pops).toEqual([...pops].sort((x, y) => y - x));
    }
    expect(ACTIVITIES.filter((a) => a.category === 'kraft')[0].id).toBe('pushup');
    expect(ACTIVITIES.filter((a) => a.category === 'sport')[0].id).toBe('football');
  });
  it('Suche findet auch andere Namen', () => {
    expect(searchText(ACT.dance)).toContain('zumba');
    expect(searchText(ACT.climbing)).toContain('bouldern');
  });
});

describe('Geräteübungen', () => {
  it('viele Übungen, keine doppelten IDs, je Gruppe nach Beliebtheit sortiert', () => {
    expect(GYM_EXERCISES.length).toBeGreaterThanOrEqual(60);
    expect(new Set(GYM_EXERCISES.map((e) => e.id)).size).toBe(GYM_EXERCISES.length);
    for (const g of GYM_GROUPS) {
      const list = GYM_EXERCISES.filter((e) => e.group === g.id);
      expect(list.length, g.id).toBeGreaterThanOrEqual(8);
      const pops = list.map((e) => e.pop ?? 0);
      expect(pops).toEqual([...pops].sort((x, y) => y - x));
      for (const e of list) expect(e.pop, e.id).toBeGreaterThan(0);
    }
    const first = (g: string) => GYM_EXERCISES.find((e) => e.group === g)!.id;
    expect(first('brust')).toBe('bench');
    expect(first('beine')).toBe('back_squat');
    expect(first('ruecken')).toBe('deadlift');
    expect(first('arme')).toBe('pushdown');
  });
  it('jede Übung hat Suchbegriffe', () => {
    for (const e of GYM_EXERCISES) expect(GYM_ALIASES[e.id], e.id).toBeTruthy();
  });
  it('Beinpresse: kg zählt nur zur Hälfte, Bankdrücken unverändert', () => {
    expect(setPoints({ reps: 10, kg: 200 }, 'leg_press')).toBe(30);
    expect(setPoints({ reps: 12, kg: 60 }, 'bench')).toBe(24);
    expect(setPoints({ reps: 10, kg: 0 }, 'hanging_leg_raise')).toBe(20);
  });
});

describe('Punkte für neue Übungen', () => {
  it('Sportarten zählen pro Minute', () => {
    expect(basePoints({ activityId: 'football', seconds: 90 * 60 })).toBeCloseTo(108);
    expect(basePoints({ activityId: 'yoga', seconds: 60 * 60 })).toBeCloseTo(24);
    expect(rateLabel(ACT.football)).toBe('1,2 P / Min.');
    expect(rateLabel(ACT.wallsit)).toBe('1 P / 5 s');
    expect(rateLabel(ACT.swim)).toBe('30 P / km');
  });
  it('Obergrenzen: 3 h Fußball, 10 min Wandsitzen', () => {
    expect(basePoints({ activityId: 'football', seconds: 10 * 3600 })).toBeCloseTo(216);
    expect(basePoints({ activityId: 'wallsit', seconds: 3600 })).toBe(120);
    expect(basePoints({ activityId: 'plank', seconds: 64 })).toBe(12); // alte Übung unverändert
  });
  it('Strecken: zu weit oder zu schnell wird gekürzt', () => {
    expect(plausibleKm('swim', 50, 60 * 60 * 20)).toBe(30); // max 30 km
    expect(plausibleKm('swim', 10, 30 * 60)).toBeCloseTo(3.33, 1); // schneller als 9 min/km geht nicht
    expect(plausibleKm('jog', 10, 50 * 60)).toBe(10); // 5:00/km ist ok
    expect(plausibleKm('hike', 12, 0)).toBe(12);
  });
  it('Gleiches Gefühl wie vorher: 1 h Fußball ≈ 7 km Joggen', () => {
    const base = { formValidated: false, streakDays: 0, isRecord: false, pointsTodayBefore: 0 };
    const foot = computePoints({ ...base, activityId: 'football', seconds: 3600 }).total;
    const jog = computePoints({ ...base, activityId: 'jog', km: 7 }).total;
    expect(Math.abs(foot - jog)).toBeLessThanOrEqual(5);
  });
});

describe('Speichern', () => {
  it('Sportart: Punkte nach Minuten, kein Rekord-Bonus für längere Dauer', async () => {
    const s1 = await finishWorkout({ activityId: 'football', mode: 'duration', start: at('2026-11-20') - 3600_000, end: at('2026-11-20'), seconds: 3600 }, () => 1);
    expect(s1.breakdown.base).toBe(72);
    const s2 = await finishWorkout({ activityId: 'football', mode: 'duration', start: at('2026-11-21') - 7200_000, end: at('2026-11-21'), seconds: 7200 }, () => 1);
    expect(s2.isRecord).toBe(false);
    expect(s2.breakdown.recordBonus).toBe(0);
    expect((await getKV<Records>('records', {})).football).toBeUndefined();
  });
  it('Schwimmen: unmögliche Strecke wird gekürzt gespeichert', async () => {
    const s = await finishWorkout({ activityId: 'swim', mode: 'distance', start: at('2026-11-20') - 1800_000, end: at('2026-11-20'), km: 10, seconds: 1800 }, () => 1);
    expect(s.workout.km).toBeCloseTo(3.33, 1);
    expect(s.breakdown.base).toBe(100);
  });
});
