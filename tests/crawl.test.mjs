import { test } from 'node:test';
import assert from 'node:assert/strict';
import { load } from './setup.mjs';

const { CRAWL } = await load('game/data/wounds.js');
const { schedule, phaseAt, stepOf, travelAt, crawlPose, giveUpPose, escapeDir } = await load('game/fx/CrawlPose.js');

// a thug's rag parts: shoulders and hips on the torso (torso-local), limb lengths
const GEOM = { arms: [{ x: -6, y: -5, len: 9 }, { x: 6, y: -5, len: 9 }], legs: [{ x: -3, y: 7, len: 11 }, { x: 3, y: 7, len: 11 }] };
const near = (a, b, eps = 1e-6) => Math.abs(a - b) < eps;
const samePose = (P, Q, eps) => near(P.rock, Q.rock, eps) && near(P.head.a, Q.head.a, eps) && near(P.head.s, Q.head.s, eps)
  && [...P.arms, ...P.legs].every((p, i) => near(p.a, [...Q.arms, ...Q.legs][i].a, eps) && near(p.s, [...Q.arms, ...Q.legs][i].s, eps));

test('crawl: the phases come in order and their durations add up', () => {
  for (const pulls of [CRAWL.pulls[0], CRAWL.pulls[1]]) {
    const plan = schedule(pulls);
    assert.deepEqual(plan.map(([n]) => n), ['fall', 'turn', 'crawl', 'giveUp']);
    let t = 0;
    for (const [name, d] of plan) {
      assert.equal(phaseAt(t + 0.01, pulls).name, name);
      assert.ok(near(phaseAt(t + d - 0.01, pulls).u, d - 0.01));
      t += d;
    }
    assert.ok(near(t, CRAWL.fall + CRAWL.turn + pulls * CRAWL.cycle + CRAWL.giveUp));
    assert.equal(phaseAt(t + 0.01, pulls).name, 'done');
  }
});

test('crawl: the torso goes a step on each push, never in the recovery, and the steps decay', () => {
  assert.equal(stepOf(0), CRAWL.step);
  for (let i = 0; i < CRAWL.pulls[1]; i++) {
    if (i) assert.ok(stepOf(i) < stepOf(i - 1));
    assert.ok(near(travelAt(i, 0.5) - travelAt(i, 0), stepOf(i)));
    for (let p = 0.5; p < 1; p += 0.05) assert.ok(near(travelAt(i, p), travelAt(i, 0.5)), `cycle ${i} p ${p}`);
    let last = travelAt(i, 0);
    for (let p = 0.02; p < 0.5; p += 0.02) { assert.ok(travelAt(i, p) >= last); last = travelAt(i, p); }
    assert.ok(near(travelAt(i + 1, 0), travelAt(i, 0.999)));
  }
});

test('crawl: the arms take turns, the one planted past the shoulder pulls', () => {
  // the planted arm points toward the head (-y): the other lies along the body
  const planted = (i) => crawlPose(i, 0, GEOM, 0, 0).arms.findIndex((p) => Math.sin(p.a) < 0);
  for (let i = 0; i < 4; i++) {
    assert.notEqual(planted(i), -1);
    assert.notEqual(planted(i), planted(i + 1));
    assert.equal(crawlPose(i, 0, GEOM, 0, 0).arms.filter((p) => Math.sin(p.a) < 0).length, 1);
  }
  assert.notEqual(crawlPose(0, 0, GEOM, 0, 0).arms[0].a, crawlPose(0, 0, GEOM, 1, 0).arms[0].a);
});

test('crawl: no pop from one cycle to the next, nor into giving up, and he ends at rest', () => {
  for (let i = 0; i < CRAWL.pulls[1]; i++) {
    for (const first of [0, 1]) assert.ok(samePose(crawlPose(i, 1 - 1e-9, GEOM, first, 0.3), crawlPose(i + 1, 0, GEOM, first, 0.3), 1e-6), `cycle ${i}`);
    // within a cycle the pose moves smoothly
    for (let p = 0; p < 1; p += 0.01) assert.ok(samePose(crawlPose(i, p, GEOM, 0, 0.3), crawlPose(i, p + 0.01, GEOM, 0, 0.3), 0.15), `cycle ${i} p ${p}`);
  }
  const still = crawlPose(2, 0, GEOM, 1, -0.4);
  assert.ok(samePose(giveUpPose(0, still, GEOM, 0, Math.PI / 2, -0.4), still, 1e-9));
  const end = giveUpPose(CRAWL.giveUp, still, GEOM, 0, Math.PI / 2, -0.4);
  // every limb straight again: the body is baked as it is drawn
  for (const p of [...end.arms, ...end.legs, end.head]) assert.ok(near(p.s, 1));
  // and it gets there smoothly
  for (let u = 0; u < CRAWL.giveUp; u += 0.01) {
    assert.ok(samePose(giveUpPose(u, still, GEOM, 0, Math.PI / 2, -0.4), giveUpPose(u + 0.01, still, GEOM, 0, Math.PI / 2, -0.4), 0.2), `u ${u}`);
  }
});

test('crawl: the arm that reaches out points toward his killer, within reach of a man on his back', () => {
  const still = crawlPose(1, 0, GEOM, 0, 0);
  const held = (reach, a) => giveUpPose(0.6, still, GEOM, reach, a, 0).arms[reach];
  // the killer at his feet: the arm points that way
  assert.ok(Math.sin(held(1, Math.PI / 2).a) > 0.9);
  // the killer behind his head: never back over it
  assert.ok(Math.sin(held(1, -Math.PI / 2).a) > 0);
  assert.ok(Math.sin(held(0, -Math.PI / 2).a) > 0);
});

test('crawl: a way blocked by a wall is turned off, or refused', () => {
  assert.equal(escapeDir(1, () => false), 1);
  assert.ok(near(escapeDir(0, (a) => Math.abs(a) < 0.3), 0.6));
  assert.ok(near(Math.abs(escapeDir(0, (a) => Math.abs(a) < 1)), 1.2));
  assert.equal(escapeDir(0, () => true), null);
});
