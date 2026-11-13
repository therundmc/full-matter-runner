import { CAT, MASK } from '../core/Config.js';
import { sprite, silhouette } from '../core/Assets.js';
import { angDiff, clamp } from '../core/math.js';
import { setKg } from '../core/Physics.js';

const { Bodies, Body } = Matter;
const MAX_SWING = 1.75;

// Physical swinging door. The hinge is enforced kinematically every step (rock solid, no constraint stretch).
export default class Door {
  constructor(world, hx, hy, angle0, length) {
    this.world = world;
    this.hx = hx; this.hy = hy;
    this.a0 = angle0;
    this.len = length;
    this.img = sprite('structure/door');
    this.body = Bodies.rectangle(hx + Math.cos(angle0) * length / 2, hy + Math.sin(angle0) * length / 2, length, 5, {
      angle: angle0, frictionAir: 0.07, friction: 0.05, restitution: 0.2, label: 'door',
      collisionFilter: { category: CAT.DOOR, mask: MASK.DOOR },
    });
    setKg(this.body, 25);
    this.body.entity = this;
    this.pushedByPlayer = 0;
    this.slamCooldown = 0;
    this.hp = 6;
    world.addBody(this.body);
  }

  tip() {
    const a = this.body.angle;
    return { x: this.hx + Math.cos(a) * this.len, y: this.hy + Math.sin(a) * this.len };
  }

  // keep body pinned on its hinge, clamp the swing
  constrain(dt) {
    const b = this.body;
    let rel = angDiff(this.a0, b.angle);
    let av = Body.getAngularVelocity(b);
    if (Math.abs(rel) > MAX_SWING) {
      rel = clamp(rel, -MAX_SWING, MAX_SWING);
      if (Math.abs(av) > 0.12 && this.slamCooldown <= 0) {
        this.world.sound('door', this.hx, this.hy, 0.6);
        this.slamCooldown = 0.2;
      }
      av = -av * 0.3;
    }
    const a = this.a0 + rel;
    const c = Math.cos(a), s = Math.sin(a), h = this.len / 2;
    Body.setAngle(b, a);
    Body.setPosition(b, { x: this.hx + c * h, y: this.hy + s * h });
    Body.setAngularVelocity(b, av);
    // linear velocity consistent with rotation about the hinge
    Body.setVelocity(b, { x: -av * s * h, y: av * c * h });
    this.pushedByPlayer = Math.max(0, this.pushedByPlayer - dt);
    this.slamCooldown -= dt;
  }

  // speed of the door surface at a given point (px/step)
  speedAt(x, y) { return Math.abs(Body.getAngularVelocity(this.body)) * Math.hypot(x - this.hx, y - this.hy); }

  onCollide(other) {
    const ent = other.entity;
    if (!ent) return;
    if (ent.isPlayer) { this.pushedByPlayer = 0.8; return; }
    if (ent.isEnemy && ent.alive && !ent.knocked && this.pushedByPlayer > 0 && this.speedAt(ent.x, ent.y) > 1.6) {
      const a = Math.atan2(ent.y - this.hy, ent.x - this.hx) + Math.sign(Body.getAngularVelocity(this.body)) * Math.PI / 2;
      ent.knock(a, 'door');
      this.world.sound('doorSlam', ent.x, ent.y);
      this.world.shake(0.25);
      this.world.addScore(300, ent.x, ent.y, 'DOOR SLAM');
    }
  }

  // bullet / melee impact: swings, splinters, and eventually rips off its hinges
  hit(px, py, dirA, dmg = 1) {
    Body.applyForce(this.body, { x: px, y: py }, { x: Math.cos(dirA) * 0.0008 * dmg, y: Math.sin(dirA) * 0.0008 * dmg });
    this.world.particles.chips(px, py, dirA + Math.PI, 1, 6, '#8a5a34');
    this.world.particles.chips(px, py, dirA, 0.6, 4, '#c08a54', 160);
    this.world.sound('wood', px, py, 0.4);
    this.hp -= dmg;
    if (this.hp <= 0) this.world.detachDoor(this, dirA, 0.9);
  }

  draw(ctx) {
    const b = this.body;
    ctx.save();
    ctx.translate(b.position.x, b.position.y);
    ctx.rotate(b.angle);
    ctx.globalAlpha = 0.35;
    ctx.drawImage(silhouette(this.img), -this.len / 2 + 2, -this.img.height / 2 + 2, this.len, this.img.height);
    ctx.globalAlpha = 1;
    ctx.drawImage(this.img, -this.len / 2, -this.img.height / 2, this.len, this.img.height);
    ctx.restore();
    // hinge pin
    ctx.fillStyle = '#140c1c';
    ctx.fillRect(this.hx - 2, this.hy - 2, 4, 4);
  }
}

