// His bedroom, seen from inside, facing the wall with the window the title looks out of. Pixel art at the title's
// logical resolution (LW x LH), painted with the opening's tools (Ink.js). It tells who lives there before anything
// happens: a runner's bicycle, the city's map with his rounds in red thread, a calendar whose days are crossed off,
// a postcard of a beach, a suitcase half packed. Three canvases: what never moves, painted once (wall, furniture);
// what does, every frame (the fan, the man, his things on their hooks, the door, the light); and a near plane
// (paintFore: the bicycle, the suitcase, black against the room) that the camera slides a little for depth.
// It is night and it stays night: the window's neon on the boards, the landing's light under the door; then the fire's.
import { LW, LH } from '../title/Draw.js';
import { clamp, smooth, lerp, hash, px, tone, poly, disc, line } from './Ink.js';

export const FLOOR = 168;                               // the foot of the wall
export const WIN = { x: 40, y: 26, w: 128, h: 72 };      // the window's hole: the title's picture, three times smaller
export const BED = { x: 190, y: 128, w: 110, h: 40 };    // its frame; the head against the wall on the left
export const STAND = { x: 304, y: 138, w: 22, h: 30 };   // the bedside table
export const DOOR = { x: 336, y: 62, w: 40, h: 106 };
export const FM = 24;                                    // the near plane's margin each side, px it may slide
const MAT = BED.y + 10;                                  // the mattress's top
// the man: Mediterranean skin, brown hair to his collar, a grey knit, jeans; then his coat, cap, scarf and satchel
const C = { skin: '#dba274', skinD: '#b07a50', hair: '#4a2e1c', hairL: '#6a4428', knit: '#868c98', knitD: '#646a78', jeans: '#3c4a66', jeansD: '#2c3850',
  coat: '#465062', coatD: '#343c4c', coatL: '#5a6478', lining: '#2a5f6e', cap: '#2e323e', capL: '#3e4454', visor: '#22252e', strap: '#8a5630', bag: '#7a4a28',
  bagD: '#5e3a1e', boot: '#3a2a22', sole: '#1c1418', blanket: '#6a2c50', blanketD: '#4a1c38', blanketL: '#8a3c66', sheet: '#c4bcc0' };
let room = null, fore = null;

function canvas(w = LW, h = LH) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  g.imageSmoothingEnabled = false;
  return { c, g };
}

// ---------------------------------------------------------------- what never moves
function paintWall(g) {
  px(g, '#1c1732', 0, 0, LW, FLOOR);
  for (let x = 4; x < LW; x += 16) { px(g, '#241e40', x, 16, 2, FLOOR - 16); px(g, '#171228', x + 2, 16, 1, FLOOR - 16); }   // the paper's stripes
  for (let x = 12; x < LW; x += 16) {
    for (let y = 26; y < FLOOR - 12; y += 14) { px(g, '#2a2348', x, y, 1, 3); px(g, '#2a2348', x - 1, y + 1, 3, 1); }           // and its motif
  }
  px(g, '#151127', 0, 0, LW, 14);                                                // bare plaster over the picture rail
  tone(g, '#0e0b1c', 0, 0, LW, 6, 0.5);
  px(g, '#322842', 0, 14, LW, 2); px(g, '#100c1e', 0, 16, LW, 1);
  for (let i = 0; i < 10; i++) disc(g, '#130f24', 296 + hash(i) * 88, 14 + hash(i + 3) * 34, 8 + hash(i + 5) * 14, 5 + hash(i + 7) * 12, 0.5); // damp
  for (let i = 0; i < 7; i++) px(g, '#130f24', 300 + hash(i + 20) * 80, 30, 1, 14 + hash(i + 30) * 40);
  const crack = [[262, 0], [264, 8], [261, 14], [266, 24], [264, 34], [269, 44]];
  for (let i = 1; i < crack.length; i++) line(g, '#0c0918', ...crack[i - 1], ...crack[i]);
  px(g, '#2d2838', 171, 17, 13, 16); px(g, '#2d2838', 173, 33, 8, 3);            // the paper come away: plaster under it
  poly(g, '#3d3554', [[171, 30], [182, 33], [180, 39], [171, 37]]); px(g, '#544a70', 171, 36, 9, 1);
  px(g, '#3a2c38', 0, FLOOR - 8, LW, 8); px(g, '#4e3e4c', 0, FLOOR - 8, LW, 1); px(g, '#221826', 0, FLOOR - 1, LW, 1);          // skirting
  px(g, '#b8b0a4', 178, FLOOR - 20, 6, 7); px(g, '#1c1418', 179, FLOOR - 18, 1, 2); px(g, '#1c1418', 182, FLOOR - 18, 1, 2);    // a socket
}

function paintFloor(g) {
  px(g, '#2a1c22', 0, FLOOR, LW, LH - FLOOR);
  const rows = [168, 173, 179, 186, 194, 204, 216];                              // the boards, wider toward us
  rows.slice(0, -1).forEach((y, i) => {
    const h = rows[i + 1] - y;
    px(g, '#170f14', 0, y, LW, 1); px(g, '#33242a', 0, y + 1, LW, 1);
    for (let k = 0; k < 7; k++) px(g, '#170f14', hash(i * 13 + k) * LW, y, 1, h);
    for (let k = 0; k < 12; k++) px(g, '#241820', hash(i * 7 + k + 50) * LW, y + 2 + hash(i + k + 90) * (h - 3), 6 + hash(k + i) * 18, 1);
  });
  // a worn rug by the bed
  poly(g, '#4a2440', [[150, 177], [296, 177], [318, 208], [128, 208]]);
  poly(g, '#5e3050', [[158, 180], [290, 180], [306, 205], [142, 205]]);
  poly(g, '#3a1c34', [[158, 180], [290, 180], [306, 205], [142, 205]], 0.25);
  poly(g, '#6e3c5a', [[176, 186], [276, 186], [284, 199], [166, 199]]);
  poly(g, '#4a2440', [[188, 189], [266, 189], [270, 196], [182, 196]], 0.5);
  for (let i = 0; i < 9; i++) { px(g, '#8a7a6a', 127 + i * 0.4 - 2, 180 + i * 3, 3, 1); px(g, '#8a7a6a', 298 + i * 2.4, 180 + i * 3, 3, 1); }
}

function paintWindowSide(g) {
  const W = WIN, ry = W.y + W.h + 22;
  px(g, '#3c3040', W.x - 6, W.y - 6, W.w + 12, W.h + 12); px(g, '#4e4254', W.x - 6, W.y - 6, W.w + 12, 1); px(g, '#221a2a', W.x - 2, W.y - 2, W.w + 4, W.h + 4);
  g.clearRect(W.x, W.y, W.w, W.h);
  px(g, '#4e4254', W.x - 10, W.y + W.h + 6, W.w + 20, 4); px(g, '#62566a', W.x - 10, W.y + W.h + 6, W.w + 20, 1); px(g, '#2a2032', W.x - 8, W.y + W.h + 10, W.w + 16, 2);
  // the radiator under it, a towel drying, the pipe to the riser in the corner
  px(g, '#18141f', W.x + 10, ry + 2, W.w - 22, 38);
  for (let x = W.x + 12; x < W.x + W.w - 14; x += 7) {
    px(g, '#3a3644', x, ry, 5, 40); px(g, '#4c4858', x, ry, 1, 40); px(g, '#24202c', x + 4, ry, 1, 40); px(g, '#4c4858', x, ry, 5, 1);
  }
  px(g, '#3a3644', 22, ry + 30, W.x - 8, 3); px(g, '#4c4858', 22, ry + 30, W.x - 8, 1);
  px(g, '#34303e', 20, 0, 5, FLOOR); px(g, '#48445a', 20, 0, 1, FLOOR); px(g, '#201c28', 24, 0, 1, FLOOR);
  for (const y of [30, 96, 150]) { px(g, '#48445a', 19, y, 7, 3); px(g, '#201c28', 19, y + 3, 7, 1); }
  px(g, '#b8262c', 26, 126, 5, 3); px(g, '#7a1420', 28, 124, 1, 7);
  poly(g, '#6a6478', [[120, ry - 2], [142, ry - 2], [142, ry + 20], [120, ry + 17]]); px(g, '#8a8498', 120, ry - 2, 22, 1);
  px(g, '#4a4658', 127, ry, 1, 18); px(g, '#4a4658', 135, ry, 1, 19);
  // a chair, his other jeans over its back
  px(g, '#4a3222', 172, 124, 2, 44); px(g, '#4a3222', 188, 147, 2, 21); px(g, '#5a3e2a', 172, 146, 18, 3); px(g, '#3a2618', 174, 149, 14, 1);
  poly(g, C.jeans, [[170, 123], [178, 123], [179, 150], [169, 152]]); px(g, C.jeansD, 174, 126, 1, 24); px(g, '#566a8c', 170, 123, 8, 1);
}

// what he pinned up between the window and the bed: the city, his rounds in red thread, the days left, a beach
function paintBoard(g) {
  px(g, '#5a4a36', 180, 26, 60, 48); px(g, '#8a7a5c', 182, 28, 56, 44); tone(g, '#6e6046', 182, 28, 56, 44, 0.25);
  poly(g, '#c8c0a4', [[185, 31], [226, 30], [227, 66], [186, 68]]);
  poly(g, '#7aa0b0', [[185, 31], [196, 31], [193, 40], [198, 49], [192, 58], [195, 68], [186, 68]]);       // the bay
  for (const y of [37, 44, 51, 58, 63]) line(g, '#a09880', 197, y, 226, y - 1);
  for (const x of [203, 211, 219]) line(g, '#a09880', x, 31, x + 1, 66);
  const pins = [[200, 36], [214, 43], [207, 55], [222, 60], [221, 34]];
  for (let i = 1; i < pins.length; i++) line(g, '#d02a3a', ...pins[i - 1], ...pins[i]);
  for (const [x, y] of pins) { px(g, '#ff5a6a', x - 1, y - 1, 2, 2); px(g, '#fff', x - 1, y - 1, 1, 1); }
  px(g, '#e8e0d0', 229, 32, 9, 11); px(g, '#3a4658', 230, 33, 7, 7); px(g, '#c88a60', 232, 35, 3, 4);     // a photograph
  px(g, '#e8c84a', 229, 47, 9, 8); px(g, '#6a5a20', 230, 49, 6, 1); px(g, '#6a5a20', 230, 51, 5, 1);     // a note
  px(g, '#c85a3a', 230, 60, 8, 5); px(g, '#f0e0c0', 231, 61, 4, 1);                                      // a matchbook
  // the calendar: March, thirteen days crossed off, the fourteenth ringed
  px(g, '#d8d0c0', 182, 80, 24, 28); px(g, '#b8262c', 182, 80, 24, 6); px(g, '#f0e8d8', 185, 82, 12, 2);
  for (let i = 0; i < 31; i++) {
    const x = 184 + (i % 7) * 3, y = 89 + Math.floor(i / 7) * 4;
    px(g, i < 13 ? '#b8262c' : i === 13 ? '#141018' : '#a09884', x, y, 2, 2);
    if (i === 13) { px(g, '#141018', x - 1, y - 1, 4, 1); px(g, '#141018', x - 1, y + 2, 4, 1); }
  }
  px(g, '#141018', 187, 78, 1, 3); px(g, '#141018', 200, 78, 1, 3);
  // a postcard taped next to it: a beach, far from here
  px(g, '#f0a050', 211, 82, 26, 8); px(g, '#ffe080', 228, 85, 5, 5); px(g, '#3a8aa0', 211, 90, 26, 5); px(g, '#e0c890', 211, 95, 26, 4);
  line(g, '#1c2a1c', 217, 97, 219, 85); line(g, '#1c2a1c', 219, 85, 214, 86); line(g, '#1c2a1c', 219, 85, 224, 87); line(g, '#1c2a1c', 219, 85, 221, 82);
  px(g, '#d8d0a0', 210, 81, 3, 2); px(g, '#d8d0a0', 235, 97, 3, 2);
}

function paintShelf(g) {
  px(g, '#4a3426', 244, 58, 58, 3); px(g, '#64482f', 244, 58, 58, 1); px(g, '#2e1e14', 250, 61, 2, 5); px(g, '#2e1e14', 294, 61, 2, 5);
  // his radio-cassette, tapes, three books
  px(g, '#2c2c36', 248, 45, 28, 13); px(g, '#3e3e4c', 248, 45, 28, 1);
  disc(g, '#131318', 254, 52, 4); disc(g, '#131318', 270, 52, 4); px(g, '#4a4a58', 253, 51, 2, 2); px(g, '#4a4a58', 269, 51, 2, 2);
  px(g, '#3c3c4a', 259, 48, 7, 5); px(g, '#16161c', 260, 49, 5, 2); px(g, '#8a8e98', 250, 43, 24, 1); px(g, '#8a8e98', 250, 43, 1, 3); px(g, '#8a8e98', 273, 43, 1, 3);
  line(g, '#8a8e98', 275, 45, 284, 30);
  for (const [i, col] of [[0, '#c85a3a'], [1, '#3a8aa0'], [2, '#e8c84a']]) { px(g, col, 279, 55 - i * 3, 11, 3); px(g, '#16161c', 279, 57 - i * 3, 11, 1); }
  px(g, '#6a2c50', 291, 46, 3, 12); px(g, '#2a5f6e', 294, 48, 3, 10); poly(g, '#8a6a3a', [[297, 58], [300, 46], [303, 47], [301, 58]]);
  // a holiday poster under it, a corner come loose
  px(g, '#1e1830', 250, 68, 32, 30); disc(g, '#ff7a3a', 266, 84, 9);
  for (const y of [85, 88, 91]) px(g, '#1e1830', 256, y, 20, 1);
  line(g, '#0c0a14', 256, 97, 259, 80, 2); line(g, '#0c0a14', 259, 80, 252, 82); line(g, '#0c0a14', 259, 80, 265, 81); line(g, '#0c0a14', 259, 80, 255, 76); line(g, '#0c0a14', 259, 80, 263, 76);
  px(g, '#ff2a6d', 250, 94, 32, 4); for (let x = 253; x < 280; x += 3) px(g, '#1e1830', x, 95, 2, 2);
  poly(g, '#1c1732', [[276, 68], [283, 68], [283, 75]]); line(g, '#544a70', 276, 68, 282, 74);
  px(g, '#c8c0a0', 249, 67, 3, 2); px(g, '#c8c0a0', 249, 96, 3, 2); px(g, '#c8c0a0', 280, 96, 3, 2);
  // hooks by the door
  px(g, '#4a3426', 300, 66, 32, 3); px(g, '#64482f', 300, 66, 32, 1);
  for (const x of [306, 318, 327]) px(g, '#8a8e98', x, 69, 1, 3);
  px(g, '#b8b0a4', 330, 112, 3, 5); px(g, '#6a6258', 331, 113, 1, 2);
}

function paintDoor(g) {
  const D = DOOR;
  px(g, '#3a2c38', D.x - 4, D.y - 5, D.w + 8, D.h + 5); px(g, '#4e3e4c', D.x - 4, D.y - 5, D.w + 8, 1);
  px(g, '#5a3c2a', D.x, D.y, D.w, D.h); px(g, '#6e4c34', D.x, D.y, 2, D.h); px(g, '#3e2818', D.x + D.w - 3, D.y, 3, D.h);
  tone(g, '#4a301e', D.x + 2, D.y + 2, D.w - 5, D.h - 4, 0.12);
  for (const [dy, dh] of [[7, 36], [50, 46]]) {
    px(g, '#4a301e', D.x + 7, D.y + dy, D.w - 14, dh); px(g, '#34200f', D.x + 7, D.y + dy, D.w - 14, 1); px(g, '#34200f', D.x + 7, D.y + dy, 1, dh);
    px(g, '#6e4c34', D.x + 7, D.y + dy + dh - 1, D.w - 14, 1); px(g, '#6e4c34', D.x + D.w - 8, D.y + dy, 1, dh);
  }
  px(g, '#c8a040', D.x + 4, D.y + 58, 4, 4); px(g, '#8a6a20', D.x + 4, D.y + 61, 4, 1); px(g, '#1c1418', D.x + 5, D.y + 65, 2, 3);
  px(g, '#8a8e98', D.x + 3, D.y + 44, 8, 2); for (let i = 0; i < 6; i++) px(g, '#8a8e98', D.x + 11 + (i % 2), D.y + 45 + i * 2, 1, 2); // the chain, off
}

function paintBed(g) {
  const B = BED, T = STAND;
  // the table by it: a lamp that stays off, the clock, his pills
  px(g, '#4a3222', T.x, T.y, T.w, T.h); px(g, '#64462f', T.x - 1, T.y, T.w + 2, 3); px(g, '#2e1c10', T.x + T.w - 2, T.y + 3, 2, T.h - 3);
  px(g, '#34200f', T.x + 3, T.y + 7, T.w - 7, 9); px(g, '#c8a040', T.x + 9, T.y + 11, 3, 1);
  px(g, '#2a180c', T.x + 3, T.y + 19, T.w - 7, 9); px(g, '#c8c0a4', T.x + 4, T.y + 25, 12, 2); px(g, '#b8262c', T.x + 5, T.y + 23, 10, 2);
  px(g, '#8a6a3a', T.x + 14, T.y - 6, 2, 6); px(g, '#6a5a48', T.x + 12, T.y - 1, 6, 1);
  poly(g, '#6a5c4c', [[T.x + 10, T.y - 17], [T.x + 20, T.y - 17], [T.x + 23, T.y - 6], [T.x + 7, T.y - 6]]); px(g, '#8a7a66', T.x + 10, T.y - 17, 10, 1);
  px(g, '#141018', T.x - 4, T.y - 7, 13, 7); px(g, '#2a2430', T.x - 4, T.y - 7, 13, 1);
  px(g, '#c86a2a', T.x + 9, T.y - 5, 3, 5); px(g, '#e8e0d0', T.x + 9, T.y - 6, 3, 1);
  // an iron bedstead, a shoe box under it
  px(g, '#2e2a38', B.x - 7, B.y - 30, 3, 70); px(g, '#444052', B.x - 7, B.y - 30, 1, 70); disc(g, '#444052', B.x - 5.5, B.y - 32, 2.5);
  px(g, '#2e2a38', B.x + B.w + 2, B.y - 8, 3, 48); px(g, '#444052', B.x + B.w + 2, B.y - 8, 1, 48); disc(g, '#444052', B.x + B.w + 3.5, B.y - 10, 2.5);
  px(g, '#2e2a38', B.x - 4, B.y + 26, B.w + 6, 4); px(g, '#444052', B.x - 4, B.y + 26, B.w + 6, 1);
  px(g, '#0e0a14', B.x - 2, B.y + 30, B.w + 2, 10);
  px(g, '#3a2c22', B.x + 12, B.y + 33, 20, 7); px(g, '#4e3c2e', B.x + 12, B.y + 33, 20, 1);
  px(g, '#8e8894', B.x - 3, MAT, B.w + 4, 16); for (let x = B.x; x < B.x + B.w; x += 9) px(g, '#7a7482', x, MAT + 9, 1, 7);
  px(g, C.sheet, B.x - 3, MAT, B.w + 4, 8); px(g, '#dcd4d8', B.x - 3, MAT, B.w + 4, 1); px(g, '#9a929c', B.x - 3, MAT + 7, B.w + 4, 1);
  poly(g, C.sheet, [[B.x + 8, MAT + 8], [B.x + 30, MAT + 8], [B.x + 26, MAT + 15], [B.x + 12, MAT + 13]]);
  poly(g, '#dcd4d0', [[B.x - 2, MAT - 7], [B.x + 24, MAT - 8], [B.x + 27, MAT], [B.x - 3, MAT]]); px(g, '#f0e8e4', B.x, MAT - 7, 22, 1); px(g, '#b0a8ac', B.x - 2, MAT - 1, 28, 1);
}

// what lies about on the boards: he lives alone and is leaving
function paintClutter(g) {
  px(g, '#2a1608', 122, 174, 5, 12); px(g, '#2a1608', 123, 169, 3, 5); px(g, '#d8c8a0', 122, 179, 5, 3); px(g, '#5a3416', 122, 174, 1, 12);   // rum
  px(g, '#1c3a2a', 132, 187, 13, 5); px(g, '#1c3a2a', 145, 188, 5, 3); px(g, '#2e5a40', 132, 187, 13, 1);
  px(g, '#5a6478', 106, 193, 11, 3); px(g, '#7a8498', 106, 193, 11, 1); px(g, '#d8d2c4', 109, 191, 4, 1); px(g, '#d8d2c4', 113, 192, 3, 1);   // an ashtray
  poly(g, '#c8c0b0', [[84, 198], [108, 196], [112, 204], [86, 206]]); line(g, '#8a8474', 97, 197, 99, 205);
  px(g, '#b8262c', 87, 199, 8, 4); px(g, '#8a8474', 101, 199, 7, 1); px(g, '#8a8474', 101, 201, 8, 1);                                         // a magazine
  px(g, '#b8262c', 176, 186, 14, 7); px(g, '#8a1c22', 174, 184, 18, 3); disc(g, '#e8e0d0', 183, 190, 2); px(g, '#d8404a', 176, 186, 14, 1);   // the telephone
  for (let i = 0; i < 12; i++) px(g, '#2a2026', 190 + (i % 2), 190 - i * 1.6, 1, 2);
  line(g, '#2a2026', 190, 172, 182, FLOOR - 14);
  poly(g, '#e8e0d0', [[230, 196], [244, 196], [242, 206], [232, 206]]); px(g, '#b8262c', 233, 199, 8, 3);
  line(g, '#c8a878', 236, 196, 246, 188); line(g, '#c8a878', 238, 196, 249, 189);                                                              // last night's dinner
  px(g, '#3a3644', 316, 190, 4, 8); px(g, '#3a3644', 328, 190, 4, 8); px(g, '#4c4858', 320, 193, 8, 2);                                        // a dumbbell
}

function paintStill(g) {
  paintWall(g);
  paintFloor(g);
  paintWindowSide(g);
  paintBoard(g);
  paintShelf(g);
  paintDoor(g);
  paintBed(g);
  paintClutter(g);
}

// ---------------------------------------------------------------- the near plane
// A canvas FM px wider each side than the picture: the front wheel and the bars of his bicycle on the left, his
// suitcase open on the right, nothing of them but their shape and the edge the window catches.
export function paintFore() {
  if (fore) return fore.c;
  fore = canvas(LW + 2 * FM, LH);
  const g = fore.g, ink = '#07050c', rim = '#6a2a56';
  g.translate(FM, 0);
  const cx = 26, cy = 236, R = 64;
  disc(g, ink, cx, cy, R);
  g.globalCompositeOperation = 'destination-out';
  disc(g, '#000', cx, cy, R - 5);
  g.globalCompositeOperation = 'source-over';
  for (let i = 0; i < 18; i++) { const a = -Math.PI * (i / 17); line(g, ink, cx, cy, cx + Math.cos(a) * (R - 4), cy + Math.sin(a) * (R - 4)); }
  for (let a = -2.0; a < -0.5; a += 0.012) px(g, rim, cx + Math.cos(a) * R, cy + Math.sin(a) * R, 1, 1);
  line(g, ink, cx, cy, 82, 168, 4); line(g, ink, 84, 170, -FM, 184, 4); line(g, ink, 84, 168, 88, 156, 4);     // fork, top tube, stem
  line(g, ink, 78, 156, 102, 153, 3); line(g, ink, 102, 153, 107, 163, 3); line(g, ink, 107, 163, 100, 170, 3); // the drop bar
  line(g, ink, 98, 155, 105, 148, 2);
  line(g, rim, 79, 155, 101, 152); line(g, rim, -FM, 183, 84, 169);
  // the suitcase, its lid leant back
  poly(g, ink, [[322, 204], [LW + FM, 198], [LW + FM, LH], [318, LH]]);
  poly(g, '#0c0914', [[330, 203], [LW + FM, 197], [LW + FM, 170], [340, 178]]);
  poly(g, '#1a1428', [[335, 200], [LW + FM, 195], [LW + FM, 175], [343, 181]], 0.5);
  poly(g, '#151022', [[326, 204], [338, 198], [356, 201], [374, 196], [LW + FM, 198], [LW + FM, 206], [326, 208]]);   // what is in it already
  px(g, '#c8c0a4', 350, 194, 10, 5); px(g, '#b8262c', 351, 196, 8, 1);                                              // a ticket
  line(g, rim, 340, 178, LW + FM, 170); line(g, rim, 322, 204, 338, 198);
  px(g, '#3a2c4a', 330, 209, 3, 4); px(g, '#3a2c4a', 366, 208, 3, 4);
  return fore.c;
}

// ---------------------------------------------------------------- what moves
// the clock's digits, 3 x 5
const DIGITS = { 0: '111101101101111', 1: '010110010010111', 5: '111100111001111' };
function digit(g, n, x, y, col) {
  for (let i = 0; i < 15; i++) if (DIGITS[n][i] === '1') px(g, col, x + (i % 3), y + Math.floor(i / 3), 1, 1);
}

// his coat, cap and satchel on their hooks, his boots by the bed: there until he has them on
function paintThings(g) {
  poly(g, C.coat, [[303, 69], [311, 69], [315, 77], [316, 118], [299, 118], [299, 77]]);
  px(g, C.coatD, 313, 78, 3, 40); px(g, C.coatL, 303, 68, 8, 3); px(g, C.lining, 307, 72, 1, 30); px(g, C.coatD, 299, 82, 3, 30); px(g, C.lining, 299, 117, 17, 1);
  disc(g, C.cap, 318.5, 74, 5, 4); px(g, C.visor, 313, 76, 10, 2); px(g, C.lining, 318, 71, 1, 1);
  line(g, C.strap, 326, 70, 323, 92); line(g, C.strap, 328, 70, 331, 92);
  px(g, C.bag, 321, 92, 12, 12); px(g, C.bagD, 321, 92, 12, 5); px(g, '#e0b040', 326, 97, 2, 2);
  px(g, C.boot, 252, 171, 8, 7); px(g, C.sole, 251, 177, 10, 2); px(g, C.boot, 264, 173, 9, 5); px(g, C.sole, 263, 177, 11, 2);
}

// The man: asleep under his blanket, sat up, on the edge of the bed, on his feet and dressed (u 0..1 through getting
// up). Adds to rims what the window (side -1) and the door (side 1) edge of him: [x, y, w, h, side].
function paintMan(g, u, t, rims) {
  const B = BED, b = Math.round(0.5 + 0.5 * Math.sin(t * 1.6));
  const thrown = [[B.x + 56, MAT], [B.x + 62, MAT - 8], [B.x + 90, MAT - 9], [B.x + 108, MAT - 3], [B.x + 110, MAT + 16], [B.x + 96, MAT + 22], [B.x + 80, MAT + 16], [B.x + 62, MAT + 21], [B.x + 56, MAT + 10]];
  if (u < 0.25) {
    // asleep on his back, his head turned to the room, an arm over the blanket; he breathes
    disc(g, C.hair, B.x + 9, MAT - 5, 6, 4.5); px(g, C.hair, B.x + 3, MAT - 4, 5, 3); px(g, C.hairL, B.x + 5, MAT - 8, 6, 1);
    px(g, C.skin, B.x + 10, MAT - 8, 8, 7); px(g, C.skinD, B.x + 10, MAT - 2, 8, 1); px(g, C.skin, B.x + 18, MAT - 6, 1, 2);
    px(g, '#3a2418', B.x + 14, MAT - 6, 2, 1); px(g, C.hair, B.x + 10, MAT - 9, 8, 1);
    poly(g, C.knit, [[B.x + 18, MAT - 3 - b], [B.x + 34, MAT - 6 - b], [B.x + 40, MAT], [B.x + 18, MAT]]);
    poly(g, C.blanket, [[B.x + 30, MAT], [B.x + 34, MAT - 7 - b], [B.x + 52, MAT - 9 - b], [B.x + 74, MAT - 7], [B.x + 96, MAT - 5], [B.x + 108, MAT - 2], [B.x + 110, MAT + 16],
      [B.x + 100, MAT + 22], [B.x + 84, MAT + 17], [B.x + 66, MAT + 24], [B.x + 48, MAT + 18], [B.x + 36, MAT + 22], [B.x + 30, MAT + 12]]);
    line(g, C.blanketD, B.x + 52, MAT - 8 - b, B.x + 50, MAT + 16); line(g, C.blanketD, B.x + 76, MAT - 6, B.x + 70, MAT + 20); line(g, C.blanketD, B.x + 96, MAT - 4, B.x + 98, MAT + 20);
    line(g, C.blanketL, B.x + 36, MAT - 7 - b, B.x + 72, MAT - 8);
    px(g, C.knit, B.x + 36, MAT - 5 - b, 14, 4); px(g, C.knitD, B.x + 36, MAT - 2 - b, 14, 1); px(g, C.skin, B.x + 50, MAT - 4 - b, 4, 3);
    rims.push([B.x + 4, MAT - 9, 8, 1, -1], [B.x + 34, MAT - 8 - b, 20, 1, -1], [B.x + 106, MAT - 2, 2, 16, 1]);
    return;
  }
  poly(g, C.blanket, thrown);
  line(g, C.blanketD, B.x + 76, MAT - 8, B.x + 72, MAT + 18); line(g, C.blanketD, B.x + 94, MAT - 7, B.x + 97, MAT + 20); line(g, C.blanketL, B.x + 63, MAT - 8, B.x + 90, MAT - 9);
  if (u < 0.55) {
    // sat up in the bed, turned to the door, a hand flat on the mattress
    poly(g, C.knit, [[B.x + 28, MAT - 22], [B.x + 42, MAT - 22], [B.x + 44, MAT], [B.x + 27, MAT]]); px(g, C.knitD, B.x + 40, MAT - 20, 3, 20);
    px(g, C.skin, B.x + 31, MAT - 34, 10, 11); px(g, C.skinD, B.x + 31, MAT - 24, 10, 1); px(g, C.skin, B.x + 41, MAT - 29, 1, 2);
    px(g, C.hair, B.x + 29, MAT - 36, 11, 4); px(g, C.hair, B.x + 28, MAT - 34, 4, 13); px(g, C.hairL, B.x + 30, MAT - 36, 9, 1);
    px(g, '#2a1810', B.x + 38, MAT - 30, 2, 1);
    px(g, C.knit, B.x + 40, MAT - 18, 5, 12); px(g, C.knit, B.x + 43, MAT - 8, 8, 4); px(g, C.skin, B.x + 50, MAT - 6, 4, 4);
    px(g, C.sheet, B.x + 42, MAT - 4, 16, 4);
    rims.push([B.x + 27, MAT - 34, 1, 34, -1], [B.x + 29, MAT - 37, 10, 1, -1], [B.x + 44, MAT - 20, 1, 20, 1]);
    return;
  }
  if (u < 0.78) {
    // on the edge of the bed, his feet on the boards, his hands on his knees
    const x = B.x + 40;
    px(g, C.jeans, x + 4, MAT - 4, 20, 7); px(g, C.jeans, x + 19, MAT + 2, 6, 29); px(g, C.jeansD, x + 19, MAT + 2, 2, 29); px(g, '#c8c0c4', x + 18, MAT + 30, 9, 3);
    poly(g, C.knit, [[x, MAT - 24], [x + 13, MAT - 24], [x + 16, MAT], [x, MAT]]); px(g, C.knitD, x + 12, MAT - 22, 3, 20);
    px(g, C.skin, x + 3, MAT - 36, 10, 11); px(g, C.skin, x + 13, MAT - 31, 1, 2); px(g, '#2a1810', x + 10, MAT - 32, 2, 1);
    px(g, C.hair, x + 1, MAT - 38, 11, 4); px(g, C.hair, x, MAT - 36, 4, 13); px(g, C.hairL, x + 2, MAT - 38, 9, 1);
    px(g, C.knit, x + 12, MAT - 12, 10, 4); px(g, C.skin, x + 21, MAT - 10, 4, 4);
    rims.push([x - 1, MAT - 36, 1, 36, -1], [x + 1, MAT - 39, 10, 1, -1], [x + 25, MAT + 2, 1, 28, 1]);
    return;
  }
  // on his feet: a step toward the hooks, then his coat on his back, the cap, the scarf up, the satchel across him
  const k = (u - 0.78) / 0.22, x = Math.round(lerp(B.x + 52, 270, smooth(k / 0.6))), dressed = k > 0.6;
  const fy = 180 - (k < 0.6 && Math.floor(k * 10) % 2 ? 1 : 0);
  px(g, C.boot, x + 4, fy - 5, 9, 5); px(g, C.boot, x + 14, fy - 5, 10, 5); px(g, C.sole, x + 3, fy - 1, 22, 1);
  px(g, C.jeansD, x + 5, fy - 34, 7, 30); px(g, C.jeans, x + 14, fy - 34, 7, 30);
  if (dressed) {
    px(g, C.bag, x - 2, fy - 42, 9, 11); px(g, C.bagD, x - 2, fy - 42, 9, 4); px(g, '#e0b040', x + 2, fy - 38, 1, 2);
    px(g, C.coat, x + 3, fy - 64, 20, 42); px(g, C.coatD, x + 3, fy - 64, 3, 42); px(g, C.coatL, x + 18, fy - 62, 2, 38); px(g, C.lining, x + 20, fy - 60, 1, 36);
    px(g, C.lining, x + 3, fy - 23, 20, 1); px(g, C.coatL, x + 6, fy - 69, 14, 6); px(g, C.lining, x + 9, fy - 68, 8, 1);
    px(g, C.coatD, x + 9, fy - 60, 6, 27); px(g, C.skin, x + 10, fy - 34, 5, 5);
    line(g, C.strap, x + 19, fy - 63, x + 4, fy - 38, 2);
    px(g, C.skin, x + 8, fy - 80, 11, 8); px(g, C.cap, x + 8, fy - 74, 12, 6); px(g, C.capL, x + 8, fy - 74, 12, 1);   // the scarf
    px(g, '#2a1810', x + 16, fy - 77, 2, 1); px(g, C.skin, x + 19, fy - 77, 1, 2);
    px(g, C.hair, x + 5, fy - 80, 4, 14);
    px(g, C.cap, x + 6, fy - 86, 13, 7); px(g, C.capL, x + 7, fy - 86, 11, 1); px(g, C.visor, x + 17, fy - 81, 8, 2); px(g, C.lining, x + 12, fy - 87, 2, 1);
    rims.push([x + 2, fy - 64, 1, 42, -1], [x + 5, fy - 86, 1, 20, -1], [x + 23, fy - 64, 1, 42, 1], [x + 25, fy - 81, 1, 2, 1]);
  } else {
    px(g, C.knit, x + 5, fy - 64, 16, 31); px(g, C.knitD, x + 5, fy - 64, 3, 31);
    px(g, C.knitD, x + 10, fy - 60, 5, 26); px(g, C.skin, x + 10, fy - 35, 5, 5);
    px(g, C.skin, x + 8, fy - 78, 11, 14); px(g, C.skinD, x + 8, fy - 66, 11, 2); px(g, '#2a1810', x + 16, fy - 75, 2, 1); px(g, C.skin, x + 19, fy - 74, 1, 2);
    px(g, '#8a5a40', x + 16, fy - 70, 3, 1);
    px(g, C.hair, x + 6, fy - 81, 13, 4); px(g, C.hair, x + 5, fy - 79, 4, 15); px(g, C.hairL, x + 7, fy - 81, 11, 1);
    rims.push([x + 4, fy - 79, 1, 46, -1], [x + 21, fy - 64, 1, 31, 1]);
  }
}

// The room at this moment, its window's hole left clear.
// s: { t, rise 0..1 (how far out of bed he is), knock 0..1 (the door jumping), beat (the neon's pulse), feet: [px
// along the door's foot where somebody stands behind it], gas 0..1 (what runs under the door), fire 0..1 (what
// follows it) }
export function paintRoom(s) {
  if (!room) {
    room = { still: canvas(), live: canvas() };
    paintStill(room.still.g);
  }
  const g = room.live.g, D = DOOR, W = WIN, T = STAND, t = s.t || 0, fire = s.fire || 0, rims = [];
  const flick = fire * (0.65 + 0.35 * hash(Math.floor(t * 13)));
  g.globalAlpha = 1;
  g.globalCompositeOperation = 'source-over';
  g.clearRect(0, 0, LW, LH);
  g.drawImage(room.still.c, 0, 0);
  // the ceiling fan, turning slowly: seen from the side its blades come and go
  px(g, '#2e2a38', 194, 0, 4, 6); px(g, '#3e3a4a', 190, 6, 12, 4); disc(g, '#6a6478', 196, 12, 3, 2);
  for (const ph of [0, Math.PI / 2]) {
    const c = Math.cos(t * 2.2 + ph), half = Math.abs(c) * 38;
    if (half > 3) { px(g, c > 0 ? '#2e2a38' : '#262230', 196 - half, 7, half * 2, 2); px(g, '#48445a', 196 - half, 7, half * 2, 1); }
  }
  if (s.knock > 0.05) px(g, '#6e4c34', D.x - 1 - s.knock * 2, D.y, 3, D.h);
  if (s.rise < 0.9) paintThings(g);
  if (s.gas > 0) {
    // it comes under the door and spreads on the boards, black, with the landing's light in it
    const r = s.gas;
    poly(g, '#0c0a10', [[D.x + 2, FLOOR], [D.x + D.w - 2, FLOOR], [D.x + D.w - 4 - r * 6, FLOOR + 4 + r * 16], [D.x + 10 - r * 34, FLOOR + 6 + r * 20], [D.x - r * 22, FLOOR + 2 + r * 6]]);
    for (let i = 0; i < 5; i++) px(g, '#c89a50', D.x + 6 + hash(i) * 24 - r * 14 * hash(i + 4), FLOOR + 2 + hash(i + 2) * (4 + r * 14), 3 + hash(i) * 4, 1);
  }
  paintMan(g, s.rise, t, rims);
  // night: everything sinks ...
  g.globalCompositeOperation = 'source-atop';
  px(g, 'rgba(10,8,30,0.5)', 0, 0, LW, LH);
  tone(g, 'rgba(5,3,12,0.6)', 0, 0, LW, 10, 0.5);
  // ... but for what the window throws: on the boards a pool that the rain on the glass keeps moving, a halo on the wall
  g.globalCompositeOperation = 'lighter';
  const beat = s.beat ?? 1, N = 22, x0 = [W.x - 14, W.x + W.w + 40], x1 = [W.x - 60, W.x + W.w + 170];
  for (let i = 0; i < N; i++) {
    const a = i / N, b = (i + 1) / N, rain = 0.5 + 0.5 * Math.sin(i * 2.1 + t * 1.9) * Math.sin(i * 0.7 - t * 0.8);
    const edge = Math.sin(Math.PI * (i + 0.5) / N), lvl = edge * (0.3 + 0.5 * rain) * beat;
    poly(g, 'rgba(255,60,130,0.3)', [[lerp(x0[0], x0[1], a), FLOOR], [lerp(x0[0], x0[1], b), FLOOR], [lerp(x1[0], x1[1], b), LH], [lerp(x1[0], x1[1], a), LH]], lvl > 0.62 ? 0.75 : lvl > 0.38 ? 0.5 : 0.25);
  }
  disc(g, `rgba(150,50,130,${(0.2 * beat).toFixed(3)})`, W.x + W.w / 2, W.y + W.h / 2 + 6, W.w * 0.62, W.h * 0.84, 0.5);
  disc(g, `rgba(150,50,130,${(0.16 * beat).toFixed(3)})`, W.x + W.w / 2, W.y + W.h / 2 + 10, W.w * 0.8, W.h * 1.2, 0.25);
  for (let i = 0; i < 16; i++) {  // dust in it
    const y = W.y + W.h + ((hash(i + 2) * 110 + t * (2 + hash(i) * 3)) % 110);
    px(g, 'rgba(255,150,200,0.4)', W.x + hash(i) * (W.w + 40) + Math.sin(t * 0.3 + i) * 6, y, 1, 1);
  }
  for (const [x, y, w, h, side] of rims) {
    if (side < 0) px(g, `rgba(255,80,150,${(0.5 * beat).toFixed(3)})`, x, y, w, h);
    else if (fire > 0) px(g, `rgba(255,130,40,${(0.8 * flick).toFixed(3)})`, x, y, w, h);
  }
  px(g, 'rgba(255,80,150,0.25)', BED.x - 3, MAT, 60, 1);
  // the door: the light of the next room under it, then the fire's, growing, and its smoke
  const warm = fire > 0 ? `rgba(255,${Math.round(150 - 40 * fire)},40,` : 'rgba(255,200,120,';
  px(g, `${warm}${(0.9 * (fire > 0 ? 0.5 + 0.5 * flick : 1)).toFixed(3)})`, D.x + 1, FLOOR - 2, D.w - 2, 2);
  poly(g, `${warm}0.25)`, [[D.x, FLOOR], [D.x + D.w, FLOOR], [D.x + D.w + 8, FLOOR + 14 + fire * 34], [D.x - 26 - fire * 150, FLOOR + 14 + fire * 34]], fire > 0 ? 0.25 + 0.5 * flick : 0.5);
  if (fire > 0) {
    px(g, `${warm}${(0.7 * flick).toFixed(3)})`, D.x, D.y, 1, D.h); px(g, `${warm}${(0.7 * flick).toFixed(3)})`, D.x + D.w - 1, D.y, 1, D.h); px(g, `${warm}${(0.7 * flick).toFixed(3)})`, D.x, D.y, D.w, 1);
    disc(g, `${warm}${(0.26 * flick).toFixed(3)})`, D.x + D.w / 2, D.y + D.h * 0.7, 40 + 70 * fire, 50 + 70 * fire, 0.25);
    disc(g, `${warm}${(0.22 * flick).toFixed(3)})`, D.x + D.w / 2, D.y + D.h * 0.8, 20 + 40 * fire, 30 + 50 * fire, 0.5);
    px(g, `${warm}${(0.6 * flick).toFixed(3)})`, T.x + T.w, T.y, 1, T.h); px(g, `${warm}${(0.6 * flick).toFixed(3)})`, BED.x + BED.w + 4, BED.y - 8, 1, 48);
  }
  for (const fx of s.feet || []) { g.globalCompositeOperation = 'source-over'; px(g, '#120a08', D.x + fx, FLOOR - 2, 7, 2); g.globalCompositeOperation = 'lighter'; }
  // the clock: 1:05, its colon blinking
  const red = '#ff3030';
  digit(g, 1, T.x - 3, T.y - 5, red); digit(g, 0, T.x + 1, T.y - 5, red); digit(g, 5, T.x + 5, T.y - 5, red);
  g.globalCompositeOperation = 'source-over';
  if (t % 1 < 0.5) { px(g, red, T.x, T.y - 4, 1, 1); px(g, red, T.x, T.y - 2, 1, 1); }
  if (fire > 0) {
    // smoke: wisps from under the door, and what has gathered under the ceiling, rolling toward the window
    const grey = 'rgba(96,88,104,0.8)', reach = LW * Math.min(1, fire * 1.3);
    for (let x = LW - reach; x < LW; x += 4) {
      const h = (8 + fire * 26) * (0.65 + 0.35 * Math.sin(x * 0.06 + t * 0.9)) * Math.min(1, (x - (LW - reach)) / 60 + 0.2);
      tone(g, grey, x, 0, 4, h * 0.45, 0.75); tone(g, grey, x, h * 0.45, 4, h * 0.3, 0.5); tone(g, grey, x, h * 0.75, 4, h * 0.25, 0.25);
    }
    for (let i = 0; i < 7; i++) {
      const life = (t * 0.45 + hash(i)) % 1;
      disc(g, grey, D.x + 2 + hash(i + 3) * 36 - life * 22, FLOOR - 3 - life * (FLOOR - 20), 3 + life * 7, 4 + life * 8, life < 0.5 ? 0.5 : 0.25);
    }
  }
  g.globalCompositeOperation = 'destination-out';
  g.fillStyle = '#000';
  g.fillRect(W.x, W.y, W.w, W.h); // the hole again: the light above may have spilled into it
  g.globalCompositeOperation = 'source-over';
  return room.live.c;
}
