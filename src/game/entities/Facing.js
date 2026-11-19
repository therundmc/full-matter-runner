// How the drawn body turns about the aim (DOM-free; CharacterAnim draws it). The gameplay angle (ch.angle: aim,
// shots, sight) is never touched: only the layers drawn over it lag. The head leads (it looks where he aims, or
// glances at something: ch.headTo), the shoulders follow it on a fast spring, the hips on a slower one, never more
// than FACING.twist off the shoulders. Walking, the hips go along the way (Gait.js footA). Standing, the feet stay
// planted where they are in the world: the hips turn over them up to FACING.hipFoot, and once they want to go
// further round he steps, one foot then the other (a pivot), or hops round on both for a sudden about-turn.
// Feet are world points here (planted means planted), turned into pose px by CharacterAnim. A pastime that moves him
// itself (ch.lead: a dancer) owns them and the layers while it lasts (see lead).
import { FACING } from '../data/feel.js';
import { GAIT } from './Gait.js';
import { BODY_SCALE } from '../Config.js';
import { angDiff, clamp, lerp, smoother } from '../../engine/math.js';

const H = 1 / 240; // s: the springs' longest sub-step (the same motion at any frame rate)

function newFacing(a) {
  return { head: a, headV: 0, sh: a, shV: 0, hip: a, hipV: 0, feet: null, step: null, plantW: 0, hop: 0, rest: 0, led: null };
}

// an angle x (rad) with its speed v (rad/s) pulled toward `to` by a spring [w, z] for dt s: F[k], F[kv] in place
function spring(F, k, kv, to, w, z, dt) {
  const n = Math.max(1, Math.ceil(dt / H)), h = dt / n;
  let x = F[k], v = F[kv]; // stepped in locals, stored once (a keyed store boxes every number it writes)
  for (let i = 0; i < n; i++) {
    v += (w * w * angDiff(x, to) - 2 * z * w * v) * h;
    x += v * h;
  }
  F[k] = x; F[kv] = v;
}

// where foot `side` (-1 left, 1 right) stands about (x, y) with the hips turned a, in world px; out { x, y, a }
export function stanceAt(x, y, a, side, out) {
  const lx = 0.8 * BODY_SCALE, ly = side * GAIT.width[0] * BODY_SCALE, c = Math.cos(a), s = Math.sin(a);
  out.x = x + lx * c - ly * s; out.y = y + lx * s + ly * c; out.a = a + side * 0.1;
  return out;
}

const foot = () => ({ x: 0, y: 0, a: 0, lift: 0, heel: 0 });
// the way the hips face over foot i (0 left, 1 right): its toes turned out taken off
const hipOver = (f, i) => f.a - (i ? 0.1 : -0.1);
// the way the planted feet face (their mean)
export const feetAngle = (f) => {
  const a = hipOver(f[0], 0), b = hipOver(f[1], 1);
  return Math.atan2(Math.sin(a) + Math.sin(b), Math.cos(a) + Math.cos(b));
};

// plant both feet under him, as he stands with his hips turned a
function plant(F, x, y, a) {
  F.feet ??= [foot(), foot()];
  for (let i = 0; i < 2; i++) { stanceAt(x, y, a, i ? 1 : -1, F.feet[i]); F.feet[i].lift = F.feet[i].heel = 0; }
  F.step = null;
}

const SPOT = { x: 0, y: 0, a: 0 };

// one foot (i: 0 left, 1 right; -1: both, a hop) to where it stands for hips turned `goal`, a foot kept within
// FACING.step.splay of the other one
function startStep(F, x, y, goal, i, hop) {
  const S = hop ? FACING.hop : FACING.step, to = [];
  for (let j = 0; j < 2; j++) {
    if (!hop && j !== i) continue;
    const o = hipOver(F.feet[1 - j], 1 - j), g = hop ? goal : o + clamp(angDiff(o, goal), -FACING.step.splay, FACING.step.splay);
    const at = stanceAt(x, y, g, j ? 1 : -1, SPOT);
    to.push({ j, from: { ...F.feet[j] }, x: at.x, y: at.y, a: at.a });
  }
  F.step = { t: 0, dur: S.dur, lift: S.lift, hop, goal, to };
}

// Turn the layers of ch toward its angle over dt s. ch: { angle, x, y, footA, world.time, headTo?, aware?, lead? };
// still: standing (feet planted).
// Returns what happened that is heard: 0, 'step' (a foot set down), 'hop', or 'cloth' (a quick turn).
export function updateFacing(ch, dt, still) {
  const F = (ch.facing ??= newFacing(ch.angle)), A = FACING, a = ch.angle;
  let heard = 0;
  // the head: on the aim, or on what he glances at (no further than a turn of the neck off it)
  let look = a;
  const gl = ch.headTo;
  if (gl && ch.world.time < gl.until) look = a + clamp(angDiff(a, Math.atan2(gl.y - ch.y, gl.x - ch.x)), -gl.max, gl.max);
  spring(F, 'head', 'headV', look, A.head[0], A.head[1], dt);
  const shV = Math.abs(F.shV);
  spring(F, 'sh', 'shV', a, A.shoulders[0], ch.aware >= 2 ? A.alarmed : A.shoulders[1], dt);
  if (Math.abs(F.shV) > A.cloth && shV <= A.cloth) heard = 'cloth';
  // walking: the hips along the way; standing: over the planted feet
  F.plantW = clamp(F.plantW + (still ? dt : -dt) / 0.1, 0, 1);
  const L = ch.lead;
  if (L && still) return lead(F, ch, L);
  F.led = null;
  if (!still) {
    F.hip = ch.footA; F.hipV = 0;
    F.feet = null; F.step = null; F.hop = 0;
  } else {
    if (!F.feet) plant(F, ch.x, ch.y, F.hip);
    const fa = feetAngle(F.feet);
    // the hips go after the shoulders, held within reach of the feet (and the shoulders within reach of the hips)
    let to = F.sh;
    to = fa + clamp(angDiff(fa, to), -A.hipFoot, A.hipFoot);
    spring(F, 'hip', 'hipV', to, A.hips[0], A.hips[1], dt);
    F.hip = F.sh + clamp(angDiff(F.sh, F.hip), -A.twist, A.twist);
    heard = stepFeet(F, ch, fa, dt) || heard;
  }
  return heard;
}

// A pastime that moves the body itself (ch.lead, a dancer: ai/Dance.js { head, sh, hip, feet, w, landed }) owns the
// layers and the feet, weighed in by w from where they were when it took them: no step of ours fights it. Let go,
// the springs go on from there and the feet stay where it left them.
function lead(F, ch, L) {
  const w = L.w;
  if (!F.feet) plant(F, ch.x, ch.y, F.hip);
  F.led ??= { head: F.head, sh: F.sh, hip: F.hip, feet: F.feet.map((f) => ({ ...f })) };
  const o = F.led;
  F.head = o.head + angDiff(o.head, L.head) * w; F.sh = o.sh + angDiff(o.sh, L.sh) * w; F.hip = o.hip + angDiff(o.hip, L.hip) * w;
  F.headV = F.shV = F.hipV = 0;
  for (let i = 0; i < 2; i++) {
    const f = F.feet[i], a = o.feet[i], b = L.feet[i];
    f.x = lerp(a.x, b.x, w); f.y = lerp(a.y, b.y, w); f.a = a.a + angDiff(a.a, b.a) * w;
    f.lift = b.lift * w; f.heel = b.heel * w;
  }
  F.step = null; F.hop = 0; F.rest = 0;
  return L.landed ? 'step' : 0;
}

// The layers of ch set straight onto a, at rest (a LOCK strike, Player.startLunge: the swing drawn facing its man from
// its first frame); planted feet too far off hop round after them.
export function snapFacing(ch, a) {
  const F = (ch.facing ??= newFacing(a));
  F.head = F.sh = F.hip = a;
  F.headV = F.shV = F.hipV = 0;
  if (F.feet && !F.step && Math.abs(angDiff(feetAngle(F.feet), a)) > FACING.stepAt) startStep(F, ch.x, ch.y, a, -1, true);
}

// the feet: a step under way goes on; a new one starts when the hips are too far round, or a foot strayed
function stepFeet(F, ch, fa, dt) {
  const A = FACING, st = F.step, x = ch.x, y = ch.y;
  let heard = 0;
  if (st) {
    st.t += dt;
    const k = Math.min(1, st.t / st.dur), e = smoother(k);
    for (const m of st.to) {
      // round the body, not through it: the foot's angle about his centre and its distance from it, eased
      const f = F.feet[m.j], ra = Math.atan2(m.from.y - y, m.from.x - x), rb = Math.atan2(m.y - y, m.x - x);
      const da = Math.hypot(m.from.x - x, m.from.y - y), db = Math.hypot(m.x - x, m.y - y);
      const r = lerp(da, db, e), q = ra + angDiff(ra, rb) * e;
      f.x = x + Math.cos(q) * r; f.y = y + Math.sin(q) * r;
      f.a = m.from.a + angDiff(m.from.a, m.a) * e;
      f.lift = Math.sin(Math.PI * k) * st.lift;
      f.heel = k < 0.3 ? 1 - k / 0.3 : 0;
    }
    F.hop = st.hop ? Math.sin(Math.PI * k) : 0;
    if (k < 1) return 0;
    for (const m of st.to) F.feet[m.j].lift = F.feet[m.j].heel = 0;
    F.step = null;
    F.hop = 0;
    heard = st.hop ? 'hop' : 'step';
    // the other foot comes round after it, if it is not there yet
    const goal = ch.angle, other = st.hop ? -1 : 1 - st.to[0].j;
    if (other >= 0 && Math.abs(angDiff(hipOver(F.feet[other], other), goal)) > A.settle) startStep(F, x, y, goal, other, false);
    else if (other >= 0 && Math.abs(angDiff(feetAngle(F.feet), goal)) > A.stepAt) startStep(F, x, y, goal, 1 - other, false);
    return heard;
  }
  // the body moved off its feet (a vault, a shove, a teleport): put back under it at once, or stepped back there
  for (let i = 0; i < 2; i++) {
    const at = stanceAt(x, y, fa, i ? 1 : -1, SPOT), off = Math.hypot(F.feet[i].x - at.x, F.feet[i].y - at.y) / BODY_SCALE;
    if (off > A.lost) { plant(F, x, y, F.hip); return 0; }
    if (off > A.stray) { startStep(F, x, y, fa, i, false); return 0; }
  }
  // the hips too far round: a step; a little off, once the shoulders have been still a moment: squared up
  const want = angDiff(fa, F.sh);
  F.rest = Math.abs(F.shV) < 0.3 ? F.rest + dt : 0;
  if (Math.abs(want) <= (F.rest > A.square ? A.settle : A.stepAt)) return 0;
  // a sudden about-turn: a hop round on both feet; otherwise the foot on the side he turns to opens first
  const hop = Math.abs(angDiff(fa, ch.angle)) > A.hop.at && Math.abs(F.shV) > A.hop.speed;
  startStep(F, x, y, ch.angle, hop ? -1 : want > 0 ? 1 : 0, hop);
  return 0;
}

// how far the stepping body leans over the foot that stays down (pose px, world orientation): out { x, y }
export function stepLean(F, ch, out) {
  out.x = out.y = 0;
  const st = F.step;
  if (!st || st.hop) return out;
  const k = Math.min(1, st.t / st.dur), w = Math.sin(Math.PI * k) * FACING.lean / BODY_SCALE, f = F.feet[1 - st.to[0].j];
  const dx = f.x - ch.x, dy = f.y - ch.y, d = Math.hypot(dx, dy) || 1;
  out.x = (dx / d) * w; out.y = (dy / d) * w;
  return out;
}
