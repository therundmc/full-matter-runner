// What a toll's plaza does when it is hit (systems/Toll.js; numbers CHASE.toll.arm / crash / kerb / coins):
//   an arm torn off ('tollGate'): it bursts in splinters and chips of its red and white paint with a crack and a
//     flash, the attendant in the booth over that lane ducks under his counter for a moment (`toll_booth_duck`)
//   THE CRASH ('tollCrash': one of theirs stopped on a steel boom): the biggest fire-ball of the chase
//     (systems/CarFx.js boom 'toll'), its glass in the air, a shower of sparks off the boom and bits of its bands
//   a car on an island's kerb: its yellow paint chipped off as it grinds (CarFx's sparks are already there); a
//     booth's exact-change basket struck: its coins sprayed across the lane, once a basket
// LOOKS ONLY: it never moves a thing (the booth's sprite is swapped and swapped back), scaled by the QUALITY option.
// DOM-free.
import { CHASE } from '../data/chase.js';
import { CAT } from '../Config.js';
import { quality } from './Quality.js';
import { spriteOpt, chunk } from '../../engine/Assets.js';
import { rand, chance } from '../../engine/math.js';
import Debris from '../entities/Debris.js';

const { Body } = Matter;
const BASKET = [-34, 8];  // px from a booth's middle to its exact-change basket (tools/generate_assets.py p_toll_booth)
const KERBED = new Set(['toll_island', 'toll_booth']);

// the booth over plaza lane `y` (world px) nearest x: the booth stands on the island above its lane (the builder's
// rule: the lane under it, +y, is its own), within `reach` px along the road; null: none
function boothOver(props, x, y, reach = 200) {
  let best = null, bd = Infinity;
  for (const p of props) {
    if (p.type !== 'toll_booth' || p.dead || p.y >= y || y - p.y > 3 * 32) continue;
    const d = Math.abs(p.x - x);
    if (d < reach && d + (y - p.y) < bd) { bd = d + (y - p.y); best = p; }
  }
  return best;
}

// where a booth's basket is (world px)
function basketOf(p) {
  const a = p.body?.angle ?? 0, c = Math.cos(a), s = Math.sin(a);
  return { x: p.x + BASKET[0] * c - BASKET[1] * s, y: p.y + BASKET[0] * s + BASKET[1] * c };
}

export default class TollFx {
  constructor(world, C = CHASE.toll) {
    this.world = world;
    this.C = C;
    this.ducks = [];          // booths ducked: { p, img (its own sprite), t (s left) }
    this.paid = new Set();    // baskets already sprayed
    this.chipAcc = 0;
    world.events.on('tollGate', (e) => this.arm(e));
    world.events.on('tollCrash', (e) => this.crash(e));
  }

  // a share of n at the QUALITY in force
  n(k) { return Math.round(k * (quality().fx ?? 1)); }

  // an arm torn off at (x, y) by `car`, going its way
  arm({ x, y, car }) {
    const A = this.C.arm, w = this.world, P = w.particles, vel = car?.body ? Body.getVelocity(car.body) : { x: 1, y: 0 };
    const a = Math.atan2(vel.y, vel.x);
    P.chips?.(x, y, a, 1.0, this.n(A.splinters), '#c8a070', A.speed);
    P.chips?.(x, y, a, 1.5, this.n(A.chips / 2), '#d0242c', A.speed * 0.8);
    P.chips?.(x, y, a, 1.5, this.n(A.chips / 2), '#ece8de', A.speed * 0.8);
    w.light?.(x, y, A.flash[0], A.flash[1], A.flash[2]);
    // (and its bigger splinters, real loose bits thrown on down the plaza: they meet walls only, never a car)
    for (let i = 0, n = this.n(A.bits); i < n && w.addDebris; i++) {
      const b = a + rand(-0.9, 0.9), sp = rand(0.4, 1.1) * A.speed, col = chance(0.4) ? '#c8a070' : chance(0.5) ? '#d0242c' : '#ece8de';
      w.addDebris(new Debris(w, chunk(col, Math.floor(rand(3, 7)), 1), x + rand(-4, 4), y + rand(-14, 14), rand(0, 6.28),
        Math.cos(b) * sp, Math.sin(b) * sp, rand(-1.2, 1.2), { mask: CAT.WALL | CAT.EDGE, material: 'wood', kg: 0.3, mu: 0.5, air: 0.03 }));
    }
    w.sound?.('armCrack', x, y, 1); // placeholder (assets/sound/PLACEHOLDERS.md)
    const b = boothOver(w.props, x - 100, y);
    if (b) this.duck(b, A.duck);
  }

  // the attendant ducks under his counter for `t` s
  duck(p, t) {
    const low = spriteOpt('props/toll_booth_duck');
    if (!low) return;
    const was = this.ducks.find((q) => q.p === p);
    if (was) { was.t = t; return; }
    this.ducks.push({ p, img: p.img, t });
    p.img = low;
  }

  // THE CRASH on a steel boom: the car's fire-ball where it struck, its glass, the boom's sparks and bits
  crash({ car, gate, x, y, side }) {
    const K = this.C.crash, w = this.world, P = w.particles;
    w.carFx?.boom('toll', { x, y }, Body.getVelocity(car.body), car);
    P.glass?.(x, y, Math.PI, 1.6, this.n(18), 260);
    const gy = gate?.y ?? y;
    for (let i = 0; i < 3; i++) {
      P.hot?.(x + 2, gy + (i - 1) * 24, this.n(K.sparks / 3), { kick: 380, up: [80, 300], hops: 2, mark: 0.4, life: [0.3, 1], a: Math.PI + side * 0.6, spread: 1.4 });
    }
    P.chips?.(x, gy, Math.PI + side * 0.8, 1.6, this.n(K.bits), '#c8242c', 260);
    P.chips?.(x, gy, Math.PI - side * 0.8, 1.6, this.n(K.bits), '#5a606c', 240);
    w.sound?.('boomCrash', x, y, 1); // placeholder (assets/sound/PLACEHOLDERS.md)
    // (the roof over the gates seen through while it burns under it)
    for (const p of w.props) if (p.type === 'toll_canopy' && Math.abs(p.x - x) < p.W && Math.abs(p.y - y) < p.H) p.clearUntil = w.time + K.clear;
  }

  // a step, after the physics: the ducked booths back up, what grinds on the islands' kerbs, a basket struck
  update(dt) {
    const w = this.world, R = this.C.coins;
    for (const q of this.ducks) if ((q.t -= dt) <= 0 && q.p.img !== q.img) q.p.img = q.img;
    this.ducks = this.ducks.filter((q) => q.t > 0);
    this.chipAcc = Math.min(4, this.chipAcc + this.C.kerb.chips * dt * (quality().fx ?? 1));
    for (const pair of w.physics?.activePairs?.() || []) {
      if (pair.isSensor) continue;
      const A = pair.bodyA.parent || pair.bodyA, B = pair.bodyB.parent || pair.bodyB;
      const car = A.entity?.isVehicle ? A : B.entity?.isVehicle ? B : null, o = car === A ? B : A;
      if (!car || !KERBED.has(o.entity?.type)) continue;
      const vel = Body.getVelocity(car), sp = Math.hypot(vel.x, vel.y), c = pair.collision.supports?.[0];
      if (!c || sp < 2) continue;
      if (this.chipAcc >= 1) {
        const n = Math.floor(this.chipAcc);
        this.chipAcc -= n;
        w.particles.chips?.(c.x, c.y, Math.atan2(-vel.y, -vel.x), 1.2, n, '#d8b030', 60 + sp * 8);
      }
      for (const p of w.props) {
        if (p.type !== 'toll_booth' || this.paid.has(p)) continue;
        const k = basketOf(p);
        if (Math.hypot(c.x - k.x, c.y - k.y) > R.r) continue;
        this.paid.add(p);
        const a = Math.atan2(vel.y, vel.x);
        w.particles.chips?.(k.x, k.y, a, 1.8, this.n(R.n), '#dcdce6', 120 + sp * 10);
        w.particles.chips?.(k.x, k.y, a, 1.8, this.n(R.n / 3), '#d8b860', 120 + sp * 10);
        w.particles.sparks?.(k.x, k.y, a, 1.6, this.n(6), 160, '#ffffff');
        w.sound?.('coinSpray', k.x, k.y, 1); // placeholder (assets/sound/PLACEHOLDERS.md)
      }
    }
  }
}
