// Title screen: the entrance of a dive bar at night, seen side-on from across a wet street, in layered parallax.
// The picture is pixel art at a low logical resolution (LW x LH). Every static layer is painted once into its own
// cached canvas (lit once, per pixel, by the scene's lights); per frame the layers are only blitted, shifted by the
// eased mouse + a slow idle sway (near layers much more than far ones), and the live bits drawn on top: the tired
// neon, its glow on the wall and in the puddles, the window shadows, the doorman's cigarette, steam, moths,
// drizzle in the street lamp and, now and then, the headlights of a car passing behind the viewer.
import { PALETTE } from '../Config.js';
import { text, glitchText, neon } from './Text.js';

const LW = 384, LH = 216;           // logical picture
const M = 58, MY = 16;              // layer margins: room for the parallax shift
const CW = LW + 2 * M, CH = LH + 2 * MY;
const RX = 110, RY = 26;            // parallax range in logical px for a factor of 1
const GY = 146;                     // foot of the facades
const KERB = 158;                   // kerb top
const ROAD = 165;                   // road starts (after kerb face + gutter)
const F = { far: 0.02, mid: 0.05, bar: 0.1, near: 0.24, fg: 0.36 };
const SIGN = { x: 176, y: 82 };     // top-left of the BAR neon
const LAMP = { x: 338, y: 32 };     // street lamp lens
const ROOF = 74;                    // the bar's parapet
const TUBE = { x: 22, y: 110, w: 30 };   // fluorescent tube over the pawn shop
const COLD = [0.62, 1, 0.82];
const WARM = [1, 0.62, 0.3], AMBER = [1, 0.66, 0.32], PINK = [1, 0.17, 0.45], CYAN = [0.12, 0.85, 0.95];
const AMB = [0.24, 0.18, 0.36];

// ground row parallax: the far edge of the pavement moves with the facades, the bottom of the screen with the near plane
const rowF = (y) => F.bar + Math.max(0, Math.min(1, (y - GY) / (LH - GY))) * (F.near - F.bar);

// ---------------------------------------------------------------- small drawing helpers
function canvas(w = CW, h = CH) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  g.imageSmoothingEnabled = false;
  return { c, g };
}
function rand(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const hash = (n) => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const smooth = (a, b, v) => { const k = clamp((v - a) / (b - a), 0, 1); return k * k * (3 - 2 * k); };
function px(g, col, x, y, w = 1, h = 1) { g.fillStyle = col; g.fillRect(Math.round(x), Math.round(y), w, h); }
function line(g, col, x0, y0, x1, y1) {
  g.fillStyle = col;
  x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
  const dx = Math.abs(x1 - x0), sx = x0 < x1 ? 1 : -1, dy = -Math.abs(y1 - y0), sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  for (;;) {
    g.fillRect(x0, y0, 1, 1);
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) { err += dy; x0 += sx; }
    if (e2 <= dx) { err += dx; y0 += sy; }
  }
}
function poly(g, col, pts) {
  g.fillStyle = col;
  g.beginPath();
  pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
  g.closePath();
  g.fill();
}
// hard alpha edges after path fills (pixel art, no soft fringes)
function crisp(c) {
  const g = c.getContext('2d'), id = g.getImageData(0, 0, c.width, c.height), d = id.data;
  for (let i = 3; i < d.length; i += 4) d[i] = d[i] < 110 ? 0 : 255;
  g.putImageData(id, 0, 0);
}
// a little per pixel noise on the albedo: grit, and no flat programmer colour
function grain(c, amt, seed) {
  const g = c.getContext('2d'), id = g.getImageData(0, 0, c.width, c.height), d = id.data, r = rand(seed);
  for (let i = 0; i < d.length; i += 4) {
    if (!d[i + 3]) continue;
    const n = 1 + (r() - 0.5) * amt;
    d[i] *= n; d[i + 1] *= n; d[i + 2] *= n;
  }
  g.putImageData(id, 0, 0);
}
// lit = albedo * (ambient + lights); light { x, y, r, c, k, sy (vertical squash on the ground), up (factor above it) }
function shade(src, lights, amb, ambY = null) {
  const w = src.width, h = src.height;
  const d = src.px || (src.px = src.getContext('2d').getImageData(0, 0, w, h).data);   // read once per albedo
  const { c, g } = canvas(w, h);
  const od = g.createImageData(w, h), o = od.data;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      if (!d[i + 3]) continue;
      const lx = x - M, ly = y - MY, ka = ambY ? ambY(ly) : 1;
      let lr = amb[0] * ka, lg = amb[1] * ka, lb = amb[2] * ka;
      for (const L of lights) {
        const dx = lx - L.x, dy = (ly - L.y) * (L.sy || 1), q = dx * dx + dy * dy;
        if (q >= L.r * L.r) continue;
        let f = 1 - Math.sqrt(q) / L.r;
        f *= f * L.k;
        if (L.up !== undefined && ly < L.y) f *= L.up;
        lr += L.c[0] * f; lg += L.c[1] * f; lb += L.c[2] * f;
      }
      o[i] = d[i] * lr; o[i + 1] = d[i + 1] * lg; o[i + 2] = d[i + 2] * lb; o[i + 3] = d[i + 3];
    }
  }
  g.putImageData(od, 0, 0);
  return c;
}
// soft glow sprite: radial gradient, drawn scaled with smoothing on
function glowSprite(rgb, size = 64) {
  const { c, g } = canvas(size, size);
  const gr = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  gr.addColorStop(0, `rgba(${rgb},1)`);
  gr.addColorStop(0.25, `rgba(${rgb},0.45)`);
  gr.addColorStop(0.6, `rgba(${rgb},0.12)`);
  gr.addColorStop(1, `rgba(${rgb},0)`);
  g.fillStyle = gr;
  g.fillRect(0, 0, size, size);
  return c;
}
// cheap blur (works everywhere): down then up with smoothing
function blur(src, k) {
  const w = Math.max(1, Math.round(src.width / k)), h = Math.max(1, Math.round(src.height / k));
  const a = canvas(w, h); a.g.imageSmoothingEnabled = true; a.g.drawImage(src, 0, 0, w, h);
  const b = canvas(src.width, src.height); b.g.imageSmoothingEnabled = true; b.g.drawImage(a.c, 0, 0, src.width, src.height);
  return b.c;
}

// ---------------------------------------------------------------- neon tubes (local coords of each glyph)
const GLYPHS = {
  B: { x: 0, lines: [[0, 0, 0, 18], [0, 0, 8, 0], [8, 0, 11, 3], [11, 3, 11, 6], [11, 6, 8, 9], [8, 9, 0, 9], [8, 9, 11, 12], [11, 12, 11, 15], [11, 15, 8, 18], [8, 18, 0, 18]] },
  A: { x: 15, lines: [[0, 18, 0, 5], [0, 5, 5, 0], [5, 0, 6, 0], [6, 0, 11, 5], [11, 5, 11, 18], [0, 10, 11, 10]] },
  R: { x: 30, lines: [[0, 18, 0, 0], [0, 0, 8, 0], [8, 0, 11, 3], [11, 3, 11, 6], [11, 6, 8, 9], [8, 9, 0, 9], [5, 9, 11, 18]] },
  G: { x: 48, lines: [[0, 1, 14, 1], [0, 1, 7, 9], [14, 1, 7, 9], [7, 9, 7, 16], [3, 17, 11, 17], [12, -4, 6, 4]] },
};
function tubes(g, glyph, col, dx = 0, dy = 0) {
  const G = GLYPHS[glyph];
  for (const [a, b, c2, d] of G.lines) line(g, col, SIGN.x + G.x + a + dx, SIGN.y + b + dy, SIGN.x + G.x + c2 + dx, SIGN.y + d + dy);
}
// how much tube each column of a glyph holds (vertical strokes count most), keyed by logical x
function glyphCols(k) {
  const cols = {}, rec = { fillRect: (x) => { cols[x] = (cols[x] || 0) + 1; } };
  tubes(rec, k, '');
  return (x) => 0.25 + 0.75 * Math.min(1, (cols[x] || 0) / 10);
}
// a lit glyph: pink fringe + hot core, on a canvas the size of a layer
function litGlyph(glyph, fringe, core) {
  const { c, g } = canvas(); g.translate(M, MY);
  for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) tubes(g, glyph, fringe, dx, dy);
  tubes(g, glyph, core);
  if (glyph === 'G') { px(g, '#ff2a6d', SIGN.x + 48 + 4, SIGN.y + 3, 3, 2); px(g, '#ffd0e0', SIGN.x + 48 + 5, SIGN.y + 3); } // the olive
  return c;
}
// halo of a glyph, soft, at the layer's resolution (drawn with smoothing)
function haloGlyphs(list, col) {
  const { c, g } = canvas(); g.translate(M, MY);
  for (const k of list) for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1], [0, 0]]) tubes(g, k, col, dx, dy);
  return blur(blur(c, 3), 6);
}

// ---------------------------------------------------------------- layers
function buildSky() {
  const { c, g } = canvas(LW, LH);
  const gr = g.createLinearGradient(0, 0, 0, LH);
  for (const [y, col] of [[0, '#030108'], [30, '#090314'], [52, '#17052a'], [68, '#2e0a3e'], [84, '#4e1249'], [104, '#6e1c50'], [130, '#7c2453'], [LH, '#7c2453']]) gr.addColorStop(y / LH, col);
  g.fillStyle = gr;
  g.fillRect(0, 0, LW, LH);
  grain(c, 0.06, 3);
  const r = rand(11);
  for (let i = 0; i < 80; i++) {
    const x = r() * LW, y = r() * r() * 70, b = r();
    px(g, `rgba(255,236,250,${0.12 + b * 0.5})`, x, y);
    if (b > 0.94) { px(g, 'rgba(255,236,250,0.22)', x - 1, y); px(g, 'rgba(255,236,250,0.22)', x + 1, y); px(g, 'rgba(255,236,250,0.15)', x, y - 1); px(g, 'rgba(255,236,250,0.15)', x, y + 1); }
  }
  return c;
}
// thin wisps lit from below by the city, two screens wide for a seamless drift
function buildClouds() {
  const w = LW * 2, { c, g } = canvas(w, 100), r = rand(21);
  for (let i = 0; i < 30; i++) {
    const x = r() * w, y = 10 + r() * 76, len = 30 + r() * 100, h = 1 + Math.round(r() * 2);
    const a = 0.04 + r() * 0.12 * (y / 80);
    for (const o of [-w, 0, w]) {
      px(g, `rgba(160,56,128,${a})`, x + o, y, len, h);
      px(g, `rgba(210,90,150,${a * 0.7})`, x + o + len * 0.2, y + h, len * 0.6, 1);
      px(g, `rgba(110,36,100,${a * 0.7})`, x + o + len * 0.1, y - 1, len * 0.5, 1);
    }
  }
  return c;
}
// haze of the city between the far skyline and the nearer rows
function buildHaze() {
  const { c, g } = canvas(LW, LH);
  const gr = g.createLinearGradient(0, 50, 0, 140);
  gr.addColorStop(0, 'rgba(150,40,110,0)'); gr.addColorStop(1, 'rgba(150,40,110,0.3)');
  g.fillStyle = gr; g.fillRect(0, 50, LW, LH - 50);
  return c;
}

function buildFar(wins) {
  const { c, g } = canvas(), r = rand(7);
  g.translate(M, MY);
  const gr = g.createLinearGradient(0, 10, 0, 120);
  gr.addColorStop(0, '#170822'); gr.addColorStop(1, '#2a0e34');
  let x = -M;
  while (x < LW + M) {
    const w = 8 + Math.floor(r() * 18);
    const d = Math.abs(x + w / 2 - 192) / 192;      // 0 centre .. 1 edge
    const top = Math.round(60 + r() * 10 - 48 * smooth(0.42, 1.05, d) - (r() < 0.25 ? r() * 12 : 0));
    g.fillStyle = gr;
    g.fillRect(x, top, w, GY - top);
    const k = r();
    if (k < 0.3) g.fillRect(x + 2, top - 3, w - 4, 3);
    else if (k < 0.45) { g.fillRect(x + w / 2 - 2, top - 5, 4, 5); g.fillRect(x + w / 2, top - 10, 1, 5); }
    for (let wy = top + 4; wy < 110; wy += 3) {
      for (let wx = x + 2; wx < x + w - 2; wx += 3) {
        const q = r();
        if (q < 0.045) px(g, `rgba(${r() < 0.75 ? '235,170,90' : '150,200,255'},${0.3 + r() * 0.45})`, wx, wy);
        else if (q < 0.052) wins.push([wx, wy]);
      }
    }
    x += w + (r() < 0.2 ? 2 : 0);
  }
  // radio mast, left: lattice (its red light is live)
  g.fillStyle = '#170822';
  g.fillRect(14, 30, 17, GY);
  for (let y = 8; y < 30; y++) px(g, '#1e0b2a', 22 - Math.floor((y - 8) / 8), y, 1 + 2 * Math.floor((y - 8) / 8), 1);
  for (let y = 10; y < 30; y += 3) px(g, '#170822', 21 - Math.floor((y - 8) / 8), y, 3 + 2 * Math.floor((y - 8) / 8), 1);
  return c;
}

function buildMid() {
  const { c, g } = canvas(), r = rand(5);
  g.translate(M, MY);
  const body = '#120818', rim = '#3a1442', win = '#5a3422';
  const block = (x, w, top, wins = 0.05) => {
    px(g, body, x, top, w, GY - top);
    px(g, rim, x, top, w, 1);
    px(g, '#0c0512', x + w - 1, top, 1, GY - top);
    for (let y = top + 4; y < 116; y += 5) {
      for (let wx = x + 2; wx < x + w - 3; wx += 4) {
        const q = r();
        if (q < wins) px(g, q < wins * 0.3 ? '#b07038' : win, wx, y, 2, 2);
      }
    }
  };
  block(-M, 40, 24); block(-8, 26, 32); block(16, 34, 30, 0.08); block(48, 34, 34); block(80, 30, 48);
  block(106, 50, 66); block(156, 40, 69); block(194, 50, 65); block(244, 50, 68);
  block(296, 30, 40, 0.08); block(330, 30, 30); block(358, 40, 26); block(398, 40, 34);
  for (const [x, y, w, h] of [[116, 62, 6, 4], [126, 64, 3, 2], [170, 66, 5, 3], [210, 61, 8, 4], [226, 63, 2, 2], [256, 64, 7, 4], [340, 27, 5, 3]]) px(g, body, x, y, w, h);
  // water tower on a roof, left
  const tx = 56, tt = 16;
  px(g, body, tx, tt + 5, 18, 12);
  for (let y = tt + 7; y < tt + 17; y += 4) px(g, '#22102c', tx, y, 18, 1);
  poly(g, body, [[tx - 1, tt + 6], [tx + 9, tt - 1], [tx + 19, tt + 6]]);
  px(g, rim, tx + 8, tt - 1, 2, 1); px(g, rim, tx, tt + 5, 18, 1);
  for (const lx of [tx + 1, tx + 16]) px(g, body, lx, tt + 17, 1, 34 - tt - 17);
  line(g, body, tx + 1, tt + 18, tx + 16, 33); line(g, body, tx + 16, tt + 18, tx + 1, 33);
  // the alley seen through the gap right of the bar: back wall, a door, a weak lamp
  px(g, '#24121f', 290, 64, 34, GY - 64);
  px(g, '#170a16', 302, 118, 9, 28);
  px(g, '#0e060e', 314, 132, 10, 14);
  const lg = g.createRadialGradient(307, 108, 0, 307, 108, 26);
  lg.addColorStop(0, 'rgba(255,170,90,0.4)'); lg.addColorStop(1, 'rgba(255,170,90,0)');
  g.fillStyle = lg; g.fillRect(281, 82, 52, 64);
  // palm tree rising from the alley
  const pxx = 304, ptop = 38, dark = '#0b0412';
  for (let y = ptop; y < GY; y++) {
    const xx = pxx + Math.round(Math.sin((y - ptop) / 40) * 4);
    px(g, dark, xx, y, 2, 1);
    if (y % 5 === 0) px(g, '#1e0c26', xx, y, 1, 1);
  }
  for (const deg of [-168, -140, -112, -84, -58, -30, -6, 186, 150]) {
    const a = deg * Math.PI / 180, L = 15 + Math.abs(Math.cos(a)) * 4, n = 16;
    for (let i = 1; i <= n; i++) {
      const k = i / n, x = pxx + 1 + Math.cos(a) * L * k, y = ptop + Math.sin(a) * L * k + 9 * k * k;
      px(g, dark, x, y, 1, 1);
      if (i > 2) {
        const leaf = Math.max(1, Math.round(3 * (1 - k)));
        px(g, dark, x, y + 1, 1, leaf);
        px(g, dark, x - Math.sign(Math.cos(a)), y + 1, 1, Math.max(1, leaf - 1));
      }
      if (i < n - 3 && Math.sin(a) < 0.3) px(g, '#3a1442', x, y - 1);
    }
  }
  px(g, dark, pxx - 1, ptop - 1, 4, 3);
  crisp(c);
  return c;
}

// the bar row: left neighbour, the bar, the alley gap, right neighbour (albedo; lit in build())
function buildBarAlbedo() {
  const { c, g } = canvas(), r = rand(31);
  g.translate(M, MY);
  // ---- left neighbour: a three-storey stucco block, pawn shop shuttered at street level
  const L = 104;
  px(g, '#4e4860', -M, 38, L + M, GY - 38);
  px(g, '#6a6480', -M, 38, L + M, 1); px(g, '#5a546c', -M, 39, L + M, 2); px(g, '#2e2a3a', -M, 41, L + M, 1);
  px(g, '#5a546c', -M, 100, L + M, 2); px(g, '#34303e', -M, 102, L + M, 1);
  for (let i = 0; i < 30; i++) px(g, 'rgba(20,10,24,0.25)', -M + r() * (L + M), 42, 1, 6 + r() * 30);
  for (const wy of [50, 74]) {
    for (const wx of [-30, -6, 18, 42, 66, 88]) {
      if (wx + 12 > L) continue;
      px(g, '#24202e', wx - 1, wy - 1, 12, 16);
      px(g, '#0e0c16', wx, wy, 10, 14);
      px(g, '#181424', wx, wy + 6, 10, 1);
      px(g, '#6a647c', wx - 2, wy + 15, 14, 1);
    }
  }
  px(g, '#3a2430', -6, 74, 4, 14);
  for (const fy of [66, 92]) {
    px(g, '#1e1a26', 12, fy, 70, 2);
    px(g, '#1e1a26', 12, fy - 6, 70, 1);
    for (let x = 12; x <= 82; x += 5) px(g, '#1e1a26', x, fy - 6, 1, 6);
    for (let x = 14; x < 82; x += 7) px(g, '#16121c', x, fy + 2, 1, 2);
  }
  line(g, '#1e1a26', 70, 67, 50, 91); line(g, '#1e1a26', 73, 67, 53, 91);
  for (let k = 0; k < 6; k++) line(g, '#1e1a26', 70 - k * 3.4, 67 + k * 4, 73 - k * 3.4, 67 + k * 4);
  px(g, '#1e1a26', 30, 94, 1, 10); px(g, '#1e1a26', 34, 94, 1, 10);
  for (let y = 96; y < 104; y += 2) px(g, '#1e1a26', 30, y, 5, 1);
  px(g, '#3e3a48', 6, 104, 90, 8);
  px(g, '#2a2830', TUBE.x - 2, TUBE.y - 1, TUBE.w + 4, 1); px(g, '#4a4854', TUBE.x - 2, TUBE.y, 2, 2); px(g, '#4a4854', TUBE.x + TUBE.w, TUBE.y, 2, 2);
  px(g, '#4e4a5a', 10, 106, 30, 1); px(g, '#4e4a5a', 46, 106, 20, 1);
  px(g, '#64626e', 8, 113, 86, GY - 113);
  for (let y = 114; y < GY; y += 2) px(g, '#5a5864', 8, y, 86, 1);
  px(g, '#34323e', 8, 112, 86, 1); px(g, '#3e3c48', 8, GY - 3, 86, 3); px(g, '#8a8070', 50, GY - 4, 2, 2);
  g.globalAlpha = 0.5;
  for (let i = 0; i < 46; i++) {
    const a = i / 46 * Math.PI * 4.6;
    px(g, i < 26 ? '#c04a8a' : '#4aa0b0', 20 + i * 1.1 + Math.cos(a) * 3, 128 + Math.sin(a) * 4 - i * 0.12, 1, 1);
  }
  g.globalAlpha = 1;
  // ---- the bar: painted brick, peeling, a concrete plinth
  const B0 = 104, B1 = 300;
  px(g, '#5a4a54', B0, ROOF, B1 - B0, 3); px(g, '#7a6a74', B0, ROOF, B1 - B0, 1); px(g, '#241a20', B0, ROOF + 3, B1 - B0, 1);
  px(g, '#682c36', B0, ROOF + 4, B1 - B0, GY - ROOF - 4);
  for (let y = ROOF + 6; y < 138; y += 3) {
    if (r() < 0.55) continue;
    px(g, '#5c2630', B0 + r() * 150, y, 8 + r() * 40, 1);
  }
  // paint flaked off in jagged blobs, raw brick showing through, a few bricks picked out
  const patch = (cx, cy, rx, ry) => {
    for (let y = cy - ry; y <= cy + ry; y++) {
      const span = rx * Math.sqrt(Math.max(0, 1 - ((y - cy) / ry) ** 2)) * (0.7 + r() * 0.5);
      if (span < 1) continue;
      const a = Math.round(cx - span + (r() - 0.5) * 3), b = Math.round(cx + span + (r() - 0.5) * 3);
      px(g, '#743e34', a, y, b - a, 1);
      for (let x = a + 1; x < b - 1; x++) if (r() < 0.18) px(g, '#82493c', x, y, 2, 1);
    }
  };
  patch(118, 87, 7, 4); patch(277, 93, 5, 5); patch(111, 128, 3, 5); patch(257, 101, 3, 2);
  px(g, '#504a54', B0, 138, B1 - B0, GY - 138); px(g, '#3e3a44', B0, 138, B1 - B0, 1);
  for (let i = 0; i < 30; i++) px(g, 'rgba(20,6,12,0.28)', B0 + r() * (B1 - B0), ROOF + 4, 1, 4 + r() * 24);
  const foot = g.createLinearGradient(0, 124, 0, GY);
  foot.addColorStop(0, 'rgba(10,4,10,0)'); foot.addColorStop(1, 'rgba(10,4,10,0.5)');
  g.fillStyle = foot; g.fillRect(B0, 124, B1 - B0, GY - 124);
  // window frame + sill (the glass is live)
  px(g, '#30222a', WIN.x - 2, WIN.y - 2, WIN.w + 4, WIN.h + 4);
  px(g, '#000000', WIN.x, WIN.y, WIN.w, WIN.h);
  px(g, '#8a848e', WIN.x - 3, WIN.y + WIN.h + 1, WIN.w + 6, 2); px(g, '#4a4450', WIN.x - 3, WIN.y + WIN.h + 3, WIN.w + 6, 1);
  px(g, 'rgba(10,4,10,0.35)', WIN.x + 2, WIN.y + WIN.h + 4, 3, 8);
  // neon: raceway, transformer, the glass of the tubes when unlit
  px(g, '#34303a', SIGN.x - 2, SIGN.y + 8, 66, 1);
  px(g, '#26222c', SIGN.x + 63, SIGN.y + 7, 3, 4);
  for (let x = SIGN.x + 2; x < SIGN.x + 62; x += 9) px(g, '#4a4650', x, SIGN.y + 7, 1, 4);
  for (const k of ['B', 'A', 'R', 'G']) tubes(g, k, '#6a4a5a');
  // canopy over the door, scalloped valance
  poly(g, '#3e1428', [[174, 102], [218, 102], [221, 107], [171, 107]]);
  px(g, '#5a2240', 174, 102, 44, 1);
  px(g, '#2e0e1e', 171, 107, 50, 2);
  for (let x = 171; x < 221; x += 3) px(g, '#2e0e1e', x, 109, 2, 1);
  // double door: padded leaves, portholes, push plates, kick plates, step
  px(g, '#221816', 181, 110, 30, GY - 110);
  px(g, '#42141c', 183, 112, 13, GY - 112); px(g, '#42141c', 197, 112, 12, GY - 112);
  px(g, '#100608', 196, 112, 1, GY - 112);
  for (let y = 115; y < 140; y += 5) for (let x = 185; x < 209; x += 4) if (x !== 197) px(g, '#5a2830', x + ((y / 5) % 2 ? 2 : 0), y);
  for (const cx of [189, 202]) {
    g.fillStyle = '#9a94a2'; g.beginPath(); g.arc(cx + 0.5, 121.5, 4, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#000'; g.beginPath(); g.arc(cx + 0.5, 121.5, 3, 0, Math.PI * 2); g.fill();
  }
  px(g, '#b09050', 193, 128, 2, 4); px(g, '#b09050', 198, 128, 2, 4);
  px(g, '#7a7480', 183, 140, 26, 4);
  px(g, '#7a7480', 178, GY - 2, 36, 2);
  // posters, dirty and peeling, old scraps and staples around
  const P = 238;
  px(g, 'rgba(200,190,170,0.3)', P - 2, 116, 3, 6); px(g, 'rgba(200,190,170,0.25)', P + 28, 132, 4, 3);
  px(g, '#9a6874', P, 112, 13, 17);
  px(g, '#4a2430', P + 2, 114, 9, 6); px(g, '#4a2430', P + 2, 122, 9, 1); px(g, '#4a2430', P + 2, 124, 6, 1);
  poly(g, '#b8aca4', [[P + 13, 124], [P + 13, 129], [P + 8, 129]]);
  px(g, '#9a8e70', P + 14, 110, 13, 14);
  g.fillStyle = '#7a2428'; g.beginPath(); g.arc(P + 20.5, 115.5, 3, 0, Math.PI * 2); g.fill();
  px(g, '#3a3226', P + 16, 120, 9, 1); px(g, '#3a3226', P + 16, 122, 7, 1);
  for (let x = P + 14; x < P + 27; x++) px(g, '#9a8e70', x, 124, 1, 1 + Math.round(r() * 3));
  px(g, '#5e7a82', P + 4, 129, 16, 11);
  px(g, '#22303a', P + 6, 131, 4, 7); px(g, '#22303a', P + 12, 131, 6, 1); px(g, '#22303a', P + 12, 133, 5, 1);
  poly(g, '#a6aca8', [[P + 20, 129], [P + 20, 134], [P + 16, 129]]);
  for (const [x, y] of [[P, 112], [P + 12, 112], [P + 14, 110], [P + 26, 110], [P + 4, 129], [P + 19, 129]]) px(g, '#c8c0c0', x, y);
  // side door, steel, with a caged lamp over it
  px(g, '#201e26', 268, 114, 18, GY - 114);
  px(g, '#4e4e5a', 270, 116, 14, GY - 116);
  px(g, '#42424e', 270, 124, 14, 1); px(g, '#42424e', 270, 136, 14, 1);
  px(g, '#7a7a86', 272, 129, 10, 1); px(g, '#26262e', 282, 127, 1, 4);
  px(g, '#24222a', 276, 106, 3, 2); px(g, '#42404a', 275, 108, 5, 1); px(g, '#42404a', 275, 111, 5, 1);
  // drainpipe with brackets, gutter, shoe; rust run beside it
  px(g, '#34343c', 288, ROOF + 4, 12, 2);
  px(g, '#5a5a66', 293, ROOF + 6, 3, GY - ROOF - 8); px(g, '#70707c', 293, ROOF + 6, 1, GY - ROOF - 8);
  for (let y = ROOF + 12; y < GY; y += 14) px(g, '#2e2e36', 292, y, 5, 2);
  px(g, '#5a5a66', 293, GY - 3, 6, 3);
  px(g, 'rgba(60,34,16,0.4)', 296, ROOF + 10, 2, 56);
  // dustbin with a bag sticking out, a bottle
  px(g, '#16161c', 287, 129, 7, 6);
  px(g, '#5e5e68', 286, 134, 9, GY - 134);
  for (let y = 137; y < GY; y += 3) px(g, '#4c4c56', 286, y, 9, 1);
  px(g, '#7a7a84', 285, 133, 11, 1);
  px(g, '#2a5a3a', 262, GY - 4, 2, 4); px(g, '#2a5a3a', 262, GY - 6, 1, 2);
  // ---- right neighbour: darker brick, three storeys, a shuttered launderette
  const R0 = 314, RW = LW + M - R0;
  px(g, '#5a3230', R0, 46, RW, GY - 46);
  px(g, '#7a6a70', R0, 46, RW, 2); px(g, '#241618', R0, 48, RW, 1);
  for (let y = 52; y < 104; y += 3) if (r() < 0.4) px(g, '#4e2a28', R0 + r() * 60, y, 10 + r() * 30, 1);
  for (const wy of [56, 80]) {
    for (const wx of [320, 344, 368, 392]) {
      px(g, '#322222', wx - 1, wy - 1, 12, 16);
      px(g, '#100c16', wx, wy, 10, 14);
      px(g, '#8a7c80', wx - 2, wy + 15, 14, 1);
    }
  }
  px(g, '#000000', 368, 56, 10, 14);
  px(g, '#3e2424', R0, 102, RW, 4);
  px(g, '#16141c', 320, 110, 60, 36);
  px(g, '#5a5864', 320, 110, 60, 18);
  for (let y = 111; y < 128; y += 2) px(g, '#4e4c58', 320, y, 60, 1);
  px(g, '#2e2c38', 320, 128, 60, 1);
  px(g, '#24222a', 386, 108, 14, GY - 108);
  // the bar's roof: an AC unit and a vent stack behind the parapet
  px(g, '#2a2228', 248, ROOF - 6, 12, 6); px(g, '#3a3036', 248, ROOF - 6, 12, 1); px(g, '#1a1418', 251, ROOF - 4, 6, 3);
  px(g, '#2a2228', 268, ROOF - 12, 3, 12); px(g, '#2a2228', 267, ROOF - 13, 5, 2);
  px(g, '#2a2228', 112, ROOF - 3, 6, 3);
  // hanging cable across the street, a pair of sneakers thrown over it
  for (let x = 102; x <= 316; x++) {
    const k = (x - 102) / 214, y = 56 + k * 4 + Math.sin(k * Math.PI) * 13;
    px(g, '#0a0610', x, y);
    if (x === 142) {
      line(g, '#0a0610', x, y, x - 1, y + 4); line(g, '#0a0610', x, y, x + 2, y + 5);
      px(g, '#b8b0b8', x - 3, y + 4, 3, 2); px(g, '#a8a0a8', x + 1, y + 5, 3, 2);
      px(g, '#802040', x - 3, y + 5, 1, 1);
    }
  }
  grain(c, 0.16, 41);
  return c;
}

const PUDDLES = [[172, 176, 76, 7], [176, 167, 40, 3], [96, 172, 40, 4], [252, 183, 54, 5], [36, 170, 34, 4], [300, 171, 40, 4], [130, 188, 70, 5], [-30, 182, 50, 4]];
const MAN = { x: 156, y: 179 };
function buildGround() {
  const { c, g } = canvas(), r = rand(51);
  g.translate(M, MY);
  // pavement: concrete, a few slab joints converging a little towards the viewer
  px(g, '#6a6472', -M, GY, CW, KERB - GY);
  for (let i = 0; i < 20; i++) {
    const x0 = -M + i * 31 + r() * 6;
    if (r() < 0.3) continue;
    line(g, '#5a5462', x0, GY, 192 + (x0 - 192) * 1.12, KERB - 1);
  }
  px(g, '#605a68', -M, GY + 5, CW, 1);
  for (let i = 0; i < 26; i++) px(g, 'rgba(30,20,30,0.25)', -M + r() * CW, GY + r() * 10, 3 + r() * 14, 1 + r() * 2);
  px(g, '#9a94a2', -M, KERB, CW, 2);
  px(g, '#4a4654', -M, KERB + 2, CW, 3);
  px(g, '#1e1c26', -M, KERB + 5, CW, 2);
  // asphalt: smooth, a few repair patches and cracks
  px(g, '#3a3644', -M, ROAD, CW, CH - ROAD);
  for (let i = 0; i < 9; i++) px(g, '#33303d', -M + r() * CW, ROAD + 3 + r() * 40, 20 + r() * 40, 2 + r() * 4);
  for (let i = 0; i < 6; i++) {
    let x = -M + r() * CW, y = ROAD + 2 + r() * 40;
    for (let k = 0; k < 14; k++) { px(g, '#2a2632', x, y); x += 1; y += r() < 0.4 ? (r() < 0.5 ? -1 : 1) : 0; }
  }
  for (let x = -M; x < LW + M; x += 34) px(g, '#6a645a', x, 204, 18, 1);
  for (const [x, y, w, h] of PUDDLES) {
    for (let k = 0; k < h; k++) {
      const s = Math.round(Math.abs(k - (h - 1) / 2) * (w / h) * 0.35);
      px(g, '#1c1824', x + s, y + k, w - 2 * s, 1);
    }
  }
  for (let k = 0; k < 5; k++) {
    const s = [6, 2, 0, 2, 6][k];
    px(g, '#76728a', MAN.x - 9 + s, MAN.y - 2 + k, 18 - 2 * s, 1);
  }
  px(g, '#26222e', MAN.x - 7, MAN.y - 1, 14, 3);
  for (let x = MAN.x - 5; x < MAN.x + 6; x += 3) px(g, '#45414f', x, MAN.y);
  grain(c, 0.12, 52);
  return c;
}
// how wet the ground is: puddles (soft edged) shine most, the gutter too, the pavement little
function wetness(x, y) {
  let w = y < KERB ? 0.18 : y < ROAD ? 0.6 : 0.42;
  for (const [x0, y0, pw, ph] of PUDDLES) {
    const cx = x0 + pw / 2, cy = y0 + ph / 2, d = ((x - cx) / (pw / 2 + 3)) ** 2 + ((y - cy) / (ph / 2 + 1.5)) ** 2;
    if (d < 1) w = Math.max(w, 0.42 + 0.78 * (1 - d * d));
  }
  return w;
}
// reflections in the wet ground: long vertical smears under the bright things of the facade (additive)
function buildRefl(items) {
  const { c, g } = canvas();
  const id = g.createImageData(CW, CH), d = id.data, r = rand(61);
  const rows = new Float32Array(CH).map(() => (r() < 0.12 ? 0.35 : 0.65 + r() * 0.35));    // broken by ripples
  for (const it of items) {
    let j = 0.7;
    const soft = it.soft || 2;
    for (let x = it.x0 - soft; x <= it.x1 + soft; x++) {
      j = clamp(j + (r() - 0.5) * 0.5, 0.35, 1);                     // streaky columns
      const wc = it.w ? it.w(x) : 1;
      const e = x < it.x0 ? 1 - (it.x0 - x) / (soft + 1) : x > it.x1 ? 1 - (x - it.x1) / (soft + 1) : 1;
      for (let y = it.y0; y <= LH + MY - 1; y++) {
        const dy = y - it.yc, s = dy < 0 ? it.s * 0.35 : it.s;
        const k = Math.exp(-((dy / s) ** 2)) * it.k * j * wc * e * e * wetness(x, y) * rows[y + MY];
        if (k < 0.004) continue;
        const i = ((y + MY) * CW + x + M) * 4;
        d[i] = Math.min(255, d[i] + 255 * it.c[0] * k);
        d[i + 1] = Math.min(255, d[i + 1] + 255 * it.c[1] * k);
        d[i + 2] = Math.min(255, d[i + 2] + 255 * it.c[2] * k);
        d[i + 3] = 255;
      }
    }
  }
  g.putImageData(id, 0, 0);
  return c;
}

// street-level props in front of the facades (fire hydrant), lit like the ground
const HYD = { x: 226, y: 157 };
function buildProps() {
  const { c, g } = canvas();
  g.translate(M, MY);
  const { x, y: b } = HYD;
  px(g, '#8a2a26', x + 1, b - 9, 5, 9);
  px(g, '#a0322c', x, b - 7, 7, 2);
  px(g, '#8a2a26', x + 2, b - 11, 3, 2);
  px(g, '#6a2020', x - 1, b - 6, 2, 2); px(g, '#6a2020', x + 6, b - 6, 2, 2);
  px(g, '#b04a40', x + 1, b - 9, 1, 9);
  px(g, '#5a1a18', x, b - 1, 7, 1);
  grain(c, 0.1, 71);
  return c;
}

// foreground: the rear of a parked sedan (left) and a street lamp (right); painted in final colours
function buildFg() {
  const { c, g } = canvas();
  g.translate(M, MY);
  px(g, 'rgba(4,2,8,0.75)', -M, 199, 160, 8);          // the car's shadow on the road
  // body, glossy maroon, lighter on top where it takes the sky
  const bg = g.createLinearGradient(0, 136, 0, 202);
  bg.addColorStop(0, '#3a1a2e'); bg.addColorStop(0.35, '#2a0e1e'); bg.addColorStop(0.6, '#1e0a16'); bg.addColorStop(1, '#0e050c');
  poly(g, bg, [[-M - 4, 137], [24, 137], [29, 138], [47, 157], [94, 159], [99, 162], [101, 168], [101, 196], [98, 200], [-M - 4, 200]]);
  // side window, chrome frame, the C pillar
  poly(g, '#0c0816', [[-M, 140], [22, 140], [37, 156], [-M, 156]]);
  poly(g, '#1a1026', [[-M, 140], [-30, 140], [-30, 156], [-M, 156]]);
  line(g, '#5a5070', -M, 139, 23, 139); line(g, '#5a5070', 23, 139, 38, 155);
  px(g, '#8a80a0', -M, 157, 86, 1);
  // B pillar / rear door edge, handle, fuel flap
  px(g, '#0c040a', -24, 140, 3, 58); px(g, '#06020a', -24, 157, 1, 41);
  px(g, '#7a7090', -16, 162, 5, 1); px(g, '#140810', 20, 164, 6, 5);
  // trunk lid edge, body crease, rubbing strip
  px(g, '#4a2a3e', 47, 157, 47, 1);
  px(g, '#3a1c2e', -M, 170, 146, 1); px(g, '#12060e', -M, 171, 146, 1);
  px(g, '#4a4458', -M, 182, 146, 2); px(g, '#8a80a0', -M, 182, 146, 1);
  // tail lamp wrapping the corner
  px(g, '#3a0610', 92, 161, 9, 19); px(g, '#62101c', 93, 162, 7, 17);
  for (let y = 164; y < 179; y += 3) px(g, '#420812', 93, y, 7, 1);
  px(g, '#d0a070', 93, 179, 7, 1);
  // bumper, exhaust
  px(g, '#5e566e', 62, 186, 40, 5); px(g, '#b0a6c0', 62, 186, 40, 1); px(g, '#1e1826', 62, 191, 40, 1);
  px(g, '#2a2430', 86, 197, 6, 2);
  // wheel arch, tyre, rim
  g.fillStyle = '#05020a'; g.beginPath(); g.arc(40, 202, 18, Math.PI, 0); g.fill();
  g.fillStyle = '#0c080e'; g.beginPath(); g.arc(40, 205, 15, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#2e2836'; g.beginPath(); g.arc(40, 205, 9, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#16121c'; g.beginPath(); g.arc(40, 205, 6, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#5a5468'; g.beginPath(); g.arc(40, 205, 2, 0, Math.PI * 2); g.fill();
  // street lamp: pole, base, arm, cobra head
  const P = LAMP.x + 26;
  px(g, '#16101c', P, LAMP.y + 2, 5, LH + MY - LAMP.y);
  px(g, '#2c2434', P, LAMP.y + 2, 1, LH + MY - LAMP.y);
  px(g, '#100a14', P + 4, LAMP.y + 2, 1, LH + MY - LAMP.y);
  px(g, '#16101c', P - 3, 180, 11, LH + MY - 180); px(g, '#16101c', P - 2, 176, 9, 4);
  px(g, '#342a3c', P - 3, 180, 11, 1);
  for (let k = 0; k <= 26; k++) {
    const a = k / 26, x = P + 2 - a * 24, y = LAMP.y + 4 - Math.sin(a * Math.PI * 0.75) * 5;
    px(g, '#16101c', x, y, 2, 2);
  }
  poly(g, '#1e1824', [[LAMP.x - 12, LAMP.y - 3], [LAMP.x + 8, LAMP.y - 5], [LAMP.x + 10, LAMP.y], [LAMP.x - 10, LAMP.y]]);
  px(g, '#3a3044', LAMP.x - 11, LAMP.y - 3, 18, 1);
  // bills and stickers on the pole
  px(g, '#3e3634', P, 120, 5, 7); px(g, '#2c3440', P, 129, 5, 4); px(g, '#4a3e2a', P + 1, 150, 4, 5); px(g, '#3a3640', P, 160, 5, 3);
  crisp(c);
  return c;
}
// what the neon lays on the car and the pole: rims, a smear in the glass, the glossy flank, sparks on the chrome
function buildFgNeon(rgb, k) {
  const { c, g } = canvas();
  g.translate(M, MY);
  const col = (a) => `rgba(${rgb},${a * k})`;
  for (let x = -M; x < 24; x++) px(g, col(clamp((x + 40) / 64, 0, 1) * 0.6), x, 137);
  line(g, col(0.8), 25, 137, 46, 157);
  for (let x = 47; x < 93; x++) px(g, col(0.9), x, 158);
  px(g, col(1), 93, 159, 6, 1); px(g, col(0.75), 100, 163, 1, 12);
  poly(g, col(0.24), [[0, 140], [12, 140], [27, 155], [15, 155]]);
  poly(g, col(0.13), [[-22, 140], [-16, 140], [-1, 155], [-7, 155]]);
  for (let x = -M; x < 92; x++) {
    const a = clamp((x + 30) / 120, 0, 1);
    px(g, col(0.22 * a), x, 172, 1, 1); px(g, col(0.12 * a), x, 173, 1, 2); px(g, col(0.35 * a), x, 170, 1, 1);
  }
  for (const x of [10, 40, 66, 88]) px(g, col(1), x, 182, 2, 1);
  px(g, col(0.7), 62, 186, 40, 1);
  px(g, col(0.5), 93, 162, 2, 16);
  px(g, col(0.3), LAMP.x + 26, 60, 1, 150);
  return c;
}
// cone of the street lamp in the damp air
function buildCone() {
  const { c, g } = canvas(LW / 2, LH / 2);
  g.imageSmoothingEnabled = true;
  const x = LAMP.x / 2, y = (LAMP.y + 1) / 2;
  const gr = g.createLinearGradient(0, y, 0, LH / 2);
  gr.addColorStop(0, 'rgba(255,190,110,0.55)');
  gr.addColorStop(0.5, 'rgba(255,170,90,0.16)');
  gr.addColorStop(1, 'rgba(255,160,80,0.05)');
  g.fillStyle = gr;
  g.beginPath(); g.moveTo(x - 5, y); g.lineTo(x + 5, y); g.lineTo(x + 36, LH / 2); g.lineTo(x - 42, LH / 2); g.closePath(); g.fill();
  return blur(c, 2);
}

// window of the bar: warm light, blinds, the shadows of the people inside (live, small)
const WIN = { x: 122, y: 108, w: 44, h: 26 };
function drawWindow(S, t) {
  const g = S.win.g, { w, h } = WIN;
  g.drawImage(S.winBase, 0, 0);
  const people = [[8, 0.21, 0], [21, 0.13, 2], [34, 0.17, 4.1]];
  g.fillStyle = 'rgba(64,20,8,0.6)';
  people.forEach(([x0, sp, ph], i) => {
    const x = Math.round(x0 + Math.sin(t * sp + ph) * 5 + Math.sin(t * sp * 2.7 + ph) * 1.5);
    const y = 8 + (i === 1 ? 2 : 0) + Math.round(Math.sin(t * 0.9 + ph) * 0.6);
    g.fillRect(x - 1, y, 4, 5); g.fillRect(x - 2, y + 1, 6, 3);           // head
    g.fillRect(x, y + 5, 2, 1);                                           // neck
    g.fillRect(x - 4, y + 6, 10, 12); g.fillRect(x - 5, y + 8, 12, 10);  // shoulders
    if (i === 2 && Math.sin(t * 0.4) > 0.6) g.fillRect(x + 6, y + 1, 2, 7);
  });
  for (let y = 0; y < h - 7; y += 3) { g.fillStyle = 'rgba(60,24,8,0.7)'; g.fillRect(0, y, w, 1); g.fillStyle = 'rgba(255,220,170,0.07)'; g.fillRect(0, y + 1, w, 1); }
  g.fillStyle = '#4a2410'; g.fillRect(0, h - 8, w, 2);
  g.fillStyle = 'rgba(30,10,4,0.55)'; g.fillRect(0, h - 3, w, 3);
}
function buildWinBase() {
  const { c, g } = canvas(WIN.w, WIN.h);
  const gr = g.createRadialGradient(WIN.w * 0.55, WIN.h * 0.6, 2, WIN.w * 0.55, WIN.h * 0.6, WIN.w * 0.7);
  gr.addColorStop(0, '#f0a858'); gr.addColorStop(0.5, '#c86a2e'); gr.addColorStop(1, '#6a2a14');
  g.fillStyle = gr; g.fillRect(0, 0, WIN.w, WIN.h);
  g.fillStyle = 'rgba(80,240,255,0.5)'; g.fillRect(30, 4, 8, 1); g.fillRect(30, 7, 8, 1); g.fillRect(29, 5, 1, 2); g.fillRect(38, 5, 1, 2);
  g.fillStyle = 'rgba(255,80,60,0.45)'; g.fillRect(6, 3, 5, 3);
  return c;
}

// doorman leaning on the wall right of the door: two poses (smoking hand down / at the mouth)
const MAN_POS = { x: 216, y: GY - 27 };
function buildDoorman(up) {
  const { c, g } = canvas(15, 28);
  const k = '#0e080e', rim = '#5a2a48', cy = '#2a6a7a';
  px(g, k, 5, 1, 4, 5); px(g, k, 6, 0, 3, 1);       // head
  px(g, k, 6, 6, 3, 1);                             // neck
  px(g, k, 2, 7, 11, 10);                           // coat
  px(g, k, 3, 17, 9, 3);
  px(g, k, 3, 20, 3, 7); px(g, k, 8, 20, 3, 3); px(g, k, 6, 22, 3, 2); px(g, k, 5, 23, 2, 4); // a foot up on the wall
  px(g, '#050305', 2, 27, 5, 1);
  px(g, k, 1, 8, 2, 8);
  if (up) { px(g, k, 12, 8, 2, 4); px(g, k, 10, 6, 3, 2); }
  else px(g, k, 12, 8, 2, 9);
  px(g, cy, 7, 0, 2, 1); px(g, cy, 9, 1, 1, 3); px(g, cy, 11, 7, 2, 1);
  px(g, rim, 4, 1, 1, 4); px(g, rim, 2, 7, 1, 3); px(g, rim, 1, 8, 1, 6);
  return c;
}

// ---------------------------------------------------------------- build all
function build() {
  const S = {};
  S.sky = buildSky();
  S.clouds = buildClouds();
  S.haze = buildHaze();
  S.farWins = [];
  S.far = buildFar(S.farWins);
  S.mid = buildMid();
  // the bar row: albedo, then lit once by the static lights, plus what each colour of the neon adds
  const bar = buildBarAlbedo();
  S.barAlb = bar;
  const stat = [
    { x: WIN.x + 22, y: 122, r: 40, c: WARM, k: 0.75 },
    { x: 196, y: 124, r: 24, c: WARM, k: 0.55 },
    { x: 196, y: 110, r: 26, c: WARM, k: 0.75, up: 0.1 },
    { x: 277, y: 110, r: 38, c: [1, 0.8, 0.5], k: 1.1, up: 0.35 },
    { x: LAMP.x, y: LAMP.y + 6, r: 150, c: AMBER, k: 0.45 },
    { x: 307, y: 108, r: 20, c: WARM, k: 0.3 },
    { x: 40, y: 150, r: 70, sy: 1.6, c: [0.6, 0.5, 0.9], k: 0.3 },    // street spill on the pawn shop
    { x: TUBE.x + 15, y: TUBE.y + 3, r: 46, sy: 1.3, c: COLD, k: 1.5, up: 0.2 },
  ];
  const ambY = (y) => 0.45 + 0.75 * smooth(30, 150, y);
  S.barLit = shade(bar, stat, AMB, ambY);
  S.barPink = shade(bar, [{ x: 195, y: 92, r: 84, c: PINK, k: 1.5 }, { x: 195, y: 92, r: 30, c: PINK, k: 1.1 }], [0, 0, 0]);
  S.barCyan = shade(bar, [{ x: 231, y: 90, r: 50, c: CYAN, k: 1.3 }, { x: 231, y: 90, r: 18, c: CYAN, k: 0.6 }], [0, 0, 0]);
  // ground
  const gr = buildGround();
  S.grAlb = gr;
  const gstat = [
    { x: 196, y: GY + 1, r: 36, sy: 2.6, c: WARM, k: 1.1 },
    { x: TUBE.x + 15, y: GY, r: 40, sy: 2.5, c: COLD, k: 0.6 },
    { x: WIN.x + 22, y: GY + 1, r: 40, sy: 3, c: WARM, k: 0.6 },
    { x: 277, y: GY, r: 44, sy: 2.4, c: [1, 0.8, 0.5], k: 0.9 },
    { x: LAMP.x + 4, y: 204, r: 100, sy: 1.6, c: AMBER, k: 1.2 },
    { x: LAMP.x - 4, y: KERB, r: 70, sy: 2, c: AMBER, k: 0.7 },
  ];
  S.grLit = shade(gr, gstat, AMB, (y) => 0.9 - 0.3 * smooth(160, 216, y));
  S.grPink = shade(gr, [{ x: 195, y: GY - 6, r: 96, sy: 2.1, c: PINK, k: 1.25 }], [0, 0, 0]);
  S.grCyan = shade(gr, [{ x: 231, y: GY - 6, r: 60, sy: 2.3, c: CYAN, k: 1.0 }], [0, 0, 0]);
  const props = buildProps();
  S.propLit = shade(props, gstat.concat([{ x: HYD.x, y: 140, r: 30, c: WARM, k: 0.2 }]), AMB);
  S.propPink = shade(props, [{ x: 195, y: 92, r: 90, c: PINK, k: 1.4 }], [0, 0, 0]);
  S.propCyan = shade(props, [{ x: 231, y: 90, r: 70, c: CYAN, k: 1.2 }], [0, 0, 0]);
  // reflections, compressed between the kerb and the controls band so they stay in sight
  const L = (x0, x1, c, k, yc, s, soft, w) => ({ x0, x1, y0: GY + 2, yc, s, c, k, soft, w });
  S.reflWarm = buildRefl([
    L(WIN.x, WIN.x + WIN.w, WARM, 0.32, 168, 12), L(186, 193, WARM, 0.8, 166, 16), L(199, 206, WARM, 0.8, 166, 16),
    L(182, 210, WARM, 0.3, 160, 5), L(275, 279, [1, 0.8, 0.5], 0.8, 168, 18), L(LAMP.x - 9, LAMP.x + 9, AMBER, 0.85, 196, 18),
    L(305, 309, WARM, 0.25, 166, 8), L(TUBE.x, TUBE.x + TUBE.w, COLD, 0.45, 167, 14),
  ]);
  const gx = (k) => SIGN.x + GLYPHS[k].x;
  const gl = (k, c, kk) => [L(gx(k) - 1, gx(k) + (k === 'G' ? 15 : 12), c, kk, 171, 26, 1, glyphCols(k)), L(gx(k) - 3, gx(k) + 15, c, kk * 0.18, 173, 22, 6)];
  S.reflBA = buildRefl([...gl('B', PINK, 1), ...gl('A', PINK, 1)]);
  S.reflR = buildRefl(gl('R', PINK, 1));
  S.reflG = buildRefl(gl('G', CYAN, 0.9));
  // foreground
  S.fg = buildFg();
  S.fgPink = buildFgNeon('255,42,109', 1);
  S.fgCyan = buildFgNeon('5,217,232', 0.3);
  S.cone = buildCone();
  // neon sign: lit glyphs and halos
  S.lit = { B: litGlyph('B', '#e01e5e', '#ffc6da'), A: litGlyph('A', '#e01e5e', '#ffc6da'), R: litGlyph('R', '#e01e5e', '#ffc6da'), G: litGlyph('G', '#05b0c8', '#c8fcff') };
  S.haloBA = haloGlyphs(['B', 'A'], '#ff2a6d');
  S.haloR = haloGlyphs(['R'], '#ff2a6d');
  S.haloG = haloGlyphs(['G'], '#05d9e8');
  S.glowWarm = glowSprite('255,170,80');
  S.glowPink = glowSprite('255,42,109');
  S.glowRed = glowSprite('255,40,40');
  S.glowCyan = glowSprite('5,217,232');
  S.puff = glowSprite('205,175,215', 32);
  S.glowCold = glowSprite('160,255,210');
  S.winBase = buildWinBase();
  S.win = canvas(WIN.w, WIN.h);
  S.man = [buildDoorman(false), buildDoorman(true)];
  S.tmpBar = canvas();
  S.tmpGr = canvas();
  S.tmpMask = canvas();
  const v = canvas(LW, LH), vg = v.g.createRadialGradient(LW / 2, LH * 0.5, LH * 0.38, LW / 2, LH * 0.5, LW * 0.62);
  vg.addColorStop(0, 'rgba(4,1,8,0)'); vg.addColorStop(1, 'rgba(4,1,8,0.65)');
  v.g.fillStyle = vg; v.g.fillRect(0, 0, LW, LH);
  S.vignette = v.c;
  return S;
}

// ---------------------------------------------------------------- live state
// neon: mostly on with a hum, short stutters, and the R that buzzes and drops out for a moment now and then
function neonState(t) {
  let main = 0.94 + 0.03 * Math.sin(t * 37) * Math.sin(t * 5.3);
  const slot = Math.floor(t / 4.7), st = slot * 4.7 + hash(slot) * 3.6;
  if (hash(slot + 0.5) < 0.6 && t > st && t < st + 0.18 + hash(slot + 0.7) * 0.5) main = hash(Math.floor(t * 22)) > 0.45 ? 0.95 : 0.12;
  let R = 1;
  const rs = Math.floor(t / 9.3), r0 = rs * 9.3 + 2 + hash(rs + 3.3) * 4, dur = 0.8 + hash(rs + 4.4) * 2.2;
  if (t > r0 - 0.5 && t < r0 + dur + 0.4) {
    if (t < r0 || t > r0 + dur) R = hash(Math.floor(t * 30)) > 0.5 ? 1 : 0.15;
    else R = hash(Math.floor(t * 9)) > 0.93 ? 0.5 : 0.04;
  }
  const glass = main > 0.5 ? 0.95 + 0.04 * Math.sin(t * 61) : 0.45;
  return { main, R: R * main, glass };
}
// a car passing behind the viewer every 8 to 12 s: progress of its sweep, or null
function sweepState(t) {
  const k = Math.floor(t / 10), start = k * 10 + 2 + hash(k + 9.1) * 2, dur = 2.4;
  if (t < start || t > start + dur) return null;
  const p = (t - start) / dur;
  return { p, dir: hash(k + 2.2) < 0.5 ? 1 : -1, a: Math.sin(p * Math.PI) };
}

const cam = { x: 0, y: 0, t: -1 };
let S = null;

// ---------------------------------------------------------------- per frame
// t: seconds; mouse: { x, y } in canvas pixels, or null
export function drawTitleScene(ctx, W, H, t, mouse) {
  if (!S) S = build();
  // eased mouse + idle sway -> camera offset in about [-1, 1]
  const nx = mouse ? clamp(mouse.x / W * 2 - 1, -1, 1) : 0, ny = mouse ? clamp(mouse.y / H * 2 - 1, -1, 1) : 0;
  if (cam.t < 0 || t < cam.t || t - cam.t > 1) { cam.x = nx; cam.y = ny; }
  else { const k = 1 - Math.exp(-(t - cam.t) * 2.2); cam.x += (nx - cam.x) * k; cam.y += (ny - cam.y) * k; }
  cam.t = t;
  const vx = cam.x + Math.sin(t * 0.19) * 0.16 + Math.sin(t * 0.083 + 1) * 0.1, vy = cam.y + Math.sin(t * 0.13 + 2) * 0.12;
  const sx = (f) => -f * vx * RX, sy = (f) => -f * vy * RY;
  const N = neonState(t), sw = sweepState(t);
  const pinkA = (2 * N.main + N.R) / 3;

  ctx.save();
  const sc = Math.max(W / LW, H / LH);
  ctx.setTransform(sc, 0, 0, sc, (W - LW * sc) / 2, (H - LH * sc) / 2);
  ctx.imageSmoothingEnabled = false;
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';

  // 1. sky, stars, clouds
  ctx.drawImage(S.sky, 0, 0);
  const co = (t * 1.6) % (LW * 2);
  ctx.drawImage(S.clouds, -co, 0); ctx.drawImage(S.clouds, LW * 2 - co, 0);
  for (let i = 0; i < 9; i++) {
    const a = Math.max(0, Math.sin(t * (0.7 + hash(i) * 1.3) + i * 3));
    ctx.fillStyle = `rgba(255,240,250,${a * 0.8})`;
    ctx.fillRect(Math.floor(hash(i + 0.3) * LW), Math.floor(hash(i + 0.6) * 56), 1, 1);
  }

  // 2. far skyline, its windows going on and off, the mast light
  const ox = sx(F.far), oy = sy(F.far);
  ctx.drawImage(S.far, ox - M, oy - MY);
  S.farWins.forEach(([x, y], i) => {
    if (hash(Math.floor(t / (3 + (i % 5))) * 7 + i) < 0.5) return;
    ctx.fillStyle = i % 3 ? 'rgba(235,170,90,0.75)' : 'rgba(170,210,255,0.6)';
    ctx.fillRect(x + ox, y + oy, 1, 1);
  });
  if (Math.sin(t * 2.4) > 0.1) {
    ctx.fillStyle = '#ff4040'; ctx.fillRect(22 + ox, 7 + oy, 1, 1);
    ctx.imageSmoothingEnabled = true; ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.6;
    ctx.drawImage(S.glowRed, 22.5 + ox - 7, 7.5 + oy - 7, 14, 14);
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'; ctx.imageSmoothingEnabled = false;
  }
  ctx.imageSmoothingEnabled = true; ctx.drawImage(S.haze, 0, 0); ctx.imageSmoothingEnabled = false;

  // 3. mid row
  ctx.drawImage(S.mid, sx(F.mid) - M, sy(F.mid) - MY);

  // 4. the bar row, composed at low res then blitted
  const bg = S.tmpBar.g;
  bg.globalCompositeOperation = 'source-over'; bg.globalAlpha = 1;
  bg.clearRect(0, 0, CW, CH);
  bg.drawImage(S.barLit, 0, 0);
  bg.globalCompositeOperation = 'lighter';
  bg.globalAlpha = pinkA; bg.drawImage(S.barPink, 0, 0);
  bg.globalAlpha = N.glass; bg.drawImage(S.barCyan, 0, 0);
  bg.globalCompositeOperation = 'source-over';
  bg.globalAlpha = N.main; bg.drawImage(S.lit.B, 0, 0); bg.drawImage(S.lit.A, 0, 0);
  bg.globalAlpha = N.R; bg.drawImage(S.lit.R, 0, 0);
  bg.globalAlpha = N.glass; bg.drawImage(S.lit.G, 0, 0);
  bg.globalAlpha = 1;
  if (sw) sweep(S, sw, S.barAlb, bg, 1.2, 0);
  // live windows: the bar's, the portholes (someone passes behind now and then), a TV and a lamp next door
  drawWindow(S, t);
  bg.drawImage(S.win.c, WIN.x + M, WIN.y + MY);
  const pass = (t % 6.3) / 0.9;
  for (const [cx, i] of [[189, 0], [202, 1]]) {
    const dark = pass > i * 0.35 && pass < i * 0.35 + 0.5;
    bg.fillStyle = dark ? '#5a2410' : '#ffb45c';
    bg.beginPath(); bg.arc(cx + 0.5 + M, 121.5 + MY, 3, 0, Math.PI * 2); bg.fill();
    bg.fillStyle = dark ? '#3a1408' : '#ffe0a8'; bg.fillRect(cx - 1 + M, 119 + MY, 2, 1);
  }
  bg.fillStyle = '#ffb45c'; bg.fillRect(196 + M, 113 + MY, 1, 2); bg.fillRect(183 + M, GY - 1 + MY, 26, 1);
  const tv = hash(Math.floor(t * 7));
  bg.fillStyle = `rgba(${90 + tv * 80},${130 + tv * 70},${220 + tv * 35},${0.45 + tv * 0.35})`;
  bg.fillRect(42 + M, 50 + MY, 10, 14);
  bg.fillStyle = 'rgba(10,8,20,0.6)'; bg.fillRect(42 + M, 56 + MY, 10, 1);
  bg.fillStyle = '#a85c30'; bg.fillRect(-2 + M, 74 + MY, 6, 14);
  bg.fillStyle = '#d08040'; bg.fillRect(0 + M, 77 + MY, 3, 8);
  bg.fillStyle = '#ffe2a0'; bg.fillRect(276 + M, 109 + MY, 3, 2);
  bg.fillStyle = '#e8fff0'; bg.fillRect(TUBE.x + M, TUBE.y + MY, TUBE.w, 1);
  bg.fillStyle = '#c87a3a'; bg.fillRect(368 + M, 56 + MY, 10, 14);
  bg.fillStyle = '#7a3c1c'; for (let y = 0; y < 7; y += 2) bg.fillRect(368 + M, 56 + MY + y, 10, 1);
  bg.fillStyle = '#e8a050'; bg.fillRect(368 + M, 64 + MY, 10, 6);
  const sh = Math.round(Math.sin(t * 0.17) * 3);
  bg.fillStyle = 'rgba(60,20,8,0.7)'; bg.fillRect(372 + sh + M, 63 + MY, 3, 7); bg.fillRect(373 + sh + M, 62 + MY, 2, 1);
  // doorman: draws on the cigarette every few seconds
  const cyc = t % 7.5, up = cyc > 5 && cyc < 6.6, draw = cyc > 5.3 && cyc < 6.4;
  bg.drawImage(S.man[up ? 1 : 0], MAN_POS.x + M, MAN_POS.y + MY);
  const ember = up ? { x: MAN_POS.x + 9, y: MAN_POS.y + 5 } : { x: MAN_POS.x + 13, y: MAN_POS.y + 17 };
  bg.fillStyle = draw ? '#ffd27a' : '#ff5a2a';
  bg.fillRect(ember.x + M, ember.y + MY, 1, 1);
  const bx = sx(F.bar), by = sy(F.bar);
  ctx.drawImage(S.tmpBar.c, bx - M, by - MY);
  // smoke of the cigarette, curling up
  for (let i = 0; i < 14; i++) {
    const age = (t % 0.32) + i * 0.32, birth = t - age, ph = ((birth % 7.5) + 7.5) % 7.5;
    const wasUp = ph > 5 && ph < 6.6, puff = ph > 6.6 && ph < 7.2 ? 1 : 0;
    const x0 = wasUp ? MAN_POS.x + 9 : MAN_POS.x + 13, y0 = wasUp ? MAN_POS.y + 4 : MAN_POS.y + 16;
    const x = x0 + Math.sin(age * 2.2 + i) * age * 2.2 + age * 2, y = y0 - age * 7 - puff * age * 2;
    const a = Math.max(0, 1 - age / 4.4) * (0.14 + puff * 0.14);
    ctx.fillStyle = `rgba(214,190,226,${a})`;
    ctx.fillRect(Math.round(x) + bx, Math.round(y) + by, 1 + (age > 2 ? 1 : 0) + puff, 1 + puff);
  }
  // drizzle caught by the neon, falling through its glow
  for (let i = 0; i < 46; i++) {
    const y = ((hash(i + 7.7) * 200 + t * (140 + hash(i + 3.1) * 50)) % 110) + 60, x = 160 + hash(i + 5.3) * 100 - (y - 60) * 0.12;
    const cyan = x > 222, d = Math.hypot((x - (cyan ? 231 : 195)) / 1.4, y - 92) / 60, a = Math.max(0, 1 - d) * (cyan ? N.glass : pinkA) * 0.7;
    if (a < 0.03) continue;
    ctx.fillStyle = cyan ? `rgba(150,240,255,${a})` : `rgba(255,140,190,${a})`;
    ctx.fillRect(Math.round(x) + bx, Math.round(y) + by, 1, 3);
  }
  // halos of the neon and the warm lamps (smooth, additive)
  ctx.imageSmoothingEnabled = true;
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = N.main * 0.9; ctx.drawImage(S.haloBA, bx - M, by - MY);
  ctx.globalAlpha = N.R * 0.9; ctx.drawImage(S.haloR, bx - M, by - MY);
  ctx.globalAlpha = N.glass * 0.9; ctx.drawImage(S.haloG, bx - M, by - MY);
  ctx.globalAlpha = pinkA * 0.25; ctx.drawImage(S.glowPink, 195 + bx - 56, 91 + by - 40, 112, 80);
  ctx.globalAlpha = N.glass * 0.16; ctx.drawImage(S.glowCyan, 231 + bx - 26, 90 + by - 22, 52, 44);
  ctx.globalAlpha = 0.55; ctx.drawImage(S.glowWarm, 277.5 + bx - 9, 110 + by - 9, 18, 18);
  ctx.globalAlpha = 0.35; ctx.drawImage(S.glowCold, TUBE.x - 8 + bx, TUBE.y - 7 + by, TUBE.w + 16, 14);
  ctx.globalAlpha = 0.28; ctx.drawImage(S.glowWarm, 189.5 + bx - 7, 121.5 + by - 7, 14, 14); ctx.drawImage(S.glowWarm, 202.5 + bx - 7, 121.5 + by - 7, 14, 14);
  ctx.globalAlpha = 0.16; ctx.drawImage(S.glowWarm, WIN.x + 22 + bx - 32, 121 + by - 22, 64, 44);
  ctx.globalAlpha = draw ? 0.75 : 0.3; ctx.drawImage(S.glowWarm, ember.x + 0.5 + bx - 2.5, ember.y + 0.5 + by - 2.5, 5, 5);
  ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'; ctx.imageSmoothingEnabled = false;

  // 5. ground: composed at low res (lit + neon + shimmering reflections + sweep), blitted row by row in perspective
  const gg = S.tmpGr.g;
  gg.globalCompositeOperation = 'source-over'; gg.globalAlpha = 1;
  gg.drawImage(S.grLit, 0, 0);
  gg.globalCompositeOperation = 'lighter';
  gg.globalAlpha = pinkA; gg.drawImage(S.grPink, 0, 0);
  gg.globalAlpha = N.glass; gg.drawImage(S.grCyan, 0, 0);
  for (let y = GY + MY; y < CH; y++) {
    const ly = y - MY, amp = ly < ROAD ? 0.3 : 0.6 + (ly - ROAD) * 0.03;
    const o = Math.round(Math.sin(ly * 0.21 + t * 1.9) * amp + (hash(ly * 3.1 + Math.floor(t * 10) * 1.37) - 0.5) * amp * 1.4);
    const fl = 0.8 + 0.2 * hash(ly * 1.7 + Math.floor(t * 7) * 2.3);
    gg.globalAlpha = fl; gg.drawImage(S.reflWarm, 0, y, CW, 1, o, y, CW, 1);
    gg.globalAlpha = fl * N.main; gg.drawImage(S.reflBA, 0, y, CW, 1, o, y, CW, 1);
    gg.globalAlpha = fl * N.R; gg.drawImage(S.reflR, 0, y, CW, 1, o, y, CW, 1);
    gg.globalAlpha = fl * N.glass; gg.drawImage(S.reflG, 0, y, CW, 1, o, y, CW, 1);
  }
  gg.globalCompositeOperation = 'source-over'; gg.globalAlpha = 1;
  if (sw) sweep(S, sw, S.grAlb, gg, 0.9, 1);
  for (let y = GY; y < LH + MY; y++) {
    const f = rowF(y);
    ctx.drawImage(S.tmpGr.c, 0, y + MY, CW, 1, sx(f) - M, y + sy(f), CW, 1.08);
  }
  // hydrant at the kerb
  const pf = rowF(HYD.y), hx = sx(pf) - M, hy = sy(pf) - MY;
  ctx.drawImage(S.propLit, hx, hy);
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = pinkA; ctx.drawImage(S.propPink, hx, hy);
  ctx.globalAlpha = N.glass; ctx.drawImage(S.propCyan, hx, hy);
  ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
  // steam breathing out of the manhole
  const mf = rowF(MAN.y), mx = sx(mf), my = sy(mf);
  ctx.imageSmoothingEnabled = true;
  for (let i = 0; i < 26; i++) {
    const life = 4.2, age = (t + i * life / 26) % life, k = age / life;
    const breath = 0.45 + 0.55 * Math.max(0, Math.sin((t - age) * 0.7));
    const x = MAN.x + (hash(i) - 0.5) * 8 + Math.sin(age * 1.3 + i) * 3 * k + age * 4, y = MAN.y - age * 13;
    const s = 5 + k * 22;
    ctx.globalAlpha = (1 - k) * Math.min(1, k * 5) * 0.75 * breath;
    ctx.drawImage(S.puff, x - s / 2 + mx, y - s / 2 + my, s, s * 0.8);
  }
  ctx.globalAlpha = 1; ctx.imageSmoothingEnabled = false;
  // rain rings in the puddles
  for (let i = 0; i < 5; i++) {
    const per = 1.3 + hash(i + 1.1), age = (t + hash(i) * per) % per, cyc = Math.floor((t + hash(i) * per) / per);
    const P = PUDDLES[[0, 0, 6, 3, 2][i]], rx = P[0] + 6 + hash(cyc * 3.7 + i) * (P[2] - 12), ry = P[1] + P[3] / 2;
    const f = rowF(ry), rad = 1 + age * 5, a = Math.max(0, 1 - age / 0.9) * 0.35;
    if (a <= 0) continue;
    ctx.fillStyle = `rgba(255,200,230,${a})`;
    ctx.fillRect(Math.round(rx - rad) + sx(f), Math.round(ry - rad * 0.3) + sy(f), Math.round(rad * 2), 1);
    ctx.fillRect(Math.round(rx - rad * 0.7) + sx(f), Math.round(ry + rad * 0.3) + sy(f), Math.round(rad * 1.4), 1);
  }
  // loose papers nudged by the wind
  const gust = Math.max(0, Math.sin(t * 0.5) * Math.sin(t * 0.23 + 1));
  [[124, 186, 0], [270, 174, 1.7]].forEach(([x0, y0, ph], i) => {
    const f = rowF(y0), push = (Math.sin(t * 0.5 + ph) * 0.5 + 0.5) * 6 * (0.5 + gust);
    const lift = gust > 0.5 ? Math.round(Math.abs(Math.sin(t * 6 + ph)) * 1.5) : 0;
    const x = Math.round(x0 + push) + sx(f), y = y0 - lift + sy(f);
    ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(x + 1, y0 + 1 + sy(f), 6, 1);
    ctx.fillStyle = i ? '#6e6878' : '#7c7482'; ctx.fillRect(x, y, 6, 2); ctx.fillRect(x + 1, y - 1, 4, 1);
    ctx.fillStyle = '#4e4858'; ctx.fillRect(x + (lift ? 4 : 1), y + (lift ? 0 : 1), 2, 1);
  });

  // 6. foreground: car rear, lamp post, cone, drizzle, moths
  const fx = sx(F.fg), fy = sy(F.fg);
  ctx.drawImage(S.fg, fx - M, fy - MY);
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = pinkA; ctx.drawImage(S.fgPink, fx - M, fy - MY);
  ctx.globalAlpha = N.glass; ctx.drawImage(S.fgCyan, fx - M, fy - MY);
  ctx.imageSmoothingEnabled = true;
  ctx.globalAlpha = 0.5; ctx.drawImage(S.cone, fx, fy, LW, LH);
  ctx.globalAlpha = 0.9; ctx.drawImage(S.glowWarm, LAMP.x + fx - 14, LAMP.y + fy - 10, 28, 22);
  ctx.globalAlpha = 0.3; ctx.drawImage(S.glowWarm, LAMP.x + fx - 40, LAMP.y + fy - 28, 80, 64);
  ctx.imageSmoothingEnabled = false;
  ctx.globalAlpha = 1;
  ctx.fillStyle = '#ffe6b0'; ctx.fillRect(LAMP.x - 9 + fx, LAMP.y + fy, 18, 1);
  for (let i = 0; i < 44; i++) {
    const sp = 150 + hash(i) * 60, y = ((hash(i + 0.4) * 300 + t * sp) % 190) + LAMP.y + 2;
    const k = (y - LAMP.y) / (LH - LAMP.y);
    const x = LAMP.x + (hash(i + 0.9) - 0.55) * (8 + k * 72) - (y - LAMP.y) * 0.12;
    ctx.fillStyle = `rgba(255,214,150,${0.32 * (1 - k * 0.7)})`;
    ctx.fillRect(Math.round(x) + fx, Math.round(y) + fy, 1, 3);
  }
  for (let i = 0; i < 3; i++) {
    const a = t * (2.1 + i * 0.7) + i * 2;
    const x = LAMP.x + Math.sin(a) * (5 + i * 2) + Math.sin(a * 2.7) * 2, y = LAMP.y + 4 + Math.cos(a * 1.3) * 3 + Math.sin(a * 3.1) * 2 + i;
    ctx.fillStyle = '#fff2d8'; ctx.fillRect(Math.round(x) + fx, Math.round(y) + fy, 1, 1);
  }
  ctx.globalCompositeOperation = 'source-over';
  if (sw) {
    const g2 = ctx.createLinearGradient(0, 0, LW, 0), c0 = sw.dir > 0 ? sw.p : 1 - sw.p;
    g2.addColorStop(clamp(c0 - 0.3, 0, 1), 'rgba(255,240,210,0)');
    g2.addColorStop(clamp(c0, 0, 1), `rgba(255,240,210,${0.05 * sw.a})`);
    g2.addColorStop(clamp(c0 + 0.3, 0, 1), 'rgba(255,240,210,0)');
    ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = g2; ctx.fillRect(0, 0, LW, LH);
    ctx.globalCompositeOperation = 'source-over';
  }
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(S.vignette, 0, 0);
  ctx.restore();

  drawTexts(ctx, W, H, t);
}

// a band of headlight sweeping a layer: its albedo, cut to a slanted moving band, added on top
function sweep(S, sw, alb, g, k, ground) {
  const m = S.tmpMask.g;
  m.globalCompositeOperation = 'source-over'; m.globalAlpha = 1;
  m.clearRect(0, 0, CW, CH);
  m.drawImage(alb, 0, 0);
  m.globalCompositeOperation = 'destination-in';
  const c = -80 + (LW + 160) * (sw.dir > 0 ? sw.p : 1 - sw.p) + M;
  const gr = m.createLinearGradient(c - 60, 0, c + 60, 0);
  gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(0.5, `rgba(0,0,0,${sw.a})`); gr.addColorStop(1, 'rgba(0,0,0,0)');
  m.fillStyle = gr;
  m.setTransform(1, 0, ground ? 0 : -0.25, 1, ground ? 0 : 40, 0);
  m.fillRect(-200, 0, CW + 400, CH);
  m.setTransform(1, 0, 0, 1, 0, 0);
  // the lamp post's shadow, thrown across the band
  m.globalCompositeOperation = 'destination-out';
  m.fillStyle = 'rgba(0,0,0,0.85)';
  m.fillRect(c - 8 + (sw.dir > 0 ? -1 : 1) * 10, 0, 3, CH);
  g.globalCompositeOperation = 'lighter';
  g.globalAlpha = k;
  g.drawImage(S.tmpMask.c, 0, 0);
  g.globalAlpha = 1;
  g.globalCompositeOperation = 'source-over';
}

function drawTexts(ctx, W, H, t) {
  const s = H / 720;
  // dark band at the bottom for the controls
  const band = ctx.createLinearGradient(0, H * 0.81, 0, H);
  band.addColorStop(0, 'rgba(6,2,10,0)');
  band.addColorStop(0.3, 'rgba(6,2,10,0.7)');
  band.addColorStop(1, 'rgba(6,2,10,0.9)');
  ctx.fillStyle = band;
  ctx.fillRect(0, H * 0.81, W, H * 0.19);
  const bob = Math.sin(t * 2) * 4 * s;
  glitchText(ctx, 'FULL MATTER', W / 2, H * 0.1 + bob, 72 * s, t, { rot: Math.sin(t * 1.3) * 0.02, color: PALETTE.white });
  glitchText(ctx, 'RUNNER', W / 2, H * 0.205 + bob, 86 * s, t + 1, { rot: Math.sin(t * 1.3 + 1) * 0.02, color: PALETTE.yellow });
  if (Math.floor(t * 2.5) % 2 === 0) text(ctx, 'CLICK TO START', W / 2, H * 0.293, 22 * s, neon(t, 3));
  text(ctx, 'ONE HIT AND YOU ARE DEAD. SO ARE THEY.', W / 2, H * 0.87, 14 * s, PALETTE.pink);
  const lines = [
    'WASD / ZQSD  MOVE        MOUSE  AIM        SHIFT  LOOK FURTHER',
    'LMB  ATTACK        RMB  THROW / PICK UP        E  PICK UP / SWAP',
    'R  RELOAD        SPACE  EXECUTE A KNOCKED-OUT ENEMY        BACKSPACE  RESTART        M  MUSIC',
  ];
  lines.forEach((l, i) => text(ctx, l, W / 2, H * 0.91 + i * 21 * s, 11 * s, PALETTE.white, { alpha: 0.8 }));
}
