import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useId, useRef, useState } from 'react';
import { THEMES, nextTheme, type Theme } from '../lib/themes';
import { Particles } from './ui';
import { useBack } from '../lib/back';

/* ------------------------------------------------------------------ */
/* Hilfen                                                              */
/* ------------------------------------------------------------------ */

const STYLE_ID = 'sb-level-badge-css';
const CSS = `
@keyframes lb-pulse { 0%,100% { filter: var(--lb-glow-a); } 50% { filter: var(--lb-glow-b); } }
@keyframes lb-shine { 0% { transform: translateX(-90px); } 45%,100% { transform: translateX(150px); } }
@keyframes lb-spin { to { transform: rotate(360deg); } }
@keyframes lb-spin-rev { to { transform: rotate(-360deg); } }
@keyframes lb-spark { 0% { transform: translateY(0) scale(.6); opacity: 0; } 15% { opacity: 1; } 100% { transform: translateY(-34px) scale(1.1); opacity: 0; } }
@keyframes lb-twinkle { 0%,100% { opacity: .25; } 50% { opacity: 1; } }
.lb-pulse { animation: lb-pulse 2.4s ease-in-out infinite; }
.lb-shine { animation: lb-shine 3.6s ease-in-out infinite; }
.lb-spin { transform-origin: 50px 50px; animation: lb-spin 14s linear infinite; }
.lb-spin-rev { transform-origin: 50px 50px; animation: lb-spin-rev 22s linear infinite; }
.lb-spark { transform-box: fill-box; transform-origin: center; animation: lb-spark 2.6s ease-out infinite; opacity: 0; }
.lb-twinkle { animation: lb-twinkle 1.8s ease-in-out infinite; }
@media (prefers-reduced-motion: reduce) {
  .lb-pulse, .lb-shine, .lb-spin, .lb-spin-rev, .lb-spark, .lb-twinkle { animation: none !important; }
  .lb-shine { opacity: 0; }
  .lb-spark { opacity: .7; }
}
.lb-still .lb-pulse, .lb-still .lb-shine, .lb-still .lb-spin, .lb-still .lb-spin-rev, .lb-still .lb-spark, .lb-still .lb-twinkle,
.lb-still.lb-pulse { animation: none !important; }
.lb-still .lb-shine { opacity: 0; }
.lb-still .lb-spark { opacity: .6; }
`;

function ensureStyles() {
  if (typeof document === 'undefined' || document.getElementById(STYLE_ID)) return;
  const el = document.createElement('style');
  el.id = STYLE_ID;
  el.textContent = CSS;
  document.head.appendChild(el);
}

function hexRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function rgba(hex: string, a: number) {
  const [r, g, b] = hexRgb(hex);
  return `rgba(${r},${g},${b},${a})`;
}
function luminance(hex: string) {
  const [r, g, b] = hexRgb(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** 0 (Level 1) … 10 (Level 50): steuert, wie üppig das Abzeichen ausfällt. */
function tierOf(theme: Theme) {
  const i = THEMES.findIndex((t) => t.id === theme.id);
  return i >= 0 ? i : Math.min(10, Math.floor(theme.level / 5));
}

function poly(points: [number, number][]) {
  return 'M' + points.map(([x, y]) => `${x.toFixed(2)} ${y.toFixed(2)}`).join('L') + 'Z';
}
function starPath(n: number, outer: number, inner: number, cx = 50, cy = 50, rot = -90) {
  const pts: [number, number][] = [];
  for (let i = 0; i < n * 2; i++) {
    const r = i % 2 === 0 ? outer : inner;
    const a = ((rot + (i * 180) / n) * Math.PI) / 180;
    pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
  }
  return poly(pts);
}

type Shape = Theme['shape'];

interface ShapeDef {
  /** Hauptform (in 0..100) */
  d: string;
  /** Mittelpunkt + Schriftgröße der Zahl */
  tx: number; ty: number; fs: number;
  /** Innenrand: Skalierung um (cx, cy) */
  cx: number; cy: number; inset: number;
}

const SHAPES: Record<Shape, ShapeDef> = {
  circle: { d: 'M50 8a42 42 0 1 1 0 84a42 42 0 1 1 0-84Z', tx: 50, ty: 50, fs: 40, cx: 50, cy: 50, inset: 0.86 },
  hex: {
    d: poly(Array.from({ length: 6 }, (_, i) => {
      const a = ((-90 + i * 60) * Math.PI) / 180;
      return [50 + 45 * Math.cos(a), 50 + 45 * Math.sin(a)] as [number, number];
    })),
    tx: 50, ty: 50, fs: 38, cx: 50, cy: 50, inset: 0.84,
  },
  shield: {
    d: 'M50 5 C62 11 76 13 89 13 V46 C89 70 72 87 50 96 C28 87 11 70 11 46 V13 C24 13 38 11 50 5Z',
    tx: 50, ty: 49, fs: 38, cx: 50, cy: 50, inset: 0.85,
  },
  star: { d: starPath(10, 47, 38), tx: 50, ty: 50, fs: 36, cx: 50, cy: 50, inset: 0.82 },
  diamond: {
    d: 'M50 3 L95 50 L50 97 L5 50 Z',
    tx: 50, ty: 50, fs: 34, cx: 50, cy: 50, inset: 0.82,
  },
  crown: {
    d: 'M8 30 L29 48 L50 14 L71 48 L92 30 L84 88 Q50 95 16 88 Z',
    tx: 50, ty: 66, fs: 32, cx: 50, cy: 62, inset: 0.84,
  },
  flame: {
    d: 'M50 3 C55 20 70 30 79 44 C88 58 89 71 85 80 C79 92 66 97 50 97 C34 97 21 92 15 80 C10 70 12 56 22 44 C24 54 29 58 34 59 C30 40 38 20 50 3 Z',
    tx: 50, ty: 72, fs: 32, cx: 50, cy: 72, inset: 0.82,
  },
  wings: { d: 'M50 22a30 30 0 1 1 0 60a30 30 0 1 1 0-60Z', tx: 50, ty: 52, fs: 30, cx: 50, cy: 52, inset: 0.84 },
};

/** Linker Flügel (wird gespiegelt) – geschichtete Federn */
const WING_L = [
  'M24 40 C16 30 8 22 0 10 C2 24 6 34 14 42 Z',
  'M22 50 C12 46 4 40 -2 30 C0 42 6 50 16 56 Z',
  'M22 60 C14 60 6 58 0 52 C4 62 10 68 20 70 Z',
  'M25 69 C18 72 12 74 6 73 C11 79 18 81 27 78 Z',
];

/* ------------------------------------------------------------------ */
/* LevelBadge                                                          */
/* ------------------------------------------------------------------ */

/** Level-Abzeichen: Zahl in einem Emblem im Stil des Themes. Langer Druck (~500 ms) ruft onLongPress auf. */
export function LevelBadge(props: {
  level: number; theme: Theme; size?: number; onLongPress?: () => void; className?: string;
  /** Ohne Animation (z. B. gesperrte Vorschau) */
  still?: boolean;
}): JSX.Element {
  const { level, theme, size = 64, onLongPress, className = '', still } = props;
  ensureStyles();
  const uid = 'lb' + useId().replace(/[^a-zA-Z0-9]/g, '');
  const [pressed, setPressed] = useState(false);
  const timer = useRef<number | null>(null);

  const cancel = () => {
    if (timer.current != null) window.clearTimeout(timer.current);
    timer.current = null;
    setPressed(false);
  };
  useEffect(() => cancel, []);

  const tier = tierOf(theme);
  const shape = SHAPES[theme.shape];
  const g = theme.gradient.length >= 2 ? theme.gradient : [theme.gradient[0] ?? theme.accent, theme.gradient[0] ?? theme.accent];
  const mid = g[Math.floor((g.length - 1) / 2)];
  const lightBody = (luminance(g[0]) + luminance(mid)) / 2 > 0.45 && luminance(mid) > 0.35;
  const textFill = lightBody ? theme.onAccent : '#ffffff';

  const digits = String(Math.max(0, Math.floor(level))).length;
  const fs = shape.fs * (digits >= 3 ? 0.74 : digits === 2 ? 1 : 1.08) * (theme.shape === 'wings' && digits >= 3 ? 0.92 : 1);

  // Glow: wächst mit dem Tier. Level 1 = kaum, Level 50 = kräftig.
  const glowR = (0.03 + tier * 0.022) * size;
  const glowA = Math.min(0.95, 0.25 + tier * 0.07);
  const glowA2 = `drop-shadow(0 0 ${glowR.toFixed(1)}px ${rgba(theme.glow, glowA)})`;
  const glowB2 = `drop-shadow(0 0 ${(glowR * 1.9).toFixed(1)}px ${rgba(theme.glow, Math.min(1, glowA + 0.25))})`;
  const baseShadow = `drop-shadow(0 ${(size * 0.03).toFixed(1)}px ${(size * 0.04).toFixed(1)}px rgba(0,0,0,.55))`;

  const fx = theme.fx;
  const ids = { grad: `${uid}g`, clip: `${uid}c`, shine: `${uid}s`, gloss: `${uid}h`, rim: `${uid}r`, wing: `${uid}w` };
  const insetT = `translate(${shape.cx} ${shape.cy}) scale(${shape.inset}) translate(${-shape.cx} ${-shape.cy})`;
  const isWings = theme.shape === 'wings';

  // Für Flügel braucht die Fläche mehr Breite: viewBox erweitern
  const vb = isWings ? '-11 -7 122 116' : '-4 -4 108 108';

  const sparks = fx === 'aura'
    ? [[24, 30, 0], [72, 24, 0.6], [40, 18, 1.2], [82, 46, 1.7], [16, 52, 2.1], [60, 12, 0.9]].slice(0, 4 + Math.min(2, tier - 5))
    : [];

  const interactive = !!onLongPress;
  const handlers = interactive ? {
    role: 'button' as const,
    tabIndex: 0,
    'aria-label': `Level ${level}, lange drücken für Designs`,
    onPointerDown: (e: React.PointerEvent) => {
      if (e.button !== 0 && e.pointerType === 'mouse') return;
      setPressed(true);
      if (timer.current != null) window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => {
        timer.current = null;
        setPressed(false);
        try { navigator.vibrate?.(30); } catch { /* egal */ }
        onLongPress?.();
      }, 500);
    },
    onPointerUp: cancel,
    onPointerLeave: cancel,
    onPointerCancel: cancel,
    onKeyDown: (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onLongPress?.(); }
    },
  } : { role: 'img' as const, 'aria-label': `Level ${level}` };

  const glowStyle = {
    ['--lb-glow-a' as string]: `${baseShadow} ${glowA2}`,
    ['--lb-glow-b' as string]: `${baseShadow} ${glowB2}`,
    filter: `${baseShadow} ${glowA2}`,
  } as React.CSSProperties;

  return (
    <div
      {...handlers}
      onContextMenu={(e) => e.preventDefault()}
      className={`relative inline-grid place-items-center select-none outline-none ${still ? 'lb-still' : ''} ${className}`}
      style={{
        width: size, height: size, touchAction: 'manipulation', WebkitTouchCallout: 'none',
        transform: pressed ? 'scale(0.92)' : 'scale(1)',
        transition: 'transform 180ms cubic-bezier(.2,.8,.2,1)',
        cursor: interactive ? 'pointer' : undefined,
      } as React.CSSProperties}
    >
      <svg
        viewBox={vb} width={size} height={size} overflow="visible" aria-hidden="true"
        className={fx === 'pulse' && !still ? 'lb-pulse' : ''}
        style={glowStyle}
      >
        <defs>
          <linearGradient id={ids.grad} x1="0.15" y1="0" x2="0.85" y2="1">
            {g.map((c, i) => <stop key={i} offset={`${(i / (g.length - 1)) * 100}%`} stopColor={c} />)}
          </linearGradient>
          <linearGradient id={ids.rim} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#fff" stopOpacity={0.75} />
            <stop offset="55%" stopColor="#fff" stopOpacity={0.15} />
            <stop offset="100%" stopColor="#fff" stopOpacity={0.4} />
          </linearGradient>
          <linearGradient id={ids.gloss} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#fff" stopOpacity={0.38} />
            <stop offset="100%" stopColor="#fff" stopOpacity={0} />
          </linearGradient>
          <linearGradient id={ids.shine} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#fff" stopOpacity={0} />
            <stop offset="50%" stopColor="#fff" stopOpacity={0.75} />
            <stop offset="100%" stopColor="#fff" stopOpacity={0} />
          </linearGradient>
          <linearGradient id={ids.wing} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#ffffff" />
            <stop offset="55%" stopColor={g[1] ?? g[0]} />
            <stop offset="100%" stopColor={g[g.length - 1]} />
          </linearGradient>
          <clipPath id={ids.clip}><path d={shape.d} /></clipPath>
        </defs>

        {/* Drehender gestrichelter Ring */}
        {fx === 'spin' && (
          <g>
            <circle className="lb-spin" cx={50} cy={50} r={isWings ? 40 : 52} fill="none" stroke={theme.glow}
              strokeWidth={1.6} strokeDasharray="5 4" strokeLinecap="round" opacity={0.9} />
            {tier >= 8 && (
              <circle className="lb-spin-rev" cx={50} cy={50} r={56.5} fill="none" stroke={g[0]}
                strokeWidth={0.9} strokeDasharray="1 6" strokeLinecap="round" opacity={0.8} />
            )}
          </g>
        )}

        {/* Strahlenkranz ab hohen Tiers */}
        {tier >= 6 && !isWings && (
          <g opacity={0.55} className={fx === 'spin' ? '' : ''}>
            {Array.from({ length: 16 }).map((_, i) => {
              const a = (i * 22.5 * Math.PI) / 180;
              const r1 = 47, r2 = i % 2 ? 52 : 55;
              return <line key={i} x1={50 + r1 * Math.cos(a)} y1={50 + r1 * Math.sin(a)} x2={50 + r2 * Math.cos(a)} y2={50 + r2 * Math.sin(a)}
                stroke={theme.glow} strokeWidth={1.2} strokeLinecap="round" />;
            })}
          </g>
        )}

        {/* Flügel */}
        {isWings && (
          <g>
            {[false, true].map((mirror) => (
              <g key={String(mirror)} transform={`${mirror ? 'translate(100 0) scale(-1 1) ' : ''}translate(26 52) scale(1.28) translate(-26 -52)`}>
                {WING_L.map((d, i) => (
                  <path key={i} d={d} fill={`url(#${ids.wing})`} stroke="rgba(255,255,255,.55)" strokeWidth={0.6}
                    opacity={1 - i * 0.08} />
                ))}
              </g>
            ))}
            {/* kleine Krone/Stern oben */}
            <path d={starPath(4, 9, 3, 50, 15)} fill="#fff" className="lb-twinkle" />
            <circle cx={50} cy={52} r={35} fill="none" stroke={g[1] ?? g[0]} strokeWidth={1.2} opacity={0.8} />
            <circle className="lb-spin" cx={50} cy={52} r={39} fill="none" stroke="#fff" strokeWidth={0.8}
              strokeDasharray="1 5" strokeLinecap="round" opacity={0.7} style={{ transformOrigin: '50px 52px' }} />
          </g>
        )}

        {/* Grundform */}
        <path d={shape.d} fill={`url(#${ids.grad})`} stroke="rgba(0,0,0,.35)" strokeWidth={1} />

        {/* Innenleben, auf die Form beschnitten */}
        <g clipPath={`url(#${ids.clip})`}>
          {/* Glanz oben (ab Tier 1) */}
          {tier >= 1 && (
            <ellipse cx={50} cy={shape.cy - 30} rx={50} ry={30} fill={`url(#${ids.gloss})`} />
          )}
          {/* dunkle Vignette unten für Tiefe */}
          <ellipse cx={50} cy={shape.cy + 52} rx={60} ry={30} fill="rgba(0,0,0,.18)" />
          {/* Facetten bei Diamant/Stern */}
          {(theme.shape === 'diamond') && (
            <g stroke="rgba(255,255,255,.22)" strokeWidth={0.8} fill="none">
              <path d="M5 50 L50 26 L95 50 M50 3 L50 26 M5 50 L50 74 L95 50 M50 97 L50 74" />
            </g>
          )}
          {fx === 'shine' && (
            <g className="lb-shine">
              <rect x={-30} y={-40} width={22} height={180} fill={`url(#${ids.shine})`} transform="rotate(25 50 50)" />
            </g>
          )}
        </g>

        {/* feiner heller Innenrand */}
        <path d={shape.d} fill="none" stroke={`url(#${ids.rim})`} strokeWidth={1.6 / shape.inset}
          transform={insetT} vectorEffect="non-scaling-stroke" />
        {tier >= 7 && (
          <path d={shape.d} fill="none" stroke="rgba(255,255,255,.28)" strokeWidth={0.8}
            transform={`translate(${shape.cx} ${shape.cy}) scale(${shape.inset - 0.07}) translate(${-shape.cx} ${-shape.cy})`} />
        )}

        {/* Kronen-Juwelen */}
        {theme.shape === 'crown' && (
          <g>
            {[[8, 30], [50, 14], [92, 30]].map(([x, y], i) => (
              <circle key={i} cx={x} cy={y} r={i === 1 ? 4.5 : 3.6} fill="#fff" stroke={g[g.length - 1]} strokeWidth={1.2} />
            ))}
            <path d="M18 80 Q50 86 82 80" stroke="rgba(255,255,255,.45)" strokeWidth={1.2} fill="none" />
          </g>
        )}

        {/* Funken (aura) */}
        {sparks.map(([x, y, delay], i) => (
          <g key={i} transform={`translate(${x} ${y})`}>
            <path className="lb-spark" style={{ animationDelay: `${delay}s` }}
              d={i % 2 ? 'M0 -3 L0.9 -0.9 L3 0 L0.9 0.9 L0 3 L-0.9 0.9 L-3 0 L-0.9 -0.9Z' : 'M0 -1.8a1.8 1.8 0 1 1 0 3.6a1.8 1.8 0 1 1 0-3.6Z'}
              fill={i % 2 ? '#fff' : theme.glow} />
          </g>
        ))}

        {/* Level-Zahl */}
        <text
          x={shape.tx} y={shape.ty} textAnchor="middle" dominantBaseline="central"
          fontFamily="'Inter Variable', system-ui, sans-serif" fontWeight={800} fontSize={fs}
          letterSpacing={digits >= 3 ? -1.5 : -1}
          fill={textFill}
          stroke={lightBody ? 'rgba(255,255,255,.35)' : 'rgba(0,0,0,.35)'}
          strokeWidth={lightBody ? 0.8 : 1.6} paintOrder="stroke"
          style={{
            fontVariantNumeric: 'tabular-nums',
            filter: lightBody ? 'none' : 'drop-shadow(0 1.2px 1.2px rgba(0,0,0,.45))',
          }}
        >
          {Math.max(0, Math.floor(level))}
        </text>
      </svg>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* ThemeLibrary                                                        */
/* ------------------------------------------------------------------ */

function LockIcon({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <rect x="5" y="10.5" width="14" height="10" rx="2.5" fill="#9a958c" />
      <path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" stroke="#9a958c" strokeWidth="2.2" fill="none" />
      <circle cx="12" cy="15.5" r="1.5" fill="#181816" />
    </svg>
  );
}

/** Bottom-Sheet-Bibliothek: alle THEMES als Raster; freigeschaltete wählbar (zeigt LevelBadge-Vorschau + Name), gesperrte grau mit Schloss und "ab Level X". Aktives markiert. */
export function ThemeLibrary(props: { open: boolean; level: number; activeId: string; onPick: (id: string) => void; onClose: () => void }): JSX.Element {
  const { open, level, activeId, onPick, onClose } = props;
  const next = nextTheme(level);
  useBack(open, onClose);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div key="lib-backdrop" className="fixed inset-0 z-50 bg-black/60"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}
          onClick={onClose} />
      )}
      {open && (
        <motion.div
          key="lib-sheet"
          role="dialog" aria-modal="true" aria-label="Deine Designs"
          className="fixed inset-x-0 bottom-0 z-50 mx-auto max-w-lg rounded-t-3xl bg-panel border-t border-line pb-safe"
          initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
          transition={{ type: 'spring', damping: 32, stiffness: 340 }}
          drag="y" dragConstraints={{ top: 0, bottom: 0 }} dragElastic={{ top: 0, bottom: 0.6 }}
          onDragEnd={(_, info) => { if (info.offset.y > 100 || info.velocity.y > 600) onClose(); }}
        >
          <div className="flex justify-center pt-2.5 pb-1"><div className="h-1.5 w-10 rounded-full bg-line" /></div>
          <div className="flex items-start gap-3 px-5 pt-2">
            <div className="flex-1">
              <h2 className="font-display text-[22px]">Deine Designs</h2>
              <p className="mt-1 text-[14px] leading-snug text-mute">Neue Designs alle 5 Level. Beim Aufstieg wird das neue automatisch aktiv.</p>
            </div>
            <button onClick={onClose} aria-label="Schließen" className="-mr-1 grid h-9 w-9 shrink-0 place-items-center rounded-full bg-raised active:brightness-125">
              <svg viewBox="0 0 24 24" className="h-4 w-4"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
            </button>
          </div>

          <div className="no-scrollbar max-h-[62vh] overflow-y-auto px-4 pt-4 pb-2" onPointerDownCapture={(e) => e.stopPropagation()}>
            <div className="grid grid-cols-3 gap-2.5">
              {THEMES.map((t) => {
                const unlocked = level >= t.level;
                const active = t.id === activeId;
                return (
                  <motion.button
                    key={t.id}
                    whileTap={unlocked ? { scale: 0.96 } : undefined}
                    onClick={unlocked ? () => onPick(t.id) : undefined}
                    disabled={!unlocked}
                    aria-pressed={active}
                    aria-label={unlocked ? `Design ${t.name}${active ? ' (aktiv)' : ''}` : `Design ${t.name}, gesperrt, ab Level ${t.level}`}
                    className={`relative flex flex-col items-center gap-2 rounded-2xl border px-2 pt-3.5 pb-3 text-center ${active ? 'bg-raised' : 'bg-raised/60 border-transparent'}`}
                    style={active ? { borderColor: t.accent, boxShadow: `0 0 0 1px ${t.accent} inset, 0 0 18px ${rgba(t.glow, 0.18)}` } : undefined}
                  >
                    <div style={unlocked ? undefined : { filter: 'grayscale(1) brightness(.55)', opacity: 0.6 }}>
                      <LevelBadge level={level} theme={t} size={56} still={!unlocked} />
                    </div>
                    {!unlocked && (
                      <div className="absolute left-1/2 top-[34px] -translate-x-1/2 grid h-7 w-7 place-items-center rounded-full bg-panel/90 ring-1 ring-line">
                        <LockIcon />
                      </div>
                    )}
                    <div className="min-w-0">
                      <div className={`truncate text-[13px] font-semibold ${unlocked ? 'text-ink' : 'text-mute'}`}>{t.name}</div>
                      <div className="text-[11px] num" style={{ color: active ? t.accent : '#9a958c' }}>
                        {active ? 'Aktiv' : unlocked ? `Level ${t.level}` : `ab Level ${t.level}`}
                      </div>
                    </div>
                  </motion.button>
                );
              })}
            </div>
          </div>

          <div className="mx-4 mt-2 mb-3 flex items-center gap-3 rounded-2xl bg-raised/70 px-4 py-3 text-[13px]">
            {next ? (
              <>
                <LockIcon className="h-4 w-4 shrink-0" />
                <span className="text-mute">Nächstes Design: <span className="font-semibold text-ink">{next.name}</span> ab Level <span className="num">{next.level}</span></span>
              </>
            ) : (
              <span className="text-mute">Alle Designs freigeschaltet. Respekt.</span>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/* ------------------------------------------------------------------ */
/* ThemeUnlocked                                                       */
/* ------------------------------------------------------------------ */

/** Vollbild-Feier, wenn ein neues Theme freigeschaltet wurde (Abzeichen fliegt groß rein, Glow, Name, Knopf "Weiter"). */
export function ThemeUnlocked(props: { theme: Theme | null; onClose: () => void }): JSX.Element {
  const { theme, onClose } = props;
  useBack(!!theme, onClose);
  return (
    <AnimatePresence>
      {theme && (
        <motion.div
          key={theme.id}
          role="dialog" aria-modal="true" aria-label={`Neues Design freigeschaltet: ${theme.name}`}
          className="fixed inset-0 z-[60] flex flex-col items-center justify-center overflow-hidden bg-bg/[0.97] px-6"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.25 }}
        >
          <motion.div
            className="pointer-events-none absolute left-1/2 top-[42%] h-[520px] w-[520px] -translate-x-1/2 -translate-y-1/2 rounded-full"
            style={{ background: `radial-gradient(circle, ${rgba(theme.glow, 0.35)} 0%, ${rgba(theme.glow, 0.08)} 40%, transparent 70%)` }}
            initial={{ scale: 0.3, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ duration: 0.9, ease: 'easeOut', delay: 0.1 }}
          />
          <Particles color={theme.glow} count={22} />
            <motion.div
              initial={{ scale: 0.15, y: 240, rotate: -25, opacity: 0 }}
              animate={{ scale: 1, y: 0, rotate: 0, opacity: 1 }}
              transition={{ type: 'spring', damping: 13, stiffness: 120, delay: 0.15 }}
            >
              <LevelBadge level={theme.level} theme={theme} size={176} />
            </motion.div>
          <motion.div className="relative mt-8 text-center"
            initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.55, duration: 0.4 }}>
            <div className="text-[13px] font-semibold uppercase tracking-[0.14em] text-mute">Neues Design freigeschaltet</div>
            <div className="mt-2 font-display text-[40px] leading-none" style={{ color: theme.accent, textShadow: `0 0 24px ${rgba(theme.glow, 0.45)}` }}>{theme.name}</div>
            <p className="mt-4 text-[14px] text-mute">Lange aufs Level drücken, um zu wechseln</p>
          </motion.div>
          <motion.button
            className="relative mt-10 w-full max-w-xs rounded-2xl px-5 py-4 text-[17px] font-semibold tracking-[-0.01em]"
            style={{ background: theme.accent, color: theme.onAccent, boxShadow: `0 8px 30px ${rgba(theme.glow, 0.35)}` }}
            initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.8 }}
            whileTap={{ scale: 0.98 }}
            onClick={onClose}
          >
            Weiter
          </motion.button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
