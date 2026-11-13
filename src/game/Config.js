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
  EDGE: 0x0100, // invisible barriers just outside the map (TileMap.buildEdgeBodies): traffic and walkers ignore them
};

export const MASK = {
  WALL: 0xffff,
  PROP: CAT.WALL | CAT.PROP | CAT.DOOR | CAT.CHAR | CAT.DEBRIS | CAT.ITEM | CAT.GLASS | CAT.CORPSE | CAT.EDGE,
  DOOR: CAT.PROP | CAT.CHAR | CAT.DEBRIS | CAT.ITEM | CAT.CORPSE,
  CHAR: CAT.WALL | CAT.PROP | CAT.DOOR | CAT.CHAR | CAT.GLASS | CAT.DEBRIS | CAT.EDGE,
  DEBRIS: CAT.WALL | CAT.PROP | CAT.DOOR | CAT.DEBRIS | CAT.GLASS | CAT.CHAR | CAT.EDGE,
  ITEM: CAT.WALL | CAT.PROP | CAT.DOOR | CAT.GLASS | CAT.EDGE,
  GLASS: CAT.CHAR | CAT.DEBRIS | CAT.ITEM | CAT.PROP | CAT.CORPSE,
  GLASS_BROKEN: CAT.CHAR,
  CORPSE: CAT.WALL | CAT.PROP | CAT.DOOR | CAT.GLASS | CAT.EDGE,
};

export const PLAYER = {
  radius: 8.5,
  speed: 2.95,        // px per base step (~177 px/s)
  accel: 0.42,        // velocity lerp per step
  lookAhead: 0.32,    // camera offset toward the cursor
  lookAheadFar: 0.75, // with Shift held
  // Space while running with nothing to vault (systems/Slide.js): ~0.5 s, ~2.9 m
  slide: {
    dur: 0.5,         // s
    boost: 1.95,      // start speed, x run speed
    end: 0.6,         // speed at the end (handed back to the run), x run speed
    cooldown: 0.5,    // s after a slide before the next one
    minSpeed: 0.45,   // x run speed needed to start one
    knockSpeed: 1.1,  // x run speed: still fast enough to sweep a standing enemy off his feet
    stall: 0.3,       // measured / wanted speed under which an obstacle ends the slide
    hitMomentum: 0.6, // share of our momentum given to loose props we plough into
  },
};

// Space right behind a standing guard who has his back to us (systems/Takedown.js, Player.updateTakedown):
// arms round his neck, one wrench; with the knife, his throat. Silent, but it takes its time.
export const TAKEDOWN = {
  reach: 26,     // px between the two
  rear: 1.05,    // half-angle (rad) of the arc behind his back we must stand in
  facing: 1.2,   // how far (rad) we may be aiming away from him
  dur: 0.62,     // s, the whole move
  killAt: 0.56,  // share of it at which the neck goes
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
  music: { normal: 0.35, caution: 0.6, evasion: 0.8, alert: 1 },    // soundtrack intensity per phase
  combatMusic: ['alert'], // phases during which the soundtrack plays its combat variant
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
  // The player's wet or bloody footprints (ai/Trail.js, Enemy.doTrack). fresh: s a print stays readable; max: prints
  // kept; gap: px between two prints of the same run; hop: px a tracker walks at a time; sight: share of the view
  // distance at which a print is noticed, close: px all around; ahead: px he goes on past the last print.
  trail: { fresh: 45, max: 48, gap: 60, hop: 70, sight: 0.45, close: 36, ahead: 96 },
  barkGap: 0.4,           // seconds between two barks in the whole squad
  barkMemory: 8,          // lines the squad has just used and will not repeat
  tauntGap: [6, 12],      // seconds between two curses of a guard in a fight
  // The last guard alive may give up when he next faces the armed player within `range` px (Enemy.surrender):
  // only in a squad of at least `squad`, with these odds (a brute rarely does); beg: s between two pleas.
  surrender: { squad: 4, odds: 0.55, brute: 0.15, range: 230, beg: [2.4, 4.5] },
  // An unarmed stranger hanging about in front of a guard on public ground (Perception.loiterRate, Enemy.mind):
  // bothered within `near` px; patience = seconds before he snaps at `near` / at `close` px; shares of it at which
  // he tells him to clear off (`first`) and warns him a last time (`last`); `forget` = share won back per second.
  loiter: { near: 120, close: 40, patience: [8, 2.4], first: 0.12, last: 0.55, forget: 0.1 },
};

export const PHYSICS = {
  pushForce: 650, // N a character can shove with (heavier/grippier objects won't budge)
  substeps: 2,    // Matter updates per simulation step (smoother contacts)
};

// Wet floors (systems/Liquids.js). Lengths in px, areas in px2, times in s.
export const LIQUIDS = {
  maxPuddles: 16,
  grip: 0.55,     // floor grip multiplier where it is wet
  minPool: 4,     // a blood pool smaller than this wets no shoe
  stride: 17,     // between two footprints (alternating feet)
  gait: 3,        // half the distance between the left and the right foot
  smear: 7,       // length of one stroke of a slide's smear
  fade: 6,        // a drying puddle fades out over its last seconds
  // prints: steps a wet sole keeps marking; wet: seconds it stays wet once nothing feeds it;
  // color / alpha: of the prints; splash: drops kicked up when running through it
  kinds: {
    blood: { prints: 16, wet: 45, color: '#5c0a0c', alpha: 0.9 },
    water: { prints: 9, wet: 70, color: '#0b0f1c', alpha: 0.55, splash: 'rgba(110,160,200,0.14)' },
  },
  hydrant: { kind: 'water', rate: 1600, dur: 9, cap: 66 }, // a burst hydrant floods ~2 m around it
};

// Ambient street life (systems/Ambient.js): traffic on level.ambient.traffic lanes, passers-by on
// level.ambient.walkers paths. Distances in m (= tiles), speeds in m/s, times in s, unless noted.
export const AMBIENT = {
  maxCars: 8,              // moving traffic vehicles at once (all lanes)
  maxWalkers: 9,           // civilians at once (all paths)
  margin: 3,               // m beyond the map edge (past the vehicle's half length) where traffic spawns / despawns
  prewarm: 0.6,            // fraction of the steady-state traffic / crowd placed on the street when the level starts
  // driving
  speedVar: 0.12,          // per car cruise speed spread (fraction of the lane speed)
  accel: 3,                // m/s² pulling away
  brake: 6,                // m/s² comfortable braking (behind traffic)
  emergency: 9,            // m/s² hard braking (sudden obstacle)
  headway: 1.2,            // s of time gap kept behind the vehicle ahead
  minGap: 1.6,             // m bumper to bumper when stopped
  lanePad: 0.15,           // m added to each side of a vehicle's width when looking for obstacles in its lane
  wobble: [0.12, 0.12],    // lateral drift: max amplitude (m), cycles per s (drivers are not on rails)
  steer: 0.9,              // heading correction per m of lateral error (rad)
  maxSteer: 0.22,          // rad
  patience: [2.5, 4.5],    // s stopped behind a static obstacle before going around it
  // going around it: m of extra stopping room behind it, rad of steering, m/s pulling out, s backing up when wedged
  detour: { room: 2, steer: 0.55, speed: 3, reverse: 1 },
  giveUp: 25,              // s at a standstill before a jammed driver switches the engine off (parked car)
  jam: 10,                 // s a lane's spawn stays blocked before the lane stops spawning (no deadlock)
  reopen: 6,               // s of clear lane before a closed lane spawns again
  panicBoost: 1.35,        // a driver under fire floors it
  coast: [2, 4],           // m/s² a disabled car slows down with (dead driver / burst tyre / on fire)
  swerve: [0.5, 1.1],      // m a disabled car drifts sideways before it stops
  bailOut: 0.8,            // chance the driver of a burning / shot-up car gets out alive and runs
  // people vs cars
  lethal: 3.2,             // m/s: faster than this, a hit kills (one hit kills, guards and player alike)
  shove: 1.3,              // ragdoll launch speed as a fraction of the car speed
  attention: [0.55, 1.4],  // m (+ 0.25 s of travel) ahead where a driver notices a person: late, rarely stops in time
  passby: { lead: 1.4, range: 15, vol: 0.55 }, // s before the closest pass, m of lateral hearing range, loudness
  // pedestrians (speeds in m/s)
  walk: [1.05, 1.45],
  run: [4.2, 5.2],
  coupleChance: 0.3,       // a spawn is two people walking side by side
  stopChance: 0.35,        // a walker stops once on the way (cigarette, shop window, phone)
  stop: [3, 7],            // s
  panic: {
    hear: 1,               // fraction of a gunshot / explosion noise radius that panics passers-by
    witness: 9,            // m: a kill seen that close
    corpse: 4.5,           // m: a dead body in view
    armed: 4,              // m: the player with a gun drawn
    spread: 6,             // m: a screaming passer-by panics the others around
    freeze: [0.35, 0.9],   // s of hands up / ducking before running
    check: 0.25,           // s between two sight checks (staggered)
    calm: 20,              // s without new passers-by after gunfire / an explosion (word gets around)
  },
  barkGap: 0.35,           // s between two civilian screams on screen
};

export const MAX_DEBRIS = 180;    // physical loose pieces alive at once (oldest get baked into the floor)
export const MAX_PARTICLES = 4000;

// Off-screen guard markers (systems/Threats.js, ui/Indicators.js): only guards the player can plausibly know about,
// just outside the view. Deliberately faint.
export const INDICATORS = {
  reach: 300,        // px beyond the screen edge: further guards get no marker at all
  seenFor: 5,        // s a guard seen on screen is remembered
  heardFor: 3,       // s after a shot, a shout or running steps
  runSpeed: 1.6,     // px/step: faster than this, his steps are heard
  seen: 0.55,        // marker strength of a remembered guard (a hunting one is 1)
  suspicious: 0.5,   // of a guard looking for the source of a noise
  alpha: 0.34,       // opacity of the strongest marker
  aimAlpha: 0.62,    // peak of the pulse when he has the player in his sights / just fired
};

// End-of-level replay (render/Replay.js): downscaled frames of the last seconds, saved as clips around the kills.
export const REPLAY = {
  w: 384, h: 216,    // px of a recorded frame
  fps: 15,
  frames: 30,        // length of the rolling buffer and of a clip (2 s)
  post: 0.75,        // s kept after the (last) kill of a clip
  lead: 0.5,         // s always kept before the first kill, however long the clip is stretched by more kills
  clips: 6,          // clips kept (the best ones): (clips + 1) * frames * w * h * 4 bytes of canvas, about 70 MB
  slow: 0.22,        // playback speed around a kill
  slowBefore: 0.3,   // s of slow motion before / after the kill frame
  slowAfter: 0.45,
  focus: 0.37,       // share of the screen width where the middle of the footage sits (the score column is on the right)
};

// Prop destruction (entities/Prop.js, data/destruction.js): caps that keep a shredded room cheap.
export const DESTRUCTION = {
  physicalShare: 0.6,  // above this share of MAX_DEBRIS, new pieces are visual shards only
  maxPhysicalParts: 6, // physical pieces per collapse (the rest are shards baked into the floor)
  heavyArea: 900,  // px2 of sprite: bigger furniture slumps in place instead of flying apart (blasts excepted)
  heavyParts: 7,   // big parts it leaves then
  maxBits: 18,         // loose contents spilled per collapse (balls, books...)
  maxFloats: 260,      // stuffing / paper / feathers floating at once
  maxLeaks: 3,         // liquid jets per prop
  stageDelay: [0.07, 0.16], // crack -> sag -> fall apart (s); explosions skip most of it
};

export const PALETTE = {
  pink: '#ff2a6d',
  cyan: '#05d9e8',
  purple: '#7a1fa2',
  yellow: '#f9c80e',
  orange: '#ff6b1a',
  white: '#fff4f0',
  ink: '#140c1c',
  blood: ['#780b0f', '#8c1014', '#9a1418', '#560709', '#aa1c1e'], // drops in the air; [3] dark meat, [4] wet flesh
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
    roof: [0.17, 0.2, 0.34], // flat roofs of the neighbouring buildings: darker than the street, out of play
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
  puddle: 0.5,             // extra reflections in standing water
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
    streetlight: { r: 190, color: '#ffb46a', intensity: 0.9, x: 56 },
    car: vehicleLights(67, 15.5, -68, 17.5),
    car2: vehicleLights(56, 15, -65, 13.5),
    van: vehicleLights(77, 16.5, -76, 24),
  },
};
