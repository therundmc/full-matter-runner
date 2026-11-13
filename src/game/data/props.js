// Furniture / props. w,h = hitbox (px), r = circle radius. hp: bullet hits before breaking. Everything breaks.
// material = see data/materials.js (impact sounds), kg = mass, mu = sliding friction against the floor (multiplied by the floor's own grip).
// vault = can be slid / jumped over.
// static = bolted down / too big to budge (never moves; it erodes and bursts into short-lived shards). Objects too heavy to push (mu·kg·g > PUSH_FORCE) stay put
// until something big (an explosion) shoves them.
// light = light(s) cast by the object (see render/Lighting.js); fixture = a lamp: it flickers once damaged and its
// light dies with it. hung = hangs from the ceiling: nobody bumps into it, but bullets, bats and blasts reach it.
// height = how high an overhead object sits, as parallax (fraction of its distance to the centre of the view);
// pole = [colour, width] of the post drawn from its foot to its head. sign = animated neon lettering (render/Lighting.js).
export const PROPS = {
  table: { static: true, vault: true, material: 'wood', w: 44, h: 26, hp: 14, chips: '#7a4a2a', sound: 'wood', blocksPath: true },
  table_round: { static: true, vault: true, material: 'wood', r: 14, hp: 10, chips: '#8a5530', sound: 'wood', blocksPath: true },
  desk: { static: true, vault: true, material: 'wood', w: 46, h: 24, hp: 14, chips: '#6a4026', sound: 'wood', blocksPath: true, sparks: true },
  chair: { material: 'wood', w: 14, h: 14, hp: 6, kg: 7, mu: 0.88, chips: '#7a4a2a', sound: 'wood' },
  armchair: { static: true, material: 'fabric', w: 26, h: 26, hp: 10, chips: '#9a1f2a', sound: 'wood' },
  sofa: { static: true, vault: true, material: 'fabric', w: 64, h: 28, hp: 14, chips: '#c04a8a', sound: 'wood', blocksPath: true },
  plant: { material: 'ceramic', r: 7.5, hp: 4, kg: 18, mu: 0.96, chips: '#3a8a3a', dirt: true, sound: 'wood' },
  tv: { material: 'plastic', w: 22, h: 15, hp: 4, kg: 30, mu: 0.8, chips: '#222', sparks: true, glass: true, sound: 'glass',
    light: { r: 100, color: '#7fc8ff', intensity: 1, flicker: 'tv', y: 7 } },
  fridge: { static: true, material: 'metal', w: 22, h: 22, hp: 18, chips: '#ddd', sound: 'metal', blocksPath: true },
  oven: { static: true, material: 'metal', w: 20, h: 20, hp: 18, chips: '#bbb', sound: 'metal', blocksPath: true, sparks: true },
  sink: { material: 'metal', w: 26, h: 18, hp: 14, static: true, chips: '#aab', sound: 'metal', blocksPath: true },
  toilet: { material: 'ceramic', w: 13, h: 21, hp: 6, static: true, chips: '#eee', sound: 'glass', water: true, blocksPath: true },
  bed: { static: true, vault: true, material: 'fabric', w: 44, h: 64, hp: 18, chips: '#7a3aa0', sound: 'wood', blocksPath: true },
  pool_table: { static: true, vault: true, material: 'wood', w: 80, h: 44, hp: 28, chips: '#1e7a3a', sound: 'wood', blocksPath: true },
  arcade: { static: true, material: 'plastic', w: 22, h: 27, hp: 10, chips: '#333', sparks: true, glass: true, sound: 'metal', blocksPath: true,
    light: { r: 64, color: '#3ae8ff', intensity: 0.7, flicker: 'tv', y: 6 } },
  crate: { vault: true, material: 'wood', w: 19, h: 19, hp: 8, kg: 45, mu: 0.96, chips: '#a07040', sound: 'wood' },
  barrel: { material: 'metal', r: 9, hp: 1, kg: 176, mu: 0.72, chips: '#c02020', explosive: true, blast: 92, sound: 'metal' },
  bookshelf: { static: true, material: 'wood', w: 40, h: 11, hp: 12, chips: '#6a4026', sound: 'wood', blocksPath: true },
  speaker: { material: 'plastic', w: 14, h: 14, hp: 8, kg: 32, mu: 0.96, chips: '#222', sparks: true, sound: 'wood',
    light: { r: 34, color: '#8a5cff', intensity: 0.35, flicker: 'pulse' } },
  dj_booth: { static: true, vault: true, material: 'plastic', w: 58, h: 22, hp: 20, chips: '#222', sparks: true, sound: 'metal', blocksPath: true,
    light: { r: 130, color: '#ff3df0', intensity: 0.95, flicker: 'pulse', y: 8 } },
  bar_counter: { vault: true, material: 'wood', w: 32, h: 19, hp: 16, static: true, chips: '#4a2a1a', sound: 'wood', blocksPath: true },
  dumpster: { static: true, vault: true, material: 'metal', w: 58, h: 34, hp: 36, chips: '#2a6a3a', sound: 'metal', blocksPath: true },
  trash_can: { material: 'metal', r: 7.5, hp: 6, kg: 15, mu: 0.8, chips: '#555', sound: 'metal' },
  // street & neon dressing (overhead = drawn above characters, fades when the player walks under)
  palm_tree: { material: 'wood', r: 4.5, hp: 12, static: true, chips: '#2f8f3a', sound: 'wood', overhead: true, dirt: true,
    height: 0.06, pole: ['#4a3424', 6] },
  // the pole is at the sprite centre, the arm reaches 56 px along +x (rotate it over the road)
  streetlight: { material: 'metal', r: 3, hp: 4, static: true, chips: '#888', sparks: true, glass: true, sound: 'metal', overhead: true },
  neon_sign_palm: { material: 'glass', w: 38, h: 6, hp: 4, static: true, chips: '#ff2a6d', sparks: true, glass: true, sound: 'glass' },
  neon_sign_bar: { material: 'glass', w: 42, h: 6, hp: 4, static: true, chips: '#05d9e8', sparks: true, glass: true, sound: 'glass' },
  neon_sign_arrow: { material: 'glass', w: 28, h: 6, hp: 4, static: true, chips: '#f9c80e', sparks: true, glass: true, sound: 'glass' },
  jukebox: { static: true, material: 'plastic', w: 28, h: 20, hp: 8, chips: '#ff2a6d', sparks: true, glass: true, sound: 'metal', blocksPath: true },
  hydrant: { material: 'metal', r: 4, hp: 10, static: true, chips: '#c02020', sound: 'metal', fountain: true },
  bench: { vault: true, material: 'wood', w: 50, h: 15, hp: 8, static: true, chips: '#6a4026', sound: 'wood' },
  // chest-high chain-link gate panel: seen through and shot through (material 'mesh'), climbed over with Space;
  // guards path through it and vault it too (no blocksPath)
  chain_fence: { vault: true, climb: true, material: 'mesh', w: 32, h: 4, hp: 24, static: true, chips: '#9ea4ae', sound: 'metal' },
  // shop fronts of the street: what shows behind the lit display windows, and their neon wall signs (mounted like
  // the bar's: 3 px off the wall face; unlike the pictures they read one way up, so never rotate them)
  bottle_shelf: { static: true, material: 'wood', w: 40, h: 11, hp: 10, chips: '#7a4a10', glass: true, sound: 'glass', blocksPath: true },
  washer: { static: true, material: 'metal', w: 22, h: 22, hp: 18, chips: '#dfe3e8', sound: 'metal', blocksPath: true },
  neon_sign_liquor: { material: 'glass', w: 44, h: 6, hp: 4, static: true, chips: '#3aff8a', sparks: true, glass: true, sound: 'glass',
    light: { r: 120, color: '#3aff8a', intensity: 0.9, flicker: 'buzz' } },
  neon_sign_video: { material: 'glass', w: 42, h: 6, hp: 4, static: true, chips: '#05d9e8', sparks: true, glass: true, sound: 'glass',
    light: { r: 120, color: '#2af0ff', intensity: 0.9, flicker: 'buzz' } },
  neon_sign_wash: { material: 'glass', w: 48, h: 6, hp: 4, static: true, chips: '#7fe0ff', sparks: true, glass: true, sound: 'glass',
    light: { r: 120, color: '#8fdcff', intensity: 0.9, flicker: 'buzz' } },
  // light fixtures. Wall-mounted ones (wall_lamp, tubes) glow on their local +y side: put them on the wall face
  // and rotate them toward the room (0 = lights south, 90 = west, 180 = north, 270 = east).
  floor_lamp: { fixture: true, material: 'metal', r: 5, hp: 2, kg: 7, mu: 0.8, chips: '#e6c48a', sparks: true, glass: true, sound: 'glass',
    light: { r: 175, color: '#ffc98a', intensity: 0.95 } },
  table_lamp: { fixture: true, material: 'wood', r: 7.5, hp: 3, kg: 14, mu: 0.9, chips: '#6a4026', sparks: true, glass: true, sound: 'wood',
    light: { r: 130, color: '#ffb070', intensity: 0.85 } },
  wall_lamp: { fixture: true, static: true, material: 'glass', w: 12, h: 6, hp: 2, chips: '#ffe2a8', sparks: true, glass: true, sound: 'glass',
    light: { r: 160, color: '#ffd9a0', intensity: 0.9, y: 3 } },
  tube_light: { fixture: true, static: true, material: 'glass', w: 28, h: 4, hp: 2, chips: '#cfe6ff', sparks: true, glass: true, sound: 'glass',
    light: { r: 200, color: '#d4e8ff', intensity: 0.9, flicker: 'buzz', y: 3 } },
  neon_tube_pink: { fixture: true, static: true, material: 'glass', w: 28, h: 4, hp: 2, chips: '#ff2a6d', sparks: true, glass: true, sound: 'glass',
    light: { r: 150, color: '#ff2a6d', intensity: 0.95, flicker: 'buzz', y: 3 } },
  neon_tube_cyan: { fixture: true, static: true, material: 'glass', w: 28, h: 4, hp: 2, chips: '#05d9e8', sparks: true, glass: true, sound: 'glass',
    light: { r: 150, color: '#2af0ff', intensity: 0.95, flicker: 'buzz', y: 3 } },
  ceiling_lamp: { fixture: true, hung: true, overhead: true, height: 0.05, static: true, material: 'metal', r: 7, hp: 2, chips: '#2f5a48', sparks: true, glass: true, sound: 'metal',
    light: { r: 185, color: '#ffd9a0', intensity: 1 } },
  pool_lamp: { fixture: true, hung: true, overhead: true, height: 0.05, static: true, material: 'metal', w: 44, h: 10, hp: 3, chips: '#1f6a44', sparks: true, glass: true, sound: 'metal',
    light: [{ r: 150, color: '#fff0c0', intensity: 0.8, x: -12 }, { r: 150, color: '#fff0c0', intensity: 0.8, x: 12 }] },
  // bar sign lying on the top of the facade wall (centre it 6 px street-side of the wall's middle: row + 0.69 for a
  // sign reading from the south, so its edge overhangs the wall face and bullets can reach it)
  marquee: { fixture: true, hung: true, static: true, material: 'glass', w: 88, h: 22, hp: 6, chips: '#ff2a6d', sparks: true, glass: true, sound: 'glass',
    sign: { letters: [[7, 12], [20, 12], [33, 12], [46, 12], [59, 12], [72, 12]], faulty: 4 },
    light: [{ r: 170, color: '#ff2a6d', intensity: 0.95, x: -24, y: 15 }, { r: 170, color: '#ff2a6d', intensity: 0.95, x: 24, y: 15 }] },
  // strung across the street
  string_lights: { fixture: true, hung: true, overhead: true, height: 0.09, static: true, material: 'glass', w: 124, h: 4, hp: 2, chips: '#ffd27a', sparks: true, glass: true, sound: 'glass',
    light: [{ r: 80, color: '#ffc98a', intensity: 0.55, x: -40 }, { r: 80, color: '#ffc98a', intensity: 0.55 }, { r: 80, color: '#ffc98a', intensity: 0.55, x: 40 }] },
};
