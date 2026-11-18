// Driving the van (level 2A's chase, docs/LEVEL2.md; the lab's station 19). The player sits in it, hidden, carried at
// the driver's seat; his own input is the gun out of the window (systems/CarGun.js). The van is a dynamic Matter body: every step its velocity is set from the
// controls (CHASE in data/chase.js) after reading back what the physics really let it do, so what it runs into takes
// real momentum and a hit slows it for real.
//   along the road (+x): it keeps its cruise speed by itself, W speeds it up to `max` (the last of it heavier), S
//   brakes it to a stop
//   across (y): A / D steer it sideways; let go, the road's pull straightens it. The nose is on a spring toward the
//   way it goes (yawStep: it turns in a little late, swings a little past, wags once coming back); the steering held
//   hard at speed, the rear steps out (slipStep: the slide, its smoke, rubber and squeal)
//   the body on its springs (looks only: Vehicle `squat` / `roll` / `lift`): it sits back as it pulls, dives on the
//   brakes and on a hit, rolls out of a bend, bounces on what it hits, on a kerb, on the road
//   SPACE: the shove, a jolt sideways toward the mouse's side of the van, once in a while
//   what it hits (contact, called by the physics before it resolves the contact): a parked car is woken and shoved,
//   a bolted thing is torn off (a sensor from then on: it never holds the car up while it falls apart), a loose light
//   one is flung ahead and aside by hand (fling), a pane goes (entities/Window.js), a person is run down; it drives
//   over the dead and over debris; a wall, a building or a `lasting` thing (the lorry) hit square on with the nose,
//   fast: the crash that kills him (a corner only clipped: a jolt, onNose)
//   what its speed does (fx): tyre smoke and rubber on the road, spray, pigeons and people frightened ahead, awnings
//   and parasols (`canopy`) torn down as it passes under, dust off its rear wheels, a sheet or leaves whipped up in
//   its wake, streaks of air past it (`wind`: render/PursuitArt.js drawChaseWind)
//   the gun lying on the passenger seat (Vehicle `gun`; the level's `chase.arms.seat`, the lab's car that has one): taken
//   in a short beat as he sets off (grab: the car rolls on by itself, the controls and the gun his only once it is
//   done; CharacterAnim grabPose draws it, `shot` names the camera's); a retry starts him with it in hand (skipGrab)
// The camera's numbers (view, frame, buzz) are Game's to use. DOM-free but for the van it may
// make (entities/Vehicle.js). Its jolts are told on the world's 'ride' event ({ beat }: systems/Rumble.js feels them).
import { TILE, CAT, MASK } from '../Config.js';
import { clamp, angDiff, rand, chance } from '../../engine/math.js';
import { wake, impulse, kgOf } from '../../engine/physics/Body.js';
import { Gearbox, MOTOR, squealOf } from '../../audio/Motor.js';
import { CHASE } from '../data/chase.js';
import { SEAT } from '../data/feel.js';
import { FLOATS } from '../data/destruction.js';
import Vehicle from '../entities/Vehicle.js';
import CarGun from './CarGun.js';

const { Body, Sleeping } = Matter;
const SLEEP = 60; // Matter's default sleepThreshold, given back when he gets out

// ---------------------------------------------------------------- pure
// the speed along the road a step later: v px/step, held toward `cruise`; W (throttle) up to C.max, S (brake) to 0
// (W: hard up to the cruise speed, C.over a second past it: the weight of it)
export function speedStep(v, cruise, throttle, brake, dt, C = CHASE) {
  if (brake) return Math.max(0, v - C.brake * dt);
  const want = throttle ? C.max : cruise;
  if (v >= want) return Math.max(want, v - C.ease * dt);
  const rate = !throttle ? C.ease : v < cruise ? C.accel : C.over ?? C.accel;
  return Math.min(want, v + rate * dt);
}

// the speed across a step later: u px/step; steer -1..1 (A: -1, D: 1) toward steer x C.steer, nothing held: the
// road's pull takes it away (pull: px/step a second; after a shove, its own)
export function steerStep(u, steer, dt, C = CHASE, pull = C.pull) {
  const want = steer * C.steer, rate = steer ? C.steerRate : pull;
  return u < want ? Math.min(want, u + rate * dt) : Math.max(want, u - rate * dt);
}

// the way the van goes (vx along the road, vy across), at most C.heading off the road: what its nose is sprung to
export const headingOf = (vx, vy, C = CHASE) => clamp(Math.atan2(vy, Math.max(vx, 0.5)), -C.heading, C.heading);

// The nose a step later: its turning speed (rad/s) from its angle, the speed it turns at now (rad/s) and the way it
// is sprung to (C.yaw: an under-damped spring, so it lags, overshoots a little and wags once)
export function yawStep(angle, turning, want, dt, C = CHASE) {
  return turning + (angDiff(angle, want) * C.yaw.k - turning * C.yaw.d) * dt;
}

// The rear stepping out a step later: slip rad the nose is turned further into the bend than the way it goes. steer
// -1..1 as held, u / v px/step across / along. Held hard and fast it grows to C.slide.out (flat out), else it is
// given back
export function slipStep(slip, steer, u, v, dt, C = CHASE) {
  const S = C.slide, hard = !!steer && u * steer >= S.at * C.steer && v > S.from;
  const want = hard ? Math.sign(steer) * S.out * clamp((v - S.from) / (C.max - S.from), 0, 1) : 0;
  const rate = (S.out / (hard ? S.in : S.back)) * dt;
  return slip < want ? Math.min(want, slip + rate) : Math.max(want, slip - rate);
}

// a spring a step later: [x, its speed] toward `want` (k: 1/s2, d: 1/s). The body on its wheels (C.body)
export function springStep(x, vel, want, k, d, dt) {
  vel += ((want - x) * k - vel * d) * dt;
  return [x + vel * dt, vel];
}

// what the body's springs are pushed to: [squat px (+: sat back on the rear wheels; -: the nose down), roll px (+:
// toward +y)] for ax / ay px/step gained a second along / across and u px/step held across: it sits back as it
// pulls, dives on the brakes, rolls out of the bend
export function bodyLean(ax, ay, u, C = CHASE) {
  const B = C.body;
  return [clamp(ax * B.pitch, -B.most, B.most), clamp(-(ay * B.roll + u * B.lean), -B.most, B.most)];
}

// how far behind the middle of the view the car is held, as a share of the view's width, at v px/step (`cruise`: the
// segment's): in proportion up to the cruise speed, `more` further flat out: the road opens ahead with the speed
export function leadOf(v, cruise, C = CHASE) {
  const K = C.camera;
  return K.lead * clamp(v / cruise, 0, 1) + K.more * clamp((v - cruise) / Math.max(0.01, C.max - cruise), 0, 1);
}

// the road's rumble (world px of the camera's jolts): none up to the cruise speed, all of it flat out
export const rumbleOf = (v, cruise, C = CHASE) => C.camera.rumble * clamp((v - cruise) / Math.max(0.01, C.max - cruise), 0, 1);

// the speed on the dial
export const kmh = (v, C = CHASE) => Math.round(v * C.kmh);

// Are the tyres letting go (smoke, rubber left on the road)? u: px/step across, v: along, braking: S held, shoving:
// in a shove. 0: no; else how hard, up to 1
export function skidOf(u, v, braking, shoving, C = CHASE) {
  const F = C.fx;
  if (v < F.from) return 0;
  if (shoving) return 1;
  if (braking) return F.brake;
  const k = Math.abs(u) / C.steer;
  return k >= F.slide ? clamp(k, 0, 1) * F.steer : 0;
}

// how hard a thing torn off the kerb is thrown (Prop.break's power), by the speed it was hit at (px/step)
export const tearPower = (speed, C = CHASE) => clamp(C.hit.power * (speed / C.cruise), C.hit.power * 0.6, C.hit.most);

// The card that closes a chase not finished yet (the level's `chase.next`; Game state 'continued'), t s after the
// end of its road: { black: 0..1 the picture going dark, title / name: 0..1 its two lines coming up, skip: a key may
// pass it, over: it is done }
export function finishView(t, F = CHASE.finish) {
  return {
    black: clamp(t / F.fade, 0, 1), title: clamp((t - F.title) / F.rise, 0, 1), name: clamp((t - F.name) / F.rise, 0, 1),
    skip: t >= F.skipAfter, over: t >= F.hold,
  };
}

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

// Did it take it on the nose, or only clip it with a corner? The share of the car's width (its middle at y, h wide)
// that what it hit covers (from lo to hi across the road): under `corner` of it is a clip, a jolt and sparks, not
// the crash
export const onNose = (lo, hi, y, h, C = CHASE) => (Math.min(hi, y + h / 2) - Math.max(lo, y - h / 2)) / h >= C.crash.corner;

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
    this.braking = false;             // S held this step
    this.ruts = null;                 // where its tyres were a step ago, while they let go (rubber on the road)
    this.fxT = 0;                     // s before it frightens what is ahead again
    this.canopies = null;             // the awnings and parasols it can tear down (looked up once)
    this.lastV = this.v;
    this.was2 = { v: this.v, u: 0 };  // its speeds a step ago (what pushes the body on its springs)
    this.slip = 0;                    // rad the rear has stepped out (slipStep)
    this.shoved = false;              // coming back from a shove (the sideways speed given back faster)
    this.body = { pitch: 0, roll: 0, lift: 0 }; // the springs' speeds (px/s)
    this.roadT = 0;                   // s before the road throws the body up again
    this.ground = null;               // what its front wheels were on a step ago (a kerb crossed: a bump)
    this.wind = [];                   // streaks of air past it: { x, y, len, vx px/s, t, life, a }
    this.wakeT = 1;                   // s before its wake whips something up again
    this.board();
    this.gun = new CarGun(world, van, seatOf(van, CHASE)); // his gun out of the window (mouse, left click, R)
    this.grab = null;                 // the beat of taking the gun off the passenger seat: { t, arms, took, racked }
    this.stash = undefined;           // the lab: what was in his hand before he took the seat's gun (given back at leave)
    // the lab's car with a gun on its seat: he takes it every time he gets in
    const arms = o.arms ?? (o.exit && van.gun ? { weapon: van.m.gun[3], seat: true } : null);
    if (arms) this.arm(arms);
    // water standing in the gutter (the level's `chase.water`: [col, row, r px])
    for (const [c, r, rad] of o.water || []) world.liquids?.feed(c * TILE, r * TILE, Math.PI * rad * rad * CHASE.fx.water, 'water', rad);
  }

  // what he sets off with (the level's `chase.arms`: { weapon, mag, spare, seat }): the gun in his hand, its magazine,
  // spare rounds in his pools; seat: it lies on the car's passenger seat and he takes it in the beat (grab)
  arm(arms) {
    const p = this.world.player;
    if (arms.seat && this.van.gun) {
      if (this.o.exit) this.stash = p.weapon;
      p.weapon = null; // (his hands free for it)
      this.grab = { t: 0, arms, took: false, racked: false };
      if (p.riding) p.riding.grab = 0;
      return;
    }
    const { weapon, mag, spare = 0 } = arms;
    p.setWeapon(weapon, mag);
    if (spare) p.addAmmo(p.def.ammo, spare);
  }

  // he is taking the gun off the seat: the controls and the gun are not his yet
  get grabbing() { return !!this.grab && this.grab.t < SEAT.grab.dur; }

  // a retry: no beat, the seat's gun already in his hand
  skipGrab() {
    const g = this.grab;
    if (!g) return;
    this.grab = null;
    if (this.world.player.riding) this.world.player.riding.grab = null;
    if (!g.took) this.take(g);
  }

  // the gun off the seat and into his hand
  take(g) {
    g.took = true;
    this.van.gun = false;
    this.arm({ ...g.arms, seat: false });
  }

  // the beat, a step: the gun taken, racked, handed over to the door's hand; the camera back out after it
  grabStep(dt) {
    const g = this.grab, G = SEAT.grab, w = this.world, p = w.player;
    g.t += dt;
    if (p.riding) p.riding.grab = g.t < G.dur ? g.t : null;
    if (!g.took && g.t >= G.take) {
      this.take(g);
      w.sound('seatGun', p.x, p.y, 0.7); // placeholder (assets/sound/PLACEHOLDERS.md)
    }
    if (!g.racked && g.t >= G.pull) {
      g.racked = true;
      w.sound('rack', p.x, p.y, 0.8, { weapon: p.weapon?.type });
    }
    if (g.t >= G.dur + G.out) this.grab = null;
  }

  // the camera's shot (Game.stagedShot; SHOTS in data/staging.js): pushed in on him while he takes the gun, then
  // back out
  shot() {
    const g = this.grab, p = this.world.player, vel = Body.getVelocity(this.van.body), lag = this.C.camera.lag * 60;
    if (!g || !this.on) return null;
    // (where he is, plus what the camera trails its target by: frame's own lead)
    return { name: g.t < SEAT.grab.hand[0] ? 'grab' : 'grabOut', at: { x: p.x + vel.x * lag, y: p.y + vel.y * lag } };
  }

  get kmh() { return kmh(this.v, this.C); }
  // world px of height the picture shows while he is at the wheel (Game.setView)
  get view() { return this.o.view ?? this.C.camera.view; }
  // world px of the camera's rumble now (Game hands it to the camera)
  buzz() { return this.dead ? 0 : rumbleOf(this.v, this.cruise, this.C); }
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
    // it drives over the dead, and over what is already in pieces (a loose bit weighs nothing, yet the physics
    // shares an overlap equally: one landing under it threw two tons sideways)
    b.collisionFilter = { ...b.collisionFilter, mask: MASK.PROP & ~CAT.CORPSE & ~CAT.DEBRIS & ~CAT.ITEM };
    v.moving = true;
    v.lightsOut = false;
    v.driver = this;
    this.was.armoured = v.armoured;
    if (this.o.van) v.armoured = true; // the chase: no health bar, his car is never shot up, burnt or blown (docs/LEVEL2.md)
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
    v.armoured = this.was.armoured;
    v.unseat?.();
    v.onCollide = null;
    if (this.stash !== undefined) {
      // the lab: the seat's gun put back on the seat (taken again next time), what he had back in his hand
      v.gun = true;
      p.weapon = this.stash;
      this.stash = undefined;
      this.grab = null;
    }
    v.brake = 0; v.steer = 0; v.bob = 0; v.squat = 0; v.roll = 0; v.lift = 0;
    this.wind.length = 0;
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
    if (this.dead) { if (this.coasting) this.coastStep(dt); return; }
    // taking the gun off the seat: the car rolls on by itself, nothing fires (a click now is lost)
    const busy = this.grabbing;
    if (this.grab) this.grabStep(dt);
    if (!busy) this.gun.step(dt, input, aim);
    const w = this.world, C = this.C, v = this.van, b = v.body;
    // what the physics let it do last step: a hit slows it, a knock sideways is taken (the small bounce off what it
    // leans on is not: it goes on along it)
    const vel = Body.getVelocity(b);
    this.v = Math.min(this.v, Math.max(0, vel.x) + C.give);
    if (this.shoveT <= 0 && (Math.abs(vel.y) < Math.abs(this.u) || vel.y * this.u < 0)) {
      this.u = vel.y * this.u < 0 && Math.abs(vel.y) < C.bounce ? 0 : vel.y;
    }
    // the controls
    const throttle = !busy && input.down('KeyW'), brake = !busy && input.down('KeyS');
    const steer = busy ? 0 : (input.down('KeyD') ? 1 : 0) - (input.down('KeyA') ? 1 : 0);
    this.braking = brake;
    this.v = speedStep(this.v, this.cruise, throttle, brake, dt, C);
    // a van at a standstill does not go sideways; crawling (held up by what it pushes), it can still steer out
    const grip = this.v > 0.1 && !brake ? clamp(this.v / this.cruise, C.crawl, 1) : 0;
    this.cool = Math.max(0, this.cool - dt);
    if (input.hit('Space') && !busy && this.cool <= 0 && grip > 0.2) this.shove(aim);
    if (this.shoveT > 0) {
      this.shoveT -= dt;
      this.u = this.side * C.shove.v * grip;
    } else {
      // (out of a shove the sideways speed is given back fast, until the wheel is his again)
      if (this.shoved && (steer || Math.abs(this.u) < 1)) this.shoved = false;
      this.u = steerStep(this.u, steer * grip, dt, C, this.shoved ? C.shove.back : C.pull);
    }
    // the velocity set; the nose sprung toward the way it really goes, and past it while the rear is out (a knock
    // turns it, the road brings it back; held up against a wall, it comes round along it instead of digging in)
    const Y = C.yaw, across = Math.abs(vel.y) < Math.abs(this.u) ? vel.y : this.u;
    this.slip = slipStep(this.slip, steer * grip, this.u, this.v, dt, C);
    const want = clamp(headingOf(this.v, across, C) + this.slip, -Y.most, Y.most);
    let turning = yawStep(b.angle, Body.getAngularVelocity(b) * 60, want, dt, C);
    Body.setVelocity(b, { x: this.v, y: this.u });
    if (Math.abs(angDiff(b.angle, want)) < Y.snap && Math.abs(turning) < Y.snapV) {
      // as good as there: dead on it (a car a hair off straight is resampled crooked, every pixel of it)
      Body.setAngle(b, want);
      turning = 0;
    }
    Body.setAngularVelocity(b, turning / 60);
    b.flyUntil = w.time + C.fly;
    // how it looks: the front wheels, the brake lights, the body on its springs
    v.steer = clamp((this.u / C.steer) * 0.45, -0.5, 0.5);
    v.brake += ((brake ? 1 : 0) - v.brake) * Math.min(1, dt * 12);
    this.throttle = throttle ? 1 : brake ? 0 : 0.5;
    this.springs(dt);
    // the lab: E, or stopped once it has gone, and he gets out
    if (this.o.exit && !busy) {
      if (this.v > 1) this.moved = true;
      this.stillT = this.moved && this.v < C.exit.stop ? this.stillT + dt : 0;
      if (input.hit('KeyE') || this.stillT > C.exit.still) this.leave();
    }
  }

  // The body on its springs this step (looks only): what the speeds did since the last one pushes it (a hit that
  // took its speed dives it like the brakes), the road throws it up now and then, a front wheel onto or off the
  // sidewalk too
  springs(dt) {
    const w = this.world, C = this.C, B = C.body, L = B.lift, v = this.van, S = this.body, was = this.was2;
    const [squat, roll] = bodyLean((this.v - was.v) / dt, (this.u - was.u) / dt, this.u, C);
    was.v = this.v; was.u = this.u;
    [v.squat, S.pitch] = springStep(v.squat || 0, S.pitch, squat, B.k, B.d, dt);
    [v.roll, S.roll] = springStep(v.roll || 0, S.roll, roll, B.k, B.d, dt);
    if ((this.roadT -= dt) <= 0) {
      this.roadT = rand(L.road[0], L.road[1]);
      if (this.v > C.fx.from) S.lift += L.road[2] * (this.v / C.max) * rand(0.4, 1);
    }
    // the kerb: a front wheel on another ground than a step ago (the road, or not)
    const map = w.map;
    if (map?.floor && this.v > C.hit.tear) {
      const on = [2, 3].map((i) => {
        const q = v.toWorld(...v.m.wheels[i]), f = map.floor[Math.floor(q.y / TILE) * map.w + Math.floor(q.x / TILE)];
        return !!f && f.startsWith('asphalt');
      });
      if (this.ground && (on[0] !== this.ground[0] || on[1] !== this.ground[1])) {
        this.bump('kerb');
        w.events.emit('ride', { beat: 'kerb', x: v.x, y: v.y });
      }
      this.ground = on;
    }
    [v.lift, S.lift] = springStep(v.lift || 0, S.lift, 0, L.k, L.d, dt);
    v.lift = clamp(v.lift, -L.most, L.most);
    v.bob = 0;
  }

  // the body thrown up on its springs (C.body.lift: 'hit', 'torn', 'kerb', 'shove'), k of it
  bump(kind, k = 1) { this.body.lift += this.C.body.lift[kind] * k; }

  // He is dead at the wheel (the told shot): nobody drives. The car runs on, losing its speed, drifting to a side,
  // until it stops or meets something
  coast() {
    this.dead = true;
    this.coasting = true;
    this.side = this.van.y > (this.o.lanes ? this.o.lanes[this.o.lanes.length - 1] * TILE : this.van.y) ? -1 : 1;
  }

  coastStep(dt) {
    const C = this.C, K = C.coast, b = this.van.body, vel = Body.getVelocity(b);
    this.v = Math.max(0, Math.min(this.v, Math.max(0, vel.x) + C.give) - K.slow * dt);
    if (this.v <= 0.05) { this.coasting = false; Body.setVelocity(b, { x: 0, y: 0 }); Body.setAngularVelocity(b, 0); return; }
    this.u = steerStep(this.u, this.side * K.drift, dt, C);
    Body.setVelocity(b, { x: this.v, y: this.u });
    Body.setAngularVelocity(b, yawStep(b.angle, Body.getAngularVelocity(b) * 60, headingOf(this.v, this.u, C), dt, C) / 60);
    b.flyUntil = this.world.time + C.fly;
    this.springs(dt);
    this.van.steer = clamp((this.u / C.steer) * 0.45, -0.5, 0.5);
  }

  // SPACE: the jolt toward the mouse's side of the van (above or below its centre line)
  shove(aim) {
    const C = this.C, v = this.van, w = this.world;
    this.side = aim && v.toSprite(aim.x, aim.y).sy < v.h / 2 ? -1 : 1;
    this.shoveT = C.shove.dur;
    this.shoved = true;
    this.cool = C.shove.cooldown;
    // the jolt: the picture thrown that way, the body rolled over its wheels and thrown up, smoke off every tyre
    w.shake(C.shove.shake);
    w.camera?.push(0, this.side * C.shove.push);
    this.body.roll -= this.side * C.shove.roll;
    this.bump('shove');
    w.events.emit('ride', { beat: 'shove', x: v.x, y: v.y, side: this.side });
    w.sound('vanShove', v.x, v.y, 1);
    for (const [sx, sy] of v.m.wheels) {
      const q = v.toWorld(sx, sy);
      w.particles.smoke(q.x, q.y, C.shove.smoke, 3, { speed: 34, size: 5, life: 0.7 });
    }
  }

  // The physics found the van touching o (before resolving it). What gives is made to give now (a frozen car woken,
  // its share of the contact's mass put back; a bolted thing torn off and the contact dropped; a pane goes by
  // itself); the rest is dealt with after the step (react).
  contact(o, pair) {
    if (!this.on || (this.dead && !this.coasting)) return;
    const v = this.van, b = v.body, e = o.entity, C = this.C, w = this.world;
    const vel = Body.getVelocity(b), ov = o.isStatic ? { x: 0, y: 0 } : Body.getVelocity(o);
    let { x: nx, y: ny } = pair.collision.normal;
    if ((vel.x - ov.x) * nx + (vel.y - ov.y) * ny < 0) { nx = -nx; ny = -ny; }
    const c = pair.collision.supports?.[0] || o.position;
    const h = { o, e, nx, ny, x: c.x, y: c.y, vx: vel.x, vy: vel.y, a: b.angle, kind: 'solid', mid: b.position.y, lo: o.bounds.min.y, hi: o.bounds.max.y };
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
        // it goes: the van is not stopped by it, now (this pair) nor while it falls apart (a sensor from here on; a
        // pair keeps the `isSensor` it was made with, so it is told too)
        pair.isActive = false;
        pair.isSensor = o.isSensor = true;
        e.break(Math.atan2(vel.y, vel.x) + rand(-0.3, 0.3), tearPower(fast, C));
        h.kind = 'torn';
      } else if (!o.isStatic && !o.frozen && kgOf(o) <= C.hit.fling.kg && fast > C.hit.tear) this.fling(o, pair, vel);
      else this.loosen(o, pair);
    } else if (e && !e.def) h.kind = 'gives'; // a window, a door: their own business
    this.hits.push(h);
  }

  // A light loose thing in its way (a bin, a chair, a crate, a bag) is thrown, by hand: on ahead of the car and out
  // to the side it was hit on, turning, off the floor a moment. The contact itself is dropped (the physics would
  // share the overlap equally between a chair and two tons of car, and hold it up).
  fling(o, pair, vel) {
    const F = this.C.hit.fling, v = this.van, side = v.toSprite(o.position.x, o.position.y).sy < v.h / 2 ? -1 : 1;
    const sp = Math.hypot(vel.x, vel.y) * rand(...F.v), a = Math.atan2(vel.y, vel.x) + side * rand(...F.side);
    pair.isActive = false;
    pair.isSensor = true;
    if (o.isSleeping) Sleeping.set(o, false);
    Body.setVelocity(o, { x: Math.cos(a) * sp, y: Math.sin(a) * sp });
    Body.setAngularVelocity(o, rand(-F.spin, F.spin));
    o.flyUntil = this.world.time + rand(...F.fly);
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
    this.lost = false;
    for (const h of this.hits) this.react(h);
    this.hits.length = 0;
    if (!this.dead) { this.scrape(dt); this.fx(dt); }
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
    if (this.dead && !this.coasting) return;
    const square = nosedIn(h.a, h.vx, h.vy, h.nx, h.ny, C);
    if (h.kind === 'solid') {
      if (square && onNose(h.lo, h.hi, h.mid, v.h, C) && !w.player.invulnerable) { this.crash(h); return; }
      if (square) { this.v = Math.min(this.v, C.crash.clip); w.shake(C.hit.shake); this.bump('hit'); w.events.emit('ride', { beat: 'clip', x: h.x, y: h.y }); } // a corner clipped: most of the speed gone
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
      this.bump('hit');
      w.events.emit('ride', { beat: 'hit', x: h.x, y: h.y });
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
    } else if (h.kind === 'torn') { w.shake(C.hit.shake * 0.5); this.bump('torn'); w.events.emit('ride', { beat: 'torn', x: h.x, y: h.y }); } else if (h.kind === 'thing') this.bump('torn', 0.6);
    if (e?.def && (h.kind === 'torn' || h.kind === 'thing')) {
      // what it was made of thrown on ahead, sheets of paper off it, sparks off steel
      const F = C.fx.debris;
      w.particles.chips(h.x, h.y, a, 0.8, F.chips, e.def.chips, speed * F.speed);
      if (e.def.material === 'metal') w.particles.sparks(h.x, h.y, a, 0.9, F.sparks, 300);
      if (e.def.glass) w.particles.glass(h.x, h.y, a, 0.9, F.glass, speed * F.speed);
      w.papers?.drop(h.x, h.y, F.papers[0], a, F.papers[1]);
    }
    // what it cost him: once a step at most, and nothing for what was already broken (the bits of it in the air)
    if (h.kind !== 'gives' && !this.lost) { this.lost = true; this.v *= 1 - C.hit.loss; }
  }

  // what its speed does around it: tyres letting go (white smoke, rubber left on the road) on a shove, hard steering
  // or the brakes; spray out of standing water; pigeons, cats and people ahead frightened; an awning or a parasol it
  // drives under torn down
  fx(dt) {
    const w = this.world, C = this.C, F = C.fx, v = this.van, b = v.body, back = b.angle + Math.PI;
    const wheels = v.m.wheels.map(([sx, sy]) => v.toWorld(sx, sy)), rear = wheels.slice(0, 2);
    const skid = skidOf(this.u, this.v, this.braking, this.shoveT > 0, C);
    const on = skid > 0 ? (this.braking ? wheels : rear) : null;
    if (on) {
      for (const r of on) if (chance(F.smoke[0] * skid)) w.particles.smoke(r.x, r.y, 1, 3, { speed: 26, size: F.smoke[1], life: F.smoke[2] });
      if (this.ruts?.length === on.length) {
        const from = this.ruts, xs = [...on, ...from].map((r) => r.x), M = F.marks;
        w.decals?.paint?.((g) => {
          g.strokeStyle = `rgba(${M.color}, ${M.alpha * skid})`;
          g.lineWidth = M.w;
          g.lineCap = 'round';
          on.forEach((r, i) => { g.beginPath(); g.moveTo(from[i].x, from[i].y); g.lineTo(r.x, r.y); g.stroke(); });
        }, 'floor', Math.min(...xs) - M.w, Math.max(...xs) + M.w);
      } else w.sound('tyreSkid', v.x, v.y, 0.6 * skid);
    }
    this.ruts = on;
    // standing water under a wheel: spray thrown out to the side and back, a ring left on it
    if (w.liquids && this.v > F.from) {
      for (const r of wheels) {
        const wet = chance(F.spray[0]) && w.liquids.at(r.x, r.y), splash = wet && w.liquids.cfg.kinds[wet.kind]?.splash;
        if (!splash) continue;
        w.particles.drops(r.x, r.y, back + (chance(0.5) ? 1 : -1) * 0.9, 0.7, F.spray[1], splash, F.spray[2] * (this.v / C.cruise), 5, false);
        w.liquids.ripple(r.x, r.y);
        if (chance(0.15)) w.sound('waterSpray', r.x, r.y, 0.5);
      }
    }
    if ((this.fxT -= dt) <= 0 && this.v > F.from) {
      this.fxT = F.scare.every;
      const x = v.x + this.v * 60 * F.scare.lead;
      w.critters?.scare(x, v.y, F.scare.r, F.scare.r);
      w.ambient?.panicAround(x, v.y, F.scare.people, 'scream');
    }
    this.air(dt, rear);
    // awnings and parasols: under one, fast, it goes
    this.canopies ??= w.props.filter((p) => p.def?.canopy);
    if (this.v > C.hit.tear) {
      for (const p of this.canopies) {
        if (p.dead || p.dying || Math.abs(p.x - v.x) > 140 || Math.abs(p.y - v.y) > 140) continue;
        const s = v.toSprite(p.x, p.y), hw = (p.def.w ?? p.W) / 2, hh = (p.def.h ?? p.H) / 2;
        const far = Math.abs(Math.sin(p.body.angle)) > 0.7 ? [hh, hw] : [hw, hh];
        if (s.sx < -far[0] || s.sx > v.w + far[0] || s.sy < -far[1] || s.sy > v.h + far[1]) continue;
        p.break(b.angle + rand(-0.4, 0.4), tearPower(this.v, C));
        w.sound('awningRip', p.x, p.y, 0.8);
        w.shake(C.hit.shake * 0.4);
      }
    }
  }

  // the air it moves at speed: dust off the rear wheels, something light whipped up in its wake now and then, and
  // the streaks of air past it (kept here, drawn by render/PursuitArt.js)
  air(dt, rear) {
    const w = this.world, C = this.C, F = C.fx, v = this.van, W = F.wind;
    if (this.v > F.dust.from) {
      for (const r of rear) {
        if (chance(F.dust.chance)) w.particles.dust(r.x, r.y, 1, 3, '#8a8494', { speed: 16, size: F.dust.puff[0], alpha: F.dust.puff[1], life: F.dust.puff[2], vx: -this.v * 14 });
      }
    }
    if (this.v > F.wake.from && (this.wakeT -= dt) <= 0) {
      this.wakeT = rand(...F.wake.every);
      const q = v.toWorld(rand(-10, 20), rand(4, v.h - 4)), sp = this.v * 60 * F.wake.v;
      if (chance(F.wake.paper) && w.papers) w.papers.drop(q.x, q.y, 1, v.body.angle + rand(-0.5, 0.5), sp);
      else w.particles.floaters(q.x, q.y, FLOATS.leaf, F.wake.leaves, v.body.angle, 0.9, sp * 0.6, 7);
    }
    const k = clamp((this.v - W.from) / (C.max - W.from), 0, 1), L = this.wind;
    for (let i = L.length - 1; i >= 0; i--) {
      const s = L[i];
      s.t += dt;
      s.x += s.vx * dt;
      if (s.t >= s.life) L.splice(i, 1);
    }
    if (k > 0 && L.length < W.n * k && chance(k * 0.9)) {
      const side = chance(0.5) ? -1 : 1;
      L.push({
        x: v.x + rand(-W.back, W.ahead), y: Math.round(v.y + side * rand(...W.band)) + 0.5, len: Math.round(W.len[0] + (W.len[1] - W.len[0]) * k * rand(0.4, 1)),
        vx: -this.v * 60 * rand(...W.v), t: 0, life: rand(...W.life), a: W.alpha * rand(0.5, 1) * (0.4 + 0.6 * k),
      });
    }
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
      w.events.emit('ride', { beat: 'scrape', x: c.x, y: c.y });
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
    w.events.emit('ride', { beat: 'crash', x: nose.x, y: nose.y });
    this.v = 0; this.u = 0;
    Body.setVelocity(v.body, { x: 0, y: 0 });
    Body.setAngularVelocity(v.body, 0);
    if (!p.alive) return;
    p.alive = false; // inside the van: no body thrown, nothing out of it
    w.onKill(p, 'crash', v, { crash: true });
  }

  // where the camera looks (viewW: world px across the view): ahead of the van by what its speed asks (leadOf: the
  // car sits back and the road opens ahead the faster it goes) and by what the camera trails its target (`lag` s of
  // the way it goes), its y drawn toward the street's middle (the level's `chase.mid` row; else the lanes')
  frame(viewW) {
    const C = this.C.camera, v = this.van, vel = Body.getVelocity(v.body);
    const lanes = this.o.lanes, row = this.o.mid ?? (lanes ? lanes.reduce((s, r) => s + r, 0) / lanes.length : null);
    const mid = row === null ? v.y : row * TILE;
    return { x: v.x + vel.x * 60 * C.lag + viewW * leadOf(this.v, this.cruise, this.C), y: v.y + (mid - v.y) * C.road };
  }

  // its engine and tyres this step (audio/Motor.js; World hands it to Audio.motor): the gearbox on its real speed,
  // the throttle as held, the tyres squealing with the slip between the nose and the way it goes, and at a shove
  motor(dt) {
    if (!this.on || this.dead) return null;
    // (the throttle as held: W floors it, the brakes shut it; a hit that takes its speed lifts it too)
    const v = this.van, sp = this.v / this.C.max, dv = this.v - this.lastV;
    const throttle = dv < -1e-4 ? 0 : dv > 1e-4 ? 1 : this.throttle ?? 0.5;
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
