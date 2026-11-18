// The front end's cut paper (the title's poster, the hit list, the menu's panel): one sheet at the comic stills' px
// (3 a title px, tools/comic/title_art.py), on which stills are laid and what moves is cut over them, flat and
// aliased, before the whole is put on the screen with nearest neighbour. Lettering is written after, on the screen
// itself, so it stays sharp at any window size. The inks are the comic's (tools/comic/kit.py, STYLE.md).
import { LW, LH, canvas } from './Draw.js';
import { hash, poly } from '../cine/Ink.js';
import { spriteOpt } from '../../../engine/Assets.js';

const SC = 3;                                 // sheet px a title px
export const FW = LW * SC, FH = LH * SC;
export const INK = '#0a070c', NIGHT = '#170b2b', NIGHT_L = '#2a1548', NIGHT_LL = '#3d2a6a', BONE = '#f2e8d2', BONE_D = '#b8a890',
  PINK = '#ff3a7a', PINK_D = '#8a1d5c', CYAN = '#3ad8e8', CYAN_D = '#17566e', FIRE = '#ff8a20', FIRE_D = '#c8381a', FIRE_L = '#ffc83a',
  BLOOD = '#a0141e';

let sheet = null;
// the sheet, filled with an ink, or clear (ground null: a second sheet over what is on screen)
export function open(ground = NIGHT) {
  if (!sheet) sheet = canvas(FW, FH);
  const g = sheet.g;
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.globalAlpha = 1;
  if (ground) { g.fillStyle = ground; g.fillRect(0, 0, FW, FH); } else g.clearRect(0, 0, FW, FH);
  return g;
}
// a still (an optional sprite) laid on the sheet, its corner at (x, y), whole px; false when it is missing
export function put(g, name, x = 0, y = 0) {
  const img = spriteOpt(name);
  if (img) g.drawImage(img, Math.round(x), Math.round(y));
  return !!img;
}

// where the sheet lands on a W x H canvas (it covers it): k canvas px a sheet px, its corner at (ox, oy)
export function frame(W, H) {
  const sc = Math.max(W / LW, H / LH);
  return { k: sc / SC, ox: (W - LW * sc) / 2, oy: (H - LH * sc) / 2 };
}
export function show(ctx, W, H) {
  const f = frame(W, H);
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(sheet.c, Math.round(f.ox), Math.round(f.oy), Math.round(FW * f.k), Math.round(FH * f.k));
  ctx.restore();
}

// time held in steps: cut paper moves like stop motion, a few pictures a second
export const steps = (t, fps = 10) => Math.floor(t * fps);

// points turned deg about the origin, then moved to (cx, cy)
export function turned(pts, cx, cy, deg) {
  const a = (deg * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a);
  return pts.map(([x, y]) => [cx + x * c - y * s, cy + x * s + y * c]);
}
export const moved = (pts, dx, dy = 0) => pts.map(([x, y]) => [x + dx, y + dy]);
// a rectangle cut by hand: its corners each up to k px off, the same for a seed
export function slab(x0, y0, x1, y1, seed = 0, k = 3) {
  return [[x0, y0], [x1, y0], [x1, y1], [x0, y1]].map(([x, y], i) => [x + (hash(seed + i * 2) - 0.5) * 2 * k, y + (hash(seed + i * 2 + 1) - 0.5) * 2 * k]);
}
// a strip from a to b, w0 wide at a and w1 at b
export function strip(a, b, w0, w1 = w0) {
  const dx = b[0] - a[0], dy = b[1] - a[1], d = Math.hypot(dx, dy) || 1, nx = -dy / d / 2, ny = dx / d / 2;
  return [[a[0] + nx * w0, a[1] + ny * w0], [b[0] + nx * w1, b[1] + ny * w1], [b[0] - nx * w1, b[1] - ny * w1], [a[0] - nx * w0, a[1] - ny * w0]];
}
// a lump of smoke: seven corners about (x, y), r across
export function lump(x, y, r, seed = 0) {
  return [[-1, -0.3], [-0.5, -1], [0.4, -0.9], [1, -0.2], [0.8, 0.7], [-0.1, 1], [-0.9, 0.6]]
    .map(([c, s], i) => [x + (c + (hash(seed + i) - 0.5) * 0.3) * r, y + (s + (hash(seed + i + 9) - 0.5) * 0.3) * r * 0.8]);
}
// A flame from (x, y) its foot's middle, w wide and h high, leaning with the wind: cut tongues one in the other,
// orange, yellow, a white-hot core (cores 2: without it; title_art.py tongue). tf: a turn for its points (a flame in
// a leaning picture).
export function tongue(g, x, y, w, h, lean = 0, seed = 0, tf = null, cores = 3) {
  [[1, FIRE], [0.6, FIRE_L], [0.28, BONE]].slice(0, cores).forEach(([k, ink]) => {
    const ww = w * k, hh = h * k, ln = lean * k, j = (hash(seed + k * 10) - 0.5) * w * 0.12;
    const pts = [[x - ww / 2, y], [x - ww * 0.4 + ln * 0.3 + j, y - hh * 0.5], [x - ww * 0.12 + ln * 0.5, y - hh * 0.38], [x + ln, y - hh],
      [x + ww * 0.3 + ln * 0.55 - j, y - hh * 0.44], [x + ww / 2, y]];
    poly(g, ink, tf ? tf(pts) : pts);
  });
}
// a glint: a flat four-point star, opening and shutting (k 0..1)
export function glint(g, x, y, k, r = 12, ink = BONE) {
  const l = Math.round(r * Math.sin(k * Math.PI));
  if (l < 1) return;
  g.fillStyle = ink;
  g.fillRect(Math.round(x - l), Math.round(y - 1), l * 2 + 1, 3);
  g.fillRect(Math.round(x - 1), Math.round(y - l), 3, l * 2 + 1);
}
// a paper tag pinned at (cx, cy), w x h, leaning deg, on its hard shadow; up: lifted off the board (the chosen one)
export function tag(g, cx, cy, w, h, deg, seed, paper, up = false) {
  const q = slab(-w / 2, -h / 2, w / 2, h / 2, seed, 3), d = up ? 5 : 0;
  poly(g, INK, turned(q.map(([x, y]) => [x + 6 + d * 1.6, y + 8 + d * 1.6]), cx, cy, deg));
  poly(g, paper, turned(q, cx - d, cy - d, deg));
}

// plain lettering on the screen (no outline, no shadow: paper), centred on (x, y), leaning deg
export function letter(ctx, str, x, y, size, col, deg = 0, align = 'center') {
  ctx.save();
  ctx.translate(Math.round(x), Math.round(y));
  if (deg) ctx.rotate((deg * Math.PI) / 180);
  ctx.font = `${Math.round(size)}px joystix, monospace`;
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';
  ctx.fillStyle = col;
  ctx.fillText(str, 0, 0);
  ctx.restore();
}

// The menu's panel (ui/MenuArt.js: every page but the title's first and the hit list, and the pause): a black sheet
// cut by hand on a pink one that shows along two of its edges, a violet bar of light across it, and the page's name
// on a bone tab pinned over its top edge. x0..x1, y0..y1: the panel, in the sheet's px; tab: [its middle x, its
// width], or null. Laid on a clear sheet and shown over what is on screen.
export function panel(ctx, W, H, x0, y0, x1, y1, tab, seed = 0) {
  const g = open(null), q = slab(x0, y0, x1, y1, seed + 3, 5);
  poly(g, INK, moved(q, 10, 12));
  poly(g, PINK_D, moved(slab(x0, y0, x1, y1, seed + 11, 6), -9, -8));
  poly(g, INK, q);
  poly(g, NIGHT, [[x0 + (x1 - x0) * 0.56, y0 + 8], [x0 + (x1 - x0) * 0.8, y0 + 8], [x0 + (x1 - x0) * 0.58, y1 - 8], [x0 + (x1 - x0) * 0.34, y1 - 8]]);
  if (tab) {
    const [cx, w] = tab, t = slab(-w / 2, -24, w / 2, 24, seed + 5, 3);
    poly(g, INK, turned(moved(t, 6, 7), cx, y0 + 4, -1.5));
    poly(g, BONE, turned(t, cx, y0 + 4, -1.5));
    g.fillStyle = INK; g.fillRect(Math.round(cx) - 2, Math.round(y0) - 15, 7, 7);
    g.fillStyle = PINK; g.fillRect(Math.round(cx) - 4, Math.round(y0) - 17, 7, 7);        // its pin
  }
  show(ctx, W, H);
}
