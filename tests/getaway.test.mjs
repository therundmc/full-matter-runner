// The getaway in THE BOSS's convertible: the model's data (entities/Vehicle.js), a man sat at its wheel
// (CharacterAnim.seatPose), the outro's beats (systems/Outro.js) and how the world plays them (World.stepOutro).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { load } from './setup.mjs';

const { default: Vehicle, VEHICLES } = await load('game/entities/Vehicle.js');
const { default: World } = await load('game/world/World.js');
const { default: Player } = await load('game/entities/Player.js');
const { newPose, seatPose } = await load('game/entities/CharacterAnim.js');
const { newSkirt, stepSkirt } = await load('game/entities/Skirt.js');
const { OUTRO, outroBeat, spinK, wagAt, keyK, squatAt, routeSpeed, getawayPath, driveStep, outroOver } = await load('game/systems/Outro.js');
const { TILE, PLAYER, BODY_SCALE, CAT } = await load('game/Config.js');
const { SEAT } = await load('game/data/feel.js');
const { CHASE } = await load('game/data/chase.js');
const { seatOf, doorOf } = await load('game/systems/Drive.js');
const { default: level1 } = await load('game/data/levels/level1.js');
const { default: lab } = await load('game/data/levels/lab.js');

const { Bodies } = Matter;
const STEP = 1 / 60;
const M = VEHICLES.convertible;
const noop = () => {};

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
  Object.assign(v, { world, type: model, m, isVehicle: true, w: size.w, h: size.h, k: 0.5, body, def: {}, hat: !!m.hat, rider: null, lit: false,
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

test('seat: anyone sat at the wheel is carried by the car, both hands on its rim, and goes round with the steering', () => {
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
    assert.ok(Math.abs(P.ta - a) < 1e-9 && P.s === SEAT.s && P.legs === 1 && !P.wpnOn);
    for (const [h, side] of [[P.hl, -1], [P.hr, 1]]) {
      const q = inCar(v, ch, h);
      assert.ok(Math.abs(Math.hypot(q.sx - M.wheel[0], q.sy - M.wheel[1]) - M.wheel[2]) < 0.01, 'on the rim');
      assert.equal(Math.sign(q.sy - M.wheel[1]), side, 'his left hand on its left');
    }
    for (const f of P.feet) assert.ok(inCar(v, ch, f).sx < M.cabin[1] + 2, 'his feet under the dash, not on the hood');
    const before = inCar(v, ch, P.hl).sx;
    v.steer = 0.4;
    const Q = seatPose(ch, base(a), newPose());
    assert.ok(Math.abs(inCar(v, ch, Q.hl).sx - before) > 1, 'the hands turn the wheel');
    // moved, the car takes him along and tells him how fast (the wind in his coat)
    Matter.Body.setPosition(v.body, { x: 506, y: 300 });
    v.carry(STEP);
    assert.ok(Math.abs(ch.vel.x - 6) < 1e-6 && Math.hypot(ch.x - v.seatSpot().x, ch.y - v.seatSpot().y) < 1e-6);
    assert.equal(v.unseat(), ch);
    assert.ok(ch.riding === null && v.rider === null);
  }
  assert.equal(car({}, 0, 0, 0, 'car').seatIn(man({}, 0, 0)), false, 'a model without a seat takes nobody');
});

test('seat: aiming, the arm on that side comes out with the gun and the other hand stays on the wheel; the key takes the right one', () => {
  const w = { time: 0 }, v = car(w, 500, 300, 0), ch = man(w, 0, 0);
  ch.weapon = { type: 'pistol', mag: 7 };
  v.seatIn(ch);
  ch.riding.k = 1;
  const rest = seatPose(ch, base(0), newPose());
  assert.ok(!rest.wpnOn, 'both hands on the wheel: the gun put away');
  for (const [aim, gun, other] of [[-Math.PI / 2, 'hl', 'hr'], [Math.PI / 2, 'hr', 'hl']]) {
    ch.riding.aim = aim;
    const P = seatPose(ch, base(0), newPose());
    assert.ok(finite(P) && P.wpnOn && P.wpn.a === aim);
    const q = inCar(v, ch, P[gun]), o = inCar(v, ch, P[other]);
    assert.ok(aim < 0 ? q.sy < M.cabin[2] : q.sy > M.seat[1] + 10, `the gun hand out on the aim's side (${q.sy.toFixed(1)})`);
    assert.ok(Math.abs(Math.hypot(o.sx - M.wheel[0], o.sy - M.wheel[1]) - M.wheel[2]) < 0.01, 'the other on the wheel');
    assert.ok(Math.sign(P.ha) === Math.sign(aim) && Math.abs(P.ha) <= SEAT.aim.head + 1e-9, 'the head turned after it');
  }
  ch.riding.aim = null;
  ch.riding.key = 1;
  const K = seatPose(ch, base(0), newPose()), k = inCar(v, ch, K.hr);
  assert.ok(Math.hypot(k.sx - M.key[0], k.sy - M.key[1]) < 0.01, 'the right hand on the ignition');
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
  const step = () => { w.time += STEP; w.stepOutro(STEP); if (v.rider) v.carry(STEP); };
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
