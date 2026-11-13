// WebAudio sound system: recorded gunshots (SAMPLES) over synthesized bass / room layers, everything else
// synthesized, mixed through a punchy master chain.
//
// Bus chain (all created in _build):
//   guns -> drive (tanh "mic preamp" saturation) -> sfx        (synthesized shots)
//   shots -> HP 35 Hz -> low shelf (weight) -> high shelf (air) -> bus   (recorded shots: no drive, full crack)
//   sfx  -> HP 30 Hz -> low shelf (+bass punch) -> low-mid cut (350 Hz) -> presence (+3.2 kHz) -+
//   music -> HP 28 Hz -> duck (sidechain-style dip on loud SFX) -------------------------------+-> bus
//   bus -> filter (lowpass: slow-motion / death muffle) -> glue compressor -> soft clip (tanh,
//          oversampled) -> limiter (fast, high ratio) -> master -> destination
//
// Sounds are recipes: GUNS (gunshots, see _gun), MAT (impacts, see _material) or `_<name>` methods, built from
// a few layers: transient tick + pitched-down thump + band-passed noise texture (+ optional inharmonic partials).
// META (per sound) drives voice admission: rate limit, per-name cap, global cap with voice stealing, music ducking,
// and how far it carries. Reload / handling sounds take `weapon` (a weapon id) to pick that gun's mechanics (ARMS).
import { rand, clamp } from '../engine/math.js';

const MASTER_GAIN = 0.8;

// names that map onto another recipe
const ALIAS = { impact: 'stone' };

// Voice admission per sound. pri: steal priority; dur: seconds a play stays "active"; gap: min seconds
// between two plays (a louder one may break it); max: simultaneous plays of that name; duck: music gain dip
// (1 = none); reach: px at which it fades out (loud sounds carry further, losing their highs on the way);
// gain: mix trim (handling noises sit well under the shots).
const DEFAULT_META = { pri: 1, dur: 0.3, gap: 0.025, max: 4, duck: 1 };
const META = {
  explosion: { pri: 4, dur: 2.6, gap: 0.12, max: 2, duck: 0.3, reach: 3400 },
  alarm: { pri: 2, dur: 0.4, gap: 0.2, max: 2, reach: 2600 },
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
  pistol: { pri: 3, dur: 0.45, gap: 0, max: 4, duck: 0.55, reach: 2600 },
  uzi: { pri: 3, dur: 0.25, gap: 0, max: 4, duck: 0.7, reach: 2400 },
  silenced: { pri: 2, dur: 0.2, gap: 0, max: 4, reach: 1100 },
  shotgun: { pri: 4, dur: 1.0, gap: 0, max: 3, duck: 0.4, reach: 3000 },
  rifle: { pri: 3, dur: 0.7, gap: 0, max: 4, duck: 0.5, reach: 3000 },
  sniper: { pri: 4, dur: 1.6, gap: 0, max: 2, duck: 0.35, reach: 3400 },
  rocket: { pri: 3, dur: 0.9, gap: 0.1, max: 2, duck: 0.5, reach: 3000 },
  ricochet: { pri: 1, dur: 0.25, gap: 0.05, max: 3 },
  shell: { pri: 0, dur: 0.35, gap: 0.03, max: 4 },
  magOut: { pri: 1, dur: 0.5, gap: 0.05, max: 3, gain: 0.9 },
  magIn: { pri: 1, dur: 0.2, gap: 0.05, max: 3, gain: 0.9 },
  rack: { pri: 1, dur: 0.5, gap: 0.05, max: 3, gain: 0.9 },
  shellIn: { pri: 1, dur: 0.15, gap: 0.03, max: 3, gain: 0.9 },
  handle: { pri: 1, dur: 0.2, gap: 0.05, max: 3, gain: 0.9 },
  pickup: { pri: 1, dur: 0.2, gap: 0.05, max: 3, gain: 0.5 },
  click: { pri: 1, dur: 0.1, gap: 0.05, max: 3, gain: 0.8 },
  crackle: { pri: 0, dur: 0.25, gap: 0.08, max: 2 },
  alert: { pri: 2, dur: 0.1, gap: 0.1, max: 2 },
  combo: { pri: 2, dur: 0.2, gap: 0.05, max: 2 },
  clear: { pri: 3, dur: 0.5, gap: 0.5, max: 1 },
  ui: { pri: 3, dur: 0.1, gap: 0.05, max: 2 },
  passby: { pri: 0, dur: 3, gap: 0.15, max: 3 },
  splash: { pri: 0, dur: 0.2, gap: 0.06, max: 3, gain: 0.5 },
};
const GLOBAL_SOFT_CAP = 14; // above this, only louder / higher priority sounds get in (stealing the quietest)
const GLOBAL_HARD_CAP = 22;
const NEAR = 520, FAR = 1900; // px: distance muffling starts at NEAR and is full at FAR (whatever the reach)

// Recorded gunshots (assets/sound/shots, CC BY 3.0 Michel Baradari): the core of a shot once they are loaded.
const SAMPLES = {
  pistol: 'assets/sound/shots/pistol.wav',
  rifle: 'assets/sound/shots/rifle.wav',
  shotgun: 'assets/sound/shots/shotgun.wav',
  uzi: 'assets/sound/shots/cg1.wav',
};
// Per gun sound: recording, one clean shot cut out of it [offset s, length s] (the rifle file is a whole burst),
// playback rate, level, and how much of the synthesized layers stays under it (bass and room only).
const SHOTS = {
  pistol: { key: 'pistol', cut: [0, 0.5], rate: 1, vol: 1.0, under: 0.5 },
  uzi: { key: 'uzi', cut: [0, 0.22], rate: 1, vol: 0.9, under: 0.4 },
  shotgun: { key: 'shotgun', cut: [0, 0.45], rate: 0.94, vol: 1.15, under: 0.6 },
  rifle: { key: 'rifle', cut: [0, 0.27], rate: 1, vol: 1.05, under: 0.5 },
  sniper: { key: 'rifle', cut: [0, 0.32], rate: 0.8, vol: 1.25, under: 0.7 },
};
const FADE = 0.06; // s: fade at the end of a cut recording

// Gunshots: one close-miked shot = layers, each with its own envelope (see _gun). Hz, seconds, linear volume.
//   crack: muzzle-blast edge [highpass Hz, dur, vol]          body: band-passed noise [f0, f1, q, dur, vol]
//   blast: low boom, low-passed brown noise [f0, f1, dur, vol] thump: the felt bass, sine pitch drop [f0, f1, dur, vol]
//   punch: short triangle knock that reads on small speakers   sub: extra deep sine under the big guns
//   mech: action clacks right after the blast [delay, Hz, vol, knock Hz, ring Hz, scrape s] (see _clack)
//   cycle: a whole action worked after the shot [RACKS key, delay]  whoosh: rocket motor [f0, f1, dur, vol]
//   tail: the room / street answering [dur, lowpass Hz, vol, slap echoes, echo spacing]
//   casing: what falls on the floor (CASINGS key, [chance, delay]); jit: pitch randomization (default 3 %)
const GUNS = {
  // 9 mm: sharp crack, tight thump, short tail
  pistol: {
    crack: [2600, 0.003, 1.0], body: [2300, 520, 0.8, 0.07, 1.3], blast: [1500, 130, 0.12, 1.2],
    thump: [150, 48, 0.15, 1.1], punch: [270, 115, 0.03, 0.45],
    mech: [[0.014, 3800, 0.22, 0, 2400, 0], [0.034, 2700, 0.3, 360, 1500, 0]],
    tail: [0.4, 1700, 0.3, 2, 1], casing: ['9mm', 1, 0.3],
  },
  // drier and shorter than the pistol so full auto stays readable
  uzi: {
    crack: [3000, 0.002, 0.85], body: [2600, 760, 0.9, 0.042, 1.1], blast: [1600, 160, 0.065, 0.9],
    thump: [165, 62, 0.075, 0.85], punch: [290, 135, 0.022, 0.35],
    mech: [[0.02, 3200, 0.2, 380, 1700, 0]],
    tail: [0.2, 1500, 0.18, 1, 0.8], casing: ['9mm', 0.45, 0.25], jit: 0.045,
  },
  // suppressed: muffled "pft", almost no crack, audible bolt clatter, a little low thud
  silenced: {
    crack: [5000, 0.0015, 0.05], body: [900, 260, 0.9, 0.05, 0.6], blast: [700, 120, 0.05, 0.3],
    thump: [125, 56, 0.06, 0.3],
    mech: [[0.008, 2900, 0.22, 420, 1800, 0], [0.03, 3700, 0.16, 0, 2300, 0], [0.047, 2300, 0.12, 330, 0, 0]],
    tail: [0.08, 800, 0.04, 0, 1], casing: ['9mm', 0.45, 0.25], jit: 0.04,
  },
  // massive boom, wide low end, long tail, then the pump racked
  shotgun: {
    crack: [1800, 0.004, 1.0], body: [1700, 260, 0.6, 0.12, 1.5], blast: [2200, 80, 0.24, 1.35],
    thump: [112, 36, 0.24, 1.25], punch: [220, 90, 0.04, 0.5], sub: [64, 28, 0.42, 0.85],
    cycle: ['pump', 0.3], tail: [1.0, 1500, 0.45, 3, 1.3], casing: ['hull', 1, 0.62],
  },
  // 7.62: hard supersonic crack, heavy body, long tail
  rifle: {
    crack: [3600, 0.0028, 1.25], body: [2800, 600, 0.7, 0.07, 1.4], blast: [1800, 110, 0.12, 1.1],
    thump: [136, 44, 0.14, 1.1], punch: [240, 100, 0.03, 0.45],
    mech: [[0.03, 2400, 0.22, 300, 950, 0]],
    tail: [0.75, 1600, 0.36, 3, 1.1], casing: ['762', 0.6, 0.3],
  },
  // the biggest crack, deep sub, long rolling echo, then the bolt worked
  sniper: {
    crack: [3000, 0.0045, 1.45], body: [2400, 340, 0.6, 0.11, 1.5], blast: [2000, 70, 0.28, 1.4],
    thump: [104, 32, 0.28, 1.3], punch: [200, 80, 0.05, 0.5], sub: [55, 24, 0.62, 0.95],
    cycle: ['boltAction', 0.42], tail: [1.7, 1300, 0.5, 4, 1.9], casing: ['762', 1, 0.75],
  },
  // launch: back-blast thump + motor whoosh
  rocket: {
    crack: [1200, 0.006, 0.45], body: [900, 300, 0.8, 0.12, 1.0], blast: [1600, 90, 0.3, 1.2],
    thump: [92, 34, 0.3, 1.15], sub: [50, 25, 0.5, 0.7], whoosh: [500, 2600, 0.65, 0.55],
    tail: [0.9, 1200, 0.35, 2, 1.5],
  },
};

// Actions worked by hand (or by the gun itself): strokes [delay, Hz, vol, knock Hz, ring Hz, scrape s] at size 1
const RACKS = {
  slide: [[0, 3400, 0.3, 0, 0, 0.03], [0.075, 2600, 0.6, 330, 1500, 0.02]],          // pistol slide
  bolt: [[0, 3000, 0.32, 0, 1800, 0.035], [0.09, 2400, 0.6, 300, 1300, 0.02]],       // SMG cocking handle
  charge: [[0, 2300, 0.38, 0, 1100, 0.06], [0.14, 1900, 0.75, 240, 950, 0.015]],     // rifle charging handle
  boltAction: [[0, 2900, 0.32, 420, 0, 0], [0.1, 2300, 0.45, 0, 1200, 0.08], [0.26, 2100, 0.55, 280, 1000, 0.08], [0.35, 3000, 0.5, 360, 1100, 0]],
  pump: [[0, 2000, 0.6, 240, 800, 0.05], [0.14, 1750, 0.75, 210, 700, 0.045]],       // "chk - chk"
  latch: [[0, 1400, 0.7, 150, 450, 0.02], [0.09, 2600, 0.35, 0, 1600, 0]],           // launcher breech latch
};

// Handling per weapon id. s: size (lower pitch, heavier parts), rack: RACKS key, load: what a shell reload
// pushes in ('shell' | 'rocket').
const ARMS = {
  pistol: { s: 0.9, rack: 'slide' },
  uzi: { s: 1, rack: 'bolt' },
  uzi_silenced: { s: 1, rack: 'bolt' },
  shotgun: { s: 1.3, rack: 'pump', load: 'shell' },
  rifle: { s: 1.25, rack: 'charge' },
  sniper: { s: 1.4, rack: 'boltAction' },
  bazooka: { s: 1.9, rack: 'latch', load: 'rocket' },
};

// Casings on the floor: brass rings [Hz range, ring s, vol] or a plastic hull knock (Hz); n bounces
const CASINGS = {
  '9mm': { f: [5200, 6400], ring: 0.05, vol: 0.06, n: 3 },
  '762': { f: [3700, 4700], ring: 0.08, vol: 0.08, n: 3 },
  hull: { knock: 520, vol: 0.2, n: 2 },
};

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
    this.chokes = new WeakMap(); // emitter -> its last voice (a new shot cuts the previous tail)
    this.listener = { x: 0, y: 0 };
    this.muted = false;
    this.active = [];   // live plays, for the caps and voice stealing
    this.lastPlay = {}; // name -> { t, vol } of the last admitted play
    this.duckUntil = 0;
    this.duckDepth = 1;
    this.pv = 1;        // per-play pitch factor (set in play, read by the synthesis helpers)
    this.buffers = {};  // decoded recordings (SAMPLES), filled by unlock()
  }

  // must be called from a user gesture
  async unlock() {
    if (this.ctx) { if (this.ctx.state === 'suspended') await this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this._build(this.ctx = new AC());
    await Promise.all(Object.entries(SAMPLES).map(async ([k, url]) => {
      try {
        this.buffers[k] = await this.ctx.decodeAudioData(await (await fetch(url)).arrayBuffer());
      } catch (e) { console.warn('sound load failed', k, e); } // the synthesized shot takes over
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
    const shaper = (fn, oversample) => {
      const s = ctx.createWaveShaper(), curve = new Float32Array(2049);
      for (let i = 0; i < curve.length; i++) curve[i] = fn(i / 1024 - 1);
      s.curve = curve;
      s.oversample = oversample;
      return s;
    };

    this.sfx = ctx.createGain();
    this.sfx.gain.value = 0.95;
    this.music = ctx.createGain();
    this.music.gain.value = 0.6;
    this.duck = ctx.createGain();
    this.bus = ctx.createGain();

    // sfx EQ: no useless sub, a bit of bass punch, cleaner low-mids, a little presence
    chain(this.sfx, bq('highpass', 30, 0.7), bq('lowshelf', 110, 0.7, 2.5), bq('peaking', 350, 0.9, -3), bq('peaking', 3200, 0.8, 2), this.bus);
    chain(this.music, bq('highpass', 28, 0.7), this.duck, this.bus);
    // gun drive: unity gain for quiet (distant) shots, rounds the peaks of close ones off like an overdriven
    // mic, which is a big part of what makes a recorded gunshot sound heavy. In: +-2 -> out: +-0.96.
    this.guns = ctx.createGain();
    this.guns.gain.value = 0.5;
    chain(this.guns, shaper((x) => Math.tanh(2 * x), '2x'), this.sfx);
    // recorded shots keep their full crack: no drive, no low-mid cut, a bit of weight and air
    this.shots = ctx.createGain();
    this.shots.gain.value = 0.9;
    chain(this.shots, bq('highpass', 35, 0.7), bq('lowshelf', 120, 0.7, 3), bq('highshelf', 5000, 0.7, 3.5), this.bus);

    this.filter = bq('lowpass', 20000, 0.7);
    // glue: only the loud peaks go over the threshold, so the music bed is not pumped by every shot. (The browser adds
    // makeup gain from these settings: a low threshold pushed quiet clicks and casings up almost to gunshot level.)
    this.comp = ctx.createDynamicsCompressor();
    param(this.comp, { threshold: -10, knee: 8, ratio: 2.5, attack: 0.008, release: 0.18 });
    const pre = ctx.createGain();
    pre.gain.value = 0.85;
    const K = 1.4; // soft clip: tames peaks, adds weight
    this.shaper = shaper((x) => Math.tanh(K * x) / Math.tanh(K), '4x');
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
  // loudness (fading out at `reach`) / pan / distance (0 near .. 1 far) of an emitter relative to the listener
  _spatial(opts, reach = 1500) {
    let vol = opts.vol ?? 1, pan = 0, far = 0;
    if (opts.x !== undefined) {
      const dx = opts.x - this.listener.x, dy = opts.y - this.listener.y;
      const d = Math.hypot(dx, dy);
      vol *= clamp(1 - d / reach, 0.08, 1);
      pan = clamp(dx / 700, -0.8, 0.8);
      far = clamp((d - NEAR) / (FAR - NEAR), 0, 1); // far sounds lose their highs
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

  // fade a live play out and forget it (voice stealing, choke)
  _kill(entry, now, tau) {
    entry.gain.gain.cancelScheduledValues(now);
    entry.gain.gain.setTargetAtTime(0, now, tau);
    const i = this.active.indexOf(entry);
    if (i >= 0) this.active.splice(i, 1);
  }

  // rate limit + per-name cap + global cap with voice stealing; returns the "active" entry or null
  _admit(name, meta, vol) {
    const now = this.ctx.currentTime, act = this.active;
    for (let i = act.length - 1; i >= 0; i--) if (act[i].end <= now) act.splice(i, 1);
    const last = this.lastPlay[name];
    if (last && now - last.t < meta.gap && vol < last.vol * 1.4) return null;
    let quietest = null, same = 0; // a louder (closer) play of a capped name takes over its quietest voice
    for (const a of act) if (a.name === name) { same++; if (!quietest || a.vol < quietest.vol) quietest = a; }
    if (same >= meta.max) {
      if (vol < quietest.vol * 1.2) return null;
      this._kill(quietest, now, 0.01);
    }
    if (act.length >= GLOBAL_SOFT_CAP) {
      let weakest = null; // quietest of the lowest priority
      for (const a of act) if (!weakest || a.pri < weakest.pri || (a.pri === weakest.pri && a.vol < weakest.vol)) weakest = a;
      const better = meta.pri > weakest.pri || (meta.pri === weakest.pri && vol > weakest.vol * 1.5);
      if (!better || act.length >= GLOBAL_HARD_CAP && meta.pri <= weakest.pri) return null;
      this._kill(weakest, now, 0.01);
    }
    this.lastPlay[name] = { t: now, vol };
    const entry = { name, pri: meta.pri, vol, end: now + meta.dur, gain: null };
    act.push(entry);
    if (meta.duck < 1) this._duck(meta.duck);
    return entry;
  }

  // opts: x, y (positional), vol (loudness / how hard it was hit), choke (emitter key: a new play from the same
  // emitter fades its previous one, which keeps full-auto fire clean), weapon (weapon id for handling sounds)
  play(name, opts = {}) {
    if (!this.ctx || this.ctx.state !== 'running') return;
    name = ALIAS[name] || name;
    const gun = GUNS[name], mat = MAT[name], recipe = !gun && !mat && this['_' + name];
    if (!gun && !mat && !recipe) return;
    const meta = META[name] || DEFAULT_META;
    const sp = this._spatial(opts, meta.reach);
    sp.vol *= meta.gain ?? 1;
    if (sp.vol < 0.015) return; // inaudible
    const entry = this._admit(name, meta, sp.vol);
    if (!entry) return;
    if (opts.choke) {
      const prev = this.chokes.get(opts.choke);
      if (prev && prev.end > this.ctx.currentTime) this._kill(prev, this.ctx.currentTime, 0.02);
      this.chokes.set(opts.choke, entry);
    }
    const shot = gun && SHOTS[name], buf = shot && this.buffers[shot.key];
    const o = entry.gain = this._out(sp, opts.dest || (buf ? this.shots : gun ? this.guns : this.sfx));
    if (gun) return this._gun(o, gun, sp, opts, buf && shot, buf);
    o.gain.value = sp.vol * rand(0.88, 1.1); // never twice the same level
    this.pv = rand(0.93, 1.07);
    const v = clamp(opts.vol ?? 1, 0.1, 1.5); // how hard it was hit
    if (mat) this._material(o, mat, v);
    else recipe.call(this, o, opts, v);
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
    const k = 0.6 + 0.6 * v;
    // the hit itself: a dry, bright smack before the material answers
    if (m.snap) this._noiseBurst(o, { type: 'highpass', f0: m.snap.f, q: 0.7, dur: 0.014, vol: m.snap.vol * 1.6 * k, attack: 0.0002 });
    if (m.thump) this._thump(o, { f0: m.thump[0], f1: m.thump[1], dur: m.thump[2], type: m.thump[3], vol: m.thump[4] * k });
    if (m.body) {
      const b = m.body, bright = 0.7 + 0.3 * v;
      this._noiseBurst(o, { type: b.type || 'bandpass', f0: b.f0 * bright, f1: b.f1, q: b.q, dur: b.dur, vol: b.vol * k });
    }
    if (m.snap) for (let i = 0; i < m.snap.n; i++) this._tick(o, { f: m.snap.f * rand(0.8, 1.25), q: 4, dur: 0.012, vol: m.snap.vol * k, delay: i ? rand(0.008, m.snap.span) : 0 });
    if (m.partials) this._partials(o, { f: rand(...m.partials.f), ratios: m.partials.ratios, dur: m.partials.dur * 1.6, vol: m.partials.vol * 1.5 * k });
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
  // a shock front you feel first, the fireball, the boom coming back off the buildings, a long rumble and debris
  // raining down. With the recordings loaded, a slowed-down shotgun blast gives it the grain of a real detonation.
  _explosion(o) {
    const rec = this.buffers.shotgun;
    this._noiseBurst(o, { type: 'none', dur: 0.004, vol: 1.6, attack: 0.0001 });                                 // shock front
    this._noiseBurst(o, { type: 'highpass', f0: 2200, f1: 900, q: 0.7, dur: 0.09, vol: 1.1, attack: 0.0003 }); // crack
    if (rec) {
      this._sample(o, rec, { len: 0.6, rate: 0.42 * this.pv, vol: 1.5 });
      this._sample(o, rec, { len: 0.45, rate: 0.27 * this.pv, vol: 1.0, delay: 0.03 });
    }
    this._thump(o, { f0: 110, f1: 24, dur: 1.3, vol: 1.5 });                                                     // sub drop
    this._thump(o, { type: 'triangle', f0: 190, f1: 60, dur: 0.16, vol: 0.9 });                                  // chest punch
    this._noiseBurst(o, { src: 'brown', type: 'lowpass', f0: 5200, f1: 90, dur: 1.1, vol: rec ? 1.0 : 1.6, attack: 0.002 }); // fireball
    this._noiseBurst(o, { f0: 900, f1: 180, q: 0.5, dur: 0.6, vol: 0.7, attack: 0.003 });                        // roar
    for (const [t, v] of [[0.16, 0.55], [0.33, 0.35]]) {                                                         // echoes
      this._noiseBurst(o, { src: 'brown', type: 'lowpass', f0: 1400, f1: 120, dur: 0.45, vol: v, attack: 0.01, delay: t });
      this._thump(o, { f0: 80, f1: 34, dur: 0.3, vol: v, delay: t });
    }
    this._noiseBurst(o, { src: 'brown', type: 'lowpass', f0: 260, f1: 45, dur: 2.2, vol: 0.8, attack: 0.15, delay: 0.1 }); // rumble
    for (let i = 0; i < 12; i++) this._tick(o, { f: rand(600, 3200), q: 3, dur: rand(0.03, 0.07), vol: rand(0.15, 0.4) * (1 - i / 16), delay: 0.25 + 1.3 * (i / 12) ** 1.3 + rand(0, 0.05) }); // debris rain
    for (let i = 0; i < 4; i++) this._thump(o, { f0: rand(110, 170), f1: 55, dur: 0.08, vol: 0.35, delay: rand(0.3, 1.2) });
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
  // a shoe in a puddle: a wet slap and its spray
  _splash(o, opts, v) {
    this._noiseBurst(o, { type: 'bandpass', f0: 1500, f1: 600, q: 0.9, dur: 0.07, vol: 0.5 * v, attack: 0.004 });
    this._noiseBurst(o, { type: 'highpass', f0: 3200, dur: 0.11, vol: 0.16 * v, attack: 0.02, delay: 0.02 });
    this._thump(o, { f0: 150, f1: 80, dur: 0.05, vol: 0.2 * v });
  }
  _throw(o) { this._noiseBurst(o, { f0: 500, f1: 2400, q: 2, dur: 0.2, vol: 0.4, attack: 0.05 }); }
  _swing(o) { this._noiseBurst(o, { f0: 1800, f1: 500, q: 2, dur: 0.15, vol: 0.45, attack: 0.03 }); }

  // ---- guns ----
  // one shot: its recording when loaded (`shot`, `buf`), over the GUNS layers. Every shot differs a little (pitch, level +-1 dB, tail length); with
  // distance the crack, mechanics and reflections fade first while the thump carries (+ the _out lowpass).
  _gun(o, G, sp, opts, shot = null, buf = null) {
    this.pv = 1 + rand(-1, 1) * (G.jit ?? 0.03);
    o.gain.value = sp.vol * rand(0.89, 1.12);
    const hi = 1 - 0.75 * sp.far, lo = 1 + 0.8 * sp.far;
    const [cf, cd, cv] = G.crack, b = G.body, B = G.blast, T = G.thump;
    const u = shot ? shot.under : 1; // under a recording the synthesis only adds bass and room
    if (shot) {
      this._sample(o, buf, { offset: shot.cut[0], len: shot.cut[1], rate: shot.rate * this.pv, vol: shot.vol });
      this._noiseBurst(o, { type: 'highpass', f0: cf, q: 0.7, dur: 0.012, vol: cv * 0.45 * hi, attack: 0.0002 }); // extra snap
    } else {
      this._noiseBurst(o, { type: 'highpass', f0: cf, q: 0.7, dur: cd, vol: cv * hi, attack: 0.0002 });
      this._noiseBurst(o, { type: 'none', dur: 0.0012, vol: cv * 0.5 * hi, attack: 0.0001 }); // full-band spike
      this._noiseBurst(o, { f0: b[0], f1: b[1], q: b[2], dur: b[3], vol: b[4] * hi, attack: 0.0006 });
      this._noiseBurst(o, { src: 'brown', type: 'lowpass', f0: B[0], f1: B[1], dur: B[2], vol: B[3], attack: 0.001 });
    }
    this._thump(o, { f0: T[0], f1: T[1], dur: T[2], vol: T[3] * lo * u });
    if (G.punch) this._thump(o, { type: 'triangle', f0: G.punch[0], f1: G.punch[1], dur: G.punch[2], vol: G.punch[3] * hi * u });
    if (G.sub) this._thump(o, { f0: G.sub[0], f1: G.sub[1], dur: G.sub[2], vol: G.sub[3] * lo * u, delay: 0.004 });
    if (G.whoosh) {
      const [f0, f1, dur, vol] = G.whoosh;
      this._noiseBurst(o, { f0, f1, q: 1.1, dur, vol: vol * hi, attack: 0.05, delay: 0.01 });
      this._noiseBurst(o, { type: 'highpass', f0: 3500, f1: 1800, dur: dur * 0.8, vol: vol * 0.35 * hi, attack: 0.03, delay: 0.02 });
    }
    for (const m of G.mech || []) this._clack(o, m, 1, 0, hi);
    if (G.cycle) this._action(o, RACKS[G.cycle[0]], 1, G.cycle[1], 0.8 * hi);
    this._tail(o, G.tail, rand(0.85, 1.15), hi * u, lo * u);
    const c = G.casing;
    if (c && Math.random() < c[1]) this.play('shell', { x: opts.x, y: opts.y, vol: 0.6 * (opts.vol ?? 1), kind: c[0], delay: c[2] });
  }

  // one cut of a recording into voice `o`, faded out at the end of the cut
  _sample(o, buf, { offset = 0, len = buf.duration, rate = 1, vol = 1, delay = 0 }) {
    const ctx = this.ctx, t = ctx.currentTime + delay, dur = len / rate;
    const s = ctx.createBufferSource(), g = ctx.createGain();
    s.buffer = buf;
    s.playbackRate.value = rate;
    g.gain.setValueAtTime(vol, t);
    g.gain.setValueAtTime(vol, t + Math.max(0, dur - FADE));
    g.gain.linearRampToValueAtTime(0, t + dur);
    s.connect(g);
    g.connect(o);
    o._n++;
    s.onended = () => this._release(o, s, g);
    s.start(t, offset, len + 0.02);
  }

  // the room answering: low rumble, a darker mid wash, and a few discrete slap echoes off nearby walls
  _tail(o, [dur, lp, vol, slaps, spacing], len, hi, lo) {
    const d = dur * len;
    this._noiseBurst(o, { src: 'brown', type: 'lowpass', f0: lp, f1: 70, dur: d, vol: vol * lo, attack: 0.012, delay: 0.004 });
    this._noiseBurst(o, { f0: lp * 1.4, f1: lp * 0.3, q: 0.6, dur: d * 0.55, vol: vol * 0.35 * hi, attack: 0.008, delay: 0.01 });
    let t = 0;
    for (let i = 0; i < slaps; i++) {
      t += 0.035 * spacing * rand(0.8, 1.3);
      const v = vol * 0.9 * 0.62 ** i;
      this._noiseBurst(o, { f0: 1100, f1: 450, q: 0.9, dur: 0.05 + 0.02 * i, vol: v * hi, attack: 0.002, delay: t });
      this._thump(o, { f0: 95, f1: 50, dur: 0.08 + 0.03 * i, vol: v * 0.7 * lo, delay: t });
    }
  }

  // one mechanical stroke [delay, Hz, vol, knock Hz, ring Hz, scrape s]: metal sliding (scrape, ending on the
  // hit), the click itself, a knock of the part bottoming out, a short ring. s = size, t0 = offset, k = level.
  _clack(o, [t, f, vol, knock, ring, scrape], s = 1, t0 = 0, k = 1) {
    t += t0; f /= s; vol *= k;
    if (scrape) this._noiseBurst(o, { f0: f * 0.45, f1: f * 0.75, q: 2.2, dur: scrape, vol: vol * 0.35, attack: scrape * 0.7, delay: Math.max(0, t - scrape * 0.8) });
    this._tick(o, { f, q: 2.5, dur: 0.007, vol, delay: t });
    this._noiseBurst(o, { type: 'highpass', f0: 3800 / s, q: 0.7, dur: 0.016, vol: vol * 0.7, attack: 0.0003, delay: t }); // steel on steel
    if (knock) this._thump(o, { type: 'triangle', f0: knock / s, f1: knock / s / 2, dur: 0.035, vol: vol * 0.7, delay: t });
    if (ring) this._partials(o, { f: ring / s, ratios: [1, 2.76, 5.4], dur: 0.09, vol: vol * 0.3, delay: t });
  }

  _action(o, strokes, s, t0, k) { for (const m of strokes) this._clack(o, m, s, t0, k); }

  // ---- reloads and handling (opts.weapon = weapon id, opts.dur = reload length) ----
  _arms(opts) { return ARMS[opts.weapon] || ARMS.pistol; }

  // mag release click, the mag sliding out, then the empty one clattering on the floor (Character drops it at
  // 8 % of the reload)
  _magOut(o, opts) {
    const { s } = this._arms(opts);
    this._clack(o, [0, 3600, 0.3, 0, 2000, 0], s);
    this._noiseBurst(o, { f0: 1500 / s, f1: 2200 / s, q: 2.5, dur: 0.08, vol: 0.28, attack: 0.05, delay: 0.015 });
    const t = 0.08 * (opts.dur ?? 1) + rand(0.2, 0.26);
    this._clack(o, [t, 2400, 0.4, 280, 1500, 0], s);
    this._clack(o, [t + rand(0.06, 0.09), 2800, 0.18, 320, 0, 0], s);
  }
  // fresh mag pushed up the well and seated with a firm clack
  _magIn(o, opts) {
    const { s } = this._arms(opts);
    this._noiseBurst(o, { f0: 1200 / s, f1: 1800 / s, q: 2, dur: 0.05, vol: 0.25, attack: 0.035 });
    this._clack(o, [0.045, 2200, 0.75, 300, 1300, 0], s);
    this._thump(o, { f0: 180 / s, f1: 90 / s, dur: 0.06, vol: 0.45, delay: 0.045 });
  }
  // the weapon's action worked by hand (end of a reload, picking a gun up)
  _rack(o, opts) {
    const A = this._arms(opts);
    this._action(o, RACKS[A.rack], A.s, 0, 1);
  }
  // one round loaded: a shell thumbed into the tube (soft "thk" + follower click) or a rocket thunking home
  _shellIn(o, opts) {
    const A = this._arms(opts);
    if (A.load === 'rocket') {
      this._thump(o, { f0: 130, f1: 50, dur: 0.12, vol: 0.9 });
      this._clack(o, [0, 1200, 0.5, 0, 420, 0]);
      return;
    }
    this._thump(o, { type: 'triangle', f0: 360, f1: 180, dur: 0.035, vol: 0.45 });
    this._noiseBurst(o, { f0: 1100, q: 1.5, dur: 0.04, vol: 0.4 });
    this._clack(o, [0.03, 2800, 0.25, 0, 1900, 0], A.s);
  }
  // grabbing / shouldering a gun: hand and strap on it, loose parts rattling (+ a launcher's rocket sliding in
  // over the reload)
  _handle(o, opts) {
    const A = this._arms(opts), s = A.s;
    this._noiseBurst(o, { type: 'lowpass', f0: 900, f1: 300, dur: 0.09, vol: 0.3, attack: 0.02 });
    this._thump(o, { type: 'triangle', f0: 260 / s, f1: 140 / s, dur: 0.04, vol: 0.35, delay: 0.02 });
    for (let i = 0; i < 2; i++) this._tick(o, { f: rand(2200, 3200) / s, q: 4, dur: 0.008, vol: 0.18, delay: 0.03 + i * rand(0.03, 0.05) });
    if (A.load === 'rocket' && opts.dur) {
      this._noiseBurst(o, { f0: 500, f1: 900, q: 1.5, dur: opts.dur * 0.55, vol: 0.3, attack: opts.dur * 0.4, delay: opts.dur * 0.35 });
    }
  }
  _pickup(o, opts) { this._handle(o, opts); }
  // dry fire: hammer / striker falling on nothing
  _click(o, opts) {
    const { s } = this._arms(opts);
    this._tick(o, { f: 3000 / s, q: 3, dur: 0.008, vol: 0.5 });
    this._thump(o, { type: 'triangle', f0: 900 / s, f1: 500 / s, dur: 0.015, vol: 0.25 });
    this._partials(o, { f: 2200 / s, ratios: [1, 2.76], dur: 0.03, vol: 0.06 });
  }
  // a casing bouncing on the floor (CASINGS kind, default 9 mm brass), bounces closer and quieter each time
  _shell(o, opts) {
    const C = CASINGS[opts.kind] || CASINGS['9mm'];
    let t = opts.delay || 0, gap = rand(0.06, 0.1), v = C.vol;
    const f = rand(...(C.f || [0, 0]));
    for (let i = 0; i < C.n; i++) {
      if (C.knock) {
        this._thump(o, { type: 'triangle', f0: C.knock, f1: C.knock * 0.55, dur: 0.03, vol: v, delay: t });
        this._noiseBurst(o, { f0: 1100, q: 1.5, dur: 0.03, vol: v * 0.6, delay: t });
      } else {
        this._tick(o, { f: f * 1.2, q: 3, dur: 0.004, vol: v * 1.5, delay: t });
        this._partials(o, { f: f * (1 - i * 0.01), ratios: [1, 1.62, 2.31], dur: C.ring, vol: v, delay: t });
      }
      t += gap;
      gap *= 0.6;
      v *= 0.5;
    }
  }
  // a round whining off a hard surface
  _ricochet(o) {
    this._tick(o, { f: 4000, q: 0.8, dur: 0.012, vol: 0.5 });
    this._tone(o, { type: 'sawtooth', f0: rand(3000, 3800), f1: rand(700, 1100), dur: 0.2, vol: 0.07, delay: 0.008 });
    this._tone(o, { f0: rand(2400, 3000), f1: 800, dur: 0.14, vol: 0.05, delay: 0.01 });
  }
  _ammo(o) {
    for (let i = 0; i < 4; i++) this._partials(o, { f: rand(3500, 5000), ratios: [1, 2.3], dur: 0.05, vol: 0.08, delay: i * 0.035 + rand(0, 0.02) });
    this._thump(o, { f0: 240, f1: 140, dur: 0.04, vol: 0.3 });
  }

  // ---- fire, alarm, UI ----
  // car alarm: a harsh piezo siren whooping up, once per call (the vehicle repeats it)
  _alarm(o) {
    this.pv = 1; // a siren does not drift
    for (const [type, k, vol] of [['square', 1, 0.2], ['sawtooth', 1.006, 0.16], ['square', 2.01, 0.07]]) {
      this._tone(o, { type, f0: 780 * k, f1: 1650 * k, dur: 0.37, fdur: 0.33, vol, attack: 0.004 });
    }
  }
  _crackle(o) {
    for (let i = 0; i < 3; i++) this._tick(o, { f: rand(1500, 4000), q: 5, dur: 0.02, vol: rand(0.1, 0.3), delay: rand(0, 0.2) });
  }
  _ignite(o) {
    this._noiseBurst(o, { src: 'brown', type: 'lowpass', f0: 300, f1: 2200, dur: 0.5, vol: 1.1, attack: 0.12 });
    this._thump(o, { f0: 60, f1: 85, dur: 0.4, vol: 0.5 });
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

  // ---- ambient traffic ----
  // a car driving past: engine buzz + tyre roar swelling to the closest point (`lead` s) then fading, panned across
  // in the driving direction (dir ±1); side: 0 = right under the camera .. 1 = across the street; pitch drops as it passes
  _passby(o, { lead = 1, dur = 2.6, dir = 1, side = 0.5, f = 50 }) {
    const ctx = this.ctx, t = ctx.currentTime, peak = t + lead, end = t + Math.max(dur, lead + 0.6);
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, t);
    env.gain.exponentialRampToValueAtTime(1, peak);
    env.gain.exponentialRampToValueAtTime(0.0001, end);
    const pan = ctx.createStereoPanner ? ctx.createStereoPanner() : ctx.createGain();
    if (pan.pan) {
      const w = 0.85 * (0.5 + 0.5 * side);
      pan.pan.setValueAtTime(-w * dir, t);
      pan.pan.linearRampToValueAtTime(0, peak);
      pan.pan.linearRampToValueAtTime(w * dir, end);
    }
    env.connect(pan);
    pan.connect(o);
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(f * 1.05, t);
    osc.frequency.linearRampToValueAtTime(f * 1.04, Math.max(t, peak - 0.1));
    osc.frequency.linearRampToValueAtTime(f * 0.9, peak + 0.25); // doppler
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(260, t);
    lp.frequency.linearRampToValueAtTime(950 - side * 450, peak);
    lp.frequency.linearRampToValueAtTime(220, end);
    const og = ctx.createGain();
    og.gain.value = 0.2;
    osc.connect(lp); lp.connect(og); og.connect(env);
    const n = ctx.createBufferSource();
    n.buffer = this.brown;
    n.loop = true;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.value = 0.7;
    bp.frequency.setValueAtTime(420, t);
    bp.frequency.linearRampToValueAtTime(900, peak);
    bp.frequency.linearRampToValueAtTime(380, end);
    const ng = ctx.createGain();
    ng.gain.value = 0.8;
    n.connect(bp); bp.connect(ng); ng.connect(env);
    o._n += 2;
    let left = 2;
    const fin = () => { if (--left === 0) { env.disconnect(); pan.disconnect(); } };
    osc.onended = () => { fin(); this._release(o, osc, lp, og); };
    n.onended = () => { fin(); this._release(o, n, bp, ng); };
    osc.start(t);
    n.start(t, Math.random() * 1.5);
    osc.stop(end + 0.05);
    n.stop(end + 0.05);
  }
}

const Audio = new AudioSystem();
export default Audio;
