// The title screen is seen from a window: his. Over the city (ui/TitleScene.js) come the glass and what is on it,
// the rain gathering in beads that run down, the mist in its corners; then the window's frame, a curtain on each
// side, and on the sill what he left there: an ashtray, a cigarette burning out, a bottle, a glass. The glass feels
// what goes on outside: it shivers as a train goes by, the beads catch a patrol car's red and blue, and lightning.
// Drawn in the title's logical px (ui/title/Draw.js LW x LH), the frame painted once.
import { LW, LH } from '../title/Draw.js';

export const FRAME = { top: 5, side: 6, sill: 10, curtain: 15 }; // px of the title's picture each takes
const BEADS = 54, SPECKS = 150;
let still = null;

const hash = (n) => { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };
const px = (g, col, x, y, w, h) => { g.fillStyle = col; g.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h)); };

function paintFrame() {
  const c = document.createElement('canvas');
  c.width = LW; c.height = LH;
  const g = c.getContext('2d'), F = FRAME, glass = LH - F.sill;
  // mist in the lower corners of the pane, where the room's warmth meets the night
  for (const x0 of [0, LW]) {
    const fog = g.createRadialGradient(x0, glass, 4, x0, glass, 120);
    fog.addColorStop(0, 'rgba(190,200,230,0.16)'); fog.addColorStop(1, 'rgba(190,200,230,0)');
    g.fillStyle = fog; g.fillRect(0, 0, LW, glass);
  }
  // the frame: head, jambs, the sill and its nosing
  px(g, '#0e0a12', 0, 0, LW, F.top); px(g, '#241a28', 0, F.top - 1, LW, 1);
  px(g, '#0e0a12', 0, 0, F.side, LH); px(g, '#241a28', F.side - 1, F.top, 1, glass - F.top);
  px(g, '#0e0a12', LW - F.side, 0, F.side, LH); px(g, '#241a28', LW - F.side, F.top, 1, glass - F.top);
  px(g, '#1a1220', 0, glass, LW, F.sill); px(g, '#3a2c3e', 0, glass, LW, 1); px(g, '#2a2030', 0, glass + 1, LW, 1);
  px(g, '#0a0710', 0, LH - 2, LW, 2);
  // the curtains, drawn back: folds, a hem lit by the street
  for (const [x0, w, dir] of [[0, F.curtain + 4, 1], [LW - F.curtain, F.curtain, -1]]) {
    px(g, '#140c1c', x0, 0, w, glass + 2);
    for (let i = 0; i < w; i += 4) px(g, '#1e1428', x0 + i + (dir > 0 ? 2 : 0), 0, 1, glass + 1);
    px(g, '#3a2440', dir > 0 ? x0 + w - 1 : x0, 0, 1, glass);
    for (let y = 6; y < glass; y += 9) px(g, '#0c0812', dir > 0 ? x0 + w - 3 : x0 + 1, y, 2, 3);
  }
  // on the sill: an ashtray, a bottle of rum, a glass
  const y = glass;
  px(g, '#3a3644', 40, y - 3, 14, 3); px(g, '#565064', 40, y - 3, 14, 1); px(g, '#1c1a24', 42, y - 2, 10, 1);
  px(g, '#d8d2c4', 49, y - 5, 7, 1); px(g, '#c89a50', 55, y - 5, 2, 1);                 // the cigarette across its rim
  px(g, '#2a1608', 312, y - 22, 9, 22); px(g, '#5a3416', 313, y - 22, 2, 22); px(g, '#2a1608', 315, y - 28, 3, 6);
  px(g, '#c8a040', 315, y - 30, 3, 2); px(g, '#d8c8a0', 312, y - 13, 9, 7); px(g, '#8a7a50', 313, y - 11, 7, 1);
  px(g, 'rgba(200,220,255,0.28)', 328, y - 10, 8, 10); px(g, 'rgba(255,255,255,0.5)', 328, y - 10, 1, 10);
  px(g, 'rgba(160,90,30,0.55)', 329, y - 4, 6, 4);
  return c;
}

// one bead of rain: it gathers a while where it landed, then lets go and runs, faster and faster, leaving its track;
// (jx, jy): the glass shivering; tint: [r, g, b, k] a light outside caught in it, or null
function bead(g, i, t, jx, jy, tint) {
  const F = FRAME, x0 = F.side + 2 + hash(i) * (LW - 2 * F.side - 4) + jx, y0 = F.top + 2 + hash(i + 0.31) * (LH - F.sill) * 0.55 + jy;
  const period = 3.5 + hash(i + 0.57) * 7, ph = (t / period + hash(i + 0.83)) % 1, hold = 0.3 + hash(i + 0.11) * 0.3;
  const foot = LH - F.sill - 1;
  let x = x0, y = y0, big = ph < hold ? 1 + (ph / hold > 0.6 ? 1 : 0) : 2;
  if (ph >= hold) {
    const k = (ph - hold) / (1 - hold), run = k * k * (foot - y0 + 12);
    y = y0 + run;
    x = x0 + Math.sin(y * 0.11 + i) * 1.6;
    // its track, drying from the top
    for (let ty = y0; ty < Math.min(y, foot); ty += 2) {
      const a = 0.2 * (1 - (y - ty) / (run + 1) * 0.8);
      px(g, `rgba(170,205,255,${a.toFixed(3)})`, x0 + Math.sin(ty * 0.11 + i) * 1.6, ty, 1, 2);
    }
    if (y > foot) return;
  }
  px(g, 'rgba(120,160,220,0.5)', x, y, big, big + 1);
  if (tint) px(g, `rgba(${tint[0]},${tint[1]},${tint[2]},${(0.7 * tint[3] * y / LH).toFixed(3)})`, x, y, big, big + 1);
  px(g, 'rgba(255,255,255,0.75)', x, y, 1, 1);
  px(g, 'rgba(6,4,18,0.45)', x, y + big + 1, big, 1);
}

// g: a context in the title's logical px; fx: what the glass feels of the outside (TitleScene.drawTitleScene):
// { shake 0..1, tint [r, g, b, k] or null, flash 0..1 }
export function drawPane(g, t, fx = null) {
  if (!still) still = paintFrame();
  const F = FRAME, shake = fx?.shake || 0, tint = fx?.tint && fx.tint[3] > 0.05 ? fx.tint : null, flash = fx?.flash || 0;
  // the train shakes the pane: what is on it trembles by a pixel, quicker than the eye
  const n = Math.floor(t * 30), jx = shake > 0.15 ? Math.round((hash(n) - 0.5) * 2.4 * shake) : 0, jy = shake > 0.3 ? Math.round((hash(n + 0.5) - 0.5) * 2 * shake) : 0;
  // droplets that sit there, catching the neon (and whatever flashes outside)
  for (let i = 0; i < SPECKS; i++) {
    const x = F.side + hash(i + 7.7) * (LW - 2 * F.side) + jx, y = F.top + hash(i + 3.3) * (LH - F.sill - F.top) + jy;
    const a = Math.min(0.8, 0.12 + 0.2 * hash(i + 1.9) * (0.6 + 0.4 * Math.sin(t * (0.6 + hash(i)) + i)) + flash * 0.4);
    const lit = tint && hash(i + 5.5) < y / LH;                                      // the lower on the glass, the nearer the street
    px(g, lit ? `rgba(${tint[0]},${tint[1]},${tint[2]},${(a * (0.5 + tint[3])).toFixed(3)})` : `rgba(200,225,255,${a.toFixed(3)})`, x, y, 1, 1);
  }
  for (let i = 0; i < BEADS; i++) bead(g, i, t, jx, jy, tint);
  g.drawImage(still, 0, 0);
  // the cigarette: its ember breathing, a thread of smoke leaning in the draught
  const y = LH - F.sill, glow = 0.55 + 0.45 * Math.sin(t * 1.7) * Math.sin(t * 0.6 + 2);
  px(g, `rgba(255,${Math.round(90 + 90 * glow)},40,${(0.6 + 0.4 * glow).toFixed(3)})`, 56, y - 5, 1, 1);
  for (let i = 0; i < 16; i++) {
    const k = i / 16, sx = 57 + Math.sin(t * 0.9 + k * 5) * (1 + k * 5) + k * 6;
    px(g, `rgba(210,205,225,${(0.2 * (1 - k)).toFixed(3)})`, sx, y - 7 - i * 2.4, 1 + (k > 0.5 ? 1 : 0), 2);
  }
}
