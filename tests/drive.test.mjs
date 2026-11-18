import { test } from 'node:test';
import assert from 'node:assert/strict';
import { load } from './setup.mjs';

// no DOM under Node: what the van paints on itself goes nowhere
const ctx = new Proxy({}, { get: (t, k) => t[k] ?? (() => ctx), set: (t, k, v) => { t[k] = v; return true; } });
globalThis.document ??= { createElement: () => ({ width: 0, height: 0, getContext: () => ctx }) };

const { default: Drive, speedStep, steerStep, headingOf, viewHeight, cameraScale, kmh, nosedIn, seatOf } = await load('game/systems/Drive.js');
const { CHASE } = await load('game/data/chase.js');
const { VEHICLES, default: Vehicle } = await load('game/entities/Vehicle.js');
const { default: TileMap } = await load('game/world/TileMap.js');
const { default: PhysicsWorld } = await load('engine/physics/PhysicsWorld.js');
const { default: EventBus } = await load('engine/EventBus.js');
const { setMaterial, scaleInertia } = await load('engine/physics/Body.js');
const { TILE, CAT, MASK } = await load('game/Config.js');
const { VIEW } = await load('engine/Camera.js');
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
    puddle: 0, alarm: 0, lit: true, flash: 0, moving: false, dead: false, exploded: false, burning: false,
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
  assert.equal(speedStep(8.9, 8.9, false, false, DT), 8.9, 'cruise held');
  assert.ok(Math.abs(speedStep(8.9, 8.9, true, false, 1) - 11.1) < 1e-9, 'W: up to max in a second (6 px/step a s)');
  assert.equal(speedStep(11.1, 8.9, true, false, 1), 11.1, 'never past it');
  assert.ok(Math.abs(speedStep(11.1, 8.9, false, false, 0.5) - 9.6) < 1e-9, 'let go: back down at 3 a s');
  assert.equal(speedStep(5, 8.9, false, true, 1), 0, 'S: to a stop');
  assert.ok(Math.abs(steerStep(0, 1, 0.125) - 2) < 1e-9 && steerStep(0, 1, 0.25) === 4, 'A / D: full in 0.25 s');
  assert.equal(steerStep(4, 0, 1), 0, 'let go: the road takes it away');
  assert.ok(Math.abs(headingOf(8.9, 4) - 0.35) < 1e-9 && headingOf(8.9, 0) === 0, 'the nose follows, at most 0.35 rad off');
  assert.equal(kmh(8.9), 60);
  assert.equal(kmh(11.1), 75);
});

test('drive: the camera pulls out with the speed (pure)', () => {
  assert.equal(viewHeight(0), CHASE.camera.view[0]);
  assert.equal(viewHeight(CHASE.max), CHASE.camera.view[1]);
  assert.equal(viewHeight(99), CHASE.camera.view[1], 'never further');
  const h60 = viewHeight(8.9);
  assert.ok(h60 > 355 && h60 < 375, `about 360 px high at 60 km/h (${h60})`);
  for (const v of [0, 4, 8.9, 11.1]) assert.ok(Math.abs(cameraScale(v) * viewHeight(v) - VIEW) < 1e-9);
  assert.ok(cameraScale(0) > cameraScale(8.9) && cameraScale(8.9) > cameraScale(11.1), 'further out the faster');
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

test('drive: W takes it up to 75 km/h and no further, S stops it', () => {
  const { w, v, d, input } = start();
  input.held.add('KeyW');
  run(w, d, input, 1.5);
  assert.ok(Math.abs(d.v - CHASE.max) < 1e-6 && Math.abs(vel(v).x - CHASE.max) < 0.05, `flat out ${vel(v).x}`);
  input.held.delete('KeyW');
  input.held.add('KeyS');
  run(w, d, input, 1);
  assert.equal(d.v, 0);
  assert.ok(Math.hypot(vel(v).x, vel(v).y) < 0.05, 'stopped');
});

test('drive: A / D move it across the road, letting go straightens it', () => {
  const { w, v, d, input } = start();
  const y0 = v.y;
  input.held.add('KeyD');
  run(w, d, input, 0.4);
  assert.ok(Math.abs(vel(v).y - CHASE.steer) < 0.1, `sideways at ${vel(v).y}`);
  assert.ok(v.y > y0 + 40 && v.body.angle > 0.25, 'over to the right, its nose turned that way');
  input.held.delete('KeyD');
  run(w, d, input, 1.5);
  assert.ok(Math.abs(v.body.angle) < 0.05, `straight again (${v.body.angle})`);
  assert.ok(Math.abs(vel(v).y) < 0.05);
  input.held.add('KeyA');
  run(w, d, input, 0.3);
  assert.ok(vel(v).y < -3 && v.body.angle < -0.2, 'A: the other way');
});

test('drive: the shove kicks it sideways toward the mouse for 0.18 s, then waits its cooldown', () => {
  const { w, v, d, input } = start();
  run(w, d, input, 0.2);
  const below = { x: v.x, y: v.y + 100 };
  input.pressed.add('Space');
  run(w, d, input, 0.1, below);
  assert.ok(Math.abs(vel(v).y - CHASE.shove.v) < 0.1, `kicked at ${vel(v).y}`);
  assert.ok(d.ready < 0.2, 'the bar empty');
  run(w, d, input, 0.2, below);
  assert.ok(vel(v).y < CHASE.shove.v - 0.5, 'back to the steering after it');
  input.pressed.add('Space');
  run(w, d, input, 0.05, { x: v.x, y: v.y - 100 });
  assert.ok(vel(v).y > -1, 'not again before the cooldown');
  run(w, d, input, 1.2);
  assert.equal(d.ready, 1);
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
  run(w, d, input, 1.0);
  assert.equal(w.killed, null);
  assert.ok(car.x > x0 + 20, `shoved on (${car.x - x0} px)`);
  run(w, d, input, 0.05);
  assert.ok(d.v < 9 * CHASE.hit.keep + 1.5, `the van slowed (${d.v})`);
});

test('drive: the lab: stopping gets him out by the driver\'s door', () => {
  const w = world(), v = vehicle(w, 'van', 6 * TILE, 7 * TILE);
  const d = new Drive(w, { exit: true }, v), input = keys();
  w.drive = d;
  assert.equal(d.v, 0, 'parked: it pulls away');
  run(w, d, input, 2);
  assert.ok(d.v > 1 && w.player.hidden);
  input.held.add('KeyS');
  run(w, d, input, 2);
  assert.equal(w.drive, null, 'out');
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
