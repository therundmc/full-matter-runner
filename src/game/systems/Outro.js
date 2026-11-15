// The end of a level that has a getaway vehicle (DOM-free): once the way out is open and the player steps into the
// exit zone, he walks to the cab door and gets in, the lights come on, the engine starts and the van tears off along
// the level's route (exit.route, tiles: straight lines joined by bends; none: straight ahead) while black bars close
// the picture. It floors it on the straights, brakes into a bend and slides through it, tail out, swinging back
// after; nothing stops it or pushes it (Vehicle.driveTo / ram: what it runs into is smashed or thrown aside). The
// picture fades to black over the last stretch, then the results come up.
// Data + pure functions: World.stepOutro plays it, Game and ui/Screens.drawOutro only read the outro's state
// { t: s since he stepped into the zone, s: px along the route, v: px/step, slip: rad, heading, fadeAt: s | null }.
import { TILE } from '../Config.js';
import { clamp } from '../../engine/math.js';

export const OUTRO = {
  walk: 0.6,        // he walks to the cab door (snapped there if not reached) and gets in
  lights: 0.8,      // lights on, engine started
  go: 1.0,          // it pulls away
  skipAfter: 0.4,   // any key or click from then on goes straight to the results
  speed: 8.6,       // px per step flat out on a straight
  corner: 5.2,      // ... and through a bend
  accel: 9,         // px per step gained in a second
  brake: 16,        // ... and lost in a second, braking into a bend
  look: 2.2 * TILE, // px ahead it sees a bend coming
  radius: 3 * TILE, // of a bend, when the level gives none (exit.radius, tiles, one per bend)
  slip: 0.5,        // rad its nose turns in further than its way through a bend: the tail is out
  spring: [46, 6.5], // stiffness and damping of that slide (under-damped: it swings back past straight once)
  spin: 0.5,        // s of wheelspin as it pulls away
  smoke: 0.14,      // rad of slide from which the rear tyres smoke and mark the floor
  maxDist: 9 * TILE, // the straight way out of a level without a route
  fade: 5,          // tiles before the end of the route where the fade starts (exit.fade)
  fadeDur: 0.75,    // s to black
  hold: 0.3,        // s of black before the results
  timeout: 14,      // s after which the results come up whatever happened
  bars: 0.09,       // height of each letterbox bar, share of the screen
  barsIn: 0.35,     // s for the bars to slide in
  door: 115,        // sprite x of the cab door (the van's sprite is 160 px long, nose at +x)
  reach: 8 * TILE,  // a van parked this close to the exit zone is the getaway
  cam: 0.5,         // s for the camera to go from the player to the cab, from `walk` on
  lead: 70,         // px the camera looks ahead of the cab once it moves
  // what the van does to what it runs into (Vehicle.ram): crush = the blow a loose thing takes (hp), fling = px/step
  // it is thrown at if it survives, aside = rad off the van's way, to the side it was on, spin = rad/step; tear =
  // the power a bolted thing is torn off with; car = px/step a parked car is shoved at; again = s before a thing
  // still under the wheels is hit again; shake = the camera's
  ram: { crush: 40, fling: [6, 10], aside: [0.35, 0.9], spin: 0.45, tear: 1.5, car: 3.4, carSpin: 0.035, again: 0.3, fly: 0.35, shake: 0.3 },
};

const ease = (k) => k * k * (3 - 2 * k); // smoothstep

// 'walk' -> 'board' -> 'ignition' -> 'drive'
export function outroPhase(t, o = OUTRO) {
  if (t < o.walk) return 'walk';
  if (t < o.lights) return 'board';
  if (t < o.go) return 'ignition';
  return 'drive';
}

// A route: straight lines through pts ([x, y] px), each inner point rounded off by a bend of radius radii[i - 1]
// (r0 when missing; shortened when the lines are too short for it). { length, at(s) } where at gives the point s px
// along it: { x, y, a: the way it runs, turn: -1 | 0 | 1 in a bend (1: a grows, clockwise on screen) }.
export function routePath(pts, radii = [], r0 = OUTRO.radius) {
  const segs = [];
  let cur = pts[0], length = 0;
  const line = (to) => {
    const len = Math.hypot(to[0] - cur[0], to[1] - cur[1]);
    if (len > 1e-6) { segs.push({ s0: length, len, from: cur, a: Math.atan2(to[1] - cur[1], to[0] - cur[0]) }); length += len; }
    cur = to;
  };
  for (let i = 1; i < pts.length - 1; i++) {
    const P = pts[i], B = pts[i + 1];
    const l1 = Math.hypot(P[0] - cur[0], P[1] - cur[1]), l2 = Math.hypot(B[0] - P[0], B[1] - P[1]);
    const d1 = [(P[0] - cur[0]) / l1, (P[1] - cur[1]) / l1], d2 = [(B[0] - P[0]) / l2, (B[1] - P[1]) / l2];
    const cross = d1[0] * d2[1] - d1[1] * d2[0], phi = Math.acos(clamp(d1[0] * d2[0] + d1[1] * d2[1], -1, 1));
    if (phi < 0.02) continue; // no bend to speak of
    const half = Math.tan(phi / 2), sign = cross >= 0 ? 1 : -1;
    const r = Math.min(radii[i - 1] ?? r0, (l1 * 0.98) / half, (l2 * 0.49) / half), tl = r * half;
    line([P[0] - d1[0] * tl, P[1] - d1[1] * tl]);
    const c = [cur[0] - d1[1] * sign * r, cur[1] + d1[0] * sign * r];
    segs.push({ s0: length, len: r * phi, c, r, sign, a0: Math.atan2(cur[1] - c[1], cur[0] - c[0]) });
    length += r * phi;
    cur = [P[0] + d2[0] * tl, P[1] + d2[1] * tl];
  }
  line(pts[pts.length - 1]);
  const at = (s) => {
    s = clamp(s, 0, length);
    let g = segs[segs.length - 1];
    for (const k of segs) if (s <= k.s0 + k.len) { g = k; break; }
    const u = s - g.s0;
    if (!g.c) return { x: g.from[0] + Math.cos(g.a) * u, y: g.from[1] + Math.sin(g.a) * u, a: g.a, turn: 0 };
    const th = g.a0 + (g.sign * u) / g.r;
    return { x: g.c[0] + Math.cos(th) * g.r, y: g.c[1] + Math.sin(th) * g.r, a: th + (g.sign * Math.PI) / 2, turn: g.sign };
  };
  return { length, at };
}

// the van's speed (px per step) a step later: up toward flat out, down toward the bend's when one is on or coming
export function routeSpeed(v, bend, dt, o = OUTRO) {
  const target = bend ? o.corner : o.speed;
  return v < target ? Math.min(target, v + o.accel * dt) : Math.max(target, v - o.brake * dt);
}

// the slide a step later: [slip, its speed], pulled toward the bend's (turn -1 | 0 | 1) by an under-damped spring
export function slideStep(slip, slipV, turn, v, dt, o = OUTRO) {
  const [k, d] = o.spring, want = turn * o.slip * Math.min(1, v / o.corner);
  const sv = slipV + ((want - slip) * k - slipV * d) * dt;
  return [slip + sv * dt, sv];
}

// 0..1 black over the picture (out: the outro's state)
export function fadeAlpha(out, o = OUTRO) {
  return out.fadeAt === null ? 0 : ease(clamp((out.t - out.fadeAt) / o.fadeDur, 0, 1));
}

// black and held: the results
export function outroOver(out, o = OUTRO) {
  return out.t >= o.timeout || (out.fadeAt !== null && out.t >= out.fadeAt + o.fadeDur + o.hold);
}

// 0..1 how far the letterbox bars are in (ease out)
export function barsK(t, o = OUTRO) {
  const k = clamp(t / o.barsIn, 0, 1);
  return 1 - (1 - k) ** 3;
}

// 0..1 the camera's way from the player to the cab
export function camBlend(t, o = OUTRO) {
  return ease(clamp((t - o.walk) / o.cam, 0, 1));
}

// did the clock cross `at` during the step from t0 to t1? (one-shot beats of the timeline)
export function crossed(t0, t1, at) { return t0 < at && t1 >= at; }
