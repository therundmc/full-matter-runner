// The kill cam (systems/KillCam.js): what the camera and the clock do on the player's most violent kills, his
// executions, the kills of a long chain and its end. An EXPERIMENT with two versions, picked by the address only
// (`?killcam=zoom|panel|off`; no option in the menus):
//   zoom    the camera punches in toward the kill (Camera.scale, eased back to exactly 1) with slow motion
//   panel   play never zooms nor slows: a comic panel pops in at the top right and replays the kill, slowed
//           (render/KillPanel.js); a strip of three for the heaviest beats
//   off     nothing of it: the game as it was (MOMENTS' own slow motions only)
// Everything here is a feel setting. Times are REAL seconds (the camera does not slow down with the game).
export const KILLCAM = {
  mode: 'zoom',                 // without `?killcam=`
  modes: ['off', 'zoom', 'panel'],

  // A beat by tier, light to heavy. A stronger one takes over a weaker one under way (`rank`), a weaker one in its
  // shadow is dropped.
  //   zoom    Camera.scale at its fullest (on top of the usual view)
  //   pull    0..1: how far the view is drawn from where it looks to the point of the kill
  //   hold    s it stays in (an execution: s after the killing blow, or until he stands up)
  //   slow    [time scale, s] of slow motion (through Impact.slowAtLeast: never on top of a stronger one)
  //   stop    s of hit-stop (World.hitstop keeps the longest asked: a finisher's own already holds longer)
  //   gap     s at least after a beat of this tier before another of it or of a weaker one
  tiers: {
    // a kill of a chain from its 3rd that is nothing special: a nudge of the camera, no slow motion
    combo: { rank: 1, zoom: 1.05, pull: 0.25, hold: 0.04, gap: 0.5 },
    // a head off, a body in pieces, buckshot at arm's length, a smash, a thrown blade, a round through a wall
    violent: { rank: 2, zoom: 1.16, pull: 0.5, hold: 0.08, slow: [0.6, 0.2], gap: 1.2 },
    // a finisher on a man down, a takedown: pushed in on the pair from its start, the blow slowed
    exec: { rank: 3, zoom: 1.3, pull: 0.8, hold: 0.3, slow: [0.35, 0.3], stop: 0.045, gap: 0, longest: 5 },
    // the last man in sight of a chain, a triple kill or more, the chain cashed in: the strongest
    end: { rank: 4, zoom: 1.32, pull: 1, hold: 0.5, slow: [0.3, 0.6], stop: 0.06, gap: 2.5 },
  },
  // each kill of a chain from the `from`-th adds `each` to its beat's zoom, `max` at most
  chain: { from: 3, each: 0.03, max: 0.12 },
  // the chain run out (Scoring's 'chainEnd'): an end beat on its last body when it had `kills` at least, the body
  // still in view, and its last kill did not get that beat already
  cash: { kills: 3 },
  // the last man in sight (as MOMENTS.lastInRoom): px about the player with no other guard in sight, kills of the
  // chain at least
  last: { radius: 420, chain: 2 },
  multi: ['triple', 'massacre'],  // Scoring's 'multiKill' tags that are an end beat
  // the zoom's easing, 1/s (in: toward a beat's zoom; out: back to 1), and how close to 1 it snaps onto it
  ease: { in: 22, out: 9, snap: 0.004 },
  // a guard after him, in the usual view, is never cut out of the picture: the zoom is held to what keeps him in it
  // with `margin` px to spare; under `least` it is not worth it and the beat keeps its slow motion only
  guard: { margin: 18, least: 1.04 },

  // PANEL: the comic inserts. A panel replays a span of the footage around the kill ([from, to] s about it), slowed
  // to fill its time; a strip pops its panels in one after the other (`at` s) and all cut out together at `dur`.
  panel: {
    milestones: [5, 8, 12],     // a plain kill of a chain gets a panel at these counts only (lettered x5!)
    mutes: true,                // in this version MOMENTS' kill slow motions (last in sight, multi-kills) stay off
    single: { dur: 1.3, frames: [{ at: 0, span: [-0.1, 0.3] }] },
    strip: { dur: 1.6, frames: [{ at: 0, span: [-0.32, -0.05] }, { at: 0.28, span: [-0.04, 0.1] }, { at: 0.56, span: [0.12, 0.42] }] },
    hold: 0.2,                  // s a panel stands on its last picture before the cut
    pop: 0.09,                  // s of its pop in, from `from` x its size
    from: 1.3,
    post: 0.45,                 // s of footage still taken after the kill
    // what is lettered in its corner, by the kill's cause (an execution: its own name; the chain's end: CHAIN xN)
    words: { blast: 'BLAM!', heavy: 'BLAM!', bullet: 'BANG!', melee: 'KRAK!', slash: 'SHLAK!', explosion: 'BOOM!', glass: 'KRSSH!', execute: 'SPLAT!' },
    word: 'WHAM!',
    // the footage (render/KillPanel.js): tiles of `tile` world px about him (about the kill once it happened), `fps`
    // a second on the real clock, `frames` kept; a panel shows `view` world px (strip: its narrower panels) at `mag`
    // x the scene's pixels (whole: nearest neighbour keeps the pixel art crisp)
    tile: [120, 96], fps: 20, frames: 16, mag: 2,
    view: { single: [72, 46], strip: [38, 48] },
    // on screen, in 720ths of the height: clear of the score and chain column (`right` from the right edge) and
    // of the alert label (`top`); gap between the panels of a strip, the border, the hard shadow, the tilt (rad)
    right: 244, top: 52, gap: 9, border: 4, shadow: 6, tilt: [-0.035, 0.03, -0.02],
    ink: '#0b0612', bone: '#efe6d2', pink: '#ff2a6d',
  },
};

// the mode asked by the address (`?killcam=`), or the default
export const killcamMode = (asked) => (KILLCAM.modes.includes(asked) ? asked : KILLCAM.mode);
