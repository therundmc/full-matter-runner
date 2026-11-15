// The opening's comic panels: a black frame with a white gutter and a hard shadow round each, the caption boxes and
// the balloons. Inside, the opening's stills (drawn by tools/generate_comic.py, finer than the title) with what still
// moves in them, and the leap's pages, pixel art in the title's logical px: flat colours in a few shades each, a dark
// outline round what matters, never a gradient or a dither (the user wants plain pixel art). Each painter gets the
// context clipped to its panel and translated to its top-left corner, its size, and t (s) for what still moves in it.
import { spriteOpt } from '../../../engine/Assets.js';
import { clamp, hash, px, tone, poly, disc } from './Ink.js';

const INK = '#07050c';

// r: { x, y, w, h }; k 0..1: how far it has come in (it drops into place from a little above, and settles)
export function drawPanel(g, r, k, paint) {
  if (k <= 0) return;
  const e = 1 - (1 - k) ** 3, y = Math.round(r.y - (1 - e) * 18 + Math.sin(clamp(k, 0, 1) * Math.PI) * 2);
  g.save();
  g.globalAlpha = clamp(k * 4, 0, 1);
  px(g, INK, r.x + 4, y + 4, r.w, r.h);                     // the hard shadow
  px(g, '#efe8d8', r.x - 2, y - 2, r.w + 4, r.h + 4);       // the gutter
  px(g, INK, r.x - 1, y - 1, r.w + 2, r.h + 2);             // the ink line
  g.beginPath(); g.rect(r.x, y, r.w, r.h); g.clip();
  g.translate(r.x, y);
  paint(g, r.w, r.h);
  g.restore();
}

// a caption box (the words are written over it by the caller, ui/Cinematic.js)
export function caption(g, x, y, w, h) {
  px(g, INK, x + 2, y + 2, w, h);
  px(g, INK, x - 1, y - 1, w + 2, h + 2);
  px(g, '#f2d04a', x, y, w, h);
  px(g, '#d8b030', x, y + h - 1, w, 1);
}

// a speech balloon whose tail points at (tx, ty): a wedge, wide where it leaves the balloon, inked
export function balloon(g, x, y, w, h, tx, ty) {
  const cx = x + w / 2, cy = y + h / 2, d = Math.hypot(tx - cx, ty - cy) || 1, nx = -(ty - cy) / d, ny = (tx - cx) / d;
  const wedge = (b) => [[cx + nx * b, cy + ny * b], [cx - nx * b, cy - ny * b], [tx, ty]];
  for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) poly(g, INK, wedge(5).map(([px_, py]) => [px_ + dx, py + dy]));
  disc(g, INK, cx, cy, w / 2 + 1, h / 2 + 1);
  poly(g, '#f6f2ea', wedge(4));
  disc(g, '#f6f2ea', cx, cy, w / 2, h / 2);
}

// ---------------------------------------------------------------- the opening's stills
// The opening's panels are drawn like a noir thriller album by tools/generate_comic.py (sprites comic/*, SC panel px
// per title px): here they are put in their frame and given what moves (a lamp failing, smoke, blood spreading, the
// match's flame), drawn in the stills' own px. still / fine / smoke serve the other comic pages too (ui/cine/Leap.js,
// ui/cine/Ending.js).
const SC = 3;
const FLAME = [536, 160];   // the match's head in comic/match (generate_comic.py FLAME)

export function still(g, name, w, h) {
  const img = spriteOpt(`comic/${name}`);
  if (img) g.drawImage(img, 0, 0, w, h);
  else px(g, '#0c0812', 0, 0, w, h);
}
export function fine(g, draw) {
  g.save();
  g.scale(1 / SC, 1 / SC);
  draw();
  g.restore();
}
// smoke going up from (x, y) in a thin wavering thread (stills' px)
export function smoke(g, x, y, t, n = 14, col = '#8a8494') {
  for (let i = 0; i < n; i++) {
    const k = (i + (t * 3) % 1) / n;
    px(g, col, x + Math.sin(t * 2 + i * 0.7) * 4 * k + i * 0.8, y - k * 70, 3, 4);
  }
}

// ---------------------------------------------------------------- his eye in the dark
// shut, then open all at once on the noise (open 0..1)
export function paintEye(g, w, h, open) {
  still(g, open > 0.5 ? 'eye' : 'eye_shut', w, h);
}

// ================================================================ page 1: what they came for
// 1. From the dark of his flat: his front door forced, the three of them in it against the landing's yellow light,
// their shadows long across his floor; the torch looking for something. The landing's lamp fails now and then.
export function paintDoor(g, w, h, t) {
  still(g, 'door', w, h);
  if ((t * 2.3) % 1 < 0.05) fine(g, () => tone(g, '#1a0c04', 664, 8, 164, 218, 0.55));
}

// 2. Down at the floor: the heavy one prising up a board with a crowbar; dust in the light.
export function paintPry(g, w, h, t) {
  still(g, 'pry', w, h);
  fine(g, () => {
    for (let i = 0; i < 10; i++) px(g, '#f0c890', 40 + ((hash(i) * 140 + t * 9 * (0.5 + hash(i + 3))) % 160), 150 + hash(i + 2) * 70 - t * 4, 2, 2);
  });
}

// 3. The tin box open in the hole, his six years in it, in the torch's circle.
export function paintBox(g, w, h) {
  still(g, 'box', w, h);
}

// 4. The young one thumbing through the notes, grinning.
export function paintCount(g, w, h) {
  still(g, 'count', w, h);
}

// ================================================================ page 2: no loose ends
// 1. Over the shooter's shoulder: the building's super in his doorway, hit, a hand to his chest; the gun still smokes
// and the blood comes out between his fingers (k 0..1).
export function paintSuper(g, w, h, t, k = 1) {
  still(g, 'super', w, h);
  const blood = spriteOpt('comic/super_blood');
  fine(g, () => {
    if (blood && k > 0) {
      const r = 8 + 110 * clamp(k, 0, 1);
      g.save();
      g.beginPath();
      g.ellipse(398, 196, r * 0.5, r, 0, 0, Math.PI * 2);
      g.clip();
      g.drawImage(blood, 0, 0);
      g.restore();
    }
    smoke(g, 300, 132, t);
  });
}

// 2. The heavy one tipping a jerrycan over the sofa, in the neon from the window; the petrol running.
export function paintPour(g, w, h, t) {
  still(g, 'pour', w, h);
  fine(g, () => {
    for (let i = 0; i < 4; i++) {
      const k = (t * 1.8 + i / 4) % 1;
      px(g, '#fff0c0', 182 - k * 28, 128 + k * 54, 2, 4);
    }
  });
}

// 3. Close: the one with the slicked hair strikes a match (struck 0..1: how far into the strike); before it, the dark.
export function paintMatch(g, w, h, t, struck = 1) {
  if (struck <= 0) { still(g, 'match_dark', w, h); return; }
  still(g, 'match', w, h);
  const fl = 0.8 + 0.2 * Math.sin(t * 23) * Math.sin(t * 7), [fx, fy] = FLAME;
  fine(g, () => {
    if (fl < 0.68) tone(g, '#07050a', 0, 0, w * SC, h * SC, 0.18);          // the flame ducks
    const fh = 48 + 16 * fl, sway = Math.sin(t * 20) * 4;
    disc(g, '#c8381a', fx, fy - 4, 13, 15);
    poly(g, '#c8381a', [[fx - 12, fy - 4], [fx + 12, fy - 4], [fx + 6, fy - fh * 0.55], [fx + sway, fy - fh]]);
    disc(g, '#ff8a20', fx, fy - 4, 9, 11);
    poly(g, '#ff8a20', [[fx - 9, fy - 4], [fx + 9, fy - 4], [fx + sway * 0.7, fy - fh * 0.8]]);
    disc(g, '#fff0a0', fx, fy - 3, 5, 6);
    poly(g, '#fff0a0', [[fx - 5, fy - 3], [fx + 5, fy - 3], [fx + sway * 0.4, fy - fh * 0.45]]);
    if (struck < 1) {
      for (let i = 0; i < 14; i++) px(g, '#ffe080', fx + (hash(i) - 0.5) * 110 * struck, fy - 10 - hash(i + 4) * 80 * struck, 3, 3);   // the sparks
      tone(g, '#ffd8a0', 0, 0, w * SC, h * SC, 0.4 * (1 - struck));
    }
  });
}
