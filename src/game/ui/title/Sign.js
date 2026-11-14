// The bar's neon sign, hand made: a shaped sheet-metal panel in worn enamel standing off the wall on angle iron, BAR
// in thick hand-bent tubes (hot core, rounded bends, blacked-out returns, electrodes, glass standoffs), a tilted
// cocktail glass with an olive on a pick, a violet border tube with a dead corner, an arrow of incandescent bulbs
// chasing down toward the door, and the electrics (transformer, flex conduit, junction box, an old cable loop).
// Geometry lives here; the albedo is painted into the bar row (and lit with it), the lit tubes, halos and the column
// weights of their reflections are built once, and the live bits (states, bulbs, bubbles, sparks, drips) per frame.
import { M, MY, GY, canvas, rand, px, line, blur, cropTo, put } from './Draw.js';
import { hash, clamp, BULBS } from './Timeline.js';

// panel: a rounded rectangle for the letters merged into a disc for the glass (signed distance, < 0 inside)
const P = { x0: 151, x1: 241, y0: 69, y1: 101, r: 4, dx: 254, dy: 86, dr: 17 };
function sdPanel(x, y) {
  const cx = (P.x0 + P.x1) / 2, cy = (P.y0 + P.y1) / 2, hw = (P.x1 - P.x0) / 2, hh = (P.y1 - P.y0) / 2;
  const qx = Math.abs(x - cx) - hw + P.r, qy = Math.abs(y - cy) - hh + P.r;
  const box = Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - P.r;
  const disc = Math.hypot(x - P.dx, y - P.dy) - P.dr;
  const k = 6, h = Math.max(k - Math.abs(box - disc), 0) / k;
  return Math.min(box, disc) - h * h * k / 4;
}
// the part of the bar row the sign and its light can touch (layer coords): every cached sign canvas is cropped to it
const BOX = { x0: 96 + M, y0: 40 + MY, x1: 300 + M, y1: 150 + MY };

// ---------------------------------------------------------------- tube geometry (logical px, float)
const arc = (cx, cy, r, a0, a1, n = 10) => Array.from({ length: n + 1 }, (_, i) => {
  const a = (a0 + (a1 - a0) * i / n) * Math.PI / 180;
  return [cx + Math.cos(a) * r, cy + Math.sin(a) * r];
});
// letters on a 15 x 20 centreline box; strokes are polylines, returns join a stroke's end to the next one's start
const LETTERS = {
  B: [[[1, 20], [1, 0]], [[1, 0], [7.5, 0], ...arc(7.5, 5, 5, -90, 90), [1, 10]], [[1, 10], [8.5, 10], ...arc(8.5, 15, 5, -90, 90), [1.5, 20]]],
  A: [[[0.5, 20], [4.1, 4.4], ...arc(7.5, 4.6, 3.6, 192, 348, 8), [10.9, 4.4], [14.5, 20]], [[3.3, 13], [11.7, 13]]],
  R: [[[1, 20], [1, 0]], [[1, 0], [7.5, 0], ...arc(7.5, 5, 5, -90, 90), [1, 10]], [[5.5, 10], [8.5, 13], [11.5, 17], [13.2, 19.3], [15.5, 20]]],
};
const LETTER_AT = { B: [166, 75, -0.018], A: [187.5, 74.6, 0.01], R: [209, 75.3, 0.025] };   // x, y, lean (rad)
const GLASS = { x: 254, y: 87, tilt: 0.2 };

// bent by hand: every vertex a little off, each letter its own lean
function place(pts, ox, oy, rot, seed) {
  const c = Math.cos(rot), s = Math.sin(rot);
  return pts.map(([x, y], i) => {
    const j = i && i < pts.length - 1 ? 0.32 : 0.12;
    const jx = (hash(seed + i * 1.7) - 0.5) * j, jy = (hash(seed + i * 2.3 + 9) - 0.5) * j;
    return [ox + x * c - y * s + jx, oy + x * s + y * c + jy];
  });
}
function letterStrokes(k) {
  const [ox, oy, rot] = LETTER_AT[k];
  return LETTERS[k].map((pl, i) => place(pl, ox, oy, rot, k.charCodeAt(0) * 13 + i * 31));
}
const glassPt = ([x, y]) => {
  const c = Math.cos(GLASS.tilt), s = Math.sin(GLASS.tilt);
  return [GLASS.x + x * c - y * s, GLASS.y + x * s + y * c];
};
const GLASS_STROKES = [
  [[-10, -12], [0, -0.5], [10, -12]],               // the bowl
  [[-10, -12], [-3, -12.6], [3, -12.6], [10, -12]], // its rim
  [[0, -0.5], [0, 9.5]],                            // stem
  [[-6.5, 11.5], [-2.5, 10.2], [2.5, 10.2], [6.5, 11.5]],   // foot
].map((pl) => pl.map(glassPt));
// the drink stays level while the glass leans: a horizontal line where it meets the two sides of the bowl
function liquidLine() {
  const yl = glassPt([0, -7.5])[1], [a, o, b] = GLASS_STROKES[0];
  const cut = (p, q) => { const k = (yl - p[1]) / (q[1] - p[1]); return [p[0] + (q[0] - p[0]) * k, yl]; };
  const l = cut(a, o), r = cut(b, o);
  return [[l[0] + 1.6, yl], [r[0] - 1.6, yl]];
}
const PICK = [[-7, -17], [1, -3.5]].map(glassPt);
const OLIVE = glassPt([-1.6, -6]);
const BUBBLES = [[3, -16.5], [5.5, -20], [3.5, -23.5]].map(glassPt);
// the arrow: a sheet-metal band from under the glass, curving down to point at the door, bulbs along its spine
const ARROW = { p: [[262, 99], [272, 110], [255, 114], [234, 110]], tip: [221, 110], half: 7, w: 4 };
function bezier(p, n = 40) {
  return Array.from({ length: n + 1 }, (_, i) => {
    const t = i / n, u = 1 - t;
    return [0, 1].map((d) => u * u * u * p[0][d] + 3 * u * u * t * p[1][d] + 3 * u * t * t * p[2][d] + t * t * t * p[3][d]);
  });
}
const SPINE = [...bezier(ARROW.p), [228, 110]];
const BULB_AT = (() => {
  const seg = [], out = [];
  let L = 0;
  for (let i = 1; i < SPINE.length; i++) { const d = Math.hypot(SPINE[i][0] - SPINE[i - 1][0], SPINE[i][1] - SPINE[i - 1][1]); seg.push(d); L += d; }
  for (let b = 0; b < BULBS.n; b++) {
    let s = 2 + (L - 2) * b / (BULBS.n - 1), i = 0;
    while (i < seg.length - 1 && s > seg[i]) s -= seg[i++];
    const k = s / seg[i];
    out.push([Math.round(SPINE[i][0] + (SPINE[i + 1][0] - SPINE[i][0]) * k), Math.round(SPINE[i][1] + (SPINE[i + 1][1] - SPINE[i][1]) * k)]);
  }
  return out;
})();
// where the R's last electrode sits (sparks fall from it when the letter catches again)
const R_END = letterStrokes('R')[2].at(-1);
const R_SPARK = { x: R_END[0] + 1, y: R_END[1] + 1 };
// where water gathers under the lower lip and drips
const LIP_DRIPS = [155, 162, 228, 236, 247, 259].map((x) => {
  let y = P.y1 + 3;
  while (y > P.y0 && sdPanel(x + 0.5, y + 0.5) > 0) y--;
  return [x, y + 1];
});

// ---------------------------------------------------------------- pixel sets
const key = (x, y) => y * 1024 + x;
function raster(strokes) {
  const s = new Set();
  for (const pl of strokes) {
    for (let i = 1; i < pl.length; i++) {
      const [x0, y0] = pl[i - 1], [x1, y1] = pl[i], n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) * 4));
      for (let k = 0; k <= n; k++) s.add(key(Math.round(x0 + (x1 - x0) * k / n), Math.round(y0 + (y1 - y0) * k / n)));
    }
  }
  return s;
}
function grow(s, d8 = true) {
  const o = new Set(s);
  for (const k of s) {
    const x = k % 1024, y = (k - x) / 1024;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (d8 || !dx || !dy) o.add(key(x + dx, y + dy));
  }
  return o;
}
const minus = (a, b) => new Set([...a].filter((k) => !b.has(k)));
function fill(g, s, col) {
  g.fillStyle = col;
  for (const k of s) { const x = k % 1024; g.fillRect(x, (k - x) / 1024, 1, 1); }
}
// how much of a group stands in each column (vertical strokes count most), keyed by logical x
function columns(s) {
  const cols = {};
  for (const k of s) { const x = k % 1024; cols[x] = (cols[x] || 0) + 1; }
  return (x) => 0.25 + 0.75 * Math.min(1, (cols[x] || 0) / 10);
}

// one tube lit: soft fringe ring, saturated glass, a bright inner glow, the hot core; `fat` tubes are 5 px wide,
// `thin` ones a single bright line in a soft fringe
function litTube(g, core, [ring, body, inner, hot], fat = false, thin = false) {
  if (thin) { fill(g, minus(grow(core, false), core), ring); fill(g, core, inner); return; }
  const mid = fat ? grow(core, false) : core, b = grow(mid);
  fill(g, minus(grow(b, false), b), ring);
  fill(g, minus(b, mid), body);
  fill(g, minus(mid, core), inner);
  fill(g, core, hot);
}
const PINK = ['rgba(255,40,120,0.5)', '#d81466', '#ff4a96', '#fff0f6'];
const CYAN = ['rgba(20,200,235,0.45)', '#0aa0c8', '#40e0f8', '#e8ffff'];
const VIOLET = ['rgba(150,60,240,0.55)', '#6a28c0', '#c890ff', '#d8b8ff'];
const LIME = ['rgba(140,255,60,0.35)', '#5ab020', '#90f040', '#f0ffd0'];
const YELLOW = ['rgba(255,210,40,0.35)', '#c89810', '#f0c828', '#fff8d0'];

// ---------------------------------------------------------------- geometry sets, built once
function geometry() {
  const G = {};
  G.B = raster(letterStrokes('B')); G.A = raster(letterStrokes('A')); G.R = raster(letterStrokes('R'));
  G.BA = new Set([...G.B, ...G.A]);
  G.glass = raster(GLASS_STROKES);
  G.liquid = raster([liquidLine()]);
  G.pick = raster([PICK]);
  // border: the outline 2 px in, broken at the bottom for its electrodes; its top left corner is the dead segment
  const ring = new Set();
  for (let y = P.y0 - 2; y <= P.y1 + 4; y++) {
    for (let x = P.x0 - 2; x <= P.dx + P.dr + 2; x++) {
      const d = sdPanel(x + 0.5, y + 0.5);
      if (d > -2.5 && d <= -1.5 && !(x >= 193 && x <= 199 && y > 95)) ring.add(key(x, y));
    }
  }
  G.corner = new Set([...ring].filter((k) => { const x = k % 1024, y = (k - x) / 1024; return x < 165 && y < 82; }));
  G.border = minus(ring, G.corner);
  // returns (the tube painted black between two lit strokes) and electrodes
  const ends = (k) => letterStrokes(k).map((pl) => [pl[0], pl.at(-1)]);
  const [b, a, r] = [ends('B'), ends('A'), ends('R')];
  G.returns = [
    [b[2][1], [b[2][1][0] + 4, b[2][1][1] + 2.2], [a[0][0][0] - 2, a[0][0][1] + 2.4], a[0][0]],
    [a[0][1], [a[0][1][0] - 1, a[0][1][1] - 3.5], [a[1][1][0] + 0.5, a[1][1][1] + 1.5], a[1][1]],
    [a[1][0], [a[1][0][0] + 1, a[1][0][1] + 4], [r[0][0][0] - 4, r[0][0][1] + 2.6], r[0][0]],
  ];
  G.electrodes = [b[0][0], b[2][1], a[0][0], a[0][1], a[1][0], a[1][1], r[0][0], r[2][1], glassPt([-6.5, 11.5]), glassPt([6.5, 11.5])];
  G.standoffs = [[167, 81], [167, 90], [182, 85], [189, 81], [200, 86], [210, 82], [217, 87], [249, 81], [259, 81], [254, 93], [158, 71], [236, 98], [270, 88]];
  return G;
}

// ---------------------------------------------------------------- albedo, painted into the bar row (logical coords)
export function paintSignAlbedo(g, G) {
  const r = rand(77);
  // rust runs on the brick under the panel and under the arrow
  for (const [x, y, len] of [[154, 101, 16], [160, 101, 9], [229, 101, 11], [240, 101, 20], [265, 101, 14], [258, 117, 9], [235, 116, 7]]) {
    for (let k = 0; k < len; k++) px(g, `rgba(110,48,18,${0.5 * (1 - k / len)})`, x + (k > len * 0.6 ? 1 : 0), y + k);
    px(g, 'rgba(140,64,24,0.35)', x - 1, y, 3, 2);
  }
  // the panel's shadow on the wall (it stands off it on angle iron)
  for (let y = P.y0; y <= P.y1 + 4; y++) {
    for (let x = P.x0; x <= P.dx + P.dr + 4; x++) {
      if (sdPanel(x - 2.5, y - 2.5) < 0 && sdPanel(x + 0.5, y + 0.5) >= 0 && y > 74) px(g, 'rgba(12,4,8,0.55)', x, y);
    }
  }
  // angle-iron brackets, guy wires back to the roof
  for (const y of [77, 94]) { px(g, '#2a2628', P.x0 - 4, y, 5, 2); px(g, '#4a4446', P.x0 - 4, y, 5, 1); px(g, '#9a9088', P.x0 - 3, y + 1); }
  px(g, '#2a2628', 270, 92, 6, 2); px(g, '#4a4446', 270, 92, 6, 1); px(g, '#9a9088', 274, 93);
  line(g, '#1e1a1e', 154, 70, 136, 74); line(g, '#1e1a1e', 262, 70, 284, 74);
  px(g, '#2a2628', 135, 73, 2, 2); px(g, '#2a2628', 284, 73, 2, 2);
  // the arrow: sheet metal in red enamel, rolled edge, sockets (the bulbs are live)
  const arrowD = (x, y) => {
    let d = 1e9;
    for (let i = 1; i < SPINE.length; i++) {
      const [ax, ay] = SPINE[i - 1], [bx, by] = SPINE[i], vx = bx - ax, vy = by - ay;
      const k = clamp(((x - ax) * vx + (y - ay) * vy) / (vx * vx + vy * vy), 0, 1);
      d = Math.min(d, Math.hypot(x - ax - vx * k, y - ay - vy * k));
    }
    const body = d - ARROW.w;
    const [tx, ty] = ARROW.tip, hx = x - tx, hy = Math.abs(y - ty);          // head: a triangle pointing left
    const head = Math.max(hy - hx * (ARROW.half / 12), hx - 12, -hx);
    return Math.min(body, head);
  };
  for (let y = 96; y < 124; y++) {
    for (let x = 216; x < 280; x++) {
      const d = arrowD(x + 0.5, y + 0.5);
      if (d > 0.3) continue;
      const up = arrowD(x + 0.5, y - 0.5) > 0.3, down = arrowD(x + 0.5, y + 1.5) > 0.3;
      let col = d > -1 ? (up ? '#c8a060' : down ? '#3a1410' : '#a07840') : d > -2 ? '#4a1014' : (r() < 0.1 ? '#8a2a26' : '#7a2024');
      if (d <= -2 && r() < 0.06) col = '#9a5a2a';
      px(g, col, x, y);
      if (d > -1 && arrowD(x + 2.5, y + 2.5) > 0.3 && down) px(g, 'rgba(12,4,8,0.5)', x + 1, y + 2);
    }
  }
  for (const [x, y] of BULB_AT) { px(g, '#120c0e', x - 1, y - 1, 3, 3); px(g, '#4a3a2a', x, y, 1, 1); px(g, '#2a2018', x + 1, y + 1); }
  // the panel: worn enamel, rolled steel edge lit from above, chips down to the primer or the rust, rust at the bolts
  const bolts = [[155, 73], [155, 97], [236, 73], [236, 97], [254, 71], [254, 101], [268, 86]];
  const chips = Array.from({ length: 34 }, () => {
    let x, y;
    do { x = P.x0 + r() * (P.dx + P.dr - P.x0); y = P.y0 + r() * (P.dy + P.dr - P.y0); } while (sdPanel(x, y) > -0.5 || (sdPanel(x, y) < -7 && r() < 0.7));
    return [x, y, 0.6 + r() * 1.7, r() < 0.4];
  });
  for (let y = P.y0 - 1; y <= P.dy + P.dr + 1; y++) {
    for (let x = P.x0 - 1; x <= P.dx + P.dr + 1; x++) {
      const cx = x + 0.5, cy = y + 0.5, d = sdPanel(cx, cy);
      if (d > 0.25) continue;
      const tone = 0.5 + 0.5 * Math.sin(cx * 0.21 + Math.sin(cy * 0.3) * 1.6) * Math.sin(cy * 0.17 + cx * 0.05);
      const v = (cy - P.y0) / (P.y1 - P.y0);
      let rgb = [58 - 12 * v + tone * 10, 92 - 18 * v + tone * 10, 92 - 16 * v + tone * 8];
      if (d > -1.2) {
        const above = sdPanel(cx, cy - 1.5) > 0, below = sdPanel(cx, cy + 1.5) > 0;
        rgb = above ? [176, 184, 186] : below ? [36, 40, 44] : [112, 124, 128];
      }
      for (const [bx, by, br, rust] of chips) {
        const q = Math.hypot(cx - bx, (cy - by) * 1.3);
        if (q < br) rgb = rust ? [160 + r() * 30, 74, 30] : [150, 144, 136];
        else if (q < br + 0.7 && d < -1.2) rgb = [196, 202, 200];
      }
      for (const [bx, by] of bolts) {
        const q = Math.hypot(cx - bx - 0.5, cy - by - 0.5);
        if (q < 1.8 && r() < 0.8 - q * 0.3) rgb = [104 + r() * 24, 46 + r() * 10, 20];
      }
      if (cy > P.y1 - 4 && d > -3.5 && r() < 0.45) rgb = [140 + r() * 30, 62, 24];           // the lower lip rots first
      px(g, `rgb(${rgb.map((n) => Math.round(n)).join(',')})`, x, y);
    }
  }
  for (const [bx, by] of bolts) { px(g, '#c8beb4', bx, by); px(g, '#1a1214', bx + 1, by + 1); px(g, 'rgba(110,48,18,0.6)', bx, by + 2, 1, 3); }
  // tubes as they are when off: dusty glass; the returns painted black; electrodes, standoffs
  for (const pl of G.returns) {
    const s = grow(raster([pl]), false);
    fill(g, s, '#141014'); fill(g, raster([pl]), '#2c242a');
  }
  const off = (s, body, core, fat) => { const m = fat ? grow(s, false) : s; fill(g, minus(grow(m), m), body); fill(g, m, core); };
  off(G.BA, '#5a3a4a', '#8a6a78', true); off(G.R, '#5a3a4a', '#8a6a78', true);
  off(G.glass, '#2e4e56', '#4a6a72'); fill(g, G.border, '#544468'); fill(g, G.corner, '#544468');
  fill(g, G.liquid, '#4a5a30'); fill(g, G.pick, '#6a5a2a');
  px(g, '#5a1a1a', OLIVE[0] - 1, OLIVE[1] - 1, 3, 3);
  for (const [x, y] of BUBBLES) { px(g, '#3a5a62', x - 1, y, 3, 1); px(g, '#3a5a62', x, y - 1, 1, 3); }
  for (const [x, y] of G.electrodes) { px(g, '#1a181c', x - 1, y - 1, 3, 3); px(g, '#6a6670', x - 1, y - 1, 2, 1); }
  for (const [x, y] of [[193, 98], [199, 98]]) { px(g, '#1a181c', x - 1, y - 1, 3, 3); px(g, '#6a6670', x - 1, y - 1, 2, 1); }
  for (const [x, y] of G.standoffs) { px(g, '#a8b4bc', x, y); px(g, 'rgba(10,4,8,0.6)', x + 1, y + 1); }
  // electrics: transformer box with its vents and label, flex conduit drooping to the panel, junction box, old loop
  px(g, '#1e1c22', 126, 78, 14, 13); px(g, '#4a4852', 127, 79, 12, 11); px(g, '#5e5c66', 127, 79, 12, 1);
  for (let y = 81; y < 88; y += 2) px(g, '#2a2830', 129, y, 5, 1);
  px(g, '#b8b0a0', 135, 82, 3, 4); px(g, '#6a6050', 135, 84, 3, 1);
  px(g, 'rgba(110,48,18,0.5)', 127, 89, 12, 1); px(g, 'rgba(110,48,18,0.35)', 131, 91, 1, 6); px(g, 'rgba(110,48,18,0.3)', 137, 91, 1, 4);
  const sag = (x0, y0, x1, y1, s, col, w = 2) => {
    for (let i = 0; i <= 40; i++) {
      const k = i / 40;
      px(g, col, x0 + (x1 - x0) * k, y0 + (y1 - y0) * k + Math.sin(k * Math.PI) * s, w, w);
    }
  };
  sag(138, 90, 151, 96, 6, '#16141a'); sag(138, 89, 151, 95, 6, '#3a3640', 1);
  for (let i = 1; i < 6; i++) { const k = i / 6; px(g, '#4e4a54', 138 + 13 * k, 90 + 6 * k + Math.sin(k * Math.PI) * 6 + 1); }
  px(g, '#1e1c22', 121, 94, 8, 7); px(g, '#4a4852', 122, 95, 6, 5); px(g, '#5e5c66', 122, 95, 6, 1); px(g, '#2a2830', 124, 97, 2, 1);
  px(g, '#16141a', 128, 90, 2, 4);
  sag(122, 101, 116, 100, 4, '#0e0c10', 1); sag(116, 100, 119, 98, -1, '#0e0c10', 1);
  line(g, '#0e0c10', 126, 101, 127, 104); line(g, '#0e0c10', 127, 104, 124, 105); line(g, '#0e0c10', 124, 105, 123, 101);
}

// ---------------------------------------------------------------- cached lit parts
export function buildSign() {
  const G = geometry();
  const layer = (paint) => { const { c, g } = canvas(); g.translate(M, MY); paint(g); return cropTo(c, BOX.x0, BOX.y0, BOX.x1, BOX.y1); };
  const S = { G };
  S.BA = layer((g) => litTube(g, G.BA, PINK, true));
  S.R = layer((g) => litTube(g, G.R, PINK, true));
  S.glass = layer((g) => {
    litTube(g, G.glass, CYAN);
    fill(g, minus(grow(G.liquid, false), G.liquid), LIME[1]); fill(g, G.liquid, LIME[3]);
    litTube(g, G.pick, YELLOW);
    px(g, '#a0101c', OLIVE[0] - 1, OLIVE[1] - 1, 3, 3); px(g, '#ff3a3a', OLIVE[0] - 1, OLIVE[1], 2, 1); px(g, '#ffd0c0', OLIVE[0] - 1, OLIVE[1] - 1);
  });
  S.border = layer((g) => litTube(g, G.border, VIOLET, false, true));
  S.corner = layer((g) => litTube(g, G.corner, VIOLET, false, true));
  // halos: each group's glass painted fat, blurred twice, kept at half resolution (they are soft) and summed per
  // frame into tmpHalo, which goes to the screen in one draw; the mist: everything, blurred wide (it rains)
  const hw = (BOX.x1 - BOX.x0) / 2, hh = (BOX.y1 - BOX.y0) / 2;
  const half = (src) => {
    const { c, g } = canvas(hw, hh);
    g.imageSmoothingEnabled = true;
    g.drawImage(src, BOX.x0, BOX.y0, BOX.x1 - BOX.x0, BOX.y1 - BOX.y0, 0, 0, hw, hh);
    return c;
  };
  const halo = (sets, col, k1, k2) => {
    const { c, g } = canvas(); g.translate(M, MY);
    for (const s of sets) fill(g, grow(grow(s)), col);
    return half(blur(blur(c, k1), k2));
  };
  S.tmpHalo = canvas(hw, hh);
  S.haloBA = halo([grow(G.BA)], '#ff2a6d', 3, 6);
  S.haloR = halo([grow(G.R)], '#ff2a6d', 3, 6);
  S.haloGlass = halo([G.glass, G.liquid], '#05d9e8', 3, 6);
  S.haloBorder = halo([G.border, G.corner], '#9a3aff', 3, 5);
  S.haloBulbs = halo([new Set(BULB_AT.map(([x, y]) => key(x, y)))], '#ffa040', 2, 5);
  S.mist = (() => {
    const { c, g } = canvas(); g.translate(M, MY);
    fill(g, grow(grow(G.BA)), '#ff2a6d'); fill(g, grow(grow(G.R)), '#ff2a6d'); fill(g, grow(grow(G.glass)), '#05d9e8'); fill(g, G.border, '#9a3aff');
    return half(blur(blur(c, 8), 14));
  })();
  S.cols = { BA: columns(G.BA), R: columns(G.R), glass: columns(G.glass), border: columns(new Set([...G.border, ...G.corner])), bulbs: columns(new Set(BULB_AT.map(([x, y]) => key(x, y)))) };
  return S;
}

// ---------------------------------------------------------------- per frame
// into the bar row (layer canvas, before it is blitted): lit tubes at their state, the bulbs, the bubbles
export function drawSignLit(g, S, st, bulbs) {
  const tube = (c, a) => { if (a > 0.02) { g.globalAlpha = a; put(g, c); } };
  tube(S.BA, st.main); tube(S.R, st.R); tube(S.glass, st.glass); tube(S.border, st.border); tube(S.corner, st.corner);
  g.globalAlpha = 1;
  if (st.strike >= 0 && st.strike < 0.07) tube(S.R, 1);
  BULB_AT.forEach(([x, y], i) => {
    const b = bulbs[i];
    if (b < 0.12) return;
    g.fillStyle = b > 0.8 ? '#fff2c0' : b > 0.45 ? '#ffc860' : '#b0602a';
    g.fillRect(x + M, y + MY, 1, 1);
    if (b > 0.45) { g.fillStyle = `rgba(255,170,70,${0.7 * b})`; g.fillRect(x - 1 + M, y + MY, 1, 1); g.fillRect(x + 1 + M, y + MY, 1, 1); g.fillRect(x + M, y - 1 + MY, 1, 1); g.fillRect(x + M, y + 1 + MY, 1, 1); }
  });
  BUBBLES.forEach(([x, y], i) => {
    if (!st.bubbles[i]) return;
    g.fillStyle = '#a8f4ff'; g.fillRect(x - 1 + M, y + MY, 3, 1); g.fillRect(x + M, y - 1 + MY, 1, 3);
    g.fillStyle = '#f0ffff'; g.fillRect(x + M, y + MY, 1, 1);
  });
}
// on the screen, at the bar row's offset: halos and mist (smooth, additive; with them the scene's other glows near
// the sign, glows: [sprite, alpha, x, y, w, h] in logical px), the restrike flash and its sparks, water dripping
// from the lower lip, wisps of steam off the warm transformer
export function drawSignFx(ctx, S, st, bulbs, wind, rain, t, bx, by, glow, glows) {
  const lit = bulbs.reduce((a, b) => a + b, 0) / bulbs.length, hg = S.tmpHalo.g;
  hg.globalCompositeOperation = 'source-over'; hg.globalAlpha = 1;
  hg.clearRect(0, 0, S.tmpHalo.c.width, S.tmpHalo.c.height);
  hg.globalCompositeOperation = 'lighter';
  hg.imageSmoothingEnabled = true;
  const h = (c, a) => { if (a > 0.01) { hg.globalAlpha = Math.min(1, a); hg.drawImage(c, 0, 0); } };
  h(S.haloBA, st.main * 0.62); h(S.haloR, st.R * 0.62); h(S.haloGlass, st.glass * 0.32);
  h(S.haloBorder, (st.border * 0.8 + st.corner * 0.2) * 0.45); h(S.haloBulbs, lit * 0.9);
  h(S.mist, (0.12 + 0.22 * rain) * st.main);
  for (const [c, a, x, y, w, hh] of glows) {
    if (a < 0.01) continue;
    hg.globalAlpha = Math.min(1, a);
    hg.drawImage(c, (x + M - BOX.x0) / 2, (y + MY - BOX.y0) / 2, w / 2, hh / 2);
  }
  ctx.imageSmoothingEnabled = true;
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = 1;
  ctx.drawImage(S.tmpHalo.c, BOX.x0 + bx - M, BOX.y0 + by - MY, BOX.x1 - BOX.x0, BOX.y1 - BOX.y0);
  if (st.strike >= 0 && st.strike < 0.09) {
    ctx.globalAlpha = 1 - st.strike / 0.09;
    ctx.drawImage(glow, R_SPARK.x + bx - 7, R_SPARK.y + by - 7, 14, 14);
  }
  ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'; ctx.imageSmoothingEnabled = false;
  if (st.strike >= 0) {
    for (let i = 0; i < 7; i++) {
      const life = 0.35 + hash(i * 3.1 + 0.2) * 0.75, a = st.strike - hash(i * 1.3) * 0.05;
      if (a < 0 || a > life) continue;
      const vx = (hash(i * 5.7) - 0.6) * 40, vy = -10 - hash(i * 2.9) * 30;
      const x = R_SPARK.x + vx * a - wind.speed * 30 * a * a, y = R_SPARK.y + vy * a + 160 * a * a;
      if (y > GY - 1) continue;
      const k = a / life;
      ctx.fillStyle = k < 0.3 ? '#ffffff' : k < 0.65 ? '#ffd27a' : '#ff6a2a';
      ctx.fillRect(Math.round(x) + bx, Math.round(y) + by, 1, 1);
    }
  }
  // drips off the lower lip: a bead swells, lets go, falls bent by the wind
  LIP_DRIPS.forEach(([x0, y0], i) => {
    const per = 0.9 + hash(i + 0.5) * 1.1 - rain * 0.3, a = (t + hash(i) * per) % per, grow = 0.55 * per;
    ctx.fillStyle = 'rgba(255,170,210,0.55)';
    if (a < grow) { if (a > grow * 0.4) ctx.fillRect(x0 + bx, y0 + by, 1, 1); return; }
    const f = a - grow, y = y0 + 1 + 140 * f * f + 20 * f, x = x0 - wind.slant * (y - y0) * 0.5;
    if (y > GY - 1) return;
    ctx.fillRect(Math.round(x) + bx, Math.round(y) + by, 1, 2);
  });
  // the transformer is warm: thin wisps where the rain lands on it
  for (let i = 0; i < 5; i++) {
    const life = 1.6, a = (t + i * life / 5) % life, k = a / life;
    const x = 128 + hash(i + Math.floor((t + i * life / 5) / life) * 1.7) * 10 - wind.speed * 14 * a * a - a * 2, y = 78 - a * 7;
    ctx.fillStyle = `rgba(200,190,215,${(1 - k) * Math.min(1, k * 4) * 0.22 * rain})`;
    ctx.fillRect(Math.round(x) + bx, Math.round(y) + by, 1 + (k > 0.5 ? 1 : 0), 1);
  }
}
// the sign's lights, for the wall, the ground, the street and the rain (logical coords)
export const SIGN_LIGHT = {
  pink: [194, 86], cyan: [GLASS.x, GLASS.y], violet: [205, 86], amber: [246, 106],
};
// which strokes make which reflection, for the wet ground
export const REFL_SPAN = { BA: [164, 203], R: [208, 226], glass: [242, 268], border: [151, 271], bulbs: [222, 272] };
