// The lens: the last pass of the picture, done on the graphics card (render/PostGL.js), driven by render/Lens.js.
// The user's rule for it: at rest it is hardly seen (he found a stronger resting look "far too much"); it is a
// kill, a blast, a slide that it underlines. Keep the resting numbers low and put the punch in the events.
// Everything here is a look setting; nothing reads gameplay. Lengths in px are for a 1080 px high picture.
export const POST = {
  enabled: true,           // false (or ?post=0 in the address): the game draws as before, on its 2D canvas alone

  // ---- 1. colour fringe of the lens: radial, nothing at the centre, strongest in the corners (px there)
  fringe: {
    rest: 0.8,             // always there, a hair of colour on the edges of things near the corners
    trauma: 8,             // added at full camera shake (from a shake of `traumaFrom` on)
    traumaFrom: 0.15,
    blow: 8,               // added by a blow of power 1 (scaled by its power; half of it when it is not the player's)
    blast: 24,             // by an explosion in view
    shot: 3,               // by a shot of the player's (scaled by the weapon's own `shake`)
    kill: 20,              // by a kill of the player's (scaled by its power)
    max: 34,
    decay: 7,              // 1/s: how fast a pulse dies
  },

  // ---- 2. shock waves: a ring of bent picture running out from a blast (or the muzzle of a big gun)
  wave: {
    max: 4,
    blast: { speed: 1.5, life: 0.6, bend: 0.055 },    // speed in picture heights / s, bend in picture heights
    muzzle: { speed: 1.9, life: 0.2, bend: 0.018, from: 0.45 }, // only weapons whose `shake` reaches `from`
    width: 0.045,          // thickness of the ring, in picture heights
  },

  // ---- 3. heat: the air shimmers over fires, burning wrecks, pierced steam pipes, the spot of a recent blast
  heat: {
    max: 6,
    fire: { r: 130, k: 1.3 },        // world px, strength
    steam: { r: 80, k: 0.7 },
    blast: { r: 160, k: 1.8, life: 2.6 },
    // the shimmer itself (PostGL): ripples of `waves` per picture height across / down, running at `rates` rad/s,
    // pushing the picture by up to `amp` picture heights
    shimmer: { waves: [210, 170], rates: [8, 6.1], amp: 0.0017 },
  },

  // ---- 4. glow: only what is really bright bleeds, wide and soft (over the lighting's own bloom of the emitters)
  glow: { threshold: 0.88, knee: 0.1, strength: 0.07 },

  // ---- highlights: what is brighter than `knee` is pulled back by `soften` of the excess, so a lit sidewalk or a
  // shop window never burns out to plain white (the user: "too saturated, one sees nothing")
  tone: { knee: 0.62, soften: 0.5 },

  // ---- 5. grading, per situation. sat, con: saturation and contrast; gain: multiplies; lift: lightens the blacks
  // toward that colour (screen); tint + tintK: a soft-light wash. The picture eases from one to the next.
  grades: {
    calm: { sat: 1.22, con: 1.06, gain: [1, 1, 1], lift: [0, 0.04, 0.07], tint: [1, 0.16, 0.75], tintK: 0.07 },
    caution: { sat: 1.18, con: 1.09, gain: [1.02, 0.99, 0.96], lift: [0.015, 0.035, 0.055], tint: [1, 0.55, 0.2], tintK: 0.08 },
    combat: { sat: 1.3, con: 1.12, gain: [1.04, 0.98, 0.98], lift: [0.025, 0.02, 0.055], tint: [1, 0.12, 0.3], tintK: 0.1 },
    dark: { sat: 1.08, con: 1.16, gain: [1, 0.97, 0.98], lift: [0.02, 0.005, 0.035], tint: [1, 0.1, 0.1], tintK: 0.1 },
    dead: { sat: 0.32, con: 1.24, gain: [0.92, 0.96, 1.06], lift: [0, 0.02, 0.06], tint: [0.3, 0.5, 1], tintK: 0.14 },
    menu: { sat: 1.1, con: 1.04, gain: [1, 1, 1], lift: [0, 0.03, 0.06], tint: [1, 0.16, 0.75], tintK: 0.06 },
  },
  gradeEase: 2.2,          // 1/s

  // ---- 6. the tube: a hint of an old screen. All of it low: pixel art has to stay crisp.
  tube: {
    curve: 0.006,          // barrel of the glass (0 = flat)
    scan: 0.06,            // darkness of the scan lines
    mask: 0.02,            // phosphor triads
    bleed: 0,              // colour running sideways, like tape
    grain: 0.045,
    vignette: 0.6,
    vignetteFrom: 0.45,    // share of the way to the corners where the vignette starts
    glitch: { dead: 1, start: 0.7, life: 0.45 },   // tape tracking torn at death and at a (re)start
    // the torn tape: the picture cut in `bands` rows drawn again `rate` times a second, those over `from` (0..1 of a
    // hash) shifted sideways by up to `shift` of its width, the whole rolling `roll` of its height at `rollRate` rad/s
    tape: { bands: 26, rate: 24, shift: 0.11, from: 0.6, roll: 0.006, rollRate: 47 },
  },

  // ---- 7. speed: the picture smears along a slide, a roll, a dive; it streams from the player in slow motion.
  // OFF (all 0): the user tried the blurs in play and does not like how they look. Same for `tube.bleed` and for
  // the soft edges below; only the picture behind a menu is still blurred.
  speed: {
    slide: 0, roll: 0, dive: 0, slow: 0, ease: 9,   // picture heights; ease 1/s
    // AT THE WHEEL ONLY (level 2A, systems/Drive.js; the user asked for it there: the street did not feel fast). The
    // EDGES of the picture go with the speed, the road stays as drawn: no blur anywhere, and nothing at all within
    // band[0] of the middle line (his car, both lanes, who is alongside) nor within car[0] picture heights of his
    // car wherever it goes (up on a kerb: all of it again from car[1] on). There the scene is drawn 1:1 (Game.fit)
    // and the lens samples each of its px as it is: no barrel (`tube.curve`), no scan lines (`tube.scan`: they beat
    // with a car changing lanes under them), no zoom kick, and the lens' own colour fringe kept to the band too
    // (render/Lens.js `flat`). In the band, from the picture itself:
    //   streaks: the lights of the street (neons, lamps, lit windows) leave short trails behind them along the road,
    //   row by row (`rows` world px a row, each its own length, drawn again `flick` times a second): pixel combs,
    //   never a smooth smear; `len` picture heights the longest, flat out; `mix` of it laid over the picture
    //   lines: streaks of air drawn in the band, one world px thick, on `share` of the rows, running back along the
    //   road at `run` picture heights a second (each row its own pace and length), bone taking the colour of the
    //   lights they cross, `glow` at most
    //   pull: the band stretched along the road by this share flat out (what is in it runs past faster)
    //   split: the colours parted along the road (px at 1080), fringe: px added to the lens' own fringe
    //   dark: the band darkened by this share
    // How much of it: none under `from` (share of flat out), all of it flat out, along `curve` (over 1: it comes
    // late: at 60 km/h about half); eased at `ease` 1/s. A jolt of the car adds to it for an instant (`kick`: by
    // beat of the world's 'ride' event, dying at `decay` 1/s), with `fringe` px of colour at a kick of 1 (no zoom
    // kick: it resampled the whole picture, and the shove is thrown every second).
    drive: {
      from: 0.3, curve: 1.5, ease: 4, cap: 1.6, // cap: the speed's look and a jolt's added together, at most
      band: [0.24, 0.46], car: [0.28, 0.4], len: 0.17, rows: 2, flick: 14, mix: 0.9,
      lines: { share: 0.16, run: 2.6, glow: 0.42 },
      pull: 0.06, split: 7, fringe: 2.5, dark: 0.3,
      kick: { shove: 0.9, hit: 0.6, clip: 0.8, crash: 1, torn: 0.25, kerb: 0.2, decay: 5, fringe: 9 },
    },
  },

  // ---- 8. focus: the edges of the picture go soft; more when looking far (Shift); everything behind a menu
  focus: {
    edge: 0, title: 0, look: 0, dead: 0, pause: 1, results: 0.8, ease: 6,
    // where it goes soft: from `from` of the way out (the picture `tall` times taller than wide for it, k: its scale)
    shape: { from: 0.42, tall: 1.08, k: 0.78 },
  },

  // ---- 9. shafts: light streaming out of the brightest lamps in view
  // (each of the 10 steps of a shaft `decay` of the one before, the sum divided by `norm`)
  rays: { max: 3, strength: 0.06, reach: 0.55, minRadius: 110, decay: 0.86, norm: 6.5 },

  // ---- the rampage: while a chain of kills runs the whole picture heats up, from `from` kills to full at `full`:
  // colours, contrast, fringe (px), glow and vignette added at full; it eases back when the chain breaks
  rampage: { from: 2, full: 8, sat: 0.22, con: 0.09, fringe: 1.8, glow: 0.14, vignette: 0.1, ease: 3 },

  // ---- the punch of a kill of the player's: a zoom kick toward it, the colours pushed for an instant and, for the
  // heavy ones, an impact frame. This is where the lens is allowed to show.
  punch: {
    zoom: 0.045,           // at power 1
    zoomDecay: 11,         // 1/s
    sat: 0.4,              // saturation added at power 1, and contrast with it
    con: 0.16,
    kickDecay: 4.5,        // 1/s
    power: { finisher: 1, blast: 1, heavy: 0.85, blow: 0.7, round: 0.6 },   // how hard each kind of kill hits the lens
    // the chain: each kill of a chain hits the lens harder (power x (1 + each x kills before it), capped at max)
    combo: { each: 0.16, max: 2 },
    frame: 0.055,          // s of impact frame
    frameFrom: 0.8,        // power of a kill of the player's that earns one
    frameGap: 0.5,         // s at least between two of them
    cap: 1.6,              // the most a kill (or a kill cam beat) pushes the colours and the zoom, x its power
  },

  // ---- the kill cam's beats (systems/KillCam.js 'killcam', by tier; x the chain's crescendo): on top of the punch
  // above, a pulse of colour fringe (px), the colours pushed (`kick`, as a kill of that power), the vignette pulled
  // in while its slow motion lasts (`close`, eased at `ease` 1/s) and, for the heaviest, an impact frame of its own
  // (`frame` s, whatever the punch's gap). `out`: the fringe's flick as the clock snaps back.
  killcam: {
    combo: { fringe: 3, kick: 0.25, close: 0 },
    violent: { fringe: 9, kick: 0.7, close: 0.1 },
    exec: { fringe: 12, kick: 1, close: 0.16, frame: 0.05 },
    end: { fringe: 20, kick: 1.5, close: 0.24, frame: 0.085 },
    out: 5, ease: 14, max: 0.3,
  },

  // ---- slow motion: the picture tinted toward `color` (rgb) by `k` x how slow, under a time scale of `below`
  // (Game.drawScene, with or without the lens)
  slowTint: { color: [80, 0, 120], k: 0.22, below: 0.95 },
};
