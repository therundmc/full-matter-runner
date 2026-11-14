// The lens: the last pass of the picture, done on the graphics card (render/PostGL.js), driven by render/Lens.js.
// The user's rule for it: at rest it is hardly seen (he found a stronger resting look "far too much"); it is a
// kill, a blast, a slide that it underlines. Keep the resting numbers low and put the punch in the events.
// Everything here is a look setting; nothing reads gameplay. Lengths in px are for a 1080 px high picture.
export const POST = {
  enabled: true,           // false (or ?post=0 in the address): the game draws as before, on its 2D canvas alone

  // ---- 1. colour fringe of the lens: radial, nothing at the centre, strongest in the corners (px there)
  fringe: {
    rest: 0.8,             // always there, a hair of colour on the edges of things near the corners
    trauma: 8,             // added at full camera shake
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
    glitch: { dead: 1, start: 0.7, life: 0.45 },   // tape tracking torn at death and at a (re)start
  },

  // ---- 7. speed: the picture smears along a slide, a roll, a dive; it streams from the player in slow motion.
  // OFF (all 0): the user tried the blurs in play and does not like how they look. Same for `tube.bleed` and for
  // the soft edges below; only the picture behind a menu is still blurred.
  speed: { slide: 0, roll: 0, dive: 0, slow: 0, ease: 9 },   // picture heights; ease 1/s

  // ---- 8. focus: the edges of the picture go soft; more when looking far (Shift); everything behind a menu
  focus: { edge: 0, title: 0, look: 0, dead: 0, pause: 1, results: 0.8, ease: 6 },

  // ---- 9. shafts: light streaming out of the brightest lamps in view
  rays: { max: 3, strength: 0.06, reach: 0.55, minRadius: 110 },

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
  },
};
