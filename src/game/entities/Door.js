import { CAT, MASK } from '../Config.js';
import { sprite, silhouette } from '../../engine/Assets.js';
import { angDiff, clamp, rand } from '../../engine/math.js';
import { setKg } from '../../engine/physics/Body.js';
import { LEAF } from '../world/Openings.js';

const { Bodies, Body } = Matter;

const MAX_SWING = 1.75;      // rad either side of closed
const HINGE_FRICTION = 2.2;  // 1/s angular damping of the hinge
const MAX_HP = 9;            // a solid wooden door
const LATCH_HP = 3;          // lock strength (bullets in the lock, kicks, bat blows)
const LOCK_ZONE = 10;        // px from the latch end: where the lock sits
// the leaf sprite is cut in three along its length: hinge end, middle (tiled to the leaf length), latch end
const CAP_HINGE = 8, CAP_LATCH = 12;

// Physical swinging door on a kinematically enforced hinge: (hx, hy) is the pivot, `len` the pivot-to-latch
// length, the leaf runs LEAF.back further behind the pivot (see world/Openings.js for the layout in a wall).
// Locked doors (reinforced leaf, red lock) don't move until the lock is shot / kicked / blasted open. Bullets punch
// real holes, damage warps and splits the leaf, and at 0 HP it is ripped off (Destruction.detachDoor).
// support / strike: the wall tiles [cx, cy] carrying the hinges and receiving the latch.
export default class Door {
  constructor(world, hx, hy, angle0, length, { locked = false, cells = [], support = null, strike = null } = {}) {
    this.world = world;
    this.hx = hx; this.hy = hy;
    this.a0 = angle0;
    this.len = length;
    this.back = LEAF.back;
    this.support = support;
    this.strike = strike;
    // seen from above the light comes from the top left: leaves hinged the other way round show their other face
    this.flip = Math.abs(angle0) > 3 || angle0 > 1 ? -1 : 1;
    this.img = sprite(locked ? 'structure/door_locked' : 'structure/door');
    this.canvas = this.compose(this.img, Math.round(length + this.back));
    const c = (length - this.back) / 2;
    this.body = Bodies.rectangle(hx + Math.cos(angle0) * c, hy + Math.sin(angle0) * c, length + this.back, LEAF.thick, {
      angle: angle0, frictionAir: 0, friction: 0.05, restitution: 0.2, label: 'door',
      collisionFilter: { category: CAT.DOOR, mask: MASK.DOOR },
    });
    setKg(this.body, 25);
    this.body.material = 'wood';
    this.body.entity = this;
    this.pushedByPlayer = 0;
    this.slamCooldown = 0;
    this.hp = MAX_HP;
    this.latch = LATCH_HP;
    this.locked = false;
    this.cells = cells;     // tiles it covers (blocked for path-finding while locked)
    this.shakeT = 0;
    this.warpSign = Math.random() < 0.5 ? -1 : 1;
    world.addBody(this.body);
    if (locked) this.lock();
  }

  // per-door copy of the leaf at its real length (gets the bullet holes and splits): both ends of the sprite as
  // they are, its middle repeated in between
  compose(img, width) {
    const cv = document.createElement('canvas');
    cv.width = width;
    cv.height = img.height;
    const g = cv.getContext('2d');
    const h = img.height, mid = Math.max(1, img.width - CAP_HINGE - CAP_LATCH); // (a missing sprite is 8 px wide)
    for (let x = CAP_HINGE; x < width - CAP_LATCH; x += mid) {
      const w = Math.min(mid, width - CAP_LATCH - x);
      g.drawImage(img, CAP_HINGE, 0, w, h, x, 0, w, h);
    }
    g.drawImage(img, 0, 0, CAP_HINGE, h, 0, 0, CAP_HINGE, h);
    g.drawImage(img, img.width - CAP_LATCH, 0, CAP_LATCH, h, width - CAP_LATCH, 0, CAP_LATCH, h);
    return cv;
  }

  get warp() { return 1 - this.hp / MAX_HP; }

  tip() {
    const a = this.body.angle;
    return { x: this.hx + Math.cos(a) * this.len, y: this.hy + Math.sin(a) * this.len };
  }

  // what the leaf closes off, from wall end to wall end when shut (sight and blast tests): the leaf itself plus
  // the play left around it
  span() {
    const a = this.body.angle, c = Math.cos(a), s = Math.sin(a);
    const b = this.back + LEAF.inset, e = this.len + LEAF.gap;
    return { x0: this.hx - c * b, y0: this.hy - s * b, x1: this.hx + c * e, y1: this.hy + s * e };
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
    this.burstLock();
    const t = this.tip();
    this.world.particles.chips(t.x, t.y, dirA, 1.2, 14, '#c08a54', 200);
    this.world.particles.sparks(t.x, t.y, dirA, 1, 8, 260);
    this.world.sound('doorSlam', t.x, t.y);
    this.world.shake(0.25);
    this.pushedByPlayer = 0.8;
    this.world.events.emit('doorBroken', { x: t.x, y: t.y });
  }

  // keep the door on its hinge: hinge friction, soft end stops that knock when it swings into them
  constrain(dt) {
    const b = this.body;
    if (this.locked) return;
    let rel = angDiff(this.a0, b.angle);
    // what the leaf picked up this step counts about the hinge, not about its middle: a push on the middle of the
    // leaf opens it, and one near the hinge cannot swing it the wrong way
    const h = (this.len - this.back) / 2; // pivot to the middle of the leaf
    const v = Body.getVelocity(b), along = v.y * Math.cos(b.angle) - v.x * Math.sin(b.angle);
    let av = (b.inertia * Body.getAngularVelocity(b) + b.mass * h * along) / (b.inertia + b.mass * h * h)
      * Math.max(0, 1 - HINGE_FRICTION * dt);
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
    const a = this.a0 + rel;
    const c = Math.cos(a), s = Math.sin(a);
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

  // distance from the pivot along the leaf of a world point
  along(px, py) {
    const a = this.body.angle;
    return clamp((px - this.hx) * Math.cos(a) + (py - this.hy) * Math.sin(a), -this.back, this.len);
  }

  // kind: 'bullet' | 'melee' | 'kick'
  hit(px, py, dirA, dmg = 1, kind = 'bullet') {
    const w = this.world;
    const s = this.along(px, py);
    w.particles.chips(px, py, dirA + Math.PI, 1, 5, '#8a5a34');
    w.particles.chips(px, py, dirA, 0.6, 4, '#c08a54', 160);
    const latch = this.latch;
    if (kind === 'bullet') {
      this.hole(s);
      w.sound('wood', px, py, 0.4);
      if (this.locked && s > this.len - LOCK_ZONE) this.latch -= dmg * 1.5; // shooting the lock
    } else {
      w.sound('doorSlam', px, py, kind === 'kick' ? 0.8 : 1);
      w.shake(0.12);
      this.shakeT = 0.18;
      w.noise(px, py, 300, null, 'door');
      if (this.locked) this.latch -= dmg;
    }
    if (this.latch < latch) this.dentLock();
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
    const x = Math.round(s + this.back), y = Math.round(rand(2, this.canvas.height - 3));
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
    const y = Math.round(rand(2, this.canvas.height - 3)), x0 = rand(0, this.canvas.width * 0.6);
    g.clearRect(x0, y, rand(4, this.canvas.width * 0.4), 1);
  }

  // a blow the lock took: dents in its case
  dentLock() {
    const g = this.canvas.getContext('2d'), cw = this.canvas.width;
    g.save();
    g.globalCompositeOperation = 'source-atop';
    g.fillStyle = 'rgba(20,12,28,0.75)';
    for (let k = 0; k < 2; k++) g.fillRect(cw - Math.round(rand(4, 10)), Math.round(rand(1, 6)), 2, 1);
    g.restore();
  }

  // the lock burst: bolt and edge torn out of the leaf, the case blackened
  burstLock() {
    const g = this.canvas.getContext('2d'), cw = this.canvas.width, h = this.canvas.height;
    g.save();
    g.globalCompositeOperation = 'source-atop';
    g.fillStyle = 'rgba(20,12,28,0.55)';
    g.fillRect(cw - 11, 0, 11, h);
    g.restore();
    g.clearRect(cw - 3, 3, 3, 3);
    g.clearRect(cw - 5, 4, 2, 1);
    g.clearRect(cw - 2, Math.round(rand(1, 2)), 2, 1);
    g.clearRect(cw - 2, Math.round(rand(6, 7)), 2, 1);
  }

  draw(ctx) {
    const b = this.body;
    const jx = this.shakeT > 0 ? rand(-1, 1) : 0;
    this.shakeT -= 1 / 60;
    ctx.save();
    ctx.translate(b.position.x + jx, b.position.y);
    ctx.rotate(b.angle);
    const cw = this.canvas.width, h = this.canvas.height, inner = cw >> 1, outer = cw - inner;
    const x0 = -(this.len + this.back) / 2; // hinge end of the leaf
    // shadow on the floor, toward the bottom right whatever the leaf angle
    const ca = Math.cos(b.angle), sa = Math.sin(b.angle);
    ctx.globalAlpha = 0.35;
    ctx.drawImage(silhouette(this.canvas), x0 + 2 * (ca + sa), -h / 2 + 2 * (ca - sa));
    ctx.globalAlpha = 1;
    ctx.scale(1, this.flip);
    ctx.drawImage(this.canvas, 0, 0, inner, h, x0, -h / 2, inner, h);
    // warped door: the outer half bends away
    ctx.translate(x0 + inner, 0);
    ctx.rotate(this.warp * 0.22 * this.warpSign);
    ctx.drawImage(this.canvas, inner, 0, outer, h, 0, -h / 2, outer, h);
    if (this.locked) {
      // locked: a red tell-tale on the lock case, flickering once the lock has been hit
      const lit = this.latch < LATCH_HP ? 0.45 + 0.4 * Math.sin(this.world.time * 18) : 1;
      ctx.fillStyle = `rgba(255,42,74,${lit})`;
      ctx.fillRect(outer - 6, -3.5, 2, 2);
    }
    ctx.restore();
  }
}
