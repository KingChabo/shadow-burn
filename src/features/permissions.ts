// Erlaubnisse erst dann, wenn man eine Funktion wirklich nutzen will (23.11.2026).
// In der Einführung wird nur noch die Kamera angeboten. Bewegungssensor und Standort fragt die App
// beim ersten Start eines Modus, der sie braucht, mit einer kurzen Erklärung. Die Zusage steht in prefs.allow.
import type { Mode } from '../data/activities';
import { requestMotionPermission } from './sensors';
import { getKV, setKV } from '../lib/db';

export type PermKind = 'motion' | 'location';
export type Allow = Partial<Record<PermKind, boolean>>;

/** In der App zugestimmt? (eigener Schlüssel 'allow', damit andere Einstellungen ihn nicht überschreiben) */
export const getAllow = () => getKV<Allow>('allow', {});
export async function setAllow(kind: PermKind, on: boolean): Promise<Allow> {
  const a = { ...(await getAllow()), [kind]: on };
  await setKV('allow', a);
  return a;
}

/** Welche Erlaubnis ein Zähl-Modus braucht (Kamera fragt das Handy selbst beim Öffnen) */
export function permFor(mode: Mode): PermKind | null {
  if (mode === 'sensor' || mode === 'pocket' || mode === 'jump') return 'motion';
  if (mode === 'gps') return 'location';
  return null;
}

export const PERM_INFO: Record<PermKind, { title: string; text: string; icon: 'tilt' | 'pin' }> = {
  motion: {
    title: 'Bewegungssensor nutzen?',
    text: 'Damit zählt das Handy in der Hosentasche oder auf der Brust deine Wiederholungen und Sprünge. Der Sensor läuft nur während dieses Trainings. Nichts wird gespeichert oder verschickt.',
    icon: 'tilt',
  },
  location: {
    title: 'Standort nutzen?',
    text: 'Damit misst das GPS deine Strecke, ganz ohne Internet. Der Standort wird nur während dieses Trainings abgefragt und verlässt dein Handy nie. Gleich fragt das Handy noch einmal selbst nach.',
    icon: 'pin',
  },
};

export type PermResult = { ok: true } | { ok: false; reason: string };

/** Fragt das Handy (falls nötig). Android braucht für den Bewegungssensor keine eigene Erlaubnis. */
export async function requestPerm(kind: PermKind): Promise<PermResult> {
  if (kind === 'motion') {
    if (!('DeviceMotionEvent' in window) && !('DeviceOrientationEvent' in window)) return { ok: false, reason: 'Dieses Gerät hat keinen Bewegungssensor. Wähle einen anderen Modus.' };
    const ok = await requestMotionPermission();
    // Nur iPhone/iPad fragen wirklich nach. Android liefert die Daten ohne Nachfrage; ob wirklich welche kommen,
    // prüft der Trainings-Bildschirm selbst (Hinweis + "Stattdessen von Hand zählen").
    const ios = /iPhone|iPad|iPod/.test(navigator.userAgent);
    return ok || !ios ? { ok: true } : { ok: false, reason: 'Bewegungssensor nicht erlaubt. Wähle einen anderen Modus.' };
  }
  if (!navigator.geolocation) return { ok: false, reason: 'Dieses Gerät hat kein GPS. Trag die Strecke stattdessen ein.' };
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      () => resolve({ ok: true }),
      // Kein Signal (z. B. drinnen) ist kein Nein: dann trotzdem starten, das GPS sucht weiter
      (e) => resolve(e.code === 1 ? { ok: false, reason: 'Standort nicht erlaubt. Du kannst ihn in den Handy-Einstellungen freigeben oder die Strecke eintragen.' } : { ok: true }),
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 60000 },
    );
  });
}
