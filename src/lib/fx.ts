import type { Settings } from './game';

// Töne werden mit Web Audio erzeugt – keine Dateien, 100 % offline.
let ctx: AudioContext | null = null;
let settings: Settings = { sound: true, voice: true, vibration: true };
export function setFxSettings(s: Settings) { settings = s; }

function ac(): AudioContext | null {
  try {
    if (!ctx) ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch { return null; }
}

function tone(freq: number, dur: number, type: OscillatorType = 'sine', gain = 0.18, delay = 0) {
  const a = ac();
  if (!a) return;
  const t = a.currentTime + delay;
  const o = a.createOscillator();
  const g = a.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(a.destination);
  o.start(t);
  o.stop(t + dur + 0.02);
}

export type Sfx = 'rep' | 'invalid' | 'tick' | 'go' | 'success' | 'gem' | 'tap';

export function sfx(kind: Sfx) {
  if (!settings.sound) return;
  switch (kind) {
    case 'rep': tone(880, 0.12, 'triangle'); tone(1320, 0.1, 'triangle', 0.1, 0.05); break;
    case 'invalid': tone(180, 0.25, 'sawtooth', 0.12); break;
    case 'tick': tone(660, 0.1, 'square', 0.08); break;
    case 'go': tone(990, 0.35, 'square', 0.1); break;
    case 'tap': tone(520, 0.06, 'triangle', 0.1); break;
    case 'gem': [1046, 1318, 1568, 2093].forEach((f, i) => tone(f, 0.18, 'sine', 0.12, i * 0.07)); break;
    case 'success': [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.25, 'triangle', 0.14, i * 0.1)); break;
  }
}

export function buzz(pattern: number | number[]) {
  if (!settings.vibration) return;
  try { navigator.vibrate?.(pattern); } catch { /* nicht unterstützt */ }
}

export function say(text: string) {
  if (!settings.voice || !('speechSynthesis' in window)) return;
  try {
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'de-DE';
    u.rate = 1.1;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(u);
  } catch { /* ignorieren */ }
}

/** Bildschirm anlassen während des Trainings */
export async function keepAwake(): Promise<() => void> {
  try {
    const nav = navigator as Navigator & { wakeLock?: { request(t: 'screen'): Promise<{ release(): Promise<void> }> } };
    const lock = await nav.wakeLock?.request('screen');
    return () => { void lock?.release(); };
  } catch { return () => {}; }
}
