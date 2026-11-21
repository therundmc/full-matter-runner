import { CAT, MASK } from '../Config.js';
import { sprite, silhouette } from '../../engine/Assets.js';
import { angDiff, clamp, rand } from '../../engine/math.js';
import { setKg, setShapeInertia } from '../../engine/physics/Body.js';
import { leafInertia, spinOf, pushLeaf, blowOn, swing } from '../../engine/physics/Hinge.js';
import { PX_PER_M, STEP } from '../../engine/physics/Units.js';
import { LEAF } from '../world/Openings.js';
import { DOORS } from '../data/doors.js';
import { SCORING } from '../data/scoring.js';
import { flicker } from '../render/Flicker.js';

const { Bodies, Body } = Matter;

const MAX_HP = 9;            // a solid wooden door
const LATCH_HP = 3;          // lock strength (bullets in the lock, kicks, bat blows)
const LOCK_ZONE = 10;        // px from the latch end: where the lock sits
const LAMP_AT = 5;           // px from the latch end: the lock's lamp, on the lock case
const SHUT = 0.012;          // rad off shut that counts as shut, for the latch
// the closer seen from above (px): its body on the leaf's face [from, to] along it, its depth, the pinion's arm and
// the one to the shoe, the shoe screwed to the wall beside the hinge: [along the doorway (behind the pivot, over the
// jamb), out from the leaf's line to the wall's face]
const CLOSER = { body: [2, 12], depth: 3, pinion: 4, arm: [8, 9], shoe: [-7, 12] };

// Physical swinging door on a kinematically enforced hinge: (hx, hy) is the pivot, `len` the pivot-to-latch
// length, the leaf runs LEAF.back further behind the pivot (see world/Openings.js for the layout in a wall).
// It is of a kind (data/doors.js DOORS.kinds: the emergency exit, the bar's front, the toilets' swinging doors...)
// that gives it its sprite, its weight and its fittings: pushed by a man walking into it with a limited force
// (systems/Doors.js), slowed to a stop by its hinge, slammed open by kicks and blows. A closer swings it back shut,
// overshoots and settles, then latches; a swinging door's spring brings it back to the middle in a few swings. Its
// glass breaks. Locked doors (a lamp by the lock: red locked, green open) don't move until the lock is shot /
// kicked / blasted open, or a guard of the house lets himself through with his key.
// Bullets punch real holes, damage warps and splits the leaf, and at 0 HP it is ripped off (Destruction.detachDoor).
// support / strike: the wall tiles [cx, cy] carrying the hinges and receiving the latch.
export default class Door {
  constructor(world, hx, hy, angle0, length, { locked = false, cells = [], support = null, strike = null, image = null, closer, kind = null, relock = 0, inside = null } = {}) {
    this.world = world;
    this.hx = hx; this.hy = hy;
    this.a0 = angle0;
    this.len = length;
    this.back = LEAF.back;
    this.support = support;
    this.strike = strike;
    // seen from above the light comes from the top left: leaves hinged the other way round show their other face
    this.flip = Math.abs(angle0) > 3 || angle0 > 1 ? -1 : 1;
    // its kind: the level's, else a locked door's, else that of its sprite (a free leaf: a stall's...)
    const K = DOORS.kinds;
    this.kind = kind || (locked ? 'reinforced' : Object.keys(K).find((n) => K[n].sprite === image) || 'wood');
    this.spec = K[this.kind] || K.wood;
    this.img = sprite(image && !kind && this.spec.sprite !== image ? image : this.spec.sprite);
    this.canvas = this.compose(this.img, length + this.back);
    this.kg = this.spec.kg;
    this.I = leafInertia(this.kg, -this.back, length, LEAF.thick); // kg.px2 about the pivot
    // a closer (the kind's unless the level says), or a swinging door's spring hinge (a spring all the way)
    const shuts = closer ?? this.spec.closer;
    this.closer = this.spec.spring ? { ...DOORS.spring, zone: Infinity }
      : shuts ? { ...DOORS.closer, ...(shuts === true ? {} : shuts) } : null;
    // the room side (inside: a step [dx, dy] from the doorway into the room): an exit's EXIT sign, the closer's side
    this.inside = inside ? (-Math.sin(angle0) * inside[0] + Math.cos(angle0) * inside[1] >= 0 ? 1 : -1) : this.flip;
    this.glassBroken = false;
    const c = (length - this.back) / 2;
    this.body = Bodies.rectangle(hx + Math.cos(angle0) * c, hy + Math.sin(angle0) * c, length + this.back, LEAF.thick, {
      angle: angle0, frictionAir: 0, friction: 0.05, restitution: 0.2, label: 'door',
      sleepThreshold: Infinity, // never put to sleep by Matter: a closer's slow swing would be stopped dead
      collisionFilter: { category: CAT.DOOR, mask: MASK.DOOR },
    });
    this.weigh();
    this.body.material = 'wood';
    this.body.entity = this;
    this.pushedByPlayer = 0;
    this.slamCooldown = 0;
    this.hp = MAX_HP;
    this.latch = LATCH_HP;
    this.locked = false;
    this.lockable = locked; // it has a lock and its lamp
    this.keyT = 0;          // s left of a guard's key turning in it (the lamp amber)
    this.burst = false;     // its lock was burst open
    this.relock = relock;   // s shut on its latch after which it locks itself again (0: never; the lab's door)
    this.shutT = 0;
    this.latched = !this.spec.spring; // shut on its latch (a swinging door has none)
    this.hissed = false;    // the closer was heard on this way shut
    this.cells = cells;     // tiles it covers (blocked for path-finding while locked)
    this.shakeT = 0;
    this.warpSign = Math.random() < 0.5 ? -1 : 1;
    this.lastA = angle0;    // the leaf's angle at the end of the previous step (see stopAt)
    this.lastRel = 0;       // how far open it was then (the latch watches it cross shut)
    this.lampSeed = Math.random() * 10;
    world.addBody(this.body);
    if (locked) this.lock();
  }

  // its mass and its real moment of inertia on the Matter body (again when it comes loose: setStatic restores
  // Matter's own)
  weigh() {
    setKg(this.body, this.kg);
    setShapeInertia(this.body);
  }

  // per-door copy of the leaf at its real length (gets the bullet holes and splits): both ends of the sprite as
  // they are (its kind's caps), its middle repeated in between. In the sprite's own pixels (a finer sprite: `k`)
  compose(img, width) {
    const k = img.k || 1, q = 1 / k, [c0, c1] = (this.spec.caps || DOORS.caps).map((c) => Math.round(c * q));
    const cv = document.createElement('canvas');
    cv.width = Math.round(width * q);
    cv.height = img.height;
    cv.k = k;
    const g = cv.getContext('2d'), W = cv.width;
    const h = img.height, mid = Math.max(1, img.width - c0 - c1); // (a missing sprite is 8 px wide)
    for (let x = c0; x < W - c1; x += mid) {
      const w = Math.min(mid, W - c1 - x);
      g.drawImage(img, c0, 0, w, h, x, 0, w, h);
    }
    g.drawImage(img, 0, 0, c0, h, 0, 0, c0, h);
    g.drawImage(img, img.width - c1, 0, c1, h, W - c1, 0, c1, h);
    return cv;
  }

  // a place along the sprite (world px from its hinge end) on this leaf's canvas (its pixels): the hinge cap and
  // the first of the middle as they are, the latch cap moved to the leaf's end
  onCanvas(x) {
    const k = this.canvas.k || 1, sw = this.img.width * k, [c0, c1] = this.spec.caps || DOORS.caps, W = this.canvas.width * k;
    const latch = sw > c0 + c1 && x >= sw - c1; // (a missing sprite has no caps)
    return Math.round((latch ? x - sw + W : Math.min(x, W - c1)) / k);
  }

  get warp() { return 1 - this.hp / MAX_HP; }

  // how far open (rad, signed: + toward the leaf's +normal side when shut)
  get rel() { return angDiff(this.a0, this.body.angle); }

  // the side of the shut leaf (x, y) is on: 1 or -1
  sideOf(x, y) { return -(x - this.hx) * Math.sin(this.a0) + (y - this.hy) * Math.cos(this.a0) >= 0 ? 1 : -1; }

  tip() {
    const a = this.body.angle;
    return { x: this.hx + Math.cos(a) * this.len, y: this.hy + Math.sin(a) * this.len };
  }

  // the middle of the leaf
  mid() {
    const a = this.body.angle, m = this.len / 2;
    return { x: this.hx + Math.cos(a) * m, y: this.hy + Math.sin(a) * m };
  }

  // the point of the leaf's face nearest to (px, py) when it lies within `reach` of it (a hand laid on the door:
  // Character.updateDoorHand), written into out { x, y, a: the leaf's angle }; null otherwise
  touch(px, py, reach, out) {
    const rx = px - this.hx, ry = py - this.hy, far = this.len + this.back + reach;
    if (rx * rx + ry * ry > far * far) return null;
    const a = this.body.angle, c = Math.cos(a), s = Math.sin(a), half = LEAF.thick / 2;
    const along = rx * c + ry * s, across = -rx * s + ry * c, u = clamp(along, -this.back, this.len);
    if (Math.hypot(along - u, Math.max(0, Math.abs(across) - half)) > reach) return null;
    const n = Math.sign(across) * half;
    out.x = this.hx + c * u - s * n; out.y = this.hy + s * u + c * n; out.a = a;
    return out;
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
    this.keyT = 0;
    Body.setStatic(this.body, true);
    for (const i of this.cells) this.world.map.blocked[i] = 1;
  }

  // the leaf free on its hinge again
  free() {
    this.locked = false;
    Body.setStatic(this.body, false);
    this.weigh();
    for (const i of this.cells) this.world.map.blocked[i] = 0;
  }

  // a guard lets himself through with his key: hardly a sound, the lamp amber while the key turns, then green with
  // a beep; it stays unlocked behind him
  unlatch() {
    if (!this.locked) return;
    this.free();
    this.keyT = DOORS.lamp.turn;
    this.world.sound('door', this.hx, this.hy, 0.5);
  }

  // the lock gives: the door bursts open away from the hit
  unlock(px, py, dirA, power = 1) {
    if (!this.locked) return;
    this.free();
    this.burst = true;
    this.latched = false;
    const rx = px - this.hx, ry = py - this.hy;
    const torque = Math.sign(rx * Math.sin(dirA) - ry * Math.cos(dirA)) || 1;
    this.setSpin(torque * DOORS.burst * power);
    this.burstLock();
    const t = this.tip();
    this.world.particles.chips(t.x, t.y, dirA, 1.2, 14, '#c08a54', 200);
    this.world.particles.sparks(t.x, t.y, dirA, 1, 8, 260);
    this.world.sound(this.spec.steel ? 'doorBoom' : 'doorSlam', t.x, t.y);
    this.world.shake(0.25);
    this.pushedByPlayer = 0.8;
    this.world.events.emit('doorBroken', { x: t.x, y: t.y });
  }

  // its turning speed (rad/step), set with the leaf's middle going round the pivot with it
  get spin() { return Body.getAngularVelocity(this.body); }

  setSpin(av) {
    const b = this.body, h = (this.len - this.back) / 2, a = b.angle;
    Body.setAngularVelocity(b, av);
    Body.setVelocity(b, { x: -av * Math.sin(a) * h, y: av * Math.cos(a) * h });
  }

  // a man walking into it at contact c ({ nx, ny, x, y }), closing at vIn px/step, leaning with `force` N
  // (systems/Doors.js): the leaf gets what that force can give it this step; returns the speed he may keep
  pushed(c, vIn, force, dt) {
    if (this.locked) return 0;
    const K = this.spec, rel = this.rel, w0 = this.spin;
    const hold = K.friction * DOORS.push.stick + (this.latched ? DOORS.latch.hold : 0);
    const { w, keep } = pushLeaf(this.hx, this.hy, w0, this.I, c, vIn, force, dt, hold, K.friction + this.closerTorque(rel));
    // flat against its stop it goes no further: he is held
    if (Math.abs(rel) >= this.limit() - 0.02 && w * rel > 0 && Math.abs(w) >= Math.abs(w0)) return 0;
    if (w !== w0) {
      if (this.latched && K.bar) this.world.sound('pushBar', this.hx, this.hy, 0.8); // the push bar clacks it open
      this.latched = false;
      this.setSpin(w);
    }
    return keep;
  }

  // what its closer or its spring pulls it back with, rel rad open (N.m)
  closerTorque(rel) {
    const C = this.closer;
    if (!C) return 0;
    return C.zone === Infinity ? this.I / (PX_PER_M * PX_PER_M) * C.freq * C.freq * Math.abs(rel) : C.preload + C.k * Math.abs(rel);
  }

  // how far it opens either side (a warped door less)
  limit() { return DOORS.stop.swing - this.warp * DOORS.stop.warp; }

  // keep the door on its hinge: what it picked up this step taken about the hinge, its hinge's friction and its
  // closer, soft end stops that knock when it swings into them, the latch when it comes shut
  constrain(dt) {
    this.tickLamp(dt);
    this.shakeT = Math.max(0, this.shakeT - dt); // (the jitter after a blow: on the world's clock, draw)
    const b = this.body;
    if (this.locked) return;
    const S = DOORS.stop, K = this.spec;
    let rel = angDiff(this.a0, b.angle);
    // what the leaf picked up this step counts about the hinge, not about its middle: a push on the middle of the
    // leaf opens it, and one near the hinge cannot swing it the wrong way
    const h = (this.len - this.back) / 2; // pivot to the middle of the leaf
    const v = Body.getVelocity(b), along = v.y * Math.cos(b.angle) - v.x * Math.sin(b.angle);
    let av = (b.inertia * Body.getAngularVelocity(b) + b.mass * h * along) / (b.inertia + b.mass * h * h);
    // on its latch, a knock under what the latch holds leaves it shut
    if (this.latched && Math.abs(rel) < 0.02 && Math.abs(av) < spinOf(DOORS.latch.hold, this.I, dt)) { rel = 0; av = 0; }
    else this.latched = false;
    av = swing(av, rel, this.I, dt, { friction: K.friction, drag: K.drag, closer: this.closer });
    if (this.closer && !K.spring) this.hiss(av, rel);
    const lim = this.limit();
    if (Math.abs(rel) > lim) {
      rel = clamp(rel, -lim, lim);
      if (Math.abs(av) > 0.12 && this.slamCooldown <= 0) {
        this.world.sound('door', this.hx, this.hy, Math.min(1, Math.abs(av) * 4));
        this.slamCooldown = 0.2;
      }
      av = -av * S.bounce;
    } else if (Math.abs(rel) > lim - S.cushion && Math.sign(av) === Math.sign(rel)) {
      av *= 0.85; // cushion before the stop
    }
    // coming shut slowly enough, it latches (it crossed shut, or got there); a closer only once it has settled, a
    // swinging door never (a flap heard as it swings through)
    const last = this.lastRel, through = last && Math.sign(rel) !== Math.sign(last);
    if (K.spring) {
      if (through && Math.abs(av) > DOORS.spring.flap * STEP) this.world.sound('doorFlap', this.hx, this.hy, Math.min(1, Math.abs(av) * 8));
    } else if (!this.latched && last && (through || (Math.abs(rel) < (this.closer?.near ?? SHUT) && av * rel <= 0))
      && Math.abs(av) < (this.closer ? this.closer.catch : DOORS.latch.catch) * STEP) this.latchShut(av);
    if (this.latched) { rel = 0; av = 0; }
    let a = this.a0 + rel;
    // the hinge is enforced, not simulated: without this the leaf would sweep straight through whoever stands in
    // its way and throw him out the other side, into a wall at times. It stops against a body and bounces off.
    const stop = this.stopAt(a);
    if (stop) { a = stop.a; av = -av * S.stopped; }
    this.lastA = a;
    this.lastRel = angDiff(this.a0, a);
    const c = Math.cos(a), s = Math.sin(a);
    Body.setAngle(b, a);
    Body.setPosition(b, { x: this.hx + c * h, y: this.hy + s * h });
    // linear velocity consistent with rotation about the hinge
    this.setSpin(av);
    this.pushedByPlayer = Math.max(0, this.pushedByPlayer - dt);
    this.slamCooldown -= dt;
    // an electric strike: shut a while, it locks itself again (only where a level asks for it: guards path round
    // a locked door that is not the house's)
    if (this.relock && this.lockable && !this.burst && this.latched && this.keyT <= 0) {
      if ((this.shutT += dt) >= this.relock) { this.shutT = 0; this.lock(); this.world.sound('doorLatch', this.hx, this.hy, 0.8); }
    } else this.shutT = 0;
  }

  // shut on its latch: a click, or a bang when it came shut fast
  latchShut(av) {
    this.latched = true;
    this.hissed = false;
    const fast = Math.abs(av) > DOORS.latch.catch * STEP * 0.6;
    if (fast) this.world.sound(this.spec.steel ? 'doorBoom' : 'doorSlam', this.hx, this.hy, 0.5);
    else this.world.sound('doorLatch', this.hx, this.hy, 0.7);
  }

  // the closer heard once on its way shut
  hiss(av, rel) {
    if (Math.abs(rel) > 0.4 && av * rel > 0) this.hissed = false; // opened again
    if (this.hissed || av * rel >= 0 || Math.abs(av) < this.closer.hiss * STEP) return;
    this.hissed = true;
    this.world.sound('doorCloserHiss', this.hx, this.hy, 0.6);
  }

  // would the leaf, going from its last angle to `a`, sweep onto someone standing within its reach? Returns the
  // angle it stops at ({ a }), against him; null when the way is free or he was already under it
  stopAt(a) {
    let best = null;
    for (const ch of this.world.characters()) {
      if (!ch.alive || ch.vaulting || ch.knocked > 0) continue;
      const dx = ch.x - this.hx, dy = ch.y - this.hy, r = Math.hypot(dx, dy);
      if (r > this.len + ch.radius) continue;
      const at = Math.atan2(dy, dx), half = Math.asin(Math.min(1, (ch.radius + LEAF.thick / 2 - 1) / Math.max(r, 1)));
      const was = angDiff(at, this.lastA), now = angDiff(at, a);
      if (Math.abs(was) < half || (Math.abs(now) >= half && Math.sign(now) === Math.sign(was))) continue;
      // crossing the line straight away from him (was / now round the turn) is not sweeping through him: a man
      // the far side of the wall by the hinge would pull the leaf through it to him
      if (Math.abs(was - now) > Math.PI) continue;
      const to = at + Math.sign(was) * half;
      if (!best || Math.abs(angDiff(this.lastA, to)) < Math.abs(angDiff(this.lastA, best.a))) best = { a: to };
      this.slam(ch);
    }
    return best;
  }

  // a door thrown open by the player lands on a guard: he goes down
  slam(ent) {
    if (!(ent.isEnemy && ent.alive && !ent.knocked && this.pushedByPlayer > 0 && this.speedAt(ent.x, ent.y) > 1.6)) return;
    const a = Math.atan2(ent.y - this.hy, ent.x - this.hx) + Math.sign(Body.getAngularVelocity(this.body)) * Math.PI / 2;
    ent.knock(a, 'door');
    this.world.sound('doorSlam', ent.x, ent.y);
    this.world.shake(0.25);
    const S = SCORING.doorSlam;
    this.world.addScore(S.points, ent.x, ent.y, S.label);
  }

  // speed of the door surface at a given point (px/step)
  speedAt(x, y) { return Math.abs(Body.getAngularVelocity(this.body)) * Math.hypot(x - this.hx, y - this.hy); }

  onCollide(other) {
    const ent = other.entity;
    if (!ent) return;
    if (ent.isPlayer) { this.pushedByPlayer = 0.8; return; }
    this.slam(ent);
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
    if (this.glassAt(s)) this.breakGlass(px, py, dirA);
    if (kind === 'bullet') {
      this.hole(s);
      w.sound(this.spec.steel ? 'metal' : 'wood', px, py, 0.4);
      if (this.locked && s > this.len - LOCK_ZONE) this.latch -= dmg * 1.5; // shooting the lock
    } else {
      w.sound(this.spec.steel ? 'doorBoom' : 'doorSlam', px, py, kind === 'kick' ? 0.8 : 1);
      w.shake(0.12);
      this.shakeT = DOORS.jolt;
      w.noise(px, py, 300, null, 'door');
      if (this.locked) this.latch -= dmg;
    }
    if (this.latch < latch) this.dentLock();
    if (this.locked && this.latch <= 0) { this.unlock(px, py, dirA, kind === 'bullet' ? 0.6 : 1.3); }
    else if (!this.locked) {
      // a round barely turns it (a heavy one a little), a kick or a blow slams it open
      const H = DOORS.hits, J = kind === 'bullet' ? H.bullet * dmg : kind === 'kick' ? H.kick : H.melee * dmg;
      this.latched = false;
      this.setSpin(this.spin + blowOn(this.hx, this.hy, this.I, px, py, dirA, J));
    }
    this.hp -= kind === 'bullet' ? dmg : dmg * 1.5;
    this.split();
    if (this.hp <= 0) w.detachDoor(this, dirA, kind === 'bullet' ? 0.9 : 1.4);
  }

  // ---- the lamp by the lock (doors that lock only): 'locked' red, 'turning' amber, 'open' green; null: none
  lampState() {
    if (!this.lockable) return null;
    return this.locked ? 'locked' : this.keyT > 0 ? 'turning' : 'open';
  }

  // the key done turning: the lamp goes green with a beep
  tickLamp(dt) {
    if (this.keyT <= 0) return;
    this.keyT -= dt;
    if (this.keyT <= 0) this.world.sound('lockBeep', this.hx, this.hy, 0.6);
  }

  // where it is and how it glows now (render/Lighting.js): { x, y, color, k } or null
  lamp(t = this.world.time) {
    const st = this.lampState();
    if (!st) return null;
    let k = 1;
    if (st === 'locked' && this.latch < LATCH_HP) k = 0.45 + 0.4 * Math.sin(t * 18); // the lock took a hit
    else if (this.burst) k = flicker('stutter', this.lampSeed, t);                    // torn about with it
    const a = this.body.angle, along = this.len - LAMP_AT, n = -2.5 * this.flip;
    return {
      x: this.hx + Math.cos(a) * along - Math.sin(a) * n, y: this.hy + Math.sin(a) * along + Math.cos(a) * n,
      color: DOORS.lamp.colors[st], k,
    };
  }

  // the EXIT sign over an emergency exit, on its room side of the doorway: { x, y, a } (null: none)
  exitSign() {
    if (!this.spec.exit) return null;
    const E = DOORS.exit, u = (this.len - this.back) / 2, v = this.inside * E.out, a = this.a0;
    return { x: this.hx + Math.cos(a) * u - Math.sin(a) * v, y: this.hy + Math.sin(a) * u + Math.cos(a) * v, a };
  }

  // what glows on it (render/Lighting.js): the lock's lamp, the EXIT sign: [{ x, y, color, k, glow? }]
  lights(t = this.world.time) {
    const out = [], l = this.lamp(t), e = this.exitSign();
    if (l) out.push(l);
    if (e) out.push({ x: e.x, y: e.y, color: DOORS.exit.color, k: DOORS.exit.k, glow: DOORS.exit.glow });
    return out;
  }

  // ---- its glass (kinds with `glass`): a point `s` px along the leaf in its glass strip, and the glass broken
  glassAt(s) {
    const G = this.spec.glass;
    if (!G || this.glassBroken) return false;
    const k = this.canvas.k || 1, x = (s + this.back) / k;
    return x >= this.onCanvas(G[0]) - 1 && x <= this.onCanvas(G[1]) + 1;
  }

  breakGlass(px, py, dirA) {
    const G = this.spec.glass, w = this.world;
    this.glassBroken = true;
    if (this.spec.broken) {
      // the strip of the leaf painted again from its broken sprite (laid the same way: compose)
      const broken = this.compose(sprite(this.spec.broken), this.len + this.back);
      const x0 = this.onCanvas(G[0]) - 1, x1 = this.onCanvas(G[1]) + 1, g = this.canvas.getContext('2d');
      g.clearRect(x0, 0, x1 - x0 + 1, this.canvas.height);
      g.drawImage(broken, x0, 0, x1 - x0 + 1, this.canvas.height, x0, 0, x1 - x0 + 1, this.canvas.height);
    }
    w.particles.chips(px, py, dirA, 1.2, 12, '#cfe8ff', 220);
    w.sound('glass', px, py, 0.6);
    w.noise?.(px, py, 260, null, 'glass');
  }

  // bullet hole through the leaf (the canvas in its sprite's pixels: q of them a world px)
  hole(s) {
    const g = this.canvas.getContext('2d'), q = 1 / (this.canvas.k || 1);
    const x = Math.round((s + this.back) * q), y = Math.round(rand(2 * q, this.canvas.height - 3 * q));
    g.save();
    g.globalCompositeOperation = 'source-atop';
    g.fillStyle = 'rgba(30,14,8,0.8)';
    g.fillRect(x - q, y - q, 3 * q, 3 * q);
    g.restore();
    g.clearRect(x, y, q, q);
  }

  // heavy damage splits the wood along its grain
  split() {
    if (this.warp < 0.4 || Math.random() > 0.5) return;
    const g = this.canvas.getContext('2d'), q = 1 / (this.canvas.k || 1);
    const y = Math.round(rand(2 * q, this.canvas.height - 3 * q)), x0 = rand(0, this.canvas.width * 0.6);
    g.clearRect(x0, y, rand(4 * q, this.canvas.width * 0.4), q);
  }

  // a blow the lock took: dents in its case
  dentLock() {
    const g = this.canvas.getContext('2d'), cw = this.canvas.width, q = 1 / (this.canvas.k || 1);
    g.save();
    g.globalCompositeOperation = 'source-atop';
    g.fillStyle = 'rgba(20,12,28,0.75)';
    for (let k = 0; k < 2; k++) g.fillRect(cw - Math.round(rand(4, 10) * q), Math.round(rand(1, 6) * q), 2 * q, q);
    g.restore();
  }

  // the lock burst: bolt and edge torn out of the leaf, the case blackened
  burstLock() {
    const g = this.canvas.getContext('2d'), cw = this.canvas.width, h = this.canvas.height, q = 1 / (this.canvas.k || 1);
    g.save();
    g.globalCompositeOperation = 'source-atop';
    g.fillStyle = 'rgba(20,12,28,0.55)';
    g.fillRect(cw - 11 * q, 0, 11 * q, h);
    g.restore();
    g.clearRect(cw - 3 * q, 3 * q, 3 * q, 3 * q);
    g.clearRect(cw - 5 * q, 4 * q, 2 * q, q);
    g.clearRect(cw - 2 * q, Math.round(rand(1, 2)) * q, 2 * q, q);
    g.clearRect(cw - 2 * q, Math.round(rand(6, 7)) * q, 2 * q, q);
  }

  draw(ctx) {
    const b = this.body;
    const jx = this.shakeT > 0 ? rand(-1, 1) : 0;
    ctx.save();
    ctx.translate(b.position.x + jx, b.position.y);
    ctx.rotate(b.angle);
    // the canvas in its sprite's pixels (a finer skin: k world px a pixel), drawn at world size
    const cv = this.canvas, k = cv.k || 1, cw = cv.width, h = cv.height, inner = cw >> 1, outer = cw - inner;
    const H = h * k, wi = inner * k, wo = outer * k;
    const x0 = -(this.len + this.back) / 2; // hinge end of the leaf
    // shadow on the floor, toward the bottom right whatever the leaf angle
    const ca = Math.cos(b.angle), sa = Math.sin(b.angle);
    ctx.globalAlpha = 0.35;
    ctx.drawImage(silhouette(cv), x0 + 2 * (ca + sa), -H / 2 + 2 * (ca - sa), cw * k, H);
    ctx.globalAlpha = 1;
    ctx.scale(1, this.flip);
    ctx.drawImage(cv, 0, 0, inner, h, x0, -H / 2, wi, H);
    // warped door: the outer half bends away
    ctx.translate(x0 + wi, 0);
    ctx.rotate(this.warp * 0.22 * this.warpSign);
    ctx.drawImage(cv, inner, 0, outer, h, 0, -H / 2, wo, H);
    const lamp = this.lamp();
    if (lamp) {
      // the lamp on the lock case: a dark housing, its lit core (its glow: render/Lighting.js)
      const x = wo - LAMP_AT - 2;
      ctx.fillStyle = '#120a18';
      ctx.fillRect(x, -4.5, 4, 4);
      ctx.globalAlpha = 0.25 + 0.75 * clamp(lamp.k, 0, 1);
      ctx.fillStyle = lamp.color;
      ctx.fillRect(x + 1, -3.5, 2, 2);
      ctx.globalAlpha = 1;
    }
    ctx.restore();
    if (this.closer && !this.spec.spring) this.drawCloser(ctx);
    if (this.spec.exit) this.drawExit(ctx);
  }

  // the EXIT sign over an emergency exit, seen from above: a small lit green box on the lintel, its dark letters
  drawExit(ctx) {
    const e = this.exitSign(), [w, h] = DOORS.exit.size;
    ctx.save();
    ctx.translate(e.x, e.y);
    ctx.rotate(e.a);
    ctx.fillStyle = '#121018';
    ctx.fillRect(-w / 2 - 1, -h / 2 - 1, w + 2, h + 2);
    ctx.fillStyle = DOORS.exit.color;
    ctx.fillRect(-w / 2, -h / 2, w, h);
    ctx.fillStyle = '#c8ffd8';
    ctx.fillRect(-w / 2, -h / 2, w, 0.5);
    ctx.fillStyle = '#0e3a1c';
    for (let i = 0; i < 4; i++) ctx.fillRect(-w / 2 + 1 + i * 1.6, -0.5, 1, 1.5); // E X I T
    ctx.restore();
  }

  // The closer from above, on the leaf's lit face: its body near the hinge, the arm from its pinion folded to a
  // shoe on the frame head (two bars and their elbow)
  drawCloser(ctx) {
    const C = CLOSER, f = this.inside, off = f * (LEAF.thick / 2 + 1), a = this.body.angle;
    const at = (ang, u, v) => ({ x: this.hx + Math.cos(ang) * u - Math.sin(ang) * v, y: this.hy + Math.sin(ang) * u + Math.cos(ang) * v });
    const P = at(a, C.pinion, off), S = at(this.a0, C.shoe[0], f * C.shoe[1]);
    // the elbow: where the two bars meet, bent out away from the leaf
    const dx = S.x - P.x, dy = S.y - P.y, d = Math.hypot(dx, dy) || 1, [l1, l2] = C.arm;
    let E;
    if (d >= l1 + l2) E = { x: P.x + (dx / d) * l1, y: P.y + (dy / d) * l1 };
    else {
      const u = (l1 * l1 - l2 * l2 + d * d) / (2 * d), k = Math.sqrt(Math.max(0, l1 * l1 - u * u));
      const nx = -dy / d, ny = dx / d, out = (-Math.sin(a) * nx + Math.cos(a) * ny) * f >= 0 ? 1 : -1;
      E = { x: P.x + (dx / d) * u + nx * k * out, y: P.y + (dy / d) * u + ny * k * out };
    }
    ctx.save();
    // the arm: a dark outline under a lit steel bar, so it reads on any floor
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#121018';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(P.x, P.y); ctx.lineTo(E.x, E.y); ctx.lineTo(S.x, S.y);
    ctx.stroke();
    ctx.strokeStyle = '#c4c2d4';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    // the elbow's pin and the shoe: a bracket screwed to the wall
    ctx.fillStyle = '#121018';
    ctx.fillRect(Math.round(S.x) - 2, Math.round(S.y) - 2, 4, 4);
    ctx.fillStyle = '#9a98aa';
    ctx.fillRect(Math.round(S.x) - 1, Math.round(S.y) - 1, 2, 2);
    ctx.fillStyle = '#e8e6f4';
    ctx.fillRect(Math.round(E.x), Math.round(E.y), 1, 1);
    // its body: a dark steel box on the face, a lit edge
    ctx.translate(this.hx, this.hy);
    ctx.rotate(a);
    const dp = C.depth, v0 = f > 0 ? LEAF.thick / 2 : -LEAF.thick / 2 - dp;
    ctx.fillStyle = '#121018';
    ctx.fillRect(C.body[0] - 1, v0 - 1, C.body[1] - C.body[0] + 2, dp + 2);
    ctx.fillStyle = '#3a3846';
    ctx.fillRect(C.body[0], v0, C.body[1] - C.body[0], dp);
    ctx.fillStyle = '#b4b2c4';
    ctx.fillRect(C.body[0], f > 0 ? v0 + dp - 1 : v0, C.body[1] - C.body[0], 1);
    ctx.restore();
  }
}
