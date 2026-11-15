// The title's day and night (data/daycycle.js), as pure functions of t (seconds on the title): the hour, the palette
// of the moment held in steps (lookAt), the sun and the moon on their curves, the showers, which lights are on, and
// the colour bands the painters light their layers with. DOM-free and stateless but for a one-step memo, so any
// instant can be asked on its own (and tested).
import { DAY } from '../../data/daycycle.js';
import { hash, clamp, smooth } from './Timeline.js';

const { LOOP, STEP } = DAY;
const loopT = (t) => ((t % LOOP) + LOOP) % LOOP;

// ---------------------------------------------------------------- colours
const rgbOf = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
export const mix = (a, b, k) => [0, 1, 2].map((i) => a[i] + (b[i] - a[i]) * k);
export const css = (c, a = 1) => (a >= 1 ? `rgb(${c.map(Math.round).join(',')})` : `rgba(${c.map(Math.round).join(',')},${a})`);
const luma = (c) => (0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2]) / 255;

// the keyframes with their colours as [r, g, b], the first one again at LOOP to close the loop
const KEYS = DAY.keys.map((k) => ({
  ...k, sky: k.sky.map(rgbOf), cloud: k.cloud.map(rgbOf), light: rgbOf(k.light), low: rgbOf(k.low), glass: rgbOf(k.glass),
  glassTop: rgbOf(k.glassTop), haze: [rgbOf(k.haze[0]), k.haze[1]],
}));
KEYS.push({ ...KEYS[0], at: LOOP, h: KEYS[0].h + 24 });

// the two keyframes about a time of the loop and how far between them it is
function around(lt) {
  let i = 0;
  while (i < KEYS.length - 2 && KEYS[i + 1].at <= lt) i++;
  const a = KEYS[i], b = KEYS[i + 1];
  return [a, b, clamp((lt - a.at) / (b.at - a.at), 0, 1)];
}

// the hour of the day at t, 0..24 (the clock runs on through the steps)
export function hourAt(t) {
  const [a, b, k] = around(loopT(t));
  return (a.h + (b.h - a.h) * k) % 24;
}

// ---------------------------------------------------------------- the sun and the moon
// null below the horizon, else { x, y (logical px), r, u 0..1 along its way, up 0..1 how high it is (0 at its rising
// and its setting) }
function crossing(B, t) {
  const span = B.set - B.rise, u = loopT(t - B.rise) / span;
  if (u > 1) return null;
  const cx = 2 * B.peak[0] - (B.from[0] + B.to[0]) / 2, cy = 2 * B.peak[1] - (B.from[1] + B.to[1]) / 2, v = 1 - u;
  return {
    x: v * v * B.from[0] + 2 * v * u * cx + u * u * B.to[0], y: v * v * B.from[1] + 2 * v * u * cy + u * u * B.to[1],
    r: B.r, u, up: 1 - Math.abs(2 * u - 1),
  };
}
export const sunAt = (t) => crossing(DAY.sun, t);
export const moonAt = (t) => crossing(DAY.moon, t);

// ---------------------------------------------------------------- the palette of the moment
// Held for STEP s: { step (its index in the loop), sky [6 x rgb], cloud [3], light, low, glass, glassTop, haze
// { c, k }, lamps, offices, glint, stars, bright 0..1 (how light the sky is: the logo's backing, the lens),
// shadow { dx, dy, k } (the truss's shadow cast by the sun on the towers' low floors) or null }
let memo = null;
export function lookAt(t) {
  const step = Math.floor(loopT(t) / STEP);
  if (memo && memo.step === step) return memo;
  const lt = step * STEP, [a, b, k] = around(lt), m = (key) => mix(a[key], b[key], k), n = (key) => a[key] + (b[key] - a[key]) * k;
  const sky = a.sky.map((c, i) => mix(c, b.sky[i], k)), sun = sunAt(lt);
  const P = {
    step, sky, cloud: a.cloud.map((c, i) => mix(c, b.cloud[i], k)), light: m('light'), low: m('low'), glass: m('glass'),
    glassTop: m('glassTop'), haze: { c: mix(a.haze[0], b.haze[0], k), k: a.haze[1] + (b.haze[1] - a.haze[1]) * k },
    lamps: n('lamps'), offices: n('offices'), glint: n('glint'), stars: n('stars'),
    bright: clamp((luma(sky[3]) - 0.15) / 0.5, 0, 1), shadow: null,
  };
  // a long shadow when the sun is low, short and under the deck at noon; it leans away from the sun
  if (sun && sun.up > 0.04) P.shadow = { dx: Math.round((200 - sun.x) * 0.3), dy: Math.round(6 + 14 * (1 - sun.up)), k: 0.42 * smooth(0.04, 0.25, sun.up) };
  memo = P;
  return P;
}

// ---------------------------------------------------------------- the lights
// A light that comes on when the city's lamps reach `at` (0..1) and goes off again under it: false / true, and while it
// warms up (just past its point) it stutters like a tube catching. i: its own seed.
export function lampLit(lamps, at, i, t) {
  if (lamps < at) return false;
  if (lamps > at + 0.06) return true;
  return hash(Math.floor(t * 11) * 1.3 + i * 7.1) > 0.45;
}
// One of the towers' offices: lit while there is somebody in it (the lowest seeds stay latest) and the lights are
// on, its own lamp going off and on through the night (life: Timeline.lampOn). i: its seed.
export function officeLit(i, t, P, life) {
  const who = hash(i * 2.31 + 0.7);
  if (who > P.offices) return false;
  if (!lampLit(P.lamps, 0.15 + 0.6 * hash(i * 0.53 + 4.1), i, t)) return false;
  return !!life(i, t);
}

// ---------------------------------------------------------------- the rain
// how much falls at t, 0..1 of the rain's full (light) count: nothing but in the showers
export function rainAt(t) {
  const lt = loopT(t);
  let v = 0;
  for (const s of DAY.showers) {
    for (const o of [0, -LOOP, LOOP]) {
      const a = lt + o;
      v = Math.max(v, s.amount * smooth(s.from, s.from + s.fade, a) * (1 - smooth(s.to - s.fade, s.to, a)));
    }
  }
  return v;
}

// ---------------------------------------------------------------- the light on the layers
// Colour bands [{ y0, y1, c }] in the title's logical px, top down, to multiply a layer by: `light` high up stepping
// down to `low` at street level (solids: the steel, the train, the crowns, what is far off)...
export function lightBands(P) {
  const L = P.light, G = P.low;
  return [
    { y0: -40, y1: 104, c: L }, { y0: 104, y1: 128, c: mix(L, G, 0.25) }, { y0: 128, y1: 152, c: mix(L, G, 0.5) },
    { y0: 152, y1: 176, c: mix(L, G, 0.75) }, { y0: 176, y1: 260, c: G },
  ];
}
// ...and for the towers' glass: the sky it gives back, warmer or paler on the high floors, the street's light on the
// low ones
export function glassBands(P) {
  const T = P.glassTop, G = P.glass;
  return [
    { y0: -40, y1: 24, c: T }, { y0: 24, y1: 48, c: mix(T, G, 0.5) }, { y0: 48, y1: 140, c: G },
    { y0: 140, y1: 170, c: mix(G, P.low, 0.25) }, { y0: 170, y1: 260, c: mix(G, P.low, 0.45) },
  ];
}

// ---------------------------------------------------------------- small life in the sky
// a number of the palette (lamps, glint...) at t, not held in steps (for what is decided once, at a slot's start)
function valueAt(key, t) {
  const [a, b, k] = around(loopT(t));
  return a[key] + (b[key] - a[key]) * k;
}
// The planes of the night (DAY.planes), far off over the slit between the towers, crossing slowly from right to
// left: a red light slow, a white strobe in double flashes. null, or { x, y, red, white }
export function planeAt(t) {
  const lt = loopT(t), { from, to, speed } = DAY.plane;
  for (const [i, start] of DAY.planes.entries()) {
    const a = lt - start;
    if (a < 0 || a > (from - to) / speed) continue;
    const s = (t * 1.25) % 1;
    return { x: from - a * speed, y: 66 + Math.round(hash(i * 5.3 + 2) * 10), red: t % 1.6 < 0.5, white: s < 0.06 || (s > 0.16 && s < 0.22) };
  }
  return null;
}
// By day a few pigeons cross in front of the towers now and then, together, each its own beat of wings. null, or
// [{ x, y, up }]
const BIRDS = { slot: 17, speed: 36, n: 5 };
export function birdsAt(t) {
  const k = Math.floor(t / BIRDS.slot), start = k * BIRDS.slot + hash(k * 2.9 + 0.3) * 5, a = t - start;
  if (a < 0 || valueAt('lamps', start) > 0 || valueAt('glint', start) < 0.5) return null;
  const dir = hash(k * 1.7 + 4.4) < 0.5 ? 1 : -1, y0 = 72 + hash(k * 6.1) * 8, run = a * BIRDS.speed;
  if (run > 380 + 60) return null;
  const out = [];
  for (let i = 0; i < BIRDS.n; i++) {
    const lag = hash(k + i * 1.9) * 26, x = dir > 0 ? run - 30 - lag : 410 - run + lag;
    out.push({ x, y: y0 + Math.round(hash(k * 0.7 + i * 3.3) * 10 - 5 + Math.sin(t * 2 + i) * 1.5), up: Math.floor(t * 7 + i * 1.7) % 2 === 0 });
  }
  return out;
}
