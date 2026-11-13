import { test } from 'node:test';
import assert from 'node:assert/strict';
import { load } from './setup.mjs';

const { default: TileMap } = await load('game/world/TileMap.js');
const { wallExit, bodyExit, afterCost, ricochet, WALL_RESIST } = await load('game/systems/Penetration.js');
const { WEAPONS } = await load('game/data/weapons.js');

// plaster partition at column 5, brick at column 8, double plaster at 11-12
const ROWS = [
  'XXXXXXXXXXXXXXX',
  'X....#..X..##.X',
  'X....#..X..##.X',
  'XXXXXXXXXXXXXXX',
];
const map = () => new TileMap(ROWS);
const edge = (n) => n * 32;
const mid = 1.5 * 32;

test('penetration: a rifle goes through plaster, a pistol does not', () => {
  const m = map();
  const r = wallExit(m, edge(5), mid, 0, WEAPONS.rifle.pen);
  assert.ok(!r.stopped);
  assert.equal(Math.round(r.x), edge(6));
  assert.ok(Math.abs(r.cost - 32 * WALL_RESIST['#']) < 0.01);
  assert.ok(wallExit(m, edge(5), mid, 0, WEAPONS.pistol.pen).stopped);
});

test('penetration: only the sniper gets through brick, and two plaster tiles cost twice one', () => {
  const m = map();
  assert.ok(wallExit(m, edge(8), mid, 0, WEAPONS.rifle.pen).stopped);
  assert.ok(!wallExit(m, edge(8), mid, 0, WEAPONS.sniper.pen).stopped);
  const two = wallExit(m, edge(11), mid, 0, WEAPONS.sniper.pen);
  assert.equal(two.cells.length, 2);
  assert.ok(Math.abs(two.cost - 64 * WALL_RESIST['#']) < 0.01);
});

test('penetration: a slanted shot crosses more wall', () => {
  const m = map();
  const straight = wallExit(m, edge(5), mid, 0, 999);
  const slant = wallExit(m, edge(5), mid, 0.5, 999);
  assert.ok(slant.cost > straight.cost * 1.1);
});

test('penetration: the border of the map stops everything', () => {
  assert.ok(wallExit(map(), edge(14), mid, 0, 999).stopped);
});

test('penetration: exit point of a box and spent rounds', () => {
  const box = [{ x: 0, y: 0 }, { x: 20, y: 0 }, { x: 20, y: 10 }, { x: 0, y: 10 }];
  const e = bodyExit(box, 0, 5, 0);
  assert.ok(Math.abs(e.x - 20) < 1e-6 && Math.abs(e.len - 20) < 1e-6);
  assert.equal(afterCost(10, 9.5), 0);
  assert.equal(afterCost(10, 4), 6);
});

test('ricochet: grazing hits on hard surfaces bounce, head-on hits never do', () => {
  // wall facing left (normal -x), shot coming almost parallel to it
  const graze = ricochet(Math.PI / 2 - 0.1, -1, 0, 1, 0);
  assert.ok(graze !== null && Math.cos(graze) < 0);
  assert.equal(ricochet(0, -1, 0, 1, 0), null);
  assert.equal(ricochet(Math.PI / 2 - 0.1, -1, 0, 0, 0), null);
});
