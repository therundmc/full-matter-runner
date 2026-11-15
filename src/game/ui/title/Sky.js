// The sky over the city: the night in flat steps, darkest at the top, warming toward the skyline with the city's
// glow; two decks of low cloud lit from below (a slow high one, a faster broken scud in front of the tall towers'
// tops); two searchlights sweeping the cloud base from behind the skyline; an airliner going over now and then; and
// rarely, far beyond the city, sheet lightning and a bolt.
import { LW, canvas, rand, poly, oval, line } from './Draw.js';
import { hash, BEAMS } from './Timeline.js';
import { HORIZON, CLOUD_BASE } from './Layout.js';

const SKY_H = 140;                        // the sky's canvas: what any building leaves of it
const TILE = LW * 2;                             // the cloud decks loop on that width

// the night in steps: each band's colour and its lower edge (wavy, as if the steps were thin cloud layers)
const BANDS = [['#09060f', 10], ['#0c0815', 22], ['#100a1b', 34], ['#140d21', 46], ['#1a1027', 58], ['#20132c', 70], ['#271731', 80], ['#2f1b35', 88], ['#3a2139', 95], ['#46283c', SKY_H]];
export function buildSky() {
  const { c, g } = canvas(LW, SKY_H), r = rand(71);
  // from the bottom band up, each filled from the top down to its own wavy lower edge
  g.fillStyle = BANDS[BANDS.length - 1][0];
  g.fillRect(0, 0, LW, SKY_H);
  for (let i = BANDS.length - 2; i >= 0; i--) {
    const [col, y1] = BANDS[i], ph = r() * 6, amp = 1 + r() * 1.5;
    g.fillStyle = col;
    for (let x = 0; x < LW; x++) g.fillRect(x, 0, 1, Math.round(y1 + Math.sin(x * 0.031 + ph) * amp + Math.sin(x * 0.11 + ph * 2) * 0.8));
  }
  // a few stars between the clouds, very faint
  for (let i = 0; i < 18; i++) { g.fillStyle = i % 4 ? '#2a2040' : '#3c3058'; g.fillRect(Math.floor(r() * LW), Math.floor(r() * 30), 1, 1); }
  return c;
}

// a deck of cloud: blobs with a body, a lit belly (the city's glow from below) and a dark back, painted on a tile
// that loops. opts: seed, n blobs, y range, size range, tones [back, body, belly, rim]
function deck({ seed, n, y0, y1, rx, ry, tones, gaps = 0 }) {
  const { c, g } = canvas(TILE, SKY_H), r = rand(seed);
  const blobs = [];
  for (let i = 0; i < n; i++) {
    const cx = r() * TILE, cy = y0 + r() * (y1 - y0);
    if (gaps && Math.sin(cx / TILE * Math.PI * 2 * gaps + seed) > 0.35) continue;        // broken scud: holes in it
    const w = rx[0] + r() * (rx[1] - rx[0]), h = ry[0] + r() * (ry[1] - ry[0]);
    // a cluster: a wide base and a few heads on it
    blobs.push([cx, cy, w, h]);
    for (let j = 0, m = Math.floor(r() * 3); j < m; j++) blobs.push([cx + (r() - 0.5) * w * 1.4, cy - h * (0.2 + r() * 0.4), w * (0.35 + r() * 0.35), h * (0.6 + r() * 0.3)]);
  }
  blobs.sort((a, b) => a[1] - b[1]);
  const [back, body, belly, rim] = tones;
  for (const dx of [-TILE, 0, TILE]) for (const [x, y, w, h] of blobs) {
    oval(g, rim, x + dx, y + 1.6, w, h);
    oval(g, belly, x + dx, y + 0.8, w * 0.98, h * 0.94);
    oval(g, body, x + dx - 0.5, y - 0.6, w * 0.94, h * 0.86);
    oval(g, back, x + dx - w * 0.15, y - h * 0.5, w * 0.6, h * 0.45);
  }
  return c;
}
export function buildClouds() {
  return {
    high: deck({ seed: 11, n: 30, y0: 2, y1: 38, rx: [30, 70], ry: [2, 4], tones: ['#100b1c', '#140e22', '#1b1229', '#22162f'] }),
    scud: deck({ seed: 29, n: 22, y0: 34, y1: 62, rx: [14, 34], ry: [1.5, 3], tones: ['#160e20', '#1c1228', '#271830', '#332038'], gaps: 3 }),
  };
}
// one deck, scrolled by `off` (px) and shifted by the parallax (ox, oy)
export function drawDeck(ctx, deckC, off, ox, oy) {
  const x = -(((off % TILE) + TILE) % TILE) + ox;
  ctx.drawImage(deckC, Math.round(x), Math.round(oy));
  ctx.drawImage(deckC, Math.round(x + TILE), Math.round(oy));
}

// the searchlights: a narrow beam from behind the skyline up to the cloud base, a brighter core, a lit patch where it
// hits (drawn with 'lighter'); angles from Timeline.beamAngles
export function drawBeams(ctx, angles, ox, oy, t) {
  ctx.globalCompositeOperation = 'lighter';
  BEAMS.forEach((b, i) => {
    const a = angles[i], base = HORIZON + 6, top = CLOUD_BASE + 3 * Math.sin(t * 0.4 + i * 2), len = base - top;
    const x0 = b.x + ox, y0 = base + oy, x1 = x0 + Math.tan(a) * len, y1 = top + oy, s = 1 / Math.cos(a);
    poly(ctx, 'rgba(150,150,215,0.07)', [[x0 - 1.5, y0], [x0 + 1.5, y0], [x1 + 10 * s, y1], [x1 - 10 * s, y1]]);
    poly(ctx, 'rgba(170,170,230,0.07)', [[x0 - 0.5, y0], [x0 + 0.5, y0], [x1 + 4 * s, y1], [x1 - 4 * s, y1]]);
    oval(ctx, 'rgba(150,140,210,0.07)', x1, y1, 22, 5);
    oval(ctx, 'rgba(170,160,230,0.08)', x1, y1 - 0.5, 13, 3);
  });
  ctx.globalCompositeOperation = 'source-over';
}

// the airliner: a dark speck, its wingtips red and green, the strobe and the beacon
export function drawPlane(ctx, P, ox, oy) {
  if (!P) return;
  const x = Math.round(P.x + ox), y = Math.round(P.y + oy), d = P.dir;
  ctx.fillStyle = '#0c0814'; ctx.fillRect(x - 1, y, 3, 1);
  ctx.fillStyle = '#ff4a3a'; ctx.fillRect(x - 2 * d, y + 1, 1, 1);               // port
  ctx.fillStyle = '#4aff8a'; ctx.fillRect(x + 2 * d, y - 1, 1, 1);               // starboard
  if (P.beacon) { ctx.fillStyle = '#ff6a50'; ctx.fillRect(x, y + 1, 1, 1); }
  if (P.strobe) { ctx.fillStyle = '#ffffff'; ctx.fillRect(x - 2 * d, y + 1, 1, 1); ctx.fillRect(x + 2 * d, y - 1, 1, 1); }
}

// the far lightning: the sky behind the skyline whitening, the clouds lit from inside, the bolt itself at its peak
export function drawLightning(ctx, L, clouds, cloudOff, ox, oy) {
  if (L.flash <= 0) return;
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = L.flash * 0.22;
  ctx.fillStyle = '#8a78c8';
  ctx.fillRect(0, 0, LW, HORIZON + 10);
  ctx.globalAlpha = Math.min(1, L.flash * 1.6);
  drawDeck(ctx, clouds.high, cloudOff, ox, oy);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  if (!L.bolt) return;
  // the bolt: a walk down from the cloud base to the skyline, a branch or two off it
  let x = L.x + ox, y = CLOUD_BASE + 4 + oy;
  const k = L.k * 13.7;
  for (let i = 0; y < HORIZON + 8 + oy; i++) {
    const nx = x + (hash(k + i * 1.3) - 0.5) * 7, ny = y + 3 + hash(k + i * 2.1) * 4;
    line(ctx, '#f4eeff', x, y, nx, ny);
    if (hash(k + i * 3.7) > 0.78) {
      let bx = nx, by = ny;
      for (let j = 0; j < 3; j++) { const ex = bx + (hash(k + i + j * 5.1) - 0.3) * 6, ey = by + 2 + hash(k + j) * 3; line(ctx, '#a898e0', bx, by, ex, ey); bx = ex; by = ey; }
    }
    x = nx; y = ny;
  }
}
