# Project instructions — FULL MATTER RUNNER

## Git
- Commit messages: one single sentence, no body/bullet list (attribution trailer allowed).
- Work on branch `feature/hotline-rework`. `main` holds the old prototype. Do not push unless asked.
- Never `git add -A` blindly: `.claude/worktrees/` holds agent worktrees (ignored in .gitignore).

## Vision (user's brief, in French; reply in French)
- Top-down, nervous, organic, demanding action game, Hotline-Miami-like genre (never copy its characters/art/music),
  realistic, grimy, visceral 80s aesthetic with neon. One hit kills (player and enemies). Instant restart.
- Everything physical and destructible, with progressive damage states depending on angle, power and type of hit.
- Readability first: enemies, obstacles and weapons on the floor must be instantly identifiable.
- NO checkerboard or aggressive repetitive textures; smooth/organic/discreet surfaces. Simplified road.
- Scale: rooms were too big vs characters/furniture/vehicles (cars too small on the road) -> tighten spaces,
  vehicles at real size (see engine/physics/Units.js: 1 m = 32 px; a car is ~4.4 x 1.8 m).
- Clean, documented, decoupled, scalable code (levels, weapons, enemies, mechanics), testable (logic/render/physics/data split).
- Keyboard is AZERTY (we use `e.code`, so KeyW/A/S/D = ZQSD).

## Delivery by blocks (validate each with the user before moving on)
1. Engine, physics & smooth collisions — DONE (awaiting user validation): see docs/ARCHITECTURE.md.
2. Destruction & object states: generalise progressive damage states to every object/cover (angle, power,
   bullet vs melee), plus real-time liquids (blood/water that spreads, pools, footprints, hydrant water).
3. Combat feedback & sound design / mix: blood calibrated per weapon (little for fists/bat, realistic for blades
   and guns), heavy/dry/organic impact sounds, punchy arcade mastering. Integrate the lighting work.
4. Synthwave music: darker, richer, more varied chord progressions, heavy pulsing loops (gated reverb, staccato bass)
   following combat intensity.
5. Level 1 (demo): street, alley, bar entrance, main room, back room; restricted arsenal; enemy AI (integrate the AI work).
6. Sandbox / debug mode: spawn enemies, all weapons and assets, live physics/destruction/FX/sound experiments
   (the `?level=lab` physics lab is its seed).

## Pending work stored in branches (not merged)
- `worktree-agent-a4bd44bea01e0fe54`: WIP neon lighting (src/fx/Lighting.js, PostFX.js: shadows, bloom, wet reflections,
  grading). Written against the OLD layout (src/core, src/world...): port it into the new architecture in Bloc 3.
- `worktree-agent-a8864992389c7ee0d`: WIP MGS-style AI (src/ai/Director.js, Tactics.js, Enemy.js rewrite). Old layout too:
  port it in Bloc 5.

## Run / test
- `python -m http.server 8000` then http://localhost:8000 (`?level=lab` for the physics lab).
- `npm test` (= `node --test tests/*.test.mjs`): Node unit tests, Matter loaded as a global by tests/setup.mjs.
- Debug keys: F2 enemy vision, F3 overview, F4 physics overlay. `window.game` in the console.
- Headless browser checks that worked: Edge `--headless=new --remote-debugging-port` driven over the DevTools
  protocol from a small Node script (eval scenarios, inputs, screenshots). Python's http.server can reset
  connections on big files; a tiny Node static server is more reliable. Never kill processes you didn't start.

## Architecture & conventions
- Read docs/ARCHITECTURE.md first (layers, step order, events, physics model).
- `engine/` never imports `game/`. Logic modules stay DOM-free (canvas work in game/render or entity draw()).
- New gameplay reactions: emit/listen on `world.events` instead of wiring direct calls.
- Physics: give every dynamic body kg + mu (`setMaterial`) and a `material`; read velocities with
  `Body.getVelocity/getSpeed/getAngularVelocity` (normalized to 60 Hz); use `impulse()` (momentum) for hits/blasts;
  heavy objects use `world.physics.freezeIfHeavy(body)`.
- Weapons use real magazines: `weapon = { type, mag, reserve }`; the player carries `mags[ammoType]` (rounds per mag)
  and `loose[shells|rocket]`; reloading drops the current mag with its remaining rounds (it can be picked up again).
- Vehicles (`Vehicle`) follow a sprite-space layout contract (VEHICLES in Vehicle.js); dead bodies are `Ragdoll`s.
- Sprites come from `python tools/generate_assets.py` (deterministic, size asserts). Optional sprites via `spriteOpt()`.
- Keep code clean: no stray exports / unused imports, short useful comments.
