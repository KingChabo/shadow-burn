import { Capacitor, registerPlugin, type PluginListenerHandle } from '@capacitor/core';

/**
 * Brücke zum eigenen Android-Plugin (android/app/src/main/java/com/shadowburn/app/BleExchangePlugin.java).
 * Im Browser/PWA gibt es kein Bluetooth-Peripheral: dort meldet die Attrappe "nicht unterstützt".
 */

export type Role = 'central' | 'peripheral';

export interface BleStatus { supported: boolean; granted: boolean; enabled: boolean; advertise: boolean }

export interface BleExchangePlugin {
  status(): Promise<BleStatus>;
  askPermission(): Promise<{ granted: boolean }>;
  enable(): Promise<{ enabled: boolean }>;
  /** sichtbar werden (Werbung + GATT-Server) und nach anderen suchen. `advert` = base64 (Sitzungs-ID + Name) */
  start(o: { advert: string }): Promise<{ server: boolean; advertise: boolean }>;
  scan(o: { on: boolean }): Promise<void>;
  stop(): Promise<void>;
  connect(o: { id: string }): Promise<{ mtu: number }>;
  disconnect(o: { role: Role | 'all' }): Promise<void>;
  send(o: { role: Role; packets: string[] }): Promise<{ sent: number }>;
  addListener(e: 'found', fn: (d: { id: string; adv: string; rssi: number }) => void): Promise<PluginListenerHandle>;
  addListener(e: 'packet', fn: (d: { role: Role; data: string }) => void): Promise<PluginListenerHandle>;
  addListener(e: 'link', fn: (d: { role: Role; state: 'connected' | 'disconnected'; id: string; mtu: number }) => void): Promise<PluginListenerHandle>;
  addListener(e: 'sent', fn: (d: { role: Role; done: number; total: number }) => void): Promise<PluginListenerHandle>;
  addListener(e: 'state', fn: (d: { what: 'scan' | 'advertise' | 'server' | 'stopped'; code: number }) => void): Promise<PluginListenerHandle>;
  removeAllListeners(): Promise<void>;
}

const NO = 'Bluetooth-Austausch gibt es nur in der Android-App.';

/** Attrappe für Browser/PWA und Tests */
export const webBle: BleExchangePlugin = {
  status: async () => ({ supported: false, granted: false, enabled: false, advertise: false }),
  askPermission: async () => ({ granted: false }),
  enable: async () => ({ enabled: false }),
  start: async () => { throw new Error(NO); },
  scan: async () => {},
  stop: async () => {},
  connect: async () => { throw new Error(NO); },
  disconnect: async () => {},
  send: async () => { throw new Error(NO); },
  addListener: (async () => ({ remove: async () => {} })) as BleExchangePlugin['addListener'],
  removeAllListeners: async () => {},
};

export const Ble = registerPlugin<BleExchangePlugin>('BleExchange', { web: webBle });

/** Nur in der nativen Android-App verfügbar */
export function bleAvailable(): boolean {
  try { return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android'; } catch { return false; }
}

/** Beim Einschalten in den Einstellungen: Berechtigung holen. true = darf benutzt werden */
export async function ensureBlePermission(): Promise<{ ok: boolean; msg?: string }> {
  if (!bleAvailable()) return { ok: false, msg: NO };
  try {
    const s = await Ble.status();
    if (!s.supported) return { ok: false, msg: 'Dieses Handy hat kein Bluetooth Low Energy.' };
    if (s.granted) return { ok: true };
    const r = await Ble.askPermission();
    return r.granted ? { ok: true } : { ok: false, msg: 'Ohne die Berechtigung „Geräte in der Nähe“ geht der Bluetooth-Austausch nicht. Du kannst sie in den Android-Einstellungen der App erlauben.' };
  } catch (e) {
    return { ok: false, msg: e instanceof Error ? e.message : 'Bluetooth nicht verfügbar' };
  }
}
