import { CAT, MASK } from '../core/Config.js';
import { drawSprite, silhouette } from '../core/Assets.js';
import { rand, chance } from '../core/math.js';
import { setMaterial } from '../core/Physics.js';

const { Bodies, Body } = Matter;

// Any physical loose piece: gibs, shell casings, furniture fragments, glass shards, wall chunks.
// opts.harm = { kind: 'cut'|'blunt', knock, lethal, ignore } makes a fast piece dangerous for enemies.
// Once settled it is baked into the floor canvas and removed from the simulation.
export default class Debris {
  constructor(world, img, x, y, angle, vx, vy, spin, opts = {}) {
    this.world = world;
    this.img = img;
    const w = Math.max(2, img.width - 1), h = Math.max(2, img.height - 1);
    this.size = Math.max(w, h);
    this.body = opts.circle
      ? Bodies.circle(x, y, Math.max(1.5, Math.min(w, h) / 2), {})
      : Bodies.rectangle(x, y, w, h, {});
    Body.set(this.body, {
      angle,
      frictionAir: (opts.air ?? 0.045) * 0.3, // light air drag; the floor (Physics.groundFriction) does the braking
      friction: 0.1,
      restitution: opts.bounce ?? 0.35,
      collisionFilter: { category: CAT.DEBRIS, mask: opts.mask ?? MASK.DEBRIS },
      label: 'debris',
    });
    // real-ish mass from the piece size; it flies a moment before touching the floor
    setMaterial(this.body, opts.kg ?? Math.max(0.15, w * h * 0.04), opts.mu ?? 0.6, world.time + (opts.fly ?? 0.12));
    Body.setVelocity(this.body, { x: vx / 60, y: vy / 60 });
    Body.setAngularVelocity(this.body, spin);
    this.body.entity = this;
    this.bleed = opts.bleed || 0;     // seconds leaving a blood trail
    this.spurt = opts.spurt || 0;     // seconds spurting blood
    this.metal = !!opts.metal;        // tink on first bounce
    this.harm = opts.harm || null;
    this.isDebris = true;
    this.settle = 0;
    this.age = 0;
    this.shadow = opts.shadow ?? 1;
    this.dead = false;
    world.addBody(this.body);
  }

  update(dt) {
    const b = this.body;
    this.age += dt;
    const sp = Body.getSpeed(b);
    if (this.bleed > 0) {
      this.bleed -= dt;
      if (sp > 0.4) this.world.map.stampBlood(b.position.x, b.position.y, rand(0.8, 1.8), 1);
    }
    if (this.spurt > 0) {
      this.spurt -= dt;
      if (chance(0.6)) this.world.particles.blood(b.position.x, b.position.y, rand(0, Math.PI * 2), 0.3, 1, rand(60, 160), { z: 4 });
    }
    if (this.harm && sp > this.harm.knock) this.checkHarm(sp);
    else if (this.harm && this.age > 0.3) this.harm = null;
    if (sp < 0.06 && Math.abs(Body.getAngularVelocity(b)) < 0.01) this.settle += dt; else this.settle = 0;
    if (this.settle > 0.9 && this.age > 1.2) this.world.bakeDebris(this);
  }

  // a fast shard / chunk smashing into an enemy
  checkHarm(sp) {
    const p = this.body.position;
    for (const c of this.world.enemies) {
      if (!c.alive || c === this.harm.ignore) continue;
      if (Math.hypot(c.x - p.x, c.y - p.y) > c.radius + this.size * 0.5 + 2) continue;
      this.applyHarm(c, sp);
      return;
    }
  }

  applyHarm(c, sp) {
    const v = Body.getVelocity(this.body);
    const a = Math.atan2(v.y, v.x);
    if (sp > this.harm.lethal) {
      c.kill(a, this.harm.kind === 'cut' ? 'glass' : 'melee', this.world.player, 0.6);
    } else if (!c.knocked) {
      c.knock(a, 'debris');
      this.world.particles.blood(c.x, c.y, a, 0.6, 10, 140);
      this.world.sound('punch', c.x, c.y, 0.7);
      if (this.harm.kind === 'cut') this.world.map.stampBlood(c.x, c.y, 4, 4);
    }
    Body.setVelocity(this.body, { x: -v.x * 0.25, y: -v.y * 0.25 });
    this.harm = null;
  }

  onCollide(other) {
    const e = other.entity;
    if (this.harm && e?.isEnemy && e.alive && e !== this.harm.ignore) {
      const sp = Body.getSpeed(this.body);
      if (sp > this.harm.knock) this.applyHarm(e, sp);
    }
    if (this.metal && Body.getSpeed(this.body) > 1) { this.metal = false; this.world.sound('shell', this.body.position.x, this.body.position.y); }
  }

  draw(ctx) {
    const p = this.body.position;
    if (this.shadow) drawSprite(ctx, silhouette(this.img), p.x + 1, p.y + 1, this.body.angle, 0.3);
    drawSprite(ctx, this.img, p.x, p.y, this.body.angle);
  }
}
