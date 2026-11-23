import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { motion } from 'framer-motion';
import { GYM_ALIASES, GYM_GROUPS, type GymExercise, type GymGroup } from '../data/gym';
import { type GymLog, type GymSet } from '../lib/db';
import { addCustomExercise, allExercises, deleteCustomExercise, cleanSets, computeGymPoints, finishGym, fmtKg, lastLogFor, MAX_KG, MAX_REPS, oneRepMax, setPoints, weightHint, type GymSummary, type WeightHint } from '../lib/gym';
import { useGame } from '../lib/store';
import { Btn, Card, CountUp, Flame, GemIcon, Header, Particles } from '../components/ui';
import { MuscleMap } from '../components/MuscleMap';
import { searchList } from '../lib/search';
import { GymGuide } from '../components/GymGuide';
import { Icon } from '../components/Icon';
import { buzz, sfx } from '../lib/fx';
import { db } from '../lib/db';

type Stage = { s: 'list' } | { s: 'log'; ex: GymExercise } | { s: 'summary'; sum: GymSummary; ex: GymExercise };

/** top: Kopfzeile der Übungsliste (im Training-Tab mit Umschalter statt Zurück-Knopf) */
export function Gym({ onBack, onDone, top }: { onBack: () => void; onDone: () => void; top?: ReactNode }) {
  const g = useGame();
  const [stage, setStage] = useState<Stage>({ s: 'list' });
  if (stage.s === 'list') return <ExerciseList top={top} onBack={onBack} onPick={(ex) => setStage({ s: 'log', ex })} />;
  if (stage.s === 'log')
    return (
      <LogSets ex={stage.ex} onBack={() => setStage({ s: 'list' })}
        onSaved={async (sum) => { await g.reload(); setStage({ s: 'summary', sum, ex: stage.ex }); }} />
    );
  return <GymSummaryView sum={stage.sum} ex={stage.ex} onMore={() => setStage({ s: 'list' })} onDone={onDone} />;
}

export const setsText = (sets: GymSet[]) => {
  if (!sets.length) return '';
  const same = sets.every((s) => s.reps === sets[0].reps && s.kg === sets[0].kg && !s.warmup);
  if (same) return `${sets.length} × ${sets[0].reps}${sets[0].kg ? ` · ${fmtKg(sets[0].kg)}` : ''}`;
  return sets.map((s) => `${s.warmup ? 'A ' : ''}${s.reps}×${s.kg.toLocaleString('de-DE')}`).join(', ') + ' kg';
};

function ExerciseList({ onBack, onPick, top }: { onBack: () => void; onPick: (e: GymExercise) => void; top?: ReactNode }) {
  const [list, setList] = useState<GymExercise[]>([]);
  const [last, setLast] = useState<Record<string, GymLog>>({});
  const [group, setGroup] = useState<GymGroup | 'zuletzt'>('brust');
  const [q, setQ] = useState('');
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState('');

  const load = async () => {
    setList(await allExercises());
    const logs = await db.gymLogs.orderBy('start').toArray();
    const m: Record<string, GymLog> = {};
    for (const l of logs) m[l.exerciseId] = l;
    setLast(m);
    if (logs.length) setGroup('zuletzt');
  };
  useEffect(() => { void load(); }, []);

  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (s) return searchList(list, s, (e) => `${e.name} ${e.equipment} ${GYM_ALIASES[e.id] ?? ''}`, (e) => e.muscles);
    if (group === 'zuletzt') return list.filter((e) => last[e.id]).sort((a, b) => last[b.id].start - last[a.id].start).slice(0, 12);
    return list.filter((e) => e.group === group);
  }, [q, list, group, last]);

  const dup = list.find((e) => e.name.trim().toLowerCase() === newName.trim().toLowerCase());
  const create = async () => {
    if (!newName.trim() || group === 'zuletzt') return;
    if (dup) { setNewName(''); setAdding(false); onPick(dup); return; }
    const e = await addCustomExercise(newName, group);
    setNewName(''); setAdding(false);
    await load();
    onPick(e);
  };

  return (
    <div className="pb-6">
      {top ?? <Header title="Geräte & Hanteln" onBack={onBack} />}
      <div className="space-y-4 px-4">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Übung oder Muskel suchen"
          className="w-full rounded-full bg-panel px-5 py-3 text-ink shadow-card outline-none ring-1 ring-transparent placeholder:text-mute focus:ring-neon/60" />
        {!q && (
          <div className="flex gap-2 overflow-x-auto no-scrollbar">
            {[...(Object.keys(last).length ? [{ id: 'zuletzt' as const, name: 'Zuletzt' }] : []), ...GYM_GROUPS].map((c) => (
              <button key={c.id} onClick={() => setGroup(c.id)}
                className={`shrink-0 rounded-full px-4 py-2 text-sm font-medium ${group === c.id ? 'bg-hot' : 'bg-panel text-mute shadow-card'}`}>{c.name}</button>
            ))}
          </div>
        )}
        <div className="divide-y divide-line overflow-hidden rounded-2xl bg-panel">
          {shown.map((e) => (
            <button key={e.id} onClick={() => onPick(e)} className="flex w-full items-center gap-3 px-4 py-3 text-left active:bg-raised">
              <div className="min-w-0 flex-1">
                <div className="truncate font-semibold">{e.name}</div>
                <div className="truncate text-xs text-mute">
                  {e.custom ? 'Eigene Übung' : e.equipment}
                  {last[e.id] && <> · zuletzt {setsText(last[e.id].sets)}</>}
                </div>
              </div>
              {e.custom && (
                <span role="button" aria-label={`${e.name} entfernen`} className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-mute active:bg-raised"
                  onClick={async (ev) => { ev.stopPropagation(); if (window.confirm(`„${e.name}“ entfernen? Trainings bleiben.`)) { await deleteCustomExercise(e.id); await load(); } }}>
                  <Icon name="trash" className="h-4 w-4" />
                </span>
              )}
              <svg viewBox="0 0 24 24" className="h-5 w-5 shrink-0 text-mute"><path d="M9 5l7 7-7 7" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" /></svg>
            </button>
          ))}
          {shown.length === 0 && <p className="px-4 py-6 text-center text-sm text-mute">Nichts gefunden.</p>}
        </div>
        {!q && group !== 'zuletzt' && (adding ? (
          <Card className="space-y-2">
            <p className="text-sm text-mute">Eigene Übung ({GYM_GROUPS.find((x) => x.id === group)?.name})</p>
            <input autoFocus value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Name, z. B. Hackenschmidt"
              maxLength={40} className="w-full rounded-xl bg-raised px-4 py-3 outline-none" onKeyDown={(e) => { if (e.key === 'Enter') void create(); }} />
            {dup && <p className="text-xs text-fire">„{dup.name}“ gibt es schon. Mit „Öffnen“ trägst du dort ein.</p>}
            <div className="flex gap-2">
              <Btn kind="ghost" className="flex-1 !py-3" onClick={() => setAdding(false)}>Abbrechen</Btn>
              <Btn className="flex-1 !py-3" disabled={!newName.trim()} onClick={() => void create()}>{dup ? 'Öffnen' : 'Anlegen'}</Btn>
            </div>
          </Card>
        ) : (
          <button onClick={() => setAdding(true)} className="w-full rounded-2xl border border-dashed border-line py-3 text-sm text-mute">+ Eigene Übung anlegen</button>
        ))}
      </div>
    </div>
  );
}

const parseNum = (s: string) => Number(s.replace(',', '.'));
/** Nur Ziffern und höchstens ein Komma zulassen */
const cleanNum = (v: string, decimals: boolean) => {
  const d = v.replace('.', ',').replace(decimals ? /[^0-9,]/g : /\D/g, '');
  const i = d.indexOf(',');
  return i < 0 ? d : d.slice(0, i + 1) + d.slice(i + 1).split(',')[0].slice(0, 2);
};

function LogSets({ ex, onBack, onSaved }: { ex: GymExercise; onBack: () => void; onSaved: (s: GymSummary) => void }) {
  const g = useGame();
  const [start] = useState(Date.now());
  const [rows, setRows] = useState<{ reps: string; kg: string; warmup?: boolean }[]>([{ reps: '', kg: '' }]);
  const [prev, setPrev] = useState<GymLog | undefined>();
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    lastLogFor(ex.id).then((l) => {
      setPrev(l);
      // Vorschlag: so viele Sätze wie letztes Mal, mit demselben Gewicht
      if (l) setRows(l.sets.map((s) => ({ reps: '', kg: s.kg ? String(s.kg).replace('.', ',') : '', warmup: s.warmup })));
    });
  }, [ex.id]);

  const sets = cleanSets(rows.map((r) => ({ reps: parseNum(r.reps), kg: parseNum(r.kg), warmup: r.warmup })));
  const toggleWarm = (i: number) => setRows((r) => r.map((x, j) => (j === i ? { ...x, warmup: !x.warmup } : x)));
  /** Wiederholungen vom letzten Mal übernehmen (nur leere Felder) */
  const fillLast = () => setRows((r) => r.map((x, j) => (prev?.sets[j] && !x.reps ? { ...x, reps: String(prev.sets[j].reps) } : x)));
  const preview = computeGymPoints({ sets, streakDays: g.streak.current, isRecord: false, pointsTodayBefore: g.todays.reduce((s, w) => s + w.points, 0) + g.gymPointsToday, exerciseId: ex.id }).total;
  const upd = (i: number, k: 'reps' | 'kg', v: string) => setRows((r) => r.map((x, j) => (j === i ? { ...x, [k]: cleanNum(v, k === 'kg') } : x)));
  const tooMuch = rows.some((r) => parseNum(r.reps) > MAX_REPS || parseNum(r.kg) > MAX_KG);
  const rounded = rows.some((r) => r.kg && Math.round(parseNum(r.kg) * 4) / 4 !== parseNum(r.kg));
  const addRow = () => setRows((r) => [...r, { reps: r[r.length - 1]?.reps ?? '', kg: r[r.length - 1]?.kg ?? '' }]);
  const hasWork = sets.some((s) => !s.warmup);
  // Letztes Mal zu viele Wiederholungen? Dann mehr Gewicht vorschlagen
  const prevHint = prev ? weightHint(prev.sets) : null;
  const applyHint = () => prevHint && setRows((r) => r.map((x) => (x.warmup ? x : { ...x, kg: String(prevHint.to).replace('.', ',') })));

  const save = async () => {
    if (!sets.length) { setErr('Mindestens einen Satz eintragen.'); return; }
    if (!hasWork) { setErr('Nur Aufwärmsätze zählen nicht.'); return; }
    setBusy(true);
    try { onSaved(await finishGym({ exercise: ex, sets, start, end: Date.now() })); }
    catch (e) { setErr((e as Error).message); setBusy(false); }
  };

  return (
    <div className="pb-8">
      <Header title={ex.name} onBack={onBack} />
      <div className="space-y-4 px-4">
        <p className="-mt-2 text-sm text-mute">{ex.custom ? 'Eigene Übung' : ex.equipment}</p>
        <GymGuide exercise={ex} />
        <MuscleMap primary={ex.muscles.primary} secondary={ex.muscles.secondary} />
        {prev && (
          <Card className="!py-3 text-sm">
            <span className="text-mute">Letztes Mal ({new Date(prev.start).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' })}): </span>
            {setsText(prev.sets)}
            {rows.some((r, j) => !r.reps && prev.sets[j]) && <button onClick={fillLast} className="mt-2 block w-full rounded-lg bg-raised py-2 text-sm font-medium text-neon">Wie letztes Mal</button>}
          </Card>
        )}
        {prevHint && <HintCard hint={prevHint} onApply={prevHint.to > 0 ? applyHint : undefined} />}

        <Card className="space-y-2">
          <div className="grid grid-cols-[2rem_1fr_1fr_2.5rem] gap-2 px-1 text-xs text-mute">
            <span>Satz</span><span>Wdh.</span><span>kg</span><span />
          </div>
          {rows.map((r, i) => {
            const pr = prev?.sets[i];
            return (
              <div key={i} className="grid grid-cols-[2rem_1fr_1fr_2.5rem] items-center gap-2">
                <button onClick={() => toggleWarm(i)} aria-label={r.warmup ? `Satz ${i + 1}: Aufwärmsatz, antippen für Arbeitssatz` : `Satz ${i + 1}: antippen für Aufwärmsatz`}
                  className={`num grid h-10 place-items-center rounded-lg font-display text-lg ${r.warmup ? 'bg-volt/20 text-volt' : 'text-mute'}`}>{r.warmup ? 'A' : i + 1}</button>
                <input inputMode="numeric" value={r.reps} onChange={(e) => upd(i, 'reps', e.target.value)} placeholder={pr ? String(pr.reps) : '12'}
                  className="num w-full rounded-xl bg-raised px-3 py-3 text-center text-lg outline-none ring-1 ring-transparent placeholder:text-mute focus:ring-neon/60" />
                <input inputMode="decimal" value={r.kg} onChange={(e) => upd(i, 'kg', e.target.value)} placeholder={pr ? String(pr.kg).replace('.', ',') : '0'}
                  className="num w-full rounded-xl bg-raised px-3 py-3 text-center text-lg outline-none ring-1 ring-transparent placeholder:text-mute focus:ring-neon/60" />
                <button aria-label="Satz löschen" disabled={rows.length === 1} onClick={() => setRows((x) => x.filter((_, j) => j !== i))}
                  className="grid h-10 w-10 place-items-center rounded-full text-mute disabled:opacity-30 active:bg-raised">
                  <Icon name="x" className="h-4 w-4" />
                </button>
              </div>
            );
          })}
          <button onClick={addRow} className="w-full rounded-xl border border-dashed border-line py-2.5 text-sm text-mute">+ Satz hinzufügen</button>
          <RestTimer />
          <p className="px-1 text-xs text-mute">Nummer antippen = Aufwärmsatz (A)</p>
          {tooMuch && <p className="px-1 text-xs text-fire">Max. {MAX_REPS} Wdh. und {MAX_KG} kg pro Satz.</p>}
          {rounded && <p className="px-1 text-xs text-mute">Wird auf 0,25 kg gerundet.</p>}
        </Card>

        {err && <p className="text-sm text-bad">{err}</p>}
        {/* Speichern bleibt unten sichtbar, auch wenn man scrollt */}
        <div className="sticky bottom-3 z-10 flex gap-2">
          {/* Löschen: nichts speichern, z. B. wenn nur ein Freund ausprobiert hat */}
          <Btn kind="danger" className="shrink-0 !bg-panel !px-4" disabled={busy}
            onClick={() => { if (!rows.some((r) => r.reps) || window.confirm('Eingetragene Sätze löschen? Es wird nichts gespeichert und es gibt keine Punkte.')) onBack(); }}>
            <span className="flex items-center gap-1.5"><Icon name="trash" className="h-5 w-5" /> Löschen</span>
          </Btn>
          <Btn className="min-w-0 flex-1" disabled={busy || !hasWork} onClick={() => void save()}>
            Speichern{sets.length ? ` · ca. +${preview} Punkte` : ''}
          </Btn>
        </div>
      </div>
    </div>
  );
}

/** Pausentimer zwischen den Sätzen: vibriert und piept am Ende */
function RestTimer() {
  const [end, setEnd] = useState<number | null>(null);
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (end === null) return;
    const id = setInterval(() => {
      const t = Date.now();
      setNow(t);
      if (t >= end) { setEnd(null); sfx('success'); buzz([200, 100, 200]); }
    }, 250);
    return () => clearInterval(id);
  }, [end]);
  const left = end === null ? 0 : Math.max(0, Math.ceil((end - now) / 1000));
  return (
    <div className="flex items-center gap-2 pt-1 text-sm">
      <span className="text-mute">Pause</span>
      {end === null
        ? [60, 90, 120, 180].map((s) => (
          <button key={s} onClick={() => { setNow(Date.now()); setEnd(Date.now() + s * 1000); }} className="rounded-full bg-raised px-3 py-1.5 text-ink">{s < 120 ? `${s} s` : `${s / 60} min`}</button>
        ))
        : <>
          <span className="num font-display text-2xl text-neon">{Math.floor(left / 60)}:{String(left % 60).padStart(2, '0')}</span>
          <button onClick={() => setEnd(null)} className="ml-auto rounded-full bg-raised px-3 py-1.5">Stopp</button>
        </>}
    </div>
  );
}

function GymSummaryView({ sum, ex, onMore, onDone }: { sum: GymSummary; ex: GymExercise; onMore: () => void; onDone: () => void }) {
  useEffect(() => { sfx('success'); buzz([60, 40, 120]); }, []);
  const b = sum.breakdown;
  const hint = weightHint(sum.log.sets);
  const rows: [string, number][] = [
    ['Basis', b.base], ['Streak-Bonus', b.streakBonus], ['Rekord-Bonus', b.recordBonus], ['Tageslimit', -b.antiFarmCut],
  ];
  return (
    <div className="relative space-y-4 overflow-hidden px-4 pb-8 pt-[max(env(safe-area-inset-top),20px)]">
      {sum.isRecord && <Particles />}
      <div className="text-center">
        <p className="text-xs tracking-wide text-mute">{ex.name} · {setsText(sum.log.sets)}</p>
        <div className="num mt-2 font-display text-7xl">+<CountUp to={b.total} /></div>
        <p className="text-sm text-mute">Punkte</p>
      </div>
      {sum.streakMissing > 0 && (
        <p className="rounded-xl bg-panel p-3 text-center text-sm text-mute">Noch <b className="text-ink">{sum.streakMissing} P</b> für die Streak.</p>
      )}
      {sum.isRecord && (
        <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', delay: 0.4 }}
          className="rounded-2xl bg-panel p-3 text-center ring-1 ring-fire/50">
          <div className="flex items-center justify-center gap-2 font-display text-xl text-fire"><Icon name="trophy" className="h-6 w-6" /> Neuer Rekord!</div>
          <div className="text-sm">{sum.recordText}</div>
        </motion.div>
      )}
      {hint && <HintCard hint={hint} />}
      <Card>
        <div className="grid grid-cols-3 text-center">
          <Stat v={String(sum.log.sets.filter((s) => !s.warmup).length)} l="Arbeitssätze" />
          <Stat v={String(sum.log.sets.filter((s) => !s.warmup).reduce((s, x) => s + x.reps, 0))} l="Wiederholungen" />
          <Stat v={sum.log.volume.toLocaleString('de-DE')} l="kg bewegt" />
        </div>
        {sum.log.sets.some((s) => s.kg > 0) && (
          <p className="mt-2 text-center text-xs text-mute">Geschätztes 1RM: <b className="text-ink">{fmtKg(Math.round(Math.max(...sum.log.sets.map(oneRepMax))))}</b></p>
        )}
        <div className="mt-3 space-y-1 text-sm">
          {rows.filter(([, v]) => v !== 0).map(([k, v]) => (
            <div key={k} className="flex justify-between"><span className="text-mute">{k}</span><span className={v < 0 ? 'text-bad' : ''}>{v > 0 ? '+' : ''}{v}</span></div>
          ))}
          {sum.log.sets.map((s, i) => (
            <div key={i} className="flex justify-between text-xs text-mute"><span>{s.warmup ? 'Aufwärmen' : `Satz ${i + 1}`}: {s.reps} × {fmtKg(s.kg)}</span><span>{(Math.round(setPoints(s, sum.log.exerciseId) * 100) / 100).toLocaleString('de-DE')} P</span></div>
          ))}
        </div>
      </Card>
      {sum.gems.length > 0 && (
        <Card>
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-2 font-display text-xl">Gems <GemIcon className="h-5 w-5" /></span>
            <span className="num font-display text-3xl text-gem">+{sum.log.gems}</span>
          </div>
          <div className="mt-2 space-y-1 text-sm">
            {sum.gems.map((x, i) => <div key={i} className="flex justify-between"><span className="text-ink/80">{x.reason}</span><span className="text-gem">+{x.amount}</span></div>)}
          </div>
        </Card>
      )}
      {sum.streakIncreased && (
        <Card className="flex items-center gap-3">
          <Flame days={sum.streakAfter} size={60} />
          <div>
            <div className="font-display text-xl">Streak +1</div>
            <div className="text-sm text-ink/80">{sum.streakAfter} {sum.streakAfter === 1 ? 'Tag' : 'Tage'} in Folge</div>
          </div>
        </Card>
      )}
      {sum.levelAfter > sum.levelBefore && <Card className="text-center font-display text-xl text-neon">Level {sum.levelAfter} erreicht!</Card>}
      <div className="sticky bottom-3 grid grid-cols-2 gap-3">
        <Btn kind="ghost" onClick={onMore}>Nächste Übung</Btn>
        <Btn onClick={onDone}>Fertig</Btn>
      </div>
    </div>
  );
}

function Stat({ v, l }: { v: string; l: string }) {
  return <div><div className="num font-display text-2xl">{v}</div><div className="text-[11px] text-mute">{l}</div></div>;
}

/** Hinweis bei zu vielen Wiederholungen: mehr Gewicht nehmen */
function HintCard({ hint, onApply }: { hint: WeightHint; onApply?: () => void }) {
  return (
    <div className="rounded-2xl bg-panel p-3 ring-1 ring-neon/40">
      <p className="flex items-start gap-2 text-sm">
        <Icon name="bolt" className="mt-0.5 h-4 w-4 shrink-0 text-neon" />
        <span><b className="font-sport text-neon">Mehr Gewicht?</b> {hint.text}</span>
      </p>
      {onApply && <button onClick={onApply} className="mt-2 block w-full rounded-lg bg-raised py-2 text-sm font-medium text-neon">{fmtKg(hint.to)} eintragen</button>}
    </div>
  );
}
