import { Capacitor, registerPlugin } from '@capacitor/core';

/**
 * "App aktualisieren" (nur in der Android-App): neue Shadow-Burn-APK aus den Dateien wählen,
 * prüfen, installieren und nach dem Update die Installationsdatei wegräumen.
 * Native Seite: android/app/src/main/java/com/shadowburn/app/ApkUpdatePlugin.java
 */

export interface PickResult {
  /** ok: neuere Shadow-Burn-Version · wrong-app: andere App/keine APK · not-newer: gleich alt oder älter */
  status: 'ok' | 'cancelled' | 'wrong-app' | 'not-newer';
  versionName?: string;
  versionCode?: number;
  installedVersionName?: string;
  installedVersionCode?: number;
}

interface ApkUpdatePlugin {
  pick(): Promise<PickResult>;
  canInstall(): Promise<{ allowed: boolean }>;
  openInstallSettings(): Promise<void>;
  install(): Promise<{ started?: boolean; needsPermission?: boolean }>;
  cleanupIfUpdated(): Promise<{ done: boolean; fileDeleted?: boolean; versionName?: string }>;
}

export const ApkUpdate = registerPlugin<ApkUpdatePlugin>('ApkUpdate');

export function apkUpdateAvailable(): boolean {
  try { return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android'; } catch { return false; }
}

/** Meldung für eine Datei, die nicht installiert werden kann (sonst null) */
export function pickMessage(r: PickResult): string | null {
  if (r.status === 'wrong-app') return 'Das ist keine Shadow-Burn-Datei.';
  if (r.status === 'not-newer') return `Diese Version ist nicht neuer (installiert ${r.installedVersionName ?? '?'}, Datei ${r.versionName ?? '?'}).`;
  return null;
}

/** Beim Start: nach einem Update über den Knopf aufräumen. Liefert die Meldung für den Nutzer oder null. */
export async function finishApkUpdate(): Promise<string | null> {
  if (!apkUpdateAvailable()) return null;
  try {
    const r = await ApkUpdate.cleanupIfUpdated();
    if (!r.done) return null;
    return `Update auf ${r.versionName} fertig. ${r.fileDeleted ? 'Die Installationsdatei wurde gelöscht.' : 'Die Installationsdatei konnte nicht gelöscht werden, du kannst sie selbst löschen.'}`;
  } catch {
    return null;
  }
}
