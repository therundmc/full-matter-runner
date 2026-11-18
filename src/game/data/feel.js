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
  finisher: { kind: 'finisher', power: 1, stop: 0.12, shake: 0.35, push: 4 }, // the beat of a finisher that kills, its last
  quick: { kind: 'finisher', power: 0.9, stop: 0.1, shake: 0.3, push: 4 },    // a quick kill on a man down
  takedown: { kind: 'finisher', power: 0.8, stop: 0.07, shake: 0.12, push: 2 },
  // a head driven into a wall, an edge, a toilet (a takedown with a spot): each blow held on its contact frame, the
  // last one harder
  slam: { kind: 'blunt', power: 0.75, stop: 0.08, shake: 0.24, push: 3 },
  slamKill: { kind: 'finisher', power: 1, stop: 0.12, shake: 0.34, push: 4 },
  slide: { kind: 'blunt', power: 0.35, stop: 0.04, shake: 0.15, push: 2 },   // swept off his feet by a slide
  // the foot in his head at the end of a slide, or off a car's hood (Player.landKick, Player.vaultStrike)
  slideKick: { kind: 'blunt', power: 0.6, stop: 0.09, shake: 0.24, push: 3 },
  // every slide of the player's opens a moment of bullet time: [time scale, real seconds]. He aims at full speed in it.
  slideTime: { slowmo: [0.42, 0.55] },
  break: { slowmo: [0.35, 0.3], stop: 0.1, shake: 0.35 },                   // the player's weapon gives out over a man
  snatch: { slowmo: [0.4, 0.3] },                                           // a dead man's weapon taken into his hand
  throw: { slowmo: [0.45, 0.25], shake: 0.15 },                             // the angry throw of an empty gun
  // the last guard in sight goes down after a real fight (others still about the level): a breath of slow motion.
  // radius: px about the player in which no other guard may stand in sight, chain: kills of the chain at least
  lastInRoom: { slowmo: [0.3, 0.55], radius: 420, chain: 2 },
  // several kills in a breath (Scoring's 'multiKill', by its SCORING tag): slow motion [time scale, real s] that never
  // cuts short a stronger one already running (Impact.slowAtLeast), and a hit-stop (s)
  multi: {
    double: { slowmo: [0.5, 0.2], stop: 0.05 },
    triple: { slowmo: [0.4, 0.3], stop: 0.08 },
    massacre: { slowmo: [0.3, 0.45], stop: 0.1 },
  },
};

// The player's weapon giving out (Character.breakWeapon, data/weapons.js `breaks`), what flies of it and the beat
// after (Player.updateBroke, CharacterAnim brokePose):
//   beat    s of the beat: the hand shaken, the stub (a snapped bat's handle) brought up and looked at
//   drop    share of the beat at which the stub is let fall (thrown away: `toss`)
//   hud     s the HUD's weapon name flashes BROKEN
//   fly     [px/s] the far end sent on along the swing, turn: rad off the swing toward the blow, z / vz: up it goes
//   chips   splinters at the break: [count, px/s], wood's colour; sparks of a bent iron [count, px/s]
//   fall    the handle or the stub from the hand: z (px up), toss: px/s it is thrown away at
export const BREAK = {
  beat: 0.55, drop: 0.72, hud: 1.1,
  fly: [150, 220], turn: [0.25, 0.7], z: 9, vz: 110,
  chips: [12, 170], wood: '#d8c090', sparks: [6, 220],
  fall: { z: 9, toss: 120 },
};

// The guard's weapon taken as he dies (Player.snatches): the player's hands are free, or his weapon broke on that
// kill, and the man was killed by them up close (a blow, a takedown, a finisher; how.close). on: the switch; reach:
// px from the man (a weapon he dropped as he was floored: px from where it lies); delay: s before the hand closes
// on it (it has fallen); far: px past which it is let go
// A scarf's end flying behind a man (entities/Character.js KINDS `tail`, Enemy.drawTail: LUCKY): nape: px behind
// the middle of his head it hangs from; side: rad off straight behind it lies when he stands; moving: px/step from
// which it trails where he comes from; follow: 1/s it catches up with him; beat, wave: its flutter (rad/s, rad)
export const TAIL = { nape: 4.5, side: 0.5, moving: 0.4, follow: 7, beat: 6, wave: 0.12 };
// The skirt of a long coat flying behind a man (entities/Character.js KINDS `coat`, entities/Skirt.js, drawn by
// CharacterAnim drawSkirt: the runner's duster). hinge: where a half hangs from, torso-local pose px [behind the
// middle of his shoulders, out to its side]; root: sprite px from the sprite's edge to that hinge
// (tools/generate_assets.py TAIL_ROOT); moving, full: px/step from which it starts to fly and at which it is fully
// out; hem: the share of its length that shows when he stands; trail: rad it is drawn off straight behind him toward
// where he comes from (a side-step); swing: rad it may swing off straight behind (a turn); freq, damp: its spring
// (rad/s, damping ratio: under 1, it swings back past the middle once); draw: 1/s its length and its vent follow his
// speed; open: rad each half opens off the vent at full speed; kick: what his stride adds to the half on the side of
// the leg going back [rad of opening, share of length]; step: the longest step it is advanced by (s)
// sit: sat on the ground it is spread either side of him: [rad each half lies off straight behind, share of its length]
export const COAT = { hinge: [-1, 3.25], root: 3, moving: 0.4, full: 2.6, hem: 0.5, trail: 0.9, swing: 0.8, freq: 13, damp: 0.5,
  draw: 7, open: 0.14, kick: [0.16, 0.1], step: 0.05, sit: [1.45, 0.8] };

// A man sat in a vehicle's seat (Vehicle `seat` / `wheel`, CharacterAnim.seatPose; pose px in his own frame: x ahead,
// y to his right): s: drawn that much smaller (sat low), back: leant back into the seat, lean: his shoulders turned
// (rad, - toward the door); ONE hand on the top of the wheel's rim (`lay`: how it is drawn), turn: rad it slides round
// the rim with a rad of steering, elbow: how far that elbow bends out (0: a straight arm); door: the other hand, over
// the door [sprite px ahead of the seat, across], doorElb: that elbow out on the door's top; feet: his feet under the
// dash [ahead, apart]; settle: s he takes to settle in
// (the pose blended in, the hands finding the wheel); aim: the arm on the aim's side out with what he holds [reach],
// the head and the shoulders turned after it (rad at most); wind: the coat's half on the door's side thrown out over
// the door at speed [rad, flutter rad, rad/s, share it is drawn out longer]; hit: px round the seat a round crossing the open cabin kills within;
// slump: shot at the wheel of the chase's car (riding.slump 0 .. 1 over `t` s): his shoulders `fwd` px onto the wheel, his
// head turned `head` rad and his shoulders `twist`, his hands off the rim and down by his knees [ahead, apart]
// raise: s the arm takes to come out with the gun, or to go back (riding.up); hang: a machine pistol (weapons.js
// 'side') at rest in the door's hand, out over the door, muzzle down past it: [rad off the car's heading, the length
// it is drawn at (hanging toward the road: foreshortened)]
// grab: the beat of taking the gun off the passenger seat as he sets off (Vehicle `gun`, systems/Drive.js grab;
// riding.grab: s into it; CharacterAnim grabPhases). [from, to] in s: look, his head turned `head` rad to the seat;
// reach, the right hand off the wheel onto the gun's grip, the shoulders turned `twist` rad and the body leant `over`
// pose px [ahead, across] toward it; take: the gun leaves the seat in that hand; lift, brought up across his chest (the
// hand at `chest` pose px [ahead, across], the gun `chestA` rad off the heading, his eyes on it: `eye` rad); rack, the
// door's hand to the cocking knob (`knob`: the share of it that is the way there), back and let go (weapons.js `rack`
// points, done by `racked` of it), the rack heard at `pull`; hand: the gun to the door's hand (`give`: the share of it
// taken by that hand closing on the grip) and over the door, the right hand back on the wheel; dur: the hand his again;
// out: s the camera takes to come back out after it
export const SEAT = { s: 0.94, back: 1.4, lean: -0.08, lay: 'fist', turn: 1.1, elbow: 0.1, door: [6.5, -15.5], doorElb: 0.9,
  feet: [7.8, 2.4], settle: 0.28,
  aim: { reach: 12.5, head: 1.1, twist: 0.3 }, wind: [0.95, 0.12, 15, 0.35], hit: 8,
  slump: { t: 0.3, fwd: 3.2, head: 0.95, twist: 0.28, hands: [3.5, 4.2] },
  raise: 0.09, hang: [-2.7, 0.7],
  grab: {
    look: [0, 0.28], head: 1.15, reach: [0.06, 0.5], twist: 0.55, over: [1.2, 6], take: 0.52,
    lift: [0.55, 0.86], chest: [8.5, 0.5], chestA: -1.1, eye: 0.15,
    rack: [0.86, 1.28], knob: 0.35, racked: 0.8, pull: 1.06,
    hand: [1.28, 1.62], give: 0.3, dur: 1.7, out: 0.7,
  } };

export const SNATCH = { on: true, reach: 48, delay: 0.12, far: 90 };

// How kills and chains are shown (ui/KillFeed.js keeps the state on the real clock, render/WorldRenderer.js draws the
// stamps, ui/HUD.js the rest). Sizes in world px for the stamps, in screen px at 720 p for the HUD (x H / 720).
// Colours: a PALETTE key, a CSS colour, or 'neon' (pink / cyan cycle).
//   tiers   [chain length it starts at, colour] of a kill's stamp and of the chain count; at the top multiplier: neon
//   stamp   the points at the body, BELOW it (the barks are above heads): lift (px under his centre), size [font at
//           x1, at the top multiplier], knock (font of a knock-down's or a bonus's), slam (s from `from` x its size
//           to 1 x, turned `tilt` rad, alternately left and right), ghost (s the white ghost of its landing shows),
//           drift (px it sinks over its life), life (s), fade (s at the end), spread (px apart under which two stamps
//           stack), max (alive at once), colors by kind (knock, bonus, civilian)
//   panel   the chain count under the score (from the 2nd kill): size (digits), label (KILLS / x2.5), gap (px between
//           the digits and that column), h (px the block takes), punch (extra scale on a kill, gone in punchT s), jolt
//           (px, gone in joltT s), flash (s the digits show white), open / collapse (s it takes to open / fold)
//   fuse    the bar draining over the chain's window: w, h (px), low (share under which it turns yellow and blinks,
//           red under half of it), red, blink (Hz), refill (s a knock-down's refill flashes white)
//   feed    the last labels (UNSEEN, SLIDE KILL...), newest on top: max lines, size, line (px), stagger (s between the
//           lines of one kill), slide (s to slide in from `dist` px right), life (s), fade (s at the end), end (s they
//           fade in once the chain is over)
//   cash    a chain of 2+ over: CHAIN x6 then +12 400 where the count was: size, big (the points), slam (s from `from`
//           x), hold (s), fade (s)
//   banner  DOUBLE KILL / TRIPLE KILL / MASSACRE centred high (y: share of the screen height): size and colour per tag,
//           slam (s from `from` x), jolt (px, gone in joltT s), ghost (s), life (s), fade (s at the end)
export const KILLFEED = {
  tiers: [[1, 'white'], [3, 'yellow'], [4, 'orange'], [5, 'pink']],
  stamp: {
    lift: 12, size: [8, 14], knock: 7, slam: 0.08, from: 1.8, tilt: 0.14, ghost: 0.16, drift: 4, life: 1.2, fade: 0.35,
    spread: 30, max: 12, colors: { knock: 'white', bonus: 'white', civilian: '#ff1e3c' },
  },
  panel: { size: 40, label: 12, gap: 8, h: 50, punch: 0.4, punchT: 0.14, jolt: 5, joltT: 0.18, flash: 0.08, open: 0.08, collapse: 0.2 },
  fuse: { w: 200, h: 6, low: 0.3, red: '#ff1e3c', blink: 8, refill: 0.2 },
  feed: { max: 4, size: 13, line: 18, stagger: 0.06, slide: 0.12, dist: 70, life: 1.8, fade: 0.3, end: 0.25 },
  cash: { size: 14, big: 24, slam: 0.1, from: 1.8, hold: 1, fade: 0.3 },
  banner: {
    size: { double: 40, triple: 52, massacre: 64 }, color: { double: 'yellow', triple: 'orange', massacre: 'neon' },
    y: 0.24, slam: 0.08, from: 2, jolt: 7, joltT: 0.15, ghost: 0.2, life: 0.7, fade: 0.2,
    // a boss's name card, slammed the same way when he first sees the player (the 'boss' event): bigger, held longer,
    // low on the screen (he is in the middle of it)
    card: { size: 84, color: '#e6ff1a', life: 1.7, y: 0.8 },
  },
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

// gestures (entities/Player.js, Character.js, CharacterAnim.js, Gesture.js)
//   trunk  opening a car trunk: dur (s, he cannot attack), lift [from, to] share of it the lid comes up over,
//          take: share at which what is inside is in his hand
//   getup  getting up after a knock-down: dur (s at the end of the time on the floor)
//   sit    sat on the ground, his back to a wall (CharacterAnim sitPose: how a level starts): back (px his shoulders
//          are pulled back to the wall), s (how much lower he shows), slump (rad his shoulders are turned off square),
//          head (rad his head lolls to his right), rest (his head resting back against the wall: a `bow`, < 0), feet
//          [ahead, to his side, toe turned (rad)] of the left one (the knee up) and of the right one (the leg out),
//          palm [ahead, out] of a hand flat on the ground by his hip. Getting up (PLAYER.rise): push [ahead, out] where
//          the left hand goes to push him up, knee: how far ahead the right foot is drawn in under him, bow: how far
//          he bends forward over it, turn: rad his shoulders turn toward the pushing hand
//   swig   how level 1 opens (level intro 'swig'): sat against the wall he drinks off a bottle (drink: [from, to] s,
//          gulps of them), looks at it (look: [from, to]), draws his arm back (back: [from, to]) and smashes it on the
//          wall across (throw: s it leaves his hand, speed px/s, reach: px it flies at most), end: s he is free again.
//          Its drawing (CharacterAnim swigPose), in his frame (px ahead, px to his right, the bottle's turn in rad):
//          hand: where the right hand is with the bottle on his thigh (lap), at his mouth, held up to be looked at
//          (look), drawn back behind his shoulder (back), at the release (out), where the arm ends its swing
//          (across); collar: where the left hand pulls his collar down while he drinks; brace: where it goes out as
//          he winds up. lift, lower: s the bottle takes up to his mouth and down; tip: how far his head goes back
//          with each gulp (a `bow`); lean: px his shoulders go back with it; empty: rad the bottle tips further up as
//          it empties; glance: s to bring it before his eyes; eye: rad his head turns to it; wag: rad he turns it
//          over; twist: rad his shoulders turn [back with the wind-up, through with the throw]; lunge: px they go
//          forward with it; follow: share of the time after the throw the arm keeps swinging, before it comes down.
//          The bottle in flight (Player.updateSwig): spin (rad/step), tumble (rad/s end over end), height (px off the
//          floor: its shadow stays under it); the smash: glass [count, speed], drops [count, speed] of rum thrown
//          back off the wall, smear (px of it down the wall), rum: its colour [on the wall, as drops and stains]
//   door   a hand reaching for a door leaf ahead and pushing it (Character.updateDoorHand, entities/Gesture.js):
//          ahead (px past his body at which the hand starts to come up, the leaf ahead within `cone`: the cosine of
//          the angle off his way), gap (px: in contact, he pushes), speed (px/step he must go at it with), open (rad
//          a leaf may stand open and still be reached for: further, it is walked past), on / off (s to raise it /
//          drop it), follow (s the hand stays on its point once the leaf has gone by), lean (px the shoulders go
//          into the push), bend (how far out the pushing elbow goes, 0..1); unlatch: a guard's key in a locked door
//          (dur s, the turn of the wrist in rad, how many times it goes; reach: px from the lock at which the hand is
//          on it / starts to go to it, its clock running once on it, or after `wait` s whatever)
//   draw   drawing a weapon (ai/Carry.js `stow` 1 -> 0) and putting it back (the same, backwards), as shares of the
//          way out: the hand to the holster or over the shoulder by reach[1] (it leaves its swing at reach[0]),
//          closed on it by `grip`, the weapon out of it by `pull`, turned up and brought onto its hold by 1; the
//          other hand comes on it from `support`. dip: the shoulders dropped to the holster (rad of turn, share of
//          size); pick: the player's pickup (s of reach down to where it lay, of the whole Character.pickAnim)
//   talk   body language on a line (Character.speak, TALK): dur (s), in / out (s), reach (px of a pointing arm),
//          beat (rad/s of the jabs and nods on the words), head (rad of a nod), listen: px within which the others
//          look at who talks, for `look` s
//   panic  a passer-by's fright (Civilian.mood): startle (s; hop: share of size he jumps, hunch, duck), look (s
//          between two looks back over the shoulder as he runs, s each lasts, rad of the shoulders turned with it),
//          stumble (s of lurching start, px of it), tremble (px of the shakes, rad/s), yield: a guard on his knees
export const GESTURE = {
  trunk: { dur: 0.5, lift: [0.2, 0.62], take: 0.78 },
  door: {
    ahead: 22, cone: 0.55, gap: 4, speed: 0.25, open: 0.9, on: 0.16, off: 0.22, follow: 0.12, lean: 1, bend: 0.85,
    unlatch: { dur: 0.4, twist: 0.7, turns: 1.5, reach: [20, 34], wait: 0.8 },
  },
  draw: { reach: [0.05, 0.32], grip: 0.4, pull: 0.66, support: 0.72, dip: [0.12, 0.03], pick: 0.4 },
  talk: { dur: 1.15, in: 0.14, out: 0.3, reach: 12, beat: 11, head: 0.16, listen: 150, look: 1.3 },
  panic: {
    startle: { dur: 0.42, hop: 0.07, hunch: 0.22, duck: 0.3 },
    look: { every: [1.1, 2.4], dur: 0.45, turn: 0.4 },
    stumble: { dur: 0.7, lurch: 2.6 },
    tremble: { px: 0.45, hz: 37 },
    yield: { hunch: 0.12, duck: 0.16, px: 0.35 },
  },
  getup: { dur: 0.85 },
  sit: { back: 4, s: 0.86, slump: -0.07, head: 0.2, rest: -0.18, feet: [[8.6, -4.8, -0.3], [13.4, 3.2, 0.22]], palm: [-1, 9],
    push: [2, -10], knee: 6.5, bow: 0.3, turn: -0.22 },
  swig: { drink: [0.45, 1.6], gulps: 3, look: [1.62, 1.9], back: [1.9, 2.15], throw: 2.3, speed: 560, reach: 200, end: 2.85,
    hand: { lap: [5, 4.5, 0.3], mouth: [6.6, 1.3, Math.PI - 0.35], look: [9, 3.6, -0.45], back: [-3.2, 8.2, 2.3], out: [10.8, 1.2, 0],
      across: [8.5, -2.5, 0] },
    collar: [5.6, -1.6], brace: [6, -6.5], lift: 0.28, lower: 0.22, tip: 0.24, lean: 0.9, empty: 0.4, glance: 0.14, eye: 0.42,
    wag: 0.45, twist: [0.34, -0.3], lunge: 1.6, follow: 0.35,
    spin: 0.45, tumble: 16, height: 7, glass: [18, 230], drops: [10, 150], smear: 14, rum: ['#3a2410', 'rgba(120, 72, 28, 0.4)'] },
};

// The gesture that goes with a line, by the occasion said (data/barks.js; entities/Gesture.js talkGesture): point
// (an arm out at him: an order, a threat), palm (an open hand: a word), shrug, wave (waved off), beckon (come on),
// hands (both palms up: pleading), nod (the head only; any occasion not listed)
export const TALK = {
  point: ['out', 'drop', 'staff', 'press', 'shove', 'threat', 'brawl', 'snap', 'where', 'hunt', 'sweep',
    'watch', 'cut', 'what', 'flush', 'revenge', 'contact', 'stairs'],
  palm: ['chat', 'hey', 'settle', 'joke', 'boss', 'sight', 'damage', 'window', 'door', 'fuse', 'tracks', 'blood', 'loud', 'dark'],
  shrug: ['clear', 'lost', 'missing', 'noise', 'alone'],
  wave: ['letgo', 'laugh'],
  beckon: ['call', 'rally', 'backup', 'run', 'help', 'wake'],
  hands: ['yield', 'beg', 'panic'],
};

// The drawn body's layers turning about the aim (entities/Facing.js): the head leads, the shoulders follow, the hips
// after them, the feet stay planted until the hips are too far round, then step. Springs: [natural frequency rad/s,
// damping ratio]; `alarmed`: the shoulders' damping for a guard in a fight (a snap turn overshoots a little).
// twist: rad the shoulders may turn off the hips; hands: rad the hands and the weapon may be off the shoulders (they
// keep to the aim within it); hipFoot: rad the hips may turn off the planted feet; plant: gait (0..1) under which
// the feet are planted; stepAt: rad the hips' aim may be off the feet before a step; settle: rad a foot may be off
// once the turn is done, squared up after the shoulders have been still `square` s; stray: pose px a planted foot
// may be off its place under him before it steps back there (lost: so far it is put back at once: a vault, a
// teleport); step: s a step takes, how high the foot comes up, rad the feet may be splayed at most; hop: a turn of
// more than `at` rad with the shoulders going round faster than `speed` rad/s is a hop on both feet (dur s, lift,
// rise: share of size up); lean: px the body goes over the foot that stays down while the other steps; cloth: rad/s
// of the shoulders over which a turn rustles
export const FACING = {
  head: [80, 1], shoulders: [44, 1], alarmed: 0.6, hips: [17, 1],
  twist: 0.9, hands: 0.9, hipFoot: 0.6, plant: 0.12, stepAt: 0.6, settle: 0.25, square: 0.4, stray: 4.5, lost: 14,
  step: { dur: 0.15, lift: 0.6, splay: 1.6 },
  hop: { at: 2.1, speed: 9, dur: 0.18, lift: 0.85, rise: 0.04 },
  lean: 0.8, cloth: 11,
};

// A dancer at her pole (ai/Dance.js; Civilian leads her body, her feet and her layers with it, CharacterAnim
// dancePose draws the rest). Her post is the pole, `front` the way it faces (the room). On the stage light's beat
// (bpm: Config LIGHTING.bpm, a test keeps them in step), a routine of moves that loops, each `beats` long, its pose
// crossfaded from the last one's over `blend` beats. She comes into it over `in` s once back within `join` px of her
// place in it, and out of it over `out` s when scared off.
// Where she is, from the start of a move to its end: th (turns round the pole, + clockwise on screen, 0 = between it
// and the room), r (world px from the pole), face (rad, her facing off the way out from the pole: 0 her back to it,
// PI facing it); travel 'beat': on in a surge each beat (else eased over the move). Her feet: steps [[beat it lands
// on, foot 0 left | 1 right]], each `step` beats in the air and `lift` up, landing where she will be halfway to its
// next step, `width` pose px either side, toes turned out `toe` rad. Her right hand on the pole: pole [from, to,
// beats over (u0, u1)]. sway: share of the hip sway (below) the move keeps; the moves' own amounts (pose px, rad):
// arm (circle: the free arm out at `reach` from its shoulder, swept from `from` to `to` rad off ahead), lean (lean:
// the chest `back`, the hips to the pole, `bow` < 0 the head thrown back, `sink` share of size, in / out over beats),
// roll (roll: the chest and, `lag` rad behind, the hips forward and back, bent / thrown back by `bow`, `rise`).
// sway: the hips to the side of the foot she is on (`hip` px, lingering there), the chest the other way
// (`counter` share of it, `lag` beats behind), the shoulders turned against them (`twist`), the head after (`head`).
export const DANCE = {
  bpm: 108, blend: 0.6, step: 0.45, lift: 0.7, toe: 0.12, in: 0.5, out: 0.3, join: 2.5,
  sway: { hip: 2.2, counter: 0.4, lag: 0.18, twist: 0.18, head: 0.3 },
  routine: [
    { move: 'sway', beats: 8, th: [0, 0], r: [10, 10], face: [0, 0], width: 4.4, pole: [1, 1], sway: 1 },
    { move: 'turn', beats: 2, th: [0, 0], r: [10, 14], face: [0, 2.02], width: 2.8, steps: [[1, 1], [2, 0]], pole: [1, 1], sway: 0.5 },
    { move: 'circle', beats: 8, th: [0, 1], r: [14, 14], face: [2.02, 2.02], travel: 'beat', width: 2.6, pole: [1, 1], sway: 0.8,
      steps: [[1, 1], [2, 0], [3, 1], [4, 0], [5, 1], [6, 0], [7, 1], [8, 0]], arm: { reach: 7.5, from: 0.6, to: 2 } },
    { move: 'turn', beats: 2, th: [1, 1], r: [14, 11], face: [2.02, Math.PI], width: 4, steps: [[1, 1], [2, 0]], pole: [1, 1], sway: 0.4 },
    { move: 'lean', beats: 4, th: [1, 1], r: [11, 11], face: [Math.PI, Math.PI], width: 4, pole: [1, 1], sway: 0,
      lean: { back: 2.6, hips: 1.2, bow: -0.75, sink: 0.04, in: 1.5, out: 1.5 } },
    { move: 'turn', beats: 4, th: [1, 1], r: [11, 10], face: [Math.PI, 0], width: 4.4, steps: [[1, 0], [2, 1], [3, 0], [4, 1]], pole: [1, 1], sway: 0.4 },
    { move: 'arms', beats: 4, th: [1, 1], r: [10, 10], face: [0, 0], width: 4.4, pole: [1, 0, 0, 1], sway: 1 },
    { move: 'roll', beats: 4, th: [1, 1], r: [10, 10], face: [0, 0], width: 4.4, pole: [0, 1, 2.5, 4], sway: 0,
      roll: { chest: 1.8, hips: 1.6, lag: 1.4, bow: 0.3, rise: 0.03 } },
  ],
};

// Getting over things, sliding, rolling (CharacterAnim vaultPose / slidePose / rollPose; everyone moves the same):
// shares of each move's own clock.
//   vault  the one-hand speed vault over furniture (Character.tryVault): a dip in the last step until `dip`, the
//          hand flat on the top at `plant` (world-fixed from then on: where the body is at `mid` of the move, at least
//          `into` px past the near edge, `out` px to its side), the hips lifted and swung past it over `swing`, the
//          hand off last at `lift`, the feet down at
//          `land` (Character.updateVault), one quick step on after it; `rise`: share of size the body comes up by,
//          `lean`: px the torso goes over the planted arm, `turn`: rad the hips turn side-on. hip.vehicle: a car's
//          hood is slid across on the hip instead; hip.strike: the player's legs coming off it take a standing guard
//          on the far side (Player.vaultStrike): within `reach` px of his body (centre to centre) once the legs are
//          swung over (`from` of the slide on), `kick` pose px the feet shoot out at him, `lead` the share of the
//          move they start before the contact, thrown `back` px; the player comes down `short` px before where he stood,
//          `check` of his speed kept
//   slide  the drop until `drop` (leaning back, the lead leg shot out), the slide (the torso reclined `back` px,
//          turned `turn` rad side-on, the trailing hand flat on the floor), the push back up from `up` and over
//          `rec` s once it is over (Player.updateSlideAnim); `pop`: px the torso is thrown forward getting up
//   kick   out of a slide's end (Player.kick, CharacterAnim kickPose), `dur` s: up out of the recline, the lead knee
//          drawn up (chambered) by `chamber`, the leg driven out at his head, the foot on it at `hit` (held by the
//          hit-stop), kept out until `hold`, set down a step ahead by `plant`; reach: pose px the foot may go from the
//          hip, lift: how near the eye the foot comes at full stretch, lean: px the torso goes back off the kick,
//          twist: rad the shoulders turn away from the kicking hip, pop: px the torso goes on over the planted foot
//   roll   squash: [least share of length along the way, across it] of the curled body; turns: how far round he
//          goes (1 = once) between `over` [from, to]; unfold [from, to]: back onto his feet, `pop` share of size
export const TRAVERSE = {
  vault: { dip: 0.12, plant: 0.14, mid: 0.45, into: 3, out: 7, swing: [0.18, 0.66], lift: 0.68, land: 0.84, rise: 0.12, lean: 3.4, turn: 0.75,
    hip: { vehicle: true, strike: { from: 0.35, reach: 30, kick: 6, lead: 0.14, back: 32, short: 6, check: 0.25 } } },
  slide: { drop: 0.16, up: 0.8, rec: 0.2, back: 4.2, turn: 0.75, pop: 2.2 },
  kick: { dur: 0.44, chamber: 0.24, hit: 0.36, hold: 0.58, plant: 0.84, reach: 16, lift: 1.6, lean: 2.6, twist: 0.45, pop: 1.8 },
  roll: { squash: [0.68, 0.9], turns: 1, over: [0.12, 0.66], unfold: [0.6, 0.84], pop: 0.05 },
};
// how long a vault, a climb and a ladder take (Character.tryVault), and how far the guards hear the player's climb,
// his steps on a ladder's rungs and a flat landing
export const VAULT_DUR = 0.5;  // s, windows and furniture alike
export const CLIMB_DUR = 0.72; // s, over a chain-link gate
export const LADDER_DUR = 1.1; // s, up or down a ladder
export const CLIMB_NOISE = 230; // px the rattling mesh is heard at when the player climbs
export const RUNG_NOISE = 150;  // px each of his steps on a steel ladder is heard at
export const LAND_NOISE = 120;  // px a flat landing is heard at

// What only the player's moves throw (fx/TraversalFx.js; the guards move the same, without the flourish). Kept
// faint, crisp, no blur.
//   ground  what flies off each kind of floor (World.floorAt; a wet one: its liquid's drops): dust puffs (colour,
//           alpha) or specks (colour)
//   slide   per second while sliding: dust off the trailing hand and the lead foot (rate, first share of the slide
//           only after `till`); streaks of light along the way (rate, len px, life s, alpha, spread px across) over
//           the first `streak` share; the skid mark (colour, alpha, a stroke every px)
//   plant   the hand on the top: a puff (count, r), chips of what it is (count, speed)
//   rim     a thin light outline on him through the swing (alpha, over the vault's swing)
//   land    a vault or a drop coming down: a ring of dust (count, r px, speed px/s), specks, the camera (shake trauma,
//           dip px along the way); roll: the dust he throws as he unfolds
//   kick    the foot on a head (Player.landKick): the star where it lands (CombatFx burst), spit and sweat thrown on
//           along the kick (drops: count, colour, speed px/s); the foot set down after it: landFx at `land` of a landing
export const TRAVERSE_FX = {
  ground: {
    dust: { color: '#a49c8c', alpha: 0.2, speck: '#6e675c' },
    wood: { color: '#8a6a48', alpha: 0.14, speck: '#c08a58' },
    carpet: { color: '#7a5a6a', alpha: 0.1, speck: '#5a3a4a' },
    floors: { wood: 'wood', carpet_red: 'carpet', carpet_purple: 'carpet' },
  },
  slide: { dust: 26, till: 0.75, streak: 0.4, streaks: 30, len: [10, 20], life: 0.14, alpha: 0.35, spread: 9, skid: { color: '#140c1c', alpha: 0.05, every: 5 } },
  plant: { puff: 3, r: 2, chips: 3, speed: 50 },
  rim: { alpha: 0.55 },
  land: { ring: 10, r: 5, speed: 46, specks: 3, shake: 0.06, dip: 1.8 },
  roll: { ring: 7, r: 4, speed: 40, puff: 3 },
  kick: { burst: { rays: 7, len: 12, width: 2, life: 0.09, shape: 'star' }, drops: 5, color: 'rgba(216,210,196,0.5)', speed: 120, land: 0.55 },
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
