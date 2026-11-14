import { test } from 'node:test';
import assert from 'node:assert/strict';
import { load } from './setup.mjs';

const { TILE, ALARM } = await load('game/Config.js');
const { default: EventBus } = await load('engine/EventBus.js');
const { default: Alarms } = await load('game/systems/Alarms.js');
const { Walker, WALKER } = await load('game/ai/Civilians.js');

// a shop on tiles (3..8, 17..19) with its box on the front; sounds, flashes, noises and events are recorded
function stub() {
  const log = { sound: 0, light: 0, noise: [], alarm: [] };
  const box = { type: 'alarm_box', x: 4.87 * TILE, y: 21.1 * TILE, dead: false };
  const world = {
    events: new EventBus(), props: [box], player: { alive: true, x: 0, y: 0 },
    sound: () => log.sound++, light: () => log.light++, noise: (x, y, r) => log.noise.push(r),
  };
  world.events.on('alarm', (e) => log.alarm.push(e));
  const alarms = new Alarms(world, [{ rect: [3, 17, 8, 19], box: [4.87, 21.1] }]);
  return { world, alarms, box, log };
}
const run = (alarms, sec) => { for (let i = 0; i < sec * 60; i++) alarms.update(1 / 60); };

test('alarms: a window of the shop giving sets the bell ringing, one elsewhere does not', () => {
  const { world, alarms, log } = stub();
  world.events.emit('windowBroken', { x: 20 * TILE, y: 20.5 * TILE });
  run(alarms, 2);
  assert.equal(alarms.any, false);
  assert.equal(log.sound, 0);
  world.events.emit('windowBroken', { x: 6.5 * TILE, y: 20.5 * TILE });
  run(alarms, 2);
  assert.equal(alarms.any, true);
  assert.ok(log.sound >= 3 && log.sound <= 5, `one burst per period: ${log.sound}`);
  assert.ok(log.light >= 1 && log.light < log.sound, 'the beacon flashes every other burst');
  assert.ok(log.noise.length >= 1 && log.noise.length < log.sound, 'guards hear it every few bursts');
  assert.equal(log.noise[0], ALARM.reach * TILE);
  assert.equal(log.alarm.length, log.noise.length);
  assert.equal(log.alarm[0].radius, ALARM.shy * TILE);
});

test('alarms: standing on the floor of the closed shop is enough, and it stops by itself', () => {
  const { world, alarms } = stub();
  run(alarms, 1);
  assert.equal(alarms.any, false);
  world.player.x = 5.5 * TILE; world.player.y = 18.5 * TILE;
  run(alarms, 0.1);
  assert.equal(alarms.any, true);
  world.player.x = 0;
  run(alarms, ALARM.duration - 1);
  assert.equal(alarms.any, true);
  run(alarms, 1.5);
  assert.equal(alarms.any, false);
});

test('alarms: the box shot off the wall shuts it up for good', () => {
  const { world, alarms, box, log } = stub();
  world.events.emit('doorBroken', { x: 8.5 * TILE, y: 20.5 * TILE });
  run(alarms, 1);
  assert.equal(alarms.any, true);
  box.dead = true;
  const n = log.sound;
  run(alarms, 1);
  assert.equal(alarms.any, false);
  assert.equal(log.sound, n);
  world.events.emit('wallDestroyed', { cx: 5, cy: 16, x: 5.5 * TILE, y: 16.5 * TILE });
  run(alarms, 1);
  assert.equal(alarms.any, false);
});

test('walkers: near a ringing alarm a passer-by cuts his stop short and walks on faster, a patron stays put', () => {
  const path = [{ x: 0, y: 0 }, { x: 2000, y: 0 }];
  const r = () => 0.5;
  const w = new Walker(path, { r, speed: 40, run: 150 });
  w.stopAt = -1;
  const calm = w.update(1 / 60, 0, 0, {}).speed;
  w.state = WALKER.STOP; w.t = 5;
  w.hurry(4);
  const fast = w.update(1 / 60, 0, 0, {});
  assert.equal(w.state, WALKER.WALK);
  assert.ok(fast.speed > calm * 1.5, `${fast.speed} vs ${calm}`);
  for (let i = 0; i < 5 * 60; i++) w.update(1 / 60, 0, 0, {});
  assert.equal(w.update(1 / 60, 0, 0, {}).speed, calm, 'then back to his pace');
  const patron = new Walker(path, { r, speed: 40, run: 150, post: { activity: 'drink', face: 0 } });
  patron.hurry(4);
  assert.equal(patron.update(1 / 60, 0, 0, {}).speed, 0);
});
