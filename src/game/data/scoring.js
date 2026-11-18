// Score rules (data only). systems/Scoring.js applies them; the HUD and the results screen only display the outcome.

export const SCORING = {
  // points of a kill by the way it was done (Scoring.killStyle); `label` is shown in the HUD's feed (ui/KillFeed.js)
  styles: {
    shot: { points: 400 },                              // a round from any gun
    pointBlank: { points: 500, label: 'POINT BLANK' },  // buckshot at arm's length
    melee: { points: 800 },                             // bat
    blade: { points: 800 },                             // knife
    explosion: { points: 600, label: 'BLAST' },
    debris: { points: 900, label: 'WRECKAGE' },         // flying furniture, bricks, car parts
    glass: { points: 900, label: 'GLASS' },             // window shards
    // a guard on the floor finished (data/finishers.js): the long execution pays this at the kill, walked out of or
    // not (and `watched` on top when it is seen to its end); the quick kill, somebody on the player, pays less
    execution: { points: 900, label: 'EXECUTION' },
    quickKill: { points: 500, label: 'QUICK KILL' },
    takedown: { points: 1000, label: 'TAKEDOWN' },      // a guard executed from behind (data/finishers.js TAKEDOWNS)
    wreck: { points: 700, label: 'WRECKED' },           // a pursuer's crew in a car put into the scenery (systems/Pursuit.js)
  },
  // circumstances that add to a kill (Scoring.killTags), each one also a different way of killing
  tags: {
    collateral: { points: 700, label: 'COLLATERAL' },   // the same round had already killed someone
    wallbang: { points: 500, label: 'WALLBANG' },       // through a wall or a door
    ricochet: { points: 800, label: 'RICOCHET' },
    longshot: { points: 300, label: 'LONG SHOT' },
    lastRound: { points: 300, label: 'LAST ROUND' },    // with the last round of the magazine
    slide: { points: 500, label: 'SLIDE KILL' },        // while sliding
    airborne: { points: 600, label: 'AIRBORNE' },       // in the middle of a vault
    behind: { points: 300, label: 'FROM BEHIND' },      // a blow in the back
    smash: { points: 200, label: 'SMASH' },             // the heavy stroke: overhead smash, lunge, straight stab
    spin: { points: 300, label: 'SPIN KILL' },          // a club swung all the way round
    thrown: { points: 500, label: 'THROWN BLADE' },    // a knife thrown that planted itself in him
    broke: { points: 400, label: 'WEAPON BREAK' },      // the blow that broke the weapon over him
    disarm: { points: 300, label: 'SNATCHED' },         // his weapon taken into the hand as he went down (Player.snatches)
    smoked: { points: 400, label: 'SMOKED' },           // through air too thick to see (powder, soot, steam)
    slammed: { points: 600, label: 'ENVIRONMENTAL' },   // his head driven into a wall, an edge, a sink (a takedown's spot)
    flushed: { points: 800, label: 'FLUSHED' },         // ... into a toilet or a urinal
    dodge: { points: 600, label: 'DODGE KILL' },        // right after a round passed over a slide
    quickdraw: { points: 300, label: 'QUICK DRAW' },    // with a weapon picked up a moment ago
    // `flat`: paid as it is, never times the chain's multiplier. A multi-kill is already the speed the multiplier pays
    // for, and a boss falls in every clear: multiplied (x4 then) the boss alone was 9000 to 25000 of a clear (QA)
    double: { points: 300, label: 'DOUBLE KILL', flat: true },  // two, three, more within `multiWindow`
    triple: { points: 600, label: 'TRIPLE KILL', flat: true },
    massacre: { points: 1000, label: 'MASSACRE', flat: true },
    cueball: { points: 2000, label: 'CUEBALL', flat: true },    // a boss put down, by his name (data/bosses.js; `how.boss`)
    // how a pursuer's car was stopped (systems/Pursuit.js, `how.car`)
    driver: { points: 600, label: 'DRIVER' },           // through the windscreen: it veers off
    tyre: { points: 500, label: 'BLOWOUT' },            // a front tyre: it spins out
    gunman: { points: 300, label: 'GUNMAN' },           // the man leaning out of its window
    shoved: { points: 700, label: 'SHOVED' },           // shoved by his car into what does not give
  },
  longShot: 420,            // px
  multiWindow: 0.7,         // s between two kills of a multiple one
  dodgeWindow: 1.5,         // s after the dodge
  drawWindow: 1.2,          // s after the pick-up
  unseen: 300,              // added when the victim never knew we were there
  // a long execution watched to its end ('finisher'): points added then (x the multiplier), and the chain gets this
  // share of its window back
  watched: { points: 600, label: 'FULL EXECUTION', refill: 1 },
  // flooring a guard without killing him (cause given to Enemy.knock); the door slam is scored by the door itself.
  // kick: the foot in his head at the end of a slide; hood: the legs off a car's hood. Shown as knockLabels (else
  // the cause in capitals)
  knock: { throw: 200, slide: 200, debris: 150, kick: 300, hood: 300 },
  knockLabels: { debris: 'WRECKAGE', kick: 'SLIDE KICK', hood: 'HOOD SLIDE' },
  // chained kills: each one within `window` s of the last adds `step` to the multiplier, up to `max` (x2.5 at the
  // 7th). Guards rush the player, so chains come on their own in a brawl: at x4 every kill of one paid four times
  combo: { window: 4, step: 0.25, max: 2.5, knockRefill: 0.6 }, // knockRefill: share of the window a knock-down wins back
  chain: 300,               // end bonus per kill of the longest chain beyond the first
  // end bonus per different way of killing beyond the first (styles and tags), counted up to `max`: a snatched gun
  // alone brings SNATCHED and QUICK DRAW, every clear had 12 to 17 ways
  variety: { points: 250, max: 10 },
  time: 50,                 // end bonus per second under the level's par time: the skill a clear shows best
  stealth: { bonus: 4000, perAlert: 1500 }, // lost bit by bit every time the squad goes to ALERT (gone at the 3rd)
  // kills per trigger pull: nothing at `from` and under, the whole bonus at 100%; never firing pays a little more
  accuracy: { bonus: 3000, from: 0.5, noShot: 3500 },
  mercy: 1200,              // end bonus for a guard who gave up and was left alive
  civilian: 2500,           // lost per passer-by killed
  cleanTop: true,           // ... and the top grade is never given with one (Scoring.tally)
};

// Per level: par time (s) and the total a grade starts at, best first. The last grade is the floor.
export const LEVEL_SCORING = {
  // 12 guards, CUEBALL among them (2026-11-18; tests/scoring.test.mjs plays these runs through Scoring): every
  // guard shot one at a time is D, a first clear with one brawl C; B a decent clear (mostly close, chains of 3 to
  // 5, one alert); A fast AND stylish (chains of 4 and 5, takedowns, executions seen through, near par); S all of
  // it at once: a minute under par, the bar in one chain and the boss in another, spotted once at most, no round
  // wasted, nobody else hurt (one civilian drops it to A). The QA robot, faster than any hand, clears in 30 to 80 s
  level1: { par: 150, grades: [['S', 37000], ['A', 29000], ['B', 21500], ['C', 13000], ['D', 0]] },
};

// levels without their own entry (test rooms): scaled by the number of guards
const PER_GUARD = { par: 14, grades: [['S', 1500], ['A', 1200], ['B', 900], ['C', 550], ['D', 0]] };

export function levelScoring(id, guards) {
  if (LEVEL_SCORING[id]) return LEVEL_SCORING[id];
  const n = Math.max(1, guards);
  return { par: 30 + PER_GUARD.par * n, grades: PER_GUARD.grades.map(([g, pts]) => [g, pts * n]) };
}
