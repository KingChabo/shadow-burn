import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useBack } from '../lib/back';
import { motion } from 'framer-motion';
import { useGame } from '../lib/store';
import { db, getKV, type GymLog, type Workout } from '../lib/db';
import { deleteGymLog, fmtKg, type GymRecords } from '../lib/gym';
import { setsText } from './Gym';
import { ACT, ACTIVITIES } from '../data/activities';
import { Btn, Card, Header } from '../components/ui';
import { levelFromXp } from '../lib/level';
import { addDays, dayKey, fmtPace, fmtTime } from '../lib/date';
import { Icon } from '../components/Icon';
import { GuideThumb } from '../components/GuideVideo';
import { deleteWorkout } from '../lib/game';
import { Avatar } from '../components/Avatar';
import { AvatarBackdrop, NameTag } from '../components/Cosmetics';
import { LevelBadge, ThemeLibrary } from '../components/LevelBadge';
import { ShopOverlay } from './Shop';
import { SettingsScreen } from './Settings';
import { bodyStage, STAGE_LEVELS, STAGE_NAMES } from '../lib/avatar';
import { BadgeCase } from '../components/Badge';

type Item = { kind: 'w'; w: Workout } | { kind: 'g'; l: GymLog };
const itemStart = (i: Item) => (i.kind === 'w' ? i.w.start : i.l.start);

export function Profile({ top }: { top?: JSX.Element }) {
  const g = useGame();
  const [history, setHistory] = useState<Item[]>([]);
  const [gymRecs, setGymRecs] = useState<{ name: string; text: string }[]>([]);
  const [week, setWeek] = useState<{ day: string; points: number }[]>([]);
  const [total, setTotal] = useState(0);
  const [editAvatar, setEditAvatar] = useState(false);
  const [lib, setLib] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  // Verlauf und Rekorde: zu Beginn zugeklappt, dann jeweils 5 mehr
  const [recShown, setRecShown] = useState(0);
  const [histShown, setHistShown] = useState(0);
  // nach dem Löschen neu laden (auch wenn das Training 0 Punkte hatte)
  const [rev, setRev] = useState(0);

  useEffect(() => {
    (async () => {
      // Verlauf, Zählung und Woche: normale Trainings UND Geräteübungen
      const [ws25, gym25, nW, nG] = await Promise.all([
        db.workouts.orderBy('start').reverse().limit(500).toArray(),
        db.gymLogs.orderBy('start').reverse().limit(500).toArray(),
        db.workouts.count(), db.gymLogs.count(),
      ]);
      const items: Item[] = [...ws25.map((w) => ({ kind: 'w' as const, w })), ...gym25.map((l) => ({ kind: 'g' as const, l }))];
      setHistory(items.sort((a, b) => itemStart(b) - itemStart(a)).slice(0, 500));
      setTotal(nW + nG);
      const today = dayKey();
      const days = Array.from({ length: 7 }, (_, i) => addDays(today, i - 6));
      const [ws, gs] = await Promise.all([db.workouts.where('day').anyOf(days).toArray(), db.gymLogs.where('day').anyOf(days).toArray()]);
      setWeek(days.map((d) => ({ day: d, points: [...ws, ...gs].filter((w) => w.day === d).reduce((s, w) => s + w.points, 0) })));
      const gr = await getKV<GymRecords>('gymRecords', {});
      const names = new Map<string, string>();
      for (const l of await db.gymLogs.toArray()) names.set(l.exerciseId, l.name);
      setGymRecs(Object.entries(gr).filter(([id, r]) => names.has(id) && r.reps > 0)
        .map(([id, r]) => ({ name: names.get(id)!, text: r.kg > 0 ? `${r.reps} × ${fmtKg(r.kg)}` : `${r.reps} Wdh.` }))
        .sort((a, b) => a.name.localeCompare(b.name, 'de')));
    })();
  }, [g.wallet.xp, rev]);

  const lv = levelFromXp(g.wallet.xp);
  const max = Math.max(1, ...week.map((w) => w.points));
  const wd = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];


  const recs = ACTIVITIES.filter((a) => g.records[a.id]);

  if (settingsOpen) return <SettingsScreen onClose={() => setSettingsOpen(false)} />;

  return (
    <div className="pb-8">
      {top ?? <Header title={g.profile?.name ?? 'Profil'} />}
      <div className="px-4 space-y-4">
        <Card className="relative flex items-center gap-4 overflow-hidden" tour="shop">
          <div className="pointer-events-none absolute inset-0 opacity-25" style={{ background: `radial-gradient(circle at 25% 60%, ${g.theme.glow}, transparent 60%)` }} />
          <AvatarBackdrop cs={g.cos} className="relative shrink-0 rounded-2xl">
            <Avatar look={g.avatar} level={lv.level} className="relative h-56 w-28" animate />
          </AvatarBackdrop>
          <div className="relative min-w-0 flex-1 space-y-3">
            <NameTag name={g.profile?.name ?? 'Ich'} cs={g.cos} />
            <div className="flex items-center gap-3">
              <LevelBadge level={lv.level} theme={g.theme} size={52} onLongPress={() => setLib(true)} />
              <div className="min-w-0">
                <p className="text-xs text-mute">Körper</p>
                <p className="font-display">{STAGE_NAMES[bodyStage(lv.level)]}</p>
              </div>
            </div>
            {STAGE_LEVELS[bodyStage(lv.level) + 1] && <p className="text-xs text-mute">Nächste Stufe: Level {STAGE_LEVELS[bodyStage(lv.level) + 1]}</p>}
            <Btn kind="ghost" className="w-full !py-2.5 !text-sm" onClick={() => setEditAvatar(true)}>Avatar & Shop</Btn>
          </div>
        </Card>
        <button onClick={() => setSettingsOpen(true)} className="flex w-full items-center gap-3 rounded-2xl bg-panel px-4 py-3.5 text-left shadow-card active:bg-raised">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-hot/15 text-hot"><Icon name="settings" className="h-5 w-5" /></div>
          <div className="min-w-0 flex-1">
            <p className="font-semibold">Account</p>
            <p className="truncate text-xs text-mute">Einstellungen bearbeiten: Name, Ziel, Design, Teilen, Bluetooth, Backup</p>
          </div>
          <svg viewBox="0 0 24 24" className="h-5 w-5 shrink-0 text-mute"><path d="M9 5l7 7-7 7" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" /></svg>
        </button>
        <div className="grid grid-cols-3 gap-2">
          <Mini v={String(lv.level)} l="Level" />
          <Mini v={String(total)} l="Trainings" />
          <Mini v={String(g.streak.longest)} l="Längste Streak" />
        </div>

        <BadgeCase />

        <Card>
          <p className="font-display mb-3">Punkte diese Woche</p>
          <div className="flex items-end gap-2 h-32">
            {week.map((d) => (
              <div key={d.day} className="flex-1 flex flex-col items-center gap-1 h-full justify-end">
                <span className="text-[10px] text-mute">{d.points || ''}</span>
                <div className={`w-full rounded-t-lg rounded-b-sm ${d.day === dayKey() ? 'bg-hot' : 'bg-ink/15'}`} style={{ height:`${(d.points / max) * 100}%`, minHeight: d.points ? 4 : 2 }} />
                <span className="text-[11px] text-mute">{wd[new Date(d.day + 'T12:00').getDay()]}</span>
              </div>
            ))}
          </div>
        </Card>

        <Card>
          <Fold title="Rekorde" count={recs.length + gymRecs.length} shown={recShown} onShow={setRecShown} empty="Noch keine." />
          {recShown > 0 && (
            <div className="mt-2 space-y-1">
              {[
                ...recs.map((a) => {
                  const r = g.records[a.id]!;
                  const parts = [r.reps ? `${r.reps} Wdh.` : '', r.seconds ? fmtTime(r.seconds) : '', r.km ? `${r.km} km` : '', r.pace ? `${fmtPace(r.pace)} /km` : ''].filter(Boolean);
                  return <div key={a.id} className="flex justify-between text-sm"><span>{a.name}</span><span className="font-display text-neon">{parts.join(' · ')}</span></div>;
                }),
                ...gymRecs.map((r) => <div key={r.name} className="flex justify-between gap-3 text-sm"><span className="truncate">{r.name}</span><span className="shrink-0 font-display text-neon">{r.text}</span></div>),
              ].slice(0, recShown)}
            </div>
          )}
          <FoldMore count={recs.length + gymRecs.length} shown={recShown} onShow={setRecShown} />
        </Card>

        <Card>
          <Fold title="Verlauf" count={history.length} shown={histShown} onShow={setHistShown} empty="Noch kein Training." />
          {histShown > 0 && <div className="mt-2 divide-y divide-line">
            {history.slice(0, histShown).map((it) => it.kind === 'g' ? (
              <div key={`g${it.l.id}`} className="py-2 flex items-center gap-3 text-sm">
                <div className="grid h-10 w-14 shrink-0 place-items-center rounded-lg bg-gem/15">
                  <svg viewBox="0 0 24 24" className="h-6 w-6" fill="#9C86F0"><path d="M2 10h2v4H2zM20 10h2v4h-2zM4.5 7h3v10h-3zM16.5 7h3v10h-3zM7.5 11h9v2h-9z" /></svg>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate">{it.l.name} {it.l.isRecord && <Icon name="trophy" className="w-4 h-4 text-fire" />}</div>
                  <div className="truncate text-xs text-mute">
                    {new Date(it.l.start).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })} · {setsText(it.l.sets)}
                  </div>
                </div>
                <span className="font-display text-neon">+{it.l.points}</span>
                <DelBtn label={it.l.name} points={it.l.points} when={it.l.start} onDel={async () => { await deleteGymLog(it.l.id!); await g.reload(); setRev((r) => r + 1); }} />
              </div>
            ) : ((w) => (
              <div key={w.id} className="py-2 flex items-center gap-3 text-sm">
                <GuideThumb activity={ACT[w.activityId]} className="h-10 w-14 shrink-0 rounded-lg" />
                <div className="flex-1">
                  <div>{ACT[w.activityId].name} {w.isRecord && <Icon name="trophy" className="w-4 h-4 text-fire" />}</div>
                  <div className="text-xs text-mute">
                    {new Date(w.start).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })} ·{' '}
                    {w.reps ? `${w.reps} Wdh.` : w.km ? `${w.km} km` : fmtTime(w.seconds)}
                  </div>
                </div>
                <span className="font-display text-neon">+{w.points}</span>
                <DelBtn label={ACT[w.activityId].name} points={w.points} when={w.start} onDel={async () => { await deleteWorkout(w.id!); await g.reload(); setRev((r) => r + 1); }} />
              </div>
            ))(it.w))}
          </div>}
          <FoldMore count={history.length} shown={histShown} onShow={setHistShown} />
        </Card>

      </div>
      <ShopOverlay open={editAvatar} title="Gem-Shop" onClose={() => setEditAvatar(false)} />
      <ThemeLibrary open={lib} level={lv.level} activeId={g.theme.id} onPick={(id) => void g.pickTheme(id)} onClose={() => setLib(false)} />
    </div>
  );
}

/** Eintrag löschen (mit Rückfrage "Bist du sicher?"), z. B. wenn ein Training ungültig war */
function DelBtn({ label, points, when, onDel }: { label: string; points: number; when: number; onDel: () => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  // Zurück-Taste am Handy schließt das Fenster (wie Abbrechen)
  useBack(open, () => { if (!busy) setOpen(false); });
  const date = new Date(when).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  const del = async () => {
    setBusy(true);
    try { await onDel(); } finally { setBusy(false); setOpen(false); }
  };
  return (
    <>
      <button aria-label={`${label} löschen`} className="-mr-2 grid h-10 w-10 shrink-0 place-items-center rounded-full text-mute active:bg-raised"
        onClick={() => setOpen(true)}>
        <Icon name="trash" className="h-4 w-4" />
      </button>
      {open && createPortal(
        <div className="fixed inset-0 z-[70] flex items-end bg-black/70" onClick={() => !busy && setOpen(false)}>
          <motion.div initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ duration: 0.18 }}
            onClick={(e) => e.stopPropagation()} role="alertdialog" aria-modal="true" aria-label="Training löschen"
            className="w-full max-w-lg mx-auto rounded-t-3xl bg-panel px-4 pt-5 pb-[max(env(safe-area-inset-bottom),16px)] space-y-3">
            <div className="text-center">
              <div className="font-display text-2xl">Bist du sicher?</div>
              <div className="mt-1 font-semibold">{label} · {date}</div>
              <div className="mt-2 text-sm text-mute">
                Das Training wird überall gelöscht: {points} Punkte und die Gems dafür gehen weg. Streak, Rekorde, Abzeichen,
                Statistik und deine Karte in der Rangliste werden neu berechnet. Das lässt sich nicht rückgängig machen.
              </div>
            </div>
            <Btn kind="danger" className="w-full" disabled={busy} onClick={() => void del()}>
              <span className="flex items-center justify-center gap-2"><Icon name="trash" className="h-5 w-5" /> Löschen</span>
            </Btn>
            <Btn kind="ghost" className="w-full" disabled={busy} onClick={() => setOpen(false)}>Abbrechen</Btn>
          </motion.div>
        </div>,
        document.body,
      )}
    </>
  );
}

function Mini({ v, l }: { v: string; l: string }) {
  return <div className="rounded-2xl bg-panel py-3 text-center"><div className="num font-display text-3xl">{v}</div><div className="text-[10px] tracking-wide text-mute">{l}</div></div>;
}

/** Kopfzeile einer einklappbaren Liste: Tippen klappt auf (erste 5) oder ganz zu */
function Fold({ title, count, shown, onShow, empty }: { title: string; count: number; shown: number; onShow: (n: number) => void; empty: string }) {
  if (count === 0) return (<><p className="font-display mb-2">{title}</p><p className="text-sm text-mute">{empty}</p></>);
  return (
    <button className="flex w-full items-center justify-between" onClick={() => onShow(shown > 0 ? 0 : Math.min(5, count))} aria-expanded={shown > 0}>
      <span className="font-display">{title} <span className="text-mute">({count})</span></span>
      <Icon name="down" className={`h-5 w-5 text-mute transition-transform ${shown > 0 ? 'rotate-180' : ''}`} />
    </button>
  );
}

/** Fußzeile: 5 weitere zeigen, solange noch welche fehlen, und alles zuklappen */
function FoldMore({ count, shown, onShow }: { count: number; shown: number; onShow: (n: number) => void }) {
  if (shown === 0) return null;
  return (
    <div className="mt-3 flex gap-2">
      {shown < count && (
        <button onClick={() => onShow(Math.min(count, shown + 5))} className="bg-hot flex-1 rounded-full py-2.5 text-sm font-semibold">
          {Math.min(5, count - shown)} mehr anzeigen
        </button>
      )}
      <button onClick={() => onShow(0)} className="flex-1 rounded-full bg-raised py-2.5 text-sm font-semibold text-mute">Zuklappen</button>
    </div>
  );
}
