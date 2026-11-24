import { useState } from 'react';
import { useGame } from '../lib/store';
import { dayKey } from '../lib/date';
import { entryFor, hasMoves, planActive, weekView, WEEKDAYS, WEEKDAYS_LONG, weekdayOf } from '../lib/weekPlan';
import { Card } from './ui';
import { Icon } from './Icon';

/**
 * Startseite, nur mit Wochenplan: was heute dran ist, die Woche als Leiste
 * und Verschieben (erst Trainingstag antippen, dann den neuen Tag).
 */
export function WeekPlanCard() {
  const g = useGame();
  const [pick, setPick] = useState<string | null>(null);
  const [msg, setMsg] = useState('');
  const plan = g.streak.plan;
  if (!planActive(plan)) return null;

  const today = dayKey();
  const entry = entryFor(plan, today);
  const counted = g.streak.lastActiveDay === today;
  const trained = counted && g.streak.restCounted !== today;
  const week = weekView(plan, today);
  const moved = hasMoves(plan, today);

  const title = entry === null ? 'Heute Ruhetag' : `Heute: ${entry || 'Training'}`;
  const sub = entry === null
    ? (counted ? 'Zählt für deine Streak. Training ist trotzdem erlaubt.' : 'Ruhetag – zählt für die Streak, sobald sie läuft.')
    : trained ? 'Erledigt. Stark!' : 'Trainingstag: ohne Training reißt heute Nacht die Streak.';

  const tap = async (day: string, isTraining: boolean) => {
    setMsg('');
    if (!pick) {
      if (!isTraining) { setMsg('Tippe zuerst einen Trainingstag an.'); return; }
      if (day === today && trained) { setMsg('Heute hast du schon trainiert.'); return; }
      setPick(day);
      return;
    }
    if (day === pick) { setPick(null); return; }
    const err = await g.moveTrainingDay(pick, day);
    if (err) setMsg(err);
    else setMsg(`${WEEKDAYS_LONG[weekdayOf(pick)]} → ${WEEKDAYS_LONG[weekdayOf(day)]} verschoben (nur diese Woche).`);
    setPick(null);
  };

  return (
    <Card className="!py-3.5">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="kicker">Wochenplan</p>
          <p className="font-sport mt-0.5 truncate text-[22px] leading-tight">{title}</p>
          <p className="mt-0.5 text-xs leading-snug text-mute">{sub}</p>
        </div>
        <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-full ${entry === null || trained ? 'bg-raised text-mute' : 'bg-hot'}`}>
          <Icon name={trained ? 'check' : entry === null ? 'snow' : 'flame'} className="h-4 w-4" />
        </span>
      </div>
      <div className="mt-3 grid grid-cols-7 gap-1" role="group" aria-label="Diese Woche">
        {week.map((d) => {
          const isTr = d.entry !== null;
          const isToday = d.day === today;
          const past = d.day < today;
          const sel = pick === d.day;
          const target = !!pick && !isTr && !past;
          return (
            <button key={d.day} onClick={() => void tap(d.day, isTr)} disabled={past}
              aria-label={`${WEEKDAYS_LONG[d.wd]}: ${isTr ? d.entry || 'Training' : 'Ruhetag'}`}
              className={`flex flex-col items-center gap-0.5 rounded-xl py-1.5 text-[11px] font-bold transition
                ${sel ? 'bg-hot' : isTr ? 'bg-raised' : ''} ${isToday ? 'ring-2 ring-[rgb(var(--hot))]' : ''}
                ${target ? 'outline-dashed outline-1 outline-[rgb(var(--hot))]' : ''} ${past ? 'opacity-40' : ''}`}>
              <span>{WEEKDAYS[d.wd]}</span>
              <span className={`h-1.5 w-1.5 rounded-full ${isTr ? 'bg-[rgb(var(--hot))]' : 'bg-line'}`} />
              <span className="w-full truncate px-0.5 text-[9px] font-semibold text-mute">{isTr ? (d.entry || 'Training') : 'Ruhe'}</span>
            </button>
          );
        })}
      </div>
      <p className="mt-2 text-[11px] leading-snug text-mute">
        {msg || (pick
          ? `${WEEKDAYS_LONG[weekdayOf(pick)]} verschieben: tippe den neuen Tag an.`
          : `Training verschieben: Trainingstag antippen, dann den neuen Tag.${moved ? ' Diese Woche ist schon etwas verschoben.' : ''}`)}
      </p>
    </Card>
  );
}
