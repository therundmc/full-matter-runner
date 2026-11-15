import { test } from 'node:test';
import assert from 'node:assert/strict';
import { load } from './setup.mjs';

const { GADGETS } = await load('game/Config.js');
const { default: EventBus } = await load('engine/EventBus.js');
const { default: Gadgets } = await load('game/systems/Gadgets.js');

function stub() {
  const log = { sounds: [], lights: 0, sparks: 0, later: [] };
  const world = {
    events: new EventBus(), time: 0,
    particles: { sparks: () => log.sparks++ },
    sound: (name) => log.sounds.push(name), light: () => log.lights++,
    after: (sec, fn) => log.later.push([world.time + sec, fn]),
  };
  return { world, log };
}

test('gadgets: the jukebox is heard from close, less behind a wall, and not at all once it is knocked off its record', () => {
  const { world } = stub();
  const gadgets = new Gadgets(world);
  const juke = { type: 'jukebox', x: 100, y: 0 };
  let wall = false;
  Object.assign(world, { props: [juke, { type: 'arcade', x: 0, y: 0 }], player: { x: 60, y: 0 }, walledOff: () => wall });
  const near = gadgets.tune();
  assert.ok(near > 0.7 && near <= 1);
  world.player.x = 100 - GADGETS.jukebox.reach * 0.6;
  const far = gadgets.tune();
  assert.ok(far > 0 && far < near * 0.5);
  wall = true;
  assert.ok(Math.abs(gadgets.tune() - far * GADGETS.jukebox.muffled) < 1e-9);
  world.player.x = 100 - GADGETS.jukebox.reach * 1.2;
  assert.equal(gadgets.tune(), 0, 'out of reach');
  world.player.x = 60;
  juke.sputter = true;
  assert.equal(gadgets.tune(), 0);
});

test('gadgets: the arcade rings when hit or bumped hard, not twice at once nor with its screen out; the jukebox derails once then goes dark', () => {
  const { world, log } = stub();
  new Gadgets(world);
  const arcade = { type: 'arcade', x: 0, y: 0 }, juke = { type: 'jukebox', x: 50, y: 0 };
  world.events.emit('propHit', { prop: arcade });
  world.events.emit('propHit', { prop: arcade });
  assert.deepEqual(log.sounds, ['ding']);
  assert.equal(log.lights, 1);
  world.time = GADGETS.arcade.gap + 0.1;
  world.events.emit('impact', { a: { entity: arcade }, b: {}, speed: GADGETS.arcade.bump - 0.5 });
  assert.equal(log.sounds.length, 1, 'a brush is not a bump');
  world.events.emit('impact', { a: {}, b: { entity: arcade }, speed: GADGETS.arcade.bump + 1 });
  assert.equal(log.sounds.length, 2);
  arcade.lightsOut = true;
  world.time += 5;
  world.events.emit('propHit', { prop: arcade });
  assert.equal(log.sounds.length, 2, 'dead screen, no bell');
  // walking into the jukebox does nothing, a blow does
  world.events.emit('impact', { a: { entity: juke }, b: {}, speed: 9 });
  assert.ok(!juke.sputter);
  world.events.emit('propHit', { prop: juke });
  world.events.emit('propHit', { prop: juke });
  assert.deepEqual(log.sounds.slice(2), ['derail']);
  assert.ok(juke.sputter && !juke.lightsOut);
  assert.equal(log.later.length, 1);
  log.later[0][1]();
  assert.ok(juke.lightsOut && log.sparks === 1);
  // a blow that caves its glass in at once does not spare the record
  const dark = { type: 'jukebox', x: 0, y: 0, lightsOut: true };
  world.events.emit('propHit', { prop: dark });
  assert.equal(log.sounds.at(-1), 'derail');
  assert.ok(dark.sputter);
});
