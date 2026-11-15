import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// engine/Assets.js needs a DOM to load: its density rules are read from the source and tried on names
const src = readFileSync(fileURLToPath(new URL('../src/engine/Assets.js', import.meta.url)), 'utf8');
const FINE = new RegExp(src.match(/const FINE = \/(.*)\/;/)[1]);
const list = (name, re) => JSON.parse(src.match(re)[1].replace(/'/g, '"').replace(/,\s*\]/, ']'));
const FINE_PROPS = new Set(list('FINE_PROPS', /const FINE_PROPS = new Set\((\[[^\]]*\])\)/));
const FLOOR_TILES = list('FLOOR_TILES', /const FLOOR_TILES = (\[[^\]]*\]);/);

// width / height of a sprite's PNG (IHDR)
function png(name) {
  const b = readFileSync(new URL(`../assets/sprites/${name}.png`, import.meta.url));
  return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
}

test('assets: of the people only the standing characters are finer than the world, never a part of a body', () => {
  for (const n of ['characters/thug_torso', 'characters/player_torso', 'characters/civ3_torso', 'characters/dancer1_torso', 'characters/boss_head',
    'weapons/pistol', 'weapons/tire_iron']) assert.ok(FINE.test(n), n);
  for (const n of ['characters/thug_rag_torso', 'characters/thug_rag_torso_up', 'characters/brute_gib_torso', 'characters/thug_rag_head', 'characters/thug_down',
    'characters/boss_dead0', 'weapons/rocket']) assert.ok(!FINE.test(n), n);
});

test('assets: the furniture, the vehicles and the floors are painted at twice the world density, the light and the walls are not', () => {
  for (const n of ['desk', 'bar_counter', 'sofa', 'car', 'van', 'car_tire', 'dumpster', 'apt_door']) assert.ok(FINE_PROPS.has(n), n);
  for (const n of ['wall_lamp', 'tube_light', 'ceiling_lamp', 'neon_sign_bar', 'neon_sign_liquor']) assert.ok(!FINE_PROPS.has(n), n);
  for (const n of FINE_PROPS) {
    const { w, h } = png('props/' + n);
    assert.ok(w % 2 === 0 && h % 2 === 0, `props/${n} is ${w}x${h}`);
  }
  for (const t of FLOOR_TILES) for (const s of ['', '_v1', '_v2']) assert.deepEqual(png(`tiles/${t}${s}`), { w: 64, h: 64 }, t + s);
  for (const t of ['wall', 'brick', 'roof']) assert.deepEqual(png('tiles/' + t), { w: 32, h: 32 }, t);
});

test('assets: every look a level gives a guard, and every civilian look, has its sprites and its colours', async () => {
  const { load } = await import('./setup.mjs');
  const { KINDS } = await load('game/entities/Character.js');
  const { CIVILIAN_LOOKS } = await load('game/entities/Civilian.js');
  const { default: level1 } = await load('game/data/levels/level1.js');
  assert.equal(level1.looks['28,9'], 'boss', 'the boss is his own man');
  assert.equal(level1.jobs['28,9'], 'boss');
  for (const kind of [...Object.values(level1.looks), ...Object.keys(CIVILIAN_LOOKS)]) {
    assert.ok(KINDS[kind] || CIVILIAN_LOOKS[kind], kind);
    for (const part of ['torso', 'head', 'dead0', 'rag_torso', 'gib_head']) assert.ok(png(`characters/${kind}_${part}`).w > 0, `${kind}_${part}`);
  }
  // the customers of the bar are each his own man
  const patrons = level1.ambient.patrons.map((p) => p[0]).filter((k) => k !== 'tramp');
  assert.equal(new Set(patrons).size, patrons.length);
});
