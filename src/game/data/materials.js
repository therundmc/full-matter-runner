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
// bare round the hole, crumbs = [min, max] bits of it left for good at the foot of the wall
export const WALL_IMPACT = {
  '#': { chips: '#e6e0d2', n: 8, dust: '#efe9dc', puff: 5, burst: 6, sparks: 0, bare: '#f2ecdf', crumbs: [2, 4] },
  X: { chips: '#9a5440', n: 6, dust: '#a8705c', puff: 4, burst: 5, sparks: 3, bare: '#b86a50', crumbs: [1, 3] },
};

// how grippy each floor is (multiplies the object's own friction coefficient)
export const FLOOR_GRIP = {
  wood: 1, checker: 0.8, tile_blue: 0.75, carpet_red: 1.35, carpet_purple: 1.35, concrete: 1.05, grass: 1.5,
  asphalt: 1.15, asphalt_line: 1.1, dirt: 1.4, sidewalk: 1.05, neon_floor: 0.8,
};
