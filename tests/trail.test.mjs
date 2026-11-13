import { test } from 'node:test';
import assert from 'node:assert/strict';
import { load } from './setup.mjs';

const { default: Trail } = await load('game/ai/Trail.js');
const { default: Director } = await load('game/ai/Director.js');
const { default: EventBus } = await load('engine/EventBus.js');
const { AI } = await load('game/Config.js');

const R = { fresh: 30, max: 12, gap: 60, hop: 70 };
// a straight run of prints heading east, 17 px apart, one every 0.1 s
const run = (trail, n, x0 = 0, y = 0, t0 = 0) => { for (let i = 0; i < n; i++) trail.add(x0 + i * 17, y, 0, 'blood', t0 + i * 0.1); };

test('trail: a guard picks up the freshest print he sees, among those that mean something to him', () => {
  const t = new Trail(R);
  run(t, 6);
  t.add(200, 0, 0, 'water', 1);
  assert.equal(t.find(() => true).kind, 'water');
  assert.equal(t.find(() => true, (p) => p.kind === 'blood').n, 5);
  assert.equal(t.find((p) => p.x < 40).n, 2);
  assert.equal(t.find(() => false), null);
});

test('trail: followed one hop at a time to the end of the run, never across a gap', () => {
  const t = new Trail(R);
  run(t, 8);            // x = 0..119
  run(t, 3, 400, 0, 5); // another run, far away
  const a = t.next(t.prints[0]);
  assert.equal(a.x, 85, 'the first print at least a hop away');
  const b = t.next(a);
  assert.equal(b.x, 119, 'the last of the run');
  assert.equal(t.next(b), null, 'the next run is not the same trail');
  assert.equal(t.next(t.prints[8]).x, 434);
});

test('trail: what a guard has read is not picked up again, old prints dry, the oldest are dropped', () => {
  const t = new Trail(R);
  run(t, 5);
  t.close(t.prints[2]);
  assert.equal(t.find((p) => p.n <= 2), null);
  assert.equal(t.find(() => true).n, 4);
  t.close(t.prints[1]);
  assert.equal(t.done, 2, 'never reopened');
  t.prune(R.fresh + 0.25);
  assert.deepEqual(t.prints.map((p) => p.n), [3, 4]);
  run(t, 14, 0, 50, 40);
  assert.equal(t.prints.length, R.max);
  assert.equal(t.prints.at(-1).n, 18);
});

test('trail: the squad only keeps the footprints of the player', () => {
  const w = { time: 3, enemies: [], texts: [], events: new EventBus() };
  const d = new Director(w);
  w.events.emit('footprint', { who: { isEnemy: true }, x: 1, y: 2, angle: 0, kind: 'blood' });
  w.events.emit('footprint', { who: { isPlayer: true }, x: 5, y: 6, angle: 1, kind: 'water' });
  assert.deepEqual(d.trail.prints, [{ x: 5, y: 6, angle: 1, kind: 'water', t: 3, n: 0 }]);
  assert.equal(d.tracker, undefined);
  w.enemies.push({ alive: true, knocked: 0, state: 'track' });
  assert.equal(d.tracker, w.enemies[0]);
  w.time += AI.trail.fresh + 1;
  d.tick(0.1);
  assert.equal(d.trail.prints.length, 0);
});
