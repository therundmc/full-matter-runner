// The night around the player, heard: the city's far-off wash (lower from indoors), the gusts of wind that blow the
// papers about (systems/Papers.js 'gust'), the hum of neon tubes, fridges and the fuse box close by (props with
// `hum`, silent once broken or without power), water dripping off a leaking pipe (props with `drip`), the murmur of
// a room of customers while nothing has scared them. All synthesized (audio/Audio.js: air, gust, hum, drip, walla)
// and all quiet: a bed under the game, never an event.
// DOM-free: one-shot sounds repeated from here, as systems/Sirens.js does; each long one overlaps the next.
import { AMBIENCE } from '../Config.js';
import { rand } from '../../engine/math.js';
import { WALKER } from '../ai/Civilians.js';

export default class Ambience {
  constructor(world, cfg = AMBIENCE) {
    this.world = world;
    this.cfg = cfg;
    this.inside = 0; // 0 out of doors .. 1 under a roof, eased
    this.next = { air: 0, hum: 0, drip: rand(...cfg.drip.every), walla: 0 }; // s to the next of each
    world.events.on('gust', (g) => world.sound('gust', undefined, undefined, cfg.gust * (1 - cfg.muffled * this.inside), { pan: g.dx }));
  }

  update(dt) {
    const w = this.world, c = this.cfg, p = w.player, T = this.next;
    if (!p) return;
    const under = c.indoors.includes(w.floorAt(p.x, p.y)) ? 1 : 0;
    this.inside += (under - this.inside) * Math.min(1, dt * c.ease);
    if ((T.air -= dt) <= 0) { T.air = c.air; w.sound('air', undefined, undefined, 1, { inside: this.inside }); }
    if ((T.hum -= dt) <= 0) { T.hum = c.hum.every; this.hums(p); }
    if ((T.drip -= dt) <= 0) { T.drip = rand(...c.drip.every); this.drip(p); }
    if ((T.walla -= dt) <= 0) { T.walla = c.walla.every; this.walla(); }
  }

  // the nearest few things that hum
  hums(p) {
    const c = this.cfg.hum, near = [];
    for (const q of this.world.props) {
      if (!q.def.hum || q.dead || q.lightsOut || q.unpowered !== undefined) continue;
      const d = Math.hypot(q.x - p.x, q.y - p.y);
      if (d < c.reach) near.push({ q, d });
    }
    near.sort((a, b) => a.d - b.d);
    for (const { q } of near.slice(0, c.max)) this.world.sound('hum', q.x, q.y, 1, { kind: q.def.hum });
  }

  // a drop off the nearest thing that leaks, somewhere along it
  drip(p) {
    const c = this.cfg.drip;
    let best = null, bd = c.reach;
    for (const q of this.world.props) {
      if (!q.def.drip || q.dead) continue;
      const d = Math.hypot(q.x - p.x, q.y - p.y);
      if (d < bd) { bd = d; best = q; }
    }
    if (best) this.world.sound('drip', best.x + rand(-c.spread, c.spread), best.y + rand(-c.spread, c.spread), rand(0.6, 1));
  }

  // customers at their tables, still at ease: their talk, from where they sit, louder the more of them
  walla() {
    const c = this.cfg.walla;
    let n = 0, sx = 0, sy = 0;
    for (const civ of this.world.civilians) {
      if (!civ.alive || !civ.post || civ.asleep || civ.brain?.state !== WALKER.STOP) continue;
      n++; sx += civ.x; sy += civ.y;
    }
    if (n >= c.min) this.world.sound('walla', sx / n, sy / n, Math.min(1, n / c.full), { n });
  }
}
