import { beforeEach, describe, expect, it, vi } from 'vitest';

const saveText = vi.fn();
let native = true;
vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: () => native, getPlatform: () => (native ? 'android' : 'web') },
  registerPlugin: () => ({ saveText: (o: unknown) => saveText(o) }),
}));

const { saveTextFile, exportMessage } = await import('./fileSave');

describe('Backup als Datei speichern', () => {
  beforeEach(() => { saveText.mockReset(); native = true; });

  it('Android: schreibt über das Plugin in Download und meldet Namen + Ordner', async () => {
    saveText.mockResolvedValue({ status: 'saved', name: 'shadow-burn-backup-2026-11-23.json', folder: 'Download' });
    const r = await saveTextFile('shadow-burn-backup-2026-11-23.json', '{"app":"shadow-burn"}');
    expect(saveText).toHaveBeenCalledWith({ name: 'shadow-burn-backup-2026-11-23.json', mime: 'application/json', text: '{"app":"shadow-burn"}' });
    expect(exportMessage(r)).toContain('im Ordner Download');
    expect(exportMessage(r)).toMatch(/^Sicherung gespeichert/);
  });

  it('Android: Fehler beim Schreiben wird weitergegeben (keine Erfolgsmeldung)', async () => {
    saveText.mockRejectedValue(new Error('Speichern fehlgeschlagen'));
    await expect(saveTextFile('a.json', '{}')).rejects.toThrow();
  });

  it('abgebrochen: keine Erfolgsmeldung', () => {
    expect(exportMessage({ status: 'cancelled' })).not.toMatch(/^Sicherung gespeichert/);
  });

  it('Browser: normaler Download, Plugin wird nicht benutzt', async () => {
    native = false;
    const click = vi.fn();
    const a = { href: '', download: '', click };
    vi.stubGlobal('document', { createElement: () => a });
    URL.createObjectURL = vi.fn(() => 'blob:x');
    URL.revokeObjectURL = vi.fn();
    const r = await saveTextFile('a.json', '{}');
    expect(click).toHaveBeenCalled();
    expect(saveText).not.toHaveBeenCalled();
    expect(r.status).toBe('saved');
    expect(a.download).toBe('a.json');
    vi.unstubAllGlobals();
  });
});
