// Driving the car (systems/Drive.js; level 2A, docs/LEVEL2.md). Speeds in px per step at 60 Hz (1 m = 32 px: 60 km/h
// = 16.7 m/s = 8.9 px/step), along the road (+x) and across it (y); rates per second.
export const CHASE = {
  cruise: 8.9,          // the speed it runs at by itself (60 km/h); a level's `chase.cruise` overrides it. No throttle,
                        // no brake (the user's call, 2026-11-19): only what it hits slows it
  max: 11.1,            // the speed its looks are measured against (75 km/h: the wind, the lens' edges, all of them there)
  ease: 7,              // gained a second back up to the cruise speed (after a hit; pulling away in the lab)
  steer: 4,             // across the road, W / S held (up / down on the picture: W -y, S +y; A / D do the same)
  steerRate: 16,        // gained a second toward it (0.25 s to full)
  crawl: 0.35,          // share of the steering (and of the shove) it keeps at a crawl; it grows to all of it at cruise
  pull: 12,             // the road's pull: lost a second, nothing held (the nose straightens with it)
  // rad: the most the way it goes turns the nose off the road. Small on purpose: the car is drawn on a few fixed
  // angles (`pixel`), a lane change shows two of them, not a nose swinging through twenty degrees
  heading: 0.2,
  // the nose is on a spring toward the way it goes (yawStep): `k` (1/s2) its stiffness, `d` (1/s) its damping: all
  // but critically damped (2 x sqrt(k)), it turns in a little late and comes back without a wag (every wag is more
  // angle steps drawn); under `snap` rad and `snapV` rad/s of it, it is dead straight
  yaw: { k: 130, d: 22, snap: 0.004, snapV: 0.02 },
  // how a driven car is drawn while the picture is held on whole px (engine/Camera.js `pixel`; Vehicle.draw): on one
  // of `steps` angles round the circle (engine/math.js stepAngle, `slack` rad of hysteresis: about 1.5 degrees), at
  // a whole px of the picture; the physics keeps its real angle and place
  pixel: { steps: 64, slack: 0.026 },
  // the body on its springs, seen from above as the shell shifting over its wheels (Vehicle `squat` / `roll` / `lift`,
  // px, drawn in half px): it sits back `pitch` px for each px/step gained a second and dives as much on a hit,
  // rolls out of a bend `roll` px for each px/step a second of sideways push and `lean` px for each px/step it holds
  // across (`most` px either way); springs `k` (1/s2), `d` (1/s). `lift`: its bounce, px off its shadow: thrown up at
  // `hit` px/s by a car hit, `torn` by a thing torn off or run over, `kerb` when a front wheel changes ground (the
  // road, the sidewalk), `shove` by the shove, and by the road itself now and then at speed (`road`: [s between two,
  // at least and at most, px/s]); `most` px either way
  body: {
    pitch: 0.11, roll: 0.06, lean: 0.24, most: 1.5, k: 260, d: 14,
    lift: { k: 320, d: 9, hit: 34, torn: 22, kerb: 26, shove: 20, road: [0.3, 0.9, 7], most: 2.5 },
  },
  give: 0.3,            // what it runs at: no more than this over what it really did last step (a hit slows it)
  bounce: 2,            // a sideways bounce off what it leans on slower than this is dropped (it slides along it)
  fly: 0.05,            // s: driven, the floor's friction is not fighting the engine (refreshed each step)
  // px its flank is held short of the building fronts as he steers into them (Drive.offFronts): a shop's windows and
  // doors are set back in its front, and a corner sliding along caught in one and held the car there
  front: 2,
  // px: a driven car's body has its corners rounded this much (physics only, the sprite is drawn as it is): a square
  // corner sliding along the building fronts caught on the seam between two wall bodies and stopped the car for good
  corner: 7,
  // never stalled for good (Drive.unstick): crawling under `under` of its cruise speed for `after` s, not crashed, it
  // eases itself sideways out of what holds it (his way when he steers) at `steer` of the full sideways speed (the
  // other way when it has not moved `moved` px across in `after` s more), until it runs at `until` of its cruise again
  stall: { under: 0.25, after: 0.6, steer: 0.4, moved: 4, until: 0.6 },
  vehicle: 'convertible', // the model he drives in the chase (entities/Vehicle.js VEHICLES): THE BOSS's, roof down
  // where he sits and where its driver's door is, when the model gives none (VEHICLES[model].seat / .door, sprite px):
  // shares of its length (from the tail) and width (from the driver's side, -y; the door: px out from that side)
  seat: [0.74, 0.31],
  door: [0.72, 12],
  // SPACE, THE move: a lunge sideways toward the side he aims at (the mouse or the right stick above or below the
  // car's centre line): the sideways speed held at `v` for `dur` s, then given back at `back` px/step a second (far
  // faster than the road's pull: about 95 px in all, it lands in the next lane, not across the street; it was twice
  // that), then the steering again; once every `cooldown` s. What sells it: `shake`, the camera thrown `push` world px that way, the body rolled (`roll` px/s)
  // and thrown up (body.lift.shove), `smoke` puffs off each tyre, the lens (data/post.js speed.drive.kick). What it
  // does to a pursuer it meets: pursuit.shoved
  shove: { v: 8, dur: 0.1, back: 44, cooldown: 0.7, shake: 0.2, push: 5, roll: 30, smoke: 3 },
  // a nose-on hit on what does not give (a wall, a building, a `lasting` prop): faster than `speed` along the nose,
  // within `cone` rad of square on, he is dead; what it hit covering less than `corner` of its width (a corner
  // clipped), it is a jolt: the speed down to `clip`; less than `graze` px of it (the next wall body along the
  // building fronts, met at their seam as it slides on them), a scrape: nothing lost
  crash: { speed: 6, cone: (35 * Math.PI) / 180, corner: 0.2, clip: 3, graze: 6, shake: 0.9, dents: 4 },
  // what gives: a parked car is woken and shoved by the physics (thrown `fly` s, its alarm, a dent); hit square on
  // faster than crash.speed, the van keeps only `keep` of its speed. A bolted thing (a hydrant, a streetlight, a bench)
  // hit faster than `tear` is torn off (thrown with `power` at cruise speed, more the faster, `most` at most: over 2
  // it goes at once and its pieces fly); slower, it holds. Every hit takes `loss` of the speed. A car shoved
  // into another faster than `chain` shoves it on. A loose thing of `fling.kg` or less (a bin, a chair, a crate) is
  // thrown by hand (Drive.fling), however slow the car: at `v` times the car's speed (`least` px/step at least: out
  // of its way when it crawls), `side` rad out to the side it was hit on, turning up to `spin` rad/step, off the
  // floor `fly` s; it never holds the car up.
  hit: {
    fly: 0.3, keep: 0.35, tear: 0.8, power: 2.2, most: 3, loss: 0.03, again: 0.4, shake: 0.25, chain: 1,
    fling: { kg: 120, v: [0.9, 1.35], least: 2, side: [0.15, 0.7], spin: 0.35, fly: [0.25, 0.55] },
  },
  run: 2,               // a person hit faster than this is run down (one hit kills), thrown on along `throw` x speed
  throw: 1.4,
  // what its speed does around it (Drive.fx). Tyres let go over `from` px/step: in a shove (all of it), steering
  // over `slide` of the full sideways speed (`steer` of it): white smoke
  // [chance a wheel a step, px, s] and rubber left on the road (`marks`); standing water under a wheel: spray [chance
  // a step, drops, px/s], the level's `chase.water` patches filled `water` deep; `scare`: every `every` s, the
  // pigeons and cats within `r` px of the point `lead` s ahead go, the people within `people` px run; `debris`: what
  // flies off a thing hit (chips, sparks off steel, glass, sheets of paper [n, px/s]; their speed `speed` x the car's)
  fx: {
    from: 3, slide: 0.8, steer: 0.5, smoke: [0.5, 6, 0.9],
    marks: { w: 3.2, alpha: 0.42, color: '10, 8, 14' },
    spray: [0.7, 4, 170], water: 1.4,
    scare: { every: 0.15, lead: 0.55, r: 150, people: 110 },
    debris: { chips: 7, sparks: 6, glass: 8, papers: [2, 200], speed: 26 },
    // the air it moves, from `from` px/step up (all of it at `max`). wind: thin streaks of air whipping back past
    // it (drawn over the lighting, one world px thick: render/PursuitArt.js drawChaseWind): up to `n` alive, `len` px
    // long (longer the faster), going back over the ground at `v` x its speed (so they pass faster than the road),
    // `life` s, `alpha` at most, `band` px off its middle line to either side [from, to] (never over the car
    // itself), from `back` px behind it to `ahead` px ahead. dust: off each rear wheel, `chance` a step: a puff
    // [px wide, alpha, s]. wake: every `every` s something light is whipped up behind it: a sheet of paper (`paper`:
    // the odds; else leaves, `leaves` of them), thrown `v` x its speed along its way
    wind: { from: 6.5, n: 20, len: [12, 46], v: [0.5, 1.2], life: [0.22, 0.5], alpha: 0.4, band: [38, 210], back: 260, ahead: 620 },
    dust: { from: 5, chance: 0.3, puff: [4, 0.12, 0.8] },
    wake: { from: 7, every: [0.35, 1.1], paper: 0.45, leaves: 3, v: 0.55 },
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
  // the camera (Game.fit / updateCamera, Drive.frame). At the wheel the picture is drawn 1:1: the scene's canvas is
  // the window, at the whole zoom nearest to `view` world px of height (a level's `chase.view` overrides it; 3 at
  // 1080: 360 px; 4 at 1440: 360; 3 at 900: 300), and the lens scales nothing: a picture brought down by the lens,
  // a zoom that followed the speed, a camera that trailed the car each resampled every sprite every frame, the car
  // first. The camera is locked on the car along the road: it sits `at` of the view's width from the left, whatever
  // it does; across, the view stays on the street's middle (the level's `chase.mid`)
  camera: { view: 360, at: 0.33 },
  kmh: 6.75,            // km/h a px/step (60 steps a second, 32 px a metre)
  // his gun out of the car (systems/CarGun.js): it never runs dry at the wheel (the user's call, 2026-11-19: no
  // magazine counted, no reload, nothing to pick up). An OPEN car (THE BOSS's convertible): the gun at `arm` px from his
  // seat (data/feel.js SEAT.aim's arm and the gun), pointed anywhere within `cone` rad of the nose, to his left [0]
  // and to his right [1] (125 degrees each: 250 in all): out of his door, ahead OVER the low windscreen, across the
  // passenger seat, and back along both flanks; only the 110 degrees behind him stay out (he does not fire back over
  // his own shoulders and the boot). A closed car: one hand out of the driver's window (-y), `reach` px out of the
  // side; its arc is what that hand can point at without the car's own body in the way (the driver's side and ahead,
  // about 200 degrees), `margin` rad short of it. A long gun (`hold: 'two'`) stays down. `spread` is added to the
  // gun's own.
  gun: { reach: 8, arm: 20, margin: 0.04, spread: 0.02, cone: [2.18, 2.18] },
  // the pursuers (systems/Pursuit.js): black sedans driven by the same velocity-and-heading physics as his van.
  //   max: their top speed (px/step), well over his cruise so one joining is alongside in a second or two; accel /
  //   brake a second; turn: rad a
  //   second the heading turns (nose: the share of the body's error to it turned each step); heading: the most off
  //   the road in the chase (`pullOut` more at a standstill, less
  //   the faster it goes); close: px/step added per px the slot
  //   is ahead (the gap closed), lateral: per step of the error across, steer: the most across (px/step)
  //   slots: where they hold, ALONGSIDE him and ahead, all of them inside his gun's arc (`gun.cone`), none behind
  //   him: [px ahead of his car's middle, the lane: 'other' the one he is not in, 'his' his own]: `abreast` beside
  //   him, `lead` a car's length ahead in the other lane, `ahead` in his own lane (shot over the windscreen), `far`
  //   only for a fourth car (one more: `more` px further each). Which of them are held changes every `shuffle` s
  //   (pickSlots); the rearmost car takes the rearmost of them (nobody ever has to pass anybody). `flip`: px past
  //   the middle between two lanes before he counts as in the other one; `side`: px across from him, where there
  //   are no lanes (the lab); settle: px from the slot that counts as in it
  //   look: s of road ahead it looks for what stands in its lane (and `pad` px more), margin px either side; gap:
  //   px it keeps off a car going its way ahead of it, and off his nose and flanks when it has to come round him
  //   ram: once abreast `settle` s, `chance` a second of a side swipe at `v` px/step for `dur` s (rare)
  //   knock: what the physics did to it differing from what it was driving by more than `dv` px/step: it lost it for
  //   `stun` s (a hit), the physics alone moving it
  //   shoved: HIS SHOVE landing on it (once a shove): it costs it `cost` of its hp (two of them wreck it, in the
  //   open) and throws it sideways at `throw` px/step (lost `drag` of it a second: over half a lane), turning at
  //   `spin` rad/step, out of its driver's hands for `stun` s; thrown into a parked car, a pole or a wall it is
  //   wrecked at once (wreck.thrown)
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
  //   spawn: one joining from behind starts `behind` px back (just off the picture) at his speed + `over` (`clear`
  //   px past a wreck lying back there, if that is still `near` px behind him: off the picture); the alley car comes
  //   out at `cross`
  //   px/step and turns into the far lane `radius` px before it
  pursuit: {
    vehicle: 'pursuer', max: 14.5, accel: 14, brake: 14, turn: 2.6, nose: 0.18, heading: 0.45, pullOut: 0.6, close: 0.045, lateral: 0.07,
    steer: 4,
    slots: { abreast: [0, 'other'], lead: [165, 'other'], ahead: [220, 'his'], far: [340, 'other'] }, more: 175,
    shuffle: [4, 7], flip: 14, side: 80, settle: 18,
    look: 0.9, pad: 70, margin: 6, gap: 20,
    ram: { settle: 2, chance: 0.1, v: 5, dur: 0.3 },
    knock: { dv: 2.2, stun: 0.6 },
    shoved: { cost: 0.5, throw: 6, drag: 4, spin: 0.02, stun: 0.7 },
    wreck: { hard: 3.5, car: 4.5, thrown: 0.6, smoke: 0.5, fire: 0.25, poles: ['streetlight'] },
    veer: { steer: 0.5, fade: 1.2, out: 3 },
    spin: { turn: 0.22, keep: 0.6, dur: 1.4 },
    limp: 6, lost: 1600, rubber: { far: 520, t: 1.2, close: 200, held: 3 },
    spawn: { behind: 330, over: 5, clear: 260, near: 300, cross: 6.5, radius: 150 },
  },
  // the gunman leaning out of a pursuer's window on the runner's side and his TOLD shot (docs/LEVEL2.md telegraphs):
  //   r: his head and arm's hit circle (px), lean: px out of the window, seat: his x in the car (share of its length:
  //   the REAR door's window, well behind the windscreen, so a round for the driver does not take him too)
  //   range: px from his muzzle to the runner's seat he tells from, his car within `straight` rad of the road and the
  //   runner within `cone` rad of square out of his window (100 degrees: from a car ahead he leans out and fires
  //   back along its flank; never across his own car); `keep`: sprite px the runner's seat must be past his car's
  //   middle line before he changes window (no flutter from dead ahead); grace: s in the chase first;
  //   cool: s between two tells (any gunman: one tells at a time; two overlapping wait for the end of the route,
  //   docs/LEVEL2.md); none starts in the `quiet` px
  //   of road before an event that tells something itself (a red lane, the lorry), nor while it is told
  //   glint: s of the white glint at the muzzle, then `line` s of the red line fattening into a wedge, then the shot
  //   band: the bracket's box where it lands, locked when the tell starts: the y of the runner's seat then (+- half),
  //   its x then leading by his speed for the tell's length (+- lead); his seat in it at the shot: dead
  //   tracer: s the bone line of the shot hangs; window: px either side of a seat's x that is its side window (a
  //   round through it reaches him in a closed car; an open one, `open` in VEHICLES, is reached anywhere)
  //   lab: the dummy (station 19) tells every `every` s with the runner within `range` px, harmlessly
  gunman: {
    r: 7, lean: 6, seat: 0.42,
    range: 300, grace: 1, cool: [1.6, 2.4], quiet: 520, straight: 0.3, cone: 1.75, keep: 5,
    glint: 0.15, line: 0.6,
    band: { half: 22, lead: 40 },
    tracer: 0.14, window: 14,
    lab: { every: 3.2, range: 380 },
  },
  // the lorry backing out across the street (event 2, systems/Lorries.js): told `tell` s before it moves (a beep and
  // its reversing lamps every `beep` s, the lamps' flash `lamp`), then backing at `speed` px/s; `shake` as it stops;
  // the red lane where its tail sweeps is `pad` px wider than it each side; the lab's backs out with a driven car
  // within `range` px, stays `stay` s, and goes back in
  lorry: { tell: 0.9, beep: 0.3, speed: 115, shake: 0.2, pad: 6, lamp: { r: 70, color: '#fff4e0' }, lab: { range: 420, stay: 2.5 } },
  // the alley car's red lane (event 1, OUT OF THE ALLEY): shown `red` s before the car is in his lane
  alley: { red: 0.7, pad: 10 },
};
