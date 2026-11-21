// Driving the car (level 2A's chase, docs/LEVEL2.md; the lab's station 19). The player sits in it, hidden, carried at
// the driver's seat; his own input is the gun out of the car (systems/CarGun.js). The car is a dynamic Matter body:
// every step its velocity is set from the controls (CHASE in data/chase.js) after reading back what the physics
// really let it do, so what it runs into takes real momentum and a hit slows it for real.
//   along the road (+x): it runs at its cruise speed by itself: no throttle, no brake (the user's call, 2026-11-19);
//   a hit slows it, it comes back up by itself
//   across (y): the road runs along +x, so across it is up / down on the picture: W (Z on AZERTY) / S steer it up /
//   down, A / D too (A up, D down), the pad's left stick by its y; let go, the road's pull straightens it. The nose
//   is on a spring toward the way it goes (yawStep: it turns in a little late, a few degrees at most, no wag)
//   SPACE: the shove, THE move: a lunge of a lane toward the side he aims at; what it does to a pursuer it meets is
//   systems/Pursuit.js's (`lunge` tells it one is on)
//   THE ROUTE (systems/Route.js; the level's `chase.legs` and `chase.bends`): the road is straight legs along +x, each
//   with its own lanes, middle, cruise and view; what is said above of "the road" is the leg he is on. At a bend's
//   `at` the wheel is the script's (the car follows the bend's line, braking into its turns, its tail out, the gun
//   still his; no shove: chase/shared.js bendMove), until it hands him to the next leg on its lane (CHASE.bend)
// The rest is in systems/drive/, each part working on this drive's state:
//   rules.js     pure: the speeds, the wheel, the nose's spring, the slide and the grip, the springs, a hit's sums
//   opening.js   the gun he sets off with, the opening on his cigarette (systems/LastDrag.js), the seat's gun's beat
//   camera.js    the camera at the wheel (frame, lock: Game's), its offsets through a bend and between two legs
//   contacts.js  what it runs into (contact, called by the physics; react after it), the crash
//   fronts.js    the building fronts it is held off, never stalled for good (unstick, boxed)
//   looks.js     what its speed does around it (smoke, rubber, spray, wind, the grind), the body on its springs
// What it shares with the pursuers' cars: systems/chase/shared.js. DOM-free but for the car it may make
// (entities/Vehicle.js). Its jolts are told on the world's 'ride' event ({ beat }: systems/Rumble.js feels them).
import { TILE, MASK } from '../Config.js';
import { clamp, angDiff } from '../../engine/math.js';
import { wake } from '../../engine/physics/Body.js';
import { Gearbox, MOTOR, squealOf } from '../../audio/Motor.js';
import { CHASE } from '../data/chase.js';
import { SEAT } from '../data/feel.js';
import Vehicle from '../entities/Vehicle.js';
import CarGun from './CarGun.js';
import LastDrag from './LastDrag.js';
import { routeOf, legAt, along, enterBend, nearestLane } from './Route.js';
import { bendFloor, bendMove, bendWheel, driveBody, roundCorners } from './chase/shared.js';
import { doorOf, gripOf, headingOf, kmh, seatOf, slideStep, speedStep, steerOf, steerStep, yawStep } from './drive/rules.js';
import { arm, grabStep, launch, shot, skipGrab, stand } from './drive/opening.js';
import { camStep, frame, lock, normalOff, trackY } from './drive/camera.js';
import { clearLanes, contact, flankStep, knock, react } from './drive/contacts.js';
import { offFronts, unstick } from './drive/fronts.js';
import { fx, scrape, springs } from './drive/looks.js';

// (Game's import, until it takes it from there: the card that closes a chase not finished yet)
export { finishView } from '../ui/Continued.js';

const { Body, Sleeping } = Matter;

export default class Drive {
  // o: the level's `chase` ({ van: [col, row], cruise, lanes, end, legs, bends }) or the lab's ({ exit: true }, a
  // route of its own maybe: { legs, bends }); car: the vehicle he gets into (none: one of CHASE.vehicle's model is
  // made at o.van, facing +x, already at its cruise speed). A restart at a checkpoint (systems/Checkpoints.js) puts
  // it at o.start [col, row] instead, going o.speed px/step (the route is still measured from o.van)
  constructor(world, o = {}, car = null) {
    this.world = world;
    this.o = o;
    this.C = CHASE;
    this.route = routeOf(o);          // its legs and bends (systems/Route.js)
    this.legI = 0;                    // the leg he is on (in a bend: the one it hands him to)
    this.bend = null;                 // a bend under way: Route.enterBend's state ({ b, p, v, slip, ... }), its pose
    this.camOff = null;               // the camera's offset from the car while it is not the leg's own framing (frame)
    this.camY = null;                 // the view's middle across while it is eased to a leg's framing or follows him (acrossStep)
    this.viewW = null;                // world px across the view, as last framed
    this.far = 0;                     // px along the route, the most so far (progress: never back)
    const at = o.start ?? o.van;
    if (car || at) this.legI = legAt(this.route.legs, car ? car.x : at[0] * TILE);
    this.cruise = this.leg.cruise;
    if (!car) {
      car = new Vehicle(world, o.vehicle ?? CHASE.vehicle, at[0] * TILE, at[1] * TILE, 0);
      world.props.push(car);
    }
    this.car = car;
    this.bendI = this.route.bends.findIndex((b) => b.x > car.x); // the next bend on his way (-1: none)
    this.v = o.van ? o.speed ?? this.cruise : 0; // px/step along the road
    this.u = 0;                       // px/step across it
    this.shoveT = 0;                  // s of the shove left
    this.shoves = 0;                  // how many it has thrown (a shove lands once on a pursuer: lunge)
    this.side = 0;                    // which way it shoves (-1: -y)
    this.cool = 0;                    // s before the next shove
    this.hits = [];                   // what it ran into this step (contact), dealt with after the physics
    this.seen = new Map();            // what it hit -> when (hit.again)
    this.scrapeT = 0;
    this.dead = false;
    this.on = true;
    this.box = new Gearbox();         // its engine heard (motor)
    this.ruts = null;                 // where its tyres were a step ago, while they let go (rubber on the road)
    this.fxT = 0;                     // s before it frightens what is ahead again
    this.canopies = null;             // the awnings and parasols it can tear down (looked up once)
    this.lastV = this.v;
    this.was2 = { v: this.v, u: 0 };  // its speeds a step ago (what pushes the body on its springs)
    this.shoved = false;              // coming back from a shove (the sideways speed given back faster)
    this.body = { pitch: 0, roll: 0, lift: 0 }; // the springs' speeds (px/s)
    this.roadT = 0;                   // s before the road throws the body up again
    this.ground = null;               // what its front wheels were on a step ago (a kerb crossed: a bump)
    this.wind = [];                   // streaks of air past it: { x, y, len, vx px/s, t, life, a }
    this.wakeT = 1;                   // s before its wake whips something up again
    this.stallT = 0;                  // s it has crawled (unstick)
    this.freeing = null;              // stalled: { side: the way it eases itself out, y: where it was, t: s since }
    this.nosing = null;               // crawling nose-on into the lorry: { t, held: s, best: px left } (boxed)
    this.knocked = new Map();         // the cars it shoved -> the handler it gave them (knock; taken back at leave)
    this.grind = null;                // held off the building fronts as he steers into them: where its flank is
    this.slip = 0;                    // rad its rear is out (the slide: slideStep), and how fast it goes
    this.slipV = 0;
    this.lockT = 0;                   // s the wheel has been held over the same way
    this.lockS = 0;
    this.surge = 0;                   // share of the view's width the car sits forward on the picture, slowed (frame)
    this.buzzT = 0;                   // s before the shell shivers again at speed (springs)
    this.asides = new Map();          // the parked cars it shoved aside -> { t, at: when, side, o } (aside, clearLanes)
    this.onRam = ({ side }) => { if (this.on && !this.dead) this.slipV += (side || 1) * CHASE.slide.rammed; };
    world.events?.on?.('pursuerRam', this.onRam); // (a swipe landing on his flank kicks his tail out)
    this.board();
    this.gun = new CarGun(world, car, seatOf(car, CHASE)); // his gun out of the car (the aim, the left click)
    this.grab = null;                 // the beat of taking the gun off the passenger seat: { t, arms, took, racked }
    this.stash = undefined;           // the lab: what was in his hand before he took the seat's gun (given back at leave)
    // the lab's car with a gun on its seat: he takes it every time he gets in
    const arms = o.arms ?? (o.exit && car.gun ? { weapon: car.m.gun[3], seat: true } : null);
    if (arms) arm(this, arms);
    // the opening on his cigarette (the level's `chase.intro`): the car stands until it is flicked out
    this.drag = o.intro === 'drag' && this.grab ? new LastDrag(world, car, seatOf(car, CHASE)) : null;
    this.launchT = 0;                 // s its rear tyres still spin as it pulls away (launch)
    this.standing = !!this.drag;      // the car stands until the opening is over (or skipped)
    this.hudT = Infinity;             // s since the HUD began to come in (launch)
    if (this.drag) {
      this.v = this.lastV = this.was2.v = 0;
      car.lightsOut = true;
      world.clockFrom = Infinity; // the run's clock waits for the launch (World.runTime)
      Body.setVelocity(car.body, { x: 0, y: 0 });
    }
    // water standing in the gutter (the level's `chase.water`: [col, row, r px])
    for (const [c, r, rad] of o.water || []) world.liquids?.feed(c * TILE, r * TILE, Math.PI * rad * rad * CHASE.fx.water, 'water', rad);
  }

  // (outside the chase's code his car is still called the van: Game's ride numbers)
  get van() { return this.car; }

  // he is finishing his cigarette or taking the gun off the seat: the controls and the gun are not his yet
  get grabbing() { return !!this.drag?.on || (!!this.grab && this.grab.t < SEAT.grab.dur); }

  // 0..1: how much of the HUD shows: none during the opening, faded in over CHASE.intro.hud s as it pulls away
  get hud() { return this.standing ? 0 : clamp(this.hudT / this.C.intro.hud, 0, 1); }
  get kmh() { return kmh(this.v, this.C); }
  // world px of height the picture shows while he is at the wheel (Game.setView): his leg's (in a bend: the one it
  // left, the cut to the next leg's comes out of it)
  get view() { return this.route.legs[this.bend ? this.bend.b.from : this.legI].view ?? this.C.camera.view; }
  // the leg he is on (systems/Route.js legsOf: lanes, mid, cruise, view, kerbs, across)
  get leg() { return this.route.legs[this.legI]; }
  // px along the route now (Route.along: through a bend, along its line)
  get along() { return along(this.route, this.car.x, this.bend?.b, this.bend?.p, this.C.bend); }
  // how far down the route he is: { s: px from the start (never back), total: px to the end }, or null (no end)
  get progress() { return this.route.total ? { s: this.far, total: this.route.total } : null; }
  // 0..1: the shove's bar on the HUD (1: ready)
  get ready() { return 1 - this.cool / this.C.shove.cooldown; }
  // the shove under way, as what it meets is told (systems/Pursuit.js): its number while the car is still thrown
  // sideways by it (the lunge, and the way back until the wheel is his again), else 0
  get lunge() { return this.shoveT > 0 || this.shoved ? this.shoves : 0; }
  // the street's middle line (world px y: his leg's `mid` row, else its lanes'), or null (the lab)
  get street() {
    const row = this.leg.mid;
    return row === null ? null : row * TILE;
  }

  // the camera's shot while the opening or the grab plays (Game.stagedShot: drive/opening.js), where the view is drawn
  // from for a point it looks at, and where it looks (Game.updateCamera: drive/camera.js)
  shot() { return shot(this); }
  lock(at, z = 1) { return lock(this, at, z); }
  frame(viewW, z = 1) { return frame(this, viewW, z); }
  // a retry: the car already rolling, the seat's gun in his hand (Game, Checkpoints)
  skipGrab() { skipGrab(this); }
  // what the physics found it touching (drive/contacts.js), and the cars he shoved kept out of his lanes
  contact(o, pair) { contact(this, o, pair); }
  clearLanes(dt) { clearLanes(this, dt); }
  // a car he shoved (b) running into o (its onCollide while this drive is on: drive/contacts.js)
  knock(b, o, pair) { knock(this, b, o, pair); }
  // stalled, the way it eases itself out (drive/fronts.js; through the drive, so that a test may stand in for it)
  unstick(dt, own) { return unstick(this, dt, own); }

  // he is in: out of the world's bodies and of `chars` (nothing sees or hits him), carried at the seat (`driving`:
  // the drive he is at; `hidden`: not drawn with the others: the car draws him sat at the wheel when it is an open
  // one, Vehicle.seatIn / draw, CharacterAnim.seatPose); the car driven from now on (awake, lit, its lights
  // following it, what it touches told to `contact`)
  board() {
    const w = this.world, p = w.player, v = this.car, b = v.body;
    wake(b);
    if (b.isSleeping) Sleeping.set(b, false);
    roundCorners(b, CHASE.corner);
    this.was = { air: b.frictionAir, friction: b.friction };
    driveBody(b);
    v.moving = true;
    v.lightsOut = false;
    v.driver = this;
    this.was.armoured = v.armoured;
    if (this.o.van) v.armoured = true; // the chase: no health bar, his car is never shot up, burnt or blown (docs/LEVEL2.md)
    v.onCollide = (o, pair) => contact(this, o, pair);
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

  // the lab: he gets out by the driver's door; the car parked where it stopped
  leave() {
    const w = this.world, p = w.player, v = this.car, b = v.body;
    this.on = false;
    v.moving = false;
    v.driver = null;
    v.armoured = this.was.armoured;
    v.unseat?.();
    v.onCollide = null;
    for (const [car, fn] of this.knocked) if (car.onCollide === fn) car.onCollide = null; // (a pursuer keeps its own)
    this.knocked.clear();
    this.asides.clear();
    w.events?.off?.('pursuerRam', this.onRam);
    if (this.stash !== undefined) {
      // the lab: the seat's gun put back on the seat (taken again next time), what he had back in his hand
      v.gun = true;
      p.weapon = this.stash;
      this.stash = undefined;
      this.grab = null;
    }
    v.brake = 0; v.steer = 0; v.bob = 0; v.squat = 0; v.roll = 0; v.lift = 0;
    this.wind.length = 0;
    b.sleepThreshold = CHASE.parked.sleep;
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
    const p = this.world.player, v = this.car;
    Body.setPosition(p.body, v.toWorld(...seatOf(v, this.C)));
    p.angle = v.body.angle;
  }

  // intentions: the controls turned into the car's velocity (input: engine/Input.js, aim: the mouse in the world)
  step(dt, input, aim) {
    if (!this.on) return;
    this.carry();
    if (this.dead) { if (this.coasting) this.coastStep(dt); return; }
    const w = this.world, C = this.C, v = this.car, b = v.body;
    if (this.standing) {
      if (this.drag.on) stand(this, dt);
      if (this.drag.on) return;
      this.standing = false; // (over, or skipped: SPACE held)
      launch(this);
      return;
    }
    if (this.drag) { this.drag.step(dt); if (this.drag.gone) this.drag = null; } // (its butt, still glowing behind)
    this.hudT += dt;
    // taking the gun off the seat: the car rolls on by itself, nothing fires (a click now is lost); past the end of
    // the road (the card coming up over it) nothing he does counts any more
    const busy = this.grabbing || !!w.exited;
    if (this.grab) grabStep(this, dt);
    if (!busy) this.gun.step(dt, input, aim);
    // the route: a bend reached takes the wheel (the script's until its end); else the leg he is on
    if (!this.bend) {
      const nb = this.route.bends[this.bendI];
      if (nb && v.x >= nb.x && this.legI === nb.from) this.startBend(nb);
      else {
        // (the next leg by column: the car goes on in its row; the view eased across from where this one had it)
        const i = legAt(this.route.legs, v.x);
        if (i !== this.legI) { this.camY ??= trackY(this); this.legI = i; this.cruise = this.leg.cruise; }
      }
    }
    if (this.bend) { this.bendDrive(dt); camStep(this, dt); return; }
    // what the physics let it do last step: a hit slows it, a knock sideways is taken (the small bounce off what it
    // leans on is not: it goes on along it)
    const vel = Body.getVelocity(b);
    this.v = Math.min(this.v, Math.max(0, vel.x) + C.give);
    if (this.shoveT <= 0 && (Math.abs(vel.y) < Math.abs(this.u) || vel.y * this.u < 0)) {
      this.u = vel.y * this.u < 0 && Math.abs(vel.y) < C.bounce ? 0 : vel.y;
    }
    // the controls: the wheel only (up / down the picture); the speed is the road's. Stalled, the car eases itself
    // out sideways, his way if he steers (unstick: its sideways speed held, whatever the crawl or what it rubs on)
    const own = busy ? 0 : steerOf(input), free = this.unstick(dt, own), steer = free ?? own;
    // (a slide scrubs it: the speed it runs at falls with the slip, and comes back as it straightens)
    const SL = C.slide, scrub = SL.scrub * clamp((Math.abs(this.slip) - SL.free) / (SL.most - SL.free), 0, 1);
    this.v = speedStep(this.v, this.cruise * (1 - scrub), dt, C);
    // a car at a standstill does not go sideways; crawling (held up by what it pushes), it can still steer out
    const H = C.hold, grip = this.v > H.still ? clamp(this.v / this.cruise, C.crawl, 1) : 0;
    this.cool = Math.max(0, this.cool - dt);
    if (input.hit('Space') && !busy && this.cool <= 0 && grip > H.shove) this.shove(aim);
    if (this.shoveT > 0) {
      this.shoveT -= dt;
      this.u = this.side * C.shove.v * grip;
    } else if (free) this.u = free * C.stall.steer * C.steer;
    else {
      // (out of a shove the sideways speed is given back fast, until the wheel is his again)
      if (this.shoved && (steer || Math.abs(this.u) < H.back)) this.shoved = false;
      // (a slow motion of the chase hands the wheel more, in real time: systems/ChaseCam.js `wheel`)
      // (and the tyres give less of it the faster it goes and while the rear is out: gripOf)
      const K = w.chaseCam?.wheel ?? null, rdt = (K ? dt * K.rate : dt) * (steer ? gripOf(this.v, this.slip, C) : 1), most = K ? K.most : 1;
      this.u = steerStep(this.u, steer * grip * most, rdt, C, this.shoved ? C.shove.back : C.pull);
    }
    // the slide: the rear steps out on a flick, on full lock held, on a shove or a blow; caught with countersteer;
    // (held off the building fronts as he steers into them: no lock counted, the tail would swing into them)
    this.lockT = steer && Math.sign(steer) === this.lockS && !this.fenced ? this.lockT + dt : 0;
    this.lockS = Math.sign(steer);
    // (held off the fronts the wheel does nothing to it: it straightens along them)
    const wheel = grip > H.slide && !this.fenced ? Math.sign(steer) * Math.min(1, Math.abs(steer) * H.flick) : 0;
    [this.slip, this.slipV] = slideStep(this.slip, this.slipV, wheel, this.u, this.lockT, dt, C);
    if (this.v < C.fx.from) { this.slip *= 1 - Math.min(1, H.calm * dt); this.slipV *= 1 - Math.min(1, H.calm * dt); } // (no slide at a crawl)
    const asked = this.u;
    this.u = offFronts(this, this.u);
    this.fenced = !!this.grind || Math.abs(this.u - asked) > 0.05; // (the fronts hold it: no slide into them next step)
    // the velocity set; the nose sprung toward the way it really goes (a knock turns it, the road brings it back;
    // held up against a wall, it comes round along it instead of digging in)
    const Y = C.yaw, across = Math.abs(vel.y) < Math.abs(this.u) ? vel.y : this.u;
    const want = headingOf(this.v, across, C) + this.slip;
    let turning = yawStep(b.angle, Body.getAngularVelocity(b) * 60, want, dt, C);
    Body.setVelocity(b, { x: this.v, y: this.u });
    if (Math.abs(angDiff(b.angle, want)) < Y.snap && Math.abs(turning) < Y.snapV) {
      // as good as there: dead on it (a car a hair off straight is resampled crooked, every pixel of it)
      Body.setAngle(b, want);
      turning = 0;
    }
    Body.setAngularVelocity(b, turning / 60);
    b.flyUntil = w.time + C.fly;
    // how it looks: the front wheels, the body on its springs
    v.steer = this.wheels();
    springs(this, dt);
    camStep(this, dt);
    // the lab: E, and he gets out (the car stopped where it is)
    if (this.o.exit && !busy && input.hit('KeyE')) this.leave();
  }

  // its front wheels as drawn (Vehicle `steer`): by the share of the full sideways speed it holds (CHASE.wheels)
  wheels() {
    const W = this.C.wheels;
    return clamp((this.u / this.C.steer) * W.steer, -W.most, W.most);
  }

  // A BEND REACHED (the route's: systems/Route.js): the wheel is the script's from here to the end of its line; the
  // camera lets go of the leg's framing (camStep); told on 'chaseBend' ({ phase: 'in' | 'turn' | 'out', car, x, y,
  // bend }: systems/ChaseCam.js, systems/Pursuit.js)
  startBend(b) {
    const v = this.car;
    this.camOff ??= { ...normalOff(this), y: (this.camY ?? trackY(this)) - v.y }; // (from where the leg held the view: no jump)
    this.camY = null;
    this.bend = enterBend(b, v.x, v.y, v.body.angle, this.v, this.slip, this.slipV, this.C.bend);
    this.bend.turn = 0;
    this.legI = b.to;
    this.shoveT = 0; this.shoved = false; this.freeing = null; this.stallT = 0; this.nosing = null; this.lockT = 0; this.grind = null;
    this.world.events.emit('chaseBend', { phase: 'in', car: v, x: v.x, y: v.y, bend: b });
  }

  // The bend, a step: the car along the bend's line (chase/shared.js bendMove: braking into a turn, the tail out),
  // what it runs into still taking real momentum (a hit slows it, and the line waits for it); the wheel and the
  // shove do nothing, the gun is his (step). Out at the line's end
  bendDrive(dt) {
    const w = this.world, v = this.car, st = this.bend;
    // (what it pushes against costs it its speed, never under the smash's floor: nothing holds it up in a bend, a
    // pursuer on its tail or a wreck against its flank no more than a crate)
    bendFloor(st, Body.getVelocity(v.body));
    const pose = bendMove(w, v, st, dt);
    st.a = pose.q.a;
    this.v = st.v;
    this.u = 0;
    this.slip = st.slip;
    this.slipV = st.slipV;
    v.steer = bendWheel(pose.q, st.slip);
    springs(this, dt);
    // (each turn told as it begins: the breath of slow motion, systems/ChaseCam.js)
    if (pose.q.turn && !st.turn) w.events.emit('chaseBend', { phase: 'turn', car: v, x: v.x, y: v.y, bend: st.b, turn: pose.q.turn });
    st.turn = pose.q.turn;
    if (st.p >= st.b.length) this.endBend();
  }

  // the end of the bend's line: on the next leg, in the lane it ends on, his again; its cruise picked up (speedStep)
  endBend() {
    const st = this.bend, b = st.b, v = this.car;
    this.bend = null;
    this.flanks?.clear(); // (the cars scraped in it: met anew in the next one)
    this.bendI = b.i + 1 < this.route.bends.length ? b.i + 1 : -1;
    this.legI = b.to;
    this.cruise = this.leg.cruise;
    this.u = 0;
    this.lastV = this.was2.v = this.v;
    Body.setVelocity(v.body, { x: this.v, y: 0 });
    this.world.events.emit('chaseBend', { phase: 'out', car: v, x: v.x, y: v.y, bend: b, lane: nearestLane(this.leg.lanes, v.y / TILE) });
  }

  // the body thrown up on its springs (C.body.lift: 'hit', 'torn', 'kerb', 'shove'), k of it
  bump(kind, k = 1) { this.body.lift += this.C.body.lift[kind] * k; }

  // He is dead at the wheel (the told shot): nobody drives. The car runs on, losing its speed, drifting to a side,
  // until it stops or meets something
  coast() {
    this.dead = true;
    this.coasting = true;
    const lanes = this.leg.lanes;
    this.side = this.car.y > (lanes ? lanes[lanes.length - 1] * TILE : this.car.y) ? -1 : 1;
  }

  coastStep(dt) {
    const C = this.C, K = C.coast, b = this.car.body, vel = Body.getVelocity(b);
    this.v = Math.max(0, Math.min(this.v, Math.max(0, vel.x) + C.give) - K.slow * dt);
    if (this.v <= K.stop) { this.coasting = false; Body.setVelocity(b, { x: 0, y: 0 }); Body.setAngularVelocity(b, 0); return; }
    this.u = steerStep(this.u, this.side * K.drift, dt, C);
    Body.setVelocity(b, { x: this.v, y: this.u });
    Body.setAngularVelocity(b, yawStep(b.angle, Body.getAngularVelocity(b) * 60, headingOf(this.v, this.u, C), dt, C) / 60);
    b.flyUntil = this.world.time + C.fly;
    springs(this, dt);
    this.car.steer = this.wheels();
  }

  // SPACE: the lunge toward the side he aims at (above or below the car's centre line)
  shove(aim) {
    const C = this.C, S = C.shove, v = this.car, w = this.world;
    this.side = aim && v.toSprite(aim.x, aim.y).sy < v.h / 2 ? -1 : 1;
    this.shoves++;
    this.shoveT = S.dur;
    this.shoved = true;
    this.cool = S.cooldown;
    // the jolt: the picture thrown that way, the body rolled over its wheels and thrown up, smoke off every tyre
    w.shake(S.shake);
    w.camera?.push(0, this.side * S.push);
    this.body.roll -= this.side * S.roll;
    this.slipV += this.side * C.slide.shove; // (the tail is left behind a moment: the nose turns into the lunge)
    this.bump('shove');
    w.events.emit('ride', { beat: 'shove', x: v.x, y: v.y, side: this.side });
    w.sound('vanShove', v.x, v.y, 1);
    for (const [sx, sy] of v.m.wheels) {
      const q = v.toWorld(sx, sy);
      w.particles.smoke(q.x, q.y, S.smoke, 3, { ...S.puff });
    }
  }

  // after the physics: what the car ran into this step
  after(dt) {
    if (!this.on) return;
    const w = this.world;
    this.lost = false;
    for (const h of this.hits) react(this, h);
    this.hits.length = 0;
    for (const [k, t] of this.seen) if (w.time - t >= this.C.hit.again) this.seen.delete(k); // (hit long enough ago: anew)
    if (!this.dead) { flankStep(this, dt); scrape(this, dt); fx(this, dt); }
    clearLanes(this, dt);
    this.carry();
    if (!this.dead) this.far = Math.max(this.far, this.along);
    // the end of the road (on the leg it is on, out of any bend): the level is over (the results)
    const end = this.o.end;
    if (end && !this.dead && !w.exited && !this.bend && this.car.x >= end * TILE && this.legI >= legAt(this.route.legs, end * TILE)) {
      w.cleared = true;
      w.exited = true;
      w.game?.onExit?.();
    }
  }

  // its engine and tyres this step (audio/Motor.js; World hands it to Audio.motor): the gearbox on its real speed,
  // the throttle by what the speed does, the tyres squealing with the slip between the nose and the way it goes,
  // and at a shove
  motor(dt) {
    if (!this.on || this.dead || this.drag?.on) return null; // (the opening: the engine is off)
    // (held at cruise: half open; a hit that takes its speed lifts it, pulling back up to cruise floors it)
    const v = this.car, sp = this.v / this.C.max, dv = this.v - this.lastV;
    const throttle = dv < -1e-4 ? 0 : dv > 1e-4 ? 1 : 0.5;
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

// the lab: a car that can be driven offers its driver's door to E (systems/Uses.js)
export function driveSpot(world, car) {
  const [dx, dy] = doorOf(car);
  return {
    get x() { return car.toWorld(dx, dy).x; },
    get y() { return car.toWorld(dx, dy).y; },
    r: 30, label: 'DRIVE', kind: 'drive',
    ok: () => !world.drive && !car.exploded && !car.dead,
    use: () => { world.drive = new Drive(world, { exit: true, ...world.level?.routes?.[car.route] }, car); }, // (a route of its own: systems/Route.js)
  };
}
