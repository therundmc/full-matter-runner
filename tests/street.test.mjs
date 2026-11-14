import { test } from 'node:test';
import assert from 'node:assert/strict';
import { load } from './setup.mjs';

const { TILE, STEAM, PAPERS } = await load('game/Config.js');
const { default: EventBus } = await load('engine/EventBus.js');
const { default: Steam } = await load('game/systems/Steam.js');
const { default: Papers } = await load('game/systems/Papers.js');

const { Bodies, Body } = Matter;
// someone (or a car) at (x, y) going at (vx, vy) px/step
function mover(x, y, vx = 0, vy = 0, more = {}) {
  const body = Bodies.circle(x, y, 8);
  Body.setVelocity(body, { x: vx, y: vy });
  return { x, y, alive: true, body, ...more };
}

function stub() {
  const log = { dust: [], sounds: [] };
  const world = {
    events: new EventBus(), props: [], player: mover(0, 0), enemies: [], civilians: [],
    particles: { dust: (x, y, n, r, color, o) => log.dust.push({ x, y, ...o }) },
    sound: (name) => log.sounds.push(name),
    map: { isSolid: (cx) => cx >= 10, isBlocked: () => false }, // a wall from the tenth column on
  };
  return { world, log };
}
const run = (sys, sec) => { for (let i = 0; i < sec * 60; i++) sys.update(1 / 60); };

test('steam: a manhole breathes in puffs near the player only, a vent blows off its wall while it lives', () => {
  const { world, log } = stub();
  const vent = { def: { steam: 'vent' }, x: 100, y: 200, body: { angle: Math.PI }, dead: false }; // on a wall to the south
  world.props.push(vent, { def: {}, x: 0, y: 0, body: { angle: 0 } });
  const steam = new Steam(world, [[2, 2], [200, 2]]);
  run(steam, 30);
  const hole = log.dust.filter((d) => Math.abs(d.x - 2 * TILE) < 6 && Math.abs(d.y - 2 * TILE) < 6);
  assert.ok(hole.length > 20, 'the near one puffs');
  assert.ok(hole.length < 30 / STEAM.manhole.every * 0.8, 'not all the time');
  assert.ok(!log.dust.some((d) => d.x > 100 * TILE), 'the far one keeps it for later');
  const blown = log.dust.filter((d) => Math.abs(d.x - vent.x) < 2);
  assert.ok(blown.length > 50 && blown.every((d) => d.y < vent.y && d.vy < 0), 'northward, off its wall');
  vent.dead = true;
  log.dust.length = 0;
  run(steam, 3);
  assert.ok(!log.dust.some((d) => Math.abs(d.x - vent.x) < 2));
});

test('steam: a round through a steam pipe whistles a jet out of the wall, three holes at most, then the pressure is gone', () => {
  const { world, log } = stub();
  const pipe = { def: { steam: 'leak' }, x: 50, y: 20, body: { angle: 0 } }; // on a wall to the north
  const steam = new Steam(world);
  world.events.emit('propHit', { prop: pipe, x: 40, y: 22, kind: 'blunt' });
  world.events.emit('propHit', { prop: { def: {} }, x: 40, y: 22, kind: 'bullet' });
  assert.equal(steam.leaks.length, 0, 'a bat or another prop: nothing');
  world.events.emit('propHit', { prop: pipe, x: 40, y: 22, kind: 'bullet' });
  run(steam, 1);
  assert.ok(log.dust.length > 10 && log.dust.every((d) => d.vy > 0 && Math.abs(d.vx) < 1e-6), 'southward');
  assert.ok(log.sounds.includes('hiss'));
  for (let i = 0; i < 5; i++) world.events.emit('propHit', { prop: pipe, x: 60 + i, y: 22, kind: 'pellet' });
  assert.equal(steam.leaks.length, STEAM.leak.max);
  run(steam, STEAM.leak.dur + 0.1);
  assert.equal(steam.leaks.length, 0);
});

test('papers: sheets lie still, a gust sends them along the street until a wall stops them', () => {
  const { world } = stub();
  const papers = new Papers(world, [[0, 0, 3, 3, 12]]);
  assert.equal(papers.list.length, 12);
  assert.ok(papers.list.every((s) => s.x >= 0 && s.x < 4 * TILE && s.y >= 0 && s.y < 4 * TILE));
  const before = papers.list.map((s) => s.x);
  papers.next = 99;
  run(papers, 2);
  assert.deepEqual(papers.list.map((s) => s.x), before, 'no wind, nothing moves');
  papers.gust = { dx: 1, dy: 0, f: 3000, t: 4 };
  run(papers, 4);
  assert.ok(papers.list.every((s, i) => s.x > before[i] + TILE && s.x < 10 * TILE), 'blown east, not into the wall');
  run(papers, 6);
  assert.ok(papers.list.every((s) => !s.vx && !s.vy), 'they settle');
  // the wind comes back by itself
  papers.next = 0;
  papers.update(1 / 60);
  assert.ok(papers.gust && papers.next >= PAPERS.gust[0]);
});

test('papers: a car going by drags them along, a parked one does not, a runner kicks them away', () => {
  const { world } = stub();
  const papers = new Papers(world, [[1, 1, 1, 1, 1]]);
  papers.next = 99;
  const s = papers.list[0];
  Object.assign(s, { x: 100, y: 100 });
  const car = mover(90, 120, 4, 0, { moving: false });
  world.props.push(car);
  papers.update(1 / 60);
  assert.equal(s.vx, 0, 'parked');
  car.moving = true;
  papers.update(1 / 60);
  assert.ok(s.vx > 0 && s.vy < 0, 'along with it and away from it');
  world.props.length = 0;
  run(papers, 6);
  world.player = mover(s.x - 5, s.y, 0.5, 0);
  papers.update(1 / 60);
  assert.equal(s.vx, 0, 'walking by');
  world.player = mover(s.x - 5, s.y, 3, 0);
  papers.update(1 / 60);
  assert.ok(s.vx > 20, 'kicked');
});
