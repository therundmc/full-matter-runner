import { test } from 'node:test';
import assert from 'node:assert/strict';
import { load } from './setup.mjs';

// no DOM under Node: what the van paints on itself goes nowhere
const ctx = new Proxy({}, { get: (t, k) => t[k] ?? (() => ctx), set: (t, k, v) => { t[k] = v; return true; } });
globalThis.document ??= { createElement: () => ({ width: 0, height: 0, getContext: () => ctx }) };

const { default: Drive, speedStep, steerStep, steerOf, headingOf, yawStep, springStep, bodyLean, kmh, nosedIn, seatOf } = await load('game/systems/Drive.js');
const { CHASE } = await load('game/data/chase.js');
const { VEHICLES, default: Vehicle } = await load('game/entities/Vehicle.js');
const { default: TileMap } = await load('game/world/TileMap.js');
const { default: PhysicsWorld } = await load('engine/physics/PhysicsWorld.js');
const { default: EventBus } = await load('engine/EventBus.js');
const { setMaterial, scaleInertia } = await load('engine/physics/Body.js');
const { TILE, CAT, MASK } = await load('game/Config.js');
const { default: Camera, VIEW, fitView } = await load('engine/Camera.js');
const { stepAngle, TAU } = await load('engine/math.js');
const { default: level2a } = await load('game/data/levels/level2a.js');

const { Bodies, Body } = Matter;
const DT = 1 / 60;
const quiet = new Proxy({}, { get: () => () => {} });

// an open yard 70 x 14 tiles walled round; `cross`: a wall across it at that column (rows 1..12)
function yard(cross = null) {
  const rows = [];
  for (let y = 0; y < 14; y++) {
    let r = '';
    for (let x = 0; x < 70; x++) r += y === 0 || y === 13 || x === 0 || x === 69 || x === cross ? 'X' : '=';
    rows.push(r);
  }
  return rows;
}

// just enough of World to drive in: a real map with its walls, the physics, the player, timers by hand
function world(rows = yard()) {
  const events = new EventBus();
  const physics = new PhysicsWorld({ events, muAt: () => 1, substeps: 2 });
  const map = new TileMap(rows);
  physics.add(map.buildBodies());
  const body = Bodies.circle(64, 64, 10);
  const player = { body, alive: true, hidden: false, angle: 0, get x() { return body.position.x; }, get y() { return body.position.y; } };
  physics.add(body);
  const w = {
    map, physics, events, player, chars: [player], props: [], corpses: [], time: 0, particles: quiet, killed: null, exits: 0,
    exited: false, cleared: false, drive: null,
    game: { onExit() { w.exits++; } },
    addBody: (b) => physics.add(b), removeBody: (b) => physics.remove(b), sound() {}, shake() {}, noise() {}, light() {},
    onKill(ch, cause, killer) { w.killed = { ch, cause, killer }; },
  };
  return w;
}

// a vehicle as Vehicle makes it (its real size, mass and body), nothing drawn
function vehicle(w, model, x, y, deg = 0) {
  const v = Object.create(Vehicle.prototype), m = VEHICLES[model];
  const W = { car: 140, car2: 134, van: 160 }[model], H = { car: 58, car2: 56, van: 64 }[model];
  const body = Bodies.rectangle(x, y, W - 4, H - 4, {
    angle: (deg * Math.PI) / 180, frictionAir: 0.02, friction: 0.6, restitution: 0.05, label: 'vehicle',
    collisionFilter: { category: CAT.PROP, mask: MASK.PROP },
  });
  setMaterial(body, m.kg, 0.9);
  scaleInertia(body, 3);
  body.material = 'metal';
  body.entity = v;
  Object.assign(v, {
    world: w, type: model, m, k: 1, w: W, h: H, body, isVehicle: true, g: ctx, glassPx: { wind: [], rear: [] },
    windows: { wind: 0, rear: 0 }, tires: [true, true, true, true], lamps: [true, true, true, true], hp: m.hp, fuel: 0,
    puddle: 0, alarm: 0, lit: true, flash: 0, moving: false, dead: false, exploded: false, burning: false, drawn: null,
    def: { static: true, hp: m.hp, vault: true },
  });
  w.physics.add(body);
  w.physics.freezeIfHeavy(body);
  w.props.push(v);
  return v;
}

// the keys held and pressed, as engine/Input.js answers
function keys() {
  const held = new Set(), pressed = new Set();
  return { held, pressed, down: (c) => held.has(c), hit: (c) => pressed.delete(c) };
}

// World.step's order for the drive: its intentions, the physics, what it ran into
function run(w, d, input, sec, aim = null) {
  for (let t = 0; t < sec; t += DT) {
    w.time += DT;
    if (w.drive !== null && w.drive !== d) return;
    d.step(DT, input, aim);
    w.physics.step(DT, w.time);
    d.after(DT);
  }
}

// a drive started in the yard: the van at col, row facing +x at the cruise speed
function start(o = {}, at = [6, 7]) {
  const w = world(o.rows), v = vehicle(w, 'van', at[0] * TILE, at[1] * TILE);
  const d = new Drive(w, { van: at, cruise: CHASE.cruise, ...o }, v);
  w.drive = d;
  return { w, v, d, input: keys() };
}
const vel = (v) => Body.getVelocity(v.body);

test('drive: the speed and the steering, step by step (pure)', () => {
  assert.equal(speedStep(8.9, 8.9, DT), 8.9, 'cruise held');
  assert.ok(Math.abs(speedStep(5, 8.9, 0.1) - (5 + CHASE.ease * 0.1)) < 1e-9, 'slowed by a hit: back up toward the cruise speed');
  assert.equal(speedStep(5, 8.9, 2), 8.9, 'and no higher');
  assert.equal(speedStep(11.1, 8.9, 2), 8.9, 'nor ever over it for long');
  assert.ok(Math.abs(steerStep(0, 1, 0.125) - 2) < 1e-9 && steerStep(0, 1, 0.25) === 4, 'the wheel: full in 0.25 s');
  assert.equal(steerStep(4, 0, 1), 0, 'let go: the road takes it away');
  assert.ok(Math.abs(headingOf(8.9, 4) - CHASE.heading) < 1e-9 && headingOf(8.9, 0) === 0, 'the nose follows, a few degrees at most');
  assert.ok(CHASE.heading <= 0.22, 'two angle steps at most in a lane change (64 round the circle)');
  assert.equal(kmh(8.9), 60);
  // the wheel is up / down the picture: W (Z) and A up, S and D down, the pad's left stick by its y
  const held = (...codes) => ({ down: (c) => codes.includes(c) });
  assert.deepEqual([steerOf(held('KeyW')), steerOf(held('KeyA')), steerOf(held('KeyS')), steerOf(held('KeyD')), steerOf(held())], [-1, -1, 1, 1, 0]);
  assert.equal(steerOf(held('KeyW', 'KeyS')), 0, 'both: neither');
  // the arrows too (they move him on foot): up / left up, down / right down
  assert.deepEqual(['ArrowUp', 'ArrowLeft', 'ArrowDown', 'ArrowRight'].map((c) => steerOf(held(c))), [-1, -1, 1, 1]);
  assert.equal(steerOf({ down: () => false, move: () => ({ x: 0.9, y: -0.5, mag: 1 }) }), -0.5, 'the stick pushed up: up, by how far');
  assert.equal(steerOf({ down: () => false, move: () => null }), 0, 'the stick at rest');
});

test('view: at the wheel the picture is drawn 1:1 at the whole zoom nearest to 360 px; on foot it is as it was (pure)', () => {
  const { d } = start();
  assert.equal(d.view, CHASE.camera.view, 'the drive\'s own view');
  assert.deepEqual(fitView(d.view, 1080, true, true), { ss: 1, zoom: 3 }, '1080: three px a world px, the lens scales nothing');
  assert.deepEqual(fitView(d.view, 1440, true, true), { ss: 1, zoom: 4 });
  assert.deepEqual(fitView(d.view, 900, true, true), { ss: 1, zoom: 3 }, '900: 2.5 rounds to 3 (300 px of view)');
  assert.deepEqual(fitView(d.view, 720, false, true), { ss: 1, zoom: 2 }, 'the same without the lens');
  assert.deepEqual(fitView(d.view, 200, true, true), { ss: 1, zoom: 1 }, 'never under 1');
  // on foot, unchanged: the lens brings a larger scene down; without it the nearest whole zoom
  assert.deepEqual(fitView(VIEW, 1080, true), { ss: (VIEW * 4) / 1080, zoom: 4 });
  assert.deepEqual(fitView(VIEW, 1080, false), { ss: 1, zoom: 4 });
  assert.deepEqual(fitView(VIEW, 720, true), { ss: (VIEW * 3) / 720, zoom: 3 });
});

test('view: the angle a driven car is drawn at: one of 64, kept with a little slack (pure)', () => {
  const step = TAU / CHASE.pixel.steps, slack = CHASE.pixel.slack;
  assert.equal(CHASE.pixel.steps, 64);
  for (const a of [0, 0.03, 0.2, -0.35, 1.234, -3]) {
    const q = stepAngle(a, null, step, slack);
    assert.ok(Math.abs(q / step - Math.round(q / step)) < 1e-9 && Math.abs(q - a) <= step / 2 + 1e-9, `${a} -> ${q}`);
  }
  assert.equal(stepAngle(0, null, step, slack), 0);
  // back and forth about the boundary between two steps: the one it is on is kept
  const edge = step / 2;
  let on = stepAngle(edge - 0.01, null, step, slack), seen = new Set([on]);
  for (let i = 0; i < 40; i++) { on = stepAngle(edge + (i % 2 ? 0.02 : -0.02), on, step, slack); seen.add(on); }
  assert.deepEqual([...seen], [0], 'no flicker');
  assert.equal(stepAngle(edge + slack + 0.001, 0, step, slack), step, 'well past it: the next one');
  assert.equal(stepAngle(edge - 0.02, step, step, slack), step, 'and that one kept on the way back');
  assert.equal(stepAngle(edge - slack - 0.001, step, step, slack), 0);
  assert.ok(slack > 0.02 && slack < 0.035, 'about 1.5 degrees');
});

test('view: the camera held on whole px: no turn at all, no lag, whole numbers in what it draws with', () => {
  const cam = new Camera(), calls = [];
  const ctx = { setTransform() {}, translate: (x, y) => calls.push(['t', x, y]), rotate: (a) => calls.push(['r', a]), scale: (x) => calls.push(['s', x]) };
  cam.resize(1920, 1080, 3);
  cam.pixel = true;
  cam.snap(1000.4, 416.2);
  cam.shake(1);
  cam.push(3.7, -2.2);
  cam.punch(0.2);
  for (let i = 0; i < 30; i++) {
    cam.update(DT, 1000.4 + i * 8.9 + 0.123, 416.2);
    assert.equal(cam.rot, 0, 'no turn, shaken or not');
    assert.equal(cam.x, 1000.4 + i * 8.9 + 0.123, 'on its target, no lag');
    assert.equal(cam.z, 3, 'no zoom punch: a whole zoom');
    calls.length = 0;
    cam.apply(ctx);
    const [t0, r, s, t1] = calls;
    assert.ok(Number.isInteger(t0[1]) && Number.isInteger(t0[2]), 'the shake in whole px');
    assert.equal(r[1], 0);
    assert.equal(s[1], 3);
    assert.ok(Math.abs(t1[1] * 3 - Math.round(t1[1] * 3)) < 1e-9 && Math.abs(t1[2] * 3 - Math.round(t1[2] * 3)) < 1e-9, `the view on the px grid (${t1[1] * 3})`);
    // and what it tells of itself agrees with what it draws
    const p = cam.worldToScreen(1234.5, 400.25), q = cam.screenToWorld(p.x, p.y);
    assert.ok(Math.abs(q.x - 1234.5) < 1e-9 && Math.abs(q.y - 400.25) < 1e-9);
  }
  assert.ok(cam.trauma > 0, '(it was shaking all along)');
  // out of the car: the slow tilt and the turn of a shake come back
  cam.pixel = false;
  cam.shake(1);
  for (let i = 0; i < 30; i++) cam.update(DT, 0, 0);
  assert.notEqual(cam.rot, 0);
});

test('view: the camera is locked on the car: a fixed share of the view from the left, the street\'s middle across', () => {
  const { w, v, d, input } = start({ lanes: [5, 7.5], mid: 6 });
  const z = 3, viewW = 640, offs = new Set();
  w.camera = { pixel: true, z, push() {} };
  for (let i = 0; i < 90; i++) {
    if (i === 30) input.held.add('KeyS');
    if (i === 50) { input.held.clear(); input.pressed.add('Space'); }
    run(w, d, input, DT, { x: v.x, y: v.y - 100 });
    const f = d.frame(viewW, z), at = v.pose();
    assert.ok(Math.abs(f.x * z - Math.round(f.x * z)) < 1e-6 && Math.abs(f.y * z - Math.round(f.y * z)) < 1e-6, 'on the px grid');
    assert.ok(Math.abs(at.x * z - Math.round(at.x * z)) < 1e-6 && Math.abs(at.y * z - Math.round(at.y * z)) < 1e-6, 'the car drawn on it too');
    assert.equal(f.y, 6 * TILE, 'the street\'s middle, whatever the car does across');
    offs.add(Math.round((f.x - at.x) * z));
  }
  assert.equal(offs.size, 1, `the car never slides on the picture (${[...offs]})`);
  const share = 0.5 - [...offs][0] / z / viewW;
  assert.ok(Math.abs(share - CHASE.camera.at) < 0.002 && CHASE.camera.at > 0.25 && CHASE.camera.at < 0.4, `a third from the left (${share})`);
  // not held on whole px (a staged zoom between two whole ones; any other level): the car as its body is
  w.camera.z = 2.5;
  assert.deepEqual(v.pose(), { x: v.x, y: v.y, a: v.body.angle });
  assert.equal(v.drawn, null);
});

test('drive: the nose is on a spring that does not wag, the body leans (pure)', () => {
  // the nose: a little late, then there, never past it
  let a = 0, turning = 0, most = 0, at005 = 0;
  for (let t = 0; t < 1.5; t += DT) {
    turning = yawStep(a, turning, CHASE.heading, DT);
    a += turning * DT;
    most = Math.max(most, a);
    if (Math.abs(t - 0.05) < DT / 2) at005 = a;
  }
  assert.ok(at005 < CHASE.heading * 0.5, `not there at once (${at005})`);
  assert.ok(most < CHASE.heading * 1.01, `no swing past it (${most})`);
  assert.ok(Math.abs(a - CHASE.heading) < 0.002, `and settles (${a})`);
  assert.ok(CHASE.yaw.d >= 1.9 * Math.sqrt(CHASE.yaw.k), 'all but critically damped');
  // the body
  const [squat] = bodyLean(CHASE.ease, 0, 0), [dive] = bodyLean(-40, 0, 0), [, roll] = bodyLean(0, CHASE.steerRate, 2);
  assert.ok(squat > 0.5 && dive === -CHASE.body.most, 'sat back as it pulls, the nose down on a hit');
  assert.ok(roll < -0.5, 'rolled out of a bend toward +y');
  let x = 0, sp = 30, top = 0;
  for (let t = 0; t < 2; t += DT) { [x, sp] = springStep(x, sp, 0, CHASE.body.lift.k, CHASE.body.lift.d, DT); top = Math.max(top, x); }
  assert.ok(top > 1 && top < 2.5 && Math.abs(x) < 0.01, `a bump: up ${top} px, then still`);
});

test('drive: a lane change: the body leans, the car is drawn on three angles at most each way, never flickering, and comes back dead straight', () => {
  const { w, v, d, input } = start();
  w.camera = { pixel: true, z: 3 };
  const step = TAU / CHASE.pixel.steps, seen = [];
  const drive = (sec) => { for (let t = 0; t < sec; t += DT) { run(w, d, input, DT); seen.push(Math.round(v.pose().a / step)); } };
  input.held.add('KeyS');
  drive(0.4);
  assert.ok(v.body.angle > 0.1 && v.body.angle <= CHASE.heading + 1e-6, `the nose a few degrees into it (${v.body.angle})`);
  assert.ok(v.roll < -0.5, `rolled out of it (${v.roll})`);
  input.held.delete('KeyS');
  drive(0.8);
  input.held.add('KeyW');
  drive(0.4);
  input.held.delete('KeyW');
  drive(1.2);
  assert.ok(Math.max(...seen) <= 3 && Math.min(...seen) >= -3 && Math.max(...seen) >= 1 && Math.min(...seen) <= -1, `angle steps ${Math.min(...seen)} .. ${Math.max(...seen)}`);
  // each angle is held: it never goes back to the one it has just left
  let turns = 0;
  for (let i = 2; i < seen.length; i++) if (seen[i] !== seen[i - 1] && seen[i] === seen[i - 2]) turns++;
  assert.equal(turns, 0, `no flicker (${seen.join(' ')})`);
  let changes = 0;
  for (let i = 1; i < seen.length; i++) if (seen[i] !== seen[i - 1]) changes++;
  assert.ok(changes <= 8, `${changes} changes of angle in two lane changes`);
  assert.ok(!d.dead && vel(v).x > 5, 'still going');
  assert.ok(Math.abs(v.body.angle) < 1e-12, `dead straight again (${v.body.angle})`);
  assert.ok(Math.abs(v.squat) < 0.05 && Math.abs(v.roll) < 0.05, 'the body at rest on its wheels');
  d.bump('hit');
  run(w, d, input, 0.05);
  assert.ok(v.lift > 0.5, `a hit throws it up (${v.lift} ${d.body.lift})`);
});

test('drive: he is in the van, hidden and carried; it holds its cruise speed with nothing held', () => {
  const { w, v, d, input } = start();
  assert.ok(w.player.hidden && !w.chars.includes(w.player), 'out of sight, out of reach');
  run(w, d, input, 3);
  assert.ok(Math.abs(d.v - 8.9) < 1e-6 && Math.abs(vel(v).x - 8.9) < 0.05, `cruise ${vel(v).x}`);
  assert.ok(Math.abs(vel(v).y) < 1e-3 && Math.abs(v.body.angle) < 1e-3, 'straight along the road');
  const seat = v.toWorld(...seatOf(v));
  assert.ok(Math.hypot(w.player.x - seat.x, w.player.y - seat.y) < 1e-6, 'at the wheel');
});

test('drive: no throttle, no brake: W / S held change nothing of the speed; W steers it up the picture, S down', () => {
  for (const [code, way] of [['KeyW', -1], ['KeyS', 1]]) {
    const { w, v, d, input } = start();
    const y0 = v.y;
    input.held.add(code);
    let lo = Infinity, hi = -Infinity;
    for (let i = 0; i < 24; i++) { run(w, d, input, DT); lo = Math.min(lo, d.v); hi = Math.max(hi, d.v); }
    assert.ok(Math.abs(lo - CHASE.cruise) < 1e-9 && Math.abs(hi - CHASE.cruise) < 1e-9, `${code}: the cruise speed, held or not (${lo} .. ${hi})`);
    assert.ok(Math.abs(vel(v).x - CHASE.cruise) < 0.05);
    assert.ok((v.y - y0) * way > 40 && Math.abs(vel(v).y - way * CHASE.steer) < 0.1, `${code}: across at ${vel(v).y}`);
  }
});

test('drive: A / D steer it too (A up, D down), letting go straightens it', () => {
  const { w, v, d, input } = start();
  const y0 = v.y;
  input.held.add('KeyD');
  run(w, d, input, 0.4);
  assert.ok(Math.abs(vel(v).y - CHASE.steer) < 0.1, `sideways at ${vel(v).y}`);
  assert.ok(v.y > y0 + 40 && v.body.angle > 0.1 && v.body.angle <= CHASE.heading + 1e-6, 'down the picture, its nose turned that way a little');
  input.held.delete('KeyD');
  run(w, d, input, 1.5);
  assert.ok(Math.abs(v.body.angle) < 0.05, `straight again (${v.body.angle})`);
  assert.ok(Math.abs(vel(v).y) < 0.05);
  input.held.add('KeyA');
  run(w, d, input, 0.3);
  assert.ok(vel(v).y < -3 && v.body.angle < -0.1, 'A: the other way');
  // the pad's left stick
  const s = start();
  s.input.move = () => ({ x: 0, y: 1, mag: 1 });
  run(s.w, s.d, s.input, 0.4);
  assert.ok(Math.abs(vel(s.v).y - CHASE.steer) < 0.1, 'the stick pulled down: down the picture');
});

test('drive: the shove lunges a lane toward the side he aims at, then waits its cooldown (0.7 s: it is THE move)', () => {
  const { w, v, d, input } = start();
  run(w, d, input, 0.2);
  assert.equal(d.lunge, 0);
  const below = { x: v.x, y: v.y + 100 };
  input.pressed.add('Space');
  run(w, d, input, 0.05, below);
  assert.ok(Math.abs(vel(v).y - CHASE.shove.v) < 0.1, `kicked at ${vel(v).y}`);
  assert.ok(d.ready < 0.2, 'the bar empty');
  assert.equal(d.lunge, 1, 'the first shove, under way');
  run(w, d, input, 0.2, below);
  assert.ok(vel(v).y < CHASE.shove.v - 0.5, 'back to the steering after it');
  run(w, d, input, 0.3, below);
  const went = v.y - (below.y - 100);
  assert.ok(Math.abs(vel(v).y) < 0.05 && went > 70 && went < 115, `given back fast: a lane over (80 px), not across the street (${went} px)`);
  assert.equal(d.lunge, 0, 'over');
  input.pressed.add('Space');
  run(w, d, input, 0.05, { x: v.x, y: v.y - 100 });
  assert.ok(vel(v).y > -1, 'not again before the cooldown');
  assert.ok(CHASE.shove.cooldown > 0.6 && CHASE.shove.cooldown < 0.8);
  run(w, d, input, 0.15);
  assert.equal(d.ready, 1, 'ready again 0.7 s after it');
  input.pressed.add('Space');
  run(w, d, input, 0.1, { x: v.x, y: v.y - 100 });
  assert.ok(Math.abs(vel(v).y + CHASE.shove.v) < 0.1, 'above its middle line: up');
});

test('drive: nose-on into a wall at 9 px/step kills him; a scrape along one does not', () => {
  // the contact rule itself: square on and fast; a 30 degree scrape is not
  assert.ok(nosedIn(0, 9, 0, 1, 0));
  const a = Math.PI / 6;
  assert.ok(!nosedIn(a, 9 * Math.cos(a), 9 * Math.sin(a), 0, 1), '30 degrees along a wall');
  assert.ok(!nosedIn(0, 5, 0, 1, 0), 'too slow');
  // into a wall across the road
  {
    const { w, v, d, input } = start({ cruise: 9, rows: yard(30) });
    run(w, d, input, 4);
    assert.ok(w.killed && w.killed.ch === w.player && w.killed.cause === 'crash' && w.killed.killer === v, 'dead at the wheel');
    assert.ok(!w.player.alive && d.dead && d.v === 0);
    assert.ok(v.x < 30 * TILE, 'stopped against it');
  }
  // along the wall at the top of the yard, steering into it all the way
  {
    const { w, v, d, input } = start({ cruise: 9 }, [6, 3]);
    input.held.add('KeyA');
    run(w, d, input, 2);
    assert.equal(w.killed, null, 'a scrape never kills');
    assert.ok(v.x > 30 * TILE && d.v > 6, `it goes on (${d.v})`);
  }
});

test('drive: a parked car hit nose-on takes the blow: he lives, the van loses most of its speed, the car is shoved', () => {
  const { w, v, d, input } = start({ cruise: 9 });
  const car = vehicle(w, 'car', 20 * TILE, 7 * TILE, 0);
  assert.ok(car.body.frozen, 'parked: frozen');
  const x0 = car.x;
  let low = Infinity;
  for (let i = 0; i < 60; i++) { run(w, d, input, DT); low = Math.min(low, d.v); }
  assert.equal(w.killed, null);
  assert.ok(car.x > x0 + 20, `shoved on (${car.x - x0} px)`);
  assert.ok(low < 9 * CHASE.hit.keep + 1.5, `the van slowed (down to ${low})`);
});

test('drive: the lab: it pulls away by itself; E gets him out by the driver\'s door', () => {
  const w = world(), v = vehicle(w, 'van', 6 * TILE, 7 * TILE);
  const d = new Drive(w, { exit: true }, v), input = keys();
  w.drive = d;
  assert.equal(d.v, 0, 'parked: it pulls away');
  run(w, d, input, 2);
  assert.ok(Math.abs(d.v - CHASE.cruise) < 1e-6 && w.player.hidden, 'at its cruise speed, nothing held');
  input.pressed.add('KeyE');
  run(w, d, input, DT);
  assert.equal(w.drive, null, 'out');
  assert.ok(Math.hypot(vel(v).x, vel(v).y) < 1e-9, 'the car stopped where it was');
  assert.ok(!w.player.hidden && w.chars.includes(w.player));
  assert.ok(w.player.y < v.y - v.h / 2, 'on the driver\'s side');
});

test('level2a: the back road loads, the van in our lane at the start, the end of the road ends the level', () => {
  const c = level2a.chase, map = new TileMap(level2a.tiles);
  assert.ok(map.w >= 420 && map.h >= 20, `${map.w} x ${map.h}`);
  assert.equal(c.van[1], c.lanes[c.lanes.length - 1], 'in our lane (the south one)');
  assert.ok(c.end * TILE < map.widthPx && c.end > 400, 'the end of the road on the map, after about 420 m');
  // our lane is clear road all the way to the end
  for (let x = Math.floor(c.van[0]); x < c.end; x++) assert.ok(!map.isSolid(x, Math.floor(c.van[1])), `col ${x}`);
  // a short drive on the real map: from 3 tiles before the end, the level is over
  const w = world(level2a.tiles), v = vehicle(w, 'van', (c.end - 3) * TILE, c.van[1] * TILE);
  const d = new Drive(w, { ...c, arms: null, van: [c.end - 3, c.van[1]] }, v), input = keys();
  w.drive = d;
  run(w, d, input, 0.5);
  assert.ok(w.cleared && w.exited && w.exits === 1, 'over');
});

// a contact as the physics hands it to Drive.contact: the van's body and another, touching along n
const touch = (v, o, n = { x: 1, y: 0 }) => ({ bodyA: v.body, bodyB: o, isActive: true, isSensor: false, collision: { normal: n, supports: [o.position] } });

test('drive: a light loose thing met at a crawl is thrown out of its way too, never a full contact (it pinned the car)', () => {
  const { w, v, d } = start();
  const bag = Bodies.circle(v.x + 92, v.y, 6.5);
  setMaterial(bag, 6, 0.6);
  bag.entity = { def: { material: 'fabric' }, type: 'bin_bag' };
  w.physics.add(bag);
  Body.setVelocity(v.body, { x: 0.3, y: 0 }); // (crawling: under the speed that tears things off)
  const pair = touch(v, bag);
  d.contact(bag, pair);
  assert.ok(pair.isSensor && !pair.isActive, 'the contact dropped');
  assert.ok(Math.hypot(vel({ body: bag }).x, vel({ body: bag }).y) >= CHASE.hit.fling.least - 1e-9, 'thrown out of its way');
});

test('drive: the lab: the parked car it shoved is told by the drive it is in now, not the first one (got out, in again)', () => {
  const w = world(), van = vehicle(w, 'van', 6 * TILE, 7 * TILE), car = vehicle(w, 'car', 12 * TILE, 7 * TILE);
  const own = () => {};
  const other = vehicle(w, 'car', 12 * TILE, 3 * TILE);
  other.onCollide = own; // (a pursuer's own handler)
  const d1 = new Drive(w, { exit: true }, van);
  w.drive = d1;
  d1.contact(car.body, touch(van, car.body));
  d1.contact(other.body, touch(van, other.body));
  assert.equal(typeof car.onCollide, 'function', 'what it is shoved into goes too');
  d1.leave();
  assert.equal(car.onCollide, null, 'taken back as he gets out');
  assert.equal(other.onCollide, own, 'never one it did not give');
  const d2 = new Drive(w, { exit: true }, van);
  w.drive = d2;
  d2.contact(car.body, touch(van, car.body));
  let knocked = null;
  d2.knock = (b) => { knocked = b; };
  car.onCollide({}, {});
  assert.equal(knocked, car.body, 'the new drive is told');
});

test('drive: past the end of the road (the card coming up) the wheel, the shove and the gun are his no more', () => {
  const c = level2a.chase, w = world(level2a.tiles), v = vehicle(w, 'van', (c.end - 1) * TILE, c.van[1] * TILE);
  const d = new Drive(w, { ...c, arms: null, van: [c.end - 1, c.van[1]] }, v), input = keys();
  w.drive = d;
  run(w, d, input, 0.3);
  assert.ok(w.exited, 'over');
  let fired = 0;
  d.gun.step = () => { fired++; };
  input.held.add('KeyD');
  input.pressed.add('Space');
  run(w, d, input, 0.5, { x: v.x, y: v.y + 100 });
  assert.equal(fired, 0, 'no gun');
  assert.equal(d.shoves, 0, 'no shove');
  assert.ok(Math.abs(vel(v).y) < 0.05, 'no steering: it runs on straight');
});

test('drive: held up for good behind a parked car shoved into its lane, nothing held, it eases itself out and runs on', () => {
  const { w, v, d, input } = start({ cruise: 9, lanes: [4.5, 7], mid: 5.75 });
  const car = vehicle(w, 'van', 16 * TILE, 7 * TILE, 0);
  Body.setStatic(car.body, true); // (a wreck that never gives: only going round it frees him)
  car.body.frozen = false;
  let low = Infinity, t = 0;
  for (; t < 6 && !(low < 2 && d.v > 0.8 * 9 && v.x > car.x); t += DT) { run(w, d, input, DT); low = Math.min(low, d.v); }
  assert.equal(w.killed, null, 'no crash');
  assert.ok(low < 2, `held up (${low})`);
  assert.ok(v.x > car.x && d.v > 0.8 * 9 && t < 3, `round it and running again in ${t.toFixed(1)} s (at ${v.x.toFixed(0)}, ${d.kmh} km/h)`);
  assert.ok(v.y < car.y - 62, `out from behind it (${v.y.toFixed(0)})`);
  run(w, d, input, 1);
  assert.ok(v.x > car.x + 300 && d.v > 8.9 && d.freeing === null, 'and on past it at cruise, the wheel his again');
});

test('drive: stalled, the wheel he holds is his: the car never fights it, and gets him out his way at a crawl', () => {
  const { w, v, d, input } = start({ cruise: 9, lanes: [4.5, 7], mid: 5.75 });
  const car = vehicle(w, 'van', 16 * TILE, 7 * TILE, 0);
  Body.setStatic(car.body, true);
  car.body.frozen = false;
  for (let t = 0; t < 3 && !d.freeing; t += DT) run(w, d, input, DT);
  assert.ok(d.v < 2 && d.freeing, 'held up, easing itself out');
  input.held.add('KeyS'); // (down: toward the yard's wall, the way the car would not go)
  const y0 = v.y;
  run(w, d, input, 0.3);
  assert.ok(v.y > y0 + 8, `his way, out of it even at a crawl (${(v.y - y0).toFixed(1)} px)`);
  input.held.delete('KeyS');
  run(w, d, input, 1.5);
  assert.ok(v.y < y0 - 20, 'let go: out it eases');
});
