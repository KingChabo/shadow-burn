import { motion } from 'framer-motion';
import { useGame } from '../lib/store';
import { Btn, Card, GemIcon } from '../components/ui';
import { levelFromXp } from '../lib/level';
import { dayKey, hoursLeftToday } from '../lib/date';
import { questProgress, questsFor } from '../lib/quests';
import { LOCK_PRICE_GEMS, MAX_LOCKS, STREAK_MIN_POINTS } from '../lib/streak';
import { ACT, type ActivityId } from '../data/activities';
import { useState } from 'react';
import { Icon } from '../components/Icon';
import { LevelBadge, ThemeLibrary } from '../components/LevelBadge';
import { Avatar } from '../components/Avatar';
import { ShopOverlay } from './Shop';
import { MuscleCard } from '../components/MuscleCard';
import { RecapBanner } from './Recap';

export function Home({ onStart }: { onStart: (id: ActivityId) => void }) {
  const g = useGame();
  const lv = levelFromXp(g.wallet.xp);
  const today = dayKey();
  const doneToday = g.streak.lastActiveDay === today;
  const pointsToday = g.todays.reduce((s, w) => s + w.points, 0) + g.gymPointsToday;
  const h = Math.floor(hoursLeftToday());
  const quests = questsFor(today, g.questSwap, g.dayQuests);
  const canSwap = g.questSwap?.day !== today;

  let motivation: string;
  const missing = Math.max(0, STREAK_MIN_POINTS - pointsToday);
  const fmt = (n: number) => n.toLocaleString('de-DE');
  if (doneToday) motivation = `Heute gesichert`;
  else if (g.streak.current > 0) motivation = `Noch ${fmt(missing)} P · ${h} Std.`;
  else motivation = `${fmt(missing)} P bis zum Start`;
  const [help, setHelp] = useState(false);
  const [lib, setLib] = useState(false);
  const [shop, setShop] = useState<null | 'kleidung' | 'schutz'>(null);

  // Hero zeigt den nächsten offenen Auftrag; sind alle erledigt, gibt es ein Lob
  const openQuest = quests.find((q) => !g.claimed.includes(q.id));
  const featured = ACT[(openQuest ?? quests[0]).activityId];
  const weekday = new Date().toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long' });

  const pointsGoal = Math.max(STREAK_MIN_POINTS, g.settings.dailyGoal ?? STREAK_MIN_POINTS);
  const firstName = (g.profile?.name ?? '').split(' ')[0];
  const shortDate = new Date().toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit' });
  const heroProg = openQuest ? Math.min(1, questProgress(openQuest, g.todays) / openQuest.target) : 1;
  const heroDone = openQuest ? Math.min(openQuest.target, Math.round(questProgress(openQuest, g.todays) * 10) / 10) : 0;

  return (
    <div className="space-y-3 px-4 pb-6 pt-[max(env(safe-area-inset-top),16px)]">
      {/* Kopf: Datum, große Arena-Begrüßung, Streak und Gems als Pillen */}
      <div className="flex items-end justify-between gap-2 pb-1">
        <div className="min-w-0">
          <p className="kicker" title={weekday}>{shortDate}</p>
          <h1 className="font-sport mt-1 truncate text-[38px] leading-none">Los, {firstName}.</h1>
        </div>
        <div className="flex shrink-0 gap-1.5" data-tour="streak">
          <button onClick={() => setHelp(true)} title="Streak" aria-label={`Streak ${g.streak.current} Tage`} className="font-sport flex items-center gap-1 rounded-full bg-panel px-2.5 py-1.5 text-[15px] font-semibold shadow-card"><Icon name="flame" className="h-4 w-4 text-[rgb(var(--hot))]" />{g.streak.current}</button>
          <button onClick={() => setHelp(true)} title="Gems" aria-label={`${g.wallet.gems} Gems`} className="font-sport flex items-center gap-1 rounded-full bg-panel px-2.5 py-1.5 text-[15px] font-semibold shadow-card"><GemIcon className="h-3.5 w-3.5" />{fmt(g.wallet.gems)}</button>
        </div>
      </div>

      <RecapBanner />

      {g.lockNotice && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="rounded-3xl bg-panel p-4 shadow-card">
          <p className="flex items-start gap-2.5 text-sm">
            <Icon name={g.lockNotice.broken ? 'broken' : 'snow'} className={`h-5 w-5 shrink-0 ${g.lockNotice.broken ? 'text-bad' : 'text-volt'}`} />
            <span>{g.lockNotice.broken
              ? `Deine ${g.lockNotice.lostStreak}-Tage-Streak ist gerissen. Heute fängt eine neue an.`
              : g.lockNotice.usedLocks
                ? `Dein Streak-Schutz hat dich gerettet (${g.lockNotice.usedLocks} verbraucht)${g.lockNotice.usedRest ? ', dazu dein freier Ruhetag' : ''}.`
                : 'Gestern war Ruhetag. Streak läuft weiter.'}</span>
          </p>
          <button className="mt-2 text-sm font-medium text-neon" onClick={g.dismissLockNotice}>Verstanden</button>
        </motion.div>
      )}

      {/* Auftrag des Tages: Verlaufs-Banner mit Streifen */}
      <motion.button data-tour="quest" whileTap={{ scale: 0.985 }} onClick={() => onStart(featured.id)} className="bg-hot relative block w-full overflow-hidden rounded-3xl px-5 py-[18px] text-left">
        <span className="stripes pointer-events-none absolute -right-12 -top-8 h-60 w-48 rounded-[40px]" />
        <p className="kicker relative !text-white/85">{openQuest ? 'Auftrag heute' : 'Alles geschafft'}</p>
        <p className="font-sport relative mt-1.5 text-[34px] leading-[1.02]">{openQuest ? openQuest.label : 'Stark! Noch eine Runde?'}</p>
        <div className="relative mt-3.5 flex items-center gap-3.5">
          <div className="flex-1">
            {openQuest ? (
              <>
                <div className="num mb-1.5 flex justify-between text-[13px] font-extrabold"><span>{fmt(heroDone)} / {fmt(openQuest.target)}</span><span>{Math.round(heroProg * 100)} %</span></div>
                <div className="h-2 overflow-hidden rounded-full bg-white/30"><motion.div className="h-full rounded-full bg-white" initial={{ width: 0 }} animate={{ width: `${heroProg * 100}%` }} transition={{ duration: 0.8 }} /></div>
              </>
            ) : <p className="text-sm font-bold">{featured.name} nochmal trainieren</p>}
          </div>
          <span className="grid h-[52px] w-[52px] shrink-0 place-items-center rounded-full bg-white text-[rgb(var(--hot))]" aria-label={`${featured.name} starten`}>
            <svg viewBox="0 0 24 24" className="ml-0.5 h-[22px] w-[22px]" fill="currentColor"><path d="M7 4v16l13-8z" /></svg>
          </span>
        </div>
      </motion.button>

      {/* Ringe: außen Level-Fortschritt (Rang), innen Punkte heute (Tagesziel) */}
      <Card className="flex items-center gap-4 !py-3.5" tour="rings">
        <div className="relative shrink-0">
          <Rings size={136} outer={lv.progress} inner={Math.min(1, pointsToday / pointsGoal)} />
          <div className="absolute inset-0 grid place-items-center">
            <LevelBadge level={lv.level} theme={g.theme} size={44} onLongPress={() => setLib(true)} />
          </div>
        </div>
        <div className="min-w-0 flex-1 space-y-2">
          <div>
            <p className="kicker flex items-center gap-1.5 !text-[rgb(var(--hot))]"><span className="bg-hot h-2.5 w-2.5 shrink-0 rounded-full" />Rang {g.theme.name} · Level {lv.level}</p>
            <p className="font-sport num text-[28px] leading-tight">{Math.round(lv.progress * 100)}<span className="text-[15px] text-mute"> %</span></p>
            <p className="text-[11px] leading-snug text-mute">Noch {fmt(lv.needed - lv.intoLevel)} P bis Level {lv.level + 1}</p>
          </div>
          <div>
            <p className="kicker flex items-center gap-1.5 !text-neon"><span className="h-2.5 w-2.5 shrink-0 rounded-full bg-gradient-to-br from-[#FFB020] to-[rgb(var(--accent))]" />Punkte heute</p>
            <p className="font-sport num text-[28px] leading-tight">{fmt(pointsToday)}<span className="text-[15px] text-mute"> / {fmt(pointsGoal)}</span></p>
          </div>
          <p className="text-xs leading-snug text-mute"><Icon name="flame" className="mr-0.5 inline h-3.5 w-3.5 -translate-y-px text-[rgb(var(--hot))]" />Streak {g.streak.current} {g.streak.current === 1 ? 'Tag' : 'Tage'} · {motivation}</p>
        </div>
      </Card>

      <MuscleCard />

      <Card className="flex items-center gap-3 !py-3">
        <button onClick={() => setShop('kleidung')} className="shrink-0 rounded-xl bg-raised" aria-label="Avatar im Shop einkleiden">
          <Avatar look={g.avatar} level={lv.level} className="h-24 w-12" />
        </button>
        <div className="min-w-0 flex-1">
          <p className="font-sport flex items-center gap-1.5 text-lg font-semibold"><GemIcon className="h-4 w-4" /> Gem-Shop</p>
          <p className="text-xs leading-snug text-mute">Kleidung, Namens-Tags, Hintergründe, Titel</p>
          <div className="mt-2 flex items-center gap-1.5">
            {Array.from({ length: MAX_LOCKS }).map((_, i) => (
              <span key={i} className={`grid h-6 w-6 place-items-center rounded-md ${i < g.streak.locks ? 'bg-volt/20 text-volt' : 'border border-dashed border-line text-mute/50'}`}>
                <Icon name="snow" className="h-3 w-3" />
              </span>
            ))}
            <button onClick={() => setShop('schutz')} className="ml-1 rounded-full bg-raised px-2.5 py-1 text-xs text-mute">
              {g.streak.locks >= MAX_LOCKS ? 'voll' : `+1 · ${LOCK_PRICE_GEMS}`}
            </button>
          </div>
        </div>
        <Btn kind="ghost" className="!px-3 !py-2 !text-sm" onClick={() => setShop('kleidung')}>Öffnen</Btn>
      </Card>

      <div className="flex items-baseline justify-between px-1 pt-2">
        <h2 className="font-sport text-xl font-semibold">Tagesaufträge</h2>
        <span className="kicker flex items-center gap-1 !text-[rgb(var(--hot))]">+2 <GemIcon className="h-3 w-3" /> je</span>
      </div>
      <p className="-mt-1 px-1 text-xs text-mute">Ausgesucht für Muskeln, die heute erholt sind.</p>
      <Card className="!py-1">
        <div className="divide-y divide-line">
          {quests.map((q) => {
            const done = g.claimed.includes(q.id);
            const prog = Math.min(q.target, questProgress(q, g.todays));
            return (
              <div key={q.id} className="flex items-center gap-3 py-2.5">
                <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-full ${done ? 'bg-hot' : 'bg-raised text-mute'}`}>
                  {done && <Icon name="check" className="h-4 w-4" strokeWidth={3} />}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2 text-sm font-bold">
                    <span className={`truncate ${done ? 'text-mute' : ''}`}>{q.label}</span>
                    <span className="flex shrink-0 items-center gap-1.5">
                      {canSwap && !done && <button onClick={() => void g.swapQuest(quests.indexOf(q))} aria-label="Auftrag tauschen" className="rounded-full bg-raised px-2 py-0.5 text-xs text-neon">↻</button>}
                      <span className="font-sport num text-[14px] font-semibold text-mute">{done ? 'Erledigt' : `${Math.round(prog * 10) / 10} / ${q.target}`}</span>
                    </span>
                  </div>
                  {!done && (
                    <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-raised">
                      <div className="bg-hot h-full rounded-full" style={{ width: `${(prog / q.target) * 100}%` }} />
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </Card>
      <Card>
        <button className="flex w-full items-center justify-between" onClick={() => setHelp((x) => !x)}>
          <span className="font-sport text-lg font-semibold">Hilfe</span>
          <Icon name="down" className={`h-5 w-5 text-mute transition-transform ${help ? 'rotate-180' : ''}`} />
        </button>
        {help && (
          <dl className="mt-3 space-y-2 text-sm">
            <div><dt className="inline font-semibold"><Icon name="bolt" className="mr-1 inline h-4 w-4 text-neon" />Punkte: </dt><dd className="inline text-mute">für jedes Training, zählen für Level und Rangliste.</dd></div>
            <div><dt className="inline font-semibold"><GemIcon className="mr-1 inline h-4 w-4" />Gems: </dt><dd className="inline text-mute">für Aufträge und Rekorde, ausgeben im Shop.</dd></div>
            <div><dt className="inline font-semibold">Streak: </dt><dd className="inline text-mute">Tage am Stück mit {STREAK_MIN_POINTS}+ Punkten. 1 Ruhetag pro Woche ist frei.</dd></div>
            <div><dt className="inline font-semibold">Schutz: </dt><dd className="inline text-mute">rettet die Streak automatisch (max. {MAX_LOCKS}).</dd></div>
            <div><dt className="inline font-semibold">Tageslimit: </dt><dd className="inline text-mute">über 1.500 P zählt nur die Hälfte.</dd></div>
            <div><dt className="inline font-semibold">Designs: </dt><dd className="inline text-mute">lange aufs Level-Abzeichen drücken.</dd></div>
          </dl>
        )}
      </Card>
      <ThemeLibrary open={lib} level={lv.level} activeId={g.theme.id} onPick={(id) => void g.pickTheme(id)} onClose={() => setLib(false)} />
      <ShopOverlay open={shop !== null} initialTab={shop ?? 'kleidung'} onClose={() => setShop(null)} />
    </div>
  );
}

/** Zwei Fortschrittsringe (außen Punkte heute, innen Level), Verlauf aus der Akzentfarbe */
function Rings({ size, outer, inner }: { size: number; outer: number; inner: number }) {
  const ring = (r: number, p: number, id: string) => {
    const c = 2 * Math.PI * r;
    return (
      <>
        <circle cx="100" cy="100" r={r} fill="none" className="stroke-raised" strokeWidth="20" />
        {p > 0 && <motion.circle cx="100" cy="100" r={r} fill="none" stroke={`url(#${id})`} strokeWidth="20" strokeLinecap="round"
          transform="rotate(-90 100 100)" strokeDasharray={c} initial={{ strokeDashoffset: c }} animate={{ strokeDashoffset: c * (1 - Math.min(1, p)) }} transition={{ duration: 0.9, ease: 'easeOut' }} />}
      </>
    );
  };
  return (
    <svg viewBox="0 0 200 200" width={size} height={size}>
      <defs>
        <linearGradient id="ringA" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#FFB020" /><stop offset="1" style={{ stopColor: 'rgb(var(--accent))' }} /></linearGradient>
        <linearGradient id="ringB" x1="0" y1="0" x2="1" y2="1"><stop offset="0" style={{ stopColor: 'rgb(var(--accent))' }} /><stop offset="1" style={{ stopColor: 'rgb(var(--hot))' }} /></linearGradient>
      </defs>
      {ring(84, outer, 'ringB')}
      {ring(58, inner, 'ringA')}
    </svg>
  );
}
