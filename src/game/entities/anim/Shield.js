// The human shield (Player.shield, SHIELD.pose in data/feel.js): the holder's pose, the hostage's, and the two
// painted as one pair.
import { BODY_SCALE } from '../../Config.js';
import { SHIELD } from '../../data/feel.js';
import { slamAt } from '../../systems/Takedown.js';
import { lerp, clamp, smooth, lerpA } from '../../../engine/math.js';
import { easeOut, SIDE, sideReach, PAIR, SH, YIELD_FEET, PART } from './Rig.js';
import { shoulder, bodyFrame, paintPose } from '../CharacterAnim.js';
import { slamHead } from './Takedown.js';

// ---------------- the human shield (Player.shield, SHIELD.pose) ----------------
// What the two poses share, so that the arm stays on the neck it is round: m (hauled in, 0 .. 1), limp (dead in the
// arms, 0 .. 1), j (his struggle, px), back / side (px his drawn torso is off his centre, along the aim and to its
// right: pulled onto the chest and aside, snatched back at the grab, thrown by a round), take / wr (the click's
// kill: the hold taken up, then the wrench or the slice itself, each 0 .. 1), kind (that kill's, or null)
const HOLD = { m: 0, limp: 0, j: 0, back: 0, side: 0, take: 0, wr: 0, kind: null };
const WRENCH_AT = 0.45; // share of the kill's motion that takes the hold up before the wrench
function holdAt(sh, t) {
  const S = SHIELD.pose, H = HOLD, b = sh.target.breath || 0, k = sh.kill;
  H.m = smooth(sh.t / SHIELD.set);
  H.limp = sh.dead ? smooth((t - sh.dead.t) / S.limp.in) : 0;
  H.j = Math.sin(t * S.shake[0] + b) * S.shake[1] * (1 - H.limp) * (0.3 + 0.7 * smooth(Math.sin(t * 1.7 + b) * 2));
  const u = sh.t / S.jerk[0], jerk = u < 1 ? Math.sin(Math.PI * Math.sqrt(u)) : 0;
  const hit = Math.exp(-Math.max(0, t - sh.hit) * 9), q = k ? clamp(k.t / k.K.at, 0, 1) : 0;
  H.kind = k ? k.kind : null;
  H.take = smooth(q / WRENCH_AT);
  H.wr = easeOut((q - WRENCH_AT) / (1 - WRENCH_AT)); // all at once
  H.back = -(S.pull * H.m + S.jerk[1] * jerk + 1.6 * hit * H.m + 0.7 * H.take) + 0.4 * H.j;
  H.side = S.aside * H.m * (1 - 0.6 * H.limp);
  return H;
}

// The man who holds another in front of him as a shield, over his standing pose: bladed behind him, a shoulder in
// his back, that arm round his throat (the elbow under the chin, the hand back on the far shoulder: P.elbow); a
// gun's hand out past his other shoulder (the muzzle goes with it: Character.noteMuzzle); a blade at the side of his
// neck; an empty hand behind his head. The click's kill (sh.kill): the arm tightened then torn aside, or the blade
// taken across his throat and drawn back.
export function shieldPose(ch, P) {
  const sh = ch.shield, tg = sh.target, S = SHIELD.pose, d = ch.def, a = ch.angle, c = Math.cos(a), s = Math.sin(a);
  const H = holdAt(sh, ch.world.time), m = H.m, neck = H.kind === 'neck', cut = H.kind === 'throat';
  // his centre in the aim's frame (pose px), and his neck there
  const wx = (tg.x - ch.x) / BODY_SCALE, wy = (tg.y - ch.y) / BODY_SCALE, gx = wx * c + wy * s, gy = -wx * s + wy * c;
  const nx = gx + H.back, ny = gy + H.side;
  const along = (h) => h.x * c + h.y * s, across = (h) => -h.x * s + h.y * c;
  const set = (h, x, y) => { h.x = x * c - y * s; h.y = x * s + y * c; };
  // the choking arm goes round the front of his neck, not through it; the elbow from where the arm had it
  const wr = neck ? H.wr : 0, e1x = nx + S.elbow[0] - 0.9 * wr, e1y = ny + S.elbow[1] - S.wrench[1] * wr;
  const h0x = along(P.hl), h0y = across(P.hl), h1x = nx + S.hand[0] - 0.5 * wr, h1y = ny + S.hand[1] - 0.8 * wr, n = 1 - m;
  set(P.hl, n * n * h0x + 2 * n * m * (nx + 7.5) + m * m * h1x, n * n * h0y + 2 * n * m * (ny - 4.5) + m * m * h1y);
  shoulder(SH, P, -1);
  set(P.elbow[0], lerp((along(SH) + h0x) / 2, e1x, m), lerp((across(SH) + h0y) / 2 - 2, e1y, m));
  P.elbOn[0] = true;
  P.armK[0] = lerp(1, S.girth, m);
  P.hand[0] = 'fist';
  P.flat = null;
  if (P.wpnOn && d.kind === 'gun') {
    // (from where the gun is held out, so that its kick stays in the hand)
    const rest = d.hold === 'side' ? [sideReach(d), SIDE.aim[1]] : PAIR.aim;
    const dx = (gx + S.gun[0] - rest[0]) * m, dy = (gy + S.gun[1] - rest[1]) * m;
    for (const h of [P.hr, P.wpn]) { h.x += dx * c - dy * s; h.y += dx * s + dy * c; }
  } else if (P.wpnOn) {
    const k = cut ? H.take : 0, w2 = cut ? H.wr : 0;
    const bx = lerp(lerp(S.blade[0], S.slice[0][0], k), S.slice[1][0], w2), by = lerp(lerp(S.blade[1], S.slice[0][1], k), S.slice[1][1], w2);
    set(P.hr, lerp(along(P.hr), nx + bx, m), lerp(across(P.hr), ny + by, m));
    P.wpn.x = P.hr.x; P.wpn.y = P.hr.y; P.wpn.a = lerpA(P.wpn.a, a + S.blade[2] + 0.5 * k, m);
    P.wpnLen = lerp(P.wpnLen, 0.85, m);
    P.elb[1] = 0.8;
    P.top = 1;
  } else {
    // behind his head, the elbow out; the wrench: it shoves his head round as the other arm tears it back
    set(P.hr, lerp(along(P.hr), nx + S.nape.at[0] + 1.2 * wr, m), lerp(across(P.hr), ny + S.nape.at[1] - 1.6 * wr, m));
    shoulder(SH, P, 1);
    set(P.elbow[1], lerp(along(SH), nx + S.nape.elbow[0], m), lerp(across(SH) + 3, ny + S.nape.elbow[1] - 1.5 * wr, m));
    P.elbOn[1] = true;
    P.hand[1] = 'flat'; P.flat = 'hr'; P.flatA = a - 1.9;
  }
  P.ta = a + (S.twist + 0.12 * H.take + 0.4 * wr) * m;
  P.tx += (S.lean[0] * c - S.lean[1] * s) * m; P.ty += (S.lean[0] * s + S.lean[1] * c) * m;
  return P;
}

// The man held as a shield (Enemy.held, Player.shield), in his own frame: pulled back onto the chest behind him and
// a little aside, his head thrown back off the arm round his throat, his shoulders drawn in, his hands clawing at
// the forearm in fits (it never frees him), thrown back by every round he takes. His neck broken: his head turned
// right round, his hands flown open. Dead in the arms: sunk, his head lolling, his arms hanging, his feet trailing
// after him (sh.drag, systems/Shield.js dragFeet).
export function hostagePose(ch, P) {
  const sh = ch.held.shield, S = SHIELD.pose, L = S.limp, a = P.ta, c = Math.cos(a), s = Math.sin(a);
  const H = holdAt(sh, ch.world.time), m = H.m, limp = H.limp, live = 1 - limp, j = H.j, wr = H.kind === 'neck' ? H.wr : 0;
  P.tx += c * H.back - s * H.side; P.ty += s * H.back + c * H.side;
  P.s *= 1 - L.sink * limp;
  P.ta = a + 0.12 * j + 0.1 * H.take - 0.5 * wr;
  P.hunch = Math.max(P.hunch, S.hunch * m * live);
  P.bow = lerp(-(S.chin + 0.15 * H.take) * m, L.head[0], limp);
  P.ha = a + lerp((S.head[2] + 0.3 * j) * m + S.wrench[0] * wr, L.head[1], limp);
  const ox = (S.head[0] - 0.8 * H.take) * m * live, oy = (S.head[1] + S.wrench[2] * wr) * m * live;
  P.hox = ox * c - oy * s; P.hoy = ox * s + oy * c;
  const put = (h, at, to, dj) => {
    const lx = lerp(lerp(at[0] + dj, 5, wr), to[0], limp), ly = lerp(lerp(at[1], at[1] * 5, wr), to[1], limp);
    h.x = lerp(h.x, P.tx + (lx * c - ly * s) * P.s, m); h.y = lerp(h.y, P.ty + (lx * s + ly * c) * P.s, m);
  };
  put(P.hl, S.claw[0], L.hands[0], j);
  if (!P.wpnOn) put(P.hr, S.claw[1], L.hands[1], -j);
  else {
    // what he still has in his hand hangs by his thigh, of no use to him
    const hx = P.tx + (S.low[0] * c - S.low[1] * s) * P.s, hy = P.ty + (S.low[0] * s + S.low[1] * c) * P.s;
    P.hr.x = P.wpn.x = lerp(P.hr.x, hx, m); P.hr.y = P.wpn.y = lerp(P.hr.y, hy, m);
    P.wpn.a = lerpA(P.wpn.a, a + S.low[2], m);
    P.wpnLen = lerp(P.wpnLen, S.low[3], m);
  }
  P.hand[0] = P.hand[1] = wr > 0.3 ? 'flat' : 'loose';
  P.elb[0] = P.elb[1] = lerp(0.75, 0.3, limp);
  P.top = 0; // (his fingers show past the arm, from under it: the arm is what must be seen)
  if (limp > 0 && sh.drag) {
    for (let i = 0; i < 2; i++) {
      const f = P.feet[i], q = sh.drag[i], qx = q.x / BODY_SCALE, qy = q.y / BODY_SCALE;
      f.x = lerp(f.x, qx, limp); f.y = lerp(f.y, qy, limp);
      f.a = lerpA(f.a, Math.atan2(qy, qx) + (i ? 0.45 : -0.45), limp);
      f.lift *= live; f.heel *= live;
    }
  }
  return P;
}

// The arms that have just let a held man go (Player.shieldOut): the shove of a throw (the arm unwound from his neck,
// both hands thrown out along the aim, the shoulders swung through, then home), or simply opened after a kill.
export function shieldOutPose(ch, P) {
  const o = ch.shieldOut, S = SHIELD.pose, a = ch.angle, c = Math.cos(a), s = Math.sin(a), u = clamp(o.t / o.dur, 0, 1);
  const gx = SHIELD.gap / BODY_SCALE - S.pull, thrown = o.kind === 'throw';
  const push = thrown ? easeOut(u / 0.3) : 0, w = 1 - smooth(thrown ? (u - 0.4) / 0.6 : u);
  const mix = (h, from, to) => {
    const x = lerp(from[0], to[0], push), y = lerp(from[1], to[1], push);
    h.x = lerp(h.x, x * c - y * s, w); h.y = lerp(h.y, x * s + y * c, w);
  };
  mix(P.hl, [gx + S.hand[0], S.hand[1]], S.shove[0]);
  P.hand[0] = thrown && w > 0.5 ? 'flat' : P.hand[0];
  if (!P.wpnOn) {
    mix(P.hr, [gx + S.nape.at[0], S.nape.at[1]], S.shove[1]);
    if (thrown && w > 0.5) P.hand[1] = 'flat';
  }
  P.ta += lerp(S.twist, S.back, push) * w;
  return P;
}

// One picture of the two (Character.draw): the man held between the other's chest and his arms. From the floor up:
// their shadows, his legs, the holder's legs and body, his arms, hands and body, the holder's arms round him (and
// what is in his hands), the holder's head (behind his: its brim would hide him), then his head.
export function drawPair(ctx, ch, P, tg, T) {
  const layer = (who, pose, parts) => {
    ctx.save();
    bodyFrame(ctx, who);
    paintPose(ctx, who, pose, 1, parts);
    ctx.restore();
  };
  layer(ch, P, PART.shadow);
  layer(tg, T, PART.shadow);
  layer(tg, T, PART.legs);
  layer(ch, P, PART.legs | PART.body);
  layer(tg, T, PART.arms | PART.body);
  layer(ch, P, PART.arms | PART.top);
  layer(ch, P, PART.head);
  layer(tg, T, PART.head);
}

// His head driven into what is in front of him by a fist in his hair: yanked back (his head thrown back, the
// shoulders onto the man behind), then thrown at it bent over, his head on ahead of his shoulders and down (P.bow);
// his hands go out to brace on it and claw at the grip, flail through a struggle, and hang slacker with every blow;
// at a toilet he is forced onto his knees first.
export function hairHeld(ch, P, td, a, c, s, t) {
  const sl = slamAt(td), G = slamHead(td, sl), grab = td.i === 0 && !td.done ? smooth(td.t / td.f.beats[0][0]) : 1;
  const j = Math.sin(t * 37 + ch.breath) * (0.5 + 1.2 * sl.shake) * (1 - 0.5 * Math.min(1, sl.hits));
  const slack = Math.min(1, sl.hits / 2), put = (h, lx, ly, k) => { h.x = lerp(h.x, P.tx + (lx * c - ly * s) * P.s, k); h.y = lerp(h.y, P.ty + (lx * s + ly * c) * P.s, k); };
  P.tx += c * G.fwd; P.ty += s * G.fwd;
  P.s *= G.s;
  P.bow = G.bow;
  P.ta = a + 0.08 * sl.shake * Math.sin(t * 29);
  P.ha = a + 0.3 * sl.shake * Math.sin(t * 23 + ch.breath);
  // braced on it at the blow, up at the grip while yanked back, slack by his sides once beaten
  const bx = lerp(lerp(5.5, 9 + G.fwd, sl.drive), 2.5, slack * (1 - sl.drive * 0.5)), by = lerp(lerp(4, 7.5, sl.drive), 6.5, slack);
  put(P.hl, bx + j, -by + j * 0.6, grab);
  if (!P.wpnOn) put(P.hr, bx - j, by - j * 0.6, grab);
  P.hand[0] = P.hand[1] = sl.drive > 0.6 ? 'flat' : 'loose';
  P.elb[0] = P.elb[1] = 0.55;
  const k = G.kneel;
  if (k > 0) {
    YIELD_FEET.forEach(([lx, ly], i) => {
      const ft = P.feet[i];
      ft.x = lerp(ft.x, lx * c - ly * s, k); ft.y = lerp(ft.y, lx * s + ly * c, k);
      ft.a = lerpA(ft.a, a + Math.PI, k); ft.lift *= 1 - k; ft.heel *= 1 - k;
    });
    P.legs = Math.max(P.legs, k);
  }
  P.top = 0;
  return P;
}
