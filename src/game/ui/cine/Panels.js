// The opening's comic panels: a black frame with a white gutter and a hard shadow round each, the caption boxes and
// the balloons. Inside, the opening's stills (drawn by tools/generate_comic.py, finer than the title) with what still
// moves in them, and the leap's pages, pixel art in the title's logical px: flat colours in a few shades each, a dark
// outline round what matters, never a gradient or a dither (the user wants plain pixel art). Each painter gets the
// context clipped to its panel and translated to its top-left corner, its size, and t (s) for what still moves in it.
import { spriteOpt } from '../../../engine/Assets.js';
import { clamp, hash, px, tone, poly, disc, line } from './Ink.js';

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

// ---------------------------------------------------------------- drawing helpers
// a shape with a 1 px ink outline round it
function inked(g, col, pts) {
  for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) poly(g, INK, pts.map(([x, y]) => [x + dx, y + dy]));
  poly(g, col, pts);
}
function inkedDisc(g, col, cx, cy, rx, ry = rx) {
  disc(g, INK, cx, cy, rx + 1, ry + 1);
  disc(g, col, cx, cy, rx, ry);
}
// rain in front of everything: short slanting streaks
function rain(g, w, h, t, n = 40, col = 'rgba(160,180,230,0.45)') {
  for (let i = 0; i < n; i++) {
    const x = (hash(i) * (w + 20) + t * 30) % (w + 20) - 10, y = (hash(i + 7) * h + t * 220 * (0.8 + hash(i + 3) * 0.4)) % h;
    line(g, col, x, y, x - 1, y + 5);
  }
}
// flames: tongues that lick up from a base line, flickering with t
function flames(g, x0, x1, y, hgt, t, seed = 0) {
  for (let x = x0; x < x1; x += 4) {
    const k = hash(Math.floor(t * 12) + x * 3 + seed), f = hgt * (0.5 + 0.5 * k);
    poly(g, '#c8381a', [[x - 1, y], [x + 5, y], [x + 2 + Math.sin(t * 9 + x) * 2, y - f]]);
    poly(g, '#ff8a2a', [[x, y], [x + 4, y], [x + 2 + Math.sin(t * 9 + x) * 1.5, y - f * 0.7]]);
    poly(g, '#ffe080', [[x + 1, y], [x + 3, y], [x + 2, y - f * 0.35]]);
  }
}

// ---------------------------------------------------------------- the opening's stills
// The opening's panels are drawn like a noir thriller album by tools/generate_comic.py (sprites comic/*, SC panel px
// per title px): here they are put in their frame and given what moves (a lamp failing, smoke, blood spreading, the
// match's flame), drawn in the stills' own px.
const SC = 3;
const FLAME = [536, 160];   // the match's head in comic/match (generate_comic.py FLAME)

function still(g, name, w, h) {
  const img = spriteOpt(`comic/${name}`);
  if (img) g.drawImage(img, 0, 0, w, h);
  else px(g, '#0c0812', 0, 0, w, h);
}
function fine(g, draw) {
  g.save();
  g.scale(1 / SC, 1 / SC);
  draw();
  g.restore();
}
// smoke going up from (x, y) in a thin wavering thread (stills' px)
function smoke(g, x, y, t, n = 14, col = '#8a8494') {
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

// ================================================================ page 3: the leap
// 1. The building, side on, in the rain: his flat burning on the top floor, and him through the corridor's window in
// a burst of glass. k 0..1: how far out he is.
export function paintCrash(g, w, h, t, k = 1) {
  px(g, '#120c22', 0, 0, w, h);
  for (let i = 0; i < 8; i++) px(g, '#0c0818', 220 + i * 18, 20 + hash(i) * 30, 14, h);      // the towers behind
  for (let i = 0; i < 20; i++) px(g, '#5a4a30', 222 + hash(i) * 140, 24 + hash(i + 3) * 60, 2, 3);
  inked(g, '#3a1e22', [[0, 0], [200, 0], [200, h], [0, h]]);              // his building
  for (let y = 2; y < h; y += 5) { px(g, '#2a1418', 0, y, 200, 1); for (let x = (y % 10 ? 0 : 7); x < 200; x += 14) px(g, '#2a1418', x, y, 1, 5); }
  for (const x of [20, 74, 128]) {                                        // his flat's windows, ablaze
    px(g, '#1e1016', x - 2, 14, 30, 34); px(g, '#ff8a2a', x, 16, 26, 30); px(g, '#ffd060', x + 4, 24, 18, 18);
    flames(g, x, x + 26, 18, 16, t, x);
    px(g, '#5a4a48', x - 3, 48, 32, 3);
    for (let i = 0; i < 3; i++) disc(g, '#3a3044', x + 6 + i * 8 + Math.sin(t + i + x) * 2, 6 - ((t * 6 + i * 4) % 8), 7, 4, 0.85);   // smoke
  }
  for (const x of [20, 74, 128]) { px(g, '#0a0812', x, 66, 26, 26); px(g, '#1e1016', x + 12, 66, 2, 26); px(g, '#5a4a48', x - 3, 92, 32, 3); }
  // the corridor's window: smashed out; him coming through it head first, arms over his face
  px(g, '#1e1016', 170, 12, 30, 36); px(g, '#ff8a2a', 172, 14, 26, 32); px(g, '#ffd060', 176, 22, 18, 18);
  for (const [x0, y0, x1, y1] of [[172, 14, 178, 22], [196, 14, 190, 20], [172, 46, 178, 38], [196, 46, 191, 40]]) poly(g, '#bcd8f8', [[x0, y0], [x1, y1], [x0 + (x0 < 180 ? 3 : -3), y0]]);
  px(g, '#5a4a48', 167, 48, 34, 3);
  const ox = 200 + k * 46, oy = 26 + k * 10;
  for (let i = 0; i < 26; i++) {                                          // the glass, flying with him
    const a = (hash(i) - 0.5) * 1.6, r = (10 + hash(i + 5) * 60) * k;
    inked(g, i % 3 ? '#bcd8f8' : '#ffffff', [[ox - 10 + Math.cos(a) * r, oy + Math.sin(a) * r], [ox - 7 + Math.cos(a) * r, oy + Math.sin(a) * r + 1], [ox - 9 + Math.cos(a) * r, oy + Math.sin(a) * r + 4]]);
  }
  inked(g, '#465062', [[ox - 22, oy - 4], [ox + 4, oy - 8], [ox + 10, oy + 2], [ox - 18, oy + 10], [ox - 34, oy + 14], [ox - 30, oy + 4]]);  // the coat
  px(g, '#2a5f6e', ox - 30, oy + 8, 10, 2);
  inked(g, '#3c4a66', [[ox - 34, oy + 6], [ox - 50, oy], [ox - 52, oy + 6], [ox - 34, oy + 14]]);                                         // his legs
  px(g, '#3a2a22', ox - 56, oy - 1, 6, 6);
  inkedDisc(g, '#2e323e', ox + 8, oy - 6, 6, 5); px(g, '#22252e', ox + 12, oy - 4, 5, 2);                                                 // the cap
  inked(g, '#465062', [[ox + 2, oy - 12], [ox + 18, oy - 14], [ox + 18, oy - 8], [ox + 2, oy - 6]]); inkedDisc(g, '#dba274', ox + 19, oy - 11, 3);
  for (let i = 0; i < 6; i++) line(g, 'rgba(255,255,255,0.5)', ox - 60 - i * 8, oy - 8 + i * 4, ox - 40 - i * 8, oy - 8 + i * 4);          // speed lines
  rain(g, w, h, t, 50);
}

// 2. From below, looking up: him falling at us, the coat flaring, the fire and the smoke over him, the rain.
export function paintFall(g, w, h, t) {
  px(g, '#1a1030', 0, 0, w, h);
  inked(g, '#3a1e22', [[0, 0], [44, 0], [70, h], [0, h]]);                // the wall going up and away
  px(g, '#ff8a2a', 12, 6, 16, 10); flames(g, 12, 28, 8, 10, t, 3);
  for (let i = 0; i < 6; i++) disc(g, '#3a3044', 40 + i * 10 + Math.sin(t + i) * 3, 10 + i * 4, 12, 6, 0.8);
  const cx = 66, cy = 50 + Math.sin(t * 2) * 2;
  inked(g, '#465062', [[cx - 26, cy - 22], [cx + 26, cy - 24], [cx + 18, cy + 8], [cx - 18, cy + 10]]);  // the coat, flaring
  poly(g, '#2a5f6e', [[cx - 20, cy - 18], [cx + 20, cy - 20], [cx + 16, cy - 16], [cx - 18, cy - 14]]);
  inked(g, '#3c4a66', [[cx - 10, cy + 6], [cx - 2, cy + 6], [cx - 6, cy + 30], [cx - 14, cy + 28]]);
  inked(g, '#3c4a66', [[cx + 2, cy + 6], [cx + 10, cy + 6], [cx + 18, cy + 26], [cx + 10, cy + 30]]);
  inked(g, '#3a2a22', [[cx - 16, cy + 27], [cx - 5, cy + 29], [cx - 7, cy + 38], [cx - 18, cy + 36]]);  // the soles, at us
  inked(g, '#3a2a22', [[cx + 9, cy + 28], [cx + 20, cy + 25], [cx + 22, cy + 34], [cx + 11, cy + 37]]);
  inked(g, '#465062', [[cx - 24, cy - 16], [cx - 40, cy - 34], [cx - 34, cy - 38], [cx - 18, cy - 20]]); inkedDisc(g, '#dba274', cx - 40, cy - 37, 4);
  inked(g, '#465062', [[cx + 22, cy - 18], [cx + 40, cy - 34], [cx + 44, cy - 28], [cx + 26, cy - 12]]); inkedDisc(g, '#dba274', cx + 44, cy - 33, 4);
  inkedDisc(g, '#2e323e', cx, cy - 26, 8, 6); px(g, '#2a5f6e', cx - 1, cy - 27, 2, 2);
  for (let i = 0; i < 10; i++) line(g, 'rgba(255,255,255,0.35)', 6 + i * 11, h, 8 + i * 11, h - 20 - hash(i) * 20);   // the rush of air
  rain(g, w, h, t, 30);
}

// 3. The alley: he hits the wet ground and rolls, a sheet of water thrown up, the bags he just missed.
export function paintRoll(g, w, h, t) {
  px(g, '#140e22', 0, 0, w, h);
  px(g, '#1e1830', 0, 0, w, 60);
  for (let y = 4; y < 60; y += 6) px(g, '#18122a', 0, y, w, 1);           // the wall across
  px(g, '#151020', 0, 60, w, h - 60); px(g, '#2a2236', 0, 60, w, 1);
  poly(g, '#3a2a5a', [[10, 70], [90, 70], [104, 84], [0, 84]], 0.6);       // the puddle, the neon in it
  px(g, '#ff2a6d', 30, 76, 20, 1); px(g, '#ff2a6d', 54, 78, 12, 1);
  for (const [x, r] of [[96, 9], [108, 8]]) { inkedDisc(g, '#24262e', x, 60 - r + 2, r, r - 1); px(g, '#4a4c58', x - 3, 60 - 2 * r + 5, 4, 1); }
  const a = t * 7, cx = 54, cy = 56;                                      // him, curled, turning
  inkedDisc(g, '#465062', cx, cy, 14, 13);
  disc(g, '#343c4c', cx + Math.cos(a) * 4, cy + Math.sin(a) * 4, 7, 7);
  inkedDisc(g, '#2e323e', cx + Math.cos(a + 2) * 11, cy + Math.sin(a + 2) * 10, 5);
  inked(g, '#3a2a22', [[cx + Math.cos(a - 1.6) * 12 - 3, cy + Math.sin(a - 1.6) * 12 - 3], [cx + Math.cos(a - 1.6) * 12 + 4, cy + Math.sin(a - 1.6) * 12 - 3], [cx + Math.cos(a - 1.6) * 12 + 4, cy + Math.sin(a - 1.6) * 12 + 3], [cx + Math.cos(a - 1.6) * 12 - 3, cy + Math.sin(a - 1.6) * 12 + 3]]);
  px(g, '#7a4a28', cx + Math.cos(a + 3.6) * 12 - 3, cy + Math.sin(a + 3.6) * 12 - 3, 6, 6);
  for (let i = 0; i < 4; i++) line(g, 'rgba(255,255,255,0.6)', cx - 20 - i * 4, cy - 12 + i * 8, cx - 36 - i * 6, cy - 12 + i * 8);     // motion lines
  for (let i = 0; i < 16; i++) {                                          // the water thrown up
    const k = (t * 1.6 + hash(i)) % 1, x = 34 + hash(i + 3) * 50, y = 72 - Math.sin(k * Math.PI) * (10 + hash(i) * 18);
    px(g, '#9ab8e8', x, y, 2, 1);
  }
  rain(g, w, h, t, 30);
}

// 4. On one knee in the alley, his back to us, looking up at the windows burning over him; the rain on his shoulders.
export function paintKneel(g, w, h, t) {
  px(g, '#1a1030', 0, 0, w, h);
  inked(g, '#3a1e22', [[0, 0], [w, 0], [w, 54], [0, 54]]);
  for (let y = 2; y < 54; y += 5) px(g, '#2a1418', 0, y, w, 1);
  for (const x of [12, 64]) { px(g, '#ff8a2a', x, 8, 30, 22); px(g, '#ffd060', x + 6, 14, 18, 12); flames(g, x, x + 30, 10, 12, t, x); px(g, '#5a4a48', x - 2, 30, 34, 2); }
  for (let i = 0; i < 6; i++) disc(g, '#3a3044', 20 + i * 16 + Math.sin(t * 0.7 + i) * 4, 4 - (t * 4 + i * 3) % 10, 12, 5, 0.8);
  px(g, '#151020', 0, 54, w, h - 54); poly(g, '#ff8a2a', [[10, 60], [100, 60], [110, h], [0, h]], 0.18);
  // him, from behind: kneeling, the coat spread on the wet ground, the satchel, the cap tipped back
  const cx = 60, gy = 90;
  inked(g, '#465062', [[cx - 18, gy], [cx + 18, gy], [cx + 14, gy - 30], [cx - 14, gy - 30]]);
  inked(g, '#465062', [[cx - 14, gy - 30], [cx + 14, gy - 30], [cx + 12, gy - 50], [cx - 12, gy - 50]]);
  poly(g, '#5a6478', [[cx + 6, gy - 48], [cx + 12, gy - 48], [cx + 14, gy - 30], [cx + 16, gy], [cx + 10, gy]]);  // the fire's light on his right
  px(g, '#343c4c', cx - 1, gy - 46, 2, 46);
  inked(g, '#7a4a28', [[cx - 18, gy - 30], [cx - 6, gy - 30], [cx - 6, gy - 18], [cx - 18, gy - 18]]); line(g, '#8a5630', cx - 10, gy - 30, cx + 10, gy - 50, 2);
  inked(g, '#3e4454', [[cx - 10, gy - 52], [cx + 10, gy - 52], [cx + 8, gy - 46], [cx - 8, gy - 46]]);   // the collar up
  inkedDisc(g, '#4a2e1c', cx, gy - 56, 7, 6); inkedDisc(g, '#2e323e', cx, gy - 61, 7, 4);
  px(g, '#3a2a22', cx - 22, gy - 4, 8, 4); px(g, '#3a2a22', cx + 14, gy - 3, 8, 3);
  for (let i = 0; i < 6; i++) px(g, '#9ab8e8', cx - 12 + hash(i) * 24, gy - 50 + ((t * 40 + i * 9) % 30), 1, 2);
  rain(g, w, h, t, 30);
}
