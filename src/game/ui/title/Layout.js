// Where things stand in the title scene (logical px) and the colours of its lights.
import { GY } from './Draw.js';

export const LAMP = { x: 338, y: 32 };                   // street lamp lens (foreground)
export const ROOF = 74;                                  // the bar's parapet
export const TUBE = { x: 22, y: 110, w: 30 };            // fluorescent tube over the pawn shop
export const WIN = { x: 122, y: 108, w: 44, h: 26 };      // the bar's window
export const HYD = { x: 226, y: 157 };                   // fire hydrant (its foot)
export const BOOTH = { x: 92, y: 155, w: 13, h: 34 };      // phone booth on the pavement (its foot: x .. x + w, y)
export const METER = { x: 146, y: 157 };                 // parking meter at the kerb
export const DRAIN = { x: 262 };                         // drain grate in the kerb face
export const MAN = { x: 156, y: 179 };                   // manhole in the road
export const DOORMAN = { x: 215, y: GY - 30 };           // top-left of his sprite
export const CAT = { x: 370, y: 71 };                    // on the sill of the lit window next door
export const PUDDLES = [[172, 176, 76, 7], [176, 167, 40, 3], [96, 172, 40, 4], [252, 183, 54, 5], [36, 170, 34, 4], [300, 171, 40, 4], [130, 188, 70, 5], [-30, 182, 50, 4], [210, 200, 60, 6], [118, 206, 44, 5]];

export const COLD = [0.62, 1, 0.82], WARM = [1, 0.62, 0.3], AMBER = [1, 0.66, 0.32], BOOTHC = [0.7, 0.86, 1];
export const PINK = [1, 0.17, 0.45], CYAN = [0.12, 0.85, 0.95], VIOLET = [0.6, 0.25, 1], BULB = [1, 0.62, 0.25];
export const AMB = [0.24, 0.18, 0.36];
