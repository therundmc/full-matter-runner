// Draws the pause's menu (ui/Menu.js) over the level, in the poster's cut paper (ui/title/Paper.js). Its first page:
// the game frozen behind, dimmed flat (and drained of its colour: the lens's `paused` grade, data/post.js); a black
// sheet cut on a diagonal down the left, a pink one showing along its edge, PAUSED on a strip of bone tape; the items
// down it, big; and the level's card pinned on the right: its number and name, whose night it is in his ink with his
// sign, the run's time and kills (ui/Pause.js pauseCard). The chosen item is on a pink tab that comes out of the
// screen's edge to a point (the title's pink slab, cut again three times a second): it slides in when the choice
// moves, and a confirm presses it down on its shadow, bone for a blink, before the action (ui/Pause.js Pick).
// Its OPTIONS and the pages under them are the title's own screen (ui/title/Options.js).
// view: { pick, card, bare: no lens over the picture (the colour is drained here instead) }.
// Returns where each item landed on screen, for the mouse: [{ i, x, y, w, h, track? }] in canvas px.
import { widthOf, clock } from './Text.js';
import { selectable } from './Menu.js';
import { Pick } from './Pause.js';
import { hash, poly, disc } from './cine/Ink.js';
import { BONE, BONE_D, PINK, PINK_D, INK, NIGHT, NIGHT_LL, FH, open, show, frame, letter, steps, turned, moved, slab, tag, tongue } from './title/Paper.js';
import { optionsUp, drawOptions } from './title/Options.js';

const DIM = 'rgba(14,6,26,0.64)';            // the night laid flat over the frozen picture
const DRAIN = 'rgba(128,128,128,0.8)';       // ... and how much of its colour goes, without the lens
// in the sheet's px, from the screen's left edge: the black sheet's edge at its top and its foot, the items' left
// edge, their first line and their pitch, their lettering
const SHEET = { top: 506, foot: 378, edge: 13, come: 150 };
const ITEMS = { x: 84, y: 250, pitch: 66, size: 27, tab: 23, point: 24, pad: 30, lift: [5, 6], shift: 12 };
const NAME = { x: 84, y: 112, size: 32, lean: -3 };
// the card: its middle from the screen's right edge, its size, its lean, how far up it comes from
const CARD = { right: 262, y: 186, w: 404, h: 224, lean: 2.5, drop: 46 };
const REST = new Pick();

// the targets' signs, seen from above as in the game (tools/comic/STYLE.md): [ink (null: the target's), points]
const SIGNS = {
  // the widest shoulders, a bone dome, the shades across its front
  cueball: [[INK, [[-37, -6], [-29, -15], [29, -15], [37, -6], [37, 9], [27, 15], [-27, 15], [-37, 9]]],
    [BONE, [[-9, -13], [9, -13], [14, -4], [14, 6], [8, 12], [-8, 12], [-14, 6], [-14, -4]]],
    [null, [[-19, -17], [19, -17], [21, -8], [-21, -8]]]],
  // small shoulders, the saw-tooth crest from the nape to past the brow
  jitters: [[INK, [[-25, -3], [-19, -11], [19, -11], [25, -3], [25, 8], [17, 13], [-17, 13], [-25, 8]]],
    [null, [[0, -27], [6, -18], [2, -16], [8, -8], [3, -6], [8, 2], [3, 4], [0, 13], [-3, 4], [-8, 2], [-3, -6], [-8, -8], [-2, -16], [-6, -18]]]],
};

// the picture behind: its colour drained (the lens does it where there is one), the night laid flat over it
function dim(ctx, W, H, bare) {
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
  if (bare) {
    ctx.globalCompositeOperation = 'saturation';
    ctx.fillStyle = DRAIN;
    ctx.fillRect(0, 0, W, H);
    ctx.globalCompositeOperation = 'source-over';
  }
  ctx.fillStyle = DIM;
  ctx.fillRect(0, 0, W, H);
  ctx.restore();
}

// the card pinned at (cx, cy), leaning deg; its lettering goes into `words`
function drawCard(g, ctx, f, t, card, cx, cy, deg, words) {
  const k = f.k, at = (x, y) => turned([[x, y]], cx, cy, deg)[0], cut = (ink, pts) => poly(g, ink, turned(pts, cx, cy, deg));
  const word = (str, x, y, size, ink, align = 'left') => { const [px, py] = at(x, y); words.push([str, f.ox + px * k, f.oy + py * k, size * k, ink, align, deg]); };
  const wide = (str, size) => widthOf(ctx, str, size * k) / k;
  const hw = CARD.w / 2, hh = CARD.h / 2, x0 = -hw + 24;
  tag(g, cx, cy, CARD.w, CARD.h, deg, 41, BONE);
  const pin = at(0, -hh + 12);
  disc(g, INK, pin[0] + 2, pin[1] + 3, 6);
  disc(g, PINK, pin[0], pin[1], 6);
  // its number, its name, a black rule under them
  const nw = wide(card.number, 46), room = CARD.w - 48 - nw - 18, size = Math.min(18, (18 * room) / Math.max(1, wide(card.name, 18)));
  word(card.number, x0, -hh + 56, 46, INK);
  word('LEVEL', x0 + nw + 18, -hh + 40, 10, PINK_D);
  word(card.name, x0 + nw + 18, -hh + 62, size, INK);
  cut(INK, slab(x0, -hh + 86, hw - 24, -hh + 90, 3, 1));
  // whose night it is: his name in his ink on a strip of black tape, his sign on a slab of the night beside it
  const tg = card.target;
  if (tg) {
    const lw = wide(tg.label, 10), tw = lw + wide(tg.name, 21) + 46;
    cut(INK, slab(x0 - 4, 8, x0 - 4 + tw, 48, 17, 2));
    word(tg.label, x0 + 10, 29, 10, BONE_D);
    word(tg.name, x0 + 22 + lw, 29, 21, tg.ink);
    const sx = hw - 72, sy = 30, spin = (pts) => turned(moved(pts, sx, sy), cx, cy, deg);
    cut(INK, moved(slab(sx - 46, sy - 32, sx + 46, sy + 32, 23, 3), 4, 5));
    cut(NIGHT, slab(sx - 46, sy - 32, sx + 46, sy + 32, 23, 3));
    if (tg.sign === 'fire') { const n = steps(t, 9); tongue(g, sx - 9, sy + 28, 30, 50 * (0.75 + 0.5 * hash(n * 5.9)), 5, n, (pts) => turned(pts, cx, cy, deg)); tongue(g, sx + 14, sy + 28, 20, 30 * (0.75 + 0.5 * hash(n * 3.1)), 4, n + 1, (pts) => turned(pts, cx, cy, deg)); }
    else for (const [ink, pts] of SIGNS[tg.sign] || []) poly(g, ink || tg.ink, spin(pts));
  }
  // the run so far
  const stat = (label, value, x) => { const w = wide(label, 10); word(label, x, hh - 30, 10, PINK_D); word(value, x + w + 10, hh - 31, 19, INK); };
  stat('TIME', clock(card.time), x0);
  stat('KILLS', card.guards ? `${card.kills}/${card.guards}` : String(card.kills), x0 + 170);
}

export function drawMenu(ctx, W, H, t, menu, view = {}) {
  if (optionsUp(menu)) return drawOptions(ctx, W, H, t, menu);
  const f = frame(W, H), k = f.k, pick = view.pick || REST, page = menu.page, words = [], rects = [];
  const L = -f.ox / k, R = L + W / k, T = -f.oy / k;                  // the part of the sheet the screen shows
  const e = pick.entered, dx = -Math.round((1 - e) * SHEET.come);     // the screen coming in
  dim(ctx, W, H, view.bare);
  const g = open(null);
  // the black sheet down the left, the pink one under it showing along its cut
  const edge = (y) => L + SHEET.top + (SHEET.foot - SHEET.top) * (y / FH) + dx;
  const sheet = (d) => [[L - 20, -20], [edge(-20) + d, -20], [edge(FH + 20) + d, FH + 20], [L - 20, FH + 20]];
  poly(g, PINK_D, sheet(SHEET.edge));
  poly(g, INK, sheet(0));
  // its name on a strip of bone tape, pinned
  const name = page.title || 'PAUSED', nw = widthOf(ctx, name, NAME.size * k) / k + 52, nx = L + NAME.x + nw / 2 - 16 + dx, ny = Math.max(T + 70, NAME.y);
  poly(g, PINK_D, turned(moved(slab(-nw / 2, -29, nw / 2, 29, 5, 3), 6, 7), nx, ny, NAME.lean));
  poly(g, BONE, turned(slab(-nw / 2, -29, nw / 2, 29, 5, 3), nx, ny, NAME.lean));
  disc(g, INK, nx - nw / 2 + 16, ny - 21, 5);
  disc(g, PINK, nx - nw / 2 + 14, ny - 23, 5);
  words.push([name, f.ox + nx * k, f.oy + (ny + 1) * k, NAME.size * k, INK, 'center', NAME.lean]);
  // the items; the chosen one on its tab
  const I = ITEMS, x = L + I.x + dx, press = pick.pressed, slide = pick.slide;
  page.items.forEach((it, i) => {
    const on = i === menu.sel, y = I.y + i * I.pitch, lw = widthOf(ctx, it.label, I.size * k) / k;
    let lx = x, ly = y, ink = !selectable(it) ? NIGHT_LL : BONE;
    if (on) {
      const x0 = L - 20, full = x + I.shift + lw + I.pad + I.point, x1 = x0 + (full - x0) * slide, j = (n) => (hash(i * 7 + (steps(t, 3) % 3) * 11 + n) - 0.5) * 5;
      const tab = [[x0, y - I.tab + j(0)], [x1 - I.point, y - I.tab + j(1)], [x1 + j(2), y + j(3) * 0.4], [x1 - I.point, y + I.tab + j(4)], [x0, y + I.tab + j(5)]];
      const px = Math.round(I.lift[0] * press), py = Math.round(I.lift[1] * press);
      poly(g, PINK_D, moved(tab, ...I.lift));
      poly(g, press > 0 && press < 0.7 ? BONE : PINK, moved(tab, px, py));
      lx += I.shift + px; ly += py;
      ink = slide < 1 ? BONE : INK;
    }
    words.push([it.label, f.ox + lx * k, f.oy + (ly + 1) * k, I.size * k, ink, 'left', 0]);
    rects.push({ i, x: 0, y: f.oy + (y - I.pitch / 2) * k, w: f.ox + (edge(y) - dx) * k, h: I.pitch * k });
  });
  if (view.card) drawCard(g, ctx, f, t, view.card, R - CARD.right, CARD.y - Math.round((1 - e) * CARD.drop), CARD.lean + (1 - e) * 5, words);
  show(ctx, W, H);
  for (const [str, wx, wy, size, ink, align, deg] of words) letter(ctx, str, wx, wy, size, ink, deg, align);
  return rects;
}
