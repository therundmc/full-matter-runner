import { test } from 'node:test';
import assert from 'node:assert/strict';
import { load } from './setup.mjs';

const { ambientOf } = await load('game/render/Lighting.js');
const { LIGHTING } = await load('game/Config.js');
const { default: LEVELS } = await load('game/data/levels/index.js');

test('ambient: a level without its own tints keeps LIGHTING.ambient, one with them changes only those', () => {
  assert.deepEqual(ambientOf({}), LIGHTING.ambient);
  assert.deepEqual(ambientOf(undefined), LIGHTING.ambient);
  for (const id of ['level1', 'tutorial']) assert.deepEqual(ambientOf(LEVELS[id]), LIGHTING.ambient, id);
  const lit = ambientOf({ light: { inside: [0.5, 0.5, 0.5] } });
  assert.deepEqual(lit.inside, [0.5, 0.5, 0.5]);
  assert.deepEqual({ ...lit, inside: LIGHTING.ambient.inside }, LIGHTING.ambient);
});
