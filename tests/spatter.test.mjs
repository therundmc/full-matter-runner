import { test } from 'node:test';
import assert from 'node:assert/strict';
import { load } from './setup.mjs';

const { wallBehind, faceNormal, run, runsOf, fling } = await load('game/fx/Spatter.js');
const { WOUNDS, RUNS, SKULL, TEAR } = await load('game/data/wounds.js');

// a floor with a wall from x = 100 on (and below y = 0), decal calls recorded, emitters run by hand
function stub() {
  const calls = [], emitters = [];
  const rec = (name) => (...a) => calls.push([name, ...a]);
  const map = { solidAt: (x, y) => x >= 100 || y < 0 };
  const world = {
    map, emitters,
    emit: (x, y, t, fn) => emitters.push({ x, y, t, fn }),
    decals: { runDot: rec('run'), stampBlood: rec('blood'), stampStreak: rec('streak'), splashWall: rec('splash') },
  };
  const step = (sec, dt = 1 / 60) => {
    for (let t = 0; t < sec; t += dt) {
      for (const e of emitters) { e.t -= dt; e.fn(e); }
      world.emitters = emitters.splice(0, emitters.length, ...emitters.filter((e) => e.t > 0));
    }
  };
  return { world, calls, step };
}

test('spatter: the wall behind a man is found along the shot, with its face and normal', () => {
  const { world } = stub();
  const hit = wallBehind(world.map, 60, 50, 0, 80);
  assert.ok(hit && hit.d >= 40 && hit.d <= 42 && hit.x < 100);
  assert.deepEqual([hit.nx, hit.ny], [-1, 0]);
  assert.equal(wallBehind(world.map, 60, 50, 0, 30), null, 'too far');
  assert.deepEqual(faceNormal(world.map, 50, 2, 50, -2), [0, 1]);
});

test('spatter: blood runs down a wall to the floor, over a few seconds, and leaves a drop at its foot', () => {
  const { world, calls, step } = stub();
  assert.ok(run(world, 99, 50, -1, 0, 6));
  assert.equal(runsOf(world), 1);
  step(0.3);
  const early = calls.filter(([n]) => n === 'run').length;
  assert.ok(early > 0 && early < 6, `${early} px after 0.3 s`);
  step(10);
  const dots = calls.filter(([n]) => n === 'run');
  assert.ok(dots.some(([, x]) => x > 100) && dots.some(([, x]) => x < 100), 'from the wall top onto the floor');
  assert.ok(calls.some(([n, x]) => n === 'blood' && x < 100), 'a drop at its foot');
  assert.equal(runsOf(world), 0);
});

test('spatter: runs are capped', () => {
  const { world } = stub();
  let n = 0;
  for (let i = 0; i < RUNS.max + 10; i++) if (run(world, 105, 50, -1, 0, 5)) n++;
  assert.equal(n, RUNS.max);
});

test('spatter: a pistol kill against a wall splashes it, one in the open throws its streaks behind him', () => {
  const near = stub();
  assert.ok(fling(near.world, 80, 50, 0, WOUNDS.small));
  assert.ok(near.calls.some(([n]) => n === 'splash'));
  assert.ok(!near.calls.some(([n, x]) => n === 'streak' && x > 100), 'nothing lands inside the wall');
  const open = stub();
  assert.equal(fling(open.world, -400, 50, 0, WOUNDS.small), null);
  const streaks = open.calls.filter(([n]) => n === 'streak' || n === 'blood');
  assert.ok(streaks.length >= 3 && streaks.every(([, x]) => x > -400 + WOUNDS.small.fling[1] - 1));
});

test('spatter: calibrated by weapon (a .50 throws farther and bursts more skulls than a 9 mm)', () => {
  assert.ok(WOUNDS.heavy.fling[2] > WOUNDS.rifle.fling[2] && WOUNDS.rifle.fling[2] > WOUNDS.small.fling[2]);
  assert.ok(WOUNDS.heavy.wall[0] > WOUNDS.small.wall[0] && WOUNDS.heavy.skull[0] > WOUNDS.small.skull[0]);
  assert.ok(WOUNDS.quiet.fling[0] < WOUNDS.small.fling[0]);
  for (const name of ['punch', 'blunt', 'stab', 'slash', 'throat', 'snap', 'crush']) assert.ok(!WOUNDS[name].fling && !WOUNDS[name].skull, name);
  assert.ok(SKULL.bits[0] <= SKULL.bits[1] && SKULL.runs[0] <= SKULL.runs[1]);
  assert.ok(TEAR.blast.limb > 0 && TEAR.heavy.limb > 0 && TEAR.explosion.gibs === 1);
});

// Blood against a wall (BLOOD_EDGE): a real tile map, a thin wall at column 4, an intact window at (4, 1) and a door
// leaf shut across (4, 5); everything the spray lays on the floor is recorded with its reach
const { TILE } = await load('game/Config.js');
const { default: TileMap } = await load('game/world/TileMap.js');
const { BLOOD_EDGE } = await load('game/data/wounds.js');
const { offFloor, shutBetween } = await load('game/fx/Spatter.js');
const ROOMS = [
  '#########',
  '#...G...#',
  '#...#...#',
  '#...#...#',
  '#...#...#',
  '#...D...#',
  '#########',
];
function rooms(pane = true) {
  const calls = [], rec = (name) => (...a) => calls.push([name, ...a]);
  const map = new TileMap(ROOMS);
  const world = {
    map, emitters: [], emit() {},
    windows: [{ x: 4.5 * TILE, y: 1.5 * TILE, vertical: true, intact: pane }],
    doors: [{ hx: 4.5 * TILE, hy: 5 * TILE, len: TILE, back: 0, body: { angle: Math.PI / 2 } }],
    decals: { runDot: rec('run'), stampBlood: rec('blood'), stampStreak: rec('streak'), splashWall: rec('splash') },
  };
  return { world, calls };
}
// the farthest point a floor mark recorded by fling reaches along +x (a streak's tail and droplets run on ahead; a
// stain at the foot of the wall is cut back from it by the drawing, MapRenderer.trim)
const reach = ([n, x, , , , len]) => (n === 'streak' ? x + len * 1.8 : x);

test('blood edge: a spray fired at a wall never lands in it nor beyond it, whatever the gun', () => {
  for (const name of ['small', 'buckshot', 'rifle', 'heavy']) {
    for (let i = 0; i < 20; i++) {
      const { world, calls } = rooms();
      fling(world, 3.6 * TILE, 3.5 * TILE, 0, WOUNDS[name], 1.6, 0.3);
      for (const c of calls.filter(([n]) => n === 'streak' || n === 'blood')) {
        assert.ok(!world.map.solidAt(c[1], c[2]), `${name}: a mark inside the wall`);
        assert.ok(reach(c) < 4 * TILE, `${name}: a mark running past the wall face (${reach(c)})`);
      }
    }
  }
});

test('blood edge: a shut door and an intact pane take the spray as a wall does; a broken pane lets it by', () => {
  const beyond = (calls) => calls.filter(([n, x]) => (n === 'streak' || n === 'blood') && x > 5 * TILE).length;
  let through = 0;
  for (let i = 0; i < 20; i++) {
    for (const y of [1.5, 5.5]) {
      const { world, calls } = rooms();
      const stop = fling(world, 3.5 * TILE, y * TILE, 0, WOUNDS.heavy, 1.6, 0.05);
      assert.equal(stop, null, 'no wall face splashed through a door or a pane');
      assert.equal(beyond(calls), 0);
      assert.ok(!calls.some(([n]) => n === 'splash'));
    }
    const broken = rooms(false);
    fling(broken.world, 3.5 * TILE, 1.5 * TILE, 0, WOUNDS.heavy, 1.6, 0.05);
    through += beyond(broken.calls);
  }
  assert.ok(through > 0, 'out through the empty frame');
  const { world } = rooms();
  assert.ok(shutBetween(world, 4 * TILE, 5.5 * TILE, 5 * TILE, 5.5 * TILE) && !shutBetween(world, 2 * TILE, 3 * TILE, 3 * TILE, 3 * TILE));
});

test('blood edge: the floor left bare by the walls and windows is BLOOD_EDGE.floor px wide', () => {
  const map = new TileMap(ROOMS), rects = offFloor(map);
  const off = (x, y) => rects.some(([rx, ry, w, h]) => x >= rx && x < rx + w && y >= ry && y < ry + h);
  assert.ok(BLOOD_EDGE.floor >= 2 && BLOOD_EDGE.floor <= 3 && BLOOD_EDGE.face >= 6);
  for (let y = 1 * TILE + 4; y < 5 * TILE - 4; y++) {
    // the wall at column 4 (its window tile too), seen from both sides
    for (let d = 0; d <= 2; d++) assert.ok(off(4 * TILE - 1 - d, y) && off(5 * TILE + d, y), `${d} px from the face at y ${y}`);
    if (y > 2 * TILE && y < 5 * TILE) assert.ok(!off(4 * TILE - 1 - BLOOD_EDGE.floor, y) && !off(5 * TILE + BLOOD_EDGE.floor, y));
  }
  assert.ok(off(4.5 * TILE, 1.5 * TILE), 'a window is no floor');
  assert.ok(!off(4.5 * TILE, 5.5 * TILE), 'a doorway is');
  assert.ok(!off(2 * TILE, 3 * TILE));
});
