// Is somebody on the player right now? (DOM-free.) What he does to a man on the floor depends on it: threatened, a
// quick kill; left alone, the long execution (data/finishers.js finisherChoice). The numbers: THREAT.
import { THREAT } from '../data/finishers.js';
import { passBy } from './Flinch.js';

// p: { x, y }; guards: [{ x, y, alive, knocked, yielded, aware (2: after the player), sees (he has a line to him) }];
// now, firedAt: world times (firedAt: when a round last went by him or struck near him); phase: the squad's
// (ai/Director.js)
export function threatened(p, guards, { now = 0, firedAt = -Infinity, phase = 'normal' } = {}, T = THREAT) {
  if (now - firedAt < T.fire) return true;
  for (const g of guards) {
    if (!g.alive || g.knocked > 0 || g.yielded) continue;
    const d = Math.hypot(g.x - p.x, g.y - p.y);
    if (g.aware === 2 && g.sees && d <= T.sight) return true;
    if (phase === 'alert' && d <= T.close) return true;
  }
  return false;
}

// Remembers when the player was last shot at (the world's 'round' and 'strike' events, as systems/Flinch.js).
export default class Danger {
  constructor(world, rules = THREAT) {
    this.world = world;
    this.rules = rules;
    this.firedAt = -Infinity;
    world.events.on('round', ({ x0, y0, x1, y1, owner }) => {
      const pl = world.player;
      if (!pl?.alive || owner === pl) return;
      const p = passBy(pl.x, pl.y, x0, y0, x1, y1);
      if (p.t > 0 && p.t < 1 && p.d < rules.whiz) this.firedAt = world.time;
    });
    world.events.on('strike', ({ x, y, owner }) => {
      const pl = world.player;
      if (pl?.alive && owner !== pl && Math.hypot(pl.x - x, pl.y - y) < rules.strike) this.firedAt = world.time;
    });
  }

  threatened(p = this.world.player) {
    const w = this.world;
    return threatened(p, w.enemies, { now: w.time, firedAt: this.firedAt, phase: w.director?.phase }, this.rules);
  }
}
