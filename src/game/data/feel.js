// How hard a fight hits the eye and the screen: one entry per weapon family, plus the moments that are not a weapon
// (finishers, takedowns, the slide, a weapon breaking, the last guard of a room). Data only: fx/Impact.js applies it,
// fx/CombatFx.js draws it, entities read the gestures' timings.
//
// A weapon's family comes from its data, never its name (familyOf). Per family:
//   kind     what the 'blow' event calls it: 'punch' | 'blunt' | 'cut' | 'bullet'
//   power    [lands, kills] 0..1, handed to the post-processing pass with the 'blow' event
//   stop     [lands, kills] s of hit-stop when the player's blow or round lands
//   shake    [lands, kills] camera trauma added then
//   push     [lands, kills] px the camera is kicked along the blow
//   flash    s the victim's silhouette shows white, on the real clock (0.025: two frames at 60 Hz, 0.042: three)
//   shove    px the white silhouette of a killed man is carried along the blow while it shows, squash: how much it
//            is flattened along the blow (a club folds him), twist: rad it turns (a blade makes him turn in on it)
//   burst    the star at the point of contact: rays, len (px), width (px), life (s, real clock), shape 'star' |
//            'slash' | 'pop' (tint: 'r,g,b', else the shape's own)
// melee only:
//   smear    the trail the weapon leaves through its stroke: life (s a point of it lasts), width (px at the tip),
//            alpha; 0 = none
//   tell     s a guard holds his wind-up before the blow comes (the player's cue to get out of the way)
// guns only:
//   fire     camera on the player's own shot: shake, push (px back along the barrel)
//   muzzle   the flash: shape 'star' | 'burst' | 'puff' | 'tongue' | 'spear' | 'brake' | 'blast', len and wide (px),
//            dur (s on the real clock: 0.01 one frame, 0.025 two), light (px radius of the transient light that shows
//            the shooter), sparks (its smoke is the air's: SMOKE.muzzle in data/atmosphere.js)
//   round    the round in flight: len (s of travel the streak covers), width, core (px), wake (s the line of its
//            whole way lingers; 0 = none)
//   recoil   what the shot does to the man holding it (entities/Recoil.js), in pose px / rad, scaled by his recoil
//            clock (1 at the shot, down to 0 at `rate` a second): ease (power of the clock the hands follow: higher =
//            snappier), hands (px thrown back along the aim), flip (rad the muzzle jumps toward the top of the gun),
//            rise (share the gun shows shorter, its muzzle up at the eye), over (share of the flip it dips past rest on
//            the way back), torso (px the body is shoved back, on the slower linear clock), rock (rad the gun shoulder
//            is driven back), sink (share the body gives under it, squashed), elbow (0..1 the gun elbow folds), buzz (px
//            the hands shake at `hz` while the clock runs: a machine pistol's chatter)
export const FEEL = {
  fists: {
    kind: 'punch', power: [0.25, 0.35], stop: [0.05, 0.06], shake: [0.1, 0.14], push: [2, 2.5], flash: 0.025,
    shove: 2, squash: 0.08, twist: 0.15, burst: { rays: 5, len: 7, width: 1.6, life: 0.07, shape: 'star' },
    smear: { life: 0.06, width: 1.5, alpha: 0.3 }, tell: 0.2,
  },
  blade: {
    kind: 'cut', power: [0.45, 0.55], stop: [0.035, 0.05], shake: [0.07, 0.1], push: [1.5, 2], flash: 0.025,
    shove: 1, squash: 0, twist: 0.45, burst: { rays: 3, len: 13, width: 1.2, life: 0.07, shape: 'slash' },
    smear: { life: 0.07, width: 1.8, alpha: 0.55 }, tell: 0.18,
  },
  stick: { // a light club: a cue
    kind: 'blunt', power: [0.5, 0.6], stop: [0.05, 0.065], shake: [0.13, 0.17], push: [2, 3], flash: 0.025,
    shove: 3, squash: 0.12, twist: 0.2, burst: { rays: 6, len: 9, width: 1.8, life: 0.08, shape: 'star' },
    smear: { life: 0.08, width: 2.6, alpha: 0.4 }, tell: 0.22,
  },
  club: { // a heavy club: a bat, a tire iron
    kind: 'blunt', power: [0.65, 0.75], stop: [0.07, 0.09], shake: [0.2, 0.26], push: [3, 4], flash: 0.042,
    shove: 5, squash: 0.2, twist: 0.25, burst: { rays: 8, len: 13, width: 2.4, life: 0.1, shape: 'star' },
    smear: { life: 0.1, width: 3.6, alpha: 0.45 }, tell: 0.28,
  },
  pistol: {
    kind: 'bullet', power: [0.4, 0.45], stop: [0, 0.03], shake: [0, 0.05], push: [0, 1], flash: 0.025,
    shove: 2, squash: 0, twist: 0.2, burst: { rays: 4, len: 6, width: 1.3, life: 0.05, shape: 'pop' },
    fire: { shake: 0.18, push: 2.5 },
    muzzle: { shape: 'star', len: 11, wide: 6, dur: 0.025, light: 80, sparks: 3 },
    round: { len: 0.022, width: 3, core: 1.2, wake: 0 },
    recoil: { rate: 6.5, ease: 2.4, hands: 2.2, flip: 0.2, rise: 0.24, over: 0.3, torso: 0.5, rock: 0, sink: 0, elbow: 0.35, buzz: 0, hz: 0 },
  },
  silenced: { // a gun with a suppressor (noise 0): next to no flash
    kind: 'bullet', power: [0.3, 0.35], stop: [0, 0.02], shake: [0, 0.03], push: [0, 0.6], flash: 0.025,
    shove: 1.5, squash: 0, twist: 0.15, burst: { rays: 4, len: 5, width: 1.1, life: 0.05, shape: 'pop' },
    fire: { shake: 0.06, push: 1 },
    muzzle: { shape: 'puff', len: 5, wide: 3.5, dur: 0.01, light: 30, sparks: 0 },
    round: { len: 0.018, width: 2.4, core: 1, wake: 0 },
    recoil: { rate: 12, ease: 1.4, hands: 0.9, flip: 0.05, rise: 0.05, over: 0, torso: 0.25, rock: 0, sink: 0, elbow: 0.15, buzz: 0.35, hz: 88 },
  },
  smg: {
    kind: 'bullet', power: [0.3, 0.4], stop: [0, 0.02], shake: [0, 0.04], push: [0, 0.8], flash: 0.025,
    shove: 1.5, squash: 0, twist: 0.2, burst: { rays: 4, len: 5, width: 1.2, life: 0.05, shape: 'pop' },
    fire: { shake: 0.12, push: 1.5 },
    muzzle: { shape: 'burst', len: 10, wide: 6, dur: 0.01, light: 70, sparks: 2 },
    round: { len: 0.02, width: 2.6, core: 1.1, wake: 0 },
    recoil: { rate: 12, ease: 1.4, hands: 1.3, flip: 0.1, rise: 0.08, over: 0, torso: 0.35, rock: 0.02, sink: 0, elbow: 0.2, buzz: 0.6, hz: 95 },
  },
  rifle: {
    kind: 'bullet', power: [0.55, 0.65], stop: [0, 0.035], shake: [0, 0.07], push: [0, 1.5], flash: 0.025,
    shove: 3, squash: 0.05, twist: 0.25, burst: { rays: 5, len: 8, width: 1.4, life: 0.06, shape: 'pop' },
    fire: { shake: 0.2, push: 2.5 },
    muzzle: { shape: 'spear', len: 21, wide: 5, dur: 0.025, light: 90, sparks: 3 },
    round: { len: 0.03, width: 3, core: 1.3, wake: 0 },
    recoil: { rate: 11, ease: 1.3, hands: 2.1, flip: 0.03, rise: 0.04, over: 0.1, torso: 1.1, rock: 0.05, sink: 0.006, elbow: 0, buzz: 0, hz: 0 },
  },
  shotgun: {
    kind: 'bullet', power: [0.6, 1], stop: [0.02, 0.07], shake: [0.05, 0.16], push: [1, 3], flash: 0.042,
    shove: 9, squash: 0.15, twist: 0.3, burst: { rays: 7, len: 10, width: 1.8, life: 0.07, shape: 'pop' },
    fire: { shake: 0.5, push: 7 },
    muzzle: { shape: 'tongue', len: 25, wide: 13, dur: 0.042, light: 115, sparks: 10 },
    round: { len: 0.012, width: 2.2, core: 1, wake: 0 },
    recoil: { rate: 3.2, ease: 1.7, hands: 3.2, flip: 0.1, rise: 0.12, over: 0.15, torso: 2.6, rock: 0.22, sink: 0.025, elbow: 0, buzz: 0, hz: 0 },
  },
  sniper: {
    kind: 'bullet', power: [0.95, 1], stop: [0.04, 0.09], shake: [0.1, 0.2], push: [2, 4], flash: 0.042,
    shove: 8, squash: 0.1, twist: 0.35, burst: { rays: 7, len: 12, width: 2, life: 0.08, shape: 'pop' },
    fire: { shake: 0.7, push: 9 },
    muzzle: { shape: 'brake', len: 28, wide: 7, dur: 0.042, light: 130, sparks: 5 },
    round: { len: 0.035, width: 3.6, core: 1.6, wake: 0.22 },
    recoil: { rate: 2.6, ease: 2, hands: 3.4, flip: 0.05, rise: 0.07, over: 0.1, torso: 3.4, rock: 0.12, sink: 0.045, elbow: 0, buzz: 0, hz: 0 },
  },
  rocket: { // never lands on anyone itself: the blast does (systems/Explosions.js)
    kind: 'bullet', power: [1, 1], stop: [0, 0], shake: [0, 0], push: [0, 0], flash: 0,
    shove: 0, squash: 0, twist: 0, burst: { rays: 0, len: 0, width: 0, life: 0, shape: 'pop' },
    fire: { shake: 0.4, push: 6 },
    muzzle: { shape: 'blast', len: 12, wide: 10, dur: 0.058, light: 130, sparks: 6 },
    round: { len: 0, width: 0, core: 0, wake: 0 },
    recoil: { rate: 3, ease: 1.6, hands: 2.6, flip: 0.04, rise: 0.04, over: 0.05, torso: 2.2, rock: 0.1, sink: 0.02, elbow: 0, buzz: 0, hz: 0 },
  },
};

// the heavy stroke (an overhead smash, a straight stab, a spin): its trail is wider and lasts longer, it stops time
// and shakes the screen harder, and it hits the post-processing harder
export const HEAVY = { smear: 1.5, life: 1.4, stop: 1.35, shake: 1.35, power: 0.15 };

// where a round stops on anything that is not a man (a wall, a prop, a door): a small hot pop
export const SURFACE = { rays: 4, len: 5, width: 1.2, life: 0.05, shape: 'pop', tint: '255,238,184' };

// the share of a blow's clock (Character.swing) that is the stroke itself: its trail is drawn over that part only
export const STROKE = [0.1, 0.55];

// what a guard's wind-up shows: the share of the stroke he holds (its anticipation) and how much of his run he
// keeps while he does (he plants his feet); reach: px past his weapon's range at which he starts it
export const TELL = { hold: 0.11, pace: 0.5, reach: 6 };

// smear colours by what the weapon is made of (the bare hand: a pale skin flash)
export const SMEAR_TINT = { wood: '255,226,180', metal: '214,236,255', none: '255,236,214' };

// the moments that are not one weapon's: power and kind for the 'blow' event, hit-stop, shake, push
export const MOMENTS = {
  beat: { power: 0.6, stop: 0.05, shake: 0.18, push: 2 },                   // a blow of a finisher that is not the last
  stomp: { shake: 0.3 },                                                    // a finisher's stamp on the head
  finisher: { kind: 'finisher', power: 1, stop: 0.12, shake: 0.35, push: 4 }, // the last beat of a finisher
  takedown: { kind: 'finisher', power: 0.8, stop: 0.07, shake: 0.12, push: 2 },
  slide: { kind: 'blunt', power: 0.35, stop: 0.04, shake: 0.15, push: 2 },   // swept off his feet by a slide
  // every slide of the player's opens a moment of bullet time: [time scale, real seconds]. He aims at full speed in it.
  slideTime: { slowmo: [0.42, 0.55] },
  break: { slowmo: [0.35, 0.3], stop: 0.1, shake: 0.35 },                   // the player's weapon gives out over a man
  throw: { slowmo: [0.45, 0.25], shake: 0.15 },                             // the angry throw of an empty gun
  // the last guard in sight goes down after a real fight (others still about the level): a breath of slow motion.
  // radius: px about the player in which no other guard may stand in sight, chain: kills of the chain at least
  lastInRoom: { slowmo: [0.3, 0.55], radius: 420, chain: 2 },
};

// the player's kill, marked where the man stood (fx/CombatFx.js, on the real clock, over the white flash): a thin ring
// broken in `arcs` that opens from r[0] to r[1] px and fades over `life` s, `width` px, at most `alpha`, turned a
// little along the blow; a streak behind him along the blow (len px, life s). Kept faint on purpose (the user: a
// satisfying mark, not a loud one); the lens does the rest (data/post.js punch)
export const KILL = {
  ring: { r: [6, 19], life: 0.22, width: 1, alpha: 0.5, arcs: 4, gap: 0.42, tint: '255,236,214' },
  streak: { len: 16, life: 0.12, width: 1, alpha: 0.4 },
};

// What comes out of a gun's ejection port (weapons.js `eject`, its `casing` sprite) and how it lands (fx/Casings.js,
// entities/Debris.js): speed (px/s) out to the right of the gun and `back` (rad behind square), up (px/s) and from
// (px of fake height it leaves the port at), spin (rad a step), tumble (rad/s it turns end over end while in the air),
// hop [share of the fall speed it bounces back up with, the least fall speed (px/s) that still bounces], skid (rad its
// way is knocked off by each bounce), kg, mu, lift (share of its height shown up the screen: it stays near its
// shadow, the view top-down); each touchdown is heard, at full level from
// `loud` px/s of fall speed (the sound is the caliber's: weapons.js AMMO `spent`). A share of the guards' casings only
// (guard: odds), to keep a firefight's floor readable.
export const CASING = {
  casing: { speed: [95, 165], back: [0.15, 0.55], up: [55, 105], from: 14, spin: [0.25, 0.6], tumble: 30,
    hop: [0.42, 55], skid: 0.6, kg: 0.012, mu: 0.3, loud: 260, guard: 0.6, lift: 0.2 },
  shell: { speed: [80, 135], back: [0.2, 0.6], up: [45, 85], from: 14, spin: [0.15, 0.4], tumble: 20,
    hop: [0.3, 70], skid: 0.4, kg: 0.03, mu: 0.45, loud: 260, guard: 1, lift: 0.2 },
};

// A reload, as shares of the gun's `reload` time. Magazine (the gun's `well` and `rack` in data/weapons.js): the gun
// tips in over the first share of `tilt` and back after its second; at `release` the catch is pressed and the old
// magazine slides out of the well, clear of it at `drop`, when it falls (from `fall` px up, `vz` px/s downward, drawn
// `grow` larger a px of height and `lift` of its height up the screen, `flip` half-turns end over end), lands with its
// clatter (Audio._magLand) and lies there with what was left in it. The free hand leaves the gun at `release`, is at
// the belt at belt[0], draws the fresh magazine out and leaves with it at belt[1], has it at the well's mouth at
// `insert`, pushes it home by `seat` (the shove gives the gun `push` px), then works the action over
// `rack` along the gun's own path (the gun given `give` of the hand's way along it and across it; held `reach` px
// further out meanwhile, a handgun / a long gun), and goes back. Shells (per round): the hand fetches one
// from the belt until `fetch`, brings it under the loading port until `port`, thumbs it home until `push` (the
// shell shows in it until then), then goes back; a round loaded, the next one starts. `racked`: s the action takes to
// work after the last shell.
export const RELOAD = {
  mag: { tilt: [0.1, 0.86], release: 0.05, drop: 0.17, fall: 22, vz: 70, grow: 0.006, lift: 0.15, flip: 1,
    belt: [0.3, 0.38], insert: 0.56, seat: 0.66, push: 0.9, rack: [0.72, 0.94], give: [0.3, 0.2], reach: [2.5, 2.5] },
  shell: { fetch: 0.35, port: 0.65, push: 0.82, racked: 0.3, pull: 2.6 },
};

// A guard shot at and missed (systems/Flinch.js): a round that passes within `near` px of his body, or strikes within
// `strike` px of him, makes him flinch for `dur` s (the head ducked in, the shoulders hunched, turned away from it,
// `back` px off its way, `dip`: the body lowered), the harder the closer; not again before `gap` s unless harder. The
// player's camera is nudged `push` px off a round striking within `radius` px of him (or passing that close: `whiz`),
// with `shake`, at most once every `gap` s.
export const FLINCH = {
  near: 30, strike: 34, dur: 0.36, gap: 0.3,
  pose: { duck: 0.22, hunch: 0.14, away: 0.22, back: 1.8, dip: 0.04 },
  camera: { radius: 52, whiz: 14, push: 1.6, shake: 0.03, gap: 0.09 },
};

// gestures (entities/Player.js, Character.js, CharacterAnim.js)
//   trunk  opening a car trunk: dur (s, he cannot attack), lift [from, to] share of it the lid comes up over,
//          take: share at which what is inside is in his hand
//   door   a hand flat on a door leaf he walks into: gap (px between his body and the leaf at which it is on),
//          speed (px/step he must push at it with), on / off (s to raise / drop it)
//   getup  getting up after a knock-down: dur (s at the end of the time on the floor)
//   swig   how level 1 opens (level intro 'swig'): sat against the wall he drinks off a bottle (drink: [from, to] s,
//          gulps of them), looks at it, draws his arm back (back: [from, to]) and smashes it on the wall across
//          (throw: s it leaves his hand, speed px/s, reach: px it flies at most), end: s he is free again
export const GESTURE = {
  trunk: { dur: 0.5, lift: [0.2, 0.62], take: 0.78 },
  door: { gap: 4, speed: 0.25, on: 0.08, off: 0.16 },
  getup: { dur: 0.85 },
  swig: { drink: [0.45, 1.6], gulps: 3, back: [1.9, 2.15], throw: 2.3, speed: 560, reach: 200, end: 2.75 },
};

// d: a weapon definition -> its FEEL family
export function familyOf(d) {
  if (!d || d.kind !== 'gun') return !d || d.hold === 'none' ? 'fists' : d.swing === 'blade' ? 'blade' : d.heft >= 2 ? 'club' : 'stick';
  if (d.rocket) return 'rocket';
  if (d.pellets > 1) return 'shotgun';
  if (d.heavy) return 'sniper';
  if (d.noise === 0) return 'silenced';
  if (d.ammo === '762') return 'rifle';
  return d.auto ? 'smg' : 'pistol';
}

export const feelOf = (d) => FEEL[familyOf(d)];
