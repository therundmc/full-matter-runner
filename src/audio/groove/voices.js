// The instruments of the groove tracks, synthesized sample by sample into plain arrays (no WebAudio here: Groove.js
// wraps them in AudioBuffers once and plays them as one-shots). Deterministic: a render depends on its spec only
// (the noise is seeded from it).
//   drums      kick, snare, clap, hat (closed / open), shaker, tamb, conga, cowbell, clave, rim, tom, crash, swell
//   bass       finger (a plucked string, Karplus-Strong, round), slap (thumbed roots, popped octaves), synth (Italo:
//              a saw through a 24 dB lowpass snapping shut), moog (boogie: square + saw, a squelchy resonant sweep)
//   guitar     a plucked string (Karplus-Strong) per note: palm-muted (short, dark), open (ringing); chords strummed
//              down / up, dead strums; then a little amp drive, a wah (an envelope wah or a cocked one) and a cabinet
//   keys       rhodes (two-operator FM with its tine's bell), poly (a Juno-like chord: saws + sub, chorused), strings
//              (an ensemble of detuned saws, slow bow), brass (saws, a scoop up and a blat of the filter), chop (a
//              disco record's chord: strings + brass + a strum, dulled like an old pressing)
//   leads      square (Italo), saw (dark, detuned), sun (a soft flute-like synth), talk (a talkbox: a saw through moving
//              vowel formants), vox (a vocoder-like choir)
// Every render returns { ch: [Float32Array, ...] (1 or 2 channels), rate } normalized to a peak of 1; `rate` is the
// sample rate it was made at (the sustained voices are made at half the context's: they have nothing up there).

const TAU = Math.PI * 2;
export const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
const hashStr = (s) => [...s].reduce((h, c) => Math.imul(h ^ c.charCodeAt(0), 16777619), 2166136261);
function rng(seed) { // mulberry32
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------- small DSP blocks
// one-pole lowpass coefficient for a cutoff
const k1 = (f, sr) => 1 - Math.exp((-TAU * Math.min(f, sr * 0.45)) / sr);

// RBJ biquad (direct form I) whose coefficients can be moved (set) while it runs
function biquad(sr) {
  let b0 = 1, b1 = 0, b2 = 0, a1 = 0, a2 = 0, x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  return {
    set(type, f, Q = 0.707) {
      const w = (TAU * Math.min(Math.max(f, 10), sr * 0.45)) / sr, cw = Math.cos(w), al = Math.sin(w) / (2 * Q);
      const a0 = 1 + al;
      if (type === 'lp') { b0 = (1 - cw) / 2 / a0; b1 = (1 - cw) / a0; b2 = b0; }
      else if (type === 'hp') { b0 = (1 + cw) / 2 / a0; b1 = -(1 + cw) / a0; b2 = b0; }
      else { b0 = al / a0; b1 = 0; b2 = -al / a0; } // band-pass, 0 dB peak
      a1 = (-2 * cw) / a0; a2 = (1 - al) / a0;
      return this;
    },
    run(x) {
      const y = b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
      x2 = x1; x1 = x; y2 = y1; y1 = y;
      return y;
    },
  };
}

// polyBLEP: the step correction that keeps a naive saw / square from aliasing
function blep(t, dt) {
  if (t < dt) { t /= dt; return t + t - t * t - 1; }
  if (t > 1 - dt) { t = (t - 1) / dt; return t * t + t + t + 1; }
  return 0;
}
// a band-limited oscillator: step(f) -> the next sample of a saw ('saw'), square ('sq') or triangle-ish ('tri')
function osc(sr, kind, phase = 0) {
  let p = phase, tri = 0;
  return (f) => {
    const dt = f / sr;
    p += dt; if (p >= 1) p -= 1;
    if (kind === 'saw') return 2 * p - 1 - blep(p, dt);
    let sq = (p < 0.5 ? 1 : -1) + blep(p, dt) - blep((p + 0.5) % 1, dt);
    if (kind === 'sq') return sq;
    tri += sq * dt * 4; tri *= 0.999; // a leaky integrated square: a triangle
    return tri;
  };
}

const normalize = (chs, gain = 1) => {
  let peak = 0;
  for (const d of chs) for (let i = 0; i < d.length; i++) peak = Math.max(peak, Math.abs(d[i]));
  const k = peak ? gain / peak : 1;
  for (const d of chs) {
    for (let i = 0; i < d.length; i++) d[i] *= k;
    const fade = Math.min(64, d.length); // no click at the end of a cut
    for (let i = 0; i < fade; i++) d[d.length - 1 - i] *= i / fade;
  }
  return chs;
};

// Karplus-Strong string: `secs` of a string at `f` Hz plucked with `bright` (0..1), decaying to -60 dB in `t60` s,
// plucked at `pos` of its length (the comb that gives a pick its place), into `out` from sample `at` (added)
function pluckString(out, at, sr, f, { t60 = 1, bright = 0.5, pos = 0.18, amp = 1, damp = 0.5 }, r) {
  const D = sr / f - 0.5, N = Math.floor(D), frac = D - N;
  const len = N + 2, buf = new Float32Array(len);
  // the excitation: one period of lowpassed noise, the pick position's comb taken off it
  const ex = new Float32Array(N + 1);
  let lp = 0;
  const kb = k1(300 + 9000 * bright * bright, sr);
  for (let i = 0; i <= N; i++) { lp += kb * (r() * 2 - 1 - lp); ex[i] = lp; }
  const P = Math.max(1, Math.round(N * pos));
  for (let i = N; i >= P; i--) ex[i] -= ex[i - P];
  const g = Math.pow(10, -3 / (t60 * f)); // loss per period
  let w = 0, prev = 0;
  for (let i = at; i < out.length; i++) {
    const n = i - at;
    const rd = (1 - frac) * buf[(w - N + len * 4) % len] + frac * buf[(w - N - 1 + len * 4) % len];
    const y = (n <= N ? ex[n] : 0) + g * ((1 - damp) * rd + damp * prev);
    prev = rd;
    buf[w] = y;
    w = (w + 1) % len;
    out[i] += y * amp;
  }
}

// ---------------------------------------------------------------- drum kits
// the parameters of each kit's drums (a track names its kit; the render keys carry the kit name)
const KITS = {
  // round, long, a soft click: the disco records
  disco: { kick: { f0: 49, f1: 155, pd: 0.045, decay: 0.19, click: 0.4, drive: 1.3 }, snare: { tone: 200, decay: 0.16, bright: 7000, body: 0.7 },
    hat: { decay: 0.035, ratio: 1.7 }, ohat: { decay: 0.32 } },
  // short and punchy, a drum machine's: the Italo records
  linn: { kick: { f0: 53, f1: 190, pd: 0.03, decay: 0.14, click: 0.6, drive: 1.6 }, snare: { tone: 210, decay: 0.13, bright: 8000, body: 0.9 },
    hat: { decay: 0.028, ratio: 1.9 }, ohat: { decay: 0.22 } },
  // hard, driven, a long sub: the dark nu-disco of the fights
  nudisco: { kick: { f0: 48, f1: 210, pd: 0.035, decay: 0.19, click: 0.8, drive: 1.9 }, snare: { tone: 190, decay: 0.17, bright: 6500, body: 0.8 },
    hat: { decay: 0.03, ratio: 1.6 }, ohat: { decay: 0.26 } },
  // warm, a dry kick and a rimshot snare: the boogie and the Balearic records
  boogie: { kick: { f0: 52, f1: 145, pd: 0.05, decay: 0.16, click: 0.35, drive: 1.2 }, snare: { tone: 230, decay: 0.12, bright: 5500, body: 1 },
    hat: { decay: 0.03, ratio: 1.5 }, ohat: { decay: 0.28 } },
};

function kick(sr, r, { f0, f1, pd, decay, click, drive }) {
  const d = new Float32Array(Math.ceil(sr * (decay * 3.2 + 0.05)));
  let ph = 0, lp = 0, hp = 0;
  const kc = k1(5000, sr), kh = k1(900, sr), th = Math.tanh(drive);
  for (let i = 0; i < d.length; i++) {
    const t = i / sr;
    ph += (TAU * (f0 + (f1 - f0) * Math.exp(-t / pd) + 420 * Math.exp(-t / 0.003))) / sr;
    const body = Math.sin(ph) * Math.min(1, t / 0.0015) * Math.exp(-Math.max(0, t - 0.012) / decay);
    lp += kc * (r() * 2 - 1 - lp); hp += kh * (lp - hp);
    d[i] = Math.tanh(drive * (body + (lp - hp) * click * 2.5 * Math.exp(-t / 0.004))) / th;
  }
  return [d];
}

function snare(sr, r, { tone, decay, bright, body }) {
  const d = new Float32Array(Math.ceil(sr * decay * 4));
  const bp = biquad(sr).set('bp', bright * 0.6, 0.7), hp = biquad(sr).set('hp', 1200, 0.7);
  for (let i = 0; i < d.length; i++) {
    const t = i / sr;
    const n = hp.run(bp.run(r() * 2 - 1)) * Math.exp(-t / decay) * 1.6;
    const b = (Math.sin(TAU * tone * t * (1 + 0.25 * Math.exp(-t / 0.01))) * Math.exp(-t / 0.05)
      + 0.5 * Math.sin(TAU * tone * 1.7 * t) * Math.exp(-t / 0.03)) * body;
    d[i] = Math.tanh(1.4 * (n + b));
  }
  return [d];
}

function clap(sr, r) {
  const d = new Float32Array(Math.ceil(sr * 0.4));
  const bp = biquad(sr).set('bp', 1250, 1.4), bp2 = biquad(sr).set('bp', 2400, 1);
  const bursts = [0, 0.011, 0.022, 0.031];
  for (let i = 0; i < d.length; i++) {
    const t = i / sr;
    let env = t >= 0.031 ? Math.exp(-(t - 0.031) / 0.11) : 0;
    for (const o of bursts) if (t >= o && t < o + 0.011) env = Math.max(env, Math.exp(-(t - o) / 0.0045));
    const x = r() * 2 - 1;
    d[i] = (bp.run(x) + 0.5 * bp2.run(x)) * env;
  }
  return [d];
}

// an 808-like metal: six square partials, highpassed, over noise
function metal(sr, r, secs, decay, ratio, hpf = 7000, noise = 0.5) {
  const d = new Float32Array(Math.ceil(sr * secs));
  const fr = [205.3, 304.4, 369.6, 522.7, 540, 800].map((f) => f * ratio);
  const hp = biquad(sr).set('hp', hpf, 0.8), hp2 = biquad(sr).set('hp', hpf, 0.8), lp = biquad(sr).set('lp', 13000, 0.7);
  const ph = fr.map(() => r());
  for (let i = 0; i < d.length; i++) {
    const t = i / sr;
    let x = 0;
    for (let k = 0; k < 6; k++) { ph[k] = (ph[k] + fr[k] / sr) % 1; x += ph[k] < 0.5 ? 1 : -1; }
    d[i] = lp.run(hp2.run(hp.run(x / 6 + (r() * 2 - 1) * noise))) * Math.exp(-t / decay) * Math.min(1, t / 0.0008);
  }
  return [d];
}

function shaker(sr, r) {
  const d = new Float32Array(Math.ceil(sr * 0.12));
  const bp = biquad(sr).set('bp', 7000, 1.2);
  for (let i = 0; i < d.length; i++) {
    const t = i / sr;
    d[i] = bp.run(r() * 2 - 1) * Math.min(1, t / 0.008) * Math.exp(-t / 0.032);
  }
  return [d];
}

// tambourine: two grains (the shake), each a ring of jingles over hiss
function tamb(sr, r) {
  const [a] = metal(sr, r, 0.22, 0.06, 3.1, 6000, 0.9);
  const d = new Float32Array(a.length);
  const o = Math.floor(0.012 * sr);
  for (let i = 0; i < d.length; i++) d[i] = a[i] * 0.7 + (i >= o ? a[i - o] : 0);
  return [d];
}

// congas: a skin (its fundamental bending down, a faster second mode) and, slapped, a crack of noise
const CONGA = { H: [330, 0.16, 0], h: [330, 0.045, 0], S: [340, 0.07, 1], L: [235, 0.22, 0], B: [175, 0.26, 0] };
function conga(sr, r, kind) {
  const [f, decay, slap] = CONGA[kind];
  const d = new Float32Array(Math.ceil(sr * (decay * 4 + 0.03)));
  const bp = biquad(sr).set('bp', 1800, 0.9);
  let p1 = 0, p2 = 0;
  for (let i = 0; i < d.length; i++) {
    const t = i / sr;
    const ff = f * (1 + 0.12 * Math.exp(-t / 0.012));
    p1 += (TAU * ff) / sr; p2 += (TAU * ff * 1.59) / sr;
    const skin = Math.sin(p1) * Math.exp(-t / decay) + 0.35 * Math.sin(p2) * Math.exp(-t / (decay * 0.35));
    const crack = bp.run(r() * 2 - 1) * Math.exp(-t / (slap ? 0.014 : 0.004)) * (slap ? 1.4 : 0.5);
    d[i] = Math.tanh(1.2 * (skin * Math.min(1, t / 0.001) + crack));
  }
  return [d];
}

function cowbell(sr) {
  const d = new Float32Array(Math.ceil(sr * 0.4));
  const a = osc(sr, 'sq'), b = osc(sr, 'sq', 0.3), bp = biquad(sr).set('bp', 820, 1.6);
  for (let i = 0; i < d.length; i++) {
    const t = i / sr;
    d[i] = bp.run(a(562) + b(845)) * (0.6 * Math.exp(-t / 0.012) + 0.4 * Math.exp(-t / 0.09));
  }
  return [d];
}

function clave(sr) {
  const d = new Float32Array(Math.ceil(sr * 0.12));
  for (let i = 0; i < d.length; i++) { const t = i / sr; d[i] = Math.sin(TAU * 2450 * t) * Math.exp(-t / 0.02) * Math.min(1, t / 0.0005); }
  return [d];
}

function rim(sr, r) {
  const d = new Float32Array(Math.ceil(sr * 0.12));
  for (let i = 0; i < d.length; i++) {
    const t = i / sr;
    d[i] = Math.tanh(2 * (Math.sin(TAU * 1700 * t) * Math.exp(-t / 0.01) + 0.6 * Math.sin(TAU * 480 * t) * Math.exp(-t / 0.018)
      + (r() * 2 - 1) * Math.exp(-t / 0.0012) * 0.6));
  }
  return [d];
}

const TOM = { H: 150, M: 112, L: 84 };
function tom(sr, r, kind) {
  const d = new Float32Array(Math.ceil(sr * 0.7));
  let ph = 0;
  for (let i = 0; i < d.length; i++) {
    const t = i / sr;
    ph += (TAU * TOM[kind] * (1 + 0.5 * Math.exp(-t / 0.06))) / sr;
    d[i] = Math.tanh(1.5 * (Math.sin(ph) * Math.exp(-t / 0.26) + (r() * 2 - 1) * Math.exp(-t / 0.006) * 0.4));
  }
  return [d];
}

// ---------------------------------------------------------------- bass
// a bass note at `m`: tone finger | slap | synth | moog; `pop`: a slapped octave (popped string); `ghost`: soft,
// darker; `dead`: a muted thump
function bass(sr, r, m, { tone, ghost, dead, pop }) {
  const f = mtof(m), secs = dead ? 0.12 : tone === 'moog' || tone === 'finger' ? 1.4 : 0.9;
  const d = new Float32Array(Math.ceil(sr * secs));
  if (tone === 'finger' || tone === 'slap') {
    const slap = tone === 'slap';
    pluckString(d, 0, sr, f, { t60: dead ? 0.05 : slap ? 1.2 : 1.6, bright: dead ? 0.3 : slap ? (pop ? 1 : 0.85) : ghost ? 0.35 : 0.55, pos: slap ? 0.1 : 0.25 }, r);
    const lp = biquad(sr).set('lp', slap ? (pop ? 5200 : 3200) : ghost ? 900 : 1500, 0.8);
    let ph = 0;
    for (let i = 0; i < d.length; i++) {
      const t = i / sr;
      ph += (TAU * f) / sr;
      const body = Math.sin(ph) * Math.exp(-t / (dead ? 0.03 : 0.5)) * Math.min(1, t / 0.004) * 0.5;
      // the slap's thumb and the pop's snap on the frets
      const hit = slap ? (r() * 2 - 1) * Math.exp(-t / (pop ? 0.006 : 0.003)) * (pop ? 0.9 : 0.5) : 0;
      d[i] = Math.tanh(1.6 * (lp.run(d[i] * 2) + body + hit));
    }
  } else {
    // synth / moog: band-limited oscillators through two resonant lowpasses whose cutoff falls after the attack
    const moog = tone === 'moog';
    const a = osc(sr, 'saw'), b = osc(sr, moog ? 'sq' : 'saw', 0.37), sub = osc(sr, 'sq', 0.11);
    const l1 = biquad(sr), l2 = biquad(sr);
    const base = moog ? 260 : 220, peak = (moog ? 2600 : 3000) * (ghost ? 0.4 : 1), tau = moog ? 0.11 : 0.06, Q = moog ? 2.2 : 1.4;
    for (let i = 0; i < d.length; i++) {
      const t = i / sr;
      if (i % 16 === 0) {
        const fc = base + peak * Math.exp(-t / tau);
        l1.set('lp', fc, Q); l2.set('lp', fc, 0.7);
      }
      const x = a(f * 1.003) + 0.8 * b(f * 0.997) + (moog ? 0.6 : 0.4) * sub(f); // the square holds the fundamental
      const env = Math.min(1, t / 0.002) * (dead ? Math.exp(-t / 0.025) : 0.7 + 0.3 * Math.exp(-t / 0.15));
      d[i] = Math.tanh(1.3 * l2.run(l1.run(x)) * env);
    }
  }
  return normalize([d], ghost ? 0.7 : 1);
}

// ---------------------------------------------------------------- guitar
// strum: the notes of a chord (low to high), dir 'down' | 'up' | 'one' (a single note); art: mute (palm-muted),
// open (ringing), dead (a dead strum: the strings choked by the fretting hand); wah: env | cocked | null
function guitar(sr, r, notes, { art, dir = 'one', wah = null, accent = true }) {
  const secs = art === 'open' ? 1.1 : art === 'dead' ? 0.12 : 0.32;
  const d = new Float32Array(Math.ceil(sr * secs));
  const order = dir === 'up' ? notes.slice().reverse() : notes;
  const gap = dir === 'up' ? 0.006 : 0.009;
  order.forEach((m, i) => {
    const t60 = art === 'open' ? 0.9 : art === 'dead' ? 0.025 : 0.14 + 0.05 * r();
    pluckString(d, Math.floor(i * gap * sr), sr, mtof(m), {
      t60, bright: (art === 'mute' ? 0.45 : 0.75) * (accent ? 1 : 0.75), pos: 0.13 + 0.06 * r(), amp: dir === 'up' ? 0.7 : 1,
      damp: art === 'mute' ? 0.8 : 0.5,
    }, r);
  });
  if (art === 'dead') { // the click of the pick on choked strings
    const bp = biquad(sr).set('bp', 2600, 1.1);
    for (let i = 0; i < d.length; i++) d[i] += bp.run(r() * 2 - 1) * Math.exp(-i / sr / 0.012) * 0.35;
  }
  const hp = biquad(sr).set('hp', 110, 0.7), cab = biquad(sr).set('lp', art === 'mute' ? 2600 : 4600, 0.9), cab2 = biquad(sr).set('lp', 6000, 0.7);
  const wf = biquad(sr);
  const drive = art === 'open' ? 1.6 : 2.4, th = Math.tanh(drive);
  for (let i = 0; i < d.length; i++) {
    const t = i / sr;
    let x = Math.tanh(drive * hp.run(d[i] * 3)) / th;
    if (wah) {
      if (i % 16 === 0) {
        const fw = wah === 'env' ? 500 + 1900 * (1 - Math.exp(-t / 0.018)) * Math.exp(-t / 0.09) : 1250;
        wf.set('bp', fw, wah === 'env' ? 3.2 : 2.2);
      }
      x = 0.35 * x + 1.9 * wf.run(x);
    }
    d[i] = cab2.run(cab.run(x));
  }
  return normalize([d], accent ? 1 : 0.6);
}

// ---------------------------------------------------------------- keys
// rhodes: carrier and modulator at the note (the bark of the index on the attack), the tine's bell at 14 times it
function rhodes(sr, r, m, { soft }) {
  const f = mtof(m), d = new Float32Array(Math.ceil(sr * 2.2));
  const vel = soft ? 0.45 : 1, decay = 1.7 * Math.pow(262 / f, 0.35), bell = 14 * f < sr * 0.45;
  for (let i = 0; i < d.length; i++) {
    const t = i / sr;
    const I = (0.5 + 2.2 * vel) * Math.exp(-t / 0.28) + 0.35;
    const body = Math.sin(TAU * f * t + I * Math.sin(TAU * f * t));
    const tine = bell ? Math.sin(TAU * f * t + 1.3 * Math.sin(TAU * 14 * f * t)) * Math.exp(-t / 0.05) * 0.22 * vel : 0;
    d[i] = (body * Math.exp(-t / decay) + tine) * Math.min(1, t / 0.0015);
  }
  return normalize([d], soft ? 0.6 : 1);
}

// a stack of detuned band-limited saws per channel (cents), through a lowpass whose cutoff follows `cut(t)`, with a
// vibrato (`vib`: [Hz, cents, delay s]) and an amplitude envelope `amp(t)`
function ensemble(sr, m, secs, { detune, cut, Q = 0.7, amp, vib = null, scoop = 0, wave = 'saw', sub = 0 }) {
  const f = mtof(m), n = Math.ceil(sr * secs);
  return detune.map((cents, ch) => {
    const d = new Float32Array(n);
    const os = cents.map((c, k) => [osc(sr, wave, (k * 0.37 + ch * 0.21) % 1), Math.pow(2, c / 1200)]);
    const so = sub ? osc(sr, 'sq', 0.5) : null;
    const l1 = biquad(sr), l2 = biquad(sr);
    let bend = 1;
    for (let i = 0; i < n; i++) {
      const t = i / sr;
      if (i % 32 === 0) { // the filter and the pitch move at a 32-sample rate
        const fc = cut(t); l1.set('lp', fc, Q); l2.set('lp', fc * 1.4, 0.6);
        bend = scoop ? Math.pow(2, (scoop * Math.exp(-t / 0.04)) / 1200) : 1;
        if (vib && t > vib[2]) bend *= Math.pow(2, (vib[1] * Math.min(1, (t - vib[2]) / 0.3) * Math.sin(TAU * vib[0] * t + ch)) / 1200);
      }
      let x = 0;
      for (const [o, k] of os) x += o(f * k * bend);
      if (so) x += sub * so(f * 0.5 * bend);
      d[i] = l2.run(l1.run(x / os.length)) * amp(t);
    }
    return d;
  });
}

const poly = (sr, m, { stab }) => normalize(ensemble(sr, m, stab ? 0.5 : 1.6, {
  detune: [[-9, 3], [-3, 10]], sub: 0.35, Q: 1,
  cut: (t) => (stab ? 900 + 5200 * Math.exp(-t / 0.07) : 1700 + 3200 * Math.exp(-t / 0.3)),
  amp: (t) => Math.min(1, t / (stab ? 0.002 : 0.006)) * (stab ? Math.exp(-t / 0.16) : 0.7 + 0.3 * Math.exp(-t / 0.35)),
}));

const strings = (sr, m) => normalize(ensemble(sr, m, 2.6, {
  detune: [[-12, 1, 9], [-6, 5, 13]], Q: 0.6, vib: [5.3, 7, 0.25],
  cut: () => 3800, amp: (t) => Math.min(1, t / 0.18) ** 2,
}).map((d) => { // a bow's body: the lows thinned
  let lp = 0;
  const k = k1(240, sr);
  for (let i = 0; i < d.length; i++) { lp += k * (d[i] - lp); d[i] -= lp; }
  return d;
}));

const brass = (sr, m) => normalize(ensemble(sr, m, 0.9, {
  detune: [[-7, 4], [-3, 8]], Q: 1.1, scoop: -45,
  cut: (t) => 500 + 4400 * Math.min(1, t / 0.025) * (0.45 + 0.55 * Math.exp(-t / 0.12)),
  amp: (t) => Math.min(1, t / 0.012) * (0.65 + 0.35 * Math.exp(-t / 0.18)),
}).map((d) => { for (let i = 0; i < d.length; i++) d[i] = Math.tanh(1.5 * d[i]); return d; }));

// a disco record's chord, as it would be sampled off the vinyl: strings, brass and a guitar strum, dulled, a hiss
function chop(sr, r, notes) {
  const n = Math.ceil(sr * 0.7), L = new Float32Array(n), R = new Float32Array(n);
  for (const m of notes) {
    const s = ensemble(sr, m, 0.7, { detune: [[-10], [8]], cut: () => 4200, amp: (t) => Math.min(1, t / 0.02) });
    const b = ensemble(sr, m, 0.7, { detune: [[-6], [5]], scoop: -30, Q: 1,
      cut: (t) => 700 + 3800 * Math.exp(-t / 0.09), amp: (t) => Math.min(1, t / 0.01) * Math.exp(-t / 0.3) });
    for (let i = 0; i < n; i++) { L[i] += s[0][i] * 0.6 + b[0][i]; R[i] += s[1][i] * 0.6 + b[1][i]; }
  }
  const [g] = guitar(sr, r, notes.map((m) => m - 12), { art: 'open', dir: 'down' });
  const lpL = biquad(sr).set('lp', 6500, 0.7), lpR = biquad(sr).set('lp', 6500, 0.7);
  for (let i = 0; i < n; i++) {
    const t = i / sr, gi = i < g.length ? g[i] * 1.2 : 0, hiss = (r() * 2 - 1) * 0.015;
    const e = Math.exp(-t / 0.45);
    L[i] = Math.tanh(1.3 * lpL.run((L[i] / notes.length + gi) * e + hiss));
    R[i] = Math.tanh(1.3 * lpR.run((R[i] / notes.length + gi * 0.8) * e + hiss));
  }
  return normalize([L, R]);
}

// ---------------------------------------------------------------- leads
// the formants (Hz) of the vowels the talkbox and the choir sing
const VOWELS = { u: [320, 800, 2300], o: [500, 900, 2400], a: [750, 1150, 2500], e: [520, 1750, 2550] };
// a talkbox: a buzzy saw shaped by the mouth, 'u' opening into 'a' on the attack (the "wow"), then towards 'o'
function talk(sr, r, m) {
  const f = mtof(m), n = Math.ceil(sr * 1.6), d = new Float32Array(n);
  const a = osc(sr, 'saw'), b = osc(sr, 'sq', 0.25);
  const bps = [biquad(sr), biquad(sr), biquad(sr)];
  const gains = [1, 0.7, 0.35];
  const mix = (x, y, k) => x + (y - x) * k;
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    if (i % 16 === 0) {
      const open = 1 - Math.exp(-t / 0.05), close = Math.min(1, Math.max(0, (t - 0.25) / 0.8));
      bps.forEach((bp, k) => bp.set('bp', mix(mix(VOWELS.u[k], VOWELS.a[k], open), VOWELS.o[k], close * 0.6), 6 + k * 2));
    }
    const vib = t > 0.2 ? 1 + 0.004 * Math.sin(TAU * 5.5 * t) * Math.min(1, (t - 0.2) / 0.3) : 1;
    const x = a(f * vib) + 0.4 * b(f * vib);
    let y = 0;
    bps.forEach((bp, k) => { y += bp.run(x) * gains[k]; });
    d[i] = Math.tanh(2.2 * y) * Math.min(1, t / 0.008);
  }
  return normalize([d]);
}

// a vocoder-like choir: saws and a pulse through an 'a' fading to an 'o', a slow swell, chorused into two channels
function vox(sr, m) {
  const f = mtof(m), n = Math.ceil(sr * 2.2);
  return normalize([0, 1].map((ch) => {
    const d = new Float32Array(n);
    const a = osc(sr, 'saw', ch * 0.3), b = osc(sr, 'saw', 0.6), c = osc(sr, 'sq', 0.1);
    const bps = [biquad(sr), biquad(sr), biquad(sr)];
    for (let i = 0; i < n; i++) {
      const t = i / sr;
      if (i % 32 === 0) { const k = Math.min(1, t / 1.2); bps.forEach((bp, j) => bp.set('bp', VOWELS.a[j] + (VOWELS.o[j] - VOWELS.a[j]) * k, 5)); }
      const x = a(f * (ch ? 1.004 : 0.996)) + b(f * (ch ? 0.998 : 1.003)) + 0.5 * c(f * 2);
      const y = bps[0].run(x) + 0.8 * bps[1].run(x) + 0.4 * bps[2].run(x);
      d[i] = y * Math.min(1, t / 0.06);
    }
    return d;
  }));
}

// the other leads: a single voice with its own waves, filter and envelope, a delayed vibrato
const LEADS = {
  // Italo: a square and a little of a saw an octave down, bright, a quick attack
  square: { waves: [['sq', 1, 0], ['saw', 0.22, -1200]], cut: (t) => 2600 + 2400 * Math.exp(-t / 0.08), Q: 1.2, attack: 0.004, vib: [5.6, 10, 0.18] },
  // dark nu-disco: two detuned saws, a resonant filter that bites on the attack
  saw: { waves: [['saw', 1, -9], ['saw', 1, 9], ['sq', 0.4, -1200]], cut: (t) => 1500 + 3200 * Math.exp(-t / 0.1), Q: 2.2, attack: 0.003, vib: [5.2, 12, 0.22] },
  // sun: a triangle and a sine an octave up, a breath of air: a soft synth flute
  sun: { waves: [['tri', 1, 0], ['sin', 0.35, 1200]], cut: () => 5000, Q: 0.7, attack: 0.03, vib: [5, 14, 0.2], air: 0.06 },
};
function lead(sr, r, m, tone) {
  const L = LEADS[tone], f = mtof(m), n = Math.ceil(sr * 1.6), d = new Float32Array(n);
  const os = L.waves.map(([w, g, c]) => [w === 'sin' ? null : osc(sr, w, r()), g, Math.pow(2, c / 1200)]);
  const l1 = biquad(sr), l2 = biquad(sr), air = biquad(sr).set('bp', 3000, 1);
  let ph = 0, v = 1;
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    if (i % 16 === 0) {
      const fc = L.cut(t); l1.set('lp', fc, L.Q); l2.set('lp', fc * 1.5, 0.6);
      v = t > L.vib[2] ? Math.pow(2, (L.vib[1] * Math.min(1, (t - L.vib[2]) / 0.25) * Math.sin(TAU * L.vib[0] * t)) / 1200) : 1;
    }
    let x = 0;
    for (const [o, g, k] of os) {
      if (o) x += g * o(f * k * v);
      else { ph += (TAU * f * k * v) / sr; x += g * Math.sin(ph); }
    }
    if (L.air) x += air.run(r() * 2 - 1) * L.air * Math.exp(-t / 0.2) * 4;
    d[i] = l2.run(l1.run(x)) * Math.min(1, t / L.attack);
  }
  return normalize([d]);
}

// ---------------------------------------------------------------- effects
function crash(sr, r) { const [d] = metal(sr, r, 2.4, 0.8, 2.3, 4500, 0.8); return [d]; }
// a cymbal played backwards, into a downbeat
function swell(sr, r) {
  const [d] = metal(sr, r, 1.4, 0.45, 2.3, 4500, 0.8);
  d.reverse();
  return [d];
}
function noise(sr, r) { const d = new Float32Array(sr * 2); for (let i = 0; i < d.length; i++) d[i] = r() * 2 - 1; return [d]; }
// the impulse of the records' room: a short bright plate, darker as it dies, its two sides apart
function room(sr, r) {
  return [0, 1].map(() => {
    const d = new Float32Array(Math.ceil(sr * 1.5));
    let lp = 0;
    for (let i = Math.floor(0.008 * sr); i < d.length; i++) {
      const t = i / sr;
      lp += k1(1200 + 7000 * Math.exp(-t * 3), sr) * (r() * 2 - 1 - lp);
      d[i] = lp * Math.exp(-t / 0.32);
    }
    return d;
  });
}

// ---------------------------------------------------------------- the registry
// spec: { voice, ...params }; returns { ch, rate } (see the top of the file)
const HALF = new Set(['bass', 'rhodes', 'poly', 'strings', 'brass', 'chop', 'lead', 'talk', 'vox']);
export function render(spec, sr) {
  const rate = HALF.has(spec.voice) ? Math.round(sr / 2) : sr;
  const r = rng(hashStr(JSON.stringify(spec)));
  const k = KITS[spec.kit] || KITS.disco;
  let ch;
  switch (spec.voice) {
    case 'kick': ch = kick(rate, r, k.kick); break;
    case 'snare': ch = snare(rate, r, k.snare); break;
    case 'clap': ch = clap(rate, r); break;
    case 'hat': ch = metal(rate, r, k.hat.decay * 4, k.hat.decay, k.hat.ratio); break;
    case 'ohat': ch = metal(rate, r, k.ohat.decay * 3, k.ohat.decay, k.hat.ratio); break;
    case 'shaker': ch = shaker(rate, r); break;
    case 'tamb': ch = tamb(rate, r); break;
    case 'conga': ch = conga(rate, r, spec.kind); break;
    case 'cowbell': ch = cowbell(rate); break;
    case 'clave': ch = clave(rate); break;
    case 'rim': ch = rim(rate, r); break;
    case 'tom': ch = tom(rate, r, spec.kind); break;
    case 'crash': ch = crash(rate, r); break;
    case 'swell': ch = swell(rate, r); break;
    case 'noise': ch = noise(rate, r); break;
    case 'room': ch = room(rate, r); break;
    case 'bass': ch = bass(rate, r, spec.m, spec); break;
    case 'guitar': ch = guitar(rate, r, spec.notes, spec); break;
    case 'rhodes': ch = rhodes(rate, r, spec.m, spec); break;
    case 'poly': ch = poly(rate, spec.m, spec); break;
    case 'strings': ch = strings(rate, spec.m); break;
    case 'brass': ch = brass(rate, spec.m); break;
    case 'chop': ch = chop(rate, r, spec.notes); break;
    case 'talk': ch = talk(rate, r, spec.m); break;
    case 'vox': ch = vox(rate, spec.m); break;
    case 'lead': ch = lead(rate, r, spec.m, spec.tone); break;
    default: throw new Error('groove: unknown voice ' + spec.voice);
  }
  if (!['bass', 'guitar', 'rhodes', 'poly', 'strings', 'brass', 'chop', 'talk', 'vox', 'lead', 'noise'].includes(spec.voice)) normalize(ch);
  return { ch, rate };
}

// the voices a layer's `inst` may name, and what kind of part each plays
export const INSTRUMENTS = {
  kick: 'drum', snare: 'drum', clap: 'drum', hat: 'drum', shaker: 'drum', tamb: 'drum', conga: 'drum', cowbell: 'drum',
  clave: 'drum', rim: 'drum', tom: 'drum', bass: 'line', guitar: 'line', pluck: 'line',
  rhodes: 'keys', poly: 'keys', strings: 'keys', brass: 'keys', chop: 'keys', vox: 'keys', lead: 'lead', talk: 'lead',
};
