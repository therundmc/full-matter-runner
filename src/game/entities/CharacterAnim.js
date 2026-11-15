// Procedural character animation shared by the player and enemies.
// Each frame a character builds a pose: plain numbers (torso offset / angle / scale, feet, hands, weapon), all stored as
// offsets from the body centre in world orientation. Traversal poses (vault, ladder, roll, slide) are blended over the
// standing pose so moves start and end exactly on the walk cycle (no popping). drawPose() then paints shadow, feet,
// arms, torso.
// Optional on a character: stow / lower (how the weapon is carried, ai/Carry.js) and busyHands() (where hands taken
// by something else are: a pastime, a cigarette, a panic).
// A weapon's trail through a blow is not drawn here but over the lighting (fx/CombatFx.js sampleSmear).
import { PALETTE, TAKEDOWN, BODY_SCALE } from '../Config.js';
import { TELL, GESTURE } from '../data/feel.js';
import { EXEC } from '../data/finishers.js';
import { sprite, spriteOpt, drawSprite, silhouette, sw as spriteW } from '../../engine/Assets.js';
import { lerp, clamp, angDiff } from '../../engine/math.js';
import { GAIT, stanceAt, reachAt, footAt, phaseOf, bodyAt } from './Gait.js';
import { beginLimbs, flushLimbs, paintLeg, paintArm, drawHand } from '../render/LimbArt.js';
import { cantedGun, cantPalm } from '../render/HandgunArt.js';

export const smooth = (t) => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
const easeOut = (t) => 1 - Math.pow(1 - clamp(t, 0, 1), 3);
// 0 -> 1 -> 0 over [a, b]
const bump = (k, a, b) => (k <= a || k >= b ? 0 : Math.sin((Math.PI * (k - a)) / (b - a)));
const lerpA = (a, b, t) => a + angDiff(a, b) * t;

const ARM = 11;           // how far the special poses (vault, ladder, sit...) let a hand go from its shoulder (px)
const SHOULDER = 6;       // shoulders at torso-local (0, +-6)
// the arm as drawn: shoulder joint (torso-local, under the sprite's shoulder), upper arm and forearm (their real
// lengths: an arm bent toward the floor or the eye shows shorter, its elbow out to the side), the hips' half width,
// the neck (torso-local x of the head's centre)
export const NECK = 0.9;
const LIMB = { sx: -0.6, sy: 6.1, upper: 6.9, fore: 6.7, hip: 2.3, neck: NECK };
// the free hands (torso-local x, y of the left one, mirrored for the right): standing, walking (+- the swing),
// running (+- the swing, pumping); how far the swing takes them walking / running; how far the elbows go out
// standing / walking / running (0 .. 1)
const HANDS = { stand: [4.6, -6.6], walk: [0.6, -7.4], run: [2.2, -6.2], swing: [4.6, 4.8], elbow: [0.35, 0.15, 0.4] };
// the shoulders turned against the hips by the stride (rad, walking / running) and how much of it a held weapon
// leaves; the body swayed over the planted foot (px), bobbing (share of its size, walking / running), leant into a
// run (px)
const BODY = { turn: [0.1, 0.16], gun: 0.3, two: 0.15, melee: 0.6, sway: 0.55, bob: [0.012, 0.02], lean: 1.4 };
// a long gun shouldered: the shoulders bladed to its side (rad), the butt in the pocket of the right shoulder
// (aim-space px), where it goes held low across the body and how far it turns down, a launcher on top of the shoulder
const SHOULDERED = { twist: 0.3, pocket: [-1.6, 3.3], low: [-0.4, 4.6], lowA: -0.55, onShoulder: [-1.2, 5.2] };
// a machine pistol held canted in one hand (weapons.js 'side', render/HandgunArt.js): the fist on a target, the elbow
// bent (further out for a gun whose rear would go into the chest: its back end `clear` px ahead of the body's centre),
// how far the elbow goes out (LimbArt's 0 .. 1), the gun shoulder led forward (rad); held low, the fist by the thigh,
// the gun pointing at the floor ahead (turned out, foreshortened); the kick throws the muzzle toward the slide's top,
// half sideways (rad at no kick, and per unit of kick), half up at the eye (`rise`: the gun shows that much shorter);
// the hand closed round the grip is a little bigger than an empty fist
const SIDE = {
  aim: [10, 4.3], clear: 5, elb: 0.5, twist: -0.3, low: [4.2, 8.4], lowA: 0.35, lowLen: 0.55, flip: [0.08, 0.04], rise: 0.12,
  fist: 1.1,
};
const sideReach = (d) => Math.max(SIDE.aim[0], d.grip + SIDE.clear);
// a pistol held out in both hands (weapons.js 'both'): the gun hand on a target (aim-space px), the other hand closed
// over it on the butt (`cup`: from the gun hand, in the gun's frame), how far the elbows go out (left, right); running,
// the hands come in toward the chest by `run` px; held low (low ready), the hands in before the belly, the muzzle
// pointing at the floor ahead (turned out, foreshortened); the kick lifts the muzzle at the eye (`rise`: the gun shows
// that much shorter) and over toward the top of the slide (rad per unit of kick); reloading, the gun hand comes in to
// `reload` and the magazine goes up into the butt (`well`: from the gun hand, in the gun's frame) along the grip's rake
const PAIR = {
  aim: [11, 3.2], cup: [0.5, -1.3], elb: [0.2, 0.3], run: 2.5, low: [7, 3], lowA: 0.25, lowLen: 0.6, rise: 0.1, flip: 0.03,
  reload: [8, 2], well: [-0.7, 2.4], rake: 0.3,
};

const GAIT_WIDTH = GAIT.width;

// The muzzle of gun d is the end of its sprite on the bore line: `bore` world px off the sprite's middle line (- =
// toward its top), MUZZLE_IN px in from its last column (the dark outline round the steel). w: the sprite's width.
export const MUZZLE_IN = 0.5;
export const muzzleX = (d, w) => w - MUZZLE_IN - d.grip; // from the hand along the barrel, world px

// The pose holds a gun by the point of its sprite under the hand: x = grip, and off the middle line `palm` (a handgun:
// the hand's centre is under the slide, on the grip) or 0. In the fist (P.fist) a machine pistol is drawn canted
// (render/HandgunArt.js), its side squashed toward the bore: the fist comes up with it.
const canted = (d, fist) => fist && d.hide !== undefined;
export const palmOf = (d, fist = false) => (canted(d, fist) ? cantPalm(d) : d.palm ?? 0);

// Where the muzzle is in pose P as it is drawn (pose px about the feet, world orientation; the caller scales by
// BODY_SCALE) and the way the barrel points: drawWeapon's own transform applied to the muzzle point
export function muzzleIn(P, d, w, out) {
  const len = Math.sign(P.wpnLen || 1) * Math.max(0.15, Math.abs(P.wpnLen));
  const u = muzzleX(d, w) * len * P.s, v = ((d.bore ?? 0) - palmOf(d, P.fist)) * P.wpnS * P.s, c = Math.cos(P.wpn.a), s = Math.sin(P.wpn.a);
  out.x = P.wpn.x + u * c - v * s; out.y = P.wpn.y + u * s + v * c; out.a = P.wpn.a;
  return out;
}

// the same in the aim's frame (pose px, x forward) for the gun raised on a target, standing: for a character not
// drawn yet
const MUZZLE = { x: 0, y: 0 };
export function muzzleAt(d, w) {
  if (d.hold === 'both') { MUZZLE.x = PAIR.aim[0] + muzzleX(d, w); MUZZLE.y = PAIR.aim[1] + (d.bore ?? 0) - palmOf(d); return MUZZLE; }
  if (d.hold !== 'two') { MUZZLE.x = sideReach(d) + muzzleX(d, w); MUZZLE.y = SIDE.aim[1] + (d.bore ?? 0) - palmOf(d, true); return MUZZLE; }
  const at = d.onShoulder ? SHOULDERED.onShoulder : SHOULDERED.pocket;
  MUZZLE.x = at[0] + d.grip - (d.butt ?? 0.5) + muzzleX(d, w); MUZZLE.y = at[1] + (d.bore ?? 0);
  return MUZZLE;
}

const pt = () => ({ x: 0, y: 0, a: 0, lift: 0, heel: 0 });
export function newPose() {
  return {
    tx: 0, ty: 0, ta: 0, s: 1, lift: 0, legs: 0, // legs: how far the legs are thrown out in front (sit, slide...)
    tuck: 0, over: 0, // curled up in a ball, the back up (a roll); the legs up over the body
    ha: 0,            // where the head looks: it keeps to the aim while the shoulders turn under it
    feet: [pt(), pt()],
    hand: ['loose', 'loose'], elb: [0.45, 0.45], // how each hand is ('fist' | 'loose' | 'flat'), elbows out 0 .. 1
    hl: pt(), hr: pt(), wpn: pt(), carry: pt(),
    wpnOn: false, carryImg: null,
    fist: false,      // the right hand closed on a handgun's grip (what is in the fist is not drawn)
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
const F0 = { x: 0, lift: 0, heel: 0 }, F1 = { x: 0, lift: 0, heel: 0 }, BOB = { bob: 0, sway: 0 };

// a free hand (side -1 left, 1 right) at gait g / run r, swinging against the stride (sw -1 .. 1, + = left forward)
function freeHand(side, g, r, sw, out) {
  const H = HANDS, f = -side * sw;
  const wx = lerp(H.stand[0], H.walk[0] + f * H.swing[0], g), wy = lerp(H.stand[1], H.walk[1], g);
  out.x = lerp(wx, H.run[0] + f * H.swing[1], r);
  out.y = side * -lerp(wy, H.run[1] + Math.max(0, f) * 1.1, r); // pumping, a fist coming forward comes in a little
  return out;
}
const FH = { x: 0, y: 0 };

export function standPose(ch, P, a = ch.angle) {
  const d = ch.def;
  const g = Math.min(1, ch.gait), run = ch.runK * g;
  // the stride: where each foot is in its cycle, and the swing of the arms against it (+ = the right foot ahead)
  const beta = stanceAt(ch.strideV), Rn = Math.max(0.5, reachAt(ch.strideV)), R = Rn * g;
  footAt(phaseOf(ch, 0), R, beta, F0); footAt(phaseOf(ch, 1), R, beta, F1);
  const stride = ((F1.x - F0.x) / (2 * Rn)) * (ch.backward ? -1 : 1);
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

  P.hand[0] = P.hand[1] = 'fist';
  P.elb[0] = P.elb[1] = lerp(lerp(HANDS.elbow[0], HANDS.elbow[1], g), HANDS.elbow[2], run);
  let stance = 0; // the shoulders bladed behind a shouldered gun (or turned behind a handgun held out)
  let fist = d.hold === 'side'; // the right hand closed on a handgun's grip
  if (d.hold === 'none') {
    // a loose guard standing, the arms swinging against the stride walking, pumping running
    freeHand(-1, g, run, stride, FH); hlx = FH.x; hly = FH.y;
    freeHand(1, g, run, stride, FH); hrx = FH.x; hry = FH.y;
    if (g > 0.4 && run < 0.5 && !striking) P.hand[0] = P.hand[1] = 'loose';
    if (ch.yielded) {
      P.hand[0] = P.hand[1] = 'flat';
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
  } else if (d.hold === 'both' || d.hold === 'side' || d.hold === 'two') {
    const kp = 1.6 + kick * 0.45;
    // not on a target: a pistol before the belly and a machine pistol down by the thigh, pointing at the floor; a long
    // gun across the chest
    const low = smooth(ch.lower);
    wpnOn = true;
    wa = -rk * (0.05 + kick * 0.02); // muzzle climb
    back = rk * kick * 0.12;
    if (d.hold === 'both') {
      // the arms out in a narrow triangle, the gun hand on the grip, the other one closed over it (paintHand); the
      // kick throws the hands back and the muzzle up at the eye
      const S = PAIR;
      wa = -rk * kick * S.flip + S.lowA * low;
      hrx = lerp(S.aim[0] - S.run * run, S.low[0], low) - kp * rk; hry = lerp(S.aim[1], S.low[1], low);
      wx = hrx; wy = hry;
      len = lerp(1, S.lowLen, low) * (1 - S.rise * rk);
      const c = Math.cos(wa), sn = Math.sin(wa), ux = S.cup[0] * len;
      hlx = hrx + ux * c - S.cup[1] * sn; hly = hry + ux * sn + S.cup[1] * c;
      P.elb[0] = S.elb[0] + 0.3 * low; P.elb[1] = S.elb[1] + 0.2 * low + 0.25 * rk;
    } else if (d.hold === 'side') {
      // in one hand, the elbow a little bent, the gun canted, the gun shoulder forward; the other arm hangs at his
      // side and swings with the stride. The kick throws the muzzle toward the top of the slide (sideways and up at
      // the eye, seen from above), the fist back along the arm, the elbow folding.
      const S = SIDE;
      wa = -rk * (S.flip[0] + kick * S.flip[1]) + S.lowA * low;
      hrx = lerp(sideReach(d), S.low[0], low) - kp * rk; hry = lerp(S.aim[1], S.low[1], low) - 0.4 * kick * rk;
      wx = hrx; wy = hry;
      len = lerp(1, S.lowLen, low) * (1 - S.rise * rk);
      stance = S.twist * (1 - 0.6 * low);
      freeHand(-1, g, run, stride, FH);
      const c = Math.cos(stance), sn = Math.sin(stance); // at the side of the turned shoulders
      hlx = FH.x * c - FH.y * sn; hly = FH.x * sn + FH.y * c;
      if (g > 0.4 && run < 0.5) P.hand[0] = 'loose';
      P.elb[1] = lerp(S.elb, 0.12, low) + 0.25 * rk;
    } else {
      // shouldered: the butt in the pocket of the right shoulder (on top of it for a launcher), the weapon along the
      // aim, the right hand on its grip, the left one on its forend; held low, it goes down across the body
      const S = SHOULDERED, up = d.onShoulder && low < 0.5, butt = d.butt ?? 0.5; // held low, a launcher too
      wa += S.lowA * low;
      const bx = (up ? S.onShoulder[0] : lerp(S.pocket[0], S.low[0], low)) - kp * rk;
      const by = up ? S.onShoulder[1] : lerp(S.pocket[1], S.low[1], low);
      const c = Math.cos(wa), sn = Math.sin(wa);
      wx = bx + c * (d.grip - butt); wy = by + sn * (d.grip - butt);
      hrx = wx; hry = wy + 0.3;
      hlx = bx + c * (d.fore - butt); hly = by + sn * (d.fore - butt) - 0.2;
      stance = SHOULDERED.twist * (1 - 0.4 * low);
      P.elb[0] = 0.3; P.elb[1] = 0.7;
      if (up) top = 1;
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
        // tilt the gun in, fetch a fresh mag from the belt, slam it in, rack. A handgun comes in before the chest and
        // its magazine goes up into the grip, under the gun hand: the other palm drives it in from the grip's butt.
        const tilt = smooth(p < 0.12 ? p / 0.12 : p > 0.85 ? (1 - p) / 0.15 : 1), side = d.hold === 'side', both = d.hold === 'both';
        wa -= 0.55 * tilt;
        if (side) { wx = lerp(wx, d.grip + 4.5, tilt); wy = lerp(wy, 2.6, tilt); P.elb[1] = lerp(P.elb[1], 0.6, tilt); }
        else if (both) { wx = lerp(wx, PAIR.reload[0], tilt); wy = lerp(wy, PAIR.reload[1], tilt); P.elb[1] = lerp(P.elb[1], 0.5, tilt); }
        else wx -= 1.5 * tilt;
        let wellX = wx + 2, wellY = wy + 3;
        if (side) { wellX = wx - 0.4 - Math.sin(wa) * 1.8; wellY = wy + Math.cos(wa) * 1.8; }
        else if (both) {
          const c = Math.cos(wa), sn = Math.sin(wa), [ux, uy] = PAIR.well;
          wellX = wx + ux * c - uy * sn; wellY = wy + ux * sn + uy * c;
        }
        if (p < 0.15) { const e = smooth(p / 0.15); hlx = lerp(hlx, bx, e); hly = lerp(hly, by, e); }
        else if (p < 0.4) { hlx = bx; hly = by; }
        else if (p < 0.7) { const e = easeOut((p - 0.4) / 0.3); hlx = lerp(bx, wellX, e); hly = lerp(by, wellY, e); }
        else { hlx = wellX; hly = wellY; }
        if (p > 0.25 && p < 0.72 && d.magSprite) {
          carryImg = spriteOpt(d.magSprite); cx = hlx; cy = hly; ca = side ? wa + Math.PI / 2 : both ? wa + PAIR.rake : Math.PI / 2; // along the grip
        }
        if (p > 0.86) wx -= Math.sin(((p - 0.86) / 0.14) * Math.PI) * 3;
        if (side || both) hry = wy;
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
    freeHand(-1, g, run, stride, FH); hlx = FH.x; hly = FH.y;
    if (g > 0.4 && !striking) P.hand[0] = 'loose';
    hrx = bat ? 5 : 7 - stride * 1.1 * g; hry = bat ? 4 : 6.5;
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
    const k = smooth(ch.stow), long = d.hold === 'two' || d.swing === 'club';
    const reach = Math.min(1, k * 2), away = Math.max(0, k * 2 - 1);
    let sx = 1, sy = 6.5, sa = 3; // on the hip: little more than the grip shows
    if (long) {
      const off = spriteW(sprite(d.sprite)) * 0.5 - d.grip;
      sa = 2.05; sx = -3 - Math.cos(sa) * off; sy = -Math.sin(sa) * off;
    }
    wx = lerp(wx, sx, reach); wy = lerp(wy, sy, reach); wa = lerp(wa, sa, reach);
    len = lerp(len, long ? 1 : 0.55, reach);
    if (k > 0.5) top = 0;
    freeHand(1, g, run, stride, FH);
    hrx = lerp(lerp(hrx, long ? -1 : sx, reach), FH.x, away); hry = lerp(lerp(hry, long ? 7 : sy, reach), FH.y, away);
    freeHand(-1, g, run, stride, FH);
    hlx = lerp(hlx, FH.x, reach); hly = lerp(hly, FH.y, reach); // the other hand lets go first, comes back last
    stance *= 1 - k;
    if (g > 0.4 && k > 0.5) { P.hand[0] = 'loose'; if (away > 0.5) P.hand[1] = 'loose'; }
    if (away > 0.5) fist = false; // the hand has let go of it: the grip shows out of the holster
  }
  // hands taken by something else (a pastime, a cigarette, a chat, a panic): the character says where they are
  const busy = ch.busyHands?.();
  if (busy) { hlx = busy.hl.x; hly = busy.hl.y; hrx = busy.hr.x; hry = busy.hr.y; fist = false; }
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

  // torso: the shoulders turn against the hips with the stride (less with a weapon held on something), the body goes
  // over the planted foot, bobs (up over the foot walking, down onto it running), leans into a run, is carried by
  // a change of speed (Character.carryTorso), breathes standing; recoil pushes it back
  const B = BODY, held = d.hold === 'two' || d.hold === 'both' ? B.two : d.hold === 'side' ? B.gun : d.hold === 'melee' ? B.melee : 1;
  bodyAt(ch, BOB);
  P.ta = a + stride * lerp(B.turn[0], B.turn[1], run) * g * held + twist + stance;
  P.ha = a + twist * 0.35;
  // standing around, the weight goes from one leg to the other (not the player: his stance answers the keys)
  const shift = ch.isPlayer ? 0 : (1 - g) * clamp(Math.sin(ch.world.time * 0.5 + ch.breath * 3) * 3, -1, 1);
  const sa = ch.strideA, lat = BOB.sway * B.sway * (1 - 0.5 * run) * g, fwd = B.lean * run * (ch.backward ? -0.4 : 1);
  P.tx = ch.lean.x - Math.cos(a) * back - Math.sin(a) * shift * 0.8 + Math.cos(sa) * fwd - Math.sin(sa) * lat;
  P.ty = ch.lean.y - Math.sin(a) * back + Math.cos(a) * shift * 0.8 + Math.sin(sa) * fwd + Math.cos(sa) * lat;
  const settle = Math.hypot(ch.lean.x, ch.lean.y);
  P.s = 1 + BOB.bob * lerp(B.bob[0], B.bob[1], run) * g + 0.012 * (1 - g) * Math.sin(ch.world.time * 2.3 + ch.breath)
    - dip - 0.008 * settle;
  P.lift = 0;
  P.legs = 0;
  P.tuck = 0;
  P.over = 0;

  // feet: along the way he goes, toes the way his hips face (ch.footA), each one planted then swung ahead; standing
  // still, the weight on one leg puts the other foot a little forward
  const fa = ch.footA, cf = Math.cos(fa), sf = Math.sin(fa), cs = Math.cos(sa), ss = Math.sin(sa);
  const wide = lerp(GAIT_WIDTH[0], GAIT_WIDTH[1], run);
  for (let i = 0; i < 2; i++) {
    const side = i ? 1 : -1, f = P.feet[i], F = i ? F1 : F0;
    const ly = side * (wide - 0.6 * F.lift), lx = F.x + (1 - g) * (0.8 + Math.max(0, -side * shift) * 1.3);
    f.x = lx * cs - ly * sf;
    f.y = lx * ss + ly * cf;
    f.a = fa + side * 0.1; // toes a little out
    f.lift = F.lift * g; f.heel = F.heel * g;
  }
  place(P.hl, P, a, hlx, hly);
  place(P.hr, P, a, hrx, hry);
  P.wpnOn = wpnOn;
  P.fist = wpnOn && fist;
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
  A.ha = lerpA(A.ha, B.ha, w);
  if (w > 0.5) { A.top = B.top; A.fist = B.fist; A.hand[0] = B.hand[0]; A.hand[1] = B.hand[1]; }
  for (let i = 0; i < 2; i++) {
    const f = A.feet[i], g = B.feet[i];
    f.x = lerp(f.x, g.x, w); f.y = lerp(f.y, g.y, w); f.a = lerpA(f.a, g.a, w);
    f.lift = lerp(f.lift, g.lift, w); f.heel = lerp(f.heel, g.heel, w);
    A.elb[i] = lerp(A.elb[i], B.elb[i], w);
  }
  for (const k of ['hl', 'hr', 'wpn', 'carry']) {
    const p = A[k], q = B[k];
    p.x = lerp(p.x, q.x, w); p.y = lerp(p.y, q.y, w); p.a = lerpA(p.a, q.a, w);
  }
  return A;
}

function copyPose(A, B) {
  A.tx = B.tx; A.ty = B.ty; A.ta = B.ta; A.s = B.s; A.lift = B.lift; A.legs = B.legs; A.tuck = B.tuck; A.over = B.over;
  A.ha = B.ha;
  for (let i = 0; i < 2; i++) { Object.assign(A.feet[i], B.feet[i]); A.hand[i] = B.hand[i]; A.elb[i] = B.elb[i]; }
  for (const k of ['hl', 'hr', 'wpn', 'carry']) Object.assign(A[k], B[k]);
  A.wpnOn = B.wpnOn; A.carryImg = B.carryImg; A.fist = B.fist;
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
    const sa = 2.05, off = spriteW(sprite(d.sprite)) * 0.5 - d.grip;
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
  V.carryImg = null;
  for (let i = 0; i < 2; i++) {
    const side = i ? 1 : -1, lx = i ? 12 : 13.5, ly = side * 3.5, f = V.feet[i];
    f.x = V.tx + lx * c - ly * s; f.y = V.ty + lx * s + ly * c; f.a = ch.angle;
  }
  for (const [h, side] of [[V.hl, -1], [V.hr, 1]]) {
    h.x = V.tx - c - s * side * 9; h.y = V.ty - s + c * side * 9;
    reach(h, V, side);
  }
  // a weapon in his right hand lies on the floor under it, pointing ahead; while that hand drinks, it lets go of it
  V.wpn.x = V.hr.x; V.wpn.y = V.hr.y; V.wpn.a = ch.angle + 0.35; V.wpnLen = 1; V.wpnS = 1;
  V.fist = V.fist && !ch.swig;
  if (ch.swig) swigPose(ch, V);
  blendPose(P, V, w);
  P.carryImg = w > 0.5 ? V.carryImg : null; // the bottle: his as long as he sits
  return P;
}

// The bottle he finishes first (Player.swig, GESTURE.swig), in his right hand: on his thigh, up to his mouth (he
// tips back with each gulp), down again, drawn back behind him, flung at the wall across; then the empty hand
// comes back down. [x, y, the bottle's turn] of the hand in his frame at each of those.
const SWIG = { lap: [5, 4.5, 0.3], mouth: [7, 1.2, Math.PI - 0.35], back: [-2.5, 7.5, 2.2], out: [10.5, 1.5, 0] };
function swigPose(ch, V) {
  const g = ch.swig, T = GESTURE.swig, t = g.t, a = ch.angle;
  const drink = smooth((t - T.drink[0]) / 0.28) * (1 - smooth((t - T.drink[1]) / 0.24));
  const back = smooth((t - T.back[0]) / (T.back[1] - T.back[0])), fling = clamp((t - T.back[1]) / (T.throw - T.back[1]), 0, 1) ** 2;
  const settle = smooth((t - T.throw) / (T.end - T.throw));
  const held = (i) => lerp(lerp(lerp(SWIG.lap[i], SWIG.mouth[i], drink), SWIG.back[i], back), SWIG.out[i], fling);
  // each gulp tips him back a little; the throw takes his shoulders forward
  const gulp = drink * Math.max(0, Math.sin(((t - T.drink[0]) / (T.drink[1] - T.drink[0])) * Math.PI * T.gulps)) * 0.9;
  const lean = gulp - 1.5 * fling * (1 - settle);
  V.tx -= Math.cos(a) * lean; V.ty -= Math.sin(a) * lean;
  place(V.hr, V, a, lerp(held(0), SWIG.lap[0], settle), lerp(held(1), SWIG.lap[1], settle));
  reach(V.hr, V, 1);
  if (g.thrown) return;
  V.carryImg = spriteOpt('items/bottle');
  V.carry.x = V.hr.x; V.carry.y = V.hr.y; V.carry.a = a + held(2);
}

// ---------------- at his post (Enemy.postBody, data/posts.js) ----------------
// The standing pose bent by the gesture of the moment (leant over, twisted, the weight on one leg, a foot out), then
// blended (B.w 0..1) into the way he is at it: sat slumped on a couch, legs out; leant back in an armchair, both feet
// up on the desk, ankles crossed; his back flat against a wall, a sole up on it. B.w runs back to 0 as he gets up:
// the legs come back under him and he stands. B: { base, w, fwd, side, twist, dip, foot, hands, wpn, rest } (see
// Enemy.postBody); hands and wpn in his torso's frame, rest (where his weapon lies) in the pose's.
const BASES = {
  // torso pulled back toward the backrest (px), how much lower (smaller) he is, where the feet go [x, y] each
  seat: { back: 3, s: 0.9, feet: [[12.5, -5], [11.8, 4.6]], legs: 1 },
  desk: { back: 4.5, s: 0.86, feet: [[15.5, 1.6], [17, -1.1]], legs: 1 }, // pose px: x BODY_SCALE they reach the desk, no further
  wall: { back: 1.5, s: 1, feet: [[2, -3.6], [-3.5, 4.4]], legs: 0 },
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
  const a = ch.angle, c = Math.cos(a), s = Math.sin(a);
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
  }
  if (B.wpn && P.wpnOn) {
    // his weapon in his hands at it (a blade cleaning his nails, a club tossed and caught)
    place(P.wpn, P, P.ta, B.wpn.x, B.wpn.y);
    P.wpn.a = P.ta + B.wpn.a; P.wpnLen = B.wpn.len; P.wpnS = B.wpn.s; P.top = B.wpn.top;
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

// ---------------- finishing a man on the floor (Player.execution, data/finishers.js) ----------------
// The player set on a man who is down, his head ahead of him (x forward in what follows). Every beat is an
// anticipation that ends on its blow: u = 0..1 through the wait, the blow at 1; hit = s since the last one landed.
//   gouge     kneeling astride him, both hands take his head, the thumbs are driven in (he bears down, shaking), then
//             the head is lifted and beaten on the floor
//   frenzy    kneeling astride him, the left hand at his throat, the blade raised by the shoulder and driven into his
//             chest again and again, the shoulders rocking with it
//   smash     standing over him, a foot on his chest, the weapon raised over the head with both hands (it points
//             back, up toward the eye) and brought down: on his head, or through him when it stays planted
//   headshot  standing over him, a foot on his chest, the gun brought down on his head at arm's length, held, fired:
//             the arm kicks back
const KNEES = [[-6, -7.5], [-6, 7.5]], STANCE = [[8, -2.5], [-4, 4]]; // where the feet go, kneeling / a foot on him
const in2 = (k) => { k = clamp(k, 0, 1); return k * k; };

export function execPose(ch, P, V) {
  const ex = ch.execution, f = ex.f;
  if (!f.pose || !ex.at) return P; // the standing strikes
  const a = ex.face, c = Math.cos(a), s = Math.sin(a), d = ch.def;
  const [wait, what] = f.beats[ex.i], u = ex.done ? 1 : clamp(ex.t / wait, 0, 1), first = ex.i === 0;
  const thud = Math.exp(-ex.hit * 14); // the blow that just landed, dying away
  // into the pose as he sets himself, out of it at the very end
  const m = smooth(ex.age / EXEC.mount) * (ex.done ? 1 - smooth((ex.t / (f.after || 1) - 0.6) / 0.4) : 1);
  copyPose(V, P);
  V.ta = V.ha = a;
  V.top = 0;
  const kneel = f.mount === 'astride';
  (kneel ? KNEES : STANCE).forEach(([lx, ly], i) => { const ft = V.feet[i]; ft.x = lx * c - ly * s; ft.y = lx * s + ly * c; ft.a = kneel ? a + Math.PI : a; });
  V.legs = kneel ? 1 : 0.7;
  let lean = 0, size = kneel ? 0.9 : 1, twist = 0;
  const hands = (lx, ly, rx, ry) => { place(V.hl, V, V.ta, lx, ly); place(V.hr, V, V.ta, rx, ry); };
  const torso = () => { V.ta = a + twist; V.tx = c * lean; V.ty = s * lean; V.s = P.s * size * (1 - 0.04 * thud); };
  if (f.pose === 'gouge') {
    let fwd = 10.5, gap = 2.3, shake = 0;
    lean = 3;
    if (what === 'grab') { const k = smooth(u); fwd = lerp(5, 10.5, k); gap = lerp(5, 2.3, k); lean = 3 * k; }
    else if (what === 'press') { const k = smooth(u); lean = 3 + 1.6 * k; gap = 2.3 - k; shake = Math.sin(ex.age * 70) * 0.4 * k; size -= 0.03 * k; }
    else if (u < 0.6) { const k = smooth(u / 0.6); fwd = 10.5 - 3 * k; lean = 3 - 2 * k; size += 0.04 * k; } // the head lifted ...
    else { const k = in2((u - 0.6) / 0.4); fwd = 7.5 + 4.5 * k; lean = 1 + 4 * k; size += 0.04 - 0.09 * k; }   // ... and beaten down
    torso();
    hands(fwd + shake, -gap, fwd - shake, gap);
  } else if (f.pose === 'frenzy') {
    // the knife hand: up by the shoulder (0) .. buried in him (1)
    let down = 0;
    if (what === 'pin') down = 0;
    else if (ex.i === 1) down = in2((u - 0.5) / 0.5);                     // the first one comes from the raised hand
    else down = u < 0.5 ? 1 - smooth(u / 0.5) : in2((u - 0.5) / 0.5);
    if (ex.done) down = 1;
    const k = first ? smooth(u) : 1;
    lean = (2.5 + 2 * down) * k;
    twist = (0.2 - 0.42 * down) * k;
    torso();
    hands(lerp(4, 7.5, k), lerp(-5, -2.5, k), lerp(0.5, 7, down), lerp(6.5, 1.2, down));
    V.wpn.x = V.hr.x; V.wpn.y = V.hr.y; V.wpn.a = a + lerp(0.35, -0.1, down);
    V.wpnLen = lerp(0.5, 0.3, down); V.wpnS = lerp(1.3, 1, down);
    V.top = down < 0.5 ? 1 : 0;
  } else if (f.pose === 'smash') {
    // the weapon: lying on him (0) .. raised over the head (1)
    let up;
    if (u < 0.62) up = smooth(u / 0.62);
    else up = 1 - in2((u - 0.62) / 0.38);
    if (ex.done) up = 0;
    const from = first && u < 0.62 ? smooth(u / 0.3) : 1; // out of the standing pose at the very start
    lean = lerp(3.5, -1.5, up) * from;
    size += 0.03 * up - 0.04 * (1 - up) * from;
    torso();
    const hx = lerp(9, -1.5, up), hy = lerp(1.2, 1.6, up);
    hands(lerp(5, hx - 1.5, from), lerp(-5, -hy, from), hx, hy);
    V.wpn.x = V.hr.x; V.wpn.y = V.hr.y; V.wpn.a = a;
    V.wpnLen = lerp(f.plant ? 0.35 : 1, -0.6, up); V.wpnS = 1 + 0.35 * up;
    V.top = up > 0.45 ? 2 : 0;
  } else {
    const k = smooth(u / 0.45), kick = ex.done ? Math.exp(-ex.t * 9) : 0, two = d.hold === 'two';
    lean = 2 * k - 2.5 * kick;
    size += 0.03 * kick;
    torso();
    const rx = lerp(6, two ? 9.5 : 10.5, k) - 3.5 * kick, tremble = Math.sin(ex.age * 50) * 0.15 * k * (1 - kick);
    if (two) hands(lerp(5, 6.5, k) - 3 * kick, lerp(-4, -1.2, k), rx, 1.2 + tremble);
    else hands(lerp(4, 1.5, k), lerp(-5, -7.5, k), rx, 0.8 + tremble);
    V.wpn.x = V.hr.x; V.wpn.y = V.hr.y; V.wpn.a = a;
    V.wpnLen = lerp(1, 0.7, k) - 0.2 * kick; V.wpnS = 1 + 0.12 * kick;
  }
  reach(V.hl, V, -1);
  reach(V.hr, V, 1);
  if (V.wpnOn) { V.wpn.x = V.hr.x; V.wpn.y = V.hr.y; }
  V.carryImg = null;
  blendPose(P, V, m);
  P.legs = V.legs * m;
  return P;
}

// ---------------- given up (Enemy.surrender) ----------------
// On his knees: the shins flat on the floor behind him, knees together, the feet turned back (pose px, aim frame);
// the hands up either side of his head are the standing pose's for a man who has given up (standPose).
const YIELD_FEET = [[-6.5, -3.4], [-6.5, 3.4]];
export function kneelPose(P) {
  const c = Math.cos(P.ta), s = Math.sin(P.ta);
  YIELD_FEET.forEach(([lx, ly], i) => {
    const f = P.feet[i];
    f.x = lx * c - ly * s; f.y = lx * s + ly * c; f.a = P.ta + Math.PI; f.lift = 0; f.heel = 0;
  });
  P.legs = 1;
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

// ---------------- rendering ----------------
const TMP = { x: 0, y: 0 };

// the weapon at torso-local point `at` (where the hand holds it: weapons.js grip, palm); a handgun in the fist is drawn
// canted, all that is in the fist taken out (render/HandgunArt.js); over the shoulders it casts a little shadow on them
function drawWeapon(ctx, P, d, ta, at, shadow) {
  const src = sprite(d.sprite), k = src.k || 1, img = canted(d, P.fist) ? cantedGun(src, d) : src;
  const len = Math.sign(P.wpnLen || 1) * Math.max(0.15, Math.abs(P.wpnLen));
  for (let i = shadow ? 0 : 1; i < 2; i++) {
    ctx.save();
    ctx.translate(at.x + (i ? 0 : 1.5), at.y + (i ? 0 : 1.5));
    ctx.rotate(P.wpn.a - ta);
    ctx.scale(len * k, P.wpnS * k); // k: the weapon is a finer sprite (Assets.js `density`); d.grip is in world px
    if (!i) ctx.globalAlpha *= 0.3;
    ctx.drawImage(i ? img : silhouette(img), -d.grip / k, -img.height / 2 - palmOf(d, P.fist) / k);
    ctx.restore();
  }
}

// The limbs under the torso, painted as pixels (render/LimbArt.js): the legs from the hips to the feet, then the
// arms, each bent at an elbow found from where its hand is (the bend goes out to the side and toward the floor: the
// nearer the hand comes, the shorter the arm shows). Leaves the elbows in ELB for the hands' turn.
const SJ = { x: 0, y: 0 }, EJ = { x: 0, y: 0 }, WJ = { x: 0, y: 0 }, ELB = [{ x: 0, y: 0 }, { x: 0, y: 0 }];

function paintLegs(ch, P, up = 0) {
  const f0 = P.feet[0], f1 = P.feet[1];
  const ha = Math.atan2(Math.sin(f0.a) + Math.sin(f1.a), Math.cos(f0.a) + Math.cos(f1.a));
  const hx = P.tx * 0.6, hy = P.ty * 0.6, ox = -Math.sin(ha) * LIMB.hip, oy = Math.cos(ha) * LIMB.hip;
  // the far foot first: the one further back goes under the other where they cross
  const order = f0.lift > f1.lift ? [1, 0] : [0, 1];
  for (const i of order) {
    const f = P.feet[i], side = i ? 1 : -1;
    paintLeg(ch.look, hx + ox * side, hy + oy * side, f, Math.max(f.lift, up), f.heel);
  }
}

function paintArms(ch, P) {
  const ta = P.ta, c = Math.cos(ta), sn = Math.sin(ta), s = P.s, Lu = LIMB.upper * s, Lf = LIMB.fore * s;
  for (let i = 0; i < 2; i++) {
    const side = i ? 1 : -1, H = i ? P.hr : P.hl;
    SJ.x = P.tx + (LIMB.sx * c - side * LIMB.sy * sn) * s;
    SJ.y = P.ty + (LIMB.sx * sn + side * LIMB.sy * c) * s;
    let dx = H.x - SJ.x, dy = H.y - SJ.y, d = Math.hypot(dx, dy) || 1e-6;
    // the wrist, a little short of the middle of the fist
    WJ.x = H.x - (dx / d) * 0.9 * s; WJ.y = H.y - (dy / d) * 0.9 * s;
    dx = WJ.x - SJ.x; dy = WJ.y - SJ.y; d = Math.hypot(dx, dy) || 1e-6;
    const ux = dx / d, uy = dy / d;
    if (d >= Lu + Lf) { EJ.x = SJ.x + ux * Lu; EJ.y = SJ.y + uy * Lu; }
    else {
      const along = clamp((d * d + Lu * Lu - Lf * Lf) / (2 * d), -Lu, Lu);
      const h = Math.sqrt(Math.max(0, Lu * Lu - along * along)) * P.elb[i];
      // the elbow out to his side and back, whichever way round the line from the shoulder that is
      const ox = -side * sn - c * 0.9, oy = side * c - sn * 0.9;
      const k = -uy * ox + ux * oy >= 0 ? 1 : -1;
      EJ.x = SJ.x + ux * along - uy * h * k; EJ.y = SJ.y + uy * along + ux * h * k;
    }
    ELB[i].x = EJ.x; ELB[i].y = EJ.y;
    paintArm(ch.look, SJ, EJ, WJ);
  }
}

// Both hands on a pistol (weapons.js 'both'): its gun hand on the grip and the other one by it, closed over it (any
// pose that takes the other hand away, a reload, a vault, an execution, parts them). The hands are painted in that
// order then, the other one last.
const CUP_NEAR = 2.5, HANDS_ORDER = [0, 1], HANDS_CUP = [1, 0];
const cupped = (ch, P) => P.wpnOn && ch.def.hold === 'both' && Math.hypot(P.hl.x - P.hr.x, P.hl.y - P.hr.y) < CUP_NEAR * P.s;

// hand i (0 left, 1 right) of pose P, at the pose's centre (x, y), turned along its forearm (or laid flat); closed
// on a handgun's grip (or both on a pistol's, cup), it is turned with the gun, the knuckles across it, and covers
// what is in it
function paintHand(ctx, ch, P, i, x, y, cup) {
  const H = i ? P.hr : P.hl, E = ELB[i], flat = P.flat === (i ? 'hr' : 'hl'), fist = i && P.fist && P.wpnOn;
  const grip = fist || cup;
  const a = flat ? P.flatA : grip ? P.wpn.a : Math.atan2(H.y - E.y, H.x - E.x);
  drawHand(ctx, ch.look, flat ? 'flat' : grip ? 'fist' : P.hand[i], i ? 1 : -1, x + H.x, y + H.y, a, P.s * (fist ? SIDE.fist : 1));
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

// The frame a character is drawn in: the world's, scaled about his feet (Config BODY_SCALE). Whatever is drawn from
// pose numbers (the pose itself, what he holds, a glint on his weapon) goes inside it, between save and restore.
export function bodyFrame(ctx, ch) {
  ctx.translate(ch.x, ch.y);
  ctx.scale(BODY_SCALE, BODY_SCALE);
  ctx.translate(-ch.x, -ch.y);
}

export function drawPose(ctx, ch, P, alpha = 1) {
  ctx.save();
  bodyFrame(ctx, ch);
  paintPose(ctx, ch, P, alpha);
  ctx.restore();
}

function paintPose(ctx, ch, P, alpha) {
  const x = ch.x, y = ch.y, s = P.s, ta = P.ta;
  const bx = x + P.tx, by = y + P.ty;
  const ga = ctx.globalAlpha;
  if (alpha !== 1) ctx.globalAlpha = ga * alpha;
  // the head on the neck, turned toward the aim, bobbing less than the shoulders; hidden in a ball
  const ha = ta + clamp(angDiff(ta, P.ha), -1, 1), hs = 1 + (s - 1) * 0.6, head = 1 - smooth(P.tuck * 2);
  const hx = bx + Math.cos(ta) * LIMB.neck * s, hy = by + Math.sin(ta) * LIMB.neck * s;

  // shadow: further away, larger and softer as the body rises
  const sh = silhouette(ch.torso), shh = silhouette(ch.head), lift = P.lift;
  const ox = 2 + lift * 4, oy = 2 + lift * 5, sa = 0.35 * (1 - 0.35 * lift);
  if (lift > 0.05) {
    for (const j of [-1, 1]) {
      drawSprite(ctx, sh, bx + ox + 0.7 * j, by + oy + 0.5 * j, ta, sa * 0.55, s * 1.05);
      if (head > 0.5) drawSprite(ctx, shh, hx + ox + 0.7 * j, hy + oy + 0.5 * j, ha, sa * 0.55, hs * 1.05);
    }
  } else {
    drawSprite(ctx, sh, bx + ox, by + oy, ta, sa, s);
    if (head > 0.5) drawSprite(ctx, shh, hx + ox, hy + oy, ha, sa, hs);
  }

  // legs and arms, under the weapon and the torso
  beginLimbs(ta);
  if (P.over <= 0.35) paintLegs(ch, P);
  paintArms(ch, P);
  flushLimbs(ctx, x, y);

  // the weapon and what is carried, in the torso frame
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
  ctx.restore();
  // a pistol in both hands: the other hand closed over the gun hand
  const cup = cupped(ch, P);
  for (const i of cup ? HANDS_CUP : HANDS_ORDER) if (i ? !P.top : P.top < 2) paintHand(ctx, ch, P, i, x, y, cup);

  if (P.tuck > 0.02) drawTucked(ctx, ch, P, bx, by);
  else drawSprite(ctx, ch.torso, bx, by, ta, 1, s);
  if (head > 0) drawSprite(ctx, ch.head, hx, hy, ha, head, hs);
  if (P.over > 0.35) { beginLimbs(ta); paintLegs(ch, P, 0.15 * P.over); flushLimbs(ctx, x, y); } // up over the body
  if (P.top) {
    // what is held above the shoulders goes over them
    if (armed) {
      ctx.save();
      ctx.translate(bx, by);
      ctx.rotate(ta);
      ctx.scale(s, s);
      drawWeapon(ctx, P, d, ta, toLocal(P.wpn, TMP), true);
      ctx.restore();
    }
    if (P.top > 1) paintHand(ctx, ch, P, 0, x, y, cup);
    paintHand(ctx, ch, P, 1, x, y, cup);
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
  // on his back, his head where the blow sent it (downAngle), his hips where the body's circle is
  const sc = 1 + 0.12 * (1 - fall), len = spriteW(ch.downImg);
  const dc = Math.cos(ch.downAngle), ds = Math.sin(ch.downAngle), mx = x + dc * len * 0.08, my = y + ds * len * 0.08;
  drawSprite(ctx, silhouette(ch.downImg), mx + 2 + (1 - fall) * 2, my + 2 + (1 - fall) * 2, ch.downAngle, 0.35 * down, sc);
  drawSprite(ctx, ch.downImg, mx, my, ch.downAngle, down, sc);
  if (ch.asleep) return;
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
