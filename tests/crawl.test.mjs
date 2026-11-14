import { test } from 'node:test';
import assert from 'node:assert/strict';
import { load } from './setup.mjs';

const { CRAWL, SPASM, CURL } = await load('game/data/wounds.js');
const { crawlPlan, pullAt, travelAt, crawlPose, lastPose, escapeDir } = await load('game/fx/CrawlPose.js');
const { spasmPlan, spasmPose, curlPlan, curlPose } = await load('game/fx/DyingPose.js');

// a thug's rag parts: shoulders and hips on the torso (torso-local), limb lengths
const GEOM = { arms: [{ x: -6, y: -5, len: 9 }, { x: 6, y: -5, len: 9 }], legs: [{ x: -3, y: 7, len: 11 }, { x: 3, y: 7, len: 11 }] };
const LEN = GEOM.arms[0].len;
const SEEDS = Array.from({ length: 300 }, (_, i) => i * 7919 + 1);
const near = (a, b, eps = 1e-6) => Math.abs(a - b) < eps;
const limbs = (P) => [...P.arms, ...P.legs];
const samePose = (P, Q, eps) => near(P.rock, Q.rock, eps) && near(P.head.a, Q.head.a, eps) && near(P.head.s, Q.head.s, eps)
  && limbs(P).every((p, i) => near(p.a, limbs(Q)[i].a, eps) && near(p.s, limbs(Q)[i].s, eps));
// where the hand of arm k is, torso-local, in a pose
const hand = (P, k) => {
  const g = GEOM.arms[k], q = P.arms[k];
  return { x: g.x + Math.cos(q.a) * q.s * g.len, y: g.y + (q.dy || 0) + Math.sin(q.a) * q.s * g.len };
};
// a man fallen any old way (limb angles off the torso's)
const FELL = { arms: [{ a: 2.6, s: 1 }, { a: 0.2, s: 1 }], legs: [{ a: 1.9, s: 1 }, { a: 1.3, s: 1 }], head: { a: 0.1, s: 1 } };

test('crawl: a seed makes the same crawl every time, and no two pulls are alike', () => {
  assert.deepEqual(crawlPlan(1234, LEN), crawlPlan(1234, LEN));
  assert.notDeepEqual(crawlPlan(1234, LEN), crawlPlan(4321, LEN));
  for (const seed of SEEDS) {
    const { pulls } = crawlPlan(seed, LEN);
    assert.ok(pulls.length >= CRAWL.pulls[0] && pulls.length <= CRAWL.pulls[1]);
    for (let i = 1; i < pulls.length; i++) {
      assert.notEqual(pulls[i].dur, pulls[i - 1].dur);
      assert.notEqual(pulls[i].arm, pulls[i - 1].arm); // the arms take turns
    }
    assert.ok(!pulls[0].fail && pulls.filter((p) => p.fail).length <= 1, 'one pull may fail, never the first');
  }
});

test('crawl: the pulls shorten and slow down as he weakens, the second arm is the weaker', () => {
  const n = CRAWL.pulls[0], d = Array(n).fill(0), t = Array(n).fill(0);
  let strong = 0, weak = 0;
  for (const seed of SEEDS) {
    crawlPlan(seed, LEN).pulls.slice(0, n).forEach((p, i) => {
      d[i] += p.d;
      t[i] += p.dur;
      if (!p.fail) { if (p.weak) weak += p.d; else strong += p.d; }
    });
  }
  // pulls 0 and 2 are the strong arm's
  assert.ok(d[2] < d[0] && t[2] > t[0]);
  assert.ok(weak < strong);
});

test('crawl: short and not for long', () => {
  let far = 0, slowest = 0, sum = 0;
  for (const seed of SEEDS) {
    const plan = crawlPlan(seed, LEN);
    const T = CRAWL.fall + CRAWL.turn + plan.pulls.reduce((a, p) => a + p.dur, 0) + CRAWL.last;
    far = Math.max(far, plan.far);
    slowest = Math.max(slowest, T);
    sum += T;
  }
  // under a metre and a quarter (1 m = 32 px), over in a few seconds
  assert.ok(far > 12 && far < 40, 'px crawled at most: ' + far);
  assert.ok(slowest < 8.5 && sum / SEEDS.length > 4 && sum / SEEDS.length < 7, 's: ' + slowest + ', mean ' + sum / SEEDS.length);
});

test('crawl: the travel adds up, the body moves only while it is hauled, and a failed pull leaves it where it was', () => {
  let failed = 0;
  for (const seed of SEEDS) {
    const plan = crawlPlan(seed, LEN);
    let total = 0, t = 0;
    plan.pulls.forEach((p, i) => {
      assert.ok(near(travelAt(plan, i, 0), total));
      assert.deepEqual(pullAt(plan, t + 1e-6).i, i);
      const [tr, tc, th] = p.t;
      for (let u = 0; u <= tr + tc; u += 0.01) assert.ok(near(travelAt(plan, i, u), total), 'still before the haul');
      let last = total;
      for (let u = tr + tc; u <= p.dur; u += 0.01) {
        const d = travelAt(plan, i, u);
        assert.ok(d >= last - 1e-9 && d <= total + p.d + 1e-9);
        last = d;
      }
      assert.ok(near(travelAt(plan, i, tr + tc + th), total + p.d));
      if (p.fail) {
        failed++;
        assert.equal(p.d, 0);
        // the hand slides back toward him on the floor while the body stays
        const a = hand(crawlPose(plan, i, tr + tc, GEOM), p.arm), b = hand(crawlPose(plan, i, tr + tc + th, GEOM), p.arm);
        assert.ok(b.y > a.y + 1);
      }
      total += p.d;
      t += p.dur;
    });
    assert.ok(near(plan.far, total) && near(travelAt(plan, plan.pulls.length, 0), total));
    assert.equal(pullAt(plan, t + 0.01).i, plan.pulls.length);
  }
  assert.ok(failed > 20 && failed < SEEDS.length * 0.6, 'failed pulls: ' + failed);
});

test('crawl: the planted hand stays on its spot while the body is hauled up to it', () => {
  for (const seed of SEEDS.slice(0, 60)) {
    const plan = crawlPlan(seed, LEN);
    plan.pulls.forEach((p, i) => {
      if (p.fail) return;
      const [tr, tc, th] = p.t, u0 = tr + tc;
      const at = (u) => { const h = hand(crawlPose(plan, i, u, GEOM), p.arm); return { x: h.x, y: h.y - travelAt(plan, i, u) }; };
      const h0 = at(u0);
      for (let u = u0; u <= u0 + th; u += 0.01) assert.ok(Math.hypot(at(u).x - h0.x, at(u).y - h0.y) < 0.2, `seed ${seed} pull ${i}`);
      // and it was put down ahead of the shoulder
      assert.ok(h0.y < GEOM.arms[p.arm].y - LEN * 0.5);
    });
  }
});

test('crawl: no pop from one pull to the next, nor into the end, and limbs keep their length', () => {
  for (const seed of SEEDS.slice(0, 60)) {
    const plan = crawlPlan(seed, LEN);
    plan.pulls.forEach((p, i) => {
      const next = i + 1 < plan.pulls.length ? crawlPose(plan, i + 1, 0, GEOM) : lastPose(plan, i + 1, 0, GEOM);
      assert.ok(samePose(crawlPose(plan, i, p.dur - 1e-9, GEOM), next, 1e-6), `seed ${seed} pull ${i}`);
      // stopped before pull i (a wall): the end starts where he lies
      assert.ok(samePose(lastPose(plan, i, 0, GEOM, i ? 0 : 0.6), crawlPose(plan, i, 0, GEOM, i ? 0 : 0.6), 1e-6));
      for (let u = 0; u < p.dur; u += 0.01) {
        const P = crawlPose(plan, i, u, GEOM, 0.6);
        assert.ok(samePose(P, crawlPose(plan, i, u + 0.01, GEOM, 0.6), 0.25), `seed ${seed} pull ${i} u ${u}`);
        for (const q of [...limbs(P), P.head]) assert.ok(q.s > 0.25 && q.s <= 1);
      }
    });
  }
});

test('crawl: the end is a last reach forward, then everything goes slack and still', () => {
  for (const seed of SEEDS.slice(0, 60)) {
    const plan = crawlPlan(seed, LEN);
    for (let i = 0; i <= plan.pulls.length; i++) {
      const arm = (plan.strong + i) % 2;
      const reached = lastPose(plan, i, CRAWL.last * 0.45, GEOM);
      assert.ok(hand(reached, arm).y < GEOM.arms[arm].y - LEN * 0.6, 'the hand reaches out ahead of him');
      for (let u = 0; u < CRAWL.last; u += 0.01) assert.ok(samePose(lastPose(plan, i, u, GEOM), lastPose(plan, i, u + 0.01, GEOM), 0.25));
      const end = lastPose(plan, i, CRAWL.last, GEOM);
      // every limb straight again (the body is baked as it is drawn), the torso square, the head down on one side
      for (const q of [...limbs(end), end.head]) assert.ok(near(q.s, 1));
      assert.ok(near(end.rock, 0) && Math.abs(end.head.a) > 0.4);
      assert.ok(samePose(lastPose(plan, i, CRAWL.last + 1, GEOM), end, 1e-9));
    }
  }
});

test('crawl: a way blocked by a wall is turned off, or refused', () => {
  assert.equal(escapeDir(1, () => false), 1);
  assert.ok(near(escapeDir(0, (a) => Math.abs(a) < 0.3), 0.6));
  assert.ok(near(Math.abs(escapeDir(0, (a) => Math.abs(a) < 1)), 1.2));
  assert.equal(escapeDir(0, () => true), null);
});

test('spasm: a few kicks, each weaker and slower, from where he fell back to it', () => {
  assert.deepEqual(spasmPlan(99), spasmPlan(99));
  for (const seed of SEEDS) {
    const plan = spasmPlan(seed), k = plan.kicks;
    assert.ok(plan.dur >= SPASM.dur[0] && plan.dur <= SPASM.dur[1]);
    assert.ok(k.length >= SPASM.kicks[0] && k.length <= SPASM.kicks[1]);
    for (let j = 1; j < k.length; j++) assert.ok(k[j].amp < k[j - 1].amp && k[j].d > k[j - 1].d && k[j].t0 >= k[j - 1].t0 + k[j - 1].d - 1e-9);
    assert.ok(k.at(-1).t0 + k.at(-1).d <= plan.dur);
    assert.ok(samePose(spasmPose(plan, 0, FELL, GEOM), { ...FELL, rock: 0 }, 1e-9));
    assert.ok(samePose(spasmPose(plan, plan.dur, FELL, GEOM), { ...FELL, rock: 0 }, 1e-9));
    // how far the kicking leg bends at the height of each kick: less every time
    const bend = k.map((x) => Math.max(...Array.from({ length: 21 }, (_, n) => 1 - spasmPose(plan, x.t0 + x.d * n / 20, FELL, GEOM).legs[plan.leg].s)));
    for (let j = 1; j < bend.length; j++) assert.ok(bend[j] < bend[j - 1]);
    for (let u = 0; u < plan.dur; u += 0.01) {
      const P = spasmPose(plan, u, FELL, GEOM);
      for (const q of [...limbs(P), P.head]) assert.ok(q.s > 0.4 && q.s <= 1);
      assert.ok(P.arch <= 1 && P.arch > 0.85 && P.roll === 1);
      assert.ok(samePose(P, spasmPose(plan, u + 0.01, FELL, GEOM), 0.25));
    }
  }
});

test('curl: hands to the wound, knees drawn up, rolled onto his side, then slack', () => {
  assert.deepEqual(curlPlan(5), curlPlan(5));
  for (const seed of SEEDS) {
    const plan = curlPlan(seed);
    assert.ok(plan.dur >= CURL.dur[0] && plan.dur <= CURL.dur[1]);
    assert.ok(samePose(curlPose(plan, 0, FELL, GEOM, true), { ...FELL, rock: 0 }, 1e-9));
    const held = curlPose(plan, plan.dur * 0.5, FELL, GEOM, true);
    for (let k = 0; k < 2; k++) {
      const h = hand(held, k);
      assert.ok(Math.hypot(h.x - plan.wound.x, h.y - plan.wound.y) < 3, 'a hand on the wound');
    }
    assert.ok(held.legs.every((q) => q.s < 0.7) && held.roll < 0.8 && held.top);
    assert.ok(!curlPose(plan, plan.dur * 0.5, FELL, GEOM, false).top, 'face down, the hands go under him');
    const end = curlPose(plan, plan.dur, FELL, GEOM, true);
    for (const q of [...limbs(end), end.head]) assert.ok(near(q.s, 1));
    assert.ok(near(end.roll, 1) && !end.top);
    for (let u = 0; u < plan.dur; u += 0.01) {
      const P = curlPose(plan, u, FELL, GEOM, true);
      for (const q of [...limbs(P), P.head]) assert.ok(q.s > 0.4 && q.s <= 1);
      assert.ok(samePose(P, curlPose(plan, u + 0.01, FELL, GEOM, true), 0.25));
    }
  }
});
