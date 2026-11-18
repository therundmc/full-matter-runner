// Driving the van (systems/Drive.js; level 2A, docs/LEVEL2.md). Speeds in px per step at 60 Hz (1 m = 32 px: 60 km/h
// = 16.7 m/s = 8.9 px/step), along the road (+x) and across it (y); rates per second.
export const CHASE = {
  cruise: 8.9,          // the speed it keeps by itself (60 km/h); a level's `chase.cruise` overrides it
  max: 11.1,            // flat out (75 km/h), W held
  accel: 6,             // gained a second, W held
  brake: 14,            // lost a second, S held (down to a stop)
  ease: 3,              // a second back toward the cruise speed, nothing held (from above or below)
  steer: 4,             // across the road, A / D held (A: the van's left, -y)
  steerRate: 16,        // gained a second toward it (0.25 s to full)
  crawl: 0.35,          // share of the steering (and of the shove) it keeps at a crawl; it grows to all of it at cruise
  pull: 12,             // the road's pull: lost a second, nothing held (the nose straightens with it)
  heading: 0.35,        // rad: the most the nose turns off the road (it follows the way it goes)
  turn: 0.12,           // share of the nose's error turned each step (its spring back after a knock)
  give: 0.3,            // what it runs at: no more than this over what it really did last step (a hit slows it)
  bounce: 2,            // a sideways bounce off what it leans on slower than this is dropped (it slides along it)
  fly: 0.05,            // s: driven, the floor's friction is not fighting the engine (refreshed each step)
  vehicle: 'convertible', // the model he drives in the chase (entities/Vehicle.js VEHICLES): THE BOSS's, roof down
  // where he sits and where its driver's door is, when the model gives none (VEHICLES[model].seat / .door, sprite px):
  // shares of its length (from the tail) and width (from the driver's side, -y; the door: px out from that side)
  seat: [0.74, 0.31],
  door: [0.72, 12],
  // SPACE: a jolt sideways toward the mouse's side of the van (above or below its centre line): the sideways speed
  // held at `v` for `dur` s, then the steering again; once every `cooldown` s
  shove: { v: 7, dur: 0.18, cooldown: 1.2, shake: 0.12 },
  // a nose-on hit on what does not give (a wall, a building, a `lasting` prop): faster than `speed` along the nose,
  // within `cone` rad of square on, he is dead
  crash: { speed: 6, cone: (35 * Math.PI) / 180, shake: 0.9, dents: 4 },
  // what gives: a parked car is woken and shoved by the physics (thrown `fly` s, its alarm, a dent); hit square on
  // faster than crash.speed, the van keeps only `keep` of its speed. A bolted thing (a hydrant, a streetlight, a bench)
  // hit faster than `tear` is torn off (`power`); slower, it holds. Every hit takes `loss` of the speed. A car shoved
  // into another faster than `chain` shoves it on.
  hit: { fly: 0.3, keep: 0.35, tear: 2, power: 1.5, loss: 0.03, again: 0.4, shake: 0.25, chain: 1 },
  run: 2,               // a person hit faster than this is run down (one hit kills), thrown on along `throw` x speed
  throw: 1.4,
  // a flank against a wall or a car: sparks and the grind, every so often; the van's friction against what it leans on
  scrape: { every: 0.12, sparks: 6, vol: 0.6, friction: 0.08 },
  // the camera (Game.updateCamera): the view's height in world px goes with the speed, from view[0] stopped to
  // view[1] at `max` (the usual view is engine/Camera.js VIEW), eased over `zoom` s; the van held `lead` of the view's
  // width behind its middle (a third from the left: 1/6) at cruise, plus `lag` s of its way (what the camera trails
  // what it follows: engine/Camera.js update); its y drawn `road` of the way to the lanes' middle
  camera: { view: [330, 380], zoom: 0.6, lead: 1 / 6, lag: 0.14, road: 0.35 },
  kmh: 6.75,            // km/h a px/step (60 steps a second, 32 px a metre)
  // the lab's van (station 19 DRIVE): stopping it (`stop` px/step for `still` s, once it has gone) gets him out
  exit: { stop: 0.15, still: 0.5 },
};
