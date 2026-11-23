// Linien-Icons als SVG (keine Emojis).
export type IconName =
  | 'camera' | 'tilt' | 'tap' | 'hand' | 'timer' | 'route' | 'snow' | 'trophy' | 'phone'
  | 'check' | 'x' | 'star' | 'bolt' | 'search' | 'gift' | 'broken' | 'flame' | 'install' | 'qr' | 'scan' | 'trash' | 'down' | 'bluetooth' | 'settings' | 'lock';

const P: Record<IconName, JSX.Element> = {
  camera: <><path d="M3 8h4l2-3h6l2 3h4v11H3z" /><circle cx="12" cy="13" r="3.6" /></>,
  tilt: <><rect x="8" y="3" width="8" height="15" rx="2" transform="rotate(-25 12 10)" /><path d="M4 20a9 9 0 0 1 16 0" /></>,
  tap: <><circle cx="12" cy="12" r="3" /><circle cx="12" cy="12" r="7" opacity="0.6" /><circle cx="12" cy="12" r="10.5" opacity="0.3" /></>,
  hand: <><rect x="4" y="4" width="16" height="16" rx="4" /><path d="M12 8v8M8 12h8" /></>,
  timer: <><circle cx="12" cy="14" r="7" /><path d="M12 14V10M9 3h6M12 3v4M18 7l1.5-1.5" /></>,
  route: <><circle cx="6" cy="18" r="2" /><circle cx="18" cy="6" r="2" /><path d="M8 18h6a3 3 0 0 0 0-6h-4a3 3 0 0 1 0-6h6" /></>,
  snow: <><path d="M12 2v20M3.3 7l17.4 10M3.3 17L20.7 7" /><path d="M9 4l3 2 3-2M9 20l3-2 3 2" /></>,
  trophy: <><path d="M7 4h10v5a5 5 0 0 1-10 0z" /><path d="M7 6H4a3 3 0 0 0 3 4M17 6h3a3 3 0 0 1-3 4M12 14v4M8 21h8M9 18h6" /></>,
  phone: <><rect x="7" y="2" width="10" height="20" rx="2.5" /><path d="M11 18.5h2" /></>,
  check: <path d="M4 12.5l5 5L20 6.5" />,
  x: <path d="M6 6l12 12M18 6L6 18" />,
  star: <path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z" />,
  bolt: <path d="M13 2L5 13h6l-1 9 8-11h-6z" />,
  search: <><circle cx="10.5" cy="10.5" r="6.5" /><path d="M15.5 15.5L21 21" /></>,
  gift: <><rect x="3" y="9" width="18" height="12" rx="1.5" /><path d="M3 13h18M12 9v12M12 9c-2-4-6-4-6-1.5S9 9 12 9c3 0 6-.5 6-1.5S14 5 12 9" /></>,
  broken: <><path d="M12 20s-8-5-8-11a4.5 4.5 0 0 1 8-2.8A4.5 4.5 0 0 1 20 9c0 6-8 11-8 11z" /><path d="M12 6.2l-2 4 3 2-2 4" /></>,
  flame: <path d="M12 2c1 4 6 6 6 12a6 6 0 0 1-12 0c0-3 1.5-5 3-6.5 0 2.5 1 4 2.5 4.5C10.5 9 11 5 12 2z" />,
  install: <><path d="M12 3v12M7 10l5 5 5-5" /><path d="M4 17v3h16v-3" /></>,
  qr: <><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><path d="M14 14h3v3h-3zM18 18h3v3h-3zM14 20h1M20 14v1" /></>,
  scan: <><path d="M3 8V5a2 2 0 0 1 2-2h3M16 3h3a2 2 0 0 1 2 2v3M21 16v3a2 2 0 0 1-2 2h-3M8 21H5a2 2 0 0 1-2-2v-3" /><path d="M7 12h10" /></>,
  down: <path d="M6 9l6 6 6-6" />,
  bluetooth: <path d="M7 7l10 10-5 4V3l5 4L7 17" />,
  settings: <><circle cx="12" cy="12" r="3" /><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1" /><circle cx="12" cy="12" r="6.5" /></>,
  lock: <><rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></>,
  trash: <><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" /><path d="M10 11v6M14 11v6" /></>,
};

const FILLED: IconName[] = ['star', 'bolt', 'flame'];

export function Icon({ name, className = 'w-5 h-5', strokeWidth = 2 }: { name: IconName; className?: string; strokeWidth?: number }) {
  const filled = FILLED.includes(name);
  return (
    <svg viewBox="0 0 24 24" className={`inline-block shrink-0 ${className}`} fill={filled ? 'currentColor' : 'none'} stroke={filled ? 'none' : 'currentColor'}
      strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {P[name]}
    </svg>
  );
}
