// Procedural character animation shared by the player and enemies.
// Each frame a character builds a pose: plain numbers (torso offset / angle / scale, feet, hands, weapon), all stored as
// offsets from the body centre in world orientation. Traversal poses (vault, slide) are blended over the standing pose
// so moves start and end exactly on the walk cycle (no popping). drawPose() then paints shadow, feet, arms, torso.
import { PALETTE, TAKEDOWN } from '../Config.js';
import { WEAPONS } from '../data/weapons.js';
import { sprite, spriteOpt, drawSprite, silhouette } from '../../engine/Assets.js';
import { lerp, clamp, angDiff } from '../../engine/math.js';

export const smooth = (t) => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
const easeOut = (t) => 1 - Math.pow(1 - clamp(t, 0, 1), 3);
// 0 -> 1 -> 0 over [a, b]
const bump = (k, a, b) => (k <= a || k >= b ? 0 : Math.sin((Math.PI * (k - a)) / (b - a)));
const lerpA = (a, b, t) => a + angDiff(a, b) * t;

const ARM = 11;           // a real arm's reach from the shoulder (px)
const SHOULDER = 6;       // shoulders at torso-local (0, ±6)
const FOOT = '#1a1214';
const LEG_STROKES = [[PALETTE.ink, 4.6], ['#3a3148', 3]];

const pt = () => ({ x: 0, y: 0, a: 0 });
export function newPose() {
  return {
    tx: 0, ty: 0, ta: 0, s: 1, lift: 0, legs: 0, // legs: visibility of the thighs (thrown-forward poses)
    feet: [pt(), pt()],
    hl: pt(), hr: pt(), wpn: pt(), carry: pt(), trail: { on: false, x: 0, y: 0, a0: 0, a1: 0, r: 0, alpha: 0 },
    wpnOn: false, carryImg: null,
    // weapon foreshortening (-1 pointing back .. 1), its swelling when it comes up toward the camera, and what is held
    // above the shoulders: 0 nothing, 1 the weapon and its hand, 2 both hands
    wpnLen: 1, wpnS: 1, top: 0,
  };
}

// rotate (lx, ly) by angle a, scale, add the torso offset: aim-space point -> pose (world-offset) point
function place(out, P, a, lx, ly) {
  const c = Math.cos(a) * P.s, s = Math.sin(a) * P.s;
  out.x = P.tx + lx * c - ly * s;
  out.y = P.ty + lx * s + ly * c;
}

// ---------------- standing / walking / combat gestures ----------------
// a: facing angle (the aim, or a scripted one while getting up)
export function standPose(ch, P, a = ch.angle) {
  const d = ch.def;
  const g = Math.min(1, ch.gait);
  const stride = Math.sin(ch.walk);
  const swingP = ch.swing > 0 ? 1 - ch.swing / ch.swingDur : 1;
  const rk = ch.recoil * ch.recoil; // snappy kick, eased recovery
  const kick = d.kick ?? 0;
  let twist = 0, back = 0, dip = 0, len = 1, thick = 1, top = 0;

  // aim-space hands / weapon (x forward, y right)
  let hlx, hly, hrx, hry, wx = 0, wy = 0, wa = 0, wpnOn = false;
  let carryImg = null, cx = 0, cy = 0, ca = 0;
  P.trail.on = false;

  if (d.hold === 'none') {
    // relaxed guard, arms swinging against the stride
    const sw = stride * 2.6 * g;
    hlx = 6 - sw; hly = -6; hrx = 6 + sw; hry = 6;
    if (ch.yielded) {
      // given up: open hands held up either side of the head, shaking
      const sh = Math.sin(ch.world.time * 30) * 0.6;
      hlx = 3 + sh; hly = -9.5; hrx = 3 - sh; hry = 9.5;
    } else if (ch.throwT > 0) {
      // follow-through of a throw: the arm whips back from full extension
      const e = smooth(1 - ch.throwT / ch.throwDur);
      hrx = lerp(15, hrx, e); hry = lerp(1.5, hry, e);
      twist = -0.35 * (1 - e);
    } else if (ch.swing > 0) {
      // punch: small pull-back, snap out, ease home
      const p = swingP;
      const ext = p < 0.15 ? -0.25 * smooth(p / 0.15)
        : p < 0.4 ? lerp(-0.25, 1, easeOut((p - 0.15) / 0.25)) : lerp(1, 0, smooth((p - 0.4) / 0.6));
      if (ch.punchSide < 0) { hlx += ext * 10; hly += Math.max(0, ext) * 4; }
      else { hrx += ext * 10; hry -= Math.max(0, ext) * 4; }
      twist = -ch.punchSide * 0.2 * ext;
    }
  } else if (d.hold === 'one' || d.hold === 'two') {
    const kp = 1.6 + kick * 0.45;
    wpnOn = true;
    wa = -rk * (0.05 + kick * 0.02); // muzzle climb
    back = rk * kick * 0.12;
    if (d.hold === 'one') {
      hrx = 10 - kp * rk; hry = 1.5;
      wx = hrx; wy = 1;
      hlx = hrx - 1; hly = -0.5;
    } else {
      hrx = 5 - kp * rk; hry = 3;
      wx = hrx; wy = 2;
      const hw = sprite(d.sprite).width * 0.5;
      hlx = wx + Math.cos(wa) * hw; hly = wy - 1 + Math.sin(wa) * hw;
    }
    if (ch.reloading > 0) {
      const p = 1 - ch.reloading / ch.reloadDur;
      const bx = -1, by = -8; // belt
      if (d.shellReload) {
        // off hand shuttles shells from the belt to the loading port
        const k = Math.sin(Math.PI * p);
        hlx = lerp(bx, wx + 6, k); hly = lerp(by, wy + 3, k);
        wa -= 0.35;
        carryImg = sprite('weapons/shell'); cx = hlx; cy = hly; ca = 0;
      } else {
        // tilt the gun in, fetch a fresh mag from the belt, slam it in, rack
        const tilt = smooth(p < 0.12 ? p / 0.12 : p > 0.85 ? (1 - p) / 0.15 : 1);
        wa -= 0.55 * tilt;
        wx -= 1.5 * tilt;
        const wellX = wx + 2, wellY = wy + 3;
        if (p < 0.15) { const e = smooth(p / 0.15); hlx = lerp(hlx, bx, e); hly = lerp(hly, by, e); }
        else if (p < 0.4) { hlx = bx; hly = by; }
        else if (p < 0.7) { const e = easeOut((p - 0.4) / 0.3); hlx = lerp(bx, wellX, e); hly = lerp(by, wellY, e); }
        else { hlx = wellX; hly = wellY; }
        if (p > 0.25 && p < 0.72 && d.magSprite) { carryImg = spriteOpt(d.magSprite); cx = hlx; cy = hly; ca = Math.PI / 2; }
        if (p > 0.86) wx -= Math.sin(((p - 0.86) / 0.14) * Math.PI) * 3;
      }
      hrx = wx;
    }
  } else {
    // melee weapon. At rest a bat lies on the shoulder and a knife is held low, point forward. A blow is one of three
    // gestures (ch.strike): forehand sweep, backhand sweep, or the heavy one (overhead smash / straight stab), all on
    // the same clock: anticipation, fast stroke (in front when the hit lands), follow-through, recovery.
    const bat = d === WEAPONS.bat;
    const ra = bat ? 3 : 0.35; // weapon angle at rest
    const sw = stride * 2.2 * g;
    hlx = 6 - sw; hly = -6;
    hrx = bat ? 5 : 7 + sw * 0.5; hry = bat ? 4 : 6.5;
    wa = ra;
    if (ch.swing > 0) {
      const p = swingP, k = ch.strike;
      const out = smooth(p / 0.12) * (1 - smooth((p - 0.55) / 0.45)); // 0 in the rest pose .. 1 during the stroke
      let sx, sy; // where the stroke puts the hand
      if (k < 2) {
        // sweep across the front (a backhand is its mirror image). The angle runs from the rest pose to the rest
        // pose: the bat carries on round the back of the head, the knife comes back the way it went
        const dir = k ? -1 : 1;
        const from = bat && k ? Math.PI * 2 - ra : dir * ra, home = bat ? (k ? -ra : ra - Math.PI * 2) : dir * ra;
        const wind = bat ? 2.5 : 1.3, end = bat ? -1.9 : -1.3, over = end - 0.22;
        wa = dir * (p < 0.12 ? lerp(from, wind, smooth(p / 0.12))
          : p < 0.4 ? lerp(wind, end, easeOut((p - 0.12) / 0.28))
            : p < 0.55 ? lerp(end, over, smooth((p - 0.4) / 0.15)) : lerp(over, home, smooth((p - 0.55) / 0.45)));
        const r = 7 + 2 * bump(p, 0.08, 0.6), cw = Math.cos(wa);
        sx = 3 + cw * r * (bat && cw < 0 ? 0.5 : 1); sy = (bat ? 1 : 2) + Math.sin(wa) * r; // a bat stays close behind
        twist = -dir * (bat ? 0.4 : 0.25) * smooth((p - 0.1) / 0.3) * (1 - smooth((p - 0.5) / 0.5)); // shoulders follow
        if (p > 0.12 && p < 0.55) {
          const tr = P.trail;
          tr.on = true;
          tr.alpha = 0.35 * (1 - smooth((p - 0.35) / 0.2));
          tr.r = d.range * 0.85;
          if (dir > 0) { tr.a0 = wa; tr.a1 = Math.min(wind, wa + 1.7); } else { tr.a0 = Math.max(-wind, wa - 1.7); tr.a1 = wa; }
        }
      } else if (bat) {
        // overhead smash: up over the head (the bat shortens as it points at the camera), straight down in front,
        // then back to the shoulder round the right side
        const u = easeOut((p - 0.1) / 0.2);
        if (p < 0.3) { wa = lerp(ra, Math.PI, smooth(p / 0.1)); len = Math.cos(Math.PI * u); thick = 1 + 0.35 * Math.sin(Math.PI * u); }
        else wa = ra * smooth((p - 0.55) / 0.45);
        sx = lerp(1.5, 10, u); sy = 1.5;
        back = -2.5 * bump(p, 0.12, 0.7);
        dip = 0.05 * bump(p, 0.2, 0.7) - 0.05 * bump(p, 0, 0.2); // up on the toes, then bent over the blow
        if (p < 0.3 && len > -0.5) top = 2;
      } else {
        // straight stab: the elbow comes back, the point goes in with the shoulder behind it
        const go = easeOut((p - 0.12) / 0.16);
        wa = ra * (1 - out);
        sx = lerp(2, 13, go); sy = lerp(5.5, 1.5, go);
        twist = 0.25 * bump(p, 0, 0.14) - 0.35 * smooth((p - 0.12) / 0.16) * (1 - smooth((p - 0.5) / 0.5));
        back = -2 * bump(p, 0.12, 0.7);
      }
      hrx = lerp(hrx, sx, out); hry = lerp(hry, sy, out);
      // a bat is swung with both hands (the other one under the leading one), a knife arm is balanced by the other
      if (bat) { hlx = lerp(hlx, sx - Math.cos(wa) * 2.5 * len, out); hly = lerp(hly, sy - Math.sin(wa) * 2.5 * len, out); }
      else hlx -= (k < 2 ? 2.5 : 4) * out;
    }
    wx = hrx; wy = hry; wpnOn = true;
    if (bat && !top && Math.cos(wa) * len < -0.3) top = 1; // behind the head: over the shoulder
  }
  if (wpnOn && ch.pickAnim > 0) {
    // flashy pickup: the weapon twirls into the hand, a little dip to grab it
    const k = ch.pickAnim / 0.35;
    wa += k * k * Math.PI * 2;
    wx -= k * 3;
    dip = 0.05 * Math.sin(Math.PI * k);
  }

  if (ch.grab) {
    // takedown from behind (Player.updateTakedown), on its own clock k: the arms close round the neck of the man
    // standing D px ahead, hold him, then wrench his head to one side. With a knife the left hand holds the head and
    // the blade is drawn across the throat; a gun or a bat stays in the right hand and the left arm does it alone.
    const G = ch.grab, D = G.d, s = G.side;
    const on = smooth(G.k / 0.3) * (1 - smooth((G.k - 0.72) / 0.28));
    const wr = smooth((G.k - 0.42) / (TAKEDOWN.killAt - 0.42));
    const ha = s * 1.2 * wr, c = Math.cos(ha), sn = Math.sin(ha);
    const round = (lx, ly) => [D + lx * c - ly * sn, lx * sn + ly * c]; // a point of his head, turning with it
    let l, r = null;
    if (d.hold === 'none') { l = round(-1.5, -4); r = round(-1.5, 4); }
    else if (G.blade) { l = [D - 1 - 1.5 * wr, -3.5]; r = [D + 3 - 2 * wr, 4 + 3 * wr]; wa = lerp(wa, -1.85 + 0.75 * wr, on); }
    else l = round(2.5, 1);
    hlx = lerp(hlx, l[0], on); hly = lerp(hly, l[1], on);
    if (r) {
      hrx = lerp(hrx, r[0], on); hry = lerp(hry, r[1], on);
      if (wpnOn) { wx = hrx; wy = hry; }
    } else { hrx -= 3 * on; wx -= 3 * on; }
    twist += s * 0.3 * wr * on;
    back -= 2.5 * on;
  }
  if (ch.held) {
    // seized from behind: pulled back onto his heels, the free hand clawing at the arm round his neck
    const j = Math.sin(ch.world.time * 38 + ch.breath) * 0.8;
    hlx = 4.5 + j; hly = -3;
    if (wpnOn) wa += 0.5;
    else { hrx = 4.5 - j; hry = 3; }
    back += 1.5;
  }

  // torso: shoulders counter-rotate with the stride, lean into acceleration, bob, idle breathing, recoil push
  const sway = stride * 0.07 * g;
  P.ta = a + sway + twist;
  P.tx = ch.lean.x - Math.cos(a) * back;
  P.ty = ch.lean.y - Math.sin(a) * back;
  P.s = 1 + 0.014 * g * Math.abs(Math.cos(ch.walk)) + 0.012 * (1 - g) * Math.sin(ch.world.time * 2.3 + ch.breath) - dip;
  P.lift = 0;
  P.legs = 0;

  // feet along the smoothed travel direction; the stride fades in and out with the gait
  const fa = ch.footA, amp = 5 * g;
  for (let i = 0; i < 2; i++) {
    const side = i ? 1 : -1, f = P.feet[i];
    const lx = stride * side * amp + 1, ly = side * 3.6;
    f.x = lx * Math.cos(fa) - ly * Math.sin(fa);
    f.y = lx * Math.sin(fa) + ly * Math.cos(fa);
    f.a = fa;
  }
  place(P.hl, P, a, hlx, hly);
  place(P.hr, P, a, hrx, hry);
  P.wpnOn = wpnOn;
  P.wpnLen = len; P.wpnS = thick; P.top = top;
  if (wpnOn) { place(P.wpn, P, a, wx, wy); P.wpn.a = a + wa; }
  P.carryImg = carryImg;
  if (carryImg) { place(P.carry, P, a, cx, cy); P.carry.a = a + ca; }
  if (P.trail.on) {
    const tr = P.trail;
    place(tr, P, a, 3, 2);
    tr.a0 += a; tr.a1 += a;
    tr.r *= P.s;
  }
  return P;
}

// A = lerp(A, B, w), in place
function blendPose(A, B, w) {
  if (w <= 0) return A;
  A.tx = lerp(A.tx, B.tx, w); A.ty = lerp(A.ty, B.ty, w);
  A.ta = lerpA(A.ta, B.ta, w);
  A.s = lerp(A.s, B.s, w);
  A.lift = lerp(A.lift, B.lift, w);
  A.legs = lerp(A.legs, B.legs, w);
  A.wpnLen = lerp(A.wpnLen, B.wpnLen, w); A.wpnS = lerp(A.wpnS, B.wpnS, w);
  if (w > 0.5) A.top = B.top;
  for (let i = 0; i < 2; i++) {
    const f = A.feet[i], g = B.feet[i];
    f.x = lerp(f.x, g.x, w); f.y = lerp(f.y, g.y, w); f.a = lerpA(f.a, g.a, w);
  }
  for (const k of ['hl', 'hr', 'wpn', 'carry']) {
    const p = A[k], q = B[k];
    p.x = lerp(p.x, q.x, w); p.y = lerp(p.y, q.y, w); p.a = lerpA(p.a, q.a, w);
  }
  if (w > 0.5) A.trail.on = false;
  return A;
}

function copyPose(A, B) {
  A.tx = B.tx; A.ty = B.ty; A.ta = B.ta; A.s = B.s; A.lift = B.lift; A.legs = B.legs;
  for (let i = 0; i < 2; i++) Object.assign(A.feet[i], B.feet[i]);
  for (const k of ['hl', 'hr', 'wpn', 'carry']) Object.assign(A[k], B[k]);
  A.wpnOn = B.wpnOn; A.carryImg = B.carryImg;
  A.wpnLen = B.wpnLen; A.wpnS = B.wpnS; A.top = B.top;
  A.trail.on = false;
}

// Catmull-Rom through keys (times ascending, same length as vals)
function track(times, vals, k) {
  const n = times.length;
  let i = 0;
  while (i < n - 2 && k > times[i + 1]) i++;
  const u = clamp((k - times[i]) / (times[i + 1] - times[i]), 0, 1);
  const p0 = vals[Math.max(0, i - 1)], p1 = vals[i], p2 = vals[i + 1], p3 = vals[Math.min(n - 1, i + 2)];
  return 0.5 * (2 * p1 + (p2 - p0) * u + (2 * p0 - 5 * p1 + 4 * p2 - p3) * u * u + (3 * p1 - p0 - 3 * p2 + p3) * u * u * u);
}

// feet key frames in move space (x forward). y = foot side * ys + leg swing side * yl
const LEGS = {
  // over a sill: crouch, legs tucked and swung to one side, reaching for the floor, landing stance
  window: { t: [0, 0.18, 0.45, 0.72, 1], x: [1, -1, -4, 5, 1], ys: [3.6, 3.2, 2.2, 3, 3.6], yl: [0, 0, 5.5, 1.5, 0] },
  // hip slide on a hood / table: legs thrown forward together and swung round
  prop: { t: [0, 0.15, 0.4, 0.7, 1], x: [1, 2, 9, 8, 1], ys: [3.6, 3, 2.4, 2.4, 3.6], yl: [0, 0, 4, 3, 0] },
};

function legsPose(P, keys, k, dir, legSide) {
  const x = track(keys.t, keys.x, k), ys = track(keys.t, keys.ys, k), yl = legSide * track(keys.t, keys.yl, k);
  const c = Math.cos(dir), s = Math.sin(dir);
  for (let i = 0; i < 2; i++) {
    const ly = (i ? 1 : -1) * ys + yl, f = P.feet[i];
    f.x = x * c - ly * s; f.y = x * s + ly * c; f.a = dir;
  }
}

// shoulder (side -1 left, 1 right) of pose P, in pose space
function shoulder(out, P, side) {
  out.x = P.tx - Math.sin(P.ta) * SHOULDER * side * P.s;
  out.y = P.ty + Math.cos(P.ta) * SHOULDER * side * P.s;
  return out;
}
const SH = { x: 0, y: 0 };

// keep a hand within arm's reach of its shoulder
function reach(h, P, side) {
  shoulder(SH, P, side);
  const dx = h.x - SH.x, dy = h.y - SH.y, len = Math.hypot(dx, dy), max = ARM * P.s;
  if (len > max) { h.x = SH.x + (dx / len) * max; h.y = SH.y + (dy / len) * max; }
}

// ---------------- vault ----------------
// window: anticipation crouch, hands planted on the sill, body hoisted through with tucked legs, squash on landing.
// prop: action-movie hip slide over the top, the gun arm stays on target, one palm skidding on the surface.
export function vaultPose(ch, P, V) {
  const v = ch.vaulting;
  const k = clamp(v.t / v.dur, 0, 1);
  const win = v.kind === 'window';
  const dir = v.dir, c = Math.cos(dir), s = Math.sin(dir);
  copyPose(V, P);

  // body height: a hop over a sill, a plateau on top of a hood
  const h = win ? bump(k, 0.1, 0.8) : smooth((k - 0.08) / 0.25) * (1 - smooth((k - 0.66) / 0.24));
  const armed = ch.def.hold === 'one' || ch.def.hold === 'two';
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
  legsPose(V, win ? LEGS.window : LEGS.prop, k, dir, v.legSide);

  if (win) {
    // both palms on the sill until the body has passed them, the gun hand keeps its weapon flat along the move
    const hw = smooth(k / 0.16) * (1 - smooth((k - 0.55) / 0.25));
    const bx = ch.x, by = ch.y;
    for (let i = 0; i < 2; i++) {
      const hp = v.hands[i], hand = i ? V.hr : V.hl;
      const px = hp.x - bx, py = hp.y - by;
      hand.x = lerp(hand.x, px, hw); hand.y = lerp(hand.y, py, hw);
      reach(hand, V, i ? 1 : -1);
    }
    if (V.wpnOn) { V.wpn.x = V.hr.x; V.wpn.y = V.hr.y; V.wpn.a = lerpA(P.wpn.a, dir + 0.15, hw); }
    V.carryImg = null;
  } else if (ch.def.hold !== 'two') {
    // free hand skims the surface beside the hip
    const hw = smooth(k / 0.15) * (1 - smooth((k - 0.68) / 0.22));
    shoulder(SH, V, -1);
    const ox = -Math.sin(V.ta), oy = Math.cos(V.ta);
    const px = SH.x - ox * 5 * V.s - c * 2, py = SH.y - oy * 5 * V.s - s * 2;
    V.hl.x = lerp(V.hl.x, px, hw); V.hl.y = lerp(V.hl.y, py, hw);
    V.carryImg = null;
  }

  // blend in from / out to the walk, then crouch before the take-off and squash on landing on top
  const w = smooth(k / 0.14) * (1 - smooth((k - 0.82) / 0.18));
  blendPose(P, V, w);
  const land = win ? 0.78 : 0.82;
  P.s *= 1 - 0.05 * bump(k, 0, 0.18) - 0.07 * bump(k, land - 0.02, 1);
  P.lift = V.lift * w;
  return P;
}

// ---------------- slide ----------------
// low knee / hip slide: legs thrown forward, torso leaning back but still facing the aim, trailing palm on the floor
export function slidePose(ch, P, V) {
  const sl = ch.slideAnim;
  const w = smooth(sl.w);
  if (w <= 0) return P;
  copyPose(V, P);
  const dir = sl.dir, c = Math.cos(dir), s = Math.sin(dir), side = sl.side;
  // side-on: the free shoulder drops back toward the palm, the gun shoulder leads, the arms still hold the aim
  V.ta = ch.angle - 0.9;
  V.tx = P.tx * 0.3 - c * 3.5; V.ty = P.ty * 0.3 - s * 3.5;
  V.s = 0.88;
  V.legs = 1;
  V.top = 0;
  // lead leg straight out (opposite the palm), the other bent under, a slight tremor of the floor
  const shake = Math.sin(ch.world.time * 70) * 0.35 * (1 - sl.k);
  for (let i = 0; i < 2; i++) {
    const lead = (i ? 1 : -1) === -side;
    const lx = lead ? 13 : 6, ly = (lead ? -side * 1.5 : side * 4.5) + shake;
    const f = V.feet[i];
    f.x = V.tx + lx * c - ly * s; f.y = V.ty + lx * s + ly * c; f.a = dir;
  }
  if (ch.def.hold !== 'two') {
    // trailing hand skimming the floor behind, beside the hip
    const px = V.tx - c * 5 - s * side * 9, py = V.ty - s * 5 + c * side * 9;
    V.hl.x = px; V.hl.y = py;
    reach(V.hl, V, -1);
    V.carryImg = null;
  }
  blendPose(P, V, w);
  return P;
}

// ---------------- rendering ----------------
const LH = { x: 0, y: 0 }, RH = { x: 0, y: 0 }, TMP = { x: 0, y: 0 };

// the weapon at torso-local point `at`; over the shoulders it casts a little shadow on them
function drawWeapon(ctx, P, d, ta, at, shadow) {
  const img = sprite(d.sprite);
  const len = Math.sign(P.wpnLen || 1) * Math.max(0.15, Math.abs(P.wpnLen));
  for (let i = shadow ? 0 : 1; i < 2; i++) {
    ctx.save();
    ctx.translate(at.x + (i ? 0 : 1.5), at.y + (i ? 0 : 1.5));
    ctx.rotate(P.wpn.a - ta);
    ctx.scale(len, P.wpnS);
    if (!i) ctx.globalAlpha *= 0.3;
    ctx.drawImage(i ? img : silhouette(img), -d.grip, -img.height / 2);
    ctx.restore();
  }
}

function drawHand(ctx, ch, h) {
  ctx.fillStyle = PALETTE.ink; ctx.fillRect(h.x - 2.2, h.y - 2.2, 4.4, 4.4);
  ctx.fillStyle = ch.look.skin; ctx.fillRect(h.x - 1.4, h.y - 1.4, 2.8, 2.8);
}

export function drawPose(ctx, ch, P, alpha = 1) {
  const x = ch.x, y = ch.y, s = P.s, ta = P.ta;
  const bx = x + P.tx, by = y + P.ty;
  const ga = ctx.globalAlpha;
  if (alpha !== 1) ctx.globalAlpha = ga * alpha;

  // shadow: further away, larger and softer as the body rises
  const sh = silhouette(ch.torso), lift = P.lift;
  const ox = 2 + lift * 4, oy = 2 + lift * 5, sa = 0.35 * (1 - 0.35 * lift);
  if (lift > 0.05) {
    drawSprite(ctx, sh, bx + ox - 0.7, by + oy - 0.5, ta, sa * 0.55, s * 1.05);
    drawSprite(ctx, sh, bx + ox + 0.7, by + oy + 0.5, ta, sa * 0.55, s * 1.05);
  } else drawSprite(ctx, sh, bx + ox, by + oy, ta, sa, s);

  // thighs from the hips to the feet, only when the legs are thrown out in front
  if (P.legs > 0.05) {
    ctx.save();
    ctx.globalAlpha *= Math.min(1, P.legs * 1.5);
    ctx.lineCap = 'round';
    for (let i = 0; i < 2; i++) {
      const f = P.feet[i], side = i ? 1 : -1;
      const hx = bx - Math.sin(f.a) * side * 2.5 * s, hy = by + Math.cos(f.a) * side * 2.5 * s;
      for (const [col, lw] of LEG_STROKES) {
        ctx.strokeStyle = col; ctx.lineWidth = lw * s;
        ctx.beginPath(); ctx.moveTo(hx, hy); ctx.lineTo(x + f.x, y + f.y); ctx.stroke();
      }
    }
    ctx.restore();
  }

  // feet (they rise less than the shoulders)
  ctx.fillStyle = FOOT;
  const fs = 1 + (s - 1) * 0.5;
  for (const f of P.feet) {
    ctx.save();
    ctx.translate(x + f.x, y + f.y);
    ctx.rotate(f.a);
    ctx.scale(fs, fs);
    ctx.fillRect(-3, -1.8, 6, 3.6);
    ctx.restore();
  }

  // arms and weapon in the torso frame
  ctx.save();
  ctx.translate(bx, by);
  ctx.rotate(ta);
  ctx.scale(s, s);
  const c = Math.cos(-ta) / s, sn = Math.sin(-ta) / s;
  const toLocal = (p, out) => {
    const dx = p.x - P.tx, dy = p.y - P.ty;
    out.x = dx * c - dy * sn; out.y = dx * sn + dy * c;
    return out;
  };
  const tr = P.trail;
  if (tr.on && tr.alpha > 0.01) {
    toLocal(tr, TMP);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = `rgba(255,255,255,${tr.alpha.toFixed(3)})`;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(TMP.x, TMP.y, tr.r / s, tr.a0 - ta, tr.a1 - ta);
    ctx.stroke();
    ctx.restore();
  }
  const hl = toLocal(P.hl, LH), hr = toLocal(P.hr, RH);
  ctx.lineCap = 'round';
  for (let i = 0; i < 2; i++) {
    const h = i ? hr : hl, sy = i ? SHOULDER : -SHOULDER;
    ctx.strokeStyle = PALETTE.ink; ctx.lineWidth = 4.6;
    ctx.beginPath(); ctx.moveTo(0, sy); ctx.lineTo(h.x, h.y); ctx.stroke();
    ctx.strokeStyle = ch.look.arm; ctx.lineWidth = 2.8;
    ctx.beginPath(); ctx.moveTo(0, sy); ctx.lineTo(h.x, h.y); ctx.stroke();
  }
  const d = ch.def, armed = P.wpnOn && d.sprite;
  if (armed && !P.top) drawWeapon(ctx, P, d, ta, toLocal(P.wpn, TMP));
  if (P.carryImg) {
    toLocal(P.carry, TMP);
    ctx.save();
    ctx.translate(TMP.x, TMP.y);
    ctx.rotate(P.carry.a - ta);
    ctx.drawImage(P.carryImg, -P.carryImg.width / 2, -P.carryImg.height / 2);
    ctx.restore();
  }
  if (P.top < 2) drawHand(ctx, ch, hl);
  if (!P.top) drawHand(ctx, ch, hr);
  ctx.restore();

  drawSprite(ctx, ch.torso, bx, by, ta, 1, s);
  if (P.top) {
    // what is held above the shoulders goes over them
    ctx.save();
    ctx.translate(bx, by);
    ctx.rotate(ta);
    ctx.scale(s, s);
    if (armed) drawWeapon(ctx, P, d, ta, toLocal(P.wpn, TMP), true);
    if (P.top > 1) drawHand(ctx, ch, hl);
    drawHand(ctx, ch, hr);
    ctx.restore();
  }
  ctx.globalAlpha = ga;
}

// knocked down: the body drops onto the floor (cross-fade + settle), lies dizzy, then rises back into the stance
export function drawDown(ctx, ch, P) {
  const x = ch.x, y = ch.y;
  const fall = smooth(ch.downT / 0.22);
  const rise = ch.executing ? 0 : smooth((0.4 - ch.knocked) / 0.4);
  const down = fall * (1 - rise);
  if (down < 1) {
    standPose(ch, P, rise > 0 ? ch.downAngle + Math.PI : ch.angle);
    P.s *= rise > 0 ? 0.88 + 0.12 * rise : 1 - 0.1 * fall;
    drawPose(ctx, ch, P, 1 - down);
  }
  if (down <= 0) return;
  const sc = 1 + 0.12 * (1 - fall);
  drawSprite(ctx, silhouette(ch.downImg), x + 2 + (1 - fall) * 2, y + 2 + (1 - fall) * 2, ch.downAngle, 0.35 * down, sc);
  drawSprite(ctx, ch.downImg, x, y, ch.downAngle, down, sc);
  // dizzy stars
  const t = ch.world.time * 6;
  ctx.fillStyle = PALETTE.yellow;
  const ga = ctx.globalAlpha;
  ctx.globalAlpha = ga * down;
  const hc = Math.cos(ch.downAngle) * 9, hs = Math.sin(ch.downAngle) * 9;
  for (let i = 0; i < 3; i++) {
    const sa = t + (i * Math.PI * 2) / 3;
    ctx.fillRect(x + hc + Math.cos(sa) * 6 - 1, y + hs + Math.sin(sa) * 3 - 4, 2, 2);
  }
  ctx.globalAlpha = ga;
}
