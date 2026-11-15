import { test } from 'node:test';
import assert from 'node:assert/strict';
import { load } from './setup.mjs';

const { RESULTS, resultsTimeline, resultsBeats } = await load('game/ui/Results.js');
const { describeDeath } = await load('game/ui/Screens.js');
const { tally } = await load('game/systems/Scoring.js');

const LEVEL = { par: 200, grades: [['S', 50000], ['A', 30000], ['D', 0]] };
const STATS = { points: 20000, kills: 12, guards: 14, maxCombo: 5, methods: 6, shots: 10, hits: 7, alerts: 1, civilians: 0, spared: 0, time: 150,
  styled: { slide: 2, execution: 3, wallbang: 1, shot: 4, double: 0 } };

test('results: the tally counts the kill styles done, most first, named ones only', () => {
  const r = tally(STATS, LEVEL);
  assert.deepEqual(r.tags.map((g) => `${g.label} x${g.n}`), ['EXECUTION x3', 'SLIDE KILL x2', 'WALLBANG x1']);
  assert.deepEqual(r.run, { kills: 12, guards: 14, maxCombo: 5, time: 150, par: 200 });
  assert.deepEqual(tally({ ...STATS, styled: undefined }, LEVEL).tags, []);
});

test('results: the beats come in order and the screen can be filled at once', () => {
  const r = { ...tally(STATS, LEVEL), record: true, ranked: true };
  const T = resultsTimeline(r);
  assert.ok(T.tiles[2] < T.lines[0] && T.lines.at(-1) < T.tags[0] && T.tags.at(-1) < T.total && T.total < T.stamp);
  assert.ok(T.stamp < T.record && T.record <= T.prompts && T.end === T.prompts);
  assert.ok(T.end < 6, `the whole screen is up in ${T.end.toFixed(2)} s`);
  assert.equal(T.tags.length, 3);
  const many = { ...r, tags: Array.from({ length: 10 }, (_, i) => ({ key: `k${i}`, label: 'X', n: 1 })) };
  assert.equal(resultsTimeline(many).tags.length, RESULTS.maxTags);
});

test('results: ticks while figures count, the stamp is heard once, the record chimes only when ranked', () => {
  const r = { ...tally(STATS, LEVEL), record: true, ranked: true };
  const T = resultsTimeline(r);
  const names = (a, b, rr = r) => resultsBeats(rr, a, b).map((x) => x.name);
  assert.deepEqual(names(T.lines[0], T.lines[0] + 0.1), ['click']);
  assert.ok(names(T.stamp - 0.01, T.stamp + 0.01).includes('punch'));
  assert.ok(!names(T.stamp + 0.01, T.stamp + 0.5).includes('punch'));
  assert.ok(names(T.record - 0.01, T.record + 0.01).includes('confirm'));
  assert.ok(!names(T.record - 0.01, T.record + 0.01, { ...r, ranked: false }).includes('confirm'));
  // stepping frame by frame over the whole screen: one stamp, one chime
  const all = [];
  for (let t = 0; t < T.end + 1; t += 1 / 60) all.push(...names(t, t + 1 / 60));
  assert.equal(all.filter((n) => n === 'punch').length, 1);
  assert.equal(all.filter((n) => n === 'confirm').length, 1);
});

test('death screen: the cause and the killer, told plainly', () => {
  const guard = (kind, type) => ({ isEnemy: true, kind, weapon: { type } });
  assert.deepEqual(describeDeath('bullet', guard('thug', 'uzi')), { verb: 'SHOT', by: 'BY A THUG  -  UZI' });
  assert.deepEqual(describeDeath('blast', guard('heavy', 'shotgun')), { verb: 'BUCKSHOT', by: 'BY A HEAVY  -  SUPER 90' });
  assert.deepEqual(describeDeath('melee', guard('brute', 'bat')), { verb: 'BEATEN TO DEATH', by: 'BY A BRUTE  -  BASEBALL BAT' });
  assert.deepEqual(describeDeath('slash', guard('thug', 'knife')), { verb: 'CUT DOWN', by: 'BY A THUG  -  KNIFE' });
  assert.deepEqual(describeDeath('explosion', { isPlayer: true }), { verb: 'BLOWN APART', by: 'BY YOUR OWN BLAST' });
  assert.deepEqual(describeDeath('vehicle', { isVehicle: true, type: 'van' }), { verb: 'RUN OVER', by: 'BY A VAN' });
  assert.deepEqual(describeDeath('melee', null), { verb: 'CRUSHED', by: '' });
  assert.equal(describeDeath('whatever', undefined).verb, 'KILLED');
});
