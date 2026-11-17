// Small things lying loose on a floor (systems/Litter.js, drawn by render/ClutterArt.js): the banknotes thrown at the
// dancer, a boa's feathers, a champagne flute knocked over, corks, a garter, an ashtray put down by a sofa. Laid by
// the level (`litter`: [kind, col, row, deg, look], tools/levelkit.py `litter`); the bills knocked off the furniture
// land among them (systems/Clutter.js). Sprites clutter/<sprite>, painted fine by tools/generate_assets.py.
//
// LITTER[kind]:
//   sprites  the looks it may lie with (the level's `look` picks one: a bill flat, crumpled or folded)
//   r        px: how big it is to the feet and the rounds
//   flutter  light and flat: lifted, it floats down swaying and turning over; `lift` [min, max] px/s it is thrown up
//            at, `fall` px/s it sinks at, at most. Without it, it only slides along the floor
//   kick     px/s someone running through it sends it at
//   glass    a round straight through it bursts it: glass, the `area` px2 of `kind` it held on the floor (data/liquids.js)
//   sound    heard when it is kicked (a placeholder of src/audio/Audio.js FOLEY, assets/sound/PLACEHOLDERS.md)
//   shadow   it stands off the floor a little: a faint shadow under it
export const LITTER = {
  bill: { sprites: ['single', 'bill_crumpled', 'bill_folded'], r: 2.5, flutter: true, lift: [45, 95], fall: 13, kick: 75 },
  feather: { sprites: ['feather', 'feather_curl'], r: 2, flutter: true, lift: [55, 110], fall: 6, kick: 60 },
  flute: { sprites: ['flute_down'], r: 3, kick: 55, glass: { kind: 'booze', area: 12 }, sound: 'fluteClink', shadow: true },
  cork: { sprites: ['cork'], r: 1.5, kick: 85, shadow: true },
  garter: { sprites: ['garter'], r: 2.5, kick: 45 },
  ashtray: { sprites: ['ashtray'], r: 3, kick: 35, sound: 'clutterAshtray', shadow: true },
};

// How the litter is stirred. Speeds of bodies in px/step (60 Hz), the rest in px, px/s and seconds.
export const LITTER_AIR = {
  max: 72,          // pieces at most: past it a bill knocked off a table only flutters down and is gone
  runFast: 1.4,     // someone faster than this kicks what he runs through (the light things fly up)
  walk: 0.35,       // someone slower than this stirs nothing; between the two his feet scuff it a little along
  feet: 9,          // px round his middle
  scuff: 22,        // px/s a scuff sends it at, no more than once every `rest` s
  rest: 0.6,
  round: 10,        // px: a round passing this close lifts a light thing, along its way at up to roundV px/s
  roundV: 85,
  pad: 0.8,         // px added to a flute's r against a round straight through it
  muzzle: 22,       // px: the blast at a gun's muzzle (this far ahead of the shooter) blows what lies round it
  ahead: 16,
  muzzleV: 70,
  blast: 1.6,       // x an explosion's radius: what it throws
  blastV: 260,
  curtain: 14,      // px: the hem of a curtain swinging faster than `swing` px/s this close fans the light things
  swing: 25,
  gravity: 170,     // px/s2 on a flying piece (until its `fall`)
  drag: 2.4,        // 1/s on a flying piece's way
  sway: 26,         // px/s2 of its swaying as it falls
  flip: 9,          // rad/s it turns over at, in the air (drawn as its width flipping)
  friction: 8,      // 1/s on the floor
  still: 3,         // px/s: slower than this on the floor, it stops
};
