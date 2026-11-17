// Title proposal C, THE NIGHT CITY (?title=c): the present title (ui/TitleScene.js) held at deep night, in its own
// pixel art and its own px, with three things added through the scene's hooks: his building burning in the slit
// between the towers, far off; THE RUNNER standing on the line, black, the fire on his edge; and the title as a neon
// sign hung between the towers, lighting letter by letter and buzzing. The menu is the present one (ui/MenuArt.js).
// A proposal: nothing here is the game's title yet (Proposals.js).
import { px, poly, oval, halo, centre, pixText } from './Draw.js';
import { hash } from './Timeline.js';
import { line } from '../cine/Ink.js';
import { drawTitleScene } from '../TitleScene.js';

export const NIGHT_AT = 31;                 // s into the day's loop (data/daycycle.js): deep night, in its drizzle

const BLOCK = { x0: 198, x1: 214, roof: 76, base: 142 };     // his building, among those far off
const MAN = { x: 150, y: 138 };                              // his feet, on the deck's near edge (Layout.js EL.rail)
const SIGN = { x: 125, y: 27, w: 18, h: 24, gap: 5 };        // RUNNER's tubes: the first letter's corner, a letter's box
const FULL = { x: 149, y: 11 };                              // FULL MATTER over it
const DARK = '#07050b', PETROL = '#17566e', TAN = '#c8905c', BROWN = '#5a3a26', FIRE = '#ff8a20', FIRE_D = '#c8381a';

// a tube letter: strokes in a box 18 x 24
const TUBES = {
  R: [[[0, 24], [0, 0], [13, 0], [17, 4], [17, 9], [13, 12], [0, 12]], [[8, 12], [17, 24]]],
  U: [[[0, 0], [0, 20], [4, 24], [13, 24], [17, 20], [17, 0]]],
  N: [[[0, 24], [0, 0], [17, 24], [17, 0]]],
  E: [[[17, 0], [0, 0], [0, 24], [17, 24]], [[0, 12], [12, 12]]],
};

let H = null;
const halos = () => H || (H = {
  fire: [halo('255,110,40', 46, 34, 3, 0.085), halo('255,110,40', 40, 30, 3, 0.085)], pink: halo('255,58,122', 15, 17, 3, 0.07),
  cyan: halo('58,216,232', 52, 10, 2, 0.06),
});
const lighter = (g, draw) => { g.save(); g.globalCompositeOperation = 'lighter'; draw(); g.restore(); };

// his building burning, far off: its glow on the haze, the block, its high windows, the flames, the smoke, embers
function fire(g, ox, oy, t) {
  const { x0, x1, roof, base } = BLOCK, n = Math.floor(t * 9), h = (i) => 0.6 + 0.7 * hash(i * 2.7 + n * 5.9), x = x0 + ox, y = roof + oy;
  lighter(g, () => centre(g, halos().fire[n % 3 ? 0 : 1], (x0 + x1) / 2 + ox, y - 2));
  for (let i = 0; i < 4; i++) {
    const k = (t * 0.07 + i / 4) % 1;
    oval(g, '#2a2238', x + 8 + 22 * k * k + Math.sin(k * 6 + i) * 2, y - 8 - 58 * k, (3 + 8 * k) * Math.min(1, (1 - k) / 0.15), (2 + 6 * k) * Math.min(1, (1 - k) / 0.15));
  }
  px(g, '#0c0912', x, y, x1 - x0, base - roof);
  for (let r = 0; r < 6; r++) {
    for (let c = 0; c < 2; c++) {
      const lit = r < 3 && hash(r * 2 + c + Math.floor(t * 5) * 3.1) > 0.15;
      px(g, lit ? FIRE : r < 3 ? FIRE_D : '#1a1424', x + 3 + c * 7, y + 5 + r * 9, 3, 4);
    }
  }
  poly(g, FIRE_D, [[x - 1, y + 1], [x + 2, y - 8 * h(0)], [x + 5, y - 2], [x + 8, y - 14 * h(1)], [x + 11, y - 3], [x + 14, y - 9 * h(2)], [x + 17, y + 1]]);
  poly(g, FIRE, [[x + 1, y + 1], [x + 3, y - 4 * h(0)], [x + 6, y - 1], [x + 8, y - 9 * h(1)], [x + 11, y - 1], [x + 13, y - 5 * h(2)], [x + 15, y + 1]]);
  for (let i = 0; i < 7; i++) {
    const k = (t * 0.22 * (0.6 + hash(i)) + hash(i + 5)) % 1;
    if (hash(i * 3 + Math.floor(t * 8)) > 0.3) px(g, k < 0.5 ? FIRE : FIRE_D, x + 2 + hash(i + 9) * 12 + k * 16, y - 8 - k * 46);
  }
}

// THE RUNNER on the line, his back to it: the cap's flat brim, the gaiter, the coat's collar up; the fire on his edge
function man(g, ox, oy) {
  const x = MAN.x + ox, y = MAN.y + oy;
  px(g, DARK, x - 3, y - 7, 2, 7); px(g, DARK, x + 1, y - 7, 2, 7);
  px(g, DARK, x - 4, y - 20, 9, 13); px(g, DARK, x - 5, y - 10, 11, 3);
  px(g, DARK, x - 5, y - 22, 2, 2); px(g, DARK, x + 3, y - 22, 2, 2);
  px(g, PETROL, x - 3, y - 23, 6, 3);
  px(g, TAN, x - 3, y - 24, 5, 1);
  px(g, BROWN, x + 2, y - 25, 2, 4);
  px(g, DARK, x - 3, y - 28, 7, 4); px(g, DARK, x - 2, y - 29, 5, 1);
  px(g, DARK, x - 9, y - 25, 6, 1); px(g, PETROL, x - 9, y - 24, 5, 1);
  px(g, PETROL, x, y - 30, 1, 1);
  px(g, FIRE_D, x + 5, y - 19, 1, 10); px(g, FIRE_D, x + 4, y - 28, 1, 3); px(g, FIRE_D, x + 3, y - 7, 1, 6);
}

// The sign, hung on a frame between the towers: FULL MATTER small in cyan, RUNNER in pink tubes. It lights letter
// by letter, then buzzes: the E fails now and then.
function sign(g, ox, oy, t) {
  const n = Math.floor(t * 13), x0 = SIGN.x + ox, y0 = SIGN.y + oy;
  for (const y of [7, 24, 55]) px(g, '#0b0912', 119 + ox, y + oy, 145, 1);                  // the frame: rails, posts
  for (let x = 121; x < 264; x += 20) px(g, '#0b0912', x + ox, 7 + oy, 1, 49);
  const fullOn = t > 0.4 && !(t < 0.8 && hash(n * 1.9) < 0.5);
  if (fullOn) lighter(g, () => centre(g, halos().cyan, FULL.x + 43 + ox, FULL.y + 5 + oy));
  pixText(g, 'FULL MATTER', FULL.x + ox, FULL.y + oy, fullOn ? '#b4f4ff' : '#16303a', 2, 2);
  [...'RUNNER'].forEach((ch, i) => {
    const start = 0.9 + i * 0.4, x = x0 + i * (SIGN.w + SIGN.gap);
    const on = t > start && !(t < start + 0.35 && hash(n * 1.3 + i) < 0.5) && !(i === 4 && Math.sin(t * 0.8) > 0.55 && hash(n * 1.7) < 0.35);
    if (on) lighter(g, () => centre(g, halos().pink, x + SIGN.w / 2, y0 + SIGN.h / 2));
    for (const s of TUBES[ch]) for (let k = 0; k + 1 < s.length; k++) line(g, on ? '#ff3a7a' : '#3a1830', x + s[k][0], y0 + s[k][1], x + s[k + 1][0], y0 + s[k + 1][1], 3);
    if (on) for (const s of TUBES[ch]) for (let k = 0; k + 1 < s.length; k++) line(g, '#ffd0e0', x + s[k][0] + 1, y0 + s[k][1] + 1, x + s[k + 1][0] + 1, y0 + s[k + 1][1] + 1, 1);
  });
}

// The scene; the menu is drawn apart, as on the present title (null: no rects of its own).
export function drawNightSign(ctx, W, Hh, t, mouse) {
  drawTitleScene(ctx, W, Hh, t, mouse, {
    hold: NIGHT_AT, far: (g, ox, oy) => fire(g, ox, oy, t), towers: (g, ox, oy) => sign(g, ox, oy, t), deck: (g, ox, oy) => man(g, ox, oy),
  });
  return null;
}
