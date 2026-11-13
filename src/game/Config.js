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

// One guard (entities/Enemy.js, ai/Perception.js). Times in seconds, distances in px, angles in rad.
export const ENEMY = {
  radius: 8.5,
  walkSpeed: 1.0,
  runSpeed: 2.35,
  viewDist: 340,
  fov: Math.PI * 0.62,
  focusCone: 0.3,         // half-angle of the sharp centre of the view cone
  closeSense: [20, 46, 90], // 360° awareness radius by awareness (unaware / suspicious / alert)
  // detection meter (0..1): '?' from `suspicious`, '!' (combat) at 1
  spotTime: [0.45, 2.0],  // seconds to fill it at point blank / at viewDist (player still, centre of view, lit)
  suspicious: 0.3,
  peripheral: 0.35,       // detection multiplier at the edge of the view cone
  motion: [0.6, 0.95, 1.25], // detection multiplier: player still / walking / running
  light: [0.35, 1.1],     // detection multiplier = light[0] + light[1] * brightness (0 dark .. 1 lit)
  meterDecay: [0.16, 0.05], // meter loss per second out of sight (unaware / suspicious)
  visionTick: 0.05,       // line-of-sight check period while unaware (staggered between guards)
  // meter level a noise brings a guard to (footsteps add up instead, capped below alert)
  hear: { gunshot: 0.75, allyFire: 0.6, explosion: 0.75, wall: 0.6, glass: 0.5, door: 0.4, thrown: 0.5, body: 0.45, noise: 0.45, footsteps: 0.18 },
  hearError: 0.12,        // noise localisation error, fraction of the distance
  // reaction & aim: guards must telegraph before they fire
  reaction: [0.65, 0.95], // seconds from '!' to the first possible shot
  reacquire: [0.32, 0.5], // same, when the target pops up again
  turnRate: 5,            // rad/s while aiming
  aimTolerance: 0.18,     // max angle off target to pull the trigger
  aimError: 0.02,         // base random spread added to every enemy shot (Character.fire)
  aimErrorMax: 0.2,       // extra error on the first shots, shrinks while they keep the target in sight
  aimSettle: 1.6,         // seconds of steady sight to reach full accuracy
  aimMoveMul: 1.4,        // error multiplier on a running target
  fireRateMul: 1.3,       // enemies shoot slower than the player
  fireRange: 420,
  spareMags: 2,           // reserve of a guard (loose shells for shotguns)
  spareShells: 12,
  // preferred engagement distance per weapon [min, max]
  ranges: {
    shotgun: [40, 105], pistol: [110, 230], uzi: [90, 200], uzi_silenced: [90, 200], rifle: [180, 300], sniper: [220, 330], bazooka: [170, 320],
  },
  knockTime: 2.8,
  dizzy: [1.0, 1.6],      // stagger after getting up from a knock-down
};

// Squad brain (ai/Director.js): alert phases, noises, search sweeps, budgets.
export const AI = {
  vigilance: { normal: 1, caution: 1.3, evasion: 1.5, alert: 1.7 }, // detection speed per phase
  alertLinger: 4,         // seconds without a sighting before ALERT turns into EVASION
  evasion: 18,
  caution: 30,
  footstepRadius: 64,
  thrownRadius: 170,
  bodyFallRadius: 100,
  shoutRadius: 380,
  maxHunters: 4,          // guards converging on a contact at once (the others hold and watch)
  searchers: 6,           // guards sent on an evasion sweep
  searchTiles: 16,        // sweep radius (path distance in tiles) around the last known position
  searchSpots: 14,
  noiseGap: 0.25,         // the same source is heard at most this often (automatic fire)
  planBudget: 6,          // expensive AI work per step (path = 1, cover / flank search = 3)
  barkGap: 0.4,           // seconds between two barks in the whole squad
};

export const PHYSICS = {
  pushForce: 650, // N a character can shove with (heavier/grippier objects won't budge)
  substeps: 2,    // Matter updates per simulation step (smoother contacts)
};

export const MAX_DEBRIS = 180;    // physical loose pieces alive at once (oldest get baked into the floor)
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

// Vehicle lights in the sprite's local frame (px from the centre, +x forward): two headlight cones at (hx, ±hy)
// and two red tail light glows at (tx, ±ty). Positions match the lamps of the generated sprites.
const vehicleLights = (hx, hy, tx, ty) => [
  ...[-1, 1].map((s) => ({ r: 220, color: '#fff1c8', intensity: 0.85, x: hx, y: hy * s, cone: 0.42 })),
  ...[-1, 1].map((s) => ({ r: 48, color: '#ff1a3a', intensity: 0.7, x: tx, y: ty * s })),
];

// Lighting / post-processing (game/render/Lighting.js, PostFX.js). Light map colours are 0..1 multipliers of the scene.
export const LIGHTING = {
  enabled: true,
  scale: 0.5,              // light map texels per world px
  bloomScale: 0.25,        // bloom / reflection buffers, texels per world px
  ambient: {               // night tint per area (rgb 0..1)
    street: [0.26, 0.25, 0.4],
    inside: [0.22, 0.18, 0.36],
    neon: [0.36, 0.28, 0.5],
    wall: [0.2, 0.17, 0.32],
    void: [0.08, 0.06, 0.14],
  },
  falloff: [[0, 1], [0.12, 0.85], [0.35, 0.48], [0.65, 0.17], [1, 0]], // radial light profile (pos, alpha)
  softSamples: 3,          // jittered shadow samples (penumbra)
  softRadius: 3.5,         // px
  shadowBlur: 1,           // light map texels
  rimWidth: 12,            // px of wall face lit along the visible edges
  rimAlpha: 1,
  dynamicGain: 1.1,        // muzzle flashes / explosions in the light map
  dynamicShadows: true,
  charLight: { player: [52, 0.5], enemy: [40, 0.32], color: '#b9a8ff' }, // [radius px, intensity]
  fireLight: 0.32,
  overbright: 0.35,        // soft-light pass of the light map (punch on lit areas)
  haze: 0.04,              // additive light scattering
  bloom: 0.95,
  bloomBlur: [2, 6],       // texels of the two bloom blurs
  coreGlow: 0.55,          // glow blob on every light source (bloom)
  bulb: 0.5,               // small crisp hot spot at every light source
  neonGlow: 0.85,          // dancefloor emissive into bloom
  flare: 0.5,              // anamorphic streaks of very bright lights
  reflect: 0.55,           // wet floor reflections
  reflectFloors: ['asphalt', 'asphalt_line', 'sidewalk', 'checker', 'tile_blue', 'neon_floor'],
  bpm: 108,
  grade: { saturate: 1.22, contrast: 1.06, shadowTint: 'rgb(0,10,18)', highlightTint: 'rgba(255,40,190,0.07)' },
  grain: 0.05,
  aberration: 7,           // px at full camera trauma
  // lights of props whose def has no `light` field (upcoming props)
  propLights: {
    jukebox: { r: 90, color: '#ff4fd8', intensity: 0.85, flicker: 'pulse', y: 6 },
    neon_sign_palm: { r: 120, color: '#2af0ff', intensity: 1, flicker: 'buzz' },
    neon_sign_bar: { r: 120, color: '#ff2a6d', intensity: 1, flicker: 'broken' },
    neon_sign_arrow: { r: 100, color: '#ffc02a', intensity: 0.9, flicker: 'buzz' },
    streetlight: { r: 190, color: '#ffb46a', intensity: 0.9 },
    car: vehicleLights(67, 15.5, -68, 17.5),
    car2: vehicleLights(56, 15, -65, 13.5),
    van: vehicleLights(77, 16.5, -76, 24),
  },
};
