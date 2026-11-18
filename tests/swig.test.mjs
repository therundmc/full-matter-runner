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

// ---- the beat itself: the pose he is drawn in (CharacterAnim sitPose / swigPose) and the bottle (Player.updateSwig)
const { sitPose, newPose } = await load('game/entities/CharacterAnim.js');
const { newSkirt, stepSkirt } = await load('game/entities/Skirt.js');
const { COAT } = await load('game/data/feel.js');

const nums = (P) => [P.tx, P.ty, P.ta, P.s, P.ha, P.bow, P.legs, P.elb[0], P.elb[1], P.carry.x, P.carry.y, P.carry.a,
  ...[P.hl, P.hr, P.feet[0], P.feet[1]].flatMap((p) => [p.x, p.y, p.a])];
// the pose at t s of the swig (or getting up: sit < 1, rising), for a man facing `angle`
function poseAt(t, angle = 0.4, sit = 1, rising = false) {
  const ch = { angle, sit, rising, swig: t === null ? null : { t, thrown: t >= GESTURE.swig.throw, go: false } };
  const P = newPose(), V = newPose();
  P.ta = angle; P.ha = angle;
  return sitPose(ch, P, V);
}

test('swig: the pose is finite all through the beat and nothing in it jumps', () => {
  const T = GESTURE.swig;
  let was = null;
  for (let t = 0; t <= T.end + 0.4; t += 1 / 120) {
    const P = poseAt(t);
    assert.ok(nums(P).every(Number.isFinite), `t ${t.toFixed(3)}`);
    if (was) {
      // a hand goes fastest in the throw: about 16 px in 0.15 s
      for (const h of ['hl', 'hr']) assert.ok(Math.hypot(P[h].x - was[h].x, P[h].y - was[h].y) < 4, `${h} jumps at ${t.toFixed(3)}`);
      assert.ok(Math.abs(P.ta - was.ta) < 0.08 && Math.abs(P.bow - was.bow) < 0.05, `the body jumps at ${t.toFixed(3)}`);
    }
    was = { hl: { ...P.hl }, hr: { ...P.hr }, ta: P.ta, bow: P.bow };
  }
});

test('swig: he drinks with his head back, looks at the bottle, winds up behind his shoulder and throws ahead', () => {
  const T = GESTURE.swig, a = 0, rest = poseAt(0.05, a);
  // in his own frame (facing +x): x ahead, y to his right
  const mid = (T.drink[0] + T.drink[1]) / 2, gulp = poseAt(T.drink[0] + (T.drink[1] - T.drink[0]) / (2 * T.gulps), a);
  assert.ok(gulp.bow < rest.bow - 0.1, 'his head goes back with a gulp');
  assert.ok(gulp.hr.y < rest.hr.y - 2 && gulp.hl.y > rest.hl.y + 4, 'the bottle at his mouth, the other hand at his collar');
  assert.ok(Math.abs(poseAt(mid, a).carry.a - gulp.carry.a) > 0.05, 'the bottle tips further as it empties');
  const look = poseAt((T.look[0] + T.look[1]) / 2, a);
  assert.ok(look.ha > 0.25, 'his head turned to it');
  assert.ok(look.hr.x > gulp.hr.x, 'held out before him');
  const wound = poseAt(T.back[1], a);
  assert.ok(wound.hr.x < wound.tx && wound.ta > rest.ta + 0.2, 'the hand behind his shoulder, the shoulders turned with it');
  const out = poseAt(T.throw - 1e-6, a);
  assert.ok(out.hr.x > wound.hr.x + 9 && out.ta < rest.ta - 0.1, 'the arm out ahead, the shoulders through');
  assert.equal(poseAt(T.throw + 0.01, a).carryImg, null, 'the bottle has left his hand');
  const end = poseAt(T.end, a);
  for (const k of ['tx', 'ty', 'ta']) assert.ok(Math.abs(end[k] - rest[k]) < 1e-6, `as he sat: ${k}`);
});

test('swig: the beat is no longer than it was by more than 0.3 s, and its moments keep their order', () => {
  const T = GESTURE.swig;
  assert.ok(Math.abs(T.end - 2.75) <= 0.3);
  const order = [0, T.drink[0], T.drink[1], T.look[0], T.look[1], T.back[0], T.back[1], T.throw, T.end];
  for (let i = 1; i < order.length; i++) assert.ok(order[i] >= order[i - 1], `moment ${i}`);
});

test('swig: getting up, the pose stays finite and ends on his feet; the hand is given back as before', () => {
  for (let sit = 1; sit >= 0; sit -= 1 / 64) assert.ok(nums(poseAt(null, 1.1, sit, true)).every(Number.isFinite), `sit ${sit}`);
  const half = poseAt(null, 0, 0.6, true), sat = poseAt(null, 0, 1, false);
  assert.ok(half.feet[1].x < sat.feet[1].x - 1, 'a foot drawn in under him');
  assert.ok(half.bow > sat.bow, 'bent forward over it');
  assert.equal(PLAYER.rise, 0.55);
});

test('swig: the rum goes with the glass, where the bottle breaks', () => {
  const { p, later, swig } = sat(), T = GESTURE.swig, seen = [];
  p.world.particles.drops = (x, y, a, spread, n) => seen.push({ x, y, n });
  while (!p.swig.thrown) swig(1 / 60);
  later.forEach((fn) => fn());
  assert.deepEqual(seen, [{ x: p.swig.hit.x, y: p.swig.hit.y, n: T.drops[0] }]);
});

test('swig: sat, the coat is spread either side of him and never torn; it settles behind him as he stands', () => {
  const S = newSkirt();
  for (let i = 0; i < 60; i++) stepSkirt(S, Math.PI, 0, 0, 0, 1 / 60, 0, 1);
  assert.ok(S.half[0].a > 1 && S.half[1].a < -1, 'a half out to each side');
  assert.ok(Math.abs(S.half[0].len - COAT.sit[1]) < 1e-9);
  let was = S.half[0].a;
  for (let sit = 1; sit >= 0; sit -= 0.05) {
    stepSkirt(S, Math.PI, 0, 0, 0, 1 / 60, 0, sit);
    assert.ok(S.half[0].a <= was + 1e-9 && S.half[0].a >= -1e-9, 'it comes round behind him, one way');
    was = S.half[0].a;
  }
  stepSkirt(S, Math.PI, 0, 0, 0, 1 / 60, 0, 0);
  assert.ok(Math.abs(S.half[0].a) < 1e-6 && Math.abs(S.half[0].len - COAT.hem) < 0.02);
});
