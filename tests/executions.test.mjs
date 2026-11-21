import { test } from 'node:test';
import assert from 'node:assert/strict';
import { load } from './setup.mjs';
import { noop, sink } from './helpers.mjs';

const { default: EventBus } = await load('engine/EventBus.js');
const { FINISHERS, EXECUTIONS, EXEC, THREAT, finisherFor, finisherFamily, finisherChoice, pickVariant, killBeat, killTime, lockTime } = await load('game/data/finishers.js');
const { default: Danger, threatened } = await load('game/systems/Danger.js');
const { default: Scoring, killStyle } = await load('game/systems/Scoring.js');
const { SCORING } = await load('game/data/scoring.js');
const { WEAPONS } = await load('game/data/weapons.js');
const { MARKS } = await load('game/data/wounds.js');
const { default: Player } = await load('game/entities/Player.js');

const QUICK = Object.entries(FINISHERS).filter(([, f]) => f.quick), LONG = Object.entries(FINISHERS).filter(([, f]) => !f.quick);

// ---- A: is somebody on him? ----
const guard = (o = {}) => ({ x: 100, y: 0, alive: true, knocked: 0, yielded: false, aware: 2, sees: true, ...o });
const me = { x: 0, y: 0 };

test('threat: a guard who is after him with a line to him, within sight', () => {
  assert.ok(!threatened(me, []), 'nobody about');
  assert.ok(threatened(me, [guard()]));
  assert.ok(!threatened(me, [guard({ sees: false })]), 'no line to him');
  assert.ok(!threatened(me, [guard({ aware: 1 })]), 'only suspicious');
  assert.ok(!threatened(me, [guard({ aware: 0 })]), 'has not seen him');
  assert.ok(threatened(me, [guard({ x: THREAT.sight - 1 })]) && !threatened(me, [guard({ x: THREAT.sight + 1 })]), 'the range');
  for (const out of [{ alive: false }, { knocked: 1.5 }, { yielded: true }]) assert.ok(!threatened(me, [guard(out)]), JSON.stringify(out));
  assert.ok(threatened(me, [guard({ aware: 0 }), guard({ x: -200, y: 50 })]), 'any one of them');
});

test('threat: a round at him a moment ago; the squad on alert with a guard close, line or not', () => {
  assert.ok(threatened(me, [], { now: 10, firedAt: 10 - THREAT.fire + 0.1 }));
  assert.ok(!threatened(me, [], { now: 10, firedAt: 10 - THREAT.fire - 0.1 }), 'that was a while ago');
  const near = guard({ sees: false, aware: 1, x: THREAT.close - 5 }), far = guard({ sees: false, aware: 1, x: THREAT.close + 5 });
  assert.ok(threatened(me, [near], { phase: 'alert' }));
  assert.ok(!threatened(me, [far], { phase: 'alert' }), 'not that close');
  for (const phase of ['normal', 'caution', 'evasion']) assert.ok(!threatened(me, [near], { phase }), phase);
  assert.ok(!threatened(me, [guard({ x: 50 })], {}, { ...THREAT, sight: 40 }), 'data-driven');
  assert.ok(THREAT.fire >= 1 && THREAT.fire <= 2 && THREAT.sight > THREAT.close);
});

test('threat: the world remembers the rounds that went by him or struck near him, not his own', () => {
  const w = { events: new EventBus(), time: 5, enemies: [], player: { x: 0, y: 0, alive: true }, director: { phase: 'normal' } };
  const dg = new Danger(w);
  assert.ok(!dg.threatened());
  w.events.emit('round', { x0: -100, y0: THREAT.whiz + 20, x1: 100, y1: THREAT.whiz + 20, owner: {} });
  assert.ok(!dg.threatened(), 'wide of him');
  w.events.emit('round', { x0: -100, y0: 10, x1: 100, y1: 10, owner: w.player });
  assert.ok(!dg.threatened(), 'his own round');
  w.events.emit('round', { x0: -100, y0: 10, x1: 100, y1: 10, owner: {} });
  assert.ok(dg.threatened(), 'whizzed past');
  w.time += THREAT.fire + 0.1;
  assert.ok(!dg.threatened(), 'it wears off');
  w.events.emit('strike', { x: THREAT.strike - 10, y: 0, owner: {} });
  assert.ok(dg.threatened(), 'struck the wall by him');
  w.time += 9;
  w.enemies = [guard()];
  assert.ok(dg.threatened(), 'a guard on him');
  w.enemies = [guard({ sees: false, aware: 0, x: 60 })];
  assert.ok(!dg.threatened());
  w.director.phase = 'alert';
  assert.ok(dg.threatened());
});

// ---- the data ----
const hand = (type, mag) => [WEAPONS[type || 'fists'], type ? { type, mag: mag ?? WEAPONS[type].mag ?? 0 } : null];
const ARMS = [[null], ['knife'], ['cue_half'], ['bat'], ['tire_iron'], ['cue'], ['pistol', 7], ['pistol', 0], ['shotgun', 6], ['rifle', 0], ['bazooka', 1]];

test('finishers: threatened, the quick kill of the weapon; left alone, one of its long executions', () => {
  const FAM = { fists: 'fists', knife: 'blade', cue_half: 'stake', bat: 'bat', tire_iron: 'club', cue: 'cue', pistol7: 'gun', pistol0: 'butt', shotgun6: 'gun', rifle0: 'butt',
    bazooka1: 'butt' };
  for (const [type, mag] of ARMS) {
    const [d, weapon] = hand(type, mag), fam = EXECUTIONS[finisherFamily(d, weapon)];
    assert.equal(finisherFamily(d, weapon), FAM[(type || 'fists') + (mag ?? '')], `${type} ${mag}`);
    const quick = finisherChoice({ d, weapon, threatened: true });
    assert.ok(quick.quick && quick === FINISHERS[fam.quick], `${type}: quick`);
    for (let i = 0; i < 20; i++) {
      const long = finisherChoice({ d, weapon, threatened: false, rnd: () => i / 20 });
      assert.ok(!long.quick && fam.long.some((n) => FINISHERS[n] === long), `${type}: long`);
    }
    assert.equal(finisherFor(d, weapon), FINISHERS[fam.long[0]]);
  }
  for (const fam of Object.values(EXECUTIONS)) {
    assert.ok(FINISHERS[fam.quick].quick);
    for (const n of fam.long) assert.ok(FINISHERS[n] && !FINISHERS[n].quick, n);
  }
  // every entry belongs to a family
  const used = new Set(Object.values(EXECUTIONS).flatMap((f) => [f.quick, ...f.long]));
  assert.deepEqual(Object.keys(FINISHERS).filter((n) => !used.has(n)), []);
  for (const fam of ['fists', 'blade', 'club', 'bat', 'gun']) assert.ok(EXECUTIONS[fam].long.length >= 3, fam);
  assert.ok(EXECUTIONS.cue.long.length >= 2);
});

test('finishers: a quick kill frees him within 0.35 s, on one decisive beat', () => {
  assert.ok(QUICK.length >= 7);
  for (const [name, f] of QUICK) {
    assert.ok(lockTime(f) <= 0.35 && lockTime(f) >= 0.2, `${name}: ${lockTime(f).toFixed(2)} s`);
    assert.ok(killTime(f) <= 0.25, `${name}: dead at ${killTime(f).toFixed(2)} s`);
    assert.equal(f.label, 'QUICK KILL', name);
    assert.equal(f.pulp, undefined, name);
  }
});

test('finishers: in every long execution the kill lands early, the rest is spectacle', () => {
  for (const [name, f] of LONG) {
    assert.ok(killTime(f) <= 0.52, `${name}: dead at ${killTime(f).toFixed(2)} s`);
    assert.ok(lockTime(f) <= 2, `${name}: ${lockTime(f).toFixed(2)} s`);
    // (the home run is short on the clock: its flight is watched in slow motion)
    assert.ok(lockTime(f) >= (f.flight ? 0.7 : 1.1), `${name}: ${lockTime(f).toFixed(2)} s`);
    assert.ok(lockTime(f) - killTime(f) >= 0.3, `${name}: something left to watch, or to walk out of`);
    const k = killBeat(f);
    assert.ok(k >= 0 && k < f.beats.length, name);
    assert.ok(f.pulp === undefined || f.pulp > k, `${name}: the head goes after the kill`);
    assert.ok(f.plant === undefined || f.plant >= k, name);
    // the rounds a gun fires up to the kill are the rounds it asks for
    const shots = f.beats.slice(0, k + 1).filter((b) => b[1] === 'shot').length;
    assert.equal(f.rounds ?? (shots ? 1 : 0), Math.max(shots, f.rounds ?? 0), name);
    assert.ok(shots <= (f.rounds ?? 1), `${name}: ${shots} rounds to the kill`);
    for (const [, , where] of f.beats) assert.ok(where === undefined || EXEC.spots[where], `${name}: ${where}`);
  }
});

test('finishers: never the same long execution twice in a row; a gun short of rounds, a weapon that cannot snap', () => {
  for (const [type, mag] of ARMS) {
    const [d, weapon] = hand(type, mag), names = EXECUTIONS[finisherFamily(d, weapon)].long, seen = new Set();
    let last = null;
    for (let i = 0; i < 80; i++) {
      const f = finisherChoice({ d, weapon, threatened: false, last, rnd: () => (i * 0.618) % 1 });
      if (names.length > 1) assert.notEqual(f, last, `${type}: twice in a row`);
      seen.add(f);
      last = f;
    }
    assert.equal(seen.size, names.length, `${type}: all of them come up`);
  }
  const [d] = hand('pistol');
  for (let i = 0; i < 20; i++) {
    assert.equal(finisherChoice({ d, weapon: { type: 'pistol', mag: 1 }, rnd: () => i / 20 }), FINISHERS.gun, 'one round: one shot');
    assert.notEqual(finisherChoice({ d, weapon: { type: 'pistol', mag: 3 }, last: FINISHERS.gun, rnd: () => i / 20 }), FINISHERS.gun);
  }
  // `snap` breaks the weapon over him: only one that leaves something in the hand
  assert.equal(pickVariant(FINISHERS, ['snap'], WEAPONS.tire_iron, { type: 'tire_iron' }, null, () => 0), FINISHERS.snap, 'the only one: it comes anyway');
  assert.equal(pickVariant(FINISHERS, ['cue', 'snap'], WEAPONS.bat, { type: 'bat' }, null, () => 0.99), FINISHERS.cue);
  assert.ok(WEAPONS.cue.snaps);
});

// ---- the move itself, played by the player on a world that only knows what it needs ----
function scene(type, mag, threat = false) {
  const sounds = [], told = [], heard = [];
  const w = {
    particles: sink, decals: sink, camera: sink, time: 0, slowmo: noop, hitstop: noop, shake: noop, light: noop,
    events: { emit: (name, e) => told.push({ name, ...e }) }, danger: { threatened: () => threat },
    sound: (name) => sounds.push(name), noise: (x, y, r, src, kind) => heard.push(kind),
    map: { solidAt: () => false }, lineOfSight: () => true, enemies: [], props: [], items: [], corpses: [],
  };
  const p = Object.create(Player.prototype);
  Object.assign(p, { world: w, isPlayer: true, team: 'player', alive: true, knocked: 0, angle: 0, strike: 0, punchSide: 1, recoil: 0, execution: null, execOut: null,
    lastFinisher: null, body: Matter.Bodies.circle(-30, 4, 10), steer: noop, eject: noop, broke: [],
    breakWeapon(a, planted) { this.broke.push(planted); if (this.def.breaks === 'snap') this.setWeapon(this.def.snaps, 0); else this.weapon = null; } });
  p.setWeapon(type, mag);
  p.muzzleNote = { def: p.def, x: 14, y: 2, da: 0 };
  const g = {
    alive: true, x: 0, y: 0, downAngle: 0, voice: 1, knocked: 2, executing: false,
    kill(a, cause, killer, by, how) { this.alive = false; Object.assign(this, { cause, by, how, killedAt: w.time }); },
  };
  return { w, p, g, sounds, told, heard };
}
const idle = { hit: () => false, mouseHit: () => false, move: () => null };
// plays until it is over (or `until` s); press(t): the input of that step
function play(s, f, press = () => idle, until = 4) {
  const { w, p, g } = s, dt = 1 / 120;
  p.startExecution(g, f);
  while (p.execution && w.time < until) {
    w.time += dt;
    p.updateExecution(dt, press(w.time));
  }
}

test('finisher: threatened he does the quick kill, left alone a long one; a given one is played as given', () => {
  let s = scene('knife', 0, true);
  s.p.startExecution(s.g);
  assert.equal(s.p.execution.f, FINISHERS.throat);
  assert.equal(s.p.lastFinisher, null, 'a quick kill is not remembered as the last execution');
  s = scene('knife', 0, false);
  s.p.startExecution(s.g);
  assert.ok(!s.p.execution.f.quick && s.p.lastFinisher === s.p.execution.f);
  assert.ok(s.g.executing);
  s = scene(null);
  s.p.startExecution(s.g, FINISHERS.curb);
  assert.equal(s.p.execution.f, FINISHERS.curb);
});

test('finisher: every one of them kills on its kill beat and lets him go at its end; only a long one watched tells the score', () => {
  const ARM = { fists: [null], pound: [null], curb: [null], slam: [null], heel: [null], blade: ['knife'], slit: ['knife'], gut: ['knife'], throat: ['knife'],
    club: ['tire_iron'], bat: ['bat'], knee: ['bat'], pile: ['pistol', 0], crack: ['tire_iron'], golf: ['bat'], butt: ['rifle', 0], cue: ['cue'], snap: ['cue'],
    stake: ['cue_half'], plant: ['cue'], gun: ['pistol', 7], knees: ['pistol', 7], dump: ['pistol', 7], tap: ['pistol', 7] };
  assert.deepEqual(Object.keys(ARM).sort(), Object.keys(FINISHERS).sort());
  for (const [name, f] of Object.entries(FINISHERS)) {
    const s = scene(...ARM[name]);
    play(s, f);
    assert.ok(!s.p.execution, `${name}: over`);
    assert.ok(Math.abs(s.g.killedAt - killTime(f)) < 0.03, `${name}: dead at ${s.g.killedAt?.toFixed(2)} (${killTime(f).toFixed(2)})`);
    assert.ok(Math.abs(s.w.time - lockTime(f)) < 0.04, `${name}: free at ${s.w.time.toFixed(2)} (${lockTime(f).toFixed(2)})`);
    assert.deepEqual([s.g.how.finisher, s.g.how.label, s.g.how.quick, s.g.how.still], [true, f.label, !!f.quick, true], name);
    assert.equal(s.g.cause, f.cause, name);
    assert.ok(!s.g.executing, name);
    const told = s.told.filter((e) => e.name === 'finisher');
    assert.equal(told.length, f.quick ? 0 : 1, `${name}: watched to the end`);
    if (!f.quick) assert.deepEqual([told[0].label, told[0].x, told[0].y], [f.label, 0, 0]);
    assert.equal(s.p.execOut, null, `${name}: played to its end, nothing to let go of`);
  }
});

test('finisher: what the gun ones cost in rounds; a gun run dry drops the rest', () => {
  let s = scene('pistol', 7);
  play(s, FINISHERS.knees);
  assert.equal(s.p.weapon.mag, 4);
  assert.equal(s.sounds.filter((n) => n === 'kneeShot').length, 2);
  assert.equal(s.sounds.filter((n) => n === 'cry').length, 2, 'he cries out at each knee');
  assert.equal(s.heard.filter((k) => k === 'gunshot').length, 3);
  s = scene('pistol', 7);
  play(s, FINISHERS.dump);
  assert.equal(s.p.weapon.mag, 0, 'the whole magazine');
  s = scene('pistol', 3);
  play(s, FINISHERS.dump);
  assert.equal(s.p.weapon.mag, 0);
  assert.ok(s.w.time < lockTime(FINISHERS.dump) - 0.2, 'dry: the rest is dropped');
  assert.equal(s.told.filter((e) => e.name === 'finisher').length, 1);
  s = scene('pistol', 1);
  play(s, FINISHERS.tap);
  assert.ok(s.p.weapon.mag === 0 && !s.g.alive, 'one round left: one shot');
  s = scene('pistol', 7);
  play(s, FINISHERS.tap);
  assert.equal(s.p.weapon.mag, 5, 'the double tap');
});

test('finisher: what is left in him and in the hand (a plant, a cue snapped over him, a head sent off)', () => {
  let s = scene('cue');
  play(s, FINISHERS.cue);
  assert.deepEqual([s.g.by.stuck, s.p.weapon.type, s.p.broke], [WEAPONS.cue_half.sprite, 'cue_half', [true]]);
  s = scene('cue');
  play(s, FINISHERS.snap);
  assert.deepEqual(s.p.broke, [false, true], 'snapped over his head, then what is left planted');
  assert.equal(s.p.weapon, null);
  assert.deepEqual([s.g.cause, s.g.by.wound, s.g.by.stuck], ['melee', 'blunt', undefined], 'the blow killed him, the plant came after');
  s = scene('bat');
  play(s, FINISHERS.bat);
  assert.ok(s.g.by.launch > 0 && s.p.weapon.type === 'bat');
  s = scene(null);
  play(s, FINISHERS.curb);
  assert.deepEqual(s.g.by, { gore: 0, wound: 'crush' });
  assert.ok(MARKS[FINISHERS.curb.wound]);
});

// ---- B: the rest can be walked out of ----
test('finisher: before the kill nothing frees him; after it a fresh move, a right click or Space does at once', () => {
  const f = FINISHERS.fists, tk = killTime(f);
  const keys = { move: { ...idle, hit: (k) => k === 'KeyD' }, right: { ...idle, mouseHit: (b) => b === 2 }, space: { ...idle, hit: (k) => k === 'Space' } };
  for (const [what, input] of Object.entries(keys)) {
    let s = scene(null);
    play(s, f, () => input, tk - 0.05);
    assert.ok(s.p.execution && s.g.alive, `${what}: locked until he is dead`);
    s = scene(null);
    let out = null;
    play(s, f, (t) => (t > tk + 0.1 ? input : idle));
    out = s.w.time;
    assert.ok(Math.abs(out - (tk + 0.1)) < 0.02, `${what}: free at once (${out.toFixed(2)} s)`);
    assert.ok(!s.g.alive && Math.abs(s.g.killedAt - tk) < 0.03, `${what}: he stays dead`);
    assert.ok(!s.g.executing);
    assert.equal(s.told.filter((e) => e.name === 'finisher').length, 0, `${what}: not watched, nothing told`);
    assert.ok(s.p.execOut && s.p.execOut.t === EXEC.blend, `${what}: the pose lets go over a moment`);
    assert.ok(s.p.cooldown <= 0.1);
  }
  // a left click does not walk him out of it (the attack that started it may still be held)
  const s = scene(null);
  play(s, f, () => ({ ...idle, mouseHit: (b) => b === 0, mouseDown: () => true }));
  assert.ok(Math.abs(s.w.time - lockTime(f)) < 0.04);
});

test('finisher: a stick held since before the kill does not count until it is let go; pushed again it does', () => {
  const f = FINISHERS.blade, tk = killTime(f), stick = { ...idle, move: () => ({ x: 1, y: 0, mag: 1 }) };
  let s = scene('knife');
  play(s, f, () => stick);
  assert.ok(Math.abs(s.w.time - lockTime(f)) < 0.04, 'held all along: he watches it');
  s = scene('knife');
  play(s, f, (t) => (t < tk + 0.1 || t > tk + 0.2 ? stick : idle));
  assert.ok(Math.abs(s.w.time - (tk + 0.2)) < 0.03, 'let go, pushed again: out');
});

test('finisher: somebody else kills the man first: it stops there, nothing scored', () => {
  const s = scene(null);
  s.p.startExecution(s.g, FINISHERS.fists);
  s.p.updateExecution(0.05, idle);
  s.g.alive = false;
  s.p.updateExecution(1 / 60, idle);
  assert.ok(!s.p.execution && !s.g.executing && s.g.cause === undefined);
  assert.equal(s.told.length, 0);
});

// ---- D: what it pays ----
test('scoring: a quick kill pays least, an execution walked out of more, one watched to its end most', () => {
  const S = SCORING.styles, W = SCORING.watched;
  assert.ok(S.quickKill.points < S.execution.points && W.points > 0);
  assert.ok(S.quickKill.points < S.melee.points && S.execution.points > S.melee.points);
  const killer = { isPlayer: true, weapon: null, swing: 0 };
  assert.deepEqual(killStyle({ cause: 'melee', killer, how: { finisher: true, quick: true } }), { style: 'quickKill', method: 'quickKill' });
  assert.deepEqual(killStyle({ cause: 'execute', killer, how: { finisher: true, quick: true } }), { style: 'quickKill', method: 'quickKill' });
  assert.deepEqual(killStyle({ cause: 'melee', killer, how: { finisher: true, quick: false } }), { style: 'execution', method: 'execution' });
  const run = (how, watched) => {
    const w = { events: new EventBus(), time: 0, texts: [], totalEnemies: 5, enemies: [] }, sc = new Scoring(w), log = [];
    w.events.on('scored', (e) => log.push(e));
    w.events.emit('kill', { victim: { isEnemy: true, x: 3, y: 4, aware: 2, knocked: 2 }, cause: 'melee', killer, how });
    if (watched) w.events.emit('finisher', { killer, x: 3, y: 4, label: how.label });
    return { sc, log, w };
  };
  const quick = run({ finisher: true, quick: true, label: 'QUICK KILL' });
  assert.equal(quick.sc.points, S.quickKill.points);
  assert.deepEqual(quick.log[0].labels, ['QUICK KILL']);
  const cut = run({ finisher: true, quick: false, label: 'CURB STOMP' });
  assert.equal(cut.sc.points, S.execution.points);
  assert.deepEqual(cut.log[0].labels, ['CURB STOMP'], 'the feed names the execution');
  const full = run({ finisher: true, quick: false, label: 'CURB STOMP' }, true);
  assert.equal(full.sc.points, S.execution.points + W.points);
  assert.deepEqual([full.log[1].labels, full.log[1].kind, full.log[1].x, full.log[1].y], [[W.label], 'bonus', 3, 4]);
  assert.ok(quick.sc.points < cut.sc.points && cut.sc.points < full.sc.points);
  assert.equal(quick.sc.styled.quickKill, 1);
});

test('scoring: watching an execution to its end pays x the multiplier and winds the chain back up', () => {
  const w = { events: new EventBus(), time: 0, texts: [], totalEnemies: 5, enemies: [] }, sc = new Scoring(w), C = SCORING.combo, W = SCORING.watched;
  const killer = { isPlayer: true, weapon: null, swing: 0 }, victim = () => ({ isEnemy: true, x: 0, y: 0, aware: 2, knocked: 2 });
  w.events.emit('kill', { victim: victim(), cause: 'melee', killer, how: { finisher: true } });
  w.time = 1;
  w.events.emit('kill', { victim: victim(), cause: 'melee', killer, how: { finisher: true } });
  const before = sc.points;
  assert.equal(sc.combo, 2);
  w.time = 2.4;
  w.events.emit('finisher', { killer, x: 0, y: 0, label: 'X' });
  assert.equal(sc.points - before, Math.round(W.points * sc.multiplier));
  assert.ok(sc.multiplier > 1);
  assert.ok(Math.abs(sc.comboEnd - (2.4 + C.window * W.refill)) < 1e-9, 'the whole window again');
  assert.equal(sc.combo, 2, 'no kill added');
});

test('finisher: killed in the middle of one, the man he was finishing is let go (never left floored for good)', async () => {
  const { default: Character } = await load('game/entities/Character.js');
  const s = scene('knife', 0, false);
  s.p.startExecution(s.g);
  assert.ok(s.g.executing && s.p.execution);
  const base = Character.prototype.kill;
  Character.prototype.kill = function () { this.alive = false; };
  try { s.p.kill(0, 'bullet'); } finally { Character.prototype.kill = base; }
  assert.equal(s.p.alive, false);
  assert.equal(s.p.execution, null);
  assert.equal(s.g.executing, false, 'his knocked clock runs again (Enemy.updateKnocked)');
});
