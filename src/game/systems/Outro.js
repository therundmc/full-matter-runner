// The end of a level that has a getaway car (DOM-free): once the way out is open and the player steps into the exit
// zone, he walks to the driver's door. An open car (a model with a `cabin`: THE BOSS's convertible): he vaults over
// the door into the seat, his hands find the wheel, he turns the key: the lights come on, the starter cranks, the
// engine catches (the body jolts, the pipes cough). Then the launch: the rear wheels spin where it stands (white
// smoke, the tail sat down and wagging, rubber laid on the floor), they bite, the tail kicks out and it tears off
// along the level's route (exit.route, tiles: straight lines joined by bends; none: straight ahead) while black bars
// close the picture. A closed one (a van): he gets in by the cab door and is seen no more; the rest is the same.
// It floors it on the straights, brakes into a bend and slides through it, tail out, swinging back after; nothing
// stops it or pushes it (Vehicle.driveTo / ram: what it runs into is smashed or thrown aside). The picture fades to
// black over the last stretch, then the results come up.
// Data + pure functions: World.stepOutro plays it, Game and ui/Screens.drawOutro only read the outro's state
// { t: s since he stepped into the zone, s: px along the route, v: px/step, slip: rad, wag: rad, heading,
//   fadeAt: s | null }.
import { TILE } from '../Config.js';
import { clamp } from '../../engine/math.js';
import { MOTOR, squealOf, launchChirp } from '../../audio/Motor.js';
import { OUTRO } from '../data/outro.js';
import { routePath } from './RoutePath.js';

export { OUTRO }; // (its numbers: data/outro.js; Game, World and ui/Screens read them from here)

const ease = (k) => k * k * (3 - 2 * k); // smoothstep

// 'walk' -> 'board' -> 'ignition' -> 'drive' (kept for the tests: the timeline's order)
export function outroPhase(t, o = OUTRO) {
  if (t < o.walk) return 'walk';
  if (t < o.lights) return 'board';
  if (t < o.go) return 'ignition';
  return 'drive';
}

// the beats of an open car's getaway, finer: 'walk' -> 'vault' (over the door) -> 'seat' (settling, the hands to the
// wheel, the key) -> 'start' (the starter cranking) -> 'idle' (caught) -> 'wheelspin' -> 'bite' (it goes). Kept for
// the tests
export function outroBeat(t, o = OUTRO) {
  if (t < o.walk) return 'walk';
  if (t < o.walk + o.vault) return 'vault';
  if (t < o.lights) return 'seat';
  if (t < o.catch) return 'start';
  if (t < o.go) return 'idle';
  if (t < o.go + o.spin) return 'wheelspin';
  return 'bite';
}

// 0..1 how hard the rear wheels spin: flat out from `go`, dying over `grip` s once they bite
export function spinK(t, o = OUTRO) {
  const u = t - o.go;
  return u < 0 ? 0 : u < o.spin ? 1 : clamp(1 - (u - o.spin) / o.grip, 0, 1);
}

// rad the tail wags off its way while they spin
export const wagAt = (t, o = OUTRO) => Math.sin((t - o.go) * o.wag[1]) * o.wag[0] * spinK(t, o);

// 0..1 his right hand on the ignition (there at key[0], key[1] s there and back)
export function keyK(t, o = OUTRO) {
  const [at, dur] = o.key;
  return clamp(1 - Math.abs(t - at) / dur, 0, 1);
}

// px the body sits back: on its rear wheels while they spin, and the kick as the engine catches
export function squatAt(t, o = OUTRO) {
  const [px, dur] = o.jolt, u = (t - o.catch) / dur;
  return o.squat * spinK(t, o) + (u >= 0 && u < 1 ? px * (1 - u) * (1 - u) : 0);
}

// the car's speed (px per step) a step later: up toward flat out, down toward the bend's when one is on or coming
// (cap: no faster than that: its wheels spinning)
export function routeSpeed(v, bend, dt, o = OUTRO, cap = Infinity) {
  const target = Math.min(bend ? o.corner : o.speed, cap);
  return v < target ? Math.min(target, v + o.accel * dt) : Math.max(target, v - o.brake * dt);
}

// the slide a step later: [slip, its speed], pulled toward the bend's (turn -1 | 0 | 1) by an under-damped spring
export function slideStep(slip, slipV, turn, v, dt, o = OUTRO) {
  const [k, d] = o.spring, want = turn * o.slip * Math.min(1, v / o.corner);
  const sv = slipV + ((want - slip) * k - slipV * d) * dt;
  return [slip + sv * dt, sv];
}

// The way out of a car parked at (x, y) pointing along a, by a level's exit ({ route: [[col, row]], radius: tiles,
// one per bend, slide: share of the slide, one per bend }; no route: straight ahead): the path of the point `pivot`
// px ahead of its middle (driveStep).
export function getawayPath(x, y, a, ex = {}, O = OUTRO) {
  const x0 = x + Math.cos(a) * O.pivot, y0 = y + Math.sin(a) * O.pivot;
  const pts = [[x0, y0], ...(ex.route ? ex.route.map(([c, r]) => [c * TILE, r * TILE])
    : [[x0 + Math.cos(a) * O.maxDist, y0 + Math.sin(a) * O.maxDist]])];
  return routePath(pts, (ex.radius || []).map((r) => r * TILE), O.radius, ex.slide);
}

// The car a step later along its route (o: the outro's state; from `go` on): held to a crawl while its rear wheels
// spin, then flat out, braking into a bend, the tail stepping out in it; as they bite the tail is kicked out (the
// fishtail). Returns where it is: { x, y: its middle, a: the way it points, q: the route's point (q.a: its way) }:
// the point `pivot` px ahead of its middle keeps to the route, so a slide swings the tail, not the nose.
export function driveStep(o, path, t, dt, O = OUTRO) {
  const bend = path.at(o.s).turn || path.at(o.s + O.look).turn;
  o.v = routeSpeed(o.v, bend, dt, O, t < O.go + O.spin ? O.creep : Infinity);
  o.s = Math.min(path.length, o.s + o.v * dt * 60);
  const q = path.at(o.s);
  if (crossed(t - dt, t, O.go + O.spin)) o.slipV += O.kick;
  [o.slip, o.slipV] = slideStep(o.slip, o.slipV, q.slide, o.v, dt, O);
  o.wag = wagAt(t, O);
  o.heading = q.a;
  const a = q.a + o.slip + o.wag;
  return { x: q.x - Math.cos(a) * O.pivot, y: q.y - Math.sin(a) * O.pivot, a, q };
}

// What the car sounds like this step, from what it does (audio/Motor.js; World.stepOutro hands it to Audio.motor):
// its gearbox (out.box, a Gearbox) stepped with its real speed, the throttle read off its speed a step ago
// (out.lastV: floored while it gains or holds flat out, off while it brakes), the rear wheels spinning for `spin` s
// from `go`; the tyres squeal with the slide and the speed, chirp at the launch and the shift out of first
// (out.chirpT). Returns { revs, load, squeal, road, pops } or null before the engine has caught.
export function motorState(out, t, dt, o = OUTRO, m = MOTOR) {
  if (t < o.catch) return null;
  const first = t - dt < o.catch, speed = out.v / o.speed, u = (t - o.go) / o.spin, dv = out.v - (out.lastV ?? 0);
  const flare = t < o.catch + o.flare[1];
  const throttle = t < o.go ? (flare ? 1 : 0.15) : dv > 1e-6 || out.v >= o.speed ? 1 : dv < -1e-6 ? 0 : 0.6;
  const box = out.box.step(speed, throttle, u >= 0 && u < 1, dt, flare ? o.flare[0] : 0);
  out.lastV = out.v;
  const [chirp, len] = m.squeal.shiftChirp;
  out.chirpT = box.shifted > 0 && box.gear === 1 ? len : Math.max(0, (out.chirpT ?? 0) - dt);
  return {
    revs: box.revs, load: box.load, road: speed,
    squeal: squealOf(out.slip, speed, Math.max(launchChirp(u, m), o.screech * spinK(t, o), (chirp * out.chirpT) / len), m),
    pops: first ? m.pops.catch : box.shifted > 0 ? m.pops.shift : 0,
  };
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
