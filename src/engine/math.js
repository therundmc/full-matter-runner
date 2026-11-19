export const TAU = Math.PI * 2;
export const rand = (a = 0, b = 1) => a + Math.random() * (b - a);
export const randi = (a, b) => Math.floor(rand(a, b + 1));
export const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
export const chance = (p) => Math.random() < p;
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const dist = (ax, ay, bx, by) => Math.hypot(bx - ax, by - ay);
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

// rotate a local offset (lx, ly) by angle and add to (x, y)
export function local(x, y, angle, lx, ly) {
  const c = Math.cos(angle), s = Math.sin(angle);
  return { x: x + lx * c - ly * s, y: y + lx * s + ly * c };
}
