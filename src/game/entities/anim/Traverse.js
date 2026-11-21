// Getting over and along things (Character.tryVault, Player.slide / kick; TRAVERSE in data/feel.js): the vault
// (speed, climb, ladder, roll) and the slide and the kick out of it, as phases blended over the standing pose.
// DOM-free.
import { BODY_SCALE } from '../../Config.js';
import { TRAVERSE } from '../../data/feel.js';
import { sprite, sw as spriteW } from '../../../engine/Assets.js';
import { lerp, clamp, smooth, bump, lerpA } from '../../../engine/math.js';
import { easeOut, LIMB, WAY, AT, TO, LEGS, SH, TMP } from './Rig.js';
import { place, blendPose, copyPose, track, legsPose, shoulder, reach } from '../CharacterAnim.js';
import { reachOut } from './Takedown.js';

// ---------------- vault ----------------
// Three ways over (Character.tryVault sets v.style):
// - 'speed' (furniture): the one-hand speed vault. A dip in the last step, the leading hand flat on the top at the
//   obstacle's line (world-fixed: it does not slide while he passes), the hips lifted and swung past it on the other
//   side of that arm, the legs tucked together, the torso over the arm; the free arm out for balance (a gun stays
//   on the target, muzzle forward). He lands moving on, the hand off last, then one quick step.
// - 'hip' (a car's hood): the action-movie hip slide over the top, the gun arm on target, one palm skidding.
// - 'hoist' (a sill, a gate, a parapet): hands planted on the edge, the body hoisted over with tucked legs, squash on
//   landing (or straight on into a roll after a drop).

// The phases of the speed vault at k (0 .. 1 of its clock, TRAVERSE.vault), each 0 .. 1: the dip before the plant,
// the planted hand's hold (1 from the plant until it lifts off), the body up, the legs swung past (0 .. 1 across),
// the landing's squash, the step on after it
export function vaultPhases(k, out = {}) {
  const T = TRAVERSE.vault;
  out.dip = bump(k, 0, T.dip);
  out.hand = smooth((k - 0.02) / (T.plant - 0.02)) * (1 - smooth((k - T.lift) / 0.1));
  out.up = bump(k, T.plant - 0.04, T.land + 0.02);
  out.swing = smooth((k - T.swing[0]) / (T.swing[1] - T.swing[0]));
  out.land = bump(k, T.land - 0.05, 1);
  out.step = smooth((k - T.land) / (1 - T.land));
  return out;
}
const VP = {};

// a world point as a pose offset of ch (pose px about his feet: he is drawn BODY_SCALE larger)
function onWorld(out, ch, x, y) { out.x = (x - ch.x) / BODY_SCALE; out.y = (y - ch.y) / BODY_SCALE; return out; }

// the one-hand speed vault; v.hand: the planted hand's side (-1 left, 1 right of the move), v.plant: where it goes
// (world), the legs on the other side (v.legSide)
function speedVaultPose(ch, P, V, v) {
  const T = TRAVERSE.vault, k = clamp(v.t / v.dur, 0, 1), ph = vaultPhases(k, VP);
  const dir = v.dir, c = Math.cos(dir), s = Math.sin(dir), hs = v.hand, pi = hs > 0 ? 1 : 0;
  copyPose(V, P);
  const d = ch.def, held = V.wpnOn && d.hold !== 'none';
  // the torso: down in the dip, then up and over the planted arm, the hips side-on; an armed man's chest stays
  // toward his target
  const over = ph.up * (1 - 0.6 * ph.step);
  const turn = dir + hs * T.turn * over;
  V.ta = held && d.kind === 'gun' ? lerpA(turn, P.ta, 0.5) : turn;
  const fwd = -1.2 * ph.dip + 1.6 * ph.up - 1.4 * ph.land, lat = hs * T.lean * over;
  V.tx = P.tx * (1 - over) + c * fwd - s * lat; V.ty = P.ty * (1 - over) + s * fwd + c * lat;
  V.s = 1 + T.rise * ph.up - 0.05 * ph.dip - 0.07 * ph.land;
  V.lift = 0.75 * ph.up;
  V.legs = ph.up;
  V.top = 0;
  V.flat = null;
  // the legs tucked together and carried past on the far side, toes turned with the hips; the hand side's foot steps
  // on after the landing
  legsPose(V, LEGS.speed, k, dir, v.legSide);
  for (let i = 0; i < 2; i++) {
    const f = V.feet[i];
    f.lift = 0.7 * ph.up; f.heel = 0;
    f.a = dir - v.legSide * 0.5 * ph.swing * (1 - ph.step);
    if (i === pi) { f.x += c * 4 * ph.step; f.y += s * 4 * ph.step; f.lift = Math.max(f.lift, 0.5 * bump(ph.step, 0, 1)); }
  }
  // the hands go with the torso; the planted one onto its spot and held there
  const dx = V.tx - P.tx, dy = V.ty - P.ty, plant = pi ? V.hr : V.hl, free = pi ? V.hl : V.hr;
  for (const h of [V.hl, V.hr, V.wpn]) { h.x += dx; h.y += dy; }
  onWorld(TMP, ch, v.plant.x, v.plant.y);
  plant.x = lerp(plant.x, TMP.x, ph.hand); plant.y = lerp(plant.y, TMP.y, ph.hand);
  if (ph.hand < 1) reachOut(plant, V, hs); // planted, it stays put (the plant is where the body passes over it)
  if (ph.hand > 0.4) { V.flat = pi ? 'hr' : 'hl'; V.flatA = dir + hs * 0.35; }
  V.elb[pi] = lerp(V.elb[pi], 0.15, ph.hand); // the arm braced, near straight
  if (held) {
    // the weapon in the right hand alone, muzzle forward along the way (a long gun let go of its forend)
    if (d.hold === 'two') { V.wpn.a = lerpA(V.wpn.a, dir - 0.25, over); V.wpnLen = lerp(V.wpnLen, 0.85, over); }
  } else {
    // the free arm out for balance, away from the plant, a little back
    const fb = smooth(ph.up * 1.4);
    TO.x = V.tx + (0.5 - 2 * ph.swing) * c + hs * 10.5 * s; TO.y = V.ty + (0.5 - 2 * ph.swing) * s - hs * 10.5 * c;
    free.x = lerp(free.x, TO.x, fb); free.y = lerp(free.y, TO.y, fb);
    reach(free, V, -hs);
    V.hand[1 - pi] = 'loose';
  }
  V.carryImg = null;
  // in from the run, and out to it over the step after the landing
  const w = smooth(k / 0.1) * (v.roll ? 1 : 1 - smooth((k - 0.86) / 0.14));
  blendPose(P, V, w);
  if (w > 0.5) { P.flat = V.flat; P.flatA = V.flatA; }
  P.lift = V.lift * w;
  P.duck = Math.max(P.duck, 0.3 * ph.dip * w); // the head down into the dip
  return P;
}

export function vaultPose(ch, P, V) {
  const v = ch.vaulting;
  if (v.rolling) return rollPose(ch, P, V);
  if (v.ladder) return ladderPose(ch, P, V);
  if (v.style === 'speed') return speedVaultPose(ch, P, V, v);
  const k = clamp(v.t / v.dur, 0, 1);
  const win = v.hoist;
  const dir = v.dir, c = Math.cos(dir), s = Math.sin(dir);
  copyPose(V, P);

  // body height: a hop over a sill, a plateau on top of a hood
  const h = win ? bump(k, 0.1, 0.8) : smooth((k - 0.08) / 0.25) * (1 - smooth((k - 0.66) / 0.24));
  const armed = ch.def.kind === 'gun';
  if (win) {
    V.ta = dir;
    const fwd = 1.5 * bump(k, 0.1, 0.6); // shoulders over the hands
    V.tx = c * fwd; V.ty = s * fwd;
  } else {
    // rolled onto the hip; the chest turns back toward the target when armed
    const roll = dir + v.side * 1.15 * h;
    V.ta = armed ? lerpA(roll, ch.angle, 0.55 * h) : roll;
    V.tx = Math.sin(dir) * v.side * 1.5 * h; V.ty = -Math.cos(dir) * v.side * 1.5 * h;
  }
  V.s = 1 + (win ? 0.16 : 0.09) * h;
  V.lift = win ? h : h * 0.6;
  V.legs = win ? 0 : h;
  V.top = 0;
  V.flat = null;
  legsPose(V, win ? LEGS.window : LEGS.prop, k, dir, v.legSide);
  if (v.strike) {
    // the player's legs off a hood into the guard there (Player.vaultStrike): both feet shot out at him, up toward the
    // eye, the shoulders back off them; out a beat past the contact, then down for the landing
    const S = TRAVERSE.vault.hip.strike, sk = v.strike.k;
    const out = smooth((k - sk + S.lead) / S.lead) * (1 - smooth((k - sk - 0.05) / 0.12));
    for (const f of V.feet) { f.x += c * S.kick * out; f.y += s * S.kick * out; f.lift = Math.max(f.lift, 1.2 * out); }
    V.tx -= c * 1.5 * out; V.ty -= s * 1.5 * out;
  }

  if (win) {
    // both palms on the sill until the body has passed them, the gun hand keeps its weapon flat along the move
    const hw = smooth(k / 0.16) * (1 - smooth((k - 0.55) / 0.25));
    for (let i = 0; i < 2; i++) {
      const hp = v.hands[i], hand = i ? V.hr : V.hl;
      onWorld(TMP, ch, hp.x, hp.y);
      hand.x = lerp(hand.x, TMP.x, hw); hand.y = lerp(hand.y, TMP.y, hw);
      reach(hand, V, i ? 1 : -1);
    }
    if (hw > 0.5 && !V.wpnOn) { V.flat = 'hl'; V.flatA = dir; }
    if (V.wpnOn) { V.wpn.x = V.hr.x; V.wpn.y = V.hr.y; V.wpn.a = lerpA(P.wpn.a, dir + 0.15, hw); }
    V.carryImg = null;
  } else if (ch.def.hold !== 'two') {
    // free hand skims the surface beside the hip
    const hw = smooth(k / 0.15) * (1 - smooth((k - 0.68) / 0.22));
    shoulder(SH, V, -1);
    const ox = -Math.sin(V.ta), oy = Math.cos(V.ta);
    const px = SH.x - ox * 5 * V.s - c * 2, py = SH.y - oy * 5 * V.s - s * 2;
    V.hl.x = lerp(V.hl.x, px, hw); V.hl.y = lerp(V.hl.y, py, hw);
    if (hw > 0.5) { V.flat = 'hl'; V.flatA = dir; }
    V.carryImg = null;
  }

  // blend in from / out to the walk (a roll takes over from the landing pose instead), then crouch before the
  // take-off and squash on landing on top
  const w = smooth(k / 0.14) * (v.roll ? 1 : 1 - smooth((k - 0.82) / 0.18));
  blendPose(P, V, w);
  if (w > 0.5 && V.flat) { P.flat = V.flat; P.flatA = V.flatA; }
  const land = win ? 0.78 : 0.82;
  P.s *= 1 - 0.05 * bump(k, 0, 0.18) - 0.07 * bump(k, land - 0.02, 1);
  P.lift = V.lift * w;
  return P;
}

// ---------------- ladder ----------------
// Up a ladder, or down it: the same moves played backwards in time. He steps onto its foot, climbs it in n steps
// (one hand reaches for a rung higher up, the body follows, then the foot of the other side), and at the top both
// hands go on the edge and he pulls himself over and stands. Down, he turns his back to the way he goes, lowers
// himself over the edge, steps down hand under hand facing the ladder and turns round at the bottom.
// q: places along the ladder's axis (px from its centre, toward the top); u: the time of the climb as if going up.
const RUNGS = {
  n: 5, foot: -10, top: 8, // steps, and the body's place on the ladder at the first and the last of them
  on: 0.13, off: 0.74,     // u: on the ladder from the foot, off it over the edge
  reach: 9, toe: -7,       // where a hand / a foot goes, ahead of the body (snapped to the nearest rung)
  edge: 14, hand: 4.5, feet: 3.5, // the top edge, how far apart the hands / feet are from the axis
};
const RUNG_AT = [-11.5, -7.5, -3.5, 0.5, 4.5, 8.5, 12.5]; // the rungs of the ladder sprite, along its y from its centre
const stepQ = (j) => RUNGS.foot + ((RUNGS.top - RUNGS.foot) * j) / RUNGS.n;

// where the body is at time k of a ladder move L (Character.ladderPlan): { u, i (-1 stepping on, 0..n-1 climbing,
// n over the edge), w (time within it), q, top }
export function ladderAt(L, k) {
  const R = RUNGS, u = L.up ? k : 1 - k;
  const qLow = L.up ? L.q0 : L.q1, qHigh = L.up ? L.q1 : L.q0;
  if (u < R.on) return { u, i: -1, w: 1, q: lerp(qLow, R.foot, smooth(u / R.on)), top: false };
  if (u < R.off) {
    const f = ((u - R.on) / (R.off - R.on)) * R.n, i = Math.min(R.n - 1, Math.floor(f)), w = f - i;
    return { u, i, w, q: stepQ(i + smooth((w - 0.35) / 0.6)), top: false };
  }
  const w = (u - R.off) / (1 - R.off);
  return { u, i: R.n, w, q: lerp(R.top, qHigh, smooth((w - 0.15) / 0.85)), top: true };
}

// 0 .. 1: how much of him is on the ladder (the facing is held on it) at climb time u
export const ladderGrip = (u) => smooth(u / RUNGS.on) * (1 - smooth((u - 0.86) / 0.14));

// q of the rung nearest to q
function rungNear(L, q) {
  let best = RUNG_AT[0] * L.sgn;
  for (const r of RUNG_AT) if (Math.abs(r * L.sgn - q) < Math.abs(best - q)) best = r * L.sgn;
  return best;
}

// q of a hand or a foot during step i (time w): it moves on the steps of parity p, over [a, b] of the step, to the
// rung nearest to where the body will then be, plus off. Returns [q, how far into its move it is (0 .. 1)].
function limbQ(L, i, w, p, off, a, b) {
  const last = ((i - p) & 1) === 0 ? i : i - 1; // the step of its latest move (maybe this one)
  const t = last === i ? smooth((w - a) / (b - a)) : 1;
  return [lerp(rungNear(L, stepQ(last - 1) + off), rungNear(L, stepQ(last + 1) + off), t), t];
}

function ladderPose(ch, P, V) {
  const v = ch.vaulting, L = v.ladder, R = RUNGS, at = ladderAt(L, clamp(v.t / v.dur, 0, 1));
  copyPose(V, P);
  const ax = L.ax, ay = L.ay, rx = -ay, ry = ax, f = L.face; // up the ladder, and to his right
  const bx = ch.x, by = ch.y;
  // a point on the ladder (q along it, side across it, to his right), as an offset from the body
  const on = (out, q, side) => { out.x = L.cx + ax * q + rx * side - bx; out.y = L.cy + ay * q + ry * side - by; };
  const top = at.top ? at.w : 0, i = Math.min(at.i, R.n - 1), w = at.top ? 1 : at.w;
  const high = clamp((at.q - R.foot) / (R.top - R.foot), 0, 1) * (1 - smooth(top / 0.9));
  const over = bump(top, 0.1, 0.95); // pulling himself over the edge
  // the shoulders sway toward the hand that reaches
  const reaching = at.i >= 0 && !at.top ? (at.i & 1 ? 1 : -1) * bump(w, 0, 0.7) : 0;
  V.ta = f - 0.12 * reaching;
  const lean = 1.2 + 2.5 * over;
  V.tx = ax * lean; V.ty = ay * lean;
  V.s = 1 + 0.06 * high + 0.1 * over;
  V.lift = 0.3 * high + 0.35 * over;
  V.legs = 0;
  V.top = 0;
  // hands on the rungs, then on the edge until the body has passed them
  const grip = 1 - smooth((top - 0.55) / 0.3);
  for (let h = 0; h < 2; h++) {
    const hand = h ? V.hr : V.hl, side = h ? 1 : -1;
    const [q, t] = limbQ(L, i, w, h, R.reach, 0, 0.5);
    const e = smooth((top - 0.08 * h) / 0.25);
    on(hand, lerp(q, R.edge, e), side * (R.hand + 2 * e + 1.2 * bump(t, 0, 1)));
    hand.x = lerp(P[h ? 'hr' : 'hl'].x, hand.x, grip); hand.y = lerp(P[h ? 'hr' : 'hl'].y, hand.y, grip);
  }
  // feet on the rungs below, the one of the other side follows each hand; over the edge they come under him
  const stand = smooth((top - 0.35) / 0.5);
  for (let j = 0; j < 2; j++) {
    const ft = V.feet[j], side = j ? 1 : -1;
    const [q] = limbQ(L, i, w, 1 - j, R.toe, 0.55, 0.95);
    on(ft, q, side * R.feet);
    ft.x = lerp(ft.x, ax + rx * side * 3.6, stand); ft.y = lerp(ft.y, ay + ry * side * 3.6, stand);
    ft.a = f;
  }
  holdOnTheWay(ch, V, f);
  blendPose(P, V, ladderGrip(at.u));
  return P;
}

// the weapon while both hands are busy: a short one stays in the right hand along the move, a long one goes on the back
export function holdOnTheWay(ch, V, f) {
  V.carryImg = null;
  if (!V.wpnOn) return;
  const d = ch.def;
  if (d.hold === 'two' || d.swing === 'club') {
    const sa = 2.05, off = spriteW(sprite(d.sprite)) * 0.5 - d.grip;
    place(V.wpn, V, V.ta, -3 - Math.cos(sa) * off, -Math.sin(sa) * off);
    V.wpn.a = V.ta + sa;
  } else {
    V.wpn.x = V.hr.x; V.wpn.y = V.hr.y; V.wpn.a = f + 0.25;
    V.wpnLen = 0.8;
  }
}

// ---------------- roll ----------------
// After a drop: a forward shoulder roll, seen from above. He tucks (the head goes down along the leading shoulder and
// under, the hunched back shows), the body balls up and goes over along the way (faked by squashing it along the
// travel axis as it turns over: its outline shrinks, then grows), the legs pass up over him and come down in front,
// then he unfolds explosively onto his feet, running. The free hand takes the floor first and pushes him up at the
// end; the weapon stays in the other one, tucked in.
const ROLL = {
  t: [0, 0.14, 0.3, 0.46, 0.62, 0.8, 1],
  fwd: [0, 3.5, 2, -0.5, -3, -1, 0],    // torso ahead of the body centre
  s: [1, 0.86, 0.78, 0.78, 0.84, 0.97, 1],
  fx: [1, -2, -4, 1, 6, 2.5, 1],        // feet: forward (back under him for the unfold), and half their spread
  fy: [3.6, 2.8, 2.2, 2.2, 2.6, 3.6, 3.6],
  legs: [0, 0, 0.7, 1, 1, 0.3, 0],
  hx: [6, 10, 3, 1.5, -1, 1.5, 6],      // the free hand: on the floor ahead, tucked in, pushing off beside the hip
  hy: [6, 5, 3, 3, 8.5, 7, 6],
};

// The phases of the roll at k (0 .. 1 of it, TRAVERSE.roll): how curled up he is (tuck), how far over he has gone
// (turn, rad: 2 pi a full turn), his length along the way and his width across it (1 standing: the squash), the
// unfold's spring (0 .. 1)
export function rollPhases(k, out = {}) {
  const R = TRAVERSE.roll, [o0, o1] = R.over, [u0, u1] = R.unfold;
  out.tuck = smooth(k / 0.16) * (1 - smooth((k - u0) / (u1 - u0)));
  out.turn = Math.PI * 2 * R.turns * smooth((k - o0) / (o1 - o0));
  const sn = Math.sin(out.turn / 2);
  out.along = 1 - out.tuck * (1 - R.squash[0]) * (0.55 + 0.45 * sn * sn);
  out.across = 1 - out.tuck * (1 - R.squash[1]);
  out.pop = bump(k, u0, 1);
  return out;
}
const RP = {};

function rollPose(ch, P, V) {
  const v = ch.vaulting, r = v.rolling, k = clamp(r.t / r.dur, 0, 1), ph = rollPhases(k, RP);
  const dir = v.dir, c = Math.cos(dir), s = Math.sin(dir), key = (n) => track(ROLL.t, ROLL[n], k);
  const mv = (out, lx, ly) => { out.x = lx * c - ly * s; out.y = lx * s + ly * c; }; // move space -> pose space
  copyPose(V, P);
  const fwd = key('fwd');
  // over the leading shoulder: the torso turned to it, rocking with the turn
  V.ta = dir + r.side * (0.5 * bump(k, 0.06, 0.72) + 0.22 * Math.sin(ph.turn) * ph.tuck);
  V.tx = c * fwd; V.ty = s * fwd;
  V.s = key('s') * (1 + TRAVERSE.roll.pop * ph.pop);
  V.tuck = ph.tuck;
  V.sq = ph.along; V.sqW = ph.across; V.sqA = dir;
  V.over = Math.max(0, Math.sin(ph.turn / 2)) * ph.tuck; // the legs up over him through the middle of the turn
  V.legs = clamp(key('legs'), 0, 1);
  V.lift = 0.25 * V.over;
  V.top = 0;
  const fx = key('fx'), fy = key('fy');
  for (let i = 0; i < 2; i++) { mv(V.feet[i], fx, (i ? 1 : -1) * fy); V.feet[i].a = dir; }
  // the hands go from the walk into the move; a gun or a blade stays in the right hand, tucked against the chest
  const hk = smooth(k / 0.12), hx = key('hx'), hy = key('hy'), d = ch.def;
  const armed = V.wpnOn, two = armed && (d.hold === 'two' || d.swing === 'club');
  mv(TMP, hx, -hy); V.hl.x = lerp(P.hl.x, TMP.x, hk); V.hl.y = lerp(P.hl.y, TMP.y, hk);
  if (two) mv(TMP, 2, 3);
  else if (armed) mv(TMP, 3.5, 3);
  else mv(TMP, hx, hy);
  V.hr.x = lerp(P.hr.x, TMP.x, hk); V.hr.y = lerp(P.hr.y, TMP.y, hk);
  if (two) { mv(TMP, 5, -1.5); V.hl.x = lerp(P.hl.x, TMP.x, hk); V.hl.y = lerp(P.hl.y, TMP.y, hk); }
  if (armed) {
    V.wpn.x = V.hr.x; V.wpn.y = V.hr.y;
    V.wpn.a = lerpA(P.wpn.a, dir + (two ? -0.7 : 0.35), hk);
    V.wpnLen = lerp(P.wpnLen, 0.75, hk);
  }
  V.carryImg = null;
  blendPose(P, V, 1 - smooth((k - 0.8) / 0.2));
  P.duck = Math.max(P.duck, 0.8 * smooth(ph.tuck * 2)); // the head down between the shoulders before it goes under
  return P;
}

// ---------------- slide ----------------
// The phases of a slide (TRAVERSE.slide), each 0 .. 1, at k (0 .. 1 of the slide) and `out` (0 .. 1 of the push
// back up once it is over, Player.updateSlideAnim): the drop (the lead leg shot out, leaning back), how far reclined
// he is, the push back up onto his feet
export function slidePhases(k, out = 0, ph = {}) {
  const T = TRAVERSE.slide;
  ph.drop = easeOut(k / T.drop);
  ph.up = Math.max(smooth((k - T.up) / (1 - T.up)) * 0.35, smooth(out));
  ph.recline = smooth(k / T.drop) * (1 - ph.up);
  return ph;
}
const SP = {};

// A knee slide, seen from above. The drop: a quick lean back and down, the lead leg shot out ahead, the other folded
// under, the trailing hand going down behind. The slide: the torso reclined and turned side-on (the free shoulder
// back toward the palm), the trailing hand flat on the floor, the gun still on the target. The way up: the hand
// pushes off last, the folded leg takes him, the torso is thrown forward past the hips and settles (`pop`).
// ch.slideAnim: { dir, side (-1: the palm on the left of the way), k, w, out }
export function slidePose(ch, P, V) {
  const sl = ch.slideAnim;
  const w = smooth(sl.w);
  if (w <= 0) return P;
  const T = TRAVERSE.slide, ph = slidePhases(sl.k, sl.out ?? 0, SP);
  copyPose(V, P);
  const dir = sl.dir, c = Math.cos(dir), s = Math.sin(dir), side = sl.side, rec = ph.recline, up = ph.up;
  // side-on: the free shoulder drops back toward the palm, the gun shoulder leads, the arms still hold the aim
  V.ta = P.ta + side * T.turn * rec;
  const back = -T.back * rec + T.pop * bump(up, 0.15, 1);
  V.tx = P.tx * (1 - 0.7 * rec) + c * back; V.ty = P.ty * (1 - 0.7 * rec) + s * back;
  V.s = 1 - 0.12 * rec + 0.03 * bump(up, 0.3, 1);
  V.legs = rec;
  V.top = 0;
  V.flat = null;
  // the hands on the weapon go with the shoulders, the arms reaching on to keep it on the target
  const dx = (V.tx - P.tx) * 0.5, dy = (V.ty - P.ty) * 0.5;
  for (const h of [V.hl, V.hr, V.wpn]) { h.x += dx; h.y += dy; }
  // lead leg shot out ahead (on the other side from the palm), the other folded under him; a tremor of the floor;
  // getting up, the folded one takes the weight and the lead one comes back under him
  const shake = Math.sin(ch.world.time * 70) * 0.35 * rec * (1 - sl.k);
  const ext = ph.drop * (1 - up);
  for (let i = 0; i < 2; i++) {
    const lead = (i ? 1 : -1) === -side, f = V.feet[i];
    const lx = lead ? lerp(2, 13, ext) - 2 * bump(up, 0, 0.7) : lerp(0.5, 6, ext) - 1.5 * up;
    const ly = (lead ? lerp(-side * 3.6, -side * 1.5, ext) : lerp(side * 3.6, side * 4.5, ext)) + shake;
    f.x = V.tx * rec + lx * c - ly * s; f.y = V.ty * rec + lx * s + ly * c; f.a = dir + (lead ? 0 : side * 0.6 * ext);
    f.lift = lead ? 0.5 * bump(up, 0.1, 0.8) : 0; f.heel = 0;
  }
  if (ch.def.hold !== 'two') {
    // the trailing hand: down behind him in the drop, flat on the floor beside the hip, a last push off it on the
    // way up (it comes forward under the shoulder), then off
    const on = smooth(sl.k / T.drop) * (1 - smooth((up - 0.55) / 0.45)), push = smooth(up / 0.55);
    const lx = lerp(-5, -1, push), ly = side * lerp(9, 8, push);
    V.hl.x = lerp(V.hl.x, V.tx + lx * c - ly * s, on); V.hl.y = lerp(V.hl.y, V.ty + lx * s + ly * c, on);
    reach(V.hl, V, -1);
    if (on > 0.5) { V.flat = 'hl'; V.flatA = dir + side * 0.4; }
    V.carryImg = null;
  }
  // back into the run as he comes up
  const bw = w * (1 - smooth(((sl.out ?? 0) - 0.55) / 0.45));
  blendPose(P, V, bw);
  if (bw > 0.5 && V.flat) { P.flat = V.flat; P.flatA = V.flatA; }
  return P;
}

// ---------------- the kick out of a slide (Player.kick, TRAVERSE.kick) ----------------
// The phases of the kick at u (0 .. 1 of its clock), each 0 .. 1: up out of the recline onto the standing leg, the
// lead knee drawn up (chambered), the leg out at his head, the foot set down a step ahead, the blend in and out
export function kickPhases(u, out = {}) {
  const T = TRAVERSE.kick;
  out.rise = smooth(u / T.hit);
  out.chamber = smooth(u / T.chamber) * (1 - smooth((u - T.chamber) / (T.hit - T.chamber)));
  out.ext = easeOut((u - T.chamber) / (T.hit - T.chamber)) * (1 - smooth((u - T.hold) / (T.plant - T.hold)));
  out.plant = smooth((u - T.hold) / (T.plant - T.hold));
  out.w = smooth(u / 0.08) * (1 - smooth((u - 0.86) / 0.14));
  return out;
}
const KP = {};

// Seen from above. Out of the slide's recline the body comes up onto the folded leg; the lead leg is drawn back in,
// the knee up (anticipation), then driven out straight at his head, the foot big as it comes up toward the eye; the
// torso goes back off it and the shoulders turn away from the kicking hip (counterweight), the free arm flung back.
// After the contact (held by the hit-stop) the leg stays out a beat, then comes down a step ahead and the body goes
// on over it into the run. The gun stays on the target.
export function kickPose(ch, P, V) {
  const kk = ch.kick, T = TRAVERSE.kick, u = clamp(kk.t / T.dur, 0, 1), ph = kickPhases(u, KP);
  if (ph.w <= 0) return P;
  const a = kk.a, c = Math.cos(a), s = Math.sin(a), side = kk.side, lead = -side; // the slide's lead leg kicks
  const mv = (out, lx, ly) => { out.x = lx * c - ly * s; out.y = lx * s + ly * c; return out; }; // kick space -> pose
  copyPose(V, P);
  // the torso: from the slide's recline up to leaning back off the kick, then on over the planted foot
  const fwd = -TRAVERSE.slide.back * (1 - ph.rise) - T.lean * ph.ext + T.pop * bump(ph.plant, 0, 1);
  V.ta = a + lead * T.twist * ph.ext + side * TRAVERSE.slide.turn * 0.5 * (1 - ph.rise);
  V.tx = c * fwd; V.ty = s * fwd;
  V.s = 1 - 0.1 * (1 - ph.rise) + 0.04 * ph.ext;
  V.ha = lerpA(P.ha, a, ph.ext); // the eyes on him
  V.legs = ph.ext;
  V.top = 0;
  V.flat = null;
  // the arms go with the shoulders, a gun kept on the target; empty hands: the guard up, the free one flung back
  const dx = V.tx - P.tx, dy = V.ty - P.ty;
  for (const h of [V.hl, V.hr, V.wpn]) { h.x += dx; h.y += dy; }
  if (!V.wpnOn) {
    mv(TO, lerp(6, -3, ph.ext), lead * lerp(-5, -10, ph.ext)); mv(AT, lerp(5, 7, ph.ext), lead * lerp(5, 3.5, ph.ext));
    const back = lead > 0 ? V.hl : V.hr, front = lead > 0 ? V.hr : V.hl;
    back.x = V.tx + TO.x; back.y = V.ty + TO.y; front.x = V.tx + AT.x; front.y = V.ty + AT.y;
    V.hand[0] = V.hand[1] = 'fist';
  } else if (ch.def.hold !== 'two') {
    mv(TO, lerp(2, -3.5, ph.ext), -lerp(7, 10.5, ph.ext)); // the left hand out behind for balance
    V.hl.x = V.tx + TO.x; V.hl.y = V.ty + TO.y;
    V.hand[0] = 'loose';
  }
  reach(V.hl, V, -1); reach(V.hr, V, 1);
  // the legs: the standing one under him (it was folded under the slide), the lead one chambered, driven out at his
  // head (as far as it reaches), then set down a step ahead
  const hip = (sd) => mv(SH, 0.6 * fwd, sd * LIMB.hip);
  for (let i = 0; i < 2; i++) {
    const f = V.feet[i], sd = i ? 1 : -1;
    if (sd !== lead) {
      mv(f, lerp(4, -1.5, ph.rise) + 1.5 * ph.plant, sd * lerp(4.5, 3.4, ph.rise));
      f.a = a + sd * 0.35 * (1 - ph.plant); f.lift = 0; f.heel = 0;
      continue;
    }
    // out at his head (where it struck, once it has: Player.landKick), no further than the leg reaches from the hip
    const at = kk.hitAt ?? kk.target;
    hip(sd);
    if (at) onWorld(WAY, ch, at.x, at.y); else mv(WAY, 20, 0);
    const ex0 = WAY.x - SH.x, ey0 = WAY.y - SH.y, el = Math.hypot(ex0, ey0) || 1, rl = Math.min(el, T.reach);
    const ex = SH.x + (ex0 / el) * rl, ey = SH.y + (ey0 / el) * rl;
    mv(TO, 3.5, sd * 2.2); // chambered: the knee up, the foot drawn in under the hip
    mv(AT, 9, sd * 3.2);   // set down a step ahead
    const from = P.feet[i], drawIn = u < T.chamber ? ph.chamber : 1;
    let x = lerp(from.x, TO.x, drawIn), y = lerp(from.y, TO.y, drawIn);
    x = lerp(x, ex, ph.ext); y = lerp(y, ey, ph.ext);
    x = lerp(x, AT.x, ph.plant); y = lerp(y, AT.y, ph.plant);
    f.x = x; f.y = y; f.a = a;
    f.lift = T.lift * ph.ext + 0.8 * ph.chamber; f.heel = 0;
  }
  blendPose(P, V, ph.w);
  P.lift = Math.max(P.lift, 0.15 * ph.ext * ph.w);
  return P;
}
