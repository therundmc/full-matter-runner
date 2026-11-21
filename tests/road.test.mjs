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

test('road: nothing stands in the lanes of a leg, from one end of it to the other', () => {
  // (each leg of the route: the street, the one the detour comes out on, the toll's; systems/Route.js). Lanes side by
  // side are one band across them all; the toll's plaza has islands between its lanes: a band a lane, 3 m (a crash
  // cushion before an island's nose kept off the width of a car in the middle of its lane), its gates across them
  const map = new TileMap(level2a.tiles), plaza = (L) => L.lanes.join() === C.toll.lanes.join();
  const legs = C.legs.map((L) => {
    const half = (L.lanes[1] - L.lanes[0]) / 2;
    const bands = plaza(L) ? L.lanes.map((r) => [r - 1.5, r + 1.5]) : [[L.lanes[0] - half, L.lanes[L.lanes.length - 1] + half]];
    return { ...L, bands };
  });
  assert.deepEqual(legs[0].bands, [[11, 16]]);
  assert.deepEqual(C.legs[0].lanes, C.lanes, 'the street is the first leg');
  assert.ok(legs.some(plaza), 'the toll\'s plaza is a leg');
  const legOf = (c) => legs.find((L) => c >= L.from && c < L.to);
  const across = (c) => C.across.some(([a, b]) => c >= a && c <= b);
  for (const [t, c, r, deg = 0] of level2a.props) {
    const d = PROPS[t], L = legOf(c);
    if (!L || d?.hung || (across(c) && (r < 8 || r > 18)) || t === 'gate_arm_wood' || t === 'gate_steel') continue;
    const half = halfAcross(t, deg);
    for (const [top, bottom] of L.bands) {
      const [y0, y1] = t === 'crash_cushion' && plaza(L) ? [(top + bottom) / 2 - 0.95, (top + bottom) / 2 + 0.95] : [top, bottom];
      assert.ok(r + half <= y0 + 0.01 || r - half >= y1 - 0.01, `${t} at ${c}, ${r} reaches into a lane`);
    }
  }
  // and the lanes are road all the way
  for (const L of legs) {
    for (const [top, bottom] of L.bands) {
      for (let x = Math.max(0, L.from); x < Math.min(map.w - 1, L.to); x++) for (let y = Math.floor(top); y < bottom; y++) assert.ok('=-'.includes(map.at(x, y)), `col ${x} row ${y}`);
    }
  }
  // what is loose (a car's nudge sends it rolling) keeps half a metre off them
  for (const [t, c, r] of level2a.props) {
    const d = PROPS[t], L = legOf(c);
    if (!L || !d || d.static || d.hung || !d.kg || d.kg > 40) continue;
    for (const [top, bottom] of L.bands) if (r >= top - 3 && r <= bottom + 2) assert.ok(r < top - 0.1 || r > bottom + 0.3, `${t} at ${c}, ${r} stands by the lane`);
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
  const has = (t) => level2a.props.filter(([k, c]) => k === t && c < C.legs[0].to); // (the street: the works of the detour are past it)
  for (const k of ['bus_shelter', 'sign_bus', 'arrow_board', 'compressor', 'sign_works', 'viaduct', 'gantry_sign']) assert.equal(has(k).length, 1, k);
  assert.ok(has('hydrant').length >= 6 && has('sign_noparking').length >= 5);
  // THE GRADIENT (docs/LEVEL2.md, the table's MIAMI column): level 1's suburb first, palms and pastels block by block
  const PALMS = ['sabal_palm', 'sabal_palm_b', 'sabal_palm_ragged', 'coconut_palm_lean', 'palm_young', 'royal_palm', 'royal_palm_b'];
  const palms = PALMS.flatMap(has), cols = (list) => list.map(([, c]) => c);
  assert.ok(palms.length >= 20 && has('street_tree').length === 2, `more palms than trees (${palms.length} palms)`);
  assert.ok(Math.min(...cols(palms)) > 62, 'none in the bar\'s district: the start is level 1\'s');
  assert.ok(Math.min(...cols([...has('royal_palm'), ...has('royal_palm_b')])) > 400, 'royal palms only toward the freeway');
  const stucco = (c0, c1) => level2a.tiles.slice(7, 22).reduce((n, row) => n + [...row.slice(c0, c1)].filter((t) => 'PMYV'.includes(t)).length, 0);
  assert.equal(stucco(0, 247), 0, 'no pastel front before the bus stop');
  assert.ok(stucco(247, 313) > 0 && stucco(400, 440) > stucco(247, 287), 'then more and more of it');
  assert.ok(has('tramp').length === 0 && level2a.ambient.patrons.filter(([k, c]) => k === 'tramp' && c < C.legs[0].to).length === 2, 'two homeless men on the street');
  // no keg, no drum on a sidewalk (the user: "enleve les futs de biere qui trainent au milieu de la route")
  for (const k of ['keg', 'oil_drum', 'barrel']) for (const [, c, r] of level2a.props.filter(([t]) => t === k)) assert.ok(r < 7 || r > 50, `${k} at ${c},${r} by a road`);
  // the works stay in the parking row: its cones and barricades north of their lane
  for (const k of ['traffic_cone', 'barricade', 'arrow_board', 'compressor', 'sign_works']) for (const [, , r] of has(k)) assert.ok(r > 9 && r < 11, `${k} at row ${r}`);
  assert.ok(!level2a.props.some(([t]) => t === 'sawhorse'), 'no barrier across a lane');
  for (const k of ['hung', 'lasting', 'overhead']) assert.ok(PROPS.viaduct[k] && PROPS.gantry_sign[k], k);
  assert.ok(PROPS.traffic_light.static && !PROPS.traffic_light.lasting && PROPS.bollard.static && !PROPS.bollard.lasting, 'bolted: torn off by the car');
});

test('road: part two: works shut the street past the side street, its alley under the freeway, leg 1 one way along the freeway, what never gives out of the wheel\'s reach', () => {
  const B = C.bends[0], L1 = C.legs[B.to], side = [B.path[1][0] - 4, B.path[1][0] + 4];
  const at = (t, c0, c1, r0, r1) => level2a.props.filter(([k, c, r]) => k === t && c >= c0 && c <= c1 && r >= r0 && r <= r1);
  const paint = (n) => level2a.floor.filter(([k]) => k === n);
  // the works across the street past the side street's mouth, the way round told before it
  assert.equal(at('road_closed', side[1], side[1] + 30, 11, 16).length, 1, 'ROAD CLOSED across the street');
  assert.ok(at('traffic_cone', side[0], side[1] + 1, 11, 16).length >= 5, 'cones taper the lanes into the side street');
  for (const k of ['excavator', 'dump_truck', 'arrow_board']) assert.equal(at(k, side[0], side[1] + 30, 11, 16).length, 1, k);
  assert.ok(paint('detour_arrow_paint').filter(([, c, r]) => c < B.at && r === C.lanes[1]).length >= 2, 'DETOUR painted in our lane');
  assert.ok(level2a.props.filter(([k, c]) => k === 'sign_detour' && c < side[0]).length >= 3, 'and signed');
  // the side street past its mouth: the alley (tests/alley.test.mjs); the freeway's bridge over its foot
  const deck = level2a.props.filter(([k]) => k === 'overpass');
  assert.ok(deck.length === 1 && PROPS.overpass.hung && PROPS.overpass.overhead && paint('overpass_shadow').length === 1);
  // leg 1 one way: white lines, no yellow centre line in its lanes before the toll; the freeway comes alongside
  const map = new TileMap(level2a.tiles), toll = 560;
  for (let x = L1.from; x < toll; x++) for (let y = 43; y < 48; y++) assert.equal(map.at(x, y), '=', `col ${x} row ${y}`);
  assert.ok(paint('lane_dash_long').filter(([, c, r]) => c > L1.from && c < toll && r === 45.5).length >= 7);
  assert.equal(paint('gore_taper').length, 1);
  // what never gives (a guardrail, its end, a dock's edge) stands beyond the line his wheel is held to (leg 1's
  // `across`): along it he scrapes, never nose-on into it
  const holds = (c) => L1.across.filter(([a, b]) => c >= a && c <= b);
  for (const [t, c, r, deg] of level2a.props) {
    if (c < L1.from || c >= toll || r < 41 || !['guardrail', 'guardrail_end', 'loading_dock', 'jersey_barrier'].includes(t)) continue;
    const half = halfAcross(t, deg), lines = holds(c);
    assert.ok(lines.length, `${t} at ${c}: a line held there`);
    if (r > 46) assert.ok(Math.min(...lines.map((a) => a[3])) <= r - half, `${t} at ${c}, ${r}: south of the line`);
    else assert.ok(Math.max(...lines.map((a) => a[2])) >= r + half, `${t} at ${c}, ${r}: north of the line`);
  }
  assert.ok(L1.cruise > C.cruise, 'faster out of the detour');
});

test('road: the cross street\'s lights run SIGNALS.traffic.cross s behind ours (the builder\'s phases keep to the data)', () => {
  const phases = [...new Set(level2a.props.filter(([t]) => t === 'traffic_light').map(([, , , , o]) => o?.phase ?? 0))].sort((a, b) => a - b);
  assert.equal(phases.length, 2, phases.join());
  assert.equal(phases[1] - phases[0], SIGNALS.traffic.cross);
});
