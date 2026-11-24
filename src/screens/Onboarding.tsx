import { APP_NAME } from '../lib/brand';
import { useState } from 'react';
import { motion } from 'framer-motion';
import { useGame } from '../lib/store';
import { Btn, Card, Segmented } from '../components/ui';
import { Icon } from '../components/Icon';
import { Assessment } from './Assessment';
import { MAX_WEIGHT, MIN_WEIGHT, saveWeight } from '../lib/body';

export function Onboarding() {
  const g = useGame();
  const [step, setStep] = useState(0);
  const [name, setName] = useState('');
  const [sex, setSex] = useState<'m' | 'f'>('m');
  const [kg, setKg] = useState('');
  const kgNum = Number(kg.replace(',', '.'));
  const kgBad = kg.trim() !== '' && !(kgNum >= MIN_WEIGHT && kgNum <= MAX_WEIGHT);
  const [cam, setCam] = useState<'idle' | 'ok' | 'no'>('idle');

  const askCam = async () => {
    try {
      const s = await navigator.mediaDevices.getUserMedia({ video: true });
      s.getTracks().forEach((t) => t.stop());
      setCam('ok');
    } catch { setCam('no'); }
  };

  const Status = ({ s }: { s: 'idle' | 'ok' | 'no' }) =>
    s === 'ok' ? <span className="text-neon font-bold whitespace-nowrap flex items-center gap-1"><Icon name="check" className="w-4 h-4" strokeWidth={3} /> Erlaubt</span> : s === 'no' ? <span className="text-mute text-sm">Nicht verfügbar – geht auch ohne</span> : null;

  return (
    <div className="h-full max-w-lg mx-auto flex flex-col px-5 pt-[max(env(safe-area-inset-top),24px)] pb-safe">
      {step === 0 && (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="flex-1 flex flex-col justify-center gap-6">
          <div>
            <motion.h1 className="font-display text-6xl text-neon" animate={{ opacity: [0.85, 1, 0.85] }} transition={{ repeat: Infinity, duration: 2.4 }}>{APP_NAME}</motion.h1>
            <p className="text-ink/80 mt-2">Trainieren, Punkte sammeln, Freunde schlagen. Komplett offline.</p>
          </div>
          <label className="block">
            <span className="flex justify-between text-sm text-mute"><span>Wie heißt du?</span><span className="num">{name.length}/20</span></span>
            <input value={name} onChange={(e) => setName(e.target.value.slice(0, 20))} placeholder="Dein Name" autoFocus
              className="mt-2 w-full rounded-2xl bg-panel border border-line px-4 py-4 text-xl outline-none focus:border-neon" />
          </label>
          <div>
            <span className="text-sm text-mute">Muskelgrafik</span>
            <Segmented className="mt-2" value={sex} onChange={setSex} options={[{ id: 'm', label: 'Mann' }, { id: 'f', label: 'Frau' }]} />
          </div>
          <label className="block">
            <span className="flex justify-between text-sm text-mute"><span>Körpergewicht</span><span>freiwillig</span></span>
            <div className="mt-2 flex items-center gap-2">
              <input inputMode="decimal" value={kg} onChange={(e) => setKg(e.target.value.replace(/[^0-9.,]/g, '').slice(0, 5))} placeholder="z. B. 75"
                className="num min-w-0 flex-1 rounded-2xl bg-panel border border-line px-4 py-4 text-xl outline-none focus:border-neon" />
              <span className="text-mute">kg</span>
            </div>
            {kgBad ? <p className="mt-1 text-xs text-bad">Bitte zwischen {MIN_WEIGHT} und {MAX_WEIGHT} kg eintragen.</p>
              : <p className="mt-1 text-xs text-mute">Für die Statistik. Später unter Ich → Statistik änderbar.</p>}
          </label>
          <Btn disabled={!name.trim() || kgBad} onClick={() => setStep(1)}>Weiter</Btn>
        </motion.div>
      )}
      {step === 1 && (
        <motion.div initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} className="flex-1 flex flex-col gap-4 pt-6">
          <h2 className="font-display text-3xl">Berechtigungen</h2>
          <p className="text-mute text-sm">Alles bleibt auf deinem Handy. Freiwillig: Ohne Kamera zählst du von Hand.</p>
          <Card>
            <div className="flex items-center justify-between gap-3">
              <div><b className="flex items-center gap-2"><Icon name="camera" className="w-5 h-5 text-neon" /> Kamera</b><p className="text-sm text-mute">Zählt Liegestütze, Sit-ups, Kniebeugen und mehr.</p></div>
              {cam === 'idle' ? <Btn kind="ghost" className="!py-2 !px-3 !text-sm" onClick={askCam}>Erlauben</Btn> : <Status s={cam} />}
            </div>
          </Card>
          <p className="text-xs text-mute">Bewegungssensor (z. B. Sprung-Zähler) und Standort (GPS) fragt die App erst, wenn du so einen Modus zum ersten Mal startest.</p>
          <div className="flex-1" />
          <Btn onClick={() => setStep(2)}>Weiter</Btn>
        </motion.div>
      )}
      {step === 2 && (
        <motion.div initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} className="flex-1 overflow-y-auto pt-6 pb-6">
          <Assessment camera={cam === 'ok'} onDone={async () => { if (kg.trim() && !kgBad) { try { await saveWeight(kgNum); } catch { /* ungültig: weglassen */ } } await g.setSettings({ ...g.settings, sex }); await g.setProfile({ name: name.trim(), createdAt: Date.now() }); }} />
        </motion.div>
      )}
    </div>
  );
}
