import { describe, expect, it } from 'vitest';
import { ACTIVITIES } from '../data/activities';
import { bestRecord, fmtMedian, fmtRecord, normFor, recordScore, selectionScore, sourcesFor } from './recordScore';
import { boardIds, buildRanking, fmtBoardValue, selectionBoard, type PlayerCard } from './leaderboard';

const card = (o: Partial<PlayerCard> = {}): PlayerCard => ({
  id: 'abcd-1234', name: 'X', level: 1, total: 0, week: 0, weekKey: '2026-11-16',
  streak: 0, longest: 0, rec: {}, at: 1_795_000_000_000, ...o,
});

describe('Rekorde vergleichbar machen (Perzentile)', () => {
  it('jede Übung hat eine Norm mit 75. Perzentil über dem Median', () => {
    for (const a of ACTIVITIES) {
      const n = normFor(a.id);
      expect(n.median, a.id).toBeGreaterThan(0);
      expect(n.p75, a.id).toBeGreaterThan(n.median);
    }
  });
  it('Median = 50 %, 75. Perzentil = 75 %', () => {
    expect(recordScore('pushup', 23)).toBe(50);
    expect(recordScore('pushup', 31.5)).toBe(75);
    expect(recordScore('situp', 30)).toBe(29);
    expect(recordScore('jog', 10)).toBe(69);
  });
  it('bleibt zwischen 1 und 99, 0 nur ohne Rekord', () => {
    expect(recordScore('jog', 0.5)).toBe(1);
    expect(recordScore('plank', 3600)).toBe(99);
    expect(recordScore('pushup', 0)).toBe(0);
    expect(recordScore('pushup', undefined)).toBe(0);
  });
  it('mehr ist immer besser', () => {
    for (const a of ACTIVITIES) {
      const m = normFor(a.id).median;
      expect(recordScore(a.id, m * 1.2), a.id).toBeGreaterThanOrEqual(recordScore(a.id, m));
    }
  });
  it('Quellen: Liegestütze mit Quelle, Burpees geschätzt', () => {
    expect(normFor('pushup').estimated).toBe(false);
    expect(normFor('burpee').estimated).toBe(true);
    expect(fmtMedian('pushup')).toBe('23 Wdh.');
    expect(fmtMedian('burpee')).toBe('~15 Wdh.');
    expect(sourcesFor(['burpee', 'pushup'])).toEqual(['cooper-pushup', 'est']);
  });
  it('bester Rekord nimmt das höchste Perzentil, nicht die größte Zahl', () => {
    // 60 Liegestütze = 98, 4 min Plank = 99, 20 Klimmzüge = 98
    expect(bestRecord({ pushup: 60, plank: 240, pullup: 20 })).toEqual({ id: 'plank', value: 240, score: 99 });
    expect(bestRecord({})).toBeNull();
  });
  it('Auswahl: Durchschnitt, fehlende Übung zählt 0', () => {
    expect(selectionScore({ pushup: 23, situp: 30 }, ['pushup', 'situp'])).toBe(40); // (50 + 29) / 2
    expect(selectionScore({ pushup: 23 }, ['pushup', 'plank'])).toBe(25);
    expect(selectionScore({ pushup: 50 }, [])).toBe(0);
  });
  it('Einheiten lesbar', () => {
    expect(fmtRecord('pushup', 45)).toBe('45 Wdh.');
    expect(fmtRecord('jumprope', 300)).toBe('300 Sprünge');
    expect(fmtRecord('plank', 95)).toBe('1:35 min');
    expect(fmtRecord('football', 5400)).toBe('1:30 h');
    expect(fmtRecord('yoga', 2700)).toBe('45 min');
    expect(fmtRecord('jog', 5.25)).toBe('5,25 km');
  });
});

describe('Rangliste mit Rekord-Vergleich', () => {
  const me = card({ id: 'me-0001', name: 'Alex', rec: { pushup: 40, plank: 120 } }); // 88, 71
  const lea = card({ id: 'lea-0001', name: 'Lea', rec: { plank: 480 } }); // 99
  const tom = card({ id: 'tom-0001', name: 'Tom', rec: { jog: 10 } }); // 69
  const leer = card({ id: 'leer-0001', name: 'Leer', rec: {} });

  it('Bester Rekord: verschiedene Übungen in einer Liste', () => {
    const rows = buildRanking(me, [lea, tom, leer], 'best', '2026-11-16');
    expect(rows.map((r) => [r.name, r.value, r.note])).toEqual([
      ['Lea', 99, 'Plank 8:00 min'],
      ['Alex', 88, 'Liegestütze 40 Wdh.'],
      ['Tom', 69, 'Joggen 10 km'],
    ]);
    expect(fmtBoardValue('best', 80)).toBe('80 %');
  });
  it('Auswahl mehrerer Übungen', () => {
    const board = selectionBoard(['pushup', 'plank'])!;
    expect(board).toBe('sel:pushup,plank');
    expect(boardIds(board)).toEqual(['pushup', 'plank']);
    const rows = buildRanking(me, [lea, tom], board, '2026-11-16');
    // Alex (88 + 71) / 2 = 80, Lea (0 + 99) / 2 = 50, Tom hat keine der beiden
    expect(rows.map((r) => [r.name, r.value, r.note ?? ''])).toEqual([
      ['Alex', 80, ''],
      ['Lea', 50, '1 von 2 Übungen'],
    ]);
  });
  it('eine Übung gewählt = roher Rekord wie bisher', () => {
    expect(selectionBoard(['plank'])).toBe('rec:plank');
    expect(selectionBoard([])).toBeNull();
    expect(fmtBoardValue('rec:plank', 480)).toBe('8:00 min');
  });
});
