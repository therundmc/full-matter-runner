// The billows of a car in trouble (systems/CarFx.js `puffs`, CARFX.puffs): the steam, the grey and the black of a
// damaged engine, the white of tyres letting go. Drawn after the lighting, like the chase's wind: on a road at night
// the air's own smoke (render/SmokeArt.js) shows only where a lamp lights it, and a plume must read at once.
// Pixel art, and smoke: each billow is a small round cloud rasterized at the world's pixel grain (as BlastArt's burn
// is: a wavy outline, a blotchy noise, through ImageData), in three flat shades (its rim lit on the side the light
// comes from, its body, its shaded underside), its heart opaque and its edge one thinner step. It never fades: as it
// ages it swells and is EATEN AWAY, stage by stage (its edge torn further in, holes opening in it), down to wisps.
// Billows of a kind laid over each other merge into one mass. The shapes are built once each (a few per kind, size
// and age: `cloud`), never per frame, from their own numbers (nothing is drawn from the game's random stream).
import { CARFX } from '../data/carfx.js';
import { shown } from '../fx/Particles.js';

const SIZES = [3, 4, 5, 6, 8, 10, 12, 14, 17, 20, 24, 28, 33, 39, 46]; // px across: the sizes a cloud is kept at
const VARIANTS = 3;
const TAU = Math.PI * 2;
const made = new Map();

const rgb = (hex) => [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];

// one cloud: `size` px across, of `tone`, shape `variant`, at age stage k of U.steps (0: whole)
function cloud(tone, size, variant, k, U = CARFX.puffs) {
  const key = `${tone}|${size}|${variant}|${k}`;
  let c = made.get(key);
  if (c) return c;
  const T = U.tones[tone], A = U.art, cols = T.colors.map(rgb);
  // (its own numbers: the same shape whatever its stage, so a billow ages in place instead of jumping)
  let seed = (size * 7919 + variant * 104729 + tone.length * 31337) >>> 0;
  const rnd = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
  c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d'), img = g.createImageData(size, size), px = img.data, r = size / 2;
  // the outline: lobes, a few waves round the circle; the blotches: value noise on a coarse grid
  const waves = [2, 3, 5].map((n) => [n, rnd() * TAU, 0.06 + rnd() * 0.09]);
  const edge = (a) => { let e = 0.86; for (const [n, ph, amp] of waves) e += Math.sin(a * n + ph) * amp; return e; };
  const cell = Math.max(2, size / 4), gw = Math.ceil(size / cell) + 2, knots = Float32Array.from({ length: gw * gw }, rnd);
  const noise = (x, y) => {
    const u = x / cell, v = y / cell, i = Math.floor(u), j = Math.floor(v), fu = u - i, fv = v - j;
    const at = (a, b) => knots[b * gw + a], su = fu * fu * (3 - 2 * fu), sv = fv * fv * (3 - 2 * fv);
    return (at(i, j) * (1 - su) + at(i + 1, j) * su) * (1 - sv) + (at(i, j + 1) * (1 - su) + at(i + 1, j + 1) * su) * sv;
  };
  const eaten = A.eaten[Math.min(k, A.eaten.length - 1)], holes = A.holes[Math.min(k, A.holes.length - 1)];
  const lx = A.light[0], ly = A.light[1];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = x + 0.5 - r, dy = y + 0.5 - r, n = noise(x, y), far = Math.hypot(dx, dy) / r;
      const d = far / edge(Math.atan2(dy, dx)) + (n - 0.5) * A.rag + eaten;
      if (d >= 1 || n > holes) continue;
      // lit where its surface faces the light, shaded on the far side, the rest its body (flat: no in-between)
      const face = (dx * lx + dy * ly) / r + (n - 0.5) * 0.5;
      const col = cols[size < 5 ? 1 : face > A.lit && far > 0.3 ? 0 : face < -A.shade ? 2 : 1];
      const o = (y * size + x) * 4;
      px[o] = col[0]; px[o + 1] = col[1]; px[o + 2] = col[2];
      px[o + 3] = d > 1 - A.rim && size >= 5 ? Math.round(255 * A.thin) : 255; // its edge: one thinner step
    }
  }
  g.putImageData(img, 0, 0);
  made.set(key, c);
  return c;
}

// the size a cloud is kept at nearest to s px
function sizeOf(s) {
  let best = SIZES[0];
  for (const q of SIZES) if (Math.abs(q - s) < Math.abs(best - s)) best = q;
  return best;
}

export function drawCarSmoke(ctx, w) {
  const L = w.carFx?.puffs;
  if (!L?.length) return;
  const U = CARFX.puffs, R = shown(ctx), x0 = R[0], y0 = R[1], x1 = R[2], y1 = R[3], was = ctx.imageSmoothingEnabled;
  ctx.imageSmoothingEnabled = false;
  for (const p of L) {
    const u = p.t / p.life, s = sizeOf(p.s * U.art.size * (1 + (U.grow - 1) * Math.sqrt(u))), h = s / 2;
    if (p.x + h < x0 || p.x - h > x1 || p.y + h < y0 || p.y - h > y1) continue;
    ctx.globalAlpha = U.tones[p.tone].alpha;
    ctx.drawImage(cloud(p.tone, s, p.c % VARIANTS, Math.min(U.steps - 1, Math.floor(u * U.steps)), U), Math.round(p.x - h), Math.round(p.y - h));
  }
  ctx.globalAlpha = 1;
  ctx.imageSmoothingEnabled = was;
}
