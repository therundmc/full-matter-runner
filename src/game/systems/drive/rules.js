// The drive's pure rules (systems/Drive.js; numbers in data/chase.js CHASE): the speed along the road and across it,
// the wheel as held, the nose on its spring, the slide and the grip, the body on its springs, the tyres letting go,
// a parked car shoved aside, a thing torn off or thrown in a bend, the crash or a clip, where he sits. Plain numbers
// in, plain numbers out (the input's `down` / `move` read by steerOf); DOM-free and Matter-free.
import { clamp, angDiff, rand } from '../../../engine/math.js';
import { CHASE } from '../../data/chase.js';

// the speed along the road a step later: v px/step, brought back to `cruise` at C.ease a second (nothing he holds
// changes it: what it hit took some of it)
export function speedStep(v, cruise, dt, C = CHASE) {
  return v < cruise ? Math.min(cruise, v + C.ease * dt) : Math.max(cruise, v - C.ease * dt);
}

// the steering as held, -1 (up the picture, -y) .. 1 (down): W / A / up / left up, S / D / down / right down (the
// arrows move him on foot too), else the pad's left stick by its y
const UP = ['KeyW', 'KeyA', 'ArrowUp', 'ArrowLeft'], DOWN = ['KeyS', 'KeyD', 'ArrowDown', 'ArrowRight'];
export function steerOf(input) {
  const held = (codes) => (codes.some((c) => input.down(c)) ? 1 : 0);
  return held(DOWN) - held(UP) || clamp(input.move?.()?.y ?? 0, -1, 1);
}

// the speed across a step later: u px/step; steer -1..1 (steerOf) toward steer x C.steer, nothing held: the
// road's pull takes it away (pull: px/step a second; after a shove, its own)
export function steerStep(u, steer, dt, C = CHASE, pull = C.pull) {
  const want = steer * C.steer, rate = steer ? C.steerRate : pull;
  return u < want ? Math.min(want, u + rate * dt) : Math.max(want, u - rate * dt);
}

// the way the car goes (vx along the road, vy across), at most C.heading off the road: what its nose is sprung to
export const headingOf = (vx, vy, C = CHASE) => clamp(Math.atan2(vy, Math.max(vx, 0.5)), -C.heading, C.heading);

// THE SLIDE (C.slide). How much of the wheel the tyres give, 1 at the cruise speed: less the faster it goes (`fall`
// of it gone flat out, C.max: it turns in later, understeer; as much more well under the cruise speed, slowed by a
// hit: it bites) and less again while the rear is out (`under` of it at
// the most slip: a sliding car goes where it was going)
export function gripOf(v, slip = 0, C = CHASE) {
  const S = C.slide, fast = clamp((v - C.cruise) / (C.max - C.cruise), -1, 1);
  return (1 - S.fall * fast) * (1 - S.under * clamp(Math.abs(slip) / S.most, 0, 1));
}

// The rear stepping out, a step later: [slip, its speed]. slip: rad the body is turned past the way it goes (+: the
// nose toward +y, the tail swung out toward -y). What lets it go: the wheel thrown over against the way the car is
// still going across (a flick: over `flick[0]` of the full sideways speed, `flick[1]` rad/s2 at all of it), full
// lock held longer than `hold[0]` s (`hold[1]` rad/s2), and kicks given to its speed from outside (a shove, a blow).
// What brings it back: a spring `k` (1/s2), damped `d` (1/s) with nothing held (under-damped: it fishtails once),
// `catch` when he steers against it (countersteer: caught, no wag); steering INTO it the spring is only `into` of
// itself (it is held out: a drift). Never past `most`
export function slideStep(slip, slipV, steer, u, held, dt, C = CHASE) {
  const S = C.slide, full = Math.abs(u) / C.steer;
  let push = 0;
  if (steer && u * steer < 0 && full > S.flick[0]) push += steer * S.flick[1] * Math.min(1, full);
  if (steer && held > S.hold[0]) push += steer * S.hold[1];
  const into = steer * slip > 0, counter = steer * slip < 0;
  slipV += (push - slip * S.k * (into ? S.into : 1) - slipV * (counter ? S.catch : S.d)) * dt;
  slip += slipV * dt;
  if (Math.abs(slip) > S.most) { slip = Math.sign(slip) * S.most; if (slip * slipV > 0) slipV = 0; }
  // (as good as straight: dead straight; a car a hair off its line is drawn crooked)
  if (!push && Math.abs(slip) < S.snap && Math.abs(slipV) < S.snap * 8) return [0, 0];
  return [slip, slipV];
}

// The nose a step later: its turning speed (rad/s) from its angle, the speed it turns at now (rad/s) and the way it
// is sprung to (C.yaw: a spring all but critically damped, so it lags a little and does not wag)
export function yawStep(angle, turning, want, dt, C = CHASE) {
  return turning + (angDiff(angle, want) * C.yaw.k - turning * C.yaw.d) * dt;
}

// a spring a step later: [x, its speed] toward `want` (k: 1/s2, d: 1/s). The body on its wheels (C.body)
export function springStep(x, vel, want, k, d, dt) {
  vel += ((want - x) * k - vel * d) * dt;
  return [x + vel * dt, vel];
}

// what the body's springs are pushed to: [squat px (+: sat back on the rear wheels; -: the nose down), roll px (+:
// toward +y)] for ax / ay px/step gained a second along / across and u px/step held across: it sits back as it
// pulls, dives as a hit takes its speed, rolls out of the bend
export function bodyLean(ax, ay, u, C = CHASE) {
  const B = C.body;
  return [clamp(ax * B.pitch, -B.most, B.most), clamp(-(ay * B.roll + u * B.lean), -B.most, B.most)];
}

// the speed on the dial
export const kmh = (v, C = CHASE) => Math.round(v * C.kmh);

// Are the tyres letting go (smoke, rubber left on the road)? u: px/step across, v: along, shoving: in a shove. 0:
// no; else how hard, up to 1
// (slip: rad its rear is out, the slide: from C.slide.smoke on, all of it at C.slide.most)
export function skidOf(u, v, shoving, C = CHASE, slip = 0) {
  const F = C.fx, S = C.slide;
  if (v < F.from) return 0;
  if (shoving) return 1;
  const k = Math.abs(u) / C.steer, out = Math.abs(slip) >= S.smoke ? clamp(Math.abs(slip) / S.most, 0, 1) : 0;
  return Math.max(out, k >= F.slide ? clamp(k, 0, 1) * F.steer : 0);
}

// A PARKED CAR HIT IS SHOVED ASIDE (C.aside; the user: "it must move aside, it blocks us"). How square the hit is,
// 0 (a graze, a flank) .. 1 (full on the nose): the share of his car's width what he hit covers (none of it under
// `graze` of the width, all of it from `full` on), times how much the contact faces his nose (dot: the contact's
// normal along the nose)
export function squareOf(cover, dot, C = CHASE) {
  const A = C.aside;
  return clamp((cover - A.graze) / (A.full - A.graze), 0, 1) * clamp(dot, 0, 1);
}

// the share of his speed he keeps: `loss[0]` gone on a graze, `loss[1]` on a square hit. Never stopped
export const asideKeep = (sq, C = CHASE) => 1 - (C.aside.loss[0] + (C.aside.loss[1] - C.aside.loss[0]) * clamp(sq, 0, 1));

// How the car he hit is thrown: { along: x his speed, on ahead of him (a square hit throws it on faster than he
// goes: it is out of his way, never held on his nose), across: px/step toward its side, spin: rad/step }; a heavier
// one (kg) goes less
export function asideThrow(sq, kg, C = CHASE) {
  const A = C.aside, mix = (r) => r[0] + (r[1] - r[0]) * clamp(sq, 0, 1), k = clamp(A.kg / kg, A.heavy, 1);
  return { along: mix(A.ahead) * k, across: mix(A.side) * k, spin: mix(A.spin) };
}

// how hard a thing torn off the kerb is thrown (Prop.break's power), by the speed it was hit at (px/step)
export const tearPower = (speed, C = CHASE) => clamp(C.hit.power * (speed / C.cruise), C.hit.power * C.hit.least, C.hit.most);

// IN A BEND (CHASE.bend.smash): may a loose thing of `kg` be thrown by hand out of the line? And the share of the
// car's speed it is thrown at (a light one: CHASE.hit.fling's; a heavy one by its mass, `heavy` [least, most])
export const smashable = (kg, K = CHASE.bend.smash) => kg <= K.kg;
export function smashSpeed(kg, C = CHASE) {
  const K = C.bend.smash, F = C.hit.fling;
  if (kg <= F.kg) return rand(...F.v);
  return K.heavy[0] + (K.heavy[1] - K.heavy[0]) * clamp((K.kg - kg) / (K.kg - F.kg), 0, 1);
}
// does a thing thrown in a bend burst as it goes (def: its PROPS entry): all but metal with more than `burst` hp
export const bursts = (def, K = CHASE.bend.smash) => !!def && !def.lasting && (def.material !== 'metal' || (def.hp ?? 0) <= K.burst);
// a bend's speed (px/step) after what it hit cost it (`k` of it), never under `floor` of the bend's own
export const smashCost = (v, k, speed, K = CHASE.bend.smash) => Math.max(Math.min(v, speed * K.floor), v * (1 - k));

// sprite px of a vehicle's driver's seat and of the ground outside its driver's door (-y): its model's `seat` / `door`
// (VEHICLES), else CHASE's shares of its size
export function seatOf(v, C = CHASE) {
  return v.m?.seat ?? [v.w * C.seat[0], v.h * C.seat[1]];
}
export function doorOf(v, C = CHASE) {
  return v.m?.door ?? [v.w * C.door[0], -C.door[1]];
}

// Is a contact the crash? a: the van's angle, (vx, vy) its velocity, (nx, ny) the normal into what it hit
export function nosedIn(a, vx, vy, nx, ny, C = CHASE) {
  const ca = Math.cos(a), sa = Math.sin(a);
  return ca * nx + sa * ny >= Math.cos(C.crash.cone) && vx * ca + vy * sa > C.crash.speed;
}

// px of the car's width (its middle at y, h wide) that what it hit covers (from lo to hi across the road)
export const coverOf = (lo, hi, y, h) => Math.min(hi, y + h / 2) - Math.max(lo, y - h / 2);

// Did it take it on the nose, or only clip it with a corner? Under `corner` of the car's width covered by what it
// hit is a clip, a jolt and sparks, not the crash
export const onNose = (lo, hi, y, h, C = CHASE) => coverOf(lo, hi, y, h) / h >= C.crash.corner;

// Only grazed: what it hit covers under `graze` px of its width (the next wall body along the building fronts it
// slides on, met at their seam): a scrape, it goes on (no clip)
export const grazes = (lo, hi, y, h, C = CHASE) => coverOf(lo, hi, y, h) < C.crash.graze;
