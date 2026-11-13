import { test } from 'node:test';
import assert from 'node:assert/strict';
import { load } from './setup.mjs';

const { Slide, slideSpeed, slideDistance, canSlide } = await load('game/systems/Slide.js');
const { PLAYER, TILE } = await load('game/Config.js');

const cfg = PLAYER.slide;
const run = PLAYER.speed;

test('slide: bursts above run speed and decays smoothly to a jog', () => {
  assert.ok(slideSpeed(0, run, cfg) >= run * 1.8 && slideSpeed(0, run, cfg) <= run * 2);
  let prev = Infinity;
  for (let k = 0; k <= 1.0001; k += 0.05) {
    const v = slideSpeed(k, run, cfg);
    assert.ok(v <= prev);
    prev = v;
  }
  assert.ok(Math.abs(slideSpeed(1, run, cfg) - run * cfg.end) < 1e-9);
});

test('slide: covers roughly 2.5 to 3.5 m in about half a second', () => {
  const m = slideDistance(run, cfg) / TILE;
  assert.ok(m > 2.5 && m < 3.5, `${m} m`);
  const s = new Slide(0, run, cfg);
  let steps = 0;
  while (!s.done) { s.step(1 / 60); steps++; }
  assert.ok(steps / 60 >= 0.45 && steps / 60 <= 0.56);
});

test('slide: an obstacle that stops the body ends it', () => {
  const s = new Slide(0, run, cfg);
  s.step(1 / 60);
  s.step(1 / 60, s.speed * 0.95); // moving freely
  assert.equal(s.done, false);
  s.step(1 / 60, 0.2); // hit a wall
  assert.ok(s.done && s.stalled);
  assert.ok(s.speed <= 0.2);
});

test('slide: needs a running start and respects the cooldown', () => {
  assert.equal(canSlide(0, run, run, cfg), true);
  assert.equal(canSlide(0, run * 0.2, run, cfg), false);
  assert.equal(canSlide(0.1, run, run, cfg), false);
});
