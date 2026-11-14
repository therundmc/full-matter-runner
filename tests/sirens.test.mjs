import { test } from 'node:test';
import assert from 'node:assert/strict';
import { load } from './setup.mjs';

const { SIRENS } = await load('game/Config.js');
const { default: EventBus } = await load('engine/EventBus.js');
const { default: Sirens } = await load('game/systems/Sirens.js');

function stub() {
  const wails = [];
  const world = { events: new EventBus(), sound: (name, x, y, vol, extra) => wails.push({ name, x, vol, ...extra }) };
  return { world, sirens: new Sirens(world), wails };
}
// sec seconds, a shot every `every` s (0: none)
function run(world, sirens, sec, every = 0) {
  let next = 0;
  for (let t = 0; t < sec; t += 1 / 60) {
    if (every && t >= next) { world.events.emit('shot', {}); next += every; }
    sirens.update(1 / 60);
  }
}

test('sirens: a few shots bring nobody, a firefight that drags on does, from two sides, with no place of their own', () => {
  const { world, sirens, wails } = stub();
  run(world, sirens, 10, 2);
  run(world, sirens, SIRENS.linger + 5);
  assert.equal(wails.length, 0);
  assert.equal(sirens.fight, 0, 'forgotten');
  run(world, sirens, SIRENS.after + 1, 3);
  assert.ok(wails.length >= 1 && sirens.level > 0);
  run(world, sirens, 20, 3);
  assert.ok(wails.every((s) => s.name === 'siren' && s.x === undefined));
  assert.ok(wails.some((s) => s.pan < 0) && wails.some((s) => s.pan > 0), 'a second car answers');
  assert.ok(wails.at(-1).vol > wails[0].vol, 'they come up');
});

test('sirens: they hold through a lull and die down once the guns have been silent long enough', () => {
  const { world, sirens, wails } = stub();
  world.events.emit('explosion', {});
  run(world, sirens, SIRENS.after + SIRENS.rise + 2, 2);
  assert.equal(sirens.level, 1);
  run(world, sirens, SIRENS.linger - 2);
  assert.equal(sirens.level, 1, 'still about');
  run(world, sirens, SIRENS.fade + 3);
  assert.equal(sirens.level, 0);
  const n = wails.length;
  run(world, sirens, 20);
  assert.equal(wails.length, n, 'silence');
});
