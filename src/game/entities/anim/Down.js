// A man down: on his knees, given up (Enemy.surrender); knocked down, the blow, the fall, lying dazed and getting
// up (drawDown).
import { PALETTE } from '../../Config.js';
import { drawSprite, silhouette, sw as spriteW } from '../../../engine/Assets.js';
import { lerp, clamp, smooth, bump } from '../../../engine/math.js';
import { easeOut, YIELD_FEET } from './Rig.js';
import { standPose, blendPose, copyPose, track, reach, drawPose } from '../CharacterAnim.js';
import { holdOnTheWay } from './Traverse.js';

// ---------------- given up (Enemy.surrender) ----------------
// On his knees: the shins flat on the floor behind him, knees together, the feet turned back (YIELD_FEET); the hands
// up either side of his head are the standing pose's for a man who has given up (standPose).
export function kneelPose(P) {
  const c = Math.cos(P.ta), s = Math.sin(P.ta);
  YIELD_FEET.forEach(([lx, ly], i) => {
    const f = P.feet[i];
    f.x = lx * c - ly * s; f.y = lx * s + ly * c; f.a = P.ta + Math.PI; f.lift = 0; f.heel = 0;
  });
  P.legs = 1;
  return P;
}

// ---------------- knocked down: the blow, the fall, getting up ----------------
// s the getting up takes: set when the time left on the floor first comes under `dur` (whatever is left then, so a
// man shaken awake early gets up quicker), cleared once he is up; knocked = Infinity (asleep) never starts it
export function riseDurAt(riseDur, knocked, dur) {
  if (!(knocked > 0)) return 0;
  return riseDur || (knocked <= dur ? knocked : 0);
}
// 0 .. 1 how far up he is
const riseOf = (ch) => (ch.riseDur > 0 && !ch.executing ? clamp(1 - ch.knocked / ch.riseDur, 0, 1) : 0);

// Taken off his feet (fall 0 .. 1): the torso thrown along the blow, the head snapped round with it, the arms left
// behind, the feet swept out toward whoever hit him.
function staggerPose(ch, P, V, fall) {
  const kd = ch.downAngle, c = Math.cos(kd), s = Math.sin(kd);
  const side = Math.sin(ch.angle - kd) >= 0 ? 1 : -1, e = easeOut(fall);
  copyPose(V, P);
  V.ta = P.ta + side * 0.75 * e;
  V.ha = V.ta;
  V.tx = P.tx + c * 5 * e; V.ty = P.ty + s * 5 * e;
  V.s = P.s * (1 + 0.06 * bump(fall, 0, 0.7) - 0.08 * fall);
  V.legs = 0.8 * e;
  V.top = 0;
  for (let i = 0; i < 2; i++) {
    const side2 = i ? 1 : -1, f = V.feet[i];
    f.x = -c * 8 * e - s * side2 * 3.6; f.y = -s * 8 * e + c * side2 * 3.6; f.a = kd + Math.PI;
    const h = i ? V.hr : V.hl;
    h.x = lerp(h.x, V.tx - c * 7 - s * side2 * 8, e); h.y = lerp(h.y, V.ty - s * 7 + c * side2 * 8, e);
  }
  blendPose(P, V, 1);
  return P;
}

// Getting up (k 0 .. 1), facing the way he will stand (toward his feet): from the floor he sits up on his hands, gets
// a foot under him and goes onto one knee, the left hand flat on the floor, the right one on the raised knee, then
// pushes up into his stance. Key frames in his own space (x forward, y to his right).
const RISE = {
  t: [0, 0.3, 0.55, 0.78, 1],
  fwd: [-6, -4.5, 0, 0.5, 0],    // torso along his facing (behind his hips while sitting)
  s: [0.8, 0.83, 0.86, 0.93, 1],
  legs: [1, 1, 1, 0.5, 0],
  fx: [11, 9, 6.5, 3, 1], fy: [3.5, 3.8, 4.2, 3.8, 3.6],      // the right foot: out in front, then under the raised knee
  bx: [11, 8, -5.5, -2, 1], by: [-3.5, -3.6, -2.8, -3.4, -3.6], // the left one: drawn back under him, the knee down
  lx: [-4, -3, 6, 6, 6], ly: [-8.5, -8.5, -8.5, -7, -6],      // the left hand on the floor, then off it
  rx: [-4, -2, 5, 6, 6], ry: [8.5, 8, 4.5, 5, 6],             // the right one: on the floor, then on the knee
};
function risePose(ch, P, V, k) {
  const a = ch.downAngle + Math.PI, c = Math.cos(a), s = Math.sin(a), key = (n) => track(RISE.t, RISE[n], k);
  const mv = (out, lx, ly) => { out.x = V.tx + lx * c - ly * s; out.y = V.ty + lx * s + ly * c; };
  copyPose(V, P);
  V.ta = V.ha = a;
  V.tx = c * key('fwd'); V.ty = s * key('fwd');
  V.s = key('s');
  V.legs = clamp(key('legs'), 0, 1);
  V.top = 0;
  mv(V.feet[1], key('fx'), key('fy')); mv(V.feet[0], key('bx'), key('by'));
  V.feet[0].a = V.feet[1].a = a;
  mv(V.hl, key('lx'), key('ly')); mv(V.hr, key('rx'), key('ry'));
  reach(V.hl, V, -1); reach(V.hr, V, 1);
  holdOnTheWay(ch, V, a);
  blendPose(P, V, 1 - smooth((k - 0.78) / 0.22));
  if (k < 0.6) { P.flat = 'hl'; P.flatA = a; } // the palm flat on the floor
  return P;
}

// A man dazed on the floor, t s after he went down: how far his shoulders roll (rad) and how far he heaves himself
// up on his elbows (0 .. 1), slow and uneven
function groggy(t) {
  const roll = 0.07 * Math.sin(t * 1.6) + 0.035 * Math.sin(t * 3.7 + 1);
  const heave = Math.max(0, Math.sin(t * 1.15 - 1.4));
  return { roll, lift: heave * heave * heave };
}

// knocked down: taken off his feet (stagger), the body drops onto the floor (cross-fade + settle), lies dizzy, then
// gets up through one knee (risePose)
export function drawDown(ctx, ch, P) {
  const x = ch.x, y = ch.y;
  const fall = smooth(ch.downT / 0.22), k = riseOf(ch);
  const down = fall * (1 - smooth(k / 0.3));
  if (down < 1) {
    if (k > 0) risePose(ch, standPose(ch, P, ch.downAngle + Math.PI), ch.pose2, k);
    else staggerPose(ch, standPose(ch, P, ch.angle), ch.pose2, fall);
    drawPose(ctx, ch, P, 1 - down);
  }
  if (down <= 0) return;
  // on his back, his head where the blow sent it (downAngle), his hips where the body's circle is
  const sc = 1 + 0.12 * (1 - fall), len = spriteW(ch.downImg);
  // dazed after a fall (Enemy.slip): no stars, a groggy man: he rolls his head and shoulders from side to side and
  // now and then heaves himself up an inch on his elbows, and sinks back
  // struck where he lies (a finisher's beat on a man still alive, Player.landBeat): he jerks
  const jk = ch.jerk ? ch.jerk.side * ch.jerk.k * Math.exp(-(ch.world.time - ch.jerk.t) * 11) : 0;
  const g = ch.dazed && !ch.executing ? groggy(ch.downT) : null, ra = ch.downAngle + (g ? g.roll : 0) + jk * 0.16;
  const lift = g ? g.lift * down : 0;
  const dc = Math.cos(ch.downAngle), ds = Math.sin(ch.downAngle);
  const mx = x + dc * len * (0.08 - lift * 0.05) - ds * jk * 1.5, my = y + ds * len * (0.08 - lift * 0.05) + dc * jk * 1.5;
  drawSprite(ctx, silhouette(ch.downImg), mx + 2 + (1 - fall) * 2 + lift * 2, my + 2 + (1 - fall) * 2 + lift * 2, ra, 0.35 * down, sc);
  drawSprite(ctx, ch.downImg, mx, my, ra, down, sc * (1 + lift * 0.05));
  if (ch.asleep || ch.dazed) return;
  // dizzy stars
  const t = ch.world.time * 6;
  ctx.fillStyle = PALETTE.yellow;
  const ga = ctx.globalAlpha;
  ctx.globalAlpha = ga * down;
  const hc = dc * len * 0.48, hs = ds * len * 0.48; // round his head
  for (let i = 0; i < 3; i++) {
    const sa = t + (i * Math.PI * 2) / 3;
    ctx.fillRect(x + hc + Math.cos(sa) * 6 - 1, y + hs + Math.sin(sa) * 3 - 4, 2, 2);
  }
  ctx.globalAlpha = ga;
}
