// The air of a level, as it is seen: the wet of a street after the rain, and the rain itself if it is ever wanted
// back (systems/Weather.js, render/WeatherArt.js; the user: "there is no rain", so `falls` is off), the smoke in
// the air (systems/Smoke.js, render/SmokeArt.js) and the faults of a few neon tubes (render/Flicker.js). Everything
// here is a look setting: readability first, so it stays thin and it is the lamps that make it show (rain and smoke
// are lit by the lighting, never glowing by themselves).
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
  mist: 0.14,              // haze in the open air at full rain (it catches the streetlights; render/SmokeArt.js)
  // loose paper (systems/Papers.js): soaked, it lies heavier and darker
  papers: { lift: 0.55, friction: 1.6, tints: ['#a39d8e', '#958f80', '#aca697'] },
};

// ---- smoke: the air of the level is a coarse fluid (systems/Smoke.js over engine/physics/Fluid.js) that carries a
// density of smoke. Seen from above it is the layer under the ceilings: the smokers' threads spread into it, a shot
// leaves a puff that rolls and lingers, a blast a billow; people walking and rounds flying drag the air, a ceiling
// fan turns it and thins it, an open door or a smashed window draws it out, and outdoors the wind takes it away.
// At rest there is hardly any: a faint layer that shows in the lamps' light (render/SmokeArt.js multiplies it by
// the light map twice, so the dark stays clear). Densities are 0..1 (what is shown is `look.gain` times that).
export const SMOKE = {
  cell: 16,                // px of a cell of the flow (2 to a tile)
  sub: 2,                  // cells of smoke to a side of a flow cell (8 px: the edge of the smoke is that fine)
  rate: 20,                // steps per s (the flow and the smoke take turns, a frame each, then one frame off)
  reach: 112,              // px simulated past the edges of the view (what is further waits as it is)
  sweeps: 10,              // pressure sweeps of a step
  drag: 0.35,              // 1/s lost by the air's own motion
  vorticity: 0.55,         // how hard the eddies are kept turning (vorticity confinement)
  spread: 6,               // px2/s of diffusion
  // what is over the rest level goes at this rate (1/s): a room keeps it 10-20 s, the open air takes it in a few
  loss: { room: 0.07, open: 0.45 },
  recover: 0.04,           // 1/s back up to the rest level once it has been blown away
  // the resting layer of a smoky place of the soundscape (its zones), patchy: `patchy` share of it varies over
  // patches of `patch` px; the power cut leaves `dark` of it (no lamp, no fan, nobody smoking at ease)
  rest: { zones: { bar: 0.13, vip: 0.11, office: 0.1, kitchen: 0.05 }, patchy: 0.75, patch: 90, dark: 0.4, ease: 0.2 },
  // slow convection under the ceilings: a current of `speed` px/s turning in cells of `size` px, changing over `period`
  // s, that the air is eased toward at `k` 1/s; outdoors the wind (px/s, its way in rad), gusts (systems/Papers.js)
  convect: { speed: 3.5, size: 150, period: 40, k: 0.6 },
  wind: { speed: 7, a: 0.5, gust: 45, k: 0.8 },
  shut: 0.12,              // rad off its frame under which a door is shut (no air through it)
  // an opening between a room and the open air draws the room's air out: pushed out at `speed` px/s (k of the way per
  // step), what is over the rest level in and before the opening spilling out at `spill` 1/s
  draft: { speed: 22, k: 0.25, spill: 0.6 },
  // a shot: a puff at the muzzle (`ahead` px in front), thrown forward by the muzzle blast; times `by` its weapon
  muzzle: {
    r: 13, amount: 1.4, ahead: 16, jet: 240, reach: 56, k: 0.9,
    by: { pistol: 1, uzi: 0.55, silenced: 0.25, shotgun: 2.2, rifle: 1.1, sniper: 2, rocket: 3 },
  },
  // a blast: the billow (`lumps` of smoke over `r` of its radius), the push out of it (volume 1/s at its heart),
  // eddies turning either way round it
  blast: { amount: 0.5, lumps: 8, r: 0.8, expand: 14, eddies: 6, spin: 5, vmax: 150 },
  fire: { r: 10, amount: 0.9 }, // per s over a burning spot (systems/Fires.js)
  // what stirs the air: someone walking (from `speed` px/s, over r px, k of the way per frame), a round (along its
  // line, at `speed` px/s), a ceiling fan (the air turning at `turn` times its blades' speed, capped at `vmax`, over
  // r px, and thinned at `mix` 1/s)
  stir: { speed: 25, r: 22, k: 0.3 },
  round: { r: 10, speed: 70, k: 0.3 },
  fan: { r: 70, turn: 0.12, vmax: 28, k: 0.08, mix: 0.12 },
  // a cigarette: a thread of smoke off the ember, swaying (px/s), curling (rad/s), carried by the air, that leaves
  // its smoke in the layer as it fades (`toGrid` of its alpha); a breath let out after a drag
  cig: {
    every: 0.05, life: [2.2, 3.2], alpha: 0.55, sway: 5, curl: 1.3, jitter: 3, grow: 1.4, toGrid: 0.03, max: 420,
    color: '#d8dae4',
    exhale: { r: 7, amount: 0.22, jet: 30, reach: 14 },
  },
  // the look: the density times `gain`, cut into flat bands of `step` (pixel-art steps, no blur; a band shows from
  // `from` of a step, its edge ragged by `rag` of a step), at most `levels` of them or `max`; it scatters the light
  // in its `tint` (lit by the light map twice, screened over the scene) and dims the scene under it by `dim` per unit
  look: { gain: 1, step: 0.06, levels: 7, max: 0.42, from: 0.55, rag: 0.5, tint: [0.86, 0.88, 0.96], dim: 0.55 },
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
