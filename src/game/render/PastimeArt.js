// Canvas side of the pastimes (ai/Pastimes.js): where busy hands go and the cue, cards, glass, cigarette... in them.
// Everything is in the character's own frame: +x = where he faces, +y = his right (his lips are about 4.5 ahead).
import { cueShift, sip, drag, stretch, clap, arcadeAt, laundryAt } from '../ai/Pastimes.js';
import { PALETTE } from '../Config.js';
import { lerp, smooth, bump } from '../../engine/math.js';
import { danceHands } from '../ai/Dance.js';

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
    case 'dance': return danceHands(t, seed); // her routine's (ai/Dance.js; the pole hand put on it by dancePose)
    case 'arcade': return arcadeHands(arcadeAt(t, seed));
    case 'laundry': return laundryHands(laundryAt(t, seed));
    default: return null;
  }
}

// At the cabinet (its control panel a hand's length ahead): the left hand on the ball-top stick, worked side to side,
// the right one over the four buttons, hammering; between two games a slap on the cabinet's side, the hands off it,
// a coin into its door
const STICK = { x: 10.2, y: -4.8 }, BUTTONS = { x: 10.4, y: 2.4 };
function arcadeHands(f) {
  if (f.play) {
    return { hl: { x: STICK.x + Math.abs(f.stick) * 0.3, y: STICK.y + f.stick * 0.9 }, hr: { x: BUTTONS.x + f.press * 0.7, y: BUTTONS.y + Math.sin(f.k * 90) * 0.6 } };
  }
  const slap = f.slap ? bump(f.k, 0.05, 0.25) : 0, coin = f.coin ? bump(f.k, 0.62, 0.9) : 0;
  return { hl: { x: 3.5 + slap * 1.5, y: -6 }, hr: { x: 4 + coin * 3.5 + slap * 3, y: 4 + slap * 4.5 - coin * 3.8 } };
}

// At the washer (its drum a long reach ahead, the next machine's lid at his right, his basket at his left): into the
// drum, a piece pulled out, shaken out by its shoulders, folded in two and in four, laid on the pile; the pile carried
// to the basket; his watch
const REST = { hl: { x: 4.5, y: -4.5 }, hr: { x: 4.5, y: 4.5 } };
const DRUM = { hl: { x: 12, y: -2.6 }, hr: { x: 12.5, y: 2.2 } };
const HELD = { hl: { x: 7, y: -2.4 }, hr: { x: 7, y: 2.4 } };
const PILE = { hl: { x: 9, y: 6 }, hr: { x: 9.5, y: 10 } };
const BASKET = { hl: { x: 8.5, y: -10 }, hr: { x: 9, y: -6 } };
const mixHands = (a, b, k) => ({ hl: { x: lerp(a.hl.x, b.hl.x, k), y: lerp(a.hl.y, b.hl.y, k) }, hr: { x: lerp(a.hr.x, b.hr.x, k), y: lerp(a.hr.y, b.hr.y, k) } });
function laundryHands(f) {
  const u = f.u;
  switch (f.phase) {
    case 'reach': {
      const h = mixHands(REST, DRUM, smooth(u / 0.6));
      h.hl.x += Math.sin(u * 19) * 0.6 * smooth((u - 0.5) / 0.2); // rummaging in the drum
      h.hr.y += Math.cos(u * 23) * 0.6 * smooth((u - 0.5) / 0.2);
      return h;
    }
    case 'pull': return mixHands(DRUM, HELD, smooth(u));
    case 'shake': {
      const w = smooth(u / 0.35), snap = Math.sin(u * Math.PI * 4) * 1.4 * w; // held out by its shoulders, flicked
      return { hl: { x: 7 + snap * 0.5, y: -2.4 - 5.4 * w }, hr: { x: 7 + snap * 0.5, y: 2.4 + 5.4 * w } };
    }
    case 'fold': {
      // in two, then in four: the hands meet, part a little, meet again
      const k = u < 0.5 ? bump(u, 0, 0.5) : bump(u, 0.5, 1) * 0.6, w = 7.8 - 4.8 * smooth(u * 1.6) + k * 1.2;
      return { hl: { x: 7 + k * 1.5, y: -w / 2 }, hr: { x: 7 + k * 1.5, y: w / 2 } };
    }
    case 'lay': return mixHands(HELD, PILE, bump(u, 0, 1.6));
    case 'carry': return u < 0.45 ? mixHands(HELD, PILE, smooth(u / 0.3)) : mixHands(PILE, BASKET, smooth((u - 0.45) / 0.4));
    case 'back': return mixHands(f.pile === 0 ? BASKET : PILE, REST, smooth(u)); // (none on the pile: he carried it)
    case 'watch': {
      const up = bump(u, 0, 1) > 0.25 ? 1 : bump(u, 0, 1) / 0.25; // the left wrist up before his eyes, the cuff pushed back
      return { hl: { x: 4.5 + 2 * up, y: -4.5 + 3.8 * up }, hr: { x: 4.5 + 1.2 * up, y: 4.5 - 2.5 * up } };
    }
    default: return REST;
  }
}

// how his body goes with a pastime (CharacterAnim.postPose's lean: fwd / side px, twist rad, dip), or null: bent into
// the drum, leant over to the pile or the basket; at the cabinet, leant in over the panel and swaying with the stick
const STILL = { fwd: 0, side: 0, twist: 0, dip: 0 };
export function pastimeLean(kind, t, seed) {
  if (kind === 'arcade') {
    const f = arcadeAt(t, seed);
    return f.play ? { fwd: 1.6, side: f.stick * 0.7, twist: f.stick * 0.07, dip: 0.02 } : { ...STILL, fwd: -0.8 * bump(f.k, 0.05, 0.3) };
  }
  if (kind !== 'laundry') return null;
  const f = laundryAt(t, seed), u = f.u;
  switch (f.phase) {
    case 'reach': return { fwd: 3.2 * smooth(u / 0.6), side: 0, twist: 0, dip: 0.06 * smooth(u / 0.6) };
    case 'pull': return { fwd: 3.2 * (1 - smooth(u)), side: 0, twist: 0, dip: 0.06 * (1 - smooth(u)) };
    case 'lay': { const k = bump(u, 0, 1.6); return { fwd: 0.8 * k, side: 2.4 * k, twist: 0.22 * k, dip: 0 }; }
    case 'carry': {
      const k = u < 0.45 ? smooth(u / 0.3) : 1 - 2 * smooth((u - 0.45) / 0.4);
      return { fwd: 1, side: 2.6 * k, twist: 0.3 * k, dip: 0.03 * Math.abs(k) };
    }
    case 'back': { const k = (f.pile === 0 ? -1 : 0.92) * (1 - smooth(u)); return { fwd: 0.8 * Math.abs(k), side: 2.5 * k, twist: 0.24 * k, dip: 0 }; }
    default: return STILL;
  }
}

// the pieces of washing (laundryAt `piece`): colour, crease
export const PIECES = [['#3e5c8c', '#2c4268'], ['#e8e6de', '#b8b6ae'], ['#b0303a', '#80202a'], ['#8a8c90', '#64666a'], ['#d8b048', '#a88430']];

function stick(ctx, x0, y0, x1, y1, w, color) {
  ctx.lineCap = 'butt';
  for (const [width, style] of [[w + 1.6, PALETTE.ink], [w, color]]) {
    ctx.strokeStyle = style; ctx.lineWidth = width;
    ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
  }
}

const BAGS = ['#7a4a2a', '#2c3a52', '#5a5248'];
const PROPS = new Set(['pool', 'cue', 'cards', 'count', 'drink', 'smoke', 'hood', 'phone', 'piss', 'bag', 'wipe', 'laundry']);

function box(ctx, x, y, w, h, color) {
  ctx.fillStyle = PALETTE.ink; ctx.fillRect(x - w / 2 - 0.7, y - h / 2 - 0.7, w + 1.4, h + 1.4);
  ctx.fillStyle = color; ctx.fillRect(x - w / 2, y - h / 2, w, h);
}

// a piece of washing between x0..x1 (along his facing) and y0..y1 (across), its colour and one crease
function cloth(ctx, x0, y0, x1, y1, piece, crease = 0.5) {
  const [col, dark] = PIECES[piece];
  ctx.fillStyle = PALETTE.ink; ctx.fillRect(x0 - 0.6, y0 - 0.6, x1 - x0 + 1.2, y1 - y0 + 1.2);
  ctx.fillStyle = col; ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
  ctx.fillStyle = dark; ctx.fillRect(x0, y0 + (y1 - y0) * crease - 0.25, x1 - x0, 0.5);
}

// what the man at his washing holds (laundryAt f): the piece bunched out of the drum, held out by its shoulders and
// flapping, folded smaller and smaller, the folded square; the whole pile when he carries it to his basket
function washing(ctx, h, f) {
  const mx = (h.hl.x + h.hr.x) / 2, my = (h.hl.y + h.hr.y) / 2, u = f.u;
  if (f.phase === 'pull') cloth(ctx, mx - 1, my - 2.4, mx + 2.6, my + 2.4, f.piece, 0.35);
  else if (f.phase === 'shake') cloth(ctx, mx - 0.2, h.hl.y - 0.4, mx + 1.6 + Math.abs(Math.sin(u * Math.PI * 4)) * 1.6, h.hr.y + 0.4, f.piece, 0.7);
  else if (f.phase === 'fold') cloth(ctx, mx - 0.4, h.hl.y - 0.5, mx + (u < 0.5 ? 3.6 : 3), h.hr.y + 0.5, f.piece, u < 0.5 ? 0.5 : 0.3);
  else if (f.phase === 'lay' && u < 0.75) cloth(ctx, mx - 0.6, my - 2.6, mx + 3, my + 2.6, f.piece, 0.5);
  else if (f.phase === 'carry' && u > 0.25 && u < 0.85) {
    for (let i = 0; i < 4; i++) cloth(ctx, mx - 0.8 - i * 0.25, my - 2.8, mx + 3.2 - i * 0.25, my + 2.8, (f.piece + i * 2) % PIECES.length, 0.5);
  }
}

// the thing in the hands of `ch` ({ x, y, angle, seed }; pouring: a 'piss' under way), drawn over him in world space
export function drawPastime(ctx, ch, kind, t) {
  if (!PROPS.has(kind)) return;
  const h = pastimeHands(kind, t, ch.seed);
  ctx.save();
  ctx.translate(ch.x, ch.y);
  ctx.rotate(ch.angle);
  const B = pastimeLean(kind, t, ch.seed); // his hands went with his body (Civilian.ownPose)
  if (B) { ctx.translate(B.fwd, B.side); ctx.rotate(B.twist); }
  if (kind === 'laundry') {
    washing(ctx, h, laundryAt(t, ch.seed));
  } else if (kind === 'pool') {
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
