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
// crawl = odds that a guard put down this way is not quite dead yet: he turns onto his belly and drags himself a
// little way from his killer, then lies still (CRAWL); never after a blow that leaves nothing to crawl with.
// curl = odds that a whole body that does not crawl curls up round its wound before it goes slack (CURL): cuts and
// bullets only, never a crushed skull or a beating.
export const WOUNDS = {
  // fists and feet: split lips, not much on the floor
  punch: { back: [0, 0, 0], spray: [7, 150, 0.8], mist: 0, splat: [3, 2], pool: [5, 8], rate: 1.5, throw: [90, 140] },
  // bat: crushed tissue, heavy drops thrown wide and slow, a small slow puddle
  blunt: { back: [5, 110, 1.2], spray: [18, 240, 0.85], big: true, mist: 4, splat: [6, 5], pool: [8, 12], rate: 2.5, throw: [170, 250], crawl: 0.3 },
  // knife: an opened artery, a thin fast arc cast off along the stroke, then it pumps out
  slash: { back: [4, 90, 0.8], spray: [42, 390, 0.07], sweep: 1.2, mist: 5, splat: [5, 5], pool: [16, 22], rate: 7, spurt: 2.8, throw: [60, 100], crawl: 0.35, curl: 0.2 },
  // 9 mm: a neat hole, the round usually stays in
  small: { back: [5, 110, 0.6], spray: [14, 290, 0.32], exit: [9, 300, 0.3], mist: 6, splat: [5, 4], pool: [9, 13], rate: 3, throw: [110, 170], crawl: 0.4, curl: 0.2 },
  // subsonic 9 mm: even less of a mess
  quiet: { back: [3, 90, 0.6], spray: [10, 230, 0.3], exit: [6, 240, 0.3], mist: 3, splat: [4, 3], pool: [8, 11], rate: 2.5, throw: [90, 140], crawl: 0.4, curl: 0.2 },
  // buckshot at close range: a wide wet cone, torn flesh, a lake
  buckshot: { back: [10, 150, 0.9], spray: [64, 380, 0.6], big: true, exit: [12, 320, 0.5], mist: 24, splat: [11, 10], pool: [16, 21], rate: 8, throw: [280, 380], curl: 0.15 },
  // a few pellets from far away: several small punctures
  pellet: { back: [3, 90, 0.7], spray: [12, 230, 0.5], exit: [4, 220, 0.5], mist: 5, splat: [5, 6], pool: [10, 14], rate: 3.5, throw: [120, 180], crawl: 0.4, curl: 0.2 },
  // 7.62: through and through, a long tight jet far behind the body
  rifle: { back: [6, 130, 0.5], spray: [20, 450, 0.16], exit: [24, 540, 0.13], mist: 12, splat: [5, 4], pool: [12, 16], rate: 5, throw: [150, 220], crawl: 0.2, curl: 0.2 },
  // sniper round: a fist-sized exit, a plume across the room
  heavy: { back: [9, 170, 0.6], spray: [36, 560, 0.2], big: true, exit: [44, 660, 0.15], mist: 26, splat: [9, 8], pool: [15, 20], rate: 8, throw: [290, 330], curl: 0.15 },
  // thrown through / cut by glass: many cuts all around
  glass: { back: [30, 160, Math.PI], spray: [34, 330, 0.45], mist: 8, splat: [6, 6], pool: [12, 16], rate: 5, spurt: 1.2, throw: [140, 230], curl: 0.2 },
  // run over: broken more than opened, the car does the throwing (systems/Ambient.js)
  impact: { back: [0, 0, 0], spray: [22, 260, 0.9], big: true, mist: 6, splat: [7, 6], pool: [12, 17], rate: 3.5, throw: [140, 230] },
  // neck broken from behind: nothing opened, the body is let down on the spot
  snap: { back: [0, 0, 0], spray: [0, 0, 0], mist: 0, splat: [0, 0], pool: [0, 0], rate: 0, throw: [35, 60] },
  // head stamped on the floor
  crush: { back: [8, 120, 1.2], spray: [20, 260, 0.9], big: true, mist: 10, splat: [8, 8], pool: [14, 18], rate: 7, throw: [40, 80] },
};

// The last crawl, a scripted sequence (entities/Ragdoll.js, fx/CrawlPose.js; every pull drawn from the body's seed):
//   fall    s of plain ragdoll physics first: he is thrown and slides
//   turn    s to roll from his back onto his belly, head away from his killer; gather: s to gather himself when he
//           fell on his face
//   pulls   [min, max] pulls on his forearms; one may fail (slip = odds of it): the hand slides back, he stays
//   step    px the first pull hauls him; decay: each later one goes this much as far, weak: the second arm's share
//   reach, claw, haul, pause  [min, max] s of a pull's parts: the forearm goes forward, the fingers dig in, the body
//           comes up to the hand, a rest; slow: how much longer they get as he weakens (x 1 + slow * (1 - decay^i))
//   knee    odds a knee pushes on a pull of the strong arm
//   last    s of the end: a last reach, the hand claws, the arm drops, the head goes down, a shudder, still
export const CRAWL = {
  fall: 0.7, turn: 0.7, gather: 0.45, pulls: [3, 5], slip: 0.4, step: 7.5, decay: 0.85, weak: 0.65,
  reach: [0.16, 0.26], claw: [0.06, 0.14], haul: [0.24, 0.34], pause: [0.04, 0.22], slow: 0.8, knee: 0.45, last: 1.3,
};

// The other ways of dying on the floor, for a whole body that does not crawl (entities/Ragdoll.js, fx/DyingPose.js):
// fall = s of plain physics first, dur = [min, max] s of the rest.
//   spasm: odds of it (any wound but a broken neck); kicks = [min, max] kicks of one leg, weaker and slower each time
//   curl: rolled onto his side this much at most (squeeze across); its odds are the wound's `curl`
export const SPASM = { odds: 0.15, fall: 0.45, dur: [0.8, 1.6], kicks: [3, 4] };
export const CURL = { fall: 0.5, dur: [1.2, 2], roll: 0.35 };

// Death throes (entities/Ragdoll.js): his limbs jerking a moment. odds = chance a body that does not crawl moves at
// all once down (spasm and curl take their share of it first, the rest is throes), dur = [min, max] s it lasts,
// every = s between two jerks, kick = px/step each gives a limb.
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
