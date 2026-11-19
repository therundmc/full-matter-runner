// Level 2A's street (tools/build_level2a.py): its two lanes clear, its parking on one side or the other, its
// junctions under traffic lights, every piece of it with its sprite; the lamps that take turns (systems/Signals.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { load } from './setup.mjs';

const { PROPS } = await load('game/data/props.js');
const { SIGNALS } = await load('game/data/signals.js');
const { default: Signals, litAt } = await load('game/systems/Signals.js');
const { VEHICLES } = await load('game/entities/Vehicle.js');
const { default: TileMap } = await load('game/world/TileMap.js');
const { default: level2a } = await load('game/data/levels/level2a.js');
const { default: lab } = await load('game/data/levels/lab.js');
const { default: level1 } = await load('game/data/levels/level1.js');

const C = level2a.chase;
const WORKS = [203, 231]; // the gas works' columns (tools/build_level2a.py)
const assets = readFileSync(fileURLToPath(new URL('../src/engine/Assets.js', import.meta.url)), 'utf8');
const png = (name) => existsSync(fileURLToPath(new URL(`../assets/sprites/props/${name}.png`, import.meta.url)));
// half of a thing's hitbox across the street (rows), turned as it stands
function halfAcross(type, deg) {
  const d = PROPS[type], v = VEHICLES[type];
  const [w, h] = v ? [v.w ?? 136, v.h ?? 54] : d.r ? [d.r * 2, d.r * 2] : [d.w, d.h];
  return (Math.round(deg) % 180 === 90 ? w : h) / 64;
}

test('road: every prop and every piece of floor paint of the street is a known sprite, loaded by the game', () => {
  const kinds = new Set([...level2a.props, ...lab.props, ...level1.props].map(([t]) => t)); // (level 1's street: tests/street1.test.mjs)
  for (const k of kinds) {
    assert.ok(PROPS[k] || VEHICLES[k], `${k} is a prop`);
    assert.ok(png(PROPS[k]?.sprite ? 'trash_can' : k) && (PROPS[k]?.sprite || assets.includes(`'${k}'`)), `${k}: its sprite, listed in engine/Assets.js (unlisted, it is drawn as a bin)`);
  }
  for (const [name] of [...level2a.floor, ...level1.floor]) assert.ok(png(name) && assets.includes(`'${name}'`), `${name}: painted on the floor, listed`);
  for (const k of ['traffic_light', 'bus_shelter', 'arrow_board', 'barricade']) assert.ok(png(k + '_glow'), `${k}: its emissive map`);
});

test('road: nothing stands in the two lanes, from one end to the other', () => {
  const map = new TileMap(level2a.tiles), [n, s] = C.lanes, top = n - 1.25, bottom = s + 1.25;
  assert.equal(top, 11);
  assert.equal(bottom, 16);
  const across = (c) => C.across.some(([a, b]) => c >= a && c <= b);
  for (const [t, c, r, deg = 0] of level2a.props) {
    const d = PROPS[t];
    if (d?.hung || (across(c) && (r < 8 || r > 18))) continue;
    const half = halfAcross(t, deg);
    assert.ok(r + half <= top + 0.01 || r - half >= bottom - 0.01, `${t} at ${c}, ${r} reaches into a lane`);
  }
  // and the lanes are road all the way
  for (let x = 0; x < map.w; x++) for (let y = top; y < bottom; y++) assert.ok('=-'.includes(map.at(x, y)), `col ${x} row ${y}`);
  // what is loose (a car's nudge sends it rolling) keeps half a metre off them
  for (const [t, c, r] of level2a.props) {
    const d = PROPS[t];
    if (!d || d.static || d.hung || !d.kg || d.kg > 40 || r < 8 || r > 18) continue;
    assert.ok(r < top - 0.1 || r > bottom + 0.3, `${t} at ${c}, ${r} stands by the lane`);
  }
});

test('road: cars are parked on the north side, on ours, or on neither, by section', () => {
  const cars = level2a.props.filter(([t, c, r, deg, o]) => VEHICLES[t] && o?.lights === false && r > 8 && r < 18);
  const north = cars.filter(([, , r]) => r < 11), south = cars.filter(([, , r]) => r > 16);
  // thinned (the user: "too many cars on the sides"): 12 where there were 21, by section
  assert.ok(north.length === 8 && south.length === 4 && north.length + south.length === cars.length, `${north.length} north, ${south.length} south`);
  const SECTIONS = [[0, 45, 3, 'n'], [62, 104, 2, 's'], [105, 147, 2, 'n'], [157, 246, 2, 'n'], [272, 312, 2, 's'], [357, 388, 1, 'n']];
  for (const [c0, c1, n, sideOf] of SECTIONS) {
    const here = cars.filter(([, c]) => c >= c0 && c <= c1);
    assert.equal(here.length, n, `cols ${c0}-${c1}: ${here.length} parked`);
    for (const [, c, r] of here) assert.equal(r < 11 ? 'n' : 's', sideOf, `col ${c}: on the section's side`);
  }
  assert.ok(new Set(cars.map(([t]) => t)).size >= 3, 'three models still');
  // empty bays show it: a patch, a sealed crack, a cone somebody left (in the row, never in a lane)
  const row = (r) => (r > 9 && r < 11) || (r > 16 && r < 18);
  assert.ok(level2a.floor.filter(([n, , r]) => /^road_(patch|crack)/.test(n) && row(r)).length >= 6, 'patches and cracks in the empty bays');
  assert.ok(level2a.props.filter(([t, c, r]) => t === 'traffic_cone' && (c < WORKS[0] || c > WORKS[1])).length >= 2, 'a stray cone');
  for (const [, , , deg] of north) assert.equal(deg, 180, 'facing west on their side');
  for (const [, , , deg] of south) assert.equal(deg, 0, 'facing east on ours');
  // stretches of 20 m and more with nobody parked on either side: the junctions, the bridge, the bus stop, the yard
  const cols = cars.map(([, c]) => c).sort((a, b) => a - b);
  let gaps = 0;
  for (let i = 1; i < cols.length; i++) if (cols[i] - cols[i - 1] > 20) gaps++;
  assert.ok(gaps >= 4, `${gaps} stretches without parking`);
  // a meter only where there is a bay
  const tees = level2a.floor.filter(([n]) => n === 'park_tee').map(([, c]) => c);
  for (const [t, c] of level2a.props) if (t === 'parking_meter') assert.ok(tees.some((x) => Math.abs(x - c) < 1), `a meter at ${c}`);
});

test('road: two junctions under traffic lights: crossings, stop lines, the corners rounded, the lights half a cycle apart', () => {
  const lights = level2a.props.filter(([t]) => t === 'traffic_light');
  assert.equal(lights.length, 7);
  const T = SIGNALS.traffic, total = T.cycle.reduce((s, [, d]) => s + d, 0);
  for (const [a, b] of C.across) {
    const here = lights.filter(([, c]) => c > a - 1 && c < b + 2);
    const ours = here.filter(([, , , deg]) => deg % 180 === 90), theirs = here.filter(([, , , deg]) => deg % 180 === 0);
    assert.ok(ours.length === 2 && theirs.length >= 1, `${ours.length} for the street, ${theirs.length} for the one across`);
    // our street's and the cross street's are never green together, at any moment
    for (let t = 0; t < total; t += 0.25) {
      const go = (p) => litAt(T.cycle, t + p[4].phase).some((i) => i !== 0);
      assert.ok(!(go(ours[0]) && go(theirs[0])), `both open at ${t} s`);
      assert.deepEqual(litAt(T.cycle, t + ours[0][4].phase), litAt(T.cycle, t + ours[1][4].phase));
    }
    const paint = (n) => level2a.floor.filter(([k, c]) => k.startsWith(n) && c > a - 6 && c < b + 7);
    assert.ok(paint('zebra').length >= 20 && paint('stop_line').length >= 3 && paint('kerb_corner').length === 4 && paint('kerb_ramp').length === 4);
  }
  // he comes to the first on amber and runs it red (no brake): amber when he sets off, red by the stop line
  const first = lights.find(([, c, , deg]) => c < 100 && deg === 270), at = (C.across[0][0] - C.van[0]) * 32 / (C.cruise * 60);
  assert.deepEqual(litAt(T.cycle, first[4].phase + 1), [1], 'amber a second in');
  assert.deepEqual(litAt(T.cycle, first[4].phase + at), [0], `red ${at.toFixed(1)} s in`);
});

test('signals: the lamps lit by the time (pure), one flag a light on the prop', () => {
  const cyc = [[[2], 7], [[1], 2], [[0], 9]];
  assert.deepEqual(litAt(cyc, 0), [2]);
  assert.deepEqual(litAt(cyc, 6.99), [2]);
  assert.deepEqual(litAt(cyc, 7), [1]);
  assert.deepEqual(litAt(cyc, 9), [0]);
  assert.deepEqual(litAt(cyc, 18 + 8), [1], 'round again');
  assert.deepEqual(litAt(cyc, -1), [0], 'before the start: the end of the cycle');
  const T = SIGNALS.traffic.cycle;
  assert.equal(T[2][1], T[0][1] + T[1][1], 'red as long as green and amber: the cross street\'s half');
  assert.equal(SIGNALS.traffic.cross, T[2][1]);
  for (const [k, d] of Object.entries(PROPS)) {
    if (!d.signal) continue;
    assert.ok(SIGNALS[d.signal], k);
    assert.equal(d.lamps.length, [].concat(d.light).length, `${k}: a slice of its map a light`);
    for (const [lit] of SIGNALS[d.signal].cycle) for (const i of lit) assert.ok(i < d.lamps.length, `${k}: lamp ${i}`);
  }
  const w = { time: 0, props: [{ def: PROPS.traffic_light, phase: 0 }, { def: PROPS.traffic_light, phase: SIGNALS.traffic.cross }, { def: PROPS.bench }] };
  const S = new Signals(w);
  assert.equal(S.list.length, 2);
  assert.deepEqual(w.props[0].lamps, [false, false, true], 'green');
  assert.deepEqual(w.props[1].lamps, [true, false, false], 'red across');
  w.time = 7.5;
  S.step();
  assert.deepEqual(w.props[0].lamps, [false, true, false], 'amber');
  assert.deepEqual(w.props[1].lamps, [true, false, false]);
  w.time = 10;
  S.step();
  assert.deepEqual(w.props[0].lamps, [true, false, false]);
  assert.deepEqual(w.props[1].lamps, [false, false, true], 'the cross street goes');
  assert.ok(lab.props.some(([t]) => t === 'traffic_light') && lab.floor.some(([n]) => n === 'label_signals'), 'the lab\'s station');
});

test('road: the street has what a street has: a bus stop, the works signed in a parking row, the bridge, the freeway sign', () => {
  const has = (t) => level2a.props.filter(([k]) => k === t);
  for (const k of ['bus_shelter', 'sign_bus', 'arrow_board', 'compressor', 'sign_works', 'viaduct', 'gantry_sign']) assert.equal(has(k).length, 1, k);
  assert.ok(has('street_tree').length >= 6 && has('bollard').length >= 8 && has('hydrant').length >= 6 && has('sign_noparking').length >= 5);
  // the works stay in the parking row: its cones and barricades north of their lane
  for (const k of ['traffic_cone', 'barricade', 'arrow_board', 'compressor', 'sign_works']) for (const [, , r] of has(k)) assert.ok(r > 9 && r < 11, `${k} at row ${r}`);
  assert.ok(!level2a.props.some(([t]) => t === 'sawhorse'), 'no barrier across a lane');
  for (const k of ['hung', 'lasting', 'overhead']) assert.ok(PROPS.viaduct[k] && PROPS.gantry_sign[k], k);
  assert.ok(PROPS.traffic_light.static && !PROPS.traffic_light.lasting && PROPS.bollard.static && !PROPS.bollard.lasting, 'bolted: torn off by the car');
});
