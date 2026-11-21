// Level 1's interiors: the shops, the laundromat, the bar's back and its offices are full of their own things (every
// one a listed sprite at the furniture's density), their floors carry the rooms' own marks, laid the same every time,
// and what drips, steams and slops over (systems/Seeps.js) keeps to its numbers and stops with its prop.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { load } from './setup.mjs';

const { default: Seeps } = await load('game/systems/Seeps.js');
const { SEEPS } = await load('game/data/seeps.js');
const { LIQUIDS } = await load('game/data/liquids.js');
const { PROPS } = await load('game/data/props.js');
const { DESTRUCTION, BITS, FLOATS } = await load('game/data/destruction.js');
const { CLUTTER, SETS } = await load('game/data/clutter.js');
const { default: TileMap } = await load('game/world/TileMap.js');
const { planWear, paintWear, WEAR_KINDS } = await load('game/render/FloorWear.js');
const { tumbleAt, screenAt, secondHand, TUMBLE, SCREENS, CHANNELS } = await load('game/render/PropLife.js');
const { TILE } = await load('game/Config.js');
const { default: level } = await load('game/data/levels/level1.js');
const { default: lab } = await load('game/data/levels/lab.js');

const { REQUIRED, OPTIONAL, FINE } = await load('engine/spritelist.js');
const loaded = new Set([...REQUIRED, ...OPTIONAL]); // what engine/Assets.js loads (tools/sprites/registry.py)
const file = (path) => fileURLToPath(new URL(`../assets/sprites/${path}.png`, import.meta.url));
const size = (path) => { const b = readFileSync(file(path)); return [b.readUInt32BE(16), b.readUInt32BE(20)]; };

const NEW = ['shop_shelf', 'wine_rack', 'beer_cases', 'lottery_stand', 'tv_stack', 'vcr_shelf', 'tv_box', 'repair_bench', 'dryer',
  'folding_table', 'soap_vend', 'laundry_cart', 'plastic_chair', 'cig_machine', 'ice_bin', 'coat_rack', 'bottle_crate', 'wet_sign',
  'mop_bucket', 'water_cooler', 'filing_cabinet', 'safe', 'pallet', 'steel_shelf', 'hand_truck', 'security_mirror', 'cig_rack',
  'price_board', 'tape_rack', 'notice_board', 'coin_changer', 'hand_dryer', 'graffiti', 'wall_clock', 'cleaning_rack'];
const ROUND = { coat_rack: [20, 20], mop_bucket: [18, 18], water_cooler: [15, 15] }; // drawn wider than their foot
// level 1's rooms, tile rectangles of the level (after the cuts)
const ROOMS = {
  liquor: [3, 17, 8, 19], tvshop: [34, 17, 37, 19], laundry: [26, 33, 29, 35], bar: [15, 12, 23, 19], toilets: [20, 6, 22, 10],
  storeroom: [15, 6, 18, 10], boss: [24, 6, 28, 10], gaming: [24, 12, 28, 15], vip: [24, 17, 28, 19],
};
const inRoom = ([c0, r0, c1, r1], x, y) => x >= c0 && x < c1 + 1 && y >= r0 && y < r1 + 1;
const propsIn = (room) => level.props.filter((p) => inRoom(ROOMS[room], p[1], p[2])).map((p) => p[0]);

test('interiors: every new prop is data, a recipe that holds, and a sprite listed at the furniture\'s density', () => {
  for (const k of NEW) {
    const d = PROPS[k];
    assert.ok(d, `${k} in data/props.js`);
    assert.ok(d.material && d.hp > 0 && d.chips, `${k}: material, hp, chips`);
    if (!d.static) assert.ok(d.kg > 0 && d.mu > 0, `${k} is loose: kg and mu`);
    assert.ok(existsSync(file(`props/${k}`)), `${k}: its sprite`);
    assert.ok(loaded.has(`props/${k}`) && FINE.has(`props/${k}`), `${k} loaded by engine/Assets.js at FINE density (unlisted, it is drawn as a bin)`);
    const [w, h] = ROUND[k] || (d.r ? [d.r * 2 + 2, d.r * 2 + 2] : [d.w + 2, d.h + 2]);
    assert.deepEqual(size(`props/${k}`), [w * 2, h * 2], `${k}: its hitbox and a px of outline, painted twice as fine`);
    const rec = DESTRUCTION[k] || {};
    for (const c of rec.contents || []) assert.ok(BITS[c.bit], `${k}: ${c.bit}`);
    if (rec.floats) assert.ok(FLOATS[rec.floats[0]], `${k}: ${rec.floats[0]}`);
    if (rec.sheds) assert.ok(FLOATS[rec.sheds], `${k}: ${rec.sheds}`);
    if (rec.leak?.kind) assert.ok(LIQUIDS.kinds[rec.leak.kind], `${k}: ${rec.leak.kind}`);
    if (d.seep) assert.ok(SEEPS[d.seep], `${k}: seep ${d.seep}`);
  }
  for (const k of ['tv_stack', 'soap_vend', 'cig_machine']) assert.ok(existsSync(file(`props/${k}_glow`)) && PROPS[k].light, `${k}: lit`);
  for (const k of ['bar_mat', 'cardboard_flat']) assert.ok(existsSync(file(`props/${k}`)) && loaded.has(`props/${k}`), `${k}: floor paint`);
  for (const k of ['glass_rack', 'phone', 'papers', 'mug', 'vhs', 'soap', 'folded', 'ledger', 'adding', 'ashtray_full']) {
    assert.ok(existsSync(file(`clutter/${k}`)) && loaded.has(`clutter/${k}`), `${k}: a clutter sprite, loaded`);
  }
  for (const [name, set] of Object.entries(SETS)) for (const [kind] of set) assert.ok(CLUTTER[kind], `${name}: ${kind}`);
  for (const c of Object.values(CLUTTER)) if (c.glass) assert.ok(LIQUIDS.kinds[c.glass.kind], c.sprite);
});

test('interiors: each room of level 1 has its own things, and what seeps is where it should', () => {
  const has = (room, ...kinds) => { const p = propsIn(room); for (const k of kinds) assert.ok(p.includes(k), `${k} in the ${room}`); };
  has('liquor', 'bottle_shelf', 'wine_rack', 'shop_shelf', 'beer_cases', 'lottery_stand', 'cig_rack', 'price_board', 'security_mirror', 'fridge');
  has('tvshop', 'tv_stack', 'vcr_shelf', 'tv_box', 'repair_bench', 'tape_rack', 'tv');
  has('laundry', 'washer', 'dryer', 'folding_table', 'soap_vend', 'laundry_cart', 'coin_changer', 'notice_board', 'wet_sign');
  has('bar', 'cig_machine', 'keg', 'pool_table', 'jukebox', 'arcade');
  has('toilets', 'mop_bucket', 'wet_sign', 'hand_dryer', 'graffiti');
  has('storeroom', 'steel_shelf', 'hand_truck', 'ice_bin', 'cleaning_rack', 'bottle_crate');
  has('boss', 'safe', 'filing_cabinet', 'wall_clock', 'calendar');
  has('gaming', 'water_cooler', 'coat_rack');
  const seeping = level.props.filter((p) => p[4]?.seep).map((p) => `${p[0]}:${p[4].seep}`).sort();
  assert.deepEqual(seeping, ['keg:keg', 'oven:pot', 'washer:washer'], 'one washer, one keg, the stove');
  assert.equal(PROPS.calendar.w, 7, 'one calendar: the flat\'s, on level 1\'s walls too');
  assert.ok(level.props.filter((p) => p[0] === 'calendar').length >= 3);
  for (const p of level.props) if (p[4]?.seep) assert.ok(SEEPS[p[4].seep], p[4].seep);
  for (const [, , , , o] of level.props) if (o?.clutter) assert.ok(SETS[o.clutter], o.clutter);
  // the rules that stay: no television in the boss's room, nothing of this in a doorway or a window, nothing loose
  // or bolted added to the service alley and the lot's lane (the getaway's)
  assert.ok(!propsIn('boss').some((k) => k === 'tv' || k === 'tv_stack'), 'no television in front of the boss\'s door');
  const map = new TileMap(level.tiles);
  for (const [k, x, y] of level.props) {
    if (!NEW.includes(k)) continue;
    const ch = level.tiles[Math.floor(y)][Math.floor(x)];
    assert.ok(!'DLG'.includes(ch), `${k} at ${x},${y} stands in an opening`);
    assert.ok(!(x >= 11 && x < 14 && y >= 2.4 && y < 21), `${k} at ${x},${y} is in the service alley`);
    assert.ok(!(y >= 2.4 && y < 5 && x >= 11 && x < 31), `${k} at ${x},${y} is on the getaway's way across the lot`);
    if (PROPS[k].w && PROPS[k].h <= 5) continue; // on a wall face
    assert.ok(!map.isWallChar(Math.floor(x), Math.floor(y)), `${k} at ${x},${y} is in a wall`);
  }
  assert.ok(lab.props.some((p) => p[4]?.seep === 'washer') && lab.props.some((p) => p[0] === 'mop_bucket'), 'the lab\'s station');
  assert.ok(lab.floor.some((f) => f[0] === 'label_seeps'));
});

test('interiors: the rooms\' own floor marks are laid by the level, the same every time, each on a floor', () => {
  const OWN = ['mould', 'dust', 'drips', 'rust', 'prints', 'runoff']; // (its `grease` and the walls' `damp` are the flat's kinds)
  for (const k of OWN) assert.ok(WEAR_KINDS.includes(k), k);
  for (const [k] of level.grime) assert.ok(WEAR_KINDS.includes(k), `${k} is a kind of wear`);
  const map = new TileMap(level.tiles);
  const a = planWear(map, level), b = planWear(map, level);
  assert.deepEqual(a.marks, b.marks, 'seeded: the same plan twice');
  for (const k of OWN) assert.ok(a.marks.some((m) => m.kind === k), `${k} somewhere in level 1`);
  for (const m of a.marks) if (OWN.includes(m.kind)) assert.ok(m.s >= 0 && m.o.at === 'point', `${m.kind} at its point, on a floor`);
  const marksIn = (room, kind) => a.marks.filter((m) => m.kind === kind && inRoom(ROOMS[room], m.x / TILE, m.y / TILE)).length;
  assert.ok(marksIn('toilets', 'mould') >= 3 && marksIn('toilets', 'runoff') >= 2 && marksIn('toilets', 'crack') >= 3, 'the toilets');
  assert.ok(marksIn('laundry', 'rust') === 1 && marksIn('laundry', 'mould') >= 2 && marksIn('laundry', 'crack') >= 2, 'the laundromat');
  assert.ok(marksIn('storeroom', 'grease') === 1 && marksIn('storeroom', 'drips') === 1, 'the storeroom');
  assert.ok(marksIn('liquor', 'dust') >= 3 && marksIn('liquor', 'prints') === 1, 'the liquor store');
  // painted twice, pixel for pixel the same; a mark never leaves a floor for a wall
  const S = 2, width = map.w * TILE * S, height = map.h * TILE * S;
  const paint = () => { const img = { width, height, data: new Uint8ClampedArray(width * height * 4).fill(128) }; paintWear(img, S, map, level); return img.data; };
  const p = paint(), q = paint();
  assert.ok(p.every((v, i) => v === q[i]), 'the same pixels twice');
  // each kind alone on a bare room: it paints something, and only on the floor
  const room = new TileMap(['XXXXXXXX', 'X++++++X', 'X++++++X', 'X++++++X', 'X++++++X', 'XXXXXXXX']);
  for (const k of OWN) {
    const lv = { name: 'room', grime: [[k, 3, 3, 3, 3, 1, { at: 'point', to: [5.5 * TILE, 3.6 * TILE] }]] };
    const w = room.w * TILE * S, h = room.h * TILE * S, bare = { width: w, height: h, data: new Uint8ClampedArray(w * h * 4).fill(128) };
    const img = { width: w, height: h, data: new Uint8ClampedArray(w * h * 4).fill(128) };
    const none = { surfaces: { tiles: { floors: ['tile_blue'], marks: [] } } };
    paintWear(bare, S, room, { name: 'room' }, none);
    paintWear(img, S, room, lv, none);
    let n = 0;
    for (let i = 0; i < img.data.length; i += 4) {
      if (img.data[i] === bare.data[i] && img.data[i + 1] === bare.data[i + 1] && img.data[i + 2] === bare.data[i + 2]) continue;
      n++;
      const px = (i / 4) % w, py = Math.floor(i / 4 / w);
      assert.ok(!room.isWallChar(Math.floor(px / (TILE * S)), Math.floor(py / (TILE * S))), `${k} painted a wall`);
    }
    assert.ok(n > 6, `${k} shows (${n} px)`);
  }
});

// a world with just what systems/Seeps.js touches: props, a floor that keeps count of what is poured on it, an air
function world(props, depth = () => 0) {
  const w = { props, poured: [], steam: 0, threads: 0, spills: [], events: { emit: (name, e) => { if (name === 'spill') w.spills.push(e); } } };
  w.liquids = {
    at: (x, y) => { const d = depth(x, y, w); return d > 0 ? { kind: 'water', depth: d } : null; },
    feed: (x, y, area, kind, r) => w.poured.push({ x, y, area, kind, r }),
    ripple: () => {},
  };
  w.smoke = {
    emit: (kind, x, y, rate, dt) => { assert.equal(kind, 'steam'); w.steam += rate * dt; },
    wisp: (o, x, y, dt, every) => { if ((o.wispT = (o.wispT || 0) - dt) <= 0) { o.wispT = every; w.threads++; } },
  };
  return w;
}
const prop = (type, x = 100, y = 100, angle = 0, more = {}) => ({ type, def: PROPS[type], x, y, dead: false, body: { angle, position: { x, y } }, centre: () => ({ x, y }), ...more });
const lcg = (seed = 7) => () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
const run = (s, seconds, dt = 1 / 60) => { for (let t = 0; t < seconds; t += dt) s.update(dt); };

test('seeps: a leaking washer drips at its rate, at its foot, turned with it', () => {
  const D = SEEPS.washer.drip, p = prop('washer', 200, 300, Math.PI, { seep: 'washer' });
  const w = world([p, prop('washer', 400, 300)]), s = new Seeps(w, SEEPS, lcg());
  run(s, 120);
  const mean = (D.every[0] + D.every[1]) / 2, n = w.poured.length;
  assert.ok(n > 120 / D.every[1] - 2 && n < 120 / D.every[0] + 2 && Math.abs(n - 120 / mean) < 12, `${n} drops in two minutes`);
  for (const q of w.poured) {
    assert.equal(q.kind, 'water');
    assert.equal(q.area, D.drop);
    // the machine is turned half round: its foot (+y of the sprite) is toward -y of the world
    assert.ok(Math.abs(q.x - (200 - D.at[0])) < 1e-6 && Math.abs(q.y - (300 - D.at[1])) < 1e-6, `${q.x},${q.y}`);
  }
  assert.equal(s.left(p), Infinity, 'plumbed: it never runs out');
  assert.equal(s.left(w.props[1]), null, 'the next washer of the row does not leak');
});

test('seeps: the drop is held back while the puddle is as deep as it gets, and falls again once it has gone down', () => {
  const D = SEEPS.washer.drip;
  let deep = D.cap + 0.2;
  const w = world([prop('washer', 0, 0, 0, { seep: 'washer' })], () => deep), s = new Seeps(w, SEEPS, lcg());
  run(s, 30);
  assert.equal(w.poured.length, 0, 'nothing poured into a full puddle');
  deep = D.cap - 0.2;
  run(s, 30);
  assert.ok(w.poured.length >= 30 / D.every[1] - 1, 'it drips again');
});

test('seeps: a keg on tap runs flat, and whatever is broken stops for good', () => {
  const D = SEEPS.keg.drip, keg = prop('keg', 50, 50, 0, { seep: 'keg' });
  const w = world([keg]), s = new Seeps(w, SEEPS, lcg());
  run(s, 60);
  assert.ok(w.poured.length > 10 && w.poured.every((q) => q.kind === 'beer'));
  assert.ok(s.left(keg) < D.most && s.left(keg) > 0);
  run(s, (D.most / D.drop) * D.every[1] + 10);
  const total = w.poured.reduce((a, q) => a + q.area, 0);
  assert.ok(Math.abs(total - D.most) < 1e-6, `${total} px2 poured of ${D.most}`);
  assert.equal(s.left(keg), 0, 'empty');
  const n = w.poured.length;
  run(s, 60);
  assert.equal(w.poured.length, n, 'an empty keg drips no more');
  // broken
  const cooler = prop('water_cooler'), w2 = world([cooler]), s2 = new Seeps(w2, SEEPS, lcg());
  run(s2, 30);
  const before = w2.poured.length;
  assert.ok(before > 3, 'the cooler drips by its def');
  cooler.dead = true;
  run(s2, 60);
  assert.equal(w2.poured.length, before, 'destroyed: no drop more');
});

test('seeps: a pot breathes steam and rests, a dryer too, the iron gives a thread; none once its prop is gone', () => {
  const F = SEEPS.pot.fume, oven = prop('oven', 0, 0, 0, { seep: 'pot' });
  const w = world([oven]), s = new Seeps(w, SEEPS, lcg());
  const T = 20 * (F.puff[0] + F.puff[1]);
  run(s, T);
  const on = F.puff[0] / (F.puff[0] + F.puff[1]);
  assert.ok(Math.abs(w.steam / (F.rate * T) - on) < 0.08, `steam ${(w.steam / (F.rate * T)).toFixed(2)} of the time, ${on.toFixed(2)} wanted`);
  oven.dead = true;
  const was = w.steam;
  run(s, 10);
  assert.equal(w.steam, was);
  const bench = prop('repair_bench'), w2 = world([bench, prop('dryer', 300, 0)]), s2 = new Seeps(w2, SEEPS, lcg());
  run(s2, 10);
  assert.ok(Math.abs(w2.threads - 10 / SEEPS.solder.fume.every) < 8, `${w2.threads} points of thread in ten seconds`);
  assert.ok(w2.steam > 0, 'the dryer steams');
  assert.equal(w2.poured.length, 0);
});

test('seeps: a mop bucket shoved slops over the way it goes, less each time, until it is empty; at rest it keeps its water', () => {
  const D = SEEPS.mop_bucket.slosh, b = prop('mop_bucket', 100, 100);
  b.body = Matter.Bodies.circle(100, 100, 6);
  Object.defineProperties(b, { x: { get: () => b.body.position.x }, y: { get: () => b.body.position.y } });
  const w = world([b]), s = new Seeps(w, SEEPS, lcg());
  run(s, 5);
  assert.equal(w.spills.length, 0, 'standing still');
  Matter.Body.setVelocity(b.body, { x: D.speed * 0.5, y: 0 });
  run(s, 1);
  assert.equal(w.spills.length, 0, 'nudged: not a drop');
  Matter.Body.setVelocity(b.body, { x: D.speed * 3, y: 0 });
  s.update(1 / 60);
  assert.equal(w.spills.length, 1);
  const first = w.spills[0];
  assert.equal(first.kind, 'water');
  assert.ok(Math.abs(first.area - D.hold * D.share) < 1e-6 && first.x > 100 && Math.abs(first.a) < 1e-6, 'a share of it, thrown ahead');
  s.update(1 / 60);
  assert.equal(w.spills.length, 1, 'not twice in the same shove');
  run(s, 30);
  const total = w.spills.reduce((a, q) => a + q.area, 0);
  assert.ok(total <= D.hold + 1e-6 && total > D.hold - 1.01, `${total} px2 slopped of ${D.hold}`);
  for (let i = 1; i < w.spills.length; i++) assert.ok(w.spills[i].area <= w.spills[i - 1].area + 1e-9, 'less each time');
  const n = w.spills.length;
  run(s, 10);
  assert.equal(w.spills.length, n, 'empty');
  const dead = prop('mop_bucket'), w2 = world([dead]), s2 = new Seeps(w2, SEEPS, lcg());
  dead.body = Matter.Bodies.circle(0, 0, 6);
  Matter.Body.setVelocity(dead.body, { x: 9, y: 0 });
  dead.dead = true;
  run(s2, 2);
  assert.equal(w2.spills.length, 0, 'a broken bucket slops nothing (its recipe gushed it)');
});

test('seeps: the numbers are small ones (a puddle a step wide, never a flood), every kind a known liquid', () => {
  for (const [name, d] of Object.entries(SEEPS)) {
    assert.ok(d.drip || d.fume || d.slosh, name);
    if (d.drip) {
      assert.ok(LIQUIDS.kinds[d.drip.kind], name);
      assert.ok(d.drip.drop / d.drip.every[0] < 30, `${name}: under 30 px2 a second (a holed keg pours ${DESTRUCTION.keg.leak.rate})`);
      assert.ok(d.drip.cap > LIQUIDS.wet && d.drip.cap <= 2, `${name}: held at a film or two`);
      assert.ok(d.drip.most === null || d.drip.most <= 4 * TILE * TILE, `${name}: it holds four tiles of film at most`);
    }
    if (d.slosh) assert.ok(LIQUIDS.kinds[d.slosh.kind] && d.slosh.hold <= TILE * TILE && d.slosh.share > 0 && d.slosh.share < 1, name);
    if (d.fume) assert.ok(d.fume.kind === 'thread' ? d.fume.every > 0 : d.fume.rate > 0 && d.fume.rate <= 0.5, `${name}: a wisp, not a jet`);
  }
});

test('interiors: a dryer\'s load stays behind its door, the televisions roll, the clock ticks once a second', () => {
  for (let i = 0; i < 400; i++) {
    const q = tumbleAt(i * 0.037, 1.3, i % 3);
    assert.ok(Math.abs(q.x) <= TUMBLE.r + 1e-9 && q.y >= TUMBLE.y && q.y <= TUMBLE.y + TUMBLE.lift + 1e-9, 'in the glass');
    const f = screenAt(i * 0.11, 2.2, i % SCREENS.length);
    assert.ok(f.roll >= 0 && f.roll < 1 && f.channel >= 0 && f.channel < CHANNELS.length);
  }
  assert.notDeepEqual(tumbleAt(1, 0, 0), tumbleAt(1.2, 0, 0));
  assert.ok([0, 1, 2, 3, 4].some((i) => screenAt(3, 1, i).channel !== screenAt(3, 1, 0).channel), 'not all on one channel');
  assert.deepEqual(secondHand(10.1, 3), secondHand(10.9, 3), 'still between two ticks');
  assert.notDeepEqual(secondHand(10.5, 3), secondHand(11.5, 3), 'a step a second');
  assert.deepEqual(secondHand(0.5, 3), secondHand(60.5, 3), 'round in a minute');
  const hand = secondHand(7, 1);
  assert.ok(Math.abs(hand.x) <= 1.7 && Math.abs(hand.y - 0.1) <= 0.9, 'on the face');
});
