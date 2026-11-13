import { CAT, MASK, PALETTE } from '../Config.js';
import { sprite, silhouette } from '../../engine/Assets.js';
import { angDiff, clamp, rand } from '../../engine/math.js';
import { setKg } from '../../engine/physics/Body.js';

const { Bodies, Body } = Matter;

const MAX_SWING = 1.75;      // rad either side of closed
const HINGE_FRICTION = 2.2;  // 1/s angular damping of the hinge
const MAX_HP = 9;            // a solid wooden door
const LATCH_HP = 3;          // lock strength (bullets in the lock, kicks, bat blows)

// Physical swinging door on a kinematically enforced hinge.
// Locked doors don't move until the lock is shot / kicked / blasted open. Bullets punch real holes, damage
// warps and splits the leaf, and at 0 HP it is ripped off (Destruction.detachDoor).
export default class Door {
  constructor(world, hx, hy, angle0, length, { locked = false, cells = [] } = {}) {
    this.world = world;
    this.hx = hx; this.hy = hy;
    this.a0 = angle0;
    this.len = length;
    this.img = sprite('structure/door');
    // per-door copy of the plank, gets bullet holes and splits
    this.canvas = document.createElement('canvas');
    this.canvas.width = Math.round(length);
    this.canvas.height = this.img.height;
    this.canvas.getContext('2d').drawImage(this.img, 0, 0, this.canvas.width, this.canvas.height);
    this.body = Bodies.rectangle(hx + Math.cos(angle0) * length / 2, hy + Math.sin(angle0) * length / 2, length, 5, {
      angle: angle0, frictionAir: 0, friction: 0.05, restitution: 0.2, label: 'door',
      collisionFilter: { category: CAT.DOOR, mask: MASK.DOOR },
    });
    setKg(this.body, 25);
    this.body.material = 'wood';
    this.body.entity = this;
    this.pushedByPlayer = 0;
    this.slamCooldown = 0;
    this.creakCooldown = 0;
    this.hp = MAX_HP;
    this.latch = LATCH_HP;
    this.locked = false;
    this.cells = cells;     // tiles it covers (blocked for path-finding while locked)
    this.shakeT = 0;
    this.warpSign = Math.random() < 0.5 ? -1 : 1;
    world.addBody(this.body);
    if (locked) this.lock();
  }

  get warp() { return 1 - this.hp / MAX_HP; }

  tip() {
    const a = this.body.angle;
    return { x: this.hx + Math.cos(a) * this.len, y: this.hy + Math.sin(a) * this.len };
  }

  lock() {
    this.locked = true;
    Body.setStatic(this.body, true);
    for (const i of this.cells) this.world.map.blocked[i] = 1;
  }

  // the lock gives: the door bursts open away from the hit
  unlock(px, py, dirA, power = 1) {
    if (!this.locked) return;
    this.locked = false;
    Body.setStatic(this.body, false);
    setKg(this.body, 25);
    for (const i of this.cells) this.world.map.blocked[i] = 0;
    const rx = px - this.hx, ry = py - this.hy;
    const torque = Math.sign(rx * Math.sin(dirA) - ry * Math.cos(dirA)) || 1;
    Body.setAngularVelocity(this.body, torque * 0.32 * power);
    const t = this.tip();
    this.world.particles.chips(t.x, t.y, dirA, 1.2, 14, '#c08a54', 200);
    this.world.particles.sparks(t.x, t.y, dirA, 1, 8, 260);
    this.world.sound('doorSlam', t.x, t.y);
    this.world.shake(0.25);
    this.pushedByPlayer = 0.8;
  }

  // keep the door on its hinge: hinge friction, soft end stops, creaks and slams
  constrain(dt) {
    const b = this.body;
    if (this.locked) return;
    let rel = angDiff(this.a0, b.angle);
    let av = Body.getAngularVelocity(b) * Math.max(0, 1 - HINGE_FRICTION * dt);
    const lim = MAX_SWING - this.warp * 0.25; // a warped door doesn't open as far
    if (Math.abs(rel) > lim) {
      rel = clamp(rel, -lim, lim);
      if (Math.abs(av) > 0.12 && this.slamCooldown <= 0) {
        this.world.sound('door', this.hx, this.hy, Math.min(1, Math.abs(av) * 4));
        this.slamCooldown = 0.2;
      }
      av = -av * 0.25;
    } else if (Math.abs(rel) > lim - 0.25 && Math.sign(av) === Math.sign(rel)) {
      av *= 0.85; // cushion before the stop
    }
    if (Math.abs(av) > 0.03 && Math.abs(av) < 0.12 && this.creakCooldown <= 0) {
      this.world.sound('creak', this.hx, this.hy, 0.5);
      this.creakCooldown = rand(0.6, 1.2);
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
    this.creakCooldown -= dt;
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

  // distance from the hinge along the leaf of a world point
  along(px, py) {
    const a = this.body.angle;
    return clamp((px - this.hx) * Math.cos(a) + (py - this.hy) * Math.sin(a), 0, this.len);
  }

  // kind: 'bullet' | 'melee' | 'kick'
  hit(px, py, dirA, dmg = 1, kind = 'bullet') {
    const w = this.world;
    const s = this.along(px, py);
    w.particles.chips(px, py, dirA + Math.PI, 1, 5, '#8a5a34');
    w.particles.chips(px, py, dirA, 0.6, 4, '#c08a54', 160);
    if (kind === 'bullet') {
      this.hole(s);
      w.sound('wood', px, py, 0.4);
      if (this.locked && s > this.len - 8) this.latch -= dmg * 1.5; // shooting the lock
    } else {
      w.sound('doorSlam', px, py, kind === 'kick' ? 0.8 : 1);
      w.shake(0.12);
      this.shakeT = 0.18;
      w.noise(px, py, 300);
      if (this.locked) this.latch -= dmg;
    }
    if (this.locked && this.latch <= 0) { this.unlock(px, py, dirA, kind === 'bullet' ? 0.6 : 1.3); }
    else if (!this.locked) {
      const push = kind === 'bullet' ? 0.0008 * dmg : kind === 'kick' ? 0.006 : 0.008;
      Body.applyForce(this.body, { x: px, y: py }, { x: Math.cos(dirA) * push, y: Math.sin(dirA) * push });
    }
    this.hp -= kind === 'bullet' ? dmg : dmg * 1.5;
    this.split();
    if (this.hp <= 0) w.detachDoor(this, dirA, kind === 'bullet' ? 0.9 : 1.4);
  }

  // bullet hole through the leaf
  hole(s) {
    const g = this.canvas.getContext('2d');
    const x = Math.round((s / this.len) * this.canvas.width), y = Math.round(rand(1, this.canvas.height - 2));
    g.save();
    g.globalCompositeOperation = 'source-atop';
    g.fillStyle = 'rgba(30,14,8,0.8)';
    g.fillRect(x - 1, y - 1, 3, 3);
    g.restore();
    g.clearRect(x, y, 1, 1);
  }

  // heavy damage splits the wood along its grain
  split() {
    if (this.warp < 0.4 || Math.random() > 0.5) return;
    const g = this.canvas.getContext('2d');
    const y = Math.round(rand(1, this.canvas.height - 2)), x0 = rand(0, this.canvas.width * 0.6);
    g.clearRect(x0, y, rand(4, this.canvas.width * 0.4), 1);
  }

  draw(ctx) {
    const b = this.body;
    const jx = this.shakeT > 0 ? rand(-1, 1) : 0;
    this.shakeT -= 1 / 60;
    ctx.save();
    ctx.translate(b.position.x + jx, b.position.y);
    ctx.rotate(b.angle);
    const half = this.len / 2, h = this.img.height;
    // warped door: the outer half bends away
    const bend = this.warp * 0.22 * this.warpSign;
    ctx.globalAlpha = 0.35;
    ctx.drawImage(silhouette(this.img), -half + 2, -h / 2 + 2, this.len, h);
    ctx.globalAlpha = 1;
    const cw = this.canvas.width;
    ctx.drawImage(this.canvas, 0, 0, cw / 2, h, -half, -h / 2, half, h);
    ctx.save();
    ctx.rotate(bend);
    ctx.drawImage(this.canvas, cw / 2, 0, cw / 2, h, 0, -h / 2, half, h);
    ctx.restore();
    if (this.locked) {
      // brass lock near the latch end
      ctx.fillStyle = PALETTE.ink;
      ctx.fillRect(half - 7, -2.5, 4, 5);
      ctx.fillStyle = this.latch < LATCH_HP ? '#a0622a' : PALETTE.yellow;
      ctx.fillRect(half - 6, -1.5, 2, 3);
    }
    ctx.restore();
    // hinge pin
    ctx.fillStyle = PALETTE.ink;
    ctx.fillRect(this.hx - 2, this.hy - 2, 4, 4);
  }
}

