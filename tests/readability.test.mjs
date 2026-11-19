import { test } from 'node:test';
import assert from 'node:assert/strict';
import { load } from './setup.mjs';

const { default: Cues, cuesOn, fadeAt, glintAt, reachAlpha, floorLift } = await load('game/render/Readability.js');
const { READABILITY: R } = await load('game/data/readability.js');

// a 2D context that only counts what is asked of it
function recorder() {
  const calls = [];
  return { calls, ctx: new Proxy({}, { get: (o, k) => (k in o ? o[k] : (...a) => calls.push(k)), set: (o, k, v) => { o[k] = v; return true; } }) };
}

test('readability: cues only in play, never in a cinematic, the title, the pause menu or a staged scene', () => {
  assert.equal(cuesOn('play'), true);
  for (const s of ['cinematic', 'title', 'pause', 'intro', 'loading', 'outro', 'results', 'dead', 'fall', 'ending']) assert.equal(cuesOn(s), false, s);
  assert.equal(cuesOn('play', true), false, 'the tutorial opening');
});

test('readability: the glint is periodic, bounded, at rest most of the time, and phased per item', () => {
  const G = R.glint;
  assert.ok(G.period >= 1, 'no faster than about 1 Hz');
  let lit = 0, n = 0;
  for (let t = 0; t < 20; t += 0.01) {
    for (const seed of [0, 0.3, 0.77]) {
      const g = glintAt(t, seed), h = glintAt(t + G.period, seed);
      assert.ok(Math.abs((g?.a ?? 0) - (h?.a ?? 0)) < 1e-6, 'periodic');
      if (g) {
        assert.ok(g.a >= 0 && g.a <= G.alpha && g.s >= 0 && g.s < 1, 'bounded');
        lit++;
      }
      n++;
    }
  }
  assert.ok(lit / n < 0.25, 'at rest most of the time');
  assert.ok(glintAt(-3.3, 0.1) === null || glintAt(-3.3, 0.1).a <= G.alpha, 'negative times too');
  assert.notDeepEqual(glintAt(0.1, 0), glintAt(0.1, 0.5), 'two weapons do not glint together');
});

test('readability: the in-reach pulse and the distance fade are bounded', () => {
  for (let t = 0; t < 10; t += 0.013) {
    const a = reachAlpha(t);
    assert.ok(a >= 0 && a <= 1);
  }
  assert.equal(fadeAt(0), 1);
  assert.equal(fadeAt(R.fade.near), 1);
  assert.equal(fadeAt(R.fade.far), 0);
  assert.equal(fadeAt(1e5), 0);
  let last = 1;
  for (let d = 0; d < R.fade.far + 50; d += 5) { const f = fadeAt(d); assert.ok(f <= last + 1e-12); last = f; }
});

test('readability: the light floor only ever adds light, and none where it is lit already', () => {
  const F = R.floor;
  for (let level = 0; level <= 1.5; level += 0.01) {
    const lift = floorLift(level);
    assert.ok(lift >= 0, 'never darker');
    assert.ok(lift <= F.max);
    if (level >= F.level) assert.equal(lift, 0, 'a lit room is left as it is');
    else assert.ok(level + lift >= Math.min(F.level, level + F.max) - 1e-12, 'lifted to the floor');
  }
  assert.ok(/^#[0-9a-f]{6}$/i.test(F.color));
});

test('readability: nothing is drawn when cues are off', () => {
  const player = { alive: true, x: 10, y: 10, sit: 0, knocked: 0 };
  const world = { time: 0, cues: false, player, items: [] };
  const cues = new Cues(world);
  const r = recorder();
  cues.drawItems(r.ctx, () => true);
  assert.equal(r.calls.length, 0, 'off');
});
