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
  for (let i = 0; i < S.N; i++) if ((i % S.w) * C < 10 * TILE) left += S.dep[i]; else right += S.dep[i];
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
  const before = liquids.sim.total(), S = liquids.sim, i = S.index(puddle.x, puddle.y), d = S.dep[i];
  run(liquids, 1);
  assert.equal(S.active.length + S.next.length, 0, 'at rest from the start: asleep');
  assert.equal(S.dep[i], d, 'level: nothing moved');
  for (let t = 0; t < 300; t += 0.5) liquids.update(0.5);
  assert.ok(Math.abs(liquids.sim.total() - before) < 1e-3, 'it does not dry');
  const ch = walker(puddle.x - 4, puddle.y);
  world.chars.push(ch);
  go(liquids, ch, 2, 80);
  assert.equal(prints.length, 0);
});

test('liquids: the petrol on the floor of a lesson room that is set alight; the sprinklers wet a whole room', () => {
  const level = { fires: [[4, 4, 1], [6, 6, 1], [15, 4, 2]], tutorial: { stages: [{}, { spark: 6 }, {}] } };
  const { liquids } = stub({ level });
  liquids.update(1 / 30);
  const S = liquids.sim, k = liquids.names.indexOf('petrol');
  const petrol = (x, y) => S.vol[S.index(x, y) * S.K + k];
  assert.ok(petrol(4 * TILE, 4 * TILE) > 0 && petrol(6 * TILE, 6 * TILE) > 0);
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
