// The timing and the choices of a character's gestures, as numbers (DOM-free; CharacterAnim turns them into a
// pose): which door leaf a hand reaches for and with which hand, the phases of drawing a weapon, the gesture that
// goes with a line, and the clock of each.
import { GESTURE, TALK } from '../data/feel.js';
import { angDiff, smooth } from '../../engine/math.js';


// ---------------- doors ----------------
// The nearest door leaf ahead of a man at (x, y) of radius r going along (ux, uy) (a unit vector), within reach of
// a hand (GESTURE.door.ahead): { x, y, a: the leaf's angle, d: px from his centre, door } written into out, or null.
// A leaf swung wide open is walked past, unless he is already against it.
export function doorAhead(doors, x, y, r, ux, uy, out) {
  const G = GESTURE.door, p = { x: 0, y: 0, a: 0 };
  let best = null;
  for (const door of doors) {
    if (!door.touch(x, y, r + G.ahead, p)) continue;
    const dx = p.x - x, dy = p.y - y, d = Math.hypot(dx, dy) || 1e-6;
    if ((dx * ux + dy * uy) / d < G.cone) continue;
    if (Math.abs(angDiff(door.a0, p.a)) > G.open && d > r + G.gap) continue;
    if (best && d >= best.d) continue;
    best = out;
    out.x = p.x; out.y = p.y; out.a = p.a; out.d = d; out.door = door;
  }
  return best;
}

// The hand that goes to it (-1 left, 1 right): the one on the side of the leaf's free end (where it gives most),
// else on the side of the point he touches; with something in the right hand, always the left one. facing: his
// shoulders' angle; tip: the leaf's free end.
export function doorHandSide(facing, x, y, at, tip, rightBusy) {
  if (rightBusy) return -1;
  const c = Math.cos(facing), s = Math.sin(facing);
  const side = (px, py) => c * (py - y) - s * (px - x);
  const t = side(tip.x, tip.y);
  return (Math.abs(t) > 3 ? t : side(at.x, at.y)) > 0 ? 1 : -1;
}

// ---------------- drawing a weapon ----------------
// The phases of a draw at p (0 put away .. 1 in hand; putting it back runs them backwards), each 0..1: reach (the
// hand gone from its swing to the holster, or over the shoulder), grip (closed on it), pull (out of it), present
// (turned up onto its hold), support (the other hand on it)
export function drawPhases(p, out = {}) {
  const D = GESTURE.draw;
  out.reach = smooth((p - D.reach[0]) / (D.reach[1] - D.reach[0]));
  out.grip = smooth((p - D.reach[1]) / (D.grip - D.reach[1]));
  out.pull = smooth((p - D.grip) / (D.pull - D.grip));
  out.present = smooth((p - D.pull) / (1 - D.pull));
  out.support = smooth((p - D.support) / (1 - D.support));
  return out;
}

// ---------------- talking ----------------
const BY_KIND = {};
for (const [g, kinds] of Object.entries(TALK)) for (const k of kinds) BY_KIND[k] = g;

// the gesture that goes with a line said on that occasion (data/barks.js kinds)
export const talkGesture = (kind) => BY_KIND[kind] ?? 'nod';

// The hand a gesture can be made with (1 right, -1 left, 0 none: only the head talks). busy: the hands are taken (a
// pastime, a panic); wpn: what is in hand ({ hold, raised }) or null.
export function talkHand(busy, wpn) {
  if (busy) return 0;
  if (!wpn) return 1;
  if (wpn.hold === 'side' || wpn.hold === 'melee') return -1;
  if (wpn.hold === 'both') return wpn.raised ? 0 : -1;
  return 0; // a long gun takes both hands
}

// 0..1 how far into the gesture a line said `t` s ago is (in, held, out), 0 once over
export function talkAt(t) {
  const T = GESTURE.talk;
  if (t < 0 || t >= T.dur) return 0;
  return smooth(t / T.in) * (1 - smooth((t - (T.dur - T.out)) / T.out));
}
