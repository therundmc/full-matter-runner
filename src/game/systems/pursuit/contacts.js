// What a pursuer runs into (systems/Pursuit.js P: its state). `contact` is called by the physics before it resolves
// a contact: his car only knocks it, or his shove lands on it (lunged, then shoved after the physics: half its hp,
// thrown out of its driver's hands); a frozen car is woken; a bolted thing torn off; in a bend what is on the line is
// ploughed through as his car does it (smash); on what does not give, or a car, closing hard enough: wrecked (after
// the physics); on its way out what lines the road stops it (stopped). Numbers: CHASE.pursuit.wreck / shoved,
// CHASE.bend.smash. DOM-free.
import { wake, kgOf } from '../../../engine/physics/Body.js';
import { CHASE } from '../../data/chase.js';
import { dice } from '../Rng.js';
import { knockLoose, rockOff, sideOf, tearOff } from '../chase/shared.js';
import { bursts, smashSpeed } from '../drive/rules.js';
import { endAttack } from './attacks.js';
import { endTell } from './gunman.js';
import { lift, wreck } from './wreck.js';

const { Body, Sleeping } = Matter;

// The physics found it touching o (before resolving it): his car only knocks it, or his shove lands on it (dealt
// with after the physics: shoved); a frozen car is woken (shoved on); a bolted thing torn off; on what does not
// give (a wall, a lasting thing, a pole), or on a car, closing hard enough: wrecked (after the physics: after()).
// On its way out (exit) what it meets on the side of the road stops it there
export function contact(P, car, o, pair) {
  const w = P.world, v = car.v, b = v.body, e = o.entity;
  const vel = Body.getVelocity(b), ov = o.isStatic ? { x: 0, y: 0 } : Body.getVelocity(o);
  // (a wreck run on through a toll's lane takes its arm with it: exit, Toll.wreckWay)
  if (car.out) { if (!(car.out.run && tear(P, o, pair, vel, Math.hypot(vel.x, vel.y)))) stopped(P, car, o, pair); return; }
  if (car.state === 'wrecked' || v.exploded) return;
  const n = pair.collision.normal;
  const close = Math.abs((vel.x - ov.x) * n.x + (vel.y - ov.y) * n.y);
  // his car: a knock of his doing (his steering into it), not when it is the one swiping at him; his shove going
  // its way lands on it, once a shove
  if (e && e === w.drive?.car) {
    lunged(P, car);
    // (its side swipe landing on him: told once a swipe, systems/ChaseCam.js)
    if (car.ram > 0 && P.attack?.car === car && !P.attack.hit) {
      P.attack.hit = true;
      const c = pair.collision.supports?.[0] || v;
      w.events.emit('pursuerRam', { car: v, x: c.x, y: c.y, side: P.attack.side });
    }
    if (w.drive.lunge || car.ram <= 0) car.by = w.time;
    return;
  }
  // in a bend, what is left on the line is ploughed through as his car did (CHASE.bend.smash): a parked car or a
  // wreck scraped along (the first one set as a `snare` wrecks the first of them to touch it), a loose thing thrown
  if (car.bend && smash(P, car, o, pair, e, vel)) return;
  // (in a bend the line is the script's: one of theirs knocked wrecks nothing; nor through a toll's plaza, where each
  // swerves for its gate)
  if ((car.bend || ((car.toll || e?.pursuer?.toll) && e?.pursuer)) && e?.isVehicle) return;
  const k = w.time - car.by < P.C.again ? P.C.wreck.thrown : 1; // thrown by his car: it takes less
  if (e?.isVehicle) {
    knockLoose(o, pair, w.time);
    if (close >= P.C.wreck.car * k) car.wreckHit = true;
    return;
  }
  if (!o.isStatic || e?.def?.hung || e?.dead || e?.dying || tear(P, o, pair, vel, close)) return;
  // (in a bend the line is the script's: a wall it brushes is sparks, never its wreck; only a `snare` is: smash)
  if (close >= P.C.wreck.hard * k && !car.bend) car.wreckHit = true;
}

// a bolted thing (a bin, a hydrant, a bench) is torn off and it goes on (true: it was one; a wall, a lasting thing,
// a pole stop it)
function tear(P, o, pair, vel, close) {
  const e = o.entity, pole = P.C.wreck.poles.includes(e?.type);
  if (!e?.def?.static || e.def.lasting || pole || e.tipped) return false;
  if (close > CHASE.hit.tear) tearOff(o, pair, Math.atan2(vel.y, vel.x), CHASE.hit.power);
  return true;
}

// In a bend (CHASE.bend.smash): a car not driven (parked, a wreck) is scraped along, never a wall, unless it is the
// level's `snare` and nobody has been caught on it yet in this bend: then this one is, wrecked there (the kill beat);
// a loose thing up to a dumpster's weight is thrown out of the line and bursts. True: dealt with
export function smash(P, car, o, pair, e, vel) {
  const K = CHASE.bend.smash, w = P.world, b = car.bend.b;
  if (e?.isVehicle && e !== w.drive?.car && (!e.pursuer || e.pursuer.state === 'wrecked')) {
    if (e.snare && !b.snared && !car.dummy) {
      b.snared = car;
      car.wreckHit = 'snare';
      e.startAlarm?.();
      return true; // (resolved: it piles into it)
    }
    pair.isActive = false;
    pair.isSensor = true;
    pair.flank = true; // (its shower: systems/CarFx.js)
    if (o.frozen || o.isStatic) return true; // (a parked car stays parked: it grinds along it)
    if (o.isSleeping) Sleeping.set(o, false);
    // (a wreck is rocked off its flank, across the way it goes, as his car does it)
    const a = car.v.body.angle;
    rockOff(o, a, sideOf(car.v.body, o.position.x, o.position.y, a), K.flank.push, w.time);
    return true;
  }
  // (a thing: never a man in its way, who is run down as anywhere)
  if (!e?.def || !e.break || e.isPlayer || e.isEnemy || e.isCivilian || e.def.lasting || o.isStatic || e.dead || e.dying || kgOf(o) > K.kg) return false;
  pair.isActive = false;
  pair.isSensor = true;
  if (o.frozen) wake(o);
  if (o.isSleeping) Sleeping.set(o, false);
  const D = dice(w), a = Math.atan2(vel.y, vel.x) + D.rand(-K.aim, K.aim), sp = Math.hypot(vel.x, vel.y) * smashSpeed(kgOf(o));
  Body.setVelocity(o, { x: Math.cos(a) * sp, y: Math.sin(a) * sp });
  Body.setAngularVelocity(o, D.rand(-K.spin, K.spin));
  o.flyUntil = w.time + K.fly;
  if (bursts(e.def)) e.break(a, CHASE.hit.power);
  return true;
}

// on its way out: what lines the road (a parked car, a wall, a pole, a lasting thing) stops it there; a bolted
// thing is torn off; his car and one of theirs do not (it goes on away from his line, pushing that one aside)
function stopped(P, car, o, pair) {
  const e = o.entity;
  if (e && (e === P.world.drive?.car || e.pursuer)) return;
  if (e?.isVehicle) { knockLoose(o, pair, P.world.time); car.out.hit = true; return; }
  if (!o.isStatic || e?.def?.hung || e?.dead || e?.dying || tear(P, o, pair, Body.getVelocity(car.v.body), CHASE.hit.tear + 1)) return;
  car.out.hit = true;
}

// his car touches it: his shove under way, going its way, lands on it (once a shove; dealt with in after())
export function lunged(P, car) {
  const d = P.world.drive, n = d.lunge;
  if (n && car.shove !== n && Math.sign(car.v.y - d.car.y) === d.side) { car.shove = n; car.hitBy = d.side; }
}

// His shove landed on it (side: the way he lunged, -1: -y): C.shoved.cost of its hp gone (the second one wrecks
// it), and it is thrown that way out of its driver's hands, turning, its gunman's shot off; what it is thrown into
// within C.again s takes less to wreck it (contact: wreck.thrown). The lab's dummy is knocked loose the same way
export function shoved(P, car, side) {
  const S = P.C.shoved, w = P.world, v = car.v, b = v.body;
  if (car.state === 'wrecked' || v.exploded) return;
  car.dents++;
  car.by = w.time;
  if (car.dummy) lift(P, car);
  const vel = Body.getVelocity(b);
  Body.setVelocity(b, { x: vel.x, y: side * S.throw });
  Body.setAngularVelocity(b, side * S.spin);
  b.flyUntil = w.time + (car.dummy ? CHASE.hit.fly : S.stun);
  w.particles.glass(v.x, v.y - side * v.h / 2, -side * Math.PI / 2, 1, 8, 180);
  if (car.dents * S.cost >= 1) { wreck(P, car); return; }
  v.hp = Math.min(v.hp, v.m.hp * (1 - car.dents * S.cost));
  car.stun = S.stun;
  car.thrown = true;
  car.set = null;
  car.ram = 0;
  car.hurt = P.C.hurt;
  car.slipV += side * CHASE.slide.rammed;
  car.lineY = null;
  if (P.attack?.car === car) endAttack(P);
  if (P.tell?.car === car) endTell(P);
}
