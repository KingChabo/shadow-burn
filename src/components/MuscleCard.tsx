import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useBack } from '../lib/back';
import type { MuscleId } from '../data/activities';
import { db } from '../lib/db';
import { useGame } from '../lib/store';
import { ALL_MUSCLES, hitsOf, LEVEL_STEPS, LEVELS, levelFor, muscleDetail, muscleName, muscleWork, recovery, recoveryColor, recoveryLabel, suggestToday, type Hit } from '../lib/muscles';
import { BodyPaint, type Paint } from './MuscleMap';
import { Card, Segmented } from './ui';

type Mode = 'level' | 'rest';

/** Alle Trainings laden (neu, sobald heute etwas dazukommt) */
function useHits(): Hit[] | null {
  const g = useGame();
  const [hits, setHits] = useState<Hit[] | null>(null);
  const stamp = g.todays.length + ':' + g.gymPointsToday;
  useEffect(() => {
    let alive = true;
    Promise.all([db.workouts.toArray(), db.gymLogs.toArray()]).then(([w, l]) => { if (alive) setHits(hitsOf(w, l)); });
    return () => { alive = false; };
  }, [stamp]);
  return hits;
}

/**
 * Karte auf dem Startbildschirm: Muskeln nach Level eingefärbt.
 * Oben umschaltbar auf die Erholungs-Karte (rot = müde, grün = erholt).
 */
export function MuscleCard() {
  const hits = useHits();
  const [mode, setMode] = useState<Mode>(() => {
    try { return (localStorage.getItem('muscleCard') as Mode) || 'level'; } catch { return 'level'; }
  });
  const pick = (m: Mode) => { setMode(m); try { localStorage.setItem('muscleCard', m); } catch { /* egal */ } };
  const [sel, setSel] = useState<MuscleId | null>(null);

  const data = useMemo(() => {
    if (!hits) return null;
    const work = muscleWork(hits);
    const rec = recovery(hits);
    return { work, rec, today: suggestToday(hits) };
  }, [hits]);

  const paint: Paint[] = useMemo(() => {
    if (!data) return [];
    return ALL_MUSCLES.flatMap((m) => {
      if (mode === 'level') {
        const lv = levelFor(data.work[m]);
        return lv ? [{ muscle: m, rgb: LEVELS[lv].color, k: 0.9 }] : [];
      }
      const v = data.rec[m];
      return [{ muscle: m, rgb: recoveryColor(v), k: v >= 1 ? 0.55 : 0.9 }];
    });
  }, [data, mode]);

  const list = data ? [...ALL_MUSCLES].sort((a, b) => mode === 'level' ? data.work[b] - data.work[a] : data.rec[a] - data.rec[b]) : [];

  return (
    <Card className="!pb-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-sport text-xl font-semibold">Deine Muskeln</h2>
        <Segmented<Mode> value={mode} onChange={pick} className="w-48 !bg-raised !p-0.5 [&_button]:!py-1.5 [&_button]:!text-xs" options={[{ id: 'level', label: 'Level' }, { id: 'rest', label: 'Erholung' }]} />
      </div>
      <div className="mt-2">
        <BodyPaint paint={paint} className="h-56 w-auto" onHold={setSel} />
        <p className="mt-1 text-center text-[11px] text-mute">Lange auf einen Muskel drücken für Details</p>
      </div>

      {mode === 'level' ? (
        <div className="mt-2 flex flex-wrap justify-center gap-x-3 gap-y-1 text-[11px] text-mute">
          {LEVELS.slice(1).map((l) => (
            <span key={l.level} className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full" style={{ background: `rgb(${l.color.join(',')})` }} />{l.name}</span>
          ))}
        </div>
      ) : (
        <div className="mt-2 space-y-1.5">
          <div className="flex justify-center gap-3 text-[11px] text-mute">
            {[0, 0.5, 1].map((v) => <span key={v} className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full" style={{ background: `rgb(${recoveryColor(v).join(',')})` }} />{recoveryLabel(v)}</span>)}
          </div>
          {data && (
            <p className="text-center text-sm">
              {data.today.length ? <>Heute dran: <b className="text-neon">{data.today.join(' und ')}</b></> : <span className="text-mute">Gönn deinen Muskeln heute etwas Pause.</span>}
            </p>
          )}
        </div>
      )}

      {data && (
        <div className="no-scrollbar -mx-1 mt-2 flex gap-1.5 overflow-x-auto px-1 pb-0.5">
          {list.map((m) => {
            const lv = levelFor(data.work[m]);
            const col = mode === 'level' ? (lv ? LEVELS[lv].color : [143, 138, 131]) : recoveryColor(data.rec[m]);
            return (
              <button key={m} onClick={() => setSel(m)}
                className={`shrink-0 rounded-full px-2.5 py-1 text-xs ${sel === m ? 'bg-raised text-ink' : 'bg-raised/60 text-mute'}`}>
                <span className="mr-1 inline-block h-2 w-2 rounded-full" style={{ background: `rgb(${col.join(',')})` }} />
                {muscleName(m)}
              </button>
            );
          })}
        </div>
      )}
      <AnimatePresence>{hits && sel && <MuscleSheet hits={hits} m={sel} mode={mode} onClose={() => setSel(null)} />}</AnimatePresence>
    </Card>
  );
}

const rgb = (c: number[]) => `rgb(${c.join(',')})`;

/** Kreis mit Prozent in der Mitte */
function Ring({ p, color, size = 132, label, sub }: { p: number; color: string; size?: number; label: string; sub: string }) {
  const r = 52, c = 2 * Math.PI * r;
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg viewBox="0 0 120 120" width={size} height={size}>
        <circle cx="60" cy="60" r={r} fill="none" className="stroke-raised" strokeWidth="11" />
        <motion.circle cx="60" cy="60" r={r} fill="none" stroke={color} strokeWidth="11" strokeLinecap="round" transform="rotate(-90 60 60)"
          strokeDasharray={c} initial={{ strokeDashoffset: c }} animate={{ strokeDashoffset: c * (1 - Math.max(0.005, Math.min(1, p))) }} transition={{ duration: 0.8, ease: 'easeOut' }} />
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center">
        <div>
          <div className="font-sport num text-[30px] leading-none">{label}</div>
          <div className="mt-0.5 text-[10px] uppercase tracking-wider text-mute">{sub}</div>
        </div>
      </div>
    </div>
  );
}

function ago(at: number | null): string {
  if (at === null) return 'noch nie';
  const h = (Date.now() - at) / 3_600_000;
  if (h < 1) return 'gerade eben';
  if (h < 24) return `vor ${Math.round(h)} Std.`;
  const d = Math.round(h / 24);
  return d === 1 ? 'gestern' : `vor ${d} Tagen`;
}

/** Details zu einem Muskel: Fortschritt zum nächsten Level und Erholung, je als Kreis mit Prozent */
function MuscleSheet({ hits, m, mode, onClose }: { hits: Hit[]; m: MuscleId; mode: Mode; onClose: () => void }) {
  useBack(true, onClose);
  const d = useMemo(() => muscleDetail(hits, m), [hits, m]);
  const max = LEVELS.length - 1;
  const lv = LEVELS[d.level];
  const lvColor = d.level ? rgb(lv.color) : 'rgb(var(--mute))';
  const next = d.level < max ? LEVELS[d.level + 1] : null;
  const fmt = (n: number) => n.toLocaleString('de-DE', { maximumFractionDigits: 1 });
  const levelRing = <Ring p={d.progress} color={next ? rgb(next.color) : lvColor} label={`${Math.round(d.progress * 100)} %`} sub={next ? `bis Level ${d.level + 1}` : 'Höchststufe'} />;
  const restRing = <Ring p={d.recovery} color={rgb(recoveryColor(d.recovery))} label={`${Math.round(d.recovery * 100)} %`} sub="erholt" />;
  return (
    <motion.div className="fixed inset-0 z-[65] flex items-end bg-black/60" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}>
      <motion.div className="w-full rounded-t-3xl bg-panel p-5 pb-[max(env(safe-area-inset-bottom),20px)]" initial={{ y: 80 }} animate={{ y: 0 }} exit={{ y: 80 }} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="kicker" style={{ color: lvColor }}>Level {d.level} · {lv.name}</p>
            <p className="font-sport text-[28px] leading-tight">{muscleName(m)}</p>
          </div>
          <button onClick={onClose} aria-label="Schließen" className="grid h-9 w-9 place-items-center rounded-full bg-raised text-mute">✕</button>
        </div>

        <div className="mt-3 flex items-center justify-around">
          {mode === 'level' ? <>{levelRing}<div className="scale-[0.8]">{restRing}</div></> : <>{restRing}<div className="scale-[0.8]">{levelRing}</div></>}
        </div>

        {/* Stufenleiter: alle Level als Punkte, aktuelles hervorgehoben */}
        <div className="mt-4 flex items-center gap-1">
          {LEVELS.slice(1).map((l) => (
            <div key={l.level} className="flex flex-1 flex-col items-center gap-1">
              <div className="h-2 w-full rounded-full" style={{ background: d.level >= l.level ? rgb(l.color) : 'rgb(var(--raised))', opacity: d.level === l.level ? 1 : d.level > l.level ? 0.55 : 1 }} />
              <span className={`text-[9px] ${d.level === l.level ? 'font-bold text-ink' : 'text-mute'}`}>{l.name}</span>
            </div>
          ))}
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2 text-sm">
          <Info v={next ? `${fmt(d.toNext)} Sätze` : '–'} l={next ? `bis ${next.name}` : 'Höchststufe erreicht'} />
          <Info v={`${fmt(d.work)} / ${next ? LEVEL_STEPS[d.level + 1] : LEVEL_STEPS[max]}`} l="Sätze insgesamt" />
          <Info v={d.hoursLeft > 0 ? `${Math.ceil(d.hoursLeft)} Std.` : 'jetzt'} l={d.hoursLeft > 0 ? `wieder fit (${recoveryLabel(d.recovery)})` : 'bereit fürs Training'} />
          <Info v={ago(d.lastAt)} l={`zuletzt trainiert · ${d.count30}× in 30 Tagen`} />
        </div>
        <p className="mt-3 text-center text-[11px] text-mute">Ein Satz an Geräten zählt 1, ohne Gerät etwa 15 Punkte = 1. Hilfsmuskeln zählen halb.</p>
      </motion.div>
    </motion.div>
  );
}

function Info({ v, l }: { v: string; l: string }) {
  return (
    <div className="rounded-2xl bg-raised px-3 py-2.5">
      <div className="font-sport num text-lg leading-tight">{v}</div>
      <div className="text-[11px] leading-snug text-mute">{l}</div>
    </div>
  );
}
