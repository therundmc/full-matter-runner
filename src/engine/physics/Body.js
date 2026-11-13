// Physical properties on top of Matter bodies: mass in kg, sliding friction, momentum-based impulses,
// and "freezing" (static while at rest) for objects too heavy to be pushed by hand.
import { KG } from './Units.js';

const { Body } = Matter;

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

// momentum J (kg·px/step) along angle a. Light things fly, heavy things barely budge.
// Frozen bodies only wake up when the resulting speed change is noticeable.
export function impulse(body, a, J, spin = 0, cap = 12) {
  const kg = kgOf(body);
  if (!kg || !isFinite(kg)) return 0;
  const dv = Math.min(cap, J / kg);
  if (body.frozen) {
    if (dv < 0.35) return dv;
    wake(body);
  }
  if (body.isStatic) return 0;
  const v = Body.getVelocity(body);
  Body.setVelocity(body, { x: v.x + Math.cos(a) * dv, y: v.y + Math.sin(a) * dv });
  if (spin) Body.setAngularVelocity(body, Body.getAngularVelocity(body) + spin * Math.min(1, 20 / kg));
  return dv;
}
