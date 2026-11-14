// How the player finishes a guard, by what is in his hand (data only; entities/Player.js plays them).

// Ground finishers (a guard knocked down): `hits` blows `every` s apart; label = what the score calls it;
// cause = how the body is left ('execute': the head pulped on the floor, 'slash': opened);
// plant: the weapon goes through him and snaps (its `snaps`), one half left in the body.
export const FINISHERS = {
  fists: { hits: 3, every: 0.24, label: 'BEATDOWN', cause: 'execute' },
  club: { hits: 2, every: 0.3, label: 'SKULL CRUSH', cause: 'execute' },
  blade: { hits: 3, every: 0.15, label: 'GUTTED', cause: 'slash' },
  cue: { hits: 1, every: 0.34, label: 'IMPALED', cause: 'slash', plant: true },
  gun: { hits: 1, every: 0.22, label: 'EXECUTION', cause: 'execute' },
};

// d: weapon definition
export function finisherFor(d) {
  return FINISHERS[d.kind === 'gun' ? 'gun' : d.finisher || (d.hold === 'none' ? 'fists' : d.swing)] || FINISHERS.fists;
}

// Takedowns (a guard seized from behind, Player.takedownKind): action = the hint on screen, label = the score's
export const TAKEDOWNS = {
  neck: { action: 'BREAK NECK', label: 'NECK SNAP' },
  blade: { action: 'SLIT THROAT', label: 'THROAT CUT' },
  choke: { action: 'CHOKE OUT', label: 'CHOKED' },       // the cue across his throat
  club: { action: 'CRACK SKULL', label: 'SKULL CRACK' }, // bat, tire iron: one blow to the back of the head
};
