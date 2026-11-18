import { test } from 'node:test';
import assert from 'node:assert/strict';
import { load } from './setup.mjs';

const { chunkSpan, toDrop, spread, ChunkedLayer } = await load('game/render/Chunks.js');
const { paintWear, planWear } = await load('game/render/FloorWear.js');
const { default: TileMap } = await load('game/world/TileMap.js');
const { TILE, CHUNKS } = await load('game/Config.js');
const { default: level1 } = await load('game/data/levels/level1.js');
const { default: level2a } = await load('game/data/levels/level2a.js');

const S = 2; // floor pixels per world px (the tiles' density)

test('chunks: which chunks a range touches, clamped to the map', () => {
  const cw = 1024, n = 15;
  assert.deepEqual(chunkSpan(0, 10, cw, n), [0, 0]);
  assert.deepEqual(chunkSpan(1000, 1100, cw, n), [0, 1], 'across a border');
  assert.deepEqual(chunkSpan(-500, 2048, cw, n), [0, 2]);
  assert.deepEqual(chunkSpan(14000, 99999, cw, n), [13, 14]);
  // the view of the chase (about 660 px wide) and its margin each way: three or four chunks are kept baked
  const view = 380 * 16 / 9, m = CHUNKS.margin * TILE, w = CHUNKS.cols * TILE;
  for (const x of [0, 3000, 9000]) {
    const [i0, i1] = chunkSpan(x - view / 2 - m, x + view / 2 + m, w, n);
    assert.ok(i1 - i0 + 1 <= 3, `${x}: ${i0}..${i1}`);
  }
});

test('chunks: the clean ones out of view go past a small cache, the marked ones only past their keep, farthest first', () => {
  const alive = [
    { i: 0, dirty: false, used: 1 }, { i: 1, dirty: true, used: 2 }, { i: 2, dirty: false, used: 3 },
    { i: 3, dirty: true, used: 4 }, { i: 4, dirty: false, used: 9 }, { i: 5, dirty: false, used: 9 },
  ];
  // the view on 4..5: of the clean ones behind, the last used (2) is cached, 0 goes; marked 1 and 3 stay (keep 2)
  assert.deepEqual(toDrop(alive, [4, 5], 1, 2), [0]);
  // keep 1: the farther marked one (1) goes too
  assert.deepEqual(toDrop(alive, [4, 5], 1, 1).sort(), [0, 1]);
  // nothing in the span ever goes
  assert.deepEqual(toDrop(alive, [0, 5], 0, 0), []);
});

test('chunks: a context standing for several draws on each, its transforms moved by each one\'s offset', () => {
  const log = [];
  const g = (name) => ({ fillRect: (...a) => log.push([name, 'fillRect', ...a]), setTransform: (...a) => log.push([name, 'set', ...a]), fillStyle: '' });
  const a = g('a'), b = g('b');
  const one = spread([{ g: a, dx: 0 }]);
  assert.equal(one, a, 'a single chunk at the origin is the canvas\'s own context');
  const both = spread([{ g: a, dx: 0 }, { g: b, dx: 1024 }]);
  both.fillStyle = '#fff';
  both.setTransform(1, 0, 0, 1, 1100, 5);
  both.fillRect(1, 2, 3, 4);
  assert.equal(a.fillStyle, '#fff');
  assert.equal(b.fillStyle, '#fff');
  assert.deepEqual(log, [['a', 'set', 1, 0, 0, 1, 1100, 5], ['b', 'set', 1, 0, 0, 1, 76, 5], ['a', 'fillRect', 1, 2, 3, 4], ['b', 'fillRect', 1, 2, 3, 4]]);
});

test('chunks: a map up to CHUNKS.whole tiles wide is one chunk, without padding; a long one is cut', () => {
  const small = new ChunkedLayer(76 * TILE, 26 * TILE, TILE, { ...CHUNKS, cache: 0, keep: 0 });
  assert.equal(small.n, 1);
  assert.equal(small.pad, 0);
  const long = new ChunkedLayer(450 * TILE, 25 * TILE, TILE, { ...CHUNKS, cache: 0, keep: 0 });
  assert.equal(long.n, Math.ceil(450 / CHUNKS.cols));
  assert.equal(long.pad, CHUNKS.pad);
});

// the floor's wear painted in strips: exactly the pixels of the whole floor painted at once
function strips(map, level, from, to, widths) {
  const plan = planWear(map, level), H = map.h * TILE * S;
  const whole = { width: (to - from) * TILE * S, height: H, data: new Uint8ClampedArray((to - from) * TILE * S * H * 4).fill(128) };
  paintWear(whole, S, map, level, undefined, from * TILE * S, plan);
  let x = from, k = 0;
  while (x < to) {
    const w = Math.min(widths[k++ % widths.length], to - x), W = w * TILE * S;
    const part = { width: W, height: H, data: new Uint8ClampedArray(W * H * 4).fill(128) };
    paintWear(part, S, map, level, undefined, x * TILE * S, plan);
    for (let y = 0; y < H; y++) {
      const a = part.data.subarray(y * W * 4, (y + 1) * W * 4);
      const o = (y * whole.width + (x - from) * TILE * S) * 4;
      const b = whole.data.subarray(o, o + W * 4);
      if (Buffer.compare(Buffer.from(a), Buffer.from(b)) !== 0) return `strip at col ${x}, row ${y} differs`;
    }
    x += w;
  }
  return null;
}

test('chunks: the floor\'s wear painted chunk by chunk is the whole floor\'s, no seam (level 1, the back road)', () => {
  const m1 = new TileMap(level1.tiles);
  assert.equal(strips(m1, level1, 0, m1.w, [7, 11, 5]), null);
  const m2 = new TileMap(level2a.tiles);
  assert.equal(strips(m2, level2a, 120, 200, [CHUNKS.cols, 13]), null);
});
