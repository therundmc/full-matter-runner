// The getaway's numbers (systems/Outro.js plays it: level 1's convertible, the van of a level that has one).
import { TILE } from '../Config.js';

export const OUTRO = {
  walk: 0.6,        // he walks to the driver's door (snapped there if not reached) ...
  vault: 0.55,      // ... and vaults over it into the seat (an open car), for that long
  sit: 0.62,        // share of the vault from which he settles into the seat (the seated pose comes in)
  key: [1.42, 0.3], // his right hand goes to the ignition: when it is there, and for how long there and back
  lights: 1.5,      // the key turned: lights on, the starter cranks the engine over ...
  catch: 2.05,      // ... until it catches, flaring (`flare`: revs, share of the redline, for s) then idling
  flare: [0.6, 0.16],
  jolt: [1.1, 0.25, 0.1], // as it catches the body kicks: px it sits back, s it takes to come back, the camera's shake
  go: 2.45,         // he floors it: the rear wheels spin where it stands ...
  spin: 0.8,        // ... for that long, then they bite and it goes
  creep: 0.55,      // px per step it crawls while they spin
  grip: 0.45,       // s the spin takes to die once they bite
  wag: [0.06, 7.5], // the tail wagging while they spin: rad, rad/s
  kick: -2.3,       // rad/s the tail is thrown at as they bite (the slide's spring brings it back: the fishtail)
  squat: 1.6,       // px the body sits back on its rear wheels while they spin
  screech: 0.9,     // how loud the tyres are held while they spin (the squeal of audio/Motor.js)
  speed: 8.6,       // px per step flat out on a straight
  corner: 5.2,      // ... and through a bend
  accel: 9,         // px per step gained in a second
  brake: 16,        // ... and lost in a second, braking into a bend
  look: 2.2 * TILE, // px ahead it sees a bend coming
  radius: 3 * TILE, // of a bend, when the level gives none (exit.radius, tiles, one per bend)
  slip: 0.5,        // rad its nose turns in further than its way through a bend: the tail is out
  spring: [46, 6.5], // stiffness and damping of that slide (under-damped: it swings back past straight once)
  pivot: 15,        // px ahead of its middle of the point that keeps to the route (a slide swings the tail)
  smoke: 0.14,      // rad of slide from which the rear tyres smoke and mark the floor
  maxDist: 9 * TILE, // the straight way out of a level without a route
  fade: 5,          // tiles before the end of the route where the fade starts (exit.fade)
  fadeDur: 0.75,    // s to black
  hold: 0.3,        // s of black before the results
  timeout: 14,      // s after which the results come up whatever happened
  bars: 0.09,       // height of each letterbox bar, share of the screen
  barsIn: 0.35,     // s for the bars to slide in
  door: 115,        // sprite x of the cab door of a model that gives no `door` (the van's sprite: 160 px, nose at +x)
  reach: 8 * TILE,  // a vehicle parked this close to the exit zone is the getaway
  cam: 0.5,         // s for the camera to go from the player to the driver's seat, from `walk` on
  lead: 70,         // px the camera looks ahead of him once it moves
  // the rubber laid on the floor (decals): px wide, how dark while the wheels spin / while it slides
  marks: { w: 3.4, spin: 0.5, slide: 0.32, color: '10, 8, 14' },
  // what the rear wheels throw up. spinSmoke / slideSmoke: [puffs a wheel a step, px, s] of the white tyre smoke
  // while they spin / [chance a step, px, s] while it slides; grit: for `dur` s from the launch, gravel thrown back [chance a step, px/s], its
  // colours; spray: a wheel in a puddle [chance a step, drops, px/s]; sparks: the tail's low corner on the ground
  // from `from` rad of slide [chance a step, n]; wake: papers within `r` px dragged along at `pull` of its speed,
  // thrown `aside` px/s
  fx: {
    spinSmoke: [3, 12, 1.9], slideSmoke: [0.8, 7, 1],
    grit: { dur: 1.3, chance: 0.8, speed: 260, colors: ['#6a6272', '#4a4452', '#8a8290'] },
    spray: [0.6, 3, 150],
    sparks: { from: 0.36, chance: 0.5, n: 3 },
    wake: { r: 70, pull: 0.5, aside: 60 },
  },
  // what lay on the rear seat (Vehicle `hat`) flies out at the first swing of the tail harder than `slip` rad: thrown
  // `keep` of the car's speed on, `side` px/s to the outside of the swing
  hat: { slip: 0.3, keep: 0.45, side: 90 },
  // what the car does to what it runs into (Vehicle.ram): crush = the blow a loose thing takes (hp), fling = px/step
  // it is thrown at if it survives, aside = rad off the car's way, to the side it was on, spin = rad/step; tear =
  // the power a bolted thing is torn off with; again = s before a thing still under the wheels is hit again; shake =
  // the camera's; papers = sheets that fly off each thing hit [n, px/s]. A parked car (Vehicle.shove / crunch) is
  // never driven through: shoved at carK of the getaway's speed (car px/step at least), spun at carSpin rad/step,
  // carFly s without floor friction, both scaled down for a graze (bite: px of the getaway's width in it for the
  // full blow; graze: the least share); crumpled where it is struck (dents round the point, the lamp at that end
  // smashed within `lamp` sprite px of it, `chunks` bits of paint and trim, carHp lost); the getaway keeps carKeep of
  // its speed, the camera shaken carShake and pushed in `punch`
  ram: {
    crush: 40, fling: [6, 10], aside: [0.35, 0.9], spin: 0.45, tear: 1.5, again: 0.3, fly: 0.35, shake: 0.3, papers: [3, 220],
    car: 3, carK: 0.5, carAside: [0.7, 1], carSpin: 0.06, carFly: 0.12, bite: 16, graze: 0.3, dents: 3, lamp: 24, chunks: 7, carHp: 6, carKeep: 0.85, carShake: 0.6, punch: 0.06,
  },
};
