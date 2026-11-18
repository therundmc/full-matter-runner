import { test } from 'node:test';
import assert from 'node:assert/strict';
import { load } from './setup.mjs';

const { default: HoldSkip } = await load('game/ui/cine/Hold.js');
const { SKIP } = await load('game/data/staging.js');

const DT = 1 / 60;
// runs `s` seconds with the key down or up; whether it skipped
const run = (h, s, down) => { let hit = false; for (let t = 0; t < s - 1e-9; t += DT) hit = h.update(DT, down) || hit; return hit; };

test('hold to skip: SKIP.hold s held skips, not before, and only once', () => {
  assert.equal(SKIP.hold, 0.9);
  const h = new HoldSkip();
  run(h, 0.1, false);
  assert.equal(run(h, SKIP.hold - 0.05, true), false, 'not yet');
  assert.ok(h.k > 0.9 && h.k < 1);
  assert.equal(run(h, 0.1, true), true, 'full: it skips');
  assert.equal(run(h, 1, true), false, 'once');
});

test('hold to skip: let go, it drains back; a tap never skips', () => {
  const h = new HoldSkip();
  run(h, 0.1, false);
  run(h, 0.6, true);
  const k = h.k;
  run(h, 0.1, false);
  assert.ok(h.k < k - 0.2 && h.k > 0, 'draining, faster than it filled');
  run(h, SKIP.hold / SKIP.drain, false);
  assert.equal(h.k, 0, 'empty again');
  for (let i = 0; i < 20; i++) {
    assert.equal(run(h, 0.3, true), false, 'a tap of 0.3 s');
    run(h, 0.3, false);
  }
});

test('hold to skip: a key already down when the page opened must be let go first', () => {
  const h = new HoldSkip();
  assert.equal(run(h, 3, true), false, 'held from the start: nothing');
  assert.equal(h.k, 0);
  run(h, DT, false);
  assert.equal(run(h, SKIP.hold + 0.05, true), true, 'let go and held again: it skips');
});

test('hold to skip: the hint waits, then fades in; a new page starts over', () => {
  const h = new HoldSkip();
  run(h, SKIP.hint - 0.05, false);
  assert.equal(h.shown, 0);
  run(h, SKIP.fade + 0.1, false);
  assert.equal(h.shown, 1);
  h.reset();
  assert.equal(h.shown, 0);
  assert.equal(h.k, 0);
});
