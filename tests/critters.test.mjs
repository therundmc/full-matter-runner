import { test } from 'node:test';
import assert from 'node:assert/strict';
import { load } from './setup.mjs';

const { TILE, CRITTERS } = await load('game/Config.js');
const { default: EventBus } = await load('engine/EventBus.js');
const { default: Critters } = await load('game/systems/Critters.js');

const { Bodies, Body } = Matter;

// an open lot of 40 x 40 tiles walled in; sounds, noises and blood are recorded
function stub(def) {
  const log = { sound: [], noise: [], blood: 0 };
  const solid = (cx, cy) => cx < 0 || cy < 0 || cx >= 40 || cy >= 40;
  const body = Bodies.circle(0, 0, 8);
  const world = {
    events: new EventBus(), props: [], enemies: [], civilians: [], corpses: [], projectiles: [],
    map: { isSolid: solid, at: () => '.', widthPx: 40 * TILE, heightPx: 40 * TILE },
    player: { alive: true, body, swing: 0, angle: 0, get x() { return body.position.x; }, get y() { return body.position.y; } },
    sound: (name) => log.sound.push(name), noise: (x, y, r) => log.noise.push(r), lineOfSight: () => true,
    particles: { blood: () => log.blood++, chips() {} }, decals: { stampBlood() {} },
  };
  return { world, critters: new Critters(world, def), log };
}
const run = (critters, sec) => { for (let i = 0; i < sec * 60; i++) critters.update(1 / 60); };
const prop = (type, col, row, w = 58, h = 34) => {
  const body = Bodies.rectangle(col * TILE, row * TILE, w, h);
  return { type, body, dead: false, get x() { return body.position.x; }, get y() { return body.position.y; } };
};
const of = (critters, kind, state) => critters.list.filter((c) => c.kind === kind && (!state || c.state === state));

test('critters: a blow on a dumpster sends rats running, only so many live under it, a bullet kills one', () => {
  const { world, critters, log } = stub();
  const d = prop('dumpster', 20, 20);
  world.events.emit('propHit', { prop: prop('crate', 10, 10), x: 0, y: 0 });
  assert.equal(critters.list.length, 0);
  world.events.emit('propHit', { prop: d, x: d.x - 29, y: d.y });
  const n = of(critters, 'rat').length;
  assert.ok(n >= CRITTERS.rat.out[0] && n <= CRITTERS.rat.out[1], `${n} rats`);
  for (let i = 0; i < 6; i++) world.events.emit('propHit', { prop: d, x: d.x, y: d.y });
  const all = of(critters, 'rat').length;
  assert.ok(all >= CRITTERS.rat.nest[0] && all <= CRITTERS.rat.nest[1], `${all} rats in the nest`);
  const at = critters.list.map((c) => [c.x, c.y]);
  run(critters, 1);
  assert.ok(critters.list.every((c, i) => Math.hypot(c.x - at[i][0], c.y - at[i][1]) > 30), 'they run');
  // a round crossing one of them this very step
  const r = critters.list[0];
  world.projectiles.push({ x: r.x + 4, y: r.y + 2, vx: 600, vy: 0 });
  critters.update(1 / 60);
  world.projectiles.length = 0;
  assert.equal(r.state, 'dead');
  assert.ok(log.blood > 0);
  run(critters, 20);
  assert.ok(critters.list.includes(r) && critters.list.every((c) => c.state === 'dead'), 'the others found a hole, the dead one stays');
});

test('critters: a passer-by jumps once when a rat runs by', () => {
  const { world, critters } = stub();
  const d = prop('dumpster', 20, 20);
  let hurried = 0;
  const civ = { alive: true, x: d.x + 20, y: d.y, body: Bodies.circle(0, 0, 8), brain: { panicked: false, bark: null, hurry: () => hurried++ } };
  world.civilians.push(civ);
  world.events.emit('propHit', { prop: d, x: d.x, y: d.y });
  run(critters, 1);
  assert.equal(hurried, 1);
  assert.equal(civ.brain.bark, 'scream');
});

test('critters: pigeons peck about until a shot nearby, or the player running at them, sends them up and away', () => {
  const { world, critters, log } = stub({ pigeons: [[10, 10, 5], [30, 30, 3]] });
  Body.setPosition(world.player.body, { x: 20 * TILE, y: 3 * TILE });
  run(critters, 3);
  assert.equal(of(critters, 'pigeon', 'idle').length, 8);
  assert.ok(of(critters, 'pigeon').every((c) => Math.hypot(c.x - c.hx, c.y - c.hy) < TILE), 'they stay about');
  // a shot too far for the second flock
  world.events.emit('noise', { x: 10 * TILE, y: 12 * TILE, radius: 12 * TILE, type: 'gunshot' });
  run(critters, 0.5);
  assert.equal(of(critters, 'pigeon', 'fly').length, 5);
  assert.equal(of(critters, 'pigeon', 'idle').length, 3);
  assert.deepEqual(log.sound, ['flutter']);
  // the player runs at the others
  Body.setPosition(world.player.body, { x: 28 * TILE, y: 30 * TILE });
  Body.setVelocity(world.player.body, { x: 3, y: 0 });
  run(critters, 0.6);
  assert.equal(of(critters, 'pigeon', 'idle').length, 0);
  run(critters, CRITTERS.pigeon.away + 1);
  assert.equal(critters.list.length, 0, 'gone');
});

test('critters: the cat watches the player, bolts when he walks up and knocks the bin on its way', () => {
  const { world, critters, log } = stub({ cats: [[20, 20]] });
  const bin = prop('trash_can', 20, 17, 15, 15), behind = prop('trash_can', 17, 21, 15, 15);
  world.props.push(bin, behind);
  const cat = critters.list[0];
  // standing close, he does not frighten it
  Body.setPosition(world.player.body, { x: 18.5 * TILE, y: 20 * TILE });
  run(critters, 1);
  assert.equal(cat.state, 'idle');
  assert.ok(Math.abs(Math.abs(cat.a) - Math.PI) < 0.2, 'it looks at him');
  Body.setVelocity(world.player.body, { x: 2, y: 0 });
  critters.update(1 / 60);
  assert.equal(cat.state, 'run');
  assert.equal(cat.bin, bin, 'the one that is not on the side of the fright');
  run(critters, 1);
  assert.ok(Body.getSpeed(bin.body) > 0.5, 'the bin is knocked');
  assert.equal(Body.getSpeed(behind.body), 0);
  assert.deepEqual(log.noise, [CRITTERS.cat.noise * TILE]);
  run(critters, 15);
  assert.equal(critters.list.length, 0, 'gone');
});

test('critters: a blast kills the ones on the ground within its radius; flies over dumpsters and cold bodies', () => {
  const { world, critters } = stub({ pigeons: [[10, 10, 4]], cats: [[18, 14]] });
  Body.setPosition(world.player.body, { x: 35 * TILE, y: 5 * TILE });
  world.events.emit('explosion', { x: 10 * TILE, y: 10 * TILE, radius: 3 * TILE });
  assert.equal(of(critters, 'pigeon', 'dead').length, 4);
  assert.equal(of(critters, 'cat', 'run').length, 1, 'the cat, further off, bolts');
  const d = prop('dumpster', 5, 5), lamp = prop('streetlight', 8, 8);
  world.props.push(d, lamp);
  world.corpses.push({ x: 50, y: 50, age: 3 }, { x: 90, y: 90, age: CRITTERS.flies.cold + 1 });
  const swarms = critters.swarms();
  assert.equal(swarms.length, 2);
  assert.deepEqual([swarms[1].x, swarms[1].y], [90, 90]);
  const lamps = critters.lamps();
  assert.deepEqual([lamps.length, lamps[0].x], [1, lamp.x + CRITTERS.moths.at.streetlight]);
  d.dead = lamp.dead = true;
  assert.equal(critters.swarms().length, 1);
  assert.equal(critters.lamps().length, 0);
});
