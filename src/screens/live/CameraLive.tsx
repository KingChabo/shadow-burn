import { Btn } from '../../components/ui';
import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import type { Activity } from '../../data/activities';
import { CAMERA_COUNTERS, createPushupCounter, MIN_SCORE, SKELETON, type CounterState, type Keypoint, bestSide, KP } from '../../features/pose/counters';
import { estimate, loadMoveNet, resetTracking } from '../../features/pose/movenet';
import { buzz, say, sfx } from '../../lib/fx';
import { fmtTime } from '../../lib/date';
import { TopBar, useEnd, useStopwatch, useWakeLock, type FinishFn } from './common';
import { CountRing, RestScreen, SetBar, useExerciseInfo, useSets } from './sets';
import { Icon } from '../../components/Icon';
import type { LiveSets } from '../../lib/sets';

type Flash = { kind: 'rep' | 'invalid'; text: string; id: number } | null;

export function CameraLive({ activity, onFinish, onManual, sets: cfg }: { activity: Activity; onFinish: FinishFn; onManual?: () => void; sets?: LiveSets }) {
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
  const startRef = useRef(Date.now());
  const sec = useStopwatch(true);
  useWakeLock();
  const info = useExerciseInfo(activity);
  const endRef = useRef(() => {});
  const s = useSets(activity, cfg, cs.reps, () => endRef.current());
  // Während der Satzpause keine Ansage und kein Signal je Wiederholung
  const restingRef = useRef(false);
  restingRef.current = s.rest.running;
  const baseRef = useRef(0);
  baseRef.current = s.base;

  useEffect(() => {
    let stopped = false;
    let stream: MediaStream | null = null;
    let raf = 0;

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
      const id = activity.id as string;
      const j = id === 'pushup' || id === 'dip' ? s.elbow : ['squat', 'lunge', 'wallsit', 'highknees'].includes(id) ? s.knee : id === 'jacks' || id === 'pullup' || id === 'chinup' ? k[KP.nose] : s.hip;
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
          if (event?.type === 'rep' && !restingRef.current) {
            const n = state.reps - baseRef.current;
            sfx('rep'); buzz(50); say(timed ? `${n} Sekunden` : String(n));
            if (!timed) setFlash({ kind: 'rep', text: '+1', id: Date.now() });
          } else if (event?.type === 'invalid' && !restingRef.current) {
            sfx('invalid'); buzz([80, 60, 80]); say('Ungültig');
            setFlash({ kind: 'invalid', text: event.reason, id: Date.now() });
          }
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

  const { end, sheet } = useEnd(s.total, onFinish, () => (timed
    ? { activityId: activity.id, mode: 'camera', start: startRef.current, end: Date.now(), seconds: s.total, invalid: cs.invalid, sets: s.setList }
    : { activityId: activity.id, mode: 'camera', start: startRef.current, end: Date.now(), reps: s.total, invalid: cs.invalid, seconds: Math.round(sec), sets: s.setList }),
    timed ? `${s.total} Sek. gehalten · ${fmtTime(sec)}` : `${s.total} ${activity.unitLabel} · ${fmtTime(sec)}`);
  endRef.current = end;

  const mirror = facing === 'user' ? 'scale-x-[-1]' : '';

  return (
    <div className="fixed inset-0 z-40 bg-black overflow-hidden">
      <video ref={video} playsInline muted className={`absolute inset-0 w-full h-full object-contain ${mirror} opacity-70`} />
      <canvas ref={canvas} className={`absolute inset-0 w-full h-full object-contain ${mirror}`} />
      {sheet}
      <TopBar seconds={sec} onEnd={end} title={activity.name} overVideo />
      <RestScreen a={activity} s={s} />

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

      {/* Zahl klein oben links, Hinweis als Schild, Kamera wechseln als Symbol: das Bild bleibt frei */}
      <div className="absolute z-10 left-3 top-[calc(max(env(safe-area-inset-top),12px)+60px)] rounded-3xl bg-bg/80 p-1.5 pointer-events-none">
        <CountRing small value={s.current} s={s} record={info.record} unit={timed ? 'Sek.' : activity.unitLabel}
          text={timed ? fmtTime(s.current) : undefined} pulseKey={timed ? undefined : cs.reps} />
        {cs.invalid > 0 && <p className="pb-1 text-center text-[10px] text-fire">{cs.invalid} ungültig</p>}
      </div>
      {status === 'running' && (
        <button aria-label="Kamera wechseln" onClick={() => { setStatus('loading'); setFacing(facing === 'user' ? 'environment' : 'user'); }}
          className="absolute z-10 right-3 top-[calc(max(env(safe-area-inset-top),12px)+64px)] grid h-11 w-11 place-items-center rounded-full bg-bg/80 text-ink">
          <Icon name="camera" className="h-5 w-5" />
        </button>
      )}
      {status === 'running' && cs.hint && (
        <div className="absolute z-10 inset-x-0 top-[calc(max(env(safe-area-inset-top),12px)+180px)] flex justify-center px-6 pointer-events-none">
          <p className={`rounded-full bg-bg/85 px-4 py-2 text-center text-sm font-semibold ${cs.visible ? 'text-ink' : 'text-fire'}`}>{cs.hint}</p>
        </div>
      )}

      {/* Tiefe der Bewegung */}
      <div className="absolute z-10 right-3 top-1/3 bottom-1/3 w-3 rounded-full bg-white/10 overflow-hidden">
        <motion.div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-neon to-volt" animate={{ height:`${cs.depth * 100}%` }} transition={{ duration: 0.1 }} />
      </div>

      <div className="absolute z-10 inset-x-0 bottom-0 px-4 pb-[max(env(safe-area-inset-bottom),16px)] pt-10 bg-gradient-to-t from-bg via-bg/90 to-transparent">
        {status === 'loading' && <p className="text-center font-display text-2xl text-volt animate-pulse">KI-Modell & Kamera starten…</p>}
        {status === 'error' && (
          <div className="space-y-3 text-center">
            <p className="text-bad">{err}</p>
            {onManual && <Btn className="w-full pointer-events-auto" onClick={onManual}>{timed ? 'Stattdessen mit Timer' : 'Stattdessen von Hand zählen'}</Btn>}
          </div>
        )}
        {status === 'running' && (
          <>
            <div className="pointer-events-auto"><SetBar a={activity} s={s} record={info.record} last={info.last} /></div>
          </>
        )}
      </div>
    </div>
  );
}
