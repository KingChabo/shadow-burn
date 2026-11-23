import { useEffect, useLayoutEffect, useState, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { APP_NAME } from '../lib/brand';
import { STREAK_MIN_POINTS } from '../lib/streak';
import { useBack } from '../lib/back';
import { Icon, type IconName } from './Icon';
import { GemIcon } from './ui';

/**
 * Einführungs-Tour beim ersten Start: Schritt für Schritt durch die App klicken.
 * Jeder Schritt wechselt bei Bedarf den Tab und hebt ein Element hervor (Attribut data-tour="…").
 * Findet sich das Element nicht (z. B. Blog ausgeblendet), erscheint die Karte in der Mitte.
 */

export type TourTab = 'home' | 'training' | 'rank' | 'blog' | 'profile';

interface Step {
  tab: TourTab;
  /** data-tour-Wert des hervorgehobenen Elements; leer = Karte in der Mitte */
  target?: string;
  icon?: IconName | 'gem';
  title: string;
  body: ReactNode;
  art?: ReactNode;
  needsBlog?: boolean;
}

const STEPS: Step[] = [
  {
    tab: 'home', icon: 'bolt', title: `Willkommen bei ${APP_NAME}`,
    body: <>In einer Minute zeigen wir dir, wie alles funktioniert. Tippe auf <b>Tour starten</b> oder überspringe die Tour. Du findest sie später unter <b>Ich → Account</b>.</>,
  },
  {
    tab: 'home', target: 'streak', icon: 'flame', title: 'Streak und Gems',
    body: <>Die Flamme zählt deine Tage am Stück. Ab <b>{STREAK_MIN_POINTS} Punkten</b> ist der Tag gesichert. Gems bekommst du für Tagesaufträge, Rekorde und Abzeichen.</>,
  },
  {
    tab: 'home', target: 'rings', icon: 'trophy', title: 'Deine Ringe',
    body: <>Außen siehst du den Weg zum nächsten Level, innen deine Punkte heute bis zum Tagesziel. Jedes Training bringt Punkte.</>,
  },
  {
    tab: 'home', target: 'quest', icon: 'star', title: 'Auftrag des Tages',
    body: <>Jeden Tag gibt es neue Aufträge. Tippe auf das Banner und die passende Übung startet sofort.</>,
  },
  {
    tab: 'training', target: 'train-kinds', icon: 'timer', title: 'Training',
    body: <>Übungen ohne Gerät, Geräte im Gym mit Sätzen und Gewicht, und eigene Workouts zum Nachmachen. Oben schaltest du um.</>,
  },
  {
    tab: 'training', target: 'cam-card', icon: 'camera', title: 'Die Kamera zählt mit',
    body: <>Bei Übungen mit <b>Kamera</b> (Liegestütze, Sit-ups, Kniebeugen, Hampelmann, Plank) zählt das Handy deine Wiederholungen selbst und gibt +20 % Formbonus. Das Bild wird nur auf dem Handy ausgewertet und nie gespeichert.</>,
  },
  {
    tab: 'training', icon: 'phone', title: 'So stellst du das Handy hin',
    art: <CameraArt />,
    body: <>Handy <b>1–2 m seitlich</b> auf den Boden stellen oder anlehnen. Dein <b>Oberkörper im Bild reicht</b>, die Füße müssen nicht drauf. Vor jeder Übung steht, wie es am besten geht. Ohne Kamera kannst du immer auch selbst tippen.</>,
  },
  {
    tab: 'blog', target: 'blog-start', icon: 'route', title: 'Blog: deine Sessions', needsBlog: true,
    body: <>Für Laufen, Radfahren oder Wandern: Session starten, der Timer läuft, GPS zeichnet auf Wunsch die Strecke. Danach schreibst du einen Beitrag mit Text und Fotos.</>,
  },
  {
    tab: 'blog', target: 'blog-swap', icon: 'qr', title: 'Beiträge tauschen', needsBlog: true,
    body: <>Mit <b>Tauschen</b> zeigt dein Handy einen bewegten QR-Code. Dein Freund scannt ihn und sieht deine Beiträge, ganz ohne Internet.</>,
  },
  {
    tab: 'rank', target: 'rank-actions', icon: 'scan', title: 'Rangliste mit Freunden',
    body: <>Zeig deinen Code (<b>QR</b>), dein Freund tippt <b>Scannen</b>, dann umgekehrt. Bei Treffen geht es auch per Bluetooth (in den Einstellungen einschalten).</>,
  },
  {
    tab: 'rank', target: 'rank-boards', icon: 'trophy', title: 'Punkte, Streak, Rekorde',
    body: <>Vergleicht euch nach Punkten der Woche, Streak oder Rekorden je Disziplin. Tippe auf einen Namen für alle Details.</>,
  },
  {
    tab: 'profile', target: 'shop', icon: 'gem', title: 'Avatar, Shop und Abzeichen',
    body: <>Mit Gems kleidest du deinen Avatar ein und kaufst Namens-Tags, Hintergründe oder Streak-Schutz. Abzeichen gibt es in Bronze, Silber und Gold.</>,
  },
  {
    tab: 'home', icon: 'check', title: 'Alles bereit',
    body: <>Alles bleibt offline auf deinem Handy. Die Tour findest du jederzeit unter <b>Ich → Account → Einführung ansehen</b>. Viel Spaß!</>,
  },
];

type Rect = { x: number; y: number; w: number; h: number };
const PAD = 8;

export function Tour({ open, blogOn, onTab, onClose }: { open: boolean; blogOn: boolean; onTab: (t: TourTab) => void; onClose: () => void }) {
  const steps = STEPS.filter((s) => blogOn || !s.needsBlog);
  const [i, setI] = useState(0);
  const [rect, setRect] = useState<Rect | null>(null);
  const [vh, setVh] = useState(() => window.innerHeight);
  const step = steps[Math.min(i, steps.length - 1)];
  const last = i >= steps.length - 1;

  useEffect(() => { if (open) setI(0); }, [open]);
  useBack(open, () => (i > 0 ? setI(i - 1) : onClose()));

  // Tab wechseln, dann auf das Ziel warten (Tabs laden verzögert) und es in den Blick scrollen
  useLayoutEffect(() => {
    if (!open) return;
    onTab(step.tab);
    setRect(null);
    if (!step.target) return;
    let raf = 0; let stop = false; let scrolled = false;
    const t0 = performance.now();
    const find = () => {
      if (stop) return;
      const el = document.querySelector<HTMLElement>(`[data-tour="${step.target}"]`);
      if (el) {
        if (!scrolled) { el.scrollIntoView({ block: 'center' }); scrolled = true; }
        const r = el.getBoundingClientRect();
        if (r.width > 0) setRect({ x: r.left, y: r.top, w: r.width, h: r.height });
      }
      // weiter messen, solange Tab-Wechsel und Animationen laufen
      if (performance.now() - t0 < 1200) raf = requestAnimationFrame(find);
    };
    raf = requestAnimationFrame(find);
    return () => { stop = true; cancelAnimationFrame(raf); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, i]);

  useEffect(() => {
    const r = () => { setVh(window.innerHeight); if (step?.target) { const el = document.querySelector<HTMLElement>(`[data-tour="${step.target}"]`); const b = el?.getBoundingClientRect(); if (b) setRect({ x: b.left, y: b.top, w: b.width, h: b.height }); } };
    window.addEventListener('resize', r);
    return () => window.removeEventListener('resize', r);
  }, [step]);

  if (!open) return null;

  const hole = rect ? { left: rect.x - PAD, top: rect.y - PAD, width: rect.w + PAD * 2, height: rect.h + PAD * 2 } : null;
  // Karte unter dem Ziel, wenn es in der oberen Hälfte liegt, sonst darüber
  const below = hole ? hole.top + hole.height / 2 < vh / 2 : false;
  const cardPos = !hole ? 'center' : below ? { top: hole.top + hole.height + 14 } : { bottom: vh - hole.top + 14 };

  return (
    <div className="fixed inset-0 z-[90]" role="dialog" aria-modal="true" aria-label="Einführung">
      {/* Abdunkeln mit Loch um das Ziel; Klicks auf die App sind gesperrt */}
      <div className="absolute inset-0" onClick={(e) => e.stopPropagation()} />
      {hole ? (
        <motion.div
          className="pointer-events-none absolute rounded-[22px] ring-2 ring-[rgb(var(--hot))]"
          initial={false}
          animate={{ ...hole }}
          transition={{ type: 'spring', stiffness: 320, damping: 32 }}
          style={{ boxShadow: '0 0 0 200vmax rgba(4,6,10,0.78)' }}
        >
          <motion.span className="absolute inset-0 rounded-[22px] ring-2 ring-[rgb(var(--hot))]" animate={{ opacity: [0.9, 0, 0.9], scale: [1, 1.06, 1] }} transition={{ repeat: Infinity, duration: 1.8 }} />
        </motion.div>
      ) : (
        <div className="pointer-events-none absolute inset-0 bg-[rgba(4,6,10,0.82)]" />
      )}

      <AnimatePresence mode="wait">
        <motion.div
          key={i}
          initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.18 }}
          className={cardPos === 'center' ? 'pointer-events-none absolute inset-0 flex items-center justify-center px-4' : 'absolute inset-x-4 mx-auto max-w-md'}
          style={cardPos === 'center' ? undefined : cardPos}
        >
          <div className="pointer-events-auto w-full max-w-md">
          <div className="rounded-3xl bg-panel p-5 text-ink shadow-float ring-1 ring-line">
            <div className="flex items-center gap-3">
              {step.icon && (
                <span className="bg-hot grid h-10 w-10 shrink-0 place-items-center rounded-full">
                  {step.icon === 'gem' ? <GemIcon className="h-5 w-5" /> : <Icon name={step.icon} className="h-5 w-5" />}
                </span>
              )}
              <p className="font-sport text-[24px] leading-tight">{step.title}</p>
            </div>
            {step.art && <div className="mt-3">{step.art}</div>}
            <p className="mt-3 text-[15px] leading-relaxed text-ink/85">{step.body}</p>
            <div className="mt-4 flex items-center gap-1.5" aria-hidden>
              {steps.map((_, k) => <span key={k} className={`h-1.5 rounded-full transition-all ${k === i ? 'w-5 bg-[rgb(var(--hot))]' : 'w-1.5 bg-line'}`} />)}
            </div>
            <div className="mt-4 flex items-center gap-2">
              {!last && <button onClick={onClose} className="px-2 py-3 text-sm font-semibold text-mute">Überspringen</button>}
              <div className="flex-1" />
              {i > 0 && <button onClick={() => setI(i - 1)} className="rounded-2xl bg-raised px-4 py-3 text-[15px] font-semibold ring-1 ring-line">Zurück</button>}
              <button onClick={() => (last ? onClose() : setI(i + 1))} className="bg-hot rounded-2xl px-5 py-3 text-[15px] font-semibold">
                {last ? "Los geht's" : i === 0 ? 'Tour starten' : 'Weiter'}
              </button>
            </div>
            <p className="num mt-2 text-right text-[11px] text-mute">{i + 1} / {steps.length}</p>
          </div>
          </div>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

/** Skizze: Handy seitlich am Boden, Person im Liegestütz, Oberkörper im Bild */
function CameraArt() {
  return (
    <svg viewBox="0 0 300 120" className="w-full rounded-2xl bg-raised" role="img" aria-label="Handy seitlich am Boden, Oberkörper im Bild">
      <defs>
        <linearGradient id="tourCone" x1="0" x2="1">
          <stop offset="0" stopColor="rgb(var(--hot))" stopOpacity="0.45" />
          <stop offset="1" stopColor="rgb(var(--hot))" stopOpacity="0.05" />
        </linearGradient>
      </defs>
      <line x1="10" y1="102" x2="290" y2="102" stroke="rgb(var(--line))" strokeWidth="2" />
      {/* Sichtfeld */}
      <path d="M46 90 L250 26 L250 102 L46 96 Z" fill="url(#tourCone)" />
      {/* Handy */}
      <rect x="30" y="78" width="16" height="24" rx="3" fill="rgb(var(--ink))" />
      <circle cx="42" cy="84" r="2.2" fill="rgb(var(--hot))" />
      {/* Person im Liegestütz */}
      <g stroke="rgb(var(--ink))" strokeWidth="6" strokeLinecap="round" fill="none">
        <path d="M150 60 L262 84" />
        <path d="M160 63 L160 100" />
        <path d="M262 84 L272 100" />
      </g>
      <circle cx="138" cy="56" r="10" fill="rgb(var(--ink))" />
      {/* Abstand */}
      <g stroke="rgb(var(--mute))" strokeWidth="1.5" strokeDasharray="4 4">
        <path d="M48 107 L150 107" />
      </g>
      <text x="99" y="119" textAnchor="middle" fontSize="10" fill="rgb(var(--mute))" fontFamily="Inter Variable, sans-serif">1–2 m</text>
    </svg>
  );
}
