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
// him for a click to start it (further: the click is an ordinary attack on somebody else), rate = how fast the
// whole of a finisher is played, x the times written above (the user: 1.3 x faster than first written).
export const EXEC = { head: 24, chest: 9, mount: 0.16, astride: 5, over: -4, side: [15, 15], near: 34, aim: 1, rate: 1.3 };

// d: weapon definition, weapon: the one in hand (an empty gun is a club)
export function finisherFor(d, weapon) {
  if (d.kind === 'gun') return weapon?.mag > 0 ? FINISHERS.gun : FINISHERS.club;
  return FINISHERS[d.finisher || (d.hold === 'none' ? 'fists' : d.swing)] || FINISHERS.fists;
}

// Takedowns: a standing guard who has not seen us, seized from behind (Space right at his back, systems/Takedown.js
// `behind`), put down by what is in the hand (takedownFor). Played like a finisher (Player.updateTakedown, the clock
// is systems/Takedown.js `advance`): the player is locked in it, the beats = [wait s, what] land in order (the wait
// is the anticipation, the beat lands at its end), the last one kills, and he stays `after` s in the pose while the
// body (entities/Ragdoll.js) goes down its own way (`dying`). The poses: CharacterAnim takedownPose / heldPose.
//   grip   how he is held: 'neck' (an arm round his throat, the other hand on his head) | 'mouth' (the left hand
//          flat over his mouth, his head pulled back) | 'collar' (the left fist in the back of his collar) | 'cue'
//          (the cue across his throat in both hands) | none: not touched, struck from a step behind
//   gap    px between the two (centres) once set: pressed against his back, or a weapon's length behind him; lat =
//          px off to our right of the line of his back (our head beside his, not over it: he stays readable)
//   what   'seize' (the hands on him) | 'struggle' (he fights the grip, both shake) | 'twist' (the head wrenched
//          round) | 'draw' (the blade brought round under his chin) | 'cut' | 'windup' (the weapon raised) | 'nape' (a
//          blow on the back of his head) | 'muzzle' (the gun brought to his nape) | 'shot' (one round) | 'butt' (a long
//          gun turned round, its butt driven into the back of his head)
//   drop   index of the beat that puts him on his knees without killing him (he is shot on the way down)
//   cause  how fx/Gore.js takes the kill ('shot': the gun's own, Player.shotCause); wound: its profile when not the
//          weapon's; dying: how the body goes down (data/wounds.js KNEELS)
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
  pistol: { action: 'NAPE SHOT', label: 'EXECUTED', grip: 'collar', gap: 15, lat: 3, after: 0.5, cause: 'shot', dying: 'kneel', noise: 0,
    beats: [[0.14, 'seize'], [0.28, 'muzzle'], [0.06, 'shot']] },
  // ... no round left: the butt of it on his nape
  pistolDry: { action: 'PISTOL WHIP', label: 'PISTOL WHIPPED', grip: 'collar', gap: 14, lat: 3, after: 0.55, cause: 'melee', wound: 'crush', dying: 'kneel', noise: 90,
    beats: [[0.14, 'seize'], [0.26, 'windup'], [0.1, 'nape']] },
  // a long gun: the butt to the back of his head, he falls to his knees, a round into him as he goes down
  long: { action: 'PUT DOWN', label: 'PUT DOWN', gap: 17, lat: -2, after: 0.5, cause: 'shot', dying: 'kneel', drop: 0, noise: 90,
    beats: [[0.3, 'butt'], [0.34, 'shot']] },
  // ... no round left (or a launcher): a second butt stroke
  longDry: { action: 'BUTT STROKE', label: 'BUTT STROKED', gap: 17, lat: -2, after: 0.5, cause: 'melee', wound: 'crush', dying: 'kneel', drop: 0, noise: 110,
    beats: [[0.3, 'butt'], [0.36, 'butt']] },
};

// d: weapon definition, weapon: the one in hand (an empty gun, or a launcher, is struck with)
export function takedownFor(d, weapon) {
  if (d.kind === 'gun') {
    const loaded = weapon?.mag > 0 && !d.rocket;
    if (d.hold === 'two') return loaded ? TAKEDOWNS.long : TAKEDOWNS.longDry;
    return loaded ? TAKEDOWNS.pistol : TAKEDOWNS.pistolDry;
  }
  if (d.swing === 'blade') return TAKEDOWNS.blade;
  if (d.finisher === 'cue') return TAKEDOWNS.choke;
  return d.swing === 'club' ? TAKEDOWNS.club : TAKEDOWNS.neck;
}

// how a round of gun d is taken by fx/Gore.js at point blank (as Character.hit has it: buckshot that close tears)
export const shotCause = (d) => (d.pellets > 1 ? 'blast' : d.heavy ? 'heavy' : 'bullet');
