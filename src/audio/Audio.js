// WebAudio sound system: recordings wherever a real thing makes the noise, a little synthesis under them, mixed
// through a small mastering chain.
//   - gunshots: recorded shots (SAMPLES / SHOTS) over synthesized bass and room layers (GUNS, see _gun)
//   - everything physical (impacts, breaks, flesh, doors, reloads, casings, voices, water): cuts of the recorded
//     foley bank (bank.js, built by tools/build_sounds.mjs), layered per sound in FOLEY and / or by a `_<name>` method
//   - noise-based synthesis only where no recording fits: blast bodies, fire, tyres, the car alarm, traffic
//
// Bus chain (all created in _build):
//   guns  -> drive (tanh) -> gun level -> sfx              (synthesized shots)
//   shots -> HP 35 Hz -> low shelf -> high shelf ----------+   (recorded shots: no drive, full crack)
//   sfx   -> HP 30 Hz -> low shelf -> low-mid cut -> presence -+-> mix -> glue compressor ---+
//   sfx + shots -> room (convolution reverb, generated impulse) -+                            |
//   music -> HP 28 Hz -> duck (held dip while it is loud) -> its own compressor -------------+-> bus
//   bus -> filter (lowpass: slow motion / death muffle) -> soft clip (linear under its knee, oversampled)
//       -> limiter (safety) -> master -> destination
// The music has its own compressor so that gunfire never pumps it: only the duck moves it, slowly.
//
// META (per sound) drives voice admission: rate limit, per-name cap, global cap with voice stealing, music ducking,
// how far it carries and its place in the mix. Reload / handling sounds take `weapon` (a weapon id) to pick that
// gun's parts (ARMS); voices take `pitch` (one per character).
import { rand, clamp } from '../engine/math.js';
import { BANK, BANK_URL } from './bank.js';

const MASTER_GAIN = 0.8;

// semitones above the first kill's bell, per kill of a streak
const STREAK = [0, 2, 4, 7, 9, 12];
// names that map onto another sound
const ALIAS = { impact: 'stone' };

// Voice admission and mix per sound. pri: steal priority; dur: seconds a play stays "active"; gap: min seconds
// between two plays (a louder one may break it); max: simultaneous plays of that name; duck: music gain dip
// (1 = none); reach: px at which it fades out (loud sounds carry further, losing their highs on the way);
// gain: level in the mix (a close gunshot is the reference; handling noises sit far under it).
const DEFAULT_META = { pri: 1, dur: 0.3, gap: 0.025, max: 4, duck: 1, gain: 1 };
const META = {
  explosion: { pri: 4, dur: 2.6, gap: 0.12, max: 2, duck: 0.45, reach: 3400, gain: 0.5 },
  pistol: { pri: 3, dur: 0.45, gap: 0, duck: 0.75, reach: 2600 },
  uzi: { pri: 3, dur: 0.25, gap: 0, duck: 0.8, reach: 2400 },
  silenced: { pri: 2, dur: 0.2, gap: 0, reach: 1100 },
  shotgun: { pri: 4, dur: 1.0, gap: 0, max: 3, duck: 0.65, reach: 3000 },
  rifle: { pri: 3, dur: 0.7, gap: 0, duck: 0.72, reach: 3000 },
  sniper: { pri: 4, dur: 1.6, gap: 0, max: 2, duck: 0.6, reach: 3400 },
  rocket: { pri: 3, dur: 0.9, gap: 0.1, max: 2, duck: 0.7, reach: 3000 },
  // impacts (one per material) and what gives way
  wood: { gain: 0.6 }, metal: { gain: 0.55 }, stone: { gain: 0.6 }, plastic: { gain: 0.7 }, soft: { gain: 0.6 },
  ceramic: { gain: 0.55 }, glassHit: { gain: 0.5 }, flesh: { gain: 0.7 },
  woodBreak: { pri: 2, dur: 0.6, gap: 0.05, max: 3, gain: 0.85 },
  metalBreak: { pri: 2, dur: 0.6, gap: 0.05, max: 3, gain: 0.8 },
  ceramicBreak: { pri: 2, dur: 0.5, gap: 0.05, max: 3, gain: 0.75 },
  plasticBreak: { pri: 2, dur: 0.4, gap: 0.05, max: 3, gain: 0.7 },
  softBreak: { pri: 2, dur: 0.4, gap: 0.05, max: 3, gain: 0.8 },
  glass: { pri: 2, dur: 0.8, gap: 0.05, max: 3, gain: 0.8 },
  crumble: { pri: 3, dur: 1.0, gap: 0.08, max: 2, duck: 0.75, gain: 0.7 },
  doorBreak: { pri: 3, dur: 0.7, gap: 0.1, max: 2, duck: 0.75, gain: 0.9 },
  tirePop: { pri: 3, dur: 0.8, gap: 0.1, max: 2, duck: 0.8 },
  carHit: { pri: 2, dur: 0.4, gap: 0.04, max: 3, gain: 0.8 },
  // flesh and voices
  gore: { pri: 3, dur: 0.8, gap: 0.05, max: 3, duck: 0.85 },
  death: { pri: 4, dur: 1.0, gap: 0.3, max: 1, duck: 0.5, gain: 0.8 },
  splat: { pri: 2, dur: 0.3, gap: 0.03, gain: 0.85 },
  slash: { pri: 2, dur: 0.3, gap: 0.04, max: 3, gain: 0.85 },
  punch: { pri: 2, dur: 0.3, gap: 0.04, max: 3, gain: 0.9 },
  bodyFall: { pri: 1, dur: 0.4, gap: 0.05, max: 3, gain: 0.8 },
  shout: { pri: 2, dur: 0.5, gap: 0.5, max: 2, gain: 0.9, reach: 1900 },
  cry: { pri: 2, dur: 0.6, gap: 0.12, max: 3, gain: 0.9, reach: 1900 },
  grab: { pri: 2, dur: 0.4, gain: 0.7 }, neck: { pri: 3, dur: 0.6, gain: 0.95 },
  whimper: { pri: 1, dur: 0.5, gap: 1.2, max: 1, gain: 0.6, reach: 1200 },
  scream: { pri: 2, dur: 0.5, gap: 0.45, max: 2, gain: 0.75, reach: 1700 },
  // doors, movement
  door: { gain: 0.6 },
  doorSlam: { pri: 3, dur: 0.5, gap: 0.06, max: 2, duck: 0.85, gain: 0.85 },
  creak: { dur: 0.6, gap: 0.2, max: 2, gain: 0.5 },
  vault: { dur: 0.5, gain: 0.8 }, slide: { pri: 2, dur: 0.7, gap: 0.2, max: 2, gain: 0.9 },
  swing: { gain: 0.5 }, throw: { gain: 0.55 },
  splash: { pri: 0, dur: 0.3, gap: 0.06, max: 3, gain: 0.6 },
  // weapons in the hands
  ricochet: { dur: 0.3, gap: 0.05, max: 3, gain: 0.8 },
  shell: { pri: 0, dur: 0.4, gap: 0.03, gain: 0.4 },
  magOut: { dur: 0.7, gap: 0.05, max: 3, gain: 0.45 },
  magIn: { dur: 0.35, gap: 0.05, max: 3, gain: 0.45 },
  rack: { dur: 0.5, gap: 0.05, max: 3, gain: 0.45 },
  shellIn: { dur: 0.5, gap: 0.03, max: 3, gain: 0.42 },
  handle: { dur: 0.5, gap: 0.05, max: 3, gain: 0.35 },
  pickup: { dur: 0.5, gap: 0.05, max: 3, gain: 0.3 },
  click: { dur: 0.12, gap: 0.05, max: 3, gain: 0.7 },
  ammo: { dur: 0.4, gap: 0.05, max: 2, gain: 0.4 },
  // fire, alarm, UI, street
  alarm: { pri: 1, dur: 0.4, gap: 0.2, max: 2, reach: 1700, gain: 0.2 },
  crackle: { pri: 0, dur: 0.3, gap: 0.08, max: 2, gain: 0.6 },
  ignite: { pri: 2, dur: 0.6, gap: 0.1, max: 2, gain: 0.6 },
  confirm: { pri: 3, dur: 0.6, gap: 0.03, max: 3, gain: 0.7 },
  clear: { pri: 3, dur: 1.6, gap: 0.5, max: 1, duck: 0.6, gain: 0.4 },
  ui: { pri: 3, dur: 0.15, gap: 0.05, max: 2, gain: 0.7 },
  passby: { pri: 0, dur: 3, gap: 0.15, max: 3 },
};
for (const k in META) META[k] = { ...DEFAULT_META, ...META[k] };
const GLOBAL_SOFT_CAP = 14; // above this, only louder / higher priority sounds get in (stealing the quietest)
const GLOBAL_HARD_CAP = 22;
const NEAR = 520, FAR = 1900; // px: distance muffling starts at NEAR and is full at FAR (whatever the reach)
const DUCK_HOLD = 0.25, DUCK_RELEASE = 0.3; // s: the music stays down through a burst, then comes back slowly
const CHOKE = 0.05; // s: how fast a shooter's previous shot fades under his next one
const GUN_LEVEL = 0.32; // gunfire in the mix: loud, but under the master's clip so that bursts stay clean

// Recordings. Gunshots: assets/sound/shots, CC BY 3.0 Michel Baradari; foley: the bank (CC0, assets/sound/CREDITS.md).
const SAMPLES = {
  pistol: 'assets/sound/shots/pistol.wav',
  rifle: 'assets/sound/shots/rifle.wav',
  shotgun: 'assets/sound/shots/shotgun.wav',
  uzi: 'assets/sound/shots/cg1.wav',
  foley: BANK_URL,
};
// Per gun sound: recording, one clean shot cut out of it [offset s, length s] (the rifle file is a whole burst),
// playback rate, level, and how much of the synthesized layers stays under it (bass and room only).
const SHOTS = {
  pistol: { key: 'pistol', cut: [0, 0.5], rate: 1, vol: 1.0, under: 0.45 },
  uzi: { key: 'uzi', cut: [0, 0.22], rate: 1, vol: 0.9, under: 0.32 },
  shotgun: { key: 'shotgun', cut: [0, 0.45], rate: 0.94, vol: 1.15, under: 0.55 },
  rifle: { key: 'rifle', cut: [0, 0.27], rate: 1, vol: 1.05, under: 0.45 },
  sniper: { key: 'rifle', cut: [0, 0.32], rate: 0.8, vol: 1.25, under: 0.65 },
};
const FADE = 0.06; // s: fade at the end of a cut gunshot (bank cuts carry their own)

// Gunshots: one close-miked shot = layers, each with its own envelope (see _gun). Hz, seconds, linear volume.
//   crack: muzzle-blast edge [highpass Hz, dur, vol]          body: band-passed noise [f0, f1, q, dur, vol]
//   blast: low boom, low-passed brown noise [f0, f1, dur, vol] thump: the felt bass, sine pitch drop [f0, f1, dur, vol]
//   punch: short low knock (synthesized shot only)             sub: extra deep sine under the big guns
//   bolt: the action clattering right after a quiet shot [delay, vol, rate] (bank 'click')
//   cycle: the action worked by hand after the shot [bank set, delay, vol, rate]
//   whoosh: rocket motor [f0, f1, dur, vol]   tail: the street answering [dur, lowpass Hz, vol, slap echoes, spacing]
//   casing: what falls on the floor (CASINGS key, [chance, delay]); jit: pitch randomization (default 3 %)
//   bus: 'sfx' keeps a quiet gun out of the gunfire bus (no drive, no gunfire level)
const GUNS = {
  // 9 mm: sharp crack, tight thump, short tail
  pistol: {
    crack: [2600, 0.003, 1.0], body: [2300, 520, 0.8, 0.07, 1.3], blast: [1500, 130, 0.12, 1.2],
    thump: [150, 48, 0.15, 1.1], punch: [270, 115, 0.03, 0.45],
    tail: [0.4, 1700, 0.3, 2, 1], casing: ['9mm', 1, 0.3],
  },
  // drier and shorter than the pistol so full auto stays readable
  uzi: {
    crack: [3000, 0.002, 0.85], body: [2600, 760, 0.9, 0.042, 1.1], blast: [1600, 160, 0.065, 0.9],
    thump: [165, 62, 0.075, 0.85], punch: [290, 135, 0.022, 0.35],
    tail: [0.2, 1500, 0.18, 1, 0.8], casing: ['9mm', 0.45, 0.25], jit: 0.045,
  },
  // suppressed: muffled "pft", almost no crack, audible bolt clatter, a little low thud
  silenced: {
    crack: [5000, 0.0015, 0.05], body: [900, 260, 0.9, 0.05, 0.6], blast: [700, 120, 0.05, 0.3],
    thump: [125, 56, 0.06, 0.3], bolt: [0.012, 0.3, 1.3], bus: 'sfx',
    tail: [0.08, 800, 0.04, 0, 1], casing: ['9mm', 0.45, 0.25], jit: 0.04,
  },
  // massive boom, wide low end, long tail, then the pump racked
  shotgun: {
    crack: [1800, 0.004, 1.0], body: [1700, 260, 0.6, 0.12, 1.5], blast: [2200, 80, 0.24, 1.35],
    thump: [112, 36, 0.24, 1.25], punch: [220, 90, 0.04, 0.5], sub: [64, 28, 0.42, 0.85],
    cycle: ['pump', 0.3, 0.3, 1], tail: [1.0, 1500, 0.45, 3, 1.3], casing: ['hull', 1, 0.62],
  },
  // 7.62: hard supersonic crack, heavy body, long tail
  rifle: {
    crack: [3600, 0.0028, 1.25], body: [2800, 600, 0.7, 0.07, 1.4], blast: [1800, 110, 0.12, 1.1],
    thump: [136, 44, 0.14, 1.1], punch: [240, 100, 0.03, 0.45],
    tail: [0.75, 1600, 0.36, 3, 1.1], casing: ['762', 0.6, 0.3],
  },
  // the biggest crack, deep sub, long rolling echo, then the bolt worked
  sniper: {
    crack: [3000, 0.0045, 1.45], body: [2400, 340, 0.6, 0.11, 1.5], blast: [2000, 70, 0.28, 1.4],
    thump: [104, 32, 0.28, 1.3], punch: [200, 80, 0.05, 0.5], sub: [55, 24, 0.62, 0.95],
    cycle: ['rack', 0.42, 0.3, 0.8], tail: [1.7, 1300, 0.5, 4, 1.9], casing: ['762', 1, 0.75],
  },
  // launch: back-blast thump + motor whoosh
  rocket: {
    crack: [1200, 0.006, 0.45], body: [900, 300, 0.8, 0.12, 1.0], blast: [1600, 90, 0.3, 1.2],
    thump: [92, 34, 0.3, 1.15], sub: [50, 25, 0.5, 0.7], whoosh: [500, 2600, 0.65, 0.55],
    tail: [0.9, 1200, 0.35, 2, 1.5],
  },
};

// Handling per weapon id. rate: playback rate of its reload recordings (bigger guns sound lower and slower),
// rack: bank set of its action, load: what a shell reload pushes in ('shell' | 'rocket').
const ARMS = {
  pistol: { rate: 1.1, rack: 'rack' },
  uzi: { rate: 1, rack: 'rack' },
  uzi_silenced: { rate: 1, rack: 'rack' },
  shotgun: { rate: 0.95, rack: 'pump', load: 'shell' },
  rifle: { rate: 0.88, rack: 'rack' },
  sniper: { rate: 0.8, rack: 'rack' },
  bazooka: { rate: 0.62, rack: 'magIn', load: 'rocket' },
};

// Casings on the floor: bank set, playback rate (small brass rings higher), bounces
const CASINGS = {
  '9mm': { set: 'casing', rate: 1.25, n: 3 },
  '762': { set: 'casing', rate: 0.95, n: 3 },
  hull: { set: 'plastic', rate: 1.1, n: 2 },
};

// Sounds made of bank cuts only: layers [bank set, vol, rate = 1, delay s = 0, odds = 1]. A `_<name>` method of
// the same name adds its synthesized part.
const FOLEY = {
  // one hit, per material
  wood: [['wood', 1]], metal: [['metal', 1]], stone: [['stone', 1]], plastic: [['plastic', 1]], soft: [['soft', 1]],
  ceramic: [['ceramic', 1]], glassHit: [['glassHit', 1]], flesh: [['flesh', 1]],
  // the thing giving way
  woodBreak: [['woodBreak', 1], ['wood', 0.5, 0.85]],
  metalBreak: [['metalBreak', 1], ['sheet', 0.6]],
  ceramicBreak: [['ceramic', 1], ['glassHit', 0.5, 0.8], ['stone', 0.5]],
  plasticBreak: [['plastic', 1, 0.8], ['woodBreak', 0.45, 1.5]],
  softBreak: [['soft', 1, 0.8], ['thud', 0.6]],
  glass: [['glass', 1], ['glassFall', 0.45, 1, 0.15, 0.7]],
  crumble: [['rubble', 1], ['stone', 0.7, 0.8], ['rubble', 0.5, 0.75, 0.25]],
  doorBreak: [['woodBreak', 1], ['thud', 0.8, 0.85], ['woodBreak', 0.5, 0.8, 0.1]],
  explosion: [['rubble', 0.5, 0.8, 0.3], ['glassFall', 0.2, 1, 0.5, 0.5], ['rubble', 0.35, 0.65, 0.75], ['stone', 0.3, 0.7, 1.1]],
  tirePop: [['thud', 0.8, 1.2]],
  carHit: [['sheet', 1], ['thud', 0.45, 0.9]],
  // flesh
  punch: [['punch', 1], ['flesh', 0.45, 1.1, 0.008]],
  splat: [['splat', 1], ['flesh', 0.5]],
  gore: [['gore', 1], ['splat', 0.7, 0.9], ['thud', 0.6, 0.8, 0.02]],
  slash: [['swish', 0.5, 1.5], ['splat', 1, 1.15, 0.03]],
  death: [['gore', 1], ['thud', 0.9, 0.7, 0.04]],
  bodyFall: [['thud', 1, 0.8], ['soft', 0.5, 0.8, 0.06]],
  shout: [['yell', 1]],
  whimper: [['pain', 0.8, 1.12]], // a man on his knees begging
  scream: [['yell', 1, 1.1]],     // a passer-by running for his life
  // a guard seized from behind: sleeves, his stifled grunt; then his neck, a dry crack, and the body let down
  grab: [['swish', 0.35, 1.2], ['soft', 0.7, 1.1, 0.04], ['pain', 0.3, 0.9, 0.1]],
  neck: [['woodBreak', 0.8, 1.9], ['wood', 0.6, 1.5, 0.01], ['soft', 0.5, 0.8, 0.14], ['thud', 0.6, 0.8, 0.32]],
  // doors, movement
  door: [['door', 1]],
  doorSlam: [['doorSlam', 1], ['thud', 0.5, 0.8]],
  creak: [['creak', 1]],
  vault: [['swish', 0.3, 0.6], ['soft', 0.6, 1, 0.1], ['thud', 0.5, 1.1, 0.27]], // hands on the sill, the landing
  // a body dragged over the floor (or a car hood): the launch, the scrape under it, where it stops
  slide: [['swish', 0.6, 0.6], ['scrape', 1, 0.75, 0.02], ['scrape', 0.6, 0.6, 0.1], ['thud', 0.4, 1.1, 0.45]],
  splash: [['splash', 1]],
  throw: [['swish', 1, 0.7]],
  swing: [['swish', 1, 0.9]],
  // small things
  ricochet: [['stone', 0.5, 1.5]],
  ammo: [['rattle', 1], ['handle', 0.35, 1.2]],
  crackle: [['woodBreak', 0.3, 1.7, 0, 0.5]],
  ui: [['click', 1, 0.8], ['thud', 0.4, 1.5]],
  clear: [['doorSlam', 0.6, 0.6]],
};

class AudioSystem {
  constructor() {
    this.ctx = null;
    this.chokes = new WeakMap(); // emitter -> its last voice (a new shot fades the previous tail)
    this.listener = { x: 0, y: 0 };
    this.muted = false;
    this.active = [];   // live plays, for the caps and voice stealing
    this.lastPlay = {}; // name -> { t, vol } of the last admitted play
    this.duckUntil = 0;
    this.duckDepth = 1;
    this.pv = 1;        // per-play pitch factor (set in play, read by the helpers)
    this.buffers = {};  // decoded recordings (SAMPLES), filled by unlock()
    this.bags = {};     // bank set -> cuts not played yet in this round (see _pick)
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
      } catch (e) { console.warn('sound load failed', k, e); } // shots fall back on synthesis, foley stays silent
    }));
  }

  // bus chain + shared buffers (see the header)
  _build(ctx) {
    const param = (n, v) => { for (const k in v) n[k].value = v[k]; return n; };
    const gain = (v) => param(ctx.createGain(), { gain: v });
    const bq = (type, frequency, Q, g = 0) => {
      const f = ctx.createBiquadFilter();
      f.type = type;
      return param(f, { frequency, Q, gain: g });
    };
    const chain = (...nodes) => nodes.reduce((a, b) => (a.connect(b), b));
    const shaper = (fn, oversample) => {
      const s = ctx.createWaveShaper(), curve = new Float32Array(2049);
      for (let i = 0; i < curve.length; i++) curve[i] = fn(i / 1024 - 1);
      s.curve = curve;
      s.oversample = oversample;
      return s;
    };

    this.sfx = gain(0.9);
    this.music = gain(0.6);
    this.duck = gain(1);
    this.bus = gain(1);
    const mix = gain(1);

    // sfx EQ: no useless sub, a bit of weight, less boxy low-mids, a little presence
    chain(this.sfx, bq('highpass', 30, 0.7), bq('lowshelf', 110, 0.7, 2), bq('peaking', 350, 0.9, -2), bq('peaking', 3200, 0.8, 1.5), mix);
    // gun drive: unity gain for quiet (distant) shots, rounds the peaks of close ones off like an overdriven
    // mic, which is a big part of what makes a recorded gunshot sound heavy. In: +-2 -> out: +-0.96.
    this.guns = gain(0.5);
    chain(this.guns, shaper((x) => Math.tanh(2 * x), '2x'), gain(GUN_LEVEL), this.sfx);
    // recorded shots keep their full crack: no drive, no low-mid cut, a bit of weight and air
    this.shots = gain(0.65 * GUN_LEVEL);
    chain(this.shots, bq('highpass', 35, 0.7), bq('lowshelf', 120, 0.7, 3), bq('highshelf', 5000, 0.7, 3.5), mix);
    // one room for everything that is not music: it glues the recordings (all made in different places) together
    const room = ctx.createConvolver();
    room.normalize = false;
    room.buffer = this._room(ctx);
    chain(this.sfx, gain(0.2), room);
    chain(this.shots, gain(0.1), room);
    chain(room, bq('highpass', 160, 0.7), mix);

    // glue on the effects only: loud bursts are held together, the music bed is left alone. (The browser adds
    // makeup gain from these settings: a low threshold would push clicks and casings up towards the gunshots.)
    const comp = () => param(ctx.createDynamicsCompressor(), { threshold: -10, knee: 8, ratio: 2.5, attack: 0.008, release: 0.18 });
    chain(mix, comp(), this.bus);
    chain(this.music, bq('highpass', 28, 0.7), this.duck, comp(), this.bus);

    this.filter = bq('lowpass', 20000, 0.7);
    // soft clip: transparent up to the knee (with the gain the mix was balanced on), rounding off above it
    const G = 1.58, KNEE = 0.4, Y = G * KNEE;
    const clip = shaper((x) => {
      const a = Math.abs(x);
      return a <= KNEE ? G * x : Math.sign(x) * (Y + (1 - Y) * Math.tanh(G * (a - KNEE) / (1 - Y)));
    }, '4x');
    const limiter = param(ctx.createDynamicsCompressor(), { threshold: -3, knee: 0, ratio: 20, attack: 0.001, release: 0.08 });
    this.master = gain(MASTER_GAIN);
    chain(this.bus, this.filter, gain(0.85), clip, limiter, this.master, ctx.destination);

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

  // impulse response of the room: 12 ms of air, a few early reflections off the nearest walls, then a 1 s
  // noise tail that gets darker as it dies; unit energy per channel, so the send gain is the wet level
  _room(ctx) {
    const R = ctx.sampleRate, pre = Math.round(R * 0.012), n = pre + Math.round(R * 1.0);
    const ir = ctx.createBuffer(2, n, R);
    for (let c = 0; c < 2; c++) {
      const d = ir.getChannelData(c);
      let lp = 0, energy = 0;
      for (let i = pre; i < n; i++) {
        const t = (i - pre) / R;
        lp += (0.2 + 0.6 * Math.exp(-t / 0.12)) * (Math.random() * 2 - 1 - lp);
        d[i] = lp * Math.exp(-t / 0.15);
      }
      for (const [t, v] of [[0.007, 1.4], [0.017, -1.1], [0.029, 0.8], [0.043, -0.6]]) d[pre + Math.round(R * t * rand(0.85, 1.15))] += v;
      for (let i = pre; i < n; i++) energy += d[i] * d[i];
      const k = 1 / Math.sqrt(energy || 1);
      for (let i = pre; i < n; i++) d[i] *= k;
    }
    return ir;
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

  // music dip under a loud sound: down fast (no click), held, back up slowly. A burst keeps it down instead of
  // pumping it shot by shot, and a deeper dip still running is kept.
  _duck(depth) {
    const now = this.ctx.currentTime, g = this.duck.gain;
    if (now < this.duckUntil) depth = Math.min(depth, this.duckDepth);
    this.duckDepth = depth;
    this.duckUntil = now + DUCK_HOLD;
    g.cancelScheduledValues(now);
    g.setTargetAtTime(depth, now, 0.015);
    g.setTargetAtTime(1, now + DUCK_HOLD, DUCK_RELEASE);
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
      this._kill(quietest, now, 0.02);
    }
    if (act.length >= GLOBAL_SOFT_CAP) {
      let weakest = null; // quietest of the lowest priority
      for (const a of act) if (!weakest || a.pri < weakest.pri || (a.pri === weakest.pri && a.vol < weakest.vol)) weakest = a;
      const better = meta.pri > weakest.pri || (meta.pri === weakest.pri && vol > weakest.vol * 1.5);
      if (!better || act.length >= GLOBAL_HARD_CAP && meta.pri <= weakest.pri) return null;
      this._kill(weakest, now, 0.02);
    }
    this.lastPlay[name] = { t: now, vol };
    const entry = { name, pri: meta.pri, vol, end: now + meta.dur, gain: null };
    act.push(entry);
    if (meta.duck < 1) this._duck(meta.duck);
    return entry;
  }

  // opts: x, y (positional), vol (loudness / how hard it was hit), choke (emitter key: a new play from the same
  // emitter fades its previous one, which keeps full-auto fire clean), weapon (weapon id for handling sounds),
  // pitch (voice of who makes it)
  play(name, opts = {}) {
    if (!this.ctx || this.ctx.state !== 'running') return;
    name = ALIAS[name] || name;
    const gun = GUNS[name], layers = FOLEY[name], recipe = !gun && this['_' + name];
    if (!gun && !layers && !recipe) return;
    const meta = META[name] || DEFAULT_META;
    const sp = this._spatial(opts, meta.reach);
    sp.vol *= meta.gain;
    if (sp.vol < 0.012) return; // inaudible
    const entry = this._admit(name, meta, sp.vol);
    if (!entry) return;
    if (opts.choke) {
      const prev = this.chokes.get(opts.choke);
      if (prev && prev.end > this.ctx.currentTime) this._kill(prev, this.ctx.currentTime, CHOKE);
      this.chokes.set(opts.choke, entry);
    }
    const shot = gun && SHOTS[name], buf = shot && this.buffers[shot.key];
    const o = entry.gain = this._out(sp, opts.dest || (buf ? this.shots : gun ? this[gun.bus || 'guns'] : this.sfx));
    if (gun) this._gun(o, gun, sp, opts, buf && shot, buf);
    else {
      o.gain.value = sp.vol * rand(0.88, 1.1); // never twice the same level
      this.pv = rand(0.95, 1.05) * (opts.pitch ?? 1);
      const v = clamp(opts.vol ?? 1, 0.1, 1.5); // how hard it was hit
      if (layers) this._foley(o, layers, v);
      if (recipe) recipe.call(this, o, opts, v);
    }
    if (!o._n) { // nothing to play (bank not loaded): free the voice
      o._chain.forEach((n) => n.disconnect());
      this.active.splice(this.active.indexOf(entry), 1);
    }
  }

  // ---- recordings ----
  // one cut of a recording into voice `o`, faded out over the end of the cut
  _sample(o, buf, { offset = 0, len = buf.duration, rate = 1, vol = 1, delay = 0, fade = FADE }) {
    const ctx = this.ctx, t = ctx.currentTime + delay, dur = len / rate;
    const s = ctx.createBufferSource(), g = ctx.createGain();
    s.buffer = buf;
    s.playbackRate.value = rate;
    g.gain.setValueAtTime(vol, t);
    g.gain.setValueAtTime(vol, t + Math.max(0, dur - fade));
    g.gain.linearRampToValueAtTime(0, t + dur);
    s.connect(g);
    g.connect(o);
    o._n++;
    s.onended = () => this._release(o, s, g);
    s.start(t, offset, len + 0.02);
  }

  // next cut [offset, length] of a bank set: drawn from a shuffled round, so none comes back before the others
  _pick(set) {
    const cuts = BANK[set];
    let bag = this.bags[set];
    if (!bag || !bag.length) {
      const last = bag && bag.last;
      bag = this.bags[set] = cuts.map((_, i) => i);
      for (let i = bag.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [bag[i], bag[j]] = [bag[j], bag[i]];
      }
      if (bag.length > 1 && bag[bag.length - 1] === last) bag.reverse(); // never the same cut twice in a row
    }
    return cuts[bag.last = bag.pop()];
  }

  // one cut of bank `set` into voice `o` (silent until the bank is loaded)
  _cut(o, set, { vol = 1, rate = 1, delay = 0 } = {}) {
    const buf = this.buffers.foley;
    if (!buf) return;
    const [offset, len] = this._pick(set);
    this._sample(o, buf, { offset, len, rate: rate * this.pv, vol, delay, fade: 0.004 });
  }

  // FOLEY layers; a harder hit (v) is a little brighter
  _foley(o, layers, v) {
    const k = 0.94 + 0.08 * Math.min(v, 1.2);
    for (const [set, vol, rate = 1, delay = 0, odds = 1] of layers) {
      if (odds >= 1 || Math.random() < odds) this._cut(o, set, { vol, rate: rate * k, delay });
    }
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

  // felt bass of a hit: a low sine (or triangle) whose pitch drops fast (over ~40 % of the decay)
  _thump(o, { f0 = 150, f1 = 50, dur = 0.1, vol = 0.8, delay = 0, type = 'sine' }) {
    const ctx = this.ctx, t = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(f0 * this.pv, t);
    osc.frequency.exponentialRampToValueAtTime(Math.max(10, f1 * this.pv), t + dur * 0.4);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.002);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g); g.connect(o);
    o._n++;
    osc.onended = () => this._release(o, osc, g);
    osc.start(t);
    osc.stop(t + dur + 0.03);
  }

  // ---- synthesized parts of the big sounds (their debris and flesh are FOLEY layers) ----
  _death(o) {
    this._thump(o, { f0: 90, f1: 28, dur: 0.6, vol: 0.7 });
    this._noiseBurst(o, { src: 'brown', type: 'lowpass', f0: 500, f1: 60, dur: 0.9, vol: 0.8 });
  }
  // a wall coming down: the weight of it under the falling rubble
  _crumble(o) {
    this._thump(o, { f0: 65, f1: 26, dur: 0.45, vol: 0.8 });
    this._noiseBurst(o, { src: 'brown', type: 'lowpass', f0: 900, f1: 90, dur: 0.7, vol: 0.8, attack: 0.006 });
  }
  // a shock front you feel first, the fireball, the boom coming back off the buildings, a long rumble, then the
  // debris raining down. With the recordings loaded, a slowed-down shotgun blast gives it the grain of a real one.
  _explosion(o) {
    const rec = this.buffers.shotgun;
    this._noiseBurst(o, { type: 'none', dur: 0.004, vol: 1.1, attack: 0.0001 });                                // shock front
    this._noiseBurst(o, { type: 'highpass', f0: 2200, f1: 900, q: 0.7, dur: 0.09, vol: 0.8, attack: 0.0003 }); // crack
    if (rec) {
      this._sample(o, rec, { len: 0.6, rate: 0.42 * this.pv, vol: 1.05 });
      this._sample(o, rec, { len: 0.45, rate: 0.27 * this.pv, vol: 0.7, delay: 0.03 });
    }
    this._thump(o, { f0: 110, f1: 24, dur: 1.3, vol: 1.05 });                                                    // sub drop
    this._thump(o, { type: 'triangle', f0: 170, f1: 55, dur: 0.16, vol: 0.55 });                                 // chest punch
    this._noiseBurst(o, { src: 'brown', type: 'lowpass', f0: 5200, f1: 90, dur: 1.1, vol: rec ? 0.7 : 1.15, attack: 0.002 }); // fireball
    this._noiseBurst(o, { f0: 900, f1: 180, q: 0.5, dur: 0.6, vol: 0.5, attack: 0.003 });                        // roar
    for (const [t, v] of [[0.16, 0.4], [0.33, 0.25]]) {                                                          // echoes
      this._noiseBurst(o, { src: 'brown', type: 'lowpass', f0: 1400, f1: 120, dur: 0.45, vol: v, attack: 0.01, delay: t });
      this._thump(o, { f0: 80, f1: 34, dur: 0.3, vol: v, delay: t });
    }
    this._noiseBurst(o, { src: 'brown', type: 'lowpass', f0: 260, f1: 45, dur: 2.2, vol: 0.6, attack: 0.15, delay: 0.1 }); // rumble
  }
  // the air let out of a tyre
  _tirePop(o) {
    this._noiseBurst(o, { type: 'lowpass', f0: 3000, f1: 200, dur: 0.13, vol: 1.0, attack: 0.002 });
    this._noiseBurst(o, { type: 'highpass', f0: 3500, f1: 2000, dur: 0.8, vol: 0.2, delay: 0.05, attack: 0.04 }); // hiss
  }
  // clothes rasping on the floor, lower as the slide slows down
  _slide(o) {
    this._noiseBurst(o, { f0: 1500, f1: 600, q: 0.6, dur: 0.5, vol: 0.5, attack: 0.03 });
  }

  // ---- guns ----
  // one shot: its recording when loaded (`shot`, `buf`) over the GUNS layers. Every shot differs a little (pitch,
  // level +-1 dB, tail length); with distance the crack and reflections fade first while the thump carries
  // (+ the _out lowpass).
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
      if (G.punch) this._thump(o, { type: 'triangle', f0: G.punch[0], f1: G.punch[1], dur: G.punch[2], vol: G.punch[3] * hi });
    }
    this._thump(o, { f0: T[0], f1: T[1], dur: T[2], vol: T[3] * lo * u });
    if (G.sub) this._thump(o, { f0: G.sub[0], f1: G.sub[1], dur: G.sub[2], vol: G.sub[3] * lo * u, delay: 0.004 });
    if (G.whoosh) {
      const [f0, f1, dur, vol] = G.whoosh;
      this._noiseBurst(o, { f0, f1, q: 1.1, dur, vol: vol * hi, attack: 0.05, delay: 0.01 });
      this._noiseBurst(o, { type: 'highpass', f0: 3500, f1: 1800, dur: dur * 0.8, vol: vol * 0.35 * hi, attack: 0.03, delay: 0.02 });
    }
    if (G.bolt) this._cut(o, 'click', { delay: G.bolt[0], vol: G.bolt[1] * hi, rate: G.bolt[2] });
    if (G.cycle) this._cut(o, G.cycle[0], { delay: G.cycle[1], vol: G.cycle[2] * hi, rate: G.cycle[3] });
    this._tail(o, G.tail, rand(0.85, 1.15), hi * u, lo * u);
    const c = G.casing;
    if (c && Math.random() < c[1]) this.play('shell', { x: opts.x, y: opts.y, vol: 0.6 * (opts.vol ?? 1), kind: c[0], delay: c[2] });
  }

  // the street answering: low rumble, a darker mid wash, and a few discrete slap echoes off nearby walls
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

  // ---- reloads and handling (opts.weapon = weapon id, opts.dur = reload length) ----
  _arms(opts) { return ARMS[opts.weapon] || ARMS.pistol; }

  // the mag pulled out, then clattering on the floor (Character drops it at 8 % of the reload)
  _magOut(o, opts) {
    const A = this._arms(opts);
    this._cut(o, 'magOut', { rate: A.rate });
    const t = 0.08 * (opts.dur ?? 1) + rand(0.26, 0.32);
    this._cut(o, 'plastic', { vol: 0.45, rate: 0.9 * A.rate, delay: t });
    this._cut(o, 'casing', { vol: 0.2, rate: 0.7, delay: t + rand(0.07, 0.1) });
  }
  // fresh mag pushed up the well and seated
  _magIn(o, opts) { this._cut(o, 'magIn', { rate: this._arms(opts).rate }); }
  // the weapon's action worked by hand (end of a reload, picking a gun up)
  _rack(o, opts) {
    const A = this._arms(opts);
    this._cut(o, A.rack, { rate: A.rate });
  }
  // one round loaded: a shell thumbed into the tube, or a rocket thunking home
  _shellIn(o, opts) {
    const A = this._arms(opts);
    if (A.load !== 'rocket') { this._cut(o, 'shellIn', { rate: A.rate }); return; }
    this._cut(o, 'magIn', { rate: A.rate });
    this._cut(o, 'thud', { vol: 0.6, rate: 1.1, delay: 0.05 });
  }
  // grabbing / shouldering a gun: hands on it, loose parts moving (+ a launcher's rocket sliding in over the reload)
  _handle(o, opts) {
    const A = this._arms(opts);
    this._cut(o, 'handle', { rate: A.rate });
    if (A.load === 'rocket' && opts.dur) {
      this._noiseBurst(o, { f0: 500, f1: 900, q: 1.5, dur: opts.dur * 0.55, vol: 0.3, attack: opts.dur * 0.4, delay: opts.dur * 0.35 });
    }
  }
  _pickup(o, opts) { this._handle(o, opts); }
  // dry fire: hammer / striker falling on nothing
  _click(o, opts) { this._cut(o, 'click', { rate: this._arms(opts).rate }); }
  // a casing bouncing on the floor (CASINGS kind, default 9 mm brass), bounces closer and quieter each time
  _shell(o, opts) {
    const C = CASINGS[opts.kind] || CASINGS['9mm'];
    let t = opts.delay || 0, gap = rand(0.07, 0.11), vol = 1;
    for (let i = 0; i < C.n; i++) {
      this._cut(o, C.set, { vol, rate: C.rate * (1 + 0.05 * i), delay: t });
      t += gap;
      gap *= 0.6;
      vol *= 0.45;
    }
  }
  // a round whining off a hard surface: a narrow band of noise falling away after the hit
  _ricochet(o) {
    const f = rand(3200, 4600);
    this._noiseBurst(o, { f0: f, f1: f * rand(0.3, 0.45), q: 14, dur: rand(0.18, 0.3), vol: 0.9, attack: 0.004, delay: 0.005 });
  }

  // ---- voices ----
  // someone hit for good: a short cry (opts.pitch: his voice)
  _cry(o) { this._cut(o, Math.random() < 0.6 ? 'die' : 'pain'); }

  // ---- fire, alarm, UI ----
  // car alarm: one whoop of a harsh horn siren per call (the vehicle repeats it), at a steady level
  _alarm(o) {
    const ctx = this.ctx, t = ctx.currentTime, dur = 0.37;
    const horn = ctx.createBiquadFilter(), env = ctx.createGain();
    horn.type = 'bandpass';
    horn.frequency.value = 2300;
    horn.Q.value = 0.9;
    env.gain.setValueAtTime(0.0001, t);
    env.gain.linearRampToValueAtTime(1, t + 0.008);
    env.gain.setValueAtTime(1, t + dur - 0.03);
    env.gain.linearRampToValueAtTime(0, t + dur);
    env.connect(horn);
    horn.connect(o);
    const oscs = [['sawtooth', 1], ['square', 1.007]].map(([type, k]) => {
      const osc = ctx.createOscillator(), g = ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(800 * k, t);
      osc.frequency.exponentialRampToValueAtTime(1600 * k, t + dur * 0.9);
      g.gain.value = 0.3;
      osc.connect(g);
      g.connect(env);
      o._n++;
      osc.start(t);
      osc.stop(t + dur + 0.01);
      return [osc, g];
    });
    oscs.forEach(([osc, g], i) => { osc.onended = () => this._release(o, osc, g, ...(i ? [env, horn] : [])); });
  }
  // fire: wood popping over a short flutter of flame
  _crackle(o) {
    this._noiseBurst(o, { src: 'brown', type: 'lowpass', f0: 500, f1: 300, dur: 0.3, vol: 0.3, attack: 0.08 });
    for (let i = 0; i < 3; i++) {
      this._noiseBurst(o, { type: 'highpass', f0: rand(1200, 3000), q: 0.7, dur: rand(0.008, 0.02), vol: rand(0.15, 0.4), delay: rand(0, 0.22), attack: 0.0005 });
    }
  }
  _ignite(o) {
    this._noiseBurst(o, { src: 'brown', type: 'lowpass', f0: 300, f1: 2200, dur: 0.5, vol: 1.1, attack: 0.12 });
    this._thump(o, { f0: 60, f1: 85, dur: 0.4, vol: 0.5 });
  }
  // a kill confirmed: a small bell struck just after the blow, its ring tuned to the strike; every kill of a
  // streak (opts.n) climbs one step of a pentatonic scale, so that bells still ringing agree with the new one
  _confirm(o, opts) {
    const k = 2 ** (STREAK[Math.min((opts.n || 1) - 1, STREAK.length - 1)] / 12);
    this.pv = 1;
    this._cut(o, 'ding', { rate: k, delay: 0.04 });
    this._cut(o, 'ring', { vol: 0.7, rate: 0.62 * k, delay: 0.045 });
  }
  // level cleared: one dark boom rolling away
  _clear(o) {
    this._thump(o, { f0: 75, f1: 30, dur: 1.4, vol: 1.0 });
    this._noiseBurst(o, { src: 'brown', type: 'lowpass', f0: 700, f1: 60, dur: 1.6, vol: 0.9, attack: 0.01 });
    this._noiseBurst(o, { f0: 2500, f1: 600, q: 0.5, dur: 1.2, vol: 0.1, attack: 0.3 });
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
