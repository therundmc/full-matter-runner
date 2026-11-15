// The walk and run cycle of a character's legs, as numbers (DOM-free; CharacterAnim turns them into a pose).
// A stride is one cycle (ch.walk 0 .. 2 PI): the left foot comes down at 0, the right one half a cycle later. Each foot
// is down (planted, drifting back under the body as it goes over it) for a share of the cycle, then swings forward,
// lifted, to come down ahead. Cadence and stride length grow with the speed as a real gait does: a walk is under two
// steps a second, a run three. Feet are measured in pose px (the body as drawn before BODY_SCALE).
import { BODY_SCALE } from '../Config.js';
import { toMps } from '../../engine/physics/Units.js';
import { clamp, lerp, angDiff } from '../../engine/math.js';

export const GAIT = {
  cadence: [1.15, 0.45],  // steps per second = a + b * speed (m/s of the body as drawn)
  stance: [0.66, 0.068, 0.38, 0.6], // share of the cycle a foot is down: a - b * speed, within [min, max]
  slip: 0.78,             // share of the planted foot's real travel that is drawn (1: it never slides)
  reach: 11.5,            // the feet go no further than this ahead of / behind the hips (pose px)
  width: [3.5, 2.4],      // half the distance between the feet, walking / running (they land nearer the line)
  run: [1.7, 3.2],        // m/s over which a walk becomes a run (arms pumping, the body leant in)
  start: 0.25,            // px/step under which he is standing
  back: 1.95,             // rad between his facing and his way past which he walks backwards, facing on
  twist: 1.15,            // rad the hips may turn from the facing: further, he side-steps
};

// speed in m/s of the body as drawn (it is drawn BODY_SCALE larger than the world measures it)
export const paceOf = (sp) => toMps(sp) / BODY_SCALE;
export const cadenceAt = (v) => GAIT.cadence[0] + GAIT.cadence[1] * v;
export const stanceAt = (v) => clamp(GAIT.stance[0] - GAIT.stance[1] * v, GAIT.stance[2], GAIT.stance[3]);
// how far a planted foot goes ahead of / behind the hips at pace v (pose px)
export const reachAt = (v) => Math.min(GAIT.reach, GAIT.slip * (v * 32 * stanceAt(v)) / cadenceAt(v));
export const runAt = (v) => clamp((v - GAIT.run[0]) / (GAIT.run[1] - GAIT.run[0]), 0, 1);

const TAU = Math.PI * 2;
const frac = (x) => x - Math.floor(x);
const smoother = (t) => t * t * t * (t * (t * 6 - 15) + 10);

// Advance the cycle of ch (walk, pace, run, gait) by dt at sp px/step going along moveA (facing ch.angle). Returns how
// many feet came down meanwhile (0, 1, rarely 2). Standing, the cycle runs on to the next moment the feet pass each
// other and stops there, so he stops on both feet instead of freezing in mid-stride.
export function advanceGait(ch, sp, dt, moveA) {
  const moving = sp > GAIT.start;
  const v = moving ? paceOf(sp) : 0;
  const k = 1 - Math.exp(-dt * 8);
  ch.strideV += (v - ch.strideV) * k;
  ch.runK += (runAt(v) - ch.runK) * k;
  let rate = Math.PI * cadenceAt(ch.strideV); // rad of the cycle per second: two steps a cycle
  const beta = stanceAt(ch.strideV), was = ch.walk / TAU;
  if (!moving) {
    // finish the step: to where the feet pass (mid-stance of either foot), then hold
    const at = frac(was), stops = [beta / 2, beta / 2 + 0.5, beta / 2 + 1];
    const next = stops.find((s) => s >= at - 1e-6);
    if (ch.gait < 0.05 || next - at < 1e-3) rate = 0;
    else rate = Math.min(rate, ((next - at) * TAU) / dt);
  }
  ch.walk += rate * dt;
  if (ch.walk > TAU * 64) ch.walk -= TAU * 64;
  // the hips: along the way, or facing on and walking backwards, turned no further than GAIT.twist from the facing
  if (moving) {
    const off = angDiff(ch.angle, moveA);
    ch.backward = Math.abs(off) > GAIT.back;
    const hips = ch.backward ? moveA + Math.PI : moveA;
    const d = angDiff(ch.angle, hips);
    ch.hipsGoal = ch.angle + clamp(d, -GAIT.twist, GAIT.twist);
    ch.strideA = moveA;
  } else ch.hipsGoal = ch.angle;
  const now = ch.walk / TAU;
  // a foot comes down when its own phase crosses 0: the left one at whole cycles, the right one at halves
  return Math.max(0, Math.floor(now * 2) - Math.floor(was * 2));
}

// Where foot `side` (-1 left, 1 right) is at cycle phase u (0 .. 1 of the stride) with reach R and stance share beta:
// x along the way (ahead +), lift 0 .. 1 while it swings, heel 0 .. 1 as it peels off the floor before the swing.
export function footAt(u, R, beta, out) {
  const p = frac(u);
  if (p < beta) {
    const q = p / beta;
    out.x = R * (1 - 2 * q);
    out.lift = 0;
    out.heel = clamp((q - 0.7) / 0.3, 0, 1);
  } else {
    const q = (p - beta) / (1 - beta);
    out.x = -R + 2 * R * smoother(q);
    out.lift = Math.sin(Math.PI * q);
    out.heel = q < 0.35 ? 1 - q / 0.35 : 0;
  }
  return out;
}

// the phase of foot i (0 left, 1 right) in the cycle of ch
export const phaseOf = (ch, i) => ch.walk / TAU + (i ? 0.5 : 0);

// What the cycle of ch does to the body now: bob (-1 .. 1: up over the planted foot walking, down onto it running)
// and sway (-1 .. 1 toward the planted foot, + = his right)
export function bodyAt(ch, out) {
  const beta = stanceAt(ch.strideV), u = ch.walk / TAU;
  const c = Math.cos(4 * Math.PI * (u - beta / 2));
  out.bob = lerp(c, -c, ch.runK);
  out.sway = -Math.cos(TAU * (u - beta / 2));
  return out;
}
