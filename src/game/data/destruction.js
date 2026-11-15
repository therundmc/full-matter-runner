// How each prop comes apart. Everything is expressed relative to the prop's own sprite (fractions of its width /
// height) or in metres, so it keeps working whatever size the furniture is drawn at.
//
// DESTRUCTION[type] = {
//   material   material used for the hit response (default: the prop's def.material), see MATERIAL_FX
//   height     metres: how high the object stands (pieces of the collapse start up there and fall)
//   parts      ordered list of cuts applied to the sprite when it gives way; each cut only takes what the previous
//              ones left, and whatever remains at the end falls as a few jagged chunks:
//                { cut: 'planks', n, axis: 'long'|'short', rect?, snap? }  boards along the grain (snap: some break across)
//                { cut: 'wedges', n, rect?, centre? }  radial fracture around the last hit (glass, ceramic), or
//                                                   around the middle (centre: the plates of a lid along its seams)
//                { cut: 'ring', n, t, rect? }       the rim of something round: n arcs of a band t thick
//                                                   (fraction of the radius); the inside is left to the next cut
//                { cut: 'grid', cols, rows, rect? } jagged grid of chunks
//                { cut: 'frame', t, sides, rect? }  border strips t thick (fraction of the short side), sides 'tlrb'
//                { cut: 'panel', rect, fly?, name? }  one clean piece (a door, a lid, a cushion): fly = speed factor
//              rect = [x0, y0, x1, y1] fractions of the sprite (default the whole sprite)
//   legs       { n, size: metres, color }  extra pieces that were hidden under the top (table legs)
//   contents   [{ bit, n, on: 'break'|'hit', perHit?, colors? }]  loose things inside, see BITS
//   floats     [name, count]  slow floating particles on collapse (stuffing, feathers, paper, leaves...)
//   sheds      name: the same, a few at every hit (banknotes out of a case)
//   snow       true: its screen shows snow while it is on (render/PropLife.js)
//   screen     [x0, y0, x1, y1]  a glass screen: cracks, then implodes (light goes out)
//   electric   sparks, smoke and flicker when hit
//   leak       { color, on: 'hit'|'break', dur, kind?, flood? }  a jet of liquid for dur s out of each hole (on: 'hit')
//              or once it gives way; kind (LIQUIDS.kinds): it stands as a puddle, else it only stains;
//              flood: px2 that pour out of the broken pipe when it falls apart
//   rack       bottles or glasses standing in plain sight, burst one by one by what hits them (bit: their BITS
//              entry, share: how much of a bottle each holds). Either drawn in the sprite on a grid
//              { x, dx, n, ys, s }: n across from x every dx px, one rank per ys, s px square, front at +y; or set
//              out by the game on a bare top { scatter: [min, max], rect: [x0, y0, x1, y1] px, colors }
//   drop       true: hangs high (ceiling lamps, street lamp head): pieces fall from the ceiling
//   saw        a full line of torn zones saws it in two (default: its material's `saw`)
//   spill      what it leaves where it stood, instead of the grime of its wreck: 'soil' (a potted plant)
//   stump      what stays bolted where it stood: 'duct' (a roof vent: the open duct and its flange)
//   puff       the dark smoke it dies in (motors, transformers): number of billows
//   live       s its torn wires go on spitting sparks where it hung
//   doors      the doors of a cabinet, hinged on its front (+y) edge: { n, at: damage state they spring open at }
//   gush       px2 of water that burst out of it all around when it gives way (a tank under pressure)
export const DESTRUCTION = {
  table: {
    height: 0.75, parts: [{ cut: 'planks', n: 3, axis: 'long', snap: true }], legs: { n: 4, size: 0.09, color: '#5a361e' },
    contents: [{ bit: 'bottle', n: 1, on: 'break' }],
  },
  card_table: {
    height: 0.75, parts: [{ cut: 'ring', n: 8, t: 0.22 }, { cut: 'planks', n: 3, axis: 'long', snap: true }],
    legs: { n: 4, size: 0.1, color: '#4a2c18' },
    floats: ['cash', 8], contents: [{ bit: 'chip', n: 14, on: 'break' }],
  },
  // powder: a white puff at every hit, a cloud when it goes over
  dope_table: {
    height: 0.75, powder: '#f2efe8', parts: [{ cut: 'planks', n: 3, axis: 'long', snap: true }],
    legs: { n: 4, size: 0.09, color: '#4a2c18' }, floats: ['cash', 22],
    contents: [{ bit: 'brick', n: 4, on: 'break' }, { bit: 'wad', n: 4, on: 'break' }, { bit: 'brick', n: 1, on: 'hit', perHit: 0.3 }],
  },
  cash_case: {
    height: 0.2, sheds: 'cash', floats: ['cash', 46],
    contents: [{ bit: 'wad', n: 9, on: 'break' }, { bit: 'wad', n: 1, on: 'hit', perHit: 0.7 }],
  },
  // round tops: the rim breaks away in arcs, the rest into boards (a single quarter coming off reads as a pie)
  table_round: {
    height: 0.75, parts: [{ cut: 'ring', n: 6, t: 0.2 }, { cut: 'planks', n: 3, axis: 'long', snap: true }],
    legs: { n: 1, size: 0.14, color: '#4a2c18' },
    contents: [{ bit: 'bottle', n: 1, on: 'break' }],
  },
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
    height: 1.05, parts: [{ cut: 'planks', n: 2, axis: 'long', snap: true }],
    rack: { bit: 'bottle', share: 0.3, scatter: [0, 2], rect: [2, 4, 26, 9], colors: ['#e8a830', '#d8c8a0', '#b4541c', '#e0e6ea'] },
  },
  fridge: {
    height: 1.8, parts: [{ cut: 'panel', rect: [0, 0.72, 1, 1], name: 'door', fly: 1.8 }, { cut: 'grid', cols: 2, rows: 1 }],
    leak: { color: 'rgba(240,240,230,0.3)', on: 'break', dur: 2 }, // no kind: the cartons inside only splash
    contents: [{ bit: 'food', n: 6, on: 'break' }, { bit: 'can', n: 3, on: 'break' }],
  },
  oven: {
    height: 0.9, electric: true, parts: [{ cut: 'panel', rect: [0, 0.75, 1, 1], name: 'door', fly: 1.6 }, { cut: 'grid', cols: 2, rows: 1 }],
    contents: [{ bit: 'pan', n: 1, on: 'break' }],
  },
  sink: { height: 0.9, parts: [{ cut: 'grid', cols: 2, rows: 1 }], leak: { kind: 'water', color: 'rgba(110,160,200,0.16)', on: 'hit', dur: 4, flood: 3200 } },
  toilet: { height: 0.4, material: 'ceramic', parts: [{ cut: 'wedges', n: 5 }], leak: { kind: 'water', color: 'rgba(110,160,200,0.16)', on: 'hit', dur: 5, flood: 4800 } },
  tv: { height: 0.6, electric: true, snow: true, screen: [0.05, 0.45, 0.95, 1], parts: [{ cut: 'grid', cols: 3, rows: 1 }] },
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
  // the pot cracks, the soil spills where it stood with leaves torn off, the shards stay around it
  plant: {
    height: 0.6, floats: ['leaf', 14], spill: 'soil',
    parts: [{ cut: 'grid', cols: 2, rows: 2, rect: [0.1, 0.1, 0.9, 0.9] }, { cut: 'wedges', n: 4 }],
    contents: [{ bit: 'pot', n: 6, on: 'break' }, { bit: 'soil', n: 1, on: 'break' }],
  },
  dumpster: {
    height: 1.2, parts: [{ cut: 'panel', rect: [0, 0, 1, 0.5], name: 'lid', fly: 2.2 }, { cut: 'grid', cols: 2, rows: 1 }],
    floats: ['paper', 12], contents: [{ bit: 'bag', n: 3, on: 'break' }, { bit: 'can', n: 4, on: 'break' }],
  },
  trash_can: { height: 0.7, parts: [{ cut: 'grid', cols: 2, rows: 2 }], floats: ['paper', 8], contents: [{ bit: 'can', n: 2, on: 'break' }] },
  barrel: { height: 0.9, parts: [{ cut: 'grid', cols: 2, rows: 2 }] },
  gas_bottle: { height: 0.6, parts: [{ cut: 'grid', cols: 2, rows: 2 }] },
  bench: { height: 0.45, parts: [{ cut: 'planks', n: 3, axis: 'long', snap: true }], legs: { n: 2, size: 0.08, color: '#2a2a30' } },
  hydrant: { height: 0.7, parts: [{ cut: 'grid', cols: 2, rows: 1 }] }, // never cut: it pops off whole (Prop.burst)
  palm_tree: { height: 5, drop: true, floats: ['leaf', 30], parts: [{ cut: 'wedges', n: 6 }] },
  streetlight: { height: 5, drop: true, parts: [{ cut: 'grid', cols: 2, rows: 1 }] },
  chain_fence: { height: 1.3, material: 'metal', parts: [{ cut: 'grid', cols: 3, rows: 1 }] },
  bottle_shelf: {
    height: 1.8, parts: [{ cut: 'frame', t: 0.25, sides: 'tb' }, { cut: 'grid', cols: 4, rows: 1 }],
    rack: { bit: 'bottle', x: 3, dx: 3, n: 12, ys: [3, 6, 9], s: 2 },
    contents: [{ bit: 'bottle', n: 12, on: 'break' }],
  },
  back_bar: {
    height: 1.7, parts: [{ cut: 'frame', t: 0.25, sides: 'tb' }, { cut: 'grid', cols: 4, rows: 1 }],
    rack: { bit: 'bottle', share: 0.6, x: 3, dx: 3, n: 12, ys: [2, 5], s: 2 },
    contents: [{ bit: 'bottle', n: 10, on: 'break' }],
  },
  washer: {
    height: 0.95, parts: [{ cut: 'panel', rect: [0.2, 0.3, 0.8, 0.9], name: 'lid', fly: 1.6 }, { cut: 'grid', cols: 2, rows: 2 }],
    leak: { color: 'rgba(110,160,200,0.16)', on: 'hit', dur: 4 },
  },
  neon_sign_liquor: { height: 2.5, electric: true, material: 'glass', parts: [{ cut: 'wedges', n: 7 }] },
  neon_sign_video: { height: 2.5, electric: true, material: 'glass', parts: [{ cut: 'wedges', n: 7 }] },
  awning: { height: 2.6, parts: [{ cut: 'grid', cols: 2, rows: 2 }] },
  velvet_rope: { height: 1, parts: [{ cut: 'grid', cols: 2, rows: 1 }] },
  neon_sign_wash: { height: 2.5, electric: true, material: 'glass', parts: [{ cut: 'wedges', n: 7 }] },
  neon_sign_palm: { height: 2.5, electric: true, material: 'glass', parts: [{ cut: 'wedges', n: 7 }] },
  neon_sign_bar: { height: 2.5, electric: true, material: 'glass', parts: [{ cut: 'wedges', n: 7 }] },
  neon_sign_arrow: { height: 2.5, electric: true, material: 'glass', parts: [{ cut: 'wedges', n: 6 }] },
  floor_lamp: { height: 1.6, electric: true, parts: [{ cut: 'wedges', n: 4 }] },
  table_lamp: { height: 1, electric: true, parts: [{ cut: 'wedges', n: 4 }] },
  wall_lamp: { height: 2, electric: true, material: 'glass', parts: [{ cut: 'wedges', n: 4 }] },
  alarm_box: { height: 2.2, electric: true, material: 'metal', parts: [{ cut: 'wedges', n: 3 }] },
  tube_light: { height: 2.4, electric: true, material: 'glass', parts: [{ cut: 'grid', cols: 4, rows: 1 }] },
  neon_tube_pink: { height: 2.4, electric: true, material: 'glass', parts: [{ cut: 'grid', cols: 4, rows: 1 }] },
  neon_tube_cyan: { height: 2.4, electric: true, material: 'glass', parts: [{ cut: 'grid', cols: 4, rows: 1 }] },
  ceiling_lamp: { height: 2.6, drop: true, electric: true, parts: [{ cut: 'wedges', n: 5 }] },
  pool_lamp: { height: 2.2, drop: true, electric: true, parts: [{ cut: 'grid', cols: 3, rows: 1 }] },
  ceiling_fan: { height: 2.6, drop: true, electric: true, parts: [{ cut: 'wedges', n: 4 }] },
  mirror_ball: { height: 2.4, drop: true, parts: [{ cut: 'wedges', n: 6 }] },
  extinguisher: { height: 1.2 },
  vending: {
    height: 1.8, electric: true, parts: [{ cut: 'grid', cols: 2, rows: 2 }],
    contents: [{ bit: 'can', n: 10, on: 'break' }, { bit: 'can', n: 1, on: 'hit', perHit: 1 }],
  },
  phone_booth: { height: 2.2, electric: true, parts: [{ cut: 'wedges', n: 7 }] },
  parking_meter: { height: 1.2, drop: true, contents: [{ bit: 'coin', n: 9, on: 'break' }, { bit: 'coin', n: 1, on: 'hit', perHit: 1 }] },
  news_box: {
    height: 1, floats: ['paper', 10], parts: [{ cut: 'grid', cols: 2, rows: 1 }],
    contents: [{ bit: 'sheet', n: 6, on: 'break' }, { bit: 'sheet', n: 1, on: 'hit', perHit: 1 }],
  },
  pipe_steam: { height: 0.5, saw: true },
  pipe_water: { height: 0.5, saw: true, leak: { kind: 'water', color: 'rgba(110,160,200,0.16)', on: 'hit', dur: 7 } },
  wall_vent: { height: 0.4 },
  // ---- roofs, fittings
  // a steel tank on stilts: every hole jets water down its side, and once it gives way the lid comes apart along
  // its seams, the staves of its wall fall outward and all it held bursts out across the roof
  water_tank: {
    height: 2.6, material: 'metal', gush: 16000,
    parts: [{ cut: 'ring', n: 8, t: 0.16, name: 'stave', fly: 1.4 }, { cut: 'wedges', n: 6, centre: true }],
    leak: { kind: 'water', color: 'rgba(110,160,200,0.16)', on: 'hit', dur: 6 },
  },
  // the fan's grille and the louvred panel come off, the casing folds; the motor dies in a puff of black smoke
  ac_unit: {
    height: 1, material: 'metal', electric: true, puff: 9,
    parts: [{ cut: 'panel', rect: [0.06, 0.1, 0.52, 0.9], name: 'grille', fly: 1.5 },
      { cut: 'panel', rect: [0.56, 0.1, 0.94, 0.9], name: 'louvre', fly: 1.2 }, { cut: 'frame', t: 0.2, sides: 'tlrb' }],
  },
  roof_vent: { height: 0.6, material: 'metal', stump: 'duct', parts: [{ cut: 'ring', n: 4, t: 0.35 }, { cut: 'wedges', n: 3, centre: true }] },
  // the steel cabinet's doors spring open at the first hit and hang; its wires spit on once it is torn off the wall
  fuse_box: {
    height: 1.6, material: 'metal', electric: true, live: 4, doors: { n: 2, at: 1 },
    parts: [{ cut: 'panel', rect: [0, 0, 1, 0.3], name: 'bracket' }, { cut: 'grid', cols: 2, rows: 1 }],
  },
  emergency_light: {
    height: 2.2, material: 'glass', electric: true,
    parts: [{ cut: 'panel', rect: [0, 0, 1, 0.45], name: 'housing' }, { cut: 'grid', cols: 2, rows: 1 }],
  },
  // a low stage: the lit rim breaks away in arcs, the deck into boards
  dance_stage: {
    height: 0.35, material: 'wood', electric: true,
    parts: [{ cut: 'ring', n: 8, t: 0.2, name: 'rim' }, { cut: 'planks', n: 4, axis: 'long', snap: true }],
  },
  string_lights: { height: 3, drop: true, electric: true, material: 'glass', parts: [{ cut: 'grid', cols: 6, rows: 1 }] },
  // `lasting` (data/props.js): marked by every hit, never torn nor sawn
  ladder: { height: 3, material: 'metal' },
  parapet: { height: 1, material: 'stone' },
};

// Material-based defaults for props without a recipe, and the per-material hit response.
//   hit / crush   sounds (one hit, the collapse)
//   dust          colour of the dust cloud (null = none)
//   float         floating particles shed by hits (stuffing...)
//   backSplash    how much flies back out of the entry hole (0..1); exit = how much is blown out of the far side
//   cracks        radiating cracks per blunt hit
//   hard          shows bright scrapes / dents instead of torn holes (metal)
//   tear          what a worn-out damage zone does: 'chunk' breaks off and flies, 'gash' (sheet metal) is torn open
//                 on the dark inside with bright lips, 'rip' (upholstery) opens on the stuffing
//   saw           a line of torn zones saws the object in two
export const MATERIAL_FX = {
  wood: { hit: 'wood', crush: 'woodBreak', dust: '#9a7a58', backSplash: 0.5, exit: 1, cracks: 4, splinters: true, tear: 'chunk', saw: true },
  metal: { hit: 'metal', crush: 'metalBreak', dust: null, backSplash: 0.15, exit: 0.4, cracks: 0, hard: true, tear: 'gash', saw: false },
  glass: { hit: 'glassHit', crush: 'glass', dust: null, backSplash: 0.7, exit: 1.4, cracks: 7, glass: true, tear: 'chunk', saw: false },
  ceramic: { hit: 'ceramic', crush: 'ceramicBreak', dust: '#f0ece4', backSplash: 0.6, exit: 1.2, cracks: 6, tear: 'chunk', saw: false },
  plastic: { hit: 'plastic', crush: 'plasticBreak', dust: '#77707a', backSplash: 0.35, exit: 0.8, cracks: 3, tear: 'chunk', saw: false },
  fabric: { hit: 'soft', crush: 'softBreak', dust: '#c8b8a8', backSplash: 0.25, exit: 0.6, cracks: 0, float: 'stuffing', tear: 'rip', saw: false },
  stone: { hit: 'stone', crush: 'crumble', dust: '#a89c90', backSplash: 0.6, exit: 0.8, cracks: 4, tear: 'chunk', saw: false },
};

export const DEFAULT_PARTS = {
  wood: [{ cut: 'planks', n: 3, axis: 'long', snap: true }],
  metal: [{ cut: 'grid', cols: 2, rows: 1 }],
  glass: [{ cut: 'wedges', n: 6 }],
  ceramic: [{ cut: 'wedges', n: 5 }],
  plastic: [{ cut: 'grid', cols: 2, rows: 2 }],
  fabric: [{ cut: 'frame', t: 0.3, sides: 'tlr' }, { cut: 'grid', cols: 2, rows: 1 }],
  stone: [{ cut: 'grid', cols: 3, rows: 1 }],
};

// Loose bits: real size in metres (drawn at least a couple of pixels), material, how they move.
//   round: rolls (circle body), float: drifts down slowly instead of being thrown,
//   smash: { kind, area, share }: that share of them shatters on the floor and spills area px2 of that liquid;
//   glass / drops: shards and splashes it bursts into; wall: [reach px, radius px, color] what it throws on a wall that
//   close behind it (a bottle on a shelf: the wall it stands against), and a run of it down to the floor
export const BITS = {
  ball: { size: [0.06, 0.06], material: 'ceramic', round: true, bounce: 0.6, mu: 0.12,
    colors: ['#f2d22a', '#2850c8', '#d02828', '#6a2a9a', '#f07a1a', '#1f8a3a', '#7a1a1a', '#141414', '#f6f2e6'] },
  book: { size: [0.22, 0.16], material: 'wood', colors: ['#c03030', '#2a5aa8', '#e0a020', '#2a8a4a', '#7a3a9a', '#d8d0c0', '#3a2a2a'] },
  disc: { size: [0.18, 0.18], material: 'plastic', round: true, bounce: 0.3, mu: 0.25, colors: ['#ff2a6d', '#05d9e8', '#f9c80e', '#e8e0d0'] },
  bottle: { size: [0.08, 0.28], material: 'glass', colors: ['#2a6a2a', '#7a4a10', '#a8c8b8', '#5a2a10'], smash: { kind: 'booze', area: 300, share: 0.75, glass: 12, drops: 14, wall: [18, 4, 'rgba(120,70,22,0.55)'] } },
  can: { size: [0.07, 0.12], material: 'metal', round: true, bounce: 0.35, mu: 0.3, colors: ['#c02020', '#d8d8e0', '#2050c0', '#e0c020'] },
  bag: { size: [0.42, 0.34], material: 'fabric', colors: ['#2c322c', '#23272a', '#3a3530'] },
  food: { size: [0.12, 0.1], material: 'fabric', colors: ['#d8c060', '#c84020', '#e8e0d0', '#6aa040', '#a06030'] },
  pan: { size: [0.3, 0.3], material: 'metal', round: true, bounce: 0.2, mu: 0.4, colors: ['#2a2a30'] },
  slat: { size: [0.9, 0.08], material: 'wood', colors: ['#8a6038', '#7a5030'] },
  cue: { size: [1.45, 0.04], material: 'wood', colors: ['#c8a060'] },
  soil: { size: [0.3, 0.3], material: 'fabric', colors: ['#3a2416'] },
  pot: { size: [0.1, 0.07], material: 'ceramic', colors: ['#a4502a', '#8e4224', '#b8653a'] },
  chip: { size: [0.05, 0.05], material: 'plastic', round: true, bounce: 0.4, mu: 0.2, colors: ['#d8303a', '#e8e0cc', '#3a6ad8', '#e8c040'] },
  brick: { size: [0.2, 0.12], material: 'fabric', colors: ['#e8e4dc', '#dcd6ca'] },
  wad: { size: [0.16, 0.08], material: 'fabric', colors: ['#5a8a4a', '#6a9a5a'] },
  coin: { size: [0.03, 0.03], material: 'metal', round: true, bounce: 0.5, mu: 0.2, colors: ['#d8d8e0', '#c4c8d0', '#e0c060'] },
  sheet: { size: [0.3, 0.22], material: 'fabric', colors: ['#ece8dc', '#f6f2e8', '#d8d2c0'] },
};

// slow floating particles: colour, size px, fall speed (lower = floats longer)
export const FLOATS = {
  stuffing: { colors: ['#f2ece0', '#e6dccb', '#fffaf0'], size: [1, 2], fall: 10 },
  foam: { colors: ['#e8d070', '#d8b850'], size: [1, 2.2], fall: 14 },
  feather: { colors: ['#ffffff', '#f2f0e8'], size: [1, 2], fall: 6 },
  paper: { colors: ['#ece8dc', '#f6f2e8', '#d8d2c0'], size: [2, 3.2], fall: 9, flat: true },
  leaf: { colors: ['#2f8f3a', '#3aa048', '#25702c'], size: [1.5, 2.8], fall: 12, flat: true },
  straw: { colors: ['#d8b860', '#c8a048'], size: [1, 2.4], fall: 16, flat: true },
  cash: { colors: ['#6a9a5a', '#86b070', '#4f7f45'], size: [2, 3.4], fall: 8, flat: true },
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
    saw: r.saw ?? MATERIAL_FX[material].saw,
    fx: MATERIAL_FX[material],
  };
}
