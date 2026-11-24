/**
 * Pausenspiele für die Satzpause: Läufer (Jump & Run), Glutröhre (3D-Tunnel), Papierflieger.
 * Reines Canvas, keine Bilder, komplett offline. Jedes Spiel endet genau mit der Pause:
 * in den letzten Sekunden läuft der Schluss (Tor, Ausgang, Landung), bei 0:00 ist es vorbei.
 * Der Spielstand (Level) wird in localStorage gespeichert. Keine Belohnung, keine Punkte in der App.
 */

/** Sekunden vor Pausenende, in denen der Schluss läuft */
export const FINALE_SEC = 2.5;

export const REST_GAMES = [
  { id: 'laeufer', name: 'Läufer', hint: 'Links: laufen · rechts: springen' },
  { id: 'roehre', name: 'Glutröhre', hint: 'Links / rechts halten: steuern' },
  { id: 'flieger', name: 'Papierflieger', hint: 'Halten: steigen · loslassen: sinken' },
  { id: 'entspannen', name: 'Entspannen', hint: 'Nur zuschauen und mitatmen' },
];

const rnd = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const TAU = Math.PI * 2;
const norm = (a) => ((a % TAU) + TAU) % TAU;
const INK = '#f6f3ee', MUTE = '#8f8a83', ACCENT = '#ff6b35', RED = '#e5484d';

function mulberry(a) {
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
function load(key, def) { try { const j = JSON.parse(localStorage.getItem(key) || 'null'); return j && typeof j === 'object' ? { ...def, ...j } : def; } catch { return def; } }
function store(key, v) { try { localStorage.setItem(key, JSON.stringify(v)); } catch { /* egal */ } }

/**
 * Startet ein Spiel auf dem Canvas.
 * @param {HTMLCanvasElement} canvas
 * @param {string} id  'laeufer' | 'roehre' | 'flieger'
 * @param {{ getLeft: () => number, total: number, sound?: boolean, vibrate?: (p: number | number[]) => void }} opts
 */
export function createRestGame(canvas, id, opts) {
  const ctx = canvas.getContext('2d');
  let W = 0, H = 0, raf = 0, last = 0, dead = false, finale = false, finT = 0;
  let ac = null;
  const tone = (f, d = 0.12, type = 'triangle', g = 0.1, delay = 0) => {
    if (!opts.sound) return;
    try {
      ac = ac || new (window.AudioContext || window.webkitAudioContext)();
      if (ac.state === 'suspended') ac.resume();
      const t = ac.currentTime + delay, o = ac.createOscillator(), gn = ac.createGain();
      o.type = type; o.frequency.setValueAtTime(f, t);
      gn.gain.setValueAtTime(0.0001, t); gn.gain.exponentialRampToValueAtTime(g, t + 0.01); gn.gain.exponentialRampToValueAtTime(0.0001, t + d);
      o.connect(gn).connect(ac.destination); o.start(t); o.stop(t + d + 0.02);
    } catch { /* kein Ton */ }
  };
  const buzz = (p) => { try { opts.vibrate && opts.vibrate(p); } catch { /* egal */ } };
  const env = { ctx, tone, buzz, get W() { return W; }, get H() { return H; }, get total() { return opts.total; } };
  const make = id === 'roehre' ? roehre : id === 'flieger' ? flieger : id === 'entspannen' ? entspannen : laeufer;
  const game = make(env);

  function resize() {
    const r = canvas.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const nw = Math.max(1, Math.round(r.width)), nh = Math.max(1, Math.round(r.height));
    if (nw === W && nh === H) return;
    W = nw; H = nh; canvas.width = W * dpr; canvas.height = H * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    game.resize && game.resize();
  }
  resize();
  game.init();
  const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(resize) : null;
  ro && ro.observe(canvas);

  // Eingabe: mehrere Finger (Läufer: laufen + springen gleichzeitig)
  const pos = (e) => { const r = canvas.getBoundingClientRect(); return [(e.clientX - r.left) * (W / r.width), (e.clientY - r.top) * (H / r.height)]; };
  const onDown = (e) => { if (finale) return; try { canvas.setPointerCapture(e.pointerId); } catch { /* egal */ } const [x, y] = pos(e); game.down && game.down(x, y, e.pointerId); e.preventDefault(); };
  const onMove = (e) => { if (finale) return; const [x, y] = pos(e); game.move && game.move(x, y, e.pointerId); };
  const onUp = (e) => { const [x, y] = pos(e); game.up && game.up(x, y, e.pointerId); };
  const KEYS = { ArrowLeft: 'L', ArrowRight: 'R', ArrowUp: 'J', ' ': 'J', a: 'L', d: 'R', w: 'J' };
  const onKey = (d) => (e) => { const k = KEYS[e.key]; if (!k || finale) return; e.preventDefault(); if (!(d && e.repeat)) game.key && game.key(k, d); };
  const kd = onKey(true), ku = onKey(false);
  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerup', onUp);
  canvas.addEventListener('pointercancel', onUp);
  canvas.addEventListener('lostpointercapture', onUp);
  window.addEventListener('keydown', kd);
  window.addEventListener('keyup', ku);

  function frame(t) {
    if (dead) return;
    const dt = Math.min(0.05, (t - (last || t)) / 1000); last = t;
    const left = Math.max(0, opts.getLeft());
    if (!finale && left <= FINALE_SEC) { finale = true; game.finale(); }
    if (finale) finT += dt;
    game.update(dt, left, finale ? finT : 0);
    game.draw(left, finale ? finT : 0);
    raf = requestAnimationFrame(frame);
  }
  raf = requestAnimationFrame(frame);

  return {
    /** nur für Tests */
    _game: game,
    /** Pause vorzeitig beendet („Weiter“) oder Bildschirm weg: Spielstand sichern, aufräumen */
    destroy() {
      if (dead) return; dead = true; cancelAnimationFrame(raf);
      try { game.save && game.save(true); } catch { /* egal */ }
      ro && ro.disconnect();
      canvas.removeEventListener('pointerdown', onDown); canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerup', onUp); canvas.removeEventListener('pointercancel', onUp); canvas.removeEventListener('lostpointercapture', onUp);
      window.removeEventListener('keydown', kd); window.removeEventListener('keyup', ku);
      try { ac && ac.close(); } catch { /* egal */ }
    },
  };
}

function rr(ctx, x, y, w, h, r) { ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(x, y, w, h, r); else ctx.rect(x, y, w, h); }
function banner(ctx, W, text, y, a, size = 26, color = INK) {
  if (a <= 0) return; ctx.globalAlpha = clamp(a, 0, 1); ctx.fillStyle = color; ctx.font = `600 ${size}px Oswald, "Arial Narrow", sans-serif`; ctx.textAlign = 'center';
  ctx.shadowColor = 'rgba(0,0,0,.6)'; ctx.shadowBlur = 8; ctx.fillText(text.toUpperCase(), W / 2, y); ctx.shadowBlur = 0; ctx.globalAlpha = 1;
}
function hudText(ctx, text, x, y, align = 'left', color = MUTE) { ctx.fillStyle = color; ctx.font = '600 12px Inter, system-ui, sans-serif'; ctx.textAlign = align; ctx.fillText(text, x, y); }
function roundBtn(ctx, x, y, r, on, draw) {
  ctx.fillStyle = on ? 'rgba(255,107,53,.85)' : 'rgba(255,255,255,.1)'; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,.22)'; ctx.lineWidth = 1.5; ctx.stroke(); ctx.fillStyle = INK; draw();
}
function arrow(ctx, x, y, dir) { ctx.beginPath(); ctx.moveTo(x - 9 * dir, y); ctx.lineTo(x + 7 * dir, y - 10); ctx.lineTo(x + 7 * dir, y + 10); ctx.closePath(); ctx.fill(); }

// =====================================================================
// LÄUFER
// =====================================================================
const RUN_THEMES = [
  { name: 'Morgenwiese', sky: ['#7fb6dd', '#f1dcb8'], sun: [0.78, 0.22, '255,244,200'], far: '#9db2c2', mid: '#6d8c5a', soil: ['#6b4a2e', '#24180f'], grass: '#5fa83a', tree: '#3d6532', clouds: 'rgba(255,255,255,.75)' },
  { name: 'Herbstwald', sky: ['#e39a62', '#f5d9b0'], sun: [0.25, 0.3, '255,220,160'], far: '#b78a6c', mid: '#87573a', soil: ['#5a3a22', '#21150c'], grass: '#b8862f', tree: '#7a3a1c', clouds: 'rgba(255,240,225,.6)' },
  { name: 'Wüste', sky: ['#efc48a', '#fbe8c4'], sun: [0.7, 0.18, '255,250,220'], far: '#d6a66a', mid: '#c48a50', soil: ['#d2a062', '#7f552a'], grass: '#e8c07f', tree: null, clouds: 'rgba(255,255,255,.4)' },
  { name: 'Bergnacht', sky: ['#0b1530', '#2a3c5e'], sun: [0.2, 0.2, '230,236,255'], far: '#2a3652', mid: '#1c2840', soil: ['#3b404b', '#14171c'], grass: '#dfe6ee', tree: '#142034', clouds: null, stars: true },
  { name: 'Vulkan', sky: ['#1e0a07', '#6a2412'], sun: null, far: '#3a1a12', mid: '#28110b', soil: ['#3a2a24', '#100807'], grass: '#ff6b35', tree: null, clouds: 'rgba(60,40,35,.7)', lava: true },
];
function laeufer(E) {
  const { ctx, tone, buzz } = E;
  const R = 14;
  const g = {
    lv: 1, deaths: 0, T: 28, yOff: 0, L: false, Rt: false, ptr: {}, msg: '', msgT: 0, portal: null, parts: [], t: 0,
    init() {
      const sv = load('sb.laeufer', { lv: 1, c: 0, deaths: 0 });
      this.lv = Math.max(1, sv.lv | 0); this.resize(); this.gen(); this.deaths = sv.deaths || 0;
      if (sv.c > 2 && sv.c < this.flagC && this.g[sv.c] > 0 && !this.spikes.has(sv.c)) {
        const p = this.p; p.x = sv.c * this.T + this.T / 2 - p.w / 2; p.y = this.groundY(sv.c) - p.h - 1; this.safe = { x: p.x, y: p.y };
        this.cam = Math.max(0, p.x - E.W * 0.35); this.say('Weiter wo du warst', 1.4);
      } else this.say(`Level ${this.lv} · ${this.theme.name}`, 1.4);
    },
    resize() { this.T = Math.max(18, Math.floor((E.H - 120) / R)); this.yOff = E.H - 112 - R * this.T; },
    say(m, t) { this.msg = m; this.msgT = t; },
    save(mid) { store('sb.laeufer', { lv: this.lv, c: mid && this.safe ? Math.floor((this.safe.x + 8) / this.T) : 0, deaths: this.deaths }); },
    gen() {
      const rng = mulberry(this.lv * 7919 + 13), lv = this.lv; this.theme = RUN_THEMES[(lv - 1) % RUN_THEMES.length];
      const len = Math.min(170, 54 + lv * 7), gr = [], plats = [], spikes = new Set(), springs = new Set();
      let h = 3; for (let i = 0; i < 6; i++) gr.push(h);
      const maxGap = Math.min(3, 1 + Math.floor((lv + 1) / 2));
      while (gr.length < len - 6) {
        const r = rng();
        if (r < 0.18) { const n = 1 + Math.floor(rng() * 3); for (let i = 0; i < n; i++) gr.push(h); }
        else if (r < 0.42) { const w = 1 + Math.floor(rng() * maxGap); for (let i = 0; i < w; i++) gr.push(0); gr.push(h); if (lv < 5 || rng() < 0.5) gr.push(h); }
        else if (r < 0.56) { h = clamp(h + (rng() < 0.5 ? -1 : 1) * (1 + Math.floor(rng() * (lv >= 3 ? 2 : 1))), 1, 7); gr.push(h, h); }
        else if (r < 0.74) { gr.push(h); spikes.add(gr.length); gr.push(h); if (lv >= 3 && rng() < 0.6) { spikes.add(gr.length); gr.push(h); } if (lv >= 8 && rng() < 0.4) { spikes.add(gr.length); gr.push(h); } gr.push(h, h); }
        else if (r < 0.9 && lv >= 2) {
          const w = 4 + Math.floor(rng() * 2), s = gr.length; for (let i = 0; i < w; i++) gr.push(0);
          // ab Level 4 bröckeln manche Plattformen weg, sobald man draufsteht
          plats.push({ c: s + 1, row: R - h - 1 - Math.floor(rng() * 2), w: 2, crumble: lv >= 4 && rng() < 0.5, gone: false, t: -1 }); gr.push(h, h);
        }
        else if (lv >= 3) { gr.push(h); springs.add(gr.length); gr.push(h); h = clamp(h + 3, 1, 9); gr.push(h, h, h); }
        else gr.push(h, h);
      }
      for (let i = 0; i < 6; i++) gr.push(h);
      this.g = gr; this.plats = plats; this.spikes = spikes; this.springs = springs; this.flagC = gr.length - 3;
      this.p = { x: 2 * this.T, y: this.groundY(2) - 25, vx: 0, vy: 0, w: 16, h: 24, on: false, coyote: 0, buf: 0, face: 1, sq: 1 };
      this.safe = { x: this.p.x, y: this.p.y }; this.cam = 0; this.deaths = 0;
    },
    groundY(c) { return this.yOff + (R - (this.g[c] || 0)) * this.T; },
    solid(c, r) {
      if (c < 0) return true; if (c >= this.g.length) return false; const h = this.g[c]; if (h > 0 && r >= R - h) return true;
      for (const p of this.plats) if (!p.gone && r === p.row && c >= p.c && c < p.c + p.w) return p; return false;
    },
    hitTiles(x, y, w, h) {
      const T = this.T, c0 = Math.floor(x / T), c1 = Math.floor((x + w - 1) / T), r0 = Math.floor((y - this.yOff) / T), r1 = Math.floor((y + h - 1 - this.yOff) / T);
      for (let c = c0; c <= c1; c++) for (let r = r0; r <= r1; r++) { const s = this.solid(c, r); if (s) return { c, r, plat: s === true ? null : s }; }
      return null;
    },
    // Tasten: aus allen Fingern neu berechnet, mit Pufferzone zwischen links und rechts (kein Flackern, nichts bleibt hängen)
    zone(x, prev) {
      if (x > E.W * 0.55) return 'J';
      if (prev === 'L') return x < 98 ? 'L' : 'R';
      if (prev === 'R') return x < 64 ? 'L' : 'R';
      return x < 81 ? 'L' : 'R';
    },
    kL: false, kR: false,
    sync() { const v = Object.values(this.ptr); this.L = this.kL || v.includes('L'); this.Rt = this.kR || v.includes('R'); },
    down(x, y, id) { const k = this.zone(x); this.ptr[id] = k; if (k === 'J') this.p.buf = 0.14; this.sync(); },
    move(x, y, id) { const cur = this.ptr[id]; if (!cur || cur === 'J') return; const k = this.zone(x, cur); if (k !== 'J' && k !== cur) { this.ptr[id] = k; this.sync(); } },
    up(x, y, id) { delete this.ptr[id]; this.sync(); },
    key(k, d) { if (k === 'L') this.kL = d; if (k === 'R') this.kR = d; if (k === 'J' && d) this.p.buf = 0.14; this.sync(); },
    dust(x, y, n, col) { for (let i = 0; i < n; i++) this.parts.push({ x, y, vx: rnd(-60, 60), vy: rnd(-90, -10), t: 0, life: rnd(0.3, 0.6), col }); },
    respawn() {
      const p = this.p; this.dust(p.x + 8, p.y + 12, 14, RED);
      this.plats.forEach((q) => { q.gone = false; q.t = -1; });
      p.x = 2 * this.T; p.y = this.groundY(2) - p.h - 1; p.vx = 0; p.vy = 0; this.cam = 0; this.safe = { x: p.x, y: p.y };
      this.deaths++; this.save(false); tone(160, 0.2, 'sine', 0.08); buzz(40); this.say('Zurück zum Start', 1.1);
    },
    update(dt, left, fin) {
      const p = this.p, T = this.T; this.t += dt; this.msgT = Math.max(0, this.msgT - dt);
      this.parts.forEach((q) => { q.t += dt; q.vy += 300 * dt; q.x += q.vx * dt; q.y += q.vy * dt; }); this.parts = this.parts.filter((q) => q.t < q.life);
      p.sq += (1 - p.sq) * Math.min(1, dt * 10); this.phase = (this.phase || 0) + Math.abs(p.vx) * dt / 11;
      if (fin > 0) {
        if (this.portal) { const dx = this.portal.x - p.x; p.x += clamp(dx, -150 * dt, 150 * dt); p.face = dx >= 0 ? 1 : -1; }
        this.cam += (p.x - E.W * 0.35 - this.cam) * Math.min(1, dt * 4); return;
      }
      this.plats.forEach((q) => { if (q.t >= 0 && !q.gone) { q.t += dt; if (q.t > 0.45) { q.gone = true; this.dust((q.c + 1) * T, this.yOff + q.row * T, 8, '#a8916f'); tone(200, 0.1, 'sine', 0.05); } } });
      const acc = (this.Rt ? 1 : 0) - (this.L ? 1 : 0); if (acc) p.face = acc;
      p.vx += (acc * 190 - p.vx) * Math.min(1, dt * (p.on ? 14 : 6));
      p.buf = Math.max(0, p.buf - dt); p.coyote = p.on ? 0.1 : Math.max(0, p.coyote - dt);
      if (p.buf > 0 && p.coyote > 0) { p.vy = -600; p.buf = 0; p.coyote = 0; p.on = false; p.sq = 1.25; this.dust(p.x + 8, p.y + p.h, 5, 'rgba(255,255,255,.5)'); tone(520, 0.06, 'triangle', 0.06); }
      p.vy = Math.min(900, p.vy + 1700 * dt);
      p.x += p.vx * dt; let h = this.hitTiles(p.x, p.y, p.w, p.h);
      if (h) { if (p.vx > 0) p.x = h.c * T - p.w; else if (p.vx < 0) p.x = (h.c + 1) * T; p.vx = 0; }
      const wasOn = p.on, vyBefore = p.vy;
      p.y += p.vy * dt; p.on = false; h = this.hitTiles(p.x, p.y, p.w, p.h);
      if (h) { if (p.vy > 0) { p.y = this.yOff + h.r * T - p.h; p.on = true; if (h.plat && h.plat.crumble && h.plat.t < 0) h.plat.t = 0; } else p.y = this.yOff + (h.r + 1) * T; p.vy = 0; }
      else if (p.vy >= 0) { const s = this.hitTiles(p.x, p.y + 1, p.w, p.h); if (s) { p.on = true; if (s.plat && s.plat.crumble && s.plat.t < 0) s.plat.t = 0; } }
      if (p.on && !wasOn && vyBefore > 300) { p.sq = 0.75; this.dust(p.x + 8, p.y + p.h, 6, 'rgba(255,255,255,.45)'); }
      const cMid = Math.floor((p.x + p.w / 2) / T);
      if (p.on) {
        const foot = Math.floor((p.y + p.h + 1 - this.yOff) / T), onGround = this.g[cMid] && foot === R - this.g[cMid];
        if (onGround && this.springs.has(cMid)) { p.vy = -900; p.on = false; p.sq = 1.35; tone(700, 0.12, 'triangle', 0.08); }
        if (onGround && this.spikes.has(cMid)) { this.respawn(); return; }
        if (onGround && !this.spikes.has(cMid) && this.g[cMid - 1] && this.g[cMid + 1] && !this.spikes.has(cMid - 1) && !this.spikes.has(cMid + 1)) this.safe = { x: cMid * T + T / 2 - p.w / 2, y: p.y };
      }
      if (p.y > E.H + 40) { this.respawn(); return; }
      if (cMid >= this.flagC) {
        this.lv++; this.save(false); tone(523, 0.12); tone(659, 0.12, 'triangle', 0.1, 0.1); tone(784, 0.2, 'triangle', 0.1, 0.2); buzz(30);
        this.gen(); this.say(`Level ${this.lv} · ${this.theme.name}`, 1.6); return;
      }
      this.cam += (p.x - E.W * 0.35 - this.cam) * Math.min(1, dt * 6); this.cam = Math.max(0, this.cam);
    },
    finale() {
      this.ptr = {}; this.kL = this.kR = false; this.L = this.Rt = false; const p = this.p, T = this.T; let c = Math.floor((p.x + p.w / 2) / T) + 2;
      for (let k = 0; k < 6 && !(this.g[c] > 0 && !this.spikes.has(c)); k++) c++;
      this.portal = this.g[c] > 0 && p.on ? { x: c * T + T / 2 - p.w / 2, y: this.groundY(c) } : { x: p.x, y: p.y + p.h };
      this.save(true); tone(392, 0.25, 'sine', 0.1); tone(587, 0.4, 'sine', 0.08, 0.15);
    },
    draw(left, fin) {
      const W = E.W, H = E.H, th = this.theme, T = this.T, cam = this.cam;
      const sky = ctx.createLinearGradient(0, 0, 0, this.yOff + R * T); sky.addColorStop(0, th.sky[0]); sky.addColorStop(1, th.sky[1]); ctx.fillStyle = sky; ctx.fillRect(0, 0, W, H);
      if (th.stars) for (let i = 0; i < 40; i++) { const sx = (i * 97.3 + 13) % W, sy = (i * 53.1) % (H * 0.45); ctx.fillStyle = `rgba(255,255,255,${0.3 + 0.4 * Math.abs(Math.sin(this.t + i))})`; ctx.fillRect(sx, sy, 1.5, 1.5); }
      if (th.sun) { const [sx, sy, c] = th.sun; const sg = ctx.createRadialGradient(W * sx, H * sy, 2, W * sx, H * sy, W * 0.4); sg.addColorStop(0, `rgba(${c},1)`); sg.addColorStop(0.06, `rgba(${c},.9)`); sg.addColorStop(0.1, `rgba(${c},.3)`); sg.addColorStop(1, `rgba(${c},0)`); ctx.fillStyle = sg; ctx.fillRect(0, 0, W, H); }
      if (th.lava) { const lg = ctx.createLinearGradient(0, this.yOff + T * 6, 0, H); lg.addColorStop(0, 'rgba(255,90,30,0)'); lg.addColorStop(1, 'rgba(255,90,30,.35)'); ctx.fillStyle = lg; ctx.fillRect(0, 0, W, H); }
      if (th.clouds) { ctx.fillStyle = th.clouds; for (let i = 0; i < 5; i++) { const cw = 60 + (i * 37) % 50, cx = ((i * 211 - cam * 0.08 - this.t * 6) % (W + 200) + W + 200) % (W + 200) - 100, cy = 30 + (i * 47) % (H * 0.25); ctx.beginPath(); ctx.ellipse(cx, cy, cw, cw * 0.22, 0, 0, TAU); ctx.ellipse(cx + cw * 0.3, cy - cw * 0.12, cw * 0.45, cw * 0.22, 0, 0, TAU); ctx.fill(); } }
      // Parallax: ferne Berge, nahe Hügel mit Bäumen
      ctx.fillStyle = th.far; ctx.beginPath(); ctx.moveTo(0, H);
      for (let x = 0; x <= W + 20; x += 20) { const wx = x + cam * 0.15; ctx.lineTo(x, this.yOff + T * 5.5 - Math.abs(Math.sin(wx / 140)) * T * 3.2 - Math.sin(wx / 47) * T * 0.6); }
      ctx.lineTo(W, H); ctx.fill();
      ctx.fillStyle = th.mid; ctx.beginPath(); ctx.moveTo(0, H);
      const hill = (x) => this.yOff + T * 8.5 - Math.abs(Math.sin((x + cam * 0.4) / 90)) * T * 2.2;
      for (let x = 0; x <= W + 20; x += 16) ctx.lineTo(x, hill(x));
      ctx.lineTo(W, H); ctx.fill();
      if (th.tree) { ctx.fillStyle = th.tree; const off = (cam * 0.4) % 46; for (let x = -off; x < W + 40; x += 46) { const id = Math.floor((x + cam * 0.4) / 46); if (id % 3 === 1) continue; const hy = hill(x), th2 = T * (1.2 + ((id * 7) % 5) * 0.2); ctx.beginPath(); ctx.moveTo(x - th2 * 0.35, hy + 4); ctx.lineTo(x, hy - th2); ctx.lineTo(x + th2 * 0.35, hy + 4); ctx.fill(); } }
      const c0 = Math.max(0, Math.floor(cam / T) - 1), c1 = Math.min(this.g.length - 1, Math.ceil((cam + W) / T) + 1);
      for (let c = c0; c <= c1; c++) {
        const h = this.g[c]; if (!h) continue; const x = Math.floor(c * T - cam), y = this.groundY(c);
        const gg = ctx.createLinearGradient(0, y, 0, H); gg.addColorStop(0, th.soil[0]); gg.addColorStop(1, th.soil[1]); ctx.fillStyle = gg; ctx.fillRect(x, y, T + 1, H - y);
        // Steine in der Erde
        ctx.fillStyle = 'rgba(0,0,0,.18)'; for (let r = 0; r < h + 2; r++) { const k = (c * 31 + r * 17) % 7; if (k < 3) { ctx.beginPath(); ctx.ellipse(x + 4 + k * T / 4, y + 10 + r * T * 0.8, 3 + k, 2 + k * 0.5, 0, 0, TAU); ctx.fill(); } }
        // Gras-/Schneekante mit Halmen
        ctx.fillStyle = th.grass; ctx.fillRect(x, y, T + 1, 5); ctx.strokeStyle = th.grass; ctx.lineWidth = 1.5;
        if (!this.g[c - 1]) { ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.fillRect(x, y, 3, H - y); ctx.fillStyle = th.grass; }
        if (!this.g[c + 1]) { ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.fillRect(x + T - 2, y, 3, H - y); ctx.fillStyle = th.grass; }
        ctx.beginPath(); for (let k = 0; k < 5; k++) { const bx = x + 2 + k * T / 5 + ((c * 13 + k * 7) % 4), bh = 3 + ((c * 7 + k * 3) % 4) + (th.lava ? 0 : Math.sin(this.t * 2 + c + k) * 0.8); ctx.moveTo(bx, y + 1); ctx.lineTo(bx + 1.5, y - bh); } ctx.stroke();
        if (this.spikes.has(c)) {
          for (let k = 0; k < 3; k++) { const sx = x + k * T / 3; const sg = ctx.createLinearGradient(sx, y - T * 0.6, sx + T / 3, y); sg.addColorStop(0, '#f4f4f4'); sg.addColorStop(0.5, '#9a9da3'); sg.addColorStop(1, '#4a4c50'); ctx.fillStyle = sg; ctx.beginPath(); ctx.moveTo(sx, y); ctx.lineTo(sx + T / 6, y - T * 0.65); ctx.lineTo(sx + T / 3, y); ctx.fill(); }
          ctx.fillStyle = '#3a3c40'; ctx.fillRect(x, y - 2, T, 3);
        }
        if (this.springs.has(c)) { const sq = Math.sin(this.t * 8) * 1.5; ctx.fillStyle = '#c0392b'; rr(ctx, x + 4, y - 10 + sq, T - 8, 6, 3); ctx.fill(); ctx.strokeStyle = '#d0d3d8'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x + 7, y); ctx.lineTo(x + T / 2 - 3, y - 6 + sq); ctx.lineTo(x + T / 2 + 3, y); ctx.lineTo(x + T - 7, y - 6 + sq); ctx.stroke(); }
      }
      this.plats.forEach((q) => {
        if (q.gone) return; const shake = q.t >= 0 ? Math.sin(q.t * 60) * 2 : 0; const x = q.c * T - cam + shake, y = this.yOff + q.row * T;
        if (x > W || x + q.w * T < 0) return; ctx.fillStyle = q.crumble ? '#6e5a48' : th.soil[0]; rr(ctx, x, y, q.w * T, T * 0.6, 4); ctx.fill();
        ctx.fillStyle = q.crumble ? '#a8916f' : th.grass; ctx.fillRect(x, y, q.w * T, 3);
        if (q.crumble) { ctx.strokeStyle = 'rgba(0,0,0,.5)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x + T * 0.6, y + 3); ctx.lineTo(x + T * 0.8, y + T * 0.6); ctx.moveTo(x + T * 1.3, y + 3); ctx.lineTo(x + T * 1.15, y + T * 0.6); ctx.stroke(); }
      });
      const fx = this.flagC * T - cam + T / 2, fy = this.groundY(this.flagC);
      if (fx < W + 20) { ctx.strokeStyle = INK; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(fx, fy); ctx.lineTo(fx, fy - T * 3); ctx.stroke(); const wv = Math.sin(this.t * 6) * 3; ctx.fillStyle = ACCENT; ctx.beginPath(); ctx.moveTo(fx, fy - T * 3); ctx.lineTo(fx + 26, fy - T * 2.6 + wv); ctx.lineTo(fx, fy - T * 2.2); ctx.fill(); }
      if (this.portal) {
        const k = clamp(fin * 2, 0, 1), px = this.portal.x + 8 - cam, py = this.portal.y; ctx.save(); ctx.translate(px, py - 30); ctx.scale(k, k);
        const gl = ctx.createRadialGradient(0, 0, 4, 0, 0, 44); gl.addColorStop(0, 'rgba(255,255,255,.95)'); gl.addColorStop(1, 'rgba(255,107,53,0)'); ctx.fillStyle = gl; ctx.beginPath(); ctx.ellipse(0, 0, 24, 34, 0, 0, TAU); ctx.fill();
        ctx.strokeStyle = ACCENT; ctx.lineWidth = 3; ctx.beginPath(); ctx.ellipse(0, 0, 18, 28, Math.sin(fin * 3) * 0.1, 0, TAU); ctx.stroke(); ctx.restore();
      }
      this.parts.forEach((q) => { ctx.globalAlpha = 1 - q.t / q.life; ctx.fillStyle = q.col; ctx.fillRect(q.x - cam, q.y, 3, 3); }); ctx.globalAlpha = 1;
      // Figur: Mensch mit Gelenken (Oberschenkel, Unterschenkel, Arme), Laufzyklus
      const p = this.p; let s = 1; if (fin > 0 && this.portal && Math.abs(this.portal.x - p.x) < 3) s = clamp(1 - (fin - 0.6) * 1.5, 0, 1);
      if (s > 0) {
        const x = p.x - cam, y = p.y; ctx.save(); ctx.translate(x + p.w / 2, y + p.h); ctx.scale(s * p.face / Math.sqrt(p.sq), s * p.sq);
        ctx.fillStyle = 'rgba(0,0,0,.3)'; ctx.beginPath(); ctx.ellipse(0, 1, 9, 2.5, 0, 0, TAU); ctx.fill();
        const run = p.on && Math.abs(p.vx) > 20, air = !p.on, ph = this.phase, lean = run ? 0.18 : air ? 0.1 : 0;
        const hip = [0, -12], sh = [hip[0] + Math.sin(lean) * 10, -22];
        const limb = (o, a1, a2, l1, l2) => { const k = [o[0] + Math.sin(a1) * l1, o[1] + Math.cos(a1) * l1]; return [k, [k[0] + Math.sin(a2) * l2, k[1] + Math.cos(a2) * l2]]; };
        const leg = (f) => { if (air) return p.vy < 0 ? (f ? [0.9, -0.2] : [-0.3, -0.9]) : (f ? [0.5, 0.1] : [-0.2, -0.6]); if (!run) return [f ? 0.08 : -0.08, f ? 0.05 : -0.08]; const q = ph + (f ? 0 : Math.PI), a = Math.sin(q) * 0.75; return [a, a - (0.15 + Math.max(0, -Math.cos(q)) * 1.3)]; };
        const arm = (f) => { if (air) return f ? [-2.4, -1.6] : [0.9, 1.9]; if (!run) return [f ? 0.1 : -0.1, f ? 0.25 : 0.05]; const a = -Math.sin(ph + (f ? 0 : Math.PI)) * 0.9; return [a, a + 1.4]; };
        const seg = (pts, col, w) => { ctx.strokeStyle = col; ctx.lineWidth = w; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]); ctx.stroke(); };
        const SKIN = '#d9a37f', SKIN2 = '#b98463';
        // hinteres Bein und Arm (dunkler)
        let [kn, ft] = limb(hip, ...leg(false), 6.5, 6.5); seg([hip, kn, ft], SKIN2, 3.6); seg([ft, [ft[0] + 3, ft[1]]], '#9aa0a8', 3.4);
        let [el, hd] = limb([sh[0], sh[1] + 1], ...arm(false), 5, 5); seg([[sh[0], sh[1] + 1], el, hd], SKIN2, 2.8);
        // Hose und Shirt
        seg([[hip[0] - 1, hip[1] - 1], [hip[0] + 1, hip[1] + 2]], '#1f2329', 6);
        seg([hip, sh], ACCENT, 6.5);
        // vorderes Bein
        [kn, ft] = limb(hip, ...leg(true), 6.5, 6.5); seg([hip, [kn[0] * 0.5 + hip[0] * 0.5, kn[1] * 0.5 + hip[1] * 0.5]], '#1f2329', 4.6); seg([[kn[0] * 0.5 + hip[0] * 0.5, kn[1] * 0.5 + hip[1] * 0.5], kn, ft], SKIN, 3.6); seg([ft, [ft[0] + 3.2, ft[1]]], '#f2f2f2', 3.6);
        // Kopf mit Haaren und Stirnband
        const hc = [sh[0] + 1.5, sh[1] - 5]; ctx.fillStyle = SKIN; ctx.beginPath(); ctx.arc(hc[0], hc[1], 4.2, 0, TAU); ctx.fill();
        ctx.fillStyle = '#3a2618'; ctx.beginPath(); ctx.arc(hc[0] - 0.6, hc[1] - 1, 4.3, Math.PI * 0.95, Math.PI * 2.05); ctx.fill();
        ctx.fillStyle = ACCENT; ctx.fillRect(hc[0] - 4.2, hc[1] - 2, 8.4, 1.6);
        ctx.beginPath(); ctx.moveTo(hc[0] - 4, hc[1] - 2); ctx.lineTo(hc[0] - 9, hc[1] - 2.5 + Math.sin(this.t * 14) * 1.5); ctx.lineTo(hc[0] - 4, hc[1] - 0.5); ctx.fill();
        ctx.fillStyle = '#1a1a1a'; ctx.fillRect(hc[0] + 1.8, hc[1] - 0.4, 1.2, 1.2);
        // vorderer Arm
        [el, hd] = limb([sh[0], sh[1] + 1], ...arm(true), 5, 5); seg([[sh[0], sh[1] + 1], el, hd], SKIN, 2.8);
        ctx.restore();
      }
      ctx.fillStyle = 'rgba(0,0,0,.35)'; rr(ctx, 8, 8, Math.max(W * 0.4 + 12, 230), 34, 8); ctx.fill();
      const prog = clamp(p.x / T / this.flagC, 0, 1); ctx.fillStyle = 'rgba(255,255,255,.1)'; rr(ctx, 14, 14, W * 0.4, 4, 2); ctx.fill(); ctx.fillStyle = ACCENT; rr(ctx, 14, 14, W * 0.4 * prog, 4, 2); ctx.fill();
      hudText(ctx, `Level ${this.lv} · ${th.name}${this.deaths ? ` · ${this.deaths}× gestorben` : ''}`, 14, 34, 'left', '#e8e3dc');
      if (this.msgT > 0) banner(ctx, W, this.msg, H * 0.3, this.msgT * 2);
      if (fin > 0.5) banner(ctx, W, `Level ${this.lv} wartet`, H * 0.3, (fin - 0.5) * 2, 22);
      ctx.fillStyle = 'rgba(0,0,0,.5)'; ctx.fillRect(0, H - 104, W, 104);
      const b = H - 54;
      roundBtn(ctx, 46, b, 30, this.L, () => arrow(ctx, 46, b, 1));
      roundBtn(ctx, 116, b, 30, this.Rt, () => arrow(ctx, 116, b, -1));
      roundBtn(ctx, W - 58, b, 38, this.p.buf > 0 || (!this.p.on && this.p.vy < 0), () => { ctx.font = '700 13px Inter, system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.fillText('SPRUNG', W - 58, b + 5); });
    },
  };
  return g;
}

// =====================================================================
// GLUTRÖHRE (3D-Achteck-Tunnel bis zum Fluchtpunkt, rote Fallen)
// =====================================================================
const TUBE_THEMES = [
  { name: 'Glutkern', bg: '#120806', a: ['#3a1a10', '#2a120b'], stripe: ['#ff6b35', '#ffb347', '#ff8a5c'], glow: '255,140,80' },
  { name: 'Eiskanal', bg: '#060b12', a: ['#13263a', '#0c1928'], stripe: ['#4ea8ff', '#9fd8ff', '#ffffff'], glow: '150,210,255' },
  { name: 'Giftader', bg: '#070d06', a: ['#16301a', '#0d200f'], stripe: ['#8be04e', '#e7f05a', '#4cb782'], glow: '170,240,110' },
  { name: 'Neonschacht', bg: '#0b0612', a: ['#2a1640', '#1b0e2c'], stripe: ['#c77dff', '#4ef0ff', '#7cff9e'], glow: '200,140,255' },
  { name: 'Goldmine', bg: '#0f0b05', a: ['#3a2c12', '#281e0a'], stripe: ['#f2c94c', '#ffe28a', '#d18b2c'], glow: '255,215,120' },
];
const SIDES = 8, SIDE = TAU / SIDES;
function roehre(E) {
  const { ctx, tone, buzz } = E;
  const ZP = 1.25; // Tiefe der Kugel
  const g = {
    init() {
      const sv = load('sb.roehre', { lv: 1 }); this.lv = Math.max(1, sv.lv | 0);
      this.rot = 0; this.vr = 0; this.L = false; this.Rt = false; this.ptr = {}; this.d = 0; this.t = 0; this.levelD = 0;
      this.obs = []; this.slow = 0; this.flash = 0; this.msg = ''; this.msgT = 0; this.streak = 0; this.shake = 0; this.tries = 1;
      this.startLevel(true);
    },
    startLevel(first) {
      this.theme = TUBE_THEMES[(this.lv - 1) % TUBE_THEMES.length]; this.levelLen = 200 + this.lv * 30; this.levelD = 0; this.tries = 1;
      // jedes Level hat immer dieselben Fallen: man kann es lernen
      this.rng = mulberry(this.lv * 977 + 5); this.obs = []; this.nextK = Math.ceil(this.d) + (first ? 14 : 10);
      this.msg = `Level ${this.lv} · ${this.theme.name}`; this.msgT = 1.6;
    },
    /** Getroffen: zurück an den Anfang des Levels */
    restart() {
      this.levelD = 0; this.obs = []; this.rng = mulberry(this.lv * 977 + 5); this.nextK = Math.ceil(this.d) + 12; this.tries++;
      this.msg = 'Getroffen · Level von vorn'; this.msgT = 1.4;
    },
    goalK() { return this.d - this.levelD + this.levelLen; },
    save() { store('sb.roehre', { lv: this.lv }); },
    speed() { return (9 + this.lv * 0.9 + Math.min(4, this.t * 0.04)) * (this.slow > 0 ? 0.5 : 1); },
    pAng() { return Math.PI / 2 - this.rot; },
    sideOf(a) { return Math.floor(norm(a + SIDE / 2) / SIDE) % SIDES; },
    spawn() {
      const lv = this.lv, r = this.rng(), k = this.nextK, ps = this.sideOf(this.pAng());
      const pick = () => Math.floor(this.rng() * SIDES);
      const types = ['block', 'wall', 'double']; if (lv >= 2) types.push('pulse'); if (lv >= 3) types.push('mover'); if (lv >= 4) types.push('bar', 'spiral'); if (lv >= 6) types.push('cage');
      const t = types[Math.floor(r * types.length)];
      if (t === 'block') { const s = this.rng() < 0.6 ? ps : pick(); this.obs.push({ k, sides: [s], type: 'block' }); }
      else if (t === 'double') { const s = pick(); this.obs.push({ k, sides: [s, (s + 1) % SIDES], type: 'block' }); }
      else if (t === 'wall') { const gap = Math.max(2, 4 - Math.floor(lv / 3)), g0 = pick(); const sides = []; for (let i = 0; i < SIDES - gap; i++) sides.push((g0 + gap + i) % SIDES); this.obs.push({ k, sides, type: 'block' }); }
      else if (t === 'pulse') { const s0 = pick(); const sides = [s0, (s0 + 2) % SIDES, (s0 + 4) % SIDES, (s0 + 6) % SIDES]; this.obs.push({ k, sides, type: 'pulse', ph: this.rng() * TAU, w: 2.6 + lv * 0.15 }); }
      else if (t === 'mover') { this.obs.push({ k, sides: [pick()], type: 'mover', pos: this.rng() * SIDES, v: (this.rng() < 0.5 ? -1 : 1) * (1.2 + lv * 0.12), len: 2 }); }
      else if (t === 'bar') { const s = pick(); this.obs.push({ k, sides: [s, (s + 4) % SIDES], type: 'bar' }); }
      else if (t === 'spiral') { let s = pick(); const dir = this.rng() < 0.5 ? 1 : -1; for (let i = 0; i < 5; i++) { const sides = []; for (let j = 0; j < 5; j++) sides.push((s + j) % SIDES); this.obs.push({ k: k + i * 2.2, sides, type: 'block' }); s = (s + dir + SIDES) % SIDES; } this.nextK += 9; }
      else if (t === 'cage') { const gs = pick(); const sides = []; for (let i = 0; i < SIDES; i++) if (i !== gs) sides.push(i); this.obs.push({ k, sides, type: 'block' }); }
      this.nextK += Math.max(3.2, 7.5 - lv * 0.45 - Math.min(1.5, this.t * 0.015)) + this.rng() * 2;
    },
    blocked(o) {
      if (o.type === 'pulse' && Math.sin(this.t * o.w + o.ph) < 0) return [];
      if (o.type === 'mover') { const s = Math.floor(norm(o.pos * SIDE) / SIDE); const out = []; for (let i = 0; i < o.len; i++) out.push((s + i) % SIDES); return out; }
      return o.sides;
    },
    down(x, y, id) { const k = x < E.W / 2 ? 'L' : 'R'; this.ptr[id] = k; this.key(k, true); },
    move(x, y, id) { if (!(id in this.ptr)) return; const k = x < E.W / 2 ? 'L' : 'R'; if (k !== this.ptr[id]) { this.key(this.ptr[id], false); this.ptr[id] = k; this.key(k, true); } },
    up(x, y, id) { const k = this.ptr[id]; delete this.ptr[id]; if (k) this.key(k, false); },
    key(k, d) { if (k === 'L') this.L = d; if (k === 'R') this.Rt = d; },
    update(dt, left, fin) {
      this.t += dt; this.flash = Math.max(0, this.flash - dt * 2.5); this.slow = Math.max(0, this.slow - dt); this.msgT = Math.max(0, this.msgT - dt); this.shake = Math.max(0, this.shake - dt * 3);
      const want = ((this.Rt ? 1 : 0) - (this.L ? 1 : 0)) * 3.9; this.vr += (want - this.vr) * Math.min(1, dt * 12); this.rot += this.vr * dt;
      const v = fin > 0 ? 14 : this.speed(); this.d += v * dt; this.levelD += v * dt;
      this.obs.forEach((o) => { if (o.type === 'mover') o.pos += o.v * dt; });
      if (fin > 0) return;
      // nur Fallen, die vor dem Schluss ankommen
      while (this.nextK < this.d + 34 && this.nextK < this.goalK() - 5 && (this.nextK - this.d) / v < left - 2.6) this.spawn();
      if ((this.nextK - this.d) / v >= left - 2.6) this.nextK = Math.max(this.nextK, this.d + 34);
      const ps = this.sideOf(this.pAng()), frac = norm(this.pAng() + SIDE / 2) / SIDE % 1;
      this.obs.forEach((o) => {
        if (o.done || o.k - this.d > ZP) return; o.done = true; const bl = this.blocked(o);
        // Kugel ist an der Kante zweier Seiten: beide zählen
        const near = frac < 0.12 ? (ps + SIDES - 1) % SIDES : frac > 0.88 ? (ps + 1) % SIDES : ps;
        if (bl.includes(ps) || (near !== ps && bl.includes(near) && (frac < 0.06 || frac > 0.94))) {
          this.streak = 0; this.flash = 1; this.slow = 0.5; this.shake = 1; tone(110, 0.3, 'sawtooth', 0.08); buzz([50, 30, 50]);
          this.restart();
        } else { this.streak++; tone(560 + Math.min(16, this.streak) * 22, 0.05, 'triangle', 0.05); }
      });
      this.obs = this.obs.filter((o) => o.k - this.d > -1);
      if (this.levelD >= this.levelLen) { this.lv++; this.save(); tone(523, 0.15); tone(659, 0.15, 'triangle', 0.1, 0.1); tone(784, 0.3, 'triangle', 0.1, 0.2); buzz([30, 40, 30]); this.startLevel(false); this.msg = `Ziel! Level ${this.lv} · ${this.theme.name}`; }
    },
    finale() { this.L = this.Rt = false; this.save(); tone(523, 0.3, 'sine', 0.08); tone(784, 0.5, 'sine', 0.07, 0.2); },
    draw(left, fin) {
      const W = E.W, H = E.H, th = this.theme;
      const sh = this.shake * 6, cx = W / 2 + rnd(-sh, sh), cy = H * 0.45 + rnd(-sh, sh), K = Math.min(W, H) * 0.62;
      ctx.fillStyle = th.bg; ctx.fillRect(0, 0, W, H);
      const proj = (a, z, rad = 1) => { const s = K / Math.max(0.2, z); return [cx + Math.cos(a + this.rot) * s * rad, cy + Math.sin(a + this.rot) * s * rad]; };
      const vx = (i) => i * SIDE - SIDE / 2;
      const d0 = this.d, kStart = Math.floor(d0), DEPTH = 34;
      // Wände von hinten nach vorn: jede Seite in 3 Streifen, bunt gemischt wie ein Mosaik
      const STR = 3, hash = (a, b, c) => { let h = (a * 374761393 + b * 668265263 + c * 2147483647) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
      for (let k = kStart + DEPTH; k >= kStart; k--) {
        const z1 = Math.max(0.35, k - d0), z2 = k + 1 - d0; if (z2 <= 0.35) continue;
        const fog = clamp((z1 - 1.5) / (DEPTH - 4), 0, 1);
        ctx.globalAlpha = 1 - fog * 0.92;
        for (let s = 0; s < SIDES; s++) for (let j = 0; j < STR; j++) {
          const a1 = vx(s) + (SIDE * j) / STR, a2 = vx(s) + (SIDE * (j + 1)) / STR;
          const p1 = proj(a1, z1), p2 = proj(a2, z1), p3 = proj(a2, z2), p4 = proj(a1, z2);
          const h = hash(s * STR + j, k, this.lv);
          ctx.fillStyle = h < 0.34 ? th.stripe[Math.floor(h * 100) % th.stripe.length] : th.a[(s + k) & 1];
          ctx.beginPath(); ctx.moveTo(p1[0], p1[1]); ctx.lineTo(p2[0], p2[1]); ctx.lineTo(p3[0], p3[1]); ctx.lineTo(p4[0], p4[1]); ctx.closePath(); ctx.fill();
        }
      }
      ctx.globalAlpha = 1;
      // Fugen zwischen den Seiten
      ctx.strokeStyle = 'rgba(0,0,0,.35)'; ctx.lineWidth = 1.5;
      for (let s = 0; s < SIDES; s++) { const a = proj(vx(s), 0.4), b = proj(vx(s), DEPTH); ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke(); }
      // Licht am Ende
      const lg = ctx.createRadialGradient(cx, cy, 0, cx, cy, K / 8 + (fin > 0 ? fin * K : 0)); lg.addColorStop(0, `rgba(255,255,255,${fin > 0 ? clamp(fin / 1.5, 0.3, 1) : 0.35})`); lg.addColorStop(1, `rgba(${th.glow},0)`); ctx.fillStyle = lg; ctx.fillRect(0, 0, W, H);
      // Ziel: Schachbrett-Ring am Levelende
      const gz = this.goalK() - d0;
      if (gz > 0.5 && gz < DEPTH && fin <= 0) {
        const fogG = clamp((gz - 1.5) / (DEPTH - 4), 0, 1); ctx.globalAlpha = 1 - fogG * 0.8;
        for (let s = 0; s < SIDES * 4; s++) for (let r = 0; r < 2; r++) {
          const a1 = vx(0) + (s * SIDE) / 4, a2 = a1 + SIDE / 4, z1 = gz + r * 0.5, z2 = z1 + 0.5;
          const p1 = proj(a1, z1), p2 = proj(a2, z1), p3 = proj(a2, z2), p4 = proj(a1, z2);
          ctx.fillStyle = (s + r) % 2 ? '#111' : '#fff'; ctx.beginPath(); ctx.moveTo(p1[0], p1[1]); ctx.lineTo(p2[0], p2[1]); ctx.lineTo(p3[0], p3[1]); ctx.lineTo(p4[0], p4[1]); ctx.closePath(); ctx.fill();
        }
        ctx.globalAlpha = 1;
        if (gz < 12) banner(ctx, W, 'Ziel', cy - K / gz - 10, 1 - gz / 12, Math.max(16, Math.min(40, 220 / gz)));
      }
      // Fallen von hinten nach vorn: rote Blöcke, die aus der Wand ragen
      [...this.obs].sort((a, b) => b.k - a.k).forEach((o) => {
        const z1 = o.k - d0, z2 = z1 + 1; if (z1 < 0.6 || z1 > DEPTH) return; const za = Math.max(0.4, z1);
        const fog = clamp((za - 2) / (DEPTH - 2), 0, 1); const active = o.type !== 'pulse' || Math.sin(this.t * o.w + o.ph) >= 0;
        const sides = o.type === 'mover' ? this.blocked(o) : o.sides; const hgt = o.type === 'bar' ? 0.98 : 0.42;
        sides.forEach((s) => {
          const a1 = vx(s), a2 = vx(s + 1), ir = 1 - hgt;
          const f1 = proj(a1, za), f2 = proj(a2, za), f3 = proj(a2, za, ir), f4 = proj(a1, za, ir);
          const b3 = proj(a2, z2, ir), b4 = proj(a1, z2, ir);
          ctx.globalAlpha = active ? 1 : 0.22;
          // Oberseite (Richtung Mitte)
          ctx.fillStyle = '#ff7a80'; ctx.beginPath(); ctx.moveTo(f4[0], f4[1]); ctx.lineTo(f3[0], f3[1]); ctx.lineTo(b3[0], b3[1]); ctx.lineTo(b4[0], b4[1]); ctx.closePath(); ctx.fill();
          // Vorderseite
          const fg = ctx.createLinearGradient(f1[0], f1[1], f4[0], f4[1]); fg.addColorStop(0, '#ff2b36'); fg.addColorStop(1, '#c4101b');
          ctx.fillStyle = o.type === 'mover' ? '#ff3b6b' : fg; ctx.beginPath(); ctx.moveTo(f1[0], f1[1]); ctx.lineTo(f2[0], f2[1]); ctx.lineTo(f3[0], f3[1]); ctx.lineTo(f4[0], f4[1]); ctx.closePath(); ctx.fill();
          ctx.fillStyle = `rgba(0,0,0,${fog * 0.8})`; ctx.fill();
          ctx.strokeStyle = `rgba(255,240,240,${0.85 * (1 - fog)})`; ctx.lineWidth = 2; ctx.stroke();
          ctx.globalAlpha = 1;
        });
      });
      // Kugel unten
      const bp = proj(Math.PI / 2 - this.rot, ZP, 0.86); const br = Math.max(9, K / ZP * 0.07);
      const gl = ctx.createRadialGradient(bp[0], bp[1], 2, bp[0], bp[1], br * 3); gl.addColorStop(0, `rgba(${th.glow},.55)`); gl.addColorStop(1, 'rgba(0,0,0,0)'); ctx.fillStyle = gl; ctx.beginPath(); ctx.arc(bp[0], bp[1], br * 3, 0, TAU); ctx.fill();
      const bg2 = ctx.createRadialGradient(bp[0] - br * 0.3, bp[1] - br * 0.3, 1, bp[0], bp[1], br); bg2.addColorStop(0, '#ffffff'); bg2.addColorStop(1, '#cfc9c1'); ctx.fillStyle = bg2; ctx.beginPath(); ctx.arc(bp[0], bp[1], br, 0, TAU); ctx.fill();
      ctx.fillStyle = ACCENT; ctx.beginPath(); ctx.arc(bp[0], bp[1], br * 0.4, 0, TAU); ctx.fill();
      if (this.flash > 0) { ctx.fillStyle = `rgba(229,72,77,${this.flash * 0.3})`; ctx.fillRect(0, 0, W, H); }
      // Anzeige: Strecke, Tempo, Leben
      const kmh = Math.round(this.speed() * 14);
      ctx.fillStyle = 'rgba(0,0,0,.55)'; rr(ctx, 6, 4, W - 12, 52, 10); ctx.fill();
      hudText(ctx, `Level ${this.lv} · ${th.name}`, 14, 20, 'left', '#e8e3dc');
      hudText(ctx, `${Math.round(this.levelD * 3)} / ${Math.round(this.levelLen * 3)} m · ${kmh} km/h`, 14, 38, 'left', INK);
      hudText(ctx, `Versuch ${this.tries}`, W - 14, 20, 'right');
      const pr = clamp(this.levelD / this.levelLen, 0, 1); ctx.fillStyle = 'rgba(255,255,255,.12)'; rr(ctx, 14, 46, W - 28, 4, 2); ctx.fill(); ctx.fillStyle = th.stripe[0]; rr(ctx, 14, 46, (W - 28) * pr, 4, 2); ctx.fill();
      if (this.msgT > 0) banner(ctx, W, this.msg, H * 0.2, this.msgT * 2);
      if (fin > 0.6) banner(ctx, W, 'Raus aus der Röhre', H * 0.2, (fin - 0.6) * 2, 24, '#1a0d06');
      if (fin <= 0) { roundBtn(ctx, 46, H - 50, 28, this.L, () => arrow(ctx, 46, H - 50, 1)); roundBtn(ctx, W - 46, H - 50, 28, this.Rt, () => arrow(ctx, W - 46, H - 50, -1)); }
    },
  };
  return g;
}

// =====================================================================
// PAPIERFLIEGER (Level mit eigenem Himmel, Vögel, Canyon, Böen)
// =====================================================================
const SKY_THEMES = [
  { name: 'Abendrot', sky: ['#3a1d14', '#120a08'], hills: ['#2a1812', '#1d110d'], ground: '#241712', sun: [0.75, 0.32, '255,150,90'], stars: false },
  { name: 'Sternennacht', sky: ['#0c1426', '#05070c'], hills: ['#111a2b', '#0b111d'], ground: '#0f1520', sun: [0.2, 0.2, '220,230,255'], stars: true },
  { name: 'Roter Canyon', sky: ['#40180c', '#1a0905'], hills: ['#5a2412', '#3b170b'], ground: '#4a1e0e', sun: [0.5, 0.15, '255,200,120'], stars: false, canyon: true },
  { name: 'Gewitter', sky: ['#161a22', '#08090c'], hills: ['#1a1e26', '#111419'], ground: '#151820', sun: null, stars: false, storm: true },
  { name: 'Gletscher', sky: ['#1c2c3c', '#0a1118'], hills: ['#d7e4ee', '#9fb4c4'], ground: '#cfdde8', sun: [0.8, 0.25, '255,255,255'], stars: false, canyon: true, ceil: '#7f97aa' },
];
function flieger(E) {
  const { ctx, tone, buzz } = E;
  const g = {
    init() {
      const sv = load('sb.flieger', { lv: 1 }); this.lv = Math.max(1, sv.lv | 0);
      this.v = 120; this.x = 0; this.y = E.H * 0.4; this.vy = 0; this.hold = false; this.wob = 0; this.t = 0; this.tries = 1; this.grace = 1.2; this.items = []; this.runway = null; this.flash = 0; this.msg = ''; this.msgT = 0; this.bolt = 0;
      this.startLevel();
    },
    startLevel() {
      this.theme = SKY_THEMES[(this.lv - 1) % SKY_THEMES.length]; this.levelStart = this.x; this.levelLen = 2200 + this.lv * 250; this.tries = 1;
      this.rng = mulberry(this.lv * 4241 + 9); this.items = this.items.filter((i) => i.x < this.x + E.W); this.nextX = this.x + E.W + 120; this.msg = `Level ${this.lv} · ${this.theme.name}`; this.msgT = 1.6;
      this.stars = Array.from({ length: 50 }, () => [Math.random(), Math.random() * 0.6, Math.random()]);
    },
    save() { store('sb.flieger', { lv: this.lv }); },
    ground(x) { const a = Math.sin(x / 260) * 0.05 + Math.sin(x / 97) * 0.02; return E.H * (0.84 - 0.06 - a); },
    ceiling(x) { if (!this.theme.canyon) return -100; const a = Math.sin(x / 210 + 1) * 0.05 + Math.sin(x / 73) * 0.02; return E.H * (0.1 + 0.06 + a + Math.min(0.08, this.lv * 0.01)); },
    r(a, b) { return a + this.rng() * (b - a); },
    spawn() {
      const lv = this.lv, x = this.nextX, top = Math.max(50, this.ceiling(x) + 40), bot = this.ground(x) - 50, y = this.r(top, bot);
      const r = this.rng();
      if (r < 0.4) this.items.push({ k: 'ring', x, y, hit: false });
      else if (r < 0.65) this.items.push({ k: 'cloud', x, y, r: this.r(26, 40), hit: false });
      else if (r < 0.85 && lv >= 1) this.items.push({ k: 'bird', x, y, by: y, amp: this.r(30, 70), ph: this.rng() * TAU, hit: false });
      else if (lv >= 2) this.items.push({ k: 'pillar', x, gapY: this.r(top + 70, bot - 70), gap: Math.max(110, 170 - lv * 8), hit: false });
      this.nextX += Math.max(110, 230 - lv * 12) + this.r(0, 80);
    },
    down() { this.hold = true; }, up() { this.hold = false; }, key(k, d) { if (k === 'J') this.hold = d; },
    /** Absturz: zurück an den Start des Levels, gleiche Strecke wie vorher */
    hurt() {
      if (this.grace > 0) return;
      this.flash = 1; tone(150, 0.3, 'sawtooth', 0.07); buzz([50, 30, 50]);
      this.x = this.levelStart; this.y = E.H * 0.4; this.vy = 0; this.items = []; this.rng = mulberry(this.lv * 4241 + 9); this.nextX = this.x + E.W + 120;
      this.tries++; this.grace = 1.2; this.msg = 'Abgestürzt · Level von vorn'; this.msgT = 1.4;
    },
    update(dt, left, fin) {
      this.t += dt; this.msgT = Math.max(0, this.msgT - dt); this.flash = Math.max(0, this.flash - dt * 2.5); this.bolt = Math.max(0, this.bolt - dt); this.grace = Math.max(0, this.grace - dt);
      const th = this.theme; this.v = 120 + this.lv * 8;
      if (fin > 0) {
        if (!this.runway) this.runway = { x: this.x + E.W * 0.3 + this.v * 1.2 };
        const k = Math.max(0, 1 - fin / 2.4); this.x += this.v * k * dt; const gy = this.ground(this.runway.x) ; this.y += (gy - 16 - this.y) * Math.min(1, dt * 3); return;
      }
      this.x += this.v * dt;
      while (this.nextX < this.x + E.W + 200 && this.nextX < this.levelStart + this.levelLen - 150) this.spawn();
      if (th.storm) { if (Math.random() < dt * 0.25) { this.bolt = 0.25; tone(80, 0.4, 'sawtooth', 0.04); } this.vy += Math.sin(this.t * 1.3) * 90 * dt * Math.min(1, this.lv / 3); }
      this.vy += (this.hold ? -430 : 270) * dt; this.vy = clamp(this.vy, -180, 180); this.y += this.vy * dt;
      const px = this.x + E.W * 0.3, gy = this.ground(px) - 14, cy = this.ceiling(px) + 14;
      if (this.y > gy) { this.y = gy; this.vy = -140; this.hurt(); return; }
      if (this.y < Math.max(30, cy)) { this.y = Math.max(30, cy); this.vy = 100; if (cy > 30) { this.hurt(); return; } }
      this.items.forEach((it) => {
        if (it.hit) return; if (it.k === 'bird') it.y = it.by + Math.sin(this.t * 2 + it.ph) * it.amp;
        const dx = it.x - px, dy = it.y - this.y;
        if (it.k === 'ring' && Math.abs(dx) < 10 && Math.abs(dy) < 24) { it.hit = true; tone(880, 0.08); tone(1320, 0.1, 'triangle', 0.07, 0.05); buzz(10); }
        if (it.k === 'cloud' && Math.hypot(dx, dy) < it.r) { it.hit = true; this.wob = 0.5; this.vy = dy > 0 ? -120 : 120; tone(220, 0.15, 'sine', 0.06); }
        if (it.k === 'bird' && Math.hypot(dx, dy) < 16 && this.grace <= 0) { this.hurt(); }
        if (it.k === 'pillar' && Math.abs(dx) < 16 && Math.abs(this.y - it.gapY) > it.gap / 2 && this.grace <= 0) { this.hurt(); }
      });
      this.items = this.items.filter((i) => i.x > this.x - 80);
      this.wob = Math.max(0, this.wob - dt);
      if (this.x + E.W * 0.3 - this.levelStart >= this.levelLen) { this.lv++; this.save(); tone(523, 0.15); tone(659, 0.15, 'triangle', 0.1, 0.1); tone(784, 0.3, 'triangle', 0.1, 0.2); buzz([30, 40, 30]); this.startLevel(); this.msg = `Ziel! Level ${this.lv} · ${this.theme.name}`; }
    },
    finale() { this.hold = false; this.save(); tone(392, 0.18); tone(523, 0.3, 'triangle', 0.1, 0.15); },
    draw(left, fin) {
      const W = E.W, H = E.H, th = this.theme, cam = this.x;
      const sky = ctx.createLinearGradient(0, 0, 0, H); sky.addColorStop(0, th.sky[0]); sky.addColorStop(1, th.sky[1]); ctx.fillStyle = sky; ctx.fillRect(0, 0, W, H);
      if (th.stars) { this.stars.forEach(([sx, sy, tw]) => { ctx.fillStyle = `rgba(255,255,255,${0.3 + 0.5 * Math.abs(Math.sin(this.t * 2 + tw * 9))})`; ctx.fillRect(((sx * W * 2 - cam * 0.05) % W + W) % W, sy * H, 1.5, 1.5); }); }
      if (th.sun) { const [sx, sy, c] = th.sun; const sg = ctx.createRadialGradient(W * sx, H * sy, 4, W * sx, H * sy, W * 0.35); sg.addColorStop(0, `rgba(${c},.9)`); sg.addColorStop(0.08, `rgba(${c},.35)`); sg.addColorStop(1, `rgba(${c},0)`); ctx.fillStyle = sg; ctx.fillRect(0, 0, W, H); }
      if (this.bolt > 0) { ctx.fillStyle = `rgba(220,230,255,${this.bolt * 1.4})`; ctx.fillRect(0, 0, W, H); }
      // Hügel in zwei Ebenen
      th.hills.forEach((col, i) => { const f = i ? 0.55 : 0.25, base = H * (i ? 0.7 : 0.6); ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(0, H); for (let sx = 0; sx <= W + 12; sx += 12) { const wx = sx + cam * f; ctx.lineTo(sx, base - Math.abs(Math.sin(wx / (i ? 120 : 200))) * H * 0.12 - Math.sin(wx / 37) * 4); } ctx.lineTo(W, H); ctx.fill(); });
      // Decke (Canyon)
      if (th.canyon) {
        ctx.fillStyle = th.ceil || '#1c0c06'; ctx.beginPath(); ctx.moveTo(0, 0); for (let sx = 0; sx <= W + 8; sx += 8) ctx.lineTo(sx, this.ceiling(sx + cam)); ctx.lineTo(W, 0); ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,.35)'; ctx.lineWidth = 2; ctx.beginPath(); for (let sx = 0; sx <= W + 8; sx += 8) ctx.lineTo(sx, this.ceiling(sx + cam)); ctx.stroke();
        ctx.fillStyle = 'rgba(0,0,0,.25)'; for (let sx = -((cam * 1) % 60); sx < W; sx += 60) { const y = this.ceiling(sx + cam); ctx.beginPath(); ctx.moveTo(sx, y - 2); ctx.lineTo(sx + 10, y + 16); ctx.lineTo(sx + 20, y - 2); ctx.fill(); }
      }
      // Boden + Landebahn
      ctx.fillStyle = th.ground; ctx.beginPath(); ctx.moveTo(0, H); for (let sx = 0; sx <= W + 8; sx += 8) ctx.lineTo(sx, this.ground(sx + cam)); ctx.lineTo(W, H); ctx.fill();
      if (this.runway) { const rx = this.runway.x - cam - 40, ry = this.ground(this.runway.x); ctx.fillStyle = '#2c2926'; ctx.fillRect(rx, ry - 2, 260, 10); ctx.fillStyle = ACCENT; for (let i = 0; i < 6; i++) ctx.fillRect(rx + 12 + i * 40, ry + 1, 20, 3); }
      // Hindernisse
      this.items.forEach((it) => {
        const sx = it.x - cam; if (sx < -60 || sx > W + 60) return;
        if (it.k === 'ring') { ctx.strokeStyle = it.hit ? 'rgba(255,107,53,.25)' : ACCENT; ctx.lineWidth = 4; ctx.beginPath(); ctx.ellipse(sx, it.y, 8, 24, 0, 0, TAU); ctx.stroke(); }
        else if (it.k === 'cloud') { ctx.fillStyle = it.hit ? 'rgba(200,200,210,.15)' : 'rgba(200,200,210,.32)'; [[-0.6, 0, 0.7], [0, -0.35, 0.85], [0.6, 0, 0.7], [0, 0.2, 0.9]].forEach(([a, b, s]) => { ctx.beginPath(); ctx.arc(sx + a * it.r, it.y + b * it.r, it.r * s * 0.75, 0, TAU); ctx.fill(); }); }
        else if (it.k === 'bird') { const f = Math.sin(this.t * 14 + it.ph) * 6; ctx.strokeStyle = it.hit ? 'rgba(229,72,77,.3)' : RED; ctx.lineWidth = 3; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(sx - 10, it.y - f); ctx.lineTo(sx, it.y); ctx.lineTo(sx + 10, it.y - f); ctx.stroke(); }
        else if (it.k === 'pillar') { const top = it.gapY - it.gap / 2, bot = it.gapY + it.gap / 2; ctx.fillStyle = it.hit ? 'rgba(229,72,77,.3)' : RED; rr(ctx, sx - 12, -10, 24, top + 10, 4); ctx.fill(); rr(ctx, sx - 12, bot, 24, H, 4); ctx.fill(); ctx.fillStyle = 'rgba(255,255,255,.25)'; ctx.fillRect(sx - 12, top - 3, 24, 3); ctx.fillRect(sx - 12, bot, 24, 3); }
      });
      // Ziel-Tor am Levelende
      const gx = this.levelStart + this.levelLen - cam;
      if (gx > -30 && gx < W + 30 && fin <= 0) {
        for (let yy = 0; yy < H; yy += 16) { ctx.fillStyle = (Math.floor(yy / 16)) % 2 ? '#111' : '#fff'; ctx.fillRect(gx - 4, yy, 8, 16); }
        ctx.fillStyle = 'rgba(255,255,255,.08)'; ctx.fillRect(gx, 0, 40, H); banner(ctx, W, 'Ziel', 70, 1, 20); ctx.textAlign = 'left';
      }
      // Flieger mit Schatten
      const px = W * 0.3, ang = fin > 0 ? 0 : clamp(this.vy / 400, -0.5, 0.5) + Math.sin(this.t * 16) * this.wob * 0.3;
      ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.beginPath(); ctx.ellipse(px, this.ground(cam + px) - 2, 14, 3, 0, 0, TAU); ctx.fill();
      ctx.save(); ctx.translate(px, this.y); ctx.rotate(ang); if (this.grace > 0 && Math.floor(this.t * 10) % 2) ctx.globalAlpha = 0.35;
      ctx.fillStyle = INK; ctx.beginPath(); ctx.moveTo(20, 0); ctx.lineTo(-15, -11); ctx.lineTo(-8, 0); ctx.lineTo(-15, 10); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#bdb7af'; ctx.beginPath(); ctx.moveTo(20, 0); ctx.lineTo(-8, 0); ctx.lineTo(-15, 10); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = ACCENT; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(18, 0); ctx.lineTo(-8, 0); ctx.stroke(); ctx.restore();
      if (this.flash > 0) { ctx.fillStyle = `rgba(229,72,77,${this.flash * 0.25})`; ctx.fillRect(0, 0, W, H); }
      const prog = clamp((this.x - this.levelStart) / this.levelLen, 0, 1); ctx.fillStyle = 'rgba(255,255,255,.12)'; rr(ctx, 14, 14, W * 0.4, 4, 2); ctx.fill(); ctx.fillStyle = ACCENT; rr(ctx, 14, 14, W * 0.4 * prog, 4, 2); ctx.fill();
      hudText(ctx, `Level ${this.lv} · ${th.name} · Versuch ${this.tries}`, 14, 34);
      if (this.msgT > 0) banner(ctx, W, this.msg, H * 0.3, this.msgT * 2, 22);
      if (fin > 0.8) banner(ctx, W, 'Gelandet', H * 0.3, (fin - 0.8) * 2);
    },
  };
  return g;
}

// =====================================================================
// ENTSPANNEN: ruhiges Atmen, nichts tippen (4 s ein, 2 s halten, 6 s aus)
// =====================================================================
function entspannen(E) {
  const { ctx } = E;
  const IN = 4, HOLD = 2, OUT = 6, CYC = IN + HOLD + OUT;
  const g = {
    init() { this.t = 0; this.dots = Array.from({ length: 36 }, (_, i) => ({ a: (i / 36) * TAU, r: Math.random() })); },
    update(dt) { this.t += dt; },
    finale() {},
    phase() {
      const c = this.t % CYC;
      if (c < IN) return { k: 0.5 - 0.5 * Math.cos((c / IN) * Math.PI), txt: 'Einatmen', left: Math.ceil(IN - c) };
      if (c < IN + HOLD) return { k: 1, txt: 'Halten', left: Math.ceil(IN + HOLD - c) };
      const o = (c - IN - HOLD) / OUT; return { k: 0.5 + 0.5 * Math.cos(o * Math.PI), txt: 'Ausatmen', left: Math.ceil(OUT - (c - IN - HOLD)) };
    },
    draw(left, fin) {
      const W = E.W, H = E.H, cx = W / 2, cy = H * 0.46, M = Math.min(W, H);
      const bg = ctx.createLinearGradient(0, 0, 0, H); bg.addColorStop(0, '#0d1418'); bg.addColorStop(1, '#070909'); ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
      const { k, txt, left: n } = this.phase(); const r = M * (0.14 + 0.2 * k);
      const halo = ctx.createRadialGradient(cx, cy, r * 0.5, cx, cy, r * 2.2); halo.addColorStop(0, `rgba(94,196,182,${0.18 + 0.2 * k})`); halo.addColorStop(1, 'rgba(94,196,182,0)'); ctx.fillStyle = halo; ctx.fillRect(0, 0, W, H);
      this.dots.forEach((d) => { const rr2 = r * (1.25 + 0.2 * Math.sin(this.t * 0.7 + d.r * 9)), a = d.a + this.t * 0.06; ctx.fillStyle = `rgba(190,235,228,${0.25 + 0.35 * d.r})`; ctx.beginPath(); ctx.arc(cx + Math.cos(a) * rr2, cy + Math.sin(a) * rr2, 1.5 + d.r, 0, TAU); ctx.fill(); });
      const cg = ctx.createRadialGradient(cx - r * 0.3, cy - r * 0.3, r * 0.1, cx, cy, r); cg.addColorStop(0, '#bfeee6'); cg.addColorStop(1, '#3f9c8f'); ctx.fillStyle = cg; ctx.beginPath(); ctx.arc(cx, cy, r, 0, TAU); ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,.15)'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(cx, cy, M * 0.34, 0, TAU); ctx.stroke();
      ctx.fillStyle = '#0c1a18'; ctx.textAlign = 'center'; ctx.font = `600 ${Math.round(M * 0.06)}px Oswald, "Arial Narrow", sans-serif`; ctx.fillText(fin > 0 ? 'GLEICH GEHT ES WEITER' : txt.toUpperCase(), cx, cy + M * 0.02, r * 1.8);
      if (fin <= 0) { ctx.fillStyle = 'rgba(12,26,24,.7)'; ctx.font = `600 ${Math.round(M * 0.045)}px Inter, system-ui, sans-serif`; ctx.fillText(String(n), cx, cy + M * 0.08); }
      hudText(ctx, 'Schultern locker lassen.', W / 2, H - 40, 'center'); hudText(ctx, 'Durch die Nase ein, durch den Mund aus.', W / 2, H - 22, 'center');
    },
  };
  return g;
}
