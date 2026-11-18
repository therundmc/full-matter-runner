// A leaf turning on a hinge, seen from above (a door), as numbers: no Matter, no DOM. Angles in rad, angular speeds
// in rad/step (Matter's, at 60 Hz), torques in N.m, forces in N, the moment of inertia in kg.px2 about the pivot.
import { PX_PER_M, STEP } from './Units.js';

const N_S = PX_PER_M * STEP;         // 1 N.s in kg.px/step
const TQ = PX_PER_M * PX_PER_M * STEP; // a torque of 1 N.m for 1 s, in kg.px2/step
const REST = 0.002;                  // rad/step under which a leaf is at rest

// the moment of inertia (kg.px2) about the pivot of a slab of `kg` running from `from` to `to` px along it (the pivot
// at 0: `from` is negative when the leaf runs on behind it), `thick` px across
export function leafInertia(kg, from, to, thick) {
  const L = to - from, c = (to + from) / 2;
  return kg * ((L * L + thick * thick) / 12 + c * c);
}

// what a torque T held dt s does to the speed of a leaf of inertia I (rad/step)
export const spinOf = (T, I, dt) => (T * TQ * dt) / I;

// One force-limited push on a leaf (pivot at px, py, turning at w, inertia I) at the contact c ({ nx, ny, x, y }:
// the normal from the pusher to the leaf, the point) of a pusher closing at vIn px/step along that normal, with at
// most `force` N for dt s. `hold`: N.m it takes to get it going from rest (the hinge's dry friction, a latch);
// `resist`: N.m it loses this step on its own (friction, a closer), which the push makes up for. Returns { w: the
// leaf's new speed, keep: the speed the pusher may keep along the normal, the leaf's at that point once it moved }.
// Like engine/physics/Push.js for a loose body: the leaf never takes the pusher's speed in one step, and he is held
// to the speed it really goes, so a contact has nothing left to hand over.
export function pushLeaf(px, py, w, I, c, vIn, force, dt, hold = 0, resist = 0) {
  const arm = (c.x - px) * c.ny - (c.y - py) * c.nx; // px: the lever of a push along the normal
  const vAt = w * arm;                              // the leaf's speed there, along the normal
  const closing = vIn - vAt;
  if (closing <= 0) return { w, keep: vIn };
  // right by the pivot nothing turns it; at rest, a push weaker than what holds it does nothing either
  if (Math.abs(arm) < 0.5 || (Math.abs(w) < REST && (force * Math.abs(arm)) / PX_PER_M < hold)) return { w, keep: Math.max(0, vAt) };
  const inv = (arm * arm) / I;                       // 1 / its mass as felt at the contact
  const loss = (resist * TQ * dt) / Math.abs(arm);   // kg.px/step the hinge takes back there this step
  const J = Math.min(force * dt * N_S, closing / inv + loss);
  return { w: w + (J * arm) / I, keep: Math.max(0, Math.min(vIn, vAt + (J - loss) * inv)) };
}

// A blow of J N.s along angle a landing at (x, y) on a leaf pivoted at (px, py): the change of its speed (rad/step)
export function blowOn(px, py, I, x, y, a, J) {
  return (J * N_S * ((x - px) * Math.sin(a) - (y - py) * Math.cos(a))) / I;
}

// The leaf's own swing over dt: its speed w after the hinge's dry friction (N.m: a steady brake that never turns it
// back) and drag (share of the speed lost a second), and a closer pulling it back shut from `rel` rad open
// (closer: { preload, k, sweep, back, backcheck, zone, freq, damp }, speeds in rad/s). Within `zone` of shut (all
// the way for a swinging door's spring hinge: zone Infinity) it is a damped spring about shut of `freq` rad/s and
// damping ratio `damp`: it overshoots and settles; further out its spring (`preload` + `k` N.m a rad) brings it back
// no faster than its valve lets it (`sweep`), and it brakes when thrown open past `back` (`backcheck`).
export function swing(w, rel, I, dt, { friction = 0, drag = 0, closer = null } = {}) {
  if (closer && rel) {
    const shut = -Math.sign(rel), far = Math.abs(rel);
    if (far < (closer.zone ?? 0)) {
      const f = closer.freq;
      w -= (f * f * rel + 2 * closer.damp * f * (w / STEP)) * dt * STEP;
    } else {
      w += shut * spinOf(closer.preload + closer.k * far, I, dt);
      if (w * shut > closer.sweep * STEP) w = shut * closer.sweep * STEP;
      if (far > closer.back && w * shut < 0) w *= Math.max(0, 1 - closer.backcheck * dt);
    }
  }
  const f = spinOf(friction, I, dt);
  w = Math.abs(w) <= f ? 0 : w - Math.sign(w) * f;
  return w * Math.max(0, 1 - drag * dt);
}
