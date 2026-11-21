// What stops a pursuer for good (systems/Pursuit.js P: its state): wrecked (wreck: it stops, smokes, may burn; its
// men credited, crew: one for the streak), piled up in a bend (pileUp), and THE EXIT (leave / exit, CHASE.pursuit.out):
// a car stopped while it was going is driven off his line by a script, swerving away from him, braking, skidding into
// what lines the road on that side, left behind, off the picture, never across his path; who is in its way run down
// (runDown). His rounds on it (onPart: the windscreen, a tyre) and its damage shown in stages (shotUp). DOM-free.
import { TILE } from '../../Config.js';
import { clamp, angDiff, rand, chance } from '../../../engine/math.js';
import { CHASE } from '../../data/chase.js';
import { ROUNDS } from '../../data/weapons.js';
import { bandOf } from '../Route.js';
import { dice } from '../Rng.js';
import { layRubber, runOver, sideOf, wheelsOf } from '../chase/shared.js';
import { endAttack } from './attacks.js';
import { endTell, gunPoint } from './gunman.js';
import { DRIVEN } from './steering.js';

const { Body, Query } = Matter;
const FRONT = new Set([2, 3]); // VEHICLES wheels: the front pair (0, 1 the rear)

// wrecked: it stops (the floor's friction back on it), its engine smokes, it may catch fire; who was in it is out
// (crew: the driver's kill told a moment ago, the gunman dies with him: not one more for the streak); the exit
// takes it off his line
export function wreck(P, car, crew = false) {
  if (car.state === 'wrecked') return;
  const w = P.world, v = car.v, b = v.body, C = P.C.wreck, K = CHASE.parked, inBend = !!car.bend;
  car.state = 'wrecked';
  car.stun = 0;
  car.thrown = false;
  car.set = null;
  car.bend = null;
  v.brake = 0;
  if (P.attack?.car === car) endAttack(P);
  if (P.tell?.car === car) endTell(P);
  b.frictionAir = K.air;
  b.friction = K.friction;
  b.sleepThreshold = K.sleep;
  b.flyUntil = 0;
  v.steer = 0; v.bob = 0;
  if (!v.exploded) {
    v.hp = Math.min(v.hp, v.m.hp * C.smoke);
    if (dice(w).chance(C.fire)) v.ignite();
    w.sound('pursuerWreck', v.x, v.y, 1);
    w.particles.sparks(v.x, v.y, b.angle + Math.PI, 1.2, 16, 300);
    w.particles.glass(v.x, v.y, b.angle + Math.PI, 1, 10, 160);
    w.shake?.(C.shake);
  }
  // the men in it: the driver, unless he was shot (his kill told then), and the gunman if still in it
  creditCrew(P, car, w.time - car.by < P.C.again ? 'shoved' : 'wrecked', 'wreck', undefined, crew);
  // (stopped on a toll's steel boom: THE CRASH, its own fire-ball in place of the engine's: systems/Toll.js,
  // decided now and done before the event, so that whoever hears it knows)
  const boom = w.toll?.boomOf(v) ?? null;
  // (in a bend's narrow way there is no exit: it piles up where it is, slewed round, most of its speed gone)
  if (inBend) pileUp(P, car);
  else leave(P, car, !boom);
  if (boom) w.toll.crash(v, boom);
  // (the chase's kill beat: systems/ChaseCam.js; how: 'shoved' when his car threw it there: the strong beat)
  w.events.emit('pursuerWreck', { car: v, x: v.x, y: v.y, how: w.time - car.by < P.C.again ? 'shoved' : 'wrecked' });
}

// wrecked in a bend (a snare, a wall): no exit across a road there is not; it slews round and piles into what is
// by it, pieces off it, the engine going up (CarFx on 'pursuerWreck')
function pileUp(P, car) {
  const v = car.v, b = v.body, w = P.world, vel = Body.getVelocity(b), a = Math.atan2(vel.y, vel.x), K = P.C.pile;
  car.gone = true;
  Body.setVelocity(b, { x: vel.x * K.keep, y: vel.y * K.keep });
  const D = dice(w);
  Body.setAngularVelocity(b, (D.chance(0.5) ? 1 : -1) * D.rand(...K.spin));
  for (let i = 0; i < K.pieces; i++) v.shed(v.x, v.y, a + rand(-K.spread, K.spread), rand(...K.fling), true);
  w.particles.sparks(v.x, v.y, a, 1.4, 24, 340);
  w.sound('carHit', v.x, v.y, 1);
}

// the men still in a car stopped for good, all at once: one kill each, but ONE for the streak (how.crew: no
// double for one wreck, nor its slow motion); tag: how.car of the gunman's, own: the driver's; crew: the first of
// them is not one more either
export function creditCrew(P, car, tag, cause, own = car.cause ?? tag, crew = false) {
  const v = car.v, men = [];
  if (car.driver) men.push([v, own]);
  if (car.gunman) men.push([gunPoint(P, car), tag]);
  car.driver = car.gunman = false;
  men.forEach(([at, t], i) => credit(P, at, t, cause, crew || i > 0));
}

// a man of a car out: a kill of his (the scoring: cause, the tag in how.car; crew: the second man of a car stopped
// with both in it, not one more for the streak)
export function credit(P, at, tag, cause, crew = false) {
  const w = P.world, p = w.player, how = crew ? { car: tag, crew } : { car: tag };
  w.events.emit('kill', { victim: { x: at.x, y: at.y, isPursuer: true, aware: 1, knocked: 0 }, cause, killer: p, how });
}

// It starts: the side away from him (dead level with him: the side of the street with more room), its speed along
// the road (his at most); none for a car that was standing (the alley car shot as it waits); the lab's dummy loosened
// for it. ball: the engine's fire-ball (none for a toll's crash: the boom's is the one)
export function leave(P, car, ball = true) {
  const v = car.v, b = v.body, tg = P.target(), O = P.C.out;
  if (car.gone || !tg) return;
  const vel = Body.getVelocity(b);
  if (!car.dummy && Math.hypot(vel.x, vel.y) < O.least) return;
  car.gone = true;
  if (car.dummy) lift(P, car);
  const off = v.y - tg.y;
  // (never faster than he goes: its engine is dead, it cannot pull ahead of him)
  car.out = { t: 0, s: clamp(vel.x, 0, Math.max(0, tg.vel.x)), y0: v.y, side: Math.abs(off) > O.level ? Math.sign(off) : roomier(P, v.y, v.x), hit: false,
    ruts: null, shedT: 0, crashed: false };
  b.sleepThreshold = Infinity;
  // the engine goes: a ball of fire off the hood, a flash, and it burns from here on (looks: O.fx)
  const F = O.fx, w = P.world;
  if (v.exploded || !F) return;
  if (ball) {
    const hood = v.toWorld(v.w * 0.82, v.h / 2);
    w.particles.fire?.(hood.x, hood.y, F.ball[0], F.ball[1], { size: [4, 10], heat: 0 });
    w.particles.smoke?.(hood.x, hood.y, 6, 8, { speed: 50, size: 10, life: 1.4, dark: true });
    w.light?.(hood.x, hood.y, F.ball[2], F.ball[3], 0.25);
  }
  // (alight for the look of it, no fuse: it blows up later only if it had caught for real: wreck.fire)
  if (F.burn && !v.burning && !v.armoured) { v.burning = true; v.fuse = Infinity; }
}

// How the exit looks, a step (O.fx; nothing of it weighs on anything): smoke off its tyres and their rubber on the
// road, pieces lost on the way; what stops it at the roadside: one burst
function exitFx(P, car, dt) {
  const F = P.C.out.fx, o = car.out, v = car.v, w = P.world;
  if (!F) return;
  const wheels = wheelsOf(v), sp = Math.hypot(o.s, P.C.out.side), back = Math.atan2(-o.side * P.C.out.side, -o.s);
  if (o.hit && !o.crashed) {
    o.crashed = true;
    const side = v.toWorld(v.w / 2, o.side > 0 ? v.h : 0);
    w.particles.sparks(side.x, side.y, back, 1.3, F.crash[0], 340);
    w.particles.glass(side.x, side.y, back, 1.2, F.crash[1], 200);
    for (let i = 0; i < F.crash[2]; i++) v.shed(side.x, side.y, back + rand(-1, 1), rand(...F.fling), true);
    w.shake?.(F.crash[3]);
    w.sound('carHit', side.x, side.y, 1);
    w.events.emit('pursuerCrash', { car: v, x: side.x, y: side.y }); // (burning, it goes up there: systems/CarFx.js)
  }
  if (o.hit || sp < F.still) { o.ruts = null; return; }
  for (const q of wheels) if (chance(F.smoke[0])) w.particles.smoke(q.x, q.y, 1, 3, { speed: CHASE.fx.smokeV.tyre, size: F.smoke[1], life: F.smoke[2] });
  w.events.emit('tyres', { car: v, at: wheels, k: 1, dt }); // (their rubber smoke in the air, the sparks from under it: systems/CarFx.js)
  if (o.ruts) layRubber(w, o.ruts, wheels);
  o.ruts = wheels;
  if ((o.shedT -= dt) <= 0) {
    o.shedT = rand(...F.shed);
    const q = v.toWorld(rand(0.1, 0.9) * v.w, rand(0.1, 0.9) * v.h);
    v.shed(q.x, q.y, back + rand(-0.9, 0.9), rand(...F.fling));
  }
}

// the side of the street (-1: -y) with more room from y on the leg at x: the further kerb (the leg's `kerbs` rows),
// else away from the middle of its lanes; the lab: +y
function roomier(P, y, x = 0) {
  const leg = P.route.legs[P.legOf(x)], K = leg.kerbs, band = bandOf(leg).band;
  if (K) return K[1] * TILE - y > y - K[0] * TILE ? 1 : -1;
  return !band || y < (band[0] + band[1]) / 2 ? 1 : -1;
}

// A step of it (driven by hand: its velocity and its turn set): across, away from his line (held against what
// stopped it; pushed no further than `far`), braking along the road; it skids round once it is clear of his car
// (never its tail swung into him). Over at `dur`: the physics has it, the floor's friction on
export function exit(P, car, dt, tg) {
  const O = P.C.out, o = car.out, v = car.v, b = v.body;
  // A toll's plaza ahead (Toll.wreckWay): stopped on the approach it is braked to a stand short of the islands (slid
  // on down its lane it lay across a lane's mouth, at the islands' noses, and held him up); past that it runs on
  // down its own lane and through its gate, its speed kept, and makes its exit beyond
  const T = v.tollCrash ? null : P.world.toll?.wreckWay?.(v.x, v.y);
  o.run = T?.lane != null && !o.hit;
  if (o.run) {
    Body.setVelocity(b, { x: Math.max(o.s, T.run), y: clamp((T.lane - v.y) * O.lane, -O.side, O.side) });
    Body.setAngularVelocity(b, clamp(-angDiff(0, b.angle) * O.lane, -O.turn, O.turn));
    b.flyUntil = P.world.time + CHASE.fly;
    o.y0 = v.y;
    exitFx(P, car, dt);
    runDown(P, car);
    return;
  }
  o.t += dt;
  if (o.t >= O.dur) { car.out = null; b.flyUntil = 0; b.sleepThreshold = CHASE.parked.sleep; v.steer = 0; return; }
  o.s = Math.max(0, o.s - Math.max(O.brake, T?.stop != null ? (O.stop[0] * o.s * o.s) / Math.max(O.stop[1], T.stop - v.x) : 0) * dt);
  const across = o.hit || Math.abs(v.y - o.y0) >= O.far ? O.press : O.side * clamp(o.t / O.bite, 0, 1);
  Body.setVelocity(b, { x: o.s, y: o.side * across });
  // (its half width across the road as it is turned now: what its tail swinging round reaches toward him)
  const hc = tg?.car, reach = (v.w / 2) * Math.abs(Math.sin(b.angle)) + (v.h / 2) * Math.abs(Math.cos(b.angle));
  const clear = !hc || Math.abs(v.y - tg.y) - reach - hc.h / 2 > O.margin || v.x + v.w / 2 < tg.x - hc.w / 2;
  Body.setAngularVelocity(b, clear ? o.side * (car.cause === 'tyre' ? O.spin : O.turn) * (1 - o.t / O.dur) : 0);
  b.flyUntil = P.world.time + CHASE.fly;
  v.steer = o.side * CHASE.wheels.most;
  exitFx(P, car, dt);
  runDown(P, car);
}

// Who is in its way out (a passer-by on the sidewalk it skids onto, one of theirs): two tonnes of wreck at CHASE.run
// px/step or more run him down, thrown as his car throws one (chase/shared.js runOver); slower, held against what stopped it, it
// crushes him there; slower still and free, he is shoved off its flank. Never pinned alive under it (it was: a
// runner held against a front by a burning wreck, the QA's civ-stuck)
function runDown(P, car) {
  const w = P.world, v = car.v, b = v.body, vel = Body.getVelocity(b), speed = Math.hypot(vel.x, vel.y);
  const reach = v.w / 2 + P.C.out.reach, a = speed > 0.1 ? Math.atan2(vel.y, vel.x) : b.angle;
  for (const ch of [...w.chars]) {
    if (!ch.alive || ch.isPlayer || ch.hidden || ch.riding || !ch.body || Math.abs(ch.x - v.x) > reach || Math.abs(ch.y - v.y) > reach) continue;
    const hit = Query.collides(b, [ch.body])[0];
    if (!hit) continue;
    // (off the side of its long axis he is on)
    const side = sideOf(b, ch.x, ch.y);
    if (speed < CHASE.run && !car.out?.hit) {
      Body.setVelocity(ch.body, { x: -Math.sin(b.angle) * side * CHASE.run, y: Math.cos(b.angle) * side * CHASE.run });
      continue;
    }
    runOver(w, ch, a + side * CHASE.runOver.side, speed, v);
    w.decals?.stampBlood?.(ch.x, ch.y, 6, 8);
    w.sound('carHit', ch.x, ch.y, 1);
  }
}

// a window or a tyre of a pursuer taken by a round (Vehicle.hitWindow / popTire)
export function onPart(P, { car: v, part, i, kind }) {
  const car = v.pursuer, w = P.world;
  if (!car || car.state === 'wrecked' || v.exploded) return;
  if (part === 'wind' && !ROUNDS.has(kind)) return; // a screen cracked by a knock or a blast: nobody shot
  if (part === 'wind' && car.driver && v.windows.wind >= P.C.rounds.screen) {
    // the driver, the windscreen blown in (a burst at it: the first round only stars it): nobody at the wheel, it
    // is out (wrecked: the exit), his gunman with it
    car.driver = false;
    credit(P, v, 'driver', 'bullet');
    w.particles.blood?.(v.x, v.y, v.body.angle + Math.PI, 0.8, 8, 140);
    car.cause = 'driver';
    wreck(P, car, true);
  } else if (part === 'tyre' && FRONT.has(i) && (DRIVEN.has(car.state) || car.dummy)) {
    // a front tyre: it spins out (the exit, turning harder)
    if (car.driver) car.cause = 'tyre';
    wreck(P, car);
  } else if (part === 'tyre' && car.state === 'chase') {
    // a rear tyre: it limps, hanging on alongside him (never in his lane, where he would run into it; the slots
    // are dealt to the others without it), in his arc for him to finish it
    car.state = 'limp';
    car.slot = 'abreast';
    car.rank = 0;
    car.settled = 0;
  }
}

// the lab's dummy set moving by what it took (its body loose, driven no more)
export function lift(P, car) {
  P.loose(car);
  car.v.body.frictionAir = CHASE.parked.air;
}

// His rounds' damage shown in stages (CHASE.pursuit.rounds, by the share of its hp gone): the rear window cracked,
// then blown out (the windscreen is left to his rounds: it is the driver's), the engine smoking (Vehicle), on fire
// (Vehicle burnAt), then wrecked; on fire it runs `burn` s at most
export function shotUp(P, car, dt, tg) {
  const R = P.C.rounds, v = car.v, gone = 1 - v.hp / v.m.hp, from = tg ?? v;
  const a = Math.atan2(v.y - from.y, v.x - from.x);
  if (v.m.rear && gone >= R.crack && v.windows.rear < 1) glass(P, v, 'rear', a);
  if (v.m.rear && gone >= R.glass && v.windows.rear < 2) glass(P, v, 'rear', a);
  car.burnT = v.burning ? car.burnT + dt : 0;
  if (gone >= R.wreck || car.burnT > R.burn) wreck(P, car);
}

// a window of v one state further gone (cracked, then blown out) by the damage, not by a round (nobody shot, and
// nothing more lost: it shows what it took)
function glass(P, v, which, a) {
  const r = v.m[which], hp = v.hp;
  v.hitWindow(which, (r[0] + r[1]) / 2 + rand(-2, 2), (r[2] + r[3]) / 2 + rand(-8, 8), a, null);
  v.hp = hp;
}
