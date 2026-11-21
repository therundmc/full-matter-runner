// A dancer at her pole (DOM-free): the routine of data/feel.js DANCE, played on the beat. Everything is a function of
// the beat, so it loops seamlessly and the same instant always gives the same body:
//   where she is (her centre about the pole, her facing), her feet (world points planted between her steps: each one
//   lands where she will be halfway to its next step), her layers (head, shoulders, hips) and her pose (the hips
//   swaying with the shoulders against them, the chest, a bow, the hands; the right one on the pole).
// Civilian leads her body, her feet and her layers with it (Facing.js `lead`); CharacterAnim dancePose draws the rest.
// Pose numbers are pose px in her own frame (+x where she faces, +y her right), as in render/PastimeArt.js.
import { DANCE } from '../data/feel.js';
import { BODY_SCALE } from '../Config.js';
import { TAU, clamp, lerp, angDiff, smooth, smoother, frac } from '../../engine/math.js';

const R = DANCE.routine;
const LOOP = R.reduce((n, m) => n + m.beats, 0);
const START = [];
for (let i = 0, b = 0; i < R.length; b += R[i++].beats) START.push(b);
const mod = (v, n) => ((v % n) + n) % n;

export { LOOP };

// beats into the routine at time t (s), each dancer at her own place in it (a whole beat off the others)
export const beatAt = (t, seed) => mod((t * DANCE.bpm) / 60 + Math.floor(frac(seed * 0.618) * LOOP), LOOP);

// the move under way at beat b: its index and the beats into it
function moveAt(b) {
  let i = R.length - 1;
  while (i > 0 && START[i] > b) i--;
  return [i, b - START[i]];
}

// the hips to the side of the foot she is on, on the beat (+1 her right on odd beats), lingering there
const wave = (u) => Math.sin((Math.PI / 2) * -Math.cos(Math.PI * u));

const pt = () => ({ x: 0, y: 0 });
const newPose = () => ({ hipX: 0, hipY: 0, chX: 0, chY: 0, twist: 0, hipA: 0, head: 0, bow: 0, rise: 0, top: 0, pole: 0, hl: pt(), hr: pt() });
const KEYS = ['hipX', 'hipY', 'chX', 'chY', 'twist', 'hipA', 'head', 'bow', 'rise', 'pole'];
const set = (h, x, y) => { h.x = x; h.y = y; };

// each move's own pose at u beats into it (the sway laid over it after)
const MOVES = {
  sway(M, u, o) {
    // her back to the pole, its hand behind her on it, the other on her hip, riding it
    set(o.hl, 0.6, -6.5 + 0.5 * DANCE.sway.hip * wave(u));
    set(o.hr, -2, 6.5);
  },
  turn(M, u, o) {
    set(o.hl, 2.5, -8.5);
    set(o.hr, 3, 6);
  },
  circle(M, u, o) {
    // walking round the pole, the free arm out at her side, swept slowly from ahead to behind her and back
    const A = M.arm, b = lerp(A.from, A.to, 0.5 - 0.5 * Math.cos((TAU * u) / 4));
    set(o.hl, Math.cos(b) * A.reach, -6 - Math.sin(b) * A.reach);
    set(o.hr, 3, 6);
  },
  lean(M, u, o) {
    // hanging back off the pole at arm's length, the head thrown back, the free arm swept out behind her
    const L = M.lean, k = smooth(u / L.in) * (1 - smooth((u - (M.beats - L.out)) / L.out));
    o.chX = -L.back * k; o.hipX = L.hips * k; o.bow = L.bow * k; o.rise = -L.sink * k;
    set(o.hl, lerp(3, -3, k), lerp(-7, -12, k));
    set(o.hr, 6, 4);
  },
  arms(M, u, o) {
    // the arms raised over the head (the hands either side of it), held, then drawn down the front to the hips
    const up = smooth(u / 1.5), d = smooth((u - 2) / 2);
    for (const [h, s] of [[o.hl, -1], [o.hr, 1]]) {
      if (d <= 0) set(h, lerp(0.5, 2.6, up), s * lerp(6.6, 4.2, up));
      else if (d < 0.5) set(h, lerp(2.6, 4.8, d * 2), s * lerp(4.2, 4.6, d * 2));
      else set(h, lerp(4.8, 0.3, d * 2 - 1), s * lerp(4.6, 6.6, d * 2 - 1));
    }
    o.top = up > 0.6 && d < 0.25 ? 2 : 0;
  },
  roll(M, u, o) {
    // a wave down the body every two beats: the chest forward, the hips after it, the hands up the front and down
    const Q = M.roll, f = Math.PI * u, up = 0.5 - 0.5 * Math.cos(f), k = smooth(u / 0.75) * (1 - smooth((u - M.beats + 0.75) / 0.75));
    o.chX = Q.chest * k * Math.sin(f); o.hipX = Q.hips * k * Math.sin(f - Q.lag);
    o.bow = Q.bow * k * Math.sin(f); o.rise = Q.rise * k * Math.sin(f - 0.7);
    set(o.hl, lerp(-0.3, 3.5, up), -lerp(6.4, 3.4, up));
    set(o.hr, lerp(-0.3, 3.5, up), lerp(6.4, 3.4, up));
  },
};

// the right hand's hold on the pole through move M at u (0 .. 1)
function poleAt(M, u) {
  const [a, b, u0 = 0, u1 = M.beats] = M.pole;
  return a + (b - a) * smooth((u - u0) / (u1 - u0 || 1));
}

function movePose(i, u, o) {
  const M = R[i], S = DANCE.sway, k = M.sway;
  for (const key of KEYS) o[key] = 0;
  o.top = 0;
  MOVES[M.move](M, u, o);
  o.pole = poleAt(M, u);
  // the sway: the hips lead, the chest and the shoulders answer the other way a little after, the head after them
  o.hipY += S.hip * k * wave(u);
  o.chY -= S.counter * S.hip * k * wave(u - S.lag);
  o.twist -= S.twist * k * wave(u - S.lag);
  o.hipA += S.twist * k * wave(u);
  o.head += S.head * k * wave(u - 2 * S.lag);
  return o;
}

const PREV = newPose(), CUR = newPose();

// her pose at beat b (into out): the move's, crossfaded from the end of the last one over its first `blend` beats
export function poseAt(b, out = newPose()) {
  const [i, u] = moveAt(mod(b, LOOP)), w = smooth(u / DANCE.blend);
  movePose(i, u, CUR);
  if (w < 1) {
    const j = (i + R.length - 1) % R.length;
    movePose(j, R[j].beats, PREV);
    for (const key of KEYS) out[key] = lerp(PREV[key], CUR[key], w);
    set(out.hl, lerp(PREV.hl.x, CUR.hl.x, w), lerp(PREV.hl.y, CUR.hl.y, w));
    set(out.hr, lerp(PREV.hr.x, CUR.hr.x, w), lerp(PREV.hr.y, CUR.hr.y, w));
    out.top = w < 0.5 ? PREV.top : CUR.top;
  } else {
    for (const key of KEYS) out[key] = CUR[key];
    set(out.hl, CUR.hl.x, CUR.hl.y); set(out.hr, CUR.hr.x, CUR.hr.y);
    out.top = CUR.top;
  }
  return out;
}

// her hands at time t (render/PastimeArt.js: a dancer's busy hands; the right one where it is off the pole)
export function danceHands(t, seed) {
  const o = poseAt(beatAt(t, seed));
  return { hl: { ...o.hl }, hr: { ...o.hr } };
}

// where she is at beat b about the pole (x, y), the way the room is (front): out { x, y, face }
function bodyAt(b, px, py, front, out) {
  const [i, u] = moveAt(mod(b, LOOP)), M = R[i];
  const e = M.travel === 'beat' ? (Math.floor(u) + smooth(frac(u))) / M.beats : smooth(u / M.beats);
  const th = front + lerp(M.th[0], M.th[1], e) * TAU, r = lerp(M.r[0], M.r[1], smooth(u / M.beats));
  out.x = px + Math.cos(th) * r; out.y = py + Math.sin(th) * r;
  out.face = th + lerp(M.face[0], M.face[1], e);
  out.width = M.width;
  return out;
}

const AT = { x: 0, y: 0, face: 0, width: 0 };

export class Dance {
  // (x, y): the pole, front: the way the room is, seed: her own place in the routine
  constructor(x, y, front, seed) {
    this.x = x; this.y = y; this.front = front; this.seed = seed;
    // the steps of the loop, where each one lands: under her as she will be halfway to that foot's next step
    const steps = [];
    R.forEach((M, i) => { for (const [u, j] of M.steps || []) steps.push({ land: START[i] + u, j, x: 0, y: 0, a: 0 }); });
    this.feet = [steps.filter((s) => s.j === 0), steps.filter((s) => s.j === 1)];
    for (const S of this.feet) {
      S.forEach((s, k) => {
        const next = S[(k + 1) % S.length], nextLand = next.land + (k + 1 === S.length ? LOOP : 0);
        bodyAt((s.land + nextLand - DANCE.step) / 2, x, y, front, AT);
        const side = s.j ? 1 : -1, lx = 0.8 * BODY_SCALE, ly = side * AT.width * BODY_SCALE, c = Math.cos(AT.face), sn = Math.sin(AT.face);
        s.x = AT.x + lx * c - ly * sn; s.y = AT.y + lx * sn + ly * c; s.a = AT.face + side * DANCE.toe;
      });
    }
    this.f = {
      b: 0, x, y, face: front, head: front, sh: front, hip: front, landed: false, w: 0,
      feet: [{ x, y, a: 0, lift: 0, heel: 0 }, { x, y, a: 0, lift: 0, heel: 0 }], pose: newPose(),
    };
    this.lastB = null;
  }

  // foot j at beat b: planted where its last step landed, or on its way from there to the next (into out)
  footAt(j, b, out) {
    const S = this.feet[j], n = S.length, air = DANCE.step;
    let i = n - 1, bb = b;
    while (i >= 0 && S[i].land - air > b) i--;
    if (i < 0) { i = n - 1; bb = b + LOOP; } // still on the last one of the loop before
    const s = S[i], p = S[(i + n - 1) % n], k = (bb - (s.land - air)) / air;
    if (k >= 1) { out.x = s.x; out.y = s.y; out.a = s.a; out.lift = out.heel = 0; return out; }
    const e = smoother(k);
    out.x = lerp(p.x, s.x, e); out.y = lerp(p.y, s.y, e); out.a = p.a + angDiff(p.a, s.a) * e;
    out.lift = Math.sin(Math.PI * k) * DANCE.lift; out.heel = k < 0.3 ? 1 - k / 0.3 : 0;
    return out;
  }

  // everything about her at beat b (this.f; landed: a foot came down since the last call)
  at(b) {
    const f = this.f;
    bodyAt(b, this.x, this.y, this.front, f);
    f.b = b;
    this.footAt(0, b, f.feet[0]); this.footAt(1, b, f.feet[1]);
    const o = poseAt(b, f.pose);
    // her head turned toward the room as she goes round, swayed with her hips
    const gaze = clamp(angDiff(f.face, this.front), -0.9, 0.9) * 0.7;
    f.head = f.face + gaze + o.head; f.sh = f.face + o.twist; f.hip = f.face + o.hipA;
    const last = this.lastB;
    f.landed = last !== null && this.feet.some((S) => S.some((s) => {
      const d = mod(s.land - last, LOOP);
      return d > 0 && d <= mod(b - last, LOOP);
    }));
    this.lastB = b;
    return f;
  }
}
