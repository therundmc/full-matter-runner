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
    systems/              rules, called by World or driven by events
      Ballistics.js       traceBullet, lineOfSight, canSeeCharacter, occlusion (blast transmission)
      Cover.js            findVault (broken windows, def.vault furniture / car hoods) + free landing spot
      Slide.js            slide kinematics (speed curve, stall, cooldown), pure and unit-tested
      Explosions.js       blasts: kills, breakage, wall crushing, mass-based shockwave, all scaled by occlusion()
      Destruction.js      wall tiles, doors off hinges, fences
      Fracture.js         prop destruction math (DOM-free): marks by weapon/energy/angle, debris cones, damage zones,
                          part recipes -> polygons, collapse launch
      Scoring.js          listens to 'kill': score, combo (killing a passer-by costs points)
      Impacts.js          listens to 'impact': material sounds by speed and mass
      Liquids.js          what is wet on the floor: puddles fed by sources (burst hydrant), blood pools, wet floor
                          grip, footprints and slide smears (DOM-free, unit-tested)
      Ambient.js          street life (level.ambient): through-traffic + passers-by, pre-warmed, owns their spawn/despawn
      Traffic.js          pure traffic rules: lanes, spawn schedule / jams, car following, detours, Driver brain
    ai/                   enemy AI, DOM-free (unit tested)
      Director.js         squad brain: alert phases, noise routing, incidents, search sweeps, spot claims, budget
      Tactics.js          grid geometry: cover / ambush / flank spots, search points, random walkable point
      Perception.js       detection meter rate, view test, aim error, hearing error
      Civilians.js        passers-by Walker brain (stroll, stop, panic, flee, cower) + escapeRoute (way off the map)
    render/
      MapRenderer.js      floor / wall canvases and permanent decals (blood, holes, scorch, spills, baked bodies),
                          flat roofs of the neighbouring buildings and their dressing
      DamageArt.js        canvas side of prop destruction: marks, tracks, bites, piece cutting, loose bits
      WorldRenderer.js    draw order, additive effects, floating texts, physics debug overlay (F4)
    entities/             Character, Player, Enemy, Civilian, Prop, Vehicle, Door, Window, Debris, Ragdoll, Corpse,
                          WeaponItem, AmmoItem, Projectile
    fx/                   Particles, Gore
    debug/
      Sandbox.js          F1 sandbox: tools dropping guards / weapons / props / vehicles / blasts / water at the
                          cursor, cheats (god mode, frozen guards, time scale, ammo, teleport); DOM-free, unit tested
    ui/                   HUD, Screens, SandboxPanel, Text
    data/                 weapons, wounds (bleeding per weapon), props, materials, destruction (how each prop comes
                          apart), roofs (rooftop scenery), levels/ (index.js = registry)
tests/                    node --test (no browser): engine, physics, map/pathfinding, systems, ai, ambient, sandbox, roofs
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
| `kill` | `{ victim, cause, killer }` | World.onKill | Scoring |
| `explosion` | `{ x, y, radius, source }` | Explosions | (lighting, camera) |
| `slide` | `{ ch, x, y, angle }` | Player.startSlide | (the slide also calls `World.noise`) |
| `wallDestroyed` | `{ cx, cy, x, y }` | Destruction | Director (incident) |
| `propDestroyed` | `{ prop, x, y, dirA, power }` | Prop.collapse | Liquids (a `fountain` prop floods the floor) |
| `noise` | `{ x, y, radius, source, type }` | `World.noise` (guns, doors, glass, walls, blasts, thrown guns, vehicles) | Director (hearing) |
| `windowBroken` | `{ x, y }` | Window.shatter | Director (incident) |
| `doorBroken` | `{ x, y }` | Door.unlock (lock burst), Destruction.detachDoor | Director (incident) |
| `alertPhase` | `{ phase, prev }` | Director | (HUD reads the phase directly; music / lighting could follow) |
| `trafficSpawn` | `{ vehicle }` | Ambient (a car enters a lane) | |
| `trafficStopped` | `{ vehicle, reason }` | Ambient (a driven car is now a parked car / wreck; reason: tyre, driver, fire, exploded, jam) | |
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
  The bank is built by `node tools/build_sounds.mjs <packs-dir>` from the CC0 packs listed in `tools/sounds.json`
  (never hand-edit bank.js). Mix: SFX and music each have their own compressor, so gunfire never pumps the music
  (only the held duck moves it); `GUN_LEVEL` sets gunfire against everything else, `META[name].gain` each sound.
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
  - Melee blows carry their kind from `Character.meleeStrike`: 'cut' (blade, with its swing direction), 'punch', 'blunt'.
  Only small objects are movable; everything else is `static` (bolted).
- Bleeding is calibrated per weapon (data/wounds.js): a weapon names its `wound` profile (blow-back, spray along the
  blow, exit plume, mist, stain, final pool size and spreading rate, arterial spurts, how far the body is thrown).
  `Character.kill(angle, cause, killer, by)` hands what killed (`by`: a weapon definition or `{ gore, wound }`) to
  `gore()`; the cause is the fallback (`CAUSE_WOUND`). A knife casts a thin arc and leaves a pumping artery and a
  lake, 7.62 a long tight jet behind the body, buckshot a wide wet cone (only up close), a bat heavy slow drops.
- Traversal (Character): `tryVault(angle, moving)`. Broken window = hands planted on the sill (arm reach clamped);
  furniture / car hood = action-movie slide on the hip, gun kept on target, sparks on metal.
  Space = context action: execute > vault > slide. (A cover system existed and was removed at the user's request.)
- Slide (Player, `PLAYER.slide`): Space while running with nothing to vault. ~0.5 s burst from ~2x run speed decaying to
  a jog (~2.9 m), stays physical (walls stop it, loose props take our momentum), sweeps standing enemies off their
  feet, can chain into a vault, the gun stays usable; 0.5 s cooldown.
- Animation (entities/CharacterAnim.js): each frame a pose (torso offset/angle/scale, feet, hands, weapon, as offsets
  from the body) is built from the walk cycle and combat gestures, then vault / slide poses are blended over it so
  every move starts and ends on the walk pose. Vaults follow a Hermite curve that keeps the run-up and exit speeds.
- Liquids (systems/Liquids.js, `LIQUIDS` in Config.js): a source pours px² of liquid per second into a puddle that
  spreads up to its cap, stands, then dries (`world.liquids.source` / `feed`; a destroyed `def.fountain` prop is a
  source). The blood under a body is owned and drawn by the corpse; Liquids only tracks where it is wet
  (`corpse.pool`, `corpse.poolAt()`), including for a while after the body is baked into the floor. Anyone in
  `world.chars` who steps in a wet area splashes, then prints fading footprints on the dry floor (`decals.footprint`),
  or one long smear when sliding (`decals.smear`). A wet floor grips less (`World.floorGrip`). Puddles are drawn
  by WorldRenderer.drawPuddle and mirror the lights in Lighting.post (`LIGHTING.puddle`).

## Performance & robustness

- Physical debris live at most `MAX_AGE` (7 s) or until they settle, then get baked into the floor canvas;
  at most `MAX_DEBRIS` (180) at once; pieces under 6 px don't collide with each other.
- Purely visual pieces use `particles.shard(img, ...)`: they arc with a fake height above their shadow, bounce,
  skid, then are baked into the floor (remains stay). Debris also has a fake height (`z`, `vz`).
  Bolted furniture keeps at most a few physical parts per collapse (`DESTRUCTION` caps in Config.js).
- Damage canvases are CPU-backed (`willReadFrequently`): pieces are cut from them and tested for opacity every hit.
- Sprite caches (silhouettes, slices) are WeakMaps so per-instance canvases can be garbage-collected.
- `Game.safeDraw` isolates the world draw: an exception is logged once and the context is restored, so the HUD,
  cursor and post effects keep rendering.

## Enemy AI

Guards mind their own business until the player gives himself away (`Director.isThreat`): empty-handed and
outside the level's `premises` (tile rectangles, `lv.guard()` in tools/levelkit.py) he is a passer-by; a weapon in
hand, trespassing, a shot heard, a guard floored or killed make him a target for good. No `premises` = hostile
ground everywhere (lab, street testbed).

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
- Barks are short world texts (`world.texts`), one at a time for the squad. `?` / `!` and the meter are drawn
  after the lighting (`Enemy.drawMarks`). HUD: small CAUTION / ALERT / EVASION label with the time left.
- Level fields (optional): `patrols: { 'col,row': [[col, row], ...] }` = explicit route for the guard spawned
  at col,row (he loops through it, pausing at each point); without it uppercase guards wander around their
  spawn. `passive: true` = dummies with no perception (lab).

## Street life (systems/Ambient.js)

Optional level field, levels without it are untouched:
```js
ambient: {
  seed: 1986,                                                    // optional (default: hash of the level name)
  traffic: [{ row: 11, dir: -1, speed: 9, gap: [3, 7], models: ['car', 'car2', 'van'] }], // row tiles, speed tiles/s
  walkers: [{ path: [[-1.5, 7], [45.5, 7]], gap: [6, 13], max: 3 }], // tiles, off-map to off-map (or to a door)
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
  parked car / wreck (tiles marked blocked, driver bails out). Above `AMBIENT.lethal` a car kills whoever it hits and
  throws the ragdoll (`cause: 'vehicle'`); it drives over bodies. Driven cars skip the static shadow caches (unshadowed
  lights redrawn every frame, brake lights flare). One procedural pass-by sound per car (`passby` in Audio.js).
- **Passers-by**: `Civilian` (Character subclass, team `civilian`, sprites civ1-4) with a `Walker` brain. They are in
  `world.chars` (bullets, blasts, melee, cars hit them) and `world.civilians` (drawing), never in `enemies`: no target,
  no HUD count, guards ignore them. Gunshots / explosions (noise), a kill or a body in view, the armed player close by
  or a screaming neighbour make them panic (hands up or duck), then sprint off the map along `escapeRoute` (Dijkstra
  that avoids the danger), screaming (world texts). No new passers-by for `AMBIENT.panic.calm` s after gunfire.

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

## Doors

`Door` = 25 kg leaf on a kinematic hinge (hinge friction, cushioned end stops, creaks, slams knock enemies out).
Level tile `L` = locked door: static, blocks path-finding; shooting the lock (latch end) or kicking / hitting it
breaks the latch and bursts it open. Bullets punch holes in a per-door canvas, damage warps the leaf, 7.62 rounds
go through, at 0 HP it is ripped off (Destruction.detachDoor).

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
