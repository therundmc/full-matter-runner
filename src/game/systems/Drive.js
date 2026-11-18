// Driving the van (level 2A's chase, docs/LEVEL2.md; the lab's station 19). The player sits in it, hidden, carried at
// the driver's seat, no input of his own. The van is a dynamic Matter body: every step its velocity is set from the
// controls (CHASE in data/chase.js) after reading back what the physics really let it do, so what it runs into takes
// real momentum and a hit slows it for real.
//   along the road (+x): it keeps its cruise speed by itself, W speeds it up to `max`, S brakes it to a stop
//   across (y): A / D steer it sideways; let go, the road's pull straightens it; the nose follows the way it goes
//   SPACE: the shove, a jolt sideways toward the mouse's side of the van, once in a while
//   what it hits (contact, called by the physics before it resolves the contact): a parked car is woken and shoved,
//   a bolted thing is torn off, a pane goes (entities/Window.js), a person is run down; a wall, a building or a
//   `lasting` thing hit square on with the nose, fast: the crash that kills him
// The camera's numbers (viewHeight, cameraScale, frame) are pure; Game uses them. DOM-free but for the van it may
// make (entities/Vehicle.js).
import { TILE, CAT, MASK } from '../Config.js';
import { clamp, angDiff, rand } from '../../engine/math.js';
import { VIEW } from '../../engine/Camera.js';
import { wake, impulse, kgOf } from '../../engine/physics/Body.js';
import { Gearbox, MOTOR, squealOf } from '../../audio/Motor.js';
import { CHASE } from '../data/chase.js';
import Vehicle from '../entities/Vehicle.js';

const { Body, Sleeping } = Matter;
const SLEEP = 60; // Matter's default sleepThreshold, given back when he gets out

// ---------------------------------------------------------------- pure
// the speed along the road a step later: v px/step, held toward `cruise`; W (throttle) up to C.max, S (brake) to 0
export function speedStep(v, cruise, throttle, brake, dt, C = CHASE) {
  if (brake) return Math.max(0, v - C.brake * dt);
  const want = throttle ? C.max : cruise, rate = throttle && v < want ? C.accel : C.ease;
  return v < want ? Math.min(want, v + rate * dt) : Math.max(want, v - C.ease * dt);
}

// the speed across a step later: u px/step; steer -1..1 (A: -1, D: 1) toward steer x C.steer, nothing held: the
// road's pull takes it away
export function steerStep(u, steer, dt, C = CHASE) {
  const want = steer * C.steer, rate = steer ? C.steerRate : C.pull;
  return u < want ? Math.min(want, u + rate * dt) : Math.max(want, u - rate * dt);
}

// the nose: the way the van goes (vx along the road, vy across), at most C.heading off the road
export const headingOf = (vx, vy, C = CHASE) => clamp(Math.atan2(vy, Math.max(vx, 0.5)), -C.heading, C.heading);

// world px of view height at a speed (px/step), and the camera's scale for it (the usual view is VIEW high)
export function viewHeight(speed, C = CHASE) {
  const [lo, hi] = C.camera.view;
  return lo + (hi - lo) * clamp(speed / C.max, 0, 1);
}
export const cameraScale = (speed, C = CHASE) => VIEW / viewHeight(speed, C);

// the speed on the dial
export const kmh = (v, C = CHASE) => Math.round(v * C.kmh);

// sprite px of a vehicle's driver's seat and of the ground outside its driver's door (-y): its model's `seat` / `door`
// (VEHICLES), else CHASE's shares of its size
export function seatOf(v, C = CHASE) {
  return v.m?.seat ?? [v.w * C.seat[0], v.h * C.seat[1]];
}
export function doorOf(v, C = CHASE) {
  return v.m?.door ?? [v.w * C.door[0], -C.door[1]];
}

// Is a contact the crash? a: the van's angle, (vx, vy) its velocity, (nx, ny) the normal into what it hit
export function nosedIn(a, vx, vy, nx, ny, C = CHASE) {
  const ca = Math.cos(a), sa = Math.sin(a);
  return ca * nx + sa * ny >= Math.cos(C.crash.cone) && vx * ca + vy * sa > C.crash.speed;
}

// ---------------------------------------------------------------- the drive
export default class Drive {
  // o: the level's `chase` ({ van: [col, row], cruise, lanes, end }) or the lab's ({ exit: true }); van: the vehicle
  // he gets into (none: one of CHASE.vehicle's model is made at o.van, facing +x, already at its cruise speed)
  constructor(world, o = {}, van = null) {
    this.world = world;
    this.o = o;
    this.C = CHASE;
    this.cruise = o.cruise ?? CHASE.cruise;
    if (!van) {
      van = new Vehicle(world, o.vehicle ?? CHASE.vehicle, o.van[0] * TILE, o.van[1] * TILE, 0);
      world.props.push(van);
    }
    this.van = van;
    this.v = o.van ? this.cruise : 0; // px/step along the road
    this.u = 0;                       // px/step across it
    this.shoveT = 0;                  // s of the shove left
    this.side = 0;                    // which way it shoves (-1: -y)
    this.cool = 0;                    // s before the next shove
    this.hits = [];                   // what it ran into this step (contact), dealt with after the physics
    this.seen = new Map();            // what it hit -> when (hit.again)
    this.scrapeT = 0;
    this.stillT = 0;
    this.moved = false;
    this.dead = false;
    this.on = true;
    this.box = new Gearbox();         // its engine heard (motor)
    this.lastV = this.v;
    this.board();
  }

  get kmh() { return kmh(this.v, this.C); }
  // 0..1: the shove's bar on the HUD (1: ready)
  get ready() { return 1 - this.cool / this.C.shove.cooldown; }

  // he is in: out of the world's bodies and of `chars` (nothing sees or hits him), carried at the seat (`driving`:
  // the drive he is at; `hidden`: not drawn with the others: the car draws him sat at the wheel when it is an open
  // one, Vehicle.seatIn / draw, CharacterAnim.seatPose); the van driven from
  // now on (awake, lit, its lights following it, what it touches told to `contact`)
  board() {
    const w = this.world, p = w.player, v = this.van, b = v.body;
    wake(b);
    if (b.isSleeping) Sleeping.set(b, false);
    b.sleepThreshold = Infinity;
    this.was = { air: b.frictionAir, friction: b.friction };
    b.frictionAir = 0; // the engine holds its speed: only what it hits slows it
    b.friction = CHASE.scrape.friction; // its flanks slide along a wall (a static body's own friction is 1)
    b.collisionFilter = { ...b.collisionFilter, mask: MASK.PROP & ~CAT.CORPSE }; // it drives over the dead
    v.moving = true;
    v.lightsOut = false;
    v.driver = this;
    v.onCollide = (o, pair) => this.contact(o, pair);
    Body.setVelocity(b, { x: Math.cos(b.angle) * this.v, y: Math.sin(b.angle) * this.v });
    p.driving = this;
    p.hidden = true;
    p.vel = { x: 0, y: 0 };
    v.seatIn?.(p); // sat at the wheel: an open car carries him and draws him (entities/Vehicle.js), a closed one hides him
    w.removeBody(p.body);
    const i = w.chars.indexOf(p);
    if (i >= 0) w.chars.splice(i, 1);
    this.carry();
  }

  // the lab: he gets out by the driver's door; the van parked where it stopped
  leave() {
    const w = this.world, p = w.player, v = this.van, b = v.body;
    this.on = false;
    v.moving = false;
    v.driver = null;
    v.unseat?.();
    v.onCollide = null;
    v.brake = 0; v.steer = 0; v.bob = 0;
    b.sleepThreshold = SLEEP;
    b.frictionAir = this.was.air;
    b.friction = this.was.friction;
    b.collisionFilter = { ...b.collisionFilter, mask: MASK.PROP };
    Body.setVelocity(b, { x: 0, y: 0 });
    Body.setAngularVelocity(b, 0);
    w.physics.freezeIfHeavy(b);
    const at = v.toWorld(...doorOf(v, this.C));
    Body.setPosition(p.body, at);
    Body.setVelocity(p.body, { x: 0, y: 0 });
    p.vel = { x: 0, y: 0 };
    p.driving = null;
    p.hidden = false;
    w.addBody(p.body);
    if (!w.chars.includes(p)) w.chars.unshift(p);
    w.sound('carHit', at.x, at.y, 0.4); // the door slammed
    if (w.drive === this) w.drive = null;
  }

  // the player rides at the driver's seat
  carry() {
    const p = this.world.player, v = this.van;
    Body.setPosition(p.body, v.toWorld(...seatOf(v, this.C)));
    p.angle = v.body.angle;
  }

  // intentions: the controls turned into the van's velocity (input: engine/Input.js, aim: the mouse in the world)
  step(dt, input, aim) {
    if (!this.on) return;
    this.carry();
    if (this.dead) return;
    const w = this.world, C = this.C, v = this.van, b = v.body;
    // what the physics let it do last step: a hit slows it, a knock sideways is taken (the small bounce off what it
    // leans on is not: it goes on along it)
    const vel = Body.getVelocity(b);
    this.v = Math.min(this.v, Math.max(0, vel.x) + C.give);
    if (this.shoveT <= 0 && (Math.abs(vel.y) < Math.abs(this.u) || vel.y * this.u < 0)) {
      this.u = vel.y * this.u < 0 && Math.abs(vel.y) < C.bounce ? 0 : vel.y;
    }
    // the controls
    const throttle = input.down('KeyW'), brake = input.down('KeyS');
    const steer = (input.down('KeyD') ? 1 : 0) - (input.down('KeyA') ? 1 : 0);
    this.v = speedStep(this.v, this.cruise, throttle, brake, dt, C);
    // a van at a standstill does not go sideways; crawling (held up by what it pushes), it can still steer out
    const grip = this.v > 0.1 && !brake ? clamp(this.v / this.cruise, C.crawl, 1) : 0;
    this.cool = Math.max(0, this.cool - dt);
    if (input.hit('Space') && this.cool <= 0 && grip > 0.2) this.shove(aim);
    if (this.shoveT > 0) {
      this.shoveT -= dt;
      this.u = this.side * C.shove.v * grip;
    } else this.u = steerStep(this.u, steer * grip, dt, C);
    // the velocity set; the nose turned toward the way it really goes (a spring: a knock turns it, the road brings it
    // back; held up against a wall, it comes round along it instead of digging in)
    const want = headingOf(this.v, Math.abs(vel.y) < Math.abs(this.u) ? vel.y : this.u, C);
    Body.setVelocity(b, { x: this.v, y: this.u });
    Body.setAngularVelocity(b, angDiff(b.angle, want) * C.turn);
    b.flyUntil = w.time + C.fly;
    // how it looks: the front wheels, the brake lights, the body on its springs
    v.steer = clamp((this.u / C.steer) * 0.45, -0.5, 0.5);
    v.brake += ((brake ? 1 : 0) - v.brake) * Math.min(1, dt * 12);
    v.bob = Math.sin(w.time * 9) * 0.35 * Math.min(1, this.v / C.cruise);
    // the lab: E, or stopped once it has gone, and he gets out
    if (this.o.exit) {
      if (this.v > 1) this.moved = true;
      this.stillT = this.moved && this.v < C.exit.stop ? this.stillT + dt : 0;
      if (input.hit('KeyE') || this.stillT > C.exit.still) this.leave();
    }
  }

  // SPACE: the jolt toward the mouse's side of the van (above or below its centre line)
  shove(aim) {
    const C = this.C, v = this.van, w = this.world;
    this.side = aim && v.toSprite(aim.x, aim.y).sy < v.h / 2 ? -1 : 1;
    this.shoveT = C.shove.dur;
    this.cool = C.shove.cooldown;
    w.shake(C.shove.shake);
    w.sound('vanShove', v.x, v.y, 1);
    for (const [sx, sy] of v.m.wheels) {
      const q = v.toWorld(sx, sy);
      w.particles.smoke(q.x, q.y, 1, 3, { speed: 20, size: 4, life: 0.6 });
    }
  }

  // The physics found the van touching o (before resolving it). What gives is made to give now (a frozen car woken,
  // its share of the contact's mass put back; a bolted thing torn off and the contact dropped; a pane goes by
  // itself); the rest is dealt with after the step (react).
  contact(o, pair) {
    if (!this.on || this.dead) return;
    const v = this.van, b = v.body, e = o.entity, C = this.C, w = this.world;
    const vel = Body.getVelocity(b), ov = o.isStatic ? { x: 0, y: 0 } : Body.getVelocity(o);
    let { x: nx, y: ny } = pair.collision.normal;
    if ((vel.x - ov.x) * nx + (vel.y - ov.y) * ny < 0) { nx = -nx; ny = -ny; }
    const c = pair.collision.supports?.[0] || o.position;
    const h = { o, e, nx, ny, x: c.x, y: c.y, vx: vel.x, vy: vel.y, a: b.angle, kind: 'solid' };
    const fast = Math.hypot(vel.x - ov.x, vel.y - ov.y);
    if (e?.isVehicle) {
      h.kind = 'car';
      this.loosen(o, pair);
      e.onCollide ??= (o2, pair2) => this.knock(o, o2, pair2); // what it is shoved into goes too
    } else if (e && (e.isPlayer || e.isEnemy || e.isCivilian)) h.kind = 'person';
    else if (e?.def && (e.dead || e.dying)) h.kind = 'gives';
    else if (e?.def && !e.def.lasting) {
      h.kind = 'thing';
      if ((e.def.static || o.frozen) && !e.tipped && fast > C.hit.tear) {
        pair.isActive = false; // it goes: the van is not stopped by it
        e.break(Math.atan2(vel.y, vel.x), C.hit.power);
        h.kind = 'torn';
      } else this.loosen(o, pair);
    } else if (e && !e.def) h.kind = 'gives'; // a window, a door: their own business
    this.hits.push(h);
  }

  // a frozen body in a contact being resolved becomes a dynamic one at once, the contact told its mass
  loosen(o, pair) {
    if (o.frozen) {
      wake(o);
      pair.inverseMass = pair.bodyA.inverseMass + pair.bodyB.inverseMass;
    }
    if (o.isSleeping) Sleeping.set(o, false);
  }

  // a car the van shoved (b) runs into o: a frozen car or thing there is shoved on in its turn
  knock(b, o, pair) {
    if (!this.on || o === this.van.body || !o.frozen) return;
    const v = Body.getVelocity(b);
    if (Math.hypot(v.x, v.y) < this.C.hit.chain) return;
    this.loosen(o, pair);
    o.flyUntil = this.world.time + this.C.hit.fly;
  }

  // after the physics: what the van ran into this step
  after(dt) {
    if (!this.on) return;
    const w = this.world;
    for (const h of this.hits) this.react(h);
    this.hits.length = 0;
    if (!this.dead) this.scrape(dt);
    this.carry();
    // the end of the road: the level is over (the results)
    const end = this.o.end;
    if (end && !this.dead && !w.exited && this.van.x >= end * TILE) {
      w.cleared = true;
      w.exited = true;
      w.game?.onExit?.();
    }
  }

  react(h) {
    const w = this.world, C = this.C, v = this.van, e = h.e, t = w.time;
    if (this.dead) return;
    const square = nosedIn(h.a, h.vx, h.vy, h.nx, h.ny, C);
    if (h.kind === 'solid') {
      if (square && !w.player.invulnerable) { this.crash(h); return; }
      w.sound('carHit', h.x, h.y, 0.5);
      w.particles.sparks(h.x, h.y, Math.atan2(-h.ny, -h.nx), 1, 8, 260);
      return;
    }
    const key = e || h.o;
    if (t - (this.seen.get(key) ?? -Infinity) < C.hit.again) return;
    this.seen.set(key, t);
    const a = Math.atan2(h.vy, h.vx), speed = Math.hypot(h.vx, h.vy);
    if (h.kind === 'car') {
      // shoved for real (the physics); its alarm, a dent, sparks; hit square on and fast, the van loses most of it
      h.o.flyUntil = t + C.hit.fly;
      e.hit(0, h.x, h.y, a, 1, 'blunt');
      w.sound('carHit', h.x, h.y, 1);
      w.particles.sparks(h.x, h.y, Math.atan2(-h.ny, -h.nx), 1, 10, 320);
      w.shake(C.hit.shake);
      if (square) this.v = Math.min(this.v, (h.vx * Math.cos(h.a) + h.vy * Math.sin(h.a)) * C.hit.keep);
    } else if (h.kind === 'person') {
      if (!e.alive || speed < C.run) return;
      const before = w.corpses.length, side = v.toSprite(e.x, e.y).sy < v.h / 2 ? -1 : 1, throwA = a + side * 0.5;
      e.kill(throwA, 'vehicle', v);
      for (const corpse of w.corpses.slice(before)) {
        for (const part of corpse.parts || [{ body: corpse.body }]) {
          impulse(part.body, throwA, kgOf(part.body) * speed * C.throw * rand(0.8, 1.2), rand(-0.3, 0.3), 14);
          part.body.flyUntil = t + 0.25;
        }
      }
      return;
    } else if (h.kind === 'torn') w.shake(C.hit.shake * 0.5);
    this.v *= 1 - C.hit.loss;
  }

  // a flank grinding along a wall or a car: sparks and the grind, every so often while it lasts
  scrape(dt) {
    const w = this.world, C = this.C.scrape, b = this.van.body;
    if ((this.scrapeT -= dt) > 0) return;
    for (const pair of w.physics.activePairs()) {
      if (pair.bodyA !== b && pair.bodyB !== b) continue;
      const o = pair.bodyA === b ? pair.bodyB : pair.bodyA;
      if (!(o.isStatic || o.entity?.isVehicle) || o.entity?.def?.hung) continue;
      const c = pair.collision.supports?.[0];
      if (!c || this.v < 1.5) continue;
      w.particles.sparks(c.x, c.y, Math.PI + b.angle, 0.7, C.sparks, 240);
      w.sound('vanScrape', c.x, c.y, C.vol);
      this.scrapeT = C.every;
      return;
    }
  }

  // nose-on into what does not give: the front crumples, glass and sparks, it stops dead, and he is dead
  crash(h) {
    const w = this.world, C = this.C, v = this.van, p = w.player, back = h.a + Math.PI;
    this.dead = true;
    for (let i = 0; i < C.crash.dents; i++) {
      const q = v.toWorld(v.w - 3, v.h * (0.15 + (0.7 * i) / Math.max(1, C.crash.dents - 1)));
      v.hit(0, q.x, q.y, h.a, 1, 'blunt');
    }
    v.breakLamp(0, back);
    v.breakLamp(1, back);
    v.alarm = 0;
    const nose = v.toWorld(v.w, v.h / 2);
    w.particles.sparks(nose.x, nose.y, back, 1.3, 26, 340);
    w.particles.glass(nose.x, nose.y, back, 1.2, 24, 220);
    w.sound('vanCrash', nose.x, nose.y, 1);
    w.shake(C.crash.shake);
    this.v = 0; this.u = 0;
    Body.setVelocity(v.body, { x: 0, y: 0 });
    Body.setAngularVelocity(v.body, 0);
    if (!p.alive) return;
    p.alive = false; // inside the van: no body thrown, nothing out of it
    w.onKill(p, 'crash', v, { crash: true });
  }

  // where the camera looks (viewW: world px across the view): ahead of the van by `lead` of the view's width at
  // cruise speed (and by what the camera trails its target, `lag` s of the way it goes), its y drawn toward the
  // middle of the lanes
  frame(viewW) {
    const C = this.C.camera, v = this.van, vel = Body.getVelocity(v.body), k = clamp(this.v / this.cruise, 0, 1.25);
    const lanes = this.o.lanes, mid = lanes ? (lanes.reduce((s, r) => s + r, 0) / lanes.length) * TILE : v.y;
    return { x: v.x + vel.x * 60 * C.lag + viewW * C.lead * k, y: v.y + (mid - v.y) * C.road };
  }

  // its engine and tyres this step (audio/Motor.js; World hands it to Audio.motor): the gearbox on its real speed,
  // the throttle as held, the tyres squealing with the slip between the nose and the way it goes, and at a shove
  motor(dt) {
    if (!this.on || this.dead) return null;
    const v = this.van, sp = this.v / this.C.max, dv = this.v - this.lastV;
    const throttle = dv > 1e-4 ? 1 : dv < -1e-4 ? 0 : 0.5;
    const box = this.box.step(sp, throttle, false, dt);
    this.lastV = this.v;
    const slip = Math.atan2(this.u, Math.max(this.v, 0.5)) - v.body.angle;
    return {
      revs: box.revs, load: box.load, road: sp, x: v.x, y: v.y,
      squeal: squealOf(slip, sp, this.shoveT > 0 ? 1 : 0),
      pops: box.shifted > 0 ? MOTOR.pops.shift : 0,
    };
  }
}

// the lab: a van that can be driven offers its driver's door to E (systems/Uses.js)
export function driveSpot(world, van) {
  const [dx, dy] = doorOf(van);
  return {
    get x() { return van.toWorld(dx, dy).x; },
    get y() { return van.toWorld(dx, dy).y; },
    r: 30, label: 'DRIVE', kind: 'drive',
    ok: () => !world.drive && !van.exploded && !van.dead,
    use: () => { world.drive = new Drive(world, { exit: true }, van); },
  };
}
