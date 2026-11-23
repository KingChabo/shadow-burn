import { useId, useMemo } from 'react';
import { decodeRoute, type LatLon } from '../lib/blog';

/**
 * Gelaufene Strecke als Linie, ganz ohne Kartenkacheln (die App ist offline).
 * Feines Raster als Untergrund, Maßstab unten links, Start grün, Ziel als Zielflagge.
 */
export function RouteMap({ route, pts, className = '', live }: { route?: string; pts?: LatLon[]; className?: string; live?: boolean }) {
  const gid = useId().replace(/:/g, '');
  const geo = useMemo(() => {
    let p: LatLon[] = pts ?? [];
    if (!pts && route) { try { p = decodeRoute(route); } catch { p = []; } }
    if (p.length < 2) return null;
    const lat0 = (p.reduce((s, x) => s + x[0], 0) / p.length) * (Math.PI / 180);
    // in Meter umrechnen (flach genug für eine Laufrunde)
    const xy = p.map(([la, lo]) => [lo * Math.cos(lat0) * 111_320, -la * 110_574]);
    const xs = xy.map((q) => q[0]), ys = xy.map((q) => q[1]);
    const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
    // unten Platz für den Maßstab lassen, damit er nie auf der Linie liegt
    const W = 320, H = 190, pad = 22, foot = 30;
    const ih = H - pad - foot;
    const k = Math.min((W - 2 * pad) / Math.max(maxX - minX, 60), ih / Math.max(maxY - minY, 60));
    const ox = (W - (maxX - minX) * k) / 2, oy = pad + (ih - (maxY - minY) * k) / 2;
    const P = xy.map(([x, y]) => [ox + (x - minX) * k, oy + (y - minY) * k] as const);
    const d = P.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join('');
    // Maßstab: runde Länge, die etwa ein Viertel der Breite einnimmt
    const target = (W / 4) / k;
    const steps = [50, 100, 200, 250, 500, 1000, 2000, 2500, 5000, 10000, 20000, 50000];
    const m = steps.find((s) => s >= target) ?? 50000;
    return { d, W, H, start: P[0], end: P[P.length - 1], bar: m * k, barLabel: m >= 1000 ? `${m / 1000} km` : `${m} m` };
  }, [route, pts]);

  if (!geo) return (
    <div className={`grid aspect-[320/190] place-items-center rounded-2xl bg-raised text-sm text-mute ${className}`}>{live ? 'Warte auf GPS …' : 'Keine Route'}</div>
  );
  const { d, W, H, start, end } = geo;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className={`block w-full rounded-2xl bg-raised ${className}`} role="img" aria-label="Gelaufene Route">
      <defs>
        <pattern id={`g${gid}`} width="16" height="16" patternUnits="userSpaceOnUse">
          <path d="M16 0H0V16" fill="none" stroke="rgb(var(--ink) / 0.06)" strokeWidth="1" />
        </pattern>
        <linearGradient id={`l${gid}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="rgb(var(--accent))" />
          <stop offset="1" stopColor="rgb(var(--hot))" />
        </linearGradient>
      </defs>
      <rect width={W} height={H} fill={`url(#g${gid})`} />
      <path d={d} fill="none" stroke="rgb(var(--bg))" strokeWidth="9" strokeLinecap="round" strokeLinejoin="round" opacity="0.9" />
      <path d={d} fill="none" stroke={`url(#l${gid})`} strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={start[0]} cy={start[1]} r="6.5" fill="#4CB782" stroke="rgb(var(--bg))" strokeWidth="2.5" />
      {live ? (
        <circle cx={end[0]} cy={end[1]} r="7" fill="rgb(var(--hot))" stroke="#fff" strokeWidth="2.5">
          <animate attributeName="r" values="6;9;6" dur="1.4s" repeatCount="indefinite" />
        </circle>
      ) : (
        <g transform={`translate(${end[0]} ${end[1]})`}>
          <path d="M0 0V-17" stroke="rgb(var(--ink))" strokeWidth="2" />
          <path d="M0 -17h11v8H0z" fill="rgb(var(--ink))" />
          <path d="M0 -17h3.7v4H0zM7.3 -17H11v4H7.3zM3.7 -13h3.6v4H3.7z" fill="rgb(var(--bg))" />
        </g>
      )}
      <g transform={`translate(12 ${H - 12})`}>
        <path d={`M0 -4V0H${geo.bar.toFixed(1)}V-4`} fill="none" stroke="rgb(var(--mute))" strokeWidth="1.5" />
        <text x={geo.bar + 5} y="0" fontSize="10" fill="rgb(var(--mute))" fontFamily="Inter Variable, sans-serif">{geo.barLabel}</text>
      </g>
    </svg>
  );
}
