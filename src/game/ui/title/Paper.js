// The cut-paper title proposals' sheet (PosterTitle.js, HitList.js): one canvas at the comic stills' px (SC a title
// px, tools/comic/title_art.py), on which a still is laid and what moves is cut over it, flat and aliased, before
// the whole is put on the screen with nearest neighbour. Lettering is written after, on the screen itself, so it
// stays sharp at any window size. The inks are the comic's (tools/comic/kit.py).
import { LW, LH, canvas } from './Draw.js';
import { hash, poly } from '../cine/Ink.js';
import { spriteOpt } from '../../../engine/Assets.js';

const SC = 3;                                 // sheet px a title px
export const FW = LW * SC, FH = LH * SC;
const NIGHT = '#170b2b';
export const INK = '#0a070c', NIGHT_L = '#2a1548', NIGHT_LL = '#3d2a6a', BONE = '#f2e8d2', BONE_D = '#b8a890',
  PINK = '#ff3a7a', PINK_D = '#8a1d5c', FIRE = '#ff8a20', FIRE_D = '#c8381a';

let sheet = null;
// the sheet, with the still `name` (an optional sprite) laid on it, or the night when it is missing
export function lay(name) {
  if (!sheet) sheet = canvas(FW, FH);
  const g = sheet.g, img = spriteOpt(name);
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.globalAlpha = 1;
  if (img) g.drawImage(img, 0, 0); else { g.fillStyle = NIGHT; g.fillRect(0, 0, FW, FH); }
  return g;
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
  return f;
}

// time held in steps: cut paper moves like stop motion, a few pictures a second
export const steps = (t, fps = 10) => Math.floor(t * fps);

// points turned deg about the origin, then moved to (cx, cy)
export function turned(pts, cx, cy, deg) {
  const a = (deg * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a);
  return pts.map(([x, y]) => [cx + x * c - y * s, cy + x * s + y * c]);
}
// a rectangle cut by hand: its corners each up to k px off, the same for a seed
export function slab(x0, y0, x1, y1, seed = 0, k = 3) {
  return [[x0, y0], [x1, y0], [x1, y1], [x0, y1]].map(([x, y], i) => [x + (hash(seed + i * 2) - 0.5) * 2 * k, y + (hash(seed + i * 2 + 1) - 0.5) * 2 * k]);
}
// a lump of smoke: seven corners about (x, y), r across
export function lump(x, y, r, seed = 0) {
  return [[-1, -0.3], [-0.5, -1], [0.4, -0.9], [1, -0.2], [0.8, 0.7], [-0.1, 1], [-0.9, 0.6]]
    .map(([c, s], i) => [x + (c + (hash(seed + i) - 0.5) * 0.3) * r, y + (s + (hash(seed + i + 9) - 0.5) * 0.3) * r * 0.8]);
}
// a paper tag pinned at (cx, cy), w x h, leaning deg, on its hard shadow; up: lifted off the board (the chosen one)
export function tag(g, cx, cy, w, h, deg, seed, paper, up = false) {
  const q = slab(-w / 2, -h / 2, w / 2, h / 2, seed, 3), d = up ? 4 : 0;
  poly(g, INK, turned(q.map(([x, y]) => [x + 6 + d, y + 8 + d]), cx, cy, deg));
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
export function widthOf(ctx, str, size) {
  ctx.font = `${Math.round(size)}px joystix, monospace`;
  return ctx.measureText(str).width;
}
// The other pages (options, audio...) stand on a black band cut across the lower part of the sheet: its top edge
// is where ui/MenuArt.js puts a page's title, whatever the window's shape.
export function band(g, W, H, edge = PINK_D) {
  const f = frame(W, H), y = (H * 0.535 - f.oy) / f.k;
  poly(g, edge, [[-10, y - 2], [FW + 10, y - 22], [FW + 10, FH + 10], [-10, FH + 10]]);
  poly(g, INK, [[-10, y + 6], [FW + 10, y - 16], [FW + 10, FH + 10], [-10, FH + 10]]);
}
