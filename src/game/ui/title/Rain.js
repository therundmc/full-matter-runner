// Rain over the whole picture, in three depths, driven by the wind (Timeline.windState). Each drop falls through its
// cycle as a pure function of t: it is placed where it crosses the middle of the picture and drifts with the slant of
// the wind averaged over its fall, so any instant renders on its own and nothing pops when the wind turns. Streaks lie
// along each drop's velocity and take the colour of the light they fall through (bright where lit, discreet in the
// dark). Gusts thicken the rain and push curtains of it across the picture. Splash ticks where drops hit something,
// rings in the puddles, wind ripples on them, the gutter running to its drain.
import { LW, LH, M, MY, GY, KERB, ROAD, canvas, persp } from './Draw.js';
import { windState, hash, clamp, smooth } from './Timeline.js';
import { LAMP, TUBE, BOOTH, WIN, PUDDLES, DRAIN } from './Layout.js';
import { SIGN_LIGHT } from './Sign.js';

// ---------------------------------------------------------------- light the rain falls through
// types: what colour a drop takes; each light { type, x, y, r, k, key: its intensity in the frame's light state }
const TYPES = [
  [178, 168, 205],   // 0 the night, a lilac grey
  [255, 120, 180],   // 1 the pink letters
  [140, 240, 255],   // 2 the glass
  [205, 150, 255],   // 3 the border tube
  [255, 196, 120],   // 4 bulbs, windows, the alley lamp
  [255, 216, 150],   // 5 the street lamp
  [190, 255, 225],   // 6 the pawn shop's tube
  [215, 235, 255],   // 7 the phone booth
];
const LIGHTS = [
  { type: 1, x: SIGN_LIGHT.pink[0], y: SIGN_LIGHT.pink[1], r: 78, k: 1.1, key: 'pink' },
  { type: 2, x: SIGN_LIGHT.cyan[0], y: SIGN_LIGHT.cyan[1], r: 46, k: 1.1, key: 'cyan' },
  { type: 3, x: SIGN_LIGHT.violet[0], y: SIGN_LIGHT.violet[1], r: 70, k: 0.5, key: 'violet' },
  { type: 4, x: SIGN_LIGHT.amber[0], y: SIGN_LIGHT.amber[1], r: 28, k: 0.9, key: 'bulbs' },
  { type: 4, x: WIN.x + 22, y: 122, r: 30, k: 0.55, key: 'one' },
  { type: 4, x: 277, y: 110, r: 24, k: 0.7, key: 'one' },
  { type: 5, x: LAMP.x, y: LAMP.y + 4, r: 34, k: 1, key: 'one' },
  { type: 6, x: TUBE.x + 15, y: TUBE.y + 2, r: 38, k: 0.9, key: 'tube' },
  { type: 7, x: BOOTH.x + 6, y: BOOTH.y - 24, r: 26, k: 0.9, key: 'one' },
];
let LT = 0, LI = 0;   // result of lightAt: the dominant type and the total intensity (no allocation per drop)
function lightAt(x, y, I) {
  let best = 0, total = 0;
  LT = 0;
  for (const L of LIGHTS) {
    const dx = x - L.x, dy = y - L.y, q = dx * dx + dy * dy;
    if (q >= L.r * L.r) continue;
    let f = 1 - Math.sqrt(q) / L.r;
    f *= f * L.k * I[L.key];
    total += f;
    if (f > best) { best = f; LT = L.type; }
  }
  // the street lamp's cone, leaning a little with the wind: bright near the lens, fading down to the road
  const dy = y - LAMP.y;
  if (dy > 2) {
    const hw = 4 + dy * 0.42, dx = Math.abs(x - LAMP.x + 2 + dy * 0.03);
    if (dx < hw) {
      const f = (1 - dx / hw) * (1 - smooth(0, 200, dy) * 0.7) * 1.2;
      total += f;
      if (f > best) { best = f; LT = 5; }
    }
  }
  LI = total;
}

// ---------------------------------------------------------------- drops
// far: between the mid row and the bar row, thin and slow; mid: in front of the facades; near: in front of the car
const DEPTHS = {
  far: { n: 380, v: 150, len: [1, 2], lvl: [1, 4], bottom: GY, seed: 1 },
  mid: { n: 600, v: 240, len: [3, 5], lvl: [2, 7], bottom: LH, seed: 2 },
  near: { n: 90, v: 430, len: [6, 10], lvl: [2, 8], bottom: LH, seed: 3 },
};
const TOP = -14, MIDY = 108, PAD = 96, EDGE = 12;
const LEVELS = 9;                        // alpha steps of a bucket
const alphaOf = (lvl) => 0.05 + lvl * 0.1;

export function buildRain() {
  const R = { depths: {}, slant: new Float64Array(81), t0: 0, I: null, styles: [], buckets: [] };
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
  // the rain in front (middle and near depths, and the curtains) is drawn at the logical resolution into one canvas,
  // blitted once: cheap, and the drops stay on the pixel grid
  R.front = canvas(LW + 2 * EDGE, LH);
  // a soft vertical band for the curtains of a gust (drawn skewed along the rain)
  const { c, g } = canvas(32, 1);
  for (let x = 0; x < 32; x++) { g.fillStyle = `rgba(190,180,215,${Math.exp(-(((x - 15.5) / 8) ** 2)).toFixed(3)})`; g.fillRect(x, 0, 1, 1); }
  R.band = c;
  return R;
}

// per frame: the wind over the last and next 2 s (for the drift of the drops), the curtains, the lights' intensities
export function rainFrame(R, t, w, I) {
  R.t0 = t - 2;
  for (let k = 0; k <= 80; k++) R.slant[k] = windState(R.t0 + k * 0.05).slant;
  R.w = w; R.I = I;
  R.t = t;
  R.density = 0.55 + 0.45 * w.gust;
  // curtains: three bands riding the gust from the right, crossing the whole picture
  const age = t - w.last.start;
  R.curtains = w.gust > 0.02 ? [0, 1, 2].map((j) => LW + 60 + j * 150 + hash(w.last.k + j) * 50 - age * 190) : [];
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

// one depth of rain into g (a layer canvas, or the front canvas), shifted by (ox, oy) rounded to whole pixels
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
    lightAt(x, y, R.I);
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
// the rain in front of the facades and of the car, with the curtains of a gust, blitted at the near plane's offset
// (fx, fy); the middle depth keeps its own parallax (mx, my) inside it
export function drawFrontRain(R, ctx, mx, my, fx, fy) {
  const g = R.front.g;
  g.clearRect(0, 0, R.front.c.width, R.front.c.height);
  drawRain(R, 'mid', g, EDGE + mx - fx, my - fy);
  if (R.curtains.length) {
    g.save();
    g.imageSmoothingEnabled = true;
    g.globalAlpha = 0.11 * R.w.gust;
    g.setTransform(1, 0, -R.w.slant, 1, EDGE + Math.round(mx - fx), 0);
    for (const xc of R.curtains) g.drawImage(R.band, xc + R.w.slant * MIDY - 30, -10, 60, LH + 20);
    g.restore();
  }
  drawRain(R, 'near', g, EDGE, 0);
  ctx.drawImage(R.front.c, fx - EDGE, fy);
}

// ---------------------------------------------------------------- splashes
// surfaces: segments (x0, x1) from height ya to yb, or a band of depth (y0..y1) of flat ground; n: how many slots
const SPLASH = {
  ground: [
    { x0: -40, x1: LW + 40, y0: GY + 1, y1: KERB - 1, n: 26 },
    { x0: -40, x1: LW + 40, y0: KERB, y1: KERB, n: 8 },
    { x0: 100, x1: LW + 40, y0: ROAD + 1, y1: LH - 2, n: 40 },
  ],
  bar: [
    { x0: 172, x1: 220, ya: 102, yb: 102, n: 6 },            // canopy
    { x0: WIN.x - 3, x1: WIN.x + WIN.w + 3, ya: WIN.y + WIN.h + 1, yb: WIN.y + WIN.h + 1, n: 4 },   // window sill
    { x0: 154, x1: 238, ya: 69, yb: 69, n: 7 },              // the top of the sign
    { x0: 285, x1: 296, ya: 133, yb: 133, n: 2 },            // dustbin lid
    { x0: 126, x1: 140, ya: 78, yb: 78, n: 2 },              // transformer
    { x0: BOOTH.x, x1: BOOTH.x + BOOTH.w, ya: BOOTH.y - BOOTH.h - 1, yb: BOOTH.y - BOOTH.h - 1, n: 3 },
    { x0: 226, x1: 233, ya: 145, yb: 145, n: 2 },            // hydrant
  ],
  fg: [
    { x0: -58, x1: 23, ya: 136, yb: 136, n: 12 },            // car roof
    { x0: 47, x1: 94, ya: 157, yb: 157, n: 9 },              // trunk lid
    { x0: 24, x1: 46, ya: 137, yb: 156, n: 3 },              // rear window
  ],
};
const SEED = { ground: 100, bar: 300, fg: 500 };
// splash ticks (two frames: the hit, then a little crown) on one group of surfaces, into g shifted by (ox, oy)
export function drawSplashes(R, group, g, ox, oy) {
  const t = R.t, list = SPLASH[group];
  let slot = 0;
  for (const s of list) {
    for (let j = 0; j < s.n; j++, slot++) {
      const seed = SEED[group] + slot, per = 0.22 + hash(seed + 0.1) * 0.28;
      const u = t + hash(seed + 0.2) * per, c = Math.floor(u / per), a = u - c * per;
      if (a > 2 / 30 || hash(c * 1.71 + seed * 0.37) > R.density * 1.15) continue;
      const k = hash(c * 3.13 + seed * 0.71);
      const x = Math.round(s.x0 + k * (s.x1 - s.x0));
      const y = Math.round(s.ya !== undefined ? s.ya + (s.yb - s.ya) * k : s.y0 + hash(c * 5.3 + seed) * (s.y1 - s.y0));
      const big = s.ya === undefined ? persp(y) > 1 : group === 'fg';
      lightAt(x, s.ya === undefined ? 2 * GY - y - 40 : y - 2, R.I);
      const lvl = Math.round(3 + 5 * Math.min(1, LI));
      if (a < 1 / 30) { add(R, LT, lvl, x, y - 1); add(R, LT, lvl - 2, x, y - 2); }
      else {
        add(R, LT, lvl - 2, x - 1, y - 1); add(R, LT, lvl - 2, x + 1, y - 1);
        if (big) { add(R, LT, lvl - 3, x - 2, y - 2); add(R, LT, lvl - 3, x + 2, y - 2); }
      }
    }
  }
  flush(R, g, ox, oy);
}

// ---------------------------------------------------------------- the wet ground (into the ground layer, layer coords)
// rings in the puddles, wind ripples running over them in a gust, the gutter running to its drain
export function drawGroundWater(R, g) {
  const t = R.t, gust = R.w.gust;
  const area = PUDDLES.map((p) => p[2] * p[3]), total = area.reduce((a, b) => a + b, 0);
  for (let j = 0; j < 40; j++) {
    const per = 0.85 + hash(j + 0.5) * 0.7, u = t + hash(j) * per, c = Math.floor(u / per), a = u - c * per, life = 0.8;
    if (a > life || hash(c * 2.3 + j) > R.density * 1.2) continue;
    let pick = hash(c * 1.9 + j * 0.3) * total, p = 0;
    while (pick > area[p]) pick -= area[p++];
    const [px0, py0, pw, ph] = PUDDLES[p], q = hash(c * 4.1 + j);
    const x = px0 + 3 + q * (pw - 6), y = py0 + ph / 2 + (hash(c * 6.7 + j) - 0.5) * ph * 0.6, sc = persp(y);
    const rad = (1 + a * 7) * sc, lvl = Math.round((1 - a / life) * 5 + 0.4);
    lightAt(x, 2 * GY - y - 40, R.I);
    const l = lvl + Math.round(2 * Math.min(1, LI));
    const ry = Math.max(1, Math.round(rad * 0.28)), w = Math.round(rad * 1.5);
    for (let k = -w; k <= w; k += 1) { add(R, LT, l, Math.round(x + k), Math.round(y - ry)); if (Math.abs(k) < w - 1) add(R, LT, l - 1, Math.round(x + k), Math.round(y + ry)); }
    add(R, LT, l - 1, Math.round(x - w - 1), Math.round(y)); add(R, LT, l - 1, Math.round(x + w + 1), Math.round(y));
  }
  if (gust > 0.08) {
    PUDDLES.forEach(([px0, py0, pw, ph], p) => {
      for (let j = 0; j < 3; j++) {
        const x = px0 + pw - ((t * (34 + 20 * gust) + j * pw / 3 + p * 7) % pw), y = py0 + 1 + Math.floor(hash(p * 3 + j) * Math.max(1, ph - 2));
        lightAt(x, 2 * GY - y - 40, R.I);
        const l = Math.round(gust * (2 + 4 * Math.min(1, LI)));
        for (let k = 0; k < 2 + j; k++) add(R, LT, l, Math.round(x + k), y);
      }
    });
  }
  // the gutter: from the drainpipe on the right and from the left, glints running to the grate
  const gy = KERB + 5;
  for (const [x0, x1, dir] of [[304, DRAIN.x + 3, -1], [168, DRAIN.x - 2, 1]]) {
    const len = Math.abs(x1 - x0);
    for (let k = 0; k < 14; k++) {
      const x = x0 + dir * ((t * 22 + k * len / 14 + hash(k) * 4) % len);
      lightAt(x, 2 * GY - gy - 40, R.I);
      add(R, LT, 2 + Math.round(3 * Math.min(1, LI)), Math.round(x), gy + (k % 3 === 0 ? 1 : 0));
    }
  }
  // the drainpipe's sheet of water crossing the pavement to the gutter
  for (let y = GY + 1; y < KERB + 5; y++) if (hash(y * 1.3 + Math.floor(t * 14)) > 0.35) add(R, 4, 3, 300 + (y > KERB ? 1 : 0), y);
  flush(R, g, M, MY);
}

// bounce mist: rain smashing on the car's roof and on the road under the lamp (screen context, additive)
export function drawMist(R, ctx, fx, fy, rx, ry) {
  const t = R.t, k = R.density;
  ctx.globalCompositeOperation = 'lighter';
  for (let x = -40; x < 24; x += 4) {
    const a = (0.05 + 0.08 * hash(x * 0.7 + Math.floor(t * 15))) * k;
    ctx.fillStyle = `rgba(255,140,190,${a.toFixed(3)})`;
    ctx.fillRect(x + fx, 134 + fy, 5, 2);
  }
  for (let x = LAMP.x - 46; x < LAMP.x + 40; x += 5) {
    const y = 196 + Math.round(hash(x * 0.3) * 14), a = (0.04 + 0.06 * hash(x * 1.1 + Math.floor(t * 12))) * k;
    ctx.fillStyle = `rgba(255,214,150,${a.toFixed(3)})`;
    ctx.fillRect(x + rx, y + ry, 6, 2);
  }
  ctx.globalCompositeOperation = 'source-over';
}
