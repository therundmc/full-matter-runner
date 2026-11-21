// How a pursuer drives (systems/Pursuit.js P: its state): like his car, every step a speed and a heading turned into
// its velocity after reading back what the physics let it do (driveCar); what it wants (want): its slot kept up with,
// his car never driven through, a toll's gate lane, what stands in its lane swerved round on a line that slides
// (easeLine) or braked for (blockedAt), its attack (a ram, a brake); brought back up behind him when left far behind
// (catchUp). Numbers: CHASE.pursuit. DOM-free.
import { TILE } from '../../Config.js';
import { clamp, angDiff, approachAngle } from '../../../engine/math.js';
import { CHASE } from '../../data/chase.js';
import { slideSmoke } from '../chase/shared.js';
import { slideStep } from '../drive/rules.js';
import { attackPhase } from './attacks.js';
import { sides, slot } from './slots.js';

const { Body } = Matter;

// the states a pursuer is driven in (crossing out of the alley, in the chase, limping on a rear tyre)
export const DRIVEN = new Set(['cross', 'chase', 'limp']);

// the line across the road a car steers for, a step later: eased toward the one it wants at C.ease px/s (no jump
// from one line to another: the wheel follows a point that slides)
export function easeLine(y, want, dt, C = CHASE.pursuit) {
  return y + clamp(want - y, -C.ease * dt, C.ease * dt);
}

// A car driven a step (its velocity and its turn set): thrown off what it was driving (a shove, a hit), the physics
// alone a moment; else its want (crossing out of the alley, or the chase's: want) turned into a speed and a heading
export function driveCar(P, car, dt, tg) {
  if (car.v.body.frozen || car.v.body.isSleeping) P.loose(car);
  const C = P.C, W = CHASE.wheels, w = P.world, v = car.v, b = v.body, vel = Body.getVelocity(b);
  // thrown off what it was driving (a shove, a hit): the physics alone a moment
  if (car.set && Math.hypot(vel.x - car.set.x, vel.y - car.set.y) > C.knock.dv) car.stun = C.knock.stun;
  if (car.stun > 0) {
    car.stun -= dt;
    car.set = null;
    // (thrown by his shove: it scrubs its sideways speed off on its tyres)
    if (car.thrown) Body.setVelocity(b, { x: vel.x, y: vel.y * Math.max(0, 1 - C.shoved.drag * dt) });
    if (car.stun <= 0) car.thrown = false;
    car.h = b.angle;
    car.s = Math.max(0, vel.x * Math.cos(b.angle) + vel.y * Math.sin(b.angle));
    return;
  }
  // what it wants: a heading and a speed
  let wantH = 0, wantS = 0;
  // (limping, no more than `limp` over his speed: it only just keeps up; but at full speed while it is still in his
  // lane ahead of him, out of it first)
  const inWay = tg?.car && v.x > tg.x && Math.abs(v.y - tg.y) < (v.h + tg.car.h) / 2 + C.margin;
  const top = P.top(), max = car.state === 'limp' && tg && !inWay ? Math.min(top, Math.max(0, tg.vel.x) + C.limp) : top;
  if (car.state === 'cross') {
    wantH = -Math.PI / 2;
    wantS = C.spawn.cross;
    const band = P.roadAt(v.x).band;
    if (band && v.y <= band[0] + C.spawn.radius) { car.state = 'chase'; car.t = 0; }
  } else if (tg) {
    const wish = want(P, car, tg, dt, max);
    wantH = wish.h; wantS = wish.s;
  }
  // what it does: the speed toward what it wants (no more than it really did last step, and a bit), the heading
  // turned toward its want as fast as the speed lets it
  const along = vel.x * Math.cos(car.h) + vel.y * Math.sin(car.h);
  car.s = Math.min(car.s, Math.max(0, along) + CHASE.give);
  car.s = wantS > car.s ? Math.min(wantS, car.s + C.accel * dt) : Math.max(wantS, car.s - C.brake * dt);
  car.h = approachAngle(car.h, wantH, C.turn * dt * clamp(car.s / C.turnAt[0], C.turnAt[1], 1));
  const set = { x: Math.cos(car.h) * car.s, y: Math.sin(car.h) * car.s };
  Body.setVelocity(b, set);
  // its rear steps out and comes back as his does (drive/rules.js slideStep: the wheel thrown over, a blow), nobody
  // countersteering better than a spring
  const turn = angDiff(car.h, wantH), wheel = Math.abs(turn) > C.wheel ? Math.sign(turn) : 0;
  car.lockT = wheel && wheel === car.lockS ? (car.lockT || 0) + dt : 0;
  car.lockS = wheel;
  [car.slip, car.slipV] = slideStep(car.slip, car.slipV, car.s > CHASE.fx.from ? wheel : 0, set.y, car.lockT, dt, CHASE);
  Body.setAngularVelocity(b, angDiff(b.angle, car.h + car.slip) * C.nose);
  b.flyUntil = w.time + CHASE.fly;
  car.set = set;
  v.steer = clamp(angDiff(b.angle, car.h) * W.pursuer, -W.most, W.most);
  slideSmoke(w, v, car.slip, car.s, dt);
  v.bob = bob(w, car, car.s);
}

// its body bobbing on its wheels (Vehicle `bob`) at `s` px/step: CHASE.pursuit.bob [rad/s, px at the cruise speed]
export const bob = (w, car, s, B = CHASE.pursuit.bob) => Math.sin(w.time * B[0] + car.n) * B[1] * Math.min(1, s / CHASE.cruise);

// in the chase: its slot's point, kept up with; what stands in its lane ahead swerved round (or braked for); a
// swipe into his side once in a while. { h, s }
function want(P, car, tg, dt, max) {
  const C = P.C, v = car.v, R = P.roadAt(v.x), band = R.band || [tg.y, tg.y];
  const pv = tg.vel.x, sl = slot(P, car, tg);
  // how long it has held its slot (what an attack is made from: stepAttack)
  const dx = sl.x - v.x, dy = sl.y - v.y;
  car.settled = Math.abs(dx) < C.settle * 2 && Math.abs(dy) < C.settle ? car.settled + dt : 0;
  const A = P.attack?.car === car ? P.attack : null, phase = A && attackPhase(A.kind, A.t, C);
  // His car between it and its slot (he has just changed lanes past it, or thrown it across): never through him.
  // It keeps to its side of him and pulls ahead until it is clear of his nose, then crosses ahead of him, and only
  // drops back to its slot once it is out of his line
  let tx = sl.x, ty = sl.y, hold = false;
  const hc = tg.car;
  if (hc && sl.x < tg.x + (v.w + hc.w) / 2) {
    const long = (v.w + hc.w) / 2 + C.gap, wide = (v.h + hc.h) / 2 + C.margin, off = v.y - tg.y;
    const beyond = Math.abs(off) >= wide && off * (sl.y - tg.y) < 0;                      // the other side of him than its slot
    const across = Math.abs(off) < wide && v.x > tg.x && Math.abs(sl.y - tg.y) >= wide;  // crossing his nose
    if (beyond || across) tx = tg.x + long + C.gap;
    hold = beyond && v.x < tg.x + long;
    if (hold) ty = v.y;
  }
  // a toll's plaza ahead (systems/Toll.js): its gate's lane, chosen and kept (no other line tried); the one sent
  // the wrong way, and one following him down his lane, held behind him
  const gate = P.world.toll?.steer(car, v.x, ty, tg) ?? null;
  if (gate !== null) {
    ty = gate;
    hold = true;
    tx = P.world.toll.holdX(car, tg) ?? tx;
  }
  let vx = clamp(pv + (tx - v.x) * C.close, 0, max);
  // what stands ahead in its lane: the nearest free line to its slot's, or brake for it
  const LN = C.lines, ahead = v.w / 2 + Math.max(car.s, LN.least) * 60 * C.look + C.pad;
  const lines = hold ? [ty] : [ty, ...(R.rows || band), (band[0] + band[1]) / 2, ty - LN.off, ty + LN.off].map((y) => clamp(y, band[0] - LN.out, band[1] + LN.out));
  lines.sort((a, b) => Math.abs(a - ty) - Math.abs(b - ty));
  // (the line it went round something by is tried first while its own is still shut: no weaving between two)
  if (!hold && car.line !== null && car.line !== ty && lines.includes(car.line)) { lines.splice(lines.indexOf(car.line), 1); lines.splice(1, 0, car.line); }
  const slotY = ty;
  let block = null;
  // (his car is in the way too, but on the line of a slot in the lane he is not in: it holds that line whatever
  // he does, he may come at it)
  const own = hold || C.slots[car.slot][1] === 'other';
  for (const y of lines) {
    const hit = P.blockedAt(car, v.x, y, ahead, !own || y !== ty);
    if (!hit) { ty = y; block = null; break; }
    block ??= hit;
  }
  car.line = ty === slotY ? null : ty;
  // all of them blocked: brake for the nearest; going across to a free one past something in its own way: slow
  // enough to be across before it is there. What is in the way may be going too (one of theirs ahead in its lane,
  // his car): its own speed is kept, C.gap px off it
  const going = (hit) => (hit.p.isVehicle && !hit.p.body.isStatic && !hit.p.body.frozen ? Math.max(0, Body.getVelocity(hit.p.body).x) : 0);
  const nose = v.x + v.w / 2, here = !block && Math.abs(ty - v.y) > LN.near && P.blockedAt(car, v.x, v.y, ahead, true);
  const H = C.held;
  if (block) { const bv = going(block); vx = Math.min(vx, Math.max(0, bv + (block.x - nose - (bv > H.going ? C.gap : H.stand)) * H.gain)); }
  else if (here) vx = Math.min(vx, Math.max(H.crawl, going(here) + (here.x - nose - H.cross) * H.crossGain));
  // the wheel follows a point that slides to the line it wants (easeLine): no jump from one line to the next
  car.lineY = easeLine(car.lineY ?? v.y, ty, dt, C);
  if (Math.abs(car.lineY - v.y) > C.astray) car.lineY = v.y + Math.sign(car.lineY - v.y) * C.astray; // (thrown far off it)
  // (through a toll's plaza it holds its lane's line tighter: the islands leave it 60 cm a side)
  const T = car.toll ? CHASE.toll : null, lat = T ? T.steer : C.steer;
  let vy = clamp((car.lineY - v.y) * (T ? T.lateral : C.lateral), -lat, lat);
  // ITS ATTACK. A ram: wound up first, drawn AWAY from him (told: its lamps flash, its body leans out), then the
  // swipe across at him. A brake: its brake lights first, then it drops back onto his nose in his lane, held there
  car.ram = 0;
  v.brake = 0;
  if (A?.kind === 'ram') {
    vy = phase === 'wind' ? -A.side * C.ram.back : A.side * C.ram.v;
    if (phase === 'go') car.ram = C.ram.dur;
    vx = clamp(pv + (tg.x + C.ram.lead - v.x) * C.close, 0, max); // (level with his doors for it)
  } else if (A?.kind === 'brake') {
    v.brake = 1;
    vy = clamp((sl.y - v.y) * C.lateral, -C.steer, C.steer);
    // (from the speed he had as it was told: following his down as each knock took it, it brought him to a crawl)
    if (phase === 'go') vx = Math.max(0, (A.from ?? pv) - C.block.drop);
  }
  // slow, the wheel turns further (pulling out from behind something)
  const most = C.heading + clamp(1 - car.s / CHASE.cruise, 0, 1) * C.pullOut;
  const h = clamp(Math.atan2(vy, Math.max(vx, 1)), -most, most);
  return { h, s: Math.min(max, Math.hypot(vx, vy)) };
}

// What stands in the way of a car's width along y from its tail (x: its middle) to `ahead` px on (world px; from the
// tail, so that it cuts back in only once past what it went round): the nearest of the cars and solid props whose
// box crosses that strip (his car only with `his`), or null. No car: a strip `ahead` px either side of x (a place to spawn one).
export function blockedAt(P, car, x, y, ahead, his = false) {
  const C = P.C, w = P.world, half = (car?.v.h ?? C.size[1]) / 2 + C.margin, x0 = x - (car ? car.v.w / 2 - C.tail : ahead), x1 = x + ahead;
  const y0 = y - half, y1 = y + half;
  const mine = his ? null : w.drive?.car;
  // (the cars and what blocks a path; never the lorry, `blind`: never seen coming; nor what hangs)
  if (P.propsN !== w.props.length) {
    P.propsN = w.props.length;
    P.blockers = w.props.filter((p) => (p.isVehicle || p.def?.blocksPath) && !p.def?.hung && !p.def?.blind);
  }
  let best = null;
  for (const p of P.blockers) {
    if (p === car?.v || p === mine || !p.body || p.dead) continue;
    const bb = p.body.bounds;
    if (bb.max.x < x0 || bb.min.x > x1 || bb.max.y < y0 || bb.min.y > y1) continue;
    if (!p.isVehicle && bb.max.x - bb.min.x < C.over) continue; // a bin, a box: it goes over
    if (!best || bb.min.x < best.x) best = { x: bb.min.x, p };
  }
  return best;
}

// A car left far behind (held up by a wreck across the street, by what he threw in its way), or hanging off the
// picture a long while without reaching its slot (boxed in behind him by parked cars knocked into its lane), is
// brought back up behind the picture on clear road, in the lane he is not in (the slots dealt again: the rearmost
// one is its): the chase does not let go of him. (tg: him as it sees him; real: him: it is brought up on his leg,
// never while he is in a bend, never off the end of his leg)
export function catchUp(P, car, tg, dt, real = tg) {
  const R = P.C.rubber, v = car.v, sl = slot(P, car, tg), d = P.world.drive;
  car.farT = v.x < tg.x - R.far ? (car.farT || 0) + dt : 0;
  car.heldT = Math.hypot(sl.x - v.x, sl.y - v.y) > R.close ? (car.heldT || 0) + dt : 0;
  if ((car.farT < R.t && car.heldT < R.held) || P.onScreen(v) || P.tell?.car === car || d?.bend) return;
  // (nor while a toll's plaza is told: brought up in the lane beside his there, it was put across an island's nose
  // from its gate's lane, too late to get round it; it comes back past the gates)
  if (P.world.toll?.busy(real.x, Math.max(1, real.vel.x))) return;
  const x = real.x - P.C.spawn.near - v.w / 2, y = sides(P, real).other, L = P.route.legs[P.hisLeg];
  if (x - v.w < L.from * TILE || x + v.w > L.to * TILE) return;
  if (P.blockedAt(car, x + R.room[0], y, R.room[1])) return;
  P.crew = '';
  car.farT = car.heldT = 0;
  car.h = 0;
  car.s = Math.hypot(tg.vel.x, tg.vel.y) + P.C.spawn.over;
  car.stun = 0;
  car.set = null;
  car.lineY = car.line = null;
  car.slip = car.slipV = 0;
  car.bendI = P.route.bends.findIndex((q) => q.x > x);
  Body.setPosition(v.body, { x, y });
  Body.setAngle(v.body, 0);
  Body.setAngularVelocity(v.body, 0);
  Body.setVelocity(v.body, { x: car.s, y: 0 });
}

// the alley car pulls out (its event's launch): across the street toward his lane
export function go(P, car) {
  car.state = 'cross';
  car.s = P.C.spawn.cross;
  car.t = 0;
  P.loose(car);
}
