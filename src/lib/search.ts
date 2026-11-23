import { MUSCLE_NAMES, type MuscleId } from '../data/activities';

/** Suchbegriffe je Muskel: offizieller Name plus Alltagswörter */
const MUSCLE_TERMS: Record<MuscleId, string[]> = {
  chest: ['brust', 'brustmuskel', 'pecs', 'pectoralis'],
  shoulders: ['schulter', 'schultern', 'delta', 'deltamuskel', 'delts'],
  triceps: ['trizeps', 'triceps', 'arme', 'oberarm'],
  biceps: ['bizeps', 'biceps', 'arme', 'oberarm'],
  forearms: ['unterarm', 'unterarme', 'arme', 'griff', 'griffkraft'],
  abs: ['bauch', 'bauchmuskeln', 'sixpack', 'six pack', 'core', 'rumpf'],
  obliques: ['bauch', 'seitliche bauchmuskeln', 'schräge bauchmuskeln', 'taille', 'core', 'rumpf'],
  hipflexors: ['hüfte', 'hüftbeuger'],
  quads: ['beine', 'oberschenkel', 'quadrizeps', 'quads', 'bein'],
  hamstrings: ['beine', 'oberschenkel', 'beinbizeps', 'hamstrings', 'bein'],
  glutes: ['po', 'gesäß', 'gesäss', 'hintern', 'glutes', 'beine'],
  calves: ['wade', 'waden', 'beine', 'bein'],
  lats: ['rücken', 'latissimus', 'lat', 'breiter rücken', 'rückenmuskel'],
  traps: ['nacken', 'trapez', 'trapezmuskel', 'rücken'],
  lowerback: ['rücken', 'unterer rücken', 'lendenwirbel', 'kreuz'],
};

const norm = (s: string) => s.trim().toLowerCase().replace(/ß/g, 'ss');

/** Passt die Suche zu diesem Muskel? Ganzes Wort oder ab 3 Buchstaben, auch angefangene Wörter ("bauc" → Bauch) */
export function muscleMatches(m: MuscleId, query: string): boolean {
  const q = norm(query);
  return [MUSCLE_NAMES[m], ...MUSCLE_TERMS[m]].some((t) => {
    const n = norm(t);
    if (q === n) return true; // auch kurze Wörter wie "po"
    return q.length >= 3 && (n.startsWith(q) || n.split(' ').some((w) => w.startsWith(q)));
  });
}

/** 3 = Name passt, 2 = Hauptmuskel passt, 1 = Hilfsmuskel passt, 0 = gar nicht */
export function searchScore(text: string, muscles: { primary: MuscleId[]; secondary: MuscleId[] }, query: string): number {
  const q = norm(query);
  if (!q) return 0;
  const t = norm(text);
  // Kurze Suchwörter ("po") nur am Wortanfang, sonst findet "po" auch "Sport"
  if (q.length < 3 ? t.split(/[\s/,()-]+/).some((w) => w.startsWith(q)) : t.includes(q)) return 3;
  if (muscles.primary.some((m) => muscleMatches(m, q))) return 2;
  if (muscles.secondary.some((m) => muscleMatches(m, q))) return 1;
  return 0;
}

/** Filtern und sortieren: erst Namens-Treffer, dann Haupt-, dann Hilfsmuskel. Sonst bleibt die Reihenfolge (Beliebtheit). */
export function searchList<T>(items: T[], query: string, text: (t: T) => string, muscles: (t: T) => { primary: MuscleId[]; secondary: MuscleId[] }): T[] {
  return items
    .map((it, i) => ({ it, i, s: searchScore(text(it), muscles(it), query) }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s || a.i - b.i)
    .map((x) => x.it);
}
