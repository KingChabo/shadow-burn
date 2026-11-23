/**
 * Bluetooth-Austausch bei Treffen: reine Logik ohne Bluetooth (testbar).
 *
 * Eine Nachricht wird in kleine Pakete zerlegt, die einzeln über BLE gehen.
 * Paket = [Art 1 Byte][Nummer 2 Byte][Anzahl 2 Byte][Daten …]
 * Die Daten aller Pakete zusammen = [Länge 4 Byte][CRC32 4 Byte][Inhalt …].
 * So merkt der Empfänger, wenn etwas fehlt oder kaputt angekommen ist.
 */

export const Kind = {
  /** "Ich möchte tauschen": { sid, name } */
  Hello: 1,
  /** Gegenüber hat angenommen */
  Accept: 2,
  /** Gegenüber hat abgelehnt */
  Decline: 3,
  /** Die eigentlichen Daten (gleicher Text wie beim QR-Tausch) */
  Data: 4,
  /** Daten sind vollständig angekommen und gespeichert */
  Done: 5,
  /** Abgebrochen */
  Cancel: 6,
} as const;
export type Kind = (typeof Kind)[keyof typeof Kind];

const KINDS = new Set([1, 2, 3, 4, 5, 6]);
export const PACKET_HEAD = 5;
const MSG_HEAD = 8;
/** größte Nachricht, die wir annehmen (Sicherheitsgrenze, ca. 4 MB) */
export const MAX_MESSAGE = 4 * 1024 * 1024;
/** Kürzester sinnvoller Paketinhalt (BLE-Standard ohne größere MTU: 20 Byte) */
export const MIN_PACKET = 20;
/** Größtes Paket, das Android in einem Rutsch schreibt (MTU 517 − 3 − Reserve) */
export const MAX_PACKET = 509;

/** Paketgröße aus der ausgehandelten MTU (3 Byte gehen für den ATT-Kopf drauf) */
export function packetSize(mtu: number): number {
  return Math.max(MIN_PACKET, Math.min(MAX_PACKET, Math.floor(mtu) - 3));
}

// ---------- Prüfsumme ----------

const TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

/** CRC32 (wie bei ZIP) */
export function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

// ---------- Zerlegen ----------

export function encodeMessage(kind: Kind, data: Uint8Array, size: number): Uint8Array[] {
  if (data.length > MAX_MESSAGE) throw new Error('Zu viele Daten');
  const body = Math.max(1, size - PACKET_HEAD);
  const all = new Uint8Array(MSG_HEAD + data.length);
  const v = new DataView(all.buffer);
  v.setUint32(0, data.length);
  v.setUint32(4, crc32(data));
  all.set(data, MSG_HEAD);
  const n = Math.ceil(all.length / body);
  if (n > 0xffff) throw new Error('Zu viele Pakete');
  const out: Uint8Array[] = [];
  for (let i = 0; i < n; i++) {
    const part = all.subarray(i * body, (i + 1) * body);
    const p = new Uint8Array(PACKET_HEAD + part.length);
    const pv = new DataView(p.buffer);
    p[0] = kind;
    pv.setUint16(1, i);
    pv.setUint16(3, n);
    p.set(part, PACKET_HEAD);
    out.push(p);
  }
  return out;
}

export const encodeText = (kind: Kind, text: string, size: number) => encodeMessage(kind, new TextEncoder().encode(text), size);
export const encodeJson = (kind: Kind, obj: unknown, size: number) => encodeText(kind, JSON.stringify(obj), size);

export interface Message { kind: Kind; data: Uint8Array }

/**
 * Setzt Pakete wieder zusammen. Pakete kommen bei BLE in Reihenfolge an;
 * fängt eine neue Nachricht an (Nummer 0), wird eine halbe alte verworfen.
 */
export class Assembler {
  private kind = 0;
  private n = 0;
  private next = 0;
  private parts: Uint8Array[] = [];
  private bytes = 0;

  /** Fortschritt der gerade laufenden Nachricht */
  get progress(): { kind: number; got: number; n: number } {
    return { kind: this.kind, got: this.next, n: this.n };
  }

  reset() { this.kind = 0; this.n = 0; this.next = 0; this.parts = []; this.bytes = 0; }

  /** Gibt die fertige Nachricht zurück, sonst null. Wirft bei kaputten Daten. */
  add(p: Uint8Array): Message | null {
    if (p.length < PACKET_HEAD || !KINDS.has(p[0])) throw new Error('Unbekanntes Paket');
    const v = new DataView(p.buffer, p.byteOffset, p.byteLength);
    const i = v.getUint16(1), n = v.getUint16(3);
    if (n < 1 || i >= n) throw new Error('Unbekanntes Paket');
    if (i === 0) { this.reset(); this.kind = p[0]; this.n = n; }
    else if (p[0] !== this.kind || n !== this.n || i !== this.next) { this.reset(); throw new Error('Pakete durcheinander'); }
    const part = p.slice(PACKET_HEAD);
    this.bytes += part.length;
    if (this.bytes > MAX_MESSAGE + MSG_HEAD) { this.reset(); throw new Error('Zu viele Daten'); }
    this.parts.push(part);
    this.next = i + 1;
    if (this.next < this.n) return null;
    const all = new Uint8Array(this.bytes);
    let o = 0;
    for (const x of this.parts) { all.set(x, o); o += x.length; }
    const kind = this.kind as Kind;
    this.reset();
    if (all.length < MSG_HEAD) throw new Error('Daten unvollständig');
    const av = new DataView(all.buffer);
    const len = av.getUint32(0), sum = av.getUint32(4);
    const data = all.slice(MSG_HEAD);
    if (data.length !== len) throw new Error('Daten unvollständig');
    if (crc32(data) !== sum) throw new Error('Prüfsumme falsch');
    return { kind, data };
  }
}

export const decodeText = (m: Message) => new TextDecoder().decode(m.data);

// ---------- Hallo-Nachricht ----------

/** `code` nur bei der Kopplung per QR-Code (ältere Apps ignorieren das Feld) */
export interface Hello { sid: string; name: string; code?: string }

const SID_RE = /^[a-z0-9]{4,12}$/;
const CODE_RE = /^[a-z0-9]{6,16}$/;

export function parseHello(m: Message): Hello | null {
  try {
    const o = JSON.parse(decodeText(m));
    if (!o || typeof o.sid !== 'string' || !SID_RE.test(o.sid)) return null;
    const name = typeof o.name === 'string' ? o.name.replace(/[\u0000-\u001f\u007f]/g, '').slice(0, 24).trim() : '';
    const h: Hello = { sid: o.sid, name: name || 'Unbekannt' };
    // ein mitgeschickter, aber kaputter Code zählt als falscher Code (nicht als normale Anfrage)
    if (o.code !== undefined) h.code = typeof o.code === 'string' && CODE_RE.test(o.code) ? o.code : '-';
    return h;
  } catch { return null; }
}

// ---------- Kopplung per QR-Code ----------

/** Inhalt des kleinen QR-Codes: "SBBT1|<Sitzungs-ID>|<Einmal-Code>" */
export const PAIR_PREFIX = 'SBBT1';
export const PAIR_CODE_LEN = 10;
/** Text in der Decline-Nachricht, wenn der Code nicht stimmt (ältere Apps lesen den Inhalt nicht) */
export const BAD_CODE = 'code';
/** Text in der Decline-Nachricht, wenn das andere Handy nur per QR-Code tauscht (extra sicher) */
export const NEED_CODE = 'secure';

/** Zufälliger Einmal-Code (10 Zeichen a–z, 0–9, aus dem Zufallsgenerator des Systems) */
export function newPairCode(): string {
  const abc = 'abcdefghijklmnopqrstuvwxyz0123456789';
  const r = new Uint8Array(PAIR_CODE_LEN);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) crypto.getRandomValues(r);
  else for (let i = 0; i < r.length; i++) r[i] = Math.floor(Math.random() * 256);
  // 252 = 7 × 36: Werte darüber würden manche Zeichen bevorzugen, deshalb einfach neu würfeln
  let s = '';
  for (let i = 0; i < r.length; i++) {
    let b = r[i];
    while (b >= 252) { const x = new Uint8Array(1); if (typeof crypto !== 'undefined' && crypto.getRandomValues) crypto.getRandomValues(x); else x[0] = Math.floor(Math.random() * 252); b = x[0]; }
    s += abc[b % 36];
  }
  return s;
}

export function encodePair(sid: string, code: string): string {
  return `${PAIR_PREFIX}|${sid}|${code}`;
}

export function parsePair(text: string): { sid: string; code: string } | null {
  const m = /^SBBT1\|([a-z0-9]{4,12})\|([a-z0-9]{6,16})$/.exec(text.trim());
  return m ? { sid: m[1], code: m[2] } : null;
}

// ---------- Sichtbarer Name in der Funkwerbung ----------

/** Länge der Sitzungs-ID in der Funkwerbung */
export const SID_LEN = 6;
/** Platz für den Namen: 31 Byte − 2 (Kopf) − 2 (Hersteller-ID) − 6 (Sitzungs-ID) */
export const ADV_NAME_BYTES = 21;

/** Neue zufällige Sitzungs-ID (6 Zeichen a–z, 0–9), wechselt bei jedem Öffnen des Bildschirms */
export function newBleSid(rand: () => number = Math.random): string {
  const abc = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let s = '';
  for (let i = 0; i < SID_LEN; i++) s += abc[Math.floor(rand() * abc.length) % abc.length];
  return s;
}

/** Namen so kürzen, dass er als UTF-8 in die Funkwerbung passt (ohne ein Zeichen zu zerschneiden) */
export function advertName(name: string, max = ADV_NAME_BYTES): string {
  const enc = new TextEncoder();
  let out = '';
  for (const ch of name.replace(/[\u0000-\u001f\u007f]/g, '').trim()) {
    if (enc.encode(out + ch).length > max) break;
    out += ch;
  }
  return out || 'Shadow Burn';
}

/** Hersteller-Daten aus der Funkwerbung lesen: 6 Zeichen Sitzungs-ID + Name */
export function parseAdvert(bytes: Uint8Array): Hello | null {
  if (bytes.length < SID_LEN) return null;
  const txt = new TextDecoder('utf-8', { fatal: false }).decode(bytes);
  const sid = txt.slice(0, SID_LEN);
  if (!SID_RE.test(sid)) return null;
  return { sid, name: txt.slice(SID_LEN).replace(/[\u0000-\u001f\u007f�]/g, '').trim() || 'Unbekannt' };
}

export function encodeAdvert(sid: string, name: string): Uint8Array {
  return new TextEncoder().encode(sid.slice(0, SID_LEN) + advertName(name));
}

// ---------- Wer verbindet sich? ----------

/**
 * Tippen beide gleichzeitig aufeinander, entstehen zwei Verbindungen. Dann bleibt nur die
 * Verbindung von dem Handy mit der größeren Sitzungs-ID bestehen (es ist "Central"),
 * das andere Handy gibt seine eigene Verbindung auf und nimmt die eingehende an.
 */
export function keepsOutgoing(mySid: string, theirSid: string): boolean {
  return mySid > theirSid;
}

// ---------- Einstellung ----------

/** Bluetooth-Austausch ist standardmäßig aus und muss in den Einstellungen eingeschaltet werden */
export function bluetoothOn(settings: { bluetooth?: boolean } | null | undefined): boolean {
  return settings?.bluetooth === true;
}

/** Extra sicher: nur zusammen mit eingeschaltetem Bluetooth-Austausch wirksam */
export function bluetoothSecure(settings: { bluetooth?: boolean; btSecure?: boolean } | null | undefined): boolean {
  return bluetoothOn(settings) && settings?.btSecure === true;
}

// ---------- Base64 (Pakete gehen als Text über die Capacitor-Brücke) ----------

export function toB64(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

export function fromB64(s: string): Uint8Array {
  return Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
}
