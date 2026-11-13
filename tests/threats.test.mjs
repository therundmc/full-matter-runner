import { test } from 'node:test';
import assert from 'node:assert/strict';
import { load } from './setup.mjs';

const { default: EventBus } = await load('engine/EventBus.js');
const { default: Threats, awareness, edgeMarker } = await load('game/systems/Threats.js');
const { INDICATORS: R } = await load('game/Config.js');

const NEVER = -99;
const g = (over = {}) => ({ alive: true, knocked: 0, aware: 0, seenAt: NEVER, heardAt: NEVER, ...over });

test('indicators: a quiet guard never seen gets no marker', () => {
  assert.equal(awareness(g(), 10), 0);
  assert.equal(awareness(g(), 0), 0);
});

test('indicators: dead or floored guards get no marker, whatever is known of them', () => {
  assert.equal(awareness(g({ alive: false, aware: 2, heardAt: 10, seenAt: 10 }), 10), 0);
  assert.equal(awareness(g({ knocked: 1.5, aware: 2, heardAt: 10 }), 10), 0);
});

test('indicators: a guard after the player is fully marked, a suspicious one less', () => {
  assert.equal(awareness(g({ aware: 2 }), 10), 1);
  assert.equal(awareness(g({ aware: 1 }), 10), R.suspicious);
  assert.ok(R.suspicious < 1);
});

test('indicators: a noise is remembered for a moment and fades out', () => {
  assert.equal(awareness(g({ heardAt: 10 }), 10), 1);
  const half = awareness(g({ heardAt: 10 }), 10 + R.heardFor / 2);
  assert.ok(Math.abs(half - 0.5) < 1e-9);
  assert.equal(awareness(g({ heardAt: 10 }), 10 + R.heardFor), 0);
  assert.equal(awareness(g({ heardAt: 10 }), 100), 0);
});

test('indicators: a guard seen on screen is remembered a few seconds, more faintly than a heard one', () => {
  assert.equal(awareness(g({ seenAt: 10 }), 10), R.seen);
  assert.ok(awareness(g({ seenAt: 10 }), 12) < R.seen);
  assert.ok(awareness(g({ seenAt: 10 }), 12) > 0);
  assert.equal(awareness(g({ seenAt: 10 }), 10 + R.seenFor), 0);
  // the strongest clue wins
  assert.equal(awareness(g({ seenAt: 10, heardAt: 10 }), 10), 1);
});

test('indicators: nothing for a point on screen, a marker on the border toward one outside', () => {
  assert.equal(edgeMarker(400, 300, 800, 600, 10), null);
  assert.equal(edgeMarker(0, 0, 800, 600, 10), null);
  const right = edgeMarker(900, 300, 800, 600, 10);
  assert.deepEqual([right.x, right.y, right.angle], [790, 300, 0]);
  assert.ok(Math.abs(right.beyond - 100) < 1e-9);
  const up = edgeMarker(400, -50, 800, 600, 10);
  assert.equal(up.y, 10);
  assert.ok(Math.abs(up.angle + Math.PI / 2) < 1e-9);
  assert.ok(Math.abs(up.beyond - 50) < 1e-9);
  // a corner case stays inside the inset frame and points outward
  const corner = edgeMarker(1200, 900, 800, 600, 10);
  assert.ok(corner.x <= 790 && corner.y <= 590 && corner.x > 400 && corner.y > 300);
  assert.ok(corner.beyond > 0);
});

const world = () => ({ events: new EventBus(), time: 0, enemies: [] });
const enemy = (x, y, over = {}) => ({ isEnemy: true, alive: true, knocked: 0, aware: 0, sees: false, barkT: 0, moving: 0, x, y, ...over });
const VIEW = { x: 0, y: 0, hw: 100, hh: 60 };

test('threats: guards give themselves away by being seen, shouting, running or firing', () => {
  const w = world(), th = new Threats(w);
  const quiet = enemy(500, 0), seen = enemy(50, 0), loud = enemy(500, 0, { barkT: 0.4 });
  const runner = enemy(500, 0, { moving: R.runSpeed + 0.5 }), walker = enemy(500, 0, { moving: 1 }), shooter = enemy(500, 0);
  w.enemies.push(quiet, seen, loud, runner, walker, shooter);
  w.time = 1;
  w.events.emit('noise', { x: 500, y: 0, radius: 300, source: shooter, type: 'gunshot' });
  w.events.emit('noise', { x: 0, y: 0, radius: 300, source: { isPlayer: true }, type: 'gunshot' });
  th.update(VIEW);
  assert.equal(th.strength(quiet), 0);
  assert.equal(th.strength(walker), 0);
  assert.equal(th.strength(seen), R.seen);
  assert.equal(th.strength(loud), 1);
  assert.equal(th.strength(runner), 1);
  assert.equal(th.strength(shooter), 1);
  assert.equal(th.aiming(shooter), true);
  assert.equal(th.aiming(loud), false);
  // it all fades once they go quiet again
  loud.barkT = 0; runner.moving = 0; seen.x = 500;
  w.time = 1 + Math.max(R.heardFor, R.seenFor);
  th.update(VIEW);
  for (const e of [seen, loud, runner, shooter]) assert.equal(th.strength(e), 0);
  assert.equal(th.aiming(shooter), false);
});

test('threats: a guard with the player in his sights pulses, a dead one is forgotten', () => {
  const w = world(), th = new Threats(w);
  const hunter = enemy(500, 0, { aware: 2, sees: true });
  w.enemies.push(hunter);
  th.update(VIEW);
  assert.equal(th.strength(hunter), 1);
  assert.equal(th.aiming(hunter), true);
  hunter.sees = false;
  assert.equal(th.aiming(hunter), false);
  hunter.alive = false;
  w.events.emit('kill', { victim: hunter, cause: 'bullet', killer: null });
  assert.equal(th.strength(hunter), 0);
  assert.equal(th.memo.size, 0);
});
