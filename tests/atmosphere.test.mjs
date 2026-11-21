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

test('weather: dry, nothing laid; wet, puddles in the open only, in the same places every time', () => {
  const world = () => ({ map: new TileMap(ROWS), events: new EventBus(), props: [], chars: [] });
  assert.equal(new Weather(world(), { name: 'x' }).k, 0);
  assert.equal(new Weather(world(), { name: 'x' }).puddles.length, 0);
  const level = { name: 'yard', soundscape: { rain: 0.4 } };
  const cfg = { ...RAIN, puddles: { ...RAIN.puddles, per: 12, gap: 20 } };
  const a = new Weather(world(), level, cfg), b = new Weather(world(), level, cfg);
  assert.ok(a.k > 0 && a.k <= 1);
  assert.ok(a.puddles.length >= 2, `${a.puddles.length} puddles`);
  assert.deepEqual(a.puddles.map((p) => [p.x, p.y, p.r]), b.puddles.map((p) => [p.x, p.y, p.r]));
  for (const p of a.puddles) assert.ok(a.open(p.x, p.y), 'under the sky');
  assert.ok(!a.open(6.5 * TILE, 4.5 * TILE), 'no sky over the room');
  // no rain falls (the user): nothing of it is left to draw or to switch back on
  assert.deepEqual(Object.keys(RAIN).sort(), ['headlight', 'look', 'mist', 'papers', 'puddles', 'wet']);
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

test('smoke: the haze a level hangs under a lamp thickens the resting layer there only, and hides nothing', () => {
  const s = bar();
  const level = { name: 'bar', soundscape: { zones: [['bar', 4, 3, 6, 5]] }, haze: [[5.5, 4.5, 1.2, 0.1]] };
  const hazy = new Smoke(s.world, level);
  const at = (sm, c, r) => sm.fluid.densityAt((c + 0.5) * TILE, (r + 0.5) * TILE);
  assert.ok(at(hazy, 5, 4) > at(s.smoke, 5, 4) + 0.05, 'thicker under the lamp');
  assert.equal(at(hazy, 9, 4), 0, 'nothing outside');
  assert.ok(!hazy.blocks(4.2 * TILE, 4.5 * TILE, 6.8 * TILE, 4.5 * TILE), 'the guards see through it');
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

// the mass of a kind in the room (cols 4-6, rows 3-5) and in the yard east of its door (cols 8-10)
const mass = (s, kind, c0, c1, r0 = 1, r1 = 7) => {
  const F = s.smoke.fluid, d = F.kinds[s.smoke.kind[kind]].d, n = TILE / F.fcell;
  let m = 0;
  for (let gy = r0 * n; gy < (r1 + 1) * n; gy++) for (let gx = c0 * n; gx < (c1 + 1) * n; gx++) m += d[gy * F.W + gx];
  return m;
};
const across = (s) => s.smoke.blocks(4.05 * TILE, 4.3 * TILE, 6.95 * TILE, 4.3 * TILE);

test('smoke: the shot puffs out of the ejection port too, smaller, to the right of the gun', () => {
  const s = bar({ ...SMOKE, rest: { ...SMOKE.rest, zones: {} } });
  const port = { x: 5 * TILE, y: 4.5 * TILE };
  const shooter = { x: 4.6 * TILE, y: 4.5 * TILE, angle: 0, muzzlePos: () => ({ x: 5.4 * TILE, y: 4.5 * TILE, a: 0 }), portPos: () => port };
  s.world.events.emit('shot', { shooter, weapon: { sound: 'pistol', eject: 12, casing: 'casing' } });
  const F = s.smoke.fluid, right = F.densityAt(port.x, port.y + 4), left = F.densityAt(port.x, port.y - 8);
  assert.ok(right > 0.1 && right > left * 2, `at the port ${right}, on its left ${left}`);
  assert.ok(right < F.densityAt(5.4 * TILE + SMOKE.muzzle.ahead, 4.5 * TILE), 'less than out of the muzzle');
  s.run(0.3);
  assert.ok(F.velocityAt(port.x, port.y + 8, {}).y > 1, 'thrown to the right with the case');
  const t = bar({ ...SMOKE, rest: { ...SMOKE.rest, zones: {} } });
  t.world.events.emit('shot', { shooter, weapon: { sound: 'pistol' } });
  assert.ok(t.smoke.fluid.densityAt(port.x, port.y + 4) < right * 0.5, 'no case, no port puff');
});

test('smoke: an extinguisher fills the room with a white cloud guards cannot see through, gone in some 20 s', () => {
  const s = bar({ ...SMOKE, rest: { ...SMOKE.rest, zones: {} } });
  const sounds = [];
  s.world.sound = (name) => sounds.push(name);
  assert.ok(!across(s));
  s.world.events.emit('propDestroyed', { prop: { def: {}, x: 5.5 * TILE, y: 3.1 * TILE, body: { angle: 0 } } });
  assert.equal(s.smoke.jets.length, 0, 'any other prop');
  s.world.events.emit('propDestroyed', { prop: { def: { cloud: true }, x: 5.5 * TILE, y: 3.1 * TILE, body: { angle: 0 } } }); // on the north wall
  s.run(SMOKE.jets.powder.dur + 0.1);
  assert.ok(sounds.includes('hiss') && !s.smoke.jets.length);
  const F = s.smoke.fluid, d = F.kinds[s.smoke.kind.powder].d;
  let m = 0, my = 0;
  for (let j = 0; j < d.length; j++) { m += d[j]; my += d[j] * (Math.floor(j / F.W) + 0.5) * F.fcell; }
  assert.ok(my / m > 3.1 * TILE + 20, `thrown off its wall into the room: its heart ${(my / m / TILE).toFixed(2)} tiles down`);
  assert.ok(across(s), 'across the room');
  s.run(3);
  assert.ok(across(s), 'it hangs');
  assert.ok(!s.smoke.blocks(9 * TILE, 1.5 * TILE, 9 * TILE, 7.5 * TILE), 'not out in the yard');
  s.run(20);
  assert.ok(!across(s), 'cleared');
  // gunfire never hides anyone, however much of it
  const g = bar();
  for (let i = 0; i < 8; i++) g.world.events.emit('shot', { shooter: { x: 4.2 * TILE, y: 4.3 * TILE, angle: 0 }, weapon: { sound: 'shotgun' } });
  g.run(0.3);
  assert.ok(g.smoke.fluid.peak > 1 && !across(g));
});

test('smoke: steam is gone in a few s where smoke hangs on', () => {
  const s = bar({ ...SMOKE, rest: { ...SMOKE.rest, zones: {} } });
  const F = s.smoke.fluid, K = s.smoke.kind;
  F.addDensity(5.5 * TILE, 4.5 * TILE, 20, 1, K.steam);
  F.addDensity(5.5 * TILE, 4.5 * TILE, 20, 1, K.smoke);
  const st0 = mass(s, 'steam', 4, 6), sm0 = mass(s, 'smoke', 4, 6);
  s.run(3);
  const st = mass(s, 'steam', 4, 6) / st0, sm = mass(s, 'smoke', 4, 6) / sm0;
  assert.ok(st < 0.3 && sm > 0.7, `steam ${st}, smoke ${sm}`);
  // out in the yard, faster still
  F.addDensity(9.5 * TILE, 4.5 * TILE, 20, 1, K.steam);
  const y0 = mass(s, 'steam', 8, 10);
  s.run(3);
  assert.ok(mass(s, 'steam', 8, 10) / y0 < st, 'the open air takes it sooner');
});

test('smoke: a blast leaves black soot that hangs for most of a minute, and drifts out of an open door', () => {
  const shut = bar({ ...SMOKE, rest: { ...SMOKE.rest, zones: {} } });
  shut.world.events.emit('explosion', { x: 5.5 * TILE, y: 4.5 * TILE, radius: 80 });
  const m0 = mass(shut, 'soot', 4, 6);
  assert.ok(shut.smoke.fluid.densityAt(5.5 * TILE, 4.5 * TILE, shut.smoke.kind.soot) > 0.8, 'opaque at its heart');
  shut.run(45);
  const m45 = mass(shut, 'soot', 4, 6);
  assert.ok(m45 > m0 * 0.25, `still ${(m45 / m0).toFixed(2)} of it after 45 s`);
  assert.ok(mass(shut, 'soot', 4, 6) / 9 / ((TILE / 8) ** 2) > 0.1, 'still seen');
  shut.run(45);
  assert.ok(mass(shut, 'soot', 4, 6) < m0 * 0.25, 'thinning');
  const open = bar({ ...SMOKE, rest: { ...SMOKE.rest, zones: {} } });
  open.door.body.angle = open.door.a0 + 1.2;
  open.world.events.emit('explosion', { x: 5.5 * TILE, y: 4.5 * TILE, radius: 80 });
  open.run(20);
  assert.ok(mass(open, 'soot', 8, 10) > 0.5, 'out into the yard');
  open.run(25);
  assert.ok(mass(open, 'soot', 4, 6) < m45 * 0.8, 'the room clears sooner with its door open');
});

test('smoke: what burns gives off soot for as long as it burns; nothing is laid where the air is not stepped', () => {
  const s = bar({ ...SMOKE, rest: { ...SMOKE.rest, zones: {} } });
  for (let i = 0; i < 60 * 5; i++) { s.smoke.burn(5.5 * TILE, 4.5 * TILE, 'car', 1 / 60); s.world.time += 1 / 60; s.smoke.update(1 / 60); }
  const near = s.smoke.fluid.densityAt(5.5 * TILE, 4.5 * TILE, s.smoke.kind.soot);
  assert.ok(near > 0.3 && near <= SMOKE.burn.cap + 0.05, `soot over it: ${near}`);
  s.smoke.fluid.setRegion(0, 0, 3 * TILE, 3 * TILE);
  const before = mass(s, 'soot', 8, 10);
  s.smoke.burn(9.5 * TILE, 4.5 * TILE, 'wreck', 1);
  assert.equal(mass(s, 'soot', 8, 10), before);
});

test('papers: soaked by the rain they are heavier and drawn darker', () => {
  const world = { map: new TileMap(ROWS), events: new EventBus(), props: [], player: {}, enemies: [], civilians: [] };
  const dry = new Papers(world, [[1, 1, 3, 2, 20]]), wet = new Papers(world, [[1, 1, 3, 2, 20]], undefined, 0.8);
  const mean = (p) => p.list.reduce((s, q) => s + q.light, 0) / p.list.length;
  assert.ok(mean(wet) < mean(dry) * (1 - 0.8 * RAIN.papers.lift * 0.5));
  assert.ok(wet.list.every((q) => q.wet) && !dry.list.some((q) => q.wet));
  assert.ok(wet.friction > dry.friction);
});

test('smoke: soot builds up in a shut room on fire and the view closes in, in flat rings; outdoors it does not', async () => {
  const { murkView } = await load('game/render/Murk.js');
  const s = bar();
  s.door.body.angle = s.door.a0; // shut
  const x = 5.5 * TILE, y = 4.5 * TILE, seen = [];
  assert.equal(s.smoke.murk(x, y), 0, 'clear to start with');
  for (let k = 0; k < 6; k++) {
    for (let i = 0; i < 300; i++) {
      s.world.time += 1 / 60;
      // the room burning: a fire every half tile of it
      for (let fy = 3.25; fy < 6; fy += 0.5) for (let fx = 4.25; fx < 7; fx += 0.5) s.smoke.burn(fx * TILE, fy * TILE, 'fire', 1 / 60, 0.28);
      s.smoke.update(1 / 60);
    }
    seen.push(s.smoke.murk(x, y));
  }
  assert.ok(seen.every((v, i) => i === 0 || v >= seen[i - 1] - 0.02), `it thickens: ${seen.map((v) => v.toFixed(2))}`);
  assert.ok(seen[5] > 0.5, `half a minute of fire in a shut room: ${seen[5].toFixed(2)}`);
  assert.ok(s.smoke.murk(9.5 * TILE, 7.5 * TILE) < 0.05, 'the yard stays clear');
  // what is seen of it: the radius seen plainly shrinks as it thickens, never under `near`; rings darker outward
  const M = SMOKE.murk, views = seen.map((v) => murkView(v));
  assert.deepEqual(murkView(0), { clear: Infinity, rings: [] });
  assert.ok(views.every((v, i) => i === 0 || v.clear <= views[i - 1].clear + 1e-9), 'the view closes in');
  assert.ok(views[5].clear < M.far - 0.2 && murkView(1).clear >= M.near - 1e-9, 'down to a room\'s width, no less');
  const rings = murkView(1).rings;
  assert.equal(rings.length, M.steps);
  assert.ok(rings.every((r, i) => i === 0 || (r.r > rings[i - 1].r && r.a > rings[i - 1].a)), 'flat steps, the further the darker');
  assert.ok(rings.at(-1).a <= M.max + 1e-9 && M.max < 0.7, 'never black: what is in it still reads');
});
