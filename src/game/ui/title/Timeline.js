// Timeline of the title scene: everything that changes, as a pure function of t (seconds): the wind and its gusts,
// the elevated train (passing, or now and then pulling up on the bridge a moment and going on), the patrol car on the
// bridge's lower deck now and then, the towers' offices going dark and lit again, and what is heard of it all.
// DOM-free and stateless, so any instant can be asked on its own (and tested).
import { LW } from './Draw.js';

export const hash = (n) => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const smooth = (a, b, v) => { const k = clamp((v - a) / (b - a), 0, 1); return k * k * (3 - 2 * k); };

// ---------------------------------------------------------------- wind
// One gust per slot, starting 0..jitter s into it (so 7 to 13 s apart), rising, holding, dying; its peak varies.
export const GUST = { slot: 10, jitter: 3, rise: 0.6, hold: [1.5, 3], fall: 1.5 };

function gustOf(k) {
  const start = k * GUST.slot + hash(k * 1.37 + 5.1) * GUST.jitter;
  const hold = GUST.hold[0] + hash(k * 2.11 + 0.7) * (GUST.hold[1] - GUST.hold[0]);
  return { k, start, hold, end: start + GUST.rise + hold + GUST.fall, peak: 0.86 + 0.14 * hash(k * 3.3 + 1.9) };
}
function envelope(g, t) {
  const a = t - g.start;
  if (a <= 0 || t >= g.end) return 0;
  const up = smooth(0, GUST.rise, a), down = 1 - smooth(GUST.rise + g.hold, GUST.rise + g.hold + GUST.fall, a);
  const flutter = 0.9 + 0.1 * Math.sin(a * 5.3 + g.k) * Math.sin(a * 2.1 + 1);     // the gust is not a plateau
  return g.peak * up * down * flutter;
}
// The wind blows toward the left. gust 0..1; breeze 0.06..0.38 (slow turbulence); speed = breeze + gust;
// angle of the falling rain from the vertical (deg): about 8 when calm, 30 to 35 at the top of a gust; slant = tan.
export function windState(t) {
  const k = Math.floor(t / GUST.slot);
  let last = gustOf(k);
  if (t < last.start) last = gustOf(k - 1);
  const gust = envelope(last, t);
  const breeze = 0.22 + 0.08 * Math.sin(t * 0.31) + 0.05 * Math.sin(t * 0.77 + 1.3) + 0.03 * Math.sin(t * 1.9 + 0.4);
  const angle = 6 + 9 * breeze + 26 * gust;
  return { gust, breeze, speed: breeze + gust, angle, slant: Math.tan(angle * Math.PI / 180) };
}

// ---------------------------------------------------------------- the cloud deck
// The deck drifts left on the high wind, slowly and steadily: `speed` px/s, breathing a little faster and slower over
// long swings ([share of the speed, period s]; never backward, never past (1 + the shares) x speed). Its offset is the
// integral of that speed in closed form, so it is continuous at any t (the street's gusts do not reach it).
export const CLOUD = { speed: 1.2, swell: [[0.3, 47], [0.15, 19]] };
export function cloudDrift(t) {
  let x = CLOUD.speed * t;
  for (const [k, per] of CLOUD.swell) x += (CLOUD.speed * k * per / (2 * Math.PI)) * Math.sin((2 * Math.PI * t) / per);
  return x;
}

// ---------------------------------------------------------------- the elevated train
// One train per slot, 22 to 34 s apart, each way as the dice say. It is heard `approach` s before its nose comes into
// the picture and for `leave` s after its tail has gone. cars x car px long with gaps; px/s. Some pull up on the
// bridge, held at a signal (never the first, always the second, so the title shows one soon): they brake over `brake`
// px to stand with their middle in the middle of the picture, wait `hold` s, then pull away at `pull` px/s/s back up
// to speed. wheels: the axles under a car drawn going right (px from its left end; two trucks of two axles).
export const TRAIN = {
  slot: 28, jitter: 6, speed: 170, cars: 4, car: 150, gap: 3, approach: 2.5, leave: 2.5, pad: 70,
  stops: 0.4, brake: 320, hold: [4, 6], pull: 40, wheels: [15, 32, 117, 134],
};
export const TRAIN_LEN = TRAIN.cars * TRAIN.car + (TRAIN.cars - 1) * TRAIN.gap;
const TRAVEL = LW + 2 * TRAIN.pad + TRAIN_LEN;                 // the nose's run, from out of sight to the tail gone
const STAND = TRAIN.pad + LW / 2 + TRAIN_LEN / 2;              // the run at which a stopping train stands, centred
// the time a train that does not stop takes from the nose at one edge of its travel to the tail past the other
export const TRAIN_DUR = TRAVEL / TRAIN.speed;

// the motion of one slot's train, as times from its start: cruise until `brakeAt`, `stand` stopped, `go` pulls away,
// `dur` gone
function motion(s) {
  if (!s.stop) return { dur: TRAIN_DUR };
  const v = TRAIN.speed, brakeAt = (STAND - TRAIN.brake) / v, stand = brakeAt + (2 * TRAIN.brake) / v;
  const go = stand + s.hold, up = v / TRAIN.pull, upRun = (v * up) / 2;    // back up to speed in `up` s, over upRun px
  return { brakeAt, stand, go, dur: go + up + (TRAVEL - STAND - upRun) / v };
}
export function trainSlot(k) {
  const start = k * TRAIN.slot + 4 + hash(k * 2.71 + 0.4) * TRAIN.jitter;     // the first one heard coming a few s in
  const s = {
    k, start, dir: hash(k * 1.33 + 7.2) < 0.5 ? 1 : -1, sparks: 0.5 + hash(k * 4.4), squeal: hash(k * 1.91 + 1.1) < RAIL.squeal,
    stop: k === 1 || (k > 1 && hash(k * 3.17 + 2.9) < TRAIN.stops), hold: TRAIN.hold[0] + hash(k * 5.9 + 0.2) * (TRAIN.hold[1] - TRAIN.hold[0]),
  };
  return { ...s, ...motion(s) };
}
// how far the nose has run (px from out of sight) and how fast (px/s), a s after the slot's start
function runAt(s, a) {
  const v = TRAIN.speed;
  if (!s.stop || a < s.brakeAt) return { run: a * v, v };
  if (a < s.stand) { const u = a - s.brakeAt, dec = (v * v) / (2 * TRAIN.brake); return { run: STAND - TRAIN.brake + v * u - (dec * u * u) / 2, v: v - dec * u }; }
  if (a < s.go) return { run: STAND, v: 0 };
  const u = a - s.go, up = v / TRAIN.pull;
  if (u < up) return { run: STAND + (TRAIN.pull * u * u) / 2, v: TRAIN.pull * u };
  return { run: STAND + (v * up) / 2 + v * (u - up), v };
}
// null when no train is heard; else { k, dir, x: the nose's x (logical px), tail, v: its speed (px/s), braking (it is
// slowing to a stop), rumble 0..1 (what is heard and felt: it swells as it comes, sinks to an idle while it stands,
// dies as it goes), shake 0..1 (the window pane: strongest while it runs past in the picture), sparks (how much this
// one throws at the third rail), squeal (its flanges sing in the bend), stop }
export function trainState(t) {
  const k = Math.floor(t / TRAIN.slot);
  for (const s of [trainSlot(k), trainSlot(k - 1)]) {
    const a = t - s.start;
    if (a < -TRAIN.approach || a > s.dur + TRAIN.leave) continue;
    const { run, v } = runAt(s, Math.max(0, a));
    const r = a < 0 ? a * TRAIN.speed : run;
    const x = s.dir > 0 ? r - TRAIN.pad : LW - r + TRAIN.pad, tail = x - s.dir * TRAIN_LEN;
    const there = smooth(-TRAIN.approach, 0.4, a) * (1 - smooth(s.dur - 0.6, s.dur + TRAIN.leave, a));
    const pace = Math.min(1, v / TRAIN.speed), rumble = there * (0.2 + 0.8 * pace);
    const lo = Math.min(x, tail), hi = Math.max(x, tail), inView = Math.max(0, Math.min(hi, LW) - Math.max(lo, 0)) / LW;
    const braking = !!s.stop && a >= s.brakeAt && a < s.stand;
    return { ...s, a, x, tail, v, braking, rumble, shake: rumble * pace * (0.35 + 0.65 * Math.min(1, inView * 1.6)) };
  }
  return null;
}

// ---------------------------------------------------------------- the patrol car
// Now and then (every 40 to 70 s) a patrol car runs along the bridge's lower deck, no siren, its bar flashing.
// null, or { k, x (logical px, its middle), dir, red, blue (0 / 1: the halves of the light bar) }
export const PATROL = { slot: 55, jitter: 15, speed: 64, first: 14 };
export function policeState(t) {
  const k = Math.floor((t - PATROL.first) / PATROL.slot);
  for (const j of [k, k - 1]) {
    if (j < 0) continue;
    const s = PATROL.first + j * PATROL.slot + (j ? hash(j * 2.3 + 0.9) * PATROL.jitter : 0), a = t - s;
    const run = a * PATROL.speed;
    if (a < 0 || run > LW + 160) continue;
    const dir = hash(j * 4.7 + 1.3) < 0.5 ? 1 : -1, x = dir > 0 ? run - 80 : LW + 80 - run;
    // the bar: red twice, blue twice, a beat of both, round again (0.8 s)
    const step = Math.floor(t * 12.5) % 10, on = [1, 0, 1, 0, 2, 0, 2, 0, 3, 3][step];
    return { k: j, dir, x, red: on & 1, blue: (on >> 1) & 1 };
  }
  return null;
}

// ---------------------------------------------------------------- the windows
// A lit office of the towers lives its own night: on or off for 12 to 50 s stretches (most are on). i: its index;
// returns 0 (dark) or 1.
export function lampOn(i, t) {
  const per = 12 + hash(i * 0.71 + 3.3) * 38, k = Math.floor(t / per + hash(i * 1.93));
  return hash(k * 1.17 + i * 0.37) < 0.72 ? 1 : 0;
}

// ---------------------------------------------------------------- what the train sounds like
// The ear is at the window across the street, in front of the middle of the picture, `ear` px from the track: what
// happens x px along the track from there is heard at near(x) = ear^2 / (ear^2 + x^2) (the square of 1/r: the nearest
// joints lead the rhythm, the far ones only ring under it), and what is under `cull` is not heard at all. The rails
// have a joint every `joint.every` px, one right in front (`joint.at`); each axle of the train (TRAIN.wheels) knocks
// on every joint it rolls over, as hard as it runs. Past the right tower the line bends (from `bend` px on, over
// `bendLen`): the flanges of some trains (`squeal`: their share) sing softly on it. The sound is cued in pieces of
// `seg` s, `lead` s ahead of the picture, each overlapping the next by `tail` s (audio/Elevated.js renders them one
// after another, unbroken; leaving the title stops it within a piece); its curves are sampled `rate` times a s; the
// air brakes let go `sigh` s after a train stands.
export const RAIL = {
  ear: 110, cull: 0.06, joint: { at: 196, every: 128 }, bend: LW + 240, bendLen: 260, squeal: 0.5,
  seg: 0.5, lead: 0.3, tail: 0.08, rate: 40, sigh: 0.35,
};
const EAR = LW / 2;
const near = (x) => (RAIL.ear * RAIL.ear) / (RAIL.ear * RAIL.ear + (x - EAR) * (x - EAR));
// each axle's distance behind the nose (px), whichever way the train runs
const AXLES = [];
for (let i = 0; i < TRAIN.cars; i++) for (const w of TRAIN.wheels) AXLES.push((i + 1) * TRAIN.car + i * TRAIN.gap - w);
AXLES.sort((a, b) => a - b);
// what all the axles make heard with the train's middle in front of the ear (the loudest it gets)
const FULL = AXLES.reduce((sum, d) => sum + near(EAR + TRAIN_LEN / 2 - d), 0);
// the joints that can be heard
const JOINTS = [];
for (let j = -20; j <= 20; j++) { const x = RAIL.joint.at + j * RAIL.joint.every; if (near(x) >= RAIL.cull) JOINTS.push(x); }

// how far the nose has run (px) and how fast, a s from the slot's start (before it: coming at speed)
const runOf = (s, a) => (a < 0 ? { run: a * TRAIN.speed, v: TRAIN.speed } : runAt(s, a));
// the first time the nose has run r px (runOf turned round)
function timeAtRun(s, r) {
  const v = TRAIN.speed;
  if (!s.stop || r <= STAND - TRAIN.brake) return r / v;
  if (r < STAND) {
    const dec = (v * v) / (2 * TRAIN.brake), d = r - (STAND - TRAIN.brake);
    return s.brakeAt + (v - Math.sqrt(Math.max(0, v * v - 2 * dec * d))) / dec;
  }
  const up = v / TRAIN.pull, upRun = (v * up) / 2;
  if (r < STAND + upRun) return s.go + Math.sqrt((2 * (r - STAND)) / TRAIN.pull);
  return s.go + up + (r - STAND - upRun) / v;
}
// the nose's x at a run of r px, and the run at which the nose is at x
const noseAt = (s, r) => (s.dir > 0 ? r - TRAIN.pad : LW - r + TRAIN.pad);
const runTo = (s, x) => (s.dir > 0 ? x + TRAIN.pad : LW - x + TRAIN.pad);
// when the passage is heard (s from the slot's start), and how much of it is let in at its ends
const spanOf = (s) => [-TRAIN.approach, s.dur + TRAIN.leave];
function opening(s, a) {
  const [a0, a1] = spanOf(s);
  return smooth(a0, a0 + 1.2, a) * (1 - smooth(a1 - 1.5, a1, a));
}
const panOf = (x) => clamp(((x - EAR) / (LW / 2)) * 0.6, -0.7, 0.7);

// What the train of slot s makes heard a s after its start: { near: the whole train's nearness 0..1 (the steel
// rumbling under it), roll: the wheels' roar (nearness and speed), pan -0.7..0.7 (where the noise comes from), bright
// 0..1 (its nearest axle: how much of its highs reach the ear), pace 0..1, drive 0..1 (the motors pulling away or
// holding it back), stand 0..1 (standing: its compressor and fans), squeal 0..1 (the flanges on the bend), brake 0..1
// (the shoes singing at the end of a stop) }
export function trainHeard(s, a) {
  const { run, v } = runOf(s, a), x = noseAt(s, run), pace = v / TRAIN.speed, open = opening(s, a);
  let sum = 0, mid = 0, top = 0, bend = 0;
  for (const d of AXLES) {
    const ax = x - s.dir * d, n = near(ax);
    sum += n; mid += n * ax; top = Math.max(top, n);
    if (s.squeal && ax > RAIL.bend && ax < RAIL.bend + RAIL.bendLen) bend++;
  }
  const standing = s.stop ? smooth(s.stand - 0.4, s.stand + 0.3, a) * (1 - smooth(s.go - 0.2, s.go + 1.2, a)) : 0;
  const braking = s.stop && a > s.brakeAt && a < s.stand ? (a - s.brakeAt) / (s.stand - s.brakeAt) : 0;
  const pulling = s.stop && a > s.go ? 1 - smooth(s.go + 1, s.go + TRAIN.speed / TRAIN.pull, a) : 0;
  const k = Math.min(1, sum / FULL);
  return {
    near: k * open, roll: k * open * pace ** 0.8, pan: sum > 1e-9 ? panOf(mid / sum) : 0, bright: top * open, pace,
    drive: open * Math.min(1, k * 2) * Math.max(pulling, smooth(0, 0.3, braking), 0.25 * pace), stand: standing * open,
    squeal: Math.min(1, bend / 6) * pace * open, brake: smooth(0.35, 0.8, braking) * (1 - smooth(0.94, 1, braking)) * open,
  };
}

// The knocks of the wheels on the joints of slot s's train from a0 to a1 s after its start: [{ at (s from the slot's
// start), x (the joint), axle (its index from the nose), g (how loud: its nearness and how hard it rolls), pan,
// bright (its nearness) }], in time order
export function trainKnocks(s, a0, a1) {
  const out = [], [b0, b1] = spanOf(s);
  for (const x of JOINTS) {
    AXLES.forEach((d, axle) => {
      const at = timeAtRun(s, runTo(s, x + s.dir * d));
      if (at < a0 || at >= a1 || at < b0 || at > b1) return;
      const pace = runOf(s, at).v / TRAIN.speed, g = near(x) * (0.2 + 0.8 * pace) * opening(s, at);
      if (g >= RAIL.cull * 0.5 && pace > 0.02) out.push({ at, x, axle, g, pan: panOf(x), bright: near(x) });
    });
  }
  return out.sort((p, q) => p.at - q.at);
}

// One piece of the sound of slot s's train, from a0 s after its start and `len` s long, for audio/Elevated.js: { k, a0, len, tail,
// rate, dir, curve: { near, roll, pan, bright, pace, drive, stand, squeal, brake: [values `rate` a s from a0 over
// len + tail] }, knocks: [[at (s from a0), g, pan, bright]] (from a little before a0: their ring runs on), sighs:
// [[at, g]] (the air brakes letting go as it stands) }
const RING = 0.3;                     // s a knock rings on
export function trainSound(s, a0, len = RAIL.seg) {
  const n = Math.ceil((len + RAIL.tail) * RAIL.rate) + 2, curve = {};
  for (let i = 0; i < n; i++) {
    const h = trainHeard(s, a0 + i / RAIL.rate);
    for (const key in h) (curve[key] ||= []).push(Math.round(h[key] * 1e4) / 1e4);
  }
  const knocks = trainKnocks(s, a0 - RING, a0 + len + RAIL.tail).map((c) => [c.at - a0, c.g, c.pan, c.bright]);
  const sigh = s.stop ? s.stand + RAIL.sigh - a0 : -9;
  const sighs = sigh > -3 && sigh < len + RAIL.tail ? [[sigh, 1]] : [];
  return { k: s.k, a0, len, tail: RAIL.tail, rate: RAIL.rate, dir: s.dir, curve, knocks, sighs };
}

// ---------------------------------------------------------------- what is heard
// [{ name, vol, opts }] for Audio.play, of what happens between t0 and t1: each train from far off to far off again,
// piece by piece ('elTrain', see RAIL), each cued `lead` s before its time (opts.delay: when it starts from now, so
// the knocks fall as the wheels drawn roll over the joints); the city's far wash under it all.
export function titleBeats(t0, t1) {
  const cues = [];
  for (let k = Math.floor(t0 / TRAIN.slot) - 1; k <= Math.floor(t1 / TRAIN.slot) + 1; k++) {
    const s = trainSlot(k), [a0, a1] = spanOf(s);
    for (let a = a0; a < a1; a += RAIL.seg) {
      const cue = s.start + a - RAIL.lead;
      if (t0 < cue && t1 >= cue) cues.push({ name: 'elTrain', vol: 1, opts: { el: trainSound(s, a), delay: s.start + a - t1 } });
    }
  }
  for (let k = Math.floor(t0 / 8); k <= Math.floor(t1 / 8); k++) {
    const s = k * 8 + 0.5;
    if (t0 < s && t1 >= s) cues.push({ name: 'air', vol: 1, opts: { inside: 1 } });
  }
  return cues;
}
