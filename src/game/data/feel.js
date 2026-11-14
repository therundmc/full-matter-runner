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
//            the shooter), sparks, smoke (puffs)
//   round    the round in flight: len (s of travel the streak covers), width, core (px), wake (s the line of its
//            whole way lingers; 0 = none)
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
    muzzle: { shape: 'star', len: 11, wide: 6, dur: 0.025, light: 80, sparks: 3, smoke: 2 },
    round: { len: 0.022, width: 3, core: 1.2, wake: 0 },
  },
  silenced: { // a gun with a suppressor (noise 0): next to no flash
    kind: 'bullet', power: [0.3, 0.35], stop: [0, 0.02], shake: [0, 0.03], push: [0, 0.6], flash: 0.025,
    shove: 1.5, squash: 0, twist: 0.15, burst: { rays: 4, len: 5, width: 1.1, life: 0.05, shape: 'pop' },
    fire: { shake: 0.06, push: 1 },
    muzzle: { shape: 'puff', len: 5, wide: 3.5, dur: 0.01, light: 30, sparks: 0, smoke: 1 },
    round: { len: 0.018, width: 2.4, core: 1, wake: 0 },
  },
  smg: {
    kind: 'bullet', power: [0.3, 0.4], stop: [0, 0.02], shake: [0, 0.04], push: [0, 0.8], flash: 0.025,
    shove: 1.5, squash: 0, twist: 0.2, burst: { rays: 4, len: 5, width: 1.2, life: 0.05, shape: 'pop' },
    fire: { shake: 0.12, push: 1.5 },
    muzzle: { shape: 'burst', len: 10, wide: 6, dur: 0.01, light: 70, sparks: 2, smoke: 1 },
    round: { len: 0.02, width: 2.6, core: 1.1, wake: 0 },
  },
  rifle: {
    kind: 'bullet', power: [0.55, 0.65], stop: [0, 0.035], shake: [0, 0.07], push: [0, 1.5], flash: 0.025,
    shove: 3, squash: 0.05, twist: 0.25, burst: { rays: 5, len: 8, width: 1.4, life: 0.06, shape: 'pop' },
    fire: { shake: 0.2, push: 2.5 },
    muzzle: { shape: 'spear', len: 21, wide: 5, dur: 0.025, light: 90, sparks: 3, smoke: 2 },
    round: { len: 0.03, width: 3, core: 1.3, wake: 0 },
  },
  shotgun: {
    kind: 'bullet', power: [0.6, 1], stop: [0.02, 0.07], shake: [0.05, 0.16], push: [1, 3], flash: 0.042,
    shove: 9, squash: 0.15, twist: 0.3, burst: { rays: 7, len: 10, width: 1.8, life: 0.07, shape: 'pop' },
    fire: { shake: 0.5, push: 7 },
    muzzle: { shape: 'tongue', len: 25, wide: 13, dur: 0.042, light: 115, sparks: 10, smoke: 5 },
    round: { len: 0.012, width: 2.2, core: 1, wake: 0 },
  },
  sniper: {
    kind: 'bullet', power: [0.95, 1], stop: [0.04, 0.09], shake: [0.1, 0.2], push: [2, 4], flash: 0.042,
    shove: 8, squash: 0.1, twist: 0.35, burst: { rays: 7, len: 12, width: 2, life: 0.08, shape: 'pop' },
    fire: { shake: 0.7, push: 9 },
    muzzle: { shape: 'brake', len: 28, wide: 7, dur: 0.042, light: 130, sparks: 5, smoke: 4 },
    round: { len: 0.035, width: 3.6, core: 1.6, wake: 0.22 },
  },
  rocket: { // never lands on anyone itself: the blast does (systems/Explosions.js)
    kind: 'bullet', power: [1, 1], stop: [0, 0], shake: [0, 0], push: [0, 0], flash: 0,
    shove: 0, squash: 0, twist: 0, burst: { rays: 0, len: 0, width: 0, life: 0, shape: 'pop' },
    fire: { shake: 0.4, push: 6 },
    muzzle: { shape: 'blast', len: 12, wide: 10, dur: 0.058, light: 130, sparks: 6, smoke: 8 },
    round: { len: 0, width: 0, core: 0, wake: 0 },
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
  break: { slowmo: [0.35, 0.3], stop: 0.1, shake: 0.35 },                   // the player's weapon gives out over a man
  throw: { slowmo: [0.45, 0.25], shake: 0.15 },                             // the angry throw of an empty gun
  // the last guard in sight goes down after a real fight (others still about the level): a breath of slow motion.
  // radius: px about the player in which no other guard may stand in sight, chain: kills of the chain at least
  lastInRoom: { slowmo: [0.3, 0.55], radius: 420, chain: 2 },
};

// gestures (entities/Player.js, Character.js, CharacterAnim.js)
//   trunk  opening a car trunk: dur (s, he cannot attack), lift [from, to] share of it the lid comes up over,
//          take: share at which what is inside is in his hand
//   door   a hand flat on a door leaf he walks into: gap (px between his body and the leaf at which it is on),
//          speed (px/step he must push at it with), on / off (s to raise / drop it)
//   getup  getting up after a knock-down: dur (s at the end of the time on the floor)
export const GESTURE = {
  trunk: { dur: 0.5, lift: [0.2, 0.62], take: 0.78 },
  door: { gap: 4, speed: 0.25, on: 0.08, off: 0.16 },
  getup: { dur: 0.85 },
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
