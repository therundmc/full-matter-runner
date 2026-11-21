// Driving the car (level 2A's chase, docs/LEVEL2.md; the lab's station 19). The player sits in it, hidden, carried at
// the driver's seat; his own input is the gun out of the car (systems/CarGun.js). The car is a dynamic Matter body:
// every step its velocity is set from the controls (CHASE in data/chase.js) after reading back what the physics
// really let it do, so what it runs into takes real momentum and a hit slows it for real.
//   along the road (+x): it runs at its cruise speed by itself: no throttle, no brake (the user's call, 2026-11-19);
//   a hit slows it, it comes back up by itself
//   across (y): the road runs along +x, so across it is up / down on the picture: W (Z on AZERTY) / S steer it up /
//   down, A / D too (A up, D down), the pad's left stick by its y; let go, the road's pull straightens it. The nose
//   is on a spring toward the way it goes (yawStep: it turns in a little late, a few degrees at most, no wag)
//   the body on its springs (looks only: Vehicle `squat` / `roll` / `lift`): it sits back as it pulls away, dives on
//   a hit, rolls out of a bend, bounces on what it hits, on a kerb, on the road
//   SPACE: the shove, THE move: a lunge of a lane toward the side he aims at; what it does to a pursuer it meets is
//   systems/Pursuit.js's (`lunge` tells it one is on)
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
//   how the chase opens, the first time (the level's `chase.intro: 'drag'`, systems/LastDrag.js): the car stands,
//   lamps off, while he finishes his cigarette and flicks it out (stand); then the engine (launch: it pulls away by
//   itself, its rear tyres spinning) and the grab. A retry starts rolling, the gun in hand
//   the chase's slow motions (systems/ChaseCam.js) may hand the wheel more (`wheel`): the dodge made easier
//   THE ROUTE (systems/Route.js; the level's `chase.legs` and `chase.bends`): the road is straight legs along +x, each
//   with its own lanes, middle, cruise and view; what is said above of "the road" is the leg he is on. At a bend's
//   `at` the wheel is the script's (bendStep: the car follows the bend's line, braking into its turns, its tail out,
//   the gun still his; no shove), until it hands him to the next leg on its lane (CHASE.bend)
// The camera's numbers (view, frame) are Game's to use. DOM-free but for the van it may
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
import LastDrag from './LastDrag.js';
import { routeOf, legAt, along, bendStep, enterBend, project, bandOf, blocksAll, nearestLane } from './Route.js';

const { Body, Sleeping } = Matter;
const SLEEP = 60; // Matter's default sleepThreshold, given back when he gets out

// ---------------------------------------------------------------- pure
// the speed along the road a step later: v px/step, brought back to `cruise` at C.ease a second (nothing he holds
// changes it: what it hit took some of it)
export function speedStep(v, cruise, dt, C = CHASE) {
  return v < cruise ? Math.min(cruise, v + C.ease * dt) : Math.max(cruise, v - C.ease * dt);
}

// the steering as held, -1 (up the picture, -y) .. 1 (down): W / A / up / left up, S / D / down / right down (the
// arrows move him on foot too), else the pad's left stick by its y
const UP = ['KeyW', 'KeyA', 'ArrowUp', 'ArrowLeft'], DOWN = ['KeyS', 'KeyD', 'ArrowDown', 'ArrowRight'];
export function steerOf(input) {
  const held = (codes) => (codes.some((c) => input.down(c)) ? 1 : 0);
  return held(DOWN) - held(UP) || clamp(input.move?.()?.y ?? 0, -1, 1);
}

// A driven car's body with its corners rounded r px (C.corner), its mass and inertia kept: a square corner sliding
// along the building fronts catches on the seam between two wall bodies (the physics sees the next one's face) and
// stops the car dead. Once per body
function roundCorners(b, r) {
  if (b.rounded || !(r > 0)) return;
  const { mass, inertia } = b;
  Body.setVertices(b, Matter.Vertices.chamfer(b.vertices, r));
  Body.setMass(b, mass);
  Body.setInertia(b, inertia);
  b.rounded = true;
}

// the speed across a step later: u px/step; steer -1..1 (steerOf) toward steer x C.steer, nothing held: the
// road's pull takes it away (pull: px/step a second; after a shove, its own)
export function steerStep(u, steer, dt, C = CHASE, pull = C.pull) {
  const want = steer * C.steer, rate = steer ? C.steerRate : pull;
  return u < want ? Math.min(want, u + rate * dt) : Math.max(want, u - rate * dt);
}

// the way the van goes (vx along the road, vy across), at most C.heading off the road: what its nose is sprung to
export const headingOf = (vx, vy, C = CHASE) => clamp(Math.atan2(vy, Math.max(vx, 0.5)), -C.heading, C.heading);

// THE SLIDE (C.slide). How much of the wheel the tyres give, 1 at the cruise speed: less the faster it goes (`fall`
// of it gone flat out, C.max: it turns in later, understeer; as much more well under the cruise speed, slowed by a
// hit: it bites) and less again while the rear is out (`under` of it at
// the most slip: a sliding car goes where it was going)
export function gripOf(v, slip = 0, C = CHASE) {
  const S = C.slide, fast = clamp((v - C.cruise) / (C.max - C.cruise), -1, 1);
  return (1 - S.fall * fast) * (1 - S.under * clamp(Math.abs(slip) / S.most, 0, 1));
}

// The rear stepping out, a step later: [slip, its speed]. slip: rad the body is turned past the way it goes (+: the
// nose toward +y, the tail swung out toward -y). What lets it go: the wheel thrown over against the way the car is
// still going across (a flick: over `flick[0]` of the full sideways speed, `flick[1]` rad/s2 at all of it), full
// lock held longer than `hold[0]` s (`hold[1]` rad/s2), and kicks given to its speed from outside (a shove, a blow).
// What brings it back: a spring `k` (1/s2), damped `d` (1/s) with nothing held (under-damped: it fishtails once),
// `catch` when he steers against it (countersteer: caught, no wag); steering INTO it the spring is only `into` of
// itself (it is held out: a drift). Never past `most`
export function slideStep(slip, slipV, steer, u, held, dt, C = CHASE) {
  const S = C.slide, full = Math.abs(u) / C.steer;
  let push = 0;
  if (steer && u * steer < 0 && full > S.flick[0]) push += steer * S.flick[1] * Math.min(1, full);
  if (steer && held > S.hold[0]) push += steer * S.hold[1];
  const into = steer * slip > 0, counter = steer * slip < 0;
  slipV += (push - slip * S.k * (into ? S.into : 1) - slipV * (counter ? S.catch : S.d)) * dt;
  slip += slipV * dt;
  if (Math.abs(slip) > S.most) { slip = Math.sign(slip) * S.most; if (slip * slipV > 0) slipV = 0; }
  // (as good as straight: dead straight; a car a hair off its line is drawn crooked)
  if (!push && Math.abs(slip) < S.snap && Math.abs(slipV) < S.snap * 8) return [0, 0];
  return [slip, slipV];
}

// The nose a step later: its turning speed (rad/s) from its angle, the speed it turns at now (rad/s) and the way it
// is sprung to (C.yaw: a spring all but critically damped, so it lags a little and does not wag)
export function yawStep(angle, turning, want, dt, C = CHASE) {
  return turning + (angDiff(angle, want) * C.yaw.k - turning * C.yaw.d) * dt;
}

// a spring a step later: [x, its speed] toward `want` (k: 1/s2, d: 1/s). The body on its wheels (C.body)
export function springStep(x, vel, want, k, d, dt) {
  vel += ((want - x) * k - vel * d) * dt;
  return [x + vel * dt, vel];
}

// what the body's springs are pushed to: [squat px (+: sat back on the rear wheels; -: the nose down), roll px (+:
// toward +y)] for ax / ay px/step gained a second along / across and u px/step held across: it sits back as it
// pulls, dives as a hit takes its speed, rolls out of the bend
export function bodyLean(ax, ay, u, C = CHASE) {
  const B = C.body;
  return [clamp(ax * B.pitch, -B.most, B.most), clamp(-(ay * B.roll + u * B.lean), -B.most, B.most)];
}

// the speed on the dial
export const kmh = (v, C = CHASE) => Math.round(v * C.kmh);

// Are the tyres letting go (smoke, rubber left on the road)? u: px/step across, v: along, shoving: in a shove. 0:
// no; else how hard, up to 1
// (slip: rad its rear is out, the slide: from C.slide.smoke on, all of it at C.slide.most)
export function skidOf(u, v, shoving, C = CHASE, slip = 0) {
  const F = C.fx, S = C.slide;
  if (v < F.from) return 0;
  if (shoving) return 1;
  const k = Math.abs(u) / C.steer, out = Math.abs(slip) >= S.smoke ? clamp(Math.abs(slip) / S.most, 0, 1) : 0;
  return Math.max(out, k >= F.slide ? clamp(k, 0, 1) * F.steer : 0);
}

// A PARKED CAR HIT IS SHOVED ASIDE (C.aside; the user: "it must move aside, it blocks us"). How square the hit is,
// 0 (a graze, a flank) .. 1 (full on the nose): the share of his car's width what he hit covers (none of it under
// `graze` of the width, all of it from `full` on), times how much the contact faces his nose (dot: the contact's
// normal along the nose)
export function squareOf(cover, dot, C = CHASE) {
  const A = C.aside;
  return clamp((cover - A.graze) / (A.full - A.graze), 0, 1) * clamp(dot, 0, 1);
}

// the share of his speed he keeps: `loss[0]` gone on a graze, `loss[1]` on a square hit. Never stopped
export const asideKeep = (sq, C = CHASE) => 1 - (C.aside.loss[0] + (C.aside.loss[1] - C.aside.loss[0]) * clamp(sq, 0, 1));

// How the car he hit is thrown: { along: x his speed, on ahead of him (a square hit throws it on faster than he
// goes: it is out of his way, never held on his nose), across: px/step toward its side, spin: rad/step }; a heavier
// one (kg) goes less
export function asideThrow(sq, kg, C = CHASE) {
  const A = C.aside, mix = (r) => r[0] + (r[1] - r[0]) * clamp(sq, 0, 1), k = clamp(A.kg / kg, A.heavy, 1);
  return { along: mix(A.ahead) * k, across: mix(A.side) * k, spin: mix(A.spin) };
}

// how hard a thing torn off the kerb is thrown (Prop.break's power), by the speed it was hit at (px/step)
export const tearPower = (speed, C = CHASE) => clamp(C.hit.power * (speed / C.cruise), C.hit.power * 0.6, C.hit.most);

// IN A BEND (CHASE.bend.smash): may a loose thing of `kg` be thrown by hand out of the line? And the share of the
// car's speed it is thrown at (a light one: CHASE.hit.fling's; a heavy one by its mass, `heavy` [least, most])
export const smashable = (kg, K = CHASE.bend.smash) => kg <= K.kg;
export function smashSpeed(kg, C = CHASE) {
  const K = C.bend.smash, F = C.hit.fling;
  if (kg <= F.kg) return rand(...F.v);
  return K.heavy[0] + (K.heavy[1] - K.heavy[0]) * clamp((K.kg - kg) / (K.kg - F.kg), 0, 1);
}
// does a thing thrown in a bend burst as it goes (def: its PROPS entry): all but metal with more than `burst` hp
export const bursts = (def, K = CHASE.bend.smash) => !!def && !def.lasting && (def.material !== 'metal' || (def.hp ?? 0) <= K.burst);
// a bend's speed (px/step) after what it hit cost it (`k` of it), never under `floor` of the bend's own
export const smashCost = (v, k, speed, K = CHASE.bend.smash) => Math.max(Math.min(v, speed * K.floor), v * (1 - k));

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

// px of the car's width (its middle at y, h wide) that what it hit covers (from lo to hi across the road)
const coverOf = (lo, hi, y, h) => Math.min(hi, y + h / 2) - Math.max(lo, y - h / 2);

// Did it take it on the nose, or only clip it with a corner? Under `corner` of the car's width covered by what it
// hit is a clip, a jolt and sparks, not the crash
export const onNose = (lo, hi, y, h, C = CHASE) => coverOf(lo, hi, y, h) / h >= C.crash.corner;

// Only grazed: what it hit covers under `graze` px of its width (the next wall body along the building fronts it
// slides on, met at their seam): a scrape, it goes on (no clip)
const grazes = (lo, hi, y, h, C = CHASE) => coverOf(lo, hi, y, h) < C.crash.graze;

// The building fronts either side of a car in column c, row r (a street running along +x): [world px y of the face
// above it (the bottom of the first wall, window or door tile up), of the one below it (the top of the first one
// down)], none within `most` tiles: -+Infinity; null when r itself is one. A window or a door is set back in its wall
// (its pane, its leaves in the middle of the tile): it counts as the front. A fence does not (it is gone through),
// nor an opening (an alley, a yard: the face is its back wall)
const isFront = (map, c, k) => map.isSolid(c, k) || 'GDL'.includes(map.at(c, k));
export function frontsAt(map, c, r, most = 8) {
  const front = (k) => isFront(map, c, k);
  if (front(r)) return null;
  let up = r, down = r;
  while (up > r - most && !front(up - 1)) up--;
  while (down < r + most && !front(down + 1)) down++;
  return [up > r - most ? up * TILE : -Infinity, down < r + most ? (down + 1) * TILE : Infinity];
}

// ---------------------------------------------------------------- the drive
export default class Drive {
  // o: the level's `chase` ({ van: [col, row], cruise, lanes, end, legs, bends }) or the lab's ({ exit: true }, a
  // route of its own maybe: { legs, bends }); van: the vehicle he gets into (none: one of CHASE.vehicle's model is
  // made at o.van, facing +x, already at its cruise speed). A restart at a checkpoint (systems/Checkpoints.js) puts
  // it at o.start [col, row] instead, going o.speed px/step (the route is still measured from o.van)
  constructor(world, o = {}, van = null) {
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
    if (van || at) this.legI = legAt(this.route.legs, van ? van.x : at[0] * TILE);
    this.cruise = this.leg.cruise;
    if (!van) {
      van = new Vehicle(world, o.vehicle ?? CHASE.vehicle, at[0] * TILE, at[1] * TILE, 0);
      world.props.push(van);
    }
    this.van = van;
    this.bendI = this.route.bends.findIndex((b) => b.x > van.x); // the next bend on his way (-1: none)
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
    this.gun = new CarGun(world, van, seatOf(van, CHASE)); // his gun out of the car (the aim, the left click)
    this.grab = null;                 // the beat of taking the gun off the passenger seat: { t, arms, took, racked }
    this.stash = undefined;           // the lab: what was in his hand before he took the seat's gun (given back at leave)
    // the lab's car with a gun on its seat: he takes it every time he gets in
    const arms = o.arms ?? (o.exit && van.gun ? { weapon: van.m.gun[3], seat: true } : null);
    if (arms) this.arm(arms);
    // the opening on his cigarette (the level's `chase.intro`): the car stands until it is flicked out
    this.drag = o.intro === 'drag' && this.grab ? new LastDrag(world, van, seatOf(van, CHASE)) : null;
    this.launchT = 0;                 // s its rear tyres still spin as it pulls away (launch)
    this.standing = !!this.drag;      // the car stands until the opening is over (or skipped)
    this.hudT = Infinity;             // s since the HUD began to come in (launch)
    if (this.drag) {
      this.v = this.lastV = this.was2.v = 0;
      van.lightsOut = true;
      world.clockFrom = Infinity; // the run's clock waits for the launch (World.runTime)
      Body.setVelocity(van.body, { x: 0, y: 0 });
    }
    // water standing in the gutter (the level's `chase.water`: [col, row, r px])
    for (const [c, r, rad] of o.water || []) world.liquids?.feed(c * TILE, r * TILE, Math.PI * rad * rad * CHASE.fx.water, 'water', rad);
  }

  // what he sets off with (the level's `chase.arms`: { weapon, mag, seat }): the gun in his hand and what its
  // magazine holds (at the wheel it never runs dry: CarGun; the count is what he gets out of the car with); seat: it
  // lies on the car's passenger seat and he takes it in the beat (grab)
  arm(arms) {
    const p = this.world.player;
    if (arms.seat && this.van.gun) {
      if (this.o.exit) this.stash = p.weapon;
      p.weapon = null; // (his hands free for it)
      this.grab = { t: 0, arms, took: false, racked: false };
      if (p.riding) p.riding.grab = 0;
      return;
    }
    p.setWeapon(arms.weapon, arms.mag);
  }

  // he is finishing his cigarette or taking the gun off the seat: the controls and the gun are not his yet
  get grabbing() { return !!this.drag?.on || (!!this.grab && this.grab.t < SEAT.grab.dur); }

  // The opening, a step: the car stands (nothing moves it), he smokes; over, it pulls away
  stand(dt) {
    const b = this.van.body;
    this.drag.step(dt);
    Body.setVelocity(b, { x: 0, y: 0 });
    Body.setAngularVelocity(b, 0);
    this.carry();
  }

  // the engine: its lamps on, the car pulls away by itself (speedStep) on spinning rear tyres, sat back on them
  launch() {
    const w = this.world, v = this.van, b = v.body, L = this.C.intro.launch;
    // (a heavy body at rest is frozen by the physics: it stood for seconds; a frozen one takes no velocity)
    wake(b);
    if (b.isSleeping) Sleeping.set(b, false);
    v.lightsOut = false;
    w.clockFrom = w.time; // the run's clock starts here (World.runTime): the opening is not his time
    this.hudT = 0;
    this.launchT = L.spin;
    this.bump('shove', L.kick);
    w.shake(this.C.shove.shake);
    w.sound('engineRoar', v.x, v.y, 1); // placeholder (assets/sound/PLACEHOLDERS.md)
    w.events.emit('ride', { beat: 'start', x: v.x, y: v.y });
  }

  // a retry: no beat (no cigarette: the car already rolling), the seat's gun already in his hand
  skipGrab() {
    if (this.drag) {
      const p = this.world.player;
      if (p.riding) p.riding.drag = null;
      this.drag = null;
      this.standing = false;
      this.world.clockFrom = 0;
      this.v = this.lastV = this.was2.v = this.cruise;
      this.van.lightsOut = false;
      Body.setVelocity(this.van.body, { x: this.cruise, y: 0 });
    }
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
  // (it looks at his seat in the car AS DRAWN, between its last two steps: his own body is out of the world while
  // he rides and is not drawn in between, so the view pulled onto it ran up to a step ahead of the car, by another
  // share of it every frame: the car shook in the close-up, 56 px of the picture at 1080, and read as blurred)
  shot() {
    if (!this.on) return null;
    if (this.drag?.on) return this.drag.shot();
    const g = this.grab, v = this.van;
    if (!g) return null;
    return { name: g.t < SEAT.grab.hand[0] ? 'grab' : 'grabOut', at: v.toWorld(...seatOf(v, this.C)) };
  }

  // Where the view is drawn from for a point `at` it would look at (z: picture px a world px): along the road, a
  // whole number of picture px from the car as it is drawn (Vehicle.pose), whatever the shot pulls it to; across, on
  // the picture's grid. So the car never moves by a px in the picture from one frame to the next but by the shot's
  // own pan
  lock(at, z = 1) {
    const snap = (n) => Math.round(n * z) / z, x = this.van.x;
    return { x: snap(x) + snap(at.x - x), y: snap(at.y) };
  }

  // 0..1: how much of the HUD shows: none during the opening, faded in over CHASE.intro.hud s as it pulls away
  get hud() { return this.standing ? 0 : clamp(this.hudT / this.C.intro.hud, 0, 1); }
  get kmh() { return kmh(this.v, this.C); }
  // world px of height the picture shows while he is at the wheel (Game.setView): his leg's (in a bend: the one it
  // left, the cut to the next leg's comes out of it)
  get view() { return this.route.legs[this.bend ? this.bend.b.from : this.legI].view ?? this.C.camera.view; }
  // the leg he is on (systems/Route.js legsOf: lanes, mid, cruise, view, kerbs, across)
  get leg() { return this.route.legs[this.legI]; }
  // px along the route now (Route.along: through a bend, along its line)
  get along() { return along(this.route, this.van.x, this.bend?.b, this.bend?.p, this.C.bend); }
  // how far down the route he is: { s: px from the start (never back), total: px to the end }, or null (no end)
  get progress() { return this.route.total ? { s: this.far, total: this.route.total } : null; }
  // 0..1: the shove's bar on the HUD (1: ready)
  get ready() { return 1 - this.cool / this.C.shove.cooldown; }
  // the shove under way, as what it meets is told (systems/Pursuit.js): its number while the car is still thrown
  // sideways by it (the lunge, and the way back until the wheel is his again), else 0
  get lunge() { return this.shoveT > 0 || this.shoved ? this.shoves : 0; }

  // he is in: out of the world's bodies and of `chars` (nothing sees or hits him), carried at the seat (`driving`:
  // the drive he is at; `hidden`: not drawn with the others: the car draws him sat at the wheel when it is an open
  // one, Vehicle.seatIn / draw, CharacterAnim.seatPose); the van driven from
  // now on (awake, lit, its lights following it, what it touches told to `contact`)
  board() {
    const w = this.world, p = w.player, v = this.van, b = v.body;
    wake(b);
    if (b.isSleeping) Sleeping.set(b, false);
    roundCorners(b, CHASE.corner);
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
    const w = this.world, C = this.C, v = this.van, b = v.body;
    if (this.standing) {
      if (this.drag.on) this.stand(dt);
      if (this.drag.on) return;
      this.standing = false; // (over, or skipped: SPACE held)
      this.launch();
      return;
    }
    if (this.drag) { this.drag.step(dt); if (this.drag.gone) this.drag = null; } // (its butt, still glowing behind)
    this.hudT += dt;
    // taking the gun off the seat: the car rolls on by itself, nothing fires (a click now is lost); past the end of
    // the road (the card coming up over it) nothing he does counts any more
    const busy = this.grabbing || !!w.exited;
    if (this.grab) this.grabStep(dt);
    if (!busy) this.gun.step(dt, input, aim);
    // the route: a bend reached takes the wheel (the script's until its end); else the leg he is on
    if (!this.bend) {
      const nb = this.route.bends[this.bendI];
      if (nb && v.x >= nb.x && this.legI === nb.from) this.startBend(nb);
      else {
        // (the next leg by column: the car goes on in its row; the view eased across from where this one had it)
        const i = legAt(this.route.legs, v.x);
        if (i !== this.legI) { this.camY ??= this.trackY(); this.legI = i; this.cruise = this.leg.cruise; }
      }
    }
    if (this.bend) { this.bendDrive(dt); this.camStep(dt); return; }
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
    const grip = this.v > 0.1 ? clamp(this.v / this.cruise, C.crawl, 1) : 0;
    this.cool = Math.max(0, this.cool - dt);
    if (input.hit('Space') && !busy && this.cool <= 0 && grip > 0.2) this.shove(aim);
    if (this.shoveT > 0) {
      this.shoveT -= dt;
      this.u = this.side * C.shove.v * grip;
    } else if (free) this.u = free * C.stall.steer * C.steer;
    else {
      // (out of a shove the sideways speed is given back fast, until the wheel is his again)
      if (this.shoved && (steer || Math.abs(this.u) < 1)) this.shoved = false;
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
    const wheel = grip > 0.5 && !this.fenced ? Math.sign(steer) * Math.min(1, Math.abs(steer) * 1.5) : 0;
    [this.slip, this.slipV] = slideStep(this.slip, this.slipV, wheel, this.u, this.lockT, dt, C);
    if (this.v < C.fx.from) { this.slip *= 1 - Math.min(1, 6 * dt); this.slipV *= 1 - Math.min(1, 6 * dt); } // (no slide at a crawl)
    const asked = this.u;
    this.u = this.offFronts(this.u);
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
    v.steer = clamp((this.u / C.steer) * 0.45, -0.5, 0.5);
    this.springs(dt);
    this.camStep(dt);
    // the lab: E, and he gets out (the car stopped where it is)
    if (this.o.exit && !busy && input.hit('KeyE')) this.leave();
  }

  // A BEND REACHED (the route's: systems/Route.js): the wheel is the script's from here to the end of its line; the
  // camera lets go of the leg's framing (camStep); told on 'chaseBend' ({ phase: 'in' | 'turn' | 'out', car, x, y,
  // bend }: systems/ChaseCam.js, systems/Pursuit.js)
  startBend(b) {
    const v = this.van;
    this.camOff ??= { ...this.normalOff(), y: (this.camY ?? this.trackY()) - v.y }; // (from where the leg held the view: no jump)
    this.camY = null;
    this.bend = enterBend(b, v.x, v.y, v.body.angle, this.v, this.slip, this.slipV, this.C.bend);
    this.bend.turn = 0;
    this.legI = b.to;
    this.shoveT = 0; this.shoved = false; this.freeing = null; this.stallT = 0; this.nosing = null; this.lockT = 0; this.grind = null;
    this.world.events.emit('chaseBend', { phase: 'in', car: v, x: v.x, y: v.y, bend: b });
  }

  // The bend, a step: the car along the bend's line (Route.bendStep: braking into a turn, the tail out), its
  // velocity set to where the line takes it next (what it runs into still takes real momentum; a hit slows it, and
  // the line waits for it); the wheel and the shove do nothing, the gun is his (step). Out at the line's end
  bendDrive(dt) {
    const w = this.world, C = this.C, K = C.bend, v = this.van, b = v.body, st = this.bend;
    const vel = Body.getVelocity(b);
    // (what it pushes against costs it its speed, never under the smash's floor: nothing holds it up in a bend, a
    // pursuer on its tail or a wreck against its flank no more than a crate)
    st.v = Math.max(Math.min(st.v, Math.hypot(vel.x, vel.y) + C.give), Math.min(st.v, st.b.speed * K.smash.floor));
    const ahead = { x: v.x + Math.cos(b.angle) * K.pivot, y: v.y + Math.sin(b.angle) * K.pivot };
    const held = project(st.b.path, ahead.x, ahead.y, st.p, 96, 2);
    if (st.p - held > st.v * 2 + 8) st.p = held + st.v * 2; // (held up by what it hit)
    const pose = bendStep(st, st.b, dt, Infinity, K);
    let dx = pose.x - v.x, dy = pose.y - v.y;
    const most = st.v * 1.5 + 2, d = Math.hypot(dx, dy);
    if (d > most) { dx *= most / d; dy *= most / d; }
    Body.setVelocity(b, { x: dx, y: dy });
    Body.setAngularVelocity(b, angDiff(b.angle, pose.a));
    b.flyUntil = w.time + C.fly;
    st.a = pose.q.a;
    this.v = st.v;
    this.u = 0;
    this.slip = st.slip;
    this.slipV = st.slipV;
    v.steer = clamp(pose.q.turn * 0.4 - st.slip * 0.5, -0.5, 0.5);
    this.springs(dt);
    // (each turn told as it begins: the breath of slow motion, systems/ChaseCam.js)
    if (pose.q.turn && !st.turn) w.events.emit('chaseBend', { phase: 'turn', car: v, x: v.x, y: v.y, bend: st.b, turn: pose.q.turn });
    st.turn = pose.q.turn;
    if (st.p >= st.b.length) this.endBend();
  }

  // the end of the bend's line: on the next leg, in the lane it ends on, his again; its cruise picked up (speedStep)
  endBend() {
    const st = this.bend, b = st.b, v = this.van;
    this.bend = null;
    this.bendI = b.i + 1 < this.route.bends.length ? b.i + 1 : -1;
    this.legI = b.to;
    this.cruise = this.leg.cruise;
    this.u = 0;
    this.lastV = this.was2.v = this.v;
    Body.setVelocity(v.body, { x: this.v, y: 0 });
    this.world.events.emit('chaseBend', { phase: 'out', car: v, x: v.x, y: v.y, bend: b, lane: nearestLane(this.leg.lanes, v.y / TILE) });
  }

  // the camera's offset from the car (world px), a step: in a bend it looks ahead along the line, out of one it comes
  // back to the leg's own framing (normalOff) and lets go of it once there (CHASE.bend.camera)
  camStep(dt) {
    if (!this.bend && !this.camOff) { this.acrossStep(dt); return; }
    const K = this.C.bend.camera, o = (this.camOff ??= this.normalOff());
    let want = this.normalOff();
    if (this.bend) {
      const a = this.bend.a ?? 0, W = this.viewW ?? (this.view * 16) / 9;
      want = { x: Math.cos(a) * W * K.lead[0], y: Math.sin(a) * this.view * K.lead[1] };
    }
    const k = Math.min(1, K.ease * dt);
    o.x += clamp((want.x - o.x) * k, -K.most, K.most);
    o.y += clamp((want.y - o.y) * k, -K.most, K.most);
    if (!this.bend && Math.abs(o.x - want.x) < K.done && Math.abs(o.y - want.y) < K.done) this.camOff = null;
  }

  // the offset the leg's own framing holds the view at from the car (frame): C.camera.at of the view's width
  // behind its middle along the road, the street's middle across (trackY)
  normalOff() {
    const C = this.C.camera, v = this.van, mid = this.street, W = this.viewW ?? (this.view * 16) / 9;
    return { x: W * (0.5 - C.at - this.surge), y: mid === null ? 0 : this.trackY() - v.y };
  }

  // the y the leg's framing holds the view's middle at: the street's middle (its `mid`), and `track` of the way from
  // it to his car (a road wider than the picture); none (the lab): on the car
  trackY() {
    const mid = this.street, v = this.van;
    return mid === null ? v.y : mid + (v.y - mid) * (this.leg.track || 0);
  }

  // Across, out of a bend: on a leg that follows him (`track`), the view's middle eased toward trackY as he moves;
  // into the next leg by column with another framing, eased from where the last one had it (no jump), then dropped:
  // the leg's middle held exactly (frame). C.camera.across
  acrossStep(dt) {
    const K = this.C.camera.across, want = this.trackY();
    if (this.camY === null) { if (!this.leg.track) return; this.camY = want; }
    this.camY += clamp((want - this.camY) * Math.min(1, K.ease * dt), -K.most, K.most);
    if (!this.leg.track && Math.abs(this.camY - want) < K.done) this.camY = null;
  }

  // Never stalled for good (C.stall): crawling under `under` of its cruise speed for `after` s (a car shoved into its
  // lane, a wreck, a thing pinned against it), it eases itself sideways out of it until it runs again, at `steer` of
  // the full sideways speed however slow it is and whatever it rubs on (at a crawl the wheel alone could not drag it
  // off what its nose leans on): the way he steers (own: never fought), else the way what holds it pushes it, else
  // toward the street's middle, else toward the lane it is farthest from; the other way if it has not got anywhere
  // after `after` s more. -1..1 the way it goes, or null: the wheel as usual (the lab has no street)
  unstick(dt, own) {
    const S = this.C.stall, mid = this.street, y = this.van.y;
    this.stallT = this.v < S.under * this.cruise ? this.stallT + dt : 0;
    if (!this.stallT) this.nosing = null;
    else if (mid !== null && this.boxed(dt)) return null;
    if (this.v >= S.until * this.cruise) this.freeing = null;
    else if (this.stallT > S.after && !this.freeing) this.freeing = { side: this.wayOut(mid), y, t: 0 };
    const F = this.freeing;
    if (!F || mid === null) return null;
    if (own) return own;
    this.tearHeld();
    if ((F.t += dt) > S.after) {
      if (Math.abs(y - F.y) < S.moved) F.side = -F.side; // (held that way too)
      F.y = y;
      F.t = 0;
    }
    return F.side;
  }

  // Crawling with its nose on what never gives (a `lasting` thing: the lorry), it has to get round one of its ends: not
  // `moved` px nearer to one than it ever was in each `after` s for `boxed` s (the way round shut: a car shoved in
  // there and pinned, the street's front; a car pushed against it creeps a few px; going back and forth gains
  // nothing) and it is the crash he was told about: the street is his to get round, not to wait in. True: it crashed
  boxed(dt) {
    const S = this.C.stall, wall = this.nosedOn();
    if (!wall) return false;
    const left = this.roundOf(wall)?.left ?? Infinity, B = (this.nosing ??= { t: 0, held: 0, best: left });
    if ((B.t += dt) >= S.after - 1e-9) {
      B.held = left < B.best - S.moved ? 0 : B.held + B.t;
      B.t = 0;
      B.best = Math.min(B.best, left);
    }
    if (B.held < S.boxed - 1e-9 || this.world.player.invulnerable) return false;
    this.crash({ a: this.van.body.angle });
    return true;
  }

  // the `lasting` body its nose leans on (within crash.cone of square on), or null
  nosedOn() {
    const b = this.van.body, ca = Math.cos(b.angle), sa = Math.sin(b.angle), cone = Math.cos(this.C.crash.cone);
    for (const pair of this.world.physics.activePairs()) {
      const o = pair.bodyA === b ? pair.bodyB : pair.bodyB === b ? pair.bodyA : null;
      if (!o?.entity?.def?.lasting || pair.isSensor) continue;
      const n = pair.collision.normal, into = pair.bodyA === b ? -1 : 1; // (Matter's normal points from B to A)
      if ((ca * n.x + sa * n.y) * into >= cone) return o;
    }
    return null;
  }

  // the way round body o across the street: its end with room for the car short of the building fronts, the nearest
  // { side: -1 (-y) | 1, left: px across still to go to clear it }, or null (it shuts the street)
  roundOf(o) {
    const [lo, hi] = this.fronts(), y = this.van.y, h = this.van.h, ob = o.bounds, ends = [];
    if (ob.min.y - lo >= h) ends.push({ side: -1, left: y + h / 2 - ob.min.y });
    if (hi - ob.max.y >= h) ends.push({ side: 1, left: ob.max.y - (y - h / 2) });
    return ends.sort((a, c) => a.left - c.left)[0] ?? null;
  }

  // which way out of what holds it (-1: -y): round the end of what its nose leans on, else the way the solid contacts
  // push it, else the street's middle, else the lane it is farthest from
  wayOut(mid) {
    const wall = this.nosedOn(), round = wall && this.roundOf(wall);
    if (round) return round.side;
    const b = this.van.body, y = this.van.y;
    let push = 0;
    for (const pair of this.world.physics.activePairs()) {
      if (pair.isSensor || (pair.bodyA !== b && pair.bodyB !== b)) continue;
      push += pair.collision.normal.y * (pair.bodyA === b ? 1 : -1); // (Matter's normal points from B to A: away from it)
    }
    if (Math.abs(push) > 0.3) return Math.sign(push);
    if (mid !== null && Math.abs(mid - y) >= TILE) return Math.sign(mid - y);
    const far = (this.leg.lanes || []).map((r) => r * TILE).sort((a, c) => Math.abs(c - y) - Math.abs(a - y))[0];
    return far !== undefined && far !== y ? Math.sign(far - y) : 1;
  }

  // stalled: a bolted thing it leans on (met at a crawl, it held: a pole it is wedged under against a wall) is torn
  // off as if hit fast; a parked car it leans on is woken (frozen again at rest, it held: shoved aside now)
  tearHeld() {
    const b = this.van.body;
    for (const pair of this.world.physics.activePairs()) {
      const o = pair.bodyA === b ? pair.bodyB : pair.bodyB === b ? pair.bodyA : null, e = o?.entity;
      if (e?.isVehicle && o.frozen && !e.exploded) this.loosen(o, pair);
      if (!e?.def?.static || e.def.lasting || e.isVehicle || e.dead || e.dying || pair.isSensor) continue;
      pair.isSensor = o.isSensor = true;
      e.break(Math.atan2(o.position.y - b.position.y, o.position.x - b.position.x), this.C.hit.power * 0.6);
    }
  }

  // u (px/step across) kept from carrying its flank into the building fronts (frontsAt, C.front px short of them):
  // their windows and doors are set back in them and a corner sliding along caught in one and held the car there.
  // Held off them as it goes into them: `grind`, its flank there (the scrape's sparks and grind: scrape)
  // (a street only: the chase; the lab has none)
  offFronts(u) {
    this.grind = null;
    if (!this.leg.lanes || !this.world.map) return u;
    const b = this.van.body.bounds, m = this.C.front, [lo, hi] = this.fronts();
    // already past them: the fronts step in ahead of him (a block set forward, the end of a terrace, of a yard): the
    // car is brought back inside their line before it gets there, however he steers
    const over = Math.max(b.max.y - (hi - m), lo + m - b.min.y);
    if (over > 1) { this.grind = null; return (b.max.y > hi - m ? -1 : 1) * Math.min(this.C.steer, over); }
    const held = u > 0 ? Math.min(u, Math.max(0, hi - m - b.max.y)) : Math.max(u, Math.min(0, lo + m - b.min.y));
    if (Math.abs(held) < Math.abs(u) - 0.05) this.grind = { x: this.van.x, y: u > 0 ? hi : lo };
    return held;
  }

  // the building fronts either side of the car, over the columns it covers (frontsAt): [world px y above, below]
  // and over the C.frontAhead tiles ahead of its nose (no map: -+Infinity). Where a street runs across his (the level's `chase.across`: [[col0, col1, row above, row
  // below], ...]) there is no front: the line of the fronts is held across it (those rows), so the wheel never takes
  // him down a side street, nose-on into the corner of the next block
  fronts() {
    const map = this.world.map, b = this.van.body.bounds, r = Math.floor(this.van.y / TILE);
    const nose = Math.floor(b.max.x / TILE), mid = this.street;
    let lo = -Infinity, hi = Infinity;
    for (let c = Math.floor(b.min.x / TILE); map && c <= nose + this.C.frontAhead; c++) {
      const f = frontsAt(map, c, r), x = this.leg.across.find((a) => c >= a[0] && c <= a[1]);
      if (f) { lo = Math.max(lo, f[0]); hi = Math.min(hi, f[1]); }
      else if (c > nose && c < map.w && mid !== null) {
        // a front in his own row, ahead: its face toward the street's middle is the line
        const south = (r + 0.5) * TILE > mid, step = south ? -1 : 1;
        let k = r;
        while ((k + step + 0.5) * TILE > mid === south && isFront(map, c, k + step)) k += step;
        if (south) hi = Math.min(hi, k * TILE); else lo = Math.max(lo, (k + 1) * TILE);
      }
      if (x) { lo = Math.max(lo, x[2] * TILE); hi = Math.min(hi, x[3] * TILE); }
    }
    return [lo, hi];
  }

  // the street's middle line (world px y: his leg's `mid` row, else its lanes'), or null (the lab)
  get street() {
    const row = this.leg.mid;
    return row === null ? null : row * TILE;
  }

  // The body on its springs this step (looks only): what the speeds did since the last one pushes it (a hit that
  // took its speed dives it), the road throws it up now and then, a front wheel onto or off the sidewalk too
  springs(dt) {
    const w = this.world, C = this.C, B = C.body, L = B.lift, v = this.van, S = this.body, was = this.was2;
    const [squat, lean] = bodyLean((this.v - was.v) / dt, (this.u - was.u) / dt, this.u, C);
    const roll = clamp(lean - this.slip * C.slide.lean, -B.most, B.most); // (sliding, it leans out over its outer wheels)
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
    // at speed the shell shivers on its wheels: a blip across, one step long
    v.bob = 0;
    if (this.v >= B.buzz.from && (this.buzzT -= dt) <= 0) {
      this.buzzT = rand(...B.buzz.every);
      v.bob = (chance(0.5) ? 1 : -1) * B.buzz.px;
    }
    // slowed, it comes forward on the picture; it falls back as its speed comes up (frame)
    const K = C.camera;
    this.surge += (K.surge * clamp((1 - this.v / this.cruise - K.from) / (1 - K.from), 0, 1) - this.surge) * Math.min(1, K.ease * dt);
  }

  // the body thrown up on its springs (C.body.lift: 'hit', 'torn', 'kerb', 'shove'), k of it
  bump(kind, k = 1) { this.body.lift += this.C.body.lift[kind] * k; }

  // He is dead at the wheel (the told shot): nobody drives. The car runs on, losing its speed, drifting to a side,
  // until it stops or meets something
  coast() {
    this.dead = true;
    this.coasting = true;
    const lanes = this.leg.lanes;
    this.side = this.van.y > (lanes ? lanes[lanes.length - 1] * TILE : this.van.y) ? -1 : 1;
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

  // SPACE: the lunge toward the side he aims at (above or below the car's centre line)
  shove(aim) {
    const C = this.C, v = this.van, w = this.world;
    this.side = aim && v.toSprite(aim.x, aim.y).sy < v.h / 2 ? -1 : 1;
    this.shoves++;
    this.shoveT = C.shove.dur;
    this.shoved = true;
    this.cool = C.shove.cooldown;
    // the jolt: the picture thrown that way, the body rolled over its wheels and thrown up, smoke off every tyre
    w.shake(C.shove.shake);
    w.camera?.push(0, this.side * C.shove.push);
    this.body.roll -= this.side * C.shove.roll;
    this.slipV += this.side * C.slide.shove; // (the tail is left behind a moment: the nose turns into the lunge)
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
    if (e?.isVehicle && this.bend && (!e.pursuer || e.pursuer.state === 'wrecked')) {
      h.kind = 'flank'; // (in a bend: scraped along its flank, never thrown nor a wall)
      h.first = this.flankOn(o, pair);
    } else if (e?.isVehicle) {
      h.kind = 'car';
      this.loosen(o, pair);
      // a parked car, a wreck: shoved aside by hand (one of theirs still driven, or on its way out, is Pursuit's)
      if (!e.pursuer || (e.pursuer.state === 'wrecked' && !e.pursuer.out)) h.aside = this.aside(o, pair, vel, ov, nx, ny);
      if (!e.onCollide) {
        // what it is shoved into goes too (this drive's: leave takes it back, a new drive gives its own)
        e.onCollide = (o2, pair2) => this.knock(o, o2, pair2);
        this.knocked.set(e, e.onCollide);
      }
    } else if (e && (e.isPlayer || e.isEnemy || e.isCivilian)) h.kind = 'person';
    else if (e?.def && (e.dead || e.dying)) {
      // already falling apart (a parasol torn down as he came under it, its pole still standing a moment): it never
      // holds the car up
      h.kind = 'gives';
      if (!e.def.lasting && !e.isVehicle) { pair.isActive = false; pair.isSensor = true; }
    }
    else if (e?.def && !e.def.lasting) {
      h.kind = 'thing';
      if ((e.def.static || o.frozen) && !e.tipped && fast > C.hit.tear) {
        // it goes: the van is not stopped by it, now (this pair) nor while it falls apart (a sensor from here on; a
        // pair keeps the `isSensor` it was made with, so it is told too)
        pair.isActive = false;
        pair.isSensor = o.isSensor = true;
        e.break(Math.atan2(vel.y, vel.x) + rand(-0.3, 0.3), tearPower(fast, C));
        h.kind = 'torn';
      } else if (this.bend && !o.isStatic && smashable(kgOf(o))) {
        // (in a bend: thrown out of the line whatever its weight up to a dumpster's, and burst as it goes)
        this.fling(o, pair, vel, smashSpeed(kgOf(o), C));
        h.heavy = kgOf(o) > C.hit.fling.kg;
        h.burst = bursts(e.def);
      } else if (!o.isStatic && !o.frozen && kgOf(o) <= C.hit.fling.kg) this.fling(o, pair, vel); // (however slow)
      else this.loosen(o, pair);
    } else if (e && !e.def) h.kind = 'gives'; // a window, a door: their own business
    this.hits.push(h);
  }

  // A light loose thing in its way (a bin, a chair, a crate, a bag) is thrown, by hand: on ahead of the car and out
  // to the side it was hit on, turning, off the floor a moment. The contact itself is dropped (the physics would
  // share the overlap equally between a chair and two tons of car, and hold it up), at any speed: met at a crawl
  // and kept, a bag pinned between the car and a wall held it up
  // (k: the share of the car's speed it goes at; a bend's smash gives a heavy one less, spun more)
  fling(o, pair, vel, k = rand(...this.C.hit.fling.v)) {
    const F = this.C.hit.fling, v = this.van, side = v.toSprite(o.position.x, o.position.y).sy < v.h / 2 ? -1 : 1;
    const sp = Math.max(F.least, Math.hypot(vel.x, vel.y) * k), a = Math.atan2(vel.y, vel.x) + side * rand(...F.side);
    const spin = this.bend ? this.C.bend.smash.spin : F.spin;
    pair.isActive = false;
    pair.isSensor = true;
    if (o.frozen) wake(o);
    if (o.isSleeping) Sleeping.set(o, false);
    Body.setVelocity(o, { x: Math.cos(a) * sp, y: Math.sin(a) * sp });
    Body.setAngularVelocity(o, rand(-spin, spin));
    o.flyUntil = this.world.time + rand(...F.fly);
  }

  // IN A BEND, a car he meets (parked, a wreck: CHASE.bend.smash.flank) is scraped along its flank: the contact is
  // never resolved (the script's line kept; `pair.flank`: a sensor CarFx still showers sparks along, for as long as
  // the two overlap: flankStep), the other car rocked off his flank. True the first time this car is met
  flankOn(o, pair) {
    const F = this.C.bend.smash.flank, v = this.van, b = v.body;
    pair.isActive = false;
    pair.isSensor = true;
    pair.flank = true;
    // (away from his flank, across the way he goes: a car loose already (a wreck) is rocked off it; a parked one,
    // frozen, stays where it is parked: he grinds along it)
    const a = b.angle, side = Math.sign(-(o.position.x - b.position.x) * Math.sin(a) + (o.position.y - b.position.y) * Math.cos(a)) || 1;
    if (!o.frozen && !o.isStatic) {
      if (o.isSleeping) Sleeping.set(o, false);
      const vel = Body.getVelocity(o);
      Body.setVelocity(o, { x: vel.x - Math.sin(a) * side * F.push, y: vel.y + Math.cos(a) * side * F.push });
      Body.setAngularVelocity(o, -side * F.spin);
      o.flyUntil = this.world.time + this.C.hit.fly;
    }
    this.flanks ??= new Map();
    if (this.flanks.has(o.entity)) return false;
    this.flanks.set(o.entity, { dentT: 0, dents: 0, side });
    return true;
  }

  // a step of the cars he is scraping along (flankOn): dents on both flanks every `dent` s, his speed dragged
  flankStep(dt) {
    const F = this.C.bend.smash.flank, w = this.world, v = this.van, b = v.body;
    // (a car already against his when it stopped being driven, a pursuer wrecked on his tail: scraped from now on)
    if (this.bend) {
      for (const pair of w.physics.activePairs()) {
        const o = pair.bodyA === b ? pair.bodyB : pair.bodyB === b ? pair.bodyA : null, e = o?.entity;
        if (e?.isVehicle && !pair.isSensor && e.pursuer?.state === 'wrecked') this.flankOn(o, pair);
      }
    }
    if (!this.flanks?.size) return;
    let rubbing = false;
    for (const pair of w.physics.activePairs()) {
      if (!pair.flank || (pair.bodyA !== b && pair.bodyB !== b)) continue;
      const o = pair.bodyA === b ? pair.bodyB : pair.bodyA, e = o.entity, s = this.flanks.get(e), c = pair.collision.supports?.[0];
      if (!s || !c) continue;
      rubbing = true;
      if ((s.dentT -= dt) > 0 || s.dents >= F.dents) continue;
      s.dentT = F.dent;
      s.dents++;
      // (each dent pushed in toward the middle of the car it is on)
      const q = e.toSprite?.(c.x, c.y), p = v.toSprite(c.x, c.y);
      if (q && e.scar) e.scar(clamp(q.sx, 3, e.w - 3), clamp(q.sy, 3, e.h - 3), Math.atan2(o.position.y - c.y, o.position.x - c.x) - o.angle, 'blunt');
      v.scar?.(clamp(p.sx, 3, v.w - 3), clamp(p.sy, 3, v.h - 3), Math.atan2(b.position.y - c.y, b.position.x - c.x) - b.angle, 'blunt');
    }
    if (rubbing && this.bend) this.bend.v = smashCost(this.bend.v, F.drag * dt, this.bend.b.speed, this.C.bend.smash);
  }

  // the first touch of a car he scrapes in a bend: its alarm and its hazards, a mirror torn off, the panel crumpled
  // there, a burst of sparks and glass; the picture kicked (told on 'carScraped': { car, by, x, y })
  flanked(h) {
    const w = this.world, C = this.C, v = this.van, e = h.e, a = Math.atan2(h.vy, h.vx);
    e.hit?.(0, h.x, h.y, a + Math.PI / 2, 1, 'blunt');
    e.startAlarm?.();
    e.shed?.(h.x, h.y, a + rand(-0.6, 0.6), rand(160, 260), false, 'car_mirror');
    w.particles.sparks(h.x, h.y, a + Math.PI, 1.0, 18, 340);
    w.particles.glass(h.x, h.y, a, 0.9, 10, 200);
    w.sound('carHit', h.x, h.y, 0.9);
    w.shake(C.hit.shake * 0.8);
    this.bump('hit', 0.6);
    w.events.emit('ride', { beat: 'hit', x: h.x, y: h.y });
    w.events.emit('carScraped', { car: e, by: v, x: h.x, y: h.y });
    this.smashed(h.x, h.y);
  }

  // the first thing smashed in a bend: told once a bend ('chaseSmash': the slow motion, systems/ChaseCam.js)
  smashed(x, y) {
    const st = this.bend;
    if (!st || st.smashed) return;
    st.smashed = true;
    this.world.events.emit('chaseSmash', { car: this.van, x, y, bend: st.b });
  }

  // A parked car (or a wreck) he runs into is SHOVED ASIDE, never a wall (C.aside): thrown on ahead of him and out to
  // the side it is on (dead ahead: the side with more room before the building fronts), turning, its tyres off the
  // floor's friction a moment, by how square the hit is (squareOf); the contact itself is not resolved this step (the
  // physics would share the blow between 2 t and 1.3 t and stop him): he only loses the share of his speed asideKeep
  // says (shovedAside), is turned a little off it, his tail kicked out. Closing on it slower than `least` px/step,
  // or he crawling under `slow`: the physics as it is (it leans on it and pushes). { sq, side, along, again } or null
  aside(o, pair, vel, ov, nx, ny) {
    const C = this.C, A = C.aside, w = this.world, v = this.van, b = v.body, e = o.entity;
    const ca = Math.cos(b.angle), sa = Math.sin(b.angle), along = vel.x * ca + vel.y * sa;
    const closing = (vel.x - ov.x) * nx + (vel.y - ov.y) * ny, was = this.asides.get(e);
    // still on the car he has just shoved (it has not cleared his flank yet, or what it was thrown into sent it
    // back): thrown again for nothing more, the contact never resolved: a car he shoved never holds him up
    const again = !!was && w.time - was.at < A.hold;
    if (o.isStatic || along < A.slow || (!again && closing < A.least)) return null;
    // (a sensor for as long as the two overlap, as a thing flung: the physics tells only the start of a contact)
    pair.isActive = false;
    pair.isSensor = true;
    if (again && w.time - was.last < A.again) return null;
    const cover = coverOf(o.bounds.min.y, o.bounds.max.y, b.position.y, v.h) / v.h, sq = squareOf(cover, ca * nx + sa * ny, C);
    const dy = o.position.y - b.position.y;
    let side = again ? was.side : Math.sign(dy) || 1;
    if (!again && Math.abs(dy) < A.dead && this.leg.lanes && w.map) {
      const [lo, hi] = this.fronts();
      side = hi - o.bounds.max.y >= o.bounds.min.y - lo ? 1 : -1;
    }
    const T = asideThrow(sq, kgOf(o), C), a = Math.atan2(vel.y, vel.x), sp = Math.hypot(vel.x, vel.y);
    Body.setVelocity(o, { x: Math.cos(a) * sp * T.along, y: Math.sin(a) * sp * T.along + side * T.across * clamp(sp / C.cruise, 0.4, 1.2) });
    // (hit behind its middle its nose swings in toward him, its tail out; ahead of it, the other way)
    Body.setAngularVelocity(o, side * (o.position.x >= b.position.x ? 1 : -1) * T.spin * rand(0.7, 1.2));
    o.flyUntil = w.time + A.fly;
    this.asides.set(e, { t: 0, at: again ? was.at : w.time, last: w.time, side, o });
    if (again) return { sq, side, along, again };
    // his own car: turned a little off it, the tail kicked out (a square hit: straight through it)
    this.u -= side * A.deflect * (1 - sq) * clamp(sp / C.cruise, 0, 1);
    this.slipV -= side * C.slide.hit * (1 - sq);
    return { sq, side, along, again };
  }

  // A car he shoved aside never shuts all the lanes of his leg (blocksAll: neither side of it leaves his car's width
  // and A.room of the road): slowing down across them, it is pushed on toward its kerb (the side of the street's
  // middle its own is on, else the way it was thrown) at A.push px/step until a way past is clear. Followed A.watch s
  clearLanes(dt) {
    const A = this.C.aside, lanes = this.leg.lanes, b = this.van.body, w = this.world;
    // still over a car he has just shoved (it was thrown into something that held it): out from under him, every
    // `again` s, ahead of him and to its side
    if (this.asides.size && !this.dead) {
      for (const pair of w.physics.activePairs()) {
        const o = pair.bodyA === b ? pair.bodyB : pair.bodyB === b ? pair.bodyA : null, s = o && this.asides.get(o.entity);
        if (!s || !pair.isSensor || w.time - s.at > A.hold || w.time - s.last < A.again) continue;
        const vel = Body.getVelocity(o), T = asideThrow(1, kgOf(o), this.C);
        s.last = w.time;
        Body.setVelocity(o, { x: Math.max(vel.x, this.v * T.along), y: s.side * Math.max(Math.abs(vel.y), T.across) });
        o.flyUntil = w.time + A.fly;
      }
    }
    for (const [e, s] of this.asides) {
      if ((s.t += dt) > A.watch || e.dead) { this.asides.delete(e); continue; }
      if (!lanes || lanes.length < 2 || e.exploded) continue;
      const o = s.o, { band, half } = bandOf(this.leg);
      const vel = Body.getVelocity(o);
      if (Math.abs(vel.y) > A.push || !blocksAll(o.bounds.min.y, o.bounds.max.y, band[0] - half, band[1] + half, this.van.h + A.room)) continue;
      const mid = (band[0] + band[1]) / 2, to = Math.abs(o.position.y - mid) > 4 ? Math.sign(o.position.y - mid) : s.side;
      if (o.frozen) wake(o);
      if (o.isSleeping) Sleeping.set(o, false);
      Body.setVelocity(o, { x: vel.x * 0.9, y: to * A.push });
      o.flyUntil = this.world.time + this.C.fly;
      s.t = Math.min(s.t, A.watch - 1); // (still in the way: watched on)
    }
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
    if (!this.dead) { this.flankStep(dt); this.scrape(dt); this.fx(dt); }
    this.clearLanes(dt);
    this.carry();
    if (!this.dead) this.far = Math.max(this.far, this.along);
    // the end of the road (on the leg it is on, out of any bend): the level is over (the results)
    const end = this.o.end;
    if (end && !this.dead && !w.exited && !this.bend && this.van.x >= end * TILE && this.legI >= legAt(this.route.legs, end * TILE)) {
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
      // (in a bend the line is the script's: what it brushes is a scrape, never the crash)
      if (!this.bend && square && onNose(h.lo, h.hi, h.mid, v.h, C) && !w.player.invulnerable) { this.crash(h); return; }
      if (!this.bend && square && !grazes(h.lo, h.hi, h.mid, v.h, C)) { this.v = Math.min(this.v, C.crash.clip); w.shake(C.hit.shake); this.bump('hit'); w.events.emit('ride', { beat: 'clip', x: h.x, y: h.y }); } // a corner clipped: most of the speed gone
      w.sound('carHit', h.x, h.y, 0.5);
      w.particles.sparks(h.x, h.y, Math.atan2(-h.ny, -h.nx), 1, 8, 260);
      return;
    }
    if (h.aside) { this.shovedAside(h); return; }
    if (h.kind === 'flank') { if (h.first) this.flanked(h); return; }
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
    } else if (h.kind === 'torn') { w.shake(C.hit.shake * 0.5); this.bump('torn'); w.events.emit('ride', { beat: 'torn', x: h.x, y: h.y }); } else if (h.kind === 'thing') this.bump('torn', h.heavy ? 1 : 0.6);
    // (in a bend what it throws bursts as it goes: the alley erupts behind him; the first of it slows the world)
    if (h.burst && e?.break && !e.dead && !e.dying) e.break(a + rand(-0.4, 0.4), tearPower(speed, C));
    if (h.heavy) { w.shake(C.hit.shake * 0.7); w.sound('carHit', h.x, h.y, 0.8); w.particles.sparks(h.x, h.y, a, 1.0, 12, 300); }
    if (this.bend && (h.kind === 'torn' || h.kind === 'thing')) this.smashed(h.x, h.y);
    if (e?.def && (h.kind === 'torn' || h.kind === 'thing')) {
      // what it was made of thrown on ahead, sheets of paper off it, sparks off steel
      const F = C.fx.debris;
      w.particles.chips(h.x, h.y, a, 0.8, F.chips, e.def.chips, speed * F.speed);
      if (e.def.material === 'metal') w.particles.sparks(h.x, h.y, a, 0.9, F.sparks, 300);
      if (e.def.glass) w.particles.glass(h.x, h.y, a, 0.9, F.glass, speed * F.speed);
      w.papers?.drop(h.x, h.y, F.papers[0], a, F.papers[1]);
    }
    // what it cost him: once a step at most (what it was: its `cost`, a toll's arm), and nothing for what was already
    // broken (the bits of it in the air)
    if (h.kind !== 'gives' && !this.lost) {
      this.lost = true;
      // (in a bend the script's speed: a share of it, never under its floor)
      if (this.bend) this.bend.v = this.v = smashCost(this.bend.v, h.heavy ? C.bend.smash.heavyCost : C.bend.smash.cost, this.bend.b.speed, C.bend.smash);
      else this.v *= 1 - (e?.def?.cost ?? C.hit.loss);
    }
  }

  // He shoved a parked car aside (aside): what it cost him (asideKeep of his speed along his nose, never less), and
  // what it looks and sounds like: its alarm and a dent, sparks along the way it went, its glass on a square hit, the
  // picture shaken and his body thrown by how square it was. Told on 'carShoved' ({ car, by, x, y, sq, side })
  shovedAside(h) {
    const w = this.world, C = this.C, v = this.van, e = h.e, { sq, side, along, again } = h.aside, hard = 0.4 + 0.6 * sq;
    const a = Math.atan2(h.vy, h.vx);
    if (again) { w.particles.sparks(h.x, h.y, a + side * 0.6, 1.1, 5, 300); return; } // (still pushing it out: nothing more lost)
    this.v = Math.min(this.v, Math.max(along * asideKeep(sq, C), C.aside.floor * this.cruise));
    this.seen.set(e, w.time);
    h.o.flyUntil = w.time + C.aside.fly;
    e.hit(0, h.x, h.y, a, 1, 'blunt');
    w.sound('carHit', h.x, h.y, hard);
    w.particles.sparks(h.x, h.y, a + side * 0.6, 1.1, Math.round(8 + 14 * hard), 340);
    if (sq > 0.35) w.particles.glass(h.x, h.y, a + side * 0.4, 1.1, Math.round(16 * sq), 220);
    w.shake(C.hit.shake * (0.6 + sq));
    this.bump('hit', hard);
    w.events.emit('ride', { beat: 'hit', x: h.x, y: h.y });
    w.events.emit('carShoved', { car: e, by: v, x: h.x, y: h.y, sq, side });
  }

  // what its speed does around it: tyres letting go (white smoke, rubber left on the road) on a shove or hard
  // steering; spray out of standing water; pigeons, cats and people ahead frightened; an awning or a parasol it
  // drives under torn down
  fx(dt) {
    const w = this.world, C = this.C, F = C.fx, v = this.van, b = v.body, back = b.angle + Math.PI;
    const wheels = v.m.wheels.map(([sx, sy]) => v.toWorld(sx, sy)), rear = wheels.slice(0, 2);
    // (pulling away from the opening: the rear tyres spin)
    if (this.launchT > 0) { this.launchT -= dt; for (const r of rear) w.particles.smoke(r.x, r.y, C.intro.launch.smoke, 3, { speed: 30, size: F.smoke[1], life: F.smoke[2] }); }
    const skid = this.launchT > 0 ? 1 : skidOf(this.u, this.v, this.shoveT > 0, C, this.slip);
    const on = skid > 0 ? rear : null;
    if (on) {
      // (their rubber smoke in the air: systems/CarFx.js; all four in a shove)
      w.events.emit('tyres', { car: v, at: this.shoveT > 0 ? wheels : on, k: skid, dt });
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
      const ahead = this.v * 60 * F.scare.lead, x = v.x + Math.cos(b.angle) * ahead, y = v.y + Math.sin(b.angle) * ahead;
      w.critters?.scare(x, y, F.scare.r, F.scare.r);
      w.ambient?.panicAround(x, y, F.scare.people, 'scream');
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
    if (k > 0 && !this.bend && L.length < W.n * k && chance(k * 0.9)) { // (streaks along +x: none round a corner)
      const side = chance(0.5) ? -1 : 1;
      L.push({
        x: v.x + rand(-W.back, W.ahead), y: Math.round(v.y + side * rand(...W.band)) + 0.5, len: Math.round(W.len[0] + (W.len[1] - W.len[0]) * k * rand(0.4, 1)),
        vx: -this.v * 60 * rand(...W.v), t: 0, life: rand(...W.life), a: W.alpha * rand(0.5, 1) * (0.4 + 0.6 * k),
      });
    }
  }

  // a flank grinding along a wall or a car (or held off the building fronts as he steers into them: grind): sparks and
  // the grind, every so often while it lasts
  scrape(dt) {
    const w = this.world, C = this.C.scrape, b = this.van.body;
    if ((this.scrapeT -= dt) > 0) return;
    const g = this.grind;
    // (the sparks are a shower for as long as it rubs: systems/CarFx.js)
    if (g && this.v >= 1.5) {
      w.sound('vanScrape', g.x, g.y, C.vol);
      w.events.emit('ride', { beat: 'scrape', x: g.x, y: g.y });
      this.scrapeT = C.every;
      return;
    }
    for (const pair of w.physics.activePairs()) {
      if (pair.bodyA !== b && pair.bodyB !== b) continue;
      const o = pair.bodyA === b ? pair.bodyB : pair.bodyA;
      if (!(o.isStatic || o.entity?.isVehicle) || o.entity?.def?.hung) continue;
      const c = pair.collision.supports?.[0];
      if (!c || this.v < 1.5) continue;
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

  // Where the camera looks (viewW: world px across the view; z: picture px a world px). Along the road it is locked
  // on the car, which sits C.camera.at of the view's width from the left whatever it does (no lead, no lag: a car
  // sliding on the picture is drawn between two px, another way every frame); across, on the street's middle (his
  // leg's `mid` row, else its lanes'; none, the lab: on the car). Both on the picture's px grid, from the car's place
  // as it is drawn (Vehicle.draw snaps it the same way), so the car's offset in the picture is one whole number of
  // px, frame after frame. Through a bend and until the next leg's framing is back: the car's place and the eased
  // offset (camStep), each on the grid
  frame(viewW, z = 1) {
    this.viewW = viewW;
    const C = this.C.camera, v = this.van, snap = (n) => Math.round(n * z) / z, mid = this.street, o = this.camOff;
    if (o) return { x: snap(v.x) + snap(o.x), y: snap(v.y) + snap(o.y) };
    // (slowed by a hit it sits `surge` further forward: whole px, like the rest; across, eased between two legs'
    // framings or following him: camY)
    return { x: snap(v.x) + snap(viewW * (0.5 - C.at - this.surge)), y: snap(this.camY ?? (mid === null ? v.y : mid)) };
  }

  // its engine and tyres this step (audio/Motor.js; World hands it to Audio.motor): the gearbox on its real speed,
  // the throttle by what the speed does, the tyres squealing with the slip between the nose and the way it goes,
  // and at a shove
  motor(dt) {
    if (!this.on || this.dead || this.drag?.on) return null; // (the opening: the engine is off)
    // (held at cruise: half open; a hit that takes its speed lifts it, pulling back up to cruise floors it)
    const v = this.van, sp = this.v / this.C.max, dv = this.v - this.lastV;
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

// the lab: a van that can be driven offers its driver's door to E (systems/Uses.js)
export function driveSpot(world, van) {
  const [dx, dy] = doorOf(van);
  return {
    get x() { return van.toWorld(dx, dy).x; },
    get y() { return van.toWorld(dx, dy).y; },
    r: 30, label: 'DRIVE', kind: 'drive',
    ok: () => !world.drive && !van.exploded && !van.dead,
    use: () => { world.drive = new Drive(world, { exit: true, ...world.level?.routes?.[van.route] }, van); }, // (a route of its own: systems/Route.js)
  };
}
