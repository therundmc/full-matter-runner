// What seeps, steams and slops in a room that is lived in (systems/Seeps.js): a washer weeping at its foot, a water
// heater's joint, a pail running over under a leak, a keg's
// coupling dripping beer, an ice bin melting, a water cooler's tap, a pot simmering on the stove, a dryer's vent, a
// soldering iron left hot on its bench, a mop bucket that slops over when it is knocked. A prop takes one by its def
// (`seep: '<name>'`, data/props.js) or by the level (prop option `seep: '<name>'`: one washer of the row, one keg).
// Looks and a little wet floor only: the drips are small on purpose (a puddle a step wide, never a flood); what
// floods is still a round through the thing (data/destruction.js `leak` / `gush`).
// Lengths in px (1 m = 32 px) from the prop's centre along its own axes (they turn with it), times in s, liquid in
// px2 of floor covered a film deep (data/liquids.js).
//
// SEEPS[name]:
//   drip   a drop falling to the floor now and then:
//            kind    the liquid (LIQUIDS.kinds)
//            at      [x, y] where it lands
//            drop    px2 a drop
//            every   [min, max] s between two drops
//            cap     films deep at its foot from which the drop is held back (the puddle is as big as it gets: what
//                    dries or soaks away lets the next ones fall)
//            most    px2 it holds in all, then it is empty (null: plumbed, it never runs out)
//            r       px of the disc a drop lands on
//            sound   what a drop is heard as (an Audio name; none: silent). A drop held back still falls and rings
//   fume   something rising from it:
//            kind    'steam' (the air's own steam, SMOKE.steam) or 'thread' (a cigarette's thread, SMOKE.cig)
//            at      [x, y] where it leaves
//            rate, r steam: how much a second, over a disc of r px
//            puff    steam: [on, off] s it breathes and rests (none: steady)
//            every   thread: s between two points of it
//   slosh  an open vessel on the floor, loose: shoved or kicked faster than `speed` (px a step) it slops `share` of what
//          it still holds (`hold` px2 of `kind` to begin with) over its rim the way it goes, at most once every `gap` s
export const SEEPS = {
  // the prologue's flat (tools/build_tutorial.py): the water heater's joint weeping (a puddle a hand across), the pail
  // under a leak in the ceiling, full and running over its rim (a step across)
  joint: { drip: { kind: 'water', at: [-4.5, 8], drop: 9, every: [1.4, 2.6], cap: 1.4, most: null, r: 3, sound: 'dripPlink' } },
  pail: { drip: { kind: 'water', at: [3, 5.5], drop: 14, every: [2.2, 4], cap: 1.2, most: null, r: 3, sound: 'dripPlink' } },
  // a top loader whose pump seal is gone: water creeping out from under its front
  washer: { drip: { kind: 'water', at: [-5, 13.5], drop: 22, every: [1.3, 2.2], cap: 1.5, most: null, r: 3 } },
  // a keg on tap, its coupling weeping: beer in a slow amber pool beside it, until it is flat
  keg: { drip: { kind: 'beer', at: [10, 2], drop: 16, every: [1.8, 3.2], cap: 1.3, most: 900, r: 3 } },
  // the bar's ice bin sweating through its drain plug
  ice_bin: { drip: { kind: 'water', at: [5, 9.5], drop: 12, every: [2.4, 3.8], cap: 1.2, most: 1800, r: 2.5 } },
  // a water cooler's tap that never quite shuts
  water_cooler: { drip: { kind: 'water', at: [0, 9], drop: 10, every: [2.8, 4.4], cap: 1.1, most: 1500, r: 2.5 } },
  // a mop bucket, grey water to its rim
  mop_bucket: { slosh: { kind: 'water', hold: 900, speed: 1.1, share: 0.45, gap: 0.5, r: 6 } },
  // a pot left to simmer on the storeroom's stove: it breathes
  pot: { fume: { kind: 'steam', at: [-4.5, -3], rate: 0.22, r: 4, puff: [2.6, 1.8] } },
  // a dryer running: damp warm air out of the top of its back
  dryer: { fume: { kind: 'steam', at: [6, -9], rate: 0.16, r: 4, puff: [5, 2.5] } },
  // the repair bench: the iron left on in its stand
  solder: { fume: { kind: 'thread', at: [14, -4], every: 0.14 } },
};
