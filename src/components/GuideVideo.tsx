import { useEffect, useRef, useState } from 'react';
import type { Activity, Mode } from '../data/activities';
import { guideOf } from '../data/guides';

/** Lädt ein Video komplett als Blob – so läuft es auch offline aus dem Service-Worker-Cache. */
function useBlobUrl(url: string) {
  const [src, setSrc] = useState<string>();
  useEffect(() => {
    let alive = true;
    let obj: string | undefined;
    fetch(url)
      .then((r) => (r.ok ? r.blob() : Promise.reject(new Error(String(r.status)))))
      .then((b) => { if (alive) { obj = URL.createObjectURL(b); setSrc(obj); } })
      .catch(() => { if (alive) setSrc(url); });
    return () => { alive = false; if (obj) URL.revokeObjectURL(obj); };
  }, [url]);
  return src;
}

/**
 * Vorlage: so sieht die Übung richtig aus. Echtes 3D-Rendering eines Menschen als Video-Schleife,
 * dazu (bei Kamera-Übungen) der Live-Winkel, den auch die Kamera-Erkennung misst.
 */
export function GuideVideo({ activity, mode }: { activity: Activity; mode?: Mode }) {
  // Neue Übungen haben noch kein gerendertes Video: dann gar nichts zeigen statt einer schwarzen Fläche
  if (!guideOf(activity.id).has) return null;
  return <GuideVideoPlayer activity={activity} mode={mode} />;
}

function GuideVideoPlayer({ activity, mode }: { activity: Activity; mode?: Mode }) {
  const g = guideOf(activity.id);
  const src = useBlobUrl(g.video);
  const video = useRef<HTMLVideoElement>(null);
  const [fi, setFi] = useState(0);

  useEffect(() => {
    const v = video.current;
    if (!v || !g.meta) return;
    let raf = 0;
    const loop = () => {
      const n = g.meta!.f.length;
      setFi(Math.min(n - 1, Math.max(0, Math.floor(v.currentTime * g.meta!.fps))));
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [src, g.meta]);

  useEffect(() => { if (video.current) video.current.playbackRate = g.rate; }, [src, g.rate]);

  const m = g.meta?.f[fi];
  let gauge: { label: string; value: number; good: boolean; x: number; y: number } | null = null;
  if (m && activity.id === 'pushup') gauge = { label: 'Ellbogen', value: m[0], good: m[0] < 100, x: m[2], y: m[3] };
  if (m && activity.id === 'situp') gauge = { label: 'Hüfte', value: m[1], good: m[1] < 70, x: m[4], y: m[5] };

  return (
    <div className="overflow-hidden rounded-2xl bg-panel">
      <div className="relative aspect-video bg-[#1b1916]">
        <video ref={video} src={src} poster={g.poster} autoPlay loop muted playsInline disablePictureInPicture
          className="absolute inset-0 h-full w-full object-cover" />
        {gauge && (
          <>
            <span className="absolute h-7 w-7 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 transition-colors"
              style={{ left: `${gauge.x * 100}%`, top: `${gauge.y * 100}%`, borderColor: gauge.good ? '#FF6B35' : 'rgba(243,240,234,0.7)' }} />
            <div className="absolute left-3 top-3 rounded-lg bg-black/65 px-2.5 py-1 text-sm">
              <span className="text-white/70">{gauge.label} </span>
              <span className={`num font-semibold ${gauge.good ? 'text-neon' : 'text-white'}`}>{Math.round(gauge.value)}°</span>
            </div>
          </>
        )}
        {m && mode === 'sensor' && (
          <PhoneMark x={m[8]} y={m[9]} label="Handy auf die Brust" />
        )}
        {m && mode === 'nosetap' && (
          <PhoneMark x={m[6]} y={0.86} label="Handy unter das Gesicht" />
        )}
      </div>
      {mode === 'camera' && <CameraPlacement />}
    </div>
  );
}

function PhoneMark({ x, y, label }: { x: number; y: number; label: string }) {
  return (
    <div className="absolute -translate-x-1/2 -translate-y-1/2" style={{ left: `${x * 100}%`, top: `${y * 100}%` }}>
      <div className="h-3 w-7 rounded-[3px] border border-white/80 bg-black/70" />
      <div className="absolute left-1/2 top-4 -translate-x-1/2 whitespace-nowrap rounded-md bg-black/60 px-2 py-0.5 text-[11px] text-white">{label}</div>
    </div>
  );
}

/** Draufsicht: wo das Handy hin muss */
function CameraPlacement() {
  return (
    <div className="flex items-center gap-3 border-t border-line px-3 py-2.5">
      <svg viewBox="0 0 120 60" className="w-24 shrink-0" fill="none">
        <rect x="10" y="6" width="100" height="18" rx="3" fill="#2b2926" />
        <ellipse cx="58" cy="15" rx="34" ry="4.5" fill="#4a4743" />
        <circle cx="95" cy="15" r="4.5" fill="#9a958c" />
        <path d="M60 50L18 22M60 50L102 22" stroke="#FF6B35" strokeDasharray="3 2.5" strokeWidth="1" />
        <rect x="52" y="47" width="16" height="9" rx="2" fill="#0e0e0d" stroke="#f3f0ea" strokeWidth="1" />
        <text x="76" y="40" fontSize="8" fill="#9a958c">ca. 2 m</text>
      </svg>
      <p className="text-[13px] leading-snug text-mute">Draufsicht: Handy <b className="font-semibold text-ink">seitlich</b> neben dich, wie unten beschrieben.</p>
    </div>
  );
}

/** Foto der Übung für Kacheln und Listen */
export function GuideThumb({ activity, className = '' }: { activity: Activity; className?: string }) {
  const g = guideOf(activity.id);
  const [broken, setBroken] = useState(!g.has);
  // Fehlt das Foto (noch nicht gerendert), ruhige Fläche mit Anfangsbuchstaben statt kaputtem Bild-Symbol
  if (broken) return <div className={`grid place-items-center bg-raised font-display text-3xl text-mute/60 ${className}`} aria-hidden>{activity.name.slice(0, 1)}</div>;
  return <img src={g.poster} alt="" loading="lazy" decoding="async" onError={() => setBroken(true)} className={`object-cover ${className}`} />;
}
