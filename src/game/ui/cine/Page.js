// A comic page of the opening (ui/Cinematic.js) or of a level's ending (ui/cine/Ending.js): panels that
// drop in one after the other, each with its caption (a yellow box, top left), what is said in it (a balloon typed
// as it is said) and what is heard (a sound word), then the whole page goes. Pure description in, picture out:
//   page   { end (s the page is gone at), panels: [{ r: { x, y, w, h } in the title's logical px, at (s it drops in),
//            paint(g, w, h, t) (t: s since it dropped in), caption: [lines], say: { at, text: [lines], x, y, tail: [x, y] }
//            (panel px; at: s after the panel), sfx: [{ text, at, dur, x, y, size, col, rot }],
//            close: { at, text: [lines] } (a caption typed in the panel's bottom right corner, at s after the panel) }] }
import { LW, LH } from '../title/Draw.js';
import { text } from '../Text.js';
import { drawPanel, caption, balloon } from './Panels.js';
import { clamp, px } from './Ink.js';

const SIZE = 5;     // the lettering, logical px
const LINE = 7;     // between two lines of it
export const TYPE = 24; // letters a second when something is said (or a closing caption typed)
const INK = '#140c10';

// how far a panel has dropped in at rt (0..1), the page going out with it
export const panelIn = (page, p, rt) => clamp((rt - p.at) / 0.3, 0, 1) * clamp((page.end - rt) / 0.35, 0, 1);

export function drawPage(ctx, W, H, rt, page) {
  const sc = Math.max(W / LW, H / LH), ox = (W - LW * sc) / 2, oy = (H - LH * sc) / 2, out = clamp((page.end - rt) / 0.35, 0, 1);
  const words = [];  // what to letter once the panels are down: [str, x, y, size, col, opts]
  ctx.save();
  ctx.setTransform(sc, 0, 0, sc, ox, oy);
  ctx.imageSmoothingEnabled = false;
  px(ctx, '#0c0812', 0, 0, LW, LH);
  for (const p of page.panels) drawPanel(ctx, p.r, panelIn(page, p, rt), (g, w, h) => p.paint(g, w, h, rt - p.at));
  ctx.font = `${Math.round(SIZE * sc)}px joystix, monospace`;
  const width = (s) => ctx.measureText(s).width / sc;
  for (const p of page.panels) {
    if (panelIn(page, p, rt) < 1 && rt < page.end - 0.35) continue;
    if (p.caption) {
      const bw = Math.max(...p.caption.map(width)) + 6;
      caption(ctx, p.r.x + 3, p.r.y + 3, bw, p.caption.length * LINE + 3);
      p.caption.forEach((l, i) => words.push([l, p.r.x + 3 + bw / 2, p.r.y + 6.5 + i * LINE, SIZE, INK, {}]));
    }
    const s = p.say;
    if (s && rt >= p.at + s.at) {
      const bw = Math.max(...s.text.map(width)) + 16, bh = s.text.length * LINE + 10;
      balloon(ctx, p.r.x + s.x, p.r.y + s.y, bw, bh, p.r.x + s.tail[0], p.r.y + s.tail[1]);
      let n = Math.floor((rt - p.at - s.at) * TYPE);
      s.text.forEach((l, i) => { words.push([l.slice(0, Math.max(0, n)), p.r.x + s.x + bw / 2, p.r.y + s.y + 6.5 + i * LINE, SIZE, INK, {}]); n -= l.length; });
    }
    const c = p.close;
    if (c && rt >= p.at + c.at) {
      const bw = Math.max(...c.text.map(width)) + 6, bh = c.text.length * LINE + 3, x = p.r.x + p.r.w - 3 - bw, y = p.r.y + p.r.h - 3 - bh;
      caption(ctx, x, y, bw, bh);
      let n = Math.floor((rt - p.at - c.at) * TYPE);
      c.text.forEach((l, i) => { words.push([l.slice(0, Math.max(0, n)), x + bw / 2, y + 3.5 + i * LINE, SIZE, INK, {}]); n -= l.length; });
    }
    for (const f of p.sfx || []) {
      const u = (rt - p.at - f.at) / f.dur;
      if (u < 0 || u > 1) continue;
      const pop = 1 + 0.25 * Math.max(0, 1 - u * 6);
      words.push([f.text, p.r.x + f.x, p.r.y + f.y - u * 3, f.size * pop, f.col, { rot: f.rot || 0, alpha: clamp((1 - u) * 4, 0, 1) }]);
    }
  }
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  for (const [str, x, y, size, col, o] of words) {
    const plain = col === INK;
    text(ctx, str, ox + x * sc, oy + y * sc, size * sc, col, { ...(plain ? { outline: false, shadow: null } : {}), ...o, alpha: (o.alpha ?? 1) * out });
  }
  ctx.restore();
}
