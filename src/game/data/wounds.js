// How a body bleeds, by what hit it and how (fx/Gore.js, entities/Projectile.js, Corpse / Ragdoll).
// A weapon names its profile with `wound` (data/weapons.js); kills without a weapon fall back on CAUSE_WOUND. The
// blood follows what was done: a punch leaves almost nothing, a club a few heavy drops and a small slow pool, a knife
// thrust a thin dark line, its slash a thin arc, a cut throat the biggest pool of the game; buckshot and rifles tear.
// Sprays are [drops, speed px/s, half-cone rad]:
//   back   blow-back toward the attacker (the entry wound)
//   spray  thrown along the blow
//   exit   extra plume when the round goes through the body
//   sweep  the spray is cast off along an arc this wide instead of one cone (a blade's stroke)
//   big    heavy drops
// mist = drops of fine red cloud, splat = [radius px, blobs] stamped under the body.
// pool = [min, max] radius of the final puddle (px), rate = how fast it spreads (px/s),
// spurt = seconds of arterial pulsing once the body is down.
// throw = [min, max] speed the body is sent away at (px/s); it goes about v^2 / 690 + v * 0.18 px before the floor
// stops it (cloth on the floor, mu 1.1): a punch or a blade lays him down where he stood, a club sends him a short
// way, buckshot carries him off.
// crawl = odds that a guard put down this way is not quite dead yet: he turns onto his belly and drags himself a
// little way from his killer, then lies still (CRAWL); never after a blow that leaves nothing to crawl with. Rare:
// about one man in ten (three or four in ten was "too much" for the user).
// curl = odds that a whole body that does not crawl curls up round its wound before it goes slack (CURL): cuts and
// bullets only, never a crushed skull or a beating.
// What a round throws out of him and past him (fx/Spatter.js), gunshot wounds only:
//   fling   [stains, near px, far px]: the exit spray landing on the floor behind him along the shot, long streaks
//   wall    [reach px, splash radius px, min runs, max runs]: a wall that close behind him (traced along the shot)
//           takes a splash and blood runs down it to its foot over a few seconds (RUNS)
//   skull   [odds, range px]: a round from at most this far bursts his skull (SKULL) instead of leaving it whole
//   artery  [odds, s]: an artery opened: it spurts that long once he is down (a glass cut's own `spurt` aside)
export const WOUNDS = {
  // fists and feet: a split lip, a nose; next to nothing on the floor
  punch: { back: [0, 0, 0], spray: [3, 110, 0.6], mist: 0, splat: [0, 0], pool: [2, 4], rate: 0.8, throw: [40, 70] },
  // bat, tire iron: crushed tissue, a few heavy drops along the blow, a small slow puddle
  blunt: { back: [2, 90, 1], spray: [7, 210, 0.45], big: true, mist: 0, splat: [3, 2], pool: [5, 8], rate: 1.2, throw: [90, 140], crawl: 0.1 },
  // knife thrust: a narrow hole, a thin dark line of drops, then it seeps slowly
  stab: { back: [0, 0, 0], spray: [4, 150, 0.08], mist: 0, splat: [2, 1], pool: [6, 9], rate: 1, throw: [25, 50], crawl: 0.12, curl: 0.25 },
  // knife slash: a thin fast arc cast off along the stroke, a wider cut that runs
  slash: { back: [2, 80, 0.6], spray: [14, 320, 0.06], sweep: 1, mist: 1, splat: [3, 3], pool: [7, 10], rate: 2, throw: [25, 55], crawl: 0.1, curl: 0.2 },
  // the throat opened: a short arc off the blade, then the artery pumps it out (THROAT), the biggest pool there is
  throat: { back: [2, 80, 0.5], spray: [16, 340, 0.05], sweep: 0.8, mist: 2, splat: [4, 4], pool: [24, 30], rate: 7, throw: [0, 20] },
  // 9 mm: a small entry, the round usually stays in, a short spray when it does not
  small: { back: [3, 100, 0.5], spray: [9, 250, 0.3], exit: [8, 290, 0.3], mist: 5, splat: [3, 3], pool: [8, 11], rate: 2.2, throw: [60, 100], crawl: 0.12, curl: 0.2,
    fling: [6, 14, 64], wall: [60, 6, 3, 5], skull: [0.3, 70], artery: [0.15, 2.5] },
  // subsonic 9 mm: even less of a mess
  quiet: { back: [2, 80, 0.5], spray: [5, 190, 0.3], exit: [4, 230, 0.3], mist: 2, splat: [3, 2], pool: [7, 10], rate: 2, throw: [50, 85], crawl: 0.12, curl: 0.2,
    fling: [3, 10, 40], wall: [44, 4, 2, 3], skull: [0.2, 48], artery: [0.1, 2] },
  // buckshot at close range: a wide wet cone, torn flesh, a lake
  buckshot: { back: [10, 150, 0.9], spray: [72, 400, 0.6], big: true, exit: [16, 340, 0.5], mist: 30, splat: [11, 10], pool: [16, 21], rate: 8, throw: [190, 260], curl: 0.15,
    fling: [14, 10, 96], wall: [90, 10, 5, 8], skull: [0.5, 120], artery: [0.3, 3] },
  // a few pellets from far away: several small punctures
  pellet: { back: [3, 90, 0.7], spray: [10, 220, 0.5], exit: [4, 220, 0.5], mist: 4, splat: [4, 5], pool: [9, 13], rate: 3, throw: [70, 110], crawl: 0.12, curl: 0.2,
    fling: [4, 10, 50], wall: [50, 3, 1, 3], artery: [0.1, 2] },
  // 7.62: through and through, a long tight jet far behind the body
  rifle: { back: [6, 130, 0.5], spray: [20, 450, 0.16], exit: [24, 540, 0.13], mist: 12, splat: [5, 4], pool: [12, 16], rate: 5, throw: [100, 150], crawl: 0.07, curl: 0.2,
    fling: [9, 20, 120], wall: [100, 7, 3, 6], skull: [0.3, 150], artery: [0.25, 3] },
  // sniper round: a fist-sized exit, a plume across the room
  heavy: { back: [9, 170, 0.6], spray: [40, 580, 0.2], big: true, exit: [48, 680, 0.15], mist: 32, splat: [9, 8], pool: [15, 20], rate: 8, throw: [200, 250], curl: 0.15,
    fling: [16, 24, 190], wall: [160, 11, 6, 9], skull: [0.6, 99999], artery: [0.35, 3.5] },
  // thrown through / cut by glass: many cuts all around
  glass: { back: [30, 160, Math.PI], spray: [34, 330, 0.45], mist: 8, splat: [6, 6], pool: [12, 16], rate: 5, spurt: 1.2, throw: [100, 160], curl: 0.2 },
  // run over: broken more than opened, the car does the throwing (systems/Ambient.js)
  impact: { back: [0, 0, 0], spray: [22, 260, 0.9], big: true, mist: 6, splat: [7, 6], pool: [12, 17], rate: 3.5, throw: [140, 230] },
  // neck broken from behind: nothing opened, the body is let down on the spot
  snap: { back: [0, 0, 0], spray: [0, 0, 0], mist: 0, splat: [0, 0], pool: [0, 0], rate: 0, throw: [10, 25] },
  // skull crushed (a club brought straight down, a head stamped on the floor)
  crush: { back: [6, 110, 1.1], spray: [14, 240, 0.8], big: true, mist: 5, splat: [6, 6], pool: [10, 14], rate: 3.5, throw: [30, 60] },
};

// What a wound leaves on the body itself (fx/BodyMarks.js places it, render/BodyMarkArt.js paints it, on the torso
// or the head of entities/Ragdoll.js), by wound profile: kind, n = [min, max] of them, size = [min, max] px,
// where = torso | head | neck (the top of the torso) | any (the torso mostly, the head now and then).
//   hole    a round's entry: a dark point in a red ring, the cloth soaked round it, a run of blood
//   cut     a blade's stroke: a dark line (size = its length) with a wet middle
//   gash    a thrust: a short slit in its stain
//   bruise  a club's blow: split skin, blood smeared round it
// A punch and a broken neck leave nothing.
export const MARKS = {
  blunt: { kind: 'bruise', n: [1, 2], size: [3, 4.5], where: 'head' },
  crush: { kind: 'bruise', n: [2, 3], size: [4, 5], where: 'head' },
  impact: { kind: 'bruise', n: [2, 3], size: [3, 5], where: 'any' },
  stab: { kind: 'gash', n: [1, 1], size: [3.5, 4.5], where: 'torso' },
  slash: { kind: 'cut', n: [1, 1], size: [7, 10], where: 'torso' },
  throat: { kind: 'cut', n: [1, 1], size: [6, 8], where: 'neck' },
  glass: { kind: 'cut', n: [3, 5], size: [3, 6], where: 'any' },
  small: { kind: 'hole', n: [1, 2], size: [3, 4], where: 'any' },
  quiet: { kind: 'hole', n: [1, 1], size: [3, 3.5], where: 'any' },
  pellet: { kind: 'hole', n: [3, 5], size: [2, 2.5], where: 'any' },
  buckshot: { kind: 'hole', n: [5, 8], size: [2.5, 3.5], where: 'torso' },
  rifle: { kind: 'hole', n: [1, 2], size: [3.5, 4.5], where: 'any' },
  heavy: { kind: 'hole', n: [1, 1], size: [5, 6], where: 'torso' },
};
// What tears a body apart, by cause (fx/Gore.js): the odds of it going to pieces (gibs) or losing its head, the odds
// each limb of what is left is torn off (shotgun up close, a .50) and at most how many; scale = x by the weapon's `gore`
export const TEAR = {
  blast: { gibs: 0.4, headless: 0.35, limb: 0.45, most: 3 },
  heavy: { gibs: 0.2, headless: 0.4, limb: 0.55, most: 2, second: 0.3 },
  explosion: { gibs: 1 },
};

// A skull burst by a round (fx/Gore.js, a wound's `skull`): bits = [min, max] pieces of bone, scalp and brain thrown
// along the shot at speed [min, max] px/s; chunks = gib chunks (bleeding, physical); drops / mist = the red cloud and
// spray; matter = [floor stains, near px, far px] of what was inside, thrown behind him; wall = splash radius px on a
// wall that close behind (traced up to `reach` px), runs = [min, max] drips down it
export const SKULL = {
  bits: [12, 18], speed: [120, 380], chunks: [2, 4], drops: [44, 520, 0.35], mist: 30,
  matter: [7, 10, 80], reach: 110, wall: 10, runs: [4, 7],
};

// Blood running down a wall to its foot (fx/Spatter.js): px/s it starts at [min, max] (it slows as it thins and
// stops at the foot), len = [min, max] px of wall top it crosses (x the splash's size), foot = [min, max] radius of
// the drop it leaves there, odds a heavy drop hitting a wall starts one, the most running at once, odds per px it
// wavers sideways
export const RUNS = { speed: [3, 8], len: [3, 9], foot: [1.2, 2.4], odds: 0.2, max: 48, wobble: 0.12 };

// A man floored but alive (Enemy.knock): his nose or his brow bleeds, a drop now and then while he lies there and
// for a while after he is up (s), every [min, max] s
export const HURT = { dur: [5, 9], every: [0.18, 0.5] };

const NAME_OF = new Map(Object.entries(WOUNDS).map(([name, w]) => [w, name]));
// the marks of a wound profile (one of WOUNDS), or nothing
export const markOf = (wd) => MARKS[NAME_OF.get(wd)] || null;

// What the blow adds to its wound (fx/Gore.js, `how` from Character.kill; x the drops thrown, the stain, the pool's
// area): heavy = a club's heavy stroke (a blade's heavy stroke is a thrust: the stab profile instead), spin = a club
// swung all the way round, finisher = a man already down, struck again and again, thrown = a weapon thrown at him;
// light = a club of heft 1 (a cue) next to a bat or a tire iron (heft 2).
export const BLOW = { heavy: 1.7, spin: 1.3, finisher: 2, thrown: 0.7, light: 0.75 };

// The dead body itself (entities/Ragdoll.js): a limp body drops and stays, it does not flail.
//   joints  [min, max] rad a part may turn off the torso, seen from above, for a part on his right side (the left
//           side mirrored): 0 = straight out sideways, PI/2 = along the body toward the feet, -PI/2 = toward the
//           head. shoulder: from the arm raised past the head to the hand by the thigh (never across or under him);
//           hip: from a leg splayed some 35 deg to the knees together (never up beside the belly or the head);
//           neck: the head's turn off the line of the spine, either way (no mirror)
//   arms, legs  [min, max] rad they lie at as he goes down (same frame)
//   damp    1/s, how fast what is left of a swing goes out of the body (0.7 / damp s halves it): spin = a part
//           turning on its joint, slide = the parts moving apart from the whole of him
//   spin    [min, max] rad/s the whole body turns as it is thrown, per 100 px/s of throw (either way)
//   lag     share of the throw the limbs miss: they trail behind the torso
//   how     the throw x what the blow was: a heavy stroke, a club swung round, a man already down, held from behind
//   jolt    momentum (kg px/step) a round gives the part of a corpse it hits: [a round, a pellet, a heavy round]
export const BODY = {
  joints: { shoulder: [-1.8, 1.85], hip: [0.95, 1.85], neck: [-0.55, 0.55] },
  arms: [-0.3, 1.2], legs: [1.1, 1.55],
  damp: { spin: 7, slide: 5 },
  spin: [0.4, 1.2], lag: 0.15,
  how: { heavy: 1.3, spin: 1.2, finisher: 0.15, held: 0.3 },
  jolt: [4, 3, 9],
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

// The cut throat (entities/Ragdoll.js, fx/DyingPose.js): he sinks onto his knees, both hands at his throat, pitches
// forward onto the floor, the artery pumping in spurts, a leg pushes, the hands slip, still.
//   odds    chance a blade's slash from the front or the side opens the throat (a blade takedown always does)
//   kneel, pitch  s he takes to sink onto his knees, then to pitch forward onto the floor
//   dur     [min, max] s of the whole; slip = share of it the hands take to slide off his throat at the end
//   upright how much of his length shows from above while he kneels
//   beats   [min, max] spurts of the artery, the first two gap s apart, each gap x slow, each spurt x fade as strong;
//           jet = [min, max] px/s a spurt throws at its weakest and strongest, beat = s one spurt lasts
//   push    [min, max] times a leg pushes against the floor
export const THROAT = {
  odds: 0.35, kneel: 0.45, pitch: 0.35, dur: [2.3, 2.9], slip: 0.22, upright: 0.42,
  beats: [3, 5], gap: 0.34, slow: 1.2, fade: 0.72, jet: [50, 260], beat: 0.2, push: [1, 2],
};

// A head taken off a man on his feet (entities/Ragdoll.js, fx/DyingPose.js): the body sinks onto its knees where it
// stood, arms hanging, stays there while the neck throws blood up in spurts that come down all round it, then
// pitches forward onto the floor. The fields of THROAT, plus hold = s it stays on its knees and odds = chance a
// beheaded body does this instead of being thrown down like any other.
export const BEHEAD = {
  odds: 0.7, kneel: 0.3, hold: 0.9, pitch: 0.4, dur: [2.3, 2.8], slip: 0.2, upright: 0.42,
  beats: [5, 7], gap: 0.2, slow: 1.12, fade: 0.84, jet: [50, 260], beat: 0.2, push: [0, 1],
};

// Death throes (entities/Ragdoll.js): his limbs jerking a moment. odds = chance a body that does not crawl moves at
// all once down (spasm and curl take their share of it first, the rest is throes), dur = [min, max] s it lasts,
// every = s between two jerks, kick = px/step each gives a limb.
export const THROES = { odds: 0.6, dur: [0.9, 2], every: [0.07, 0.2], kick: 1.3 };

// kills that carry no weapon (falling debris, executions, explosions, cars)
export const CAUSE_WOUND = {
  bullet: 'small', heavy: 'heavy', blast: 'buckshot', explosion: 'buckshot', melee: 'blunt', slash: 'slash', glass: 'glass', execute: 'crush', vehicle: 'impact', snap: 'snap',
};

// by = what killed (a weapon definition, or nothing), how = the blow (Character.kill)
export function woundFor(cause, by, how) {
  // a shotgun only tears a body open up close
  if (by?.wound === 'buckshot' && cause !== 'blast') return WOUNDS.pellet;
  const w = WOUNDS[by?.wound] || WOUNDS[CAUSE_WOUND[cause]] || WOUNDS.small;
  // a blade's heavy stroke is a thrust, and what is left planted in him went in point first
  return w === WOUNDS.slash && (how?.heavy || by?.stuck) ? WOUNDS.stab : w;
}

// how much the blow adds to its wound (BLOW), x
export function blowScale(wd, by, how) {
  let k = 1;
  if (how?.heavy && wd === WOUNDS.blunt) k *= BLOW.heavy;
  if (how?.spin) k *= BLOW.spin;
  if (how?.finisher) k *= BLOW.finisher;
  if (how?.thrown) k *= BLOW.thrown;
  if (by?.swing === 'club' && by.heft < 2) k *= BLOW.light;
  return k;
}
