// Draws the street fauna of systems/Critters.js: rats, the cat and pigeons on the ground (and the dead), flies;
// pigeons on the wing with their shadow, over the walls; moths round the lamps. The animals are sprites painted at
// the people's density (tools/generate_assets.py `critters`), a frame for each step of their gaits; the insects are
// specks drawn from the clock.
import { CRITTERS as C } from '../Config.js';
import { sprite, silhouette } from '../../engine/Assets.js';

const TAU = Math.PI * 2;

// a gait: px covered in one cycle, and the frames of the cycle in turn
const GAIT = {
  pigeon: { stride: 4, frames: ['pigeon_walk0', 'pigeon_walk1', 'pigeon_walk2'] },    // one bob of the head a step
  rat: { stride: 14, frames: ['rat_run0', 'rat_run1', 'rat_run2', 'rat_run1'] },        // stretched, bunched
  cat: { stride: 34, frames: ['cat_run0', 'cat_run1', 'cat_run2', 'cat_run1'] },
  prowl: { stride: 22, frames: ['cat_walk0', 'cat_walk1', 'cat_walk2', 'cat_walk3'] },
};

// the frame of a gait after `dist` px, each animal starting at its own point of the cycle (its phase `ph`)
function gait(g, dist, ph) {
  const k = (dist / g.stride + ph / TAU) % 1;
  return g.frames[Math.floor(k * g.frames.length) % g.frames.length];
}

// the sprite (critters/<name>) a critter shows at time t, from its state and the ground it covers at its pace
export function critterFrame(c, t) {
  if (c.state === 'dead') return c.kind + '_dead';
  if (c.kind === 'pigeon') {
    if (c.state === 'fly') {
      const f = Math.sin(t * 24 + c.ph); // wings up, level, down, level
      return 'pigeon_fly' + (f > 0.4 ? 0 : f < -0.4 ? 2 : 1);
    }
    if (c.walking) return gait(GAIT.pigeon, C.pigeon.walk * t, c.ph);
    return Math.sin(t * 3 + c.ph) > 0.7 ? 'pigeon_peck' : 'pigeon_idle'; // standing, it pecks now and then
  }
  if (c.kind === 'rat') return c.state === 'run' ? gait(GAIT.rat, c.speed * t, c.ph) : 'rat_idle';
  if (c.state === 'run') return c.low ? 'cat_low' : gait(GAIT.cat, C.cat.speed * t, c.ph);
  return c.walking ? gait(GAIT.prowl, C.cat.prowl * t, c.ph) : 'cat_sit';
}

// a sprite centred on (x, y), turned by a, scaled sx along its length and sy across (a finer sprite honours img.k)
function put(ctx, img, x, y, a, sx = 1, sy = 1, alpha = 1) {
  const k = img.k || 1;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(a);
  ctx.scale(sx * k, sy * k);
  if (alpha !== 1) ctx.globalAlpha *= alpha;
  ctx.drawImage(img, -img.width / 2, -img.height / 2);
  ctx.restore();
}

const half = (v) => Math.round(v * 2) / 2; // on the sprites' own pixel grid

// on the ground, over the furniture (the cat sits on things, rats come out from under them)
export function drawCritters(ctx, critters, t, vis) {
  for (const c of critters.list) {
    if (c.state === 'hide') { if (vis(c.x, c.y)) glints(ctx, c, t); continue; }
    if (c.state === 'fly' || c.wait > 0 && c.kind === 'rat' || !vis(c.x, c.y)) continue;
    const img = sprite('critters/' + critterFrame(c, t)), x = half(c.x), y = half(c.y), sy = c.low ? 0.85 : 1; // ducking under a car
    put(ctx, silhouette(img), x + 1, y + 1, c.a, 1, sy, 0.3); // its shadow, the light from the top left
    put(ctx, img, x, y, c.a, 1, sy);
  }
  ctx.fillStyle = '#0c0c0c';
  ctx.globalAlpha = 0.9;
  for (const s of critters.swarms()) {
    if (!vis(s.x, s.y)) continue;
    for (let i = 0; i < s.n; i++) {
      const ph = s.seed + i * 2.4;
      const x = s.x + Math.cos(t * (2.1 + i * 0.37) + ph) * s.r * (0.5 + (i % 3) * 0.25) + Math.sin(t * 5.3 + ph) * 1.5;
      const y = s.y + Math.sin(t * (2.7 + i * 0.29) + ph * 1.3) * s.r * (0.45 + (i % 2) * 0.4) + Math.cos(t * 6.1 + ph) * 1.5;
      ctx.fillRect(Math.round(x), Math.round(y), 1, 1);
    }
  }
  ctx.globalAlpha = 1;
}

// the hidden cat: two pale green glints at the edge of the car's side it went in by, looking out, blinking slowly
// (the cars are drawn before the critters, so they are not covered)
function glints(ctx, c, t) {
  if ((t + c.ph * 3) % 4.5 < 0.2) return;
  ctx.fillStyle = '#b6f0a8';
  for (const k of [-1.5, 1.5]) ctx.fillRect(Math.round(c.x + c.nx * 1.5 - c.ny * k) - 1, Math.round(c.y + c.ny * 1.5 + c.nx * k) - 1, 2, 2);
}

// pigeons in the air: bigger as they climb, wings beating, their shadow left on the ground
export function drawFlying(ctx, critters, t) {
  for (const c of critters.list) {
    if (c.state !== 'fly') continue;
    const img = sprite('critters/' + critterFrame(c, t)), s = 1 + c.z * 0.6;
    put(ctx, silhouette(img), half(c.x + c.z * 9), half(c.y + c.z * 16), c.a, 0.9, 0.9, 0.25);
    put(ctx, img, half(c.x), half(c.y), c.a, s, s);
  }
}

const MOTH = '#e6dcc2', MOTH_LIT = '#fbf6e6', MOTH_BODY = '#6a5c48', INK = '#14151c';

// moths round the lamps still lit, drawn over the night: spiralling in and out, darting off now and then, knocking
// into the bulb; pale wings beating, a glint as they cross the light, a speck of shadow cast away from the lamp.
// All from the clock (no state), at half a world px; round a hung lamp, up where it is drawn (its parallax).
export function drawMoths(ctx, critters, t, vis, cam) {
  for (const s of critters.lamps()) {
    if (!vis(s.x, s.y)) continue;
    const lx = s.x + (s.x - cam.x) * s.lift, ly = s.y + (s.y - cam.y) * s.lift;
    for (let i = 0; i < s.n; i++) {
      const ph = s.seed + i * 2.1, dir = i % 2 ? 1 : -1;
      const dart = Math.max(0, Math.sin(t * 0.7 + ph * 1.7)) ** 12;           // a rare dash outward
      const r = s.r * (0.1 + 0.9 * (0.5 + 0.5 * Math.sin(t * (1.3 + i * 0.4) + ph))) + dart * s.r * 0.8;
      const a = t * (2.2 + i * 0.7) * dir + ph + Math.sin(t * 9 + ph) * 0.6 + dart * 3;
      const knock = r < 2.5 ? Math.sin(t * 57 + ph) * 1.2 : 0;                  // bumping into the bulb
      const dx = Math.cos(a) * (r + knock) + Math.sin(t * 17 + ph) * 0.6, dy = Math.sin(a) * (r + knock) * 0.8 + Math.cos(t * 13 + ph) * 0.6;
      const x = lx + dx, y = ly + dy;
      if (r > 2.5) { // its shadow on the floor, cast away from the bulb
        ctx.globalAlpha = 0.25;
        ctx.fillStyle = '#000';
        ctx.fillRect(half(s.x + dx * 1.6), half(s.y + dy * 1.6), 1, 0.5);
      }
      // the wings across its way (going round the lamp along x, they stand along y): open, half, then shut, folded
      // back along its way
      const beat = Math.sin(t * 43 + ph * 3), shut = beat < -0.3, w = beat > 0.3 ? 3 : 2;
      const along = (Math.abs(Math.sin(a)) > Math.abs(Math.cos(a))) !== shut;
      const rw = along ? 1 : w, rh = along ? w : 1, x0 = half(x - rw / 2), y0 = half(y - rh / 2);
      ctx.globalAlpha = 0.6;
      ctx.fillStyle = INK;
      ctx.fillRect(x0 - 0.5, y0 - 0.5, rw + 1, rh + 1); // a dark edge: it reads by a bright bulb, on a pale floor
      ctx.globalAlpha = 0.9 + 0.1 * Math.sin(t * 31 + ph);
      ctx.fillStyle = r < 4 ? MOTH_LIT : MOTH;
      ctx.fillRect(x0, y0, rw, rh);
      if (!shut) { ctx.fillStyle = MOTH_BODY; ctx.fillRect(half(x - 0.25), half(y - 0.25), 0.5, 0.5); }
      if (r < 3) { ctx.fillStyle = '#ffffff'; ctx.fillRect(x0, y0, 0.5, 0.5); } // a glint as it crosses the bulb
    }
  }
  ctx.globalAlpha = 1;
}
