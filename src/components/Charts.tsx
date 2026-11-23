import { motion } from 'framer-motion';
import type { Slice } from '../lib/stats';

// Kleine SVG-Diagramme ohne externe Bibliothek – laufen komplett offline.

const fmt = (n: number, d = 0) => n.toLocaleString('de-DE', { maximumFractionDigits: d });

export function Donut({ data, center, sub, unit = '' }: { data: Slice[]; center: string; sub: string; unit?: string }) {
  const total = data.reduce((s, d) => s + d.value, 0);
  const R = 42, C = 2 * Math.PI * R, GAP = data.length > 1 ? 1.2 : 0;
  let acc = 0;
  return (
    <div className="flex items-center gap-4">
      <svg viewBox="0 0 100 100" className="h-36 w-36 shrink-0 -rotate-90">
        <circle cx="50" cy="50" r={R} fill="none" className="stroke-raised" strokeWidth="12" />
        {total > 0 && data.map((d, i) => {
          const len = (d.value / total) * C;
          const el = (
            <motion.circle key={d.key} cx="50" cy="50" r={R} fill="none" stroke={d.color} strokeWidth="12"
              strokeDasharray={`${Math.max(0, len - GAP)} ${C}`} strokeDashoffset={-acc}
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.06 }} />
          );
          acc += len;
          return el;
        })}
        <g className="rotate-90" style={{ transformOrigin: '50px 50px' }}>
          <text x="50" y="50" textAnchor="middle" className="fill-ink" fontSize="15" fontWeight="650">{center}</text>
          <text x="50" y="63" textAnchor="middle" className="fill-mute" fontSize="7.5">{sub}</text>
        </g>
      </svg>
      <div className="min-w-0 flex-1 space-y-1.5">
        {data.map((d) => (
          <div key={d.key} className="flex items-center gap-2 text-sm">
            <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: d.color }} />
            <span className="flex-1 truncate">{d.label}</span>
            <span className="num text-mute">{total ? Math.round((d.value / total) * 100) : 0} %</span>
            {unit && <span className="num w-14 text-right text-xs text-mute">{fmt(d.value, 1)} {unit}</span>}
          </div>
        ))}
      </div>
    </div>
  );
}

/** Liniendiagramm mit Punkten; x = Tage (gleichmäßig nach Datum verteilt) */
export function LineChart({ points, color = '#FF6B35', unit = '', height = 150 }: {
  points: { day: string; v: number }[]; color?: string; unit?: string; height?: number;
}) {
  if (points.length === 0) return null;
  const W = 320, H = height, PL = 34, PR = 8, PT = 10, PB = 20;
  const t = points.map((p) => new Date(p.day + 'T12:00').getTime());
  const t0 = Math.min(...t), t1 = Math.max(...t);
  const vs = points.map((p) => p.v);
  let lo = Math.min(...vs), hi = Math.max(...vs);
  const pad = Math.max(0.5, (hi - lo) * 0.15);
  lo -= pad; hi += pad;
  const x = (i: number) => (t1 === t0 ? (PL + W - PR) / 2 : PL + ((t[i] - t0) / (t1 - t0)) * (W - PL - PR));
  const y = (v: number) => PT + (1 - (v - lo) / (hi - lo)) * (H - PT - PB);
  const d = points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(p.v).toFixed(1)}`).join(' ');
  const area = `${d} L${x(points.length - 1).toFixed(1)} ${H - PB} L${x(0).toFixed(1)} ${H - PB} Z`;
  const ticks = [hi - pad, (hi + lo) / 2, lo + pad];
  const lbl = (day: string) => new Date(day + 'T12:00').toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' });
  const gid = `g${color.replace('#', '')}`;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: 'auto' }}>
      <defs>
        <linearGradient id={gid} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor={color} stopOpacity="0.28" />
          <stop offset="1" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      {ticks.map((v, i) => (
        <g key={i}>
          <line x1={PL} x2={W - PR} y1={y(v)} y2={y(v)} className="stroke-line" strokeDasharray="2 3" />
          <text x={PL - 4} y={y(v) + 3} textAnchor="end" fontSize="9" className="fill-mute">{fmt(v, 1)}{unit}</text>
        </g>
      ))}
      {points.length > 1 && <path d={area} fill={`url(#${gid})`} />}
      <motion.path d={d} fill="none" stroke={color} strokeWidth="2.2" strokeLinejoin="round" strokeLinecap="round"
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.5 }} />
      {points.length <= 40 && points.map((p, i) => <circle key={i} cx={x(i)} cy={y(p.v)} r="2.6" className="fill-bg" stroke={color} strokeWidth="1.6" />)}
      <text x={PL} y={H - 5} fontSize="9" className="fill-mute">{lbl(points[0].day)}</text>
      {points.length > 1 && <text x={W - PR} y={H - 5} fontSize="9" className="fill-mute" textAnchor="end">{lbl(points[points.length - 1].day)}</text>}
    </svg>
  );
}

/** Säulen (z. B. Punkte pro Woche); die letzte Säule ist hervorgehoben */
export function Bars({ data, highlightLast = true }: { data: { label: string; v: number }[]; highlightLast?: boolean }) {
  const max = Math.max(1, ...data.map((d) => d.v));
  return (
    <div className="flex h-32 items-end gap-1.5">
      {data.map((d, i) => {
        const last = highlightLast && i === data.length - 1;
        return (
          <div key={i} className="flex h-full flex-1 flex-col items-center justify-end gap-1">
            <span className="num text-[9px] text-mute">{d.v ? fmt(d.v) : ''}</span>
            <motion.div className={`w-full rounded-t-lg rounded-b-sm ${last ? 'bg-hot' : 'bg-ink/15'}`}
              initial={{ height: 0 }} animate={{ height: `${(d.v / max) * 100}%` }} transition={{ duration: 0.5, delay: i * 0.03 }}
              style={{ minHeight: d.v ? 3 : 1 }} />
            <span className="text-[9px] text-mute">{d.label}</span>
          </div>
        );
      })}
    </div>
  );
}

/** Aktivitätskalender: Spalten = Wochen, Zeilen = Mo–So */
export function Heatmap({ weeks, perDay, today }: { weeks: string[][]; perDay: Map<string, number>; today: string }) {
  const max = Math.max(1, ...weeks.flat().map((d) => perDay.get(d) ?? 0));
  const shade = (v: number) => {
    if (v <= 0) return 'rgb(var(--raised))';
    const r = v / max;
    if (r > 0.66) return 'rgb(var(--accent))';
    if (r > 0.33) return 'rgb(var(--accent) / 0.65)';
    return 'rgb(var(--accent) / 0.35)';
  };
  const months: { i: number; m: string }[] = [];
  weeks.forEach((w, i) => {
    const m = new Date(w[0] + 'T12:00').toLocaleDateString('de-DE', { month: 'short' });
    if (!months.length || months[months.length - 1].m !== m) months.push({ i, m });
  });
  return (
    <div>
      <div className="flex gap-[3px]">
        <div className="mr-1 flex flex-col justify-between py-[1px] text-[9px] leading-none text-mute">
          <span>Mo</span><span>Do</span><span>So</span>
        </div>
        {weeks.map((w, i) => (
          <div key={i} className="flex flex-1 flex-col gap-[3px]">
            {w.map((d) => (
              <div key={d} title={d} className={`aspect-square w-full rounded-[3px] ${d === today ? 'ring-1 ring-ink/70' : ''}`}
                style={{ background: d > today ? 'transparent' : shade(perDay.get(d) ?? 0) }} />
            ))}
          </div>
        ))}
      </div>
      <div className="relative mt-1 h-3 pl-6 text-[9px] text-mute">
        {months.map(({ i, m }) => (
          <span key={i} className="absolute" style={{ left: `calc(1.5rem + ${(i / weeks.length) * 100}% - ${(i / weeks.length) * 1.5}rem)` }}>{m}</span>
        ))}
      </div>
    </div>
  );
}
