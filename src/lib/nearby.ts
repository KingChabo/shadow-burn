import type { PluginListenerHandle } from '@capacitor/core';
import type { BleExchangePlugin, Role } from './bluetooth';
import {
  Assembler, BAD_CODE, NEED_CODE, encodeAdvert, encodeJson, encodePair, encodeText, fromB64, Kind, keepsOutgoing, newBleSid, newPairCode,
  packetSize, parseAdvert, parseHello, parsePair, toB64, decodeText, type Hello, type Message,
} from './bleProtocol';

/**
 * Ablauf "In der Nähe tauschen" (ohne Oberfläche, mit jedem Plugin testbar):
 * Suchen → Gerät antippen → Hallo senden → anderes Handy bestätigt → beide senden ihre Daten
 * gleichzeitig → beide melden "fertig" → Ergebnis.
 *
 * Zweiter Weg, Kopplung per QR-Code: Handy A zeigt "SBBT1|Sitzungs-ID|Einmal-Code", Handy B scannt,
 * sucht gezielt A und schickt den Code im Hallo mit. Stimmt er, startet der Tausch ohne Rückfrage
 * (wer den Code zeigt bzw. scannt, hat schon zugestimmt). Der Code gilt für genau einen Tausch und
 * verfällt, wenn der Bildschirm geschlossen wird.
 */

export interface NearPeer { id: string; sid: string; name: string; rssi: number; seen: number }

export type NearPhase =
  | { k: 'starting' }
  | { k: 'search' }
  | { k: 'seeking' }
  | { k: 'connecting'; name: string; qr?: boolean }
  | { k: 'waiting'; name: string; qr?: boolean }
  | { k: 'invited'; name: string }
  | { k: 'transfer'; name: string; sent: number; sentTotal: number; got: number; gotTotal: number }
  | { k: 'finished'; name: string }
  | { k: 'notice'; msg: string }
  | { k: 'paused' }
  | { k: 'off'; msg: string };

export interface NearOptions<R> {
  ble: BleExchangePlugin;
  name: string;
  /** dieselben Daten wie beim QR-Tausch (Spielerkarte + ggf. Blog) */
  payload: () => Promise<string>;
  /** empfangene Daten speichern (wie nach dem QR-Scan) */
  receive: (payload: string) => Promise<R>;
  onChange: () => void;
  onResult: (r: R | { error: string }) => void;
  sid?: string;
  /** Wartezeit auf die Bestätigung des anderen (ms) */
  acceptMs?: number;
  /** Geräte, die so lange nicht mehr gesehen wurden, verschwinden aus der Liste (ms) */
  staleMs?: number;
  /** so lange wird nach dem Handy aus dem gescannten QR-Code gesucht (ms) */
  seekMs?: number;
  /**
   * Extra sichere Übertragung: nur Kopplung per QR-Code. Keine Anfragen über die Liste,
   * eingehende Anfragen ohne gültigen Code werden abgelehnt.
   */
  secure?: boolean;
}

const ROLES: Role[] = ['central', 'peripheral'];

export class NearbySession<R> {
  readonly sid: string;
  phase: NearPhase = { k: 'starting' };
  peers = new Map<string, NearPeer>();
  /** false, wenn das eigene Handy nicht sichtbar sein kann (andere antippen geht trotzdem) */
  visible = true;

  private o: NearOptions<R>;
  private subs: PluginListenerHandle[] = [];
  private asm: Record<Role, Assembler> = { central: new Assembler(), peripheral: new Assembler() };
  private mtu: Record<Role, number> = { central: 23, peripheral: 23 };
  private linked: Record<Role, boolean> = { central: false, peripheral: false };
  /** über welche Verbindung gerade getauscht wird */
  private active: Role | null = null;
  private partner: Hello | null = null;
  /** an wen ich gerade eine Anfrage schicke */
  private target: string | null = null;
  private payload: Promise<string> | null = null;
  private tx: Promise<unknown> = Promise.resolve();
  private sentMine = false;
  private result: R | null = null;
  private theirDone = false;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private pruneTimer: ReturnType<typeof setInterval> | null = null;
  private alive = false;
  /** mein Einmal-Code, solange ich den Kopplungs-QR-Code zeige */
  private pairCode: string | null = null;
  /** gescannter Code des anderen Handys, nach dem ich gerade suche */
  private seek: { sid: string; code: string } | null = null;
  /** Code, den ich beim Verbinden mitschicke */
  private sendCode: string | null = null;
  /** Hinweis beim gezeigten Code (z. B. jemand kam mit falschem Code) */
  pairError = '';

  constructor(o: NearOptions<R>) {
    this.o = o;
    this.sid = o.sid ?? newBleSid();
  }

  private set(p: NearPhase) { this.phase = p; this.o.onChange(); }

  get list(): NearPeer[] {
    return [...this.peers.values()].sort((a, b) => b.rssi - a.rssi);
  }

  // ---------- Start / Stopp ----------

  async start(): Promise<void> {
    await this.stop();
    this.alive = true;
    this.set({ k: 'starting' });
    const ble = this.o.ble;
    let st;
    try { st = await ble.status(); } catch { st = { supported: false, granted: false, enabled: false, advertise: false }; }
    if (!st.supported) return this.set({ k: 'off', msg: 'Dieses Handy hat kein Bluetooth Low Energy.' });
    if (!st.granted) {
      const r = await ble.askPermission().catch(() => ({ granted: false }));
      if (!r.granted) return this.set({ k: 'off', msg: 'Ohne die Berechtigung „Geräte in der Nähe“ geht es nicht. Erlaube sie in den Android-Einstellungen der App.' });
    }
    if (!(await ble.status().catch(() => st)).enabled) return this.set({ k: 'off', msg: 'Bluetooth ist aus.' });
    if (!this.alive) return;
    this.payload ??= this.o.payload();
    this.payload.catch(() => {});
    this.subs = await Promise.all([
      ble.addListener('found', (d) => this.onFound(d)),
      ble.addListener('packet', (d) => this.onPacket(d.role, d.data)),
      ble.addListener('link', (d) => this.onLink(d.role, d.state, d.mtu)),
      ble.addListener('sent', (d) => {
        if (this.phase.k === 'transfer' && d.role === this.active && d.total > 2) this.set({ ...this.phase, sent: d.done, sentTotal: d.total });
      }),
      ble.addListener('state', (d) => {
        if (d.what === 'advertise' || d.what === 'server') { this.visible = false; this.o.onChange(); }
        if (d.what === 'stopped') { this.reset(); this.set({ k: 'paused' }); }
      }),
    ]);
    try {
      const r = await ble.start({ advert: toB64(encodeAdvert(this.sid, this.o.name)) });
      this.visible = r.server && r.advertise;
    } catch (e) {
      return this.set({ k: 'off', msg: e instanceof Error ? e.message : 'Bluetooth ist nicht bereit.' });
    }
    if (!this.alive) { await ble.stop().catch(() => {}); return; }
    this.pruneTimer = setInterval(() => this.prune(), 2000);
    this.set({ k: 'search' });
  }

  async stop(): Promise<void> {
    this.alive = false;
    // Kopplungscode verfällt, sobald der Bildschirm zu ist (oder Bluetooth neu startet)
    this.pairCode = null;
    this.pairError = '';
    this.reset();
    if (this.pruneTimer) clearInterval(this.pruneTimer);
    this.pruneTimer = null;
    const subs = this.subs;
    this.subs = [];
    await Promise.all(subs.map((s) => s.remove().catch(() => {})));
    await this.o.ble.stop().catch(() => {});
  }

  /** Bluetooth einschalten lassen (Android-Dialog) */
  async enable(): Promise<void> {
    const r = await this.o.ble.enable().catch(() => ({ enabled: false }));
    if (r.enabled) await this.start();
  }

  private reset() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.active = null;
    this.partner = null;
    this.target = null;
    this.sentMine = false;
    this.result = null;
    this.theirDone = false;
    this.tx = Promise.resolve();
    this.seek = null;
    this.sendCode = null;
    for (const r of ROLES) this.asm[r].reset();
    this.peers.clear();
  }

  private prune() {
    const old = Date.now() - (this.o.staleMs ?? 12_000);
    let changed = false;
    for (const [k, p] of this.peers) if (p.seen < old) { this.peers.delete(k); changed = true; }
    if (changed) this.o.onChange();
  }

  private onFound(d: { id: string; adv: string; rssi: number }) {
    let h: Hello | null = null;
    try { h = parseAdvert(fromB64(d.adv)); } catch { h = null; }
    if (!h || h.sid === this.sid) return;
    const p = { id: d.id, sid: h.sid, name: h.name, rssi: d.rssi, seen: Date.now() };
    this.peers.set(h.sid, p);
    if (this.phase.k === 'search') this.o.onChange();
    if (this.phase.k === 'seeking' && this.seek?.sid === h.sid) void this.dial(p, this.seek.code);
  }

  // ---------- Kopplung per QR-Code ----------

  /** Text für meinen Kopplungs-QR-Code (Code bleibt gleich, bis er benutzt wurde oder der Bildschirm zugeht) */
  pairText(): string | null {
    if (!this.alive || !this.o.secure) return null;
    this.pairCode ??= newPairCode();
    return encodePair(this.sid, this.pairCode);
  }

  /** Code nicht mehr zeigen: er gilt dann auch nicht mehr */
  dropPair() {
    this.pairCode = null;
    this.pairError = '';
  }

  /** Gescannten Kopplungscode benutzen. Gibt eine Fehlermeldung zurück, wenn der Code nicht passt. */
  pairWith(text: string): string | null {
    const c = parsePair(text);
    if (!c) return 'Das ist kein Kopplungscode für Bluetooth. Dein Freund findet ihn unter „In der Nähe tauschen“ → „Per QR-Code koppeln“.';
    if (!this.o.secure) return 'Kopplung per QR-Code gibt es nur mit „Extra sichere Bluetooth-Übertragung“ (Ich → Account → Bluetooth).';
    if (c.sid === this.sid) return 'Das ist dein eigener Code.';
    if (this.phase.k !== 'search' && this.phase.k !== 'notice') return 'Gerade läuft schon ein Tausch.';
    this.dropPair();
    const keep = new Map(this.peers);
    this.reset();
    this.peers = keep;
    this.seek = c;
    this.set({ k: 'seeking' });
    void this.o.ble.scan({ on: true }).catch(() => {});
    this.timer = setTimeout(() => {
      if (this.phase.k === 'seeking') this.notice('Das Handy mit dem Code wurde nicht gefunden. Ist bei deinem Freund „In der Nähe tauschen“ noch offen?');
    }, this.o.seekMs ?? 25_000);
    const p = this.peers.get(c.sid);
    if (p) void this.dial(p, c.code);
    return null;
  }

  // ---------- Anfragen ----------

  /** Gerät angetippt (und "Mit X tauschen?" bestätigt) */
  async invite(sid: string): Promise<void> {
    const p = this.peers.get(sid);
    if (!p || this.phase.k !== 'search' || this.o.secure) return;
    return this.dial(p, null);
  }

  /** Verbinden und Hallo senden (mit Code bei der QR-Kopplung) */
  private async dial(p: NearPeer, code: string | null): Promise<void> {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.seek = null;
    this.sendCode = code;
    this.target = p.sid;
    this.set({ k: 'connecting', name: p.name, ...(code ? { qr: true } : {}) });
    try {
      const r = await this.o.ble.connect({ id: p.id });
      this.mtu.central = r.mtu;
      this.linked.central = true;
    } catch (e) {
      if (this.target !== p.sid) return; // inzwischen anders entschieden (gleichzeitiges Antippen)
      this.target = null;
      return this.notice(e instanceof Error ? e.message : 'Keine Verbindung zum anderen Handy');
    }
    if (this.target !== p.sid || this.active === 'peripheral') {
      // das andere Handy hat gewonnen (gleichzeitig angetippt): eigene Verbindung wieder aufgeben
      void this.o.ble.disconnect({ role: 'central' }).catch(() => {});
      return;
    }
    this.active = 'central';
    this.partner = { sid: p.sid, name: p.name };
    this.set({ k: 'waiting', name: p.name, ...(code ? { qr: true } : {}) });
    this.push('central', encodeJson(Kind.Hello, code ? { sid: this.sid, name: this.o.name, code } : { sid: this.sid, name: this.o.name }, packetSize(this.mtu.central)));
    this.timer = setTimeout(() => {
      if (this.phase.k === 'waiting') { this.abort('central'); this.notice(`${p.name} hat nicht geantwortet.`); }
    }, this.o.acceptMs ?? 60_000);
  }

  /** Anfrage angenommen */
  accept() {
    if (this.phase.k !== 'invited' || !this.active) return;
    this.push(this.active, encodeText(Kind.Accept, '', packetSize(this.mtu[this.active])));
    this.begin();
  }

  /** Anfrage abgelehnt */
  decline() {
    if (this.phase.k !== 'invited' || !this.active) return;
    const role = this.active;
    this.push(role, encodeText(Kind.Decline, '', packetSize(this.mtu[role])));
    void this.tx.then(() => this.o.ble.disconnect({ role }).catch(() => {}));
    this.back();
  }

  /** Abbrechen (Anfrage oder laufende Übertragung) */
  cancel() {
    if (this.active) this.abort(this.active);
    else if (this.target) void this.o.ble.disconnect({ role: 'central' }).catch(() => {});
    this.back();
  }

  /** Nach einer Meldung wieder suchen */
  back() {
    const keep = new Map(this.peers);
    this.reset();
    this.peers = keep;
    void this.o.ble.scan({ on: true }).catch(() => {});
    this.set(this.alive ? { k: 'search' } : { k: 'paused' });
  }

  private notice(msg: string) {
    const keep = new Map(this.peers);
    this.reset();
    this.peers = keep;
    void this.o.ble.scan({ on: true }).catch(() => {});
    this.set({ k: 'notice', msg });
  }

  private abort(role: Role) {
    if (this.linked[role]) this.push(role, encodeText(Kind.Cancel, '', packetSize(this.mtu[role])));
    void this.tx.then(() => this.o.ble.disconnect({ role }).catch(() => {}));
  }

  /** Pakete der Reihe nach senden (Steuernachrichten warten, bis die Daten durch sind) */
  private push(role: Role, packets: Uint8Array[]) {
    const b = packets.map(toB64);
    const job = this.tx.then(() => this.o.ble.send({ role, packets: b }));
    this.tx = job.catch(() => {});
    return job;
  }

  // ---------- Verbindungen und Pakete ----------

  private onLink(role: Role, state: 'connected' | 'disconnected', mtu: number) {
    if (state === 'connected') { this.linked[role] = true; this.mtu[role] = mtu || 23; this.asm[role].reset(); return; }
    this.linked[role] = false;
    this.asm[role].reset();
    if (role !== this.active) return;
    const k = this.phase.k;
    if (k === 'finished' || k === 'notice' || k === 'search') return;
    const name = this.partner?.name ?? 'Das andere Handy';
    if (k === 'transfer' && this.result !== null && this.sentMine) return this.finish();
    this.notice(k === 'invited' ? `${name} hat abgebrochen.` : `Verbindung zu ${name} getrennt. Geht näher zusammen und versucht es nochmal.`);
  }

  private onPacket(role: Role, data: string) {
    let m: Message | null;
    try {
      m = this.asm[role].add(fromB64(data));
    } catch {
      if (role === this.active && this.phase.k === 'transfer') { this.abort(role); this.notice('Daten kaputt angekommen. Bitte nochmal versuchen.'); }
      return;
    }
    if (!m) {
      const pr = this.asm[role].progress;
      if (role === this.active && this.phase.k === 'transfer' && pr.kind === Kind.Data) this.set({ ...this.phase, got: pr.got, gotTotal: pr.n });
      return;
    }
    void this.onMessage(role, m);
  }

  private async onMessage(role: Role, m: Message) {
    if (m.kind === Kind.Hello) return this.onHello(role, m);
    if (role !== this.active) return;
    const name = this.partner?.name ?? 'Das andere Handy';
    switch (m.kind) {
      case Kind.Accept:
        if (this.phase.k === 'waiting') this.begin();
        return;
      case Kind.Decline:
        if (this.phase.k === 'waiting') {
          void this.o.ble.disconnect({ role }).catch(() => {});
          const why = decodeText(m);
          this.notice(this.sendCode !== null && why === BAD_CODE ? 'Der Code stimmt nicht oder ist abgelaufen. Lass dir von deinem Freund den Code nochmal zeigen und scanne neu.'
            : why === NEED_CODE ? `${name} nutzt die extra sichere Bluetooth-Übertragung und tauscht nur per QR-Code. Schalte sie unter Ich → Account → Bluetooth auch ein und scanne den Code von ${name}.`
            : `${name} möchte gerade nicht tauschen.`);
        }
        return;
      case Kind.Cancel:
        void this.o.ble.disconnect({ role }).catch(() => {});
        this.notice(`${name} hat abgebrochen.`);
        return;
      case Kind.Data: {
        if (this.phase.k !== 'transfer' || this.result !== null) return;
        let r: R;
        try { r = await this.o.receive(decodeText(m)); } catch (e) {
          this.abort(role);
          this.notice(e instanceof Error ? e.message : 'Fehler beim Lesen');
          return;
        }
        this.result = r;
        this.set({ ...this.phase, got: this.phase.gotTotal || 1, gotTotal: this.phase.gotTotal || 1 });
        this.push(role, encodeText(Kind.Done, '', packetSize(this.mtu[role])));
        return this.check();
      }
      case Kind.Done:
        this.theirDone = true;
        return this.check();
    }
  }

  private onHello(role: Role, m: Message) {
    const h = parseHello(m);
    if (role !== 'peripheral' || !h || h.sid === this.sid) return;
    const busyNo = () => {
      this.push('peripheral', encodeText(Kind.Decline, '', packetSize(this.mtu.peripheral)));
      void this.tx.then(() => this.o.ble.disconnect({ role: 'peripheral' }).catch(() => {}));
    };
    // gleichzeitig angetippt: nur eine Verbindung bleibt
    if ((this.phase.k === 'connecting' || this.phase.k === 'waiting') && this.target === h.sid) {
      if (keepsOutgoing(this.sid, h.sid)) return; // ich bleibe Central, das andere Handy gibt nach
      if (this.timer) clearTimeout(this.timer);
      this.timer = null;
      this.target = null;
      void this.o.ble.disconnect({ role: 'central' }).catch(() => {});
      this.active = 'peripheral';
      this.partner = h;
      // ich hatte selbst schon "Mit X tauschen?" bestätigt → gleich annehmen
      this.push('peripheral', encodeText(Kind.Accept, '', packetSize(this.mtu.peripheral)));
      this.begin();
      return;
    }
    if (this.phase.k !== 'search' && this.phase.k !== 'notice') return busyNo();
    if (h.code === undefined && this.o.secure) {
      // extra sicher: ohne Code keine Anfrage, auch nicht über die Liste
      this.push('peripheral', encodeText(Kind.Decline, NEED_CODE, packetSize(this.mtu.peripheral)));
      void this.tx.then(() => this.o.ble.disconnect({ role: 'peripheral' }).catch(() => {}));
      this.pairError = `${h.name} wollte ohne Code tauschen. Abgelehnt, weil die extra sichere Übertragung an ist.`;
      this.o.onChange();
      return;
    }
    if (h.code !== undefined) {
      // Kopplung per QR-Code: nur mit meinem gerade gezeigten Code, und nur einmal
      if (!this.pairCode || h.code !== this.pairCode) {
        this.push('peripheral', encodeText(Kind.Decline, BAD_CODE, packetSize(this.mtu.peripheral)));
        void this.tx.then(() => this.o.ble.disconnect({ role: 'peripheral' }).catch(() => {}));
        this.pairError = `${h.name} hat einen falschen oder abgelaufenen Code geschickt. Die Verbindung wurde getrennt.`;
        this.o.onChange();
        return;
      }
      this.pairCode = null;
      this.pairError = '';
      this.active = 'peripheral';
      this.partner = { sid: h.sid, name: h.name };
      void this.o.ble.scan({ on: false }).catch(() => {});
      this.push('peripheral', encodeText(Kind.Accept, '', packetSize(this.mtu.peripheral)));
      this.begin();
      return;
    }
    this.active = 'peripheral';
    this.partner = { sid: h.sid, name: h.name };
    void this.o.ble.scan({ on: false }).catch(() => {});
    this.set({ k: 'invited', name: h.name });
  }

  /** Beide haben bestätigt: Daten gleichzeitig hin und her */
  private begin() {
    if (!this.active || !this.payload) return;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    const role = this.active;
    const name = this.partner?.name ?? 'Freund';
    this.set({ k: 'transfer', name, sent: 0, sentTotal: 0, got: 0, gotTotal: 0 });
    void (async () => {
      let text: string;
      try { text = await this.payload!; } catch { this.abort(role); return this.notice('Deine Daten konnten nicht gepackt werden.'); }
      if (this.active !== role) return;
      const packets = encodeText(Kind.Data, text, packetSize(this.mtu[role]));
      if (this.phase.k === 'transfer') this.set({ ...this.phase, sentTotal: packets.length });
      try { await this.push(role, packets); } catch {
        if (this.active === role && this.phase.k === 'transfer') this.notice(`Senden an ${name} hat nicht geklappt. Geht näher zusammen und versucht es nochmal.`);
        return;
      }
      if (this.active !== role) return;
      this.sentMine = true;
      if (this.phase.k === 'transfer') this.set({ ...this.phase, sent: packets.length, sentTotal: packets.length });
      this.check();
    })();
  }

  private check() {
    if (this.sentMine && this.result !== null && this.theirDone) this.finish();
  }

  private finish() {
    if (this.phase.k === 'finished') return;
    const r = this.result!;
    const role = this.active;
    const name = this.partner?.name ?? 'Freund';
    this.active = null;
    this.set({ k: 'finished', name });
    // Central legt auf, sobald alles bestätigt ist
    if (role === 'central') void this.tx.then(() => this.o.ble.disconnect({ role }).catch(() => {}));
    this.o.onResult(r);
  }
}
