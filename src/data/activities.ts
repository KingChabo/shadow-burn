import type { IconName } from '../components/Icon';
export type ActivityId =
  | 'pushup' | 'situp' | 'pullup' | 'squat' | 'lunge' | 'dip' | 'burpee'
  | 'plank' | 'sideplank' | 'crunch' | 'mountain'
  | 'jacks' | 'highknees' | 'jumprope'
  | 'jog' | 'walk' | 'sprint' | 'bike'
  // ab hier: Erweiterung (21.11.2026). IDs nie umbenennen, sie stehen in gespeicherten Trainings und QR-Karten.
  | 'kneepush' | 'diamondpush' | 'pikepush' | 'chinup' | 'invrow' | 'glutebridge' | 'jumpsquat' | 'splitsquat'
  | 'stepup' | 'calfraise' | 'superman' | 'wallsit' | 'deadhang'
  | 'legraise' | 'russiantwist' | 'bicyclecrunch' | 'flutterkick' | 'vup' | 'hollowhold' | 'deadbug' | 'hangingknee'
  | 'skater' | 'buttkicks' | 'tuckjump' | 'boxjump' | 'shadowbox'
  | 'hike' | 'swim' | 'nordic' | 'rowing' | 'inline' | 'spinning' | 'crosstrainer'
  | 'football' | 'yoga' | 'tennis' | 'dance' | 'pilates' | 'climbing' | 'volleyball' | 'basketball'
  | 'tabletennis' | 'badminton' | 'martial' | 'handball' | 'padel' | 'ski';

export type Mode = 'camera' | 'sensor' | 'nosetap' | 'manual' | 'timer' | 'distance' | 'duration'
  // ab 23.11.2026: Sprung-Zähler (Beschleunigung), GPS live
  | 'jump' | 'gps';
export type Category = 'kraft' | 'core' | 'cardio' | 'ausdauer' | 'sport';
export type Unit = 'reps' | 'time' | 'distance';

export type MuscleId =
  | 'chest' | 'shoulders' | 'triceps' | 'biceps' | 'forearms' | 'abs' | 'obliques'
  | 'hipflexors' | 'quads' | 'hamstrings' | 'glutes' | 'calves' | 'lats' | 'traps' | 'lowerback';

export const MUSCLE_NAMES: Record<MuscleId, string> = {
  chest: 'Brust',
  shoulders: 'Schultern',
  triceps: 'Trizeps',
  biceps: 'Bizeps',
  forearms: 'Unterarme',
  abs: 'Gerade Bauchmuskeln',
  obliques: 'Seitliche Bauchmuskeln',
  hipflexors: 'Hüftbeuger',
  quads: 'Oberschenkel vorne',
  hamstrings: 'Oberschenkel hinten',
  glutes: 'Gesäß',
  calves: 'Waden',
  lats: 'Breiter Rückenmuskel',
  traps: 'Trapezmuskel',
  lowerback: 'Unterer Rücken',
};

type P = [number, number];
export interface Pose {
  h: P; s: P; e: P; w: P; hp: P; k: P; a: P;
  e2?: P; w2?: P; k2?: P; a2?: P;
}
export type Prop = 'bar' | 'bars' | 'bike' | 'rope';

export interface Guide {
  /** Strichfiguren-Posen (alt, nur noch bei den ersten 18 Übungen) */
  poses?: Pose[];
  /** Frontansicht statt Seitenansicht */
  front?: boolean;
  /** Welche Pose als Kachel-Bild dient */
  iconPose?: number;
  /** Sekunden pro Übergang */
  speed?: number;
  prop?: Prop;
  tips: string[];
  mistakes: string[];
}

export interface Activity {
  id: ActivityId;
  name: string;
  category: Category;
  unit: Unit;
  modes: Mode[];
  unitLabel: string;
  muscles: { primary: MuscleId[]; secondary: MuscleId[] };
  guide: Guide;
  /**
   * Beliebtheit 0–100 (höher = beliebter). Bestimmt die Reihenfolge in der Liste.
   * Quellen und Begründung: BELIEBTHEIT.md im Projektordner.
   */
  pop: number;
  /** Weitere Suchbegriffe (Englisch, Studio-Sprache) */
  alias?: string;
  /** Punkte pro Minute statt pro 5 Sekunden (Sportarten, lange Einheiten) */
  perMin?: boolean;
  /** Höchstens so viele Sekunden zählen für Punkte (gegen "Timer einfach weiterlaufen lassen") */
  maxSec?: number;
  /** Strecken-Prüfung: schnellste mögliche Pace (min/km) und längste Strecke pro Einheit */
  dist?: { minPace: number; maxKm: number };
}

export const CATEGORIES: { id: Category; name: string }[] = [
  { id: 'kraft', name: 'Kraft' },
  { id: 'core', name: 'Core' },
  { id: 'cardio', name: 'Cardio' },
  { id: 'ausdauer', name: 'Ausdauer' },
  { id: 'sport', name: 'Sportarten' },
];

export const MODE_INFO: Record<Mode, { name: string; desc: string; icon: IconName }> = {
  camera: { name: 'Kamera', desc: 'Zählt selbst · +20 % Bonus', icon: 'camera' },
  sensor: { name: 'Brust', desc: 'Handy auf der Brust', icon: 'tilt' },
  nosetap: { name: 'Nasen-Tap', desc: 'Nase tippt aufs Handy', icon: 'tap' },
  manual: { name: 'Manuell', desc: 'Selbst zählen', icon: 'hand' },
  timer: { name: 'Timer', desc: 'Stoppuhr', icon: 'timer' },
  distance: { name: 'Eintragen', desc: 'Strecke und Zeit eintragen', icon: 'route' },
  duration: { name: 'Eintragen', desc: 'Dauer nachher eintragen', icon: 'hand' },
  jump: { name: 'Sprung-Zähler', desc: 'Spürt jeden Sprung', icon: 'jump' },
  gps: { name: 'GPS', desc: 'Strecke live messen', icon: 'pin' },
};

// ---------- Vorlagen-Posen (viewBox 0 0 200 120, Boden bei y = 110) ----------
// Körperlängen: Oberarm 16, Unterarm 15, Rumpf 32, Oberschenkel 25, Unterschenkel 23
const PUSH_UP: Pose = { h: [153, 73], s: [140, 79], e: [140, 94.5], w: [140, 110], hp: [110, 90], k: [86.5, 98], a: [65, 106] };
const PUSH_DOWN: Pose = { h: [159.5, 91], s: [146, 94], e: [130.6, 98.3], w: [140, 110], hp: [114.4, 98.8], k: [89.6, 102.6], a: [66, 106] };
const SIT_LEGS = { hp: [100, 104] as P, k: [120, 88] as P, a: [136, 106] as P };
const SIT_DOWN: Pose = { h: [53, 102], s: [68, 104], e: [80, 97], w: [72, 98], ...SIT_LEGS };
const SIT_UP: Pose = { h: [99, 57], s: [98, 72], e: [108, 79], w: [100, 75], ...SIT_LEGS };
const STAND: Pose = { h: [100, 14], s: [100, 30], e: [100, 46], w: [100, 60], hp: [100, 62], k: [100, 86], a: [100, 108] };
const RUN_A: Pose = { h: [104, 14], s: [102, 30], e: [114, 44], w: [126, 38], e2: [90, 44], w2: [84, 56], hp: [98, 62], k: [116, 78], a: [104, 96], k2: [90, 86], a2: [74, 100] };
const RUN_B: Pose = { ...RUN_A, e: [90, 44], w: [84, 56], e2: [114, 44], w2: [126, 38], k: [90, 86], a: [74, 100], k2: [116, 78], a2: [104, 96] };
const shift = (p: Pose, dx: number, dy: number): Pose =>
  Object.fromEntries(Object.entries(p).map(([key, v]) => [key, [(v as P)[0] + dx, (v as P)[1] + dy]])) as unknown as Pose;

const BASE: Activity[] = [
  {
    id: 'pushup', pop: 100, alias: 'push-ups liegestuetze', name: 'Liegestütze', category: 'kraft', unit: 'reps', unitLabel: 'Wiederholungen',
    modes: ['camera', 'nosetap', 'manual'],
    muscles: { primary: ['chest', 'triceps', 'shoulders'], secondary: ['abs', 'obliques'] },
    guide: {
      poses: [PUSH_UP, PUSH_DOWN], speed: 0.9, iconPose: 0,
      tips: [
        'Hände knapp schulterbreit, direkt unter den Schultern',
        'Körper bildet eine gerade Linie von Kopf bis Ferse',
        'Runter, bis die Ellbogen deutlich unter 90° sind (< 100°)',
        'Oben die Arme ganz strecken',
      ],
      mistakes: ['Hüfte hängt durch oder ragt hoch', 'Nur halb runter', 'Ellbogen weit nach außen'],
    },
  },
  {
    id: 'situp', pop: 75, alias: 'sit ups', name: 'Sit-ups', category: 'kraft', unit: 'reps', unitLabel: 'Wiederholungen',
    modes: ['camera', 'sensor', 'manual'],
    muscles: { primary: ['abs', 'hipflexors'], secondary: ['obliques'] },
    guide: {
      poses: [SIT_DOWN, SIT_UP], speed: 1,
      tips: [
        'Knie angewinkelt (ca. 90°), Füße flach am Boden',
        'Arme vor der Brust verschränken',
        'Ganz ablegen: Schultern berühren kurz den Boden',
        'Oberkörper hoch, bis er fast senkrecht ist',
      ],
      mistakes: ['Mit Schwung aus den Armen', 'Nur halb hochkommen', 'Am Nacken ziehen'],
    },
  },
  {
    id: 'pullup', pop: 80, alias: 'pull-ups klimmzug', name: 'Klimmzüge', category: 'kraft', unit: 'reps', unitLabel: 'Wiederholungen',
    modes: ['manual'],
    muscles: { primary: ['lats', 'biceps'], secondary: ['traps', 'forearms', 'shoulders'] },
    guide: {
      prop: 'bar', speed: 1.1,
      poses: [
        { h: [100, 30], s: [100, 42], e: [100, 26], w: [100, 10], hp: [100, 74], k: [101, 98], a: [82, 104] },
        { h: [102, 4], s: [100, 22], e: [114, 24], w: [100, 10], hp: [100, 54], k: [101, 78], a: [82, 84] },
      ],
      tips: ['Aus dem ganz gestreckten Hang starten', 'Kinn über die Stange ziehen', 'Kontrolliert ablassen'],
      mistakes: ['Schwung mit den Beinen (Kipping)', 'Nicht ganz runter'],
    },
  },
  {
    id: 'squat', pop: 95, alias: 'squats', name: 'Kniebeugen', category: 'kraft', unit: 'reps', unitLabel: 'Wiederholungen',
    modes: ['camera', 'manual'],
    muscles: { primary: ['quads', 'glutes'], secondary: ['hamstrings', 'calves', 'lowerback'] },
    guide: {
      speed: 1,
      poses: [
        { h: [100, 14], s: [100, 30], e: [116, 32], w: [134, 32], hp: [100, 62], k: [102, 86], a: [100, 108] },
        { h: [108, 40], s: [102, 54], e: [120, 54], w: [138, 52], hp: [78, 82], k: [112, 82], a: [102, 108] },
      ],
      tips: ['Füße schulterbreit', 'Hüfte nach hinten, bis sie auf Kniehöhe ist', 'Fersen bleiben am Boden', 'Rücken gerade'],
      mistakes: ['Knie fallen nach innen', 'Fersen heben ab'],
    },
  },
  {
    id: 'lunge', pop: 85, alias: 'lunges', name: 'Ausfallschritte', category: 'kraft', unit: 'reps', unitLabel: 'Wiederholungen',
    modes: ['manual'],
    muscles: { primary: ['quads', 'glutes'], secondary: ['hamstrings', 'calves'] },
    guide: {
      speed: 1,
      poses: [
        { h: [100, 14], s: [100, 30], e: [98, 46], w: [98, 60], hp: [100, 62], k: [110, 86], a: [112, 108], k2: [92, 86], a2: [86, 108] },
        { h: [100, 38], s: [100, 54], e: [98, 70], w: [98, 82], hp: [100, 84], k: [126, 84], a: [126, 108], k2: [86, 106], a2: [64, 106] },
      ],
      tips: ['Großer Schritt nach vorn', 'Hinteres Knie fast bis zum Boden', 'Vorderes Knie über dem Fuß'],
      mistakes: ['Vorderes Knie weit über die Zehen', 'Oberkörper kippt nach vorn'],
    },
  },
  {
    id: 'dip', pop: 60, name: 'Dips', category: 'kraft', unit: 'reps', unitLabel: 'Wiederholungen',
    modes: ['manual'],
    muscles: { primary: ['triceps', 'chest'], secondary: ['shoulders'] },
    guide: {
      prop: 'bars', speed: 1,
      poses: [
        { h: [102, 20], s: [100, 34], e: [100, 50], w: [100, 66], hp: [98, 64], k: [104, 82], a: [92, 94] },
        { h: [104, 40], s: [98, 54], e: [82, 62], w: [100, 66], hp: [92, 82], k: [100, 100], a: [86, 106] },
      ],
      tips: ['Arme oben ganz strecken', 'Runter, bis die Oberarme waagerecht sind', 'Schultern weg von den Ohren'],
      mistakes: ['Zu tief mit Schmerz in der Schulter', 'Nur halbe Bewegung'],
    },
  },
  {
    id: 'burpee', pop: 70, name: 'Burpees', category: 'kraft', unit: 'reps', unitLabel: 'Wiederholungen',
    modes: ['manual'],
    muscles: { primary: ['quads', 'chest', 'shoulders'], secondary: ['glutes', 'triceps', 'abs', 'calves'] },
    guide: {
      speed: 0.55,
      poses: [
        STAND,
        { h: [118, 58], s: [108, 66], e: [118, 86], w: [122, 108], hp: [84, 84], k: [104, 86], a: [96, 108] },
        shift(PUSH_UP, -20, 0),
        { h: [118, 58], s: [108, 66], e: [118, 86], w: [122, 108], hp: [84, 84], k: [104, 86], a: [96, 108] },
        { h: [100, 8], s: [100, 24], e: [104, 12], w: [106, 2], hp: [100, 56], k: [100, 78], a: [100, 100] },
      ],
      tips: ['Hocke → Füße zurück in die Liegestützposition', 'Füße zurück zur Hocke', 'Strecksprung mit Armen nach oben'],
      mistakes: ['Hüfte hängt in der Stützposition', 'Kein richtiger Sprung'],
    },
  },
  {
    id: 'plank', pop: 100, alias: 'unterarmstütz', name: 'Plank', category: 'core', unit: 'time', unitLabel: 'Sek.',
    modes: ['camera', 'timer'],
    muscles: { primary: ['abs'], secondary: ['shoulders', 'lowerback', 'glutes'] },
    guide: {
      speed: 1.6,
      poses: [
        { h: [153.5, 88.5], s: [140, 91], e: [140, 108], w: [155, 108], hp: [108.6, 97], k: [84, 101.7], a: [61.4, 106] },
        { h: [153.5, 88], s: [140, 90.5], e: [140, 108], w: [155, 108], hp: [108.6, 95.8], k: [84, 101], a: [61.4, 106] },
      ],
      tips: ['Unterarme unter den Schultern', 'Bauch und Po fest anspannen', 'Gerade Linie Kopf bis Ferse'],
      mistakes: ['Hohlkreuz / Hüfte hängt', 'Po zu hoch'],
    },
  },
  {
    id: 'sideplank', pop: 70, alias: 'side plank', name: 'Seitstütz', category: 'core', unit: 'time', unitLabel: 'Sek.',
    modes: ['timer'],
    muscles: { primary: ['obliques'], secondary: ['abs', 'shoulders', 'glutes'] },
    guide: {
      speed: 1.6,
      poses: [
        { h: [153, 73], s: [140, 79], e: [140, 94.5], w: [140, 110], e2: [140, 63], w2: [140, 48], hp: [110, 90], k: [86.5, 98], a: [65, 106] },
        { h: [153, 72], s: [140, 78], e: [140, 94], w: [140, 110], e2: [140, 62], w2: [140, 47], hp: [110, 88.5], k: [86.5, 97.5], a: [65, 106] },
      ],
      tips: ['Stützarm unter der Schulter', 'Hüfte hoch, Körper gerade', 'Seite wechseln nicht vergessen'],
      mistakes: ['Hüfte sinkt ab', 'Oberkörper dreht nach vorn'],
    },
  },
  {
    id: 'crunch', pop: 90, name: 'Crunches', category: 'core', unit: 'reps', unitLabel: 'Wiederholungen',
    modes: ['manual'],
    muscles: { primary: ['abs'], secondary: ['obliques'] },
    guide: {
      speed: 0.8,
      poses: [
        { h: [53, 102], s: [68, 104], e: [80, 97], w: [72, 98], ...SIT_LEGS },
        { h: [58.5, 80], s: [72.5, 88], e: [86.4, 88], w: [79, 84.8], ...SIT_LEGS },
      ],
      tips: ['Nur die Schulterblätter abheben', 'Unterer Rücken bleibt am Boden', 'Ausatmen beim Hochkommen'],
      mistakes: ['Kopf mit den Händen nach vorn ziehen'],
    },
  },
  {
    id: 'mountain', pop: 80, name: 'Mountain Climbers', category: 'core', unit: 'reps', unitLabel: 'Wiederholungen',
    modes: ['manual'],
    muscles: { primary: ['abs', 'hipflexors'], secondary: ['shoulders', 'quads'] },
    guide: {
      speed: 0.4,
      poses: [
        { ...PUSH_UP, k: [130, 99], a: [110, 106], k2: [86.5, 98], a2: [65, 106] },
        { ...PUSH_UP, k: [86.5, 98], a: [65, 106], k2: [130, 99], a2: [110, 106] },
      ],
      tips: ['Stützposition wie bei Liegestützen', 'Knie abwechselnd zur Brust', 'Hüfte bleibt tief'],
      mistakes: ['Po ragt hoch'],
    },
  },
  {
    id: 'jacks', pop: 100, alias: 'jumping jacks', name: 'Hampelmänner', category: 'cardio', unit: 'reps', unitLabel: 'Wiederholungen',
    modes: ['camera', 'manual'],
    muscles: { primary: ['calves', 'shoulders'], secondary: ['quads', 'glutes'] },
    guide: {
      front: true,
      speed: 0.45,
      poses: [
        { h: [100, 16], s: [100, 30], e: [90, 46], w: [86, 60], e2: [110, 46], w2: [114, 60], hp: [100, 62], k: [96, 86], a: [95, 108], k2: [104, 86], a2: [105, 108] },
        { h: [100, 16], s: [100, 30], e: [86, 22], w: [80, 8], e2: [114, 22], w2: [120, 8], hp: [100, 62], k: [90, 86], a: [80, 108], k2: [110, 86], a2: [120, 108] },
      ],
      tips: ['Arme über den Kopf, Beine gleichzeitig auseinander', 'Locker auf den Fußballen landen'],
      mistakes: ['Arme nur halb hoch'],
    },
  },
  {
    id: 'highknees', pop: 85, name: 'High Knees', category: 'cardio', unit: 'reps', unitLabel: 'Wiederholungen',
    modes: ['manual'],
    muscles: { primary: ['hipflexors', 'quads'], secondary: ['calves', 'abs'] },
    guide: {
      speed: 0.35,
      poses: [
        { h: [100, 16], s: [100, 30], e: [112, 42], w: [116, 30], e2: [90, 44], w2: [94, 58], hp: [100, 62], k: [120, 62], a: [116, 86], k2: [100, 86], a2: [100, 108] },
        { h: [100, 16], s: [100, 30], e: [90, 44], w: [94, 58], e2: [112, 42], w2: [116, 30], hp: [100, 62], k: [100, 86], a: [100, 108], k2: [120, 62], a2: [116, 86] },
      ],
      tips: ['Knie bis auf Hüfthöhe', 'Arme schwingen mit', 'Auf den Fußballen bleiben'],
      mistakes: ['Knie zu tief', 'Nach hinten lehnen'],
    },
  },
  {
    id: 'jumprope', pop: 90, alias: 'jump rope', name: 'Seilspringen', category: 'cardio', unit: 'reps', unitLabel: 'Sprünge',
    modes: ['manual'],
    muscles: { primary: ['calves'], secondary: ['shoulders', 'forearms', 'quads'] },
    guide: {
      front: true,
      prop: 'rope', speed: 0.3,
      poses: [
        { h: [100, 16], s: [100, 30], e: [88, 46], w: [80, 56], e2: [112, 46], w2: [120, 56], hp: [100, 62], k: [97, 86], a: [97, 108], k2: [103, 86], a2: [103, 108] },
        { h: [100, 8], s: [100, 22], e: [88, 38], w: [80, 48], e2: [112, 38], w2: [120, 48], hp: [100, 54], k: [97, 78], a: [97, 100], k2: [103, 78], a2: [103, 100] },
      ],
      tips: ['Kleine, schnelle Sprünge', 'Drehung aus den Handgelenken'],
      mistakes: ['Zu hoch springen', 'Aus den Schultern drehen'],
    },
  },
  {
    id: 'jog', pop: 100, alias: 'laufen running', dist: { minPace: 2.3, maxKm: 300 }, name: 'Joggen', category: 'ausdauer', unit: 'distance', unitLabel: 'km',
    modes: ['distance'],
    muscles: { primary: ['quads', 'hamstrings', 'calves'], secondary: ['glutes', 'hipflexors'] },
    guide: { poses: [RUN_A, RUN_B], speed: 0.4, tips: ['Aufrecht laufen, Blick nach vorn', 'Locker atmen'], mistakes: ['Zu schnell starten'] },
  },
  {
    id: 'walk', pop: 95, alias: 'spazieren walking', dist: { minPace: 2.3, maxKm: 300 }, name: 'Gehen', category: 'ausdauer', unit: 'distance', unitLabel: 'km',
    modes: ['distance'],
    muscles: { primary: ['calves', 'quads'], secondary: ['glutes', 'hamstrings'] },
    guide: { poses: [RUN_A, RUN_B], speed: 0.7, tips: ['Zügiges Tempo', 'Arme mitschwingen'], mistakes: [] },
  },
  {
    id: 'sprint', pop: 50, alias: 'intervalle hiit', dist: { minPace: 2.3, maxKm: 300 }, name: 'Sprint-Intervalle', category: 'ausdauer', unit: 'distance', unitLabel: 'km',
    modes: ['distance'],
    muscles: { primary: ['quads', 'hamstrings', 'glutes'], secondary: ['calves', 'hipflexors'] },
    guide: { poses: [RUN_A, RUN_B], speed: 0.25, tips: ['Vorher aufwärmen', 'Kurze Vollgas-Phasen, dann gehen'], mistakes: ['Ohne Aufwärmen starten'] },
  },
  {
    id: 'bike', pop: 90, alias: 'fahrrad cycling', dist: { minPace: 1, maxKm: 300 }, name: 'Radfahren', category: 'ausdauer', unit: 'distance', unitLabel: 'km',
    modes: ['distance'],
    muscles: { primary: ['quads'], secondary: ['glutes', 'calves', 'hamstrings'] },
    guide: {
      prop: 'bike', speed: 0.5,
      poses: [
        { h: [120, 16], s: [112, 30], e: [122, 42], w: [128, 50], hp: [92, 60], k: [112, 62], a: [104, 84], k2: [100, 76], a2: [92, 100] },
        { h: [120, 16], s: [112, 30], e: [122, 42], w: [128, 50], hp: [92, 60], k: [100, 76], a: [92, 100], k2: [112, 62], a2: [104, 84] },
      ],
      tips: ['Sattelhöhe: Bein unten fast gestreckt', 'Helm auf'], mistakes: [],
    },
  },
];

// ---------- Erweiterung 21.11.2026: mehr Übungen und Sportarten (noch ohne Vormach-Video) ----------

type M = MuscleId[];
const R = (o: { id: ActivityId; name: string; cat: Category; pop: number; p: M; s?: M; tips: string[]; bad?: string[]; alias?: string; unitLabel?: string }): Activity => ({
  id: o.id, name: o.name, category: o.cat, unit: 'reps', unitLabel: o.unitLabel ?? 'Wiederholungen', modes: ['manual'], pop: o.pop,
  muscles: { primary: o.p, secondary: o.s ?? [] }, guide: { tips: o.tips, mistakes: o.bad ?? [] }, ...(o.alias ? { alias: o.alias } : {}),
});
/** Halten auf Zeit (Stoppuhr), Punkte pro 5 s, höchstens maxSec */
const H = (o: { id: ActivityId; name: string; cat: Category; pop: number; p: M; s?: M; tips: string[]; bad?: string[]; alias?: string; maxSec: number }): Activity => ({
  id: o.id, name: o.name, category: o.cat, unit: 'time', unitLabel: 'Sek.', modes: ['timer'], pop: o.pop, maxSec: o.maxSec,
  muscles: { primary: o.p, secondary: o.s ?? [] }, guide: { tips: o.tips, mistakes: o.bad ?? [] }, ...(o.alias ? { alias: o.alias } : {}),
});
/** Sport nach Dauer: nachher eintragen oder Stoppuhr, Punkte pro Minute */
const D = (o: { id: ActivityId; name: string; cat: Category; pop: number; p: M; s?: M; tips: string[]; bad?: string[]; alias?: string; maxMin: number }): Activity => ({
  id: o.id, name: o.name, category: o.cat, unit: 'time', unitLabel: 'Min.', modes: ['duration', 'timer'], pop: o.pop, perMin: true, maxSec: o.maxMin * 60,
  muscles: { primary: o.p, secondary: o.s ?? [] }, guide: { tips: o.tips, mistakes: o.bad ?? [] }, ...(o.alias ? { alias: o.alias } : {}),
});
/** Strecke: km und Zeit eintragen */
const K = (o: { id: ActivityId; name: string; pop: number; p: M; s?: M; tips: string[]; bad?: string[]; alias?: string; minPace: number; maxKm: number }): Activity => ({
  id: o.id, name: o.name, category: 'ausdauer', unit: 'distance', unitLabel: 'km', modes: ['distance'], pop: o.pop, dist: { minPace: o.minPace, maxKm: o.maxKm },
  muscles: { primary: o.p, secondary: o.s ?? [] }, guide: { tips: o.tips, mistakes: o.bad ?? [] }, ...(o.alias ? { alias: o.alias } : {}),
});

const MORE: Activity[] = [
  // ----- Kraft (ohne Gerät) -----
  R({ id: 'glutebridge', name: 'Glute Bridge', cat: 'kraft', pop: 65, p: ['glutes'], s: ['hamstrings', 'lowerback'], alias: 'beckenheben hip bridge po',
    tips: ['Rückenlage, Füße hüftbreit aufgestellt', 'Po hoch, bis Knie, Hüfte und Schultern eine Linie bilden', 'Oben kurz den Po fest anspannen'],
    bad: ['Ins Hohlkreuz drücken'] }),
  R({ id: 'kneepush', name: 'Knie-Liegestütze', cat: 'kraft', pop: 55, p: ['chest', 'triceps'], s: ['shoulders', 'abs'], alias: 'knee push-ups leichte liegestütze anfänger',
    tips: ['Wie Liegestütze, aber auf den Knien', 'Gerade Linie von Kopf bis Knie', 'Brust fast bis zum Boden'], bad: ['Po ragt hoch'] }),
  R({ id: 'chinup', name: 'Chin-ups', cat: 'kraft', pop: 50, p: ['biceps', 'lats'], s: ['forearms', 'traps'], alias: 'untergriff klimmzüge',
    tips: ['Klimmzug mit Untergriff (Handflächen zu dir)', 'Aus dem gestreckten Hang starten', 'Kinn über die Stange'], bad: ['Schwung aus den Beinen'] }),
  R({ id: 'jumpsquat', name: 'Sprungkniebeugen', cat: 'kraft', pop: 45, p: ['quads', 'glutes'], s: ['calves', 'hamstrings'], alias: 'jump squats',
    tips: ['Kniebeuge, dann explosiv hochspringen', 'Weich auf den Fußballen landen', 'Direkt in die nächste Beuge'], bad: ['Mit gestreckten Knien landen'] }),
  R({ id: 'splitsquat', name: 'Bulgarian Split Squats', cat: 'kraft', pop: 45, p: ['quads', 'glutes'], s: ['hamstrings', 'calves'], alias: 'bulgarische kniebeuge einbeinig',
    tips: ['Hinterer Fuß auf Stuhl oder Bank', 'Senkrecht nach unten beugen', 'Jede Seite zählt als Wiederholung'], bad: ['Vorderes Knie kippt nach innen'] }),
  R({ id: 'calfraise', name: 'Wadenheben', cat: 'kraft', pop: 40, p: ['calves'], alias: 'calf raises zehenstand',
    tips: ['Auf eine Stufe stellen, Fersen hängen frei', 'Ganz hoch auf die Zehen', 'Langsam tief absenken'], bad: ['Wippen ohne volle Bewegung'] }),
  R({ id: 'diamondpush', name: 'Diamond-Liegestütze', cat: 'kraft', pop: 40, p: ['triceps', 'chest'], s: ['shoulders'], alias: 'diamond push-ups enge liegestütze',
    tips: ['Daumen und Zeigefinger bilden eine Raute unter der Brust', 'Ellbogen eng am Körper', 'Brust bis zu den Händen'], bad: ['Hüfte hängt durch'] }),
  H({ id: 'wallsit', name: 'Wandsitzen', cat: 'kraft', pop: 38, p: ['quads'], s: ['glutes', 'calves'], alias: 'wall sit stuhl', maxSec: 600,
    tips: ['Rücken an die Wand, Knie im rechten Winkel', 'Knie über den Fersen', 'Arme nicht auf die Beine stützen'], bad: ['Zu hoch sitzen'] }),
  R({ id: 'pikepush', name: 'Pike Push-ups', cat: 'kraft', pop: 35, p: ['shoulders', 'triceps'], s: ['chest', 'traps'], alias: 'schulter liegestütze',
    tips: ['Po hoch, Körper bildet ein umgedrehtes V', 'Kopf Richtung Boden zwischen die Hände', 'Wieder hochdrücken'], bad: ['Rücken rund'] }),
  R({ id: 'invrow', name: 'Rudern am Tisch', cat: 'kraft', pop: 35, p: ['lats', 'traps'], s: ['biceps', 'forearms'], alias: 'australian pull-ups inverted row umgekehrtes rudern',
    tips: ['Unter einen stabilen Tisch oder eine tiefe Stange legen', 'Körper gerade, Brust zur Kante ziehen', 'Kontrolliert ablassen'], bad: ['Hüfte sackt ab', 'Wackliger Tisch'] }),
  R({ id: 'stepup', name: 'Step-ups', cat: 'kraft', pop: 30, p: ['quads', 'glutes'], s: ['hamstrings', 'calves'], alias: 'aufsteiger stufe',
    tips: ['Auf Stufe oder Stuhl steigen', 'Mit dem oberen Bein hochdrücken', 'Jede Seite zählt'], bad: ['Mit dem unteren Bein abstoßen'] }),
  R({ id: 'superman', name: 'Superman', cat: 'kraft', pop: 30, p: ['lowerback'], s: ['glutes', 'traps', 'hamstrings'], alias: 'rückenstrecker bauchlage',
    tips: ['Bauchlage, Arme nach vorn', 'Arme und Beine gleichzeitig leicht anheben', 'Kurz halten, ablegen'], bad: ['Kopf in den Nacken'] }),
  H({ id: 'deadhang', name: 'Toter Hang', cat: 'kraft', pop: 25, p: ['forearms'], s: ['lats', 'shoulders'], alias: 'dead hang hängen griffkraft', maxSec: 300,
    tips: ['An die Stange hängen, Arme gestreckt', 'Schultern leicht aktiv', 'Ruhig atmen'], bad: ['Schwingen'] }),

  // ----- Core -----
  R({ id: 'legraise', name: 'Beinheben', cat: 'core', pop: 75, p: ['abs', 'hipflexors'], s: ['obliques'], alias: 'leg raises liegend',
    tips: ['Rückenlage, Beine gestreckt', 'Beine bis senkrecht heben', 'Langsam absenken, nicht ablegen'], bad: ['Hohlkreuz'] }),
  R({ id: 'russiantwist', name: 'Russian Twist', cat: 'core', pop: 72, p: ['obliques'], s: ['abs', 'hipflexors'], alias: 'russian twists drehen',
    tips: ['Sitzen, Oberkörper leicht zurück, Füße anheben', 'Oberkörper links und rechts drehen', 'Jede Seite zählt'], bad: ['Nur die Arme bewegen'] }),
  R({ id: 'bicyclecrunch', name: 'Fahrrad-Crunches', cat: 'core', pop: 65, p: ['obliques', 'abs'], s: ['hipflexors'], alias: 'bicycle crunches',
    tips: ['Ellbogen zum gegenüberliegenden Knie', 'Anderes Bein gestreckt', 'Jede Seite zählt'], bad: ['Am Nacken ziehen'] }),
  R({ id: 'flutterkick', name: 'Flutter Kicks', cat: 'core', pop: 45, p: ['abs', 'hipflexors'], alias: 'beinschlag scherenschlag',
    tips: ['Rückenlage, Beine knapp über dem Boden', 'Kleine schnelle Auf-ab-Bewegung', 'Jeder Schlag zählt'], bad: ['Unterer Rücken hebt ab'], unitLabel: 'Schläge' }),
  R({ id: 'deadbug', name: 'Dead Bug', cat: 'core', pop: 42, p: ['abs'], s: ['obliques', 'hipflexors'], alias: 'toter käfer',
    tips: ['Rückenlage, Arme hoch, Knie 90°', 'Arm und gegenüberliegendes Bein strecken', 'Rücken bleibt am Boden'], bad: ['Zu schnell'] }),
  H({ id: 'hollowhold', name: 'Hollow Hold', cat: 'core', pop: 40, p: ['abs'], s: ['hipflexors', 'obliques'], alias: 'schiffchen', maxSec: 300,
    tips: ['Rückenlage, Schultern und Beine anheben', 'Unterer Rücken drückt in den Boden', 'Halten'], bad: ['Hohlkreuz'] }),
  R({ id: 'vup', name: 'V-ups', cat: 'core', pop: 40, p: ['abs', 'hipflexors'], s: ['obliques'], alias: 'klappmesser jackknife',
    tips: ['Arme und Beine gleichzeitig nach oben', 'Hände Richtung Füße', 'Kontrolliert ablegen'], bad: ['Mit Schwung'] }),
  R({ id: 'hangingknee', name: 'Knieheben hängend', cat: 'core', pop: 35, p: ['abs', 'hipflexors'], s: ['forearms', 'obliques'], alias: 'hanging knee raises stange',
    tips: ['An der Stange hängen', 'Knie zur Brust ziehen', 'Ohne Schwung ablassen'], bad: ['Schaukeln'] }),

  // ----- Cardio -----
  R({ id: 'skater', name: 'Skater Jumps', cat: 'cardio', pop: 60, p: ['glutes', 'quads'], s: ['calves'], alias: 'eisschnellläufer seitsprünge',
    tips: ['Seitlich von einem Bein aufs andere springen', 'Weich landen', 'Jeder Sprung zählt'], bad: ['Knie kippt nach innen'], unitLabel: 'Sprünge' }),
  R({ id: 'buttkicks', name: 'Anfersen', cat: 'cardio', pop: 55, p: ['hamstrings'], s: ['calves', 'quads'], alias: 'butt kicks',
    tips: ['Auf der Stelle laufen', 'Fersen zum Po', 'Jeder Schritt zählt'], bad: ['Nach vorn lehnen'], unitLabel: 'Schritte' }),
  D({ id: 'shadowbox', name: 'Schattenboxen', cat: 'cardio', pop: 50, p: ['shoulders'], s: ['abs', 'obliques', 'calves'], alias: 'shadow boxing', maxMin: 60,
    tips: ['Locker auf den Fußballen', 'Schläge aus der Hüfte', 'Deckung oben'], bad: ['Arme ganz durchstrecken (Ellbogen)'] }),
  R({ id: 'boxjump', name: 'Box Jumps', cat: 'cardio', pop: 45, p: ['quads', 'glutes'], s: ['calves', 'hamstrings'], alias: 'kastensprünge',
    tips: ['Beidbeinig auf eine stabile Erhöhung springen', 'Oben ganz aufrichten', 'Heruntersteigen statt springen'], bad: ['Zu hohe Kiste'], unitLabel: 'Sprünge' }),
  R({ id: 'tuckjump', name: 'Hocksprünge', cat: 'cardio', pop: 40, p: ['quads', 'calves'], s: ['abs', 'glutes'], alias: 'tuck jumps',
    tips: ['Hochspringen, Knie zur Brust', 'Weich landen'], bad: ['Steif landen'], unitLabel: 'Sprünge' }),

  // ----- Ausdauer -----
  K({ id: 'hike', name: 'Wandern', pop: 85, p: ['quads', 'calves'], s: ['glutes', 'hamstrings'], alias: 'hiking bergwandern', minPace: 5, maxKm: 100,
    tips: ['Feste Schuhe', 'Genug trinken'] }),
  K({ id: 'swim', name: 'Schwimmen', pop: 80, p: ['lats', 'shoulders'], s: ['chest', 'triceps', 'quads'], alias: 'swimming kraulen brustschwimmen bahnen', minPace: 9, maxKm: 30,
    tips: ['Bahnen zählen: 20 × 50 m = 1 km', 'Gleichmäßig atmen'] }),
  K({ id: 'nordic', name: 'Nordic Walking', pop: 55, p: ['quads', 'calves'], s: ['shoulders', 'triceps', 'lats'], alias: 'stöcke walken', minPace: 5, maxKm: 100,
    tips: ['Stöcke diagonal zum Bein einsetzen', 'Arme aktiv nach hinten schieben'] }),
  D({ id: 'spinning', name: 'Indoor Cycling', cat: 'ausdauer', pop: 45, p: ['quads'], s: ['glutes', 'calves', 'hamstrings'], alias: 'spinning heimtrainer ergometer radkurs', maxMin: 180,
    tips: ['Sattel auf Hüfthöhe', 'Wasser bereitstellen'] }),
  D({ id: 'crosstrainer', name: 'Crosstrainer', cat: 'ausdauer', pop: 40, p: ['quads', 'glutes'], s: ['shoulders', 'calves'], alias: 'ellipsentrainer', maxMin: 180,
    tips: ['Aufrecht stehen', 'Arme aktiv mitziehen'] }),
  K({ id: 'rowing', name: 'Rudern (Ergometer)', pop: 35, p: ['lats', 'quads'], s: ['biceps', 'glutes', 'lowerback'], alias: 'rudergerät concept2 rowing', minPace: 2.7, maxKm: 100,
    tips: ['Reihenfolge: Beine, Oberkörper, Arme', 'Zurück: Arme, Oberkörper, Beine'], bad: ['Nur aus den Armen ziehen'] }),
  K({ id: 'inline', name: 'Inlineskaten', pop: 30, p: ['quads', 'glutes'], s: ['calves', 'abs'], alias: 'inliner rollschuh skaten', minPace: 1.2, maxKm: 300,
    tips: ['Helm und Schoner'] }),

  // ----- Sportarten (Dauer) -----
  D({ id: 'football', name: 'Fußball', cat: 'sport', pop: 100, p: ['quads', 'hamstrings'], s: ['calves', 'glutes', 'hipflexors'], alias: 'soccer kicken', maxMin: 180,
    tips: ['Nur die echte Spielzeit eintragen', 'Vorher aufwärmen'] }),
  D({ id: 'yoga', name: 'Yoga', cat: 'sport', pop: 95, p: ['abs'], s: ['shoulders', 'hamstrings', 'glutes'], maxMin: 120,
    tips: ['Ruhig atmen', 'Nicht in den Schmerz dehnen'] }),
  D({ id: 'tennis', name: 'Tennis', cat: 'sport', pop: 80, p: ['shoulders', 'forearms'], s: ['quads', 'calves', 'obliques'], maxMin: 240,
    tips: ['Nur Spielzeit eintragen, keine langen Pausen'] }),
  D({ id: 'dance', name: 'Tanzen / Fitness-Dance', cat: 'sport', pop: 78, p: ['calves', 'quads'], s: ['glutes', 'abs'], alias: 'zumba fitness-dance tanzkurs', maxMin: 180,
    tips: ['Locker bleiben und Spaß haben'] }),
  D({ id: 'pilates', name: 'Pilates', cat: 'sport', pop: 75, p: ['abs'], s: ['obliques', 'glutes', 'lowerback'], maxMin: 120,
    tips: ['Bewegungen langsam und genau'] }),
  D({ id: 'climbing', name: 'Klettern / Bouldern', cat: 'sport', pop: 70, p: ['forearms', 'lats'], s: ['biceps', 'shoulders', 'abs'], alias: 'bouldern climbing kletterhalle', maxMin: 240,
    tips: ['Pausen zwischen den Routen zählen mit, lange Pausen nicht'] }),
  D({ id: 'volleyball', name: 'Volleyball', cat: 'sport', pop: 65, p: ['shoulders', 'quads'], s: ['calves', 'abs'], alias: 'beachvolleyball', maxMin: 180, tips: ['Vorher Schultern aufwärmen'] }),
  D({ id: 'basketball', name: 'Basketball', cat: 'sport', pop: 63, p: ['quads', 'calves'], s: ['shoulders', 'glutes'], alias: 'streetball korbball', maxMin: 180, tips: ['Gute Schuhe für die Knöchel'] }),
  D({ id: 'tabletennis', name: 'Tischtennis', cat: 'sport', pop: 60, p: ['forearms', 'shoulders'], s: ['quads', 'obliques'], alias: 'ping pong', maxMin: 180, tips: ['Aus den Beinen spielen'] }),
  D({ id: 'badminton', name: 'Badminton', cat: 'sport', pop: 58, p: ['shoulders', 'quads'], s: ['calves', 'forearms'], alias: 'federball', maxMin: 180, tips: ['Nur Spielzeit eintragen'] }),
  D({ id: 'martial', name: 'Kampfsport / Boxen', cat: 'sport', pop: 55, p: ['shoulders', 'abs'], s: ['quads', 'obliques', 'calves'], alias: 'boxen kickboxen karate judo mma', maxMin: 180,
    tips: ['Training eintragen, nicht die Fahrt hin'] }),
  D({ id: 'handball', name: 'Handball', cat: 'sport', pop: 52, p: ['shoulders', 'quads'], s: ['calves', 'chest', 'triceps'], maxMin: 180, tips: ['Nur Spielzeit eintragen'] }),
  D({ id: 'padel', name: 'Padel', cat: 'sport', pop: 50, p: ['shoulders', 'quads'], s: ['forearms', 'calves'], alias: 'padel-tennis', maxMin: 240, tips: ['Nur Spielzeit eintragen'] }),
  D({ id: 'ski', name: 'Skifahren / Snowboard', cat: 'sport', pop: 48, p: ['quads', 'glutes'], s: ['calves', 'abs'], alias: 'snowboarden ski alpin', maxMin: 360,
    tips: ['Nur Zeit auf der Piste, nicht im Lift oder in der Hütte'] }),
];

/** Alle Übungen, je Kategorie nach Beliebtheit sortiert (beliebteste zuerst). */
/**
 * Automatische Zähl-Modi (23.11.2026). Reihenfolge = Reihenfolge der Knöpfe, der erste ist Standard.
 * Kamera: Regeln in features/pose/counters.ts, Sprung: features/motion.ts, GPS: screens/live/GpsLive.tsx.
 */
const AUTO_MODES: Partial<Record<ActivityId, Mode[]>> = {
  squat: ['camera', 'manual'],
  lunge: ['camera', 'manual'],
  wallsit: ['camera', 'timer'],
  pullup: ['camera', 'manual'],
  chinup: ['camera', 'manual'],
  dip: ['camera', 'manual'],
  burpee: ['camera', 'manual'],
  glutebridge: ['camera', 'manual'],
  mountain: ['camera', 'manual'],
  highknees: ['camera', 'jump', 'manual'],
  jacks: ['camera', 'jump', 'manual'],
  jumprope: ['jump', 'manual'],
  buttkicks: ['jump', 'manual'],
  tuckjump: ['jump', 'manual'],
  skater: ['jump', 'manual'],
  jog: ['gps', 'distance'],
  walk: ['gps', 'distance'],
  sprint: ['gps', 'distance'],
  bike: ['gps', 'distance'],
  hike: ['gps', 'distance'],
  nordic: ['gps', 'distance'],
  inline: ['gps', 'distance'],
};

export const ACTIVITIES: Activity[] = [...BASE, ...MORE]
  .map((a) => (AUTO_MODES[a.id] ? { ...a, modes: AUTO_MODES[a.id]! } : a))
  .sort((a, b) => b.pop - a.pop);

export const ACT: Record<ActivityId, Activity> = Object.fromEntries(ACTIVITIES.map((a) => [a.id, a])) as Record<ActivityId, Activity>;

/** Wie das Handy bei jedem Modus liegen soll. */
export function setupHint(id: ActivityId, mode: Mode): string | null {
  if (mode === 'camera' && id === 'pushup')
    return 'Handy quer, 1–2 m seitlich auf den Boden. Oberkörper und Arme reichen. Geht auch von vorn (Handy vor dem Kopf).';
  if (mode === 'camera' && id === 'situp')
    return 'Handy quer, 2 m seitlich auf Hüfthöhe. Kopf bis Knie im Bild.';
  if (mode === 'camera' && id === 'squat')
    return 'Handy hochkant, seitlich auf Hüfthöhe. Am besten Kopf bis Füße, Kopf bis Knie geht auch. Im engen Raum reicht Oberkörper bis Hüfte.';
  if (mode === 'camera' && id === 'jacks')
    return 'Handy hochkant, vor dir auf Brusthöhe. Hände über dem Kopf im Bild. Sind die Füße nicht drin, zählen nur die Arme.';
  if (mode === 'camera' && id === 'plank')
    return 'Handy quer, seitlich auf den Boden. Am besten Kopf bis Füße. Schulter und Hüfte reichen, dann wird die Linie nicht geprüft.';
  if (mode === 'camera') {
    const cam: Partial<Record<ActivityId, string>> = {
      pullup: 'Handy hochkant, schräg vor der Stange auf den Boden (z. B. an eine Wasserflasche lehnen). Kopf und Hände müssen im Bild sein.',
      dip: 'Handy quer, seitlich auf Schulterhöhe (Stuhl, Regal). Schulter, Ellbogen und Hand im Bild.',
      lunge: 'Handy quer, 2–3 m seitlich auf Kniehöhe. Hüfte, Knie und Füße im Bild.',
      highknees: 'Handy hochkant, vor dir auf Hüfthöhe. Hüfte und Knie im Bild.',
      mountain: 'Handy quer, seitlich auf den Boden. Schulter, Hüfte und Knie im Bild.',
      burpee: 'Handy hochkant, 3 m seitlich auf Hüfthöhe. Der ganze Körper muss reinpassen, auch die Arme beim Sprung.',
      glutebridge: 'Handy quer, seitlich auf den Boden. Schulter, Hüfte und Knie im Bild.',
      wallsit: 'Handy quer, seitlich auf Kniehöhe. Hüfte und Knie im Bild, am besten auch die Füße.',
    };
    return cam[id === 'chinup' ? 'pullup' : id] ?? null;
  }
  if (mode === 'jump') {
    if (id === 'jumprope') return 'Handy fest mit dem Griff in die Hand oder eng am Körper tragen. Kurz still stehen, bis es piept, dann springen.';
    return 'Handy eng am Körper tragen (z. B. Laufgürtel oder Armtasche). Kurz still stehen, bis es piept, dann los.';
  }
  if (mode === 'gps') return 'Draußen starten. Beim ersten Mal fragt das Handy, ob die App den Standort nutzen darf. Der Bildschirm bleibt während des Trainings an.';
  if (mode === 'sensor') return 'Handy flach auf die Brust, Bildschirm nach oben.';
  if (mode === 'nosetap') return 'Handy unter dein Gesicht, Nase tippt bei jeder Wdh.';
  return null;
}

/**
 * Zuletzt gewählter Modus, falls es ihn für die Übung noch gibt. Sonst der Standard.
 * "Hosentasche" gibt es seit 24.11.2026 nicht mehr: wer das gewählt hatte, zählt wieder selbst (bzw. mit Timer).
 */
export function startMode(a: Activity, last?: string): Mode {
  if (last && (a.modes as string[]).includes(last)) return last as Mode;
  if (last === 'pocket') return a.modes.find((m) => m === 'manual' || m === 'timer') ?? a.modes[0];
  return a.modes[0];
}

/** Diese Modi brauchen keinen Countdown (man trägt Werte nachher ein) */
export function skipsCountdown(mode: Mode): boolean {
  return mode === 'distance' || mode === 'duration';
}

/** Suchtext einer Übung: Name + andere Namen, klein geschrieben */
export function searchText(a: Activity): string {
  return `${a.name} ${a.alias ?? ''}`.toLowerCase();
}

/** Strecken-Grenzen gegen Tippfehler und Schummeln */
export function distanceLimits(a: Activity): { minPace: number; maxKm: number } {
  return a.dist ?? { minPace: 2.3, maxKm: 300 };
}
