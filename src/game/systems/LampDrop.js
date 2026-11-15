// A hung lamp brought down (prop def `drops`: the pool table's): a round through its chains and it lets go. It drops
// from the ceiling onto whatever is under it, its light swinging and stuttering on the way (`hang`, Prop.drawOverhead),
// and crushes whoever stands within its footprint grown by LAMP_DROP.reach (a kill for whoever fired: `how.crushed`);
// its glass bursts, its light dies, the balls on the table jump, and the wreck lies where it fell. DOM-free.
import { LAMP_DROP } from '../data/devices.js';
import { clamp } from '../../engine/math.js';

const CUTS = new Set(['bullet', 'rifle', 'pellet', 'graze', 'shrapnel']);

// is (x, y) within the footprint (w x h px, centred on (cx, cy), turned by a) grown by reach [along, across]?
export function under(x, y, cx, cy, a, w, h, reach) {
  const dx = x - cx, dy = y - cy, c = Math.cos(a), s = Math.sin(a);
  return Math.abs(dx * c + dy * s) <= w / 2 + reach[0] && Math.abs(dy * c - dx * s) <= h / 2 + reach[1];
}

export default class LampDrop {
  constructor(world, cfg = LAMP_DROP) {
    this.world = world;
    this.cfg = cfg;
    this.falls = [];
    world.events.on('propHit', ({ prop, dirA, kind }) => {
      if (prop.def.drops && !prop.falling && CUTS.has(kind)) this.cut(prop, dirA, world.lastShot?.owner || null);
    });
  }

  // its chains go: it starts down (by: who fired)
  cut(prop, dirA, by) {
    const w = this.world;
    prop.falling = { t: 0, dirA, by, x0: prop.x, y0: prop.y };
    prop.sputter = true;
    prop.kick.vr += 3; // the chain that went first swings it round
    w.sound('clack', prop.x, prop.y, 1);
    w.particles.sparks(prop.x, prop.y, dirA, 0.8, 5, 200);
    this.falls.push(prop);
  }

  update(dt) {
    if (!this.falls.length) return;
    const c = this.cfg, M = Matter.Body;
    for (const p of this.falls) {
      const f = p.falling;
      f.t += dt;
      const k = clamp(f.t / c.fall, 0, 1);
      p.hang = 1 - k * k; // it gathers speed
      M.setPosition(p.body, { x: f.x0 + Math.cos(f.dirA) * c.shove * k, y: f.y0 + Math.sin(f.dirA) * c.shove * k });
      if (k >= 1) this.land(p);
    }
    this.falls = this.falls.filter((p) => p.falling);
  }

  // it hits: whoever is under it, its glass, its light, the table
  land(p) {
    const w = this.world, f = p.falling, a = p.body.angle;
    f.landed = true;
    p.hang = 0;
    p.lightsOut = true;
    p.sputter = false;
    for (const ch of w.chars) {
      if (!ch.alive || !under(ch.x, ch.y, p.x, p.y, a, p.W, p.H, this.cfg.reach)) continue;
      ch.kill(Math.atan2(ch.y - p.y, ch.x - p.x), 'melee', f.by, null, { crushed: true });
    }
    w.sound('clubHit', p.x, p.y, 1);
    w.sound('glass', p.x, p.y, 1);
    w.shake(0.12);
    w.particles.glass(p.x, p.y, f.dirA, Math.PI, 24, 170);
    w.particles.sparks(p.x, p.y, 0, Math.PI, 12, 220, '#bff');
    w.noise(p.x, p.y, 260, null, 'glass');
    // what it fell on takes the blow (the balls on a pool table jump, PoolBalls)
    const table = w.props.find((q) => q !== p && !q.dead && !q.def.hung && Math.hypot(q.x - p.x, q.y - p.y) < 30);
    if (table) table.hit(2, p.x, p.y, f.dirA, 1.4, 'blunt');
    // the wreck: it is down on the table now, its pieces start from there
    p.rec = { ...p.rec, drop: false, height: 0.9 };
    p.falling = null;
    p.break(f.dirA, 1);
  }
}
