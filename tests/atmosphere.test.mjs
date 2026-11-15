import { test } from 'node:test';
import assert from 'node:assert/strict';
import { load } from './setup.mjs';

const { TILE } = await load('game/Config.js');
const { RAIN, HAZE, NEON } = await load('game/data/atmosphere.js');
const { default: EventBus } = await load('engine/EventBus.js');
const { default: TileMap } = await load('game/world/TileMap.js');
const { flicker, pickFaults } = await load('game/render/Flicker.js');
const { default: Weather, skyGrid } = await load('game/systems/Weather.js');
const { default: Haze } = await load('game/systems/Haze.js');
const { default: Papers } = await load('game/systems/Papers.js');

// a yard of asphalt and concrete with a small wood-floored room in it (walls '#')
const ROWS = [
  'XXXXXXXXXXXX',
  'X====______X',
  'X====______X',
  'X===#####__X',
  'X===#...#__X',
  'X===#...#__X',
  'X===#####__X',
  'X====______X',
  'XXXXXXXXXXXX',
];
const sample = (kind, seed, t0, t1, dt = 0.01) => {
  const out = [];
  for (let t = t0; t < t1; t += dt) out.push(flicker(kind, seed, t));
  return out;
};

test('flicker: a dying tube spends long stretches dark, strikes, and holds lit between', () => {
  const v = sample('dying', 2.7, 0, 30);
  const dark = v.filter((k) => k < 0.1).length / v.length, lit = v.filter((k) => k > 0.7).length / v.length;
  assert.ok(dark > 0.3 && dark < 0.7, `dark ${dark}`);
  assert.ok(lit > 0.25, `lit ${lit}`);
  assert.ok(v.every((k) => k >= 0 && k <= 1));
});

test('flicker: a stuttering tube is lit nearly all the time, with short bursts of cuts', () => {
  const v = sample('stutter', 1.3, 0, 60);
  const cut = v.filter((k) => k < NEON.stutter.low + 0.01).length / v.length;
  assert.ok(cut > 0.005 && cut < 0.12, `cut ${cut}`);
  assert.ok(v.filter((k) => k > 0.8).length / v.length > 0.85);
});

test('flicker: faults go to the given number of props of the given types, the same ones every time', () => {
  const props = [];
  for (let i = 0; i < 6; i++) props.push({ type: 'tube_light', x: 40 + i * 70, y: 90 + i * 13 });
  for (let i = 0; i < 4; i++) props.push({ type: 'neon_tube_pink', x: 300 + i * 50, y: 20 });
  props.push({ type: 'wall_lamp', x: 10, y: 10 });
  const faults = [{ kind: 'dying', count: 1, types: ['tube_light'] }, { kind: 'stutter', count: 2, types: ['tube_light', 'neon_tube_pink'] }];
  const a = pickFaults(props, faults), b = pickFaults(props.slice().reverse(), faults);
  assert.equal([...a.values()].filter((k) => k === 'dying').length, 1);
  assert.equal([...a.values()].filter((k) => k === 'stutter').length, 2);
  assert.ok(![...a.keys()].some((p) => p.type === 'wall_lamp'));
  assert.deepEqual([...a].map(([p, k]) => [p.x, p.y, k]).sort(), [...b].map(([p, k]) => [p.x, p.y, k]).sort(), 'order of the props does not matter');
  assert.ok(pickFaults(props).size <= NEON.faults.reduce((s, f) => s + f.count, 0));
});

test('weather: the sky is over the open floors and the outer walls, never over a room or its walls', () => {
  const map = new TileMap(ROWS), sky = skyGrid(map);
  const at = (x, y) => sky[y * map.w + x];
  assert.equal(at(2, 2), 1, 'asphalt');
  assert.equal(at(9, 1), 1, 'concrete');
  assert.equal(at(6, 4), 0, 'the room');
  assert.equal(at(4, 4), 0, 'a wall of the room');
  assert.equal(at(0, 0), 1, 'an outer wall');
});

test('weather: no rain, nothing laid; rain, puddles in the open only, in the same places every time', () => {
  const world = () => ({ map: new TileMap(ROWS), events: new EventBus(), props: [], chars: [], particles: { drops() {} } });
  assert.equal(new Weather(world(), { name: 'x' }).k, 0);
  assert.equal(new Weather(world(), { name: 'x' }).puddles.length, 0);
  const level = { name: 'yard', soundscape: { rain: 0.4 } };
  const cfg = { ...RAIN, falls: true, puddles: { ...RAIN.puddles, per: 12, gap: 20 } };
  const a = new Weather(world(), level, cfg), b = new Weather(world(), level, cfg);
  assert.ok(a.k > 0 && a.k <= 1);
  assert.ok(a.puddles.length >= 2, `${a.puddles.length} puddles`);
  assert.deepEqual(a.puddles.map((p) => [p.x, p.y, p.r]), b.puddles.map((p) => [p.x, p.y, p.r]));
  for (const p of a.puddles) assert.ok(a.open(p.x, p.y), 'under the sky');
  a.update();
  assert.ok(a.drips.length > 0);
  for (const d of a.drips) assert.ok(a.open(d.x, d.y), 'drips fall in the open');
  assert.ok(!a.open(6.5 * TILE, 4.5 * TILE), 'no rain in the room');
  const dry = new Weather(world(), level, { ...cfg, falls: false });
  dry.update();
  assert.equal(dry.drips.length, 0, 'nothing falls when the rain is off');
  assert.ok(dry.puddles.length > 0, 'the puddles of an earlier rain are still there');
});

// a bar in a zone of the soundscape, its power, a player, chars that can be moved about
function bar() {
  const events = new EventBus();
  const player = { alive: true, x: 3 * TILE, y: 3 * TILE, body: Matter.Bodies.circle(3 * TILE, 3 * TILE, 8) };
  const world = {
    time: 0, events, chars: [player], player, projectiles: [],
    power: { on: true, inside: () => true },
  };
  const haze = new Haze(world, { name: 'bar', soundscape: { zones: [['bar', 0, 0, 7, 5], ['street', 8, 0, 12, 5]] } });
  return { world, haze, player, run(s) { for (let i = 0; i < s * 60; i++) { world.time += 1 / 60; haze.update(1 / 60); } } };
}

test('haze: a smoky place fills with drifting puffs; the power cut thins it, shots thicken it', () => {
  const s = bar(), z = s.haze.zones[0];
  assert.equal(s.haze.zones.length, 1, 'only the places with a density');
  assert.equal(z.k, HAZE.zones.bar);
  assert.ok(z.puffs.length >= 2);
  s.world.events.emit('shot', { shooter: { x: 2 * TILE, y: 2 * TILE } });
  s.world.events.emit('shot', { shooter: { x: 2 * TILE, y: 2 * TILE } });
  s.run(4);
  assert.ok(z.k > HAZE.zones.bar, 'gun smoke');
  assert.ok(z.extra.length > 0, 'a puff at the muzzle');
  s.world.power.on = false;
  s.run(20);
  assert.ok(z.k < HAZE.zones.bar * (HAZE.dark + 0.2), `thinned to ${z.k}`);
  for (const p of z.puffs) assert.ok(p.x >= z.x0 && p.x <= z.x1 && p.y >= z.y0 && p.y <= z.y1, 'puffs stay in the room');
});

test('haze: someone running through it pushes the puffs on his way', () => {
  const s = bar(), z = s.haze.zones[0];
  const p = z.puffs[0];
  s.player.x = p.x - 20; s.player.y = p.y;
  Matter.Body.setPosition(s.player.body, { x: s.player.x, y: s.player.y });
  Matter.Body.setVelocity(s.player.body, { x: 4, y: 0 });
  const x0 = p.x;
  for (let i = 0; i < 10; i++) { s.world.time += 1 / 60; s.haze.update(1 / 60); }
  assert.ok(p.x - x0 > 1.5, `pushed ${p.x - x0} px`);
});

test('papers: soaked by the rain they are heavier and drawn darker', () => {
  const world = { map: new TileMap(ROWS), events: new EventBus(), props: [], player: {}, enemies: [], civilians: [] };
  const dry = new Papers(world, [[1, 1, 3, 2, 20]]), wet = new Papers(world, [[1, 1, 3, 2, 20]], undefined, 0.8);
  const mean = (p) => p.list.reduce((s, q) => s + q.light, 0) / p.list.length;
  assert.ok(mean(wet) < mean(dry) * (1 - 0.8 * RAIN.papers.lift * 0.5));
  assert.ok(wet.list.every((q) => q.wet) && !dry.list.some((q) => q.wet));
  assert.ok(wet.friction > dry.friction);
});
