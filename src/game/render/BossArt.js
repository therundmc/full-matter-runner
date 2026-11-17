// Canvas side of a boss (entities/Boss.js): the wound of his first hit on his standing body, the hand he holds on
// it, the glint at his muzzle that tells a shot. Plain pixels at the sprites' density (half a world px), flat shades.
import { drawHand } from './LimbArt.js';

const BLOOD = ['#5a0812', '#a3101e', '#d42a34'];
const PX = 0.5; // a sprite pixel of a standing character, in pose px
// the wound: [x, y, shade] in sprite pixels round its middle; and what has run from it, toward his feet's side
const HOLE = [[0, 0, 0], [1, 0, 0], [0, 1, 0], [-1, 0, 1], [0, -1, 1], [1, 1, 1], [2, 0, 1], [-1, 1, 1], [1, -1, 2], [-1, -1, 1],
  [2, 1, 1], [0, 2, 1], [-2, 0, 1], [1, 2, 2], [-2, 1, 2]];
const RUNS = [[-3, 0], [-4, 1], [-5, 1], [-3, 2], [-6, 1], [-4, -1], [-7, 2]];

// The wound on the torso whose middle is at (bx, by), turned ta, scaled s: at = [forward, to his right] (pose px).
export function drawWound(ctx, bx, by, ta, s, at, seed = 0) {
  ctx.save();
  ctx.translate(bx, by);
  ctx.rotate(ta);
  ctx.scale(s, s);
  ctx.translate(Math.round(at[0] / PX) * PX, Math.round(at[1] / PX) * PX);
  for (const [x, y, c] of HOLE) { ctx.fillStyle = BLOOD[c]; ctx.fillRect(x * PX, y * PX, PX, PX); }
  // it soaks into the cloth and runs back over his shoulders: a few more pixels by the man
  ctx.fillStyle = BLOOD[1];
  const n = 4 + (Math.floor(seed) % 3);
  for (let i = 0; i < n; i++) { const [x, y] = RUNS[i]; ctx.fillRect(x * PX, y * PX, PX, PX); }
  ctx.restore();
}

// his hand flat on it, over the torso (the pose paints hands under the shoulders), bloodied
export function drawClutch(ctx, look, x, y, a, s) {
  drawHand(ctx, look, 'flat', -1, x, y, a, s);
  ctx.fillStyle = BLOOD[1];
  ctx.fillRect(x - PX, y, PX, PX);
  ctx.fillRect(x + PX, y - PX, PX, PX);
}

// The glint at the muzzle before a shot, k 0..1 as it comes: a four-pointed star growing, white hot on yellow.
export function drawGlint(ctx, x, y, k, t) {
  const r = 2 + 6 * k, h = 0.9;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(t * 5);
  ctx.globalAlpha = 0.55 + 0.45 * k;
  for (const [col, g] of [['#e6ff1a', 1.5], ['#fffbe8', 0.75]]) {
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.moveTo(-r * g, 0); ctx.lineTo(0, -h * g); ctx.lineTo(r * g, 0); ctx.lineTo(0, h * g);
    ctx.moveTo(0, -r * g); ctx.lineTo(h * g, 0); ctx.lineTo(0, r * g); ctx.lineTo(-h * g, 0);
    ctx.fill();
  }
  ctx.restore();
}
