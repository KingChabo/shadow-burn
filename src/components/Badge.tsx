import { useId, useMemo, useState, useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { BADGES, badgeStates, fmtBadgeValue, MAX_TIER, TIER_GEMS, TIER_NAMES, type BadgeState } from '../lib/badges';
import { db } from '../lib/db';
import { useGame } from '../lib/store';
import { useBack } from '../lib/back';
import { Card, GemIcon } from './ui';
import { Icon } from './Icon';

/** Gewähltes Design (Fortschrittsring + Schriftband). Varianten aus /mnt/project-files/phantom-features2/abzeichen/ring8.png */
export type BadgeVariant = 'zahl' | 'roemisch' | 'kuerzel' | 'winkel' | 'fuellstand';
export const BADGE_VARIANT: BadgeVariant = 'zahl';

/** Verlauf je Stufe: hell, mittel, dunkel */
const METAL: Record<number, [string, string, string]> = {
  1: ['#F7B98A', '#C9733A', '#7A3E17'], // Bronze
  2: ['#F2F4F7', '#AEB7C2', '#5F6B78'], // Silber
  3: ['#FFE08A', '#F5A524', '#A8650C'], // Gold
  4: ['#FFFFFF', '#CFE3F0', '#6F8AA3'], // Platin: kühles Weiß-Blau
  5: ['#E6FFFF', '#3FE0E8', '#1172A0'], // Diamant: Türkis-Cyan
  6: ['#FFB0BC', '#E0244F', '#6B1A7A'], // Legende: Rubin bis Purpur
  7: ['#D9B8FF', '#7B2CFF', '#1A0533'], // Shadow: Violett ins Schwarze
};
const TIER_COLOR = ['#FF6B35', '#C9733A', '#AEB7C2', '#F5A524', '#C6DDEE', '#3FD8E8', '#E0335A', '#9B5CFF'];
/** Schriftfarbe auf dem Band */
const BAND_INK = ['#1a0d06', '#1a0d06', '#1a0d06', '#1a0d06', '#18222d', '#04262e', '#FFF4F6', '#D9B8FF'];
const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII'];
const SHADOW = MAX_TIER;

function shortNum(n: number): string {
  if (n >= 10000) return `${Math.round(n / 1000)}k`;
  return n.toLocaleString('de-DE', { maximumFractionDigits: 1 }).replace('.', '');
}

/**
 * Ein Abzeichen: Ring zeigt den Fortschritt zur nächsten Stufe, das Band unten die Stufe.
 * Ohne Bilder im Kreis.
 */
export function BadgeIcon({ s, size = 96, variant = BADGE_VARIANT }: { s: BadgeState; size?: number; variant?: BadgeVariant }) {
  const uid = useId().replace(/:/g, '');
  const locked = s.tier === 0 && s.progress === 0;
  const ringP = s.tier === MAX_TIER ? 1 : s.progress;
  const t = s.tier;
  const metal = METAL[Math.max(1, s.tier)];
  const col = locked ? '#4a4744' : s.tier === 0 ? TIER_COLOR[0] : TIER_COLOR[s.tier];
  const ink = locked ? '#6a6560' : '#F6F3EE';
  const r = 42, c = 2 * Math.PI * r;
  const bandText = s.tier === 0 ? (locked ? 'GESPERRT' : `${Math.round(s.progress * 100)} %`) : TIER_NAMES[s.tier].toUpperCase();
  const bandFill = locked ? '#2a2928' : t === SHADOW ? '#0b0710' : s.tier === 0 ? TIER_COLOR[0] : TIER_COLOR[s.tier];
  // Zahl im Kreis: das aktuelle Ziel (bei Gold das Gold-Ziel)
  const num = shortNum(s.target);

  let inner: JSX.Element;
  if (variant === 'roemisch') {
    inner = <text x="60" y="67" fontFamily="Oswald" fontSize="34" fontWeight="700" textAnchor="middle" fill={locked ? '#6a6560' : col}>{s.tier ? ROMAN[s.tier] : '–'}</text>;
  } else if (variant === 'kuerzel') {
    inner = <>
      <circle cx="60" cy="54" r="26" fill="none" stroke={locked ? '#33312f' : col} strokeOpacity=".5" strokeWidth="1.5" />
      <text x="60" y="65" fontFamily="Oswald" fontSize="28" fontWeight="700" letterSpacing="1" textAnchor="middle" fill={ink}>{s.def.short}</text>
    </>;
  } else if (variant === 'winkel') {
    inner = <>{[0, 1, 2].map((i) => <path key={i} d={`M42 ${48 + i * 11}l18-10 18 10`} fill="none" stroke={i < s.tier ? col : '#2e2c2a'} strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" />)}</>;
  } else if (variant === 'fuellstand') {
    const top = 54 + 33 - 66 * ringP;
    inner = <>
      <clipPath id={`c${uid}`}><circle cx="60" cy="54" r="31" /></clipPath>
      <g clipPath={`url(#c${uid})`}><path d={`M20 ${top} q10 -5 20 0 t20 0 t20 0 t20 0 V100 H20z`} fill={`url(#g${uid})`} opacity=".9" /></g>
      <text x="60" y="63" fontFamily="Oswald" fontSize="19" fontWeight="700" textAnchor="middle" fill={locked ? '#6a6560' : '#fff'}>{Math.round(ringP * 100)}%</text>
    </>;
  } else {
    inner = <>
      <text x="60" y="60" fontFamily="Oswald" fontSize={num.length > 3 ? 24 : 30} fontWeight="700" textAnchor="middle" fill={ink}>{num}</text>
      <text x="60" y="74" fontFamily="Oswald" fontSize="10" fontWeight="600" letterSpacing="1.5" textAnchor="middle" fill={locked ? '#6a6560' : t === SHADOW ? '#C9A4FF' : col}>{s.def.unit.toUpperCase()}</text>
    </>;
  }

  // Funken für Diamant (auf dem Ring verteilt)
  const sparks = [[-60, 0], [30, 0.7], [140, 1.3], [215, 0.4]].map(([deg, delay]) => {
    const a = (deg * Math.PI) / 180;
    return { x: 60 + Math.cos(a) * r, y: 54 + Math.sin(a) * r, delay };
  });

  return (
    <svg viewBox="0 0 120 120" width={size} height={size} role="img" aria-label={`${s.def.name}: ${TIER_NAMES[s.tier]}`} overflow="visible">
      <defs>
        <linearGradient id={`g${uid}`} x1="0" y1="0" x2="1" y2="1">
          {s.tier === 0
            ? <><stop offset="0" stopColor="#FFB020" /><stop offset="1" stopColor="#FF4433" /></>
            : t >= 5
              ? <><stop offset="0" stopColor={metal[0]} /><stop offset=".5" stopColor={metal[1]} /><stop offset="1" stopColor={metal[2]} /></>
              : <><stop offset="0" stopColor={metal[0]} /><stop offset="1" stopColor={metal[2]} /></>}
        </linearGradient>
        {t >= 6 && (
          <filter id={`f${uid}`} x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation={t === SHADOW ? 5 : 3.5} />
          </filter>
        )}
        {t === SHADOW && (
          <radialGradient id={`s${uid}`} cx=".5" cy=".55" r=".5">
            <stop offset="0" stopColor="#2a0f4d" />
            <stop offset=".7" stopColor="#120720" />
            <stop offset="1" stopColor="#07040b" />
          </radialGradient>
        )}
      </defs>

      {/* Legende + Shadow: Glühen hinter dem Ring */}
      {t >= 6 && (
        <circle cx="60" cy="54" r={r} fill="none" stroke={t === SHADOW ? '#8A3CFF' : '#E0244F'} strokeWidth="12" filter={`url(#f${uid})`} opacity=".7">
          {t === SHADOW && <animate attributeName="opacity" values=".35;.95;.35" dur="2.6s" repeatCount="indefinite" />}
        </circle>
      )}
      {/* Shadow: Rauch-Schwaden um den Ring */}
      {t === SHADOW && [0, 1, 2].map((i) => (
        <circle key={i} cx={60 + (i - 1) * 22} cy="70" r="14" fill="#6B2BD9" opacity="0" filter={`url(#f${uid})`}>
          <animate attributeName="cy" values="78;18" dur="4.2s" begin={`${i * 1.4}s`} repeatCount="indefinite" />
          <animate attributeName="opacity" values="0;.45;0" dur="4.2s" begin={`${i * 1.4}s`} repeatCount="indefinite" />
        </circle>
      ))}
      {/* Platin und höher: feiner zweiter Ring außen */}
      {t >= 4 && <circle cx="60" cy="54" r="49.5" fill="none" stroke={t === SHADOW ? '#9B5CFF' : metal[1]} strokeOpacity={t === SHADOW ? 0.8 : 0.65} strokeWidth="1.2" />}

      <circle cx="60" cy="54" r={r} fill="none" stroke={t === SHADOW ? '#120a1c' : '#262422'} strokeWidth="9" />
      {ringP > 0 && <circle cx="60" cy="54" r={r} fill="none" stroke={`url(#g${uid})`} strokeWidth="9" strokeLinecap="round"
        strokeDasharray={`${c * ringP} ${c}`} transform="rotate(-90 60 54)" />}
      {/* Diamant: Facetten-Linien auf dem Ring */}
      {t === 5 && Array.from({ length: 12 }, (_, i) => {
        // nur auf dem gefüllten Teil des Rings (Start oben, im Uhrzeigersinn)
        if ((i + 0.6) / 12 > ringP) return null;
        const a = ((i * 30 - 90 + 12) * Math.PI) / 180;
        return <line key={i} x1={60 + Math.cos(a) * (r - 3.5)} y1={54 + Math.sin(a) * (r - 3.5)} x2={60 + Math.cos(a + 0.14) * (r + 3.5)} y2={54 + Math.sin(a + 0.14) * (r + 3.5)} stroke="#E6FFFF" strokeOpacity=".6" strokeWidth=".8" />;
      })}
      <circle cx="60" cy="54" r="33" fill={t === SHADOW ? `url(#s${uid})` : '#1f1d1c'} />
      {t === SHADOW && <circle cx="60" cy="54" r="33" fill="none" stroke="#9B5CFF" strokeOpacity=".5" strokeWidth="1" />}
      {inner}
      {/* Diamant: Funkeln */}
      {t === 5 && sparks.map((p, i) => (
        <path key={i} d={`M${p.x} ${p.y - 6}L${p.x + 1.6} ${p.y - 1.6}L${p.x + 6} ${p.y}L${p.x + 1.6} ${p.y + 1.6}L${p.x} ${p.y + 6}L${p.x - 1.6} ${p.y + 1.6}L${p.x - 6} ${p.y}L${p.x - 1.6} ${p.y - 1.6}z`} fill="#fff" opacity="0">
          <animate attributeName="opacity" values="0;1;0" dur="1.8s" begin={`${p.delay}s`} repeatCount="indefinite" />
        </path>
      ))}

      {/* Band: ab Legende mit Kronen-Zacken */}
      {t >= 6 && <path d="M30 92l5-8 6 5 7-9 7 7 5-9 5 9 7-7 7 9 6-5 5 8z" fill={t === SHADOW ? '#0b0710' : '#B01E45'} stroke={t === SHADOW ? '#9B5CFF' : 'none'} strokeWidth="1" />}
      <path d="M14 92h92l-8 10 8 10H14l8-10z" fill={bandFill} stroke={t === SHADOW ? '#9B5CFF' : t === 4 ? '#FFFFFF' : 'none'} strokeOpacity={t === 4 ? 0.7 : 1} strokeWidth="1.2" />
      <text x="60" y="106" fontFamily="Oswald" fontSize="13" fontWeight="700" letterSpacing={t === SHADOW ? 1.5 : 0} textAnchor="middle" fill={locked ? '#8F8A83' : BAND_INK[t]}>{bandText}</text>
    </svg>
  );
}

function useBadgeStates(): BadgeState[] | null {
  const g = useGame();
  const [st, setSt] = useState<BadgeState[] | null>(null);
  useEffect(() => {
    let alive = true;
    Promise.all([db.workouts.toArray(), db.gymLogs.toArray(), db.friends.count()]).then(([workouts, gymLogs, friends]) => {
      if (alive) setSt(badgeStates({ workouts, gymLogs, friends, streak: g.streak, xp: g.wallet.xp }));
    });
    return () => { alive = false; };
  }, [g.wallet.xp, g.wallet.gems, g.streak]);
  return st;
}

/** Abzeichen-Sammlung im Tab "Ich" */
export function BadgeCase() {
  const states = useBadgeStates();
  const [open, setOpen] = useState<BadgeState | null>(null);
  const [all, setAll] = useState(false);
  if (!states) return null;
  const sorted = [...states].sort((a, b) => b.tier - a.tier || b.progress - a.progress);
  const shown = all ? sorted : sorted.slice(0, 6);
  const done = states.filter((s) => s.tier === MAX_TIER).length;
  return (
    <Card>
      <div className="flex items-baseline justify-between">
        <p className="font-display">Abzeichen</p>
        <span className="text-xs text-mute">{done} / {BADGES.length} in Shadow</span>
      </div>
      <div className="mt-3 grid grid-cols-3 gap-y-3">
        {shown.map((s) => (
          <button key={s.def.id} onClick={() => setOpen(s)} className="flex flex-col items-center">
            <BadgeIcon s={s} size={92} />
            <span className="font-sport mt-0.5 text-center text-[12px] leading-tight">{s.def.name}</span>
          </button>
        ))}
      </div>
      {states.length > 6 && (
        <button onClick={() => setAll(!all)} className="mt-3 w-full rounded-xl bg-raised py-2 text-sm font-medium text-neon">{all ? 'Weniger zeigen' : `Alle ${states.length} zeigen`}</button>
      )}
      <AnimatePresence>{open && <BadgeSheet s={open} onClose={() => setOpen(null)} />}</AnimatePresence>
    </Card>
  );
}

function BadgeSheet({ s, onClose }: { s: BadgeState; onClose: () => void }) {
  useBack(true, onClose);
  return (
    <motion.div className="fixed inset-0 z-[65] flex items-end bg-black/60" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}>
      <motion.div className="w-full rounded-t-3xl bg-panel p-5 pb-[max(env(safe-area-inset-bottom),20px)]" initial={{ y: 60 }} animate={{ y: 0 }} exit={{ y: 60 }} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-4">
          <BadgeIcon s={s} size={110} />
          <div className="min-w-0">
            <p className="font-sport text-2xl leading-tight">{s.def.name}</p>
            <p className="text-sm text-mute">{s.def.what}</p>
            <p className="mt-1 text-sm"><b className="num">{fmtBadgeValue(s.value, s.def.unit)}</b>{s.tier < MAX_TIER && <span className="text-mute"> / {s.target.toLocaleString('de-DE')} {s.def.unit}</span>}</p>
          </div>
        </div>
        <div className="mt-4 space-y-1">
          {[1, 2, 3, 4, 5, 6, 7].map((t) => (
            <div key={t} className={`flex items-center justify-between rounded-xl px-3 py-1.5 text-sm ${s.tier >= t ? 'bg-raised' : 'bg-raised/40 text-mute'}`}
              style={t === SHADOW ? { boxShadow: 'inset 0 0 0 1px rgba(155,92,255,.55)' } : undefined}>
              <span className="flex items-center gap-2"><span className="h-3 w-3 rounded-full" style={{ background: TIER_COLOR[t] }} />{TIER_NAMES[t]}: {s.def.steps[t - 1].toLocaleString('de-DE')} {s.def.unit}</span>
              <span className="flex items-center gap-1">{s.tier >= t ? <Icon name="check" className="h-4 w-4 text-good" /> : <>+{TIER_GEMS[t]} <GemIcon className="h-3.5 w-3.5" /></>}</span>
            </div>
          ))}
        </div>
      </motion.div>
    </motion.div>
  );
}

/** Feier, wenn ein Abzeichen eine neue Stufe erreicht hat */
export function BadgeUnlocked({ hidden }: { hidden?: boolean }) {
  const g = useGame();
  const states = useBadgeStates();
  const list = useMemo(() => (states ?? []).filter((s) => g.badgeNotice.includes(s.def.id)), [states, g.badgeNotice]);
  const show = !hidden && list.length > 0;
  const shadow = list.some((s) => s.tier === MAX_TIER);
  useBack(show, () => void g.dismissBadgeNotice());
  return (
    <AnimatePresence>
      {show && (
        <motion.div className="fixed inset-0 z-[60] flex flex-col items-center justify-center bg-bg/[0.97] px-6" role="dialog" aria-modal="true"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          {shadow && <motion.div aria-hidden className="pointer-events-none absolute inset-0 -z-10" style={{ background: 'radial-gradient(circle at 50% 42%, rgba(123,44,255,.45), rgba(11,7,16,0) 60%)' }}
            animate={{ opacity: [0.5, 1, 0.5] }} transition={{ duration: 2.6, repeat: Infinity }} />}
          <p className={`kicker relative ${shadow ? '!text-[#C9A4FF] tracking-[.3em]' : '!text-neon'}`}>{shadow ? 'Shadow erreicht' : list.length === 1 ? 'Neues Abzeichen' : `${list.length} neue Abzeichen`}</p>
          <div className="relative mt-4 flex flex-wrap justify-center gap-2">
            {list.slice(0, 6).map((s, i) => (
              <motion.div key={s.def.id} initial={{ scale: 0.4, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: 'spring', delay: 0.1 + i * 0.08 }} className="flex flex-col items-center">
                <BadgeIcon s={s} size={list.length === 1 ? 180 : 104} />
                <span className="font-sport mt-1 text-sm">{s.def.name}</span>
              </motion.div>
            ))}
          </div>
          {list.length === 1 && <p className="mt-2 text-center text-sm text-mute">{TIER_NAMES[list[0].tier]} erreicht: {list[0].def.steps[list[0].tier - 1]?.toLocaleString('de-DE')} {list[0].def.unit} · {list[0].def.what}</p>}
          <p className="mt-3 flex items-center gap-1.5 text-lg font-semibold text-gem">+{list.reduce((s, b) => s + TIER_GEMS[b.tier], 0)} <GemIcon className="h-4 w-4" /></p>
          <button onClick={() => void g.dismissBadgeNotice()} className="bg-hot mt-8 w-full max-w-xs rounded-2xl py-3.5 font-semibold">Stark!</button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
