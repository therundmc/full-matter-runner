import { test } from 'node:test';
import assert from 'node:assert/strict';
import { load } from './setup.mjs';

const { AMBIENCE } = await load('game/Config.js');
const { default: EventBus } = await load('engine/EventBus.js');
const { default: Ambience } = await load('game/systems/Ambience.js');
const { PROPS } = await load('game/data/props.js');
const { META } = await load('audio/Audio.js');

// a player on a floor, props and customers around him; every sound asked for is recorded
function stub(floor = 'sidewalk') {
  const heard = [];
  const world = {
    events: new EventBus(), player: { x: 0, y: 0 }, props: [], civilians: [], floor,
    floorAt() { return this.floor; },
    sound: (name, x, y, vol, opts) => heard.push({ name, x, y, vol, ...opts }),
  };
  const amb = new Ambience(world);
  const run = (sec) => { for (let i = 0; i < sec * 60; i++) amb.update(1 / 60); };
  return { world, amb, heard, run, of: (name) => heard.filter((h) => h.name === name) };
}
const prop = (type, x, y, more = {}) => ({ type, def: PROPS[type], x, y, dead: false, ...more });
const patron = (x, y, state = 'stop') => ({ alive: true, post: {}, x, y, brain: { state } });

test('ambience: the city is heard all the time, in swells that overlap, lower once indoors', () => {
  const s = stub();
  s.run(20);
  const air = s.of('air');
  assert.ok(air.length >= 4, 'a swell every few seconds');
  assert.ok(AMBIENCE.air < META.air.dur, 'each one still sounds when the next starts');
  assert.equal(air[0].inside, 0);
  s.world.floor = 'wood';
  s.run(10);
  assert.ok(s.of('air').at(-1).inside > 0.95, 'the bed has followed him under the roof');
});

test('ambience: what hums close by is heard, the nearest first, not what is broken or without power', () => {
  const s = stub();
  const near = prop('neon_sign_bar', 60, 0), far = prop('vending', 2000, 0), dead = prop('fridge', 30, 0, { dead: true });
  const dark = prop('neon_tube_pink', 40, 0, { unpowered: 3 }), chair = prop('chair', 10, 0);
  s.world.props.push(far, dead, dark, chair, near);
  s.run(1);
  const hum = s.of('hum');
  assert.equal(hum.length, 1);
  assert.deepEqual([hum[0].x, hum[0].kind], [60, 'neon']);
  for (const k of ['fridge', 'vending', 'fuse_box']) assert.ok(PROPS[k].hum, k + ' hums');
});

test('ambience: a leaking pipe drips, and only close by', () => {
  const s = stub();
  s.world.props.push(prop('pipe_water', 100, 0));
  s.run(12);
  const n = s.of('drip').length;
  assert.ok(n >= 3 && n <= 16, 'a drop every second or three: ' + n);
  const t = stub();
  t.world.props.push(prop('pipe_water', 5000, 0));
  t.run(12);
  assert.equal(t.of('drip').length, 0);
});

test('ambience: a room of customers murmurs while they are at ease, from where they sit', () => {
  const s = stub('wood');
  s.world.civilians.push(patron(100, 0));
  s.run(6);
  assert.equal(s.of('walla').length, 0, 'one man alone does not make a room');
  s.world.civilians.push(patron(300, 0), patron(200, 60));
  s.run(6);
  const w = s.of('walla');
  assert.ok(w.length >= 2);
  assert.deepEqual([w[0].x, w[0].y, w[0].n], [200, 20, 3]);
  for (const c of s.world.civilians) c.brain.state = 'panic';
  const before = w.length;
  s.run(6);
  assert.equal(s.of('walla').length, before, 'they have stopped talking');
});

test('ambience: a gust of wind is heard, less from indoors', () => {
  const s = stub();
  s.world.events.emit('gust', { dx: 1, dy: 0, f: 1 });
  s.world.floor = 'wood';
  s.run(10);
  s.world.events.emit('gust', { dx: -1, dy: 0, f: 1 });
  const g = s.of('gust');
  assert.equal(g.length, 2);
  assert.ok(g[1].vol < g[0].vol * 0.5);
  assert.deepEqual([g[0].pan, g[1].pan], [1, -1]);
});
