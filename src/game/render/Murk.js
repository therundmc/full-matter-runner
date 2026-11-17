// What thick smoke does to what the player sees (SMOKE.murk in data/atmosphere.js; how thick it is about him:
// systems/Smoke.js murk()): the view closes in round him, in flat rings of soot (no blur), the further the darker.
// murkView is the arithmetic (DOM-free, tested); drawMurk paints it over the scene, before the lens.
import { SMOKE } from '../data/atmosphere.js';

// k: 0 clear .. 1 choked. Returns the rings, from the nearest: [{ r: radius it starts at, in picture heights,
// a: its opacity }], [] when clear; `clear`: the radius still seen plainly (picture heights)
export function murkView(k, cfg = SMOKE.murk) {
  const m = Math.max(0, Math.min(1, k));
  if (m <= 0.001) return { clear: Infinity, rings: [] };
  const near = cfg.far + (cfg.near - cfg.far) * m, n = cfg.steps, rings = [];
  for (let i = 0; i < n; i++) rings.push({ r: near + (cfg.width * i) / n, a: (cfg.max * m * (i + 1)) / n });
  return { clear: near, rings };
}

// over the scene, round (cx, cy) picture px; H: the picture's height
export function drawMurk(ctx, W, H, cx, cy, k, cfg = SMOKE.murk) {
  const { rings } = murkView(k, cfg);
  if (!rings.length) return;
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = cfg.color;
  let before = 0;
  for (const ring of rings) {
    // each ring adds what it takes to reach its own opacity over the ones before it
    ctx.globalAlpha = (ring.a - before) / (1 - before);
    before = ring.a;
    ctx.beginPath();
    ctx.rect(0, 0, W, H);
    ctx.arc(cx, cy, ring.r * H, 0, Math.PI * 2, true);
    ctx.fill('evenodd');
  }
  ctx.restore();
}
