import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ACT, ACTIVITIES, searchText, skipsCountdown, type Activity, type Mode } from '../data/activities';
import { GYM_ALIASES, GROUP_MUSCLES, type GymExercise } from '../data/gym';
import { type GymSet } from '../lib/db';
import { allExercises, finishGym, lastLogFor, MAX_KG, MAX_REPS } from '../lib/gym';
import { finishWorkout, type WorkoutInput } from '../lib/game';
import {
  bodyItem, cleanPlan, deletePlan, emptyPlan, getPlans, getRun, gymItem, itemFinished, itemName, itemSummary, markPlanDone, maxTarget,
  MAX_ITEMS, MAX_NAME, MAX_SETS, nextOpen, planFromRun, progressOf, runChanged, runPoints, saveRun, savePlan, setCount, speakSet, startRun, targetText,
  type ItemProgress, type Plan, type PlanItem, type PlanRun,
} from '../lib/plans';
import { useGame } from '../lib/store';
import { Btn, Card, Header, Segmented } from '../components/ui';
import { Icon } from '../components/Icon';
import { GuideThumb } from '../components/GuideVideo';
import { GymGuide } from '../components/GymGuide';
import { searchList } from '../lib/search';
import { buzz, say, sfx } from '../lib/fx';
import { useBack } from '../lib/back';
import { Setup } from './Setup';
import { Countdown } from './Countdown';
import { LiveRouter } from './live/LiveRouter';

type Stage =
  | { s: 'list' }
  | { s: 'edit'; plan: Plan }
  | { s: 'run' }
  | { s: 'setup'; a: Activity }
  | { s: 'countdown'; a: Activity; mode: Mode }
  | { s: 'live'; a: Activity; mode: Mode }
  | { s: 'end' };

/** Gespeicherte Workouts: Liste, Bearbeiten, geführtes Training */
export function Plans({ top, onFullscreen }: { top: ReactNode; onFullscreen: (b: boolean) => void }) {
  const g = useGame();
  const [plans, setPlans] = useState<Plan[] | null>(null);
  const [run, setRun] = useState<PlanRun | null>(null);
  const [stage, setStage] = useState<Stage>({ s: 'list' });
  const loaded = useRef(false);

  const load = async () => { setPlans(await getPlans()); };
  useEffect(() => {
    void load();
    void getRun().then((r) => { setRun(r); loaded.current = true; });
  }, []);
  // Laufendes Training sichern: App zu, Tab gewechselt, Akku leer – es geht später weiter
  useEffect(() => { if (loaded.current) void saveRun(run); }, [run]);

  const inRun = stage.s !== 'list' && stage.s !== 'edit';
  useEffect(() => { onFullscreen(inRun); }, [inRun, onFullscreen]);
  useEffect(() => () => onFullscreen(false), [onFullscreen]);

  const planOf = (r: PlanRun | null) => (r?.planId ? plans?.find((p) => p.id === r.planId) ?? null : null);

  const begin = (p: Plan | null) => {
    if (run && !window.confirm('Ein anderes Workout läuft noch. Verwerfen und neu starten? Gespeicherte Sätze behalten ihre Punkte.')) return;
    const r = startRun(p);
    setRun(r);
    setStage({ s: 'run' });
    if (r.items[0]) say(speakSet(r.items[0], 0));
  };

  // Ergebnis einer Übung ohne Gerät (aus dem normalen Live-Bildschirm) eintragen
  const bodyDone = async (w: WorkoutInput | null) => {
    if (!w || !run) { setStage({ s: 'run' }); return; }
    const it = run.items[run.idx];
    const sum = await finishWorkout(w);
    await g.reload();
    const result = w.km ?? (ACT[w.activityId].unit === 'reps' ? sum.workout.reps : sum.workout.seconds);
    setRun((r) => {
      if (!r || !it) return r;
      const p = progressOf(r, it.id);
      const results = [...(p.results ?? [])];
      results[p.done] = result;
      const np: ItemProgress = { ...p, done: p.done + 1, saved: p.saved + 1, results, points: p.points + sum.breakdown.total };
      // Beim Mitschreiben wird das Geschaffte zum Ziel fürs nächste Mal
      const items = r.planId === null && it.kind === 'body' && result > 0
        ? r.items.map((y) => (y.id === it.id && y.kind === 'body' ? { ...y, targets: y.targets.map((t, j) => (j === p.done ? result : t)) } : y))
        : r.items;
      return { ...r, items, progress: { ...r.progress, [it.id]: np } };
    });
    setToast(`+${sum.breakdown.total} Punkte${sum.isRecord ? ' · Neuer Rekord!' : ''}`);
    setStage({ s: 'run' });
  };
  const [toast, setToast] = useState<string | null>(null);
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(null), 2600); return () => clearTimeout(t); }, [toast]);

  if (plans === null) return <div>{top}</div>;

  const toastEl = (
    <AnimatePresence>
      {toast && (
        <motion.div initial={{ y: -40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: -40, opacity: 0 }}
          className="fixed inset-x-0 top-[max(env(safe-area-inset-top),12px)] z-50 mx-auto w-fit rounded-full bg-hot px-5 py-2 font-semibold shadow-float">
          {toast}
        </motion.div>
      )}
    </AnimatePresence>
  );

  switch (stage.s) {
    case 'list':
      return (
        <PlanList top={top} plans={plans} run={run}
          onStart={begin} onRecord={() => begin(null)} onResume={() => setStage({ s: 'run' })}
          onEdit={(p) => setStage({ s: 'edit', plan: p })} onNew={() => setStage({ s: 'edit', plan: emptyPlan() })} />
      );
    case 'edit':
      return (
        <PlanEditor plan={stage.plan} onBack={() => setStage({ s: 'list' })}
          onSave={async (p) => { await savePlan(p); await load(); setStage({ s: 'list' }); }}
          onDelete={async (id) => { await deletePlan(id); await load(); setStage({ s: 'list' }); }} />
      );
    case 'run':
      if (!run) { setStage({ s: 'list' }); return null; }
      return (
        <>
          {toastEl}
          <Runner run={run} setRun={setRun} onToast={setToast}
            onPause={() => setStage({ s: 'list' })}
            onEnd={() => setStage({ s: 'end' })}
            onBody={(a) => {
              const m = run.modes?.[a.id] as Mode | undefined;
              if (m && a.modes.includes(m)) setStage(skipsCountdown(m) ? { s: 'live', a, mode: m } : { s: 'countdown', a, mode: m });
              else setStage({ s: 'setup', a });
            }} />
        </>
      );
    case 'setup':
      return (
        <Setup activity={stage.a} onBack={() => setStage({ s: 'run' })}
          onStart={(mode) => {
            void g.setPrefs({ ...g.prefs, lastMode: { ...g.prefs.lastMode, [stage.a.id]: mode } });
            setRun((r) => (r ? { ...r, modes: { ...r.modes, [stage.a.id]: mode } } : r));
            setStage(skipsCountdown(mode) ? { s: 'live', a: stage.a, mode } : { s: 'countdown', a: stage.a, mode });
          }} />
      );
    case 'countdown':
      return <Countdown onDone={() => setStage({ s: 'live', a: stage.a, mode: stage.mode })} preloadCamera={stage.mode === 'camera'} />;
    case 'live':
      return <LiveRouter activity={stage.a} mode={stage.mode} onFinish={(w) => void bodyDone(w)} onManual={() => setStage({ s: 'live', a: stage.a, mode: 'manual' })} />;
    case 'end':
      if (!run) { setStage({ s: 'list' }); return null; }
      return (
        <RunEnd run={run} plan={planOf(run)}
          onBack={() => setStage({ s: 'run' })}
          onClose={async (save) => {
            if (save) await savePlan(save);
            const pid = save?.id ?? run.planId;
            if (pid && Object.values(run.progress).some((p) => p.saved > 0)) await markPlanDone(pid);
            setRun(null);
            await saveRun(null);
            await load();
            setStage({ s: 'list' });
          }} />
      );
  }
}

// ---------- Liste ----------

function PlanList({ top, plans, run, onStart, onRecord, onResume, onEdit, onNew }: {
  top: ReactNode; plans: Plan[]; run: PlanRun | null;
  onStart: (p: Plan) => void; onRecord: () => void; onResume: () => void; onEdit: (p: Plan) => void; onNew: () => void;
}) {
  const sorted = [...plans].sort((a, b) => (b.lastDone ?? b.updatedAt) - (a.lastDone ?? a.updatedAt));
  return (
    <div className="pb-6">
      {top}
      <div className="space-y-3 px-4">
        {run && (
          <button onClick={onResume} className="flex w-full items-center gap-3 rounded-3xl bg-hot p-4 text-left">
            <Icon name="timer" className="h-7 w-7 shrink-0" />
            <span className="min-w-0 flex-1">
              <b className="block truncate">{run.name || 'Freies Training'} läuft</b>
              <span className="text-sm opacity-90">Weitermachen · {runPoints(run)} P bisher</span>
            </span>
          </button>
        )}
        {sorted.map((p) => (
          <Card key={p.id} className="!p-0 overflow-hidden">
            <button onClick={() => onEdit(p)} className="block w-full px-4 pt-4 text-left">
              <div className="flex items-baseline gap-2">
                <b className="min-w-0 flex-1 truncate text-lg">{p.name}</b>
                <span className="text-xs text-mute">{p.items.length} {p.items.length === 1 ? 'Übung' : 'Übungen'}</span>
              </div>
              <p className="mt-1 line-clamp-2 text-sm text-mute">{p.items.map(itemName).join(' · ') || 'Noch keine Übungen'}</p>
              {p.lastDone && <p className="mt-1 text-xs text-mute">Zuletzt {new Date(p.lastDone).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' })}{p.timesDone ? ` · ${p.timesDone}× gemacht` : ''}</p>}
            </button>
            <div className="flex gap-2 p-3">
              <Btn kind="ghost" className="flex-1 !py-3 !text-[15px]" onClick={() => onEdit(p)}>Bearbeiten</Btn>
              <Btn className="flex-1 !py-3 !text-[15px]" disabled={!p.items.length} onClick={() => onStart(p)}>Starten</Btn>
            </div>
          </Card>
        ))}
        {plans.length === 0 && !run && (
          <Card className="text-center text-sm text-mute">
            Speichere dein Training einmal, dann startest du es mit einem Tipp. Die App sagt dir jede Übung mit Gewicht und Wiederholungen an.
          </Card>
        )}
        <div className="grid grid-cols-2 gap-3">
          <Btn kind="ghost" className="!py-3 !text-[15px]" onClick={onNew}>+ Neues Workout</Btn>
          <Btn kind="ghost" className="!py-3 !text-[15px]" onClick={onRecord}>Beim Training mitschreiben</Btn>
        </div>
      </div>
    </div>
  );
}

// ---------- Zahlenfeld ----------

/** Zahlenfeld mit eigenem Text (damit "62," beim Tippen nicht verschwindet) */
function NumInput({ value, onChange, decimals, max, placeholder, className = '', label }: {
  value: number; onChange: (n: number) => void; decimals?: boolean; max: number; placeholder?: string; className?: string; label: string;
}) {
  const fmt = (n: number) => (n ? String(n).replace('.', ',') : '');
  const [text, setText] = useState(fmt(value));
  const focused = useRef(false);
  useEffect(() => { if (!focused.current) setText(fmt(value)); }, [value]);
  return (
    <input aria-label={label} inputMode={decimals ? 'decimal' : 'numeric'} value={text} placeholder={placeholder}
      onFocus={() => { focused.current = true; }}
      onBlur={() => { focused.current = false; setText(fmt(value)); }}
      onChange={(e) => {
        let t = e.target.value.replace('.', ',').replace(decimals ? /[^0-9,]/g : /\D/g, '');
        const i = t.indexOf(',');
        if (i >= 0) t = t.slice(0, i + 1) + t.slice(i + 1).replace(/,/g, '').slice(0, 2);
        setText(t.slice(0, 7));
        const n = Number(t.replace(',', '.')) || 0;
        onChange(Math.min(max, n));
      }}
      className={`num w-full rounded-xl bg-raised px-2 py-2.5 text-center text-lg outline-none ring-1 ring-transparent placeholder:text-mute focus:ring-neon/60 ${className}`} />
  );
}

/** Zeit-Ziel als Minuten + Sekunden */
function TimeInput({ value, onChange, max }: { value: number; onChange: (n: number) => void; max: number }) {
  const m = Math.floor(value / 60), s = Math.round(value % 60);
  return (
    <div className="flex items-center gap-1">
      <NumInput label="Minuten" value={m} max={Math.floor(max / 60)} placeholder="0" onChange={(x) => onChange(Math.min(max, x * 60 + s))} />
      <span className="text-mute">:</span>
      <NumInput label="Sekunden" value={s} max={59} placeholder="00" onChange={(x) => onChange(Math.min(max, m * 60 + x))} />
    </div>
  );
}

// ---------- Sätze einer Übung bearbeiten ----------

/** done: so viele Sätze sind schon gemacht (nur im laufenden Training), locked: davon gespeichert */
function SetsEditor({ item, onChange, done = 0, locked = 0, current = -1, results }: {
  item: PlanItem; onChange: (it: PlanItem) => void; done?: number; locked?: number; current?: number; results?: number[];
}) {
  const n = setCount(item);
  const rowCls = (i: number) => `grid items-center gap-2 rounded-xl px-1 py-1 ${i === current ? 'bg-raised/70 ring-1 ring-line' : ''} ${i < done ? 'opacity-60' : ''}`;
  const numBtn = (i: number, extra?: ReactNode) => (
    <span className={`num grid h-10 place-items-center rounded-lg font-display text-lg ${i < done ? 'text-good' : 'text-mute'}`}>
      {i < done ? <Icon name="check" className="h-5 w-5" strokeWidth={2.5} /> : extra ?? i + 1}
    </span>
  );
  const removeBtn = (i: number) => (
    <button aria-label="Satz löschen" disabled={n === 1 || i < locked} onClick={() => onChange(removeSet(item, i))}
      className="grid h-10 w-10 place-items-center rounded-full text-mute disabled:opacity-20 active:bg-raised">
      <Icon name="x" className="h-4 w-4" />
    </button>
  );

  if (item.kind === 'gym') {
    const upd = (i: number, patch: Partial<GymSet>) => onChange({ ...item, sets: item.sets.map((s, j) => (j === i ? { ...s, ...patch } : s)) });
    return (
      <div className="space-y-1.5">
        <div className="grid grid-cols-[2.25rem_1fr_1fr_2.5rem] gap-2 px-1 text-xs text-mute"><span>Satz</span><span>Wdh.</span><span>kg</span><span /></div>
        {item.sets.map((s, i) => (
          <div key={i} className={`${rowCls(i)} grid-cols-[2.25rem_1fr_1fr_2.5rem]`}>
            {i < done ? numBtn(i) : (
              <button onClick={() => upd(i, { warmup: !s.warmup })} aria-label={s.warmup ? 'Aufwärmsatz, antippen für Arbeitssatz' : 'Antippen für Aufwärmsatz'}
                className={`num grid h-10 place-items-center rounded-lg font-display text-lg ${s.warmup ? 'bg-volt/20 text-volt' : 'text-mute'}`}>{s.warmup ? 'A' : i + 1}</button>
            )}
            <NumInput label={`Satz ${i + 1} Wiederholungen`} value={s.reps} max={MAX_REPS} placeholder="10" onChange={(v) => upd(i, { reps: v })} className={i < locked ? 'pointer-events-none' : ''} />
            <NumInput label={`Satz ${i + 1} kg`} decimals value={s.kg} max={MAX_KG} placeholder="0" onChange={(v) => upd(i, { kg: v })} className={i < locked ? 'pointer-events-none' : ''} />
            {removeBtn(i)}
          </div>
        ))}
        {n < MAX_SETS && (
          <button onClick={() => onChange(addSet(item))} className="w-full rounded-xl border border-dashed border-line py-2 text-sm text-mute">+ Satz</button>
        )}
        {current < 0 && <p className="px-1 text-xs text-mute">Nummer antippen = Aufwärmsatz (A)</p>}
      </div>
    );
  }
  const a = ACT[item.activityId];
  const max = maxTarget(a);
  const unit = a.unit === 'reps' ? 'Wdh.' : a.unit === 'time' ? 'Zeit (min:s)' : 'km';
  const upd = (i: number, v: number) => onChange({ ...item, targets: item.targets.map((t, j) => (j === i ? v : t)) });
  return (
    <div className="space-y-1.5">
      <div className="grid grid-cols-[2.25rem_1fr_2.5rem] gap-2 px-1 text-xs text-mute"><span>Satz</span><span>Ziel {unit}</span><span /></div>
      {item.targets.map((t, i) => (
        <div key={i} className={`${rowCls(i)} grid-cols-[2.25rem_1fr_2.5rem]`}>
          {numBtn(i)}
          <div className="flex items-center gap-2">
            <div className={`flex-1 ${i < locked ? 'pointer-events-none' : ''}`}>
              {a.unit === 'time'
                ? <TimeInput value={t} max={max} onChange={(v) => upd(i, v)} />
                : <NumInput label={`Satz ${i + 1} Ziel`} decimals={a.unit === 'distance'} value={t} max={max} placeholder="10" onChange={(v) => upd(i, v)} />}
            </div>
            {results?.[i] !== undefined && <span className="shrink-0 text-xs text-good">geschafft: {targetText(a, results[i])}</span>}
          </div>
          {removeBtn(i)}
        </div>
      ))}
      {n < MAX_SETS && (
        <button onClick={() => onChange(addSet(item))} className="w-full rounded-xl border border-dashed border-line py-2 text-sm text-mute">+ Satz</button>
      )}
    </div>
  );
}

function addSet(it: PlanItem): PlanItem {
  if (it.kind === 'gym') {
    const last = it.sets[it.sets.length - 1] ?? { reps: 10, kg: 0 };
    return { ...it, sets: [...it.sets, { reps: last.reps, kg: last.kg }] };
  }
  const a = ACT[it.activityId];
  return { ...it, targets: [...it.targets, it.targets[it.targets.length - 1] ?? (a.unit === 'reps' ? 10 : 60)] };
}
function removeSet(it: PlanItem, i: number): PlanItem {
  return it.kind === 'gym' ? { ...it, sets: it.sets.filter((_, j) => j !== i) } : { ...it, targets: it.targets.filter((_, j) => j !== i) };
}

// ---------- Übung auswählen ----------

function Picker({ onPick, onClose }: { onPick: (it: PlanItem) => void; onClose: () => void }) {
  const [kind, setKind] = useState<'gym' | 'body'>('gym');
  const [q, setQ] = useState('');
  const [gym, setGym] = useState<GymExercise[]>([]);
  useEffect(() => { void allExercises().then(setGym); }, []);
  useBack(true, onClose);

  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (kind === 'gym') return s ? searchList(gym, s, (e) => `${e.name} ${e.equipment} ${GYM_ALIASES[e.id] ?? ''}`, (e) => e.muscles) : gym.slice(0, 80);
    return s ? searchList(ACTIVITIES, s, searchText, (a) => a.muscles) : ACTIVITIES;
  }, [kind, q, gym]);

  const pickGym = async (e: GymExercise) => {
    // Werte vom letzten Mal vorschlagen
    const last = await lastLogFor(e.id);
    onPick(gymItem(e, last?.sets));
  };

  return (
    <motion.div initial={{ y: '100%' }} animate={{ y: 0 }} transition={{ type: 'spring', damping: 30, stiffness: 300 }}
      className="fixed inset-0 z-50 flex flex-col bg-bg">
      <Header title="Übung hinzufügen" onBack={onClose} />
      <div className="space-y-3 px-4">
        <Segmented value={kind} onChange={setKind} options={[{ id: 'gym', label: 'Geräte & Hanteln' }, { id: 'body', label: 'Ohne Gerät' }]} />
        <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Übung oder Muskel suchen"
          className="w-full rounded-full bg-panel px-5 py-3 text-ink shadow-card outline-none ring-1 ring-transparent placeholder:text-mute focus:ring-neon/60" />
      </div>
      <div className="mt-3 flex-1 overflow-y-auto px-4 pb-8">
        <div className="divide-y divide-line overflow-hidden rounded-2xl bg-panel">
          {kind === 'gym'
            ? (list as GymExercise[]).map((e) => (
              <button key={e.id} onClick={() => void pickGym(e)} className="block w-full px-4 py-3 text-left active:bg-raised">
                <div className="font-semibold">{e.name}</div>
                <div className="text-xs text-mute">{e.custom ? 'Eigene Übung' : e.equipment}</div>
              </button>
            ))
            : (list as Activity[]).map((a) => (
              <button key={a.id} onClick={() => onPick(bodyItem(a))} className="flex w-full items-center gap-3 px-4 py-2.5 text-left active:bg-raised">
                <GuideThumb activity={a} className="h-10 w-12 shrink-0 rounded-lg" />
                <span className="font-semibold">{a.name}</span>
              </button>
            ))}
          {list.length === 0 && <p className="px-4 py-6 text-center text-sm text-mute">Nichts gefunden.</p>}
        </div>
      </div>
    </motion.div>
  );
}

// ---------- Workout bearbeiten ----------

function PlanEditor({ plan, onBack, onSave, onDelete }: { plan: Plan; onBack: () => void; onSave: (p: Plan) => void; onDelete: (id: string) => void }) {
  const [p, setP] = useState<Plan>(plan);
  const [open, setOpen] = useState<string | null>(plan.items.length ? null : '');
  const [picking, setPicking] = useState(false);
  const isNew = !plan.createdAt;
  const changed = JSON.stringify(p) !== JSON.stringify(plan);
  const back = () => { if (!changed || window.confirm('Änderungen verwerfen?')) onBack(); };
  const valid = cleanPlan(p).items.length > 0;

  const setItem = (id: string, it: PlanItem) => setP((x) => ({ ...x, items: x.items.map((y) => (y.id === id ? it : y)) }));
  const move = (i: number, d: number) => setP((x) => {
    const items = [...x.items];
    const j = i + d;
    if (j < 0 || j >= items.length) return x;
    [items[i], items[j]] = [items[j], items[i]];
    return { ...x, items };
  });

  return (
    <div className="pb-8">
      <Header title={isNew ? 'Neues Workout' : 'Workout bearbeiten'} onBack={back} />
      <div className="space-y-3 px-4">
        <input value={p.name} onChange={(e) => setP({ ...p, name: e.target.value.slice(0, MAX_NAME) })} placeholder="Name, z. B. Push-Tag"
          className="w-full rounded-2xl bg-panel px-4 py-3 text-lg font-semibold outline-none ring-1 ring-transparent placeholder:font-normal placeholder:text-mute focus:ring-neon/60" />
        {p.items.map((it, i) => (
          <ItemCard key={it.id} item={it} index={i} count={p.items.length} open={open === it.id}
            onToggle={() => setOpen(open === it.id ? null : it.id)}
            onChange={(x) => setItem(it.id, x)}
            onMove={(d) => move(i, d)}
            onRemove={() => setP((x) => ({ ...x, items: x.items.filter((y) => y.id !== it.id) }))} />
        ))}
        {p.items.length < MAX_ITEMS && (
          <button onClick={() => setPicking(true)} className="w-full rounded-2xl border border-dashed border-line py-3 text-sm text-mute">+ Übung hinzufügen</button>
        )}
        {!isNew && (
          <button onClick={() => { if (window.confirm(`„${plan.name}“ löschen? Deine Trainings und Punkte bleiben.`)) onDelete(plan.id); }}
            className="w-full py-3 text-sm text-bad">Workout löschen</button>
        )}
        <Btn className="sticky bottom-3 z-10 w-full" disabled={!valid} onClick={() => onSave(p)}>Speichern</Btn>
      </div>
      <AnimatePresence>
        {picking && <Picker onClose={() => setPicking(false)} onPick={(it) => { setP((x) => ({ ...x, items: [...x.items, it] })); setOpen(it.id); setPicking(false); }} />}
      </AnimatePresence>
    </div>
  );
}

function ItemCard({ item, index, count, open, onToggle, onChange, onMove, onRemove }: {
  item: PlanItem; index: number; count: number; open: boolean;
  onToggle: () => void; onChange: (it: PlanItem) => void; onMove: (d: number) => void; onRemove: () => void;
}) {
  return (
    <Card className="!p-0">
      <button onClick={onToggle} className="flex w-full items-center gap-3 px-4 py-3 text-left">
        <span className="num w-5 text-center font-display text-lg text-mute">{index + 1}</span>
        <span className="min-w-0 flex-1">
          <b className="block truncate">{itemName(item)}</b>
          <span className="block truncate text-xs text-mute">{itemSummary(item) || 'Noch keine Sätze'}</span>
        </span>
        <Icon name="down" className={`h-4 w-4 text-mute transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="space-y-3 border-t border-line px-3 pb-3 pt-3">
          <SetsEditor item={item} onChange={onChange} />
          <div className="flex gap-2">
            <button aria-label="Nach oben" disabled={index === 0} onClick={() => onMove(-1)} className="grid h-10 w-10 place-items-center rounded-full bg-raised disabled:opacity-30"><Icon name="down" className="h-4 w-4 rotate-180" /></button>
            <button aria-label="Nach unten" disabled={index === count - 1} onClick={() => onMove(1)} className="grid h-10 w-10 place-items-center rounded-full bg-raised disabled:opacity-30"><Icon name="down" className="h-4 w-4" /></button>
            <button onClick={onRemove} className="ml-auto flex items-center gap-1.5 rounded-full px-3 text-sm text-bad"><Icon name="trash" className="h-4 w-4" />Entfernen</button>
          </div>
        </div>
      )}
    </Card>
  );
}

// ---------- Geführtes Training ----------

const REST_CHOICES = [60, 90, 120, 180];

function Runner({ run, setRun, onToast, onPause, onEnd, onBody }: {
  run: PlanRun; setRun: (f: (r: PlanRun | null) => PlanRun | null) => void; onToast: (t: string) => void;
  onPause: () => void; onEnd: () => void; onBody: (a: Activity) => void;
}) {
  const g = useGame();
  const [picking, setPicking] = useState(false);
  const [restEnd, setRestEnd] = useState<number | null>(null);
  const [now, setNow] = useState(Date.now());
  const [busy, setBusy] = useState(false);
  const [gymEx, setGymEx] = useState<GymExercise[]>([]);
  useEffect(() => { void allExercises().then(setGymEx); }, []);

  const it = run.items[run.idx] as PlanItem | undefined;
  const p = it ? progressOf(run, it.id) : null;
  const n = it ? setCount(it) : 0;
  const finished = it ? itemFinished(run, it) : false;
  const rest = run.rest ?? 90;
  const exercise = it?.kind === 'gym'
    ? gymEx.find((e) => e.id === it.exerciseId) ?? { id: it.exerciseId, name: it.name, group: 'brust', equipment: 'Maschine', muscles: GROUP_MUSCLES.brust, custom: true } as GymExercise
    : null;

  // Pausentimer: am Ende piepen, vibrieren und den nächsten Satz ansagen
  const nextSay = useRef('');
  nextSay.current = it && p && p.done < n ? speakSet(it, p.done) : '';
  useEffect(() => {
    if (restEnd === null) return;
    const id = setInterval(() => {
      const t = Date.now();
      setNow(t);
      if (t >= restEnd) {
        setRestEnd(null); sfx('go'); buzz([200, 100, 200]);
        if (nextSay.current) say(nextSay.current);
      }
    }, 250);
    return () => clearInterval(id);
  }, [restEnd]);
  const left = restEnd === null ? 0 : Math.max(0, Math.ceil((restEnd - now) / 1000));

  const update = (f: (r: PlanRun) => PlanRun) => setRun((r) => (r ? f(r) : r));
  const setProgress = (id: string, np: ItemProgress) => update((r) => ({ ...r, progress: { ...r.progress, [id]: np } }));
  const goTo = (i: number) => {
    setRestEnd(null);
    update((r) => ({ ...r, idx: i }));
    const x = run.items[i];
    if (x) { const pp = progressOf(run, x.id); if (pp.done < setCount(x)) say(speakSet(x, pp.done)); }
  };

  /** Abgehakte, noch nicht gespeicherte Gerätesätze speichern (Punkte wie im Geräte-Bereich) */
  const saveGym = async (item: PlanItem, prog: ItemProgress): Promise<ItemProgress> => {
    if (item.kind !== 'gym' || prog.done <= prog.saved) return prog;
    const sets = item.sets.slice(prog.saved, prog.done);
    const ex = gymEx.find((e) => e.id === item.exerciseId) ?? exercise!;
    try {
      const sum = await finishGym({ exercise: ex, sets, start: run.startedAt, end: Date.now() });
      await g.reload();
      onToast(`${item.name}: +${sum.breakdown.total} Punkte${sum.isRecord ? ' · Rekord!' : ''}`);
      return { ...prog, saved: prog.done, points: prog.points + sum.breakdown.total };
    } catch {
      // z. B. nur Aufwärmsätze: nichts zu speichern
      return { ...prog, saved: prog.done };
    }
  };

  const setDone = async () => {
    if (!it || !p || it.kind !== 'gym' || busy) return;
    const s = it.sets[p.done];
    if (!s || s.reps <= 0) return;
    sfx('rep'); buzz(40);
    let np: ItemProgress = { ...p, done: p.done + 1 };
    if (np.done >= n) {
      setBusy(true);
      np = await saveGym(it, np);
      setBusy(false);
      setProgress(it.id, np);
      // weiter zur nächsten offenen Übung
      const r2 = { ...run, progress: { ...run.progress, [it.id]: np } };
      const nx = nextOpen(r2, run.idx);
      if (nx >= 0) { update((r) => ({ ...r, idx: nx })); setRestEnd(Date.now() + rest * 1000); setNow(Date.now()); say(`Geschafft. Als Nächstes ${itemName(run.items[nx])}`); }
      else { say('Workout geschafft!'); sfx('success'); }
      return;
    }
    setProgress(it.id, np);
    setNow(Date.now());
    setRestEnd(Date.now() + rest * 1000);
    say(`Pause. Danach ${it.sets[np.done].reps} Wiederholungen${it.sets[np.done].kg ? ` mit ${it.sets[np.done].kg.toLocaleString('de-DE')} Kilo` : ''}`);
  };

  const skip = async () => {
    if (!it || !p) return;
    const np = await saveGym(it, { ...p, skipped: true });
    setProgress(it.id, np);
    const r2 = { ...run, progress: { ...run.progress, [it.id]: np } };
    const nx = nextOpen(r2, run.idx);
    if (nx >= 0) goTo(nx);
  };

  const allDone = run.items.length > 0 && nextOpen(run) < 0;
  const unsaved = run.items.some((x) => { const pp = progressOf(run, x.id); return pp.done > pp.saved; });
  const end = async () => {
    // Abgehakte Sätze nicht verlieren
    if (unsaved) {
      setBusy(true);
      for (const x of run.items) {
        const pp = progressOf(run, x.id);
        if (pp.done > pp.saved) setProgress(x.id, await saveGym(x, pp));
      }
      setBusy(false);
    }
    onEnd();
  };

  return (
    <div className="min-h-full pb-28">
      <Header title={run.name || 'Freies Training'} onBack={onPause}
        right={<span className="num rounded-full bg-panel px-3 py-1.5 text-sm font-semibold text-neon">{runPoints(run)} P</span>} />
      <div className="space-y-3 px-4">
        {/* Übersicht: alle Übungen, antippen zum Springen */}
        {run.items.length > 0 && (
          <div className="flex gap-2 overflow-x-auto no-scrollbar">
            {run.items.map((x, i) => {
              const pp = progressOf(run, x.id);
              const fin = itemFinished(run, x);
              return (
                <button key={x.id} onClick={() => goTo(i)}
                  className={`shrink-0 rounded-full px-3.5 py-2 text-sm ${i === run.idx ? 'bg-ink text-bg font-semibold' : fin ? 'bg-panel text-good' : 'bg-panel text-mute'}`}>
                  {fin && !pp.skipped ? '✓ ' : ''}{itemName(x)}{!fin && pp.done ? ` ${pp.done}/${setCount(x)}` : ''}
                </button>
              );
            })}
          </div>
        )}

        {!it && (
          <Card className="space-y-2 text-center">
            <p className="font-semibold">Schreib einfach mit</p>
            <p className="text-sm text-mute">Füge jede Übung hinzu, sobald du sie machst, und hake die Sätze ab. Am Ende speicherst du alles als Workout.</p>
          </Card>
        )}

        {it && p && (
          <Card className="space-y-3">
            <div className="flex items-start gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-xs text-mute">Übung {run.idx + 1} von {run.items.length}</p>
                <h2 className="font-sport text-2xl leading-tight">{itemName(it)}</h2>
              </div>
              {finished && <span className={`rounded-full px-3 py-1 text-xs font-semibold ${p.skipped ? 'bg-raised text-mute' : 'bg-good/20 text-good'}`}>{p.skipped ? 'Übersprungen' : 'Fertig'}</span>}
            </div>
            {it.kind === 'gym' && exercise && !finished && <GymGuide exercise={exercise} />}

            {/* Groß: was jetzt dran ist */}
            {!finished && restEnd === null && (
              <div className="rounded-2xl bg-raised p-4 text-center">
                <p className="text-xs text-mute">Satz {p.done + 1} von {n}{it.kind === 'gym' && it.sets[p.done]?.warmup ? ' · Aufwärmen' : ''}</p>
                <p className="num mt-1 font-display text-5xl leading-none">
                  {it.kind === 'gym'
                    ? <>{it.sets[p.done]?.reps}<span className="text-2xl text-mute"> Wdh.</span>{it.sets[p.done]?.kg ? <> <span className="text-neon">{it.sets[p.done].kg.toLocaleString('de-DE')}</span><span className="text-2xl text-mute"> kg</span></> : null}</>
                    : targetText(ACT[it.activityId], it.targets[p.done] ?? 0)}
                </p>
              </div>
            )}
            {restEnd !== null && (
              <div className="rounded-2xl bg-raised p-4 text-center">
                <p className="text-xs text-mute">Pause</p>
                <p className="num font-display text-6xl leading-none text-neon">{Math.floor(left / 60)}:{String(left % 60).padStart(2, '0')}</p>
                {p.done < n && it.kind === 'gym' && <p className="mt-1 text-sm text-mute">Danach: {it.sets[p.done].reps} Wdh.{it.sets[p.done].kg ? ` · ${it.sets[p.done].kg.toLocaleString('de-DE')} kg` : ''}</p>}
                {p.done >= n && nextOpen(run) >= 0 && <p className="mt-1 text-sm text-mute">Als Nächstes: {itemName(run.items[run.idx])}</p>}
                <div className="mt-3 flex justify-center gap-2">
                  <button onClick={() => setRestEnd((e) => (e ? e + 30000 : e))} className="rounded-full bg-panel px-4 py-2 text-sm">+30 s</button>
                  <button onClick={() => { setRestEnd(null); if (p.done < n) say(speakSet(it, p.done)); }} className="rounded-full bg-panel px-4 py-2 text-sm font-semibold">Weiter</button>
                </div>
              </div>
            )}

            {!finished && (
              it.kind === 'gym'
                ? <Btn className="w-full !py-5 !text-xl" disabled={busy || restEnd !== null || !(it.sets[p.done]?.reps > 0)} onClick={() => void setDone()}>Satz geschafft</Btn>
                : <Btn className="w-full !py-5 !text-xl" onClick={() => onBody(ACT[it.activityId])}>Satz {p.done + 1} starten</Btn>
            )}

            <details className="group" open={finished}>
              <summary className="flex cursor-pointer list-none items-center justify-between py-1 text-sm font-semibold">
                Sätze bearbeiten
                <Icon name="down" className="h-4 w-4 text-mute transition-transform group-open:rotate-180" />
              </summary>
              <div className="mt-2">
                <SetsEditor item={it} done={p.done} locked={p.saved} current={finished ? -1 : p.done} results={p.results}
                  onChange={(x) => {
                    update((r) => ({ ...r, items: r.items.map((y) => (y.id === x.id ? x : y)) }));
                    // Neuer Satz bei fertiger Übung: wieder öffnen
                    if (p.skipped && setCount(x) > p.done) setProgress(x.id, { ...p, skipped: false });
                  }} />
              </div>
            </details>

            <div className="flex flex-wrap gap-2 text-sm">
              {!finished && <button onClick={() => void skip()} className="rounded-full bg-raised px-3 py-2">Übung überspringen</button>}
              <button onClick={() => { if (window.confirm(`„${itemName(it)}“ aus diesem Training nehmen?`)) {
                if (p.saved > 0) { window.alert('Diese Übung hat schon gespeicherte Sätze. Du kannst sie überspringen.'); return; }
                update((r) => { const items = r.items.filter((y) => y.id !== it.id); return { ...r, items, idx: Math.max(0, Math.min(r.idx, items.length - 1)) }; });
              } }} className="rounded-full bg-raised px-3 py-2 text-bad">Entfernen</button>
              <span className="ml-auto flex items-center gap-1 text-mute">Pause
                <select value={rest} onChange={(e) => update((r) => ({ ...r, rest: Number(e.target.value) }))}
                  className="rounded-full bg-raised px-2 py-1.5 text-ink outline-none">
                  {REST_CHOICES.map((s) => <option key={s} value={s}>{s < 120 ? `${s} s` : `${s / 60} min`}</option>)}
                </select>
              </span>
            </div>
          </Card>
        )}

        {allDone && <Card className="text-center font-display text-xl text-neon">Alle Übungen geschafft!</Card>}

        {run.items.length === 0
          ? <Btn className="w-full" onClick={() => setPicking(true)}>+ Erste Übung hinzufügen</Btn>
          : run.items.length < MAX_ITEMS && (
            <button onClick={() => setPicking(true)} className="w-full rounded-2xl border border-dashed border-line py-3 text-sm text-mute">+ Übung hinzufügen</button>
          )}
      </div>

      <div className="fixed inset-x-0 bottom-0 z-30 mx-auto max-w-lg px-4 pb-[max(env(safe-area-inset-bottom),12px)]">
        <Btn kind={allDone ? 'primary' : 'ghost'} className="w-full" disabled={busy} onClick={() => void end()}>Training beenden</Btn>
      </div>

      <AnimatePresence>
        {picking && <Picker onClose={() => setPicking(false)} onPick={(x) => {
          setPicking(false);
          update((r) => ({ ...r, items: [...r.items, x], idx: r.items.length }));
          setRestEnd(null);
          say(speakSet(x, 0));
        }} />}
      </AnimatePresence>
    </div>
  );
}

// ---------- Ende: speichern / übernehmen ----------

function RunEnd({ run, plan, onBack, onClose }: { run: PlanRun; plan: Plan | null; onBack: () => void; onClose: (save: Plan | null | undefined) => void }) {
  const [name, setName] = useState(run.name || plan?.name || '');
  const changed = runChanged(run, plan);
  const [apply, setApply] = useState(true);
  const [busy, setBusy] = useState(false);
  const pts = runPoints(run);
  const didSets = run.items.reduce((s, x) => s + progressOf(run, x.id).saved, 0);
  useEffect(() => { if (didSets) { sfx('success'); buzz([60, 40, 120]); } }, [didSets]);
  const canSave = cleanPlan(planFromRun(run, plan, name)).items.length > 0;

  const close = (save: boolean) => {
    if (busy) return;
    setBusy(true);
    // save undefined = nichts an Vorlagen ändern
    onClose(save ? planFromRun(run, plan, name.trim() || 'Mein Workout') : plan ? undefined : null);
  };

  return (
    <div className="pb-8">
      <Header title="Training beendet" onBack={onBack} />
      <div className="space-y-3 px-4">
        <Card className="text-center">
          <div className="num font-display text-6xl">+{pts}</div>
          <p className="text-sm text-mute">Punkte · {didSets} {didSets === 1 ? 'Satz' : 'Sätze'} gespeichert</p>
        </Card>
        <Card className="space-y-1 text-sm">
          {run.items.map((x) => {
            const pp = progressOf(run, x.id);
            return (
              <div key={x.id} className="flex justify-between gap-3">
                <span className="truncate">{itemName(x)}</span>
                <span className="shrink-0 text-mute">{pp.skipped && !pp.saved ? 'übersprungen' : `${pp.saved}/${setCount(x)} · ${pp.points} P`}</span>
              </div>
            );
          })}
          {run.items.length === 0 && <p className="text-mute">Keine Übungen.</p>}
        </Card>

        {(!plan || changed) && canSave && (
          <Card className="space-y-3">
            {plan ? (
              <label className="flex items-center gap-3">
                <input type="checkbox" checked={apply} onChange={(e) => setApply(e.target.checked)} className="h-5 w-5 shrink-0" />
                <span className="text-sm">Geänderte Übungen und Werte in „{plan.name}“ übernehmen</span>
              </label>
            ) : (
              <>
                <p className="font-semibold">Als Workout speichern?</p>
                <p className="text-sm text-mute">Dann startest du es beim nächsten Mal mit einem Tipp, mit genau diesen Gewichten und Wiederholungen.</p>
                <input value={name} onChange={(e) => setName(e.target.value.slice(0, MAX_NAME))} placeholder="Name, z. B. Beintag"
                  className="w-full rounded-xl bg-raised px-4 py-3 outline-none ring-1 ring-transparent placeholder:text-mute focus:ring-neon/60" />
              </>
            )}
          </Card>
        )}

        {!plan && canSave ? (
          <div className="grid grid-cols-2 gap-3">
            <Btn kind="ghost" disabled={busy} onClick={() => close(false)}>Nicht speichern</Btn>
            <Btn disabled={busy || !name.trim()} onClick={() => close(true)}>Speichern</Btn>
          </div>
        ) : (
          <Btn className="w-full" disabled={busy} onClick={() => close(!!plan && changed && apply && canSave)}>Fertig</Btn>
        )}
      </div>
    </div>
  );
}
