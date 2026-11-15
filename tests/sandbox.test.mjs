import { test } from 'node:test';
import assert from 'node:assert/strict';
import { load } from './setup.mjs';

const { LIQUIDS } = await load('game/data/liquids.js');
const { AMMO } = await load('game/data/weapons.js');
const { default: Sandbox, TOOLS } = await load('game/debug/Sandbox.js');

// keys / buttons pressed during one step
const input = (keys = [], { wheel = 0, middle = false } = {}) => ({
  hit: (code) => keys.includes(code), mouseHit: (b) => b === 1 && middle, wheel,
});
// a world reduced to what the tools and cheats touch
function stub(passive = false) {
  const blasts = [], sources = [], killed = [];
  const guard = () => ({ alive: true, passive, kill() { this.alive = false; killed.push(this); } });
  const world = {
    level: { passive },
    map: { solidAt: (x) => x < 0 },
    player: { x: 0, y: 0, alive: true, ammo: { '9mm': 0, '12g': 0, '762': 0, rocket: 0 }, weapon: { mag: 0 }, def: { mag: 12 } },
    enemies: [guard(), guard()],
    explode: (x, y, o) => blasts.push([x, y, o.radius]),
    liquids: { source: (x, y, o) => sources.push([x, y, o]) },
  };
  const sandbox = new Sandbox();
  sandbox.attach(world);
  return { world, sandbox, blasts, sources, killed };
}
const toolKey = (name) => `Digit${TOOLS.findIndex((t) => t.name === name) + 1}`;

test('sandbox: closed by default, open from the start in a passive test room, F1 toggles it', () => {
  const { sandbox } = stub();
  assert.equal(sandbox.on, false);
  sandbox.update(input(['KeyG']), { x: 0, y: 0 }, 0);
  assert.equal(sandbox.god, false, 'keys do nothing while the panel is closed');
  sandbox.update(input(['F1']), { x: 0, y: 0 }, 0);
  assert.equal(sandbox.on, true);
  const lab = stub(true);
  assert.ok(lab.sandbox.on && lab.sandbox.frozen);
});

test('sandbox: a digit picks a tool, the same digit or the wheel walks its variants', () => {
  const { sandbox } = stub(true);
  sandbox.update(input([toolKey('WEAPON')]), { x: 0, y: 0 }, 0);
  const first = sandbox.label();
  sandbox.update(input([toolKey('WEAPON')]), { x: 0, y: 0 }, 0);
  assert.notEqual(sandbox.label(), first);
  sandbox.update(input([], { wheel: -1 }), { x: 0, y: 0 }, 0);
  assert.equal(sandbox.label(), first);
  sandbox.update(input([], { wheel: -1 }), { x: 0, y: 0 }, 0);
  assert.ok(sandbox.label(), 'wraps around');
  for (const t of TOOLS) assert.ok(t.list.length > 0 && typeof t.place === 'function', t.name);
});

test('sandbox: tools drop at the cursor, never inside a wall unless they may', () => {
  const { sandbox, blasts, sources } = stub(true);
  sandbox.update(input([toolKey('WATER')]), { x: 0, y: 0 }, 0);
  sandbox.update(input(['KeyF']), { x: -5, y: 0 }, 1);
  assert.equal(sources.length, 0);
  assert.equal(sandbox.lines(1.5).at(-1)[0], 'NO ROOM THERE');
  sandbox.update(input([], { middle: true }), { x: 40, y: 50 }, 2);
  assert.deepEqual(sources[0].slice(0, 2), [40, 50]);
  assert.equal(sources[0][2].kind, LIQUIDS.hydrant.kind);
  sandbox.update(input([toolKey('BLAST')]), { x: 0, y: 0 }, 3);
  sandbox.update(input(['KeyF']), { x: -5, y: 0 }, 3);
  assert.equal(blasts.length, 1, 'a blast can go off in a wall');
});

test('sandbox: cheats (god mode survives a restart, freeze, time, ammo, kill all)', () => {
  const { world, sandbox, killed } = stub();
  sandbox.update(input(['F1']), { x: 0, y: 0 }, 0);
  sandbox.update(input(['KeyG', 'KeyT', 'KeyO', 'KeyU']), { x: 0, y: 0 }, 0);
  assert.equal(world.player.invulnerable, true);
  assert.ok(world.enemies.every((e) => e.passive));
  assert.ok(sandbox.timeScale < 1);
  assert.equal(world.player.ammo['12g'], AMMO['12g'].max);
  assert.equal(world.player.weapon.mag, 12);
  sandbox.update(input(['KeyT', 'KeyK']), { x: 0, y: 0 }, 0);
  assert.equal(killed.length, 2);
  const next = stub().world;
  sandbox.attach(next);
  assert.equal(next.player.invulnerable, true);
  assert.equal(sandbox.frozen, false, 'guards follow the new level');
});
