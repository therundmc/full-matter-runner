import { test } from 'node:test';
import assert from 'node:assert/strict';
import { load } from './setup.mjs';

const { default: TileMap } = await load('game/world/TileMap.js');
const { occlusion } = await load('game/systems/Ballistics.js');
const { findCover } = await load('game/systems/Cover.js');

// a 3-room strip: open room | wall with a door | room
const ROWS = [
  'XXXXXXXXXXXX',
  'X....#.....X',
  'X....#.....X',
  'X....#.....X',
  'XXXXXXXXXXXX',
];
const world = () => ({ map: new TileMap(ROWS), doors: [], props: [], windows: [] });
const c = (n) => (n + 0.5) * 32;

test('explosions: walls block, open air does not', () => {
  const w = world();
  assert.equal(occlusion(w, c(2), c(2), c(4), c(2)), 1);
  assert.equal(occlusion(w, c(4), c(2), c(7), c(2)), 0);
});

test('explosions: the wall tile being hit is not its own obstacle', () => {
  const w = world();
  assert.equal(occlusion(w, c(3), c(2), c(5), c(2), { cx: 5, cy: 2 }), 1);
  assert.equal(occlusion(w, c(3), c(2), c(5), c(2)), 0);
});

test('cover: a wall next to the character is found with a normal pointing back at it', () => {
  const w = world();
  const ch = { x: 5 * 32 - 12, y: c(2), radius: 8.5 };
  const cov = findCover(w, ch);
  assert.ok(cov);
  assert.equal(cov.low, false);
  assert.ok(cov.nx < -0.9, `normal ${cov.nx}`);
  assert.ok(Math.abs(cov.dist - 12) < 0.01);
  assert.equal(findCover(w, { x: c(2), y: c(2), radius: 8.5 }), null, 'nothing to hide behind mid-room');
});
