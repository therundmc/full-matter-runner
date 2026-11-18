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
  beat: { zoom: 1.6, ease: 9, pull: 0.85, look: 0 },       // a lesson's beat: a short punch-in on what it is about
  beatWide: { zoom: 1.15, ease: 9, pull: 0.9, look: 0 },   // ... on something big (the stove going)
  run: { zoom: 0.75, ease: 1.5, pull: 0.35, look: 0.5 },   // the run for the window, the fire coming down the corridor
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
// a man whose wave is called (level wave `frame`) is framed with the player (shot `threat`) until he is `near` px
// from him: nobody is asked to deal with a man he cannot see
export const FRAME = { near: 110 };

// ---- the lessons, ONE pattern for all of them (systems/Tutorial.js pace): the first time a hint shows (HINTS, by
// its id), a short directed beat: the game slows hard (`slow`), the camera punches in on what the hint is about
// (`shot`, a SHOTS name), the one line shows; `dur` real s later the camera eases back and he has the hand at normal
// speed, the hint staying up until he has done it. It is never held until he acts (his key, pressed `min` s in or
// later, only cuts it short). Hints that come up together share one beat (the bat and the man: the camera between
// the two). A beat only starts once what it is about is on screen, and he is `within` px of it when that is given
// (near enough to do it); `far`: it need not be on screen (the camera goes and shows it). BEAT: what a lesson does
// not say for itself.
export const BEAT = { slow: 0.07, dur: 1.3, min: 0.35, shot: 'beat' };
export const LESSONS = {
  move: { dur: 1.2 },
  vault: { within: 76 },                       // the table across his doorway
  flee: { dur: 1.0, far: true },               // GET OUT: the camera goes to the living room's way out
  behind: { within: 220 },                     // GET BEHIND HIM
  neck: { dur: 1.0 },                          // behind him: the click
  take: { within: 120 },
  punch: { within: 110 },
  strike: { within: 110 },
  finish: { within: 90, dur: 1.0 },
  slide: { within: 44 },                       // at the corner, not before
  shoot: { dur: 1.0 },
  reload: { dur: 1.0 },
  throw: { dur: 1.0 },
  // the end: the stove going, seen in slow motion (it blows inside the beat), then the jump
  run: { slow: 0.3, dur: 1.2, shot: 'beatWide', at: 'blast', far: true },
  dive: { slow: 0.14, dur: 0.75 },             // at the window, the moment SPACE takes him through
};
// the reload of the lesson: while his hands work the world all but stops (`slow`) and the reload itself goes at its
// real pace; nobody fires or strikes from the moment his gun is dry (a magazine left) until `grace` s after it is
// loaded
export const RELOAD = { slow: 0.05, grace: 0.7 };
// the weapon in his hand is kept whole (its wear never under `keep` blows) until he is within `near` px of a man of
// a stage marked `snatch` (the corridor's gunman): there it has `last` blow left in it (one on a man: data/weapons.js
// WEAR), so it breaks on him and his gun is snatched (data/feel.js SNATCH)
export const FORCE = { keep: 2, last: 1, near: 80 };
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

// ---- the end, straight after the last man of the last stage goes down, wherever the player is: `after` s later the
// stove and its bottle (`blast.at`, taken apart by a blast: systems/Gas.js) go, then a ball of fire out of the breach
// (`breach`: [s after the stove, radius]), both inside the `run` lesson's slow beat; then a chain of them down the
// corridor toward him (the level's `blast.chain`: [col, row, radius], each nearer the window and bigger): the first
// `chain.first` s after the breach, the next ones `chain.gap` s apart ([first gap, last gap]: quicker and quicker),
// each shaking the picture by `chain.shake`. The wall of fire moves slower than he runs: he can always make the
// window, and only that. Nothing else of it hurts him (debris, the stove: it is a stage blast) but a ball of fire
// going off within `chain.kill` of its radius of him does kill; `chain.tail`: s after the last one he is on his own
// again. As he goes through the window what is left of the chain goes off `chain.rush` s apart: right behind him.
// `look`: s the camera looks back at the stove before it follows the fire.
export const BLAST = {
  after: 0.1, breach: [0.16, 78], shake: 1.2, look: 1.2,
  chain: { first: 1.2, gap: [0.42, 0.26], shake: 0.7, kill: 0.95, tail: 1.2, rush: 0.07 },
};
// the way out marked on the floor once nobody is left standing (the level's `exit`: the zone before the window, the
// window's tiles): chevrons marching to the window and a frame round it, pulsing (render/WorldRenderer.js)
// (`wash`: the zone's own tint on the floor, `bracket`: px of its corner marks)
export const EXIT = { color: '#ff3a7a', chevrons: 3, gap: 15, size: 11, pulse: 1.6, frame: 3, wash: 0.16, bracket: 9 };
