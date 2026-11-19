// Fire that spreads (systems/FireSpread.js: where it burns; systems/Fires.js: its flames, light and sound). A front
// runs over a grid of cells from what was lit: fast along petrol (the level's `petrol` trails, or any poured since),
// slowly over a floor that burns, quicker over what lies on it (a rug, a carpet runner, a mattress); what stands in
// its way catches by its material. A cell burns a while, then is left charred. One touch kills.
// Lengths in px (1 m = 32 px), times in s.
export const FIRE = {
  cell: 8,                 // px of a cell (4 to a tile side)
  tick: 0.1,               // s between two looks at the front
  jitter: 0.3,             // share by which a cell is slower or quicker to catch than its fuel says (a ragged front)
  // fuels: `speed` px/s the front crosses it at, `burn` [min, max] s a cell of it burns
  fuels: {
    petrol: { speed: 210, burn: [5, 8] },    // then the floor under it burns on, if it burns
    cloth: { speed: 15, burn: [22, 32] },
    carpet: { speed: 2.4, burn: [40, 60] },
    wood: { speed: 1.8, burn: [50, 75] },
    lino: { speed: 1.3, burn: [28, 40] },
  },
  // what each floor is to it (TileMap names): the others do not burn (tiles, concrete, the street)
  floors: { carpet_red: 'carpet', carpet_purple: 'carpet', wood: 'wood', checker: 'lino' },
  // what is painted on the floor (level `floor` sprites) and burns: [fuel, length px, width px]
  paint: {
    runner: ['cloth', 96, 20], rug: ['cloth', 64, 44], doormat: ['cloth', 24, 14], entry_mat: ['cloth', 28, 16],
    entry_carpet: ['cloth', 64, 30], newspaper: ['cloth', 14, 10], bed: ['cloth', 44, 64], cardboard_bed: ['cloth', 56, 26],
    // the flat of the prologue: his mattress (as a bed), what lies about that burns
    mattress: ['cloth', 44, 64], clothes_pile: ['cloth', 18, 13], pizza_box: ['cloth', 12, 12], mail_pile: ['cloth', 12, 9],
  },
  // furniture by its material: `catch` s it takes to catch once the fire is at its foot, `burn` [min, max] s it
  // burns before it falls apart; the others do not burn. A gas bottle or a stove reached blows (systems/Gas.js)
  // after its own fuse, unless the lesson keeps it for its last moment (prop.staged, systems/Tutorial.js).
  props: {
    fabric: { catch: 0.8, burn: [22, 34] },
    wood: { catch: 2.5, burn: [30, 45] },
    plastic: { catch: 3, burn: [10, 15] },
  },
  reach: 6,                // px round a piece of furniture from which a burning cell sets it alight
  bite: 0.12,              // s a cell has burned before it kills whoever stands in it
  glass: [34, 3.5],        // a window pane with fire within that many px of it cracks, and bursts that many s later
  // a blast lights what burns within `blast` of its radius, `delay` s later at its rim
  blast: 0.6, delay: 0.25,
  // the look (systems/Fires.js): one fire a block of `block` cells a side while any of them burns
  block: 2,
  flames: 0.045,           // s between two puffs of flame at a fire
  budget: 220,             // puffs a second at most, shared out between the fires in view (render/FireArt.js draws
                           // the standing flames; these are what rises off them)
  light: { every: 0.11, r: 92, max: 4, color: '#ff8a2a' },   // flashes of light: the `max` nearest the player
  crackle: [0.25, 0.7],    // s between two crackles
  roar: [0.9, 1.6],        // s between two roars of a big fire, from `big` fires burning
  big: 12,
  whoosh: 0.5,             // s at least between two whooshes of a front running along petrol
  soot: 0.28,              // share of a full fire's soot (SMOKE.burn) each of them gives off: a whole flat burns
  char: 13,                // px: radius of the burn left on the floor by a block burned out
  // a retry of the lesson (systems/Tutorial.js): s the fire has been burning by the time each of its stages is
  // reached, played at once
  elapsed: [0, 7, 14, 34, 42, 52],
};
