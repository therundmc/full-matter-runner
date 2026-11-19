// OPTIONS: what he carries, laid out. His table seen from above, the satchel emptied on it under a lamp, in the
// comic's cut paper (tools/comic/STYLE.md, The title; stills by tools/comic/title_art.py): a thing a section, down
// the left: the walkman is AUDIO, the portable set VIDEO, the knuckles CONTROLS, the notebook GAME, his cap the way
// BACK. The chosen thing is lifted onto a slab of an ink that is not its own (its reels turn, its screen rolls), and
// its settings are cut on a sheet of paper beside it at once, pointing at it (ui/Menu.js `sheets`): a slider is a
// strip of tape pulled along a black line, a toggle a switch, a choice its value on a black tab between two wedges; the line the focus is on has a black wedge before it.
// The CONTROLS sheet is a grid of key caps (data/controls.js), cut like stickers: keys, a mouse, a pad's buttons.
// The same screen for the title's OPTIONS and the pause's. Returns where the items are, in canvas px, for the mouse:
// [{ i, page, x, y, w, h, track?, thing? }] (page: the menu page the item is on; thing: one of the things).
import { OPTIONS as O } from '../../data/titleart.js';
import { spriteOpt } from '../../../engine/Assets.js';
import { poly, disc } from '../cine/Ink.js';
import { selectable } from '../Menu.js';
import { INK, NIGHT, NIGHT_L, NIGHT_LL, BONE, BONE_D, PINK, PINK_D, CYAN, FIRE_L, open, put, frame, show, steps, slab, moved, turned, strip, tag, letter } from './Paper.js';
import { widthOf } from '../Text.js';

const SHEET = [520, 36, 1118, 612];          // the sheet of settings, in the picture's px
const TRACK = [270, 490];                    // a slider's line on it, from the sheet's left edge
const TAPE = 152;                            // a thing's name is on a strip of tape this far beside it
// the CONTROLS grid, in the picture's px: its two columns' left edges (from the sheet's), where the caps end (right
// aligned) and the action begins in a column, a line's and a group's name's pitch, a cap's height
const GRID = { cols: [24, 304], caps: 106, what: 116, width: 268, line: 30, head: 31, gap: 7, cap: 24 };
const FACE = { A: '#3fd46e', B: '#ff3b4a', X: '#3d8bff', Y: FIRE_L };

// is the menu on the options, or on a page under them
export const optionsUp = (menu) => menu.stack.some((e) => e.id === 'options');

// the five things on the table, the chosen one lifted on its slab; `held`: the focus is on its sheet (it stops boiling)
function things(g, t, chosen, held) {
  const img = spriteOpt('title/options_things'), [w, h] = O.cell;
  O.things.forEach((th, i) => {
    const on = i === chosen, [x, y] = th.at, d = on ? 7 : 0, x0 = Math.round(x - w / 2), y0 = Math.round(y - h / 2);
    if (on) {
      const q = slab(-w / 2 + 8, -h / 2 + 6, w / 2 - 8, h / 2 - 6, i * 3 + (held ? 0 : (steps(t, 3) % 3) * 13), 5);
      poly(g, INK, turned(moved(q, 9, 11), x, y, th.lean));
      poly(g, th.slab, turned(q, x, y, th.lean));
    }
    if (!img) return;
    g.drawImage(img, w, i * h, w, h, x0 + (on ? 5 : 4), y0 + (on ? 6 : 5), w, h);          // its shadow
    g.drawImage(img, 0, i * h, w, h, x0 - d, y0 - d, w, h);
    if (th.name === 'audio') {                                // the reels: turning while it is the one
      const a = on ? steps(t, 8) * 0.7 : 0.4;
      for (const [rx, ry] of O.reels) {
        const cx = x - d + rx, cy = y - d + ry, c = Math.cos(a) * 9, s = Math.sin(a) * 9;
        poly(g, BONE, strip([cx - c, cy - s], [cx + c, cy + s], 5));
      }
    } else if (th.name === 'video' && on) {                   // the screen: a bar rolling down it
      const [sx0, sy0, sx1, sy1] = O.screen, yy = sy0 + 4 + ((steps(t, 10) * 5) % (sy1 - sy0 - 16));
      poly(g, PINK_D, [[x - d + sx0 + 4, y - d + yy], [x - d + sx1 - 4, y - d + yy], [x - d + sx1 - 4, y - d + yy + 7], [x - d + sx0 + 4, y - d + yy + 7]]);
    }
  });
}

// the sheet of a page: its paper, its name on a black tab, the wedge that points at the thing it belongs to
function paper(g, y, seed) {
  const [x0, y0, x1, y1] = SHEET, q = slab(x0, y0, x1, y1, seed, 5), py = Math.max(y0 + 60, Math.min(y1 - 60, y));
  const wedge = [[x0 + 8, py - 26], [x0 + 8, py + 26], [x0 - 40, py]];
  poly(g, INK, moved(q, 12, 14));
  poly(g, INK, moved(wedge, 12, 14));
  poly(g, BONE, q);
  poly(g, BONE, wedge);
  for (const [tx, ty, deg] of [[x0 + 60, y0 + 2, -8], [x1 - 70, y0 + 4, 6]]) poly(g, PINK_D, turned(slab(-34, -11, 34, 11, seed + tx, 2), tx, ty, deg));   // the tape that holds it
}

// ---------------- the caps (the CONTROLS sheet) ----------------
// A cap's width in the picture's px. Every cap is cut paper on a hard black shadow: a key a dark key top on its lip,
// the mouse a bone body with the button lit, a face button a coloured disc, a stick a dark ring, a bumper / trigger
// a bone shoulder, the d-pad a cross, START a dark pill. Its lettering goes into `words` (sharp on the screen).
const CAP_TEXT = 10;
function capWidth(ctx, k, cap) {
  const H = GRID.cap;
  if (FACE[cap] || cap === 'LS' || cap === 'RS' || cap === 'DPAD') return H;
  if (cap === 'MOUSE' || cap === 'LMB' || cap === 'RMB') return 20;
  if (/^[LR][BT]$/.test(cap)) return 34;
  return Math.max(H, widthOf(ctx, cap, CAP_TEXT * k) / k + (cap === 'START' ? 14 : 11));
}

function drawCap(g, ctx, f, cap, x, y, w, seed, words) {
  const H = GRID.cap, k = f.k, top = y - H / 2, bot = y + H / 2, word = (str, ink, dy = 0, size = CAP_TEXT) => words.push([str, f.ox + (x + w / 2) * k, f.oy + (y + dy) * k, size * k, ink, 'center']);
  const shade = (pts) => poly(g, INK, moved(pts, 2, 3));
  if (FACE[cap] || cap === 'LS' || cap === 'RS') {
    const cx = x + H / 2;
    disc(g, INK, cx + 2, y + 3, H / 2);
    disc(g, INK, cx, y, H / 2);
    if (FACE[cap]) { disc(g, FACE[cap], cx, y, H / 2 - 3); word(cap, INK, 0.5); return; }
    disc(g, NIGHT_L, cx, y, H / 2 - 3);                     // a stick: its ring, its cap, its side's letter
    disc(g, NIGHT_LL, cx, y, H / 2 - 7);
    word(cap[0], BONE, 0.5);
    return;
  }
  if (cap === 'DPAD') {
    const a = 4, cx = x + H / 2;
    const cross = (d) => [[cx - a - d, top + 1 - d], [cx + a + d, top + 1 - d], [cx + a + d, y - a - d], [x + H - 1 + d, y - a - d], [x + H - 1 + d, y + a + d],
      [cx + a + d, y + a + d], [cx + a + d, bot - 1 + d], [cx - a - d, bot - 1 + d], [cx - a - d, y + a + d], [x + 1 - d, y + a + d], [x + 1 - d, y - a - d], [cx - a - d, y - a - d]];
    shade(cross(2));
    poly(g, INK, cross(2));
    poly(g, BONE_D, cross(0));
    return;
  }
  if (cap === 'MOUSE' || cap === 'LMB' || cap === 'RMB') {
    // a mouse from above: its body cut round at the corners, the button meant lit pink
    const body = (d) => [[x + 4 - d, top - d], [x + w - 4 + d, top - d], [x + w + d, top + 4 - d], [x + w + d, bot - 5 + d], [x + w - 5 + d, bot + d],
      [x + 5 - d, bot + d], [x - d, bot - 5 + d], [x - d, top + 4 - d]];
    shade(body(1.5));
    poly(g, INK, body(1.5));
    poly(g, BONE_D, body(0));
    const mid = top + 10;
    if (cap !== 'MOUSE') {
      const left = cap === 'LMB', a = left ? x : x + w / 2, b = left ? x + w / 2 : x + w;
      poly(g, PINK, [[Math.max(a, x + (left ? 3 : 0)), top + 1], [Math.min(b, x + w - (left ? 0 : 3)), top + 1], [b, mid], [a, mid]]);
    }
    poly(g, INK, [[x, mid], [x + w, mid], [x + w, mid + 1.5], [x, mid + 1.5]]);
    poly(g, INK, [[x + w / 2 - 0.75, top], [x + w / 2 + 0.75, top], [x + w / 2 + 0.75, mid], [x + w / 2 - 0.75, mid]]);
    return;
  }
  if (/^[LR][BT]$/.test(cap)) {
    // a shoulder: a bumper flat with its outer corner cut, a trigger taller and round on top
    const trig = cap[1] === 'T', out = cap[0] === 'L', c = trig ? 9 : 6, t0 = top + (trig ? 0 : 3);
    const sh = (d) => (out
      ? [[x + c - d, t0 - d], [x + w - (trig ? c : 0) + d, t0 - d], [x + w + d, t0 + (trig ? c : 0) - d], [x + w + d, bot + d], [x - d, bot + d], [x - d, t0 + c - d]]
      : [[x + (trig ? c : 0) - d, t0 - d], [x + w - c + d, t0 - d], [x + w + d, t0 + c - d], [x + w + d, bot + d], [x - d, bot + d], [x - d, t0 + (trig ? c : 0) - d]]);
    shade(sh(2));
    poly(g, INK, sh(2));
    poly(g, trig ? BONE : BONE_D, sh(0));
    word(cap, INK, trig ? 1.5 : 2.5);
    return;
  }
  // a key (or START, a pill): the black cut, the lip, the key top, its name in bone
  const pill = cap === 'START', r = pill ? 6 : 2;
  const cut = (d, x0 = x, y0 = top, x1 = x + w, y1 = bot) => [[x0 + r - d, y0 - d], [x1 - r + d, y0 - d], [x1 + d, y0 + r - d], [x1 + d, y1 - r + d],
    [x1 - r + d, y1 + d], [x0 + r - d, y1 + d], [x0 - d, y1 - r + d], [x0 - d, y0 + r - d]];
  shade(cut(2));
  poly(g, INK, cut(2));
  poly(g, NIGHT, cut(0));
  poly(g, pill ? NIGHT_L : NIGHT_LL, slab(x + 2, top + 1, x + w - 2, bot - 4, seed, 0.6));
  word(cap, BONE, -1.5, pill ? 8.5 : CAP_TEXT);
}

// the caps of a line, right-aligned to `right`: '/' between two is either one
function caps(g, ctx, f, str, right, y, seed, words) {
  const parts = str.split(' ').filter(Boolean), gap = 4, slash = 9;
  const ws = parts.map((p) => (p === '/' ? slash : capWidth(ctx, f.k, p)));
  let x = right - ws.reduce((s, w) => s + w, 0) - gap * (parts.length - 1);
  parts.forEach((p, i) => {
    if (p === '/') words.push(['/', f.ox + (x + slash / 2) * f.k, f.oy + y * f.k, 11 * f.k, INK, 'center']);
    else drawCap(g, ctx, f, p, x, y, ws[i], seed + i * 7, words);
    x += ws[i] + gap;
  });
}

// the CONTROLS sheet: its lines in two columns, by group, each its caps then what they do
function grid(g, ctx, f, lines, y, words) {
  const x0 = SHEET[0], k = f.k;
  GRID.cols.forEach((cx, col) => {
    let yy = y, group = null;
    lines.filter((it) => it.col === col).forEach((it, n) => {
      if (it.group !== group) {
        // the group's name: bone on a strip of black tape, a pink cut under it
        if (group !== null) yy += GRID.gap;
        group = it.group;
        const w = widthOf(ctx, group, 10 * k) / k + 18, gx = x0 + cx;
        poly(g, PINK_D, slab(gx + 4, yy - 7, gx + GRID.width, yy - 4, n + col * 31, 0.8));
        poly(g, INK, slab(gx, yy - 11, gx + w, yy + 10, n + col * 17, 1.5));
        words.push([group, f.ox + (gx + 9) * k, f.oy + yy * k, 10 * k, BONE, 'left']);
        yy += GRID.head;
      }
      const [keys, what] = it.info;
      caps(g, ctx, f, keys, x0 + cx + GRID.caps, yy, n * 13 + col * 101, words);
      const room = GRID.width - GRID.what, size = Math.min(11, (11 * room) / Math.max(1, widthOf(ctx, what, 11 * k) / k));
      words.push([what, f.ox + (x0 + cx + GRID.what) * k, f.oy + yy * k, size * k, INK, 'left']);
      yy += GRID.line;
    });
  });
}

// One page on the sheet. sel: the line the focus is on, or -1 (the focus is on the things). Returns its items'
// rects and pushes its lettering into `words` ([str, x, y, size, ink, align, deg], in canvas px).
function page(g, ctx, f, t, pg, sel, words) {
  const [x0, y0, x1, y1] = SHEET, k = f.k, X = (x) => f.ox + x * k, Y = (y) => f.oy + y * k, rects = [];
  const name = pg.title || '', nw = widthOf(ctx, name, 20 * k) / k + 44;
  poly(g, INK, turned(slab(-nw / 2, -20, nw / 2, 20, 7, 3), x0 + 60 + nw / 2, y0 + 46, -2));
  words.push([name, X(x0 + 60 + nw / 2), Y(y0 + 47), 20 * k, BONE, 'center', -2]);
  let y = y0 + 112;
  if (pg.note) { words.push([pg.note, X(x0 + 46), Y(y), 11.5 * k, INK, 'left']); y += 50; }
  const info = pg.items.filter((it) => it.info);
  if (info.length) grid(g, ctx, f, info, y0 + 104, words);
  const items = pg.items.map((it, i) => [it, i]).filter(([it]) => !it.info);
  const pitch = Math.min(64, items.length > 1 ? (y1 - 56 - y) / (items.length - 1) : 64);
  items.forEach(([it, i], j) => {
    const on = i === sel, ry = y + j * pitch, off = !selectable(it), ink = off ? NIGHT_LL : INK, lw = widthOf(ctx, it.label, 17 * k) / k;
    if (on) poly(g, INK, [[x0 + 16, ry - 11], [x0 + 34, ry], [x0 + 16, ry + 11]]);
    if (on && !it.slider && !it.toggle && !it.choice) poly(g, PINK, slab(x0 + 40, ry - 17, x0 + 58 + lw, ry + 16, i * 5 + (steps(t, 3) % 3) * 7, 2));
    words.push([it.label, X(x0 + 48), Y(ry), 17 * k, ink, 'left']);
    if (it.note) words.push([it.note, X(x0 + 48), Y(ry + 25), 9.5 * k, PINK_D, 'left']);
    let track = null;
    if (it.slider) {
      const v = Math.min(1, Math.max(0, it.value || 0)), a = x0 + TRACK[0], b = x0 + TRACK[1], xv = a + (b - a) * v;
      poly(g, INK, [[a, ry - 3], [b, ry - 3], [b, ry + 3], [a, ry + 3]]);
      if (v > 0.01) poly(g, on ? PINK : PINK_D, slab(a, ry - 10, xv, ry + 10, i * 3 + 1, 1.5));       // the tape, pulled along it
      poly(g, INK, slab(xv - 6, ry - 18, xv + 6, ry + 18, i * 3 + 2, 1.5));
      words.push([String(Math.round(v * 100)), X(b + 22), Y(ry), 15 * k, ink, 'left']);
      track = { x: X(a), y: Y(ry - 14), w: (b - a) * k, h: 28 * k };
    } else if (it.toggle) {
      const a = x0 + TRACK[0], set = !!it.value && !off;
      poly(g, off ? NIGHT_LL : INK, slab(a, ry - 15, a + 68, ry + 15, i * 3 + 1, 1.5));
      poly(g, set ? CYAN : BONE_D, slab(set ? a + 36 : a + 5, ry - 10, set ? a + 63 : a + 32, ry + 10, i * 3 + 2, 1));
      words.push([set ? 'ON' : 'OFF', X(a + 88), Y(ry), 15 * k, ink, 'left']);
    } else if (it.choice) {
      // its value in bone on a black tab, a wedge either side (left / right walk its values)
      const a = x0 + TRACK[0], str = it.show ?? String(it.value).toUpperCase(), w = Math.max(96, widthOf(ctx, str, 15 * k) / k + 28), b = a + 20 + w;
      poly(g, INK, slab(a + 20, ry - 15, b, ry + 15, i * 3 + 1, 1.5));
      poly(g, on ? PINK : NIGHT_LL, [[a + 12, ry - 8], [a + 12, ry + 8], [a, ry]]);
      poly(g, on ? PINK : NIGHT_LL, [[b + 8, ry - 8], [b + 8, ry + 8], [b + 20, ry]]);
      words.push([str, X(a + 20 + w / 2), Y(ry + 1), 15 * k, BONE, 'center']);
    }
    rects.push({ i, page: pg.id, x: X(x0 + 10), y: Y(ry - pitch / 2 + 2), w: (x1 - x0 - 20) * k, h: (pitch - 4) * k, track });
  });
  return rects;
}

export function drawOptions(ctx, W, H, t, menu) {
  const at = menu.stack.findIndex((e) => e.id === 'options'), inside = at < menu.depth, chosen = menu.stack[at].sel;
  const opts = menu.pageOf('options'), f = frame(W, H), k = f.k, g = open(NIGHT), words = [];
  put(g, 'title/options_bg');
  things(g, t, chosen, inside);
  // each thing's name on a strip of tape beside it
  O.things.forEach((th, i) => {
    const it = opts.items[i], on = i === chosen, side = th.at[0] > 260 ? -1 : 1, tx = th.at[0] + side * TAPE, ty = th.at[1] + 4;
    if (!it) return;
    const w = widthOf(ctx, it.label, 16 * k) / k + 30;
    tag(g, tx, ty, w, 30, -th.lean * 0.6, i * 9, on ? PINK : BONE_D, on);
    words.push([it.label, f.ox + (tx - (on ? 5 : 0)) * k, f.oy + (ty + 1 - (on ? 5 : 0)) * k, 16 * k, INK, 'center', -th.lean * 0.6]);
  });
  // the sheet: the page the focus is on, or the one the chosen thing holds (the focus on the things: no line chosen)
  const id = inside ? menu.top.id : opts.items[chosen]?.page;
  let rects = [];
  if (id) {
    paper(g, O.things[chosen].at[1], at * 5 + chosen);
    rects = page(g, ctx, f, t, inside ? menu.page : menu.pageOf(id), inside ? menu.sel : -1, words);
  }
  const [w, h] = O.cell;
  opts.items.forEach((it, i) => {
    const [x, y] = O.things[i].at;
    rects.push({ i, page: 'options', thing: true, x: f.ox + (x - w / 2 + 6) * k, y: f.oy + (y - h / 2 + 8) * k, w: (w - 12) * k, h: (h - 16) * k });
  });
  show(ctx, W, H);
  for (const [str, x, y, size, ink, align, deg] of words) letter(ctx, str, x, y, size, ink, deg || 0, align);
  return rects;
}
