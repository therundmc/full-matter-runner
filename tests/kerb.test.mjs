// Level 2A: steered into the sidewalk and the building fronts, the car is never held there for good (its corner caught
// at a window or a door set back in a front, or at the seam of two wall bodies; a light thing pinned under it):
// released, it is back at its cruise speed (systems/Drive.js: offFronts, its rounded corners, unstick, fling).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { load } from './setup.mjs';

// no DOM under Node: what the cars paint on themselves goes nowhere
const ctx = new Proxy({}, { get: (t, k) => t[k] ?? (() => ctx), set: (t, k, v) => { t[k] = v; return true; } });
globalThis.document ??= { createElement: () => ({ width: 0, height: 0, getContext: () => ctx }) };

const { default: Drive, frontsAt } = await load('game/systems/Drive.js');
const { CHASE } = await load('game/data/chase.js');
const { VEHICLES, default: Vehicle } = await load('game/entities/Vehicle.js');
const { default: Prop } = await load('game/entities/Prop.js');
const { default: TileMap } = await load('game/world/TileMap.js');
const { default: PhysicsWorld } = await load('engine/physics/PhysicsWorld.js');
const { default: EventBus } = await load('engine/EventBus.js');
const { setMaterial, scaleInertia } = await load('engine/physics/Body.js');
const { TILE, CAT, MASK } = await load('game/Config.js');
const { default: level2a } = await load('game/data/levels/level2a.js');

const { Bodies, Body } = Matter;
const DT = 1 / 60;
const quiet = new Proxy({}, { get: () => () => {} });
const C = level2a.chase;

// the back road: its walls and the props of the stretch [x0, x1] (world px), the physics, the player
function world(x0, x1) {
  const events = new EventBus();
  const physics = new PhysicsWorld({ events, muAt: () => 1, substeps: 2 });
  const map = new TileMap(level2a.tiles);
  physics.add(map.buildBodies());
  const body = Bodies.circle(64, 64, 10);
  physics.add(body);
  const player = { body, alive: true, hidden: false, angle: 0, isPlayer: true, get x() { return body.position.x; }, get y() { return body.position.y; } };
  const w = {
    map, physics, events, player, chars: [player], props: [], corpses: [], debris: [], items: [], windows: [], doors: [], rings: [],
    time: 0, particles: quiet, decals: quiet, papers: quiet, smoke: quiet, exited: false, cleared: false, drive: null,
    game: { onExit() {}, flash() {} }, camera: quiet,
    addBody: (b) => physics.add(b), removeBody: (b) => physics.remove(b), addDebris() {}, removeDebris() {},
    sound() {}, shake() {}, noise() {}, light() {}, hitstop() {}, emit() {}, flashGlass() {}, damageWall() {}, after() {},
    onKill() {},
  };
  for (const [type, col, row, deg = 0] of level2a.props) {
    if (VEHICLES[type] || col * TILE < x0 || col * TILE > x1) continue;
    w.props.push(new Prop(w, type, col * TILE, row * TILE, (deg * Math.PI) / 180));
  }
  return w;
}

// THE BOSS's convertible as Vehicle makes it (its real size, mass and body), nothing drawn
function convertible(w, x, y) {
  const v = Object.create(Vehicle.prototype), m = VEHICLES.convertible, W = 172, H = 64;
  const body = Bodies.rectangle(x, y, W - 4, H - 4, {
    frictionAir: 0.02, friction: 0.6, restitution: 0.05, label: 'vehicle', collisionFilter: { category: CAT.PROP, mask: MASK.PROP },
  });
  setMaterial(body, m.kg, 0.9);
  scaleInertia(body, 3);
  body.material = 'metal';
  body.entity = v;
  Object.assign(v, {
    world: w, type: 'convertible', m, k: 1, w: W, h: H, body, isVehicle: true, g: ctx, glassPx: { wind: [], rear: [] },
    windows: { wind: 0, rear: 0 }, tires: [true, true, true, true], lamps: [true, true, true, true], hp: m.hp, fuel: 0,
    puddle: 0, alarm: 0, lit: true, flash: 0, moving: false, dead: false, exploded: false, burning: false, rider: null,
    hat: false, gun: false, drawn: null, def: { static: true, hp: m.hp, vault: true },
  });
  w.physics.add(body);
  w.props.push(v);
  return v;
}

function keys() {
  const held = new Set(), pressed = new Set();
  return { held, pressed, down: (c) => held.has(c), hit: (c) => pressed.delete(c) };
}

// World.step's order for the drive
function run(w, d, input, sec, each = null) {
  for (let t = 0; t < sec; t += DT) {
    w.time += DT;
    d.step(DT, input, null);
    w.physics.step(DT, w.time);
    d.after(DT);
    each?.();
  }
}

// his car at x in his lane, at cruise: steered `key` held 2.5 s, released: s it took to be back over 80 % of its
// cruise (null: never within 3 s), the drive, its lowest speed while held, and the least px its flank was off the
// building front it was steered at (the south one's face is row 18's top, the north one's row 7's bottom)
function intoKerb(x, key, net = true) {
  const w = world(x - 200, x + 1600), v = convertible(w, x, C.van[1] * TILE);
  const d = new Drive(w, { ...C, arms: null, events: [], end: null, van: [x / TILE, C.van[1]] }, v), input = keys();
  if (!net) d.unstick = () => null;
  w.drive = d;
  run(w, d, input, 0.5);
  input.held.add(key);
  let low = Infinity, gap = Infinity;
  run(w, d, input, 2.5, () => {
    low = Math.min(low, d.v);
    gap = Math.min(gap, key === 'KeyD' ? 18 * TILE - v.body.bounds.max.y : v.body.bounds.min.y - 8 * TILE);
  });
  input.held.delete(key);
  let back = null;
  const t0 = w.time, cruise = 0.8 * d.cruise;
  run(w, d, input, 3, () => { if (back === null && d.v > cruise && Body.getVelocity(v.body).x > cruise) back = w.time - t0; });
  return { back, d, v, low, gap };
}

// along the road, down into the south fronts and up into the north ones (the stalls this was written for were at
// the seams of two wall bodies of the street as it was then; the south fronts are on row 18 at these x, the south
// sidewalk between them and the lanes: past an alley, under the railway bridge, along the blind walls)
for (const [x, key] of [[3600, 'KeyD'], [5300, 'KeyD'], [7400, 'KeyD'], [4200, 'KeyD'], [6000, 'KeyD'], [2030, 'KeyA'], [3000, 'KeyA'], [9000, 'KeyA']]) {
  test(`kerb: steered ${key === 'KeyD' ? 'down' : 'up'} into the building fronts for 2.5 s from x ${x}, released, it is back at cruise within 3 s`, () => {
    const { back, d, v } = intoKerb(x, key);
    assert.ok(!d.dead, 'no crash');
    assert.ok(back !== null, `stalled: ${d.kmh} km/h at x ${v.x.toFixed(0)}, y ${v.y.toFixed(1)}`);
  });
}

test('kerb: held a hair off the building fronts (their windows and doors set back in them), it runs on along them', () => {
  for (const [x, key] of [[3600, 'KeyD'], [5300, 'KeyD'], [4200, 'KeyD'], [6000, 'KeyD'], [3000, 'KeyA'], [9000, 'KeyA']]) {
    const { back, d, low, gap } = intoKerb(x, key, false); // (no stall to be freed from)
    assert.ok(low > 0.9 * d.cruise, `x ${x} ${key}: down to ${low.toFixed(2)} px/step along them`);
    assert.ok(gap > 1 && gap < 4, `x ${x} ${key}: its flank ${gap.toFixed(1)} px off them`);
    assert.ok(back !== null && back < 0.5);
  }
});

test('kerb: steered into a street across (the level\'s `chase.across`), he is held on the line of the fronts: never down it', () => {
  assert.ok(C.across.length === 2, 'the two junctions');
  for (const [c0, c1, up, down] of C.across) {
    for (const key of ['KeyD', 'KeyA']) {
      const w = world((c0 - 12) * TILE, (c1 + 12) * TILE), v = convertible(w, (c0 - 6) * TILE, C.van[1] * TILE);
      const d = new Drive(w, { ...C, arms: null, events: [], end: null, van: [c0 - 6, C.van[1]] }, v), input = keys();
      w.drive = d;
      input.held.add(key);
      let lo = Infinity, hi = 0;
      run(w, d, input, 1.1, () => {
        if (v.x < c0 * TILE || v.x > (c1 + 1) * TILE) return;
        lo = Math.min(lo, v.body.bounds.min.y);
        hi = Math.max(hi, v.body.bounds.max.y);
      });
      assert.ok(!d.dead && v.x > (c1 + 2) * TILE, `${key} at col ${c0}: alive and past it`);
      assert.ok(hi > 0 && hi <= down * TILE && lo >= up * TILE, `its flanks between ${lo.toFixed(1)} and ${hi.toFixed(1)}`);
    }
    assert.ok(up < C.lanes[0] && down > C.lanes[1]);
  }
});

test('kerb: where the fronts step in toward the road ahead of him, he is brought back inside their line: never nose-on into the corner', () => {
  // along the sidewalk behind the parking row of our side, whose block is a row back (the next one's corner at col
  // 109), hands off and steered into the fronts; off the road onto the market and held down against its front (its end at col 355;
  // what is torn down over him there does not stop him)
  for (const [col, row, corner, line, how, hold] of [[94, 18.02, 109, 18, [null, 'KeyD'], 9], [324, C.van[1], 355, 18, ['KeyD'], 9]]) {
    for (const key of how) {
      const w = world((col - 8) * TILE, (corner + 14) * TILE), v = convertible(w, col * TILE, row * TILE);
      const d = new Drive(w, { ...C, arms: null, events: [], end: null, van: [col, row] }, v), input = keys();
      w.drive = d;
      if (key) input.held.add(key);
      let flank = 0;
      let deep = 0;
      run(w, d, input, 2.4, () => {
        if (w.time > hold) input.held.clear();
        deep = Math.max(deep, v.body.bounds.max.y);
        if (!flank && v.body.bounds.max.x > corner * TILE) flank = v.body.bounds.max.y;
      });
      assert.ok(deep > line * TILE + 8, `past the line of the corner before it (${deep.toFixed(1)})`);
      assert.ok(!d.dead, `col ${corner}, ${key || 'hands off'}: alive (at ${(v.x / TILE).toFixed(1)}, ${(v.y / TILE).toFixed(2)})`);
      assert.ok(flank > 0 && flank <= line * TILE, `col ${corner}, ${key}: its flank at ${flank.toFixed(1)} as its nose passes the corner (${line * TILE}); now at ${(v.x / TILE).toFixed(1)}, ${(v.y / TILE).toFixed(2)}, ${d.v.toFixed(1)} px/step`);
      assert.ok(v.x > (corner + 6) * TILE, 'and running on');
    }
  }
  assert.ok(CHASE.frontAhead * TILE > 3 * TILE / CHASE.steer * C.cruise, 'seen early enough to cross three metres at full lock');
});

test('kerb: the building fronts either side of the car: a window or a door is the front, an opening is not (pure)', () => {
  const map = new TileMap(['XXGXX~~XX', 'sssssssss', '=========', 'sssssssss', 'XXLXX__XX', 'XXXXX__XX']);
  assert.deepEqual(frontsAt(map, 0, 2), [TILE, 4 * TILE], 'walls: the bottom of the one above, the top of the one below');
  assert.deepEqual(frontsAt(map, 2, 2), [TILE, 4 * TILE], 'a window above, a door below: set back in the front, they are it');
  assert.deepEqual(frontsAt(map, 5, 2), [0, 6 * TILE], 'a lot above, an alley below: their far ends (the map\'s edge here)');
  assert.deepEqual(frontsAt(map, 5, 2, 2), [-Infinity, Infinity], 'none within reach');
  assert.equal(frontsAt(map, 0, 0), null, 'in a wall: none');
});
