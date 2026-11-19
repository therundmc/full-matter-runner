// The billows of a car in trouble (systems/CarFx.js `puffs`, CARFX.puffs): the steam, the grey and the black of a
// damaged engine, the white of tyres letting go. Drawn after the lighting, like the chase's wind: on a road at night
// the air's own smoke (render/SmokeArt.js) shows only where a lamp lights it, and a plume must read at once. Pixel
// art: flat squares on the world's px in a few tones, their lit corner a tone lighter, thinning in flat steps.
import { CARFX } from '../data/carfx.js';
import { shown } from '../fx/Particles.js';

export function drawCarSmoke(ctx, w) {
  const L = w.carFx?.puffs;
  if (!L?.length) return;
  const U = CARFX.puffs, R = shown(ctx), x0 = R[0], y0 = R[1], x1 = R[2], y1 = R[3];
  for (const p of L) {
    const u = p.t / p.life, s = Math.max(1, Math.round(p.s * (1 + (U.grow - 1) * Math.sqrt(u)))), h = s / 2;
    if (p.x + h < x0 || p.x - h > x1 || p.y + h < y0 || p.y - h > y1) continue;
    const T = U.tones[p.tone], x = Math.round(p.x - h), y = Math.round(p.y - h);
    // (thinning in steps, never a fade: the last step is the thinnest band, then nothing)
    ctx.globalAlpha = (T.alpha * Math.ceil((1 - u) * U.steps)) / U.steps;
    ctx.fillStyle = T.colors[Math.min(2, p.c + 1)];
    ctx.fillRect(x, y, s, s);
    if (s >= 5) {
      const q = s >> 1;
      ctx.fillStyle = T.colors[p.c];
      ctx.fillRect(x + 1, y + 1, q, q);
    }
  }
  ctx.globalAlpha = 1;
}
