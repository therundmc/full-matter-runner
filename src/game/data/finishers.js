// How the player finishes a guard, by what is in his hand (data only; entities/Player.js plays them).

// Ground finishers (a guard knocked down): `beats` = [wait s, what] played in order, the last one kills. what: a
// strike gesture (0 forehand, 1 backhand, 2 smash / stab, 3 spin or overhead stab: CharacterAnim), 'windup' (no
// blow: the weapon brought back and held), 'stomp', 'shot'. label = what the score calls it; cause = how the body
// is left ('execute': the head pulped on the floor, 'slash': opened, 'melee': knocked off whole);
// plant: the weapon goes through him and stays (a cue snaps and leaves its other half in the hand);
// launch: the head flies off at that speed; slowmo: [scale, s] when the windup is let go.
export const FINISHERS = {
  fists: { label: 'BEATDOWN', cause: 'execute', beats: [[0.22, 0], [0.2, 0], [0.2, 0], [0.34, 'stomp']] },
  bat: { label: 'HOME RUN', cause: 'melee', beats: [[0.5, 'windup'], [0.12, 0]], launch: 3.2, slowmo: [0.3, 0.5] },
  club: { label: 'SKULL CRUSH', cause: 'execute', beats: [[0.26, 2], [0.26, 2], [0.3, 2]] },
  blade: { label: 'GUTTED', cause: 'slash', beats: [[0.14, 2], [0.14, 2], [0.14, 2], [0.3, 1]] },
  cue: { label: 'IMPALED', cause: 'slash', beats: [[0.4, 2]], plant: true },
  stake: { label: 'STAKED', cause: 'slash', beats: [[0.36, 2]], plant: true },
  gun: { label: 'EXECUTION', cause: 'execute', beats: [[0.22, 'shot']] },
  doubleTap: { label: 'DOUBLE TAP', cause: 'execute', beats: [[0.2, 'shot'], [0.16, 'shot']] },
};

// d: weapon definition, weapon: the one in hand (a gun with two rounds left fires twice)
export function finisherFor(d, weapon) {
  if (d.kind === 'gun') return FINISHERS[weapon?.mag >= 2 && d.pellets === 1 && !d.rocket ? 'doubleTap' : 'gun'];
  return FINISHERS[d.finisher || (d.hold === 'none' ? 'fists' : d.swing)] || FINISHERS.fists;
}

// Takedowns (a guard seized from behind, Player.takedownKind): action = the hint on screen, label = the score's
export const TAKEDOWNS = {
  neck: { action: 'BREAK NECK', label: 'NECK SNAP' },
  blade: { action: 'SLIT THROAT', label: 'THROAT CUT' },
  choke: { action: 'CHOKE OUT', label: 'CHOKED' },       // the cue across his throat
  club: { action: 'CRACK SKULL', label: 'SKULL CRACK' }, // bat, tire iron: one blow to the back of the head
};
