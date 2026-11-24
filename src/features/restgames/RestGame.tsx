import { useEffect, useRef, useState } from 'react';
import type { Rest } from '../../components/RestTimer';
import { useGame } from '../../lib/store';
import { createRestGame, REST_GAMES, type RestGameId } from './engine';

export type RestPick = RestGameId | 'x' | null;
const LAST = 'sb.pausenspiel';

/** Spiele in der Pause eingeschaltet? Dann wählt man bei jeder Pause neu (oder X für nur Timer). */
export function useRestPick(rest: Rest) {
  const g = useGame();
  const enabled = !!g.settings.restGame && g.settings.restGame !== 'off';
  const [pick, setPickState] = useState<RestPick>(null);
  // neue Pause: wieder die Auswahl zeigen
  useEffect(() => { if (!rest.running) setPickState(null); }, [rest.running]);
  const setPick = (p: RestPick) => { setPickState(p); if (p && p !== 'x') try { localStorage.setItem(LAST, p); } catch { /* egal */ } };
  return { enabled, pick: enabled && rest.running ? pick : 'x' as RestPick, setPick };
}

const ICON: Record<RestGameId, string> = {
  laeufer: 'M5 20l4-7 3 2 2-5M14 6a2 2 0 1 0 0-.1M9 13l-3-1M14 10l3 3 3-1',
  roehre: 'M12 3a9 9 0 1 0 .1 0M12 8a4 4 0 1 0 .1 0M12 11.5a.5.5 0 1 0 .1 0',
  flieger: 'M3 12l18-8-6 17-3-7-9-2zM12 14l9-10',
  entspannen: 'M12 4c3 3 3 6 0 9-3-3-3-6 0-9zM4 13c4 0 6 2 8 6 2-4 4-6 8-6',
};

/** Auswahl am Anfang der Pause: vier Kacheln und ein X für „nur Timer“ */
export function RestPicker({ onPick, className = '' }: { onPick: (p: RestPick) => void; className?: string }) {
  let last: string | null = null;
  try { last = localStorage.getItem(LAST); } catch { /* egal */ }
  return (
    <div className={`relative rounded-2xl bg-panel p-3 ${className}`}>
      <div className="mb-2 flex items-center justify-between">
        <p className="text-sm font-semibold">Was machst du in der Pause?</p>
        <button onClick={() => onPick('x')} aria-label="Nur Timer" className="grid h-9 w-9 place-items-center rounded-full bg-raised text-lg leading-none text-mute">×</button>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {REST_GAMES.map((x) => (
          <button key={x.id} onClick={() => onPick(x.id)}
            className={`flex flex-col items-start gap-1 rounded-xl bg-raised p-3 text-left ${last === x.id ? 'ring-1 ring-neon/60' : ''}`}>
            <svg viewBox="0 0 24 24" className="h-6 w-6 text-neon" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d={ICON[x.id]} /></svg>
            <span className="font-semibold">{x.name}</span>
            <span className="text-xs leading-tight text-mute">{x.hint}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

/** Das gewählte Spiel; endet von selbst mit der Pause, Level bleibt gespeichert */
export function RestGame({ rest, id, className = '' }: { rest: Rest; id: RestGameId; className?: string }) {
  const g = useGame();
  const ref = useRef<HTMLCanvasElement>(null);
  const endAt = useRef(rest.endAt);
  endAt.current = rest.endAt;
  const { sound, vibration } = g.settings;
  useEffect(() => {
    if (!ref.current || !rest.running) return;
    const getLeft = () => (endAt.current === null ? 0 : (endAt.current - Date.now()) / 1000);
    const game = createRestGame(ref.current, id, {
      getLeft, total: getLeft(), sound,
      vibrate: (p) => { if (vibration) try { navigator.vibrate?.(p); } catch { /* egal */ } },
    });
    return () => game.destroy();
  }, [rest.running, id, sound, vibration]);
  if (!rest.running) return null;
  return <canvas ref={ref} aria-label="Pausenspiel" className={`block w-full touch-none select-none bg-black ${className}`} />;
}
