import { APP_NAME } from '../lib/brand';
import { useEffect, useRef, useState } from 'react';
import jsQR from 'jsqr';

/**
 * Liest QR-Codes mit der Rückkamera. Läuft komplett auf dem Handy (jsQR),
 * kein Internet nötig. Ruft`onResult` einmal mit dem gelesenen Text auf.
 */
export function QrScanner({ onResult, onError, continuous }: {
  onResult: (text: string) => void; onError: (msg: string) => void;
  /** weiterscannen statt nach dem ersten Code aufzuhören (für den animierten Blog-Code) */
  continuous?: boolean;
}) {
  const video = useRef<HTMLVideoElement>(null);
  const [ready, setReady] = useState(false);
  const done = useRef(false);
  const cb = useRef({ onResult, onError, continuous });
  cb.current = { onResult, onError, continuous };

  useEffect(() => {
    let stream: MediaStream | null = null;
    let stopped = false;
    let timer = 0;
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d', { willReadFrequently: true });

    const tick = () => {
      if (stopped || done.current) return;
      const v = video.current;
      if (v && ctx && v.readyState >= 2 && v.videoWidth) {
        // verkleinert scannen: schneller und reicht für Handy-zu-Handy
        const scale = Math.min(1, 640 / Math.max(v.videoWidth, v.videoHeight));
        canvas.width = Math.round(v.videoWidth * scale);
        canvas.height = Math.round(v.videoHeight * scale);
        ctx.drawImage(v, 0, 0, canvas.width, canvas.height);
        const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const code = jsQR(img.data, img.width, img.height, { inversionAttempts: 'dontInvert' });
        if (code?.data) {
          if (!cb.current.continuous) {
            done.current = true;
            cb.current.onResult(code.data);
            return;
          }
          cb.current.onResult(code.data);
        }
      }
      // Beim animierten Code schneller nachsehen, damit kein Bild verpasst wird
      timer = window.setTimeout(tick, cb.current.continuous ? 60 : 150);
    };

    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false });
        if (stopped) { stream.getTracks().forEach((t) => t.stop()); return; }
        const v = video.current!;
        v.srcObject = stream;
        await v.play();
        setReady(true);
        tick();
      } catch {
        cb.current.onError(`Kamera nicht verfügbar. Bitte Kamera-Zugriff für ${APP_NAME} erlauben.`);
      }
    })();

    return () => {
      stopped = true;
      window.clearTimeout(timer);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  return (
    <div className="relative w-full aspect-square rounded-2xl overflow-hidden bg-black">
      <video ref={video} playsInline muted className="absolute inset-0 w-full h-full object-cover" />
      <div className="absolute inset-[12%] rounded-2xl border-2 border-white/80 shadow-[0_0_0_999px_rgba(0,0,0,0.35)]" />
      {!ready && <div className="absolute inset-0 grid place-items-center text-mute text-sm">Kamera startet …</div>}
    </div>
  );
}
