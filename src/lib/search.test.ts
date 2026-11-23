import { describe, expect, it } from 'vitest';
import { ACTIVITIES, searchText } from '../data/activities';
import { GYM_EXERCISES } from '../data/gym';
import { muscleMatches, searchList } from './search';

const body = (q: string) => searchList(ACTIVITIES, q, searchText, (a) => a.muscles);
const gym = (q: string) => searchList(GYM_EXERCISES, q, (e) => e.name, (e) => e.muscles);

describe('Suche nach Muskelgruppen', () => {
  it('findet Muskeln über Namen und Alltagswörter', () => {
    expect(muscleMatches('chest', 'Brust')).toBe(true);
    expect(muscleMatches('abs', 'sixpack')).toBe(true);
    expect(muscleMatches('glutes', 'po')).toBe(true);
    expect(muscleMatches('glutes', 'Gesäß')).toBe(true);
    expect(muscleMatches('quads', 'bein')).toBe(true);
    expect(muscleMatches('abs', 'bau')).toBe(true);
    expect(muscleMatches('chest', 'b')).toBe(false);
  });

  it('ohne Gerät: "Brust" liefert Liegestütze, alle Treffer trainieren die Brust', () => {
    const r = body('Brust');
    expect(r.map((a) => a.id)).toContain('pushup');
    for (const a of r) expect(searchText(a).includes('brust') || [...a.muscles.primary, ...a.muscles.secondary].includes('chest')).toBe(true);
  });

  it('Hauptmuskel steht vor Hilfsmuskel', () => {
    const r = body('Bauch');
    const firstSecondary = r.findIndex((a) => !a.muscles.primary.some((m) => m === 'abs' || m === 'obliques') && !searchText(a).includes('bauch'));
    const lastPrimary = r.map((a) => a.muscles.primary.some((m) => m === 'abs' || m === 'obliques')).lastIndexOf(true);
    if (firstSecondary >= 0) expect(lastPrimary).toBeLessThan(firstSecondary);
  });

  it('Geräte: "Bizeps" findet Bizepscurls, "Rücken" findet Latziehen-artige Übungen', () => {
    expect(gym('Bizeps').length).toBeGreaterThan(2);
    expect(gym('Bizeps').every((e) => e.name.toLowerCase().includes('bizeps') || [...e.muscles.primary, ...e.muscles.secondary].includes('biceps'))).toBe(true);
    expect(gym('rücken').some((e) => e.muscles.primary.includes('lats'))).toBe(true);
  });

  it('Namenssuche funktioniert weiter', () => {
    expect(body('liegest')[0].id).toBe('pushup');
    expect(gym('xyzabc')).toEqual([]);
  });
});
