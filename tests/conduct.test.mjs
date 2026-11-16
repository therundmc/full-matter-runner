import { test } from 'node:test';
import assert from 'node:assert/strict';
import { load } from './setup.mjs';

const { Case, STAGE, judge, complies, opening } = await load('game/ai/Conduct.js');
const { ACTS } = await load('game/data/conduct.js');
const { BARKS } = await load('game/data/barks.js');
const { default: Director } = await load('game/ai/Director.js');
const { default: TileMap } = await load('game/world/TileMap.js');
const { AI, TILE } = await load('game/Config.js');

const C = AI.challenge;
const px = (c) => (c + 0.5) * TILE;

test('conduct: every act is told with a line of its own and has a way to comply', () => {
  for (const [name, a] of Object.entries(ACTS)) {
    assert.ok(BARKS[a.order], `${name}: ${a.order}`);
    assert.ok(['leave', 'unarmed', 'calm', 'away'].includes(a.comply), name);
    assert.ok(a.rank > 0, name);
  }
  for (const k of ['hey', 'press', 'shove', 'settle', 'letgo', 'snap']) assert.ok(BARKS[k], k);
});

test('conduct: told, warned, shoved, then the fight, when he will not comply', () => {
  const c = new Case('trespass', { x: 0, y: 0 }, 0);
  assert.equal(c.stage, STAGE.GO, 'on his way over first');
  assert.equal(c.next(1), STAGE.TOLD);
  const seen = [];
  let t = 1;
  for (let i = 0; i < 2000 && c.stage < STAGE.FIGHT; i++) {
    t += 0.05;
    if (judge(c, { complied: false, lost: 0 }, t, 0.05) === 'escalate') seen.push([c.next(t), Math.round((t - 1) * 10) / 10]);
  }
  assert.deepEqual(seen.map((s) => s[0]), [STAGE.WARNED, STAGE.SHOVED, STAGE.FIGHT]);
  const W = ACTS.trespass.wait;
  assert.ok(Math.abs(seen[0][1] - W[0]) < 0.11 && Math.abs(seen[2][1] - (W[0] + W[1] + W[2])) < 0.2, 'each after its wait');
});

test('conduct: complying long enough lets him off; doing it again moves the guard on at once; out of sight he lets it go', () => {
  const c = new Case('weapon', { x: 0, y: 0 }, 0);
  c.next(0);
  assert.equal(judge(c, { complied: true, lost: 0 }, 0.5, 0.5), 'wait', 'a moment first');
  assert.equal(judge(c, { complied: true, lost: 0 }, 1.3, 0.8), 'settle');
  const v = new Case('vault', { x: 0, y: 0 }, 0);
  v.next(0);
  assert.equal(judge(v, { complied: true, lost: 0 }, 2, 2), 'wait', 'a trifle: he watches him the whole wait');
  assert.equal(v.saw('vault'), true);
  assert.equal(judge(v, { complied: true, lost: 0 }, 2.1, 0.1), 'escalate', 'did it again');
  const g = new Case('noise', { x: 0, y: 0 }, 0);
  g.next(0);
  assert.equal(g.saw('window', false), false, 'the glass of the pane he put in is the same doing');
  assert.equal(g.act, 'window');
  assert.equal(g.again, false);
  const w = new Case('weapon', { x: 0, y: 0 }, 0);
  assert.equal(w.saw('weapon'), false, 'still holding it is not news');
  assert.equal(w.saw('trespass'), true);
  assert.equal(w.act, 'trespass', 'the worse act becomes the case');
  assert.equal(judge(w, { complied: false, lost: C.lost + 0.1 }, 1, 0.1), 'drop');
});

test('conduct: what doing as told means, act by act, and a man let off not long ago is warned at once', () => {
  const at = { x: 100, y: 100 };
  assert.equal(complies(new Case('trespass', at, 0), { x: 0, y: 0 }, true), false);
  assert.equal(complies(new Case('trespass', at, 0), { x: 0, y: 0 }, false), true);
  assert.equal(complies(new Case('weapon', at, 0), { x: 0, y: 0, armed: true }, false), false);
  assert.equal(complies(new Case('weapon', at, 0), { x: 0, y: 0, armed: false }, false), true);
  assert.equal(complies(new Case('lurk', at, 0), { x: 120, y: 100 }, false), false, 'still by the door');
  assert.equal(complies(new Case('lurk', at, 0), { x: 100 + ACTS.lurk.away + 1, y: 100 }, false), true);
  assert.equal(opening([], 10), STAGE.TOLD);
  assert.equal(opening([5], 10), STAGE.WARNED);
  assert.equal(opening([5], 5 + C.memory + 1), STAGE.TOLD, 'forgotten after a while');
  const c = new Case('vault', at, 0, STAGE.WARNED);
  assert.equal(c.next(1), STAGE.WARNED, 'opens at the warning');
});

// a bare world: a room whose west half is premises (the east half public), one guard in the east half facing west, the player (unarmed)
// somewhere; no physics engine (velocities applied by hand)
async function room(playerAt) {
  globalThis.document ??= { createElement: () => ({ getContext: () => ({ fillRect() {} }) }) };
  const { default: Enemy } = await load('game/entities/Enemy.js');
  const { findPath } = await load('engine/nav/Pathfinding.js');
  const map = new TileMap(['############', '#..........#', '#..........#', '#..........#', '#..........#', '############']);
  const emitted = [];
  const events = { on() {}, emit(name, data) { emitted.push([name, data]); } };
  const player = { alive: true, isPlayer: true, x: px(playerAt[0]), y: px(playerAt[1]), radius: 10, armed: false, hasGun: false, moving: 0,
    def: { kind: 'melee' }, angle: 0, vel: { x: 0, y: 0 },
    shoves: 0, shoved() { this.shoves++; } };
  const world = {
    map, props: [], enemies: [], chars: [player], doors: [], windows: [], fences: [], items: [], texts: [], time: 0, events, player,
    level: { premises: [[1, 1, 4, 4]], welcome: [[5, 1, 10, 4]] }, // the east half: a bar room, nobody minds him there
    particles: { smoke() {}, dust() {}, glass() {}, floaters() {}, shard() {}, blood() {}, fire() {} },
    sound() {}, light() {}, emit() {}, after() {}, addBody() {}, floorAt: () => 'wood', sightLine: () => true, lineOfSight: () => true,
    camera: { x: 0, y: 0, viewRadius: () => ({ x: 9999, y: 9999 }) },
    pathForGuard: (a, b, c, d, cost) => findPath(map, a, b, c, d, 4000, cost),
  };
  world.director = new Director(world);
  const e = new Enemy(world, px(9), px(2.5), Math.PI, 'thug', 'fists');
  e.scanWorld = () => {};
  world.enemies.push(e); world.chars.push(e);
  world.director.nickOf(e);
  const step = (s, each) => {
    for (let t = 0; t < s; t += 1 / 60) {
      world.time += 1 / 60;
      world.director.update(1 / 60);
      e.update(1 / 60);
      const v = Matter.Body.getVelocity(e.body);
      Matter.Body.setPosition(e.body, { x: e.x + v.x, y: e.y + v.y });
      each?.();
    }
  };
  const stages = () => emitted.filter(([n]) => n === 'challenge').map(([, d]) => d.stage);
  return { world, e, player, step, stages, lines: () => world.texts.map((t) => t.str) };
}

test('a stranger walking into the premises unarmed is told to get out, warned, shoved, and fought if he stays', async () => {
  const { world, e, player, step, stages, lines } = await room([3, 2.5]);
  step(0.3);
  assert.equal(e.state, 'challenge', 'he goes over to him instead of raising the alarm');
  assert.equal(world.director.provoked, false);
  assert.ok(lines().some((l) => BARKS.out.includes(l)) || lines().some((l) => BARKS.hey.includes(l)), 'he tells him');
  step(14);
  assert.deepEqual(stages(), [STAGE.GO, STAGE.TOLD, STAGE.WARNED, STAGE.SHOVED, STAGE.FIGHT]);
  assert.equal(player.shoves, 1, 'a shove before the fight');
  assert.equal(world.director.provoked, true, 'then he is a threat for good');
  assert.equal(e.state, 'combat');
});

test('a stranger who walks back out when told is let off, and warned at once the next time', async () => {
  const { world, e, player, step, stages } = await room([3, 2.5]);
  step(4, () => { if (stages().includes(STAGE.TOLD) && player.x < px(6)) player.x = px(7); });
  step(2);
  assert.equal(world.director.provoked, false);
  assert.notEqual(e.state, 'challenge', 'the word is over');
  assert.equal(world.director.letOff.length, 1, 'remembered');
  assert.ok(!stages().includes(STAGE.WARNED));
  player.x = px(3);
  step(4);
  assert.equal(stages().filter((s) => s === STAGE.WARNED).length, 1, 'back in: straight to the warning');
});

test('a stranger with a gun in his hand gets no word: he is a threat', async () => {
  const { world, player, stages } = await room([7, 2.5]);
  player.armed = true; player.hasGun = true;
  assert.equal(world.director.conduct('weapon', player.x, player.y), null);
  assert.equal(stages().length, 0);
});

test('while all is calm only the two nearest go and look at a noise; the others glance at it; a gunshot brings them all', () => {
  const guards = [1, 2, 3, 4].map((k) => ({
    alive: true, aware: 0, knocked: 0, x: k * 40, y: 0, heard: 0, glanced: 0,
    hear() { this.heard++; }, glanceAt() { this.glanced++; },
  }));
  const world = { time: 0, enemies: guards, level: {}, player: { alive: false, x: -999, y: -999 }, events: { on() {}, emit() {} }, lineOfSight: () => true };
  const d = new Director(world);
  d.emit('glass', 0, 0, 400);
  assert.deepEqual(guards.map((g) => g.heard), [1, 1, 0, 0]);
  assert.deepEqual(guards.map((g) => g.glanced), [0, 0, 1, 1]);
  d.emit('gunshot', 0, 0, 400);
  assert.deepEqual(guards.map((g) => g.heard), [2, 2, 1, 1]);
  d.setPhase('caution', 10);
  d.emit('door', 0, 0, 400);
  assert.deepEqual(guards.map((g) => g.heard), [3, 3, 2, 2], 'on edge: everyone looks');
});
