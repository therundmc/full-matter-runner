// Furniture / props. w,h = hitbox (px), r = circle radius. hp: bullet hits before breaking. Everything breaks.
// material = see data/materials.js (impact sounds), kg = mass, mu = sliding friction against the floor (multiplied by the floor's own grip).
// vault = can be slid / jumped over.
// static = bolted down / too big to budge (never moves; it erodes and bursts into short-lived shards). Objects too heavy to push (mu·kg·g > PUSH_FORCE) stay put
// until something big (an explosion) shoves them.
export const PROPS = {
  table: { static: true, vault: true, material: 'wood', w: 38, h: 22, hp: 14, chips: '#7a4a2a', sound: 'wood', blocksPath: true },
  table_round: { static: true, vault: true, material: 'wood', r: 13, hp: 10, chips: '#8a5530', sound: 'wood', blocksPath: true },
  desk: { static: true, vault: true, material: 'wood', w: 34, h: 20, hp: 14, chips: '#6a4026', sound: 'wood', blocksPath: true, sparks: true },
  chair: { material: 'wood', w: 11, h: 11, hp: 6, kg: 10, mu: 0.88, chips: '#7a4a2a', sound: 'wood' },
  armchair: { static: true, material: 'fabric', w: 16, h: 16, hp: 10, chips: '#9a1f2a', sound: 'wood' },
  sofa: { static: true, vault: true, material: 'fabric', w: 42, h: 16, hp: 14, chips: '#c04a8a', sound: 'wood', blocksPath: true },
  plant: { material: 'ceramic', r: 7, hp: 4, kg: 16, mu: 0.96, chips: '#3a8a3a', dirt: true, sound: 'wood' },
  tv: { material: 'plastic', w: 22, h: 7, hp: 4, kg: 29, mu: 0.8, chips: '#222', sparks: true, glass: true, sound: 'glass' },
  fridge: { static: true, material: 'metal', w: 21, h: 19, hp: 18, chips: '#ddd', sound: 'metal', blocksPath: true },
  oven: { static: true, material: 'metal', w: 21, h: 19, hp: 18, chips: '#bbb', sound: 'metal', blocksPath: true, sparks: true },
  sink: { material: 'metal', w: 23, h: 13, hp: 14, static: true, chips: '#aab', sound: 'metal', blocksPath: true },
  toilet: { material: 'ceramic', w: 11, h: 15, hp: 6, static: true, chips: '#eee', sound: 'glass', water: true, blocksPath: true },
  bed: { static: true, vault: true, material: 'fabric', w: 29, h: 42, hp: 18, chips: '#7a3aa0', sound: 'wood', blocksPath: true },
  pool_table: { static: true, vault: true, material: 'wood', w: 62, h: 34, hp: 28, chips: '#1e7a3a', sound: 'wood', blocksPath: true },
  arcade: { static: true, material: 'plastic', w: 19, h: 15, hp: 10, chips: '#333', sparks: true, glass: true, sound: 'metal', blocksPath: true },
  crate: { vault: true, material: 'wood', w: 17, h: 17, hp: 8, kg: 40, mu: 0.96, chips: '#a07040', sound: 'wood' },
  barrel: { material: 'metal', r: 6.5, hp: 1, kg: 176, mu: 0.72, chips: '#c02020', explosive: true, blast: 92, sound: 'metal' },
  bookshelf: { static: true, material: 'wood', w: 39, h: 9, hp: 12, chips: '#6a4026', sound: 'wood', blocksPath: true },
  speaker: { material: 'plastic', w: 13, h: 13, hp: 8, kg: 48, mu: 0.96, chips: '#222', sparks: true, sound: 'wood' },
  dj_booth: { static: true, vault: true, material: 'plastic', w: 46, h: 16, hp: 20, chips: '#222', sparks: true, sound: 'metal', blocksPath: true },
  bar_counter: { vault: true, material: 'wood', w: 32, h: 13, hp: 16, static: true, chips: '#4a2a1a', sound: 'wood', blocksPath: true },
  dumpster: { static: true, vault: true, material: 'metal', w: 35, h: 21, hp: 36, chips: '#2a6a3a', sound: 'metal', blocksPath: true },
  trash_can: { material: 'metal', r: 5.5, hp: 6, kg: 19, mu: 0.8, chips: '#555', sound: 'metal' },
  // street & neon dressing (overhead = drawn above characters, fades when the player walks under)
  palm_tree: { material: 'wood', r: 4, hp: 12, static: true, chips: '#2f8f3a', sound: 'wood', overhead: true, dirt: true },
  streetlight: { material: 'metal', r: 3, hp: 4, static: true, chips: '#888', sparks: true, glass: true, sound: 'metal', overhead: true },
  neon_sign_palm: { material: 'glass', w: 38, h: 6, hp: 4, static: true, chips: '#ff2a6d', sparks: true, glass: true, sound: 'glass' },
  neon_sign_bar: { material: 'glass', w: 42, h: 6, hp: 4, static: true, chips: '#05d9e8', sparks: true, glass: true, sound: 'glass' },
  neon_sign_arrow: { material: 'glass', w: 28, h: 6, hp: 4, static: true, chips: '#f9c80e', sparks: true, glass: true, sound: 'glass' },
  jukebox: { static: true, material: 'plastic', w: 19, h: 13, hp: 8, chips: '#ff2a6d', sparks: true, glass: true, sound: 'metal', blocksPath: true },
  hydrant: { material: 'metal', r: 3.5, hp: 10, static: true, chips: '#c02020', sound: 'metal', fountain: true },
  bench: { vault: true, material: 'wood', w: 34, h: 10, hp: 8, static: true, chips: '#6a4026', sound: 'wood' },
};
