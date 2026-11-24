import { lazy, Suspense } from 'react';
import type { Activity, Mode } from '../../data/activities';
import type { FinishFn } from './common';
import { ManualLive, NoseTapLive, SensorLive, TimerLive, DistanceLive } from './SimpleLive';
import { DurationLive } from './DurationLive';
import { MotionLive } from './MotionLive';
import { GpsLive } from './GpsLive';
import type { LiveSets } from '../../lib/sets';

const CameraLive = lazy(() => import('./CameraLive').then((m) => ({ default: m.CameraLive })));

/** sets: Sätze (frei oder geplant). Ohne = ein einziger Durchgang wie früher (z. B. in Workouts). */
export function LiveRouter({ activity, mode, onFinish, onManual, sets }: { activity: Activity; mode: Mode; onFinish: FinishFn; onManual?: () => void; sets?: LiveSets }) {
  // Plank hat keinen Handzähler: Ersatz für die Kamera ist dort der Timer
  if (mode === 'manual' && !activity.modes.includes('manual') && activity.modes.includes('timer')) mode = 'timer';
  // Ersatz für GPS ist das Eintragen der Strecke
  if (mode === 'manual' && !activity.modes.includes('manual') && activity.modes.includes('distance')) mode = 'distance';
  const fallback = activity.modes.includes('manual') || activity.modes.includes('timer') || activity.modes.includes('distance') ? onManual : undefined;
  switch (mode) {
    case 'camera':
      return (
        <Suspense fallback={<div className="fixed inset-0 bg-black grid place-items-center font-display text-2xl text-volt">Kamera-KI wird geladen…</div>}>
          <CameraLive activity={activity} sets={sets} onFinish={onFinish} onManual={activity.modes.includes('manual') || activity.modes.includes('timer') ? onManual : undefined} />
        </Suspense>
      );
    case 'jump': return <MotionLive activity={activity} onFinish={onFinish} onManual={fallback} sets={sets} />;
    case 'gps': return <GpsLive activity={activity} onFinish={onFinish} onManual={fallback} />;
    case 'nosetap': return <NoseTapLive activity={activity} onFinish={onFinish} sets={sets} />;
    case 'sensor': return <SensorLive activity={activity} onFinish={onFinish} sets={sets} />;
    case 'timer': return <TimerLive activity={activity} onFinish={onFinish} sets={sets} />;
    case 'distance': return <DistanceLive activity={activity} onFinish={onFinish} />;
    case 'duration': return <DurationLive activity={activity} onFinish={onFinish} />;
    default: return <ManualLive activity={activity} onFinish={onFinish} sets={sets} />;
  }
}
