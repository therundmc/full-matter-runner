// What stands on the furniture (systems/Clutter.js, drawn by render/ClutterArt.js): glasses, bottles, ashtrays, the
// till, cards, banknotes... small sprites (clutter/<sprite>, painted fine by tools/generate_assets.py) laid on a prop
// by the level (prop option `clutter: '<set>'`). They have no body: nobody bumps into them, they ride on their prop
// and go flying with it. A round through them, a blow beside them, the prop tipped over or falling apart: they are
// thrown off (real loose pieces, entities/Debris.js), a glass shot where it stands bursts there.
//
// CLUTTER[kind]:
//   sprite   clutter/<sprite> (none: nothing is seen, e.g. the ember of an ashtray painted in its table's sprite)
//   r        px: how close a round has to pass to hit it
//   glass    { kind, area, share }: it shatters (glass, a splash), `area` px2 of that liquid (data/liquids.js) on the
//            floor; `share` of them that shatter once thrown off (the others land whole)
//   broken   sprite left where it stood once shot to pieces (shards in a wet ring)
//   smoke    a cigarette left burning in it: a thread of smoke rises (Smoke.wisp) while it stands
//   ash      a puff of ash when it is knocked off
//   kg, material, mu  of the loose piece it becomes; land: the sound it makes landing whole (a placeholder of
//            src/audio/Audio.js FOLEY, assets/sound/PLACEHOLDERS.md); a glass bursting is `clutterShatter`
//   flutter  light and flat (cards, banknotes, a napkin): thrown off it floats down (Particles.floaters), no piece
export const CLUTTER = {
  pint: { sprite: 'pint_full', r: 2.5, glass: { kind: 'beer', area: 55, share: 0.85 }, broken: 'glass_broken', kg: 0.6, material: 'glass', land: 'clutterClink' },
  pint_half: { sprite: 'pint_half', r: 2.5, glass: { kind: 'beer', area: 30, share: 0.85 }, broken: 'glass_broken', kg: 0.45, material: 'glass', land: 'clutterClink' },
  pint_empty: { sprite: 'pint_empty', r: 2.5, glass: { kind: 'beer', area: 0, share: 0.8 }, broken: 'glass_broken', kg: 0.35, material: 'glass', land: 'clutterClink' },
  pitcher: { sprite: 'pitcher', r: 3.5, glass: { kind: 'beer', area: 110, share: 0.9 }, broken: 'glass_broken', kg: 1.4, material: 'glass', land: 'clutterBottle' },
  shot: { sprite: 'shot', r: 1.6, glass: { kind: 'booze', area: 10, share: 0.5 }, kg: 0.1, material: 'glass', land: 'clutterClink' },
  lowball: { sprite: 'lowball', r: 2.4, glass: { kind: 'booze', area: 20, share: 0.7 }, broken: 'glass_broken', kg: 0.35, material: 'glass', land: 'clutterClink' },
  beer_bottle: { sprite: 'beer_bottle', r: 2, glass: { kind: 'beer', area: 40, share: 0.6 }, kg: 0.4, material: 'glass', land: 'clutterBottle' },
  liquor: { sprite: 'liquor', r: 2.6, glass: { kind: 'booze', area: 80, share: 0.75 }, broken: 'glass_broken', kg: 0.9, material: 'glass', land: 'clutterBottle' },
  ashtray: { sprite: 'ashtray', r: 3, ash: true, kg: 0.6, material: 'glass', land: 'clutterAshtray' },
  ashtray_lit: { sprite: 'ashtray', r: 3, ash: true, smoke: true, kg: 0.6, material: 'glass', land: 'clutterAshtray' },
  ember: { r: 2.5, smoke: true },
  cigar: { sprite: 'cigar', r: 2, smoke: true, kg: 0.05, material: 'fabric' },
  coaster: { sprite: 'coaster', r: 2.4, flutter: 'paper' },
  napkin: { sprite: 'napkin', r: 2.4, flutter: 'paper' },
  napkin_crumpled: { sprite: 'napkin_crumpled', r: 2, kg: 0.02, material: 'fabric' },
  peanuts: { sprite: 'peanuts', r: 3, kg: 0.3, material: 'ceramic', land: 'clutterAshtray', nuts: true },
  till: { sprite: 'till', r: 6, kg: 9, material: 'metal', land: 'clutterTill', mu: 0.8 },
  cards: { sprite: 'cards', r: 3, flutter: 'paper' },
  chips: { sprite: 'chips', r: 2, kg: 0.1, material: 'plastic', land: 'clutterChips' },
  bands: { sprite: 'bands', r: 3, flutter: 'cash', kg: 0.2, material: 'fabric' },
  bill: { sprite: 'bill', r: 2, flutter: 'cash' },
  rubber_bands: { sprite: 'rubber_bands', r: 2, kg: 0.02, material: 'fabric' },
  baggies: { sprite: 'baggies', r: 2, kg: 0.05, material: 'fabric' },
};

// what a shot or a blow does to the clutter of a prop: a round hits what stands within `r` (+ `pad`) of its line,
// the `most` nearest first (a pellet one); a blow, a punch or a cut knocks off what stands within `blow` px of it;
// a blow this hard or more (power) shakes off everything within `shake` px; thrown off at `speed` px/s (x power)
export const CLUTTER_HIT = {
  pad: 0.8, most: { pellet: 1, graze: 1, bullet: 2, rifle: 3, shrapnel: 1 }, blow: 9, hard: 1.2, shake: 30,
  speed: [50, 130], lift: [40, 110], z: 7,
};

// The sets laid on the level's furniture: [kind, x, y, deg] in px from the middle of the prop's sprite, along its own
// axes (they turn with it). The furniture's own sprites already carry some (cards, a beer, an ashtray on the booth's
// table; the pot and the hands on the poker table; the bricks and the scale on the dope table): an `ember` over a
// painted ashtray gives it its thread of smoke.
export const SETS = {
  // the counter, module by module from the kegs' end (customers on +y, the bartender on -y)
  counter_kegs: [['napkin', -8, 1.5, 10], ['peanuts', 5, 1, 0], ['pint_empty', 11.5, -5, 0]],
  counter_regular: [['coaster', -3, 2, 0], ['pint_half', -3, 2, 0], ['ashtray_lit', 6, 1, 20], ['shot', 11, 2.5, 0], ['napkin_crumpled', 13, -1, 40]],
  counter_middle: [['pint', -9, 1.5, 0], ['coaster', 4, 2, 15], ['peanuts', 9, -0.5, 0], ['pint_empty', -2, -6, 0]],
  counter_pour: [['liquor', -9, -5, 0], ['shot', -4, 2, 0], ['shot', -0.5, 2.5, 0], ['pitcher', 8, 0.5, 30], ['napkin', 13, 2, -15]],
  counter_till: [['till', 4, -3.5, 0], ['ashtray', -9, 1.5, 0], ['napkin_crumpled', -4, 2.5, 0]],
  // the booth's table, the pool table's rail, the poker table, the jukebox's corner
  booth: [['pitcher', -16, -7, 0], ['pint_half', 14, 5, 0], ['napkin', 1, 9, 25], ['ember', 14, -4.5, 0]],
  pool_rail: [['pint_half', -38, -1, 0], ['ashtray_lit', 10, 20.5, 0]],
  poker: [['liquor', 8, -11.5, 0], ['shot', 12, -9, 0], ['ember', 16.5, -7.5, 0], ['chips', -18, -3, 0], ['chips', -17, 2, 0]],
  // the boss's desk (his whisky, his cigar, the night's takings), the men's round table, the case on the floor
  boss_desk: [['lowball', -9.5, 1, 0], ['bands', -17.5, 0, 8], ['bands', -15, 3, -20], ['cigar', 11, 8.5, -30], ['ember', 13.5, 7, 0]],
  men_table: [['beer_bottle', 8.5, 5.5, 0], ['beer_bottle', -1, 9.5, 0], ['cards', -8.5, 4, 20], ['ember', -5, -3, 0]],
  cash_floor: [['bands', -15, 2, 70], ['bands', -14.5, -5, 100], ['bill', -18, -1, 30]],
  // the dope table: the rubber bands and the banknotes it is bagged and counted with
  dope: [['rubber_bands', -11, 10, 0], ['bands', -2, -10, 5], ['baggies', 9, 3, 0]],
  // the VIP room: a whisky on the sofa's arm, banknotes thrown on the dancer's stage
  vip_sofa: [['lowball', 29, 3, 0]],
  stage: [['bill', 9, -12, 20], ['bill', -13, 7, -40], ['bill', 15, 9, 75], ['bill', -4, 16, 10], ['bill', 3, 12, -60]],
};
