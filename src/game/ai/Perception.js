// Pure perception maths for the guards (no world access, unit tested): how fast the detection meter fills,
// how wrong their aim is, how badly they localise a noise, how long they put up with a loiterer.
import { ENEMY, AI } from '../Config.js';
import { clamp, lerp } from '../../engine/math.js';

// Detection meter fill per second.
//   dist      px to the target          off      rad between the guard's facing and the target
//   moving    target speed (px/step)    light    0..1 brightness at the target (lighting.levelAt)
//   vigilance squad phase multiplier    focus    1 attentive, < 1 distracted / dizzy
export function detectionRate({ dist, off, moving = 0, light = 0.6, vigilance = 1, focus = 1 }) {
  const E = ENEMY;
  const [t0, t1] = E.spotTime;
  const T = t0 + Math.pow(Math.min(1, dist / E.viewDist), 1.5) * (t1 - t0);
  const half = E.fov / 2, fc = E.focusCone;
  let cone = off <= fc ? 1 : off <= half ? lerp(1, E.peripheral, (off - fc) / (half - fc)) : 0.5;
  if (off > fc && dist > E.viewDist * 0.7) cone *= 0.5; // far and off-centre: barely noticed
  const motion = moving > 1.6 ? E.motion[2] : moving > 0.3 ? E.motion[1] : E.motion[0];
  const lit = E.light[0] + E.light[1] * clamp(light, 0, 1);
  return (cone * motion * lit * vigilance * focus) / T;
}

// Is a point inside the view (cone, or the 360° close-awareness bubble)?
export function inView(dist, off, aware) {
  if (dist > ENEMY.viewDist) return false;
  return dist <= ENEMY.closeSense[aware] || off <= ENEMY.fov / 2;
}

// Aim error (rad, half-width) of a shot: wide on the first shots, tightens with steady sight (settle 0..1).
export function aimError(settle, targetMoving = 0) {
  const e = lerp(ENEMY.aimErrorMax, 0, clamp(settle, 0, 1));
  return e * (targetMoving > 1.6 ? ENEMY.aimMoveMul : 1);
}

// Localisation error radius (px) of a noise heard from `dist` away.
export const hearingError = (dist) => dist * ENEMY.hearError;
