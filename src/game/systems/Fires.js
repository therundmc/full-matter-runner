// Fires (level `fires`: [col, row, stage]): something burning at a spot, for the look of it: flames, smoke, embers,
// a flickering light, the crackle, the air shimmering over it (Game.lensView reads lit()). In the tutorial the flat
// burns behind him: a fire with a stage catches once that room of the lesson is reached (systems/Tutorial.js); one
// without burns from the start. They hurt nobody and spread to nothing: scenery, laid on what cannot be walked on.
// DOM-free: particles, lights and sounds asked of the world.
import { TILE } from '../Config.js';
import { rand, chance } from '../../engine/math.js';

const FLAMES = 0.045;     // s between two puffs of flame at a fire
const LIGHT = [0.11, 92]; // s between two flashes of its light, their radius (px)
const CRACKLE = [0.25, 0.7];

export default class Fires {
  constructor(world, list = []) {
    this.world = world;
    this.fires = list.map(([col, row, stage = -1]) => ({ x: col * TILE, y: row * TILE, stage, t: rand(0, FLAMES), lt: rand(0, LIGHT[0]), age: 0 }));
    this.crackle = 0;
  }

  // the fires burning now
  lit() {
    const stage = this.world.tutorial?.stage ?? Infinity;
    return this.fires.filter((f) => f.stage <= stage);
  }

  update(dt) {
    const w = this.world, burning = this.lit();
    if (!burning.length) return;
    for (const f of burning) {
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
