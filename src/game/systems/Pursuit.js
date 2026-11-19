// The pursuers of level 2A (docs/LEVEL2.md, M1b): the boss's men in black sedans with one pink stripe
// (VEHICLES.pursuer). Each is a dynamic Matter body driven like his van (systems/Drive.js): every step a speed and a
// heading are turned into its velocity after reading back what the physics let it do, so it pushes and is pushed for
// real. Its AI comes up ALONGSIDE him, well faster than he cruises, and holds a slot inside his gun's arc, never
// behind him (CHASE.pursuit.slots: abreast in the lane he is not in, a length ahead in it, ahead in his own lane;
// which ones changes now and then: assign), looks ahead in its lane and swerves round what stands there, and swipes
// into him once in a while. HIS SHOVE landing on it is a real blow (shoved): half its hp, thrown sideways out of its
// driver's hands; two wreck it, one that throws it into a parked car, a pole or a wall does. Any other hit that
// throws it off what it was driving leaves it to the physics a moment (`stun`); a hard contact on what does not
// give wrecks it (it stops, smokes, may burn: Vehicle); a wreck is an obstacle like any car.
// Kill rules (his rounds: Vehicle's 'carPart' and the world's 'round' events): the windscreen kills the driver (it
// veers off into what lines the road), a front tyre spins it out, a rear one slows it, the gunman shot stops its
// tells (it still rams), the tank is Vehicle's fire. Each man out is a 'kill' for the scoring (cause 'bullet', 'wreck'
// or 'explosion'; how.car: the tag).
// The gunman's TOLD shot (CHASE.gunman): a white glint at the muzzle, a red line fattening into a wedge toward a
// bracket on a lane band locked when the tell starts (his seat's y then, its x led by his speed), then the shot: his
// seat inside the band and reached (a closed car: through a window or the windscreen; the open one, THE BOSS's
// convertible: across its cabin, Vehicle.crossesSeat) -> dead;
// else a hole in the car or sparks on the road. One gunman tells at a time (the token), a cooldown between two.
// Events go by distance along the road (the level's `chase.events`): the alley car (event 1, its red lane told
// CHASE.alley.red s before it is in his lane), one joining from behind. The lab's dummy (a vehicle with the prop option
// `pursuer`) stays parked and tells now and then, harmlessly.
// DOM-free but for the cars it makes (entities/Vehicle.js); render/PursuitArt.js draws the gunmen, the tells, the red
// lanes and the tracers.
import { TILE, CAT, MASK } from '../Config.js';
import { clamp, angDiff, approachAngle, rand, chance } from '../../engine/math.js';
import { wake } from '../../engine/physics/Body.js';
import { CHASE } from '../data/chase.js';
import { WEAPONS } from '../data/weapons.js';
import Vehicle from '../entities/Vehicle.js';
import { seatOf } from './Drive.js';

const { Body, Sleeping } = Matter;
const FRONT = new Set([2, 3]); // VEHICLES wheels: the front pair (0, 1 the rear)
const DRIVEN = new Set(['cross', 'chase', 'veer', 'limp']);
const ROUNDS = new Set(['bullet', 'rifle', 'pellet', 'graze', 'shrapnel']); // what goes through a windscreen into a driver
const AGAIN = 2; // s a knock from his car counts as his doing (a wreck then is 'shoved')
const SWAP = { lead: 'ahead', ahead: 'lead' }; // he changed lanes: the two ahead of him keep theirs (assign)

// ---------------------------------------------------------------- pure
// the events (level `chase.events`: { at: col, kind, ... }) due once his car is at x (world px), not fired yet
export function dueEvents(events, fired, x) {
  return (events || []).filter((e) => !fired.has(e) && x >= e.at * TILE);
}

// The lane he is in and the other one: { his, other } (y of their middles) for his car at y = py on a road whose two
// lanes' middles are band [y0, y1]. `was`: what it gave last time: he counts as in the other lane only once C.flip
// px past the middle between them (no flutter as he straddles the line). No lanes (the lab): his own line, and one
// C.side px out on his driver's side
export function lanesOf(py, band, was = null, C = CHASE.pursuit) {
  if (!band || band[1] - band[0] < 1) return { his: py, other: py - C.side };
  const mid = (band[0] + band[1]) / 2;
  let top = was ? was.his === band[0] : py < mid;
  if (top && py > mid + C.flip) top = false;
  else if (!top && py < mid - C.flip) top = true;
  return { his: band[top ? 0 : 1], other: band[top ? 1 : 0] };
}

// a slot's point { x, y } for his car's middle at x = px: C.slots[slot] px ahead of it (`rank` x C.more further: the
// cars past the fourth), in the lane it names (lanes: lanesOf)
export function slotOf(slot, px, lanes, rank = 0, C = CHASE.pursuit) {
  const [dx, lane] = C.slots[slot];
  return { x: px + dx + rank * C.more, y: lanes[lane] };
}

// The slots n cars hold, rearmost first: [[slot, rank], ...]. Up to three: n of abreast / lead / ahead (roll 0..1
// picks which: the picture changes when it is drawn again); more: those three and `far`, one behind the other
export function pickSlots(n, roll = Math.random(), C = CHASE.pursuit) {
  const near = Object.keys(C.slots).filter((k) => k !== 'far').sort((a, b) => C.slots[a][0] - C.slots[b][0]);
  if (n >= near.length) return [...near.map((k) => [k, 0]), ...Array.from({ length: n - near.length }, (_, i) => ['far', i])];
  const ways = near.flatMap((a, i) => (n === 1 ? [[a]] : near.slice(i + 1).map((b) => [a, b])));
  return ways[Math.min(ways.length - 1, Math.floor(roll * ways.length))].map((k) => [k, 0]);
}

// the bracket's lock: his seat's y now, its x where his speed takes it in t s (vel: px/step)
export const lockOf = (seat, vel, t) => ({ x: seat.x + vel.x * 60 * t, y: seat.y });

// his seat inside the bracket's box at the shot
export const inBand = (seat, aim, B = CHASE.gunman.band) => Math.abs(seat.x - aim.x) <= B.lead && Math.abs(seat.y - aim.y) <= B.half;

// Does a line from (x0, y0) reach the seat (sprite px) of car v? An open car (a `cabin` in VEHICLES) by its way in
// crossing the cabin by the seat (Vehicle.crossesSeat: anywhere, with him sat there); a closed one through a side
// window (it comes in by a flank within `win` px of the seat's x) or through the windscreen (m.wind, on the first px
// of its way in); never through the panels. A line starting inside its box reaches it.
export function reaches(v, x0, y0, seat, win = CHASE.gunman.window) {
  const a = v.toSprite(x0, y0), dx = seat[0] - a.sx, dy = seat[1] - a.sy, len = Math.hypot(dx, dy) || 1;
  let t0 = 0;
  for (const [p, q] of [[-dx, a.sx], [dx, v.w - a.sx], [-dy, a.sy], [dy, v.h - a.sy]]) if (p < 0) t0 = Math.max(t0, q / p);
  if (t0 <= 0) return true;
  const ex = a.sx + dx * t0, ey = a.sy + dy * t0;
  if (v.m.cabin) return v.crossesSeat(ex, ey, dx / len, dy / len);
  if ((ey <= 1 || ey >= v.h - 1) && Math.abs(ex - seat[0]) <= win) return true;
  for (let k = 0; k <= 30 && t0 + k / len <= 1; k += 2) {
    const f = t0 + k / len;
    if (v.inside(v.m.wind, a.sx + dx * f, a.sy + dy * f)) return true;
  }
  return false;
}

// ---------------------------------------------------------------- the pursuers
export default class Pursuit {
  // chase: the level's `chase` (lanes, kerbs, events); none: the lab (its dummies only)
  constructor(world, chase = null) {
    this.world = world;
    this.chase = chase;
    this.C = CHASE.pursuit;
    this.G = CHASE.gunman;
    this.cars = [];
    this.tell = null;      // { car, t, aim, dur, harmless } the one telling now (the token)
    this.cool = 0;         // s before the next tell may start
    this.fired = new Set(); // the events done
    this.lanes = [];       // red lanes shown: { car, x, y0, y1, t, w, on }
    this.tracers = [];     // { x0, y0, x1, y1, t }
    this.road = null;      // the lane he is in and the other one (lanesOf), as of the last step
    this.crew = '';        // who is in the chase (the slots are dealt again when it changes: assign)
    this.shuffleT = 0;     // s before the slots are dealt again anyway
    const L = chase?.lanes;
    this.band = L ? [Math.min(...L) * TILE, Math.max(...L) * TILE] : null;
    this.halfLane = L?.length > 1 ? (this.band[1] - this.band[0]) / 2 : TILE * 1.75; // half a lane's width (px)
    for (const p of world.props) if (p.isVehicle && p.pursuer) this.add(p, 'parked', { dummy: true });
    for (const e of chase?.events || []) if (e.kind === 'alley') this.alleyCar(e);
    world.events.on('carPart', (e) => this.onPart(e));
    world.events.on('round', (e) => this.onRound(e));
  }

  // his car (Drive's) or, on foot (the lab), himself: { car, seat (world), sseat (sprite px), vel (px/step) }
  target() {
    const w = this.world, d = w.drive, p = w.player;
    if (!p?.alive) return null;
    if (d?.on && !d.dead) {
      const v = d.van, s = seatOf(v);
      return { car: v, seat: v.toWorld(s[0], s[1]), sseat: s, vel: Body.getVelocity(v.body), x: v.x, y: v.y };
    }
    if (d) return null;
    return { car: null, seat: { x: p.x, y: p.y }, sseat: null, vel: p.body ? Body.getVelocity(p.body) : { x: 0, y: 0 }, x: p.x, y: p.y };
  }

  // a pursuer: its car driven from now on (awake, lights on, what it touches told to `contact`)
  add(v, state, o = {}) {
    const b = v.body, w = this.world;
    const car = {
      v, state, h: b.angle, s: o.speed ?? 0, driver: true, gunman: true, dummy: !!o.dummy, slot: 'abreast', rank: 0,
      stun: 0, set: null, t: 0, chaseT: 0, settled: 0, ram: 0, ramSide: 0, veer: 0, by: -Infinity, cause: null,
      dents: 0, shove: 0, hitBy: 0, thrown: false,
      gunSide: 1, gunA: b.angle + Math.PI / 2, telling: false, wreckHit: false, launch: -1, every: this.G.lab.every,
      n: this.cars.length,
    };
    v.pursuer = car;
    v.noAlarm = true;
    v.onCollide = (o2, pair) => this.contact(car, o2, pair);
    if (!car.dummy) {
      v.moving = true; // its lamps follow it (render/Lighting.js)
      v.lightsOut = false;
      b.sleepThreshold = Infinity;
      b.frictionAir = 0;
      b.friction = CHASE.scrape.friction;
      b.collisionFilter = { ...b.collisionFilter, mask: MASK.PROP & ~CAT.CORPSE & ~CAT.DEBRIS & ~CAT.ITEM }; // over the dead, over what is in pieces
      if (this.chase) w.totalEnemies = (w.totalEnemies || 0) + 2; // its driver and its gunman
    }
    this.cars.push(car);
    return car;
  }

  // a new pursuer's car at (x, y) facing a (world px, rad)
  spawn(x, y, a, state, speed = 0) {
    const w = this.world, v = new Vehicle(w, this.C.vehicle, x, y, a);
    w.props.push(v);
    const car = this.add(v, state, { speed });
    if (state !== 'wait') this.loose(car);
    return car;
  }

  // its body set going (a frozen body woken, never asleep) at its speed along its heading
  loose(car) {
    const b = car.v.body;
    wake(b);
    if (b.isSleeping) Sleeping.set(b, false);
    if (car.s > 0 && !car.set) Body.setVelocity(b, { x: Math.cos(car.h) * car.s, y: Math.sin(car.h) * car.s });
  }

  // event 1: the car waiting in the alley mouth (facing north, its lamps on: they are told first)
  alleyCar(e) {
    const [c, r] = e.car;
    const car = this.spawn(c * TILE, r * TILE, -Math.PI / 2, 'wait');
    car.event = e;
    e.waiting = car;
  }

  // ---------------------------------------------------------------- the step (intentions)
  step(dt) {
    const w = this.world;
    if (w.exited) return;
    const tg = this.target();
    // (nothing is set off while he takes the gun off the seat: Drive.grab)
    if (tg && this.chase && !w.drive?.grabbing) for (const e of dueEvents(this.chase.events, this.fired, tg.x)) this.trigger(e, tg);
    this.assign(dt, tg);
    for (const car of this.cars) {
      car.t += dt;
      if (car.state === 'chase') { car.chaseT += dt; if (tg) this.catchUp(car, tg, dt); }
      if (car.state === 'wait' && car.launch >= 0 && (car.launch -= dt) <= 0) this.go(car);
      if (DRIVEN.has(car.state) || car.state === 'spin') this.drive(car, dt, tg);
      this.aimGun(car, tg);
    }
    this.cool = Math.max(0, this.cool - dt);
  }

  trigger(e, tg) {
    const C = this.C, w = this.world;
    this.fired.add(e);
    if (e.kind === 'alley' && e.waiting?.state === 'wait') {
      // the red lane now; the car comes out so as to be in his lane CHASE.alley.red s later
      const car = e.waiting, v = car.v, A = CHASE.alley;
      const edge = (this.band ? this.band[1] : tg.y) + this.halfLane; // his lane's near edge (the lanes' band + half a lane)
      const nose = v.y - v.w / 2;
      car.launch = Math.max(0, A.red - Math.max(0, nose - edge) / (C.spawn.cross * 60));
      const half = v.h / 2 + A.pad, y0 = (this.band ? this.band[0] : tg.y) - this.halfLane;
      this.lanes.push({ car, x: v.x, w: half * 2, y0, y1: v.y - v.w / 2 + 8, t: 0, on: true });
      w.sound('tellClick', v.x, v.y, 0.5);
    } else if (e.kind === 'behind') {
      const y = this.sides(tg).other;
      // behind him, just off the picture, in the lane he is not in (it comes up alongside); past the last wreck
      // lying on the road back there when there is room (a wreck across a narrow street holds a car up a long while)
      const back = tg.x - C.spawn.behind;
      let x = back;
      for (const o of this.cars) {
        if (o.state === 'wrecked' && o.v.x > x - C.spawn.clear && o.v.x < tg.x - C.spawn.near - C.spawn.clear) x = Math.max(x, o.v.x + C.spawn.clear);
      }
      // (room for it: a car abreast of him already is no reason to start further back)
      const full = (at) => this.blockedAt(null, at + 60, y, 150);
      if (full(x)) x = back;
      for (let k = 0; k < 4 && full(x); k++) x -= 200;
      this.spawn(x, y, 0, 'chase', Math.hypot(tg.vel.x, tg.vel.y) + C.spawn.over);
    }
  }

  // the lane he is in and the other one, now
  sides(tg) { return this.road ?? lanesOf(tg.y, this.band, null, this.C); }

  // a car's slot's point, now
  slot(car, tg) { return slotOf(car.slot, tg.x, this.sides(tg), car.rank, this.C); }

  // A car left far behind (held up by a wreck across the street, by what he threw in its way), or hanging off the
  // picture a long while without reaching its slot (boxed in behind him by parked cars knocked into its lane), is
  // brought back up behind the picture on clear road, in the lane he is not in (the slots dealt again: the rearmost
  // one is its): the chase does not let go of him
  catchUp(car, tg, dt) {
    const R = this.C.rubber, v = car.v, sl = this.slot(car, tg);
    car.farT = v.x < tg.x - R.far ? (car.farT || 0) + dt : 0;
    car.heldT = Math.hypot(sl.x - v.x, sl.y - v.y) > R.close ? (car.heldT || 0) + dt : 0;
    if ((car.farT < R.t && car.heldT < R.held) || this.onScreen(v) || this.tell?.car === car) return;
    const x = tg.x - this.C.spawn.near - v.w / 2, y = this.sides(tg).other;
    if (this.blockedAt(car, x + 120, y, 280)) return;
    this.crew = '';
    car.farT = car.heldT = 0;
    car.h = 0;
    car.s = Math.hypot(tg.vel.x, tg.vel.y) + this.C.spawn.over;
    car.stun = 0;
    car.set = null;
    Body.setPosition(v.body, { x, y });
    Body.setAngle(v.body, 0);
    Body.setAngularVelocity(v.body, 0);
    Body.setVelocity(v.body, { x: car.s, y: 0 });
  }

  go(car) {
    car.state = 'cross';
    car.s = this.C.spawn.cross;
    car.t = 0;
    this.loose(car);
  }

  // The slots, all alongside him and ahead (CHASE.pursuit.slots; none behind). They are dealt again when a car joins
  // or leaves the chase and every C.shuffle s (pickSlots: which ones are held changes, so the picture does): the
  // rearmost car takes the rearmost slot, so nobody has to pass anybody. The 'other' lane follows him: when he
  // changes lanes the car abreast comes round to his other side, and the two ahead of him swap their slots rather
  // than their lanes (they would cross each other's way)
  assign(dt, tg) {
    const C = this.C, chasing = this.cars.filter((c) => c.state === 'chase');
    if (tg) {
      const was = this.road;
      this.road = lanesOf(tg.y, this.band, was, C);
      if (was && this.band && was.his !== this.road.his) for (const car of chasing) car.slot = SWAP[car.slot] ?? car.slot;
    }
    const crew = chasing.map((c) => c.n).join();
    if ((this.shuffleT -= dt) > 0 && crew === this.crew) return;
    this.crew = crew;
    this.shuffleT = rand(...C.shuffle);
    const slots = pickSlots(chasing.length, Math.random(), C);
    chasing.sort((a, b) => a.v.x - b.v.x).forEach((car, i) => {
      const [slot, rank] = slots[i];
      if (car.slot !== slot) car.settled = 0;
      car.slot = slot;
      car.rank = rank;
    });
  }

  // ---------------------------------------------------------------- driving
  drive(car, dt, tg) {
    if (car.v.body.frozen || car.v.body.isSleeping) this.loose(car);
    const C = this.C, w = this.world, v = car.v, b = v.body, vel = Body.getVelocity(b);
    // thrown off what it was driving (a shove, a hit): the physics alone a moment
    if (car.set && Math.hypot(vel.x - car.set.x, vel.y - car.set.y) > C.knock.dv && car.state !== 'veer') car.stun = C.knock.stun;
    if (car.state === 'spin') {
      // a front tyre gone: it slides on, turning round, both dying away over spin.dur
      const k = clamp(1 - car.t / C.spin.dur, 0, 1);
      Body.setAngularVelocity(b, car.veer * C.spin.turn * k);
      Body.setVelocity(b, { x: vel.x * (1 - dt * 1.2), y: vel.y * (1 - dt * 1.2) });
      b.flyUntil = w.time + CHASE.fly;
      car.set = null;
      if (k <= 0) this.wreck(car);
      return;
    }
    if (car.stun > 0) {
      car.stun -= dt;
      car.set = null;
      // (thrown by his shove: it scrubs its sideways speed off on its tyres)
      if (car.thrown) Body.setVelocity(b, { x: vel.x, y: vel.y * Math.max(0, 1 - C.shoved.drag * dt) });
      if (car.stun <= 0) car.thrown = false;
      car.h = b.angle;
      car.s = Math.max(0, vel.x * Math.cos(b.angle) + vel.y * Math.sin(b.angle));
      return;
    }
    // what it wants: a heading and a speed
    let wantH = 0, wantS = 0, turn = C.turn;
    const max = car.state === 'limp' ? C.limp : C.max;
    if (car.state === 'cross') {
      wantH = -Math.PI / 2;
      wantS = C.spawn.cross;
      if (this.band && v.y <= this.band[0] + C.spawn.radius) { car.state = 'chase'; car.t = 0; }
    } else if (car.state === 'veer') {
      wantH = car.veer * CHASE.pursuit.veer.steer;
      wantS = Math.max(0, car.s - C.veer.fade * dt);
      turn = C.turn * 0.6;
      if (car.t > C.veer.out) { this.wreck(car); return; }
    } else if (tg) {
      const want = this.want(car, tg, dt, max);
      wantH = want.h; wantS = want.s;
    }
    // what it does: the speed toward what it wants (no more than it really did last step, and a bit), the heading
    // turned toward its want as fast as the speed lets it
    const along = vel.x * Math.cos(car.h) + vel.y * Math.sin(car.h);
    car.s = Math.min(car.s, Math.max(0, along) + CHASE.give);
    car.s = wantS > car.s ? Math.min(wantS, car.s + C.accel * dt) : Math.max(wantS, car.s - C.brake * dt);
    car.h = approachAngle(car.h, wantH, turn * dt * clamp(car.s / 3, 0.2, 1));
    const set = { x: Math.cos(car.h) * car.s, y: Math.sin(car.h) * car.s };
    Body.setVelocity(b, set);
    Body.setAngularVelocity(b, angDiff(b.angle, car.h) * C.nose);
    b.flyUntil = w.time + CHASE.fly;
    car.set = set;
    v.steer = clamp(angDiff(b.angle, car.h) * 2, -0.5, 0.5);
    v.bob = Math.sin(w.time * 9 + car.n) * 0.3 * Math.min(1, car.s / CHASE.cruise);
  }

  // in the chase: its slot's point, kept up with; what stands in its lane ahead swerved round (or braked for); a
  // swipe into his side once in a while. { h, s }
  want(car, tg, dt, max) {
    const C = this.C, v = car.v, band = this.band || [tg.y, tg.y];
    const pv = tg.vel.x, sl = this.slot(car, tg);
    // abreast of him a while: a swipe at him (its gunman gone: more often)
    const dx = sl.x - v.x, dy = sl.y - v.y;
    car.settled = car.slot === 'abreast' && Math.abs(dx) < C.settle * 2 && Math.abs(dy) < C.settle ? car.settled + dt : 0;
    if (car.ram > 0) car.ram -= dt;
    else if (car.settled > C.ram.settle && !car.telling && chance(C.ram.chance * (car.gunman ? 1 : 2) * dt)) {
      car.ram = C.ram.dur;
      car.ramSide = Math.sign(tg.y - v.y) || 1;
      car.settled = 0;
    }
    // His car between it and its slot (he has just changed lanes past it, or thrown it across): never through him.
    // It keeps to its side of him and pulls ahead until it is clear of his nose, then crosses ahead of him, and only
    // drops back to its slot once it is out of his line
    let tx = sl.x, ty = sl.y, hold = false;
    const hc = tg.car;
    if (hc && sl.x < tg.x + (v.w + hc.w) / 2) {
      const long = (v.w + hc.w) / 2 + C.gap, wide = (v.h + hc.h) / 2 + C.margin, off = v.y - tg.y;
      const beyond = Math.abs(off) >= wide && off * (sl.y - tg.y) < 0;                      // the other side of him than its slot
      const across = Math.abs(off) < wide && v.x > tg.x && Math.abs(sl.y - tg.y) >= wide;  // crossing his nose
      if (beyond || across) tx = tg.x + long + C.gap;
      hold = beyond && v.x < tg.x + long;
      if (hold) ty = v.y;
    }
    let vx = clamp(pv + (tx - v.x) * C.close, 0, max);
    // what stands ahead in its lane: the nearest free line to its slot's, or brake for it
    const ahead = v.w / 2 + Math.max(car.s, 2) * 60 * C.look + C.pad;
    const lines = hold ? [ty] : [ty, ...band, (band[0] + band[1]) / 2, ty - 60, ty + 60].map((y) => clamp(y, band[0] - 20, band[1] + 20));
    lines.sort((a, b) => Math.abs(a - ty) - Math.abs(b - ty));
    let block = null;
    // (his car is in the way too, but on the line of a slot in the lane he is not in: it holds that line whatever
    // he does, he may come at it)
    const own = hold || C.slots[car.slot][1] === 'other';
    for (const y of lines) {
      const hit = this.blockedAt(car, v.x, y, ahead, !own || y !== ty);
      if (!hit) { ty = y; block = null; break; }
      block ??= hit;
    }
    // all of them blocked: brake for the nearest; going across to a free one past something in its own way: slow
    // enough to be across before it is there. What is in the way may be going too (one of theirs ahead in its lane,
    // his car): its own speed is kept, C.gap px off it
    const going = (hit) => (hit.p.isVehicle && !hit.p.body.isStatic && !hit.p.body.frozen ? Math.max(0, Body.getVelocity(hit.p.body).x) : 0);
    const nose = v.x + v.w / 2, here = !block && Math.abs(ty - v.y) > 6 && this.blockedAt(car, v.x, v.y, ahead, true);
    if (block) { const bv = going(block); vx = Math.min(vx, Math.max(0, bv + (block.x - nose - (bv > 1 ? C.gap : 80)) * 0.04)); }
    else if (here) vx = Math.min(vx, Math.max(1, going(here) + (here.x - nose - 50) * 0.05));
    let vy = clamp((ty - v.y) * C.lateral, -C.steer, C.steer);
    if (car.ram > 0) vy = car.ramSide * C.ram.v;
    // slow, the wheel turns further (pulling out from behind something)
    const most = C.heading + clamp(1 - car.s / CHASE.cruise, 0, 1) * C.pullOut;
    const h = clamp(Math.atan2(vy, Math.max(vx, 1)), -most, most);
    return { h, s: Math.min(max, Math.hypot(vx, vy)) };
  }

  // What stands in the way of a car's width along y from its tail (x: its middle) to `ahead` px on (world px; from the
  // tail, so that it cuts back in only once past what it went round): the nearest of the cars and solid props whose
  // box crosses that strip (his car only with `his`), or null. No car: a strip `ahead` px either side of x (a place to spawn one).
  blockedAt(car, x, y, ahead, his = false) {
    const w = this.world, half = (car?.v.h ?? 58) / 2 + this.C.margin, x0 = x - (car ? car.v.w / 2 - 6 : ahead), x1 = x + ahead;
    const y0 = y - half, y1 = y + half;
    const mine = his ? null : w.drive?.van;
    let best = null;
    for (const p of w.props) {
      if (p === car?.v || p === mine || !p.body || p.dead || p.def?.hung || p.def?.blind) continue; // (blind: the lorry, never seen coming)
      const bb = p.body.bounds;
      if (bb.max.x < x0 || bb.min.x > x1 || bb.max.y < y0 || bb.min.y > y1) continue;
      if (!p.isVehicle && (bb.max.x - bb.min.x < 22 || !p.def?.blocksPath)) continue; // a bin, a box: it goes over
      if (!best || bb.min.x < best.x) best = { x: bb.min.x, p };
    }
    return best;
  }

  // ---------------------------------------------------------------- what it runs into
  // The physics found it touching o (before resolving it): his car only knocks it, or his shove lands on it (dealt
  // with after the physics: shoved); a frozen car is woken (shoved on); a bolted thing torn off; on what does not
  // give (a wall, a lasting thing, a pole), or on a car, closing hard enough: wrecked (after the physics: after()).
  contact(car, o, pair) {
    const w = this.world, v = car.v, b = v.body, e = o.entity;
    if (car.state === 'wrecked' || v.exploded) return;
    const vel = Body.getVelocity(b), ov = o.isStatic ? { x: 0, y: 0 } : Body.getVelocity(o);
    const n = pair.collision.normal;
    const close = Math.abs((vel.x - ov.x) * n.x + (vel.y - ov.y) * n.y);
    // his car: a knock of his doing (his steering into it), not when it is the one swiping at him; his shove going
    // its way lands on it, once a shove
    if (e && e === w.drive?.van) {
      this.lunged(car);
      if (w.drive.lunge || car.ram <= 0) car.by = w.time;
      return;
    }
    const k = w.time - car.by < AGAIN ? this.C.wreck.thrown : 1; // thrown by his car: it takes less
    if (e?.isVehicle) {
      if (o.frozen) { wake(o); pair.inverseMass = pair.bodyA.inverseMass + pair.bodyB.inverseMass; }
      if (o.isSleeping) Sleeping.set(o, false);
      o.flyUntil = w.time + CHASE.hit.fly;
      if (close >= this.C.wreck.car * k || (car.state === 'veer' && close > 1)) car.wreckHit = true;
      return;
    }
    if (!o.isStatic || e?.def?.hung || e?.dead || e?.dying) return;
    // a bolted thing (a bin, a hydrant, a bench) is torn off and it goes on; a wall, a lasting thing, a pole stop it
    const pole = this.C.wreck.poles.includes(e?.type);
    if (e?.def?.static && !e.def.lasting && !pole && !e.tipped) {
      if (close > CHASE.hit.tear) { pair.isActive = false; pair.isSensor = o.isSensor = true; e.break(Math.atan2(vel.y, vel.x), CHASE.hit.power); }
      return;
    }
    if (close >= this.C.wreck.hard * k || (car.state === 'veer' && close > 1)) car.wreckHit = true;
  }

  // his car touches it: his shove under way, going its way, lands on it (once a shove; dealt with in after())
  lunged(car) {
    const d = this.world.drive, n = d.lunge;
    if (n && car.shove !== n && Math.sign(car.v.y - d.van.y) === d.side) { car.shove = n; car.hitBy = d.side; }
  }

  // His shove landed on it (side: the way he lunged, -1: -y): C.shoved.cost of its hp gone (the second one wrecks
  // it), and it is thrown that way out of its driver's hands, turning, its gunman's shot off; what it is thrown into
  // within AGAIN s takes less to wreck it (contact: wreck.thrown). The lab's dummy is knocked loose the same way
  shoved(car, side) {
    const S = this.C.shoved, w = this.world, v = car.v, b = v.body;
    if (car.state === 'wrecked' || v.exploded) return;
    car.dents++;
    car.by = w.time;
    if (car.dummy) this.lift(car);
    const vel = Body.getVelocity(b);
    Body.setVelocity(b, { x: vel.x, y: side * S.throw });
    Body.setAngularVelocity(b, side * S.spin);
    b.flyUntil = w.time + (car.dummy ? CHASE.hit.fly : S.stun);
    w.particles.glass(v.x, v.y - side * v.h / 2, -side * Math.PI / 2, 1, 8, 180);
    if (car.dents * S.cost >= 1) { this.wreck(car); return; }
    v.hp = Math.min(v.hp, v.m.hp * (1 - car.dents * S.cost));
    car.stun = S.stun;
    car.thrown = true;
    car.set = null;
    car.ram = 0;
    if (this.tell?.car === car) this.endTell();
  }

  // wrecked: it stops (the floor's friction back on it), its engine smokes, it may catch fire; who was in it is out
  wreck(car) {
    if (car.state === 'wrecked') return;
    const w = this.world, v = car.v, b = v.body, C = this.C.wreck;
    car.state = 'wrecked';
    car.stun = 0;
    car.thrown = false;
    car.set = null;
    if (this.tell?.car === car) this.endTell();
    b.frictionAir = 0.02;
    b.friction = 0.6;
    b.sleepThreshold = 60;
    b.flyUntil = 0;
    v.steer = 0; v.bob = 0;
    if (!v.exploded) {
      v.hp = Math.min(v.hp, v.m.hp * C.smoke);
      if (chance(C.fire)) v.ignite();
      w.sound('pursuerWreck', v.x, v.y, 1);
      w.particles.sparks(v.x, v.y, b.angle + Math.PI, 1.2, 16, 300);
      w.particles.glass(v.x, v.y, b.angle + Math.PI, 1, 10, 160);
      w.shake?.(0.25);
    }
    // the men in it: the driver, unless he was shot (his kill told then), and the gunman if still in it
    const how = w.time - car.by < AGAIN ? 'shoved' : 'wrecked';
    if (car.driver) { car.driver = false; this.credit(v, car.cause ?? how, 'wreck'); }
    if (car.gunman) { car.gunman = false; this.credit(this.gunPoint(car), how, 'wreck'); }
  }

  // ---------------------------------------------------------------- his rounds
  // a window or a tyre of a pursuer taken by a round (Vehicle.hitWindow / popTire)
  onPart({ car: v, part, i, kind }) {
    const car = v.pursuer, w = this.world;
    if (!car || car.state === 'wrecked' || v.exploded) return;
    if (part === 'wind' && !ROUNDS.has(kind)) return; // a screen cracked by a knock or a blast: nobody shot
    if (part === 'wind' && car.driver) {
      // the driver: it veers off toward a side (the one it is nearer, mostly), out of control
      car.driver = false;
      this.credit(v, 'driver', 'bullet');
      w.particles.blood?.(v.x, v.y, v.body.angle + Math.PI, 0.8, 8, 140);
      if (this.tell?.car === car) this.endTell();
      const mid = this.band ? (this.band[0] + this.band[1]) / 2 : v.y;
      car.veer = (v.y < mid ? -1 : 1) * (chance(0.8) ? 1 : -1);
      car.cause = 'driver';
      car.state = 'veer';
      car.t = 0;
      if (car.dummy) { car.s = 2.5; this.lift(car); }
    } else if (part === 'tyre' && FRONT.has(i) && DRIVEN.has(car.state)) {
      // a front tyre: it spins out
      const b = v.body, C = this.C.spin, side = v.m.wheels[i][1] < v.h / 2 ? -1 : 1;
      car.cause = car.driver ? 'tyre' : car.cause;
      car.state = 'spin';
      car.t = 0;
      if (this.tell?.car === car) this.endTell();
      const vel = Body.getVelocity(b);
      Body.setVelocity(b, { x: vel.x * C.keep, y: vel.y * C.keep });
      car.veer = side;
    } else if (part === 'tyre' && car.dummy) {
      this.lift(car);
      Body.setAngularVelocity(car.v.body, (v.m.wheels[i][1] < v.h / 2 ? -1 : 1) * this.C.spin.turn * 0.5);
    } else if (part === 'tyre' && car.state === 'chase') car.state = 'limp';
  }

  // the lab's dummy set moving by what it took (its body loose, driven no more)
  lift(car) {
    const b = car.v.body;
    this.loose(car);
    b.frictionAir = 0.02;
    if (car.state === 'veer') {
      b.sleepThreshold = Infinity;
      b.frictionAir = 0;
    }
  }

  // a round's way this step (Projectile 'round'): a gunman on it is shot
  onRound({ x0, y0, x1, y1, owner }) {
    if (!owner?.isPlayer) return;
    const r = this.G.r;
    for (const car of this.cars) {
      if (!car.gunman || car.state === 'wrecked') continue;
      const g = this.gunPoint(car), dx = x1 - x0, dy = y1 - y0, L = dx * dx + dy * dy || 1;
      const k = clamp(((g.x - x0) * dx + (g.y - y0) * dy) / L, 0, 1);
      if (Math.hypot(x0 + dx * k - g.x, y0 + dy * k - g.y) > r) continue;
      this.shootGunman(car, Math.atan2(dy, dx));
    }
  }

  shootGunman(car, a) {
    const w = this.world, g = this.gunPoint(car);
    car.gunman = false;
    car.shot = true;
    if (this.tell?.car === car) this.endTell();
    w.particles.blood?.(g.x, g.y, a, 0.7, 10, 160);
    w.sound('gore', g.x, g.y, 0.7);
    this.credit(g, 'gunman', 'bullet');
  }

  // a man of a car out: a kill of his (the scoring: cause, the tag in how.car)
  credit(at, tag, cause) {
    const w = this.world, p = w.player;
    w.events.emit('kill', { victim: { x: at.x, y: at.y, isPursuer: true, aware: 1, knocked: 0 }, cause, killer: p, how: { car: tag } });
  }

  // ---------------------------------------------------------------- the gunman and his tell
  // where the gunman leans out (world px): his seat's x in the car, `lean` px out of the side toward the runner
  gunPoint(car) {
    const v = car.v, G = this.G;
    return v.toWorld(v.w * G.seat, car.gunSide < 0 ? -G.lean : v.h + G.lean);
  }

  // the muzzle: a little way from his head along where he points
  muzzle(car) {
    const g = this.gunPoint(car);
    return { x: g.x + Math.cos(car.gunA) * 9, y: g.y + Math.sin(car.gunA) * 9 };
  }

  // he leans out on the runner's side and points at him (at the bracket while telling): the side of his own car's
  // middle line the runner's SEAT is on (kept until it is G.keep px past it: from a car dead ahead of him he does not
  // flutter from one window to the other), up to G.cone off square out of it (back along the flank, from ahead)
  aimGun(car, tg) {
    if (!car.gunman || !tg) return;
    const v = car.v, G = this.G;
    if (!car.telling) {
      const off = v.toSprite(tg.seat.x, tg.seat.y).sy - v.h / 2;
      if (Math.abs(off) > G.keep) car.gunSide = off < 0 ? -1 : 1;
    }
    const g = this.gunPoint(car), at = car.telling ? this.tell.aim : tg.seat;
    const out = v.body.angle + car.gunSide * Math.PI / 2;
    car.gunA = out + clamp(angDiff(out, Math.atan2(at.y - g.y, at.x - g.x)), -G.cone, G.cone);
  }

  // can this car's gunman start a tell now?
  canTell(car, tg) {
    const G = this.G;
    if (!tg || !car.gunman || !car.driver || this.tell || this.cool > 0 || this.world.drive?.grabbing) return false;
    if (!car.dummy && this.busy(tg)) return false;
    if (car.dummy ? car.state !== 'parked' : car.state !== 'chase' || car.chaseT < G.grace) return false;
    const m = this.muzzle(car), d = Math.hypot(tg.seat.x - m.x, tg.seat.y - m.y);
    if (d > (car.dummy ? G.lab.range : G.range) || !this.onScreen(car.v)) return false;
    // straight on the road, his line out of his own window (never across his car)
    const v = car.v, out = v.body.angle + car.gunSide * Math.PI / 2, g = this.gunPoint(car);
    if (!car.dummy && Math.abs(angDiff(0, v.body.angle)) > G.straight) return false;
    if (Math.abs(angDiff(out, Math.atan2(tg.seat.y - g.y, tg.seat.x - g.x))) > G.cone) return false;
    return !tg.car || reaches(tg.car, m.x, m.y, tg.sseat);
  }

  // one thing told at a time on the back road: no gunman starts while a red lane is on, a lorry is told or backing,
  // nor in the `quiet` px of road before an event that tells something (the level's events go by distance)
  busy(tg) {
    if (this.lanes.some((L) => L.on) || this.world.lorries?.told().length) return true;
    return (this.chase?.events || []).some((e) => !this.fired.has(e) && e.kind !== 'behind' && tg.x > e.at * TILE - this.G.quiet);
  }

  onScreen(v) {
    const r = this.world.view?.();
    return !r || (Math.abs(v.x - r.x) < r.hw + 10 && Math.abs(v.y - r.y) < r.hh + 10);
  }

  startTell(car, tg) {
    const G = this.G, dur = G.glint + G.line;
    this.tell = { car, t: 0, dur, aim: lockOf(tg.seat, tg.vel, dur), harmless: car.dummy, shot: false };
    car.telling = true;
    const m = this.muzzle(car);
    this.world.sound('tellClick', m.x, m.y, 0.8);
  }

  endTell() {
    if (this.tell) this.tell.car.telling = false;
    this.tell = null;
    this.cool = rand(...this.G.cool);
  }

  // the shot: his seat in the bracket and reached -> dead; else the round lands where it was told (a hole in his car
  // on the way, or sparks off the road)
  shoot() {
    const w = this.world, T = this.tell, car = T.car, m = this.muzzle(car), tg = this.target();
    const a = Math.atan2(T.aim.y - m.y, T.aim.x - m.x);
    w.sound('pistol', m.x, m.y, 1); // his 1911 (the recorded shot)
    w.light?.(m.x, m.y, 50, '#fff1d8', 0.06);
    w.particles.sparks(m.x, m.y, a, 0.3, 4, 300);
    let end = { x: T.aim.x + Math.cos(a) * 30, y: T.aim.y + Math.sin(a) * 30 };
    const hit = tg && !T.harmless && inBand(tg.seat, T.aim) && (!tg.car || reaches(tg.car, m.x, m.y, tg.sseat));
    if (hit) {
      end = tg.seat;
      this.killRunner(tg, a);
    } else {
      const v = tg?.car, through = v && this.hullHit(v, m, end);
      if (through) {
        const { sx, sy } = v.toSprite(through.x, through.y);
        v.hole(sx, sy);
        w.particles.sparks(through.x, through.y, a + Math.PI, 0.8, 8, 260);
        w.sound('carHit', through.x, through.y, 0.6);
        end = through;
      } else {
        w.particles.sparks(end.x, end.y, a + Math.PI, 0.9, 6, 220);
        w.particles.dust?.(end.x, end.y, 4, 2, '#5a5260', { speed: 30, size: 2, life: 0.4, alpha: 0.3 });
        w.sound('ricochet', end.x, end.y, 0.5);
      }
    }
    this.tracers.push({ x0: m.x, y0: m.y, x1: end.x, y1: end.y, t: 0 });
    this.endTell();
  }

  // where the line from m to e first meets car v's box (world px), or null
  hullHit(v, m, e) {
    const a = v.toSprite(m.x, m.y), b = v.toSprite(e.x, e.y), dx = b.sx - a.sx, dy = b.sy - a.sy;
    let t0 = 0, t1 = 1;
    for (const [p, q] of [[-dx, a.sx], [dx, v.w - a.sx], [-dy, a.sy], [dy, v.h - a.sy]]) {
      if (p === 0) { if (q < 0) return null; continue; }
      const r = q / p;
      if (p < 0) t0 = Math.max(t0, r); else t1 = Math.min(t1, r);
    }
    if (t0 > t1 || t0 <= 0) return null;
    return v.toWorld(a.sx + dx * t0, a.sy + dy * t0);
  }

  // the told shot reached him at the wheel: dead as any man shot (Character.kill: the death screen, R restarts the
  // level from its start); in an open car he stays at the wheel, slumped over it; nobody driving, the car runs on,
  // drifts and stops (Drive.coast)
  killRunner(tg, a) {
    const w = this.world, p = w.player, d = w.drive;
    if (!p.alive || p.invulnerable) return;
    w.shake?.(0.5);
    const before = w.corpses.length;
    p.kill(a, 'bullet', { isEnemy: true, kind: 'gunman', weapon: { type: 'pistol' } }, WEAPONS.pistol, { tell: true });
    if (p.alive) return;
    if (tg.car?.rider === p && tg.car.m.cabin) {
      // an open car: he stays at the wheel, slumped over it (no body left lying on the road under the car)
      for (const c of w.corpses.slice(before)) {
        for (const part of c.parts || [c]) if (part.body) w.removeBody(part.body);
        for (const j of c.joints || []) w.physics.remove(j.c);
        c.dead = true;
      }
      tg.car.slumpIn();
      w.particles.blood?.(tg.seat.x, tg.seat.y, a, 0.9, 12, 150);
    } else if (tg.car?.rider === p) tg.car.unseat();
    if (d) d.coast();
  }

  // ---------------------------------------------------------------- after the physics
  after(dt) {
    const w = this.world, tg = this.target(), d = w.drive;
    // (the physics tells only the start of a contact: his shove lands on a car he was already leaning on too)
    if (d?.on && d.lunge) {
      for (const pair of w.physics.activePairs()) {
        const o = pair.bodyA === d.van.body ? pair.bodyB : pair.bodyB === d.van.body ? pair.bodyA : null;
        if (o?.entity?.pursuer) this.lunged(o.entity.pursuer);
      }
    }
    for (const car of this.cars) {
      if (car.hitBy) this.shoved(car, car.hitBy);
      car.hitBy = 0;
      if (car.wreckHit && car.state !== 'wrecked') this.wreck(car);
      car.wreckHit = false;
      if (car.v.exploded && (car.driver || car.gunman)) {
        if (car.driver) this.credit(car.v, null, 'explosion');
        if (car.gunman) this.credit(this.gunPoint(car), null, 'explosion');
        car.driver = car.gunman = false;
        if (this.tell?.car === car) this.endTell();
        car.state = 'wrecked';
      }
      if (tg && DRIVEN.has(car.state) && car.v.x < tg.x - this.C.lost) {
        if (this.tell?.car === car) this.endTell();
        car.state = 'lost';
        Body.setVelocity(car.v.body, { x: 0, y: 0 });
        car.v.body.flyUntil = 0;
      }
    }
    this.stepTell(dt, tg);
    this.stepLanes(dt);
    for (const tr of this.tracers) tr.t += dt;
    this.tracers = this.tracers.filter((tr) => tr.t < this.G.tracer);
  }

  stepTell(dt, tg) {
    const T = this.tell;
    if (T) {
      if (!tg && !T.harmless) { this.endTell(); return; }
      T.t += dt;
      if (T.t >= T.dur) this.shoot();
      return;
    }
    if (this.cool > 0 || !tg) return;
    for (const car of this.cars) {
      if (car.dummy && (car.every -= dt) > 0) continue;
      if (!this.canTell(car, tg)) continue;
      if (car.dummy) car.every = this.G.lab.every;
      this.startTell(car, tg);
      return;
    }
  }

  // the alley car's red lane: on until the car is through his lane (or out of its run), then fading
  stepLanes(dt) {
    for (const L of this.lanes) {
      L.t += dt;
      const v = L.car.v, through = this.band ? v.y + v.w / 2 < this.band[1] - TILE * 0.5 : L.t > 2;
      if (L.on && (through || !['wait', 'cross'].includes(L.car.state))) L.on = false;
      if (!L.on) L.fade = (L.fade ?? 0) + dt;
    }
    this.lanes = this.lanes.filter((L) => (L.fade ?? 0) < 0.3);
  }

  // the HUD's chevrons: the pursuers still after him, off the picture
  hunters() { return this.cars.filter((c) => (c.state === 'chase' || c.state === 'limp') && c.driver); }
}
