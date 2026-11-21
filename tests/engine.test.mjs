import { test } from 'node:test';
import assert from 'node:assert/strict';
import { load } from './setup.mjs';

const { default: EventBus } = await load('engine/EventBus.js');
const { gridRaycast, segPoly, segCircle, segSeg } = await load('engine/physics/Raycast.js');

test('EventBus: on / emit / off / once', () => {
  const bus = new EventBus();
  const got = [];
  const off = bus.on('hit', (e) => got.push(e.n));
  bus.once('hit', (e) => got.push(-e.n));
  bus.emit('hit', { n: 1 });
  bus.emit('hit', { n: 2 });
  off();
  bus.emit('hit', { n: 3 });
  assert.deepEqual(got, [1, -1, 2]);
});

test('EventBus: an emit calls the handlers there were when it began, whatever they add or remove meanwhile', () => {
  const bus = new EventBus(), got = [];
  const late = () => got.push('late');
  let offB = null;
  bus.on('e', () => { got.push('a'); bus.on('e', late); offB(); });
  offB = bus.on('e', () => got.push('b'));
  bus.on('e', (n) => { got.push('c'); if (n < 1) bus.emit('e', n + 1); }); // nested: the list as it is then
  bus.emit('e', 0);
  assert.deepEqual(got, ['a', 'b', 'c', 'a', 'c', 'late']);
  got.length = 0;
  bus.emit('e', 1);
  assert.deepEqual(got, ['a', 'c', 'late', 'late']);
});

test('gridRaycast stops at the first solid cell with the right normal', () => {
  const solid = (cx, cy) => cx === 3 && cy === 0;
  const hit = gridRaycast(16, 16, 200, 16, solid);
  assert.ok(hit);
  assert.equal(hit.cx, 3);
  assert.equal(Math.round(hit.x), 96);
  assert.equal(hit.nx, -1);
  assert.equal(gridRaycast(16, 16, 60, 16, solid), null);
});

test('segment vs polygon / circle / segment', () => {
  const square = [{ x: 10, y: -5 }, { x: 20, y: -5 }, { x: 20, y: 5 }, { x: 10, y: 5 }];
  const r = segPoly(0, 0, 30, 0, square);
  assert.ok(Math.abs(r.t - 1 / 3) < 1e-9);
  assert.equal(r.nx, -1);
  assert.equal(segPoly(0, 10, 30, 10, square), null);
  assert.ok(Math.abs(segCircle(0, 0, 10, 0, 5, 0, 2) - 0.3) < 1e-9);
  assert.equal(segCircle(0, 5, 10, 5, 5, 0, 2), null);
  assert.ok(Math.abs(segSeg(0, 0, 10, 0, 5, -5, 5, 5) - 0.5) < 1e-9);
});

test('Camera: what it keeps in the world and calls in view is measured at the zoom it draws at (z)', async () => {
  const { default: Camera } = await load('engine/Camera.js');
  // held on whole px (at a wheel) a director's scale is rounded to a whole zoom: 2 x 1.3 is drawn at 3
  const cam = new Camera();
  cam.resize(1920, 1080, 2);
  cam.pixel = true;
  cam.scale = 1.3;
  assert.equal(cam.z, 3);
  const r = cam.viewRadius();
  assert.ok(Math.abs(r.x - (1920 / 3 / 2 + 40)) < 1e-9 && Math.abs(r.y - (1080 / 3 / 2 + 40)) < 1e-9);
  // a punch-in draws closer: the view is smaller, and may come nearer the world's edge
  const foot = new Camera();
  foot.resize(1280, 720, 2);
  foot.bounds = { w: 4000, h: 4000 };
  foot.snap(0, 0);
  const x0 = foot.x;
  foot.punch(0.5);
  foot.snap(0, 0);
  assert.ok(Math.abs(x0 - (1280 / 2 / 2 + 10)) < 1e-9);
  assert.ok(Math.abs(foot.x - (1280 / foot.z / 2 + 10)) < 1e-9 && foot.x < x0);
});
