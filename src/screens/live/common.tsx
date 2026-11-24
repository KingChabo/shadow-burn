import { useEffect, useRef, useState, type ReactNode } from 'react';
import { motion } from 'framer-motion';
import { Btn } from '../../components/ui';
import { Icon } from '../../components/Icon';
import { keepAwake } from '../../lib/fx';
import { fmtTime } from '../../lib/date';
import type { WorkoutInput } from '../../lib/game';

export type FinishFn = (w: WorkoutInput | null) => void;

/** Sekunden seit Start; pausierbar */
export function useStopwatch(running = true) {
  const [sec, setSec] = useState(0);
  const acc = useRef(0);
  const since = useRef<number | null>(running ? performance.now() : null);
  useEffect(() => {
    if (running && since.current === null) since.current = performance.now();
    if (!running && since.current !== null) { acc.current += (performance.now() - since.current) / 1000; since.current = null; }
  }, [running]);
  useEffect(() => {
    const id = setInterval(() => {
      setSec(acc.current + (since.current !== null ? (performance.now() - since.current) / 1000 : 0));
    }, 200);
    return () => clearInterval(id);
  }, []);
  return sec;
}

export function useWakeLock() {
  useEffect(() => {
    let release = () => {};
    keepAwake().then((r) => { release = r; });
    return () => release();
  }, []);
}

/**
 * Obere Leiste: Übung links, darunter klein die Gesamtzeit (oder ein anderer kurzer Text), rechts „Fertig“.
 * `overVideo`: über dem Kamerabild immer dunkel, sonst in der Farbe des Designs (hell oder dunkel).
 */
export function TopBar({ seconds, sub, onEnd, title, overVideo = false }: {
  seconds?: number; sub?: ReactNode; onEnd: () => void; title: string; overVideo?: boolean;
}) {
  return (
    <div className={`absolute top-0 inset-x-0 z-30 flex items-center justify-between px-4 pt-[max(env(safe-area-inset-top),12px)] pb-3 bg-gradient-to-b ${overVideo ? 'from-black/80 text-white' : 'from-bg via-bg/90'} to-transparent`}>
      <div className="min-w-0 leading-tight">
        <div className={`font-display text-lg truncate ${overVideo ? 'text-white/85' : 'text-ink/80'}`}>{title}</div>
        {sub !== undefined ? <div className="text-xs">{sub}</div>
          : seconds !== undefined && <div className={`num text-xs tabular-nums ${overVideo ? 'text-white/60' : 'text-mute'}`}>{fmtTime(seconds)}</div>}
      </div>
      <button onClick={onEnd} className={`shrink-0 rounded-xl border px-4 py-2 font-display ${overVideo ? 'bg-white/10 border-white/20' : 'bg-panel border-line'}`}>Fertig</button>
    </div>
  );
}

/** Schriftfarbe des aktuellen Designs (für Animationen, die keine CSS-Variablen können) */
export function inkColor() {
  return typeof document !== 'undefined' && document.documentElement.classList.contains('light') ? '#141210' : '#ffffff';
}

export function BigCount({ n, label, pulseKey }: { n: number; label: string; pulseKey?: number }) {
  return (
    <div className="text-center">
      <motion.div key={pulseKey} initial={{ scale: 1.35, color: '#FF6B35' }} animate={{ scale: 1, color: inkColor() }} transition={{ type: 'spring', stiffness: 400, damping: 15 }}
        className="font-display text-[9rem] leading-none tabular-nums text-ink">
        {n}
      </motion.div>
      <div className="text-mute text-sm">{label}</div>
    </div>
  );
}

/**
 * Beenden mit Auswahl: Speichern oder Löschen. Löschen ist für den Fall, dass nur ein Freund
 * die App ausprobiert hat – dann wird nichts gespeichert, es gibt keine Punkte und keine Streak.
 * `detail` ist der kurze Text zum Ergebnis, z. B. "12 Liegestütze · 1:05".
 */
export function useEnd(count: number, onFinish: FinishFn, build: () => WorkoutInput, detail: string) {
  const [open, setOpen] = useState(false);
  // Ergebnis beim Antippen von "Fertig" festhalten, damit beim Gang zum Handy nichts mehr dazukommt
  const snap = useRef<{ w: WorkoutInput; count: number; detail: string } | null>(null);
  const end = () => { snap.current = { w: build(), count, detail }; setOpen(true); };
  const sheet = (
    <EndSheet open={open} count={snap.current?.count ?? count} detail={snap.current?.detail ?? detail}
      onSave={() => snap.current && onFinish(snap.current.w)}
      onDelete={() => onFinish(null)}
      onResume={() => setOpen(false)} />
  );
  return { end, sheet, open };
}

export function EndSheet({ open, count, detail, onSave, onDelete, onResume }: {
  open: boolean; count: number; detail: string; onSave: () => void; onDelete: () => void; onResume: () => void;
}) {
  const [sure, setSure] = useState(false);
  useEffect(() => { if (!open) setSure(false); }, [open]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[60] flex items-end bg-black/70" onClick={onResume}>
      <motion.div initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ duration: 0.18 }}
        onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Training beenden"
        className="w-full max-w-lg mx-auto rounded-t-3xl bg-panel px-4 pt-5 pb-[max(env(safe-area-inset-bottom),16px)] space-y-3">
        {!sure ? (
          <>
            <div className="text-center">
              <div className="font-display text-2xl">Training beenden</div>
              <div className="mt-1 text-sm text-mute">{count > 0 ? detail : 'Noch nichts gezählt.'}</div>
            </div>
            <Btn className="w-full" disabled={count <= 0} onClick={onSave}>Speichern</Btn>
            <Btn kind="danger" className="w-full" onClick={() => (count > 0 ? setSure(true) : onDelete())}>
              <span className="flex items-center justify-center gap-2"><Icon name="trash" className="h-5 w-5" /> Löschen</span>
            </Btn>
            <button onClick={onResume} className="w-full py-2 text-sm text-mute underline">Weitermachen</button>
          </>
        ) : (
          <>
            <div className="text-center">
              <div className="font-display text-2xl">Wirklich löschen?</div>
              <div className="mt-1 text-sm text-mute">{detail} wird nicht gespeichert. Keine Punkte, keine Streak, nichts in der Statistik. Praktisch, wenn nur jemand anderes ausprobiert hat.</div>
            </div>
            <Btn kind="danger" className="w-full" onClick={onDelete}>Ja, löschen</Btn>
            <Btn kind="ghost" className="w-full" onClick={() => setSure(false)}>Zurück</Btn>
          </>
        )}
      </motion.div>
    </div>
  );
}
