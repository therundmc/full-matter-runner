// Clouds nobody sees through. A wall extinguisher that is pierced (prop `cloud`, 'propDestroyed') empties itself
// in a white jet away from its wall, and the powder hangs there for a few seconds: guards lose sight of whatever
// is in it or behind it (World.sightLine), the player sees no better. DOM-free: the cloud is made of dust
// particles, its hiss is the gas one, lower.
import { CLOUD } from '../Config.js';
import { clamp } from '../../engine/math.js';

export default class Clouds {
  constructor(world, cfg = CLOUD) {
    this.world = world;
    this.cfg = cfg;
    this.list = [];
    world.events.on('propDestroyed', ({ prop }) => {
      // a wall-mounted prop faces the room along its local +y
      if (prop.def.cloud) this.burst(prop.x, prop.y, prop.body.angle + Math.PI / 2);
    });
  }

  burst(x, y, a) {
    this.list.push({ x0: x, y0: y, x, y, a, t: 0, r: 0, puff: 0, hiss: 0 });
  }

  update(dt) {
    if (!this.list.length) return;
    const c = this.cfg, w = this.world;
    for (const k of this.list) {
      k.t += dt;
      const dx = Math.cos(k.a), dy = Math.sin(k.a), out = Math.min(1, k.t / c.jet);
      // its heart is pushed out by the jet; it swells, holds, then thins away
      k.x = k.x0 + dx * c.reach * out;
      k.y = k.y0 + dy * c.reach * out;
      k.r = c.r * Math.min(1, k.t / c.grow) * clamp((c.life - k.t) / c.fade, 0, 1);
      if ((k.puff -= dt) <= 0 && k.t < c.life - c.fade) {
        if (k.t < c.jet) {
          k.puff = c.every;
          // soft puffs (Particles): two bigger ones do what three square chunks did, at less cost
          w.particles.dust(k.x0 + dx * 4, k.y0 + dy * 4, 2, 2, c.color, { speed: 30, size: 8.5, life: 3.4, alpha: 0.55, vx: dx * c.speed, vy: dy * c.speed });
        } else {
          k.puff = c.every * 2;
          w.particles.dust(k.x, k.y, 1, k.r * 0.7, c.color, { speed: 8, size: 10, life: 3.4, alpha: 0.5 });
        }
      }
      if (k.t < c.jet && (k.hiss -= dt) <= 0) {
        k.hiss = 0.25;
        w.sound('hiss', k.x0, k.y0, 0.9, { pitch: 0.7 });
      }
    }
    this.list = this.list.filter((k) => k.t < c.life);
  }

  // does the segment cross the thick of a cloud?
  blocks(x0, y0, x1, y1) {
    const dx = x1 - x0, dy = y1 - y0, l2 = dx * dx + dy * dy;
    for (const k of this.list) {
      const r = k.r * this.cfg.core;
      if (r < 8) continue;
      const u = l2 ? clamp(((k.x - x0) * dx + (k.y - y0) * dy) / l2, 0, 1) : 0;
      if (Math.hypot(x0 + dx * u - k.x, y0 + dy * u - k.y) < r) return true;
    }
    return false;
  }
}
