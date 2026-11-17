import { test } from 'node:test';
import assert from 'node:assert/strict';
import { load } from './setup.mjs';

const { updateFacing, feetAngle, stanceAt } = await load('game/entities/Facing.js');
const { doorAhead, doorHandSide, drawPhases, talkGesture, talkHand, talkAt } = await load('game/entities/Gesture.js');
const { FACING, GESTURE, TALK } = await load('game/data/feel.js');
const { BARKS } = await load('game/data/barks.js');
const { default: Door } = await load('game/entities/Door.js');
const { angDiff } = await load('engine/math.js');

const DT = 1 / 60;
const man = (angle = 0) => ({ angle, x: 100, y: 50, footA: angle, world: { time: 0 }, aware: 0 });
// run the layers of ch for s seconds at step dt (still: standing), calling each(ch, t) before every step
function run(ch, s, dt = DT, each) {
  let heard = [];
  for (let t = 0; t < s - 1e-9; t += dt) {
    each?.(ch, t);
    ch.world.time += dt;
    const h = updateFacing(ch, dt, true);
    if (h) heard.push(h);
  }
  return heard;
}

test('facing: the head leads, the shoulders follow within about 90 ms, the hands stay on the aim', () => {
  const ch = man(0);
  run(ch, 0.5);
  ch.angle = 1.2;
  run(ch, 1 / 60);
  const F = ch.facing;
  assert.ok(Math.abs(angDiff(F.head, 1.2)) < Math.abs(angDiff(F.sh, 1.2)), 'the head is ahead of the shoulders');
  run(ch, 0.09 - 1 / 60);
  assert.ok(Math.abs(angDiff(F.sh, 1.2)) < 0.12 * 1.2, `shoulders at ${F.sh} after 90 ms`);
  run(ch, 0.4);
  assert.ok(Math.abs(angDiff(F.sh, 1.2)) < 0.01, 'settled');
  assert.equal(ch.angle, 1.2, 'the gameplay angle is never touched');
});

test('facing: the hips go after the shoulders, never more than FACING.twist off them', () => {
  const ch = man(0);
  run(ch, 0.5);
  let worst = 0;
  run(ch, 1.5, DT, (c, t) => { c.angle = Math.sin(t * 9) * 2.5; worst = Math.max(worst, Math.abs(angDiff(c.facing.sh, c.facing.hip))); });
  assert.ok(worst <= FACING.twist + 1e-9, `twist ${worst}`);
});

test('facing: standing, the feet stay planted in the world for a small turn, a big one steps them round', () => {
  const ch = man(0);
  run(ch, 0.5);
  const F = ch.facing, before = F.feet.map((f) => ({ ...f }));
  ch.angle = FACING.settle * 0.8;
  const heard = run(ch, 1);
  assert.deepEqual(F.feet.map((f) => [f.x, f.y, f.a]), before.map((f) => [f.x, f.y, f.a]), 'planted');
  assert.equal(heard.length, 0);
  // a little further: planted while he turns, squared up once he has been still a moment
  ch.angle = (FACING.settle + FACING.stepAt) / 2;
  assert.equal(run(ch, FACING.square * 0.9).length, 0);
  assert.ok(run(ch, 1).includes('step'));
  ch.angle = 0;
  run(ch, 1.5);
  // a quarter turn, at the shoulders' own pace: a step with each foot, and he stands square to it
  ch.angle = Math.PI / 2;
  const steps = run(ch, 1.2);
  assert.ok(steps.filter((h) => h === 'step').length >= 2, `steps: ${steps}`);
  assert.ok(Math.abs(angDiff(feetAngle(F.feet), Math.PI / 2)) < FACING.settle + 0.05, `feet at ${feetAngle(F.feet)}`);
  for (let i = 0; i < 2; i++) {
    const at = stanceAt(ch.x, ch.y, feetAngle(F.feet), i ? 1 : -1, {});
    assert.ok(Math.hypot(F.feet[i].x - at.x, F.feet[i].y - at.y) < 3, 'under him');
  }
});

test('facing: a sudden about-turn is a hop round on both feet; a slow one is walked round step by step', () => {
  const fast = man(0);
  run(fast, 0.5);
  fast.angle = Math.PI - 0.05;
  const h1 = run(fast, 0.6);
  assert.ok(h1.includes('hop'), `fast: ${h1}`);
  const slow = man(0);
  run(slow, 0.5);
  const h2 = run(slow, 2.8, DT, (c, t) => { c.angle = Math.min(Math.PI - 0.05, t * 1.5); });
  assert.ok(!h2.includes('hop') && h2.filter((h) => h === 'step').length >= 3, `slow: ${h2}`);
  assert.ok(Math.abs(angDiff(feetAngle(slow.facing.feet), Math.PI - 0.05)) < FACING.settle + 0.05, 'squared up once still');
});

test('facing: the same turn at 30, 60 and 144 frames a second', () => {
  const at = (dt) => {
    const ch = man(0);
    run(ch, 0.5, dt);
    ch.angle = 1.5;
    run(ch, 0.1, dt);
    return ch.facing.sh;
  };
  const a = at(1 / 30), b = at(1 / 60), c = at(1 / 144);
  assert.ok(Math.abs(a - b) < 0.03 && Math.abs(b - c) < 0.03, `${a} ${b} ${c}`);
});

test('facing: walking, the hips are the gait\'s and nothing is planted; stopping plants the feet under him', () => {
  const ch = man(0);
  ch.footA = 0.7;
  updateFacing(ch, DT, false);
  assert.equal(ch.facing.hip, 0.7);
  assert.equal(ch.facing.feet, null);
  updateFacing(ch, DT, true);
  assert.ok(ch.facing.feet && Math.abs(angDiff(feetAngle(ch.facing.feet), 0.7)) < 1e-9);
});

test('door: a hand reaches for the leaf ahead only, within reach, and not for one swung wide open', () => {
  const door = Object.create(Door.prototype);
  Object.assign(door, { hx: 0, hy: 0, len: 30, back: 2, a0: 0, body: { angle: 0 } }); // along x from the hinge
  const out = {}, G = GESTURE.door;
  assert.ok(doorAhead([door], 15, 20, 10, 0, -1, out), 'going at it');
  assert.ok(Math.abs(out.d - 17) < 1e-9 && out.door === door);
  assert.equal(doorAhead([door], 15, 20, 10, 0, 1, out), null, 'going away from it');
  assert.equal(doorAhead([door], 15, 20, 10, 1, 0, out), null, 'going by it');
  assert.equal(doorAhead([door], 15, 10 + G.ahead + 8, 10, 0, -1, out), null, 'too far yet');
  door.body.angle = 1.4; // swung open: walked past, unless he is right against it
  assert.equal(doorAhead([door], -5, 15, 10, 0, -1, out), null);
});

test('door: the hand on the side of the free end of the leaf, the left one when the right is on a weapon', () => {
  // facing up (-PI/2): his right is +x
  const tip = { x: 30, y: 0 }, at = { x: 15, y: 0 };
  assert.equal(doorHandSide(-Math.PI / 2, 15, 15, at, tip, false), 1);
  assert.equal(doorHandSide(-Math.PI / 2, 15, 15, at, { x: -10, y: 0 }, false), -1, 'hinged the other way');
  assert.equal(doorHandSide(-Math.PI / 2, 15, 15, at, tip, true), -1);
});

test('talk: every gesture names occasions that exist, and an occasion has one gesture at most', () => {
  const seen = new Set();
  for (const [g, kinds] of Object.entries(TALK)) {
    for (const k of kinds) {
      assert.ok(BARKS[k], `${g}: no occasion '${k}'`);
      assert.ok(!seen.has(k), `'${k}' twice`);
      seen.add(k);
    }
  }
  assert.equal(talkGesture('out'), 'point');
  assert.equal(talkGesture('call'), 'beckon');
  assert.equal(talkGesture('clear'), 'shrug');
  assert.equal(talkGesture('reload'), 'nod', 'anything else: the head only');
  // never with hands that are taken
  assert.equal(talkHand(true, null), 0);
  assert.equal(talkHand(false, null), 1);
  assert.equal(talkHand(false, { hold: 'side', raised: true }), -1, 'a handgun in one hand: the other one');
  assert.equal(talkHand(false, { hold: 'both', raised: true }), 0, 'a pistol up in both hands: none');
  assert.equal(talkHand(false, { hold: 'two', raised: false }), 0);
  const T = GESTURE.talk;
  assert.ok(talkAt(0) === 0 && talkAt(T.dur / 2) === 1 && talkAt(T.dur) === 0);
});

test('draw: the hand gets to the weapon, closes on it, pulls it out, brings it up, the other hand last', () => {
  const D = GESTURE.draw, at = (p) => drawPhases(p, {});
  assert.deepEqual(Object.values(at(0)), [0, 0, 0, 0, 0], 'put away');
  assert.deepEqual(Object.values(at(1)), [1, 1, 1, 1, 1], 'in hand');
  const r = at(D.reach[1]);
  assert.ok(r.reach === 1 && r.grip === 0 && r.pull === 0, 'at the holster, not yet holding it');
  const g = at(D.pull);
  assert.ok(g.grip === 1 && g.pull === 1 && g.present === 0, 'out of it, not yet up');
  assert.equal(at(D.support).support, 0);
  // each phase only goes forward as the draw does
  let prev = at(0);
  for (let p = 0.01; p <= 1; p += 0.01) {
    const c = at(p);
    for (const k of Object.keys(c)) assert.ok(c[k] >= prev[k] - 1e-12, `${k} at ${p}`);
    prev = c;
  }
});
