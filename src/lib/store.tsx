import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { db, getKV, setKV, type Workout } from './db';
import { updateGuard } from './update';
import {
  defaultPrefs, defaultSettings, defaultWallet, moveTrainingDay, saveWeekPlan, startupCheck,
  type LockNotice, type Prefs, type Profile, type Records, type Settings, type Wallet,
} from './game';
import { emptyStreak, buyLock as buyLockLogic, checkStreak, type StreakState } from './streak';
import { dayKey } from './date';
import { setFxSettings } from './fx';
import { buyItem as buyItemLogic, equipItem, normalizeAvatar, type AvatarState, type Slot } from './avatar';
import { buyCos, equipCos, normalizeCos, type CosKind, type CosState } from './cosmetics';
import { activeTheme, chooseTheme, hexToRgbTriplet, unlockedThemes, type Theme, type ThemeChoice } from './themes';
import { levelFromXp } from './level';
import type { DayQuests, QuestSwap } from './quests';
import { ensureDayQuests } from './dayQuests';
import { syncBadges } from './badges';

export interface GameState {
  ready: boolean;
  profile: Profile | null;
  wallet: Wallet;
  streak: StreakState;
  settings: Settings;
  prefs: Prefs;
  records: Records;
  todays: Workout[];
  /** Punkte aus Geräteübungen heute */
  gymPointsToday: number;
  claimed: string[];
  /** Heute getauschter Auftrag */
  questSwap: QuestSwap | null;
  /** Für heute festgelegte Aufträge (nach Erholung gewählt) */
  dayQuests: DayQuests | null;
  lockNotice: LockNotice | null;
  avatar: AvatarState;
  /** Namens-Tag, Hintergrund, Titel */
  cos: CosState;
  level: number;
  /** aktuell geltendes Level-Theme */
  theme: Theme;
  /** gerade neu freigeschaltetes Theme (für die Feier), sonst null */
  themeUnlocked: Theme | null;
  /** Abzeichen mit neuer Stufe, noch nicht angesehen (IDs) */
  badgeNotice: string[];
}

interface Ctx extends GameState {
  reload(): Promise<void>;
  setProfile(p: Profile): Promise<void>;
  setSettings(s: Settings): Promise<void>;
  setPrefs(p: Prefs): Promise<void>;
  buyLock(): Promise<boolean>;
  dismissLockNotice(): Promise<void>;
  /** Wochenplan speichern (on = false: jeden Tag); Fehlermeldung oder null */
  saveWeekPlan(on: boolean, days: (string | null)[]): Promise<string | null>;
  /** Trainingstag dieser Woche verschieben (Tage als YYYY-MM-DD); Fehlermeldung oder null */
  moveTrainingDay(from: string, to: string): Promise<string | null>;
  /** Kleidung kaufen; gibt eine Fehlermeldung oder null zurück */
  buyItem(id: string): Promise<string | null>;
  /** Tag/Hintergrund/Titel kaufen; Fehlermeldung oder null */
  buyCos(kind: CosKind, id: string): Promise<string | null>;
  equipCos(kind: CosKind, id: string | null): Promise<void>;
  equip(slot: Slot, id: string | null): Promise<void>;
  setLook(p: { skin?: number; hair?: number }): Promise<void>;
  pickTheme(id: string): Promise<void>;
  dismissThemeUnlocked(): Promise<void>;
  dismissBadgeNotice(): Promise<void>;
  swapQuest(index: number): Promise<void>;
}

const GameCtx = createContext<Ctx | null>(null);

export function GameProvider({ children }: { children: ReactNode }) {
  const [st, setSt] = useState<GameState>({
    ready: false, profile: null, wallet: defaultWallet(), streak: emptyStreak(), settings: defaultSettings(),
    prefs: defaultPrefs(), records: {}, todays: [], gymPointsToday: 0, claimed: [], questSwap: null, dayQuests: null, lockNotice: null,
    avatar: normalizeAvatar(null), cos: normalizeCos(null), level: 1, theme: activeTheme(1, null), themeUnlocked: null, badgeNotice: [],
  });

  const reload = useCallback(async () => {
    // Abzeichen prüfen (schreibt Gems für neue Stufen gut, bevor die Brieftasche gelesen wird)
    await syncBadges().catch(() => {});
    const badgeNotice = await getKV<string[]>('badgeNotice', []);
    const today = dayKey();
    const dayQuests = await ensureDayQuests(today).catch(() => null);
    const [profile, wallet, streakRaw, settings, prefs, records, todays, claimed, lockNotice, gymToday, questSwap, avatarRaw, themeChoice, themeSeen, cosRaw] = await Promise.all([
      getKV<Profile | null>('profile', null),
      getKV<Wallet>('wallet', defaultWallet()),
      getKV<StreakState>('streak', emptyStreak()),
      getKV<Settings>('settings', defaultSettings()),
      getKV<Prefs>('prefs', defaultPrefs()),
      getKV<Records>('records', {}),
      db.workouts.where('day').equals(today).toArray(),
      getKV<string[]>('questsClaimed', []),
      getKV<LockNotice | null>('lockNotice', null),
      db.gymLogs.where('day').equals(today).toArray(),
      getKV<QuestSwap | null>('questSwap', null),
      getKV<AvatarState | null>('avatar', null),
      getKV<ThemeChoice | null>('theme', null),
      getKV<number | null>('themeSeen', null),
      getKV<CosState | null>('cosmetics', null),
    ]);
    const level = levelFromXp(wallet.xp).level;
    const theme = activeTheme(level, themeChoice);
    applyTheme(theme);
    // Neu freigeschaltetes Theme einmal feiern (nicht beim allerersten Start auf Level 1)
    const tier = unlockedThemes(level).length;
    let themeUnlocked: Theme | null = null;
    if (themeSeen === null) await setKV('themeSeen', tier > 1 ? tier - 1 : tier);
    if ((themeSeen ?? (tier > 1 ? tier - 1 : tier)) < tier) themeUnlocked = unlockedThemes(level)[tier - 1];
    const gymPointsToday = gymToday.reduce((sum, l) => sum + l.points, 0);
    setFxSettings(settings);
    // Anzeige: Streak so, wie sie heute gilt
    const streak = checkStreak(streakRaw, today).state;
    setSt({ ready: true, profile, wallet, streak, settings, prefs, records, todays, gymPointsToday, claimed, questSwap, dayQuests, lockNotice,
      avatar: normalizeAvatar(avatarRaw), cos: normalizeCos(cosRaw), level, theme, themeUnlocked, badgeNotice });
  }, []);

  useEffect(() => {
    (async () => {
      // Neue App-Version oder neuer Tag: zuerst eine Sicherung der Daten anlegen
      await updateGuard();
      await startupCheck();
      await reload();
    })();
    // Mitternacht / Rückkehr in die App: neu prüfen
    const onVis = async () => { if (document.visibilityState === 'visible') { await startupCheck(); await reload(); } };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, [reload]);

  const ctx: Ctx = {
    ...st,
    reload,
    async setProfile(p) { await setKV('profile', p); await reload(); },
    async setSettings(s) { await setKV('settings', s); await reload(); },
    async setPrefs(p) { await setKV('prefs', p); setSt((o) => ({ ...o, prefs: p })); },
    async buyLock() {
      const r = buyLockLogic(st.streak, st.wallet.gems);
      if (!r) return false;
      await db.transaction('rw', db.kv, async () => {
        const raw = await getKV<StreakState>('streak', emptyStreak());
        await setKV('streak', { ...raw, locks: r.state.locks });
        await setKV('wallet', { ...st.wallet, gems: r.gems });
      });
      await reload();
      return true;
    },
    async dismissBadgeNotice() { await setKV('badgeNotice', []); await reload(); },
    async dismissLockNotice() { await setKV('lockNotice', null); await reload(); },
    async saveWeekPlan(on, days) { const e = await saveWeekPlan(on, days); await reload(); return e; },
    async moveTrainingDay(from, to) { const e = await moveTrainingDay(from, to); await reload(); return e; },
    async buyItem(id) {
      let err: string | null = null;
      await db.transaction('rw', db.kv, async () => {
        const wallet = await getKV<Wallet>('wallet', defaultWallet());
        const av = normalizeAvatar(await getKV<AvatarState | null>('avatar', null));
        const r = buyItemLogic(av, wallet.gems, id, levelFromXp(wallet.xp).level);
        if (!r.ok) { err = r.reason; return; }
        await setKV('avatar', r.state);
        await setKV('wallet', { ...wallet, gems: r.gems });
      });
      await reload();
      return err;
    },
    async buyCos(kind, id) {
      let err: string | null = null;
      await db.transaction('rw', db.kv, async () => {
        const wallet = await getKV<Wallet>('wallet', defaultWallet());
        const c = normalizeCos(await getKV<CosState | null>('cosmetics', null));
        const r = buyCos(c, wallet.gems, kind, id, levelFromXp(wallet.xp).level);
        if (!r.ok) { err = r.reason; return; }
        await setKV('cosmetics', r.state);
        await setKV('wallet', { ...wallet, gems: r.gems });
      });
      await reload();
      return err;
    },
    async equipCos(kind, id) {
      await setKV('cosmetics', equipCos(normalizeCos(await getKV<CosState | null>('cosmetics', null)), kind, id));
      await reload();
    },
    async equip(slot, id) {
      await setKV('avatar', equipItem(normalizeAvatar(await getKV<AvatarState | null>('avatar', null)), slot, id));
      await reload();
    },
    async setLook(p) {
      const av = normalizeAvatar(await getKV<AvatarState | null>('avatar', null));
      await setKV('avatar', normalizeAvatar({ ...av, ...p }));
      await reload();
    },
    async pickTheme(id) {
      const c = chooseTheme(st.level, id);
      if (!c) return;
      await setKV('theme', c);
      await reload();
    },
    async dismissThemeUnlocked() {
      await setKV('themeSeen', unlockedThemes(st.level).length);
      await reload();
    },
    async swapQuest(index) { await setKV('questSwap', { day: dayKey(), index }); await reload(); },
  };

  // Hell/Dunkel anwenden, bei "wie das Handy" auch live dem System folgen
  const look = st.settings.look ?? 'auto';
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mq = window.matchMedia('(prefers-color-scheme: light)');
    const apply = () => applyLook(look === 'auto' ? (mq.matches ? 'light' : 'dark') : look);
    apply();
    mq.addEventListener?.('change', apply);
    return () => mq.removeEventListener?.('change', apply);
  }, [look]);

  return <GameCtx.Provider value={ctx}>{children}</GameCtx.Provider>;
}

/** Akzentfarbe der ganzen App aufs Theme setzen (CSS-Variablen, Tailwind "neon") */
function applyTheme(t: Theme) {
  if (typeof document === 'undefined') return;
  const r = document.documentElement.style;
  r.setProperty('--accent', hexToRgbTriplet(t.accent));
  r.setProperty('--on-accent', hexToRgbTriplet(t.onAccent));
}

/** Hell oder dunkel: Klasse auf <html> plus Farbe der Statusleiste */
function applyLook(mode: 'light' | 'dark') {
  if (typeof document === 'undefined') return;
  document.documentElement.classList.toggle('light', mode === 'light');
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', mode === 'light' ? '#F3F1EE' : '#0B0B0B');
}

export function useGame(): Ctx {
  const c = useContext(GameCtx);
  if (!c) throw new Error('useGame außerhalb von GameProvider');
  return c;
}
