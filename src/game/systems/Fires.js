// Fires (level `fires`: [col, row, stage, delay]): something burning at a spot, for the look of it: flames, smoke,
// embers, a flickering light, the crackle, the air shimmering over it (Game.lensView reads lit()). In the tutorial the
// flat burns behind him: a fire with a stage catches `delay` s after that room of the lesson is reached
// (systems/Tutorial.js), with a whoosh; one without burns from the start. A room whose stage has `spark` waits for a
// man to drop a lit match in it (event 'matchDrop', Enemy.dropMatch): the petrol catches where it falls, then runs
// out from there (SPREAD px/s, plus each fire's delay); if no match comes, it catches on its own `spark` s after the
// room is reached. They hurt nobody and spread to nothing: scenery, laid on what cannot be walked on. Water puts
// them out (douse: the sprinklers).
// DOM-free: particles, lights and sounds asked of the world.
import { TILE } from '../Config.js';
import { rand, chance } from '../../engine/math.js';

const FLAMES = 0.045;     // s between two puffs of flame at a fire
const LIGHT = [0.11, 92]; // s between two flashes of its light, their radius (px)
const CRACKLE = [0.25, 0.7];
const SPREAD = 90;        // px/s the flames run along the petrol from where the match fell

const fire = (x, y, stage, delay) => ({ x, y, stage, delay, t: rand(0, FLAMES), lt: rand(0, LIGHT[0]), age: 0 });

export default class Fires {
  constructor(world, list = []) {
    this.world = world;
    this.fires = list.map(([col, row, stage = -1, delay = 0]) => fire(col * TILE, row * TILE, stage, delay));
    this.crackle = 0;
    this.clock = 0;
    this.reached = [];  // when each stage of the lesson was reached, on this clock
    this.sparks = [];   // where and when a match fell in each stage: { x, y, t }
    world.events?.on('matchDrop', ({ x, y }) => this.spark(x, y));
  }

  // a lit match falls at (x, y): a fire there at once, and the room's petrol catches from it
  spark(x, y) {
    const T = this.world.tutorial, i = T ? T.stageAt(x, y) : -1;
    if (i >= 0 && !this.sparks[i]) this.sparks[i] = { x, y, t: this.clock };
    const f = fire(x, y, -1, 0);
    f.whoosh = true;
    this.fires.push(f);
  }

  // on this clock, when fire f catches (Infinity: not yet known)
  catchesAt(f, stage) {
    if (f.stage < 0) return 0;
    if (!Number.isFinite(stage)) return 0; // a level that is no lesson: everything burns
    if (f.stage > stage) return Infinity;
    const reached = this.reached[f.stage] ?? this.clock; // (reached this very step)
    const T = this.world.tutorial, wait = T?.def?.stages?.[f.stage]?.spark;
    if (!wait || (T.from ?? 0) > f.stage) return reached + f.delay; // passed already on a retry: it is burning
    const s = this.sparks[f.stage];
    const own = reached + wait + f.delay;
    return s ? Math.min(own, s.t + Math.hypot(f.x - s.x, f.y - s.y) / SPREAD + f.delay) : own;
  }

  // water on them (systems/Sprinklers.js): the fires burning where `where(x, y)` holds go out in a hiss of steam
  douse(where) {
    const w = this.world, out = this.lit().filter((f) => where(f.x, f.y));
    if (!out.length) return;
    for (const f of out) {
      w.particles.smoke(f.x, f.y, 4, 6, { speed: 22, size: 7, life: 1.8 });
      w.sound('hiss', f.x, f.y, 0.5, { pitch: 0.6 });
    }
    this.fires = this.fires.filter((f) => !out.includes(f));
  }

  // the fires burning now
  lit() {
    const stage = this.world.tutorial?.stage ?? Infinity;
    return this.fires.filter((f) => this.clock >= this.catchesAt(f, stage));
  }

  update(dt) {
    const w = this.world, stage = w.tutorial?.stage ?? -1;
    this.clock += dt;
    for (let i = 0; i <= stage; i++) if (this.reached[i] === undefined) this.reached[i] = this.clock;
    const burning = this.lit();
    if (!burning.length) return;
    for (const f of burning) {
      if (f.age === 0 && (f.stage >= 0 || f.whoosh)) {
        // it catches: a whoosh and a burst
        w.sound('ignite', f.x, f.y, 0.8);
        w.particles.fire(f.x, f.y, 8, 70, { size: [4, 8], life: [0.3, 0.7], rise: 60 });
      }
      f.age += dt;
      const grow = Math.min(1, 0.35 + f.age / 2.5); // it catches, then roars
      if ((f.t -= dt) <= 0) {
        f.t = FLAMES;
        w.particles.fire(f.x + rand(-7, 7) * grow, f.y + rand(-7, 7) * grow, 1 + (chance(grow * 0.7) ? 1 : 0), 34 * grow, { size: [3, 7], life: [0.25, 0.6], rise: 46 });
        if (chance(0.06)) w.particles.smoke(f.x, f.y, 1, 5, { speed: 16, size: 7, life: 1.6 });
        if (chance(0.03)) w.particles.embers(f.x, f.y, 1, 120);
      }
      if ((f.lt -= dt) <= 0) {
        f.lt = LIGHT[0];
        w.light(f.x, f.y, LIGHT[1] * grow * rand(0.8, 1.15), '#ff8a2a', LIGHT[0] * 2.2);
      }
    }
    if ((this.crackle -= dt) <= 0) {
      this.crackle = rand(...CRACKLE);
      const p = w.player, near = burning.reduce((b, f) => (!b || Math.hypot(f.x - p.x, f.y - p.y) < Math.hypot(b.x - p.x, b.y - p.y) ? f : b), null);
      w.sound('crackle', near.x, near.y, 0.9);
    }
  }
}
