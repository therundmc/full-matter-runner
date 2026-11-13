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
