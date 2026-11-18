// Fires: what is seen and heard of something burning at a spot: flames, embers, a flickering light, the crackle, a
// roar when a lot of it burns, the black smoke (the air's: systems/Smoke.js burns every fire lit(), each at its
// `soot`), the air shimmering over it (Game.lensView reads near()). Where it burns is systems/FireSpread.js: it lights
// a fire a block of burning floor (add) and puts it out when the block has burned (remove). A level may also name
// fires burning from the start (`fires`: [col, row]). Water puts them out (douse: the sprinklers).
// Bounded: the puffs of flame are shared out between the fires in view (FIRE.budget a second), the flashes of light
// go to the few nearest the player.
// DOM-free: particles, smoke, lights and sounds asked of the world.
import { TILE } from '../Config.js';
import { FIRE } from '../data/fire.js';
import { rand, chance } from '../../engine/math.js';

export default class Fires {
  constructor(world, list = [], cfg = FIRE) {
    this.world = world;
    this.cfg = cfg;
    this.fires = [];
    this.crackle = 0;
    this.roar = 0;
    this.lightT = 0;
    for (const [col, row] of list) this.add(col * TILE, row * TILE);
  }

  // a fire at (x, y), `k` its size (1: a block of floor; more: a piece of furniture); whoosh: it is heard catching
  add(x, y, k = 1, whoosh = false) {
    const c = this.cfg, f = { x, y, k, whoosh, t: rand(0, Math.max(c.flames, this.fires.length / c.budget)), age: 0, soot: c.soot * k };
    this.fires.push(f);
    return f;
  }

  remove(f) {
    const i = this.fires.indexOf(f);
    if (i >= 0) this.fires.splice(i, 1);
  }

  // water on them (systems/Sprinklers.js): the fires burning where `where(x, y)` holds go out in a hiss of steam
  douse(where) {
    const w = this.world, out = this.fires.filter((f) => where(f.x, f.y));
    if (!out.length) return;
    for (const f of out.slice(0, 8)) {
      w.smoke?.burst('douse', f.x, f.y);
      w.sound('hiss', f.x, f.y, 0.5, { pitch: 0.6 });
    }
    this.fires = this.fires.filter((f) => !out.includes(f));
    w.fireSpread?.quench(where);
  }

  // the fires burning now
  lit() { return this.fires; }

  // the n of them nearest (x, y), nearest first (equals in the order they burn in): picked in one pass, every frame
  // (Game.lensView), without sorting them all
  near(x, y, n) {
    if (this.fires.length <= n) return this.fires;
    if (n <= 0) return [];
    const best = [], dist = [];
    for (const f of this.fires) {
      const d = Math.hypot(f.x - x, f.y - y);
      if (best.length === n && d >= dist[n - 1]) continue;
      let i = Math.min(best.length, n - 1);
      for (; i > 0 && dist[i - 1] > d; i--) { best[i] = best[i - 1]; dist[i] = dist[i - 1]; }
      best[i] = f; dist[i] = d;
    }
    return best;
  }

  update(dt) {
    const w = this.world, c = this.cfg, list = this.fires;
    if (!list.length) return;
    // only what is in view (and a little past it) is drawn burning
    const v = w.camera ? w.view() : null, m = 48;
    const seen = v ? list.filter((f) => Math.abs(f.x - v.x) < v.hw + m && Math.abs(f.y - v.y) < v.hh + m) : list;
    // the budget of flames, shared out
    const every = Math.max(c.flames, seen.length / c.budget);
    for (const f of list) f.age += dt;
    for (const f of seen) {
      if (f.whoosh) {
        f.whoosh = false;
        w.sound('ignite', f.x, f.y, 0.8);
        w.particles.fire(f.x, f.y, 6, 60, { size: [4, 8], life: [0.3, 0.7], rise: 60 });
      }
      const grow = Math.min(1, 0.35 + f.age / 2.5) * Math.sqrt(f.k); // it catches, then roars
      if ((f.t -= dt) <= 0) {
        f.t = every * rand(0.7, 1.3);
        w.particles.fire(f.x + rand(-8, 8) * grow, f.y + rand(-8, 8) * grow, 1 + (chance(grow * 0.5) ? 1 : 0), 34 * grow, { size: [3, 7], life: [0.25, 0.6], rise: 46 });
        if (chance(0.03)) w.particles.embers(f.x, f.y, 1, 120);
      }
    }
    const p = w.player || { x: 0, y: 0 };
    if ((this.lightT -= dt) <= 0) {
      this.lightT = c.light.every;
      const near = this.near(p.x, p.y, c.light.max), big = 1 + Math.min(1, list.length / c.big) * 0.6;
      for (const f of near) w.light(f.x, f.y, c.light.r * big * Math.min(1, 0.35 + f.age / 2.5) * rand(0.8, 1.15), c.light.color, c.light.every * 2.2);
    }
    if ((this.crackle -= dt) <= 0) {
      this.crackle = rand(...c.crackle);
      const f = this.near(p.x, p.y, 1)[0];
      w.sound('crackle', f.x, f.y, 0.9);
    }
    if (list.length >= c.big && (this.roar -= dt) <= 0) {
      this.roar = rand(...c.roar);
      const f = this.near(p.x, p.y, 1)[0];
      w.sound('fireRoar', f.x, f.y, Math.min(1, 0.5 + list.length / (c.big * 8)));
    }
  }
}
