// Global tuning. World units are pixels; 1 tile = TILE px.
import { TILE } from '../engine/physics/Units.js';

export { TILE }; // 1 tile = 1 m = 32 px (see engine/physics/Units.js)
export const FIXED_DT = 1 / 60;          // simulation step (seconds of game time at timeScale 1)
export const BASE_DELTA = 1000 / 60;     // Matter base delta (ms)

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

export const PLAYER = {
  radius: 8.5,
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
  },
  // after a drop from a height (over a prop whose def has land: 'roll', down to the ground): a forward shoulder roll
  roll: {
    dur: 0.46,        // s, at full length
    dist: 44,         // px rolled when nothing is in the way (less when something is)
    exit: 0.75,       // speed handed back to the run at the end, x the roll's mean speed
    noise: 70,        // px the guards hear the landing at (a flat landing: 120)
  },
};

// Space right behind a standing guard who has his back to us (systems/Takedown.js, Player.updateTakedown):
// arms round his neck, one wrench; with the knife, his throat. Silent, but it takes its time.
export const TAKEDOWN = {
  reach: 26,     // px between the two
  rear: 1.05,    // half-angle (rad) of the arc behind his back we must stand in
  facing: 1.2,   // how far (rad) we may be aiming away from him
  dur: 0.62,     // s, the whole move
  killAt: 0.56,  // share of it at which the neck goes
};

// One guard (entities/Enemy.js, ai/Perception.js). Times in seconds, distances in px, angles in rad.
export const ENEMY = {
  radius: 8.5,
  walkSpeed: 1.0,
  runSpeed: 2.35,
  viewDist: 340,
  fov: Math.PI * 0.62,
  focusCone: 0.3,         // half-angle of the sharp centre of the view cone
  closeSense: [20, 46, 90], // 360° awareness radius by awareness (unaware / suspicious / alert)
  // detection meter (0..1): '?' from `suspicious`, '!' (combat) at 1
  spotTime: [0.45, 2.0],  // seconds to fill it at point blank / at viewDist (player still, centre of view, lit)
  suspicious: 0.3,
  peripheral: 0.35,       // detection multiplier at the edge of the view cone
  motion: [0.6, 0.95, 1.25], // detection multiplier: player still / walking / running
  light: [0.35, 1.1],     // detection multiplier = light[0] + light[1] * brightness (0 dark .. 1 lit)
  meterDecay: [0.16, 0.05], // meter loss per second out of sight (unaware / suspicious)
  visionTick: 0.05,       // line-of-sight check period while unaware (staggered between guards)
  // meter level a noise brings a guard to (footsteps add up instead, capped below alert)
  hear: { gunshot: 0.75, allyFire: 0.6, explosion: 0.75, wall: 0.6, glass: 0.5, door: 0.4, thrown: 0.5, body: 0.45, noise: 0.45, footsteps: 0.18 },
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
  dizzy: [1.0, 1.6],      // stagger after getting up from a knock-down
};

// Squad brain (ai/Director.js): alert phases, noises, search sweeps, budgets.
export const AI = {
  vigilance: { normal: 1, caution: 1.3, evasion: 1.5, alert: 1.7 }, // detection speed per phase
  // soundtrack intensity per phase (Music: beatless under 0.45, a heartbeat, the beat from 0.7), and what the
  // fight itself adds on top: heat 0..1 gained per event, lost in `cool` s, worth `gain` of intensity
  music: { normal: 0.25, caution: 0.55, evasion: 0.75, alert: 0.85 },
  heat: { shot: 0.12, kill: 0.7, blast: 0.6, cool: 14, gain: 0.5 },
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
  noiseGap: 0.25,         // the same source is heard at most this often (automatic fire)
  planBudget: 6,          // expensive AI work per step (path = 1, cover / flank search = 3)
  // The player's wet or bloody footprints (ai/Trail.js, Enemy.doTrack). fresh: s a print stays readable; max: prints
  // kept; gap: px between two prints of the same run; hop: px a tracker walks at a time; sight: share of the view
  // distance at which a print is noticed, close: px all around; ahead: px he goes on past the last print.
  // doorways, one at a time: how long a guard waits for a mate in the frame (s, walking / running) and how far
  // back from it he stands (px)
  gate: { calm: 3, rush: 1.2, room: 46, far: 96 },
  trail: { fresh: 45, max: 48, gap: 60, hop: 70, sight: 0.45, close: 36, ahead: 96 },
  // a doorman's eyes follow whoever comes within `range` px and `arc` rad of the way he stands, at `turn` rad/s
  gaze: { range: 176, arc: 1.9, turn: 4 },
  // tipping a table over for a shield: px from the cover spot to the table at most, px to be at it, s to get there,
  // px of extra way such a spot is worth
  flip: { reach: 40, near: 6, time: 0.8, pull: 96 },
  duck: [2.5, 4],          // s a bartender stays down behind his counter at the first shots
  // how a guard carries his weapon (ai/Carry.js), in s: putting it away, drawing a pistol or a blade, bringing a
  // long gun round from his back, raising it on a target; ready: how far out (0..1) it must be to fire
  carry: { holster: 0.7, draw: 0.22, unsling: 0.34, raise: 0.16, ready: 0.3 },
  // two calm guards within `near` px (one of them walking by: `pass`) stop for a word: for `time` s, then not
  // again for `every` s; line: odds a turn to talk comes with a line over his head
  chat: { near: 84, pass: 56, time: [6, 11], every: [25, 50], line: 0.7 },
  // a guard goes and relieves himself (ai/Pastimes.js reliefSpot) every `every` s (the first time after `first`),
  // odds per idle pick, for `time` s; a spot not reached in `giveUp` s is forgotten
  relief: { odds: 0.12, every: [90, 180], first: [15, 120], time: [7, 10], giveUp: 6 },
  barkGap: 0.4,           // seconds between two barks in the whole squad
  barkMemory: 8,          // lines the squad has just used and will not repeat
  tauntGap: [6, 12],      // seconds between two curses of a guard in a fight
  // The last guard alive may give up when he next faces the armed player within `range` px (Enemy.surrender):
  // only in a squad of at least `squad`, with these odds (a brute rarely does); beg: s between two pleas.
  surrender: { squad: 4, odds: 0.55, brute: 0.15, range: 230, beg: [2.4, 4.5] },
  // An unarmed stranger hanging about in front of a guard on public ground (Perception.loiterRate, Enemy.mind):
  // bothered within `near` px; patience = seconds before he snaps at `near` / at `close` px; shares of it at which
  // he tells him to clear off (`first`) and warns him a last time (`last`); `forget` = share won back per second.
  loiter: { near: 120, close: 40, patience: [8, 2.4], first: 0.12, last: 0.55, forget: 0.1 },
};

export const PHYSICS = {
  pushForce: 650, // N a character can shove with (heavier/grippier objects won't budge)
  substeps: 2,    // Matter updates per simulation step (smoother contacts)
};

// Wet floors (systems/Liquids.js). Lengths in px, areas in px2, times in s.
export const LIQUIDS = {
  maxPuddles: 16, // one more and the smallest soaks away
  grip: 0.55,     // floor grip multiplier where it is wet
  minPool: 4,     // a blood pool smaller than this wets no shoe
  stride: 17,     // between two footprints (alternating feet)
  gait: 3,        // half the distance between the left and the right foot
  smear: 7,       // length of one stroke of a slide's smear
  fade: 6,        // a drying puddle fades out over its last seconds
  // prints: steps a wet sole keeps marking; wet: seconds it stays wet once nothing feeds it;
  // color / alpha: of the prints; splash: drops kicked up when running through it (quiet: without the slosh);
  // puddle: how it stands on the floor: body, the paler sheen inside, glints, the rings while something pours in,
  // foam at its edge
  kinds: {
    blood: { prints: 16, wet: 45, color: '#5c0a0c', alpha: 0.9 },
    water: {
      prints: 9, wet: 70, color: '#0b0f1c', alpha: 0.55, splash: 'rgba(110,160,200,0.14)',
      puddle: { body: 'rgba(6,10,24,0.3)', sheen: 'rgba(120,170,230,0.06)', glint: '#bcd8ff', ring: 'rgba(170,210,255,0.16)' },
    },
    // beer, whisky: brown, sticky, a thin film
    booze: {
      prints: 7, wet: 55, color: '#2c1806', alpha: 0.5, splash: 'rgba(150,96,36,0.3)', quiet: true,
      puddle: { body: 'rgba(36,15,3,0.62)', sheen: 'rgba(168,92,22,0.24)', glint: '#ffd9a0', ring: 'rgba(236,190,120,0.2)', foam: '#e8d8b0' },
    },
  },
  hydrant: { kind: 'water', rate: 2600, dur: 12, cap: 96 }, // a burst hydrant gushes for dur s and floods ~3 m around it
  leak: 260,      // px2 per second out of a pierced tank, keg or pipe (Prop.leak)
};

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

// Steam in the street (systems/Steam.js): manholes breathing, wall vents, steam pipes a round went through
export const STEAM = {
  color: '#d4dade',
  range: 620,        // px from the player past which nothing is puffed
  drift: [-9, -5],   // px/s: the night air carries it
  manhole: { breath: 3.5, rest: [4, 9], every: 0.14, size: 5, life: 2.8, alpha: 0.26 },
  vent: { every: 0.18, size: 4, life: 2.4, alpha: 0.32, speed: 22 },
  leak: { dur: 7, every: 0.05, speed: 90, max: 3 }, // max holes per pipe
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

// the cloud out of a pierced extinguisher (systems/Clouds.js); px and seconds
export const CLOUD = {
  jet: 2.4,                // s it sprays
  speed: 105,              // px/s of the powder leaving the nozzle
  reach: 40,               // how far from the wall the heart of the cloud ends up
  r: 46,                   // its radius once swollen (`grow` s)
  grow: 1.4,
  life: 9,                 // s in all, the last `fade` thinning away
  fade: 2.5,
  every: 0.04,             // s between two puffs of the jet
  core: 0.8,               // share of the radius nobody sees through
  color: '#eef1f4',
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
  },
  // flies per swarm, px it spreads over; s before a body draws them, bodies at most
  flies: { dumpster: 6, wide: 26, body: 4, close: 9, cold: 20, bodies: 4 },
  moths: { n: 2, at: { streetlight: 56, wall_lamp: 0, neon_sign_bar: 0, neon_sign_palm: 0, neon_sign_liquor: 0 } }, // px along the prop to its lamp
};

export const AMBIENT = {
  maxCars: 8,              // moving traffic vehicles at once (all lanes)
  maxWalkers: 9,           // civilians at once (all paths)
  margin: 3,               // m beyond the map edge (past the vehicle's half length) where traffic spawns / despawns
  prewarm: 0.6,            // fraction of the steady-state traffic / crowd placed on the street when the level starts
  // driving
  speedVar: 0.12,          // per car cruise speed spread (fraction of the lane speed)
  accel: 3,                // m/s² pulling away
  brake: 6,                // m/s² comfortable braking (behind traffic)
  emergency: 9,            // m/s² hard braking (sudden obstacle)
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
  coast: [2, 4],           // m/s² a disabled car slows down with (dead driver / burst tyre / on fire)
  swerve: [0.5, 1.1],      // m a disabled car drifts sideways before it stops
  bailOut: 0.8,            // chance the driver of a burning / shot-up car gets out alive and runs
  // gunfire heard from the wheel: most drivers stop dead and run, the others floor it
  flee: { odds: 0.8, delay: [0.15, 0.9], passenger: 0.35 }, // delay: s of reaction; passenger: odds of a second runner
  // people vs cars
  lethal: 3.2,             // m/s: faster than this, a hit kills (one hit kills, guards and player alike)
  shove: 1.3,              // ragdoll launch speed as a fraction of the car speed
  attention: [0.55, 1.4],  // m (+ 0.25 s of travel) ahead where a driver notices a person: late, rarely stops in time
  passby: { lead: 1.4, range: 15, vol: 0.55 }, // s before the closest pass, m of lateral hearing range, loudness
  // pedestrians (speeds in m/s)
  walk: [1.05, 1.45],
  run: [4.2, 5.2],
  coupleChance: 0.3,       // a spawn is two people walking side by side
  stopChance: 0.35,        // a walker stops once on the way (cigarette, shop window, phone)
  stop: [3, 7],            // s
  hurry: 1.8,              // pace of a passer-by walking away from a ringing alarm (x his walk)
  // a customer running off his spot: the chair within `chair` px is shoved back (`shove`, kg.px/step), odds his
  // glass goes over, odds he leaves a cigarette burning in the ashtray (for `burn` s, a wisp every `wisp` s).
  // A sleeper is woken by feet running (`tread` px/step) within `wake` px
  leave: { chair: 20, shove: [12, 26], glass: 0.6, butt: 0.45, burn: [30, 50], wisp: 0.5, wake: 15, tread: 1.5 },
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
  },
  barkGap: 0.35,           // s between two civilian screams on screen
  cryLag: 0.7,             // s: each waits up to this long before he cries out, so a crowd does not scream as one
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

// hit points of destructible wall tiles (bullet = 1, sniper = 3, explosions a lot)
export const WALL_HP = { '#': 7, 'X': 14 };

// Vehicle lights in the sprite's local frame (px from the centre, +x forward): two headlight cones at (hx, ±hy)
// and two red tail light glows at (tx, ±ty). Positions match the lamps of the generated sprites.
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
    neon_sign_arrow: { r: 100, color: '#ffc02a', intensity: 0.9, flicker: 'buzz' },
    streetlight: { r: 190, color: '#ffb46a', intensity: 0.9, x: 56 },
    car: vehicleLights(67, 15.5, -68, 17.5),
    car2: vehicleLights(56, 15, -65, 13.5),
    van: vehicleLights(77, 16.5, -76, 24),
  },
};
