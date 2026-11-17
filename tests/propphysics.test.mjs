import { test } from 'node:test';
import assert from 'node:assert/strict';
import { load } from './setup.mjs';

// no DOM under Node: entities only need canvases to exist, nothing is looked at here
const ctx = new Proxy({}, { get: (t, k) => t[k] ?? (() => ctx), set: (t, k, v) => { t[k] = v; return true; } });
globalThis.document = { createElement: () => ({ width: 0, height: 0, getContext: () => ctx }) };

const { Bodies, Body } = Matter;
const { default: PhysicsWorld } = await load('engine/physics/PhysicsWorld.js');
const { default: EventBus } = await load('engine/EventBus.js');
const { setMaterial, setShapeInertia, setKg, kgOf, impulse } = await load('engine/physics/Body.js');
const { push, contactOf } = await load('engine/physics/Push.js');
const { G } = await load('engine/physics/Units.js');
const { default: TileMap } = await load('game/world/TileMap.js');
const { default: Prop } = await load('game/entities/Prop.js');
const { default: PropPhysics } = await load('game/systems/PropPhysics.js');
const { default: Tipping } = await load('game/systems/Tipping.js');
const { gripOn } = await load('game/data/materials.js');
const { LIQUIDS } = await load('game/data/liquids.js');
const { SCUFF } = await load('game/data/physics.js');
const { PHYSICS, PLAYER, CAT, MASK } = await load('game/Config.js');

const DT = 1 / 60;
const ROWS = ['X'.repeat(40), ...Array(28).fill('X' + '.'.repeat(38) + 'X'), 'X'.repeat(40)];

// just enough of World for props, characters and PropPhysics: a real physics world on one kind of floor
function world(floor = 'wood', wet = 1) {
  const quiet = new Proxy({}, { get: () => () => {} });
  const w = {
    map: new TileMap(ROWS), events: new EventBus(), time: 0, particles: quiet, smoke: quiet, liquids: null,
    props: [], debris: [], chars: [], enemies: [], timers: [], marks: [],
    decals: { paint(fn) { const g = { beginPath() {}, moveTo() {}, stroke() {}, lineTo() { w.marks.push(1); } }; fn(g); }, smear() {} },
    floorAt: () => floor,
    floorGrip: (x, y, b) => gripOn(floor, b?.feet) * wet,
    addBody(b) { w.physics.add(b); }, removeBody(b) { w.physics.remove(b); },
    addDebris(d) { w.debris.push(d); }, removeDebris() {},
    shake() {}, light() {}, emit() {}, noise() {}, sound() {}, explode() {},
    after(sec, fn) { w.timers.push(fn); },
  };
  w.physics = new PhysicsWorld({ events: w.events, muAt: (x, y, b) => w.floorGrip(x, y, b), pushForce: PHYSICS.pushForce, substeps: PHYSICS.substeps });
  w.propPhysics = new PropPhysics(w);
  return w;
}
// a walker like Character: 80 kg, no spin, his velocity set every step (steer)
function walker(w, x, y) {
  const body = Bodies.circle(x, y, PLAYER.radius, { frictionAir: 0, friction: 0, frictionStatic: 0, restitution: 0,
    collisionFilter: { category: CAT.CHAR, mask: MASK.CHAR } });
  setKg(body, 80);
  Body.setInertia(body, Infinity);
  const c = { body, vel: { x: 0, y: 0 }, alive: true, radius: PLAYER.radius, isPlayer: true,
    get x() { return body.position.x; }, get y() { return body.position.y; } };
  body.entity = c;
  w.physics.add(body);
  w.chars.push(c);
  c.steer = (dx, dy, speed) => {
    const l = Math.hypot(dx, dy) || 1;
    c.vel.x += ((dx / l) * speed - c.vel.x) * PLAYER.accel; c.vel.y += ((dy / l) * speed - c.vel.y) * PLAYER.accel;
    Body.setVelocity(body, c.vel);
  };
  return c;
}
function frame(w, drive) {
  w.time += DT;
  drive?.();
  w.propPhysics.prePush(DT);
  w.physics.step(DT, w.time);
  w.propPhysics.update(DT);
  while (w.timers.length) w.timers.shift()();
}
function prop(w, type, x = 640, y = 480, angle = 0) { const p = new Prop(w, type, x, y, angle); w.props.push(p); return p; }
const run = (w, s, drive) => { for (let i = 0; i < Math.round(s / DT); i++) frame(w, drive); };
const speed = (b) => Body.getSpeed(b);

test('push: under its breakaway force a resting body holds and holds the pusher; over it, it gives', () => {
  const phys = new PhysicsWorld({ muAt: () => 1 });
  const box = Bodies.rectangle(0, 0, 19, 19);
  phys.add(box);
  setMaterial(box, 45, 0.5);
  setShapeInertia(box);
  box.stick = 1.35;
  const holds = 1.35 * 0.5 * 45 * G;
  const c = contactOf(-20, 0, 10, box);
  assert.ok(c && Math.abs(c.nx - 1) < 1e-6, 'touching it square');
  assert.equal(push(box, c, 2, holds * 0.95, DT, 0.5), 0, 'he is stopped');
  assert.equal(speed(box), 0);
  const keep = push(box, c, 2, holds * 1.1, DT, 0.5);
  assert.ok(speed(box) > 0 && keep > 0 && keep < 2, 'it gives, slowly: he follows it');
});

test('push: the same push gets a heavy prop going slower than a light one, and never to the pusher\'s speed at once', () => {
  const after = (type) => {
    const w = world(), p = prop(w, type), c = walker(w, 640 - 40, 480);
    let first = null;
    run(w, 0.5, () => { c.steer(1, 0, PLAYER.speed); if (first === null && speed(p.body) > 0) first = speed(p.body); });
    return { v: speed(p.body), first, c: speed(c.body) };
  };
  const chair = after('chair'), keg = after('keg');
  assert.ok(keg.v < chair.v * 0.6, `keg ${keg.v} vs chair ${chair.v}`);
  assert.ok(chair.first < PLAYER.speed * 0.6, 'a light chair is not handed his whole speed in one step');
  assert.ok(Math.abs(keg.c - keg.v) < 0.3, 'he is held to the speed of what he pushes');
});

test('push: off its centre it turns it', () => {
  const w = world(), p = prop(w, 'crate'), c = walker(w, 640 - 40, 480 + 7);
  run(w, 0.5, () => c.steer(1, 0, PLAYER.speed));
  assert.ok(Math.abs(p.body.angle) > 0.2, `turned ${p.body.angle} rad`);
});

test('sliding: carpet < wood < tile, and a wet floor slides furthest', () => {
  const slide = (floor, wet = 1) => {
    const w = world(floor, wet), p = prop(w, 'chair');
    Body.setVelocity(p.body, { x: 1.6, y: 0 }); // 3 m/s
    run(w, 4);
    return p.x - 640;
  };
  const carpet = slide('carpet_red'), wood = slide('wood'), tile = slide('tile_blue'), wet = slide('tile_blue', LIQUIDS.kinds.beer.grip);
  assert.ok(carpet < wood && wood < tile && tile < wet, `${carpet} ${wood} ${tile} ${wet}`);
});

test('blows: a light prop flies, a heavy one is nudged, and a blow beats a slow push of the same length', () => {
  const struck = (type) => {
    const w = world(), p = prop(w, type);
    p.hit(1, p.x - 8, p.y, 0, 2.5, 'blunt', { heft: 2 });
    return speed(p.body);
  };
  assert.ok(struck('chair') > struck('keg') * 5);
  const w = world(), p = prop(w, 'chair'), c = walker(w, 640 - 21, 480);
  c.vel.x = PLAYER.speed * 0.4;
  Body.setVelocity(c.body, c.vel);
  w.propPhysics.prePush(DT); // one step of leaning on it
  assert.ok(struck('chair') > speed(p.body) * 3);
});

test('rolling: a can lying on its side rolls on across its length, and drags along it', () => {
  const roll = (a) => {
    const w = world('concrete'), p = prop(w, 'trash_can');
    p.hit(1, p.x - 7, p.y, 0, 2.5, 'blunt'); // knocked over along +x: lying along x
    while (w.timers.length) w.timers.shift()();
    const b = p.body, x0 = b.position.x, y0 = b.position.y;
    Body.setVelocity(b, { x: Math.cos(a + b.angle) * 1.6, y: Math.sin(a + b.angle) * 1.6 });
    run(w, 6);
    return Math.hypot(b.position.x - x0, b.position.y - y0);
  };
  const across = roll(Math.PI / 2), along = roll(0);
  assert.ok(across > along * 3, `across ${across} along ${along}`);
});

test('settling: a shoved prop comes to rest and stays there', () => {
  const w = world(), p = prop(w, 'crate'), q = prop(w, 'chair', 660, 480);
  impulse(p.body, 0.3, kgOf(p.body) * 3, 0.2);
  run(w, 3);
  const at = { ...p.body.position }, a = p.body.angle, b = { ...q.body.position };
  run(w, 5);
  assert.equal(speed(p.body), 0);
  assert.ok(Math.hypot(p.body.position.x - at.x, p.body.position.y - at.y) < 0.01 && Math.abs(p.body.angle - a) < 1e-4, 'no drift');
  assert.ok(Math.hypot(q.body.position.x - b.x, q.body.position.y - b.y) < 0.01);
});

test('scuffs: dragged back and forth over the same boards, it marks them faintly and never piles up', () => {
  const w = world(), p = prop(w, 'crate'), cells = new Map();
  w.decals.paint = (fn) => fn({ beginPath() {}, stroke() {}, moveTo() {}, lineTo(x, y) {
    const k = `${Math.floor(x / SCUFF.cell)},${Math.floor(y / SCUFF.cell)}`;
    cells.set(k, (cells.get(k) ?? 0) + 1);
  } });
  for (let i = 0; i < 12; i++) {
    Body.setVelocity(p.body, { x: (i % 2 ? -1 : 1) * 2, y: 0 });
    run(w, 1);
  }
  assert.ok(cells.size > 4, 'it left marks');
  assert.ok(Math.max(...cells.values()) <= SCUFF.cap + 2, 'never a blob'); // a stroke may end in the next cell
  const light = world(), chair = prop(light, 'bin_bag');
  Body.setVelocity(chair.body, { x: 2, y: 0 });
  run(light, 1);
  assert.equal(light.marks.length, 0, 'a soft bag leaves none');
});

test('pushes still count as bumps: a street bin run into goes over', () => {
  const w = world('sidewalk');
  w.tipping = new Tipping(w);
  const p = prop(w, 'trash_can'), c = walker(w, 640 - 60, 480);
  c.vel.x = PLAYER.speed;
  run(w, 0.6, () => c.steer(1, 0, PLAYER.speed));
  assert.ok(p.tipped);
});
