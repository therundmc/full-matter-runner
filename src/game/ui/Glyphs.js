// Key caps and gamepad buttons drawn on screen, so a prompt shows what to press on the device in use: a key cap for
// the keyboard, a mouse with the button lit for a click, the coloured face buttons, shoulders, sticks, d-pad and
// START of a pad. Labels come from data/controls.js (keyLabel). Flat shapes in the palette, pixel font.
import { PALETTE } from '../Config.js';
import { keyLabel } from '../data/controls.js';
import { text } from './Text.js';

const FACE = { A: '#3fd46e', B: '#ff3b4a', X: '#3d8bff', Y: '#ffc72e' };
const SHOULDER = new Set(['LT', 'RT', 'LB', 'RB']);
const PILL = new Set(['START', 'BACK']);
const CAP = '#ece6f2', CAP_EDGE = '#8f84a0', DARK = '#2a2235';

const fontOf = (h) => `${Math.max(5, Math.round(h * 0.56))}px joystix, monospace`;

function roundRect(ctx, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// width of the cap of `label` at height h
export function capWidth(ctx, label, h) {
  if (FACE[label] || label === 'LS' || label === 'RS' || label === 'DPAD') return h;
  if (label === 'LMB' || label === 'RMB') return h * 0.74;
  if (SHOULDER.has(label)) return h * 1.5;
  ctx.save();
  ctx.font = fontOf(h);
  const w = ctx.measureText(label).width;
  ctx.restore();
  return Math.max(h, w + h * (PILL.has(label) ? 0.9 : 0.62));
}

// the cap of `label`, its left edge at x, centred on y, h high
export function drawCap(ctx, label, x, y, h, alpha = 1) {
  const w = capWidth(ctx, label, h), top = y - h / 2, lw = Math.max(1, h * 0.09);
  ctx.save();
  ctx.globalAlpha *= alpha;
  ctx.lineWidth = lw;
  ctx.strokeStyle = PALETTE.ink;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = fontOf(h);
  const letter = (str, col, dy = 0) => { ctx.fillStyle = col; ctx.fillText(str, x + w / 2, y + dy + h * 0.04); };
  if (FACE[label]) {
    ctx.beginPath();
    ctx.arc(x + h / 2, y, h / 2 - lw / 2, 0, Math.PI * 2);
    ctx.fillStyle = FACE[label];
    ctx.fill();
    ctx.stroke();
    letter(label, PALETTE.ink);
  } else if (label === 'LS' || label === 'RS') {
    ctx.beginPath();
    ctx.arc(x + h / 2, y, h / 2 - lw / 2, 0, Math.PI * 2);
    ctx.fillStyle = DARK;
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(x + h / 2, y, h * 0.3, 0, Math.PI * 2);
    ctx.fillStyle = CAP;
    ctx.fill();
    letter(label[0], PALETTE.ink);
  } else if (label === 'DPAD') {
    const a = h * 0.34, cx = x + h / 2;
    ctx.fillStyle = CAP;
    ctx.beginPath();
    ctx.rect(cx - a / 2, top + lw, a, h - lw * 2);
    ctx.rect(x + lw, y - a / 2, h - lw * 2, a);
    ctx.fill();
    ctx.stroke();
    ctx.fillRect(cx - a / 2 + lw / 2, y - a / 2 + lw / 2, a - lw, a - lw); // the cross's middle, without the seams
  } else if (label === 'LMB' || label === 'RMB') {
    // a mouse, the button to click lit
    roundRect(ctx, x + lw / 2, top + lw / 2, w - lw, h - lw, w * 0.48);
    ctx.fillStyle = CAP;
    ctx.fill();
    ctx.save();
    ctx.clip();
    ctx.fillStyle = PALETTE.pink;
    ctx.fillRect(label === 'LMB' ? x : x + w / 2, top, w / 2, h * 0.44);
    ctx.fillStyle = PALETTE.ink;
    ctx.fillRect(x + w / 2 - lw / 2, top, lw, h * 0.44);
    ctx.fillRect(x, top + h * 0.44 - lw / 2, w, lw);
    ctx.restore();
    roundRect(ctx, x + lw / 2, top + lw / 2, w - lw, h - lw, w * 0.48);
    ctx.stroke();
  } else if (SHOULDER.has(label)) {
    // a trigger is round on top, a bumper flat
    const trig = label[1] === 'T';
    roundRect(ctx, x + lw / 2, top + lw / 2, w - lw, h - lw, trig ? h * 0.45 : h * 0.2);
    ctx.fillStyle = trig ? CAP : '#bfb4cf';
    ctx.fill();
    ctx.stroke();
    letter(label, PALETTE.ink);
  } else {
    // a key cap (or a pad's START / BACK pill): face over a darker edge
    const r = PILL.has(label) ? h / 2 : h * 0.18;
    roundRect(ctx, x + lw / 2, top + lw / 2, w - lw, h - lw, r);
    ctx.fillStyle = CAP_EDGE;
    ctx.fill();
    ctx.stroke();
    roundRect(ctx, x + lw * 1.5, top + lw * 1.5, w - lw * 3, h - lw * 3 - h * 0.1, r * 0.8);
    ctx.fillStyle = CAP;
    ctx.fill();
    letter(label, PALETTE.ink, -h * 0.05);
  }
  ctx.restore();
  return w;
}

// a row of prompts centred on cx: [[action, words], ...], each the cap for `device` then the words; returns its width.
// opts: { color, alpha, gap (between two prompts, in h), font: words' size (default 0.62 h) }
export function drawPrompts(ctx, list, cx, y, h, device, opts = {}) {
  const { color = PALETTE.white, alpha = 1, gap = 1.6, font = 0.62 } = opts, size = h * font;
  ctx.save();
  ctx.font = `${Math.round(size)}px joystix, monospace`;
  const parts = list.map(([action, words]) => {
    const label = keyLabel(action, device), cw = capWidth(ctx, label, h), ww = words ? ctx.measureText(words).width : 0;
    return { label, words, cw, ww, w: cw + (words ? h * 0.4 + ww : 0) };
  });
  ctx.restore();
  const total = parts.reduce((s, p) => s + p.w, 0) + gap * h * (parts.length - 1);
  let x = cx - total / 2;
  for (const p of parts) {
    drawCap(ctx, p.label, x, y, h, alpha);
    if (p.words) text(ctx, p.words, x + p.cw + h * 0.4, y, size, color, { align: 'left', alpha });
    x += p.w + gap * h;
  }
  return total;
}
