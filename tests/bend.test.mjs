// The chase's route (systems/Route.js, docs/LEVEL2.md "Legs and scripted bends"): straight legs along +x, each with
// its lanes (two or more), and the scripted bends between them (level 2A's detour: works shut the street, the script
// takes the car right down the side street and left onto leg 1). Drive and Pursuit through it on the real map.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { load } from './setup.mjs';
import { ctx, quiet } from './helpers.mjs';

// no DOM under Node: what the cars paint on themselves goes nowhere
globalThis.document ??= { createElement: () => ({ width: 0, height: 0, getContext: () => ctx }) };

const { legsOf, legAt, routeOf, along, bendStep, enterBend, blocksAll, bandOf, nearestLane } = await load('game/systems/Route.js');
const { default: Drive } = await load('game/systems/Drive.js');
const { default: Pursuit, lanesOf } = await load('game/systems/Pursuit.js');
const { CHASE } = await load('game/data/chase.js');
const { WEAPONS } = await load('game/data/weapons.js');
const { VEHICLES, default: Vehicle } = await load('game/entities/Vehicle.js');
const { default: TileMap } = await load('game/world/TileMap.js');
const { default: PhysicsWorld } = await load('engine/physics/PhysicsWorld.js');
const { default: EventBus } = await load('engine/EventBus.js');
const { setMaterial, scaleInertia } = await load('engine/physics/Body.js');
const { TILE, CAT, MASK } = await load('game/Config.js');
const { angDiff } = await load('engine/math.js');
const { default: level2a } = await load('game/data/levels/level2a.js');
const { default: lab } = await load('game/data/levels/lab.js');

const { Bodies } = Matter;
const DT = 1 / 60;
const SIZE = { pursuer: [140, 58], convertible: [172, 64], van: [160, 64] };
const C = level2a.chase, B = C.bends[0];

function vehicle(w, model, x, y, a = 0) {
  const v = Object.create(Vehicle.prototype), m = VEHICLES[model], [W, H] = SIZE[model];
  const body = Bodies.rectangle(x, y, W - 4, H - 4, {
    angle: a, frictionAir: 0.02, friction: 0.6, restitution: 0.05, label: 'vehicle',
    collisionFilter: { category: CAT.PROP, mask: MASK.PROP },
  });
  setMaterial(body, m.kg, 0.9);
  scaleInertia(body, 3);
  body.material = 'metal';
  body.entity = v;
  Object.assign(v, {
    world: w, type: model, m, k: 1, w: W, h: H, body, isVehicle: true, g: ctx, glassPx: { wind: [], rear: [] },
    windows: { wind: 0, rear: 0 }, tires: [true, true, true, true], lamps: [true, true, true, true], hp: m.hp, fuel: 0,
    puddle: 0, alarm: 0, lit: true, flash: 0, moving: false, dead: false, exploded: false, burning: false, rider: null,
    hat: false, gun: false, drawn: null, def: { static: true, hp: m.hp, vault: true },
  });
  w.physics.add(body);
  w.physics.freezeIfHeavy(body);
  w.props.push(v);
  return v;
}

Pursuit.prototype.spawn = function (x, y, a, state, speed = 0, style = undefined, miss = false) {
  const car = this.add(vehicle(this.world, 'pursuer', x, y, a), state, { speed, style, miss });
  if (state !== 'wait') this.loose(car);
  return car;
};

// just enough of World for the chase on the real map of level 2A
function world() {
  const events = new EventBus(), physics = new PhysicsWorld({ events, muAt: () => 1, substeps: 2 });
  const map = new TileMap(level2a.tiles);
  physics.add(map.buildBodies());
  const body = Bodies.circle(64, 64, 10);
  physics.add(body);
  const w = {
    map, physics, events, chars: [], props: [], corpses: [], projectiles: [], texts: [], time: 0, beats: [],
    particles: quiet, killed: null, kills: [], exited: false, cleared: false, drive: null, totalEnemies: 0, game: { onExit() {} },
    addBody: (b) => physics.add(b), removeBody: (b) => physics.remove(b), sound() {}, shake() {}, noise() {}, light() {},
    addDebris() {}, flashGlass() {}, addProjectile(p) { w.projectiles.push(p); },
    onKill(ch, cause, killer) { w.killed = { ch, cause, killer }; },
  };
  w.player = {
    body, alive: true, hidden: false, angle: 0, isPlayer: true, team: 'player', reloading: 0, reloadDur: 1, world: w,
    weapon: { type: 'uzi', mag: 30 }, ammo: {}, get x() { return body.position.x; }, get y() { return body.position.y; },
    get def() { return WEAPONS[this.weapon ? this.weapon.type : 'fists']; },
    setWeapon(type, mag) { this.weapon = type ? { type, mag } : null; },
    kill(a, cause, killer) { this.alive = false; w.onKill(this, cause, killer); },
  };
  w.chars.push(w.player);
  events.on('kill', (e) => w.kills.push(e));
  events.on('chaseBend', (e) => w.beats.push(e.phase));
  return w;
}

const keys = () => { const held = new Set(), pressed = new Set(); return { held, pressed, down: (c) => held.has(c), hit: (c) => pressed.delete(c), mouseHit: () => false, mouseDown: () => false }; };

// his convertible on the street at col, row at cruise, the pursuit of the chase (no events, no opening)
function start(col, row = C.lanes[1]) {
  const w = world(), v = vehicle(w, CHASE.vehicle, col * TILE, row * TILE);
  const chase = { ...C, events: [], intro: null, arms: null, water: null };
  w.drive = new Drive(w, { ...chase, van: [col, row] }, v);
  w.pursuit = new Pursuit(w, chase);
  return { w, v, d: w.drive, P: w.pursuit, input: keys() };
}

function run(s, sec, each = null) {
  const { w, d, P, input } = s;
  for (let t = 0; t < sec; t += DT) {
    w.time += DT;
    d.step(DT, input, null);
    P.step(DT);
    w.physics.step(DT, w.time);
    d.after(DT);
    P.after(DT);
    if (each?.() === true) return true;
  }
  return false;
}

// ---------------------------------------------------------------- pure
test('route: no legs is one leg from the chase\'s own lanes, middle and cruise (the chase before legs)', () => {
  const [L] = legsOf({ lanes: [14.75, 12.25], mid: 13, cruise: 7, kerbs: [9, 16], across: [[50, 57, 8, 18]] });
  assert.deepEqual([L.from, L.to, L.lanes, L.mid, L.cruise, L.kerbs, L.across], [-Infinity, Infinity, [12.25, 14.75], 13, 7, [9, 16], [[50, 57, 8, 18]]]);
  assert.equal(legsOf({ lanes: [10, 12] })[0].mid, 11, 'no middle: the lanes\'');
  assert.equal(legsOf({})[0].lanes, null, 'the lab: no lanes');
  assert.equal(legsOf({})[0].cruise, CHASE.cruise);
  // with legs: each its own, the chase's `across` on all of them
  const legs = legsOf(C);
  assert.equal(legs.length, C.legs.length);
  assert.ok(legs.length >= 2);
  assert.deepEqual(legs[0].lanes, C.lanes, 'the street is the first leg');
  assert.ok(legs[1].lanes[0] > C.kerbs[1] + 20, 'leg 1 well below it');
  assert.ok(legs.every((L) => C.across.every((a) => L.across.some((b) => b === a))));
});

test('route: the leg a point is on, by its column (the last one starting at or before it)', () => {
  const legs = legsOf(C);
  assert.equal(legAt(legs, 10 * TILE), 0);
  assert.equal(legAt(legs, (legs[1].from - 0.1) * TILE), 0);
  assert.equal(legAt(legs, legs[1].from * TILE), 1);
  assert.equal(legAt(legs, (C.end + 10) * TILE), legs.length - 1);
  assert.equal(legAt(legsOf({ lanes: [1, 2] }), -5000), 0, 'one leg: always it');
});

test('route: a bend ends on a lane of the leg it hands the car to, along +x; distances run on through it', () => {
  const R = routeOf(C), b = R.bends[0], L1 = R.legs[1];
  assert.equal(b.from, 0);
  assert.equal(b.to, 1);
  assert.ok(L1.lanes.includes(b.end.y / TILE), `ends on a lane (${b.end.y / TILE})`);
  assert.ok(Math.abs(b.path.at(b.length).a) < 1e-9, 'heading +x at its end');
  assert.ok(Math.abs(b.path.at(0).a) < 1e-9, 'and at its start');
  // a quarter turn right, then a quarter turn left (two corners rounded off by their radius)
  const a = b.path.at(b.length * 0.5).a;
  assert.ok(Math.abs(a - Math.PI / 2) < 1e-6, `down the side street half way (${a})`);
  assert.equal(R.legs[0].s0, 0);
  assert.equal(L1.s0, b.s0 + b.length);
  assert.equal(R.total, L1.s0 + (C.end * TILE - L1.x0));
  // continuous: in at its start, out at its end
  const K = CHASE.bend, x = b.x;
  assert.ok(Math.abs(along(R, x) - along(R, 0, b, K.pivot)) < 1e-9);
  assert.ok(Math.abs(along(R, b.end.x - K.pivot) - along(R, 0, b, b.length)) < 1e-9);
  // a bend's own speed and radius, else CHASE.bend's
  assert.equal(b.speed, CHASE.bend.speed);
  assert.ok(CHASE.bend.speed * CHASE.kmh > 34 && CHASE.bend.speed * CHASE.kmh < 46, 'a 90-degree corner at about 40 km/h');
});

test('route: lanes and their checks work with any number of lanes (a toll: four)', () => {
  const rows = [100, 180, 260, 340], band = [100, 340];
  assert.deepEqual(lanesOf(330, band, null, CHASE.pursuit, rows), { his: 340, other: 260 });
  assert.deepEqual(lanesOf(110, band, null, CHASE.pursuit, rows), { his: 100, other: 180 });
  assert.deepEqual(lanesOf(190, band, null, CHASE.pursuit, rows), { his: 180, other: 260 }, 'an inner lane: the other toward the middle');
  assert.deepEqual(lanesOf(250, band, null, CHASE.pursuit, rows), { his: 260, other: 180 });
  // (no flutter: he counts as in the next lane only C.flip px past the middle between the two)
  const was = lanesOf(180, band, null, CHASE.pursuit, rows);
  assert.equal(lanesOf(225, band, was, CHASE.pursuit, rows).his, 180);
  assert.equal(lanesOf(220 + CHASE.pursuit.flip + 1, band, was, CHASE.pursuit, rows).his, 260);
  assert.equal(lanesOf(340, band, was, CHASE.pursuit, rows).his, 340, 'two lanes over at once');
  // two lanes: as before
  assert.deepEqual(lanesOf(330, [100, 340]), { his: 340, other: 100 });
  // the band of a leg of four lanes: half a lane is half the space between two, not half the road
  const R = bandOf({ lanes: [40, 42.5, 45, 47.5] });
  assert.deepEqual(R.band, [40 * TILE, 47.5 * TILE]);
  assert.equal(R.half, 1.25 * TILE);
  const top = R.band[0] - R.half, bottom = R.band[1] + R.half, need = 64 + CHASE.aside.room;
  assert.ok(blocksAll(top + 20, bottom - 20, top, bottom, need), 'across all four: shut');
  assert.ok(!blocksAll(top + 40, top + 100, top, bottom, need), 'in the first lane: the three others are his');
  assert.ok(!blocksAll(R.band[0] + 80, R.band[0] + 140, top, bottom, need), 'in the middle of the road: a way past either side');
  assert.equal(nearestLane([40, 42.5, 45, 47.5], 44.2), 45);
});

test('route: through a bend by the script, its line kept to, the tail out in a turn (pure)', () => {
  const R = routeOf(C), b = R.bends[0];
  const st = enterBend(b, b.x, b.start.y, 0, CHASE.cruise);
  assert.ok(Math.abs(st.off0) < 1e-6 && Math.abs(st.p - CHASE.bend.pivot) < 4, 'in his lane: on the line from the start');
  let most = 0, slowest = Infinity, steps = 0;
  while (st.p < b.length && steps++ < 2000) {
    const pose = bendStep(st, b, DT);
    if (pose.q.turn) { most = Math.max(most, st.slip * pose.q.turn); slowest = Math.min(slowest, st.v); }
  }
  assert.ok(steps < 600, `through in ${(steps / 60).toFixed(1)} s`);
  assert.ok(most > 0.15 && most < 0.45, `the tail out, the turn's way (${most.toFixed(2)} rad)`);
  assert.ok(Math.abs(slowest - b.speed) < 0.05, `the turns at its speed (${slowest})`);
  // from the other lane it is brought onto the line, not jumped onto it
  const st2 = enterBend(b, b.x, C.lanes[0] * TILE, 0, CHASE.cruise), p0 = bendStep(st2, b, DT);
  assert.ok(Math.abs(p0.y - C.lanes[0] * TILE) < 3, `still in its lane as it comes in (${p0.y})`);
});

// ---------------------------------------------------------------- his car
test('bend: at its column the script drives him round, on its line, out on the next leg\'s lane heading +x', () => {
  const s = start(B.at - 14), { d, v, w } = s, b = d.route.bends[0], K = CHASE.bend;
  let off = 0, inBend = 0, slip = 0, back = 0, prev = d.along;
  // (he holds the wheel over all the way: nothing of it counts in the bend)
  s.input.held.add('KeyW');
  const out = run(s, 8, () => {
    if (d.bend) {
      inBend++;
      const st = d.bend, q = b.path.at(st.p), fx = v.x + Math.cos(v.body.angle) * K.pivot, fy = v.y + Math.sin(v.body.angle) * K.pivot;
      if (st.p - st.p0 > K.merge) off = Math.max(off, Math.hypot(fx - q.x, fy - q.y));
      slip = Math.max(slip, Math.abs(d.slip));
    }
    back = Math.max(back, prev - d.along);
    prev = d.along;
    return inBend > 0 && !d.bend;
  });
  s.input.held.clear();
  assert.ok(out, 'through it');
  assert.ok(inBend > 60, `the script had the wheel ${inBend} steps`);
  assert.ok(off < 6, `on its line within ${off.toFixed(1)} px`);
  assert.ok(slip > 0.12, `the tail out (${slip.toFixed(2)})`);
  assert.ok(back < 0.5, `the route's distance never goes back (${back.toFixed(2)})`);
  assert.deepEqual(w.beats.slice(0, 4), ['in', 'turn', 'turn', 'out'], 'told: in, each turn, out');
  assert.equal(d.legI, 1);
  const lane = C.legs[1].lanes[1] * TILE;
  assert.ok(Math.abs(v.y - lane) < 6, `out on his lane of the next leg (${(v.y / TILE).toFixed(2)})`);
  assert.ok(Math.abs(angDiff(0, v.body.angle)) < 0.35, 'heading +x');
  // the wheel his again: it settles, the leg's cruise picked up
  run(s, 2);
  assert.ok(Math.abs(angDiff(0, v.body.angle)) < 0.02 && Math.abs(v.y - lane) < 6, `straight in his lane (${v.body.angle.toFixed(3)})`);
  assert.ok(Math.abs(d.v - C.legs[1].cruise) < 0.3, `its cruise (${d.v.toFixed(2)})`);
  assert.equal(w.killed, null, 'alive');
  s.input.held.add('KeyW');
  run(s, 0.5);
  assert.ok(v.y < lane - 30, 'he steers again');
});

test('bend: in from the other lane, it is brought onto the line, never into the wall', () => {
  const s = start(B.at - 14, C.lanes[0]), { d, v, w } = s;
  let seen = false;
  run(s, 8, () => { seen ||= !!d.bend; return seen && !d.bend; });
  assert.ok(seen && d.legI === 1 && w.killed === null);
  assert.ok(Math.abs(v.y - C.legs[1].lanes[1] * TILE) < 6);
});

test('bend: the camera is never turned, on whole px, never jumps a step; it follows him round and settles on the next leg\'s middle', () => {
  const s = start(B.at - 20), { d, v } = s, z = 3, viewW = 640;
  let was = d.frame(viewW, z), most = 0, followed = false;
  run(s, 9, () => {
    const f = d.frame(viewW, z);
    assert.ok(Math.abs(f.x * z - Math.round(f.x * z)) < 1e-6 && Math.abs(f.y * z - Math.round(f.y * z)) < 1e-6, 'on the px grid');
    most = Math.max(most, Math.hypot(f.x - was.x, f.y - was.y));
    if (d.bend && f.y > C.lanes[1] * TILE + 200) followed = true;
    was = f;
    return d.legI === 1 && v.x > (C.legs[1].to - 2) * TILE; // (to the merge: the next leg's framing from there)
  });
  const step = CHASE.cruise + CHASE.bend.camera.most * Math.SQRT2 + 2 / z;
  assert.ok(most <= step, `${most.toFixed(1)} px a step at most (${step.toFixed(1)})`);
  assert.ok(followed, 'down the side street with him');
  assert.equal(d.legI, 1);
  assert.equal(d.camOff, null, 'back to the leg\'s own framing');
  const f = d.frame(viewW, z);
  assert.equal(f.y, C.legs[1].mid * TILE, 'on leg 1\'s middle');
  assert.ok(Math.abs(f.x - v.x - viewW * (0.5 - CHASE.camera.at)) < 2, 'a third from the left again');
});

test('bend: the HUD\'s road counts along the route; the end of the last leg ends the level', () => {
  const s = start(B.at - 6), { d, w } = s;
  let exits = 0, last = 0;
  w.game.onExit = () => exits++;
  run(s, 30, () => {
    const pr = d.progress;
    assert.ok(pr.s >= last - 1e-9, 'never back');
    last = pr.s;
    return w.exited;
  });
  assert.equal(exits, 1);
  assert.ok(d.progress.s >= d.progress.total - CHASE.cruise - 1, `at the end (${d.progress.s.toFixed(0)} of ${d.progress.total.toFixed(0)})`);
  assert.ok(d.progress.total > (C.end - B.at + 6) * TILE, 'longer than the columns: the bend\'s line counts');
});

// ---------------------------------------------------------------- the pursuers
test('bend: pursuers follow him round on the same line, behind him in order, and take their slots again on leg 1', () => {
  const s = start(B.at - 16), { d, v, P } = s;
  const a = P.spawn(v.x - 260, C.lanes[0] * TILE, 0, 'chase', CHASE.cruise);
  const b = P.spawn(v.x - 480, C.lanes[1] * TILE, 0, 'chase', CHASE.cruise);
  P.assign = function () { for (const c of this.cars) { c.slot = 'abreast'; c.rank = 0; } }; // (behind him: they come up)
  P.busy = () => true; // (no attacks: the line is what is looked at)
  const order = [], took = new Set();
  run(s, 12, () => {
    for (const c of [a, b]) if (c.bend) took.add(c);
    for (const c of [a, b]) if (!c.bend && took.has(c) && !order.includes(c)) order.push(c);
    return order.length === 2 && run(s, 1.5) !== null;
  });
  assert.equal(took.size, 2, 'both took the bend');
  assert.deepEqual(order, [a, b], 'out in the order they went in');
  for (const c of [a, b]) {
    assert.equal(c.state, 'chase', 'nothing wrecked');
    assert.equal(legAt(d.route.legs, c.v.x), 1, 'on leg 1');
    assert.ok(c.v.y > C.legs[1].lanes[0] * TILE - 60 && c.v.y < C.legs[1].lanes[1] * TILE + 60, `on its road (${(c.v.y / TILE).toFixed(1)})`);
  }
  assert.equal(s.w.killed, null);
});

test('bend: no pursuer drives into him in the bend: the one ahead of him goes through first, the others keep their distance', () => {
  const s = start(B.at - 16), { d, v, P } = s;
  const ahead = P.spawn(v.x + 240, C.lanes[1] * TILE, 0, 'chase', CHASE.cruise);
  const abreast = P.spawn(v.x, C.lanes[0] * TILE, 0, 'chase', CHASE.cruise);
  P.assign = function () { ahead.slot = 'ahead'; abreast.slot = 'abreast'; };
  P.busy = () => true;
  let near = Infinity, first = null;
  run(s, 12, () => {
    if (d.bend) {
      for (const c of [ahead, abreast]) {
        if (c.bend?.b === d.bend.b && Math.abs(c.bend.p - d.bend.p) < 400) near = Math.min(near, Math.abs(c.bend.p - d.bend.p));
      }
    }
    if (!first && ahead.bend === null && abreast.bendI !== 0 && d.legI === 1 && !d.bend) first = 'done';
    return !d.bend && d.legI === 1 && !ahead.bend && !abreast.bend && abreast.bendI === -1;
  });
  assert.ok(near >= CHASE.bend.space * 0.6, `kept apart on the line (${near.toFixed(0)} px)`);
  assert.ok(ahead.v.x > v.x, 'the one ahead came out ahead of him');
  assert.ok(abreast.v.x < v.x || abreast.v.y < v.y - 40, 'the other one behind him or beside him');
  assert.equal(s.w.killed, null);
});

test('bend: a pursuer with `miss` does not take it: on into the works', () => {
  const s = start(B.at - 30), { v, P } = s;
  const car = P.spawn(v.x + 400, C.lanes[0] * TILE, 0, 'chase', CHASE.cruise, 'gunner', true);
  run(s, 3, () => car.v.x > (B.at + 10) * TILE);
  assert.ok(!car.bend && car.bendI === -1, 'past it, never in it');
});

test('lab: station 36 BEND, a car of its own route to drive round a bend', () => {
  const car = lab.props.find(([t, , , , o]) => o?.route);
  assert.ok(car && car[4].drive, 'a car to get into');
  const R = lab.routes?.[car[4].route];
  assert.ok(R?.legs?.length === 2 && R.bends?.length === 1, 'its legs and its bend');
  assert.ok(lab.floor.some(([n]) => n === 'label_bend'), 'its label');
  const map = new TileMap(lab.tiles), r = routeOf({ ...R, van: [car[1], car[2]] });
  for (let s = 0; s <= r.bends[0].length; s += 8) {
    const q = r.bends[0].path.at(s);
    assert.ok(!map.isSolid(Math.floor(q.x / TILE), Math.floor(q.y / TILE)), `its line on the floor (${(q.x / TILE).toFixed(1)}, ${(q.y / TILE).toFixed(1)})`);
  }
  assert.equal(legAt(r.legs, car[1] * TILE), 0, 'the car on its first leg');
});
