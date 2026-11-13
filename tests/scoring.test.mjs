import { test } from 'node:test';
import assert from 'node:assert/strict';
import { load } from './setup.mjs';

const { default: EventBus } = await load('engine/EventBus.js');
const { default: Scoring, killStyle, comboMultiplier, gradeFor, tally } = await load('game/systems/Scoring.js');
const { SCORING, LEVEL_SCORING, levelScoring } = await load('game/data/scoring.js');
const { loadBest, saveBest } = await load('game/systems/Records.js');

const S = SCORING.styles;
const player = (type, swing = 0) => ({ isPlayer: true, weapon: type ? { type } : null, swing });
const guard = (over = {}) => ({ isEnemy: true, x: 0, y: 0, aware: 2, knocked: 0, ...over });
const world = (guards = 5) => ({ events: new EventBus(), time: 0, texts: [], totalEnemies: guards });
const kill = (w, cause, killer, victim = guard()) => w.events.emit('kill', { victim, cause, killer });

test('scoring: a kill is read from its cause and the weapon in hand', () => {
  assert.deepEqual(killStyle({ cause: 'bullet', killer: player('pistol') }), { style: 'shot', method: 'pistol' });
  assert.deepEqual(killStyle({ cause: 'blast', killer: player('shotgun') }), { style: 'pointBlank', method: 'shotgun' });
  assert.deepEqual(killStyle({ cause: 'slash', killer: player('knife', 1) }), { style: 'blade', method: 'knife' });
  assert.deepEqual(killStyle({ cause: 'melee', killer: player('bat', 0.2) }), { style: 'melee', method: 'bat' });
  assert.deepEqual(killStyle({ cause: 'execute', killer: player() }), { style: 'execution', method: 'execution' });
  const p = player();
  assert.deepEqual(killStyle({ cause: 'snap', killer: p, victim: { held: p } }), { style: 'takedown', method: 'takedown' });
  assert.deepEqual(killStyle({ cause: 'slash', killer: p, victim: { held: p } }), { style: 'takedown', method: 'takedown' });
  assert.deepEqual(killStyle({ cause: 'explosion', killer: null }), { style: 'explosion', method: 'explosion' });
});

test('scoring: wreckage sent flying is not a blow of the weapon in hand', () => {
  assert.equal(killStyle({ cause: 'melee', killer: player('pistol') }).style, 'debris');
  assert.equal(killStyle({ cause: 'melee', killer: player('bat', 0) }).style, 'debris');
  assert.equal(killStyle({ cause: 'glass', killer: player('pistol') }).style, 'glass');
});

test('scoring: kills the player had no hand in are worth nothing', () => {
  assert.equal(killStyle({ cause: 'vehicle', killer: { isVehicle: true } }), null);
  assert.equal(killStyle({ cause: 'bullet', killer: { isEnemy: true, weapon: { type: 'pistol' } } }), null);
  const w = world(), sc = new Scoring(w);
  kill(w, 'vehicle', { isVehicle: true });
  assert.equal(sc.kills, 1);
  assert.equal(sc.points, 0);
  assert.equal(sc.combo, 0);
});

test('scoring: getting close pays more than pulling a trigger', () => {
  assert.ok(S.melee.points > S.pointBlank.points && S.pointBlank.points > S.shot.points);
  assert.ok(S.blade.points > S.shot.points && S.execution.points > S.melee.points);
  assert.ok(S.debris.points > S.explosion.points && S.explosion.points > S.shot.points);
});

test('scoring: the multiplier climbs with the chain and is capped', () => {
  const c = SCORING.combo;
  assert.equal(comboMultiplier(0), 1);
  assert.equal(comboMultiplier(1), 1);
  assert.equal(comboMultiplier(2), 1 + c.step);
  assert.equal(comboMultiplier(99), c.max);
});

test('scoring: kills inside the window chain, a pause breaks the chain', () => {
  const w = world(), sc = new Scoring(w), c = SCORING.combo;
  kill(w, 'bullet', player('pistol'));
  assert.equal(sc.points, S.shot.points);
  assert.equal(sc.comboLeft, 1);
  w.time = c.window * 0.5;
  assert.equal(sc.comboLeft, 0.5);
  kill(w, 'bullet', player('pistol'));
  assert.equal(sc.combo, 2);
  assert.equal(sc.points, S.shot.points + S.shot.points * (1 + c.step));
  w.time += c.window + 0.1;
  sc.update();
  assert.equal(sc.combo, 0);
  assert.equal(sc.multiplier, 1);
  kill(w, 'bullet', player('pistol'));
  assert.equal(sc.combo, 1);
  assert.equal(sc.maxCombo, 2);
});

test('scoring: a guard who never knew is worth more, a floored one is not "unseen"', () => {
  const w = world(), sc = new Scoring(w);
  kill(w, 'slash', player('knife', 1), guard({ aware: 0 }));
  assert.equal(sc.points, S.blade.points + SCORING.unseen);
  assert.match(w.texts[0].str, /UNSEEN/);
  const w2 = world(), sc2 = new Scoring(w2);
  kill(w2, 'execute', player(), guard({ aware: 0, knocked: 2 }));
  assert.equal(sc2.points, S.execution.points);
});

test('scoring: flooring a guard pays a little and gives the chain some air', () => {
  const w = world(), sc = new Scoring(w), c = SCORING.combo;
  w.events.emit('knock', { victim: guard(), cause: 'punch', angle: 0 });
  assert.equal(sc.points, 0);
  kill(w, 'bullet', player('pistol'));
  w.time = c.window - 0.2;
  w.events.emit('knock', { victim: guard(), cause: 'throw', angle: 0 });
  assert.equal(sc.points, S.shot.points + SCORING.knock.throw);
  w.time = c.window + 0.5; // past the original window, inside the refill
  sc.update();
  assert.equal(sc.combo, 1);
  // a knock-down never starts a chain nor shortens a fresh one
  const w2 = world(), sc2 = new Scoring(w2);
  w2.events.emit('knock', { victim: guard(), cause: 'slide', angle: 0 });
  assert.equal(sc2.combo, 0);
  kill(w2, 'bullet', player('pistol'));
  w2.events.emit('knock', { victim: guard(), cause: 'slide', angle: 0 });
  assert.equal(sc2.comboLeft, 1);
});

test('scoring: accuracy counts trigger pulls of the player only', () => {
  const w = world(), sc = new Scoring(w), p = player('pistol');
  w.events.emit('shot', { shooter: p });
  w.events.emit('shot', { shooter: p });
  w.events.emit('shot', { shooter: guard() });
  kill(w, 'bullet', p);
  kill(w, 'slash', player('knife', 1));
  assert.equal(sc.shots, 2);
  assert.equal(sc.hits, 1);
  // a rocket that kills is a hit, a barrel going off is not
  w.events.emit('shot', { shooter: p });
  w.events.emit('explosion', { x: 0, y: 0, radius: 100, source: 'rocket' });
  kill(w, 'explosion', p);
  assert.equal(sc.hits, 2);
  w.time = 5;
  w.events.emit('explosion', { x: 0, y: 0, radius: 100, source: 'barrel' });
  kill(w, 'explosion', p);
  assert.equal(sc.hits, 2);
});

test('scoring: every ALERT and every passer-by costs', () => {
  const w = world(), sc = new Scoring(w);
  for (const phase of ['caution', 'alert', 'evasion', 'caution', 'alert', 'normal']) w.events.emit('alertPhase', { phase });
  assert.equal(sc.alerts, 2);
  kill(w, 'bullet', player('pistol'));
  kill(w, 'bullet', player('pistol'), { isCivilian: true, x: 0, y: 0 });
  kill(w, 'vehicle', { isVehicle: true }, { isCivilian: true, x: 0, y: 0 }); // traffic: not our doing
  assert.equal(sc.civilians, 1);
  assert.equal(sc.kills, 1);
  assert.equal(sc.score, 0); // 400 - 1000, never below zero on the HUD
  const t = sc.tally({ par: 100, grades: [['S', 1e9], ['D', 0]] });
  assert.equal(t.lines.find((l) => l.key === 'civilians').points, -SCORING.civilian);
  assert.equal(t.lines.find((l) => l.key === 'stealth').points, SCORING.stealth.bonus - 2 * SCORING.stealth.perAlert);
});

const STATS = { points: 5000, kills: 5, guards: 5, maxCombo: 3, methods: 2, shots: 10, hits: 5, alerts: 0, civilians: 0, time: 60 };
const LEVEL = { par: 100, grades: [['S', 20000], ['A', 15000], ['B', 10000], ['C', 5000], ['D', 0]] };

test('tally: every line of the breakdown comes from the rules and adds up to the total', () => {
  const t = tally(STATS, LEVEL);
  const pts = Object.fromEntries(t.lines.map((l) => [l.key, l.points]));
  assert.deepEqual(pts, {
    kills: 5000,
    chain: 2 * SCORING.chain,
    variety: SCORING.variety,
    time: 40 * SCORING.time,
    stealth: SCORING.stealth.bonus,
    accuracy: SCORING.accuracy.bonus / 2,
  });
  assert.equal(t.total, t.lines.reduce((sum, l) => sum + l.points, 0));
  assert.equal(t.lines.find((l) => l.key === 'time').detail, '1:00 / 1:40');
});

test('tally: slow, loud and wasteful runs lose their bonuses, never below zero', () => {
  const t = tally({ ...STATS, time: 500, alerts: 9, shots: 100, hits: 0, maxCombo: 1, methods: 1 }, LEVEL);
  assert.equal(t.total, STATS.points);
  assert.equal(tally({ ...STATS, points: 0, civilians: 50, time: 500, alerts: 9 }, LEVEL).total, 0);
  // not firing at all pays more than perfect aim
  const quiet = tally({ ...STATS, shots: 0, hits: 0 }, LEVEL).lines.find((l) => l.key === 'accuracy');
  assert.equal(quiet.points, SCORING.accuracy.noShot);
  assert.ok(SCORING.accuracy.noShot > SCORING.accuracy.bonus);
});

test('grades: thresholds are inclusive, the hint names the next grade up', () => {
  const g = LEVEL.grades;
  assert.equal(gradeFor(20000, g), 'S');
  assert.equal(gradeFor(19999, g), 'A');
  assert.equal(gradeFor(5000, g), 'C');
  assert.equal(gradeFor(0, g), 'D');
  assert.equal(gradeFor(-5, g), 'D');
  const t = tally(STATS, LEVEL);
  assert.equal(t.grade, gradeFor(t.total, g));
  const i = g.findIndex(([l]) => l === t.grade);
  assert.deepEqual(t.next, i > 0 ? { grade: g[i - 1][0], at: g[i - 1][1] } : null);
  assert.equal(tally({ ...STATS, points: 1e6 }, LEVEL).next, null);
});

test('grades: every level table goes down from S to a floor at zero', () => {
  for (const lvl of [...Object.values(LEVEL_SCORING), levelScoring('nowhere', 4), levelScoring(null, 0)]) {
    assert.ok(lvl.par > 0);
    assert.equal(lvl.grades[0][0], 'S');
    assert.equal(lvl.grades.at(-1)[1], 0);
    for (let i = 1; i < lvl.grades.length; i++) assert.ok(lvl.grades[i][1] < lvl.grades[i - 1][1]);
  }
  assert.equal(levelScoring('level1'), LEVEL_SCORING.level1);
  // unknown levels scale with their guards
  assert.equal(levelScoring('x', 8).grades[0][1], 2 * levelScoring('x', 4).grades[0][1]);
});

test('grades: level 1 cannot be aced by shooting alone, and a clean varied run can', () => {
  const lvl = LEVEL_SCORING.level1, n = 13;
  // every guard shot one by one, no chain, in par time, alerts all the way, half the rounds wasted
  const sloppy = tally({ points: n * S.shot.points, kills: n, guards: n, maxCombo: 1, methods: 1, shots: 2 * n, hits: n, alerts: 3, civilians: 0, time: lvl.par }, lvl);
  assert.ok(['C', 'D'].includes(sloppy.grade), `sloppy run got ${sloppy.grade}`);
  // close-quarters kills in chains of 4, four ways of killing, one alert, a minute under par
  const chain = [1, 1.5, 2, 2.5].reduce((sum, m) => sum + S.melee.points * m, 0);
  const sharp = tally({ points: 3 * chain + S.melee.points, kills: n, guards: n, maxCombo: 4, methods: 4, shots: 4, hits: 3, alerts: 1, civilians: 0, time: lvl.par - 60 }, lvl);
  assert.ok(['S', 'A'].includes(sharp.grade), `sharp run got ${sharp.grade} with ${sharp.total}`);
});

const fakeStorage = () => {
  const data = {};
  return { getItem: (k) => data[k] ?? null, setItem: (k, v) => { data[k] = String(v); } };
};

test('records: only a better total replaces the best, per level', () => {
  const st = fakeStorage();
  assert.equal(loadBest('level1', st), null);
  assert.deepEqual(saveBest('level1', { total: 9000, grade: 'C', time: 120.4 }, st), { prev: null, record: true });
  assert.deepEqual(loadBest('level1', st), { total: 9000, grade: 'C', time: 120 });
  const worse = saveBest('level1', { total: 4000, grade: 'D', time: 90 }, st);
  assert.equal(worse.record, false);
  assert.equal(worse.prev.total, 9000);
  assert.equal(saveBest('level1', { total: 12000, grade: 'B', time: 100 }, st).record, true);
  assert.equal(loadBest('level1', st).grade, 'B');
  assert.equal(loadBest('lab', st), null);
});

test('records: missing, broken or forbidden storage never throws', () => {
  const broken = { getItem: () => { throw new Error('denied'); }, setItem: () => { throw new Error('full'); } };
  assert.equal(loadBest('level1', broken), null);
  assert.deepEqual(saveBest('level1', { total: 1, grade: 'D', time: 1 }, broken), { prev: null, record: true });
  assert.equal(loadBest('level1', null), null);
  assert.equal(saveBest('level1', { total: 1, grade: 'D', time: 1 }, null).record, true);
  const junk = { getItem: () => '"not an object"', setItem() {} };
  assert.equal(loadBest('level1', junk), null);
});
