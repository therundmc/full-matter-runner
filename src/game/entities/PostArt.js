// Canvas side of a guard's life at his post (data/posts.js, ai/Pastimes.js GESTURES): what is in his hands for each
// gesture (a cigar and its ember, a bottle pouring, a glass slid along the counter, a magazine on his knee, a card
// flying round the table...), drawn over him in his torso's frame (+x ahead, +y his right). The pastimes he shares
// with the customers are drawn by render/PastimeArt.js. Small objects lying about (the ashtray on the boss's desk)
// come from tools/generate_assets.py (`items/`), drawn in code when the sprite is missing.
import { PALETTE } from '../Config.js';
import { spriteOpt } from '../../engine/Assets.js';
import { clamp, lerp } from '../../engine/math.js';
import { DEAL, dealAngle, drawn, pageTurn, drag, exhale, MATCH_FALLS, TOSSED } from '../ai/Pastimes.js';

const ease = (k) => { k = clamp(k, 0, 1); return k * k * (3 - 2 * k); };
const CHIPS = ['#d8202a', '#2a62d8', '#f0ece0', '#1f8a3a'];

function rect(ctx, x, y, w, h, color, ink = true) {
  if (ink) { ctx.fillStyle = PALETTE.ink; ctx.fillRect(x - w / 2 - 0.7, y - h / 2 - 0.7, w + 1.4, h + 1.4); }
  ctx.fillStyle = color; ctx.fillRect(x - w / 2, y - h / 2, w, h);
}

// a lit smoke held at (x, y) pointing along a: paper (or leaf) and its ember, glowing g 0..1
function smoke(ctx, x, y, a, len, thick, paper, g) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(a);
  ctx.fillStyle = PALETTE.ink; ctx.fillRect(-0.6, -thick / 2 - 0.5, len + 1.6, thick + 1);
  ctx.fillStyle = paper; ctx.fillRect(0, -thick / 2, len, thick);
  ctx.fillStyle = g > 0.6 ? '#ffe0a0' : g > 0.2 ? '#ff9a3a' : '#c8502a';
  ctx.fillRect(len, -thick / 2, 1.2, thick);
  ctx.restore();
}

function glass(ctx, x, y, a = 1) {
  ctx.globalAlpha *= a;
  ctx.fillStyle = PALETTE.ink; ctx.fillRect(x - 2.4, y - 2.4, 4.8, 4.8);
  ctx.fillStyle = '#dfe8ee'; ctx.fillRect(x - 1.7, y - 1.7, 3.4, 3.4);
  ctx.fillStyle = '#c8842a'; ctx.fillRect(x - 1, y - 1, 2, 2);
  ctx.globalAlpha /= a;
}

function card(ctx, x, y, a) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(a);
  ctx.fillStyle = PALETTE.ink; ctx.fillRect(-2.2, -1.6, 4.4, 3.2);
  ctx.fillStyle = '#c83040'; ctx.fillRect(-1.5, -0.9, 3, 1.8);
  ctx.restore();
}

function wad(ctx, x, y, band) {
  rect(ctx, x, y, 3.6, 2.4, '#5a8a4a');
  ctx.fillStyle = '#86b070'; ctx.fillRect(x - 1.8, y - 1.2, 3.6, 0.8);
  if (band) { ctx.fillStyle = '#d8402a'; ctx.fillRect(x - 0.4, y - 1.3, 0.9, 2.6); }
}

// the open magazine on his knee: two pages, a picture, lines of print; a page lifted over when f > 0
function magazine(ctx, x, y, f) {
  rect(ctx, x, y, 6, 8, '#ece6d6');
  ctx.fillStyle = '#c8b8a0'; ctx.fillRect(x - 0.2, y - 4, 0.5, 8);
  ctx.fillStyle = '#d0507a'; ctx.fillRect(x - 2.6, y - 3.3, 2.2, 3);  // a glossy picture
  ctx.fillStyle = '#4a7ab0'; ctx.fillRect(x + 0.7, y + 0.6, 2, 2.6);
  ctx.fillStyle = '#8a8478';
  for (const ly of [1, 2.4]) ctx.fillRect(x - 2.6, y + ly, 2.2, 0.5);
  for (const ly of [-3, -1.8, -0.6]) ctx.fillRect(x + 0.7, y + ly, 2.2, 0.5);
  if (f > 0) {
    const w = 3 * Math.cos(Math.PI * f);
    ctx.fillStyle = PALETTE.ink; ctx.fillRect(x + Math.min(0, w) - 0.5, y - 4.4, Math.abs(w) + 1, 8.8);
    ctx.fillStyle = '#f6f2e8'; ctx.fillRect(x + Math.min(0, w), y - 4, Math.abs(w), 8);
  }
}

// a matchbox held at (x, y): the yellow box, its brown striking strip along one side
function matchbox(ctx, x, y) {
  rect(ctx, x, y, 3.6, 2.4, '#d8a838');
  ctx.fillStyle = '#6a3a1e'; ctx.fillRect(x - 1.8, y + 0.6, 3.6, 0.6);
  ctx.fillStyle = '#c8302a'; ctx.fillRect(x - 0.6, y - 0.8, 1.2, 1);
}

// a match held at (x, y) pointing along a, its red head; burning (f > 0: how big the flame, flickering with t)
function match(ctx, x, y, a, f, t) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(a);
  ctx.fillStyle = PALETTE.ink; ctx.fillRect(-0.5, -0.9, 4.2, 1.8);
  ctx.fillStyle = '#e0c890'; ctx.fillRect(0, -0.4, 2.8, 0.8);
  ctx.fillStyle = f > 0 ? '#3a2418' : '#c83020'; ctx.fillRect(2.8, -0.6, 1, 1.2);
  ctx.restore();
  if (f > 0) flame(ctx, x + Math.cos(a) * 3.9, y + Math.sin(a) * 3.9, f, t);
}

// a small flame at (x, y), size f (1: a match burning quietly, 2: its flare as it takes)
function flame(ctx, x, y, f, t) {
  const j = Math.sin(t * 41) * 0.3 + Math.sin(t * 23) * 0.25, r = 2.6 * f;
  ctx.fillStyle = 'rgba(255,170,70,0.3)'; ctx.fillRect(x - r, y - r, r * 2, r * 2);
  ctx.fillStyle = '#ff9a3a'; ctx.fillRect(x - 0.9 * f + j * 0.3, y - 0.9 * f, 1.8 * f, 1.8 * f);
  ctx.fillStyle = '#ffe08a'; ctx.fillRect(x - 0.55 * f + j * 0.4, y - 0.55 * f, 1.1 * f, 1.1 * f);
  ctx.fillStyle = '#fffbe6'; ctx.fillRect(x - 0.3, y - 0.3, 0.6, 0.6);
}

// a cigarette between the fingers at (x, y): its ember brighter on a drag (d), a thread of smoke going up and, after a
// drag, the breath let out at the lips (e: 0..1 through it, -1 none)
function cig(ctx, x, y, d, e, t, seed) {
  smoke(ctx, x, y, 0, 2.6, 1, '#e8e2d2', d);
  const u = (t * 0.6 + seed) % 1;
  ctx.fillStyle = `rgba(200,200,210,${(0.3 * (1 - u)).toFixed(3)})`;
  ctx.fillRect(x + 3 + u * 9, y - 1 + Math.sin(u * 6) * 2, 2 + u * 3, 2 + u * 3);
  if (e < 0) return;
  ctx.fillStyle = `rgba(205,205,215,${(0.32 * (1 - e)).toFixed(3)})`;
  for (let i = 0; i < 3; i++) {
    const sz = 2 + e * (4 + i * 2);
    ctx.fillRect(6 + e * (10 + i * 5) - sz / 2, Math.sin(e * 5 + i * 2) * (1 + i) - sz / 2, sz, sz);
  }
}

// what is in his hands at gesture g (time k of the phase, pt s into it, t the world's time), drawn at anchor A
// ({ x, y, angle, s, side }: his torso, side -1 when the gesture is played mirrored), h: the gesture's hands
export function drawPost(ctx, A, g, k, pt, t, h, opts = {}) {
  ctx.save();
  ctx.translate(A.x, A.y);
  ctx.rotate(A.angle);
  ctx.scale(A.s, A.s * A.side);
  const { hl, hr } = h;
  switch (g) {
    case 'light': {
      // the cigarette at the lips, the flame cupped between both hands, flickering
      smoke(ctx, 4.5, 0.3, 0, 2.6, 1, '#e8e2d2', 0.3);
      const f = Math.sin(t * 40) * 0.4 + Math.sin(t * 23) * 0.3;
      ctx.fillStyle = 'rgba(255,190,90,0.35)'; ctx.fillRect(4, -2.6, 5, 5.2);
      ctx.fillStyle = '#ffd27a'; ctx.fillRect(7 + f * 0.3, -0.7, 1.4, 1.4 + f * 0.4);
      ctx.fillStyle = '#fff6cf'; ctx.fillRect(7.3, -0.3, 0.8, 0.8);
      break;
    }
    case 'flick': if (k < 0.5) smoke(ctx, hr.x + 0.6, hr.y - 1.1, 0.2, 2.6, 1, '#e8e2d2', 0); break;
    case 'ash': smoke(ctx, hr.x + 0.6, hr.y - 1.1, 0, 2.6, 1, '#e8e2d2', 0); break;
    case 'wrist': {
      // the face of his watch catching the light on the left wrist
      ctx.fillStyle = PALETTE.ink; ctx.fillRect(hl.x - 2.6, hl.y - 1.2, 2, 2.4);
      ctx.fillStyle = Math.sin(t * 3) > 0.6 ? '#fff6cf' : '#d8c070'; ctx.fillRect(hl.x - 2.2, hl.y - 0.8, 1.2, 1.6);
      break;
    }
    case 'fetch': if (k > 0.5) bottle(ctx, hr.x + 1, hr.y, 0); break;
    case 'pour': {
      // the bottle tipped over the glass held in the other hand, a thread of drink between them
      const tip = Math.min(1, k * 4) * (1 - ease((k - 0.85) / 0.15));
      glass(ctx, hl.x + 1, hl.y);
      bottle(ctx, hr.x + 1, hr.y, -1.2 * tip);
      if (tip > 0.6) {
        ctx.strokeStyle = 'rgba(200,132,42,0.85)'; ctx.lineWidth = 0.8;
        ctx.beginPath(); ctx.moveTo(hr.x + 1.5, hr.y - 3.5); ctx.lineTo(hl.x + 1, hl.y); ctx.stroke();
      }
      break;
    }
    case 'serve': {
      // pushed along the counter, let go, it slides on alone and stops in front of the customer
      const go = ease((k - 0.42) / 0.45);
      glass(ctx, k < 0.42 ? hr.x + 1.5 : 14 + 8 * go, k < 0.42 ? hr.y : 1.5 - 1.5 * go, 1 - ease((k - 0.88) / 0.12));
      break;
    }
    case 'rag': rect(ctx, hr.x + 0.5, hr.y, 3.4, 2.8, '#e6e0d0'); break;
    case 'chalk': {
      // the cue held upright, the blue cube of chalk twisted on its tip
      ctx.fillStyle = PALETTE.ink; ctx.fillRect(hr.x - 1.6, hr.y - 3.3, 3.2, 4.6);
      ctx.fillStyle = '#d8b070'; ctx.fillRect(hr.x - 0.8, hr.y - 2.5, 1.6, 3);
      ctx.fillStyle = '#3a8ad8'; ctx.fillRect(hl.x - 0.9, hl.y - 0.9, 1.8, 1.8);
      break;
    }
    case 'shuffle': {
      const lift = Math.abs(Math.sin(pt * 5));
      for (const [x, y] of [[hl.x + 1.5, hl.y + 1], [hr.x + 1.5, hr.y - 1]]) rect(ctx, x, y, 2.6, 3.4, '#f0ece0');
      card(ctx, (hl.x + hr.x) / 2 + 2, 0, lift * 0.6);
      break;
    }
    case 'deal': {
      rect(ctx, hl.x + 1.5, hl.y + 0.5, 2.6, 3.4, '#f0ece0');
      // every card dealt lies where it went; the one of this beat flies there
      const beat = k * DEAL;
      for (let b = 0; b <= Math.min(DEAL - 1, Math.floor(beat)); b++) {
        const a = dealAngle(b), u = b < Math.floor(beat) ? 1 : ease((beat - b - 0.2) / 0.6), r = 8 + 14 * u;
        if (beat - b > 0.2) card(ctx, 6.5 + Math.cos(a) * r, 2 + Math.sin(a) * r, a + u * 3);
      }
      break;
    }
    case 'chip': {
      // his hand in the left one; the chip goes out of the right one and lands in the pot
      for (const j of [-1, 0, 1]) card(ctx, hl.x + 2, hl.y + j * 1.8, j * 0.3);
      const out = k > 0.5;
      ctx.fillStyle = PALETTE.ink; ctx.fillRect((out ? 12.5 : hr.x + 1) - 1.4, (out ? 0.3 : hr.y) - 1.4, 2.8, 2.8);
      ctx.fillStyle = CHIPS[Math.floor(opts.seed) % CHIPS.length]; ctx.fillRect((out ? 12.5 : hr.x + 1) - 0.9, (out ? 0.3 : hr.y) - 0.9, 1.8, 1.8);
      break;
    }
    case 'rake': {
      // the pot swept in under both hands
      for (let i = 0; i < 5; i++) {
        const x = (hl.x + hr.x) / 2 + 2 + (i % 3) * 1.6 - 1.6, y = (hl.y + hr.y) / 2 + (i - 2) * 1.3;
        ctx.fillStyle = CHIPS[i % CHIPS.length]; ctx.fillRect(x - 0.8, y - 0.8, 1.6, 1.6);
      }
      break;
    }
    case 'weigh': {
      const u = (pt / 1.4) % 1;
      if (u > 0.15 && u < 0.75) { ctx.fillStyle = '#f6f6f0'; ctx.fillRect(hl.x + 0.8, hl.y - 0.6, 1.2, 1.2); }
      break;
    }
    case 'bag': {
      rect(ctx, (hl.x + hr.x) / 2 + 1.5, (hl.y + hr.y) / 2, 2.6, 2.6, '#f2f2ec');
      ctx.fillStyle = '#d8d8d0'; ctx.fillRect((hl.x + hr.x) / 2 + 2.6, (hl.y + hr.y) / 2 - 0.4, 1, 0.8);
      break;
    }
    case 'thumb': wad(ctx, hl.x + 1.5, hl.y, false); break;
    case 'band': wad(ctx, (hl.x + hr.x) / 2 + 1.5, (hl.y + hr.y) / 2, k > 0.5); break;
    case 'stack': {
      wad(ctx, hl.x + 1.5, hl.y, false);
      if (k < 0.5) wad(ctx, hr.x + 1.5, hr.y, true);
      break;
    }
    case 'pee': {
      // a thin stream arcing into the bowl, a glint where it lands
      const r = opts.reach ?? 14, w = Math.sin(t * 9 + opts.seed) * 0.5;
      if (k > 0.1 && k < 0.93) {
        ctx.strokeStyle = 'rgba(226,214,120,0.85)'; ctx.lineWidth = 0.9; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(7.2, 0); ctx.quadraticCurveTo(r * 0.7, w, r, w * 1.4); ctx.stroke();
        ctx.fillStyle = 'rgba(240,236,190,0.7)';
        ctx.fillRect(r - 0.5 + Math.sin(t * 23) * 1.2, w * 1.4 - 0.5 + Math.cos(t * 17) * 1.2, 1, 1);
      }
      break;
    }
    case 'wash': {
      // the tap running over his hands
      ctx.fillStyle = 'rgba(190,225,255,0.75)'; ctx.fillRect(11.5, -0.4, 3, 0.8);
      for (let i = 0; i < 3; i++) ctx.fillRect(10 + Math.sin(t * 21 + i * 2) * 2, Math.cos(t * 17 + i * 3) * 2.5, 0.8, 0.8);
      break;
    }
    case 'cigar': case 'blow': case 'roll': case 'tap': case 'draw': {
      // a fat cigar: its ember flares up on a draw
      const glow = g === 'draw' ? drawn(k) : 0.15, a = g === 'roll' ? Math.sin(pt * 6) * 0.35 : -0.25;
      smoke(ctx, hr.x - 0.5, hr.y - 0.8, a, 4, 1.7, '#6a4026', glow);
      ctx.fillStyle = '#c8a040'; ctx.fillRect(hr.x - 0.5 + Math.cos(a) * 1.4 - 0.4, hr.y - 0.8 + Math.sin(a) * 1.4 - 0.85, 0.9, 1.7);
      break;
    }
    case 'read': magazine(ctx, 11, 3.5, pageTurn(pt, opts.seed)); break;
    // ---- the prologue: the match, the drawers and the fridge, the lookout's cigarette
    case 'box': matchbox(ctx, hl.x + 0.8, hl.y); match(ctx, hr.x + 0.4, hr.y - 0.5, -0.5, 0, t); break;
    case 'rattle': matchbox(ctx, hl.x + 0.6, hl.y); break;
    case 'strike': {
      // rasped along the strip, it takes with a flare that settles to a small flame
      matchbox(ctx, hl.x + 0.8, hl.y);
      match(ctx, hr.x + 0.4, hr.y - 0.5, -0.4, k < 0.42 ? 0 : 1 + 1.2 * (1 - ease((k - 0.42) / 0.4)), t);
      break;
    }
    case 'shield': {
      match(ctx, hr.x + 0.4, hr.y - 0.5, -0.9, 1, t);
      ctx.fillStyle = 'rgba(255,170,80,0.28)'; ctx.fillRect(hl.x - 1.6, hl.y - 1.6, 3.2, 3.2); // the hand round it, lit
      break;
    }
    case 'drop': {
      // still in his fingers, then falling to the floor ahead of him, smaller and smaller as it goes down
      if (k < MATCH_FALLS) match(ctx, hr.x + 0.4, hr.y - 0.5, 0.3, 1, t);
      else if (k < MATCH_FALLS + 0.12) {
        const u = (k - MATCH_FALLS) / 0.12;
        flame(ctx, lerp(hr.x + 3, 16, u), lerp(hr.y, 4, u), 1 - 0.4 * u, t);
      }
      break;
    }
    case 'dig': {
      // the drawer pulled out under the worktop, cutlery and odds and ends in it
      rect(ctx, 13, 0, 6, 13, '#5a3e28');
      ctx.fillStyle = '#2e2016'; ctx.fillRect(10.6, -5.6, 4.8, 11.2);
      ctx.fillStyle = '#b8bcc4';
      for (const [x, y, w, h] of [[11, -4.5, 3, 0.6], [11.5, -2.5, 3.4, 0.6], [11.2, 1.2, 0.6, 3], [13, 2.4, 1.6, 1.6]]) ctx.fillRect(x, y, w, h);
      ctx.fillStyle = '#d8cfa8'; ctx.fillRect(12.2, -1.2, 2.4, 1.8);
      break;
    }
    case 'toss': if (k < TOSSED) rect(ctx, hr.x + 1, hr.y, 2.6, 2.2, '#d8d0b8'); break;
    case 'fridge': {
      // the door swung open toward him on its hinge, at his left; the cold light of the inside on him
      ctx.fillStyle = 'rgba(205,232,255,0.22)'; ctx.fillRect(4, -10, 8, 20);
      ctx.save();
      ctx.translate(11, -11);
      ctx.rotate(3.3); // about 105 deg open from shut (pi / 2)
      ctx.fillStyle = PALETTE.ink; ctx.fillRect(-0.8, -1.8, 22.6, 3.6);
      ctx.fillStyle = '#e6e8e4'; ctx.fillRect(0, -1.1, 21, 2.2);
      ctx.fillStyle = '#c8302a'; ctx.fillRect(4, 1.1, 2, 0.9);  // a carton in the door's shelf
      ctx.fillStyle = '#4a7a3a'; ctx.fillRect(9, 1.1, 1.4, 0.9); // a bottle
      ctx.restore();
      break;
    }
    case 'armed': cig(ctx, hl.x + 0.6, hl.y + 1.1, drag(t, opts.seed), exhale(t, opts.seed), t, opts.seed); break;
    case 'armedAsh': cig(ctx, hl.x + 0.6, hl.y + 1.1, 0, -1, t, opts.seed); break;
    default: break;
  }
  ctx.restore();
}

// a bottle held by its neck at (x, y), tipped by a rad toward the glass
function bottle(ctx, x, y, a) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(a);
  ctx.fillStyle = PALETTE.ink; ctx.fillRect(-2.1, -1.8, 4.2, 6.6);
  ctx.fillStyle = '#3a5a2a'; ctx.fillRect(-1.4, -1.1, 2.8, 5.2);
  ctx.fillStyle = '#7aa05a'; ctx.fillRect(-1.4, -1.1, 0.8, 5.2);
  ctx.fillStyle = PALETTE.ink; ctx.fillRect(-0.9, -3.8, 1.8, 2.4);
  ctx.fillStyle = '#c8b070'; ctx.fillRect(-0.5, -3.4, 1, 1.8);
  ctx.restore();
}

// a cigar left clamped in his teeth when it all kicked off
export function drawMouth(ctx, A) {
  ctx.save();
  ctx.translate(A.x, A.y);
  ctx.rotate(A.angle);
  ctx.scale(A.s, A.s);
  smoke(ctx, 5, 1, 0.35, 3.6, 1.6, '#6a4026', 0.2);
  ctx.restore();
}

// something lying still in the world at (x, y), angle a: a sprite of tools/generate_assets.py `items/`
export function drawItem(ctx, name, x, y, a) {
  const img = spriteOpt(`items/${name}`);
  if (!img) return;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(a);
  ctx.drawImage(img, -img.width / 2, -img.height / 2);
  ctx.restore();
}
