// The chase's route holds together (systems/Route.js checkRoute; tools/build_level2a.py runs it too): legs in order
// and not overlapping, every bend from a leg before the one it hands the car to and only one into a leg, no
// checkpoint inside a bend's span, every checkpoint and event on a leg.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { load } from './setup.mjs';

const { checkRoute, routeOf } = await load('game/systems/Route.js');
const { default: LEVELS } = await load('game/data/levels/index.js');

test('route: every level with a chase, and every route of the lab, holds together', () => {
  let n = 0;
  for (const [id, level] of Object.entries(LEVELS)) {
    const routes = [level.chase, ...Object.values(level.routes || {})].filter(Boolean);
    for (const r of routes) {
      n++;
      assert.deepEqual(checkRoute(r), [], id);
      const total = routeOf(r).total;
      assert.ok(total === null || Number.isFinite(total), `${id}: its length along the route`);
    }
  }
  assert.ok(n >= 2, 'level 2A and the lab at least');
});

// a small good route: two legs, one bend from the first into the second
const good = () => ({
  van: [2, 10],
  legs: [{ from: 0, to: 50, lanes: [9, 11] }, { from: 50, to: 120, lanes: [39, 41] }],
  bends: [{ at: 40, path: [[40, 11], [50.5, 11], [50.5, 41], [60, 41]], radius: 4, to: 1 }],
  checkpoints: [{ at: 0, name: 'A' }, { at: 70, name: 'B' }],
  events: [{ at: 20, kind: 'behind' }, { at: 80, kind: 'behind' }],
  end: 110,
});
const has = (errors, what) => errors.some((e) => e.includes(what));

test('route: a good one passes; each way of breaking one is told', () => {
  assert.deepEqual(checkRoute(good()), []);
  assert.deepEqual(checkRoute({}), [], 'no legs: one leg as long as the map');
  let r = good();
  r.legs[1].from = 45;
  assert.ok(has(checkRoute(r), 'overlaps leg 0'), 'overlapping legs');
  r = good();
  r.legs.reverse();
  assert.ok(has(checkRoute(r), 'starts before leg 0'), 'legs out of order');
  r = good();
  r.legs[0].to = 0;
  assert.ok(has(checkRoute(r), 'from is not before to'));
  r = good();
  r.bends[0].at = 60; // (on leg 1 already: a bend into the leg it is on)
  assert.ok(has(checkRoute(r), 'not before its leg'), 'a bend from at or after its leg');
  r = good();
  r.bends.push({ ...r.bends[0], at: 30 });
  assert.ok(has(checkRoute(r), 'already has bend 0'), 'two bends into one leg');
  r = good();
  r.checkpoints[1].at = 45;
  assert.ok(has(checkRoute(r), 'inside bend 0'), 'a checkpoint in the bend: a retry on leg 0 with no bend ahead');
  r = good();
  r.checkpoints[1].at = 55;
  assert.ok(has(checkRoute(r), 'inside bend 0'), 'nor on the next leg before the line ends');
  r = good();
  r.events[1].at = 130;
  assert.ok(has(checkRoute(r), 'event behind (col 130) on no leg'));
  r = good();
  r.bends[0].to = 2;
  assert.ok(has(checkRoute(r), 'no leg 2'));
});
