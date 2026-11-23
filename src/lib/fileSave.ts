import { Capacitor, registerPlugin } from '@capacitor/core';

/**
 * Textdatei speichern (z. B. Backup).
 * Android-App: FileSavePlugin.java schreibt die Datei selbst in den Ordner Download,
 * weil der WebView Blob-Downloads still ignoriert. Browser/PWA: normaler Download.
 */
export interface SaveResult { status: 'saved' | 'cancelled'; name?: string; folder?: string }

interface FileSavePlugin {
  saveText(o: { name: string; mime: string; text: string }): Promise<SaveResult>;
}
const FileSave = registerPlugin<FileSavePlugin>('FileSave');

function nativeAndroid(): boolean {
  try { return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android'; } catch { return false; }
}

/** wirft bei Fehlern; 'saved' nur, wenn die Datei wirklich geschrieben wurde (Android) bzw. der Download angestoßen ist (Browser) */
export async function saveTextFile(name: string, text: string, mime = 'application/json'): Promise<SaveResult> {
  if (nativeAndroid()) return FileSave.saveText({ name, mime, text });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type: mime }));
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  return { status: 'saved', name };
}

/** Meldung für den Nutzer nach dem Export */
export function exportMessage(r: SaveResult): string {
  if (r.status === 'cancelled') return 'Export abgebrochen, es wurde nichts gespeichert.';
  const where = r.folder ? ` als „${r.name}“ im Ordner ${r.folder}` : '';
  return `Sicherung gespeichert${where}. Lege die Datei am besten auch woanders ab (z. B. Cloud oder PC).`;
}
