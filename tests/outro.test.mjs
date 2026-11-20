import { test } from 'node:test';
import assert from 'node:assert/strict';
import { load } from './setup.mjs';

const { OUTRO, outroPhase, routePath, routeSpeed, slideStep, fadeAlpha, outroOver, barsK, camBlend, crossed } = await load('game/systems/Outro.js');

const STEP = 1 / 60;

test('outro: the phases come in order, from the walk to the drive', () => {
  const order = ['walk', 'board', 'ignition', 'drive'];
  let last = 0;
  for (let t = 0; t <= OUTRO.go + 0.5; t += 0.01) {
    const i = order.indexOf(outroPhase(t));
    assert.ok(i >= last, `phase went back at t=${t.toFixed(2)}`);
    last = i;
  }
  assert.equal(last, order.length - 1);
  assert.ok(OUTRO.walk < OUTRO.lights && OUTRO.lights < OUTRO.go);
});

test('outro: a route is straight lines joined by bends, without a jump in place or in direction', () => {
  const path = routePath([[0, 0], [300, 0], [300, 400], [-200, 400]], [96, 60]);
  assert.ok(Math.abs(path.length - (300 - 96 + 96 * Math.PI / 2 + 400 - 96 - 60 + 60 * Math.PI / 2 + 500 - 60)) < 1e-6);
  let prev = path.at(0);
  assert.deepEqual([prev.x, prev.y, prev.a, prev.turn], [0, 0, 0, 0]);
  const turns = new Set();
  for (let s = 1; s <= path.length; s += 1) {
    const q = path.at(s);
    assert.ok(Math.hypot(q.x - prev.x, q.y - prev.y) < 1.001, `a jump at ${s}`);
    assert.ok(Math.abs(Math.atan2(Math.sin(q.a - prev.a), Math.cos(q.a - prev.a))) < 0.03, `a kink at ${s}`);
    turns.add(q.turn);
    prev = q;
  }
  assert.deepEqual([...turns].sort(), [0, 1], 'two bends the same way, clockwise on screen');
  const end = path.at(path.length + 50);
  assert.ok(Math.abs(end.x + 200) < 1e-6 && Math.abs(end.y - 400) < 1e-6, 'it stops at the end');
  // a bend too wide for its lines is tightened, a straight route has none
  assert.ok(routePath([[0, 0], [20, 0], [20, 20]], [500]).length < 40);
  assert.equal(routePath([[0, 0], [100, 0]]).at(50).turn, 0);
  // a bend may be taken with a share of the slide, or none (too tight for it): it still turns
  const tight = routePath([[0, 0], [300, 0], [300, 400], [-200, 400]], [96, 60], 96, [0, 0.5]);
  assert.deepEqual([tight.at(350).turn, tight.at(350).slide], [1, 0]);
  assert.deepEqual([tight.at(tight.length - 480).turn, tight.at(tight.length - 480).slide], [1, 0.5]);
  assert.equal(path.at(350).slide, 1);
});

test('outro: the car floors it on a straight, brakes for a bend and never stalls', () => {
  let v = 0;
  for (let i = 0; i < 300; i++) { const n = routeSpeed(v, false, STEP); assert.ok(n >= v); v = n; }
  assert.equal(v, OUTRO.speed);
  for (let i = 0; i < 300; i++) { const n = routeSpeed(v, true, STEP); assert.ok(n <= v && n >= OUTRO.corner); v = n; }
  assert.equal(v, OUTRO.corner);
  assert.ok(OUTRO.corner < OUTRO.speed);
});

test('outro: the tail steps out in a bend and swings back past straight after it', () => {
  let slip = 0, sv = 0, max = 0;
  for (let i = 0; i < 40; i++) { [slip, sv] = slideStep(slip, sv, 1, OUTRO.corner, STEP); max = Math.max(max, slip); }
  assert.ok(max > OUTRO.smoke * 2, 'the tyres smoke in a bend');
  let min = Infinity;
  for (let i = 0; i < 120; i++) { [slip, sv] = slideStep(slip, sv, 0, OUTRO.speed, STEP); min = Math.min(min, slip); }
  assert.ok(min < -0.01, 'it fishtails once');
  assert.ok(Math.abs(slip) < 0.02, 'and settles');
  const [left] = slideStep(0, 0, -1, OUTRO.corner, STEP);
  assert.ok(left < 0, 'the other way in a bend the other way');
});

test('outro: the picture goes black over the last stretch, is held, then the results; never later than the timeout', () => {
  const out = { t: 3, fadeAt: null };
  assert.equal(fadeAlpha(out), 0);
  assert.equal(outroOver(out), false);
  out.fadeAt = 3;
  assert.equal(fadeAlpha(out), 0);
  out.t = 3 + OUTRO.fadeDur;
  assert.equal(fadeAlpha(out), 1);
  assert.equal(outroOver(out), false, 'black is held a moment');
  out.t += OUTRO.hold;
  assert.equal(outroOver(out), true);
  assert.equal(outroOver({ t: OUTRO.timeout, fadeAt: null }), true);
});

test('outro: the letterbox bars are fully in by 0.35 s, the camera reaches the cab', () => {
  assert.equal(barsK(0), 0);
  assert.equal(barsK(OUTRO.barsIn), 1);
  assert.equal(camBlend(OUTRO.walk), 0);
  assert.equal(camBlend(OUTRO.walk + OUTRO.cam), 1);
});

test('outro: a beat fires once, on the step that reaches it', () => {
  let n = 0;
  for (let t = 0; t < 2; t += STEP) if (crossed(t, t + STEP, OUTRO.lights)) n++;
  assert.equal(n, 1);
});
