import { test } from 'node:test';
import assert from 'node:assert/strict';
import { load } from './setup.mjs';

const { CAMPAIGN, loadProgress, saveProgress, isUnlocked, complete, nextLevel, latest, resetProgress, levelOf, levelNumber, levelTag, levelStart, levelDone, levelBest } = await load('game/systems/Progress.js');
const { CAMPAIGN_LEVELS, TARGETS } = await load('game/data/campaign.js');
const { default: REGISTRY } = await load('game/data/levels/index.js');
const { saveBest, loadBest } = await load('game/systems/Records.js');

const KEY = 'fmr.progress.v1';
const fakeStorage = () => {
  const data = {};
  return { data, getItem: (k) => data[k] ?? null, setItem: (k, v) => { data[k] = String(v); }, removeItem: (k) => { delete data[k]; } };
};
const FRESH = { unlocked: [CAMPAIGN[0]], done: [] };
// the stages made today, as Game.js asks the level registry
const made = (id) => ['tutorial', 'level1', 'level2a'].includes(id);
const level = (n) => CAMPAIGN_LEVELS.find((l) => l.n === n);

test('campaign: the levels as the player sees them: 00 the tutorial, 01 CUEBALL, 02 and 03 JITTERS, then LUCKY and THE BOSS', () => {
  assert.deepEqual(CAMPAIGN_LEVELS.map((l) => l.n), CAMPAIGN_LEVELS.map((_, i) => i), 'numbered in order from 00');
  assert.ok(CAMPAIGN_LEVELS.length >= 8 && CAMPAIGN_LEVELS.length <= 9, 'seven or eight levels and the tutorial');
  assert.deepEqual(CAMPAIGN_LEVELS.map((l) => l.target), [null, 'cueball', 'jitters', 'jitters', ...CAMPAIGN_LEVELS.slice(4).map((l, i) => (i < 2 ? 'lucky' : 'boss'))]);
  assert.deepEqual(TARGETS, ['cueball', 'jitters', 'lucky', 'boss']);
  for (const who of TARGETS) {
    const n = CAMPAIGN_LEVELS.filter((l) => l.target === who).length;
    assert.ok(n >= 1 && n <= 3, `${who}: ${n} levels, a column holds three notes`);
  }
  // 02 is the chase then the gas station, played in a row; nothing else is cut in stages
  assert.deepEqual(level(2).stages, ['level2a', 'level2b']);
  assert.deepEqual(level(3).stages, ['level3']);
  assert.equal(level(3).title, 'THE FLAMINGO MOTEL');
  assert.deepEqual(CAMPAIGN_LEVELS.filter((l) => l.stages.length > 1).map((l) => l.n), [2]);
  assert.equal(new Set(CAMPAIGN).size, CAMPAIGN.length, 'a stage belongs to one level');
  assert.deepEqual(CAMPAIGN.slice(0, 5), ['tutorial', 'level1', 'level2a', 'level2b', 'level3']);
  // a level not made yet has a working title to show; every level of the registry that looks like a campaign one is one
  const has = (id) => !!REGISTRY[id];
  for (const l of CAMPAIGN_LEVELS) assert.ok(l.title || (levelStart(l, has) && REGISTRY[levelStart(l, has)].name), `level ${l.n} has a title`);
  for (const id of Object.keys(REGISTRY).filter((k) => /^level\d/.test(k))) assert.ok(CAMPAIGN.includes(id), `${id} is a stage of the campaign`);
  assert.deepEqual(CAMPAIGN.filter(has), CAMPAIGN.filter(made), 'this test knows what is made');
});

test('campaign: a stage knows its level; the screens number 2A and 2B as level 2', () => {
  assert.equal(levelOf('level2a'), level(2));
  assert.equal(levelOf('level2b'), level(2));
  assert.equal(levelOf('lab'), null);
  assert.deepEqual(['tutorial', 'level1', 'level2a', 'level2b', 'level3', 'lab'].map(levelNumber), [0, 1, 2, 2, 3, null]);
  assert.deepEqual(CAMPAIGN_LEVELS.slice(0, 4).map(levelTag), ['00', '01', '02', '03']);
});

test('campaign: the stages in a row: 2A goes on into 2B once it is made, into what comes next until then', () => {
  assert.equal(nextLevel('tutorial', made), 'level1');
  assert.equal(nextLevel('level1', made), 'level2a');
  assert.equal(nextLevel('level2a', made), null, 'nothing made after the chase yet');
  assert.equal(nextLevel('level2a'), 'level2b', 'the station follows the chase');
  assert.equal(nextLevel('level2a', (id) => made(id) || id === 'level3'), 'level3', 'a stage not made is skipped');
  assert.equal(nextLevel('level2b'), 'level3');
  assert.equal(nextLevel('lab', made), null);
  // a level starts at its first made stage, never in the middle
  assert.equal(levelStart(level(2), made), 'level2a');
  assert.equal(levelStart(level(2)), 'level2a');
  assert.equal(levelStart(level(3), made), null, 'the motel is not made: SOON');
});

test('campaign: a level is done when its last made stage is; an old save with 2A done has 02 done', () => {
  const st = fakeStorage();
  st.setItem(KEY, JSON.stringify({ unlocked: ['tutorial', 'level1', 'level2a'], done: ['tutorial', 'level1', 'level2a'] }));
  const old = loadProgress(st, made);
  assert.deepEqual(old, { unlocked: ['tutorial', 'level1', 'level2a'], done: ['tutorial', 'level1', 'level2a'] }, 'kept as it was');
  assert.ok(levelDone(old, level(2), made), '02 done: 2B is not made');
  assert.ok(!levelDone(old, level(2)), 'once 2B is made, 02 wants it done too');
  assert.ok(!levelDone(old, level(3), made), 'a level with nothing made is never done');
  assert.ok(levelDone(old, level(1), made) && !levelDone(FRESH, level(1), made));
  // the day 2B is made that save opens it; the day the motel is made without it, the motel
  const with2b = (id) => made(id) || id === 'level2b';
  assert.ok(isUnlocked(loadProgress(st, with2b), 'level2b'));
  assert.equal(latest(loadProgress(st, with2b), with2b), 'level2b');
  const with3 = (id) => made(id) || id === 'level3';
  assert.equal(latest(loadProgress(st, with3), with3), 'level3');
  assert.ok(levelDone(complete(old, 'level2b', with2b), level(2), with2b));
});

test('campaign: a level\'s best result is its stages\': 2A\'s own today, both added once 2B is made', () => {
  const bests = { level2a: { total: 18400, grade: 'B', time: 152 }, level2b: { total: 9000, grade: 'A', time: 80 } };
  const best = (id) => bests[id] || null;
  assert.deepEqual(levelBest(level(2), best, made), bests.level2a, '2A\'s record stays readable');
  assert.deepEqual(levelBest(level(2), best), { total: 27400, grade: 'B', time: 232 }, 'scores and times added, the lowest grade');
  assert.equal(levelBest(level(2), (id) => (id === 'level2a' ? bests.level2a : null)), null, 'not before every stage has one');
  assert.equal(levelBest(level(1), best, made), null);
  assert.equal(levelBest(level(3), best, made), null);
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
  const p4 = complete(p2, 'level2a', made);
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
  assert.equal(latest(complete(complete(p, 'level1'), 'level2a', made), made), 'level2a', 'the last one stays what CONTINUE plays');
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
