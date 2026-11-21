// THE HIT LIST: the title's LEVELS page and the screen between two levels, his board in the comic's cut paper
// (tools/comic/STYLE.md, The title). Stills (tools/comic/title_art.py): the board on its wall, and what is pinned to
// it for the number of targets dead: the photo of his flat, the four cards in the order he takes them (a dead man
// gone dark, the next one in his ink), the matchbook once CUEBALL is dead. Cut live over them: the lamp's bar of
// light, failing now and then, dust in it; the fire in the photo; the red string from pin to pin as far as he has
// got, trembling when the mouse moves; the X on the dead, drawn by a marker in two strokes the first time the board
// shows a man dead (Beats.js CROSS); the NEXT tag blinking; a glint on a pin; the matchbook's flamingo buzzing; and
// the levels as notes pinned in a column under what they are (the tutorial under his flat, 01 under CUEBALL, 02 and
// 03 under JITTERS, then LUCKY's and THE BOSS's: data/campaign.js, one note a level, never one for a stage), the
// chosen one lifted, its pin shaken as it is taken; a level not made yet is a greyed note taped SOON.
import { BOARD as B } from '../../data/titleart.js';
import { hash, poly, disc, px } from '../cine/Ink.js';
import { thousands, clock } from '../Text.js';
import { CAMPAIGN_LEVELS, TARGETS } from '../../data/campaign.js';
import { CROSS, crossK, crossBeats } from './Beats.js';
import { INK, NIGHT_L, NIGHT_LL, BONE, BONE_D, PINK_D, FIRE, BLOOD, open, put, frame, show, steps, turned, strip, tongue, glint, tag, letter } from './Paper.js';

// the stage that kills each target, in the cards' order: the last of his last level (JITTERS dies at the end of 03,
// so 02 done leaves him standing, still NEXT; a stage not made yet is never done)
const KILLS = TARGETS.map((who) => CAMPAIGN_LEVELS.filter((l) => l.target === who).pop().stages.slice(-1)[0]);
// The notes. The board is read as the story goes: his flat at the top left, then the four cards, each a step lower
// than the one before, the string along their tops. A man's levels hang in a bunch under his card, the first tucked
// against its foot, each askew its own way and a little off the one above, as pinned in a hurry (FAN: [dx, lean] by
// column and row). A level that is made is a NOTE; one not made yet a smaller SCRAP, taped. Three go under a card
// (ROWS: an eighth level fits under THE BOSS), the tutorial's under the photo of his flat.
export const NOTE = [200, 66], SCRAP = [176, 54];
const PITCH = 66, PHOTO_H = 214;
const FAN = [
  [[-4, 3]],
  [[-3, 2.5], [-9, -2], [0, 1.5]],
  [[5, -3], [6, 2], [2, -1.5]],
  [[3, 3], [-7, -1.5], [2, 2]],
  [[0, -2.5], [6, 2.5], [-3, -1.5]],
];
// the notes a card can hold: its column of FAN (each card's the same)
export const ROWS = FAN[1].length;
// where the note of column col (0 under the photo, 1..4 under the cards), row (0 the highest) is pinned: [x, y, lean]
export function noteAt(col, row) {
  const [cx, cy, lean] = col ? B.cards[col - 1] : B.photo, half = (col ? B.card[1] : PHOTO_H) / 2, [dx, deg] = FAN[col][row];
  // under the foot of what it hangs from, which leans
  return [Math.round(cx - Math.sin((lean * Math.PI) / 180) * half + dx), Math.round(cy + half + 6 + NOTE[1] / 2 + row * PITCH), deg];
}
// a level's note: its paper's size
export const noteSize = (it) => (it.soon ? SCRAP : NOTE);
// BACK, a scrap pinned in the board's bottom left corner, out of the way (between two levels: GO ON)
export const BACK = [112, 44];
export const BACK_AT = [96, 562, -5];

// how many of the targets are dead: the leading ones whose level is done
export function deadCount(progress) {
  let n = 0;
  while (n < KILLS.length && KILLS[n] && progress.done.includes(KILLS[n])) n++;
  return n;
}

// what the board remembers from one picture to the next: when it came up, the mouse, the note chosen
const life = { since: 0, last: -1, mx: 0, my: 0, shake: 0, sel: '', selT: -9 };

// a note's title on one line or two, cut between words (a line holds 12 letters beside the number)
export function lines(label, max = 12) {
  const out = [''];
  for (const w of label.split(' ')) {
    if (out.length < 2 && out[out.length - 1] && `${out[out.length - 1]} ${w}`.length > max) out.push(w);
    else out[out.length - 1] += (out[out.length - 1] ? ' ' : '') + w;
  }
  return out;
}
const lerp = (a, b, k) => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k];
const boil = (t) => (steps(t, 3) % 3) * 17;                    // the chosen note is cut again, three times a second

// the lamp over the board: its bar of light (it fails a moment now and then), dust turning in it
function lamp(g, t) {
  const n = steps(t, 14);
  if (hash(n * 1.1) < 0.03 || (t % 9.5 > 9.1 && n % 2)) return;
  poly(g, NIGHT_L, B.bar);
  const [a, , , d] = B.bar, h = d[1] - a[1];
  for (let i = 0; i < 12; i++) {
    const y = (hash(i + 1) * h + t * 5 * (0.5 + hash(i + 2))) % h;
    px(g, NIGHT_LL, a[0] + (d[0] - a[0]) * (y / h) + 24 + hash(i) * 250 + Math.sin(t * 0.6 + i) * 8, a[1] + y, 3, 3);
  }
}

// the red string through the pins, shaken (0..1) by the mouse
function string(g, pins, t, shake) {
  pins.slice(1).forEach((b, i) => {
    const a = pins[i], d = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, amp = Math.round(Math.sin(t * 38 + i * 2.1) * 7 * shake);
    const mid = [(a[0] + b[0]) / 2 - ((b[1] - a[1]) / d) * amp, (a[1] + b[1]) / 2 + ((b[0] - a[0]) / d) * amp + 1];
    poly(g, BLOOD, strip([a[0], a[1] + 1], mid, 5));
    poly(g, BLOOD, strip(mid, [b[0], b[1] + 1], 5));
  });
  for (const p of pins) disc(g, BLOOD, p[0], p[1], 4);
}

// a note pinned at (x, y): its paper on the sheet (lit: the chosen one's bright paper), its pin, pinX from its middle,
// shaken (wob 0..1) when it has just been chosen; returns its place on screen
function note(g, f, t, x, y, w, h, deg, seed, on, wob, paper = BONE_D, lit = on, pinX = 0, part = null) {
  const lean = deg + (on ? Math.sin(t * 34) * 2.5 * wob : 0);
  tag(g, x, y, w, h, lean, seed, lit ? BONE : paper, on, part);
  if (part === 'shadow') return null;
  const d = on ? 5 : 0, [p] = turned([[pinX, -h / 2 + (pinX ? 5 : 9)]], x - d, y - d, lean), dx = on ? Math.round(Math.sin(t * 46) * 4 * wob) : 0;
  disc(g, INK, p[0] + 2 + dx, p[1] + 3, 5);
  disc(g, on ? FIRE : PINK_D, p[0] + dx, p[1], 5);
  return { x: f.ox + (x - d) * f.k, y: f.oy + (y - d) * f.k, deg: lean, rect: { x: f.ox + (x - w / 2) * f.k, y: f.oy + (y - h / 2) * f.k, w: w * f.k, h: h * f.k } };
}

// view: { menu (on its LEVELS page; null between two levels), notes (between two levels: the levels' notes, Menu.js
// levelNotes, pinned as on the LEVELS page but none to choose), progress, mouse, crossed: how many of the dead the
// board has already shown crossed out, sound(name, vol, opts), onCrossed(n): the X is drawn on the n-th }.
// Returns where the menu's items are, in canvas px, for the mouse.
export function drawHitList(ctx, W, H, t, view) {
  const dead = deadCount(view.progress), seen = Math.min(view.crossed ?? dead, dead), f = frame(W, H), k = f.k, g = open(INK);
  // its clocks: since it came up; the mouse's shake dying off
  if (life.last < 0 || t < life.last || t - life.last > 0.4) { life.since = t; life.shake = 0; life.mx = view.mouse?.x ?? 0; life.my = view.mouse?.y ?? 0; }
  const dt = life.last < 0 ? 0 : Math.max(0, t - life.last), c = t - life.since, c0 = c - dt, m = view.mouse;
  if (m) {
    life.shake = Math.min(1, life.shake * Math.exp(-dt * 3.5) + Math.hypot(m.x - life.mx, m.y - life.my) / (500 * k));
    life.mx = m.x; life.my = m.y;
  }
  life.last = t;

  put(g, 'title/board_bg');
  lamp(g, t);
  put(g, `title/board_${dead}`);
  // the fire in the photo
  const [fx, fy, fdeg] = B.photo, n = steps(t, 9), wob = (i) => 0.7 + 0.6 * hash(i * 2.7 + n * 5.9), tf = (pts) => turned(pts, fx, fy, fdeg);
  tongue(g, -8, -30, 22, 40 * wob(0), 5, n, tf);
  tongue(g, 10, -30, 16, 26 * wob(1), 4, n + 1, tf);
  // the matchbook's flamingo, a neon on its cover: it buzzes
  if (dead >= 1 && (t + 1.5) % 4.3 < 0.4 && steps(t, 15) % 2 === 0) for (const q of B.flamingo) poly(g, PINK_D, turned(q, ...B.matchbook));
  string(g, [B.photoPin, ...B.pins.slice(0, dead + 1)], t, life.shake);
  // the dead, crossed out: the ones the board shows dead for the first time, by the marker
  let marking = false;
  for (let i = 0; i < dead; i++) {
    B.crosses[i].forEach(([a, b, w0, w1], s) => {
      const q = i < seen ? 1 : crossK(s, c);
      if (q > 0) poly(g, BLOOD, strip(a, lerp(a, b, q), w0, w0 + (w1 - w0) * q));
    });
    if (i >= seen) marking = true;
  }
  if (marking) {
    for (const b of crossBeats(c0, c)) view.sound?.(b.name, b.vol, b.opts);
    if (c >= CROSS.done) view.onCrossed?.(dead);
  }
  const words = [], rects = [];
  // the next one: marks about his card, in and out, and his tag, blinking (once the marker is down)
  if (dead < B.cards.length && !marking) {
    const [cx, cy, lean] = B.cards[dead], d = 12 + (steps(t, 2.5) % 2) * 5, w = B.card[0] / 2 + d, hh = B.card[1] / 2 + d;
    for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      poly(g, FIRE, turned([[sx * w, sy * hh], [sx * (w - 26), sy * hh], [sx * (w - 26), sy * (hh - 6)], [sx * (w - 6), sy * (hh - 6)],
        [sx * (w - 6), sy * (hh - 26)], [sx * w, sy * (hh - 26)]], cx, cy, lean));
    }
    const [tx, ty, tdeg] = B.tags[dead], lit = steps(t, 1.6) % 2 === 0;
    tag(g, tx, ty, 72, 26, tdeg, 9, lit ? FIRE : BONE);
    words.push(['NEXT', f.ox + tx * k, f.oy + (ty + 1) * k, 15 * k, INK, tdeg]);
  }
  // a glint on a pin, each in its turn
  const pins = [B.photoPin, ...B.pins], gk = (t % 2.6) / 0.5;
  if (gk < 1) { const p = pins[Math.floor(t / 2.6) % pins.length]; glint(g, p[0] - 2, p[1] - 2, gk, 9); }

  // the notes: the levels, each under what it is, and BACK; between two levels the same, and one note to go on
  const items = view.menu ? view.menu.page.items : [...(view.notes || []), { label: 'GO ON' }], sel = view.menu ? view.menu.sel : items.length - 1;
  const key = `${view.menu ? view.menu.top.id : 'between'}:${sel}`;
  if (key !== life.sel) { life.sel = key; life.selT = t; }
  const shaken = Math.max(0, 1 - (t - life.selT) / 0.35);
  // words on a note, (dx, dy) from its middle in the sheet's px, leaning with it
  const write = (p, str, dx, dy, size, col) => { const [q] = turned([[dx * k, dy * k]], p.x, p.y, p.deg); words.push([str, q[0], q[1], size * k, col, p.deg]); };
  const pin = (i, part = null) => {
    const it = items[i], on = i === sel, w = on ? shaken : 0;
    if (!it.tag) {
      const [x, y, deg] = BACK_AT, p = note(g, f, t, x, y, ...BACK, deg, 91 + (on ? boil(t) : 0), on, w, BONE_D, on, 0, part);
      if (!p) return;
      write(p, it.label, 0, 4, 14, INK);
      rects.push({ i, ...p.rect });
      return;
    }
    // a level: its number big at its corner under the pin, its title beside it on a line or two, and under it its
    // best result or where it stands; shut or not made yet it is in the board's violet, and one not made yet is a
    // smaller scrap, a strip of tape across its foot, SOON, even chosen
    const [x, y, deg] = noteAt(it.col, it.row), [nw, nh] = noteSize(it), dim = it.locked || it.soon, lit = on && !it.soon, big = !it.soon;
    const p = note(g, f, t, x, y, nw, nh, deg, i * 11 + 30 + (on ? boil(t) : 0), on, w, dim ? NIGHT_LL : BONE_D, lit, -nw / 2 + (big ? 30 : 25), part);
    if (!p) return;
    const ink = dim && !lit ? BONE_D : INK, rows = lines(it.label), two = rows.length > 1, b = it.best, d = on ? -5 : 0;
    write(p, it.tag, -nw / 2 + (big ? 30 : 25), big ? 6 : 4, big ? 26 : 20, ink);
    rows.forEach((str, r) => write(p, str, big ? 28 : 24, (big ? (two ? -18 : -9) : two ? -14 : -6) + r * (big ? 16 : 14), big ? 14 : 12, ink));
    if (it.soon) {
      poly(g, BONE_D, turned(strip([-16, 0], [70, 0], 17, 15), x + d, y + d, p.deg).map(([qx, qy]) => [qx, qy + nh / 2 - 2]));
      write(p, 'SOON', 27, nh / 2 - 2, 10, INK);
    } else {
      const under = it.locked ? 'LOCKED' : b ? `${thousands(b.total)} ${b.grade} ${clock(b.time || 0)}` : it.done ? 'DONE' : 'NOT DONE';
      write(p, under, 28, two ? 20 : 14, 10, dim && !lit ? BONE_D : PINK_D);
    }
    rects.push({ i, ...p.rect });
  };
  // the chosen one is lifted over its bunch: its shadow under the others, its paper over them
  if (items[sel]) pin(sel, 'shadow');
  items.forEach((_, i) => { if (i !== sel) pin(i); });
  if (items[sel]) pin(sel, 'paper');
  show(ctx, W, H);
  for (const [str, x, y, size, col, deg] of words) letter(ctx, str, x, y, size, col, deg);
  return rects;
}
