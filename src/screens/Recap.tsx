import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { db, getKV, setKV, type GymLog, type Workout } from '../lib/db';
import { dayKey } from '../lib/date';
import { buildRecap, monthName, monthOf, pendingRecap, prevMonth, recapMonths } from '../lib/recap';
import { useBack } from '../lib/back';
import { useGame } from '../lib/store';
import { APP_NAME } from '../lib/brand';
import { Card } from '../components/ui';
import { Icon } from '../components/Icon';

const fmt = (n: number, d = 0) => n.toLocaleString('de-DE', { maximumFractionDigits: d });

function useAll() {
  const g = useGame();
  const [data, setData] = useState<{ w: Workout[]; l: GymLog[] } | null>(null);
  useEffect(() => {
    let alive = true;
    Promise.all([db.workouts.toArray(), db.gymLogs.toArray()]).then(([w, l]) => alive && setData({ w, l }));
    return () => { alive = false; };
  }, [g.wallet.xp]);
  return data;
}

/** Banner auf Home in den ersten 7 Tagen eines Monats: "Dein Oktober-Rückblick ist da" */
export function RecapBanner() {
  const data = useAll();
  const [seen, setSeen] = useState<string | null | undefined>(undefined);
  const [open, setOpen] = useState<string | null>(null);
  useEffect(() => { void getKV<string | null>('recapSeen', null).then(setSeen); }, []);
  if (!data || seen === undefined) return null;
  const month = pendingRecap(dayKey(), seen, recapMonths(data.w, data.l));
  return (
    <>
      {month && (
        <motion.button initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} whileTap={{ scale: 0.985 }}
          onClick={() => setOpen(month)}
          className="flex w-full items-center gap-3 rounded-3xl bg-panel p-4 text-left shadow-card ring-1 ring-neon/40">
          <span className="bg-hot grid h-11 w-11 shrink-0 place-items-center rounded-2xl"><Icon name="star" className="h-5 w-5" /></span>
          <span className="min-w-0 flex-1">
            <span className="kicker block !text-neon">Neu</span>
            <span className="font-sport block text-lg leading-tight">Dein {monthName(month, false)}-Rückblick</span>
          </span>
          <Icon name="down" className="h-5 w-5 -rotate-90 text-mute" />
        </motion.button>
      )}
      {open && <RecapOverlay month={open} workouts={data.w} gymLogs={data.l} onClose={() => { void setKV('recapSeen', open); setSeen(open); setOpen(null); }} />}
    </>
  );
}

/** Karte in der Statistik: alle Monate zum Antippen */
export function RecapList() {
  const data = useAll();
  const [open, setOpen] = useState<string | null>(null);
  if (!data) return null;
  const months = recapMonths(data.w, data.l);
  if (!months.length) return null;
  const now = monthOf(dayKey());
  return (
    <Card>
      <p className="font-display">Monatsrückblicke</p>
      <div className="no-scrollbar -mx-1 mt-3 flex gap-2 overflow-x-auto px-1">
        {months.map((m) => (
          <button key={m} onClick={() => setOpen(m)} className={`shrink-0 rounded-2xl px-3.5 py-2.5 text-left ${m === now ? 'bg-raised' : 'bg-hot'}`}>
            <span className="font-sport block text-base leading-tight">{monthName(m, false)}</span>
            <span className={`block text-[11px] ${m === now ? 'text-mute' : 'text-white/80'}`}>{m === now ? 'bisher' : m.slice(0, 4)}</span>
          </button>
        ))}
      </div>
      {open && <RecapOverlay month={open} workouts={data.w} gymLogs={data.l} onClose={() => setOpen(null)} />}
    </Card>
  );
}

/** Der Rückblick selbst, als Vollbild zum Durchscrollen */
export function RecapOverlay({ month, workouts, gymLogs, onClose }: { month: string; workouts: Workout[]; gymLogs: GymLog[]; onClose: () => void }) {
  useBack(true, onClose);
  const g = useGame();
  const r = useMemo(() => buildRecap(month, workouts, gymLogs), [month, workouts, gymLogs]);
  const running = month === monthOf(dayKey());
  const maxW = Math.max(1, ...r.weeks);
  const tiles: [string, string][] = [
    [fmt(r.points), 'Punkte'],
    [fmt(r.activeDays), `aktive Tage von ${r.days}`],
    [fmt(r.minutes), 'Minuten Training'],
    [fmt(r.sessions), 'Übungen'],
    ...(r.reps ? [[fmt(r.reps), 'Wiederholungen'] as [string, string]] : []),
    ...(r.km ? [[fmt(r.km, 1), 'Kilometer'] as [string, string]] : []),
    ...(r.kg ? [[r.kg >= 10000 ? `${fmt(r.kg / 1000, 1)} t` : `${fmt(r.kg)} kg`, 'Gewicht bewegt'] as [string, string]] : []),
    [String(r.bestRun), 'Tage am Stück'],
  ];
  const item = (i: number) => ({ initial: { opacity: 0, y: 14 }, animate: { opacity: 1, y: 0 }, transition: { delay: 0.08 * i } });

  return (
    <div className="fixed inset-0 z-[70] overflow-y-auto bg-bg" role="dialog" aria-modal="true" aria-label={`Rückblick ${monthName(month)}`}>
      <div className="bg-hot relative overflow-hidden px-5 pb-7 pt-[max(env(safe-area-inset-top),20px)]">
        <span className="stripes pointer-events-none absolute -right-10 -top-6 h-72 w-56 rounded-[48px]" />
        <button onClick={onClose} aria-label="Schließen" className="relative ml-auto grid h-10 w-10 place-items-center rounded-full bg-white/20"><Icon name="x" className="h-5 w-5" /></button>
        <p className="kicker relative mt-2 !text-white/85">{APP_NAME} · {running ? 'Rückblick bisher' : 'Monatsrückblick'}</p>
        <h1 className="font-sport relative mt-1 text-[44px] leading-[0.95]">{monthName(month)}</h1>
        <p className="relative mt-2 text-sm text-white/90">
          {r.sessions === 0 ? 'In diesem Monat gab es kein Training.' : `${(g.profile?.name ?? '').split(' ')[0] || 'Du'}, das hast du geschafft:`}
        </p>
      </div>

      <div className="space-y-3 px-4 pb-10 pt-4">
        <motion.div {...item(0)} className="grid grid-cols-2 gap-2">
          {tiles.map(([v, l]) => (
            <div key={l} className="rounded-2xl bg-panel px-3 py-3 shadow-card">
              <div className="font-sport num text-[30px] leading-none">{v}</div>
              <div className="mt-1 text-[11px] text-mute">{l}</div>
            </div>
          ))}
        </motion.div>

        {r.vsPrev !== null && (
          <motion.div {...item(1)}><Card className="flex items-center gap-3 !py-3">
            <span className={`font-sport num text-3xl ${r.vsPrev >= 0 ? 'text-good' : 'text-bad'}`}>{r.vsPrev >= 0 ? '+' : ''}{r.vsPrev} %</span>
            <span className="text-sm text-mute">Punkte im Vergleich zum {monthName(prevMonth(month), false)}</span>
          </Card></motion.div>
        )}

        {r.top && (
          <motion.div {...item(2)}><Card className="!py-3">
            <p className="kicker">Lieblingsübung</p>
            <p className="font-sport mt-1 text-2xl">{r.top.name}</p>
            <p className="text-sm text-mute">{r.top.count}× gemacht{r.favWeekday ? ` · am liebsten am ${r.favWeekday}` : ''}</p>
          </Card></motion.div>
        )}

        {r.muscles.length > 0 && (
          <motion.div {...item(3)}><Card className="!py-3">
            <p className="kicker">Am meisten trainiert</p>
            <div className="mt-2 space-y-2">
              {r.muscles.map((m) => (
                <div key={m.id}>
                  <div className="flex justify-between text-sm"><span className="font-semibold">{m.name}</span><span className="text-mute">{Math.round(m.share * 100)} %</span></div>
                  <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-raised"><div className="bg-hot h-full rounded-full" style={{ width: `${Math.max(4, (m.share / r.muscles[0].share) * 100)}%` }} /></div>
                </div>
              ))}
            </div>
          </Card></motion.div>
        )}

        {r.sessions > 0 && (
          <motion.div {...item(4)}><Card className="!py-3">
            <p className="kicker">Punkte je Woche</p>
            <div className="mt-3 flex h-28 items-end gap-2">
              {r.weeks.map((p, i) => (
                <div key={i} className="flex flex-1 flex-col items-center gap-1">
                  <span className="num text-[11px] text-mute">{fmt(p)}</span>
                  <div className="bg-hot w-full rounded-lg" style={{ height: `${Math.max(4, (p / maxW) * 80)}px`, opacity: p ? 1 : 0.25 }} />
                  <span className="text-[11px] text-mute">W{i + 1}</span>
                </div>
              ))}
            </div>
          </Card></motion.div>
        )}

        {(r.bestDay || r.records > 0 || r.gems > 0) && (
          <motion.div {...item(5)} className="grid grid-cols-3 gap-2 text-center">
            <div className="rounded-2xl bg-panel py-3 shadow-card"><div className="font-sport num text-2xl">{r.bestDay ? fmt(r.bestDay.points) : '–'}</div><div className="text-[11px] text-mute">{r.bestDay ? `bester Tag (${Number(r.bestDay.day.slice(8))}.)` : 'bester Tag'}</div></div>
            <div className="rounded-2xl bg-panel py-3 shadow-card"><div className="font-sport num text-2xl">{r.records}</div><div className="text-[11px] text-mute">Rekorde</div></div>
            <div className="rounded-2xl bg-panel py-3 shadow-card"><div className="font-sport num text-2xl text-gem">{r.gems}</div><div className="text-[11px] text-mute">Gems</div></div>
          </motion.div>
        )}

        <button onClick={onClose} className="bg-hot mt-2 w-full rounded-2xl py-3.5 font-semibold">Weiter geht's</button>
      </div>
    </div>
  );
}

