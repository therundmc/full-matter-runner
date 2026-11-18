// Driving the van (systems/Drive.js; level 2A, docs/LEVEL2.md). Speeds in px per step at 60 Hz (1 m = 32 px: 60 km/h
// = 16.7 m/s = 8.9 px/step), along the road (+x) and across it (y); rates per second.
export const CHASE = {
  cruise: 8.9,          // the speed it keeps by itself (60 km/h); a level's `chase.cruise` overrides it
  max: 11.1,            // flat out (75 km/h), W held
  accel: 9,             // gained a second, W held
  brake: 14,            // lost a second, S held (down to a stop)
  ease: 7,              // a second back toward the cruise speed, nothing held (from above or below)
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
  // within `cone` rad of square on, he is dead; what it hit covering less than `corner` of its width (a corner
  // clipped), it is a jolt: the speed down to `clip`
  crash: { speed: 6, cone: (35 * Math.PI) / 180, corner: 0.2, clip: 3, shake: 0.9, dents: 4 },
  // what gives: a parked car is woken and shoved by the physics (thrown `fly` s, its alarm, a dent); hit square on
  // faster than crash.speed, the van keeps only `keep` of its speed. A bolted thing (a hydrant, a streetlight, a bench)
  // hit faster than `tear` is torn off (thrown with `power` at cruise speed, more the faster, `most` at most: over 2
  // it goes at once and its pieces fly); slower, it holds. Every hit takes `loss` of the speed. A car shoved
  // into another faster than `chain` shoves it on. A loose thing of `fling.kg` or less (a bin, a chair, a crate) is
  // thrown by hand (Drive.fling): at `v` times the car's speed, `side` rad out to the side it was hit on, turning up
  // to `spin` rad/step, off the floor `fly` s.
  hit: {
    fly: 0.3, keep: 0.35, tear: 0.8, power: 2.2, most: 3, loss: 0.03, again: 0.4, shake: 0.25, chain: 1,
    fling: { kg: 120, v: [0.9, 1.35], side: [0.15, 0.7], spin: 0.35, fly: [0.25, 0.55] },
  },
  run: 2,               // a person hit faster than this is run down (one hit kills), thrown on along `throw` x speed
  throw: 1.4,
  // what its speed does around it (Drive.fx). Tyres let go over `from` px/step: in a shove (all of it), on the brakes
  // (`brake` of it, all four wheels), steering over `slide` of the full sideways speed (`steer` of it): white smoke
  // [chance a wheel a step, px, s] and rubber left on the road (`marks`); standing water under a wheel: spray [chance
  // a step, drops, px/s], the level's `chase.water` patches filled `water` deep; `scare`: every `every` s, the
  // pigeons and cats within `r` px of the point `lead` s ahead go, the people within `people` px run; `debris`: what
  // flies off a thing hit (chips, sparks off steel, glass, sheets of paper [n, px/s]; their speed `speed` x the car's)
  fx: {
    from: 3, slide: 0.8, steer: 0.5, brake: 0.7, smoke: [0.5, 6, 0.9],
    marks: { w: 3.2, alpha: 0.42, color: '10, 8, 14' },
    spray: [0.7, 4, 170], water: 1.4,
    scare: { every: 0.15, lead: 0.55, r: 150, people: 110 },
    debris: { chips: 7, sparks: 6, glass: 8, papers: [2, 200], speed: 26 },
  },
  // the card that closes a chase not finished yet (level `chase.next`, Game state 'continued'; Drive.finishView): the
  // picture goes black over `fade` s, TO BE CONTINUED comes up at `title` and what is next at `name` (each over `rise`
  // s), a key passes it after `skipAfter`, the results follow at `hold`
  finish: { fade: 1.1, title: 0.9, name: 1.5, rise: 0.35, skipAfter: 1.6, hold: 5 },
  // dead at the wheel (a told shot): the car runs on, losing `slow` px/step a second, drifting `drift` of its full
  // sideways speed toward the kerb (Drive.coast)
  coast: { slow: 3.2, drift: 0.22 },
  // a flank against a wall or a car: sparks and the grind, every so often; the van's friction against what it leans on
  scrape: { every: 0.12, sparks: 6, vol: 0.6, friction: 0.08 },
  // the camera (Game.updateCamera): the view's height in world px goes with the speed, from view[0] stopped to
  // view[1] at `max` (the usual view is engine/Camera.js VIEW), eased over `zoom` s; the van held `lead` of the view's
  // width behind its middle (a third from the left: 1/6) at cruise, plus `lag` s of its way (what the camera trails
  // what it follows: engine/Camera.js update); its y drawn `road` of the way to the lanes' middle
  camera: { view: [345, 392], zoom: 0.6, lead: 1 / 6, lag: 0.14, road: 0.75 },
  kmh: 6.75,            // km/h a px/step (60 steps a second, 32 px a metre)
  // the lab's van (station 19 DRIVE): stopping it (`stop` px/step for `still` s, once it has gone) gets him out
  exit: { stop: 0.15, still: 0.5 },
  // his gun out of the car (systems/CarGun.js): one hand out of the driver's window (-y), `reach` px out of the side
  // (an open car: at `arm` px from his seat, data/feel.js SEAT.aim's arm and the gun);
  // his arc is what that hand can point at without the car's own body in the way (the driver's side and ahead, about
  // 200 degrees), `margin` rad short of it; a long gun (`hold: 'two'`) stays down. `spread` is added to the gun's own.
  gun: { reach: 8, arm: 20, margin: 0.04, spread: 0.02 },
  // the pursuers (systems/Pursuit.js): black sedans driven by the same velocity-and-heading physics as his van.
  //   max: their top speed (px/step), a bit over his flat out so they catch him; accel / brake a second; turn: rad a
  //   second the heading turns; heading: the most off the road in the chase (`pullOut` more at a standstill, less
  //   the faster it goes); close: px/step added per px the slot
  //   is ahead (the gap closed), lateral: per step of the error across, steer: the most across (px/step)
  //   slots: px from his car's middle (x along the road, y toward his driver's side, -y): `side` alongside in the
  //   other lane (its gunman's line), `behind` in his own lane; settle: px from the slot that counts as in it
  //   look: s of road ahead it looks for what stands in its lane (and `pad` px more), margin px either side
  //   ram: once in the side slot `settle` s, `chance` a second of a side swipe at `v` px/step for `dur` s
  //   knock: what the physics did to it differing from what it was driving by more than `dv` px/step: it lost it for
  //   `stun` s (the shove, a hit), the physics alone moving it
  //   wreck: a contact closing at `hard` px/step on what does not give (a wall, a lasting thing, one of the `poles`;
  //   a bolted thing is torn off as by his van), or `car` on
  //   another car (not his: being rammed only knocks it): wrecked, `thrown` of that within 2 s of a knock from his
  //   car; it is left with `smoke` of its hp (engine smoke), `fire` the chance it catches
  //   veer: the driver shot: the wheel turned `steer` rad to a side, the speed fading `fade` px/step a second; wrecked
  //   after `out` s if nothing stopped it
  //   spin: a front tyre: spun at `turn` rad/step, `keep` of its speed, out of it after `dur` s; limp: a rear tyre,
  //   its top speed cut to `limp`; lost: `lost` px behind him, it is out of the chase
  //   rubber: in the chase but more than `far` px behind him for `t` s, or more than `close` px from its slot for
  //   `held` s, off the picture: brought back up behind it, on its slot's line
  //   spawn: one joining from behind starts `behind` px back at his speed + `over` (`clear` px past a wreck lying
  //   back there, if that is still `near` px behind him: off the picture); the alley car comes out at `cross`
  //   px/step and turns into the far lane `radius` px before it
  pursuit: {
    vehicle: 'pursuer', max: 12, accel: 7, brake: 14, turn: 2.6, heading: 0.45, pullOut: 0.6, close: 0.025, lateral: 0.07,
    steer: 4,
    slots: { side: [0, -80], behind: [-190, 0] }, settle: 18,
    look: 0.9, pad: 70, margin: 6,
    ram: { settle: 1.2, chance: 0.28, v: 5, dur: 0.3 },
    knock: { dv: 2.2, stun: 0.6 },
    wreck: { hard: 3.5, car: 4.5, thrown: 0.6, smoke: 0.5, fire: 0.25, poles: ['streetlight'] },
    veer: { steer: 0.5, fade: 1.2, out: 3 },
    spin: { turn: 0.22, keep: 0.6, dur: 1.4 },
    limp: 6, lost: 1600, rubber: { far: 520, t: 1.2, close: 200, held: 3 },
    spawn: { behind: 620, over: 3.2, clear: 260, near: 430, cross: 6.5, radius: 150 },
  },
  // the gunman leaning out of a pursuer's window on his side and his TOLD shot (docs/LEVEL2.md telegraphs):
  //   r: his head and arm's hit circle (px), lean: px out of the window, seat: his x in the car (share of its length:
  //   the REAR door's window, well behind the windscreen, so a round for the driver does not take him too)
  //   range: px from his muzzle to the runner's seat he tells from, his car within `straight` rad of the road and the
  //   runner within `cone` rad of square out of his window (never across his own car); grace: s in the chase first;
  //   cool: s between two tells (any gunman: one tells at a time early on, `atOnce`); none starts in the `quiet` px
  //   of road before an event that tells something itself (a red lane, the lorry), nor while it is told
  //   glint: s of the white glint at the muzzle, then `line` s of the red line fattening into a wedge, then the shot
  //   band: the bracket's box where it lands, locked when the tell starts: the y of the runner's seat then (+- half),
  //   its x then leading by his speed for the tell's length (+- lead); his seat in it at the shot: dead
  //   tracer: s the bone line of the shot hangs; window: px either side of a seat's x that is its side window (a
  //   round through it reaches him in a closed car; an open one, `open` in VEHICLES, is reached anywhere)
  //   lab: the dummy (station 19) tells every `every` s with the runner within `range` px, harmlessly
  gunman: {
    r: 7, lean: 6, seat: 0.42,
    range: 300, grace: 1, cool: [1.6, 2.4], atOnce: 1, quiet: 520, straight: 0.3, cone: 1.2,
    glint: 0.15, line: 0.6,
    band: { half: 22, lead: 40 },
    tracer: 0.14, window: 14,
    lab: { every: 3.2, range: 380 },
  },
  // a killed gunman's gun (or a magazine) thrown onto the road `ahead` px of the runner in his lane, `chance` of it;
  // the car picks it up driving over it (within `r` px of its middle line): its rounds into his pools
  pickup: { chance: 0.5, ahead: 340, r: 26, fly: 0.45 },
  // the lorry backing out across the street (event 2, systems/Lorries.js): told `tell` s before it moves (a beep and
  // its reversing lamps every `beep` s, the lamps' flash `lamp`), then backing at `speed` px/s; `shake` as it stops;
  // the red lane where its tail sweeps is `pad` px wider than it each side; the lab's backs out with a driven car
  // within `range` px, stays `stay` s, and goes back in
  lorry: { tell: 0.9, beep: 0.3, speed: 115, shake: 0.2, pad: 6, lamp: { r: 70, color: '#fff4e0' }, lab: { range: 420, stay: 2.5 } },
  // the alley car's red lane (event 1, OUT OF THE ALLEY): shown `red` s before the car is in his lane
  alley: { red: 0.7, pad: 10 },
};
