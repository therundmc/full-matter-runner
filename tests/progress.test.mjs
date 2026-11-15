import { test } from 'node:test';
import assert from 'node:assert/strict';
import { load } from './setup.mjs';

const { CAMPAIGN, loadProgress, saveProgress, isUnlocked, complete, nextLevel, latest, resetProgress } = await load('game/systems/Progress.js');
const { saveBest, loadBest } = await load('game/systems/Records.js');

const KEY = 'fmr.progress.v1';
const fakeStorage = () => {
  const data = {};
  return { data, getItem: (k) => data[k] ?? null, setItem: (k, v) => { data[k] = String(v); }, removeItem: (k) => { delete data[k]; } };
};
const FRESH = { unlocked: [CAMPAIGN[0]], done: [] };

test('progress: the campaign opens with the tutorial, then level 1', () => {
  assert.deepEqual(CAMPAIGN, ['tutorial', 'level1']);
  assert.equal(nextLevel('tutorial'), 'level1');
  assert.equal(nextLevel('level1'), null);
  assert.equal(nextLevel('lab'), null);
});

test('progress: a fresh save has only the first level open', () => {
  const p = loadProgress(fakeStorage());
  assert.deepEqual(p, FRESH);
  assert.ok(isUnlocked(p, 'tutorial'));
  assert.ok(!isUnlocked(p, 'level1'));
});

test('progress: garbage in storage falls back to a fresh save, a throwing or missing storage never throws', () => {
  const st = fakeStorage();
  for (const bad of ['{nope', 'null', '42', '"x"', JSON.stringify({ unlocked: 'level1', done: { a: 1 } })]) {
    st.setItem(KEY, bad);
    assert.deepEqual(loadProgress(st), FRESH, bad);
  }
  // stray values are dropped, the first level is put back, what was finished counts as open
  st.setItem(KEY, JSON.stringify({ unlocked: [3, null, 'level1', 'level1'], done: ['level1', {}] }));
  assert.deepEqual(loadProgress(st), { unlocked: ['tutorial', 'level1'], done: ['level1'] });
  const thrower = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('full'); }, removeItem() { throw new Error('no'); } };
  assert.deepEqual(loadProgress(thrower), FRESH);
  assert.doesNotThrow(() => saveProgress(FRESH, thrower));
  assert.deepEqual(resetProgress(thrower), FRESH);
  assert.deepEqual(loadProgress(null), FRESH);
  assert.doesNotThrow(() => saveProgress(FRESH, null));
  assert.deepEqual(resetProgress(null), FRESH);
});

test('progress: finishing a level marks it done and opens the next one, and is kept', () => {
  const st = fakeStorage();
  const p0 = loadProgress(st), p1 = complete(p0, 'tutorial');
  assert.deepEqual(p0, FRESH, 'complete returns a new progress');
  assert.deepEqual(p1, { unlocked: ['tutorial', 'level1'], done: ['tutorial'] });
  assert.deepEqual(complete(p1, 'tutorial'), p1, 'twice is once');
  const p2 = complete(p1, 'level1');
  assert.deepEqual(p2.done, ['tutorial', 'level1']);
  assert.deepEqual(complete(p2, 'lab'), p2, 'a level outside the campaign changes nothing');
  saveProgress(p2, st);
  assert.deepEqual(loadProgress(st), p2);
  // level 1 played without the tutorial (it was not there yet): open and done all the same
  const p3 = complete(FRESH, 'level1');
  assert.ok(isUnlocked(p3, 'level1'));
});

test('progress: latest is the furthest open level that exists', () => {
  const all = () => true, noTutorial = (id) => id !== 'tutorial';
  assert.equal(latest(FRESH, all), 'tutorial');
  assert.equal(latest(FRESH, noTutorial), null);
  const p = complete(FRESH, 'tutorial');
  assert.equal(latest(p, all), 'level1');
  assert.equal(latest(p, (id) => id === 'tutorial'), 'tutorial');
  assert.equal(latest(complete(FRESH, 'level1'), noTutorial), 'level1');
  assert.equal(latest(FRESH, () => false), null);
});

test('progress: a reset forgets the progression and the best results', () => {
  const st = fakeStorage();
  saveProgress(complete(complete(FRESH, 'tutorial'), 'level1'), st);
  saveBest('level1', { total: 12000, grade: 'A', time: 200 }, st);
  assert.ok(loadBest('level1', st));
  assert.deepEqual(resetProgress(st), FRESH);
  assert.deepEqual(loadProgress(st), FRESH);
  assert.equal(loadBest('level1', st), null);
});
