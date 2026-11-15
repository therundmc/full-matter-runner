import { test } from 'node:test';
import assert from 'node:assert/strict';
import { load } from './setup.mjs';

const { GAIT, advanceGait, footAt, stanceAt, reachAt, cadenceAt, paceOf } = await load('game/entities/Gait.js');
const { WEAPONS } = await load('game/data/weapons.js');
const { PLAYER, ENEMY } = await load('game/Config.js');

const walker = () => ({ walk: 0, strideV: 0, runK: 0, gait: 1, angle: 0, backward: false, hipsGoal: 0, strideA: 0 });
// footfalls per second at sp px/step, once the gait has settled
function stepsPerSecond(sp) {
  const ch = walker();
  for (let i = 0; i < 120; i++) advanceGait(ch, sp, 1 / 60, 0);
  let n = 0;
  for (let i = 0; i < 600; i++) n += advanceGait(ch, sp, 1 / 60, 0);
  return n / 10;
}

test('gait: a walk is under two steps a second, a run about three, and the run is the faster cadence', () => {
  const walk = stepsPerSecond(ENEMY.walkSpeed), run = stepsPerSecond(PLAYER.speed);
  assert.ok(walk >= 1.5 && walk < 2, `walk ${walk}`);
  assert.ok(run >= 2.7 && run <= 3.4, `run ${run}`);
  assert.ok(stepsPerSecond(ENEMY.runSpeed) > walk);
});

test('gait: a planted foot goes back under the body nearly as fast as the body goes over it (little slip)', () => {
  for (const sp of [ENEMY.walkSpeed, ENEMY.runSpeed, PLAYER.speed]) {
    const v = paceOf(sp), beta = stanceAt(v), R = reachAt(v);
    const drawn = 2 * R / (beta * 2 / cadenceAt(v));   // pose px/s the planted foot moves at
    const real = v * 32;                                 // pose px/s the body moves at
    assert.ok(drawn / real > 0.6 && drawn / real <= 1, `${sp}: ${drawn / real}`);
    assert.ok(R <= GAIT.reach);
  }
  const F = {};
  footAt(0, 10, 0.5, F); assert.equal(F.x, 10); assert.equal(F.lift, 0);
  footAt(0.75, 10, 0.5, F); assert.ok(Math.abs(F.x) < 1e-9 && F.lift === 1, 'mid-swing: passing the other foot, lifted');
});

test('gait: stopping finishes the step on both feet, then the cycle holds still', () => {
  const ch = walker();
  for (let i = 0; i < 100; i++) advanceGait(ch, 2, 1 / 60, 0);
  let n = 0;
  for (let i = 0; i < 120; i++) { ch.gait *= 0.9; n += advanceGait(ch, 0, 1 / 60, 0); }
  const w = ch.walk;
  advanceGait(ch, 0, 1 / 60, 0);
  assert.equal(ch.walk, w, 'still');
  assert.ok(n <= 1, 'at most the step under way comes down');
});

test('gait: walking backwards keeps the hips to the facing', () => {
  const ch = walker();
  advanceGait(ch, 1, 1 / 60, Math.PI);
  assert.ok(ch.backward);
  assert.ok(Math.abs(ch.hipsGoal) < 1e-9);
});

test('weapons: every shouldered gun has its front hand ahead of its grip, on the sprite', () => {
  for (const [name, d] of Object.entries(WEAPONS)) {
    if (d.hold !== 'two') continue;
    assert.ok(d.fore > d.grip, name);
    assert.ok((d.butt ?? 0.5) < d.grip, name);
  }
  assert.equal(WEAPONS.rifle.name, 'M16');
});
