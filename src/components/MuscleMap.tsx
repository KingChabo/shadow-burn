import { useEffect, useRef } from 'react';
import { MUSCLE_NAMES, type MuscleId } from '../data/activities';
import { useGame } from '../lib/store';

/**
 * Realistische Muskelkarte: gerenderter Mensch (vorn/hinten, blender/shadowburn_muscles.py)
 * plus ID-Karte, in der jeder Muskel einen eigenen Grauwert hat. Hier werden die trainierten
 * Muskeln direkt auf der Haut eingefärbt – die Schattierung des Körpers bleibt erhalten.
 */
// Reihenfolge wie in blender/shadowburn_muscles.py: je 3 Muskeln pro Maskenbild (Kanal R, G, B)
const ORDER: MuscleId[] = ['chest', 'shoulders', 'triceps', 'biceps', 'forearms', 'abs', 'obliques', 'hipflexors', 'quads',
  'hamstrings', 'glutes', 'calves', 'lats', 'traps', 'lowerback'];

const PRIMARY = [255, 107, 53];
const SECONDARY = [143, 163, 184];

const cache = new Map<string, Promise<HTMLImageElement>>();
function loadImage(url: string) {
  if (!cache.has(url)) {
    cache.set(url, new Promise((res, rej) => {
      const i = new Image();
      i.onload = () => res(i);
      i.onerror = rej;
      i.src = url;
    }));
  }
  return cache.get(url)!;
}

/** Bild in Zielgröße zeichnen und Pixel lesen (Masken sind halb so groß und werden weich hochskaliert) */
function pixels(img: HTMLImageElement, w: number, h: number) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const x = c.getContext('2d', { willReadFrequently: true })!;
  x.imageSmoothingQuality = 'high';
  x.drawImage(img, 0, 0, w, h);
  return x.getImageData(0, 0, w, h);
}

const smooth = (v: number) => { const t = Math.min(1, Math.max(0, (v - 150) / 65)); return t * t * (3 - 2 * t); };

/** Bilder für Frau liegen in muscles/female/ (gleiches Format). Fehlen sie, wird der Mann gezeigt. */
function loadSet(dir: string, view: 'front' | 'back', packs: number[]) {
  return Promise.all([loadImage(`${dir}body_${view}.webp`), ...packs.map((k) => loadImage(`${dir}mask_${view}_${k}.webp`))]);
}

/** Welcher Muskel liegt an welchem Pixel? (für langes Drücken auf die Figur) */
const hitCache = new Map<string, Promise<{ w: number; h: number; who: Int8Array }>>();
function hitMap(dir: string, view: 'front' | 'back') {
  const key = dir + view;
  if (!hitCache.has(key)) {
    hitCache.set(key, loadSet(dir, view, [0, 1, 2, 3, 4]).then(([body, ...masks]) => {
      const w = body.naturalWidth >> 1, h = body.naturalHeight >> 1; // halbe Größe reicht
      const md = masks.map((m) => pixels(m, w, h).data);
      const who = new Int8Array(w * h).fill(-1), best = new Uint8Array(w * h);
      ORDER.forEach((_, idx) => {
        const d = md[Math.floor(idx / 3)], ch = idx % 3;
        for (let i = 0; i < w * h; i++) { const v = d[i * 4 + ch]; if (v > 150 && v > best[i]) { best[i] = v; who[i] = idx; } }
      });
      return { w, h, who };
    }));
  }
  return hitCache.get(key)!;
}

/** Ein Muskel in einer Farbe einfärben, k = Deckkraft 0–1 */
export type Paint = { muscle: MuscleId; rgb: number[]; k: number };

function BodyView({ view, paint, sex, className = 'h-64 w-auto', onHold }: { view: 'front' | 'back'; paint: Paint[]; sex: 'm' | 'f'; className?: string; onHold?: (m: MuscleId) => void }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const timer = useRef<number | null>(null);
  const dirOf = () => `${import.meta.env.BASE_URL}muscles/${sex === 'f' ? 'female/' : ''}`;
  /** Langes Drücken (0,45 s): Muskel unter dem Finger suchen. Wackelt der Finger mehr als 10 px, zählt es als Scrollen. */
  const down = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!onHold) return;
    const cv = e.currentTarget, r = cv.getBoundingClientRect();
    const fx = (e.clientX - r.left) / r.width, fy = (e.clientY - r.top) / r.height;
    const sx = e.clientX, sy = e.clientY;
    const cancel = () => { if (timer.current) window.clearTimeout(timer.current); timer.current = null; window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', cancel); };
    const move = (m: PointerEvent) => { if (Math.hypot(m.clientX - sx, m.clientY - sy) > 10) cancel(); };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', cancel);
    timer.current = window.setTimeout(() => {
      cancel();
      void hitMap(dirOf(), view).catch(() => hitMap(`${import.meta.env.BASE_URL}muscles/`, view)).then(({ w, h, who }) => {
        // in der Nähe suchen, falls der Finger knapp neben einem Muskel liegt
        const cx = Math.round(fx * w), cy = Math.round(fy * h);
        for (let rad = 0; rad <= 12; rad += 3) {
          for (let dy = -rad; dy <= rad; dy += 3) for (let dx = -rad; dx <= rad; dx += 3) {
            const x = cx + dx, y = cy + dy;
            if (x < 0 || y < 0 || x >= w || y >= h) continue;
            const idx = who[y * w + x];
            if (idx >= 0) { navigator.vibrate?.(30); onHold(ORDER[idx]); return; }
          }
        }
      });
    }, 450);
  };
  const key = paint.map((p) => `${p.muscle}:${p.rgb.join(',')}:${p.k.toFixed(2)}`).join('|');

  useEffect(() => {
    let alive = true;
    const base = import.meta.env.BASE_URL;
    const packs = [...new Set(paint.map((p) => Math.floor(ORDER.indexOf(p.muscle) / 3)))];
    const male = `${base}muscles/`;
    (sex === 'f' ? loadSet(`${male}female/`, view, packs).catch(() => loadSet(male, view, packs)) : loadSet(male, view, packs)).then(([body, ...masks]) => {
      if (!alive || !canvas.current) return;
      const w = body.naturalWidth, h = body.naturalHeight;
      const img = pixels(body, w, h);
      const md = masks.map((m) => pixels(m, w, h).data);
      // Je Pixel gewinnt der Muskel mit dem stärksten Maskenwert, so bleiben die Grenzen sauber
      const best = new Float32Array(w * h), who = new Int16Array(w * h).fill(-1);
      paint.forEach((p, n) => {
        const idx = ORDER.indexOf(p.muscle), d = md[packs.indexOf(Math.floor(idx / 3))], ch = idx % 3;
        for (let i = 0; i < w * h; i++) { const v = smooth(d[i * 4 + ch]); if (v > best[i]) { best[i] = v; who[i] = n; } }
      });
      const d = img.data;
      for (let i = 0; i < w * h; i++) {
        if (d[i * 4 + 3] === 0 || who[i] < 0) { if (d[i * 4 + 3]) { const grey = (d[i * 4] + d[i * 4 + 1] + d[i * 4 + 2]) / 3; for (let c = 0; c < 3; c++) d[i * 4 + c] = d[i * 4 + c] * 0.6 + grey * 0.4; } continue; }
        const p = paint[who[i]];
        const r = d[i * 4], g = d[i * 4 + 1], b = d[i * 4 + 2];
        const grey = (r + g + b) / 3, lum = grey / 255;
        const k = best[i] * p.k;
        for (let c = 0; c < 3; c++) {
          const base = d[i * 4 + c] * 0.6 + grey * 0.4; // Haut leicht entsättigt, damit die Muskeln hervortreten
          const t = Math.min(255, p.rgb[c] * (0.22 + lum * 1.1));
          d[i * 4 + c] = base * (1 - k) + t * k;
        }
      }
      const cv = canvas.current;
      cv.width = w;
      cv.height = h;
      cv.getContext('2d')!.putImageData(img, 0, 0);
    }).catch(() => {});
    return () => { alive = false; };
  }, [view, key, sex]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <figure className="flex flex-col items-center">
      <canvas ref={canvas} className={`${className} ${onHold ? 'touch-pan-y' : ''}`} aria-label={view === 'front' ? 'Körper von vorn' : 'Körper von hinten'}
        onPointerDown={down} onContextMenu={(e) => onHold && e.preventDefault()} />
    </figure>
  );
}

/** Ganzer Körper vorn + hinten mit beliebigen Farben je Muskel (Startbildschirm) */
export function BodyPaint({ paint, className, onHold }: { paint: Paint[]; className?: string; onHold?: (m: MuscleId) => void }) {
  const sex = useGame().settings.sex ?? 'm';
  return (
    <div className="flex justify-center gap-1 bg-[radial-gradient(ellipse_at_center,rgb(var(--raised))_0%,transparent_70%)]">
      <BodyView view="front" paint={paint} sex={sex} className={className} onHold={onHold} />
      <BodyView view="back" paint={paint} sex={sex} className={className} onHold={onHold} />
    </div>
  );
}

export function MuscleMap({ primary, secondary }: { primary: MuscleId[]; secondary: MuscleId[] }) {
  return (
    <div className="rounded-2xl bg-panel p-3">
      <BodyPaint paint={[...primary.map((m) => ({ muscle: m, rgb: PRIMARY, k: 0.9 })), ...secondary.filter((m) => !primary.includes(m)).map((m) => ({ muscle: m, rgb: SECONDARY, k: 0.8 }))]} />
      <div className="mt-2 flex flex-wrap gap-1.5">
        {primary.map((m) => (
          <span key={m} className="rounded-full bg-neon/15 px-2.5 py-1 text-xs font-medium text-neon">{MUSCLE_NAMES[m]}</span>
        ))}
        {secondary.map((m) => (
          <span key={m} className="rounded-full bg-volt/15 px-2.5 py-1 text-xs text-volt">{MUSCLE_NAMES[m]}</span>
        ))}
      </div>
    </div>
  );
}
