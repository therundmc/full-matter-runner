// A body at a thing: at his post (Enemy.postBody, data/posts.js), a dancer at her pole, a car's trunk opened, a
// hand on a door leaf or at a lock, a broken weapon looked at. DOM-free.
import { BODY_SCALE } from '../../Config.js';
import { GESTURE, BREAK } from '../../data/feel.js';
import { sw as spriteW } from '../../../engine/Assets.js';
import { lerp, clamp, smooth, bump, lerpA } from '../../../engine/math.js';
import { place, blendPose, copyPose, reach } from '../CharacterAnim.js';
import { holdOnTheWay } from './Traverse.js';
import { reachOut } from './Takedown.js';

// ---------------- at his post (Enemy.postBody, data/posts.js) ----------------
// The standing pose bent by the gesture of the moment (leant over, twisted, the weight on one leg, a foot out), then
// blended (B.w 0..1) into the way he is at it: sat slumped on a couch, legs out; leant back in an armchair, both feet
// up on the desk, ankles crossed; his back flat against a wall, a sole up on it; his backside against a car's hood,
// half sat, the ankles crossed out in front, a hand flat on the hood behind him. B.w runs back to 0 as he gets up:
// the legs come back under him and he stands. B: { base, w, face, fwd, side, twist, dip, foot, hands, wpn, rest }
// (see Enemy.postBody); face: the way the base is laid out (the spot's, his own by default: the head and shoulders
// may look round over it); hands and wpn in his torso's frame, rest (where his weapon lies) in the pose's.
const BASES = {
  // torso pulled back toward the backrest (px), how much lower (smaller) he is, where the feet go [x, y] each
  seat: { back: 3, s: 0.9, feet: [[12.5, -5], [11.8, 4.6]], legs: 1 },
  desk: { back: 4.5, s: 0.86, feet: [[15.5, 1.6], [17, -1.1]], legs: 1 }, // pose px: x BODY_SCALE they reach the desk, no further
  wall: { back: 1.5, s: 1, feet: [[2, -3.6], [-3.5, 4.4]], legs: 0 },
  // the hips on the edge of the bodywork behind him, the left foot crossed over the right at the ankles
  hood: { back: 4, s: 0.93, feet: [[10.2, 0.9], [11.6, -0.7]], legs: 0.7, flat: 'hl' },
};

// move the torso of P by (dx, dy), turn it by dA and scale it by ds, carrying the hands and what they hold with it
function moveTorso(P, dx, dy, dA, ds) {
  const c = Math.cos(dA), s = Math.sin(dA);
  for (const k of ['hl', 'hr', 'wpn', 'carry']) {
    const p = P[k], rx = (p.x - P.tx) * ds, ry = (p.y - P.ty) * ds;
    p.x = P.tx + dx + rx * c - ry * s; p.y = P.ty + dy + rx * s + ry * c;
    if (k === 'wpn' || k === 'carry') p.a += dA;
  }
  P.tx += dx; P.ty += dy; P.ta += dA; P.s *= ds;
}

export function postPose(ch, P, V, B) {
  const a = B.face ?? ch.angle, c = Math.cos(a), s = Math.sin(a);
  moveTorso(P, c * B.fwd - s * B.side, s * B.fwd + c * B.side, B.twist, 1 - B.dip);
  if (B.foot) {
    const [i, lx, ly] = B.foot, f = P.feet[i];
    f.x = lx * c - ly * s; f.y = lx * s + ly * c; f.a = a;
  }
  const base = BASES[B.base], w = smooth(B.w);
  if (base && w > 0) {
    copyPose(V, P);
    V.tx = P.tx - c * base.back; V.ty = P.ty - s * base.back;
    V.s = base.s * (1 - B.dip);
    V.legs = base.legs;
    V.top = 0;
    base.feet.forEach(([lx, ly], i) => { const f = V.feet[i]; f.x = lx * c - ly * s; f.y = lx * s + ly * c; f.a = a; });
    if (B.hands) { place(V.hl, V, V.ta, B.hands.hl.x, B.hands.hl.y); place(V.hr, V, V.ta, B.hands.hr.x, B.hands.hr.y); }
    blendPose(P, V, w);
    P.legs = base.legs * w;
    // a hand gone back behind him is laid flat on what he leans on
    if (base.flat && B.hands?.[base.flat].x < -2 && w > 0.5) { P.flat = base.flat; P.flatA = a + Math.PI; }
  }
  if (B.wpn && P.wpnOn) {
    // his weapon in his hands at it (a blade cleaning his nails, a club tossed and caught, a pistol held low)
    place(P.wpn, P, P.ta, B.wpn.x, B.wpn.y);
    P.wpn.a = P.ta + B.wpn.a; P.wpnLen = B.wpn.len; P.wpnS = B.wpn.s; P.top = B.wpn.top;
    if (B.wpn.fist) P.fist = true; // gripped, not lying in an open hand
  }
  if (B.rest && P.wpnOn) {
    // his weapon lying in front of him: it comes from there into his hands as he draws it (ch.stow 1 -> 0)
    const k = smooth(ch.stow);
    P.wpn.x = lerp(P.wpn.x, B.rest.x, k); P.wpn.y = lerp(P.wpn.y, B.rest.y, k);
    P.wpn.a = lerpA(P.wpn.a, B.rest.a, k);
    P.wpnLen = lerp(P.wpnLen, B.rest.len ?? 1, k); P.wpnS = 1;
    if (k > 0.5) { P.top = 0; P.fist = false; }
  }
  return P;
}

// ---------------- a dancer at her pole (Civilian, ai/Dance.js) ----------------
// Over her standing pose, weighed in by w: the chest carried by the move (the hands with it), the hips swayed under
// it, bent or thrown back, up and down; the hands where the move has them, the right one closed on the pole (a
// world-fixed point) while she holds it. Her feet and her layers are the dance's already (Facing.js lead).
const DH = { x: 0, y: 0 };
export function dancePose(ch, P, d, w) {
  if (w <= 0) return P;
  const o = d.f.pose, a = d.f.face, c = Math.cos(a), s = Math.sin(a);
  moveTorso(P, (c * o.chX - s * o.chY) * w, (s * o.chX + c * o.chY) * w, 0, 1 + o.rise * w);
  P.px += (c * o.hipX - s * o.hipY) * w; P.py += (s * o.hipX + c * o.hipY) * w;
  P.bow = lerp(P.bow, o.bow, w);
  for (const [k, h, i] of [['hl', o.hl, 0], ['hr', o.hr, 1]]) {
    place(DH, P, P.ta, h.x, h.y);
    if (i && o.pole > 0) { DH.x = lerp(DH.x, (d.x - ch.x) / BODY_SCALE, o.pole); DH.y = lerp(DH.y, (d.y - ch.y) / BODY_SCALE, o.pole); }
    P[k].x = lerp(P[k].x, DH.x, w); P[k].y = lerp(P[k].y, DH.y, w);
  }
  if (w > 0.5) { P.top = o.top; P.hand[0] = 'loose'; P.hand[1] = o.pole > 0.5 ? 'fist' : 'loose'; }
  return P;
}

// ---------------- opening a car trunk (Player.trunkOpen, GESTURE.trunk) ----------------
// He bends over the tail, both hands under the edge of the lid; it comes up (the hands go up and forward with it),
// the right one reaches in and comes back out with what was there; he straightens up.
export function trunkPose(ch, P, V) {
  const T = GESTURE.trunk, k = clamp(ch.trunkOpen.t / T.dur, 0, 1), a = ch.angle;
  copyPose(V, P);
  const bend = smooth(k / 0.18) * (1 - smooth((k - 0.82) / 0.18));
  const lift = smooth((k - T.lift[0]) / (T.lift[1] - T.lift[0]));
  const dig = bump(k, T.lift[1] - 0.06, T.take + 0.12); // the right hand into the trunk and out
  V.ta = a;
  V.tx = P.tx * (1 - bend) + Math.cos(a) * 2.5 * bend;
  V.ty = P.ty * (1 - bend) + Math.sin(a) * 2.5 * bend;
  V.s = P.s * (1 - 0.07 * bend);
  V.top = 0;
  const lx = 8 + 3 * lift, wide = 4.5 + lift;
  place(V.hl, V, a, lx, -wide);
  place(V.hr, V, a, lerp(lx, 12, dig), lerp(wide, 1.5, dig));
  // the hands up with the lid seen from above: nearer the eye
  const hb = smooth(k / 0.15) * (1 - smooth((k - 0.86) / 0.14));
  for (const [h, q] of [[V.hl, P.hl], [V.hr, P.hr]]) {
    h.x = lerp(q.x, h.x, hb); h.y = lerp(q.y, h.y, hb);
    reach(h, V, h === V.hl ? -1 : 1);
  }
  holdOnTheWay(ch, V, a);
  blendPose(P, V, bend);
  return P;
}

// ---------------- a hand on a door leaf (Character.doorHand, GESTURE.door) ----------------
// The hand on the side of the leaf's free end (the left one when the right is on a weapon) comes up and reaches for
// the leaf before he is at it, palm forward; against it, it pushes: the shoulders go into it, the elbow bends under
// it. Once the leaf has gone by, the hand stays on its point a moment as he goes on (the arm trails), then drops.
export function doorHandPose(ch, P) {
  const H = ch.doorHand, G = GESTURE.door, w = smooth(H.w);
  if (w <= 0) return P;
  const i = H.side > 0 ? 1 : 0, h = i ? P.hr : P.hl, push = smooth(H.push);
  const tx = (H.x - ch.x) / BODY_SCALE, ty = (H.y - ch.y) / BODY_SCALE, d = Math.hypot(tx, ty) || 1;
  P.tx += (tx / d) * G.lean * push; P.ty += (ty / d) * G.lean * push;
  P.ta += (i ? 1 : -1) * 0.12 * push;
  h.x = lerp(h.x, tx, w); h.y = lerp(h.y, ty, w);
  reachOut(h, P, i ? 1 : -1);
  P.elb[i] = lerp(P.elb[i], G.bend, push);
  if (w > 0.4) { P.flat = i ? 'hr' : 'hl'; P.flatA = H.a; }
  if (i) P.fist = false;
  return P;
}

// A guard's key in a locked door (Character.turnKey, GESTURE.door.unlatch): his hand goes to the lock as he comes
// up to it, a turn or two of the wrist, then on (the push is the door hand's)
export function lockHandPose(ch, P) {
  const L = ch.lockHand, U = GESTURE.door.unlatch, k = L.t / U.dur;
  if (k >= 1) return P;
  // up toward it as he comes near, on it while the clock runs, off it at the end
  const near = smooth((U.reach[1] - Math.hypot(L.x - ch.x, L.y - ch.y)) / (U.reach[1] - U.reach[0]));
  const w = Math.max(near * 0.85, smooth(k / 0.3)) * (1 - smooth((k - 0.8) / 0.2)), i = L.side > 0 ? 1 : 0, h = i ? P.hr : P.hl;
  h.x = lerp(h.x, (L.x - ch.x) / BODY_SCALE, w); h.y = lerp(h.y, (L.y - ch.y) / BODY_SCALE, w);
  reachOut(h, P, i ? 1 : -1);
  if (w > 0.3) { P.flat = i ? 'hr' : 'hl'; P.flatA = L.a + Math.PI / 2 + Math.sin(smooth((k - 0.3) / 0.5) * Math.PI * 2 * U.turns) * U.twist; }
  if (i) P.fist = false;
  return P;
}

// The beat after his weapon gave out (Character.breakWeapon, BREAK): the right hand comes up before his chest and is
// shaken (it stings); the stub of a snapped one is held up across him and looked at, until it is let fall
// (Player.updateBroke); with nothing left in it, the hand is open
const BROKE_AT = { x: 0, y: 0 };
export function brokePose(ch, P) {
  const b = ch.broke, k = b.t / BREAK.beat;
  if (k >= 1) return P;
  const a = ch.angle, w = smooth(k / 0.15) * (1 - smooth((k - 0.8) / 0.2)), shake = Math.sin(ch.world.time * 46) * 1.1 * (1 - k);
  place(BROKE_AT, P, a, 7.5, 4 + shake);
  P.hr.x = lerp(P.hr.x, BROKE_AT.x, w); P.hr.y = lerp(P.hr.y, BROKE_AT.y, w);
  P.fist = false;
  if (b.stub) {
    // held by its broken end's grip, its broken end up and across him
    const sa = a - 1 + shake * 0.06, off = (spriteW(b.stub) * 0.5 - b.d.grip) * P.s;
    P.carryImg = b.stub;
    P.carry.x = P.hr.x + Math.cos(sa) * off; P.carry.y = P.hr.y + Math.sin(sa) * off; P.carry.a = sa;
    P.ha = lerpA(P.ha, Math.atan2(P.carry.y - P.ty, P.carry.x - P.tx), 0.7 * w);
    P.hand[1] = 'fist';
  } else {
    P.hand[1] = 'loose';
    if (w > 0.4) { P.flat = 'hr'; P.flatA = a + 0.4 + shake * 0.25; }
  }
  return P;
}
