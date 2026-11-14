// The lens: the last pass of the picture, done on the graphics card (render/PostGL.js), driven by render/Lens.js.
// Everything here is a look setting; nothing reads gameplay. Lengths in px are for a 1080 px high picture.
export const POST = {
  enabled: true,           // false (or ?post=0 in the address): the game draws as before, on its 2D canvas alone

  // ---- 1. colour fringe of the lens: radial, nothing at the centre, strongest in the corners (px there)
  fringe: {
    rest: 1.1,             // always there, barely seen
    trauma: 7,             // added at full camera shake
    blow: 9,               // added by a blow of power 1 (scaled by its power; half of it when it is not the player's)
    blast: 16,             // by an explosion in view
    shot: 2.5,             // by a shot of the player's (scaled by the weapon's own `shake`)
    max: 22,
    decay: 7,              // 1/s: how fast a pulse dies
  },

  // ---- 2. shock waves: a ring of bent picture running out from a blast (or the muzzle of a big gun)
  wave: {
    max: 4,
    blast: { speed: 1.5, life: 0.55, bend: 0.03 },    // speed in picture heights / s, bend in picture heights
    muzzle: { speed: 1.9, life: 0.16, bend: 0.008, from: 0.45 }, // only weapons whose `shake` reaches `from`
    width: 0.045,          // thickness of the ring, in picture heights
  },

  // ---- 3. heat: the air shimmers over fires, burning wrecks, pierced steam pipes, the spot of a recent blast
  heat: {
    max: 6,
    fire: { r: 120, k: 1 },        // world px, strength
    steam: { r: 70, k: 0.55 },
    blast: { r: 150, k: 1.3, life: 2.2 },
  },

  // ---- 4. glow: only what is really bright bleeds, wide and soft (over the lighting's own bloom of the emitters)
  glow: { threshold: 0.72, knee: 0.2, strength: 0.3 },

  // ---- 5. grading, per situation. sat, con: saturation and contrast; gain: multiplies; lift: lightens the blacks
  // toward that colour (screen); tint + tintK: a soft-light wash. The picture eases from one to the next.
  grades: {
    calm: { sat: 1.22, con: 1.06, gain: [1, 1, 1], lift: [0, 0.04, 0.07], tint: [1, 0.16, 0.75], tintK: 0.07 },
    caution: { sat: 1.16, con: 1.1, gain: [1.02, 0.99, 0.97], lift: [0.02, 0.03, 0.05], tint: [1, 0.55, 0.2], tintK: 0.08 },
    combat: { sat: 1.34, con: 1.16, gain: [1.05, 0.97, 0.98], lift: [0.03, 0.01, 0.05], tint: [1, 0.12, 0.3], tintK: 0.12 },
    dark: { sat: 1.05, con: 1.2, gain: [1, 0.96, 0.98], lift: [0.02, 0, 0.03], tint: [1, 0.1, 0.1], tintK: 0.1 },
    dead: { sat: 0.38, con: 1.22, gain: [0.92, 0.96, 1.06], lift: [0, 0.02, 0.06], tint: [0.3, 0.5, 1], tintK: 0.12 },
    menu: { sat: 1.1, con: 1.04, gain: [1, 1, 1], lift: [0, 0.03, 0.06], tint: [1, 0.16, 0.75], tintK: 0.06 },
  },
  gradeEase: 2.2,          // 1/s

  // ---- 6. the tube: a hint of an old screen. All of it low: pixel art has to stay crisp.
  tube: {
    curve: 0.012,          // barrel of the glass (0 = flat)
    scan: 0.07,            // darkness of the scan lines
    mask: 0.035,           // phosphor triads
    bleed: 0.12,           // colour running sideways, like tape
    grain: 0.045,
    vignette: 0.62,
    glitch: { dead: 1, start: 0.7, life: 0.45 },   // tape tracking torn at death and at a (re)start
  },

  // ---- 7. speed: the picture smears along a slide, a roll, a dive; it streams from the player in slow motion
  speed: { slide: 0.011, roll: 0.008, dive: 0.012, slow: 0.045, ease: 9 },   // picture heights; ease 1/s

  // ---- 8. focus: the edges of the picture go soft; more when looking far (Shift); everything behind a menu
  focus: { edge: 0.22, title: 0.06, look: 0.6, dead: 0.75, pause: 1, results: 0.8, ease: 6 },

  // ---- 9. shafts: light streaming out of the brightest lamps in view
  rays: { max: 3, strength: 0.3, reach: 0.5, minRadius: 110 },

  // ---- the punch of a kill: a zoom kick toward the blow and, for the heavy ones, an impact frame
  punch: {
    zoom: 0.022,           // at power 1
    zoomDecay: 11,         // 1/s
    frame: 0.055,          // s of impact frame
    frameFrom: 0.8,        // power of a lethal blow of the player's that earns one
    frameGap: 0.5,         // s at least between two of them
  },
};
