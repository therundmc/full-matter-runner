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

// the three ways into the bar's grounds, as the tiles one has to cross on the facade line
const WAYS = {
  front: [[21, 20], [22, 20]],
  gate: [[11, 20], [12, 20], [13, 20]],
  gap: [[32, 20]],
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

test('level 1 has three ways in, and each of them alone leads from the start alley to the way out', () => {
  const closed = (names) => {
    const m = new TileMap(level.tiles);
    for (const n of names) for (const [x, y] of WAYS[n]) m.blocked[y * m.w + x] = 1;
    return m;
  };
  for (const way of Object.keys(WAYS)) {
    const others = Object.keys(WAYS).filter((n) => n !== way);
    assert.ok(findPath(closed(others), spawn.x, spawn.y, exit.x, exit.y), `through the ${way} only`);
  }
  assert.equal(findPath(closed(Object.keys(WAYS)), spawn.x, spawn.y, exit.x, exit.y), null, 'and there is no fourth one');
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

test('the gap right of the bar: a door on the street, one metre wide, off limits, a window of the bar on it', () => {
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
  assert.equal(windows, 1);
});

test('level 1 is fought hand to hand: two guns in the house (the bar room, the boss), one hidden in the liquor store', () => {
  const guards = [];
  level.actors.forEach((r, row) => [...r].forEach((ch, col) => { if ('pushrbkmji'.includes(ch.toLowerCase())) guards.push({ ch: ch.toLowerCase(), col, row }); }));
  assert.equal(guards.length, 13);
  const guns = guards.filter((g) => 'pushr'.includes(g.ch));
  assert.deepEqual(guns.map((g) => g.ch).sort(), ['h', 'p']);
  const [boss, pool] = guns;
  assert.ok(boss.col >= 25 && boss.col <= 30 && boss.row >= 6 && boss.row <= 10, "the shotgun is the boss's, in the back room");
  assert.equal(level.jobs[`${pool.col},${pool.row}`], 'pool', "the pistol is the pool player's");
  // lying around: knives, a cue by the pool table, one pistol behind the liquor store's locked door; no ammunition
  // anywhere and no weapon in the start alley (the first one is in the trunk of the first parked car)
  assert.deepEqual([...new Set(level.actors.join('').replace(/[^0-9]/g, ''))].sort(), ['0', '1', '6']);
  assert.equal(level.actors.join('').split('1').length - 1, 1);
  assert.equal(level.actors[17][8], '1');
  assert.ok(!/[nzvwgq]/.test(level.actors.join('')), 'no ammunition box');
  for (let row = 32; row <= 36; row++) assert.ok(!/[0-9]/.test(level.actors[row].slice(20, 24)), 'nothing to pick up in the alley');
  const trunks = level.props.filter((p) => p[4]?.trunk);
  assert.deepEqual(trunks.map((p) => [p[0], p[4].trunk]), [['car2', 'tire_iron']]);
  assert.ok(trunks[0][1] < 20, 'the first car on the left');
  assert.equal(level.intro, 'sit');
});

// the shop fronts of the street: room (inclusive tiles), display panes and door on the facade row, neon sign
const SHOPS = {
  liquor: { room: [3, 17, 8, 19], facade: 20, panes: [5, 6, 7], door: [8, 'L'], sign: 'neon_sign_liquor' },
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
    // a closed box behind its facade: nothing in it leads anywhere
    for (let col = x0 - 1; col <= x1 + 1; col++) {
      for (let row = y0 - 1; row <= y1 + 1; row++) {
        const inside = col >= x0 && col <= x1 && row >= y0 && row <= y1;
        if (inside) assert.equal(m.isSolid(col, row), false, `${name}: floor at ${col},${row}`);
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
