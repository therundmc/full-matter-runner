import { CAT, MASK, PALETTE } from '../Config.js';
import { drawSprite, silhouette } from '../../engine/Assets.js';
import { rand, local } from '../../engine/math.js';
import { setMaterial } from '../../engine/physics/Body.js';

const { Bodies, Body } = Matter;

// Sliding dead body with a growing blood pool. Headless corpses fountain blood from the neck.
export default class Corpse {
  constructor(world, img, x, y, angle, speed, opts = {}) {
    this.world = world;
    this.img = img;
    this.body = Bodies.circle(x, y, 7, {
      frictionAir: 0.01, friction: 0.2, restitution: 0.15, label: 'corpse',
      collisionFilter: { category: CAT.CORPSE, mask: MASK.CORPSE },
    });
    setMaterial(this.body, 70, 1.1, world.time + 0.18);
    this.body.material = 'flesh';
    Body.setVelocity(this.body, { x: Math.cos(angle) * speed / 60, y: Math.sin(angle) * speed / 60 });
    Body.setAngle(this.body, angle);
    Body.setAngularVelocity(this.body, rand(-0.06, 0.06));
    this.body.entity = this;
    this.headless = !!opts.headless;
    this.fountain = this.headless ? rand(1.4, 2.4) : 0;
    this.pool = 0;
    this.poolMax = opts.pool ?? rand(11, 17);
    this.poolRate = (opts.poolRate ?? 4) * (this.headless ? 1.75 : 1); // px/s
    this.spurt = this.spurt0 = opts.spurt || 0; // seconds an opened artery keeps pumping
    this.spurtA = rand(0, Math.PI * 2);
    this.settle = 0;
    this.age = 0;
    this.dead = false;
    world.addBody(this.body);
  }

  get x() { return this.body.position.x; }
  get y() { return this.body.position.y; }

  // head end of the sprite is +x
  headPos() { return local(this.x, this.y, this.body.angle, this.img.width / 2 - 5, 0); }

  update(dt) {
    const b = this.body;
    this.age += dt;
    const head = this.headPos();
    if (Body.getSpeed(b) > 0.5) this.world.decals.stampBlood(head.x, head.y, rand(1, 2.5), 1);
    if (this.fountain > 0) {
      this.fountain -= dt;
      const pulse = Math.sin(this.age * 14) > 0.2;
      if (pulse) this.world.particles.blood(head.x, head.y, b.angle + rand(-0.5, 0.5), 0.25, 2, rand(90, 200), { z: 3 });
    }
    if (this.spurt > 0) {
      // an opened artery: weaker and weaker pulses
      this.spurt -= dt;
      if (Math.sin(this.age * 9) > 0.35) {
        this.world.particles.blood(this.x, this.y, b.angle + this.spurtA + rand(-0.12, 0.12), 0.1, 2, 50 + 190 * (this.spurt / this.spurt0), { z: 3 });
      }
    }
    if (this.pool < this.poolMax && this.age > 0.3) this.pool += dt * this.poolRate;
    if (Body.getSpeed(b) < 0.05) this.settle += dt; else this.settle = 0;
    if (this.settle > 2 && this.pool >= this.poolMax && this.fountain <= 0 && this.spurt <= 0) this.bake();
  }

  bake() {
    const head = this.headPos();
    this.world.decals.stampPool(head.x, head.y, this.pool);
    this.world.decals.bake(this.img, this.x, this.y, this.body.angle);
    this.world.removeBody(this.body);
    this.dead = true;
  }

  drawPool(ctx) {
    if (this.pool <= 0) return;
    const head = this.headPos();
    ctx.fillStyle = PALETTE.blood[3];
    ctx.beginPath();
    ctx.ellipse(head.x, head.y, this.pool, this.pool * 0.8, this.body.angle, 0, Math.PI * 2);
    ctx.fill();
  }

  draw(ctx) {
    drawSprite(ctx, silhouette(this.img), this.x + 1, this.y + 1, this.body.angle, 0.3);
    drawSprite(ctx, this.img, this.x, this.y, this.body.angle);
  }
}
