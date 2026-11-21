// A billboard's face (prop mount 'billboard', data/mounts.js): what the rounds and the blasts do to it
// (entities/Board.js decides, render/BoardArt.js paints). The frame, the catwalk and the posts are a structure:
// nothing moves them, nothing brings them down, no round stops on them. Sprite px are world px (the sprite's own
// size, `size`).
//   stage 0  every round through the face punches a hole where its line crosses it
//   stage 1  (peel)  the paper tears round the hits and hangs in strips, the bare sheets under it
//   stage 2  (rip)   the lettering is ripped, sheets torn out: the frame's lattice and what is under it show
//   stage 3  (gone)  the face is destroyed: shreds left hanging off the frame, paper flying; the frame stays
// Its lamps are shot out one by one (the first one a round's line crosses): the light goes, sparks, glass.
export const BOARD = {
  hp: 24,                                       // what the face takes before it is gone, in pistol rounds
  dmg: { pellet: 0.5, bullet: 1, rifle: 2, graze: 0.5, shrapnel: 0.5 },
  stages: [0.7, 0.4, 0],                        // share of hp left at which it peels, rips, is gone
  hole: { pellet: 0.7, bullet: 1.2, rifle: 1.7, shrapnel: 0.9 },   // radius, world px
  // stage 1 on, at each hit: the paper torn off round it (odds, radius px), strips of it left hanging (how many,
  // px wide, px they hang below the tear)
  peel: { odds: 0.6, r: [3, 7], strips: [0, 2], width: [2, 5], drop: [4, 12] },
  // stage 2 on, at each hit: the sheet torn out round it (radius px), in a wider tear of the paper
  rip: { r: [2, 4], paper: [5, 9] },
  // entering a stage: tears at once (peel: at the last hits, `r` px; rip: across the lettering, the sheets torn
  // out in their middle), strips hanging off them
  burst: { peel: { n: 4, r: [7, 13] }, rip: { n: 5, r: [9, 16], core: 0.55 }, strips: [2, 4] },
  // the face gone: shreds left hanging off the frame's top rail and its stringers (how many, px long, px wide),
  // loose sheets to the ground (systems/Papers.js) and paper floating down
  gone: { shreds: [16, 24], long: [4, 18], width: [2, 6], papers: 14, v: 120, floaters: 40 },
  // a blast: its damage at the face's nearest point, out to `reach` blast radii; a sheet torn out at that point
  // beyond `core` of its strength; lamps within `lamps` radii go out
  blast: { dmg: 16, reach: 1.8, r: [8, 26], core: 0.45, lamps: 1.1 },
  lift: 40,                                     // px up the bits start from (particles' z)
  // placeholders (assets/sound/PLACEHOLDERS.md)
  sound: { hole: 'boardHole', lamp: 'boardLamp', tear: 'boardTear', gone: 'boardFall' },
};

// what a cell (a sprite pixel) of a face is now: the poster, the bare sheets, gone (the lattice), a lamp shot out
// (never repainted)
export const CELL = { PAPER: 0, BARE: 1, GONE: 2, LOCK: 9 };

// How each one is laid out in its sprite (tools/sprites/billboards.py billboard / billboard_ad, road.py
// p_gantry_sign, miami.py p_sign_gantry): size, the faces (rects [x0, y0, x1, y1]), the lettering (rect), the lamps
// (rect of its head, the light of the def it feeds: off once all its lamps are out). layers: its `_bare` and `_frame`
// sprites to tear down to (none: holes only, no stages). look: the hole's core, its ragged lip (the paper's back, or
// the plate's bared steel), the lens of a lamp shot out.
const PAPER = { core: '#140c18', lip: '#ece6d4', lens: '#2a2a32' };
const PLATE = { core: '#0e1012', lip: '#c8d0cc', lens: '#2a2a32' };
const LAMPS = (xs, y0, y1, w, lights) => xs.map((x, i) => ({ at: [x - w, y0, x + w, y1], light: lights[i] }));
export const BOARDS = {
  billboard_tan: { size: [256, 112], faces: [[6, 4, 250, 86]], letters: [92, 6, 236, 40], layers: true, look: PAPER,
    lamps: LAMPS([38, 102, 154, 218], 75, 81, 5, [0, 1, 2, 3]) },
  billboard_radio: { size: [256, 112], faces: [[6, 4, 250, 86]], letters: [40, 8, 216, 44], layers: true, look: PAPER,
    lamps: LAMPS([38, 102, 154, 218], 75, 81, 5, [0, 1, 2, 3]) },
  billboard_motel: { size: [384, 112], faces: [[8, 10, 376, 84]], letters: [140, 12, 372, 76], layers: true, look: PAPER,
    lamps: LAMPS([60, 150, 240, 330], 0, 5, 3.5, [0, 0, 1, 1]) },
  // the freeway's signs on their trusses: the plates take holes, their lamps go out; nothing more (no stages)
  gantry_sign: { size: [310, 40], faces: [[34, 9, 146, 38], [164, 9, 276, 38]], look: PLATE,
    lamps: [50, 76, 102, 128, 180, 206, 232, 258].map((x, i) => ({ at: [x - 1, 36.5, x + 5, 39.5], light: i < 4 ? 0 : 1 })) },
  sign_gantry: { size: [80, 448], faces: [[4, 56, 54, 176], [4, 300, 54, 412]], look: PLATE,
    lamps: [61, 171, 305, 407].map((y, i) => ({ at: [1, y - 4.5, 7, y + 4.5], light: i < 2 ? 0 : 1 })) },
};
