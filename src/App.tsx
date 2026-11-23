import { APP_NAME } from './lib/brand';
import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import type { ActivityId } from './data/activities';
import { motion } from 'framer-motion';
import { useGame } from './lib/store';
import { Onboarding } from './screens/Onboarding';
import { Home } from './screens/Home';

import { ThemeUnlocked } from './components/LevelBadge';
import { BadgeUnlocked } from './components/Badge';
import { Header, Segmented } from './components/ui';
import { useBackFallback } from './lib/back';
import { Tour, type TourTab } from './components/Tour';
import { onStartTour, setTourDone, tourDone } from './lib/tour';
import { finishApkUpdate } from './lib/apkUpdate';
// Tempo auf dem Handy: nur Home steckt im Start-Paket. Die anderen Tabs sind eigene Pakete
// und werden direkt nach dem Start im Leerlauf vorgeladen, damit der Tab-Wechsel sofort geht.
const loadTraining = () => import('./screens/Training');
const loadProfile = () => import('./screens/Profile');
const loadStats = () => import('./screens/Stats');
const loadLeaderboard = () => import('./screens/Leaderboard');
const loadBlog = () => import('./screens/Blog');
const Training = lazy(() => loadTraining().then((m) => ({ default: m.Training })));
const Profile = lazy(() => loadProfile().then((m) => ({ default: m.Profile })));
const Stats = lazy(() => loadStats().then((m) => ({ default: m.Stats })));
const Leaderboard = lazy(() => loadLeaderboard().then((m) => ({ default: m.Leaderboard })));
const Blog = lazy(() => loadBlog().then((m) => ({ default: m.Blog })));
function preloadTabs() {
  const run = () => { void loadTraining(); void loadProfile(); void loadStats(); void loadLeaderboard(); void loadBlog(); };
  const w = window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number };
  if (w.requestIdleCallback) w.requestIdleCallback(run, { timeout: 2500 }); else setTimeout(run, 1200);
}

type Tab = 'home' | 'training' | 'rank' | 'blog' | 'profile';

const TABS: { id: Tab; label: string; icon: JSX.Element }[] = [
  { id: 'home', label: 'Home', icon: <path d="M3 11l9-8 9 8v10h-6v-6H9v6H3z" /> },
  { id: 'training', label: 'Training', icon: <path d="M2 10h3v4H2zM19 10h3v4h-3zM5 7h3v10H5zM16 7h3v10h-3zM8 11h8v2H8z" /> },
  { id: 'rank', label: 'Rangliste', icon: <path d="M3 21V13h5v8zM9.5 21V8h5v13zM16 21v-6h5v6zM12 2l1.2 2.4 2.6.4-1.9 1.8.5 2.6L12 8l-2.4 1.2.5-2.6L8.2 4.8l2.6-.4z" /> },
  { id: 'blog', label: 'Blog', icon: <path d="M5 3h10l4 4v14H5zM14 3v5h5M8 12h8v1.8H8zM8 15.5h8v1.8H8zM8 8.5h4v1.8H8z" fillRule="evenodd" /> },
  { id: 'profile', label: 'Ich', icon: <path d="M12 12a5 5 0 1 0 0-10 5 5 0 0 0 0 10zm-9 10a9 9 0 0 1 18 0z" /> },
];

export function App() {
  const g = useGame();
  const [tab, setTab] = useState<Tab>('home');
  const [fullscreen, setFullscreen] = useState(false);
  const [trainingKey, setTrainingKey] = useState(0);
  const [startAct, setStartAct] = useState<ActivityId | undefined>();
  const [me, setMe] = useState<'profil' | 'stats'>('profil');
  const mainRef = useRef<HTMLElement>(null);
  // Einführungs-Tour: einmal nach dem Onboarding, später über Einstellungen
  const [tour, setTour] = useState(false);
  useEffect(() => { if (g.profile) void tourDone().then((d) => { if (!d) setTour(true); }); }, [!!g.profile]);
  useEffect(() => onStartTour(() => setTour(true)), []);
  // Nach "App aktualisieren": Installationsdatei weg, einmal Bescheid sagen
  const [updated, setUpdated] = useState<string | null>(null);
  useEffect(() => { void finishApkUpdate().then((m) => { if (m) setUpdated(m); }); }, []);
  useEffect(() => { if (!updated) return; const t = setTimeout(() => setUpdated(null), 8000); return () => clearTimeout(t); }, [updated]);
  const closeTour = () => { setTour(false); setFullscreen(false); setTab('home'); void setTourDone(); };
  const tourTab = (t: TourTab) => {
    setFullscreen(false);
    if (t === 'profile') setMe('profil');
    if (t === 'training' && tab !== 'training') { setStartAct(undefined); setTrainingKey((k) => k + 1); }
    setTab(t);
  };
  // Beim Tab-Wechsel oben anfangen, nicht mitten im neuen Screen
  useEffect(() => { mainRef.current?.scrollTo(0, 0); }, [tab, me]);
  useEffect(() => { if (g.profile) preloadTabs(); }, [g.profile]);

  // Zurück-Taste: von jedem anderen Tab erst nach Home, auf Home schließt sie die App
  useBackFallback(g.profile && tab !== 'home' ? () => { setFullscreen(false); setTab('home'); } : null);
  // Blog lässt sich in den Einstellungen ausblenden
  const blogOn = g.settings.blog !== false;
  useEffect(() => { if (!blogOn && tab === 'blog') setTab('home'); }, [blogOn, tab]);

  if (!g.ready) return <div className="h-full grid place-items-center font-display text-2xl text-ink">{APP_NAME}</div>;
  if (!g.profile) return <Onboarding />;

  const go = (t: Tab) => { if (t === 'training' && tab === 'training') setTrainingKey((k) => k + 1); if (t === 'training') setStartAct(undefined); setTab(t); };
  /** Von Home direkt in eine Übung (z. B. Tagesauftrag) */
  const startActivity = (id: ActivityId) => { setStartAct(id); setTrainingKey((k) => k + 1); setTab('training'); };

  // Profil und Statistik teilen sich einen Tab, oben umschaltbar
  const meTop = (
    <>
      <Header title={g.profile.name} />
      <Segmented className="mx-4 mb-4" value={me} onChange={setMe} options={[{ id: 'profil', label: 'Profil' }, { id: 'stats', label: 'Statistik' }]} />
    </>
  );

  return (
    <div className="relative h-full flex flex-col max-w-lg mx-auto">
      <main ref={mainRef} className={`flex-1 overflow-y-auto no-scrollbar ${fullscreen ? '' : 'pb-24'}`}>
        {/* Kurzes Einblenden ohne Warten auf das Ausblenden des alten Tabs: Wechsel fühlt sich sofort an */}
        <motion.div key={tab === 'profile' ? tab + me : tab} initial={{ opacity: 0.4 }} animate={{ opacity: 1 }} transition={{ duration: 0.12 }} className="min-h-full">
          <Suspense fallback={null}>
            {tab === 'home' && <Home onStart={startActivity} />}
            {tab === 'training' && <Training key={trainingKey} initial={startAct} onFullscreen={setFullscreen} onDone={() => setTab('home')} />}
            {tab === 'rank' && <Leaderboard onFullscreen={setFullscreen} />}
            {tab === 'blog' && blogOn && <Blog onFullscreen={setFullscreen} />}
            {tab === 'profile' && (me === 'stats' ? <Stats top={meTop} /> : <Profile top={meTop} />)}
          </Suspense>
        </motion.div>
      </main>
      {updated && (
        <button className="absolute inset-x-4 top-[calc(max(env(safe-area-inset-top),12px)+8px)] z-40 rounded-2xl bg-panel px-4 py-3 text-left text-sm shadow-float ring-1 ring-neon/50" onClick={() => setUpdated(null)}>
          <span className="font-semibold text-neon">{updated}</span>
        </button>
      )}
      {/* Neues Level-Design freigeschaltet: feiern, aber nicht mitten im Training */}
      <ThemeUnlocked theme={fullscreen || tour ? null : g.themeUnlocked} onClose={() => void g.dismissThemeUnlocked()} />
      {/* Neue Abzeichen-Stufe: erst nach dem Level-Design zeigen */}
      <BadgeUnlocked hidden={fullscreen || tour || !!g.themeUnlocked} />
      {!fullscreen && (
        // Schwebende Tab-Leiste: aktiver Tab als Verlaufs-Pille mit Namen, die anderen nur als Symbol
        <nav className="pointer-events-none absolute inset-x-0 bottom-0 z-30 px-4 pb-safe">
          <div className="pointer-events-auto mb-2 flex h-[62px] items-center justify-around rounded-full bg-panel/[0.97] px-2 shadow-float">
            {TABS.filter((t) => t.id !== 'blog' || blogOn).map((t) => {
              const on = tab === t.id;
              return (
                <button key={t.id} data-tour={`tab-${t.id}`} onClick={() => go(t.id)} aria-current={on ? 'page' : undefined} aria-label={t.label}
                  className={`flex h-11 items-center gap-1.5 rounded-full px-3.5 transition-colors ${on ? 'bg-hot' : 'text-mute'}`}>
                  <svg viewBox="0 0 24 24" className="h-[22px] w-[22px]" fill="currentColor">{t.icon}</svg>
                  {on && <span className="font-sport text-[13px] font-semibold tracking-[0.06em]">{t.label}</span>}
                </button>
              );
            })}
          </div>
        </nav>
      )}
      <Tour open={tour} blogOn={blogOn} onTab={tourTab} onClose={closeTour} />
    </div>
  );
}
