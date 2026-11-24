import { addDays, daysBetween } from './date';
import { entryFor, planActive, type WeekPlan } from './weekPlan';

export interface StreakState {
  current: number;
  longest: number;
  lastActiveDay: string | null;
  locks: number;
  /** Tag, der zuletzt als kostenloser Ruhetag galt (höchstens einer alle 7 Tage) */
  restDay?: string | null;
  /** Wochenplan (feste Trainingstage). Fehlt oder aus = "jeden Tag" trainieren. */
  plan?: WeekPlan | null;
  /** Tag, der zuletzt durch einen geplanten Ruhetag gezählt wurde (nicht durch Training) */
  restCounted?: string | null;
}

/** Ein verpasster Tag pro Woche ist ein kostenloser Ruhetag und reißt die Streak nicht. */
export const REST_DAY_EVERY = 7;

export const MAX_LOCKS = 2;
export const LOCK_PRICE_GEMS = 30;
export const STREAK_MIN_POINTS = 30;
export const MILESTONES: Record<number, number> = { 7: 10, 30: 30, 100: 100, 365: 365 };

export const emptyStreak = (): StreakState => ({ current: 0, longest: 0, lastActiveDay: null, locks: 0 });

export interface CheckResult {
  state: StreakState;
  usedLocks: number;
  /** Kostenloser Ruhetag wurde verbraucht */
  usedRest: boolean;
  broken: boolean;
  lostStreak: number;
  /** Wochenplan: so viele Ruhetage wurden neu gezählt */
  restDays?: number;
  /** Wochenplan: Meilenstein-Gems, die durch gezählte Ruhetage erreicht wurden */
  milestoneGems?: number;
}

/**
 * Wochenplan: Jeder Ruhetag zählt +1 (heute schon am Morgen), ein geplanter Trainingstag ohne Training
 * kostet einen Streak-Schutz, sonst reißt die Streak. Heute als Trainingstag bleibt offen bis Mitternacht.
 */
function checkPlan(s: StreakState, plan: WeekPlan, today: string): CheckResult {
  const none: CheckResult = { state: s, usedLocks: 0, usedRest: false, broken: false, lostStreak: 0, restDays: 0, milestoneGems: 0 };
  if (!s.lastActiveDay || s.current === 0 || s.lastActiveDay >= today) return none;
  let st: StreakState = { ...s };
  let usedLocks = 0, restDays = 0, milestoneGems = 0;
  for (let d = addDays(s.lastActiveDay, 1); d <= today; d = addDays(d, 1)) {
    if (entryFor(plan, d) === null) {
      const current = st.current + 1;
      st = { ...st, current, longest: Math.max(st.longest, current), lastActiveDay: d, restCounted: d };
      restDays++;
      milestoneGems += MILESTONES[current] ?? 0;
    } else if (d === today) {
      break; // heutiger Trainingstag: noch Zeit bis Mitternacht
    } else if (st.locks > 0) {
      st = { ...st, locks: st.locks - 1, lastActiveDay: d };
      usedLocks++;
    } else {
      return { state: { ...s, current: 0 }, usedLocks: 0, usedRest: false, broken: true, lostStreak: s.current, restDays: 0, milestoneGems: 0 };
    }
  }
  return { state: st, usedLocks, usedRest: false, broken: false, lostStreak: 0, restDays, milestoneGems };
}

/**
 * Beim App-Start (und vor jedem Training): verpasste Tage seit dem letzten aktiven Tag
 * zählen. Jeder verpasste Tag kostet einen Lock. Reichen die Locks nicht, reißt die Streak
 * (die Locks bleiben dann erhalten).
 */
export function checkStreak(s: StreakState, today: string): CheckResult {
  if (planActive(s.plan)) return checkPlan(s, s.plan, today);
  if (!s.lastActiveDay || s.current === 0) return { state: s, usedLocks: 0, usedRest: false, broken: false, lostStreak: 0 };
  const gap = daysBetween(s.lastActiveDay, today);
  let missed = gap - 1;
  if (missed <= 0) return { state: s, usedLocks: 0, usedRest: false, broken: false, lostStreak: 0 };
  // Erster verpasster Tag: kostenloser Ruhetag, wenn der letzte mindestens 7 Tage her ist
  const firstMissed = addDays(s.lastActiveDay, 1);
  const restFree = !s.restDay || daysBetween(s.restDay, firstMissed) >= REST_DAY_EVERY;
  if (restFree) missed -= 1;
  if (s.locks >= missed) {
    return {
      state: { ...s, locks: s.locks - missed, lastActiveDay: addDays(today, -1), restDay: restFree ? firstMissed : s.restDay },
      usedLocks: missed,
      usedRest: restFree,
      broken: false,
      lostStreak: 0,
    };
  }
  return { state: { ...s, current: 0 }, usedLocks: 0, usedRest: false, broken: true, lostStreak: s.current };
}

export interface ActiveResult {
  state: StreakState;
  increased: boolean;
  milestoneGems: number;
}

/** Ein Training mit ≥ 30 Punkten wurde heute abgeschlossen. */
export function registerActiveDay(s0: StreakState, today: string): ActiveResult {
  const s = checkStreak(s0, today).state;
  // Schon gezählt (Training oder Ruhetag): bleibt gleich. Training an einem Ruhetag sichert den Tag zusätzlich ab.
  if (s.lastActiveDay === today) return { state: s.restCounted === today ? { ...s, restCounted: null } : s, increased: false, milestoneGems: 0 };
  const current = s.current + 1;
  return {
    state: { ...s, current, longest: Math.max(s.longest, current), lastActiveDay: today },
    increased: true,
    milestoneGems: MILESTONES[current] ?? 0,
  };
}

/**
 * Wochenplan ein-/ausschalten, ändern oder einen Tag verschieben, ohne die Streak zu verlieren.
 * Vorher wird mit den alten Regeln geprüft. Wurde heute nur als Ruhetag gezählt und ist heute nach der
 * Änderung ein Trainingstag, wird der Tag wieder offen (sonst könnte man sich so einen Tag sparen).
 */
export function applyPlan(s0: StreakState, plan: WeekPlan | null, today: string): StreakState {
  const s = checkStreak(s0, today).state;
  let next: StreakState = { ...s, plan };
  const restToday = s.restCounted === today && s.lastActiveDay === today;
  const trainNow = !planActive(plan) || entryFor(plan, today) !== null;
  if (restToday && trainNow) {
    const current = s.current - 1;
    next = {
      ...next,
      current,
      longest: s.longest === s.current ? current : s.longest,
      lastActiveDay: current > 0 ? addDays(today, -1) : null,
      restCounted: null,
    };
  }
  return checkStreak(next, today).state;
}

export function buyLock(s: StreakState, gems: number): { state: StreakState; gems: number } | null {
  if (s.locks >= MAX_LOCKS || gems < LOCK_PRICE_GEMS) return null;
  return { state: { ...s, locks: s.locks + 1 }, gems: gems - LOCK_PRICE_GEMS };
}

/** Farbe der Flamme je nach Länge: orange → blau → violett → weiß-gold */
export function flameTier(days: number): { core: string; outer: string; name: string } {
  if (days >= 100) return { core: '#fff8d6', outer: '#ffd34d', name: 'Weißgold' };
  if (days >= 30) return { core: '#e6c8ff', outer: '#9C86F0', name: 'Violett' };
  if (days >= 7) return { core: '#c8e6ff', outer: '#8FA3B8', name: 'Blau' };
  return { core: '#ffd9a0', outer: '#F5A524', name: 'Orange' };
}
