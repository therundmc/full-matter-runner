// Furniture / props. w,h = hitbox (px), r = circle radius. hp: bullet hits before breaking. Everything breaks.
// material = see data/materials.js (impact sounds), kg = mass, mu = sliding friction against a wooden floor (times the
// floor's grip and how its feet take to it: data/materials.js FLOOR_GRIP, SLIDE), feet = what it stands on when not its
// material (rubber feet). How it is pushed, struck and dragged: data/physics.js.
// vault = can be slid / jumped over.
// static = bolted down / too big to budge (never moves; it erodes and bursts into short-lived shards). Objects too heavy to push (stick.mu.kg.g > PHYSICS.pushForce) stay put
// until something big (an explosion) shoves them.
// light = light(s) cast by the object (see render/Lighting.js); fixture = a lamp: it flickers once damaged and its
// light dies with it. hung = it has no body: nobody and nothing bumps into it.
// mount = how it is held up, and so what it does when struck, shot or blown and how it is drawn (data/mounts.js
// MOUNTS: read there and nowhere else): 'floor' (the default), 'wall' (on a wall face: it goes with the wall tile,
// ON_WALL below), 'inset' (set in a front), 'pole' (on a post or a trunk), 'ceiling' (up on a ceiling or a wire: only
// a blast reaches it, it swings), 'awning' (cloth or a line hung low: torn as anything), 'structure' (a bridge, a
// gantry, the toll's roof: nothing ever touches it), 'billboard' (a structure whose face is shot to shreds:
// entities/Board.js, data/billboards.js). Every overhead or hung prop names its mount (tests/mounts.test.mjs).
// height = how high a pole's or a ceiling's thing sits, as parallax (fraction of its distance to the centre of the
// view; the other mounts have none: data/mounts.js parallaxOf);
// pole = [colour, width] of the post drawn from its foot to its head. sign = animated neon lettering (render/Lighting.js).

export const PROPS = {
  table: { static: true, vault: true, material: 'wood', w: 44, h: 26, hp: 14, chips: '#7a4a2a', sound: 'wood', blocksPath: true, flips: 'table_flipped' },
  table_round: { static: true, vault: true, material: 'wood', r: 14, hp: 10, chips: '#8a5530', sound: 'wood', blocksPath: true, flips: 'table_round_flipped' },
  desk: { static: true, vault: true, material: 'wood', w: 46, h: 24, hp: 14, chips: '#6a4026', sound: 'wood', blocksPath: true, sparks: true },
  chair: { material: 'wood', w: 14, h: 14, hp: 6, kg: 5, mu: 0.42, chips: '#7a4a2a', sound: 'wood' },
  armchair: { static: true, material: 'fabric', w: 26, h: 26, hp: 10, chips: '#9a1f2a', sound: 'wood' },
  sofa: { static: true, vault: true, material: 'fabric', w: 64, h: 28, hp: 14, chips: '#c04a8a', sound: 'wood', blocksPath: true },
  plant: { material: 'ceramic', r: 7.5, hp: 4, kg: 18, mu: 0.5, chips: '#3a8a3a', dirt: true, sound: 'wood' },
  tv: { material: 'plastic', w: 22, h: 15, hp: 4, kg: 30, mu: 0.45, chips: '#222', sparks: true, glass: true, sound: 'glass',
    light: { r: 100, color: '#7fc8ff', intensity: 1, flicker: 'tv', y: 7 } },
  // (the cold light that leaks from its door onto the floor in front of it; `lights: false` on one thrown out)
  fridge: { hum: 'fridge', static: true, material: 'metal', w: 22, h: 22, hp: 18, chips: '#ddd', sound: 'metal', blocksPath: true,
    light: { r: 46, color: '#cfeeff', intensity: 0.32, y: 12 } },
  // gas: a round through it lights a jet at the hole, then it goes off after `fuse` s (systems/Gas.js);
  // rocket: odds that a loose bottle takes off on its own jet
  oven: { static: true, material: 'metal', w: 20, h: 20, hp: 18, chips: '#bbb', sound: 'metal', blocksPath: true, sparks: true,
    gas: { fuse: [1.6, 2.6] }, blast: 84 },
  gas_bottle: { material: 'metal', r: 6, hp: 2, kg: 30, mu: 0.38, chips: '#4f82c0', explosive: true, blast: 80, sound: 'metal',
    gas: { fuse: [1.1, 2.2], rocket: 0.6 } },
  sink: { tap: [-5.3, 1],  material: 'metal', w: 26, h: 18, hp: 14, static: true, chips: '#aab', sound: 'metal', blocksPath: true },
  // a block of flats: a neighbour's door (shut for good, on its wall), a radiator under a wall, a bicycle leant on
  // one, a bin bag, a jerrycan. What lies flat on its floors (doormats, the stairs, a carpet) is paint: level `floor`.
  apt_door: { fixture: true, static: true, lasting: true, material: 'wood', w: 32, h: 6, hp: 99, chips: '#6a4426', sound: 'wood' },
  radiator: { mount: 'wall', fixture: true, static: true, lasting: true, material: 'metal', w: 28, h: 6, hp: 99, chips: '#8a8e98', sparks: true, sound: 'metal' },
  bike: { static: true, material: 'metal', w: 44, h: 10, hp: 6, chips: '#c8402c', sparks: true, sound: 'metal' },
  bin_bag: { material: 'fabric', r: 6.5, hp: 3, kg: 6, mu: 0.6, chips: '#2c2e3a', sound: 'wood' },
  jerrycan: { material: 'metal', w: 9, h: 11, hp: 8, kg: 9, mu: 0.4, chips: '#c8281e', sound: 'metal' },
  // a laundromat's plastic basket, a load of washing in it (level 1: the man doing his laundry)
  laundry_basket: { material: 'plastic', w: 18, h: 13, hp: 4, kg: 4, mu: 0.55, chips: '#3a86c8', sound: 'wood' },
  // a wall urinal (the wall behind it) and the partition between two toilets (its bracket end on the wall)
  urinal: { material: 'ceramic', w: 12, h: 10, hp: 5, static: true, chips: '#eee', sound: 'glass', water: true },
  stall: { material: 'wood', w: 4, h: 48, hp: 9, static: true, chips: '#8a9aa6', sound: 'wood' },
  toilet: { material: 'ceramic', w: 13, h: 21, hp: 6, static: true, chips: '#eee', sound: 'glass', water: true, blocksPath: true },
  bed: { static: true, vault: true, material: 'fabric', w: 44, h: 64, hp: 18, chips: '#7a3aa0', sound: 'wood', blocksPath: true },
  pool_table: { static: true, vault: true, material: 'wood', w: 80, h: 44, hp: 28, chips: '#1e7a3a', sound: 'wood', blocksPath: true },
  arcade: { static: true, material: 'plastic', w: 22, h: 27, hp: 10, chips: '#333', sparks: true, glass: true, sound: 'metal', blocksPath: true,
    light: { r: 64, color: '#3ae8ff', intensity: 0.7, flicker: 'tv', y: 6 } },
  crate: { vault: true, material: 'wood', w: 19, h: 19, hp: 8, kg: 45, mu: 0.5, chips: '#a07040', sound: 'wood' },
  barrel: { material: 'metal', r: 9, hp: 1, kg: 176, mu: 0.4, chips: '#c02020', explosive: true, blast: 92, sound: 'metal' },
  // a full steel keg (systems/Slips.js: the beer it gushes when holed floors whoever runs on it)
  keg: { material: 'metal', r: 8, hp: 7, kg: 62, mu: 0.4, chips: '#c4c8d0', sound: 'metal' },
  bookshelf: { static: true, material: 'wood', w: 40, h: 11, hp: 12, chips: '#6a4026', sound: 'wood', blocksPath: true },
  speaker: { material: 'plastic', feet: 'rubber', w: 14, h: 14, hp: 8, kg: 32, mu: 0.75, chips: '#222', sparks: true, sound: 'wood',
    light: { r: 34, color: '#8a5cff', intensity: 0.35, flicker: 'pulse' } },
  dj_booth: { static: true, vault: true, material: 'plastic', w: 58, h: 22, hp: 20, chips: '#222', sparks: true, sound: 'metal', blocksPath: true,
    light: { r: 130, color: '#ff3df0', intensity: 0.95, flicker: 'pulse', y: 8 } },
  card_table: { static: true, vault: true, material: 'wood', w: 58, h: 36, hp: 16, chips: '#1f7a4c', sound: 'wood', blocksPath: true, flips: 'card_table_flipped' },
  // a table tipped on its side for a shield (`flips`, Prop.flip): its top on edge toward local -y, the legs lying behind
  table_flipped: { static: true, vault: true, material: 'wood', w: 44, h: 25, hp: 14, chips: '#7a4a2a', sound: 'wood' },
  table_round_flipped: { static: true, vault: true, material: 'wood', w: 28, h: 25, hp: 10, chips: '#8a5530', sound: 'wood' },
  card_table_flipped: { static: true, vault: true, material: 'wood', w: 58, h: 25, hp: 16, chips: '#1f7a4c', sound: 'wood' },
  // the pimp's counting table (bricks, scale, cash): its desk lamp is the light
  dope_table: { static: true, vault: true, material: 'wood', w: 44, h: 26, hp: 12, chips: '#6e4426', sound: 'wood', blocksPath: true,
    light: { r: 70, color: '#ffe0a0', intensity: 0.6, x: 14, y: 8 } },
  // a low round stage one walks on: only its pole is in the way
  dance_stage: { static: true, material: 'metal', r: 3, hp: 14, chips: '#aab4c4', sparks: true, sound: 'metal',
    light: { r: 110, color: '#ffc8ee', intensity: 0.75, flicker: 'pulse' } },
  // the boss's case, open on the floor by his desk: banknotes fly at every hit
  cash_case: { material: 'plastic', w: 20, h: 14, hp: 4, kg: 9, mu: 0.4, chips: '#2a2a32', sound: 'wood' },
  // a velvet curtain across a doorway, its rod h px long: a cloth walked through (systems/Curtains.js, CURTAIN in
  // data/cloth.js: pushed, parted, drawn over whoever passes, seen through by the player in it), hiding what is beyond
  // unless parted wide (World.sightLine), rounds go through it
  curtain: { mount: 'awning', hung: true, overhead: true, static: true, curtain: true, material: 'wood', w: 6, h: 32, hp: 99, chips: '#7a0e22', sound: 'wood' },
  // a draught tower standing on the bar (laid over a counter module: it takes no room of its own, rounds go by it)
  beer_tap: { mount: 'floor', hung: true, static: true, material: 'metal', w: 20, h: 8, hp: 6, chips: '#b8bcc8', sound: 'metal' },
  bar_counter: { vault: true, material: 'wood', w: 32, h: 19, hp: 16, static: true, chips: '#4a2a1a', sound: 'wood', blocksPath: true },
  dumpster: { static: true, vault: true, material: 'metal', w: 58, h: 34, hp: 36, chips: '#2a6a3a', sound: 'metal', blocksPath: true },
  // a street bin: knocked over rather than broken (systems/Tipping.js); a level can keep one standing ({ tips: false })
  trash_can: { material: 'metal', r: 7.5, hp: 6, kg: 15, mu: 0.4, chips: '#555', sound: 'metal',
    // tips: what goes over instead of breaking. down: its sprite lying along x (base at -x, open mouth at +x); body:
    // [length, width] px of it lying, off: px from that body's centre to the sprite's; kg, mu once down (along its
    // length), rolls: its rolling resistance across it (engine/physics/Friction.js); roll: px/s it
    // slides on along the blow as it falls; lid: the sprite of its lid, come off and lying askew; spill: what falls out of the
    // mouth (n: [min, max]; bit: BITS, prop: a prop left lying, papers: loose sheets, systems/Papers.js); bump: closing
    // speed (px/step) of a body of `heavy` kg or more that knocks it over, `rock` that only rocks it; give: share of a
    // blow's shove it takes once down; wreck: px/step of a car that flattens it lying; noise: px the clatter carries.
    tips: {
      down: 'props/trash_can_down', body: [21, 14], off: 1, kg: 12, mu: 0.4, rolls: 0.05, roll: [40, 75], lid: 'props/bin_lid',
      spill: [{ prop: 'bin_bag', n: [1, 2] }, { bit: 'can', n: [2, 3] }, { bit: 'food', n: [2, 4] }, { papers: true, n: [4, 7] }],
      bump: 2.2, heavy: 10, rock: 0.4, give: 0.35, wreck: 3, noise: 220,
    } },
  // street & neon dressing (overhead = drawn above characters, fades when the player walks under)
  palm_tree: { mount: 'pole', material: 'wood', r: 4.5, hp: 12, static: true, chips: '#2f8f3a', sound: 'wood', overhead: true, dirt: true,
    height: 0.06, pole: ['#4a3424', 6] },
  // the pole is at the sprite centre, the arm reaches 56 px along +x (rotate it over the road)
  streetlight: { mount: 'pole', material: 'metal', r: 3, hp: 4, static: true, chips: '#888', sparks: true, glass: true, sound: 'metal', overhead: true },
  neon_sign_palm: { mount: 'wall', hum: 'neon', material: 'glass', w: 38, h: 6, hp: 4, static: true, chips: '#ff2a6d', sparks: true, glass: true, sound: 'glass' },
  neon_sign_bar: { mount: 'wall', hum: 'neon', material: 'glass', w: 42, h: 6, hp: 4, static: true, chips: '#05d9e8', sparks: true, glass: true, sound: 'glass' },
  neon_sign_arrow: { mount: 'wall', hum: 'neon', material: 'glass', w: 28, h: 6, hp: 4, static: true, chips: '#f9c80e', sparks: true, glass: true, sound: 'glass' },
  jukebox: { static: true, material: 'plastic', w: 28, h: 20, hp: 8, chips: '#ff2a6d', sparks: true, glass: true, sound: 'metal', blocksPath: true,
    light: { r: 70, color: '#ff5a9a', intensity: 0.55, flicker: 'pulse', y: 6 } },
  hydrant: { material: 'metal', r: 5.5, hp: 1, static: true, chips: '#c02020', sound: 'metal', fountain: true },
  bench: { vault: true, material: 'wood', w: 50, h: 15, hp: 8, static: true, chips: '#6a4026', sound: 'wood' },
  // chest-high chain-link gate panel: seen through and shot through (material 'mesh'), climbed over with Space;
  // guards path through it and vault it too (no blocksPath)
  // a fixed steel ladder filling its gap in a wall: the way up to a roof (climbed with Space, like the gate);
  // lasting: it is marked by blows and rounds but never destroyed (it closes a gap in a wall: gone, the gap would be a door)
  ladder: { vault: true, climb: 'rungs', lasting: true, blocksPath: true, material: 'mesh', w: 30, h: 30, hp: 60, static: true, chips: '#9ea4ae', sound: 'metal' },
  // the low wall at the edge of a roof, where one can drop to the ground (vaulted with Space);
  // land: 'roll' = one comes down from a height on the far side and rolls on landing (entities/Character.js);
  // down: one way only, off the roof: nobody on the ground gets over it up onto a roof (systems/Cover.js findVault)
  parapet: { vault: true, land: 'roll', down: true, lasting: true, blocksPath: true, material: 'stone', w: 32, h: 10, hp: 60, static: true, chips: '#8a5a50', sound: 'stone' },
  // what stands on a roof one can walk on: the sprites of the scenery of the roofs around (data/roofs.js), with a body
  ac_unit: { sprite: 'roof/ac_unit', static: true, vault: true, blocksPath: true, material: 'metal', w: 46, h: 32, hp: 30, chips: '#8a909c', sparks: true, sound: 'metal' },
  roof_vent: { sprite: 'roof/vent', static: true, material: 'metal', r: 6.5, hp: 12, chips: '#8a909c', sound: 'metal' },
  water_tank: { sprite: 'roof/tank', static: true, blocksPath: true, material: 'metal', r: 24, hp: 60, chips: '#6a4a32', sound: 'metal' },
  chain_fence: { vault: true, climb: true, land: 'roll', material: 'mesh', w: 32, h: 4, hp: 24, static: true, chips: '#9ea4ae', sound: 'metal' },
  // shop fronts of the street: what shows behind the lit display windows, and their neon wall signs (mounted like
  // the bar's: 3 px off the wall face; unlike the pictures they read one way up, so never rotate them)
  bottle_shelf: { static: true, material: 'wood', w: 40, h: 11, hp: 10, chips: '#7a4a10', glass: true, sound: 'glass', blocksPath: true },
  // the bar's own bottles, racked on the wall behind the counter (a shallow shelf: the bartender walks past it)
  back_bar: { static: true, material: 'wood', w: 40, h: 8, hp: 10, chips: '#7a4a10', glass: true, sound: 'glass', blocksPath: true },
  washer: { static: true, material: 'metal', w: 22, h: 22, hp: 18, chips: '#dfe3e8', sound: 'metal', blocksPath: true },
  // a closed shop's alarm (level `alarms`, systems/Alarms.js): shot off the wall, it shuts up
  alarm_box: { mount: 'wall', fixture: true, static: true, material: 'metal', w: 10, h: 5, hp: 3, chips: '#c4c8ce', sparks: true, sound: 'metal' },
  // the house's fuse box on an outside wall (level `power`, systems/Power.js): smashed, the lights go out inside
  fuse_box: { mount: 'wall', hum: 'mains', fixture: true, static: true, material: 'metal', w: 18, h: 8, hp: 3, chips: '#8a909c', sparks: true, sound: 'metal',
    light: { r: 64, color: '#ffe6a8', intensity: 0.6, y: 4 } }, // the pilot lamp over it: it has to be found
  // a battery lamp over a door: dark as long as the mains are on (`standby`), all that is left once they are cut
  emergency_light: { mount: 'wall', fixture: true, static: true, standby: true, material: 'glass', w: 6, h: 4, hp: 2, chips: '#ffb0a0', sparks: true, glass: true, sound: 'glass',
    light: { r: 150, color: '#ff5a3c', intensity: 0.95, y: 3 } },
  neon_sign_liquor: { mount: 'wall', hum: 'neon', material: 'glass', w: 44, h: 6, hp: 4, static: true, chips: '#3aff8a', sparks: true, glass: true, sound: 'glass',
    light: { r: 120, color: '#3aff8a', intensity: 0.9, flicker: 'buzz' } },
  neon_sign_video: { mount: 'wall', hum: 'neon', material: 'glass', w: 42, h: 6, hp: 4, static: true, chips: '#05d9e8', sparks: true, glass: true, sound: 'glass',
    light: { r: 120, color: '#2af0ff', intensity: 0.9, flicker: 'buzz' } },
  // two brass posts and the velvet rope between them, at a club's door (bolted down: the user wants the door tidy)
  velvet_rope: { static: true, material: 'metal', w: 30, h: 6, hp: 5, chips: '#a0142a', sound: 'metal' },
  // the bar's own signs on its front, either side of the door: its name, and the OPEN of an American bar
  neon_sign_mirage: { mount: 'wall', hum: 'neon', material: 'glass', w: 42, h: 6, hp: 4, static: true, chips: '#ff2a6d', sparks: true, glass: true, sound: 'glass',
    light: { r: 110, color: '#ff3a8a', intensity: 0.85, flicker: 'buzz' } },
  neon_sign_open: { mount: 'wall', hum: 'neon', material: 'glass', w: 26, h: 6, hp: 3, static: true, chips: '#ff3a30', sparks: true, glass: true, sound: 'glass',
    light: { r: 70, color: '#ff4a3a', intensity: 0.6, flicker: 'buzz' } },
  // by the bar's door on the sidewalk: the chalkboard of the night's specials, the steel ashtray post
  sandwich_board: { material: 'wood', w: 16, h: 12, hp: 3, kg: 6, mu: 0.45, chips: '#7a4a2a', sound: 'wood' },
  ash_urn: { material: 'metal', r: 5, hp: 4, kg: 9, mu: 0.4, chips: '#8a90a0', sound: 'metal' },
  neon_sign_wash: { mount: 'wall', hum: 'neon', material: 'glass', w: 48, h: 6, hp: 4, static: true, chips: '#7fe0ff', sparks: true, glass: true, sound: 'glass',
    light: { r: 120, color: '#8fdcff', intensity: 0.9, flicker: 'buzz' } },
  // a bar's walls, hung on the wall face (the wall at -y, the room along +y, like the wall lamps): framed pictures and
  // posters behind glass, a dartboard, a coin phone (its receiver jumps off the hook when hit: `handset`, coins
  // spill), coats on their hooks, the towels in the toilets; two small beer neons (read one way up: never rotated)
  frame_photo: { mount: 'wall', static: true, material: 'glass', w: 10, h: 3, hp: 2, chips: '#c8c0b0', glass: true, sound: 'glass' },
  frame_gold: { mount: 'wall', static: true, material: 'glass', w: 12, h: 3, hp: 2, chips: '#c8a040', glass: true, sound: 'glass' },
  poster_fight: { mount: 'wall', static: true, material: 'glass', w: 14, h: 3, hp: 2, chips: '#d8c8a0', glass: true, sound: 'glass' },
  poster_band: { mount: 'wall', static: true, material: 'glass', w: 12, h: 3, hp: 2, chips: '#2a2a3a', glass: true, sound: 'glass' },
  dartboard: { mount: 'wall', static: true, material: 'wood', w: 9, h: 3, hp: 3, chips: '#2a2420', sound: 'wood' },
  pay_phone: { mount: 'wall', static: true, material: 'metal', w: 8, h: 5, hp: 4, chips: '#8a909c', sparks: true, sound: 'metal', handset: [-2.5, 0] },
  coat_hooks: { mount: 'wall', static: true, material: 'fabric', w: 16, h: 4, hp: 4, chips: '#3a3440', sound: 'wood' },
  towel_dispenser: { mount: 'wall', static: true, material: 'plastic', w: 7, h: 3, hp: 2, chips: '#e8e8ec', sound: 'wood' },
  // back of house and the street: a run of electrical conduit with its junction box (a round in it sparks), bills
  // pasted one over the other on a street wall (paper: torn off by a blow, no glass)
  conduit: { mount: 'wall', static: true, material: 'metal', w: 46, h: 3, hp: 8, chips: '#868a94', sparks: true, sound: 'metal' },
  flyers: { mount: 'wall', static: true, material: 'fabric', w: 24, h: 3, hp: 2, chips: '#cfc5a8', sound: 'wood' },
  neon_sign_beer: { mount: 'wall', hum: 'neon', material: 'glass', w: 34, h: 6, hp: 3, static: true, chips: '#ffb02a', sparks: true, glass: true, sound: 'glass',
    light: { r: 80, color: '#ffb84a', intensity: 0.55, flicker: 'buzz' } },
  neon_sign_bay: { mount: 'wall', hum: 'neon', material: 'glass', w: 24, h: 6, hp: 3, static: true, chips: '#ff2a6d', sparks: true, glass: true, sound: 'glass',
    light: { r: 150, color: '#ff4a8a', intensity: 0.9, flicker: 'buzz', y: 3 } },
  // the VIP room's: two show bills, a strip of mirror behind the stage, red neon lips
  poster_pinup: { mount: 'wall', static: true, material: 'glass', w: 12, h: 3, hp: 2, chips: '#e8508a', glass: true, sound: 'glass' },
  poster_revue: { mount: 'wall', static: true, material: 'glass', w: 14, h: 3, hp: 2, chips: '#1e1a26', glass: true, sound: 'glass' },
  mirror_strip: { mount: 'wall', static: true, material: 'glass', w: 42, h: 3, hp: 3, chips: '#d8d0e8', glass: true, sound: 'glass' },
  neon_sign_lips: { mount: 'wall', hum: 'neon', material: 'glass', w: 22, h: 6, hp: 3, static: true, chips: '#ff2a4a', sparks: true, glass: true, sound: 'glass',
    light: { r: 90, color: '#ff3a5a', intensity: 0.6, flicker: 'buzz', y: 3 } },
  // the VIP room's low table: smoked glass in a chrome rim on one foot
  cocktail_table: { static: true, vault: true, material: 'metal', r: 12, hp: 8, chips: '#2a2030', sparks: true, sound: 'metal' },
  // ---- level 1's interiors (tools/generate_assets.py "the rooms of level 1"): what a shop, a laundromat, a bar's back
  // and an office are full of. seep = it drips, fumes or slops over (data/seeps.js, systems/Seeps.js).
  // The liquor store: a gondola of groceries, wine lying in its rack, beer by the case, the lottery's stand
  shop_shelf: { static: true, material: 'metal', w: 40, h: 11, hp: 10, chips: '#c8ccd4', sound: 'metal', blocksPath: true },
  wine_rack: { static: true, material: 'wood', w: 40, h: 11, hp: 10, chips: '#5a3420', glass: true, sound: 'glass', blocksPath: true },
  beer_cases: { vault: true, material: 'fabric', w: 20, h: 16, hp: 5, kg: 36, mu: 0.6, chips: '#b88a52', glass: true, sound: 'wood' },
  lottery_stand: { static: true, material: 'metal', w: 12, h: 10, hp: 3, chips: '#e8c040', sound: 'metal' },   // (bolted to the floor)
  // the TV shop: sets stacked on their stand and left on, the video recorders' shelf, a set still in its box, the
  // bench where one lies open under the lamp (its iron left hot)
  tv_stack: { static: true, material: 'plastic', w: 30, h: 18, hp: 8, chips: '#2a2a30', sparks: true, glass: true, sound: 'glass', blocksPath: true,
    light: { r: 90, color: '#8fd0ff', intensity: 0.8, flicker: 'tv', y: 9 } },
  vcr_shelf: { static: true, material: 'metal', w: 40, h: 11, hp: 10, chips: '#3a3a44', sparks: true, sound: 'metal', blocksPath: true },
  tv_box: { vault: true, material: 'fabric', w: 20, h: 16, hp: 4, kg: 22, mu: 0.6, chips: '#b88a52', sound: 'wood' },
  repair_bench: { static: true, vault: true, material: 'wood', w: 46, h: 22, hp: 14, chips: '#6a4a2c', sparks: true, sound: 'wood', blocksPath: true, seep: 'solder',
    light: { r: 64, color: '#ffe0a0', intensity: 0.55, x: -15, y: -3 } },
  // the laundromat: a dryer running (its drum turns: render/PropLife.js), the folding table, the soap machine, a wire
  // cart, moulded chairs
  dryer: { static: true, material: 'metal', w: 22, h: 22, hp: 18, chips: '#dfe3e8', sparks: true, sound: 'metal', blocksPath: true, seep: 'dryer' },
  folding_table: { static: true, vault: true, material: 'plastic', w: 44, h: 20, hp: 10, chips: '#d8d4c8', sound: 'wood', blocksPath: true },
  soap_vend: { static: true, material: 'metal', w: 18, h: 10, hp: 6, chips: '#3a6ab8', sparks: true, sound: 'metal', blocksPath: true,
    light: { r: 30, color: '#eaf2ff', intensity: 0.35, y: 6 } },
  laundry_cart: { material: 'metal', w: 24, h: 15, hp: 6, kg: 14, mu: 0.14, chips: '#b8bcc8', sound: 'metal' },
  plastic_chair: { material: 'plastic', w: 13, h: 13, hp: 4, kg: 3, mu: 0.45, chips: '#e87a2a', sound: 'wood' },
  // the bar: the cigarette machine, the ice bin behind the counter (it sweats), a coat stand, a crate of empties, the
  // toilets' wet-floor sign and the mop bucket (shoved, it slops over), a cooler in the office (its tap drips)
  cig_machine: { hum: 'fridge', static: true, material: 'metal', w: 22, h: 15, hp: 9, chips: '#6a4a2c', sparks: true, sound: 'metal', blocksPath: true,
    light: { r: 40, color: '#ffe6b0', intensity: 0.4, y: 8 } },
  ice_bin: { static: true, material: 'metal', w: 18, h: 13, hp: 10, chips: '#b8bcc8', sound: 'metal', blocksPath: true, seep: 'ice_bin' },
  coat_rack: { material: 'wood', r: 4, hp: 3, kg: 6, mu: 0.5, chips: '#5a3a24', sound: 'wood' },
  bottle_crate: { material: 'plastic', w: 14, h: 10, hp: 4, kg: 12, mu: 0.5, chips: '#b82030', glass: true, sound: 'wood' },
  wet_sign: { material: 'plastic', w: 9, h: 7, hp: 2, kg: 1.5, mu: 0.5, chips: '#f0c820', sound: 'wood' },
  mop_bucket: { material: 'plastic', feet: 'rubber', r: 6, hp: 4, kg: 12, mu: 0.3, chips: '#e8c020', sound: 'wood', seep: 'mop_bucket' },
  water_cooler: { static: true, material: 'plastic', r: 6.5, hp: 4, chips: '#bcd8e8', sound: 'wood', seep: 'water_cooler' },
  // offices and stores: a filing cabinet (paper flies), a safe nothing here opens, pallets of stock, steel shelving,
  // the hand truck
  filing_cabinet: { static: true, material: 'metal', w: 16, h: 20, hp: 12, chips: '#7a8088', sound: 'metal', blocksPath: true },
  safe: { static: true, lasting: true, material: 'metal', w: 22, h: 22, hp: 99, chips: '#3a4048', sound: 'metal', blocksPath: true },
  pallet: { static: true, vault: true, material: 'wood', w: 38, h: 30, hp: 14, chips: '#a07040', sound: 'wood', blocksPath: true },
  steel_shelf: { static: true, material: 'metal', w: 40, h: 12, hp: 12, chips: '#8a909c', sound: 'metal', blocksPath: true },
  hand_truck: { material: 'metal', w: 12, h: 22, hp: 6, kg: 11, mu: 0.2, chips: '#c8242c', sound: 'metal' },
  // on their walls (the wall at -y, the room along +y, as the bar's pictures are): the shop's convex mirror, the
  // cigarettes behind its counter, the price list, tapes on their rack, a cork board, the change machine (coins
  // spill), the hand dryer that never worked, what was scrawled in the toilets (paint: it is marked, never gone), a
  // clock (its second hand: render/PropLife.js), the brooms on their hooks (their calendars are the flat's `calendar`)
  security_mirror: { mount: 'wall', static: true, material: 'glass', w: 10, h: 4, hp: 2, chips: '#d8e0ea', glass: true, sound: 'glass' },
  cig_rack: { mount: 'wall', static: true, material: 'plastic', w: 26, h: 4, hp: 4, chips: '#c8242c', sound: 'wood' },
  price_board: { mount: 'wall', static: true, material: 'fabric', w: 22, h: 3, hp: 2, chips: '#1c1c22', sound: 'wood' },
  tape_rack: { mount: 'wall', static: true, material: 'plastic', w: 28, h: 4, hp: 4, chips: '#2a2a34', sound: 'wood' },
  notice_board: { mount: 'wall', static: true, material: 'fabric', w: 20, h: 3, hp: 3, chips: '#b08a5a', sound: 'wood' },
  coin_changer: { mount: 'wall', static: true, material: 'metal', w: 10, h: 5, hp: 4, chips: '#8a909c', sparks: true, sound: 'metal' },
  hand_dryer: { mount: 'wall', static: true, material: 'metal', w: 8, h: 5, hp: 3, chips: '#d8dce4', sparks: true, sound: 'metal' },
  graffiti: { mount: 'wall', static: true, lasting: true, material: 'stone', w: 26, h: 2, hp: 99, chips: '#8a8e96', sound: 'stone' },
  wall_clock: { mount: 'wall', static: true, material: 'glass', w: 7, h: 3, hp: 2, chips: '#e8e4d8', glass: true, sound: 'glass' },
  cleaning_rack: { mount: 'wall', static: true, material: 'wood', w: 20, h: 5, hp: 4, chips: '#8a6a3a', sound: 'wood' },
  // light fixtures. Wall-mounted ones (wall_lamp, tubes) glow on their local +y side: put them on the wall face
  // and rotate them toward the room (0 = lights south, 90 = west, 180 = north, 270 = east).
  floor_lamp: { fixture: true, material: 'metal', r: 5, hp: 2, kg: 7, mu: 0.4, chips: '#e6c48a', sparks: true, glass: true, sound: 'glass',
    light: { r: 175, color: '#ffc98a', intensity: 0.95 } },
  table_lamp: { fixture: true, material: 'wood', r: 7.5, hp: 3, kg: 14, mu: 0.5, chips: '#6a4026', sparks: true, glass: true, sound: 'wood',
    light: { r: 130, color: '#ffb070', intensity: 0.85 } },
  wall_lamp: { mount: 'wall', fixture: true, static: true, material: 'glass', w: 12, h: 6, hp: 2, chips: '#ffe2a8', sparks: true, glass: true, sound: 'glass',
    light: { r: 160, color: '#ffd9a0', intensity: 0.9, y: 3 } },
  tube_light: { mount: 'wall', fixture: true, static: true, material: 'glass', w: 28, h: 4, hp: 2, chips: '#cfe6ff', sparks: true, glass: true, sound: 'glass',
    light: { r: 200, color: '#c9f0dc', intensity: 0.9, flicker: 'buzz', y: 3 } },   // cold and a little green, as fluorescent is
  neon_tube_pink: { mount: 'wall', hum: 'neon', fixture: true, static: true, material: 'glass', w: 28, h: 4, hp: 2, chips: '#ff2a6d', sparks: true, glass: true, sound: 'glass',
    light: { r: 150, color: '#ff2a6d', intensity: 0.95, flicker: 'buzz', y: 3 } },
  neon_tube_cyan: { mount: 'wall', hum: 'neon', fixture: true, static: true, material: 'glass', w: 28, h: 4, hp: 2, chips: '#05d9e8', sparks: true, glass: true, sound: 'glass',
    light: { r: 150, color: '#2af0ff', intensity: 0.95, flicker: 'buzz', y: 3 } },
  // turns (`spin`, rad/s) with the shadow of its blades on the floor
  ceiling_fan: { mount: 'ceiling', hung: true, overhead: true, height: 0.05, static: true, material: 'metal', r: 5, hp: 3, chips: '#6e4e36', sparks: true, sound: 'metal', spin: 5.5 },
  // its light is a ring of small spots sweeping the room (render/Lighting.js `spots`), and a glint on the ball itself
  mirror_ball: { mount: 'ceiling', hung: true, overhead: true, height: 0.06, static: true, material: 'glass', r: 5, hp: 2, chips: '#dfe8f4', glass: true, sound: 'glass',
    light: [{ r: 118, color: '#ffffff', intensity: 0.95, spots: 16 }, { r: 30, color: '#e6ecff', intensity: 0.5 }] },
  // ---- what a level's devices are made of (data/devices.js). On a wall, facing the room along +y: the fire alarm's
  // red pull station (systems/Sprinklers.js)
  fire_alarm: { mount: 'wall', fixture: true, static: true, material: 'metal', w: 10, h: 6, hp: 3, chips: '#c0202a', sparks: true, sound: 'metal' },
  // on a wall, facing the room along +y: pierced, it empties itself in a white cloud nobody sees through (systems/Smoke.js)
  extinguisher: { mount: 'wall', static: true, material: 'metal', w: 6, h: 9, hp: 1, chips: '#c0202a', sound: 'metal', cloud: true },
  // ---- street furniture. handset = [x, y] px from the centre of the hook its receiver hangs on (render/PropLife.js);
  // bends = px its head gives way, all told, under blows; steam = 'vent': it breathes steam along its +y,
  // 'leak': a pipe that whistles steam out of every bullet hole (systems/Steam.js)
  vending: { hum: 'fridge', static: true, material: 'metal', w: 26, h: 20, hp: 9, chips: '#7a2630', sparks: true, sound: 'metal', blocksPath: true,
    light: { r: 64, color: '#eaf2ff', intensity: 0.6, y: 12 } },
  phone_booth: { static: true, material: 'glass', w: 24, h: 24, hp: 6, chips: '#8fd0e6', glass: true, sound: 'glass', blocksPath: true, handset: [5, -6],
    light: { r: 44, color: '#cfeeff', intensity: 0.45 } },
  parking_meter: { mount: 'pole', overhead: true, height: 0.012, pole: ['#4a4e58', 2], static: true, material: 'metal', r: 2.5, hp: 3, chips: '#8a909c', sound: 'metal', bends: 6 },
  news_box: { static: true, material: 'metal', w: 14, h: 11, hp: 4, chips: '#2a5aa8', sound: 'metal' },
  pipe_steam: { mount: 'wall', static: true, material: 'metal', w: 96, h: 4, hp: 40, chips: '#8a5a3a', sound: 'metal', steam: 'leak' },
  pipe_water: { mount: 'wall', drip: true, static: true, material: 'metal', w: 96, h: 4, hp: 40, chips: '#4a6a7a', sound: 'metal' },
  wall_vent: { mount: 'wall', static: true, material: 'metal', w: 14, h: 5, hp: 5, chips: '#6a707c', sound: 'metal', steam: 'vent' },
  ceiling_lamp: { mount: 'ceiling', fixture: true, hung: true, overhead: true, height: 0.05, static: true, material: 'metal', r: 7, hp: 2, chips: '#2f5a48', sparks: true, glass: true, sound: 'metal',
    light: { r: 185, color: '#ffd9a0', intensity: 1 } },
  pool_lamp: { mount: 'ceiling', fixture: true, hung: true, overhead: true, height: 0.05, static: true, material: 'metal', w: 44, h: 10, hp: 3, chips: '#1f6a44', sparks: true, glass: true, sound: 'metal',
    light: [{ r: 150, color: '#fff0c0', intensity: 0.8, x: -12 }, { r: 150, color: '#fff0c0', intensity: 0.8, x: 12 }] },
  // ---- level 2A, the back road (docs/LEVEL2.md). The box lorry that backs out across the street (systems/Lorries.js
  // moves it): it never gives (`lasting`: nose-on into it is the crash), the pursuers do not see it coming (`blind`)
  lorry: { static: true, lasting: true, blind: true, material: 'metal', w: 276, h: 76, hp: 99, chips: '#d2cbb8', sparks: true, sound: 'metal', blocksPath: true },
  // a canvas awning hung on a front (the wall at -y) is a `canopy`: a car driven under one tears it down
  // (systems/Drive.js)
  awning: { mount: 'awning', canopy: true, hung: true, overhead: true, static: true, material: 'fabric', w: 96, h: 36, hp: 4, chips: '#e0842c', sound: 'wood' },
  // shop awnings along the chase's fronts, that one in other cloth (torn down by a car under them: Drive `canopy`)
  awning_red: { mount: 'awning', canopy: true, hung: true, overhead: true, static: true, material: 'fabric', w: 96, h: 36, hp: 4, chips: '#b82030', sound: 'wood' },
  awning_green: { mount: 'awning', canopy: true, hung: true, overhead: true, static: true, material: 'fabric', w: 96, h: 36, hp: 4, chips: '#2a7a4a', sound: 'wood' },
  awning_blue: { mount: 'awning', canopy: true, hung: true, overhead: true, static: true, material: 'fabric', w: 96, h: 36, hp: 4, chips: '#2a4a9a', sound: 'wood' },
  awning_wine: { mount: 'awning', canopy: true, hung: true, overhead: true, static: true, material: 'fabric', w: 96, h: 36, hp: 4, chips: '#6a1a3a', sound: 'wood' },
  // what else stands on the chase's sidewalks and in its road works, light enough to be flung by a car
  traffic_cone: { material: 'plastic', r: 5, hp: 2, kg: 3, mu: 0.5, chips: '#ff6a1a', sound: 'wood' },
  sawhorse: { material: 'wood', w: 38, h: 8, hp: 3, kg: 14, mu: 0.5, chips: '#d0242c', sound: 'wood' },
  cardboard_box: { material: 'fabric', w: 15, h: 13, hp: 2, kg: 4, mu: 0.6, chips: '#b88a52', sound: 'wood' },
  paper_bundle: { material: 'fabric', w: 13, h: 9, hp: 2, kg: 8, mu: 0.6, chips: '#e8e4d6', sound: 'wood' },
  fruit_stand: { material: 'wood', w: 34, h: 16, hp: 4, kg: 30, mu: 0.5, chips: '#8a5a32', sound: 'wood' },
  shopping_cart: { material: 'metal', w: 20, h: 12, hp: 8, kg: 16, mu: 0.12, chips: '#b8bcc8', sound: 'metal' },
  mailbox: { static: true, material: 'metal', w: 13, h: 13, hp: 6, chips: '#2a6a4a', sound: 'metal' },
  neon_sign_diner: { mount: 'wall', hum: 'neon', material: 'glass', w: 44, h: 6, hp: 4, static: true, chips: '#ffa62a', sparks: true, glass: true, sound: 'glass',
    light: { r: 130, color: '#ffb04a', intensity: 0.9, flicker: 'buzz' } },
  // ---- level 2A's street (tools/build_level2a.py; sprites: "the road of level 2A" in tools/generate_assets.py).
  // signal = its lamps take turns (data/signals.js, systems/Signals.js): one flag a light of `light`, in order;
  // lamps = each light's slices [x, width] of the emissive map (its pixels), drawn only while it is lit.
  // Traffic lights on a mast arm: the pole (bolted: torn off by a car as a streetlight is) at the sprite's centre, the
  // arm 3 m along +x, the heads facing -y: turn it so the arm reaches over the lane it is for. Lights: red, amber, green
  traffic_light: { mount: 'pole', signal: 'traffic', overhead: true, static: true, material: 'metal', r: 4, hp: 6, chips: '#4e5362', sparks: true, glass: true, sound: 'metal',
    lamps: [[[331, 22], [403, 22]], [[309, 22], [381, 22]], [[287, 22], [359, 22]]],
    light: [{ r: 84, color: '#ff3a28', intensity: 0.6, x: 81, y: -8 }, { r: 84, color: '#ffb02a', intensity: 0.6, x: 70, y: -8 },
      { r: 84, color: '#2af08a', intensity: 0.6, x: 59, y: -8 }] },
  // a bus shelter, open along +y (the kerb): glass and thin steel, its advertising case lit
  bus_shelter: { hum: 'neon', static: true, material: 'glass', w: 126, h: 46, hp: 8, chips: '#8fd0e6', sparks: true, glass: true, sound: 'glass', blocksPath: true,
    light: { r: 84, color: '#dfeeff', intensity: 0.5, x: -52 } },
  // signs on their posts, the plate laid back to be read from above (as a parking meter's head is: the post drawn)
  sign_noparking: { mount: 'pole', overhead: true, height: 0.012, pole: ['#4a4e58', 2], static: true, material: 'metal', r: 2.5, hp: 3, chips: '#c8242c', sound: 'metal', bends: 6 },
  sign_oneway: { mount: 'pole', overhead: true, height: 0.012, pole: ['#4a4e58', 2], static: true, material: 'metal', r: 2.5, hp: 3, chips: '#ece8de', sound: 'metal', bends: 6 },
  sign_speed: { mount: 'pole', overhead: true, height: 0.012, pole: ['#4a4e58', 2], static: true, material: 'metal', r: 2.5, hp: 3, chips: '#ece8de', sound: 'metal', bends: 6 },
  sign_bus: { mount: 'pole', overhead: true, height: 0.012, pole: ['#4a4e58', 2], static: true, material: 'metal', r: 2.5, hp: 3, chips: '#2a56b0', sound: 'metal', bends: 6 },
  bollard: { static: true, material: 'metal', r: 3.5, hp: 5, chips: '#484c5a', sparks: true, sound: 'metal' },
  // a young tree in its grate (the grate is floor paint): the trunk is the body, the crown overhead
  street_tree: { mount: 'pole', material: 'wood', r: 4, hp: 10, static: true, chips: '#34803c', sound: 'wood', overhead: true, dirt: true, height: 0.04, pole: ['#4a3424', 5] },
  // the works in the parking lane: the arrow board on its trailer (three chevrons along -x, lit one after the other),
  // the compressor, barricades with a flasher on each end and the warning sign on its stand (both light: flung by a car)
  arrow_board: { signal: 'arrow', static: true, material: 'metal', w: 60, h: 34, hp: 10, chips: '#1c1c24', sparks: true, glass: true, sound: 'metal', blocksPath: true,
    lamps: [[[18, 38]], [[56, 38]], [[94, 38]]],
    light: [{ r: 44, color: '#ffb02a', intensity: 0.5, x: -21 }, { r: 44, color: '#ffb02a', intensity: 0.5, x: -2 }, { r: 44, color: '#ffb02a', intensity: 0.5, x: 17 }] },
  compressor: { static: true, material: 'metal', w: 54, h: 28, hp: 20, chips: '#d8a21c', sparks: true, sound: 'metal', blocksPath: true },
  barricade: { signal: 'flash', material: 'wood', w: 64, h: 7, hp: 3, kg: 22, mu: 0.5, chips: '#f07a1c', sound: 'wood',
    lamps: [[[0, 66]], [[66, 66]]],
    light: [{ r: 34, color: '#ffb02a', intensity: 0.45, x: -26 }, { r: 34, color: '#ffb02a', intensity: 0.45, x: 26 }] },
  sign_works: { material: 'metal', w: 14, h: 14, hp: 3, kg: 7, mu: 0.45, chips: '#f08a1c', sound: 'metal' },
  // over the street, out of everybody's reach (`hung`: no body; mount 'structure': nothing touches it): the railway's
  // bridge (along y; it fades over him as he drives under) and the freeway's sign on its truss (along x: a
  // 'billboard', its plates take holes and its lamps go out, the truss is untouched)
  viaduct: { mount: 'structure', hung: true, lasting: true, overhead: true, static: true, material: 'metal', w: 144, h: 320, hp: 99, chips: '#3c4350', sound: 'metal' },
  gantry_sign: { mount: 'billboard', hung: true, lasting: true, overhead: true, static: true, material: 'metal', w: 306, h: 36, hp: 99, chips: '#1c6a4c', sound: 'metal',
    light: [{ r: 70, color: '#fff0c8', intensity: 0.4, x: -65, y: 22 }, { r: 70, color: '#fff0c8', intensity: 0.4, x: 65, y: 22 }] },
  // ---- level 2A, part two (docs/LEVEL2.md segment 2; sprites: "level 2A, part two" in tools/generate_assets.py): the
  // works that close the street and the detour, the side street, the on-ramp, the toll. What a car goes through is
  // light and loose (flung: Drive.fling) or bolted and not `lasting` (torn off at once); what is `lasting` never gives
  // (nose-on into it is the crash; along it the car scrapes).
  // The road closed: the barricade across it (ROAD CLOSED, a flasher on each end), the DETOUR signs on their stands
  road_closed: { signal: 'flash', material: 'wood', w: 124, h: 8, hp: 4, kg: 60, mu: 0.5, chips: '#d0242c', sound: 'wood',
    lamps: [[[0, 128]], [[128, 128]]],
    light: [{ r: 40, color: '#ffb02a', intensity: 0.5, x: -58, y: -5.5 }, { r: 40, color: '#ffb02a', intensity: 0.5, x: 58, y: -5.5 }] },
  sign_detour: { material: 'metal', w: 38, h: 6, hp: 3, kg: 9, mu: 0.45, chips: '#f08a1c', sound: 'metal' },
  sign_detour_left: { material: 'metal', w: 38, h: 6, hp: 3, kg: 9, mu: 0.45, chips: '#f08a1c', sound: 'metal' },
  // a concrete barrier never gives; a water-filled one bursts (static: torn) and lets its water go
  jersey_barrier: { static: true, lasting: true, vault: true, material: 'stone', w: 96, h: 18, hp: 99, chips: '#a8a49a', sound: 'stone', blocksPath: true },
  water_barrier: { static: true, vault: true, material: 'plastic', w: 56, h: 18, hp: 6, chips: '#ee6a1e', sound: 'wood' },
  // the works' plant, parked: never moved
  excavator: { static: true, lasting: true, material: 'metal', w: 184, h: 78, hp: 99, chips: '#d8a018', sparks: true, sound: 'metal', blocksPath: true },
  dump_truck: { static: true, lasting: true, material: 'metal', w: 236, h: 78, hp: 99, chips: '#c04a1c', sparks: true, sound: 'metal', blocksPath: true },
  // the lighting tower: its floodlights face +x (the pool thrown ahead of them); knocked down, they die
  works_light: { fixture: true, static: true, material: 'metal', w: 60, h: 34, hp: 8, chips: '#d8d6cc', sparks: true, glass: true, sound: 'metal', blocksPath: true,
    light: [{ r: 240, color: '#eef4ff', intensity: 0.85, x: 44 }, { r: 70, color: '#ffffff', intensity: 0.45, x: -10 }] },
  site_fence: { static: true, material: 'mesh', w: 110, h: 4, hp: 16, chips: '#9ea4ae', sound: 'metal' },
  // the side street: a shed's shutter on its wall (marked, never gone), a loading bay's edge, a yard's gate, what
  // lies about
  roller_door: { mount: 'wall', static: true, lasting: true, material: 'metal', w: 96, h: 4, hp: 99, chips: '#7c8494', sound: 'metal' },
  loading_dock: { static: true, lasting: true, material: 'stone', w: 128, h: 22, hp: 99, chips: '#8e8a84', sound: 'stone', blocksPath: true },
  chainlink_gate: { static: true, material: 'mesh', w: 126, h: 4, hp: 20, chips: '#9ea4ae', sound: 'metal' },
  pallet_stack: { vault: true, material: 'wood', w: 38, h: 32, hp: 10, kg: 110, mu: 0.55, chips: '#b89060', sound: 'wood' },
  oil_drum: { material: 'metal', r: 9, hp: 8, kg: 70, mu: 0.4, chips: '#2a4a8a', sound: 'metal' },
  sign_stop: { mount: 'pole', overhead: true, height: 0.012, pole: ['#4a4e58', 2], static: true, material: 'metal', r: 2.5, hp: 3, chips: '#c8242c', sound: 'metal', bends: 6 },
  // the on-ramp: the guardrail and its end (along it the car scrapes), the sand barrels (they burst), the lamps over
  // it, its signs on their posts, the delineators
  guardrail: { static: true, lasting: true, material: 'metal', w: 128, h: 6, hp: 99, chips: '#9aa0a8', sparks: true, sound: 'metal' },
  guardrail_end: { static: true, lasting: true, material: 'metal', w: 60, h: 14, hp: 99, chips: '#e8c020', sparks: true, sound: 'metal' },
  // the same on a rail with the road at its -y (its posts behind it), and the plain ends the traffic leaves
  guardrail_end_r: { static: true, lasting: true, material: 'metal', w: 60, h: 14, hp: 99, chips: '#e8c020', sparks: true, sound: 'metal' },
  guardrail_end_trail: { static: true, lasting: true, material: 'metal', w: 60, h: 14, hp: 99, chips: '#9aa0a8', sparks: true, sound: 'metal' },
  guardrail_end_trail_r: { static: true, lasting: true, material: 'metal', w: 60, h: 14, hp: 99, chips: '#9aa0a8', sparks: true, sound: 'metal' },
  crash_cushion: { static: true, material: 'plastic', w: 84, h: 82, hp: 10, chips: '#e8c020', sound: 'wood' },
  // the same in single file, before a toll island's nose: no wider than the island (the other stood into its lanes)
  crash_cushion_narrow: { static: true, material: 'plastic', w: 84, h: 40, hp: 10, chips: '#e8c020', sound: 'wood' },
  highway_lamp: { mount: 'pole', material: 'metal', r: 4, hp: 5, static: true, chips: '#888', sparks: true, glass: true, sound: 'metal', overhead: true, height: 0.02,
    light: [{ r: 210, color: '#ffb46a', intensity: 0.85, x: -90 }, { r: 210, color: '#ffb46a', intensity: 0.85, x: 90 }] },
  // its one arm along -x (toward the road: nothing to light behind it)
  highway_lamp_single: { mount: 'pole', material: 'metal', r: 4, hp: 5, static: true, chips: '#888', sparks: true, glass: true, sound: 'metal', overhead: true, height: 0.02,
    light: [{ r: 210, color: '#ffb46a', intensity: 0.85, x: -90 }] },
  sign_freeway: { mount: 'pole', overhead: true, height: 0.012, pole: ['#4a4e58', 3], static: true, material: 'metal', r: 3, hp: 4, chips: '#1c6a4c', sound: 'metal', bends: 6 },
  sign_wrong_way: { mount: 'pole', overhead: true, height: 0.012, pole: ['#4a4e58', 2], static: true, material: 'metal', r: 2.5, hp: 3, chips: '#c8242c', sound: 'metal', bends: 6 },
  sign_speed_55: { mount: 'pole', overhead: true, height: 0.012, pole: ['#4a4e58', 2], static: true, material: 'metal', r: 2.5, hp: 3, chips: '#ece8de', sound: 'metal', bends: 6 },
  sign_toll_ahead: { mount: 'pole', overhead: true, height: 0.012, pole: ['#4a4e58', 3], static: true, material: 'metal', r: 3, hp: 4, chips: '#1c6a4c', sound: 'metal', bends: 6 },
  reflector_post: { static: true, material: 'plastic', r: 1.5, hp: 2, chips: '#e8e4da', sound: 'wood' },
  // a channelizer post on a gore's edge (a line of them: the merge, the lane drop): meant to be driven through, torn
  // off at no cost to the car (`cost` 0); its tube snaps off the base and flies (data/destruction.js); a small post
  // on the ground (mount 'floor': it shudders, it is shot and struck as anything)
  channelizer: { mount: 'floor', static: true, material: 'plastic', r: 3, hp: 1, chips: '#ff6a1a', sound: 'wood', cost: 0 },
  // the freeway's bridge over the side street: out of reach, it fades over him as he drives under (as the railway's)
  overpass: { mount: 'structure', hung: true, lasting: true, overhead: true, static: true, material: 'stone', w: 576, h: 256, hp: 99, chips: '#a8a49a', sound: 'stone' },
  // the toll: islands and booths never give; the roof over the lanes is out of reach (it fades over him); the wooden
  // arm is torn off (its pieces, gate_arm_bit_*, are loose bits to throw), the steel one kills; the lane lights
  toll_island: { static: true, lasting: true, material: 'stone', w: 254, h: 46, hp: 99, chips: '#d8b030', sound: 'stone', blocksPath: true },
  toll_booth: { static: true, lasting: true, material: 'metal', glass: true, w: 92, h: 38, hp: 99, chips: '#d8d4c8', sound: 'metal', blocksPath: true,
    light: { r: 50, color: '#ffe2a8', intensity: 0.2, x: 13 } },   // (under the roof: a stronger one burnt a blob on its sheet)
  toll_canopy: { mount: 'structure', hung: true, lasting: true, overhead: true, static: true, material: 'metal', w: 188, h: 636, hp: 99, chips: '#4e5562', sound: 'metal',
    // its floods under it (the light map lies over the roof too: at 0.6 they burnt its sheet white; the level's own
    // floods at the lanes' mouths and past the gates light the plaza's ends)
    light: [{ r: 150, color: '#e8f0ff', intensity: 0.28, y: -216, flicker: 'buzz' }, { r: 150, color: '#e8f0ff', intensity: 0.28, y: -72 },
      { r: 150, color: '#e8f0ff', intensity: 0.28, y: 72 }, { r: 150, color: '#e8f0ff', intensity: 0.28, y: 216 },
      // its neon: pink along the fascia the traffic comes in under, teal along the one it leaves under (on the road
      // outside its edges)
      { r: 100, color: '#ff4aa6', intensity: 0.32, x: -110, y: -150 }, { r: 100, color: '#ff4aa6', intensity: 0.32, x: -110, y: 150 },
      { r: 100, color: '#38f0dc', intensity: 0.28, x: 110, y: -150 }, { r: 100, color: '#38f0dc', intensity: 0.28, x: 110, y: 150 }] },
  // (`cost`: the share of his speed a car loses tearing it off, Drive.react; in its own pieces: data/destruction.js)
  gate_arm_wood: { static: true, material: 'wood', w: 110, h: 4, hp: 3, chips: '#d0242c', sound: 'wood', cost: 0.1 },
  gate_arm_bit_a: { material: 'wood', w: 42, h: 4, hp: 2, kg: 3, mu: 0.5, chips: '#d0242c', sound: 'wood' },
  gate_arm_bit_b: { material: 'wood', w: 30, h: 4, hp: 2, kg: 2, mu: 0.5, chips: '#d0242c', sound: 'wood' },
  gate_arm_bit_c: { material: 'wood', w: 20, h: 4, hp: 2, kg: 1.5, mu: 0.5, chips: '#d0242c', sound: 'wood' },
  gate_steel: { static: true, lasting: true, material: 'metal', w: 110, h: 8, hp: 99, chips: '#c8242c', sparks: true, sound: 'metal' },
  lane_signal_go: { mount: 'pole', overhead: true, height: 0.02, pole: ['#4a4e58', 2], static: true, material: 'metal', r: 2.5, hp: 3, chips: '#26262e', sparks: true, glass: true, sound: 'metal',
    light: { r: 44, color: '#2af08a', intensity: 0.5 } },
  lane_signal_stop: { mount: 'pole', overhead: true, height: 0.02, pole: ['#4a4e58', 2], static: true, material: 'metal', r: 2.5, hp: 3, chips: '#26262e', sparks: true, glass: true, sound: 'metal',
    light: { r: 44, color: '#ff2c2c', intensity: 0.5 } },
  sign_exact_change: { mount: 'pole', overhead: true, height: 0.012, pole: ['#4a4e58', 2], static: true, material: 'metal', r: 2.5, hp: 3, chips: '#e8b828', sound: 'metal', bends: 6 },
  // ART DECO 1985 (tools/generate_assets.py DECO_PROPS): generic dressing for any road of Sunset Bay. Fan palms (their
  // crown hung over, the trunk the body), hibiscus bushes and art deco planters a car goes through, a lamp post with
  // its frosted globe; a small art deco office and a state trooper's car parked (nothing gives: keep them off a road's
  // drivable width), a motel's billboard high on its legs (out of reach)
  palm_fan: { mount: 'pole', material: 'wood', r: 4.5, hp: 12, static: true, chips: '#2f8a4c', sound: 'wood', overhead: true, dirt: true, height: 0.06, pole: ['#5a3e26', 6] },
  palm_fan_small: { mount: 'pole', material: 'wood', r: 4.5, hp: 12, static: true, chips: '#5f9a3c', sound: 'wood', overhead: true, dirt: true, height: 0.05, pole: ['#5a3e26', 5] },
  hibiscus_bush: { static: true, vault: true, material: 'wood', r: 12, hp: 3, chips: '#ff5aa0', dirt: true, sound: 'wood' },
  hibiscus_bush_red: { static: true, vault: true, material: 'wood', r: 12, hp: 3, chips: '#e8283c', dirt: true, sound: 'wood' },
  planter_deco_pink: { static: true, vault: true, material: 'stone', w: 44, h: 44, hp: 14, chips: '#f0a0bc', dirt: true, sound: 'stone', blocksPath: true },
  planter_deco_teal: { static: true, vault: true, material: 'stone', w: 44, h: 44, hp: 14, chips: '#58c4b8', dirt: true, sound: 'stone', blocksPath: true },
  deco_lamp: { mount: 'pole', material: 'metal', r: 3, hp: 4, static: true, fixture: true, chips: '#58c4b8', sparks: true, glass: true, sound: 'metal', overhead: true, height: 0.02,
    light: { r: 150, color: '#ffe2b8', intensity: 0.7 } },
  police_car: { static: true, lasting: true, material: 'metal', w: 136, h: 54, hp: 99, chips: '#e6e6ea', sparks: true, glass: true, sound: 'metal', blocksPath: true },
  deco_office_pink: { static: true, lasting: true, material: 'stone', w: 156, h: 80, hp: 99, chips: '#f0a0bc', sound: 'stone', blocksPath: true,
    light: { r: 110, color: '#38f0dc', intensity: 0.55, y: -42, flicker: 'buzz' } },
  deco_office_teal: { static: true, lasting: true, material: 'stone', w: 156, h: 80, hp: 99, chips: '#58c4b8', sound: 'stone', blocksPath: true,
    light: { r: 110, color: '#38f0dc', intensity: 0.55, y: -42, flicker: 'buzz' } },
  billboard_motel: { mount: 'billboard', hung: true, lasting: true, overhead: true, static: true, material: 'wood', w: 376, h: 104, hp: 99, chips: '#ff4aa6', sound: 'wood',
    light: [{ r: 130, color: '#ff8ac8', intensity: 0.45, x: -90, y: -20, flicker: 'buzz' }, { r: 130, color: '#ffe8c8', intensity: 0.45, x: 90, y: -20 }] },
  // ---- Miami, 1985 (generic dressing; sprites: "Miami, 1985" in tools/generate_assets.py). Royal palms (the pale
  // trunk is the pole, the crown hung high), hibiscus hedges, pastel stucco canopies along a front (hung: a neon tube
  // along the lip, its light under it), awnings in pastel cloth, pole signs and wall neon, billboards on their
  // catwalks (hung, lit by their four lamps), a car lot (its light poles, pennants), and the freeway's grime: a burnt
  // car, a camp (tarp, a fire in a drum), chain-link (a hole cut in one), a dented rail, a cushion somebody hit, a
  // call box. What a car goes through is torn (static, not `lasting`); the shells and the rails never give
  royal_palm: { mount: 'pole', material: 'wood', r: 8, hp: 16, static: true, chips: '#3a8a4a', sound: 'wood', overhead: true, dirt: true, height: 0.09, pole: ['#a8a49a', 10] },
  royal_palm_b: { mount: 'pole', material: 'wood', r: 8, hp: 16, static: true, chips: '#3a8a4a', sound: 'wood', overhead: true, dirt: true, height: 0.09, pole: ['#a8a49a', 10] },
  hibiscus_hedge: { static: true, vault: true, material: 'wood', w: 92, h: 20, hp: 8, chips: '#2e7a3a', dirt: true, sound: 'wood' },
  hibiscus_hedge_pink: { static: true, vault: true, material: 'wood', w: 92, h: 20, hp: 8, chips: '#2e7a3a', dirt: true, sound: 'wood' },
  deco_canopy_pink: { mount: 'structure', hum: 'neon', hung: true, lasting: true, overhead: true, static: true, material: 'stone', w: 128, h: 36, hp: 99, chips: '#f0a8c0', sound: 'stone',
    light: { r: 100, color: '#3ae8ff', intensity: 0.6, flicker: 'buzz', y: 24 } },
  deco_canopy_mint: { mount: 'structure', hum: 'neon', hung: true, lasting: true, overhead: true, static: true, material: 'stone', w: 128, h: 36, hp: 99, chips: '#9edcc6', sound: 'stone',
    light: { r: 100, color: '#ff4a8a', intensity: 0.6, flicker: 'buzz', y: 24 } },
  deco_canopy_peach: { mount: 'structure', hum: 'neon', hung: true, lasting: true, overhead: true, static: true, material: 'stone', w: 128, h: 36, hp: 99, chips: '#f6c49c', sound: 'stone',
    light: { r: 100, color: '#ff4a8a', intensity: 0.6, flicker: 'buzz', y: 24 } },
  deco_canopy_lavender: { mount: 'structure', hum: 'neon', hung: true, lasting: true, overhead: true, static: true, material: 'stone', w: 128, h: 36, hp: 99, chips: '#c2b0e4', sound: 'stone',
    light: { r: 100, color: '#3ae8ff', intensity: 0.6, flicker: 'buzz', y: 24 } },
  awning_pink: { mount: 'awning', canopy: true, hung: true, overhead: true, static: true, material: 'fabric', w: 96, h: 36, hp: 4, chips: '#f08ab0', sound: 'wood' },
  awning_mint: { mount: 'awning', canopy: true, hung: true, overhead: true, static: true, material: 'fabric', w: 96, h: 36, hp: 4, chips: '#7ad0b0', sound: 'wood' },
  awning_peach: { mount: 'awning', canopy: true, hung: true, overhead: true, static: true, material: 'fabric', w: 96, h: 36, hp: 4, chips: '#f4a878', sound: 'wood' },
  awning_lavender: { mount: 'awning', canopy: true, hung: true, overhead: true, static: true, material: 'fabric', w: 96, h: 36, hp: 4, chips: '#b49ae0', sound: 'wood' },
  pole_sign_motel: { mount: 'pole', hum: 'neon', overhead: true, height: 0.05, pole: ['#d8d0c0', 4], static: true, material: 'metal', r: 4, hp: 6, chips: '#f6c49c', sparks: true, glass: true, sound: 'metal',
    light: [{ r: 150, color: '#ff4a9a', intensity: 0.75, flicker: 'buzz', y: -8 }, { r: 90, color: '#3ae8ff', intensity: 0.5, flicker: 'stutter', y: 12 }] },
  pole_sign_autos: { mount: 'pole', hum: 'neon', overhead: true, height: 0.05, pole: ['#d8d0c0', 4], static: true, material: 'metal', r: 4, hp: 6, chips: '#c2b0e4', sparks: true, glass: true, sound: 'metal',
    light: [{ r: 150, color: '#ffb04a', intensity: 0.75, flicker: 'buzz', y: -8 }, { r: 90, color: '#ff4a8a', intensity: 0.5, flicker: 'buzz', y: 10 }] },
  neon_sign_motel: { mount: 'wall', hum: 'neon', material: 'glass', w: 38, h: 6, hp: 4, static: true, chips: '#ff2a6d', sparks: true, glass: true, sound: 'glass',
    light: { r: 120, color: '#ff4a8a', intensity: 0.85, flicker: 'buzz' } },
  neon_sign_vacancy: { mount: 'wall', hum: 'neon', material: 'glass', w: 44, h: 6, hp: 4, static: true, chips: '#05d9e8', sparks: true, glass: true, sound: 'glass',
    light: { r: 110, color: '#3ae8ff', intensity: 0.8, flicker: 'stutter' } },
  neon_sign_flamingo: { mount: 'wall', hum: 'neon', material: 'glass', w: 24, h: 6, hp: 3, static: true, chips: '#ff2a6d', sparks: true, glass: true, sound: 'glass',
    light: { r: 100, color: '#ff4a9a', intensity: 0.8, flicker: 'buzz' } },
  billboard_tan: { mount: 'billboard', hung: true, lasting: true, overhead: true, static: true, material: 'metal', w: 252, h: 104, hp: 99, chips: '#c8c4d0', sound: 'metal',
    light: [{ r: 130, color: '#fff0d0', intensity: 0.55, x: -90, y: -10 }, { r: 130, color: '#fff0d0', intensity: 0.55, x: -26, y: -10 },
      { r: 130, color: '#fff0d0', intensity: 0.55, x: 26, y: -10 }, { r: 130, color: '#fff0d0', intensity: 0.55, x: 90, y: -10 }] },
  billboard_radio: { mount: 'billboard', hung: true, lasting: true, overhead: true, static: true, material: 'metal', w: 252, h: 104, hp: 99, chips: '#c8c4d0', sound: 'metal',
    light: [{ r: 130, color: '#fff0d0', intensity: 0.55, x: -90, y: -10 }, { r: 130, color: '#fff0d0', intensity: 0.55, x: -26, y: -10 },
      { r: 130, color: '#fff0d0', intensity: 0.55, x: 26, y: -10 }, { r: 130, color: '#fff0d0', intensity: 0.55, x: 90, y: -10 }] },
  lot_light: { mount: 'pole', fixture: true, material: 'metal', r: 3, hp: 4, static: true, chips: '#888', sparks: true, glass: true, sound: 'metal', overhead: true, height: 0.03,
    light: [{ r: 170, color: '#f4f8ff', intensity: 0.7, x: -26, y: 40 }, { r: 170, color: '#f4f8ff', intensity: 0.7, x: 26, y: 40 }] },
  sign_gantry: { mount: 'billboard', hung: true, lasting: true, overhead: true, static: true, material: 'metal', w: 80, h: 448, hp: 99, chips: '#1c6a4c', sound: 'metal',
    light: [{ r: 120, color: '#e8fff0', intensity: 0.55, x: -36, y: -108 }, { r: 120, color: '#e8fff0', intensity: 0.55, x: -36, y: 132 }] },
  pennant_string: { mount: 'awning', hung: true, overhead: true, static: true, material: 'fabric', w: 112, h: 12, hp: 2, chips: '#ff5aa0', sound: 'wood' },
  car_burnt: { static: true, lasting: true, material: 'metal', w: 136, h: 54, hp: 99, chips: '#5a3a2a', sparks: true, sound: 'metal', blocksPath: true },
  tent_tarp: { static: true, material: 'fabric', w: 64, h: 44, hp: 6, chips: '#2a5ab8', sound: 'wood' },
  barrel_fire: { static: true, material: 'metal', r: 10, hp: 10, chips: '#7a3a24', sparks: true, sound: 'metal', blocksPath: true,
    light: { r: 150, color: '#ff8a2a', intensity: 0.9, flicker: 'tv' } },
  chainlink_fence: { static: true, material: 'mesh', w: 128, h: 4, hp: 16, chips: '#9ea4ae', sound: 'metal' },
  chainlink_hole: { static: true, material: 'mesh', w: 128, h: 4, hp: 12, chips: '#9ea4ae', sound: 'metal' },
  guardrail_dented: { static: true, lasting: true, material: 'metal', w: 128, h: 6, hp: 99, chips: '#9aa0a8', sparks: true, sound: 'metal' },
  call_box: { mount: 'pole', overhead: true, height: 0.012, pole: ['#4a4e58', 2], static: true, material: 'metal', r: 2.5, hp: 3, chips: '#e8c020', sound: 'metal', bends: 6 },
  // ---- the suburb going to Miami (generic dressing; sprites: "the suburb going to Miami" in tools/generate_assets.py).
  // Palms (a sabal's rough trunk and a young royal's are the pole, a leaning coconut palm's trunk is painted), the
  // suburb's furniture (bus benches with an ad, a pay phone, news boxes, mailboxes, a strip's pole sign, a yard's
  // fence, low stucco walls, a carport hung over a drive, an aerial on a roof's edge, plastic flamingos, oleanders),
  // the homeless's things, and three ways round the lorry on the sidewalk: a fruit market, a car wash, a tyre yard.
  // What a car goes through is torn (static, not `lasting`) or flung (loose, kg <= CHASE.hit.fling.kg); nothing in
  // them is `lasting`
  sabal_palm: { mount: 'pole', material: 'wood', r: 6, hp: 12, static: true, chips: '#2e6438', sound: 'wood', overhead: true, dirt: true, height: 0.06, pole: ['#7a6a52', 8] },
  sabal_palm_b: { mount: 'pole', material: 'wood', r: 6, hp: 12, static: true, chips: '#2e6438', sound: 'wood', overhead: true, dirt: true, height: 0.06, pole: ['#7a6a52', 8] },
  sabal_palm_ragged: { mount: 'pole', material: 'wood', r: 6, hp: 12, static: true, chips: '#2e6438', sound: 'wood', overhead: true, dirt: true, height: 0.06, pole: ['#7a6a52', 8] },
  coconut_palm_lean: { mount: 'pole', material: 'wood', r: 5, hp: 14, static: true, chips: '#3e7a2c', sound: 'wood', overhead: true, dirt: true, height: 0.03 },
  palm_young: { mount: 'pole', material: 'wood', r: 3, hp: 6, static: true, chips: '#2e7a3c', sound: 'wood', overhead: true, dirt: true, height: 0.03, pole: ['#8a8476', 4] },
  palm_stump: { static: true, material: 'wood', r: 8, hp: 12, chips: '#c8b08a', sound: 'wood' },
  bus_bench_bail: { static: true, vault: true, material: 'stone', w: 62, h: 22, hp: 12, chips: '#b8b2a4', sound: 'stone' },
  bus_bench_abogado: { static: true, vault: true, material: 'stone', w: 62, h: 22, hp: 12, chips: '#b8b2a4', sound: 'stone' },
  payphone_pastel: { mount: 'pole', overhead: true, height: 0.012, pole: ['#8a8e98', 2], static: true, material: 'metal', r: 2.5, hp: 3, chips: '#9edcc6', sparks: true, sound: 'metal', bends: 6,
    light: { r: 40, color: '#dff4ff', intensity: 0.35, y: -6 } },
  news_box_yellow: { static: true, material: 'metal', w: 14, h: 11, hp: 4, chips: '#e8b820', sound: 'metal' },
  news_box_red: { static: true, material: 'metal', w: 14, h: 11, hp: 4, chips: '#c02a2a', sound: 'metal' },
  mailbox_blue: { static: true, material: 'metal', w: 16, h: 14, hp: 6, chips: '#2a4a8a', sound: 'metal' },
  mailbox_post: { mount: 'pole', overhead: true, height: 0.012, pole: ['#6a5038', 3], static: true, material: 'wood', r: 2.5, hp: 3, chips: '#5ab8b0', sound: 'wood' },
  mailbox_post_b: { mount: 'pole', overhead: true, height: 0.012, pole: ['#6a5038', 3], static: true, material: 'wood', r: 2.5, hp: 3, chips: '#2e2c34', sound: 'wood' },
  mailbox_post_c: { mount: 'pole', overhead: true, height: 0.012, pole: ['#6a5038', 3], static: true, material: 'wood', r: 2.5, hp: 3, chips: '#ece4d2', sound: 'wood' },
  mailbox_post_d: { mount: 'pole', overhead: true, height: 0.012, pole: ['#6a5038', 3], static: true, material: 'wood', r: 2.5, hp: 3, chips: '#a84a3a', sound: 'wood' },
  // a house's front, laid on its wall's face: a jalousie window dark or lit from inside, the door and its porch light;
  // set in the wall, not hung on it (hung: no body to catch a car run along the fronts, tests/kerb.test.mjs)
  house_window: { mount: 'inset', hung: true, static: true, material: 'glass', w: 52, h: 4, hp: 2, chips: '#9ab8c8', glass: true, sound: 'glass' },
  house_window_lit: { mount: 'inset', hung: true, static: true, material: 'glass', w: 52, h: 4, hp: 2, chips: '#9ab8c8', glass: true, sound: 'glass',
    light: { r: 70, color: '#ffb860', intensity: 0.4, y: 8 } },
  house_door: { mount: 'inset', hung: true, static: true, lasting: true, material: 'wood', w: 30, h: 4, hp: 99, chips: '#7a4a2c', sound: 'wood',
    light: { r: 150, color: '#ffd9a0', intensity: 0.85, x: 16.5, y: 4 } },
  pole_sign_strip: { mount: 'pole', hum: 'neon', overhead: true, height: 0.05, pole: ['#d8d0c0', 5], static: true, material: 'metal', r: 4, hp: 6, chips: '#5ab8b0', sparks: true, glass: true, sound: 'metal',
    light: [{ r: 150, color: '#ff4a9a', intensity: 0.6, flicker: 'buzz', y: -28 }, { r: 130, color: '#f4f8ff', intensity: 0.5, y: 10 }] },
  yard_fence: { static: true, material: 'mesh', w: 128, h: 4, hp: 14, chips: '#9ea4ae', sound: 'metal' },
  yard_fence_gate: { static: true, material: 'mesh', w: 128, h: 4, hp: 14, chips: '#9ea4ae', sound: 'metal' },
  garden_wall_pink: { static: true, vault: true, material: 'stone', w: 96, h: 10, hp: 18, chips: '#f0a8c0', sound: 'stone', blocksPath: true },
  garden_wall_mint: { static: true, vault: true, material: 'stone', w: 96, h: 10, hp: 18, chips: '#9edcc6', sound: 'stone', blocksPath: true },
  garden_wall_cream: { static: true, vault: true, material: 'stone', w: 96, h: 10, hp: 18, chips: '#efe2c4', sound: 'stone', blocksPath: true },
  carport: { mount: 'awning', canopy: true, hung: true, overhead: true, static: true, material: 'plastic', w: 188, h: 100, hp: 6, chips: '#b4d4a4', sound: 'wood' },
  tv_antenna: { mount: 'structure', hung: true, lasting: true, overhead: true, static: true, material: 'metal', w: 54, h: 28, hp: 99, chips: '#a8acb4', sound: 'metal' },
  lawn_flamingos: { material: 'plastic', w: 28, h: 18, hp: 1, kg: 1.5, mu: 0.5, chips: '#ff6aa0', sound: 'wood' },
  oleander_pink: { static: true, material: 'wood', w: 48, h: 40, hp: 6, chips: '#2a5a2e', dirt: true, sound: 'wood' },
  oleander_white: { static: true, material: 'wood', w: 48, h: 40, hp: 6, chips: '#2a5a2e', dirt: true, sound: 'wood' },
  cart_loaded: { material: 'metal', w: 22, h: 14, hp: 8, kg: 35, mu: 0.15, chips: '#b8bcc8', sound: 'metal' },
  bedroll: { material: 'fabric', w: 26, h: 10, hp: 2, kg: 3, mu: 0.7, chips: '#c8622a', sound: 'wood' },
  bags_pile: { static: true, material: 'fabric', w: 44, h: 22, hp: 4, chips: '#2a2c34', sound: 'wood' },
  doorway_camp: { static: true, material: 'fabric', w: 68, h: 40, hp: 6, chips: '#7a5a3a', sound: 'wood' },
  // (a) a fruit market on a vacant corner: the stalls torn (their bulb dies with them), the crates and the sign flung
  market_stall: { static: true, fixture: true, material: 'wood', w: 78, h: 44, hp: 5, chips: '#f08a3a', sound: 'wood',
    light: { r: 70, color: '#ffd890', intensity: 0.55, flicker: 'buzz', y: 0.5 } },
  market_stall_coco: { static: true, fixture: true, material: 'wood', w: 78, h: 44, hp: 5, chips: '#3a9a5a', sound: 'wood',
    light: { r: 70, color: '#ffd890', intensity: 0.55, flicker: 'buzz', y: 0.5 } },
  fruit_crate_orange: { material: 'wood', w: 18, h: 12, hp: 3, kg: 14, mu: 0.5, chips: '#b89060', sound: 'wood' },
  fruit_crate_mango: { material: 'wood', w: 18, h: 12, hp: 3, kg: 14, mu: 0.5, chips: '#b89060', sound: 'wood' },
  fruit_crate_coconut: { material: 'wood', w: 18, h: 12, hp: 3, kg: 16, mu: 0.5, chips: '#b89060', sound: 'wood' },
  market_sign: { material: 'wood', w: 42, h: 14, hp: 3, kg: 6, mu: 0.45, chips: '#c8a878', sound: 'wood' },
  // (b) a car wash's forecourt: the big sign on its stakes torn, the rest flung
  carwash_sign: { static: true, material: 'wood', w: 70, h: 6, hp: 3, chips: '#c8a878', sound: 'wood' },
  carwash_board: { material: 'wood', w: 22, h: 14, hp: 3, kg: 6, mu: 0.45, chips: '#c8a878', sound: 'wood' },
  wash_bucket: { material: 'plastic', r: 6, hp: 2, kg: 9, mu: 0.45, chips: '#c83a2a', sound: 'wood' },
  hose_reel: { material: 'metal', w: 26, h: 16, hp: 6, kg: 14, mu: 0.4, chips: '#3a9a3a', sound: 'metal' },
  // (c) a used tyre yard: the tyres bounce away (rubber), the rack is torn
  tyre_stack: { material: 'rubber', r: 11, hp: 10, kg: 36, mu: 0.9, chips: '#141418', sound: 'wood' },
  tyre_pile: { material: 'rubber', w: 52, h: 36, hp: 12, kg: 90, mu: 0.9, chips: '#141418', sound: 'wood' },
  tyre_loose: { material: 'rubber', r: 10, hp: 6, kg: 9, mu: 0.9, chips: '#141418', sound: 'wood' },
  tyre_rack: { static: true, material: 'metal', w: 62, h: 18, hp: 8, chips: '#585a70', sparks: true, sound: 'metal' },
  tyre_sign: { material: 'wood', w: 46, h: 14, hp: 3, kg: 6, mu: 0.45, chips: '#c8a878', sound: 'wood' },
  // strung across the street
  string_lights: { mount: 'ceiling', fixture: true, hung: true, overhead: true, static: true, material: 'glass', w: 124, h: 4, hp: 2, chips: '#ffd27a', sparks: true, glass: true, sound: 'glass',
    light: [{ r: 80, color: '#ffc98a', intensity: 0.55, x: -40 }, { r: 80, color: '#ffc98a', intensity: 0.55 }, { r: 80, color: '#ffc98a', intensity: 0.55, x: 40 }] },
  // ---- the flat of the prologue (tools/build_tutorial.py; sprites: "The flat of the prologue" in
  // tools/generate_assets.py): his few things, light enough to be kicked about, and what is fixed to its walls
  nightstand: { material: 'wood', w: 14, h: 10, hp: 5, kg: 12, mu: 0.5, chips: '#6a4a30', sound: 'wood' },
  chair_jacket: { material: 'wood', w: 14, h: 14, hp: 6, kg: 6, mu: 0.42, chips: '#7a4a2a', sound: 'wood' },
  duffel_bag: { material: 'fabric', w: 20, h: 10, hp: 4, kg: 11, mu: 0.6, chips: '#5a6238', sound: 'wood' },
  coffee_table: { static: true, vault: true, material: 'wood', w: 32, h: 18, hp: 8, chips: '#5a3a22', sound: 'wood', blocksPath: true },
  record_player: { static: true, material: 'wood', w: 20, h: 14, hp: 8, chips: '#7a5230', sparks: true, sound: 'wood', blocksPath: true },
  worktop: { static: true, material: 'wood', w: 38, h: 12, hp: 14, chips: '#cfc6ae', sound: 'wood', blocksPath: true },
  // seep (data/seeps.js, systems/Seeps.js): the water heater's joint weeps on the floor; the pail under a leak in the
  // ceiling (a drop rings in it: `tap`, render/PropLife.js) has been full a while and runs over its rim
  boiler: { mount: 'wall', static: true, material: 'metal', w: 14, h: 8, hp: 10, chips: '#d8d2bc', sparks: true, sound: 'metal', seep: 'joint' },
  bucket: { material: 'metal', r: 4.5, hp: 3, kg: 9, mu: 0.45, chips: '#9aa2ac', sound: 'metal', tap: [-0.5, -0.5], seep: 'pail' },
  plant_dead: { material: 'ceramic', r: 6, hp: 3, kg: 12, mu: 0.5, chips: '#8a6a3a', dirt: true, sound: 'wood' },
  mirror_cracked: { mount: 'wall', static: true, material: 'glass', w: 12, h: 3, hp: 1, chips: '#c8d4dc', glass: true, sound: 'glass' },
  mailboxes: { mount: 'wall', static: true, material: 'metal', w: 24, h: 4, hp: 8, chips: '#5a6e5c', sound: 'metal' },
  // a 47 kg propane cylinder left in a corridor: too heavy to budge, a far bigger blast than a stove's bottle. A round
  // holes it as it does any gas (systems/Gas.js: the jet, the fuse); in the prologue it is kept for the end
  // (prop.staged: nothing sets it off before, systems/Tutorial.js fuse)
  propane: { static: true, material: 'metal', r: 8, hp: 6, chips: '#d0402a', explosive: true, blast: 118, sound: 'metal', blocksPath: true,
    gas: { fuse: [1.4, 2.2] } },
  calendar: { mount: 'wall', static: true, material: 'fabric', w: 7, h: 3, hp: 1, chips: '#ece8dc', sound: 'wood' },
  // ---- MIAMI, 1986 (tools/generate_assets.py ALLEY_PROPS / ALLEY_NEON): the city's own, generic, first in level 2A's
  // alley. What a car ploughs through: crates and boxes, a fruit cart, a news rack, a scooter, a domino table, a
  // wheeled dumpster (loose, heavy: a bend's smash throws it, CHASE.bend.smash), lit box signs; on a wall face: stucco
  // trims, an AC unit dripping, graffiti in neon paint, two neon signs; overhead: washing on its lines (torn down by a
  // car under it: `canopy`), a fire escape's landing, a palm's fronds over a wall
  produce_crates: { material: 'wood', w: 38, h: 28, hp: 4, kg: 28, mu: 0.5, chips: '#c09060', sound: 'wood' },
  box_stack: { material: 'fabric', w: 32, h: 26, hp: 3, kg: 10, mu: 0.6, chips: '#b88a52', sound: 'wood' },
  fruit_cart: { material: 'wood', w: 56, h: 30, hp: 6, kg: 90, mu: 0.5, chips: '#a86a3a', sound: 'wood' },
  news_stand: { static: true, material: 'metal', w: 34, h: 14, hp: 5, chips: '#2a7a5a', sound: 'metal' },
  neon_box_pink: { static: true, material: 'plastic', w: 34, h: 10, hp: 3, chips: '#f0a0bc', glass: true, sparks: true, sound: 'glass',
    light: { r: 56, color: '#ff7ab0', intensity: 0.55, flicker: 'buzz' } },
  neon_box_cyan: { static: true, material: 'plastic', w: 34, h: 10, hp: 3, chips: '#6ad0e0', glass: true, sparks: true, sound: 'glass',
    light: { r: 56, color: '#6ae8ff', intensity: 0.55, flicker: 'buzz' } },
  scooter_mint: { material: 'metal', w: 54, h: 18, hp: 6, kg: 95, mu: 0.3, chips: '#8ad8c0', sound: 'metal' },
  scooter_pink: { material: 'metal', w: 54, h: 18, hp: 6, kg: 95, mu: 0.3, chips: '#f0a0bc', sound: 'metal' },
  domino_table: { static: true, vault: true, material: 'wood', w: 28, h: 28, hp: 5, chips: '#8a5a32', sound: 'wood' },
  dumpster_mint: { vault: true, material: 'metal', w: 58, h: 34, hp: 30, kg: 240, mu: 0.3, chips: '#8ad8c0', sound: 'metal' },
  dumpster_pink: { vault: true, material: 'metal', w: 58, h: 34, hp: 30, kg: 240, mu: 0.3, chips: '#f0a0bc', sound: 'metal' },
  dumpster_aqua: { vault: true, material: 'metal', w: 58, h: 34, hp: 30, kg: 240, mu: 0.3, chips: '#6ad0e0', sound: 'metal' },
  stucco_trim_pink: { mount: 'wall', static: true, lasting: true, material: 'stone', w: 96, h: 3, hp: 99, chips: '#f0a0bc', sound: 'stone' },
  stucco_trim_mint: { mount: 'wall', static: true, lasting: true, material: 'stone', w: 96, h: 3, hp: 99, chips: '#8ad8c0', sound: 'stone' },
  stucco_trim_peach: { mount: 'wall', static: true, lasting: true, material: 'stone', w: 96, h: 3, hp: 99, chips: '#f4b896', sound: 'stone' },
  ac_drip: { mount: 'wall', drip: true, seep: 'aircon', static: true, material: 'metal', w: 24, h: 8, hp: 6, chips: '#d8ccb0', sparks: true, sound: 'metal' },
  graffiti_neon_a: { mount: 'wall', static: true, lasting: true, material: 'stone', w: 62, h: 2, hp: 99, chips: '#8a8e96', sound: 'stone' },
  graffiti_neon_b: { mount: 'wall', static: true, lasting: true, material: 'stone', w: 62, h: 2, hp: 99, chips: '#8a8e96', sound: 'stone' },
  neon_sign_botanica: { mount: 'wall', hum: 'neon', material: 'glass', w: 60, h: 6, hp: 4, static: true, chips: '#05d9e8', sparks: true, glass: true, sound: 'glass',
    light: { r: 130, color: '#4ae8ff', intensity: 0.9, flicker: 'buzz' } },
  neon_sign_cocktail: { mount: 'wall', hum: 'neon', material: 'glass', w: 64, h: 6, hp: 4, static: true, chips: '#b44aff', sparks: true, glass: true, sound: 'glass',
    light: { r: 130, color: '#c060ff', intensity: 0.9, flicker: 'buzz' } },
  laundry_line: { mount: 'awning', canopy: true, hung: true, overhead: true, static: true, material: 'fabric', w: 160, h: 30, hp: 3, chips: '#f0a0bc', sound: 'wood' },
  fire_escape: { mount: 'structure', hung: true, lasting: true, overhead: true, static: true, material: 'metal', w: 96, h: 44, hp: 99, chips: '#2a2a34', sound: 'metal' },
  palm_fronds: { mount: 'pole', hung: true, lasting: true, overhead: true, height: 0.08, static: true, material: 'wood', w: 88, h: 64, hp: 99, chips: '#3a8a3a', sound: 'wood' },
};

// what hangs on a wall face (mount 'wall'; the same names as ON_WALL in tools/levelkit.py: tests/wallhung.test.mjs)
export const ON_WALL = new Set(Object.keys(PROPS).filter((k) => PROPS[k].mount === 'wall'));
