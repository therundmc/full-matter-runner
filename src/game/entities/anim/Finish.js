// Finishing a man on the floor (Player.execution, data/finishers.js FINISHERS): the player's pose through each
// finisher's beats. DOM-free.
import { EXEC } from '../../data/finishers.js';
import { lerp, clamp, smooth } from '../../../engine/math.js';
import { place, blendPose, copyPose, reach } from '../CharacterAnim.js';
import { in2 } from './Rig.js';

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
