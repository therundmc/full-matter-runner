// Canvas side of the pastimes (ai/Pastimes.js): where busy hands go and the cue, cards or glass in them.
// Everything is in the character's own frame: +x = where he faces, +y = his right.
import { cueShift, sip } from '../ai/Pastimes.js';
import { PALETTE } from '../Config.js';

// line of a pool cue: from the back hand, under the chin, to the bridge hand on the table
const CUE = { x: -2, y: 4.5, dx: 0.97, dy: -0.243, wood: '#d8b070', butt: '#4a2a1a' };

// hand positions { hl, hr } for a pastime, or null when it has none
export function pastimeHands(kind, t, seed) {
  switch (kind) {
    case 'pool': {
      const s = cueShift(t, seed);
      return { hl: { x: 11, y: 1.3 }, hr: { x: CUE.x + CUE.dx * s, y: CUE.y + CUE.dy * s } };
    }
    case 'cue': return { hl: { x: 2, y: -7 }, hr: { x: 5, y: 5 } };
    case 'cards': return { hl: { x: 6.5, y: -2.2 }, hr: { x: 6.5, y: 2.2 } };
    case 'drink': {
      const k = sip(t, seed);
      return { hl: { x: 5, y: -5.5 }, hr: { x: 6.5 - k * 1.5, y: 4.5 - k * 3.5 } };
    }
    case 'watch': return { hl: { x: 4.5, y: -4.5 }, hr: { x: 4.5, y: 4.5 } };
    case 'dance': {
      const a = t * 3.1 + seed;
      return { hl: { x: 2 + Math.sin(a) * 5, y: -8 + Math.cos(a) * 1.5 }, hr: { x: 2 - Math.sin(a) * 5, y: 8 - Math.cos(a * 0.7) * 1.5 } };
    }
    default: return null;
  }
}

function stick(ctx, x0, y0, x1, y1, w, color) {
  ctx.lineCap = 'butt';
  for (const [width, style] of [[w + 1.6, PALETTE.ink], [w, color]]) {
    ctx.strokeStyle = style; ctx.lineWidth = width;
    ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
  }
}

// the thing in the hands of `ch` ({ x, y, angle, seed }), drawn over him in world space
export function drawPastime(ctx, ch, kind, t) {
  const h = pastimeHands(kind, t, ch.seed);
  if (!h || kind === 'watch' || kind === 'dance') return;
  ctx.save();
  ctx.translate(ch.x, ch.y);
  ctx.rotate(ch.angle);
  if (kind === 'pool') {
    const { x, y } = h.hr;
    stick(ctx, x - CUE.dx * 6, y - CUE.dy * 6, x + CUE.dx * 40, y + CUE.dy * 40, 1.2, CUE.wood);
    stick(ctx, x - CUE.dx * 6, y - CUE.dy * 6, x + CUE.dx * 6, y + CUE.dy * 6, 1.6, CUE.butt);
  } else if (kind === 'cue') {
    // held upright, its butt on the floor: a short stick from above
    stick(ctx, h.hr.x - 1, h.hr.y + 1.5, h.hr.x + 4, h.hr.y - 0.5, 1.4, CUE.wood);
  } else if (kind === 'cards') {
    for (const k of [-1, 0, 1]) {
      ctx.save();
      ctx.translate(8.5, k * 2.4);
      ctx.rotate(k * 0.3);
      ctx.fillStyle = PALETTE.ink; ctx.fillRect(-2.2, -1.7, 4.4, 3.4);
      ctx.fillStyle = '#f0ece0'; ctx.fillRect(-1.5, -1, 3, 2);
      ctx.restore();
    }
  } else {
    // a glass: lit rim, the drink
    const x = h.hr.x + 1.5, y = h.hr.y;
    ctx.fillStyle = PALETTE.ink; ctx.fillRect(x - 2.4, y - 2.4, 4.8, 4.8);
    ctx.fillStyle = '#dfe8ee'; ctx.fillRect(x - 1.7, y - 1.7, 3.4, 3.4);
    ctx.fillStyle = '#c8842a'; ctx.fillRect(x - 1, y - 1, 2, 2);
  }
  ctx.restore();
}
