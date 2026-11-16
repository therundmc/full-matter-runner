import { test } from 'node:test';
import assert from 'node:assert/strict';
import { load } from './setup.mjs';

const { CellMemory, routeCells, cellAhead, giveWay, pathCost } = await load('game/ai/Nav.js');
const { findPath } = await load('engine/nav/Pathfinding.js');
const { escapeRoute } = await load('game/ai/Civilians.js');
const { default: TileMap } = await load('game/world/TileMap.js');
const { TILE } = await load('game/Config.js');

const px = (c) => (c + 0.5) * TILE;
const cellOf = (map, c, r) => r * map.w + c;
// a room with two doorways out to a corridor: the west one (col 4) is the shorter way, the east one (col 7) the other
const ROOMS = [
  '############',
  '#..........#',
  '#.########.#',
  '#.#......#.#',
  '#.#......#.#',
  '#.##D##D####',
  '#..........#',
  '############',
];
const through = (path, map, c, r) => path.some((p) => Math.floor(p.x / TILE) === c && Math.floor(p.y / TILE) === r)
  || routeCells(map, px(1), px(6), path).has(cellOf(map, c, r));

test('nav: a tile remembered as jammed costs extra until it is forgotten', () => {
  const m = new CellMemory();
  m.mark(5, 10, 3);
  m.mark(5, 4, 8); // the higher cost and the later end win
  assert.equal(m.cost(5, 2), 10);
  assert.equal(m.cost(5, 7.9), 10);
  assert.equal(m.cost(5, 8), 0, 'forgotten');
  assert.equal(m.size, 0, 'and dropped');
  const map = new TileMap(ROOMS);
  m.markAround(map, px(4), px(4), 1, 6, 10);
  assert.equal(m.cost(cellOf(map, 4, 4), 0), 6);
  assert.equal(m.cost(cellOf(map, 5, 5), 0), 3, 'the ring around costs half');
  assert.equal(m.cost(cellOf(map, 6, 4), 0), 0);
});

test('nav: a path goes round a doorway found jammed, through the other one, and string pulling does not cut back across it', () => {
  const map = new TileMap(ROOMS);
  const from = { x: px(5), y: px(3) }, to = { x: px(5), y: px(6) };
  const plain = findPath(map, from.x, from.y, to.x, to.y);
  assert.ok(plain && through(plain, map, 4, 5), 'the near doorway first');
  const jams = new CellMemory();
  jams.mark(cellOf(map, 4, 5), 14, 10);
  const cost = pathCost([(i) => jams.cost(i, 0)]);
  const round = findPath(map, from.x, from.y, to.x, to.y, 6000, cost);
  assert.ok(round, 'still a way');
  const cells = routeCells(map, from.x, from.y, round);
  assert.ok(!cells.has(cellOf(map, 4, 5)), 'not through the jammed doorway');
  assert.ok(cells.has(cellOf(map, 7, 5)), 'through the other one');
  // no other way at all: the jammed one is still taken (a cost, not a wall)
  const shut = new TileMap(ROOMS.map((r, i) => (i === 5 ? r.slice(0, 7) + '#' + r.slice(8) : r)));
  assert.ok(findPath(shut, from.x, from.y, to.x, to.y, 6000, cost), 'a cost is not a wall');
  assert.equal(pathCost([null, null]), null, 'no layer: no cost function');
});

test('nav: the tile in the way is the one ahead, never his own', () => {
  const map = new TileMap(ROOMS);
  assert.equal(cellAhead(map, px(4), px(4) + 10, 0, 1), cellOf(map, 4, 5), 'the doorway below');
  assert.equal(cellAhead(map, px(4) + 14, px(4), 1, 0, 2), cellOf(map, 5, 4), 'own tile skipped');
  assert.equal(cellAhead(map, px(0), px(0), -1, 0), null, 'off the map');
});

test('nav: giving way: a step aside round one standing in the way, a queue behind one going the same way, a push off one too close', () => {
  const me = { x: 0, y: 0, radius: 10 };
  const still = giveWay(me, 1, 0, [{ x: 30, y: 0, vel: { x: 0, y: 0 }, radius: 10 }]);
  assert.ok(still.y > 0.2, 'dead ahead: he steps to his right');
  assert.ok(still.slow < 1 && still.slow > 0.4, 'and eases off');
  const left = giveWay(me, 1, 0, [{ x: 30, y: 8, vel: { x: 0, y: 0 }, radius: 10 }]);
  assert.ok(left.y < 0, 'one standing a little to his right: round him by the left');
  const queue = giveWay(me, 1, 0, [{ x: 26, y: 0, vel: { x: 1.2, y: 0 }, radius: 10 }]);
  assert.ok(Math.abs(queue.y) < 1e-9, 'one going his way: no step aside ...');
  assert.ok(queue.slow < 0.9, '... he falls in behind him');
  const close = giveWay(me, 1, 0, [{ x: -12, y: 0, vel: { x: 0, y: 0 }, radius: 10 }]);
  assert.ok(close.x > 0, 'pushed off one overlapping him');
  const behind = giveWay(me, 1, 0, [{ x: -35, y: 0, vel: { x: 0, y: 0 }, radius: 10 }]);
  assert.equal(behind.slow, 1, 'nobody ahead: his own pace');
  const far = giveWay(me, 1, 0, [{ x: 200, y: 0, vel: { x: 0, y: 0 }, radius: 10 }]);
  assert.deepEqual(far, { x: 0, y: 0, slow: 1 });
});

test('nav: a runner held up on his way out is sent round that spot by the next escape route', () => {
  // two ways off the map from the middle of a corridor: west and east
  const map = new TileMap(['#######', '.......', '#######']);
  const start = { x: px(2), y: px(1) };
  const west = escapeRoute(map, start.x, start.y, null);
  assert.ok(west.at(-1).x < 0, 'the near side');
  const jams = new CellMemory();
  jams.mark(1 * map.w + 1, 30, 10);
  const east = escapeRoute(map, start.x, start.y, null, { cost: (i) => jams.cost(i, 0) });
  assert.ok(east.at(-1).x > map.w * TILE, 'the other side, round the spot he was held up at');
});
