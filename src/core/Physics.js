// Physical units on top of Matter.js.
// 1 m = 32 px (one tile), masses in kg, forces in newtons. Matter velocities are px per 1/60 s ("px/step").
const { Body } = Matter;

export const KG = 0.0056;        // Matter mass units per kilogram (an 80 kg player = 0.45)
export const G = 9.81;           // m/s²
export const PX_PER_M = 32;
export const PUSH_FORCE = 520;   // N a character can push with

// how grippy each floor is (multiplies the object's own friction coefficient)
export const FLOOR_MU = {
  wood: 1, checker: 0.8, tile_blue: 0.75, carpet_red: 1.35, carpet_purple: 1.35, concrete: 1.05, grass: 1.5,
  asphalt: 1.15, asphalt_line: 1.1, dirt: 1.4, sidewalk: 1.05, neon_floor: 0.8,
};

export function setKg(body, kg) { Body.setMass(body, kg * KG); }
export function kgOf(body) { return body.mass / KG; }

// give a body physical surface properties. mu: sliding friction coefficient against the floor.
// fly: seconds it travels through the air before touching the floor (no ground friction meanwhile).
export function setMaterial(body, kg, mu, fly = 0) {
  setKg(body, kg);
  body.mu = mu;
  body.flyUntil = fly;
}

export function floorMu(map, x, y) {
  const cx = Math.floor(x / 32), cy = Math.floor(y / 32);
  if (cx < 0 || cy < 0 || cx >= map.w || cy >= map.h) return 1;
  return FLOOR_MU[map.floor[cy * map.w + cx]] ?? 1;
}

// force (N) needed to get a resting body sliding
export function breakawayForce(map, body) {
  return (body.mu ?? 0.6) * floorMu(map, body.position.x, body.position.y) * kgOf(body) * G;
}

// too heavy for a person: kept static while at rest, woken up by big impulses only
export function freezeIfHeavy(map, body) {
  if (breakawayForce(map, body) > PUSH_FORCE) {
    body.heavy = true;
    Body.setStatic(body, true);
    body.frozen = true;
  }
}

export function wake(body) {
  if (body.frozen) {
    Body.setStatic(body, false);
    body.frozen = false;
    body.restT = 0;
  }
}

// momentum J (kg·px/step) applied along angle a: light things fly, heavy things barely budge
export function impulse(body, a, J, spin = 0, cap = 12) {
  const kg = body.frozen ? body._original?.mass / KG : kgOf(body);
  if (!kg || !isFinite(kg)) return 0;
  const dv = Math.min(cap, J / kg);
  if (body.frozen) { if (dv < 0.35) return dv; wake(body); }
  if (body.isStatic) return 0;
  const v = Body.getVelocity(body);
  Body.setVelocity(body, { x: v.x + Math.cos(a) * dv, y: v.y + Math.sin(a) * dv });
  if (spin) Body.setAngularVelocity(body, Body.getAngularVelocity(body) + spin * Math.min(1, 20 / kg));
  return dv;
}

// Coulomb friction with the floor: constant deceleration mu·g, things stop instead of drifting forever
export function groundFriction(world, bodies, dt) {
  const map = world.map;
  const t = world.time;
  for (const b of bodies) {
    if (b.isStatic || b.mu === undefined) continue;
    if (b.flyUntil > t) continue;
    const mu = b.mu * floorMu(map, b.position.x, b.position.y);
    const dec = (mu * G * PX_PER_M * dt) / 60; // px/step lost this step
    const v = Body.getVelocity(b);
    const s = Math.hypot(v.x, v.y);
    if (s <= dec) { if (s > 0) Body.setVelocity(b, { x: 0, y: 0 }); }
    else Body.setVelocity(b, { x: v.x * (s - dec) / s, y: v.y * (s - dec) / s });
    const w = Body.getAngularVelocity(b);
    const wd = mu * 6 * dt / 60 * 4;
    if (Math.abs(w) <= wd) { if (w) Body.setAngularVelocity(b, 0); }
    else Body.setAngularVelocity(b, w - Math.sign(w) * wd);
    // heavy objects settle back into "static" so nobody can shove them around
    if (b.heavy) {
      if (s < 0.03 && Math.abs(w) < 0.003) {
        b.restT = (b.restT || 0) + dt;
        if (b.restT > 0.4) { Body.setStatic(b, true); b.frozen = true; }
      } else b.restT = 0;
    }
  }
}
