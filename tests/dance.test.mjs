import { test } from 'node:test';
import assert from 'node:assert/strict';
import { load } from './setup.mjs';

const { Dance, beatAt, poseAt, LOOP } = await load('game/ai/Dance.js');
const { DANCE } = await load('game/data/feel.js');
const { LIGHTING, BODY_SCALE } = await load('game/Config.js');
const { newPose, dancePose } = await load('game/entities/CharacterAnim.js');
const { updateFacing } = await load('game/entities/Facing.js');
const { angDiff } = await load('engine/math.js');

const POLE = { x: 500, y: 300 }, FRONT = Math.PI;
const PER_FRAME = DANCE.bpm / 60 / 60; // beats a 60 Hz frame
const SHOULDER = 6, ARM = 6.9 + 6.7;   // CharacterAnim SHOULDER, LIMB upper + fore

// every frame of two loops of the routine: { b, f } (copies)
function frames() {
  const d = new Dance(POLE.x, POLE.y, FRONT, 0.3), out = [];
  for (let b = 0; b < 2 * LOOP; b += PER_FRAME) {
    const f = d.at(b % LOOP);
    out.push({ b, x: f.x, y: f.y, face: f.face, sh: f.sh, feet: f.feet.map((q) => ({ ...q })), pose: { ...f.pose, hl: { ...f.pose.hl }, hr: { ...f.pose.hr } } });
  }
  return { d, out };
}

test('dance: on the stage light beat, a routine whose moves join up', () => {
  assert.equal(DANCE.bpm, LIGHTING.bpm, 'in step with the stage light pulse');
  const R = DANCE.routine;
  for (let i = 0; i < R.length; i++) {
    const a = R[i], b = R[(i + 1) % R.length];
    assert.ok(Math.abs(a.th[1] - b.th[0]) % 1 < 1e-9, `${a.move} -> ${b.move}: th`);
    assert.equal(a.r[1], b.r[0], `${a.move} -> ${b.move}: r`);
    assert.ok(Math.abs(angDiff(a.face[1], b.face[0])) < 1e-9, `${a.move} -> ${b.move}: face`);
  }
  for (const t of [0, 1.7, 33]) assert.ok(beatAt(t, 0.4) >= 0 && beatAt(t, 0.4) < LOOP);
  assert.ok(Math.abs(beatAt(60 / DANCE.bpm, 0.4) - beatAt(0, 0.4) - 1) < 1e-9, 'a beat a beat');
});

test('dance: her feet stay planted between her steps, under her and on the stage, clear of the pole', () => {
  const { out } = frames();
  let steps = 0;
  for (let i = 1; i < out.length; i++) {
    for (let j = 0; j < 2; j++) {
      const p = out[i - 1].feet[j], q = out[i].feet[j], moved = Math.hypot(q.x - p.x, q.y - p.y);
      const down = (f) => f.lift === 0 && f.heel === 0;
      if (down(p) && down(q)) assert.ok(moved < 1e-9, `foot ${j} skated ${moved.toFixed(3)} px at beat ${out[i].b.toFixed(2)}`);
      if (down(p) && !down(q)) steps++;
      assert.ok(moved < 3, `foot ${j} jumped ${moved.toFixed(2)} px at beat ${out[i].b.toFixed(2)}`);
      const fromBody = Math.hypot(q.x - out[i].x, q.y - out[i].y), fromPole = Math.hypot(q.x - POLE.x, q.y - POLE.y);
      assert.ok(fromBody < 16, `foot ${j} ${fromBody.toFixed(1)} px off her at beat ${out[i].b.toFixed(2)}`);
      assert.ok(fromPole > 6 && fromPole < 21, `foot ${j} ${fromPole.toFixed(1)} px off the pole at beat ${out[i].b.toFixed(2)}`);
    }
  }
  const per = DANCE.routine.reduce((n, m) => n + (m.steps?.length || 0), 0);
  assert.ok(Math.abs(steps - 2 * per) <= 1, `${steps} steps in two loops, ${per} a loop`);
});

test('dance: nothing jumps from one frame to the next, across the moves and round the loop', () => {
  const { out } = frames();
  const keys = ['hipX', 'hipY', 'chX', 'chY', 'bow', 'rise', 'pole'];
  for (let i = 1; i < out.length; i++) {
    const a = out[i - 1], b = out[i], at = `at beat ${b.b.toFixed(2)}`;
    assert.ok(Math.hypot(b.x - a.x, b.y - a.y) < 1.5, `body ${at}`);
    assert.ok(Math.abs(angDiff(a.face, b.face)) < 0.12 && Math.abs(angDiff(a.sh, b.sh)) < 0.12, `turn ${at}`);
    for (const k of keys) assert.ok(Math.abs(b.pose[k] - a.pose[k]) < 0.5, `${k} ${a.pose[k].toFixed(2)} -> ${b.pose[k].toFixed(2)} ${at}`);
    for (const h of ['hl', 'hr']) assert.ok(Math.hypot(b.pose[h].x - a.pose[h].x, b.pose[h].y - a.pose[h].y) < 1, `${h} ${at}`);
  }
  // the routine's own hands, as PastimeArt has them, never far from her
  for (let b = 0; b < LOOP; b += 0.25) {
    const o = poseAt(b);
    assert.ok([o.hl.x, o.hl.y, o.hr.x, o.hr.y].every((v) => Number.isFinite(v) && Math.abs(v) < 14), `hands at ${b}`);
  }
});

test('dance: the hand on the pole stays on it while she goes round it, within reach of her shoulder', () => {
  const d = new Dance(POLE.x, POLE.y, FRONT, 0.3);
  const circle = DANCE.routine.findIndex((m) => m.move === 'circle');
  const from = DANCE.routine.slice(0, circle).reduce((n, m) => n + m.beats, 0);
  let turned = 0, last = null, held = 0;
  for (let b = 0; b < LOOP; b += PER_FRAME) {
    const f = d.at(b), ch = { x: f.x, y: f.y };
    const P = newPose();
    P.ta = f.sh;
    dancePose(ch, P, d, 1);
    if (f.pose.pole < 1) continue;
    held++;
    const hx = ch.x + P.hr.x * BODY_SCALE, hy = ch.y + P.hr.y * BODY_SCALE;
    assert.ok(Math.hypot(hx - POLE.x, hy - POLE.y) < 0.01, `the hand off the pole at beat ${b.toFixed(2)}`);
    const sx = P.tx - Math.sin(P.ta) * SHOULDER * P.s, sy = P.ty + Math.cos(P.ta) * SHOULDER * P.s;
    assert.ok(Math.hypot(P.hr.x - sx, P.hr.y - sy) < ARM * P.s, `the pole out of reach at beat ${b.toFixed(2)}`);
    const a = Math.atan2(f.y - POLE.y, f.x - POLE.x);
    if (b >= from && b < from + DANCE.routine[circle].beats && last !== null) turned += angDiff(last, a);
    last = a;
  }
  assert.ok(held > LOOP / PER_FRAME / 2, 'on the pole most of the routine');
  assert.ok(Math.abs(turned - Math.PI * 2) < 0.2, `once round it: ${turned.toFixed(2)} rad`);
});

test('dance: she owns her feet and her layers (Facing lead); let go, they stay where she left them', () => {
  const d = new Dance(POLE.x, POLE.y, FRONT, 0.3);
  const ch = { angle: 0, x: 0, y: 0, footA: 0, world: { time: 0 }, aware: 0, lead: null };
  let heard = 0;
  for (let b = 0; b < LOOP; b += PER_FRAME) {
    const f = d.at(b);
    ch.x = f.x; ch.y = f.y; ch.angle = f.face; f.w = 1; ch.lead = f;
    if (updateFacing(ch, 1 / 60, true) === 'step') heard++;
    const F = ch.facing;
    assert.ok(!F.step, 'no step of its own');
    for (let j = 0; j < 2; j++) assert.ok(Math.hypot(F.feet[j].x - f.feet[j].x, F.feet[j].y - f.feet[j].y) < 1e-9);
    assert.ok(Math.abs(angDiff(F.sh, f.sh)) < 1e-9 && Math.abs(angDiff(F.head, f.head)) < 1e-9);
  }
  const per = DANCE.routine.reduce((n, m) => n + (m.steps?.length || 0), 0);
  assert.ok(Math.abs(heard - per) <= 1, `her steps heard: ${heard}`);
  const left = ch.facing.feet.map((q) => ({ ...q }));
  ch.lead = null;
  updateFacing(ch, 1 / 60, true);
  for (let j = 0; j < 2; j++) assert.ok(Math.hypot(ch.facing.feet[j].x - left[j].x, ch.facing.feet[j].y - left[j].y) < 1e-9, 'feet kept');
});
