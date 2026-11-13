import { test } from 'node:test';
import assert from 'node:assert/strict';
import { load } from './setup.mjs';

const { default: TileMap } = await load('game/world/TileMap.js');
const { ROOF_DECOR } = await load('game/data/roofs.js');
const { default: LEVELS } = await load('game/data/levels/index.js');

// a 6x5 block of brick on the map's west edge, an alley, a thin wall
const ROWS = [
  'XXXXXXX_X',
  'XXXXXXX_X',
  'XXXXXXX_X',
  'XXXXXXX_X',
  'XXXXXXX_X',
  '________X',
];

test('a roof is brick surrounded by walls: the outer ring of a block is its parapet', () => {
  const m = new TileMap(ROWS);
  assert.equal(m.isRoof(3, 2), true, 'deep inside the block');
  assert.equal(m.isRoof(0, 0), true, 'the block runs on past the edge of the map');
  assert.equal(m.isRoof(5, 2), true);
  assert.equal(m.isRoof(6, 2), false, 'parapet along the alley');
  assert.equal(m.isRoof(3, 4), false, 'parapet along the street');
  assert.equal(m.isRoof(8, 2), false, 'a thin wall has no roof');
  assert.equal(m.isRoof(7, 2), false, 'a floor is not a roof');
  assert.equal(m.isRoof(-1, 2), false, 'nothing outside the map');
});

test('breaching the parapet turns the roof behind it back into a wall edge', () => {
  const m = new TileMap(ROWS);
  m.destroyTile(6, 2);
  assert.equal(m.isRoof(5, 2), false);
  assert.equal(m.isRoof(5, 1), false);
  assert.equal(m.isRoof(4, 2), true, 'one tile further in is still roof');
});

test('rooftop dressing of every level is known scenery standing on a roof', () => {
  for (const [id, level] of Object.entries(LEVELS)) {
    const m = new TileMap(level.tiles);
    for (const [kind, col, row] of level.roof || []) {
      assert.ok(ROOF_DECOR[kind], `${id}: unknown roof piece ${kind}`);
      assert.ok(m.isRoof(Math.floor(col), Math.floor(row)), `${id}: ${kind} at ${col},${row} is not on a roof`);
    }
  }
  assert.ok(LEVELS.level1.roof.some(([kind]) => ROOF_DECOR[kind].light), 'level 1 has lit rooftop pieces');
});
