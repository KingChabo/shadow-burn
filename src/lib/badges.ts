import type { ActivityId } from '../data/activities';
import { db, getKV, setKV, type GymLog, type Workout } from './db';
import type { Wallet } from './game';
import type { StreakState } from './streak';
import { levelFromXp } from './level';

/**
 * Abzeichen: jedes hat 7 Stufen (Bronze, Silber, Gold, Platin, Diamant, Legende, Shadow). Der Fortschritt
 * wird immer aus den gespeicherten Trainings berechnet. Gespeichert wird nur, welche Stufe schon belohnt
 * wurde (kv 'badges', Zahl 0–7). Alte Stände (nur 1–3) bleiben gültig; die neuen Stufen bauen darauf auf.
 */

/** 0 = noch keine, 1 Bronze, 2 Silber, 3 Gold, 4 Platin, 5 Diamant, 6 Legende, 7 Shadow */
export type Tier = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7;
export const MAX_TIER = 7 as const;
export const TIER_NAMES = ['Gesperrt', 'Bronze', 'Silber', 'Gold', 'Platin', 'Diamant', 'Legende', 'Shadow'] as const;
/** Gems für das Erreichen einer Stufe */
export const TIER_GEMS = [0, 10, 25, 60, 125, 250, 500, 1000] as const;
/** Schwellen für Bronze … Shadow */
export type Steps = [number, number, number, number, number, number, number];

export interface BadgeInput {
  workouts: Workout[];
  gymLogs: GymLog[];
  streak: StreakState;
  xp: number;
  friends: number;
}

export interface BadgeDef {
  id: string;
  name: string;
  /** Was gezählt wird, für die Beschreibung */
  what: string;
  /** Einheit kurz (für die Zahl im Kreis) */
  unit: string;
  /** Kürzel, 2 Buchstaben */
  short: string;
  steps: Steps;
  value: (i: BadgeInput) => number;
}

const sumReps = (ids: ActivityId[]) => (i: BadgeInput) => i.workouts.filter((w) => ids.includes(w.activityId)).reduce((s, w) => s + (w.reps || 0), 0);
const sumKm = (ids: ActivityId[]) => (i: BadgeInput) => i.workouts.filter((w) => ids.includes(w.activityId)).reduce((s, w) => s + (w.km || 0), 0);
const days = (i: BadgeInput) => new Set([...i.workouts, ...i.gymLogs].map((x) => x.day)).size;
const workSets = (i: BadgeInput) => i.gymLogs.reduce((s, l) => s + l.sets.filter((x) => !x.warmup).length, 0);

export const BADGES: BadgeDef[] = [
  { id: 'pushups', name: 'Liegestütze', what: 'Liegestütze insgesamt', unit: 'Wdh.', short: 'LS', steps: [100, 500, 2000, 5000, 15000, 40000, 100000], value: sumReps(['pushup']) },
  { id: 'squats', name: 'Kniebeugen', what: 'Kniebeugen insgesamt', unit: 'Wdh.', short: 'KB', steps: [100, 500, 2000, 5000, 15000, 40000, 100000], value: sumReps(['squat']) },
  { id: 'situps', name: 'Sit-ups', what: 'Sit-ups und Crunches insgesamt', unit: 'Wdh.', short: 'SU', steps: [100, 500, 2000, 5000, 15000, 40000, 100000], value: sumReps(['situp', 'crunch']) },
  { id: 'run', name: 'Läufer', what: 'Kilometer gejoggt und gesprintet', unit: 'km', short: 'LF', steps: [10, 50, 200, 500, 1000, 2500, 5000], value: sumKm(['jog', 'sprint']) },
  { id: 'distance', name: 'Weltenbummler', what: 'Kilometer insgesamt (laufen, gehen, Rad und mehr)', unit: 'km', short: 'WB',
    steps: [25, 150, 600, 1500, 4000, 10000, 25000], value: (i) => i.workouts.reduce((s, w) => s + (w.km || 0), 0) },
  { id: 'plank', name: 'Eiserne Mitte', what: 'Minuten Plank gehalten', unit: 'Min.', short: 'EM', steps: [5, 30, 120, 300, 600, 1500, 3000],
    value: (i) => i.workouts.filter((w) => w.activityId === 'plank' || w.activityId === 'sideplank').reduce((s, w) => s + (w.seconds || 0), 0) / 60 },
  { id: 'camera', name: 'Kamera-Profi', what: 'Wiederholungen, die die Kamera gezählt hat', unit: 'Wdh.', short: 'KP', steps: [50, 500, 2000, 5000, 15000, 40000, 100000],
    value: (i) => i.workouts.filter((w) => w.mode === 'camera').reduce((s, w) => s + (w.reps || 0), 0) },
  { id: 'gymsets', name: 'Eisenfresser', what: 'Arbeitssätze an Geräten und Hanteln', unit: 'Sätze', short: 'EF', steps: [50, 300, 1500, 4000, 10000, 25000, 50000], value: workSets },
  { id: 'tons', name: 'Schwergewicht', what: 'Tonnen insgesamt bewegt (Wdh. × kg)', unit: 't', short: 'SG', steps: [1, 25, 250, 750, 2000, 5000, 10000],
    value: (i) => i.gymLogs.reduce((s, l) => s + (l.volume || 0), 0) / 1000 },
  { id: 'streak', name: 'Dranbleiber', what: 'längste Streak in Tagen', unit: 'Tage', short: 'DB', steps: [7, 30, 100, 180, 365, 730, 1000], value: (i) => i.streak.longest },
  { id: 'days', name: 'Stammgast', what: 'Tage mit Training', unit: 'Tage', short: 'ST', steps: [10, 60, 250, 500, 1000, 2000, 3000], value: days },
  { id: 'early', name: 'Frühaufsteher', what: 'Trainings vor 7 Uhr morgens', unit: 'mal', short: 'FA', steps: [1, 10, 40, 100, 250, 500, 1000],
    value: (i) => [...i.workouts, ...i.gymLogs].filter((x) => new Date(x.start).getHours() < 7).length },
  { id: 'records', name: 'Rekordjäger', what: 'neue Rekorde aufgestellt', unit: 'mal', short: 'RJ', steps: [5, 25, 100, 250, 500, 1000, 2500],
    value: (i) => i.workouts.filter((w) => w.isRecord).length + i.gymLogs.filter((l) => l.isRecord).length },
  { id: 'level', name: 'Aufsteiger', what: 'erreichtes Level', unit: 'Level', short: 'AS', steps: [10, 25, 50, 75, 100, 150, 200], value: (i) => levelFromXp(i.xp).level },
  { id: 'friends', name: 'Teamplayer', what: 'Freunde in der Rangliste', unit: 'Freunde', short: 'TP', steps: [1, 5, 15, 25, 40, 60, 100], value: (i) => i.friends },
];

export interface BadgeState {
  def: BadgeDef;
  value: number;
  tier: Tier;
  /** Nächstes Ziel (bei Shadow das Shadow-Ziel) */
  target: number;
  /** Fortschritt zum nächsten Ziel, 0–1 (bei Shadow 1) */
  progress: number;
}

export function tierOf(value: number, steps: readonly number[]): Tier {
  let t = 0;
  while (t < steps.length && t < MAX_TIER && value >= steps[t]) t++;
  return t as Tier;
}

export function badgeStates(i: BadgeInput): BadgeState[] {
  return BADGES.map((def) => {
    const value = def.value(i);
    const tier = tierOf(value, def.steps);
    const target = def.steps[Math.min(MAX_TIER - 1, tier)];
    const from = tier === 0 ? 0 : def.steps[tier - 1];
    const progress = tier === MAX_TIER ? 1 : Math.max(0, Math.min(1, (value - from) / (target - from)));
    return { def, value, tier, target, progress };
  });
}

/** Belohnte Stufen je Abzeichen */
export type Claimed = Record<string, Tier>;

/** Neue Stufen seit der letzten Belohnung und die Gems dafür */
export function newTiers(states: BadgeState[], claimed: Claimed): { badges: BadgeState[]; gems: number } {
  const badges = states.filter((s) => s.tier > (claimed[s.def.id] ?? 0));
  const gems = badges.reduce((sum, s) => {
    let g = 0;
    for (let t = (claimed[s.def.id] ?? 0) + 1; t <= s.tier; t++) g += TIER_GEMS[t];
    return sum + g;
  }, 0);
  return { badges, gems };
}

export function fmtBadgeValue(v: number, unit: string): string {
  const d = unit === 't' || unit === 'km' ? 1 : 0;
  return (Math.floor(v * 10 ** d) / 10 ** d).toLocaleString('de-DE', { maximumFractionDigits: d });
}

// ---------- Speichern und Belohnen ----------


/**
 * Prüft alle Abzeichen, schreibt Gems für neue Stufen gut und merkt sich die neuen Stufen
 * für die Anzeige (kv 'badgeNotice'). Wird nach jedem Laden aufgerufen; tut nichts, wenn sich nichts ändert.
 */
export async function syncBadges(): Promise<void> {
  await db.transaction('rw', db.workouts, db.gymLogs, db.kv, db.friends, async () => {
    const [workouts, gymLogs, streak, wallet, friends, claimed, notice] = await Promise.all([
      db.workouts.toArray(), db.gymLogs.toArray(),
      getKV<StreakState>('streak', { current: 0, longest: 0, lastActiveDay: null, locks: 0 }),
      getKV<Wallet | null>('wallet', null), db.friends.count(),
      getKV<Claimed>('badges', {}), getKV<string[]>('badgeNotice', []),
    ]);
    if (!wallet) return;
    const states = badgeStates({ workouts, gymLogs, streak, xp: wallet.xp, friends });
    const { badges, gems } = newTiers(states, claimed);
    if (!badges.length) return;
    const next: Claimed = { ...claimed };
    for (const b of badges) next[b.def.id] = b.tier;
    await setKV('badges', next);
    await setKV('wallet', { ...wallet, gems: wallet.gems + gems });
    await setKV('badgeNotice', [...new Set([...notice, ...badges.map((b) => b.def.id)])]);
  });
}
