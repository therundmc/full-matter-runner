// Machines that answer back (GADGETS, by prop type). The arcade cabinet rings and flashes when it is bumped into
// or hit, as long as its screen lives; the jukebox derails at the first blow (its lights sputter, `prop.sputter`),
// then goes dark. DOM-free.
import { GADGETS } from '../Config.js';
import { clamp } from '../../engine/math.js';

export default class Gadgets {
  constructor(world, cfg = GADGETS) {
    this.world = world;
    this.cfg = cfg;
    world.events.on('propHit', ({ prop }) => this.poke(prop));
    world.events.on('impact', ({ a, b, speed }) => {
      for (const e of [a.entity, b.entity]) if (e && speed >= (cfg[e.type]?.bump ?? Infinity)) this.poke(e);
    });
  }

  // how well the jukebox's tune (audio/Music.js) is heard from where the player stands, 0..1: nothing once it is
  // knocked off its record
  tune() {
    const w = this.world, p = w.player, g = this.cfg.jukebox;
    let best = 0;
    for (const prop of w.props) {
      if (prop.type !== 'jukebox' || prop.dead || prop.sputter || prop.unpowered) continue;
      const near = clamp(1 - Math.hypot(prop.x - p.x, prop.y - p.y) / g.reach, 0, 1);
      best = Math.max(best, near ** 1.5 * (w.walledOff(prop.x, prop.y) ? g.muffled : 1));
    }
    return best;
  }

  poke(prop) {
    const g = this.cfg[prop.type], w = this.world;
    // a dark arcade is mute; a jukebox whose glass caved in still has a record turning; nothing answers without power
    if (!g || prop.dead || prop.unpowered || (prop.lightsOut && !g.dies) || w.time < (prop.busy || 0)) return;
    prop.busy = g.dies ? Infinity : w.time + g.gap;
    w.sound(g.sound, prop.x, prop.y, 1);
    if (g.flash) w.light(prop.x, prop.y, 80, g.flash, 0.18);
    if (!g.dies) return;
    prop.sputter = true;
    w.after(g.dies, () => {
      if (prop.dead) return;
      prop.lightsOut = true;
      w.particles.sparks(prop.x, prop.y, 0, Math.PI, 8, 180);
    });
  }
}
