import { test } from 'node:test';
import assert from 'node:assert/strict';
import { load } from './setup.mjs';

const { POOL } = await load('game/Config.js');
const { default: EventBus } = await load('engine/EventBus.js');
const { default: PoolBalls } = await load('game/systems/PoolBalls.js');

function stub() {
  const table = { type: 'pool_table', x: 400, y: 300, dead: false, body: { angle: 0 } };
  const sounds = [];
  const world = { events: new EventBus(), props: [table], sound: (name) => sounds.push(name) };
  return { world, table, pool: new PoolBalls(world), sounds };
}
const run = (pool, sec) => { for (let i = 0; i < sec * 60; i++) pool.update(1 / 60); };
const live = (set) => set.filter((b) => !b.in);
const still = (set) => set.every((b) => !b.vx && !b.vy);
function sane(set) {
  const on = live(set);
  for (const b of on) assert.ok(Math.abs(b.x) <= POOL.half[0] - POOL.r + 1e-6 && Math.abs(b.y) <= POOL.half[1] - POOL.r + 1e-6, 'on the felt');
  for (let i = 0; i < on.length; i++) {
    for (let j = i + 1; j < on.length; j++) assert.ok(Math.hypot(on[i].x - on[j].x, on[i].y - on[j].y) > POOL.r * 2 - 0.2, 'no ball in another');
  }
}

test('pool: the balls wait where the rack put them, a stroke sends the cue ball into them, all come to rest on the felt', () => {
  const { world, table, pool } = stub();
  const set = pool.balls(table);
  assert.equal(set.length, POOL.rack.length);
  assert.ok(still(set));
  run(pool, 1);
  assert.deepEqual([set[1].x, set[1].y], [POOL.rack[1][0], POOL.rack[1][1]], 'nothing moves by itself');
  world.events.emit('poolStroke', { x: table.x + 300, y: table.y });
  assert.ok(still(set), 'too far: another table');
  world.events.emit('poolStroke', { x: table.x - 40, y: table.y });
  const v = Math.hypot(set[0].vx, set[0].vy);
  assert.ok(v >= POOL.stroke[0] && v <= POOL.stroke[1]);
  world.events.emit('poolStroke', { x: table.x - 40, y: table.y });
  assert.equal(Math.hypot(set[0].vx, set[0].vy), v, 'not while they roll');
  run(pool, 12);
  assert.ok(still(set));
  sane(set);
});

test('pool: head-on, the ball that is struck leaves with what the other carried, with a clack', () => {
  const { table, pool, sounds } = stub();
  const [a, b, ...rest] = pool.balls(table);
  for (const o of rest) o.in = true;
  Object.assign(a, { x: -8, y: 0, vx: 100, vy: 0 });
  Object.assign(b, { x: 0, y: 0 });
  run(pool, 0.2);
  assert.ok(b.vx > 50 && a.vx < 10);
  assert.deepEqual(sounds, ['clack']);
});

test('pool: a round in the table throws the balls along it, a body bumping it shakes them, a dead table has none', () => {
  const { world, table, pool } = stub();
  const set = pool.balls(table);
  world.events.emit('propHit', { prop: table, x: table.x - 30, y: table.y, dirA: 0, kind: 'bullet' });
  assert.ok(set.every((b) => b.vx > 0), 'thrown along the shot');
  run(pool, 12);
  assert.ok(still(set));
  sane(set);
  world.events.emit('impact', { a: { entity: table }, b: { position: { x: table.x, y: table.y + 60 } }, speed: 4, x: table.x, y: table.y + 22 });
  assert.ok(live(set).length && live(set).every((b) => b.vy < 0 || b.vx), 'pushed away from the bump');
  world.events.emit('propHit', { prop: { type: 'crate' }, x: 0, y: 0, dirA: 0 });
  table.dead = true;
  pool.update(1 / 60);
  assert.equal(pool.sets.size, 0);
});

test('pool: a ball sent at a pocket drops, the cue ball comes back for the next stroke and a cleared table is racked again', () => {
  const { world, table, pool, sounds } = stub();
  const set = pool.balls(table);
  const cue = set[0], [px, py] = POOL.pockets[3];
  const a = Math.atan2(py - cue.y, px - cue.x);
  cue.vx = Math.cos(a) * 120;
  cue.vy = Math.sin(a) * 120;
  run(pool, 3);
  assert.ok(cue.in);
  assert.ok(sounds.includes('pocket'));
  world.events.emit('poolStroke', { x: table.x, y: table.y });
  assert.ok(!cue.in && (cue.vx || cue.vy), 'spotted again and played');
  run(pool, 12);
  for (const b of set.slice(3)) b.in = true;
  world.events.emit('poolStroke', { x: table.x, y: table.y });
  assert.equal(live(pool.balls(table)).length, POOL.rack.length, 'a new game');
});
