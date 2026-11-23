import { useEffect, useMemo, useState } from 'react';
import { db, type GymLog, type WeightEntry, type Workout } from '../lib/db';
import { dayKey } from '../lib/date';
import { allWeights, deleteWeight, getWeightGoal, saveWeight, setWeightGoal } from '../lib/body';
import { fmtKg } from '../lib/gym';
import { useGame } from '../lib/store';
import {
  activeRuns, bodyPartShare, calendarWeeks, exerciseProgress, filterRange, pointsByCategory, pointsPerDay,
  totals, weekdayCounts, weeklyPoints, weightStats,
} from '../lib/stats';
import { Bars, Donut, Heatmap, LineChart } from '../components/Charts';
import { Btn, Card, Header } from '../components/ui';
import { Icon } from '../components/Icon';
import { RecapList } from './Recap';

const RANGES: { id: string; label: string; days: number | null }[] = [
  { id: '7', label: '7 Tage', days: 7 },
  { id: '30', label: '30 Tage', days: 30 },
  { id: '90', label: '90 Tage', days: 90 },
  { id: 'all', label: 'Alles', days: null },
];
const fmt = (n: number, d = 0) => n.toLocaleString('de-DE', { maximumFractionDigits: d });
const short = (day: string) => new Date(day + 'T12:00').toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' });

export function Stats({ top }: { top?: JSX.Element }) {
  const g = useGame();
  const [workouts, setWorkouts] = useState<Workout[]>([]);
  const [gymLogs, setGymLogs] = useState<GymLog[]>([]);
  const [weights, setWeights] = useState<WeightEntry[]>([]);
  const [range, setRange] = useState('30');
  const [pie, setPie] = useState<'cat' | 'body'>('cat');
  const [exId, setExId] = useState<string | null>(null);
  const today = dayKey();

  const load = async () => {
    const [w, l, b] = await Promise.all([db.workouts.toArray(), db.gymLogs.toArray(), allWeights()]);
    setWorkouts(w); setGymLogs(l); setWeights(b);
  };
  useEffect(() => { void load(); }, [g.wallet.xp]);

  const rangeDays = RANGES.find((r) => r.id === range)!.days;
  const f = useMemo(() => filterRange({ workouts, gymLogs, weights, today, rangeDays }), [workouts, gymLogs, weights, today, rangeDays]);
  const t = totals(f.workouts, f.gymLogs);
  const perDayAll = useMemo(() => pointsPerDay(workouts, gymLogs), [workouts, gymLogs]);
  const weeks = useMemo(() => calendarWeeks(today, 18), [today]);
  const runs = activeRuns(perDayAll, today);
  const weekly = weeklyPoints(perDayAll, today, 12);
  const wd = weekdayCounts(f.workouts, f.gymLogs);
  const slices = pie === 'cat' ? pointsByCategory(f.workouts, f.gymLogs) : bodyPartShare(f.workouts, f.gymLogs);
  const progress = useMemo(() => exerciseProgress(f.gymLogs), [f.gymLogs]);
  const sel = progress.find((p) => p.exerciseId === exId) ?? progress[0];
  const empty = workouts.length + gymLogs.length === 0;

  return (
    <div className="pb-8">
      {top ?? <Header title="Statistik" />}
      <div className="space-y-4 px-4">
        <div className="flex gap-1 rounded-full bg-panel p-1 shadow-card">
          {RANGES.map((r) => (
            <button key={r.id} onClick={() => setRange(r.id)}
              className={`flex-1 rounded-full py-2 text-sm font-semibold ${range === r.id ? 'bg-ink text-bg' : 'text-mute'}`}>{r.label}</button>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-2">
          <Tile v={fmt(t.sessions)} l="Übungen gemacht" />
          <Tile v={fmt(t.activeDays)} l="Aktive Tage" />
          <Tile v={fmt(t.points)} l="Punkte" />
          <Tile v={t.volume >= 10000 ? `${fmt(t.volume / 1000, 1)} t` : `${fmt(t.volume)} kg`} l="Gewicht bewegt" />
        </div>

        <RecapList />

        {empty && <Card className="text-sm text-mute">Noch keine Trainings. Sobald du trainierst, erscheinen hier deine Diagramme.</Card>}

        <Card>
          <div className="mb-3 flex items-baseline justify-between">
            <p className="font-display">Wann du aktiv warst</p>
            <span className="text-xs text-mute">letzte 18 Wochen · heller = mehr Punkte</span>
          </div>
          <Heatmap weeks={weeks} perDay={perDayAll} today={today} />
          <div className="mt-3 grid grid-cols-2 gap-2 text-center">
            <div className="rounded-2xl bg-raised py-2.5"><div className="num font-display text-2xl">{runs.current}</div><div className="text-[11px] text-mute">Tage am Stück aktiv</div></div>
            <div className="rounded-2xl bg-raised py-2.5"><div className="num font-display text-2xl">{runs.longest}</div><div className="text-[11px] text-mute">Längste Serie</div></div>
          </div>
          {t.activeDays > 0 && (
            <div className="mt-4">
              <p className="mb-2 text-xs text-mute">Aktive Tage nach Wochentag ({RANGES.find((r) => r.id === range)!.label})</p>
              <Bars data={['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'].map((label, i) => ({ label, v: wd[i] }))} highlightLast={false} />
            </div>
          )}
        </Card>

        <Card>
          <div className="mb-3 flex items-baseline justify-between">
            <p className="font-display">Punkte pro Woche</p>
            <span className="text-xs text-mute">12 Wochen</span>
          </div>
          <Bars data={weekly.map((w) => ({ label: short(w.week).slice(0, 5), v: w.points }))} />
        </Card>

        <Card>
          <div className="mb-3 flex items-center justify-between gap-2">
            <p className="font-display">Dein Training</p>
            <div className="flex gap-1 rounded-full bg-raised p-0.5 text-xs">
              <button onClick={() => setPie('cat')} className={`rounded-full px-3 py-1 ${pie === 'cat' ? 'bg-ink text-bg' : 'text-mute'}`}>Art</button>
              <button onClick={() => setPie('body')} className={`rounded-full px-3 py-1 ${pie === 'body' ? 'bg-ink text-bg' : 'text-mute'}`}>Körper</button>
            </div>
          </div>
          {slices.length === 0 ? <p className="text-sm text-mute">Keine Trainings in diesem Zeitraum.</p> : pie === 'cat'
            ? <Donut data={slices} center={fmt(t.points)} sub="Punkte" />
            : <Donut data={slices} center={fmt(t.sessions)} sub="Übungen" />}
        </Card>

        <WeightCard weights={weights} inRange={f.weights} onChange={load} />

        {progress.length > 0 && sel && (
          <Card>
            <p className="mb-3 font-display">Kraftentwicklung</p>
            <div className="mb-3 flex gap-2 overflow-x-auto no-scrollbar">
              {progress.map((p) => (
                <button key={p.exerciseId} onClick={() => setExId(p.exerciseId)}
                  className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-medium ${sel.exerciseId === p.exerciseId ? 'bg-hot' : 'bg-raised text-mute'}`}>{p.name}</button>
              ))}
            </div>
            <LineChart points={sel.series.map((s) => ({ day: s.day, v: s.kg }))} color="#9C86F0" unit="" />
            <p className="mt-1 text-xs text-mute">Schwerster Satz pro Training in kg</p>
            <div className="mt-3 divide-y divide-line text-sm">
              {progress.map((p) => (
                <div key={p.exerciseId} className="flex justify-between py-1.5">
                  <span className="truncate pr-2">{p.name}</span>
                  <span className="num shrink-0 text-mute"><span className="font-display text-neon">{p.bestReps} × {fmtKg(p.bestKg)}</span> · {p.sessions}×</span>
                </div>
              ))}
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}

function WeightCard({ weights, inRange, onChange }: { weights: WeightEntry[]; inRange: WeightEntry[]; onChange: () => Promise<void> }) {
  const last = weights[weights.length - 1];
  const [kg, setKg] = useState('');
  const [day, setDay] = useState(dayKey());
  const [err, setErr] = useState('');
  const [showAll, setShowAll] = useState(false);
  const ws = weightStats(inRange);
  const total = weightStats(weights);
  const [goal, setGoal] = useState<number | null>(null);
  const [goalIn, setGoalIn] = useState<string | null>(null);
  useEffect(() => { void getWeightGoal().then(setGoal); }, []);
  const saveGoal = async () => {
    try {
      const v = goalIn?.trim() ? Number(goalIn.replace(',', '.')) : null;
      await setWeightGoal(v); setGoal(v === null ? null : Math.round(v * 10) / 10); setGoalIn(null); setErr('');
    } catch (e) { setErr((e as Error).message); }
  };
  const toGoal = goal !== null && last ? Math.round((last.kg - goal) * 10) / 10 : null;

  const save = async () => {
    try {
      await saveWeight(Number(kg.replace(',', '.')), day);
      setKg(''); setErr(''); setDay(dayKey());
      await onChange();
    } catch (e) { setErr((e as Error).message); }
  };

  const list = [...weights].reverse();
  return (
    <Card>
      <div className="mb-3 flex items-baseline justify-between">
        <p className="font-display">Körpergewicht</p>
        {last && <span className="num font-display text-xl">{fmtKg(last.kg)}</span>}
      </div>
      <div className="flex gap-2">
        <input inputMode="decimal" value={kg} onChange={(e) => setKg(e.target.value.replace(/[^0-9.,]/g, ''))}
          placeholder={last ? String(last.kg).replace('.', ',') : 'z. B. 78,5'}
          className="num min-w-0 flex-1 rounded-xl bg-raised px-3 py-3 text-lg outline-none ring-1 ring-transparent placeholder:text-mute focus:ring-neon/60" />
        <input type="date" value={day} max={dayKey()} onChange={(e) => setDay(e.target.value || dayKey())}
          className="w-[8.5rem] rounded-xl bg-raised px-2 py-3 text-sm text-ink outline-none [color-scheme:dark]" />
        <Btn className="!px-4 !py-3 !text-base" disabled={!kg} onClick={() => void save()}>Speichern</Btn>
      </div>
      {err && <p className="mt-2 text-sm text-bad">{err}</p>}

      {goalIn === null ? (
        <div className="mt-3 flex items-center justify-between gap-3 rounded-xl bg-raised px-3 py-2.5 text-sm">
          <span>
            {goal === null ? <span className="text-mute">Kein Zielgewicht</span>
              : <>Ziel <b className="num">{fmtKg(goal)}</b>{toGoal !== null && (toGoal === 0 ? <span className="text-good"> · erreicht!</span>
                : <span className="text-mute"> · noch {fmt(Math.abs(toGoal), 1)} kg {toGoal > 0 ? 'runter' : 'rauf'}</span>)}</>}
          </span>
          <button className="shrink-0 font-medium text-neon" onClick={() => setGoalIn(goal === null ? '' : String(goal).replace('.', ','))}>{goal === null ? 'Ziel setzen' : 'Ändern'}</button>
        </div>
      ) : (
        <div className="mt-3 flex gap-2">
          <input autoFocus aria-label="Zielgewicht in kg" inputMode="decimal" value={goalIn} onChange={(e) => setGoalIn(e.target.value.replace(/[^0-9.,]/g, ''))} placeholder="Zielgewicht, z. B. 75"
            className="num min-w-0 flex-1 rounded-xl bg-raised px-3 py-3 outline-none ring-1 ring-transparent placeholder:text-mute focus:ring-neon/60" />
          <Btn className="shrink-0 !px-4 !py-3 !text-base" onClick={() => void saveGoal()}>{goalIn.trim() ? 'Speichern' : 'Kein Ziel'}</Btn>
        </div>
      )}

      {ws && inRange.length > 1 && (
        <div className="mt-4">
          <div className="mb-2 flex items-baseline gap-2">
            <span className={`num font-display text-2xl ${ws.change < 0 ? 'text-good' : ws.change > 0 ? 'text-fire' : ''}`}>
              {ws.change > 0 ? '+' : ws.change < 0 ? '−' : '±'}{fmt(Math.abs(ws.change), 1)} kg
            </span>
            <span className="text-xs text-mute">seit {short(ws.first.day)} · tief {fmt(ws.min, 1)} · hoch {fmt(ws.max, 1)}</span>
          </div>
          <LineChart points={inRange.map((w) => ({ day: w.day, v: w.kg }))} color="#4CB782" />
          {goal !== null && <p className="mt-1 text-xs text-mute">Ziel: {fmtKg(goal)}</p>}
        </div>
      )}
      {inRange.length <= 1 && weights.length > 0 && (
        <p className="mt-3 text-sm text-mute">
          {inRange.length === 0 ? 'In diesem Zeitraum kein Eintrag.' : 'Noch ein Eintrag, dann siehst du deinen Verlauf.'}
          {total && weights.length > 1 && ` Gesamt: ${total.change > 0 ? '+' : total.change < 0 ? '−' : '±'}${fmt(Math.abs(total.change), 1)} kg seit ${short(total.first.day)}.`}
        </p>
      )}
      {weights.length === 0 && <p className="mt-3 text-sm text-mute">Trag dein Gewicht ein, dann siehst du hier den Verlauf.</p>}

      {list.length > 0 && (
        <div className="mt-3 divide-y divide-line text-sm">
          {(showAll ? list : list.slice(0, 3)).map((w) => (
            <div key={w.day} className="flex items-center justify-between py-1.5">
              <span className="text-mute">{new Date(w.day + 'T12:00').toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit', year: '2-digit' })}</span>
              <span className="flex items-center gap-2">
                <span className="num">{fmtKg(w.kg)}</span>
                <button aria-label="Eintrag löschen" onClick={async () => { if (!window.confirm(`Eintrag ${fmtKg(w.kg)} vom ${new Date(w.day + 'T12:00').toLocaleDateString('de-DE')} löschen?`)) return; await deleteWeight(w.day); await onChange(); }} className="grid h-10 w-10 place-items-center rounded-full text-mute active:bg-raised">
                  <Icon name="trash" className="h-3.5 w-3.5" />
                </button>
              </span>
            </div>
          ))}
          {list.length > 3 && <button onClick={() => setShowAll((s) => !s)} className="w-full pt-2 text-xs text-neon">{showAll ? 'Weniger anzeigen' : `Alle ${list.length} Einträge`}</button>}
        </div>
      )}
    </Card>
  );
}

function Tile({ v, l }: { v: string; l: string }) {
  return <div className="rounded-2xl bg-panel px-4 py-3"><div className="num font-display text-2xl">{v}</div><div className="text-[11px] text-mute">{l}</div></div>;
}
