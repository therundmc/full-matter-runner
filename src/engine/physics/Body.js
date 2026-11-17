// Physical properties on top of Matter bodies: mass in kg, sliding friction, momentum-based impulses,
// and "freezing" (static while at rest) for objects too heavy to be pushed by hand.
import { KG } from './Units.js';

const { Body, Sleeping } = Matter;

const WAKE = 0.35; // px/step a frozen body must be given (all the knocks of one step together) to come loose

export function setKg(body, kg) { Body.setMass(body, kg * KG); }
export function kgOf(body) { return (body.frozen ? body._original?.mass : body.mass) / KG; }

// mu: sliding friction coefficient against the floor.
// flyUntil: world time until which the body is airborne (no floor friction).
export function setMaterial(body, kg, mu, flyUntil = 0) {
  setKg(body, kg);
  body.mu = mu;
  body.flyUntil = flyUntil;
}

// resistance to spinning: furniture is bulky and drags on the floor, it should not twirl like a top
export function scaleInertia(body, k) { Body.setInertia(body, body.inertia * k); }

// The real moment of inertia of its shape (Matter's own is 4 x that): a box m(w2 + h2)/12, a disc m r2/2, times k.
// Keeps the radius of gyration (`gyr`, px) the floor's scrub and off-centre blows work with. Call after setMaterial.
export function setShapeInertia(body, k = 1) {
  const r = body.circleRadius;
  const g2 = r ? (r * r) / 2 : (rectSide(body, 0) ** 2 + rectSide(body, 1) ** 2) / 12;
  body.gyr = Math.sqrt(g2 * k);
  Body.setInertia(body, body.mass * body.gyr * body.gyr);
}

// the length of a box's side i (its local x for 0, y for 1)
function rectSide(body, i) {
  const v = body.vertices;
  return Math.hypot(v[i + 1].x - v[i].x, v[i + 1].y - v[i].y);
}

// radius of gyration (px) of a body: what it was given, or what Matter's inertia says
export const gyrOf = (body) => body.gyr ?? Math.sqrt((body.frozen ? body._original?.inertia : body.inertia) / body.mass || 1);

export function freeze(body) {
  body.heavy = true;
  Body.setStatic(body, true);
  body.frozen = true;
}

export function wake(body) {
  if (!body.frozen) return;
  Body.setStatic(body, false);
  body.frozen = false;
  body.restT = 0;
}

// a frozen body adds up the knocks of one step (a shotgun's pellets, a blast and its debris): it only comes loose
// when they make a noticeable speed together (PhysicsWorld clears the sum after each step)
function knockFrozen(body, a, dv) {
  const k = body.knock ??= { x: 0, y: 0 };
  k.x += Math.cos(a) * dv; k.y += Math.sin(a) * dv;
  if (Math.hypot(k.x, k.y) < WAKE) return false;
  wake(body);
  return true;
}

function kick(body, dx, dy) {
  if (body.isSleeping) Sleeping.set(body, false); // asleep, it would keep the speed and never move
  const v = Body.getVelocity(body);
  Body.setVelocity(body, { x: v.x + dx, y: v.y + dy });
}

// momentum J (kg.px/step) along angle a. Light things fly, heavy things barely budge.
// Frozen bodies only wake up when the resulting speed change is noticeable.
export function impulse(body, a, J, spin = 0, cap = 12) {
  const kg = kgOf(body);
  if (!kg || !isFinite(kg)) return 0;
  const dv = Math.min(cap, J / kg);
  if (body.frozen) {
    if (!knockFrozen(body, a, dv)) return dv;
    const k = body.knock;
    body.knock = null;
    kick(body, k.x, k.y);
    return dv;
  }
  if (body.isStatic) return 0;
  kick(body, Math.cos(a) * dv, Math.sin(a) * dv);
  if (spin) Body.setAngularVelocity(body, Body.getAngularVelocity(body) + spin * Math.min(1, 20 / kg));
  return dv;
}

// momentum J (kg.px/step) along a, landing at the point (x, y): off its centre it also spins it, by its real moment
// of inertia. Returns the speed change of its centre (px/step).
export function impulseAt(body, x, y, a, J, cap = 12) {
  const kg = kgOf(body);
  if (!kg || !isFinite(kg) || J <= 0) return 0;
  const dv = Math.min(cap, J / kg), Jc = dv * kg;
  const g = gyrOf(body), rx = x - body.position.x, ry = y - body.position.y;
  const dw = ((rx * Math.sin(a) - ry * Math.cos(a)) * Jc) / (kg * g * g);
  if (body.frozen) {
    if (!knockFrozen(body, a, dv)) return dv;
    const k = body.knock;
    body.knock = null;
    kick(body, k.x, k.y);
  } else if (body.isStatic) return 0;
  else kick(body, Math.cos(a) * dv, Math.sin(a) * dv);
  Body.setAngularVelocity(body, Body.getAngularVelocity(body) + Math.max(-0.5, Math.min(0.5, dw)));
  return dv;
}
