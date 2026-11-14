// The joints of a dead body (entities/Ragdoll.js) as pure maths: no Matter, no DOM. A part's turn off the torso is
// an angle in the torso's frame (x across, y toward the feet, atan2), given as for a part on the +x side: a part on
// the -x side is mirrored onto it, so one range (data/wounds.js BODY.joints) holds for both shoulders, both hips.
import { angDiff } from '../../engine/math.js';

const TAU = Math.PI * 2;
const wrap = (a) => ((a % TAU) + TAU) % TAU;

// the turn of a part at angle partA off a torso at torsoA, as for the +x side (left: the part is on the -x side)
export function jointAngle(torsoA, partA, left) {
  const rel = angDiff(torsoA, partA);
  return left ? angDiff(0, Math.PI - rel) : rel;
}

// the nearest turn within range [lo, hi], the short way round
export function clampJoint(a, [lo, hi]) {
  if (a >= lo && a <= hi) return a;
  return wrap(a - hi) < wrap(lo - a) ? hi : lo;
}

// back from a turn (as for the +x side) to the part's own angle
export function partAngle(torsoA, a, left) {
  return torsoA + (left ? Math.PI - a : a);
}
