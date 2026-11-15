// Draws the menu's current page (ui/Menu.js) in the look of the title: pixel font, neon, the selected line pulsing
// between two chevrons. Returns where each item landed on screen, for the mouse:
//   [{ i, x, y, w, h, track? }] in canvas px (track: a slider's bar, for dragging)
// where: 'title' (over the title scene: the first page in one line where "click to start" used to be, the others in
// the street under the bar's sign) | 'pause' (on a dark veil over the level).
import { PALETTE } from '../Config.js';
import { text, glitchText, neon, thousands } from './Text.js';
import { selectable } from './Menu.js';
import { drawPrompts } from './Glyphs.js';

const GREY = '#6c6478';

const fontOf = (size) => `${Math.round(size)}px joystix, monospace`;
function measure(ctx, str, size) {
  ctx.font = fontOf(size);
  return ctx.measureText(str).width;
}
// the largest size up to `size` at which str fits in `width`
const fit = (ctx, str, size, width) => Math.min(size, (width * 100) / Math.max(1, measure(ctx, str, 100)));
const clock = (sec) => `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, '0')}`;

// the colour and alpha of an item's label: selected (neon, pulsing), plain, or greyed out
function look(it, on, t) {
  if (!selectable(it) || it.locked) return { color: GREY, alpha: on ? 0.95 : 0.8 };
  return on ? { color: neon(t, 3), alpha: 0.82 + 0.18 * Math.sin(t * 7) } : { color: PALETTE.white, alpha: 0.85 };
}

// the two chevrons framing the selected line (x0 .. x1: the line's ends)
function marks(ctx, x0, x1, y, size, t) {
  const gap = size * 0.9 + Math.sin(t * 6) * size * 0.12, col = neon(t, 3);
  text(ctx, '>', x0 - gap, y, size, col);
  text(ctx, '<', x1 + gap, y, size, col);
}

// a padlock in rectangles, its left edge at x, centred on y
function padlock(ctx, x, y, size, color) {
  const u = Math.max(1, size / 9), top = y - 4.5 * u;
  const shape = (dx, dy, col) => {
    ctx.fillStyle = col;
    ctx.fillRect(x + dx, top + dy + 3 * u, 8 * u, 6 * u);   // body
    ctx.fillRect(x + dx + u, top + dy + u, u, 2 * u);       // shackle
    ctx.fillRect(x + dx + 6 * u, top + dy + u, u, 2 * u);
    ctx.fillRect(x + dx + u, top + dy, 6 * u, u);
  };
  shape(u, u, PALETTE.ink);
  shape(0, 0, color);
  ctx.fillStyle = PALETTE.ink;
  ctx.fillRect(x + 3.5 * u, top + 5 * u, u, 2 * u);         // keyhole
}

// one line of a column, centred on (cx, y); returns its rectangle
function drawItem(ctx, it, on, cx, y, size, s, t) {
  const { color, alpha } = look(it, on, t), h = size * 1.9;
  if (it.slider || it.toggle) {
    // label on the left of the axis, the widget on its right (sliders like the old pause screen's)
    const tx = cx - 80 * s, tw = 240 * s, th = 8 * s, labelW = measure(ctx, it.label, size);
    text(ctx, it.label, tx - 20 * s, y, size, color, { align: 'right', alpha });
    if (it.slider) {
      const v = Math.min(1, Math.max(0, it.value || 0)), col = on ? PALETTE.yellow : PALETTE.white;
      ctx.fillStyle = PALETTE.ink;
      ctx.fillRect(tx, y - th / 2, tw, th);
      ctx.fillStyle = col;
      ctx.fillRect(tx, y - th / 2, tw * v, th);
      ctx.fillRect(tx + tw * v - 4 * s, y - 11 * s, 8 * s, 22 * s);
      text(ctx, `${Math.round(v * 100)}%`, tx + tw + 20 * s, y, size, col, { align: 'left', alpha });
    } else {
      text(ctx, it.value ? 'ON' : 'OFF', tx, y, size, !selectable(it) ? GREY : it.value ? PALETTE.cyan : PALETTE.pink, { align: 'left', alpha });
    }
    const x0 = tx - 20 * s - labelW, x1 = tx + tw + 90 * s;
    if (on) marks(ctx, x0, x1, y, size, t);
    return { x: x0 - 10 * s, y: y - h / 2, w: x1 - x0 + 20 * s, h, track: it.slider ? { x: tx, y: y - th / 2, w: tw, h: th } : null };
  }
  if (it.level) {
    // number, padlock when locked, name; the best result on the right
    const half = Math.min(300 * s, cx * 0.84), x0 = cx - half, x1 = cx + half, small = size * 0.72;
    text(ctx, String(it.n).padStart(2, '0'), x0, y, small, it.locked ? GREY : PALETTE.yellow, { align: 'left', alpha });
    let nx = x0 + 44 * s;
    if (it.locked) { padlock(ctx, nx, y, size, GREY); nx += size * 1.3; }
    text(ctx, it.label, nx, y, size, color, { align: 'left', alpha });
    const b = it.best;
    const right = it.locked ? 'LOCKED' : b ? `${thousands(b.total)}  ${b.grade}  ${clock(b.time || 0)}` : '---';
    text(ctx, right, x1, y, small, it.locked || !b ? GREY : PALETTE.cyan, { align: 'right', alpha: 0.9 });
    if (on) marks(ctx, x0, x1, y, size, t);
    return { x: x0 - 10 * s, y: y - h / 2, w: x1 - x0 + 20 * s, h };
  }
  const w = measure(ctx, it.label, size);
  text(ctx, it.label, cx, y, size, color, { alpha });
  if (on) marks(ctx, cx - w / 2, cx + w / 2, y, size, t);
  return { x: cx - w / 2 - 24 * s, y: y - h / 2, w: w + 48 * s, h };
}

// a page as a column from `top` down: the read-only lines in a two-column grid first, then the items
function drawColumn(ctx, page, sel, cx, top, bottom, step, size, s, t) {
  const rects = [], info = page.items.filter((it) => it.info);
  let y = top;
  if (info.length) {
    const cw = 450 * s, rows = Math.max(...[0, 1].map((c) => info.filter((it) => it.col === c).length)), line = 18 * s;
    [0, 1].forEach((c) => info.filter((it) => it.col === c).forEach(({ info: [key, what] }, i) => {
      const x = cx - cw + c * cw + 20 * s, ly = y + i * line;
      text(ctx, key, x, ly, 12 * s, PALETTE.yellow, { align: 'left' });
      text(ctx, what, x + 138 * s, ly, 12 * s, PALETTE.white, { align: 'left', alpha: 0.85 });
    }));
    y += rows * line + step * 0.6;
  }
  const items = page.items.map((it, i) => [it, i]).filter(([it]) => !it.info);
  const k = Math.min(step, items.length > 1 ? (bottom - y) / (items.length - 1) : step);
  items.forEach(([it, i], j) => {
    const r = drawItem(ctx, it, i === sel, cx, y + j * k, size, s, t);
    rects.push({ i, ...r });
  });
  return rects;
}

// the first page of the title: one line of items, shrunk to fit narrow screens
function drawRow(ctx, page, sel, W, y, size, s, t) {
  const gap = 56 * s;
  let widths = page.items.map((it) => measure(ctx, it.label, size));
  let total = widths.reduce((a, b) => a + b, 0) + gap * (widths.length - 1);
  if (total > W * 0.9) {
    const k = (W * 0.9) / total;
    size *= k;
    widths = widths.map((w) => w * k);
    total *= k;
  }
  let x = W / 2 - total / 2;
  return page.items.map((it, i) => {
    const w = widths[i], cx = x + w / 2, on = i === sel, { color, alpha } = look(it, on, t);
    text(ctx, it.label, cx, y, size * (on ? 1.06 : 1), color, { alpha });
    if (on) marks(ctx, x, x + w, y, size * 0.8, t);
    const r = { i, x: x - gap * 0.4, y: y - size, w: w + gap * 0.8, h: size * 2 };
    x += w + gap;
    return r;
  });
}

// one line of prompts at the bottom, with the caps of the device in use
function footer(ctx, page, depth, where, W, y, s, device) {
  const adjust = page.items.some((it) => it.slider || it.toggle);
  const back = depth > 0 ? 'BACK' : where === 'pause' ? 'RESUME' : '';
  const list = [['choose', adjust ? 'CHOOSE / ADJUST' : 'CHOOSE'], ['confirm', 'SELECT'], ...(back ? [['back', back]] : [])];
  drawPrompts(ctx, list, W / 2, y, 17 * s, device, { alpha: 0.75, gap: 2.2 });
}

// device: 'kbm' | 'pad', whose caps the prompts show
export function drawMenu(ctx, W, H, t, menu, where, device) {
  const s = H / 720, page = menu.page, sel = menu.sel;
  ctx.textBaseline = 'middle';
  if (where === 'pause') {
    ctx.fillStyle = 'rgba(8,2,16,0.7)';
    ctx.fillRect(0, 0, W, H);
    const title = page.title || 'PAUSED';
    glitchText(ctx, title, W / 2, H * 0.27, fit(ctx, title, (menu.depth ? 48 : 70) * s, W * 0.9), t);
    let top = H * 0.42;
    if (page.note) { text(ctx, page.note, W / 2, top - 20 * s, 14 * s, PALETTE.white, { alpha: 0.85 }); top += 26 * s; }
    const rects = drawColumn(ctx, page, sel, W / 2, top, H * 0.88, 36 * s, 18 * s, s, t);
    footer(ctx, page, menu.depth, where, W, H * 0.94, s, device);
    return rects;
  }
  if (page.row) {
    const rects = drawRow(ctx, page, sel, W, H * 0.293, 20 * s, s, t);
    footer(ctx, page, menu.depth, where, W, H * 0.905, s, device);
    return rects;
  }
  // the other title pages stand in the street, on a shade that leaves the sign above in the clear
  const band = ctx.createLinearGradient(0, H * 0.54, 0, H * 0.64);
  band.addColorStop(0, 'rgba(6,2,10,0)');
  band.addColorStop(1, 'rgba(6,2,10,0.78)');
  ctx.fillStyle = band;
  ctx.fillRect(0, H * 0.54, W, H * 0.1);
  ctx.fillStyle = 'rgba(6,2,10,0.78)';
  ctx.fillRect(0, H * 0.64, W, H * 0.36);
  glitchText(ctx, page.title || '', W / 2, H * 0.6, fit(ctx, page.title || '', 28 * s, W * 0.9), t, { color: PALETTE.white });
  let top = H * 0.665;
  if (page.note) { text(ctx, page.note, W / 2, top, 13 * s, PALETTE.white, { alpha: 0.85 }); top += 32 * s; }
  const rects = drawColumn(ctx, page, sel, W / 2, top, H * 0.87, 30 * s, 16 * s, s, t);
  footer(ctx, page, menu.depth, where, W, H * 0.905, s, device);
  return rects;
}
