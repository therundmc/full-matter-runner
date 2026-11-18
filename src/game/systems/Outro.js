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

export const OUTRO = {
  walk: 0.6,        // he walks to the driver's door (snapped there if not reached) ...
  vault: 0.55,      // ... and vaults over it into the seat (an open car), for that long
  sit: 0.62,        // share of the vault from which he settles into the seat (the seated pose comes in)
  key: [1.42, 0.3], // his right hand goes to the ignition: when it is there, and for how long there and back
  lights: 1.5,      // the key turned: lights on, the starter cranks the engine over ...
  catch: 2.05,      // ... until it catches, flaring (`flare`: revs, share of the redline, for s) then idling
  flare: [0.6, 0.16],
  jolt: [1.1, 0.25, 0.1], // as it catches the body kicks: px it sits back, s it takes to come back, the camera's shake
  go: 2.45,         // he floors it: the rear wheels spin where it stands ...
  spin: 0.8,        // ... for that long, then they bite and it goes
  creep: 0.55,      // px per step it crawls while they spin
  grip: 0.45,       // s the spin takes to die once they bite
  wag: [0.06, 7.5], // the tail wagging while they spin: rad, rad/s
  kick: -2.3,       // rad/s the tail is thrown at as they bite (the slide's spring brings it back: the fishtail)
  squat: 1.6,       // px the body sits back on its rear wheels while they spin
  screech: 0.9,     // how loud the tyres are held while they spin (the squeal of audio/Motor.js)
  skipAfter: 0.4,   // any key or click from then on goes straight to the results
  speed: 8.6,       // px per step flat out on a straight
  corner: 5.2,      // ... and through a bend
  accel: 9,         // px per step gained in a second
  brake: 16,        // ... and lost in a second, braking into a bend
  look: 2.2 * TILE, // px ahead it sees a bend coming
  radius: 3 * TILE, // of a bend, when the level gives none (exit.radius, tiles, one per bend)
  slip: 0.5,        // rad its nose turns in further than its way through a bend: the tail is out
  spring: [46, 6.5], // stiffness and damping of that slide (under-damped: it swings back past straight once)
  pivot: 15,        // px ahead of its middle of the point that keeps to the route (a slide swings the tail)
  smoke: 0.14,      // rad of slide from which the rear tyres smoke and mark the floor
  maxDist: 9 * TILE, // the straight way out of a level without a route
  fade: 5,          // tiles before the end of the route where the fade starts (exit.fade)
  fadeDur: 0.75,    // s to black
  hold: 0.3,        // s of black before the results
  timeout: 14,      // s after which the results come up whatever happened
  bars: 0.09,       // height of each letterbox bar, share of the screen
  barsIn: 0.35,     // s for the bars to slide in
  door: 115,        // sprite x of the cab door of a model that gives no `door` (the van's sprite: 160 px, nose at +x)
  reach: 8 * TILE,  // a vehicle parked this close to the exit zone is the getaway
  cam: 0.5,         // s for the camera to go from the player to the driver's seat, from `walk` on
  lead: 70,         // px the camera looks ahead of him once it moves
  // the rubber laid on the floor (decals): px wide, how dark while the wheels spin / while it slides
  marks: { w: 3.4, spin: 0.5, slide: 0.32, color: '10, 8, 14' },
  // what the rear wheels throw up. spinSmoke / slideSmoke: [puffs a wheel a step, px, s] of the white tyre smoke
  // while they spin / [chance a step, px, s] while it slides; grit: for `dur` s from the launch, gravel thrown back [chance a step, px/s], its
  // colours; spray: a wheel in a puddle [chance a step, drops, px/s]; sparks: the tail's low corner on the ground
  // from `from` rad of slide [chance a step, n]; wake: papers within `r` px dragged along at `pull` of its speed,
  // thrown `aside` px/s
  fx: {
    spinSmoke: [3, 12, 1.9], slideSmoke: [0.8, 7, 1],
    grit: { dur: 1.3, chance: 0.8, speed: 260, colors: ['#6a6272', '#4a4452', '#8a8290'] },
    spray: [0.6, 3, 150],
    sparks: { from: 0.36, chance: 0.5, n: 3 },
    wake: { r: 70, pull: 0.5, aside: 60 },
  },
  // what lay on the rear seat (Vehicle `hat`) flies out at the first swing of the tail harder than `slip` rad: thrown
  // `keep` of the car's speed on, `side` px/s to the outside of the swing
  hat: { slip: 0.3, keep: 0.45, side: 90 },
  // what the car does to what it runs into (Vehicle.ram): crush = the blow a loose thing takes (hp), fling = px/step
  // it is thrown at if it survives, aside = rad off the car's way, to the side it was on, spin = rad/step; tear =
  // the power a bolted thing is torn off with; again = s before a thing still under the wheels is hit again; shake =
  // the camera's; papers = sheets that fly off each thing hit [n, px/s]. A parked car (Vehicle.shove / crunch) is
  // never driven through: shoved at carK of the getaway's speed (car px/step at least), spun at carSpin rad/step,
  // carFly s without floor friction, both scaled down for a graze (bite: px of the getaway's width in it for the
  // full blow; graze: the least share); crumpled where it is struck (dents round the point, the lamp at that end
  // smashed within `lamp` sprite px of it, `chunks` bits of paint and trim, carHp lost); the getaway keeps carKeep of
  // its speed, the camera shaken carShake and pushed in `punch`
  ram: {
    crush: 40, fling: [6, 10], aside: [0.35, 0.9], spin: 0.45, tear: 1.5, again: 0.3, fly: 0.35, shake: 0.3, papers: [3, 220],
    car: 3, carK: 0.5, carAside: [0.7, 1], carSpin: 0.06, carFly: 0.12, bite: 16, graze: 0.3, dents: 3, lamp: 24, chunks: 7, carHp: 6, carKeep: 0.85, carShake: 0.6, punch: 0.06,
  },
};

const ease = (k) => k * k * (3 - 2 * k); // smoothstep

// 'walk' -> 'board' -> 'ignition' -> 'drive'
export function outroPhase(t, o = OUTRO) {
  if (t < o.walk) return 'walk';
  if (t < o.lights) return 'board';
  if (t < o.go) return 'ignition';
  return 'drive';
}

// the beats of an open car's getaway, finer: 'walk' -> 'vault' (over the door) -> 'seat' (settling, the hands to the
// wheel, the key) -> 'start' (the starter cranking) -> 'idle' (caught) -> 'wheelspin' -> 'bite' (it goes)
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

// A route: straight lines through pts ([x, y] px), each inner point rounded off by a bend of radius radii[i - 1]
// (r0 when missing; shortened when the lines are too short for it). { length, at(s) } where at gives the point s px
// along it: { x, y, a: the way it runs, turn: -1 | 0 | 1 in a bend (1: a grows, clockwise on screen), slide: the
// turn times the share of the full slide that bend is taken with (slides[i - 1], 1 when missing; 0: a bend too
// tight to slide through) }.
export function routePath(pts, radii = [], r0 = OUTRO.radius, slides = []) {
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
    segs.push({ s0: length, len: r * phi, c, r, sign, k: slides[i - 1] ?? 1, a0: Math.atan2(cur[1] - c[1], cur[0] - c[0]) });
    length += r * phi;
    cur = [P[0] + d2[0] * tl, P[1] + d2[1] * tl];
  }
  line(pts[pts.length - 1]);
  const at = (s) => {
    s = clamp(s, 0, length);
    let g = segs[segs.length - 1];
    for (const k of segs) if (s <= k.s0 + k.len) { g = k; break; }
    const u = s - g.s0;
    if (!g.c) return { x: g.from[0] + Math.cos(g.a) * u, y: g.from[1] + Math.sin(g.a) * u, a: g.a, turn: 0, slide: 0 };
    const th = g.a0 + (g.sign * u) / g.r;
    return { x: g.c[0] + Math.cos(th) * g.r, y: g.c[1] + Math.sin(th) * g.r, a: th + (g.sign * Math.PI) / 2, turn: g.sign, slide: g.sign * g.k };
  };
  return { length, at };
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
