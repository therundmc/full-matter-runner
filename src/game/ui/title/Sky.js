// The sky over the towers, at the hour of the moment (ui/title/Cycle.js): bands of flat colour from the top down to
// the city's horizon, their edges a little wavy like thin layers of cloud; the stars coming out one by one; a deck
// of cloud drifting across, lit from below by the sunset or the city, white by day; the sun and the moon on their way.
// The bands, the stars and the deck are repainted when the palette steps (paintSky, paintCloud: the same shapes in the
// new colours), the sun and the moon drawn per frame, the deck slid along by Timeline.cloudDrift.
import { LW, canvas, rand, oval } from './Draw.js';
import { mix, css } from './Cycle.js';

const SKY_H = 150;                               // the sky's canvas: what any building leaves of it
const TILE = LW * 2;                             // the cloud deck loops on that width
const HORIZON = 118;                             // where the last band reaches (the far buildings stand on it)
const BANDS = 11;                                // the six colours of the hour and a step between each two

export function buildSky() {
  const r = rand(71), edges = [];
  for (let i = 0; i < BANDS - 1; i++) {
    const y1 = HORIZON * Math.pow((i + 1) / BANDS, 0.8), ph = r() * 6, amp = 1 + r() * 1.5, e = new Int16Array(LW);
    for (let x = 0; x < LW; x++) e[x] = Math.round(y1 + Math.sin(x * 0.031 + ph) * amp + Math.sin(x * 0.11 + ph * 2) * 0.8);
    edges.push(e);
  }
  const stars = [];
  for (let i = 0; i < 40; i++) stars.push([Math.floor(r() * LW), Math.floor(r() * 64), r() < 0.25]);
  return { ...canvas(LW, SKY_H), edges, stars };
}

// the colour of band i (0 at the top) of the hour
const bandCol = (P, i) => (i % 2 ? mix(P.sky[(i - 1) / 2], P.sky[(i + 1) / 2], 0.5) : P.sky[i / 2]);

// the sky of the palette P (Cycle.lookAt) into its canvas
export function paintSky(S, P) {
  const g = S.g;
  g.fillStyle = css(bandCol(P, BANDS - 1));
  g.fillRect(0, 0, LW, SKY_H);
  for (let i = BANDS - 2; i >= 0; i--) {
    g.fillStyle = css(bandCol(P, i));
    const e = S.edges[i];
    for (let x = 0; x < LW;) {                   // runs of the same height in one rectangle
      let x1 = x + 1;
      while (x1 < LW && e[x1] === e[x]) x1++;
      g.fillRect(x, 0, x1 - x, e[x]);
      x = x1;
    }
  }
  // the stars come out one by one, the brighter ones first
  const n = Math.round(S.stars.length * P.stars);
  for (let i = 0; i < n; i++) {
    const [x, y, big] = S.stars[i];
    g.fillStyle = big ? '#4a4070' : '#2e2648';
    g.fillRect(x, y, 1, 1);
  }
}

// the deck of cloud: a few long blobs with a body, a lit belly and a darker back, on a tile that loops
export function buildCloud() {
  const r = rand(11), blobs = [];
  for (let i = 0; i < 12; i++) {
    const cx = r() * TILE, cy = 16 + r() * 54, w = 24 + r() * 40, h = 1.5 + r() * 2;
    blobs.push([cx, cy, w, h]);
    if (r() < 0.6) blobs.push([cx + (r() - 0.5) * w, cy - h * 0.5, w * 0.5, h * 0.8]);
  }
  blobs.sort((a, b) => a[1] - b[1]);
  return { ...canvas(TILE, SKY_H), blobs };
}
// the deck in the colours of the hour: P.cloud = [belly, body, back]
export function paintCloud(C, P) {
  const g = C.g, [belly, body, back] = P.cloud.map((c) => css(c));
  g.clearRect(0, 0, TILE, SKY_H);
  for (const dx of [-TILE, 0, TILE]) for (const [x, y, w, h] of C.blobs) {
    oval(g, belly, x + dx, y + 1.4, w, h);
    oval(g, body, x + dx, y + 0.6, w * 0.97, h * 0.92);
    oval(g, back, x + dx - w * 0.12, y - h * 0.4, w * 0.6, h * 0.5);
  }
}
// the deck, scrolled by `off` (px, Timeline.cloudDrift) and shifted by the parallax (ox, oy). It glides: its x is
// snapped to the screen's pixels (`dot`: one of them in logical px), not to the picture's, so a drift of a pixel or
// two a second moves it a screen pixel at a time instead of a whole logical one at a time
export function drawCloud(ctx, C, off, ox, oy, dot = 1) {
  const x = Math.round((-(((off % TILE) + TILE) % TILE) + ox) / dot) * dot, y = Math.round(oy);
  for (const dx of [-TILE, 0, TILE]) ctx.drawImage(C.c, x + dx, y);
}

// ---------------------------------------------------------------- the sun and the moon
// a light round them in a few flat rings ('lighter')
function rings(ctx, x, y, r, col, steps) {
  ctx.globalCompositeOperation = 'lighter';
  for (const [k, a] of steps) oval(ctx, css(col, a), x, y, r * k, r * k);
  ctx.globalCompositeOperation = 'source-over';
}
// The sun (Cycle.sunAt) at the parallax offset (ox, oy): white-gold high up, swollen and orange low down, where
// the haze of the city cuts it in stripes of the sky's colour; P: the palette of the hour.
export function drawSun(ctx, s, P, ox, oy) {
  if (!s) return;
  const x = Math.round(s.x + ox), y = Math.round(s.y + oy), low = 1 - Math.min(1, s.up / 0.35), r = s.r + Math.round(low);
  const rim = mix([255, 244, 214], [255, 150, 70], low), core = mix([255, 255, 246], [255, 214, 140], low);
  rings(ctx, x + 0.5, y + 0.5, r, rim, [[3.4, 0.05], [2.4, 0.07], [1.6, 0.1]]);
  oval(ctx, css(rim), x + 0.5, y + 0.5, r, r);
  oval(ctx, css(core), x + 0.5, y - 0.5, r - 1.5, r - 1.5);
  if (low > 0.2) {
    ctx.fillStyle = css(P.sky[5]);
    for (const [dy, h] of [[1, 1], [3, 1], [5, 2]]) if (dy < r) ctx.fillRect(x - r - 1, y + dy, 2 * r + 3, h);
  }
}
// the moon: pale, its seas, a faint ring
export function drawMoon(ctx, m, ox, oy) {
  if (!m) return;
  const x = Math.round(m.x + ox), y = Math.round(m.y + oy), r = m.r;
  rings(ctx, x + 0.5, y + 0.5, r, [190, 200, 255], [[3.2, 0.03], [2.1, 0.05]]);
  oval(ctx, '#e6e2d6', x + 0.5, y + 0.5, r, r);
  oval(ctx, '#bdb8b0', x + 1.5, y + 0.5, r - 1, r);
  ctx.fillStyle = '#a8a29c';
  ctx.fillRect(x - 1, y - 1, 2, 1); ctx.fillRect(x + 1, y + 1, 1, 2); ctx.fillRect(x - 2, y + 2, 1, 1);
}
