// Short ways of dying (entities/Ragdoll.js) as pure pose maths: no Matter, no DOM.
//   spasm  he lies as he fell; a leg kicks a few times, each kick weaker and slower, a hand opens and closes, the
//          torso arches on the first kick
//   curl   the hands come to the wound, the knees draw up, he rolls a little onto his side, holds, then goes slack
//   throat his throat cut, he sinks onto his knees, both hands at it, pitches forward onto the floor while the artery
//          pumps in weakening spurts, a leg pushes once or twice, the hands slip off, still
// Same frame and poses as fx/CrawlPose.js; `from` is the pose he fell in ({ arms, legs, head }, limb angles off the
// torso's). Both return { rock (rad, added to the torso angle), roll (squeeze across: rolled onto his side), arch
// (squeeze along: the back arched), top (the arms lie over the torso), arms, legs, head } and end where they began
// or slack, every limb straight (the body is baked as it is drawn).
import { SPASM, CURL, THROAT } from '../data/wounds.js';
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

// { dur (s), beats: [{ t0, d (s), k (strength, 0 to 1), sweep (which way its aim runs) }], pushes: [{ t0, d, leg }],
// side (the cheek he lands on) }
export function throatPlan(seed, T = THROAT) {
  const R = rng(seed), J = ([a, b]) => mix(a, b, R());
  const dur = J(T.dur), n = T.beats[0] + Math.floor(R() * (T.beats[1] - T.beats[0] + 1));
  const beats = [];
  // the heart slows: the spurts come further and further apart, each weaker than the last
  for (let i = 0, t = 0.08, gap = T.gap, k = 1; i < n; i++, gap *= T.slow, k *= T.fade) {
    const d = T.beat * (1 + 0.15 * i) * J([0.9, 1.1]);
    if (t + d > dur) break;
    beats.push({ t0: t, d, k: Math.min(1, k * J([0.9, 1.05])), sweep: R() < 0.5 ? -1 : 1 });
    t += gap * J([0.9, 1.1]);
  }
  // once he is down: a leg pushes, maybe the other one after it
  const np = T.push[0] + Math.floor(R() * (T.push[1] - T.push[0] + 1)), leg = R() < 0.5 ? 0 : 1;
  const t0 = T.kneel + (T.hold || 0) + T.pitch + J([0.05, 0.25]);
  const pushes = Array.from({ length: np }, (_, i) => ({ t0: t0 + i * J([0.45, 0.6]), d: J([0.3, 0.42]), leg: (leg + i) % 2 }));
  return { dur, beats, pushes, side: R() < 0.5 ? -1 : 1 };
}

// u s into it. geom = { arms, legs (as for fx/CrawlPose.js), half (half the torso's length, px) }.
// Returns { arch (his length as seen from above: foreshortened while he kneels), rock, roll, top, arms, legs, head
// (with dy: px it sits back over his shoulders while he kneels), jet (0 to 1: how hard the artery throws now),
// jetA (rad its aim is off the line of his neck), z (px above the floor it leaves from), down (he lies on the floor) }.
// T: THROAT, or another of data/wounds.js KNEELS (BEHEAD: the head is gone, the arms hang, he stays on his knees
// T.hold s first; KNEEL, SLUMP: struck down from behind, no spurt; LEDGE, BOWL: from bent over what his head was
// driven into, T.from, partly pitched when T.over). fall: 0..1 of the pitch.
export function throatPose(plan, u, geom, T = THROAT) {
  const half = geom.half, stay = T.hold || 0;
  const kneel = smooth(u / T.kneel), fall = smooth((u - T.kneel - stay) / T.pitch) * (T.over ?? 1), up = 1 - fall;
  const slipAt = plan.dur * (1 - T.slip), slack = smooth((u - slipAt) / (plan.dur - slipAt));
  const arch = mix(mix(T.from ?? 0.28, T.upright, kneel), 1, fall);
  let jet = 0, jetA = 0;
  for (const b of plan.beats) {
    const v = (u - b.t0) / b.d;
    if (v <= 0 || v >= 1) continue;
    // a spurt swells and dies; its aim runs across as it goes, so it lays an arc
    const k = b.k * Math.sin(Math.PI * v) ** 0.6;
    if (k > jet) { jet = k; jetA = b.sweep * (v - 0.5) * 0.5; }
  }
  const tremble = 0.06 * jet * Math.sin(u * 37);
  // both hands clamped on his throat, one over the other, elbows out; slid off it at the end, along his sides
  const arms = geom.arms.map((g, k) => {
    const dx = (g.x < 0 ? -1.2 : 1.2) - g.x, dy = -half * arch + 1.5 + k * 1.5 - g.y * arch;
    const held = { a: Math.atan2(dy, dx) + tremble, s: clamp(Math.hypot(dx, dy) / g.len, 0.3, 1) };
    if (!T.hang) return mixPose(held, { a: Math.PI / 2 + outward(g) * 0.3, s: 1 }, slack);
    // no hands to the throat (no head, or struck down): the arms hang (short, seen from above), jerking with each
    // spurt, then lie where they fall
    return mixPose({ a: Math.PI / 2 + outward(g) * 0.3 + tremble * 4, s: 0.45 }, { a: Math.PI / 2 + outward(g) * 0.55, s: 1 }, fall);
  });
  // standing, the legs are under him; kneeling, the shins lie behind him; down, the legs stretch out
  const legs = geom.legs.map((g, k) => {
    let push = 0;
    for (const p of plan.pushes) if (p.leg === k) push = Math.max(push, jerk((u - p.t0) / p.d));
    const o = outward(g), bent = mixPose({ a: Math.PI / 2 + o * 0.05, s: 0.3 }, { a: Math.PI / 2 + o * 0.12, s: 0.55 }, kneel);
    const q = mixPose(bent, { a: Math.PI / 2 + o * 0.15, s: 1 }, fall);
    return { a: q.a + o * 0.35 * push, s: q.s * (1 - 0.35 * push) };
  });
  let rock = 0.03 * jet * fall;
  for (const p of plan.pushes) rock += (p.leg ? -1 : 1) * 0.05 * jerk((u - p.t0) / p.d);
  return {
    arch, rock, roll: 1, top: fall < 0.5, arms, legs,
    // the head sits back over his shoulders while he kneels (nod: how much of it; bent over something it comes up
    // as his knees go)
    head: { a: plan.side * 0.45 * fall + tremble, s: 1 - 0.1 * jet * fall, dy: up * (half * arch * 0.7 + 4) * (T.nod ?? 1) * (T.from ? kneel : 1) },
    jet, jetA: jetA + plan.side * 0.45 * fall, z: mix(3, 15, up), down: u >= T.kneel + stay + T.pitch, fall,
  };
}
