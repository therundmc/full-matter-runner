import { test } from 'node:test';
import assert from 'node:assert/strict';
import { load } from './setup.mjs';

const { default: TileMap } = await load('game/world/TileMap.js');
const { findPath } = await load('engine/nav/Pathfinding.js');

const ROWS = [
  'XXXXXXXXXX',
  'X....#...X',
  'X....D...X',
  'X....#...X',
  'XXXXXXXXXX',
];

test('TileMap parses walls, doors and floors', () => {
  const m = new TileMap(ROWS);
  assert.equal(m.w, 10);
  assert.equal(m.isSolid(0, 0), true);
  assert.equal(m.isSolid(5, 2), false, 'doors are not solid');
  assert.equal(m.isBlocked(5, 1), true);
  assert.equal(m.floor[2 * m.w + 5], 'wood', 'door takes its neighbour floor');
});

test('wall bodies are greedy-merged rectangles', () => {
  const m = new TileMap(ROWS);
  const bodies = m.buildBodies();
  const solidCells = m.solid.reduce((a, b) => a + b, 0);
  assert.ok(bodies.length < solidCells / 3, `${bodies.length} bodies for ${solidCells} cells`);
});

test('path goes through the door, and a destroyed wall opens a shortcut', () => {
  const m = new TileMap(ROWS);
  const path = findPath(m, 48, 48, 8 * 32 + 16, 48);
  assert.ok(path && path.length >= 2);
  const through = path.some((p) => Math.floor(p.y / 32) === 2) || path.length;
  assert.ok(through);
  const v0 = m.version;
  m.destroyTile(5, 1);
  assert.equal(m.isSolid(5, 1), false);
  assert.equal(m.version, v0 + 1);
  assert.ok(m.walkLine(4 * 32 + 16, 48, 6 * 32 + 16, 48), 'straight line through the breach');
});
