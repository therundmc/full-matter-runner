// The opening, between the title screen and the tutorial: the picture leaves the street of the title for the lit
// window next door, goes in through it to a bedroom seen side-on where a man is asleep; somebody knocks, he sits up,
// puts the lamp on, gets to his feet; then the view tips over, from the wall he was seen against down onto the floor
// plan, and it is the game. Everything is a function of t (s since START): cineView() is the timeline as plain
// numbers (unit-tested), drawCinematic() the picture, cineBeats() the sounds.
//
// The room is pixel art at the title's logical resolution (ui/title/Draw.js LW x LH), painted with rectangles like
// the title's own layers, and blown up by the same whole factor.
import { LW, LH } from './title/Draw.js';
import { CAT } from './title/Layout.js';

export const CINE = {
  travel: 2.2,            // s from the street to the window
  zoom: 11,               // how much bigger the title's picture is when the window fills the screen
  target: { x: CAT.x + 2, y: CAT.y - 11 }, // the middle of the lit window next door, title logical px
  cross: 0.5,             // s of the cross-fade from the window to the room, the last of the travel
  knocks: [0.7, 0.95, 1.2], // s into the room the fist lands on the door
  rise: [1.5, 3.1],       // s into the room he takes to sit up, swing his legs out and stand
  lamp: 1.9,              // s into the room the lamp comes on
  room: 3.5,              // s in the room before the view tips
  tilt: 1.1,              // s the view takes to tip over onto the floor plan
  skipAfter: 0.3,         // s after which a key or a click goes straight to the game
  caption: 'SUNSET BAY  -  MARCH 14TH 1986  -  1:05 AM',
};
export const CINE_END = CINE.travel + CINE.room + CINE.tilt;

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const smooth = (k) => { k = clamp(k, 0, 1); return k * k * (3 - 2 * k); };

// The timeline at t: zoom (the title's picture, about the window), room (0..1 how much of the room shows over it),
// rt (s into the room scene), tilt (0..1 how far the view has tipped onto the floor plan), menu (0..1 what is left
// of the title's texts), over (it is done).
export function cineView(t, C = CINE) {
  const k = clamp(t / C.travel, 0, 1), e = k * k * k * (k * (6 * k - 15) + 10); // slow off the mark, slow into the window
  return {
    zoom: Math.exp(Math.log(C.zoom) * e),
    room: smooth((t - (C.travel - C.cross)) / C.cross),
    rt: Math.max(0, t - (C.travel - C.cross)),
    tilt: smooth((t - C.travel - C.room) / C.tilt),
    menu: 1 - smooth(t / 0.4),
    over: t >= C.travel + C.room + C.tilt,
  };
}

// what is heard between t0 and t1: [{ name, vol, opts }] for Audio.play
export function cineBeats(t0, t1, C = CINE) {
  const out = [], base = C.travel - C.cross, hit = (at) => t0 < base + at && t1 >= base + at;
  for (const at of C.knocks) if (hit(at)) out.push({ name: 'door', vol: 0.7 });
  if (hit(C.rise[0])) out.push({ name: 'getUp', vol: 0.6 });
  if (hit(C.lamp)) out.push({ name: 'click', vol: 0.5 });
  return out;
}

// ---------------------------------------------------------------- the room
const FLOOR = 168;                              // the foot of the wall
const WINDOW = { x: 26, y: 46, w: 62, h: 74 };  // the one the picture came in by, seen from inside
const BED = { x: 112, y: 128, w: 124, h: 40 };  // its frame; the head against the wall on the left
const STAND = { x: 244, y: 138, w: 26, h: 30 }; // the bedside table
const DOOR = { x: 312, y: 62, w: 46, h: 106 };
let room = null;

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  g.imageSmoothingEnabled = false;
  return { c, g };
}
const px = (g, col, x, y, w, h) => { g.fillStyle = col; g.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h)); };
const hash = (n) => { const s = Math.sin(n * 127.1 + 31.7) * 43758.5453; return s - Math.floor(s); };

// what never moves: the wall and its paper, the skirting, the boards, the window's frame, the bed, the table, the door
function paintStill(g) {
  px(g, '#1d1830', 0, 0, LW, FLOOR);
  for (let x = 6; x < LW; x += 12) px(g, '#231d3a', x, 0, 3, FLOOR);                     // the paper's stripes
  for (let i = 0; i < 40; i++) px(g, 'rgba(8,4,14,0.35)', hash(i) * LW, hash(i + 9) * FLOOR, 1, 3 + hash(i + 3) * 10); // damp
  px(g, '#3a2c34', 0, FLOOR - 7, LW, 7); px(g, '#4a3a42', 0, FLOOR - 7, LW, 1);          // skirting
  px(g, '#2a1c1c', 0, FLOOR, LW, LH - FLOOR);
  for (let y = FLOOR; y < LH; y += 8) px(g, '#1c1214', 0, y, LW, 1);                     // boards
  for (let i = 0; i < 26; i++) px(g, '#1c1214', hash(i + 40) * LW, FLOOR + Math.floor(hash(i + 70) * 6) * 8, 1, 8);
  // the window: frame, sill, a radiator under it
  const W = WINDOW;
  px(g, '#4a3e4a', W.x - 4, W.y - 4, W.w + 8, W.h + 8); px(g, '#2a2230', W.x - 2, W.y - 2, W.w + 4, W.h + 4);
  px(g, '#5a4e5a', W.x - 7, W.y + W.h + 4, W.w + 14, 4); px(g, '#32283a', W.x - 7, W.y + W.h + 8, W.w + 14, 2);
  for (let x = W.x + 2; x < W.x + W.w - 2; x += 6) px(g, '#3e3a48', x, W.y + W.h + 16, 4, 26);
  px(g, '#4e4a58', W.x, W.y + W.h + 14, W.w, 3);
  // a picture hung askew, a jacket on a nail
  px(g, '#3a2c34', 150, 58, 34, 26); px(g, '#182a3a', 153, 61, 28, 20); px(g, '#28506a', 153, 72, 28, 9); px(g, '#e8c070', 172, 64, 4, 4);
  px(g, '#0d7a86', 262, 70, 20, 30); px(g, '#0a5a66', 262, 70, 4, 30); px(g, '#12a0ae', 270, 72, 2, 24); px(g, '#2a2230', 271, 66, 2, 5);
  // the door, its panels and handle
  const D = DOOR;
  px(g, '#3a2c34', D.x - 4, D.y - 4, D.w + 8, D.h + 4);
  px(g, '#5a3c28', D.x, D.y, D.w, D.h); px(g, '#6e4a30', D.x, D.y, 2, D.h); px(g, '#3e2818', D.x + D.w - 2, D.y, 2, D.h);
  for (const [dy, dh] of [[8, 38], [54, 44]]) { px(g, '#4a301e', D.x + 8, D.y + dy, D.w - 16, dh); px(g, '#64422a', D.x + 8, D.y + dy, D.w - 16, 1); }
  px(g, '#c8a040', D.x + 6, D.y + 56, 3, 5);
  // the bedside table
  const T = STAND;
  px(g, '#4a3020', T.x, T.y, T.w, T.h); px(g, '#64422a', T.x - 1, T.y, T.w + 2, 3); px(g, '#32200f', T.x + 3, T.y + 9, T.w - 6, 8);
  px(g, '#c8a040', T.x + T.w / 2 - 1, T.y + 12, 3, 2);
  // the bed: headboard, frame, legs, mattress, pillow
  const B = BED;
  px(g, '#3e2818', B.x - 6, B.y - 26, 8, B.h + 26); px(g, '#5a3c28', B.x - 6, B.y - 26, 8, 2);
  px(g, '#3e2818', B.x, B.y + 24, B.w, 10); px(g, '#2a1a0e', B.x + 4, B.y + 34, 5, 6); px(g, '#2a1a0e', B.x + B.w - 9, B.y + 34, 5, 6);
  px(g, '#3e2818', B.x + B.w - 3, B.y + 8, 5, 26);
  px(g, '#b8b0a4', B.x, B.y + 10, B.w, 14); px(g, '#d0c8bc', B.x, B.y + 10, B.w, 2); px(g, '#8a8278', B.x, B.y + 22, B.w, 2);
  px(g, '#e4dcd0', B.x + 2, B.y + 3, 26, 9); px(g, '#f4ece0', B.x + 2, B.y + 3, 26, 2); px(g, '#b8b0a4', B.x + 2, B.y + 10, 26, 2);
}

// the night through the glass: the neon over the street beating, the rain running down
function paintWindow(g, t) {
  const W = WINDOW, beat = 0.6 + 0.4 * Math.sin(t * 2.1) * Math.sin(t * 0.7 + 1);
  px(g, '#0a0a1c', W.x, W.y, W.w, W.h);
  px(g, `rgba(255,42,109,${(0.2 + 0.16 * beat).toFixed(3)})`, W.x, W.y, W.w, W.h * 0.55);
  px(g, `rgba(5,217,232,${(0.12 + 0.1 * (1 - beat)).toFixed(3)})`, W.x, W.y + W.h * 0.45, W.w, W.h * 0.55);
  px(g, '#1a1228', W.x + 8, W.y + 34, 18, 40); px(g, '#1a1228', W.x + 36, W.y + 22, 22, 52);   // the roofs across
  px(g, '#ffd27a', W.x + 12, W.y + 44, 3, 4); px(g, '#ffd27a', W.x + 44, W.y + 34, 3, 4);
  for (let i = 0; i < 16; i++) {
    const x = W.x + 2 + Math.floor(hash(i) * (W.w - 4)), sp = 26 + hash(i + 5) * 40, y = (t * sp + hash(i + 2) * W.h) % W.h;
    px(g, 'rgba(190,220,255,0.5)', x, W.y + y, 1, 5 + hash(i + 8) * 5);
  }
  px(g, '#2a2230', W.x + W.w / 2 - 1, W.y, 2, W.h); px(g, '#2a2230', W.x, W.y + W.h / 2 - 1, W.w, 2);   // the sash bars
}

// the man: asleep under the blanket, sat up, his legs out, on his feet (u 0..1 through getting up)
function paintMan(g, u) {
  const B = BED, skin = '#f2c493', hair = '#f2cc58', top = '#e8e4d8', legs = '#30303c', blanket = '#7a3aa0', fold = '#5a2a7a';
  if (u < 0.3) {
    // lying on his back, the blanket to his chest (it slips as he stirs)
    const s = smooth(u / 0.3) * 8;
    px(g, skin, B.x + 9, B.y - 1, 9, 7); px(g, hair, B.x + 6, B.y - 2, 6, 6);
    px(g, top, B.x + 18, B.y + 2, 20 + s, 8);
    px(g, blanket, B.x + 34 + s, B.y + 1, B.w - 36 - s, 12); px(g, fold, B.x + 34 + s, B.y + 1, 3, 12);
    px(g, '#8e4ab4', B.x + 38 + s, B.y + 1, B.w - 42 - s, 2);
    return;
  }
  px(g, blanket, B.x + 66, B.y + 2, B.w - 68, 11); px(g, fold, B.x + 66, B.y + 2, 4, 11); px(g, '#8e4ab4', B.x + 70, B.y + 2, B.w - 74, 2);
  if (u < 0.62) {
    // sat up in the bed, a hand over his face
    px(g, top, B.x + 30, B.y - 16, 13, 22); px(g, '#c8c4b8', B.x + 30, B.y - 16, 2, 22);
    px(g, skin, B.x + 31, B.y - 26, 10, 10); px(g, hair, B.x + 30, B.y - 28, 11, 5); px(g, hair, B.x + 30, B.y - 26, 3, 7);
    px(g, top, B.x + 41, B.y - 12, 5, 4); px(g, skin, B.x + 40, B.y - 20, 4, 9);
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
  // standing by the bed, in front of it
  const fy = BED.y + 40, y = fy - 68;
  px(g, '#1a1214', x + 8, fy - 4, 9, 4); px(g, '#1a1214', x + 18, fy - 4, 9, 4);
  px(g, legs, x + 9, fy - 32, 7, 29); px(g, legs, x + 18, fy - 32, 7, 29);
  px(g, top, x + 7, y + 12, 20, 26); px(g, '#c8c4b8', x + 7, y + 12, 2, 26);
  px(g, top, x + 3, y + 14, 5, 20); px(g, top, x + 26, y + 14, 5, 20); px(g, skin, x + 3, y + 34, 5, 5); px(g, skin, x + 26, y + 34, 5, 5);
  px(g, skin, x + 11, y, 12, 12); px(g, hair, x + 10, y - 2, 14, 5); px(g, hair, x + 10, y, 3, 8);
}

function paintRoom(t) {
  if (!room) {
    room = { still: canvas(LW, LH), live: canvas(LW, LH) };
    paintStill(room.still.g);
  }
  const g = room.live.g, C = CINE, T = STAND, D = DOOR;
  g.globalAlpha = 1;
  g.globalCompositeOperation = 'source-over';
  g.drawImage(room.still.c, 0, 0);
  paintWindow(g, t);
  // the door jumps under the fist; the light of the landing under it, and the feet of whoever stands there
  const knock = C.knocks.reduce((a, k) => Math.max(a, t >= k ? Math.exp(-(t - k) * 14) : 0), 0);
  if (knock > 0.05) px(g, '#6e4a30', D.x - 1 - knock * 2, D.y, 3, D.h);
  px(g, '#ffd9a0', D.x + 1, FLOOR - 2, D.w - 2, 2);
  px(g, '#3a2414', D.x + 10 + Math.sin(t * 3) * 2, FLOOR - 2, 7, 2); px(g, '#3a2414', D.x + 26 + Math.sin(t * 2.3 + 1) * 2, FLOOR - 2, 7, 2);
  // on the table: the lamp, a bottle, a glass, the clock's red digits
  const lit = t >= C.lamp ? 1 : 0;
  px(g, '#8a6a3a', T.x + 9, T.y - 5, 3, 5); px(g, lit ? '#ffe2a8' : '#6a5a48', T.x + 3, T.y - 17, 15, 12); px(g, lit ? '#fff4d8' : '#7a6a58', T.x + 5, T.y - 17, 11, 2);
  px(g, '#5a3416', T.x + 20, T.y - 12, 4, 12); px(g, '#8a5424', T.x + 21, T.y - 16, 2, 4); px(g, '#e8d8a8', T.x + 20, T.y - 8, 4, 4);
  px(g, '#1a0a0a', T.x - 2, T.y - 6, 9, 6); px(g, '#ff3030', T.x - 1, T.y - 4, 2, 3); px(g, '#ff3030', T.x + 2, T.y - 4, 1, 3); px(g, '#ff3030', T.x + 4, T.y - 4, 2, 3);
  paintMan(g, clamp((t - C.rise[0]) / (C.rise[1] - C.rise[0]), 0, 1));
  // the light: the window's on the floor and the bed, the lamp's once it is on; the rest of the room stays dark
  g.globalCompositeOperation = 'multiply';
  px(g, lit ? '#8a7a9a' : '#5a5484', 0, 0, LW, LH);
  g.globalCompositeOperation = 'lighter';
  const W = WINDOW, beat = 0.6 + 0.4 * Math.sin(t * 2.1) * Math.sin(t * 0.7 + 1);
  const pool = g.createLinearGradient(W.x, 0, W.x + 190, 0);
  pool.addColorStop(0, `rgba(255,60,120,${(0.2 * beat).toFixed(3)})`); pool.addColorStop(1, 'rgba(255,60,120,0)');
  g.fillStyle = pool;
  g.beginPath(); g.moveTo(W.x, W.y + W.h); g.lineTo(W.x + W.w, W.y + W.h); g.lineTo(W.x + 210, LH); g.lineTo(W.x - 10, LH); g.closePath(); g.fill();
  if (lit) {
    const glow = g.createRadialGradient(T.x + 10, T.y - 10, 2, T.x + 10, T.y - 10, 120);
    glow.addColorStop(0, 'rgba(255,200,130,0.5)'); glow.addColorStop(1, 'rgba(255,200,130,0)');
    g.fillStyle = glow; g.fillRect(0, 0, LW, LH);
  }
  g.globalCompositeOperation = 'source-over';
  return room.live.c;
}

// ---------------------------------------------------------------- the picture
// parts: title(g, W, H) paints the title's street on a W x H canvas, world(g, W, H) the game seen from above.
// buf: a W x H scratch canvas { c, g } kept by the caller (Game), so nothing is allocated per frame.
export function drawCinematic(ctx, W, H, t, parts, buf) {
  const v = cineView(t), sc = Math.max(W / LW, H / LH), ox = (W - LW * sc) / 2, oy = (H - LH * sc) / 2;
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = '#05030a';
  ctx.fillRect(0, 0, W, H);
  if (v.room < 1) {
    // the street, blown up about the window the picture is going to
    parts.title(buf.g, W, H);
    const tx = ox + CINE.target.x * sc, ty = oy + CINE.target.y * sc, k = (v.zoom - 1) / (CINE.zoom - 1);
    // the window comes to the middle of the screen as it grows
    const cx = tx + (W / 2 - tx) * k, cy = ty + (H / 2 - ty) * k;
    ctx.setTransform(v.zoom, 0, 0, v.zoom, cx - tx * v.zoom, cy - ty * v.zoom);
    ctx.drawImage(buf.c, 0, 0);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }
  if (v.room > 0 && v.tilt < 1) {
    const img = paintRoom(v.rt), h = H * (1 - v.tilt);
    ctx.globalAlpha = v.room;
    // seen side-on, then from higher and higher: the wall shrinks toward the top of the screen
    ctx.drawImage(img, 0, 0, LW, LH, ox, oy * (1 - v.tilt), LW * sc, (LH * sc * h) / H);
    ctx.globalAlpha = 1;
  }
  if (v.tilt > 0) {
    // the floor plan comes up from the bottom of the screen as the wall goes
    parts.world(buf.g, W, H);
    const h = H * v.tilt;
    ctx.drawImage(buf.c, 0, 0, W, H, 0, H - h, W, h);
    if (v.tilt < 1) {
      const seam = ctx.createLinearGradient(0, H - h - 14, 0, H - h + 14);
      seam.addColorStop(0, 'rgba(5,3,10,0)'); seam.addColorStop(0.5, 'rgba(5,3,10,0.9)'); seam.addColorStop(1, 'rgba(5,3,10,0)');
      ctx.fillStyle = seam;
      ctx.fillRect(0, H - h - 14, W, 28);
    }
  }
  ctx.restore();
}

// the date, typed at the foot of the room (to draw sharp, over the picture): { str, alpha } or null
export function cineCaption(t, C = CINE) {
  const v = cineView(t, C), rt = v.rt - 0.5;
  if (rt <= 0 || v.tilt >= 1) return null;
  return { str: C.caption.slice(0, Math.floor(rt * 26)), alpha: v.room * (1 - v.tilt) };
}
