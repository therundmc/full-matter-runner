// The marks a wound leaves on a body (fx/BodyMarks.js), painted in the frame of the part that carries them: origin
// at the part's centre, world px. Pixel art at the bodies' own pixel size (one world px): every mark sits on the
// part's pixel grid, whose lines run through the centre of a part an even number of px wide and half a px off it
// otherwise (grid: that offset, 0 or 0.5).
import { PALETTE } from '../Config.js';

const DRIED = '#5c0a0c', DEEP = '#1c0408';
const whole = (v) => Math.max(1, Math.round(v));

// cloth soaked round a wound: a blunt cross of two rectangles, h its half-size
function stain(ctx, h) {
  const k = whole(h * 0.6);
  ctx.fillRect(-h, -k, h * 2, k * 2);
  ctx.fillRect(-k, -h, k * 2, h * 2);
}

export function drawMark(ctx, m, grid = 0) {
  const B = PALETTE.blood, h = whole(m.size / 2), [j0, j1, j2] = m.j;
  ctx.save();
  ctx.translate(Math.round(m.x - grid) + grid, Math.round(m.y - grid) + grid);
  if (m.kind === 'hole') {
    ctx.fillStyle = DRIED;
    stain(ctx, h);
    ctx.fillRect(Math.round(j0 * h * 0.5), 0, 1, h + 1 + Math.round(j1 * 2)); // a run of blood
    ctx.fillStyle = B[1];
    ctx.fillRect(-1, -1, 2, 2);
    ctx.fillStyle = DEEP;
    ctx.fillRect(-1, -1, 1, 1);
  } else if (m.kind === 'cut') {
    ctx.rotate(m.a);
    ctx.fillStyle = DRIED;
    ctx.fillRect(-h, -1, h * 2, 2);
    ctx.fillRect(Math.round(j0 * h * 0.7), 1, 1, 1 + Math.round(j1 * 2));
    ctx.fillRect(Math.round(j2 * h * 0.7), 1, 1, 1);
    ctx.fillStyle = B[4];
    ctx.fillRect(-h + 1, -1, h * 2 - 2, 1);
  } else if (m.kind === 'gash') {
    ctx.fillStyle = DRIED;
    stain(ctx, h);
    ctx.fillRect(Math.round(j0 * h * 0.5), 0, 1, h + 1 + Math.round(j1 * 1.5));
    ctx.fillStyle = DEEP;
    ctx.fillRect(-1, -1, 3, 1);
  } else {
    const k = whole(h * 0.55);
    ctx.rotate(m.a);
    ctx.fillStyle = B[0];
    ctx.fillRect(-h, -k, h * 2, k * 2);
    ctx.fillRect(Math.round(j0 * h), k, 1, 1);
    ctx.fillRect(Math.round(j2 * h), -k - 1, 1, 1);
    ctx.fillStyle = B[3];
    ctx.fillRect(-k, -1, k * 2, 1); // the split skin
  }
  ctx.restore();
}
