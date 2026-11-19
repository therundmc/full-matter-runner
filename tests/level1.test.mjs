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
  front: [[20, 20], [21, 20]],
  gate: [[11, 20], [12, 20], [13, 20]],
  gap: [[30, 20]],
  shop: [[8, 20]],          // the liquor store's front door, and on by its own ladder to the roof (the only way up)
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

test('level 1 has four ways in on foot, and each of them alone leads from the start alley to the way out', () => {
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
  assert.equal(m.at(30, 20), 'D');
  assert.equal(d.isThreat(stranger(px(30.5), px(21.5))), false, 'in front of the door');
  let windows = 0;
  for (let row = 5; row <= 19; row++) {
    assert.equal(m.isSolid(30, row), false, `row ${row}`);
    assert.equal(m.isSolid(31, row), true, `east wall, row ${row}`);
    if (m.at(29, row) === 'G') windows++;
    else assert.equal(m.isSolid(29, row), true, `the bar's wall, row ${row}`);
    assert.equal(d.isThreat(stranger(px(30.5), px(row + 0.5))), true, `row ${row} is guarded ground`);
  }
  assert.equal(windows, 2, 'the pool corner and the VIP room');
  assert.equal(m.at(29, 14), 'G');
  assert.equal(m.at(29, 17), 'G');
});

test('level 1 is fought hand to hand: three guns in the house (the gaming room, the money, the boss), one hidden on the roof', () => {
  const guards = [];
  level.actors.forEach((r, row) => [...r].forEach((ch, col) => { if ('pushrbkmji'.includes(ch.toLowerCase())) guards.push({ ch: ch.toLowerCase(), col, row }); }));
  assert.equal(guards.length, 12);
  const guns = guards.filter((g) => 'pushr'.includes(g.ch));
  assert.deepEqual(guns.map((g) => g.ch).sort(), ['h', 'p', 'p']);
  const boss = guns.find((g) => g.ch === 'h'), pistols = guns.filter((g) => g.ch === 'p');
  assert.ok(boss.col >= 24 && boss.col <= 28 && boss.row >= 6 && boss.row <= 10, "the shotgun is the boss's, in the back room");
  assert.deepEqual(pistols.map((g) => level.jobs[`${g.col},${g.row}`]).sort(), ['cards', 'count'], "the pistols: the poker dealer's, the money counter's");
  for (const g of pistols) assert.ok(!level.arms[`${g.col},${g.row}`], 'on them from the start');
  // lying around: knives, a cue by the pool table, two bats (behind the counter, against the front wall), the pistol up
  // on the liquor store's roof; no ammunition anywhere and no weapon in the start alley (the first one is in the trunk
  // of the first parked car)
  assert.deepEqual([...new Set(level.actors.join('').replace(/[^0-9]/g, ''))].sort(), ['5', '6']);
  assert.deepEqual(level.lean.map((l) => l[0]).sort(), ['bat', 'bat', 'cue'], 'the bats and the cue stand against the walls');
  assert.equal(level.actors[11][4], '5', 'a bat up on the liquor store roof');
  const roofGun = level.drops.filter((d) => d[0] === 'pistol');
  assert.equal(roofGun.length, 1);
  assert.equal(level.tiles[Math.floor(roofGun[0][2])][Math.floor(roofGun[0][1])], '^', 'the spare pistol is up on a roof');
  assert.ok(!/[nzvwgq]/.test(level.actors.join('')), 'no ammunition box');
  for (let row = 32; row <= 36; row++) assert.ok(!/[0-9]/.test(level.actors[row].slice(19, 23)), 'nothing to pick up in the alley');
  const trunks = level.props.filter((p) => p[4]?.trunk);
  assert.deepEqual(trunks.map((p) => [p[0], p[4].trunk]), [['car2', 'tire_iron']]);
  assert.ok(trunks[0][1] < 20, 'the first car on the left');
  assert.equal(level.intro, 'swig');
});

test('level 1: the guards start bare-handed, their weapons kept where they make sense; two knives in pockets, two brawlers', () => {
  const at = (job) => Object.keys(level.jobs).filter((k) => level.jobs[k] === job);
  const kept = (key) => level.arms[key];
  const near = (a, kind) => level.lean.some(([k, c, r]) => k === kind && Math.hypot(c - a[0], r - a[1]) < 0.01);
  const [bar] = at('wipe'), doors = at('door');
  assert.ok(near(kept(bar), 'bat') && kept(bar)[1] > 13 && kept(bar)[1] < 13.6, "the bartender's bat behind his counter");
  const front = doors.find((k) => +k.split(',')[1] === 21), vip = doors.find((k) => k !== front);
  assert.ok(near(kept(front), 'bat') && kept(front)[1] > 21, "the doorman's bat against the front wall, on the sidewalk");
  assert.ok(near(kept(vip), 'cue'), 'the VIP room doorman runs for the cue by the pool table');
  const [pimp] = at('dope');
  assert.ok(Array.isArray(kept(pimp)), 'the pimp goes for the blade on his table');
  assert.equal(Object.values(level.arms).filter((a) => a === 'fists').length, 2, 'two brawlers');
  const ch = (k) => level.actors[+k.split(',')[1]][+k.split(',')[0]].toLowerCase();
  const knives = Object.keys(level.jobs).filter((k) => !level.arms[k] && 'jk'.includes(ch(k)));
  assert.equal(knives.length, 2, 'two blades in their pockets');
});

// the shop fronts of the street: room (inclusive tiles), display panes and door on the facade row, neon sign
const SHOPS = {
  liquor: { room: [3, 17, 8, 19], facade: 20, panes: [5, 6, 7], door: [8, 'L'], sign: 'neon_sign_liquor', ways: [[3, 16]] },
  video: { room: [34, 17, 37, 19], facade: 20, panes: [34, 35, 36], door: [37, 'L'], sign: 'neon_sign_video' },
  wash: { room: [26, 33, 29, 35], facade: 32, panes: [26, 27], door: [28, 'D'], sign: 'neon_sign_wash' },
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

test('the liquor store roof: up the shop\'s own ladder only, down over a parapet into the alley or the lot', () => {
  const w = world(), m = w.map, d = director(), R = PLAYER.radius;
  for (let col = 1; col <= 9; col++) for (let row = 8; row <= 14; row++) assert.equal(m.at(col, row), '^', `roof at ${col},${row}`);
  assert.ok(PROPS.ladder.climb && PROPS.ladder.vault && PROPS.ladder.blocksPath && PROPS.parapet.vault && PROPS.parapet.blocksPath);
  assert.ok(PROPS.ladder.lasting && PROPS.parapet.lasting, 'neither can be destroyed: each closes a gap in a wall');
  // [from, heading, kind, the tile one lands on]
  // no ladder on the street (the user: one outside made no sense): the sidewalk below the roof's corner is a wall
  assert.ok(!w.props.some((p) => p.type === 'ladder' && p.y > 19 * TILE), 'no ladder outside');
  assert.notEqual(findVault(w, stranger(px(1.5), px(21.35)), -Math.PI / 2)?.kind, 'climb');
  const moves = [
    [[3.5, 17.35], -Math.PI / 2, 'climb', [3, 15]],   // up from the shop
    [[3.5, 15.65], Math.PI / 2, 'climb', [3, 17]],
    [[9.6, 12.5], 0, 'prop', [11, 12]],               // down into the service alley, inside the gate
    [[9.6, 3.5], 0, 'prop', [11, 3]],                 // down into the back lot
  ];
  // a parapet is one way, down: from the alley or the lot there is no getting back up over it
  assert.ok(PROPS.parapet.down);
  for (const row of [12.5, 3.5]) assert.equal(findVault(w, stranger(px(11.4), px(row)), Math.PI), null, `no way up at row ${row}`);
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

test("ways round: the toilets have a window on the back lot, the VIP room and the pool corner one each on the gap", () => {
  const m = new TileMap(level.tiles);
  for (const [col, row, inside, outside] of [[21, 5, [21, 6], [21, 4]], [29, 17, [28, 17], [30, 17]], [29, 14, [28, 14], [30, 14]]]) {
    assert.equal(m.at(col, row), 'G', `window at ${col},${row}`);
    assert.equal(m.isSolid(...inside), false);
    assert.equal(m.isSolid(...outside), false);
  }
  // furniture leaves room to land behind each of them (a prop's box never reaches the tile behind the pane)
  const landing = [[21, 6], [28, 17], [28, 14]];
  for (const [col, row] of landing) {
    const cx = px(col + 0.5), cy = px(row + 0.5);
    const hit = level.props.some(([type, pc, pr]) => PROPS[type] && !PROPS[type].hung && !PROPS[type].overhead
      && Math.hypot(px(pc) - cx, px(pr) - cy) < 12);
    assert.equal(hit, false, `something stands right behind the window at ${col},${row}`);
  }
  // the boss's room has none: its one way to the lot is the locked back door
  for (let col = 23; col <= 29; col++) assert.notEqual(m.at(col, 5), 'G', `a window in the boss's wall at ${col}`);
  assert.equal(m.at(24, 5), 'L');
});

test('no flock of pigeons sits in the start alley, where the cat lives', () => {
  for (const [col, row] of level.critters.pigeons) {
    assert.ok(!(col >= 19 && col < 23 && row >= 31 && row < 36), `flock at ${col}, ${row}`);
  }
});

test('level 1 states its objective: one line while guards remain, one once it is cleared', () => {
  assert.equal(level.objective.length, 2);
  for (const line of level.objective) assert.ok(typeof line === 'string' && line.length > 0);
});

test('level 1: every one of the 12 guards has something to do, at a post or on a round, and can get to every room', async () => {
  const { POSTS } = await load('game/data/posts.js');
  const guards = [];
  level.actors.forEach((row, y) => [...row].forEach((ch, x) => { if ('pusrhbkmji'.includes(ch.toLowerCase()) && ch !== ' ') guards.push([x, y]); }));
  assert.equal(guards.length, 12);
  for (const [x, y] of guards) {
    const key = `${x},${y}`, job = level.jobs[key];
    assert.ok(job || level.patrols[key], `the guard at ${key} just stands there`);
    if (job) assert.ok(POSTS[job], `${key}: ${job} has a script`);
    // what he works at standing is within his reach: he is placed square at it (Enemy.takeJob)
    const front = POSTS[job]?.front;
    if (front) assert.ok(level.props.some(([type, c, r]) => type === front && Math.hypot(c - x - 0.5, r - y - 0.5) < 2), `${key}: no ${front} by him`);
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
  for (const [tx, ty] of [[26, 11], [24, 5]]) map.blocked[ty * map.w + tx] = 0;
  const rooms = { storeroom: [17, 7], toilets: [21, 8], 'back room': [26, 9], bar: [21, 14], vip: [27, 17], lot: [19, 4],
    alley: [12, 12], street: [19, 21] };
  // (not the bartender: the nav grid takes the shelves of his back bar, 8 px deep against the wall, for furniture that
  // fills his walkway, data/props.js back_bar blocksPath; he walks it straight, Enemy.work)
  for (const [x, y] of guards.filter(([x, y]) => level.jobs[`${x},${y}`] !== 'wipe')) {
    for (const [room, [rx, ry]] of Object.entries(rooms)) {
      assert.ok(findPath(map, px(x + 0.5), px(y + 0.5), px(rx + 0.5), px(ry + 0.5)), `the guard at ${x},${y} cannot get to the ${room}`);
    }
  }
});
