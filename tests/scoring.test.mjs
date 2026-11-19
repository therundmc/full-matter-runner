import { test } from 'node:test';
import assert from 'node:assert/strict';
import { load } from './setup.mjs';

const { default: EventBus } = await load('engine/EventBus.js');
const { default: Scoring, killStyle, killTags, comboMultiplier, gradeFor, tally } = await load('game/systems/Scoring.js');
const { blowFrom } = await load('game/fx/Blows.js');
const { FINISHERS, EXEC, finisherFor } = await load('game/data/finishers.js');
const { WEAPONS } = await load('game/data/weapons.js');
const { SCORING, LEVEL_SCORING, levelScoring } = await load('game/data/scoring.js');
const { loadBest, saveBest } = await load('game/systems/Records.js');

const S = SCORING.styles;
const player = (type, swing = 0) => ({ isPlayer: true, weapon: type ? { type } : null, swing });
const guard = (over = {}) => ({ isEnemy: true, x: 0, y: 0, aware: 2, knocked: 0, ...over });
const world = (guards = 5) => ({ events: new EventBus(), time: 0, texts: [], totalEnemies: guards, enemies: [] });
// what Scoring tells of what it scored ('scored', 'multiKill', 'chainEnd'), in order
const told = (w) => {
  const out = [];
  for (const name of ['scored', 'multiKill', 'chainEnd']) w.events.on(name, (e) => out.push({ name, ...e }));
  return out;
};
const scored = (log) => log.filter((e) => e.name === 'scored');
const kill = (w, cause, killer, victim = guard()) => w.events.emit('kill', { victim, cause, killer });

test('scoring: a kill is read from its cause and the weapon in hand', () => {
  assert.deepEqual(killStyle({ cause: 'bullet', killer: player('pistol') }), { style: 'shot', method: 'pistol' });
  assert.deepEqual(killStyle({ cause: 'blast', killer: player('shotgun') }), { style: 'pointBlank', method: 'shotgun' });
  assert.deepEqual(killStyle({ cause: 'slash', killer: player('knife', 1) }), { style: 'blade', method: 'knife' });
  assert.deepEqual(killStyle({ cause: 'melee', killer: player('bat', 0.2) }), { style: 'melee', method: 'bat' });
  assert.deepEqual(killStyle({ cause: 'execute', killer: player() }), { style: 'execution', method: 'execution' });
  // a finisher that leaves the body whole (the bat's home run) is still one
  assert.deepEqual(killStyle({ cause: 'melee', killer: player('bat', 0.2), how: { finisher: true } }), { style: 'execution', method: 'execution' });
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

test('scoring: the circumstances of a kill are read from the round, the blow and the moment', () => {
  const T = SCORING, quiet = { now: 50, dodgeT: -99, pickT: -99, streak: 1 }, p = player('pistol');
  assert.deepEqual(killTags({ killer: p }, quiet), []);
  assert.deepEqual(killTags({ killer: p, how: { pierced: 1, dist: 100 } }, quiet), ['collateral']);
  assert.deepEqual(killTags({ killer: p, how: { through: true, bounced: true, dist: T.longShot + 1, last: true } }, quiet),
    ['wallbang', 'ricochet', 'longshot', 'lastRound']);
  assert.deepEqual(killTags({ killer: { ...p, slide: {} } }, quiet), ['slide']);
  assert.deepEqual(killTags({ killer: { ...p, vaulting: {} } }, quiet), ['airborne']);
  assert.deepEqual(killTags({ killer: p, how: { from: 'behind', heavy: true, smoked: true } }, quiet), ['behind', 'smash', 'smoked']);
  assert.deepEqual(killTags({ killer: p, how: { from: 'front' } }, { ...quiet, dodgeT: 49, pickT: 49.5 }), ['dodge', 'quickdraw']);
  assert.deepEqual(killTags({ killer: p, how: { from: 'side', spin: true } }, quiet), ['spin']);
  assert.deepEqual(killTags({ killer: p, how: { heavy: true, broke: true } }, quiet), ['smash', 'broke']);
  assert.deepEqual(killTags({ killer: p, how: { from: 'front', thrown: true } }, quiet), ['thrown']);
  assert.deepEqual([2, 3, 4, 7].map((streak) => killTags({ killer: null }, { ...quiet, streak })[0]), ['double', 'triple', 'massacre', 'massacre']);
  assert.deepEqual(killTags({ killer: null, how: { car: 'wrecked', crew: true } }, { ...quiet, streak: 2 }), [], 'the second man of a wrecked car: no multi-kill of its own');
  for (const tag of ['collateral', 'wallbang', 'ricochet', 'longshot', 'lastRound', 'slide', 'airborne', 'behind', 'smash', 'spin', 'broke', 'thrown', 'smoked', 'dodge', 'quickdraw', 'double', 'triple', 'massacre']) {
    assert.ok(T.tags[tag].points > 0 && T.tags[tag].label, tag);
  }
});

test('scoring: a tagged kill pays its bonuses, shows them and counts each as a way of killing', () => {
  const w = world(), sc = new Scoring(w), T = SCORING.tags, log = told(w);
  w.events.emit('kill', { victim: guard({ x: 40, y: 50 }), cause: 'bullet', killer: { ...player('pistol'), slide: {} }, how: { pierced: 1, dist: 80 } });
  assert.deepEqual(sc.tags, ['collateral', 'slide']);
  assert.equal(sc.points, S.shot.points + T.collateral.points + T.slide.points);
  assert.deepEqual(scored(log)[0], { name: 'scored', x: 40, y: 50, points: sc.points, labels: ['COLLATERAL', 'SLIDE KILL'], combo: 1, multiplier: 1, streak: 1, kind: 'kill' });
  assert.equal(w.texts.length, 0, 'nothing written over the heads: that is for the barks');
  assert.deepEqual([...sc.methods].sort(), ['collateral', 'pistol', 'slide']);
  // a second one right behind it is a double; later, alone, it is not
  w.time = 0.3;
  kill(w, 'bullet', player('pistol'));
  assert.deepEqual(sc.tags, ['double']);
  assert.deepEqual(log.at(-1), { name: 'multiKill', n: 2, tag: 'double', x: 0, y: 0 });
  assert.deepEqual(scored(log).at(-1).labels, [S.shot.label, T.double.label].filter(Boolean));
  w.time = 3;
  kill(w, 'bullet', player('pistol'));
  assert.deepEqual(sc.tags, []);
  // a dodge or a pick-up a moment before, and the label a finisher gives itself
  w.time = 10;
  w.events.emit('dodge', {});
  w.events.emit('pickup', { ch: { isPlayer: true } });
  w.time = 10.5;
  w.events.emit('kill', { victim: guard(), cause: 'slash', killer: player('cue'), how: { finisher: true, label: 'IMPALED' } });
  assert.deepEqual(sc.tags, ['dodge', 'quickdraw']);
  assert.deepEqual(scored(log).at(-1).labels, ['IMPALED', 'DODGE KILL', 'QUICK DRAW']);
});

test('blows: a blow takes a man from behind, the side or the front; every weapon has its finisher and its takedown', () => {
  assert.equal(blowFrom(0, 0.3), 'behind');
  assert.equal(blowFrom(0, Math.PI - 0.2), 'front');
  assert.equal(blowFrom(0, -Math.PI / 2), 'side');
  assert.equal(blowFrom(3, -3), 'behind', 'across the +-pi seam');
  const of = (type, mag) => finisherFor(WEAPONS[type], type ? { type, mag } : null);
  assert.equal(of('fists'), FINISHERS.fists);
  assert.equal(of('bat'), FINISHERS.bat);
  assert.equal(of('tire_iron'), FINISHERS.club);
  assert.equal(of('knife'), FINISHERS.blade);
  assert.equal(of('cue_half'), FINISHERS.stake);
  assert.equal(of('cue'), FINISHERS.cue);
  assert.equal(of('pistol', 7), FINISHERS.gun);
  assert.equal(of('pistol', 1), FINISHERS.gun);
  assert.equal(of('pistol', 0), FINISHERS.club, 'an empty gun is a club');
  assert.equal(of('shotgun', 6), FINISHERS.gun);
  assert.equal(of('bazooka', 1), FINISHERS.club, 'never a rocket into a man at his feet');
  assert.ok(FINISHERS.cue.plant === 0 && WEAPONS[WEAPONS.cue.snaps].swing === 'blade', 'a snapped cue is a stake');
  for (const [name, f] of Object.entries(FINISHERS)) {
    assert.ok(f.label && ['execute', 'slash', 'melee'].includes(f.cause) && f.beats.length > 0, name);
    for (const [wait, what] of f.beats) {
      assert.ok(wait > 0, name);
      assert.ok([0, 1, 2, 3].includes(what) || ['windup', 'stomp', 'shot', 'grab', 'press', 'slam', 'pin', 'stab', 'smash', 'punch', 'elbow', 'twist', 'rip',
        'cut', 'bleed', 'pile', 'aim', 'lean', 'hold'].includes(what), `${name}: ${what}`);
    }
    assert.notEqual(f.beats[f.beats.length - 1][1], 'windup', `${name} does not end on a windup`);
    assert.ok(['astride', 'over', 'side', 'beside', 'here'].includes(f.mount) && EXEC.spots[f.at] && f.after > 0, name);
    assert.ok(!f.pose || ['gouge', 'pound', 'hair', 'stomp', 'frenzy', 'slit', 'smash', 'pile', 'headshot'].includes(f.pose), name);
  }
  for (const d of Object.values(WEAPONS)) if (d.hold === 'melee') assert.ok(['club', 'blade'].includes(d.swing) && d.material, d.name);
  assert.equal(WEAPONS.pistol.mag, 7);
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
  const w = world(), sc = new Scoring(w), log = told(w);
  kill(w, 'slash', player('knife', 1), guard({ aware: 0 }));
  assert.equal(sc.points, S.blade.points + SCORING.unseen);
  assert.equal(scored(log)[0].labels[0], 'UNSEEN');
  assert.equal(scored(log)[0].points, sc.points);
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

test('scoring: knock-downs, bonuses and passers-by are told with their kind; a chain of 2+ that runs out tells its points', () => {
  const w = world(), sc = new Scoring(w), log = told(w), c = SCORING.combo;
  kill(w, 'bullet', player('pistol'));
  w.events.emit('knock', { victim: guard({ x: 5, y: 6 }), cause: 'debris', angle: 0 });
  assert.deepEqual(scored(log).at(-1), { name: 'scored', x: 5, y: 6, points: SCORING.knock.debris, labels: ['WRECKAGE'], combo: 1, multiplier: 1, streak: 1, kind: 'knock' });
  sc.add(300, 1, 2, 'DOOR SLAM');
  assert.deepEqual([scored(log).at(-1).kind, scored(log).at(-1).labels], ['bonus', ['DOOR SLAM']]);
  w.time = 1;
  kill(w, 'bullet', player('pistol'));
  kill(w, 'bullet', player('pistol'), { isCivilian: true, x: 3, y: 4 });
  assert.deepEqual(scored(log).at(-1), { name: 'scored', x: 3, y: 4, points: -SCORING.civilian, labels: ['CIVILIAN'], combo: 2, multiplier: 1 + c.step, streak: 1, kind: 'civilian' });
  const earned = sc.points;
  w.time = 1 + c.window + 0.1;
  sc.update();
  assert.deepEqual(log.at(-1), { name: 'chainEnd', kills: 2, points: earned });
  // a chain of one ends quietly; one that runs out the very step a new kill comes still tells its end
  kill(w, 'bullet', player('pistol'));
  w.time += c.window + 0.1;
  sc.update();
  assert.equal(log.filter((e) => e.name === 'chainEnd').length, 1);
  kill(w, 'bullet', player('pistol'));
  w.time += 1;
  kill(w, 'bullet', player('pistol'));
  w.time += c.window + 0.1;
  kill(w, 'bullet', player('pistol'));
  assert.deepEqual(log.filter((e) => e.name === 'chainEnd').at(-1), { name: 'chainEnd', kills: 2, points: S.shot.points * (2 + c.step) });
  assert.equal(sc.combo, 1);
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
    variety: SCORING.variety.points,
    time: 40 * SCORING.time,
    stealth: SCORING.stealth.bonus,
    accuracy: Math.round(SCORING.accuracy.bonus * Math.max(0, (0.5 - SCORING.accuracy.from) / (1 - SCORING.accuracy.from))),
  });
  assert.equal(t.total, t.lines.reduce((sum, l) => sum + l.points, 0));
  assert.equal(t.lines.find((l) => l.key === 'time').detail, '1:00 / 1:40');
});

test('tally: a guard who gave up and was left alive is worth a mercy bonus', () => {
  assert.equal(tally(STATS, LEVEL).lines.find((l) => l.key === 'mercy'), undefined);
  const t = tally({ ...STATS, kills: 4, spared: 1 }, LEVEL);
  assert.equal(t.lines.find((l) => l.key === 'mercy').points, SCORING.mercy);
  const w = world(), sc = new Scoring(w);
  w.enemies.push({ alive: true, yielded: true }, { alive: false, yielded: true }, { alive: true });
  assert.equal(sc.tally(LEVEL).lines.find((l) => l.key === 'mercy').points, SCORING.mercy);
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

test('tally: variety counts up to a cap, accuracy pays from its floor up, a civilian costs dear', () => {
  const V = SCORING.variety, A = SCORING.accuracy, line = (stats, key) => tally({ ...STATS, ...stats }, LEVEL).lines.find((l) => l.key === key);
  assert.equal(line({ methods: 4 }, 'variety').points, 3 * V.points);
  assert.equal(line({ methods: V.max + 1 }, 'variety').points, V.max * V.points);
  assert.equal(line({ methods: V.max + 9 }, 'variety').points, V.max * V.points, 'every snatched gun brings two ways: capped');
  assert.equal(line({ methods: V.max + 9 }, 'variety').detail, `${V.max + 9} WAYS`);
  assert.equal(line({ shots: 10, hits: Math.floor(10 * A.from) }, 'accuracy').points, 0, 'half the rounds wasted earns nothing');
  assert.equal(line({ shots: 10, hits: 10 }, 'accuracy').points, A.bonus);
  assert.ok(line({ shots: 10, hits: 8 }, 'accuracy').points < A.bonus);
  assert.ok(A.noShot > A.bonus);
  assert.equal(line({ civilians: 1 }, 'civilians').points, -SCORING.civilian);
});

test('grades: the top grade is never given with a passer-by killed, the lines still add up', () => {
  assert.ok(SCORING.cleanTop);
  const top = { ...STATS, points: 1e5 };
  assert.equal(tally(top, LEVEL).grade, 'S');
  const t = tally({ ...top, civilians: 1 }, LEVEL);
  assert.equal(t.grade, 'A');
  assert.deepEqual(t.next, { grade: 'S', at: LEVEL.grades[0][1], clean: true });
  assert.equal(t.total, t.lines.reduce((sum, l) => sum + l.points, 0));
  assert.equal(tally({ ...top, points: 0, civilians: 1 }, LEVEL).next.clean, undefined, 'only said of the top grade');
  assert.equal(tally({ ...top, civilians: 1 }, LEVEL, { ...SCORING, cleanTop: false }).grade, 'S');
});

test('scoring: a multi-kill and a boss are paid flat, outside the chain multiplier', () => {
  const T = SCORING.tags;
  for (const t of ['double', 'triple', 'massacre', 'cueball']) assert.ok(T[t].flat, t);
  const w = world(), sc = new Scoring(w);
  kill(w, 'melee', player('bat', 0.3));
  w.time = 0.3;
  w.events.emit('kill', { victim: guard(), cause: 'blast', killer: player('shotgun'), how: { boss: 'cueball' } });
  assert.deepEqual(sc.tags, ['cueball', 'double']);
  const m = comboMultiplier(2);
  assert.equal(sc.points, S.melee.points + Math.round(S.pointBlank.points * m) + T.cueball.points + T.double.points);
  assert.ok(sc.methods.has('cueball') && sc.methods.has('double'), 'still ways of killing');
  assert.equal(sc.styled.cueball, 1);
});

// Level 1 played through the real Scoring: [t, kind, how, extra] a kill at world time t
const KILLS = {
  shot: () => ({ cause: 'bullet', killer: player('pistol') }),
  buck: () => ({ cause: 'blast', killer: player('shotgun') }),
  bat: () => ({ cause: 'melee', killer: player('bat', 0.3) }),
  knife: () => ({ cause: 'slash', killer: player('knife', 0.3) }),
  exec: () => ({ cause: 'execute', killer: player(), finisher: true, watched: true }),
  quick: () => ({ cause: 'execute', killer: player(), finisher: true, quick: true }),
  take: () => ({ cause: 'snap', killer: player(), takedown: true }),
  slide: () => ({ cause: 'bullet', killer: { ...player('pistol'), slide: {} } }),
};
const { BOSSES } = await load('game/data/bosses.js');
function playLevel1(run) {
  const w = world(12), sc = new Scoring(w);
  for (const [t, kind, how = {}, x = {}] of run.kills) {
    w.time = t;
    sc.update();
    if (x.dodge) w.events.emit('dodge', {});
    if (x.pick) w.events.emit('pickup', { ch: { isPlayer: true } });
    if (how.boss) sc.add(BOSSES.cueball.wound.points, 0, 0, 'WOUNDED'); // his first hit (entities/Boss.js)
    const k = KILLS[kind]();
    const victim = guard({ aware: k.takedown || x.unseen ? 0 : 2, held: k.takedown ? k.killer : null });
    w.events.emit('kill', { victim, cause: k.cause, killer: k.killer, how: { ...how, finisher: k.finisher, quick: k.quick } });
    if (k.watched) { w.time = t + 0.1; w.events.emit('finisher', { x: 0, y: 0 }); }
  }
  w.time = run.time;
  sc.update();
  Object.assign(sc, { shots: run.shots, alerts: run.alerts, civilians: run.civilians || 0 });
  if (run.hits !== undefined) sc.hits = run.hits;
  return sc.tally(LEVEL_SCORING.level1);
}
const chainOf = (t0, gap, kills) => kills.map((k, i) => [t0 + i * gap, ...k]);
const BOSS = { boss: 'cueball' };
const RUNS = {
  // every guard shot one at a time, the gun snatched off the first one floored by hand, the boss shot; 3 alerts
  sloppy: { time: 330, alerts: 3, shots: 30, kills: [
    [20, 'quick', { disarm: true }], [45, 'shot', {}, { pick: true }], [70, 'shot'], [95, 'shot'], [120, 'shot'],
    [145, 'buck', {}, { pick: true }], [170, 'shot'], [195, 'shot'], [220, 'shot'], [245, 'shot'], [270, 'shot'], [300, 'buck', BOSS]] },
  // a first clear: one brawl of 4 in the bar room, the rest one by one, 2 alerts, half the rounds wasted
  plain: { time: 270, alerts: 2, shots: 14, kills: [
    [15, 'bat', { from: 'behind' }, { unseen: true }],
    ...chainOf(40, 2.5, [['bat', { heavy: true }], ['bat'], ['quick', { disarm: true }], ['shot', {}, { pick: true }]]),
    [100, 'shot'], [130, 'shot'], [160, 'exec'], [190, 'shot', { last: true }], [215, 'bat', { broke: true }],
    [240, 'buck', {}, { pick: true }], [262, 'buck', BOSS]] },
  // decent: mostly close, chains of 5 and 3, an execution seen through, 1 alert, a third of the rounds hit
  decent: { time: 200, alerts: 1, shots: 9, kills: [
    [12, 'take', { env: 'wall' }],
    ...chainOf(35, 2.5, [['bat', { heavy: true }], ['bat', { from: 'behind' }], ['bat', { spin: true }], ['exec'], ['quick', { disarm: true }]]),
    ...chainOf(80, 2.5, [['shot', {}, { pick: true }], ['shot', { last: true }], ['bat', { heavy: true }]]),
    [125, 'bat', { broke: true }], [160, 'knife', { thrown: true }], [185, 'buck', BOSS]] },
  // fast and stylish: chains of 5 and 4, the boss in a chain of 2, a takedown into the bowl, executions seen
  // through, a slide kill, 1 alert, 3 rounds in 5 hit, 10 s under par
  sharp: { time: 140, alerts: 1, shots: 5, kills: [
    [10, 'take', { env: 'bowl' }],
    ...chainOf(30, 2, [['bat', { heavy: true }], ['bat', { from: 'behind', spin: true }], ['exec'], ['bat', { broke: true }], ['quick', { disarm: true }]]),
    ...chainOf(70, 2, [['slide', {}, { pick: true }], ['shot'], ['knife', { from: 'behind' }], ['exec']]),
    ...chainOf(120, 2.5, [['shot', { last: true }], ['buck', BOSS]])] },
  // exceptional: the bar in one chain of 7, the boss at the end of another of 5, never spotted, 3 rounds in 4 hit,
  // nearly a minute under par
  ace: { time: 95, alerts: 0, shots: 4, kills: [
    ...chainOf(25, 1.5, [['take', { env: 'bowl' }], ['bat', { heavy: true }], ['bat', { from: 'behind', spin: true }, { dodge: true }], ['exec'],
      ['bat', { broke: true }], ['quick', { disarm: true }], ['slide', {}, { pick: true }]]),
    ...chainOf(65, 1.5, [['knife', { thrown: true }], ['exec'], ['shot', { pierced: 1 }], ['buck', BOSS]])] },
};

test('grades: level 1, a clear at all is D or C, a decent one B, fast and stylish A, S the exceptional run', () => {
  const grade = (run) => playLevel1(run).grade;
  assert.equal(grade(RUNS.sloppy), 'D', 'every guard shot one at a time');
  assert.equal(grade(RUNS.plain), 'C');
  assert.equal(grade(RUNS.decent), 'B');
  assert.equal(grade(RUNS.sharp), 'A');
  assert.equal(grade(RUNS.ace), 'S');
  // S needs all of it: one thing missing and it is an A
  assert.equal(grade({ ...RUNS.ace, civilians: 1 }), 'A', 'a passer-by killed');
  assert.equal(grade({ ...RUNS.ace, time: LEVEL_SCORING.level1.par }), 'A', 'no time under par');
  assert.equal(grade({ ...RUNS.ace, alerts: 2 }), 'A', 'spotted twice');
  assert.equal(grade({ ...RUNS.ace, shots: 10 }), 'A', 'rounds sprayed');
  // a sharp run done loud and wasteful falls to B, a sloppy one never climbs above B even fast
  assert.equal(grade({ ...RUNS.sharp, alerts: 3, shots: 12 }), 'B');
  assert.ok(['D', 'C', 'B'].includes(grade({ ...RUNS.sloppy, time: 150 })));
  // the totals add up to the lines shown
  for (const run of Object.values(RUNS)) {
    const t = playLevel1(run);
    assert.equal(t.total, t.lines.reduce((sum, l) => sum + l.points, 0));
  }
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
