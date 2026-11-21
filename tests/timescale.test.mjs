// The world's clock (systems/TimeScale.js): one rule for the sandbox's speed, the world's slow motion, a lesson's, the
// kill cam's clock and a chase beat, and the hit-stop.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { load } from './setup.mjs';

const { default: TimeScale } = await load('game/systems/TimeScale.js');
const { GAME } = await load('game/data/game.js');

const DT = 1 / 60;
const near = (a, b, msg) => assert.ok(Math.abs(a - b) < 1e-9, `${msg}: ${a} vs ${b}`);

test('timescale: at rest it stays at 1; the sandbox\'s speed is eased toward', () => {
  const ts = new TimeScale();
  assert.equal(ts.update(DT), 1);
  const k = 1 - Math.pow(GAME.ease, DT);
  near(ts.update(DT, { base: 0.5 }), 1 + (0.5 - 1) * k, 'one frame of easing');
  for (let i = 0; i < 600; i++) ts.update(DT, { base: 0.5 });
  near(ts.scale, 0.5, 'there in the end');
});

test('timescale: the world\'s slow motion lowers the target, counted on the real clock', () => {
  const ts = new TimeScale();
  ts.slowmo(0.2, 0.5);
  let low = 1, n = 0;
  while (ts.slow) { low = Math.min(low, ts.update(DT)); n++; }
  assert.ok(low < 0.5 && low > 0.2, 'eased down toward it');
  assert.ok(Math.abs(n - 0.5 / DT) <= 1, `over after its real seconds (${n} frames)`);
  const back = ts.update(DT);
  assert.ok(back > low, 'eased back up');
  // the sandbox slower still: the slowest wins
  ts.slowmo(0.6, 1);
  for (let i = 0; i < 600; i++) ts.update(DT, { base: 0.3 });
  near(ts.scale, 0.3, 'the slowest of the two');
});

test('timescale: a world playing on by itself runs at 1 and its slow motion is not counted', () => {
  const ts = new TimeScale();
  ts.scale = 0.4;
  ts.slowmo(0.2, 1);
  ts.update(DT, { auto: true, base: 0.1 });
  assert.ok(ts.scale > 0.4, 'eased back toward 1, the sandbox\'s speed aside');
  assert.deepEqual(ts.slow, { scale: 0.2, t: 1 }, 'its time untouched');
});

test('timescale: a lesson is asked after the slow motion is counted; its beat sets the scale at once', () => {
  const ts = new TimeScale(), seen = [];
  ts.slowmo(0.5, 1);
  const r = ts.update(DT, { lesson: () => { seen.push(ts.slow.t); return { scale: 0.25, beat: true }; } });
  near(seen[0], 1 - DT, 'the slow motion already counted');
  assert.equal(r, 0.25, 'its own ramp: no easing of ours');
  // no beat: the lowest of the slow motion and the lesson, eased toward
  const e = new TimeScale();
  e.update(DT, { lesson: () => ({ scale: 0.25, beat: false }) });
  near(e.scale, 1 + (0.25 - 1) * (1 - Math.pow(GAME.ease, DT)), 'eased');
  // a slow motion the lesson asks for is the next frame's
  const n = new TimeScale();
  n.update(DT, { lesson: () => { n.slowmo(0.1, 1); return { scale: 1, beat: true }; } });
  assert.equal(n.scale, 1);
  assert.equal(n.update(DT, { lesson: () => ({ scale: 1, beat: true }) }), 0.1);
});

test('timescale: the kill cam\'s clock comes after the easing and sees the target; a chase beat has the last word', () => {
  const ts = new TimeScale(), args = [];
  ts.slowmo(0.5, 1);
  const r = ts.update(DT, { clock: (scale, target) => { args.push([scale, target]); return 0.3; } });
  assert.equal(r, 0.3);
  near(args[0][0], 1 + (0.5 - 1) * (1 - Math.pow(GAME.ease, DT)), 'handed the eased scale');
  assert.equal(args[0][1], 0.5, 'and the target');
  // a chase beat: min(target, its scale), whatever the easing and the kill cam did
  const c = new TimeScale();
  assert.equal(c.update(DT, { clock: () => 0.9, chase: 0.4 }), 0.4);
  assert.equal(c.update(DT, { base: 0.2, clock: () => 0.9, chase: 0.4 }), 0.2, 'never above the target');
  assert.equal(c.update(DT, { chase: null }) < 1, true, 'none: eased back from where it was');
});

test('timescale: the hit-stop holds the steps for the longest asked, counted down on the real clock; reset lets all go', () => {
  const ts = new TimeScale();
  assert.equal(ts.held(DT), false);
  ts.stop(0.05);
  ts.stop(0.02);
  assert.equal(ts.hitstop, 0.05, 'the longest');
  let n = 0;
  while (ts.held(DT)) n++;
  assert.ok(Math.abs(n - 0.05 / DT) <= 1, `${n} frames held`);
  assert.ok(ts.hitstop <= 0);
  ts.stop(1); ts.slowmo(0.2, 1); ts.scale = 0.3;
  ts.reset();
  assert.deepEqual([ts.hitstop, ts.slow, ts.scale], [0, null, 1]);
});
