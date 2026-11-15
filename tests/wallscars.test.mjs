import { test } from 'node:test';
import assert from 'node:assert/strict';
import { load } from './setup.mjs';

const { TILE, WALL_RIM: RIM } = await load('game/Config.js');
const { default: TileMap } = await load('game/world/TileMap.js');
const { default: WallScars } = await load('game/render/WallScars.js');
const { WALL_SCAR } = await load('game/data/materials.js');

// a plaster partition (row 2) between two rooms, a brick block on the right
const ROWS = [
  'XXXXXXXX',
  'X.....XX',
  'X.####XX',
  'X.....XX',
  'XXXXXXXX',
];
const inWall = (m, x, y) => m.isWallChar(Math.floor(x / TILE), Math.floor(y / TILE));

test('a hole is dug behind the outline of the face it was struck on, inside the wall', () => {
  const m = new TileMap(ROWS), sc = new WallScars(m);
  // a round coming up from the room below hits the partition's south face
  const s = sc.place(3.5 * TILE, 3 * TILE, 0, 1, 'entry');
  assert.ok(s && inWall(m, s.x, s.y));
  assert.ok(3 * TILE - s.y > RIM, 'its centre lies past the dark outline');
  assert.ok(3 * TILE - s.y < s.r + RIM, 'near enough the face for the crater to bite into its outline');
  assert.equal(sc.place(1.5 * TILE, 3 * TILE, 0, 1, 'entry'), null, 'no wall there to carve');
});

test('rounds on the same spot dig a gouge out of one hole, wider and darker, up to a limit', () => {
  const m = new TileMap(ROWS), sc = new WallScars(m);
  const first = sc.place(3.5 * TILE, 3 * TILE, 0, 1, 'entry');
  const r0 = first.r, core0 = first.core;
  let s = first;
  for (let k = 0; k < 30; k++) s = sc.place(3.5 * TILE + (k % 3) - 1, 3 * TILE, 0, 1, 'entry');
  assert.equal(s, first, 'every hit lands on the same gouge');
  assert.ok(s.r > r0 && s.r <= WALL_SCAR.max);
  assert.ok(s.core > core0 && s.core <= WALL_SCAR.deepest);
  assert.equal(s.n, 31);
  const far = sc.place(5.5 * TILE, 3 * TILE, 0, 1, 'entry');
  assert.notEqual(far, first, 'a hole further along the wall is a hole of its own');
  sc.forget(3, 2);
  assert.notEqual(sc.place(3.5 * TILE, 3 * TILE, 0, 1, 'entry'), first, 'a tile that went has nothing left to dig');
});

test('marks are clipped to the wall tiles; their bare rim stays off the outline of the open faces', () => {
  const m = new TileMap(ROWS), sc = new WallScars(m);
  const x = 3.5 * TILE, y = 2.5 * TILE, reach = TILE;
  for (const inset of [false, true]) {
    const rects = sc.rects(x, y, reach, inset);
    assert.ok(rects.length > 0);
    for (const [rx, ry, rw, rh] of rects) {
      for (const [px, py] of [[rx, ry], [rx + rw - 0.01, ry], [rx, ry + rh - 0.01], [rx + rw - 0.01, ry + rh - 0.01]]) {
        assert.ok(inWall(m, px, py), `${px},${py} lies in a wall tile`);
      }
    }
  }
  // the partition tile (3, 2) is open above and below: inset by the outline there, not on its wall neighbours' sides
  const [r] = sc.rects(3.5 * TILE, 2.5 * TILE, 1, true);
  assert.deepEqual(r, [3 * TILE, 2 * TILE + RIM, TILE, TILE - 2 * RIM]);
});
