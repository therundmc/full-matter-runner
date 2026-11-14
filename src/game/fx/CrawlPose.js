// The last crawl of a man not quite dead (entities/Ragdoll.js) as pure pose maths: no Matter, no DOM.
// He lies on his back, head away from his killer, and pushes himself along on his heels and elbows.
// Frame: torso-local, x across the body, y toward the feet (the head is toward -y); angles as atan2 in that frame
// (0 = +x, PI/2 = toward the feet). A limb pose is { a, s }: its angle and the scale of its length (s < 1: bent or
// raised, seen from above). The head pose is { a, s }: its turn off the torso axis and its length along the neck.
import { CRAWL } from '../data/wounds.js';
import { angDiff } from '../../engine/math.js';

const PUSH = 0.45;            // share of a cycle spent pushing; the rest is the recovery (the torso stays put)
const ARM_REST = 0.45;        // rad out from the body axis of an arm lying alongside him, toward the feet
const ARM_PLANT = 0.75;       // rad out from the axis, toward the head, of the elbow planted past the shoulder
const LEG_BENT = 0.5;         // length scale of a leg with the knee up
const KNEE_OUT = 0.35;        // rad a bent leg falls outward
const LEG_REST = 0.12;        // rad a straight leg lies off the axis
const ROCK = 0.1;             // rad the torso sags about its axis in a recovery
const RAISE = 0.3, HOLD = 0.5; // s: the arm comes up toward his killer, then stays there before it drops

export const smooth = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
const mix = (a, b, t) => a + (b - a) * t;
const mixPose = (p, q, t) => ({ a: mix(p.a, q.a, t), s: mix(p.s, q.s, t) });

// the sequence when nothing stops it: [name, seconds]
export function schedule(pulls) {
  return [['fall', CRAWL.fall], ['turn', CRAWL.turn], ['crawl', pulls * CRAWL.cycle], ['giveUp', CRAWL.giveUp]];
}

// phase of the sequence t s after the kill: { name, u: s into it } ('done' once it is over)
export function phaseAt(t, pulls) {
  for (const [name, d] of schedule(pulls)) {
    if (t < d) return { name, u: t };
    t -= d;
  }
  return { name: 'done', u: t };
}

// px the body travels on push i (0 = the first)
export const stepOf = (i) => CRAWL.step * CRAWL.decay ** i;

// px travelled within push i at cycle fraction p (eased in and out; nothing during the recovery)
const pushed = (i, p) => stepOf(i) * smooth(p / PUSH);

// torso travel along the escape direction since the crawl started, at cycle i, fraction p of it
export function travelAt(i, p) {
  let d = 0;
  for (let k = 0; k < i; k++) d += stepOf(k);
  return d + pushed(i, p);
}

// the escape direction: a, or turned off it when the way is blocked; null when every way is
export function escapeDir(a, blocked) {
  for (const d of [0, 0.6, -0.6, 1.2, -1.2]) if (!blocked(a + d)) return a + d;
  return null;
}

// limb from its joint j to point (x, y), in the frame of a limb on the +x side
function toward(j, x, y, len, min = 0.45) {
  return { a: Math.atan2(y - j.y, x - j.x), s: Math.min(1, Math.max(min, Math.hypot(x - j.x, y - j.y) / len)) };
}
// a pose of the +x side mirrored onto the side of joint j
const sided = (j, p) => (j.x < 0 ? { a: Math.PI - p.a, s: p.s } : p);
const right = (j) => ({ x: Math.abs(j.x), y: j.y });

const armRest = { a: Math.PI / 2 - ARM_REST, s: 1 };
const legRest = { a: Math.PI / 2 - LEG_REST, s: 1 };
const plantAt = (j, len) => ({ x: j.x + Math.sin(ARM_PLANT) * len, y: j.y - Math.cos(ARM_PLANT) * len });
const footAt = (j, len) => ({ x: j.x + Math.sin(KNEE_OUT) * len * LEG_BENT, y: j.y + Math.cos(KNEE_OUT) * len * LEG_BENT });

// the arm that pulls on cycle i, when arm `first` pulls on the first
const pullArm = (i, first) => (first + i) % 2;

// head lifted toward his killer while he pushes, dropped back a little in the recovery
function lift(p) { return p < PUSH ? 1 : 1 - 0.5 * Math.sin(Math.PI * (p - PUSH) / (1 - PUSH)); }

// The pose at fraction p of cycle i. geom = { arms: [{ x, y, len }] x2, legs: [...] x2 }: joints (torso-local) and
// limb lengths; first = arm that pulls first; look = head turn toward his killer (rad).
// Returns { rock (rad, added to the torso angle), arms, legs, head }.
export function crawlPose(i, p, geom, first, look) {
  const q = p < PUSH ? 0 : (p - PUSH) / (1 - PUSH), e = smooth(q);
  const d = pushed(i, Math.min(p, PUSH));
  const arms = geom.arms.map((g, k) => {
    const j = right(g), P = plantAt(j, g.len);
    let pose;
    if (k === pullArm(i, first)) {
      // planted past the shoulder, it stays on its spot while the torso goes by; then it lies back alongside him
      pose = p < PUSH ? toward(j, P.x, P.y + d, g.len) : mixPose(toward(j, P.x, P.y + d, g.len), armRest, e);
    } else {
      // lies alongside him, then is brought round outside and up past the shoulder, lifted off the floor
      const up = toward(j, P.x, P.y, g.len);
      pose = p < PUSH ? armRest : { ...mixPose(armRest, up, e), s: mix(1, up.s, e) - 0.25 * Math.sin(Math.PI * q) };
    }
    return sided(g, pose);
  });
  const legs = geom.legs.map((g) => {
    // heels planted, the legs straighten as the torso goes; then the knees come back up
    const j = right(g), F = footAt(j, g.len);
    const out = toward(j, F.x, F.y + d, g.len, LEG_BENT);
    return sided(g, p < PUSH ? out : mixPose(out, toward(j, F.x, F.y, g.len, LEG_BENT), e));
  });
  const h = lift(p);
  const rock = p < PUSH ? 0 : (pullArm(i, first) ? 1 : -1) * ROCK * Math.sin(Math.PI * q);
  return { rock, arms, legs, head: { a: look * h, s: 1 - 0.18 * h } };
}

// Giving up, u s into it, from the pose he stopped in (from): arm `reach` comes up toward his killer (local angle
// reachA), holds, then drops beside him; the legs go slack; the head looks (look) then rolls to one side.
export function giveUpPose(u, from, geom, reach, reachA, look) {
  const T = CRAWL.giveUp, slack = smooth(u / T);
  const drop = smooth((u - RAISE - HOLD) / Math.max(0.05, T - RAISE - HOLD));
  const up = smooth(u / RAISE);
  const shake = u > RAISE && drop <= 0 ? 0.05 * Math.sin(u * 47) : 0; // the arm trembles
  const arms = geom.arms.map((g, k) => {
    const rest = sided(g, armRest);
    if (k !== reach) return mixPose(from.arms[k], rest, slack);
    // toward his feet, out or a little across his chest, never back over his head
    const off = angDiff(Math.PI / 2, sided(g, { a: reachA, s: 1 }).a);
    const held = sided(g, { a: Math.PI / 2 + Math.min(0.7, Math.max(-1.0, off)) + shake, s: 1 });
    held.a = from.arms[k].a + angDiff(from.arms[k].a, held.a);
    return mixPose(mixPose(from.arms[k], held, up), rest, drop);
  });
  const legs = geom.legs.map((g, k) => mixPose(from.legs[k], sided(g, legRest), slack));
  const side = geom.arms[reach].x < 0 ? 0.7 : -0.7; // the head rolls away from the arm that reached
  const looking = { a: look, s: 0.82 };
  const head = mixPose(mixPose(from.head, looking, up), { a: side, s: 1 }, drop);
  return { rock: 0, arms, legs, head };
}
