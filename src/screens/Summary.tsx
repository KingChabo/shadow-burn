import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import type { Summary } from '../lib/game';
import { ACT, MODE_INFO } from '../data/activities';
import { Btn, Card, CountUp, Flame, GemIcon, Particles } from '../components/ui';
import { MuscleMap } from '../components/MuscleMap';
import { fmtPace, fmtTime } from '../lib/date';
import { Icon } from '../components/Icon';
import { buzz, say, sfx } from '../lib/fx';

export function SummaryScreen({ summary: s, onClose, onAgain }: { summary: Summary; onClose: () => void; onAgain: () => void }) {
  const a = ACT[s.workout.activityId];
  const w = s.workout;
  const lucky = s.gems.find((g) => g.lucky);
  const [chestOpen, setChestOpen] = useState(false);
  const gemTotal = s.gems.filter((g) => !g.lucky || chestOpen).reduce((x, g) => x + g.amount, 0);

  useEffect(() => {
    sfx('success'); buzz([60, 40, 120]);
    say(`${s.breakdown.total} Punkte${s.isRecord ? '. Neuer Rekord!' : ''}`);
  }, [s]);

  const rows: [string, number][] = [
    ['Basis', s.breakdown.base],
    ['Pace-Bonus', s.breakdown.paceBonus],
    ['Formbonus (Kamera)', s.breakdown.formBonus],
    ['Streak-Bonus', s.breakdown.streakBonus],
    ['Rekord-Bonus', s.breakdown.recordBonus],
    ['Tageslimit (über 1.500 Punkte am Tag zählt nur die Hälfte)', -s.breakdown.antiFarmCut],
  ];

  return (
    <div className="relative px-4 pt-[max(env(safe-area-inset-top),20px)] pb-8 space-y-4 overflow-hidden">
      {s.isRecord && <Particles />}
      <div className="text-center">
        <p className="text-mute tracking-wide text-xs">{a.name} · {MODE_INFO[w.mode].name}</p>
        <div className="num mt-2 font-display text-7xl">
          +<CountUp to={s.breakdown.total} />
        </div>
        <p className="text-sm text-mute">Punkte</p>
      </div>

      {s.repsCappedFrom !== undefined && (
        <p className="rounded-xl bg-panel p-3 text-center text-sm text-fire">Du hast {s.repsCappedFrom} eingetragen. Für so kurze Zeit ist das nicht realistisch, deshalb zählen {w.reps}.</p>
      )}
      {s.streakMissing > 0 && (
        <p className="rounded-xl bg-panel p-3 text-center text-sm text-mute">Noch <b className="text-ink">{s.streakMissing} P</b> für die Streak.</p>
      )}

      {s.isRecord && (
        <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', delay: 0.5 }}
          className="rounded-2xl bg-panel p-3 text-center ring-1 ring-fire/50">
          <div className="flex items-center justify-center gap-2 font-display text-xl text-fire"><Icon name="trophy" className="w-6 h-6" /> Neuer Rekord!</div>
          <div className="text-sm">{s.recordText}</div>
        </motion.div>
      )}

      <Card>
        <div className="grid grid-cols-3 text-center">
          {w.reps > 0 && <Stat v={String(w.reps)} l={a.unitLabel} />}
          {w.invalid > 0 && <Stat v={String(w.invalid)} l="ungültig" bad />}
          {w.km > 0 && <Stat v={w.km.toLocaleString('de-DE')} l="km" />}
          {w.km > 0 && w.seconds > 0 && <Stat v={fmtPace(w.seconds / 60 / w.km)} l="min/km" />}
          <Stat v={fmtTime(w.seconds)} l="Zeit" />
        </div>
        {w.sets && w.sets.length > 1 && (
          <p className="mt-2 text-center text-sm text-mute">{w.sets.length} Sätze: <b className="num text-ink">{w.sets.map((x) => (a.unit === 'time' ? fmtTime(x) : x)).join(' · ')}</b></p>
        )}
        <div className="mt-3 space-y-1 text-sm">
          {rows.filter(([, v]) => v !== 0).map(([k, v]) => (
            <div key={k} className="flex justify-between"><span className="text-mute">{k}</span><span className={v < 0 ? 'text-bad' : ''}>{v > 0 ? '+' : ''}{v}</span></div>
          ))}
        </div>
      </Card>

      {s.gems.length > 0 && (
        <Card>
          <div className="flex items-center justify-between">
            <span className="font-display text-xl flex items-center gap-2">Gems <GemIcon className="w-5 h-5" /></span>
            <span className="num font-display text-3xl text-gem">+{gemTotal}</span>
          </div>
          <div className="mt-2 space-y-1 text-sm">
            {s.gems.filter((g) => !g.lucky || chestOpen).map((g, i) => (
              <motion.div key={i} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.12 }} className="flex justify-between">
                <span className="text-ink/80">{g.reason}</span><span className="text-gem">+{g.amount}</span>
              </motion.div>
            ))}
          </div>
          {lucky && !chestOpen && (
            <motion.button onClick={() => { setChestOpen(true); sfx('gem'); buzz([40, 30, 40, 30, 120]); }}
              animate={{ rotate: [0, -2, 2, -2, 0] }} transition={{ repeat: Infinity, duration: 1, repeatDelay: 1.6 }}
              className="mt-3 w-full rounded-xl bg-gem py-3.5 font-semibold text-[#130d26]">
              <span className="flex items-center justify-center gap-2"><Icon name="gift" className="w-6 h-6" /> Glücksfund-Truhe öffnen</span>
            </motion.button>
          )}
        </Card>
      )}

      {s.streakIncreased && (
        <Card className="flex items-center gap-3">
          <Flame days={s.streakAfter} size={60} />
          <div>
            <div className="font-display text-xl">Streak +1</div>
            <div className="text-sm text-ink/80">{s.streakAfter} {s.streakAfter === 1 ? 'Tag' : 'Tage'} in Folge</div>
          </div>
        </Card>
      )}

      {s.levelAfter > s.levelBefore && (
        <motion.div initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="rounded-2xl bg-panel p-4 text-center">
          <div className="font-display text-2xl">Level {s.levelAfter} erreicht</div>
        </motion.div>
      )}

      {s.questsCompleted.length > 0 && (
        <Card><div className="font-display mb-1">Aufträge erledigt</div>{s.questsCompleted.map((q) => <div key={q} className="flex items-center gap-1.5 text-sm"><Icon name="check" className="h-4 w-4 text-good" /> {q}</div>)}</Card>
      )}

      <div>
        <p className="mb-2 text-sm font-medium text-mute">Das hast du trainiert</p>
        <MuscleMap primary={a.muscles.primary} secondary={a.muscles.secondary} />
      </div>

      <div className="sticky bottom-3 flex gap-3">
        <Btn kind="ghost" className="flex-1" onClick={onAgain}>Nochmal</Btn>
        <Btn className="flex-1" onClick={onClose}>Fertig</Btn>
      </div>
    </div>
  );
}

function Stat({ v, l, bad }: { v: string; l: string; bad?: boolean }) {
  return (
    <div>
      <div className={`num font-display text-3xl ${bad ? 'text-bad' : ''}`}>{v}</div>
      <div className="text-[11px] tracking-wide text-mute">{l}</div>
    </div>
  );
}
