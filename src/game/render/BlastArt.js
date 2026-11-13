// Canvas side of a blast: the burn it leaves on the floor and its shock front. Both are ragged and drawn on whole
// pixels: no gradient, no clean circle.
import { rand, chance, TAU } from '../../engine/math.js';

const SOOT = 'rgb(12,7,7)';
const ARCS = 26; // pieces of a shock front

// A burn of radius ~r, as a canvas to stamp centred on the blast: soot thick in the middle, thinning in flat steps
// to a torn edge, and streaks blown outward past it.
export function scorchArt(r) {
  const half = Math.ceil(r * 2.2), c = document.createElement('canvas');
  c.width = c.height = half * 2;
  const g = c.getContext('2d');
  // the outline: a few waves of random phase around the circle
  const waves = [1, 2, 3, 5].map((n) => [n, rand(0, TAU), rand(0.05, 0.13)]);
  const edge = (a) => { let k = 0.8; for (const [n, ph, amp] of waves) k += Math.sin(a * n + ph) * amp; return r * k; };
  g.fillStyle = SOOT;
  const reach = Math.ceil(r * 0.7) * 2;
  for (let py = -reach; py < reach; py += 2) {
    for (let px = -reach; px < reach; px += 2) {
      const d = Math.hypot(px + 1, py + 1) / edge(Math.atan2(py, px)) + rand(-0.07, 0.07);
      if (d >= 1 || (d > 0.72 && chance(0.14))) continue;
      g.globalAlpha = d < 0.4 ? 0.85 : d < 0.72 ? 0.6 : 0.34;
      g.fillRect(half + px, half + py, 2, 2);
    }
  }
  for (let i = 0, n = 10 + Math.round(r / 8); i < n; i++) {
    const a = rand(0, TAU), e = edge(a), from = e * 0.8, len = e * rand(0.3, 0.9), ca = Math.cos(a), sa = Math.sin(a);
    for (let d = 0; d < len; d++) {
      if (chance(0.2)) continue;
      g.globalAlpha = 0.55 * (1 - d / len);
      g.fillRect(Math.round(half + ca * (from + d)), Math.round(half + sa * (from + d)), d < len * 0.4 ? 2 : 1, 1);
    }
  }
  return c;
}

// The shock front of a blast (ring: { x, y, r, max }, p = 0..1 of its life): torn pieces of arc at uneven radii,
// some missing, stepped in pixels. To draw in the additive pass.
export function drawShock(ctx, ring, p) {
  ring.arcs ||= Array.from({ length: ARCS }, () => [Math.random(), Math.random()]);
  const rad = ring.r + (ring.max - ring.r) * Math.sqrt(p);
  ctx.fillStyle = '#ffe6c4';
  for (let i = 0; i < ARCS; i++) {
    const [h, k] = ring.arcs[i];
    if (h < 0.22) continue;
    const rr = rad * (0.74 + 0.32 * h), w = Math.max(1, Math.round((1.5 + k * 2.5) * (1 - p)));
    const a0 = ((i + k * 0.5) / ARCS) * TAU, a1 = a0 + ((0.3 + 0.6 * h) * TAU) / ARCS, da = w / rr;
    ctx.globalAlpha = (1 - p) * (0.3 + 0.7 * k);
    for (let a = a0; a < a1; a += da) ctx.fillRect(Math.round(ring.x + Math.cos(a) * rr), Math.round(ring.y + Math.sin(a) * rr), w, w);
  }
  ctx.globalAlpha = 1;
}
