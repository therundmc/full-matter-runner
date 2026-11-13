import { PALETTE } from '../Config.js';

// joystix text with ink outline + drop shadow, optional wobble rotation
export function text(ctx, str, x, y, size, color = '#fff', opts = {}) {
  const { align = 'center', rot = 0, alpha = 1, shadow = PALETTE.ink, outline = true, baseline = 'middle' } = opts;
  ctx.save();
  ctx.globalAlpha *= alpha;
  ctx.translate(x, y);
  if (rot) ctx.rotate(rot);
  ctx.font = `${Math.round(size)}px joystix, monospace`;
  ctx.textAlign = align;
  ctx.textBaseline = baseline;
  if (shadow) {
    ctx.fillStyle = shadow;
    ctx.fillText(str, size * 0.09, size * 0.11);
  }
  if (outline) {
    ctx.strokeStyle = PALETTE.ink;
    ctx.lineWidth = Math.max(2, size * 0.16);
    ctx.lineJoin = 'round';
    ctx.strokeText(str, 0, 0);
  }
  ctx.fillStyle = color;
  ctx.fillText(str, 0, 0);
  ctx.restore();
}

// 12400 -> '12 400'
export const thousands = (n) => String(n).replace(/\B(?=(\d{3})+$)/g, ' ');

// colour oscillating between hot pink and cyan
export function neon(t, speed = 2) {
  const k = (Math.sin(t * speed) + 1) / 2;
  const a = [255, 42, 109], b = [5, 217, 232];
  return `rgb(${Math.round(a[0] + (b[0] - a[0]) * k)},${Math.round(a[1] + (b[1] - a[1]) * k)},${Math.round(a[2] + (b[2] - a[2]) * k)})`;
}

// chromatic split title text
export function glitchText(ctx, str, x, y, size, t, opts = {}) {
  const off = size * 0.06 * (1 + Math.sin(t * 13) * 0.5 * (Math.sin(t * 2.3) > 0.85 ? 4 : 1));
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  text(ctx, str, x - off, y, size, PALETTE.cyan, { ...opts, shadow: null, outline: false, alpha: 0.8 });
  text(ctx, str, x + off, y, size, PALETTE.pink, { ...opts, shadow: null, outline: false, alpha: 0.8 });
  ctx.restore();
  text(ctx, str, x, y, size, opts.color || PALETTE.white, opts);
}
