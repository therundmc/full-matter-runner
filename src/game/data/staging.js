// How the prologue is staged (level `tutorial`: tools/build_tutorial.py, systems/Tutorial.js): the camera's shots,
// the lessons that slow time, the opening with the man and his match, the flat blowing up at the end.
// Times in s (real ones where said), lengths in px unless said otherwise.

// ---- the camera (systems/Direction.js): a shot is a zoom on top of the usual view (1; 2: twice as close) eased
// toward at `ease` 1/s, and how far the view goes to what the shot looks at when it looks at something (`pull`:
// 0 stays on the player, 1 goes all the way; `look`: share of the cursor's look-ahead kept)
export const SHOTS = {
  wake: { zoom: 2.3, ease: 6, pull: 0, look: 0 },          // his eye snaps open: very close on him
  laugh: { zoom: 1.7, ease: 2.6, pull: 1, look: 0 },       // the man with the match, pushed in on
  catch: { zoom: 1.3, ease: 3, pull: 0.55, look: 0 },      // the petrol catches: the trail between them
  bedroom: { zoom: 1.5, ease: 1.6, pull: 0, look: 0.6 },   // getting up: it eases out
  flat: { zoom: 1.25, ease: 1.4, pull: 0, look: 1 },       // inside the flat: a little closer than usual
  corridor: { zoom: 1, ease: 1.2, pull: 0, look: 1 },
  landing: { zoom: 0.9, ease: 1.2, pull: 0, look: 1 },
  run: { zoom: 0.75, ease: 1.5, pull: 0.35, look: 0.5 },   // the run for the window, the flat going up behind him
  dive: { zoom: 0.7, ease: 2.5, pull: 0, look: 0 },
  // a boss's beats (systems/BossStage.js, data/bosses.js `shot`)
  bossIntro: { zoom: 1.35, ease: 6, pull: 0.6, look: 0.2 },  // he lays eyes on the player: pushed in, mostly on him
  bossHurt: { zoom: 1.3, ease: 8, pull: 0.4, look: 0.5 },    // the first hit
  bossDown: { zoom: 1.6, ease: 3, pull: 0.75, look: 0 },     // he goes down: it lingers on him
};
export const DIRECTION = {
  focus: 3.2,              // 1/s the view goes to (and comes back from) what a shot looks at
  snap: 0.012,             // a zoom this close to its shot's settles on it (then on the nearest whole pixel zoom)
};

// ---- the lessons: the first time a hint shows (HINTS in systems/Tutorial.js, by what it says), time slows to
// `slow` of its pace until he does it (the hint's key pressed: he acts at once), or for `hold` real s at most
export const LESSONS = {
  MOVE: { slow: 0.04, hold: 8 },
  'THE FIRE KILLS  -  GET OUT': { slow: 0.12, hold: 2.2 },
  'GET BEHIND HIM': { slow: 0.12, hold: 2.5 },
  'BREAK HIS NECK': { slow: 0.06, hold: 4 },
  PUNCH: { slow: 0.08, hold: 3 },
  'FINISH HIM': { slow: 0.08, hold: 3.5 },
  'TAKE IT': { slow: 0.15, hold: 2 },
  STRIKE: { slow: 0.1, hold: 2.5 },
  'RUN AND SLIDE UNDER HIS FIRE': { slow: 0.07, hold: 4 },
  SHOOT: { slow: 0.08, hold: 3 },
  'THROW IT': { slow: 0.06, hold: 3.5 },
  DIVE: { slow: 0.5, hold: 1.2 },                           // barely: the stove is about to go
};

// ---- the opening: he lies on his mattress, the man who poured the petrol stands at the end of the trail
// (`at`: the tile he is posted on), turns, laughs, lights a match, lets it fall and is gone by the front door,
// which he slams (`door`: its tile; `out`: the tile he runs to, past it). He cannot be stopped: nothing hurts him,
// and the player is kept down until the match has fallen.
export const OPENING = {
  turn: 0.5,               // s in: the man turns to him
  laugh: 0.75,             // ... and laughs: the bubble, the gesture, the laugh heard
  line: 'HA HA HA!',
  bubble: 1.5,             // s the bubble stays
  light: 1.9,              // the match struck (his job's act `light`: about 1.4 s to the match on the floor)
  down: 4.2,               // at the latest the player may get up, whatever became of the match
  run: 0.25,               // s after the match fell that he runs
  gone: 1.4,               // s after the match fell that he is gone at the latest, through the door or not
  slow: [0.25, 0.9],       // the petrol catching: [time scale, real s]
  shot: 1.1,               // s the camera stays on the trail catching before it comes back to him
  retry: 1.7,              // a retry of the first room opens this far in: the laugh is not played again
};

// ---- the end: he runs for the window, the stove goes behind him. Once nobody is left standing he only has to step
// into the last stretch of the corridor (the level's `blast.zone`); `after` s later the stove and its bottle
// (`blast.at`, taken apart by a blast: systems/Gas.js) go, then a ball of fire out of the breach (`breach`: [s after
// the first, radius]); `slow`: [time scale, real s]; `shield`: s nothing hurts him (it is a stage blast: the run is
// the lesson, not dying of a brick in the back); `look`: s the camera looks back at it
export const BLAST = { after: 0.35, breach: [0.3, 78], slow: [0.3, 1.1], shield: 1.6, shake: 1.2, look: 2.2 };
