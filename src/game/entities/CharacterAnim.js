// Procedural character animation shared by the player and enemies.
// Each frame a character builds a pose: plain numbers (torso offset / angle / scale, feet, hands, weapon), all stored as
// offsets from the body centre in world orientation. Traversal poses (vault, ladder, roll, slide) are blended over the
// standing pose so moves start and end exactly on the walk cycle (no popping). drawPose() then paints shadow, feet,
// arms, torso.
// Optional on a character: stow / lower (how the weapon is carried, ai/Carry.js) and busyHands() (where hands taken
// by something else are: a pastime, a cigarette, a panic), facing (entities/Facing.js: the drawn layers turning
// about the aim, the planted feet), talk (a line just said: Character.speak) and mood() (how fright or tension
// bends him: { hunch, duck, lift, lean, look, twist, shake }).
// A weapon's trail through a blow is not drawn here but over the lighting (fx/CombatFx.js sampleSmear).
import { PALETTE, TAKEDOWN, BODY_SCALE } from '../Config.js';
import { TELL, GESTURE, RELOAD, FLINCH, FACING, TRAVERSE, feelOf } from '../data/feel.js';
import { EXEC } from '../data/finishers.js';
import { slamAt } from '../systems/Takedown.js';
import { sprite, spriteOpt, drawSprite, silhouette, sw as spriteW, sh as spriteH } from '../../engine/Assets.js';
import { lerp, clamp, angDiff } from '../../engine/math.js';
import { GAIT, stanceAt, reachAt, footAt, phaseOf, bodyAt } from './Gait.js';
import { beginLimbs, flushLimbs, paintLeg, paintArm, drawHand } from '../render/LimbArt.js';
import { cantedGun, cantPalm, CANT } from '../render/HandgunArt.js';
import { recoilAt } from './Recoil.js';
import { stepLean } from './Facing.js';
import { drawPhases, talkAt, talkHand } from './Gesture.js';

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
// standing / walking / running (0 .. 1); overlap: how far free hands are carried past the torso when it is thrown
// by a change of speed (Character.carryTorso: they trail into a start, swing on past a stop)
const HANDS = { stand: [4.6, -6.6], walk: [0.6, -7.4], run: [2.2, -6.2], swing: [4.6, 4.8], elbow: [0.35, 0.15, 0.4], overlap: 0.7 };
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
// the gun pointing at the floor ahead (turned out, foreshortened); the kick (entities/Recoil.js) throws the muzzle
// toward the slide's top and the fist back along the arm (`up`: the share of it that goes toward the other shoulder);
// the hand closed round the grip is a little bigger than an empty fist
const SIDE = { aim: [10, 4.3], clear: 5, elb: 0.5, twist: -0.3, low: [4.2, 8.4], lowA: 0.35, lowLen: 0.55, up: 0.3, fist: 1.1 };
const sideReach = (d) => Math.max(SIDE.aim[0], d.grip + SIDE.clear);
// a pistol held out in both hands (weapons.js 'both'): the gun hand on a target (aim-space px), the other hand closed
// over it on the butt (`cup`: from the gun hand, in the gun's frame), how far the elbows go out (left, right); running,
// the hands come in toward the chest by `run` px; held low (low ready), the hands in before the belly, the muzzle
// pointing at the floor ahead (turned out, foreshortened); the kick (entities/Recoil.js) lifts the muzzle at the eye
// and over toward the top of the slide; reloading, the gun hand comes in to `reload`
const PAIR = {
  aim: [11, 3.2], cup: [0.5, -1.3], elb: [0.2, 0.3], run: 2.5, low: [7, 3], lowA: 0.25, lowLen: 0.6,
  reload: [8, 2],
};
// working a shotgun's action after its last shell: where the free hand takes its bolt handle, on its right side (in
// the gun's frame, from the gun hand: x along the barrel, y to its right); a magazine gun's is its own (weapons.js rack)
const BOLT = [3, 1.6];
// reloading: where the free hand goes to the belt for a fresh magazine or round (aim space), how far it draws a
// magazine out, and how far under the well (px past the magazine's length) it swings up from
const POUCH = { at: [1, -6.5], draw: [2.5, 0.5], under: 5 };
// a man flinching from a round (systems/Flinch.js): his empty hands come up before his face
const GUARD = [5.5, 3.2];
// a long weapon on the back: where the hand takes its sling, over the right shoulder (aim space)
const SLING = [-0.5, 6.4];
const NO_KICK = { hands: 0, flip: 0, rise: 0, torso: 0, rock: 0, sink: 0, elbow: 0, bx: 0, by: 0 };

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
export function muzzleIn(P, d, w, out) { return boreIn(P, d, muzzleX(d, w), out); }

// the point `along` world px from the hand down the bore line (the ejection port: d.eject - d.grip), as drawn in P
export function boreIn(P, d, along, out) {
  onGun(d, P.fist, d.grip + along, d.bore ?? 0, P.wpn.x, P.wpn.y, P.wpn.a, drawnLen(P) * P.s, P.wpnS * P.s, out);
  out.a = P.wpn.a;
  return out;
}

const drawnLen = (P) => Math.sign(P.wpnLen || 1) * Math.max(0.15, Math.abs(P.wpnLen));

// A point of gun d's sprite (x world px from its left, y off its middle line, + toward the grip, as weapons.js gives
// them) where its hand holds it at (gx, gy), turned ga, drawn len long and thick wide (canted in the fist, its side
// squashed toward the bore as render/HandgunArt.js draws it)
function onGun(d, fist, x, y, gx, gy, ga, len, thick, out) {
  const bore = d.bore ?? 0, cy = canted(d, fist) ? bore + (y - bore) * CANT.f : y;
  const u = (x - d.grip) * len, v = (cy - palmOf(d, fist)) * thick, c = Math.cos(ga), s = Math.sin(ga);
  out.x = gx + u * c - v * s; out.y = gy + u * s + v * c;
  return out;
}

// the way out of gun d's magazine well (weapons.js `well`, its rake) in that frame: a world px along it
function wellWay(d, ga, len, thick, out) {
  const r = d.well[2], u = Math.sin(r) * len, v = Math.cos(r) * thick, c = Math.cos(ga), s = Math.sin(ga);
  out.x = u * c - v * s; out.y = u * s + v * c;
  return out;
}

// The old magazine of gun d as it leaves the well in pose P (pose px about the feet, the caller scales by
// BODY_SCALE): its middle just clear of the mouth and the angle its picture is turned to (Character.dropMag)
export function looseMagIn(P, d, out) {
  const img = spriteOpt(d.magSprite), len = drawnLen(P) * P.s, thick = P.wpnS * P.s;
  onGun(d, P.fist, d.well[0], d.well[1], P.wpn.x, P.wpn.y, P.wpn.a, len, thick, out);
  wellWay(d, P.wpn.a, len, thick, WAY);
  const half = (img ? spriteH(img) : 0) / 2;
  out.x += WAY.x * half; out.y += WAY.y * half; out.a = Math.atan2(WAY.y, WAY.x) - Math.PI / 2;
  return out;
}
const WAY = { x: 0, y: 0 }, MOUTH = { x: 0, y: 0 }, AT = { x: 0, y: 0 }, TO = { x: 0, y: 0 };

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
    sq: 1, sqW: 1, sqA: 0, // the curled body's length along axis sqA and its width across it (a roll seen from above)
    ha: 0,            // where the head looks: it keeps to the aim while the shoulders turn under it
    feet: [pt(), pt()],
    hand: ['loose', 'loose'], elb: [0.45, 0.45], // how each hand is ('fist' | 'loose' | 'flat'), elbows out 0 .. 1
    hl: pt(), hr: pt(), wpn: pt(), carry: pt(),
    wpnOn: false, carryImg: null,
    bare: false,      // the gun drawn with its magazine out (weapons.js `_bare` sprite)
    magIn: null,      // a magazine half in its well (world px of it still in: it slides out, or is pushed home)
    fist: false,      // the right hand closed on a handgun's grip (what is in the fist is not drawn)
    flat: null, flatA: 0, // the hand laid flat on something ('hl' | 'hr') and the angle of that surface
    // weapon foreshortening (-1 pointing back .. 1), its swelling when it comes up toward the camera, and what is held
    // above the shoulders: 0 nothing, 1 the weapon and its hand, 2 both hands
    wpnLen: 1, wpnS: 1, top: 0,
    duck: 0, hunch: 0, // flinching: the head ducked in (0 .. 1 of it), the shoulders hunched (narrower by that share)
    bow: 0,           // bent at the waist (0 .. 1, BOW; < 0: the head thrown back): the head ahead and lower, the back long
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
const FH = { x: 0, y: 0 }, PH = {}, LEAN = { x: 0, y: 0 };

// how far into his flinch a man is (0 .. 1 of its strength): in at once, out slowly
export function flinchAt(ch) {
  if (!(ch.flinch > 0)) return 0;
  const u = 1 - ch.flinch / FLINCH.dur;
  return ch.flinchK * smooth(u / 0.12) * (1 - smooth((u - 0.3) / 0.7));
}

// a: facing angle; left out, the body is drawn in its layers about ch.angle (ch.facing: head, shoulders, planted
// feet), the hands and the weapon kept to the aim
export function standPose(ch, P, a) {
  const F = a === undefined ? ch.facing : null;
  if (a === undefined) a = ch.angle;
  // the shoulders, the hands' frame (on the aim, no further than FACING.hands off the shoulders), the head
  const sh = F ? F.sh : a, head = F ? F.head : a;
  a = F ? sh + clamp(angDiff(sh, a), -FACING.hands, FACING.hands) : a;
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
  // the kick of the last shot (entities/Recoil.js, the family's profile in data/feel.js)
  const K = d.kind === 'gun' && ch.recoil > 0 ? recoilAt(feelOf(d).recoil, ch.recoil, ch.world.time, ch.breath) : NO_KICK;
  let twist = 0, back = 0, dip = 0, len = 1, thick = 1, top = 0;

  // aim-space hands / weapon (x forward, y right)
  let hlx, hly, hrx, hry, wx = 0, wy = 0, wa = 0, wpnOn = false;
  let carryImg = null, cx = 0, cy = 0, ca = 0, magIn = null;
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
      // given up: open hands held up either side of the head, shaking unevenly, each his own way
      const t = ch.world.time, b = ch.breath, sk = Math.sin(t * 23 + b) * 0.45 + Math.sin(t * 37 + b * 2) * 0.3;
      hlx = 3 + sk; hly = -9.5 + Math.sin(t * 29 + b) * 0.3; hrx = 3 - sk; hry = 9.5 + Math.sin(t * 31 + b * 3) * 0.3;
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
    // not on a target: a pistol before the belly and a machine pistol down by the thigh, pointing at the floor; a long
    // gun across the chest
    const low = smooth(ch.lower);
    wpnOn = true;
    wa = -K.flip; // muzzle climb
    back = K.torso;
    dip = K.sink;
    if (d.hold === 'both') {
      // the arms out in a narrow triangle, the gun hand on the grip, the other one closed over it (paintHand); the
      // kick throws the hands back and the muzzle up at the eye
      const S = PAIR;
      wa = -K.flip + S.lowA * low;
      hrx = lerp(S.aim[0] - S.run * run, S.low[0], low) - K.hands + K.bx; hry = lerp(S.aim[1], S.low[1], low) + K.by;
      wx = hrx; wy = hry;
      len = lerp(1, S.lowLen, low) * (1 - K.rise);
      const c = Math.cos(wa), sn = Math.sin(wa), ux = S.cup[0] * len;
      hlx = hrx + ux * c - S.cup[1] * sn; hly = hry + ux * sn + S.cup[1] * c;
      P.elb[0] = S.elb[0] + 0.3 * low + 0.5 * K.elbow; P.elb[1] = S.elb[1] + 0.2 * low + K.elbow;
    } else if (d.hold === 'side') {
      // in one hand, the elbow a little bent, the gun canted, the gun shoulder forward; the other arm hangs at his
      // side and swings with the stride. The kick throws the muzzle toward the top of the slide (sideways and up at
      // the eye, seen from above), the fist back along the arm, the elbow folding.
      const S = SIDE;
      wa = -K.flip + S.lowA * low;
      hrx = lerp(sideReach(d), S.low[0], low) - K.hands + K.bx; hry = lerp(S.aim[1], S.low[1], low) - S.up * K.hands + K.by;
      wx = hrx; wy = hry;
      len = lerp(1, S.lowLen, low) * (1 - K.rise);
      stance = S.twist * (1 - 0.6 * low);
      freeHand(-1, g, run, stride, FH);
      const c = Math.cos(stance), sn = Math.sin(stance); // at the side of the turned shoulders
      hlx = FH.x * c - FH.y * sn; hly = FH.x * sn + FH.y * c;
      if (g > 0.4 && run < 0.5) P.hand[0] = 'loose';
      P.elb[1] = lerp(S.elb, 0.12, low) + K.elbow;
    } else {
      // shouldered: the butt in the pocket of the right shoulder (on top of it for a launcher), the weapon along the
      // aim, the right hand on its grip, the left one on its forend; held low, it goes down across the body
      const S = SHOULDERED, up = d.onShoulder && low < 0.5, butt = d.butt ?? 0.5; // held low, a launcher too
      wa += S.lowA * low;
      const bx = (up ? S.onShoulder[0] : lerp(S.pocket[0], S.low[0], low)) - K.hands + K.bx;
      const by = (up ? S.onShoulder[1] : lerp(S.pocket[1], S.low[1], low)) + K.by;
      const c = Math.cos(wa), sn = Math.sin(wa);
      wx = bx + c * (d.grip - butt); wy = by + sn * (d.grip - butt);
      hrx = wx; hry = wy + 0.3;
      hlx = bx + c * (d.fore - butt); hly = by + sn * (d.fore - butt) - 0.2;
      stance = SHOULDERED.twist * (1 - 0.4 * low);
      if (!up) len = 1 - K.rise; // the muzzle comes up off the shoulder (a launcher's tube stays put)
      P.elb[0] = 0.3; P.elb[1] = 0.7;
      if (up) top = 1;
    }
    stance += K.rock;
    if (ch.reloading > 0) {
      const p = 1 - ch.reloading / ch.reloadDur;
      const [bx, by] = POUCH.at; // the belt
      if (d.shellReload) {
        // one round at a time: the free hand fetches it from the belt, brings it under the loading port (a launcher:
        // to the back of its tube), thumbs it home along the gun, goes back for the next one
        const L = RELOAD.shell, c = Math.cos(wa - 0.35), sn = Math.sin(wa - 0.35);
        const at = d.onShoulder ? -(d.butt ?? 0.5) - 3 : 3; // along the gun from the hand
        const px = wx + c * at - sn * 1.6, py = wy + sn * at + c * 1.6;
        const push = smooth((p - L.port) / (L.push - L.port)) * 2.2;
        if (p < L.fetch) { const e = ch.shellsIn ? 1 : smooth(p / L.fetch); hlx = lerp(hlx, bx, e); hly = lerp(hly, by, e); }
        else if (p < L.port) { const e = easeOut((p - L.fetch) / (L.port - L.fetch)); hlx = lerp(bx, px, e); hly = lerp(by, py, e); }
        else if (p < L.push) { hlx = px + c * push; hly = py + sn * push; }
        else { const e = smooth((p - L.push) / (1 - L.push)); hlx = lerp(px + c * push, bx, e); hly = lerp(py + sn * push, by, e); }
        wa -= 0.35;
        if (p > L.fetch * 0.5 && p < L.push) {
          carryImg = spriteOpt(d.load); cx = hlx; cy = hly; ca = wa + (d.onShoulder ? 0 : Math.PI / 2); // across the port; a rocket along the tube
        }
      } else {
        // the old magazine slides out of the well and falls (Character.dropMag); the free hand fetches a fresh one from
        // the belt, brings it up under the well, pushes it home, then works the action along the gun's `rack` path and
        // goes back. The gun tips in meanwhile (a handgun comes in before the chest), is held out to be worked, and
        // gives to the shove and to the hand on its action.
        const L = RELOAD.mag, side = d.hold === 'side', both = d.hold === 'both', stage = ch.reloadStage;
        const tilt = smooth(p < L.tilt[0] ? p / L.tilt[0] : p > L.tilt[1] ? (1 - p) / (1 - L.tilt[1]) : 1);
        const work = smooth((p - L.seat) / (L.rack[0] - L.seat)) * (1 - smooth((p - L.rack[1]) / (1 - L.rack[1])));
        wa -= 0.55 * tilt;
        if (side) { wx = lerp(wx, d.grip + 4.5, tilt); wy = lerp(wy, 2.6, tilt); P.elb[1] = lerp(P.elb[1], 0.6, tilt); }
        else if (both) { wx = lerp(wx, PAIR.reload[0], tilt); wy = lerp(wy, PAIR.reload[1], tilt); P.elb[1] = lerp(P.elb[1], 0.5, tilt); }
        else wx -= 1.5 * tilt;
        wx += Math.cos(wa) * work * L.reach[side || both ? 0 : 1]; wy += Math.sin(wa) * work * L.reach[side || both ? 0 : 1];
        const img = d.well && spriteOpt(d.magSprite), ml = img ? spriteH(img) : 0, depth = d.well ? d.well[3] : 0;
        const R = d.rack, n = R ? R.length - 1 : 0, u = clamp((p - L.rack[0]) / (L.rack[1] - L.rack[0]), 0, 1) * n;
        const i = Math.min(n - 1, Math.floor(u)), e = smooth(u - i);
        const rx = R ? lerp(R[i][0], R[i + 1][0], e) : 0, ry = R ? lerp(R[i][1], R[i + 1][1], e) : 0;
        if (img) {
          wellWay(d, wa, len, thick, WAY);
          const shove = bump(p, L.seat - 0.03, L.seat + 0.05) * L.push;
          const gu = (rx - R[0][0]) * L.give[0], gv = (ry - R[0][1]) * L.give[1];
          wx += Math.cos(wa) * gu - Math.sin(wa) * gv - WAY.x * shove; wy += Math.sin(wa) * gu + Math.cos(wa) * gv - WAY.y * shove;
        }
        if (!side && !both) { onGun(d, fist, d.fore, 0, wx, wy, wa, len, thick, AT); hlx = AT.x; hly = AT.y; } // the forend, tipped
        if (img) {
          // where the free hand goes: the pouch, the magazine's base (`dep` of it in the well; brought up from below it,
          // top first), the action
          onGun(d, fist, d.well[0], d.well[1], wx, wy, wa, len, thick, MOUTH);
          const base = (dep, out) => { out.x = MOUTH.x + WAY.x * (ml - dep); out.y = MOUTH.y + WAY.y * (ml - dep); return out; };
          const ox = bx + POUCH.draw[0], oy = by + POUCH.draw[1], hx = hlx, hy = hly;
          if (p < L.release) { /* still on the gun */ }
          else if (p < L.belt[0]) { const k = smooth((p - L.release) / (L.belt[0] - L.release)); hlx = lerp(hx, bx, k); hly = lerp(hy, by, k); }
          else if (p < L.belt[1]) { const k = smooth((p - L.belt[0]) / (L.belt[1] - L.belt[0])); hlx = lerp(bx, ox, k); hly = lerp(by, oy, k); }
          else if (p < L.insert) {
            // along a curve that swings under the well and comes up into it: the magazine in the hand, top first
            const k = easeOut((p - L.belt[1]) / (L.insert - L.belt[1])), j = 1 - k, q = base(-POUCH.under, TO), at = base(0, AT);
            hlx = j * j * ox + 2 * j * k * q.x + k * k * at.x; hly = j * j * oy + 2 * j * k * q.y + k * k * at.y;
            if (stage === 2) {
              let tx = j * (q.x - ox) + k * (at.x - q.x), ty = j * (q.y - oy) + k * (at.y - q.y);
              const tl = Math.hypot(tx, ty) || 1;
              tx /= tl; ty /= tl;
              carryImg = img; cx = hlx + tx * ml / 2; cy = hly + ty * ml / 2; ca = Math.atan2(-ty, -tx) - Math.PI / 2;
            }
          } else if (p < L.seat) { base(depth * smooth((p - L.insert) / (L.seat - L.insert)), AT); hlx = AT.x; hly = AT.y; }
          else {
            // from under the seated magazine to the action, along it, then back to its hold
            const k = smooth((p - L.seat) / (L.rack[0] - L.seat)), off = smooth((p - L.rack[1]) / (1 - L.rack[1]));
            base(depth, TO); onGun(d, fist, rx, ry, wx, wy, wa, len, thick, AT);
            hlx = lerp(lerp(TO.x, AT.x, k), hx, off); hly = lerp(lerp(TO.y, AT.y, k), hy, off);
          }
          // the old one sliding out (it falls by its weight, faster and faster), the fresh one going in
          if (stage === 1) magIn = depth * (1 - Math.min(1, ((p - L.release) / (L.drop - L.release)) ** 2));
          else if (stage === 2 && p >= L.insert) magIn = depth * smooth((p - L.insert) / (L.seat - L.insert));
        }
        hry = side || both ? wy : wy + 0.3;
      }
      hrx = wx;
    } else if (ch.racking > 0 && !d.onShoulder) {
      // the last shell in: the free hand goes to the bolt handle on the right of the receiver and works it
      const k = 1 - ch.racking / RELOAD.shell.racked, c = Math.cos(wa), sn = Math.sin(wa), [ux, uy] = BOLT;
      const on = Math.min(1, bump(k, 0, 1) * 1.6), pull = bump(k, 0.3, 0.85) * RELOAD.shell.pull;
      hlx = lerp(hlx, wx + (ux - pull) * c - uy * sn, on); hly = lerp(hly, wy + (ux - pull) * sn + uy * c, on);
      wx -= pull * 0.3;
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
    // put away: a pistol or a knife on the right hip, anything long across the back, both hands free. Drawn
    // (GESTURE.draw, Gesture.drawPhases), the hand goes to it, closes on it, pulls it out (a short one up out of
    // the holster, the muzzle to the floor; a long one swung round off the back to the right side), turns it up
    // onto its hold, and the other hand comes on it last. Put back, the same backwards.
    const long = d.hold === 'two' || d.swing === 'club', D = drawPhases(1 - ch.stow, PH), G = GESTURE.draw;
    let sx = -0.5, sy = 6.8, sa = 3, sl = 0.55; // on the hip: little more than the grip shows
    if (long) {
      const off = spriteW(sprite(d.sprite)) * 0.5 - d.grip;
      sa = 2.05; sx = -3 - Math.cos(sa) * off; sy = -Math.sin(sa) * off; sl = 1;
    }
    // out of it: where it is between the pull and the present, the way it points, how long it shows
    const mx = long ? 2 : 2.6, my = long ? 6.2 : 6.6, ma = long ? 0.95 : 1.3, ml = long ? 0.75 : 0.4;
    // (a long one off the back over the right shoulder first, then round the front)
    const out = D.pull, on = D.present, sweep = long ? 3.5 * bump(out, 0, 1) : 0;
    const px = lerp(sx, mx, out) + sweep, py = lerp(sy, my, long ? smooth(out / 0.45) : out), pa = lerpA(sa, ma, out), pl = lerp(sl, ml, out);
    const gx = hrx - wx, gy = hry - wy; // the gun hand on its hold, off the weapon's grip point
    const hlHold = hlx, hlyHold = hly;
    wx = lerp(px, wx, on); wy = lerp(py, wy, on); wa = lerpA(pa, wa, on); len = lerp(pl, len, on);
    if (on < 0.5) top = 0;
    freeHand(1, g, run, stride, FH);
    // the hand on it; a long one is taken by its sling at the right shoulder and swung round off it
    let tx = wx + gx * on, ty = wy + gy * on;
    if (long) { tx = lerp(SLING[0], tx, smooth(out / 0.6)); ty = lerp(SLING[1], ty, smooth(out / 0.6)); }
    hrx = lerp(FH.x, tx, D.reach); hry = lerp(FH.y, ty, D.reach);
    freeHand(-1, g, run, stride, FH);
    hlx = lerp(FH.x, hlHold, D.support); hly = lerp(FH.y, hlyHold, D.support);
    stance *= on;
    // the shoulder dropped to the holster while the hand is at it
    const at = D.reach * (1 - on);
    twist += (long ? -1 : 1) * G.dip[0] * at; dip += G.dip[1] * at;
    if (g > 0.4 && D.support < 0.5) P.hand[0] = 'loose';
    if (g > 0.4 && D.reach < 0.5) P.hand[1] = 'loose';
    if (D.grip < 0.5) fist = false; // not closed on it: the grip shows out of the holster
  }
  // hands taken by something else (a pastime, a cigarette, a chat, a panic): the character says where they are
  const busy = ch.busyHands?.();
  if (busy) { hlx = busy.hl.x; hly = busy.hl.y; hrx = busy.hr.x; hry = busy.hr.y; fist = false; }
  if (wpnOn && ch.pickAnim > 0) {
    // flashy pickup: the hand down to where it lay (ch.pickFrom), the body bent over it, then it twirls up into
    // the hand
    const k = ch.pickAnim / 0.35, down = ch.pickFrom ? smooth((k - (1 - GESTURE.draw.pick)) / 0.25) : 0;
    wa += k * k * Math.PI * 2;
    wx -= k * 3;
    dip = 0.05 * Math.sin(Math.PI * k) + 0.04 * down;
    if (down > 0) {
      const c = Math.cos(a), sn = Math.sin(a), ix = (ch.pickFrom.x - ch.x) / BODY_SCALE, iy = (ch.pickFrom.y - ch.y) / BODY_SCALE;
      const lx = clamp(ix * c + iy * sn, -2, 12), ly = clamp(-ix * sn + iy * c, -9, 11);
      wx = lerp(wx, lx, down); wy = lerp(wy, ly, down);
      back -= 1.8 * down;
    }
    hrx = wx; hry = wy + (d.hold === 'two' ? 0.3 : 0);
  }

  // flinching from a round that went by or struck close (systems/Flinch.js): the head ducked in, the shoulders hunched
  // and turned away from it, the body pulled off its way and lowered; empty hands come up before the face
  const fl = flinchAt(ch), FP = FLINCH.pose;
  if (fl) {
    twist += ch.flinchSide * FP.away * fl;
    dip += FP.dip * fl;
    if (d.hold === 'none' && !busy && !ch.yielded) {
      hlx = lerp(hlx, GUARD[0], fl); hly = lerp(hly, -GUARD[1], fl); hrx = lerp(hrx, GUARD[0], fl); hry = lerp(hry, GUARD[1], fl);
      P.hand[0] = P.hand[1] = 'loose';
    }
  }
  P.duck = FP.duck * fl; P.hunch = FP.hunch * fl;

  // a line just said (Character.speak): the free hand makes its gesture, the head nods or juts on the words
  let jut = 0;
  const tk = F && ch.talk ? talkAt(ch.talk.t) : 0;
  if (tk > 0) {
    const T = GESTURE.talk, t = ch.talk.t, gest = ch.talk.g, beat = Math.max(0, Math.sin(t * T.beat));
    const side = ch.yielded ? 0 : talkHand(busy, wpnOn && ch.stow < 0.5 ? { hold: d.hold, raised: ch.lower < 0.5 } : null);
    P.duck = Math.max(P.duck, T.head * beat * tk * (gest === 'nod' ? 1.6 : 1));
    if (gest === 'point') jut = 0.8 * tk;
    if (side) {
      const at = ch.talk.at;
      const rel = at ? clamp(angDiff(a, Math.atan2(at.y - ch.y, at.x - ch.x)), -1.2, 1.2) : side * 0.2;
      let gx = null, gy = 0, both = false, flat = false, fa = 0;
      if (gest === 'point') {
        const r = T.reach + 1.2 * beat;
        gx = Math.cos(rel) * r; gy = Math.sin(rel) * r + side * 2.5;
      } else if (gest === 'palm') { gx = 7.5 + 0.8 * beat; gy = side * 5; flat = true; fa = side * 0.5; }
      else if (gest === 'shrug') {
        const up = bump(t, 0.05, 0.8); // the shoulders up and the palms out, once
        gx = 3.5 + 1.5 * up; gy = side * (7.5 + 3 * up); both = flat = true; fa = side * 1.2;
        P.hunch = Math.max(P.hunch, 0.22 * up); P.duck = Math.max(P.duck, 0.25 * up);
      }
      else if (gest === 'wave') {
        const ang = side * (0.1 + 1.3 * smooth((t - 0.2) / 0.3));
        gx = 3 + Math.cos(ang) * 7; gy = side * 2 + Math.sin(ang) * 7; flat = true; fa = ang;
      } else if (gest === 'beckon') { const k = 0.5 + 0.5 * Math.sin(t * T.beat * 0.7); gx = lerp(10, 4.5, k); gy = side * 3.5; }
      else if (gest === 'hands') { gx = 5.5 + 0.4 * beat; gy = side * 4.5; both = flat = true; fa = side * 0.4; }
      if (gx !== null) {
        if (side > 0 || both) { hrx = lerp(hrx, gx, tk); hry = lerp(hry, side > 0 ? gy : -gy, tk); P.hand[1] = 'loose'; }
        if (side < 0 || both) { hlx = lerp(hlx, gx, tk); hly = lerp(hly, side < 0 ? gy : -gy, tk); P.hand[0] = 'loose'; }
        if (flat && tk > 0.5 && !both) { P.flat = side > 0 ? 'hr' : 'hl'; P.flatA = a + fa; }
        if (side > 0) fist = false;
      }
    }
  }
  // fright, tension (ch.mood: a passer-by in a panic, a man on his knees): the shoulders up, the head drawn in,
  // looking back, shaking
  const m = F && ch.mood?.();
  if (m) {
    P.hunch = Math.max(P.hunch, m.hunch || 0); P.duck = Math.max(P.duck, m.duck || 0);
    twist += m.twist || 0;
  }

  // torso: the shoulders turn against the hips with the stride (less with a weapon held on something), the body goes
  // over the planted foot, bobs (up over the foot walking, down onto it running), leans into a run, is carried by
  // a change of speed (Character.carryTorso), breathes standing; recoil pushes it back
  const B = BODY, held = d.hold === 'two' || d.hold === 'both' ? B.two : d.hold === 'side' ? B.gun : d.hold === 'melee' ? B.melee : 1;
  bodyAt(ch, BOB);
  P.ta = sh + stride * lerp(B.turn[0], B.turn[1], run) * g * held + twist + stance;
  P.ha = head + twist * 0.35 + (m?.look || 0);
  // standing around, the weight goes from one leg to the other (not the player: his stance answers the keys)
  const shift = ch.isPlayer ? 0 : (1 - g) * clamp(Math.sin(ch.world.time * 0.5 + ch.breath * 3) * 3, -1, 1);
  const sa = ch.strideA, lat = BOB.sway * B.sway * (1 - 0.5 * run) * g, fwd = B.lean * run * (ch.backward ? -0.4 : 1);
  const fb = fl * FP.back, ahead = jut + (m?.lean || 0), shake = m?.shake ? Math.sin(ch.world.time * GESTURE.panic.tremble.hz + ch.breath) * m.shake : 0;
  P.tx = ch.lean.x - Math.cos(a) * back - Math.sin(sh) * (shift * 0.8 + shake) + Math.cos(sa) * fwd - Math.sin(sa) * lat + Math.cos(ch.flinchA ?? 0) * fb + Math.cos(sh) * ahead;
  P.ty = ch.lean.y - Math.sin(a) * back + Math.cos(sh) * (shift * 0.8 + shake) + Math.sin(sa) * fwd + Math.cos(sa) * lat + Math.sin(ch.flinchA ?? 0) * fb + Math.sin(sh) * ahead;
  const settle = Math.hypot(ch.lean.x, ch.lean.y);
  P.s = (1 + BOB.bob * lerp(B.bob[0], B.bob[1], run) * g + 0.012 * (1 - g) * Math.sin(ch.world.time * 2.3 + ch.breath)
    - dip - 0.008 * settle) * (1 + (m?.lift || 0));
  P.lift = 0;
  P.legs = 0;
  P.tuck = 0;
  P.over = 0;
  P.sq = P.sqW = 1;
  P.bow = 0;

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
  // standing, the feet are where they were planted (entities/Facing.js), a step or a hop round under way
  const plantW = F?.feet ? smooth(F.plantW) : 0;
  if (plantW > 0) {
    for (let i = 0; i < 2; i++) {
      const f = P.feet[i], q = F.feet[i];
      f.x = lerp(f.x, (q.x - ch.x) / BODY_SCALE, plantW); f.y = lerp(f.y, (q.y - ch.y) / BODY_SCALE, plantW);
      f.a = lerpA(f.a, q.a, plantW); f.lift = lerp(f.lift, q.lift, plantW); f.heel = lerp(f.heel, q.heel, plantW);
    }
    stepLean(F, ch, LEAN);
    P.tx += LEAN.x * plantW; P.ty += LEAN.y * plantW;
    P.s *= 1 + FACING.hop.rise * F.hop * plantW;
  }
  // free hands overlap the torso's own swing (they are its, plus a little more of it)
  if (!busy && !ch.yielded && !striking && !tk) {
    const ox = (ch.lean.x * Math.cos(a) + ch.lean.y * Math.sin(a)) * HANDS.overlap, oy = (ch.lean.y * Math.cos(a) - ch.lean.x * Math.sin(a)) * HANDS.overlap;
    const free = !wpnOn || ch.stow >= 0.6 ? 2 : d.hold === 'side' || d.hold === 'melee' ? 1 : 0;
    if (free) { hlx += ox; hly += oy; }
    if (free > 1) { hrx += ox; hry += oy; }
  }
  place(P.hl, P, a, hlx, hly);
  place(P.hr, P, a, hrx, hry);
  P.wpnOn = wpnOn;
  P.fist = wpnOn && fist;
  P.wpnLen = len; P.wpnS = thick; P.top = top;
  if (wpnOn) { place(P.wpn, P, a, wx, wy); P.wpn.a = a + wa; }
  P.carryImg = carryImg;
  if (carryImg) { place(P.carry, P, a, cx, cy); P.carry.a = a + ca; }
  P.magIn = wpnOn ? magIn : null;
  P.bare = wpnOn && (magIn !== null || !!ch.weapon?.bare);
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
  A.sq = lerp(A.sq, B.sq, w); A.sqW = lerp(A.sqW, B.sqW, w); A.sqA = B.sqA;
  A.wpnLen = lerp(A.wpnLen, B.wpnLen, w); A.wpnS = lerp(A.wpnS, B.wpnS, w);
  A.ha = lerpA(A.ha, B.ha, w);
  A.duck *= 1 - w; A.hunch *= 1 - w;
  A.bow = lerp(A.bow, B.bow, w);
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
  A.sq = B.sq; A.sqW = B.sqW; A.sqA = B.sqA;
  A.ha = B.ha; A.duck = B.duck; A.hunch = B.hunch; A.bow = B.bow;
  for (let i = 0; i < 2; i++) { Object.assign(A.feet[i], B.feet[i]); A.hand[i] = B.hand[i]; A.elb[i] = B.elb[i]; }
  for (const k of ['hl', 'hr', 'wpn', 'carry']) Object.assign(A[k], B[k]);
  A.wpnOn = B.wpnOn; A.carryImg = B.carryImg; A.fist = B.fist; A.bare = B.bare; A.magIn = B.magIn;
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
  // hip slide on a hood: legs thrown forward together and swung round
  prop: { t: [0, 0.15, 0.4, 0.7, 1], x: [1, 2, 9, 8, 1], ys: [3.6, 3, 2.4, 2.4, 3.6], yl: [0, 0, 4, 3, 0] },
  // speed vault: the last step, the feet off together and tucked, carried past the hand on the far side, reaching
  // for the floor ahead, down
  speed: { t: [0, 0.12, 0.26, 0.44, 0.62, 0.8, 1], x: [1, -1.5, -2.5, 2.5, 7, 6, 1], ys: [3.6, 3.4, 1.5, 1.2, 1.6, 3, 3.6], yl: [0, 0, 3.5, 7.5, 6, 1.5, 0] },
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
// The player set on a man who is down, what he strikes ahead of him (x forward in what follows). Every beat is an
// anticipation that ends on its blow: u = 0..1 through the wait, the blow at 1; hit = s since the last one landed.
//   gouge     kneeling astride him, both hands take his head, the thumbs are driven in (he bears down, shaking), then
//             the head is lifted and beaten on the floor
//   pound     kneeling astride him, one fist after the other brought down from the ear, the other hand on his chest;
//             then the right elbow, the whole body dropped behind it
//   hair      kneeling astride him, the left hand on his chest, the right fist in his hair: the head lifted and beaten
//             on the floor
//   stomp     standing over him, the right heel raised (arms out) and driven down on his head
//   frenzy    kneeling astride him, the left hand at his throat, the blade raised by the shoulder and driven into
//             him again and again, the shoulders rocking with it; twist: it is turned in the wound; rip: torn out
//             sideways
//   slit      kneeling on his chest, the left hand pushing his brow back, the blade set on the far side of his
//             throat and drawn across; then he holds the head back while it empties
//   smash     standing over him, a foot on his chest, the weapon raised over the head with both hands (it points
//             back, up toward the eye) and brought down: on him, or through him when it stays planted; lean: he bears
//             down on it
//   pile      standing over him, the weapon upright in both hands (a gun butt down), lifted and driven straight down
//   headshot  standing, the gun brought down on him at arm's length (aim: pressed on his brow), held, fired: the arm
//             kicks back after every round
// Walked out of (Player.execOut), the pose lets go over EXEC.blend s.
const KNEES = [[-6, -7.5], [-6, 7.5]], STANCE = [[8, -2.5], [-4, 4]], APART = [[1.5, -4.2], [-1.5, 4.2]]; // the feet: kneeling / a foot on him / stood by him
const in2 = (k) => { k = clamp(k, 0, 1); return k * k; };

export function execPose(ch, P, V) {
  const out = ch.execution ? null : ch.execOut, ex = out ? out.ex : ch.execution, f = ex.f;
  if (!f.pose) return P; // the standing strikes
  const a = ex.face, c = Math.cos(a), s = Math.sin(a), d = ch.def;
  const [wait, what] = f.beats[ex.i], u = ex.done ? 1 : clamp(ex.t / wait, 0, 1), first = ex.i === 0;
  const thud = Math.exp(-ex.hit * 14); // the blow that just landed, dying away
  // into the pose as he sets himself, out of it at the very end (or as he walks out of it)
  const m = smooth(ex.age / (f.quick ? EXEC.quickMount : EXEC.mount)) * (ex.done ? 1 - smooth((ex.t / (f.after || 1) - 0.6) / 0.4) : 1)
    * (out ? clamp(out.t / EXEC.blend, 0, 1) : 1);
  copyPose(V, P);
  V.ta = V.ha = a;
  V.top = 0;
  const kneel = f.mount === 'astride';
  (kneel ? KNEES : f.mount === 'over' ? STANCE : APART).forEach(([lx, ly], i) => {
    const ft = V.feet[i];
    ft.x = lx * c - ly * s; ft.y = lx * s + ly * c; ft.a = kneel ? a + Math.PI : a; ft.lift = 0;
  });
  V.legs = kneel ? 1 : f.mount === 'over' ? 0.7 : 0;
  let lean = 0, size = kneel ? 0.9 : 1, twist = 0;
  const hands = (lx, ly, rx, ry) => { place(V.hl, V, V.ta, lx, ly); place(V.hr, V, V.ta, rx, ry); };
  const torso = () => { V.ta = a + twist; V.tx = c * lean; V.ty = s * lean; V.s = P.s * size * (1 - 0.04 * thud); };
  // the head lifted (0 .. 0.55 of the beat), then beaten down: [how far the hands reach, the lean, the size]
  const beat = () => {
    if (u < 0.55) { const k = smooth(u / 0.55); return [10.5 - 3 * k, 3 - 2 * k, 0.04 * k]; }
    const k = in2((u - 0.55) / 0.45);
    return [7.5 + 4.5 * k, 1 + 4 * k, 0.04 - 0.09 * k];
  };
  if (f.pose === 'gouge') {
    let fwd = 10.5, gap = 2.3, shake = 0;
    lean = 3;
    if (what === 'grab') { const k = smooth(u); fwd = lerp(5, 10.5, k); gap = lerp(5, 2.3, k); lean = 3 * k; }
    else if (what === 'press') { const k = smooth(u); lean = 3 + 1.6 * k; gap = 2.3 - k; shake = Math.sin(ex.age * 70) * 0.4 * k; size -= 0.03 * k; }
    else { const [x, l, z] = beat(); fwd = x; lean = l; size += z; }
    torso();
    hands(fwd + shake, -gap, fwd - shake, gap);
  } else if (f.pose === 'hair') {
    let fwd = 10.5;
    lean = 3;
    if (what === 'grab') { const k = smooth(u); fwd = lerp(5, 10.5, k); lean = 3 * k; }
    else { const [x, l, z] = beat(); fwd = x; lean = l; size += z; twist = 0.2 * (x < 10.5 ? (10.5 - x) / 3 : -0.6); }
    torso();
    hands(lerp(4, 5.5, first ? smooth(u) : 1), -3, fwd, 0.6);
    V.hand[0] = 'flat'; V.hand[1] = 'fist';
  } else if (f.pose === 'pound') {
    // the fist of this beat: up by the ear (0) .. on his face (1); the other hand holds him down
    const right = ex.i % 2 === 0, elbow = what === 'elbow';
    let down = u < 0.45 ? 0 : in2((u - 0.45) / 0.55);
    if (ex.done) down = 1;
    const side = right ? 1 : -1, k = first ? smooth(u / 0.45) : 1;
    if (elbow) {
      // he rears up, the forearm folded across him, and drops everything behind the elbow
      const up = u < 0.6 ? smooth(u / 0.6) : 1 - in2((u - 0.6) / 0.4), fall = ex.done ? 1 : u < 0.6 ? 0 : in2((u - 0.6) / 0.4);
      lean = lerp(2, -1.5, up) + 5.5 * fall;
      size += 0.07 * up - 0.09 * fall;
      twist = 0.35 * up - 0.75 * fall;
      torso();
      hands(5.5, -3.5, lerp(3.5, 5, fall), lerp(4, -0.5, fall));
      V.elb[1] = 1;
    } else {
      lean = (2 + 2.2 * down) * k;
      twist = side * (0.3 - 0.6 * down) * k;
      torso();
      const fx = lerp(1.5, 10.5, down), fy = lerp(6.5, 1, down), rest = [6, 3.2];
      if (right) hands(rest[0], -rest[1], fx, fy);
      else hands(fx, -fy, rest[0], rest[1]);
      V.top = down < 0.5 ? 1 : 0;
    }
    V.hand[0] = V.hand[1] = 'fist';
  } else if (f.pose === 'stomp') {
    // the right foot: on him (0) .. drawn back and up, the knee high (1) .. driven down on him
    const up = ex.done ? 0 : u < 0.55 ? smooth(u / 0.55) : 1 - in2((u - 0.55) / 0.45), from = first ? smooth(u / 0.3) : 1;
    const put = (ft, lx, ly) => { ft.x = lx * c - ly * s; ft.y = lx * s + ly * c; ft.a = a; };
    put(V.feet[0], -1.5, -4);
    put(V.feet[1], lerp(11, -5.5, up), lerp(1, 5, up));
    V.feet[1].lift = 0.9 * up;
    V.legs = 0;
    lean = lerp(3, -2, up) * from;
    size += 0.06 * up - 0.04 * (1 - up) * from;
    twist = 0.3 * up;
    torso();
    hands(lerp(3, 0.5, up), lerp(-7, -9.5, up), lerp(2, -1, up), lerp(7, 9.5, up));
  } else if (f.pose === 'frenzy') {
    // the knife hand: up by the shoulder (0) .. buried in him (1); its mark: his chest, or under his ribs
    const tx = f.at === 'belly' ? 5 : 7, turn = what === 'twist', rip = what === 'rip';
    let down = 0;
    if (what === 'pin') down = 0;
    else if (turn || rip) down = 1;
    else if (ex.i === 1) down = in2((u - 0.5) / 0.5);                     // the first one comes from the raised hand
    else down = u < 0.5 ? 1 - smooth(u / 0.5) : in2((u - 0.5) / 0.5);
    if (ex.done && !rip) down = 1;
    const k = first ? smooth(u) : 1, out2 = rip ? (ex.done ? 1 : in2(u)) : 0, wr = turn ? smooth(u) : rip ? 1 : 0;
    const shake = turn && !ex.done ? Math.sin(ex.age * 60) * 0.35 * Math.sin(Math.PI * u) : 0;
    lean = (2.5 + 2 * down) * k + 1.2 * wr - 2.5 * out2;
    twist = (0.2 - 0.42 * down) * k + 0.55 * out2 + shake * 0.05;
    size -= 0.03 * wr * (1 - out2);
    torso();
    hands(lerp(4, 7.5, k), lerp(-5, -2.5, k), lerp(lerp(0.5, tx, down), 3.5, out2) + shake, lerp(lerp(6.5, 1.2, down), 9, out2));
    V.wpn.x = V.hr.x; V.wpn.y = V.hr.y; V.wpn.a = a + lerp(0.35, -0.1, down) + 0.9 * wr + 0.5 * out2;
    V.wpnLen = lerp(lerp(0.5, 0.3, down), 0.9, out2); V.wpnS = lerp(1.3, 1, down);
    V.top = down < 0.5 || out2 > 0.3 ? 1 : 0;
  } else if (f.pose === 'slit') {
    // the blade: by his hip (0) .. set on the far side of the throat (1), then drawn across (cut 0 .. 1)
    const set = what === 'pin' ? smooth(u) : 1, cut = what === 'cut' ? (ex.done ? 1 : smooth(u)) : what === 'bleed' ? 1 : 0;
    const hold = what === 'bleed' ? smooth(u / 0.3) : 0;
    lean = 3.5 * set + 0.8 * cut - 1.5 * hold;
    twist = -0.25 * set + 0.5 * cut;
    size -= 0.03 * cut * (1 - hold);
    torso();
    hands(lerp(4, 12, set), lerp(-5, -0.8, set), lerp(lerp(2, 10, set), 8, cut) - hold, lerp(lerp(6, -3.6, set), 5.5, cut) + 1.5 * hold);
    V.hand[0] = 'flat';
    V.wpn.x = V.hr.x; V.wpn.y = V.hr.y; V.wpn.a = a + lerp(-0.3, -1.25, set) + 0.9 * cut;
    V.wpnLen = 0.8; V.wpnS = 1.1;
    V.top = set > 0.4 ? 1 : 0;
  } else if (f.pose === 'smash') {
    // the weapon: lying on him (0) .. raised over the head (1); planted, or a blade: point down
    const bear = what === 'lean' ? Math.sin(Math.PI * u) : 0;
    let up;
    if (what === 'lean') up = 0;
    else if (u < 0.62) up = smooth(u / 0.62);
    else up = 1 - in2((u - 0.62) / 0.38);
    if (ex.done) up = 0;
    const from = first && u < 0.62 ? smooth(u / 0.3) : 1; // out of the standing pose at the very start
    const point = f.point || (f.plant !== undefined && ex.i >= f.plant);
    lean = lerp(3.5, -1.5, up) * from + 1.3 * bear;
    size += 0.03 * up - 0.04 * (1 - up) * from - 0.03 * bear;
    twist = bear * Math.sin(ex.age * 9) * 0.06;
    torso();
    const hx = lerp(9, -1.5, up), hy = lerp(1.2, 1.6, up);
    hands(lerp(5, hx - 1.5, from), lerp(-5, -hy, from), hx, hy);
    V.wpn.x = V.hr.x; V.wpn.y = V.hr.y; V.wpn.a = a;
    V.wpnLen = lerp(point ? 0.35 : 1, -0.6, up); V.wpnS = 1 + 0.35 * up;
    V.top = up > 0.45 ? 2 : 0;
  } else if (f.pose === 'pile') {
    // upright in both hands: lifted (1), driven straight down (0)
    const up = ex.done ? 0 : u < 0.55 ? smooth(u / 0.55) : 1 - in2((u - 0.55) / 0.45), from = first ? smooth(u / 0.3) : 1;
    lean = lerp(4, -1.5, up) * from;
    size += (0.07 * up - 0.05 * (1 - up)) * from;
    torso();
    const hx = lerp(10, 7, up);
    hands(lerp(5, hx - 0.6, from), lerp(-5, -1.4, from), hx, 1.4);
    V.wpn.x = V.hr.x; V.wpn.y = V.hr.y; V.wpn.a = a + (d.kind === 'gun' ? Math.PI : 0);
    V.wpnLen = lerp(1, 0.25, from); V.wpnS = 1 + 0.4 * up * from;
    V.top = 2;
  } else {
    const k = first ? smooth(u / 0.45) : 1, kick = ex.last === 'shot' ? Math.exp(-ex.hit * 9) : 0, two = d.hold === 'two';
    const press = what === 'aim' ? smooth(u) : ex.i === 1 && f.beats[0][1] === 'aim' ? 1 - kick : 0;
    const low = what === 'hold' ? 0.5 * smooth(u) : 0; // the gun let down a little once it is done
    lean = 2 * k - 2.5 * kick + 1.5 * press - low;
    size += 0.03 * kick - 0.02 * press;
    torso();
    const rx = lerp(6, two ? 9.5 : 10.5, k) - 3.5 * kick + press - 2 * low, tremble = Math.sin(ex.age * 50) * (0.15 + 0.25 * press) * k * (1 - kick);
    if (two) hands(lerp(5, 6.5, k) - 3 * kick, lerp(-4, -1.2, k), rx, 1.2 + tremble);
    else hands(lerp(4, 1.5, k), lerp(-5, -7.5, k), rx, 0.8 + tremble);
    V.wpn.x = V.hr.x; V.wpn.y = V.hr.y; V.wpn.a = a;
    V.wpnLen = lerp(1, 0.7, k) - 0.2 * kick - 0.1 * press; V.wpnS = 1 + 0.12 * kick;
  }
  reach(V.hl, V, -1);
  reach(V.hr, V, 1);
  if (V.wpnOn) { V.wpn.x = V.hr.x; V.wpn.y = V.hr.y; }
  V.carryImg = null;
  blendPose(P, V, m);
  P.legs = V.legs * m;
  return P;
}

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
// bent at the waist (P.bow = 1): px the head goes on ahead of the neck, share it shrinks (lower: further from the
// eye), share the back shows longer
const BOW = { reach: 5, low: 0.2, long: 0.22 };
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
function slamHead(td, sl) {
  const S = SLAM_POSE[td.f.context], f = td.f;
  const kneel = S.kneel ? smooth(td.age / (f.beats[0][0] + f.beats[1][0])) : 0;
  const fwd = S.fwd * sl.drive - S.back * sl.back, bow = S.bow * sl.drive - 0.5 * sl.back;
  const s = 1 - 0.05 * sl.drive - 0.12 * kneel;
  return { S, kneel, fwd, bow, s, head: fwd + (NECK + BOW.reach * bow) * s };
}
const ARM_LEN = LIMB.upper + LIMB.fore - 0.6;                     // a hand reaching right out (reach() is the poses')
function reachOut(h, P, side) {
  shoulder(SH, P, side);
  const dx = h.x - SH.x, dy = h.y - SH.y, len = Math.hypot(dx, dy), max = ARM_LEN * P.s;
  if (len > max) { h.x = SH.x + (dx / len) * max; h.y = SH.y + (dy / len) * max; }
}
// px from the hand to the muzzle of a gun, to the far end of anything else
const ahead = (d) => (d.kind === 'gun' ? muzzleX(d, spriteW(sprite(d.sprite))) : spriteW(sprite(d.sprite)) - d.grip);

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
  const td = ch.takedown, f = td.f, d = ch.def, a = ch.angle, c = Math.cos(a), s = Math.sin(a);
  const [wait, what] = f.beats[td.i], u = td.done ? 1 : clamp(td.t / wait, 0, 1), D = td.d, side = td.side;
  const thud = Math.exp(-td.hit * 14), first = td.i === 0 && !td.done;
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

// His head driven into what is in front of him by a fist in his hair: yanked back (his head thrown back, the
// shoulders onto the man behind), then thrown at it bent over, his head on ahead of his shoulders and down (P.bow);
// his hands go out to brace on it and claw at the grip, flail through a struggle, and hang slacker with every blow;
// at a toilet he is forced onto his knees first.
function hairHeld(ch, P, td, a, c, s, t) {
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

// ---------------- given up (Enemy.surrender) ----------------
// On his knees: the shins flat on the floor behind him, knees together, the feet turned back (pose px, aim frame);
// the hands up either side of his head are the standing pose's for a man who has given up (standPose).
const YIELD_FEET = [[-6.5, -3.4], [-6.5, 3.4]];
const STRUCK = new Set(['nape', 'butt', 'stab', 'kneeHit', 'kneeShot', 'backShot', 'headbutt', 'throat']); // the beats that throw a held man forward (back: face to face)
export function kneelPose(P) {
  const c = Math.cos(P.ta), s = Math.sin(P.ta);
  YIELD_FEET.forEach(([lx, ly], i) => {
    const f = P.feet[i];
    f.x = lx * c - ly * s; f.y = lx * s + ly * c; f.a = P.ta + Math.PI; f.lift = 0; f.heel = 0;
  });
  P.legs = 1;
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
  const src = (P.bare && spriteOpt(d.sprite + '_bare')) || sprite(d.sprite), k = src.k || 1, img = canted(d, P.fist) ? cantedGun(src, d) : src;
  const len = drawnLen(P);
  for (let i = shadow ? 0 : 1; i < 2; i++) {
    ctx.save();
    ctx.translate(at.x + (i ? 0 : 1.5), at.y + (i ? 0 : 1.5));
    ctx.rotate(P.wpn.a - ta);
    ctx.scale(len * k, P.wpnS * k); // k: the weapon is a finer sprite (Assets.js `density`); d.grip is in world px
    if (!i) ctx.globalAlpha *= 0.3;
    if (i && P.magIn !== null) drawMagIn(ctx, P, d, k);
    ctx.drawImage(i ? img : silhouette(img), -d.grip / k, -img.height / 2 - palmOf(d, P.fist) / k);
    ctx.restore();
  }
}

// a magazine half in its well (P.magIn: world px of it still in), under the gun, in drawWeapon's frame (the gun's
// sprite px): only what is out of the mouth is drawn, whole rows of it, so it stays crisp
function drawMagIn(ctx, P, d, k) {
  const img = spriteOpt(d.magSprite);
  if (!img) return;
  const [x, y, rake] = d.well, mk = img.k || 1, bore = d.bore ?? 0;
  const cy = canted(d, P.fist) ? bore + (y - bore) * CANT.f : y;
  const r0 = clamp(Math.round(P.magIn / mk), 0, img.height - 1);
  ctx.save();
  ctx.translate((x - d.grip) / k, (cy - palmOf(d, P.fist)) / k);
  ctx.rotate(-rake);
  ctx.scale(mk / k, mk / k);
  ctx.drawImage(img, 0, r0, img.width, img.height - r0, -img.width / 2, 0, img.width, img.height - r0);
  ctx.restore();
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

// curled up in a roll: the torso shorter and rounder (squashed along the way it rolls: P.sq, P.sqW about P.sqA), the
// head tucked under, the hunched back on top of it
function drawTucked(ctx, ch, P, bx, by) {
  const t = smooth(P.tuck), img = ch.torso;
  ctx.save();
  ctx.translate(bx, by);
  ctx.rotate(P.sqA);
  ctx.scale(P.sq, P.sqW);
  ctx.rotate(P.ta - P.sqA);
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

// the shoulders drawn in toward the spine (the sprite's y is across them); long: the back shown longer (bent over)
function drawHunched(ctx, img, x, y, a, s, h, long = 0) {
  const k = s * (img.k || 1);
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(a);
  ctx.scale(k * (1 + long), k * (1 - h));
  ctx.drawImage(img, -img.width / 2, -img.height / 2);
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
  // a ducked head sinks between the shoulders: smaller, pulled back onto the neck
  // bent over (P.bow), the head goes on ahead of the shoulders and down (smaller), the back shows longer
  const bow = P.bow, ha = ta + clamp(angDiff(ta, P.ha), -1, 1), head = 1 - smooth(P.tuck * 2);
  const hs = (1 + (s - 1) * 0.6) * (1 - 0.5 * P.duck) * (1 - BOW.low * bow);
  const neck = (LIMB.neck * (1 - 3 * P.duck) + BOW.reach * bow) * s, hx = bx + Math.cos(ta) * neck, hy = by + Math.sin(ta) * neck;

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
    const ck = P.carryImg.k || 1;
    ctx.scale(ck, ck); // a finer sprite (Assets.js `density`)
    ctx.drawImage(P.carryImg, -P.carryImg.width / 2, -P.carryImg.height / 2);
    ctx.restore();
  }
  ctx.restore();
  // a pistol in both hands: the other hand closed over the gun hand
  const cup = cupped(ch, P);
  for (const i of cup ? HANDS_CUP : HANDS_ORDER) if (i ? !P.top : P.top < 2) paintHand(ctx, ch, P, i, x, y, cup);

  if (P.tuck > 0.02) drawTucked(ctx, ch, P, bx, by);
  else if (P.hunch > 0.005 || bow > 0.005) drawHunched(ctx, ch.torso, bx, by, ta, s, P.hunch, Math.max(0, bow) * BOW.long);
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
