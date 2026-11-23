import { Btn } from '../../components/ui';
import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import type { Activity } from '../../data/activities';
import { CAMERA_COUNTERS, createPushupCounter, MIN_SCORE, SKELETON, type CounterState, type Keypoint, bestSide, KP } from '../../features/pose/counters';
import { estimate, loadMoveNet, resetTracking } from '../../features/pose/movenet';
import { buzz, say, sfx } from '../../lib/fx';
import { fmtTime } from '../../lib/date';
import { BigCount, TopBar, useEnd, useStopwatch, useWakeLock, type FinishFn } from './common';

type Flash = { kind: 'rep' | 'invalid'; text: string; id: number } | null;

export function CameraLive({ activity, onFinish, onManual }: { activity: Activity; onFinish: FinishFn; onManual?: () => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const counter = useRef((CAMERA_COUNTERS[activity.id] ?? createPushupCounter)());
  /** Plank zählt Sekunden statt Wiederholungen */
  const timed = activity.unit === 'time';
  const [cs, setCs] = useState<CounterState>(counter.current.state());
  const [status, setStatus] = useState<'loading' | 'running' | 'error'>('loading');
  const [err, setErr] = useState('');
  const [facing, setFacing] = useState<'user' | 'environment'>('user');
  const [flash, setFlash] = useState<Flash>(null);
  const [fps, setFps] = useState(0);
  const startRef = useRef(Date.now());
  const sec = useStopwatch(true);
  useWakeLock();

  useEffect(() => {
    let stopped = false;
    let stream: MediaStream | null = null;
    let raf = 0;
    let frames = 0, lastFps = performance.now();

    const draw = (k: Keypoint[], st: CounterState) => {
      const c = canvas.current, v = video.current;
      if (!c || !v) return;
      if (c.width !== v.videoWidth) { c.width = v.videoWidth; c.height = v.videoHeight; }
      const ctx = c.getContext('2d')!;
      ctx.clearRect(0, 0, c.width, c.height);
      const lw = Math.max(3, c.width / 120);
      const color = st.visible ? '#FF6B35' : '#F5A524';
      ctx.lineCap = 'round';
      ctx.shadowColor = color; ctx.shadowBlur = 18;
      ctx.strokeStyle = color; ctx.lineWidth = lw;
      for (const [a, b] of SKELETON) {
        if (k[a].score < MIN_SCORE || k[b].score < MIN_SCORE) continue;
        ctx.beginPath(); ctx.moveTo(k[a].x, k[a].y); ctx.lineTo(k[b].x, k[b].y); ctx.stroke();
      }
      ctx.fillStyle = '#fff';
      for (const p of k) if (p.score >= MIN_SCORE) { ctx.beginPath(); ctx.arc(p.x, p.y, lw * 0.9, 0, Math.PI * 2); ctx.fill(); }
      // Messgelenk hervorheben
      const s = bestSide(k);
      const j = activity.id === 'pushup' ? s.elbow : activity.id === 'squat' ? s.knee : activity.id === 'jacks' ? k[KP.nose] : s.hip;
      if (j.score >= MIN_SCORE) {
        ctx.strokeStyle = '#8FA3B8'; ctx.shadowColor = '#8FA3B8'; ctx.lineWidth = lw * 0.8;
        ctx.beginPath(); ctx.arc(j.x, j.y, lw * 6, 0, Math.PI * 2); ctx.stroke();
      }
      ctx.shadowBlur = 0;
    };

    const loop = async () => {
      if (stopped) return;
      const v = video.current;
      if (v) {
        const k = await estimate(v);
        if (k && !stopped) {
          const { state, event } = counter.current.update(k);
          draw(k, state);
          setCs(state);
          if (event?.type === 'rep') {
            sfx('rep'); buzz(50); say(timed ? `${state.reps} Sekunden` : String(state.reps));
            if (!timed) setFlash({ kind: 'rep', text: '+1', id: Date.now() });
          } else if (event?.type === 'invalid') {
            sfx('invalid'); buzz([80, 60, 80]); say('Ungültig');
            setFlash({ kind: 'invalid', text: event.reason, id: Date.now() });
          }
          frames++;
          const now = performance.now();
          if (now - lastFps > 1000) { setFps(Math.round((frames * 1000) / (now - lastFps))); frames = 0; lastFps = now; }
        }
      }
      raf = requestAnimationFrame(loop);
    };

    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: facing, width: { ideal: 640 }, height: { ideal: 480 } }, audio: false });
        if (stopped) { stream.getTracks().forEach((t) => t.stop()); return; }
        const v = video.current!;
        v.srcObject = stream;
        await v.play();
        await loadMoveNet();
        resetTracking();
        if (stopped) return;
        setStatus('running');
        loop();
      } catch (e) {
        setStatus('error');
        console.warn('Kamera-Start fehlgeschlagen', e);
        setErr(e instanceof Error && e.name === 'NotAllowedError' ? 'Die Kamera ist nicht erlaubt. Du kannst sie in den Einstellungen freigeben.' : 'Die Kamera klappt gerade nicht.');
      }
    })();

    return () => { stopped = true; cancelAnimationFrame(raf); stream?.getTracks().forEach((t) => t.stop()); };
  }, [facing, activity.id]);

  const { end, sheet } = useEnd(cs.reps, onFinish, () => (timed
    ? { activityId: activity.id, mode: 'camera', start: startRef.current, end: Date.now(), seconds: cs.reps, invalid: cs.invalid }
    : { activityId: activity.id, mode: 'camera', start: startRef.current, end: Date.now(), reps: cs.reps, invalid: cs.invalid, seconds: Math.round(sec) }),
    timed ? `${cs.reps} Sek. gehalten · ${fmtTime(sec)}` : `${cs.reps} ${activity.unitLabel} · ${fmtTime(sec)}`);

  const mirror = facing === 'user' ? 'scale-x-[-1]' : '';

  return (
    <div className="fixed inset-0 z-40 bg-black overflow-hidden">
      <video ref={video} playsInline muted className={`absolute inset-0 w-full h-full object-contain ${mirror} opacity-70`} />
      <canvas ref={canvas} className={`absolute inset-0 w-full h-full object-contain ${mirror}`} />
      {sheet}
      <TopBar seconds={sec} onEnd={end} title={activity.name} />

      <AnimatePresence>
        {flash && (
          <motion.div key={flash.id} initial={{ opacity: 0.85 }} animate={{ opacity: 0 }} transition={{ duration: flash.kind === 'invalid' ? 1.1 : 0.5 }}
            onAnimationComplete={() => setFlash(null)}
            className={`absolute inset-0 z-20 pointer-events-none grid place-items-center ${flash.kind === 'invalid' ? 'bg-bad/40' : 'bg-neon/15'}`}>
            {flash.kind === 'invalid' && (
              <div className="text-center">
                <div className="font-display text-6xl text-white drop-shadow">Ungültig</div>
                <div className="font-display text-2xl text-white/90 mt-1">{flash.text}</div>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      <div className="absolute z-10 inset-x-0 top-20 flex justify-center pointer-events-none">
        <BigCount n={cs.reps} label={`${timed ? 'Sek. gehalten' : activity.unitLabel}${cs.invalid ? ` · ${cs.invalid} ungültig` : ''}`} pulseKey={timed ? undefined : cs.reps} />
      </div>

      {/* Tiefe der Bewegung */}
      <div className="absolute z-10 right-3 top-1/3 bottom-1/3 w-3 rounded-full bg-white/10 overflow-hidden">
        <motion.div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-neon to-volt" animate={{ height:`${cs.depth * 100}%` }} transition={{ duration: 0.1 }} />
      </div>

      <div className="absolute z-10 inset-x-0 bottom-0 px-4 pb-[max(env(safe-area-inset-bottom),16px)] pt-10 bg-gradient-to-t from-black/90 to-transparent">
        {status === 'loading' && <p className="text-center font-display text-2xl text-volt animate-pulse">KI-Modell & Kamera starten…</p>}
        {status === 'error' && (
          <div className="space-y-3 text-center">
            <p className="text-bad">{err}</p>
            {onManual && <Btn className="w-full pointer-events-auto" onClick={onManual}>{timed ? 'Stattdessen mit Timer' : 'Stattdessen von Hand zählen'}</Btn>}
          </div>
        )}
        {status === 'running' && (
          <>
            <p className={`text-center font-display text-3xl ${cs.visible ? 'text-white' : 'text-fire'}`}>{cs.hint}</p>
            <div className="mt-2 flex justify-between text-xs text-mute">
              <span>{cs.angle !== null ? (activity.id === 'jacks' ? `Füße ${Math.round(cs.angle)} %` : `${{ pushup: 'Ellbogen', squat: 'Knie', plank: 'Körperlinie' }[activity.id as string] ?? 'Hüfte'} ${Math.round(cs.angle)}°`) : cs.source ? `misst: ${cs.source}` : ' '}</span>
              <span>{fps} fps</span>
              <button className="underline pointer-events-auto" onClick={() => { setStatus('loading'); setFacing(facing === 'user' ? 'environment' : 'user'); }}>Kamera wechseln</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
