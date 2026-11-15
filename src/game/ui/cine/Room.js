// His bedroom, seen from inside, facing the wall with the window the title looks out of. Pixel art at the title's
// logical resolution (LW x LH), painted with rectangles like the title's own layers: what never moves once
// (the wall, the frame round the window's hole, the bed, the table, the door), the rest every frame (the man, the
// door under the fist, the feet on the landing, the light). It is night and it stays night: the window's neon on the
// boards and the bed, the landing's light under the door, nothing else.
import { LW, LH } from '../title/Draw.js';

export const FLOOR = 168;                               // the foot of the wall
export const WIN = { x: 40, y: 26, w: 128, h: 72 };      // the window's hole: the title's picture, three times smaller
export const BED = { x: 190, y: 128, w: 110, h: 40 };    // its frame; the head against the wall on the left
export const STAND = { x: 304, y: 138, w: 22, h: 30 };   // the bedside table
export const DOOR = { x: 336, y: 62, w: 40, h: 106 };
let room = null;

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const smooth = (k) => { k = clamp(k, 0, 1); return k * k * (3 - 2 * k); };
const hash = (n) => { const s = Math.sin(n * 127.1 + 31.7) * 43758.5453; return s - Math.floor(s); };
const px = (g, col, x, y, w, h) => { g.fillStyle = col; g.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h)); };

function canvas() {
  const c = document.createElement('canvas');
  c.width = LW; c.height = LH;
  const g = c.getContext('2d');
  g.imageSmoothingEnabled = false;
  return { c, g };
}

function paintStill(g) {
  px(g, '#1d1830', 0, 0, LW, FLOOR);
  for (let x = 6; x < LW; x += 12) px(g, '#231d3a', x, 0, 3, FLOOR);                     // the paper's stripes
  for (let i = 0; i < 44; i++) px(g, 'rgba(8,4,14,0.35)', hash(i) * LW, hash(i + 9) * FLOOR, 1, 3 + hash(i + 3) * 10); // damp
  px(g, '#3a2c34', 0, FLOOR - 7, LW, 7); px(g, '#4a3a42', 0, FLOOR - 7, LW, 1);          // skirting
  px(g, '#2a1c1c', 0, FLOOR, LW, LH - FLOOR);
  for (let y = FLOOR; y < LH; y += 8) px(g, '#1c1214', 0, y, LW, 1);                     // boards
  for (let i = 0; i < 26; i++) px(g, '#1c1214', hash(i + 40) * LW, FLOOR + Math.floor(hash(i + 70) * 6) * 8, 1, 8);
  // the window: its casing round the hole, a radiator under the sill
  const W = WIN;
  px(g, '#3a2e3c', W.x - 5, W.y - 5, W.w + 10, W.h + 10); px(g, '#201828', W.x - 2, W.y - 2, W.w + 4, W.h + 4);
  g.clearRect(W.x, W.y, W.w, W.h);
  px(g, '#4a3e4c', W.x - 8, W.y + W.h + 5, W.w + 16, 4); px(g, '#2a2032', W.x - 8, W.y + W.h + 9, W.w + 16, 2);
  for (let x = W.x + 14; x < W.x + W.w - 14; x += 6) px(g, '#34303e', x, W.y + W.h + 20, 4, 44);
  px(g, '#44404e', W.x + 12, W.y + W.h + 18, W.w - 24, 3);
  // a picture hung askew over the bed, his jacket on a nail
  px(g, '#3a2c34', 222, 54, 34, 26); px(g, '#182a3a', 225, 57, 28, 20); px(g, '#28506a', 225, 68, 28, 9); px(g, '#e8c070', 244, 60, 4, 4);
  px(g, '#0d7a86', 304, 76, 20, 30); px(g, '#0a5a66', 304, 76, 4, 30); px(g, '#12a0ae', 312, 78, 2, 24); px(g, '#2a2230', 313, 72, 2, 5);
  // the door, its panels and handle
  const D = DOOR;
  px(g, '#3a2c34', D.x - 4, D.y - 4, D.w + 8, D.h + 4);
  px(g, '#5a3c28', D.x, D.y, D.w, D.h); px(g, '#6e4a30', D.x, D.y, 2, D.h); px(g, '#3e2818', D.x + D.w - 2, D.y, 2, D.h);
  for (const [dy, dh] of [[8, 38], [54, 44]]) { px(g, '#4a301e', D.x + 7, D.y + dy, D.w - 14, dh); px(g, '#64422a', D.x + 7, D.y + dy, D.w - 14, 1); }
  px(g, '#c8a040', D.x + 5, D.y + 56, 3, 5);
  // the bedside table: a lamp that stays off, the clock's red digits, an empty glass
  const T = STAND;
  px(g, '#4a3020', T.x, T.y, T.w, T.h); px(g, '#64422a', T.x - 1, T.y, T.w + 2, 3); px(g, '#32200f', T.x + 3, T.y + 9, T.w - 6, 8);
  px(g, '#c8a040', T.x + T.w / 2 - 1, T.y + 12, 3, 2);
  px(g, '#8a6a3a', T.x + 13, T.y - 5, 3, 5); px(g, '#6a5a48', T.x + 8, T.y - 16, 13, 11); px(g, '#7a6a58', T.x + 10, T.y - 16, 9, 2);
  px(g, '#1a0a0a', T.x - 1, T.y - 6, 9, 6); px(g, '#ff3030', T.x, T.y - 4, 2, 3); px(g, '#ff3030', T.x + 3, T.y - 4, 1, 3); px(g, '#ff3030', T.x + 5, T.y - 4, 2, 3);
  // the bed: headboard, frame, legs, mattress, pillow
  const B = BED;
  px(g, '#3e2818', B.x - 6, B.y - 26, 8, B.h + 26); px(g, '#5a3c28', B.x - 6, B.y - 26, 8, 2);
  px(g, '#3e2818', B.x, B.y + 24, B.w, 10); px(g, '#2a1a0e', B.x + 4, B.y + 34, 5, 6); px(g, '#2a1a0e', B.x + B.w - 9, B.y + 34, 5, 6);
  px(g, '#3e2818', B.x + B.w - 3, B.y + 8, 5, 26);
  px(g, '#b8b0a4', B.x, B.y + 10, B.w, 14); px(g, '#d0c8bc', B.x, B.y + 10, B.w, 2); px(g, '#8a8278', B.x, B.y + 22, B.w, 2);
  px(g, '#e4dcd0', B.x + 2, B.y + 3, 26, 9); px(g, '#f4ece0', B.x + 2, B.y + 3, 26, 2); px(g, '#b8b0a4', B.x + 2, B.y + 10, 26, 2);
}

// the man: asleep under the blanket, sat up, on the edge of the bed, on his feet (u 0..1 through getting up)
function paintMan(g, u) {
  const B = BED, skin = '#f2c493', hair = '#f2cc58', top = '#e8e4d8', legs = '#30303c', blanket = '#7a3aa0', fold = '#5a2a7a';
  if (u < 0.3) {
    const s = smooth(u / 0.3) * 8; // the blanket slips as he stirs
    px(g, skin, B.x + 9, B.y - 1, 9, 7); px(g, hair, B.x + 6, B.y - 2, 6, 6);
    px(g, top, B.x + 18, B.y + 2, 20 + s, 8);
    px(g, blanket, B.x + 34 + s, B.y + 1, B.w - 36 - s, 12); px(g, fold, B.x + 34 + s, B.y + 1, 3, 12);
    px(g, '#8e4ab4', B.x + 38 + s, B.y + 1, B.w - 42 - s, 2);
    return;
  }
  px(g, blanket, B.x + 66, B.y + 2, B.w - 68, 11); px(g, fold, B.x + 66, B.y + 2, 4, 11); px(g, '#8e4ab4', B.x + 70, B.y + 2, B.w - 74, 2);
  if (u < 0.62) {
    // sat up in the bed, turned to the door, a hand flat on the mattress
    px(g, top, B.x + 30, B.y - 16, 13, 22); px(g, '#c8c4b8', B.x + 30, B.y - 16, 2, 22);
    px(g, skin, B.x + 31, B.y - 26, 10, 10); px(g, hair, B.x + 30, B.y - 28, 11, 5); px(g, hair, B.x + 30, B.y - 26, 3, 7);
    px(g, top, B.x + 41, B.y - 12, 6, 4); px(g, skin, B.x + 46, B.y - 3, 4, 4);
    px(g, legs, B.x + 40, B.y + 3, 28, 7);
    return;
  }
  const k = smooth((u - 0.62) / 0.38), x = B.x + 44 + k * 4;
  if (k < 0.5) {
    // on the edge of the bed, his feet on the boards
    px(g, legs, x - 2, B.y + 3, 18, 7); px(g, legs, x + 12, B.y + 8, 6, 28); px(g, '#1a1214', x + 11, B.y + 35, 9, 4);
    px(g, top, x - 2, B.y - 17, 13, 22); px(g, skin, x - 1, B.y - 27, 10, 10); px(g, hair, x - 2, B.y - 29, 11, 5);
    px(g, top, x + 9, B.y - 12, 4, 14);
    return;
  }
  // on his feet by the bed
  const fy = B.y + 40, y = fy - 68;
  px(g, '#1a1214', x + 8, fy - 4, 9, 4); px(g, '#1a1214', x + 18, fy - 4, 9, 4);
  px(g, legs, x + 9, fy - 32, 7, 29); px(g, legs, x + 18, fy - 32, 7, 29);
  px(g, top, x + 7, y + 12, 20, 26); px(g, '#c8c4b8', x + 7, y + 12, 2, 26);
  px(g, top, x + 3, y + 14, 5, 20); px(g, top, x + 26, y + 14, 5, 20); px(g, skin, x + 3, y + 34, 5, 5); px(g, skin, x + 26, y + 34, 5, 5);
  px(g, skin, x + 11, y, 12, 12); px(g, hair, x + 10, y - 2, 14, 5); px(g, hair, x + 10, y, 3, 8);
}

// The room at this moment, its window's hole left clear. s: { rise 0..1 (how far out of bed he is), knock 0..1 (the
// door jumping), feet: [x...] (px along the door's foot where somebody stands on the landing), blood 0..1 (what
// comes under the door), beat (the neon's pulse) }
export function paintRoom(s) {
  if (!room) {
    room = { still: canvas(), live: canvas() };
    paintStill(room.still.g);
  }
  const g = room.live.g, D = DOOR, W = WIN;
  g.globalAlpha = 1;
  g.globalCompositeOperation = 'source-over';
  g.clearRect(0, 0, LW, LH);
  g.drawImage(room.still.c, 0, 0);
  if (s.knock > 0.05) px(g, '#6e4a30', D.x - 1 - s.knock * 2, D.y, 3, D.h);
  px(g, '#ffd9a0', D.x + 1, FLOOR - 2, D.w - 2, 2);
  for (const fx of s.feet || []) px(g, '#2a180c', D.x + fx, FLOOR - 2, 7, 2);
  if (s.blood > 0) {
    // it comes under the door and finds the gaps between the boards
    const r = s.blood * 26;
    for (let i = 0; i < r; i++) {
      const w = Math.max(2, (r - i) * (0.8 + 0.4 * hash(i))) * 2;
      px(g, i % 3 ? '#5c0a0c' : '#780b0f', D.x + D.w / 2 - w / 2 + (hash(i + 5) - 0.5) * 4, FLOOR + i * 0.7, w, 1);
    }
  }
  paintMan(g, s.rise);
  // night: everything sinks, but for what the window throws on the boards and the bed
  g.globalCompositeOperation = 'source-atop';
  px(g, 'rgba(10,8,30,0.52)', 0, 0, LW, LH);
  g.globalCompositeOperation = 'lighter';
  const pool = g.createLinearGradient(W.x, 0, W.x + 260, 0);
  pool.addColorStop(0, `rgba(255,60,120,${(0.2 * s.beat).toFixed(3)})`); pool.addColorStop(1, 'rgba(255,60,120,0)');
  g.fillStyle = pool;
  g.beginPath(); g.moveTo(W.x, W.y + W.h + 4); g.lineTo(W.x + W.w, W.y + W.h + 4); g.lineTo(W.x + 300, LH); g.lineTo(W.x - 16, LH); g.closePath(); g.fill();
  g.globalCompositeOperation = 'destination-out';
  g.fillStyle = '#000';
  g.fillRect(W.x, W.y, W.w, W.h); // the hole again: the light above may have spilled into it
  g.globalCompositeOperation = 'source-over';
  return room.live.c;
}
