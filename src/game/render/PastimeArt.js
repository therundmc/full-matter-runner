// Canvas side of the pastimes (ai/Pastimes.js): where busy hands go and the cue, cards, glass, cigarette... in them.
// Everything is in the character's own frame: +x = where he faces, +y = his right (his lips are about 4.5 ahead).
import { cueShift, sip, drag, stretch, clap } from '../ai/Pastimes.js';
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
    case 'count': {
      // the wad in the left hand, the right one peels a bill off and lays it down, again and again
      const k = (t * 1.8 + seed) % 1, peel = k < 0.5 ? k * 2 : 2 - k * 2;
      return { hl: { x: 7, y: -2 }, hr: { x: 7 + peel * 2, y: 0.5 + peel * 4.5 } };
    }
    case 'drink': {
      const k = sip(t, seed);
      return { hl: { x: 5, y: -5.5 }, hr: { x: 6.5 - k * 1.5, y: 4.5 - k * 3.5 } };
    }
    case 'watch': {
      const c = clap(t, seed);
      return c ? { hl: { x: 6.5, y: -0.6 - c }, hr: { x: 6.5, y: 0.6 + c } } : { hl: { x: 4.5, y: -4.5 }, hr: { x: 4.5, y: 4.5 } };
    }
    case 'smoke': {
      const k = drag(t, seed);
      return { hl: { x: 5.5, y: -6 }, hr: { x: 6.5 - k * 0.5, y: 5.5 - k * 4 } };
    }
    case 'hood': {
      // leant back on a car: the left hand flat on the hood behind his hip, the cigarette in the right
      const k = drag(t, seed);
      return { hl: { x: -7, y: -8 }, hr: { x: 5 - k * 0.5, y: 6.5 - k * 5 } };
    }
    case 'phone': return { hl: { x: 5.5, y: -6 }, hr: { x: 7, y: 1.5 } };
    case 'talk': {
      // talking with his hands
      const a = t * 4.2 + seed;
      return { hl: { x: 6 + Math.sin(a * 0.6) * 1.5, y: -5 + Math.cos(a * 0.6) }, hr: { x: 8 + Math.sin(a) * 2, y: 3.5 + Math.cos(a * 0.8) * 2.5 } };
    }
    case 'listen': return { hl: { x: 1, y: -7 }, hr: { x: 1, y: 7 } }; // hands on the hips
    case 'cross': return { hl: { x: 5.5, y: 2.2 }, hr: { x: 5.5, y: -2.2 } };
    case 'piss': {
      const j = Math.sin(t * 2 + seed) * 0.3;
      return { hl: { x: 5.5, y: -1.4 + j }, hr: { x: 5.5, y: 1.4 + j } };
    }
    case 'stretch': {
      const k = stretch(t);
      return { hl: { x: 6 - 7 * k, y: -6 - 5 * k }, hr: { x: 6 - 7 * k, y: 6 + 5 * k } };
    }
    case 'wrist': {
      const k = stretch(t) > 0.3 ? 1 : stretch(t) / 0.3;
      return { hl: { x: 6 + k, y: -6 + 4.5 * k }, hr: { x: 6, y: 6 } };
    }
    case 'wipe': {
      // a glass in the left hand, the rag going round in it; held up to the light now and then
      const u = (t / 9 + seed) % 1, up = u > 0.8 ? Math.sin((u - 0.8) * 5 * Math.PI) : 0, a = t * 9;
      return {
        hl: { x: 6.5 + up * 1.5, y: -2.5 - up * 2 },
        hr: { x: (7 + Math.cos(a) * 0.9) * (1 - up) + 5 * up, y: (-0.4 + Math.sin(a) * 0.9) * (1 - up) + 4.5 * up },
      };
    }
    case 'pockets': return { hl: { x: 0.5, y: -6.6 }, hr: { x: 0.5, y: 6.6 } };
    case 'bag': return { hl: { x: 6, y: -6 }, hr: { x: 1.5, y: 7.5 } };
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

const BAGS = ['#7a4a2a', '#2c3a52', '#5a5248'];
const PROPS = new Set(['pool', 'cue', 'cards', 'count', 'drink', 'smoke', 'hood', 'phone', 'piss', 'bag', 'wipe']);

function box(ctx, x, y, w, h, color) {
  ctx.fillStyle = PALETTE.ink; ctx.fillRect(x - w / 2 - 0.7, y - h / 2 - 0.7, w + 1.4, h + 1.4);
  ctx.fillStyle = color; ctx.fillRect(x - w / 2, y - h / 2, w, h);
}

// the thing in the hands of `ch` ({ x, y, angle, seed }; pouring: a 'piss' under way), drawn over him in world space
export function drawPastime(ctx, ch, kind, t) {
  if (!PROPS.has(kind)) return;
  const h = pastimeHands(kind, t, ch.seed);
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
  } else if (kind === 'count') {
    box(ctx, h.hl.x + 1.5, h.hl.y, 3.4, 2.4, '#5a8a4a');
    ctx.fillStyle = '#86b070'; ctx.fillRect(h.hr.x + 0.5, h.hr.y - 0.8, 2.6, 1.6);
  } else if (kind === 'smoke' || kind === 'hood') {
    // the cigarette between two fingers, its ember brighter on a drag (its smoke is the air's: systems/Smoke.js)
    const k = drag(t, ch.seed), x = h.hr.x + 1.4 - 2.4 * k, y = h.hr.y; // brought back to the lips on a drag
    ctx.fillStyle = '#e8e2d2'; ctx.fillRect(x, y - 1.6, 2.6, 1);
    ctx.fillStyle = k > 0.6 ? '#ffd27a' : PALETTE.orange; ctx.fillRect(x + 2.6, y - 1.8, 1.4, 1.4);
  } else if (kind === 'phone') {
    // a pager: its little screen lights his hand
    ctx.fillStyle = 'rgba(5,217,232,0.22)'; ctx.fillRect(h.hr.x - 2.5, h.hr.y - 3, 7, 6);
    box(ctx, h.hr.x + 1, h.hr.y, 3.6, 2.6, '#1c2430');
    ctx.fillStyle = '#bff6ff'; ctx.fillRect(h.hr.x + 0.2, h.hr.y - 0.6, 1.8, 1.2);
  } else if (kind === 'piss') {
    if (!ch.pouring) { ctx.restore(); return; }
    const w = Math.sin(t * 9 + ch.seed) * 0.5;
    ctx.strokeStyle = 'rgba(226,214,120,0.8)'; ctx.lineWidth = 1; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(7.5, 0); ctx.quadraticCurveTo(10, w, 12.5, w * 1.6); ctx.stroke();
    ctx.fillStyle = 'rgba(226,214,120,0.5)';
    ctx.fillRect(12 + Math.sin(t * 23) * 1.5, w * 1.6 + Math.cos(t * 17) * 1.5, 1, 1);
  } else if (kind === 'wipe') {
    // the glass he polishes, his rag
    const g = h.hl;
    ctx.fillStyle = PALETTE.ink; ctx.fillRect(g.x - 0.9, g.y - 2.4, 4.8, 4.8);
    ctx.fillStyle = '#dfe8ee'; ctx.fillRect(g.x - 0.2, g.y - 1.7, 3.4, 3.4);
    ctx.fillStyle = '#9fb4c0'; ctx.fillRect(g.x + 0.5, g.y - 1, 2, 2);
    box(ctx, h.hr.x + 1.2, h.hr.y, 3, 2.6, '#e6e0d0');
  } else if (kind === 'bag') {
    box(ctx, h.hr.x + 0.5, h.hr.y + 2.6, 6.5, 4.2, BAGS[Math.floor(ch.seed) % BAGS.length]);
  } else {
    // a glass: lit rim, the drink
    const x = h.hr.x + 1.5, y = h.hr.y;
    ctx.fillStyle = PALETTE.ink; ctx.fillRect(x - 2.4, y - 2.4, 4.8, 4.8);
    ctx.fillStyle = '#dfe8ee'; ctx.fillRect(x - 1.7, y - 1.7, 3.4, 3.4);
    ctx.fillStyle = '#c8842a'; ctx.fillRect(x - 1, y - 1, 2, 2);
  }
  ctx.restore();
}
