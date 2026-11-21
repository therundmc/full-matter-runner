// Sat down: at a vehicle's wheel or beside it (Vehicle.seatIn: ch.riding; SEAT in data/feel.js), the boss's Uzi
// grabbed off the seat, and sat on the ground as a level starts (Player.sit), the bottle swigged. DOM-free.
import { BODY_SCALE } from '../../Config.js';
import { GESTURE, SEAT } from '../../data/feel.js';
import { CHASE } from '../../data/chase.js';
import { spriteOpt } from '../../../engine/Assets.js';
import { lerp, clamp, angDiff, smooth, bump, lerpA } from '../../../engine/math.js';
import { onGun, place, blendPose, copyPose, shoulder, reach } from '../CharacterAnim.js';
import { SH, TMP } from './Rig.js';

// ---------------- sat in a vehicle (Vehicle.seatIn: ch.riding = { v, k, aim }) ----------------
// Seen from above in an open car: sat low and leant well back, the thighs out under the dash, ONE hand laid over the
// top of the wheel at the end of a straight arm (it slides round the rim with the steering), the other elbow on the
// door, its hand hanging over the side; the head up. Aiming (riding.aim: a world angle, or null), the arm that has
// the gun comes out with it: the door's hand to his left and ahead (held out over the windscreen), the right hand
// across the passenger seat to his right, the door's hand then on the top of the wheel (riding.hand 0 .. 1: the gun's
// way from the one to the other, eased by Vehicle.carry; none: the side he aims at); the head and the shoulders turn
// after it. riding.k: 0 .. 1 of him settled in (the pose blended in from whatever brought him there: a vault over the
// door). The numbers: data/feel.js SEAT; where the seat and the wheel are: the model's `seat` and `wheel` (sprite px).
// A machine pistol (weapons.js 'side') is not put away: at rest it hangs in the door's hand, out over the door
// (SEAT.hang); aimed to his side, that arm lifts it. riding.up (0 .. 1, eased by Vehicle.carry; none: 1) is how far the
// arm is out, riding.was the way it last pointed. riding.grab: s into the beat of taking the gun off the passenger
// seat (grabPose).
export function seatPose(ch, P, V) {
  const st = ch.riding, v = st.v, m = v.m, S = SEAT, w = smooth(st.k);
  if (w <= 0 || !m.seat) return P;
  const a = v.body.angle, c = Math.cos(a), s = Math.sin(a), d = ch.def;
  const at = (out, lx, ly) => { out.x = lx * c - ly * s; out.y = lx * s + ly * c; };
  const slump = st.slump > 0, grab = !slump && st.grab !== null && st.grab !== undefined;
  const aimA = slump || grab ? null : st.aim ?? (st.up > 0 ? st.was ?? null : null);
  const u = aimA === null ? 0 : st.up === undefined ? 1 : smooth(st.up);
  const hang = d.kind === 'gun' && d.hold === 'side' && !!d.sprite;
  copyPose(V, P);
  V.ta = a + S.lean; V.ha = a;
  V.tx = -c * S.back; V.ty = -s * S.back;
  V.s = S.s; V.lift = 0; V.legs = 1; V.top = 0; V.tuck = 0; V.over = 0; V.px = V.py = 0; V.bow = 0;
  V.carryImg = null; V.wpnOn = false; V.fist = false; V.wpnLen = 1; V.wpnS = 1;
  for (let i = 0; i < 2; i++) {
    const f = V.feet[i], side = i ? 1 : -1;
    at(f, S.feet[0], side * S.feet[1]);
    f.a = a; f.lift = 0; f.heel = 0;
  }
  // the right hand on the top of the rim, the edge nearest the glass; the left on the door, the elbow out over its
  // top (the door is on his left), a machine pistol hanging from it
  const W = m.wheel || [m.seat[0] + 10, m.seat[1], 5, 1.5], g = (v.steer || 0) * S.turn;
  at(WHEEL, (W[0] - m.seat[0] + Math.cos(g) * W[3]) / BODY_SCALE, (W[1] - m.seat[1] + Math.sin(g) * W[2]) / BODY_SCALE);
  at(DOOR, S.door[0] / BODY_SCALE, S.door[1] / BODY_SCALE);
  setPt(V.hr, WHEEL); V.hand[1] = S.lay; V.elb[1] = S.elbow;
  setPt(V.hl, DOOR); V.hand[0] = hang ? 'fist' : 'loose'; V.elb[0] = S.doorElb;
  if (hang) hangGun(V, DOOR, a);
  // the key turned (riding.key 0 .. 1): the right hand leaves the wheel for the ignition
  if (st.key > 0 && m.key) {
    const k = smooth(st.key), kx = (m.key[0] - m.seat[0]) / BODY_SCALE, ky = (m.key[1] - m.seat[1]) / BODY_SCALE;
    V.hr.x = lerp(V.hr.x, kx * c - ky * s, k); V.hr.y = lerp(V.hr.y, kx * s + ky * c, k);
  }
  if (slump) {
    // shot at the wheel: slumped onto it, his head turned aside, his hands slid off the rim
    const k = smooth(st.slump), L = S.slump;
    V.tx += c * L.fwd * k; V.ty += s * L.fwd * k;
    V.ha = a + L.head * k; V.ta = a + L.twist * k;
    for (let i = 0; i < 2; i++) {
      const h = i ? V.hr : V.hl, lx = L.hands[0], ly = (i ? 1 : -1) * L.hands[1];
      h.x = lerp(h.x, lx * c - ly * s, k); h.y = lerp(h.y, lx * s + ly * c, k);
      V.hand[i] = 'loose';
    }
    if (hang) hangGun(V, V.hl, a);
  } else if (st.drag) dragPose(V, st.drag, a, at);
  else if (grab) grabPose(ch, V, st.grab, a, at);
  else if (u > 0) {
    // the arm that has the gun out with it (u: how far), the head and the shoulders turned after it. q: 0 the door's
    // hand has it (anything to his left, and ahead: held out over the windscreen), 1 the right one (across the other
    // seat; seen from above it reads the same in either), the door's hand then on the top of the wheel; between
    // the two the gun goes across in front of him
    const off = angDiff(a, aimA), A = S.aim, gun = d.kind === 'gun' && !!d.sprite;
    const q = st.hand === undefined ? (off < 0 ? 0 : 1) : smooth(st.hand);
    const reach = (A.reach + A.ahead * clamp(1 - Math.abs(off) / A.fore, 0, 1)) * V.s, ca = Math.cos(aimA), sa = Math.sin(aimA);
    V.ta = lerpA(V.ta, a + clamp(off, -A.turn, A.turn) * A.twist, u);
    V.ha = lerpA(V.ha, a + clamp(off, -A.head, A.head), u);
    shoulder(SH, V, -1);
    const lx = lerp(V.hl.x, SH.x + ca * reach, u), ly = lerp(V.hl.y, SH.y + sa * reach, u);
    shoulder(SH, V, 1);
    const rx = SH.x + ca * reach, ry = SH.y + sa * reach, w = q * u;
    V.hl.x = lerp(lx, WHEEL.x, q); V.hl.y = lerp(ly, WHEEL.y, q);
    V.hr.x = lerp(V.hr.x, rx, w); V.hr.y = lerp(V.hr.y, ry, w);
    V.elb[0] = lerp(lerp(V.elb[0], 0.15, u), S.elbow, q);
    V.elb[1] = lerp(V.elb[1], 0.15, w);
    if (q > 0.5) V.hand[0] = S.lay;
    if (gun) {
      V.wpnOn = true; V.fist = q > 0.5;
      V.wpn.x = lerp(lx, rx, q); V.wpn.y = lerp(ly, ry, q);
      V.wpn.a = hang && u < 1 ? lerpA(a + S.hang[0], aimA, u) : aimA;
      V.wpnLen = hang ? lerp(S.hang[1], 1, u) : 1;
    }
  }
  blendPose(P, V, w);
  if (w > 0.5) { P.wpnOn = V.wpnOn; P.carryImg = V.carryImg; P.flat = null; P.magIn = null; }
  if (P.carryImg) { P.carry.x = V.carry.x; P.carry.y = V.carry.y; P.carry.a = V.carry.a; }
  return P;
}

// The end of a cigarette in the door's hand (level 2A's opening: systems/LastDrag.js, riding.drag = its phases;
// CHASE.intro.hand): out over the door at rest, brought up to his mouth for the drag (his head a little down to
// it), then the arm snapped out as he flicks it away; the cigarette drawn in that hand until it has left it
function dragPose(V, ph, a, at) {
  const H = CHASE.intro.hand, l = V.hl;
  at(LIPS, H.mouth[0], H.mouth[1]);
  at(FLICK, H.out[0], H.out[1]);
  const mx = V.tx + LIPS.x, my = V.ty + LIPS.y;
  l.x = lerp(lerp(DOOR.x, mx, ph.mouth), FLICK.x, ph.flick);
  l.y = lerp(lerp(DOOR.y, my, ph.mouth), FLICK.y, ph.flick);
  V.elb[0] = lerp(lerp(SEAT.doorElb, 0.6, ph.mouth), 0.05, ph.flick);
  V.hand[0] = ph.held ? 'fist' : 'loose';
  V.ha = a - 0.22 * ph.mouth - 0.5 * ph.flick * (ph.held ? 1 : 0.6);
  V.wpnOn = false;
  if (!ph.held) return;
  V.carryImg = spriteOpt('items/cigarette');
  // (its filter in his fingers: it points out over the door at rest, ahead of his face at his mouth)
  V.carry.a = a + lerp(-Math.PI / 2, -0.35, ph.mouth);
  V.carry.x = l.x + Math.cos(V.carry.a) * 2.4; V.carry.y = l.y + Math.sin(V.carry.a) * 2.4;
}
const LIPS = { x: 0, y: 0 }, FLICK = { x: 0, y: 0 };
const WHEEL = { x: 0, y: 0 }, DOOR = { x: 0, y: 0 }, GRIP = { x: 0, y: 0 }, CHEST = { x: 0, y: 0 }, KNOB = { x: 0, y: 0 };
const setPt = (out, p) => { out.x = p.x; out.y = p.y; };

// the gun hanging from hand h over the door (SEAT.hang), the car heading a
function hangGun(V, h, a) {
  V.wpnOn = true; V.fist = false;
  V.wpn.x = h.x; V.wpn.y = h.y; V.wpn.a = a + SEAT.hang[0]; V.wpnLen = SEAT.hang[1];
}

// The phases of the grab at t s into it (data/feel.js SEAT.grab), each 0 .. 1: his head to the seat, the right hand
// onto the gun, the body leant over to it, the gun in his hand (held), up across his chest, the rack's progress, the
// left hand closing on the grip, the gun to the door and the right hand back to the wheel, done
export function grabPhases(t, out = {}) {
  const G = SEAT.grab, span = (a, b) => smooth((t - a) / (b - a));
  out.look = span(...G.look);
  out.reach = span(...G.reach);
  out.held = t >= G.take;
  out.lift = span(...G.lift);
  out.over = out.reach * (1 - out.lift);
  out.rack = clamp((t - G.rack[0]) / (G.rack[1] - G.rack[0]), 0, 1);
  const mid = G.hand[0] + (G.hand[1] - G.hand[0]) * G.give;
  out.give = span(G.hand[0], mid);
  out.hand = span(mid, G.hand[1]);
  out.done = t >= G.dur;
  return out;
}
const GRP = {};

// The gun taken off the passenger seat (Vehicle `gun`, systems/Drive.js grab), t s in: the head turns to it, the right
// hand leaves the wheel, the shoulders turn and he leans over, the hand closes on its grip; it comes up across his
// chest, the left hand comes off the door, takes the cocking knob, pulls it back and lets go; the gun goes into the
// left hand and out over the door, the right hand back on the wheel (V: the rest pose seatPose made, the car heading a,
// at: the car's frame to the pose's)
function grabPose(ch, V, t, a, at) {
  const G = SEAT.grab, m = ch.riding.v.m, d = ch.def, ph = grabPhases(t, GRP), k = V.s;
  // the body: turned to the seat and leant over it, then back
  V.ta += G.twist * ph.over;
  at(TMP, G.over[0] * ph.over, G.over[1] * ph.over);
  V.tx += TMP.x; V.ty += TMP.y;
  V.ha = a + lerp(G.head * ph.look, G.eye, ph.lift) * (1 - ph.hand);
  // the right hand: the wheel, the grip on the seat, the chest, the wheel
  const gun = m.gun ?? [m.seat[0] + 4, m.seat[1] + 20, Math.PI / 2];
  at(GRIP, (gun[0] - m.seat[0]) / BODY_SCALE, (gun[1] - m.seat[1]) / BODY_SCALE);
  at(CHEST, G.chest[0], G.chest[1]);
  const r = V.hr;
  r.x = lerp(lerp(lerp(WHEEL.x, GRIP.x, ph.reach), CHEST.x, ph.lift), WHEEL.x, ph.hand);
  r.y = lerp(lerp(lerp(WHEEL.y, GRIP.y, ph.reach), CHEST.y, ph.lift), WHEEL.y, ph.hand);
  V.hand[1] = ph.reach > 0.5 && !ph.held ? 'loose' : 'fist';
  V.elb[1] = lerp(SEAT.elbow, 0.35, ph.reach * (1 - ph.hand));
  // the gun: drawn by the car until it is taken; in the right hand, then in the left
  const ga = lerpA(lerpA(a + gun[2], a + G.chestA, ph.lift), a + SEAT.hang[0], ph.hand);
  V.wpnOn = ph.held && d.kind === 'gun' && !!d.sprite;
  V.fist = false;
  V.wpn.a = ga;
  V.wpnLen = lerp(1, SEAT.hang[1], ph.hand);
  // the left hand: the door, the knob (along the gun's rack points), the grip, the door again with the gun
  const l = V.hl;
  if (ph.rack > 0) {
    const R = d.rack ?? [[d.grip + 2, -3]], f = ph.rack;
    let x = R[0][0], y = R[0][1];
    if (f > G.knob) {
      const q = clamp((f - G.knob) / (G.racked - G.knob), 0, 1) * (R.length - 1), i = Math.min(R.length - 2, Math.floor(q)), e = smooth(q - i);
      if (R.length > 1) { x = lerp(R[i][0], R[i + 1][0], e); y = lerp(R[i][1], R[i + 1][1], e); }
    }
    onGun(d, false, x, y, CHEST.x, CHEST.y, a + G.chestA, k, k, KNOB);
    const e = smooth(f / G.knob);
    l.x = lerp(DOOR.x, KNOB.x, e); l.y = lerp(DOOR.y, KNOB.y, e);
    V.hand[0] = 'fist'; V.elb[0] = lerp(SEAT.doorElb, 0.5, e);
  }
  if (ph.give > 0) { l.x = lerp(l.x, CHEST.x, ph.give); l.y = lerp(l.y, CHEST.y, ph.give); }
  if (ph.hand > 0) {
    l.x = lerp(CHEST.x, DOOR.x, ph.hand); l.y = lerp(CHEST.y, DOOR.y, ph.hand);
    V.elb[0] = lerp(0.5, SEAT.doorElb, ph.hand);
    if (ph.hand > 0.5) V.hand[0] = d.hold === 'side' ? 'fist' : 'loose';
  }
  const h = ph.hand > 0 ? l : r;
  V.wpn.x = h.x; V.wpn.y = h.y;
  // up before his chest it is drawn over his shoulders, the hand(s) on it with it, until it goes out to the door
  if (V.wpnOn && ph.lift > 0.3 && ph.hand < 0.5) V.top = ph.rack > 0 ? 2 : 1;
}

// ---------------- sitting on the ground (Player.sit: how a level starts) ----------------
// slumped, his back to the wall and his head resting on it, the left knee up, the right leg out, palms on the floor by
// the hips (GESTURE.sit); ch.sit runs 1 -> 0 as he gets up: the left hand pushes on the ground, the right foot is
// drawn in under him, he bends forward over it and comes up as the pose blends back into the stance
export function sitPose(ch, P, V) {
  const w = smooth(ch.sit);
  if (w <= 0) return P;
  copyPose(V, P);
  const S = GESTURE.sit, a = ch.angle, c = Math.cos(a), s = Math.sin(a);
  const r = ch.rising ? 1 - clamp(ch.sit, 0, 1) : 0, push = bump(r, 0, 0.9), draw = smooth(r * 2);
  V.ta = a + S.slump + S.turn * push;
  V.tx = -c * S.back; V.ty = -s * S.back;
  V.s = S.s;
  V.legs = 1;
  V.top = 0;
  V.carryImg = null;
  V.ha = a + S.head * (1 - smooth(r * 3));
  V.bow = lerp(S.rest, S.bow, smooth(r * 2.2));
  for (let i = 0; i < 2; i++) {
    const F = S.feet[i], lx = i ? lerp(F[0], S.knee, draw) : F[0], ly = F[1], f = V.feet[i];
    f.x = V.tx + lx * c - ly * s; f.y = V.ty + lx * s + ly * c; f.a = a + F[2] * (1 - draw); f.lift = 0; f.heel = 0;
  }
  place(V.hl, V, a, lerp(S.palm[0], S.push[0], draw) / V.s, lerp(-S.palm[1], S.push[1], draw) / V.s);
  place(V.hr, V, a, S.palm[0] / V.s, S.palm[1] / V.s);
  reach(V.hl, V, -1); reach(V.hr, V, 1);
  // a weapon in his right hand lies on the floor under it, pointing ahead; while that hand drinks, it lets go of it
  V.wpn.x = V.hr.x; V.wpn.y = V.hr.y; V.wpn.a = ch.angle + 0.35; V.wpnLen = 1; V.wpnS = 1;
  V.fist = V.fist && !ch.swig;
  if (ch.swig) swigPose(ch, V);
  blendPose(P, V, w);
  P.carryImg = w > 0.5 ? V.carryImg : null; // the bottle: his as long as he sits
  return P;
}

// The bottle he finishes first (Player.swig, GESTURE.swig), in his right hand. On his thigh; up to his mouth, the left
// hand pulling his collar down, his head tipping back with each gulp and the bottle further up as it empties; down
// and held before his eyes, turned over once: empty; drawn back behind his shoulder, the shoulders turning with it
// and the left hand going out; flung at the wall across, the shoulders coming through first, the elbow, then the
// wrist; the arm swings on across him and comes down, and he is as he sat.
function swigPose(ch, V) {
  const g = ch.swig, T = GESTURE.swig, H = T.hand, S = GESTURE.sit, t = g.t, a = ch.angle;
  const drink = smooth((t - T.drink[0]) / T.lift) * (1 - smooth((t - T.drink[1]) / T.lower));
  const look = smooth((t - T.look[0]) / T.glance) * (1 - smooth((t - T.back[0]) / T.glance));
  const back = smooth((t - T.back[0]) / (T.back[1] - T.back[0]));
  const fl = clamp((t - T.back[1]) / (T.throw - T.back[1]), 0, 1), fling = fl * fl;
  const after = clamp((t - T.throw) / (T.end - T.throw), 0, 1);
  const follow = smooth(after / T.follow), settle = smooth((after - T.follow) / (1 - T.follow));
  const k = clamp((t - T.drink[0]) / (T.drink[1] - T.drink[0]), 0, 1); // how far down the bottle he is
  const gulp = drink * Math.max(0, Math.sin(k * Math.PI * T.gulps));
  const held = (i, rest) => lerp(lerp(lerp(lerp(lerp(lerp(H.lap[i], H.mouth[i], drink), H.look[i], look), H.back[i], back), H.out[i], fling),
    H.across[i], follow), rest, settle);
  // his shoulders: back with each gulp, turned back with the wind-up and through with the throw, forward with it
  const lean = gulp * T.lean - T.lunge * fling * (1 - settle);
  V.tx -= Math.cos(a) * lean; V.ty -= Math.sin(a) * lean;
  V.ta += lerp(T.twist[0] * back, T.twist[1], smooth(fl)) * (1 - settle);
  // his head: back with each gulp, turned to the bottle when he looks at it, on the wall from the wind-up on
  V.bow -= gulp * T.tip;
  V.ha = a + S.head * (1 - back * (1 - settle)) * (1 - look) + T.eye * look;
  // the left hand at his collar while he drinks (it gives with each gulp), out as he winds up, back on the ground
  const brace = back * (1 - settle), lx = lerp(lerp(S.palm[0], T.collar[0] - 0.6 * gulp, drink), T.brace[0], brace);
  place(V.hl, V, a, lx / V.s, lerp(lerp(-S.palm[1], T.collar[1], drink), T.brace[1], brace) / V.s);
  reach(V.hl, V, -1);
  place(V.hr, V, a, held(0, S.palm[0]) / V.s, held(1, S.palm[1]) / V.s);
  reach(V.hr, V, 1);
  V.elb[1] = lerp(lerp(V.elb[1], 1, back), 0.05, fling) * (1 - settle) + V.elb[1] * settle;
  V.hand[0] = drink > 0.5 ? 'fist' : 'loose';
  V.hand[1] = g.thrown ? 'loose' : 'fist';
  if (g.thrown) return;
  V.carryImg = spriteOpt('items/bottle');
  // the bottle: tipped further up as it empties, turned over once when he looks at it, snapped forward by the wrist
  const turn = lerp(lerp(lerp(H.lap[2], H.mouth[2] + T.empty * k, drink), H.look[2] + T.wag * Math.sin(Math.PI * clamp((t - T.look[0]) / (T.look[1] - T.look[0]), 0, 1)), look),
    H.back[2], back);
  V.carry.x = V.hr.x; V.carry.y = V.hr.y; V.carry.a = a + lerp(turn, H.out[2], fl * fl * fl);
}
