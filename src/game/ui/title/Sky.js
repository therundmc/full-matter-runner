// The sky in the slit between the towers: the night in flat steps, darkest at the top, warming toward the city's glow
// low down, a few faint stars, and a thin deck of cloud lit from below drifting slowly across.
import { LW, canvas, rand, oval } from './Draw.js';

const SKY_H = 150;                               // the sky's canvas: what any building leaves of it
const TILE = LW * 2;                             // the cloud deck loops on that width

// the night in steps: each band's colour and its lower edge (wavy, as if the steps were thin cloud layers)
const BANDS = [['#09070f', 12], ['#0c0a16', 26], ['#100c1d', 40], ['#140f24', 54], ['#19122a', 66], ['#1f1630', 78], ['#261a35', 90], ['#2e1e39', 102], ['#38233c', SKY_H]];
export function buildSky() {
  const { c, g } = canvas(LW, SKY_H), r = rand(71);
  g.fillStyle = BANDS[BANDS.length - 1][0];
  g.fillRect(0, 0, LW, SKY_H);
  for (let i = BANDS.length - 2; i >= 0; i--) {
    const [col, y1] = BANDS[i], ph = r() * 6, amp = 1 + r() * 1.5;
    g.fillStyle = col;
    for (let x = 0; x < LW; x++) g.fillRect(x, 0, 1, Math.round(y1 + Math.sin(x * 0.031 + ph) * amp + Math.sin(x * 0.11 + ph * 2) * 0.8));
  }
  for (let i = 0; i < 14; i++) { g.fillStyle = i % 4 ? '#2a2240' : '#3e3460'; g.fillRect(Math.floor(r() * LW), Math.floor(r() * 50), 1, 1); }
  return c;
}

// the deck of cloud: a few long blobs with a body, a lit belly (the city's glow from below) and a dark back, painted on
// a tile that loops
export function buildCloud() {
  const { c, g } = canvas(TILE, SKY_H), r = rand(11), blobs = [];
  for (let i = 0; i < 12; i++) {
    const cx = r() * TILE, cy = 18 + r() * 60, w = 24 + r() * 40, h = 1.5 + r() * 2;
    blobs.push([cx, cy, w, h]);
    if (r() < 0.6) blobs.push([cx + (r() - 0.5) * w, cy - h * 0.5, w * 0.5, h * 0.8]);
  }
  blobs.sort((a, b) => a[1] - b[1]);
  for (const dx of [-TILE, 0, TILE]) for (const [x, y, w, h] of blobs) {
    oval(g, '#2a1c36', x + dx, y + 1.4, w, h);
    oval(g, '#1e1530', x + dx, y + 0.6, w * 0.97, h * 0.92);
    oval(g, '#150f24', x + dx - w * 0.12, y - h * 0.4, w * 0.6, h * 0.5);
  }
  return c;
}
// the deck, scrolled by `off` (px) and shifted by the parallax (ox, oy)
export function drawCloud(ctx, deckC, off, ox, oy) {
  const x = -(((off % TILE) + TILE) % TILE) + ox;
  ctx.drawImage(deckC, Math.round(x), Math.round(oy));
  ctx.drawImage(deckC, Math.round(x + TILE), Math.round(oy));
}
