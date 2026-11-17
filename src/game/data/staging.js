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
  threat: { zoom: 1, ease: 2.2, pull: 0.45, look: 0.5 },   // a man called into the fight: he and the player both in frame
  run: { zoom: 0.75, ease: 1.5, pull: 0.35, look: 0.5 },   // the run for the window, the fire coming down the corridor
  dive: { zoom: 0.7, ease: 2.5, pull: 0, look: 0 },
};
export const DIRECTION = {
  focus: 3.2,              // 1/s the view goes to (and comes back from) what a shot looks at
  snap: 0.012,             // a zoom this close to its shot's settles on it (then on the nearest whole pixel zoom)
};
// a man whose wave is called (level wave `frame`) is framed with the player (shot `threat`) until he is `near` px
// from him: nobody is asked to deal with a man he cannot see
export const FRAME = { near: 110 };

// ---- the lessons: the first time a hint shows (HINTS in systems/Tutorial.js, by what it says), time slows to
// `slow` of its pace until he does it (the hint's key pressed: he acts at once), or for `hold` real s at most. It
// only starts once what the hint points at is on screen, and he is `within` px of it when that is given (near enough
// to do it: no slow motion for a man still behind a door, or a corner still down the corridor).
export const LESSONS = {
  MOVE: { slow: 0.04, hold: 8 },
  'THE FIRE KILLS  -  GET OUT': { slow: 0.12, hold: 2.2 },
  'GET BEHIND HIM': { slow: 0.12, hold: 2.5, within: 220 },
  'BREAK HIS NECK': { slow: 0.06, hold: 4 },
  'PUNCH HIM': { slow: 0.08, hold: 3, within: 110 },
  'FINISH HIM': { slow: 0.08, hold: 3.5, within: 90 },
  'TAKE IT': { slow: 0.15, hold: 2, within: 90 },
  'STRIKE HIM': { slow: 0.1, hold: 2.5, within: 110 },
  'RUN AND SLIDE UNDER HIS FIRE': { slow: 0.07, hold: 4, within: 44 },   // at the corner, not before
  SHOOT: { slow: 0.08, hold: 3 },
  RELOAD: { slow: 0.06, hold: 4 },
  'THROW IT': { slow: 0.06, hold: 3.5 },
  'DIVE THROUGH THE WINDOW': { slow: 0.2, hold: 1.5, within: 72 },      // the moment to jump
};
// the weapon in his hand is kept whole (its wear never under `keep` blows) until he is within `near` px of a man of
// a stage marked `snatch` (the corridor's gunman): there it has `last` blow left in it (one on a man: data/weapons.js
// WEAR), so it breaks on him and his gun is snatched (data/feel.js SNATCH)
export const FORCE = { keep: 2, last: 1, near: 130 };
// the men coming up the stairs (level wave `up`): steps heard, s between two, s from the last to the first man; s
// between two of them
export const STAIRS = { steps: [3, 0.14, 0.12], next: 0.3 };

// ---- the opening: he lies on his mattress, the man who poured the petrol stands at the end of the trail
// (`at`: the tile he is posted on), turns, laughs, lights a match, lets it fall and is gone by the front door,
// which he slams (`door`: its tile; `out`: the tile he runs to, past it). He cannot be stopped: nothing hurts him,
// and the player is kept down until the match has fallen.
export const OPENING = {
  turn: 0.5,               // s in: the man turns to him
  laugh: 0.75,             // ... and laughs: the bubble, the gesture, the laugh heard
  line: 'HA HA HA!',
  bubble: 1.5,             // s the bubble stays
  name: 'LUCKY',           // his name, slammed down at his feet like a card ...
  card: [1.3, 1.7],        // ... [s in, s it stays]
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
// the first, radius]), then a chain of them down the corridor toward him (the level's `blast.chain`: [col, row,
// radius], each nearer the window and bigger): the first `chain.first` s after the breach, the next ones `chain.gap`
// s apart ([first gap, last gap]: quicker and quicker), each shaking the picture by `chain.shake`. The wall of fire
// moves slower than he runs: he can always make the window, and only that. Nothing else of it hurts him (debris, the
// stove: it is a stage blast) but a ball of fire going off within `chain.kill` of its radius of him does kill;
// `chain.tail`: s after the last one he is on his own again. `slow`: [time scale, real s] as the stove goes;
// `look`: s the camera looks back at the stove before it follows the fire.
export const BLAST = {
  after: 0.35, breach: [0.3, 78], slow: [0.3, 1.1], shake: 1.2, look: 1.2,
  chain: { first: 0.5, gap: [0.42, 0.26], shake: 0.7, kill: 0.95, tail: 1.2 },
};
// the way out marked on the floor once nobody is left standing (the level's `exit`: the zone before the window, the
// window's tiles): chevrons marching to the window and a frame round it, pulsing (render/WorldRenderer.js)
// (`wash`: the zone's own tint on the floor, `bracket`: px of its corner marks)
export const EXIT = { color: '#ff3a7a', chevrons: 3, gap: 15, size: 11, pulse: 1.6, frame: 3, wash: 0.16, bracket: 9 };
