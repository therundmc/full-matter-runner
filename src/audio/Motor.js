// Engines and tyres as numbers (DOM-free, unit-tested): what Audio.js `motor` (the getaway van, a live voice driven
// every frame) and Beds.js (the passing traffic's loops) make sound of.
//   - a V8's cycle: one waveform per engine cycle (two turns of the crank), eight exhaust pulses in it, a little
//     uneven in time and strength (the burble a V8 has and a four-cylinder does not), as harmonic coefficients
//   - a gearbox driven by the vehicle's real speed and throttle: the revs climb in a gear, drop at the shift (the
//     clutch out, off the throttle a moment), climb again; a downshift under braking blips them up
//   - the tyres: how hard they squeal from the slide's angle and the speed, and a chirp as the rear wheels spin
const TAU = Math.PI * 2;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

export const MOTOR = {
  red: 5600,            // rpm at the redline (revs below are a share of it)
  idle: 0.14,           // idle, ~780 rpm
  tops: [0.5, 0.86, 1.3], // speed at the redline in each gear, share of the vehicle's flat out (3rd never tops out)
  up: 0.93,             // revs at which it shifts up ...
  down: 0.5,            // ... and under which it shifts down, if the lower gear stays well under `up` (braking for a
                        // bend: the revs blip up and it slides through on them)
  shift: 0.13,          // s the clutch is out at an upshift (a downshift: 70 % of it), off the throttle
  rise: 0.07,           // s: how fast the revs climb (time constant) ...
  fall: 0.09,           // ... and fall
  spin: 0.88,           // revs held while the rear wheels spin at the launch
  pops: { catch: 4, shift: 3 }, // exhaust pops as it catches, and as the throttle lifts at an upshift
  // the tyres: the slide (rad) from which they start to squeal and at which they are full; the speed (share of flat
  // out) from which a slide is heard in full; the chirp of the launch (its level, then dying as the spin ends) and of
  // the shift out of first ([level, s])
  squeal: { from: 0.07, full: 0.42, speed: 0.4, launch: 1, shiftChirp: [0.55, 0.16] },
};

// The voice of the getaway van (Audio.js `motor`): levels, tones (Hz), the wobble of the squeal
export const VOICE = {
  gain: 0.45,           // the whole voice on the effects bus: flat out a little under a close pistol shot
  reach: 2600,          // px at which it fades out
  hold: 0.25,           // s it keeps going without a new update (then it fades out by itself)
  tau: 0.025,           // s: how fast its parameters follow an update
  body: 0.62,           // the engine's pulses (the cycle wave through the drive and the exhaust's tone)
  drive: [1.4, 4.2],    // into the soft clip: off the throttle .. floored (more grit, more bark)
  tone: [380, 3600],    // Hz the exhaust lets through at idle .. at the redline, floored
  boom: [105, 1.2, 6],  // the body's resonance [Hz, Q, dB]
  rasp: [720, 1.4, 5],  // the pipe's rasp [Hz, Q, dB]
  growl: 0.5,           // noise pulsed by the firing: the exhaust's growl, with the load and the revs ...
  growlBand: [3.2, 260, 1700, 0.8], // ... its band: [x the firing frequency, min Hz, max Hz, Q]
  whine: 0.06,          // the gearbox's whine (a sine at `whineK` x the wheels' speed)
  whineK: [380, 1900],  // Hz at rest .. flat out
  road: 0.42,           // the tyres' roar on the asphalt (brown noise) ...
  roadBand: [480, 0.7],
  hiss: 0.12,           // ... and the tread's hiss
  hissBand: [2600, 0.8],
  squeal: 2,            // the squeal at full slide (over the engine) ...
  squealHz: [960, 1180], // ... its pitch at the start of a slide .. at full slide
  squealParts: [[1, 16, 1], [1.49, 18, 0.55], [2.03, 12, 0.3], [0.52, 9, 0.35]], // [x pitch, Q, level]
  wobble: [[5.3, 45], [1.7, 70], [13, 18]], // LFOs on its pitch [Hz, cents]
  flutter: [19, 0.35],  // the rubber's stick-slip chatter [Hz, depth]
  duck: 0.72,           // the music under it while it runs
  hall: 0.05,           // its share in the city's space
};

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

// the bank each firing of a cross-plane V8 comes out of (firing order 1-8-4-3-6-5-7-2), as how loud its pipe is: the
// lumpy pattern of the two banks is the burble
const BANKS = [1, 0.7, 0.7, 1, 0.7, 1, 1, 0.7];

// One cycle of a V8's exhaust (two turns: eight firings) as harmonics k = 1..n of the cycle: { real, imag } (index 0
// unused, as a PeriodicWave wants them). Each firing is a sharp pressure pulse, its rebound and the slow swell of
// the gas behind it; the firings come a little early or late, louder out of one bank than the other (BANKS), so the
// cycle's own frequency and its first harmonics (under the firing's, the 8th) are there: the burble. Seeded: the
// same engine every time. A couple of ms (a rotating phasor per harmonic, no sine per sample).
export function v8Cycle(n = 256, seed = 8, size = 2048) {
  const r = rng(seed), x = new Float32Array(size), fires = [];
  for (let k = 0; k < 8; k++) fires.push([(k + (r() - 0.5) * 0.2) / 8, BANKS[k] * (0.85 + 0.3 * r())]);
  for (const [at, amp] of fires) {
    for (let i = 0; i < size; i++) {
      const u = (((i / size - at) % 1) + 1) % 1 * 8; // firing intervals since this pulse
      if (u < 3) x[i] += amp * (Math.exp(-u / 0.09) - 0.62 * Math.exp(-u / 0.32) * Math.sin(Math.PI * Math.min(1, u / 0.9)) + 0.45 * Math.exp(-u / 0.8));
    }
  }
  const real = new Float32Array(n + 1), imag = new Float32Array(n + 1);
  for (let k = 1; k <= n; k++) {
    const w = (TAU * k) / size, cw = Math.cos(w), sw = Math.sin(w);
    let re = 0, im = 0, c = 1, sn = 0;
    for (let i = 0; i < size; i++) {
      re += x[i] * c; im += x[i] * sn;
      const nc = c * cw - sn * sw;
      sn = c * sw + sn * cw; c = nc;
    }
    real[k] = (2 * re) / size;
    imag[k] = (2 * im) / size;
  }
  return { real, imag };
}

// rpm (Hz of the cycle: two turns) for revs as a share of the redline
export const cycleHz = (revs, m = MOTOR) => (revs * m.red) / 120;

// The gearbox: step it with the vehicle's speed (share of its flat out), the throttle (0..1), whether the rear
// wheels spin and `free`, revs the throttle asks for out of gear (a flare at a standstill); it keeps the gear (0 = first), the revs (share of the redline), the load (0 while the clutch is out)
// and `shifted` (+1 up, -1 down, 0) on the step a shift happened.
export class Gearbox {
  constructor(m = MOTOR) {
    this.m = m;
    this.gear = 0;
    this.revs = m.idle;
    this.clutch = 0;   // s the clutch stays out
    this.load = 0;
    this.shifted = 0;
  }

  // revs the wheels ask for in gear g at speed
  geared(speed, g = this.gear) { return Math.max(this.m.idle, speed / this.m.tops[g]); }

  step(speed, throttle, spin, dt, free = 0) {
    const m = this.m, last = m.tops.length - 1;
    this.shifted = 0;
    if (this.clutch > 0) this.clutch -= dt;
    else if (!spin && this.gear < last && this.geared(speed) > m.up) {
      this.gear++; this.clutch = m.shift; this.shifted = 1;
    } else if (this.gear > 0 && this.geared(speed) < m.down && this.geared(speed, this.gear - 1) < m.up * 0.85) {
      this.gear--; this.clutch = m.shift * 0.7; this.shifted = -1;
    }
    const want = Math.min(1.02, Math.max(this.geared(speed), spin ? m.spin : 0, free));
    const tau = want > this.revs ? m.rise : m.fall;
    this.revs += (want - this.revs) * (1 - Math.exp(-dt / tau));
    this.load = this.clutch > 0 ? 0 : clamp(throttle, 0, 1);
    return this;
  }
}

// How hard the tyres squeal (0..1): the slide past `from` rad, full at `full`, scaled by the speed (share of flat
// out, full from squeal.speed); `chirp` (0..1): what the spinning wheels or a shift add on top
export function squealOf(slip, speed, chirp = 0, m = MOTOR) {
  const S = m.squeal;
  const slide = clamp((Math.abs(slip) - S.from) / (S.full - S.from), 0, 1) * clamp(speed / S.speed, 0, 1);
  return clamp(Math.max(slide, chirp), 0, 1);
}

// the chirp of the launch: full as the wheels start to spin, gone when they grip (u: 0..1 of the spin's time)
export const launchChirp = (u, m = MOTOR) => (u >= 0 && u < 1 ? m.squeal.launch * (1 - u * u) : 0);
