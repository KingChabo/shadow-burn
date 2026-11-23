import { APP_NAME } from '../lib/brand';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useBack } from '../lib/back';
import { AnimatePresence, motion } from 'framer-motion';
import { DEMO } from '../lib/flavor';
import { useGame } from '../lib/store';
import { ACT, type ActivityId } from '../data/activities';
import { Btn, Card, CountUp, GemIcon, Header, Segmented } from '../components/ui';
import { Icon } from '../components/Icon';
import { Avatar } from '../components/Avatar';
import { RouteMap } from '../components/RouteMap';
import { Receiver, Sender, shrinkImage } from '../components/QrExchange';
import { NearbyExchange } from '../components/NearbyExchange';
import { bleAvailable } from '../lib/bluetooth';
import { bluetoothOn } from '../lib/bleProtocol';
import { finishWorkout, type Summary } from '../lib/game';
import { fmtPace, fmtTime } from '../lib/date';
import { buzz, sfx } from '../lib/fx';
import { plausibleKm } from '../lib/scoring';
import { defaultAvatar } from '../lib/avatar';
import {
  acceptFix, BLOG_DISTANCE, BLOG_TIME, cleanText, encodeRoute, IMAGE_EDGE, MAX_IMAGES, newPostId,
  parseKm, routeKm, simplify, TEXT_MAX, usesKm, type BlogPost, type GpsFix, type LatLon,
} from '../lib/blog';
import {
  activeSeconds, deletePost, ensureDemo, getRun, listPosts, me, removeDemo, savePost, setRun,
  type BlogRun, type ReceiveResult,
} from '../lib/blogDb';

type View = 'feed' | 'start' | 'run' | 'km' | 'review';
type Filter = 'all' | 'mine' | 'friends';

/** Blog: Ausdauer-Session mit Timer, danach Bericht und Beitrag mit Text und Fotos. */
export function Blog({ onFullscreen }: { onFullscreen: (b: boolean) => void }) {
  const g = useGame();
  const [view, setView] = useState<View>('feed');
  const [posts, setPosts] = useState<BlogPost[]>([]);
  const [run, setRunState] = useState<BlogRun | null>(null);
  const [filter, setFilter] = useState<Filter>('all');
  const [exchange, setExchange] = useState<false | 'qr' | 'near'>(false);
  // Bluetooth-Austausch bei Treffen: nur Android-App und nur, wenn in den Einstellungen eingeschaltet
  const bt = bleAvailable() && bluetoothOn(g.settings);
  const [done, setDone] = useState<{ summary: Summary; run: BlogRun; seconds: number; enteredKm: number } | null>(null);

  const load = useCallback(async () => {
    // Beispiel-Beiträge nur im Demo-Build; in der normalen App alte Beispiele wegräumen
    if (DEMO) await ensureDemo(); else await removeDemo();
    setPosts(await listPosts());
    const r = await getRun();
    setRunState(r);
    return r;
  }, []);
  // Läuft noch eine Session (App war zu), direkt wieder dorthin
  useEffect(() => { void load().then((r) => { if (r) setView('run'); }); }, [load]);
  useEffect(() => { onFullscreen(view === 'run' || view === 'km' || exchange !== false); }, [view, exchange, onFullscreen]);
  useEffect(() => () => onFullscreen(false), [onFullscreen]);

  const shown = posts.filter((p) => (filter === 'all' ? true : filter === 'mine' ? p.mine : !p.mine));
  const hasDemo = posts.some((p) => p.demo);

  if (view === 'start') return <StartSession onBack={() => setView('feed')} onStart={async (activityId, gps) => {
    const r: BlogRun = { activityId, start: Date.now(), pausedMs: 0, pausedAt: null, gps, pts: [] };
    await setRun(r); setRunState(r); setView('run'); sfx('go'); buzz(80);
  }} />;
  if (view === 'run' && run) return <RunView run={run} onChange={(r) => { setRunState(r); void setRun(r); }} onStop={() => setView('km')} />;
  if (view === 'km' && run) return (
    <KmView run={run} onBack={() => setView('run')}
      onDiscard={async () => { await setRun(null); setRunState(null); setView('feed'); }}
      onSave={async (km) => {
        const end = run.pausedAt ?? Date.now();
        const seconds = activeSeconds(run, end);
        const summary = await finishWorkout({ activityId: run.activityId, mode: usesKm(run.activityId) ? 'distance' : 'duration', start: run.start, end, seconds, ...(usesKm(run.activityId) ? { km } : {}) });
        await setRun(null);
        setDone({ summary, run, seconds, enteredKm: km });
        setRunState(null);
        await g.reload();
        setView('review');
      }} />
  );
  if (view === 'review' && done) return <Review data={done} onClose={async () => { setDone(null); setPosts(await listPosts()); setView('feed'); }} />;

  return (
    <div className="pb-6">
      <Header title="Blog" right={
        <div className="flex gap-2">
          {bt && <button onClick={() => setExchange('near')} aria-label="In der Nähe tauschen" className="grid h-11 w-11 place-items-center rounded-full bg-panel shadow-card"><Icon name="bluetooth" className="h-5 w-5" /></button>}
          <button data-tour="blog-swap" onClick={() => setExchange('qr')} aria-label="Blog austauschen" className="flex h-11 items-center gap-1.5 rounded-full bg-panel px-3.5 text-sm font-semibold shadow-card">
            <Icon name="qr" className="h-5 w-5" /> Tauschen
          </button>
        </div>
      } />
      <div className="space-y-3 px-4">
        {/* Start-Banner im Arena-Stil */}
        <button data-tour="blog-start" onClick={() => setView(run ? 'run' : 'start')} className="relative block w-full overflow-hidden rounded-3xl bg-hot p-4 text-left shadow-card">
          <div className="stripes pointer-events-none absolute inset-0 opacity-60" />
          <div className="relative flex items-center gap-3">
            <div className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-white/20"><Icon name={run ? 'timer' : 'route'} className="h-6 w-6" /></div>
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-white/80">{run ? 'Läuft gerade' : 'Ausdauer-Session'}</p>
              <p className="font-sport text-[26px] leading-tight">{run ? `${ACT[run.activityId].name} · weiter` : 'Session starten'}</p>
            </div>
            <Icon name="bolt" className="h-6 w-6 shrink-0" />
          </div>
        </button>

        <Segmented value={filter} onChange={setFilter} options={[{ id: 'all', label: 'Alle' }, { id: 'mine', label: 'Meine' }, { id: 'friends', label: 'Freunde' }]} />

        {hasDemo && (
          <div className="flex items-center justify-between gap-3 rounded-2xl bg-panel px-4 py-2.5 text-sm shadow-card">
            <span className="text-mute">Mit Beispiel-Einträgen</span>
            <button className="font-semibold text-neon" onClick={async () => { await removeDemo(); setPosts(await listPosts()); }}>Entfernen</button>
          </div>
        )}

        {shown.length === 0 && (
          <Card className="py-8 text-center">
            <Icon name="route" className="mx-auto h-10 w-10 text-mute" />
            <p className="mt-2 font-display text-lg">{filter === 'friends' ? 'Noch keine Beiträge von Freunden' : 'Noch keine Beiträge'}</p>
            <p className="mt-1 text-sm text-mute">{filter === 'friends' ? 'Tausche Blogs per QR-Code.' : 'Starte eine Session und poste deinen Bericht.'}</p>
          </Card>
        )}

        {shown.map((p) => (
          <PostCard key={p.id} post={p} onDelete={p.mine ? async () => {
            if (!window.confirm('Beitrag löschen? Das Training und die Punkte bleiben.')) return;
            await deletePost(p.id); setPosts(await listPosts());
          } : !p.mine ? async () => {
            if (!window.confirm(`Beitrag von ${p.authorName} ausblenden?`)) return;
            await deletePost(p.id); setPosts(await listPosts());
          } : undefined} />
        ))}
      </div>

      <AnimatePresence>
        {exchange && <Exchange near={exchange === 'near'} onClose={async () => { setExchange(false); setPosts(await listPosts()); }} />}
      </AnimatePresence>
    </div>
  );
}

// ---------- Beitrag ----------

function ago(t: number): string {
  const m = Math.round((Date.now() - t) / 60_000);
  if (m < 1) return 'gerade eben';
  if (m < 60) return `vor ${m} Min.`;
  const h = Math.round(m / 60);
  if (h < 24) return `vor ${h} Std.`;
  const d = Math.round(h / 24);
  if (d < 7) return d === 1 ? 'gestern' : `vor ${d} Tagen`;
  return new Date(t).toLocaleDateString('de-DE', { day: 'numeric', month: 'short' });
}

function PostCard({ post: p, onDelete }: { post: BlogPost; onDelete?: () => void }) {
  const a = ACT[p.activityId];
  const [zoom, setZoom] = useState<string | null>(null);
  useBack(zoom !== null, () => setZoom(null));
  const km = usesKm(p.activityId) && p.km > 0;
  return (
    <article className="overflow-hidden rounded-3xl bg-panel shadow-card">
      <div className="flex items-center gap-3 px-4 pt-4">
        <div className="relative h-11 w-11 shrink-0 overflow-hidden rounded-full bg-raised">
          <Avatar look={p.av ?? defaultAvatar()} level={p.authorLevel} className="absolute left-1/2 top-0.5 h-[92px] w-[46px] -translate-x-1/2" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold leading-tight">{p.mine ? 'Du' : p.authorName}<span className="ml-1.5 text-xs font-normal text-mute">Lvl {p.authorLevel}</span></p>
          <p className="truncate text-xs text-mute">{a.name} · {ago(p.at)}</p>
        </div>
        {p.demo && <span className="shrink-0 rounded-full bg-raised px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-mute">Beispiel</span>}
        {onDelete && (
          <button onClick={onDelete} aria-label="Beitrag löschen" className="-mr-2 grid h-9 w-9 shrink-0 place-items-center rounded-full text-mute active:bg-raised"><Icon name="trash" className="h-4 w-4" /></button>
        )}
      </div>

      {p.text && <p className="whitespace-pre-line px-4 pt-3 text-[15px] leading-snug">{p.text}</p>}

      <div className="mx-4 mt-3 grid grid-cols-4 gap-1 rounded-2xl bg-raised py-2.5 text-center">
        {km ? <Fact v={p.km.toLocaleString('de-DE')} l="km" /> : <Fact v={String(Math.round(p.seconds / 60))} l="Min." />}
        <Fact v={fmtTime(p.seconds)} l="Zeit" />
        {km ? <Fact v={fmtPace(p.seconds / 60 / p.km)} l={p.activityId === 'bike' || p.activityId === 'inline' ? 'min/km' : 'Pace'} /> : <Fact v={a.category === 'sport' ? 'Sport' : '–'} l="Art" />}
        <Fact v={`+${p.points}`} l="Punkte" hot />
      </div>

      {p.route && (
        <div className="relative mx-4 mt-3">
          <RouteMap route={p.route} />
          {p.gpsKm !== undefined && (
            <span className="absolute right-2 top-2 flex items-center gap-1 rounded-full bg-panel/90 px-2 py-0.5 text-[11px] font-semibold">
              <Icon name="check" className="h-3 w-3 text-good" strokeWidth={3} /> GPS {p.gpsKm.toLocaleString('de-DE')} km
            </span>
          )}
        </div>
      )}

      {p.images.length > 0 && (
        <div className={`mx-4 mt-3 grid gap-1.5 ${p.images.length === 1 ? 'grid-cols-1' : 'grid-cols-2'}`}>
          {p.images.map((src, i) => (
            <button key={i} onClick={() => setZoom(src)} className={`overflow-hidden rounded-2xl bg-raised ${p.images.length === 3 && i === 0 ? 'col-span-2' : ''}`}>
              <img src={src} alt="" className={`w-full object-cover ${p.images.length === 1 ? 'aspect-[16/10]' : 'aspect-square'} ${p.images.length === 3 && i === 0 ? '!aspect-[16/9]' : ''}`} />
            </button>
          ))}
        </div>
      )}
      <div className="h-4" />
      <AnimatePresence>
        {zoom && (
          <motion.button initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setZoom(null)}
            className="fixed inset-0 z-[60] grid place-items-center bg-black/90 p-4" aria-label="Schließen">
            <img src={zoom} alt="" className="max-h-full max-w-full rounded-2xl" />
          </motion.button>
        )}
      </AnimatePresence>
    </article>
  );
}

function Fact({ v, l, hot }: { v: string; l: string; hot?: boolean }) {
  return (
    <div className="min-w-0">
      <div className={`num truncate font-sport text-[20px] leading-tight ${hot ? 'text-neon' : ''}`}>{v}</div>
      <div className="text-[10px] uppercase tracking-wider text-mute">{l}</div>
    </div>
  );
}

// ---------- Session starten ----------

function StartSession({ onBack, onStart }: { onBack: () => void; onStart: (id: ActivityId, gps: boolean) => void }) {
  const [id, setId] = useState<ActivityId>('jog');
  const [gps, setGps] = useState(false);
  const [gpsErr, setGpsErr] = useState<string | null>(null);
  const canGps = usesKm(id) && id !== 'swim' && id !== 'rowing';
  const askGps = () => {
    if (gps) { setGps(false); return; }
    if (!navigator.geolocation) { setGpsErr('Dieses Gerät hat kein GPS.'); return; }
    // Gleich nach der Erlaubnis fragen, damit es beim Start nicht hakt
    navigator.geolocation.getCurrentPosition(() => { setGps(true); setGpsErr(null); }, (e) => {
      setGpsErr(e.code === 1 ? `Standort nicht erlaubt. In den Handy-Einstellungen für ${APP_NAME} freigeben.` : 'Kein GPS-Signal. Geh am besten nach draußen.');
      if (e.code !== 1) setGps(true);
    }, { enableHighAccuracy: true, timeout: 8000 });
  };
  return (
    <div className="pb-8">
      <Header title="Neue Session" onBack={onBack} />
      <div className="space-y-4 px-4">
        <div>
          <p className="kicker mb-2">Mit Strecke</p>
          <div className="grid grid-cols-2 gap-2">
            {BLOG_DISTANCE.map((a) => <SportChip key={a} id={a} on={id === a} onClick={() => setId(a)} />)}
          </div>
        </div>
        <div>
          <p className="kicker mb-2">Nach Zeit</p>
          <div className="grid grid-cols-2 gap-2">
            {BLOG_TIME.filter((a) => a in ACT).map((a) => <SportChip key={a} id={a} on={id === a} onClick={() => setId(a)} />)}
          </div>
        </div>
        {canGps && (
          <Card className="space-y-2">
            <button onClick={askGps} className="flex w-full items-center gap-3 text-left">
              <Icon name="route" className="h-6 w-6 shrink-0 text-neon" />
              <span className="flex-1"><span className="block font-semibold">Route aufzeichnen</span><span className="block text-xs text-mute">Freiwillig. Bleibt auf dem Handy, beim Posten entscheidest du.</span></span>
              <span role="switch" aria-checked={gps} className={`h-7 w-12 shrink-0 rounded-full p-1 transition ${gps ? 'bg-neon' : 'bg-line'}`}>
                <span className={`block h-5 w-5 rounded-full bg-white transition ${gps ? 'translate-x-5' : ''}`} />
              </span>
            </button>
            {gpsErr && <p className="text-xs text-fire">{gpsErr}</p>}
          </Card>
        )}
        <Btn className="w-full" onClick={() => onStart(id, canGps && gps)}><span className="flex items-center justify-center gap-2"><Icon name="timer" /> Start</span></Btn>
      </div>
    </div>
  );
}

function SportChip({ id, on, onClick }: { id: ActivityId; on: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} className={`rounded-2xl px-3 py-3 text-left text-[15px] font-semibold shadow-card transition-colors ${on ? 'bg-hot' : 'bg-panel'}`}>
      {ACT[id].name}
    </button>
  );
}

// ---------- Läuft ----------

function useWakeLock(on: boolean) {
  useEffect(() => {
    if (!on) return;
    type WL = { release(): Promise<void> };
    let lock: WL | null = null;
    const nav = navigator as Navigator & { wakeLock?: { request(t: 'screen'): Promise<WL> } };
    const get = () => { void nav.wakeLock?.request('screen').then((l) => { lock = l; }).catch(() => undefined); };
    get();
    const onVis = () => { if (document.visibilityState === 'visible') get(); };
    document.addEventListener('visibilitychange', onVis);
    return () => { document.removeEventListener('visibilitychange', onVis); void lock?.release().catch(() => undefined); };
  }, [on]);
}

function RunView({ run, onChange, onStop }: { run: BlogRun; onChange: (r: BlogRun) => void; onStop: () => void }) {
  const [, tick] = useState(0);
  const [gpsState, setGpsState] = useState<'wait' | 'ok' | 'off'>(run.gps ? 'wait' : 'off');
  const runRef = useRef(run);
  runRef.current = run;
  useWakeLock(true);
  useEffect(() => { const t = setInterval(() => tick((x) => x + 1), 500); return () => clearInterval(t); }, []);

  // GPS nur, wenn freigegeben. Punkte gesammelt speichern (nicht bei jedem Fix in die Datenbank)
  useEffect(() => {
    if (!run.gps || !navigator.geolocation) return;
    let last: GpsFix | null = null;
    const p = runRef.current.pts[runRef.current.pts.length - 1];
    if (p) last = { lat: p[0], lon: p[1], acc: 0, t: p[2] };
    let pending = 0;
    const id = navigator.geolocation.watchPosition((pos) => {
      setGpsState('ok');
      const r = runRef.current;
      if (r.pausedAt) return;
      const f = acceptFix(last, { lat: pos.coords.latitude, lon: pos.coords.longitude, acc: pos.coords.accuracy, t: pos.timestamp }, r.activityId);
      if (!f) return;
      last = f;
      const next = { ...r, pts: [...r.pts, [Math.round(f.lat * 1e6) / 1e6, Math.round(f.lon * 1e6) / 1e6, f.t] as [number, number, number]] };
      runRef.current = next;
      pending++;
      if (pending >= 5) { pending = 0; onChange(next); } else tick((x) => x + 1);
    }, () => setGpsState('wait'), { enableHighAccuracy: true, maximumAge: 2000, timeout: 20000 });
    return () => { navigator.geolocation.clearWatch(id); onChange(runRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [run.gps]);

  const r = runRef.current;
  const sec = activeSeconds(r);
  const pts = r.pts.map((p) => [p[0], p[1]] as LatLon);
  const km = routeKm(pts);
  const a = ACT[r.activityId];
  const paused = !!r.pausedAt;
  const togglePause = () => {
    const now = Date.now();
    const next = paused ? { ...r, pausedMs: r.pausedMs + (now - (r.pausedAt ?? now)), pausedAt: null } : { ...r, pausedAt: now };
    runRef.current = next; onChange(next); buzz(40);
  };
  return (
    <div className="flex min-h-full flex-col px-5 pb-8 pt-[max(env(safe-area-inset-top),24px)]">
      <div className="flex items-center justify-between">
        <p className="kicker">{a.name}</p>
        {r.gps && (
          <span className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${gpsState === 'ok' ? 'bg-good/15 text-good' : 'bg-raised text-mute'}`}>
            <span className={`h-2 w-2 rounded-full ${gpsState === 'ok' ? 'bg-good' : 'animate-pulse bg-mute'}`} /> GPS
          </span>
        )}
      </div>
      <div className="mt-8 text-center">
        <div className={`num font-sport text-[92px] leading-none ${paused ? 'text-mute' : ''}`}>{fmtTime(sec)}</div>
        <p className="mt-2 text-sm text-mute">{paused ? 'Pausiert' : 'Aktive Zeit'}</p>
      </div>
      {r.gps && (
        <div className="mt-8 grid grid-cols-2 gap-2">
          <div className="rounded-3xl bg-panel py-4 text-center shadow-card"><div className="num font-sport text-4xl">{km.toLocaleString('de-DE', { maximumFractionDigits: 2, minimumFractionDigits: 2 })}</div><div className="kicker mt-1">km (GPS)</div></div>
          <div className="rounded-3xl bg-panel py-4 text-center shadow-card"><div className="num font-sport text-4xl">{km > 0.05 ? fmtPace(sec / 60 / km) : '–'}</div><div className="kicker mt-1">min/km</div></div>
        </div>
      )}
      {r.gps && <RouteMap pts={pts} live className="mt-3" />}
      {!r.gps && <p className="mx-auto mt-10 max-w-[18rem] text-center text-sm text-mute">Lass die App offen. Am Ende trägst du {usesKm(r.activityId) ? 'die Kilometer' : 'nichts weiter'} ein.</p>}
      <div className="mt-auto grid grid-cols-2 gap-3 pt-8">
        <Btn kind="ghost" onClick={togglePause}>{paused ? 'Weiter' : 'Pause'}</Btn>
        <Btn onClick={() => { if (!paused) togglePause(); onStop(); }}>Stopp</Btn>
      </div>
    </div>
  );
}

// ---------- km eintragen ----------

function KmView({ run, onBack, onSave, onDiscard }: { run: BlogRun; onBack: () => void; onSave: (km: number) => Promise<void>; onDiscard: () => void }) {
  const gpsKm = routeKm(run.pts.map((p) => [p[0], p[1]] as LatLon));
  const needKm = usesKm(run.activityId);
  const [txt, setTxt] = useState(gpsKm >= 0.05 ? gpsKm.toFixed(2).replace('.', ',') : '');
  const [busy, setBusy] = useState(false);
  const sec = activeSeconds(run, run.pausedAt ?? Date.now());
  const km = parseKm(txt);
  const capped = needKm && km > 0 ? plausibleKm(run.activityId, km, sec) : km;
  const tooShort = sec < 60;
  const valid = !tooShort && (!needKm || km > 0);
  return (
    <div className="pb-8">
      <Header title="Geschafft" onBack={onBack} />
      <div className="space-y-4 px-4">
        <div className="rounded-3xl bg-panel p-4 text-center shadow-card">
          <p className="kicker">{ACT[run.activityId].name}</p>
          <div className="num mt-1 font-sport text-6xl">{fmtTime(sec)}</div>
        </div>
        {needKm && (
          <label className="block">
            <span className="text-sm text-mute">Wie viele Kilometer?</span>
            <input autoFocus inputMode="decimal" value={txt} onChange={(e) => setTxt(e.target.value.replace(/[^\d,.]/g, '').slice(0, 6))} placeholder="5,0"
              className="mt-1 w-full rounded-2xl border border-line bg-panel px-4 py-4 font-display text-3xl outline-none focus:border-neon" />
            {gpsKm >= 0.05 && <span className="mt-1 block text-xs text-mute">GPS hat {gpsKm.toLocaleString('de-DE', { maximumFractionDigits: 2 })} km gemessen.</span>}
          </label>
        )}
        {needKm && km > 0 && capped < km && <p className="rounded-xl bg-panel p-3 text-sm text-fire">So schnell geht das nicht. Gezählt werden {capped.toLocaleString('de-DE')} km.</p>}
        {tooShort && <p className="text-sm text-mute">Mindestens 1 Minute, dann gibt es einen Bericht.</p>}
        <Btn className="w-full" disabled={!valid || busy} onClick={async () => { setBusy(true); await onSave(km); }}>Bericht ansehen</Btn>
        <Btn kind="danger" className="w-full" onClick={() => { if (window.confirm('Session verwerfen? Es gibt keine Punkte.')) onDiscard(); }}>Verwerfen</Btn>
      </div>
    </div>
  );
}

// ---------- Bericht + Beitrag schreiben ----------

function Review({ data, onClose }: { data: { summary: Summary; run: BlogRun; seconds: number; enteredKm: number }; onClose: () => void }) {
  const { summary: s, run } = data;
  const w = s.workout;
  const a = ACT[run.activityId];
  const pts = useMemo(() => run.pts.map((p) => [p[0], p[1]] as LatLon), [run.pts]);
  const gpsKm = routeKm(pts);
  const [text, setText] = useState('');
  const [images, setImages] = useState<string[]>([]);
  const [showRoute, setShowRoute] = useState(true);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const gemSum = s.gems.reduce((x, g) => x + g.amount, 0);
  const km = usesKm(run.activityId) && w.km > 0;

  const addFiles = async (files: FileList) => {
    const out: string[] = [];
    for (const f of Array.from(files).slice(0, MAX_IMAGES - images.length)) {
      const d = await shrinkImage(f, IMAGE_EDGE, 0.72);
      if (d) out.push(d);
    }
    setImages((x) => [...x, ...out].slice(0, MAX_IMAGES));
  };
  const post = async () => {
    setBusy(true);
    const m = await me();
    await savePost({
      id: newPostId(), author: m.id, authorName: m.name, authorLevel: m.level,
      av: { skin: m.av.skin, hair: m.av.hair, equipped: m.av.equipped }, mine: true, at: Date.now(),
      activityId: run.activityId, start: run.start, seconds: w.seconds, km: w.km, points: w.points,
      ...(pts.length >= 2 && showRoute ? { route: encodeRoute(simplify(pts, 5)), gpsKm: Math.round(gpsKm * 100) / 100 } : {}),
      text: cleanText(text.trim()), images, workoutId: w.id,
    });
    sfx('success');
    onClose();
  };

  return (
    <div className="pb-8">
      <Header title="Bericht" />
      <div className="space-y-3 px-4">
        <div className="relative overflow-hidden rounded-3xl bg-panel p-4 shadow-card">
          <p className="kicker">{a.name} · {new Date(run.start).toLocaleDateString('de-DE', { weekday: 'short', day: 'numeric', month: 'short' })}</p>
          <div className="mt-1 flex items-end justify-between">
            <div className="num font-sport text-6xl leading-none text-neon">+<CountUp to={s.breakdown.total} /></div>
            {gemSum > 0 && <span className="mb-1 flex items-center gap-1 font-sport text-2xl text-gem">+{gemSum} <GemIcon className="h-5 w-5" /></span>}
          </div>
          <p className="text-xs text-mute">Punkte {s.breakdown.paceBonus > 0 ? `· inkl. ${s.breakdown.paceBonus} Pace-Bonus` : ''}{s.breakdown.streakBonus > 0 ? ` · ${s.breakdown.streakBonus} Streak-Bonus` : ''}</p>
          <div className="mt-4 grid grid-cols-3 gap-1 rounded-2xl bg-raised py-3 text-center">
            {km ? <Fact v={w.km.toLocaleString('de-DE')} l="km" /> : <Fact v={String(Math.round(w.seconds / 60))} l="Min." />}
            <Fact v={fmtTime(w.seconds)} l="Zeit" />
            {km ? <Fact v={fmtPace(w.seconds / 60 / w.km)} l="min/km" /> : <Fact v={String(s.streakAfter)} l="Streak" />}
          </div>
          {km && w.km < data.enteredKm && <p className="mt-2 text-xs text-fire">Eingetragen: {data.enteredKm.toLocaleString('de-DE')} km. Für die Zeit zu schnell, gezählt: {w.km.toLocaleString('de-DE')} km.</p>}
          {s.isRecord && <p className="mt-2 flex items-center gap-1.5 text-sm font-semibold text-fire"><Icon name="trophy" className="h-4 w-4" /> Neuer Rekord: {s.recordText}</p>}
          {s.streakIncreased && <p className="mt-1 flex items-center gap-1.5 text-sm"><Icon name="flame" className="h-4 w-4 text-[rgb(var(--hot))]" /> Streak {s.streakAfter} {s.streakAfter === 1 ? 'Tag' : 'Tage'}</p>}
          {s.levelAfter > s.levelBefore && <p className="mt-1 text-sm font-semibold">Level {s.levelAfter} erreicht</p>}
        </div>

        {pts.length >= 2 && (
          <div className="space-y-2">
            <div className="relative">
              <RouteMap pts={pts} />
              <span className="absolute right-2 top-2 rounded-full bg-panel/90 px-2 py-0.5 text-[11px] font-semibold">GPS {gpsKm.toLocaleString('de-DE', { maximumFractionDigits: 2 })} km</span>
            </div>
          </div>
        )}

        <Card className="space-y-3">
          <p className="font-display">Im Blog posten</p>
          <textarea value={text} onChange={(e) => setText(e.target.value.slice(0, TEXT_MAX))} rows={3} placeholder="Wie war's?"
            className="w-full resize-none rounded-2xl bg-raised px-4 py-3 text-[15px] outline-none ring-1 ring-line focus:ring-neon" />
          <div className="grid grid-cols-3 gap-2">
            {images.map((src, i) => (
              <div key={i} className="relative aspect-square overflow-hidden rounded-2xl bg-raised">
                <img src={src} alt="" className="h-full w-full object-cover" />
                <button onClick={() => setImages((x) => x.filter((_, k) => k !== i))} aria-label="Foto entfernen" className="absolute right-1 top-1 grid h-7 w-7 place-items-center rounded-full bg-black/60 text-white"><Icon name="x" className="h-4 w-4" /></button>
              </div>
            ))}
            {images.length < MAX_IMAGES && (
              <button onClick={() => fileRef.current?.click()} className="grid aspect-square place-items-center rounded-2xl border-2 border-dashed border-line text-mute">
                <span className="flex flex-col items-center gap-1 text-xs font-semibold"><Icon name="camera" className="h-6 w-6" /> Foto</span>
              </button>
            )}
          </div>
          <input ref={fileRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => { if (e.target.files) void addFiles(e.target.files); e.target.value = ''; }} />
          {pts.length >= 2 && (
            <button onClick={() => setShowRoute((x) => !x)} className="flex w-full items-center justify-between">
              <span>Route im Beitrag zeigen</span>
              <span role="switch" aria-checked={showRoute} className={`h-7 w-12 rounded-full p-1 transition ${showRoute ? 'bg-neon' : 'bg-line'}`}>
                <span className={`block h-5 w-5 rounded-full bg-white transition ${showRoute ? 'translate-x-5' : ''}`} />
              </span>
            </button>
          )}
          <Btn className="w-full" disabled={busy} onClick={() => void post()}>Posten</Btn>
          <button onClick={onClose} className="w-full py-2 text-sm font-semibold text-mute">Nicht posten</button>
        </Card>
      </div>
    </div>
  );
}

// ---------- Austausch per animiertem QR-Code ----------

function Exchange({ onClose, near = false }: { onClose: () => void; near?: boolean }) {
  const [mode, setMode] = useState<'send' | 'recv'>('send');
  const [result, setResult] = useState<ReceiveResult | { error: string } | null>(null);
  useWakeLock(true);
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 mx-auto flex max-w-lg flex-col bg-bg">
      <Header title={near ? 'In der Nähe tauschen' : 'Blog tauschen'} onBack={onClose} />
      <div className="flex-1 overflow-y-auto px-4 pb-6">
        {!result && !near && <Segmented className="mb-4" value={mode} onChange={setMode} options={[{ id: 'send', label: 'Senden' }, { id: 'recv', label: 'Empfangen' }]} />}
        {result ? (
          <div className="flex flex-col items-center gap-5 pt-10 text-center">
            <div className={`grid h-20 w-20 place-items-center rounded-full ${'error' in result ? 'bg-bad/15 text-bad' : 'bg-good/15 text-good'}`}>
              <Icon name={'error' in result ? 'x' : 'check'} className="h-10 w-10" strokeWidth={2.5} />
            </div>
            {'error' in result ? <p className="font-display text-xl">{result.error}</p> : (
              <div>
                <p className="font-display text-2xl">{result.friend === 'self' ? 'Das ist dein eigener Blog' : `Blog von ${result.name}`}</p>
                {result.friend !== 'self' && <p className="mt-1 text-mute">{result.cardOnly ? 'Nur Rangliste, ohne Blog' : `${result.added} neu${result.updated ? ` · ${result.updated} aktualisiert` : ''}`} · Rangliste {result.friend === 'new' ? 'neu' : 'aktuell'}</p>}
              </div>
            )}
            <div className="w-full space-y-2">
              {!('error' in result) && !near && <Btn className="w-full" onClick={() => { setResult(null); setMode('send'); }}>Jetzt meinen Blog senden</Btn>}
              {'error' in result && <Btn className="w-full" onClick={() => { setResult(null); setMode('recv'); }}>Nochmal</Btn>}
              <Btn kind="ghost" className="w-full" onClick={onClose}>Zum Blog</Btn>
            </div>
          </div>
        ) : near ? <NearbyExchange withBlog onDone={setResult} /> : mode === 'send' ? <Sender onSwitch={() => setMode('recv')} /> : <Receiver onDone={setResult} hint="Halte die Kamera auf den Code deines Freundes." />}
      </div>
    </motion.div>
  );
}
