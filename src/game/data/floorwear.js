// How worn the floors are (render/FloorWear.js): what years of feet, cars, rain and spills leave on them, painted
// once over the tiles and free of their grid (a crack runs on over two or three tiles, a pothole sits astride a
// joint, a path is worn pale across a room). Discreet on purpose: a few shades off the floor, never a pattern.
// Per surface (a group of TileMap floors, a mark never leaves its surface and stops at a wall):
//   floors  TileMap floor names
//   edge    dirt gathered along the foot of the walls: w px wide, d shades at the wall; `next` also counts the edge of
//           these surfaces as a wall (the road's gutter along the kerb), `grit` its share of loose grit
//   tone    shades of difference from one tile to the next (sidewalk slabs laid one by one)
//   lanes   where the traffic runs (level ambient.traffic rows): the oil dripped down the middle of a lane (drip) and
//           the tyres' tracks either side (track), `gauge` px from the middle
//   marks   [kind, per 100 tiles of the surface, options]: the kinds and their options in render/FloorWear.js
// Darkness in shades of 0..255 (negative darker), lengths in px (1 m = 32 px).
export const WEAR = {
  surfaces: {
    road: {
      floors: ['asphalt', 'asphalt_line'],
      edge: { w: 5, d: -9, next: ['sidewalk'], grit: 0.07 },
      lanes: { drip: -6, track: -3, gauge: 25 },
      marks: [
        ['crack', 6, { len: [30, 110], d: -12, branch: 0.03 }],
        ['pothole', 1.3],
        ['crazing', 1.1],
        ['patch', 0.6],
        ['seam', 0.8],
        ['oil', 2.5],
        ['grit', 3, { glass: 0.15 }],
      ],
    },
    sidewalk: {
      floors: ['sidewalk'],
      tone: 3,
      edge: { w: 6, d: -7 },
      marks: [
        ['crack', 7, { len: [20, 64], d: -14 }],
        ['chip', 4],
        ['gum', 5],
        ['stain', 3, { col: '#2a2630', d: -6 }],
        ['weeds', 3, { at: 'joint' }],
        ['grit', 3],
      ],
    },
    concrete: {
      floors: ['concrete'],
      edge: { w: 8, d: -9 },
      marks: [
        ['crack', 8, { len: [30, 100] }],
        ['spall', 1.5],
        ['oil', 2.5],
        ['stain', 3],
        ['tide', 1.2],
        ['weeds', 4, { at: 'wall' }],
        ['grit', 4],
      ],
    },
    roof: {
      floors: ['roof'],
      edge: { w: 6, d: -7 },
      marks: [['crack', 4, { d: -10 }], ['tide', 3, { d: -5 }], ['blister', 3], ['stain', 2]],
    },
    wood: {
      floors: ['wood'],
      edge: { w: 6, d: -8 },
      marks: [
        ['split', 10, { d: -18 }],
        ['gap', 8],
        ['broken', 2],
        ['wear', 2.5],
        ['rings', 5],
        ['scratches', 6],
        ['stain', 3, { col: '#3a2418', d: -7 }],
        ['burns', 2],
      ],
    },
    carpet: {
      floors: ['carpet_red', 'carpet_purple'],
      edge: { w: 5, d: -8 },
      marks: [['wear', 4, { d: 4, grey: 0.15 }], ['stain', 5, { col: '#1a0c10', d: -8 }], ['burns', 5], ['grit', 4]],
    },
    tiles: {
      floors: ['tile_blue'],
      edge: { w: 5, d: -9 },
      marks: [['crack', 9, { len: [16, 44], d: -14, lit: 4 }], ['chip', 6], ['stain', 6, { col: '#5a5a3a', d: -5 }], ['grit', 3]],
    },
    lino: {
      floors: ['checker'],
      edge: { w: 5, d: -9 },
      marks: [['scuffs', 12], ['tear', 4], ['stain', 8, { col: '#3a3020' }], ['crack', 5, { len: [12, 30], d: -10 }], ['burns', 4]],
    },
    neon: {
      floors: ['neon_floor'],
      marks: [['scuffs', 8], ['scratches', 6]],
    },
    ground: {
      floors: ['dirt', 'grass'],
      marks: [['grit', 4], ['stain', 2, { col: '#2a2018' }]],
    },
  },
};
