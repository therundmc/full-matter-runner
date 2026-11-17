import { test } from 'node:test';
import assert from 'node:assert/strict';
import { load } from './setup.mjs';

const { TILE } = await load('game/Config.js');
const { default: EventBus } = await load('engine/EventBus.js');
const { default: Litter } = await load('game/systems/Litter.js');
const { default: Clutter } = await load('game/systems/Clutter.js');
const { LITTER, LITTER_AIR } = await load('game/data/litter.js');
const { OPTIONAL_LIST } = await load('engine/Assets.js');
const { PROPS } = await load('game/data/props.js');
const { default: TileMap } = await load('game/world/TileMap.js');
const { default: level1 } = await load('game/data/levels/level1.js');

const { Bodies, Body } = Matter;
// someone at (x, y) going at (vx, vy) px/step
function mover(x, y, vx = 0, vy = 0) {
  const body = Bodies.circle(x, y, 10);
  Body.setVelocity(body, { x: vx, y: vy });
  return { x, y, alive: true, body, angle: Math.atan2(vy, vx) };
}

// a world of open floor (a wall from the 20th column on) that records what the litter does
function stub() {
  const log = { glass: 0, sounds: [], spills: [] };
  const world = {
    events: new EventBus(), time: 0, player: mover(-500, -500), enemies: [], civilians: [],
    map: { isSolid: (cx) => cx >= 20 },
    particles: { glass: () => log.glass++, drops() {}, chips() {}, dust() {}, floaters() {}, shard() {} },
    sound: (name) => log.sounds.push(name),
    debris: [], addDebris() {},
  };
  world.events.on('spill', (s) => log.spills.push(s));
  return { world, log };
}
const run = (world, sys, sec) => { for (let i = 0; i < sec * 60; i++) { world.time += 1 / 60; sys.update(1 / 60); } };
const flying = (l) => l.list.filter((p) => p.z > 0).length;

test('litter: the level lays known things on open floor, no more than it may hold, every look painted', () => {
  assert.ok(level1.litter.length >= 30 && level1.litter.length <= LITTER_AIR.max, `${level1.litter.length} pieces`);
  for (const [, d] of Object.entries(LITTER)) for (const s of d.sprites) assert.ok(OPTIONAL_LIST.includes('clutter/' + s), s);
  const map = new TileMap(level1.tiles);
  const bills = level1.litter.filter(([k]) => k === 'bill');
  assert.ok(bills.length >= 25, `${bills.length} bills on the VIP room's floor`);
  for (const [kind, col, row, , look] of level1.litter) {
    assert.ok(LITTER[kind] && look < LITTER[kind].sprites.length, kind);
    assert.ok(!map.isSolid(Math.floor(col), Math.floor(row)), `${kind} at ${col},${row} in a wall`);
    // never under the round furniture it is thrown round (the stage, the low table)
    for (const [type, pc, pr] of level1.props) {
      const d = PROPS[type];
      if (d?.r && !d.hung && !d.overhead && type !== 'dance_stage') assert.ok(Math.hypot(col - pc, row - pr) >= d.r / TILE, `${kind} under the ${type}`);
      if (type === 'dance_stage') assert.ok(Math.hypot(col - pc, row - pr) >= 24 / TILE, `${kind} at ${col},${row} under the stage`);
    }
  }
});

test('litter: bounded - past its count nothing more is laid, a drop says how many it laid', () => {
  const { world } = stub();
  const l = new Litter(world, [], LITTER, { ...LITTER_AIR, max: 5 });
  for (let i = 0; i < 4; i++) assert.ok(l.add('bill', 100 + i * 10, 100));
  assert.equal(l.drop('bill', 200, 100, 3, 0, 60), 1, 'room for one more');
  assert.equal(l.add('bill', 300, 100), null);
  assert.equal(l.list.length, 5);
});

test('litter: someone running through the bills kicks them up, they flutter down and settle; walking only scuffs', () => {
  const { world, log } = stub();
  const l = new Litter(world, [['bill', 5, 5, 0, 0], ['bill', 5.2, 5, 0, 1], ['flute', 5, 5.25, 0, 0]]);
  const [a, b, flute] = l.list;
  run(world, l, 1);
  assert.equal(l.moving, 0, 'nothing stirs them');
  world.player = mover(a.x - 4, a.y, 0.5, 0);
  run(world, l, 0.05);
  assert.equal(flying(l), 0, 'walking: nothing flies');
  world.player = mover(a.x - 4, a.y + 2, 3, 0);
  l.update(1 / 60);
  assert.ok(a.moving && b.moving && a.vx > 20, 'kicked along his run');
  run(world, l, 0.1);
  assert.ok(a.z > 0 && b.z > 0, 'up in the air');
  assert.ok(flute.moving && flute.z === 0, 'the flute only slides');
  assert.ok(log.sounds.includes('cashFlutter') && log.sounds.includes('fluteClink'));
  world.player = mover(-500, -500);
  run(world, l, 6);
  assert.equal(l.moving, 0, 'settled');
  assert.ok(l.list.every((p) => p.z === 0 && !p.vx && !p.vy));
  assert.ok(a.x > 5 * TILE + 5, 'carried on along his way');
});

test('litter: a round passing close lifts the bills along its way, one far off stays; a flute in its way bursts', () => {
  const { world, log } = stub();
  const l = new Litter(world, [['bill', 5, 5], ['bill', 5, 7], ['flute', 8, 5]]);
  const [near, far, flute] = l.list;
  // from the west along row 5, 4 px north of the first bill, straight through the flute
  world.events.emit('round', { x0: 2 * TILE, y0: near.y - 4, x1: 9 * TILE, y1: near.y - 4 });
  assert.ok(near.moving && near.vz > 0 && near.vx > 0, 'lifted, along the round');
  assert.equal(far.moving, false);
  world.events.emit('round', { x0: 7 * TILE, y0: flute.y, x1: 9 * TILE, y1: flute.y });
  assert.ok(flute.dead && log.glass > 0 && log.sounds.includes('fluteShatter') && log.spills.length === 1, 'burst');
  run(world, l, 0.2);
  assert.ok(near.z > 0);
  assert.equal(l.list.length, 2, 'the broken flute is let go');
  run(world, l, 6);
  assert.equal(l.moving, 0, 'settled');
  assert.equal(near.z, 0);
});

test('litter: the blast at a muzzle blows the bills before it, an explosion throws everything', () => {
  const { world } = stub();
  const l = new Litter(world, [['bill', 5, 5], ['bill', 5.5, 5], ['ashtray', 6, 5], ['bill', 15, 5]]);
  const [a, b, ash, far] = l.list;
  world.events.emit('shot', { shooter: mover(a.x - LITTER_AIR.ahead, a.y), weapon: {} });
  assert.ok(a.moving && b.moving && a.vz > 0, 'blown up');
  assert.equal(ash.moving, false, 'too heavy for it');
  world.events.emit('explosion', { x: ash.x - 10, y: ash.y, radius: 60 });
  assert.ok(ash.moving && ash.vx > 0 && !far.moving);
});

test('litter: banknotes knocked off the furniture land as bills on the floor, while there is room for them', () => {
  const { world, log } = stub();
  const floats = { n: 0 };
  world.particles.floaters = () => floats.n++;
  world.litter = new Litter(world, [], LITTER, { ...LITTER_AIR, max: 6 });
  const clutter = new Clutter(world);
  const table = { type: 'cocktail_table', x: 300, y: 300, W: 24, H: 24, dead: false, body: { angle: 0 } };
  clutter.attach(table, 'vip_table');
  world.events.emit('propFlipped', { prop: table, x: 300, y: 300, dirA: 0 });
  assert.equal(world.litter.list.length, 4, 'the stack of singles: four bills');
  assert.ok(world.litter.list.every((p) => p.z > 0 && p.moving), 'falling');
  assert.equal(floats.n, 0);
  assert.ok(log.spills.length === 0, 'the bucket pours where it lands, not before');
  const stage = { type: 'dance_stage', x: 500, y: 300, W: 48, H: 48, dead: false, body: { angle: 0 } };
  clutter.attach(stage, 'stage');
  world.events.emit('propDestroyed', { prop: stage, x: 500, y: 300, dirA: 0, power: 1 });
  assert.equal(world.litter.list.length, 6, 'full');
  assert.ok(floats.n > 0, 'the rest only flutter down');
});

test('litter: the hem of a curtain swinging over the bills fans them, a curtain at rest does not', () => {
  const { world } = stub();
  const l = new Litter(world, [['bill', 5, 5], ['bill', 7, 5]]);
  const [under, off] = l.list;
  // a cloth of two columns and two rows on a rod along y at (x0, y0): its hem swinging out along +x (n), fast
  const x0 = under.x - 3, y0 = under.y - 5;
  const cloth = { cfg: { sub: 1 / 120 }, R: 2, C: 2, s: [-5, 5, -5, 5], n: [0, 0, 3, 3], ps: [-5, 5, -5, 5], pn: [0, 0, 0, 0] };
  const curtain = { awake: false, x: x0, y: y0, ux: 0, uy: 1, prop: { def: { h: 32 } }, cloth };
  world.curtains = { list: [curtain] };
  l.update(1 / 60);
  assert.equal(l.moving, 0, 'asleep: nothing');
  curtain.awake = true;
  l.update(1 / 60);
  assert.ok(under.moving && under.vx > 0, 'fanned along the hem');
  assert.equal(off.moving, false);
});
