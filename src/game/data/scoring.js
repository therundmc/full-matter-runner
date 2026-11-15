// Score rules (data only). systems/Scoring.js applies them; the HUD and the results screen only display the outcome.

export const SCORING = {
  // points of a kill by the way it was done (Scoring.killStyle); `label` is shown over the body
  styles: {
    shot: { points: 400 },                              // a round from any gun
    pointBlank: { points: 500, label: 'POINT BLANK' },  // buckshot at arm's length
    melee: { points: 800 },                             // bat
    blade: { points: 800 },                             // knife
    explosion: { points: 600, label: 'BLAST' },
    debris: { points: 900, label: 'WRECKAGE' },         // flying furniture, bricks, car parts
    glass: { points: 900, label: 'GLASS' },             // window shards
    execution: { points: 1000, label: 'EXECUTION' },    // finishing a guard on the floor
    takedown: { points: 1000, label: 'TAKEDOWN' },      // a guard executed from behind (data/finishers.js TAKEDOWNS)
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
    smoked: { points: 400, label: 'SMOKED' },           // through air too thick to see (powder, soot, steam)
    crushed: { points: 700, label: 'LIGHTS OUT' },      // under a lamp whose chains he shot (systems/LampDrop.js)
    dodge: { points: 600, label: 'DODGE KILL' },        // right after a round passed over a slide
    quickdraw: { points: 300, label: 'QUICK DRAW' },    // with a weapon picked up a moment ago
    double: { points: 400, label: 'DOUBLE KILL' },      // two, three, more within `multiWindow`
    triple: { points: 900, label: 'TRIPLE KILL' },
    massacre: { points: 1500, label: 'MASSACRE' },
  },
  longShot: 420,            // px
  multiWindow: 0.7,         // s between two kills of a multiple one
  dodgeWindow: 1.5,         // s after the dodge
  drawWindow: 1.2,          // s after the pick-up
  unseen: 300,              // added when the victim never knew we were there
  // flooring a guard without killing him (cause given to Enemy.knock); the door slam is scored by the door itself
  knock: { throw: 200, slide: 200, debris: 150 },
  // chained kills: each one within `window` s of the last adds `step` to the multiplier, up to `max`
  combo: { window: 4, step: 0.5, max: 4, knockRefill: 0.6 }, // knockRefill: share of the window a knock-down wins back
  chain: 250,               // end bonus per kill of the longest chain beyond the first
  variety: 400,             // end bonus per different way of killing beyond the first
  time: 25,                 // end bonus per second under the level's par time
  stealth: { bonus: 3000, perAlert: 1000 }, // lost bit by bit every time the squad goes to ALERT
  accuracy: { bonus: 2000, noShot: 2500 },  // kills per trigger pull; never firing at all pays a little more
  mercy: 1200,              // end bonus for a guard who gave up and was left alive
  civilian: 1000,           // lost per passer-by killed
};

// Per level: par time (s) and the total a grade starts at, best first. The last grade is the floor.
export const LEVEL_SCORING = {
  // recalibrated for 15 guards fought hand to hand (800 to 1000 a kill, kill tags on top, multiplier up to x4) and
  // the end bonuses (variety now counts the tags)
  level1: { par: 240, grades: [['S', 52000], ['A', 38000], ['B', 26000], ['C', 15000], ['D', 0]] },
};

// levels without their own entry (test rooms): scaled by the number of guards
const PER_GUARD = { par: 14, grades: [['S', 2300], ['A', 1750], ['B', 1250], ['C', 800], ['D', 0]] };

export function levelScoring(id, guards) {
  if (LEVEL_SCORING[id]) return LEVEL_SCORING[id];
  const n = Math.max(1, guards);
  return { par: 30 + PER_GUARD.par * n, grades: PER_GUARD.grades.map(([g, pts]) => [g, pts * n]) };
}
