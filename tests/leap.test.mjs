import { test } from 'node:test';
import assert from 'node:assert/strict';
import { load } from './setup.mjs';

const { LEAP, leapView, leapBeats } = await load('game/ui/cine/Leap.js');

test('leap: a comic page of the jump, then "the next day" on black, then over', () => {
  for (let i = 1; i < LEAP.panels.length; i++) assert.ok(LEAP.panels[i] > LEAP.panels[i - 1], 'the panels one after the other');
  assert.ok(LEAP.panels.at(-1) + 1 < LEAP.out && LEAP.out <= LEAP.later && LEAP.later < LEAP.end);
  assert.ok(leapView(0).page && !leapView(0).over && leapView(0).words === 0);
  assert.ok(!leapView(LEAP.later).page);
  assert.ok(leapView(LEAP.end - 0.3).words >= LEAP.line.length, 'the line is all out before it ends');
  assert.ok(leapView(LEAP.end).over && !leapView(LEAP.end - 0.01).over);
  assert.equal(LEAP.line, 'THE NEXT DAY.');
});

test('leap: the glass, the wind, the landing, the roll, each once and in order', () => {
  const heard = [];
  for (let t = -0.01; t < LEAP.end; t += 1 / 60) heard.push(...leapBeats(t, t + 1 / 60).map((b) => b.name));
  assert.deepEqual(heard, ['glass', 'crackle', 'gust', 'bodyFall', 'rollUp', 'crackle']);
});
