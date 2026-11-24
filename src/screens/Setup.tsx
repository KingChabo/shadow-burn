import { useEffect, useState, type ReactNode } from 'react';
import { MODE_INFO, MUSCLE_NAMES, setupHint, startMode, type Activity, type Mode } from '../data/activities';
import { useGame } from '../lib/store';
import { Btn, Header, Segmented } from '../components/ui';
import { useExerciseInfo } from './live/sets';
import { clampRest, cleanPlan, fmtSec, lastText, MAX_PLAN_SETS, planText, recordText, REST_STEP, suggestPlan, targetOf, supportsSets, type LiveSets, type SetMode, type SetPlan } from '../lib/sets';
import { GuideVideo } from '../components/GuideVideo';
import { MuscleMap } from '../components/MuscleMap';
import { preloadPose } from '../features/pose/preload';
import { Icon } from '../components/Icon';
import { motion } from 'framer-motion';
import { getAllow, PERM_INFO, permFor, requestPerm, setAllow, type PermKind } from '../features/permissions';

/** Vor jedem Start: Vorlage, Muskelgruppen, Zähl-Modus */
/** withSets: Sätze wählbar (im Training-Tab; in Workouts nicht, dort plant der Workout die Sätze) */
export function Setup({ activity: a, onBack, onStart, withSets }: { activity: Activity; onBack: () => void; onStart: (m: Mode, sets?: LiveSets) => void; withSets?: boolean }) {
  const g = useGame();
  const info = useExerciseInfo(a);
  const [setsMode, setSetsMode] = useState<SetMode>(g.prefs.setMode ?? 'free');
  const [plan, setPlan] = useState<SetPlan | null>(null);
  // Solange nichts geändert wurde: Vorschlag aus gespeichertem Plan bzw. letztem Training
  const shownPlan = plan ?? suggestPlan(a, g.prefs.setPlans?.[a.id], info.last);
  const rec = recordText(g.records[a.id], a);
  const last = g.prefs.lastMode[a.id];
  const [mode, setMode] = useState<Mode>(() => startMode(a, last));
  const [err, setErr] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const hint = setupHint(a.id, mode);

  // Kamera-Modell schon mal laden, damit es nach dem Countdown sofort bereit ist
  useEffect(() => { if (mode === 'camera') preloadPose(); }, [mode]);

  const [ask, setAsk] = useState<PermKind | null>(null);

  const start = async (confirmed = false) => {
    setErr(null);
    // Bewegungssensor / Standort: erst jetzt fragen, beim ersten Mal mit kurzer Erklärung
    const need = permFor(mode);
    if (need) {
      if (!(await getAllow())[need] && !confirmed) { setAsk(need); return; }
      const r = await requestPerm(need);
      if (!r.ok) { setErr(r.reason); return; }
      await setAllow(need, true);
    }
    if (mode === 'camera' && !navigator.mediaDevices?.getUserMedia) {
      setErr('Kamera braucht HTTPS.');
      return;
    }
    // Wahl merken: Erfassungsart je Übung (immer), Sätze nur wo es sie gibt
    const lastMode = { ...g.prefs.lastMode, [a.id]: mode };
    if (!withSets || !supportsSets(a, mode)) { void g.setPrefs({ ...g.prefs, lastMode }); onStart(mode); return; }
    const prefs = { ...g.prefs, lastMode, setMode: setsMode, ...(setsMode === 'plan' ? { setPlans: { ...g.prefs.setPlans, [a.id]: shownPlan } } : {}) };
    void g.setPrefs(prefs);
    onStart(mode, setsMode === 'plan' ? { mode: 'plan', plan: shownPlan } : { mode: 'free' });
  };
  const timed = a.unit === 'time';
  const maxT = timed ? 600 : 200;
  const clampT = (x: number) => Math.min(maxT, Math.max(1, x));
  const upd = (k: 'sets' | 'target' | 'rest', d: number) => {
    const p = { ...shownPlan };
    if (k === 'sets') p.sets = Math.min(MAX_PLAN_SETS, Math.max(1, p.sets + d));
    // „Alle Sätze“: bei einzelnen Zielen alle gleich weit verschieben
    if (k === 'target') { if (p.targets) p.targets = p.targets.map((x) => clampT(x + d)); else p.target = clampT(p.target + d); }
    if (k === 'rest') p.rest = clampRest(p.rest + d);
    setPlan(cleanPlan(p, a));
  };
  const [each, setEach] = useState(false);
  const eachOpen = each || !!shownPlan.targets;
  /** Ziel eines einzelnen Satzes ändern */
  const updOne = (i: number, d: number) => {
    const list = Array.from({ length: shownPlan.sets }, (_, j) => targetOf(shownPlan, j));
    list[i] = clampT(list[i] + d);
    setPlan(cleanPlan({ ...shownPlan, targets: list }, a));
  };
  /** Zurück auf „alle gleich“: alle bekommen das Ziel des ersten Satzes */
  const allSame = () => { setPlan(cleanPlan({ ...shownPlan, target: targetOf(shownPlan, 0), targets: undefined }, a)); setEach(false); };
  const fT = (x: number) => (timed ? fmtSec(x) : String(x));

  return (
    <div className="pb-6">
      <Header title={a.name} onBack={onBack} />
      <div className="px-4 space-y-4">
        <GuideVideo activity={a} mode={mode} />
        {(rec || info.last) && (
          <p className="flex flex-wrap gap-x-3 gap-y-0.5 px-1 text-xs text-mute">
            <span className="flex items-center gap-1"><Icon name="trophy" className="h-3.5 w-3.5 text-fire" />Rekord: <b className="font-semibold text-ink">{rec ?? 'noch keiner'}</b></span>
            {info.last && <span>Letztes Mal ({new Date(info.last.start).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' })}): <b className="font-semibold text-ink">{lastText(info.last, a)}</b></span>}
          </p>
        )}

        {/* Jede Einstellung ist eine Zeile mit ihrem Wert; Antippen klappt sie auf (immer nur eine offen) */}
        <div className="divide-y divide-line rounded-2xl bg-panel">
          <Row id="modus" label="Zählen mit" open={open} onOpen={setOpen} fixed={a.modes.length < 2}
            value={<><b className="font-semibold">{MODE_INFO[mode].name}</b><span className="text-mute"> · {MODE_INFO[mode].desc}</span></>}>
            <div className="grid grid-cols-2 gap-2">
              {a.modes.map((m) => (
                <button key={m} onClick={() => { setMode(m); setOpen(null); }}
                  className={`flex items-center gap-2.5 rounded-2xl bg-raised p-3 text-left ring-1 ${a.modes.length % 2 && m === a.modes[a.modes.length - 1] ? 'col-span-2' : ''} ${mode === m ? 'ring-neon' : 'ring-transparent'}`}>
                  <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ${mode === m ? 'bg-hot' : 'bg-panel text-ink'}`}><Icon name={MODE_INFO[m].icon} className="h-5 w-5" /></span>
                  <span className="min-w-0">
                    <b className="block text-sm font-semibold">{MODE_INFO[m].name}</b>
                    <span className="block text-[11px] leading-snug text-mute">{MODE_INFO[m].desc}</span>
                  </span>
                </button>
              ))}
            </div>
          </Row>

          {withSets && supportsSets(a, mode) && (
            <Row id="saetze" label="Sätze" open={open} onOpen={setOpen}
              value={setsMode === 'free'
                ? <><b className="font-semibold">Frei</b><span className="text-mute"> · Pause nach Bedarf</span></>
                : <><b className="font-semibold">{planText(shownPlan, timed)}</b><span className="text-mute"> · Pause {fmtSec(shownPlan.rest)}</span></>}>
              <div className="space-y-2">
                <Segmented value={setsMode} onChange={setSetsMode} className="!bg-raised !shadow-none"
                  options={[{ id: 'free', label: 'Frei' }, { id: 'plan', label: 'Vorher festlegen' }]} />
                {setsMode === 'free'
                  ? <p className="text-xs text-mute">Einfach loslegen. Nach jedem Satz „Satz fertig“ oder „Pause“ (1:30, verlängern oder kürzen) antippen.</p>
                  : (
                    <div className="space-y-1.5">
                      <Stepper label="Sätze" value={String(shownPlan.sets)} onMinus={() => upd('sets', -1)} onPlus={() => upd('sets', 1)} />
                      {!eachOpen ? (
                        <Stepper label={timed ? 'Ziel pro Satz' : 'Wiederholungen pro Satz'} value={fT(shownPlan.target)}
                          onMinus={() => upd('target', timed ? -5 : -1)} onPlus={() => upd('target', timed ? 5 : 1)} />
                      ) : (
                        <div className="space-y-1.5 rounded-2xl bg-bg/40 p-2">
                          {Array.from({ length: shownPlan.sets }, (_, i) => (
                            <Stepper key={i} label={`Satz ${i + 1}`} value={fT(targetOf(shownPlan, i))}
                              onMinus={() => updOne(i, timed ? -5 : -1)} onPlus={() => updOne(i, timed ? 5 : 1)} />
                          ))}
                        </div>
                      )}
                      <button onClick={() => (eachOpen ? allSame() : setEach(true))} className="text-sm font-medium text-neon">
                        {eachOpen ? 'Alle Sätze gleich' : `Jeden Satz einzeln einstellen (${timed ? 'Zeit' : 'Wiederholungen'})`}
                      </button>
                      <Stepper label="Pause" value={fmtSec(shownPlan.rest)} onMinus={() => upd('rest', -REST_STEP)} onPlus={() => upd('rest', REST_STEP)} />
                      <p className="text-xs text-mute">Ist das Ziel erreicht, startet die Pause von selbst.</p>
                    </div>
                  )}
              </div>
            </Row>
          )}

          {hint && (
            <Row id="aufstellen" label="Aufstellen" open={open} onOpen={setOpen} value={<span>{hint}</span>} clamp>
              <p className="flex gap-2.5 text-sm"><Icon name="phone" className="mt-0.5 h-5 w-5 shrink-0 text-mute" /><span>{hint}</span></p>
            </Row>
          )}

          <Row id="muskeln" label="Muskeln" open={open} onOpen={setOpen}
            value={<><b className="font-semibold">{a.muscles.primary.map((m) => MUSCLE_NAMES[m]).join(', ')}</b>{a.muscles.secondary.length > 0 && <span className="text-mute"> · +{a.muscles.secondary.length}</span>}</>}>
            <MuscleMap primary={a.muscles.primary} secondary={a.muscles.secondary} />
          </Row>

          {(a.guide.tips.length + a.guide.mistakes.length) > 0 && (
            <Row id="tipps" label="Tipps" open={open} onOpen={setOpen}
              value={<span className="text-mute">{a.guide.tips.length} Tipps{a.guide.mistakes.length ? `, ${a.guide.mistakes.length} häufige Fehler` : ''}</span>}>
              <div className="grid gap-2.5">
                {a.guide.tips.map((t) => (
                  <div key={t} className="flex gap-2.5 text-sm"><Icon name="check" className="mt-0.5 h-4 w-4 shrink-0 text-good" strokeWidth={2.5} /><span>{t}</span></div>
                ))}
                {a.guide.mistakes.map((t) => (
                  <div key={t} className="flex gap-2.5 text-sm text-mute"><Icon name="x" className="mt-0.5 h-4 w-4 shrink-0 text-bad" strokeWidth={2.5} /><span>{t}</span></div>
                ))}
              </div>
            </Row>
          )}
        </div>

        {err && <p className="text-bad text-sm">{err}</p>}
        <Btn onClick={() => void start()} className="sticky bottom-3 w-full !py-4">Los geht's</Btn>
      </div>
      {ask && <PermSheet kind={ask} onYes={() => { setAsk(null); void start(true); }} onNo={() => setAsk(null)} />}
    </div>
  );
}

/** Kurze Erklärung, bevor die App den Sensor oder Standort zum ersten Mal nutzt */
function PermSheet({ kind, onYes, onNo }: { kind: PermKind; onYes: () => void; onNo: () => void }) {
  const p = PERM_INFO[kind];
  return (
    <div className="fixed inset-0 z-[60] flex items-end bg-black/70" onClick={onNo}>
      <motion.div initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ duration: 0.18 }} onClick={(e) => e.stopPropagation()}
        role="dialog" aria-label={p.title} className="mx-auto w-full max-w-lg space-y-3 rounded-t-3xl bg-panel px-4 pt-5 pb-[max(env(safe-area-inset-bottom),16px)]">
        <div className="flex items-center gap-3">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-hot"><Icon name={p.icon} className="h-6 w-6" /></span>
          <b className="font-display text-2xl">{p.title}</b>
        </div>
        <p className="text-sm text-mute">{p.text}</p>
        <p className="text-xs text-mute">Nur nötig, wenn du diesen Modus nutzt. Zurücknehmen geht unter Einstellungen → Training.</p>
        <Btn className="w-full" onClick={onYes}>Erlauben und starten</Btn>
        <button onClick={onNo} className="w-full py-2 text-sm text-mute underline">Nicht jetzt</button>
      </motion.div>
    </div>
  );
}

function Stepper({ label, value, onMinus, onPlus }: { label: string; value: string; onMinus: () => void; onPlus: () => void }) {
  return (
    <div className="flex items-center gap-2">
      <span className="flex-1 text-sm text-mute">{label}</span>
      <button aria-label={`${label} weniger`} onClick={onMinus} className="grid h-9 w-9 place-items-center rounded-full bg-raised text-lg font-semibold">−</button>
      <span className="num w-16 text-center font-display text-xl">{value}</span>
      <button aria-label={`${label} mehr`} onClick={onPlus} className="grid h-9 w-9 place-items-center rounded-full bg-raised text-lg font-semibold">+</button>
    </div>
  );
}

/** Eine Einstellung als Zeile: oben Name + aktueller Wert, aufgeklappt die Auswahl */
function Row({ id, label, value, open, onOpen, fixed, clamp, children }: {
  id: string; label: string; value: ReactNode; open: string | null; onOpen: (id: string | null) => void; fixed?: boolean; /** aufgeklappt den Wert ausblenden (er steht dann ganz darunter) */ clamp?: boolean; children: ReactNode;
}) {
  const on = open === id && !fixed;
  return (
    <div className="px-3.5 py-3">
      <button className="flex w-full items-center gap-3 text-left disabled:cursor-default" disabled={fixed} aria-expanded={on} onClick={() => onOpen(on ? null : id)}>
        <span className="min-w-0 flex-1">
          <span className="kicker block">{label}</span>
          <span className={`mt-0.5 text-sm ${clamp && on ? 'hidden' : 'line-clamp-1'}`}>{value}</span>
        </span>
        {!fixed && <Icon name="down" className={`h-4 w-4 shrink-0 text-mute transition-transform ${on ? 'rotate-180' : ''}`} />}
      </button>
      {on && <div className="mt-3">{children}</div>}
    </div>
  );
}
