// OPTIONS: what he carries, laid out. His table seen from above, the satchel emptied on it under a lamp, in the
// comic's cut paper (tools/comic/STYLE.md, The title; stills by tools/comic/title_art.py): a thing a section, down
// the left: the walkman is AUDIO, the portable set VIDEO, the knuckles CONTROLS, the notebook GAME, his cap the way
// BACK. The chosen thing is lifted onto a slab of an ink that is not its own (its reels turn, its screen rolls), and
// its settings are cut on a sheet of paper beside it, pointing at it: a slider is a strip of tape pulled along a
// black line, a toggle a switch, the chosen line has a black wedge before it. On the things, the sheet shows what the
// chosen one holds, pale; ENTER takes it up. The same screen for the title's OPTIONS and the pause's. The menu's
// logic is ui/Menu.js, untouched: this draws its `options` page and the pages under it, and returns where the items
// are, in canvas px, for the mouse: [{ i, x, y, w, h, track? }].
import { OPTIONS as O } from '../../data/titleart.js';
import { spriteOpt } from '../../../engine/Assets.js';
import { poly } from '../cine/Ink.js';
import Menu, { selectable } from '../Menu.js';
import { INK, NIGHT, NIGHT_LL, BONE, BONE_D, PINK, PINK_D, CYAN, open, put, frame, show, steps, slab, moved, turned, strip, tag, letter, widthOf } from './Paper.js';

const SHEET = [520, 36, 1118, 612];          // the sheet of settings, in the picture's px
const TRACK = [270, 490];                    // a slider's line on it, from the sheet's left edge
const TAPE = 152;                            // a thing's name is on a strip of tape this far beside it

// is the menu on the options, or on a page under them
export const optionsUp = (menu) => menu.stack.some((e) => e.id === 'options');

// the five things on the table, the chosen one lifted on its slab; `held`: its sheet is taken up (it stops boiling)
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
function paper(g, y, live, seed) {
  const [x0, y0, x1, y1] = SHEET, q = slab(x0, y0, x1, y1, seed, 5), py = Math.max(y0 + 60, Math.min(y1 - 60, y));
  const wedge = [[x0 + 8, py - 26], [x0 + 8, py + 26], [x0 - 40, py]];
  poly(g, INK, moved(q, live ? 12 : 7, live ? 14 : 9));
  poly(g, INK, moved(wedge, live ? 12 : 7, live ? 14 : 9));
  poly(g, live ? BONE : BONE_D, q);
  poly(g, live ? BONE : BONE_D, wedge);
  for (const [tx, ty, deg] of [[x0 + 60, y0 + 2, -8], [x1 - 70, y0 + 4, 6]]) poly(g, PINK_D, turned(slab(-34, -11, 34, 11, seed + tx, 2), tx, ty, deg));   // the tape that holds it
}

// One page on the sheet. sel: the chosen item, or -1 (a page only shown). Returns its items' rects and pushes its
// lettering into `words` ([str, x, y, size, ink, align], in canvas px).
function page(g, ctx, f, t, pg, sel, live, words) {
  const [x0, y0, x1, y1] = SHEET, k = f.k, X = (x) => f.ox + x * k, Y = (y) => f.oy + y * k, rects = [];
  const plain = live ? NIGHT_LL : INK, name = pg.title || '';
  const nw = widthOf(ctx, name, 20 * k) / k + 44;
  poly(g, INK, turned(slab(-nw / 2, -20, nw / 2, 20, 7, 3), x0 + 60 + nw / 2, y0 + 46, -2));
  words.push([name, X(x0 + 60 + nw / 2), Y(y0 + 47), 20 * k, BONE, 'center', -2]);
  let y = y0 + 112;
  if (pg.note) { words.push([pg.note, X(x0 + 46), Y(y), 11.5 * k, INK, 'left']); y += 50; }
  const info = pg.items.filter((it) => it.info).sort((a, b) => a.col - b.col);
  info.forEach(({ info: [key, what] }, i) => {
    words.push([key, X(x0 + 46), Y(y + i * 26), 11 * k, PINK_D, 'left']);
    words.push([what, X(x0 + 214), Y(y + i * 26), 11 * k, INK, 'left']);
  });
  if (info.length) y += info.length * 26 + 20;
  const items = pg.items.map((it, i) => [it, i]).filter(([it]) => !it.info);
  const pitch = Math.min(64, items.length > 1 ? (y1 - 56 - y) / (items.length - 1) : 64);
  items.forEach(([it, i], j) => {
    const on = i === sel, ry = y + j * pitch, ink = !selectable(it) ? (live ? BONE_D : NIGHT_LL) : on ? INK : plain, lw = widthOf(ctx, it.label, 17 * k) / k;
    if (on) poly(g, INK, [[x0 + 16, ry - 11], [x0 + 34, ry], [x0 + 16, ry + 11]]);
    if (on && !it.slider && !it.toggle) poly(g, PINK, slab(x0 + 40, ry - 17, x0 + 58 + lw, ry + 16, i * 5 + (steps(t, 3) % 3) * 7, 2));
    words.push([it.label, X(x0 + 48), Y(ry), 17 * k, ink, 'left']);
    let track = null;
    if (it.slider) {
      const v = Math.min(1, Math.max(0, it.value || 0)), a = x0 + TRACK[0], b = x0 + TRACK[1], xv = a + (b - a) * v;
      poly(g, INK, [[a, ry - 3], [b, ry - 3], [b, ry + 3], [a, ry + 3]]);
      if (v > 0.01) poly(g, on ? PINK : PINK_D, slab(a, ry - 10, xv, ry + 10, i * 3 + 1, 1.5));       // the tape, pulled along it
      poly(g, INK, slab(xv - 6, ry - 18, xv + 6, ry + 18, i * 3 + 2, 1.5));
      words.push([String(Math.round(v * 100)), X(b + 22), Y(ry), 15 * k, ink, 'left']);
      track = { x: X(a), y: Y(ry - 14), w: (b - a) * k, h: 28 * k };
    } else if (it.toggle) {
      const a = x0 + TRACK[0], set = !!it.value;
      poly(g, INK, slab(a, ry - 15, a + 68, ry + 15, i * 3 + 1, 1.5));
      poly(g, !selectable(it) ? BONE_D : set ? CYAN : BONE_D, slab(set ? a + 36 : a + 5, ry - 10, set ? a + 63 : a + 32, ry + 10, i * 3 + 2, 1));
      words.push([set ? 'ON' : 'OFF', X(a + 88), Y(ry), 15 * k, ink, 'left']);
    }
    rects.push({ i, x: X(x0 + 10), y: Y(ry - pitch / 2 + 2), w: (x1 - x0 - 20) * k, h: (pitch - 4) * k, track });
  });
  return rects;
}

export function drawOptions(ctx, W, H, t, menu) {
  const at = menu.stack.findIndex((e) => e.id === 'options'), root = at === menu.stack.length - 1, chosen = menu.stack[at].sel;
  const opts = root ? menu.page : new Menu('options', menu.context).page, f = frame(W, H), k = f.k, g = open(NIGHT), words = [];
  put(g, 'title/options_bg');
  things(g, t, chosen, !root);
  // each thing's name on a strip of tape beside it
  O.things.forEach((th, i) => {
    const it = opts.items[i], on = i === chosen, side = th.at[0] > 260 ? -1 : 1, tx = th.at[0] + side * TAPE, ty = th.at[1] + 4;
    if (!it) return;
    const w = widthOf(ctx, it.label, 16 * k) / k + 30;
    tag(g, tx, ty, w, 30, -th.lean * 0.6, i * 9, on ? PINK : BONE_D, on);
    words.push([it.label, f.ox + (tx - (on ? 5 : 0)) * k, f.oy + (ty + 1 - (on ? 5 : 0)) * k, 16 * k, INK, 'center', -th.lean * 0.6]);
  });
  // the sheet: the page he is on, or what the chosen thing holds, pale
  let rects = [];
  const under = root ? opts.items[chosen]?.page : null;
  if (!root || under) {
    paper(g, O.things[chosen].at[1], !root, menu.depth * 5 + chosen);
    const shown = page(g, ctx, f, t, root ? new Menu(under, menu.context).page : menu.page, root ? -1 : menu.sel, !root, words);
    if (!root) rects = shown;
  }
  if (root) {
    const [w, h] = O.cell;
    rects = opts.items.map((it, i) => ({ i, x: f.ox + (O.things[i].at[0] - w / 2 + 6) * k, y: f.oy + (O.things[i].at[1] - h / 2 + 8) * k, w: (w - 12) * k, h: (h - 16) * k }));
  }
  show(ctx, W, H);
  for (const [str, x, y, size, ink, align, deg] of words) letter(ctx, str, x, y, size, ink, deg || 0, align);
  return rects;
}
