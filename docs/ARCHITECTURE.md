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
  audio/                  Audio.js (mixer, samples, synthesized SFX), Music.js (procedural synthwave)
  game/
    Game.js               loop (fixed 60 Hz steps, time scale, hitstop) and screens state machine
    Config.js             tuning: collision categories/masks, player/enemy tuning, PHYSICS, palette
    world/
      World.js            one playthrough: entity lists, services, fixed step order, system facades
      TileMap.js          pure grid logic (solid / blocked / wall HP / version), wall bodies (no DOM)
      Level.js            builds entities from level data
    systems/              rules, called by World or driven by events
      Ballistics.js       traceBullet, lineOfSight
      Explosions.js       blasts: kills, breakage, wall crushing, mass-based shockwave
      Destruction.js      wall tiles, doors off hinges, fences
      Scoring.js          listens to 'kill': score, combo
      Impacts.js          listens to 'impact': material sounds by speed and mass
    render/
      MapRenderer.js      floor / wall canvases and permanent decals (blood, holes, scorch, baked bodies)
      WorldRenderer.js    draw order, additive effects, floating texts, physics debug overlay (F4)
    entities/             Character, Player, Enemy, Prop, Vehicle, Door, Window, Debris, Ragdoll, Corpse,
                          WeaponItem, AmmoItem, Projectile
    fx/                   Particles, Gore
    ui/                   HUD, Screens, Text
    data/                 weapons, props, materials, levels/ (index.js = registry)
tests/                    node --test (no browser): engine, physics, map/pathfinding
```

Rules:
- `engine/` never imports from `game/` or `audio/`.
- Logic modules must not touch the DOM so they stay testable in Node (`TileMap`, physics, systems' math).
  Canvas work lives in `game/render/` (and, for now, each entity's own `draw()`).
- Cross-cutting reactions go through `world.events` rather than direct calls.

## Simulation step (World.step)

1. intentions: player input, enemy AI (they set velocities via `Character.steer`, limited by `pushFactor`)
2. physics: `PhysicsWorld.step` (2 Matter sub-steps + floor friction), push contacts, door hinges, wall body rebuild
3. reactions: items, ammo, projectiles (segment-traced), debris, corpses/ragdolls, props, emitters, particles, systems
4. cleanup of dead entities and expired effects
5. level flow (cleared / exit)

## Events

| event | payload | emitted by | used by |
|---|---|---|---|
| `impact` | `{ a, b, speed, x, y }` | PhysicsWorld (collision start) | Impacts (sound) |
| `kill` | `{ victim, cause, killer }` | World.onKill | Scoring |
| `explosion` | `{ x, y, radius, source }` | Explosions | (lighting, camera, AI: upcoming) |
| `wallDestroyed` | `{ cx, cy, x, y }` | Destruction | (lighting cache, AI: upcoming) |

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

## Debug

- `?level=lab` loads the physics lab (all props/weapons/ammo on three floors, a street with vehicles, passive dummies).
- F2 enemy vision, F3 whole-level overview, F4 physics overlay (bodies by state, velocities, contacts, stats).
- `window.game` in the console.
- `npm test` runs the Node unit tests.
