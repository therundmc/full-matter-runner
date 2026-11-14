// How a body bleeds, by what hit it (fx/Gore.js, entities/Projectile.js, Corpse / Ragdoll).
// A weapon names its profile with `wound` (data/weapons.js); kills without a weapon fall back on CAUSE_WOUND.
// Sprays are [drops, speed px/s, half-cone rad]:
//   back   blow-back toward the attacker (the entry wound)
//   spray  thrown along the blow
//   exit   extra plume when the round goes through the body
//   sweep  the spray is cast off along an arc this wide instead of one cone (a blade's stroke)
//   big    heavy drops
// mist = drops of fine red cloud, splat = [radius px, blobs] stamped under the body.
// pool = [min, max] radius of the final puddle (px), rate = how fast it spreads (px/s),
// spurt = seconds of arterial pulsing once the body is down.
// throw = [min, max] speed the body is sent away at (px/s): a blade drops it on the spot, buckshot carries it off.
// crawl = odds that a guard put down this way is not quite dead yet: he drags himself a little way, then lies
// still (CRAWL); never after a blow that leaves nothing to crawl with.
export const WOUNDS = {
  // fists and feet: split lips, not much on the floor
  punch: { back: [0, 0, 0], spray: [7, 150, 0.8], mist: 0, splat: [3, 2], pool: [5, 8], rate: 1.5, throw: [90, 140] },
  // bat: crushed tissue, heavy drops thrown wide and slow, a small slow puddle
  blunt: { back: [5, 110, 1.2], spray: [18, 240, 0.85], big: true, mist: 4, splat: [6, 5], pool: [8, 12], rate: 2.5, throw: [170, 250], crawl: 0.45 },
  // knife: an opened artery, a thin fast arc cast off along the stroke, then it pumps out
  slash: { back: [4, 90, 0.8], spray: [42, 390, 0.07], sweep: 1.2, mist: 5, splat: [5, 5], pool: [16, 22], rate: 7, spurt: 2.8, throw: [60, 100], crawl: 0.55 },
  // 9 mm: a neat hole, the round usually stays in
  small: { back: [5, 110, 0.6], spray: [14, 290, 0.32], exit: [9, 300, 0.3], mist: 6, splat: [5, 4], pool: [9, 13], rate: 3, throw: [110, 170], crawl: 0.6 },
  // subsonic 9 mm: even less of a mess
  quiet: { back: [3, 90, 0.6], spray: [10, 230, 0.3], exit: [6, 240, 0.3], mist: 3, splat: [4, 3], pool: [8, 11], rate: 2.5, throw: [90, 140], crawl: 0.6 },
  // buckshot at close range: a wide wet cone, torn flesh, a lake
  buckshot: { back: [10, 150, 0.9], spray: [64, 380, 0.6], big: true, exit: [12, 320, 0.5], mist: 24, splat: [11, 10], pool: [16, 21], rate: 8, throw: [280, 380] },
  // a few pellets from far away: several small punctures
  pellet: { back: [3, 90, 0.7], spray: [12, 230, 0.5], exit: [4, 220, 0.5], mist: 5, splat: [5, 6], pool: [10, 14], rate: 3.5, throw: [120, 180], crawl: 0.6 },
  // 7.62: through and through, a long tight jet far behind the body
  rifle: { back: [6, 130, 0.5], spray: [20, 450, 0.16], exit: [24, 540, 0.13], mist: 12, splat: [5, 4], pool: [12, 16], rate: 5, throw: [150, 220], crawl: 0.3 },
  // sniper round: a fist-sized exit, a plume across the room
  heavy: { back: [9, 170, 0.6], spray: [36, 560, 0.2], big: true, exit: [44, 660, 0.15], mist: 26, splat: [9, 8], pool: [15, 20], rate: 8, throw: [290, 330] },
  // thrown through / cut by glass: many cuts all around
  glass: { back: [30, 160, Math.PI], spray: [34, 330, 0.45], mist: 8, splat: [6, 6], pool: [12, 16], rate: 5, spurt: 1.2, throw: [140, 230] },
  // run over: broken more than opened, the car does the throwing (systems/Ambient.js)
  impact: { back: [0, 0, 0], spray: [22, 260, 0.9], big: true, mist: 6, splat: [7, 6], pool: [12, 17], rate: 3.5, throw: [140, 230] },
  // neck broken from behind: nothing opened, the body is let down on the spot
  snap: { back: [0, 0, 0], spray: [0, 0, 0], mist: 0, splat: [0, 0], pool: [0, 0], rate: 0, throw: [35, 60] },
  // head stamped on the floor
  crush: { back: [8, 120, 1.2], spray: [20, 260, 0.9], big: true, mist: 10, splat: [8, 8], pool: [14, 18], rate: 7, throw: [40, 80] },
};

// The last crawl (entities/Ragdoll.js): delay = s lying still first, pulls = how many times he drags himself,
// every = s between two pulls, pull = px/step each one gives the body (some 9 px of floor, joints and all).
export const CRAWL = { delay: [0.9, 1.6], pulls: [4, 7], every: [0.6, 0.95], pull: 2.2 };

// Death throes (entities/Ragdoll.js): a body that does not crawl twitches a moment, its limbs jerking.
// odds = chance of it, dur = [min, max] s it lasts, every = s between two jerks, kick = px/step each gives a limb.
export const THROES = { odds: 0.6, dur: [0.9, 2], every: [0.07, 0.2], kick: 1.3 };

// kills that carry no weapon (falling debris, executions, explosions, cars)
export const CAUSE_WOUND = {
  bullet: 'small', heavy: 'heavy', blast: 'buckshot', explosion: 'buckshot', melee: 'blunt', slash: 'slash', glass: 'glass', execute: 'crush', vehicle: 'impact', snap: 'snap',
};

// by = what killed (a weapon definition, or nothing)
export function woundFor(cause, by) {
  // a shotgun only tears a body open up close
  if (by?.wound === 'buckshot' && cause !== 'blast') return WOUNDS.pellet;
  return WOUNDS[by?.wound] || WOUNDS[CAUSE_WOUND[cause]] || WOUNDS.small;
}
