// What the player feels in his hands through the gamepad (systems/Rumble.js, fed by the world's events). An effect is
// { strong, weak, ms }: the heavy (low, left) motor and the light (high, right) one, 0..1, for ms milliseconds of
// real time. Everything is scaled by the VIBRATION option (systems/Settings.js `rumble`, 0 = off). Short and sharp:
// the pad tells a hit, it never hums along (MIX).
export const RUMBLE = {
  // his own shot, by the gun's family (data/feel.js familyOf): a pistol is a short sharp tick of the light motor, a
  // shotgun the heavy one, an automatic a light buzz per round that leaves a gap before the next (the UZI fires
  // every 65 ms)
  shot: {
    pistol: { strong: 0, weak: 0.55, ms: 70 },
    smg: { strong: 0, weak: 0.32, ms: 38 },
    silenced: { strong: 0, weak: 0.2, ms: 32 },
    rifle: { strong: 0.12, weak: 0.45, ms: 50 },
    shotgun: { strong: 0.9, weak: 0.45, ms: 160 },
    sniper: { strong: 1, weak: 0.55, ms: 200 },
    rocket: { strong: 0.65, weak: 0.3, ms: 240 },
  },
  hit: { strong: 0.35, weak: 0.5, ms: 90 },        // his blow lands on a man (a punch, a club, a blade), by its power
  kill: { strong: 0.75, weak: 0.6, ms: 140 },      // ... and a man of his goes down (any weapon): the heavier punch
  finisher: { strong: 0.85, weak: 0.6, ms: 170 },  // a takedown's or a finisher's blow (by its power), its last beat
  death: { strong: 1, weak: 0.8, ms: 600 },        // he is hit: one hit kills, the long strong one
  // a blast: full within `near` of its radius from him, nothing past `far` radii
  blast: { strong: 1, weak: 0.7, ms: 420, near: 1, far: 4 },
  // a door burst open or torn off: full within `near` px of him (he kicked it), nothing past `far`
  door: { strong: 0.45, weak: 0.35, ms: 110, near: 64, far: 160 },
  // at the wheel and in the getaway (the world's 'ride' event, its `beat`). No engine idle: nothing that lasts.
  ride: {
    shove: { strong: 0.35, weak: 0.25, ms: 120 },  // the van's jolt to one side (2A, SPACE)
    hit: { strong: 0.6, weak: 0.45, ms: 150 },     // a car shoved out of the way
    clip: { strong: 0.5, weak: 0.3, ms: 120 },     // a corner clipped on what does not give: most of the speed gone
    torn: { strong: 0.2, weak: 0.25, ms: 80 },     // a stall, a hoarding torn through
    scrape: { strong: 0.12, weak: 0.3, ms: 90 },   // a flank grinding along a wall (repeats while it lasts)
    crash: { strong: 1, weak: 0.9, ms: 700 },      // nose-on into what does not give: the end of him
    lorry: { strong: 0.3, weak: 0.2, ms: 150, near: 96, far: 420 }, // the lorry backed out stops dead across the street
    start: { strong: 0.3, weak: 0.15, ms: 180 },   // the getaway's engine catches
    ram: { strong: 0.55, weak: 0.4, ms: 160 },     // the getaway rams a car on its way out
  },
  ui: {
    tick: { strong: 0, weak: 0.15, ms: 25 },      // a menu's ENTER (A), barely there
    sample: { strong: 0.6, weak: 0.6, ms: 160 },  // the VIBRATION slider moved with the pad: how it now feels
  },
  // how effects that come together are mixed: the pad plays, on each motor, the strongest of what is under way
  // (never a sum), and a new call only when that mix changes
  mix: {
    gap: 0.03,    // s at least between two calls to the pad (a change comes the next frame but one at worst)
    min: 0.04,    // a motor asked for less than this is not felt: left off
    max: 0.8,     // s the longest anything lasts
    window: 0.6,  // s over which the share of time spent rumbling is measured ...
    duty: 0.55,   // ... past which share ...
    light: 0.5,   // ... an effect with both motors under this (a round of an automatic) ...
    tired: 0.5,   // ... is felt at this much (a long burst never turns into a drone; a kill or a blast comes whole)
  },
};
