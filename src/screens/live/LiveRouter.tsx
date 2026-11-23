import { lazy, Suspense } from 'react';
import type { Activity, Mode } from '../../data/activities';
import type { FinishFn } from './common';
import { ManualLive, NoseTapLive, SensorLive, TimerLive, DistanceLive } from './SimpleLive';
import { DurationLive } from './DurationLive';

const CameraLive = lazy(() => import('./CameraLive').then((m) => ({ default: m.CameraLive })));

export function LiveRouter({ activity, mode, onFinish, onManual }: { activity: Activity; mode: Mode; onFinish: FinishFn; onManual?: () => void }) {
  // Plank hat keinen Handzähler: Ersatz für die Kamera ist dort der Timer
  if (mode === 'manual' && !activity.modes.includes('manual') && activity.modes.includes('timer')) mode = 'timer';
  switch (mode) {
    case 'camera':
      return (
        <Suspense fallback={<div className="fixed inset-0 bg-black grid place-items-center font-display text-2xl text-volt">Kamera-KI wird geladen…</div>}>
          <CameraLive activity={activity} onFinish={onFinish} onManual={activity.modes.includes('manual') || activity.modes.includes('timer') ? onManual : undefined} />
        </Suspense>
      );
    case 'nosetap': return <NoseTapLive activity={activity} onFinish={onFinish} />;
    case 'sensor': return <SensorLive activity={activity} onFinish={onFinish} />;
    case 'timer': return <TimerLive activity={activity} onFinish={onFinish} />;
    case 'distance': return <DistanceLive activity={activity} onFinish={onFinish} />;
    case 'duration': return <DurationLive activity={activity} onFinish={onFinish} />;
    default: return <ManualLive activity={activity} onFinish={onFinish} />;
  }
}
