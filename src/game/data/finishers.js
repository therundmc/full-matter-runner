// How the player finishes a guard, by what is in his hand (data only; entities/Player.js plays them, the animations
// are entities/CharacterAnim.js execPose).

// Ground finishers (a guard knocked down, on his back). Any attack on him, or Space, starts one, and the player is
// taken over for the length of it: he sets himself by `mount`, the `beats` = [wait s, what] land in order (the wait
// is the anticipation, the beat lands at its end), the last one kills, and he stays `after` s in the pose.
//   mount   'astride' kneeling on the man, facing his head | 'over' standing at his hips, a foot on his chest,
//           facing his head | 'side' standing by his shoulder (the bat's swing)
//   pose    the animation: 'gouge' (both hands on his head, the thumbs driven into his eyes, the head beaten on the
//           floor) | 'frenzy' (a hand at his throat, the blade raised and driven in again and again) | 'smash' (the
//           weapon raised over the head with both hands and brought down) | 'headshot' (the gun held on his head,
//           fired); none: the standing strike gestures
//   what    a strike gesture 0-3 (CharacterAnim) | 'windup' (the weapon brought back and held) | 'stomp'
//           | 'grab', 'press', 'slam' (gouge) | 'pin', 'stab' (frenzy) | 'smash' | 'shot'
//   at      where the blows land: 'head' | 'chest'
// label = what the score calls it; cause = how the body is left ('execute': the head gone, 'slash': opened,
// 'melee': knocked off whole); plant: the weapon goes through him and stays (a cue snaps and leaves its other half in
// the hand); launch: the head flies off at that speed; slowmo: [scale, s] when the windup is let go.
export const FINISHERS = {
  fists: { label: 'EYES OUT', cause: 'execute', mount: 'astride', pose: 'gouge', at: 'head', after: 0.3,
    beats: [[0.26, 'grab'], [0.3, 'press'], [0.24, 'press'], [0.24, 'press'], [0.38, 'slam']] },
  // the head is sent off like a ball: `flight` = [scale, s] of slow motion once it is hit, to see it go
  bat: { label: 'HOME RUN', cause: 'melee', mount: 'side', at: 'head', after: 0.45, beats: [[0.5, 'windup'], [0.12, 0]], launch: 3.2, slowmo: [0.3, 0.5],
    flight: [0.25, 0.9] },
  club: { label: 'SKULL CRUSH', cause: 'execute', mount: 'over', pose: 'smash', at: 'head', after: 0.3,
    beats: [[0.42, 'smash'], [0.36, 'smash'], [0.4, 'smash']] },
  blade: { label: 'BUTCHERED', cause: 'slash', mount: 'astride', pose: 'frenzy', at: 'chest', after: 0.35,
    beats: [[0.22, 'pin'], [0.16, 'stab'], [0.13, 'stab'], [0.12, 'stab'], [0.12, 'stab'], [0.12, 'stab'], [0.13, 'stab'], [0.34, 'stab']] },
  cue: { label: 'IMPALED', cause: 'slash', mount: 'over', pose: 'smash', at: 'chest', after: 0.3, beats: [[0.5, 'smash']], plant: true },
  stake: { label: 'STAKED', cause: 'slash', mount: 'over', pose: 'smash', at: 'chest', after: 0.3, beats: [[0.45, 'smash']], plant: true },
  gun: { label: 'EXECUTION', cause: 'execute', mount: 'over', pose: 'headshot', at: 'head', after: 0.4, beats: [[0.55, 'shot']] },
};

// Where things are on a man lying on his back, px from his body's centre toward his head (his `downAngle`), and how
// the player comes to him: mount = s to get into place, astride / over = where he sets himself, side = [along,
// across] for the bat's swing, near = px within which a man down can be finished, aim = rad the cursor may be off
// him for a click to start it (further: the click is an ordinary attack on somebody else).
export const EXEC = { head: 24, chest: 9, mount: 0.16, astride: 5, over: -4, side: [15, 15], near: 34, aim: 1 };

// d: weapon definition, weapon: the one in hand (an empty gun is a club)
export function finisherFor(d, weapon) {
  if (d.kind === 'gun') return weapon?.mag > 0 ? FINISHERS.gun : FINISHERS.club;
  return FINISHERS[d.finisher || (d.hold === 'none' ? 'fists' : d.swing)] || FINISHERS.fists;
}

// Takedowns (a guard seized from behind, Player.takedownKind): action = the hint on screen, label = the score's
export const TAKEDOWNS = {
  neck: { action: 'BREAK NECK', label: 'NECK SNAP' },
  blade: { action: 'SLIT THROAT', label: 'THROAT CUT' },
  choke: { action: 'CHOKE OUT', label: 'CHOKED' },       // the cue across his throat
  club: { action: 'CRACK SKULL', label: 'SKULL CRACK' }, // bat, tire iron: one blow to the back of the head
};
