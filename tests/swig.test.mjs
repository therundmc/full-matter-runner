import { test } from 'node:test';
import assert from 'node:assert/strict';
import { load } from './setup.mjs';

const { default: Opening } = await load('game/systems/Opening.js');
const { default: Direction } = await load('game/systems/Direction.js');
const { default: Player } = await load('game/entities/Player.js');
const { SHOTS } = await load('game/data/staging.js');
const { GESTURE } = await load('game/data/feel.js');
const { PLAYER } = await load('game/Config.js');

// a player sat against a wall facing +x, a wall 120 px ahead, and the bottle's swig run on him (Player.updateSwig)
function sat() {
  const later = [];
  const world = {
    map: { solidAt: (x) => x >= 220 }, sound() {}, addDebris() {}, removeDebris() {},
    after: (s, fn) => later.push(fn), particles: { glass() {} }, decals: { smear() {} }, critters: null,
  };
  const p = { x: 100, y: 50, angle: 0, sit: 1, rising: false, swig: { t: 0, thrown: false, go: false }, world };
  return { p, later, swig: (dt, key = false) => Player.prototype.updateSwig.call(p, dt, key) };
}

test('opening: close on him while he drinks, toward where the bottle breaks once thrown, then the view given back', () => {
  const { p, later, swig } = sat(), o = new Opening(p), T = GESTURE.swig;
  assert.deepEqual(o.shot(), { name: 'swig' });
  while (p.swig.t < T.throw - 0.05) swig(1 / 60);
  assert.equal(o.shot().name, 'swig', 'still drinking');
  while (!p.swig.thrown) swig(1 / 60);
  const s = o.shot();
  assert.equal(s.name, 'swigThrow');
  assert.ok(s.at.y === 50 && s.at.x > 200 && s.at.x < 220, `the impact on the wall ahead: ${s.at.x}`);
  later.forEach((fn) => fn()); // the glass breaks
  assert.equal(o.shot().name, 'swigThrow', 'it stays on what he did while he sits');
  // he gets up (Player.updateSit): the swig is gone, he rises
  p.swig = null; p.rising = true; p.sit = 0.5;
  assert.deepEqual(o.shot(), { name: 'swigUp' });
  p.sit = 0;
  assert.equal(o.shot(), null, 'up: the usual view');
  p.sit = 0.4;
  assert.equal(o.shot(), null, 'and for good');
});

test('opening: a key pressed early hurries the throw, and the camera with it', () => {
  const { p, swig } = sat(), o = new Opening(p), T = GESTURE.swig;
  swig(0.2, true);
  assert.ok(p.swig.go && p.swig.t >= T.back[0]);
  let t = 0;
  while (!p.swig.thrown) { swig(1 / 60); t += 1 / 60; }
  assert.ok(t < T.throw - T.back[0] + 0.05, 'thrown at once');
  assert.equal(o.shot().name, 'swigThrow');
});

test('opening: no swig (a retry, another level), no shot', () => {
  assert.equal(new Opening({ swig: null, sit: 0 }).shot(), null);
  assert.equal(new Opening({ swig: null, sit: 1, rising: true }).shot(), null, 'a level opening sat, without the bottle');
  assert.equal(new Opening(null).shot(), null);
});

test('opening: the shots exist, and getting up gives the view back in under 0.8 s', () => {
  for (const n of ['swig', 'swigThrow', 'swigUp']) assert.ok(SHOTS[n], n);
  assert.ok(SHOTS.swig.zoom > SHOTS.swigThrow.zoom && SHOTS.swigThrow.zoom > 1);
  const d = new Direction();
  d.set('swig', null, true, 3);
  d.set('swigThrow', { x: 300, y: 0 });
  for (let i = 0; i < 120; i++) d.update(1 / 60, 3);
  assert.ok(d.zoom > 1.5 && d.aim(0, 0).x > 100, 'thrown: closer, drawn toward the wall');
  let t = 0;
  d.set('swigUp');
  for (; t < PLAYER.rise; t += 1 / 60) d.update(1 / 60, 3);
  d.set(null);
  for (; t < 0.8; t += 1 / 60) d.update(1 / 60, 3);
  assert.ok(Math.abs(d.zoom - 1) < 0.03, `zoom ${d.zoom.toFixed(3)} 0.8 s after he got up`);
  assert.ok(Math.abs(d.aim(0, 0).x) < 30, `the view back on him: ${d.aim(0, 0).x.toFixed(1)} px off`);
});
