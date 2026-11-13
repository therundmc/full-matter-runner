import { CAT, MASK } from '../Config.js';
import { drawSprite, silhouette } from '../../engine/Assets.js';
import { rand, local } from '../../engine/math.js';
import { setMaterial } from '../../engine/physics/Body.js';
import { startBleeding, bleedOut, wipe } from '../fx/Bleeding.js';
import { poolArt } from '../render/BloodArt.js';

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
    startBleeding(this, opts);
    this.settle = 0;
    this.age = 0;
    this.dead = false;
    world.addBody(this.body);
  }

  get x() { return this.body.position.x; }
  get y() { return this.body.position.y; }

  // head end of the sprite is +x
  headPos() { return local(this.x, this.y, this.body.angle, this.img.width / 2 - 5, 0); }

  // centre of the blood pool: where it started under the head, or the head while the body still slides
  poolAt() { return this.poolPos || this.headPos(); }

  update(dt) {
    const b = this.body;
    this.age += dt;
    const head = this.headPos(), sp = Body.getSpeed(b);
    if (sp > 0.5) wipe(this.world, this, head.x, head.y, 4);
    bleedOut(this, dt, { x: head.x, y: head.y, angle: b.angle }, { x: this.x, y: this.y, angle: b.angle }, head, sp < 0.3);
    if (sp < 0.05) this.settle += dt; else this.settle = 0;
    if (this.settle > 2 && this.pool >= this.poolMax && this.fountain <= 0 && this.spurt <= 0) this.bake();
  }

  bake() {
    const at = this.poolAt();
    this.world.decals.bakePool(this, at.x, at.y, this.pool);
    this.world.decals.bake(this.img, this.x, this.y, this.body.angle, 1, true);
    this.world.removeBody(this.body);
    this.dead = true;
  }

  drawPool(ctx) {
    if (this.pool < 1) return;
    const at = this.poolAt();
    poolArt(this).draw(ctx, at.x, at.y, this.pool);
  }

  draw(ctx) {
    drawSprite(ctx, silhouette(this.img), this.x + 1, this.y + 1, this.body.angle, 0.3);
    drawSprite(ctx, this.img, this.x, this.y, this.body.angle);
  }
}
