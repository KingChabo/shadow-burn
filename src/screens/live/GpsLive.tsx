import { useEffect, useRef, useState } from 'react';
import { APP_NAME } from '../../lib/brand';
import type { Activity } from '../../data/activities';
import { acceptFix, routeKm, type GpsFix, type LatLon } from '../../lib/blog';
import { buzz, say, sfx } from '../../lib/fx';
import { fmtPace, fmtTime } from '../../lib/date';
import { Btn } from '../../components/ui';
import { RouteMap } from '../../components/RouteMap';
import { TopBar, useEnd, useStopwatch, useWakeLock, type FinishFn } from './common';

type Props = { activity: Activity; onFinish: FinishFn; onManual?: () => void };

/**
 * Strecke live per GPS (Joggen, Gehen, Rad …). Braucht kein Internet. Die Erlaubnis für den Standort
 * wird erst beim Start dieses Modus gefragt (siehe Setup). Der Bildschirm bleibt an, denn ohne ihn
 * hält Android die Standort-Abfrage im Hintergrund an.
 */
export function GpsLive({ activity: a, onFinish, onManual }: Props) {
  const [running, setRunning] = useState(true);
  const [gps, setGps] = useState<'wait' | 'ok' | 'denied' | 'none'>(navigator.geolocation ? 'wait' : 'none');
  const [pts, setPts] = useState<LatLon[]>([]);
  const runningRef = useRef(true);
  runningRef.current = running;
  const start = useRef(Date.now());
  const sec = useStopwatch(running);
  useWakeLock();
  const km = routeKm(pts);
  // Ansage bei jedem vollen Kilometer
  const saidKm = useRef(0);
  useEffect(() => {
    const n = Math.floor(km);
    if (n > saidKm.current) { saidKm.current = n; sfx('success'); buzz([80, 40, 80]); say(`${n} Kilometer`); }
  }, [km]);

  useEffect(() => {
    if (!navigator.geolocation) return;
    let last: GpsFix | null = null;
    const id = navigator.geolocation.watchPosition((pos) => {
      setGps('ok');
      if (!runningRef.current) { last = null; return; } // nach der Pause neu ansetzen, kein Sprung über die Pausen-Strecke
      const f = acceptFix(last, { lat: pos.coords.latitude, lon: pos.coords.longitude, acc: pos.coords.accuracy, t: pos.timestamp }, a.id);
      if (!f) return;
      last = f;
      setPts((p) => [...p, [f.lat, f.lon] as LatLon]);
    }, (e) => setGps(e.code === 1 ? 'denied' : 'wait'), { enableHighAccuracy: true, maximumAge: 2000, timeout: 20000 });
    return () => navigator.geolocation.clearWatch(id);
  }, [a.id]);

  const kmR = Math.round(km * 100) / 100;
  const pace = km > 0.05 ? sec / 60 / km : 0;
  const { end, sheet } = useEnd(kmR >= 0.01 ? 1 : 0, onFinish,
    () => ({ activityId: a.id, mode: 'gps', start: start.current, end: Date.now(), km: kmR, seconds: Math.round(sec) }),
    `${kmR.toLocaleString('de-DE')} km · ${fmtTime(sec)}`);

  return (
    <div className="fixed inset-0 z-40 bg-bg flex flex-col">
      {sheet}
      <TopBar onEnd={end} title={a.name}
        sub={<span className={gps === 'ok' && running ? 'text-good' : 'text-fire'}>{gps === 'ok' ? (running ? 'GPS verbunden' : 'Pausiert') : gps === 'wait' ? 'Suche GPS …' : 'Kein GPS'}</span>} />
      <div className="flex-1 flex flex-col justify-center gap-5 px-4 pt-20">
        <div className="text-center">
          <div className="font-display text-[6.5rem] leading-none tabular-nums">{kmR.toLocaleString('de-DE', { minimumFractionDigits: 2 })}</div>
          <div className="mt-3 text-mute text-sm">Kilometer</div>
        </div>
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="rounded-2xl bg-panel p-3"><p className="text-xs text-mute">Zeit</p><p className="font-display text-2xl tabular-nums">{fmtTime(sec)}</p></div>
          <div className="rounded-2xl bg-panel p-3"><p className="text-xs text-mute">Min. pro km</p><p className="font-display text-2xl tabular-nums">{pace ? `${fmtPace(pace)}` : '–'}</p></div>
          <div className="rounded-2xl bg-panel p-3"><p className="text-xs text-mute">km/h</p><p className="font-display text-2xl tabular-nums">{sec > 0 && km > 0.05 ? (km / (sec / 3600)).toLocaleString('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) : '–'}</p></div>
        </div>
        {pts.length > 1 && <RouteMap pts={pts} live className="rounded-2xl" />}
        {(gps !== 'ok' || !running) && (
          <p className="text-center text-sm text-fire">
            {gps === 'ok' ? 'Pausiert, Strecke wird nicht gemessen'
              : gps === 'wait' ? 'Suche GPS-Signal … Am besten draußen, mit freiem Himmel.'
                : gps === 'denied' ? `Standort nicht erlaubt. In den Handy-Einstellungen für ${APP_NAME} freigeben.`
                  : 'Dieses Gerät hat kein GPS.'}
          </p>
        )}
      </div>
      <div className="px-4 pb-[max(env(safe-area-inset-bottom),16px)] space-y-2">
        {(gps === 'denied' || gps === 'none') && onManual && <Btn className="w-full" onClick={onManual}>Stattdessen Strecke eintragen</Btn>}
        <Btn kind={running ? 'ghost' : 'primary'} className="w-full !py-5 !text-2xl" onClick={() => setRunning(!running)}>{running ? 'Pause' : 'Weiter'}</Btn>
      </div>
    </div>
  );
}
