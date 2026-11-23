import { ACT, ACTIVITIES, type ActivityId } from '../data/activities';

/**
 * Rekorde aus verschiedenen Übungen vergleichbar machen – mit echten Normwerten.
 *
 * Jeder Rekord wird in ein Perzentil umgerechnet: "besser als X % der Leute".
 * Dazu kennt jede Übung den Median (50 %) und das 75. Perzentil einer
 * Vergleichsgruppe. Dazwischen und darüber hinaus wird eine Log-Normalverteilung
 * angenommen (Leistungswerte sind typischerweise rechtsschief), daraus folgt das Perzentil.
 *
 * Vergleichsgruppe: Erwachsene 20–39 Jahre, Männer und Frauen gemittelt.
 * Wo es keine veröffentlichten Normen gibt, ist der Wert eine Schätzung
 * (abgeleitet von der verwandten Übung mit Quelle) und als `est` markiert.
 * Quellen: SOURCES unten und RECORD_NORMS.md im Projektordner.
 */

export type NormSource = 'cooper-pushup' | 'cooper-situp' | 'chase-plank' | 'exrx-pullup' | 'strava-run' | 'strava-ride' | 'est';

export const SOURCES: Record<NormSource, { short: string; text: string }> = {
  'cooper-pushup': { short: 'Cooper Institute', text: 'Liegestütze: Cooper Institute (2013), Physical Fitness Assessments and Norms for Adults; Männer n = 2.397, Frauen > 1.000; Alter 20–39, Median 14–33 Wdh.' },
  'cooper-situp': { short: 'Cooper Institute', text: 'Sit-ups (1 min): Cooper Institute (2013), Cooper-Clinic-Daten, n = 5.270; Alter 20–39, Median 27–40 Wdh.' },
  'chase-plank': { short: 'Chase u. a. 2014', text: 'Plank: Chase/Brigham u. a. (2014), Fitness Norms for the Plank Exercise, Int. J. Exercise Science, n = 168 (18–25 J.); Median Frauen 90 s, Männer 106 s.' },
  'exrx-pullup': { short: 'ExRx / Fitnesstests', text: 'Klimmzüge: Perzentile Jugendliche 17+ (ExRx.net, Median 7, 75. Perz. 10) und Erwachsenen-Bänder 18–35 (Topend Sports: Männer Ø 7–9, Frauen Ø 2–3). Schwache Quellenlage, Richtwert.' },
  'strava-run': { short: 'Strava-Läufe', text: 'Joggen: 25.943 Strava-Läufe 2026 (SHUTT-Auswertung), Median 7,6 km, mittlere Hälfte 5–11 km. Vergleich: dein längster Lauf gegen alle einzelnen Läufe.' },
  'strava-ride': { short: 'Strava-Fahrten', text: 'Radfahren: Strava Year in Sport 2025, Ø Fahrt 20,6 km (Median daraus geschätzt ≈ 17 km).' },
  est: { short: 'Schätzung', text: 'Für die übrigen Übungen gibt es keine veröffentlichten Normen. Die Werte sind Schätzungen, abgeleitet von den Übungen mit Quelle.' },
};

/** [Median, 75. Perzentil, Quelle] in der Einheit des Rekords (Wdh., Sekunden, km) */
type Norm = [number, number, NormSource];
const N = (m: number, p75: number, src: NormSource = 'est'): Norm => [m, p75, src];

// Gemittelt aus Männer/Frauen 20–29 und 30–39 (siehe SOURCES)
const NORMS: Record<ActivityId, Norm> = {
  // ----- mit Quelle -----
  pushup: N(23, 31.5, 'cooper-pushup'),   // Median 33/18/27/14, 75. P 44/27/36/19
  situp: N(34.5, 40.75, 'cooper-situp'),  // Median 40/35/36/27, 75. P 46/42/42/33
  plank: N(98, 125, 'chase-plank'),       // Median 106/90 s, 75. P 128,5/121 s
  pullup: N(4.5, 7.5, 'exrx-pullup'),     // Männer ~7 (75. P 10), Frauen ~2 (75. P 5)
  jog: N(7.6, 11, 'strava-run'),
  bike: N(17, 25, 'strava-ride'),
  // ----- Schätzungen: Kraft -----
  kneepush: N(30, 40), diamondpush: N(12, 18), pikepush: N(10, 15), chinup: N(5, 8.5), invrow: N(12, 18),
  dip: N(10, 16), burpee: N(15, 22), squat: N(40, 60), lunge: N(30, 45), jumpsquat: N(20, 30),
  splitsquat: N(20, 30), stepup: N(40, 60), calfraise: N(40, 60), superman: N(25, 40), glutebridge: N(40, 60),
  wallsit: N(60, 90), deadhang: N(45, 65),
  // ----- Core -----
  sideplank: N(60, 80), crunch: N(40, 55), mountain: N(50, 80), legraise: N(15, 25), russiantwist: N(40, 60),
  bicyclecrunch: N(40, 60), flutterkick: N(60, 100), vup: N(15, 22), hollowhold: N(40, 60), deadbug: N(30, 45), hangingknee: N(10, 16),
  // ----- Cardio -----
  jacks: N(60, 100), highknees: N(60, 100), jumprope: N(100, 200), skater: N(40, 60), buttkicks: N(60, 100),
  tuckjump: N(15, 22), boxjump: N(20, 30), shadowbox: N(15 * 60, 25 * 60),
  // ----- Ausdauer (km bzw. Sekunden) -----
  walk: N(4, 6.5), sprint: N(2, 3), hike: N(12, 17), swim: N(1, 1.6), nordic: N(6, 9), rowing: N(5, 8), inline: N(15, 22),
  spinning: N(45 * 60, 60 * 60), crosstrainer: N(30 * 60, 45 * 60),
  // ----- Sportarten: längste Einheit (Sekunden) -----
  football: N(90 * 60, 120 * 60), yoga: N(60 * 60, 75 * 60), tennis: N(90 * 60, 120 * 60), dance: N(60 * 60, 90 * 60),
  pilates: N(50 * 60, 60 * 60), climbing: N(90 * 60, 120 * 60), volleyball: N(90 * 60, 120 * 60), basketball: N(60 * 60, 90 * 60),
  tabletennis: N(60 * 60, 90 * 60), badminton: N(60 * 60, 90 * 60), martial: N(75 * 60, 90 * 60), handball: N(60 * 60, 90 * 60),
  padel: N(90 * 60, 120 * 60), ski: N(4 * 3600, 5 * 3600),
};

const Z75 = 0.6745; // z-Wert des 75. Perzentils

/** Verteilungsfunktion der Standardnormalverteilung (Abramowitz/Stegun 7.1.26, Fehler < 1e-7) */
function phi(z: number): number {
  const t = 1 / (1 + 0.3275911 * Math.abs(z) / Math.SQRT2);
  const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-(z * z) / 2);
  return z >= 0 ? (1 + y) / 2 : (1 - y) / 2;
}

export function normFor(id: ActivityId): { median: number; p75: number; source: NormSource; estimated: boolean } {
  const [median, p75, source] = NORMS[id];
  return { median, p75, source, estimated: source === 'est' };
}

/** Perzentil 1–99: "besser als X % der Vergleichsgruppe" (0 = kein Rekord). */
export function recordScore(id: ActivityId, value: number | undefined): number {
  if (!value || value <= 0 || !(id in NORMS)) return 0;
  const { median, p75 } = normFor(id);
  const sigma = Math.log(p75 / median) / Z75;
  const p = phi(Math.log(value / median) / sigma) * 100;
  return Math.min(99, Math.max(1, Math.round(p)));
}

/** Bester Rekord eines Spielers, gemessen am Perzentil. */
export function bestRecord(rec: Partial<Record<ActivityId, number>>): { id: ActivityId; value: number; score: number } | null {
  let best: { id: ActivityId; value: number; score: number } | null = null;
  for (const a of ACTIVITIES) {
    const value = rec[a.id] ?? 0;
    const score = recordScore(a.id, value);
    if (score > 0 && (!best || score > best.score)) best = { id: a.id, value, score };
  }
  return best;
}

/**
 * Mehrere gewählte Übungen: Durchschnitt der Perzentile.
 * Übungen ohne Rekord zählen 0 (wer sie nie gemacht hat, liegt dort hinten).
 */
export function selectionScore(rec: Partial<Record<ActivityId, number>>, ids: ActivityId[]): number {
  if (!ids.length) return 0;
  const sum = ids.reduce((s, id) => s + recordScore(id, rec[id]), 0);
  return Math.round(sum / ids.length);
}

/** Rekord in seiner Einheit, z. B. "45 Wdh.", "1:35 min", "5,25 km", "90 min" */
export function fmtRecord(id: ActivityId, v: number): string {
  const a = ACT[id];
  if (a.unit === 'reps') return `${(Math.round(v * 10) / 10).toLocaleString('de-DE')} ${a.unitLabel === 'Wiederholungen' ? 'Wdh.' : a.unitLabel}`;
  if (a.unit === 'time') {
    if (a.perMin) {
      const h = Math.floor(v / 3600), m = Math.round((v % 3600) / 60);
      return h ? `${h}:${String(m).padStart(2, '0')} h` : `${m} min`;
    }
    const m = Math.floor(v / 60), s = Math.round(v % 60);
    return m ? `${m}:${String(s).padStart(2, '0')} min` : `${s} s`;
  }
  return `${v.toLocaleString('de-DE')} km`;
}

/** Median lesbar ("Mitte: 23 Wdh."), geschätzte Werte mit "~" */
export function fmtMedian(id: ActivityId): string {
  const n = normFor(id);
  return `${n.estimated ? '~' : ''}${fmtRecord(id, n.median)}`;
}

/** Quellen, die für diese Übungen verwendet werden (in fester Reihenfolge) */
export function sourcesFor(ids: ActivityId[]): NormSource[] {
  const used = new Set(ids.map((id) => NORMS[id][2]));
  return (Object.keys(SOURCES) as NormSource[]).filter((s) => used.has(s));
}
