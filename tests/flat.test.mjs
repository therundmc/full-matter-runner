// The detail of the prologue's flat (tools/build_tutorial.py): its new props listed, what drips (systems/Seeps.js) and
// what fumes (systems/Clutter.js `fume`), the marks of an old flat (render/FloorWear.js), and the lesson's way left
// as it was: the lane, the table at its end, the doorways.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { load } from './setup.mjs';

const { TILE } = await load('game/Config.js');
const { default: EventBus } = await load('engine/EventBus.js');
const { OPTIONAL_LIST } = await load('engine/Assets.js');
const { PROPS } = await load('game/data/props.js');
const { DESTRUCTION } = await load('game/data/destruction.js');
const { CLUTTER, SETS } = await load('game/data/clutter.js');
const { LIQUIDS } = await load('game/data/liquids.js');
const { SMOKE } = await load('game/data/atmosphere.js');
const { FIRE } = await load('game/data/fire.js');
const { default: Seeps } = await load('game/systems/Seeps.js');
const { SEEPS } = await load('game/data/seeps.js');
const { default: Clutter } = await load('game/systems/Clutter.js');
const { default: TileMap } = await load('game/world/TileMap.js');
const { planWear, paintWear, WEAR_KINDS } = await load('game/render/FloorWear.js');
const { default: level } = await load('game/data/levels/tutorial.js');
const { default: lab } = await load('game/data/levels/lab.js');

const png = (group, name) => existsSync(fileURLToPath(new URL(`../assets/sprites/${group}/${name}.png`, import.meta.url)));
const audio = readFileSync(fileURLToPath(new URL('../src/audio/Audio.js', import.meta.url)), 'utf8');
const placeholders = readFileSync(fileURLToPath(new URL('../assets/sound/PLACEHOLDERS.md', import.meta.url)), 'utf8');
const FLAT = ['nightstand', 'chair_jacket', 'duffel_bag', 'coffee_table', 'record_player', 'worktop', 'boiler', 'bucket', 'plant_dead',
  'mirror_cracked', 'mailboxes', 'calendar'];
const PAINT = ['mattress', 'clothes_pile', 'pizza_box', 'bottles_empty', 'mail_pile', 'boards_loose', 'phone_floor', 'trash_spill',
  'cutlery_spill'];

test('flat: every prop and every floor paint of the tutorial has its sprite, listed (unlisted, it is drawn as a bin)', () => {
  for (const [type, , , , o] of level.props) {
    assert.ok(PROPS[type], `${type}: a known prop`);
    assert.ok(png('props', PROPS[type].sprite || type) && OPTIONAL_LIST.includes(`props/${type}`) || !FLAT.includes(type), `${type}: listed`);
    if (o?.clutter) assert.ok(SETS[o.clutter], `${type}: clutter ${o.clutter}`);
  }
  for (const name of [...FLAT, ...PAINT]) assert.ok(png('props', name) && OPTIONAL_LIST.includes(`props/${name}`), `${name}: its sprite, listed`);
  for (const [name] of level.floor) assert.ok(png('props', name) && OPTIONAL_LIST.includes(`props/${name}`), `${name}: painted on the floor, listed`);
  for (const name of FLAT) assert.ok(PROPS[name] && DESTRUCTION[name], `${name}: a prop that comes apart its own way`);
  for (const name of ['pan', 'kettle', 'plates', 'takeaway']) assert.ok(CLUTTER[name] && png('clutter', name) && OPTIONAL_LIST.includes(`clutter/${name}`), name);
  // the flat uses them: each new thing is somewhere in the tutorial, and all of them at the lab's station
  const used = new Set([...level.props.map((p) => p[0]), ...level.floor.map((f) => f[0])]);
  const inLab = new Set([...lab.props.map((p) => p[0]), ...lab.floor.map((f) => f[0])]);
  for (const name of [...FLAT, ...PAINT]) {
    assert.ok(used.has(name), `${name} is in the flat`);
    assert.ok(inLab.has(name), `${name} is at the lab's station`);
  }
  assert.ok(lab.floor.some((f) => f[0] === 'label_flat') && OPTIONAL_LIST.includes('props/label_flat'), 'the lab station has its label');
});

test('flat: the mattress burns as the bed did, and what a new sound is called is a listed placeholder', () => {
  assert.deepEqual(FIRE.paint.mattress, FIRE.paint.bed);
  assert.equal(level.floor.filter((f) => f[0] === 'mattress').length, 1);
  assert.deepEqual(level.floor.find((f) => f[0] === 'mattress').slice(1, 3), [4.8, 2.4], 'where the bed was: he wakes on it');
  for (const name of ['panClang', 'dripPlink']) {
    assert.ok(placeholders.includes(`| ${name} |`), `${name} is listed as a placeholder`);
    assert.ok(new RegExp(`\\b${name}: \\[`).test(audio), `${name} goes through the normal Audio path`);
  }
});

// ---- drips (systems/Seeps.js: the flat's joint and pail are two of its SEEPS)

// a world with one dripping prop over a floor that keeps count of what is poured on it
function dripWorld(as = 'joint', depth = () => 0) {
  const fed = [], rings = [];
  const prop = { type: 'boiler', def: { seep: as }, x: 100, y: 200, dead: false, body: { angle: 0 } };
  const world = {
    props: [prop],
    liquids: {
      at: (x, y) => { const d = depth(x, y); return d > 0 ? { kind: 'water', depth: d } : null; },
      feed: (x, y, area, kind, r) => fed.push({ x, y, area, kind, r }),
      ripple: (x, y) => rings.push([x, y]),
    },
  };
  let n = 0;
  const rand = () => ((n++ * 0.37) % 1); // steady, spread over [0, 1)
  return { world, prop, fed, rings, drips: new Seeps(world, SEEPS, rand) };
}
const run = (d, s, dt = 1 / 60) => { for (let t = 0; t < s; t += dt) d.update(dt); };

test('drips: a drop every few seconds at the foot of the prop, a little water each, at the rate its numbers say', () => {
  const S = SEEPS.joint.drip, { drips, fed, rings } = dripWorld();
  run(drips, 120);
  const mean = (S.every[0] + S.every[1]) / 2;
  assert.ok(Math.abs(fed.length - 120 / mean) <= 120 / mean * 0.15, `${fed.length} drops in two minutes, about ${(120 / mean).toFixed(0)} expected`);
  assert.equal(rings.length, fed.length, 'each one rings');
  for (const f of fed) {
    assert.deepEqual([f.x, f.y, f.area, f.kind, f.r], [100 + S.at[0], 200 + S.at[1], S.drop, S.kind, S.r]);
  }
  // what it pours in a minute is a puddle, not a flood: under a tile of floor a film deep
  assert.ok((60 / mean) * S.drop < TILE * TILE, 'a puddle');
  for (const name of ['joint', 'pail']) {
    const d = SEEPS[name].drip;
    assert.ok(LIQUIDS.kinds[d.kind] && d.every[0] > 0.5 && d.every[1] >= d.every[0] && d.cap > LIQUIDS.wet && d.drop > 0 && d.most === null, name);
    assert.equal(d.sound, 'dripPlink', `${name}: its drop is heard`);
  }
});

test('drips: the drops fall where the prop is now, turned with it', () => {
  const { drips, fed, prop } = dripWorld(), [ax, ay] = SEEPS.joint.drip.at;
  prop.x = 300; prop.y = 50; prop.body.angle = Math.PI / 2; // its +y now points to -x
  run(drips, 10);
  assert.ok(fed.length > 0);
  assert.ok(Math.abs(fed[0].x - (300 - ay)) < 1e-6 && Math.abs(fed[0].y - (50 + ax)) < 1e-6, `${fed[0].x}, ${fed[0].y}`);
});

test('drips: no more water once the floor at its foot is deep enough (the drop still rings), none from a broken prop', () => {
  const S = SEEPS.pail.drip;
  let deep = S.cap + 0.1;
  const { drips, fed, rings, prop } = dripWorld('pail', () => deep);
  run(drips, 30);
  assert.equal(fed.length, 0, 'capped');
  assert.ok(rings.length >= 5, 'it drips on');
  deep = S.cap - 0.2; // it dried a little: fed again
  run(drips, 30);
  assert.ok(fed.length >= 5);
  const n = fed.length, r = rings.length;
  prop.dead = true;
  run(drips, 30);
  assert.equal(fed.length, n, 'broken: nothing more');
  assert.equal(rings.length, r);
  // falling apart counts too
  const b = dripWorld();
  b.prop.parts = [{}];
  run(b.drips, 30);
  assert.equal(b.fed.length, 0);
});

test('drips: the props that drip say as what; the flat has its two, each over a spill and a stain of its own', () => {
  for (const name of ['boiler', 'bucket']) {
    assert.ok(SEEPS[PROPS[name].seep]?.drip, `${name}: one of SEEPS`);
    assert.equal(PROPS[name].drips, undefined, 'one system for what drips');
    const [, c, r] = level.props.find((p) => p[0] === name);
    assert.ok(level.spills.some(([kind, sc, sr]) => kind === 'water' && Math.hypot(sc - c, sr - r) < 0.6), `${name}: already wet under it`);
    assert.ok(level.grime.some(([kind, gc, gr]) => kind === 'leak' && Math.hypot(gc - c, gr - r) < 0.6), `${name}: its old stain`);
  }
  assert.equal(LIQUIDS.drips, undefined);
});

// ---- what fumes

function fumeWorld() {
  const fumes = [], wisps = [];
  const world = {
    events: new EventBus(), debris: [], addDebris() {}, sound() {},
    particles: { glass() {}, drops() {}, chips() {}, dust() {}, floaters() {}, shard() {} },
    smoke: { wisp: (o) => wisps.push(o.kind), fume: (name, x, y, dt, k, o) => fumes.push({ name, x, y, dt, k, o }) },
  };
  const stove = { type: 'oven', x: 400, y: 300, W: 20, H: 20, dead: false, body: { angle: 0 } };
  return { world, fumes, wisps, stove, clutter: new Clutter(world) };
}

test('fumes: the pan on the stove smokes for as long as it stands there, at its own point', () => {
  const { clutter, fumes, wisps, stove } = fumeWorld();
  const [pan] = clutter.attach(stove, 'flat_stove');
  assert.equal(pan.kind, 'pan');
  for (let i = 0; i < 60; i++) clutter.update(1 / 60);
  assert.equal(fumes.length, 60, 'every step');
  assert.deepEqual([fumes[0].name, fumes[0].x, fumes[0].y, fumes[0].o], ['pan', 400 + pan.x, 300 + pan.y, pan]);
  assert.equal(wisps.length, 0, 'no cigarette in it');
  // knocked off the stove: no more smoke
  pan.state = 'off';
  clutter.update(1 / 60);
  assert.equal(fumes.length, 60);
  // the stove gone: let go
  pan.state = 'on';
  stove.dead = true;
  clutter.update(1 / 60);
  assert.equal(fumes.length, 60);
  assert.equal(clutter.items(stove).length, 0);
});

test('fumes: each has its numbers, a source no smaller than the air\'s cell, and never thick enough to hide a man', () => {
  for (const [kind, d] of Object.entries(CLUTTER)) if (d.fume) assert.ok(SMOKE.fumes[d.fume], `${kind}: ${d.fume}`);
  for (const name of ['pan', 'kettle']) {
    const F = SMOKE.fumes[name], K = SMOKE.kinds[F.kind];
    assert.ok(K && F.rate > 0 && F.r >= 6 && F.cap > 0, name);
    assert.ok(F.cap * K.sight < SMOKE.sight.thick, `${name}: the guards see through it`);
    assert.ok(F.wisp.every > 0 && F.wisp.alpha <= 1, name);
  }
  // the kettle and the pan are where the level says: on the worktop and the stove of the kitchen
  const on = (type) => level.props.find((p) => p[0] === type)?.[4]?.clutter;
  assert.equal(on('oven'), 'flat_stove');
  assert.equal(on('worktop'), 'flat_worktop');
  assert.ok(SETS.flat_worktop.some(([k]) => k === 'kettle') && SETS.flat_stove.some(([k]) => k === 'pan'));
});

// ---- the wear of an old flat

test('flat wear: its marks are known kinds, planned the same every time, painted the same every time, never on a wall', () => {
  for (const kind of ['damp', 'flakes', 'grease', 'leak', 'threadbare']) {
    assert.ok(WEAR_KINDS.includes(kind), kind);
    assert.ok(level.grime.some((g) => g[0] === kind), `${kind} is used in the flat`);
  }
  for (const [kind] of level.grime) assert.ok(WEAR_KINDS.includes(kind), kind);
  const map = new TileMap(level.tiles);
  const a = planWear(map, level), b = planWear(map, level);
  assert.deepEqual(a.marks, b.marks);
  // the marks put at a point are there, on a floor
  for (const [kind, c, r, , , , o] of level.grime) {
    if (o?.at !== 'point') continue;
    assert.ok(a.marks.some((m) => m.kind === kind && m.x === c * TILE && m.y === r * TILE), `${kind} at ${c},${r} is on a floor`);
  }
  const S = 2, width = map.w * TILE * S, height = map.h * TILE * S;
  const paint = () => { const img = { width, height, data: new Uint8ClampedArray(width * height * 4).fill(128) }; paintWear(img, S, map, level); return img.data; };
  const p1 = paint(), p2 = paint();
  assert.deepEqual(p1, p2, 'the same pixels');
  let changed = 0;
  for (let py = 0; py < height; py++) {
    for (let px = 0; px < width; px++) {
      const i = (py * width + px) * 4, d = Math.abs(p1[i] - 128) + Math.abs(p1[i + 1] - 128) + Math.abs(p1[i + 2] - 128);
      if (!d) continue;
      changed++;
      const tx = Math.floor(px / (TILE * S)), ty = Math.floor(py / (TILE * S));
      assert.ok(!map.isWallChar(tx, ty), `wall pixel ${px},${py} painted`);
    }
  }
  assert.ok(changed > 20000, `${changed} pixels of wear`);
});

// ---- the lesson's way

// the box (tiles) of a prop of the level that has a body on the floor: null for what hangs
function box([type, c, r, deg]) {
  const d = PROPS[type];
  if (d.hung || d.high) return null;
  let w = d.r ? d.r * 2 : d.w, h = d.r ? d.r * 2 : d.h;
  if (Math.round(deg) % 180 === 90) [w, h] = [h, w];
  else if (Math.round(deg) % 90) w = h = Math.max(w, h);
  return [c - w / 2 / TILE, r - h / 2 / TILE, c + w / 2 / TILE, r + h / 2 / TILE];
}
const overlaps = (b, [x0, y0, x1, y1]) => b[0] < x1 && b[2] > x0 && b[1] < y1 && b[3] > y0;

test('flat: petrol only where it was poured - the living room\'s lane, the hall, a splash each end; the rest is the fire\'s own', () => {
  const pts = level.petrol.flatMap(([, ...q]) => q), room = ([c0, r0, c1, r1]) => pts.filter(([c, r]) => c >= c0 && c < c1 + 1 && r >= r0 && r < r1 + 1);
  assert.equal(level.petrol.length, 7);
  assert.deepEqual(room([4, 1, 9, 5]), [], 'none in his bedroom, none under its door');
  assert.ok(room([10, 8, 16, 12]).every(([, r]) => r < 8.7), 'the kitchen: what ran in under its door, no further');
  assert.ok(room([21, 2, 22, 15]).every(([, r]) => r < 3), 'the corridor: one splash at his front door');
  assert.deepEqual(room([4, 14, 20, 20]), [], 'none down the long corridor: there the fire follows him (chase)');
  // a trail's far end is a splash (a pour of one point, wider), a can dropped by it
  const splashes = level.petrol.filter((q) => q.length === 2);
  assert.equal(splashes.length, 3, 'where the match falls, where the pouring began, where it ended');
  for (const [c, r] of [[13.4, 8.55], [19.8, 2.15]]) {
    assert.ok(level.props.some((q) => q[0] === 'jerrycan' && Math.hypot(q[1] - c, q[2] - r) < 2), `a can left near ${c},${r}`);
  }
  // the chase: its path down the corridor's middle, on floor, from the burning north end to the bottle
  const C = level.tutorial.chase, bottle = level.props.find((q) => q[0] === 'propane');
  assert.equal(C.from, 3);
  for (const [c, r] of C.path) assert.ok(',.'.includes(level.tiles[Math.floor(r)][Math.floor(c)]), `${c},${r}`);
  assert.ok(Math.hypot(C.path.at(-1)[0] - bottle[1], C.path.at(-1)[1] - bottle[2]) < 1, 'it ends at the gas bottle');
  for (const st of level.tutorial.stages.slice(3)) assert.equal(st.hold, undefined, 'no room holds it back from there on');
  // no lamp in the alley, one runner turned at the corner
  assert.ok(!level.props.some((q) => q[0] === 'streetlight'));
  const corner = level.floor.filter((f) => f[0] === 'runner_corner'), runs = level.floor.filter((f) => f[0] === 'runner');
  assert.equal(corner.length, 1);
  const half = 9 / 32, [, cc, cr] = corner[0];
  for (const [, c, r, deg] of runs) {
    // a length (3 tiles) ends on the corner's edge or on another length's end, never across one
    const ends = deg === 90 ? [r - 1.5, r + 1.5] : [c - 1.5, c + 1.5], edge = deg === 90 ? cr - half : cc - half;
    assert.ok(Math.abs(((edge - ends[1]) / 3) - Math.round((edge - ends[1]) / 3)) < 1e-3 && ends[1] <= edge + 1e-3, `runner at ${c},${r}`);
    assert.equal(deg === 90 ? c : r, deg === 90 ? cc : cr, 'on the corner\'s line');
  }
});

test('flat: the lane, the table at its end and the petrol are where they were', () => {
  const st = level.tutorial.stages;
  assert.deepEqual(st[2].keep, [[11, 2.5, 13.25, 2.75], [13, 3.75, 13.25, 4], [13, 5, 13.25, 5], [13, 6, 13.25, 7]], 'the lane');
  assert.deepEqual(st[1].marks.vault, [13.5, 5.7]);
  assert.deepEqual(level.props.find((p) => p[0] === 'table').slice(1, 4), [13.5, 5.7, 0]);
  assert.deepEqual(st[1].keep, [[9, 1, 10, 3]]);
  assert.deepEqual(level.petrol[2], [10, [14.5, 2.2], [14.5, 6.6], [13.5, 6.6], [13.5, 8.3]], 'the lane\'s outer side');
  assert.deepEqual(level.petrol[4], [10, [10.2, 2.2], [10.2, 4], [12.75, 4], [12.75, 6.9]], 'its inner side');
  assert.equal(level.props.filter((p) => p[0] === 'oven' || p[0] === 'gas_bottle').length, 2, 'the stove and its bottle');
  assert.deepEqual(level.tutorial.blast.at, level.props.find((p) => p[0] === 'propane').slice(1, 3), 'the end is the gas bottle by the fire door');
});

test('flat: nothing new stands in the lane, in a doorway, on a way he is taught to take, or on a spawn', () => {
  const st = level.tutorial.stages;
  // the lane's cells (a rectangle ends at c1 + 1, r1 + 1), the doorways and a tile either side of them, the ways the
  // lesson and the QA robot's plan run: mattress to door, the corridor's middle, the slide, the fire door, the window
  const clear = [
    ...st[2].keep.map(([c0, r0, c1, r1]) => [c0, r0, c1 + 1, r1 + 1]),
    [8.2, 2, 11, 3.2], [16.6, 2, 20.9, 3], [12.5, 6.9, 14.5, 9], [16.6, 10, 18, 11], [19.6, 10, 21.4, 11],
    [21.2, 9.6, 22.4, 14], [12.2, 14.2, 22, 15.8], [10.6, 14, 12.4, 16], [4, 14, 10.6, 15.6], [7, 16, 9, 20],
  ];
  const added = new Set([...FLAT, 'cardboard_box']); // (what this pass put in)
  for (const p of level.props) {
    const b = box(p);
    if (!b || !added.has(p[0])) continue;
    const wall = !PROPS[p[0]].r && Math.min(PROPS[p[0]].w, PROPS[p[0]].h) <= 8 && PROPS[p[0]].static; // a piece on a wall face
    for (const z of clear) assert.ok(wall || !overlaps(b, z), `${p[0]} at ${p[1]},${p[2]} stands in ${z}`);
    for (const s of st) {
      const [sx, sy] = s.spawn;
      assert.ok(!(b[0] - 0.3 < sx && sx < b[2] + 0.3 && b[1] - 0.3 < sy && sy < b[3] + 0.3), `${p[0]} on the spawn ${sx},${sy}`);
    }
  }
  // the QA robot's way out of the bedroom and down the lane (tools/qa/bot.js PLANS.tutorial.bed)
  const way = [[8.5, 2.55], [10.4, 2.6], [11.2, 3.0], [13.6, 3.1], [13.6, 4.6]];
  for (const p of level.props) {
    const b = box(p);
    if (!b || p[0] === 'table') continue; // (the table is the vault: the way goes over it)
    for (let k = 0; k + 1 < way.length; k++) {
      for (let u = 0; u <= 1; u += 0.05) {
        const x = way[k][0] + (way[k + 1][0] - way[k][0]) * u, y = way[k][1] + (way[k + 1][1] - way[k][1]) * u;
        assert.ok(!(b[0] - 0.32 < x && x < b[2] + 0.32 && b[1] - 0.32 < y && y < b[3] + 0.32), `${p[0]} at ${p[1]},${p[2]} is in the robot's way at ${x.toFixed(1)},${y.toFixed(1)}`);
      }
    }
  }
});

test('flat: what was spilled lies off the petrol, and nothing slick is poured in his way', () => {
  assert.ok(level.spills.length >= 3);
  for (const [kind, c, r, area] of level.spills) {
    assert.ok(LIQUIDS.kinds[kind] && !LIQUIDS.kinds[kind].slip, `${kind}: nobody goes down on it`);
    const reach = Math.sqrt(area / Math.PI) / TILE; // tiles: about what it spreads to
    for (const [width, ...pts] of level.petrol) {
      for (let k = 0; k < pts.length; k++) {
        const [x0, y0] = pts[k], [x1, y1] = pts[k + 1] || pts[k], len = Math.hypot(x1 - x0, y1 - y0) || 1;
        const u = Math.max(0, Math.min(1, ((c - x0) * (x1 - x0) + (r - y0) * (y1 - y0)) / (len * len)));
        const d = Math.hypot(c - x0 - (x1 - x0) * u, r - y0 - (y1 - y0) * u);
        assert.ok(d > reach + width / 2 / TILE + 0.1, `${kind} at ${c},${r} runs into a petrol trail (${d.toFixed(2)} tiles off)`);
      }
    }
  }
});
