import { APP_DASH } from '../lib/brand';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useGame } from '../lib/store';
import { Btn, Card, Header, Segmented } from '../components/ui';
import { Icon } from '../components/Icon';
import { exportAll, importAll, isBackupApp, wipeAll, type Settings } from '../lib/game';
import { dayKey } from '../lib/date';
import { exportMessage, saveTextFile } from '../lib/fileSave';
import { LegalOverlay } from './Legal';
import { startTour } from '../lib/tour';
import { APP_VERSION, listSnapshots, takeSnapshot, type Snapshot } from '../lib/update';
import { ApkUpdate, apkUpdateAvailable, pickMessage } from '../lib/apkUpdate';
import { STREAK_MIN_POINTS } from '../lib/streak';
import { bleAvailable, ensureBlePermission } from '../lib/bluetooth';
import { bluetoothOn, bluetoothSecure } from '../lib/bleProtocol';
import { countShare } from '../lib/blogDb';
import { SHARE_DAYS, SHARE_DAYS_MAX, SHARE_POSTS, SHARE_POSTS_BT, shareDays, type ShareDays } from '../lib/blog';

/**
 * Eigener Bildschirm "Einstellungen" (geöffnet über Ich → Account).
 * Alle Einstellungen, die früher unten auf der Ich-Seite standen, gruppiert nach Thema.
 */

const GOALS = [30, 50, 100, 150, 200, 300, 500];

type BIPEvent = Event & { prompt(): Promise<void> };

export function SettingsScreen({ onClose }: { onClose: () => void }) {
  const g = useGame();
  const [editName, setEditName] = useState<string | null>(null);
  const [msg, setMsg] = useState('');
  const [btMsg, setBtMsg] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const [installEvt, setInstallEvt] = useState<BIPEvent | null>(null);
  const [legalOpen, setLegalOpen] = useState(false);

  const rootRef = useRef<HTMLDivElement>(null);
  // neuer Bildschirm: oben anfangen (sonst bleibt die Scrollposition der Ich-Seite)
  useEffect(() => { rootRef.current?.closest('main')?.scrollTo(0, 0); }, []);
  useEffect(() => {
    const onBip = (e: Event) => { e.preventDefault(); setInstallEvt(e as BIPEvent); };
    window.addEventListener('beforeinstallprompt', onBip);
    return () => window.removeEventListener('beforeinstallprompt', onBip);
  }, []);

  const set = (s: Partial<Settings>) => g.setSettings({ ...g.settings, ...s });
  const saveName = async () => { const n = editName?.trim(); if (n && g.profile) await g.setProfile({ ...g.profile, name: n.slice(0, 20) }); setEditName(null); };
  const toggle = (k: 'sound' | 'voice' | 'vibration') => set({ [k]: !g.settings[k] });

  const doExport = async () => {
    try {
      setMsg(exportMessage(await saveTextFile(`shadow-burn-backup-${dayKey()}.json`, await exportAll())));
    } catch {
      setMsg('Fehler: Die Sicherung konnte nicht gespeichert werden. Es wurde keine Datei angelegt.');
    }
  };
  const doImport = async (f: File) => {
    let data: { app?: string; exportedAt?: string; workouts?: unknown[]; gymLogs?: unknown[] };
    try { data = JSON.parse(await f.text()); }
    catch { setMsg(`Diese Datei ist keine ${APP_DASH}-Sicherung.`); return; }
    if (!isBackupApp(data?.app)) { setMsg(`Diese Datei ist keine ${APP_DASH}-Sicherung.`); return; }
    const when = data.exportedAt ? new Date(data.exportedAt).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'unbekannt';
    const n = (data.workouts?.length ?? 0) + (data.gymLogs?.length ?? 0);
    if (!window.confirm(`Sicherung vom ${when} mit ${n} Trainings einspielen?\n\nAlles, was du seitdem eingetragen hast, wird dabei ersetzt.`)) return;
    try {
      await importAll(JSON.stringify(data));
      await g.reload();
      setMsg(`Sicherung vom ${when} wiederhergestellt (${n} Trainings).`);
    } catch (e) { setMsg(`Einspielen hat nicht geklappt: ${(e as Error).message}`); }
  };
  const doWipe = async () => {
    if (!window.confirm('Wirklich ALLE Daten löschen? Punkte, Gems, Streak und Verlauf sind dann weg.')) return;
    await wipeAll();
    await g.reload();
  };

  const bt = bluetoothOn(g.settings);

  return (
    <div ref={rootRef} className="pb-8">
      <Header title="Einstellungen" onBack={onClose} />
      <div className="px-4 space-y-4">
        <Section title="Account">
          <div className="flex items-center justify-between gap-3">
            <span>Name</span>
            {editName === null && (
              <button className="flex min-w-0 items-center gap-2 rounded-full bg-raised px-3 py-1.5 text-sm" onClick={() => setEditName(g.profile?.name ?? '')}>
                <span className="truncate text-mute">{g.profile?.name ?? 'Ich'}</span> Ändern
              </button>
            )}
          </div>
          {editName !== null && (
            <div className="flex gap-2">
              <input autoFocus value={editName} maxLength={20} onChange={(e) => setEditName(e.target.value.slice(0, 20))} onKeyDown={(e) => { if (e.key === 'Enter') void saveName(); }}
                className="min-w-0 flex-1 rounded-xl bg-raised px-4 py-3 outline-none ring-1 ring-line focus:ring-neon" />
              <Btn className="shrink-0 !py-3" disabled={!editName.trim()} onClick={() => void saveName()}>OK</Btn>
            </div>
          )}
        </Section>

        <Section title="Training">
          <div>
            <div className="flex items-baseline justify-between gap-3">
              <span>Tagesziel</span>
              <span className="text-xs text-mute">Ring auf Home · Streak ab {STREAK_MIN_POINTS} P</span>
            </div>
            <div className="-mx-1 mt-2 flex gap-1.5 overflow-x-auto px-1 pb-1">
              {GOALS.map((n) => {
                const on = Math.max(STREAK_MIN_POINTS, g.settings.dailyGoal ?? STREAK_MIN_POINTS) === n;
                return (
                  <button key={n} onClick={() => void set({ dailyGoal: n })}
                    className={`num shrink-0 rounded-full px-3.5 py-1.5 text-sm font-semibold ${on ? 'bg-hot' : 'bg-raised text-mute'}`}>{n} P</button>
                );
              })}
            </div>
          </div>
          <div className="flex items-center justify-between gap-3">
            <span>Muskelgrafik</span>
            <Segmented className="w-44" value={g.settings.sex ?? 'm'} onChange={(v) => void set({ sex: v })}
              options={[{ id: 'm', label: 'Mann' }, { id: 'f', label: 'Frau' }]} />
          </div>
        </Section>

        <Section title="Darstellung & Ton">
          <div className="flex items-center justify-between gap-3">
            <span>Design</span>
            <Segmented className="w-56" value={g.settings.look ?? 'auto'} onChange={(v) => void set({ look: v })}
              options={[{ id: 'auto', label: 'Auto' }, { id: 'light', label: 'Hell' }, { id: 'dark', label: 'Dunkel' }]} />
          </div>
          <Toggle label="Blog-Seite" on={g.settings.blog !== false} onClick={() => void set({ blog: g.settings.blog === false })} />
          <Toggle label="Sounds" on={g.settings.sound} onClick={() => void toggle('sound')} />
          <Toggle label="Sprachansagen" on={g.settings.voice} onClick={() => void toggle('voice')} />
          <Toggle label="Vibration" on={g.settings.vibration} onClick={() => void toggle('vibration')} />
        </Section>

        <Section title="Teilen mit Freunden">
          <Toggle label="Freunde sehen meine Statistik" on={!!g.settings.shareStats} onClick={() => void set({ shareStats: !g.settings.shareStats })} />
          <p className="-mt-2 text-xs text-mute">Ohne Körpergewicht. Gilt ab dem nächsten Scan.</p>
          {g.settings.blog !== false && (
            <>
              <Toggle label="Blog beim Scannen mitschicken" on={g.settings.qrBlog !== false} onClick={() => void set({ qrBlog: g.settings.qrBlog === false })} />
              <p className="-mt-2 text-xs text-mute">Ein Scan aktualisiert Rangliste und Blog. Aus: nur Rangliste.</p>
              <ShareRange settings={g.settings} bt={bleAvailable() && bt} onChange={(d) => void set({ shareDays: d })} />
            </>
          )}
        </Section>

        {bleAvailable() && (
          <Section title="Bluetooth">
            <Toggle label="Bluetooth-Austausch bei Treffen" on={bt} onClick={async () => {
              setBtMsg('');
              if (bt) { await set({ bluetooth: false }); return; }
              const r = await ensureBlePermission();
              if (!r.ok) { setBtMsg(r.msg ?? 'Bluetooth ist nicht verfügbar.'); await set({ bluetooth: false }); return; }
              await set({ bluetooth: true });
            }} />
            <p className="-mt-2 text-xs text-mute">Tauscht dieselben Daten wie der QR-Code, aber per Bluetooth, wenn ihr euch trefft. Nur aktiv, solange „In der Nähe tauschen“ offen ist. Dein Name ist dann für Handys in der Nähe sichtbar.</p>
            {btMsg && <p className="-mt-2 text-xs text-bad">{btMsg}</p>}
            <div className={bt ? '' : 'pointer-events-none opacity-40'} aria-disabled={!bt}>
              <Toggle label="Extra sichere Bluetooth-Übertragung" on={bluetoothSecure(g.settings)} onClick={() => { if (bt) void set({ btSecure: !g.settings.btSecure }); }} />
              <p className="mt-1 text-xs text-mute">
                Der Tausch startet nur, wenn das andere Handy deinen QR-Code scannt (oder du seinen). Statt der Geräteliste koppelt ihr per Code, Anfragen ohne gültigen Code werden abgelehnt.
                {!bt && ' Erst Bluetooth-Austausch einschalten.'}
              </p>
            </div>
          </Section>
        )}

        <Section title="App & Daten">
          {apkUpdateAvailable() && <AppUpdate />}
          {installEvt && <Btn className="w-full !py-3" onClick={() => { void installEvt.prompt(); setInstallEvt(null); }}><span className="flex items-center justify-center gap-2"><Icon name="install" /> Auf den Homescreen installieren</span></Btn>}
          <Btn kind="ghost" className="w-full !py-3" onClick={startTour}>Einführung ansehen</Btn>
          <Btn kind="ghost" className="w-full !py-3" onClick={doExport}>Backup exportieren</Btn>
          <Btn kind="ghost" className="w-full !py-3" onClick={() => fileRef.current?.click()}>Backup importieren</Btn>
          <input ref={fileRef} type="file" accept="application/json,.json" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void doImport(f); e.target.value = ''; }} />
          {msg && <p className="text-sm text-neon">{msg}</p>}
          <AutoBackups onRestore={async (s) => { await importAll(s.json); await g.reload(); setMsg('Sicherung zurückgeholt.'); }} />
          <Btn kind="danger" className="w-full !py-3" onClick={doWipe}>Alle Daten löschen</Btn>
          <Btn kind="ghost" className="w-full !py-3" onClick={() => setLegalOpen(true)}>Open-Source-Lizenzen</Btn>
        </Section>
      </div>
      <LegalOverlay open={legalOpen} onClose={() => setLegalOpen(false)} />
    </div>
  );
}

/**
 * "App aktualisieren": neue APK aus den Dateien wählen (z. B. Downloads), prüfen, bestätigen, installieren.
 * Vorher legt die App eine Sicherung an. Nach dem Update räumt der Start auf (siehe finishApkUpdate in App.tsx).
 */
function AppUpdate() {
  const [ask, setAsk] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ text: string; bad?: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const pick = async () => {
    if (busy) return;
    setMsg(null);
    setBusy(true);
    try {
      const r = await ApkUpdate.pick();
      if (r.status === 'cancelled') return;
      const bad = pickMessage(r);
      if (bad) { setMsg({ text: bad, bad: true }); return; }
      setAsk(r.versionName ?? '?');
    } catch (e) { setMsg({ text: (e as Error).message || 'Datei konnte nicht gelesen werden.', bad: true }); }
    finally { setBusy(false); }
  };
  const install = async () => {
    try {
      const { allowed } = await ApkUpdate.canInstall();
      if (!allowed) {
        await ApkUpdate.openInstallSettings();
        setMsg({ text: 'Erlaube „Apps installieren“ für Shadow Burn und tippe dann nochmal auf Installieren.' });
        return;
      }
      await takeSnapshot('update');
      const r = await ApkUpdate.install();
      if (r.needsPermission) { setMsg({ text: 'Erlaube „Apps installieren“ für Shadow Burn und tippe dann nochmal auf Installieren.' }); return; }
      setAsk(null);
      setMsg({ text: 'Bestätige die Installation im Android-Fenster. Danach öffnest du die App neu.' });
    } catch (e) { setAsk(null); setMsg({ text: (e as Error).message || 'Installation hat nicht geklappt.', bad: true }); }
  };
  return (
    <>
      <Btn kind="ghost" className="w-full !py-3" onClick={() => void pick()}>App aktualisieren</Btn>
      {msg && !ask && <p className={`text-sm ${msg.bad ? 'text-bad' : 'text-neon'}`}>{msg.text}</p>}
      {ask && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 px-6" role="dialog" aria-modal="true" onClick={() => { setAsk(null); setMsg(null); }}>
          <div className="w-full max-w-sm rounded-3xl bg-panel p-5 shadow-float" onClick={(e) => e.stopPropagation()}>
            <p className="font-display text-xl">App aktualisieren</p>
            <p className="mt-2 text-sm">Update auf Version <span className="num font-semibold">{ask}</span> installieren? Deine Daten bleiben erhalten.</p>
            <p className="mt-1 text-xs text-mute">Vorher wird automatisch eine Sicherung angelegt.</p>
            {msg && <p className={`mt-3 text-sm ${msg.bad ? 'text-bad' : 'text-neon'}`}>{msg.text}</p>}
            <div className="mt-4 flex gap-2">
              <Btn kind="ghost" className="flex-1 !py-3" onClick={() => { setAsk(null); setMsg(null); }}>Abbrechen</Btn>
              <Btn className="flex-1 !py-3" onClick={() => void install()}>Installieren</Btn>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

/** Automatische Sicherungen (bei jedem App-Update und einmal am Tag), die letzten drei */
function AutoBackups({ onRestore }: { onRestore: (s: Snapshot) => Promise<void> }) {
  const [snaps, setSnaps] = useState<Snapshot[] | null>(null);
  const [ask, setAsk] = useState<Snapshot | null>(null);
  useEffect(() => { void listSnapshots().then(setSnaps).catch(() => setSnaps([])); }, []);
  const fmt = (t: number) => new Date(t).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  return (
    <div className="rounded-2xl bg-raised p-3 text-sm">
      <p className="font-semibold">Automatische Sicherungen</p>
      <p className="mt-0.5 text-xs text-mute">Bei jedem App-Update und einmal am Tag. App-Version {APP_VERSION}.</p>
      {snaps && snaps.length === 0 && <p className="mt-2 text-xs text-mute">Noch keine.</p>}
      {snaps?.map((s) => (
        <div key={s.at} className="mt-2 flex items-center justify-between gap-2">
          <span className="num text-xs">{fmt(s.at)} · {s.reason === 'update' ? 'Update' : 'täglich'} · v{s.version}</span>
          {ask?.at === s.at
            ? <button className="font-semibold text-bad" onClick={async () => { setAsk(null); await onRestore(s); }}>Wirklich zurückholen?</button>
            : <button className="font-semibold text-neon" onClick={() => setAsk(s)}>Zurückholen</button>}
        </div>
      ))}
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <p className="kicker mb-2 px-1">{title}</p>
      <Card className="space-y-3">{children}</Card>
    </section>
  );
}

/** "Beiträge beim Tauschen mitschicken": letzte X Tage (frei eingebbar) oder alle */
function ShareRange({ settings, bt, onChange }: { settings: Settings; bt: boolean; onChange: (d: ShareDays) => void }) {
  const d = shareDays(settings.shareDays);
  const [txt, setTxt] = useState(d === 'all' ? String(SHARE_DAYS) : String(d));
  const [count, setCount] = useState<number | null>(null);
  useEffect(() => { if (d !== 'all') setTxt(String(d)); }, [d]);
  useEffect(() => {
    let on = true;
    void countShare(d).then((n) => { if (on) setCount(n); });
    return () => { on = false; };
  }, [d]);
  const commit = () => {
    const v = shareDays(txt);
    setTxt(String(v));
    if (v !== d) onChange(v);
  };
  const lim = (max: number) => (count !== null && count > max ? `${max} von ${count}` : null);
  const qr = lim(SHARE_POSTS), viaBt = lim(SHARE_POSTS_BT);
  return (
    <div className="space-y-2">
      <span>Beiträge beim Tauschen mitschicken</span>
      <Segmented value={d === 'all' ? 'all' : 'days'} onChange={(v) => onChange(v === 'all' ? 'all' : shareDays(txt))}
        options={[{ id: 'days', label: 'Letzte Tage' }, { id: 'all', label: 'Alle' }]} />
      {d !== 'all' && (
        <label className="flex items-center gap-2 text-sm">
          <span className="text-mute">Letzte</span>
          <input type="number" inputMode="numeric" min={1} max={SHARE_DAYS_MAX} value={txt} aria-label="Anzahl Tage"
            onChange={(e) => { setTxt(e.target.value); const n = Number(e.target.value); if (e.target.value && Number.isInteger(n) && n >= 1 && n <= SHARE_DAYS_MAX) onChange(n); }}
            onBlur={commit} onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
            className="num w-20 rounded-xl bg-raised px-3 py-1.5 text-center font-semibold text-ink outline-none focus:ring-2 focus:ring-hot" />
          <span className="text-mute">Tage (1–{SHARE_DAYS_MAX})</span>
        </label>
      )}
      <p className="text-xs text-mute">
        {count === null ? '…' : count === 0 ? 'In diesem Zeitraum hast du noch keine Beiträge.' : `${count} ${count === 1 ? 'Beitrag' : 'Beiträge'} im Zeitraum.`}
        {qr ? ` Per QR-Code werden ${qr} Beiträgen gesendet (die neuesten).` : ''}
        {bt ? (viaBt ? ` Per Bluetooth ${viaBt}.` : count && qr ? ' Per Bluetooth alle.' : '') : ''}
        {' '}Viele Beiträge machen den QR-Code länger.
      </p>
    </div>
  );
}

function Toggle({ label, on, onClick }: { label: string; on: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} className="w-full flex items-center justify-between">
      <span className="text-left">{label}</span>
      <span className="ml-auto mr-2 text-sm text-mute">{on ? 'An' : 'Aus'}</span>
      <span role="switch" aria-checked={on} aria-label={label} className={`shrink-0 w-12 h-7 rounded-full p-1 transition ${on ? 'bg-neon' : 'bg-line'}`}>
        <span className={`block w-5 h-5 rounded-full bg-white transition ${on ? 'translate-x-5' : ''}`} />
      </span>
    </button>
  );
}
