// Where things stand in the title scene (logical px) and how far away they are. The view is from high up, his
// window on an upper floor: the low clouds and the skyline at the top, the block across the avenue below him (its
// roofs seen from above, its fronts going down to the street), the avenue, and in front of it all the elevated
// line on its steel, the trains passing at the level of his eyes' lower edge.
import { LH } from './Draw.js';
import { clamp } from './Timeline.js';

// parallax factor of each depth (how much it moves with the eye)
export const F = { clouds: 0.008, scud: 0.014, far: 0.02, mid: 0.05, near: 0.09, el: 0.22 };
export const HORIZON = 96;                       // his eye level
export const CLOUD_BASE = 30;                    // where the searchlights hit the low clouds

// the block across the avenue: x0..x1, roof's back edge (rb) and front parapet (pp) heights, facade colour
export const FOOT = 146;                         // where the fronts meet the far pavement
export const BLOCK = [
  { x0: -58, x1: 38, rb: 106, pp: 121, wall: ['#2c1c26', '#36222e'], kind: 'tank' },
  { x0: 38, x1: 118, rb: 113, pp: 129, wall: ['#26202e', '#2e2838'], kind: 'sign' },
  { x0: 118, x1: 194, rb: 103, pp: 117, wall: ['#2e1a1a', '#382222'], kind: 'stair' },
  { x0: 194, x1: 258, rb: 110, pp: 126, wall: ['#242030', '#2c2838'], kind: 'skylight' },
  { x0: 258, x1: 268, rb: 132, pp: 133, wall: ['#0c0a12', '#0c0a12'], kind: 'alley' },
  { x0: 268, x1: 352, rb: 104, pp: 119, wall: ['#30201c', '#3a2822'], kind: 'tower' },
  { x0: 352, x1: 442, rb: 111, pp: 127, wall: ['#28202c', '#302634'], kind: 'chimney' },
];

// the avenue: far pavement, kerb, the two lanes (y of a car's middle), the row parallax from the foot of the fronts
// (moving with the block) to the bottom of the picture (nearly with the elevated line)
export const AVE = { top: 128, walk: FOOT, kerb: 151, lanes: [163, 175] };
export const rowF = (y) => F.near + clamp((y - FOOT) / (LH - FOOT), 0, 1) * (F.el - 0.03 - F.near);

// the elevated line: the train's roof, its side, the rail bed seen from above, the plate girder, the columns
export const EL = { roof: 157, side: 162, bed: 183, rail: [184, 187], third: 189, girder: [190, 201], cols: [-84, 28, 140, 252, 364, 476], signal: 300 };

// the signs and lights of the city (logical px)
export const LUCKY = { x: 54, y: 101 };          // on the block's second roof, its back edge
export const HOTEL = { x: 309, y: 62 };          // vertical, on a building of the middle row
export const BOARD = { x: 22, y: 64, w: 48, h: 19 };   // the billboard on a roof of the middle row
export const LOANS = { x: 214, y: 82 };          // small red sign, middle row
export const DINER = { x: 206, y: 134 };         // over a shop of the block
export const LAMPS = [12, 104, 196, 288, 380];   // street lamps on the far pavement (x of the pole)

// colours of the lights, as rgb strings for the stepped halos
export const RGB = {
  pink: '255,58,140', cyan: '60,230,240', amber: '255,176,80', sodium: '255,170,70', red: '255,40,40',
  blue: '60,110,255', white: '235,240,255', warm: '255,214,150', spark: '190,225,255', lilac: '190,170,255',
};
