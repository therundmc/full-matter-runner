// Draws the pause's menu (ui/Menu.js) over the level, in the poster's cut paper (ui/title/Paper.js): its first page
// on a panel (a black sheet on a pink one, PAUSED on a bone tab, the chosen line pink between two chevrons); its
// OPTIONS and the pages under them are the title's own screen (ui/title/Options.js). Returns where each item landed
// on screen, for the mouse: [{ i, x, y, w, h, track? }] in canvas px (track: a slider's bar, for dragging).
import { text, widthOf } from './Text.js';
import { selectable } from './Menu.js';
import { BONE, PINK, INK, frame, panel, letter, steps } from './title/Paper.js';
import { optionsUp, drawOptions } from './title/Options.js';

const GREY = '#6c6478';
const BOX = [236, 130, 916, 560];          // the panel, in the sheet's px (384 x 216 title px, 3 each)

export function drawMenu(ctx, W, H, t, menu) {
  if (optionsUp(menu)) return drawOptions(ctx, W, H, t, menu);
  const s = H / 720, page = menu.page, f = frame(W, H), [x0, y0, x1, y1] = BOX, name = page.title || 'PAUSED', nameSize = 24 * f.k;
  ctx.fillStyle = 'rgba(8,2,16,0.7)';
  ctx.fillRect(0, 0, W, H);
  panel(ctx, W, H, x0, y0, x1, y1, [(x0 + x1) / 2, widthOf(ctx, name, nameSize) / f.k + 64], menu.depth * 7);
  letter(ctx, name, W / 2, f.oy + (y0 + 5) * f.k, nameSize, INK, -1.5);
  ctx.textBaseline = 'middle';
  const size = 17 * s, step = 36 * s, top = f.oy + (y0 + 84) * f.k, gap = size * (0.9 + (steps(t, 4) % 2) * 0.22);
  return page.items.map((it, i) => {
    const on = i === menu.sel, y = top + i * step, w = widthOf(ctx, it.label, size);
    text(ctx, it.label, W / 2, y, size, !selectable(it) ? GREY : on ? PINK : BONE);
    if (on) {                                 // the two chevrons framing the chosen line, in and out in steps
      text(ctx, '>', W / 2 - w / 2 - gap, y, size, PINK);
      text(ctx, '<', W / 2 + w / 2 + gap, y, size, PINK);
    }
    return { i, x: W / 2 - w / 2 - 24 * s, y: y - size * 0.95, w: w + 48 * s, h: size * 1.9 };
  });
}
