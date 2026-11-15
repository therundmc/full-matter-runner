import { test } from 'node:test';
import assert from 'node:assert/strict';
import { load } from './setup.mjs';

const { TILE } = await load('game/Config.js');
const { default: EventBus } = await load('engine/EventBus.js');
const { default: Tutorial, HINTS } = await load('game/systems/Tutorial.js');
const { default: Fires } = await load('game/systems/Fires.js');
const { default: level } = await load('game/data/levels/tutorial.js');
const { ENEMIES } = await load('game/world/Level.js');

const px = (v) => v * TILE;
// the level's guards as plain objects where its actors layer has them, a player, what the tutorial touches
function stub(from = 0) {
  const enemies = [];
  level.actors.forEach((row, r) => [...row].forEach((ch, c) => {
    if (!ENEMIES[ch]) return;
    enemies.push({ x: px(c + 0.5), y: px(r + 0.5), angle: ((level.facing[`${c},${r}`] || 0) * Math.PI) / 180, alive: true, knocked: 0, aware: 0,
      body: {}, heard: 0, hear() { this.heard++; } });
  }));
  const body = Matter.Bodies.circle(px(4.5), px(3.5), 10);
  const player = { body, alive: true, isPlayer: true, armed: false, weapon: null, def: { kind: 'none' }, get x() { return body.position.x; }, get y() { return body.position.y; } };
  const world = { events: new EventBus(), enemies, player, items: [], level, game: {}, removed: [], removeBody(b) { this.removed.push(b); } };
  const t = new Tutorial(world, level.tutorial, from);
  const go = (col, row) => { Matter.Body.setPosition(body, { x: px(col), y: px(row) }); t.update(); };
  return { world, t, player, go, guardAt: (c, r) => world.enemies.find((e) => Math.floor(e.x / TILE) === c && Math.floor(e.y / TILE) === r) };
}

test('tutorial: the level holds together (every guard in a wave, zones and spawns on the floor, hints that exist)', () => {
  const floor = (c, r) => !' #X'.includes(level.tiles[Math.floor(r)][Math.floor(c)]);
  const guards = level.actors.join('').split('').filter((ch) => ENEMIES[ch]).length;
  const waved = new Set();
  for (const s of level.tutorial.stages) {
    assert.ok(floor(s.spawn[0], s.spawn[1]), 'a spawn in a wall');
    assert.ok(floor(s.zone[0], s.zone[1]) && floor(s.zone[2], s.zone[3]));
    for (const h of s.hints) assert.ok(HINTS[h], `no hint ${h}`);
    for (const w of s.waves || []) {
      for (const [c, r] of w.at) {
        assert.ok(ENEMIES[level.actors[r][c]], `no guard at ${c},${r}`);
        waved.add(`${c},${r}`);
      }
    }
    for (const m of Object.values(s.marks || {})) assert.ok(floor(m[0], m[1]));
  }
  assert.equal(waved.size, guards, 'every guard belongs to a wave');
  const [c0, r0, c1, r1] = level.tutorial.fall;
  assert.ok(floor(c0, r0) && floor(c1, r1), 'there is something to land on past the window');
  assert.ok(level.tiles.some((row) => row[c0 - 1] === 'G'), 'and a window to get there by');
  assert.deepEqual(level.drops.map((d) => [d[0], d[4]]), [['bat', null]], 'a bat; the only gun is the one a dead man leaves');
  assert.equal(level.tutorial.stages.find((s) => s.leaves !== undefined).leaves, 2, 'with two rounds in it');
  for (const [c, r] of level.fires) assert.ok(level.tiles[Math.floor(r)][Math.floor(c)] !== 'X', 'a fire outside the building');
});

test('tutorial: every guard sleeps until his wave is called, place after place', () => {
  const s = stub();
  assert.ok(s.world.enemies.every((e) => e.dormant));
  assert.equal(s.t.stage, -1);
  s.go(4.5, 3.5);
  assert.equal(s.t.stage, 0);
  s.go(10.5, 3.5); // the living room: its man is only there to be seized, from any side
  assert.equal(s.t.stage, 1);
  assert.equal(s.world.game.tutorialAt.stage, 1);
  s.go(12.6, 3.5);
  assert.ok(s.guardAt(11, 3).dormant, 'walked round to his face, he still sleeps');
  s.go(10.5, 8.5); // the kitchen
  const cook = s.guardAt(8, 11), second = s.guardAt(16, 9);
  assert.ok(cook.dormant && second.dormant);
  cook.alive = false;
  s.world.events.emit('kill', { victim: cook });
  s.t.update();
  assert.ok(!second.dormant && second.heard === 1, 'the man in the entrance hall comes once the first is dead');
  s.go(18.5, 10.5); // out of his front door: the man at the far end of the corridor is only pointed at
  assert.equal(s.t.stage, 3);
  const shooter = s.guardAt(28, 16);
  assert.ok(shooter.dormant);
  s.go(18.5, 16.5); // the corner
  assert.equal(s.t.stage, 4);
  assert.ok(!shooter.dormant, 'the shooter wakes as he turns into the long corridor');
  s.go(30.5, 16.5); // the landing
  const two = [s.guardAt(30, 12), s.guardAt(32, 12)], third = s.guardAt(31, 11);
  assert.ok(two.every((g) => g.dormant) && third.dormant);
  s.world.events.emit('pickup', { ch: s.player, type: 'pistol' });
  s.t.update();
  assert.ok(two.every((g) => !g.dormant) && third.dormant, 'the gun in his hand calls two of them up the stairs');
  for (const g of two) {
    g.alive = false;
    s.world.events.emit('kill', { victim: g });
  }
  s.t.update();
  assert.ok(!third.dormant, 'and the third when they are dead');
});

test('tutorial: a guard who is not blind wakes when he is walked up to from the front', () => {
  const s = stub();
  s.go(30.5, 15.5); // onto the landing, no gun in hand
  const man = s.guardAt(30, 12); // he faces south
  assert.ok(man.dormant);
  s.go(30.5, 13.6);
  assert.ok(!man.dormant);
});

test('tutorial: the gun the shooter drops is left with two rounds', () => {
  const s = stub();
  s.go(22.5, 16.5);
  const shooter = s.guardAt(28, 16), gun = { type: 'pistol', def: { kind: 'gun' }, mag: 5, x: shooter.x + 10, y: shooter.y, dead: false };
  const far = { type: 'pistol', def: { kind: 'gun' }, mag: 7, x: px(4), y: px(4), dead: false };
  shooter.alive = false;
  s.world.events.emit('kill', { victim: shooter });
  s.world.items.push(gun, far);
  s.t.update();
  assert.equal(gun.mag, 2);
  assert.equal(far.mag, 7, 'another gun, elsewhere, is not his');
});

test('tutorial: the hints say one thing at a time, next to what it is about', () => {
  const s = stub(), names = () => s.t.hints().map((h) => h.text);
  s.go(4.5, 3.5);
  assert.deepEqual(names(), ['MOVE']);
  s.go(6.9, 3.5);
  assert.deepEqual(names(), [], 'he has walked: nothing more to say here');
  s.go(10.5, 3.5);
  assert.deepEqual(names(), ['GET BEHIND HIM']);
  s.player.nearBack = s.guardAt(11, 3);
  assert.deepEqual(s.t.hints().map((h) => `${h.key} ${h.text}`), ['SPACE BREAK HIS NECK']);
  s.go(10.5, 8.5);
  s.world.items.push({ type: 'bat', x: px(11.0), y: px(11.6), dead: false });
  assert.deepEqual(names(), ['TAKE IT', 'PUNCH']);
  s.guardAt(8, 11).knocked = 2;
  assert.deepEqual(names(), ['FINISH HIM', 'TAKE IT'], 'a man on the floor comes first');
  Object.assign(s.player, { armed: true, weapon: { type: 'bat' }, def: { kind: 'melee' } });
  s.guardAt(8, 11).alive = false;
  assert.deepEqual(names(), ['STRIKE']);
  s.go(18.5, 10.5);
  assert.deepEqual(names(), ['RUN AND SLIDE UNDER HIS FIRE']);
  s.go(18.5, 16.5);
  assert.deepEqual(names(), ['RUN AND SLIDE UNDER HIS FIRE']);
  s.go(30.5, 16.5);
  Object.assign(s.player, { weapon: { type: 'pistol', mag: 2 }, def: { kind: 'gun' } });
  assert.deepEqual(names(), ['SHOOT']);
  s.player.weapon.mag = 0;
  assert.deepEqual(names(), ['THROW IT'], 'the window is not pointed at while they stand');
  for (const at of [[30, 12], [32, 12], [31, 11]]) s.guardAt(...at).alive = false;
  assert.deepEqual(names(), ['DIVE']);
});

test('tutorial: a retry starts again at the last place reached, the rooms before it empty', () => {
  const s = stub(3);
  assert.equal(s.world.enemies.length, 7 - 3, 'the living room and the kitchen are behind him');
  assert.equal(s.world.removed.length, 3);
  assert.deepEqual([s.player.x, s.player.y], [px(15.5), px(10.5)]);
  assert.equal(s.t.owed, null);
  s.t.update();
  assert.equal(s.t.stage, 3, 'he stands in his entrance hall');
  assert.deepEqual(s.t.hints().map((h) => h.text), ['RUN AND SLIDE UNDER HIS FIRE']);
});

test('tutorial: the shooter, pointed at from one stage and fought in the next, is still there on a retry of the second', () => {
  const s = stub(4);
  assert.equal(s.world.enemies.length, 4);
  assert.ok(s.guardAt(28, 16)?.dormant);
  s.t.update();
  assert.ok(s.t.stage === 3 && s.guardAt(28, 16).dormant, 'he starts short of the corner');
  s.go(18.5, 16.5);
  assert.ok(!s.guardAt(28, 16).dormant, 'and is shot at as soon as he turns it');
});

test('tutorial: a retry at the landing finds the shooter gone and his gun, two rounds in it, at its feet', () => {
  const s = stub(5);
  assert.equal(s.world.enemies.length, 3);
  assert.equal(s.guardAt(28, 16), undefined);
  assert.deepEqual([s.t.owed.type, s.t.owed.mag], ['pistol', 2]);
  assert.ok(Math.hypot(s.t.owed.x - s.player.x, s.t.owed.y - s.player.y) < TILE * 1.2);
});

test('tutorial: past the window it is over, once', () => {
  const s = stub();
  let n = 0;
  s.world.events.on('tutorialEnd', () => n++);
  s.go(34.5, 16.5);
  assert.equal(s.t.over, false);
  s.go(36.5, 16.5);
  s.go(37.5, 16.5);
  assert.ok(s.t.over && s.player.invulnerable);
  assert.equal(n, 1);
});

test('fires: one with a stage catches when that place of the lesson is reached, one without burns from the start', () => {
  const calls = [];
  const world = { tutorial: { stage: 1 }, player: { x: 0, y: 0 }, light() { calls.push('light'); }, sound(n) { calls.push(n); },
    particles: { fire() { calls.push('fire'); }, smoke() {}, embers() {} } };
  const f = new Fires(world, [[2, 2, 2], [5, 5, 4], [8, 8]]);
  assert.deepEqual(f.lit().map((x) => x.x / TILE), [8]);
  world.tutorial.stage = 2;
  assert.deepEqual(f.lit().map((x) => x.x / TILE), [2, 8]);
  for (let i = 0; i < 30; i++) f.update(1 / 60);
  assert.ok(calls.includes('fire') && calls.includes('light') && calls.includes('crackle'));
  world.tutorial = null; // a level that is no lesson: everything burns
  assert.equal(f.lit().length, 3);
  assert.equal(new Fires(world).lit().length, 0);
});
