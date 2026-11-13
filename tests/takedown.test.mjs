import { test } from 'node:test';
import assert from 'node:assert/strict';
import { load } from './setup.mjs';

const { behind } = await load('game/systems/Takedown.js');
const { TAKEDOWN } = await load('game/Config.js');

const guard = (o = {}) => ({ x: 20, y: 0, angle: 0, alive: true, knocked: 0, vaulting: null, held: null, ...o });
const me = (o = {}) => ({ x: 0, y: 0, angle: 0, ...o });

test('takedown: only right behind a standing guard, facing his back', () => {
  assert.ok(behind(me(), guard()));
  assert.ok(behind(me({ angle: 0.6 }), guard({ angle: -0.7 })), 'a little off axis still counts');
  assert.ok(!behind(me(), guard({ angle: Math.PI })), 'he is facing us');
  assert.ok(!behind(me(), guard({ angle: Math.PI / 2 })), 'we are at his side');
  assert.ok(!behind(me({ angle: Math.PI }), guard()), 'we have our back to him');
  assert.ok(!behind(me(), guard({ x: TAKEDOWN.reach + 1 })), 'out of reach');
});

test('takedown: not on a guard who is down, vaulting or already held', () => {
  assert.ok(!behind(me(), guard({ alive: false })));
  assert.ok(!behind(me(), guard({ knocked: 1 })));
  assert.ok(!behind(me(), guard({ vaulting: {} })));
  assert.ok(!behind(me(), guard({ held: {} })));
});
