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
    takedown: { points: 1000, label: 'TAKEDOWN' },      // neck broken or throat cut from behind
  },
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
  level1: { par: 180, grades: [['S', 32000], ['A', 24000], ['B', 16000], ['C', 9000], ['D', 0]] },
};

// levels without their own entry (test rooms): scaled by the number of guards
const PER_GUARD = { par: 14, grades: [['S', 2300], ['A', 1750], ['B', 1250], ['C', 800], ['D', 0]] };

export function levelScoring(id, guards) {
  if (LEVEL_SCORING[id]) return LEVEL_SCORING[id];
  const n = Math.max(1, guards);
  return { par: 30 + PER_GUARD.par * n, grades: PER_GUARD.grades.map(([g, pts]) => [g, pts * n]) };
}
