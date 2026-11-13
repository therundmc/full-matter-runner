// How each prop comes apart. Everything is expressed relative to the prop's own sprite (fractions of its width /
// height) or in metres, so it keeps working whatever size the furniture is drawn at.
//
// DESTRUCTION[type] = {
//   material   material used for the hit response (default: the prop's def.material), see MATERIAL_FX
//   height     metres: how high the object stands (pieces of the collapse start up there and fall)
//   parts      ordered list of cuts applied to the sprite when it gives way; each cut only takes what the previous
//              ones left, and whatever remains at the end falls as a few jagged chunks:
//                { cut: 'planks', n, axis: 'long'|'short', rect?, snap? }  boards along the grain (snap: some break across)
//                { cut: 'wedges', n, rect? }        radial fracture around the last hit (glass, ceramic)
//                { cut: 'grid', cols, rows, rect? } jagged grid of chunks
//                { cut: 'frame', t, sides, rect? }  border strips t thick (fraction of the short side), sides 'tlrb'
//                { cut: 'panel', rect, fly?, name? }  one clean piece (a door, a lid, a cushion): fly = speed factor
//              rect = [x0, y0, x1, y1] fractions of the sprite (default the whole sprite)
//   legs       { n, size: metres, color }  extra pieces that were hidden under the top (table legs)
//   contents   [{ bit, n, on: 'break'|'hit', perHit?, colors? }]  loose things inside, see BITS
//   floats     [name, count]  slow floating particles on collapse (stuffing, feathers, paper, leaves...)
//   screen     [x0, y0, x1, y1]  a glass screen: cracks, then implodes (light goes out)
//   electric   sparks, smoke and flicker when hit
//   leak       { color, on: 'hit'|'break', dur }  liquid jets and puddles
//   drop       true: hangs high (ceiling lamps, street lamp head): pieces fall from the ceiling
export const DESTRUCTION = {
  table: { height: 0.75, parts: [{ cut: 'planks', n: 3, axis: 'long', snap: true }], legs: { n: 4, size: 0.09, color: '#5a361e' } },
  table_round: { height: 0.75, parts: [{ cut: 'planks', n: 3, axis: 'long', snap: true }], legs: { n: 1, size: 0.14, color: '#4a2c18' } },
  desk: {
    height: 0.75, electric: true, floats: ['paper', 14],
    parts: [{ cut: 'panel', rect: [0.25, 0.05, 0.75, 0.6], name: 'monitor', fly: 1.3 }, { cut: 'planks', n: 3, axis: 'long', snap: true }],
    legs: { n: 4, size: 0.08, color: '#4a2c18' },
  },
  chair: {
    height: 0.45,
    parts: [{ cut: 'frame', t: 0.3, sides: 'l' }, { cut: 'panel', rect: [0.3, 0, 1, 1], name: 'seat' }],
    legs: { n: 4, size: 0.05, color: '#4a2c18' },
  },
  armchair: {
    height: 0.6, floats: ['stuffing', 22],
    parts: [{ cut: 'frame', t: 0.28, sides: 'tlr' }, { cut: 'panel', rect: [0.25, 0.25, 0.75, 1], name: 'cushion', fly: 1.4 }],
  },
  sofa: {
    height: 0.6, floats: ['stuffing', 34],
    parts: [{ cut: 'frame', t: 0.3, sides: 'tlr' }, { cut: 'grid', cols: 3, rows: 1, rect: [0.08, 0.25, 0.92, 1] }],
  },
  bed: {
    height: 0.5, floats: ['feather', 40],
    parts: [{ cut: 'panel', rect: [0.05, 0, 0.95, 0.2], name: 'pillow', fly: 1.6 }, { cut: 'grid', cols: 1, rows: 2, rect: [0.05, 0.2, 0.95, 1] }],
    contents: [{ bit: 'slat', n: 5, on: 'break' }],
  },
  pool_table: {
    height: 0.8, material: 'wood',
    parts: [{ cut: 'frame', t: 0.16, sides: 'tlrb' }, { cut: 'wedges', n: 5, rect: [0.1, 0.16, 0.9, 0.84] }],
    legs: { n: 4, size: 0.12, color: '#3a2212' },
    contents: [{ bit: 'ball', n: 15, on: 'break' }, { bit: 'ball', n: 1, on: 'hit', perHit: 0.35 }, { bit: 'cue', n: 1, on: 'break' }],
  },
  crate: {
    height: 0.6, parts: [{ cut: 'planks', n: 4, axis: 'long', snap: true }], floats: ['straw', 16],
    contents: [{ bit: 'can', n: 4, on: 'break' }, { bit: 'bottle', n: 3, on: 'break' }],
  },
  bookshelf: {
    height: 1.8, floats: ['paper', 18],
    parts: [{ cut: 'frame', t: 0.25, sides: 'tb' }, { cut: 'grid', cols: 4, rows: 1 }],
    contents: [{ bit: 'book', n: 10, on: 'break' }, { bit: 'book', n: 2, on: 'hit', perHit: 1 }],
  },
  bar_counter: {
    height: 1.05, parts: [{ cut: 'planks', n: 2, axis: 'long', snap: true }], leak: { color: 'rgba(150,90,20,0.5)', on: 'hit', dur: 1.2 },
    contents: [{ bit: 'bottle', n: 6, on: 'break' }, { bit: 'bottle', n: 1, on: 'hit', perHit: 0.6 }],
  },
  fridge: {
    height: 1.8, parts: [{ cut: 'panel', rect: [0, 0.72, 1, 1], name: 'door', fly: 1.8 }, { cut: 'grid', cols: 2, rows: 1 }],
    leak: { color: 'rgba(240,240,230,0.3)', on: 'break', dur: 2 },
    contents: [{ bit: 'food', n: 6, on: 'break' }, { bit: 'can', n: 3, on: 'break' }],
  },
  oven: {
    height: 0.9, electric: true, parts: [{ cut: 'panel', rect: [0, 0.75, 1, 1], name: 'door', fly: 1.6 }, { cut: 'grid', cols: 2, rows: 1 }],
    contents: [{ bit: 'pan', n: 1, on: 'break' }],
  },
  sink: { height: 0.9, parts: [{ cut: 'grid', cols: 2, rows: 1 }], leak: { color: 'rgba(110,160,200,0.16)', on: 'hit', dur: 4 } },
  toilet: { height: 0.4, material: 'ceramic', parts: [{ cut: 'wedges', n: 5 }], leak: { color: 'rgba(110,160,200,0.16)', on: 'hit', dur: 5 } },
  tv: { height: 0.6, electric: true, screen: [0.05, 0.45, 0.95, 1], parts: [{ cut: 'grid', cols: 3, rows: 1 }] },
  arcade: { height: 1.7, electric: true, screen: [0.1, 0.05, 0.9, 0.6], parts: [{ cut: 'grid', cols: 2, rows: 2 }] },
  jukebox: {
    height: 1.5, electric: true, screen: [0.1, 0.05, 0.9, 0.5], parts: [{ cut: 'grid', cols: 2, rows: 2 }],
    contents: [{ bit: 'disc', n: 7, on: 'break' }, { bit: 'disc', n: 1, on: 'hit', perHit: 0.5 }],
  },
  speaker: { height: 1, electric: true, parts: [{ cut: 'grid', cols: 2, rows: 2 }], floats: ['foam', 10] },
  dj_booth: {
    height: 1, electric: true, parts: [{ cut: 'grid', cols: 3, rows: 1 }],
    contents: [{ bit: 'disc', n: 2, on: 'break' }],
  },
  plant: {
    height: 0.6, floats: ['leaf', 14],
    parts: [{ cut: 'panel', rect: [0.15, 0.15, 0.85, 0.85], name: 'foliage', fly: 0.3 }, { cut: 'wedges', n: 4 }],
    contents: [{ bit: 'soil', n: 1, on: 'break' }],
  },
  dumpster: {
    height: 1.2, parts: [{ cut: 'panel', rect: [0, 0, 1, 0.5], name: 'lid', fly: 2.2 }, { cut: 'grid', cols: 2, rows: 1 }],
    floats: ['paper', 12], contents: [{ bit: 'bag', n: 3, on: 'break' }, { bit: 'can', n: 4, on: 'break' }],
  },
  trash_can: { height: 0.7, parts: [{ cut: 'grid', cols: 2, rows: 2 }], floats: ['paper', 8], contents: [{ bit: 'can', n: 2, on: 'break' }] },
  barrel: { height: 0.9, parts: [{ cut: 'grid', cols: 2, rows: 2 }] },
  bench: { height: 0.45, parts: [{ cut: 'planks', n: 3, axis: 'long', snap: true }], legs: { n: 2, size: 0.08, color: '#2a2a30' } },
  hydrant: { height: 0.7, parts: [{ cut: 'grid', cols: 2, rows: 1 }] },
  palm_tree: { height: 5, drop: true, floats: ['leaf', 30], parts: [{ cut: 'wedges', n: 6 }] },
  streetlight: { height: 5, drop: true, parts: [{ cut: 'grid', cols: 2, rows: 1 }] },
  chain_fence: { height: 1.3, material: 'metal', parts: [{ cut: 'grid', cols: 3, rows: 1 }] },
  bottle_shelf: {
    height: 1.8, parts: [{ cut: 'frame', t: 0.25, sides: 'tb' }, { cut: 'grid', cols: 4, rows: 1 }],
    leak: { color: 'rgba(150,90,20,0.5)', on: 'hit', dur: 1.5 },
    contents: [{ bit: 'bottle', n: 12, on: 'break' }, { bit: 'bottle', n: 2, on: 'hit', perHit: 1 }],
  },
  washer: {
    height: 0.95, parts: [{ cut: 'panel', rect: [0.2, 0.3, 0.8, 0.9], name: 'lid', fly: 1.6 }, { cut: 'grid', cols: 2, rows: 2 }],
    leak: { color: 'rgba(110,160,200,0.16)', on: 'hit', dur: 4 },
  },
  neon_sign_liquor: { height: 2.5, electric: true, material: 'glass', parts: [{ cut: 'wedges', n: 7 }] },
  neon_sign_video: { height: 2.5, electric: true, material: 'glass', parts: [{ cut: 'wedges', n: 7 }] },
  neon_sign_wash: { height: 2.5, electric: true, material: 'glass', parts: [{ cut: 'wedges', n: 7 }] },
  neon_sign_palm: { height: 2.5, electric: true, material: 'glass', parts: [{ cut: 'wedges', n: 7 }] },
  neon_sign_bar: { height: 2.5, electric: true, material: 'glass', parts: [{ cut: 'wedges', n: 7 }] },
  neon_sign_arrow: { height: 2.5, electric: true, material: 'glass', parts: [{ cut: 'wedges', n: 6 }] },
  floor_lamp: { height: 1.6, electric: true, parts: [{ cut: 'wedges', n: 4 }] },
  table_lamp: { height: 1, electric: true, parts: [{ cut: 'wedges', n: 4 }] },
  wall_lamp: { height: 2, electric: true, material: 'glass', parts: [{ cut: 'wedges', n: 4 }] },
  tube_light: { height: 2.4, electric: true, material: 'glass', parts: [{ cut: 'grid', cols: 4, rows: 1 }] },
  neon_tube_pink: { height: 2.4, electric: true, material: 'glass', parts: [{ cut: 'grid', cols: 4, rows: 1 }] },
  neon_tube_cyan: { height: 2.4, electric: true, material: 'glass', parts: [{ cut: 'grid', cols: 4, rows: 1 }] },
  ceiling_lamp: { height: 2.6, drop: true, electric: true, parts: [{ cut: 'wedges', n: 5 }] },
  pool_lamp: { height: 2.2, drop: true, electric: true, parts: [{ cut: 'grid', cols: 3, rows: 1 }] },
};

// Material-based defaults for props without a recipe, and the per-material hit response.
//   hit / crush   sounds (one hit, the collapse)
//   dust          colour of the dust cloud (null = none)
//   float         floating particles shed by hits (stuffing...)
//   backSplash    how much flies back out of the entry hole (0..1); exit = how much is blown out of the far side
//   cracks        radiating cracks per blunt hit
//   hard          shows bright scrapes / dents instead of torn holes (metal)
export const MATERIAL_FX = {
  wood: { hit: 'wood', crush: 'woodBreak', dust: '#9a7a58', backSplash: 0.5, exit: 1, cracks: 4, splinters: true },
  metal: { hit: 'metal', crush: 'metalBreak', dust: null, backSplash: 0.15, exit: 0.4, cracks: 0, hard: true },
  glass: { hit: 'glassHit', crush: 'glass', dust: null, backSplash: 0.7, exit: 1.4, cracks: 7, glass: true },
  ceramic: { hit: 'ceramic', crush: 'ceramicBreak', dust: '#f0ece4', backSplash: 0.6, exit: 1.2, cracks: 6 },
  plastic: { hit: 'plastic', crush: 'plasticBreak', dust: '#77707a', backSplash: 0.35, exit: 0.8, cracks: 3 },
  fabric: { hit: 'soft', crush: 'softBreak', dust: '#c8b8a8', backSplash: 0.25, exit: 0.6, cracks: 0, float: 'stuffing' },
};

export const DEFAULT_PARTS = {
  wood: [{ cut: 'planks', n: 3, axis: 'long', snap: true }],
  metal: [{ cut: 'grid', cols: 2, rows: 1 }],
  glass: [{ cut: 'wedges', n: 6 }],
  ceramic: [{ cut: 'wedges', n: 5 }],
  plastic: [{ cut: 'grid', cols: 2, rows: 2 }],
  fabric: [{ cut: 'frame', t: 0.3, sides: 'tlr' }, { cut: 'grid', cols: 2, rows: 1 }],
};

// Loose bits: real size in metres (drawn at least a couple of pixels), material, how they move.
//   round: rolls (circle body), float: drifts down slowly instead of being thrown
export const BITS = {
  ball: { size: [0.06, 0.06], material: 'ceramic', round: true, bounce: 0.6, mu: 0.12,
    colors: ['#f2d22a', '#2850c8', '#d02828', '#6a2a9a', '#f07a1a', '#1f8a3a', '#7a1a1a', '#141414', '#f6f2e6'] },
  book: { size: [0.22, 0.16], material: 'wood', colors: ['#c03030', '#2a5aa8', '#e0a020', '#2a8a4a', '#7a3a9a', '#d8d0c0', '#3a2a2a'] },
  disc: { size: [0.18, 0.18], material: 'plastic', round: true, bounce: 0.3, mu: 0.25, colors: ['#ff2a6d', '#05d9e8', '#f9c80e', '#e8e0d0'] },
  bottle: { size: [0.08, 0.28], material: 'glass', colors: ['#2a6a2a', '#7a4a10', '#a8c8b8', '#5a2a10'] },
  can: { size: [0.07, 0.12], material: 'metal', round: true, bounce: 0.35, mu: 0.3, colors: ['#c02020', '#d8d8e0', '#2050c0', '#e0c020'] },
  bag: { size: [0.42, 0.34], material: 'fabric', colors: ['#2c322c', '#23272a', '#3a3530'] },
  food: { size: [0.12, 0.1], material: 'fabric', colors: ['#d8c060', '#c84020', '#e8e0d0', '#6aa040', '#a06030'] },
  pan: { size: [0.3, 0.3], material: 'metal', round: true, bounce: 0.2, mu: 0.4, colors: ['#2a2a30'] },
  slat: { size: [0.9, 0.08], material: 'wood', colors: ['#8a6038', '#7a5030'] },
  cue: { size: [1.45, 0.04], material: 'wood', colors: ['#c8a060'] },
  soil: { size: [0.3, 0.3], material: 'fabric', colors: ['#3a2416'] },
};

// slow floating particles: colour, size px, fall speed (lower = floats longer)
export const FLOATS = {
  stuffing: { colors: ['#f2ece0', '#e6dccb', '#fffaf0'], size: [1, 2], fall: 10 },
  foam: { colors: ['#e8d070', '#d8b850'], size: [1, 2.2], fall: 14 },
  feather: { colors: ['#ffffff', '#f2f0e8'], size: [1, 2], fall: 6 },
  paper: { colors: ['#ece8dc', '#f6f2e8', '#d8d2c0'], size: [2, 3.2], fall: 9, flat: true },
  leaf: { colors: ['#2f8f3a', '#3aa048', '#25702c'], size: [1.5, 2.8], fall: 12, flat: true },
  straw: { colors: ['#d8b860', '#c8a048'], size: [1, 2.4], fall: 16, flat: true },
};

// the recipe of a prop, with defaults filled from its material
export function recipeFor(type, def) {
  const r = DESTRUCTION[type] || {};
  const material = r.material || (MATERIAL_FX[def.material] ? def.material : 'wood');
  return {
    height: 0.8,
    ...r,
    material,
    parts: r.parts || DEFAULT_PARTS[material],
    contents: r.contents || [],
    electric: r.electric ?? !!def.sparks,
    fx: MATERIAL_FX[material],
  };
}
