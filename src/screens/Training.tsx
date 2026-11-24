import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { ACTIVITIES, ACT, CATEGORIES, MODE_INFO, searchText, skipsCountdown, type Activity, type ActivityId, type Category, type Mode } from '../data/activities';
import { rateLabel } from '../lib/scoring';
import { useGame } from '../lib/store';
import { db } from '../lib/db';
import { Header, Segmented } from '../components/ui';
import { Setup } from './Setup';
import { Countdown } from './Countdown';
import { LiveRouter } from './live/LiveRouter';
import { SummaryScreen } from './Summary';
import { Icon } from '../components/Icon';
import { GuideThumb } from '../components/GuideVideo';
import { finishWorkout, type Summary, type WorkoutInput } from '../lib/game';
import { Gym } from './Gym';
import { Plans } from './Plans';
import { searchList } from '../lib/search';
import type { LiveSets } from '../lib/sets';

type Stage =
  | { s: 'select' }
  | { s: 'gym' }
  | { s: 'plans' }
  | { s: 'setup'; a: Activity }
  | { s: 'countdown'; a: Activity; mode: Mode; sets?: LiveSets }
  | { s: 'live'; a: Activity; mode: Mode; sets?: LiveSets }
  | { s: 'summary'; summary: Summary };

export function Training({ initial, onFullscreen, onDone }: { initial?: ActivityId; onFullscreen: (b: boolean) => void; onDone: () => void }) {
  const g = useGame();
  const [stage, setStage] = useState<Stage>(initial ? { s: 'setup', a: ACT[initial] } : g.prefs.kind === 'gym' ? { s: 'gym' } : g.prefs.kind === 'plans' ? { s: 'plans' } : { s: 'select' });
  const switchKind = (k: 'body' | 'gym' | 'plans') => {
    setStage(k === 'gym' ? { s: 'gym' } : k === 'plans' ? { s: 'plans' } : { s: 'select' });
    if (g.prefs.kind !== k) void g.setPrefs({ ...g.prefs, kind: k });
  };
  // Oben im Training-Tab: Umschalter statt eigener Seite für Geräte
  const top = (
    <>
      <Header title="Training" />
      <div data-tour="train-kinds" className="mx-4 mb-4"><Segmented value={stage.s === 'gym' ? 'gym' : stage.s === 'plans' ? 'plans' : 'body'} onChange={switchKind}
        options={[{ id: 'body', label: 'Ohne Gerät' }, { id: 'gym', label: 'Geräte' }, { id: 'plans', label: 'Workouts' }]} /></div>
    </>
  );

  // Workouts steuern den Vollbild-Modus selbst (laufendes Training ohne Tab-Leiste)
  useEffect(() => { if (stage.s === 'plans') return; onFullscreen(stage.s === 'countdown' || stage.s === 'live'); return () => onFullscreen(false); }, [stage.s, onFullscreen]);

  const finish = async (w: WorkoutInput | null) => {
    if (!w) { setStage({ s: 'select' }); return; }
    const summary = await finishWorkout(w);
    await g.reload();
    setStage({ s: 'summary', summary });
  };

  switch (stage.s) {
    case 'select':
      return <Select top={top} onPick={(a) => setStage({ s: 'setup', a })} />;
    case 'plans':
      return <Plans top={top} onFullscreen={onFullscreen} />;
    case 'gym':
      return <Gym top={top} onBack={() => switchKind('body')} onDone={onDone} />;
    case 'setup':
      return (
        <Setup activity={stage.a} withSets onBack={() => setStage({ s: 'select' })}
          onStart={(mode, sets) => {
            // Mit Sätzen speichert Setup die Wahl selbst (inkl. Modus)
            if (!sets) void g.setPrefs({ ...g.prefs, lastMode: { ...g.prefs.lastMode, [stage.a.id]: mode } });
            setStage(skipsCountdown(mode) ? { s: 'live', a: stage.a, mode, sets } : { s: 'countdown', a: stage.a, mode, sets });
          }} />
      );
    case 'countdown':
      return <Countdown onDone={() => setStage({ s: 'live', a: stage.a, mode: stage.mode, sets: stage.sets })} preloadCamera={stage.mode === 'camera'} />;
    case 'live':
      return <LiveRouter activity={stage.a} mode={stage.mode} sets={stage.sets} onFinish={finish} onManual={() => setStage({ s: 'live', a: stage.a, mode: 'manual', sets: stage.sets })} />;
    case 'summary':
      return <SummaryScreen summary={stage.summary} onClose={onDone} onAgain={() => setStage({ s: 'setup', a: ACT[stage.summary.workout.activityId] })} />;
  }
}

function unitText(a: Activity) {
  return rateLabel(a);
}

function Select({ onPick, top }: { onPick: (a: Activity) => void; top: JSX.Element }) {
  const g = useGame();
  const [cat, setCat] = useState<Category | 'fav'>('kraft');
  const [q, setQ] = useState('');
  const [recent, setRecent] = useState<ActivityId[]>([]);

  useEffect(() => {
    db.workouts.orderBy('start').reverse().limit(40).toArray().then((ws) => {
      const ids: ActivityId[] = [];
      for (const w of ws) if (!ids.includes(w.activityId)) ids.push(w.activityId);
      setRecent(ids.slice(0, 4));
    });
  }, []);

  const toggleFav = (id: ActivityId) => {
    const f = g.prefs.favorites.includes(id) ? g.prefs.favorites.filter((x) => x !== id) : [...g.prefs.favorites, id];
    void g.setPrefs({ ...g.prefs, favorites: f });
  };

  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (s) return searchList(ACTIVITIES, s, searchText, (a) => a.muscles);
    if (cat === 'fav') return ACTIVITIES.filter((a) => g.prefs.favorites.includes(a.id));
    return ACTIVITIES.filter((a) => a.category === cat);
  }, [q, cat, g.prefs.favorites]);
  // Für die Einführung: erste Übung mit Kamera-Zählung hervorheben
  const firstCam = list.findIndex((a) => a.modes.includes('camera'));

  return (
    <div className="pb-6">
      {top}
      <div className="px-4 space-y-4">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Übung oder Muskel suchen"
          className="w-full rounded-full bg-panel px-5 py-3 text-ink shadow-card placeholder:text-mute outline-none ring-1 ring-transparent focus:ring-neon/60" />

        {!q && recent.length > 0 && (
          <div>
            <p className="mb-2 text-xs font-medium text-mute">Zuletzt</p>
            <div className="flex gap-2 overflow-x-auto no-scrollbar">
              {recent.map((id) => (
                <button key={id} onClick={() => onPick(ACT[id])} className="shrink-0 rounded-full bg-panel px-4 py-2 text-sm">
                  {ACT[id].name}
                </button>
              ))}
            </div>
          </div>
        )}

        {!q && (
          <div className="flex gap-2 overflow-x-auto no-scrollbar">
            {[...CATEGORIES, { id: 'fav' as const, name: 'Favoriten' }].map((c) => (
              <button key={c.id} onClick={() => setCat(c.id)}
                className={`shrink-0 rounded-full px-4 py-2 text-sm font-medium ${cat === c.id ? 'bg-hot' : 'bg-panel text-mute shadow-card'}`}>
                {c.name}
              </button>
            ))}
          </div>
        )}

        {list.length === 0 && <p className="text-mute text-center py-8">{cat === 'fav' ? 'Stern antippen, um Favoriten zu sammeln.' : 'Nichts gefunden.'}</p>}

        <div className="grid grid-cols-2 gap-3">
          {list.map((a, i) => {
            const fav = g.prefs.favorites.includes(a.id);
            return (
              <motion.button key={a.id} onClick={() => onPick(a)} data-tour={i === firstCam ? 'cam-card' : undefined}
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.02 }}
                whileTap={{ scale: 0.98 }}
                className="relative flex flex-col overflow-hidden rounded-2xl bg-panel text-left">
                <GuideThumb activity={a} className="aspect-[4/3] w-full bg-raised" />
                <span role="button" aria-label="Favorit" onClick={(e) => { e.stopPropagation(); toggleFav(a.id); }}
                  className={`absolute right-2 top-2 grid h-8 w-8 place-items-center rounded-full bg-black/50 ${fav ? 'text-fire' : 'text-white/70'}`}>
                  <Icon name="star" className="h-4 w-4" />
                </span>
                <div className="flex flex-1 flex-col px-3 pb-3 pt-2.5">
                  <span className="text-[15px] font-semibold leading-tight">{a.name}</span>
                  <span className="mt-1 text-xs text-mute">{a.modes.map((m) => MODE_INFO[m].name).join(' · ')}</span>
                  <span className="num mt-1.5 text-xs font-medium text-neon">{unitText(a)}</span>
                </div>
              </motion.button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
