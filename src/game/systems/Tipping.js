// What goes over instead of breaking (prop def `tips`, data/props.js): a street bin hit, shot, run into, kicked over
// by a body thrown at it, shoved by a blast or a car falls the way it was sent. Its body becomes the can lying there,
// its lid rolls off, its rubbish spills out of the mouth and stays (bags, cans, scraps, loose sheets the wind takes).
// Lying, it only rings, dents and rolls (Prop.hit); a blast or a car at speed wrecks it (Prop.break). A body walking
// into it only rocks it. Heard by the guards as a clatter. DOM-free.
import { BITS } from '../data/destruction.js';
import { PROPS } from '../data/props.js';
import { sprite, sw } from '../../engine/Assets.js';
import { PX_PER_M } from '../../engine/physics/Units.js';
import { setMaterial, scaleInertia, impulse, kgOf } from '../../engine/physics/Body.js';
import { rand, randi, clamp, TAU } from '../../engine/math.js';
import Debris from '../entities/Debris.js';

const { Bodies, Body, Query } = Matter;

const LEANS = [0, 0.45, -0.45, 0.9, -0.9, 1.5, -1.5]; // rad off the blow it may fall at, when a wall is that way
const SHIFTS = [6, 3, 0, -3, -6];                    // px along its fall its centre may end up from where it stood
const SPILL_AFTER = 0.12;                             // s: the can hits the floor, then what it held slides out

// Where a can standing at (x, y) and sent along dirA comes to lie: as close to that way as the walls and the bolted
// furniture let it ({ x, y, a }), its base about where it stood. size: [length, width] px; blocked(x, y): no room.
export function lieAt(x, y, dirA, [len, wide], blocked) {
  const fits = (cx, cy, a) => {
    const c = Math.cos(a), s = Math.sin(a);
    for (const [u, v] of [[-1, -1], [1, -1], [1, 1], [-1, 1], [0, -1], [0, 1], [1, 0], [-1, 0]]) {
      const lx = (u * len) / 2, ly = (v * wide) / 2;
      if (blocked(cx + lx * c - ly * s, cy + lx * s + ly * c)) return false;
    }
    return true;
  };
  for (const lean of LEANS) {
    const a = dirA + lean;
    for (const k of SHIFTS) {
      const cx = x + Math.cos(a) * k, cy = y + Math.sin(a) * k;
      if (fits(cx, cy, a)) return { x: cx, y: cy, a };
    }
  }
  return { x, y, a: dirA };
}

// (x, y) is no place for something to lie: a wall, or bolted furniture
function blocker(w) {
  const fixed = w.props.filter((p) => !p.dead && p.body?.isStatic && !p.def?.hung && !p.def?.overhead).map((p) => p.body);
  return (x, y) => w.map.solidAt(x, y) || Query.point(fixed, { x, y }).length > 0;
}

// Knocks prop p over along dirA (power: how violently, ~1; by: who did it, if anybody did). Returns false when it
// does not tip (no `tips`, kept standing by its level, already down, gone).
export function tipOver(p, dirA, power = 1, by = null) {
  const t = p.def.tips, w = p.world;
  if (!t || p.noTip || p.tipped || p.dead || p.dying) return false;
  const blocked = blocker(w);
  const lid = p.look;
  const at = lieAt(p.x, p.y, dirA, t.body, blocked);
  w.removeBody(p.body);
  p.tipped = true;
  // the can lying there: its own sprite, unmarked (the marks were on the lid), hit points whole again for a blast
  p.img = sprite(t.down);
  p.canvas = p.shadow = p.zones = p.lastHit = null;
  p.stage = 0;
  p.hp = p.def.hp;
  p.off = { x: t.off ?? 0, y: 0 };
  p.opts.angle = at.a;
  p.body = Bodies.rectangle(at.x, at.y, t.body[0], t.body[1], p.opts);
  setMaterial(p.body, t.kg, t.mu);
  scaleInertia(p.body, 2);
  p.body.entity = p;
  p.body.material = p.def.material;
  w.addBody(p.body);
  const k = clamp(power, 0.6, 1.5);
  impulse(p.body, at.a, (t.kg * rand(...t.roll) * k) / 60, rand(-0.08, 0.08));
  p.recoil(at.a, 0.6);
  if (t.lid) throwLid(p, lid, at, roomBy(at, t.body, blocked)(sw(lid) / 2), k);
  // by then it has slid on a little: what it held comes out where its mouth is now
  w.after(SPILL_AFTER, () => spill(p, roomBy(p.dead ? at : { x: p.x, y: p.y, a: p.body.angle }, t.body, blocked), at.a, k));
  w.particles.dust(at.x, at.y, 5, 6, '#6a6470', { speed: 25, size: 4, life: 1.6, alpha: 0.18 });
  w.sound('binTip', at.x, at.y, 0.9);
  // a guard knocking one over on his way is not news to the others
  if (!by?.isEnemy) w.noise(at.x, at.y, t.noise, by?.isPlayer ? by : null, 'clatter');
  w.events.emit('propTipped', { prop: p, x: at.x, y: at.y, dirA: at.a, by });
  return true;
}

// room(r): a free spot for something r px round next to the can lying at `at` (size [length, width]): out of its
// mouth first, then beside the mouth, then behind its base; never in it (it would be shoved out of the way), nor in
// a wall. Falls back on the mouth itself.
function roomBy(at, [len, wide], blocked) {
  const c = Math.cos(at.a), s = Math.sin(at.a), half = len / 2;
  const clear = (x, y, r) => !blocked(x, y) && [0, 1, 2, 3].every((j) => !blocked(x + Math.cos((j * TAU) / 4) * r, y + Math.sin((j * TAU) / 4) * r));
  return (r) => {
    const d = r + 1, side = wide / 2 + r + 1;
    for (const [u, v] of [[half + d, rand(-3, 3)], [half - 3, side], [half - 3, -side], [-half - d, 0]]) {
      const x = at.x + u * c - v * s, y = at.y + u * s + v * c;
      if (clear(x, y, r)) return { x, y };
    }
    return { x: at.x + half * c, y: at.y + half * s };
  };
}

// the lid comes off as it goes over (from where the can lies, `at`, to the room found for it): up a little, spinning,
// it lands with a clang and rolls on away from the can
function throwLid(p, img, at, from, k) {
  const w = p.world, la = Math.atan2(from.y - at.y, from.x - at.x) + rand(-0.5, 0.5), v = rand(60, 110) * k;
  w.addDebris(new Debris(w, img, from.x, from.y, rand(0, TAU), Math.cos(la) * v, Math.sin(la) * v, rand(0.25, 0.5) * (Math.random() < 0.5 ? -1 : 1), {
    circle: true, material: 'metal', kg: 1.5, mu: 0.35, bounce: 0.3, air: 0.03, z: p.lift(), vz: rand(50, 90), land: 'binLid',
  }));
}

// what it held slides out of the mouth along the fall: each spill entry of its `tips` (data/props.js)
function spill(p, room, a, k) {
  const w = p.world;
  for (const s of p.def.tips.spill) {
    const n = randi(s.n[0], s.n[1]);
    if (!n) continue;
    if (s.papers) {
      const at = room(2);
      w.papers?.drop(at.x, at.y, n, a, 70 * k);
    } else if (s.bit) {
      const at = room((Math.max(...BITS[s.bit].size) * PX_PER_M) / 2 + 3); // throwBits scatters them 3 px about
      p.throwBits(BITS[s.bit], s, n, at.x, at.y, a, 0.6 * k);
    } else {
      for (let i = 0; i < n; i++) {
        const at = room((PROPS[s.prop].r ?? 6) + 1);
        const bag = new p.constructor(w, s.prop, at.x, at.y, rand(0, TAU)); // a Prop like it
        impulse(bag.body, a + rand(-0.5, 0.5), kgOf(bag.body) * rand(0.6, 1.2) * k);
        w.props.push(bag);
      }
    }
  }
}

// Bumps (physics 'impact'): a body heavy and fast enough knocks a standing one over along its own way, a lighter
// touch only rocks it; a car at speed flattens one lying there. Dealt with after the physics step (World.after).
export default class Tipping {
  constructor(world) {
    this.world = world;
    world.events.on('impact', ({ a, b, speed }) => { this.bump(a, b, speed); this.bump(b, a, speed); });
  }

  bump(body, other, speed) {
    const p = body.entity, t = p?.def?.tips;
    if (!t || p.noTip || p.dead || p.dying || other.isStatic) return;
    const o = other.entity, v = Body.getVelocity(other);
    const dirA = Math.hypot(v.x, v.y) > 0.3 ? Math.atan2(v.y, v.x) : Math.atan2(p.y - other.position.y, p.x - other.position.x);
    const w = this.world;
    if (p.tipped) {
      if (o?.isVehicle && speed >= t.wreck) w.after(0, () => p.break(dirA, 1.5));
    } else if (speed >= t.bump && kgOf(other) >= t.heavy) w.after(0, () => tipOver(p, dirA, speed / t.bump, o?.isDebris ? null : o));
    else if (speed >= t.rock) {
      // it rocks on its base and settles back
      const kick = p.kick, amt = 14 * clamp(speed / t.bump, 0.2, 1);
      kick.vx += Math.cos(dirA) * amt; kick.vy += Math.sin(dirA) * amt; kick.vr += rand(-0.4, 0.4);
    }
  }
}
