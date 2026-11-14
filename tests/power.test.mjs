import { test } from 'node:test';
import assert from 'node:assert/strict';
import { load } from './setup.mjs';

const { TILE } = await load('game/Config.js');
const { default: EventBus } = await load('engine/EventBus.js');
const { default: Power } = await load('game/systems/Power.js');
const { default: Gadgets } = await load('game/systems/Gadgets.js');
const { default: level } = await load('game/data/levels/level1.js');
const { PROPS } = await load('game/data/props.js');

// a house on tiles (14..31, 5..20) with its box on the back wall; a clock, timers, noises and events are recorded
function stub() {
  const at = (type, col, row, more = {}) => ({ type, def: PROPS[type], x: col * TILE, y: row * TILE, dead: false, ...more });
  const box = at('fuse_box', 24.5, 4.92);
  const lamp = at('ceiling_lamp', 20, 14), fan = at('ceiling_fan', 22, 15), juke = at('jukebox', 18, 19);
  const sign = at('neon_sign_bar', 24, 21.09), street = at('streetlight', 10, 25), car = at('wall_lamp', 20, 14, { isVehicle: true });
  const battery = at('emergency_light', 23.6, 12.09);
  const said = [];
  const guard = { alive: true, x: 20 * TILE, y: 13 * TILE, say: (k) => said.push(k) };
  const log = { noise: [], cut: [] };
  const world = {
    time: 0, events: new EventBus(), props: [box, lamp, fan, juke, sign, street, car, battery], enemies: [guard], timers: [],
    player: { x: 18 * TILE, y: 18 * TILE }, walledOff: () => false,
    light() {}, sound() {}, noise: (x, y, r) => log.noise.push(r), after(s, fn) { this.timers.push({ t: this.time + s, fn }); },
  };
  world.events.on('powerCut', (e) => log.cut.push(e));
  const power = new Power(world, { box: [24.5, 4.92], zone: [14, 5, 31, 20] });
  const run = (sec) => {
    for (let i = 0; i < sec * 60; i++) {
      world.time += 1 / 60;
      power.update();
      for (const t of world.timers.splice(0)) (t.t <= world.time ? t.fn() : world.timers.push(t));
    }
  };
  return { world, power, run, box, lamp, fan, juke, sign, street, car, battery, said, log };
}

test('power: the battery lamps stay dark as long as the mains are on', () => {
  const s = stub();
  s.run(1);
  assert.equal(s.power.on, true);
  assert.equal(s.battery.lightsOut, true);
  assert.ok(!s.lamp.lightsOut && !s.sign.lightsOut);
});

test('power: smashing the fuse box stutters the lights, puts them out, then the battery lamps catch', () => {
  const s = stub();
  s.run(0.5);
  s.box.dead = true;
  s.world.events.emit('propDestroyed', { prop: s.box });
  assert.equal(s.power.on, false);
  assert.equal(s.log.noise.length, 1, 'the guards around hear the box go');
  s.run(0.2);
  assert.ok(s.lamp.sputter && !s.lamp.lightsOut, 'a moment of flicker first');
  assert.equal(s.log.cut.length, 0);
  s.run(0.5);
  for (const p of [s.lamp, s.fan, s.juke, s.sign]) assert.ok(p.lightsOut && p.unpowered > 0 && !p.sputter, `${p.type} is dead`);
  assert.equal(s.log.cut.length, 1, 'one powerCut event, when it goes dark');
  assert.equal(s.battery.lightsOut, true, 'not yet');
  s.run(0.6);
  assert.equal(s.battery.lightsOut, false, 'the emergency lighting is on');
  // what is not the house's: the street lamp, a car parked inside the zone
  assert.ok(!s.street.lightsOut && !s.car.lightsOut);
  s.run(2);
  assert.deepEqual(s.said, ['dark'], 'a guard inside says something about it');
});

test('power: another box, or the same one twice, changes nothing', () => {
  const s = stub();
  s.run(0.2);
  s.world.events.emit('propDestroyed', { prop: { type: 'fuse_box', x: 2 * TILE, y: 2 * TILE } });
  assert.equal(s.power.on, true);
  s.world.events.emit('propDestroyed', { prop: s.box });
  s.run(2);
  s.world.events.emit('propDestroyed', { prop: s.box });
  s.run(1);
  assert.equal(s.log.cut.length, 1);
});

test('power: without power the jukebox is silent and no machine answers a blow', () => {
  const s = stub();
  const gadgets = new Gadgets(s.world);
  assert.ok(gadgets.tune() > 0);
  s.world.events.emit('propDestroyed', { prop: s.box });
  s.run(1);
  assert.equal(gadgets.tune(), 0);
  s.world.events.emit('propHit', { prop: s.juke });
  assert.ok(!s.juke.sputter, 'a dead jukebox does not derail');
});

test('power: level 1 hangs the bar on a fuse box in the back lot, with a battery lamp in every room', () => {
  assert.deepEqual(level.power.zone, [14, 5, 31, 20]);
  const [col, row] = level.power.box;
  assert.ok(level.props.some(([type, c, r]) => type === 'fuse_box' && c === col && r === row));
  assert.ok(row < 5, 'on the lot side of the back wall');
  const lamps = level.props.filter(([type]) => type === 'emergency_light');
  // bar room (three), storeroom, toilets, the boss's room, the VIP room
  const rooms = [[15, 12, 24, 19], [15, 12, 30, 15], [15, 6, 19, 10], [21, 6, 23, 10], [25, 6, 30, 10], [26, 17, 30, 19]];
  for (const [c0, r0, c1, r1] of rooms) {
    assert.ok(lamps.some(([, c, r]) => c > c0 - 0.2 && c < c1 + 1.2 && r > r0 - 0.2 && r < r1 + 1.2), `a battery lamp in ${c0},${r0}`);
  }
  assert.ok(PROPS.emergency_light.standby && PROPS.emergency_light.light && PROPS.fuse_box.fixture);
});
