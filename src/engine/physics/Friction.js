// Top-down floor friction (Matter has no "ground"): Coulomb sliding friction, i.e. a constant deceleration
// mu.g instead of exponential air drag, so things slide a realistic distance and stop dead.
// - mu = the body's own coefficient (`mu`) x muAt(x, y, body): the floor under it, and how its feet take to that floor.
// - Static friction: getting a resting body going takes `stick` x that (PhysicsWorld.breakaway, Push.js).
// - Spin: a body with a radius of gyration (`gyr`, Body.setShapeInertia) scrubs its turn off at mu.g / gyr, a
//   big table slower than a chair; others lose ANGULAR_FRICTION.mu rad/s2.
// - A lying cylinder (`roll`: its rolling resistance, axis along its local x) rolls across its axis almost freely
//   and drags along it.
import { G, PX_PER_M } from './Units.js';

const { Body } = Matter;

const ANGULAR_FRICTION = 70; // rad/s2 per unit of mu (bodies without a gyr)
export const STICK = 1.25;   // static over kinetic friction when a body says nothing

// muAt(x, y, body): grip multiplier of the floor under a point for that body (carpet > wood > tiles, wet < dry...)
export function groundFriction(bodies, dt, time, muAt) {
  const k = (G * PX_PER_M * dt) / 60; // px/step lost this step per unit of mu
  for (const b of bodies) {
    if (b.isStatic || b.mu === undefined || b.flyUntil > time) continue;
    const grip = muAt(b.position.x, b.position.y, b), mu = b.mu * grip;
    const v = Body.getVelocity(b);
    const s = Math.hypot(v.x, v.y);
    if (b.roll !== undefined) roll(b, v, mu * k, b.roll * grip * k);
    else if (s <= mu * k) { if (s > 0) Body.setVelocity(b, { x: 0, y: 0 }); }
    else Body.setVelocity(b, { x: (v.x * (s - mu * k)) / s, y: (v.y * (s - mu * k)) / s });
    const w = Body.getAngularVelocity(b);
    const wd = b.gyr ? (mu * k) / b.gyr : (mu * ANGULAR_FRICTION * dt) / 60;
    if (Math.abs(w) <= wd) { if (w) Body.setAngularVelocity(b, 0); }
    else Body.setAngularVelocity(b, w - Math.sign(w) * wd);
    // heavy objects settle back into static so nobody can shove them around
    if (b.heavy) {
      if (s < 0.03 && Math.abs(w) < 0.003) {
        b.restT = (b.restT || 0) + dt;
        if (b.restT > 0.4) { Body.setStatic(b, true); b.frozen = true; }
      } else b.restT = 0;
    }
  }
}

// a lying cylinder: its speed along the axis (local x) slides off at `slide`, across it rolls off at `rolling`
function roll(b, v, slide, rolling) {
  const c = Math.cos(b.angle), s = Math.sin(b.angle);
  const along = v.x * c + v.y * s, across = -v.x * s + v.y * c;
  const a = Math.sign(along) * Math.max(0, Math.abs(along) - slide);
  const r = Math.sign(across) * Math.max(0, Math.abs(across) - rolling);
  if (a !== along || r !== across) Body.setVelocity(b, { x: a * c - r * s, y: a * s + r * c });
}
