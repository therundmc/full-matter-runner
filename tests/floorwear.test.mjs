import { test } from 'node:test';
import assert from 'node:assert/strict';
import { load } from './setup.mjs';

const { default: TileMap } = await load('game/world/TileMap.js');
const { planWear, paintWear, surfaces, WEAR_KINDS } = await load('game/render/FloorWear.js');
const { WEAR } = await load('game/data/floorwear.js');
const { FLOORS } = await load('game/world/TileMap.js');
const { TILE } = await load('game/Config.js');
const { default: level } = await load('game/data/levels/level1.js');

const S = 2; // floor pixels per world px (the tiles' density)
const flat = (map, v = 128) => {
  const width = map.w * TILE * S, height = map.h * TILE * S;
  return { width, height, data: new Uint8ClampedArray(width * height * 4).fill(v) };
};

test('floor wear: every floor of the legend has a surface, every mark a known kind', () => {
  const covered = new Set(Object.values(WEAR.surfaces).flatMap((s) => s.floors));
  for (const f of Object.values(FLOORS)) assert.ok(covered.has(f), `no wear for ${f}`);
  for (const s of Object.values(WEAR.surfaces)) for (const [kind] of s.marks || []) assert.ok(WEAR_KINDS.includes(kind), kind);
});

test('floor wear: level 1 gets potholes on its road and cracks on its floors, the same every time', () => {
  const map = new TileMap(level.tiles);
  const a = planWear(map, level), b = planWear(map, level);
  assert.deepEqual(a.marks, b.marks, 'seeded by the level');
  const road = a.names.indexOf('road'), wood = a.names.indexOf('wood');
  assert.ok(a.marks.some((m) => m.kind === 'pothole' && m.s === road), 'a pothole on the road');
  assert.ok(a.marks.filter((m) => m.kind === 'crack').length >= 10, 'cracks');
  assert.ok(a.marks.some((m) => m.kind === 'split' && m.s === wood), 'split boards in the bar');
  // every mark sits on its own surface
  for (const m of a.marks) assert.equal(a.surf[Math.floor(m.y / TILE) * map.w + Math.floor(m.x / TILE)], m.s, m.kind);
});

test('floor wear: never paints a wall, and stays discreet', () => {
  const map = new TileMap(level.tiles), img = flat(map);
  const { surf } = surfaces(map);
  const t0 = performance.now();
  paintWear(img, S, map, level);
  const ms = performance.now() - t0;
  assert.ok(ms < 1500, `${ms.toFixed(0)} ms to paint`);
  let changed = 0, far = 0, total = 0;
  for (let py = 0; py < img.height; py++) {
    for (let px = 0; px < img.width; px++) {
      const i = (py * img.width + px) * 4, onWall = surf[Math.floor(py / (TILE * S)) * map.w + Math.floor(px / (TILE * S))] === -1;
      const d = Math.max(Math.abs(img.data[i] - 128), Math.abs(img.data[i + 1] - 128), Math.abs(img.data[i + 2] - 128));
      if (onWall) { assert.equal(d, 0, `wall pixel ${px},${py} painted`); continue; }
      total++;
      if (d > 0) changed++;
      if (d > 40) far++;
    }
  }
  assert.ok(changed / total > 0.03, `${((changed / total) * 100).toFixed(1)} % of the floor worn`);
  assert.ok(far / total < 0.01, `${((far / total) * 100).toFixed(2)} % of the floor strongly marked`);
});

test('floor wear: a crack runs on over more than one tile', () => {
  const map = new TileMap(['XXXXXXXX', 'X______X', 'X______X', 'X______X', 'XXXXXXXX']);
  const cfg = { surfaces: { concrete: { floors: ['concrete'], marks: [['crack', 100, { len: [90, 100], branch: 0 }]] } } };
  const img = flat(map);
  paintWear(img, S, map, { name: 'x' }, cfg);
  const tiles = new Set();
  for (let py = 0; py < img.height; py++) {
    for (let px = 0; px < img.width; px++) {
      if (img.data[(py * img.width + px) * 4] < 120) tiles.add(`${Math.floor(px / (TILE * S))},${Math.floor(py / (TILE * S))}`);
    }
  }
  assert.ok(tiles.size >= 3, `the cracks cross ${tiles.size} tiles`);
});
