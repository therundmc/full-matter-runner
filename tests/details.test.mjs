// The small life and wear of the decor: the arcade's attract loop and the flies over a bin (render/PropLife.js), the
// floor drain (render/FloorWear.js), and where level 1 puts them.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { load } from './setup.mjs';

const { attractFrame, flyAt, ATTRACT } = await load('game/render/PropLife.js');
const { paintWear, WEAR_KINDS } = await load('game/render/FloorWear.js');
const { default: TileMap } = await load('game/world/TileMap.js');
const { PROPS } = await load('game/data/props.js');
const { TILE } = await load('game/Config.js');
const { default: level } = await load('game/data/levels/level1.js');

test('arcade attract loop: the invaders step 0 1 2 1, a shot flies then waits, the score blinks, two cabinets differ', () => {
  const steps = [0, 1, 2, 3, 4].map((i) => attractFrame((i + 0.5) * ATTRACT.step, 0).dx);
  const at = steps.indexOf(0);
  assert.ok(at >= 0);
  assert.deepEqual([0, 1, 2, 3].map((i) => attractFrame((at + i + 0.5) * ATTRACT.step, 0).dx), [0, 1, 2, 1]);
  let flying = 0, lit = 0;
  const N = 2000;
  for (let i = 0; i < N; i++) {
    const f = attractFrame(i * 0.01, 3);
    assert.ok(f.dx >= 0 && f.dx <= 2);
    if (f.shot !== null) { assert.ok(f.shot >= 0 && f.shot < 1); flying++; }
    if (f.score) lit++;
  }
  assert.ok(Math.abs(flying / N - ATTRACT.flight / ATTRACT.shot) < 0.05, 'the shot is up a short part of the time');
  assert.ok(lit > N * 0.3 && lit < N * 0.7);
  assert.deepEqual(attractFrame(1.23, 5), attractFrame(1.23, 5));
  assert.ok([0.1, 0.5, 0.9, 1.3].some((t) => attractFrame(t, 1).shot !== attractFrame(t, 2).shot));
});

test('flies: they stay within a few px of their bin, keep moving, and are two different ones', () => {
  let moved = 0;
  for (let i = 0; i < 300; i++) {
    const t = i * 0.05, a = flyAt(t, 4.2, 0), b = flyAt(t + 0.05, 4.2, 0);
    assert.ok(Math.hypot(a.x, a.y) < 11, 'never far');
    if (Math.hypot(a.x - b.x, a.y - b.y) > 0.2) moved++;
  }
  assert.ok(moved > 250);
  const a = flyAt(2, 4.2, 0), b = flyAt(2, 4.2, 1);
  assert.ok(Math.hypot(a.x - b.x, a.y - b.y) > 0.5);
});

test('floor drain: a steel grate five px across painted in the tiles, the floor darker round it, nothing on a wall', () => {
  assert.ok(WEAR_KINDS.includes('drain'));
  const rows = ['#######', '#+++++#', '#+++++#', '#+++++#', '#######'];
  const map = new TileMap(rows), S = 2, width = map.w * TILE * S, height = map.h * TILE * S;
  const img = { width, height, data: new Uint8ClampedArray(width * height * 4).fill(200) };
  const lv = { name: 'drain', grime: [['drain', 3.5, 2.5, 3.5, 2.5, 1, { at: 'point' }]] };
  const cfg = { surfaces: { tiles: { floors: ['tile_blue'] } } };
  paintWear(img, S, map, lv, cfg);
  const px = (x, y) => img.data[(Math.floor(y * S) * width + Math.floor(x * S)) * 4];
  const cx = 3.5 * TILE, cy = 2.5 * TILE;
  assert.ok(px(cx, cy) < 150, 'the grate');
  assert.ok(px(cx - 2.4, cy - 2.4) < px(cx + 2.1, cy + 2.1), 'its rim dark on the top left, lit on the lower right');
  assert.ok(px(cx + 5, cy) < 200, 'damp round it');
  assert.equal(px(cx + 30, cy + 20), 200, 'the rest of the floor untouched');
  for (let x = 0; x < map.w * TILE; x += 3) assert.equal(px(x, 10), 200, 'the wall untouched');
});

test('level 1 details: its drains, the stools scuffed, flyers and conduits on walls with bodies, a bin with flies', () => {
  const kinds = level.grime.map((g) => g[0]);
  assert.equal(kinds.filter((k) => k === 'drain').length, 2);
  assert.ok(kinds.filter((k) => k === 'scuffs').length >= 4);
  for (const t of ['conduit', 'flyers']) {
    assert.ok(PROPS[t].static && PROPS[t].w > 0, t);
    assert.ok(level.props.some((p) => p[0] === t), t);
  }
  assert.ok(level.props.some((p) => p[0] === 'trash_can' && p[4]?.flies));
  assert.ok(level.floor.some((f) => f[0] === 'tag'));
});
