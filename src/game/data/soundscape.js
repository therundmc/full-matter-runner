// What each place of a level sounds like (systems/Ambience.js). The beds are long loops rendered by audio/Beds.js and
// mixed by audio/Audio.js setAmbience (levels: their gain on its ambience bus, AMB_LEVEL); the events are one-shot
// sounds of audio/Audio.js (their mix in its META).
//
// A level names its places in `soundscape.zones`: [kind, col0, row0, col1, row1], inclusive tile rectangles, the
// first that holds a tile wins. A tile in none of them is a `street` out of doors, a `roof` on a walkable roof, a
// `room` under any other roof (floors: AMBIENCE.indoors). `soundscape.rain` (0..1): how hard it rains.
//
// Per kind:
//   room     its reverb (audio/Audio.js ROOMS): open (a slap off the facades) | warm | small | tiled
//   out      out of doors: under the rain, the wind heard in full
//   carry    tiles its beds are heard beyond it, through the walls (muffled, AMBIENCE.through)
//   beds     { bed: level | { level, lp, crowd, mains } } heard there. lp: Hz it is cut at even inside (rain on the
//            roof); crowd: [from, full], calm customers of the place that start it / give it in full; mains: silent
//            once the house's power is cut. A 'rain' bed is also scaled by `soundscape.rain`.
//   events   one-shots on top of the beds, each on its own clock while the place is heard:
//            sound     a name, or { name: weight } to draw one from
//            every     [min, max] s between two
//            at        where it comes from: 'patron' (a calm customer of the place; busy: what he must be at),
//                      'job:<pastime>' (the guard posted at it, at ease), a prop type found in the place, 'zone' (any
//                      spot of its rectangles), 'far' (nowhere: across the city, muffled from indoors)
//            crowd     true: comes the more often the more customers are at it
//            vol       [min, max]; voice: the customer's own pitch; side: 'far' sounds, how far to one side
export const ZONES = {
  street: {
    room: 'open', out: true, carry: 5,
    beds: { city: 0.75, rain: 0.7 },
    events: [
      { sound: 'siren', every: [80, 200], at: 'far', vol: [0.35, 0.6] },
      { sound: 'horn', every: [30, 80], at: 'far', vol: [0.12, 0.25] },
    ],
  },
  alley: {
    room: 'open', out: true, carry: 4,
    beds: { city: 0.55, rain: 0.7 },
    events: [{ sound: 'drip', every: [1.2, 4], at: 'zone', vol: [0.4, 0.9] }],
  },
  lot: {
    room: 'open', out: true, carry: 4,
    beds: { city: 0.5, rain: 0.7 },
    events: [{ sound: 'horn', every: [45, 110], at: 'far', vol: [0.08, 0.15] }],
  },
  roof: {
    room: 'open', out: true, carry: 3,
    beds: { city: 0.85, rain: 0.75 },
    events: [{ sound: 'siren', every: [80, 200], at: 'far', vol: [0.4, 0.7] }],
  },
  // the bar room: a warm room full of talk while its customers are at ease; glasses, ice, a laugh, a chair, the
  // bartender at work; rain on the roof far over it
  bar: {
    room: 'warm', carry: 6,
    beds: { talkA: { level: 0.7, crowd: [1, 3] }, talkB: { level: 0.6, crowd: [4, 6] }, rain: { level: 0.25, lp: 380 } },
    events: [
      { sound: 'clink', every: [2, 5], at: 'patron', busy: ['drink', 'cards'], crowd: true, vol: [0.5, 1] },
      { sound: 'ice', every: [8, 18], at: 'patron', busy: ['drink'], vol: [0.6, 1] },
      { sound: 'laugh', every: [7, 18], at: 'patron', voice: true, vol: [0.6, 1] },
      { sound: 'chairScrape', every: [22, 50], at: 'patron', busy: ['drink', 'cards'], vol: [0.25, 0.4] },
      { sound: { bottle: 3, clink: 2, pour: 2, till: 1 }, every: [3, 8], at: 'job:wipe', vol: [0.6, 1] },
    ],
  },
  // the dancer's corner: the bar's talk from the next room, a laugh now and then
  vip: {
    room: 'warm', carry: 3,
    beds: { talkA: { level: 0.35, crowd: [1, 2] }, rain: { level: 0.25, lp: 380 } },
    events: [{ sound: 'laugh', every: [12, 30], at: 'patron', voice: true, vol: [0.5, 0.8] }],
  },
  // tiles that ring: a tap that drips, the cistern filling now and then (the tubes hum: their props)
  toilets: {
    room: 'tiled', carry: 2,
    beds: { rain: { level: 0.2, lp: 420 } },
    events: [
      { sound: 'drip', every: [1.5, 5], at: 'sink', vol: [0.5, 1] },
      { sound: 'cistern', every: [35, 80], at: 'toilet', vol: [0.7, 1] },
    ],
  },
  // the boss's back room: his radio low on the desk, dead with the power
  office: {
    room: 'small', carry: 2,
    beds: { radio: { level: 0.4, mains: true }, rain: { level: 0.2, lp: 380 } },
    events: [],
  },
  // the storeroom: the fridge and the tube are its props; the oven's vent breathes outside
  kitchen: { room: 'small', carry: 2, beds: { rain: { level: 0.2, lp: 380 } }, events: [] },
  // a shop shut for the night
  shop: { room: 'small', carry: 2, beds: { rain: { level: 0.2, lp: 420 } }, events: [] },
  // anywhere else under a roof
  room: { room: 'small', carry: 2, beds: { rain: { level: 0.15, lp: 380 } }, events: [] },
};

// Beds tied to a prop: the nearest of its kind that still works is heard within `reach` px, from its side, muffled
// through a wall. A prop matches by `hum` (its def's hum), `types`, `screen` (a television showing snow) or `parked`
// (a vehicle standing still, out in the rain: scaled by `soundscape.rain`). Dead, dark or unpowered props are silent.
export const PROP_BEDS = [
  { bed: 'neon', hum: 'neon', reach: 220, level: 0.22 },
  { bed: 'fridge', hum: 'fridge', reach: 170, level: 0.3 },
  { bed: 'mains', hum: 'mains', reach: 140, level: 0.25 },
  { bed: 'tube', types: ['tube_light'], reach: 170, level: 0.24 },
  { bed: 'fan', types: ['wall_vent', 'ac_unit'], reach: 260, level: 0.32 },
  { bed: 'snow', screen: true, reach: 150, level: 0.08 },
  { bed: 'rainMetal', parked: true, reach: 200, level: 0.4 },
];

// The traffic, car by car (systems/Ambient.js cars): the nearest `slots` moving ones each drive a voice of the
// 'engine' bed, its level by distance (gone at `reach` px), its side, and its speed: `rate` per model at `cruise`
// px/s, down to `idle` of it at a standstill, shifted by the Doppler effect (`doppler`: exaggerated that many times).
export const CARS = {
  slots: 3, reach: 900, level: 0.75, cruise: 320, idle: 0.55, doppler: 2.5,
  rate: { car: 1, car2: 1.15, van: 0.78 },
};
