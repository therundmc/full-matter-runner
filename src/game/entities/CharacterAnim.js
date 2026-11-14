// Procedural character animation shared by the player and enemies.
// Each frame a character builds a pose: plain numbers (torso offset / angle / scale, feet, hands, weapon), all stored as
// offsets from the body centre in world orientation. Traversal poses (vault, ladder, roll, slide) are blended over the
// standing pose so moves start and end exactly on the walk cycle (no popping). drawPose() then paints shadow, feet,
// arms, torso.
// Optional on a character: stow / lower (how the weapon is carried, ai/Carry.js) and busyHands() (where hands taken
// by something else are: a pastime, a cigarette, a panic).
// A weapon's trail through a blow is not drawn here but over the lighting (fx/CombatFx.js sampleSmear).
import { PALETTE, TAKEDOWN } from '../Config.js';
import { TELL, GESTURE } from '../data/feel.js';
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
    tuck: 0, over: 0, // curled up in a ball, the back up (a roll); the legs up over the body
    feet: [pt(), pt()],
    hl: pt(), hr: pt(), wpn: pt(), carry: pt(),
    wpnOn: false, carryImg: null,
    flat: null, flatA: 0, // the hand laid flat on something ('hl' | 'hr') and the angle of that surface
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
  // a guard winding up a blow (Character.windUp) holds its anticipation, cocked, trembling a little
  const cock = ch.tell > 0 && ch.swing <= 0 ? smooth(Math.min(1, (1 - ch.tell / ch.tellDur) * 2.5)) : 0;
  const striking = ch.swing > 0 || cock > 0;
  const swingP = ch.swing > 0 ? 1 - ch.swing / ch.swingDur : cock > 0 ? TELL.hold * cock : 1;
  const rk = ch.recoil * ch.recoil; // snappy kick, eased recovery
  const kick = d.kick ?? 0;
  let twist = 0, back = 0, dip = 0, len = 1, thick = 1, top = 0;

  // aim-space hands / weapon (x forward, y right)
  let hlx, hly, hrx, hry, wx = 0, wy = 0, wa = 0, wpnOn = false;
  let carryImg = null, cx = 0, cy = 0, ca = 0;
  P.flat = null;

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
    } else if (striking) {
      // punch: small pull-back (a guard's wind-up: the fist drawn right back), snap out (it is out when the blow
      // lands, a fifth of the way through), hold, ease home
      const p = swingP;
      const ext = cock ? -0.55 * cock : p < 0.05 ? -0.25 * smooth(p / 0.05)
        : p < 0.18 ? lerp(-0.25, 1, easeOut((p - 0.05) / 0.13)) : p < 0.3 ? 1 : lerp(1, 0, smooth((p - 0.3) / 0.7));
      if (ch.punchSide < 0) { hlx += ext * 10; hly += Math.max(0, ext) * 4; }
      else { hrx += ext * 10; hry -= Math.max(0, ext) * 4; }
      twist = -ch.punchSide * 0.2 * ext;
    }
  } else if (d.hold === 'one' || d.hold === 'two') {
    const kp = 1.6 + kick * 0.45;
    // not on a target: a pistol pulled in, pointing at the floor; a long gun across the chest
    const low = smooth(ch.lower);
    wpnOn = true;
    wa = -rk * (0.05 + kick * 0.02); // muzzle climb
    back = rk * kick * 0.12;
    if (d.hold === 'one') {
      hrx = lerp(10, 6.5, low) - kp * rk; hry = 1.5 + 0.5 * low;
      wx = hrx; wy = 1 + 0.5 * low;
      len = 1 - 0.25 * low;
      hlx = hrx - 1; hly = -0.5;
    } else {
      wa -= 0.55 * low;
      hrx = lerp(5, 3, low) - kp * rk; hry = 3 + 2 * low;
      wx = hrx; wy = hry - 1;
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
    // melee weapon. At rest a bat lies on the shoulder and a knife is held low, point forward. A blow is one of four
    // gestures (ch.strike): forehand sweep, backhand sweep, the heavy one (overhead smash / straight stab), or 3 (a
    // club's spin, a blade's overhead stab), all on the same clock: anticipation, fast stroke (in front when the hit
    // lands), follow-through, recovery.
    const bat = d.swing === 'club';
    const ra = bat ? d.rest ?? 3 : 0.35; // weapon angle at rest
    const round = bat && ra > 1.5; // it rests behind the shoulder: a sweep carries on round the back of the head
    const spin = bat && striking && ch.strike === 3;
    const sw = stride * 2.2 * g;
    hlx = 6 - sw; hly = -6;
    hrx = bat ? 5 : 7 + sw * 0.5; hry = bat ? 4 : 6.5;
    wa = ra;
    if (striking) {
      const p = swingP, k = ch.strike;
      const out = smooth(p / 0.12) * (1 - smooth((p - 0.55) / 0.45)); // 0 in the rest pose .. 1 during the stroke
      let sx, sy; // where the stroke puts the hand
      if (spin) {
        // spin: the whole body turns once, the weapon held out trailing behind it; it starts back right, goes through
        // the front and all the way round, then settles back to the rest pose
        const u = smooth((p - 0.08) / 0.5), phi = 2.4 - Math.PI * 2 * u;
        wa = lerpA(phi, ra, smooth((p - 0.55) / 0.45));
        sx = 2 + Math.cos(phi) * 8; sy = Math.sin(phi) * 8;
        twist = p < 0.6 ? -Math.PI * 2 * u : 0; // a full turn is the same as none
      } else if (k < 2) {
        // sweep across the front (a backhand is its mirror image). The angle runs from the rest pose to the rest
        // pose: the bat carries on round the back of the head, the knife comes back the way it went
        const dir = k ? -1 : 1;
        const from = round && k ? Math.PI * 2 - ra : dir * ra, home = round ? (k ? -ra : ra - Math.PI * 2) : dir * ra;
        const wind = bat ? 2.5 : 1.3, end = bat ? -1.9 : -1.3, over = end - 0.22;
        wa = dir * (p < 0.12 ? lerp(from, wind, smooth(p / 0.12))
          : p < 0.4 ? lerp(wind, end, easeOut((p - 0.12) / 0.28))
            : p < 0.55 ? lerp(end, over, smooth((p - 0.4) / 0.15)) : lerp(over, home, smooth((p - 0.55) / 0.45)));
        const r = 7 + 2 * bump(p, 0.08, 0.6), cw = Math.cos(wa);
        sx = 3 + cw * r * (bat && cw < 0 ? 0.5 : 1); sy = (bat ? 1 : 2) + Math.sin(wa) * r; // a bat stays close behind
        twist = -dir * (bat ? 0.4 : 0.25) * smooth((p - 0.1) / 0.3) * (1 - smooth((p - 0.5) / 0.5)); // shoulders follow
      } else if (bat ? !d.thrust : k === 3) {
        // overhead smash (a blade: an ice-pick stab): up over the head (the weapon shortens as it points at the
        // camera), straight down in front, then back to the rest pose round the right side
        const u = easeOut((p - 0.1) / 0.2);
        if (p < 0.3) { wa = lerp(ra, Math.PI, smooth(p / 0.1)); len = Math.cos(Math.PI * u); thick = 1 + 0.35 * Math.sin(Math.PI * u); }
        else wa = ra * smooth((p - 0.55) / 0.45);
        sx = lerp(1.5, 10, u); sy = 1.5;
        back = -2.5 * bump(p, 0.12, 0.7);
        dip = 0.05 * bump(p, 0.2, 0.7) - 0.05 * bump(p, 0, 0.2); // up on the toes, then bent over the blow
        if (p < 0.3 && len > -0.5) top = 2;
      } else {
        // straight stab (or a cue's lunge): the elbow comes back, the point goes in with the shoulder behind it
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
    if (cock) {
      // wound up: the shoulders turned away from the blow to come, the weight back, the weapon shaking a little
      twist += ch.punchSide * 0.3 * cock;
      back += 1.5 * cock;
      wa += Math.sin(ch.world.time * 47 + ch.breath) * 0.06 * cock;
    }
    wx = hrx; wy = hry; wpnOn = true;
    if (bat && !top && !spin && Math.cos(wa) * len < -0.3) top = 1; // behind the head: over the shoulder
  }
  if (wpnOn && ch.stow > 0) {
    // put away: a pistol or a knife on the hip, anything long across the back, both hands free. Drawing it, the
    // hand goes to it first, then brings it up.
    const k = smooth(ch.stow), sw = stride * 2.6 * g, long = d.hold === 'two' || d.swing === 'club';
    const reach = Math.min(1, k * 2), away = Math.max(0, k * 2 - 1);
    let sx = 1, sy = 6.5, sa = 3; // on the hip: little more than the grip shows
    if (long) {
      const off = sprite(d.sprite).width * 0.5 - d.grip;
      sa = 2.05; sx = -3 - Math.cos(sa) * off; sy = -Math.sin(sa) * off;
    }
    wx = lerp(wx, sx, reach); wy = lerp(wy, sy, reach); wa = lerp(wa, sa, reach);
    len = lerp(len, long ? 1 : 0.55, reach);
    if (k > 0.5) top = 0;
    hrx = lerp(lerp(hrx, long ? -1 : sx, reach), 6 + sw, away); hry = lerp(lerp(hry, long ? 7 : sy, reach), 6, away);
    hlx = lerp(hlx, 6 - sw, reach); hly = lerp(hly, -6, reach); // the other hand lets go first, comes back last
  }
  // hands taken by something else (a pastime, a cigarette, a chat, a panic): the character says where they are
  const busy = ch.busyHands?.();
  if (busy) { hlx = busy.hl.x; hly = busy.hl.y; hrx = busy.hr.x; hry = busy.hr.y; }
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
  // standing around, the weight goes from one leg to the other (not the player: his stance answers the keys)
  const shift = ch.isPlayer ? 0 : (1 - g) * clamp(Math.sin(ch.world.time * 0.5 + ch.breath * 3) * 3, -1, 1);
  P.tx = ch.lean.x - Math.cos(a) * back - Math.sin(a) * shift * 0.8;
  P.ty = ch.lean.y - Math.sin(a) * back + Math.cos(a) * shift * 0.8;
  P.s = 1 + 0.014 * g * Math.abs(Math.cos(ch.walk)) + 0.012 * (1 - g) * Math.sin(ch.world.time * 2.3 + ch.breath) - dip;
  P.lift = 0;
  P.legs = 0;
  P.tuck = 0;
  P.over = 0;

  // feet along the smoothed travel direction; the stride fades in and out with the gait
  const fa = ch.footA, amp = 5 * g;
  for (let i = 0; i < 2; i++) {
    const side = i ? 1 : -1, f = P.feet[i];
    const lx = stride * side * amp + 1 + Math.max(0, -side * shift) * 1.3, ly = side * 3.6; // the free foot ahead
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
  A.tuck = lerp(A.tuck, B.tuck, w); A.over = lerp(A.over, B.over, w);
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
  return A;
}

function copyPose(A, B) {
  A.tx = B.tx; A.ty = B.ty; A.ta = B.ta; A.s = B.s; A.lift = B.lift; A.legs = B.legs; A.tuck = B.tuck; A.over = B.over;
  for (let i = 0; i < 2; i++) Object.assign(A.feet[i], B.feet[i]);
  for (const k of ['hl', 'hr', 'wpn', 'carry']) Object.assign(A[k], B[k]);
  A.wpnOn = B.wpnOn; A.carryImg = B.carryImg;
  A.wpnLen = B.wpnLen; A.wpnS = B.wpnS; A.top = B.top;
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
// hoist (a sill, a gate, a parapet): anticipation crouch, hands planted on the edge, body hoisted over with tucked
// legs, squash on landing (or straight on into a roll after a drop).
// prop: action-movie hip slide over the top, the gun arm stays on target, one palm skidding on the surface.
export function vaultPose(ch, P, V) {
  const v = ch.vaulting;
  if (v.rolling) return rollPose(ch, P, V);
  if (v.ladder) return ladderPose(ch, P, V);
  const k = clamp(v.t / v.dur, 0, 1);
  const win = v.hoist;
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

  // blend in from / out to the walk (a roll takes over from the landing pose instead), then crouch before the
  // take-off and squash on landing on top
  const w = smooth(k / 0.14) * (v.roll ? 1 : 1 - smooth((k - 0.82) / 0.18));
  blendPose(P, V, w);
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
function holdOnTheWay(ch, V, f) {
  V.carryImg = null;
  if (!V.wpnOn) return;
  const d = ch.def;
  if (d.hold === 'two' || d.swing === 'club') {
    const sa = 2.05, off = sprite(d.sprite).width * 0.5 - d.grip;
    place(V.wpn, V, V.ta, -3 - Math.cos(sa) * off, -Math.sin(sa) * off);
    V.wpn.a = V.ta + sa;
  } else {
    V.wpn.x = V.hr.x; V.wpn.y = V.hr.y; V.wpn.a = f + 0.25;
    V.wpnLen = 0.8;
  }
}

// ---------------- roll ----------------
// After a drop: a forward roll over one shoulder, seen from above. The body tucks into a ball (the head goes under,
// the back shows), the legs come up over it and unfold in front, he sits up over his feet and rises running. The free
// hand takes the floor first and pushes him up at the end; the weapon stays in the other one, tucked in.
const ROLL = {
  t: [0, 0.14, 0.3, 0.46, 0.62, 0.8, 1],
  fwd: [0, 3.5, 2, -0.5, -3, -1.5, 0],  // torso ahead of the body centre
  s: [1, 0.88, 0.8, 0.8, 0.86, 0.95, 1],
  tuck: [0, 0.6, 1, 1, 0.4, 0, 0],
  fx: [1, -2, -3, 1, 8, 4, 1],          // feet: forward, and half their spread
  fy: [3.6, 3.2, 3.4, 3.4, 3.2, 3.4, 3.6],
  legs: [0, 0, 0.7, 1, 1, 0.3, 0],
  hx: [6, 10, 3, 2, -1, 1, 6],          // the free hand: on the floor ahead, tucked in, pushing off beside the hip
  hy: [6, 5, 3.5, 3.5, 8.5, 7, 6],
};

function rollPose(ch, P, V) {
  const v = ch.vaulting, r = v.rolling, k = clamp(r.t / r.dur, 0, 1);
  const dir = v.dir, c = Math.cos(dir), s = Math.sin(dir), key = (n) => track(ROLL.t, ROLL[n], k);
  const mv = (out, lx, ly) => { out.x = lx * c - ly * s; out.y = lx * s + ly * c; }; // move space -> pose space
  copyPose(V, P);
  const fwd = key('fwd');
  V.ta = dir + r.side * 0.5 * bump(k, 0.06, 0.72);
  V.tx = c * fwd; V.ty = s * fwd;
  V.s = key('s');
  V.tuck = clamp(key('tuck'), 0, 1);
  V.over = bump(k, 0.22, 0.6);
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

// ---------------- sitting on the ground (Player.sit: how a level starts) ----------------
// back to the wall, legs stretched out in front, palms on the floor by the hips; ch.sit runs 1 -> 0 as he gets up
export function sitPose(ch, P, V) {
  const w = smooth(ch.sit);
  if (w <= 0) return P;
  copyPose(V, P);
  const c = Math.cos(ch.angle), s = Math.sin(ch.angle);
  V.ta = ch.angle;
  V.tx = -c * 4; V.ty = -s * 4;
  V.s = 0.86;
  V.legs = 1;
  V.top = 0;
  V.wpnOn = false;
  V.carryImg = null;
  for (let i = 0; i < 2; i++) {
    const side = i ? 1 : -1, lx = i ? 12 : 13.5, ly = side * 3.5, f = V.feet[i];
    f.x = V.tx + lx * c - ly * s; f.y = V.ty + lx * s + ly * c; f.a = ch.angle;
  }
  for (const [h, side] of [[V.hl, -1], [V.hr, 1]]) {
    h.x = V.tx - c - s * side * 9; h.y = V.ty - s + c * side * 9;
    reach(h, V, side);
  }
  blendPose(P, V, w);
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

// ---------------- a hand flat on a door leaf (Character.doorHand, GESTURE.door) ----------------
// The hand on the leaf's side comes up flat against it while he pushes; with something in the right hand it is
// always the left one (the weapon stays where it is).
export function doorHandPose(ch, P) {
  const H = ch.doorHand, w = smooth(H.w);
  if (w <= 0) return P;
  const tx = H.x - ch.x, ty = H.y - ch.y;
  const right = !P.wpnOn && Math.cos(P.ta) * ty - Math.sin(P.ta) * tx > 0;
  const h = right ? P.hr : P.hl;
  h.x = lerp(h.x, tx, w); h.y = lerp(h.y, ty, w);
  reach(h, P, right ? 1 : -1);
  if (w > 0.5) { P.flat = right ? 'hr' : 'hl'; P.flatA = H.a; }
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
export const riseOf = (ch) => (ch.riseDur > 0 && !ch.executing ? clamp(1 - ch.knocked / ch.riseDur, 0, 1) : 0);

// Taken off his feet (fall 0 .. 1): the torso thrown along the blow, the head snapped round with it, the arms left
// behind, the feet swept out toward whoever hit him.
function staggerPose(ch, P, V, fall) {
  const kd = ch.downAngle + Math.PI, c = Math.cos(kd), s = Math.sin(kd);
  const side = Math.sin(ch.angle - kd) >= 0 ? 1 : -1, e = easeOut(fall);
  copyPose(V, P);
  V.ta = P.ta + side * 0.75 * e;
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
  V.ta = a;
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

// flat: the angle (in the frame it is drawn in) of the surface the palm is laid flat on
function drawHand(ctx, ch, h, flat = null) {
  if (flat !== null) {
    ctx.save();
    ctx.translate(h.x, h.y);
    ctx.rotate(flat);
    ctx.fillStyle = PALETTE.ink; ctx.fillRect(-3.2, -2, 6.4, 4);
    ctx.fillStyle = ch.look.skin; ctx.fillRect(-2.4, -1.2, 4.8, 2.4);
    ctx.restore();
    return;
  }
  ctx.fillStyle = PALETTE.ink; ctx.fillRect(h.x - 2.2, h.y - 2.2, 4.4, 4.4);
  ctx.fillStyle = ch.look.skin; ctx.fillRect(h.x - 1.4, h.y - 1.4, 2.8, 2.8);
}

// thighs from the hips to the feet (only when the legs are thrown out in front), and the feet: they rise less than
// the shoulders; up: how much nearer the eye they are
function drawLegs(ctx, P, x, y, bx, by, s, up = 1) {
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
  ctx.fillStyle = FOOT;
  const fs = (1 + (s - 1) * 0.5) * up;
  for (const f of P.feet) {
    ctx.save();
    ctx.translate(x + f.x, y + f.y);
    ctx.rotate(f.a);
    ctx.scale(fs, fs);
    ctx.fillRect(-3, -1.8, 6, 3.6);
    ctx.restore();
  }
}

// curled up in a roll: the torso shorter and rounder, the head tucked under, the hunched back on top of it
function drawTucked(ctx, ch, P, bx, by) {
  const t = smooth(P.tuck), img = ch.torso;
  ctx.save();
  ctx.translate(bx, by);
  ctx.rotate(P.ta);
  ctx.scale(P.s * (1 - 0.22 * t), P.s * (1 + 0.05 * t));
  drawSprite(ctx, img, 0, 0);
  // the head gone under the shoulders: the jacket's back where it was, lit on its round top, the spine down the
  // middle, the collar at the front edge
  ctx.globalAlpha *= t;
  ctx.fillStyle = ch.look.arm;
  ctx.beginPath(); ctx.ellipse(0, 0, 5, 6, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = 'rgba(0,0,0,0.22)';
  ctx.beginPath(); ctx.ellipse(-1.8, 0, 3.2, 5.3, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.16)';
  ctx.beginPath(); ctx.ellipse(1, -1.2, 2.6, 3.2, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.fillRect(-4.5, -0.4, 8, 0.8);
  ctx.strokeStyle = PALETTE.ink; ctx.lineWidth = 1.3;
  ctx.beginPath(); ctx.arc(0, 0, 5, -1.1, 1.1); ctx.stroke();
  ctx.restore();
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

  if (P.over <= 0.35) drawLegs(ctx, P, x, y, bx, by, s);

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
  const fa = P.flatA - ta;
  if (P.top < 2) drawHand(ctx, ch, hl, P.flat === 'hl' ? fa : null);
  if (!P.top) drawHand(ctx, ch, hr, P.flat === 'hr' ? fa : null);
  ctx.restore();

  if (P.tuck > 0.02) drawTucked(ctx, ch, P, bx, by);
  else drawSprite(ctx, ch.torso, bx, by, ta, 1, s);
  if (P.over > 0.35) drawLegs(ctx, P, x, y, bx, by, s, 1 + 0.15 * P.over); // up over the body, nearer the eye
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
  const sc = 1 + 0.12 * (1 - fall);
  drawSprite(ctx, silhouette(ch.downImg), x + 2 + (1 - fall) * 2, y + 2 + (1 - fall) * 2, ch.downAngle, 0.35 * down, sc);
  drawSprite(ctx, ch.downImg, x, y, ch.downAngle, down, sc);
  if (ch.asleep) return;
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
