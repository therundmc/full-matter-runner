// WebAudio sound system: sample playback for guns + procedural SFX, mixed through an arcade-style master chain.
//
// Bus chain (all created in _build):
//   sfx  -> HP 30 Hz -> low shelf (+bass punch) -> low-mid cut (350 Hz) -> presence (+3.2 kHz) -+
//   music -> HP 28 Hz -> duck (sidechain-style dip on loud SFX) -------------------------------+-> bus
//   bus -> filter (lowpass: slow-motion / death muffle) -> glue compressor -> soft clip (tanh,
//          oversampled) -> limiter (fast, high ratio) -> master -> destination
//
// Sounds are recipes (`_<name>` methods, or the MAT table for impacts) built from a few layers:
// transient tick + pitched-down thump + band-passed noise texture (+ optional inharmonic partials).
// META (per sound) drives voice admission: rate limit, per-name cap, global cap with voice stealing, music ducking.
import { rand, clamp } from '../engine/math.js';

const SAMPLES = {
  pistol: 'assets/sound/shots/pistol.wav',
  rifle: 'assets/sound/shots/rifle.wav',
  shotgun: 'assets/sound/shots/shotgun.wav',
  uzi: 'assets/sound/shots/cg1.wav',
};
// sounds that reuse another sample (+ their own layers / rate)
const SAMPLE_OF = { sniper: 'rifle' };
const MAX_VOICES = 4; // simultaneous sample voices per name
// one clean shot cut out of each recording: [offset s, duration s]. The rifle file is a whole burst,
// playing it per bullet stacked a dozen bursts on top of each other.
const SLICES = {
  pistol: [0, 0.5],
  rifle: [0, 0.27],
  shotgun: [0, 0.4],
  uzi: [0, 0.22],
  sniper: [0, 0.32],
};
const FADE = 0.06;
const MASTER_GAIN = 0.8;

// names that map onto another recipe
const ALIAS = { impact: 'stone' };

// synthesized layers added under each gun sample: sub thump [f0, f1, dur, vol], crack tick [Hz, vol],
// boom tail (low-passed noise) [Hz, dur, vol], playback rate of the sample
const GUN_LAYERS = {
  pistol: { sub: [150, 52, 0.1, 0.55], crack: [3800, 0.5] },
  uzi: { sub: [160, 70, 0.06, 0.35], crack: [4200, 0.4] },
  shotgun: { sub: [95, 28, 0.32, 1.0], crack: [2200, 0.7], boom: [1100, 0.22, 0.6] },
  rifle: { sub: [125, 48, 0.14, 0.55], crack: [5000, 0.8] },
  sniper: { sub: [80, 26, 0.5, 1.0], crack: [4500, 1.0], boom: [800, 0.75, 0.55], rate: 0.88 },
};

// Voice admission per sound. pri: steal priority; dur: seconds a play stays "active"; gap: min seconds
// between two plays (a louder one may break it); max: simultaneous plays of that name; duck: music gain dip (1 = none).
const DEFAULT_META = { pri: 1, dur: 0.3, gap: 0.025, max: 4, duck: 1 };
const META = {
  explosion: { pri: 4, dur: 1.6, gap: 0.12, max: 2, duck: 0.3 },
  gore: { pri: 3, dur: 0.7, gap: 0.05, max: 3, duck: 0.75 },
  death: { pri: 4, dur: 1.0, gap: 0.3, max: 1, duck: 0.4 },
  crumble: { pri: 3, dur: 1.0, gap: 0.08, max: 2, duck: 0.6 },
  tirePop: { pri: 3, dur: 0.8, gap: 0.1, max: 2, duck: 0.6 },
  doorSlam: { pri: 3, dur: 0.4, gap: 0.06, max: 2, duck: 0.7 },
  doorBreak: { pri: 3, dur: 0.6, gap: 0.1, max: 2, duck: 0.6 },
  glass: { pri: 2, dur: 0.5, gap: 0.05, max: 3, duck: 0.85 },
  splat: { pri: 2, dur: 0.25, gap: 0.03, max: 4 },
  slash: { pri: 2, dur: 0.25, gap: 0.04, max: 3 },
  punch: { pri: 2, dur: 0.2, gap: 0.04, max: 3 },
  silenced: { pri: 2, dur: 0.15, gap: 0, max: 4 },
  pistol: { pri: 3, dur: 0.5, gap: 0, max: 4, duck: 0.55 },
  uzi: { pri: 3, dur: 0.22, gap: 0, max: 4, duck: 0.7 },
  shotgun: { pri: 4, dur: 0.4, gap: 0, max: 3, duck: 0.4 },
  rifle: { pri: 3, dur: 0.27, gap: 0, max: 4, duck: 0.5 },
  sniper: { pri: 4, dur: 0.8, gap: 0, max: 2, duck: 0.35 },
  rocket: { pri: 3, dur: 0.6, gap: 0.1, max: 2, duck: 0.6 },
  ricochet: { pri: 1, dur: 0.25, gap: 0.05, max: 3 },
  shell: { pri: 0, dur: 0.25, gap: 0.04, max: 3 },
  crackle: { pri: 0, dur: 0.25, gap: 0.08, max: 2 },
  alert: { pri: 2, dur: 0.1, gap: 0.1, max: 2 },
  combo: { pri: 2, dur: 0.2, gap: 0.05, max: 2 },
  clear: { pri: 3, dur: 0.5, gap: 0.5, max: 1 },
  ui: { pri: 3, dur: 0.1, gap: 0.05, max: 2 },
};
const GLOBAL_SOFT_CAP = 14; // above this, only louder / higher priority sounds get in (stealing the quietest)
const GLOBAL_HARD_CAP = 22;

// Impact recipes per material. thump: [f0, f1, dur, wave], body: band-passed noise, snap: crack ticks
// (n ticks of f Hz within span s), partials: inharmonic ring [base Hz range, ratios, dur].
const MAT = {
  // wood knock + splinter
  wood: { thump: [260, 105, 0.075, 'triangle', 0.7], body: { f0: 950, f1: 420, q: 2.5, dur: 0.09, vol: 0.55 }, snap: { f: 2800, n: 3, span: 0.09, vol: 0.28 } },
  // metal clang: short inharmonic partials over a dull dent
  metal: { thump: [210, 90, 0.05, 'triangle', 0.5], partials: { f: [480, 880], ratios: [1, 2.76, 5.4, 8.93], dur: 0.2, vol: 0.2 }, snap: { f: 5000, n: 1, span: 0.01, vol: 0.45 } },
  // concrete / brick crack + grit
  stone: { thump: [230, 80, 0.06, 'sine', 0.8], body: { type: 'highpass', f0: 1800, f1: 800, q: 0.7, dur: 0.05, vol: 0.4 }, snap: { f: 3200, n: 5, span: 0.1, vol: 0.2 } },
  // hard plastic: light hollow tock
  plastic: { thump: [430, 190, 0.045, 'triangle', 0.55], body: { f0: 1600, f1: 900, q: 2, dur: 0.05, vol: 0.4 }, snap: { f: 3600, n: 1, span: 0.01, vol: 0.3 } },
  // fabric / rubber: dull soft thud
  soft: { thump: [140, 58, 0.09, 'sine', 0.85], body: { type: 'lowpass', f0: 700, f1: 200, q: 0.7, dur: 0.08, vol: 0.4 } },
  // ceramic: brittle crack with a short high ring
  ceramic: { thump: [320, 140, 0.04, 'triangle', 0.4], partials: { f: [1700, 2300], ratios: [1, 2.32, 3.9], dur: 0.12, vol: 0.12 }, snap: { f: 4200, n: 4, span: 0.08, vol: 0.25 } },
  // single glass pane tick (not a shatter)
  glassHit: { thump: [380, 200, 0.03, 'triangle', 0.3], partials: { f: [3200, 4600], ratios: [1, 1.7, 2.6], dur: 0.1, vol: 0.1 }, snap: { f: 6000, n: 2, span: 0.03, vol: 0.3 } },
  // body part hitting something: dull wet slap
  flesh: { thump: [115, 45, 0.12, 'sine', 1.0], body: { type: 'lowpass', f0: 1100, f1: 220, q: 0.8, dur: 0.1, vol: 0.55 }, snap: { f: 1700, n: 1, span: 0.01, vol: 0.2 } },
};

class AudioSystem {
  constructor() {
    this.ctx = null;
    this.buffers = {};
    this.voices = {};
    this.chokes = new WeakMap(); // emitter -> its last sample voice (a new shot cuts the previous tail)
    this.listener = { x: 0, y: 0 };
    this.muted = false;
    this.active = [];   // live procedural/layered plays, for the global cap and voice stealing
    this.lastPlay = {}; // name -> { t, vol } of the last admitted play
    this.duckUntil = 0;
    this.duckDepth = 1;
    this.pv = 1;        // per-play pitch factor (set in play, read by the synthesis helpers)
  }

  // must be called from a user gesture
  async unlock() {
    if (this.ctx) { if (this.ctx.state === 'suspended') await this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this._build(this.ctx = new AC());
    await Promise.all(Object.entries(SAMPLES).map(async ([k, url]) => {
      try {
        const res = await fetch(url);
        this.buffers[k] = await this.ctx.decodeAudioData(await res.arrayBuffer());
      } catch (e) { console.warn('sound load failed', k, e); }
    }));
  }

  // bus chain + shared buffers (see the header)
  _build(ctx) {
    const param = (n, v) => { for (const k in v) n[k].value = v[k]; return n; };
    const bq = (type, frequency, Q, gain = 0) => {
      const f = ctx.createBiquadFilter();
      f.type = type; f.frequency.value = frequency; f.Q.value = Q; f.gain.value = gain;
      return f;
    };
    const chain = (...nodes) => nodes.reduce((a, b) => (a.connect(b), b));

    this.sfx = ctx.createGain();
    this.sfx.gain.value = 0.95;
    this.music = ctx.createGain();
    this.music.gain.value = 0.42;
    this.duck = ctx.createGain();
    this.bus = ctx.createGain();

    // sfx EQ: no useless sub, a bit of bass punch, cleaner low-mids, a little presence
    chain(this.sfx, bq('highpass', 30, 0.7), bq('lowshelf', 110, 0.7, 2.5), bq('peaking', 350, 0.9, -3), bq('peaking', 3200, 0.8, 2), this.bus);
    chain(this.music, bq('highpass', 28, 0.7), this.duck, this.bus);

    this.filter = bq('lowpass', 20000, 0.7);
    this.comp = ctx.createDynamicsCompressor(); // glue
    param(this.comp, { threshold: -18, knee: 10, ratio: 3, attack: 0.008, release: 0.18 });
    this.shaper = ctx.createWaveShaper();       // soft clip: tames peaks, adds weight
    const pre = ctx.createGain();
    pre.gain.value = 0.85;
    const K = 1.4, curve = new Float32Array(2049);
    for (let i = 0; i < curve.length; i++) curve[i] = Math.tanh(K * (i / 1024 - 1)) / Math.tanh(K);
    this.shaper.curve = curve;
    this.shaper.oversample = '4x';
    this.limiter = ctx.createDynamicsCompressor(); // brickwall-ish
    param(this.limiter, { threshold: -3, knee: 0, ratio: 20, attack: 0.001, release: 0.08 });
    this.master = ctx.createGain();
    this.master.gain.value = MASTER_GAIN;
    chain(this.bus, this.filter, this.comp, pre, this.shaper, this.limiter, this.master, ctx.destination);

    // shared noise: white (texture) and brown (rumble), 2 s each, looped by the sources
    const len = ctx.sampleRate * 2;
    this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
    this.brown = ctx.createBuffer(1, len, ctx.sampleRate);
    const w = this.noise.getChannelData(0), b = this.brown.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      w[i] = Math.random() * 2 - 1;
      last = (last + 0.04 * w[i]) / 1.04;
      b[i] = last * 6;
    }
  }

  toggleMute() {
    this.muted = !this.muted;
    if (this.master) this.master.gain.setTargetAtTime(this.muted ? 0 : MASTER_GAIN, this.ctx.currentTime, 0.05);
  }

  // 0 = clear, 1 = heavily muffled (death / slow motion)
  setMuffle(amount) {
    if (!this.ctx) return;
    const f = 20000 * Math.pow(1 - clamp(amount, 0, 0.97), 3) + 300;
    this.filter.frequency.setTargetAtTime(f, this.ctx.currentTime, 0.08);
  }

  // ---- routing ----
  // loudness / pan / distance of an emitter relative to the listener
  _spatial(opts) {
    let vol = opts.vol ?? 1, pan = 0, far = 0;
    if (opts.x !== undefined) {
      const dx = opts.x - this.listener.x, dy = opts.y - this.listener.y;
      const d = Math.hypot(dx, dy);
      vol *= clamp(1 - d / 1500, 0.08, 1);
      pan = clamp(dx / 700, -0.8, 0.8);
      far = clamp((d - 350) / 1150, 0, 1); // far sounds lose their highs
    }
    return { vol, pan, far };
  }

  // per-play gain node (+ distance lowpass, + pan); `o._n` counts live sources so the chain is disconnected at the end
  _out(sp, dest) {
    const ctx = this.ctx, g = ctx.createGain();
    g.gain.value = sp.vol;
    const chain = [g];
    if (sp.far > 0.05) {
      const lp = ctx.createBiquadFilter();
      lp.frequency.value = 600 + 15400 * (1 - sp.far) ** 2;
      chain.push(lp);
    }
    if (ctx.createStereoPanner && Math.abs(sp.pan) > 0.02) {
      const p = ctx.createStereoPanner();
      p.pan.value = sp.pan;
      chain.push(p);
    }
    chain.forEach((n, i) => n.connect(chain[i + 1] || dest));
    g._chain = chain;
    g._n = 0;
    return g;
  }

  // a source of voice `o` ended: free the whole chain once the last one is gone
  _release(o, ...nodes) {
    nodes.forEach((n) => n.disconnect());
    if (--o._n === 0) o._chain.forEach((n) => n.disconnect());
  }

  // music dip: fast attack, ~250 ms release (cheap: one param schedule, skipped if an equal/deeper dip is running)
  _duck(depth, hold = 0.04) {
    const now = this.ctx.currentTime, g = this.duck.gain;
    if (now < this.duckUntil && depth >= this.duckDepth) { this.duckUntil = Math.max(this.duckUntil, now + hold); return; }
    this.duckDepth = depth;
    this.duckUntil = now + hold;
    g.cancelScheduledValues(now);
    g.setTargetAtTime(depth, now, 0.006);
    g.setTargetAtTime(1, now + hold, 0.09);
  }

  // rate limit + per-name cap + global cap with voice stealing; returns the "active" entry or null
  _admit(name, vol, dur) {
    const meta = META[name] || DEFAULT_META, now = this.ctx.currentTime, act = this.active;
    for (let i = act.length - 1; i >= 0; i--) if (act[i].end <= now) act.splice(i, 1);
    const last = this.lastPlay[name];
    if (last && now - last.t < meta.gap && vol < last.vol * 1.4) return null;
    let same = 0;
    for (const a of act) if (a.name === name) same++;
    if (same >= meta.max) return null;
    if (act.length >= GLOBAL_SOFT_CAP) {
      let weakest = null; // quietest of the lowest priority
      for (const a of act) if (!weakest || a.pri < weakest.pri || (a.pri === weakest.pri && a.vol < weakest.vol)) weakest = a;
      const better = meta.pri > weakest.pri || (meta.pri === weakest.pri && vol > weakest.vol * 1.5);
      if (!better || act.length >= GLOBAL_HARD_CAP && meta.pri <= weakest.pri) return null;
      weakest.gain.gain.cancelScheduledValues(now);
      weakest.gain.gain.setTargetAtTime(0, now, 0.01); // steal: fade the old one out
      act.splice(act.indexOf(weakest), 1);
    }
    this.lastPlay[name] = { t: now, vol };
    const entry = { name, pri: meta.pri, vol, end: now + (dur ?? meta.dur), gain: null };
    act.push(entry);
    if (meta.duck < 1) this._duck(meta.duck);
    return entry;
  }

  play(name, opts = {}) {
    if (!this.ctx || this.ctx.state !== 'running') return;
    name = ALIAS[name] || name;
    const sampleKey = SAMPLE_OF[name] || name, buf = this.buffers[sampleKey];
    const recipe = !buf && !MAT[name] && this['_' + name];
    if (!buf && !MAT[name] && !recipe) return;
    const sp = this._spatial(opts);
    if (sp.vol < 0.015) return; // inaudible
    const slice = buf && SLICES[name];
    const rate = buf ? (opts.rate ?? 1) * (GUN_LAYERS[name]?.rate ?? 1) * rand(0.94, 1.06) : 1;
    const entry = this._admit(name, sp.vol, buf ? (slice ? slice[1] : buf.duration) / rate : undefined);
    if (!entry) return;
    if (buf) return this._sample(name, buf, rate, sp, opts, entry);
    const o = entry.gain = this._out(sp, opts.dest || this.sfx);
    o.gain.value = sp.vol * rand(0.88, 1.1); // never twice the same level
    this.pv = rand(0.93, 1.07);
    const v = clamp(opts.vol ?? 1, 0.1, 1.5); // how hard it was hit
    if (MAT[name]) this._material(o, MAT[name], v);
    else recipe.call(this, o, opts, v);
  }

  // one-shot sample playback: sliced, faded out, choked per emitter (opts.choke), voice-limited per sound,
  // with a synthesized sub / crack layer under it
  _sample(name, buf, rate, sp, opts, entry) {
    const ctx = this.ctx, now = ctx.currentTime;
    const [offset, len] = SLICES[name] || [0, buf.duration];
    const dur = len / rate;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = rate;
    const out = entry.gain = this._out({ ...sp, vol: sp.vol * 0.75 }, opts.dest || this.sfx);
    const env = ctx.createGain();
    env.gain.setValueAtTime(1, now);
    env.gain.setValueAtTime(1, now + Math.max(0, dur - FADE));
    env.gain.linearRampToValueAtTime(0, now + dur);
    src.connect(env);
    env.connect(out);
    src.start(now, offset, len + 0.02);
    out._n = 1;
    const voice = { src, env };
    const kill = (v) => {
      v.env.gain.cancelScheduledValues(now);
      v.env.gain.setTargetAtTime(0, now, 0.008);
      try { v.src.stop(now + 0.05); } catch (e) { /* already stopped */ }
    };
    if (opts.choke) {
      const prev = this.chokes.get(opts.choke);
      if (prev) kill(prev);
      this.chokes.set(opts.choke, voice);
    }
    const list = this.voices[name] || (this.voices[name] = []);
    list.push(voice);
    while (list.length > MAX_VOICES) kill(list.shift());
    src.onended = () => {
      const i = list.indexOf(voice);
      if (i >= 0) list.splice(i, 1);
      this._release(out, src, env);
    };
    this._gunLayers(out, GUN_LAYERS[name]);
  }

  // punch under the recorded shot: tuned sub thump, crack transient, optional boom tail
  _gunLayers(o, L) {
    if (!L) return;
    this.pv = 1; // layers stay tuned, only the level varies
    const g = rand(0.9, 1.1);
    this._thump(o, { f0: L.sub[0], f1: L.sub[1], dur: L.sub[2], vol: L.sub[3] * g });
    this._tick(o, { f: L.crack[0], vol: L.crack[1] * g, dur: 0.014 });
    if (L.boom) this._noiseBurst(o, { src: 'brown', type: 'lowpass', f0: L.boom[0], f1: 90, dur: L.boom[1], vol: L.boom[2] * g, attack: 0.004 });
  }

  // ---- synthesis primitives (all honour the per-play pitch factor this.pv) ----
  // filtered noise burst. src: 'white' | 'brown'; type 'none' skips the filter
  _noiseBurst(o, { src = 'white', dur = 0.2, type = 'bandpass', f0 = 1000, f1 = f0, q = 1, vol = 1, delay = 0, attack = 0.002 }) {
    const ctx = this.ctx, t = ctx.currentTime + delay;
    const s = ctx.createBufferSource();
    s.buffer = src === 'brown' ? this.brown : this.noise;
    s.loop = true;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, vol), t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    let filt = null;
    if (type === 'none') s.connect(g);
    else {
      filt = ctx.createBiquadFilter();
      filt.type = type;
      filt.Q.value = q;
      filt.frequency.setValueAtTime(f0 * this.pv, t);
      filt.frequency.exponentialRampToValueAtTime(Math.max(20, f1 * this.pv), t + dur);
      s.connect(filt); filt.connect(g);
    }
    g.connect(o);
    o._n++;
    s.onended = () => this._release(o, s, g, ...(filt ? [filt] : []));
    s.start(t, Math.random() * 1.5);
    s.stop(t + dur + 0.03);
  }

  // oscillator with an exponential pitch + amplitude envelope (fdur: how long the pitch glides)
  _tone(o, { type = 'sine', f0 = 440, f1 = f0, dur = 0.2, vol = 0.5, delay = 0, attack = 0.001, fdur = dur }) {
    const ctx = this.ctx, t = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(f0 * this.pv, t);
    osc.frequency.exponentialRampToValueAtTime(Math.max(10, f1 * this.pv), t + fdur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g); g.connect(o);
    o._n++;
    osc.onended = () => this._release(o, osc, g);
    osc.start(t);
    osc.stop(t + dur + 0.03);
  }

  // body of a hit: pitched-down sine/triangle with a fast pitch drop (the drop is over in ~40% of the decay)
  _thump(o, { f0 = 150, f1 = 50, dur = 0.1, vol = 0.8, delay = 0, type = 'sine' }) {
    this._tone(o, { type, f0, f1, dur, vol, delay, attack: 0.002, fdur: dur * 0.4 });
  }

  // a few ms of band-passed noise: the transient / click of a hit
  _tick(o, { f = 3000, dur = 0.01, vol = 0.5, delay = 0, q = 1.2 }) {
    this._noiseBurst(o, { type: 'bandpass', f0: f, q, dur, vol, delay, attack: 0.0006 });
  }

  // inharmonic partials ringing out (metal, ceramic, glass, brass): higher partials die faster
  _partials(o, { f, ratios, dur = 0.2, vol = 0.2, delay = 0 }) {
    ratios.forEach((r, i) => this._tone(o, {
      f0: f * r * rand(0.985, 1.015), dur: dur / (1 + i * 0.5), vol: vol / (1 + i * 0.45), delay, attack: 0.0008,
    }));
  }

  // data-driven impact: thump + noise body + crack ticks + optional partials; harder hits (v) are louder / brighter
  _material(o, m, v) {
    const k = 0.45 + 0.55 * v;
    if (m.thump) this._thump(o, { f0: m.thump[0], f1: m.thump[1], dur: m.thump[2], type: m.thump[3], vol: m.thump[4] * k });
    if (m.body) {
      const b = m.body, bright = 0.7 + 0.3 * v;
      this._noiseBurst(o, { type: b.type || 'bandpass', f0: b.f0 * bright, f1: b.f1, q: b.q, dur: b.dur, vol: b.vol * k });
    }
    if (m.snap) for (let i = 0; i < m.snap.n; i++) this._tick(o, { f: m.snap.f * rand(0.8, 1.25), q: 4, dur: 0.012, vol: m.snap.vol * k, delay: i ? rand(0.008, m.snap.span) : 0 });
    if (m.partials) this._partials(o, { f: rand(...m.partials.f), ratios: m.partials.ratios, dur: m.partials.dur, vol: m.partials.vol * k });
  }

  // ---- procedural SFX: flesh and melee ----
  // fist / blunt: thud + knuckle crack, short and dry
  _punch(o, _, v) {
    this._thump(o, { f0: 155, f1: 46, dur: 0.12, vol: 1.0 });
    this._tick(o, { f: 2400, q: 1.5, dur: 0.02, vol: 0.55 * v });
    this._noiseBurst(o, { type: 'lowpass', f0: 1300, f1: 220, dur: 0.07, vol: 0.5 });
    this._thump(o, { f0: 340, f1: 150, dur: 0.035, type: 'triangle', vol: 0.3, delay: 0.004 }); // bone
  }
  // bullet in flesh: wet thump
  _splat(o) {
    this._thump(o, { f0: 125, f1: 42, dur: 0.14, vol: 0.9 });
    this._noiseBurst(o, { f0: 900, f1: 280, q: 1.2, dur: 0.14, vol: 0.55 });
    this._noiseBurst(o, { f0: 1900, f1: 500, q: 3, dur: 0.07, vol: 0.28, delay: 0.015 });
    for (let i = 0; i < 2; i++) this._tick(o, { f: rand(1200, 2400), q: 3, dur: 0.02, vol: 0.18, delay: rand(0.06, 0.18) });
  }
  // killing blow: heavy wet burst, bone crack, droplets
  _gore(o) {
    this._splat(o);
    this._thump(o, { f0: 78, f1: 28, dur: 0.34, vol: 0.9 });
    this._noiseBurst(o, { src: 'brown', type: 'lowpass', f0: 800, f1: 110, dur: 0.38, vol: 0.9, delay: 0.015 });
    this._tick(o, { f: 2200, q: 3, dur: 0.012, vol: 0.4, delay: 0.01 });
    for (let i = 0; i < 4; i++) this._tick(o, { f: rand(1400, 3000), q: 4, dur: 0.02, vol: rand(0.1, 0.25), delay: rand(0.08, 0.4) });
  }
  // blade: steel swish then a wet slice
  _slash(o) {
    this._noiseBurst(o, { f0: 5200, f1: 1600, q: 3, dur: 0.07, vol: 0.4 });
    this._noiseBurst(o, { f0: 2200, f1: 700, q: 2, dur: 0.11, vol: 0.5, delay: 0.02 });
    this._thump(o, { f0: 140, f1: 55, dur: 0.1, vol: 0.55, delay: 0.02 });
    this._tick(o, { f: 1500, q: 3, dur: 0.02, vol: 0.2, delay: 0.07 });
  }
  _death(o) {
    this._thump(o, { f0: 105, f1: 26, dur: 0.7, vol: 0.9 });
    this._noiseBurst(o, { src: 'brown', type: 'lowpass', f0: 600, f1: 60, dur: 0.8, vol: 0.9 });
    this._gore(o);
  }
  // body hitting the ground
  _bodyFall(o) {
    this._thump(o, { f0: 95, f1: 38, dur: 0.18, vol: 1.0 });
    this._noiseBurst(o, { type: 'lowpass', f0: 800, f1: 150, dur: 0.12, vol: 0.55 });
    this._thump(o, { f0: 70, f1: 36, dur: 0.12, vol: 0.5, delay: 0.09 });
  }

  // ---- breaking things ----
  // shatter: crack, body, then layered high tinkles and shards that thin out as they fall
  _glass(o, _, v) {
    this._tick(o, { f: 4500, q: 1, dur: 0.012, vol: 0.7 });
    this._noiseBurst(o, { f0: 3800, f1: 2200, q: 0.8, dur: 0.12, vol: 0.5 * v });
    this._thump(o, { f0: 330, f1: 110, dur: 0.06, type: 'triangle', vol: 0.4 });
    for (let i = 0; i < 5; i++) {
      const t = 0.02 + 0.26 * Math.random() ** 1.6;
      this._tone(o, { f0: rand(3200, 9000), dur: rand(0.05, 0.13), vol: rand(0.05, 0.1), delay: t, attack: 0.0008 });
    }
    for (let i = 0; i < 3; i++) this._noiseBurst(o, { type: 'highpass', f0: rand(4000, 7000), q: 1, dur: rand(0.03, 0.08), vol: rand(0.12, 0.3), delay: 0.04 + 0.3 * Math.random() ** 1.4 });
  }
  // rubble: sub, crack, then a rain of grit and stones thinning out
  _crumble(o) {
    this._thump(o, { f0: 65, f1: 26, dur: 0.45, vol: 1.0 });
    this._noiseBurst(o, { f0: 1400, f1: 500, q: 1, dur: 0.07, vol: 0.7 });
    this._noiseBurst(o, { src: 'brown', type: 'lowpass', f0: 900, f1: 90, dur: 0.7, vol: 1.0, attack: 0.006 });
    for (let i = 0; i < 8; i++) this._tick(o, { f: rand(500, 2200), q: 3, dur: rand(0.03, 0.07), vol: rand(0.15, 0.4) * (1 - i / 12), delay: 0.06 + 0.6 * (i / 8) ** 1.4 + rand(0, 0.04) });
    for (let i = 0; i < 2; i++) this._thump(o, { f0: rand(120, 190), f1: 60, dur: 0.07, vol: 0.4, delay: rand(0.15, 0.5) });
  }
  _doorBreak(o) {
    this._thump(o, { f0: 120, f1: 40, dur: 0.3, vol: 1.0 });
    this._noiseBurst(o, { f0: 1200, f1: 500, q: 1.5, dur: 0.09, vol: 0.7 });
    for (let i = 0; i < 5; i++) this._tick(o, { f: rand(1800, 3500), q: 5, dur: 0.012, vol: rand(0.2, 0.45), delay: rand(0, 0.12) });
    this._thump(o, { f0: 180, f1: 70, dur: 0.1, type: 'triangle', vol: 0.5, delay: 0.14 });
  }
  _explosion(o) {
    this._thump(o, { f0: 95, f1: 20, dur: 1.1, vol: 1.3 });                               // sub drop
    this._tick(o, { f: 3500, q: 0.6, dur: 0.08, vol: 1.0 });                              // crack
    this._noiseBurst(o, { src: 'brown', type: 'lowpass', f0: 2600, f1: 70, dur: 0.75, vol: 1.5, attack: 0.004 }); // blast body
    this._noiseBurst(o, { f0: 450, f1: 200, q: 0.7, dur: 0.35, vol: 0.5 });
    for (let i = 0; i < 9; i++) this._tick(o, { f: rand(600, 2600), q: 3, dur: rand(0.03, 0.07), vol: rand(0.15, 0.4) * (1 - i / 14), delay: 0.2 + 0.9 * (i / 9) ** 1.3 + rand(0, 0.05) }); // debris rain
    for (let i = 0; i < 3; i++) this._thump(o, { f0: rand(110, 170), f1: 55, dur: 0.08, vol: 0.35, delay: rand(0.25, 0.9) });
  }
  _tirePop(o) {
    this._thump(o, { f0: 150, f1: 42, dur: 0.18, vol: 1.0 });
    this._noiseBurst(o, { type: 'lowpass', f0: 3000, f1: 200, dur: 0.13, vol: 1.1, attack: 0.002 });
    this._noiseBurst(o, { type: 'highpass', f0: 3500, f1: 2000, dur: 0.8, vol: 0.2, delay: 0.05, attack: 0.04 }); // hiss
  }
  _carHit(o, _, v) {
    this._thump(o, { f0: rand(240, 320), f1: 100, dur: 0.1, type: 'triangle', vol: 0.6 });
    this._partials(o, { f: rand(380, 520), ratios: [1, 2.5, 4.1], dur: 0.14, vol: 0.2 * v });
    this._tick(o, { f: 3000, q: 2, dur: 0.012, vol: 0.4 });
  }

  // ---- doors, movement ----
  _door(o) {
    this._thump(o, { type: 'triangle', f0: 200, f1: 82, dur: 0.14, vol: 0.85 });
    this._noiseBurst(o, { f0: 700, f1: 250, q: 1.2, dur: 0.08, vol: 0.5 });
    this._tick(o, { f: 2400, q: 3, dur: 0.01, vol: 0.3, delay: 0.012 }); // latch
  }
  _doorSlam(o) {
    this._thump(o, { f0: 90, f1: 32, dur: 0.32, vol: 1.1 });
    this._door(o);
    this._noiseBurst(o, { src: 'brown', type: 'lowpass', f0: 900, f1: 120, dur: 0.22, vol: 0.7 });
    for (let i = 0; i < 2; i++) this._tick(o, { f: rand(1500, 2600), q: 5, dur: 0.01, vol: 0.2, delay: rand(0.06, 0.16) }); // rattle
  }
  _creak(o) {
    const f = rand(250, 400);
    this._noiseBurst(o, { f0: f, f1: f * 1.25, q: 14, dur: 0.3, vol: 0.35, attack: 0.08 });
    this._noiseBurst(o, { f0: f * 1.6, f1: f * 1.9, q: 18, dur: 0.22, vol: 0.18, attack: 0.06, delay: 0.04 });
  }
  // hands on the sill, then the landing
  _vault(o) {
    this._noiseBurst(o, { f0: 500, f1: 1500, q: 1.5, dur: 0.16, vol: 0.35, attack: 0.04 });
    this._tick(o, { f: 1400, q: 2, dur: 0.02, vol: 0.3, delay: 0.1 });
    this._thump(o, { f0: 115, f1: 46, dur: 0.12, vol: 0.5, delay: 0.26 });
    this._noiseBurst(o, { type: 'lowpass', f0: 900, f1: 200, dur: 0.08, vol: 0.3, delay: 0.26 });
  }
  _slide(o) {
    this._noiseBurst(o, { f0: 900, f1: 1900, q: 2.5, dur: 0.3, vol: 0.4, attack: 0.03 });
    this._thump(o, { f0: 110, f1: 55, dur: 0.1, vol: 0.3, delay: 0.32 });
  }
  _step(o) {
    this._thump(o, { f0: 120, f1: 60, dur: 0.06, vol: 0.4 });
    this._noiseBurst(o, { type: 'lowpass', f0: 1200, f1: 300, dur: 0.05, vol: 0.3 });
  }
  _throw(o) { this._noiseBurst(o, { f0: 500, f1: 2400, q: 2, dur: 0.2, vol: 0.4, attack: 0.05 }); }
  _swing(o) { this._noiseBurst(o, { f0: 1800, f1: 500, q: 2, dur: 0.15, vol: 0.45, attack: 0.03 }); }

  // ---- guns: non-sample sounds, reloads, casings ----
  // a round whining off a hard surface
  _ricochet(o) {
    this._tick(o, { f: 4000, q: 0.8, dur: 0.012, vol: 0.5 });
    this._tone(o, { type: 'sawtooth', f0: rand(3000, 3800), f1: rand(700, 1100), dur: 0.2, vol: 0.07, delay: 0.008 });
    this._tone(o, { f0: rand(2400, 3000), f1: 800, dur: 0.14, vol: 0.05, delay: 0.01 });
  }
  // silenced: dry "pfft" + mechanical tick, no sample
  _silenced(o) {
    this._noiseBurst(o, { f0: 1800, f1: 600, q: 0.9, dur: 0.07, vol: 0.8 });
    this._thump(o, { f0: 210, f1: 62, dur: 0.09, vol: 0.6 });
    this._tick(o, { f: 3600, q: 2, dur: 0.01, vol: 0.3, delay: 0.035 });
  }
  // empty click: dry hammer fall
  _click(o) {
    this._tick(o, { f: 2800, q: 2, dur: 0.008, vol: 0.5 });
    this._tone(o, { type: 'square', f0: 1400, f1: 900, dur: 0.018, vol: 0.07 });
    this._thump(o, { f0: 220, f1: 120, dur: 0.03, vol: 0.3 });
  }
  _magOut(o) {
    this._tick(o, { f: 3200, q: 2, dur: 0.012, vol: 0.25 });
    this._noiseBurst(o, { f0: 3000, f1: 1600, q: 2, dur: 0.06, vol: 0.25, delay: 0.015 });
    this._thump(o, { f0: 210, f1: 100, dur: 0.05, type: 'triangle', vol: 0.25, delay: 0.1 }); // drops on the floor
    this._tick(o, { f: 2200, q: 3, dur: 0.012, vol: 0.2, delay: 0.1 });
  }
  _magIn(o) {
    this._thump(o, { f0: 320, f1: 130, dur: 0.06, vol: 0.7 });
    this._noiseBurst(o, { f0: 1700, f1: 900, q: 1.5, dur: 0.05, vol: 0.5 });
    this._partials(o, { f: 2300, ratios: [1, 2.7], dur: 0.05, vol: 0.1, delay: 0.025 });
  }
  _rack(o) {
    this._tick(o, { f: 4200, q: 1, dur: 0.02, vol: 0.3 });
    this._partials(o, { f: 900, ratios: [1, 2.6], dur: 0.04, vol: 0.1 });
    this._tick(o, { f: 3200, q: 1, dur: 0.03, vol: 0.35, delay: 0.09 });
    this._thump(o, { f0: 260, f1: 120, dur: 0.04, type: 'triangle', vol: 0.4, delay: 0.09 });
  }
  _shellIn(o) {
    this._tick(o, { f: 2400, q: 2, dur: 0.012, vol: 0.4 });
    this._partials(o, { f: 1700, ratios: [1, 2.4], dur: 0.06, vol: 0.14 });
    this._thump(o, { f0: 330, f1: 170, dur: 0.03, vol: 0.3 });
  }
  _ammo(o) {
    for (let i = 0; i < 4; i++) this._partials(o, { f: rand(3500, 5000), ratios: [1, 2.3], dur: 0.05, vol: 0.08, delay: i * 0.035 + rand(0, 0.02) });
    this._thump(o, { f0: 240, f1: 140, dur: 0.04, vol: 0.3 });
  }
  // brass casing bouncing on the floor
  _shell(o) {
    const f = rand(3800, 5200);
    for (let i = 0; i < 3; i++) this._partials(o, { f: f * (1 - i * 0.04), ratios: [1, 2.3], dur: 0.06, vol: 0.12 * (1 - i * 0.3), delay: i * rand(0.05, 0.075) });
  }

  // ---- fire, alarm, pickups, UI ----
  _rocket(o) {
    this._noiseBurst(o, { f0: 600, f1: 2500, q: 1, dur: 0.5, vol: 0.7, attack: 0.02 });
    this._noiseBurst(o, { src: 'brown', type: 'lowpass', f0: 600, f1: 150, dur: 0.5, vol: 0.6 });
    this._thump(o, { f0: 130, f1: 55, dur: 0.3, vol: 0.5 });
  }
  _alarm(o) {
    this._tone(o, { type: 'square', f0: 950, dur: 0.17, vol: 0.1 });
    this._tone(o, { type: 'square', f0: 1250, dur: 0.17, vol: 0.1, delay: 0.2 });
  }
  _crackle(o) {
    for (let i = 0; i < 3; i++) this._tick(o, { f: rand(1500, 4000), q: 5, dur: 0.02, vol: rand(0.1, 0.3), delay: rand(0, 0.2) });
  }
  _ignite(o) {
    this._noiseBurst(o, { src: 'brown', type: 'lowpass', f0: 300, f1: 2200, dur: 0.5, vol: 1.1, attack: 0.12 });
    this._thump(o, { f0: 60, f1: 85, dur: 0.4, vol: 0.5 });
  }
  _pickup(o) {
    this._tick(o, { f: 3000, q: 1.5, dur: 0.012, vol: 0.3 });
    this._tone(o, { type: 'triangle', f0: 520, dur: 0.06, vol: 0.14 });
    this._tone(o, { type: 'triangle', f0: 1040, dur: 0.08, vol: 0.14, delay: 0.05 });
  }
  _alert(o) { this._tone(o, { type: 'square', f0: 1320, f1: 1500, dur: 0.06, vol: 0.06 }); }
  _combo(o, opts) {
    const base = 440 * Math.pow(2, Math.min(opts.n || 1, 12) / 12);
    this._tone(o, { type: 'square', f0: base, dur: 0.06, vol: 0.08 });
    this._tone(o, { type: 'square', f0: base * 1.5, dur: 0.1, vol: 0.08, delay: 0.05 });
  }
  _clear(o) {
    [523, 659, 784, 1046].forEach((f, i) => this._tone(o, { type: 'square', f0: f, dur: 0.18, vol: 0.12, delay: i * 0.09 }));
  }
  _ui(o) {
    this._tick(o, { f: 3000, q: 1.5, dur: 0.01, vol: 0.2 });
    this._tone(o, { type: 'square', f0: 880, f1: 660, dur: 0.06, vol: 0.1 });
  }
}

const Audio = new AudioSystem();
export default Audio;
