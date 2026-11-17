import { test } from 'node:test';
import assert from 'node:assert/strict';
import { load } from './setup.mjs';

const { default: EventBus } = await load('engine/EventBus.js');
const { default: Clutter } = await load('game/systems/Clutter.js');
const { CLUTTER, SETS } = await load('game/data/clutter.js');
const { OPTIONAL_LIST } = await load('engine/Assets.js');
const { PROPS } = await load('game/data/props.js');
const { TILE } = await load('game/Config.js');
const { default: TileMap } = await load('game/world/TileMap.js');
const { planWear, WEAR_KINDS } = await load('game/render/FloorWear.js');
const { default: level1 } = await load('game/data/levels/level1.js');

// a world that records what the clutter does: no sprites in Node, so nothing is thrown, only the state and the effects
function stub() {
  const calls = { glass: 0, dust: 0, floaters: 0, spills: [], sounds: [], wisps: 0 };
  const world = {
    events: new EventBus(), debris: [], addDebris() {},
    particles: {
      glass: () => calls.glass++, drops() {}, chips() {}, dust: () => calls.dust++, floaters: () => calls.floaters++, shard() {},
    },
    sound: (name) => calls.sounds.push(name),
    smoke: { wisp: () => calls.wisps++ },
  };
  world.events.on('spill', (s) => calls.spills.push(s));
  const table = { type: 'table', x: 400, y: 300, W: 46, H: 28, dead: false, body: { angle: 0 } };
  return { world, calls, table, clutter: new Clutter(world) };
}
const live = (c, p) => c.items(p).filter((i) => i.state === 'on');

test('clutter: every set names known pieces, every piece seen has its sprite listed, the level lays only known sets', () => {
  for (const [name, set] of Object.entries(SETS)) for (const [kind] of set) assert.ok(CLUTTER[kind], `${name}: ${kind}`);
  for (const [kind, d] of Object.entries(CLUTTER)) {
    for (const s of [d.sprite, d.broken].filter(Boolean)) assert.ok(OPTIONAL_LIST.includes('clutter/' + s), `${kind}: ${s}`);
    assert.ok(d.r > 0, kind);
  }
  const laid = level1.props.filter((p) => p[4]?.clutter);
  assert.ok(laid.length >= 12, `${laid.length} pieces of furniture dressed`);
  for (const [type, , , , o] of laid) assert.ok(SETS[o.clutter] && PROPS[type], `${type}: ${o.clutter}`);
});

test('clutter: it rides on its prop, turned with it', () => {
  const { clutter, table } = stub();
  const [pitcher] = clutter.attach(table, 'booth');
  const a = clutter.place(table, pitcher);
  assert.deepEqual([a.x, a.y], [400 + pitcher.x, 300 + pitcher.y]);
  table.x += 50;
  table.body.angle = Math.PI / 2;
  const b = clutter.place(table, pitcher);
  assert.ok(Math.abs(b.x - (450 - pitcher.y)) < 1e-9 && Math.abs(b.y - (300 + pitcher.x)) < 1e-9, 'moved and turned with the table');
  assert.equal(b.a, Math.PI / 2 + pitcher.a);
});

test('clutter: a round bursts the glass on its line, the nearest first, and the drink runs off the edge onto the floor', () => {
  const { world, clutter, table, calls } = stub();
  clutter.attach(table, 'booth');
  const [pitcher, pint, napkin] = clutter.items(table);
  // shot from the west along the pitcher's row: the pitcher is hit, the glass on the far side of the table is not
  world.events.emit('propHit', { prop: table, x: table.x - 23, y: table.y + pitcher.y, dirA: 0, kind: 'bullet', power: 0.6 });
  assert.equal(pitcher.state, 'broken', 'shot to pieces where it stood');
  assert.equal(pint.state, 'on');
  assert.equal(napkin.state, 'on');
  assert.ok(calls.glass > 0 && calls.sounds.includes('clutterShatter'));
  assert.equal(calls.spills.length, 1);
  const s = calls.spills[0];
  assert.equal(s.kind, 'beer');
  assert.ok(s.x > table.x + table.W / 2, `the drink thrown on along the round, off the table (${s.x})`);
  // a pellet hits one thing at most, a rifle round goes on through more
  const fresh = clutter.attach(table, 'booth');
  world.events.emit('propHit', { prop: table, x: table.x - 23, y: table.y - 7, dirA: 0, kind: 'pellet', power: 0.4 });
  assert.equal(fresh.filter((i) => i.state !== 'on').length, 1);
});

test('clutter: a blow knocks off what stands by it, a heavy one shakes off more; a blast throws it all', () => {
  const { world, clutter, table, calls } = stub();
  clutter.attach(table, 'booth');
  const [pitcher, pint] = clutter.items(table);
  world.events.emit('propHit', { prop: table, x: table.x + pint.x, y: table.y + pint.y + 4, dirA: -Math.PI / 2, kind: 'blunt', power: 0.6 });
  assert.equal(pint.state, 'off');
  assert.equal(pitcher.state, 'on', 'too far from the blow');
  world.events.emit('propHit', { prop: table, x: table.x, y: table.y, dirA: 0, kind: 'blast', power: 2 });
  assert.equal(live(clutter, table).length, 0);
  assert.ok(calls.floaters > 0, 'the napkin flutters down');
});

test('clutter: tipped over or falling apart, its prop throws everything still on it, and lets the set go', () => {
  const { world, clutter, table } = stub();
  clutter.attach(table, 'booth');
  world.events.emit('propFlipped', { prop: table, x: table.x, y: table.y, dirA: 0 });
  assert.equal(clutter.items(table).length, 0);
  const other = { ...table, body: { angle: 0 } };
  const items = clutter.attach(other, 'counter_till');
  world.events.emit('propDestroyed', { prop: other, x: other.x, y: other.y, dirA: 1, power: 1 });
  assert.ok(items.every((i) => i.state === 'off'));
  assert.equal(clutter.on.size, 0);
});

test('clutter: an ashtray with a cigarette in it smokes while it stands, not once knocked off', () => {
  const { world, clutter, table, calls } = stub();
  const [, , ash] = clutter.attach(table, 'counter_regular');
  assert.equal(ash.kind, 'ashtray_lit');
  clutter.update(1 / 60);
  assert.equal(calls.wisps, 1);
  world.events.emit('propHit', { prop: table, x: table.x + ash.x, y: table.y + ash.y + 3, dirA: -Math.PI / 2, kind: 'punch', power: 0.3 });
  assert.equal(ash.state, 'off');
  assert.ok(calls.dust > 0, 'a puff of ash');
  clutter.update(1 / 60);
  assert.equal(calls.wisps, 1);
  table.dead = true;
  clutter.update(1 / 60);
  assert.equal(clutter.on.size, 0, 'a dead prop is let go');
});

test('floor wear: the level lays its own grime where it says, and the paths worn by feet', () => {
  for (const [kind] of level1.grime) assert.ok(WEAR_KINDS.includes(kind), kind);
  const map = new TileMap(level1.tiles), plan = planWear(map, level1);
  for (const [kind, c0, r0, c1, r1] of level1.grime) {
    const mine = plan.marks.filter((m) => m.kind === kind && m.x >= c0 * TILE && m.x < (c1 + 1) * TILE && m.y >= r0 * TILE && m.y < (r1 + 1) * TILE);
    assert.ok(mine.length > 0, `${kind} in ${c0},${r0}-${c1},${r1}`);
  }
  assert.equal(plan.marks.filter((m) => m.kind === 'path').length, level1.worn.length);
});
