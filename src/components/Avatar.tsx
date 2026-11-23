import { useEffect, useState } from 'react';
import { bodyStage, ITEM, SLOTS, type AvatarLook, type Slot } from '../lib/avatar';
import { AvatarFigure } from './AvatarFigure';

/**
 * Avatar anzeigen. Liegen gerenderte 3D-Bilder unter public/avatar/ (manifest.json),
 * werden diese als Ebenen übereinandergelegt. Sonst zeichnet die App die Figur selbst (SVG).
 */

interface Manifest {
  stages: number;
  size?: [number, number];
  /** Ebenen-Reihenfolge von hinten nach vorne, z. B. ["body","bottom","shoes","top","head"] */
  layers: string[];
  items: Record<string, { slot: Slot }>;
}

let manifestPromise: Promise<Manifest | null> | null = null;
function loadManifest(): Promise<Manifest | null> {
  if (!manifestPromise) {
    const base = import.meta.env.BASE_URL ?? '/';
    manifestPromise = fetch(`${base}avatar/manifest.json`)
      .then((r) => (r.ok ? r.json() : null))
      .then((m) => (m && Array.isArray(m.layers) && typeof m.stages === 'number' ? (m as Manifest) : null))
      .catch(() => null);
  }
  return manifestPromise;
}

export function Avatar({ look, level, className = 'h-64 w-32', preview, animate }: {
  look: AvatarLook; level: number; className?: string; preview?: Partial<Record<Slot, string | null>>; animate?: boolean;
}) {
  const [manifest, setManifest] = useState<Manifest | null>(null);
  const [broken, setBroken] = useState(false);
  useEffect(() => { let on = true; void loadManifest().then((m) => { if (on) setManifest(m); }); return () => { on = false; }; }, []);

  if (!manifest || broken) return <AvatarFigure look={look} level={level} className={className} preview={preview} animate={animate} />;

  const stage = Math.min(manifest.stages - 1, bodyStage(level));
  const base = import.meta.env.BASE_URL ?? '/';
  const worn: Partial<Record<Slot, string>> = {};
  for (const s of SLOTS) {
    const id = preview && s in preview ? preview[s] : look.equipped[s];
    if (id && ITEM[id] && manifest.items[id]) worn[s] = id;
  }
  const files = manifest.layers.flatMap((layer) => {
    if (layer === 'body') return [`body_s${stage}.png`];
    const id = worn[layer as Slot];
    return id ? [`${id}_s${stage}.png`] : [];
  });
  return (
    <div className={`relative ${className}`}>
      {files.map((f) => (
        <img key={f} src={`${base}avatar/${f}`} alt="" draggable={false} onError={() => setBroken(true)}
          className="pointer-events-none absolute inset-0 h-full w-full object-contain" />
      ))}
    </div>
  );
}
