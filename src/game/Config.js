// Global tuning. World units are pixels; 1 tile = TILE px.
import { TILE } from '../engine/physics/Units.js';

export { TILE }; // 1 tile = 1 m = 32 px (see engine/physics/Units.js)
export const FIXED_DT = 1 / 60;          // simulation step (seconds of game time at timeScale 1)

// Matter collision categories
export const CAT = {
  WALL: 0x0001,
  PROP: 0x0002,
  DOOR: 0x0004,
  CHAR: 0x0008,
  DEBRIS: 0x0010,
  ITEM: 0x0020,
  GLASS: 0x0040,
  CORPSE: 0x0080,
  EDGE: 0x0100, // invisible barriers just outside the map (TileMap.buildEdgeBodies): traffic and walkers ignore them
};

export const MASK = {
  WALL: 0xffff,
  PROP: CAT.WALL | CAT.PROP | CAT.DOOR | CAT.CHAR | CAT.DEBRIS | CAT.ITEM | CAT.GLASS | CAT.CORPSE | CAT.EDGE,
  DOOR: CAT.PROP | CAT.CHAR | CAT.DEBRIS | CAT.ITEM | CAT.CORPSE,
  CHAR: CAT.WALL | CAT.PROP | CAT.DOOR | CAT.CHAR | CAT.GLASS | CAT.DEBRIS | CAT.EDGE,
  DEBRIS: CAT.WALL | CAT.PROP | CAT.DOOR | CAT.DEBRIS | CAT.GLASS | CAT.CHAR | CAT.EDGE,
  ITEM: CAT.WALL | CAT.PROP | CAT.DOOR | CAT.GLASS | CAT.EDGE,
  GLASS: CAT.CHAR | CAT.DEBRIS | CAT.ITEM | CAT.PROP | CAT.CORPSE,
  GLASS_BROKEN: CAT.CHAR,
  CORPSE: CAT.WALL | CAT.PROP | CAT.DOOR | CAT.GLASS | CAT.EDGE,
};

// How much bigger than the 1 m = 32 px world people are drawn, with what they hold (the user: seen from above they
// were too small, next to a body on the floor above all). A standing pose is scaled as a whole about the feet
// (CharacterAnim bodyFrame), weapons follow in the hand and on the floor, and the bodies on the floor are painted
// at that size (tools/generate_assets.py). Pose numbers, grips and reaches stay in unscaled px.
export const BODY_SCALE = 1.3;

export const PLAYER = {
  radius: 10,
  speed: 2.95,        // px per base step (~177 px/s)
  accel: 0.42,        // velocity lerp per step
  lookAhead: 0.32,    // camera offset toward the cursor
  lookAheadFar: 0.75, // with Shift held
  rise: 0.55,         // s to get up off the ground at the start of a level
  // Space while running with nothing to vault (systems/Slide.js): ~0.5 s, ~2.9 m
  slide: {
    dur: 0.5,         // s
    boost: 1.95,      // start speed, x run speed
    end: 0.6,         // speed at the end (handed back to the run), x run speed
    cooldown: 0.5,    // s after a slide before the next one
    minSpeed: 0.45,   // x run speed needed to start one
    knockSpeed: 1.1,  // x run speed: still fast enough to sweep a standing enemy off his feet
    stall: 0.3,       // measured / wanted speed under which an obstacle ends the slide
    hitMomentum: 0.6, // share of our momentum given to loose props we plough into
    duck: [0.06, 0.72],       // share of the slide spent low enough for rounds to pass over us
    bulletTime: [0.3, 0.4],   // time scale, s: the breath of slow motion when a round does
    cost: 0.5,        // stamina (0..1) a slide takes: two in a row from rested
    regen: 0.28,      // stamina back per second on our feet
    // the end of a slide pops up into a kick at a standing guard just ahead (systems/Kick.js, Player.startKick, the
    // pose: CharacterAnim kickPose, its clock TRAVERSE.kick): from share `from` of the slide (or as it stalls on him),
    // and for `late` s once it is over; the guard within `range` px (centre to centre) and `cone` rad of the way.
    // He closes to `gap` px by the contact; the guard is floored and thrown `back` px along the kick; `noise` px heard
    kick: { from: 0.55, late: 0.12, range: 40, cone: 0.5, gap: 25, back: 26, noise: 150 },
  },
  // after a drop from a height (over a prop whose def has land: 'roll', down to the ground): a forward shoulder roll
  roll: {
    dur: 0.46,        // s, at full length
    dist: 44,         // px rolled when nothing is in the way (less when something is)
    exit: 0.75,       // speed handed back to the run at the end, x the roll's mean speed
    noise: 70,        // px the guards hear the landing at (a flat landing: 120)
  },
  // a melee swing (fists, blade, club) started near a standing guard (systems/Lunge.js): the nearest one within the
  // weapon's reach + `extra` px and `cone` rad of the aim draws it: the aim turns up to `turn` rad onto him and he
  // closes in up to `push` px over `dur` s, to `gap` px short of contact, never into a wall.
  // `lock`: the man the LOCK aim cue holds close (systems/AimCue.js meleeLock: within the weapon's reach + `margin` px,
  // AIM.lock.wide rad of the aim): the swing turns all the way onto him, the drawn body snapped onto him at once, and
  // the step goes up to `push` px, taken whole before the blow lands (push >= margin: it lands)
  lunge: { extra: 12, cone: 0.5, turn: 0.25, push: 10, dur: 0.08, gap: 1, lock: { margin: 16, push: 20 } },
};

// Left click right behind a standing guard who has his back to us (systems/Takedown.js): who can be seized. What is done
// to him, by the weapon in hand, is data/finishers.js TAKEDOWNS.
export const TAKEDOWN = {
  reach: 34,     // px between the two
  rear: 1.3,     // half-angle (rad) of the arc behind his back we must stand in
  facing: 1.45,  // how far (rad) we may be aiming away from him
  set: 0.12,     // s to close in to the sequence's gap behind him
  spotted: ['alert'], // the squad's phases (ai/Director.js) in which they have us located: no takedown then
};

// One guard (entities/Enemy.js, ai/Perception.js). Times in seconds, distances in px, angles in rad.
export const ENEMY = {
  radius: 10,
  walkSpeed: 1.0,
  runSpeed: 2.35,
  viewDist: 340,
  fov: Math.PI * 0.62,
  focusCone: 0.3,         // half-angle of the sharp centre of the view cone
  closeSense: [20, 46, 90], // 360 deg awareness radius by awareness (unaware / suspicious / alert)
  // detection meter (0..1): '?' from `suspicious`, '!' (combat) at 1
  spotTime: [0.45, 2.0],  // seconds to fill it at point blank / at viewDist (player still, centre of view, lit)
  suspicious: 0.3,
  peripheral: 0.35,       // detection multiplier at the edge of the view cone
  motion: [0.6, 0.95, 1.25], // detection multiplier: player still / walking / running
  light: [0.35, 1.1],     // detection multiplier = light[0] + light[1] * brightness (0 dark .. 1 lit)
  meterDecay: [0.16, 0.05], // meter loss per second out of sight (unaware / suspicious)
  visionTick: 0.05,       // line-of-sight check period while unaware (staggered between guards)
  // meter level a noise brings a guard to (footsteps add up instead, capped below alert)
  hear: { gunshot: 0.75, allyFire: 0.6, explosion: 0.75, wall: 0.6, glass: 0.5, door: 0.4, thrown: 0.5, clatter: 0.45, body: 0.45, noise: 0.45, footsteps: 0.18 },
  hearError: 0.12,        // noise localisation error, fraction of the distance
  // reaction & aim: guards must telegraph before they fire
  reaction: [0.65, 0.95], // seconds from '!' to the first possible shot
  reacquire: [0.32, 0.5], // same, when the target pops up again
  turnRate: 5,            // rad/s while aiming
  aimTolerance: 0.18,     // max angle off target to pull the trigger
  aimError: 0.02,         // base random spread added to every enemy shot (Character.fire)
  aimErrorMax: 0.2,       // extra error on the first shots, shrinks while they keep the target in sight
  aimSettle: 1.6,         // seconds of steady sight to reach full accuracy
  aimMoveMul: 1.4,        // error multiplier on a running target
  fireRateMul: 1.3,       // enemies shoot slower than the player
  fireRange: 420,
  spareMags: 2,           // reserve of a guard (loose shells for shotguns)
  spareShells: 12,
  // preferred engagement distance per weapon [min, max]
  ranges: {
    shotgun: [40, 105], pistol: [110, 230], uzi: [90, 200], uzi_silenced: [90, 200], rifle: [180, 300], sniper: [220, 330], bazooka: [170, 320],
  },
  knockTime: 2.8,
  knockBrake: 0.08,       // share of his speed a man knocked down loses each step as he slides on the floor
  dizzy: [1.0, 1.6],      // stagger after getting up from a knock-down
};

// Squad brain (ai/Director.js): alert phases, noises, search sweeps, budgets.
export const AI = {
  vigilance: { normal: 1, caution: 1.3, evasion: 1.5, alert: 1.7 }, // detection speed per phase
  // soundtrack intensity per phase (Music: beatless under 0.45, a heartbeat, the beat from 0.7), and what the
  // fight itself adds on top: heat 0..1 gained per event, lost in `cool` s, worth `gain` of intensity
  music: { normal: 0.25, caution: 0.55, evasion: 0.75, alert: 0.85 },
  heat: { shot: 0.12, kill: 0.7, blast: 0.6, boss: 1, cool: 14, gain: 0.5 }, // boss: a beat of a boss's (the 'boss' event)
  combatMusic: ['alert'], // phases during which the soundtrack plays its combat variant
  alertLinger: 4,         // seconds without a sighting before ALERT turns into EVASION
  evasion: 18,
  caution: 30,
  footstepRadius: 64,
  thrownRadius: 170,
  bodyFallRadius: 100,
  shoutRadius: 380,
  maxHunters: 4,          // guards converging on a contact at once (the others hold and watch)
  searchers: 6,           // guards sent on an evasion sweep
  searchTiles: 16,        // sweep radius (path distance in tiles) around the last known position
  searchSpots: 14,
  widen: 1.7,             // the sweep goes this much further out once every spot near where he vanished is done
  // a hunter going where a mate fell not long ago (`time` s, within `r` px of the body) comes on carefully: brisk walk,
  // weapon up, eyes ahead (`pace` x his walk)
  wary: { time: 25, r: 200, pace: 1.6 },
  noiseGap: 0.25,         // the same source is heard at most this often (automatic fire)
  planBudget: 6,          // expensive AI work per step (path = 1, cover / flank search = 3)
  // The player's wet or bloody footprints (ai/Trail.js, Enemy.doTrack). fresh: s a print stays readable; max: prints
  // kept; gap: px between two prints of the same run; hop: px a tracker walks at a time; sight: share of the view
  // distance at which a print is noticed, close: px all around; ahead: px he goes on past the last print.
  // doorways, one at a time: how long a guard waits for a mate in the frame (s, walking / running), clear of its
  // mouth (Enemy.standBack), and how far from it a doorway still counts as on his way (px)
  gate: { calm: 3, rush: 1.2, far: 96 },
  // Finding his way (ai/Nav.js, Enemy.follow / pathCost). jam: a tile he pushed at in vain is worth `cost` tiles of
  // detour to him for `forget` s (held up by people, only from the `people`-th time on the same tile); after `tries`
  // jams on the way to one spot he gives that spot up (his post: he idles where he is `rest` s, then tries again).
  // danger: the tiles around where a mate fell (r tiles) cost that much to the squad for `forget` s. shared: per tile
  // of a mate's route to the same fight (`routeFor` s: the hunters spread over the ways in). fire: a tile by a fire;
  // slick: a tile whose grip is under `grip`.
  // avoid (ai/Nav.js giveWay): personal space px, the push off it, px ahead he looks, his step aside, the pace (px/step)
  // above which one ahead counts as going his way, the share of his pace he keeps behind him, the least.
  nav: {
    jam: { cost: 14, forget: 15, people: 2, tries: 3, rest: [4, 8] },
    danger: { cost: 4, forget: 25, r: 1 },
    shared: 0.6, routeFor: 3,
    fire: 12, slick: 3, grip: 0.55,
    avoid: { space: 4, push: 0.9, ahead: 38, side: 0.85, queue: 0.5, keep: 0.75, minPace: 0.35 },
  },
  trail: { fresh: 45, max: 48, gap: 60, hop: 70, sight: 0.45, close: 36, ahead: 96 },
  // a doorman's eyes follow whoever comes within `range` px and `arc` rad of the way he stands, at `turn` rad/s
  gaze: { range: 176, arc: 1.9, turn: 4 },
  // tipping a table over for a shield: px from the cover spot to the table at most, px to be at it, s to get there,
  // px of extra way such a spot is worth
  flip: { reach: 40, near: 6, time: 0.8, pull: 96 },
  duck: [2.5, 4],          // s a bartender stays down behind his counter at the first shots
  // how a guard carries his weapon (ai/Carry.js), in s: putting it away, drawing a pistol or a blade, bringing a
  // long gun round from his back, raising it on a target; ready: how far out (0..1) it must be to fire
  carry: { holster: 0.8, draw: 0.3, unsling: 0.45, raise: 0.16, ready: 0.3 },
  // two calm guards within `near` px (one of them walking by: `pass`) stop for a word: for `time` s, then not
  // again for `every` s; line: odds a turn to talk comes with a line over his head
  chat: { near: 84, pass: 56, time: [6, 11], every: [25, 50], line: 0.7 },
  // a guard goes and relieves himself (ai/Pastimes.js reliefSpot) every `every` s (the first time after `first`),
  // odds per idle pick, for `time` s; a spot not reached in `giveUp` s is forgotten
  relief: { odds: 0.12, every: [90, 180], first: [15, 120], time: [7, 10], giveUp: 6 },
  barkGap: 0.4,           // seconds between two barks in the whole squad
  barkMemory: 8,          // lines the squad has just used and will not repeat
  tauntGap: [6, 12],      // seconds between two curses of a guard in a fight
  // barks (Director.bark, ai/Barks.js): one man at a time says a given occasion (`same` s apart); `where`: s at
  // least between two calls of where the player is (only when it changed); `landmark`: px around a landmark's box
  // it names the spot; `place`: s his place is worked out again; the last two of a squad may say they are alone
  // (odds `lonely`) `alone` s after the fall of a mate
  barks: { same: 1.5, where: 4, landmark: 24, place: 0.25, lonely: 0.7, alone: [0.8, 2] },
  // Running for help (Enemy.goForBackup / doBackup, ai/Squad.js): on contact, a guard alone (nobody the shout reaches,
  // nobody in the fight within shoutRadius) or outgunned (bare hands or a blade against a gun) may run for the others
  // instead: odds by kind (times `outgunned` when he is), never with the player within `near` px. He runs to the
  // free guards (`group` px from one another) between `far` and `reach` px away, brings back up to `bring` of them,
  // and gives up after `give` s on the way. One man at a time.
  backup: { odds: { thug: 0.3, heavy: 0.15, brute: 0.05 }, outgunned: 1.5, near: 110, far: 260, reach: 1000, group: 150, bring: 3, give: 9 },
  // The last guard alive may give up when he next faces the armed player within `range` px (Enemy.surrender):
  // only in a squad of at least `squad`, with these odds (a brute rarely does); beg: s between two pleas.
  // Any guard on his own (nobody of his fighting within `alone` px), empty-handed or out of rounds, with the armed
  // player within `close` px, may give up too: odds by kind, one roll every `every` s (ai/Squad.js yieldOdds).
  // On his knees, once the player has turned more than `turned` rad away from him (or lost sight of him) for `wait`
  // s, a loaded gun within `grab` px tempts him: odds by kind, one roll a second (Enemy.updateYield).
  // A guard who starts bare-handed with his weapon kept somewhere (level `arms`: the bartender's bat behind the
  // counter, a bat against the wall, the cue by the pool table; Enemy.armUp) runs for it once the fight is on, unless
  // the player is within `close` px of him (he uses his fists); he gives up on it after `giveUp` s on the way (out of
  // reach) and fights on with what there is. A brawler (`arms` 'fists') never goes for a weapon.
  arms: { close: 56, giveUp: 7 },
  surrender: {
    squad: 4, odds: 0.55, brute: 0.15, range: 230, beg: [2.4, 4.5],
    unarmed: { thug: 0.45, heavy: 0.3, brute: 0.06 }, close: 170, alone: 420, every: 2.5,
    turned: 1.6, wait: 1.2, grab: 220, treachery: { thug: 0.25, heavy: 0.3, brute: 0.4 },
  },
  // A stranger seen doing something odd while nobody has anything against him (ai/Conduct.js, data/conduct.js
  // ACTS, Director.conduct, Enemy.doChallenge): the nearest guard who saw it within `sight` px walks over (`pace` x his
  // walk) and stops `talk` px from him; he gives him `wait` s per stage (told, warned, shoved; an act's own `wait`
  // wins), `settle` s of complying lets him off, `lost` s out of sight and he lets it go; for the shove he steps within
  // `reach` px and throws him back at `shove` px/step. A man let off is remembered `memory` s (the next case opens
  // at the warning). The others who saw it look at him `glance` s. lurk: s hanging about within `lurkR` px of a door
  // into the premises; bump: px/step at which running into a guard is noticed; gone: px off a guard who stays out of
  // the premises: he walked away, that will do; near: px within which a guard busy at his pastime sees it.
  challenge: {
    sight: 300, pace: 1.45, talk: 44, wait: [5, 4, 3], settle: 1.2, lost: 5, reach: 24, shove: 5.5, memory: 60,
    glance: 1.8, lurk: 4, lurkR: 44, bump: 1.6, gone: 260, near: 120,
  },
  // Noises while all is calm: only the `go` guards nearest one go and look; the others glance toward it a moment.
  // Alarms (gunshots, a blast, a body falling, a wall coming down) bring everyone in range as before.
  listen: { go: 2, glance: 1.4 },
};

export const PHYSICS = {
  pushForce: 650, // N a character can shove with (heavier/grippier objects won't budge)
  substeps: 2,    // Matter updates per simulation step (smoother contacts)
};

// Wet floors (systems/Liquids.js). Lengths in px, areas in px2, times in s.
// Ambient street life (systems/Ambient.js): traffic on level.ambient.traffic lanes, passers-by on
// level.ambient.walkers paths. Distances in m (= tiles), speeds in m/s, times in s, unless noted.
// shop alarms (systems/Alarms.js)
export const ALARM = {
  duration: 40,            // s of ringing after the last breach
  period: 0.54,            // s between two bursts of the bell (the length of one: Audio shopAlarm)
  margin: 1.2,             // tiles around the shop's floor that count as its walls, windows and door
  call: 3,                 // every so many bursts the guards around hear it and passers-by hurry on
  reach: 14,               // tiles the bell carries to guards (walls muffle it)
  shy: 7,                  // tiles within which passers-by hurry on
  beacon: { r: 140, color: '#ff3b30', dur: 0.3 },
};

// far-off police sirens once a firefight drags on (systems/Sirens.js); seconds
export const SIRENS = {
  lull: 5,                 // shots less than this apart are one firefight
  after: 25,               // of firefight before the first wail
  rise: 14,                // to come up, `fade` to die down
  fade: 10,
  linger: 35,              // of silence before they give up
  period: 4.6,             // one wail (Audio siren)
  cars: [{ pan: -0.5, pitch: 1, vol: 1, late: 0 }, { pan: 0.6, pitch: 0.93, vol: 0.7, late: 7 }], // each its side and voice
};

// The night heard around the player (systems/Ambience.js): long beds per place of the level and per prop, the
// traffic car by car, one-shots on top (what each place sounds like: data/soundscape.js; the beds: audio/Beds.js).
export const AMBIENCE = {
  indoors: ['wood', 'checker', 'tile_blue', 'neon_floor', 'carpet_red', 'carpet_purple'], // floors under a roof
  // floors under the sky; any other (concrete: a yard, a store room) is in the open air when its stretch runs out
  // onto one of these, not through a door (systems/Weather.js openAir)
  outdoors: ['grass', 'asphalt', 'asphalt_line', 'dirt', 'sidewalk', 'roof'],
  ease: 1.6,               // 1/s the mix follows him from place to place (and a crowd falling silent)
  send: 0.1,               // s between two mixes handed to the mixer (it glides in between)
  through: 0.35,           // level of a place heard through its walls ...
  muffle: 600,             // ... and the Hz it is cut at
  open: 14000,             // Hz a bed is cut at where it is heard openly
  props: { through: 0.45, muffle: 900, pan: 300 }, // a prop's bed through a wall; px to the side for full pan
  gust: 1,                 // a gust of wind (systems/Papers.js), out of doors ...
  muffled: 0.7,            // ... and how much of it is lost indoors
  drip: { every: [0.8, 3], reach: 300, spread: 14 }, // props with `drip`: s between two drops, px around the prop
  city: { inside: 0.45 },  // the far city (data/soundscape.js CITY) from under a roof: that much of its level, muffled
};

// a barrel smokes for a moment after a burst (Character.fume)
export const BARREL = {
  max: 8,                  // rounds' worth of heat it holds
  big: 3,                  // what a shotgun blast or a rocket is worth
  from: 2.5,               // heat from which it smokes
  wait: 0.16,              // s after the last shot
  cool: 3,                 // heat lost per second
  every: 0.07,             // s between two wisps
};

// the balls on a pool table (systems/PoolBalls.js); table-local px, the sprite's centre at 0,0
export const POOL = {
  half: [35, 17],          // of the felt
  r: 1.5,
  pockets: [[-35.5, -17.5], [0, -18.4], [35.5, -17.5], [-35.5, 17.5], [0, 18.4], [35.5, 17.5]],
  mouth: 3.6,              // a ball this close to a pocket drops
  rack: [                  // x, y, colour, striped; the cue ball first
    [-20, 3, '#f4f2ea'], [17.5, -0.5, '#f9c80e'], [20, -2, '#d02030', true], [20, 1.2, '#2a5ad8'], [22.5, -3.4, '#101018'],
    [22.6, 3.4, '#ff6b1a', true], [8, 8, '#7a1fa2'], [-11, -9, '#1a9a4a', true], [29.5, 11.5, '#8a2a1a'],
  ],
  drag: 0.9,               // share of its speed a rolling ball loses per second
  stop: 4,                 // px/s under which it stands still
  cushion: 0.7,            // speed kept off a cushion
  stroke: [95, 150],       // px/s the cue ball leaves at
  jolt: 70,                // px/s a round in the table gives the balls near it
  bump: 9,                 // the same per px/step of a body bumping into it
  clack: 22,               // px/s closing speed from which two balls are heard
};

// machines that answer a blow (systems/Gadgets.js), by prop type
export const GADGETS = {
  arcade: { sound: 'ding', gap: 0.5, flash: '#3ae8ff', bump: 1.2 }, // rings when hit, or bumped into (px/step)
  // derails at the first blow, dark `dies` s later; till then its tune is heard `reach` px away, `muffled` behind a wall
  jukebox: { sound: 'derail', dies: 1.2, reach: 460, muffled: 0.3 },
  parking_meter: { sound: 'coin', gap: 0.15 },                       // its coins ring at every blow
};

// Loose paper on the pavement (systems/Papers.js); speeds of bodies in px/step, the rest in px and seconds
export const PAPERS = {
  gust: [6, 14],     // s between two gusts of wind
  blow: 1.3,         // s a gust lasts
  force: [70, 150],  // px/s2 it pushes a sheet with
  friction: 2.2,     // 1/s: how fast a sheet settles
  tumble: 0.12,      // turns of its shape per px travelled
  wake: 58,          // px round a moving car that drags the sheets along
  carFast: 1.5,      // a car slower than this stirs nothing
  pull: 0.35,        // share of the car's speed a sheet takes
  aside: 45,         // px/s it is thrown away from the car
  kick: 11,          // px: someone running this close kicks it
  runFast: 1.4,
  kickV: 55,         // px/s
};

// street fauna (systems/Critters.js); distances in tiles, speeds in px/s unless said otherwise
export const CRITTERS = {
  hit: 5,                  // px a bullet passes within to kill one
  reach: 28,               // px of a swing that kills one
  dead: 14,                // carcasses left lying
  rat: {
    nest: [4, 6],          // under each dumpster
    out: [2, 3],           // sent running by a blow
    speed: [95, 135],
    life: [5, 9],          // s before it looks for a hole
    fear: 2.5,             // it veers away from the player closer than this
    scare: 1.6,            // a passer-by this close jumps
  },
  pigeon: {
    walk: 14,
    fly: 230,
    climb: 0.7,            // s to be up
    away: 5,               // s on the wing before it is gone
    hear: 22,              // a shot within this sends them up
    near: 0.5,             // anyone this close
    shy: 1.7,              // the player this close
    run: 3,                // anyone running (or the cat) this close
    fast: 1.8,             // px/step: running
    flock: 1.5,            // one goes up: the others within this follow
  },
  cat: {
    speed: 250,
    life: [3, 5],          // s of flight before it slips away
    shy: 2,                // the player moving this close
    still: 0.4,            // px/step under which he is not moving
    hear: 16,
    car: 14,               // a parked car within this (tiles, along the way there) is where it hides
    tries: 3,              // nearest cars whose way is worked out
    nodes: 2500,           // path search budget
    low: 0.5,              // tiles from the car where it ducks low
    spook: 3,              // a shot this close (tiles) flushes it out of hiding
    hurt: 0.15,            // share of the car's hit points lost that makes it no shelter
    bin: 5,                // a bin within this on its way gets jumped on: it rattles, it does not move
    noise: 5,              // the clatter carries this far
    prowl: 60,             // px/s of its walk (its frames' pace, render/CritterArt.js; it only ever runs for now)
  },
  // flies per swarm, px it spreads over; s before a body draws them, bodies at most
  flies: { dumpster: 6, wide: 26, body: 4, close: 9, cold: 20, bodies: 4 },
  // moths round the lamps still lit, by kind of lamp: [x, y, n, r] = px from the prop's middle to its bulb (in the
  // prop's own frame), how many, px they wander off; fewer than under a streetlight. Out of doors only (the user's
  // rule): a bulb under a roof has none, whatever the lamp (Critters.lamps, systems/Weather.js openAir)
  moths: {
    at: {
      streetlight: [[56, 0, 3, 17]], neon_sign_bar: [[0, 0, 2, 16]], neon_sign_palm: [[0, 0, 2, 15]], neon_sign_liquor: [[0, 0, 2, 16]],
      string_lights: [[-40, 0, 1, 9], [40, 0, 1, 9]], wall_lamp: [[0, 3, 2, 12]],
      ceiling_lamp: [[0, 0, 2, 11]], pool_lamp: [[-12, 0, 1, 9], [12, 0, 1, 9]], tube_light: [[0, 3, 1, 10]],
      floor_lamp: [[0, 0, 1, 8]], table_lamp: [[0, 0, 1, 7]],
    },
  },
};

export const AMBIENT = {
  maxCars: 8,              // moving traffic vehicles at once (all lanes)
  maxWalkers: 9,           // civilians at once (all paths)
  margin: 3,               // m beyond the map edge (past the vehicle's half length) where traffic spawns / despawns
  prewarm: 0.6,            // fraction of the steady-state traffic / crowd placed on the street when the level starts
  // a passer-by placed there at the start is never set down within [across, along] m of the player (a retry starts him
  // on his feet, straight into them): he is moved on along his way, past him
  startClear: [4, 4],
  // driving
  speedVar: 0.12,          // per car cruise speed spread (fraction of the lane speed)
  accel: 3,                // m/s2 pulling away
  brake: 6,                // m/s2 comfortable braking (behind traffic)
  emergency: 9,            // m/s2 hard braking (sudden obstacle)
  headway: 1.2,            // s of time gap kept behind the vehicle ahead
  minGap: 1.6,             // m bumper to bumper when stopped
  lanePad: 0.15,           // m added to each side of a vehicle's width when looking for obstacles in its lane
  wobble: [0.12, 0.12],    // lateral drift: max amplitude (m), cycles per s (drivers are not on rails)
  steer: 0.9,              // heading correction per m of lateral error (rad)
  maxSteer: 0.22,          // rad
  patience: [2.5, 4.5],    // s stopped behind a static obstacle before going around it
  // going around it: m of extra stopping room behind it, rad of steering, m/s pulling out, s backing up when wedged
  detour: { room: 2, steer: 0.55, speed: 3, reverse: 1 },
  giveUp: 25,              // s at a standstill before a jammed driver switches the engine off (parked car)
  jam: 10,                 // s a lane's spawn stays blocked before the lane stops spawning (no deadlock)
  reopen: 6,               // s of clear lane before a closed lane spawns again
  panicBoost: 1.35,        // a driver under fire floors it
  coast: [2, 4],           // m/s2 a disabled car slows down with (dead driver / burst tyre / on fire)
  swerve: [0.5, 1.1],      // m a disabled car drifts sideways before it stops
  bailOut: 0.8,            // chance the driver of a burning / shot-up car gets out alive and runs
  // gunfire heard from the wheel: most drivers stop dead and run, the others floor it
  flee: { odds: 0.8, delay: [0.15, 0.9], passenger: 0.35 }, // delay: s of reaction; passenger: odds of a second runner
  // a gun held on a driver from within `range` m (on the car's width, give or take `slack` rad, in plain view) for
  // `notice` s (Ambient.aimedAt, Driver.heldUp): odds he stops and runs for it, stops dead hands up (until the gun has
  // been off him `resume` s, then away flat out), else floors it
  heldUp: { range: 9, slack: 0.08, notice: 0.35, flee: 0.45, duck: 0.35, resume: 2.2 },
  // a body in the road: px of the box a driver keeps off, s he creeps over it when there is no way round
  body: { box: 26, creep: 4 },
  // people vs cars
  lethal: 3.2,             // m/s: faster than this, a hit kills (one hit kills, guards and player alike)
  shove: 1.3,              // ragdoll launch speed as a fraction of the car speed
  attention: [0.55, 1.4],  // m (+ 0.25 s of travel) ahead where a driver notices a person: late, rarely stops in time
  // pedestrians (speeds in m/s)
  walk: [1.05, 1.45],
  run: [4.2, 5.2],
  coupleChance: 0.3,       // a spawn is two people walking side by side
  stopChance: 0.35,        // a walker stops once on the way (cigarette, shop window, phone)
  stop: [3, 7],            // s
  hurry: 1.8,              // pace of a passer-by walking away from a ringing alarm (x his walk)
  // a customer running off his spot: the chair within `chair` px is shoved back (`shove`, kg.px/step), odds his
  // glass goes over, odds he leaves a cigarette burning in the ashtray (for `burn` s, a thread of smoke off it).
  // A sleeper is woken by feet running (`tread` px/step) within `wake` px
  leave: { chair: 20, shove: [12, 26], glass: 0.6, butt: 0.45, burn: [30, 50], wake: 15, tread: 1.5 },
  panic: {
    hear: 1,               // fraction of a gunshot / explosion noise radius that panics passers-by
    witness: 9,            // m: a kill seen that close
    corpse: 4.5,           // m: a dead body in view
    armed: 4,              // m: the player with a weapon in hand
    spread: 6,             // m: a screaming passer-by panics the others around
    freeze: [0.35, 0.9],   // s of hands up / ducking before running
    // temperaments: most run for it, the others go to ground in a corner or stand there shaking
    hide: 0.24,            // odds of curling up out of sight (when such a spot is close)
    stay: 0.14,            // odds of freezing on the spot, hands up
    hideFor: [14, 26],     // s curled up before daring to run
    stayFor: [5, 10],      // s frozen
    bolt: 2.6,             // m: a weapon or a shot that close sets a frozen one running
    nook: 9,               // cells a hider runs to his corner, at most
    trip: 0.2,             // odds a runner falls flat once
    tripAfter: [0.6, 2.5], // s of running before he does
    check: 0.25,           // s between two sight checks (staggered)
    calm: 20,              // s without new passers-by after gunfire / an explosion (word gets around)
    // a runner cries out every `cry` s, a scream `scream` of the time (else a whine); his first cry on the run comes
    // one such wait after his fright's own (the user, 2026-11-16: a bit too often; was every 0.8-1.9 s, 3 in 4)
    cry: [1.3, 2.9],
    scream: 0.7,
  },
  // looking round at a commotion (Walker.notice): m of a noise's radius they turn at (share), m around a word a guard
  // has with the player, m around a man floored in a fight within which they back off, s they look, odds nobody says
  // anything about it (a shove always gets a word), the share of his pace a stroller keeps while he looks
  look: { noise: 0.35, word: 6, fight: 5, time: 2.5, say: 0.65, slow: 0.55 },
  runJam: { cost: 12, forget: 12 }, // a spot a runner was held up at: tiles of detour it is worth to the others, for s
  barkGap: 0.35,           // s between two civilian screams on screen
  cryLag: 0.9,             // s: each waits up to this long before he cries out, so a crowd does not scream as one
};

export const MAX_DEBRIS = 180;    // physical loose pieces alive at once (oldest get baked into the floor)
export const MAX_PARTICLES = 4000;

// Off-screen guard markers (systems/Threats.js, ui/Indicators.js): only guards the player can plausibly know about,
// just outside the view. Deliberately faint.
export const INDICATORS = {
  reach: 300,        // px beyond the screen edge: further guards get no marker at all
  seenFor: 5,        // s a guard seen on screen is remembered
  heardFor: 3,       // s after a shot, a shout or running steps
  runSpeed: 1.6,     // px/step: faster than this, his steps are heard
  seen: 0.55,        // marker strength of a remembered guard (a hunting one is 1)
  suspicious: 0.5,   // of a guard looking for the source of a noise
  alpha: 0.34,       // opacity of the strongest marker
  aimAlpha: 0.62,    // peak of the pulse when he has the player in his sights / just fired
};

// End-of-level replay (render/Replay.js): downscaled frames of the last seconds, saved as clips around the kills.
export const REPLAY = {
  w: 384, h: 216,    // px of a recorded frame
  fps: 15,
  frames: 30,        // length of the rolling buffer and of a clip (2 s)
  post: 0.75,        // s kept after the (last) kill of a clip
  lead: 0.5,         // s always kept before the first kill, however long the clip is stretched by more kills
  clips: 6,          // clips kept (the best ones): (clips + 1) * frames * w * h * 4 bytes of canvas, about 70 MB
  slow: 0.22,        // playback speed around a kill
  slowBefore: 0.3,   // s of slow motion before / after the kill frame
  slowAfter: 0.45,
  focus: 0.37,       // share of the screen width where the middle of the footage sits (the score column is on the right)
};

// Prop destruction (entities/Prop.js, data/destruction.js): caps that keep a shredded room cheap.
export const DESTRUCTION = {
  physicalShare: 0.6,  // above this share of MAX_DEBRIS, new pieces are visual shards only
  maxPhysicalParts: 6, // physical pieces per collapse (the rest are shards baked into the floor)
  heavyArea: 900,  // px2 of sprite: bigger furniture slumps in place instead of flying apart (blasts excepted)
  heavyParts: 7,   // big parts it leaves then
  maxBits: 18,         // loose contents spilled per collapse (balls, books...)
  maxFloats: 260,      // stuffing / paper / feathers floating at once
  maxLeaks: 3,         // liquid jets per prop
  stageDelay: [0.07, 0.16], // crack -> sag -> fall apart (s); explosions skip most of it
  crumble: 0.32,       // s the falling apart takes: its parts let go one after the other, from the blow outward
};

// What destruction leaves lying on the floor for good. Everything still flies; only part of the crumbs stay, and
// faint, so that blood, bodies and weapons remain the loudest things on the ground.
export const LITTER = {
  keep: 0.5,   // share of chips, glass slivers, fluff, cinders and tiny torn bits that leave a mark where they fall
  alpha: 0.7,  // how solid a crumb's mark is
  small: 28,   // px2 of image: a visual shard under this is a "tiny bit" (bigger pieces always stay)
  rubble: 14,  // crumbs painted on the floor of a breached wall tile
};

// A long map (the chase) is drawn in chunks along x (render/Chunks.js): the floor and the walls baked near the view and
// dropped far from it, the layers that hold marks (blood, flesh) made where something lands. A map no wider than
// `whole` tiles is one chunk, painted as it always was.
export const CHUNKS = {
  whole: 96,    // tiles: up to this wide, a map is a single chunk
  cols: 32,     // tiles across a chunk (full height)
  margin: 12,   // tiles past the view each way that are kept baked (what the camera is about to see)
  cache: 1,     // chunks out of that span kept anyway, the last seen first (clean ones: they can be baked again)
  // chunks with marks on them kept at most, per layer; past that the farthest from the view goes, its marks with it
  // (a floor chunk is four times the pixels of the others: it is painted at the tiles' density)
  keep: { floor: 4, walls: 8, blood: 10, flesh: 10 },
  pad: 2,       // world px a chunk reaches into its neighbours, drawn over them: no seam under a turned camera
  budget: 4,    // ms a frame given to baking the chunks ahead of the view (the one in view is finished at once)
  strip: 4,     // tiles: a floor chunk's tiles and wear are painted a strip of this width at a time
};

export const PALETTE = {
  pink: '#ff2a6d',
  cyan: '#05d9e8',
  purple: '#7a1fa2',
  yellow: '#f9c80e',
  orange: '#ff6b1a',
  white: '#fff4f0',
  ink: '#140c1c',
  blood: ['#780b0f', '#8c1014', '#9a1418', '#560709', '#aa1c1e'], // drops in the air; [3] dark meat, [4] wet flesh
};

// hit points of destructible wall tiles (bullet = 1, sniper = 3, explosions a lot). Walls are solid: rounds, blows
// and impacts only wear them, by WALL_WEAR of their hit points at most; only a blast brings one down
// (systems/Destruction.js damageWall), the sooner for that wear.
export const WALL_HP = { '#': 7, 'X': 14 };
export const WALL_WEAR = 0.5;
// width in px of the dark outline drawn along a wall's open faces (render/MapRenderer.js): what is painted on a wall
// (holes, blood, spills) stays behind it, only the dark of a hole may bite into it (render/WallScars.js)
export const WALL_RIM = 3;

// Vehicle lights in the sprite's local frame (px from the centre, +x forward): two headlight cones at (hx, +-hy)
// and two red tail light glows at (tx, +-ty). Positions match the lamps of the generated sprites.
const vehicleLights = (hx, hy, tx, ty) => [
  ...[-1, 1].map((s) => ({ r: 220, color: '#fff1c8', intensity: 0.85, x: hx, y: hy * s, cone: 0.42 })),
  ...[-1, 1].map((s) => ({ r: 48, color: '#ff1a3a', intensity: 0.7, x: tx, y: ty * s })),
];

// Lighting / post-processing (game/render/Lighting.js, PostFX.js). Light map colours are 0..1 multipliers of the scene.
export const LIGHTING = {
  enabled: true,
  scale: 0.5,              // light map texels per world px
  bloomScale: 0.25,        // bloom / reflection buffers, texels per world px
  ambient: {               // night tint per area (rgb 0..1)
    street: [0.26, 0.25, 0.4],
    inside: [0.22, 0.18, 0.36],
    neon: [0.36, 0.28, 0.5],
    wall: [0.2, 0.17, 0.32],
    roof: [0.17, 0.2, 0.34], // flat roofs of the neighbouring buildings: darker than the street, out of play
    void: [0.08, 0.06, 0.14],
  },
  falloff: [[0, 1], [0.12, 0.85], [0.35, 0.48], [0.65, 0.17], [1, 0]], // radial light profile (pos, alpha)
  softSamples: 3,          // jittered shadow samples (penumbra)
  softRadius: 3.5,         // px
  shadowBlur: 1,           // light map texels
  hungEvery: 6,            // frames: a swinging hung lamp's shadows are cast again at most this often (moved between)
  glass: 0.3,             // share of a light that gets through an intact pane (Lighting.updateGlass)
  rimWidth: 12,            // px of wall face lit along the visible edges
  rimAlpha: 1,
  dynamicGain: 1.1,        // muzzle flashes / explosions in the light map
  dynamicShadows: true,
  charLight: { player: [52, 0.5], enemy: [40, 0.32], color: '#b9a8ff' }, // [radius px, intensity]
  fireLight: 0.32,
  overbright: 0.2,         // soft-light pass of the light map (punch on lit areas)
  haze: 0.04,              // additive light scattering
  bloom: 0.7,              // the user found the lights too strong: "one sees nothing"; keep it diffuse
  bloomBlur: [2, 6],       // texels of the two bloom blurs
  coreGlow: 0.42,          // glow blob on every light source (bloom)
  bulb: 0.5,               // small crisp hot spot at every light source
  neonGlow: 0.85,          // dancefloor emissive into bloom
  flare: 0.32,             // anamorphic streaks of very bright lights
  reflect: 0.34,           // wet floor reflections
  shortStreak: { r: 130, k: 0.4 }, // a small light's (a sign, a wall lamp: r <= r px) reflection is k x r long, not 0.85 x r
  puddle: 0.4,             // extra reflections in standing water
  reflectFloors: ['asphalt', 'asphalt_line', 'sidewalk', 'checker', 'tile_blue', 'neon_floor'],
  bpm: 108,
  grade: { saturate: 1.22, contrast: 1.06, shadowTint: 'rgb(0,10,18)', highlightTint: 'rgba(255,40,190,0.07)' },
  grain: 0.05,
  aberration: 7,           // px at full camera trauma
  // lights of props whose def has no `light` field (upcoming props)
  // a mirror ball's spots (prop light `spots`): rad/s they turn at, px across, their colours
  ball: { turn: 0.32, size: 9, tints: ['#ffffff', '#ffffff', '#ffc2e6', '#bfeaff'] },
  propLights: {
    jukebox: { r: 90, color: '#ff4fd8', intensity: 0.85, flicker: 'pulse', y: 6 },
    neon_sign_palm: { r: 120, color: '#2af0ff', intensity: 1, flicker: 'buzz' },
    neon_sign_bar: { r: 120, color: '#ff2a6d', intensity: 1, flicker: 'broken' },
    neon_sign_arrow: { r: 72, color: '#ffc02a', intensity: 0.55, flicker: 'buzz' }, // small and bright: kept off the road (the user)
    streetlight: { r: 190, color: '#ffb46a', intensity: 0.9, x: 56 },
    car: vehicleLights(67, 15.5, -68, 17.5),
    car2: vehicleLights(56, 15, -65, 13.5),
    van: vehicleLights(77, 16.5, -76, 24),
    convertible: vehicleLights(81, 21, -82.5, 23),
    pursuer: vehicleLights(67, 15.5, -68, 17.5),
  },
};
