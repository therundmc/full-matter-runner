// Global tuning. World units are pixels; 1 tile = TILE px.
import { TILE } from '../engine/physics/Units.js';

export { TILE }; // 1 tile = 1 m = 32 px (see engine/physics/Units.js)
export const FIXED_DT = 1 / 60;          // simulation step (seconds of game time at timeScale 1)
export const BASE_DELTA = 1000 / 60;     // Matter base delta (ms)

// Matter collision categories
export const CAT = {
  WALL: 0x0001,
  PROP: 0x0002,
  DOOR: 0x0004,
  CHAR: 0x0008,
  DEBRIS: 0x0010,
  ITEM: 0x0020,
  GLASS: 0x0040,
  CORPSE: 0x0080,
};

export const MASK = {
  WALL: 0xffff,
  PROP: CAT.WALL | CAT.PROP | CAT.DOOR | CAT.CHAR | CAT.DEBRIS | CAT.ITEM | CAT.GLASS | CAT.CORPSE,
  DOOR: CAT.PROP | CAT.CHAR | CAT.DEBRIS | CAT.ITEM | CAT.CORPSE,
  CHAR: CAT.WALL | CAT.PROP | CAT.DOOR | CAT.CHAR | CAT.GLASS | CAT.DEBRIS,
  DEBRIS: CAT.WALL | CAT.PROP | CAT.DOOR | CAT.DEBRIS | CAT.GLASS | CAT.CHAR,
  ITEM: CAT.WALL | CAT.PROP | CAT.DOOR | CAT.GLASS,
  GLASS: CAT.CHAR | CAT.DEBRIS | CAT.ITEM | CAT.PROP | CAT.CORPSE,
  GLASS_BROKEN: CAT.CHAR,
  CORPSE: CAT.WALL | CAT.PROP | CAT.DOOR | CAT.GLASS,
};

export const PLAYER = {
  radius: 8.5,
  speed: 2.95,        // px per base step (~177 px/s)
  accel: 0.42,        // velocity lerp per step
  lookAhead: 0.32,    // camera offset toward the cursor
  lookAheadFar: 0.75, // with Shift held
};

export const ENEMY = {
  radius: 8.5,
  walkSpeed: 1.0,
  runSpeed: 2.35,
  viewDist: 340,
  fov: Math.PI * 0.62,
  closeSense: 46,         // 360° awareness radius
  reaction: [0.6, 0.9],   // seconds before the first shot once the player is spotted
  reacquire: [0.32, 0.5], // same, when they were already alerted
  turnRate: 5,            // rad/s while aiming
  aimError: 0.07,         // extra random spread on enemy shots (rad)
  fireRateMul: 1.3,       // enemies shoot slower than the player
  hearing: 620,           // gunshot alert radius
  knockTime: 2.8,
};

export const PHYSICS = {
  pushForce: 650, // N a character can shove with (heavier/grippier objects won't budge)
  substeps: 2,    // Matter updates per simulation step (smoother contacts)
};

export const MAX_DEBRIS = 420;
export const MAX_PARTICLES = 4000;
export const COMBO_WINDOW = 3.2;

export const PALETTE = {
  pink: '#ff2a6d',
  cyan: '#05d9e8',
  purple: '#7a1fa2',
  yellow: '#f9c80e',
  orange: '#ff6b1a',
  white: '#fff4f0',
  ink: '#140c1c',
  blood: ['#7c0a0a', '#930d10', '#a8141a', '#6a0707', '#b81a1f'],
};

// hit points of destructible wall tiles (bullet = 1, sniper = 3, explosions a lot)
export const WALL_HP = { '#': 7, 'X': 14 };
