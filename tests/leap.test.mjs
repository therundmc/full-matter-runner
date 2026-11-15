import { test } from 'node:test';
import assert from 'node:assert/strict';
import { load } from './setup.mjs';

const { LEAP, leapView, leapBeats } = await load('game/ui/cine/Leap.js');

test('leap: out of the window, down, a roll, on one knee, up and away, then black', () => {
  const poses = [];
  let prev = leapView(0);
  assert.equal(prev.pose, 'fall');
  assert.deepEqual([Math.round(prev.x), Math.round(prev.y)], LEAP.from, 'he starts at the window');
  for (let t = 0; t <= LEAP.end + 0.1; t += 0.01) {
    const v = leapView(t);
    if (poses.at(-1) !== v.pose) poses.push(v.pose);
    assert.ok(v.x >= prev.x - 1e-9, `he never goes back (${t.toFixed(2)})`);
    assert.ok(v.fade >= prev.fade - 1e-9);
    assert.ok(v.y <= 190 + 1e-9, 'never under the ground');
    prev = v;
  }
  assert.deepEqual(poses, ['fall', 'ball', 'kneel', 'stand', 'walk']);
  assert.ok(Math.abs(leapView(LEAP.roll[0] - 1e-6).y - 190) < 1, 'he reaches the ground as the roll starts');
  assert.ok(leapView(LEAP.end).over && !leapView(LEAP.end - 0.01).over && leapView(LEAP.end).fade === 1);
  assert.ok(leapView(LEAP.end).words >= LEAP.line.length, 'the words are all out before it ends');
});

test('leap: the glass, the landing, the roll, his steps, each once', () => {
  const heard = [];
  for (let t = -0.01; t < LEAP.end; t += 1 / 60) heard.push(...leapBeats(t, t + 1 / 60).map((b) => b.name));
  assert.deepEqual(heard, ['glass', 'crackle', 'bodyFall', 'rollUp', 'step', 'step', 'step', 'step']);
});
