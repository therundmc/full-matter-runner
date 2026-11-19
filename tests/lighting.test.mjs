import { test } from 'node:test';
import assert from 'node:assert/strict';
import { load } from './setup.mjs';

const { ambientOf } = await load('game/render/Lighting.js');
const { LIGHTING } = await load('game/Config.js');
const { default: LEVELS } = await load('game/data/levels/index.js');

test('ambient: a level without its own tints keeps LIGHTING.ambient, one with them changes only those', () => {
  assert.deepEqual(ambientOf({}), LIGHTING.ambient);
  assert.deepEqual(ambientOf(undefined), LIGHTING.ambient);
  for (const id of ['level1', 'tutorial']) assert.deepEqual(ambientOf(LEVELS[id]), LIGHTING.ambient, id);
  const lit = ambientOf({ light: { inside: [0.5, 0.5, 0.5] } });
  assert.deepEqual(lit.inside, [0.5, 0.5, 0.5]);
  assert.deepEqual({ ...lit, inside: LIGHTING.ambient.inside }, LIGHTING.ambient);
});

// ---- a car's lamps follow the car AS DRAWN (the user: "the headlights trail the car, like a delay")
const { lampPlace } = await load('game/render/Lighting.js');
const { default: Vehicle } = await load('game/entities/Vehicle.js');
const { CHASE } = await load('game/data/chase.js');

// a vehicle with just what its pose reads: its body, the camera, the body on its springs
function car(x, y, a, o = {}) {
  const v = Object.create(Vehicle.prototype);
  return Object.assign(v, { body: { position: { x, y }, angle: a }, world: { camera: { pixel: true, z: 3 } }, moving: true, drawn: null, sag: [0, 0], def: {} }, o);
}
const HEAD = { lx: 81, ly: -21, ldir: 0 }, TAIL = { lx: -82.5, ly: 23, ldir: 0 };

test('lamps: a driven car\'s beams and tail lights are laid on the pose it is drawn at, not on its body', () => {
  // mid lane change: the body between two px and 0.07 rad off the road, the sprite on a whole px and one of 64 angles
  const v = car(1000.4, 470.17, 0.07), at = v.pose();
  assert.notEqual(at.a, v.body.angle, 'the sprite is not drawn at the body\'s angle');
  assert.equal(Math.round(at.a / (Math.PI * 2 / CHASE.pixel.steps)), at.a / (Math.PI * 2 / CHASE.pixel.steps), 'but on a step of the circle');
  for (const l of [HEAD, TAIL]) {
    const p = lampPlace(v, l), c = Math.cos(at.a), s = Math.sin(at.a);
    assert.ok(Math.hypot(p.x - (at.x + l.lx * c - l.ly * s), p.y - (at.y + l.lx * s + l.ly * c)) < 1e-9, 'the lamp sits on the drawn car');
    assert.equal(p.dir, at.a, 'the beam points where the drawn nose does');
    // (laid on the body it was px off the drawn lamp: what read as a delay)
    const cb = Math.cos(v.body.angle), sb = Math.sin(v.body.angle);
    assert.ok(Math.hypot(p.x - (v.body.position.x + l.lx * cb - l.ly * sb), p.y - (v.body.position.y + l.lx * sb + l.ly * cb)) > 0.5);
  }
});

test('lamps: they go with the body on its springs, frame after frame of a turn, and a parked car\'s stay on its body', () => {
  const v = car(500, 300, 0);
  for (let i = 0; i < 40; i++) {
    v.body.position.x += 3.7; v.body.position.y += 0.9; v.body.angle = 0.2 * Math.sin(i / 6);
    v.sag = [0.5 * (i % 3), -0.5 * (i % 2)];
    const at = v.pose(), p = lampPlace(v, HEAD), c = Math.cos(at.a), s = Math.sin(at.a);
    const x = at.x + (HEAD.lx + v.sag[0]) * c - (HEAD.ly + v.sag[1]) * s, y = at.y + (HEAD.lx + v.sag[0]) * s + (HEAD.ly + v.sag[1]) * c;
    assert.ok(Math.hypot(p.x - x, p.y - y) < 1e-9, `frame ${i}`);
  }
  const parked = car(700.3, 200.6, 0.31, { moving: false }), p = lampPlace(parked, HEAD);
  assert.ok(Math.abs(p.x - (700.3 + 81 * Math.cos(0.31) + 21 * Math.sin(0.31))) < 1e-9 && p.dir === 0.31);
  // a plain prop: its body, as ever
  const lamp = lampPlace({ x: 10, y: 20, body: { angle: Math.PI / 2 }, def: {} }, { lx: 56, ly: 0, ldir: 0 });
  assert.ok(Math.abs(lamp.x - 10) < 1e-9 && Math.abs(lamp.y - 76) < 1e-9);
});
