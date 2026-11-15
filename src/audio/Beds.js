// The long beds of the night, played on and on by the mixer (audio/Audio.js setAmbience, driven by
// systems/Ambience.js): rain, the city far off, a room of people talking, a radio, what hums (neon, fluorescent tubes,
// fridges, the mains), an extractor fan, rain drumming on a car roof, a television's snow, a car's engine and wet
// tyres. Plain JS on Float32Arrays, DOM-free and seeded: each bed is a seamless loop of several seconds (its end
// crossfaded into its start), at its own sample rate (what is muffled anyway needs no highs), normalized to one
// loudness so that the mix levels live in the data (data/soundscape.js). Loops of different lengths run side by side,
// so the whole never repeats; the events of the zones (glasses, laughs, a chair...) fall on top at random.
// renderBed is a generator: it yields every slice of work, so the mixer bakes the beds in the idle time between frames.
// Speech is never words: glottal pulses through three formants gliding from sound to sound, cut in syllables and
// phrases, low-passed as heard across a room (plan / talker below; renderLaugh uses the same voice).

const TAU = Math.PI * 2;
const RMS = 0.1;  // every bed's loudness once rendered
const XF = 0.4;   // s of crossfade that closes a loop

// seeded generator (mulberry32)
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), a | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const white = (r) => r() * 2 - 1;

// ---- filters, as steppers x -> y ----
function lp1(fc, sr) { const k = 1 - Math.exp((-TAU * fc) / sr); let s = 0; return (x) => (s += k * (x - s)); }
function hp1(fc, sr) { const f = lp1(fc, sr); return (x) => x - f(x); }
// brown noise: white integrated with a leak (the rumble under everything)
function brown(r) { let b = 0; return () => (b = (b + 0.04 * white(r)) / 1.04) * 6; }
// RBJ biquad: 'bp' (0 dB at its peak) | 'lp' | 'hp'; .set(f, q) retunes it while it runs
function biquad(type, f, q, sr) {
  let b0 = 0, b1 = 0, b2 = 0, a1 = 0, a2 = 0, x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  const run = (x) => {
    const y = b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
    x2 = x1; x1 = x; y2 = y1; y1 = y;
    return y;
  };
  run.set = (fc, Q) => {
    const w = (TAU * Math.min(fc, sr * 0.45)) / sr, c = Math.cos(w), al = Math.sin(w) / (2 * Q), a0 = 1 + al;
    if (type === 'bp') { b0 = al / a0; b1 = 0; b2 = -al / a0; }
    else if (type === 'lp') { b0 = b2 = (1 - c) / 2 / a0; b1 = (1 - c) / a0; }
    else { b0 = b2 = (1 + c) / 2 / a0; b1 = -(1 + c) / a0; }
    a1 = (-2 * c) / a0; a2 = (1 - al) / a0;
  };
  run.set(f, q);
  return run;
}

// a slow random swell around 1 (new target every 1/rate s, eased in between), depth 0..1
function wander(r, sr, rate, depth) {
  const step = Math.max(1, Math.round(sr / rate));
  let a = r(), b = r(), i = 0;
  return () => {
    if (i++ % step === 0) { a = b; b = r(); }
    const u = ((i - 1) % step) / step, s = a + (b - a) * (0.5 - 0.5 * Math.cos(Math.PI * u));
    return 1 - depth + 2 * depth * s;
  };
}

// a decaying sine (a drop, a tick, a glass) added into out from sample `at`; chirp: frequency ratio reached at the end
function ping(out, at, sr, f, tau, amp, chirp = 1) {
  const len = Math.min(out.length - at, Math.ceil(tau * sr * 6)), d = Math.exp(-1 / (tau * sr));
  const glide = chirp === 1 ? 1 : chirp ** (1 / Math.max(1, len));
  let w = (TAU * f) / sr, ph = 0, e = amp;
  for (let i = 0; i < len; i++) {
    out[at + i] += Math.sin(ph) * e * Math.min(1, i / 3);
    ph += w; w *= glide; e *= d;
  }
}

// partials [[f Hz, amp, phase]]: whole Hz over a whole number of seconds is a loop with no seam. Each partial is a
// rotating phasor (no sine per sample), renormalized now and then against drift
function* tones(out, sr, partials, k = 1) {
  for (const [f, amp, phase = 0] of partials) {
    yield;
    const w = (TAU * f) / sr, cw = Math.cos(w), sw = Math.sin(w), a = amp * k;
    let x = Math.cos(phase), y = Math.sin(phase);
    for (let i = 0; i < out.length; i++) {
      out[i] += y * a;
      const nx = x * cw - y * sw;
      y = x * sw + y * cw; x = nx;
      if ((i & 4095) === 4095) { const m = 1 / Math.hypot(x, y); x *= m; y *= m; }
    }
  }
}

// perSec random events a second over n samples (Poisson): fn(sample index)
function* scatter(r, sr, n, perSec, fn) {
  let k = 0;
  for (let t = -Math.log(1 - r()) / perSec; t * sr < n; t += -Math.log(1 - r()) / perSec) {
    fn(Math.floor(t * sr));
    if ((++k & 255) === 0) yield;
  }
}

// ---- speech ----
// vowels (formants Hz, a man's): a, e, i, o, u, ae, uh, er
const VOWELS = [[730, 1090, 2440], [530, 1840, 2480], [270, 2290, 3010], [570, 840, 2410], [300, 870, 2240], [660, 1720, 2410], [520, 1190, 2390], [490, 1350, 1690]];
// consonants: [share of the syllable, voicing kept, hiss, formants it starts from (null: the vowel's own)]
const CONS = [
  [0.3, 0.03, 0, null],               // a stop (t, k, p): a gap, then the vowel
  [0.28, 0.45, 0, [260, 1100, 2300]], // a nasal (m, n)
  [0.32, 0.05, 0.6, null],            // a hiss (s, f, sh)
  [0.24, 0.65, 0, [340, 1100, 1700]], // a liquid (l, r)
  [0, 1, 0, null],                    // straight into the vowel
];
const H = [0.4, 0.12, 0.7, null];     // the 'h' of a laugh: breath first

// what one talker says over len s: syllables { t, d, v (formants), c (consonant), f (pitch ratio), a (level) } in
// phrases that fall in pitch (a few rise: a question), with pauses; talk: share of the pauses that are short (he keeps
// the floor), the others are long (somebody else talks)
function plan(r, len, { rate = 5, talk = 0.55 } = {}) {
  const out = [];
  let t = r() * 1.5;
  while (t < len) {
    const n = 2 + Math.floor(r() * 10), rise = r() < 0.2;
    for (let i = 0; i < n && t < len; i++) {
      const d = (0.7 + 0.6 * r()) / rate, u = i / Math.max(1, n - 1), stress = r() < 0.3;
      let f = (1.12 - 0.24 * u) * (stress ? 1.15 : 1);
      if (rise && i >= n - 2) f *= 1.18;
      out.push({ t, d, v: VOWELS[Math.floor(r() * VOWELS.length)], c: CONS[Math.floor(r() * CONS.length)], f, a: (0.75 + 0.25 * r()) * (stress ? 1 : 0.85) });
      t += d;
    }
    t += r() < talk ? 0.2 + 0.6 * r() : 1.2 + 3 * r();
  }
  return out;
}

// glottal flow over one period (Rosenberg): opens over 40 %, closes over 16 %, shut for the rest
const flow = (p) => (p < 0.4 ? 0.5 - 0.5 * Math.cos((Math.PI * p) / 0.4) : p < 0.56 ? Math.cos((Math.PI / 2) * ((p - 0.4) / 0.16)) : 0);

// one talker saying `syl` into out (mono): pitch f0 Hz (shaken a little, period by period), formants times `scale`
// (a woman's are higher), `breath`: the air in the voice
function* talker(out, sr, r, syl, { f0, scale = 1, breath = 0.04, gain = 1 }) {
  const n = out.length, B = 32, bw = [80, 110, 160], lv = [1, 0.5, 0.22];
  const F = [500 * scale, 1500 * scale, 2500 * scale], bq = lv.map((_, j) => biquad('bp', F[j], F[j] / bw[j], sr));
  const hiss = hp1(2500, sr);
  const kA = 1 - Math.exp(-B / (sr * 0.012)), kF = 1 - Math.exp(-B / (sr * 0.022)), kP = 1 - Math.exp(-B / (sr * 0.05));
  let si = 0, ph = 0, prev = 0, amp = 0, fr = 0, pitch = 1, jit = 0, vib = r() * TAU;
  for (let i = 0; i < n; i += B) {
    if ((i & 4095) === 0) yield;
    const t = i / sr;
    while (si < syl.length && syl[si].t + syl[si].d <= t) si++;
    const s = syl[si];
    let tA = 0, tH = 0, tF = null;
    if (s && t >= s.t) {
      const u = (t - s.t) / s.d, [share, voiced, h, locus] = s.c;
      if (u < share) { tA = voiced * s.a; tH = h * s.a; tF = locus || s.v; }
      else { tA = s.a * (1 - 0.4 * Math.max(0, (u - 0.75) / 0.25)); tF = s.v; }
      pitch += (s.f - pitch) * kP;
    }
    amp += (tA - amp) * kA;
    fr += (tH - fr) * kA;
    if (tF) for (let j = 0; j < 3; j++) { F[j] += (tF[j] * scale - F[j]) * kF; bq[j].set(F[j], F[j] / bw[j]); }
    if (amp < 1e-4 && fr < 1e-4) continue; // between phrases: nothing to say
    vib += (TAU * 5.5 * B) / sr;
    const f = f0 * pitch * (1 + 0.006 * Math.sin(vib)), end = Math.min(n, i + B);
    for (let k = i; k < end; k++) {
      ph += (f * (1 + jit)) / sr;
      if (ph >= 1) { ph -= 1; jit = (r() - 0.5) * 0.02; }
      const g = flow(ph), src = (g - prev) * 8 + white(r) * breath * (0.3 + g);
      prev = g;
      const y = bq[0](src) * lv[0] + bq[1](src) * lv[1] + bq[2](src) * lv[2];
      out[k] += (y * amp + hiss(white(r)) * fr * 0.15) * gain;
    }
  }
}

// a voice drawn from the seed: a man's or a woman's
function person(r, woman) {
  return woman ? { f0: 175 + 50 * r(), scale: 1.15 + 0.05 * r(), breath: 0.06 } : { f0: 92 + 40 * r(), scale: 0.97 + 0.06 * r(), breath: 0.04 };
}

// ---- the beds: make(channels, sr, r, spec) fills each channel (length: the loop + its crossfade) ----
const BED_MAKERS = {
  // the city far off: a low wash that swells and settles, distant wet roads breathing in it
  *city(ch, sr, r) {
    const n = ch[0].length, shared = brown(r), low = ch.map(() => lp1(300, sr)), own = ch.map(() => brown(r));
    const road = ch.map(() => biquad('bp', 650, 0.7, sr)), swell = wander(r, sr, 0.09, 0.25), far = ch.map(() => wander(r, sr, 0.2, 0.6));
    for (let i = 0; i < n; i++) {
      if ((i & 4095) === 0) yield;
      const s = shared(), k = swell();
      ch.forEach((c, j) => { c[i] = (low[j](0.6 * s + 0.4 * own[j]()) + road[j](white(r)) * 0.25 * far[j]()) * k; });
    }
  },
  // rain falling on everything: a hiss, a dust of tiny drops, now and then one into a puddle (independent in each ear)
  *rain(ch, sr, r) {
    const n = ch[0].length;
    for (const c of ch) {
      yield;
      const hp = biquad('hp', 450, 0.7, sr), lp = biquad('lp', 6000, 0.7, sr), sw = wander(r, sr, 0.5, 0.15);
      for (let i = 0; i < n; i++) { if ((i & 32767) === 0) yield; c[i] = lp(hp(white(r))) * 0.35 * sw(); }
      yield;
      yield* scatter(r, sr, n, 650, (at) => ping(c, at, sr, 1800 + 6000 * r(), 0.0006 + 0.0025 * r(), 0.015 + 0.35 * r() ** 6));
      yield* scatter(r, sr, n, 1.6, (at) => ping(c, at, sr, 900 + 1300 * r(), 0.008 + 0.008 * r(), 0.05 + 0.1 * r(), 1.6));
    }
  },
  // rain drumming on a car's roof: ticks ringing the panel, the bigger drops a dull drum under them
  *rainMetal(ch, sr, r) {
    const c = ch[0], n = c.length, f1 = 950 + 300 * r(), wash = lp1(1500, sr);
    for (let i = 0; i < n; i++) { if ((i & 32767) === 0) yield; c[i] = wash(white(r)) * 0.08; }
    yield;
    yield* scatter(r, sr, n, 110, (at) => {
      const a = 0.05 + 0.6 * r() ** 4, f = f1 * (0.85 + 0.3 * r());
      ping(c, at, sr, f, 0.012, a);
      ping(c, at, sr, f * 2.37, 0.007, a * 0.5);
      ping(c, at, sr, f * 3.9, 0.004, a * 0.3);
      if (a > 0.3) ping(c, at, sr, 190 + 50 * r(), 0.035, a * 0.4);
    });
  },
  // a room of people talking, none of them to be made out (spec.voices: [woman?] per talker)
  *talk(ch, sr, r, spec) {
    const n = ch[0].length, mono = new Float32Array(n);
    for (const [i, woman] of spec.voices.entries()) {
      mono.fill(0);
      yield* talker(mono, sr, r, plan(r, n / sr, { rate: 4.5 + r(), talk: 0.5 }), person(r, woman));
      const pan = (i / Math.max(1, spec.voices.length - 1) - 0.5) * 1.1 + (r() - 0.5) * 0.2, a = ((pan + 1) * Math.PI) / 4;
      const g = [Math.cos(a), Math.sin(a)], level = 0.8 + 0.4 * r();
      yield;
      for (let k = 0; k < n; k++) for (let j = 0; j < 2; j++) ch[j][k] += mono[k] * g[j] * level;
    }
    for (const c of ch) {
      const hp = hp1(110, sr), lp = biquad('lp', 2600, 0.6, sr);
      for (let k = 0; k < n; k++) { if ((k & 32767) === 0) yield; c[k] = lp(hp(c[k])); }
    }
  },
  // a late-night radio on a desk: a host talking, his guest now and then, through a small speaker, a breath of static
  *radio(ch, sr, r) {
    const c = ch[0], n = c.length;
    yield* talker(c, sr, r, plan(r, n / sr, { rate: 4.2, talk: 0.85 }), person(r, false));
    yield* talker(c, sr, r, plan(r, n / sr, { rate: 5, talk: 0.15 }), { ...person(r, true), gain: 0.8 });
    const hp = biquad('hp', 380, 0.7, sr), lp = biquad('lp', 3000, 1, sr), st = lp1(5000, sr);
    let peak = 1e-9;
    for (let k = 0; k < n; k++) { if ((k & 32767) === 0) yield; c[k] = lp(hp(c[k])); peak = Math.max(peak, Math.abs(c[k])); }
    yield;
    for (let k = 0; k < n; k++) c[k] = Math.tanh((1.6 * c[k]) / peak) + st(white(r)) * 0.03;
  },
  // a neon tube's transformer: the mains' 120 Hz and its harmonics, a slow waver, the sizzle of the gas
  *neon(ch, sr, r) {
    const c = ch[0], n = c.length, parts = [];
    for (let k = 1; k * 120 < 3600; k++) parts.push([k * 120, k ** -1.2, r() * TAU]);
    yield* tones(c, sr, parts);
    yield;
    for (let i = 0; i < n; i++) c[i] *= 1 + 0.04 * Math.sin((TAU * 0.5 * i) / sr);
    yield* scatter(r, sr, n, 3, (at) => { const a = 0.4 * r() ** 2; for (let i = 0; i < 60 && at + i < n; i++) c[at + i] += white(r) * a * (1 - i / 60); });
  },
  // a fluorescent tube's ballast: a harder buzz, sung around 1.6 kHz, and the odd tick of the starter
  *tube(ch, sr, r) {
    const c = ch[0], n = c.length, parts = [];
    for (let k = 1; k * 120 < 4800; k++) parts.push([k * 120, k ** -0.7 * (0.3 + 1.5 * Math.exp(-(((k * 120 - 1600) / 700) ** 2))), r() * TAU]);
    yield* tones(c, sr, parts, 0.5);
    yield;
    yield* scatter(r, sr, n, 0.4, (at) => ping(c, at, sr, 2500 + 1500 * r(), 0.002, 0.6 * r()));
  },
  // a fridge's compressor: 60 Hz and its harmonics beating slowly, the motor's whir
  *fridge(ch, sr, r) {
    const c = ch[0], n = c.length;
    yield* tones(c, sr, [[60, 0.5], [120, 0.35, r() * TAU], [180, 0.15, r() * TAU], [240, 0.08, r() * TAU], [60.125, 0.25, r() * TAU]]);
    yield;
    const bp = biquad('bp', 320, 2, sr);
    for (let i = 0; i < n; i++) c[i] += bp(white(r)) * 0.25 * (0.6 + 0.4 * Math.abs(Math.sin((TAU * 60 * i) / sr)));
  },
  // the fuse box: a dry hum of the mains
  *mains(ch, sr, r) {
    yield* tones(ch[0], sr, [[60, 0.12], [120, 0.45, r() * TAU], [240, 0.2, r() * TAU], [360, 0.12, r() * TAU], [480, 0.06, r() * TAU]]);
    yield;
  },
  // an extractor fan: the motor, the air beaten by its blades, its louvre rattling once a turn
  *fan(ch, sr, r) {
    const c = ch[0], n = c.length, air = lp1(900, sr), low = lp1(120, sr), rumble = brown(r);
    yield* tones(c, sr, [[120, 0.15], [240, 0.06, r() * TAU]]);
    yield;
    for (let i = 0; i < n; i++) c[i] += air(white(r)) * 0.9 * (1 + 0.4 * Math.sin((TAU * 18 * i) / sr)) + low(rumble()) * 0.5;
    for (let t = 0; t * sr < n; t += 1 / 6) ping(c, Math.floor((t + 0.01 * r()) * sr), sr, 1800 + 800 * r(), 0.003, 0.05 + 0.07 * r());
  },
  // a television left on with nothing to show: its snow hissing, the set's own hum
  *snow(ch, sr, r) {
    const c = ch[0], n = c.length, hp = biquad('hp', 700, 0.7, sr), lp = biquad('lp', 6500, 0.7, sr);
    yield* tones(c, sr, [[60, 0.03], [120, 0.02]]);
    for (let i = 0; i < n; i++) c[i] += lp(hp(white(r))) * 0.5;
    yield;
  },
  // a car going: the engine's firing and its harmonics, the roar of the tyres, the spray off a wet road (the mixer
  // changes its speed with the car's and the Doppler shift)
  *engine(ch, sr, r) {
    const c = ch[0], n = c.length, parts = [];
    for (let k = 1; k <= 14; k++) parts.push([50 * k, k ** -0.8 * (k * 50 > 600 ? 0.4 : 1), r() * TAU]);
    yield* tones(c, sr, parts, 0.25);
    yield;
    const roar = biquad('bp', 500, 0.7, sr), rumble = brown(r), spray = biquad('bp', 3000, 0.6, sr);
    for (let i = 0; i < n; i++) c[i] += roar(rumble()) * 0.5 + spray(white(r)) * 0.4;
  },
};

// sr: Hz, len: s of the loop (a whole number where the bed is tonal), ch: channels, tonal: a linear crossfade (its
// tones are the same on both sides of the seam), voices: [woman?] of a room's talkers
export const BEDS = {
  city: { make: 'city', sr: 16000, len: 14.3, ch: 2 },
  rain: { make: 'rain', sr: 24000, len: 10.7, ch: 2 },
  rainMetal: { make: 'rainMetal', sr: 32000, len: 8.3 },
  talkA: { make: 'talk', sr: 22050, len: 13.7, ch: 2, voices: [false, true, false] },
  talkB: { make: 'talk', sr: 22050, len: 17.3, ch: 2, voices: [true, false, true] },
  radio: { make: 'radio', sr: 16000, len: 19.1 },
  neon: { make: 'neon', sr: 24000, len: 6, tonal: true },
  tube: { make: 'tube', sr: 24000, len: 6, tonal: true },
  fridge: { make: 'fridge', sr: 16000, len: 8, tonal: true },
  mains: { make: 'mains', sr: 16000, len: 4, tonal: true },
  fan: { make: 'fan', sr: 22050, len: 6, tonal: true },
  snow: { make: 'snow', sr: 22050, len: 5 },
  engine: { make: 'engine', sr: 22050, len: 3, tonal: true },
};

// closes a loop: the `x` samples after the end are faded into the start (equal power, or linear for tones)
function close(d, n, x, linear) {
  const out = d.slice(0, n);
  for (let i = 0; i < x; i++) {
    const u = i / x, a = linear ? u : Math.sin((Math.PI / 2) * u), b = linear ? 1 - u : Math.cos((Math.PI / 2) * u);
    out[i] = d[i] * a + d[n + i] * b;
  }
  return out;
}

const rmsOf = (chs) => {
  let s = 0, m = 0;
  for (const c of chs) { for (const v of c) s += v * v; m += c.length; }
  return Math.sqrt(s / Math.max(1, m));
};

// one bed: { sr, data: [Float32Array per channel] }, a loop at RMS loudness. A generator: run it to its end (see top)
export function* renderBed(name, seed = 1) {
  const spec = BEDS[name], { sr, len, ch = 1 } = spec;
  const n = Math.round(len * sr), x = Math.round(XF * sr), r = rng(seed);
  const data = Array.from({ length: ch }, () => new Float32Array(n + x));
  yield* BED_MAKERS[spec.make](data, sr, r, spec);
  const out = data.map((d) => close(d, n, x, spec.tonal));
  const k = RMS / (rmsOf(out) || 1);
  for (const c of out) for (let i = 0; i < c.length; i++) c[i] *= k;
  return { sr, data: out };
}

// runs a generator to its end (tests, or no idle time to wait for)
export function finish(gen) {
  for (;;) { const s = gen.next(); if (s.done) return s.value; }
}

// a laugh across the room: three to six breathy "ha"s falling in pitch and dying away; mono at sr, peak 0.8
export function renderLaugh(seed, woman, sr = 22050) {
  const r = rng(seed), n = 2 + Math.floor(r() * 4), syl = [];
  let t = 0.02;
  for (let i = 0; i < n; i++) {
    const d = 0.15 + 0.06 * r();
    syl.push({ t, d, v: VOWELS[r() < 0.6 ? 0 : 5], c: H, f: 1.25 - (0.35 * i) / n, a: 1 - (0.5 * i) / n });
    t += d + 0.02 * r();
  }
  const out = new Float32Array(Math.ceil((t + 0.15) * sr));
  finish(talker(out, sr, r, syl, { ...person(r, woman), breath: 0.25 }));
  const lp = biquad('lp', 3500, 0.7, sr);
  let peak = 1e-9;
  for (let i = 0; i < out.length; i++) { out[i] = lp(out[i]); peak = Math.max(peak, Math.abs(out[i])); }
  for (let i = 0; i < out.length; i++) out[i] *= 0.8 / peak;
  return out;
}
