// Leaning into something: a force-limited push between a pusher whose velocity is set every step (a character
// walking: to Matter he is as good as infinitely heavy, and its contact would hand whatever he touches his own speed
// at once) and a loose body. Run before the physics step: the body gets the momentum the pusher's force can give it
// this step, at the point of contact (off its centre it turns), and the pusher is held to the speed the body will
// really have there, so Matter's contact has nothing left to hand over.
//   - At rest, nothing happens until the force beats static friction (stick x mu.m.g): first a resistance, then it
//     gives way and scrapes along against kinetic friction (taken off by Friction.groundFriction).
//   - A heavy body is slow to get going (a = (F - mu.m.g) / m); a light one is quick, but never handed the pusher's
//     speed in one step.
import { G, PX_PER_M, STEP } from './Units.js';
import { kgOf, gyrOf, impulseAt } from './Body.js';
import { STICK } from './Friction.js';

const { Body } = Matter;

const N_S = PX_PER_M * STEP; // 1 N.s in kg.px/step
const REST = 0.02;           // px/step (and rad/step x gyr) under which a body is at rest

// The point of polygon `verts` closest to (px, py), and whether (px, py) is inside it.
function closestOnPoly(px, py, verts) {
  let best = null, bd = Infinity, inside = true;
  for (let i = 0, n = verts.length; i < n; i++) {
    const a = verts[i], b = verts[(i + 1) % n], ex = b.x - a.x, ey = b.y - a.y, len2 = ex * ex + ey * ey || 1;
    if (ex * (py - a.y) - ey * (px - a.x) < 0) inside = false; // Matter's vertices run clockwise on screen
    const t = Math.max(0, Math.min(1, ((px - a.x) * ex + (py - a.y) * ey) / len2));
    const x = a.x + ex * t, y = a.y + ey * t, d = (x - px) ** 2 + (y - py) ** 2;
    if (d < bd) { bd = d; best = { x, y }; }
  }
  best.d = Math.sqrt(bd);
  best.inside = inside;
  return best;
}

// Where a round pusher of radius r centred on (x, y) touches `body`: { nx, ny, x, y } (normal from him to it, the
// point), or null when they are further apart than `gap` px.
export function contactOf(x, y, r, body, gap = 0.5) {
  const c = closestOnPoly(x, y, body.vertices);
  if (!c.inside && c.d > r + gap) return null;
  let nx = c.x - x, ny = c.y - y;
  if (c.inside || c.d < 1e-6) { nx = body.position.x - x; ny = body.position.y - y; }
  const l = Math.hypot(nx, ny) || 1;
  return { nx: nx / l, ny: ny / l, x: c.x, y: c.y };
}

// One push along the contact c ({ nx, ny, x, y }) of a pusher closing at vIn px/step along the normal, with at most
// `force` N for dt s, on a floor where the body's kinetic friction is mu. Gives the body its momentum and returns the
// speed (px/step, along the normal) the pusher may keep: vIn when the body keeps ahead, less when it holds him back.
export function push(body, c, vIn, force, dt, mu) {
  const kg = kgOf(body);
  if (!kg || !isFinite(kg) || body.isStatic) return Math.min(vIn, 0);
  const v = Body.getVelocity(body), w = Body.getAngularVelocity(body);
  const rx = c.x - body.position.x, ry = c.y - body.position.y, g = gyrOf(body);
  const vAt = (v.x - w * ry) * c.nx + (v.y + w * rx) * c.ny; // the body's speed at the contact, along the normal
  const closing = vIn - vAt;
  if (closing <= 0) return vIn;
  const rn = rx * c.ny - ry * c.nx;
  const inv = 1 / kg + (rn * rn) / (kg * g * g);              // 1 / its mass as felt at that point
  const fric = mu * G * dt * N_S * kg;                         // what the floor takes this step (kg.px/step)
  const resting = Math.hypot(v.x, v.y) < REST && Math.abs(w) * g < REST;
  if (resting && force < (body.stick ?? STICK) * mu * kg * G) return Math.max(0, vAt); // it holds
  const J = Math.min(force * dt * N_S, closing / inv + fric);
  impulseAt(body, c.x, c.y, Math.atan2(c.ny, c.nx), J, Infinity);
  return Math.max(0, Math.min(vIn, vAt + J * inv - fric / kg));
}
