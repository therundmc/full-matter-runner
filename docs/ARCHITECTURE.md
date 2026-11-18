# Architecture

Browser game, plain ES modules, no build step. Matter.js 0.20 is loaded as a global by `index.html`.

## Layers

```
src/
  main.js                 boot: new Game(canvas)
  engine/                 generic, knows nothing about this game (never imports from game/)
    EventBus.js           synchronous pub/sub
    Input.js Camera.js Assets.js math.js   Input: keyboard + mouse + gamepad (poll() once a frame, `device` = last used)
    Gamepad.js            gamepads, standard mapping (DOM-free, pads source injected): dead zones, trigger hysteresis,
                          menu steps with repeat from the d-pad / left stick, hot-plug
    physics/
      Units.js            scale contract: 1 m = 32 px = 1 tile, kg, px/step velocities
      Hinge.js            a leaf on a hinge as numbers: its inertia about the pivot, a force-limited push on it, a blow,
                          its swing (dry friction, drag, a closer's spring and valve); DOM-free, unit-tested
      Body.js             kg mass, sliding friction coefficient, momentum impulses, freeze/wake of heavy bodies
      Friction.js         Coulomb floor friction (top-down "ground"), heavy bodies settle back to static
      PhysicsWorld.js     Matter engine wrapper: sub-stepping, friction, collision dispatch, 'impact' events
      Raycast.js          grid DDA, segment vs polygon / circle / segment
      Fluid.js            coarse 2D stable fluid: flow grid (vorticity confinement, advection, pressure projection
                          with volume sources) carrying a finer density (MacCormack); solid cells, a stepped region
      Shallow.js          liquid on a flat floor: a "virtual pipes" height field (depth per kind per cell, fluxes with
                          inertia between neighbours, a film under which it stops spreading, floor levels), drying and
                          soaking, setting kinds (blood), solid cells, chunks that sleep when still
      Cloth.js            a hung cloth (a curtain) seen from above: a small rope mesh under rings that slide on a rod,
                          real gravity, upright cylinders pushing it (parting round them, a grip, tearing when driven
                          through fast), fixed sub-steps, what it hides along a line
    nav/Pathfinding.js    A* on the tile grid + string pulling; an optional extra cost per cell (spots to keep away
                          from), which string pulling never cuts across
  audio/                  Audio.js (mixer, recorded shots + foley bank, a little synthesis), bank.js (generated index
                          of the foley cuts), Beds.js (the long ambience loops, rendered once in idle time; DOM-free),
                          Motor.js (a V8's cycle, a gearbox, the tyres' squeal as numbers; DOM-free),
                          Elevated.js (the title's elevated train, rendered piece by piece as it goes; DOM-free), Music.js (the
                          soundtrack: one track at a time out of tracks/index.js), Synthwave.js (the
                          synthwave track, playing score.js), groove/ (the groove tracks' player, instruments and
                          harmony) and tracks/ (one data file per groove track)
  game/
    Game.js               loop (fixed 60 Hz steps, time scale, hitstop) and screens state machine
    Config.js             tuning: collision categories/masks, player/enemy tuning, PHYSICS, palette
    world/
      World.js            one playthrough: entity lists, services, fixed step order, system facades
      TileMap.js          pure grid logic (solid / blocked / wall HP / version), wall bodies (no DOM)
      Level.js            builds entities from level data
      Openings.js         geometry of doors / windows in walls (DOM-free, unit-tested): door leaves of a run of door
                          tiles, the wall tiles holding each opening up (`heldBy`)
    systems/              rules, called by World or driven by events
      Ballistics.js       traceBullet, lineOfSight, canSeeCharacter, occlusion (blast transmission)
      Cover.js            findVault (broken windows, def.vault furniture / car hoods, def.climb gates) + landing spot
      Slide.js            slide kinematics (speed curve, stall, cooldown), pure and unit-tested
      Kick.js             the player's feet on a standing guard: who a slide's end kicks (range, cone, timing), who is in
                          the way of a hip slide off a car's hood, the speed that throws a floored man a given distance
      Takedown.js         `within(player, guard)`: who can be seized; `behind`: from behind, else face to face;
                          `unspotted(guard, phase)`: never once he is after us or the squad has us located;
                          `advance`: the beat clock of a takedown (rules only, unit-tested); `slamAt`: how far
                          a head driven into something is, off that clock
      Danger.js           `threatened(player, guards, ...)`: is somebody on the player (a guard after him in sight, a
                          round at him a moment ago, the squad on alert with a guard close): quick kill or long execution
      TakedownSpot.js     `spotFor(guard, map, props)`: what stands right in front of a guard seized from behind that his
                          head can be driven into (a toilet, a urinal, a sink, a ledge: data/finishers.js SLAMS; a wall,
                          never one beyond a doorway), the most specific first (DOM-free, unit-tested)
      Lunge.js            `lungeTarget`: the guard a melee swing of the player's is drawn to (PLAYER.lunge): the aim
                          turned a little onto him, a short step in, never into a wall (rules only, unit-tested)
      Explosions.js       blasts: kills, breakage, wall crushing, mass-based shockwave, all scaled by occlusion()
      Gas.js              holed gas (props with `gas`: bottle, stove): flame jet at the hole, fuse, rocket bottle, blast
      Destruction.js      wall tiles (worn by anything, brought down by blasts only), windows torn out, doors off
                          hinges, fences; `watchOpenings` makes doors and windows go with the wall tile that holds
                          them (listens to `wallDestroyed`)
      Glass.js            how a pane breaks (DOM-free, unit-tested): shards of three sizes, which ones cut / kill
      Fracture.js         prop destruction math (DOM-free): marks by weapon/energy/angle, debris cones, damage zones,
                          part recipes -> polygons, collapse launch
      Scoring.js          score of a run from events: kill styles x combo, end tally (bonuses, grade); pure, unit-tested
      Records.js          best result per level in localStorage (guarded: the game runs without storage)
      Threats.js          which off-screen guards the player can plausibly know about (pure rule + per-guard memory)
      Impacts.js          listens to 'impact': material sounds by speed and mass
      Liquids.js          what is wet on the floor, one shallow liquid over the map (engine/physics/Shallow.js,
                          LIQUIDS in data/liquids.js): the floors' levels, walls / shut doors / furniture holding it,
                          sources and spills, the bodies' blood, the rain's puddles, wet floor grip, footprints and
                          slide smears, ripples (DOM-free, unit-tested)
      Alarms.js           closed shops (level.alarms) that ring when broken into: bell, beacon, guards come to look,
                          passers-by hurry on, until the box is shot off the wall (DOM-free, unit-tested)
      Power.js            the house's fuse box (level.power): smashed, the lights of its zone stutter and die, the
                          battery lamps (`standby` props) come on, guards come to look (DOM-free, unit-tested)
      Sirens.js           far-off police sirens once a firefight drags on (ambience only; DOM-free, unit-tested)
      Flinch.js           rounds that go by close or strike near somebody ('round', 'strike'): a guard shot at and
                          missed flinches (head ducked, shoulders hunched, turned away), the player's view is nudged by
                          rounds striking the wall by him (FLINCH in data/feel.js; looks only; DOM-free, unit-tested)
      Uses.js             what E does where: the spots the level's devices offer (Player.nearUse, the HUD's hint, a
                          diamond over each spot near the player: WorldRenderer.drawUseHints)
      Doors.js            the doors' part of a step (DOORS in data/doors.js): walkers lean on a leaf with a limited force
                          (`prePush`, like PropPhysics), the lab's doorbell (level `buzzers`, E: the man inside comes
                          and unlocks)
      the level's devices (data/devices.js, DOM-free, tests/devices.test.mjs):
      Slips.js            running on a slick floor (a liquid kind with `slip`: a holed keg's beer): a guard falls on his
                          back dazed a few seconds (Enemy.slip, no stars: CharacterAnim.groggy), a customer trips, the
                          player slides on his back and gets up (Player.slip)
      Sprinklers.js       the fire alarm (level `sprinklers`): pulled (E) or set off by a fire or a blast in its rooms:
                          the bell, the heads raining on the floor (Liquids.sprinkle: a soaked, slick floor), fires
                          doused, panic
      Passage.js          two trapdoors (level `passage`): E, the picture goes dark (HUD), up out of the other one; the
                          player is `hidden` meanwhile, the guards know nothing of it
      Jukebox.js          E turns it up: loud for a while (its own band stays off), small noises around it lost for the guards
                          (Director.emit asks mask())
      GasValve.js         a stove's tap (per-prop level option `valve`, none in level 1): open, the gas spreads; a shot, a blast, a fire or metal struck
                          in the cloud blows it, bigger the fuller
      Ambience.js         the night heard place by place (level.soundscape, data/soundscape.js): beds crossfaded by
                          where the player is and bled through walls, prop beds, the traffic car by car, one-shots
                          (bar life, drips, far sirens), the room's reverb (DOM-free, unit-tested)
      Tutorial.js         a level that teaches, and its staging (data/staging.js): rooms played in order, dormant guards woken
                          wave by wave, hints, a lesson slowing time the first time its hint shows (`pace`), the opening scene
                          (the man with the match: `open` / `play`), the camera's shot (`shot`), the flat blowing up at the end
                          (`blow`: the stove, then a chain of fire-balls down the corridor), the way out marked (`exit`), a
                          man called framed by the camera (`framed`), the weapon forced to break on the man whose gun is to
                          be snatched (FORCE), a retry from the last room with the fire where it would be (DOM-free,
                          unit-tested)
      FireSpread.js       fire that spreads (FIRE in data/fire.js): a front running over a grid of cells, fast along the petrol
                          (level `petrol` trails), slowly over floors that burn, up the furniture; one touch kills; a stage's
                          `hold` keeps it out of a room for a while (deterministic, DOM-free, unit-tested)
      Fires.js            the flames, light and sound of what burns: a fire a block of burning floor (lit and put out by
                          FireSpread), level `fires` burning from the start; bounded (DOM-free; drawn by render/FireArt.js)
      Direction.js        the camera's shots (SHOTS in data/staging.js): a zoom on top of the usual view and something to look
                          at, eased; the zoom rests on a whole number of px a world px (pure, unit-tested)
      BossStage.js        the camera on a boss's beats (the 'boss' event; data/bosses.js `shot`): a SHOTS name and the
                          real seconds it holds, asked by Game like a staged level's shot (pure state, unit-tested)
      Progress.js         the campaign order, what is unlocked and done, saved in localStorage (DOM-free, storage injectable)
      PoolBalls.js        the balls on a pool table roll, bounce, clack and drop ('propHit', 'impact', 'poolStroke';
                          DOM-free, unit-tested; drawn by render/PropLife.js)
      Gadgets.js          the arcade cabinet rings when shaken, the jukebox derails then dies (GADGETS)
      Clutter.js          what stands on the furniture (prop option `clutter`, CLUTTER / SETS in data/clutter.js): no body,
                          kept in its prop's px so it rides on it; a round bursts the glass on its line (shards, the drink
                          run off the edge: 'spill'), a blow knocks off what stands by it, the prop tipped over or broken
                          ('propFlipped', 'propDestroyed') throws it all as Debris; an ashtray left burning smokes
                          (Smoke.wisp); banknotes knocked off land as Litter bills; drawn by render/ClutterArt.js
                          (DOM-free, unit-tested)
      Litter.js           small things loose on a floor (level `litter`, LITTER in data/litter.js): bills, feathers, a
                          flute, corks; no body, bounded; kicked by runners, lifted by passing rounds ('round'), a muzzle
                          blast ('shot'), a blast ('explosion') and a curtain's swinging hem; the light ones flutter down
                          and settle; a flute shot bursts; drawn by render/ClutterArt.js (DOM-free, unit-tested)
      Tipping.js          street bins (prop def `tips`) go over instead of breaking: struck, shot, run into, a body or a
                          car ('impact'), a blast; lid off, rubbish out of the mouth (bits, a bag, Papers sheets), a
                          clatter heard; lying, only a blast or a car at speed wrecks it (DOM-free, unit-tested)
      Steam.js            manholes that breathe (and seep between breaths, thicker in the rain), wall vents, steam pipes
                          whistling out of a bullet hole (SMOKE.steam / jets.leak, level `street`): steam put in the air
                          of Smoke.js, which carries it (a passing car tears it along)
      Papers.js           loose sheets blown by gusts, dragged by passing cars, kicked by runners (PAPERS; no bodies);
                          soaked by the rain, heavier and darker; `drop` adds sheets that fell out of something
      Weather.js          the wet after the rain (level `soundscape.rain`, RAIN in data/atmosphere.js; falling rain is
                          off): which tiles see the sky, where puddles lie in the open (Liquids fills their hollows),
                          drip spots (only if it falls). The drops are not stored (render/WeatherArt.js). DOM-free, seeded
      Smoke.js            the air as a fluid and what it carries (SMOKE): grey smoke, black soot, white powder, steam;
                          walls, doors and panes, sources (shots and their ejection ports, blasts, what burns, jets, the
                          smokers' threads and breaths, puffs), stirring (walkers, cars, rounds, fans, drafts,
                          convection, wind), a faint resting layer in the smoky places (thicker under a few lamps: level
                          `haze`); what hides from the guards
                          (blocks(), World.sightLine) (DOM-free)
      Curtains.js         the curtains across doorways (props with def `curtain`, CURTAIN in data/cloth.js): a Cloth each,
                          pushed by people, the dead and debris, nudged by rounds ('round'), thrown by blasts
                          ('explosion'); asleep when still with nobody near; hides from the guards (World.sightLine)
                          unless parted wide; placeholder sounds (DOM-free, unit-tested; drawn by render/ClothArt.js)
      Critters.js         street fauna (level.critters): rats under the dumpsters ('propHit'), flocks of pigeons, a cat
                          that bolts over a bin, flies and moths; no bodies, drawn by render/CritterArt.js
                          (DOM-free, unit-tested)
      Ambient.js          street life (level.ambient): through-traffic + passers-by, pre-warmed, owns their spawn/despawn
      Traffic.js          pure traffic rules: lanes, spawn schedule / jams, car following, detours, Driver brain (held up
                          at gunpoint, a body in the road gone round or crept over)
    ai/                   enemy AI, DOM-free (unit tested)
      Tension.js          soundtrack intensity: alert phase + heat of the fight (shots, kills, blasts)
      Director.js         squad brain: alert phases, noise routing (only the nearest go and look while calm), incidents,
                          search sweeps (widened once), spot claims, budget, the squad's path costs (where mates fell, the
                          routes of the others in the fight, fire, slick floors), the stranger watched for odd acts and the
                          word one guard has with him (conduct)
      Nav.js              finding the way: tiles remembered as jammed (CellMemory), a path's cells, the tile in the way,
                          giving way to the people around (step aside, queue behind, personal space), the cost function
      Conduct.js          a word with a stranger: the Case (on his way, told, warned, shoved, fight), the verdict at each
                          moment (judge), what complying means (complies), the stage a repeat offender starts at
      Tactics.js          grid geometry: cover / ambush / flank spots, search points, random walkable point, the way through a doorway,
                          the table worth tipping over in front of a cover spot (`tableToFlip`)
      Perception.js       detection meter rate, view test, aim error, hearing error, patience with a loiterer
      Barks.js            what a guard says: blanks filled ({N} a name, {AT} / {P} a place), the line picked, the names
                          handed out, the named place of a point (level soundscape zones, landmarks)
      Squad.js            a guard's nerve: running for backup (odds, which group), giving up, going for a gun on his knees
      Trail.js            the player's wet / bloody footprints in order, and how a guard picks them up and follows them
      Civilians.js        passers-by Walker brain (stroll, stop, look round at a commotion, panic, then by temperament flee /
                          hide curled up / freeze) + escapeRoute (round spots runners were held up at), hideRoute
      Pastimes.js         what people do with themselves while all is calm (pool, cards, a drink, a cigarette,
                          a chat, a leak...): timing and spots only
      Carry.js            how a guard carries his weapon: put away, in hand and low, raised on a target
    render/
      MapRenderer.js      floor / blood / flesh / wall canvases and permanent decals (blood, holes, scorch, spills,
                          baked bodies), flat roofs of the neighbouring buildings and their dressing
      FloorWear.js        the wear of the floors painted once over the tiles, free of their grid (WEAR in
                          data/floorwear.js): cracks over several tiles, potholes, a patched road, oil down the lanes,
                          dirt along the walls, split and gaping boards, rings, burns, gum, weeds; seeded by the level;
                          plus what the level lays itself (`grime`: drink rings, sticky spills, butts, peanut shells,
                          napkins by the counter; `worn`: the paths feet wear pale)
      WallScars.js        holes dug into the wall tops (entry, exit, ricochet scuff, club dent), merged into gouges
                          on repeated hits; every wall mark is clipped to the wall tiles, behind their outline
      GoreArt.js          what a burst skull leaves: bits of bone, scalp and brain, the stains of its matter
      BloodArt.js         what blood looks like: pixel stamps (spots, streaks, splats) built once, in three ages
                          (wet, tacky, dry; RAMPS, also the colours of blood on the floor in LiquidArt)
      LiquidArt.js        the liquid on the floor in flat pixel steps by depth on the world's 2 px grid (edge lit
                          from the top left, body, deep, core; kinds mixed; foam, glints, petrol sheen), only the
                          chunks that changed repainted; its mirror mask for Lighting.post; set blood baked as a stain;
                          ripples
      DamageArt.js        canvas side of prop destruction: marks, tracks, bites, piece cutting, loose bits
      BlastArt.js         canvas side of a blast: the ragged burn it leaves and its torn shock front
      PastimeArt.js       canvas side of the pastimes: where busy hands go, the cue, cards, glass, cigarette in them
      WorldRenderer.js    draw order, additive effects, floating texts, physics debug overlay (F4); what stands or lies
                          on the floor (bodies, items, props and cars, people, doors) is drawn on a picture-sized layer
                          of its own, then laid on the scene: Lighting.post cuts its pixels out of the floor's
                          reflections, so no puddle or wet sheen is ever drawn over a man or a car
      ClothArt.js         the curtains' cloth in flat pixel quads at the furniture's density (tone by facing and height,
                          ink round it), the brass rod and rings on top; painted again only when it moved
      PropLife.js         pool balls, snow on a TV left on, a phone booth's receiver
      StreetArt.js        the loose sheets of systems/Papers.js, the cigarettes left burning by customers who ran
      WeatherArt.js       the rain: streaks, crowns where drops land, rings in standing water, drips (hashed per frame)
      FireArt.js          the standing flames of what burns (Fires.lit()): a bed of embers and a few tongues a fire, flat
                          squares flickering in steps, nothing stored
      Murk.js             thick smoke about the player closes his view in, in flat rings of soot (SMOKE.murk; no blur)
      SmokeArt.js         the air's kinds in flat pixel bands, each its own look (glow lit twice, white lit once, a
                          veil where lit, soot whatever the light), the mist, the threads
      Flicker.js          how bright a light is over time per kind (buzz, broken, pulse, tv...), the letters of a sign,
                          the faulty tubes picked per level (NEON: one dying, a few stuttering); DOM-free
      LaserSight.js       laser sight of the weapons that have one (weapon `laser`: the sniper rifle), over the lighting
      Replay.js           end-of-level replay: ReplayRecorder (rolling buffer of small frames, a clip per kill) and
                          ReplayPlayer (plays the clips behind the results, slow motion on the kills)
    entities/             Character, Player, Enemy, Boss (a guard who is his own man: data/bosses.js BOSSES, by the
                          kind level `looks` draws him as), Civilian, Prop, Vehicle, Door, Window, Debris, Ragdoll, Corpse,
                          WeaponItem, AmmoItem, Projectile; Recoil (what a shot does to the man holding the gun, per
                          gun family: data/feel.js `recoil`; pure, unit-tested)
    fx/                   Particles, Gore, Bleeding (a dead body's spurts, pool and drag trails)
                          TraversalFx (the player's flourish on a vault, a slide, a landing, a roll)
                          Casings (a spent case out of the ejection port, to the gun's right: speed, spin, hops, the
                          ring of each touchdown; data/feel.js CASING), CombatFx (flashes, stars, muzzle flashes, wakes,
                          weapon trails, the player's kill mark: KILL)
                          Spatter (the exit spray behind a man shot, splashes on a wall close behind him and the blood
                          that runs down it, data/wounds.js `fling` / `wall` / RUNS)
    debug/
      Sandbox.js          F1 sandbox: tools dropping guards / weapons / props / vehicles / blasts / water at the
                          cursor, cheats (god mode, frozen guards, time scale, ammo, teleport); DOM-free, unit tested
    ui/                   HUD, KillFeed (what is shown of kills and chains: stamps at the body, the chain count, its
                          fuse, the labels, the cash-out, the multi-kill banner; DOM-free state on the real clock,
                          KILLFEED in data/feel.js), Indicators (off-screen guard markers), Screens (loading, intro, death screen), Results (the
                          end-of-level screen: timeline and sounds pure, drawn beside the replay), Glyphs (key caps and pad
                          buttons of the device in use), SandboxPanel, Text, Menu / MenuArt,
                          TitleScene (the elevated line in front of two glass towers, through a day and a night in a loop) and title/
                          (Draw pixel tools, Layout, Timeline and Cycle: everything as a function of t, unit tested (the cloud
                          deck's slow drift, the train's sound), the day's keyframes in data/daycycle.js; Sky, Towers: the glass towers, Bridge: the truss, Train, Rain: the showers),
                          Cinematic (the opening, comic pages) and cine/ (Ink pixel tools, Page + Panels: comic pages, Leap: the tutorial's exit and its card, Ending: a level's closing page)
    data/                 atmosphere (rain, smoke, neon faults: the look of the air), liquids (the liquid on the floor:
                          solver, floors, kinds and their look), daycycle (the title's day and night), devices (the level's usable things: tuning), controls (gamepad bindings, the cap of each action per device), weapons, wounds (bleeding per weapon), props, materials, destruction (how each prop comes
                          apart), roofs (rooftop scenery), scoring (points, combo, bonuses, par time and grade
                          thresholds per level), barks (what the guards say), conduct (the odd acts a stranger gets a word
                          for), levels/ (index.js = registry)
tests/                    node --test (no browser): engine, physics, map/pathfinding, systems, ai, ambient, sandbox, roofs,
                          scoring, threats, replay
```

Rules:
- `engine/` never imports from `game/` or `audio/`.
- Logic modules must not touch the DOM so they stay testable in Node (`TileMap`, physics, systems' math).
  Canvas work lives in `game/render/` (and, for now, each entity's own `draw()`).
- Cross-cutting reactions go through `world.events` rather than direct calls.

## Simulation step (World.step)

1. intentions: player input, AI Director (phase timers, footsteps, budget reset), enemy AI
   (they set velocities via `Character.steer`), Ambient (drivers set their car's velocity, passers-by steer,
   run-over checks, spawn / despawn)
2. physics: the characters' pushes on loose props (`PropPhysics.prePush`: force-limited, they are held to what
   they push), `PhysicsWorld.step` (2 Matter sub-steps + floor friction), door hinges, wall body rebuild
3. reactions: items, ammo, projectiles (segment-traced), debris, corpses/ragdolls, props, emitters, particles, systems
4. cleanup of dead entities and expired effects
5. level flow (cleared / exit)

## Events

| event | payload | emitted by | used by |
|---|---|---|---|
| `impact` | `{ a, b, speed, x, y }` | PhysicsWorld (collision start) | Impacts (sound) |
| `blow` | `{ x, y, angle, power 0..1, kind, lethal, byPlayer }` | Character / Projectile (a blow or a round landed on somebody) | Lens (colour fringe, zoom kick, impact frame) |
| `kill` | `{ victim, cause, killer, how }` (`how`: what the killer knew of it: a round's `pierced / through / bounced / dist / last`, a blow's `from / heavy`, a finisher's `label`) | World.onKill | Scoring (`killTags`), ReplayRecorder (clips), Threats, CombatFx (the player's kill mark) |
| `finisher` | `{ killer, x, y, label }` | Player.endExecution (a long ground execution watched to its end) | Scoring (`SCORING.watched`: the bonus, the chain's window back) |
| `scored` | `{ x, y, points, labels, combo, multiplier, streak, kind }` (kind: `kill`, `knock`, `bonus`, `civilian`; labels best first, at most 3) | Scoring (points earned, or a passer-by's penalty) | KillFeed (stamps, feed, chain count, fuse refill) |
| `multiKill` | `{ n, tag, x, y }` (tag: `double`, `triple`, `massacre`) | Scoring (the streak's tag) | KillFeed (banner), fx/Impact.listenMoments (MOMENTS.multi: slow motion, hit-stop) |
| `chainEnd` | `{ kills, points }` | Scoring (a chain of 2+ ran out) | KillFeed (the cash-out) |
| `boss` | `{ boss, beat }` (beat: `intro`, `wounded`, `berserk`, `down`) | entities/Boss.js | KillFeed (the name card on `intro`), systems/BossStage (the camera's shot), Game (the soundtrack's heat: `AI.heat.boss`) |
| `pickup` | `{ ch, type }` | Player.pickUp | Scoring (a kill right after is a QUICK DRAW) |
| `knock` | `{ victim, cause, angle }` | Enemy.knock (a guard is floored; cause: throw, slide, debris, door, punch, blast) | Scoring, Ambient (those who see it close back off) |
| `shot` | `{ shooter, weapon }` | World.addProjectile (once per trigger pull, whatever the pellet count) | Scoring (accuracy), Litter (the blast at the muzzle blows the bills on the floor) |
| `round` | `{ x0, y0, x1, y1, owner, team }` | Projectile (a round's way over one step; not a rocket) | Flinch (near misses), Curtains (the cloth it crosses), Litter (bills lifted along its way, a flute burst) |
| `strike` | `{ x, y, owner, team }` | Projectile (a round hit a wall, a prop, a door or a pane) | Flinch (guards close by, the player's view) |
| `explosion` | `{ x, y, radius, source }` | Explosions | Scoring (a rocket kill is a hit), Curtains (the cloth thrown), Litter (thrown) |
| `slide` | `{ ch, x, y, angle }` | Player.startSlide | (the slide also calls `World.noise`) |
| `dodge` | `{ ch, x, y }` | Player.dodge (a round passed over the sliding player) | Scoring (a kill right after is a DODGE KILL) |
| `wallDestroyed` | `{ cx, cy, x, y, dirA, power }` | Destruction | Director (incident), Destruction.watchOpenings (windows / doors held by that tile) |
| `windowDestroyed` | `{ x, y, cx, cy, dirA, power }` | Destruction.destroyWindow (glass, frame and sill gone: the tile is a breach) | Destruction.watchOpenings (next window of a glazed run) |
| `propHit` | `{ prop, x, y, dirA, kind, power }` | Prop.hit (every blow or shot on a prop still standing) | Critters (rats out from under a dumpster), PoolBalls, Clutter |
| `propFlipped` | `{ prop, to, x, y, dirA }` | Prop.flip (a table tipped on its side; `to`: the upended table) | Clutter (what stood on it flies) |
| `propTipped` | `{ prop, x, y, dirA, by }` | systems/Tipping.tipOver (a street bin knocked over; `by`: who, when known) | - |
| `propDestroyed` | `{ prop, x, y, dirA, power }` | Prop.collapse | Liquids (a `fountain` prop floods the floor), Critters (the last rats of a dumpster), Clutter |
| `spill` | `{ x, y, kind, area, dur?, a? }` | Prop (a pierced keg or pipe leaking, a broken pipe flooding, a bottle smashing), a guard's glass or leak, a customer's glass | Liquids (px2 of floor a `LIQUIDS.kinds` liquid covers, at once or over `dur` seconds, thrown toward `a`) |
| `noise` | `{ x, y, radius, source, type }` | `World.noise` (guns, doors, glass, walls, blasts, thrown guns, vehicles, a bin knocked over: `clatter`) | Director (hearing), Threats (a guard who makes noise can be placed) |
| `windowBroken` | `{ x, y, by }` | Window.shatter | Director (incident; the player seen doing it: a word) |
| `doorBroken` | `{ x, y }` | Door.unlock (lock burst), Destruction.detachDoor | Director (incident) |
| `alertPhase` | `{ phase, prev }` | Director | Game (soundtrack combat variant; intensity through Tension), Scoring (every ALERT eats into the stealth bonus); the HUD reads the phase directly |
| `powerCut` | `{ x, y }` (the fuse box) | Power (the lights of the house just went out) | Director (an incident at the box: whoever sees it raises the alert) |
| `alarm` | `{ x, y, radius }` | Alarms (a shop's bell ringing, every few bursts) | Ambient (passers-by within `radius` walk on faster: `Walker.hurry`) |
| `challenge` | `{ guard, act, stage }` | Enemy (a word with the stranger: 0 on his way, 1 told, 2 warned, 3 shoved, 4 the fight) | Ambient (the people around look; a shove and they stare longer) |
| `heldUp` | `{ car, how }` | Ambient (a gun held on a driver: `flee` / `duck` / `floor`) | (QA statistics) |
| `poolStroke` | `{ x, y }` | Enemy (a guard at the pool table plays his shot) | PoolBalls |
| `patronLeft` | `{ civilian, activity }` | Civilian (a posted customer runs off his spot) | Ambient (his chair is shoved back, his glass goes over, a cigarette is left burning: `AMBIENT.leave`) |

Noise types: `gunshot` (any shooter; a guard's shot is heard as `allyFire` by his mates), `door`, `glass`,
`wall`, `explosion`, `thrown` (a gun thrown by the player lands), untyped = `noise`. Footsteps / bodies falling
are emitted by the Director itself. Silent weapons (`noise: 0`) are never heard.

## Physics model

- Scale: 1 m = 32 px. A person is ~0.5 m wide (17 px), a door 1 m.
- Every dynamic body has a mass in kg (`setMaterial(body, kg, mu)`) and a `material` (data/materials.js).
- Floors have a grip (`FLOOR_GRIP`): carpet and grass brake more, tiles and the dance floor slide; a wet floor
  grips less (Liquids `grip`, beer the least). A loose prop's feet (`feet`, or its material) also take to the kind
  of floor (`SURFACE`, `SLIDE` in data/materials.js): wood slides on tiles, scrapes on concrete, barely moves on
  carpet; metal skates on tiles; rubber grabs. `World.floorGrip(x, y, body)` is the engine's `muAt`.
- Sliding uses constant deceleration mu.g (Coulomb, engine/physics/Friction.js), so things stop dead instead of
  drifting (props have no air drag); airborne bodies (`flyUntil`) skip it for a moment after being thrown or blasted.
  Spin is scrubbed off at mu.g / gyr (the radius of gyration of the real moment of inertia: `setShapeInertia`, a box
  m(w2+h2)/12, a disc mr2/2). A lying cylinder (`roll`: the bin knocked over) rolls across its length almost freely
  and drags along it.
- Static friction: getting a resting body going takes `stick` (per material) x its kinetic friction:
  `breakaway = stick.mu.grip.kg.g`. Anything whose breakaway beats `PHYSICS.pushForce` (N) is "frozen" (static)
  at rest and only wakes up from big impulses (all the knocks of one step add up: a shotgun's pellets, a blast).
- Pushing is force-limited (engine/physics/Push.js, systems/PropPhysics.js `prePush`, run before the physics step):
  a character's velocity is set every step, so to Matter he is infinitely heavy and its contact would hand a prop
  his speed at once. Instead, a walking character in contact with a loose prop gives it at most his push force
  (`pushForce` running, `PUSH.walk` of it walking, data/physics.js) as momentum at the point of contact (off-centre
  it turns), nothing until the force beats static friction, and he is held to the speed it really goes, so Matter's
  contact has nothing left to transfer. The meeting is reported as an 'impact' (`PhysicsWorld.bump`) for sounds and
  bins knocked over. Slides, vaults and men knocked flying stay with Matter (they are blows).
- Impulses are momentum (kg.px/step): `impulse(body, angle, J)` gives light bodies a big kick and heavy ones a nudge;
  `impulseAt(body, x, y, angle, J)` also spins it by its moment of inertia. A blow on a prop (Prop.hit) hands it
  `BLOW.per[kind]` N.s per unit of power, x the weapon's heft (data/physics.js): a bat sends a chair flying and
  nudges a keg, a pistol round barely moves anything.
- Dragged over a hard floor fast enough, a heavy hard prop leaves faint thin scuffs from its feet (PropPhysics,
  `SCUFF`: at most `cap` marks a floor cell, `budget` a second), wipes a liquid it went through along the dry floor,
  and is heard (`SCRAPE`: placeholder sounds, assets/sound/PLACEHOLDERS.md).

## Gameplay systems notes

- Ammo is per caliber (`AMMO` in data/weapons.js: 9mm, 12g, 762, rocket). The player has a pool per caliber;
  a reload fills a fresh magazine from the pool and drops the old one with what was left in it (pickable).
- Sound (audio/Audio.js): a gunshot is a recorded shot (`SHOTS`) over synthesized bass / room layers (`GUNS`), choked
  per shooter (`choke`). Every other physical sound is one or several cuts of the recorded foley bank
  (`assets/sound/foley.wav`, indexed by audio/bank.js), layered per sound name in `FOLEY`; a `_<name>` method adds the
  synthesized part where no recording fits (blasts, fire, the starter's crank, alarm, traffic). Reload / handling sounds take
  `{ weapon }` to pick that gun's parts (`ARMS`), voices take `{ pitch }` (one per character, `Character.voice`).
  Space: every positional voice is panned and loses level and highs with distance while more of it is sent to a
  long hall reverb (also behind every gunshot and the kill's boom); `World.sound` flags what the player hears
  through a wall or a closed door (`occ`): quieter and dull. The room's own reverb follows the place he is in
  (`ROOMS`: per room its impulse, pre-delay, RT60, damping and size, and what the effects, the shots and the
  ambience send into it; out of doors a short dark wash and a slap off the facades; a warm bar, small rooms, tiled
  toilets). The ambience is not made of voices but of beds (`setAmbience`, fed by systems/Ambience.js through
  `World.atmosphere` ten times a second): long seamless loops rendered once by audio/Beds.js (the city and its far
  traffic, a room's talk, a radio, a radio behind a window, the hush of a building, hums, a fan, an engine), each
  voice with its gain / lowpass / pan / playback rate gliding; a voice not refreshed fades out by itself (pause,
  menu) and its loop is let go. The far city's long one-shots (the elevated train, a dog, a car alarm) are rendered
  the same way (`once`) and played by `_cue`; a far police car (`_farSiren`) is synthesized live.
  A vehicle driven live (the getaway van: `Audio.motor(key, state)` every frame from World.stepOutro, the state from
  `motorState` in systems/Outro.js) is one synthesized voice on the effects bus: a V8's cycle (audio/Motor.js
  `v8Cycle`, a PeriodicWave: eight firings, the two banks' lumpy pattern) driven into a soft clip through the
  exhaust's tone, noise pulsed by the firing (the growl), the gearbox's whine, the tyres' roar and hiss, and the squeal
  (narrow bands of noise, wandering, chattering) - every part following revs / load / squeal / speed within 25 ms. A
  `Gearbox` turns the van's real speed and throttle into revs (they climb in a gear, drop at the shift, blip up on a
  downshift into a bend); `squealOf` turns its slide and speed into the squeal, with a chirp at the launch and the
  shift out of first; exhaust pops as it catches and at each upshift. While it runs the music dips a little (`dip`,
  VOICE.duck); it fades with the picture and by itself VOICE.hold s after its last update. Before it, the starter
  (`crank`) turns it over from the lights on (OUTRO.lights) to the catch (OUTRO.catch).
  The title's elevated train (`_elTrain`) is heard as the picture shows it: ui/title/Timeline.js (`RAIL`,
  `trainSound`) cues it in half-second pieces, a little ahead, each with its curves (nearness, speed, side, the
  motors, the stand, the brakes, the flanges on the bend) and the knocks of every drawn axle on the rail joints
  near the window; audio/Elevated.js renders each piece (rumble, the truss's low modes, the wheels' roar, the
  knocks, soft tones), keeping its state from one piece to the next, and the mixer starts each where the last one
  hands over, so they run on as one sound and stop within a piece when the title is left. No horn.
  The bank is built by `node tools/build_sounds.mjs <packs-dir>` from the CC0 packs listed in `tools/sounds.json`
  (never hand-edit bank.js). Mix: `LEVELS` holds one reference level per bus (music, effects, guns, recorded shots,
  voices, ambience beds, ambience one-shots), `META[name].gain` each sound in its bus. Effects (and voices, through
  their own presence EQ) and shots share a glue compressor; the music has its own, so gunfire never pumps it (only
  the held duck moves it); the ambience goes round both, so gunfire never pumps the night. Then a soft clip and a
  limiter that only catches peaks (slow release). A kill confirm (`_confirm`) is a deep boom (`CONFIRM_BOOM`) under
  a muted note climbing with the chain; a new one chokes the last (META `choke`).
- Soundtrack (audio/Music.js): a registry of tracks (audio/tracks/index.js), one a level (level `music`, `trackOf`;
  the default is 'synthwave', the score below), the title screen playing `MENU_TRACK`. Music.js keeps the game's
  state (intensity, fight, chain) and hands it to the player of the track playing; a new track starts on its own
  downbeat while the old one fades. audition.html (repo root) plays every track live with its levels of intensity;
  tools/render_music.mjs renders them offline in headless Edge (WAV extracts in audition/, loudness per part and per
  layer, the kick's timing).
- Groove tracks (audio/groove/Groove.js, data in audio/tracks/<id>.js, instruments in groove/voices.js, harmony and
  pattern letters in groove/theory.js): a track is its tempo, swing and drum kit, chord progressions of 8 bars,
  phrases, layers and sections / forms (calm, tense, fight; or a single menu form). Levels of intensity 0..7 (calm,
  tense, fight, fight with a chain of 1..5 kills); a layer's part is a step map { level: 16-step pattern or phrase }.
  `planBar` turns a bar into notes (pure, deterministic); the player picks the level on a bar line (calm and tense
  share the bar clock, a fight is cued at once and starts its own form on the next bar, plays MIN_FIGHT_BARS, ends on
  a closing bar with a fill; the chain's stage goes up at once and down one a bar) and schedules each bar 0.3 s ahead
  as one-shots of instruments synthesized into buffers once (Karplus-Strong guitars and basses, FM Rhodes, saw
  ensembles, a talkbox, drums; rendered on first use and in idle time). Mix: a bus per layer (level, a sweeping
  lowpass for the filter-disco loops, pan, room and delay sends, a Rhodes tremolo), the kick unpumped and the rest
  pumped under it, a lowpass on the whole mix in the calm that opens with the tension, a light saturation at the top
  of a chain, a glue compressor and a soft clip.
- The synthwave track (audio/Synthwave.js, its data in audio/score.js): one procedural song in F minor at 126 BPM,
  planned bar by bar from data (progressions, 16-step patterns, lead phrases, sections, forms) and scheduled 0.3 s ahead on long-lived
  voices (bass + sub + growl, pad, arp, the calm's pulse, a 4-note stab, lead and its octave double) and one-shots
  synthesized once (kick, snare, clap, hats, toms, shaker, rim, clank, crash, reversed cymbal), through a glue
  compressor and a safety clip. Game drives it through `ai/Tension.js`: the intensity is `AI.music[phase]` plus the
  heat of the fight itself (`AI.heat`: shots, kills and blasts, cooling in a few seconds). 0 = menu loop; then,
  picked on a bar line, the calm (`FORMS.calm`: a dark pad, a muted pulse and a slow arpeggio that swell and sink
  every two bars, no drums), tense (`TENSE`: a heartbeat, the bass, ticking hats and rim, a riser into each return)
  and the song with its beat (`BEAT`, thicker layers and brighter filters with the value). The phases in
  `AI.combatMusic` switch it to the combat form (`FORMS.combat`: theme A on the drop's chords and motif, theme B on
  its own hook (VI - VII - i), a half-time breakdown that builds back on a rising bass, and a double-time chase that
  only comes while the fight is hot, `HOT`). A fight kicks from its first bar (four on the floor, clap, closed and
  open hats, shaker, a driven bass pumping between the kicks); `Music.setCombo(kills in the chain)` sets a stage
  (`STAGES`): each kill adds a layer (section `from` and stage-indexed lists: arp and rolling bass; stabs, rim and
  metal; the lead's hook; 16th bass, driving kick, crashes and 32nd rolls; the lead doubled an octave up, tribal
  toms, every filter open) and a little volume (`STAGE_GAIN`), with a stinger on the bar line when the chain reaches
  `STINGS`; the layers go a bar apart once the chain breaks. The mix gets dirtier as the fight does: a section's
  `grit` (by stage in a fight) plus the heat drive the whole music mix into a tanh blended with the clean mix
  (`GRIT`, `gritDrive` in score.js: the drive, the wet share, the level matched to the clean one, the fizz cut, the
  lows driven less), clean out of a fight. A riser, a reversed cymbal and a snare roll announce
  the fight at once, the combat form takes over on the next bar line, plays at least `MIN_FIGHT_BARS`, and hands
  back through a closing bar (fill) to the song's break. Sections end on fills and reversed cymbals into crashes.
- Prop destruction (entities/Prop.js, systems/Fracture.js, render/DamageArt.js, data/destruction.js):
  - every hit paints a mark at the real impact point into the prop's own canvas (so it moves with it): 9 mm holes,
    pellet pocks, 7.62 entry + exit blow-out (Penetration exit point and remaining energy), grazing furrows / metal
    scrapes / ricochets, blunt dents with radiating cracks, knife slashes across the swing, blast scorch + shrapnel.
    Bullets also dig a visible channel (to the exit, or as deep as their energy lets them).
  - material response (MATERIAL_FX): torn bits and chips fly back out of the entry and in a cone out of the exit,
    faster the more energy is left; wood splinters, glass cracks / shards, metal sparks and bright rims, fabric
    stuffing floating down, ceramic dust, electronics sparks / smoke / CRT implosion (light goes out), liquids leak.
  - damage zones (ZoneGrid): hits wear the zone they land in (and the zones a round crosses); a worn zone is torn
    off (a corner, a hole), a full line of torn zones saws the object in two: the smaller side falls, the rest keeps
    standing (a bolted prop's body shrinks to it).
  - states by HP left: 70% cracked, 45% split, 20% giving way (big chunk, sag, dust); at 0 it cracks, sags, then
    falls apart into its own parts (recipe cuts of its sprite: planks, wedges, frame, cushions, doors, lids...), with
    hidden parts (legs) and contents (pool balls, books, records, bottles, cans, trash bags) as small physical bits.
  - the falling apart is not one frame: `Fracture.crumble` gives each part a delay, a wave running from the blow to
    the far end over `DESTRUCTION.crumble` s. Until its turn a part is drawn in place (`Prop.parts`, `shed`,
    `release`, `drawParts`); the prop is `dying`, body already gone, and `dead` once the last part has let go.
    Blasts, explosives, fixtures and overhead / hung props go in one go. Parts are cut as wreckage (`cutPiece` with
    `wreck`: dulled, edges bitten) so they never read as live furniture, and a patch of grime and crumbs
    (`DamageArt.remains`) is baked where the object stood.
  - Melee blows carry their kind from `Character.meleeStrike`: 'cut' (blade, with its swing direction), 'punch', 'blunt'.
  - Light fittings up high (prop def `high`: ceiling, pool and wall lamps, tubes, neons and signs, the fan, the mirror
    ball, string lights, a streetlight): rounds, blows and anything thrown go under them (`traceBullet`, `meleeStrike`,
    `Prop.hit`); only a blast breaks them (Explosions: 'blast' / 'shrapnel').
  Only small objects are movable; everything else is `static` (bolted).
  - Sprite space is in world px whatever the sprite's density: the furniture, the street's dressing and the vehicles
    are painted at twice the world's density (engine/Assets.js `density`, tools/generate_assets.py FINE_PROPS), so
    `Prop.W/H` are `sw/sh(img)`, and a damage canvas (DamageArt `canvas(w, h, k)`) keeps the sprite's pixels, carries
    its `k` and has its context scaled: marks, cuts and pieces are all given in world px; `put()` draws any image at
    its world size. A Vehicle's canvas works the same way (its glass pixels found at the sprite's density).
- Sprite density: the people, the weapons, the furniture, the street's dressing, the vehicles and the floor tiles are
  painted at twice the world's pixel density, plain pixel art (`FINE` in tools/generate_assets.py, whose `Cv` is
  addressed in world px and reaches the single pixels of such a canvas); the engine draws them at half size
  (`img.k`). The floor canvas (MapRenderer) is that much larger, its context scaled, and only the part in view is
  drawn. The wall tops, the roofs, the lamps and the neon signs stay at the world's density.
- Bleeding is calibrated per weapon (data/wounds.js): a weapon names its `wound` profile (blow-back, spray along the
  blow, exit plume, mist, stain, final pool size and spreading rate, arterial spurts, how far the body is thrown).
  `Character.kill(angle, cause, killer, by)` hands what killed (`by`: a weapon definition or `{ gore, wound }`) to
  `gore()`; the cause is the fallback (`CAUSE_WOUND`). A knife casts a thin arc and leaves a pumping artery and a
  lake, 7.62 a long tight jet behind the body, buckshot a wide wet cone (only up close), a bat heavy slow drops.
  A profile's `crawl` is the odds that a guard killed whole is not quite dead: his `Ragdoll` runs a short scripted
  sequence (`opts.dying`, pure pose maths in fx/CrawlPose.js and fx/DyingPose.js, numbers in data/wounds.js). 'crawl':
  he gets onto his belly and drags himself a few uneven pulls away on his forearms (`CRAWL`, a seeded plan per body,
  one pull may fail), then lies still; 'curl' (a wound's `curl` odds, `CURL`): hands to the wound, knees drawn up;
  'spasm' (`SPASM`): a leg kicks a few times; 'throes' (`THROES`): plain physics jerks. Which side he lies on is real
  (`opts.back`: he faced the blow): `_rag_*_up` sprites face up, `_rag_torso_down` on his belly. Any blow or shove
  hands the body back to the physics at once.
- Blood on the floor (render/BloodArt.js, MapRenderer): a drop lands as a stamp picked by how it hit (flat = tapered
  streak along its travel with satellites, steep = ragged spot, heavy = splat); stamps are per-pixel thickness maps
  (film to core) coloured through one ramp per age, never circles or gradients. They are baked into `bloodCanvas`,
  drawn over the floor decals and under `fleshCanvas` (baked bodies and meat), so blood covers rubble and the dead
  stay readable on it. `decals.update(dt)` dries stains by re-blitting their tacky then dry variant (a few per step,
  queue capped). The pool under a body is liquid on the floor (systems/Liquids.js): fx/Bleeding.js grows its radius,
  Liquids pours what it grew by at the wound and lets it run; it stays where it ran if the body is shoved, stays wet
  after the body is baked, and once it has set (`LIQUIDS.kinds.blood.age` s after it was last fed) render/LiquidArt.js
  paints it into `bloodCanvas` in its dry colours, for good.
  Blood against a wall (`BLOOD_EDGE`, data/wounds.js): nothing of it lies on the floor within `floor` px of a wall
  or of a window tile (MapRenderer.trim takes off what each stamp, speck, streak, drag or set stain laid there, through
  a mask of fx/Spatter.js `offFloor`; the liquid itself is drawn `LIQUIDS.look.gap` px short of what holds it). What
  is thrown on a wall stays on the strip of its top within `face` px of the face it struck (MapRenderer.faceBand:
  splashes, drops, brain, a spilt drink; runs start in it). Nothing flies through a door leaf or an intact pane
  (Spatter.shutBetween): the exit spray (`fling`, `wallBehind` given the world) stops there, and so do airborne drops,
  the fine mist and the bits of bone (fx/Particles.js); a streak is laid only if its whole length is in the clear.
- Traversal (Character): `tryVault(angle, moving)`. Broken window, gate, parapet = hands planted on the edge, hoisted
  over (`style` 'hoist'); furniture = a one-hand speed vault (`speed`: the free hand flat on the top, world-fixed while
  the body swings past it on the other side, a gun kept on the target); a car's hood = the action-movie slide on the
  hip (`hip`), sparks on metal. Phases in data/feel.js `TRAVERSE` (CharacterAnim vaultPhases / slidePhases /
  rollPhases); everyone moves the same, the player alone throws the flourish (fx/TraversalFx.js, `TRAVERSE_FX`: dust
  by floor, a slide's streaks of light and skid mark, the plant's puff, a rim of light through the swing, a landing's
  ring of dust and camera dip).
  Space = vault > slide; the left click takes down from behind and finishes a man on the floor. (A cover system
  existed and was removed at the user's request.)
- Takedown (`TAKEDOWN`, systems/Takedown.js, Player.updateTakedown, data/finishers.js `TAKEDOWNS` / `takedownFor`):
  Left click right behind a standing guard who has his back to us: an execution from behind by the weapon in hand (`swing`,
  `hold`, `kind`; an empty gun or a launcher is struck with), a short sequence of beats (0.95 to 1.4 s) the player is
  locked in, the two bodies let through each other (a shared negative collision group). Fists: an arm round his neck,
  a struggle, the twist (`snap`: a dry body). A blade: a hand over his mouth, the throat cut (`slash`, the cut-throat
  bleed-out). The cue: across his throat. A club: one blow on the nape. A handgun: his collar, the muzzle on his
  nape, one round (dry: the butt). A long gun: the butt on the back of his head drops him to his knees, a round into
  him on the way down (dry: a second butt stroke). He is `held` (helpless, mute) throughout and drawn by CharacterAnim
  heldPose (the player: takedownPose); the body then goes down by the sequence's `dying` (data/wounds.js `KNEELS`:
  onto his knees, then onto his face, through Ragdoll's kneeling script; backward when boxed in). The guards hear
  each sequence's `noise` (a cut throat nothing, a blow on the head ~100 px, a round the gun's own noise) and the body
  let down. Scored as `takedown`, its label and FROM BEHIND (`how.from`), LAST ROUND when it was. Only while nobody has
  spotted us (`unspotted`: not on a guard who is after us, not while the director is on `alert`; open again in
  `evasion` / `caution`): spotted, `nearTakedown` stays null, no hint, the click is an ordinary attack. Each weapon has
  several of them (`TAKEDOWN_VARIANTS`, `takedownChoice`: never the same twice in a row, by the rounds left), picked ahead so the
  hint names it (`Player.pickTakedown`); the variants' own gestures are CharacterAnim `variantPose`. It does not
  need his back: any guard within reach who is not aware of us (`within`, `unspotted`) can be taken; not behind
  him (`behind` false), it is one done face to face (`TAKEDOWN_FRONT`, entries with `front`: we stand before him,
  he is turned to us and thrown back; a headbutt and the knee, a fist in the throat and a sweep, a blade under
  the ribs, the muzzle under the chin, a club across the temple), with no FROM BEHIND tag.
  With a hand free (`freeHand`: bare hands, a handgun, a blade, a short club) and something right in front of him
  (systems/TakedownSpot.js), his head is driven into it instead (TAKEDOWNS by `context`, grip 'hair'; the hint names
  it: TOILET, URINAL, SINK, SLAM ON BAR / TABLE / DESK..., WALL SMASH): he is pulled to it and turned square to it
  (Player.pullTo), each 'smash' / 'dunk' a pull back by the hair then the drive in (systems/Takedown.js `slamAt`,
  shared by heldPose and takedownPose; the pose's `bow`: bent over, the head on ahead of the shoulders), held on the
  contact frame (MOMENTS.slam, slamKill). Player.slamFx: his blood thrown back out, the surface marked (Prop.hit
  'blunt': a crack in the porcelain, splinters, the clutter on it knocked off; Prop.bloody; a wall dented, its dust,
  splashed and running), a toilet's water thrown over the floor, a placeholder sound, heard (`noise`). He goes down
  by `dying` and stays against what he was driven into: 'bowl' / 'ledge' (left kneeling, folded over the bowl, the
  table, the counter, the sink, for good), 'sit' (something low, SLAMS `rest`: sat on the floor against its side,
  Ragdoll `opts.against`, sitAgainst), 'wall' (sat against it: Ragdoll `opts.sit`, propUp); out of the furniture's
  way (no collisions), he drops where he is once it is tipped over or broken. Tagged ENVIRONMENTAL
  (`slammed`) or FLUSHED (`flushed`) by `how.env`.
- Slide (Player, `PLAYER.slide`): Space while running with nothing to vault. ~0.5 s burst from ~2x run speed decaying to
  a jog (~2.9 m), stays physical (walls stop it, loose props take our momentum), sweeps standing enemies off their
  feet, can chain into a vault, the gun stays usable; 0.5 s cooldown. At its heart (`duck`) the body is under the
  line of fire: rounds carry on over it (`Player.ducking`, Projectile) and the first one earns a breath of bullet
  time (`dodge` event). Each slide costs stamina (`cost`, back with `regen`; small HUD bar while it recovers).
  Its end pops up into a kick (`PLAYER.slide.kick`, systems/Kick.js, Player.startKick, CharacterAnim kickPose,
  TRAVERSE.kick): a standing guard within about a metre ahead takes the foot in the head, floored (cause 'kick', SLIDE
  KICK) and thrown back 0.8 m. Over a car's hood (style 'hip') the player's legs take a standing guard where he comes
  down (TRAVERSE.vault.hip.strike, Player.vaultStrike: HOOD SLIDE): the one leaning on its far side.
- Leaning on a car (body 'hood', spot 'hood': ai/Pastimes.js hoodSpot, data/posts.js HOOD): his backside against a
  parked car's flank by the hood, off the road, ankles crossed, smoking, a hand on the hood; off it when the car moves,
  is struck or burns (leanBroken), for good. Level 1's sidewalk patrol does it at his halts (job 'beat', `open`: the
  level sometimes opens on him there).
- Life at ease: while the squad is calm a guard's weapon is put away (`ai/Carry.js`: `stow`, `lower`; a pistol or
  a blade on the hip, anything long across the back), in hand and low as soon as something is up, raised on a
  target (he cannot fire before it is out: `AI.carry`). Idle picks (`Enemy.pickActivity`) mix watching with a
  cigarette, his pager, a stretch, a look at his watch, folded arms, a word with a colleague in reach (`chatWith`,
  lines `BARKS.chat`) and a leak (`reliefSpot`: a wall of the yard, a toilet; it leaves a puddle). Any character
  may define `busyHands()` (hands taken by something else than the weapon or the walk: guards' and patrons'
  pastimes, a passer-by's pockets or bag, hands up in a panic), read by `standPose`.
- Animation (entities/CharacterAnim.js): each frame a pose (torso offset/angle/scale, head turn, feet, hands, weapon,
  as offsets from the body) is built from the walk cycle and combat gestures, then vault / slide poses are blended
  over it so every move starts and ends on the walk pose. Vaults follow a Hermite curve that keeps the run-up and
  exit speeds. The gait (entities/Gait.js, `GAIT`) is a real one: cadence and stride grow with the speed (a walk
  under two steps a second, a run three), each foot is planted then swung ahead, the footstep sound is a foot
  coming down; the torso sits on the hips on a damped spring (`Character.carryTorso`: it leans into a start or a
  turn and is carried on past the feet when he stops short). The head is its own sprite (`<kind>_head`), turned
  toward the aim over shoulders that counter-rotate with the stride. Legs, arms (bent at an elbow found from where
  the hand is) and hands are painted as pixels at the sprites' density by render/LimbArt.js, coloured from the
  kind's look (`KINDS` in Character.js, `CIVILIAN_LOOKS`). A long gun is shouldered: butt in the right shoulder's
  pocket, right hand on the grip, left hand on the forend (`butt`, `grip`, `fore` in data/weapons.js).
- Turning and gestures: the gameplay `angle` (aim, shots, sight cones) is never eased; only the drawn body lags it.
  entities/Facing.js (`FACING` in data/feel.js, run by `Character.animate` after the step's intentions in
  `World.step`) keeps layers on springs: the head leads (or glances: `turnHead`), the shoulders follow (the torso
  sprite), the hips after them within `twist`; the hands and the weapon keep to the aim within `hands` of the
  shoulders. Standing, the feet are world points, planted: past `stepAt` he steps one foot then the other (a hop
  on both for a sudden about-turn), squares up once still. entities/Gesture.js (DOM-free, `GESTURE` / `TALK` in
  data/feel.js) times and picks the gestures: a hand reaching for the door leaf ahead and pushing it
  (`updateDoorHand`, `doorHandPose`), a guard's key in a lock (`turnKey`), the phases of drawing a weapon from
  `stow` (to the hip or the sling, grip, pull, present, the other hand last), the gesture going with a line
  (`Character.speak` from `Enemy.say`: point, palm, shrug, wave, beckon, hands, a nod). A character's `mood()`
  (panic, a man on his knees) bends his pose: shoulders up, head drawn in, a lurch, a look back, shaking.
- Fire (fx/Particles.js `fire` / `drawFire`, systems/Explosions.js `fireball`): a flame is a square chunk on whole
  pixels in the flat colour of its heat (white, yellow, orange, red, soot), drawn opaque after the lighting with the
  hottest on top; never a soft additive disc. The slow chunks of a burst stay in its heart and stay hot, the fast
  ones cool at the rim. A blast = a few lobes of such flames, a torn shock front (`rings` entry with `blast`),
  square billows of black smoke (`smoke` with `puff`), burning scraps thrown in arcs (`cinders`) that go on burning
  where they fall, and a ragged burn (`decals.scorch`, BlastArt).
- Liquids (systems/Liquids.js over engine/physics/Shallow.js, `LIQUIDS` in data/liquids.js): everything wet on the
  floor is one shallow liquid over the whole map, cells of 4 px (8 to a tile), a depth (mm) of each kind per cell:
  water, rain, beer, booze, blood, petrol. Between two cells a pipe carries a flux with inertia (pushed by the
  difference of their levels, slowed by the kind's drag, more so the thinner it is): a gush runs on and sloshes, a
  pool evens out. A cell runs onto a dry one only with more than its film (`film`, mm: surface tension), so a pool
  stops spreading at about a film deep and has an edge; under `stick` of its film a cell gives nothing more (the
  wet trail a flow leaves). Outflows are scaled to what a cell holds: the volume is kept exactly but for what dries.
  The floor has a level (`LIQUIDS.floors`: indoor floors a step up, a kerb up to the sidewalk, roads cambered from
  their kerbs so water runs along the gutters, small bumps, the rain's hollows), drinks (`soak`: carpets, dirt, the
  manholes of `street.manholes` swallow), and each kind evaporates at its own rate; blood does not evaporate but
  sets (`age` s after it was last fed it is no longer wet and is painted dry into the floor's blood layer). Kinds mix
  by volume (beer thinned by water loses its slip, blood turns water pink); a cell's film, drag, grip and slip are
  its mix's. Walls, windows (the sill is above the floor), a door shut on its frame (the cells under its closed leaf)
  and the furniture standing on the floor (`dams`: counters, fridges, shelves...; tables and beds stand on legs)
  are solid cells; an open doorway lets it through. Stepped at `rate` Hz, only in chunks of 16 x 16 cells that move
  (and their neighbours); a still pool sleeps.
  Sources: `world.liquids.source` (a `def.fountain` prop destroyed: the hydrant) and `spill` events (a prop's `leak`
  in data/destruction.js: a jet thrown toward `a`, a pipe's flood, a tank's gush; bottles of a `rack` burst one by
  one, `Prop.burstRack`, the drink running off the front of the shelf; bottles thrown out shatter where they land),
  `feed` (px2 of floor that much liquid would cover), `sprinkle` (drops over a disc: the sprinklers), the bodies'
  blood (each corpse's `pool` radius, poured at `poolAt()` as it grows), a car's leaking fuel (petrol), the rain's
  puddles (level `wet`: Weather lays where, Liquids sinks a hollow there and fills it level under its rim, at rest,
  never drying), the petrol poured in trails that a match will light (level `petrol`: [width px, [col, row], ...];
  systems/FireSpread.js runs the fire along them). Drops landing in it ring (`ripple`).
  What it does: a wet floor grips less (`World.floorGrip` x `Liquids.grip`: the mix's grip, by depth), so bodies and
  loose things slide further; a slick mix floors runners (systems/Slips.js reads `at(x, y).slip`). Anyone in
  `world.chars` who steps in it splashes (deep enough), pushes it along, then prints fading footprints on the dry
  floor (`decals.footprint`, event 'footprint'; the rain marks no sole) or one long smear when sliding
  (`decals.smear`). The sprinklers douse fires (Fires.douse).
  The look (render/LiquidArt.js, `LIQUIDS.look`): painted into a map-sized buffer a texel of 2 world px at a time,
  the depth in films softened over each cell's neighbours, roughened by a still noise, cut into flat steps (edge,
  its side facing the light lit, thin, body, deep, core) in the kind's colours (blood: BloodArt's RAMPS, wet then
  tacky), mixed with a second kind; glints, a beer's foam on a fresh flow (in clumps, never a dither), a petrol's
  thin rainbow bands. Only the chunks whose cells changed are painted again, once in view. Drawn over the blood
  layer and under the bodies, before the lighting (the light map lights it), `look.gap` px short of a wall, a window,
  a shut door or standing furniture. A second buffer says how much each texel mirrors (the rain's puddles the night
  sky too): Lighting.post draws the lights' streaks through it (`LIGHTING.puddle`), and like every reflection of the
  floor never over what stands on it (the standing layer of WorldRenderer is cut out of them).
- Melee (data/weapons.js `swing` club | blade, `heft`, `material`, `thrust`, `snaps`, `wear`, `breaks`): a blow that
  lands is dressed by fx/Blows.js (what struck, the heavy stroke, a spin or a sweep, from the front, the side or
  behind). The player's weapon wears out (`weapon.wear` in blows, kept on the item when dropped; `WEAR`: a man struck
  takes one, a thing struck - furniture, a door, a pane, a wall - a share, a whiff nothing; a takedown or a finisher
  done with it one, a finisher breaking it on its last beat): the blow that uses it up breaks it there
  (`Character.breakWeapon`, `breaks`): `snap` in two (the far end, `parts[0]`, flies on along the swing as Debris,
  splinters burst, the stub `parts[1]` is held and looked at a beat - `Player.broke`, CharacterAnim `brokePose` - then
  let fall, or the hand keeps `snaps`), `lodge` (the blade stays in the man as the Ragdoll's `stuck`, or painted in
  the wall or the furniture it struck; the handle falls), `bend` (into `bends`, worse), `toss` (thrown away); the HUD
  shows the wear as notches and flashes BROKEN (data/feel.js BREAK). A guard killed up close by the player's own hand
  (`how.close`) while his hands are free, or his weapon broke on that kill, has his weapon snatched: it falls, his hand
  goes to it and twirls it into his grip (`Player.snatches` / `grab`, data/feel.js SNATCH; the `disarm` tag,
  SNATCHED). Ground finishers and takedowns go by the weapon in hand (data/finishers.js): a finisher is a
  sequence of `beats` (blows, a held windup, a stomp, shots) played by `Player.updateExecution` / `landBeat`. Which one
  is `finisherChoice`: with somebody on him (systems/Danger.js) the family's QUICK KILL (one beat, free within 0.35 s),
  else one of its long executions (`EXECUTIONS`, never the same twice in a row). The man dies on the beat `kill`, within
  about half a second; the beats after it land on his Ragdoll (`struck`, `loseHead`, `plant`), and from the kill on the
  player walks out of it with a fresh move, a right click or Space (`leaving`; the pose lets go over `EXEC.blend`). The
  score: `quickKill` < `execution` (paid at the kill) < the same plus `SCORING.watched` when it is seen to its end
  (the `finisher` event);
  a cue is driven through the man and snaps, one half left in him, the other a stake in the hand. The circumstances of a kill (`how` of the `kill` event, the killer
  sliding or vaulting, a dodge or a pick-up just before, several in a row) are tags that add points and count as
  ways of killing (`Scoring.killTags`, `SCORING.tags`).
- Score (systems/Scoring.js, rules in data/scoring.js): fed by events only. A kill is worth its style (a gunshot
  the least; blade, melee, wreckage, glass, execution, takedown more; `UNSEEN` on top when the guard never noticed) times
  the combo multiplier (+0.5 per kill of the chain, capped at x4; the chain breaks 4 s after the last kill, flooring
  a guard gives it some air back). `tally(level)` adds the end bonuses (best chain, variety of methods, time under
  the level's par, stealth lost by ALERT phases, accuracy, mercy for a guard left alive on his knees) and penalties (passers-by), then the grade from the
  level's thresholds (`LEVEL_SCORING`, or a per-guard scale for test rooms). Game.onExit keeps the best result per
  level (systems/Records.js); a run where the sandbox was opened is not ranked. Scoring tells what it scores by events
  (`scored`, `multiKill`, `chainEnd`), never by world texts (those are the guards' barks): ui/KillFeed.js keeps what
  is shown of it on the real clock (KILLFEED in data/feel.js): the points stamped under the body (WorldRenderer,
  sized and coloured by the chain), and under the HUD's score and clock the chain count from its 2nd kill, the fuse
  draining over the chain's window, the labels of the last kills, the cash-out of a chain that ran out; a multi-kill
  puts up a banner and a moment of slow motion (MOMENTS.multi, never cutting short a stronger one). A melee swing of
  the player's is drawn a little to the guard in front of him (systems/Lunge.js). Screens.drawResults counts the
  lines up one after the other.
- Replay (render/Replay.js, `REPLAY` in Config.js): while playing, Game.render hands the finished frame (before the
  vignette and the HUD) to `ReplayRecorder.capture`, which copies it downscaled into a rolling atlas 15 times a
  second of world time. A kill closes a clip 0.75 s later (more kills in the meantime stretch it); the atlas is
  copied in one drawImage into one of at most 6 clip atlases, the weakest clip (`clipScore`: cause weight,
  multi-kills) giving way. On the results screen `ReplayPlayer` loops the clips in order, cross-fading between
  frames and slowing down around each kill, shifted left of the score column. Never on the death screen, nothing
  delays a restart; the canvases are reused from run to run and released on the way back to the title.
- Off-screen guards (systems/Threats.js, ui/Indicators.js, `INDICATORS` in Config.js): a thin dim chevron on the
  screen edge for a guard just outside the view (within `reach`) that the player can plausibly place: he is after
  the player or suspicious, he was heard (shot, shout, running) in the last seconds, or he was on screen a moment
  ago (fainter). It pulses pink when he has the player in his sights or just fired. A quiet guard never seen gets
  nothing: it must not become a radar.

## Performance & robustness

- Physical debris live at most `MAX_AGE` (7 s) or until they settle, then get baked into the floor canvas;
  at most `MAX_DEBRIS` (180) at once; pieces under 6 px don't collide with each other.
- Purely visual pieces use `particles.shard(img, ...)`: they arc with a fake height above their shadow, bounce,
  skid, then are baked into the floor (remains stay). Debris also has a fake height (`z`, `vz`).
  Bolted furniture keeps at most a few physical parts per collapse (`DESTRUCTION` caps in Config.js).
  A piece is baked with the shadow it cast while loose (`decals.wreck`), so settling does not pop.
  A table whose def names a `flips` prop can be tipped on its edge (`Prop.flip(dirA)`): it is replaced by that
  bolted, vaultable shield with the health it had left, and what stood on it is thrown (`Prop.empty`). A gun guard
  taking cover prefers a spot with such a table before it (`AI.flip`, the `bonus` of `Tactics.findCover`), steps
  up to it and shoves it over toward the threat (`Enemy.tCover`, sub `flip`).
  A prop whose def has `tips` (the street's `trash_can`) is knocked over in place instead (systems/Tipping.js): the
  same Prop gets the lying sprite and a rectangle body (`tipped`), its lid and rubbish are thrown once, and from then
  on hits only mark and roll it (`Prop.hit`), a blast wears it down, a car at speed (`Vehicle.ram`, an 'impact')
  wrecks it. A level keeps one standing with the prop option `{ tips: false }` (`noTip`: the indoor bins).
- Floor litter (`LITTER` in Config.js): everything still flies, but only a share of the crumbs (chips, glass slivers,
  fluff, cinders, tiny visual shards) leaves a mark where it lands, and a faint one; real pieces, casings, magazines
  and blood always stay. Blood has its own layer above the floor, so it always covers rubble.
- Damage canvases are CPU-backed (`willReadFrequently`): pieces are cut from them and tested for opacity every hit.
- Sprite caches (silhouettes, slices) are WeakMaps so per-instance canvases can be garbage-collected.
- The replay recorder costs one small canvas-to-canvas copy every fourth frame (no read-back, no allocation while
  playing; not measurable on the frame time) and at most (clips + 1) atlases of 30 frames of 384x216 (about 70 MB).
- `Game.safeDraw` isolates the world draw: an exception is logged once and the context is restored, so the HUD,
  cursor and post effects keep rendering.

## Enemy AI

Guards mind their own business until the player gives himself away (`Director.isThreat`): with no gun in his hand
and outside the level's `premises` (tile rectangles, `lv.guard()` in tools/levelkit.py) he is a passer-by; a gun in
hand, a weapon in hand inside the premises, a shot heard, a guard floored or killed, a word that turned into a fight
make him a target for good. Short of that, what he does that no customer does gets him a word (below). No
`premises` = hostile ground everywhere (lab, street testbed, tutorial). Level 1's bar room and toilets are public: only the VIP room, the back
room, the storeroom, behind the counter and the yards are premises. A passer-by must not hang about either, except
in the level's `welcome` rectangles (`lv.host()`, `Director.isGuest`: a customer in the bar room) (`Enemy.mind`, `AI.loiter`,
`Perception.loiterRate`): a guard who has him in front of him within a few metres stops, stares him down and tells
him to clear off, warns him a last time ('!'), then snaps: the whole squad is provoked. His patience (shown on the
detection gauge) runs out faster the closer the stranger stands and comes back slowly once he has gone.
An unarmed stranger seen in the premises (`Director.isIntruder`) is told to get out (a word, below) rather than
fought on sight. The loiterer's last stage is a shove (a word opened at the shove), then the fight.

**A word with a stranger** (`Director.watchConduct` / `conduct`, ai/Conduct.js, data/conduct.js `ACTS`,
`Enemy.doChallenge`, `AI.challenge`). While nobody has anything against him, the odd things he is seen doing are
acts: `trespass` (unarmed in the premises), `weapon` (a blade or a club in hand on public ground), `vault` (over the
furniture), `slide`, `window` (a pane put in), `smash` (a blow on the furniture), `noise` (his own glass / door /
thrown noise), `lurk` (hanging about a door into the premises, `AI.challenge.lurk` s), `bump` (running into a guard),
`loiter` (the doormen's patience run out). The nearest guard who saw it (`Enemy.witness`: in sight within
`AI.challenge.sight` px; a noise turns his head, so no view cone for those) leaves what he was at (state `challenge`,
'?', weapon still put away over a trifle) and walks over, calling him ('hey'); a word's distance off he tells him (the
act's `order`: "OUT. NOW.", "PUT THAT DOWN.", "HEY! CUT THAT OUT."...), then gives him the act's `wait` s to comply
(`comply`: off the premises, empty-handed, off the spot, or simply not again while watched). He warns him ('press',
'!', weapon in hand), shoves him (a flat hand in his chest: `Player.shoved`), and the fight is on ('snap', the squad
provoked). Doing it again moves him on at once (a worse act becomes the case); complying long enough lets him off
('settle'); out of sight `lost` s, he lets it go ('letgo'). One guard at a time has a word (`Director.challenger`):
the others who saw it only glance at the stranger (`Enemy.glanceAt`: the head turns, the rest carries on), and a man
let off is remembered `memory` s (his next word opens at the warning). His gauge shows his patience running out, a
third per stage. A gun in hand is no matter for words: it is a threat, as before.

- **Guard** (`entities/Enemy.js`), states by awareness: unaware `idle` (post: watch, scan, look behind, smoke,
  pager) / `patrol` / `return`; suspicious `suspicious` (freeze + turn toward the stimulus: the tell) /
  `investigate` / `check` (body, knocked-out mate, wreckage, empty post) / `search` / `guard` / `dizzy`;
  alert `combat` / `hunt` / `fetch` (pick a weapon up) / `flee` (unarmed: run to an armed mate) / `backup` (run
  to fetch the free guards of another room).
- **Detection meter** 0..1 (`ai/Perception.js`): fills while the player is in view, faster close / in the centre
  of the cone / running / lit (`world.lighting.levelAt`) / in a vigilant phase, slower when distracted;
  `?` from `ENEMY.suspicious`, `!` at 1. Noises set the meter to a level (`ENEMY.hear`), never straight to `!`.
- **Hearing while all is calm** (`Director.emit`): only the `AI.listen.go` guards nearest a noise go and look; the
  others glance toward it and carry on. Alarms (`ALARMS`: gunshots, a mate's fire, blasts, a body falling, a wall
  coming down, footsteps) reach everyone in range, and once the squad is on edge every noise does. A guard having a
  word only glances at a small noise.
- **Finding the way** (ai/Nav.js, `AI.nav`): a guard's path-finding (`World.pathForGuard` with `Director.pathCost`)
  weighs each tile: the ones he pushed at in vain (`Enemy.jammed`: a thing from the second time, people from the
  `people`-th; remembered `forget` s, his own `CellMemory`), around where a mate fell (`Director.danger`, shared: it is
  called out), the routes his mates in the fight already take (`shareRoute`: the hunters spread over the ways in, one
  through the bar, another round by the gaming room), fire, a slick floor. After `tries` jams on his way to the same
  spot he gives it up (travel reports it done). On the way he gives way to the people around him (`giveWay`: personal
  space, a step to the side round one standing or coming, falling in behind one going his way: a queue at a doorway,
  in a corridor), takes doorways one at a time (`AI.gate`) down their middle, vaults low furniture he is stuck on.
- **Fairness**: human reaction delay before the first shot (`ENEMY.reaction`, `reacquire`), turn-rate limited aim,
  aim error that shrinks with steady sight (`aimErrorMax`, `aimSettle`), no shot from off screen, no psychic
  knowledge (last known positions only, noise localisation error).
- **Combat tactics** (re-planned every 0.3-0.5 s): `hold`, `advance`, `backoff`, `cover` (duck / peek / volley),
  `flank` (one or two guards, Director decides), `suppress` (short burst where he vanished), `reload` (to cover,
  "RELOADING!"), `hunt`, `panic`; shotguns `ambush` (crouch behind a corner on his way); melee `rush` (weaving,
  dodging a pointed gun) and `stalk` (cover to cover while a gun is on them). Dry guns are thrown at the player.
- **Director** (`ai/Director.js`): phases `normal -> caution -> alert -> evasion -> caution -> normal`
  (durations in `AI`), contact shout (up to `AI.maxHunters` converge, the others hold and watch), call-ins on
  incidents, evasion sweep over search points around the last known position (doorways, corridors, corners, behind
  furniture, out of sight of it; once they are all done the sweep goes `AI.widen` further out), claims on tactical
  spots, a hunter going where a mate fell lately coming on carefully (`Director.wary`, `AI.wary`: brisk walk, weapon
  up),
  a per-step `budget()` for path-finding (1) and cover / flank searches (3) so the cost is spread over frames.
- Barks are short world texts (`world.texts`), one at a time for the squad (but the `URGENT` occasions), one man
  per occasion (`AI.barks.same`), never a line it has just used (`Director.bark`, ai/Barks.js `lineFor`); the
  lines, their blanks, which ones are yelled / muttered (the voice: `shout` / `mutter`, under the audio voice cap)
  and their colour are data (data/barks.js). Every guard has a name (`Director.nickOf`, NAMES; the boss is BOSS):
  a contact calls in a mate by name, a mate's death is cried by name ("MIKEY'S DOWN!"), a body found is named, the
  last two call out for the fallen. A guard with the player in sight calls out where he is when it is somewhere new
  (`Director.report`: the level's soundscape zones, a zone's 6th element naming it, `PLACES`, and `LANDMARKS`
  props: "HE'S IN THE TOILETS!", "BY THE POOL TABLE!"); searchers say which room they take; broken windows, forced
  doors and the smashed fuse box each have their lines. In a fight a guard curses the player every few seconds
  (`AI.tauntGap`: at the man in his sights, at the corner he vanished behind, at the killer of a mate), and
  taunts him while hunting him down.
- Backup (`Enemy.goForBackup` / `doBackup`, ai/Squad.js, `AI.backup`): at contact, a guard the shout left alone,
  or outgunned (bare hands or a blade against a gun), may run to the biggest group of free guards within reach
  (one roll per guard, one runner at a time, never the boss); there he sends them in by name and leads them back.
- Surrender: when a kill leaves one guard of a real squad (`AI.surrender`), he may be `shaken`; the next time he
  faces the armed player he throws his weapon down, kneels with his hands up and begs (`Enemy.surrender`, state
  `yield`, the pose CharacterAnim `kneelPose`). Any guard on his own, empty-handed or out of rounds, facing the
  armed player close may give up too (`Enemy.loseNerve`, odds by kind). He is out of the fight:
  `world.enemiesLeft` and `Director.alive` count him out, the 'surrender' event clears the level once nobody is
  left, sparing him pays the `mercy` end bonus, killing him scores as any kill. Until the level is cleared, if
  the player turns his back on him a moment with a loaded gun at hand, he may get up for it (`Enemy.betray`) and
  is back in the fight ("SUCKER!").
- The boss (the guard whose job is 'boss') says his word the first time he sees the player: big, in a bubble over
  his head (`Enemy.bossLine`, WorldRenderer `drawBubble`, data/barks.js `BOSS`), the game slowed a moment, his
  fire held while he says it.
- A boss of his own kind (`entities/Boss.js`, data/bosses.js `BOSSES`; level 1's is CUEBALL, the comic's heavy):
  - his beat on first sight: his line, the name card slammed low on the screen (KillFeed `card`), the camera pushed
    in (systems/BossStage.js), the soundtrack's heat full; his fire held `intro.hold` s;
  - he walks at the player firing from the hip (`plan` / `tAdvance`), his pump-action every `fire.interval` s; every
    shot is told: the pump racked `fire.pump` s after the last one (heard, the forend worked), then a glint growing
    at the muzzle for `fire.tell` s (`tellK`, render/BossArt.js); he reloads on his feet with a word (the opening);
    furniture in his way goes over or is sent off (`clearWay`);
  - TWO hits: every death goes through `kill`, and the first one only wounds him (`wound`): thrown back, reeling
    `wound.stagger` s, blood, his head's `_hurt` sprite (shades askew, a lens cracked), the wound drawn where the
    blow struck (`struckSide`, BOSSES `spots`) and his free hand on it, a slow-motion beat, WOUNDED on the feed;
    then he roars and is berserk (BOSSES `berserk`: faster on his feet and on the trigger, wilder), bleeding as he
    goes. `wound.grace` s nothing else touches him (the other pellets of the blast). The second hit kills him: his
    gun thrown, his shades skittering off (items/shades), onto his knees then his face (`dying: 'kneel'`), a long
    slow motion, the camera on him, the kill tagged by his name (`how.boss` -> SCORING.tags);
  - bare blows (a punch, a slide's kick, a door: `knock`) he shrugs off `wound.fists` times, the next one wounds
    him; wounded, a knock floors him like anyone and he can be finished on the floor (any finisher);
  - seized from behind while whole, he throws the player off (`shakeOff`, asked by `Player.startTakedown`: the
    player shoved back, he comes round with `shake.react` s before he can fire); wounded, he can be taken down.
- Footprints: Liquids emits 'footprint' for every print; the Director keeps the player's in `director.trail`
  (ai/Trail.js, `AI.trail`: they dry after `fresh` s). A guard who sees one (`Enemy.scanWorld`) follows the run of
  prints hop by hop (state `track`, one tracker at a time), then goes and looks where they were heading. Bloody
  prints alarm any guard and put the squad on CAUTION; wet ones only mean something to a guard already looking.
- `?` / `!` and the meter are drawn
  after the lighting (`Enemy.drawMarks`). HUD: small CAUTION / ALERT / EVASION label with the time left.
- Level fields (optional): `patrols: { 'col,row': [[col, row], ...] }` = explicit route for the guard spawned
  at col,row (he loops through it, pausing at each point); without it uppercase guards wander around their
  spawn. `passive: true` = dummies with no perception that still go on at their job (lab), but the guards whose
  tile is listed in `awake: ['col,row']`. `jobs: { 'col,row': 'pool' | 'cards' | 'count' | 'door' | 'wipe' }` = the pastime
  of the guard posted there (ai/Pastimes.js): he is at it while all is calm, less watchful (`Enemy.distracted`),
  and drops it as soon as the squad is on edge. Two of them leave his eyes free: a doorman ('door') stands arms
  folded and follows the player with his eyes (`AI.gaze`), a bartender ('wipe') polishes a glass and ducks behind
  his counter for a moment at the first shots (`AI.duck`).
  `looks: { 'col,row': kind }` = a guard who is his own man: the kind of his sprites and his limbs' colours (the
  boss: `boss`, built like a heavy, `heavyBuild` in Character.js); his letter still gives his weapon.

## Street life (systems/Ambient.js)

Optional level field, levels without it are untouched:
```js
ambient: {
  seed: 1986,                                                    // optional (default: hash of the level name)
  traffic: [{ row: 11, dir: -1, speed: 9, gap: [3, 7], models: ['car', 'car2', 'van'] }], // row tiles, speed tiles/s
  walkers: [{ path: [[-1.5, 7], [45.5, 7]], gap: [6, 13], max: 3 }], // tiles, off-map to off-map (or to a door)
  patrons: [['civ2', 16.8, 14.15, 270, 'drink']], // customers posted indoors: [sprite, col, row, deg, pastime]
}
```
- **Sleeper**: a patron at the 'sleep' pastime (the tramp on his cardboard, level `street.beds`) lies there,
  stepped over like a body, until a shot, a blast, a scream, a blow or the player running over him wakes him
  (`Civilian.sleep`, `Ambient.stir`); then he is up and off.
- **Open borders**: `TileMap.buildEdgeBodies` puts invisible static bars (`CAT.EDGE`) just outside the map. Characters,
  items, bodies and loose props collide with them; driven vehicles and passers-by leave `CAT.EDGE` out of their mask.
  Path-finding never leaves the grid, Lighting treats the outside like the border tile (no shadow edge on an open street).
- **Traffic**: real `Vehicle`s (same wrecking, lights, explosion) spawned beyond the edge when the spawn box is clear,
  driven by a `Driver` (Traffic.js): personal cruise speed, car following (`safeSpeed`), late hard braking for people,
  wait then go around a static obstacle through a free lane (backing up when wedged), give up after `AMBIENT.giveUp`
  (engine off, parked). A lane whose spawn stays blocked `AMBIENT.jam` s closes until it is clear again. A burst tyre,
  a dead driver (windshield gone / heavy damage) or a fire makes the car coast, drift and stop: it becomes an ordinary
  parked car / wreck (tiles marked blocked, driver bails out). Gunfire heard from the wheel (`AMBIENT.flee`): most
  drivers stand on the brake after a moment of shock, leave the car in the road and run (sometimes a passenger
  too), the others floor it; no new traffic until the street has calmed down. A gun held on a driver from close
  (`Ambient.aimedAt`, `AMBIENT.heldUp`) for a beat: he stops and runs for it, stops dead hands up until the gun has
  been off him a while (then away flat out: Driver state `held`), or floors it, his nature's call (`Driver.heldUp`,
  once). A body lying in the lane is an obstacle like a stopped car (`soft`): gone round through a free lane after
  the driver's patience, crept over (`AMBIENT.body.creep` s) when there is none. Above `AMBIENT.lethal` a car kills whoever it hits and
  throws the ragdoll (`cause: 'vehicle'`); it drives over bodies. Driven cars skip the static shadow caches (unshadowed
  lights redrawn every frame, brake lights flare). Heard car by car by systems/Ambience.js (an engine voice each).
- **Passers-by**: `Civilian` (Character subclass, team `civilian`, sprites civ1-8) with a `Walker` brain. They are in
  `world.chars` (bullets, blasts, melee, cars hit them) and `world.civilians` (drawing), never in `enemies`: no target,
  no HUD count, guards ignore them. They give way to one another and to everyone else (ai/Nav.js `giveWay`), and a
  runner held up three times on his way finds another way out round that spot (`Ambient.jams`, `escapeRoute` cost).
  A commotion short of a fright gets a look (`Walker.notice`: a stroller slows and turns his head, a customer turns on
  his stool, one may mutter "WHAT'S GOING ON?"): a guard telling the player off ('challenge'), a smash or a door
  banged near enough (`AMBIENT.look`). A man floored in a fight close by sends them off like a weapon ('knock': kind
  `fight`). Gunshots / explosions (noise), a kill or a body in view, the armed player close by
  or a screaming neighbour make them panic (hands up or duck), then sprint off the map along `escapeRoute` (Dijkstra
  that avoids the danger), screaming (world texts and the `scream` / `whimper` voices, one pitch per passer-by): a
  cry at the fright (each up to `AMBIENT.cryLag` s late), then one every `AMBIENT.panic.cry` s on the run, a scream
  `panic.scream` of the time; the mixer lets four screams at most sound at once (META `scream`).
  No new passers-by for `AMBIENT.panic.calm` s after gunfire.

## Soundscape (systems/Ambience.js, data/soundscape.js)

Optional level fields: `soundscape: { rain, zones: [[kind, col0, row0, col1, row1], ...] }` and `soundSpots:
[[bed, col, row], ...]` (written by the level kit's `lv.sound(kind, ...)` / `lv.sound_spot(bed, col, row)`). No rain
is heard (`rain` is not read: a dry night). Every floor tile gets a kind of place, the first zone that holds it, else
`street` (outdoors), `roof` (`^`) or `room` (indoor floors, `AMBIENCE.indoors`); doors and windows keep the last one.
A kind (`ZONES`) has a reverb class, beds (`{ bed: level }`, a crowd of calm customers or the mains may drive them)
and events (one-shots on random clocks, from a calm customer, a guard at his job, a prop or a spot of the zone).
Where the player stands its beds play openly; the other kinds within `carry` tiles (a distance field through
walls) bleed in at `AMBIENCE.through` and less, low-passed, panned toward them; levels ease at `AMBIENCE.ease`.
A spot (`SPOTS`, the level's `soundSpots`) is a bed heard from its tile (a radio behind a window). The far city
(`CITY`) plays everywhere on its own clocks, each sound from a random side and distance (the elevated train every one
or two minutes, a police car crossing, horns, a car alarm, a dog), lower and dull from under a roof (`AMBIENCE.city`).
Prop beds (`PROP_BEDS`) follow the nearest working prop of their kind; the traffic (`CARS`) gives each of the nearest
moving cars two voices: the `engine` bed (a V8's cycle, its growl and rasp; audio/Motor.js) whose rate follows its
speed and the Doppler shift and whose tone opens with the speed (`CARS.tone`), and the `road` bed (the tyres' roar
and hiss, by the speed, the Doppler only); through a wall both are muffled and lower still (`CARS.walled`). The bar
falls silent when its customers panic, the radio and the hums stop with the power.

## The air (data/atmosphere.js)

All of it is a look but for thick smoke, which hides from the guards (the smoke is no obstacle). Readability
first: it is the lamps that make it show. (The rain's puddles are liquid on the floor: see Liquids above.)
- Rain: the user wants none falling, so `RAIN.falls` is off: what is left is the wet of an earlier rain (puddles,
  floors in the open mirroring the lights, a light mist, soaked paper, thicker steam). How wet is the level's
  `soundscape.rain` times `RAIN.look`. Only where the sky is (Weather.skyGrid: open floors not in `AMBIENCE.indoors`, outer walls and roofs; never a room nor its walls).
  A drop is hashed from its cell, its slot and its cycle (render/WeatherArt.js, worked out once a frame): a short
  streak sprite crossing the picture with the wind, then a crown where it lands, rings where it lands in water.
  Drawn before the lighting (the light map colours it: it glitters under a streetlight) and the drops in the air
  once more, faint (`RAIN.after`), over the lit scene (not the crowns and rings: they would lie over people). Floors in the open mirror the lights `1 + wet` times harder (Lighting.post),
  a car's beam lies on the wet road as a sheen, rain puddles mirror the night sky (`LIQUIDS.look.kinds.rain.sky`).
- Smoke (systems/Smoke.js over engine/physics/Fluid.js, `SMOKE`): every smoke, steam and dust cloud of the game is
  this one simulation. The air of the whole map is a coarse fluid seen from above, the layer under the ceilings:
  flow cells of 16 px (velocity), density cells of 8 px, stepped at 20 Hz (the flow one frame, what it carries the
  next) and only about the view (`reach`); nothing is stepped while the air there is empty and still. It carries
  four kinds (`SMOKE.kinds`, each its own density in Fluid.kinds, all moved by the same flow; a kind with nothing
  in the stepped region is not carried at all), each with its loss in a room and in the open air, its spread, its
  look and how much it hides:
  - smoke (grey): gunfire, cigarettes, a car's exhaust, a damaged engine, dust of a wall or a window torn out; a fight's smoke hangs 10-20 s in a room; it never hides anyone;
  - soot (near black, opaque at its heart): blasts (a big billow, volume pushed out of its heart, eddies), what
    burns (`burn` by size: the level's fires, the small fires a blast leaves, a burning car and its wreck, a pierced
    gas bottle's flame, shorted electronics), a screen caving in, a dying motor; it hangs 40-90 s in a room, the
    wind takes it sooner outdoors;
  - powder (white): a pierced wall extinguisher's jet (`jets.powder`, thrashing as it empties, swelling into a
    cloud), gone in about 15 s;
  - steam (white): manholes, wall vents, a pierced steam pipe's jet (`jets.leak`, systems/Steam.js), a fire doused,
    the spray of a burst water main; it condenses away in a few s.
  Walls are solid cells; a door is solid while shut on its frame (`shut`), a pane while intact; an open door or a
  smashed window between a room and the open air draws the room's air out (`draft`: a push and a spill over the
  lintel, every kind). Every 'shot' leaves a puff of small lumps strung along the bore and thrown on by the muzzle
  blast in a narrow jet (`muzzle`: `lumps`, `ahead`, `width`; `muzzle.by` per weapon sound) and a smaller one out of
  the ejection port with the case, thrown to the gun's right (`muzzle.port`). Threads (a pool of points that rides the air, sways and leaves its smoke in the layer as
  it fades): the smokers' cigarettes and cigars (a breath after each drag, the boss's slow cloud after a draw), a
  cigar clamped in the teeth, butts smouldering on the floor or in an ashtray, a barrel just after a burst.
  Stirring: people walking and cars going by drag the air, rounds along their line, ceiling fans (props with `spin`)
  turn it and thin it, sprinkler heads bring it down (`wash`), a slow divergence-free convection under ceilings, the
  wind and the 'gust's outdoors. A smoky place of the soundscape (`rest.zones`) keeps a faint patchy grey layer,
  thinned by the power cut. Sight: `Smoke.blocks` (World.sightLine, Scoring's 'smoked') is true when a line crosses
  `sight.len` px of air at least `sight.thick` thick, the kinds weighted by their `sight` (Fluid.thickAlong); quick
  to say no while nothing thick is about.
  SmokeArt samples each kind's density at the light map's size on the world's 2 px grid (softened by a 1-2-1 kernel
  each way, so the carrying's cell-to-cell grain never shows), adds them into an opacity cut into flat bands whose
  edges waver along a smooth noise laid on the world's grid (pixel art, no blur, no dither, steady as the view
  moves), each kind capped (`look.max`); one kind alone is painted from its own band table, mixed kinds by their
  shares. It is refilled only when the air stepped or the view moved, and only the buffers the kinds in view use are
  written: the glow (screened, lit twice by the light map: the dark stays clear), the white of powder and steam
  (lit once), the veil (taken off where lit) and the soot (taken off whatever the light), all right after
  Lighting.apply (so muzzle flames, texts and marks stay crisp above it); the open air's mist in the rain goes in
  the glow. The threads are drawn a world pixel at a time with the scene, before the light.
  Still particles, not the air: dust that is not a cloud (plaster off a bullet hole, a slide's or a vault's scuff,
  a body hitting the floor, a tyre bursting), the getaway van's exhaust and tyre smoke (puffs that read in the dark
  street, the outro's look kept as it was) and the trails of burning scraps in flight (they have a height).
- Neon faults: `NEON.faults` picks, by a hash of where they stand, a dying tube and a few stuttering signs/tubes
  (Flicker.pickFaults); their light, its reach and their glow map flicker together.

## Rooftops

The big brick masses around a level are the neighbouring buildings seen from above. Nothing is simulated up there:
- `TileMap.isRoof(x, y)`: a brick tile with nothing but walls (or the edge of the map) around it. MapRenderer draws
  those with `tiles/roof` instead of brick, so the outer ring of a block reads as its parapet (inner shadow, soft
  weathering). A breached parapet turns the roof tiles behind it back into brick.
- Optional level field `roof: [[kind, col, row, deg], ...]` (`lv.roof()` in tools/levelkit.py, which checks that each
  piece stands on roof tiles, overlaps nothing, and that its glow never reaches the street). Kinds live in
  data/roofs.js (`ROOF_DECOR`: height of the cast shadow, optional `light`), sprites in `roof/<kind>`.
  `MapRenderer.dressRoofs` paints them once on the wall canvas.
- Lit pieces (skylights, the stair-head door lamp) become unshadowed lights in Lighting (`addRoofLight`) with their
  emissive map `roof/<kind>_glow`; they are above the street, so the stealth light grid ignores them.
  Roof tiles have their own ambient tint (`LIGHTING.ambient.roof`), darker than the street: out of play.

## Doors and windows

`Door` = a leaf of a kind, one per place (data/doors.js `DOORS.kinds`, level option `doors: { 'col,row': { kind } }`,
levelkit `door()`): its skin (tools/generate_assets.py DOOR_SKINS, at FINE density: the emergency exit's grey steel
and red push bar, the bar's dark wood and porthole, the toilets' swinging louvres, STAFF ONLY, the boss's leather,
the gaming room's green, a flat's, the corridor's wired glass, a shop's glass), its weight (a flat's 20 kg to the
fire door's 65), its jambs, its sounds, a closer or not, glass that breaks (`glass`, `broken`), an EXIT sign (`exit`,
level option `inside`). It turns on a kinematic hinge (engine/physics/Hinge.js: its real moment of inertia, dry
friction and drag that let it swing on a touch and bring it to a stop, cushioned end stops, creaks, slams knock
enemies out); what a contact gives the leaf is taken about the hinge (`Door.constrain`), so a push anywhere on it
opens it. A man walking into it leans on it with a limited force, more at a run (systems/Doors.js `prePush`,
`Door.pushed`), and is held to the speed it really goes; kicks and blows slam it open, rounds barely turn it
(`DOORS.hits`). Coming shut slowly it latches (a click). A closer swings it back shut in about two seconds, overshoots
a few degrees, settles in a swing or two and latches, stopping against whoever or whatever stands in its arc; its arm
is drawn from the leaf to the wall. A swinging door (`spring`) hangs a pair of half-leaves (Openings `doorLeaves`
`pair`) on spring hinges: pushed either way, back to the middle in a few swings, never latched, never locked. Doors
are only pushed (no E on them: the user found it useless). A door that locks has a lamp by its lock (`Door.lights`, their
glow in render/Lighting.js): red locked, amber while a guard turns his key (`unlatch`), then green with a beep; green
stuttering once the lock was burst. `relock` (the lab only) locks it again after a while shut.
Guards take a doorway one at a time and down its middle (`Enemy.follow`: `gateTaken` / `standBack`, `AI.gate`,
`Tactics.throughDoor`), and re-plan when the ground covered says they push at something that will not give.
Level tile `L` = locked door: static, blocks path-finding; shooting the lock (latch end) or kicking / hitting it
breaks the latch and bursts it open. Bullets punch holes in a per-door canvas, damage warps the leaf, 7.62 rounds
go through, at 0 HP it is ripped off (Destruction.detachDoor).

- Layout (world/Openings.js `doorLeaves`): a run of door tiles is one leaf hinged on the wall before it (pivot set
  in from the wall end, so an open leaf lies against it), a run of two is a double door. Each leaf knows its
  `support` (hinge) and `strike` (latch) wall tiles.
- Look: the leaf sprite (`structure/door`, `door_locked`: steel straps, lock case, red tell-tale) is cut in three
  and its middle tiled to the leaf length (`Door.compose`). `MapRenderer.doorway` paints the threshold on the floor
  canvas and a jamb in each wall end on the wall canvas (wood casing, steel in brick), so a jamb goes with its wall.
- `Window` = one `G` tile: glazed aluminium frame (`structure/window`, `window_broken`) over a sill painted on the
  floor canvas (`MapRenderer.windowSill`). `shatter(dirA, breaker, power)` breaks the pane (the tile stops blocking
  paths, the frame is left to vault) and throws the shards of systems/Glass.js as `Debris`: crumbs, mid shards
  that floor a guard, and a few big daggers that kill whoever they hit while still fast (`harm.all`, cause `slash`,
  the breaker spared); at rest a shard is harmless.
- The frame has its own HP (`damageFrame`: blasts, bat blows on a broken window, heavy rounds); at 0, or when a
  vehicle rams it or a blast goes off next to it, `Destruction.destroyWindow` removes the window and turns its
  tile into a breach with `TileMap.destroyTile`, exactly like a destroyed wall tile (sight, paths, lights).
- Openings go with what holds them (`Destruction.watchOpenings`): when a wall tile collapses, the windows built into
  it are torn out, the door hinged on it falls, a bolt shot into it is free; a glazed run follows window by window.

## Debug

- `?level=lab` loads the physics lab (tools/build_lab.py): a lit concourse with the range at its west end and a bay or
  room per system on either side, its number and name stencilled on the floor at its entrance (1 range, 2 executions,
  3 soot, 4 pool, 5 bars, 6 curtain, 7 takedowns, 8 jukebox, 9 trapdoor, 10 powder, 11 steam, 12 power, 13 liquids,
  14 doors, 15 vehicles in the street); a brighter night of its own (`level.light`, render/Lighting.js `ambientOf`); passive dummies but two
  `awake` guards for the sight tests.
- `?level=street` loads the street-life testbed (two-lane road open at both ends, passers-by, two guards).
- F1 sandbox panel, in any level (open from the start in passive test rooms): 1-6 pick a tool (guard, weapon,
  prop, vehicle, blast, water; same key or mouse wheel = next variant), B rotates, F / middle click drops it at the
  cursor (props and vehicles are refused when their footprint bites a wall); G god mode, T freeze guards, O time
  scale (x1 / x0.5 / x0.2), U refill ammo, V teleport to the cursor, K kill all guards. A new tool is one entry
  in `TOOLS` (debug/Sandbox.js). God mode and time scale survive a restart; guards frozen follows the level.
- Debug keys are read once per simulation step (`Game.debugKeys`): a key press lives until a step consumes it,
  so reading it per frame would toggle several times on high-refresh displays.
- F2 enemy vision (cones, close-awareness ring, state:tactic + meter, target, cover, last known position,
  incidents and search points), F3 whole-level overview, F4 physics overlay (bodies by state, velocities, contacts, stats).
- `window.game` in the console.
- `npm test` runs the Node unit tests.

## The lens (post-processing)

The game draws its scene on the 2D canvas `#game`. When WebGL is there, `render/PostGL.js` takes that canvas as a
texture every frame and puts it on screen (`#post`) through a few small shader passes: a blurred half-size copy (focus,
colour bleed), the glow of what is bright and shafts dragged out of the strongest lamps (quarter size), then the final
pass: zoom kick, tube curvature, torn tape, shock waves, heat shimmer, radial colour fringe, speed smear, soft edges,
grading per situation, impact frame, scan lines, vignette, grain. What must stay sharp (flash, HUD, screens, cursor)
is drawn on a third canvas above (`#hud`). `render/Lens.js` is the director: DOM-free, unit-tested, it listens to
`blow`, `shot` and `explosion`, is told the situation once a frame (`Game.lensView`) and returns plain numbers.
Every look setting is in `data/post.js`. Without WebGL, or with `?post=0`, nothing of this exists and the old 2D
grading (`render/PostFX.js`) and vignette are used, as before. The replay recorder captures the bare 2D scene.
