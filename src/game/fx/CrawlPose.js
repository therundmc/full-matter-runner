// The last crawl of a man not quite dead (entities/Ragdoll.js) as pure pose maths: no Matter, no DOM.
// He lies on his belly, head away from his killer, and drags himself along on his forearms, a pull at a time: a
// forearm reaches forward and plants, the fingers claw, the body is hauled up to it, hips swinging to that side, the
// head lifting on the effort and dropping after it. The arms take turns, the second one weaker; the legs trail, a
// knee pushing feebly now and then. Every pull is drawn from the body's seed (crawlPlan): shorter, slower and further
// apart as he weakens, and one of them may fail (the hand slips back, the body stays). Then a last reach (lastPose).
// Frame: torso-local, x across the body, y toward the feet (the head is toward -y); angles as atan2 in that frame
// (0 = +x, PI/2 = toward the feet). A limb pose is { a, s }: its angle and the scale of its length (s < 1: bent or
// raised, seen from above); an arm's may carry dy, its shoulder moved along the body (px, < 0: brought forward).
// The head pose is { a, s }: its turn off the torso axis and its length along the neck. Arm and leg 0 lie on the -x
// side (entities/Ragdoll.js builds them so). Hands are placed relative to the shoulder at rest, in arm lengths, as
// for an arm on the +x side (mirrored onto the other side when posed).
import { CRAWL } from '../data/wounds.js';
import { lerp, smooth, seeded } from '../../engine/math.js';

const ARM_MIN = 0.28;                // shortest an arm is drawn: the hand by the shoulder, the elbow up and out
const TUCK = { x: 0.42, y: -0.24 };  // a hand gathered under the shoulder, where both start
const OUT = [0.22, 0.45];            // rad off the body axis a reaching forearm plants
const PRO = 2.5;                     // px the shoulder comes forward with a reaching arm
const NEAR = 0.25;                   // arm lengths ahead of the shoulder a hauling hand stops at the nearest
const SLIP = 0.32;                   // arm lengths a slipping hand slides back toward him
const DRAG = 0.3;                    // share of a pull the idle hand is left behind by, dragged on the floor
const ROCK = 0.18;                   // rad the torso swings on a pull, the hips toward the pulling arm
const TRAIL = 0.8;                   // share of that swing the limp legs do not follow
const LIFT = 0.28;                   // the head lifted on the effort: its length along the neck shortens this much
const KNEE = 0.3;                    // a knee drawn up: the leg shortens this much and falls out this much (rad)
const LAST = [0.3, 0.6, 0.8];        // shares of the last reach: reach, claw until, drop until, then a shudder
const LAST_PLANT = { x: Math.sin(0.35) * 0.9, y: -Math.cos(0.35) * 0.9 };

const lerpPt = (p, q, t) => ({ x: lerp(p.x, q.x, t), y: lerp(p.y, q.y, t) });
// the body hauled up to the hand: a slow start against his weight, a surge, a slow end
const heave = (v) => (v <= 0 ? 0 : v >= 1 ? 1 : smooth(v) ** 1.4 / (smooth(v) ** 1.4 + (1 - smooth(v)) ** 1.4));

// a pose of the +x side mirrored onto the side of joint g
const sided = (g, p) => (g.x < 0 ? { a: Math.PI - p.a, s: p.s } : p);

// the arm of joint g reaching hand h (joint-relative, arm lengths, +x side), shortened by lift when off the floor,
// its shoulder dy px along the body (dy < 0: brought forward)
function armTo(g, h, lift = 1, dy = 0) {
  const x = h.x, y = h.y - dy / g.len;
  return { ...sided(g, { a: Math.atan2(y, x), s: Math.max(ARM_MIN, Math.min(1, Math.hypot(x, y)) * lift) }), dy };
}

// The crawl of one body. seed: its moves; len: its arm length (px), which bounds how far a hand can haul him.
// Returns { strong (the arm that pulls first), legs (rad each leg lies off the axis), pulls, end (the hands after
// the last pull), rockEnd, far (px) }. A pull: { arm, weak, fail, d (px hauled), at (px before it), t: [reach, claw,
// haul, pause] (s), dur, from / plant / to (the pulling hand), idle / idleTo (the other hand), rock0 / rock1 (rad),
// knee (the leg on the pulling side pushes), tilt (the head's turn on the effort) }.
export function crawlPlan(seed, len) {
  const R = seeded(seed), J = ([a, b]) => a + (b - a) * R();
  const [n0, n1] = CRAWL.pulls, n = n0 + Math.floor(R() * (n1 - n0 + 1));
  const strong = R() < 0.5 ? 0 : 1;
  const slip = R() < CRAWL.slip ? 1 + Math.floor(R() * (n - 1)) : -1; // the pull that fails, never the first
  const legs = [J([0.06, 0.22]), J([0.06, 0.22])];
  const hands = [TUCK, TUCK], pulls = [];
  let rock = 0, at = 0;
  for (let i = 0; i < n; i++) {
    const arm = (strong + i) % 2, weak = arm !== strong, fail = i === slip;
    const k = CRAWL.decay ** i, slow = 1 + (1 - k) * CRAWL.slow;
    // planted out ahead, the shoulder brought forward with it; it stays there while the body is hauled up to it
    const out = J(OUT), r = weak ? J([0.78, 0.88]) : J([0.9, 0.98]);
    const plant = { x: Math.sin(out) * r, y: -Math.cos(out) * r - PRO / len };
    const d = fail ? 0 : Math.min(CRAWL.step * k * J([0.8, 1.2]) * (weak ? CRAWL.weak : 1), (-NEAR - plant.y) * len);
    const to = { x: plant.x, y: plant.y + (fail ? SLIP : d / len) };
    const idle = hands[1 - arm], idleTo = { x: idle.x, y: Math.min(0.6, idle.y + DRAG * d / len) };
    const t = [J(CRAWL.reach) * slow, J(CRAWL.claw) * slow * (fail ? 1.8 : 1), J(CRAWL.haul) * slow, J(CRAWL.pause) * slow];
    const rock1 = (arm ? -1 : 1) * ROCK * (0.6 + 0.4 * k) * J([0.7, 1.2]) * (fail ? 0.4 : 1);
    pulls.push({ arm, weak, fail, d, at, t, dur: t[0] + t[1] + t[2] + t[3], from: hands[arm], plant, to, idle, idleTo,
      rock0: rock, rock1, knee: !weak && R() < CRAWL.knee, tilt: J([-0.15, 0.15]) });
    hands[arm] = to;
    hands[1 - arm] = idleTo;
    rock = rock1 * 0.55;
    at += d;
  }
  return { strong, legs, pulls, end: hands, rockEnd: rock, far: at };
}

// which pull t s into the crawl falls in: { i, u: s into it } (i = the number of pulls once they are all done)
export function pullAt(plan, t) {
  let i = 0;
  for (const p of plan.pulls) {
    if (t < p.dur) return { i, u: t };
    t -= p.dur;
    i++;
  }
  return { i, u: t };
}

// how far along pull p the body is hauled, u s into it (0 to 1)
const hauled = (p, u) => heave((u - p.t[0] - p.t[1]) / p.t[2]);

// px the torso has travelled since the crawl started, u s into pull i
export function travelAt(plan, i, u) {
  const p = plan.pulls[i];
  return p ? p.at + p.d * hauled(p, u) : plan.far;
}

// the legs trailing, the torso swung by rock; the leg with a knee drawn up by `knee` (0 to 1)
function trail(plan, geom, rock, bent = -1, knee = 0) {
  return geom.legs.map((g, k) => {
    const b = k === bent ? knee : 0;
    const q = sided(g, { a: Math.PI / 2 - plan.legs[k] - KNEE * b, s: 1 - KNEE * b });
    return { a: q.a - TRAIL * rock, s: q.s };
  });
}

// The pose u s into pull i. geom = { arms: [{ x, y, len }] x2, legs: [...] x2 }: joints (torso-local) and limb
// lengths; look = the head's turn as he glances back at his killer before the first pull.
// Returns { rock (rad, added to the torso angle), arms, legs, head }.
export function crawlPose(plan, i, u, geom, look = 0) {
  const p = plan.pulls[i], [tr, tc, th, tp] = p.t;
  const reach = smooth(u / tr), w = (u - tr) / tc, v = (u - tr - tc) / th, relax = smooth((u - tr - tc - th) / tp);
  const haul = hauled(p, u);
  // the pulling hand: lifted forward, planted, its fingers digging in twice, then the body comes up to it and the
  // shoulder goes back
  let hand, lift = 1, dy = -PRO;
  if (u < tr) { hand = lerpPt(p.from, p.plant, reach); lift = 1 - 0.18 * Math.sin(Math.PI * reach); dy *= reach; }
  else if (v < 0) hand = { x: p.plant.x, y: p.plant.y + 0.05 * Math.abs(Math.sin(Math.PI * 2 * w)) };
  else { const b = p.fail ? smooth(v) : haul; hand = lerpPt(p.plant, p.to, b); dy *= 1 - b; }
  const arms = geom.arms.map((g, k) => (k === p.arm ? armTo(g, hand, lift, dy) : armTo(g, lerpPt(p.idle, p.idleTo, haul))));
  const rock = v < 1 ? lerp(p.rock0, p.rock1, haul) : lerp(p.rock1, p.rock1 * 0.55, relax);
  // the head: up as he reaches, straining on the haul, dropped once it is over
  const h = u < tr ? 0.5 * reach : v < 0 ? 0.5 + 0.2 * smooth(w) : v < 1 ? 0.7 + 0.3 * Math.sin(Math.PI * v) : 0.7 * (1 - relax);
  const knee = p.knee ? (v < 0 ? smooth(u / (tr + tc)) : 1 - smooth(v)) : 0;
  return {
    rock, arms, legs: trail(plan, geom, rock, p.arm, knee),
    head: { a: -0.6 * rock + p.tilt * h + (i === 0 ? look * (1 - reach) : 0), s: 1 - LIFT * h },
  };
}

// The end, u s into it, the crawl stopped before pull i (all of them done, or the way shut): one last reach forward,
// the hand claws, the arm drops flat, the head goes down to one side, a shudder through the body, still.
// Every limb lies straight at the end (the body is baked as it is drawn).
export function lastPose(plan, i, u, geom, look = 0) {
  const p = plan.pulls[i], hands = p ? [] : plan.end, rock0 = p ? p.rock0 : plan.rockEnd;
  if (p) { hands[p.arm] = p.from; hands[1 - p.arm] = p.idle; }
  const arm = (plan.strong + i) % 2, w = Math.min(1, u / CRAWL.last);
  const reach = smooth(w / LAST[0]), claw = (w - LAST[0]) / (LAST[1] - LAST[0]);
  const drop = smooth((w - LAST[1]) / (LAST[2] - LAST[1])), shudder = (w - LAST[2]) / (1 - LAST[2]);
  const arms = geom.arms.map((g, k) => {
    if (k !== arm) { const q = armTo(g, hands[k]); return { a: q.a, s: lerp(q.s, 1, drop), dy: 0 }; }
    // lifted off the floor as it goes, the fingers scraping at the end of it, then it falls flat
    const scrape = claw > 0 && claw < 1 ? 0.06 * Math.abs(Math.sin(Math.PI * 3 * claw)) : 0;
    const to = { x: LAST_PLANT.x, y: LAST_PLANT.y - PRO / g.len + scrape };
    const q = armTo(g, lerpPt(hands[k], to, reach), 1 - 0.15 * reach, -PRO * reach);
    return { a: q.a, s: lerp(q.s, 1, drop), dy: lerp(q.dy, 0, drop) };
  });
  const shake = shudder > 0 ? 0.06 * Math.sin(Math.PI * 2 * 5 * shudder) * (1 - shudder) ** 2 : 0;
  const rock = lerp(rock0, 0, drop) + shake;
  const side = geom.arms[arm].x < 0 ? -0.55 : 0.55; // the cheek down toward the hand that reached
  const h = 0.8 * smooth(w / LAST[0]) * (1 - drop);
  const legs = trail(plan, geom, rock).map((q, k) => ({ a: q.a + (k ? shake : -shake), s: q.s }));
  const head = { a: lerp(-0.6 * rock0 + (i === 0 ? look * (1 - reach) : 0), side, drop), s: 1 - LIFT * h };
  return { rock, arms, legs, head };
}

// the escape direction: a, or turned off it when the way is blocked; null when every way is
export function escapeDir(a, blocked) {
  for (const d of [0, 0.6, -0.6, 1.2, -1.2]) if (!blocked(a + d)) return a + d;
  return null;
}
