import * as tf from '@tensorflow/tfjs-core';
import '@tensorflow/tfjs-backend-webgl';
import { loadGraphModel, type GraphModel } from '@tensorflow/tfjs-converter';
import type { Keypoint } from './counters';

let model: GraphModel | null = null;
let loading: Promise<GraphModel> | null = null;
const SIZE = 192;

/** Lädt MoveNet Lightning aus den lokal gebündelten Dateien (offline, precached). */
export function loadMoveNet(): Promise<GraphModel> {
  if (model) return Promise.resolve(model);
  if (!loading) {
    loading = (async () => {
      try { await tf.setBackend('webgl'); } catch { /* fällt auf Standard zurück */ }
      await tf.ready();
      const m = await loadGraphModel(`${import.meta.env.BASE_URL}models/movenet/model.json`);
      // Aufwärmen, damit der erste echte Frame nicht ruckelt
      tf.tidy(() => { m.execute(tf.zeros([1, SIZE, SIZE, 3], 'int32')); });
      model = m;
      return m;
    })();
    loading.catch(() => { loading = null; });
  }
  return loading;
}

/** Für andere Module: Modell im Hintergrund vorladen, ohne TF.js in den Haupt-Bundle zu ziehen */
export const preload = () => loadMoveNet().catch(() => {});

/**
 * Ausschnitt (quadratisch, in Video-Pixeln), auf den das Modell schaut.
 * MoveNet sieht nur 192×192 Pixel. Liegt man z. B. beim Liegestütz klein und quer im Bild,
 * bleiben für den Körper nur wenige Pixel übrig. Deshalb schneiden wir, sobald jemand erkannt
 * ist, großzügig um die Person herum aus (wie es die MoveNet-Macher empfehlen).
 */
type Box = { x: number; y: number; size: number };
let lastBox: Box | null = null;

/** Beim Kamerawechsel oder Neustart wieder das ganze Bild nehmen */
export function resetTracking() { lastBox = null; }

/** Neuer Ausschnitt aus den erkannten Punkten (oder null = ganzes Bild) */
export function cropAround(k: Keypoint[], W: number, H: number): Box | null {
  const pts = k.filter((p) => p.score >= 0.3);
  if (pts.length < 5) return null;
  const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  const full = Math.max(W, H);
  // Viel Rand lassen: Arme und Beine, die gerade nicht erkannt sind, sollen trotzdem drin sein
  const size = Math.min(full, Math.max(full * 0.5, Math.max(maxX - minX, maxY - minY) * 1.9));
  if (size >= full * 0.95) return null;
  return { x: (minX + maxX) / 2 - size / 2, y: (minY + maxY) / 2 - size / 2, size };
}

/** Keypoints in Pixeln des Videos. Der Ausschnitt ist quadratisch und wird bei Bedarf schwarz aufgefüllt, damit nichts verzerrt. */
export async function estimate(video: HTMLVideoElement): Promise<Keypoint[] | null> {
  if (!model || video.readyState < 2 || !video.videoWidth) return null;
  const W = video.videoWidth, H = video.videoHeight;
  const full = Math.max(W, H);
  const box: Box = lastBox ?? { x: (W - full) / 2, y: (H - full) / 2, size: full };
  const out = tf.tidy(() => {
    const img = tf.expandDims(tf.cast(tf.browser.fromPixels(video), 'float32'), 0) as tf.Tensor4D;
    const crop = tf.image.cropAndResize(img, [[box.y / H, box.x / W, (box.y + box.size) / H, (box.x + box.size) / W]], [0], [SIZE, SIZE], 'bilinear', 0);
    return model!.execute(tf.cast(crop, 'int32')) as tf.Tensor;
  });
  const data = await out.data();
  out.dispose();
  const kps: Keypoint[] = [];
  for (let i = 0; i < 17; i++) {
    const y = data[i * 3], x = data[i * 3 + 1], score = data[i * 3 + 2];
    kps.push({ x: box.x + x * box.size, y: box.y + y * box.size, score });
  }
  lastBox = cropAround(kps, W, H);
  return kps;
}
