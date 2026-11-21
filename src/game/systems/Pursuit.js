// The pursuers of level 2A (docs/LEVEL2.md, M1b): the boss's men in black sedans with one pink stripe
// (VEHICLES.pursuer). Each is a dynamic Matter body driven like his car (systems/Drive.js): every step a speed and a
// heading are turned into its velocity after reading back what the physics let it do, so it pushes and is pushed for
// real. Its AI comes up ALONGSIDE him, well faster than he cruises, and holds a slot inside his gun's arc, never
// behind him (CHASE.pursuit.slots: abreast in the lane he is not in, a length ahead in it, ahead in his own lane;
// which ones changes now and then), looks ahead in its lane and swerves round what stands there (a parked car he
// shoved into a lane too). THEY TAKE TURNS ATTACKING, one at a time, each TOLD: the gunman's shot, a RAM from
// abreast, a BRAKE from ahead in his lane. Hurt by a shove, a car keeps its distance a moment (`hurt`). Each has a
// style (the level's events): gunner, rammer, blocker. HIS SHOVE landing on it is a real blow: half its hp, thrown
// sideways out of its driver's hands; two wreck it, one that throws it into a parked car, a pole or a wall does.
// Kill rules (his rounds: Vehicle's 'carPart' and the world's 'round' events): a burst through the windscreen kills
// the driver, a front tyre spins it out, a rear one slows it, the gunman shot stops its tells (it still rams), a long
// burst on its body wrecks it in stages. Each man out is a 'kill' for the scoring (cause 'bullet', 'wreck' or
// 'explosion'; how.car: the tag). A car stopped for good while it was going makes its EXIT off his line.
// THE ROUTE (systems/Route.js): what is said of "the road" is the leg of it a car is on (its lanes, two or more).
// Every one of them reaching a bend follows the same line through it as his car, out of it its slots again on the
// next leg. A car on a leg he is not on sees him where the route puts him on its own leg (tgFor).
// The lab's dummy (a vehicle with the prop option `pursuer`) stays parked and tells now and then, harmlessly.
// The rest is in systems/pursuit/, each part working on this pursuit's state:
//   slots.js     the lanes, the slots and who holds which (assign), him as seen from another leg (tgFor)
//   steering.js  how a car drives (driveCar) and what it wants (want: its slot, what is in its way, its attack)
//   bends.js     through a scripted bend on his line
//   contacts.js  what it runs into (contact, called by the physics), his shove landing on it (lunged, shoved)
//   wreck.js     stopped for good (wreck, pileUp), the exit, who is in its way, his rounds on it, its damage
//   gunman.js    the gunman, his told shot, his death
//   attacks.js   whose turn, the ram and the brake
//   events.js    what happens by distance (the alley car, one from behind)
// What it shares with his car: systems/chase/shared.js. DOM-free but for the cars it makes (entities/Vehicle.js);
// render/PursuitArt.js draws the gunmen, the tells, the red lanes and the tracers.
import { CHASE } from '../data/chase.js';
import { wake } from '../../engine/physics/Body.js';
import Vehicle from '../entities/Vehicle.js';
import { routeOf, legAt, bandOf } from './Route.js';
import { driveBody, otherOf } from './chase/shared.js';
import { seatOf } from './drive/rules.js';
import { assign, slot, tgFor } from './pursuit/slots.js';
import { blockedAt, catchUp, driveCar, DRIVEN, go } from './pursuit/steering.js';
import { bendDrive, toBend } from './pursuit/bends.js';
import { contact, lunged, shoved, smash } from './pursuit/contacts.js';
import { creditCrew, exit, leave, onPart, shotUp, wreck } from './pursuit/wreck.js';
import { aimGun, busy, endTell, gunPoint, killRunner, muzzle, onRound, pistolOf, stepTell } from './pursuit/gunman.js';
import { endAttack, stepAttack } from './pursuit/attacks.js';
import { alleyCar, dropOut, dueEvents, spawnX, stepLanes, trigger } from './pursuit/events.js';

const { Body, Sleeping } = Matter;

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
    this.waiting = new Map(); // an alley event -> its car waiting in the alley mouth (alleyCar)
    this.lanes = [];       // red lanes shown: { car, x, y0, y1, t, w, on }
    this.tracers = [];     // { x0, y0, x1, y1, t, car, s0, s1 }: its ends in the world and in his car's sprite (toSprite)
    this.road = null;      // the lane he is in and the other one (lanesOf), as of the last step
    this.crew = '';        // who is in the chase (the slots are dealt again when it changes: assign)
    this.shuffleT = 0;     // s before the slots are dealt again anyway
    this.attack = null;    // a ram or a brake under way: { car, kind, t, side } (one attack at a time, with the tells)
    this.turn = 0;         // how many attacks have been made (nextAttack: whose turn)
    this.blockers = null;  // what may stand in a car's way (blockedAt: looked up again only when props come or go)
    this.propsN = -1;      // how many props the world had when it was looked up
    this.route = routeOf(chase || {}); // its legs and bends (systems/Route.js; the lab: one leg, no lanes)
    for (const p of world.props) if (p.isVehicle && p.pursuer) this.add(p, 'parked', { dummy: true });
    for (const e of chase?.events || []) if (e.kind === 'alley') alleyCar(this, e);
    world.events.on('carPart', (e) => onPart(this, e));
    world.events.on('round', (e) => onRound(this, e));
  }

  // his car (Drive's) or, on foot (the lab), himself: { car, seat (world), sseat (sprite px), vel (px/step) }
  target() {
    const w = this.world, d = w.drive, p = w.player;
    if (!p?.alive) return null;
    if (d?.on && !d.dead) {
      const v = d.car, s = seatOf(v);
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
      stun: 0, set: null, t: 0, chaseT: 0, settled: 0, ram: 0, by: -Infinity, cause: null,
      dents: 0, shove: 0, hitBy: 0, thrown: false, out: null, gone: false, burnT: 0,
      gunSide: 1, gunA: b.angle + Math.PI / 2, telling: false, wreckHit: false, launch: -1, every: this.G.lab.every,
      n: this.cars.length,
      style: o.style ?? 'gunner', // how it fights (the level's events): 'gunner', 'rammer' (no told shot), 'blocker'
      lineY: null,           // the line across the road it steers for, eased (easeLine); the one it chose last
      line: null,
      bend: null,            // a bend under way (Route.enterBend's state), and the next one on its way (-1: none)
      bendI: this.route.bends.findIndex((q) => q.x > b.position.x),
      hurt: 0,               // s it keeps its distance after a shove that did not wreck it
      slip: 0, slipV: 0,     // its rear out (drive/rules.js slideStep: the same slide as his car's)
    };
    v.pursuer = car;
    v.noAlarm = true;
    v.burnAt = 1 - this.C.rounds.fire; // (its fire is a stage of the damage: shotUp)
    v.leakAt = this.C.rounds.leak;
    v.tread = this.C.rounds.tyre;       // a tyre goes to a burst at it, not to a stray round (Vehicle.tyreHit)
    v.late = true;                      // it blows up when its fire's fuse is out, off to the side by then (exit)
    v.onCollide = (o2, pair) => contact(this, car, o2, pair);
    if (!car.dummy) {
      v.moving = true; // its lamps follow it (render/Lighting.js)
      v.lightsOut = false;
      driveBody(b);
      if (this.chase) w.totalEnemies = (w.totalEnemies || 0) + 2; // its driver and its gunman
    }
    this.cars.push(car);
    return car;
  }

  // a new pursuer's car at (x, y) facing a (world px, rad)
  spawn(x, y, a, state, speed = 0, style = undefined) {
    const w = this.world, v = new Vehicle(w, this.C.vehicle, x, y, a);
    w.props.push(v);
    const car = this.add(v, state, { speed, style });
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

  // ---------------------------------------------------------------- the step (intentions)
  step(dt) {
    const w = this.world;
    if (w.exited) return;
    const tg = this.target();
    // (nothing is set off while he takes the gun off the seat: Drive.grab)
    if (tg && this.chase && !w.drive?.grabbing) for (const e of dueEvents(this.chase.events, this.fired, tg.x)) trigger(this, e, tg);
    this.assign(dt, tg);
    stepAttack(this, dt, tg);
    for (const car of this.cars) {
      car.t += dt;
      car.hurt = Math.max(0, car.hurt - dt);
      const seen = tgFor(this, car, tg); // (him as it sees him from its leg)
      if (car.state === 'chase') { car.chaseT += dt; if (tg && !car.bend) catchUp(this, car, seen, dt, tg); }
      if (car.state === 'wait' && car.launch >= 0 && (car.launch -= dt) <= 0) go(this, car);
      if (car.out) exit(this, car, dt, tg);
      else if (DRIVEN.has(car.state)) {
        toBend(this, car);
        if (car.bend) bendDrive(this, car, dt);
        else driveCar(this, car, dt, seen);
      }
      aimGun(this, car, tg);
    }
    this.cool = Math.max(0, this.cool - dt);
  }

  // ---------------------------------------------------------------- after the physics
  after(dt) {
    const w = this.world, tg = this.target(), d = w.drive;
    // (the physics tells only the start of a contact: his shove lands on a car he was already leaning on too)
    if (d?.on && d.lunge) {
      for (const pair of w.physics.activePairs()) {
        const o = otherOf(pair, d.car.body);
        if (o?.entity?.pursuer) lunged(this, o.entity.pursuer);
      }
    }
    for (const car of this.cars) {
      if (car.hitBy) shoved(this, car, car.hitBy);
      car.hitBy = 0;
      if (car.wreckHit && car.state !== 'wrecked') wreck(this, car);
      car.wreckHit = false;
      if (DRIVEN.has(car.state) || car.state === 'parked') shotUp(this, car, dt, tg); // (the lab's dummy shows it too)
      if (car.v.exploded && (car.driver || car.gunman)) {
        creditCrew(this, car, null, 'explosion', null);
        if (this.tell?.car === car) endTell(this);
        car.state = 'wrecked';
        leave(this, car);
      }
      if (tg && DRIVEN.has(car.state) && car.v.x < tg.x - this.C.lost) dropOut(this, car);
    }
    // (out of it for good and left far behind, or gone from the world: no longer one of theirs to drive or count;
    // the wreck stays on the road as any car)
    this.cars = this.cars.filter((c) => !(c.v.dead || (tg && !c.dummy && !c.out && (c.state === 'wrecked' || c.state === 'lost') && c.v.x < tg.x - this.C.lost)));
    stepTell(this, dt, tg);
    stepLanes(this, dt);
    for (const tr of this.tracers) tr.t += dt;
    this.tracers = this.tracers.filter((tr) => tr.t < this.G.tracer);
  }

  // their top speed: C.max, as much more as his leg's cruise is over the chase's (the toll's road at 90 km/h: they
  // keep the same margin over him)
  top() { return this.C.max + Math.max(0, (this.route.legs[this.hisLeg]?.cruise ?? CHASE.cruise) - CHASE.cruise); }

  // the leg a car or a point (world px x) is on, and that leg's band across (Route.bandOf: { band, half, rows })
  legOf(x) { return legAt(this.route.legs, x); }
  roadAt(x) { return bandOf(this.route.legs[this.legOf(x)]); }
  // the leg he is on (in a bend: the one it takes him to), and its lanes' band (the road the slots are on)
  get hisLeg() { const d = this.world.drive; return d?.on && d.route ? d.legI : this.legOf(this.target()?.x ?? 0); }
  get band() { return bandOf(this.route.legs[this.hisLeg]).band; }

  // is car v on the picture (C.seen px past its edges)? Everything is, with no view (a test's world)
  onScreen(v) {
    const r = this.world.view?.();
    return !r || (Math.abs(v.x - r.x) < r.hw + this.C.seen && Math.abs(v.y - r.y) < r.hh + this.C.seen);
  }

  // the slots dealt, what stands in a car's way, whether something else is told (systems/pursuit/: called through the
  // pursuit, so that a test may stand in for one)
  assign(dt, tg) { assign(this, dt, tg); }
  blockedAt(car, x, y, ahead, his = false) { return blockedAt(this, car, x, y, ahead, his); }
  busy(tg) { return busy(this, tg); }

  // what others ask of it (the toll, the HUD, render/PursuitArt.js, the tests): a car stopped for good, a slot's
  // point, an event set off, where one from behind starts, a car in a bend ploughing through o, the gunman's place,
  // his pistol and its muzzle, the told shot landing, a tell or an attack called off
  wreck(car, crew = false) { wreck(this, car, crew); }
  slot(car, tg) { return slot(this, car, tg); }
  trigger(e, tg) { trigger(this, e, tg); }
  spawnX(tg) { return spawnX(this, tg); }
  smash(car, o, pair, e, vel) { return smash(this, car, o, pair, e, vel); }
  gunPoint(car) { return gunPoint(this, car); }
  pistolOf(car) { return pistolOf(this, car); }
  muzzle(car) { return muzzle(this, car); }
  killRunner(tg, a) { killRunner(this, tg, a); }
  endTell() { endTell(this); }
  endAttack() { endAttack(this); }

  // the men still in a car that may yet be stopped (driving, waiting in an alley; not one left behind for good): a
  // checkpoint's count leaves them out, the retry not bringing their cars back (systems/Checkpoints.js)
  aboard() { return this.cars.reduce((n, c) => n + (c.dummy || c.state === 'lost' ? 0 : c.driver + c.gunman), 0); }

  // the HUD's chevrons: the pursuers still after him, off the picture
  hunters() { return this.cars.filter((c) => (c.state === 'chase' || c.state === 'limp') && c.driver); }
}
