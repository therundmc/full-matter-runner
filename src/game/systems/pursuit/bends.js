// The pursuers through a scripted bend (systems/Pursuit.js P: its state; systems/Route.js, CHASE.bend): each one
// reaching it follows the same line as his car (chase/shared.js bendMove, its own slide), `space` px behind the one
// ahead of it there, no slot meanwhile; jammed across a narrow way it is wrecked there; out of it, its slots again on
// the next leg. DOM-free.
import { CHASE } from '../../data/chase.js';
import { enterBend } from '../Route.js';
import { bendFloor, bendMove, bendWheel, otherOf, slideSmoke } from '../chase/shared.js';
import { endAttack } from './attacks.js';
import { endTell } from './gunman.js';
import { bob } from './steering.js';
import { wreck } from './wreck.js';

const { Body } = Matter;

// the next bend on its way reached: it takes it
export function toBend(P, car) {
  const b = P.route.bends[car.bendI], v = car.v;
  if (car.bend || !b || v.x < b.x) return;
  car.bendI = b.i + 1 < P.route.bends.length ? b.i + 1 : -1;
  car.bend = enterBend(b, v.x, v.y, v.body.angle, Math.max(car.s, 1), car.slip, car.slipV);
  car.stun = 0;
  car.thrown = false;
  car.set = null;
  if (P.attack?.car === car) endAttack(P);
  if (P.tell?.car === car) endTell(P);
}

// Through a bend, a step (as his car): its line, `space` px behind the car ahead of it on it (his, one of theirs) and
// closing on that at `catch`; its slide and its smoke; out at the end of the line, on the next leg in the lane the
// line ends on, its slots dealt again
export function bendDrive(P, car, dt) {
  const K = CHASE.bend, st = car.bend, b = st.b, v = car.v, body = v.body, w = P.world, d = w.drive;
  if (body.frozen || body.isSleeping) P.loose(car);
  const vel = Body.getVelocity(body);
  // (what it pushes against costs it its speed, never under the smash's floor: CHASE.bend.smash; a car wrecked
  // against it as it went is scraped by from then on, as his car does it)
  bendFloor(st, vel);
  for (const pair of w.physics.activePairs?.() || []) {
    const o = otherOf(pair, body);
    if (o && !pair.isSensor && o.entity?.isVehicle && o.entity.pursuer?.state === 'wrecked') { pair.isSensor = true; pair.flank = true; }
  }
  let lead = d?.on && d.bend?.b === b && d.bend.p > st.p ? d.bend : null;
  for (const o of P.cars) if (o !== car && o.bend?.b === b && o.bend.p > st.p && (!lead || o.bend.p < lead.p)) lead = o.bend;
  const want = lead ? Math.max(0, lead.v + (lead.p - st.p - K.space) * K.catch) : Infinity;
  if (st.v > want) st.v = Math.max(want, st.v - K.hold * dt); // (short of its distance: it stands on the brake)
  // (in on his flank, the bend's line one: it falls back at once, never side by side with him down a narrow way)
  if (lead && lead.p - st.p < K.space * K.close[0]) st.v = Math.min(st.v, lead.v * K.close[1]);
  // jammed (wedged across a narrow way, its speed asked and none got for `jam` s), it is wrecked there: what follows
  // scrapes by it; else held up by what it hit, the line waits for it (as his car's)
  const J = K.smash.jam;
  st.jam = st.v > J.asked && Math.hypot(vel.x, vel.y) < J.got ? (st.jam || 0) + dt : 0;
  if (st.jam > J.t && !car.dummy) { wreck(P, car); return; }
  const pose = bendMove(w, v, st, dt, want);
  car.h = pose.q.a;
  car.s = st.v;
  car.slip = st.slip;
  car.slipV = st.slipV;
  v.steer = bendWheel(pose.q, st.slip);
  v.bob = bob(w, car, st.v);
  slideSmoke(w, v, st.slip, st.v, dt);
  if (st.p < b.length) return;
  // out: driven as on any leg from here
  car.bend = null;
  car.h = 0;
  car.lineY = car.line = null;
  car.settled = 0;
  P.crew = '';
  Body.setVelocity(body, { x: st.v, y: 0 });
}
