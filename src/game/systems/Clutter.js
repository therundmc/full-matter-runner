// What stands on the furniture: glasses, bottles, ashtrays, the till, cards, banknotes (CLUTTER and SETS in
// data/clutter.js), laid on a prop by the level (prop option `clutter`). No body of its own: each piece is kept in
// its prop's own px (the sprite's middle at 0,0, PoolBalls-style), so it rides on the prop, shudders with it and is
// drawn over it (render/ClutterArt.js). What happens to it:
//  - a round ('propHit') hits what stands along its line, the nearest first: a glass bursts where it stands (glass,
//    a splash, the drink run off the edge of the prop onto the floor: 'spill'), anything else is knocked off;
//  - a blow knocks off what stands by it, a heavy one shakes off more; a blast throws everything;
//  - the prop tipped over ('propFlipped') or falling apart ('propDestroyed'): everything still on it goes flying.
// Knocked off, a piece is a real loose thing (entities/Debris.js: it slides, it is kicked about, it is baked into the
// floor once still), a glass smashing where it lands as often as not; paper and banknotes flutter down. An ashtray
// with a cigarette left in it smokes (Smoke.wisp) as long as it stands. DOM-free.
import { CLUTTER, CLUTTER_HIT, SETS } from '../data/clutter.js';
import { FLOATS } from '../data/destruction.js';
import { LIQUIDS } from '../data/liquids.js';
import { MAX_DEBRIS, DESTRUCTION } from '../Config.js';
import { spriteOpt } from '../../engine/Assets.js';
import { rand, chance, clamp } from '../../engine/math.js';
import Debris from '../entities/Debris.js';

const ASH = '#8a8690', NUTS = '#c49a5a';

export default class Clutter {
  constructor(world, sets = SETS, kinds = CLUTTER, cfg = CLUTTER_HIT) {
    this.world = world;
    this.sets = sets;
    this.kinds = kinds;
    this.cfg = cfg;
    this.on = new Map(); // prop -> its pieces { kind, def, x, y, a, state: 'on' | 'broken' | 'off' }
    const ev = world.events;
    ev.on('propHit', ({ prop, x, y, dirA, kind, power }) => this.hit(prop, x, y, dirA, kind, power));
    ev.on('propFlipped', ({ prop, dirA }) => this.scatter(prop, dirA, 1));
    ev.on('propDestroyed', ({ prop, dirA, power }) => this.scatter(prop, dirA, power));
  }

  // lay the set `name` on the prop (more than one set may go on the same prop)
  attach(prop, name) {
    const set = this.sets[name];
    if (!set) throw new Error('unknown clutter set ' + name);
    const items = set.map(([kind, x, y, deg = 0]) => {
      const def = this.kinds[kind];
      if (!def) throw new Error('unknown clutter ' + kind);
      return { kind, def, x, y, a: (deg * Math.PI) / 180, state: 'on' };
    });
    this.on.set(prop, [...(this.on.get(prop) || []), ...items]);
    return items;
  }

  items(prop) { return this.on.get(prop) || []; }

  // the world point and angle of a piece
  place(prop, it) {
    const o = prop.centre ? prop.centre() : prop, a = prop.body.angle, c = Math.cos(a), s = Math.sin(a);
    return { x: o.x + it.x * c - it.y * s, y: o.y + it.x * s + it.y * c, a: a + it.a };
  }

  // what a hit on the prop does to what stands on it (see the header)
  hit(prop, x, y, dirA, kind, power = 0.6) {
    const live = this.items(prop).filter((i) => i.state === 'on');
    if (!live.length || prop.dead) return;
    const H = this.cfg;
    if (kind === 'blast') { for (const i of live) this.knock(prop, i, dirA + rand(-1, 1), 2); return; }
    // the blow in the prop's own frame
    const o = prop.centre ? prop.centre() : prop, t = -prop.body.angle, c = Math.cos(t), s = Math.sin(t);
    const lx = (x - o.x) * c - (y - o.y) * s, ly = (x - o.x) * s + (y - o.y) * c, ux = Math.cos(dirA + t), uy = Math.sin(dirA + t);
    if (H.most[kind]) {
      // a round: what stands along its line from where it struck, the nearest first
      live.map((i) => {
        const qx = i.x - lx, qy = i.y - ly;
        return [qx * ux + qy * uy, Math.abs(qx * uy - qy * ux), i];
      }).filter(([along, off, i]) => along > -i.def.r && off <= i.def.r + H.pad)
        .sort((p, q) => p[0] - q[0]).slice(0, H.most[kind])
        .forEach(([, , i]) => (i.def.glass ? this.burst(prop, i, dirA) : this.knock(prop, i, dirA, 1)));
      return;
    }
    // a blow: what stands by it goes, a heavy one shakes off more
    for (const i of live) {
      const d = Math.hypot(i.x - lx, i.y - ly);
      if (d <= H.blow || (power >= H.hard && d <= H.shake && chance(0.6))) this.knock(prop, i, dirA + rand(-0.6, 0.6), power);
    }
  }

  // everything still on it goes flying (it was tipped over, it fell apart)
  scatter(prop, dirA, power = 1) {
    const set = this.on.get(prop);
    if (!set) return;
    for (const i of set) if (i.state === 'on') this.knock(prop, i, dirA + rand(-0.9, 0.9), clamp(power, 0.6, 2.5) * rand(0.6, 1.1));
    this.on.delete(prop);
  }

  // a glass shot where it stands: it bursts, what it held splashes and runs off the edge of the prop to the floor
  burst(prop, i, dirA) {
    const w = this.world, P = w.particles, p = this.place(prop, i), g = i.def.glass;
    i.state = i.def.broken ? 'broken' : 'off';
    P.glass(p.x, p.y, dirA, 1.6, 9, 120);
    if (g.area) {
      const wet = LIQUIDS.kinds[g.kind].splash, e = this.edge(prop, i, dirA);
      P.drops(p.x, p.y, dirA, 1.3, 6, wet, 100, 4, false);
      w.events.emit('spill', { x: e.x, y: e.y, kind: g.kind, area: g.area * rand(0.7, 1.2), dur: 0.6 });
    }
    w.sound('clutterShatter', p.x, p.y, 0.55, { pitch: rand(0.95, 1.2) });
  }

  // where a splash thrown along dirA from a piece leaves the prop (2 px past its outline), world px
  edge(prop, i, dirA) {
    const a = dirA - prop.body.angle, ux = Math.cos(a), uy = Math.sin(a);
    const hw = (prop.W ?? 20) / 2 + 2, hh = (prop.H ?? 20) / 2 + 2;
    const tx = ux ? ((ux > 0 ? hw : -hw) - i.x) / ux : Infinity, ty = uy ? ((uy > 0 ? hh : -hh) - i.y) / uy : Infinity;
    const k = Math.max(0, Math.min(tx, ty));
    return this.place(prop, { x: i.x + ux * k, y: i.y + uy * k, a: 0 });
  }

  // knocked off toward a: a loose piece (a glass may smash where it lands), paper fluttering down, ash, nuts
  knock(prop, i, a, power = 1) {
    const w = this.world, P = w.particles, d = i.def, p = this.place(prop, i);
    i.state = 'off';
    if (d.ash) P.dust(p.x, p.y, 3, 2, ASH, { speed: 22, size: 3, life: 1.4, alpha: 0.25 });
    if (d.nuts) P.chips(p.x, p.y, a, 1.1, 7, NUTS, 90);
    if (d.flutter) {
      P.floaters(p.x, p.y, FLOATS[d.flutter], 3, a, 0.9, 60 * clamp(power, 0.5, 2), 8);
      w.sound('clutterPaper', p.x, p.y, 0.4);
    }
    if (d.kg) this.toss(i, p, a, power);
  }

  // the piece itself, thrown: a Debris while there is room for one, else a shard that is only seen
  toss(i, p, a, power) {
    const w = this.world, d = i.def, H = this.cfg;
    const img = d.sprite && spriteOpt('clutter/' + d.sprite);
    if (!img) return;
    const v = rand(...H.speed) * clamp(power, 0.5, 2), vz = rand(...H.lift), g = d.glass, smash = !!g && chance(g.share);
    const land = (x, y) => {
      if (smash) this.shatter(x, y, a, g);
      else if (d.land) w.sound(d.land, x, y, 0.5, { pitch: rand(0.9, 1.15) });
    };
    if (w.debris.length < MAX_DEBRIS * DESTRUCTION.physicalShare) {
      w.addDebris(new Debris(w, img, p.x, p.y, p.a, Math.cos(a) * v, Math.sin(a) * v, rand(-0.3, 0.3), {
        material: d.material, kg: d.kg, mu: d.mu, z: H.z, vz, bounce: 0.25,
        onLand: (b) => { land(b.body.position.x, b.body.position.y); if (smash) w.removeDebris(b); },
      }));
    } else w.particles.shard(img, p.x, p.y, a, v, { z: H.z, vz, rot: p.a, onLand: smash ? (q) => land(q.x, q.y) : null });
  }

  // a piece of glass smashing on the floor: shards, and what was left in it
  shatter(x, y, a, g) {
    const w = this.world, P = w.particles;
    P.glass(x, y, a, 1.5, 7, 90);
    if (g.area) {
      P.drops(x, y, a, 1.3, 4, LIQUIDS.kinds[g.kind].splash, 80, 3, false);
      w.events.emit('spill', { x, y, kind: g.kind, area: g.area * rand(0.6, 1.1) });
    }
    w.sound('clutterShatter', x, y, 0.45, { pitch: rand(1, 1.25) });
  }

  // the cigarettes left in the ashtrays smoke on; what is gone with its prop is let go
  update(dt) {
    const sm = this.world.smoke;
    for (const [p, set] of this.on) {
      if (p.dead) { this.on.delete(p); continue; }
      if (!sm) continue;
      for (const i of set) {
        if (i.state !== 'on' || !i.def.smoke) continue;
        const q = this.place(p, i);
        sm.wisp(i, q.x, q.y, dt);
      }
    }
  }
}
