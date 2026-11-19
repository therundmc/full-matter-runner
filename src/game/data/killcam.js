// The kill cam (systems/KillCam.js): what the camera, the clock and the picture do on the player's most violent
// kills, his finishers and takedowns, the kills of a long chain and its end. A plain kill gets nothing: the big
// moments stand out. `?killcam=off` in the address turns it off (a developer's switch, to compare; no option).
// Everything here is a feel setting. Times are REAL seconds (the camera does not slow down with the game). What a
// beat does to the lens is in data/post.js (`POST.killcam`), to the pad in data/rumble.js (`RUMBLE.killcam`).
export const KILLCAM = {
  on: true,

  // A beat by tier, light to heavy. A stronger one takes over a weaker one under way (`rank`), a weaker one in its
  // shadow is dropped.
  //   zoom    Camera.scale at its fullest (on top of the usual view)
  //   pull    0..1: how far the view is drawn from where it looks to the point of the kill
  //   slow    [time scale, s] of slow motion (through Impact.slowAtLeast: never on top of a stronger one); the clock
  //           drops to it at once and snaps back when it is over (`clock`)
  //   hold    s the camera stays in (an execution: s after he lets go of the man)
  //   stop    s of hit-stop (World.hitstop keeps the longest asked)
  //   push    px the camera is kicked along the blow; shake: trauma added
  //   blood   [drops, px/s, cone rad] thrown on along the blow, in the slow
  //   gap     s at least after a beat of this tier before another of it or of a weaker one
  tiers: {
    // a kill of a chain from its 3rd that is nothing special: a nudge of the camera and a tick of slow
    combo: { rank: 1, zoom: 1.06, pull: 0.25, hold: 0.06, slow: [0.8, 0.08], push: 2, gap: 0.35 },
    // a head off, a body in pieces, buckshot at arm's length, a smash, a round through a wall
    violent: { rank: 2, zoom: 1.2, pull: 0.5, hold: 0.24, slow: [0.5, 0.28], stop: 0.03, push: 5, shake: 0.2, blood: [14, 260, 0.5], gap: 1.2 },
    // a finisher on a man down, a takedown: pushed in on the pair from its start; each blow held an instant
    // (`blow`: its hit-stop and the camera's zoom kick), the killing one the heaviest and slowed
    exec: { rank: 3, zoom: 1.34, pull: 0.8, hold: 0.25, slow: [0.3, 0.42], stop: 0.14, push: 6, shake: 0.3, blood: [18, 220, 0.9], gap: 0,
      longest: 6, blow: { stop: 0.07, punch: 0.03 } },
    // the last man in sight of a chain, a triple kill or more, the chain cashed in: the big release
    end: { rank: 4, zoom: 1.4, pull: 1, hold: 0.7, slow: [0.22, 0.75], stop: 0.09, push: 8, shake: 0.4, blood: [26, 300, 0.7], gap: 2.5 },
  },
  // the crescendo: each kill of a chain from the `from`-th is a step (`steps` at most), and a step adds `zoom` to
  // its beat's zoom, takes `slow` off its time scale (never under `floor`), adds `hold` s to its slow motion and
  // `lens` to how hard it hits the lens
  chain: { from: 3, steps: 5, zoom: 0.03, slow: 0.015, floor: 0.16, hold: 0.02, lens: 0.15 },
  // the chain run out (Scoring's 'chainEnd'): an end beat on its last body when it had `kills` at least, the body
  // still in view, and its last kill did not get that beat already
  cash: { kills: 3 },
  // the last man in sight (as MOMENTS.lastInRoom): px about the player with no other guard in sight, kills of the
  // chain at least
  last: { radius: 420, chain: 2 },
  multi: ['triple', 'massacre'],  // Scoring's 'multiKill' tags that are an end beat
  // the zoom: `in` 1/s toward a beat's zoom (in within about 0.06 s); let go, it comes back like a whip: what was
  // left of it dies at `out` 1/s while swinging at `whip` rad/s (once a little past the usual view, then home);
  // `snap`: how close to 1 it is put exactly on it
  ease: { in: 45, out: 13, whip: 14, snap: 0.003 },
  // a guard after him, in the usual view, is never cut out of the picture: the zoom is held to what keeps him in it
  // with `margin` px to spare; under `least` it is not worth it and the beat keeps the rest (slow motion, lens)
  guard: { margin: 18, least: 1.04 },
  keep: 0.7,                      // share of the half view the player stays inside while the view is drawn away
  // named placeholder sounds (assets/sound/PLACEHOLDERS.md): into the slow (from the violent tier), the release
  // (from the exec tier), a heartbeat every `every` s under a finisher held
  sounds: { in: 'killcamIn', out: 'killcamOut', heart: 'killcamHeart', every: 0.75 },
};

// on, but for `?killcam=off`
export const killcamOn = (asked) => KILLCAM.on && asked !== 'off';
