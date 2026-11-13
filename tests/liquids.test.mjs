import { test } from 'node:test';
import assert from 'node:assert/strict';
import { load } from './setup.mjs';

const { LIQUIDS } = await load('game/Config.js');
const { default: EventBus } = await load('engine/EventBus.js');
const { default: Liquids } = await load('game/systems/Liquids.js');

// a world reduced to what the system touches; painting and sounds are recorded
function stub() {
  const prints = [], smears = [], sounds = [];
  const world = {
    events: new EventBus(), corpses: [], chars: [],
    decals: { footprint: (...a) => prints.push(a), smear: (...a) => smears.push(a) },
    particles: { drops() {} },
    sound: (name) => sounds.push(name),
  };
  return { world, liquids: new Liquids(world), prints, smears, sounds };
}
const walker = (x, y) => ({ x, y, alive: true, vaulting: null, slide: null });
// move a character in a straight line, one liquids update per step
function go(liquids, ch, dx, steps) {
  for (let i = 0; i < steps; i++) { ch.x += dx; liquids.update(1 / 60); }
}

test('liquids: a burst hydrant floods the floor around it, then the puddle dries', () => {
  const { world, liquids } = stub();
  world.events.emit('propDestroyed', { prop: { def: { fountain: true } }, x: 100, y: 100 });
  world.events.emit('propDestroyed', { prop: { def: {} }, x: 400, y: 100 });
  let last = 0;
  for (let t = 0; t < 4; t += 0.1) {
    liquids.update(0.1);
    assert.ok(liquids.puddles[0].r >= last, 'it only spreads');
    last = liquids.puddles[0].r;
  }
  assert.equal(liquids.puddles.length, 1, 'one source, one puddle');
  assert.ok(last > 30 && last <= LIQUIDS.hydrant.cap);
  for (let t = 0; t < LIQUIDS.hydrant.dur; t += 0.1) liquids.update(0.1);
  assert.equal(liquids.puddles[0].r, LIQUIDS.hydrant.cap, 'capped');
  assert.equal(liquids.at(100 + LIQUIDS.hydrant.cap * 0.5, 100).kind, 'water');
  assert.equal(liquids.at(100 + LIQUIDS.hydrant.cap + 20, 100), null);
  assert.equal(liquids.grip(110, 100), LIQUIDS.grip);
  assert.equal(liquids.grip(400, 100), 1);
  for (let t = 0; t < LIQUIDS.kinds.water.wet + 1; t += 0.5) liquids.update(0.5);
  assert.equal(liquids.puddles.length, 0, 'dried');
  assert.equal(liquids.grip(110, 100), 1);
});

test('liquids: liquid poured next to a puddle joins it, the number of puddles is capped', () => {
  const { liquids } = stub();
  liquids.feed(0, 0, 2000);
  liquids.feed(10, 5, 2000);
  assert.equal(liquids.puddles.length, 1);
  assert.equal(liquids.puddles[0].area, 4000);
  for (let i = 1; i < 40; i++) liquids.feed(i * 500, 0, 100);
  assert.equal(liquids.puddles.length, LIQUIDS.maxPuddles);
});

test('liquids: blood under a body is wet while it lies there and for a while after it is baked', () => {
  const { world, liquids } = stub();
  const corpse = { pool: 1, dead: false, poolAt: () => ({ x: 50, y: 50 }) };
  world.corpses.push(corpse);
  liquids.update(0.1);
  assert.equal(liquids.at(50, 50), null, 'a few drops wet nothing');
  corpse.pool = 14;
  liquids.update(0.1);
  assert.equal(liquids.at(55, 50).kind, 'blood');
  corpse.dead = true;
  world.corpses.length = 0;
  liquids.update(LIQUIDS.kinds.blood.wet - 1);
  assert.ok(liquids.at(55, 50), 'still wet');
  liquids.update(2);
  assert.equal(liquids.at(55, 50), null, 'dry');
  assert.equal(liquids.pools.size, 0);
});

test('liquids: walking out of blood leaves fading footprints, left and right, a stride apart', () => {
  const { world, liquids, prints, sounds } = stub();
  world.corpses.push({ pool: 14, dead: false, poolAt: () => ({ x: 0, y: 0 }) });
  const dry = walker(-200, 80), wet = walker(-40, 0);
  world.chars.push(dry, wet);
  go(liquids, dry, 2, 200);
  assert.equal(prints.length, 0, 'dry shoes print nothing');
  go(liquids, wet, 2, 400);
  const k = LIQUIDS.kinds.blood;
  assert.equal(prints.length, k.prints);
  assert.ok(sounds.includes('splash'));
  assert.ok(prints.every(([x]) => x > 12), 'only once out of the pool');
  for (let i = 1; i < prints.length; i++) {
    assert.ok(Math.abs(prints[i][0] - prints[i - 1][0] - LIQUIDS.stride) <= 2, 'one stride apart');
    assert.equal(Math.sign(prints[i][1]), -Math.sign(prints[i - 1][1]), 'alternating feet');
    assert.ok(prints[i][4] < prints[i - 1][4], 'fading');
  }
  assert.equal(prints[0][3], k.color);
});

test('liquids: no prints in the air, a slide smears instead, the dead and the gone are forgotten', () => {
  const { world, liquids, prints, smears } = stub();
  liquids.feed(0, 0, 3000);
  const ch = walker(-10, 0);
  world.chars.push(ch);
  go(liquids, ch, 2, 15);
  ch.vaulting = {};
  go(liquids, ch, 2, 30);
  assert.equal(prints.length, 0);
  ch.vaulting = null;
  ch.slide = {};
  go(liquids, ch, 3, 30);
  assert.ok(smears.length > 5 && prints.length === 0);
  // a teleport is not a stride
  ch.slide = null;
  ch.x += 500;
  liquids.update(1 / 60);
  assert.equal(prints.length, 0);
  world.chars.length = 0;
  liquids.update(1 / 60);
  assert.equal(liquids.walkers.size, 0);
});
