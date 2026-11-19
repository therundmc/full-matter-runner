import { test } from 'node:test';
import assert from 'node:assert/strict';
import { load } from './setup.mjs';

const { TILE, CRITTERS } = await load('game/Config.js');
const { default: EventBus } = await load('engine/EventBus.js');
const { default: Critters } = await load('game/systems/Critters.js');
const { default: TileMap } = await load('game/world/TileMap.js');
const { openAir } = await load('game/systems/Weather.js');
const { default: level1 } = await load('game/data/levels/level1.js');
const { critterFrame } = await load('game/render/CritterArt.js');

const { Bodies, Body } = Matter;

// an open lot of 40 x 40 tiles of asphalt walled in; sounds, noises and blood are recorded
function stub(def) {
  const log = { sound: [], noise: [], blood: 0 };
  const walls = new Set();
  const solid = (cx, cy) => cx < 0 || cy < 0 || cx >= 40 || cy >= 40 || walls.has(cx + ',' + cy);
  const blocked = new Uint8Array(1600), floor = new Array(1600).fill('asphalt');
  const body = Bodies.circle(0, 0, 8);
  const world = {
    events: new EventBus(), props: [], enemies: [], civilians: [], corpses: [], projectiles: [],
    map: {
      isSolid: solid, isWallChar: solid, floor, at: () => '=', widthPx: 40 * TILE, heightPx: 40 * TILE, w: 40, h: 40, blocked,
      walkLine(x0, y0, x1, y1) {
        for (let i = 0; i <= 40; i++) if (solid(Math.floor((x0 + (x1 - x0) * i / 40) / TILE), Math.floor((y0 + (y1 - y0) * i / 40) / TILE))) return false;
        return true;
      },
    },
    player: { alive: true, body, swing: 0, angle: 0, get x() { return body.position.x; }, get y() { return body.position.y; } },
    sound: (name) => log.sound.push(name), noise: (x, y, r) => log.noise.push(r), lineOfSight: () => true,
    particles: { blood: () => log.blood++, chips() {} }, decals: { stampBlood() {} },
  };
  // a wall of tiles: world.map.wall(col, row0, row1)
  world.map.wall = (col, r0, r1) => { for (let r = r0; r <= r1; r++) { walls.add(col + ',' + r); blocked[r * 40 + col] = 1; } };
  // a room's floor laid over the tiles (c0..c1, r0..r1)
  world.map.lay = (name, c0, r0, c1, r1) => { for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) floor[r * 40 + c] = name; };
  return { world, critters: new Critters(world, def), log };
}
const run = (critters, sec) => { for (let i = 0; i < sec * 60; i++) critters.update(1 / 60); };
const prop = (type, col, row, w = 58, h = 34) => {
  const body = Bodies.rectangle(col * TILE, row * TILE, w, h);
  return { type, def: {}, body, dead: false, kick: { x: 0, y: 0, vr: 0 }, get x() { return body.position.x; }, get y() { return body.position.y; } };
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

test('critters: the cat watches the player, bolts when he walks up and rattles the bin on its way without moving it', () => {
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
  assert.ok(Math.hypot(bin.kick.x, bin.kick.y) > 2 && Body.getSpeed(bin.body) === 0, 'the bin rattles where it stands');
  assert.ok(!behind.kick.x && Body.getSpeed(behind.body) === 0);
  assert.deepEqual(log.noise, [CRITTERS.cat.noise * TILE]);
  run(critters, 15);
  assert.equal(critters.list.length, 0, 'gone');
});

// a parked car: 140 x 60 px sprite, so a body of 136 x 56
const car = (col, row, angle = 0) => {
  const body = Bodies.rectangle(col * TILE, row * TILE, 136, 56, { angle });
  return { isVehicle: true, moving: false, exploded: false, burning: false, hp: 24, m: { hp: 24 }, w: 140, h: 60, body, type: 'car',
    get x() { return body.position.x; }, get y() { return body.position.y; } };
};
const scareCat = (world) => {
  Body.setPosition(world.player.body, { x: 19 * TILE, y: 20 * TILE });
  Body.setVelocity(world.player.body, { x: 2, y: 0 });
};

test('critters: scared, the cat runs under the nearest parked car, hides there for good and slips out when the car goes', () => {
  const { world, critters, log } = stub({ cats: [[20, 20]] });
  const near = car(20, 24), far = car(20, 30), bin = prop('trash_can', 20, 17, 15, 15);
  world.props.push(bin, far, near);
  const cat = critters.list[0];
  scareCat(world);
  critters.update(1 / 60);
  assert.equal(cat.car, near, 'the nearest one');
  assert.equal(cat.bin, null);
  run(critters, 2);
  assert.equal(cat.state, 'hide');
  assert.ok(!cat.gone && critters.list.includes(cat));
  assert.ok(Math.abs(cat.x - near.x) < 1 && Math.abs(cat.y - (near.y - 28)) < 1, 'by the middle of the side facing it');
  assert.deepEqual(log.noise, []);
  assert.deepEqual(log.sound, []);
  run(critters, 30);
  assert.equal(cat.state, 'hide', 'it stays');
  // the car drives off: for the next one
  near.moving = true;
  run(critters, 0.1);
  assert.equal(cat.state, 'run');
  assert.equal(cat.car, far);
  near.moving = false;
  run(critters, 4);
  assert.equal(cat.state, 'hide');
  assert.equal(cat.car, far);
  // a shot far off leaves it alone, one close by flushes it; no car left, off the map
  world.events.emit('noise', { x: far.x, y: far.y + 8 * TILE, radius: 20 * TILE, type: 'gunshot' });
  assert.equal(cat.state, 'hide');
  far.exploded = near.exploded = true;
  run(critters, 15);
  assert.equal(critters.list.length, 0, 'no car left: gone');
});

test('critters: a hard hit or a shot close to its car sends the hidden cat out; a burning or exploded car is never chosen', () => {
  const { world, critters } = stub({ cats: [[20, 20]] });
  const a = car(20, 24), b = car(26, 24), wreck = car(20, 22), fire = car(21, 22);
  wreck.exploded = true; fire.burning = true;
  world.props.push(wreck, fire, a, b);
  const cat = critters.list[0];
  scareCat(world);
  critters.update(1 / 60);
  assert.equal(cat.car, a);
  run(critters, 2);
  assert.equal(cat.state, 'hide');
  a.hp -= 2; // a scratch
  run(critters, 1);
  assert.equal(cat.state, 'hide');
  a.hp -= 5;
  run(critters, 0.1);
  assert.equal(cat.car, b, 'hit hard: next car');
  run(critters, 4);
  assert.equal(cat.state, 'hide');
  world.events.emit('noise', { x: b.x, y: b.y + 2 * TILE, radius: 20 * TILE, type: 'gunshot' });
  assert.equal(cat.state, 'run', 'a shot within 3 tiles');
  assert.equal(cat.car, a, 'the other car, hurt but standing, is a fresh shelter');
});

test('critters: a wall between the cat and the car: it goes round it, never through a solid tile, and hides', () => {
  const { world, critters } = stub({ cats: [[20, 20]] });
  world.map.wall(22, 19, 27); // a wall between them, open to the north
  const target = car(26, 24);
  world.props.push(target);
  const cat = critters.list[0];
  scareCat(world);
  critters.update(1 / 60);
  assert.equal(cat.car, target, 'a way exists');
  for (let i = 0; i < 6 * 60 && cat.state === 'run'; i++) {
    critters.update(1 / 60);
    assert.ok(!world.map.isSolid(Math.floor(cat.x / TILE), Math.floor(cat.y / TILE)), 'never in a wall');
  }
  assert.equal(cat.state, 'hide');
  // shut in with no way out: the old run
  const sealed = stub({ cats: [[20, 20]] });
  sealed.world.map.wall(21, 0, 39);
  sealed.world.props.push(car(25, 20));
  scareCat(sealed.world);
  sealed.critters.update(1 / 60);
  assert.equal(sealed.critters.list[0].car, null);
  assert.equal(sealed.critters.list[0].state, 'run');
});

test('critters: with no car in reach the cat bolts as before', () => {
  const { world, critters } = stub({ cats: [[20, 20]] });
  const bin = prop('trash_can', 20, 17, 15, 15), tooFar = car(20, 20 + CRITTERS.cat.car + 2);
  world.props.push(bin, tooFar);
  scareCat(world);
  critters.update(1 / 60);
  const cat = critters.list[0];
  assert.equal(cat.state, 'run');
  assert.equal(cat.car, null);
  assert.equal(cat.bin, bin);
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
  assert.deepEqual([lamps.length, lamps[0].x, lamps[0].n], [1, lamp.x + CRITTERS.moths.at.streetlight[0][0], 3]);
  d.dead = lamp.dead = true;
  assert.equal(critters.swarms().length, 1);
  assert.equal(critters.lamps().length, 0);
});

test('critters: moths turn round the lamps out of doors, at each bulb of a turned lamp, fewer than under a streetlight; gone when it goes dark', () => {
  const { world, critters } = stub({});
  const street = prop('streetlight', 4, 4), strings = prop('string_lights', 10, 10), lamp = prop('wall_lamp', 14, 10), sofa = prop('sofa', 16, 10);
  Body.setAngle(strings.body, Math.PI / 2);
  strings.def = { height: 0.05 };
  world.props.push(street, strings, lamp, sofa);
  const lamps = critters.lamps();
  assert.equal(lamps.length, 4, 'the streetlight, the string lights\' two bulbs, the wall lamp; no sofa');
  const bulbs = lamps.filter((l) => Math.abs(l.x - strings.x) < 1);
  assert.deepEqual(bulbs.map((l) => Math.round(l.y - strings.y)).sort((a, b) => a - b), [-40, 40], 'turned with the lamp');
  for (const l of lamps) assert.ok(l.n >= 1 && l.n <= 3 && l.r > 0);
  assert.equal(bulbs[0].lift, 0.05, 'up round a hung lamp, where it is drawn');
  assert.ok(lamps.filter((l) => l !== lamps[0]).every((l) => l.n <= lamps[0].n && l.r < lamps[0].r));
  lamp.lightsOut = true;
  assert.equal(critters.lamps().length, 3, 'a power cut lets them go');
});

test('critters: no moth under a roof, whatever the lamp', () => {
  const { world, critters } = stub({});
  world.map.lay('wood', 8, 8, 20, 20);
  const kinds = Object.keys(CRITTERS.moths.at);
  kinds.forEach((type, i) => world.props.push(prop(type, 10 + (i % 5) * 2, 10 + Math.floor(i / 5) * 3)));
  assert.equal(critters.lamps().length, 0, 'every kind of lamp, all in the room');
  const out = prop('wall_lamp', 30, 30);
  world.props.push(out);
  critters.lit = null;
  assert.deepEqual(critters.lamps().map((l) => Math.round(l.x)), [out.x], 'the one in the yard has its moths');
});

test('critters: the open air is the street, the yards and the roofs, never a room, be its floor bare concrete', () => {
  const map = new TileMap(level1.tiles), open = openAir(map), at = (c, r) => open[r * map.w + c];
  assert.deepEqual([at(5, 22), at(20, 25), at(12, 10), at(20, 2), at(5, 10), at(21, 34)], [1, 1, 1, 1, 1, 1],
    'sidewalk, road, service alley, back lot, the shop\'s roof, the alley across the street');
  assert.deepEqual([at(18, 14), at(21, 8), at(26, 8), at(5, 18), at(27, 34)], [0, 0, 0, 0, 0], 'bar, toilets, back room, shop, laundromat');
  assert.equal(at(16, 8), 0, 'the store room: concrete, but shut in by walls and doors');
  assert.deepEqual([at(14, 8), at(20, 20), at(5, 20), at(0, 0)], [0, 0, 0, 0], 'doors, windows and walls are no place for a lamp');
  // level 1's moths: none of them round a lamp of the bar
  const lamps = level1.props.filter(([type]) => type in CRITTERS.moths.at);
  const inside = lamps.filter(([, c, r]) => !at(Math.floor(c), Math.floor(r)));
  assert.ok(inside.length > 5 && inside.length < lamps.length, `${inside.length} of ${lamps.length} lamps are indoors`);
});

test('critters: the frame drawn follows the state, and a run cycles faster the faster it goes', () => {
  assert.equal(critterFrame({ kind: 'pigeon', state: 'dead', ph: 0 }, 3), 'pigeon_dead');
  assert.equal(critterFrame({ kind: 'rat', state: 'dead', ph: 0 }, 3), 'rat_dead');
  assert.equal(critterFrame({ kind: 'cat', state: 'idle', ph: 0 }, 3), 'cat_sit');
  assert.equal(critterFrame({ kind: 'cat', state: 'run', low: true, ph: 0 }, 3), 'cat_low');
  const seen = (c, sec, step = 1 / 600) => {
    const out = [];
    for (let t = 0; t < sec; t += step) { const f = critterFrame(c, t); if (f !== out[out.length - 1]) out.push(f); }
    return out;
  };
  const slow = seen({ kind: 'rat', state: 'run', speed: 95, ph: 0 }, 1), fast = seen({ kind: 'rat', state: 'run', speed: 190, ph: 0 }, 1);
  assert.deepEqual(slow.slice(0, 5), ['rat_run0', 'rat_run1', 'rat_run2', 'rat_run1', 'rat_run0'], 'stretched, bunched, stretched');
  assert.ok(Math.abs(fast.length / slow.length - 2) < 0.2, `${fast.length} frames against ${slow.length}`);
  assert.deepEqual(new Set(seen({ kind: 'cat', state: 'run', ph: 1 }, 1)), new Set(['cat_run0', 'cat_run1', 'cat_run2']));
  assert.deepEqual(new Set(seen({ kind: 'pigeon', state: 'fly', ph: 0 }, 1)), new Set(['pigeon_fly0', 'pigeon_fly1', 'pigeon_fly2']));
  const walk = seen({ kind: 'pigeon', state: 'idle', walking: true, ph: 0 }, 1);
  assert.ok(walk.length >= 7 && walk.every((f) => f.startsWith('pigeon_walk')), 'a few bobs of the head a second');
  const idle = seen({ kind: 'pigeon', state: 'idle', ph: 0 }, 6);
  assert.ok(idle.includes('pigeon_peck') && idle.includes('pigeon_idle'), 'standing, it pecks now and then');
});
