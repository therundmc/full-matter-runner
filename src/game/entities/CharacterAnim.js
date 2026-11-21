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
import { PALETTE, BODY_SCALE } from '../Config.js';
import { TELL, GESTURE, RELOAD, FLINCH, FACING, COAT, SEAT, THROW, feelOf } from '../data/feel.js';
import { READABILITY } from '../data/readability.js';
import { sprite, spriteOpt, drawSprite, silhouette, sw as spriteW, sh as spriteH } from '../../engine/Assets.js';
import { lerp, clamp, angDiff, smooth, bump, lerpA, easeOut } from '../../engine/math.js';
import { GAIT, stanceAt, reachAt, footAt, phaseOf, bodyAt } from './Gait.js';
import { beginLimbs, flushLimbs, paintLeg, paintArm, drawHand } from '../render/LimbArt.js';
import { cantedGun, cantPalm, CANT } from '../render/HandgunArt.js';
import { recoilAt } from './Recoil.js';
import { stepLean } from './Facing.js';
import { newSkirt, stepSkirt } from './Skirt.js';
import { drawPhases, talkAt, talkHand } from './Gesture.js';
import { LIMB, SIDE, sideReach, PAIR, muzzleX, WAY, MOUTH, AT, TO, SH, BOW, ahead, TMP, PART } from './anim/Rig.js';
export { NECK, MUZZLE_IN, muzzleX } from './anim/Rig.js';
export { vaultPhases, vaultPose, ladderAt, ladderGrip, rollPhases, slidePhases, slidePose, kickPhases, kickPose } from './anim/Traverse.js';
export { seatPose, grabPhases, sitPose } from './anim/Seat.js';
export { postPose, dancePose, trunkPose, doorHandPose, lockHandPose, brokePose } from './anim/Chores.js';
export { execPose } from './anim/Finish.js';
export { takedownPose, heldPose } from './anim/Takedown.js';
export { shieldPose, hostagePose, shieldOutPose, drawPair } from './anim/Shield.js';
export { kneelPose, riseDurAt, drawDown } from './anim/Down.js';

const ARM = 11;           // how far the special poses (vault, ladder, sit...) let a hand go from its shoulder (px)
const SHOULDER = 6;       // shoulders at torso-local (0, +-6)
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

// The pose holds a gun by the point of its sprite under the hand: x = grip, and off the middle line `palm` (a handgun:
// the hand's centre is under the slide, on the grip) or 0. In the fist (P.fist) a machine pistol is drawn canted
// (render/HandgunArt.js), its side squashed toward the bore: the fist comes up with it.
const canted = (d, fist) => fist && d.hide !== undefined;
const palmOf = (d, fist = false) => (canted(d, fist) ? cantPalm(d) : d.palm ?? 0);

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
export function onGun(d, fist, x, y, gx, gy, ga, len, thick, out) {
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

// A point of gun d (w: its sprite's width) drawn whole by its middle at `at` turned a, at people's scale (drawSprite
// with BODY_SCALE: a gun held out of a car's window, render/PursuitArt.js): `along` world px of the sprite from its
// left edge (its muzzle: w - MUZZLE_IN; its port: d.eject), on the bore line
export function onSprite(d, w, at, a, along, out = {}) {
  const u = (along - w / 2) * BODY_SCALE, v = (d.bore ?? 0) * BODY_SCALE, c = Math.cos(a), s = Math.sin(a);
  out.x = at.x + u * c - v * s; out.y = at.y + u * s + v * c; out.a = a;
  return out;
}

const pt = () => ({ x: 0, y: 0, a: 0, lift: 0, heel: 0 });
export function newPose() {
  return {
    tx: 0, ty: 0, ta: 0, s: 1, lift: 0, legs: 0, // legs: how far the legs are thrown out in front (sit, slide...)
    px: 0, py: 0,     // the hips' own offset (pose px), over the share of the torso's they follow (a dancer's sway)
    tuck: 0, over: 0, // curled up in a ball, the back up (a roll); the legs up over the body
    sq: 1, sqW: 1, sqA: 0, // the curled body's length along axis sqA and its width across it (a roll seen from above)
    ha: 0,            // where the head looks: it keeps to the aim while the shoulders turn under it
    hox: 0, hoy: 0,   // the head's own shift off the neck (pose px, world orientation): pulled back onto a shoulder
    feet: [pt(), pt()],
    hand: ['loose', 'loose'], elb: [0.45, 0.45], // how each hand is ('fist' | 'loose' | 'flat'), elbows out 0 .. 1
    elbOn: [false, false], elbow: [pt(), pt()],  // an elbow put where the pose says (an arm round a neck), not found
    armK: [1, 1],     // each arm's girth (1: as painted; an arm seen flat across a chest shows broader)
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
export function place(out, P, a, lx, ly) {
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
  // a throw wound up (Player.throwHold, THROW.pose): the weapon drawn back behind the right shoulder, the other hand out
  // ahead at the aim, the shoulders turned back and the weight on the back foot; it trembles as the charge fills
  const wu = wpnOn && ch.throwHold ? smooth(Math.min(1, ch.throwHold.t / THROW.pose.in)) : 0;
  if (wu > 0) {
    const W = THROW.pose, k = ch.throwCharge();
    hrx = lerp(hrx, W.hand[0], wu); hry = lerp(hry, W.hand[1], wu);
    wx = hrx; wy = hry;
    wa = lerpA(wa, W.hand[2] + Math.sin(ch.world.time * W.hz) * W.shake * k, wu);
    len = lerp(len, 1, wu);
    hlx = lerp(hlx, W.brace[0], wu); hly = lerp(hly, W.brace[1], wu);
    twist += W.twist * wu; back += W.lean * wu; stance *= 1 - wu;
    fist = false; magIn = null;
    if (wu > 0.5) { top = 1; P.hand[0] = 'loose'; }
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
  P.px = P.py = 0;
  P.tuck = 0;
  P.over = 0;
  P.sq = P.sqW = 1;
  P.bow = 0;
  P.hox = P.hoy = 0;
  P.elbOn[0] = P.elbOn[1] = false;
  P.armK[0] = P.armK[1] = 1;

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
export function blendPose(A, B, w) {
  if (w <= 0) return A;
  A.tx = lerp(A.tx, B.tx, w); A.ty = lerp(A.ty, B.ty, w);
  A.ta = lerpA(A.ta, B.ta, w);
  A.s = lerp(A.s, B.s, w);
  A.lift = lerp(A.lift, B.lift, w);
  A.legs = lerp(A.legs, B.legs, w);
  A.px = lerp(A.px, B.px, w); A.py = lerp(A.py, B.py, w);
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

export function copyPose(A, B) {
  A.tx = B.tx; A.ty = B.ty; A.ta = B.ta; A.s = B.s; A.lift = B.lift; A.legs = B.legs; A.tuck = B.tuck; A.over = B.over;
  A.px = B.px; A.py = B.py;
  A.sq = B.sq; A.sqW = B.sqW; A.sqA = B.sqA;
  A.ha = B.ha; A.duck = B.duck; A.hunch = B.hunch; A.bow = B.bow;
  for (let i = 0; i < 2; i++) { Object.assign(A.feet[i], B.feet[i]); A.hand[i] = B.hand[i]; A.elb[i] = B.elb[i]; }
  for (const k of ['hl', 'hr', 'wpn', 'carry']) Object.assign(A[k], B[k]);
  A.wpnOn = B.wpnOn; A.carryImg = B.carryImg; A.fist = B.fist; A.bare = B.bare; A.magIn = B.magIn;
  A.wpnLen = B.wpnLen; A.wpnS = B.wpnS; A.top = B.top;
}

// Catmull-Rom through keys (times ascending, same length as vals)
export function track(times, vals, k) {
  const n = times.length;
  let i = 0;
  while (i < n - 2 && k > times[i + 1]) i++;
  const u = clamp((k - times[i]) / (times[i + 1] - times[i]), 0, 1);
  const p0 = vals[Math.max(0, i - 1)], p1 = vals[i], p2 = vals[i + 1], p3 = vals[Math.min(n - 1, i + 2)];
  return 0.5 * (2 * p1 + (p2 - p0) * u + (2 * p0 - 5 * p1 + 4 * p2 - p3) * u * u + (3 * p1 - p0 - 3 * p2 + p3) * u * u * u);
}

export function legsPose(P, keys, k, dir, legSide) {
  const x = track(keys.t, keys.x, k), ys = track(keys.t, keys.ys, k), yl = legSide * track(keys.t, keys.yl, k);
  const c = Math.cos(dir), s = Math.sin(dir);
  for (let i = 0; i < 2; i++) {
    const ly = (i ? 1 : -1) * ys + yl, f = P.feet[i];
    f.x = x * c - ly * s; f.y = x * s + ly * c; f.a = dir;
  }
}

// shoulder (side -1 left, 1 right) of pose P, in pose space
export function shoulder(out, P, side) {
  out.x = P.tx - Math.sin(P.ta) * SHOULDER * side * P.s;
  out.y = P.ty + Math.cos(P.ta) * SHOULDER * side * P.s;
  return out;
}

// keep a hand within arm's reach of its shoulder
export function reach(h, P, side) {
  shoulder(SH, P, side);
  const dx = h.x - SH.x, dy = h.y - SH.y, len = Math.hypot(dx, dy), max = ARM * P.s;
  if (len > max) { h.x = SH.x + (dx / len) * max; h.y = SH.y + (dy / len) * max; }
}

// ---------------- rendering ----------------
// the weapon at torso-local point `at` (where the hand holds it: weapons.js grip, palm); a handgun in the fist is drawn
// canted, all that is in the fist taken out (render/HandgunArt.js); over the shoulders it casts a little shadow on them
function drawWeapon(ctx, P, d, ta, at, shadow) {
  const src = (P.bare && spriteOpt(d.sprite + '_bare')) || sprite(d.sprite), k = src.k || 1, img = canted(d, P.fist) ? cantedGun(src, d) : src;
  const len = drawnLen(P), H = READABILITY.held, rim = d.swing ? H.melee : H.gun;
  const place = (ox, oy) => {
    ctx.save();
    ctx.translate(at.x + ox, at.y + oy);
    ctx.rotate(P.wpn.a - ta);
    ctx.scale(len * k, P.wpnS * k); // k: the weapon is a finer sprite (Assets.js `density`); d.grip is in world px
  };
  const x0 = -d.grip / k, y0 = -img.height / 2 - palmOf(d, P.fist) / k;
  if (shadow) {
    place(1.5, 1.5);
    ctx.globalAlpha *= 0.3;
    ctx.drawImage(silhouette(img), x0, y0);
    ctx.restore();
  }
  // a dark rim round what is in his hands, so that it reads from above against a coat or a floor (data/readability.js)
  for (const [ox, oy] of RIM) {
    place(ox * H.px, oy * H.px);
    ctx.globalAlpha *= rim;
    ctx.drawImage(silhouette(img), x0, y0);
    ctx.restore();
  }
  place(0, 0);
  if (P.magIn !== null) drawMagIn(ctx, P, d, k);
  ctx.drawImage(img, x0, y0);
  ctx.restore();
}
const RIM = [[-1, 0], [1, 0], [0, -1], [0, 1]];

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
  const hx = P.tx * 0.6 + P.px, hy = P.ty * 0.6 + P.py, ox = -Math.sin(ha) * LIMB.hip, oy = Math.cos(ha) * LIMB.hip;
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
    const side = i ? 1 : -1, H = i ? P.hr : P.hl, sy = ch.look.wide ?? LIMB.sy; // (a wider man's joints: KINDS `wide`)
    SJ.x = P.tx + (LIMB.sx * c - side * sy * sn) * s;
    SJ.y = P.ty + (LIMB.sx * sn + side * sy * c) * s;
    let dx = H.x - SJ.x, dy = H.y - SJ.y, d = Math.hypot(dx, dy) || 1e-6;
    // the wrist, a little short of the middle of the fist
    WJ.x = H.x - (dx / d) * 0.9 * s; WJ.y = H.y - (dy / d) * 0.9 * s;
    dx = WJ.x - SJ.x; dy = WJ.y - SJ.y; d = Math.hypot(dx, dy) || 1e-6;
    const ux = dx / d, uy = dy / d;
    if (P.elbOn[i]) { EJ.x = P.elbow[i].x; EJ.y = P.elbow[i].y; }
    else if (d >= Lu + Lf) { EJ.x = SJ.x + ux * Lu; EJ.y = SJ.y + uy * Lu; }
    else {
      const along = clamp((d * d + Lu * Lu - Lf * Lf) / (2 * d), -Lu, Lu);
      const h = Math.sqrt(Math.max(0, Lu * Lu - along * along)) * P.elb[i];
      // the elbow out to his side and back, whichever way round the line from the shoulder that is
      const ox = -side * sn - c * 0.9, oy = side * c - sn * 0.9;
      const k = -uy * ox + ux * oy >= 0 ? 1 : -1;
      EJ.x = SJ.x + ux * along - uy * h * k; EJ.y = SJ.y + uy * along + ux * h * k;
    }
    ELB[i].x = EJ.x; ELB[i].y = EJ.y;
    paintArm(ch.look, SJ, EJ, WJ, P.armK[i]);
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

export function paintPose(ctx, ch, P, alpha, parts = PART.all) {
  const x = ch.x, y = ch.y, s = P.s, ta = P.ta;
  const bx = x + P.tx, by = y + P.ty;
  const ga = ctx.globalAlpha;
  if (alpha !== 1) ctx.globalAlpha = ga * alpha;
  // the head on the neck, turned toward the aim, bobbing less than the shoulders; hidden in a ball
  // a ducked head sinks between the shoulders: smaller, pulled back onto the neck
  // bent over (P.bow), the head goes on ahead of the shoulders and down (smaller), the back shows longer
  const bow = P.bow, ha = ta + clamp(angDiff(ta, P.ha), -1, 1), head = 1 - smooth(P.tuck * 2);
  const hs = (1 + (s - 1) * 0.6) * (1 - 0.5 * P.duck) * (1 - BOW.low * bow);
  const neck = (LIMB.neck * (1 - 3 * P.duck) + BOW.reach * bow) * s;
  const hx = bx + Math.cos(ta) * neck + P.hox, hy = by + Math.sin(ta) * neck + P.hoy;
  const skirt = ch.look?.coat && P.tuck <= 0.02 ? skirtOf(ch, P, ta) : null; // (gathered in when he rolls in a ball)

  if (parts & PART.shadow) {
    // shadow: further away, larger and softer as the body rises
    const sh = silhouette(ch.torso), shh = silhouette(ch.head), lift = P.lift;
    const ox = 2 + lift * 4, oy = 2 + lift * 5, sa = 0.35 * (1 - 0.35 * lift);
    if (skirt) drawSkirt(ctx, ch, skirt, bx + ox, by + oy, ta, s, sa, true);
    if (lift > 0.05) {
      for (const j of [-1, 1]) {
        drawSprite(ctx, sh, bx + ox + 0.7 * j, by + oy + 0.5 * j, ta, sa * 0.55, s * 1.05);
        if (head > 0.5) drawSprite(ctx, shh, hx + ox + 0.7 * j, hy + oy + 0.5 * j, ha, sa * 0.55, hs * 1.05);
      }
    } else {
      drawSprite(ctx, sh, bx + ox, by + oy, ta, sa, s);
      if (head > 0.5) drawSprite(ctx, shh, hx + ox, hy + oy, ha, sa, hs);
    }
  }

  // legs and arms, under the weapon and the torso
  const legs = parts & PART.legs && P.over <= 0.35, arms = parts & PART.arms;
  if (legs || arms) {
    beginLimbs(ta);
    if (legs) paintLegs(ch, P);
    if (arms) paintArms(ch, P);
    flushLimbs(ctx, x, y);
  }

  const c = Math.cos(-ta) / s, sn = Math.sin(-ta) / s;
  const toLocal = (p, out) => {
    const dx = p.x - P.tx, dy = p.y - P.ty;
    out.x = dx * c - dy * sn; out.y = dx * sn + dy * c;
    return out;
  };
  const d = ch.def, armed = P.wpnOn && d.sprite;
  const cup = cupped(ch, P); // a pistol in both hands: the other hand closed over the gun hand
  if (arms) {
    // the weapon and what is carried, in the torso frame
    ctx.save();
    ctx.translate(bx, by);
    ctx.rotate(ta);
    ctx.scale(s, s);
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
    for (const i of cup ? HANDS_CUP : HANDS_ORDER) if (i ? !P.top : P.top < 2) paintHand(ctx, ch, P, i, x, y, cup);
  }

  if (parts & PART.body) {
    if (skirt) drawSkirt(ctx, ch, skirt, bx, by, ta, s, 1, false); // under his shoulders, over his legs
    if (P.tuck > 0.02) drawTucked(ctx, ch, P, bx, by);
    else if (P.hunch > 0.005 || bow > 0.005) drawHunched(ctx, ch.torso, bx, by, ta, s, P.hunch, Math.max(0, bow) * BOW.long);
    else drawSprite(ctx, ch.torso, bx, by, ta, 1, s);
  }
  if (parts & PART.head && head > 0) drawSprite(ctx, ch.head, hx, hy, ha, head, hs);
  if (parts & PART.body && P.over > 0.35) { beginLimbs(ta); paintLegs(ch, P, 0.15 * P.over); flushLimbs(ctx, x, y); } // up over the body
  if (parts & PART.top && P.top) {
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

// The skirt of his coat (KINDS `coat`, entities/Skirt.js): advanced on the world's clock from where his shoulders
// point, his velocity and his stride. Returns its state, or null when its sprites are missing.
const TAU = Math.PI * 2;
function skirtOf(ch, P, ta) {
  if (!spriteOpt(ch.look.coat + '_l') || !spriteOpt(ch.look.coat + '_r')) return null;
  const S = ch.skirt || (ch.skirt = newSkirt()), now = ch.world?.time ?? 0;
  const dt = S.t === undefined ? 0 : now - S.t;
  S.t = now;
  stepSkirt(S, ta + Math.PI, ch.vel?.x, ch.vel?.y, (ch.walk || 0) / TAU, dt, P.tuck * 2, smooth(ch.sit || 0));
  if (ch.riding) seatSkirt(S, ch.riding, now);
  return S;
}

// sat in an open car (seatPose): at speed the wind throws the half on the door's side out over the door, the other
// one streams back over the seat; both flutter (data/feel.js SEAT.wind)
function seatSkirt(S, st, now) {
  const m = st.v.m, [out, flut, hz, long] = SEAT.wind, k = clamp((S.len - COAT.hem) / (1 - COAT.hem), 0, 1) * smooth(st.k);
  const door = m.seat[1] < st.v.h / 2 ? 0 : 1, side = door ? -1 : 1;
  S.half[door].a += side * out * k + Math.sin(now * hz) * flut * k;
  S.half[1 - door].a += Math.sin(now * hz * 1.3 + 1) * flut * k;
  S.half[door].len *= 1 + long * k;
}

// its two halves, each hung from its hinge on his back (COAT.hinge), turned and drawn out as the skirt says; shadow:
// their silhouettes instead, at alpha
function drawSkirt(ctx, ch, S, bx, by, ta, s, alpha, shadow) {
  const c = Math.cos(ta) * s, sn = Math.sin(ta) * s;
  for (let i = 0; i < 2; i++) {
    const src = spriteOpt(ch.look.coat + (i ? '_r' : '_l')), img = shadow ? silhouette(src) : src, H = S.half[i];
    if (H.len < 0.05) continue;
    const hy = COAT.hinge[1] * (i ? 1 : -1), k = (src.k || 1) * s;
    ctx.save();
    ctx.translate(bx + COAT.hinge[0] * c - hy * sn, by + COAT.hinge[0] * sn + hy * c);
    ctx.rotate(ta + H.a);
    ctx.scale(k * H.len, k);
    if (alpha !== 1) ctx.globalAlpha *= alpha;
    ctx.drawImage(img, -(src.width - COAT.root), -src.height / 2);
    ctx.restore();
  }
}

