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

test('assets: the furniture, the lamps, the vehicles and the floors are painted at twice the world density, the neon and the walls are not', () => {
  for (const n of ['desk', 'bar_counter', 'sofa', 'car', 'van', 'car_tire', 'dumpster', 'apt_door', 'wall_lamp', 'tube_light', 'ceiling_lamp']) assert.ok(FINE_PROPS.has(n), n);
  for (const n of ['neon_tube_pink', 'neon_tube_cyan', 'string_lights', 'neon_sign_bar', 'neon_sign_liquor']) assert.ok(!FINE_PROPS.has(n), n);
  for (const n of FINE_PROPS) {
    const { w, h } = png('props/' + n);
    assert.ok(w % 2 === 0 && h % 2 === 0, `props/${n} is ${w}x${h}`);
  }
  for (const t of FLOOR_TILES) for (const s of ['', '_v1', '_v2']) assert.deepEqual(png(`tiles/${t}${s}`), { w: 64, h: 64 }, t + s);
  for (const t of ['wall', 'brick', 'roof']) assert.deepEqual(png('tiles/' + t), { w: 32, h: 32 }, t);
  // the plant on the roofs is fine too (an AC unit is 46 x 32 world px), the lit pieces are not
  const ROOF_FINE = new Set(list('ROOF_FINE', /const ROOF_FINE = new Set\((\[[^\]]*\])\)/));
  assert.ok(ROOF_FINE.has('ac_unit') && !ROOF_FINE.has('skylight') && !ROOF_FINE.has('bulkhead'));
  assert.deepEqual(png('roof/ac_unit'), { w: 92, h: 64 });
  assert.deepEqual(png('roof/skylight'), { w: 46, h: 30 });
});

test('assets: every look a level gives a guard, and every civilian look, has its sprites and its colours', async () => {
  const { load } = await import('./setup.mjs');
  const { KINDS } = await load('game/entities/Character.js');
  const { CIVILIAN_LOOKS } = await load('game/entities/Civilian.js');
  const { default: level1 } = await load('game/data/levels/level1.js');
  assert.equal(level1.looks['28,9'], 'cueball', 'the boss is his own man: CUEBALL');
  assert.equal(level1.jobs['28,9'], 'cueball');
  assert.deepEqual(png('characters/cueball_torso'), { w: 48, h: 48 }, 'the widest shoulders in the game');
  assert.deepEqual(png('characters/cueball_head_hurt'), png('characters/cueball_head'));
  assert.ok(FINE.test('characters/cueball_head_hurt'));
  for (const kind of [...Object.values(level1.looks), ...Object.keys(CIVILIAN_LOOKS)]) {
    assert.ok(KINDS[kind] || CIVILIAN_LOOKS[kind], kind);
    for (const part of ['torso', 'head', 'dead0', 'rag_torso', 'gib_head']) assert.ok(png(`characters/${kind}_${part}`).w > 0, `${kind}_${part}`);
  }
  // the customers of the bar are each his own man
  const patrons = level1.ambient.patrons.map((p) => p[0]).filter((k) => k !== 'tramp');
  assert.equal(new Set(patrons).size, patrons.length);
});

test('assets: the street fauna is painted at the people\'s density, every frame it is drawn with on disk', () => {
  assert.match(src, /name\.startsWith\('critters\/'\)/);
  for (const n of ['pigeon_idle', 'pigeon_fly1', 'pigeon_dead', 'rat_run2', 'rat_dead', 'cat_sit', 'cat_run0', 'cat_walk3', 'cat_low', 'cat_dead']) {
    const { w, h } = png('critters/' + n);
    assert.ok(w % 2 === 0 && h % 2 === 0, `critters/${n} is ${w}x${h}`);
  }
  assert.deepEqual(png('critters/cat_run0'), { w: 66, h: 30 });
});
