// A light rain over the picture, in two depths driven by the wind (Timeline.windState): fine and faint behind the
// bridge, a few longer drops in front of everything. Each drop falls through its cycle as a pure function of t: it is
// placed where it crosses the middle of the picture and drifts with the slant of the wind averaged over its fall, so
// any instant renders on its own and nothing pops when the wind turns. A drop takes the colour of the light it falls
// through (the floodlights, the train's windows and headlight, a spark, the patrol car's red and blue), discreet in
// the dark; a gust thickens it a little.
import { LW, LH } from './Draw.js';
import { windState, hash, clamp, smooth } from './Timeline.js';
import { EL } from './Layout.js';

// what colour a drop takes, by the light it falls through
const TYPES = [
  [170, 165, 200],   // 0 the night, a lilac grey
  [240, 232, 210],   // 1 the train's windows, its headlight
  [205, 232, 255],   // 2 a spark
  [255, 190, 110],   // 3 the floodlights' sodium
  [255, 70, 60],     // 4 the patrol car's red
  [110, 150, 255],   // 5 its blue
];
// the lights that stay where they are: the floodlights on the bridge's posts
const STATIC = EL.lamps.map((p) => ({ type: 3, x: p + EL.post + 3, y: 168, r: 34, k: 1 }));
let LT = 0, LI = 0;   // result of lightAt: the dominant type and the total intensity (no allocation per drop)
function lightAt(R, x, y) {
  let best = 0, total = 0;
  LT = 0;
  for (const L of R.lights) {
    const dx = x - L.x, dy = y - L.y, q = dx * dx + dy * dy;
    if (q >= L.r * L.r) continue;
    let f = 1 - Math.sqrt(q) / L.r;
    f *= f * L.k;
    total += f;
    if (f > best) { best = f; LT = L.type; }
  }
  LI = total;
}

// back: between the towers and the bridge, fine and slow; front: in front of everything, a few longer drops
const DEPTHS = {
  back: { n: 260, v: 190, len: [1, 3], lvl: [1, 5], bottom: EL.bottom[0], seed: 2 },
  front: { n: 34, v: 400, len: [4, 7], lvl: [1, 5], bottom: LH, seed: 3 },
};
const TOP = -14, MIDY = 108, PAD = 96, EDGE = 12;
const LEVELS = 7;                        // alpha steps of a bucket
const alphaOf = (lvl) => 0.04 + lvl * 0.07;

export function buildRain() {
  const R = { depths: {}, slant: new Float64Array(81), t0: 0, lights: [], styles: [], buckets: [] };
  for (const [name, D] of Object.entries(DEPTHS)) {
    const n = D.n, d = { D, vy: new Float32Array(n), per: new Float32Array(n), ph: new Float32Array(n), h: new Float32Array(n), len: new Float32Array(n) };
    for (let i = 0; i < n; i++) {
      const s = D.seed * 1000 + i;
      d.vy[i] = D.v * (0.85 + 0.3 * hash(s + 0.1));
      d.per[i] = (D.bottom - TOP + 12) / d.vy[i] * (1.05 + 0.35 * hash(s + 0.2));
      d.ph[i] = hash(s + 0.3) * d.per[i];
      d.h[i] = hash(s + 0.4);
      d.len[i] = D.len[0] + hash(s + 0.5) * (D.len[1] - D.len[0]);
    }
    R.depths[name] = d;
  }
  for (const c of TYPES) for (let l = 0; l < LEVELS; l++) R.styles.push(`rgba(${c[0]},${c[1]},${c[2]},${alphaOf(l).toFixed(2)})`);
  R.buckets = R.styles.map(() => []);
  return R;
}

// per frame: the wind over the last and next 2 s (for the drift of the drops), how thick it falls, and the lights it
// falls through (the floodlights, and `moving`: the train's, the sparks', the patrol car's [{ x, y, r, type, k }])
export function rainFrame(R, t, w, moving) {
  R.t0 = t - 2;
  for (let k = 0; k <= 80; k++) R.slant[k] = windState(R.t0 + k * 0.05).slant;
  R.w = w; R.t = t;
  R.density = 0.6 + 0.35 * w.gust;
  R.lights.length = 0;
  R.lights.push(...STATIC, ...moving);
}
const slantAt = (R, t) => {
  const k = clamp((t - R.t0) / 0.05, 0, 79.999), i = Math.floor(k), f = k - i;
  return R.slant[i] + (R.slant[i + 1] - R.slant[i]) * f;
};

function add(R, type, lvl, x, y) {
  if (lvl < 1) return;
  R.buckets[type * LEVELS + Math.min(LEVELS - 1, lvl)].push(x, y);
}

// one depth of rain into g, shifted by (ox, oy) rounded to whole pixels
export function drawRain(R, name, g, ox, oy) {
  const d = R.depths[name], D = d.D, t = R.t, s = R.w.slant, n = d.vy.length;
  const nx = -s / Math.hypot(1, s), ny = 1 / Math.hypot(1, s);
  for (let i = 0; i < n; i++) {
    const u = t + d.ph[i], c = Math.floor(u / d.per[i]), a = u - c * d.per[i], vy = d.vy[i];
    const y = TOP + a * vy;
    if (y > D.bottom + 4) continue;
    const tc = t - a + (MIDY - TOP) / vy;
    const xc = -PAD + hash(D.seed * 7.31 + i * 0.913 + c * 1.137) * (LW + 2 * PAD);
    const x = xc + slantAt(R, (t + tc) / 2) * vy * (tc - t);
    if (x < -EDGE || x > LW + EDGE) continue;
    const fade = smooth(d.h[i] - 0.12, d.h[i], R.density);
    if (fade <= 0) continue;
    lightAt(R, x, y);
    const lvl = Math.round((D.lvl[0] + (D.lvl[1] - D.lvl[0]) * Math.min(1, LI)) * fade);
    if (lvl < 1) continue;
    const len = Math.round(d.len[i]);
    for (let k = 0; k < len; k++) {
      const py = Math.round(y - ny * k);
      if (py > D.bottom) continue;
      add(R, LT, k > len / 2 ? lvl - 1 : lvl, Math.round(x - nx * k), py);
    }
  }
  const fx = Math.round(ox), fy = Math.round(oy);
  R.buckets.forEach((b, i) => {
    if (!b.length) return;
    g.fillStyle = R.styles[i];
    g.beginPath();
    for (let k = 0; k < b.length; k += 2) g.rect(b[k] + fx, b[k + 1] + fy, 1, 1);
    g.fill();
    b.length = 0;
  });
}
