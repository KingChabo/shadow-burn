import { ACT, type Activity, type ActivityId } from '../data/activities';
import type { GymExercise } from '../data/gym';
import { getKV, setKV, type GymSet } from './db';
import { cleanSets, fmtKg, MAX_REPS } from './gym';

// Gespeicherte Workouts („Vorlagen“): eine Liste von Übungen mit geplanten Sätzen.
// Liegen in der kv-Tabelle (Schlüssel 'plans'), sind damit automatisch im Backup enthalten
// und brauchen kein Datenbank-Update. Punkte gibt es weiter nur über finishGym/finishWorkout,
// also mit allen bisherigen Grenzen (Tageslimit, Rekord-Schutz, Plausibilität).

/** Geräteübung: Sätze mit Wiederholungen und kg */
export interface GymItem { id: string; kind: 'gym'; exerciseId: string; name: string; sets: GymSet[] }
/** Übung ohne Gerät: pro Satz ein Ziel (Wiederholungen, Sekunden oder km je nach Übung) */
export interface BodyItem { id: string; kind: 'body'; activityId: ActivityId; targets: number[] }
export type PlanItem = GymItem | BodyItem;

export interface Plan {
  id: string;
  name: string;
  items: PlanItem[];
  createdAt: number;
  updatedAt: number;
  /** Zuletzt komplett oder teilweise gemacht */
  lastDone?: number;
  timesDone?: number;
}

export const MAX_ITEMS = 30;
export const MAX_SETS = 12;
export const MAX_NAME = 40;
const KEY = 'plans';
const RUN_KEY = 'planRun';

export const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

/** Obergrenze für ein Ziel ohne Gerät: Wdh. wie beim Gerät, Zeit max. 3 h, Strecke max. 100 km */
export function maxTarget(a: Activity): number {
  return a.unit === 'reps' ? MAX_REPS : a.unit === 'time' ? 3 * 3600 : 100;
}

/** Vernünftiger Startwert für ein neues Ziel */
export function defaultTarget(a: Activity): number {
  return a.unit === 'reps' ? 10 : a.unit === 'time' ? (a.perMin ? 30 * 60 : 60) : 5;
}

/** Werte begrenzen, leere/kaputte Einträge entfernen */
export function cleanItem(it: PlanItem): PlanItem | null {
  if (it.kind === 'gym') {
    const sets = cleanSets(it.sets).slice(0, MAX_SETS);
    if (!it.exerciseId) return null;
    return { id: it.id || newId(), kind: 'gym', exerciseId: it.exerciseId, name: (it.name || '').trim().slice(0, MAX_NAME) || 'Übung', sets };
  }
  const a = ACT[it.activityId];
  if (!a) return null;
  const max = maxTarget(a);
  const step = a.unit === 'distance' ? 0.1 : 1;
  const targets = it.targets
    .map((t) => Math.min(max, Math.max(0, Math.round((Number(t) || 0) / step) * step)))
    .map((t) => Math.round(t * 10) / 10)
    .filter((t) => t > 0)
    .slice(0, MAX_SETS);
  return { id: it.id || newId(), kind: 'body', activityId: it.activityId, targets };
}

export function cleanPlan(p: Plan): Plan {
  return {
    ...p,
    name: p.name.trim().slice(0, MAX_NAME) || 'Mein Workout',
    items: p.items.map(cleanItem).filter((x): x is PlanItem => !!x && (x.kind === 'gym' ? x.sets.length > 0 : x.targets.length > 0)).slice(0, MAX_ITEMS),
  };
}

export async function getPlans(): Promise<Plan[]> {
  return getKV<Plan[]>(KEY, []);
}

/** Neu anlegen oder überschreiben (gleiche id) */
export async function savePlan(p: Plan, now = Date.now()): Promise<Plan> {
  const list = await getPlans();
  const clean = cleanPlan({ ...p, updatedAt: now, createdAt: p.createdAt || now });
  const i = list.findIndex((x) => x.id === clean.id);
  await setKV(KEY, i >= 0 ? list.map((x, j) => (j === i ? clean : x)) : [...list, clean]);
  return clean;
}

export async function deletePlan(id: string): Promise<void> {
  await setKV(KEY, (await getPlans()).filter((p) => p.id !== id));
}

export async function markPlanDone(id: string, now = Date.now()): Promise<void> {
  const list = await getPlans();
  await setKV(KEY, list.map((p) => (p.id === id ? { ...p, lastDone: now, timesDone: (p.timesDone ?? 0) + 1 } : p)));
}

export function emptyPlan(name = ''): Plan {
  return { id: newId(), name, items: [], createdAt: 0, updatedAt: 0 };
}

export function gymItem(ex: GymExercise, sets?: GymSet[]): GymItem {
  const s = sets && sets.length ? sets.map((x) => ({ reps: x.reps, kg: x.kg, ...(x.warmup ? { warmup: true } : {}) })) : [{ reps: 10, kg: 0 }, { reps: 10, kg: 0 }, { reps: 10, kg: 0 }];
  return { id: newId(), kind: 'gym', exerciseId: ex.id, name: ex.name, sets: s };
}

export function bodyItem(a: Activity, targets?: number[]): BodyItem {
  const t = defaultTarget(a);
  return { id: newId(), kind: 'body', activityId: a.id, targets: targets && targets.length ? targets : a.unit === 'reps' ? [t, t, t] : [t] };
}

// ---------- Texte ----------

export function itemName(it: PlanItem): string {
  return it.kind === 'gym' ? it.name : ACT[it.activityId]?.name ?? it.activityId;
}

/** "15 Wdh.", "1:30 min", "5 km" */
export function targetText(a: Activity, t: number): string {
  if (a.unit === 'reps') return `${t} Wdh.`;
  if (a.unit === 'distance') return `${t.toLocaleString('de-DE')} km`;
  if (t >= 60) {
    const m = Math.floor(t / 60), s = Math.round(t % 60);
    return s ? `${m}:${String(s).padStart(2, '0')} min` : `${m} min`;
  }
  return `${t} s`;
}

export function setText(s: GymSet): string {
  return `${s.reps} × ${s.kg ? fmtKg(s.kg) : 'ohne Gewicht'}`;
}

/** Kurzbeschreibung für Listen: "3 × 10 · 60 kg" */
export function itemSummary(it: PlanItem): string {
  if (it.kind === 'gym') {
    const work = it.sets.filter((s) => !s.warmup);
    const w = it.sets.length - work.length;
    const same = work.length > 0 && work.every((s) => s.reps === work[0].reps && s.kg === work[0].kg);
    const main = same
      ? `${work.length} × ${work[0].reps}${work[0].kg ? ` · ${fmtKg(work[0].kg)}` : ''}`
      : work.map((s) => `${s.reps}×${s.kg.toLocaleString('de-DE')}`).join(', ') + ' kg';
    return (w ? `${w} Aufw. + ` : '') + main;
  }
  const a = ACT[it.activityId];
  if (!a) return '';
  const same = it.targets.every((t) => t === it.targets[0]);
  if (same && it.targets.length > 1) return `${it.targets.length} × ${targetText(a, it.targets[0])}`;
  return it.targets.map((t) => targetText(a, t)).join(', ');
}

/** Was die Stimme vor einem Satz sagt */
export function speakSet(it: PlanItem, i: number): string {
  const total = it.kind === 'gym' ? it.sets.length : it.targets.length;
  const head = `${itemName(it)}. ${total > 1 ? `Satz ${i + 1} von ${total}. ` : ''}`;
  if (it.kind === 'gym') {
    const s = it.sets[i];
    if (!s) return itemName(it);
    const kg = s.kg ? ` mit ${s.kg.toLocaleString('de-DE')} Kilo` : '';
    return `${head}${s.warmup ? 'Aufwärmen, ' : ''}${s.reps} Wiederholungen${kg}`;
  }
  const a = ACT[it.activityId];
  const t = it.targets[i];
  if (!a || t === undefined) return itemName(it);
  if (a.unit === 'reps') return `${head}${t} Wiederholungen`;
  if (a.unit === 'distance') return `${head}${t.toLocaleString('de-DE')} Kilometer`;
  const m = Math.floor(t / 60), sec = Math.round(t % 60);
  const parts = [m ? `${m} ${m === 1 ? 'Minute' : 'Minuten'}` : '', sec ? `${sec} Sekunden` : ''].filter(Boolean);
  return `${head}${parts.join(' ')}`;
}

// ---------- Laufendes Workout ----------

/** Fortschritt pro Übung */
export interface ItemProgress {
  /** so viele Sätze sind abgehakt (der Reihe nach) */
  done: number;
  /** so viele davon sind schon gespeichert (Punkte vergeben) */
  saved: number;
  /** tatsächliche Ergebnisse ohne Gerät (Wdh./Sekunden/km) */
  results?: number[];
  points: number;
  skipped?: boolean;
}

export interface PlanRun {
  /** null = freies Training zum Mitschreiben */
  planId: string | null;
  name: string;
  items: PlanItem[];
  progress: Record<string, ItemProgress>;
  idx: number;
  startedAt: number;
  /** Modus pro Übung ohne Gerät (damit nach dem ersten Satz nicht wieder gefragt wird) */
  modes?: Partial<Record<ActivityId, string>>;
  /** Pause zwischen den Sätzen in Sekunden */
  rest?: number;
}

export function startRun(plan: Plan | null, now = Date.now()): PlanRun {
  const items = plan ? plan.items.map((x) => (x.kind === 'gym' ? { ...x, sets: x.sets.map((s) => ({ ...s })) } : { ...x, targets: [...x.targets] })) : [];
  return { planId: plan?.id ?? null, name: plan?.name ?? '', items, progress: {}, idx: 0, startedAt: now };
}

export const progressOf = (r: PlanRun, id: string): ItemProgress => r.progress[id] ?? { done: 0, saved: 0, points: 0 };
export const setCount = (it: PlanItem) => (it.kind === 'gym' ? it.sets.length : it.targets.length);
export const itemFinished = (r: PlanRun, it: PlanItem) => { const p = progressOf(r, it.id); return !!p.skipped || p.done >= setCount(it); };

/** Nächste nicht fertige Übung ab der aktuellen (sonst die erste offene, sonst -1) */
export function nextOpen(r: PlanRun, from = r.idx): number {
  for (let k = 0; k < r.items.length; k++) {
    const i = (from + k) % r.items.length;
    if (!itemFinished(r, r.items[i])) return i;
  }
  return -1;
}

export function runPoints(r: PlanRun): number {
  return Object.values(r.progress).reduce((s, p) => s + p.points, 0);
}

/** Wurde im laufenden Training etwas an Übungen/Sätzen geändert (gegenüber der Vorlage)? */
export function runChanged(r: PlanRun, plan: Plan | null): boolean {
  if (!plan) return r.items.length > 0;
  const strip = (items: PlanItem[]) => JSON.stringify(items.map((x) => cleanItem(x)));
  return strip(r.items) !== strip(plan.items);
}

/** Laufendes Training als Vorlage übernehmen (Werte so, wie sie zuletzt eingetragen waren) */
export function planFromRun(r: PlanRun, base: Plan | null, name?: string): Plan {
  const p = base ?? emptyPlan();
  return { ...p, name: name ?? (r.name || p.name), items: r.items.map((x) => ({ ...x })) };
}

export async function getRun(): Promise<PlanRun | null> {
  return getKV<PlanRun | null>(RUN_KEY, null);
}
export async function saveRun(r: PlanRun | null): Promise<void> {
  await setKV(RUN_KEY, r);
}
