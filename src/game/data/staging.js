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
  beatWide: { zoom: 1.15, ease: 9, pull: 0.9, look: 0 },   // the stove going (lesson `run`): the camera on it
  run: { zoom: 0.75, ease: 1.5, pull: 0.35, look: 0.5 },   // the run for the window, the fire coming down the corridor
  dive: { zoom: 0.7, ease: 2.5, pull: 0, look: 0 },
  // the jump out of the window (LEAP): a punch in on him in the air (a cut, whole px), the view drawn a little back
  // toward the window as it goes up behind him, held on his roll, then snapped back out
  leapAir: { zoom: 2, ease: 14, pull: 0, look: 0 },
  leapBlast: { zoom: 2, ease: 9, pull: 0.3, look: 0, keep: 0.5 },
  leapRoll: { zoom: 2, ease: 6, pull: 0, look: 0 },
  leapOut: { zoom: 1, ease: 11, pull: 0, look: 0 },
  // a boss's beats (systems/BossStage.js, data/bosses.js `shot`)
  bossIntro: { zoom: 1.35, ease: 6, pull: 0.6, look: 0.2, keep: 0.75 }, // he lays eyes on the player: pushed in on him
  bossHurt: { zoom: 1.3, ease: 8, pull: 0.4, look: 0.5, keep: 0.75 },   // the first hit
  bossDown: { zoom: 1.6, ease: 3, pull: 0.75, look: 0, keep: 0.75 },    // he goes down: it lingers on him
  // level 1's opening, the bottle of rum (systems/Opening.js)
  swig: { zoom: 2.2, ease: 6, pull: 0, look: 0 },            // close on him while he drinks
  swigThrow: { zoom: 1.8, ease: 5, pull: 0.45, look: 0, keep: 0.75 }, // the bottle thrown: toward where it breaks, he in the picture
  swigUp: { zoom: 1, ease: 8, pull: 0, look: 1 },            // he gets up: the hand given back, fast
  // level 2A's start, the Uzi taken off the passenger seat (systems/Drive.js grab): close on him at the wheel, the
  // view drawn from ahead of the car onto him; then back out to the drive's view. `even`: the close-up rests on an
  // even number of px a world px (6 at 720, 8 at 1080, 10 at 1440: systems/Direction.js whole), so the car's and
  // his own sprites, painted at twice the world's density, get whole px a texel
  grab: { zoom: 2.5, ease: 7, pull: 0.85, look: 0, even: true },
  grabOut: { zoom: 1, ease: 3.5, pull: 0, look: 0 },
  // level 2A's opening, the cigarette (systems/LastDrag.js, CHASE.intro): the same close-up, all the way onto the
  // point LastDrag moves: from the hood onto him, after the butt out onto the road, back on him in one cut
  drag: { zoom: 2.5, ease: 7, pull: 1, look: 0, even: true },
  // ... and closer still on the butt once it is flicked (a cut: 8 px a world px at 720, 12 at 1080, 16 at 1440)
  butt: { zoom: 4, ease: 7, pull: 1, look: 0, even: true },
  // the chase's beats (systems/ChaseCam.js, CHASE.cinema). A pursuer stopped for good: a cut in toward the wreck
  // (`ahead`: the view goes toward it across the road and forward only, never back: it shows no less of the road
  // ahead of his car than the cut itself does). The lorry: no zoom, the view shifted toward the way round it
  chaseKill: { zoom: 1.34, ease: 7, pull: 0.5, look: 0, ahead: true },
  lorryGap: { zoom: 1, ease: 7, pull: 0.3, look: 0, ahead: true },
  // a toll's plaza as he chooses his lane (CHASE.cinema.choose): a cut OUT to the next even whole zoom (2 px a world px
  // at 1080 and 900, 2 at 1440, 4 at 2160; at 720 it is already the least: no cut), the view drawn on ahead to the
  // gates (ChaseCam.shot: its point is the whole of where the view goes)
  tollChoose: { zoom: 0.67, ease: 7, pull: 1, look: 0, ahead: true, even: true },
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

// ---- the lessons (systems/Tutorial.js pace): a hint is a key and what it does, on its object (HINTS), never advice.
// A lesson is a SLOW MOTION that starts exactly when its action is due, never a stop (the user's call: stopping
// everything breaks the flow). Each has its trigger (Tutorial.js DUE: read from the situation, not from the hint
// having come up); when it holds for the first time, time eases down to `slow` over `in` real s, the camera pushes in
// on him by `push` (a share of the zoom: no travel, it stays on him and on the room's framing) and the hint pops
// `big` larger over its object. He keeps the hand all along. It lasts until he does it (the hint's key, pressed
// afresh), or the trigger has been gone `grace` s, or `cap` real s have passed; then time eases back to 1 over `out`
// s. Once a lesson (a retry never slows for it again: Game.taught); the hint itself may show before, small.
// BEAT: what a lesson does not say for itself.
export const BEAT = { in: 0.1, out: 0.2, slow: 0.3, cap: 2.5, grace: 0.12, push: 0.05, big: 0.5 };
// by hint id; px and s (`lead`, `closing` as said)
export const LESSONS = {
  // moving toward the table (`closing` px a step at least) with his body within `reach` px of its edge
  vault: { slow: 0.3, reach: 32, closing: 0.8 },
  neck: { slow: 0.25 },                        // behind a man who has not seen him, within reach: the click takes him
  shield: { slow: 0.2 },                       // behind the landing's man, in reach, a hand free: E takes him as a shield
  take: { slow: 0.35, reach: 26, cap: 1.6 },   // standing over the weapon (Player.nearItem's reach)
  punch: { slow: 0.3, reach: 52 },             // a man who knows him within `reach` px: a step and the blow lands
  strike: { slow: 0.3, reach: 62 },
  finish: { slow: 0.35, reach: 30, cap: 2 },   // a man down at his feet (data/feel.js EXEC.near)
  // the corridor's gunman has him in his sights and his shot is `lead` s away (game time) or less
  // (the hint goes away within `near` px of him: too close to slide)
  slide: { slow: 0.25, lead: 0.45, near: 70, cap: 2 },
  shoot: { slow: 0.3, range: 230 },            // a gun with rounds in it, a man who knows him in his line of fire
  reload: { slow: 0.3, cap: 2 },               // the gun runs dry, a magazine left (then RELOAD's own slow motion)
  throw: { slow: 0.3, range: 200 },            // dry for good, a man in his line: the gun is thrown
  dive: { slow: 0.14, cap: 0.75 },             // at the window, the moment SPACE takes him through
  // the end, spectacle and no hint: the stove going, seen in slow motion (it blows inside the beat), the camera on it
  run: { slow: 0.3, cap: 2.2, push: 0, shot: 'beatWide', at: 'blast' },
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

// ---- the end, straight after the last man of the last stage goes down, wherever the player is: the valve of the
// gas bottle the fire has reached (`blast.at`, a propane cylinder: systems/Gas.js) is lit, a jet of flame out of it
// toward `jet` (rad) hissing higher for `fuse` s, seen in the `run` lesson's slow motion, the camera on it; then it
// goes, the stove and its bottle behind the wall with it (`breach[0]` s apart), then a ball of fire out of the breach
// (`breach`: [s after the stove, radius]), both inside the `run` lesson's slow motion; then a chain of them down the
// corridor toward him (the level's `blast.chain`: [col, row, radius], each nearer the window and bigger): the first
// `chain.first` s after the breach, the next ones `chain.gap` s apart ([first gap, last gap]: quicker and quicker),
// each shaking the picture by `chain.shake`. The wall of fire moves slower than he runs: he can always make the
// window, and only that. Nothing else of it hurts him (debris, the stove: it is a stage blast) but a ball of fire
// going off within `chain.kill` of its radius of him does kill; `chain.tail`: s after the last one he is on his own
// again. As he goes through the window what is left of the chain goes off `chain.rush` s apart: right behind him.
// `look`: s the camera looks back at the stove before it follows the fire.
export const BLAST = {
  fuse: 0.45, jet: Math.PI, breach: [0.16, 78], shake: 1.2, look: 1.2,
  chain: { first: 1.5, gap: [0.42, 0.26], shake: 0.7, kill: 0.95, tail: 1.2, rush: 0.07 },
};
// ---- the jump (systems/Tutorial.js leap): from the moment he goes through the window, real s. In the air time all
// but stops (`air.slow`; `cap`: no longer than that if he never lands outside) and the camera cuts in on him
// (SHOTS leapAir; the view stays inside the map, never the void beyond it: he lands at its edge, off the middle of
// the picture, the window and its fire filling the rest; no HUD, no hint, no exit mark from then on); once he is out, `blast.at` game s later the window goes up behind him: a ball of fire
// of `radius` px, `blast.inside` px inside the frame (it fills the window and he is seen against it, never under
// it), its panes blown out, `rain` [shards, embers, flames] thrown after him, the picture shaken; held
// `blast.hold` s at `blast.slow` with the view drawn back toward it, then his roll (`roll.hold` s at `roll.slow`),
// then `out` s at full speed with the camera snapped back, before the black (Game's FALL)
export const LEAP = {
  air: { slow: 0.3, cap: 1.6 },
  blast: { at: 0.05, radius: 92, inside: 26, shake: 1.4, slow: 0.16, hold: 1.1, rain: [34, 30, 14] },
  roll: { slow: 0.55, hold: 0.8 },
  out: 0.45,
};
// the way out marked on the floor once nobody is left standing (the level's `exit`: the zone before the window, the
// window's tiles): chevrons marching to the window and a frame round it, pulsing (render/WorldRenderer.js)
// (`wash`: the zone's own tint on the floor, `bracket`: px of its corner marks)
export const EXIT = { color: '#ff3a7a', chevrons: 3, gap: 15, size: 11, pulse: 1.6, frame: 3, wash: 0.16, bracket: 9 };

// ---- a comic page (the opening, a level's closing page, the leap: ui/cine/Hold.js) is skipped by holding SPACE (a
// pad's A) `hold` s; let go before, it drains back `drain` times as fast. The hint shows `hint` s into the page, over
// `fade` s; a key already down when the page opened must be let go first.
export const SKIP = { hold: 0.9, drain: 3, hint: 0.6, fade: 0.3 };
