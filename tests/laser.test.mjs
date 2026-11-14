import { test } from 'node:test';
import assert from 'node:assert/strict';
import { load } from './setup.mjs';

const { laserOf, laserBeam } = await load('game/render/LaserSight.js');
const { WEAPONS } = await load('game/data/weapons.js');

const holder = (type, extra = {}) => ({
  alive: true, isPlayer: true, x: 0, y: 0, angle: 0, weapon: { type }, reloading: 0, knocked: 0, vaulting: null,
  muzzlePos() { return { x: 20, y: 0 }; }, ...extra,
});

test('laser: only the sniper rifle has one, on when the gun is ready; a guard shows his once on target', () => {
  assert.equal(laserOf(holder('sniper')), WEAPONS.sniper.laser);
  assert.ok(/^#[0-9a-f]{6}$/.test(WEAPONS.sniper.laser));
  for (const type of Object.keys(WEAPONS)) if (type !== 'sniper') assert.equal(laserOf(holder(type)), null, type);
  assert.equal(laserOf(holder('sniper', { reloading: 0.5 })), null, 'reloading');
  assert.equal(laserOf(holder('sniper', { alive: false })), null);
  assert.equal(laserOf(holder('sniper', { weapon: null })), null);
  assert.equal(laserOf(holder('sniper', { isPlayer: false, aware: 1 })), null, 'a guard still looking');
  assert.equal(laserOf(holder('sniper', { isPlayer: false, aware: 2 })), WEAPONS.sniper.laser);
});

test('laser: the beam stops on the first solid thing, goes through glass and over small things', () => {
  const glass = {}, crate = {};
  const hits = [{ kind: 'glass', target: glass, x: 100, y: 0 }, { kind: 'prop', target: crate, x: 300, y: 0 }];
  const world = {
    lineOfSight: () => true,
    traceBullet: (x0, y0, x1, y1, team, skip) => hits.find((h) => !skip.has(h.target)) ?? null,
  };
  const ch = holder('sniper');
  const b = laserBeam(world, ch);
  assert.deepEqual([b.x0, b.x1, b.hit], [20, 300, true]);
  hits.pop();
  const far = laserBeam(world, ch);
  assert.equal(far.hit, false);
  assert.ok(far.x1 > 1000);
  // the muzzle poked into a wall: no beam on the other side
  const blocked = laserBeam({ ...world, lineOfSight: () => false }, ch);
  assert.deepEqual([blocked.x1, blocked.hit], [20, true]);
});
