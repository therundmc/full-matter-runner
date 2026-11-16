// The long beds of the night, played on and on by the mixer (audio/Audio.js setAmbience, driven by
// systems/Ambience.js): the city far off and its traffic, a room of people talking, a radio, a radio left on behind
// a window, the hush of a building, what hums (neon, fluorescent tubes, fridges, the mains), an extractor fan, a
// television's snow, a car's engine and tyres. Plain JS on Float32Arrays, DOM-free and seeded: each bed is a seamless
// loop of several seconds (its end crossfaded into its start), at its own sample rate (what is muffled anyway needs no
// highs), normalized to one loudness so that the mix levels live in the data (data/soundscape.js). Loops of different
// lengths run side by side, so the whole never repeats; the events of the zones (glasses, laughs, a chair...) and of
// the city (a train, a siren, a dog...) fall on top at random.
// A few long one-shots of the far city are rendered the same way but not looped (`once`: the elevated train going by,
// a dog's barking, a car alarm), normalized to one peak, cut in `marks` where the mixer may start them.
// renderBed is a generator: it yields every slice of work, so the mixer bakes the beds in the idle time between frames.
// Speech is never words: glottal pulses through three formants gliding from sound to sound, cut in syllables and
// phrases, low-passed as heard across a room (plan / talker below; renderLaugh uses the same voice).

import { v8Cycle } from './Motor.js';

const TAU = Math.PI * 2;
const RMS = 0.1;  // every bed's loudness once rendered
const PEAK = 0.9; // a one-shot's peak
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
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

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
  // the city far off: a low wash that swells and settles, the hum of the avenues breathing in it, and now and then a
  // car going by a block or two away (its tyres on the dry road, the engine under them), from one side to the other
  *city(ch, sr, r) {
    const n = ch[0].length, shared = brown(r), low = ch.map(() => lp1(300, sr)), own = ch.map(() => brown(r));
    const road = ch.map(() => biquad('bp', 650, 0.7, sr)), swell = wander(r, sr, 0.09, 0.25), far = ch.map(() => wander(r, sr, 0.2, 0.6));
    for (let i = 0; i < n; i++) {
      if ((i & 4095) === 0) yield;
      const s = shared(), k = swell();
      ch.forEach((c, j) => { c[i] = (low[j](0.6 * s + 0.4 * own[j]()) + road[j](white(r)) * 0.25 * far[j]()) * k; });
    }
    yield* scatter(r, sr, n - Math.round(5 * sr), 0.3, (at) => farCar(ch, sr, r, at));
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
    // heard across a warm room: no boom, the consonants rounded off (a crowd must never sound harsh)
    for (const c of ch) {
      const hp = hp1(120, sr), lp = biquad('lp', 1900, 0.5, sr), lp2 = lp1(3200, sr);
      for (let k = 0; k < n; k++) { if ((k & 32767) === 0) yield; c[k] = lp2(lp(hp(c[k]))); }
    }
  },
  // a late-night radio on a desk: a host talking, his guest now and then, through a small speaker, a breath of static;
  // spec.song (bpm): a slow soul record under them, the host only now and then (a radio left on behind a window)
  *radio(ch, sr, r, spec) {
    const c = ch[0], n = c.length, music = !!spec.song;
    yield* talker(c, sr, r, plan(r, n / sr, { rate: 4.2, talk: music ? 0.2 : 0.85 }), { ...person(r, false), gain: music ? 0.5 : 1 });
    if (music) yield* song(c, sr, r, spec.song);
    else yield* talker(c, sr, r, plan(r, n / sr, { rate: 5, talk: 0.15 }), { ...person(r, true), gain: 0.8 });
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
  // a car's engine (a V8, audio/Motor.js): its cycle (spec.cycle Hz, a whole number of them in the loop) driven into
  // a soft clip, the body's boom and the pipe's rasp, and the exhaust's growl, noise pulsed by the firing. The mixer
  // changes its speed with the car's and the Doppler shift, and opens its tone as it speeds up; the tyres are `road`
  *engine(ch, sr, r, spec) {
    const c = ch[0], n = c.length, N = 4096, { real, imag } = v8Cycle(spec.harmonics, 11), wave = new Float32Array(N + 1);
    for (let k = 1; k <= spec.harmonics; k++) {
      const w = (TAU * k) / N;
      for (let j = 0; j < N; j++) wave[j] += real[k] * Math.cos(w * j) + imag[k] * Math.sin(w * j);
      if ((k & 15) === 0) yield;
    }
    let peak = 1e-9;
    for (let j = 0; j < N; j++) peak = Math.max(peak, Math.abs(wave[j]));
    for (let j = 0; j < N; j++) wave[j] /= peak;
    wave[N] = wave[0];
    const boom = biquad('bp', 110, 1.1, sr), rasp = biquad('bp', 760, 1.3, sr), growl = biquad('bp', 1000, 0.8, sr), hp = hp1(70, sr);
    for (let i = 0; i < n; i++) {
      if ((i & 16383) === 0) yield;
      const u = (((i * spec.cycle) / sr) % 1) * N, j = Math.floor(u), x = wave[j] + (wave[j + 1] - wave[j]) * (u - j);
      const y = Math.tanh(2.4 * x);
      c[i] = hp(y * 0.35 + boom(y) * 0.35 + rasp(y) * 1.1 + growl(white(r)) * Math.abs(x) * 2.2);
    }
  },
  // a car's tyres on the dry asphalt: the roar of the rubber, the tread's hiss, the road's surface going by
  *road(ch, sr, r) {
    const c = ch[0], n = c.length, roar = biquad('bp', 460, 0.6, sr), rumble = brown(r), low = lp1(140, sr), rumble2 = brown(r);
    const hiss = biquad('bp', 2400, 0.8, sr), surface = wander(r, sr, 4, 0.18);
    for (let i = 0; i < n; i++) {
      if ((i & 32767) === 0) yield;
      c[i] = (roar(rumble()) * 0.9 + low(rumble2()) * 0.6) * surface() + hiss(white(r)) * 0.25;
    }
  },
  // the hush of a building at night: the structure's low rumble, the air in the ducts far off
  *hush(ch, sr, r) {
    const c = ch[0], n = c.length, low = lp1(110, sr), rumble = brown(r), duct = biquad('bp', 380, 0.8, sr), sw = wander(r, sr, 0.15, 0.3);
    for (let i = 0; i < n; i++) { if ((i & 32767) === 0) yield; c[i] = low(rumble()) * 1.2 + duct(white(r)) * 0.25 * sw(); }
  },

  // ---- long one-shots of the far city (`once`) ----
  // the elevated train a block away (the title's train, heard from the street): spec.cars cars at spec.speed m/s pass
  // `spec.off` m from the ear, the middle of the train closest half way through; their wheels knock over the rail
  // joints axle by axle, the steel structure rumbles under them, the motors whine, the flanges screech in the curve;
  // each part as loud as it is near (the side and the Doppler shift are the mixer's)
  *train(ch, sr, r, spec) {
    const c = ch[0], n = c.length, mid = n / sr / 2, { cars, speed: v, off: D } = spec, L = 15, train = cars * L;
    const axles = [];
    for (let k = 0; k < cars; k++) for (const a of [1.5, 3.8, 11.2, 13.5]) axles.push(k * L + a);
    const near = (x) => D / Math.hypot(D, x); // level of what happens x m along the track from the closest point
    // the body: as loud as its nearest car is near (the train spans [head - train, head] along the track)
    const rum = brown(r), lp = biquad('lp', 160, 0.7, sr), air = lp1(500, sr), whine = 210 + 40 * r();
    let ph = 0;
    for (let i = 0; i < n; i++) {
      if ((i & 16383) === 0) yield;
      const t = i / sr, head = v * (t - mid) + train / 2, x = clamp(0, head - train, head);
      ph += (TAU * whine * (1 - 0.03 * Math.tanh((t - mid) / 3))) / sr;
      c[i] = (lp(rum()) * 1.4 + air(white(r)) * 0.1 + (Math.sin(ph) + 0.3 * Math.sin(2 * ph)) * 0.025) * near(x) ** 2;
    }
    yield;
    // the wheels over the joints (every 13 m of rail): a heavy knock and its ring, a little uneven
    for (let j = -60; j <= 60; j++) {
      const xj = j * 13 + 6 * r(), g = near(xj) ** 2;
      if (g < 0.05) continue;
      for (const a of axles) {
        const at = Math.floor((mid + (xj + a - train / 2) / v) * sr);
        if (at < 0 || at >= n - sr * 0.2) continue;
        ping(c, at, sr, 70 + 25 * r(), 0.03, 0.45 * g, 0.7);
        ping(c, at, sr, 650 + 500 * r(), 0.006, 0.16 * g);
      }
      if ((j & 7) === 0) yield;
    }
    // the flanges screeching in the curve: two or three cries while it is close, wavering
    for (let k = 0, m = 2 + Math.floor(r() * 2); k < m; k++) {
      yield;
      const t0 = mid - 4 + 7 * r(), dur = 0.8 + 1.6 * r(), f0 = 2300 + 1300 * r(), a = 0.04 + 0.05 * r();
      const bp = biquad('bp', f0, 30, sr), i0 = Math.floor(t0 * sr), i1 = Math.min(n, i0 + Math.floor(dur * sr));
      let p2 = 0;
      for (let i = i0; i < i1; i++) {
        const u = (i - i0) / (i1 - i0), wob = 1 + 0.012 * Math.sin(TAU * 5.5 * (i / sr));
        p2 += (TAU * f0 * wob) / sr;
        c[i] += (bp(white(r)) * 5 + Math.sin(p2) * 0.5) * a * Math.sin(Math.PI * u) ** 0.7;
      }
    }
    for (let i = 0, m = 3 * sr; i < m; i++) { const k = (i / m) ** 2; c[i] *= k; c[n - 1 - i] *= k; } // from and into the distance
  },
  // a dog barking down the block: spec.bouts bouts of two to five barks (a rough voiced "rouf": a burst through an
  // open vowel, its pitch falling), silence between the bouts; each bout is a mark
  *dog(ch, sr, r, spec) {
    const c = ch[0], n = c.length, slot = n / sr / spec.bouts, big = 0.8 + 0.4 * r();
    spec.marks = [];
    for (let b = 0; b < spec.bouts; b++) {
      const syl = [], t0 = b * slot + 0.05;
      let t = t0;
      for (let k = 0, m = 2 + Math.floor(r() * 4); k < m && t < (b + 1) * slot - 0.6; k++) {
        const d = 0.12 + 0.06 * r();
        syl.push({ t, d, v: [620 / big, 1250 / big, 2500], c: CONS[k ? 0 : 4], f: 1.1 - 0.15 * r(), a: 0.8 + 0.2 * r() });
        t += d + 0.16 + 0.3 * r();
      }
      yield* talker(c, sr, r, syl, { f0: 300 / big, scale: 1, breath: 0.35 });
      spec.marks.push([t0 - 0.05, t - t0 + 0.35]);
    }
    const lp = biquad('lp', 2800, 0.7, sr);
    let peak = 1e-9;
    for (let i = 0; i < n; i++) { c[i] = lp(c[i]); peak = Math.max(peak, Math.abs(c[i])); }
    for (let i = 0; i < n; i++) c[i] = Math.tanh((2 * c[i]) / peak);
  },
  // a car alarm going off streets away, one cycle of an 80s siren module: a wail, quick whoops, a two-tone, beeps,
  // each a square through the little horn's band
  *carAlarm(ch, sr, r) {
    const c = ch[0], n = c.length, seg = Math.floor(n / 4), bp = biquad('bp', 1900, 1.2, sr), lp = lp1(3500, sr);
    let ph = r();
    for (let i = 0; i < n; i++) {
      if ((i & 16383) === 0) yield;
      const k = Math.min(3, Math.floor(i / seg)), u = (i - k * seg) / sr;
      let f = 1700, on = 1;
      if (k === 0) f = 900 + 700 * (0.5 - 0.5 * Math.cos((TAU * u) / 1.25));  // wail
      else if (k === 1) f = 800 + 900 * ((u * 5) % 1);                       // whoops
      else if (k === 2) f = (u * 2.4) % 1 < 0.5 ? 1500 : 1100;               // two-tone
      else on = (u * 7) % 1 < 0.55 ? 1 : 0;                                  // beeps
      ph += f / sr;
      c[i] = lp(bp(ph % 1 < 0.5 ? on : -on));
    }
  },
};

// a car going by a block or two away, into a stereo bed from sample `at`: its tyres and engine swelling and fading
// over three or four seconds, crossing from one side to the other
function farCar(ch, sr, r, at) {
  const len = Math.floor((3 + 1.5 * r()) * sr), a = 0.6 + 0.6 * r(), dir = r() < 0.5 ? -1 : 1;
  const tyre = biquad('bp', 700 + 400 * r(), 0.8, sr), body = lp1(220, sr), rum = brown(r), f = 38 + 20 * r();
  let ph = 0;
  for (let i = 0; i < len && at + i < ch[0].length; i++) {
    const u = i / len, e = Math.sin(Math.PI * u) ** 2, side = dir * (u * 2 - 1);
    ph += (f * (1.03 - 0.06 * u)) / sr;
    const x = (tyre(white(r)) * 0.8 + body(rum()) * 0.6 + ((ph % 1) - 0.5) * 0.05) * e * a;
    ch[0][at + i] += x * (0.5 - 0.4 * side);
    if (ch[1]) ch[1][at + i] += x * (0.5 + 0.4 * side);
  }
}

// a slow soul record through a small radio, `bpm` (radio spec.song): a minor progression on a soft electric piano, a
// round bass, brushes; whole bars over the loop's length, so it closes without a seam
function* song(c, sr, r, bpm) {
  const n = c.length, beat = 60 / bpm, bar = 4 * beat, out = new Float32Array(n);
  const prog = [[53, 56, 60, 63], [49, 53, 56, 60], [44, 48, 51, 55], [46, 49, 53, 56]]; // Fm7 Db Ab Bbm (the score's key)
  const mtof = (m) => 440 * 2 ** ((m - 69) / 12);
  for (let b = 0; b * bar * sr < n; b++) {
    yield;
    const chd = prog[b % prog.length], t0 = b * bar, at = (s) => Math.floor((t0 + s * beat) * sr);
    for (const [s, v] of [[0, 1], [1.5, 0.6], [2, 0.8], [3.5, 0.5]]) for (const m of chd) ping(out, at(s), sr, mtof(m), 0.5, 0.05 * v);
    for (const [s, k] of [[0, 0], [2.5, 7], [3, 0]]) ping(out, at(s), sr, mtof(chd[0] - 24 + k), 0.35, 0.22);
    for (let s = 0; s < 4; s++) {
      const i0 = at(s + 0.5), m = Math.floor(0.08 * sr);
      for (let i = 0; i < m && i0 + i < n; i++) out[i0 + i] += white(r) * 0.04 * (1 - i / m);
    }
  }
  for (let i = 0; i < n; i++) c[i] += out[i];
}

// sr: Hz, len: s of the loop (a whole number where the bed is tonal; whole bars of a song), ch: channels, tonal: a
// linear crossfade (its tones are the same on both sides of the seam), voices: [woman?] of a room's talkers, song: the
// radio plays a record (bpm); once: a one-shot (not looped, normalized to PEAK) and what its maker needs
export const BEDS = {
  city: { make: 'city', sr: 16000, len: 23.3, ch: 2 },
  talkA: { make: 'talk', sr: 22050, len: 13.7, ch: 2, voices: [false, true, false] },
  talkB: { make: 'talk', sr: 22050, len: 17.3, ch: 2, voices: [true, false, true] },
  radio: { make: 'radio', sr: 16000, len: 19.1 },
  window: { make: 'radio', sr: 16000, len: (12 * 4 * 60) / 76, song: 76 },
  hush: { make: 'hush', sr: 8000, len: 9.7 },
  neon: { make: 'neon', sr: 24000, len: 6, tonal: true },
  tube: { make: 'tube', sr: 24000, len: 6, tonal: true },
  fridge: { make: 'fridge', sr: 16000, len: 8, tonal: true },
  mains: { make: 'mains', sr: 16000, len: 4, tonal: true },
  fan: { make: 'fan', sr: 22050, len: 6, tonal: true },
  snow: { make: 'snow', sr: 22050, len: 5 },
  engine: { make: 'engine', sr: 22050, len: 3, tonal: true, cycle: 14, harmonics: 160 },
  road: { make: 'road', sr: 16000, len: 4.3 },
  train: { make: 'train', sr: 16000, len: 22, once: true, cars: 6, speed: 14, off: 45 },
  dog: { make: 'dog', sr: 16000, len: 12, once: true, bouts: 4 },
  carAlarm: { make: 'carAlarm', sr: 16000, len: 10, once: true },
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

// one bed: { sr, data: [Float32Array per channel], marks: [[start s, length s]] }, a loop at RMS loudness, or a `once`
// one-shot at PEAK whose marks say where it may be started. A generator: run it to its end (see top)
export function* renderBed(name, seed = 1) {
  const spec = { ...BEDS[name] }, { sr, len, ch = 1 } = spec;
  const n = Math.round(len * sr), x = spec.once ? 0 : Math.round(XF * sr), r = rng(seed);
  const data = Array.from({ length: ch }, () => new Float32Array(n + x));
  yield* BED_MAKERS[spec.make](data, sr, r, spec);
  const out = spec.once ? data : data.map((d) => close(d, n, x, spec.tonal));
  let peak = 1e-9;
  if (spec.once) for (const c of out) for (const v of c) peak = Math.max(peak, Math.abs(v));
  const k = spec.once ? PEAK / peak : RMS / (rmsOf(out) || 1);
  for (const c of out) for (let i = 0; i < c.length; i++) c[i] *= k;
  return { sr, data: out, marks: spec.marks || [[0, len]] };
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
