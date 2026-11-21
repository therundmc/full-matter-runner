// A guard taken from behind or face to face (Player.takedown, data/finishers.js TAKEDOWNS): the two poses, the
// player's (takedownPose) and the held man's (heldPose), beat by beat, with each variant's own gestures. DOM-free.
import { TAKEDOWN } from '../../Config.js';
import { slamAt } from '../../systems/Takedown.js';
import { lerp, clamp, angDiff, smooth, lerpA } from '../../../engine/math.js';
import { NECK, LIMB, SH, in2, BOW, ahead, YIELD_FEET } from './Rig.js';
import { blendPose, copyPose, shoulder } from '../CharacterAnim.js';
import { hairHeld } from './Shield.js';

// ---------------- a guard taken from behind (Player.takedown, data/finishers.js TAKEDOWNS) ----------------
// The player right behind the man, both looking the same way: x forward in what follows, the man D pose px ahead
// (his centre; his nape, throat and mouth along x). Every beat is an anticipation that ends on its blow: u = 0..1
// through the wait, the blow at 1; hit = s since the last one landed. By grip:
//   neck    the right forearm across his throat, the left hand flat on his head; both shake through the struggle,
//           and the twist takes the hands round his head
//   mouth   the left hand flat over his mouth; the blade comes round under his chin, then is drawn across his throat
//   collar  the left fist in the back of his collar; the gun brought down onto his nape and fired (the hand kicks
//           back), or raised and its butt brought down on the nape
//   cue     the cue across his throat in both hands, pulled back
//   none    a club raised in both hands over the right shoulder (pointing back and out) and brought down on his
//           nape; a long gun turned round, butt first, driven into the back of his head, then turned on him and
//           fired down into him as he sinks
const ON = { nape: -1.8, throat: 2.8, mouth: 3.9, head: NECK }; // pose px off his centre, along his facing
// A head driven into what is in front of him (grip 'hair', systems/Takedown.js slamAt), by the spot's kind (pose
// px along his facing): fwd = his shoulders thrown at it at the blow, bow = how far he is bent over it then (BOW),
// back = his shoulders yanked back by the hair, kneel = forced onto his knees first (on them by the end of the
// second beat), grab = px behind the centre of his head our fist is in his hair
const SLAM_POSE = {
  bowl: { fwd: 6, bow: 1.4, back: 3.5, kneel: 1, grab: 1.5 },
  urinal: { fwd: 5, bow: 0.9, back: 3.5, kneel: 1, grab: 1.5 },
  sink: { fwd: 5.5, bow: 1, back: 3.5, kneel: 0, grab: 1.5 },
  ledge: { fwd: 6, bow: 1.2, back: 3.5, kneel: 0, grab: 1.5 },
  wall: { fwd: 5.5, bow: 0.6, back: 3.5, kneel: 0, grab: 1.5 },
};
// where his head is in his own pose (pose px along his facing, from his centre) for slamAt state sl, and how far
// down his knees have gone
export function slamHead(td, sl) {
  const S = SLAM_POSE[td.f.context], f = td.f;
  const kneel = S.kneel ? smooth(td.age / (f.beats[0][0] + f.beats[1][0])) : 0;
  const fwd = S.fwd * sl.drive - S.back * sl.back, bow = S.bow * sl.drive - 0.5 * sl.back;
  const s = 1 - 0.05 * sl.drive - 0.12 * kneel;
  return { S, kneel, fwd, bow, s, head: fwd + (NECK + BOW.reach * bow) * s };
}
const ARM_LEN = LIMB.upper + LIMB.fore - 0.6;                     // a hand reaching right out (reach() is the poses')
export function reachOut(h, P, side) {
  shoulder(SH, P, side);
  const dx = h.x - SH.x, dy = h.y - SH.y, len = Math.hypot(dx, dy), max = ARM_LEN * P.s;
  if (len > max) { h.x = SH.x + (dx / len) * max; h.y = SH.y + (dy / len) * max; }
}

// The variants' own gestures (TAKEDOWNS `pose`), in takedownPose's frame; null where the grip's or the weapon's own
// pose does for this beat. Returns what takedownPose places: { lean, twist, hl, hr (aim frame, or null: as he
// stands), wa, len, top }; C: { N, T, M, H, D, from, kick, shake, a }.
//   sleeper  the arm round his neck squeezed tighter and tighter; he goes slack and is let down (we bend over him)
//   rabbit   the right fist raised by the ear and brought down on his nape; he folds, both hands take his head and
//            the knee goes into the back of it
//   kidney   the left hand over his mouth, the blade low by the hip driven in under his ribs, then turned there
//   spike    the left hand over his mouth, the blade raised point down by the shoulder and driven into his neck
//   low      a club (or the cue) swung low from the right into the back of his knee
//   pistol   the gun tipped down at the back of one knee, then the other (the hand kicks back each time), raised to
//            his nape once he is on his knees, fired
//   double   his collar in the left fist, the muzzle in his back, fired, raised to his nape, fired
// Face to face (`front`: he stands D ahead, turned to us):
//   headbutt his shoulders taken, our head into his face; he folds, his head brought down on the knee
//   throat   the right fist drawn back and driven into his throat, then his collar taken and his legs swept
//   kidney   (the same blade under the ribs, the left hand on his shoulder)
//   chin     his collar taken, the muzzle up under his chin, fired
//   temple   the club drawn back out to the right and swung flat across the side of his head
function variantPose(f, what, u, td, d, V, C) {
  const { N, T, M, H, D, from, kick, shake } = C, done = td.done;
  const out = { lean: 0, twist: 0, hl: null, hr: null, wa: 0, len: V.wpnLen, top: 0 };
  const jolt = td.i > 0 || done ? Math.exp(-td.hit * 9) : 0; // the last beat that landed, dying away
  if (f.pose === 'sleeper') {
    const grab = td.i === 0 && !done ? smooth(u) : 1, tight = what === 'struggle' ? smooth(u) : what === 'limp' ? 1 : 0;
    const low = what === 'limp' ? (done ? 1 : smooth(u)) : 0;
    out.hl = from(V.hl, H + 0.2, -4.2 + shake, grab);
    out.hr = from(V.hr, T + 0.6 - 0.9 * tight, -1.2 + shake * 0.5, grab);
    out.lean = -1.2 * grab - 0.8 * tight + 3.2 * low;
    out.twist = shake * 0.04 - 0.12 * tight * C.side;
    V.s *= 1 - 0.07 * low;
    V.hand[0] = 'flat'; V.hand[1] = 'loose';
    V.flat = 'hl'; V.flatA = C.a + 1.2;
    V.elb[0] = V.elb[1] = 0.25;
  } else if (f.pose === 'rabbit') {
    if (what === 'windup') {
      const k = smooth(u);
      out.hr = from(V.hr, 0.5, 5.5, k);
      out.lean = -0.8 * k; out.twist = 0.3 * k; out.top = 1;
    } else if (what === 'nape') {
      const e = in2(u);
      out.hr = [lerp(0.5, N - 0.5, e), lerp(5.5, 1, e)];
      out.lean = lerp(-0.8, 2.2, e); out.twist = lerp(0.3, -0.35, e); out.top = 1;
    } else {
      // he is on his knees: his head taken in both hands, the knee driven into the back of it
      const k = smooth(u / 0.45), e = done ? 1 : in2((u - 0.5) / 0.5);
      out.hl = from(V.hl, N + 1.2 - 2 * e, -3, k);
      out.hr = from(V.hr, N + 1.2 - 2 * e, 3, k);
      out.lean = 2.2 * (1 - k) - 1.5 * k * (1 - e) + 4.5 * e;
      V.s *= 1 + 0.05 * k * (1 - e) - 0.04 * e;
    }
    V.hand[0] = V.hand[1] = 'fist';
  } else if (f.pose === 'headbutt') {
    const F = D - 2.6, k = td.i === 0 && !done ? smooth(u) : 1;
    if (what === 'knee') {
      // he has folded: his head taken in both hands and brought down on the knee
      const g = smooth(u / 0.45), e = done ? 1 : in2((u - 0.5) / 0.5);
      out.hl = [F - 2 * e, -3]; out.hr = [F - 2 * e, 3];
      out.lean = -1.5 * g * (1 - e) + 4.5 * e;
      V.s *= 1 + 0.05 * g * (1 - e) - 0.04 * e;
    } else {
      // his shoulders taken, the head drawn back and driven into his face
      const e = what !== 'headbutt' ? 0 : u < 0.5 ? -0.5 * smooth(u / 0.5) : lerp(-0.5, 1, in2((u - 0.5) / 0.5));
      out.hl = from(V.hl, F + 1.5, -5, k); out.hr = from(V.hr, F + 1.5, 5, k);
      out.lean = 4.5 * e;
    }
    V.hand[0] = V.hand[1] = 'fist';
  } else if (f.pose === 'throat') {
    const F = D - 2.6;
    if (what === 'windup') {
      const k = smooth(u);
      out.hr = from(V.hr, 0, 6, k);
      out.twist = 0.4 * k; out.lean = -0.6 * k;
    } else if (what === 'throat') {
      const e = in2(u);
      out.hr = [lerp(0, F, e), lerp(6, 0.5, e)];
      out.twist = lerp(0.4, -0.4, e); out.lean = lerp(-0.6, 2.2, e);
    } else {
      // his collar taken, the hips turned through him: his legs go from under him
      const k = smooth(u / 0.3), e = done ? 1 : in2(u);
      out.hl = from(V.hl, F + 2, -4, k);
      out.hr = [lerp(F, F + 1.5, k), lerp(0.5, 3.5, k)];
      out.twist = lerp(-0.4, 0.95, e); out.lean = 2.2 - 1.2 * e;
    }
    V.hand[0] = V.hand[1] = 'fist';
  } else if (f.pose === 'chin') {
    // his collar in the left fist (a long gun: both hands on it), the muzzle brought up under his chin, fired
    const F = D - 2.6, two = d.hold === 'two', k = td.i === 0 && !done ? smooth(u) : 1;
    const up = what === 'muzzle' ? smooth(u / 0.6) : what === 'shot' ? 1 : 0;
    out.len = lerp(V.wpnLen, 0.45, up) - 0.12 * kick;
    out.hr = from(V.hr, Math.max(2, F - 0.5 - ahead(d) * 0.45) - 2.5 * kick, 1.2, up);
    if (two) out.hl = [out.hr[0] + ((d.fore ?? d.grip + 6) - d.grip) * out.len, out.hr[1] - 0.8];
    else { out.hl = from(V.hl, D + 0.5, -5, k); V.hand[0] = 'fist'; }
    out.wa = -0.2 * kick;
    out.lean = 0.8 * up - 1.5 * kick;
    out.top = up > 0.5 ? 1 : 0;
  } else if (f.pose === 'temple') {
    // drawn back out to the right, swung flat across the side of his head
    const F = D - 1.5, b = what === 'windup' ? smooth(u) : 1, e = what === 'temple' ? (done ? 1 : in2(u)) : 0;
    out.hr = from(V.hr, lerp(1, F - 3, e), lerp(8, -3, e), b);
    if (d.hold !== 'both' && d.hold !== 'side' && !d.short) out.hl = [out.hr[0] - 1.5, out.hr[1] - 1.6];
    out.wa = lerp(1.4 * b, -1, e);
    out.len = 1;
    out.twist = lerp(0.5 * b, -0.55, e);
    out.lean = lerp(-b, 2.2, e);
  } else if (f.pose === 'kidney' || f.pose === 'spike') {
    const grab = td.i === 0 && !done ? smooth(u) : 1;
    // the left hand over his mouth; face to face, on his shoulder
    out.hl = f.front ? from(V.hl, D + 0.5, -5.5, grab) : from(V.hl, M, -0.6, grab);
    V.flat = 'hl'; V.flatA = C.a + 1.35;
    V.elb[0] = 0.2; V.elb[1] = 0.3;
    out.lean = -grab;
    if (f.pose === 'kidney') {
      const e = what === 'stab' ? in2(u) : what === 'wrench' ? 1 : 0, turn = what === 'wrench' ? (done ? 1 : smooth(u)) : 0;
      const q = what === 'wrench' && !done ? Math.sin(td.age * 50) * 0.3 * Math.sin(Math.PI * u) : 0;
      out.hr = from(V.hr, lerp(2, D - (f.front ? 3 : 1.5), e) + q, lerp(5.5, 3.2, e), grab);
      out.len = lerp(V.wpnLen, 0.45, e);
      out.wa = 1.1 * turn;
      out.lean += 1.6 * e + 0.8 * turn;
      out.twist = -0.2 * e;
    } else {
      const up = what === 'windup' ? smooth(u) : what === 'stab' ? 1 : 0, e = what === 'stab' ? (done ? 1 : in2(u)) : 0;
      out.hr = from(V.hr, lerp(lerp(1.5, 0, up), T - 0.5, e), lerp(lerp(4.5, 3, up), 1.5, e), grab);
      out.len = lerp(lerp(V.wpnLen, -0.5, up), 0.3, e);
      out.wa = -0.5 * up * (1 - e);
      out.lean += -0.4 * up + 2.6 * e;
      out.twist = 0.2 * up - 0.35 * e;
      out.top = up > 0.3 ? 1 : 0;
      V.s *= 1 + 0.03 * up * (1 - e);
    }
  } else if (f.pose === 'low') {
    if (what !== 'kneeHit') return null;
    const back = smooth(u / 0.5), sw = u < 0.5 ? 0 : in2((u - 0.5) / 0.5);
    out.hr = from(V.hr, lerp(lerp(3, -1, back), D - 4, sw), lerp(lerp(4, 8, back), 2.5, sw), smooth(u / 0.25));
    out.hl = [out.hr[0] - 1.5, out.hr[1] - 1.6];
    out.wa = lerp(1.3 * back, -0.5, sw);
    out.len = 1;
    out.lean = lerp(-back, 2.5, sw);
    out.twist = lerp(0.45 * back, -0.35, sw);
    V.s *= 1 - 0.05 * sw;
  } else if (f.pose === 'pistol') {
    const nape = clamp((N + 0.4 - 6.4) / ahead(d), 0.3, 1);
    if (what === 'kneeShot') {
      const k = td.i === 0 ? smooth(u / 0.5) : 1, sd = td.i ? -1 : 1;
      out.hr = from(V.hr, 5.5 - 2.2 * jolt, 1.6 + 1.8 * sd, k);
      out.len = lerp(V.wpnLen, 0.5, k) - 0.12 * jolt;
      out.wa = 0.25 * sd * k;
      out.lean = 0.8 * k - 1.2 * jolt;
      V.s *= 1 - 0.04 * k;
    } else {
      const k = what === 'muzzle' ? smooth(u / 0.7) : 1, j = what === 'muzzle' ? jolt : 0;
      out.hr = [lerp(5.5, 6.4, k) - 2.2 * j - 2.5 * kick, lerp(-0.2, 1.6, k)];
      out.len = lerp(0.5, nape, k) - 0.12 * j - 0.15 * kick;
      out.wa = -0.25 * (1 - k) - 0.25 * kick;
      out.lean = 0.8 - 1.2 * j - 1.5 * kick;
    }
    out.top = 1;
    V.elb[1] = 0.6;
  } else if (f.pose === 'double') {
    if (what === 'seize') return null;
    const back = clamp((D - 1 - 4.6) / ahead(d), 0.3, 1), nape = clamp((N + 0.4 - 6.4) / ahead(d), 0.3, 1);
    const k = what === 'muzzle' ? smooth(u / 0.7) : 1, e = what === 'shot' ? (done ? 1 : smooth(u / 0.6)) : 0, j = what === 'shot' ? jolt * (1 - e) : 0;
    out.hl = from(V.hl, N - 1, -1.8, 1);
    out.hr = from(V.hr, lerp(4.6, 6.4, e) - 2.2 * j - 2.5 * kick, lerp(2, 1.6, e), k);
    out.len = lerp(V.wpnLen, lerp(back, nape, e), k) - 0.12 * j - 0.15 * kick;
    out.wa = -0.2 * j - 0.25 * kick;
    out.lean = 0.6 * k - 1.2 * j - 1.5 * kick;
    out.top = k > 0.5 ? 1 : 0;
    V.hand[0] = 'fist';
    V.elb[0] = 0.3; V.elb[1] = 0.6;
  } else return null;
  return out;
}

export function takedownPose(ch, P, V) {
  const td = ch.takedown, f = td.f, d = td.def, a = ch.angle, c = Math.cos(a), s = Math.sin(a);
  const [wait, what] = f.beats[td.i], u = td.done ? 1 : clamp(td.t / wait, 0, 1), D = td.d, side = td.side;
  const thud = Math.exp(-td.hit * 14);
  const kick = td.done && what === 'shot' ? Math.exp(-td.t * 9) : 0;
  const N = D + ON.nape, T = D + ON.throat, M = D + ON.mouth, H = D + ON.head;
  // into it as he closes in, out of it over the end of `after`
  const m = smooth(td.age / TAKEDOWN.set) * (td.done ? 1 - smooth((td.t / f.after - 0.55) / 0.45) : 1);
  copyPose(V, P);
  let lean = 0, twist = 0, hl = null, hr = null, wa = 0, len = V.wpnLen, top = 0;
  V.flat = null;
  const seizeAt = f.beats.findIndex((b) => b[1] === 'seize');
  const grab = f.grip && td.i === seizeAt && !td.done ? smooth(u) : 1; // the hands closing on him through the seize
  // from where a hand is in the standing pose (aim frame) to (x, y), k of the way
  const from = (h, x, y, k) => {
    const hx = h.x * c + h.y * s, hy = -h.x * s + h.y * c;
    return [lerp(hx, x, k), lerp(hy, y, k)];
  };
  const shake = what === 'struggle' && !td.done ? Math.sin(td.age * 46) * 0.7 * Math.sin(Math.PI * u) : 0;
  // a variant's own gesture for this beat, else the grip's or the weapon's
  const mv = f.pose ? variantPose(f, what, u, td, d, V, { N, T, M, H, D, from, kick, shake, side, a }) : null;
  if (mv) ({ lean, twist, hl, hr, wa, len, top } = mv);
  else if (f.grip === 'neck' || f.grip === 'cue') {
    // the twist turns everything round his head; a cue is pulled back hard instead
    const cue = f.grip === 'cue', w = what === 'twist' ? (td.done ? 1 : in2(u)) : 0;
    const r = (cue ? 0 : side * 1.15) * w, rc = Math.cos(r), rs = Math.sin(r);
    const round = (x, y) => [H + (x - H) * rc - y * rs, (x - H) * rs + y * rc];
    const pull = cue ? 1.2 * w + 0.6 * Math.abs(shake) : 0;
    const L = cue ? [T - pull, -7.5] : round(H + 0.2, -4.2), R = cue ? [T - pull, 7.5] : round(T + 0.6, -1.2 + shake * 0.5);
    hl = from(V.hl, L[0], L[1] + shake, grab); hr = from(V.hr, R[0], R[1], grab);
    lean = -1.2 * grab - pull * 0.6;
    twist = (cue ? 0 : -side * 0.18 * w) + shake * 0.04;
    V.hand[0] = cue ? 'fist' : 'flat'; V.hand[1] = cue ? 'fist' : 'loose';
    if (!cue) { V.flat = 'hl'; V.flatA = a + r + 1.2; }
    V.elb[0] = V.elb[1] = 0.25;
    if (cue) { wa = -Math.PI / 2; len = 1; top = 2; }
  } else if (f.grip === 'mouth') {
    // the left hand over his mouth; the blade under his chin (draw), then across (cut)
    hl = from(V.hl, M, -0.6, grab);
    V.flat = 'hl'; V.flatA = a + 1.35;
    let k = 0, x = T + 0.6, y = -3.2;
    if (what === 'draw' && !td.done) { k = smooth(u); wa = -0.6 * k; }
    else if (what === 'cut') {
      const e = td.done ? 1 : in2(u);
      k = 1; x = lerp(T + 0.6, T - 0.4, e); y = lerp(-3.2, 5.5, e); wa = lerp(-0.6, 0.5, e);
    }
    hr = from(V.hr, x, y, k);
    const cut = what === 'cut' ? (td.done ? 1 : u) : 0;
    lean = -1 * grab - 0.8 * cut;
    twist = 0.15 * cut;
    V.elb[0] = 0.2; V.elb[1] = 0.3;
    len = lerp(V.wpnLen, 0.8, k);
    top = k > 0.5 ? 1 : 0;
  } else if (f.grip === 'collar') {
    hl = from(V.hl, N - 1, -1.8, grab);
    V.hand[0] = 'fist';
    V.elb[0] = 0.3;
    if (what === 'muzzle' || what === 'shot') {
      // the gun brought down onto his nape, tipped down at it (it shows shorter), held, fired
      const k = what === 'muzzle' && !td.done ? smooth(u / 0.7) : 1, x = 6.4 - 2.5 * kick, y = 1.6;
      hr = from(V.hr, x, y, k);
      len = lerp(V.wpnLen, clamp((N + 0.4 - x) / ahead(d), 0.3, 1), k) - 0.15 * kick;
      wa = 0.06 * k - 0.25 * kick;
      lean = 0.6 * k - 1.5 * kick;
      top = k > 0.5 ? 1 : 0; // the arm out over his back
      V.elb[1] = 0.6;
    } else if (what === 'windup' || what === 'nape') {
      // raised, butt down, over the shoulder; brought down on the nape
      const up = what === 'windup' ? (td.done ? 0 : smooth(u)) : td.done ? 0 : 1 - in2(u);
      hr = from(V.hr, lerp(N - 0.8, 0.5, up), lerp(1, 5, up), what === 'windup' ? smooth(u * 1.5) : 1);
      len = lerp(0.35, -0.6, up); wa = lerp(0.15, -0.7, up);
      lean = lerp(1.6, -1, up) + 0.6 * thud;
      top = 1;
      V.elb[1] = 0.45;
    }
  } else if (f.grip === 'hair') {
    // his head driven into what is in front of him: the left fist in his hair follows it (yanked back, driven in), the
    // right hand on his upper back pins him (fists: in his collar; a weapon in it, held there out of the way); we
    // go in with each blow, the shoulders behind it
    const sl = slamAt(td), G = slamHead(td, sl), tg = td.target, r = angDiff(a, tg.facing?.sh ?? tg.angle), rc = Math.cos(r), rs = Math.sin(r);
    const on = (x, y) => [D + x * rc - y * rs, x * rs + y * rc]; // a point of his pose (his frame) in ours
    const free = td.done ? smooth(td.t / (f.after * 0.6)) : 0;
    const L = on(G.head - G.S.grab - 3 * free, -0.6), R = on(G.fwd - 3, 2.6);
    hl = from(V.hl, L[0], L[1] - 2.5 * free, grab);
    hr = from(V.hr, R[0], R[1], grab);
    V.hand[0] = free > 0.5 ? 'loose' : 'fist'; V.hand[1] = 'fist';
    lean = 1 + 5.5 * sl.drive - 2 * sl.back + 0.8 * thud;
    twist = -0.12 * sl.back + 0.1 * sl.drive + 0.03 * sl.shake;
    V.elb[0] = 0.25; V.elb[1] = 0.35;
    if (V.wpnOn) { wa = 0.5; len = 0.55; top = 1; }
    V.s = P.s * (1 + 0.03 * sl.back - 0.03 * thud);
  } else if (d.kind === 'gun') {
    // a long gun: butt first (turned round, the muzzle up over the shoulder), then on him as he sinks
    const fore = (d.fore ?? d.grip + 6) - d.grip;
    if (what === 'butt') {
      const strike = td.done ? 1 : u < 0.6 ? 0 : in2((u - 0.6) / 0.4), back = td.done ? 0 : smooth(Math.min(1, u / 0.5)) * (1 - strike);
      const k = 0.75, x = lerp(lerp(3.5, 0, back), N - d.grip * k, strike);
      hr = from(V.hr, x, 1.6, td.i === 0 ? smooth(Math.min(1, td.age / 0.15)) : 1);
      hl = [hr[0] - fore * k, hr[1] - 1.2];
      wa = Math.PI; len = k; top = 2;
      lean = lerp(-1.2 * back, 2, strike) + 0.5 * thud;
      twist = -0.2 * back;
    } else {
      // turned back round onto him, the muzzle down at his back (it shows shorter), fired
      const k = td.done ? 1 : smooth(u / 0.45), x = 3.6 - 2 * kick;
      hr = [x, 3];
      len = lerp(0.55, clamp((D - 1 - x) / ahead(d), 0.3, 1), k) - 0.12 * kick;
      wa = lerpA(Math.PI, 0.05, k) - 0.2 * kick;
      hl = [x + fore * Math.cos(wa) * len, 3 + fore * Math.sin(wa) * len - 0.8];
      lean = 1 * k - 2 * kick;
      top = k < 0.5 ? 2 : 1;
    }
    V.elb[0] = 0.3; V.elb[1] = 0.6;
  } else {
    // a club in both hands: raised over the right shoulder (pointing back, up at the eye), brought down on his nape
    const up = what === 'windup' ? (td.done ? 0 : smooth(u)) : td.done ? 0 : 1 - in2(u);
    const x = lerp(N - 0.75 * ahead(d) * 0.45, -1, up);
    hr = from(V.hr, x, lerp(1.2, 3.4, up), what === 'windup' ? smooth(u * 1.4) : 1);
    hl = [hr[0] - 1.5, lerp(-1.2, 1, up)];
    len = lerp(0.45, -0.75, up); wa = -0.65 * up;
    lean = lerp(3, -1.5, up) + 0.8 * thud;
    top = 2; // over the shoulder, then out over his back
    V.s = P.s * (1 + 0.03 * up - 0.03 * thud);
  }
  V.ta = a + twist;
  V.tx = P.tx + c * lean; V.ty = P.ty + s * lean;
  const put = (h, q, i) => { h.x = q[0] * c - q[1] * s; h.y = q[0] * s + q[1] * c; reachOut(h, V, i); };
  if (hl) put(V.hl, hl, -1);
  if (hr) put(V.hr, hr, 1);
  if (V.wpnOn) { V.wpn.x = V.hr.x; V.wpn.y = V.hr.y; V.wpn.a = a + wa; V.wpnLen = len; }
  V.top = top;
  V.carryImg = null;
  blendPose(P, V, m);
  P.flat = m > 0.5 ? V.flat : null;
  P.flatA = V.flatA;
  return P;
}

// The man being taken (Enemy.held, the player's takedown), in his own frame (x his facing). Seized, he is pulled back
// onto the one behind him, his hands at what holds him (at the arm or the cue across his throat, at the hand over
// his mouth; a collar grabbed: hands thrown up), shaking through a struggle; a twist wrenches his head round; a blow
// on the nape throws his head and shoulders forward; one that does not kill drops him onto his knees (the shins
// under him, slumped forward, arms hanging).
export function heldPose(ch, P) {
  const td = ch.held.takedown, f = td.f, a = P.ta, c = Math.cos(a), s = Math.sin(a), t = ch.world.time;
  if (f.grip === 'hair') return hairHeld(ch, P, td, a, c, s, t);
  const [wait, what] = f.beats[td.i], u = td.done ? 1 : clamp(td.t / wait, 0, 1);
  const seizeAt = f.beats.findIndex((b) => b[1] === 'seize');
  const grab = !f.grip || td.i < seizeAt ? 0 : td.i === seizeAt && !td.done ? smooth(u) : 1;
  const landed = td.done ? what : td.i > 0 ? f.beats[td.i - 1][1] : null;
  const struck = STRUCK.has(landed) ? Math.exp(-td.hit * 10) : 0;
  const limp = what === 'limp' ? smooth(u) : 0; // choked out: his hands fall from the arm that holds him
  const shake = what === 'struggle' && !td.done ? Math.sin(t * 41 + ch.breath) * Math.sin(Math.PI * u) : 0;
  const down = td.downAt >= 0 ? smooth((td.age - td.downAt) / 0.2) : 0;
  const twist = what === 'twist' ? (td.done ? 1 : in2(u)) : 0;
  const j = Math.sin(t * 37 + ch.breath) * 0.7 * grab;
  let hands = null, pull = 0;
  if (f.grip === 'neck' || f.grip === 'cue') { hands = [4.6 + j, -2.4, 4.6 - j, 2.4]; pull = 1.3; }
  else if (f.grip === 'mouth') { hands = [5.2 + j, -1.8, 4.4, 2.8 - j]; pull = 1.5; }
  else if (f.grip === 'collar') { hands = [2.5 + j * 0.3, -8, 2.5 - j * 0.3, 8]; pull = 0.6; }
  const put = (h, lx, ly, k) => { h.x = lerp(h.x, P.tx + (lx * c - ly * s) * P.s, k); h.y = lerp(h.y, P.ty + (lx * s + ly * c) * P.s, k); };
  // his torso: pulled back, thrown forward by a blow, slumped on his knees
  const fwd = -pull * grab + 2.2 * struck * (f.front ? -1 : 1) + 2 * down + 0.4 * shake;
  P.tx += c * fwd; P.ty += s * fwd;
  P.s *= 1 - 0.14 * down - 0.05 * limp;
  P.ta = a + 0.12 * shake;
  P.ha = a + td.side * 1.1 * twist + 0.15 * shake;
  if (hands) {
    put(P.hl, lerp(hands[0], 2.5, limp), lerp(hands[1], -6, limp), grab);
    if (!P.wpnOn) put(P.hr, lerp(hands[2], 2.5, limp), lerp(hands[3], 6, limp), grab);
    P.hand[0] = P.hand[1] = f.grip === 'collar' ? 'flat' : 'loose';
  }
  if (down > 0) {
    // on his knees, the arms gone slack by his sides
    put(P.hl, 2.5, -5.5, down);
    if (!P.wpnOn) put(P.hr, 2.5, 5.5, down);
    P.hand[0] = P.hand[1] = 'loose';
    YIELD_FEET.forEach(([lx, ly], i) => {
      const ft = P.feet[i];
      ft.x = lerp(ft.x, lx * c - ly * s, down); ft.y = lerp(ft.y, lx * s + ly * c, down);
      ft.a = lerpA(ft.a, a + Math.PI, down); ft.lift *= 1 - down; ft.heel *= 1 - down;
    });
    P.legs = Math.max(P.legs, down);
  }
  P.top = 0;
  return P;
}

const STRUCK = new Set(['nape', 'butt', 'stab', 'kneeHit', 'kneeShot', 'backShot', 'headbutt', 'throat']); // the beats that throw a held man forward (back: face to face)
