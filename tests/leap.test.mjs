import { test } from 'node:test';
import assert from 'node:assert/strict';
import { load } from './setup.mjs';

const { LEAP, leapView, leapBeats } = await load('game/ui/cine/Leap.js');

test('leap: heard in the dark, then "the next day" on black, then over', () => {
  assert.ok(LEAP.land < LEAP.later && LEAP.later < LEAP.end);
  assert.ok(!leapView(0).over && leapView(0).words === 0);
  assert.ok(leapView(LEAP.end - 0.3).words >= LEAP.line.length, 'the line is all out before it ends');
  assert.ok(leapView(LEAP.end).over && !leapView(LEAP.end - 0.01).over);
  assert.equal(LEAP.line, 'THE NEXT DAY.');
});

test('leap: the glass, the wind, the landing, the roll, each once and in order', () => {
  const heard = [];
  for (let t = -0.01; t < LEAP.end; t += 1 / 60) heard.push(...leapBeats(t, t + 1 / 60).map((b) => b.name));
  assert.deepEqual(heard, ['glass', 'gust', 'bodyFall', 'rollUp']);
});
