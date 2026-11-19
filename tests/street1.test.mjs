// Level 1's street (tools/build_level1.py), made with level 2A's kit: its crossing, the gate's mouth kept clear, its
// bays and kerbs, nothing in its two lanes nor on the getaway's way. (Its sprites: tests/road.test.mjs.)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { load } from './setup.mjs';

const { PROPS } = await load('game/data/props.js');
const { VEHICLES } = await load('game/entities/Vehicle.js');
const { default: TileMap } = await load('game/world/TileMap.js');
const { OUTRO, getawayPath, driveStep } = await load('game/systems/Outro.js');
const { default: level } = await load('game/data/levels/level1.js');

const TILE = 32;
const paint = (name) => level.floor.filter(([k]) => k.startsWith(name));
// half of a thing's hitbox across the street (rows), turned as it stands
function halfAcross(type, deg) {
  const d = PROPS[type], v = VEHICLES[type];
  const [w, h] = v ? [v.w ?? 136, v.h ?? 54] : d.r ? [d.r * 2, d.r * 2] : [d.w, d.h];
  return (Math.round(deg) % 180 === 90 ? w : h) / 64;
}

test('street (level 1): a crossing from the bar\'s door to the start alley, a stop line and SLOW before it in each lane', () => {
  const map = new TileMap(level.tiles);
  const door = [...level.tiles[20]].map((ch, x) => (ch === 'D' && level.doors[`${x},20`]?.kind === 'bar' ? x : -1)).filter((x) => x >= 0);
  assert.equal(door.length, 1, 'the bar\'s door, by its options');
  const zebra = paint('zebra');
  assert.equal(zebra.length, 7, 'a bar a metre, kerb to kerb');
  for (const [, c, r] of zebra) {
    assert.ok(Math.abs(c - (door[0] + 1.5)) <= 0.5, `the zebra at col ${c} is in front of the door`);
    assert.ok('=-'.includes(map.at(Math.floor(c), Math.floor(r))), 'on the road');
    assert.equal(map.at(Math.floor(c), Math.floor(r)), '=', 'no centre line through it');
  }
  assert.equal(map.at(Math.floor(zebra[0][1]), 32), '_', 'the start alley at its other end');
  assert.equal(paint('kerb_ramp').length, 2);
  const [theirs, ours] = level.ambient.traffic.map((l) => l.row);
  for (const k of ['stop_line', 'road_slow']) {
    const rows = paint(k).map(([, , r]) => r).sort((a, b) => a - b);
    assert.ok(rows.length === 2 && Math.abs(rows[0] - theirs) < 0.3 && Math.abs(rows[1] - ours) < 0.3, `${k}: one a lane (${rows})`);
  }
});

test('street (level 1): the gate\'s mouth: the kerb dropped, the parking row hatched, KEEP CLEAR on the lane', () => {
  const gate = level.props.filter(([t]) => t === 'chain_fence').map(([, c]) => Math.floor(c)).sort((a, b) => a - b);
  const low = paint('kerb_s_low').map(([, c]) => Math.floor(c));
  for (const c of gate) assert.ok(low.includes(c), `the kerb dropped at col ${c}`);
  const hatch = paint('hatch_bay');
  assert.ok(hatch.length === 1 && Math.abs(hatch[0][1] - (gate[1] + 0.5)) < 0.01, 'hatched in front of the gate');
  assert.ok(paint('road_keep').length === 1 && paint('road_clear').length === 1);
  assert.ok(paint('road_keep')[0][1] > paint('road_clear')[0][1], 'KEEP first for who drives west');
});

test('street (level 1): a kerb stone along every metre of both sidewalks, painted where the rule changes', () => {
  const w = level.tiles[0].length;
  for (const side of ['s', 'n']) {
    const cols = new Array(w).fill(0);
    for (const [k, c] of paint(`kerb_${side}`)) {
      const n = k.endsWith('_4') ? 4 : 1;
      for (let i = 0; i < n; i++) cols[Math.round(c - n / 2) + i]++;
    }
    assert.ok(cols.every((n) => n === 1), `kerb ${side}: ${cols.join('')}`);
  }
  // red by each hydrant, yellow along the loading bay
  for (const [, c, r] of level.props.filter(([t, , row]) => t === 'hydrant' && row > 20)) {
    const red = paint(r < 26 ? 'kerb_s_red' : 'kerb_n_red').map(([, x]) => Math.floor(x));
    assert.ok(red.includes(Math.floor(c)), `a red kerb by the hydrant at ${c}`);
  }
  const loading = paint('road_loading');
  assert.equal(loading.length, 1);
  assert.ok(paint('kerb_s_yellow').some(([, c]) => Math.abs(c - loading[0][1]) < 1), 'the loading bay\'s kerb yellow');
});

test('street (level 1): the three parked cars stand in a bay each, the trunk\'s tire iron still there', () => {
  const tees = paint('park_tee').filter(([, , r]) => r > 20).map(([, c]) => c).sort((a, b) => a - b);
  const cars = level.props.filter(([t, , r, , o]) => VEHICLES[t] && o?.lights === false && r > 20);
  assert.equal(cars.length, 3);
  for (const [t, c] of cars) assert.ok(tees.some((x, i) => x < c && c < tees[i + 1]), `${t} at ${c} in a bay`);
  assert.ok(cars.some(([, , , , o]) => o.trunk === 'tire_iron'));
  assert.ok(tees.length - 1 > cars.length, 'and bays left empty');
});

test('street (level 1): nothing with a body in the two lanes, no awning over a door, two small flocks of pigeons', () => {
  const [theirs, ours] = level.ambient.traffic.map((l) => l.row);
  assert.ok(theirs > 25 && theirs < 27.5 && ours > 27.5 && ours < 30);
  for (const [t, c, r, deg = 0] of level.props) {
    if (PROPS[t]?.hung || r < 23 || r > 30) continue;
    const half = halfAcross(t, deg);
    assert.ok(r + half <= 25.01 || r - half >= 30, `${t} at ${c}, ${r} reaches into a lane`);
  }
  let awnings = 0;
  for (const [t, c, r] of level.props) {
    if (!PROPS[t]?.canopy) continue;
    awnings++;
    const wall = Math.floor(r) - 1;
    for (let x = Math.floor(c - 1.5 + 0.05); x <= Math.floor(c + 1.5 - 0.05); x++) assert.equal(level.tiles[wall][x], 'G', `${t} at ${c}: over a window, never a door (col ${x})`);
  }
  assert.ok(awnings >= 1);
  const flocks = level.critters.pigeons;
  assert.ok(flocks.length === 2 && flocks.every(([, , n]) => n >= 2 && n <= 3), JSON.stringify(flocks));
});

test('street (level 1): the getaway\'s whole body touches nothing that stands on the street but the gate and the coupe', () => {
  const c = level.props.find((p) => p[0] === 'convertible');
  const path = getawayPath(c[1] * TILE, c[2] * TILE, (c[3] * Math.PI) / 180, level.exit), o = { s: 0, v: 0, slip: 0, slipV: 0, wag: 0 };
  const body = [];
  for (let t = OUTRO.go + 1 / 60; t < OUTRO.timeout && o.s < path.length; t += 1 / 60) {
    const at = driveStep(o, path, t, 1 / 60), cs = Math.cos(at.a), sn = Math.sin(at.a);
    if (at.y < 20.5 * TILE) continue;                     // (what stands in the alley is run over: tests/getaway.test.mjs)
    for (let u = -86; u <= 86; u += 8.6) for (const w of [-32, -16, 0, 16, 32]) body.push([at.x + cs * u - sn * w, at.y + sn * u + cs * w]);
  }
  assert.ok(body.length > 500);
  let checked = 0;
  for (const [t, col, row] of level.props) {
    const d = PROPS[t];
    if (!d || d.hung || row < 21 || row > 31 || t === 'chain_fence') continue;
    checked++;
    const reach = (d.r ?? Math.hypot(d.w, d.h) / 2) + 6, x = col * TILE, y = row * TILE;
    assert.ok(body.every(([bx, by]) => Math.hypot(bx - x, by - y) > reach), `${t} at ${col}, ${row} is on the getaway's way`);
  }
  assert.ok(checked > 25, `${checked} things on the street`);
});
