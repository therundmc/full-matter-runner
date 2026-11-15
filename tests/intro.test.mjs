import { test } from 'node:test';
import assert from 'node:assert/strict';
import { load } from './setup.mjs';

const { INTRO, introTimeline, introBeats, introTint, SHUTTER_SOUND } = await load('game/ui/Screens.js');
const { default: level1 } = await load('game/data/levels/level1.js');
const { default: tutorial } = await load('game/data/levels/tutorial.js');

test('level card: the beats come in order, all up well before it leaves by itself', () => {
  for (const level of [level1, tutorial]) {
    const T = introTimeline(level);
    assert.ok(INTRO.bars < T.label && T.label < T.land && T.land < T.band && T.band < T.typed && T.typed < T.objective);
    assert.ok(T.objective < T.leave - 0.8, `the objective is up ${(T.leave - T.objective).toFixed(2)} s before the card leaves`);
    assert.ok(T.leave + INTRO.out <= 2.7, 'punchy: the card and its shutter are over in under 2.7 s');
    assert.ok(INTRO.skipAfter < T.land, 'it can be skipped before the name has landed');
  }
});

test('level card: one stamp, one rush, ticks while the place is typed, one click a frame at most', () => {
  const T = introTimeline(level1), names = (a, b, lv = level1) => introBeats(lv, a, b).map((x) => x.name);
  assert.ok(names(T.land - 0.01, T.land + 0.01).includes('punch'));
  assert.deepEqual(names(T.typed - 0.1, T.typed - 0.05), ['click']);
  assert.ok(names(T.objective - 0.01, T.objective + 0.01).includes('ui'));
  const all = [];
  for (let t = 0; t < INTRO.leave; t += 1 / 60) {
    const beat = names(t, t + 1 / 60);
    assert.ok(beat.filter((n) => n === 'click').length <= 1);
    all.push(...beat);
  }
  assert.equal(all.filter((n) => n === 'punch').length, 1);
  assert.equal(all.filter((n) => n === 'swing').length, 1);
  assert.equal(all.filter((n) => n === 'ui').length, 1);
  assert.ok(all.filter((n) => n === 'click').length > 10, 'the typing is heard');
  // a level without a subtitle or an objective: no band, no ticks, no click
  const bare = { name: 'TEST' };
  const quiet = [];
  for (let t = 0; t < INTRO.leave; t += 1 / 60) quiet.push(...names(t, t + 1 / 60, bare));
  assert.deepEqual(quiet.filter((n) => n !== 'click').sort(), ['bodyFall', 'bodyFall', 'punch']);
  assert.equal(quiet.filter((n) => n === 'click').length, 1, 'only the label knocks');
});

test('level card: a colour per level, level 1 for the unknown, the shutter a known sound', () => {
  assert.notEqual(introTint('tutorial').main, introTint('level1').main);
  assert.deepEqual(introTint('lab'), introTint('level1'));
  assert.equal(SHUTTER_SOUND.name, 'swing');
});
