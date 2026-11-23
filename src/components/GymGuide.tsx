import { useEffect, useState } from 'react';
import type { GymExercise } from '../data/gym';

/**
 * Vormach-Video einer Geräteübung: public/guides/<gym-id>.mp4 (+ .jpg als Standbild).
 * Fehlt die Datei (noch nicht gerendert, eigene Übung), wird gar nichts angezeigt.
 */
export function GymGuide({ exercise }: { exercise: GymExercise }) {
  const base = import.meta.env.BASE_URL;
  const [src, setSrc] = useState<string | null>(null);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    setSrc(null);
    setMissing(false);
    if (exercise.custom) { setMissing(true); return; }
    let alive = true;
    let obj: string | undefined;
    // Als Blob laden, damit es offline aus dem Service-Worker-Cache läuft.
    // Der Typ-Check fängt ab, dass der Server bei fehlender Datei index.html schickt.
    fetch(`${base}guides/${exercise.id}.mp4`)
      .then((r) => (r.ok && (r.headers.get('content-type') ?? '').startsWith('video/') ? r.blob() : Promise.reject(new Error('fehlt'))))
      .then((b) => { if (alive) { obj = URL.createObjectURL(b); setSrc(obj); } })
      .catch(() => { if (alive) setMissing(true); });
    return () => { alive = false; if (obj) URL.revokeObjectURL(obj); };
  }, [exercise.id, exercise.custom, base]);

  if (missing) return null;
  return (
    <div className="relative aspect-video overflow-hidden rounded-2xl bg-[#1b1916]">
      {src && (
        <video src={src} poster={`${base}guides/${exercise.id}.jpg`} autoPlay loop muted playsInline disablePictureInPicture
          onError={() => setMissing(true)} className="absolute inset-0 h-full w-full object-cover" />
      )}
      <span className="absolute left-3 top-3 rounded-lg bg-black/65 px-2.5 py-1 text-xs text-white">So geht's</span>
    </div>
  );
}
