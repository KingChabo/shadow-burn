import { getKV, setKV } from './db';

/** Einführungs-Tour: läuft einmal nach dem Onboarding, später über Einstellungen erneut startbar. */
const KEY = 'tourDone';
const EVT = 'sb:tour';

export const tourDone = () => getKV<boolean>(KEY, false);
export const setTourDone = () => setKV(KEY, true);

/** Tour von irgendwo aus starten (z. B. Einstellungen) */
export function startTour() {
  window.dispatchEvent(new Event(EVT));
}
export function onStartTour(fn: () => void): () => void {
  window.addEventListener(EVT, fn);
  return () => window.removeEventListener(EVT, fn);
}
