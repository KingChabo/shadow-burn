import { useEffect, useState } from 'react';
import { MODE_INFO, setupHint, type Activity, type Mode } from '../data/activities';
import { useGame } from '../lib/store';
import { Btn, Header } from '../components/ui';
import { GuideVideo } from '../components/GuideVideo';
import { MuscleMap } from '../components/MuscleMap';
import { preloadPose } from '../features/pose/preload';
import { Icon } from '../components/Icon';
import { requestMotionPermission } from '../features/sensors';

/** Vor jedem Start: Vorlage, Muskelgruppen, Zähl-Modus */
export function Setup({ activity: a, onBack, onStart }: { activity: Activity; onBack: () => void; onStart: (m: Mode) => void }) {
  const g = useGame();
  const last = g.prefs.lastMode[a.id];
  const [mode, setMode] = useState<Mode>(last && a.modes.includes(last) ? last : a.modes[0]);
  const [err, setErr] = useState<string | null>(null);
  const hint = setupHint(a.id, mode);

  // Kamera-Modell schon mal laden, damit es nach dem Countdown sofort bereit ist
  useEffect(() => { if (mode === 'camera') preloadPose(); }, [mode]);

  const start = async () => {
    setErr(null);
    if (mode === 'sensor' && !(await requestMotionPermission())) {
      setErr('Kein Bewegungssensor. Wähle einen anderen Modus.');
      return;
    }
    if (mode === 'camera' && !navigator.mediaDevices?.getUserMedia) {
      setErr('Kamera braucht HTTPS.');
      return;
    }
    onStart(mode);
  };

  return (
    <div className="pb-6">
      <Header title={a.name} onBack={onBack} />
      <div className="px-4 space-y-4">
        <GuideVideo activity={a} mode={mode} />
        <MuscleMap primary={a.muscles.primary} secondary={a.muscles.secondary} />

        <div className="grid grid-cols-2 gap-2">
          {a.modes.map((m) => (
            <button key={m} onClick={() => setMode(m)}
              className={`flex items-center gap-2.5 rounded-2xl bg-panel p-3 text-left ring-1 ${a.modes.length % 2 && m === a.modes[a.modes.length - 1] ? 'col-span-2' : ''} ${mode === m ? 'ring-neon' : 'ring-transparent'}`}>
              <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ${mode === m ? 'bg-hot' : 'bg-raised text-ink'}`}><Icon name={MODE_INFO[m].icon} className="h-5 w-5" /></span>
              <span className="min-w-0">
                <b className="block text-sm font-semibold">{MODE_INFO[m].name}</b>
                <span className="block truncate text-[11px] text-mute">{MODE_INFO[m].desc}</span>
              </span>
            </button>
          ))}
        </div>
        {hint && <p className="flex gap-2.5 rounded-xl bg-panel p-3 text-sm text-ink"><Icon name="phone" className="mt-0.5 h-5 w-5 shrink-0 text-mute" /><span>{hint}</span></p>}

        <details className="group rounded-2xl bg-panel p-4">
          <summary className="flex cursor-pointer list-none items-center justify-between text-sm font-semibold">Tipps<Icon name="down" className="h-4 w-4 text-mute transition-transform group-open:rotate-180" /></summary>
          <div className="mt-3 grid gap-2.5">
            {a.guide.tips.map((t) => (
              <div key={t} className="flex gap-2.5 text-sm"><Icon name="check" className="mt-0.5 h-4 w-4 shrink-0 text-good" strokeWidth={2.5} /><span>{t}</span></div>
            ))}
            {a.guide.mistakes.map((t) => (
              <div key={t} className="flex gap-2.5 text-sm text-mute"><Icon name="x" className="mt-0.5 h-4 w-4 shrink-0 text-bad" strokeWidth={2.5} /><span>{t}</span></div>
            ))}
          </div>
        </details>

        {err && <p className="text-bad text-sm">{err}</p>}
        <Btn onClick={start} className="sticky bottom-3 w-full !py-4">Los geht's</Btn>
      </div>
    </div>
  );
}
