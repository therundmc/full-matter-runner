// How a body bleeds once it is down (shared by Corpse and Ragdoll; no DOM): the jets of a severed neck or an
// opened artery, pumped beat by beat, the pool seeping under it once it lies still, the trail it wipes while it slides.
import { rand } from '../../engine/math.js';

// sets the bleeding state of a body from its wound (opts: headless, pool, poolRate, spurt; see data/wounds.js)
export function startBleeding(c, opts) {
  c.headless = !!opts.headless;
  c.fountain = c.headless ? rand(1.4, 2.4) : 0; // seconds the neck keeps pumping
  c.pool = 0;                                   // radius of the pool it lies in (px)
  c.poolMax = opts.pool ?? rand(11, 17);
  c.poolRate = (opts.poolRate ?? 4) * (c.headless ? 1.75 : 1); // px/s
  c.poolPos = null;                             // where that pool stands: it does not follow the body
  c.spurt = c.spurt0 = opts.spurt || 0;         // seconds an opened artery keeps pumping
  c.spurtA = rand(0, Math.PI * 2);
  c.dry = !!opts.dry;                           // no open wound: wipes nothing while it slides (until it is shot)
}

// a jet driven by the heart: nothing between two beats, then a squirt that swells and dies, so every beat lays a
// line of drops from near to far; the aim wanders slowly, so the lines fan out into arcs
function jet(c, x, y, angle, rate, power) {
  const beat = Math.sin(c.age * rate);
  if (beat < 0.15) return;
  const a = angle + Math.sin(c.age * 1.7 + c.spurtA) * 0.3;
  c.world.particles.blood(x, y, a, 0.04, beat > 0.7 ? 2 : 1, (45 + 190 * beat) * power, { z: 3, jet: true });
}

// One step of bleeding out. neck / wound: { x, y, angle } where the neck stump and the opened artery are and point;
// src: the point blood seeps from; still: whether that point is at rest.
export function bleedOut(c, dt, neck, wound, src, still) {
  if (c.fountain > 0) {
    c.fountain -= dt;
    jet(c, neck.x, neck.y, neck.angle, 14, 0.55 + 0.45 * Math.min(1, c.fountain));
  }
  if (c.spurt > 0) {
    c.spurt -= dt;
    jet(c, wound.x, wound.y, wound.angle + c.spurtA, 9, 0.3 + (0.7 * c.spurt) / c.spurt0);
  }
  if (c.age < 0.3) return;
  if (c.poolPos && Math.hypot(src.x - c.poolPos.x, src.y - c.poolPos.y) > c.pool * 0.7 + 8) {
    // shoved out of its pool: what had run out stays behind, the rest starts another, smaller one
    c.world.decals.bakePool(c, c.poolPos.x, c.poolPos.y, c.pool);
    c.poolMax = Math.max(3, c.poolMax - c.pool * 0.5);
    c.pool = 0;
    c.poolPos = null;
  }
  if (!c.poolPos && still) c.poolPos = { x: src.x, y: src.y };
  if (c.poolPos && c.pool < c.poolMax) c.pool += dt * c.poolRate;
}

// something bleeding that slides on the floor wipes thin streaks (w px wide) behind it; o keeps its last wiped point
export function wipe(world, o, x, y, w) {
  const d = o.wx === undefined ? Infinity : Math.hypot(x - o.wx, y - o.wy);
  if (d < 2) return;
  if (d < 30) world.decals.drag(o.wx, o.wy, x, y, w);
  o.wx = x; o.wy = y;
}
