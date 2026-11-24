import { useEffect, useState } from 'react';
import { ACT, type Mode } from '../data/activities';
import { Btn, Card } from '../components/ui';
import { Icon } from '../components/Icon';
import { GuideThumb } from '../components/GuideVideo';
import { Countdown } from './Countdown';
import { LiveRouter } from './live/LiveRouter';
import { finishWorkout } from '../lib/game';
import { getKV } from '../lib/db';
import { dayKey } from '../lib/date';
import { saveFitness } from '../lib/dayQuests';
import { cleanAssess, TRACK_BASE, TRACK_NAME, TRACKS, type Fitness, type Track } from '../lib/fitness';

type Stage = { s: 'list' } | { s: 'countdown'; t: Track } | { s: 'live'; t: Track; mode: Mode };

/**
 * Fitness-Einstufung: 3 Übungen (Liegestütze, Sit-ups, Kniebeugen), jeweils testen oder Zahl eingeben.
 * Danach richten sich die Tagesaufträge nach dem Ergebnis. Ein Test wird als normales Training gespeichert.
 * camera: Kamera ist erlaubt (dann zählt der Test per Kamera, sonst von Hand).
 */
/** again: erneute Einstufung (Einstellungen) – dann heißt der untere Knopf „Abbrechen“ */
export function Assessment({ camera, onDone, onFullscreen, again }: { camera: boolean; onDone: () => void; onFullscreen?: (b: boolean) => void; again?: boolean }) {
  const [vals, setVals] = useState<Record<Track, string>>({ push: '', core: '', legs: '' });
  const [stage, setStage] = useState<Stage>({ s: 'list' });
  const [busy, setBusy] = useState(false);

  // Erneute Einstufung: alte Werte vorbelegen
  useEffect(() => {
    void getKV<Fitness | null>('fitness', null).then((f) => {
      if (f) setVals({ push: f.push !== undefined ? String(f.push) : '', core: f.core !== undefined ? String(f.core) : '', legs: f.legs !== undefined ? String(f.legs) : '' });
    });
  }, []);
  useEffect(() => { onFullscreen?.(stage.s !== 'list'); }, [stage.s, onFullscreen]);
  useEffect(() => () => onFullscreen?.(false), [onFullscreen]);

  const start = (t: Track) => {
    const a = ACT[TRACK_BASE[t]];
    if (camera && a.modes.includes('camera')) setStage({ s: 'countdown', t });
    else setStage({ s: 'live', t, mode: 'manual' });
  };

  if (stage.s === 'countdown') return <Countdown preloadCamera onDone={() => setStage({ s: 'live', t: stage.t, mode: 'camera' })} />;
  if (stage.s === 'live') {
    const t = stage.t;
    return (
      <LiveRouter activity={ACT[TRACK_BASE[t]]} mode={stage.mode}
        onManual={() => setStage({ s: 'live', t, mode: 'manual' })}
        onFinish={async (w) => {
          if (w && (w.reps ?? 0) > 0) {
            const sum = await finishWorkout(w);
            setVals((v) => ({ ...v, [t]: String(sum.workout.reps) }));
          }
          setStage({ s: 'list' });
        }} />
    );
  }

  const save = async (skip: boolean) => {
    setBusy(true);
    const fit: Fitness = { at: Date.now() };
    if (!skip) for (const t of TRACKS) if (vals[t] !== '') fit[t] = cleanAssess(Number(vals[t]));
    // Nichts eingetragen = übersprungen: dann gelten Durchschnittswerte, bis Rekorde da sind
    if (TRACKS.some((t) => fit[t] !== undefined)) await saveFitness(fit, dayKey());
    onDone();
  };

  return (
    <div className="space-y-4">
      <div>
        <h2 className="font-display text-3xl">Wie fit bist du?</h2>
        <p className="mt-1 text-sm text-mute">Drei kurze Übungen. Wie viele schaffst du am Stück? Teste es gleich oder trag eine Zahl ein. Danach richten sich deine Tagesaufträge, und sie wachsen mit dir.</p>
      </div>
      {TRACKS.map((t) => {
        const a = ACT[TRACK_BASE[t]];
        return (
          <Card key={t} className="!p-3">
            <div className="flex items-center gap-3">
              <GuideThumb activity={a} className="h-16 w-20 shrink-0 overflow-hidden rounded-xl bg-raised" />
              <div className="min-w-0 flex-1">
                <p className="text-xs text-mute">{TRACK_NAME[t]}</p>
                <p className="font-semibold">{a.name}</p>
              </div>
            </div>
            <div className="mt-3 flex gap-2">
              <input aria-label={`${a.name} am Stück`} inputMode="numeric" value={vals[t]} placeholder="Anzahl"
                onChange={(e) => setVals((v) => ({ ...v, [t]: e.target.value.replace(/\D/g, '').slice(0, 3) }))}
                className="num min-w-0 flex-1 rounded-xl bg-raised px-4 py-3 text-center text-lg outline-none ring-1 ring-transparent focus:ring-neon/60" />
              <Btn kind="ghost" className="shrink-0 !py-3" onClick={() => start(t)}>
                <span className="flex items-center gap-1.5"><Icon name={camera && a.modes.includes('camera') ? 'camera' : 'hand'} className="h-5 w-5" /> Jetzt testen</span>
              </Btn>
            </div>
          </Card>
        );
      })}
      <Btn className="w-full" disabled={busy} onClick={() => void save(false)}>Fertig</Btn>
      <button disabled={busy} onClick={() => void save(true)} className="w-full py-2 text-sm text-mute underline">{again ? 'Abbrechen' : 'Überspringen'}</button>
    </div>
  );
}
