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
  // puddles of rain lying in the open (where: the water is liquid on the floor, kind `rain` in data/liquids.js, poured
  // into a hollow there): how many per 100 tiles of open floor, their radius, the floors they lie on, how close to
  // each other. The user (2026-11-17): the puddles did not look good, so none are laid (`per` 0); the wet sheen stays
  puddles: {
    per: 0, r: [9, 21], gap: 70, floors: ['asphalt', 'asphalt_line', 'sidewalk', 'concrete', 'dirt'],
    lobes: 9, squash: [0.5, 0.75], // ragged outline, flattened
  },
  // drips: water running off the eaves and any ladder out in the open, a drop every few seconds on the same spots
  drips: {
    per: 5,                // spots per 100 wall faces along an open floor
    every: [0.6, 2.4],     // s between two drops of a spot
    fall: 0.3,             // s a drop is seen coming down
    size: 1.4,             // px of the drop, at the bottom of its fall
    ladder: 3,             // spots under each ladder out in the open
    color: '#dfe8ff', alpha: 0.6,
  },
  // the wet: floors in the open mirror the lights harder (Lighting.post, x (1 + wet)), and the beams of the cars
  // lie on the road as a long sheen
  wet: 0.7,
  after: 0.3,              // the drops in the air again over the lit scene, this faint: the dark is not quite dry
  headlight: { gain: 0.45, len: 0.8, width: 0.18 }, // of the beam's reach
  mist: 0.14,              // haze in the open air at full rain (it catches the streetlights; render/SmokeArt.js)
  // loose paper (systems/Papers.js): soaked, it lies heavier and darker
  papers: { lift: 0.55, friction: 1.6, tints: ['#a39d8e', '#958f80', '#aca697'] },
};

// ---- smoke: the air of the level is a coarse fluid (systems/Smoke.js over engine/physics/Fluid.js) that carries
// what is in it, seen from above as the layer under the ceilings. Four kinds ride it, each with its own density:
// the grey smoke of gunfire, cigarettes and dust; the black soot of what burns or blows up; the white powder of an
// extinguisher; steam. People walking, rounds flying and cars going by drag the air, a ceiling fan turns it and
// thins it, an open door or a smashed window draws a room's air out, and outdoors the wind takes it away. At rest
// there is hardly any: a faint grey layer that shows in the lamps' light. Densities are about 0..1; what is shown of
// a kind is its density times its `look.gain`, as an opacity (render/SmokeArt.js).
export const SMOKE = {
  cell: 16,                // px of a cell of the flow (2 to a tile)
  sub: 2,                  // cells of smoke to a side of a flow cell (8 px: the edge of the smoke is that fine)
  rate: 20,                // steps per s (the flow and the smoke take turns, a frame each, then one frame off)
  reach: 112,              // px simulated past the edges of the view (what is further waits as it is)
  sweeps: 10,              // pressure sweeps of a step
  drag: 0.35,              // 1/s lost by the air's own motion
  vorticity: 0.55,         // how hard the eddies are kept turning (vorticity confinement)
  // the kinds, in the fluid's order. loss: 1/s of what is over the rest level, in a room and in the open air;
  // spread: px2/s of diffusion. look (render/SmokeArt.js): gain (density -> opacity), max (its opacity is never more:
  // what is in it still reads), glow (the colour of the light it scatters, lit by the light map twice: the dark
  // stays clear), pale (a colour lit once: it is white, it shows wherever there is a little light), veil (share of
  // the scene under it taken off where it is lit), soot (share taken off whatever the light: it is black).
  // sight: how much its density counts toward hiding what is behind it from the guards (`sight` below)
  kinds: {
    // gunfire, cigarettes, a short, dust: a fight's smoke hangs 10-20 s in a room, a few s outdoors
    smoke: {
      loss: { room: 0.07, open: 0.45 }, spread: 6, recover: 0.04, sight: 0,
      look: { gain: 1, max: 0.42, glow: [0.86, 0.88, 0.96], pale: null, veil: 0.55, soot: 0 },
    },
    // what burns and what blows up: near black, all but opaque at its heart (a little less than it was: the user),
    // it hangs 40-90 s in a room
    soot: {
      loss: { room: 0.022, open: 0.1 }, spread: 8, sight: 0.8,
      look: { gain: 1.1, max: 0.75, glow: [0.07, 0.065, 0.065], pale: null, veil: 0, soot: 1 },
    },
    // an extinguisher's powder: white, dense, gone in about ten s
    powder: {
      loss: { room: 0.14, open: 0.6 }, spread: 10, sight: 1,
      look: { gain: 1, max: 0.82, glow: [0.25, 0.25, 0.27], pale: [0.92, 0.94, 0.97], veil: 0.45, soot: 0.12 },
    },
    // steam: white, it condenses away in a few s and spreads quicker
    steam: {
      loss: { room: 0.55, open: 0.85 }, spread: 26, sight: 0.6,
      look: { gain: 1.1, max: 0.6, glow: [0.35, 0.37, 0.4], pale: [0.9, 0.93, 0.97], veil: 0.3, soot: 0 },
    },
  },
  // the bands they are cut into: flat steps of `step` opacity (pixel art, no blur), a band showing from `from` of a
  // step, its edge wavering by up to `rag` of a step (a smooth noise on the world's grid: contours, never speckled)
  look: { step: 0.06, from: 0.55, rag: 0.6 },
  // a guard does not see through `len` px or more of air at least `thick` thick (the kinds' densities times `sight`)
  sight: { thick: 0.55, len: 20 },
  // the player sees less in it too (systems/Smoke.js murk, render/Murk.js): how thick the air is about him (what
  // hides, as for the guards, averaged over `r` px round him) from `from` (nothing yet) to `full`; the view closes
  // in round him from `far` to `near` (picture heights still seen plainly), in `steps` flat rings over `width`, the
  // last `max` dark; eased at `ease` 1/s. Readability first: at its worst a room's width is still seen.
  murk: { r: 56, from: 0.08, full: 0.6, far: 0.8, near: 0.3, width: 0.24, steps: 5, max: 0.6, ease: 0.9, color: '#0c0808' },
  // the resting layer of grey of a smoky place of the soundscape (its zones), patchy: `patchy` share of it varies over
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
  // a shot: a puff out of the muzzle, `lumps` small ones strung along the bore over `ahead` px (r px each, growing
  // a little toward the far end), thrown on by the muzzle blast in a narrow jet (`jet` px/s over `reach` px, `width`
  // px either side of the bore: the user wanted it finer, tight along the line of the barrel); times `by` its weapon.
  // `port`: a smaller one out of the ejection port with the spent case (`off` px to the gun's right of it), thrown to
  // the right at `side` px/s
  muzzle: {
    r: 8.75, amount: 1.3, ahead: 26, lumps: 4, jet: 240, reach: 56, width: 16, k: 0.9,
    by: { pistol: 1, uzi: 0.55, silenced: 0.25, shotgun: 2.2, rifle: 1.1, sniper: 2, rocket: 3 },
    port: { r: 9.5, amount: 1, off: 5, side: 80, reach: 24, k: 0.7 },
  },
  // a blast: a billow of soot (`lumps` of it over `r` of its radius), the push out of it (volume 1/s at its heart),
  // eddies turning either way round it
  blast: { amount: 1.5, lumps: 12, r: 1.1, expand: 18, eddies: 6, spin: 5, vmax: 150 },
  // something burning: soot laid at `rate` per s over r px, never over `cap`, the hot air welling out of it (`swell`:
  // volume 1/s per s), times its `size`: a fire on the floor (systems/Fires.js), the small fires a blast leaves, a
  // burning car, its wreck, the flame of a pierced gas bottle, shorted electronics
  burn: { r: 10, rate: 0.55, cap: 0.95, swell: 1.2, size: { fire: 1, spot: 0.5, car: 3, wreck: 4, flame: 0.4, short: 0.3 } },
  // steady sources (per s over r px): a badly damaged engine (times how damaged)
  fumes: { engine: { kind: 'smoke', rate: 1.2, r: 6 } },
  // a jet out of a hole: `rate` per s of its kind laid over r px at the hole and further out (never over `cap`), the
  // air thrown along it at `speed` px/s over `reach` px (k of the way per step) and swelling out at its end (`swell`:
  // volume 1/s per s), thrashing `wobble` rad either way `hz` times a s, for `dur` s, its pressure falling to `fall`; a hiss every `hiss` s (the gas one, at `vol`, `pitch`)
  jets: {
    // a pierced wall extinguisher (props `cloud`): a white jet away from its wall, then the cloud it leaves
    powder: { kind: 'powder', r: 12, rate: 40, cap: 3, speed: 90, reach: 44, k: 0.35, swell: 14, wobble: 0.6, hz: 0.7, dur: 2.4, fall: 0.6, hiss: 0.25, vol: 0.9, pitch: 0.7 },
    // a steam pipe (props `steam: 'leak'`) holed by a round: a white jet out of the wall that whistles, three holes
    // a pipe at most
    leak: { kind: 'steam', r: 5, rate: 9, cap: 1.2, speed: 120, reach: 40, k: 0.5, swell: 0, wobble: 0.08, hz: 3, dur: 7, fall: 0, hiss: 0.25, vol: 0.6, pitch: 1.3, max: 3 },
  },
  // steam in the street (systems/Steam.js): a manhole breathes it in slow breaths (`breath` s every `rest` s, `rate`
  // per s over r px, welling out at `swell` 1/s) and seeps a little between (`seep` of the rate); a wall vent blows
  // a thin stream of it along its +y; the rain thickens it (`wet` more at full rain: cold drops on a warm cover)
  steam: {
    manhole: { breath: 3.5, rest: [4, 9], rate: 2.2, r: 11, swell: 1.5, seep: 0.12 },
    vent: { rate: 0.5, r: 6, speed: 28, reach: 18, k: 0.5 },
    wet: 0.5,
  },
  // a puff of `kind`: r px, amount at its heart, in `lumps` thrown about it (a wall coming down, a window torn out,
  // a screen caving in, a short, a dying motor (`amount` per unit of its `puff`), a fire doused, the spray of a
  // burst water main, a car's exhaust, a rocket's trail (per step))
  puffs: {
    wall: { kind: 'smoke', r: 18, amount: 0.9, lumps: 4 },
    window: { kind: 'smoke', r: 12, amount: 0.6, lumps: 3 },
    screen: { kind: 'soot', r: 9, amount: 0.8, lumps: 2 },
    short: { kind: 'soot', r: 5, amount: 0.35, lumps: 1 },
    motor: { kind: 'soot', r: 8, amount: 0.12, lumps: 3 },
    douse: { kind: 'steam', r: 16, amount: 1.1, lumps: 3 },
    spray: { kind: 'steam', r: 10, amount: 0.25, lumps: 1 },
    exhaust: { kind: 'smoke', r: 4, amount: 0.3, lumps: 1 },
    trail: { kind: 'smoke', r: 5, amount: 0.3, lumps: 1 },
  },
  // what stirs the air: someone walking (from `speed` px/s, over r px, k of the way per frame), a round (along its
  // line, at `speed` px/s), a car going by (from `speed` px/s, over r px), a ceiling fan (the air turning at `turn`
  // times its blades' speed, capped at `vmax`, over r px, and thinned at `mix` 1/s)
  stir: { speed: 25, r: 22, k: 0.3 },
  round: { r: 10, speed: 70, k: 0.3 },
  car: { speed: 40, r: 38, k: 0.25 },
  fan: { r: 70, turn: 0.12, vmax: 28, k: 0.08, mix: 0.12 },
  // a sprinkler head spraying brings down what is in the air within r px of it, at `rate` 1/s (systems/Sprinklers.js)
  wash: { r: 48, rate: 0.5 },
  // a cigarette: a thread of smoke off the ember, swaying (px/s), curling (rad/s), carried by the air, that leaves
  // its smoke in the layer as it fades (`toGrid` of its alpha); a breath let out after a drag; the slow thick cloud a
  // cigar's draw is blown out in (`cloud`, a breath each of its puffs); a thread off a butt left burning on the floor
  // or a barrel that has just fired a burst (`wisp`: every s, its alpha)
  cig: {
    every: 0.05, life: [2.2, 3.2], alpha: 0.55, sway: 5, curl: 1.3, jitter: 3, grow: 1.4, toGrid: 0.03, max: 420,
    color: '#d8dae4',
    exhale: { r: 7, amount: 0.22, jet: 30, reach: 14 },
    cloud: { r: 11, amount: 0.45, jet: 22, reach: 22 },
    wisp: { every: 0.1, alpha: 0.4 },
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
