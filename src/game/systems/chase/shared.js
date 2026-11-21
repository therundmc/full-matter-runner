// What his car (systems/Drive.js) and the pursuers (systems/Pursuit.js) do the same way: a body set up to be driven
// and parked again, the other body of a contact, a frozen body woken into a contact, a bolted thing torn off, which
// side of a car a point is on, a wreck rocked off a flank, a person run down, rubber laid on the road, the tyres'
// smoke of a slide, and a step along a scripted bend's line (systems/Route.js). Numbers in data/chase.js (CHASE).
// DOM-free: it works on Matter bodies and the world's events, particles and decals.
import { CAT, MASK } from '../../Config.js';
import { clamp, angDiff, rand } from '../../../engine/math.js';
import { wake, impulse, kgOf } from '../../../engine/physics/Body.js';
import { CHASE } from '../../data/chase.js';
import { bendStep, project } from '../Route.js';

const { Body, Sleeping } = Matter;

// ---------------------------------------------------------------- bodies
// what a driven body runs into: over the dead, over what is already in pieces (a loose bit weighs nothing, yet the
// physics shares an overlap equally: one landing under it threw two tons sideways), over what lies on the floor
const DRIVEN_MASK = MASK.PROP & ~CAT.CORPSE & ~CAT.DEBRIS & ~CAT.ITEM;

// a body driven from now on: never asleep, no air drag (the engine holds its speed: only what it hits slows it),
// its flanks sliding along a wall (a static body's own friction is 1), over the dead and the pieces
export function driveBody(b) {
  b.sleepThreshold = Infinity;
  b.frictionAir = 0;
  b.friction = CHASE.scrape.friction;
  b.collisionFilter = { ...b.collisionFilter, mask: DRIVEN_MASK };
}

// A driven car's body with its corners rounded r px (C.corner), its mass and inertia kept: a square corner sliding
// along the building fronts catches on the seam between two wall bodies (the physics sees the next one's face) and
// stops the car dead. Once per body
export function roundCorners(b, r) {
  if (b.rounded || !(r > 0)) return;
  const { mass, inertia } = b;
  Body.setVertices(b, Matter.Vertices.chamfer(b.vertices, r));
  Body.setMass(b, mass);
  Body.setInertia(b, inertia);
  b.rounded = true;
}

// the body a contact pairs b with, or null when b is not in it
export const otherOf = (pair, b) => (pair.bodyA === b ? pair.bodyB : pair.bodyB === b ? pair.bodyA : null);

// a frozen body in a contact being resolved becomes a dynamic one at once, the contact told its mass; never asleep
export function loosen(o, pair) {
  if (o.frozen) {
    wake(o);
    pair.inverseMass = pair.bodyA.inverseMass + pair.bodyB.inverseMass;
  }
  if (o.isSleeping) Sleeping.set(o, false);
}

// loosened, and given to the physics a moment (the floor's friction off it: CHASE.hit.fly s)
export function knockLoose(o, pair, time) {
  loosen(o, pair);
  o.flyUntil = time + CHASE.hit.fly;
}

// a bolted thing torn off: the contact dropped (now and while it falls apart: a sensor from here on; a pair keeps
// the `isSensor` it was made with, so it is told too), broken toward a with `power` (Prop.break)
export function tearOff(o, pair, a, power) {
  pair.isActive = false;
  pair.isSensor = o.isSensor = true;
  o.entity.break(a, power);
}

// ---------------------------------------------------------------- a car's sides
// which side of the long axis of body b (at angle a, through its middle) the point (x, y) is on: -1 or 1
export const sideOf = (b, x, y, a = b.angle) => Math.sign(-(x - b.position.x) * Math.sin(a) + (y - b.position.y) * Math.cos(a)) || 1;

// a loose car (a wreck) rocked off the flank of a car going at angle a: `push` px/step across that way (side), off
// the floor's friction CHASE.hit.fly s (CHASE.bend.smash.flank)
export function rockOff(o, a, side, push, time) {
  const vel = Body.getVelocity(o);
  Body.setVelocity(o, { x: vel.x - Math.sin(a) * side * push, y: vel.y + Math.cos(a) * side * push });
  o.flyUntil = time + CHASE.hit.fly;
}

// the world points of car v's wheels (VEHICLES `wheels`: the rear pair first), from the i-th to the j-th
export const wheelsOf = (v, i = 0, j = v.m.wheels.length) => v.m.wheels.slice(i, j).map(([sx, sy]) => v.toWorld(sx, sy));

// ---------------------------------------------------------------- what it leaves
// A person run down by car v at `speed` px/step: killed ('vehicle'), what is left of him thrown along `a`
// (CHASE.throw, CHASE.runOver)
export function runOver(w, ch, a, speed, v) {
  const R = CHASE.runOver, before = w.corpses.length;
  ch.kill(a, 'vehicle', v);
  for (const corpse of w.corpses.slice(before)) {
    for (const part of corpse.parts || [{ body: corpse.body }]) {
      impulse(part.body, a, kgOf(part.body) * speed * CHASE.throw * rand(...R.k), rand(-R.spin, R.spin), R.cap);
      part.body.flyUntil = w.time + R.fly;
    }
  }
}

// rubber on the road from the tyres' places a step ago (from) to where they are now (to), k of its colour (CHASE.fx.marks)
export function layRubber(w, from, to, k = 1) {
  const M = CHASE.fx.marks, xs = [...to, ...from].map((q) => q.x);
  w.decals?.paint?.((g) => {
    g.strokeStyle = `rgba(${M.color}, ${M.alpha * k})`;
    g.lineWidth = M.w;
    g.lineCap = 'round';
    to.forEach((q, i) => { g.beginPath(); g.moveTo(from[i].x, from[i].y); g.lineTo(q.x, q.y); g.stroke(); });
  }, 'floor', Math.min(...xs) - M.w, Math.max(...xs) + M.w);
}

// a slide's smoke (its rear tyres letting go: 'tyres', systems/CarFx.js) while the rear is out past CHASE.slide.smoke
// at more than CHASE.fx.from px/step
export function slideSmoke(w, v, slip, speed, dt) {
  if (Math.abs(slip) > CHASE.slide.smoke && speed > CHASE.fx.from) w.events.emit('tyres', { car: v, at: wheelsOf(v, 0, 2), k: clamp(Math.abs(slip) / CHASE.slide.most, 0, 1), dt });
}

// ---------------------------------------------------------------- a scripted bend (systems/Route.js)
// its speed after what it pushed against (vel: its velocity as the physics left it): no more than that and
// CHASE.give, never under the smash's floor of the bend's own (nothing holds it up in a bend)
export function bendFloor(st, vel, K = CHASE.bend) {
  st.v = Math.max(Math.min(st.v, Math.hypot(vel.x, vel.y) + CHASE.give), Math.min(st.v, st.b.speed * K.smash.floor));
}

// A step along the bend's line for car v (Route.bendStep, `want` px/step at most): held up by what it hit, the line
// waits for it (CHASE.bend.wait); its velocity set to where the line takes it next (`reach`: no further than that
// share of its speed and px), its nose turned onto the line's. Returns the pose (Route.bendStep's)
export function bendMove(w, v, st, dt, want = Infinity, K = CHASE.bend) {
  const b = v.body, W = K.wait;
  const held = project(st.b.path, v.x + Math.cos(b.angle) * K.pivot, v.y + Math.sin(b.angle) * K.pivot, st.p, W.span, W.step);
  if (st.p - held > st.v * W.k + W.slack) st.p = held + st.v * W.k;
  const pose = bendStep(st, st.b, dt, want, K);
  let dx = pose.x - v.x, dy = pose.y - v.y;
  const most = st.v * K.reach[0] + K.reach[1], d = Math.hypot(dx, dy);
  if (d > most) { dx *= most / d; dy *= most / d; }
  Body.setVelocity(b, { x: dx, y: dy });
  Body.setAngularVelocity(b, angDiff(b.angle, pose.a));
  b.flyUntil = w.time + CHASE.fly;
  return pose;
}

// its front wheels as drawn in a bend (Vehicle `steer`): into the turn, against the slide (CHASE.wheels)
export const bendWheel = (q, slip, W = CHASE.wheels) => clamp(q.turn * W.bend - slip * W.slip, -W.most, W.most);
