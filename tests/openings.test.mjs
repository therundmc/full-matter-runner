import { test } from 'node:test';
import assert from 'node:assert/strict';
import { load } from './setup.mjs';

// no DOM under Node: entities only need canvases to exist, nothing is looked at here
const ctx = new Proxy({}, { get: (t, k) => t[k] ?? (() => ctx), set: (t, k, v) => { t[k] = v; return true; } });
globalThis.document = { createElement: () => ({ width: 0, height: 0, getContext: () => ctx }) };

const { TILE, WALL_HP, WALL_WEAR } = await load('game/Config.js');
const { default: TileMap } = await load('game/world/TileMap.js');
const { default: EventBus } = await load('engine/EventBus.js');
const { LEAF, doorLeaves, windowSupports, heldBy } = await load('game/world/Openings.js');
const { SHARDS, shardBurst, shardHarm } = await load('game/systems/Glass.js');
const { destroyWall, damageWall, watchOpenings, destroyWindow } = await load('game/systems/Destruction.js');
const { default: Window } = await load('game/entities/Window.js');
const { default: Door } = await load('game/entities/Door.js');
const { default: Debris } = await load('game/entities/Debris.js');
const { findVault } = await load('game/systems/Cover.js');

const seeded = (s = 1) => () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
const near = (a, b, eps = 1e-9) => Math.abs(a - b) < eps;

// a brick front: a locked door at x = 2, a door at x = 4, a glazed pair at x = 6..7, a lone window at x = 10,
// and a window in a partition (running along y) at (8, 4)
const ROWS = [
  'XXXXXXXXXXXXX',
  'X...........X',
  'XXLXDXGGXXGXX',
  'X.......#...X',
  'X.......G...X',
  'X.......#...X',
  'XXXXXXXXXXXXX',
];

// just enough of World for the destruction code: real map, real event bus, timers run by hand
function world() {
  const quiet = new Proxy({}, { get: () => () => {} });
  const w = {
    map: new TileMap(ROWS), events: new EventBus(), time: 0, particles: quiet, decals: quiet,
    windows: [], doors: [], debris: [], chars: [], enemies: [], player: null, timers: [], heard: [],
    addBody() {}, removeBody() {}, shake() {}, noise() {}, flashGlass() {},
    sound(name) { this.heard.push(name); },
    addDebris(d) { this.debris.push(d); },
    after(sec, fn) { this.timers.push(fn); },
    run() { while (this.timers.length) this.timers.shift()(); },
    destroyWindow(win, dirA, power) { destroyWindow(this, win, dirA, power); },
  };
  for (const [cx, cy, vertical] of [[6, 2, false], [7, 2, false], [10, 2, false], [8, 4, true]]) {
    w.windows.push(new Window(w, cx, cy, vertical));
  }
  for (const [x, locked] of [[2, true], [4, false]]) {
    const [l] = doorLeaves(x, 2, 1, true);
    w.doors.push(new Door(w, l.hx, l.hy, l.angle, l.len, { locked, cells: [2 * w.map.w + x], support: l.support, strike: l.strike }));
  }
  watchOpenings(w);
  return w;
}
const windowAt = (w, cx, cy) => w.windows.find((g) => g.cx === cx && g.cy === cy);

test('door leaves: a single leaf hinges on the wall before the run and latches on the one after', () => {
  const [l, ...rest] = doorLeaves(4, 2, 1, true);
  assert.equal(rest.length, 0);
  assert.deepEqual([l.support, l.strike], [[3, 2], [5, 2]]);
  assert.equal(l.angle, 0);
  assert.equal(l.hy, 2.5 * TILE);
  // the leaf fills the opening: from the wall end (minus the play) to the latch gap
  assert.ok(near(l.hx - LEAF.back - LEAF.inset, 4 * TILE));
  assert.ok(near(l.hx + l.len + LEAF.gap, 5 * TILE));
  // a real door: about 0.9 m of leaf
  assert.ok(l.len + LEAF.back > 0.85 * TILE && l.len + LEAF.back < TILE);
  const [v] = doorLeaves(4, 2, 1, false);
  assert.deepEqual([v.support, v.strike, v.hx], [[4, 1], [4, 3], 4.5 * TILE]);
  assert.ok(near(v.angle, Math.PI / 2) && near(v.hy + v.len + LEAF.gap, 3 * TILE));
});

test('door leaves: a run of two is a double door, each leaf on its own wall end, meeting in the middle', () => {
  const [a, b, ...rest] = doorLeaves(4, 2, 2, true);
  assert.equal(rest.length, 0);
  assert.deepEqual([a.support, b.support, a.strike, b.strike], [[3, 2], [6, 2], null, null]);
  assert.ok(near(a.angle, 0) && near(b.angle, Math.PI));
  const tipA = a.hx + a.len, tipB = b.hx - b.len;
  assert.ok(near(tipB - tipA, LEAF.gap) && near((tipA + tipB) / 2, 5 * TILE));
  // longer runs stay a single wide leaf
  const [wide, none] = doorLeaves(4, 2, 3, true);
  assert.equal(none, undefined);
  assert.deepEqual(wide.strike, [7, 2]);
});

test('openings know which wall tiles hold them', () => {
  assert.deepEqual(windowSupports(6, 2, false), [[5, 2], [7, 2]]);
  assert.deepEqual(windowSupports(8, 4, true), [[8, 3], [8, 5]]);
  const w = world();
  const held = heldBy(w, 5, 2);
  assert.deepEqual(held.windows, [windowAt(w, 6, 2)]);
  assert.deepEqual(held.doors, []);
  assert.deepEqual(held.unbolted, []);
  // (3, 2) carries the hinges of the plain door and takes the bolt of the locked one
  const mid = heldBy(w, 3, 2);
  assert.deepEqual([mid.doors, mid.unbolted], [[w.doors[1]], [w.doors[0]]]);
  assert.deepEqual(heldBy(w, 1, 1), { hung: [], windows: [], doors: [], unbolted: [] });
});

test('a window goes with the wall that holds it: glass, frame and sill, leaving a passable breach', () => {
  const w = world();
  const g = windowAt(w, 10, 2), i = 2 * w.map.w + 10;
  const events = [];
  for (const type of ['windowBroken', 'windowDestroyed']) w.events.on(type, (e) => events.push([type, e.cx ?? null]));
  assert.equal(w.map.blocked[i], 1);
  destroyWall(w, 9, 2, Math.PI / 2, 1);
  assert.ok(!w.windows.includes(g));
  assert.equal(g.intact, false);
  assert.deepEqual(events, [['windowBroken', null], ['windowDestroyed', 10]]);
  // the tile is now what a destroyed wall tile is
  assert.deepEqual([w.map.at(10, 2), w.map.blocked[i], w.map.isSolid(10, 2), w.map.canBreak(10, 2)], ['_', 0, false, false]);
  assert.ok(w.heard.includes('glass') && w.heard.includes('metalBreak'));
  // shards of every size and pieces of frame fly off
  assert.ok(w.debris.some((d) => d.harm?.cause === 'slash'));
  assert.ok(w.debris.some((d) => d.body.material === 'metal'));
  // the other windows stand
  assert.equal(w.windows.length, 3);
});

test('a glazed run collapses window after window once one end has gone', () => {
  const w = world();
  const version = w.map.version;
  destroyWall(w, 5, 2, 0, 1);
  assert.ok(!windowAt(w, 6, 2) && windowAt(w, 7, 2), 'the next pane follows a moment later');
  w.run();
  assert.ok(!windowAt(w, 7, 2));
  assert.deepEqual([w.map.at(6, 2), w.map.at(7, 2)], ['_', '_']);
  assert.ok(w.map.version > version, 'lights and sight lines are rebuilt');
  // the lone window further along that wall is not part of the run
  assert.ok(windowAt(w, 10, 2));
});

test('a window frame takes a beating before it is torn out; the glass goes first', () => {
  const w = world();
  const g = windowAt(w, 8, 4);
  assert.equal(g.blow(g.x - 20, g.y, 0, null, 2), true);
  assert.equal(g.intact, false, 'the first blow only breaks the pane');
  assert.ok(w.windows.includes(g));
  assert.equal(g.blow(g.x - 20, g.y, 0, null, 0), false, 'bare hands do nothing to a frame');
  assert.equal(g.blow(g.x - 20, g.y, Math.PI, null, 2), false, 'nor does a blow aimed away from it');
  g.blow(g.x - 20, g.y, 0, null, 2);
  g.blow(g.x - 20, g.y, 0, null, 2);
  assert.ok(w.windows.includes(g) && g.nicks.length > 0);
  g.damageFrame(3, 0);
  assert.ok(!w.windows.includes(g));
  assert.equal(w.map.at(8, 4), '_');
});

test('gunfire only wears a wall; a blast brings it down, the sooner for that wear, and its window with it', () => {
  const w = world();
  for (let k = 0; k < 200; k++) damageWall(w, 8, 3, 1, 8.5 * TILE, 3.5 * TILE, 0, 1);
  assert.equal(w.map.isSolid(8, 3), true, 'two hundred rounds and the wall still stands');
  assert.equal(w.map.hp[3 * w.map.w + 8], WALL_HP['#'] * (1 - WALL_WEAR));
  assert.ok(windowAt(w, 8, 4));
  damageWall(w, 8, 3, WALL_HP['#'] * (1 - WALL_WEAR), 8.5 * TILE, 3.5 * TILE, 0, 1.3, true);
  assert.equal(w.map.isSolid(8, 3), false, 'what the wear left, a blast takes');
  assert.ok(!windowAt(w, 8, 4));
});

test('doors fall with the wall carrying their hinges; a bolt shot into a wall that goes is free', () => {
  const w = world();
  const [locked, plain] = w.doors;
  const broken = [];
  w.events.on('doorBroken', (e) => broken.push(e));
  assert.equal(w.map.blocked[2 * w.map.w + 2], 1);
  destroyWall(w, 3, 2, Math.PI / 2, 1);
  assert.deepEqual(w.doors, [locked], 'the door hinged on that tile is down');
  assert.equal(locked.locked, false);
  assert.equal(w.map.blocked[2 * w.map.w + 2], 0);
  assert.equal(broken.length, 2);
  // and the locked one goes too once its own hinge wall does
  destroyWall(w, 1, 2, Math.PI / 2, 1);
  assert.deepEqual(w.doors, []);
});

test('a pane bursts into shards of three sizes, the big ones few, heavy and fast', () => {
  const rnd = seeded(7);
  for (let k = 0; k < 20; k++) {
    const burst = shardBurst(1, rnd);
    for (const [size, s] of Object.entries(SHARDS)) {
      const n = burst.filter((x) => x.size === size);
      assert.ok(n.length >= s.n[0] && n.length <= s.n[1], `${size}: ${n.length}`);
      for (const x of n) {
        assert.ok(Math.abs(x.spread) <= s.cone && Math.abs(x.along) <= 0.5 && x.variant >= 0 && x.variant < 8);
        assert.ok(x.speed >= s.v[0] * 400 - 1e-6 && x.speed <= s.v[1] * 400 + 1e-6);
      }
    }
  }
  assert.ok(SHARDS.big.kg > SHARDS.mid.kg && SHARDS.mid.kg > SHARDS.small.kg);
  assert.ok(SHARDS.big.cone < SHARDS.small.cone, 'big shards keep to the line of the hit');
  // every big shard leaves the frame faster than it needs to kill, a harder hit throws them harder
  assert.ok(shardBurst(1, rnd).filter((x) => x.size === 'big').every((x) => x.speed / 60 > SHARDS.big.lethal));
  const slow = shardBurst(1, seeded(3)), fast = shardBurst(1.5, seeded(3));
  assert.ok(near(fast[0].speed, slow[0].speed * 1.5, 1e-6));
});

test('only big shards kill, like a blade, and never the one who broke the pane', () => {
  const me = {};
  assert.equal(shardHarm('small', me), null);
  const mid = shardHarm('mid', me);
  assert.equal(mid.lethal, Infinity);
  assert.ok(!mid.all);
  const big = shardHarm('big', me);
  assert.deepEqual([big.kind, big.cause, big.by.wound, big.all, big.ignore, big.owner], ['cut', 'slash', 'slash', true, me, me]);
  assert.ok(big.lethal > big.knock);
});

// a shard thrown at `speed` (px/step) into a character standing right in its way
function throwShard(size, speed, victim, breaker = null) {
  const quiet = new Proxy({}, { get: () => () => {} });
  const all = [victim, breaker].filter(Boolean);
  const w = {
    time: 0, particles: quiet, decals: quiet, addBody() {}, sound() {}, bakeDebris() {},
    chars: all, enemies: all.filter((c) => c.isEnemy), player: all.find((c) => c.isPlayer) || null,
  };
  const d = new Debris(w, { width: size === 'big' ? 15 : 8, height: 4 }, victim.x - 6, victim.y, 0, speed * 60, 0, 0,
    { kg: SHARDS[size].kg, material: 'glass', harm: shardHarm(size, breaker) });
  d.update(1 / 60);
  return d;
}
const person = (o = {}) => ({
  x: 100, y: 100, radius: 9, alive: true, killed: null, knocked: false,
  kill(angle, cause, by, how) { this.alive = false; this.killed = { angle, cause, by, how }; },
  knock() { this.knocked = true; },
  ...o,
});

test('a big shard still flying fast opens a throat: guards, passers-by and the player alike', () => {
  const guard = person({ isEnemy: true }), player = person({ isPlayer: true, x: 300 });
  throwShard('big', 6, guard, player);
  assert.equal(guard.alive, false);
  assert.deepEqual([guard.killed.cause, guard.killed.by, guard.killed.how.wound], ['slash', player, 'slash']);
  assert.ok(near(guard.killed.angle, 0), 'he falls the way the shard flew');
  // a pane shot out by a guard cuts the player down, and the guard is the killer
  const shooter = person({ isEnemy: true, x: 300 }), victim = person({ isPlayer: true });
  throwShard('big', 6, victim, shooter);
  assert.deepEqual([victim.alive, victim.killed.cause, victim.killed.by], [false, 'slash', shooter]);
  const passerBy = person({ isCivilian: true });
  throwShard('big', 6, passerBy);
  assert.equal(passerBy.alive, false);
});

test('shards spare whoever broke the pane, slow or small ones never kill, and one at rest is harmless', () => {
  const breaker = person({ isPlayer: true });
  assert.equal(throwShard('big', 6, breaker, breaker).harm !== null && breaker.alive, true);
  // below the lethal speed a big shard only floors a guard and leaves the player alone
  const guard = person({ isEnemy: true });
  const spent = throwShard('big', 3, guard);
  assert.deepEqual([guard.alive, guard.knocked, spent.harm], [true, true, null]);
  const player = person({ isPlayer: true });
  throwShard('big', 3, player);
  assert.equal(player.alive, true);
  // mid shards knock guards down at any speed and ignore everybody else
  const g2 = person({ isEnemy: true }), p2 = person({ isPlayer: true });
  throwShard('mid', 9, g2);
  throwShard('mid', 9, p2);
  assert.deepEqual([g2.alive, g2.knocked, p2.alive], [true, true, true]);
  const g3 = person({ isEnemy: true });
  throwShard('small', 9, g3);
  assert.deepEqual([g3.alive, g3.knocked], [true, false]);
  // lying on the floor: the harm is dropped for good, walking into it later does nothing
  const g4 = person({ isEnemy: true, x: 900 });
  const lying = throwShard('big', 0.5, g4);
  lying.age = 1;
  lying.update(1 / 60);
  assert.equal(lying.harm, null);
  lying.onCollide({ entity: g4 });
  assert.equal(g4.alive, true);
});

test('an intact window can be dived through by the player alone, a broken one by anybody', () => {
  const w = world();
  w.physics = { bodies: () => [] };
  w.props = [];
  const pane = windowAt(w, 10, 2);
  const who = (isPlayer) => ({ x: pane.x, y: pane.y + 14, radius: 9, isPlayer });
  const dive = findVault(w, who(true), -Math.PI / 2);
  assert.equal(dive?.kind, 'window');
  assert.equal(dive.over, pane);
  assert.ok(dive.to.y < pane.y, 'lands on the far side');
  assert.equal(findVault(w, who(false), -Math.PI / 2), null, 'a guard needs the glass gone first');
  pane.shatter(-Math.PI / 2);
  assert.equal(findVault(w, who(true), -Math.PI / 2)?.kind, 'window');
  assert.equal(findVault(w, who(false), -Math.PI / 2)?.kind, 'window');
});

test('nobody mid-dive, nor in the instant after landing, is cut by a flying shard', () => {
  const diver = person({ isPlayer: true, vaulting: { kind: 'window' } });
  throwShard('big', 6, diver);
  assert.equal(diver.alive, true);
  const landed = person({ isPlayer: true, glassSafe: 0.3 });
  throwShard('big', 6, landed);
  assert.equal(landed.alive, true);
  const bystander = person({ isPlayer: true, glassSafe: 0 });
  throwShard('big', 6, bystander);
  assert.equal(bystander.alive, false);
});
