import { test } from 'node:test';
import assert from 'node:assert/strict';
import { load } from './setup.mjs';

const { OUTRO, outroPhase, vanSpeed, fadeAlpha, barsK, camBlend, crossed } = await load('game/systems/Outro.js');

const STEP = 1 / 60;

test('outro: the phases come in order, from the walk to the end', () => {
  const order = ['walk', 'board', 'ignition', 'drive', 'fade', 'done'];
  let last = 0;
  for (let t = 0; t <= OUTRO.end + 0.5; t += 0.01) {
    const i = order.indexOf(outroPhase(t));
    assert.ok(i >= last, `phase went back at t=${t.toFixed(2)}`);
    last = i;
  }
  assert.equal(last, order.length - 1);
  assert.ok(OUTRO.walk < OUTRO.lights && OUTRO.lights < OUTRO.go && OUTRO.go < OUTRO.full);
  assert.ok(OUTRO.skipAfter < OUTRO.walk);
});

test('outro: the van stays put before it pulls away, then speeds up to its full speed', () => {
  for (let t = 0; t <= OUTRO.go; t += 0.01) assert.equal(vanSpeed(t), 0);
  let prev = 0;
  for (let t = OUTRO.go; t <= OUTRO.full; t += 0.01) {
    const v = vanSpeed(t);
    assert.ok(v >= prev);
    prev = v;
  }
  assert.ok(Math.abs(vanSpeed(OUTRO.full) - OUTRO.speed) < 1e-9);
});

test('outro: the drive never covers more than maxDist, however long it lasts', () => {
  let done = 0;
  for (let t = 0; t < OUTRO.end + 10; t += STEP) done += vanSpeed(t, done);
  assert.ok(done <= OUTRO.maxDist + 1e-9, `${done} > ${OUTRO.maxDist}`);
  // and it does get somewhere before the picture is black
  let seen = 0;
  for (let t = 0; t < OUTRO.fade[1]; t += STEP) seen += vanSpeed(t, seen);
  assert.ok(seen > 4 * 32, `only ${seen} px`);
});

test('outro: the fade is clear before its start and black at its end, which comes before the results', () => {
  assert.equal(fadeAlpha(0), 0);
  assert.equal(fadeAlpha(OUTRO.fade[0] - 0.01), 0);
  assert.equal(fadeAlpha(OUTRO.fade[1]), 1);
  assert.equal(fadeAlpha(OUTRO.end), 1);
  assert.ok(OUTRO.end > OUTRO.fade[1]);
  let prev = 0;
  for (let t = 0; t <= OUTRO.end; t += 0.01) { assert.ok(fadeAlpha(t) >= prev); prev = fadeAlpha(t); }
});

test('outro: the letterbox bars are fully in by 0.35 s, the camera reaches the cab', () => {
  assert.equal(barsK(0), 0);
  assert.ok(barsK(0.1) > 0 && barsK(0.1) < 1);
  assert.equal(barsK(0.35), 1);
  assert.equal(barsK(OUTRO.end), 1);
  assert.equal(camBlend(OUTRO.walk), 0);
  assert.equal(camBlend(OUTRO.walk + OUTRO.cam), 1);
});

test('outro: a beat fires once, on the step that reaches it', () => {
  let n = 0;
  for (let t = 0; t < 2; t += STEP) if (crossed(t, t + STEP, OUTRO.lights)) n++;
  assert.equal(n, 1);
});
