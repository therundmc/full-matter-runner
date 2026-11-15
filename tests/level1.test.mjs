import { test } from 'node:test';
import assert from 'node:assert/strict';
import { load } from './setup.mjs';

const { default: TileMap } = await load('game/world/TileMap.js');
const { findPath } = await load('engine/nav/Pathfinding.js');
const { findVault } = await load('game/systems/Cover.js');
const { PROPS } = await load('game/data/props.js');
const { default: Director } = await load('game/ai/Director.js');
const { TILE, CAT, PLAYER, LIGHTING } = await load('game/Config.js');
const { default: level } = await load('game/data/levels/level1.js');

const px = (t) => t * TILE;
const spawn = (() => {
  const row = level.actors.findIndex((r) => r.includes('@'));
  return { x: px(level.actors[row].indexOf('@') + 0.5), y: px(row + 0.5) };
})();
const exit = { x: px(level.exit.x), y: px(level.exit.y) };

// the ways into the bar's grounds on foot, as the tiles one has to cross on the facade line (the windows one can
// dive through come on top: see the test of the ways round)
const WAYS = {
  front: [[21, 20], [22, 20]],
  gate: [[11, 20], [12, 20], [13, 20]],
  gap: [[32, 20]],
  roof: [[1, 20]],          // the fire-escape ladder at the corner of the liquor store
  shop: [[8, 20]],          // the liquor store's front door, and on by its own ladder to the roof
};

// a world with the level's walls and its furniture, enough for the vault geometry
function world() {
  const map = new TileMap(level.tiles);
  const props = level.props.filter(([type]) => PROPS[type] && !PROPS[type].hung).map(([type, col, row, deg]) => {
    const def = PROPS[type];
    const opts = { isStatic: true, angle: (deg * Math.PI) / 180, collisionFilter: { category: CAT.PROP } };
    const body = def.r ? Matter.Bodies.circle(px(col), px(row), def.r, opts) : Matter.Bodies.rectangle(px(col), px(row), def.w, def.h, opts);
    return { type, def, body, dead: false, x: px(col), y: px(row) };
  });
  return { map, props, windows: [], physics: { bodies: () => props.map((p) => p.body) } };
}
const director = () => new Director({ level, time: 0, enemies: [], events: { on() {}, emit() {} } });
const stranger = (x, y) => ({ x, y, radius: PLAYER.radius, armed: false });

test('level 1 has five ways in on foot, and each of them alone leads from the start alley to the way out', () => {
  const closed = (names) => {
    const m = new TileMap(level.tiles);
    for (const n of names) for (const [x, y] of WAYS[n]) m.blocked[y * m.w + x] = 1;
    return m;
  };
  for (const way of Object.keys(WAYS)) {
    const others = Object.keys(WAYS).filter((n) => n !== way);
    assert.ok(findPath(closed(others), spawn.x, spawn.y, exit.x, exit.y), `through the ${way} only`);
  }
  assert.equal(findPath(closed(Object.keys(WAYS)), spawn.x, spawn.y, exit.x, exit.y), null, 'and there is no sixth one');
});

test('the service alley is closed by a chain-link gate that is climbed both ways', () => {
  const w = world();
  const gate = w.props.filter((p) => p.type === 'chain_fence');
  assert.deepEqual(gate.map((p) => Math.floor(p.x / TILE)).sort(), [11, 12, 13], 'one panel per tile of the mouth');
  assert.ok(PROPS.chain_fence.vault && PROPS.chain_fence.static && !PROPS.chain_fence.blocksPath);
  const y = gate[0].y, d = director();
  for (const col of [11.5, 12.5, 13.5]) {
    const out = stranger(px(col), y + PROPS.chain_fence.h / 2 + PLAYER.radius + 2);
    const over = findVault(w, out, -Math.PI / 2);
    assert.equal(over?.kind, 'climb', `no way over at column ${col}`);
    assert.equal(over.over.type, 'chain_fence');
    assert.ok(over.to.y < y - PLAYER.radius, 'lands behind the gate');
    assert.equal(d.isThreat(out), false, 'the sidewalk is public');
    assert.equal(d.isThreat(stranger(over.to.x, over.to.y)), true, 'behind the gate is the bar\'s ground');
    const back = findVault(w, stranger(over.to.x, over.to.y), Math.PI / 2);
    assert.ok(back && back.to.y > y + PLAYER.radius, 'and back out');
  }
});

test('the gap right of the bar: a door on the street, one metre wide, off limits, two windows of the bar on it', () => {
  const m = new TileMap(level.tiles), d = director();
  assert.equal(m.at(32, 20), 'D');
  assert.equal(d.isThreat(stranger(px(32.5), px(21.5))), false, 'in front of the door');
  let windows = 0;
  for (let row = 5; row <= 19; row++) {
    assert.equal(m.isSolid(32, row), false, `row ${row}`);
    assert.equal(m.isSolid(33, row), true, `east wall, row ${row}`);
    if (m.at(31, row) === 'G') windows++;
    else assert.equal(m.isSolid(31, row), true, `the bar's wall, row ${row}`);
    assert.equal(d.isThreat(stranger(px(32.5), px(row + 0.5))), true, `row ${row} is guarded ground`);
  }
  assert.equal(windows, 2, 'the pool corner and the VIP room');
  assert.equal(m.at(31, 14), 'G');
  assert.equal(m.at(31, 17), 'G');
});

test('level 1 is fought hand to hand: two guns in the house (the bar room, the boss), one hidden in the liquor store', () => {
  const guards = [];
  level.actors.forEach((r, row) => [...r].forEach((ch, col) => { if ('pushrbkmji'.includes(ch.toLowerCase())) guards.push({ ch: ch.toLowerCase(), col, row }); }));
  assert.equal(guards.length, 14);
  const guns = guards.filter((g) => 'pushr'.includes(g.ch));
  assert.deepEqual(guns.map((g) => g.ch).sort(), ['h', 'p']);
  const [boss, pool] = guns;
  assert.ok(boss.col >= 25 && boss.col <= 30 && boss.row >= 6 && boss.row <= 10, "the shotgun is the boss's, in the back room");
  assert.equal(level.jobs[`${pool.col},${pool.row}`], 'pool', "the pistol is the pool player's");
  // lying around: knives, a cue by the pool table, one pistol behind the liquor store's locked door; no ammunition
  // anywhere and no weapon in the start alley (the first one is in the trunk of the first parked car)
  assert.deepEqual([...new Set(level.actors.join('').replace(/[^0-9]/g, ''))].sort(), ['1', '5', '6']);
  assert.deepEqual(level.lean.map((l) => l[0]), ['cue'], 'the cue stands against a wall of the bar room');
  assert.equal(level.actors[11][4], '5', 'the one bat is up on the liquor store roof');
  assert.equal(level.actors.join('').split('1').length - 1, 1);
  assert.equal(level.actors[17][8], '1');
  assert.ok(!/[nzvwgq]/.test(level.actors.join('')), 'no ammunition box');
  for (let row = 32; row <= 36; row++) assert.ok(!/[0-9]/.test(level.actors[row].slice(20, 24)), 'nothing to pick up in the alley');
  const trunks = level.props.filter((p) => p[4]?.trunk);
  assert.deepEqual(trunks.map((p) => [p[0], p[4].trunk]), [['car2', 'tire_iron']]);
  assert.ok(trunks[0][1] < 20, 'the first car on the left');
  assert.equal(level.intro, 'swig');
});

// the shop fronts of the street: room (inclusive tiles), display panes and door on the facade row, neon sign
const SHOPS = {
  liquor: { room: [3, 17, 8, 19], facade: 20, panes: [5, 6, 7], door: [8, 'L'], sign: 'neon_sign_liquor', ways: [[3, 16]] },
  video: { room: [36, 17, 39, 19], facade: 20, panes: [36, 37, 38], door: [39, 'L'], sign: 'neon_sign_video' },
  wash: { room: [27, 33, 31, 35], facade: 32, panes: [27, 28, 29], door: [30, 'D'], sign: 'neon_sign_wash' },
};

test('three shop fronts light the street: panes on the sidewalk, a neon sign, lamps and goods behind the glass', () => {
  const m = new TileMap(level.tiles), d = director();
  const lit = (type) => PROPS[type]?.light ?? LIGHTING.propLights[type];
  for (const [name, s] of Object.entries(SHOPS)) {
    const [x0, y0, x1, y1] = s.room;
    const street = s.facade + (s.facade > y1 ? 1 : -1);
    for (const col of s.panes) {
      assert.equal(m.at(col, s.facade), 'G', `${name}: pane at column ${col}`);
      assert.equal(m.at(col, street), 's', `${name}: the pane gives on the sidewalk`);
    }
    assert.equal(m.at(s.door[0], s.facade), s.door[1], `${name}: door`);
    // a closed box behind its facade, but for the ways out it is known to have (`ways`)
    const way = (col, row) => (s.ways || []).some(([c, r]) => c === col && r === row);
    for (let col = x0 - 1; col <= x1 + 1; col++) {
      for (let row = y0 - 1; row <= y1 + 1; row++) {
        const inside = col >= x0 && col <= x1 && row >= y0 && row <= y1;
        if (inside) assert.equal(m.isSolid(col, row), false, `${name}: floor at ${col},${row}`);
        else if (way(col, row)) assert.equal(m.isSolid(col, row), false, `${name}: way out at ${col},${row}`);
        else if (row !== s.facade || !'GDL'.includes(m.at(col, row))) assert.equal(m.isSolid(col, row), true, `${name}: wall at ${col},${row}`);
        if (inside) assert.equal(d.isThreat(stranger(px(col + 0.5), px(row + 0.5))), false, `${name} is public ground`);
      }
    }
    const signs = level.props.filter(([type]) => type === s.sign);
    assert.equal(signs.length, 1, `${name}: one sign`);
    assert.ok(lit(s.sign) && Math.floor(signs[0][2]) === street, `${name}: the sign hangs on the wall over the sidewalk`);
    const inside = level.props.filter(([, col, row]) => col > x0 && col < x1 + 1 && row > y0 && row < y1 + 1);
    assert.ok(inside.filter(([type]) => lit(type)).length >= 2, `${name}: lit from inside by its own fixtures`);
    assert.ok(inside.filter(([type]) => !lit(type) || type === 'tv').length >= 4, `${name}: things to see behind the glass`);
  }
  assert.ok(!level.props.some(([type]) => /marquee/.test(type)) && !(level.roof || []).some(([type]) => /sign|marquee/.test(type)), 'no rooftop sign');
});

test('the liquor store roof: up a ladder from the street or from the shop, down over a parapet into the alley or the lot', () => {
  const w = world(), m = w.map, d = director(), R = PLAYER.radius;
  for (let col = 1; col <= 9; col++) for (let row = 8; row <= 14; row++) assert.equal(m.at(col, row), '^', `roof at ${col},${row}`);
  assert.ok(PROPS.ladder.climb && PROPS.ladder.vault && PROPS.ladder.blocksPath && PROPS.parapet.vault && PROPS.parapet.blocksPath);
  assert.ok(PROPS.ladder.lasting && PROPS.parapet.lasting, 'neither can be destroyed: each closes a gap in a wall');
  // [from, heading, kind, the tile one lands on]
  const moves = [
    [[1.5, 21.35], -Math.PI / 2, 'climb', [1, 19]],   // up from the sidewalk
    [[1.5, 19.65], Math.PI / 2, 'climb', [1, 21]],    // and back down
    [[3.5, 17.35], -Math.PI / 2, 'climb', [3, 15]],   // up from the shop
    [[3.5, 15.65], Math.PI / 2, 'climb', [3, 17]],
    [[9.6, 12.5], 0, 'prop', [11, 12]],               // down into the service alley, inside the gate
    [[11.4, 12.5], Math.PI, 'prop', [9, 12]],
    [[9.6, 3.5], 0, 'prop', [11, 3]],                 // down into the back lot
    [[11.4, 3.5], Math.PI, 'prop', [9, 3]],
  ];
  for (const [[col, row], a, kind, [tc, tr]] of moves) {
    const v = findVault(w, stranger(px(col), px(row)), a);
    assert.equal(v?.kind, kind, `no way from ${col},${row}`);
    assert.deepEqual([Math.floor(v.to.x / TILE), Math.floor(v.to.y / TILE)], [tc, tr], `from ${col},${row}`);
    assert.ok(!m.solidAt(v.to.x, v.to.y) && v.to.x > R && v.to.y > R);
  }
  // nobody minds a stranger up there; the alley and the lot below are the bar's ground
  assert.equal(d.isThreat(stranger(px(5), px(11))), false);
  assert.equal(d.isThreat(stranger(px(11.5), px(12.5))), true);
  assert.equal(d.isThreat(stranger(px(11.5), px(3.5))), true);
  // the shop has no door on the service alley: its ladder is the only way on
  for (let row = 17; row <= 19; row++) assert.ok(m.isSolid(9, row) || m.isSolid(10, row), `a wall between the shop and the alley at row ${row}`);
  // nothing stands in the way at the top of either ladder
  for (const [col, row] of [[1, 15], [1, 14], [2, 14], [3, 14], [3, 15]]) {
    assert.ok(!w.props.some((p) => Math.floor(p.x / TILE) === col && Math.floor(p.y / TILE) === row), `the roof is clear at ${col},${row}`);
  }
});

test("ways round: the toilets and the boss's room have a window on the back lot, the VIP room one on the gap", () => {
  const m = new TileMap(level.tiles);
  for (const [col, row, inside, outside] of [[22, 5, [22, 6], [22, 4]], [26, 5, [26, 6], [26, 4]], [31, 17, [30, 17], [32, 17]], [31, 14, [30, 14], [32, 14]]]) {
    assert.equal(m.at(col, row), 'G', `window at ${col},${row}`);
    assert.equal(m.isSolid(...inside), false);
    assert.equal(m.isSolid(...outside), false);
  }
  // furniture leaves room to land behind each of them (a prop's box never reaches the tile behind the pane)
  const landing = [[22, 6], [26, 6], [30, 17], [30, 14]];
  for (const [col, row] of landing) {
    const cx = px(col + 0.5), cy = px(row + 0.5);
    const hit = level.props.some(([type, pc, pr]) => PROPS[type] && !PROPS[type].hung && !PROPS[type].overhead
      && Math.hypot(px(pc) - cx, px(pr) - cy) < 12);
    assert.equal(hit, false, `something stands right behind the window at ${col},${row}`);
  }
});

test('no flock of pigeons sits in the start alley, where the cat lives', () => {
  for (const [col, row] of level.critters.pigeons) {
    assert.ok(!(col >= 20 && col < 24 && row >= 32 && row < 37), `flock at ${col}, ${row}`);
  }
});

test('level 1 states its objective: one line while guards remain, one once it is cleared', () => {
  assert.equal(level.objective.length, 2);
  for (const line of level.objective) assert.ok(typeof line === 'string' && line.length > 0);
});

test('level 1: every one of the 14 guards has something to do, at a post or on a round, and can get to every room', async () => {
  const { POSTS } = await load('game/data/posts.js');
  const guards = [];
  level.actors.forEach((row, y) => [...row].forEach((ch, x) => { if ('pusrhbkmji'.includes(ch.toLowerCase()) && ch !== ' ') guards.push([x, y]); }));
  assert.equal(guards.length, 14);
  for (const [x, y] of guards) {
    const key = `${x},${y}`, job = level.jobs[key];
    assert.ok(job || level.patrols[key], `the guard at ${key} just stands there`);
    if (job) assert.ok(POSTS[job], `${key}: ${job} has a script`);
  }
  // the furniture in the way and the doors of the house open to its men (World.pathForGuard)
  const map = new TileMap(level.tiles), w = world();
  for (const p of w.props) {
    if (!p.def.blocksPath) continue;
    const b = p.body.bounds;
    for (let ty = Math.floor((b.min.y + 4) / TILE); ty <= Math.floor((b.max.y - 4) / TILE); ty++) {
      for (let tx = Math.floor((b.min.x + 4) / TILE); tx <= Math.floor((b.max.x - 4) / TILE); tx++) map.blocked[ty * map.w + tx] = 1;
    }
  }
  for (const [tx, ty] of [[27, 11], [28, 5]]) map.blocked[ty * map.w + tx] = 0;
  const rooms = { storeroom: [17, 7], toilets: [22, 8], 'back room': [27, 9], bar: [22, 15], vip: [28, 18], lot: [20, 4],
    alley: [12, 12], street: [20, 22] };
  // (not the bartender: the nav grid takes the shelves of his back bar, 8 px deep against the wall, for furniture that
  // fills his walkway, data/props.js back_bar blocksPath; he walks it straight, Enemy.work)
  for (const [x, y] of guards.filter(([x, y]) => level.jobs[`${x},${y}`] !== 'wipe')) {
    for (const [room, [rx, ry]] of Object.entries(rooms)) {
      assert.ok(findPath(map, px(x + 0.5), px(y + 0.5), px(rx + 0.5), px(ry + 0.5)), `the guard at ${x},${y} cannot get to the ${room}`);
    }
  }
});
