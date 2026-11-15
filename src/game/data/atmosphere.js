// The air of a level, as it is seen: the wet of a street after the rain, and the rain itself if it is ever wanted
// back (systems/Weather.js, render/WeatherArt.js; the user: "there is no rain", so `falls` is off), the smoke
// that hangs in a bar under its lamps (systems/Haze.js, render/HazeArt.js) and the faults of a few neon tubes
// (render/Flicker.js). Everything here is a look setting: readability first, so it stays thin and it is the lamps
// that make it show (rain and haze are lit by the lighting, never glowing by themselves).
// Lengths in world px, times in seconds, alphas 0..1.

// ---- rain. How wet the open air is comes from the level (`soundscape.rain`, 0..1); `look` turns that into what is
// seen. Nothing falls unless `falls` is on (drops, crowns, rings in the water, drips off the eaves): by default it
// has rained earlier, and what is left is the puddles, the wet floors mirroring the neons and the beams, a light
// mist round the lamps, soaked paper, thicker steam. Only where there is sky: never under a roof (AMBIENCE.indoors).
export const RAIN = {
  falls: false,            // the user does not want rain falling: keep it off
  look: 1.5,               // seen strength per unit of the level's rain (capped at 1)
  // drops: the sky is cut into square cells, each with its own drops on a cycle; nothing is stored, a drop's
  // place and timing are hashed from its cell, its slot and its cycle
  cell: 64,                // px of a cell
  drops: 14,               // slots per cell at full strength
  fall: [0.14, 0.24],      // s a drop is seen falling
  run: 22,                 // px it crosses the picture while it falls (blown by the wind)
  wind: 1.9,               // rad: the way it falls across the picture (pi/2 = straight down the screen)
  len: [5, 10],            // px of streak
  streak: { color: 'rgba(205,220,255,1)', alpha: [0.25, 0.5], width: 0.8 },
  // where it lands: a crown of a few pixels thrown out (not every drop: some land on something dark)
  splash: { life: 0.2, size: 2.6, odds: 0.55, color: '#e4ecff', alpha: 0.32 },
  // standing water: rings spreading where drops land in it
  ripple: { per: 260, life: 0.85, size: [2.5, 6.5], color: 'rgba(200,220,255,1)', alpha: 0.32, width: 0.6 },
  // puddles of rain lying in the open (drawn like LIQUIDS water, mirror the lights in Lighting.post): how many per
  // 100 tiles of open floor, their radius, the floors they lie on, how close to each other
  puddles: {
    per: 1.6, r: [9, 21], gap: 70, floors: ['asphalt', 'asphalt_line', 'sidewalk', 'concrete', 'dirt'],
    lobes: 9, squash: [0.5, 0.75], // ragged outline, flattened
    look: { body: 'rgba(6,10,26,0.34)', sheen: 'rgba(130,170,235,0.04)', glint: '#d4e6ff', ring: 'rgba(170,210,255,0.16)',
      sky: 'rgba(30,38,74,0.26)' }, // `sky`: the night sky they mirror, added over the lit scene (Lighting.post)
    splash: { stride: 22, drops: 3, speed: 80, color: 'rgba(200,225,250,0.5)' }, // someone walking through it
  },
  // drips: water running off the eaves and the fire escape, a drop every few seconds on the same spots
  drips: {
    per: 5,                // spots per 100 wall faces along an open floor
    every: [0.6, 2.4],     // s between two drops of a spot
    fall: 0.3,             // s a drop is seen coming down
    size: 1.4,             // px of the drop, at the bottom of its fall
    ladder: 3,             // spots under each ladder (the fire escape)
    color: '#dfe8ff', alpha: 0.6,
  },
  // the wet: floors in the open mirror the lights harder (Lighting.post, x (1 + wet)), and the beams of the cars
  // lie on the road as a long sheen
  wet: 0.7,
  after: 0.3,              // the same rain again over the lit scene, this faint: the dark is not quite dry
  headlight: { gain: 0.45, len: 0.8, width: 0.18 }, // of the beam's reach
  mist: 0.14,              // haze in the open air at full rain (it catches the streetlights; render/HazeArt.js)
  // loose paper (systems/Papers.js): soaked, it lies heavier and darker
  papers: { lift: 0.55, friction: 1.6, tints: ['#a39d8e', '#958f80', '#aca697'] },
};

// ---- haze: the smoke that hangs under a ceiling. A place of the soundscape (its zones) with a density here is
// filled with it; the lamps light it (the light map squared: the dark stays clear, the lamps glow in it), the
// smokers feed it, guns thicken it, people running and rounds flying stir it, and it thins once the power is cut.
export const HAZE = {
  zones: { bar: 0.4, vip: 0.3, office: 0.3, kitchen: 0.14, shop: 0.06 },
  gain: 0.85,              // how much it shows (screened over the lit scene)
  base: 0.25,              // share of the density spread evenly; the puffs add up to the rest
  range: 520,              // px from the player past which a zone's smoke is left still
  // the puffs: soft cloudy blobs drifting slowly round the room, turning, pushed about (one per `per` tiles of the zone;
  // drift px/s2 of their own current, home 1/s2 pull back to where they started, drag 1/s, spin rad/s)
  puff: { per: 5, r: [40, 80], alpha: [0.45, 0.85], drift: 4, home: 0.05, drag: 0.6, spin: 0.06, sprite: 96, stretch: 1.9 },
  shafts: { k: 0.35, r: 0.38, min: 60 }, // smoke thicker in each lamp's beam: x density, share of its reach, lamps from r px
  dark: 0.35,              // density left once the power is cut (no fan, no lamp: what is left is hardly seen)
  ease: 0.35,              // 1/s the density follows
  gunsmoke: { add: 0.035, max: 0.45, fade: 0.04, puff: 0.6 }, // per shot fired in the zone, its cap, lost per s
  // what stirs it: people running (speed px/step), rounds (px either side of their line), blasts
  stir: { speed: 1.6, r: 40, push: 0.9, spin: 2, round: 16, roundPush: 30, blast: 260 },
  // dust motes in the light: tiny specks floating where a lamp shines into the smoke
  motes: { per: 60, alpha: 0.55, color: '#fff0d8', drift: 3, from: 0.38 }, // per 100 tiles; `from`: light level they show at
  // cigarettes: a thread of smoke curling up off the ember, a breath let out after a drag (fed into the zone)
  smoke: {
    every: 0.22, life: [2.2, 3.4], size: [1.6, 2.6], grow: 3.2, rise: [6, 12], sway: 7, alpha: 0.2,
    exhale: { puffs: 4, speed: 22, life: 2.4, size: 4, alpha: 0.24 },
    max: 90,               // wisps alive at once
    color: [214, 216, 226],
  },
};

// ---- neon and tubes with a fault. Most of them buzz quietly (flicker 'buzz'); a few picked per level stutter,
// one is dying. Picked from the props of the given types, the same ones every time (hashed from where they are).
export const NEON = {
  faults: [
    { kind: 'dying', count: 1, types: ['tube_light'] },
    { kind: 'stutter', count: 2, types: ['neon_tube_pink', 'neon_tube_cyan', 'neon_sign_wash', 'neon_sign_video', 'neon_sign_liquor', 'neon_sign_palm'] },
  ],
  stutter: { every: [3, 7], burst: [0.25, 0.6], rate: 18, low: 0.12 }, // s between bursts, s of a burst, cuts/s, level when cut
  dying: { cycle: [5, 9], dark: 0.4, tries: [2, 5], hold: 0.42, low: 0.04 }, // share of the cycle left dark, strikes before it catches, share it holds lit
};
