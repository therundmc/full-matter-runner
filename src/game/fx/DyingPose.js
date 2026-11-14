// Two short ways of dying on the floor (entities/Ragdoll.js) as pure pose maths: no Matter, no DOM.
//   spasm  he lies as he fell; a leg kicks a few times, each kick weaker and slower, a hand opens and closes, the
//          torso arches on the first kick
//   curl   the hands come to the wound, the knees draw up, he rolls a little onto his side, holds, then goes slack
// Same frame and poses as fx/CrawlPose.js; `from` is the pose he fell in ({ arms, legs, head }, limb angles off the
// torso's). Both return { rock (rad, added to the torso angle), roll (squeeze across: rolled onto his side), arch
// (squeeze along: the back arched), top (the arms lie over the torso), arms, legs, head } and end where they began
// or slack, every limb straight (the body is baked as it is drawn).
import { SPASM, CURL } from '../data/wounds.js';
import { angDiff, clamp } from '../../engine/math.js';
import { rng, smooth, mix } from './CrawlPose.js';

const KICK_SLOW = 1.35; // each kick lasts this much longer than the one before
const KICK_FADE = 0.6;  // and is this much as strong
const IN = 0.35, OUT = 0.7; // shares of a curl: drawn in until, held until, then slack

const mixA = (a, b, t) => a + angDiff(a, b) * t;
const mixPose = (p, q, t) => ({ a: mixA(p.a, q.a, t), s: mix(p.s, q.s, t) });
// a jerk: fast out, slower back
const jerk = (v) => (v <= 0 || v >= 1 ? 0 : v < 0.3 ? smooth(v / 0.3) : 1 - smooth((v - 0.3) / 0.7));
// the turn that takes a limb on the side of joint g, lying toward the feet, out away from the body
const outward = (g) => (g.x < 0 ? 1 : -1);

// { dur (s), kicks: [{ t0, d (s), amp }], leg, hand (which ones), grips (times the hand closes), side (of the arch) }
export function spasmPlan(seed) {
  const R = rng(seed), [k0, k1] = SPASM.kicks, n = k0 + Math.floor(R() * (k1 - k0 + 1));
  const dur = mix(SPASM.dur[0], SPASM.dur[1], R());
  const w = Array.from({ length: n }, (_, j) => KICK_SLOW ** j), sum = w.reduce((a, b) => a + b, 0);
  let t = 0.05 * dur;
  const kicks = w.map((x, j) => {
    const k = { t0: t, d: (x / sum) * dur * 0.8, amp: KICK_FADE ** j * mix(0.85, 1.1, R()) };
    t += k.d;
    return k;
  });
  return { dur, kicks, leg: R() < 0.5 ? 0 : 1, hand: R() < 0.5 ? 0 : 1, grips: 2 + Math.floor(R() * 2), side: R() < 0.5 ? -1 : 1 };
}

export function spasmPose(plan, u, from, geom) {
  let kick = 0;
  for (const k of plan.kicks) kick += k.amp * jerk((u - k.t0) / k.d);
  const first = plan.kicks[0], arch = first.amp * jerk((u - first.t0) / first.d);
  // the hand closes and opens again, slower each time, done before the end
  const g = clamp(u / (plan.dur * 0.8), 0, 1), grip = 0.5 - 0.5 * Math.cos(Math.PI * 2 * plan.grips * Math.sqrt(g));
  const legs = from.legs.map((p, k) => {
    const o = outward(geom.legs[k]);
    if (k === plan.leg) return { a: p.a + o * 0.45 * kick, s: p.s * (1 - 0.35 * kick) };
    return { a: p.a + o * 0.08 * kick, s: p.s };
  });
  const arms = from.arms.map((p, k) => (k === plan.hand ? { a: p.a + outward(geom.arms[k]) * 0.12 * grip, s: p.s * (1 - 0.15 * grip) } : p));
  return {
    rock: plan.side * 0.06 * arch, roll: 1, arch: 1 - 0.12 * arch, top: false, arms, legs,
    head: { a: from.head.a, s: from.head.s * (1 - 0.2 * arch) },
  };
}

// { dur (s), side (he rolls toward), wound: { x, y } (torso-local, where his hands go) }
export function curlPlan(seed) {
  const R = rng(seed);
  return { dur: mix(CURL.dur[0], CURL.dur[1], R()), side: R() < 0.5 ? -1 : 1, wound: { x: mix(-2, 2, R()), y: mix(-2, 3, R()) } };
}

// up: he lies on his back (the hands come over the torso, else they go under it)
export function curlPose(plan, u, from, geom, up) {
  const v = u / plan.dur, inK = smooth(v / IN), outK = smooth((v - OUT) / (1 - OUT)), hold = inK * (1 - outK);
  const shake = hold * Math.sin(u * 31), side = plan.side;
  const arms = from.arms.map((p, k) => {
    const g = geom.arms[k], dx = plan.wound.x - g.x, dy = plan.wound.y - g.y;
    const held = { a: Math.atan2(dy, dx) + 0.04 * shake, s: clamp(Math.hypot(dx, dy) / g.len, 0.45, 1) };
    // slack: slid off the wound, lying along his side
    const slack = { a: Math.PI / 2 + outward(g) * 0.35, s: 1 };
    return mixPose(mixPose(p, held, inK), slack, outK);
  });
  const legs = from.legs.map((p, k) => {
    const drawn = { a: Math.PI / 2 + side * 0.55 + outward(geom.legs[k]) * 0.1, s: 0.55 };
    return mixPose(mixPose(p, drawn, inK), { a: mixA(p.a, drawn.a, 0.5), s: 1 }, outK);
  });
  return {
    rock: side * (0.18 * inK - 0.1 * outK) + 0.015 * shake, roll: 1 - CURL.roll * hold, arch: 1, top: up && hold > 0.2,
    arms, legs, head: { a: from.head.a + side * (0.35 * inK - 0.1 * outK), s: from.head.s * (1 - 0.15 * hold) },
  };
}
