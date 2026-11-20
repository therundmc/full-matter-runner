// Driving the car (systems/Drive.js; level 2A, docs/LEVEL2.md). Speeds in px per step at 60 Hz (1 m = 32 px: 60 km/h
// = 16.7 m/s = 8.9 px/step), along the road (+x) and across it (y); rates per second.
export const CHASE = {
  cruise: 8.9,          // the speed it runs at by itself (60 km/h); a level's `chase.cruise` overrides it. No throttle,
                        // no brake (the user's call, 2026-11-19): only what it hits slows it
  max: 11.1,            // the speed its looks are measured against (75 km/h: the wind, the lens' edges, all of them there)
  ease: 7,              // gained a second back up to the cruise speed (after a hit; pulling away in the lab)
  steer: 4,             // across the road, W / S held (up / down on the picture: W -y, S +y; A / D do the same)
  steerRate: 16,        // gained a second toward it (0.25 s to full) at the cruise speed; less flat out and in a slide (slide)
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
  // `buzz`: at speed (from `from` px/step) the shell shivers on its wheels: a blip of `px` across every `every` s
  // [from, to], one step long (drawn on the sprite's own px grid as the rest: crisp)
  body: {
    buzz: { from: 8, px: 0.5, every: [0.14, 0.4] },
    pitch: 0.11, roll: 0.06, lean: 0.24, most: 1.5, k: 260, d: 14,
    lift: { k: 320, d: 9, hit: 34, torn: 22, kerb: 26, shove: 20, road: [0.3, 0.9, 7], most: 2.5 },
  },
  give: 0.3,            // what it runs at: no more than this over what it really did last step (a hit slows it)
  bounce: 2,            // a sideways bounce off what it leans on slower than this is dropped (it slides along it)
  fly: 0.05,            // s: driven, the floor's friction is not fighting the engine (refreshed each step)
  // px its flank is held short of the building fronts as he steers into them (Drive.offFronts): a shop's windows and
  // doors are set back in its front, and a corner sliding along caught in one and held the car there
  front: 2,
  // tiles ahead of its nose whose fronts count too: where they step in toward the road (a block set forward, the end
  // of a terrace or of a yard) the car is already inside their line when it gets there, never nose-on into the corner
  frontAhead: 8,
  // px: a driven car's body has its corners rounded this much (physics only, the sprite is drawn as it is): a square
  // corner sliding along the building fronts caught on the seam between two wall bodies and stopped the car for good
  corner: 7,
  // never stalled for good (Drive.unstick): crawling under `under` of its cruise speed for `after` s, not crashed, it
  // eases itself sideways out of what holds it (his way when he steers) at `steer` of the full sideways speed (the
  // other way when it has not moved `moved` px across in `after` s more), until it runs at `until` of its cruise again.
  // Its nose on a `lasting` thing (the lorry), it heads round the end of it that leaves room before the building fronts;
  // not `moved` px nearer to clearing it in each `after` s for `boxed` s (a car shoved into the way round and pinned
  // there), it is the crash (Drive.boxed: the QA robot calls a stall past 2 s a softlock)
  stall: { under: 0.25, after: 0.6, steer: 0.4, moved: 4, until: 0.6, boxed: 1.2 },
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
  // what gives: a parked car is shoved aside (`aside`, below; one of theirs still driven is hit by the physics:
  // square on faster than crash.speed, his car keeps only `keep` of its speed). A bolted thing (a hydrant, a streetlight, a bench)
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
  // A PARKED CAR (OR A WRECK) HE HITS IS SHOVED ASIDE, never a wall (Drive.aside; the user, 2026-11-19: "elle doit se
  // mettre sur le cote, la elle nous bloque"). By how square the hit is (squareOf: 0 a graze / a flank, 1 full on
  // the nose: what he hit covering `full` of his car's width, nothing of it under `graze`, the contact facing his
  // nose): he loses `loss` of his speed [graze, square] (never under `floor` of the cruise speed: never stopped, never the crash); the car is
  // thrown on ahead at `ahead` x his speed and `side` px/step out to its side (a car of `kg`; a heavier one less,
  // `heavy` of it at least), turning `spin` rad/step, off the floor's friction `fly` s; his own car is turned
  // `deflect` px/step off it on a graze. Still on it within `hold` s (not clear of his flank yet, sent back by what
  // it was thrown into) it is thrown again every `again` s, for nothing more, the contact never resolved: it never
  // holds him up. Closing on it slower than `least` px/step, or he going under `slow`: the physics alone (it leans
  // on it and pushes). Dead ahead of him (within `dead` px of his middle line) it goes to
  // the side with more room. A shoved car never shuts both lanes (Drive.clearLanes): neither side of it leaving his
  // car's width + `room` px of the two lanes, it is pushed on toward its kerb at `push` px/step; followed `watch` s
  aside: {
    graze: 0.15, full: 0.65, loss: [0.1, 0.5], floor: 0.35, ahead: [0.6, 1.25], side: [2.6, 4.2], spin: [0.035, 0.07],
    kg: 1300, heavy: 0.75, fly: 0.45, deflect: 1.2, least: 0.8, slow: 2.5, hold: 1, again: 0.1, dead: 8, room: 8, push: 1.6, watch: 5,
  },
  // THE SLIDE (Drive slideStep / gripOf; pursuers too). The tyres give less of the wheel the faster it goes (`fall`
  // of the steering rate gone at `max`, as much more well under the cruise speed: understeer flat out) and while the rear is out (`under` at the most slip). The rear
  // steps out (slip: rad the body turns past the way it goes, `most` at most) on a FLICK (the wheel thrown over while
  // the car still goes the other way across at over flick[0] of its full sideways speed: flick[1] rad/s2), on FULL
  // LOCK HELD over hold[0] s (hold[1] rad/s2), on a shove (`shove` rad/s into the lunge), a pursuer's swipe landing
  // (`rammed`), a parked car grazed (`hit`). It comes back on a spring `k` (1/s2) damped `d` (1/s: under-damped, one
  // fishtail), `catch` when he steers against it (countersteer: caught at once); steering into it the spring is
  // `into` of itself (a drift held). It scrubs the speed: past `free` rad the speed it runs at falls, by `scrub` of
  // the cruise speed at the most slip (reached at `ease`, given back the same way: a twitch costs nothing); from `smoke` rad its
  // rear tyres smoke and leave rubber (skidOf, the 'tyres' event); the body leans `lean` px per rad out of it; under
  // `snap` rad and still, it is dead straight
  slide: {
    fall: 0.25, under: 0.4, most: 0.34, flick: [0.4, 9], hold: [0.4, 3.6], shove: 2.2, rammed: 2.4, hit: 1.8,
    k: 38, d: 5, catch: 16, into: 0.25, free: 0.12, scrub: 0.3, smoke: 0.07, lean: 4, snap: 0.003,
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
    // (2026-11-19, the user: "on ne sent pas trop la vitesse": more of them, longer, from a lower speed; the lens no
    // longer smears the edges, so the speed is sold here, in the world, by things that go by)
    wind: { from: 5, n: 38, len: [16, 64], v: [0.6, 1.4], life: [0.2, 0.45], alpha: 0.55, band: [38, 210], back: 260, ahead: 620 },
    dust: { from: 5, chance: 0.5, puff: [4, 0.14, 0.8] },
    wake: { from: 6, every: [0.16, 0.5], paper: 0.45, leaves: 4, v: 0.55 },
  },
  // the card that closes a chase not finished yet (level `chase.next`, Game state 'continued'; Drive.finishView): the
  // picture goes black over `fade` s, TO BE CONTINUED comes up at `title` and what is next at `name` (each over `rise`
  // s), a key passes it after `skipAfter`, the results follow at `hold`
  finish: { fade: 1.1, title: 0.9, name: 1.5, rise: 0.35, skipAfter: 1.6, hold: 5 },
  // dead at the wheel (a told shot): the car runs on, losing `slow` px/step a second, drifting `drift` of its full
  // sideways speed toward the kerb (Drive.coast)
  coast: { slow: 3.2, drift: 0.22 },
  // a flank against a wall or a car: the grind heard (and the pad's beat) every so often; the van's friction against
  // what it leans on. Its sparks are a shower for as long as it rubs (systems/CarFx.js, data/carfx.js `scrape`)
  scrape: { every: 0.12, vol: 0.6, friction: 0.08 },
  // the camera (Game.fit / updateCamera, Drive.frame). At the wheel the picture is drawn 1:1: the scene's canvas is
  // the window, at the whole zoom nearest to `view` world px of height (a level's `chase.view` overrides it; 3 at
  // 1080: 360 px; 4 at 1440: 360; 3 at 900: 300), and the lens scales nothing: a picture brought down by the lens,
  // a zoom that followed the speed, a camera that trailed the car each resampled every sprite every frame, the car
  // first. The camera is locked on the car along the road: it sits `at` of the view's width from the left, whatever
  // it does; across, the view stays on the street's middle (the level's `chase.mid`)
  // Slowed by what it hit (by more than `from` of its cruise speed: a slide's scrub does not move it), the car
  // comes forward on the picture, up to `surge` of the view's width at a standstill,
  // and falls back to `at` as it picks its speed up again (eased at `ease` 1/s, in whole px: at speed more of the
  // road ahead is seen, a hit is felt as the picture catching up with the car)
  camera: { view: 360, at: 0.33, surge: 0.07, from: 0.2, ease: 3.5,
    // across, between two legs with another framing (a leg's `mid`, its `track`: the share of his place across the
    // road the view follows, the toll's plaza is wider than the picture): the view's middle eased to the new one at
    // `ease` 1/s, `most` px a step at most, in whole px; within `done` px of a leg's own fixed framing, held there
    across: { ease: 5, most: 5, done: 0.5 } },
  // THE SCRIPTED BENDS (systems/Route.js; the level's `chase.legs` / `chase.bends`, docs/LEVEL2.md): where the road
  // turns a corner (works shut the street: the detour) the wheel is the script's, the gun still his. The car follows
  // the bend's line (its `path`: straight lines, each corner rounded off by an arc of `radius` tiles): it brakes at
  // `brake` px/step a second down to `speed` (40 km/h) for a turn seen `look` px ahead, gains `accel` up to `straight`
  // (50 km/h) between two; the point `pivot` px ahead of its middle keeps to the line, so the tail swings out, `slip`
  // rad at the bend's speed, on a spring [k 1/s2, d 1/s] (under-damped: one fishtail as it straightens; the rest is
  // given back to the drive's own slide at the end). Off the line as it came in (the other lane) it is brought onto it
  // over `merge` px. No shove, no steering, never off the line; nothing it scrapes kills it. Out of it on the lane of
  // its leg it ends on, it picks the leg's cruise up as after a hit (`ease`).
  //   camera: while it turns the view no longer holds it a third from the left on the street's middle: it follows it
  //   both ways, looking ahead along the line (`lead`: [share of the view's width, of its height]), the offset eased
  //   at `ease` 1/s, `most` px a step at most, in whole px; out of it, back to the leg's own framing the same way
  //   (within `done` px of it: held there exactly again). Never turned.
  //   pursuers: each one reaching the bend follows the same line, `space` px behind the car ahead of it there (his or
  //   one of theirs; held back by `catch` px/step for each px short of it, braking `hold` px/step a second for it:
  //   in a bend a knock between two of them wrecks nothing); on a leg he is not on yet, it is kept
  //   `clear` px past the end of the bend he will come out of (never sat on his way out), out of his lane
  //   apex: a breath of slow motion as each turn begins (systems/ChaseCam.js; null: none)
  bend: {
    speed: 5.9, straight: 7.4, brake: 14, accel: 6, look: 70, radius: 6, pivot: 18, slip: 0.3, spring: [42, 7], merge: 240,
    camera: { lead: [0.17, 0.2], ease: 2.4, most: 4, done: 0.5 },
    space: 170, catch: 0.06, hold: 40, clear: 320,
    apex: { slow: 0.72, in: 0.1, hold: 0.22, out: 0.3 },
  },
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
  //   ease: px a second the line across the road a car steers for slides to the one it wants (easeLine: no jump)
  //   attack: THEY TAKE TURNS, one attack at a time, each TOLD: `round` the order they come in (the kind due, else
  //   the next one somebody can make), `cool` s between two (the gunman's own `cool` after a shot); `lone`: the slot
  //   a car alone in the chase takes, by its style (the level's events: `style`)
  //   ram: from abreast, in its slot `settle` s (a gunner `shy` s more: the rammer's job): `wind` s told (its lamps
  //   flash, off `flash` s in every two; it draws `back` px/step AWAY from him, leaning `lean` px out), level with
  //   his doors (`lead` px ahead of his middle), then the swipe at `v` px/step for `dur` s. A lane change or a shove
  //   away dodges it; a shove INTO it during the wind-up lands first
  //   block: from ahead in his own lane, in its slot `settle` s: `wind` s told (its brake lights), then it runs
  //   `drop` px/step slower than he was going as it was told, for `dur` s: onto his nose unless he changes lanes
  //   hurt: s a car shoved (and not wrecked) keeps its distance (the far slot) and makes no attack
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
  //   rounds: his rounds on it (Vehicle: 1 hp a round on its body, 2 on its tank, 2 a window or a tyre; its hp is
  //   VEHICLES.pursuer's, about 2.5 times a parked car's), shown in stages by the share of its hp gone: `crack` its
  //   rear window cracks, `glass` it is blown out, from 0.4 the engine smokes (Vehicle), `fire` it catches (flames
  //   off the hood: Vehicle `burnAt`), `wreck` the engine dies: wrecked, its crew killed. On fire it runs `burn` s at
  //   most, then it is wrecked too (it blows up later, off to the side); `leak` rounds in its tank set it alight.
  //   THE QUICK WAY, a burst at the windscreen: the driver is killed once it is at window state `screen`
  //   (Vehicle.windows: 1 starred, 2 blown in), a stray round only stars it. A tyre (`tyre`, Vehicle.tyreHit) goes
  //   on the `hp`-th round into it within `skip` rad of square on its flank; one at more of a slant skips off into
  //   the body (a burst at the body from well behind or ahead lands on the wheel arch)
  //   out: THE EXIT. A car stopped for good while it was going (wrecked, its driver shot, a front tyre, blown up) is
  //   driven off his line by a script for `dur` s: it swerves to the side AWAY from him (dead level with him, within
  //   `level` px across: the side of the street with more room), at `side` px/step across reached in `bite` s, brakes
  //   `brake` px/step a second (it starts no faster than he goes), and while it is clear of his car (`margin` px
  //   between them across, its tail swung round as it is, or behind him) skids round at `turn` rad/step (`spin` for
  //   a front tyre), dying away over `dur`. What lines the road stops it there (it is then held against it at `press`
  //   px/step); `far` px across from where it started it pushes no further. It never comes back into his lane; a car
  //   crawling under `least` px/step is left where it is
  //   limp: a rear tyre, it hangs on alongside him (the `abreast` slot, in his arc, never in his lane), at no more
  //   than `limp` px/step over his speed (it only just keeps up; all of its speed while still in his lane ahead of
  //   him); lost: `lost` px behind him, it is out of the chase
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
    ease: 300,
    attack: { round: ['shot', 'ram', 'shot', 'brake'], cool: [1.1, 1.8], lone: { gunner: 'lead', rammer: 'abreast', blocker: 'ahead' } },
    ram: { settle: 0.5, shy: 1, wind: 0.5, flash: 0.08, back: 1, lean: 1.5, lead: 10, v: 5, dur: 0.32 },
    block: { settle: 0.6, wind: 0.45, drop: 3.2, dur: 0.9 },
    hurt: 2.5,
    knock: { dv: 2.2, stun: 0.6 },
    shoved: { cost: 0.5, throw: 6, drag: 4, spin: 0.02, stun: 0.7 },
    wreck: { hard: 3.5, car: 4.5, thrown: 0.6, smoke: 0.5, fire: 0.25, poles: ['streetlight', 'traffic_light', 'street_tree', 'bus_shelter', 'bollard'] },
    rounds: { crack: 0.15, glass: 0.3, fire: 0.72, wreck: 0.88, burn: 1.2, leak: 16, screen: 2, tyre: { hp: 5, skip: 0.6 } },
    out: { dur: 1.5, level: 20, side: 4.5, bite: 0.15, brake: 8, margin: 8, turn: 0.05, spin: 0.09, press: 0.6, far: 150, least: 1,
      // what its exit looks like (Pursuit.exitFx; looks only, nothing of it touches his car). `ball`: the engine
      // goes as it is stopped: [flames, px/s, the flash's radius px, its colour], and it burns from then on (`burn`);
      // while it slides: smoke off each tyre (`smoke`: [chance a wheel a step, px, s]) and rubber on the road (as
      // his own: fx.marks), a piece of it lost every `shed` s ([from, to], thrown at `fling` px/s); what stops it at
      // the roadside: `crash` [sparks, glass, pieces lost, shake]. The sparks from under it, its tyres' smoke in the
      // air, its engine's fire-ball and the one of a burning wreck that hits the roadside: systems/CarFx.js
      fx: { ball: [26, 190, 120, '#ffb060'], burn: true, smoke: [0.6, 7, 1.1], shed: [0.16, 0.34], fling: [120, 260],
        crash: [22, 14, 3, 0.3] } },
    limp: 0.6, lost: 1600, rubber: { far: 520, t: 1.2, close: 200, held: 3 },
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
  // THE TOLL (event 3, systems/Toll.js; the level's `chase.toll`). Its gates told `tell` s before them at his speed
  // (`least` px out at least): bone arrows run down the wooden lanes (every `every` px, at `run` px/s, from `from` px
  // ahead of his middle; `fade` s in), red brackets close on the steel booms, chevrons at the screen's edge for what
  // is not on it yet; told until he is `past` px past them. A pursuer chooses its gate `decide` s out: a wooden lane
  // (the one he is not heading for, when there are two), steering for its line `lead` s ahead (`lateral`: px/step
  // across for each px off it, twice the chase's: the islands leave it 60 cm a side; `steer` px/step across at most:
  // the fan's outer lines spread fast); one sent the wrong way
  // (the level's event `gate: 'steel'`) takes the steel lane next to his and holds `wrong` px off his middle (a car's
  // length behind him, never side by side as he changes lanes: it hits the boom a moment after he is through); one
  // going down his lane (no other wooden one on its side of him) keeps `follow` px off his middle, behind him.
  // Nothing is attacked or told by them meanwhile.
  // His car through a wooden arm (what it costs him: the arm's `cost`, data/props.js): a breath of slow motion
  // (`beat`, systems/ChaseCam.js), the picture kicked `push` px on, shaken
  toll: {
    tell: 1.5, least: 520, past: 60, decide: 2, lead: 0.3, wrong: -170, follow: -240, lateral: 0.14, steer: 5, every: 30, run: 90, from: 70, fade: 0.15,
    beat: { slow: 0.4, in: 0.04, hold: 0.2, out: 0.18, push: 5, shake: 0.22 },
  },
  // the alley car's red lane (event 1, OUT OF THE ALLEY): shown `red` s before the car is in his lane
  alley: { red: 0.7, pad: 10 },
  // HOW THE CHASE OPENS, the first time only (the level's `chase.intro: 'drag'`; systems/LastDrag.js; a retry skips
  // it: Drive.skipGrab; SPACE / pad A held skips it: data/staging.js SKIP). The car stands in its lane, engine and
  // lamps off; he finishes his cigarette and flicks it out over the door, then the engine, and the gun off the seat
  // (Drive.grab) as it pulls away. Times in s from the level's first step:
  //   pan: the view opens on the hood (`hood` px ahead of his seat) and from this time on comes onto him, at
  //   `follow` 1/s (as it goes after the butt later); SHOTS `drag`
  //   lift / drag / lower: the door's hand brings it to his mouth [from, to], the long drag [from, to] (the ember
  //   flares), the hand back out over the door [from, to]
  //   breath: he lets the smoke out [from, to], a plume out over his door: `puffs` of it a second, each leaving his
  //   mouth at `drift` px/s [ahead, across (-: out of the car)] (half as much again at random), slowed at `slow`
  //   1/s, living `life` s [from, to] and growing from `size` [px, px] (render/DragArt.js: pale squares drawn over
  //   the night, they are seen in the dark)
  //   flick: the butt leaves his fingers (the arm snapped out over `snap` s before it); the camera stays on the butt
  //   from `flick` to `go`; go: the engine, the lamps, the cut back to him, the car pulls away (the grab at once)
  //   ember: the light of the cigarette's end in the cab: [radius px, colour] at rest, `flare` at the height of the
  //   drag (his face, the wheel and the dash in it), flickering by `flicker` of it; laid every `every` s for `life` s
  //   hud: s the HUD takes to come in once the car pulls away (none before: Drive `hud`)
  //   hand: where the door's hand holds it at his mouth and at the end of the flick, pose px [ahead, across] from
  //   his seat (CharacterAnim dragPose); tip: world px from his seat to the ember while it is at his mouth / out
  //   over the door [ahead, across] (the light's place, the butt's start)
  //   butt: thrown `out` px/s to his left and `fwd` px/s ahead from `z` px up at `up` px/s, falling at `g` px/s2,
  //   turning `spin` rad/s; it bounces `bounces` times keeping `keep` of its speed and `lift` of its fall each time
  //   (`sparks` [how many, fewer each time, px/s] thrown at each, in a flash of `flash` [radius px, s]), then lies
  //   there, its end glowing `glow` s (its light `lamp` [radius px, colour], a thread of smoke every `wisp` s) and
  //   stays on the road; the camera cuts in closer on it (SHOTS `butt`)
  //   launch: as it pulls away, `smoke` puffs off each rear tyre every step for `spin` s, the body thrown up by
  //   `kick` of a shove's
  intro: {
    pan: 0.25, hood: 46, follow: 3.4, lift: [0.55, 0.95], drag: [0.95, 2.0], lower: [2.0, 2.4],
    breath: [2.25, 3.35], puffs: 26, drift: [20, -58], slow: 1.2, life: [1.0, 1.9], size: [3, 12],
    snap: 0.16, flick: 3.55, go: 4.9, hud: 0.6,
    ember: { rest: [30, '#ff7a2a'], flare: [110, '#ffb060'], flicker: 0.18, every: 0.05, life: 0.12 },
    hand: { mouth: [3.2, -1.4], out: [3.5, -19] }, tip: { mouth: [9.5, -3.5], out: [6, -23] },
    butt: { out: 92, fwd: 26, z: 13, up: 58, g: 420, spin: 19, bounces: 2, keep: 0.42, lift: 0.4, sparks: [18, 5, 150], flash: [46, 0.14],
      glow: 9, lamp: [26, '#ff7a2a'], wisp: 0.22 },
    launch: { smoke: 2, spin: 0.9, kick: 1.2 },
  },
  // THE CHASE'S OWN KILL CAM AND SLOW MOTIONS (systems/ChaseCam.js; the user, 2026-11-19: "un cote film d'action").
  // Times in REAL s (the camera does not slow down with the game) unless said; a beat's clock eases down to `slow`
  // over `in` s, is held, and comes back over `out` s (a whip, not a fade). Any zoom is a cut between two whole
  // zooms (Direction.update `cut`), the lens stays flat: no blur.
  cinema: {
    // a pursuer stopped for good by him (wrecked, its driver shot, a tyre, blown up: Pursuit's 'pursuerWreck').
    //   strong: the first of a run, and any one `again` s after the last strong one: the cut in (SHOTS chaseKill)
    //   toward the wreck, slow motion, a hit-stop of `stop` s, the picture kicked `push` px its way and shaken
    //   light: any other one (inside the cooldown): a tick of slow motion and the kick, no cut; none within `gap` s
    //   of the last beat
    //   double: a second car stopped within `double` s of the last: the beat under way is held `more` s longer and
    //   `deep` deeper (one beat for the two; after a light one, the strong one)
    kill: {
      again: 7, gap: 0.45, double: 1.6, more: 0.3, deep: 0.05,
      strong: { slow: 0.25, in: 0.05, hold: 0.55, out: 0.12, stop: 0.05, push: 7, shake: 0.35, shot: 'chaseKill' },
      light: { slow: 0.55, in: 0.04, hold: 0.16, out: 0.1, stop: 0, push: 4, shake: 0.15, shot: null },
    },
    // the lorry across his road (systems/Lorries.js): once a lorry, as it is told, backing or out, his car on a
    // collision course with where it will stand and `lead` s (game time, at his speed) or less from its flank: the
    // world slows to `slow` and the view shifts toward the way round (SHOTS lorryGap; the level's `gap`), until his
    // car is clear of it across, past it, crashed, or `cap` s have gone; `pad` px counted round the lorry.
    // `wheel`: how much quicker and further the car goes sideways while it lasts (the wheel answers in real time:
    // its rate is not slowed with the world, and the sideways speed is this much the usual): the dodge is easier,
    // that is the point. `shave`: clear of its tail by less than this many px: sparks and a jolt (a near miss)
    lorry: { lead: 0.8, slow: 0.3, in: 0.08, out: 0.25, cap: 3.2, pad: 6, wheel: 1.45, shave: 14, shot: 'lorryGap' },
    // a pursuer's side swipe landing on his car (Pursuit ram): a short kick of slow motion, the picture thrown
    // away from it, sparks off the two flanks; once a swipe, none within `gap` s of the last
    rammed: { slow: 0.5, in: 0.03, hold: 0.12, out: 0.1, push: 6, shake: 0.3, sparks: 14, gap: 1.5 },
  },
};
