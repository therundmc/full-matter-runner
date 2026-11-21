export const TAU = Math.PI * 2;
export const rand = (a = 0, b = 1) => a + Math.random() * (b - a);
export const randi = (a, b) => Math.floor(rand(a, b + 1));
export const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
export const chance = (p) => Math.random() < p;
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
// v kept to 0..1 (not a number: 0)
export const clamp01 = (v) => (v > 0 ? (v < 1 ? v : 1) : 0);
export const lerp = (a, b, t) => a + (b - a) * t;
export const frac = (v) => v - Math.floor(v);
// r = [a, b]: the point k of the way from a to b
export const lerpRange = (r, k) => r[0] + (r[1] - r[0]) * k;
// smoothstep of k clamped to 0..1; the smoother quintic (k not clamped)
export const smooth = (k) => { k = clamp(k, 0, 1); return k * k * (3 - 2 * k); };
export const smoother = (t) => t * t * t * (t * (t * 6 - 15) + 10);
// one arch of a sine over k in [a, b], 0 outside
export const bump = (k, a = 0, b = 1) => (k <= a || k >= b ? 0 : Math.sin((Math.PI * (k - a)) / (b - a)));

// 0..1 noise of a number (the sin hash): the same n, the same value
export const hash = (n) => { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };

// 0..1 of a whole-number cell (x, y), well mixed (no visible lattice, unlike a plain x*a ^ y*b); s: another draw
export function cellHash(x, y, s = 0) {
  let h = (x * 374761393 + y * 668265263 + s * 974711) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

// FNV-1a of a string, unsigned 32 bits (a seed from a name)
export function hashString(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619);
  return h >>> 0;
}

// mulberry32: a seeded generator of 0..1 floats
export function seeded(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// '#rrggbb' -> [r, g, b] (0..255)
export const hexRgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));

export function angDiff(a, b) {
  let d = (b - a) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return d;
}

// from angle a toward b by t, the short way round
export const lerpA = (a, b, t) => a + angDiff(a, b) * t;

export function approachAngle(a, target, maxStep) {
  return a + clamp(angDiff(a, target), -maxStep, maxStep);
}

// An angle held on a grid of `step` rad (a pixel-art sprite turned by a new float angle every frame crawls: drawn
// on a few fixed ones it stays still). `was`: the step it was on (null: none yet), kept until a has gone `slack` rad
// past the half way to the next one, so an angle wobbling about a boundary never flickers between two
export function stepAngle(a, was, step, slack = 0) {
  if (was !== null && was !== undefined && Math.abs(angDiff(was, a)) <= step / 2 + slack) return was;
  return Math.round(a / step) * step;
}

// gaussian-ish spread in [-1, 1]
export const spread = () => (Math.random() + Math.random() + Math.random() - 1.5) / 1.5;

// A summed-area table of a w x h grid (set(x, y): is that cell counted), for how many cells of a rectangle are set in
// constant time (areaCount)
export function areaTable(w, h, set) {
  const W = w + 1, s = new Int32Array(W * (h + 1));
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) s[(y + 1) * W + x + 1] = (set(x, y) ? 1 : 0) + s[y * W + x + 1] + s[(y + 1) * W + x] - s[y * W + x];
  }
  return { s, w, h };
}

// the cells set in [c0, c1] x [r0, r1] (inclusive; clamped to the grid)
export function areaCount({ s, w, h }, c0, r0, c1, r1) {
  c0 = Math.max(0, c0); r0 = Math.max(0, r0); c1 = Math.min(w - 1, c1); r1 = Math.min(h - 1, r1);
  if (c1 < c0 || r1 < r0) return 0;
  const W = w + 1;
  return s[(r1 + 1) * W + c1 + 1] - s[r0 * W + c1 + 1] - s[(r1 + 1) * W + c0] + s[r0 * W + c0];
}

// rotate a local offset (lx, ly) by angle and add to (x, y)
export function local(x, y, angle, lx, ly) {
  const c = Math.cos(angle), s = Math.sin(angle);
  return { x: x + lx * c - ly * s, y: y + lx * s + ly * c };
}
