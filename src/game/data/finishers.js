// How the player finishes a guard, by what is in his hand (data only; entities/Player.js plays them, the animations
// are entities/CharacterAnim.js execPose).

// Ground finishers (a guard knocked down, on his back). Any attack on him (the left click) starts one, chosen by
// what is in the hand and by whether somebody is on the player (finisherChoice):
//   threatened (systems/Danger.js)  the QUICK KILL of the weapon's family: one decisive beat, then he is free
//   left alone                      one of the family's long executions, never the same twice in a row
// He sets himself by `mount`, the `beats` = [wait s, what, where] land in order (the wait is the anticipation, the
// beat lands at its end; where: left out, the entry's `at`), then he stays `after` s in the pose. The man DIES on the
// beat `kill` (left out: the last), early: the beats before it land on a man alive (he jerks), the ones after it on
// his body, and from the kill on the player can walk out of it at any moment (movement, right click, Space).
//   mount   'astride' kneeling on the man, facing his head | 'over' standing over him, a foot on his chest, facing
//           his head (on: px along him, EXEC's left out) | 'side' standing by his shoulder (the bat's swing) | 'beside'
//           standing by his hip, turning to whatever each beat strikes | 'here' where he stands, turned to it
//   pose    the animation (CharacterAnim execPose): 'gouge' (both hands on his head, the thumbs driven into his eyes,
//           the head beaten on the floor) | 'pound' (fist after fist, then the elbow dropped) | 'hair' (a fist in his
//           hair, the head lifted and beaten on the floor) | 'stomp' (the heel raised and driven down) | 'frenzy' (a
//           hand at his throat, the blade raised and driven in again and again; a thrust under the ribs, twisted and
//           torn out) | 'slit' (a hand on his brow, the blade drawn across his throat) | 'smash' (the weapon raised
//           over the head with both hands and brought down; point: held point down) | 'pile' (held upright in both
//           hands, its butt end driven straight down) | 'headshot' (the gun held on him at arm's length, fired);
//           none: the standing strikes
//   what    a strike gesture 0-3 (CharacterAnim) | 'windup' (the weapon brought back and held) | 'grab', 'press',
//           'slam' (gouge, hair) | 'punch', 'elbow' (pound) | 'stomp' | 'pin', 'stab', 'twist', 'rip' (frenzy) |
//           'cut', 'bleed' (slit) | 'smash' | 'pile' | 'aim' (the muzzle pressed on him), 'shot' | 'lean', 'hold'
//           (nothing lands: he bears down on what he planted, he stays on him)
//   where   'head' | 'throat' | 'chest' | 'belly' | 'knee0' | 'knee1' (EXEC.spots)
// label = what the score calls it; cause, wound = how the kill is taken by fx/Gore.js ('execute': the head gone at
// once); pulp = the beat that leaves nothing of his head (after the kill); plant = the beat on which the weapon goes
// through him and stays (a cue snaps and leaves its other half in the hand); snap = the beat that breaks the weapon
// over him; launch: the head flies off at that speed; flight = [scale, s] of slow motion once it is hit; rounds = the
// rounds it needs in the gun (a gun run dry drops the rounds it still had to fire into the body); back = px he steps
// back on each beat after the kill (walking off); quick: a quick kill.
const rep = (wait, what, n) => Array.from({ length: n }, () => [wait, what]);
export const FINISHERS = {
  // ---- bare hands
  fists: { label: 'EYES OUT', cause: 'melee', wound: 'crush', mount: 'astride', pose: 'gouge', at: 'head', kill: 1, pulp: 4, after: 0.36,
    beats: [[0.14, 'grab'], [0.16, 'press'], [0.2, 'press'], [0.2, 'press'], [0.34, 'slam']] },
  pound: { label: 'BEATEN TO DEATH', cause: 'melee', wound: 'crush', mount: 'astride', pose: 'pound', at: 'head', kill: 2, pulp: 6, after: 0.34,
    beats: [[0.14, 'punch'], ...rep(0.12, 'punch', 5), [0.4, 'elbow']] },
  curb: { label: 'CURB STOMP', cause: 'melee', wound: 'crush', mount: 'over', on: 9, pose: 'stomp', at: 'head', kill: 0, pulp: 2, after: 0.36,
    beats: [[0.3, 'stomp'], [0.34, 'stomp'], [0.4, 'stomp']] },
  slam: { label: 'HEAD SLAM', cause: 'melee', wound: 'crush', mount: 'astride', pose: 'hair', at: 'head', kill: 1, pulp: 4, after: 0.32,
    beats: [[0.14, 'grab'], [0.18, 'slam'], [0.26, 'slam'], [0.26, 'slam'], [0.34, 'slam']] },
  heel: { quick: true, label: 'QUICK KILL', cause: 'melee', wound: 'crush', mount: 'over', on: 9, pose: 'stomp', at: 'head', after: 0.14,
    beats: [[0.2, 'stomp']] },
  // ---- a blade
  blade: { label: 'BUTCHERED', cause: 'slash', wound: 'slash', mount: 'astride', pose: 'frenzy', at: 'chest', kill: 1, after: 0.35,
    beats: [[0.14, 'pin'], [0.14, 'stab'], ...rep(0.13, 'stab', 5), [0.3, 'stab']] },
  slit: { label: 'THROAT CUT', cause: 'slash', wound: 'throat', mount: 'astride', pose: 'slit', at: 'throat', kill: 1, after: 0.4,
    beats: [[0.14, 'pin'], [0.18, 'cut'], [0.75, 'bleed']] },
  gut: { label: 'GUTTED', cause: 'slash', wound: 'stab', mount: 'astride', on: 0, pose: 'frenzy', at: 'belly', kill: 1, after: 0.36,
    beats: [[0.14, 'pin'], [0.16, 'stab'], [0.5, 'twist'], [0.3, 'rip']] },
  throat: { quick: true, label: 'QUICK KILL', cause: 'slash', wound: 'throat', mount: 'over', on: 4, pose: 'smash', point: true, at: 'throat', after: 0.14,
    beats: [[0.2, 'smash']] },
  // ---- a club (a tire iron, an empty gun; a bat has the home run too)
  club: { label: 'SKULL CRUSH', cause: 'melee', wound: 'crush', mount: 'over', pose: 'smash', at: 'head', kill: 0, pulp: 3, after: 0.3,
    beats: [[0.3, 'smash'], [0.34, 'smash'], [0.34, 'smash'], [0.4, 'smash']] },
  // the head is sent off like a ball, and the slow motion lets it be seen going
  bat: { label: 'HOME RUN', cause: 'melee', wound: 'blunt', mount: 'side', at: 'head', kill: 1, after: 0.45, launch: 3.2, flight: [0.25, 0.9],
    beats: [[0.3, 'windup'], [0.12, 0]] },
  knee: { label: 'KNEECAPPED', cause: 'melee', wound: 'crush', mount: 'beside', pose: 'smash', at: 'head', kill: 1, pulp: 3, after: 0.3,
    beats: [[0.22, 'smash', 'knee0'], [0.26, 'smash'], [0.34, 'smash'], [0.4, 'smash']] },
  pile: { label: 'PILEDRIVER', cause: 'melee', wound: 'crush', mount: 'over', on: 6, pose: 'pile', at: 'head', kill: 0, pulp: 3, after: 0.3,
    beats: [[0.28, 'pile'], [0.26, 'pile'], [0.26, 'pile'], [0.36, 'pile']] },
  crack: { quick: true, label: 'QUICK KILL', cause: 'melee', wound: 'crush', mount: 'over', pose: 'smash', at: 'head', after: 0.14,
    beats: [[0.2, 'smash']] },
  golf: { quick: true, label: 'QUICK KILL', cause: 'melee', wound: 'blunt', mount: 'side', at: 'head', kill: 1, after: 0.14, launch: 2.2,
    beats: [[0.1, 'windup'], [0.1, 0]] },
  butt: { quick: true, label: 'QUICK KILL', cause: 'melee', wound: 'crush', mount: 'over', on: 6, pose: 'pile', at: 'head', after: 0.14,
    beats: [[0.2, 'pile']] },
  // ---- a cue, a stake: through him
  cue: { label: 'IMPALED', cause: 'slash', wound: 'slash', mount: 'over', pose: 'smash', at: 'chest', kill: 0, plant: 0, after: 0.4,
    beats: [[0.32, 'smash'], [0.7, 'lean']] },
  // broken over his head, and what is left of it planted in him
  snap: { label: 'SNAPPED IN TWO', cause: 'melee', wound: 'blunt', mount: 'over', pose: 'smash', at: 'chest', kill: 0, snap: 0, plant: 1, after: 0.4,
    beats: [[0.3, 'smash', 'head'], [0.44, 'smash'], [0.4, 'lean']] },
  stake: { label: 'STAKED', cause: 'slash', wound: 'slash', mount: 'over', pose: 'smash', at: 'chest', kill: 0, plant: 0, after: 0.4,
    beats: [[0.3, 'smash'], [0.7, 'lean']] },
  plant: { quick: true, label: 'QUICK KILL', cause: 'slash', wound: 'slash', mount: 'over', pose: 'smash', at: 'chest', plant: 0, after: 0.14,
    beats: [[0.2, 'smash']] },
  // ---- a gun with rounds in it
  gun: { label: 'BETWEEN THE EYES', cause: 'execute', mount: 'over', pose: 'headshot', at: 'head', kill: 1, after: 0.4,
    beats: [[0.3, 'aim'], [0.08, 'shot'], [0.6, 'hold']] },
  // the user's own: a round into each knee, then one into the head
  knees: { label: 'KNEES AND HEAD', cause: 'execute', mount: 'beside', pose: 'headshot', at: 'head', kill: 2, rounds: 3, after: 0.35,
    beats: [[0.16, 'shot', 'knee0'], [0.12, 'shot', 'knee1'], [0.18, 'shot'], [0.55, 'hold']] },
  // one in the head, the rest of the magazine into him, walking off
  dump: { label: 'MAG DUMP', cause: 'execute', mount: 'over', pose: 'headshot', at: 'chest', kill: 0, rounds: 3, back: 2.5, after: 0.5,
    beats: [[0.22, 'shot', 'head'], ...rep(0.12, 'shot', 6)] },
  tap: { quick: true, label: 'QUICK KILL', cause: 'execute', mount: 'here', pose: 'headshot', at: 'head', kill: 0, after: 0.12,
    beats: [[0.1, 'shot'], [0.09, 'shot']] },
};

// What each family of weapons does to a man down: its quick kill and its long executions (FINISHERS keys; the first
// one is the family's own, finisherFor).
export const EXECUTIONS = {
  fists: { quick: 'heel', long: ['fists', 'pound', 'curb', 'slam'] },
  blade: { quick: 'throat', long: ['blade', 'slit', 'gut'] },
  club: { quick: 'crack', long: ['club', 'knee', 'pile'] },
  bat: { quick: 'golf', long: ['bat', 'club', 'knee', 'pile'] },
  butt: { quick: 'butt', long: ['club', 'knee', 'pile'] },   // a gun with nothing in it
  cue: { quick: 'plant', long: ['cue', 'snap'] },
  stake: { quick: 'plant', long: ['stake'] },
  gun: { quick: 'tap', long: ['gun', 'knees', 'dump'] },
};

// Where things are on a man lying on his back, and how the player comes to him. spots: [px from his body's centre
// toward his head (his `downAngle`), px across to his left] of what a beat strikes; mount / quickMount = s to get
// into place (a quick kill wastes none); astride / over = where he sets himself along the man, side = [along,
// across] for the bat's swing, beside = the same by his hip; near = px within which a man down can be finished,
// aim = rad the cursor may be off him for a click to start it (further: the click is an ordinary attack on somebody
// else), rate = how fast the whole of a finisher is played, x the times written above (the user: 1.3 x faster than
// first written); blend = s the pose takes to let go when he walks out of it; jerk = momentum (kg px/step) a beat
// gives the part of the body it lands on: [his head or a leg, his torso].
export const EXEC = {
  spots: { head: [24, 0], throat: [19, 0], chest: [9, 0], belly: [3, 0], knee0: [-10, 3.5], knee1: [-10, -3.5] },
  mount: 0.16, quickMount: 0.05, astride: 5, over: -4, side: [15, 15], beside: [6, 15], near: 34, aim: 1, rate: 1.3, blend: 0.12,
  jerk: [5, 12],
};

// the beat a man dies on
export const killBeat = (f) => f.kill ?? f.beats.length - 1;
// s (real) from the start until he is dead, and until the player is let go if he watches it all
const span = (f, n) => ((f.quick ? EXEC.quickMount : EXEC.mount) + f.beats.slice(0, n).reduce((s, [wait]) => s + wait, 0)) / EXEC.rate;
export const killTime = (f) => span(f, killBeat(f) + 1); // (kept for the tests)
export const lockTime = (f) => span(f, f.beats.length) + f.after / EXEC.rate;

// the family of the weapon in hand (EXECUTIONS key). d: weapon definition, weapon: the one in hand (an empty gun, or
// a launcher, is struck with)
export function finisherFamily(d, weapon) {
  if (d.kind === 'gun') return weapon?.mag > 0 && !d.rocket ? 'gun' : 'butt';
  const k = d.finisher || (d.hold === 'none' ? 'fists' : d.swing);
  return EXECUTIONS[k] ? k : 'fists';
}

// the family's own execution, whatever goes on around
// (kept for the tests: the game picks with finisherChoice)
export const finisherFor = (d, weapon) => FINISHERS[EXECUTIONS[finisherFamily(d, weapon)].long[0]];

// One of `names` (keys of table T: FINISHERS, TAKEDOWNS) that the weapon in hand can do (enough rounds, something to
// snap), never `last` again when there is another. rnd: 0..1
export function pickVariant(T, names, d, weapon, last, rnd = Math.random) {
  const can = names.map((n) => T[n]).filter((f) => (f.rounds ?? 0) <= (weapon?.mag ?? 0) && (f.snap === undefined || d.snaps));
  const pool = can.length > 1 ? can.filter((f) => f !== last) : can;
  return pool[Math.min(pool.length - 1, Math.floor(rnd() * pool.length))] || T[names[0]];
}

// What the player does to a man down. { d, weapon, threatened (systems/Danger.js), last (the long one he did last),
// rnd }
export function finisherChoice({ d, weapon, threatened, last, rnd }) {
  const fam = EXECUTIONS[finisherFamily(d, weapon)];
  return threatened ? FINISHERS[fam.quick] : pickVariant(FINISHERS, fam.long, d, weapon, last, rnd);
}

// What counts as somebody being on the player (systems/Danger.js `threatened`): a guard who is after him and has a
// line to him within `sight` px; a round that passed within `whiz` px of him or struck within `strike` px, less than
// `fire` s ago; the squad on alert with a guard within `close` px, line or not.
export const THREAT = { sight: 420, fire: 1.5, whiz: 60, strike: 70, close: 190 };

// Takedowns: a standing guard who has not seen us, seized from behind (left click right at his back, systems/Takedown.js
// `behind`; never once we are spotted: `unspotted`), put down by what is in the hand (takedownFor). Played like a finisher (Player.updateTakedown, the clock
// is systems/Takedown.js `advance`): the player is locked in it, the beats = [wait s, what] land in order (the wait
// is the anticipation, the beat lands at its end), the last one kills, and he stays `after` s in the pose while the
// body (entities/Ragdoll.js) goes down its own way (`dying`). The poses: CharacterAnim takedownPose / heldPose.
//   grip   how he is held: 'neck' (an arm round his throat, the other hand on his head) | 'mouth' (the left hand
//          flat over his mouth, his head pulled back) | 'collar' (the left fist in the back of his collar) | 'cue'
//          (the cue across his throat in both hands) | 'hair' (the left fist in his hair: his head is driven into
//          what stands in front of him) | none: not touched, struck from a step behind
//   gap    px between the two (centres) once set: pressed against his back, or a weapon's length behind him; lat =
//          px off to our right of the line of his back (our head beside his, not over it: he stays readable)
//   what   'seize' (the hands on him) | 'struggle' (he fights the grip, both shake) | 'twist' (the head wrenched
//          round) | 'draw' (the blade brought round under his chin) | 'cut' | 'windup' (the weapon raised) | 'nape' (a
//          blow on the back of his head) | 'muzzle' (the gun brought to his nape) | 'shot' (one round) | 'butt' (a long
//          gun turned round, its butt driven into the back of his head) | and the variants' own: 'limp' (he goes
//          slack in the arm round his neck and is let down) | 'knee' (our knee into the back of his head, once he
//          has folded) | 'stab' (the blade driven in), 'wrench' (turned in the wound) | 'kneeHit' (a club swung low
//          into the back of his knee) | 'kneeShot' (a round into the back of a knee) | 'backShot' (a round into
//          his back) | face to face: 'headbutt', 'throat' (a fist in it), 'sweep' (his legs swept, he goes over), 'temple'
//          (a club across it) | 'smash', 'dunk' (his head driven into what is in front of him: a wall, an edge, a toilet bowl)
//   pose   the variant's own animation where the grip's does not do (CharacterAnim variantPose)
//   rounds the rounds it needs in the gun; limp: he dies without a crack (choked out)
//   drop   index of the beat that puts him on his knees without killing him (he is shot on the way down)
//   cause  how fx/Gore.js takes the kill ('shot': the gun's own, Player.shotCause); wound: its profile when not the
//          weapon's; dying: how the body goes down (data/wounds.js KNEELS; 'wall': sat against the wall, Ragdoll.propUp)
//   noise  px the guards hear the blows at (ai/Director.js; a round is heard as the gun's own `noise`, a body let
//          down as AI.bodyFallRadius x 0.4)
// action = the hint on screen, label = what the score calls it.
export const TAKEDOWNS = {
  // fists: an arm round his neck, a beat of struggle, the twist; he goes limp and is lowered
  neck: { action: 'BREAK NECK', label: 'NECK SNAP', grip: 'neck', gap: 11, lat: 7, after: 0.5, cause: 'snap', dying: 'slump', noise: 40,
    beats: [[0.14, 'seize'], [0.36, 'struggle'], [0.16, 'twist']] },
  // a blade: the hand over his mouth, the throat opened; he sags clutching it and falls forward
  blade: { action: 'SLIT THROAT', label: 'THROAT CUT', grip: 'mouth', gap: 11, lat: 6, after: 0.45, cause: 'slash', dying: 'throat', noise: 0,
    beats: [[0.14, 'seize'], [0.24, 'draw'], [0.12, 'cut']] },
  // the cue across his throat, pulled back until it is over
  choke: { action: 'CHOKE OUT', label: 'CHOKED', grip: 'cue', gap: 11, lat: 2, after: 0.5, cause: 'snap', dying: 'slump', noise: 30,
    beats: [[0.16, 'seize'], [0.5, 'struggle'], [0.2, 'twist']] },
  // a club: one heavy blow to the nape; he drops straight onto his knees, then onto his face
  club: { action: 'CRACK SKULL', label: 'SKULL CRACK', gap: 15, lat: 2, after: 0.55, cause: 'melee', wound: 'crush', dying: 'kneel', noise: 110,
    beats: [[0.34, 'windup'], [0.1, 'nape']] },
  // a handgun: his collar in the fist, the muzzle to his nape, one round; he pitches forward
  // (the muzzle held on him a breath before it goes off)
  pistol: { action: 'NAPE SHOT', label: 'EXECUTED', grip: 'collar', gap: 15, lat: 3, after: 0.5, cause: 'shot', dying: 'kneel', noise: 0,
    beats: [[0.14, 'seize'], [0.4, 'muzzle'], [0.06, 'shot']] },
  // ... no round left: the butt of it on his nape
  pistolDry: { action: 'PISTOL WHIP', label: 'PISTOL WHIPPED', grip: 'collar', gap: 14, lat: 3, after: 0.55, cause: 'melee', wound: 'crush', dying: 'kneel', noise: 90,
    beats: [[0.14, 'seize'], [0.26, 'windup'], [0.1, 'nape']] },
  // a long gun: the butt to the back of his head, he falls to his knees, a round into him as he goes down
  long: { action: 'PUT DOWN', label: 'PUT DOWN', gap: 17, lat: -2, after: 0.5, cause: 'shot', dying: 'kneel', drop: 0, noise: 90,
    beats: [[0.3, 'butt'], [0.34, 'shot']] },
  // ... no round left (or a launcher): a second butt stroke
  longDry: { action: 'BUTT STROKE', label: 'BUTT STROKED', gap: 17, lat: -2, after: 0.5, cause: 'melee', wound: 'crush', dying: 'kneel', drop: 0, noise: 110,
    beats: [[0.3, 'butt'], [0.36, 'butt']] },
  // ---- the variants (TAKEDOWN_VARIANTS): never the same twice in a row
  // fists: the arm round his neck until he goes slack, and he is let down onto his knees
  sleeper: { action: 'SLEEPER HOLD', label: 'PUT TO SLEEP', grip: 'neck', pose: 'sleeper', gap: 11, lat: 7, after: 0.45, cause: 'snap', limp: true, dying: 'slump', noise: 20,
    beats: [[0.14, 'seize'], [0.6, 'struggle'], [0.2, 'limp']] },
  // fists: a fist on his nape, he folds onto his knees, our knee into the back of his head
  rabbit: { action: 'RABBIT PUNCH', label: 'KNEED DOWN', pose: 'rabbit', gap: 14, lat: 2, after: 0.5, cause: 'melee', wound: 'crush', dying: 'kneel', drop: 1, noise: 70,
    beats: [[0.2, 'windup'], [0.1, 'nape'], [0.3, 'knee']] },
  // a blade: the hand over his mouth, the blade in under his ribs and turned there
  kidney: { action: 'GUT', label: 'GUTTED', grip: 'mouth', pose: 'kidney', gap: 11, lat: 6, after: 0.45, cause: 'slash', wound: 'stab', dying: 'slump', noise: 0,
    beats: [[0.14, 'seize'], [0.2, 'stab'], [0.32, 'wrench']] },
  // a blade: his head pulled aside, the blade raised point down and driven into his neck
  spike: { action: 'STAB NECK', label: 'NECK STAB', grip: 'mouth', pose: 'spike', gap: 11, lat: 6, after: 0.5, cause: 'slash', wound: 'throat', dying: 'throat', noise: 0,
    beats: [[0.14, 'seize'], [0.26, 'windup'], [0.1, 'stab']] },
  // a club: low into the back of his knee, he kneels, then his head
  hobble: { action: 'HOBBLE', label: 'HOBBLED', pose: 'low', gap: 15, lat: 2, after: 0.5, cause: 'melee', wound: 'crush', dying: 'kneel', drop: 0, noise: 110,
    beats: [[0.26, 'kneeHit'], [0.3, 'windup'], [0.1, 'nape']] },
  // the cue: the back of his knee, then over his head and across his throat
  kneeChoke: { action: 'BRING DOWN', label: 'BROUGHT DOWN', grip: 'cue', pose: 'low', gap: 11, lat: 2, after: 0.45, cause: 'snap', dying: 'slump', drop: 0, noise: 60,
    beats: [[0.24, 'kneeHit'], [0.14, 'seize'], [0.3, 'struggle'], [0.18, 'twist']] },
  // a handgun, the user's own: a round into the back of each knee, he drops onto them, one into his head
  kneecap: { action: 'KNEECAP', label: 'KNEES AND HEAD', pose: 'pistol', gap: 16, lat: 3, after: 0.5, cause: 'shot', dying: 'kneel', drop: 0, rounds: 3, noise: 0,
    beats: [[0.2, 'kneeShot'], [0.14, 'kneeShot'], [0.24, 'muzzle'], [0.06, 'shot']] },
  // a handgun: his collar in the fist, one round into his back, one into his head
  double: { action: 'TWO ROUNDS', label: 'DOUBLE TAP', grip: 'collar', pose: 'double', gap: 15, lat: 3, after: 0.5, cause: 'shot', dying: 'kneel', rounds: 2, noise: 0,
    beats: [[0.14, 'seize'], [0.22, 'muzzle'], [0.06, 'backShot'], [0.2, 'shot']] },

  // With a hand free (freeHand) and something in front of him to drive his head into (systems/TakedownSpot.js, the
  // `context` = the spot's kind): grip 'hair', the left fist in his hair, the other hand on his collar (or out of it,
  // a weapon in it). He is pulled to `stand` px off the surface (his centre), facing it; every 'smash' / 'dunk' is a
  // pull back by the hair (the anticipation) and the head driven `into` px past the surface (where the blood flies),
  // a 'struggle' after one is his head held in it. lunge = [px we go in with a blow, px we are drawn back with the
  // pull]. The poses: CharacterAnim heldPose / takedownPose ('hair', SLAM).
  // the toilet: forced onto his knees, his head dunked into the bowl, held under, dunked again; he stays folded over it
  bowl: { context: 'bowl', action: 'TOILET', label: 'TOILET DUNK', grip: 'hair', gap: 13, lat: 7, lunge: [4, 3], stand: 12, into: 6, after: 0.55,
    cause: 'melee', wound: 'crush', dying: 'bowl', noise: 70,
    beats: [[0.15, 'seize'], [0.24, 'struggle'], [0.3, 'dunk'], [0.22, 'struggle'], [0.26, 'dunk']] },
  // a urinal: his face smashed into the porcelain on the wall, twice; he sinks onto his knees under it
  urinal: { context: 'urinal', action: 'URINAL', label: 'URINAL SMASH', grip: 'hair', gap: 13, lat: 7, lunge: [4, 3], stand: 11, into: 2, after: 0.5,
    cause: 'melee', wound: 'crush', dying: 'bowl', noise: 90,
    beats: [[0.15, 'seize'], [0.22, 'struggle'], [0.3, 'smash'], [0.28, 'smash']] },
  // a sink: his face brought down on its edge, twice; he is left folded over it
  sink: { context: 'sink', action: 'SINK', label: 'SINK SMASH', grip: 'hair', gap: 13, lat: 7, lunge: [4, 3], stand: 11, into: 3, after: 0.5,
    cause: 'melee', wound: 'crush', dying: 'ledge', noise: 100,
    beats: [[0.15, 'seize'], [0.32, 'smash'], [0.3, 'smash']] },
  // a table, a counter, a crate (anything at his waist): his face slammed down on the edge, twice; he is left folded
  // over it, or sat against something low (SLAMS `rest`)
  ledge: { context: 'ledge', action: 'SLAM ON {ON}', label: 'HEAD SLAM', grip: 'hair', gap: 13, lat: 7, lunge: [4, 3], stand: 10, into: 4, after: 0.5,
    cause: 'melee', wound: 'crush', dying: 'ledge', noise: 100,
    beats: [[0.15, 'seize'], [0.36, 'smash'], [0.32, 'smash']] },
  // a wall: his face smashed into it, twice; he slumps down it and stays sat against it
  wall: { context: 'wall', action: 'WALL SMASH', label: 'WALL SMASH', grip: 'hair', gap: 13, lat: 7, lunge: [4, 3], stand: 11, into: 0, after: 0.55,
    cause: 'melee', wound: 'crush', dying: 'wall', noise: 100,
    beats: [[0.15, 'seize'], [0.3, 'smash'], [0.28, 'smash']] },
  // ---- face to face (TAKEDOWN_FRONT): a guard who has not made us out, come at from the front. No `dying`: he is
  // thrown back like any man killed; `front`: we stand before him, he is turned to us
  // fists: his shoulders taken, our brow into his face, he folds, his head brought down on the knee
  headbutt: { front: true, action: 'HEADBUTT', label: 'HEADBUTT', pose: 'headbutt', gap: 13, lat: 0, after: 0.5, cause: 'melee', wound: 'crush', drop: 1, noise: 60,
    beats: [[0.14, 'seize'], [0.2, 'headbutt'], [0.3, 'knee']] },
  // fists: a fist in his throat, then his legs swept from under him
  throatPunch: { front: true, action: 'THROAT PUNCH', label: 'SWEPT', pose: 'throat', gap: 16, lat: 0, after: 0.5, cause: 'melee', wound: 'crush', noise: 50,
    beats: [[0.18, 'windup'], [0.1, 'throat'], [0.34, 'sweep']] },
  // a blade: a hand on his shoulder, the blade in under his ribs and turned there
  faceStab: { front: true, action: 'STAB', label: 'FACE TO FACE', pose: 'kidney', gap: 14, lat: 0, after: 0.45, cause: 'slash', wound: 'stab', noise: 0,
    beats: [[0.14, 'seize'], [0.2, 'stab'], [0.32, 'wrench']] },
  // a gun with a round in it: his collar taken, the muzzle up under his chin
  chin: { front: true, action: 'UNDER THE CHIN', label: 'UNDER THE CHIN', pose: 'chin', gap: 17, lat: 0, after: 0.5, cause: 'shot', noise: 0,
    beats: [[0.14, 'seize'], [0.34, 'muzzle'], [0.06, 'shot']] },
  // a club, the cue, a gun with nothing in it: one blow across his temple
  temple: { front: true, action: 'CRACK TEMPLE', label: 'TEMPLE', pose: 'temple', gap: 18, lat: 0, after: 0.55, cause: 'melee', wound: 'crush', noise: 110,
    beats: [[0.3, 'windup'], [0.1, 'temple']] },
};

// the takedowns each weapon's own one (takedownFor: a TAKEDOWNS key) is drawn from: from behind, and face to face
export const TAKEDOWN_VARIANTS = {
  neck: ['neck', 'sleeper', 'rabbit'], blade: ['blade', 'kidney', 'spike'], club: ['club', 'hobble'], choke: ['choke', 'kneeChoke'],
  pistol: ['pistol', 'kneecap', 'double'],
};
export const TAKEDOWN_FRONT = {
  neck: ['headbutt', 'throatPunch'], blade: ['faceStab'], club: ['temple'], choke: ['temple'], pistol: ['chin'], pistolDry: ['temple'], long: ['chin'],
  longDry: ['temple'],
};

// What a head can be slammed on, by prop type (systems/TakedownSpot.js): the move it takes (a TAKEDOWNS `context`)
// and, for a ledge, the name the hint gives it. Only what stands about waist high is a ledge. rest: how the dead man
// stays against it: folded over its top on his knees (the move's `dying`), or, something low, 'sit': slid down to sit
// on the floor, his back against its side (Ragdoll.sitAgainst).
const ledge = (name, rest) => ({ kind: 'ledge', name, rest });
export const SLAMS = {
  toilet: { kind: 'bowl' }, urinal: { kind: 'urinal' }, sink: { kind: 'sink' },
  table: ledge('TABLE'), table_round: ledge('TABLE'), card_table: ledge('TABLE'), dope_table: ledge('TABLE'),
  pool_table: ledge('POOL TABLE'), desk: ledge('DESK'), bar_counter: ledge('BAR'), dj_booth: ledge('DECKS'),
  crate: ledge('CRATE', 'sit'), keg: ledge('KEG', 'sit'), washer: ledge('WASHER'), oven: ledge('STOVE'),
};

// what a head driven into it sounds like (placeholders, assets/sound/PLACEHOLDERS.md): by the spot's kind, else by
// what the prop is made of
export const SLAM_SOUND = {
  wall: 'headSlamWall', bowl: 'toiletDunk', wood: 'headSlamWood', metal: 'headSlamMetal', ceramic: 'headSlamPorcelain', plastic: 'headSlamWood',
};

// How the spot is looked for in front of him (systems/TakedownSpot.js): rays from his centre along `fan` = [rad off
// his facing, x the reach] (straight ahead, then a little to his sides, shorter); reach = px from his centre to the
// surface by kind (a toilet or a urinal ~0.8 m, a sink or a ledge ~0.9 m, a wall ~0.7 m); order = the most specific
// first.
export const SPOT = {
  fan: [[0, 1], [0.3, 1], [-0.3, 1], [0.6, 0.85], [-0.6, 0.85]],
  reach: { bowl: 26, urinal: 26, sink: 29, ledge: 29, wall: 22 },
  order: ['bowl', 'urinal', 'sink', 'ledge', 'wall'],
};

// Whether weapon d leaves a hand free to take a man by the hair: bare hands, a handgun, a blade, a short club
// (`short`); a long gun, a bat or a cue keeps both hands busy (and the takedown by the weapon)
export const freeHand = (d) => d.hold === 'none' || (d.kind === 'gun' ? d.hold !== 'two' : d.swing === 'blade' || !!d.short);

// the hint of takedown f (a ledge's names the furniture: SLAM ON BAR)
export const hintOf = (f, spot) => f.action.replace('{ON}', spot?.name || 'TABLE');

// d: weapon definition, weapon: the one in hand (an empty gun, or a launcher, is struck with); spot: what stands in
// front of him (systems/TakedownSpot.js), taken when a hand is free for it
export function takedownFor(d, weapon, spot = null) {
  if (spot && freeHand(d)) return TAKEDOWNS[spot.kind];
  if (d.kind === 'gun') {
    const loaded = weapon?.mag > 0 && !d.rocket;
    if (d.hold === 'two') return loaded ? TAKEDOWNS.long : TAKEDOWNS.longDry;
    return loaded ? TAKEDOWNS.pistol : TAKEDOWNS.pistolDry;
  }
  if (d.swing === 'blade') return TAKEDOWNS.blade;
  if (d.finisher === 'cue') return TAKEDOWNS.choke;
  return d.swing === 'club' ? TAKEDOWNS.club : TAKEDOWNS.neck;
}

// What the player does to the guard he has within reach: with a hand free, the move of what stands by him (spot:
// systems/TakedownSpot.js), which wins; else one of the variants of his weapon's takedown, from behind or face to
// face (front), not `last` again when there is another. { d, weapon, last, rnd, spot, front }
export function takedownChoice({ d, weapon, last, rnd, spot, front }) {
  if (spot && freeHand(d)) return TAKEDOWNS[spot.kind];
  const own = takedownFor(d, weapon), names = (front ? TAKEDOWN_FRONT : TAKEDOWN_VARIANTS)[Object.keys(TAKEDOWNS).find((k) => TAKEDOWNS[k] === own)];
  return names ? pickVariant(TAKEDOWNS, names, d, weapon, last, rnd) : own;
}

// how a round of gun d is taken by fx/Gore.js at point blank (as Character.hit has it: buckshot that close tears)
export const shotCause = (d) => (d.pellets > 1 ? 'blast' : d.heavy ? 'heavy' : 'bullet');
