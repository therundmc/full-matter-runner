export const TAU = Math.PI * 2;
export const rand = (a = 0, b = 1) => a + Math.random() * (b - a);
export const randi = (a, b) => Math.floor(rand(a, b + 1));
export const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
export const chance = (p) => Math.random() < p;
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const dist = (ax, ay, bx, by) => Math.hypot(bx - ax, by - ay);
export const dist2 = (ax, ay, bx, by) => (bx - ax) * (bx - ax) + (by - ay) * (by - ay);

export function angDiff(a, b) {
  let d = (b - a) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return d;
}

export function approachAngle(a, target, maxStep) {
  return a + clamp(angDiff(a, target), -maxStep, maxStep);
}

// gaussian-ish spread in [-1, 1]
export const spread = () => (Math.random() + Math.random() + Math.random() - 1.5) / 1.5;

// rotate a local offset (lx, ly) by angle and add to (x, y)
export function local(x, y, angle, lx, ly) {
  const c = Math.cos(angle), s = Math.sin(angle);
  return { x: x + lx * c - ly * s, y: y + lx * s + ly * c };
}
