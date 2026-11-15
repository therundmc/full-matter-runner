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

// ---------------------------------------------------------------- the elevated train
// One train per slot, 22 to 34 s apart, each way as the dice say. It is heard `approach` s before its nose comes into
// the picture and for `leave` s after its tail has gone. cars x car px long with gaps; px/s. Some pull up on the
// bridge, held at a signal (never the first, always the second, so the title shows one soon): they brake over `brake`
// px to stand with their middle in the middle of the picture, wait `hold` s, then pull away at `pull` px/s/s back up
// to speed.
export const TRAIN = {
  slot: 28, jitter: 6, speed: 170, cars: 4, car: 150, gap: 3, approach: 2.5, leave: 2.5, pad: 70,
  stops: 0.4, brake: 320, hold: [4, 6], pull: 40,
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
    k, start, dir: hash(k * 1.33 + 7.2) < 0.5 ? 1 : -1, horn: hash(k * 1.91 + 1.1) < 0.4, sparks: 0.5 + hash(k * 4.4),
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
// dies as it goes), shake 0..1 (the window pane: strongest while it runs past in the picture), horn, sparks (how much
// this one throws at the third rail), stop }
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

// ---------------------------------------------------------------- what is heard
// [{ name, vol, opts }] for Audio.play, of what happens between t0 and t1: each train's rumble swelling from far
// (passby, loudest when the middle of the train crosses the middle of the window), its horn now and then before it
// comes into the picture; a train that pulls up rumbles in braking, lets its air brakes go when it stands, sounds its
// horn before it pulls away and rumbles out; the city's far wash under it all.
export function titleBeats(t0, t1) {
  const cues = [];
  const at = (s, name, vol, opts = {}) => { if (t0 < s && t1 >= s) cues.push({ name, vol, opts }); };
  for (let k = Math.floor(t0 / TRAIN.slot) - 1; k <= Math.floor(t1 / TRAIN.slot) + 1; k++) {
    const s = trainSlot(k), from = s.start - TRAIN.approach, train = { dir: s.dir, side: 0.3, f: 27 };
    if (!s.stop) {
      const mid = (TRAIN.pad + LW / 2 + TRAIN_LEN / 2) / TRAIN.speed;
      at(from, 'passby', 1.3, { ...train, lead: TRAIN.approach + mid, dur: TRAIN.approach + TRAIN_DUR + TRAIN.leave });
      if (s.horn) at(s.start - 1.1, 'horn', 0.55, { pitch: 0.52 });
      continue;
    }
    at(from, 'passby', 1.2, { ...train, lead: TRAIN.approach + (s.brakeAt + s.stand) / 2, dur: TRAIN.approach + s.stand + 1.2 });
    at(s.start + s.stand, 'hiss', 0.5, { pitch: 0.42 });
    at(s.start + s.go - 0.9, 'horn', 0.5, { pitch: 0.52 });
    at(s.start + s.go, 'passby', 1.1, { ...train, lead: (s.dur - s.go) * 0.55, dur: s.dur - s.go + TRAIN.leave });
  }
  for (let k = Math.floor(t0 / 8); k <= Math.floor(t1 / 8); k++) at(k * 8 + 0.5, 'air', 1, { inside: 1 });
  return cues;
}
