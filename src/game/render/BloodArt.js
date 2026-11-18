// Procedural blood (canvas side). Nothing here is a flat shape: a stain is a small pixel stamp whose every pixel
// has a thickness (a film the floor shows through -> where it stands thick), generated once from seeded noise and
// reused rotated by MapRenderer. Each stamp exists in three ages (wet crimson, tacky, dried brown-red).
// The pools under the bodies are liquid on the floor (render/LiquidArt.js takes its blood colours from RAMPS).
import { TAU, pick, seeded } from '../../engine/math.js';

const FILM = 1, THIN = 2, BODY = 3, DEEP = 4, CORE = 5;

// [r, g, b, a] per thickness level (then a glint, 6), for each age of a stain
export const RAMPS = [
  [null, [172, 26, 28, 140], [152, 18, 22, 220], [128, 11, 15, 255], [94, 7, 11, 255], [60, 4, 8, 255], [232, 156, 146, 255]],
  [null, [134, 20, 20, 155], [118, 14, 16, 225], [100, 10, 12, 255], [76, 7, 9, 255], [52, 4, 6, 255], [76, 7, 9, 255]],
  [null, [106, 32, 22, 155], [96, 25, 18, 225], [84, 20, 14, 255], [64, 14, 11, 255], [46, 9, 8, 255], [64, 14, 11, 255]],
];
// what is too thin to stay wet (fine spray, wiped trails): painted straight in a half-dried tone
export const SPECK = ['#7e1214', '#680e10', '#8c1618'];

const level = (t) => (t <= 0 ? 0 : t < 0.2 ? FILM : t < 0.45 ? THIN : t < 0.75 ? BODY : t < 0.92 ? DEEP : CORE);

// per-pixel noise in [0, 1)
function hash(x, y, s) {
  let h = (x * 374761393 + y * 668265263 + s * 974711) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

// an irregular closed outline: radius multiplier by direction (a few sine lobes around 1)
function lobes(rnd, amp, n = 4) {
  const k = [];
  for (let i = 0; i < n; i++) k.push([i + 2, rnd() * TAU, (amp * (0.5 + rnd())) / (i + 1.5)]);
  return (a) => {
    let s = 1;
    for (const [f, ph, m] of k) s += Math.sin(a * f + ph) * m;
    return s;
  };
}

// a stamp: thickness levels on a w x h grid around its anchor (cx, cy); fn(dx, dy, x, y) gives the thickness
function build(w, h, cx, cy, fn) {
  const px = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) px[y * w + x] = level(fn(x + 0.5 - cx, y + 0.5 - cy, x, y));
  return { w, h, cx, cy, px, img: [] };
}

function paint(canvas, w, h, px, age) {
  canvas.width = w; canvas.height = h;
  const g = canvas.getContext('2d');
  const im = g.createImageData(w, h), ramp = RAMPS[age];
  for (let i = 0; i < px.length; i++) if (px[i]) im.data.set(ramp[px[i]], i * 4);
  g.putImageData(im, 0, 0);
  return canvas;
}

// the canvas of a stamp at a given age (0 wet, 1 tacky, 2 dry)
export function stampImage(s, age = 0) {
  return s.img[age] || (s.img[age] = paint(document.createElement('canvas'), s.w, s.h, s.px, age));
}

// how thick a stain of radius r gets in its middle
const depth = (r) => Math.min(1, 0.5 + r * 0.1);

// a drop that fell straight: ragged, roundish
function spot(r, seed) {
  const rnd = seeded(seed), edge = lobes(rnd, 0.4), n = Math.ceil(r * 1.6) + 1, top = depth(r);
  return build(n * 2, n * 2, n, n, (dx, dy, x, y) => {
    const d = Math.hypot(dx, dy) / (r * edge(Math.atan2(dy, dx)));
    return d >= 1 ? 0 : 0.14 + (1 - d) ** 0.7 * (top - 0.14) + (hash(x, y, seed) - 0.5) * 0.3;
  });
}

// a drop that came in at an angle, travelling toward +x: an elongated stain, a thin wavering tail ahead of it and
// one to three satellite droplets thrown off its tip
function streak(w, len, seed) {
  const rnd = seeded(seed), edge = lobes(rnd, 0.3, 3);
  const a = len / 2, b = w / 2, top = depth(b + 0.6);
  const tail = a * (0.7 + rnd() * 0.9), ph = rnd() * TAU, wob = 0.25 + rnd() * 0.35;
  const sats = [];
  let sx = a + tail + 1 + rnd() * 1.5;
  for (let i = 0, n = 1 + Math.floor(rnd() * 2.6); i < n; i++) {
    sats.push([sx, (rnd() - 0.5) * (1 + i), Math.max(0.55, b * (0.6 - i * 0.2))]);
    sx += 1.5 + rnd() * 3;
  }
  const back = Math.ceil(a) + 2, half = Math.ceil(b) + 3;
  return build(back + Math.ceil(sx) + 2, half * 2, back, half, (dx, dy, x, y) => {
    let t = 0;
    const d = Math.hypot(dx / a, dy / b) / edge(Math.atan2(dy, dx));
    if (d < 1) t = 0.14 + (1 - d) ** 0.7 * (top * (0.85 + (0.25 * dx) / a) - 0.14);
    if (dx > a * 0.5 && dx < a + tail) {
      const k = (dx - a * 0.5) / (tail + a * 0.5);
      if (Math.abs(dy - Math.sin(dx * 0.8 + ph) * wob * k * 2) < b * 0.5 * (1 - k) + 0.4) t = Math.max(t, 0.42 - k * 0.15);
    }
    for (const [px, py, r] of sats) if (Math.hypot(dx - px, dy - py) < r) t = Math.max(t, 0.4);
    return t && t + (hash(x, y, seed) - 0.5) * 0.3;
  });
}

// what a wound throws down around itself: a ragged stain, spines running out of it (longer toward +x, the way the
// blow went) each ending in a drop, and satellite droplets thinning out with distance
function splat(r, seed) {
  const rnd = seeded(seed), edge = lobes(rnd, 0.55, 5), top = depth(r * 0.8);
  const fwd = (a) => 0.55 + 0.9 * Math.max(0, Math.cos(a)) ** 2;
  const rays = [];
  for (let i = 0, n = 5 + Math.floor(rnd() * 5); i < n; i++) {
    const a = rnd() * TAU;
    rays.push({ c: Math.cos(a), s: Math.sin(a), len: r * (1.1 + 1.3 * rnd()) * fwd(a), w: Math.max(0.7, r * 0.2 * (0.5 + rnd())), drop: rnd() < 0.6 ? 0.7 + rnd() * 0.9 : 0 });
  }
  const sats = [];
  for (let i = 0, n = 5 + Math.floor(r * 1.4); i < n; i++) {
    const a = rnd() * TAU, d = r * (1.15 + 1.9 * rnd() ** 1.6) * fwd(a);
    sats.push([Math.cos(a) * d, Math.sin(a) * d, rnd() < 0.7 ? 0.6 : 1.15]);
  }
  const n = Math.ceil(r * 3.4) + 3;
  return build(n * 2, n * 2, n, n, (dx, dy, x, y) => {
    let t = 0;
    const dist = Math.hypot(dx, dy), d = dist / (r * 0.85 * edge(Math.atan2(dy, dx)));
    if (d < 1) t = 0.14 + (1 - d) ** 0.6 * (top - 0.14);
    for (const q of rays) {
      const u = dx * q.c + dy * q.s, v = Math.abs(dy * q.c - dx * q.s);
      if (u > r * 0.4 && u < q.len && v < q.w * (1 - (u - r * 0.4) / (q.len - r * 0.4)) ** 1.3 + 0.35) t = Math.max(t, 0.5 - (0.2 * u) / q.len);
      if (q.drop && Math.hypot(u - q.len, v) < q.drop) t = Math.max(t, 0.5);
    }
    for (const [px, py, sr] of sats) if (Math.hypot(dx - px, dy - py) < sr) t = Math.max(t, 0.38);
    return t && t + (hash(x, y, seed) - 0.5) * 0.3;
  });
}

// the stamp sets: [size, variants[]] per size class, built once (a few thousand pixels in all)
const SPOT_R = [1.3, 1.8, 2.3, 2.8, 3.4, 4.2, 5.2];
const STREAK_W = [1.6, 2.2, 3, 4], STREAK_LEN = [1.7, 2.4, 3.3, 4.4]; // lengths in widths
const SPLAT_R = [2.5, 3.5, 4.5, 5.5, 7, 9, 11, 14];
let sets = null;

function stamps() {
  if (sets) return sets;
  let seed = 7;
  const make = (fn, n, ...args) => Array.from({ length: n }, () => fn(...args, seed += 101));
  sets = {
    spots: SPOT_R.map((r) => [r, make(spot, 4, r)]),
    streaks: STREAK_W.map((w) => [w, STREAK_LEN.map((k) => [w * k, make(streak, 3, w, w * k)])]),
    splats: SPLAT_R.map((r) => [r, make(splat, 3, r)]),
  };
  return sets;
}

// the entry of a [[size, payload]...] list closest to a size
function nearest(list, v) {
  let best = list[0];
  for (const e of list) if (Math.abs(e[0] - v) < Math.abs(best[0] - v)) best = e;
  return best[1];
}

export const spotStamp = (r) => pick(nearest(stamps().spots, r));
export const streakStamp = (w, len) => pick(nearest(nearest(stamps().streaks, w), len));
export const splatStamp = (r) => pick(nearest(stamps().splats, r));
// builds every stamp now (at level load) instead of in the middle of the first kill
export const warmStamps = stamps;
