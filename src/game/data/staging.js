// How the prologue is staged (level `tutorial`: tools/build_tutorial.py, systems/Tutorial.js): the camera's shots,
// the lessons that slow time, the opening with the man and his match, the flat blowing up at the end. Also level 1's
// opening shots, level 2A's and how a comic page is skipped.
// Times in s (real ones where said), lengths in px unless said otherwise.

// ---- the camera (systems/Direction.js): a shot is a zoom on top of the usual view (1; 2: twice as close) eased
// toward at `ease` 1/s, and how far the view goes to what the shot looks at when it looks at something (`pull`:
// 0 stays on the player, 1 goes all the way; `look`: share of the cursor's look-ahead kept; `keep`: the player stays
// inside that share of the half view, however far what is looked at is: a shot in a fight never loses him)
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
  bossIntro: { zoom: 1.35, ease: 6, pull: 0.6, look: 0.2, keep: 0.75 }, // he lays eyes on the player: pushed in on him
  bossHurt: { zoom: 1.3, ease: 8, pull: 0.4, look: 0.5, keep: 0.75 },   // the first hit
  bossDown: { zoom: 1.6, ease: 3, pull: 0.75, look: 0, keep: 0.75 },    // he goes down: it lingers on him
  // level 1's opening, the bottle of rum (systems/Opening.js)
  swig: { zoom: 2.2, ease: 6, pull: 0, look: 0 },            // close on him while he drinks
  swigThrow: { zoom: 1.8, ease: 5, pull: 0.45, look: 0, keep: 0.75 }, // the bottle thrown: toward where it breaks, he in the picture
  swigUp: { zoom: 1, ease: 8, pull: 0, look: 1 },            // he gets up: the hand given back, fast
  // level 2A's start, the Uzi taken off the passenger seat (systems/Drive.js grab): close on him at the wheel, the
  // view drawn from ahead of the car onto him; then back out to the drive's view
  grab: { zoom: 2.5, ease: 7, pull: 0.85, look: 0 },
  grabOut: { zoom: 1, ease: 3.5, pull: 0, look: 0 },
  // a throw of his (systems/ThrowBeat.js): the thing in flight followed over its last stretch to the man on its line,
  // then a punch-in on where it struck him, he in the picture
  throwFollow: { zoom: 1.15, ease: 8, pull: 0.45, look: 0.3, keep: 0.8 },
  throwHit: { zoom: 1.3, ease: 12, pull: 0.55, look: 0, keep: 0.8 },
};
export const DIRECTION = {
  focus: 3.2,              // 1/s the view goes to (and comes back from) what a shot looks at
  snap: 0.012,             // a zoom this close to its shot's settles on it (then on the nearest whole pixel zoom)
};
// a man whose wave is called (level wave `frame`) is framed with the player (shot `threat`) until he is `near` px
// from him: nobody is asked to deal with a man he cannot see
export const FRAME = { near: 110 };

// ---- the lessons (systems/Tutorial.js pace): the first time a hint shows (HINTS, by its id), a STOPPED beat, then
// the hand (the user's call: a real lesson, taking its time, so that he cannot just do anything). All on the real
// clock: time stops at once (nothing moves, the world is not stepped; only the hint's own drawing lives), the camera
// travels from him to what the hint is about and pushes in (`shot`, a SHOTS name) over `go` s, eased; it stays there
// `hold` s with the hint shown big over it; then travels back to him and his usual framing over `back` s, time still
// stopped; then time comes back from 0 to 1 over `give` s, and his input is his again from the start of that. Nothing
// he presses reaches him before `give`, and what he still holds down then reads as up until he lets it go (the move
// keys and the stick apart: walking on is harmless). From `min` s into the hold his key (the hint's own, or SPACE /
// ENTER / A / a left click: "got it") ends it early; before, nothing does. Hints that come up together are played
// one after the other, the camera going from one thing straight on to the next, and back to him once at the end.
// The hint stays up until he has done it. A beat only starts once what it is about is on screen, and he is `within`
// px of it when that is given (near enough to do it); `far`: it need not be on screen (the camera goes and shows it).
// A lesson with a `slow` of its own is spectacle, not a lesson: the old pattern, time slowed to `slow` (not stopped)
// for `dur` real s, the camera eased onto it, his hands free (his key, `min` s in or later, cuts it short).
// BEAT: what a lesson does not say for itself; `big`: the hint is drawn that much larger at the height of the beat.
export const BEAT = { go: 0.45, hold: 1.4, min: 0.6, back: 0.4, give: 0.2, big: 0.5, shot: 'beat' };
export const LESSONS = {
  move: {},
  vault: { within: 76 },                       // the big table across the living room
  flee: { far: true },                         // GET OUT: the camera goes to the living room's way out
  behind: { within: 220 },                     // GET BEHIND HIM
  neck: {},                                    // behind him: the click
  shield: {},                                  // behind the landing's man: E takes him as a shield
  take: { within: 120 },
  punch: { within: 110 },
  strike: { within: 110 },
  finish: { within: 90 },
  slide: { within: 44 },                       // at the corner, not before
  shoot: {},
  reload: {},
  throw: {},
  // the end, spectacle: the stove going, seen in slow motion (it blows inside the beat), then the jump
  run: { slow: 0.3, dur: 1.2, min: 0.35, shot: 'beatWide', at: 'blast', far: true },
  dive: { slow: 0.14, dur: 0.75, min: 0.35 }, // at the window, the moment SPACE takes him through
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
// the tutorial's men (systems/Tutorial.js): a dormant one he walks up to, in front of him, wakes within FRONT tiles
// (unless his wave is blind); SLACK: how much slower than a real guard they react and shoot (Enemy.slack): it is a
// lesson; STAND: s a sharp wave's man holds his ground once woken (Enemy.standT)
export const FRONT = 1.7;
export const SLACK = 1.7;
export const STAND = 2.5;

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

// ---- a comic page (the opening, a level's closing page, the leap: ui/cine/Hold.js) is skipped by holding SPACE (a
// pad's A) `hold` s; let go before, it drains back `drain` times as fast. The hint shows `hint` s into the page, over
// `fade` s; a key already down when the page opened must be let go first.
export const SKIP = { hold: 0.9, drain: 3, hint: 0.6, fade: 0.3 };
