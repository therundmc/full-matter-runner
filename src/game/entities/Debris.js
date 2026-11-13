import { CAT, MASK } from '../Config.js';
import { drawSprite, silhouette } from '../../engine/Assets.js';
import { rand, chance } from '../../engine/math.js';
import { setMaterial, scaleInertia } from '../../engine/physics/Body.js';
import { wipe } from '../fx/Bleeding.js';

const { Bodies, Body } = Matter;

const MAX_AGE = 7;
const GRAVITY = 520; // px/s² of fake height (pieces thrown up arc and land)

// how pieces drag on the floor by material: meat sticks, glass and brass skitter, rubber rolls
const MATERIAL_MU = { flesh: 1.1, glass: 0.55, brass: 0.35, rubber: 0.3, metal: 0.75, concrete: 1, wood: 0.9 };

// Any physical loose piece: gibs, shell casings, furniture fragments, glass shards, wall chunks.
// opts.harm = { kind: 'cut'|'blunt', knock, lethal, ignore } makes a fast piece dangerous for enemies.
// opts.z / opts.vz: fake height (px) and upward speed (px/s): the piece arcs through the air above its shadow,
// lands, bounces and settles; it skips floor friction while up there. opts.land: sound when it hits the floor.
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
      // small bits ignore each other: far fewer contact pairs when a room gets shredded
      collisionFilter: { category: CAT.DEBRIS, mask: opts.mask ?? (Math.max(w, h) < 6 ? MASK.DEBRIS & ~CAT.DEBRIS : MASK.DEBRIS) },
      label: 'debris',
    });
    // real-ish mass from the piece size; it flies a moment before touching the floor
    const mu = opts.mu ?? MATERIAL_MU[opts.material] ?? 0.9;
    this.z = opts.z ?? 0;
    this.vz = opts.vz ?? 0;
    // time up in the air (fake height ballistics)
    const air = this.z > 0 || this.vz > 0 ? (this.vz + Math.sqrt(this.vz * this.vz + 2 * GRAVITY * this.z)) / GRAVITY : 0;
    this.land = opts.land || null;
    setMaterial(this.body, opts.kg ?? Math.max(0.15, w * h * 0.06), mu, world.time + Math.max(opts.fly ?? 0.12, air));
    scaleInertia(this.body, 2);
    Body.setVelocity(this.body, { x: vx / 60, y: vy / 60 });
    Body.setAngularVelocity(this.body, spin);
    this.body.entity = this;
    this.body.material = opts.material ?? (opts.metal ? 'metal' : undefined);
    this.bleed = opts.bleed || 0;     // seconds leaving a blood trail
    this.spurt = opts.spurt || 0;     // seconds spurting blood
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
      // meat drips while it flies and dabs the floor it tumbles on (its wet side comes round again and again)
      if (this.z > 0) {
        this.wx = undefined;
        if (chance(0.3)) this.world.decals.speck(b.position.x + rand(-1, 1), b.position.y + rand(-1, 1), rand(0.6, 1.4));
      } else if (sp > 0.4 && Math.sin(this.age * 20 + this.size) > 0.1) wipe(this.world, this, b.position.x, b.position.y, Math.min(4, this.size * 0.4));
      else this.wx = undefined;
    }
    if (this.spurt > 0) {
      this.spurt -= dt;
      if (chance(0.6)) this.world.particles.blood(b.position.x, b.position.y, rand(0, Math.PI * 2), 0.3, 1, rand(60, 160), { z: 4 });
    }
    if (this.z > 0 || this.vz > 0) this.fall(dt);
    if (this.harm && sp > this.harm.knock) this.checkHarm(sp);
    else if (this.harm && this.age > 0.3) this.harm = null;
    if (sp < 0.06 && Math.abs(Body.getAngularVelocity(b)) < 0.01 && this.z <= 0) this.settle += dt; else this.settle = 0;
    // settled pieces become floor decals; nothing stays a physics body for more than MAX_AGE seconds
    if ((this.settle > 0.9 && this.age > 1.2) || this.age > MAX_AGE) this.world.bakeDebris(this);
  }

  // fake height: arc down, land with a thud, a small bounce or two
  fall(dt) {
    this.vz -= GRAVITY * dt;
    this.z += this.vz * dt;
    if (this.z > 0) return;
    this.z = 0;
    const b = this.body, v = Body.getVelocity(b);
    if (this.vz < -90) {
      if (this.land && this.size > 7) this.world.sound(this.land, b.position.x, b.position.y, Math.min(0.7, -this.vz / 400));
      this.vz *= -0.28;
      Body.setVelocity(b, { x: v.x * 0.75, y: v.y * 0.75 });
      Body.setAngularVelocity(b, Body.getAngularVelocity(b) * 0.6);
      b.flyUntil = this.world.time + (2 * this.vz) / GRAVITY;
    } else this.vz = 0;
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
      c.kill(a, this.harm.kind === 'cut' ? 'glass' : 'melee', this.world.player, { gore: 0.6 });
    } else if (!c.knocked) {
      c.knock(a, 'debris');
      this.world.particles.blood(c.x, c.y, a, 0.6, 10, 140);
      this.world.sound('punch', c.x, c.y, 0.7);
      if (this.harm.kind === 'cut') this.world.decals.stampBlood(c.x, c.y, 4, 4);
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
  }

  draw(ctx) {
    const p = this.body.position, z = this.z;
    // the shadow stays on the floor; the piece is drawn up there, a little bigger
    if (this.shadow) drawSprite(ctx, silhouette(this.img), p.x + 1, p.y + 1, this.body.angle, 0.3 / (1 + z * 0.03));
    drawSprite(ctx, this.img, p.x, p.y - z * 0.5, this.body.angle, 1, z > 0 ? 1 + z * 0.006 : 1);
  }
}
