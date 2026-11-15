import { test } from 'node:test';
import assert from 'node:assert/strict';
import { load } from './setup.mjs';

const { TILE } = await load('game/Config.js');
const { RAIN, SMOKE, NEON } = await load('game/data/atmosphere.js');
const { default: EventBus } = await load('engine/EventBus.js');
const { default: TileMap } = await load('game/world/TileMap.js');
const { flicker, pickFaults } = await load('game/render/Flicker.js');
const { default: Weather, skyGrid } = await load('game/systems/Weather.js');
const { default: Smoke } = await load('game/systems/Smoke.js');
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

// a small bar (wood floor, a zone of the soundscape) with a door onto a yard, its power, a player standing outside
const BAR = [
  'XXXXXXXXXXXX',
  'X__________X',
  'X__#####___X',
  'X__#...#___X',
  'X__#...D___X',
  'X__#...#___X',
  'X__#####___X',
  'X__________X',
  'XXXXXXXXXXXX',
];
function bar(cfg = SMOKE) {
  const map = new TileMap(BAR), events = new EventBus();
  const player = { alive: true, x: 9.5 * TILE, y: 7.5 * TILE, body: Matter.Bodies.circle(9.5 * TILE, 7.5 * TILE, 8) };
  const door = { cells: [4 * map.w + 7], a0: Math.PI / 2, locked: false, body: { angle: Math.PI / 2 } };
  const world = {
    map, events, time: 0, chars: [player], player, projectiles: [], props: [], doors: [door], windows: [],
    power: { on: true },
  };
  const smoke = new Smoke(world, { name: 'bar', soundscape: { zones: [['bar', 4, 3, 6, 5]] } }, cfg);
  const at = (c, r) => smoke.fluid.densityAt((c + 0.5) * TILE, (r + 0.5) * TILE);
  return { world, smoke, door, player, at, run(s) { for (let i = 0; i < s * 60; i++) { world.time += 1 / 60; smoke.update(1 / 60); } } };
}

test('smoke: a smoky place keeps a faint patchy layer at rest, the yard none; the power cut thins it', () => {
  const s = bar();
  s.run(2);
  const inside = [s.at(4, 3), s.at(5, 4), s.at(6, 5)], top = SMOKE.rest.zones.bar * (1 + SMOKE.rest.patchy);
  assert.ok(inside.some((v) => v > 0.01), `a layer: ${inside}`);
  assert.ok(inside.every((v) => v <= top), `faint: ${inside}`);
  assert.equal(s.at(9, 4), 0, 'nothing in the yard');
  const before = s.at(5, 4);
  s.world.power.on = false;
  s.run(30);
  assert.ok(s.at(5, 4) < before * (SMOKE.rest.dark + 0.15), `thinned to ${s.at(5, 4)} from ${before}`);
});

test('smoke: a shot leaves a puff ahead of the muzzle that hangs, then clears back to the layer in 10-30 s', () => {
  const s = bar();
  s.run(1);
  const rest = s.at(5, 4);
  s.world.events.emit('shot', { shooter: { x: 4.2 * TILE, y: 4.5 * TILE, angle: 0 }, weapon: { sound: 'shotgun' } });
  s.run(0.5);
  const puff = s.at(5, 4);
  assert.ok(puff > rest + 0.2, `a puff: ${puff} over ${rest}`);
  s.run(5);
  assert.ok(s.at(5, 4) > rest + 0.05, 'still there after 5 s');
  s.run(30);
  assert.ok(s.at(5, 4) < rest + 0.03, `cleared to ${s.at(5, 4)} (rest ${rest})`);
});

test('smoke: a shut door keeps it in; open, the room is drawn out into the yard', () => {
  const s = bar();
  const fire = () => { for (let i = 0; i < 4; i++) s.world.events.emit('shot', { shooter: { x: 5 * TILE, y: 4.5 * TILE, angle: 0 }, weapon: { sound: 'shotgun' } }); };
  fire();
  s.run(4);
  assert.equal(s.at(7, 4), 0, 'nothing in the doorway');
  assert.equal(s.at(8, 4), 0, 'nothing out of the shut door');
  s.door.body.angle = s.door.a0 + 1.2; // swung open
  fire();
  s.run(4);
  assert.ok(s.at(8, 4) > 0.02, `out through the door: ${s.at(8, 4)}`);
  assert.ok(s.smoke.fluid.velocityAt(7.5 * TILE, 4.5 * TILE, {}).x > 1, 'a draft out of the room');
});

test('smoke: people walking and a ceiling fan stir the air', () => {
  const s = bar();
  Matter.Body.setPosition(s.player.body, { x: 9.5 * TILE, y: 4.5 * TILE });
  s.player.x = 9.5 * TILE; s.player.y = 4.5 * TILE;
  Matter.Body.setVelocity(s.player.body, { x: 0, y: 2 }); // 120 px/s down the yard
  s.run(0.25);
  assert.ok(s.smoke.fluid.velocityAt(s.player.x, s.player.y, {}).y > 15, 'dragged along');
  const fan = { x: 5.5 * TILE, y: 4.5 * TILE, def: { spin: 5.5 }, dead: false, spun: () => 5.5 * s.world.time };
  s.world.props.push(fan);
  s.run(3);
  const F = s.smoke.fluid, a = F.velocityAt(fan.x + 24, fan.y, {}), b = F.velocityAt(fan.x - 24, fan.y, {});
  assert.ok(a.y * b.y < 0 && Math.abs(a.y) > 2, `turning: ${a.y} / ${b.y}`);
});

test('smoke: a smoker lets out a thread that rides the air and leaves its smoke in the layer', () => {
  const s = bar({ ...SMOKE, rest: { ...SMOKE.rest, zones: {} } });
  const guard = { alive: true, pastime: 'smoke', seed: 0.3, angle: 0, x: 5.5 * TILE, y: 4.5 * TILE, body: Matter.Bodies.circle(5.5 * TILE, 4.5 * TILE, 8) };
  s.world.chars.push(guard);
  s.run(3);
  assert.ok(s.smoke.rib.n > 20, `${s.smoke.rib.n} points of thread`);
  let sum = 0;
  for (const v of s.smoke.fluid.d) sum += v;
  assert.ok(sum > 0.05, `left in the layer: ${sum}`);
  guard.pastime = null;
  s.run(4);
  assert.equal(s.smoke.rib.n, 0, 'the thread is gone once he stops');
});

test('papers: soaked by the rain they are heavier and drawn darker', () => {
  const world = { map: new TileMap(ROWS), events: new EventBus(), props: [], player: {}, enemies: [], civilians: [] };
  const dry = new Papers(world, [[1, 1, 3, 2, 20]]), wet = new Papers(world, [[1, 1, 3, 2, 20]], undefined, 0.8);
  const mean = (p) => p.list.reduce((s, q) => s + q.light, 0) / p.list.length;
  assert.ok(mean(wet) < mean(dry) * (1 - 0.8 * RAIN.papers.lift * 0.5));
  assert.ok(wet.list.every((q) => q.wet) && !dry.list.some((q) => q.wet));
  assert.ok(wet.friction > dry.friction);
});
