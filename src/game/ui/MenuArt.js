// Draws a page of the menu (ui/Menu.js) on its panel, in the poster's cut paper (ui/title/Paper.js): a black sheet
// on a pink one, the page's name on a bone tab, its items in the comic's inks, the chosen one pink between two
// chevrons. Every page but the title's first (ui/title/Poster.js) and its LEVELS (ui/title/HitList.js): OPTIONS and
// its pages over the poster, and the pause over the level, on a dark veil. Returns where each item landed on screen,
// for the mouse: [{ i, x, y, w, h, track? }] in canvas px (track: a slider's bar, for dragging).
import { text } from './Text.js';
import { selectable } from './Menu.js';
import { BONE, BONE_D, PINK, PINK_D, CYAN, FIRE_L, INK, frame, panel, letter, widthOf, steps } from './title/Paper.js';

const GREY = '#6c6478';
// the panel in the sheet's px (384 x 216 title px, 3 each): wide for a page of read-only lines (the controls); over
// the title it leaves the logo clear, in the pause it sits in the middle
const BOX = { title: [236, 634], pause: [130, 560], wide: [70, 1082], narrow: [236, 916] };

// the colour of an item's label: chosen, plain, or greyed out
function look(it, on) {
  if (!selectable(it) || it.locked) return GREY;
  return on ? PINK : BONE;
}

// the two chevrons framing the chosen line (x0 .. x1: the line's ends), in and out in steps
function marks(ctx, x0, x1, y, size, t) {
  const gap = size * (0.9 + (steps(t, 4) % 2) * 0.22);
  text(ctx, '>', x0 - gap, y, size, PINK);
  text(ctx, '<', x1 + gap, y, size, PINK);
}

// one line of a column, centred on (cx, y); returns its rectangle
function drawItem(ctx, it, on, cx, y, size, s, t) {
  const color = look(it, on), h = size * 1.9;
  if (it.slider || it.toggle) {
    // label on the left of the axis, the widget on its right
    const tx = cx - 80 * s, tw = 240 * s, th = 8 * s, labelW = widthOf(ctx, it.label, size);
    text(ctx, it.label, tx - 20 * s, y, size, color, { align: 'right' });
    if (it.slider) {
      const v = Math.min(1, Math.max(0, it.value || 0)), col = on ? PINK : BONE;
      ctx.fillStyle = PINK_D;
      ctx.fillRect(Math.round(tx), Math.round(y - th / 2), Math.round(tw), Math.round(th));
      ctx.fillStyle = col;
      ctx.fillRect(Math.round(tx), Math.round(y - th / 2), Math.round(tw * v), Math.round(th));
      ctx.fillRect(Math.round(tx + tw * v - 4 * s), Math.round(y - 11 * s), Math.round(8 * s), Math.round(22 * s));
      text(ctx, `${Math.round(v * 100)}%`, tx + tw + 20 * s, y, size, col, { align: 'left' });
    } else {
      text(ctx, it.value ? 'ON' : 'OFF', tx, y, size, !selectable(it) ? GREY : it.value ? CYAN : PINK_D, { align: 'left' });
    }
    const x0 = tx - 20 * s - labelW, x1 = tx + tw + 90 * s;
    if (on) marks(ctx, x0, x1, y, size, t);
    return { x: x0 - 10 * s, y: y - h / 2, w: x1 - x0 + 20 * s, h, track: it.slider ? { x: tx, y: y - th / 2, w: tw, h: th } : null };
  }
  const w = widthOf(ctx, it.label, size);
  text(ctx, it.label, cx, y, size, color);
  if (on) marks(ctx, cx - w / 2, cx + w / 2, y, size, t);
  return { x: cx - w / 2 - 24 * s, y: y - h / 2, w: w + 48 * s, h };
}

// a page as a column from `top` down: the read-only lines in a two-column grid first, then the items
function drawColumn(ctx, page, sel, cx, top, bottom, step, size, s, t) {
  const rects = [], info = page.items.filter((it) => it.info);
  let y = top;
  if (info.length) {
    const cw = 450 * s, rows = Math.max(...[0, 1].map((c) => info.filter((it) => it.col === c).length)), line = 19 * s;
    [0, 1].forEach((c) => info.filter((it) => it.col === c).forEach(({ info: [key, what] }, i) => {
      const x = cx - cw + c * cw + 20 * s, ly = y + i * line;
      text(ctx, key, x, ly, 12 * s, FIRE_L, { align: 'left' });
      text(ctx, what, x + 138 * s, ly, 12 * s, BONE, { align: 'left' });
    }));
    y += rows * line + step * 0.5;
  }
  const items = page.items.map((it, i) => [it, i]).filter(([it]) => !it.info);
  const k = Math.min(step, items.length > 1 ? (bottom - y) / (items.length - 1) : step);
  items.forEach(([it, i], j) => {
    const r = drawItem(ctx, it, i === sel, cx, y + j * k, size, s, t);
    rects.push({ i, ...r });
  });
  return rects;
}

// where: 'title' (over the poster) | 'pause' (over the level, on a dark veil)
export function drawMenu(ctx, W, H, t, menu, where) {
  const s = H / 720, page = menu.page, f = frame(W, H), Y = (y) => f.oy + y * f.k;
  if (where === 'pause') {
    ctx.fillStyle = 'rgba(8,2,16,0.7)';
    ctx.fillRect(0, 0, W, H);
  }
  const name = page.title || 'PAUSED', nameSize = 24 * f.k, wide = page.items.some((it) => it.info);
  const [y0, y1] = BOX[where === 'pause' ? 'pause' : 'title'], [x0, x1] = wide ? BOX.wide : BOX.narrow;
  panel(ctx, W, H, x0, y0, x1, y1, [(x0 + x1) / 2, widthOf(ctx, name, nameSize) / f.k + 64], menu.depth * 7);
  letter(ctx, name, W / 2, Y(y0 + 5), nameSize, INK, -1.5);
  ctx.textBaseline = 'middle';
  let top = Y(y0 + 84);
  if (page.note) { text(ctx, page.note, W / 2, top - 22 * s, 13 * s, BONE_D); top += 22 * s; }
  return drawColumn(ctx, page, menu.sel, W / 2, top, Y(y1 - 44), 36 * s, 17 * s, s, t);
}
