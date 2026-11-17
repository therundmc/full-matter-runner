// Title proposal B, THE HIT LIST (?title=b; and the LEVELS page of ?title=ab): the menu is his board, in the comic's
// cut paper. The still (title/board_<n>, tools/comic/title_art.py board_art, one per number of targets dead) has the
// photo of his flat, the four cards in the order he takes them, the red string as far as he has got, the matchbook
// once CUEBALL is dead: a dead man is crossed out, the next one is in his ink. Over it, cut live: the fire in the
// photo, the marks round the next card, and the menu as notes pinned to the board (the first page a row of them; on
// the LEVELS page each level under what it is: the tutorial under his flat, level 1 under CUEBALL). The other pages
// stand on a black band (Paper.js). A proposal: nothing here is the game's title yet (Proposals.js).
import { hash, poly, disc } from '../cine/Ink.js';
import { drawPrompts } from '../Glyphs.js';
import { drawTitlePage } from '../MenuArt.js';
import { thousands } from '../Text.js';
import { FW, INK, NIGHT_LL, BONE, BONE_D, PINK_D, FIRE, lay, frame, show, steps, turned, tag, letter, band } from './Paper.js';

// in the still's px, as in tools/comic/title_art.py (TARGETS, CARD, PHOTO)
const CARD = [172, 236];
const CARDS = [[420, 212, -3], [622, 236, 2.5], [822, 206, -2], [1022, 226, 3]];     // each card's middle and lean
const PHOTO = [166, 300, -6];
// the level that kills each target, in the cards' order (null: not made yet)
const KILLS = ['level1', null, null, null];
// where a level's note is pinned on the LEVELS page: [x, y, lean] (a level without a place goes in the foot's row)
const LEVEL_AT = { tutorial: [166, 470, -3], level1: [398, 384, 2] };
const BACK_AT = [1014, 548, 3];
const ROW_Y = 528;

// how many of the targets are dead: the leading ones whose level is done
export function deadCount(progress) {
  let n = 0;
  while (n < KILLS.length && KILLS[n] && progress.done.includes(KILLS[n])) n++;
  return n;
}

function live(g, t, dead) {
  // the fire in the photo
  const n = steps(t, 9), h = (i) => 0.6 + 0.7 * hash(i * 2.7 + n * 5.9), [px_, py, deg] = PHOTO;
  poly(g, FIRE, turned([[-28, -28], [-20, -28 - 28 * h(0)], [-10, -38], [2, -28 - 42 * h(1)], [14, -40], [22, -28 - 26 * h(2)], [32, -28]], px_, py, deg));
  // the next one: four corner marks about his card, in and out
  if (dead < CARDS.length) {
    const [cx, cy, lean] = CARDS[dead], d = 12 + (steps(t, 2.5) % 2) * 5, w = CARD[0] / 2 + d, hh = CARD[1] / 2 + d;
    for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      poly(g, FIRE, turned([[sx * w, sy * hh], [sx * (w - 26), sy * hh], [sx * (w - 26), sy * (hh - 6)], [sx * (w - 6), sy * (hh - 6)],
        [sx * (w - 6), sy * (hh - 26)], [sx * w, sy * (hh - 26)]], cx, cy, lean));
    }
  }
}

// a note pinned at (x, y): its paper on the sheet; returns its place on screen
function note(g, f, x, y, w, h, deg, seed, on, paper = BONE_D) {
  tag(g, x, y, w, h, deg, seed, on ? BONE : paper, on);
  const d = on ? 4 : 0, [p] = turned([[0, -h / 2 + 9]], x - d, y - d, deg);
  disc(g, INK, p[0] + 2, p[1] + 3, 5);
  disc(g, on ? FIRE : PINK_D, p[0], p[1], 5);
  return { x: f.ox + (x - d) * f.k, y: f.oy + (y - d) * f.k, rect: { x: f.ox + (x - w / 2) * f.k, y: f.oy + (y - h / 2) * f.k, w: w * f.k, h: h * f.k } };
}
const clock = (sec) => `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, '0')}`;
const boil = (t) => (steps(t, 3) % 3) * 17;                    // the chosen note is cut again, three times a second

// view: { menu, progress, device }. Returns where the menu's items are, for the mouse.
export function drawHitList(ctx, W, H, t, view) {
  const menu = view.menu, page = menu.page, dead = deadCount(view.progress), g = lay(`title/board_${dead}`), f = frame(W, H), k = f.k;
  live(g, t, dead);
  if (!page.row && page.id !== 'levels') {
    band(g, W, H);
    show(ctx, W, H);
    return drawTitlePage(ctx, W, H, t, menu, view.device);
  }
  const words = [], rects = [];
  if (page.row) {
    const n = page.items.length, w = Math.min(210, (FW - 120 - (n - 1) * 26) / n), x0 = (FW - (n * w + (n - 1) * 26)) / 2 + w / 2;
    page.items.forEach((it, i) => {
      const on = i === menu.sel, deg = (hash(i * 3.3 + 1) - 0.5) * 7;
      const p = note(g, f, x0 + i * (w + 26), ROW_Y + (hash(i * 1.7) - 0.5) * 14, w, 66, deg, i * 7 + (on ? boil(t) : 0), on);
      words.push([it.label, p.x, p.y + 5 * k, 19 * k, INK, deg]);
      rects.push({ i, ...p.rect });
    });
  } else {
    let spare = 0;
    page.items.forEach((it, i) => {
      const on = i === menu.sel;
      if (!it.level) {                                       // BACK
        const [x, y, deg] = BACK_AT, p = note(g, f, x, y, 132, 54, deg, 91 + (on ? boil(t) : 0), on);
        words.push([it.label, p.x, p.y + 5 * k, 17 * k, INK, deg]);
        rects.push({ i, ...p.rect });
        return;
      }
      const [x, y, deg] = LEVEL_AT[it.level] || [330 + (spare++) * 236, 548, (hash(i) - 0.5) * 5];
      const p = note(g, f, x, y, 216, 70, deg, i * 11 + 30 + (on ? boil(t) : 0), on, it.locked ? NIGHT_LL : BONE_D), b = it.best;
      words.push([`${String(it.n).padStart(2, '0')} ${it.label}`, p.x, p.y - 4 * k, 15 * k, INK, deg]);
      words.push([it.locked ? 'LOCKED' : b ? `${thousands(b.total)}  ${b.grade}  ${clock(b.time || 0)}` : view.progress.done.includes(it.level) ? 'DONE' : 'NOT DONE', p.x, p.y + 17 * k, 10 * k, it.locked ? INK : PINK_D, deg]);
      rects.push({ i, ...p.rect });
    });
  }
  show(ctx, W, H);
  for (const [str, x, y, size, col, deg] of words) letter(ctx, str, x, y, size, col, deg);
  const list = [['choose', 'CHOOSE'], ['confirm', 'SELECT'], ...(menu.depth > 0 ? [['back', 'BACK']] : [])];
  drawPrompts(ctx, list, W / 2, f.oy + 627 * k, 13 * k, view.device, { alpha: 0.6, gap: 2.2 });
  return rects;
}
