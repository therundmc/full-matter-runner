import { CAT, MASK } from '../core/Config.js';
import { PROPS } from '../data/props.js';
import { sprite, slices, drawSpriteShadowed } from '../core/Assets.js';
import { rand, chance } from '../core/math.js';
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
    if (d.explosive) {
      w.after(0.06, () => w.explode(x, y, { radius: 92, source: 'barrel' }));
      return;
    }
    const cols = this.img.width > 26 ? 3 : 2, rows = this.img.height > 18 ? 2 : 1;
    const pieces = slices(this.img, cols, rows);
    for (const pc of pieces) {
      const a = dirA + rand(-1.2, 1.2), v = rand(60, 220) * power;
      w.addDebris(new Debris(w, pc, x + rand(-6, 6), y + rand(-6, 6), this.body.angle, Math.cos(a) * v, Math.sin(a) * v, rand(-0.3, 0.3), { air: 0.07, density: 0.003 }));
    }
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
