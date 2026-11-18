import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { load } from './setup.mjs';

// the QA robot's pure checks (tools/qa/checks.js sets globalThis.__qaChecks, as it does in the page)
await import('../tools/qa/checks.js');
const K = globalThis.__qaChecks;
const { newPose } = await load('game/entities/CharacterAnim.js');

test('qa checks: a sane pose passes, a NaN torso is caught by its field', () => {
  const P = newPose();
  assert.deepEqual(K.poseIssues(P, { head: 0, sh: 0, feet: null }), []);
  P.tx = NaN; // the shoving bouncer of c7f2738: a door hand without fields
  const bad = K.poseIssues(P, null);
  assert.equal(bad[0].field, 'tx');
  assert.equal(bad[0].why, 'not finite');
});

test('qa checks: nested pose numbers, the facing, the scale and the torso offset', () => {
  const P = newPose();
  P.hl.y = Infinity;
  P.feet[1].a = NaN;
  assert.deepEqual(K.poseIssues(P, { head: NaN }).map((i) => i.field).sort(), ['facing.head', 'feet.1.a', 'hl.y']);
  const Q = newPose();
  Q.s = 0.3;
  Q.tx = 30;
  assert.deepEqual(K.poseIssues(Q, null).map((i) => i.field), ['s', 'tx,ty']);
  // a picture, an entity: not numbers of the pose
  const R = newPose();
  R.carryImg = { width: NaN };
  assert.deepEqual(K.poseIssues(R, null), []);
});

test('qa checks: the size a character is drawn at', () => {
  assert.equal(K.drawScale(3, 1, 3), null);
  assert.equal(K.drawScale(3 * 0.88, 0.95, 3), null); // crouched a little
  assert.equal(K.drawScale(3, 1, 6).why, 'drawn at 0.50 x the expected size'); // the camera zoomed out
  assert.equal(K.drawScale(3 * (1 - 1.6 * 0.14), 1, 3).ratio, 0.776); // a civilian curled up, before e3c5cc9: tiny on screen
  assert.equal(K.drawScale(3, NaN, 3).why, 'not finite');
});

test('qa checks: the camera is back to its default at a level start, and keeps the player in view', () => {
  const cam = { x: 100, y: 100, zoom: 3, scale: 1, w: 1280, h: 720 };
  assert.deepEqual(K.cameraIssues(cam, { start: true, scale: 1, zoom: 3, player: { x: 640, y: 360 } }), []);
  const stale = K.cameraIssues({ ...cam, scale: 1.6 }, { start: true, scale: 1, zoom: 3 });
  assert.deepEqual(stale.map((i) => i.sig), ['scale-not-reset']);
  assert.deepEqual(K.cameraIssues({ ...cam, scale: 1.6 }, { start: false, scale: 1 }), []); // a directed shot in play
  assert.deepEqual(K.cameraIssues({ ...cam, x: NaN }).map((i) => i.sig), ['nan-x']);
  assert.deepEqual(K.cameraIssues(cam, { player: { x: 1400, y: 300 } }).map((i) => i.sig), ['player-off-screen']);
});

test('qa checks: a spell is told once, past its time, and starts again when the condition stops', () => {
  const s = new K.Spell(1);
  assert.equal(s.hold('a', true, 0), null);
  assert.equal(s.hold('a', true, 0.9), null);
  assert.equal(s.hold('a', true, 1.5), 1.5);
  assert.equal(s.hold('a', true, 5), null); // told already
  assert.equal(s.hold('a', false, 6), null);
  assert.equal(s.hold('a', true, 7), null);
  assert.ok(Math.abs(s.hold('a', true, 8.2) - 1.2) < 1e-9, 'a new spell');
});

test('qa checks: an anchor tells a fleeing man who stays put, not one who moves', () => {
  const a = new K.Anchor(6, 4);
  let told = null;
  for (let t = 0; t <= 10; t += 0.5) told ||= a.still('runner', t * 20, 0, t); // 20 px/s
  assert.equal(told, null);
  for (let t = 0; t <= 5; t += 0.5) told ||= a.still('stuck', 100 + (t % 1), 50, t); // a px of jitter
  assert.ok(told > 4);
});

test('qa checks: a move may last its data length with slack, not forever', () => {
  const D = { lockTime: (f) => f.len, lockedFor: (f) => f.len, TRAVERSE: { kick: { dur: 0.5 } }, GESTURE: { trunk: { dur: 1.2 } }, rollDur: 0.6 };
  assert.equal(K.moveLimit('execution', { f: { len: 2 } }, D), 4);
  assert.equal(K.moveLimit('kick', {}, D), 1.75);
  assert.equal(K.moveLimit('vault', { dur: 0.4, roll: true }, D), 2.5);
  assert.equal(K.moveLimit('passage', { cfg: { down: 1, under: 2, up: 1 } }, D), 7);
  assert.equal(K.moveLimit('dance', {}, D), Infinity);
});

test('qa checks: a parked car carried along by people on foot, not one hit by a blast or coasting on', () => {
  // parked 2 s, then walked into: 2 px every half second
  const run = (opts, still = true) => {
    const w = new K.ShoveWatch(6, 3, 2);
    let px = null, x = 0;
    for (let t = 0; t <= 2; t += 0.5) px ||= w.update('car', { x: still ? 0 : (x += 20), y: 0 }, t);
    for (let t = 2.5; t < 5; t += 0.5) px ||= w.update('car', { x: (x += 2), y: 0 }, t, opts);
    return px;
  };
  assert.ok(run({ touched: true }) > 6, 'shoved');
  assert.equal(run({ touched: true, excused: true }), null, 'a blast, a round, another car');
  assert.equal(run({ touched: false }), null, 'nobody at it');
  assert.equal(run({ touched: true }, false), null, 'still rolling from the lane when they got to it');
});

test('qa checks: a body that spins round after a table slam, one that still slides, one that lies still', () => {
  const spin = new K.CorpseWatch();
  let r = null;
  for (let t = 0; t <= 4 && !r; t += 0.5) r = spin.update('a', { x: 0, y: 0, a: t * 1.2, age: t, excused: false }, t);
  assert.equal(r.kind, 'spun');
  const slide = new K.CorpseWatch();
  r = null;
  for (let t = 0; t <= 8 && !r; t += 0.5) r = slide.update('b', { x: t > 5 ? t * 12 : 0, y: 0, a: 0, age: t, excused: false }, t);
  assert.equal(r?.kind, 'drift');
  const still = new K.CorpseWatch();
  r = null;
  for (let t = 0; t <= 10; t += 0.5) r ||= still.update('c', { x: 0.1 * Math.sin(t), y: 0, a: 0.01 * t, age: t, excused: false }, t);
  assert.equal(r, null);
  const kicked = new K.CorpseWatch();
  r = null;
  for (let t = 0; t <= 4; t += 0.5) r ||= kicked.update('d', { x: 0, y: 0, a: t * 1.2, age: t, excused: true }, t);
  assert.equal(r, null, 'a blast, a car or a man on it excuses it');
});

test('qa checks: a body shoved by loose furniture on the move (a gas bottle riding its jet) is excused, not one by still furniture', () => {
  const body = { min: { x: 0, y: 0 }, max: { x: 30, y: 20 } };
  const box = (x, y, s = 12) => ({ min: { x, y }, max: { x: x + s, y: y + s } });
  assert.ok(K.shovedBy(body, [{ bounds: box(32, 4), speed: 2 }]), 'a bottle on its jet against his side');
  assert.ok(!K.shovedBy(body, [{ bounds: box(32, 4), speed: 0 }]), 'a crate standing by him');
  assert.ok(!K.shovedBy(body, [{ bounds: box(90, 4), speed: 3 }]), 'a chair flying past further off');
  assert.ok(K.shovedBy(body, [{ bounds: box(10, -4, 30), press: true }]), 'a door leaf swung onto him');
  assert.ok(!K.shovedBy(body, [{ bounds: box(90, 4), press: true }]), 'a door further off');
  assert.ok(!K.shovedBy(body, []));
});

test('qa checks: a weapon out of reach, and one by a wall', () => {
  const wall = (x) => x < 0; // a wall on the left half-plane
  assert.equal(K.reachable(5, 0, (x) => !wall(x)), true, 'against the wall: reached from the room');
  assert.equal(K.reachable(-40, 0, (x) => !wall(x)), false, 'deep in the wall');
  const box = (x, y) => Math.abs(x) < 50 && Math.abs(y) < 50; // inside a counter 100 px wide
  assert.equal(K.reachable(0, 0, (x, y) => !box(x, y)), false);
  assert.equal(K.reachable(40, 0, (x, y) => !box(x, y)), true);
});

test('qa checks: door leaves', () => {
  assert.deepEqual(K.doorIssues({ rel: 0.4, max: 1.75, off: 0.5, x: 1, y: 1 }), []);
  assert.deepEqual(K.doorIssues({ rel: 2.2, max: 1.75, off: 0.5, x: 1, y: 1 }), ['past-stop']);
  assert.deepEqual(K.doorIssues({ rel: 0.2, max: 1.75, off: 9, x: 1, y: 1 }), ['off-hinge']);
  assert.deepEqual(K.doorIssues({ rel: NaN, max: 1.75, off: 0, x: 1, y: 1 }), ['nan']);
  assert.equal(K.segDist(5, 3, 0, 0, 10, 0), 3);
});

test('qa checks: the sounds the mixer can play are read from Audio.js', () => {
  const names = K.soundNames(readFileSync(new URL('../src/audio/Audio.js', import.meta.url), 'utf8'));
  for (const n of ['metal', 'flesh', 'glassHit', 'rollMetal', 'pistol', 'impact']) assert.ok(names.has(n), n);
  assert.ok(!names.has('noSuchSound'));
  assert.deepEqual(K.topKeys("{ a: 1, b: [{ c: 2 }], 'd': 3, // e: 4\n f: { g: 1 } }"), ['a', 'b', 'f']);
});

test('qa checks: the plan scheduler deals every plan in turn, seeded, with its chaos share', () => {
  const deal = (seed, share, n = 60) => {
    const s = new K.Scheduler({ normal: ['free', 'roof', 'trunk'], chaos: ['monkey', 'pickDrop'], share, rnd: K.prng(seed) });
    return Array.from({ length: n }, (_, i) => s.next(() => true, i % 4 === 0));
  };
  assert.deepEqual(deal(7, 0.3), deal(7, 0.3), 'replayable');
  assert.notDeepEqual(deal(7, 0.3), deal(8, 0.3));
  assert.ok(deal(7, 0).every((r) => !r.chaos));
  assert.ok(deal(7, 1).every((r) => r.chaos));
  const mixed = deal(7, 0.5, 400), chaos = mixed.filter((r) => r.chaos).length;
  assert.ok(chaos > 140 && chaos < 260, `${chaos} chaos draws of 400`);
  const counts = {};
  for (const r of deal(3, 1, 100)) counts[r.name] = (counts[r.name] || 0) + 1;
  assert.deepEqual(counts, { monkey: 50, pickDrop: 50 }, 'each as often as the other');
  // 'free' only at a session start; a refused plan is counted and another one drawn
  const s = new K.Scheduler({ normal: ['free', 'roof'], chaos: [], rnd: K.prng(1) });
  for (let i = 0; i < 10; i++) assert.notEqual(s.next(() => true, false)?.name, 'free');
  assert.equal(s.next((n) => n !== 'roof', false), null);
  assert.ok(s.skips.roof > 0);
});
