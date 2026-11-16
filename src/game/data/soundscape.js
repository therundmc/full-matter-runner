// What each place of a level sounds like (systems/Ambience.js). The beds are long loops rendered by audio/Beds.js and
// mixed by audio/Audio.js setAmbience (levels: their gain on its ambience bus, LEVELS.beds); the events are one-shot
// sounds of audio/Audio.js (their mix in its META). No rain is heard (`soundscape.rain` is not read: a dry night; the
// puddles of an earlier rain are only seen).
//
// A level names its places in `soundscape.zones`: [kind, col0, row0, col1, row1], inclusive tile rectangles, the
// first that holds a tile wins. A tile in none of them is a `street` out of doors, a `roof` on a walkable roof, a
// `room` under any other roof (floors: AMBIENCE.indoors). The level's `soundSpots`: [bed, col, row], a bed of SPOTS
// heard from that tile (a radio behind a window).
//
// Per kind:
//   room     its reverb (audio/Audio.js ROOMS): open (a slap off the facades) | warm | small | tiled
//   out      out of doors: the wind and the far city heard in full
//   carry    tiles its beds are heard beyond it, through the walls (muffled, AMBIENCE.through)
//   beds     { bed: level | { level, lp, crowd, mains } } heard there. lp: Hz it is cut at even where it is heard
//            openly; crowd: [from, full], calm customers of the place that start it / give it in full; mains: silent
//            once the house's power is cut.
//   events   one-shots on top of the beds, each on its own clock while the place is heard:
//            sound     a name, or { name: weight } to draw one from
//            every     [min, max] s between two
//            at        where it comes from: 'patron' (a calm customer of the place; busy: what he must be at),
//                      'job:<pastime>' (the guard posted at it, at ease), a prop type found in the place, 'zone' (any
//                      spot of its rectangles)
//            crowd     true: comes the more often the more customers are at it
//            vol       [min, max]; voice: the customer's own pitch
export const ZONES = {
  // the street: the city's wash and its traffic (the cars themselves: CARS), the far city (CITY) on top
  street: { room: 'open', out: true, carry: 5, beds: { city: 0.8 }, events: [] },
  alley: {
    room: 'open', out: true, carry: 4,
    beds: { city: 0.6 },
    events: [{ sound: 'drip', every: [1.5, 5], at: 'zone', vol: [0.4, 0.9] }],
  },
  lot: { room: 'open', out: true, carry: 4, beds: { city: 0.55 }, events: [] },
  roof: { room: 'open', out: true, carry: 3, beds: { city: 0.95 }, events: [] },
  // the bar room: a warm room murmuring while its customers are at ease (low and round: never a harsh crowd), now and
  // then a glass, ice, a laugh, a chair, the bartender at work
  bar: {
    room: 'warm', carry: 6,
    beds: { talkA: { level: 0.55, crowd: [1, 3], lp: 2400 }, talkB: { level: 0.42, crowd: [4, 6], lp: 2000 }, hush: 0.4 },
    events: [
      { sound: 'clink', every: [5, 12], at: 'patron', busy: ['drink', 'cards'], crowd: true, vol: [0.4, 0.9] },
      { sound: 'ice', every: [16, 35], at: 'patron', busy: ['drink'], vol: [0.5, 0.9] },
      { sound: 'laugh', every: [16, 40], at: 'patron', voice: true, vol: [0.5, 0.9] },
      { sound: 'chairScrape', every: [30, 70], at: 'patron', busy: ['drink', 'cards'], vol: [0.25, 0.4] },
      { sound: { bottle: 3, clink: 2, pour: 2, till: 1 }, every: [6, 14], at: 'job:wipe', vol: [0.5, 0.9] },
    ],
  },
  // the dancer's corner: the bar's talk from the next room, a laugh now and then
  vip: {
    room: 'warm', carry: 3,
    beds: { talkA: { level: 0.28, crowd: [1, 2], lp: 1800 }, hush: 0.4 },
    events: [{ sound: 'laugh', every: [20, 45], at: 'patron', voice: true, vol: [0.4, 0.7] }],
  },
  // tiles that ring: a tap that drips, the cistern filling now and then (the tubes hum: their props)
  toilets: {
    room: 'tiled', carry: 2,
    beds: { hush: 0.5 },
    events: [
      { sound: 'drip', every: [1.5, 5], at: 'sink', vol: [0.5, 1] },
      { sound: 'cistern', every: [35, 80], at: 'toilet', vol: [0.7, 1] },
    ],
  },
  // the boss's back room: his radio low on the desk, dead with the power
  office: { room: 'small', carry: 2, beds: { radio: { level: 0.32, mains: true, lp: 3500 }, hush: 0.5 }, events: [] },
  // the storeroom: the fridge and the tube are its props; the oven's vent breathes outside
  kitchen: { room: 'small', carry: 2, beds: { hush: 0.55 }, events: [] },
  // a shop shut for the night
  shop: { room: 'small', carry: 2, beds: { hush: 0.6 }, events: [] },
  // anywhere else under a roof
  room: { room: 'small', carry: 2, beds: { hush: 0.6 }, events: [] },
};

// The far city, heard from anywhere: in full out of doors, dull and lower from under a roof (AMBIENCE.city). Each on
// its own random clock, from a random side (a moving one crosses from it to the other) and a random distance:
//   every [min, max] s between two; vol [min, max]; distant [min, max] (0 near .. 1 far: the highs it loses, the hall
//   it is heard in); opts: what the sound takes ([min, max]: drawn each time; dir: -1 / 1 at random)
export const CITY = [
  { sound: 'train', every: [60, 120], vol: [0.7, 1], distant: [0.3, 0.45], opts: { dir: true } },   // the elevated, a block away
  { sound: 'farSiren', every: [70, 160], vol: [0.6, 1], distant: [0.45, 0.75], opts: { dir: true } }, // a police car blocks away
  { sound: 'horn', every: [18, 50], vol: [0.1, 0.28], distant: [0.5, 0.85], opts: { honks: [1, 3], pitch: [0.85, 1.15] } },
  { sound: 'farAlarm', every: [100, 220], vol: [0.5, 0.9], distant: [0.6, 0.85] },                 // a car alarm streets away
  { sound: 'dog', every: [60, 150], vol: [0.5, 0.9], distant: [0.55, 0.85] },                      // a dog down the block
];

// Beds heard from a spot of the level (its `soundSpots`: [bed, col, row]): within `reach` px, from its side, cut
// at `lp` Hz (muffled through a wall: AMBIENCE.props).
export const SPOTS = {
  window: { bed: 'window', reach: 340, level: 0.5, lp: 3200 }, // a radio left on behind an open window upstairs
};

// Beds tied to a prop: the nearest of its kind that still works is heard within `reach` px, from its side, muffled
// through a wall. A prop matches by `hum` (its def's hum), `types` or `screen` (a television showing snow). Dead, dark
// or unpowered props are silent.
export const PROP_BEDS = [
  { bed: 'neon', hum: 'neon', reach: 220, level: 0.22 },
  { bed: 'fridge', hum: 'fridge', reach: 170, level: 0.3 },
  { bed: 'mains', hum: 'mains', reach: 140, level: 0.25 },
  { bed: 'tube', types: ['tube_light'], reach: 170, level: 0.24 },
  { bed: 'fan', types: ['wall_vent', 'ac_unit'], reach: 260, level: 0.32 },
  { bed: 'snow', screen: true, reach: 150, level: 0.08 },
];

// The traffic, car by car (systems/Ambient.js cars): the nearest `slots` moving ones each drive a voice of the
// 'engine' bed, its level by distance (gone at `reach` px), its side, and its speed: `rate` per model at `cruise`
// px/s, down to `idle` of it at a standstill, shifted by the Doppler effect (`doppler`: exaggerated that many times).
export const CARS = {
  slots: 3, reach: 900, cruise: 320, idle: 0.55, doppler: 2.5,
  // the engine (bed `engine`): its level (2.5 x on 2026-11-16, the user could not hear the cars go by) and the share
  // of it left idling at a standstill (`quiet`), the Hz its tone opens from at a standstill to cruising (the
  // exhaust's growl rising with the speed); the tyres (bed `road`);
  // through a wall they lose that much more than a place's beds (a muffled rumble, about where they were before)
  level: 2.3, quiet: 0.25, tone: [1400, 9000], road: 1.8, walled: 0.5,
  rate: { car: 1, car2: 1.15, van: 0.78 },
};
