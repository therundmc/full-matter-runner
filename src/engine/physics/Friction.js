// Top-down floor friction (Matter has no "ground"): Coulomb sliding friction, i.e. a constant deceleration
// mu·g instead of exponential air drag, so things slide a realistic distance and stop dead.
import { G, PX_PER_M } from './Units.js';

const { Body } = Matter;

const ANGULAR_FRICTION = 70; // rad/s² per unit of mu

// muAt(x, y): grip multiplier of the floor under a point (carpet > wood > tiles...)
export function groundFriction(bodies, dt, time, muAt) {
  for (const b of bodies) {
    if (b.isStatic || b.mu === undefined || b.flyUntil > time) continue;
    const mu = b.mu * muAt(b.position.x, b.position.y);
    const dec = (mu * G * PX_PER_M * dt) / 60; // px/step lost this step
    const v = Body.getVelocity(b);
    const s = Math.hypot(v.x, v.y);
    if (s <= dec) { if (s > 0) Body.setVelocity(b, { x: 0, y: 0 }); }
    else Body.setVelocity(b, { x: (v.x * (s - dec)) / s, y: (v.y * (s - dec)) / s });
    const w = Body.getAngularVelocity(b);
    const wd = (mu * ANGULAR_FRICTION * dt) / 60;
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

// stopping distance (px) of a body sliding at v (px/step) with friction mu: v² / (2 mu g)
export function stoppingDistance(v, mu) {
  const vps = v * 60;
  return (vps * vps) / (2 * mu * G * PX_PER_M);
}
