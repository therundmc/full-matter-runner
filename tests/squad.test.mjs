import { test } from 'node:test';
import assert from 'node:assert/strict';
import { load } from './setup.mjs';

const { AI, TILE } = await load('game/Config.js');
const { WEAPONS } = await load('game/data/weapons.js');
const { BARKS, BOSS } = await load('game/data/barks.js');
const BARKS_BACKUP = new Set(BARKS.backup);
const { backupOdds, backupGroup, recruits, yieldOdds, turnedAway, gunAtHand, free } = await load('game/ai/Squad.js');
const { default: TileMap } = await load('game/world/TileMap.js');
const { default: EventBus } = await load('engine/EventBus.js');
const { findPath } = await load('engine/nav/Pathfinding.js');

const B = AI.backup, R = AI.surrender;
const guard = (x, y, over = {}) => ({ alive: true, x, y, aware: 0, knocked: 0, yielded: false, ...over });

// ---------------- the decisions ----------------
test('backup: only a guard alone or outgunned runs for help, not with the player on him, never the boss', () => {
  const far = B.near + 50;
  assert.equal(backupOdds('thug', { alone: false, outgunned: false, dist: far }), 0, 'his mates are coming: he fights');
  assert.equal(backupOdds('thug', { alone: true, outgunned: false, dist: B.near - 1 }), 0, 'too late to run');
  assert.equal(backupOdds('heavy', { alone: true, outgunned: true, dist: far, boss: true }), 0, 'the boss never runs');
  const alone = backupOdds('thug', { alone: true, outgunned: false, dist: far });
  assert.equal(alone, B.odds.thug);
  assert.ok(backupOdds('thug', { alone: true, outgunned: true, dist: far }) > alone, 'a gun against his hands: more likely');
  assert.ok(backupOdds('brute', { alone: true, outgunned: false, dist: far }) < alone, 'a brute rather fights');
  assert.ok(backupOdds('thug', { alone: false, outgunned: true, dist: far }) > 0, 'outgunned, even with mates around');
});

test('backup: he runs to the biggest bunch of free guards within reach, the nearer the better', () => {
  const me = guard(0, 0);
  const lone = guard(B.far + 20, 0);
  const pack = [guard(0, B.far + 200), guard(30, B.far + 210), guard(-30, B.far + 190)];
  const busy = [guard(-B.far - 20, 0, { aware: 2 }), guard(-B.far - 40, 0, { yielded: true }), guard(-B.far - 30, 10, { knocked: 3 })];
  const toofar = [guard(B.reach + 10, 0), guard(B.reach + 20, 0), guard(B.reach + 30, 0), guard(B.reach + 40, 0)];
  const all = [me, lone, ...pack, ...busy, ...toofar];
  const g = backupGroup(all, me);
  assert.ok(pack.includes(g.to) && g.size === 3, 'the room with three men in it');
  assert.equal(backupGroup([me, guard(B.far - 10, 0), ...busy], me), null, 'nobody free far enough to be worth the run');
  assert.ok(!free(busy[0]) && !free(busy[1]) && !free(busy[2]) && free(lone));
  const come = recruits(all, me, pack[0].x, pack[0].y);
  assert.equal(come.length, Math.min(B.bring, 3));
  assert.equal(come[0], pack[0], 'nearest first');
});

test('surrender: a man on his own with nothing to fight with, the armed player close; never the boss', () => {
  const ok = { unarmed: true, alone: true, playerArmed: true, dist: R.close - 10 };
  assert.equal(yieldOdds('thug', ok), R.unarmed.thug);
  assert.ok(yieldOdds('brute', ok) < yieldOdds('thug', ok), 'a brute rarely gives up');
  for (const [k, v] of [['unarmed', false], ['alone', false], ['playerArmed', false], ['dist', R.close + 1], ['boss', true]]) {
    assert.equal(yieldOdds('thug', { ...ok, [k]: v }), 0, k);
  }
});

test('surrender: on his knees, he waits for the player to turn his back, then a loaded gun at hand tempts him', () => {
  const p = { x: 0, y: 0, angle: 0 }, e = { x: 100, y: 0 };
  assert.equal(turnedAway(p, e, true), false, 'aimed at');
  assert.equal(turnedAway({ ...p, angle: Math.PI }, e, true), true, 'his back to him');
  assert.equal(turnedAway({ ...p, angle: R.turned - 0.1 }, e, true), false, 'only glancing aside');
  assert.equal(turnedAway(p, e, false), true, 'out of sight');
  const items = [
    { x: 100 + R.grab + 5, y: 0, def: { kind: 'gun' }, mag: 7 },
    { x: 140, y: 0, def: { kind: 'gun' }, mag: 0 },
    { x: 130, y: 0, def: { kind: 'melee' } },
    { x: 160, y: 0, def: { kind: 'gun' }, mag: 3 },
  ];
  assert.equal(gunAtHand(items, e), items[3], 'the loaded gun within reach, not the empty one nor the bat');
  assert.equal(gunAtHand(items.slice(0, 3), e), null);
});

// ---------------- a real guard in a bare world ----------------
// one long room; no physics engine: velocities are applied by hand
async function room() {
  globalThis.document ??= { createElement: () => ({ getContext: () => ({ fillRect() {} }) }) };
  const { default: Enemy } = await load('game/entities/Enemy.js');
  const { default: Director } = await load('game/ai/Director.js');
  const rows = ['##################################'];
  for (let i = 0; i < 6; i++) rows.push('#' + '.'.repeat(32) + '#');
  rows.push(rows[0]);
  const map = new TileMap(rows);
  const events = new EventBus();
  const world = {
    map, props: [], enemies: [], chars: [], doors: [], items: [], texts: [], time: 0, level: {}, events, cleared: false,
    tutorial: null, totalEnemies: 0,
    player: { alive: true, isPlayer: true, x: 5 * TILE, y: 3.5 * TILE, angle: 0, moving: 0, armed: true, def: WEAPONS.pistol },
    particles: { smoke() {}, dust() {}, glass() {}, floaters() {}, shard() {}, blood() {}, sparks() {} },
    camera: { x: 0, y: 0, viewRadius: () => ({ x: 1e4, y: 1e4 }) },
    sound() {}, light() {}, emit() {}, addBody() {}, slowmo() {}, after() {}, floorAt: () => 'wood',
    addItem(it) { this.items.push(it); }, removeItem(it) { it.dead = true; },
    sightLine: () => true, lineOfSight: () => true,
    pathForGuard: (a, b, c, d) => findPath(map, a, b, c, d),
    get enemiesLeft() { return this.enemies.filter((e) => e.alive && !e.yielded).length; },
  };
  const add = (col, kind, weapon, row = 3) => {
    const e = new Enemy(world, (col + 0.5) * TILE, (row + 0.5) * TILE, Math.PI, kind, weapon);
    world.enemies.push(e); world.chars.push(e);
    return e;
  };
  const make = () => { world.director = new Director(world); world.totalEnemies = world.enemies.length; };
  const step = (e, s) => {
    for (let t = 0; t < s; t += 1 / 60) {
      world.time += 1 / 60;
      e.update(1 / 60);
      const v = Matter.Body.getVelocity(e.body);
      Matter.Body.setPosition(e.body, { x: e.x + v.x, y: e.y + v.y });
    }
  };
  return { world, add, make, step };
}

const withRandom = (v, fn) => { const r = Math.random; Math.random = () => v; try { return fn(); } finally { Math.random = r; } };

test('surrender: a guard empty-handed and on his own gives up in front of the armed player, and is counted out', async () => {
  const { world, add, make } = await room();
  const e = add(9, 'thug', 'pistol');
  const far = add(30, 'thug', 'bat');
  make();
  let given = 0;
  world.events.on('surrender', () => given++);
  e.weapon = null; // thrown away dry
  e.setState('combat');
  e.sees = true;
  e.react = 0;
  far.aware = 2; // a mate in the fight, but far away: he is on his own
  withRandom(0, () => assert.equal(e.loseNerve(1 / 60), true));
  assert.ok(e.yielded && e.state === 'yield' && given === 1);
  assert.equal(world.enemiesLeft, 1, 'out of the fight');
  assert.ok(world.texts.some((t) => ["DON'T SHOOT!", 'I GIVE UP!', "I'M DONE! I'M DONE!"].includes(t.str)), 'he says so');
  // armed, he does not
  const { world: w2, add: add2, make: make2 } = await room();
  const g = add2(9, 'thug', 'bat');
  make2();
  g.setState('combat'); g.sees = true; g.react = 0;
  withRandom(0, () => assert.equal(g.loseNerve(1 / 60), false));
  assert.equal(w2.enemiesLeft, 1);
});

test('surrender: on his knees, with the player\'s back turned and a loaded gun at hand, he goes for it; never once cleared', async () => {
  for (const cleared of [false, true]) {
    const { world, add, make, step } = await room();
    const e = add(9, 'thug', 'pistol');
    make();
    e.weapon = null;
    e.surrender();
    world.cleared = cleared;
    world.items.push({ x: e.x + 60, y: e.y, def: WEAPONS.pistol, type: 'pistol', mag: 4, dead: false, speed: 0 });
    world.player.angle = Math.PI; // facing away from him (he kneels east of the player)
    withRandom(0, () => step(e, R.wait + 1.2));
    if (cleared) { assert.ok(e.yielded, 'the level is over: he stays down'); continue; }
    assert.ok(!e.yielded && (e.state === 'fetch' || e.weapon?.type === 'pistol'), `got up for the gun (${e.state})`);
    assert.equal(world.enemiesLeft, 1, 'back in the fight');
  }
  // while the player keeps him covered, he stays down
  const { world, add, make, step } = await room();
  const e = add(9, 'thug', 'pistol');
  make();
  e.weapon = null;
  e.surrender();
  world.items.push({ x: e.x + 60, y: e.y, def: WEAPONS.pistol, type: 'pistol', mag: 4, dead: false, speed: 0 });
  world.player.angle = 0;
  withRandom(0, () => step(e, 5));
  assert.ok(e.yielded);
});

test('backup: alone and outgunned at contact, he runs to the others, sends them in by name and comes back with them', async () => {
  const { world, add, make, step } = await room();
  const e = add(12, 'thug', 'bat');
  const pack = [add(28, 'thug', 'knife', 2), add(29, 'brute', 'bat', 3), add(28, 'thug', 'bat', 4)];
  make();
  e.lastKnown = { x: world.player.x, y: world.player.y };
  world.director.sighted(world.player.x, world.player.y);
  e.setState('combat');
  // the shout reaches nobody (the others are beyond it)
  assert.ok(Math.hypot(pack[0].x - e.x, pack[0].y - e.y) > AI.shoutRadius);
  const off = withRandom(0, () => e.callOut());
  assert.equal(off, true);
  assert.equal(e.state, 'backup');
  assert.ok(pack.includes(e.backupAt.to));
  // he gets there (carried most of the way), they all go after the player, and he leads them back
  Matter.Body.setPosition(e.body, { x: pack[1].x - 50, y: pack[1].y });
  e.sees = false;
  e.perceive = () => {};
  world.time += 1; // the run took a while
  step(e, 0.5);
  assert.equal(e.state, 'hunt');
  assert.ok(pack.every((g) => g.state === 'hunt' && g.aware === 2), pack.map((g) => g.state).join());
  assert.ok(pack.every((g) => Math.hypot(g.lastKnown.x - world.player.x, g.lastKnown.y - world.player.y) < 1), 'to where he was seen');
  assert.ok(world.texts.some((t) => BARKS_BACKUP.has(t.str) || pack.some((g) => t.str.startsWith(g.nick))), world.texts.map((t) => t.str).join());
  // one roll per guard
  e.setState('combat');
  assert.equal(withRandom(0, () => e.callOut()), false);
});

test('backup: with his mates in earshot, and armed like the player, he stands and fights', async () => {
  const { world, add, make } = await room();
  const e = add(12, 'thug', 'pistol');
  add(16, 'thug', 'bat');
  add(30, 'thug', 'bat');
  make();
  world.director.sighted(world.player.x, world.player.y);
  e.setState('combat');
  assert.equal(withRandom(0, () => e.callOut()), false);
  assert.equal(e.state, 'combat');
});

test('barks: the right line for each event, voiced, by name', async () => {
  const { world, add, make } = await room();
  const a = add(8, 'thug', 'bat'), b = add(10, 'thug', 'bat'), c = add(20, 'thug', 'bat');
  make();
  const heard = [];
  world.sound = (name) => heard.push(name);
  const last = () => world.texts.at(-1).str;
  // a mate killed in front of him: his name
  a.alive = false;
  b.canSeePoint = () => true;
  b.witnessKill(a);
  assert.ok(last().includes(a.nick), last());
  assert.ok(heard.includes('shout'), 'yelled');
  // a body come upon: who it is
  world.time += 5; heard.length = 0;
  c.setState('check');
  c.checkTarget = { kind: 'body', x: c.x, y: c.y, who: a, seen: new Set() };
  c.sub = 'look'; c.t = 2;
  c.doCheck(0.016);
  assert.ok(BARKS.found.map((l) => l.replace('{N}', a.nick)).includes(last()), last());
  assert.ok(heard.includes('mutter'), 'muttered');
  // the boss's body: the boss
  world.time += 5; c.barkT = 0;
  c.setState('check');
  c.checkTarget = { kind: 'body', x: c.x, y: c.y, who: { nick: 'BOSS', boss: true }, seen: new Set() };
  c.sub = 'look'; c.t = 2;
  c.doCheck(0.016);
  assert.ok(BARKS.chief.includes(last()), last());
  // a smashed window, a forced door, the fuse box
  for (const [kind, lines] of [['window', BARKS.window], ['door', BARKS.door], ['power', BARKS.fuse]]) {
    world.time += 5; c.barkT = 0;
    c.check({ kind, x: c.x + 40, y: c.y, seen: new Set() });
    assert.ok(lines.includes(last()), `${kind}: ${last()}`);
  }
  // the last two left: one calls out for a fallen mate
  world.time += 5; b.barkT = 0;
  b.mourn = { at: world.time, N: a.nick };
  b.perceive = () => {}; b.scanWorld = () => {};
  b.update(0.016);
  assert.ok(BARKS.alone.map((l) => l.replaceAll('{N}', a.nick)).includes(last()), last());
});

test('the boss: his word the first time he sees the player, big, slowed down, his fire held; once only', async () => {
  const { world, add, make } = await room();
  const boss = add(9, 'heavy', 'shotgun');
  boss.takeJob('boss');
  make();
  let slow = null;
  world.slowmo = (k, s) => { slow = [k, s]; };
  boss.spot(false);
  const bubble = world.texts.find((t) => t.bubble);
  assert.ok(bubble && BOSS.lines.includes(bubble.str) && bubble.who === boss);
  assert.deepEqual(slow, BOSS.slowmo);
  assert.ok(boss.react >= BOSS.hold, 'he says it before he shoots');
  assert.equal(boss.nick, 'BOSS');
  boss.setState('hunt');
  boss.spot(false);
  assert.equal(world.texts.filter((t) => t.bubble).length, 1, 'once');
});
