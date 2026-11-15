import { test } from 'node:test';
import assert from 'node:assert/strict';
import { load } from './setup.mjs';

const { LEAP, leapView, leapBeats } = await load('game/ui/cine/Leap.js');

test('leap: heard in the dark, then the card of the alley with "the next day" typed on it, then over', () => {
  assert.ok(LEAP.land < LEAP.later && LEAP.later < LEAP.type && LEAP.type < LEAP.end);
  assert.ok(!leapView(0).over && leapView(0).words === 0 && leapView(0).card === 0, 'the fall is only heard');
  assert.equal(leapView(LEAP.later - 0.01).card, 0);
  assert.equal(leapView(LEAP.type).card, 1, 'the card is down before the words come');
  assert.equal(leapView(LEAP.type - 0.01).words, 0);
  assert.ok(leapView(LEAP.end - 1).words === LEAP.line.length, 'the line is all out a second before it ends');
  let prev = 0;
  for (let t = 0; t < LEAP.end; t += 0.02) {
    const w = leapView(t).words;
    assert.ok(w >= prev && w <= LEAP.line.length);
    prev = w;
  }
  assert.ok(leapView(LEAP.end).over && !leapView(LEAP.end - 0.01).over && leapView(LEAP.end).card === 0);
  assert.equal(LEAP.line, 'THE NEXT DAY.');
});

test('leap: the glass, the wind, the landing, the roll, each once and in order', () => {
  const heard = [];
  for (let t = -0.01; t < LEAP.end; t += 1 / 60) heard.push(...leapBeats(t, t + 1 / 60).map((b) => b.name));
  assert.deepEqual(heard, ['glass', 'gust', 'bodyFall', 'rollUp']);
});
