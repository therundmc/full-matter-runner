// The comics' panels (the opening, the leap's card, a level's closing page): a black frame with a white gutter and a
// hard shadow round each, the caption boxes and the balloons. Inside, the stills drawn by tools/generate_comic.py
// (finer than the title) with what still moves in them, pixel art in the stills' px: flat colours, never a gradient
// or a dither (the user wants plain pixel art). Each painter gets the context clipped to its panel and translated to
// its top-left corner, its size, and t (s) for what still moves in it.
import { spriteOpt } from '../../../engine/Assets.js';
import { clamp, lerp, hash, px, tone, poly, disc, line } from './Ink.js';

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

// ---------------------------------------------------------------- the stills
// The comic stills are painted by tools/generate_comic.py (sprites comic/*, SC panel px per title px): here they are
// put in their frame and given what moves (a tube failing, rain, smoke, the match's flame, the fire under his door),
// drawn in the stills' own px, flat and never doubled. still / fine / smoke serve the other comic pages too
// (ui/cine/Leap.js, ui/cine/Ending.js).
const SC = 3;
const FLAME = [548, 200];   // the match's head in comic/match (tools/comic/panels/opening3.py FLAME)
const PANE = [360, 8, 590, 132];         // his bedroom window in comic/sleep (tools/comic/panels/opening1.py PANE)
const COLON = [172, 154, 5, 12];         // the clock's colon there (opening1.py CLOCK)
const DOORWAY = [670, 0, 240, 196];      // the doorway in comic/door, x, y, w, h (opening1.py DOORWAY)
const NEON = [374, 84, 88, 24];           // the bar's pink sign in that window (poster.window): it buzzes
const LOCK = [634, 134];                 // the burst of his lock in comic/door (opening1.py): splinters fly from it
const BEAM = [[643, 85], [385, 286]];    // the torch's beam there, from the lens to the floor
const SPLASH = [518, 182];               // where the petrol lands in comic/pour (opening2.py)
const PUPIL = [268, 174];                // his pupil in comic/wake (opening3.py)
const GAP = [150, 410, 236];             // the gap under his door in comic/fire (opening3.py GAP)

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
// smoke going up from (x, y) (stills' px): flat puffs that grow as they rise and thin out, one after the other
export function smoke(g, x, y, t, col = '#8a8494', rise = 90) {
  for (let i = 0; i < 4; i++) {
    const k = (t * 0.4 + i / 4) % 1;
    disc(g, col, x + Math.sin(k * 5 + i * 2.1) * 12 * k, y - k * rise, 2 + 9 * k, 2 + 7 * k, 0.85 * (1 - k));
  }
}
// a glint on something that shines: a small cross that opens and shuts (k 0..1)
function glint(g, x, y, k, col = '#fff8e0') {
  const l = Math.round(7 * Math.sin(k * Math.PI));
  px(g, col, x - l, y - 1, l * 2 + 2, 2);
  px(g, col, x - 1, y - l, 2, l * 2 + 2);
}
// rain streaking down a window (stills' px): [x0, y0, x1, y1] its glass
function rain(g, [x0, y0, x1, y1], t, n = 24) {
  g.save();
  g.beginPath();
  g.rect(x0, y0, x1 - x0, y1 - y0);
  g.clip();
  for (let i = 0; i < n; i++) {
    const u = (t * (0.9 + hash(i) * 0.6) + hash(i + 1)) % 1, x = x0 + hash(i + 2) * (x1 - x0) - u * 12, y = y0 - 20 + u * (y1 - y0 + 40);
    line(g, i % 3 ? '#2a2450' : '#5a4a8a', x, y, x - 3, y + 10 + hash(i + 3) * 8, 2);
  }
  g.restore();
}

// ================================================================ page 1: his last night
// 1. His bedroom: he sleeps, his suitcase packed by the door; the rain on the window, the clock's colon blinking.
export function paintSleep(g, w, h, t) {
  still(g, 'sleep', w, h);
  fine(g, () => {
    if (hash(Math.floor(t * 12)) < 0.1 || (t % 5.3) < 0.12) px(g, '#1e0e38', ...NEON);   // the sign buzzes
    rain(g, PANE, t);
    if (t % 1 > 0.5) px(g, '#1a0608', ...COLON);
  });
}

// 2. From the dark of his flat: his front door forced, the three of them (LUCKY, CUEBALL, JITTERS) cut out against
// the landing's tube light, their shadows long across his floor. The tube fails now and then.
export function paintDoor(g, w, h, t) {
  still(g, 'door', w, h);
  fine(g, () => {
    // dust in the torch's beam (not over the sofa, which stands in front of it)
    const [[bx, by], [ex, ey]] = BEAM;
    for (let i = 0; i < 14; i++) {
      const u = (hash(i) + t * 0.04 * (0.5 + hash(i + 7))) % 1, x = lerp(bx, ex, u) + (hash(i + 3) - 0.5) * 120 * u, y = lerp(by, ey, u) + Math.sin(t + i) * 3;
      if (!(x > 210 && x < 514 && y > 142 && y < 222)) px(g, '#8a7ab8', x, y, 2, 2);
    }
    // the lock goes: splinters thrown out of it, falling
    const k = (t - 0.8) / 0.7;
    if (k > 0 && k < 1) {
      for (let i = 0; i < 9; i++) {
        const a = hash(i + 20) * Math.PI * 2, d = (30 + 70 * hash(i + 30)) * k;
        px(g, '#f2e8d2', LOCK[0] + Math.cos(a) * d, LOCK[1] + Math.sin(a) * d * 0.7 + 60 * k * k, i % 2 ? 5 : 3, 2);
      }
    }
    if ((t * 2.3) % 1 < 0.05) tone(g, '#06141a', ...DOORWAY, 0.6);
  });
}

// ================================================================ page 2: what they came for
// 1. From above: CUEBALL prising up a board with the crowbar; dust in the torch's light.
export function paintPry(g, w, h, t) {
  const k = clamp((t - 0.6) / 0.3, 0, 1), jolt = k > 0 && k < 1 ? Math.round((hash(Math.floor(t * 40)) - 0.5) * 4) : 0;   // the board gives
  g.save();
  g.translate(jolt / SC, -Math.abs(jolt) / SC);
  still(g, 'pry', w, h);
  fine(g, () => {
    for (let i = 0; i < 10; i++) px(g, '#d8d0f0', 40 + ((hash(i) * 140 + t * 9 * (0.5 + hash(i + 3))) % 160), 150 + hash(i + 2) * 70 - t * 4, 2, 2);
  });
  g.restore();
}

// 2. The tin box open in the hole, his six years in it, the three of them leaning in round it: the bricks glint.
export function paintBox(g, w, h, t) {
  still(g, 'box', w, h);
  fine(g, () => {
    for (let i = 0; i < 8; i++) {
      const k = ((t + i * 0.37) % 2.6) / 0.35, r = i >> 1, c = i & 1;
      if (k < 1) glint(g, 112 + c * 54 + (r % 2) * 2, 114 + r * 30, k);
    }
  });
}

// 3. Every brick laid out in rows, LUCKY standing over them; a few loose notes still coming down, turning.
export function paintCount(g, w, h, t) {
  still(g, 'count', w, h);
  fine(g, () => {
    for (let i = 0; i < 4; i++) {
      const y = ((t * 34 * (0.7 + 0.5 * hash(i + 2)) + hash(i + 5) * 330) % 330) - 24, x = 50 + hash(i) * 250 + Math.sin(t * 1.3 + i * 2) * 16;
      const ww = Math.round(Math.abs(Math.cos(t * 2.6 + i * 1.7)) * 22) + 2;
      px(g, '#f2e8d2', x - ww / 2, y, ww, 10);
      if (ww > 9) px(g, '#8a1d5c', x - 2, y, 4, 10);
    }
  });
}

// 4. JITTERS tipping the jerrycan over the sofa against the window's neon, CUEBALL over him; the petrol running.
export function paintPour(g, w, h, t) {
  still(g, 'pour', w, h);
  fine(g, () => {
    for (let i = 0; i < 4; i++) {
      const k = (t * 1.8 + i / 4) % 1;
      px(g, '#fff8e0', 540 - k * 22, 122 + k * 58, 2, 4);
    }
    // where it lands: drops thrown up, and rings going out over the stain
    const [sx, sy] = SPLASH;
    for (let i = 0; i < 5; i++) {
      const k = (t * 2.1 + i / 5) % 1;
      px(g, '#fff8e0', sx + (i - 2) * 9 * k, sy - Math.sin(k * Math.PI) * 16, 2, 2);
    }
    const rings = [0, 1].map((r) => (t * 0.6 + r / 2) % 1).sort((a, b) => b - a);            // the widest first
    for (const k of rings) {
      disc(g, '#3d2a6a', sx - 2, sy + 6, 8 + 36 * k, 2 + 8 * k);
      disc(g, '#0a070c', sx - 2, sy + 6, 5 + 36 * k, 1 + 7 * k);
    }
  });
}

// ================================================================ page 3: no loose ends
// 1. Close: LUCKY, his pink bat on his shoulder, strikes a match (struck 0..1: how far into the strike); before it, the dark.
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

// 2. His door from inside his room: the fire comes through under it, its tongues licking up from the gap, its light
// breathing on the boards.
export function paintFire(g, w, h, t) {
  still(g, 'fire', w, h);
  const [x0, x1, y] = GAP, n = 8;
  const tongue = (i, k) => {
    const x = x0 + 16 + i * ((x1 - x0 - 32) / (n - 1)), f = 12 + 26 * (0.5 + 0.5 * Math.sin(t * (9 + i * 1.7) + i * 2.1));
    return [[x - 12 * k, y + 2], [x + 12 * k, y + 2], [x + 4 * k + Math.sin(t * 13 + i) * 3, y - f * k * 0.5], [x + Math.sin(t * 11 + i * 3) * 5, y - f * k]];
  };
  fine(g, () => {
    if (Math.sin(t * 9) * Math.sin(t * 3.7) > 0.55) tone(g, '#120608', 0, y, w * SC, h * SC - y, 0.3);
    for (let i = 0; i < n; i++) poly(g, '#ff8a20', tongue(i, 1));
    for (let i = 0; i < n; i++) poly(g, '#fff0a0', tongue(i, 0.5));
    for (let i = 0; i < 12; i++) {                                      // embers going up off it
      const k = (t * 0.45 * (0.6 + hash(i)) + hash(i + 3)) % 1;
      if (k < 0.85) px(g, i % 3 ? '#ff8a20' : '#fff0a0', x0 + hash(i + 9) * (x1 - x0) + Math.sin(t * 2 + i) * 9, y - 6 - k * 170, 3, 3);
    }
  });
}

// 3. His eye, as large as the panel, the fire's light breathing on it: it opens (open).
export function paintWake(g, w, h, t, open = false) {
  still(g, open ? 'wake' : 'wake_shut', w, h);
  fine(g, () => {
    if (open) {                                                         // the fire, alive in his pupil
      const [cx, cy] = PUPIL, f = (i) => 12 + 12 * (0.5 + 0.5 * Math.sin(t * (9 + i * 2.3) + i * 1.9));
      disc(g, '#0a070c', cx, cy, 21, 21);
      poly(g, '#ff8a20', [[cx - 13, cy + 11], [cx - 7, cy + 11 - f(0)], [cx - 1, cy + 2], [cx + 6, cy + 5 - f(1)], [cx + 14, cy + 11]]);
      poly(g, '#fff0a0', [[cx - 5, cy + 11], [cx + 2, cy + 11 - f(2) * 0.5], [cx + 8, cy + 11]]);
    }
    if (Math.sin(t * 8) * Math.sin(t * 2.9) > 0.6) tone(g, '#0a0408', 0, 0, w * SC, h * SC, 0.2);
  });
}
