import { describe, expect, it } from 'vitest';
import {
  advertName, Assembler, bluetoothOn, crc32, decodeText, encodeAdvert, encodeMessage, encodeText, Kind,
  keepsOutgoing, newBleSid, packetSize, parseAdvert, parseHello, encodeJson, ADV_NAME_BYTES, PACKET_HEAD,
} from './bleProtocol';
import { defaultSettings } from './game';
import { webBle, type BleExchangePlugin, type Role } from './bluetooth';
import { NearbySession } from './nearby';

const bytes = (n: number, seed = 1) => Uint8Array.from({ length: n }, (_, i) => (i * 31 + seed * 7) & 0xff);

describe('Bluetooth: Pakete', () => {
  it('CRC32 stimmt mit dem Standard überein', () => {
    expect(crc32(new TextEncoder().encode('123456789'))).toBe(0xcbf43926);
    expect(crc32(new Uint8Array())).toBe(0);
  });

  it('Paketgröße folgt der MTU, mit Unter- und Obergrenze', () => {
    expect(packetSize(23)).toBe(20);
    expect(packetSize(185)).toBe(182);
    expect(packetSize(517)).toBe(509);
    expect(packetSize(5)).toBe(20);
  });

  it('zerlegt und setzt wieder zusammen (verschiedene Größen)', () => {
    for (const [len, size] of [[0, 20], [1, 20], [11, 20], [12, 20], [5000, 182], [200_000, 509]] as const) {
      const data = bytes(len, len);
      const packets = encodeMessage(Kind.Data, data, size);
      expect(packets.every((p) => p.length <= size)).toBe(true);
      const a = new Assembler();
      let out = null;
      packets.forEach((p, i) => {
        const r = a.add(p);
        if (i < packets.length - 1) expect(r).toBeNull();
        else out = r;
      });
      expect(out).not.toBeNull();
      expect(out!.kind).toBe(Kind.Data);
      expect(out!.data).toEqual(data);
    }
  });

  it('Text mit Umlauten kommt unverändert an', () => {
    const t = 'Grüße an Jörg – 5,2 km, Ölberg ✓';
    const a = new Assembler();
    let m = null;
    for (const p of encodeText(Kind.Data, t, 20)) m = a.add(p) ?? m;
    expect(decodeText(m!)).toBe(t);
  });

  it('erkennt kaputte Daten über die Prüfsumme', () => {
    const packets = encodeMessage(Kind.Data, bytes(300), 100);
    packets[2] = packets[2].slice();
    packets[2][PACKET_HEAD + 3] ^= 0x55;
    const a = new Assembler();
    expect(() => packets.forEach((p) => a.add(p))).toThrow('Prüfsumme falsch');
  });

  it('erkennt fehlende oder vertauschte Pakete', () => {
    const packets = encodeMessage(Kind.Data, bytes(300), 100);
    const a = new Assembler();
    a.add(packets[0]);
    expect(() => a.add(packets[2])).toThrow('durcheinander');
    // danach geht eine neue Nachricht wieder
    let m = null;
    for (const p of packets) m = a.add(p) ?? m;
    expect(m!.data).toEqual(bytes(300));
  });

  it('eine neue Nachricht ersetzt eine halb angekommene', () => {
    const a = new Assembler();
    a.add(encodeMessage(Kind.Data, bytes(300), 100)[0]);
    const m = encodeText(Kind.Accept, '', 50).map((p) => a.add(p)).pop();
    expect(m!.kind).toBe(Kind.Accept);
  });

  it('lehnt fremde Pakete ab', () => {
    const a = new Assembler();
    expect(() => a.add(Uint8Array.from([9, 0, 0, 0, 1]))).toThrow();
    expect(() => a.add(Uint8Array.from([1, 0]))).toThrow();
    expect(() => a.add(Uint8Array.from([1, 0, 2, 0, 2]))).toThrow();
  });

  it('Hallo-Nachricht wird geprüft', () => {
    const ok = new Assembler();
    let m = null;
    for (const p of encodeJson(Kind.Hello, { sid: 'abc123', name: 'Lena\u0000' }, 40)) m = ok.add(p) ?? m;
    expect(parseHello(m!)).toEqual({ sid: 'abc123', name: 'Lena' });
    expect(parseHello({ kind: Kind.Hello, data: new TextEncoder().encode('{"sid":"A B"}') })).toBeNull();
    expect(parseHello({ kind: Kind.Hello, data: new TextEncoder().encode('kaputt') })).toBeNull();
  });
});

describe('Bluetooth: Funkwerbung', () => {
  it('Name wird auf 21 Byte gekürzt, ohne Zeichen zu zerschneiden', () => {
    expect(advertName('Alex')).toBe('Alex');
    const long = advertName('Maximilian Müller-Lüdenscheidt');
    expect(new TextEncoder().encode(long).length).toBeLessThanOrEqual(ADV_NAME_BYTES);
    expect('Maximilian Müller-Lüdenscheidt'.startsWith(long)).toBe(true);
    const um = advertName('ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄ'); // 2 Byte je Zeichen
    expect(um).toBe('Ä'.repeat(10));
    expect(advertName('   ')).toBe('Shadow Burn');
  });

  it('Sitzungs-ID + Name passen in die Scan-Antwort und kommen zurück', () => {
    const sid = newBleSid();
    expect(sid).toMatch(/^[a-z0-9]{6}$/);
    const adv = encodeAdvert(sid, 'Jörg der Große aus dem Norden');
    expect(adv.length).toBeLessThanOrEqual(27);
    const back = parseAdvert(adv)!;
    expect(back.sid).toBe(sid);
    expect('Jörg der Große aus dem Norden'.startsWith(back.name)).toBe(true);
    expect(parseAdvert(new TextEncoder().encode('AB'))).toBeNull();
    expect(parseAdvert(new TextEncoder().encode('AB CD!Name'))).toBeNull();
  });
});

describe('Bluetooth: wer verbindet sich', () => {
  it('genau eine Seite behält ihre Verbindung', () => {
    for (let i = 0; i < 200; i++) {
      const a = newBleSid(), b = newBleSid();
      if (a === b) continue;
      expect(keepsOutgoing(a, b)).toBe(!keepsOutgoing(b, a));
    }
    expect(keepsOutgoing('zzzzzz', 'aaaaaa')).toBe(true);
  });
});

describe('Bluetooth: Einstellung', () => {
  it('ist standardmäßig aus', () => {
    expect(defaultSettings().bluetooth).toBeUndefined();
    expect(bluetoothOn(defaultSettings())).toBe(false);
    expect(bluetoothOn(undefined)).toBe(false);
    expect(bluetoothOn({ bluetooth: true })).toBe(true);
  });

  it('im Browser gibt es nur die Attrappe', async () => {
    expect((await webBle.status()).supported).toBe(false);
    await expect(webBle.start({ advert: '' })).rejects.toThrow('Android-App');
  });
});

// ---------- zwei Handys in einem Test-Funkraum ----------

type Fn = (d: never) => void;
class FakePhone {
  listeners = new Map<string, Set<Fn>>();
  addr: string;
  advert = '';
  /** wohin meine Verbindung als Central zeigt */
  centralTo: FakePhone | null = null;
  /** wer als Central mit mir verbunden ist */
  peripheralFrom: FakePhone | null = null;
  constructor(public air: FakePhone[], addr: string, public mtu = 185) { this.addr = addr; }
  emit(e: string, d: unknown) { for (const f of this.listeners.get(e) ?? []) (f as (x: unknown) => void)(d); }

  plugin: BleExchangePlugin = {
    status: async () => ({ supported: true, granted: true, enabled: true, advertise: true }),
    askPermission: async () => ({ granted: true }),
    enable: async () => ({ enabled: true }),
    start: async ({ advert }) => {
      this.advert = advert;
      // die anderen sehen mich, ich sehe die anderen
      setTimeout(() => {
        for (const o of this.air) if (o !== this && o.advert) { o.emit('found', { id: this.addr, adv: advert, rssi: -50 }); this.emit('found', { id: o.addr, adv: o.advert, rssi: -60 }); }
      }, 1);
      return { server: true, advertise: true };
    },
    scan: async () => {},
    stop: async () => { this.advert = ''; },
    connect: async ({ id }) => {
      await new Promise((r) => setTimeout(r, 3));
      const o = this.air.find((x) => x.addr === id);
      if (!o) throw new Error('weg');
      this.centralTo = o;
      o.peripheralFrom = this;
      o.emit('link', { role: 'peripheral', state: 'connected', id: this.addr, mtu: this.mtu });
      return { mtu: this.mtu };
    },
    disconnect: async ({ role }) => {
      if ((role === 'central' || role === 'all') && this.centralTo) {
        const o = this.centralTo; this.centralTo = null;
        if (o.peripheralFrom === this) { o.peripheralFrom = null; o.emit('link', { role: 'peripheral', state: 'disconnected', id: this.addr, mtu: 0 }); }
      }
      if ((role === 'peripheral' || role === 'all') && this.peripheralFrom) {
        const o = this.peripheralFrom; this.peripheralFrom = null;
        if (o.centralTo === this) { o.centralTo = null; o.emit('link', { role: 'central', state: 'disconnected', id: this.addr, mtu: 0 }); }
      }
    },
    send: async ({ role, packets }) => {
      const to = role === 'central' ? this.centralTo : this.peripheralFrom;
      if (!to) throw new Error('Nicht verbunden');
      const theirRole: Role = role === 'central' ? 'peripheral' : 'central';
      for (const p of packets) {
        await new Promise((r) => setTimeout(r, 0));
        if ((role === 'central' ? this.centralTo : this.peripheralFrom) !== to) throw new Error('getrennt');
        to.emit('packet', { role: theirRole, data: p });
      }
      return { sent: packets.length };
    },
    addListener: (async (e: string, fn: Fn) => {
      if (!this.listeners.has(e)) this.listeners.set(e, new Set());
      this.listeners.get(e)!.add(fn);
      return { remove: async () => { this.listeners.get(e)!.delete(fn); } };
    }) as BleExchangePlugin['addListener'],
    removeAllListeners: async () => { this.listeners.clear(); },
  };
}

async function until(cond: () => boolean, ms = 3000) {
  const t0 = Date.now();
  while (!cond()) {
    if (Date.now() - t0 > ms) throw new Error('Zeit abgelaufen');
    await new Promise((r) => setTimeout(r, 2));
  }
}

function makePair(sidA: string, sidB: string, sizeA = 30_000, sizeB = 12_000, secure: [boolean, boolean] = [false, false]) {
  const air: FakePhone[] = [];
  const pa = new FakePhone(air, 'AA:AA:AA:AA:AA:AA', 185), pb = new FakePhone(air, 'BB:BB:BB:BB:BB:BB', 247);
  air.push(pa, pb);
  const dataA = 'A'.repeat(sizeA) + 'ä', dataB = 'B'.repeat(sizeB) + 'ö';
  const got = { a: [] as string[], b: [] as string[] };
  const res = { a: [] as unknown[], b: [] as unknown[] };
  const mk = (p: FakePhone, sid: string, name: string, data: string, into: string[], out: unknown[], sec: boolean) => new NearbySession<string>({
    ble: p.plugin, name, sid, payload: async () => data, secure: sec,
    receive: async (t) => { into.push(t); return t.slice(0, 1); },
    onChange: () => {}, onResult: (r) => out.push(r),
  });
  const a = mk(pa, sidA, 'Anna', dataA, got.a, res.a, secure[0]);
  const b = mk(pb, sidB, 'Ben', dataB, got.b, res.b, secure[1]);
  return { a, b, dataA, dataB, got, res, pa, pb };
}

describe('Bluetooth: kompletter Tausch zwischen zwei Handys', () => {
  it('Antippen → bestätigen → beide haben die Daten des anderen', async () => {
    const { a, b, dataA, dataB, got, res, pa, pb } = makePair('aaaaa1', 'bbbbb2');
    await a.start(); await b.start();
    await until(() => a.list.length === 1 && b.list.length === 1);
    expect(a.list[0].name).toBe('Ben');
    void a.invite(b.list[0] && a.list[0].sid);
    await until(() => b.phase.k === 'invited');
    expect(b.phase).toEqual({ k: 'invited', name: 'Anna' });
    expect(a.phase.k).toBe('waiting');
    b.accept();
    await until(() => a.phase.k === 'finished' && b.phase.k === 'finished');
    expect(got.b).toEqual([dataA]);
    expect(got.a).toEqual([dataB]);
    expect(res.a).toEqual(['B']);
    expect(res.b).toEqual(['A']);
    // Central hat aufgelegt
    await until(() => pa.centralTo === null && pb.peripheralFrom === null);
    await a.stop(); await b.stop();
  });

  it('Ablehnen: kein Datentausch', async () => {
    const { a, b, got } = makePair('aaaaa1', 'bbbbb2');
    await a.start(); await b.start();
    await until(() => a.list.length === 1);
    void a.invite(a.list[0].sid);
    await until(() => b.phase.k === 'invited');
    b.decline();
    await until(() => a.phase.k === 'notice');
    expect(a.phase).toEqual({ k: 'notice', msg: 'Ben möchte gerade nicht tauschen.' });
    expect(b.phase.k).toBe('search');
    expect(got.a.length + got.b.length).toBe(0);
    await a.stop(); await b.stop();
  });

  it('beide tippen gleichzeitig: nur eine Verbindung, Tausch klappt trotzdem', async () => {
    for (const [sa, sb] of [['aaaaa1', 'bbbbb2'], ['zzzzz9', 'bbbbb2']]) {
      const { a, b, dataA, dataB, got, pa, pb } = makePair(sa, sb, 5000, 7000);
      await a.start(); await b.start();
      await until(() => a.list.length === 1 && b.list.length === 1);
      void a.invite(a.list[0].sid);
      void b.invite(b.list[0].sid);
      await until(() => a.phase.k === 'finished' && b.phase.k === 'finished');
      expect(got.b).toEqual([dataA]);
      expect(got.a).toEqual([dataB]);
      // der mit der größeren ID war Central
      // am Ende ist keine Verbindung mehr offen (die doppelte wurde vorher aufgegeben)
      await until(() => !pa.centralTo && !pb.centralTo && !pa.peripheralFrom && !pb.peripheralFrom);
      await a.stop(); await b.stop();
    }
  });

  it('Abbrechen während des Wartens: das andere Handy erfährt es', async () => {
    const { a, b } = makePair('aaaaa1', 'bbbbb2');
    await a.start(); await b.start();
    await until(() => a.list.length === 1);
    void a.invite(a.list[0].sid);
    await until(() => b.phase.k === 'invited');
    a.cancel();
    await until(() => b.phase.k === 'notice');
    expect(b.phase).toEqual({ k: 'notice', msg: 'Anna hat abgebrochen.' });
    expect(a.phase.k).toBe('search');
    await a.stop(); await b.stop();
  });

  it('ohne Antwort wird nach der Wartezeit abgebrochen', async () => {
    const air: FakePhone[] = [];
    const pa = new FakePhone(air, 'AA:AA:AA:AA:AA:AA'), pb = new FakePhone(air, 'BB:BB:BB:BB:BB:BB');
    air.push(pa, pb);
    const a = new NearbySession<string>({ ble: pa.plugin, name: 'Anna', sid: 'aaaaa1', payload: async () => 'x', receive: async () => 'x', onChange: () => {}, onResult: () => {}, acceptMs: 30 });
    const b = new NearbySession<string>({ ble: pb.plugin, name: 'Ben', sid: 'bbbbb2', payload: async () => 'y', receive: async () => 'y', onChange: () => {}, onResult: () => {} });
    await a.start(); await b.start();
    await until(() => a.list.length === 1);
    void a.invite(a.list[0].sid);
    await until(() => a.phase.k === 'notice');
    expect(a.phase).toEqual({ k: 'notice', msg: 'Ben hat nicht geantwortet.' });
    await a.stop(); await b.stop();
  });
});

describe('Bluetooth: Kopplung per QR-Code', () => {
  it('Code-Text hin und zurück, Unsinn wird abgelehnt', async () => {
    const { encodePair, parsePair, newPairCode } = await import('./bleProtocol');
    const c = newPairCode();
    expect(c).toMatch(/^[a-z0-9]{10}$/);
    expect(parsePair(encodePair('aaaaa1', c))).toEqual({ sid: 'aaaaa1', code: c });
    expect(parsePair('PHB1|x|0|1|abc')).toBeNull();
    expect(parsePair('SBBT1|aaaaa1|')).toBeNull();
  });

  it('richtiger Code: Tausch startet ohne Rückfrage', async () => {
    const { a, b, dataA, dataB, got } = makePair('aaaaa1', 'bbbbb2', 30_000, 12_000, [true, true]);
    await a.start(); await b.start();
    const t = a.pairText()!;
    await until(() => b.list.length === 1);
    expect(b.pairWith(t)).toBeNull();
    await until(() => a.phase.k === 'finished' && b.phase.k === 'finished');
    expect(got.b).toEqual([dataA]);
    expect(got.a).toEqual([dataB]);
    await a.stop(); await b.stop();
  });

  it('falscher Code: Verbindung getrennt, Fehlermeldung, keine Daten', async () => {
    const { a, b, got } = makePair('aaaaa1', 'bbbbb2', 30_000, 12_000, [true, true]);
    await a.start(); await b.start();
    a.pairText();
    await until(() => b.list.length === 1);
    expect(b.pairWith('SBBT1|aaaaa1|falsch1234')).toBeNull();
    await until(() => b.phase.k === 'notice');
    expect((b.phase as { msg: string }).msg).toContain('Code stimmt nicht');
    expect(a.pairError).toContain('falschen');
    expect(a.phase.k).toBe('search');
    expect(got.a.length + got.b.length).toBe(0);
    await a.stop(); await b.stop();
  });

  it('abgelaufen (Bildschirm zu und wieder auf) und wiederverwendet: abgelehnt', async () => {
    const { a, b, got } = makePair('aaaaa1', 'bbbbb2', 30_000, 12_000, [true, true]);
    await a.start(); await b.start();
    const old = a.pairText()!;
    await a.stop(); await a.start();
    await until(() => b.list.length === 1);
    expect(b.pairWith(old)).toBeNull();
    await until(() => b.phase.k === 'notice');
    expect(got.a.length + got.b.length).toBe(0);
    b.back();
    // neuer Code klappt einmal ...
    const fresh = a.pairText()!;
    expect(b.pairWith(fresh)).toBeNull();
    await until(() => a.phase.k === 'finished' && b.phase.k === 'finished');
    a.back(); b.back();
    // ... aber kein zweites Mal
    expect(b.pairWith(fresh)).toBeNull();
    await until(() => b.phase.k === 'notice');
    expect((b.phase as { msg: string }).msg).toContain('Code stimmt nicht');
    expect(got.b.length).toBe(1);
    await a.stop(); await b.stop();
  });

  it('eigener Code und kein Code werden gleich abgelehnt', async () => {
    const { a } = makePair('aaaaa1', 'bbbbb2', 30_000, 12_000, [true, true]);
    await a.start();
    expect(a.pairWith(a.pairText()!)).toBe('Das ist dein eigener Code.');
    expect(a.pairWith('hallo')).toContain('kein Kopplungscode');
    await a.stop();
  });

  it('extra sicher: Anfrage über die Liste ohne Code wird abgelehnt, keine Daten', async () => {
    // Anna extra sicher, Ben normal: Ben tippt Anna in der Liste an
    const { a, b, got } = makePair('aaaaa1', 'bbbbb2', 30_000, 12_000, [true, false]);
    await a.start(); await b.start();
    await until(() => b.list.length === 1);
    void b.invite(b.list[0].sid);
    await until(() => b.phase.k === 'notice');
    expect((b.phase as { msg: string }).msg).toContain('extra sichere');
    expect(a.phase.k).toBe('search');
    expect(a.pairError).toContain('ohne Code');
    expect(got.a.length + got.b.length).toBe(0);
    await a.stop(); await b.stop();
  });

  it('extra sicher: selbst über die Liste anfragen geht nicht', async () => {
    const { a, b } = makePair('aaaaa1', 'bbbbb2', 30_000, 12_000, [true, true]);
    await a.start(); await b.start();
    await until(() => a.list.length === 1);
    await a.invite(a.list[0].sid);
    expect(a.phase.k).toBe('search');
    expect(b.phase.k).toBe('search');
    await a.stop(); await b.stop();
  });

  it('normaler Modus: kein Kopplungscode, Scannen wird abgelehnt', async () => {
    const { a, b } = makePair('aaaaa1', 'bbbbb2');
    await a.start(); await b.start();
    expect(a.pairText()).toBeNull();
    expect(b.pairWith('SBBT1|aaaaa1|abcdefghij')).toContain('Extra sichere');
    expect(b.phase.k).toBe('search');
    await a.stop(); await b.stop();
  });

  it('Einstellung: extra sicher nur zusammen mit Bluetooth-Austausch', async () => {
    const { bluetoothSecure } = await import('./bleProtocol');
    expect(bluetoothSecure(defaultSettings())).toBe(false);
    expect(bluetoothSecure({ btSecure: true })).toBe(false);
    expect(bluetoothSecure({ bluetooth: true })).toBe(false);
    expect(bluetoothSecure({ bluetooth: true, btSecure: true })).toBe(true);
  });
});
