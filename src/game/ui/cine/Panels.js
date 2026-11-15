// The opening's comic panels: pixel art in the title's logical px, inked like a comic book. A black frame with a
// white gutter and a hard shadow; inside, flat colours in a few shades each, a dark outline round what matters, light
// from one side, never a gradient or a dither (the user wants plain pixel art). Each painter gets the context
// clipped to its panel and translated to its top-left corner, its size, and t (s) for what still moves in it.
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

// a speech balloon whose tail points at (tx, ty)
export function balloon(g, x, y, w, h, tx, ty) {
  const cx = x + w / 2, cy = y + h / 2;
  poly(g, INK, [[cx - 7, cy], [cx + 3, cy], [tx, ty]]);
  disc(g, INK, cx, cy, w / 2 + 1, h / 2 + 1);
  poly(g, '#f6f2ea', [[cx - 5, cy], [cx + 1, cy], [tx + 1, ty - 2]]);
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

// A man of the boss's, side on, feet at (x, y), facing right (f -1: left). pose: 'stand' | 'crouch'. Returns where
// his hand is, for what he holds. Leather jacket, slicked hair, dark trousers; lit from the right by default.
const THUG = { jacket: '#2a2230', jacketL: '#4a3a50', pants: '#1c1a24', skin: '#c88a60', skinD: '#9a6440', hair: '#14100c', shoe: '#0c0a0e' };
function thug(g, x, y, f = 1, pose = 'stand', pal = THUG) {
  const X = (dx) => x + dx * f;
  if (pose === 'crouch') {
    inked(g, pal.pants, [[X(-8), y], [X(4), y], [X(10), y - 10], [X(2), y - 18], [X(-8), y - 14]]);
    px(g, pal.shoe, Math.min(X(-9), X(-1)), y - 2, 8, 2); px(g, pal.shoe, Math.min(X(4), X(12)), y - 2, 8, 2);
    inked(g, pal.jacket, [[X(-9), y - 14], [X(4), y - 18], [X(10), y - 34], [X(-2), y - 38], [X(-10), y - 30]]);
    poly(g, pal.jacketL, [[X(6), y - 22], [X(10), y - 34], [X(7), y - 35], [X(3), y - 24]]);
    inkedDisc(g, pal.skin, X(5), y - 42, 5, 6); px(g, pal.skinD, Math.min(X(2), X(8)), y - 39, 6, 2);
    poly(g, pal.hair, [[X(0), y - 46], [X(9), y - 49], [X(10), y - 44], [X(1), y - 40]]);
    inked(g, pal.jacket, [[X(4), y - 32], [X(16), y - 26], [X(16), y - 22], [X(4), y - 26]]);
    return [X(18), y - 24];
  }
  inked(g, pal.pants, [[X(-6), y - 30], [X(5), y - 30], [X(6), y], [X(1), y], [X(0), y - 18], [X(-1), y], [X(-6), y]]);
  px(g, pal.shoe, Math.min(X(-7), X(1)), y - 2, 8, 3); px(g, pal.shoe, Math.min(X(0), X(8)), y - 2, 8, 3);
  inked(g, pal.jacket, [[X(-9), y - 56], [X(8), y - 56], [X(9), y - 28], [X(-8), y - 28]]);
  poly(g, pal.jacketL, [[X(5), y - 54], [X(8), y - 54], [X(9), y - 30], [X(6), y - 30]]);                 // the light on his front
  px(g, '#0c0a10', Math.min(X(-1), X(0)), y - 54, 1, 26);                                                  // the zip
  inkedDisc(g, pal.skin, X(1), y - 63, 6, 7); px(g, pal.skinD, Math.min(X(-4), X(4)), y - 59, 9, 2);
  poly(g, pal.hair, [[X(-6), y - 66], [X(5), y - 71], [X(7), y - 66], [X(-5), y - 61]]);
  px(g, INK, X(4), y - 64, 1, 1);
  inked(g, pal.jacket, [[X(4), y - 54], [X(10), y - 52], [X(13), y - 36], [X(9), y - 35]]);
  return [X(12), y - 34];
}

// ---------------------------------------------------------------- his eye in the dark
// shut, then open all at once (open 0..1), looking to the side the noise came from (look -1..1)
export function paintEye(g, w, h, open, look, t) {
  px(g, '#2c1e26', 0, 0, w, h);
  px(g, '#4e3632', 0, 12, w, h - 26);                                     // the skin, what the window lights of it
  px(g, '#3e2a2c', 0, h - 22, w, 8);
  px(g, '#3a2418', 0, 0, w, 9);                                           // his brown hair, low on the brow
  for (let i = 0; i < 10; i++) poly(g, '#5a3a24', [[4 + i * 15, 0], [10 + i * 15, 0], [8 + i * 15 + hash(i) * 4, 8 + hash(i + 3) * 4]]);
  const cx = Math.round(w / 2), cy = Math.round(h / 2) + 3, rows = [18, 30, 38, 42, 44, 42, 38, 30, 18];
  const n = Math.round(clamp(open, 0, 1) * rows.length);
  px(g, '#1a0e10', cx - 26, cy - 10, 52, 3);                              // the brow's shadow
  if (n <= 0) {
    px(g, '#140a0c', cx - 22, cy, 44, 2);                                 // shut: the lashes
    for (let i = 0; i < 6; i++) px(g, '#140a0c', cx - 20 + i * 8, cy + 2, 1, 2);
  } else {
    const first = Math.floor((rows.length - n) / 2);
    for (let j = 0; j < n; j++) px(g, '#e4dcd0', cx - rows[first + j] / 2, cy - n / 2 + j, rows[first + j], 1);
    const ix = cx + Math.round(look * 9), r = Math.min(6, Math.ceil(n / 2) + 1);
    px(g, '#3a2414', ix - r, cy - r + 1, r * 2, r * 2 - 2); px(g, '#5a3a1c', ix - r + 1, cy - r + 2, r * 2 - 2, r * 2 - 4);
    px(g, '#05030a', ix - 2, cy - 2, 4, 4);
    px(g, '#ffffff', ix - 3, cy - 3, 2, 2);
    px(g, '#140a0c', cx - 23, cy - n / 2 - 1, 46, 1); px(g, '#2a1a1c', cx - 21, cy + n / 2, 42, 1);
    for (let i = 0; i < 5; i++) px(g, '#c85a5a', cx - 20 + i * 9 + hash(i) * 3, cy - n / 2 + 1 + hash(i + 2) * (n - 2), 3, 1); // bloodshot
  }
  px(g, '#b0306a', w - 3, 10, 2, h - 20);                                 // the neon through the window on his cheek
  const drop = (t * 9) % 40;
  px(g, '#9ab0c8', 22, 12 + drop, 2, 3); px(g, '#ffffff', 22, 12 + drop, 1, 1);  // sweat
}

// ================================================================ page 1: what they came for
// 1. His front door, from the building's corridor: one of them crouched at it with a crowbar in the jamb, another
// with a jerrycan, a third holding a torch on the lock. The wall lamp's yellow; the men dark against it.
export function paintDoor(g, w, h, t) {
  const fl = (t * 3) % 1 < 0.06 ? 0.5 : 1;                                // the lamp, failing now and then
  px(g, '#3a3020', 0, 0, w, 70);                                          // the corridor's wall
  px(g, '#4a3e28', 0, 0, w, 6); px(g, '#2a2216', 0, 6, w, 2);
  for (let x = 0; x < w; x += 30) px(g, '#33291c', x, 8, 1, 62);          // the paper's seams
  px(g, '#5a4a30', 0, 62, w, 3); px(g, '#2a2216', 0, 65, w, 5);           // dado rail, skirting
  px(g, '#2a1c1c', 0, 70, w, h - 70);                                     // the floor, the carpet runner
  poly(g, '#5e2a34', [[60, 70], [300, 70], [w, h], [0, h]]); poly(g, '#8a6a3a', [[60, 70], [62, 70], [2, h], [0, h]]); poly(g, '#8a6a3a', [[298, 70], [300, 70], [w, h], [w - 2, h]]);
  // a neighbour's door on the left, shut, dark
  px(g, '#1e160e', 20, 14, 34, 56); px(g, '#3a2818', 22, 16, 30, 54); px(g, '#c8a040', 46, 44, 3, 3); px(g, '#c8a040', 32, 24, 7, 3);
  // his door: number, peephole, the crowbar's work at the lock
  px(g, '#1e160e', 226, 12, 44, 58); px(g, '#5a3c26', 228, 14, 40, 56); px(g, '#6e4c32', 228, 14, 3, 56); px(g, '#3e2818', 265, 14, 3, 56);
  px(g, '#4a301e', 234, 20, 28, 20); px(g, '#4a301e', 234, 44, 28, 22);
  px(g, '#d8b050', 244, 22, 9, 5); px(g, '#2a1a0c', 246, 23, 2, 3); px(g, '#2a1a0c', 249, 23, 2, 3);       // "4B"
  disc(g, '#8a8e98', 248, 32, 1.5);
  px(g, '#c8a040', 231, 42, 4, 4);
  for (let i = 0; i < 4; i++) line(g, '#e8c890', 228, 40 + i * 2, 222 - hash(i) * 6, 38 + i * 3);            // splinters
  // the lamp over it and its light
  px(g, '#5a4a30', 288, 18, 10, 4); disc(g, '#fff0b0', 293, 25, 5, 4);
  tone(g, '#ffd27a', 180, 0, 160, 70, 0.14 * fl); tone(g, '#ffd27a', 240, 8, 100, 62, 0.12 * fl);
  // the torch on the lock, from the man at the back
  poly(g, '#fff4c0', [[118, 36], [122, 33], [234, 36], [234, 50]], 0.35);
  // the three of them
  const [hx, hy] = thug(g, 92, 92, 1);
  px(g, '#3a3a44', hx - 2, hy - 2, 8, 4); px(g, '#fff4c0', hx + 6, hy - 2, 2, 3);                             // the torch
  const [jx, jy] = thug(g, 150, 90, 1, 'stand', { ...THUG, jacket: '#3a2a22', jacketL: '#5a4232' });
  inked(g, '#b8261c', [[jx - 6, jy], [jx + 6, jy], [jx + 7, jy + 14], [jx - 7, jy + 14]]);                  // the jerrycan
  px(g, '#e04a3a', jx - 5, jy + 1, 10, 2); px(g, '#c8a040', jx + 2, jy - 3, 3, 3);
  const [cx, cy] = thug(g, 204, 82, 1, 'crouch');
  line(g, '#5a2028', cx - 4, cy + 2, 232, 41, 2); line(g, '#8a3a40', cx - 4, cy + 1, 230, 40);               // the crowbar
  px(g, INK, cx - 2, cy - 2, 5, 5);
}

// 2. His living room's floor, close: the crowbar under a board, the board coming up on its nails, the dark under it
// and the corner of a tin box in it; a torch beam from above.
export function paintPry(g, w, h, t) {
  px(g, '#1c1424', 0, 0, w, h);
  for (let i = 0; i < 7; i++) {                                           // long boards across the panel
    const y = 8 + i * 13, joint = (hash(i * 3) * w) | 0;
    px(g, i % 2 ? '#4a3226' : '#56392a', 0, y, w, 12); px(g, '#1a1016', 0, y + 12, w, 1);
    px(g, '#6a4a34', 0, y, w, 1);
    for (let k = 0; k < 4; k++) px(g, '#3e281e', (hash(i * 5 + k) * w) | 0, y + 3 + k * 2, 10 + hash(k + i) * 20, 1);   // the grain
    px(g, '#1a1016', joint, y, 1, 12);
    px(g, '#8a8e98', joint + 3, y + 3, 1, 1); px(g, '#8a8e98', joint + 3, y + 8, 1, 1);                                  // the nails
  }
  // the hole: two boards out, the dark, the box's corner catching the torch
  px(g, '#07050a', 18, 47, 78, 25);
  inked(g, '#6a7480', [[50, 56], [86, 54], [88, 72], [52, 72]]); px(g, '#aab4c0', 51, 56, 35, 2); px(g, '#3a4048', 52, 66, 34, 1);
  // the board being prised up, its nails
  inked(g, '#56392a', [[16, 46], [70, 34], [74, 40], [20, 52]]); line(g, '#6a4a34', 18, 46, 70, 35);
  px(g, '#e8c890', 68, 35, 4, 4);
  line(g, '#b8bcc4', 30, 46, 31, 52); line(g, '#b8bcc4', 54, 40, 55, 46);
  // the crowbar, a gloved hand on it
  line(g, INK, 64, 42, 112, 10, 4); line(g, '#7a2a30', 64, 42, 112, 10, 2); line(g, '#c85a60', 66, 40, 110, 11);
  inkedDisc(g, '#1a1820', 104, 16, 8, 6); px(g, '#3a3848', 99, 13, 8, 1);
  // the torch's beam
  poly(g, '#fff0b0', [[w, 0], [w, 14], [60, 72], [36, 58]], 0.18);
  for (let i = 0; i < 8; i++) px(g, '#fff4c0', 40 + ((hash(i) * 50 + t * 5) % 50), 40 + hash(i + 2) * 30, 1, 1);
}

// 3. The tin box, open, from above: banded bundles, his passport, a bus ticket, the postcard of a beach he kept on
// his wall; a gloved hand taking a bundle.
export function paintBox(g, w, h, t) {
  px(g, '#07050a', 0, 0, w, h);
  inked(g, '#5a6470', [[10, 12], [106, 10], [108, 86], [8, 88]]);
  px(g, '#2a3038', 14, 15, 90, 69);
  px(g, '#aab4c0', 11, 12, 95, 2);
  for (let r = 0; r < 3; r++) for (let c = 0; c < 4; c++) {
    const x = 17 + c * 21, y = 19 + r * 21;
    if (r === 0 && c === 3) continue;
    inked(g, '#4a7a52', [[x, y], [x + 18, y], [x + 18, y + 18], [x, y + 18]]);
    px(g, '#6a9a6a', x + 1, y + 1, 17, 2); px(g, '#2e4a32', x + 1, y + 16, 17, 2);
    disc(g, '#3e6a44', x + 9, y + 9, 3); px(g, '#b88a48', x + 7, y, 3, 18);          // the band round it
  }
  // the postcard, the ticket, his passport
  inked(g, '#f0a050', [[78, 18], [102, 22], [100, 38], [76, 34]]); poly(g, '#3a8aa0', [[77, 28], [101, 32], [100, 38], [76, 34]]);
  disc(g, '#ffe080', 95, 25, 3);
  inked(g, '#c8c0a4', [[18, 66], [44, 64], [45, 70], [19, 72]]); px(g, '#b8262c', 22, 67, 18, 1);
  inked(g, '#2a3a5a', [[56, 64], [72, 63], [73, 82], [57, 83]]); px(g, '#c8a040', 61, 70, 7, 4);
  // the glove, lifting one
  const lift = Math.sin(clamp(t * 0.8, 0, 1) * Math.PI / 2) * 6;
  inked(g, '#4a7a52', [[60, 40 - lift], [78, 40 - lift], [78, 58 - lift], [60, 58 - lift]]); px(g, '#b88a48', 67, 40 - lift, 3, 18);
  inked(g, '#1a1820', [[56, 44 - lift], [70, 36 - lift], [96, 0], [116, 0], [116, 14], [80, 50 - lift], [62, 56 - lift]]);
  px(g, '#3a3848', 70, 40 - lift, 14, 1); px(g, '#3a3848', 74, 45 - lift, 10, 1);
}

// 4. One of them, close, fanning the notes under his nose, grinning, a gold tooth, a cigarette.
export function paintCount(g, w, h, t) {
  px(g, '#1a2a1e', 0, 0, w, h);
  px(g, '#24382a', 0, 0, w, 40);
  // his head, three-quarters: slicked hair, sideburn, the grin
  inked(g, THUG.skin, [[30, 18], [62, 14], [74, 32], [72, 56], [60, 70], [38, 70], [28, 52]]);
  poly(g, THUG.skinD, [[30, 40], [40, 46], [44, 68], [38, 70], [28, 52]]);
  poly(g, THUG.hair, [[26, 22], [40, 6], [66, 6], [76, 22], [62, 16], [32, 24], [30, 40], [24, 34]]);
  px(g, '#e8f0ff', 50, 10, 10, 1);                                        // the shine on his hair
  px(g, INK, 46, 32, 8, 2); px(g, INK, 62, 30, 6, 2);                    // brows
  px(g, '#f0ece0', 48, 36, 5, 3); px(g, INK, 51, 36, 2, 3); px(g, '#f0ece0', 63, 34, 4, 3); px(g, INK, 65, 34, 2, 3);
  poly(g, THUG.skinD, [[58, 36], [64, 46], [58, 48]]);                    // the nose
  poly(g, INK, [[44, 54], [70, 50], [66, 58], [48, 60]]);                 // the grin
  px(g, '#f0ece0', 48, 54, 18, 2); px(g, '#e8c040', 58, 54, 3, 2);      // teeth, the gold one
  px(g, '#d8d2c4', 66, 56, 14, 2); px(g, '#ff8a2a', 80, 56, 2, 2);       // the cigarette
  for (let i = 0; i < 10; i++) px(g, '#6a7a6c', 82 + Math.sin(t * 1.5 + i * 0.7) * 2 + i * 0.5, 54 - i * 3, 2, 2);
  inked(g, THUG.jacket, [[24, 70], [78, 68], [92, h], [14, h]]); px(g, '#e8e0d0', 46, 70, 12, 6);
  // the notes, fanned in his fist
  for (let i = 0; i < 7; i++) {
    const a = -2.2 + i * 0.18, cx = 92, cy = 70, ex = cx + Math.cos(a) * 34, ey = cy + Math.sin(a) * 34;
    inked(g, i % 2 ? '#5e9060' : '#6aa070', [[cx, cy], [ex - Math.sin(a) * 6, ey + Math.cos(a) * 6], [ex + Math.sin(a) * 6, ey - Math.cos(a) * 6]]);
    disc(g, '#3e6a44', cx + Math.cos(a) * 24, cy + Math.sin(a) * 24, 2);
  }
  inkedDisc(g, '#1a1820', 92, 74, 9, 8); px(g, '#3a3848', 86, 70, 8, 1);
}

// ================================================================ page 2: no loose ends
// 5. His entrance hall from the floor: the front door open on the landing's light, the building's super on his face
// in his cardigan and slippers, his torch rolled away still lit, the blood coming out (k 0..1); over him the legs of
// the one who shot him, the gun hanging from his hand, a thread of smoke out of its muzzle.
export function paintSuper(g, w, h, t, k = 1) {
  px(g, '#1c140e', 0, 0, w, h);
  px(g, '#e8b860', 96, 0, 48, 62); px(g, '#c8903a', 96, 46, 48, 16);    // the landing, through the door
  px(g, INK, 90, 0, 6, 64); px(g, INK, 144, 0, 4, 64);
  inked(g, '#4a301c', [[146, 0], [176, 0], [174, 66], [146, 62]]); px(g, '#c8a040', 168, 34, 3, 3);
  poly(g, '#e8b860', [[96, 62], [144, 62], [190, h], [40, h]], 0.22);     // its light on the hall's floor
  for (const y of [70, 80, 90]) px(g, '#2a1e14', 0, y, w, 1);
  // him: on his face across the threshold, an arm out, grey hair, a slipper off
  inked(g, '#6a5a48', [[44, 74], [86, 68], [112, 72], [114, 82], [80, 86], [42, 84]]);
  poly(g, '#857260', [[50, 74], [86, 69], [100, 71], [60, 76]]);
  inked(g, '#2c2c3a', [[112, 72], [150, 72], [154, 80], [114, 82]]);
  px(g, '#5a2a24', 152, 72, 10, 4); px(g, '#c8c0b0', 156, 78, 4, 3);
  inkedDisc(g, '#8a8a90', 38, 76, 7, 6); disc(g, '#b0a898', 36, 73, 5, 3);
  inked(g, '#6a5a48', [[44, 72], [24, 60], [22, 63], [42, 76]]); inkedDisc(g, '#d8a888', 21, 60, 3, 2);
  px(g, '#5a2a24', 170, 84, 10, 4);
  const r = 4 + 20 * clamp(k, 0, 1);                                      // the blood
  disc(g, '#3a0508', 66, 85, r, r * 0.3); disc(g, '#8a0c12', 66 + r * 0.2, 84, r * 0.7, r * 0.2); px(g, '#e04048', 66 + r * 0.5, 83, 3, 1);
  px(g, '#3a3a44', 4, 86, 10, 4); poly(g, '#fff4c0', [[2, 86], [-30, 70], [-30, 100]], 0.3); px(g, '#fff4c0', 2, 87, 2, 2);
  // the shooter: his legs in the doorway, the pistol hanging at his side, smoking
  inked(g, THUG.pants, [[112, 0], [122, 0], [122, 60], [112, 60]]); inked(g, THUG.pants, [[126, 0], [136, 0], [138, 62], [128, 62]]);
  px(g, THUG.shoe, 108, 58, 14, 5); px(g, THUG.shoe, 126, 60, 15, 5);
  inked(g, THUG.skin, [[138, 6], [144, 6], [144, 14], [138, 14]]);
  inked(g, '#2a2a32', [[140, 12], [144, 12], [145, 30], [141, 30]]); px(g, '#4a4a58', 141, 13, 1, 16);
  for (let i = 0; i < 12; i++) px(g, '#9a94a4', 143 + Math.sin(t * 2 + i * 0.6) * 2, 32 + i * 2.5, 1, 2);
}

// 6. The living room: one of them emptying a jerrycan over his sofa, the petrol coming out in a twisting rope and
// splashing; the hole in the floor at his feet.
export function paintPour(g, w, h, t) {
  px(g, '#1a1426', 0, 0, w, h);
  px(g, '#221a30', 0, 0, w, 58);
  px(g, '#2a1e22', 0, 58, w, h - 58);
  for (const y of [66, 76, 88]) px(g, '#1a1216', 0, y, w, 1);
  // the window behind, its neon
  px(g, '#100c1c', 14, 8, 40, 30); px(g, '#ff2a6d', 18, 14, 14, 2); px(g, '#2a5f9a', 34, 22, 16, 2); px(g, INK, 32, 8, 2, 30);
  // the sofa, soaked dark where the petrol has gone
  inked(g, '#6a2c50', [[20, 62], [96, 60], [100, 84], [16, 86]]);
  inked(g, '#7a3a60', [[22, 46], [94, 44], [96, 62], [20, 64]]);
  px(g, '#8e4a74', 24, 46, 68, 2); px(g, '#4a1c38', 56, 48, 1, 14);
  disc(g, '#3a1428', 62, 70, 20, 6); disc(g, '#4a1c38', 40, 56, 10, 4);
  // the hole in the floor and its torn boards
  px(g, INK, 116, 84, 40, 10); line(g, '#6a4a2a', 114, 84, 120, 78, 2); line(g, '#6a4a2a', 156, 84, 160, 79, 2);
  // the man, the jerrycan up in both hands
  thug(g, 126, 92, -1, 'stand', { ...THUG, jacket: '#3a2a22', jacketL: '#5a4232' });
  inked(g, '#b8261c', [[100, 44], [116, 40], [120, 56], [104, 60]]); px(g, '#e04a3a', 101, 45, 14, 2);
  px(g, '#8a1810', 106, 48, 8, 1); px(g, '#8a1810', 110, 44, 1, 12);                                   // the pressed cross on it
  inked(g, '#3a3a44', [[94, 48], [101, 46], [101, 52], [94, 54]]);
  inkedDisc(g, THUG.skin, 117, 56, 3); inkedDisc(g, THUG.skin, 104, 42, 3);
  // the petrol: a twisting rope down onto the sofa, the splash
  for (let y = 52; y < 62; y += 2) px(g, '#c89a50', 93 - (y - 52) * 0.8 + Math.sin(y * 0.5 + t * 16), y, 2, 2);
  for (let i = 0; i < 8; i++) {
    const a = hash(i + Math.floor(t * 10)) * Math.PI, r = 4 + hash(i + 2) * 6;
    px(g, '#e8c070', 76 + Math.cos(a) * r, 58 - Math.sin(a) * r * 0.6, 1, 1);
  }
}

// 7. Close: a match struck on its box between gloved fingers, the head flaring, a face lit from under it.
export function paintMatch(g, w, h, t, struck = 1) {
  px(g, '#08050a', 0, 0, w, h);
  const fl = struck > 0 ? 0.8 + 0.2 * Math.sin(t * 23) * Math.sin(t * 7) : 0;
  if (fl > 0) {
    disc(g, '#3a1408', 176, 60, 120 * fl, 50 * fl, 0.9);
    disc(g, '#6a2a0c', 176, 60, 76 * fl, 36 * fl, 0.9);
  }
  // the face, in profile, looking down at the flame: lit from under, the top of it lost in the dark
  const sk = fl > 0 ? '#a8602c' : '#2a1810', lt = '#ffb060', dk = '#5a2c14';
  inked(g, sk, [[206, 10], [224, 6], [236, 14], [238, 24], [242, 30], [254, 44], [248, 48], [250, 52], [246, 56], [249, 60],
    [244, 66], [242, 72], [228, 80], [212, 80], [204, 60], [202, 30]]);
  poly(g, dk, [[206, 10], [224, 6], [236, 14], [238, 24], [228, 26], [216, 22], [204, 30]]);          // the brow in shadow
  if (fl > 0) {
    poly(g, lt, [[242, 44], [252, 45], [248, 48], [240, 48]]);                                            // under the nose
    poly(g, lt, [[236, 60], [248, 60], [244, 66], [234, 66]]);                                            // the chin, the jaw
    poly(g, lt, [[214, 74], [240, 70], [228, 80], [212, 80]]);
    px(g, lt, 224, 46, 10, 2);                                                                            // the cheekbone
  }
  disc(g, dk, 211, 44, 3, 5); px(g, '#3a1a0c', 211, 42, 1, 4);                                           // the ear
  px(g, INK, 228, 28, 8, 3); px(g, '#ffd080', 233, 30, 2, 1);                                             // the eye, a glint
  poly(g, '#1a0c08', [[236, 50], [250, 50], [248, 54], [238, 54]]);                                       // moustache
  px(g, INK, 238, 56, 10, 1); px(g, '#6a2a1a', 240, 57, 7, 2);                                           // the mouth
  poly(g, '#1a1410', [[198, 4], [208, 0], [240, 0], [240, 8], [226, 6], [212, 12], [208, 30], [202, 34], [196, 20]]);   // his hair
  px(g, '#4a4050', 214, 2, 16, 1);
  inked(g, '#2a2230', [[196, 80], [236, 80], [250, h], [180, h]]);        // his collar
  // the hands, the box, the match
  inked(g, '#1a1820', [[140, 74], [168, 68], [176, 82], [148, 90]]);       // the glove holding the box
  inked(g, '#c8a048', [[150, 70], [172, 66], [174, 74], [152, 78]]); px(g, '#6a3a1a', 152, 76, 20, 2);
  inked(g, '#1a1820', [[176, 76], [192, 70], [200, 80], [184, 88]]);
  line(g, '#e8d8b0', 188, 74, 176, 52, 2);
  px(g, '#6a1810', 174, 50, 4, 3);
  if (struck > 0) {
    const fh = 9 + 4 * fl;
    poly(g, '#ff8a20', [[172, 50], [180, 50], [176 + Math.sin(t * 20), 50 - fh]]);
    poly(g, '#fff0a0', [[174, 50], [178, 50], [176 + Math.sin(t * 20) * 0.5, 50 - fh * 0.55]]);
    if (struck < 1) for (let i = 0; i < 9; i++) px(g, '#ffe080', 176 + (hash(i) - 0.5) * 30 * (1 - struck), 50 - hash(i + 4) * 24 * (1 - struck), 1, 1); // the sparks
  }
  // the jerrycan, on the floor at the far left, its spout dripping
  inked(g, '#7a1810', [[20, 70], [56, 66], [60, 90], [22, h]]); px(g, '#c8281e', 22, 72, 32, 2);
  for (let i = 0; i < 3; i++) px(g, '#c89a50', 60, 74 + ((t * 30 + i * 7) % 20), 1, 2);
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
