// Physical materials. mu = sliding friction on a "neutral" floor, bounce = restitution,
// sound = impact sound family, chips = colour of the splinters/flakes it sheds,
// quiet = closing speed (px/step) under which its contacts make no sound.
export const MATERIALS = {
  wood: { mu: 0.5, bounce: 0.15, sound: 'wood', chips: '#7a4a2a' },
  metal: { mu: 0.4, bounce: 0.25, sound: 'metal', chips: '#9a9aa8', sparks: true },
  mesh: { mu: 0.4, bounce: 0.3, sound: 'metal', chips: '#9ea4ae' }, // chain-link: mostly holes
  glass: { mu: 0.35, bounce: 0.1, sound: 'glass', chips: '#bff6ff' },
  ceramic: { mu: 0.45, bounce: 0.1, sound: 'ceramic', chips: '#eeeeee' },
  plastic: { mu: 0.4, bounce: 0.3, sound: 'plastic', chips: '#333333' },
  fabric: { mu: 0.8, bounce: 0.05, sound: 'soft', chips: '#9a1f2a' },
  flesh: { mu: 0.75, bounce: 0.05, sound: 'flesh', chips: '#8a1010' }, // the dead and their pieces
  clothed: { mu: 0.75, bounce: 0.05, sound: 'soft', chips: '#8a1010', quiet: 3.2 }, // someone alive: only a hard bump is heard
  concrete: { mu: 0.7, bounce: 0.1, sound: 'stone', chips: '#b8ae98' },
  rubber: { mu: 0.9, bounce: 0.5, sound: 'soft', chips: '#141418' },
  brass: { mu: 0.3, bounce: 0.5, sound: 'shell', chips: '#d8a040' },
};

// what a round knocks out of a wall, by tile: n chips, a puff of dust (puff: soft clouds hanging a moment, burst:
// a jet of it blown straight back out of the hole), sparks (plaster gives none, brick a few), bare = the material laid
// bare round the hole, crumbs = [min, max] bits of it left for good at the foot of the wall.
// The hole itself (render/WallScars.js), from its rim inward: bare, then the crater's sides, `lit` on the side the
// light comes from (lower right of the hole: the light falls from the top left) and `shade` on the other, then the
// dark `core`; `crack` = the hairlines running off it.
export const WALL_IMPACT = {
  '#': { chips: '#e6e0d2', n: 8, dust: '#efe9dc', puff: 5, burst: 6, sparks: 0, bare: '#f2ecdf', crumbs: [2, 4],
    lit: '#b4aa96', shade: '#6a6050', core: '#140c14', crack: 'rgba(40,30,36,0.7)' },
  X: { chips: '#9a5440', n: 6, dust: '#a8705c', puff: 4, burst: 5, sparks: 3, bare: '#c27a5c', crumbs: [1, 3],
    lit: '#8a3c28', shade: '#4c1c14', core: '#120808', crack: 'rgba(24,10,10,0.75)' },
};

// How each kind of blow carves a wall (render/WallScars.js). r: radius in px of one mark (x its size), core / pit:
// share of it that is the dark core / the crater's sides (the rest is the bare rim), cracks: [min, max] hairlines,
// len: their length in px. A mark landing on an older one within `merge` x their radii digs it out instead: the
// gouge widens by `grow` x the new mark's radius (up to `max` px) and goes darker (core share + `deepen` per hit,
// up to `deepest`).
export const WALL_SCAR = {
  entry: { r: 2.4, core: 0.42, pit: 0.72, cracks: [0, 2], len: [3, 6] },
  exit: { r: 2.8, core: 0.34, pit: 0.66, cracks: [1, 3], len: [4, 8] },  // spalled: wide and shallow
  graze: { r: 1.5, core: 0.2, pit: 0.6, cracks: [0, 0], len: [0, 0] },    // a ricochet only scuffs
  blow: { r: 3.2, core: 0.18, pit: 0.6, cracks: [2, 3], len: [4, 9] },     // a club or a boot: crushed, not pierced
  merge: 0.9, grow: 0.5, max: 9, deepen: 0.04, deepest: 0.6,
};

// how grippy each floor is (multiplies the object's own friction coefficient)
export const FLOOR_GRIP = {
  wood: 1, checker: 0.8, tile_blue: 0.75, carpet_red: 1.35, carpet_purple: 1.35, concrete: 1.05, grass: 1.5,
  asphalt: 1.15, asphalt_line: 1.1, dirt: 1.4, sidewalk: 1.05, neon_floor: 0.8,
};
