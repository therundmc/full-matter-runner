import { test } from 'node:test';
import assert from 'node:assert/strict';
import { load } from './setup.mjs';

const { default: Director } = await load('game/ai/Director.js');
const { TILE } = await load('game/Config.js');
const { default: LEVELS } = await load('game/data/levels/index.js');

const world = (level) => ({ level, time: 0, enemies: [], events: { on() {}, emit() {} } });
const at = (col, row, armed = false) => ({ x: (col + 0.5) * TILE, y: (row + 0.5) * TILE, armed });

test('guards leave an unarmed stranger alone outside the premises, until he gives himself away', () => {
  const d = new Director(world({ premises: [[11, 0, 30, 19]] }));
  assert.equal(d.isThreat(at(21, 22)), false, 'on the sidewalk');
  assert.equal(d.isThreat(at(21, 22, true)), true, 'a weapon in hand');
  assert.equal(d.isThreat(at(21, 19)), true, 'through the door');
  d.sighted(0, 0);
  assert.equal(d.isThreat(at(21, 22)), true, 'once made, there is no going back');
});

test('a level without premises is hostile everywhere; level 1 starts the player on public ground', () => {
  assert.equal(new Director(world({})).isThreat(at(1, 1)), true);
  const d = new Director(world(LEVELS.level1));
  assert.equal(d.isThreat(at(21, 35)), false, 'the start alley');
  assert.equal(d.isThreat(at(21, 22)), false, 'the sidewalk in front of the bar');
  assert.equal(d.isThreat(at(22, 15)), true, 'inside the bar');
});
