// The getaway in THE BOSS's convertible: the model's data (entities/Vehicle.js), a man sat at its wheel
// (CharacterAnim.seatPose), the outro's beats (systems/Outro.js) and how the world plays them (World.stepOutro).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { load } from './setup.mjs';
import { ctx, noop } from './helpers.mjs';

// no DOM under Node: what a car paints on itself goes nowhere
globalThis.document ??= { createElement: () => ({ width: 0, height: 0, getContext: () => ctx }) };

const { default: Vehicle, VEHICLES } = await load('game/entities/Vehicle.js');
const { default: PhysicsWorld } = await load('engine/physics/PhysicsWorld.js');
const { setMaterial, scaleInertia } = await load('engine/physics/Body.js');
const { default: Ambient } = await load('game/systems/Ambient.js');
const { Lane } = await load('game/systems/Traffic.js');
const { default: World } = await load('game/world/World.js');
const { default: Player } = await load('game/entities/Player.js');
const { newPose, seatPose, grabPhases } = await load('game/entities/CharacterAnim.js');
const { WEAPONS } = await load('game/data/weapons.js');
const { newSkirt, stepSkirt } = await load('game/entities/Skirt.js');
const { OUTRO, outroBeat, spinK, wagAt, keyK, squatAt, routeSpeed, getawayPath, driveStep, outroOver } = await load('game/systems/Outro.js');
const { TILE, PLAYER, BODY_SCALE, CAT, MASK } = await load('game/Config.js');
const { SEAT } = await load('game/data/feel.js');
const { CHASE } = await load('game/data/chase.js');
const { seatOf, doorOf } = await load('game/systems/Drive.js');
const { default: level1 } = await load('game/data/levels/level1.js');
const { default: lab } = await load('game/data/levels/lab.js');

const { Bodies } = Matter;
const STEP = 1 / 60;
const M = VEHICLES.convertible;

// size in world px of a sprite painted at twice the world's density (IHDR)
function pngSize(sprite) {
  const b = readFileSync(new URL(`../assets/sprites/${sprite}.png`, import.meta.url));
  return { w: b.readUInt32BE(16) / 2, h: b.readUInt32BE(20) / 2 };
}

test('convertible: 5.4 x 2.0 m, its open cabin behind the windscreen, the seat, the wheel and the hat inside it', () => {
  const { w, h } = pngSize(M.sprite);
  assert.deepEqual([w, h], [172, 64]);
  assert.ok(M.kg > VEHICLES.van.kg && M.rear === null, 'heavier than the van, no rear window');
  const [x0, x1, y0, y1] = M.cabin, inside = ([x, y]) => x > x0 && x < x1 && y > y0 && y < y1;
  assert.ok(x0 > M.tank[1] && x1 <= M.wind[0] && y0 >= 0 && y1 <= h, 'between the deck and the windscreen');
  assert.ok(inside(M.seat) && inside(M.wheel) && inside(M.hat) && inside(M.key));
  assert.ok(M.seat[1] < h / 2, 'the driver sits on the -y side');
  assert.ok(M.wheel[0] > M.seat[0] && Math.abs(M.wheel[1] - M.seat[1]) < 1, 'the wheel before him');
  assert.ok(M.wheel[0] - M.wheel[2] - M.seat[0] < 8 * BODY_SCALE, 'within reach of his hands');
  assert.ok(M.hat[0] < M.seat[0] - 10 && M.hat[1] > h / 2, 'the hat on the rear seat, on the other side');
  assert.ok(M.door[1] < 0 && Math.abs(M.door[0] - M.seat[0]) < 12, 'the door: the ground outside, by the seat');
  for (const [x, y] of M.pipes) assert.ok(x < 6 && y > 0 && y < h, 'the pipes at the tail');
  for (const n of ['props/convertible_glow', 'props/convertible_hood', 'props/convertible_door', M.hat[2]]) assert.ok(pngSize(n).w > 0, n);
  // the chase's drive reads the same seat and door (systems/Drive.js), and drives this car
  const v = { m: M, w, h };
  assert.deepEqual(seatOf(v), M.seat);
  assert.deepEqual(doorOf(v), M.door);
  assert.equal(CHASE.vehicle, 'convertible');
});

// a vehicle as Vehicle makes it, without its canvas
function car(world, x, y, a = 0, model = 'convertible') {
  const v = Object.create(Vehicle.prototype), m = VEHICLES[model], size = pngSize(m.sprite);
  const body = Bodies.rectangle(x, y, size.w - 4, size.h - 4, { angle: a, collisionFilter: { category: CAT.PROP, mask: 0 } });
  Object.assign(v, { world, type: model, m, isVehicle: true, w: size.w, h: size.h, k: 0.5, body, def: {}, hat: !!m.hat, gun: !!m.gun, rider: null, lit: false,
    lamps: [true, true, true, true], moving: false, steer: 0, bob: 0, squat: 0, exploded: false, tires: [true, true, true, true] });
  body.entity = v;
  return v;
}

function man(world, x, y) {
  const ch = Object.create(Player.prototype);
  const body = Bodies.circle(x, y, PLAYER.radius, { collisionFilter: { category: CAT.CHAR, mask: 0xffff } });
  Object.assign(ch, { world, body, isPlayer: true, alive: true, knocked: 0, angle: 0, radius: PLAYER.radius, vaulting: null, riding: null,
    vel: { x: 0, y: 0 }, gait: 0, runK: 0, walk: 0, strideV: 0, swing: 0, tell: 0, recoil: 0, lower: 0, breath: 0, weapon: null, hidden: false });
  return ch;
}

// a man standing square, facing a (the pose seatPose starts from)
const base = (a) => { const P = newPose(); P.ta = P.ha = a; return P; };
const finite = (P) => [P.tx, P.ty, P.ta, P.s, P.ha, P.hl.x, P.hl.y, P.hr.x, P.hr.y, P.wpn.x, P.wpn.y, P.wpn.a,
  ...P.feet.flatMap((f) => [f.x, f.y, f.a]), ...P.elb].every(Number.isFinite);
// a pose point (pose px about his feet) in the car's sprite px
const inCar = (v, ch, p) => v.toSprite(ch.x + p.x * BODY_SCALE, ch.y + p.y * BODY_SCALE);

// on the wheel's rim seen from above (a thin ring: Vehicle `wheel` [x, y, half width, half depth])
const onRim = (q) => Math.abs(Math.hypot((q.sx - M.wheel[0]) / M.wheel[3], (q.sy - M.wheel[1]) / M.wheel[2]) - 1) < 0.01;

test('seat: anyone sat at the wheel is carried by the car, one hand on the top of its rim, the other over the door, and steers', () => {
  for (const a of [0, Math.PI, 2.1]) {
    const w = { time: 0 }, v = car(w, 500, 300, a), ch = man(w, 100, 100);
    assert.ok(v.seatIn(ch));
    assert.equal(v.rider, ch);
    const seat = v.seatSpot();
    assert.ok(Math.hypot(ch.x - seat.x, ch.y - seat.y) < 1e-6 && ch.angle === a, 'at the seat, facing the way it points');
    for (let i = 0; i < 30; i++) v.carry(STEP);
    assert.equal(ch.riding.k, 1, 'settled');
    const P = seatPose(ch, base(a), newPose());
    assert.ok(finite(P), 'a pose of finite numbers');
    assert.ok(Math.abs(P.ta - a - SEAT.lean) < 1e-9 && P.ha === a && P.s === SEAT.s && P.legs === 1 && !P.wpnOn);
    const r = inCar(v, ch, P.hr), l = inCar(v, ch, P.hl);
    assert.ok(onRim(r) && Math.abs(r.sx - M.wheel[0] - M.wheel[3]) < 0.01, 'his right hand on the top of the rim');
    assert.ok(l.sy < M.cabin[2] && l.sx > M.seat[0], 'his left hand over the door, ahead of him');
    for (const f of P.feet) assert.ok(inCar(v, ch, f).sx < M.cabin[1] + 2, 'his feet under the dash, not on the hood');
    v.steer = 0.4;
    const Q = seatPose(ch, base(a), newPose()), q = inCar(v, ch, Q.hr);
    assert.ok(onRim(q) && q.sy - r.sy > 1, 'the hand slides round the rim with the steering');
    v.steer = 0;
    // moved, the car takes him along and tells him how fast (the wind in his coat)
    Matter.Body.setPosition(v.body, { x: 506, y: 300 });
    v.carry(STEP);
    assert.ok(Math.abs(ch.vel.x - 6) < 1e-6 && Math.hypot(ch.x - v.seatSpot().x, ch.y - v.seatSpot().y) < 1e-6);
    assert.equal(v.unseat(), ch);
    assert.ok(ch.riding === null && v.rider === null);
  }
  assert.equal(car({}, 0, 0, 0, 'car').seatIn(man({}, 0, 0)), false, 'a model without a seat takes nobody');
});

test('seat: aiming, the arm on that side comes out with the gun and the other hand takes the wheel; the key takes the right one', () => {
  const w = { time: 0 }, v = car(w, 500, 300, 0), ch = man(w, 0, 0);
  ch.weapon = { type: 'pistol', mag: 7 };
  v.seatIn(ch);
  ch.riding.k = 1;
  const rest = seatPose(ch, base(0), newPose());
  assert.ok(!rest.wpnOn, 'a hand on the wheel, the other on the door: the gun put away');
  for (const [aim, gun, other] of [[-Math.PI / 2, 'hl', 'hr'], [Math.PI / 2, 'hr', 'hl']]) {
    ch.riding.aim = aim;
    const P = seatPose(ch, base(0), newPose());
    assert.ok(finite(P) && P.wpnOn && P.wpn.a === aim);
    const q = inCar(v, ch, P[gun]), o = inCar(v, ch, P[other]);
    assert.ok(aim < 0 ? q.sy < M.cabin[2] : q.sy > M.seat[1] + 10, `the gun hand out on the aim's side (${q.sy.toFixed(1)})`);
    assert.ok(onRim(o), 'the other on the wheel');
    assert.ok(Math.sign(P.ha) === Math.sign(aim) && Math.abs(P.ha) <= SEAT.aim.head + 1e-9, 'the head turned after it');
  }
  ch.riding.aim = null;
  ch.riding.key = 1;
  const K = seatPose(ch, base(0), newPose()), k = inCar(v, ch, K.hr);
  assert.ok(Math.hypot(k.sx - M.key[0], k.sy - M.key[1]) < 0.01, 'the right hand on the ignition');
});

test('the uzi: on the passenger cushion inside the cabin, a weapon that exists; level 1 has it drawn on the seat and no pickup of it', () => {
  const [x, y, a, type] = M.gun, [x0, x1, y0, y1] = M.cabin;
  assert.ok(x > x0 && x < x1 && y > y0 && y < y1 && y > 32 && x > 90 && x < 101, 'its grip on the front bench\'s passenger cushion');
  assert.ok(Number.isFinite(a) && WEAPONS[type]?.hold === 'side' && WEAPONS[type].auto, 'a one-handed automatic');
  assert.equal(type, 'uzi');
  // level 1's getaway: the same car, the gun drawn by it (Vehicle.gun), never a weapon on the floor to pick up
  const c = level1.props.find((p) => p[0] === 'convertible');
  assert.ok(c && car({}, 0, 0, 0).gun, 'the getaway car carries it');
  assert.ok(!(level1.drops || []).some((d) => d[0] === 'uzi') && !level1.actors.some((r) => r.includes('2')), 'no Uzi to pick up in level 1');
  assert.ok(!c[4]?.drive, 'nor can he drive it off before the outro');
});

// the uzi, sat at the wheel: a man settled in, the uzi in his hand (or not yet), the beat at t s (null: none)
function seated(t, weapon = 'uzi') {
  const w = { time: 0 }, v = car(w, 500, 300, 0.3), ch = man(w, 0, 0);
  ch.weapon = weapon ? { type: weapon, mag: 30 } : null;
  v.seatIn(ch);
  ch.riding.k = 1;
  ch.riding.grab = t;
  return { v, ch, P: seatPose(ch, base(0.3), newPose()) };
}

test('grab: the beat\'s phases come in order and every pose through it is finite', () => {
  const G = SEAT.grab;
  assert.ok(G.look[0] < G.reach[1] && G.reach[1] <= G.take && G.take < G.lift[1] && G.lift[1] <= G.rack[0], 'reach, take, lift, then rack');
  assert.ok(G.rack[0] < G.pull && G.pull < G.rack[1] && G.rack[1] <= G.hand[0] && G.hand[1] < G.dur, 'the rack heard in it, then the hand-off');
  assert.ok(G.dur >= 1.4 && G.dur <= 1.9, `a short beat (${G.dur} s)`);
  let last = grabPhases(0);
  for (let t = 0; t <= G.dur + 0.05; t += 0.01) {
    const ph = grabPhases(t);
    for (const k of ['reach', 'lift', 'rack', 'give', 'hand']) assert.ok(ph[k] >= last[k] - 1e-9 && ph[k] >= 0 && ph[k] <= 1, `${k} at ${t.toFixed(2)}`);
    last = ph;
    const { P } = seated(t, t >= G.take ? 'uzi' : null);
    assert.ok(finite(P), `a finite pose at ${t.toFixed(2)}`);
    assert.equal(P.wpnOn, t >= G.take, 'the gun in his hand once taken, the car\'s before');
  }
  assert.ok(grabPhases(G.dur).done && !grabPhases(G.dur - 0.01).done);
});

test('grab: the right hand on the uzi\'s grip as it is taken, the left on its cocking knob at the rack, then the wheel and the door', () => {
  const G = SEAT.grab;
  // the take: the hand on the gun's grip where it lies on the seat
  const take = seated(G.take, null), r = inCar(take.v, take.ch, take.P.hr);
  assert.ok(Math.hypot(r.sx - M.gun[0], r.sy - M.gun[1]) < 0.01, `the right hand on the grip (${r.sx.toFixed(1)}, ${r.sy.toFixed(1)})`);
  assert.ok(take.P.ha - 0.3 > 0.8, 'his head turned to the seat');
  // the rack: the left hand on the knob of the gun held across his chest (weapons.js rack[0])
  const t = G.rack[0] + G.knob * (G.rack[1] - G.rack[0]), { P } = seated(t), d = WEAPONS.uzi;
  const [kx, ky] = d.rack[0], c = Math.cos(P.wpn.a), s = Math.sin(P.wpn.a), u = (kx - d.grip) * P.s, q = (ky - d.palm) * P.s;
  const knob = { x: P.wpn.x + u * c - q * s, y: P.wpn.y + u * s + q * c };
  assert.ok(Math.hypot(P.hl.x - knob.x, P.hl.y - knob.y) < 0.01, 'the left hand on the cocking knob');
  assert.ok(Math.hypot(P.wpn.x - P.hr.x, P.wpn.y - P.hr.y) < 1e-9 && P.top === 2, 'the gun in the right hand, up before his chest, both hands on it');
  // the end of the beat: the right hand back on the top of the rim, the gun in the left hand over the door
  const end = seated(G.dur - 0.01), e = inCar(end.v, end.ch, end.P.hr), g = inCar(end.v, end.ch, end.P.wpn);
  assert.ok(onRim(e) && Math.abs(e.sx - M.wheel[0] - M.wheel[3]) < 0.01, 'the right hand on the top of the rim');
  assert.ok(end.P.wpnOn && g.sy < M.cabin[2] && Math.hypot(end.P.wpn.x - end.P.hl.x, end.P.wpn.y - end.P.hl.y) < 1e-9, 'the gun in the left hand, out over the door');
});

test('seat: the uzi at rest hangs from the door\'s hand out over the door; aimed out of his side that arm lifts it, eased', () => {
  const rest = seated(null), S = SEAT;
  const g = inCar(rest.v, rest.ch, rest.P.wpn), l = inCar(rest.v, rest.ch, rest.P.hl);
  assert.ok(rest.P.wpnOn && g.sy < M.cabin[2] && l.sy < M.cabin[2], 'the gun in the left hand, outside the cabin\'s -y edge');
  assert.ok(Math.abs(rest.P.wpn.a - 0.3 - S.hang[0]) < 1e-6 && rest.P.wpnLen === S.hang[1] && !rest.P.fist, 'muzzle back and down, past the door');
  assert.ok(onRim(inCar(rest.v, rest.ch, rest.P.hr)), 'the right hand on the wheel');
  // the arm comes out over SEAT.raise s (Vehicle.carry eases riding.up), the gun staying in the same hand
  const { v, ch } = rest, aim = 0.3 - Math.PI / 2;
  ch.riding.aim = aim;
  const at = [];
  for (let i = 0; i < 12; i++) {
    v.carry(STEP);
    const P = seatPose(ch, base(0.3), newPose());
    assert.ok(finite(P) && P.wpnOn && Math.hypot(P.wpn.x - P.hl.x, P.wpn.y - P.hl.y) < 1e-9, 'in the left hand all the way');
    at.push(Math.hypot(P.hl.x - rest.P.hl.x, P.hl.y - rest.P.hl.y));
  }
  assert.ok(at[0] > 0 && at[0] < at[2] && Math.abs(ch.riding.up - 1) < 1e-9, 'out in steps, not at once');
  assert.ok(Math.abs(seatPose(ch, base(0.3), newPose()).wpn.a - aim) < 1e-9, 'on the aim');
  ch.riding.aim = null;
  for (let i = 0; i < 12; i++) v.carry(STEP);
  const back = seatPose(ch, base(0.3), newPose());
  assert.ok(Math.hypot(back.hl.x - rest.P.hl.x, back.hl.y - rest.P.hl.y) < 1e-9, 'and back over the door');
});

test('seat: the gun goes from the door\'s hand to the right one only well past the nose, eased, and back; ahead it is held out further', () => {
  const { v, ch } = seated(null), a0 = 0.3, A = SEAT.aim;
  const settle = (aim, n = 20) => { ch.riding.aim = aim; for (let i = 0; i < n; i++) v.carry(STEP); return seatPose(ch, base(a0), newPose()); };
  const side = (P) => inCar(v, ch, P.wpn).sy - M.seat[1];
  let P = settle(a0 - 1.2);
  assert.ok(ch.riding.side === -1 && ch.riding.hand === 0 && side(P) < -8, 'to his left: the door\'s hand');
  P = settle(a0);
  const ahead = inCar(v, ch, P.wpn);
  assert.ok(ch.riding.side === -1 && ahead.sx > M.seat[0] + 12, `dead ahead: the same hand, out toward the screen (${ahead.sx})`);
  P = settle(a0 + A.swap - 0.05);
  assert.equal(ch.riding.side, -1, 'a little right of the nose: no swap yet');
  ch.riding.aim = a0 + 1.4;
  const way = [];
  for (let i = 0; i < 12; i++) { v.carry(STEP); const Q = seatPose(ch, base(a0), newPose()); assert.ok(finite(Q) && Q.wpnOn); way.push(side(Q)); }
  assert.ok(way[0] < way[3] && way[3] < way[11] && way[1] < way[11] - 4, 'across in front of him, in steps');
  P = seatPose(ch, base(a0), newPose());
  assert.ok(ch.riding.side === 1 && ch.riding.hand === 1 && side(P) > 8 && P.fist, 'in the right hand, over the passenger seat');
  assert.ok(onRim(inCar(v, ch, P.hl)), 'the door\'s hand on the wheel');
  assert.ok(P.ha - a0 > 1 && P.ha - a0 <= A.head + 1e-9 && P.ta - a0 > 0.3, 'head and shoulders turned after it');
  P = settle(a0 - A.swap + 0.05);
  assert.equal(ch.riding.side, 1, 'a little left of the nose: it stays in the right hand');
  P = settle(a0 - 1.2);
  assert.ok(ch.riding.side === -1 && ch.riding.hand === 0 && side(P) < -8, 'well to his left: back to the door\'s hand');
  P = settle(null);
  assert.ok(ch.riding.side === 0 && inCar(v, ch, P.wpn).sy < M.cabin[2], 'the arm down: hanging over the door again');
});

test('seat: a round crossing the open cabin by the seat is the driver\'s, one that crosses the rear bench is not', () => {
  const kills = [], w = { time: 0 }, v = car(w, 500, 300, 0), ch = man(w, 0, 0);
  ch.kill = (a, cause) => { kills.push(cause); ch.alive = false; };
  assert.equal(v.crossesSeat(M.seat[0], 0, 0, 1), false, 'nobody in it');
  v.seatIn(ch);
  assert.equal(v.crossesSeat(M.seat[0], 0, 0, 1), true, 'in by his door');
  assert.equal(v.crossesSeat(M.seat[0] + 2, 64, 0, -1), true, 'from the other side, across the bench');
  assert.equal(v.crossesSeat(M.hat[0], 0, 0, 1), false, 'across the rear seat');
  assert.equal(v.crossesSeat(M.seat[0], 0, 0, -1), false, 'going away from it');
  assert.equal(car(w, 0, 0, 0, 'van').crossesSeat(100, 0, 0, 1), false, 'a closed van hides its man');
});

test('seat: in the wind the coat streams back, the half on the door\'s side thrown out over the door', () => {
  const S = newSkirt();
  for (let i = 0; i < 90; i++) stepSkirt(S, Math.PI, 8, 0, 0, STEP);
  assert.ok(S.half[0].len > 0.9 && S.half[1].len > 0.9, 'drawn right out at speed');
  assert.ok(M.seat[1] < 32 && SEAT.wind[0] > 0.3, 'his left half goes over the door');
});

test('outro: the beats of the getaway come in order: walk, vault, seat, start, idle, wheelspin, bite', () => {
  const order = ['walk', 'vault', 'seat', 'start', 'idle', 'wheelspin', 'bite'], at = {};
  let last = 0;
  for (let t = 0; t <= OUTRO.go + OUTRO.spin + 0.5; t += 0.005) {
    const i = order.indexOf(outroBeat(t));
    assert.ok(i >= last, `beat went back at t=${t.toFixed(2)}`);
    at[order[i]] ??= t;
    last = i;
  }
  assert.equal(last, order.length - 1);
  const O = OUTRO;
  assert.ok(O.walk + O.vault < O.key[0] - O.key[1] + 0.2, 'sat before his hand goes to the key');
  assert.ok(Math.abs(O.key[0] + 0.08 - O.lights) < 0.15, 'the lights as the key turns');
  assert.ok(O.catch - O.lights >= 0.4 && O.go - O.catch >= 0.3, 'a starter that cranks, a moment at idle');
  assert.ok(O.spin >= 0.6 && O.spin <= 1.2, 'the wheels spin long enough to be seen, not to bore');
  assert.equal(keyK(O.key[0]), 1);
  assert.equal(keyK(O.key[0] - O.key[1]), 0);
  assert.equal(keyK(O.lights + O.key[1] + 0.1), 0, 'back on the wheel before it goes');
});

test('outro: the rear wheels spin where it stands, the tail sat down and wagging, then bite and it goes', () => {
  const O = OUTRO;
  assert.equal(spinK(O.go - 0.01), 0);
  assert.equal(spinK(O.go + O.spin / 2), 1);
  assert.ok(spinK(O.go + O.spin + O.grip / 2) > 0 && spinK(O.go + O.spin + O.grip / 2) < 1);
  assert.ok(spinK(O.go + O.spin + O.grip) < 1e-9);
  assert.ok(squatAt(O.go + 0.2) >= O.squat && squatAt(O.go - 0.05) < 0.2 && squatAt(O.go + O.spin + O.grip + 0.1) < 1e-9);
  assert.ok(squatAt(O.catch) >= O.jolt[0] - 1e-9 && squatAt(O.catch - 0.01) === 0, 'a jolt as the engine catches');
  let wag = 0;
  for (let t = O.go; t < O.go + O.spin; t += STEP) wag = Math.max(wag, Math.abs(wagAt(t)));
  assert.ok(wag > 0.04 && wag <= O.wag[0] + 1e-9);
  assert.equal(routeSpeed(0, false, 1, O, O.creep), O.creep, 'held to a crawl');
  // on a straight: a crawl through the spin, then the kick of the bite: the tail out one way, back past straight
  const path = getawayPath(0, 0, 0, {}), o = { s: 0, v: 0, slip: 0, slipV: 0, wag: 0 };
  let min = 0, max = 0;
  for (let t = O.go + STEP; t < O.go + O.spin + 2; t += STEP) {
    const at = driveStep(o, path, t, STEP);
    if (t < O.go + O.spin - STEP) assert.ok(o.v <= O.creep + 1e-9 && o.s <= O.creep * 60 * O.spin + 1, 'creeping');
    assert.ok(Math.abs(at.x + Math.cos(at.a) * O.pivot - at.q.x) < 1e-6 && Math.abs(at.y + Math.sin(at.a) * O.pivot - at.q.y) < 1e-6, 'its pivot keeps to the route');
    min = Math.min(min, o.slip); max = Math.max(max, o.slip);
  }
  const out = O.kick < 0 ? -min : max, back = O.kick < 0 ? max : -min;
  assert.ok(out > O.smoke && out < O.hat.slip, `the fishtail smokes (${out.toFixed(2)}) but keeps the hat for the bend`);
  assert.ok(back > 0.01, 'and swings back past straight');
  assert.ok(o.v === O.speed && Math.abs(o.slip) < 0.02, 'flat out and straight again');
});

// the car's whole body along a level's way out, as the world drives it: fn(at, o, t) each step
function drive(level, fn) {
  const c = level.props.find((p) => p[0] === 'convertible' && Math.hypot(p[1] - level.exit.x, p[2] - level.exit.y) < OUTRO.reach / TILE);
  assert.ok(c, 'a convertible by the exit');
  const path = getawayPath(c[1] * TILE, c[2] * TILE, (c[3] * Math.PI) / 180, level.exit);
  const o = { s: 0, v: 0, slip: 0, slipV: 0, wag: 0 };
  for (let t = OUTRO.go + STEP; t < OUTRO.timeout && o.s < path.length; t += STEP) fn(driveStep(o, path, t, STEP), o, t);
  return { path, o };
}

for (const [name, level] of [['level 1', level1], ['the lab', lab]]) {
  test(`outro: ${name}'s way out never puts a corner of the convertible in a wall, tail out or not`, () => {
    const wall = (x, y) => {
      const c = Math.floor(x / TILE), r = Math.floor(y / TILE);
      return c >= 0 && r >= 0 && r < level.tiles.length && 'X#'.includes(level.tiles[r][c] ?? '_'); // past the map's edge: gone
    };
    let slid = 0;
    const { path, o } = drive(level, (at, st, t) => {
      const c = Math.cos(at.a), s = Math.sin(at.a);
      slid = Math.max(slid, Math.abs(st.slip));
      for (let u = -86; u <= 86; u += 10.75) {
        for (const w of [-32, 32]) {
          const x = at.x + c * u - s * w, y = at.y + s * u + c * w;
          assert.ok(!wall(x, y), `in a wall at t=${t.toFixed(2)} (${(x / TILE).toFixed(2)}, ${(y / TILE).toFixed(2)}), slip ${st.slip.toFixed(2)}`);
        }
      }
    });
    assert.ok(o.s >= path.length - 1, 'it gets to the end before the timeout');
    assert.ok(slid > OUTRO.smoke, 'and slides on the way');
    assert.ok(level.exit.fade * TILE < path.length);
  });
}

test('outro: level 1: round into the alley without a slide, through its gate, tail out onto the road and off its west end', () => {
  const gate = level1.props.filter((p) => p[0] === 'chain_fence');
  let through = false, alley = 0, road = 0;
  const { path } = drive(level1, (at, o) => {
    if (gate.some((g) => Math.hypot(g[1] * TILE - at.x, g[2] * TILE - at.y) < 24)) through = true;
    if (at.y > 5 * TILE && at.y < 19 * TILE) alley = Math.max(alley, Math.abs(o.slip));
    if (at.y > 21 * TILE) road = Math.max(road, Math.abs(o.slip));
  });
  assert.ok(through, 'through the gate of the service alley');
  assert.ok(alley < 0.05, `straight down the alley (${alley.toFixed(2)})`);
  assert.ok(road >= OUTRO.hat.slip, 'the tail right out on the road: the hat goes there');
  const end = path.at(path.length);
  assert.ok(end.x < 0 && Math.abs(Math.cos(end.a) + 1) < 0.01, 'it leaves by the west end of the road');
});

// the world's own stepOutro on a stage: no walls, a recording floor
function stage(level = level1) {
  const c = level.props.find((p) => p[0] === 'convertible' && Math.hypot(p[1] - level.exit.x, p[2] - level.exit.y) < OUTRO.reach / TILE);
  const log = [], marks = [], sounds = [];
  const rec = (what) => new Proxy({}, { get: (_, k) => (...a) => { log.push(`${what}.${String(k)}`); } });
  const w = Object.create(World.prototype);
  const v = car(w, c[1] * TILE, c[2] * TILE, (c[3] * Math.PI) / 180), p = man(w, level.exit.x * TILE, level.exit.y * TILE);
  let hats = 0;
  v.throwHat = (...a) => { hats++; return Vehicle.prototype.throwHat.call(v, ...a); };
  p.baseUpdate = noop;
  p.updateSlideAnim = noop;
  p.steer = (dx, dy, sp) => { const d = Math.hypot(dx, dy) || 1; Matter.Body.setPosition(p.body, { x: p.x + (dx / d) * sp, y: p.y + (dy / d) * sp }); };
  Object.assign(w, {
    level, props: [v], chars: [p], player: p, time: 0, outro: null, papers: null, liquids: null,
    map: { solidAt: () => false }, particles: rec('particles'), camera: rec('camera'),
    decals: { paint: (fn, layer, x0, x1) => { assert.ok(layer === 'floor' && x1 > x0); marks.push(w.outro.t); } },
    sound: (name) => sounds.push([name, w.outro?.t ?? 0]), noise: noop, floorAt: () => 'concrete', removeBody: noop, addDebris: noop,
    characters: () => [],
  });
  const step = () => {
    w.time += STEP;
    w.stepOutro(STEP);
    if (v.rider) v.carry(STEP);
    w.ambient?.update(STEP);
    w.physics?.step(STEP, w.time);
  };
  return { w, v, p, log, marks, sounds, step, hats: () => hats };
}

test('outro: he walks to the door, vaults it into the seat, turns the key; it spins its wheels, lays rubber, bites and goes', () => {
  const { w, v, p, marks, sounds, step, hats } = stage(), O = OUTRO;
  assert.equal(w.getaway(), v);
  w.startOutro(v);
  const o = w.outro, seen = {};
  assert.ok(v.toSprite(o.door.x, o.door.y).sy < 0, 'by the driver\'s door (the lot\'s side)');
  let hatT = null, sat = null, lit = null, fast = null;
  while (!outroOver(o) && o.t < O.timeout) {
    step();
    const beat = outroBeat(o.t);
    seen[beat] ??= { vaulting: !!p.vaulting, rider: !!v.rider, s: o.s };
    if (beat === 'walk') assert.ok(!p.vaulting && !v.rider && !p.hidden);
    if (beat === 'vault' && o.t > O.walk + 2 * STEP && o.t < O.walk + O.vault - 2 * STEP) assert.ok(p.vaulting?.style === 'speed' && !v.rider, 'over the door');
    if (v.rider && sat === null) sat = o.t;
    if (v.lit && lit === null) lit = o.t;
    if (beat === 'wheelspin') assert.ok(o.s <= O.creep * 60 * O.spin + 1 && v.squat >= O.squat - 1e-9, 'spinning where it stands, sat down');
    if (!v.hat && hatT === null) hatT = o.t;
    if (o.v >= O.speed && fast === null) fast = o.t;
    if (v.rider) assert.ok(Math.hypot(p.x - v.seatSpot().x, p.y - v.seatSpot().y) < 1e-6, 'he rides at the wheel');
  }
  assert.ok(Math.abs(sat - (O.walk + O.vault)) < 0.06, `in the seat as the vault ends (${sat})`);
  assert.ok(p.hidden && p.riding.v === v && p.riding.k === 1 && !w.chars.includes(p), 'sat, settled, the car draws him');
  assert.ok(Math.abs(lit - O.lights) < 0.02, 'the lights with the key');
  assert.deepEqual(sounds.filter(([n]) => ['doorVault', 'seatDrop', 'crank', 'hatFly'].includes(n)).map(([n]) => n), ['doorVault', 'seatDrop', 'crank', 'hatFly']);
  // rubber: laid from the first steps of the wheelspin, all through it, and again in the slides
  const spun = marks.filter((t) => t >= O.go && t < O.go + O.spin);
  assert.ok(marks.length && marks[0] < O.go + 0.05, 'marks from the start of the spin');
  assert.ok(spun.length >= (O.spin / STEP) * 0.9, `a mark a step while they spin (${spun.length})`);
  assert.ok(marks.some((t) => t > O.go + O.spin + 1), 'and in the bends');
  assert.ok(fast > O.go + O.spin, 'flat out after the bite');
  // the hat: once, at the first hard swing, not at the bite
  assert.equal(hats(), 1);
  assert.ok(hatT > O.go + O.spin + 0.5, `the hat leaves in a bend (${hatT})`);
  assert.ok(o.fadeAt !== null && o.t < O.timeout, 'faded out on its way, before the timeout');
});

test('outro: a closed van still takes him in by its cab door, unseen', () => {
  const { w, v, p, sounds, step } = stage();
  const van = car(w, v.x, v.y, Math.PI, 'van');
  w.props = [van];
  w.startOutro(van);
  while (w.outro.t < OUTRO.lights) step();
  assert.ok(w.outro.inside && p.hidden && !p.riding && !van.rider && !p.vaulting);
  assert.ok(!sounds.some(([n]) => n === 'doorVault'));
});

// a parked car as Vehicle makes it (its real size, mass and body, frozen where it stands and asleep, as one is by the
// time the getaway comes), nothing drawn
function parked(w, model, x, y, deg = 0) {
  const v = Object.create(Vehicle.prototype), m = VEHICLES[model], { w: W, h: H } = pngSize(m.sprite);
  const body = Bodies.rectangle(x, y, W - 4, H - 4, {
    angle: (deg * Math.PI) / 180, frictionAir: 0.02, friction: 0.6, restitution: 0.05, label: 'vehicle',
    collisionFilter: { category: CAT.PROP, mask: MASK.PROP },
  });
  setMaterial(body, m.kg, 0.9);
  scaleInertia(body, 3);
  body.material = 'metal';
  body.entity = v;
  Object.assign(v, {
    world: w, type: model, m, k: 0.5, w: W, h: H, body, isVehicle: true, g: ctx, glassPx: { wind: [], rear: [] },
    windows: { wind: 0, rear: 0 }, tires: [true, true, true, true], lamps: [true, true, true, true], hp: m.hp, fuel: 0,
    puddle: 0, alarm: 0, lit: false, flash: 0, moving: false, dead: false, exploded: false, burning: false, rider: null,
    def: { static: true, hp: m.hp, vault: true },
  });
  w.physics.add(body);
  w.physics.freezeIfHeavy(body);
  Matter.Sleeping.set(body, true);
  return v;
}

// level 1's getaway with real physics and the coupe parked by the alley's mouth (level1.js)
function ramStage() {
  const S = stage(), { w } = S, c = level1.props.find((p) => p[0] === 'car2'), shakes = [];
  w.physics = new PhysicsWorld({ muAt: () => 1 });
  const coupe = parked(w, 'car2', c[1] * TILE, c[2] * TILE, c[3]);
  w.props.push(coupe);
  Object.assign(w, { shake: (a) => shakes.push(a), events: null, light: noop, after: noop });
  return { ...S, coupe, shakes };
}

test('outro: level 1: the getaway clips the coupe parked by the alley\'s mouth: shoved, spun, dented, a lamp out; it goes on', () => {
  const { w, v, step, sounds, shakes, coupe } = ramStage(), O = OUTRO;
  const x0 = coupe.x, y0 = coupe.y, a0 = coupe.body.angle;
  w.startOutro(v);
  const o = w.outro;
  let hitT = null, vHit = 0, deep = 0, after = Infinity;
  while (o.s < o.path.length && o.t < O.timeout) {
    const before = o.v;
    step();
    const col = Matter.Collision.collides(coupe.body, v.body);
    if (col) deep = Math.max(deep, col.depth);    if (hitT === null && o.hit.has(coupe)) { hitT = o.t; vHit = before; after = o.v; }
  }
  assert.ok(hitT !== null, 'it runs into it');
  assert.ok(hitT > O.go + O.spin, 'on its way down the alley');
  // a clip, never through it: the hull pushes it out of its way every step
  assert.ok(deep < 6, `never more than a bumper's depth into it (${deep.toFixed(1)} px)`);
  const moved = Math.hypot(coupe.x - x0, coupe.y - y0), turned = Math.abs(coupe.body.angle - a0);
  assert.ok(moved > 0.6 * TILE && moved < 4 * TILE, `shoved along, not thrown across the street (${(moved / TILE).toFixed(2)} tiles)`);
  assert.ok(coupe.y > y0, 'the way the convertible was going (south, toward the road)');
  assert.ok(turned > 0.08, `spun (${turned.toFixed(2)} rad)`);
  // damage where it was hit (its tail, on the alley's side); the convertible barely slowed
  assert.ok(coupe.hp < VEHICLES.car2.hp && !coupe.burning && !coupe.exploded, `dented (${coupe.hp} hp)`);
  assert.ok(!coupe.lamps[2] || !coupe.lamps[3], 'a tail lamp broken');
  assert.ok(coupe.alarm > 0, 'its alarm going');
  assert.ok(after >= vHit * O.ram.carKeep - 1e-6 && after < vHit, `barely slowed (${vHit.toFixed(2)} -> ${after.toFixed(2)})`);
  assert.ok(shakes.some((s) => s >= O.ram.carShake), 'the camera shaken');
  assert.ok(sounds.some(([n]) => n === 'carRam'), 'the crunch heard');
});

// the street's traffic, without its drivers' brains: cars at (x, lane) given, `view` the camera's rectangle
function street(w, view, cars) {
  const a = Object.create(Ambient.prototype), width = 42 * TILE;
  const lanes = level1.ambient.traffic.map((l) => new Lane(l, width));
  const spawned = [];
  Object.assign(a, {
    world: w, r: () => 0.5, lanes, rows: lanes.map((l) => l.y), paths: [], civilians: [], obstacles: [], barkT: 0,
    scaredUntil: -1, bandY0: 0, bandY1: 1e9,
    cars: cars.map(([x, i]) => ({ v: { x, y: lanes[i].y, w: 140, h: 58, body: {}, dead: false }, d: { speed: 280 }, lane: lanes[i] })),
  });
  a.drive = (c) => { c.v.x += (c.lane.dir * c.d.speed) / 60; };
  a.spawnCar = (lane) => { spawned.push(lane); };
  for (const l of lanes) l.timer = 0;
  Object.assign(w, { view: () => view, corpses: [] });
  return { a, spawned };
}

test('outro: no traffic on the road the getaway takes: no new car once it starts, those out of sight taken off, one in sight let out of it first', () => {
  const { w, v, step } = stage(), y = level1.ambient.traffic[0].row * TILE;
  const view = { x: 22 * TILE, y: 4 * TILE, hw: 260, hh: 145 };
  // before: the street lives (a car due spawns)
  const before = street({ ...w, props: [] }, view, []);
  before.a.updateTraffic(STEP);
  assert.ok(before.spawned.length > 0, 'cars come before the getaway');
  // the getaway starts: a car in plain view on the road (the camera there for the test), one out of sight
  const { a, spawned } = street(w, { ...view, y }, [[22 * TILE, 0], [5 * TILE, 1]]);
  w.ambient = a;
  const [seen, unseen] = a.cars;
  w.startOutro(v);
  assert.ok(!a.cars.includes(unseen) && unseen.v.dead, 'out of sight: taken off at once');
  assert.ok(a.cars.includes(seen) && !seen.v.dead, 'in sight: it does not vanish');
  for (let i = 0; i < 240; i++) step();
  assert.equal(spawned.length, 0, 'no new car');
  assert.ok(!a.cars.includes(seen) && seen.v.dead, 'taken off once it has driven out of sight');
});
