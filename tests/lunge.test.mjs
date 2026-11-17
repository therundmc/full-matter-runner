import { test } from 'node:test';
import assert from 'node:assert/strict';
import { load } from './setup.mjs';

const { lungeTarget } = await load('game/systems/Lunge.js');
const { PLAYER } = await load('game/Config.js');
const { WEAPONS } = await load('game/data/weapons.js');

const L = PLAYER.lunge;
const me = { x: 0, y: 0, radius: 10 };
const guard = (x, y, over = {}) => ({ x, y, radius: 10, alive: true, knocked: 0, held: null, ...over });
const sees = () => true, open = () => false;
const knife = WEAPONS.knife, fists = WEAPONS.fists, bat = WEAPONS.bat;

test('lunge: a swing is drawn to the nearest standing guard in the cone, in reach', () => {
  const near = guard(40, 4), far = guard(44, -2), aside = guard(0, 40);
  const r = lungeTarget(me, knife, [far, aside, near], 0, L, sees, open);
  assert.equal(r.target, near);
  assert.ok(Math.abs(r.a - Math.atan2(4, 40)) < 1e-9, 'a small turn is taken whole');
  // out of reach (the weapon's + extra) or out of the cone: nobody
  assert.equal(lungeTarget(me, knife, [guard(knife.range + 10 + L.extra + 1, 0)], 0, L, sees, open), null);
  assert.equal(lungeTarget(me, knife, [guard(30, 30)], 0, L, sees, open), null);
  assert.ok(lungeTarget(me, fists, [guard(30, 0)], 0, L, sees, open), 'bare hands too');
});

test('lunge: never to a man down, held, dead or behind a wall', () => {
  for (const g of [guard(30, 0, { knocked: 2 }), guard(30, 0, { held: me }), guard(30, 0, { alive: false })]) {
    assert.equal(lungeTarget(me, bat, [g], 0, L, sees, open), null);
  }
  const g = guard(30, 0);
  assert.equal(lungeTarget(me, bat, [g], 0, L, (e) => e !== g, open), null);
});

test('lunge: the turn is held to its limit, the step to its length, short of contact and of walls', () => {
  // 0.45 rad off the aim: in the cone, turned by 0.25 only
  const off = 0.45, d = 36, g = guard(Math.cos(off) * d, Math.sin(off) * d);
  const r = lungeTarget(me, bat, [g], 0, L, sees, open);
  assert.ok(Math.abs(r.a - L.turn) < 1e-9);
  assert.equal(r.push, L.push);
  // close: only to contact
  const c = lungeTarget(me, bat, [guard(25, 0)], 0, L, sees, open);
  assert.equal(c.push, 25 - 20 - L.gap);
  // already in contact range (him or another one): no step, the aim still helps
  assert.equal(lungeTarget(me, bat, [guard(20.5, 0)], 0, L, sees, open).push, 0);
  assert.equal(lungeTarget(me, bat, [guard(36, 0), guard(-18, 0)], 0, L, sees, open).push, 0);
  // a wall 4 px ahead of his front
  const wall = (x) => x > me.radius + 4;
  assert.equal(lungeTarget(me, bat, [guard(36, 0)], 0, L, sees, wall).push, 4);
});

test('lunge: never with a gun in hand', () => {
  assert.equal(lungeTarget(me, WEAPONS.pistol, [guard(30, 0)], 0, L, sees, open), null);
  assert.equal(lungeTarget(me, WEAPONS.shotgun, [guard(30, 0)], 0, L, sees, open), null);
});
