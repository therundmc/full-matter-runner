# Architecture

Browser game, plain ES modules, no build step. Matter.js 0.20 is loaded as a global by `index.html`.

## Layers

```
src/
  main.js                 boot: new Game(canvas)
  engine/                 generic, knows nothing about this game (never imports from game/)
    EventBus.js           synchronous pub/sub
    Input.js Camera.js Assets.js math.js
    physics/
      Units.js            scale contract: 1 m = 32 px = 1 tile, kg, px/step velocities
      Body.js             kg mass, sliding friction coefficient, momentum impulses, freeze/wake of heavy bodies
      Friction.js         Coulomb floor friction (top-down "ground"), heavy bodies settle back to static
      PhysicsWorld.js     Matter engine wrapper: sub-stepping, friction, collision dispatch, 'impact' events
      Raycast.js          grid DDA, segment vs polygon / circle / segment
    nav/Pathfinding.js    A* on the tile grid + string pulling
  audio/                  Audio.js (mixer, recorded shots + foley bank, a little synthesis), bank.js (generated index
                          of the foley cuts), Music.js (procedural synthwave)
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
      Takedown.js         `behind(player, guard)`: who can be seized from behind (rule only, unit-tested)
      Explosions.js       blasts: kills, breakage, wall crushing, mass-based shockwave, all scaled by occlusion()
      Destruction.js      wall tiles, windows torn out, doors off hinges, fences; `watchOpenings` makes doors and
                          windows go with the wall tile that holds them (listens to `wallDestroyed`)
      Glass.js            how a pane breaks (DOM-free, unit-tested): shards of three sizes, which ones cut / kill
      Fracture.js         prop destruction math (DOM-free): marks by weapon/energy/angle, debris cones, damage zones,
                          part recipes -> polygons, collapse launch
      Scoring.js          score of a run from events: kill styles x combo, end tally (bonuses, grade); pure, unit-tested
      Records.js          best result per level in localStorage (guarded: the game runs without storage)
      Threats.js          which off-screen guards the player can plausibly know about (pure rule + per-guard memory)
      Impacts.js          listens to 'impact': material sounds by speed and mass
      Liquids.js          what is wet on the floor: puddles of water or booze fed by sources and spills (burst hydrant,
                          broken toilet, smashed bottles), blood pools, wet floor grip, footprints and slide smears
                          (DOM-free, unit-tested)
      Ambient.js          street life (level.ambient): through-traffic + passers-by, pre-warmed, owns their spawn/despawn
      Traffic.js          pure traffic rules: lanes, spawn schedule / jams, car following, detours, Driver brain
    ai/                   enemy AI, DOM-free (unit tested)
      Director.js         squad brain: alert phases, noise routing, incidents, search sweeps, spot claims, budget
      Tactics.js          grid geometry: cover / ambush / flank spots, search points, random walkable point
      Perception.js       detection meter rate, view test, aim error, hearing error, patience with a loiterer
      Trail.js            the player's wet / bloody footprints in order, and how a guard picks them up and follows them
      Civilians.js        passers-by Walker brain (stroll, stop, panic, flee, cower) + escapeRoute (way off the map)
      Pastimes.js         what people do at their spot in a bar (pool, cards, a drink, dancing): timing only
    render/
      MapRenderer.js      floor / blood / flesh / wall canvases and permanent decals (blood, holes, scorch, spills,
                          baked bodies), flat roofs of the neighbouring buildings and their dressing
      BloodArt.js         what blood looks like: pixel stamps (spots, streaks, splats) built once, in three ages
                          (wet, tacky, dry), and the pool under a bleeding body
      DamageArt.js        canvas side of prop destruction: marks, tracks, bites, piece cutting, loose bits
      BlastArt.js         canvas side of a blast: the ragged burn it leaves and its torn shock front
      PastimeArt.js       canvas side of the pastimes: where busy hands go, the cue, cards or glass in them
      WorldRenderer.js    draw order, additive effects, floating texts, physics debug overlay (F4)
      LaserSight.js       laser sight of the weapons that have one (weapon `laser`: the sniper rifle), over the lighting
      Replay.js           end-of-level replay: ReplayRecorder (rolling buffer of small frames, a clip per kill) and
                          ReplayPlayer (plays the clips behind the results, slow motion on the kills)
    entities/             Character, Player, Enemy, Civilian, Prop, Vehicle, Door, Window, Debris, Ragdoll, Corpse,
                          WeaponItem, AmmoItem, Projectile
    fx/                   Particles, Gore, Bleeding (a dead body's spurts, pool and drag trails)
    debug/
      Sandbox.js          F1 sandbox: tools dropping guards / weapons / props / vehicles / blasts / water at the
                          cursor, cheats (god mode, frozen guards, time scale, ammo, teleport); DOM-free, unit tested
    ui/                   HUD, Indicators (off-screen guard markers), Screens, SandboxPanel, Text
    data/                 weapons, wounds (bleeding per weapon), props, materials, destruction (how each prop comes
                          apart), roofs (rooftop scenery), scoring (points, combo, bonuses, par time and grade
                          thresholds per level), levels/ (index.js = registry)
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
   (they set velocities via `Character.steer`, limited by `pushFactor`), Ambient (drivers set their car's
   velocity, passers-by steer, run-over checks, spawn / despawn)
2. physics: `PhysicsWorld.step` (2 Matter sub-steps + floor friction), push contacts, door hinges, wall body rebuild
3. reactions: items, ammo, projectiles (segment-traced), debris, corpses/ragdolls, props, emitters, particles, systems
4. cleanup of dead entities and expired effects
5. level flow (cleared / exit)

## Events

| event | payload | emitted by | used by |
|---|---|---|---|
| `impact` | `{ a, b, speed, x, y }` | PhysicsWorld (collision start) | Impacts (sound) |
| `kill` | `{ victim, cause, killer }` | World.onKill | Scoring, ReplayRecorder (clips), Threats |
| `knock` | `{ victim, cause, angle }` | Enemy.knock (a guard is floored; cause: throw, slide, debris, door, punch, blast) | Scoring |
| `shot` | `{ shooter, weapon }` | World.addProjectile (once per trigger pull, whatever the pellet count) | Scoring (accuracy) |
| `explosion` | `{ x, y, radius, source }` | Explosions | Scoring (a rocket kill is a hit) |
| `slide` | `{ ch, x, y, angle }` | Player.startSlide | (the slide also calls `World.noise`) |
| `dodge` | `{ ch, x, y }` | Player.dodge (a round passed over the sliding player) | - |
| `wallDestroyed` | `{ cx, cy, x, y, dirA, power }` | Destruction | Director (incident), Destruction.watchOpenings (windows / doors held by that tile) |
| `windowDestroyed` | `{ x, y, cx, cy, dirA, power }` | Destruction.destroyWindow (glass, frame and sill gone: the tile is a breach) | Destruction.watchOpenings (next window of a glazed run) |
| `propDestroyed` | `{ prop, x, y, dirA, power }` | Prop.collapse | Liquids (a `fountain` prop floods the floor) |
| `spill` | `{ x, y, kind, area, dur?, cap? }` | Prop (a pierced keg or pipe leaking, a broken pipe flooding, a bottle smashing) | Liquids (px² of a `LIQUIDS.kinds` liquid, at once or over `dur` seconds) |
| `noise` | `{ x, y, radius, source, type }` | `World.noise` (guns, doors, glass, walls, blasts, thrown guns, vehicles) | Director (hearing), Threats (a guard who makes noise can be placed) |
| `windowBroken` | `{ x, y }` | Window.shatter | Director (incident) |
| `doorBroken` | `{ x, y }` | Door.unlock (lock burst), Destruction.detachDoor | Director (incident) |
| `alertPhase` | `{ phase, prev }` | Director | Game (soundtrack intensity and combat variant), Scoring (every ALERT eats into the stealth bonus); the HUD reads the phase directly |
| `trafficSpawn` | `{ vehicle }` | Ambient (a car enters a lane) | |
| `trafficStopped` | `{ vehicle, reason }` | Ambient (a driven car is now a parked car / wreck; reason: tyre, driver, fire, exploded, jam, scared) | |
| `runOver` | `{ victim, vehicle, speed }` | Ambient (a car killed someone, after the `kill`) | |
| `civilianPanic` | `{ civilian, x, y, kind }` | Ambient (a passer-by starts to panic; kind: gunshot, explosion, kill, corpse, armed, scream, hit) | |

Noise types: `gunshot` (any shooter; a guard's shot is heard as `allyFire` by his mates), `door`, `glass`,
`wall`, `explosion`, `thrown` (a gun thrown by the player lands), untyped = `noise`. Footsteps / bodies falling
are emitted by the Director itself. Silent weapons (`noise: 0`) are never heard.

## Physics model

- Scale: 1 m = 32 px. A person is ~0.5 m wide (17 px), a door 1 m.
- Every dynamic body has a mass in kg (`setMaterial(body, kg, mu)`) and a `material` (data/materials.js).
- Floors have a grip (`FLOOR_GRIP`): carpet and grass brake more, tiles and the dance floor slide.
- Sliding uses constant deceleration mu·g (Coulomb), so things stop instead of drifting; airborne bodies
  (`flyUntil`) skip it for a moment after being thrown or blasted.
- Characters can push with `PHYSICS.pushForce` (N). Anything whose breakaway force (mu·grip·kg·g) is higher
  is "frozen" (static) at rest and only wakes up from big impulses (explosions). Lighter objects slow the
  character down in proportion to their weight.
- Impulses are momentum (kg·px/step): `impulse(body, angle, J)` gives light bodies a big kick and heavy ones a nudge.

## Gameplay systems notes

- Ammo is per caliber (`AMMO` in data/weapons.js: 9mm, 12g, 762, rocket). The player has a pool per caliber;
  a reload fills a fresh magazine from the pool and drops the old one with what was left in it (pickable).
- Sound (audio/Audio.js): a gunshot is a recorded shot (`SHOTS`) over synthesized bass / room layers (`GUNS`), choked
  per shooter (`choke`). Every other physical sound is one or several cuts of the recorded foley bank
  (`assets/sound/foley.wav`, indexed by audio/bank.js), layered per sound name in `FOLEY`; a `_<name>` method adds the
  synthesized part where no recording fits (blasts, fire, tyres, alarm, traffic). Reload / handling sounds take
  `{ weapon }` to pick that gun's parts (`ARMS`), voices take `{ pitch }` (one per character, `Character.voice`).
  Space: every positional voice is panned and loses level and highs with distance while more of it is sent to a
  long hall reverb (also behind every gunshot and the kill chime); `World.sound` flags what the player hears
  through a wall or a closed door (`occ`): quieter and dull.
  The bank is built by `node tools/build_sounds.mjs <packs-dir>` from the CC0 packs listed in `tools/sounds.json`
  (never hand-edit bank.js). Mix: SFX and music each have their own compressor, so gunfire never pumps the music
  (only the held duck moves it); `GUN_LEVEL` sets gunfire against everything else, `META[name].gain` each sound.
- Music (audio/Music.js): one procedural song, planned bar by bar from data (progressions, patterns, sections, forms)
  and scheduled 0.3 s ahead. The alert phase drives it from Game: `AI.music[phase]` is the intensity (0 = menu loop,
  then thicker layers and brighter filters), and the phases in `AI.combatMusic` switch it to its combat variant
  (`FORMS.combat`: same key, tempo and motif; galloping kick, 16th octave bass, chopped pad, the motif re-struck).
  A riser and a snare roll announce the fight at once, the variant takes over on the next bar line, plays at least
  `MIN_FIGHT_BARS`, and hands back through a closing bar (fill) to the song's break.
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
  Only small objects are movable; everything else is `static` (bolted).
- Bleeding is calibrated per weapon (data/wounds.js): a weapon names its `wound` profile (blow-back, spray along the
  blow, exit plume, mist, stain, final pool size and spreading rate, arterial spurts, how far the body is thrown).
  `Character.kill(angle, cause, killer, by)` hands what killed (`by`: a weapon definition or `{ gore, wound }`) to
  `gore()`; the cause is the fallback (`CAUSE_WOUND`). A knife casts a thin arc and leaves a pumping artery and a
  lake, 7.62 a long tight jet behind the body, buckshot a wide wet cone (only up close), a bat heavy slow drops.
- Blood on the floor (render/BloodArt.js, MapRenderer): a drop lands as a stamp picked by how it hit (flat = tapered
  streak along its travel with satellites, steep = ragged spot, heavy = splat); stamps are per-pixel thickness maps
  (film to core) coloured through one ramp per age, never circles or gradients. They are baked into `bloodCanvas`,
  drawn over the floor decals and under `fleshCanvas` (baked bodies and meat), so blood covers rubble and the dead
  stay readable on it. `decals.update(dt)` dries stains by re-blitting their tacky then dry variant (a few per step,
  queue capped). The pool under a body (`poolArt(owner)`, fx/Bleeding.js) is repainted only when it grows or ages,
  stays where it formed if the body is shoved, and is baked with the body (`decals.bakePool`).
- Traversal (Character): `tryVault(angle, moving)`. Broken window = hands planted on the sill (arm reach clamped);
  furniture / car hood = action-movie slide on the hip, gun kept on target, sparks on metal.
  Space = context action: execute > takedown > vault > slide. (A cover system existed and was removed at the user's
  request.)
- Takedown (`TAKEDOWN`, systems/Takedown.js, Player.updateTakedown): Space right behind a standing guard who has
  his back to us. He is `held` (helpless, mute) for the half second it takes, then killed with cause `snap` (a dry
  body: no blood, no cry, a body fall heard from much closer) or, knife in hand, `slash`. Scored as `takedown`.
- Slide (Player, `PLAYER.slide`): Space while running with nothing to vault. ~0.5 s burst from ~2x run speed decaying to
  a jog (~2.9 m), stays physical (walls stop it, loose props take our momentum), sweeps standing enemies off their
  feet, can chain into a vault, the gun stays usable; 0.5 s cooldown. At its heart (`duck`) the body is under the
  line of fire: rounds carry on over it (`Player.ducking`, Projectile) and the first one earns a breath of bullet
  time (`dodge` event). Each slide costs stamina (`cost`, back with `regen`; small HUD bar while it recovers).
- Animation (entities/CharacterAnim.js): each frame a pose (torso offset/angle/scale, feet, hands, weapon, as offsets
  from the body) is built from the walk cycle and combat gestures, then vault / slide poses are blended over it so
  every move starts and ends on the walk pose. Vaults follow a Hermite curve that keeps the run-up and exit speeds.
- Fire (fx/Particles.js `fire` / `drawFire`, systems/Explosions.js `fireball`): a flame is a square chunk on whole
  pixels in the flat colour of its heat (white, yellow, orange, red, soot), drawn opaque after the lighting with the
  hottest on top; never a soft additive disc. The slow chunks of a burst stay in its heart and stay hot, the fast
  ones cool at the rim. A blast = a few lobes of such flames, a torn shock front (`rings` entry with `blast`),
  square billows of black smoke (`smoke` with `puff`), burning scraps thrown in arcs (`cinders`) that go on burning
  where they fall, and a ragged burn (`decals.scorch`, BlastArt).
- Liquids (systems/Liquids.js, `LIQUIDS` in Config.js): a source pours px² of liquid per second into a puddle that
  spreads up to its cap, stands, then dries (`world.liquids.source` / `feed`; a destroyed `def.fountain` prop is a
  source). Anything else that pours emits `spill`: a prop's `leak` in data/destruction.js names a `kind` (water for
  sinks and toilets, which also `flood` when they fall apart; booze for the bar), and bottles (`BITS.bottle.smash`)
  thrown out of a counter or a crate shatter where they land (`Debris` / shard `onLand`) into a small booze puddle.
  Each kind has its own look (`kinds[k].puddle`: body, sheen, glint, rings, foam), prints and splash; a puddle
  creeps toward what feeds it, drinks up a smaller one of the same kind it has spread over, and when there are
  `maxPuddles` the smallest soaks away. The blood under a body is owned and drawn by the corpse; Liquids only tracks where it is wet
  (`corpse.pool`, `corpse.poolAt()`), including for a while after the body is baked into the floor. Anyone in
  `world.chars` who steps in a wet area splashes, then prints fading footprints on the dry floor (`decals.footprint`),
  or one long smear when sliding (`decals.smear`). A wet floor grips less (`World.floorGrip`). Puddles are drawn
  by WorldRenderer.drawPuddle and mirror the lights in Lighting.post (`LIGHTING.puddle`).
- Score (systems/Scoring.js, rules in data/scoring.js): fed by events only. A kill is worth its style (a gunshot
  the least; blade, melee, wreckage, glass, execution, takedown more; `UNSEEN` on top when the guard never noticed) times
  the combo multiplier (+0.5 per kill of the chain, capped at x4; the chain breaks 4 s after the last kill, flooring
  a guard gives it some air back). `tally(level)` adds the end bonuses (best chain, variety of methods, time under
  the level's par, stealth lost by ALERT phases, accuracy, mercy for a guard left alive on his knees) and penalties (passers-by), then the grade from the
  level's thresholds (`LEVEL_SCORING`, or a per-guard scale for test rooms). Game.onExit keeps the best result per
  level (systems/Records.js); a run where the sandbox was opened is not ranked. The HUD shows the score, the run
  clock, the multiplier and its fuse; Screens.drawResults counts the lines up one after the other.
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

Guards mind their own business until the player gives himself away (`Director.isThreat`): empty-handed and
outside the level's `premises` (tile rectangles, `lv.guard()` in tools/levelkit.py) he is a passer-by; a weapon in
hand, trespassing, a shot heard, a guard floored or killed make him a target for good. No `premises` = hostile
ground everywhere (lab, street testbed). Level 1's bar room and toilets are public: only the VIP room, the back
room, the storeroom, behind the counter and the yards are premises. A passer-by must not hang about either, except
in the level's `welcome` rectangles (`lv.host()`, `Director.isGuest`: a customer in the bar room) (`Enemy.mind`, `AI.loiter`,
`Perception.loiterRate`): a guard who has him in front of him within a few metres stops, stares him down and tells
him to clear off, warns him a last time ('!'), then snaps: the whole squad is provoked. His patience (shown on the
detection gauge) runs out faster the closer the stranger stands and comes back slowly once he has gone.
An unarmed stranger who steps into premises under a guard's nose (`Director.isIntruder`, within `AI.loiter.near`)
makes him suspicious at once: he goes after him, finds him, and the fight is on (the VIP room's bouncer).

- **Guard** (`entities/Enemy.js`), states by awareness: unaware `idle` (post: watch, scan, look behind, smoke,
  pager) / `patrol` / `return`; suspicious `suspicious` (freeze + turn toward the stimulus: the tell) /
  `investigate` / `check` (body, knocked-out mate, wreckage, empty post) / `search` / `guard` / `dizzy`;
  alert `combat` / `hunt` / `fetch` (pick a weapon up) / `flee` (unarmed: run to an armed mate).
- **Detection meter** 0..1 (`ai/Perception.js`): fills while the player is in view, faster close / in the centre
  of the cone / running / lit (`world.lighting.levelAt`) / in a vigilant phase, slower when distracted;
  `?` from `ENEMY.suspicious`, `!` at 1. Noises set the meter to a level (`ENEMY.hear`), never straight to `!`.
- **Fairness**: human reaction delay before the first shot (`ENEMY.reaction`, `reacquire`), turn-rate limited aim,
  aim error that shrinks with steady sight (`aimErrorMax`, `aimSettle`), no shot from off screen, no psychic
  knowledge (last known positions only, noise localisation error).
- **Combat tactics** (re-planned every 0.3-0.5 s): `hold`, `advance`, `backoff`, `cover` (duck / peek / volley),
  `flank` (one or two guards, Director decides), `suppress` (short burst where he vanished), `reload` (to cover,
  "RELOADING!"), `hunt`, `panic`; shotguns `ambush` (crouch behind a corner on his way); melee `rush` (weaving,
  dodging a pointed gun) and `stalk` (cover to cover while a gun is on them). Dry guns are thrown at the player.
- **Director** (`ai/Director.js`): phases `normal -> caution -> alert -> evasion -> caution -> normal`
  (durations in `AI`), contact shout (up to `AI.maxHunters` converge, the others hold and watch), call-ins on
  incidents, evasion sweep over search points around the last known position, claims on tactical spots,
  a per-step `budget()` for path-finding (1) and cover / flank searches (3) so the cost is spread over frames.
- Barks are short world texts (`world.texts`), one at a time for the squad, never a line it has just used
  (`Director.bark`, `freshLine`); the lines, which ones are yelled and their colour are data (data/barks.js). In a
  fight a guard curses the player every few seconds (`AI.tauntGap`: at the man in his sights, at the corner he
  vanished behind, at the killer of a mate).
- Surrender: when a kill leaves one guard of a real squad (`AI.surrender`), he may be `shaken`; the next time he
  faces the armed player he throws his weapon down, kneels with his hands up and begs (`Enemy.surrender`, state
  `yield`). He is out of the fight for good: `world.enemiesLeft` and `Director.alive` count him out, the
  'surrender' event clears the level, sparing him pays the `mercy` end bonus, killing him scores as any kill.
- Footprints: Liquids emits 'footprint' for every print; the Director keeps the player's in `director.trail`
  (ai/Trail.js, `AI.trail`: they dry after `fresh` s). A guard who sees one (`Enemy.scanWorld`) follows the run of
  prints hop by hop (state `track`, one tracker at a time), then goes and looks where they were heading. Bloody
  prints alarm any guard and put the squad on CAUTION; wet ones only mean something to a guard already looking.
- `?` / `!` and the meter are drawn
  after the lighting (`Enemy.drawMarks`). HUD: small CAUTION / ALERT / EVASION label with the time left.
- Level fields (optional): `patrols: { 'col,row': [[col, row], ...] }` = explicit route for the guard spawned
  at col,row (he loops through it, pausing at each point); without it uppercase guards wander around their
  spawn. `passive: true` = dummies with no perception (lab). `jobs: { 'col,row': 'pool' | 'cards' }` = the pastime
  of the guard posted there (ai/Pastimes.js): he is at it while all is calm, less watchful (`Enemy.distracted`),
  and drops it as soon as the squad is on edge.

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
  too), the others floor it; no new traffic until the street has calmed down. Above `AMBIENT.lethal` a car kills whoever it hits and
  throws the ragdoll (`cause: 'vehicle'`); it drives over bodies. Driven cars skip the static shadow caches (unshadowed
  lights redrawn every frame, brake lights flare). One procedural pass-by sound per car (`passby` in Audio.js).
- **Passers-by**: `Civilian` (Character subclass, team `civilian`, sprites civ1-4) with a `Walker` brain. They are in
  `world.chars` (bullets, blasts, melee, cars hit them) and `world.civilians` (drawing), never in `enemies`: no target,
  no HUD count, guards ignore them. Gunshots / explosions (noise), a kill or a body in view, the armed player close by
  or a screaming neighbour make them panic (hands up or duck), then sprint off the map along `escapeRoute` (Dijkstra
  that avoids the danger), screaming (world texts and the `scream` / `whimper` voices, one pitch per passer-by).
  No new passers-by for `AMBIENT.panic.calm` s after gunfire.

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

`Door` = 25 kg leaf on a kinematic hinge (hinge friction, cushioned end stops, creaks, slams knock enemies out).
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

- `?level=lab` loads the physics lab (all props/weapons/ammo on three floors, a street with vehicles, passive dummies).
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
