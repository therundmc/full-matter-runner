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
