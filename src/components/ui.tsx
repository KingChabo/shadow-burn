import { motion, animate, useMotionValue, useTransform } from 'framer-motion';
import { useEffect, type ReactNode } from 'react';
import { flameTier } from '../lib/streak';
import { useBack } from '../lib/back';

export function Flame({ days, size = 140 }: { days: number; size?: number }) {
  const tier = flameTier(days);
  const grow = 0.75 + Math.min(days, 100) / 100 * 0.5;
  const s = size * (days === 0 ? 0.7 : grow);
  return (
    <div className="relative grid place-items-center" style={{ width: size * 1.25, height: size * 1.25 }}>
      <motion.svg
        viewBox="0 0 100 120" width={s} height={s * 1.2}
        animate={{ scaleY: [1, 1.03, 0.99, 1.02, 1], scaleX: [1, 0.99, 1.01, 0.995, 1] }}
        transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
        style={{ originY: 1, filter: days ? 'none' : 'grayscale(1)', opacity: days ? 1 : 0.4 }}
      >
        <path d="M50 4C58 28 86 44 86 76a36 36 0 0 1-72 0c0-16 8-26 16-34 0 12 6 20 12 22C40 46 40 22 50 4Z" fill={tier.outer} />
        <path d="M50 46c4 14 20 22 20 40a20 20 0 0 1-40 0c0-10 6-16 10-20 0 8 4 12 8 12-2-12 0-22 2-32Z" fill={tier.core} />
      </motion.svg>
    </div>
  );
}

export function CountUp({ to, duration = 1.2, className }: { to: number; duration?: number; className?: string }) {
  const v = useMotionValue(0);
  const r = useTransform(v, (x) => Math.round(x).toLocaleString('de-DE'));
  useEffect(() => { const c = animate(v, to, { duration, ease: 'easeOut' }); return () => c.stop(); }, [to, duration, v]);
  return <motion.span className={className}>{r}</motion.span>;
}

export function GemIcon({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className}>
      <path d="M6 3h12l4 6-10 12L2 9z" fill="#9C86F0" />
      <path d="M2 9h20M8 3l4 18M16 3l-4 18M6 3l2 6M18 3l-2 6" stroke="#d9cffc" strokeWidth="0.8" fill="none" opacity="0.7" />
    </svg>
  );
}

export function Btn({ children, onClick, kind = 'primary', className = '', disabled }: {
  children: ReactNode; onClick?: () => void; kind?: 'primary' | 'ghost' | 'danger' | 'gem'; className?: string; disabled?: boolean;
}) {
  const styles = {
    primary: 'bg-hot active:brightness-95',
    ghost: 'bg-raised text-ink border border-line',
    danger: 'bg-transparent text-bad border border-bad/40',
    gem: 'bg-gem text-[#130d26]',
  }[kind];
  return (
    <motion.button
      whileTap={{ scale: disabled ? 1 : 0.98 }}
      onClick={disabled ? undefined : onClick}
      className={`rounded-2xl px-5 py-4 text-[17px] font-semibold tracking-[-0.01em] ${styles} ${disabled ? 'opacity-40' : ''} ${className}`}
    >
      {children}
    </motion.button>
  );
}

export function Card({ children, className = '', tour }: { children: ReactNode; className?: string; /** Ziel für die Einführungs-Tour */ tour?: string }) {
  return <div data-tour={tour} className={`rounded-3xl bg-panel p-4 shadow-card ${className}`}>{children}</div>;
}

export function Header({ title, onBack, right }: { title: string; onBack?: () => void; right?: ReactNode }) {
  // Android-Zurück-Taste macht dasselbe wie der Pfeil oben links
  useBack(!!onBack, () => onBack?.());
  return (
    <div className="sticky top-0 z-20 flex items-center gap-2 px-4 pt-[max(env(safe-area-inset-top),12px)] pb-3 bg-bg">
      {onBack && (
        <button onClick={onBack} className="w-10 h-10 -ml-2 grid place-items-center rounded-full active:bg-panel" aria-label="Zurück">
          <svg viewBox="0 0 24 24" className="w-6 h-6"><path d="M15 5l-7 7 7 7" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" /></svg>
        </button>
      )}
      <h1 className="font-sport text-[30px] leading-none flex-1 truncate">{title}</h1>
      {right}
    </div>
  );
}

export function Particles({ color = '#FF6B35', count = 14 }: { color?: string; count?: number }) {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      {Array.from({ length: count }).map((_, i) => {
        const x = (Math.random() - 0.5) * 320, y = -Math.random() * 300 - 60;
        const colors = [color, '#f3f0ea'];
        return (
          <motion.span key={i} className="absolute left-1/2 top-1/2 w-1.5 h-1.5 rounded-full"
            style={{ background: colors[i % colors.length] }}
            initial={{ x: 0, y: 0, opacity: 1, rotate: 0 }}
            animate={{ x, y: [0, y, y + 380], opacity: [1, 1, 0], rotate: 540 }}
            transition={{ duration: 2.2 + Math.random(), ease: 'easeOut' }} />
        );
      })}
    </div>
  );
}

/** Umschalter mit 2-4 Optionen (ersetzt Links und Extra-Seiten) */
export function Segmented<T extends string>({ value, options, onChange, className = '' }: {
  value: T; options: { id: T; label: ReactNode }[]; onChange: (v: T) => void; className?: string;
}) {
  return (
    <div className={`flex gap-1 rounded-full bg-panel p-1 shadow-card ${className}`} role="tablist">
      {options.map((o) => (
        <button key={o.id} role="tab" aria-selected={value === o.id} onClick={() => onChange(o.id)}
          className={`flex-1 rounded-full py-2 text-sm font-semibold transition-colors ${value === o.id ? 'bg-ink text-bg' : 'text-mute'}`}>{o.label}</button>
      ))}
    </div>
  );
}
