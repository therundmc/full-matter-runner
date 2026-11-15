// Timeline of the title scene: everything that changes, as a pure function of t (seconds): the wind and its gusts,
// the elevated train passing every 20 to 30 s, the police car now and then down the avenue, the traffic, the
// searchlights over the low clouds, the far lightning, the city's windows going on and off, and what is heard of it.
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
// angle of the falling rain from the vertical (deg): about 8 when calm, 30 to 35 at the top of a gust; slant = tan;
// last = the latest gust begun (start, end, k: its index, for anything that rides it).
export function windState(t) {
  const k = Math.floor(t / GUST.slot);
  let last = gustOf(k);
  if (t < last.start) last = gustOf(k - 1);
  const gust = envelope(last, t);
  const breeze = 0.22 + 0.08 * Math.sin(t * 0.31) + 0.05 * Math.sin(t * 0.77 + 1.3) + 0.03 * Math.sin(t * 1.9 + 0.4);
  const angle = 6 + 9 * breeze + 26 * gust;
  return { gust, breeze, speed: breeze + gust, angle, slant: Math.tan(angle * Math.PI / 180), last };
}

// ---------------------------------------------------------------- the elevated train
// One train per slot, 20 to 30 s apart, each way in turn as the dice say. It is heard `approach` s before its nose
// comes into the picture and for `leave` s after its tail has gone. cars x car px long with gaps; px/s.
export const TRAIN = { slot: 25, jitter: 5, speed: 150, cars: 4, car: 88, gap: 3, approach: 2.5, leave: 2.5, pad: 70 };
export const TRAIN_LEN = TRAIN.cars * TRAIN.car + (TRAIN.cars - 1) * TRAIN.gap;
// the time it takes from the nose at one edge of the travel to the tail past the other
export const TRAIN_DUR = (LW + 2 * TRAIN.pad + TRAIN_LEN) / TRAIN.speed;
export function trainSlot(k) {
  const start = k * TRAIN.slot + 4 + hash(k * 2.71 + 0.4) * TRAIN.jitter;     // the first one heard coming a few s in
  return { k, start, dir: hash(k * 1.33 + 7.2) < 0.5 ? 1 : -1, horn: hash(k * 1.91 + 1.1) < 0.4, sparks: 0.5 + hash(k * 4.4) };
}
// null when no train is heard; else { k, dir, x: the nose's x (logical px), tail, rumble 0..1 (what is heard and felt:
// it swells as it comes, holds while it passes, dies as it goes), shake 0..1 (the window pane: strongest while the
// train is in the picture), horn, sparks (how much this one throws at the third rail) }
export function trainState(t) {
  const k = Math.floor(t / TRAIN.slot);
  for (const s of [trainSlot(k), trainSlot(k - 1)]) {
    const a = t - s.start;
    if (a < -TRAIN.approach || a > TRAIN_DUR + TRAIN.leave) continue;
    const run = a * TRAIN.speed - TRAIN.pad;            // how far the nose is into the picture (px)
    const x = s.dir > 0 ? run : LW - run, tail = x - s.dir * TRAIN_LEN;
    const rumble = smooth(-TRAIN.approach, 0.4, a) * (1 - smooth(TRAIN_DUR - 0.6, TRAIN_DUR + TRAIN.leave, a));
    const lo = Math.min(x, tail), hi = Math.max(x, tail), inView = Math.max(0, Math.min(hi, LW) - Math.max(lo, 0)) / LW;
    return { ...s, a, x, tail, rumble, shake: rumble * (0.35 + 0.65 * Math.min(1, inView * 1.6)) };
  }
  return null;
}

// ---------------------------------------------------------------- the avenue
// The traffic: each lane runs at one speed, its cars spaced along a loop longer than the picture (so they never run
// into each other and the lane is empty a while now and then). [offset px along the loop, kind (paint)]. The near
// lane keeps a slot for the patrol car: it is there on the first pass and then on some passes, no siren, its bar
// flashing.
const LANES = [
  { dir: -1, v: 46, len: 1500, cars: [[0, 0], [330, 1], [610, 6], [980, 4], [1240, 2]] },
  { dir: 1, v: 38, len: 1300, cars: [[120, 2], [520, 5], [760, 3]], police: 1000 },
];
const along = (L, off, t) => {
  const u = t * L.v + off, d = u % L.len - 80;              // -80 .. len - 80 px along its way
  return { x: L.dir > 0 ? d : LW - d, c: Math.floor(u / L.len) };
};
const inView = (x) => x > -90 && x < LW + 90;
// [{ x: its middle, dir, lane, kind }]
export function traffic(t) {
  const out = [];
  LANES.forEach((L, lane) => {
    for (const [off, kind] of L.cars) { const { x } = along(L, off, t); if (inView(x)) out.push({ x, dir: L.dir, lane, kind }); }
  });
  return out;
}
// null, or { x (logical px, its middle), dir, lane, red, blue (0 / 1: the halves of the light bar), k: the pass }
export function policeState(t) {
  const lane = 1, L = LANES[lane], { x, c } = along(L, L.police, t);
  if (!inView(x) || (c > 1 && hash(c * 3.9 + 0.3) > 0.6)) return null;
  // the bar: red twice, blue twice, a beat of both, round again (0.8 s)
  const step = Math.floor(t * 12.5) % 10, on = [1, 0, 1, 0, 2, 0, 2, 0, 3, 3][step];
  return { k: c, dir: L.dir, lane, x, red: on & 1, blue: (on >> 1) & 1 };
}

// ---------------------------------------------------------------- the sky
// two searchlights behind the skyline, sweeping the cloud base; angle from the vertical (rad, + leans right)
export const BEAMS = [{ x: 104, a: 0.5, w: 0.13, ph: 0.4, o: -0.1 }, { x: 292, a: 0.55, w: 0.097, ph: 2.6, o: 0.08 }];
export const beamAngles = (t) => BEAMS.map((b) => b.o + b.a * Math.sin(t * b.w + b.ph) + 0.06 * Math.sin(t * b.w * 3.1 + b.ph * 2));

// an airliner going over under the cloud, far, every 60 to 90 s, its lights blinking: null, or { x, y, dir,
// strobe (the white double flash), beacon (the red one on its belly) }
const PLANE = { slot: 75, jitter: 15, dur: 42 };
export function planeState(t) {
  const k = Math.floor(t / PLANE.slot), s = k * PLANE.slot + 20 + hash(k * 3.7 + 1.3) * PLANE.jitter, a = (t - s) / PLANE.dur;
  if (a < 0 || a > 1) return null;
  const dir = hash(k * 2.2 + 0.1) < 0.5 ? 1 : -1, ph = t % 1.3;
  return { x: dir > 0 ? -10 + a * (LW + 20) : LW + 10 - a * (LW + 20), y: 12 + hash(k * 5.5) * 10 + a * 5, dir, strobe: ph < 0.05 || (ph > 0.15 && ph < 0.2), beacon: t % 1.1 < 0.45 };
}

// silent sheet lightning far beyond the skyline, every 70 to 110 s: two quick flickers and a short afterglow, the
// bolt seen at the second. flash 0..1 (0 most of the time); x: where along the skyline (logical px); k: the strike
export const LIGHTNING = { slot: 90, jitter: 20, len: 0.75 };
export function lightningState(t) {
  const k = Math.floor(t / LIGHTNING.slot), s = k * LIGHTNING.slot + 12 + hash(k * 1.91 + 7.7) * LIGHTNING.jitter, a = t - s;
  const x = 40 + hash(k + 4.4) * 300;
  if (a < 0 || a > LIGHTNING.len) return { flash: 0, x, k, bolt: false };
  const pulse = (c, w) => Math.max(0, 1 - Math.abs(a - c) / w);
  const d2 = 0.17 + hash(k + 2.2) * 0.13;
  const glow = 0.18 * smooth(d2, d2 + 0.05, a) * (1 - smooth(d2 + 0.05, LIGHTNING.len, a));
  const flash = Math.max(pulse(0.04, 0.04), (0.75 + 0.25 * hash(k + 6.6)) * pulse(d2, 0.07), glow);
  return { flash: clamp(flash, 0, 1), x, k, bolt: Math.abs(a - d2) < 0.06 };
}

// ---------------------------------------------------------------- the windows
// A lit window of the city lives its own night: on or off for 12 to 50 s stretches (most are on), the curtain of a
// few, a bad tube, a television. i: the window's index; returns 0 (dark) .. 1.
export function lampOn(i, t) {
  const per = 12 + hash(i * 0.71 + 3.3) * 38, k = Math.floor(t / per + hash(i * 1.93));
  return hash(k * 1.17 + i * 0.37) < 0.72 ? 1 : 0;
}
// a failing fluorescent tube: mostly on, stuttering for a moment now and then
export function tubeFlicker(i, t) {
  const per = 4.3, u = t / per + hash(i), k = Math.floor(u), a = (u - k) * per - hash(k * 2.9 + i) * 3.2;
  if (hash(k * 0.61 + i * 7) < 0.6 && a > 0 && a < 0.5) return hash(Math.floor(t * 24) + i) > 0.55 ? 1 : 0.15;
  return 1;
}
// a TV's light: the colour of the picture (0..1) changing with the cuts, a few times a second
export const tvLight = (i, t) => hash(Math.floor(t * 6 + hash(i) * 3) * 1.31 + i * 9.7);
// somebody crossing a lit room: where he is across the window (0..1), or -1 when nobody is there
export function walker(i, t) {
  const per = 9 + hash(i * 3.3) * 7, k = Math.floor(t / per), a = t - k * per - hash(k + i * 1.9) * (per - 3), dur = 1.6 + hash(i + k) * 1.4;
  if (a < 0 || a > dur || hash(k * 4.1 + i) < 0.35) return -1;
  const p = a / dur;
  return hash(k * 2.3 + i) < 0.5 ? p : 1 - p;
}

// ---------------------------------------------------------------- what is heard
// [{ name, vol, opts }] for Audio.play, of what happens between t0 and t1: each train's rumble swelling from far
// (passby, its closest point when the middle of the train crosses the middle of the window) and its horn now and then
// before it comes into the picture; the city's far wash under it all.
export function titleBeats(t0, t1) {
  const cues = [];
  const at = (s, name, vol, opts = {}) => { if (t0 < s && t1 >= s) cues.push({ name, vol, opts }); };
  for (let k = Math.floor(t0 / TRAIN.slot) - 1; k <= Math.floor(t1 / TRAIN.slot) + 1; k++) {
    const s = trainSlot(k), mid = (TRAIN.pad + LW / 2 + TRAIN_LEN / 2) / TRAIN.speed;
    at(s.start - TRAIN.approach, 'passby', 1.3, { lead: TRAIN.approach + mid, dur: TRAIN.approach + TRAIN_DUR + TRAIN.leave, dir: s.dir, side: 0.3, f: 27 });
    if (s.horn) at(s.start - 1.1, 'horn', 0.55, { pitch: 0.52 });
  }
  for (let k = Math.floor(t0 / 8); k <= Math.floor(t1 / 8); k++) at(k * 8 + 0.5, 'air', 1, { inside: 1 });
  return cues;
}
