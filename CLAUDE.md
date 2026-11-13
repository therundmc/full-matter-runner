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
  (kitchen/bathroom/asphalt tiles were calmed down in tools/generate_assets.py; keep it that way.)
- Scale: rooms were too big vs characters/furniture/vehicles (cars too small on the road) -> tighten spaces,
  vehicles at real size (see engine/physics/Units.js: 1 m = 32 px; a car is ~4.4 x 1.8 m).
- Clean, documented, decoupled, scalable code (levels, weapons, enemies, mechanics), testable (logic/render/physics/data split).
- Keyboard is AZERTY (we use `e.code`, so KeyW/A/S/D = ZQSD).

## Delivery by blocks (validate each with the user before moving on)
1. Engine perf & stability — done. The "3 explosions" bug was the lab (no exit) clearing -> exit HUD crash; fixed and
   HUD/overlays are isolated with safeDraw. Debris lifetimes/caps, weak caches. Gentler impulses on loose pieces.
2. Doors (locked 'L', kicks, holes, warping) + vaulting (window: hands on the sill; furniture/hood: slide) — done.
3. Broken-window frame indicator + blast occlusion — done. Cover system REMOVED (user: useless for now).
   Furniture: only small objects move (chairs, plants, bins, crates, TV, speakers); the rest is bolted, with 2x HP,
   weapon-dependent bites and damage states (cracked / split / giving way).
Blocks 4-7 are implemented but NOT yet validated by the user (built while he was away): expect feedback on each.
4. Combat, bleeding calibrated per weapon (data/wounds.js), gun sounds = recorded shots (assets/sound/shots)
   over synthesized bass / room layers (user rejected fully synthesized guns as muffled: loud, crisp, "guerrilla"),
   lighting (render/Lighting.js: every visible light is a prop, level `lights` = indirect fill only),
   prop destruction pushed far (Fracture / DamageArt), real-time liquids (puddles, footprints, hydrant),
   animations + slide on Space. Still weak: combat visual feedback, horn sound.
   Every non-gun sound = cuts of a recorded CC0 foley bank (assets/sound/foley.wav + src/audio/bank.js, built by
   `node tools/build_sounds.mjs <packs-dir>` from tools/sounds.json); user rejected synthesized SFX as clicky,
   "Mario"-like: never add oscillator tones (one exception he asked for: the kill confirm is a synthwave stab in
   the music's key that climbs with the combo). Guards shout, the dying cry out. Music is liked as is.
5. Synthwave music: darker, follows the AI alert phase.
6. Level 1 (alley, road, bar, back room, back lot; 13 guards) & MGS-style enemy AI (ai/Director.js), street life
   (traffic, passers-by), dressed rooftops. User: a small level is fine, every detail polished, real scale, ambiance
   first. No MIRAGE marquee (rejected twice: ugly, useless). Guards ignore an unarmed player outside the level's
   `premises` until he gives himself away (Director.isThreat): realistic, organic, immersive.
7. Sandbox (F1 panel in any level) + `?level=lab` physics lab, `?level=street` street-life testbed.

## Old agent branches
- The `worktree-agent-*` branches (lighting, AI and others) are already ported into `feature/hotline-rework`:
  nothing left to merge from them. Do not delete them without asking.

## Run / test
- `python -m http.server 8000` then http://localhost:8000 (`?level=lab` for the physics lab).
- `npm test` (= `node --test tests/*.test.mjs`): Node unit tests, Matter loaded as a global by tests/setup.mjs.
- Debug keys: F1 sandbox panel (game/debug/Sandbox.js: spawn tools + cheats, keys listed on screen), F2 enemy
  vision, F3 overview, F4 physics overlay. `window.game` in the console.
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
- Ammo per caliber: `weapon = { type, mag, reserve }`, player pools `player.ammo[caliber]`; reloading drops the
  current mag with its remaining rounds (pickable again). Enemies: `weapon.reserve` = spare mags.
- Vehicles (`Vehicle`) follow a sprite-space layout contract (VEHICLES in Vehicle.js); dead bodies are `Ragdoll`s.
- Sprites come from `python tools/generate_assets.py` (deterministic, size asserts). Optional sprites via `spriteOpt()`.
- level1.js and lab.js are generated: edit `tools/build_level1.py` / `tools/build_lab.py` (tools/levelkit.py checks
  spawns, furniture overlaps and rooftop pieces) and run them; never hand-edit the output.
- Keep code clean: no stray exports / unused imports, short useful comments.
