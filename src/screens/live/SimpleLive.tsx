import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { distanceLimits, type Activity } from '../../data/activities';
import { buzz, say, sfx } from '../../lib/fx';
import { fmtPace, fmtTime } from '../../lib/date';
import { createTiltCounter } from '../../features/pose/counters';
import { Btn, Header } from '../../components/ui';
import { MANUAL_FREE_REPS, MAX_REPS_PER_SEC, MAX_SESSION_REPS } from '../../lib/scoring';
import { TopBar, useEnd, useStopwatch, useWakeLock, type FinishFn } from './common';
import { CountRing, RestScreen, SetBar, useExerciseInfo, useSets } from './sets';
import type { LiveSets } from '../../lib/sets';

type Props = { activity: Activity; onFinish: FinishFn; sets?: LiveSets };

export function ManualLive({ activity: a, onFinish, sets: cfg }: Props) {
  const [n, setN] = useState(0);
  const [typed, setTyped] = useState('');
  const [typing, setTyping] = useState(false);
  const start = useRef(Date.now());
  const sec = useStopwatch();
  useWakeLock();
  const info = useExerciseInfo(a);
  const endRef = useRef(() => {});
  const s = useSets(a, cfg, n, () => endRef.current());
  const limit = Math.min(MAX_SESSION_REPS, Math.max(MANUAL_FREE_REPS, Math.floor(sec * MAX_REPS_PER_SEC)));
  // Im Satz-Modus zählt alles ab Satzbeginn; während der Pause wird nicht gezählt
  const add = (d: number) => { if (s.rest.running) return; setN((x) => Math.max(s.base, x + d)); if (d > 0) { sfx('tap'); buzz(25); } };
  const { end, sheet } = useEnd(s.total, onFinish, () => ({ activityId: a.id, mode: 'manual', start: start.current, end: Date.now(), reps: s.total, seconds: Math.round(sec), sets: s.setList }), `${s.total} ${a.unitLabel} · ${fmtTime(sec)}`);
  endRef.current = end;
  const setTo = () => { if (!s.rest.running && typed) setN(s.base + Number(typed)); setTyped(''); setTyping(false); };
  return (
    <div className="fixed inset-0 z-40 bg-bg flex flex-col">
      {sheet}
      <TopBar seconds={sec} onEnd={end} title={a.name} />
      <RestScreen a={a} s={s} />
      <div className="flex-1 grid place-items-center pt-20"><CountRing value={s.current} s={s} record={info.record} unit={a.unitLabel} pulseKey={n} /></div>
      <div className="px-4 pb-[max(env(safe-area-inset-bottom),12px)] space-y-3">
        <SetBar a={a} s={s} record={info.record} last={info.last} />
        {n > limit && <p className="text-center text-xs text-fire">So viele in so kurzer Zeit? Gerade zählen höchstens {limit}.</p>}
        <div className="flex gap-2">
          <motion.button whileTap={{ scale: 0.93 }} onClick={() => add(-1)} aria-label="Eins weniger"
            className={`w-20 shrink-0 ${s.enabled ? 'h-32' : 'h-40'} rounded-3xl bg-raised font-display text-3xl`}>−1</motion.button>
          <motion.button whileTap={{ scale: 0.95 }} onClick={() => add(1)}
            className={`flex-1 ${s.enabled ? 'h-32' : 'h-40'} rounded-3xl bg-hot font-display text-7xl text-white ${s.rest.running ? 'opacity-40' : ''}`}>+1</motion.button>
        </div>
        <button onClick={() => setTyping(true)} className="w-full py-1 text-sm text-mute underline">Zahl eintippen</button>
      </div>
      {typing && (
        <div className="fixed inset-0 z-[55] flex items-end bg-black/70" onClick={() => setTyping(false)}>
          <div onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Zahl eintippen"
            className="w-full max-w-lg mx-auto rounded-t-3xl bg-panel px-4 pt-5 pb-[max(env(safe-area-inset-bottom),16px)] space-y-3">
            <div className="text-center">
              <div className="font-display text-2xl">Zahl eintippen</div>
              <div className="mt-1 text-sm text-mute">Gerade: {s.current} {a.unitLabel}{s.enabled ? ' in diesem Satz' : ''}</div>
            </div>
            <div className="flex gap-2">
              <input autoFocus aria-label="Anzahl eingeben" inputMode="numeric" value={typed} onChange={(e) => setTyped(e.target.value.replace(/\D/g, '').slice(0, 4))}
                onKeyDown={(e) => { if (e.key === 'Enter') setTo(); }} placeholder="z. B. 25"
                className="min-w-0 flex-1 rounded-2xl bg-bg border border-line px-4 py-3 text-lg outline-none focus:border-neon" />
              <Btn className="shrink-0 !py-3" disabled={!typed} onClick={setTo}>Setzen</Btn>
            </div>
            {Number(typed) > limit && <p className="text-center text-xs text-fire">So viele in so kurzer Zeit? Gerade zählen höchstens {limit}.</p>}
            <div className="grid grid-cols-2 gap-2">
              <Btn kind="ghost" onClick={() => add(5)}>+5</Btn>
              <Btn kind="ghost" onClick={() => add(10)}>+10</Btn>
            </div>
            <button onClick={() => setTyping(false)} className="w-full py-2 text-sm text-mute underline">Schließen</button>
          </div>
        </div>
      )}
    </div>
  );
}

export function NoseTapLive({ activity: a, onFinish, sets: cfg }: Props) {
  const [n, setN] = useState(0);
  const last = useRef(0);
  const start = useRef(Date.now());
  const sec = useStopwatch();
  useWakeLock();
  const info = useExerciseInfo(a);
  const endRef = useRef(() => {});
  const s = useSets(a, cfg, n, () => endRef.current());
  const tap = () => {
    if (s.rest.running) return;
    const now = performance.now();
    if (now - last.current < 300) return; // Doppeltreffer der Nase ignorieren
    last.current = now;
    const v = n + 1;
    setN(v);
    say(String(v - s.base)); sfx('rep'); buzz(40);
  };
  const { end, sheet } = useEnd(s.total, onFinish, () => ({ activityId: a.id, mode: 'nosetap', start: start.current, end: Date.now(), reps: s.total, seconds: Math.round(sec), sets: s.setList }), `${s.total} ${a.unitLabel} · ${fmtTime(sec)}`);
  endRef.current = end;
  return (
    <div className="fixed inset-0 z-40 bg-bg">
      {sheet}
      <TopBar seconds={sec} onEnd={end} title="Nasen-Tap" />
      <RestScreen a={a} s={s} />
      <motion.div onPointerDown={tap} whileTap={{ backgroundColor: 'rgba(255,107,53,0.25)' }}
        className="absolute inset-x-0 top-24 bottom-0 grid place-items-center touch-none">
        <div className="text-center pointer-events-none">
          <CountRing value={s.current} s={s} record={info.record} unit={a.unitLabel} pulseKey={n} />
          <p className="mt-2 text-sm text-mute">Nase tippen = 1 Wiederholung</p>
        </div>
      </motion.div>
      <div className="absolute inset-x-0 bottom-0 z-10 px-4 pb-[max(env(safe-area-inset-bottom),16px)]"><SetBar a={a} s={s} record={info.record} last={info.last} /></div>
    </div>
  );
}

export function SensorLive({ activity: a, onFinish, sets: cfg }: Props) {
  const counter = useRef(createTiltCounter());
  const [n, setN] = useState(0);
  const [tilt, setTilt] = useState(0);
  const [hasData, setHasData] = useState(false);
  const start = useRef(Date.now());
  const sec = useStopwatch();
  useWakeLock();
  const info = useExerciseInfo(a);
  const endRef = useRef(() => {});
  const s = useSets(a, cfg, n, () => endRef.current());
  useEffect(() => {
    const on = (e: DeviceOrientationEvent) => {
      if (e.beta === null) return;
      setHasData(true);
      const c = counter.current;
      if (c.update(e.beta)) { setN(c.reps); sfx('rep'); buzz(50); say(String(c.reps)); }
      setTilt(c.tiltOf(e.beta));
    };
    window.addEventListener('deviceorientation', on);
    return () => window.removeEventListener('deviceorientation', on);
  }, []);
  const { end, sheet } = useEnd(s.total, onFinish, () => ({ activityId: a.id, mode: 'sensor', start: start.current, end: Date.now(), reps: s.total, seconds: Math.round(sec), sets: s.setList }), `${s.total} ${a.unitLabel} · ${fmtTime(sec)}`);
  endRef.current = end;
  return (
    <div className="fixed inset-0 z-40 bg-bg flex flex-col">
      {sheet}
      <TopBar seconds={sec} onEnd={end} title="Sensor" />
      <RestScreen a={a} s={s} />
      <div className="flex-1 grid place-items-center pt-20"><CountRing value={s.current} s={s} record={info.record} unit={a.unitLabel} pulseKey={n} /></div>
      <div className="px-6 pb-[max(env(safe-area-inset-bottom),20px)] space-y-3">
        <SetBar a={a} s={s} record={info.record} last={info.last} />
        {!hasData && <p className="text-fire text-center">Keine Sensordaten – dieses Gerät hat evtl. keinen Neigungssensor.</p>}
        <div className="h-4 rounded-full bg-line overflow-hidden relative">
          <div className="absolute top-0 bottom-0 w-0.5 bg-white/60" style={{ left:`${(55 / 90) * 100}%` }} />
          <div className="h-full bg-gradient-to-r from-volt to-neon" style={{ width:`${Math.min(1, tilt / 90) * 100}%` }} />
        </div>
        <p className="text-center text-sm text-mute">Neigung {Math.round(tilt)}° · zählt ab 55°</p>
        <Btn kind="ghost" className="w-full" onClick={() => { counter.current.reset(); }}>Neu kalibrieren (flach liegen)</Btn>
      </div>
    </div>
  );
}

export function TimerLive({ activity: a, onFinish, sets: cfg }: Props) {
  const [running, setRunning] = useState(true);
  // Während der Satzpause steht die Uhr
  const [resting, setResting] = useState(false);
  const start = useRef(Date.now());
  const sec = useStopwatch(running && !resting);
  const lastSaid = useRef(0);
  useWakeLock();
  const info = useExerciseInfo(a);
  const endRef = useRef(() => {});
  const s = useSets(a, cfg, Math.floor(sec), () => endRef.current());
  useEffect(() => setResting(s.rest.running), [s.rest.running]);
  useEffect(() => {
    const c = s.current;
    if (running && c > 0 && c % 15 === 0 && c !== lastSaid.current) { lastSaid.current = c; say(`${c} Sekunden`); buzz(60); }
  }, [s.current, running]);
  const { end, sheet } = useEnd(s.total, onFinish, () => ({ activityId: a.id, mode: 'timer', start: start.current, end: Date.now(), seconds: s.total, sets: s.setList }), `${a.name} · ${fmtTime(s.total)}`);
  endRef.current = end;
  return (
    <div className="fixed inset-0 z-40 bg-bg flex flex-col">
      {sheet}
      <TopBar onEnd={end} title={a.name} />
      <RestScreen a={a} s={s} />
      <div className="flex-1 grid place-items-center pt-20">
        <div className="grid justify-items-center gap-2 text-center">
          <CountRing value={s.current} text={fmtTime(s.current)} s={s} record={info.record} unit="gehalten" />
          <div className="text-mute text-xs">{a.perMin ? 'Jede Minute gibt es Punkte' : 'Alle 5 Sekunden gibt es Punkte'}</div>
        </div>
      </div>
      <div className="px-4 pb-[max(env(safe-area-inset-bottom),16px)] space-y-3">
        <SetBar a={a} s={s} record={info.record} last={info.last} />
        <Btn kind={running ? 'ghost' : 'primary'} className="w-full !py-6 !text-3xl" onClick={() => setRunning(!running)}>{running ? 'Pause' : 'Weiter'}</Btn>
      </div>
    </div>
  );
}

export function DistanceLive({ activity: a, onFinish }: Props) {
  const [km, setKm] = useState('');
  const [min, setMin] = useState('');
  const [s, setS] = useState('');
  const kmN = parseFloat(km.replace(',', '.')) || 0;
  const total = (parseInt(min) || 0) * 60 + (parseInt(s) || 0);
  const pace = kmN > 0 && total > 0 ? total / 60 / kmN : 0;
  const { minPace, maxKm } = distanceLimits(a); // schneller oder weiter ist unrealistisch
  const valid = kmN > 0 && kmN <= maxKm && total > 0 && pace >= minPace;
  const save = () => {
    const end = Date.now();
    onFinish({ activityId: a.id, mode: 'distance', start: end - total * 1000, end, km: Math.round(kmN * 100) / 100, seconds: total });
  };
  return (
    <div className="pb-6">
      <Header title={`${a.name} eintragen`} onBack={() => onFinish(null)} />
      <div className="px-4 space-y-4">
        <p className="text-sm text-mute">Strecke und Zeit eintragen.</p>
        <label className="block">
          <span className="text-sm text-mute">Distanz (km)</span>
          <input inputMode="decimal" value={km} onChange={(e) => setKm(e.target.value.replace(/[^\d.,]/g, ''))} placeholder="z. B. 5,2"
            className="mt-1 w-full rounded-2xl bg-panel border border-line px-4 py-4 text-2xl font-display outline-none focus:border-neon" />
        </label>
        <div className="flex gap-3">
          <label className="flex-1"><span className="text-sm text-mute">Minuten</span>
            <input inputMode="numeric" value={min} onChange={(e) => setMin(e.target.value.replace(/\D/g, '').slice(0, 4))} placeholder="30"
              className="mt-1 w-full rounded-2xl bg-panel border border-line px-4 py-4 text-2xl font-display outline-none focus:border-neon" /></label>
          <label className="flex-1"><span className="text-sm text-mute">Sekunden</span>
            <input inputMode="numeric" value={s} onChange={(e) => setS(e.target.value.replace(/\D/g, '').slice(0, 2))} placeholder="00"
              className="mt-1 w-full rounded-2xl bg-panel border border-line px-4 py-4 text-2xl font-display outline-none focus:border-neon" /></label>
        </div>
        {pace > 0 && <p className="text-lg">Pace: <b className="font-display text-neon">{fmtPace(pace)} min/km</b> · {(kmN / (total / 3600)).toFixed(1)} km/h</p>}
        {pace > 0 && pace < minPace && <p className="text-bad text-sm">Das ist schneller als Weltrekord – bitte prüfen.</p>}
        {kmN > maxKm && <p className="text-bad text-sm">Höchstens {maxKm} km pro Eintrag.</p>}
        <Btn className="w-full" disabled={!valid} onClick={save}>Speichern</Btn>
      </div>
    </div>
  );
}
