// A small offline sample player for the music extracts (tools/render_real.mjs): recorded instruments
// (tools/music_sources.json) played from a score into an OfflineAudioContext, with velocity layers, round robins,
// humanised timing, channel strips, reverb sends, a kick sidechain and a glue compressor. Runs in the browser.

export const SR = 44100;
// every source enters its strip about 10 dB down: headroom for the strips' compressors and saturation
const TRIM = 0.32;
const FILES = '/tools/music-samples/files/';

// ---------------------------------------------------------------- seeded randomness
export function rng(seed) {
  let s = seed >>> 0 || 1;
  const next = () => { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
  next.gauss = () => { let a = 0; for (let i = 0; i < 4; i++) a += next(); return (a - 2) / 0.577; };
  next.pick = (arr) => arr[Math.floor(next() * arr.length)];
  return next;
}

// ---------------------------------------------------------------- note names
const PC = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 };
// 'ab3', 'C#4', 'Bb2', 'A-1' -> MIDI number (C4 = 60) + shift
export function noteNum(name, shift = 0) {
  const m = /^([a-gA-G])(#|b|s)?(-?\d)$/.exec(name);
  if (!m) return null;
  const acc = m[2] === '#' || m[2] === 's' ? 1 : m[2] === 'b' ? -1 : 0;
  return 12 * (+m[3] + 1) + PC[m[1].toLowerCase()] + acc + shift;
}
export const N = (name) => noteNum(name);

// ---------------------------------------------------------------- libraries: which files make an instrument
// level: a library's gain against the others (measured stems: the overhead hats are recorded far quieter)
// parse(file) -> { art, note, layer, rr } or null; layer: higher = louder. shift: the octave of a library's note names
// against MIDI (C4 = 60), measured with --probe (the samples' pitch)
const dyn = { pp: 0, p: 1, mp: 2, mf: 3, f: 4, ff: 5 };
export const LIBS = {
  kick: { src: 'virtuosity', dir: 'Samples/kickmic/kick/', parse: (f) => vlrr(f, 'kick', /kick_snoff_vl(\d+)_rr(\d+)/) },
  kickRoom: { src: 'virtuosity', dir: 'Samples/room/kick/', parse: (f) => vlrr(f, 'kick', /kick_snoff_vl(\d+)_rr(\d+)/) },
  snare: { src: 'virtuosity', level: 2, dir: 'Samples/snaremic/snare/', parse: (f) => snare(f) },
  snareRoom: { src: 'virtuosity', dir: 'Samples/room/snare/', parse: (f) => snare(f) },
  hat: { src: 'virtuosity', level: 10, dir: 'Samples/oh/hh/', parse: (f) => { const m = /hh_(closed|half|open|pedal)_vl(\d+)_rr(\d+)/.exec(f); return m && { art: m[1], note: 0, layer: +m[2], rr: +m[3] }; } },
  crash: { src: 'virtuosity', level: 3, dir: 'Samples/oh/crash/', parse: (f) => vlrr(f, 'crash', /crash_vl(\d+)_rr(\d+)/) },
  ride: { src: 'virtuosity', level: 3, dir: 'Samples/oh/ride/', parse: (f) => { const m = /ride_(\w+?)_vl(\d+)_rr(\d+)/.exec(f); return m && { art: m[1], note: 0, layer: +m[2], rr: +m[3] }; } },
  conga: { level: 2.5, src: 'virtuosity', dir: 'Samples/perc/close/conga/', parse: (f) => { const m = /Conga_(\d+)_(\w+?)_(\d+)_(\d+)_rr(\d+)/.exec(f); return m && { art: m[1] === '17' ? 'mute' : 'open', note: 0, layer: +m[3], rr: +m[5] }; } },
  bongo: { level: 3, src: 'virtuosity', dir: 'Samples/perc/close/', parse: (f) => { const m = /Bongo([HL])_Hit1_v(\d)_rr(\d)/.exec(f); return m && { art: m[1] === 'H' ? 'hi' : 'lo', note: 0, layer: +m[2], rr: +m[3] }; } },
  shaker: { level: 4, src: 'virtuosity', dir: 'Samples/perc/close/shaker/', parse: (f) => { const m = /Shake1([DU])_rr(\d+)/.exec(f); return m && { art: m[1] === 'D' ? 'down' : 'up', note: 0, layer: 1, rr: +m[2] }; } },
  tamb: { level: 12, src: 'virtuosity', dir: 'Samples/perc/close/tambourine/', parse: (f) => { const m = /Tamb1_Shake_rr(\d+)/.exec(f); return m && { art: 'shake', note: 0, layer: 1, rr: +m[1] }; } },
  cowbell: { level: 1.5, src: 'virtuosity', dir: 'Samples/perc/close/cowbell/', parse: (f) => { const m = /_v(\d)_rr(\d)/.exec(f); return m && { art: 'hit', note: 0, layer: +m[1], rr: +m[2] }; } },
  clap: { src: 'body', dir: 'Samples/body/', parse: (f) => { const m = /^(handclap|fingerclap|snap)_(?:[lr]_)?(?:vl(\d)_)?rr(\d)/.exec(f); return m && { art: m[1], note: 0, layer: +(m[2] || 1), rr: +m[3] }; } },
  bass: { src: 'bass', dir: 'Samples/darkblack/', shift: -12, parse: (f, s) => { const m = /darkblack_([a-g]b?\d)_(?:(ghost|stac)_)?(?:(p|mp|mf|f)_)?rr(\d)/.exec(f); return m && { art: m[2] || 'reg', note: noteNum(m[1], s), layer: dyn[m[3] || 'f'], rr: +m[4] }; } },
  guitar: { src: 'guitar', dir: 'Samples/black/', shift: -12, parse: (f, s) => {
    let m = /twang_([a-g]b?\d)_(p|mf|f)_rr(\d)/.exec(f); if (m) return { art: 'ord', note: noteNum(m[1], s), layer: dyn[m[2]], rr: +m[3] };
    m = /release_([a-g]b?\d)_rr(\d)/.exec(f); if (m) return { art: 'rel', note: noteNum(m[1], s), layer: 1, rr: +m[2] };
    m = /staccato_([a-g]b?\d)_rr(\d)/.exec(f); return m && { art: 'stac', note: noteNum(m[1], s), layer: 1, rr: +m[2] }; } },
  violins: { level: 3, src: 'vsco', dir: 'Strings/Violin Section/', parse: (f) => vsco(f, /VlnEns_(Spic|susVib)_([A-G]#?-?\d)_v(\d)(?:_rr(\d))?/) },
  violas: { level: 6, src: 'vsco', dir: 'Strings/Viola Section/', parse: (f) => vsco(f, /Viol\w+?_(spic|susvib)_([A-G]#?-?\d)_v(\d)(?:_(?:rr)?(\d))?/) },
  celli: { level: 2, src: 'vsco', dir: 'Strings/Cello Section/', parse: (f) => vsco(f, /(spic|susvib)_([A-G]#?-?\d)_v(\d)(?:_(?:RR|rr)?(\d))?/) },
  trumpet: { level: 4, src: 'vsco', dir: 'Brass/Trumpet/stac/', parse: (f) => vsco(f, /Trumpet_(stac)_([A-G]#?-?\d)_v(\d)_rr(\d)/) },
  trombone: { level: 6, src: 'vsco', dir: 'Brass/Tenor Trombone/stac/', parse: (f) => vsco(f, /tenortbn_(stac)_([A-G]#?-?\d)_v(\d)_r+(\d)/) },
  sax: { src: 'sax', dir: 'Samples/alto/', shift: 12, parse: (f, s) => { const m = /^([a-g]b?\d)_(f|p)_rr(\d)_cnd/.exec(f); return m && { art: 'sus', note: noteNum(m[1], s), layer: dyn[m[2]], rr: +m[3] }; } },
  piano: { src: 'piano', dir: 'UC/A/', shift: 12, parse: (f, s) => { const m = /MicA_([A-G]#?-?\d)_vl(\d)/.exec(f); return m && { art: 'ord', note: noteNum(m[1], s), layer: +m[2], rr: 1 }; } },
  rhodes: { src: 'rhodes', level: 0.3, dir: 'jRhodes3d-mono/', parse: (f) => { const m = /A_(\d+)__\w+?_(\d)\.flac/.exec(f); return m && { art: 'ord', note: +m[1], layer: 6 - m[2], rr: 1 }; } }, // _5 is the softest
};
function vlrr(f, art, re) { const m = re.exec(f); return m && { art, note: 0, layer: +m[1], rr: +m[2] }; }
function snare(f) { const m = /snare_(center|rimshot|crossstick)_vl(\d+)/.exec(f); return m && { art: m[1], note: 0, layer: +m[2], rr: 1 }; }
function vsco(f, re) {
  const m = re.exec(f);
  if (!m) return null;
  const art = /^s(pic|tac)/i.test(m[1]) ? 'short' : 'long';
  return { art, note: noteNum(m[2], 12), layer: +m[3], rr: +(m[4] || 1) };
}

let manifest = null;
async function getManifest() {
  if (!manifest) manifest = await (await fetch('/tools/music_sources.json')).json();
  return manifest;
}

// first sound in a buffer (-46 dB under its peak), minus 1.5 ms: the sample starts there so it lands on the beat
function onsetOf(buf) {
  const x = buf.getChannelData(0);
  let peak = 0;
  for (let i = 0; i < x.length; i++) peak = Math.max(peak, Math.abs(x[i]));
  const th = peak * 0.005;
  for (let i = 0; i < x.length; i++) if (Math.abs(x[i]) > th) return Math.max(0, i / buf.sampleRate - 0.0015);
  return 0;
}

// ---------------------------------------------------------------- loading
const cache = new Map();
export async function loadLib(ctx, key) {
  if (cache.has(key)) return cache.get(key);
  const L = LIBS[key], man = await getManifest();
  const src = man.sources.find((s) => s.id === L.src);
  const files = src.files.filter((f) => f.startsWith(L.dir));
  const zones = [];
  await Promise.all(files.map(async (f) => {
    const name = f.slice(f.lastIndexOf('/') + 1);
    const z = L.parse(name, L.shift || 0);
    if (!z || z.note == null) return;
    const url = FILES + L.src + '/' + f.split('/').map(encodeURIComponent).join('/');
    const data = await (await fetch(url)).arrayBuffer();
    z.buf = await ctx.decodeAudioData(data);
    z.on = onsetOf(z.buf);
    z.file = f;
    zones.push(z);
  }));
  const lib = { key, zones, arts: {} };
  for (const z of zones) (lib.arts[z.art] ||= []).push(z);
  for (const a of Object.values(lib.arts)) {
    a.notes = [...new Set(a.map((z) => z.note))].sort((p, q) => p - q);
    a.layers = [...new Set(a.map((z) => z.layer))].sort((p, q) => p - q);
  }
  cache.set(key, lib);
  return lib;
}

// ---------------------------------------------------------------- pitch check (YIN on a 90 ms window)
export function pitchOf(buf, at = 0.12) {
  const x = buf.getChannelData(0), sr = buf.sampleRate, a = Math.floor((onsetOf(buf) + at) * sr), W = Math.floor(0.09 * sr);
  const maxT = Math.floor(sr / 28), minT = Math.floor(sr / 1600);
  if (a + W + maxT > x.length) return null;
  const d = new Float64Array(maxT + 1);
  for (let t = 1; t <= maxT; t++) { let s = 0; for (let i = 0; i < W; i++) { const v = x[a + i] - x[a + i + t]; s += v * v; } d[t] = s; }
  let run = 0;
  for (let t = 1; t <= maxT; t++) { run += d[t]; d[t] = (d[t] * t) / (run || 1); }
  for (let t = minT; t < maxT; t++) {
    if (d[t] < 0.15 && d[t] <= d[t + 1]) {
      const p = t + (d[t - 1] - d[t + 1]) / (2 * (d[t - 1] - 2 * d[t] + d[t + 1]) || 1);
      return 69 + 12 * Math.log2(sr / p / 440);
    }
  }
  return null;
}

// ---------------------------------------------------------------- the mixer
export class Session {
  // solo: stems to keep (a strip 'kick.sub' is in stem 'kick'; a bus strip '_x' is never muted), to measure a stem alone
  // mix: a gain per stem from the balancing pass (tools/music-real/mix.json)
  constructor(seconds, seed, solo = null, mix = {}) {
    this.solo = solo;
    this.mix = mix || {};
    this.ctx = new OfflineAudioContext(2, Math.ceil(seconds * SR), SR);
    this.r = rng(seed);
    this.libs = {};
    this.strips = {};
    this.kicks = [];
    const c = this.ctx;
    this.master = c.createGain(); this.master.gain.value = 0.5; // 6 dB of headroom into the glue
    this.glue = c.createDynamicsCompressor();
    Object.assign(this.glue, {});
    this.glue.threshold.value = -16; this.glue.ratio.value = 2.2; this.glue.attack.value = 0.012; this.glue.release.value = 0.18; this.glue.knee.value = 8;
    // a mastering tilt: a little less low end, a little more presence and air
    let m = this.master;
    for (const [type, f, g, q] of [['lowshelf', 110, -2, 0.7], ['peaking', 2800, 1.5, 0.8], ['highshelf', 8500, 3, 0.7]]) {
      const b = c.createBiquadFilter(); b.type = type; b.frequency.value = f; b.gain.value = g; b.Q.value = q; m.connect(b); m = b;
    }
    m.connect(this.glue).connect(c.destination);
    // buses: drums straight to the master, music through the sidechain gain
    this.drums = c.createGain(); this.drums.connect(this.master);
    this.music = c.createGain(); this.duck = c.createGain(); this.music.connect(this.duck).connect(this.master);
    this.reverbs = {};
  }
  async load(...keys) { for (const k of keys) this.libs[k] = await loadLib(this.ctx, k); }

  // a reverb return: decaying stereo noise, the highs dying first; pre-delay; its own EQ
  reverb(name, { time = 2.2, pre = 0.02, damp = 0.5, gain = 1, hp = 250, lp = 9000 } = {}) {
    if (this.reverbs[name]) return this.reverbs[name];
    const c = this.ctx, len = Math.ceil((time + pre) * SR), ir = c.createBuffer(2, len, SR), r = rng(7 + name.length * 31);
    for (let ch = 0; ch < 2; ch++) {
      const d = ir.getChannelData(ch);
      let lpState = 0;
      for (let i = Math.floor(pre * SR); i < len; i++) {
        const t = i / SR - pre, env = Math.exp((-6.9 * t) / time);
        const k = Math.min(0.95, 0.15 + 0.8 * Math.exp((-t * 3) / (time * damp)));
        lpState += k * ((r() * 2 - 1) - lpState);
        d[i] = lpState * env * (t < 0.004 ? t / 0.004 : 1);
      }
    }
    const conv = c.createConvolver(); conv.normalize = true; conv.buffer = ir;
    const hpf = c.createBiquadFilter(); hpf.type = 'highpass'; hpf.frequency.value = hp;
    const lpf = c.createBiquadFilter(); lpf.type = 'lowpass'; lpf.frequency.value = lp;
    const out = c.createGain(); out.gain.value = gain;
    const input = c.createGain();
    input.connect(hpf).connect(conv).connect(lpf).connect(out).connect(this.music);
    return (this.reverbs[name] = input);
  }

  // a tempo delay return (ping-pong): time in s, feedback, its own filter
  delay(name, { time = 0.375, fb = 0.35, lp = 4000, hp = 300, gain = 1 } = {}) {
    if (this.reverbs[name]) return this.reverbs[name];
    const c = this.ctx, input = c.createGain(), l = c.createDelay(4), r = c.createDelay(4), fl = c.createGain(), fr = c.createGain();
    const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = lp;
    const h = c.createBiquadFilter(); h.type = 'highpass'; h.frequency.value = hp;
    l.delayTime.value = time; r.delayTime.value = time; fl.gain.value = fb; fr.gain.value = fb;
    const merge = c.createChannelMerger(2), out = c.createGain(); out.gain.value = gain;
    input.connect(h).connect(f).connect(l);
    l.connect(fl).connect(r); r.connect(fr).connect(l);
    l.connect(merge, 0, 0); r.connect(merge, 0, 1);
    merge.connect(out).connect(this.music);
    return (this.reverbs[name] = input);
  }

  // a channel strip: gain -> highpass -> EQ bands -> optional compressor / drive -> pan -> bus, + reverb sends
  strip(name, { bus = 'music', gain = 1, hp = 30, lp = 20000, eq = [], comp = null, drive = 0, pan = 0, sends = {}, width = 1, autopan = null } = {}) {
    const c = this.ctx, input = c.createGain();
    let node = input;
    const chain = (n) => { node.connect(n); node = n; return n; };
    const h = chain(c.createBiquadFilter()); h.type = 'highpass'; h.frequency.value = hp; h.Q.value = 0.7;
    const l = chain(c.createBiquadFilter()); l.type = 'lowpass'; l.frequency.value = lp; l.Q.value = 0.7;
    for (const [type, f, g, q = 1] of eq) { const b = chain(c.createBiquadFilter()); b.type = type; b.frequency.value = f; b.gain.value = g; b.Q.value = q; }
    if (comp) {
      const k = chain(c.createDynamicsCompressor());
      k.threshold.value = comp.th ?? -18; k.ratio.value = comp.ratio ?? 4; k.attack.value = comp.att ?? 0.005; k.release.value = comp.rel ?? 0.1; k.knee.value = comp.knee ?? 4;
      const mk = chain(c.createGain()); mk.gain.value = comp.makeup ?? 1;
    }
    if (drive > 0) { // tanh saturation, unity at full scale, room for 12 dB over it before the curve's end
      const pre = chain(c.createGain()); pre.gain.value = 0.25;
      const ws = chain(c.createWaveShaper()), n = 4096, curve = new Float32Array(n);
      for (let i = 0; i < n; i++) { const x = ((i / (n - 1)) * 2 - 1) * 4; curve[i] = Math.tanh(x * (1 + drive)) / Math.tanh(1 + drive); }
      ws.curve = curve; ws.oversample = '4x';
    }
    const g = chain(c.createGain()); g.gain.value = this.solo && !name.startsWith('_') && !this.solo.includes(name.split('.')[0]) ? 0 : gain * (this.mix[name.split('.')[0]] ?? 1);
    const p = chain(c.createStereoPanner()); p.pan.value = pan;
    p.connect(bus === 'drums' ? this.drums : bus === 'master' ? this.master : bus === 'music' ? this.music : bus.input || bus);
    for (const [rv, amt] of Object.entries(sends)) { const s = c.createGain(); s.gain.value = amt; g.connect(s).connect(this.reverbs[rv] || this.reverb(rv)); }
    if (autopan) { const o = c.createOscillator(), d = c.createGain(); o.frequency.value = autopan.rate; d.gain.value = autopan.depth; o.connect(d).connect(p.pan); o.start(0); }
    const S = { input, filter: l, gain: g, pan: p, width };
    this.strips[name] = S;
    return S;
  }

  // play one recorded note. o: { art, note, vel (0..1), dur, rel, att, pan, gain, offset, layerBias, detune, fade }
  play(libKey, strip, t, o = {}) {
    const lib = this.libs[libKey], arts = lib.arts[o.art || Object.keys(lib.arts)[0]];
    if (!arts) throw new Error(`${libKey}: no articulation ${o.art}`);
    const want = o.note ?? arts.notes[0];
    let root = arts.notes[0];
    for (const n of arts.notes) if (Math.abs(n - want) < Math.abs(root - want) || (Math.abs(n - want) === Math.abs(root - want) && n > want)) root = n;
    const vel = Math.max(0, Math.min(1, o.vel ?? 0.8));
    const atRoot = arts.filter((z) => z.note === root);
    const layers = [...new Set(atRoot.map((z) => z.layer))].sort((a, b) => a - b);
    const li = Math.max(0, Math.min(layers.length - 1, Math.floor(vel * layers.length * 0.999 + (o.layerBias || 0))));
    const pool = atRoot.filter((z) => z.layer === layers[li]);
    const key = libKey + o.art + root + li;
    this.lastRR ||= {};
    let z = pool[Math.floor(this.r() * pool.length)];
    if (pool.length > 1 && z === this.lastRR[key]) z = pool[(pool.indexOf(z) + 1) % pool.length];
    this.lastRR[key] = z;
    const c = this.ctx, src = c.createBufferSource();
    src.buffer = z.buf;
    src.playbackRate.value = Math.pow(2, (want - root + (o.detune || 0) / 100) / 12);
    const g = c.createGain(), peak = TRIM * (LIBS[libKey].level ?? 1) * (o.gain ?? 1) * (0.55 + 0.45 * vel);
    const att = o.att ?? 0.002, rel = o.rel ?? 0.08;
    const start = Math.max(0, t);
    g.gain.setValueAtTime(0, start);
    g.gain.linearRampToValueAtTime(peak, start + att);
    let end = start + (z.buf.duration - z.on) / src.playbackRate.value;
    if (o.dur != null) {
      const off = start + Math.max(att, o.dur);
      g.gain.setValueAtTime(peak, off);
      g.gain.setTargetAtTime(0, off, rel / 4);
      end = Math.min(end, off + rel * 2);
    }
    let node = src;
    if (o.lp) { const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = o.lp; f.Q.value = 0.5; node.connect(f); node = f; }
    node.connect(g);
    let out = g;
    if (o.pan) { const p = c.createStereoPanner(); p.pan.value = o.pan; g.connect(p); out = p; }
    out.connect((strip.input || strip));
    src.start(start, z.on + (o.offset || 0));
    src.stop(end + 0.01);
    return z;
  }

  // the kick drives the music bus' duck: depth (0..1) and how long it takes to come back (s)
  sidechain(times, depth = 0.4, back = 0.16) {
    const g = this.duck.gain;
    g.setValueAtTime(1, 0);
    for (const t of times) {
      g.setValueAtTime(1, Math.max(0, t - 0.002));
      g.linearRampToValueAtTime(1 - depth, t + 0.004);
      g.setTargetAtTime(1, t + 0.02, back / 3.5);
    }
  }

  // an analog-style synth voice (Italo bass, pad, lead): detuned oscillators -> resonant lowpass with an envelope
  synth(strip, t, { note, dur = 0.2, vel = 0.8, wave = 'sawtooth', detune = 8, voices = 2, cutoff = 800, envAmt = 2400, q = 4, decay = 0.15, att = 0.003, rel = 0.05, sustain = 0.6, glideFrom = null, glide = 0.04, vib = 0, gain = 0.3, sub = 0 }) {
    const c = this.ctx, f0 = 440 * Math.pow(2, (note - 69) / 12);
    const flt = c.createBiquadFilter(); flt.type = 'lowpass'; flt.Q.value = q;
    const amp = c.createGain();
    flt.connect(amp).connect(strip.input);
    const end = t + dur + rel * 4;
    const oscs = [];
    for (let v = 0; v < voices; v++) {
      const o = c.createOscillator(); o.type = wave;
      const cents = voices > 1 ? (v / (voices - 1) - 0.5) * 2 * detune : 0;
      if (glideFrom != null) { o.frequency.setValueAtTime(440 * Math.pow(2, (glideFrom - 69) / 12), t); o.frequency.exponentialRampToValueAtTime(f0, t + glide); } else o.frequency.value = f0;
      o.detune.value = cents;
      o.connect(flt); oscs.push(o);
    }
    if (sub) { const o = c.createOscillator(); o.type = 'sine'; o.frequency.value = f0 / 2; const sg = c.createGain(); sg.gain.value = sub; o.connect(sg).connect(amp); oscs.push(o); }
    if (vib) { const l = c.createOscillator(), lg = c.createGain(); l.frequency.value = 5.5; lg.gain.setValueAtTime(0, t); lg.gain.linearRampToValueAtTime(vib, t + 0.35); l.connect(lg); for (const o of oscs) lg.connect(o.detune); l.start(t); l.stop(end); }
    flt.frequency.setValueAtTime(cutoff + envAmt * vel, t);
    flt.frequency.setTargetAtTime(cutoff, t + att, decay / 3);
    const pk = TRIM * gain * (0.5 + 0.5 * vel);
    amp.gain.setValueAtTime(0, t); amp.gain.linearRampToValueAtTime(pk, t + att);
    amp.gain.setTargetAtTime(pk * sustain, t + att, decay / 3);
    amp.gain.setValueAtTime(pk * sustain, t + dur); amp.gain.setTargetAtTime(0, t + dur, rel / 3);
    for (const o of oscs) { o.start(t); o.stop(end); }
  }

  // the low thump layered under a recorded kick: a sine falling from f1 to f0
  thump(strip, t, { f0 = 48, f1 = 110, drop = 0.045, decay = 0.26, gain = 0.6, vel = 1 } = {}) {
    const c = this.ctx, o = c.createOscillator(), g = c.createGain();
    o.frequency.setValueAtTime(f1, t); o.frequency.exponentialRampToValueAtTime(f0, t + drop);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(TRIM * gain * vel, t + 0.002);
    g.gain.setTargetAtTime(0, t + 0.03, decay / 3);
    o.connect(g).connect(strip.input);
    o.start(t); o.stop(t + decay * 2 + 0.05);
  }

  async render() {
    const b = await this.ctx.startRendering();
    return [b.getChannelData(0), b.getChannelData(1)];
  }
}

// ---------------------------------------------------------------- time
// a grid with swing on the off 16ths: t(bar, step) in seconds
export function grid(bpm, { swing = 0, start = 0.05 } = {}) {
  const s16 = 60 / bpm / 4;
  const t = (bar, step = 0) => start + (bar * 16 + step) * s16 + ((Math.round(step * 2) / 2) % 2 === 1 ? swing * s16 : 0);
  t.s16 = s16; t.beat = s16 * 4; t.bar = s16 * 16;
  return t;
}
