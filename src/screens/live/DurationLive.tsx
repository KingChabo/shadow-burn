import { useState } from 'react';
import type { Activity } from '../../data/activities';
import { Btn, Header } from '../../components/ui';
import { RATE } from '../../lib/scoring';
import type { FinishFn } from './common';

const FIELD = 'mt-1 w-full rounded-2xl bg-panel border border-line px-4 py-4 text-2xl font-display outline-none focus:border-neon';

/** Sportart nachher eintragen: nur die Dauer (z. B. 90 Min. Fußball). */
export function DurationLive({ activity: a, onFinish }: { activity: Activity; onFinish: FinishFn }) {
  const [h, setH] = useState('');
  const [m, setM] = useState('');
  const total = (parseInt(h) || 0) * 3600 + (parseInt(m) || 0) * 60;
  const maxSec = a.maxSec ?? 3 * 3600;
  const tooLong = total > maxSec;
  const valid = total >= 60 && !tooLong;
  const pts = Math.round((Math.min(total, maxSec) / 60) * RATE[a.id]);
  const save = () => {
    const end = Date.now();
    onFinish({ activityId: a.id, mode: 'duration', start: end - total * 1000, end, seconds: total });
  };
  return (
    <div className="pb-6">
      <Header title={`${a.name} eintragen`} onBack={() => onFinish(null)} />
      <div className="px-4 space-y-4">
        <p className="text-sm text-mute">Wie lange hast du gespielt? Nur aktive Zeit, ohne lange Pausen.</p>
        <div className="flex gap-3">
          <label className="flex-1"><span className="text-sm text-mute">Stunden</span>
            <input inputMode="numeric" value={h} onChange={(e) => setH(e.target.value.replace(/\D/g, '').slice(0, 1))} placeholder="1" className={FIELD} /></label>
          <label className="flex-1"><span className="text-sm text-mute">Minuten</span>
            <input inputMode="numeric" value={m} onChange={(e) => setM(e.target.value.replace(/\D/g, '').slice(0, 3))} placeholder="30" className={FIELD} /></label>
        </div>
        {valid && <p className="text-lg">Etwa <b className="font-display text-neon">{pts} Punkte</b> vor Boni</p>}
        {tooLong && <p className="text-bad text-sm">Höchstens {Math.round(maxSec / 60)} Minuten pro Eintrag.</p>}
        <Btn className="w-full" disabled={!valid} onClick={save}>Speichern</Btn>
      </div>
    </div>
  );
}
