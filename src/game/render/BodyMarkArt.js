// The marks a wound leaves on a body (fx/BodyMarks.js), painted in the frame of the part that carries them: origin
// at the part's centre, world px. Pixel art at the bodies' density: everything sits on half world px.
import { PALETTE } from '../Config.js';

const DRIED = '#5c0a0c', DEEP = '#1c0408';
const px = (v) => Math.round(v * 2) / 2;

// cloth soaked round a wound: a blunt cross of two rectangles, h its half-size
function stain(ctx, h) {
  const k = Math.max(0.5, px(h * 0.6));
  ctx.fillRect(-h, -k, h * 2, k * 2);
  ctx.fillRect(-k, -h, k * 2, h * 2);
}

export function drawMark(ctx, m) {
  const B = PALETTE.blood, h = Math.max(1, px(m.size / 2)), [j0, j1, j2] = m.j;
  ctx.save();
  ctx.translate(px(m.x), px(m.y));
  if (m.kind === 'hole') {
    ctx.fillStyle = DRIED;
    stain(ctx, h);
    ctx.fillRect(px(j0 * h * 0.5) - 0.5, 0, 1, px(h + 1 + j1 * 2)); // a run of blood
    ctx.fillStyle = B[1];
    ctx.fillRect(-1, -1, 2, 2);
    ctx.fillStyle = DEEP;
    ctx.fillRect(-0.5, -0.5, 1, 1);
  } else if (m.kind === 'cut') {
    ctx.rotate(m.a);
    ctx.fillStyle = DRIED;
    ctx.fillRect(-h, -1, h * 2, 2);
    ctx.fillRect(px(j0 * h * 0.7), 1, 1, px(1 + j1 * 2));
    ctx.fillRect(px(j2 * h * 0.7), 1, 1, 1);
    ctx.fillStyle = B[4];
    ctx.fillRect(-h + 1, -0.5, h * 2 - 2, 1);
  } else if (m.kind === 'gash') {
    ctx.fillStyle = DRIED;
    stain(ctx, h);
    ctx.fillRect(px(j0 * h * 0.5) - 0.5, 0, 1, px(h + 1 + j1 * 1.5));
    ctx.rotate(m.a);
    ctx.fillStyle = DEEP;
    ctx.fillRect(-1.5, -0.5, 3, 1);
  } else {
    ctx.rotate(m.a);
    ctx.fillStyle = B[0];
    ctx.fillRect(-h, -px(h * 0.55), h * 2, px(h * 0.55) * 2);
    ctx.fillRect(px(j0 * h) - 0.5, px(h * 0.55), 1, 1);
    ctx.fillRect(px(j2 * h) - 0.5, -px(h * 0.55) - 1, 1, 1);
    ctx.fillStyle = B[3];
    ctx.fillRect(-px(h * 0.5), -0.5, px(h * 0.5) * 2, 1); // the split skin
  }
  ctx.restore();
}
