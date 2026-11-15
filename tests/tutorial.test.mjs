import { test } from 'node:test';
import assert from 'node:assert/strict';
import { load } from './setup.mjs';

const { TILE } = await load('game/Config.js');
const { default: EventBus } = await load('engine/EventBus.js');
const { default: Tutorial, HINTS } = await load('game/systems/Tutorial.js');
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
  return { world, t, player, go, guardAt: (c, r) => enemies.find((e) => Math.floor(e.x / TILE) === c && Math.floor(e.y / TILE) === r) };
}

test('tutorial: the level holds together (every wave has its men, zones and spawns on the floor, hints that exist)', () => {
  const floor = (c, r) => !' #X'.includes(level.tiles[Math.floor(r)][Math.floor(c)]);
  const guards = level.actors.join('').split('').filter((ch) => ENEMIES[ch]).length;
  let waved = 0;
  for (const s of level.tutorial.stages) {
    assert.ok(floor(s.spawn[0], s.spawn[1]), 'a spawn in a wall');
    assert.ok(floor(s.zone[0], s.zone[1]) && floor(s.zone[2], s.zone[3]));
    for (const h of s.hints) assert.ok(HINTS[h], `no hint ${h}`);
    for (const w of s.waves || []) {
      for (const [c, r] of w.at) {
        assert.ok(ENEMIES[level.actors[r][c]], `no guard at ${c},${r}`);
        waved++;
      }
    }
    for (const m of Object.values(s.marks || {})) assert.ok(floor(m[0], m[1]));
  }
  assert.equal(waved, guards, 'every guard belongs to a wave');
  const [c0, r0, c1, r1] = level.tutorial.fall;
  assert.ok(floor(c0, r0) && floor(c1, r1), 'there is something to land on past the window');
  assert.ok(level.tiles.some((row) => row[c0 - 1] === 'G'), 'and a window to get there by');
  assert.deepEqual(level.drops.map((d) => [d[0], d[4]]), [['bat', null], ['pistol', 2]], 'a bat, and a pistol with two rounds');
});

test('tutorial: every guard sleeps until his wave is called, room after room', () => {
  const s = stub();
  assert.ok(s.world.enemies.every((e) => e.dormant));
  assert.equal(s.t.stage, -1);
  s.go(4.5, 3.5);
  assert.equal(s.t.stage, 0);
  s.go(10.5, 3.5); // the living room: its man is only there to be seized, from any side
  assert.equal(s.t.stage, 1);
  assert.equal(s.world.game.tutorialAt.stage, 1);
  s.go(15.5, 3.5);
  assert.ok(s.guardAt(14, 3).dormant, 'walked round to his face, he still sleeps');
  s.go(12.5, 8.5); // the kitchen
  const cook = s.guardAt(11, 11), second = s.guardAt(19, 10);
  assert.ok(cook.dormant && second.dormant);
  cook.alive = false;
  s.world.events.emit('kill', { victim: cook });
  s.t.update();
  assert.ok(!second.dormant && second.heard === 1, 'the man in the pantry comes once the first is dead');
  s.go(13.5, 15.5); // the corridor
  assert.ok(!s.guardAt(21, 15).dormant, 'the shooter wakes as he walks in');
  s.go(23.5, 15.5); // the study
  const two = [s.guardAt(27, 11), s.guardAt(28, 13)], third = s.guardAt(26, 4);
  assert.ok(two.every((g) => g.dormant) && third.dormant);
  s.world.events.emit('pickup', { ch: s.player, type: 'pistol' });
  s.t.update();
  assert.ok(two.every((g) => !g.dormant) && third.dormant, 'the gun in his hand calls two of them');
  for (const g of two) {
    g.alive = false;
    s.world.events.emit('kill', { victim: g });
  }
  s.t.update();
  assert.ok(!third.dormant, 'and the third when they are dead');
});

test('tutorial: a guard who is not blind wakes when he is walked up to from the front', () => {
  const s = stub();
  s.go(24, 16.5); // into the study, the pistol left where it lies
  const man = s.guardAt(27, 11); // he faces south
  assert.ok(man.dormant);
  s.go(27.5, 12.6);
  assert.ok(!man.dormant);
});

test('tutorial: the hints say one thing at a time, next to what it is about', () => {
  const s = stub(), names = () => s.t.hints().map((h) => h.text);
  s.go(4.5, 3.5);
  assert.deepEqual(names(), ['MOVE']);
  s.go(7.5, 3.5);
  assert.deepEqual(names(), [], 'he has walked: nothing more to say here');
  s.go(10.5, 3.5);
  assert.deepEqual(names(), ['GET BEHIND HIM']);
  s.player.nearBack = s.guardAt(14, 3);
  assert.deepEqual(s.t.hints().map((h) => `${h.key} ${h.text}`), ['SPACE BREAK HIS NECK']);
  s.go(12.5, 8.5);
  s.world.items.push({ type: 'bat', x: px(13.2), y: px(12.3), dead: false });
  assert.deepEqual(names(), ['TAKE IT', 'PUNCH']);
  s.guardAt(11, 11).knocked = 2;
  assert.deepEqual(names(), ['FINISH HIM', 'TAKE IT'], 'a man on the floor comes first');
  Object.assign(s.player, { armed: true, weapon: { type: 'bat' }, def: { kind: 'melee' } });
  s.guardAt(11, 11).alive = false;
  assert.deepEqual(names(), ['STRIKE']);
  s.go(13.5, 15.5);
  assert.deepEqual(names(), ['RUN AND SLIDE UNDER HIS FIRE']);
  s.go(23.5, 15.5);
  Object.assign(s.player, { weapon: { type: 'pistol', mag: 2 }, def: { kind: 'gun' } });
  assert.deepEqual(names(), ['SHOOT']);
  s.player.weapon.mag = 0;
  assert.deepEqual(names(), ['THROW IT']);
  s.go(25.5, 5.5);
  assert.deepEqual(names(), ['DIVE']);
});

test('tutorial: a retry starts again at the last room reached, the rooms before it empty', () => {
  const s = stub(3);
  assert.equal(s.world.enemies.length, 7 - 3, 'the living room and the kitchen are behind him');
  assert.equal(s.world.removed.length, 3);
  assert.deepEqual([s.player.x, s.player.y], [px(13.5), px(13.2)]);
  s.t.update();
  assert.equal(s.t.stage, 2, 'he stands by the corridor door, the kitchen round him');
  assert.deepEqual(s.t.hints().map((h) => h.text), [], 'nothing left to do there');
});

test('tutorial: past the window it is over, once', () => {
  const s = stub();
  let n = 0;
  s.world.events.on('tutorialEnd', () => n++);
  s.go(25.5, 5.5);
  assert.equal(s.t.over, false);
  s.go(30.5, 5.5);
  s.go(31.5, 5.5);
  assert.ok(s.t.over && s.player.invulnerable);
  assert.equal(n, 1);
});
