import type { MuscleId } from './activities';

// Geräte- und Hantelübungen: Wiederholungen und Gewicht werden von Hand eingetragen.

export type GymGroup = 'brust' | 'ruecken' | 'beine' | 'schultern' | 'arme' | 'bauch';
export type Equipment = 'Langhantel' | 'Kurzhantel' | 'Maschine' | 'Kabelzug' | 'Körpergewicht';

export interface GymExercise {
  id: string;
  name: string;
  group: GymGroup;
  equipment: Equipment;
  muscles: { primary: MuscleId[]; secondary: MuscleId[] };
  /** Selbst angelegte Übung */
  custom?: boolean;
  /**
   * Beliebtheit: Anteil an allen geloggten Sätzen in Prozent (StrengthLog 2025, über 700.000 Nutzer).
   * Übungen ohne Wert in der Studie haben eine Schätzung unter 1 % (siehe BELIEBTHEIT.md).
   */
  pop?: number;
  /**
   * Gewichtsfaktor für Punkte: Bei Übungen, an denen man naturgemäß sehr viel Gewicht bewegt
   * (Beinpresse, Wadenmaschine …), zählt das kg-Gewicht nur anteilig. Standard 1.
   */
  load?: number;
}

export const GYM_GROUPS: { id: GymGroup; name: string }[] = [
  { id: 'brust', name: 'Brust' },
  { id: 'ruecken', name: 'Rücken' },
  { id: 'beine', name: 'Beine' },
  { id: 'schultern', name: 'Schultern' },
  { id: 'arme', name: 'Arme' },
  { id: 'bauch', name: 'Bauch' },
];

/** Standard-Muskeln für selbst angelegte Übungen */
export const GROUP_MUSCLES: Record<GymGroup, { primary: MuscleId[]; secondary: MuscleId[] }> = {
  brust: { primary: ['chest'], secondary: ['triceps', 'shoulders'] },
  ruecken: { primary: ['lats'], secondary: ['traps', 'biceps', 'lowerback'] },
  beine: { primary: ['quads', 'glutes'], secondary: ['hamstrings', 'calves'] },
  schultern: { primary: ['shoulders'], secondary: ['traps', 'triceps'] },
  arme: { primary: ['biceps', 'triceps'], secondary: ['forearms'] },
  bauch: { primary: ['abs'], secondary: ['obliques'] },
};

const ex = (id: string, name: string, group: GymGroup, equipment: Equipment, primary: MuscleId[], secondary: MuscleId[] = []): GymExercise =>
  ({ id, name, group, equipment, muscles: { primary, secondary } });

const LIST: GymExercise[] = [
  // ----- Brust -----
  ex('bench', 'Bankdrücken', 'brust', 'Langhantel', ['chest', 'triceps'], ['shoulders']),
  ex('incline_db', 'Schrägbankdrücken', 'brust', 'Kurzhantel', ['chest', 'shoulders'], ['triceps']),
  ex('cable_fly', 'Cable Fly', 'brust', 'Kabelzug', ['chest'], ['shoulders']),
  ex('db_press', 'Kurzhantel-Bankdrücken', 'brust', 'Kurzhantel', ['chest', 'triceps'], ['shoulders']),
  ex('chest_press', 'Brustpresse', 'brust', 'Maschine', ['chest', 'triceps'], ['shoulders']),
  ex('butterfly', 'Butterfly', 'brust', 'Maschine', ['chest'], ['shoulders']),
  ex('incline_bb', 'Schrägbankdrücken Langhantel', 'brust', 'Langhantel', ['chest', 'shoulders'], ['triceps']),
  ex('fly', 'Fliegende', 'brust', 'Kurzhantel', ['chest'], ['shoulders']),
  ex('decline_bench', 'Negativ-Bankdrücken', 'brust', 'Langhantel', ['chest', 'triceps'], ['shoulders']),

  // ----- Rücken -----
  ex('deadlift', 'Kreuzheben', 'ruecken', 'Langhantel', ['lowerback', 'glutes', 'hamstrings'], ['quads', 'traps', 'forearms']),
  ex('lat_pulldown', 'Latziehen', 'ruecken', 'Kabelzug', ['lats'], ['biceps', 'shoulders']),
  ex('bb_row', 'Langhantelrudern', 'ruecken', 'Langhantel', ['lats', 'traps'], ['biceps', 'lowerback']),
  ex('weighted_pullup', 'Klimmzüge mit Gewicht', 'ruecken', 'Körpergewicht', ['lats', 'biceps'], ['forearms', 'traps']),
  ex('cable_row', 'Rudern am Kabel', 'ruecken', 'Kabelzug', ['lats', 'traps'], ['biceps']),
  ex('db_row', 'Kurzhantelrudern', 'ruecken', 'Kurzhantel', ['lats'], ['biceps', 'traps']),
  ex('tbar_row', 'T-Bar-Rudern', 'ruecken', 'Langhantel', ['lats', 'traps'], ['biceps', 'lowerback']),
  ex('machine_row', 'Rudermaschine', 'ruecken', 'Maschine', ['lats', 'traps'], ['biceps']),
  ex('back_ext', 'Rückenstrecker (Hyperextension)', 'ruecken', 'Körpergewicht', ['lowerback'], ['glutes', 'hamstrings']),
  ex('pullover', 'Überzüge am Kabel', 'ruecken', 'Kabelzug', ['lats'], ['chest', 'triceps']),

  // ----- Beine -----
  ex('back_squat', 'Kniebeuge mit Langhantel', 'beine', 'Langhantel', ['quads', 'glutes'], ['hamstrings', 'lowerback']),
  ex('leg_ext', 'Beinstrecker', 'beine', 'Maschine', ['quads']),
  ex('leg_curl', 'Beinbeuger', 'beine', 'Maschine', ['hamstrings'], ['calves']),
  ex('leg_press', 'Beinpresse', 'beine', 'Maschine', ['quads', 'glutes'], ['hamstrings']),
  ex('rdl', 'Rumänisches Kreuzheben', 'beine', 'Langhantel', ['hamstrings', 'glutes'], ['lowerback']),
  ex('hip_thrust', 'Hip Thrust', 'beine', 'Langhantel', ['glutes'], ['hamstrings']),
  ex('bulgarian', 'Bulgarian Split Squat', 'beine', 'Kurzhantel', ['quads', 'glutes'], ['hamstrings']),
  ex('hip_abduction', 'Abduktoren-Maschine', 'beine', 'Maschine', ['glutes']),
  ex('calf_raise', 'Wadenheben', 'beine', 'Maschine', ['calves']),
  ex('hack_squat', 'Hackenschmidt-Kniebeuge', 'beine', 'Maschine', ['quads', 'glutes'], ['hamstrings']),
  ex('goblet_squat', 'Goblet Squat', 'beine', 'Kurzhantel', ['quads', 'glutes'], ['abs']),
  ex('db_lunge', 'Ausfallschritte mit Kurzhanteln', 'beine', 'Kurzhantel', ['quads', 'glutes'], ['hamstrings', 'calves']),
  ex('hip_adduction', 'Adduktoren-Maschine', 'beine', 'Maschine', ['quads'], ['glutes']),
  ex('front_squat', 'Frontkniebeuge', 'beine', 'Langhantel', ['quads'], ['glutes', 'abs']),

  // ----- Schultern -----
  ex('ohp', 'Schulterdrücken', 'schultern', 'Langhantel', ['shoulders', 'triceps'], ['traps']),
  ex('lateral_raise', 'Seitheben', 'schultern', 'Kurzhantel', ['shoulders'], ['traps']),
  ex('db_shoulder', 'Kurzhantel-Schulterdrücken', 'schultern', 'Kurzhantel', ['shoulders'], ['triceps']),
  ex('face_pull', 'Face Pulls', 'schultern', 'Kabelzug', ['shoulders', 'traps']),
  ex('reverse_fly', 'Reverse Butterfly', 'schultern', 'Maschine', ['shoulders'], ['traps']),
  ex('shrug', 'Shrugs', 'schultern', 'Kurzhantel', ['traps'], ['forearms']),
  ex('cable_lateral', 'Seitheben am Kabel', 'schultern', 'Kabelzug', ['shoulders']),
  ex('front_raise', 'Frontheben', 'schultern', 'Kurzhantel', ['shoulders']),
  ex('machine_shoulder', 'Schulterpresse', 'schultern', 'Maschine', ['shoulders', 'triceps']),
  ex('arnold', 'Arnold Press', 'schultern', 'Kurzhantel', ['shoulders'], ['triceps']),
  ex('upright_row', 'Aufrechtes Rudern', 'schultern', 'Langhantel', ['shoulders', 'traps'], ['biceps']),

  // ----- Arme -----
  ex('pushdown', 'Trizepsdrücken am Kabel', 'arme', 'Kabelzug', ['triceps']),
  ex('bb_curl', 'Langhantelcurls', 'arme', 'Langhantel', ['biceps'], ['forearms']),
  ex('curl', 'Bizepscurls', 'arme', 'Kurzhantel', ['biceps'], ['forearms']),
  ex('hammer', 'Hammercurls', 'arme', 'Kurzhantel', ['biceps', 'forearms']),
  ex('close_bench', 'Enges Bankdrücken', 'arme', 'Langhantel', ['triceps', 'chest'], ['shoulders']),
  ex('skull', 'French Press', 'arme', 'Langhantel', ['triceps']),
  ex('overhead_ext', 'Trizepsdrücken über Kopf', 'arme', 'Kabelzug', ['triceps']),
  ex('preacher', 'Scottcurls', 'arme', 'Maschine', ['biceps']),
  ex('dips_weighted', 'Dips mit Gewicht', 'arme', 'Körpergewicht', ['triceps', 'chest'], ['shoulders']),
  ex('cable_curl', 'Bizepscurls am Kabel', 'arme', 'Kabelzug', ['biceps'], ['forearms']),
  ex('conc_curl', 'Konzentrationscurls', 'arme', 'Kurzhantel', ['biceps']),
  ex('wrist_curl', 'Unterarmcurls', 'arme', 'Kurzhantel', ['forearms']),

  // ----- Bauch -----
  ex('cable_crunch', 'Kabel-Crunch', 'bauch', 'Kabelzug', ['abs'], ['obliques']),
  ex('hanging_leg_raise', 'Beinheben hängend', 'bauch', 'Körpergewicht', ['abs', 'hipflexors'], ['forearms', 'obliques']),
  ex('ab_machine', 'Bauchmaschine', 'bauch', 'Maschine', ['abs'], ['obliques']),
  ex('ab_wheel', 'Ab-Roller', 'bauch', 'Körpergewicht', ['abs'], ['lats', 'shoulders']),
  ex('russian_twist', 'Russian Twist mit Gewicht', 'bauch', 'Kurzhantel', ['obliques'], ['abs']),
  ex('woodchop', 'Holzhacker am Kabel', 'bauch', 'Kabelzug', ['obliques'], ['abs', 'shoulders']),
  ex('decline_situp', 'Sit-ups auf der Schrägbank', 'bauch', 'Körpergewicht', ['abs', 'hipflexors']),
  ex('side_bend', 'Seitbeugen mit Kurzhantel', 'bauch', 'Kurzhantel', ['obliques']),
];

/**
 * Beliebtheit in % aller geloggten Sätze (StrengthLog, "Most Popular Gym Exercises 2025", 700.000+ Nutzer).
 * Zusammengefasst, wenn StrengthLog Varianten trennt (Beinbeuger liegend 1,3 + sitzend 1,2; Pushdown Stange 2,0 + Seil 1,5;
 * Rumänisches 1,3 + gestrecktes Kreuzheben 1,1). Werte unter 1 % sind Schätzungen (nicht in den Top 25).
 */
const POP: Record<string, number> = {
  bench: 9.7, incline_db: 1.9, cable_fly: 1.1, db_press: 1.0, chest_press: 0.9, butterfly: 0.8, incline_bb: 0.7, fly: 0.5, decline_bench: 0.3,
  deadlift: 5.0, lat_pulldown: 3.8, bb_row: 3.2, weighted_pullup: 1.7, cable_row: 1.6, db_row: 1.3, tbar_row: 0.8, machine_row: 0.7, back_ext: 0.6, pullover: 0.4,
  back_squat: 7.0, leg_ext: 2.5, leg_curl: 2.5, leg_press: 2.2, rdl: 2.4, hip_thrust: 1.2, bulgarian: 0.9, hip_abduction: 0.6, calf_raise: 0.6, hack_squat: 0.5,
  goblet_squat: 0.5, db_lunge: 0.4, hip_adduction: 0.4, front_squat: 0.3,
  ohp: 3.4, lateral_raise: 2.7, db_shoulder: 1.3, face_pull: 1.0, reverse_fly: 0.8, shrug: 0.6, cable_lateral: 0.5, front_raise: 0.4, machine_shoulder: 0.4, arnold: 0.3, upright_row: 0.3,
  pushdown: 3.5, bb_curl: 2.1, curl: 1.7, hammer: 1.1, close_bench: 0.95, skull: 0.8, overhead_ext: 0.7, preacher: 0.6, dips_weighted: 0.5, cable_curl: 0.5, conc_curl: 0.3, wrist_curl: 0.2,
  cable_crunch: 0.6, hanging_leg_raise: 0.55, ab_machine: 0.5, ab_wheel: 0.4, russian_twist: 0.35, woodchop: 0.3, decline_situp: 0.3, side_bend: 0.2,
};

/** Gegen Fantasie-Gewichte: hier zählt das kg-Gewicht nur anteilig (man bewegt dort sehr viel mehr als z. B. beim Bankdrücken) */
const LOAD: Record<string, number> = { leg_press: 0.5, hack_squat: 0.6, calf_raise: 0.5, hip_thrust: 0.6, hip_abduction: 0.5, hip_adduction: 0.5, shrug: 0.6 };

/** Alle Geräteübungen, je Muskelgruppe nach Beliebtheit sortiert (beliebteste zuerst). */
export const GYM_EXERCISES: GymExercise[] = LIST
  .map((e) => ({ ...e, pop: POP[e.id] ?? 0, ...(LOAD[e.id] ? { load: LOAD[e.id] } : {}) }))
  .sort((a, b) => (b.pop ?? 0) - (a.pop ?? 0));

export const EQUIPMENT: Equipment[] = ['Langhantel', 'Kurzhantel', 'Maschine', 'Kabelzug', 'Körpergewicht'];

/** Andere Namen, unter denen man eine Übung sucht (Studio-Sprache, Englisch) */
export const GYM_ALIASES: Record<string, string> = {
  bench: 'bench press flachbank',
  incline_db: 'incline schrägbank',
  fly: 'flys flyes',
  chest_press: 'chest press',
  butterfly: 'pec deck',
  deadlift: 'deadlift',
  bb_row: 'barbell row vorgebeugtes rudern',
  db_row: 'einarmiges rudern dumbbell row',
  lat_pulldown: 'latzug lat pulldown',
  cable_row: 'rudermaschine ruderzug seated row kabelrudern',
  weighted_pullup: 'pull-ups pullups klimmzug',
  back_squat: 'squat kniebeugen',
  leg_press: 'leg press',
  rdl: 'romanian deadlift rdl',
  leg_ext: 'leg extension beinstrecken',
  leg_curl: 'leg curl beinbeugen',
  hip_thrust: 'hüftheben gesäß',
  calf_raise: 'calf raises waden',
  goblet_squat: 'kniebeuge kurzhantel',
  ohp: 'overhead press military press',
  lateral_raise: 'lateral raises seitheben',
  face_pull: 'facepull',
  shrug: 'schulterheben nacken',
  curl: 'bizeps curls',
  pushdown: 'trizeps pushdown',
  skull: 'skull crusher stirndrücken',
  dips_weighted: 'dips barren',
  ab_machine: 'bauch crunch maschine',
  cable_crunch: 'bauch',
  russian_twist: 'seitlicher bauch',
  db_press: 'dumbbell bench press flachbank kurzhantel',
  db_shoulder: 'dumbbell shoulder press',
  bb_curl: 'barbell curl sz-stange',
  hammer: 'hammer curls',
  cable_fly: 'cable crossover kabelzug fliegende',
  incline_bb: 'incline barbell press',
  decline_bench: 'decline bench press',
  tbar_row: 't-bar row',
  machine_row: 'seated machine row',
  back_ext: 'back extension hyperextensions unterer rücken',
  pullover: 'straight arm pulldown pullover',
  bulgarian: 'split squat einbeinige kniebeuge',
  hip_abduction: 'abduktoren abductor gesäß außen',
  hack_squat: 'hack squat',
  db_lunge: 'lunges ausfallschritte',
  hip_adduction: 'adduktoren adductor innenseite',
  front_squat: 'front squat',
  reverse_fly: 'reverse pec deck hintere schulter rear delt',
  cable_lateral: 'cable lateral raise',
  front_raise: 'front raise',
  machine_shoulder: 'shoulder press machine',
  arnold: 'arnold press',
  upright_row: 'upright row',
  close_bench: 'close grip bench press',
  overhead_ext: 'overhead extension trizeps',
  preacher: 'preacher curl scott',
  cable_curl: 'cable curl',
  conc_curl: 'concentration curl',
  wrist_curl: 'unterarm wrist curl',
  hanging_leg_raise: 'hanging leg raise beinheben stange',
  ab_wheel: 'ab wheel bauchroller',
  woodchop: 'woodchopper',
  decline_situp: 'decline sit-up',
  side_bend: 'side bend seitlicher bauch',
};
