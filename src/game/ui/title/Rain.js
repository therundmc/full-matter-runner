// Rain over the whole picture, in three depths, driven by the wind (Timeline.windState). Each drop falls through its
// cycle as a pure function of t: it is placed where it crosses the middle of the picture and drifts with the slant of
// the wind averaged over its fall, so any instant renders on its own and nothing pops when the wind turns. Streaks lie
// along each drop's velocity and take the colour of the light they fall through (the neon, the lamps, the train's
// windows going by, the patrol car's red and blue, a spark), discreet in the dark. Gusts thicken it and push curtains
// of it across. Splash ticks where it hits: the roofs across, the avenue, the rail bed, the train's roof.
import { LW, LH, canvas } from './Draw.js';
import { windState, hash, clamp, smooth } from './Timeline.js';
import { LUCKY, HOTEL, BOARD, LAMPS, DINER, LOANS, BLOCK, AVE, EL } from './Layout.js';

// what colour a drop takes, by the light it falls through
const TYPES = [
  [178, 168, 205],   // 0 the night, a lilac grey
  [255, 120, 180],   // 1 pink neon
  [140, 240, 255],   // 2 cyan neon
  [255, 196, 120],   // 3 sodium lamps, the billboard
  [255, 120, 110],   // 4 red neon
  [240, 236, 220],   // 5 white: the train's windows, headlights
  [255, 70, 60],     // 6 the patrol car's red, tail lights
  [110, 150, 255],   // 7 its blue
  [205, 232, 255],   // 8 a spark
];
// the lights that stay where they are; key: their intensity in the frame's state (1 when absent)
const STATIC = [
  { type: 1, x: LUCKY.x + 18, y: LUCKY.y + 5, r: 40, k: 1.1, key: 'lucky' },
  { type: 2, x: HOTEL.x + 3, y: HOTEL.y + 15, r: 24, k: 0.9, key: 'hotel' },
  { type: 3, x: BOARD.x + BOARD.w / 2, y: BOARD.y + 10, r: 30, k: 0.6, key: 'board' },
  { type: 4, x: LOANS.x + 9, y: LOANS.y + 2, r: 14, k: 0.6 },
  { type: 3, x: DINER.x + 9, y: DINER.y + 3, r: 18, k: 0.7 },
  ...LAMPS.map((x) => ({ type: 3, x: x + 4, y: 138, r: 24, k: 0.9 })),
];
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

// far: behind the block across, thin and slow; mid: in front of it and of the avenue, behind the line; near: in front
// of everything
const DEPTHS = {
  far: { n: 320, v: 140, len: [1, 2], lvl: [1, 3], bottom: 140, seed: 1 },
  mid: { n: 560, v: 230, len: [2, 4], lvl: [1, 6], bottom: EL.bed, seed: 2 },
  near: { n: 80, v: 430, len: [6, 10], lvl: [1, 6], bottom: LH, seed: 3 },
};
const TOP = -14, MIDY = 108, PAD = 96, EDGE = 12;
const LEVELS = 9;                        // alpha steps of a bucket
const alphaOf = (lvl) => 0.05 + lvl * 0.09;

export function buildRain() {
  const R = { depths: {}, slant: new Float64Array(81), t0: 0, lights: [], styles: [], buckets: [], state: {} };
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
  R.front = canvas(LW + 2 * EDGE, LH);
  // a soft-edged band for the curtains of a gust, in three flat steps
  const { c, g } = canvas(32, 1);
  for (let x = 0; x < 32; x++) { const d = Math.abs(x - 15.5); g.fillStyle = `rgba(190,180,215,${d < 4 ? 1 : d < 9 ? 0.55 : d < 14 ? 0.2 : 0})`; g.fillRect(x, 0, 1, 1); }
  R.band = c;
  return R;
}

// per frame: the wind over the last and next 2 s (for the drift of the drops), the curtains, the steady lights at
// full until setLights says better
export function rainFrame(R, t, w) {
  R.t0 = t - 2;
  for (let k = 0; k <= 80; k++) R.slant[k] = windState(R.t0 + k * 0.05).slant;
  R.w = w; R.t = t;
  R.density = 0.55 + 0.45 * w.gust;
  const age = t - w.last.start;
  R.curtains = w.gust > 0.02 ? [0, 1, 2].map((j) => LW + 60 + j * 150 + hash(w.last.k + j) * 50 - age * 190) : [];
  setLights(R, {}, []);
}
// the lights the rain falls through: the steady ones at their sign's state ({ lucky, hotel, board } 0..1), and the
// traffic's, the train's, the sparks' ([{ x, y, r, type, k }])
export function setLights(R, state, moving) {
  R.lights.length = 0;
  for (const L of STATIC) R.lights.push(L.key ? { ...L, k: L.k * (state[L.key] ?? 1) } : L);
  for (const L of moving) R.lights.push(L);
}
const slantAt = (R, t) => {
  const k = clamp((t - R.t0) / 0.05, 0, 79.999), i = Math.floor(k), f = k - i;
  return R.slant[i] + (R.slant[i + 1] - R.slant[i]) * f;
};
function curtainAt(R, x, y) {
  let c = 0;
  for (const xc of R.curtains) { const d = (x + R.w.slant * (y - MIDY) - xc) / 26; if (d > -3 && d < 3) c += Math.exp(-d * d); }
  return c * R.w.gust;
}

function add(R, type, lvl, x, y) {
  if (lvl < 1) return;
  R.buckets[type * LEVELS + Math.min(LEVELS - 1, lvl)].push(x, y);
}
// fill every bucket in one path each, shifted by (ox, oy), then empty them
function flush(R, g, ox, oy) {
  R.buckets.forEach((b, i) => {
    if (!b.length) return;
    g.fillStyle = R.styles[i];
    g.beginPath();
    for (let k = 0; k < b.length; k += 2) g.rect(b[k] + ox, b[k + 1] + oy, 1, 1);
    g.fill();
    b.length = 0;
  });
}

// one depth of rain into g, shifted by (ox, oy) rounded to whole pixels
export function drawRain(R, name, g, ox, oy) {
  const d = R.depths[name], D = d.D, t = R.t, s = R.w.slant, n = d.vy.length;
  const nx = -s / Math.hypot(1, s), ny = 1 / Math.hypot(1, s), stretch = 1 + 0.6 * R.w.gust;
  for (let i = 0; i < n; i++) {
    const u = t + d.ph[i], c = Math.floor(u / d.per[i]), a = u - c * d.per[i], vy = d.vy[i];
    const y = TOP + a * vy;
    if (y > D.bottom + 4) continue;
    const tc = t - a + (MIDY - TOP) / vy;
    const xc = -PAD + hash(D.seed * 7.31 + i * 0.913 + c * 1.137) * (LW + 2 * PAD);
    const x = xc + slantAt(R, (t + tc) / 2) * vy * (tc - t);
    if (x < -EDGE || x > LW + EDGE) continue;
    const dens = R.density + 0.6 * curtainAt(R, x, y);
    const fade = smooth(d.h[i] - 0.12, d.h[i], dens);
    if (fade <= 0) continue;
    lightAt(R, x, y);
    const lit = Math.min(1, LI);
    const lvl = Math.round((D.lvl[0] + (D.lvl[1] - D.lvl[0]) * lit) * fade);
    if (lvl < 1) continue;
    const len = Math.round(d.len[i] * stretch);
    for (let k = 0; k < len; k++) {
      const py = Math.round(y - ny * k);
      if (py > D.bottom) continue;
      add(R, LT, k > len / 2 ? lvl - 1 : lvl, Math.round(x - nx * k), py);
    }
  }
  flush(R, g, Math.round(ox), Math.round(oy));
}
// the rain in front of everything, with the curtains of a gust, at the near plane's offset (fx, fy)
export function drawFrontRain(R, ctx, fx, fy) {
  const g = R.front.g;
  g.clearRect(0, 0, R.front.c.width, R.front.c.height);
  if (R.curtains.length) {
    g.save();
    g.imageSmoothingEnabled = false;
    g.globalAlpha = 0.09 * R.w.gust;
    g.setTransform(1, 0, -R.w.slant, 1, EDGE, 0);
    for (const xc of R.curtains) g.drawImage(R.band, xc + R.w.slant * MIDY - 30, -10, 60, LH + 20);
    g.restore();
  }
  drawRain(R, 'near', g, EDGE, 0);
  ctx.drawImage(R.front.c, Math.round(fx) - EDGE, Math.round(fy));
}

// ---------------------------------------------------------------- splashes
// flat surfaces the rain hits: x0..x1 over a band of depth y0..y1, n slots
const ROOFS = BLOCK.filter((b) => b.kind !== 'alley').map((b) => ({ x0: b.x0, x1: b.x1, y0: b.rb + 1, y1: b.pp - 1, n: Math.round((b.x1 - b.x0) / 14) }));
const SPLASH = {
  near: ROOFS,
  street: [{ x0: -40, x1: LW + 40, y0: AVE.kerb + 2, y1: EL.bed - 1, n: 30 }, { x0: -40, x1: LW + 40, y0: 146, y1: AVE.kerb - 2, n: 10 }],
  el: [{ x0: -40, x1: LW + 40, y0: EL.bed, y1: EL.girder[0] - 1, n: 24 }],
  train: [{ x0: 0, x1: 0, y0: EL.roof, y1: EL.side - 2, n: 26 }],
};
const SEED = { near: 100, street: 300, el: 500, train: 700 };
// splash ticks (two frames: the hit, then a little crown) on one group, into g shifted by (ox, oy); span: [x0, x1]
// the surface reaches when it moves (the train), or nothing
export function drawSplashes(R, group, g, ox, oy, span = null) {
  const t = R.t, list = SPLASH[group];
  let slot = 0;
  for (const s of list) {
    const x0 = span ? span[0] : s.x0, x1 = span ? span[1] : s.x1;
    for (let j = 0; j < s.n; j++, slot++) {
      const seed = SEED[group] + slot, per = 0.22 + hash(seed + 0.1) * 0.28;
      const u = t + hash(seed + 0.2) * per, c = Math.floor(u / per), a = u - c * per;
      if (a > 2 / 30 || hash(c * 1.71 + seed * 0.37) > R.density * 1.15) continue;
      const x = Math.round(x0 + hash(c * 3.13 + seed * 0.71) * (x1 - x0)), y = Math.round(s.y0 + hash(c * 5.3 + seed) * (s.y1 - s.y0));
      if (x < -EDGE || x > LW + EDGE) continue;
      lightAt(R, x, y - 4);
      const lvl = Math.round(2 + 4 * Math.min(1, LI)), big = y > 175;
      if (a < 1 / 30) { add(R, LT, lvl, x, y - 1); add(R, LT, lvl - 2, x, y - 2); }
      else {
        add(R, LT, lvl - 2, x - 1, y - 1); add(R, LT, lvl - 2, x + 1, y - 1);
        if (big) { add(R, LT, lvl - 3, x - 2, y - 2); add(R, LT, lvl - 3, x + 2, y - 2); }
      }
    }
  }
  flush(R, g, ox, oy);
}
