// Title proposal A, THE NEON POSTER (?title=a): the title is the comic's cover, in its cut paper. The still
// (title/poster, tools/comic/title_art.py poster_art) has THE RUNNER black before the glow of his burning building,
// his back to it, and the four he is after as shadows over the city, each with his sign. Over it, cut live and flat:
// the flames on the roof, the smoke, embers, his windows, the rain, the boss's cigar, and the logo, a neon sign in
// cut paper that lights letter by letter and buzzes. The menu's first page is the poster's bottom line; the other
// pages stand on a black band (Paper.js). A proposal: nothing here is the game's title yet (Proposals.js).
import { spriteOpt } from '../../../engine/Assets.js';
import { hash, px, poly, line } from '../cine/Ink.js';
import { drawPrompts } from '../Glyphs.js';
import { drawTitlePage } from '../MenuArt.js';
import { FW, FH, INK, NIGHT_L, NIGHT_LL, BONE, PINK, FIRE, FIRE_D, lay, frame, show, steps, slab, lump, letter, widthOf, band } from './Paper.js';

// in the still's px, as in tools/comic/title_art.py (GLOW, ROOF, LOGO_AT; EMBER and LETTERS are printed by
// tools/comic/title_proposals.py)
const GLOW = [590, 452, 236];            // the fire's glow: a disc
const ROOF = [712, 780, 356];            // the burning building: x0, x1, its roof
const EMBER = [1002, 308];               // the tip of the boss's cigar
const LOGO = [306, 14];                  // the logo's sheet (title/logo, title/logo_off)
const LETTERS = [[16, 52, 106, 184], [100, 53, 190, 185], [184, 53, 278, 185], [272, 52, 366, 184], [360, 47, 440, 179], [434, 49, 524, 181]];
const FACE = [470, 200, 650, 300];       // his head: no rain across it
const MENU_Y = 606;

const inGlow = (x, y) => (x - GLOW[0]) ** 2 + (y - GLOW[1]) ** 2 < GLOW[2] ** 2;

// a polygon in one ink before the glow and another over the night (smoke: black on fire, violet on violet)
function polyOnGlow(g, pts, inside, outside) {
  let y0 = Infinity, y1 = -Infinity;
  for (const p of pts) { y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[1]); }
  for (let y = Math.ceil(y0); y <= Math.floor(y1); y++) {
    const xs = [];
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length];
      if ((a[1] <= y && b[1] > y) || (b[1] <= y && a[1] > y)) xs.push(a[0] + ((y - a[1]) / (b[1] - a[1])) * (b[0] - a[0]));
    }
    xs.sort((m, n) => m - n);
    const d = GLOW[2] ** 2 - (y - GLOW[1]) ** 2, half = d > 0 ? Math.sqrt(d) : -1, g0 = GLOW[0] - half, g1 = GLOW[0] + half;
    for (let i = 0; i + 1 < xs.length; i += 2) {
      const xa = Math.round(xs[i]), xb = Math.round(xs[i + 1]);
      g.fillStyle = outside;
      g.fillRect(xa, y, xb - xa, 1);
      const ia = Math.max(xa, Math.round(g0)), ib = Math.min(xb, Math.round(g1));
      if (half > 0 && ib > ia) { g.fillStyle = inside; g.fillRect(ia, y, ib - ia, 1); }
    }
  }
}

function fire(g, t) {
  const [x0, x1, y] = ROOF, n = steps(t, 9), h = (i) => 0.6 + 0.75 * hash(i * 3.1 + n * 7.7);
  // the smoke: lumps going up with the wind, growing, then gone
  for (let i = 0; i < 4; i++) {
    const k = (t * 0.11 + i / 4) % 1, r = (14 + 30 * k) * Math.min(1, (1 - k) / 0.12);
    polyOnGlow(g, lump(746 + 70 * k * k + Math.sin(k * 6 + i) * 5, 326 - 170 * k, r, i * 13), INK, NIGHT_L);
  }
  // the flames over the roof, his windows
  poly(g, FIRE, [[x0 + 4, y + 4], [x0 + 12, y - 34 * h(0)], [x0 + 22, y - 12], [x0 + 34, y - 56 * h(1)], [x0 + 46, y - 16],
    [x0 + 56, y - 40 * h(2)], [x1 - 4, y + 4]]);
  for (let i = 0; i < 4; i++) if (hash(i * 5.3 + steps(t, 6) * 1.9) < 0.22) px(g, FIRE_D, x0 + 8 + (i & 1) * 29, y + 18 + (i >> 1) * 30, 23, 21);
  // embers
  for (let i = 0; i < 10; i++) {
    const k = (t * 0.26 * (0.6 + hash(i)) + hash(i + 5)) % 1, s = k < 0.7 ? 6 : 3;
    if (hash(i * 3 + steps(t, 8)) > 0.2) px(g, k < 0.55 ? FIRE : FIRE_D, x0 + 10 + hash(i + 9) * 50 + k * k * 110 * (0.3 + hash(i + 2)), y - 24 - k * 210, s, s);
  }
}

function rain(g, t) {
  for (let i = 0; i < 70; i++) {
    const u = (t * (1.3 + hash(i) * 0.7) + hash(i + 1)) % 1, len = 22 + hash(i + 3) * 28;
    const x = hash(i + 2) * (FW + 260) - 230 + u * (FH + 80) * 0.32, y = -50 + u * (FH + 80), mx = x + len * 0.16, my = y + len / 2;
    if (mx > FACE[0] && mx < FACE[2] && my > FACE[1] && my < FACE[3]) continue;
    line(g, inGlow(mx, my) ? INK : NIGHT_LL, x, y, x + len * 0.32, y + len, 3);
  }
  for (let i = 0; i < 12; i++) {                              // where it lands on the street
    const slot = Math.floor(t * 4 + hash(i) * 7);
    if ((t * 4 + hash(i) * 7) % 1 < 0.35) px(g, NIGHT_LL, hash(slot * 1.3 + i) * FW, 532 + hash(slot * 2.1 + i) * 60, 9, 2);
  }
}

// the boss's cigar: three puffs off its tip
function cigar(g, t) {
  for (let i = 0; i < 3; i++) {
    const k = (t * 0.2 + i / 3) % 1, r = (3 + 8 * k) * Math.min(1, (1 - k) / 0.2);
    poly(g, NIGHT_LL, lump(EMBER[0] - 8 - 26 * k + Math.sin(k * 5 + i) * 4, EMBER[1] - 10 - 62 * k, r, i * 7 + 40));
  }
}

// The logo: it lights letter by letter, then buzzes: the second N fails now and then, the whole sign blinks once in
// a while. false when its sheet is missing.
function logo(g, t) {
  const on = spriteOpt('title/logo'), off = spriteOpt('title/logo_off');
  if (!on) return false;
  g.drawImage(on, LOGO[0], LOGO[1]);
  if (!off) return true;
  const n = steps(t, 14);
  LETTERS.forEach(([x0, y0, x1, y1], i) => {
    const start = 0.5 + i * 0.24;
    const dead = t < start || (t < start + 0.3 && hash(n * 1.3 + i) < 0.5) || (i === 3 && Math.sin(t * 0.9) > 0.5 && hash(n * 1.7) < 0.3)
      || (t % 11 > 10.75 && hash(n * 2.3) < 0.6);
    if (dead) g.drawImage(off, x0 + 6, y0, x1 - x0 - 12, y1 - y0, LOGO[0] + x0 + 6, LOGO[1] + y0, x1 - x0 - 12, y1 - y0);
  });
  return true;
}

// the first page: one line across the foot of the poster, the chosen item on a pink slab. Returns each item's
// place, in canvas px: [{ i, cx, w }], and the lettering's size and line
function rowOf(ctx, W, f, items) {
  let size = 21 * f.k, gap = 50 * f.k;
  let ws = items.map((it) => widthOf(ctx, it.label, size)), total = ws.reduce((a, b) => a + b, 0) + gap * (ws.length - 1);
  if (total > W * 0.9) { const k = (W * 0.9) / total; size *= k; gap *= k; ws = ws.map((w) => w * k); total *= k; }
  let x = W / 2 - total / 2;
  return { size, gap, y: f.oy + MENU_Y * f.k, at: ws.map((w, i) => { const cx = x + w / 2; x += w + gap; return { i, cx, w }; }) };
}

// view: { menu, device }. Returns where the menu's items are, for the mouse (ui/MenuArt.js drawMenu's rects).
export function drawPosterTitle(ctx, W, H, t, view) {
  const g = lay('title/poster'), f = frame(W, H), menu = view.menu, page = menu.page;
  fire(g, t);
  cigar(g, t);
  rain(g, t);
  const lit = logo(g, t);
  if (!page.row) {
    band(g, W, H);
    show(ctx, W, H);
    if (!lit) letter(ctx, 'FULL MATTER RUNNER', W / 2, f.oy + 110 * f.k, 44 * f.k, BONE);
    return drawTitlePage(ctx, W, H, t, menu, view.device);
  }
  const row = rowOf(ctx, W, f, page.items), on = row.at[menu.sel];
  if (on) {
    const x0 = (on.cx - on.w / 2 - f.ox) / f.k, x1 = (on.cx + on.w / 2 - f.ox) / f.k;
    poly(g, PINK, slab(x0 - 16, MENU_Y - 21, x1 + 16, MENU_Y + 19, (steps(t, 3) % 3) * 11, 3));
  }
  show(ctx, W, H);
  if (!lit) letter(ctx, 'FULL MATTER RUNNER', W / 2, f.oy + 110 * f.k, 44 * f.k, BONE);
  for (const a of row.at) letter(ctx, page.items[a.i].label, a.cx, row.y, row.size, a.i === menu.sel ? INK : BONE);
  drawPrompts(ctx, [['choose', 'CHOOSE'], ['confirm', 'SELECT']], W / 2, f.oy + 636 * f.k, 13 * f.k, view.device, { alpha: 0.6, gap: 2.2 });
  return row.at.map((a) => ({ i: a.i, x: a.cx - a.w / 2 - row.gap * 0.4, y: row.y - row.size, w: a.w + row.gap * 0.8, h: row.size * 2 }));
}
