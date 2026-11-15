// Steam in the street (SMOKE.steam), put into the air of systems/Smoke.js as its own kind: white, condensing away in
// a few seconds, carried by the wind and its gusts, dragged along by the cars going by. Manhole covers (level
// `street.manholes`: [[col, row]]) breathe it in slow breaths and never quite stop seeping between two; a wall vent
// (prop `steam: 'vent'`) blows a thin stream of it along its +y while it lives; a steam pipe (prop `steam: 'leak'`)
// that takes a round whistles a white jet out of the hole for a few seconds (SMOKE.jets.leak, a few holes a pipe
// at most). The rain thickens it (`wet`: the cold drops on a warm cover). DOM-free.
import { TILE } from '../Config.js';
import { SMOKE } from '../data/atmosphere.js';
import { rand } from '../../engine/math.js';

const PIERCING = new Set(['bullet', 'rifle', 'pellet', 'shrapnel']);

export default class Steam {
  constructor(world, manholes = [], cfg = SMOKE, rain = 0) {
    this.world = world;
    this.cfg = cfg.steam;
    this.holesMax = cfg.jets.leak.max;
    this.thick = 1 + rain * this.cfg.wet;
    // t: s to the next breath, left: s of the breath going on
    this.holes = manholes.map(([c, r]) => ({ x: c * TILE, y: r * TILE, t: rand(0, this.cfg.manhole.rest[1]), left: 0 }));
    this.vents = null; // their props, looked up at the first step (props are built after the systems)
    world.events.on('propHit', ({ prop, x, y, kind }) => {
      if (prop.def.steam === 'leak' && PIERCING.has(kind)) this.leak(prop, x, y);
    });
  }

  // a hole in a pipe at (x, y): the jet goes out of the wall the pipe runs along (its local +y)
  leak(prop, x, y) {
    if ((prop.pierced || 0) >= this.holesMax) return;
    prop.pierced = (prop.pierced || 0) + 1;
    this.world.smoke?.jet('leak', x, y, prop.body.angle + Math.PI / 2);
  }

  update(dt) {
    const w = this.world, air = w.smoke, c = this.cfg;
    if (!air) return;
    this.vents ||= w.props.filter((p) => p.def.steam === 'vent');
    const m = c.manhole, k = this.thick;
    for (const h of this.holes) {
      if ((h.t -= dt) <= 0) { h.left = m.breath; h.t = m.breath + rand(...m.rest); }
      h.left -= dt;
      const on = h.left > 0; // a breath, or the seep between two
      air.emit('steam', h.x, h.y, m.rate * k * (on ? 1 : m.seep), dt, m.r * (on ? Math.sqrt(k) : 0.6), 2, on ? m.swell : 0);
    }
    const v = c.vent;
    for (const p of this.vents) {
      if (p.dead) continue;
      const a = p.body.angle + Math.PI / 2, dx = Math.cos(a), dy = Math.sin(a);
      air.emit('steam', p.x + dx * 4, p.y + dy * 4, v.rate * k, dt, v.r);
      air.blow(p.x + dx * v.reach * 0.5, p.y + dy * v.reach * 0.5, v.reach * 0.5, dx * v.speed, dy * v.speed, v.k);
    }
  }
}
