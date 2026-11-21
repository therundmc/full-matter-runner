// The skirt of a long coat flying behind a man (the runner's duster: Character KINDS `coat`, its two halves painted by
// tools/sprites/characters.py player_tail, drawn under his shoulders by CharacterAnim). Plain numbers, no canvas: the
// skirt is one sheet that lags his turns on a damped spring (it swings to the outside of a turn and trails where he
// comes from when he side-steps), drawn out and its vent opened by his speed, each half kicked out in turn by his
// stride; standing still it hangs as a short hem. Cosmetic only: it has no body and touches no hit circle.
// Numbers: data/feel.js COAT.
import { COAT } from '../data/feel.js';
import { clamp, lerp, angDiff, damped } from '../../engine/math.js';

const TAU = Math.PI * 2;
const num = (v) => (Number.isFinite(v) ? v : 0);

// w: the world angle the sheet points along (null until first stepped), v: its turn rate (rad/s), len: how far it is
// drawn out (hem .. 1), open: the vent's half angle; half[i]: what to draw (0 his left, 1 his right): a the turn of
// that half about its hinge off straight behind him (rad, + toward his left), len its length (share of its sprite)
export function newSkirt() {
  return { w: null, v: 0, len: COAT.hem, open: 0, half: [{ a: 0, len: COAT.hem }, { a: 0, len: COAT.hem }] };
}

// Advance S by dt s. back: the angle straight behind his shoulders (rad); vx, vy: his velocity (px/step); phase: his
// stride (cycles, Gait: ch.walk / TAU); tuck: 0 .. 1 of him curled up or folded (the skirt gathered in); spread:
// 0 .. 1 of him sat on the ground (it lies spread either side of him, COAT.sit).
export function stepSkirt(S, back, vx, vy, phase, dt, tuck = 0, spread = 0) {
  back = num(back); vx = num(vx); vy = num(vy); phase = num(phase);
  tuck = clamp(num(tuck), 0, 1); spread = clamp(num(spread), 0, 1);
  dt = clamp(num(dt), 0, COAT.step);
  const sp = Math.hypot(vx, vy);
  const k = clamp((sp - COAT.moving) / (COAT.full - COAT.moving), 0, 1);
  // where it wants to lie: behind him, drawn toward where he comes from as he gathers speed
  const goal = back + (k > 0 ? clamp(angDiff(back, Math.atan2(-vy, -vx)), -COAT.trail, COAT.trail) * k : 0);
  if (S.w === null || !Number.isFinite(S.w) || !Number.isFinite(S.v)) { S.w = goal; S.v = 0; }
  // a damped spring on the angle (semi-implicit: stable for the steps it is given)
  S.v = damped(S.v, angDiff(S.w, goal), COAT.freq, COAT.damp, dt);
  S.w += S.v * dt;
  // it cannot wrap round him: held within `swing` of straight behind
  let r = angDiff(back, S.w);
  if (Math.abs(r) > COAT.swing) {
    r = clamp(r, -COAT.swing, COAT.swing);
    if (S.v * r > 0) S.v = 0;
  }
  S.w = back + r;
  const ease = 1 - Math.exp(-dt * COAT.draw);
  S.len += (lerp(COAT.hem, 1, k) - S.len) * ease;
  S.open += (COAT.open * k - S.open) * ease;
  const gather = 1 - tuck;
  for (let i = 0; i < 2; i++) {
    const kick = Math.sin(TAU * (phase + i * 0.5)) * k, side = i ? -1 : 1;
    S.half[i].a = lerp(r + side * (S.open + COAT.kick[0] * Math.max(0, kick)), side * COAT.sit[0], spread);
    S.half[i].len = lerp(S.len * (1 + COAT.kick[1] * kick), COAT.sit[1], spread) * gather;
  }
  return S;
}
