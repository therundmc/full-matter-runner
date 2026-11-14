// The lens: the last pass of the picture, done on the graphics card (render/PostGL.js), driven by render/Lens.js.
// Everything here is a look setting; nothing reads gameplay. Lengths in px are for a 1080 px high picture.
export const POST = {
  enabled: true,           // false (or ?post=0 in the address): the game draws as before, on its 2D canvas alone

  // ---- 1. colour fringe of the lens: radial, nothing at the centre, strongest in the corners (px there)
  fringe: {
    rest: 2.4,             // always there, a hair of colour on the edges of things near the corners
    trauma: 10,            // added at full camera shake
    blow: 16,              // added by a blow of power 1 (scaled by its power; half of it when it is not the player's)
    blast: 26,             // by an explosion in view
    shot: 5,               // by a shot of the player's (scaled by the weapon's own `shake`)
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
    fire: { r: 130, k: 1.8 },        // world px, strength
    steam: { r: 80, k: 1 },
    blast: { r: 160, k: 2.2, life: 2.6 },
  },

  // ---- 4. glow: only what is really bright bleeds, wide and soft (over the lighting's own bloom of the emitters)
  glow: { threshold: 0.66, knee: 0.22, strength: 0.5 },

  // ---- 5. grading, per situation. sat, con: saturation and contrast; gain: multiplies; lift: lightens the blacks
  // toward that colour (screen); tint + tintK: a soft-light wash. The picture eases from one to the next.
  grades: {
    calm: { sat: 1.26, con: 1.08, gain: [1, 1, 1.02], lift: [0, 0.045, 0.085], tint: [1, 0.16, 0.75], tintK: 0.1 },
    caution: { sat: 1.18, con: 1.14, gain: [1.05, 0.99, 0.93], lift: [0.03, 0.03, 0.04], tint: [1, 0.55, 0.2], tintK: 0.14 },
    combat: { sat: 1.48, con: 1.24, gain: [1.08, 0.95, 0.97], lift: [0.045, 0.005, 0.05], tint: [1, 0.1, 0.28], tintK: 0.2 },
    dark: { sat: 1.1, con: 1.28, gain: [1.02, 0.94, 0.96], lift: [0.03, 0, 0.035], tint: [1, 0.08, 0.08], tintK: 0.16 },
    dead: { sat: 0.25, con: 1.3, gain: [0.9, 0.96, 1.08], lift: [0, 0.02, 0.07], tint: [0.3, 0.5, 1], tintK: 0.18 },
    menu: { sat: 1.1, con: 1.04, gain: [1, 1, 1], lift: [0, 0.03, 0.06], tint: [1, 0.16, 0.75], tintK: 0.06 },
  },
  gradeEase: 2.2,          // 1/s

  // ---- 6. the tube: a hint of an old screen. All of it low: pixel art has to stay crisp.
  tube: {
    curve: 0.02,           // barrel of the glass (0 = flat)
    scan: 0.11,            // darkness of the scan lines
    mask: 0.06,            // phosphor triads
    bleed: 0.22,           // colour running sideways, like tape
    grain: 0.06, 
    vignette: 0.72,
    glitch: { dead: 1, start: 0.7, life: 0.45 },   // tape tracking torn at death and at a (re)start
  },

  // ---- 7. speed: the picture smears along a slide, a roll, a dive; it streams from the player in slow motion
  speed: { slide: 0.02, roll: 0.015, dive: 0.022, slow: 0.08, ease: 9 },   // picture heights; ease 1/s

  // ---- 8. focus: the edges of the picture go soft; more when looking far (Shift); everything behind a menu
  focus: { edge: 0.3, title: 0.1, look: 0.6, dead: 0.75, pause: 1, results: 0.8, ease: 6 },

  // ---- 9. shafts: light streaming out of the brightest lamps in view
  rays: { max: 3, strength: 0.75, reach: 0.6, minRadius: 110 },

  // ---- the punch of a kill: a zoom kick toward the blow and, for the heavy ones, an impact frame
  punch: {
    zoom: 0.04,            // at power 1
    zoomDecay: 11,         // 1/s
    frame: 0.055,          // s of impact frame
    frameFrom: 0.8,        // power of a lethal blow of the player's that earns one
    frameGap: 0.5,         // s at least between two of them
  },
};
