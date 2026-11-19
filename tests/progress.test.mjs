import { test } from 'node:test';
import assert from 'node:assert/strict';
import { load } from './setup.mjs';

const { CAMPAIGN, loadProgress, saveProgress, isUnlocked, complete, nextLevel, latest, resetProgress, levelTag } = await load('game/systems/Progress.js');
const { saveBest, loadBest } = await load('game/systems/Records.js');

const KEY = 'fmr.progress.v1';
const fakeStorage = () => {
  const data = {};
  return { data, getItem: (k) => data[k] ?? null, setItem: (k, v) => { data[k] = String(v); }, removeItem: (k) => { delete data[k]; } };
};
const FRESH = { unlocked: [CAMPAIGN[0]], done: [] };

test('progress: the campaign opens with the tutorial, then level 1, then 2A (the chase)', () => {
  assert.deepEqual(CAMPAIGN, ['tutorial', 'level1', 'level2a']);
  assert.equal(nextLevel('tutorial'), 'level1');
  assert.equal(nextLevel('level1'), 'level2a');
  assert.equal(nextLevel('level2a'), null, '2B is not made yet');
  assert.equal(nextLevel('lab'), null);
  assert.deepEqual(['tutorial', 'level1', 'level2a', 'level2b', 'lab'].map(levelTag), [null, '1', '2A', '2B', null]);
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
  assert.deepEqual(loadProgress(st), { unlocked: ['tutorial', 'level1', 'level2a'], done: ['level1'] });
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
  assert.ok(isUnlocked(p2, 'level2a'), 'level 1 done opens 2A');
  const p4 = complete(p2, 'level2a');
  assert.deepEqual(p4.done, ['tutorial', 'level1', 'level2a']);
  assert.deepEqual(p4.unlocked, p2.unlocked, 'the last level opens nothing more');
  assert.deepEqual(complete(p2, 'lab'), p2, 'a level outside the campaign changes nothing');
  saveProgress(p2, st);
  assert.deepEqual(loadProgress(st), p2);
  // level 1 played without the tutorial (it was not there yet): open and done all the same
  const p3 = complete(FRESH, 'level1');
  assert.ok(isUnlocked(p3, 'level1'));
});

test('progress: a save from before 2A was in the campaign (level 1 done) opens it on load, and CONTINUE goes there', () => {
  const st = fakeStorage();
  st.setItem(KEY, JSON.stringify({ unlocked: ['tutorial', 'level1'], done: ['tutorial', 'level1'] }));
  const p = loadProgress(st);
  assert.ok(isUnlocked(p, 'level2a'));
  assert.equal(latest(p, () => true), 'level2a');
  assert.equal(latest(p, (id) => id !== 'level2a'), 'level1', 'a level not in the registry is skipped');
  st.setItem(KEY, JSON.stringify({ unlocked: ['tutorial', 'level1'], done: ['tutorial'] }));
  assert.ok(!isUnlocked(loadProgress(st), 'level2a'), 'level 1 not done: 2A stays shut');
});

test('progress: latest is the furthest open level that exists', () => {
  const all = () => true, noTutorial = (id) => id !== 'tutorial';
  assert.equal(latest(FRESH, all), 'tutorial');
  assert.equal(latest(FRESH, noTutorial), null);
  const p = complete(FRESH, 'tutorial');
  assert.equal(latest(p, all), 'level1');
  assert.equal(latest(complete(p, 'level1'), all), 'level2a');
  assert.equal(latest(complete(complete(p, 'level1'), 'level2a'), all), 'level2a', 'the last one stays what CONTINUE plays');
  assert.equal(latest(p, (id) => id === 'tutorial'), 'tutorial');
  assert.equal(latest(complete(FRESH, 'level1'), noTutorial), 'level2a');
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
