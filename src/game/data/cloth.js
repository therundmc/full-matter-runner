// The velvet curtain across a doorway (props with def `curtain`): its cloth (engine/physics/Cloth.js, stepped by
// systems/Curtains.js) and its look (render/ClothArt.js). Lengths in px (1 m = 32 px), times in s.
export const CURTAIN = {
  cloth: {
    // the rod is the prop's length (def.h); two panels meeting in the middle, 7 columns each, 4 rows from the rings
    // (2.2 m up) down to the hem 0.1 m off the floor
    panels: 2, cols: 7, rows: 4, top: 70, drop: 67,
    fold: 2.2,         // px either side of the rod: the heading's pleats, the folds seen from above
    gravity: 314,      // px/s2 (9.81 m/s2): a lower point pushed out swings back as a pendulum
    drag: 2.4,         // /s: heavy velvet in still air, a couple of swings and it hangs still
    iters: 5,          // constraint passes a sub-step
    sub: 1 / 120,      // s a sub-step
    grip: 0.05,        // share of a collider's sliding speed handed to the cloth it touches, a sub-step
    slack: 40,         // px/s a point touched may leave the collider faster than the collider moves
    part: 60,          // px/s a point touched slides off to its side of the way (at a walk and faster)
    jamb: 16,          // px either side of the rod the doorway's jambs reach (half a wall): the cloth stays between
    thick: 1,          // px: the cloth's own thickness against a collider
    ring: { w: 0.5, drag: 7, home: 14, gap: 0.9 }, // inverse mass, rod drag /s, spring back /s2, closest two rings
    tear: { stretch: 1.9, speed: 420 },          // a rope stretched that much by something faster (px/s) tears
    sight: { rows: [1, 2], gap: 12 },             // the rows at a man's height; a gap that wide is seen through
  },
  // the cylinders that push it: people (the drawn build: shoulders), the dead and the debris on the floor
  person: { r: 12, top: 60 },
  body: { top: 16 },
  debris: { top: 8, min: 4 },  // px of height over its own; pieces smaller than `min` go through
  reach: 48,                   // px: nobody that close (and still) and it may sleep
  still: 1,                    // (px/s)^2 of mean squared speed under which it is still
  nap: 1,                      // s still before it sleeps (longer than a swing's turn)
  // what goes by pushes it too: a round (px/s to what it passes within `r` px), a blast (px/s at its heart, out to
  // `reach` x its radius)
  round: { r: 3, v: 90 },
  blast: { v: 900, reach: 3 },
  // placeholder sounds (assets/sound/PLACEHOLDERS.md): who walks into it, the rings run along the rod, a body thrown
  // through; `fast` px/s for the whoosh, `rings` px/s of the fastest ring, `gap` s between two of a kind
  sound: { brush: 'curtainBrush', rings: 'curtainRings', whoosh: 'curtainWhoosh', fast: 300, ringV: 25, gap: 0.6 },
  // flat velvet tones (dark to lit), its ink, the brass of the rod (dark, body, lit)
  look: {
    velvet: ['#3a0814', '#5e0c1e', '#86142c', '#ac2440', '#d0445c'],
    ink: '#14040a',
    brass: ['#5a4018', '#a8802c', '#e4c46a'],
    light: [-0.55, -0.65, 0.52],  // where the light comes from (x, y, up): the top left and above
    under: 0.6,                   // its alpha over the player while he is in it
  },
};
