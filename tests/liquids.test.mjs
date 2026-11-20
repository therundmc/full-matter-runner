// What is wet on the floor (systems/Liquids.js over engine/physics/Shallow.js): sources and spills, walls, doors and
// furniture holding it, the bodies' blood, the rain's puddles, the lesson's petrol, grip, footprints and smears.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { load } from './setup.mjs';

const { TILE } = await load('game/Config.js');
const { LIQUIDS } = await load('game/data/liquids.js');
const { default: EventBus } = await load('engine/EventBus.js');
const { default: TileMap } = await load('game/world/TileMap.js');
const { default: Liquids } = await load('game/systems/Liquids.js');
const { seeded } = await load('engine/math.js');

// two rooms of wood floor, a wall between them at column 10 with a doorway at row 5
const ROWS = [
  '####################',
  '#.........#........#',
  '#.........#........#',
  '#.........#........#',
  '#.........#........#',
  '#.........D........#',
  '#.........#........#',
  '#.........#........#',
  '#.........#........#',
  '####################',
];

// a world reduced to what the system touches; painting and sounds are recorded
function stub(more = {}) {
  const prints = [], smears = [], sounds = [];
  const world = {
    map: new TileMap(ROWS), level: {}, events: new EventBus(), corpses: [], chars: [], doors: [], props: [],
    decals: { footprint: (...a) => prints.push(a), smear: (...a) => smears.push(a) },
    particles: { drops() {} },
    sound: (name) => sounds.push(name),
    ...more,
  };
  return { world, liquids: new Liquids(world), prints, smears, sounds };
}
const walker = (x, y) => ({ x, y, alive: true, vaulting: null, slide: null });
const run = (liquids, s, dt = 1 / 30) => { for (let t = 0; t < s; t += dt) liquids.update(dt); };
// move a character in a straight line, one liquids update per step
function go(liquids, ch, dx, steps) {
  for (let i = 0; i < steps; i++) { ch.x += dx; liquids.update(1 / 60); }
}
// mm of liquid in the left and right rooms
function rooms(liquids) {
  const S = liquids.sim, C = LIQUIDS.cell;
  let left = 0, right = 0;
  for (let i = 0; i < S.N; i++) if ((i % S.w) * C < 10 * TILE) left += S.depth(i); else right += S.depth(i);
  return { left, right };
}
const shut = (x) => ({ hx: x, hy: 5 * TILE, a0: Math.PI / 2, len: TILE, locked: false, body: { angle: Math.PI / 2 } });

test('liquids: a burst hydrant floods the floor, the walls hold it, it dries', () => {
  const { world, liquids } = stub();
  world.events.emit('propDestroyed', { prop: { def: { fountain: true } }, x: 5 * TILE, y: 3 * TILE });
  world.events.emit('propDestroyed', { prop: { def: {} }, x: 15 * TILE, y: 3 * TILE });
  run(liquids, 1);
  const early = rooms(liquids).left;
  run(liquids, LIQUIDS.hydrant.dur);
  assert.ok(rooms(liquids).left > early * 3, 'it pours as long as it gushes');
  assert.equal(liquids.at(5 * TILE, 3 * TILE).kind, 'water');
  assert.ok(liquids.at(5 * TILE, 5 * TILE) && liquids.at(2.5 * TILE, 3 * TILE), 'metres round it are wet');
  assert.ok(liquids.grip(5 * TILE, 3 * TILE) < 1 && liquids.grip(5 * TILE, 3 * TILE) >= LIQUIDS.kinds.water.grip - 1e-6);
  assert.equal(liquids.at(10.5 * TILE, 3 * TILE), null, 'not in the wall');
  for (let t = 0; t < 600; t += 0.5) liquids.update(0.5);
  assert.equal(liquids.sim.total(), 0, 'dry');
  assert.equal(liquids.at(5 * TILE, 3 * TILE), null);
  assert.equal(liquids.grip(5 * TILE, 3 * TILE), 1);
});

test('liquids: a shut door holds a flood, opened it lets it through', () => {
  const door = shut(10 * TILE + 2);
  const { world, liquids } = stub({ doors: [] });
  world.doors.push(door);
  world.events.emit('spill', { x: 7 * TILE, y: 5 * TILE, kind: 'water', area: 120000, dur: 3 }); // over a film deep
  run(liquids, 6);
  assert.equal(rooms(liquids).right, 0, 'held');
  door.body.angle = 0; // swung open
  run(liquids, 6);
  assert.ok(rooms(liquids).right > 5, `through: ${rooms(liquids).right}`);
});

test('liquids: what stands on the floor (a counter) holds it; gone, it does not', () => {
  const { Bodies } = Matter;
  const body = Bodies.rectangle(5 * TILE, 5 * TILE, 8 * TILE, 12, { isStatic: true });
  const counter = { type: 'bar_counter', def: { static: true }, body, dead: false };
  const { world, liquids } = stub();
  world.props.push(counter);
  world.events.emit('spill', { x: 5 * TILE, y: 3 * TILE, kind: 'beer', area: 60000, dur: 10 });
  run(liquids, 5);
  assert.ok(liquids.at(5 * TILE, 4 * TILE), 'beer before the counter');
  assert.equal(liquids.at(5 * TILE, 5 * TILE), null, 'none under it');
  assert.equal(liquids.at(5 * TILE, 7 * TILE), null, 'none behind it');
  counter.dead = true;
  run(liquids, 10);
  assert.ok(liquids.at(5 * TILE, 6 * TILE), 'runs on once it is gone');
});

test('liquids: spills at once and over time; a jet throws it on; kinds keep their own name and grip', () => {
  const { world, liquids } = stub();
  world.events.emit('spill', { x: 3 * TILE, y: 3 * TILE, kind: 'booze', area: 300 });
  assert.equal(liquids.at(3 * TILE, 3 * TILE)?.kind, 'booze', 'at once');
  world.events.emit('spill', { x: 13 * TILE, y: 2 * TILE, kind: 'beer', area: 8000, dur: 4, a: Math.PI / 2 });
  run(liquids, 1);
  const k = liquids.names.indexOf('beer'), a = liquids.sim.total(k);
  run(liquids, 2);
  assert.ok(liquids.sim.total(k) > a * 1.5, 'it keeps pouring');
  run(liquids, 3);
  const z = liquids.at(13 * TILE, 3.2 * TILE);
  assert.ok(z?.kind === 'beer' && z.slip, 'thrown down along the jet: slick beer');
  assert.ok(liquids.grip(13 * TILE, 3.2 * TILE) < liquids.grip(3 * TILE, 3 * TILE), 'beer grips less than spirits');
});

test('liquids: a body bleeds into the floor; the blood sets, is handed over as a stain, and stops being wet', () => {
  const { world, liquids } = stub();
  const corpse = { pool: 0, poolMax: 14, poolPos: null, poolAt: () => ({ x: 4 * TILE, y: 4 * TILE }) };
  world.corpses.push(corpse);
  corpse.pool = 2;
  run(liquids, 0.5);
  assert.equal(liquids.sim.total(), 0, 'not before it lies still');
  corpse.poolPos = { x: 4 * TILE, y: 4 * TILE };
  for (let r = 2; r <= 14; r += 0.5) { corpse.pool = r; liquids.update(1 / 30); }
  const b = liquids.names.indexOf('blood');
  const want = Math.PI * 14 * 14 / (LIQUIDS.cell ** 2) * LIQUIDS.kinds.blood.film * LIQUIDS.fill;
  assert.ok(Math.abs(liquids.sim.total(b) - want) < want * 0.01, 'as much as its pool');
  run(liquids, 3);
  assert.equal(liquids.at(4 * TILE, 4 * TILE)?.kind, 'blood');
  world.corpses.length = 0; // baked into the floor: the blood stays
  run(liquids, 1);
  assert.ok(liquids.at(4 * TILE, 4 * TILE), 'still wet');
  for (let t = 0; t < LIQUIDS.kinds.blood.age + 2; t += 0.5) liquids.update(0.5);
  assert.equal(liquids.at(4 * TILE, 4 * TILE), null, 'set');
  assert.ok(liquids.stained.length > 5, 'left as a stain');
  assert.equal(liquids.bled.size, 0, 'the gone body forgotten');
});

test('liquids: walking out of blood leaves fading footprints, left and right, a stride apart', () => {
  const { world, liquids, prints } = stub();
  world.events.emit('spill', { x: 4 * TILE, y: 4 * TILE, kind: 'blood', area: 500 });
  run(liquids, 2);
  const dry = walker(2 * TILE, 7.5 * TILE), wet = walker(4 * TILE, 4 * TILE);
  world.chars.push(dry, wet);
  go(liquids, dry, 2, 100);
  assert.equal(prints.length, 0, 'dry shoes print nothing');
  go(liquids, wet, 2, 200);
  const k = LIQUIDS.kinds.blood;
  assert.equal(prints.length, k.prints);
  for (let i = 1; i < prints.length; i++) {
    assert.ok(Math.abs(prints[i][0] - prints[i - 1][0] - LIQUIDS.stride) <= 2, 'one stride apart');
    assert.equal(Math.sign(prints[i][1] - 4 * TILE), -Math.sign(prints[i - 1][1] - 4 * TILE), 'alternating feet');
    assert.ok(prints[i][4] < prints[i - 1][4], 'fading');
  }
  assert.equal(prints[0][3], k.color);
});

test('liquids: splashing through water, no prints in the air, a slide smears, the gone are forgotten', () => {
  const { world, liquids, prints, smears, sounds } = stub();
  world.events.emit('spill', { x: 4 * TILE, y: 4 * TILE, kind: 'water', area: 6000 });
  run(liquids, 2);
  const ch = walker(3 * TILE, 4 * TILE);
  world.chars.push(ch);
  go(liquids, ch, 2, 15);
  assert.ok(sounds.includes('splash'), 'feet splash through water');
  ch.x = 8 * TILE; liquids.update(1 / 60); // a teleport is not a stride
  ch.vaulting = {};
  go(liquids, ch, -2, 30);
  ch.vaulting = null;
  assert.equal(prints.length, 0);
  ch.x = 4 * TILE; liquids.update(1 / 60);
  ch.slide = {};
  go(liquids, ch, 3, 60);
  assert.ok(smears.length > 3 && prints.length === 0, 'smeared');
  world.chars.length = 0;
  liquids.update(1 / 60);
  assert.equal(liquids.walkers.size, 0);
});

test('liquids: the rain lies in hollows of the open ground, at rest, never dries, marks no sole', () => {
  const puddle = { x: 5 * TILE, y: 4 * TILE, r: 18, squash: 0.7, lobes: [{ a: 0, d: 0.5, s: 0.4 }, { a: 2, d: 0.4, s: 0.5 }] };
  const { world, liquids, prints } = stub({ weather: { puddles: [puddle] } });
  liquids.update(1 / 30);
  const z = liquids.at(puddle.x, puddle.y);
  assert.equal(z?.kind, 'rain');
  const before = liquids.sim.total(), S = liquids.sim, i = S.index(puddle.x, puddle.y), d = S.depth(i);
  run(liquids, 1);
  assert.equal(S.active.length + S.next.length, 0, 'at rest from the start: asleep');
  assert.equal(S.depth(i), d, 'level: nothing moved');
  for (let t = 0; t < 300; t += 0.5) liquids.update(0.5);
  assert.ok(Math.abs(liquids.sim.total() - before) < 1e-3, 'it does not dry');
  const ch = walker(puddle.x - 4, puddle.y);
  world.chars.push(ch);
  go(liquids, ch, 2, 80);
  assert.equal(prints.length, 0);
});

test('liquids: the petrol poured in trails lies along them; the sprinklers wet a whole room', () => {
  const level = { petrol: [[10, [4, 4], [6, 6]], [14, [9, 4]]] };
  const { liquids } = stub({ level });
  liquids.update(1 / 30);
  const S = liquids.sim, k = liquids.names.indexOf('petrol');
  const petrol = (x, y) => { const a = S.addr(S.index(x, y)); return a < 0 ? 0 : S.vol[a * S.K + k]; };
  assert.ok(petrol(4 * TILE, 4 * TILE) > 0 && petrol(5 * TILE, 5 * TILE) > 0 && petrol(6 * TILE, 6 * TILE) > 0, 'all along the trail');
  assert.ok(petrol(9 * TILE, 4 * TILE) > 0, 'a pool');
  assert.equal(petrol(15 * TILE, 4 * TILE), 0, 'not where nobody poured any');
  const { liquids: room } = stub();
  for (let t = 0; t < 10; t += 1 / 30) room.sprinkle(15 * TILE, 5 * TILE, 56, 520 / 30);
  run(room, 2);
  let wet = 0;
  let spots = 0;
  for (let y = -1.5; y <= 1.5; y += 0.5) {
    for (let x = -1.5; x <= 1.5; x += 0.5) {
      if (Math.hypot(x, y) * TILE > 48) continue;
      spots++;
      if (room.at((15 + x) * TILE, (5 + y) * TILE)) wet++;
    }
  }
  assert.ok(wet >= spots * 0.7, `${wet} of ${spots} spots wet`);
});

test('liquids: a pool of blood against a wall is drawn short of it (LIQUIDS.look.gap)', async () => {
  const { default: LiquidArt } = await load('game/render/LiquidArt.js');
  // the drawing's buffers only: pixels in arrays
  const ctx = { createImageData: (w, h) => ({ data: new Uint8ClampedArray(w * h * 4), width: w, height: h }), putImageData() {}, drawImage() {} };
  globalThis.document = { createElement: () => ({ width: 0, height: 0, getContext: () => ctx }) };
  try {
    const { world, liquids } = stub();
    world.events.emit('spill', { x: 9 * TILE, y: 3 * TILE, kind: 'blood', area: 9000 });
    run(liquids, 2);
    const S = liquids.sim, px = LIQUIDS.look.px, face = 10 * TILE;
    assert.ok(LIQUIDS.look.gap >= 2);
    assert.ok(S.depthAt(face - 2, 3 * TILE) > 0, 'the blood is right up against the wall');
    const art = new LiquidArt(world);
    art.setup(S);
    // every chunk painted, its patch laid into one picture of the map
    const map = new Uint32Array(art.TW * art.TH), P = art.patch;
    for (let c = 0; c < S.cw * S.ch; c++) {
      const [x, y, w, h] = art.fill(c);
      for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) map[(y + j) * art.TW + x + i] = P.color.px[j * P.w + i];
    }
    const at = (x, y) => map[Math.floor(y / px) * art.TW + Math.floor(x / px)];
    let near = 0, open = 0;
    for (let y = 2 * TILE; y < 4 * TILE; y += px) {
      for (let x = face - 2; x < face + TILE; x += px) if (at(x + 0.5, y + 0.5)) near++;
      if (at(face - 12, y + 0.5)) open++;
    }
    assert.equal(near, 0, 'nothing drawn on the wall nor within the gap');
    assert.ok(open > 0, 'drawn on the floor by it');
  } finally { delete globalThis.document; }
});

test('liquids: a pool of water is a film on the floor (puddle_neon): its fringe in a dark tone, a glint here and there on its lit edge, never a pale line round it', async () => {
  const { default: LiquidArt } = await load('game/render/LiquidArt.js');
  const ctx = { createImageData: (w, h) => ({ data: new Uint8ClampedArray(w * h * 4), width: w, height: h }), putImageData() {}, drawImage() {} };
  globalThis.document = { createElement: () => ({ width: 0, height: 0, getContext: () => ctx }) };
  try {
    const { world, liquids } = stub();
    world.events.emit('spill', { x: 5 * TILE, y: 5 * TILE, kind: 'water', area: 9000 });
    run(liquids, 2);
    const S = liquids.sim, art = new LiquidArt(world);
    art.setup(S);
    const seen = new Map();
    for (let c = 0; c < S.cw * S.ch; c++) {
      const [, , w, h] = art.fill(c), P = art.patch;
      for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) { const v = P.color.px[j * P.w + i]; if (v) seen.set(v, (seen.get(v) || 0) + 1); }
    }
    const rgba = (v) => [v & 255, (v >> 8) & 255, (v >> 16) & 255, (v >>> 24) / 255];
    const L = LIQUIDS.look.kinds.water, rim = L.rim.match(/[\d.]+/g).map(Number), isRim = (c) => c[0] === rim[0] && c[2] === rim[2];
    let rims = 0, all = 0;
    for (const [v, n] of seen) {
      const c = rgba(v);
      all += n;
      if (isRim(c)) { rims += n; continue; }
      assert.ok(c[0] + c[1] + c[2] < 3 * 40, `only dark tones on the floor (${c})`);
    }
    assert.ok(all > 0 && rims > 0, 'some glints on its lit edge');
    assert.ok(rims < all * 0.05, `a glint here and there, not a line round it (${rims} of ${all})`);
    for (const kind of ['water', 'rain']) {
      const K = LIQUIDS.look.kinds[kind];
      assert.ok(!K.sky && !K.glint && K.rimAt > 0 && K.rag < 1, `${kind}: no sky, no glint inside, a broken rim, a calm edge`);
    }
    for (const kind of ['blood', 'beer', 'petrol']) assert.ok(LIQUIDS.look.kinds[kind].rag === undefined && LIQUIDS.look.kinds[kind].rimAt === undefined, `${kind} keeps its look`);
  } finally { delete globalThis.document; }
});

test('liquids: the wet floor is painted into a window round the view, not a map-sized buffer; it follows the view', async () => {
  const { default: LiquidArt } = await load('game/render/LiquidArt.js');
  const puts = [];
  const ctx = {
    createImageData: (w, h) => ({ data: new Uint8ClampedArray(w * h * 4), width: w, height: h }),
    putImageData: (img, x, y) => puts.push([x, y]), drawImage() {}, clearRect() {}, save() {}, restore() {},
  };
  globalThis.document = { createElement: () => ({ width: 0, height: 0, getContext: () => ctx }) };
  try {
    const rows = ['#'.repeat(120)];
    for (let r = 0; r < 8; r++) rows.push('#' + '.'.repeat(118) + '#');
    rows.push('#'.repeat(120));
    const { world, liquids } = stub({ map: new TileMap(rows) });
    world.events.emit('spill', { x: 5 * TILE, y: 4 * TILE, kind: 'water', area: 600 });
    world.events.emit('spill', { x: 110 * TILE, y: 4 * TILE, kind: 'beer', area: 600 });
    run(liquids, 1);
    world.liquids = liquids;
    const art = new LiquidArt(world), px = LIQUIDS.look.px;
    art.draw(ctx, { x0: 0, y0: 0, x1: 12 * TILE, y1: 9 * TILE });
    const W = art.win, span = (16 * LIQUIDS.cell) / px;
    assert.ok(art.shown && puts.length > 0, 'the near spill painted');
    assert.ok(W.color.c.width < art.TW / 4, `a window, not the map: ${W.color.c.width} of ${art.TW} texels`);
    assert.ok(puts.every(([x, y]) => x >= 0 && y >= 0 && x < W.color.c.width && y < W.color.c.height), 'into the window');
    const seen = [...art.drawn].filter((v) => v >= 0).length;
    puts.length = 0;
    art.draw(ctx, { x0: 106 * TILE, y0: 0, x1: 118 * TILE, y1: 9 * TILE });
    assert.ok(art.win.ox * span * px > 90 * TILE, 'set again round the far view');
    assert.ok(art.shown && puts.length > 0, 'the far spill painted into it');
    assert.ok([...art.drawn].filter((v) => v >= 0).length <= seen + 40, 'what left the window is to be painted afresh');
    art.dispose();
    assert.equal(art.win, null);
  } finally { delete globalThis.document; }
});

// the floor's bumps as systems/Liquids.js makes them (a copy: the reference below lays the whole map with it)
function bumps(R) {
  const N = 64, lat = Float32Array.from({ length: N * N }, R);
  const at = (x, y) => lat[(y & (N - 1)) * N + (x & (N - 1))];
  return (x, y) => {
    const i = Math.floor(x), j = Math.floor(y), u = x - i, v = y - j, su = u * u * (3 - 2 * u), sv = v * v * (3 - 2 * v);
    const a = at(i, j) + (at(i + 1, j) - at(i, j)) * su, b = at(i, j + 1) + (at(i + 1, j + 1) - at(i, j + 1)) * su;
    return a + (b - a) * sv;
  };
}

test('liquids: a chunk of the sparse grid gets the floor the whole map was laid with (bumps, camber, manholes), made early or late', () => {
  // a street: pavements, a wide road with a line, manholes; a wall row on top and at the bottom
  const rows = ['#'.repeat(60)];
  for (let r = 1; r < 18; r++) rows.push(r < 4 || r > 14 ? 's'.repeat(60) : r === 9 ? '-'.repeat(60) : '='.repeat(60));
  rows.push('#'.repeat(60));
  const level = { name: 'street', street: { manholes: [[20, 8], [41.5, 12]] } };
  const map = new TileMap(rows);
  const { liquids } = stub({ map, level });
  const S = liquids.sim, C = LIQUIDS.cell;
  // the floor as it was laid over the whole grid at once (the camber: a breadth-first count over all of it)
  const N = S.w * S.h, z = new Float32Array(N), soak = new Float32Array(N), isRoad = new Uint8Array(N), F = LIQUIDS.floors, rf = LIQUIDS.relief;
  const R = seeded(7411 + level.name.length), broad = bumps(R), fine = bumps(R), road = new Set(LIQUIDS.road.floors);
  for (let gy = 0; gy < S.h; gy++) {
    for (let gx = 0; gx < S.w; gx++) {
      const i = gy * S.w + gx, tx = Math.floor((gx * C) / TILE), ty = Math.floor((gy * C) / TILE);
      const name = tx < map.w && ty < map.h ? map.floor[ty * map.w + tx] : null, f = F[name] || F.concrete;
      const bump = broad(gx / rf.size, gy / rf.size) * rf.share + fine(gx / rf.fine + 31, gy / rf.fine + 17) * (1 - rf.share);
      z[i] = f.z + (bump - 0.5) * 2 * f.rough; soak[i] = f.soak;
      if (road.has(name)) isRoad[i] = 1;
    }
  }
  const dist = new Int32Array(N).fill(-1), queue = new Int32Array(N);
  let head = 0, tail = 0;
  for (let i = 0; i < N; i++) if (!isRoad[i]) { dist[i] = 0; queue[tail++] = i; }
  while (head < tail) {
    const i = queue[head++], x = i % S.w;
    for (const j of [x > 0 ? i - 1 : -1, x < S.w - 1 ? i + 1 : -1, i - S.w, i + S.w]) {
      if (j < 0 || j >= N || dist[j] >= 0) continue;
      dist[j] = dist[i] + 1; queue[tail++] = j;
    }
  }
  for (let i = 0; i < N; i++) if (isRoad[i]) z[i] += Math.min(LIQUIDS.road.max, dist[i] * LIQUIDS.road.camber);
  const d = LIQUIDS.drain;
  for (const [c, r] of level.street.manholes) {
    const x = c * TILE, y = r * TILE;
    for (let gy = Math.floor((y - d.r) / C); gy <= Math.floor((y + d.r) / C); gy++) {
      for (let gx = Math.floor((x - d.r) / C); gx <= Math.floor((x + d.r) / C); gx++) {
        if (Math.hypot((gx + 0.5) * C - x, (gy + 0.5) * C - y) <= d.r) { soak[gy * S.w + gx] += d.soak; z[gy * S.w + gx] -= d.dip; }
      }
    }
  }
  liquids.feed(20 * TILE, 8 * TILE, 400, 'water'); // a few chunks made early, the rest late
  run(liquids, 0.5);
  assert.ok(S.count > 0 && S.count < S.cw * S.ch, 'made only where something ran');
  let bad = 0;
  for (let i = 0; i < N; i++) { const a = S.cellOf(i); if (S.z[a] !== z[i] || S.soak[a] !== soak[i]) bad++; }
  assert.equal(bad, 0, `${bad} cells laid otherwise`);
});

test('liquids: the grid is made where something is wet and let go once it has dried; a shut door still holds when made again', () => {
  const { world, liquids } = stub();
  const S = liquids.sim;
  world.doors.push(shut(10 * TILE));
  liquids.update(1 / 30);
  const door = S.index(10 * TILE, 5 * TILE + 8);
  assert.equal(S.solidAt(door), 1, 'the door holds');
  world.events.emit('spill', { x: 4 * TILE, y: 3 * TILE, kind: 'water', area: 300 });
  run(liquids, 2);
  assert.ok(S.count > 0);
  for (let t = 0; t < 900 && S.total() > 0; t += 0.5) liquids.update(0.5);
  run(liquids, LIQUIDS.sweep + 1, 0.5);
  assert.equal(S.total(), 0);
  assert.equal(S.count, 0, 'all let go');
  assert.equal(S.solidAt(door), 1, 'the door still holds');
  S.cellOf(door);
  assert.equal(S.solidAt(door), 1, 'made again: the door holds');
  assert.equal(S.solidAt(S.index(10 * TILE + 8, 2 * TILE)), 1, 'and the wall');
});
