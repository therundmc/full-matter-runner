import { CAT, MASK } from '../core/Config.js';
import { PROPS } from '../data/props.js';
import { sprite, slices, chunk, drawSpriteShadowed } from '../core/Assets.js';
import { rand, chance, angDiff } from '../core/math.js';
import Debris from './Debris.js';

const { Bodies, Body } = Matter;

export default class Prop {
  constructor(world, type, x, y, angle = 0) {
    this.world = world;
    this.type = type;
    this.def = PROPS[type];
    if (!this.def) throw new Error('unknown prop ' + type);
    this.img = sprite('props/' + type);
    this.hp = this.def.hp;
    const d = this.def;
    const opts = {
      isStatic: !!d.static, angle, label: 'prop',
      frictionAir: d.air ?? 0.3, friction: 0.3, restitution: 0.1,
      collisionFilter: { category: CAT.PROP, mask: MASK.PROP },
    };
    this.body = d.r ? Bodies.circle(x, y, d.r, opts) : Bodies.rectangle(x, y, d.w, d.h, opts);
    if (!d.static) Body.setDensity(this.body, d.density ?? 0.01);
    this.body.entity = this;
    this.dead = false;
    this.flash = 0;
    world.addBody(this.body);
  }

  get x() { return this.body.position.x; }
  get y() { return this.body.position.y; }

  // bullet / melee / thrown hit
  hit(damage, px, py, dirA, impulse = 0.6) {
    if (this.dead) return;
    const d = this.def, w = this.world;
    this.flash = 0.06;
    w.particles.chips(px, py, dirA + Math.PI, 1.2, 4, d.chips);
    if (d.sparks || d.sound === 'metal') w.particles.sparks(px, py, dirA + Math.PI, 1, 4, 220);
    w.sound(d.sound === 'glass' ? 'impact' : d.sound, px, py, 0.5);
    if (!d.static) {
      Body.applyForce(this.body, { x: px, y: py }, { x: Math.cos(dirA) * impulse * 0.004 * Math.sqrt(this.body.mass), y: Math.sin(dirA) * impulse * 0.004 * Math.sqrt(this.body.mass) });
    }
    this.hp -= damage;
    if (this.hp <= 0) this.break(dirA, impulse);
  }

  break(dirA = rand(0, Math.PI * 2), power = 1) {
    if (this.dead) return;
    this.dead = true;
    const d = this.def, w = this.world;
    const { x, y } = this.body.position;
    w.removeBody(this.body);
    if (d.explosive) w.after(0.06, () => w.explode(x, y, { radius: d.blast ?? 92, source: this.type }));
    // more pieces for bigger furniture
    const cols = Math.min(4, Math.max(2, Math.round(this.img.width / 11)));
    const rows = Math.min(3, Math.max(1, Math.round(this.img.height / 11)));
    const pieces = slices(this.img, cols, rows);
    const harm = power >= 1.5 ? { kind: 'blunt', knock: 3.5, lethal: 8.5 } : null;
    const ca = Math.cos(this.body.angle), sa = Math.sin(this.body.angle);
    const pw = this.img.width / cols, ph = this.img.height / rows;
    pieces.forEach((pc, k) => {
      // start each piece where it was in the object
      const lx = ((k % cols) + 0.5) * pw - this.img.width / 2, ly = (Math.floor(k / cols) + 0.5) * ph - this.img.height / 2;
      const px = x + lx * ca - ly * sa, py = y + lx * sa + ly * ca;
      const out = Math.atan2(py - y, px - x);
      const a = dirA + (Math.hypot(lx, ly) > 2 ? angDiff(dirA, out) * 0.5 : 0) + rand(-0.6, 0.6), v = rand(70, 240) * power;
      w.addDebris(new Debris(w, pc, px, py, this.body.angle, Math.cos(a) * v, Math.sin(a) * v, rand(-0.4, 0.4),
        { air: 0.07, density: 0.003, harm: harm && { ...harm } }));
    });
    // splinters / shards
    for (let k = 0; k < 6 + cols * rows; k++) {
      const a = dirA + rand(-1.4, 1.4), v = rand(80, 300) * power;
      w.addDebris(new Debris(w, chunk(d.chips, Math.floor(rand(2, 6)), Math.floor(rand(1, 3)) + 1), x + rand(-8, 8), y + rand(-8, 8), rand(0, 6),
        Math.cos(a) * v, Math.sin(a) * v, rand(-0.8, 0.8), { air: 0.06, density: 0.0015, shadow: 0 }));
    }
    if (d.explosive) return;
    w.particles.chips(x, y, dirA, Math.PI, 18, d.chips, 180);
    w.particles.smoke(x, y, 5, 8, { speed: 30, size: 6, life: 0.8 });
    if (d.glass) { w.particles.glass(x, y, dirA, 1.5, 14); w.sound('glass', x, y, 0.6); }
    if (d.sparks) { w.particles.sparks(x, y, 0, Math.PI, 18, 260); w.light(x, y, 50, '#9ff', 0.08); }
    if (d.dirt) w.particles.chips(x, y, 0, Math.PI, 14, '#4a2e1a', 120);
    if (d.water) {
      for (let i = 0; i < 30; i++) w.particles.chips(x, y, rand(0, 7), 0.3, 1, chance(0.5) ? '#9fdcff' : '#d8f4ff', rand(40, 200));
    }
    w.sound(d.sound === 'metal' ? 'metal' : 'wood', x, y);
    w.shake(0.08);
  }

  draw(ctx) {
    const p = this.body.position;
    // jitter briefly when hit
    let jx = 0, jy = 0;
    if (this.flash > 0) { this.flash -= 1 / 60; jx = rand(-1.5, 1.5); jy = rand(-1.5, 1.5); }
    drawSpriteShadowed(ctx, this.img, p.x + jx, p.y + jy, this.body.angle, 3);
  }
}
