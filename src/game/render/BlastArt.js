// Canvas side of a blast: the burn it leaves on the floor and its shock front. Both are ragged and drawn on whole
// pixels: no gradient, no clean circle.
import { rand, chance, TAU } from '../../engine/math.js';

const ARCS = 26; // pieces of a shock front

// A burn of radius ~r, as a canvas to stamp centred on the blast or a burned-out patch of fire: soot thick in the
// middle, thinning in flat steps to a torn, singed (brown) edge, and streaks blown outward past it. One world pixel a
// grain: the steps follow a blotchy noise, not rings, so burns laid side by side along a trail read as one char.
// A small one (a fire's patch) is lighter: they overlap. Built through ImageData (a blast's is ~400 px across).
const STEPS = [0.78, 0.62, 0.48, 0.36, 0.24, 0.14];
const SINGE = [46, 26, 14];
export function scorchArt(r) {
  const half = Math.ceil(r * 2.2), size = half * 2, c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d'), img = g.createImageData(size, size), px = img.data;
  // the outline: a few waves of random phase around the circle
  const waves = [1, 2, 3, 5].map((n) => [n, rand(0, TAU), rand(0.05, 0.13)]);
  const edge = (a) => { let k = 0.8; for (const [n, ph, amp] of waves) k += Math.sin(a * n + ph) * amp; return r * k; };
  // blotches: value noise on a coarse grid (cell ~ r / 3, at least 3 px), smoothly read between its knots
  const cell = Math.max(3, r / 3), gw = Math.ceil(size / cell) + 2, knots = Float32Array.from({ length: gw * gw }, () => Math.random());
  const noise = (x, y) => {
    const u = x / cell, v = y / cell, i = Math.floor(u), j = Math.floor(v), fu = u - i, fv = v - j;
    const k = (a, b) => knots[b * gw + a], su = fu * fu * (3 - 2 * fu), sv = fv * fv * (3 - 2 * fv);
    return (k(i, j) * (1 - su) + k(i + 1, j) * su) * (1 - sv) + (k(i, j + 1) * (1 - su) + k(i + 1, j + 1) * su) * sv;
  };
  const light = r < 24 ? 0.7 : 1; // a fire's patches overlap along their trail: each one lighter
  const put = (x, y, a, singe) => {
    const o = (y * size + x) * 4, rgb = singe ? SINGE : [12, 7, 7];
    if (a * 255 <= px[o + 3]) return;
    px[o] = rgb[0]; px[o + 1] = rgb[1]; px[o + 2] = rgb[2]; px[o + 3] = Math.round(a * 255);
  };
  const reach = Math.ceil(r * 1.4);
  for (let y = -reach; y < reach; y++) {
    for (let x = -reach; x < reach; x++) {
      const d = Math.hypot(x + 0.5, y + 0.5) / edge(Math.atan2(y, x)) + (noise(x + half, y + half) - 0.5) * 0.36;
      if (d >= 1 || (d > 0.82 && chance(0.25))) continue;
      const step = Math.min(STEPS.length - 1, Math.floor(d * STEPS.length));
      put(half + x, half + y, STEPS[step] * light, d > 0.8);
    }
  }
  // streaks blown outward past the edge, a pixel wide, fading
  for (let i = 0, n = 10 + Math.round(r / 8); i < n; i++) {
    const a = rand(0, TAU), e = edge(a), from = e * 0.8, len = e * rand(0.3, 0.9), ca = Math.cos(a), sa = Math.sin(a);
    for (let d = 0; d < len; d++) {
      if (chance(0.2)) continue;
      const x = Math.round(half + ca * (from + d)), y = Math.round(half + sa * (from + d));
      if (x >= 0 && y >= 0 && x < size && y < size) put(x, y, 0.45 * (1 - d / len) * light, false);
    }
  }
  g.putImageData(img, 0, 0);
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
