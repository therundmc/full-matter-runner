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
   "Mario"-like: never add oscillator tones (one exception he asked for: the kill confirm is a synthesized chime,
   the "gling" he picked, in the music's key, climbing with the combo, with reverb). No bolt sound between sniper shots. No meat / wet / squish
   recording for flesh, ever: blows are dry punches and thuds. Guards shout, the dying cry out. Music is liked as is.
   Doors are synthesized whole (struck-panel partials, `_door` / `_doorSlam`; user hated every door recording), no
   hinge creak. Guards' voices = their recording pushed back + a synthesized voice under it (`_voice`); telling a
   stranger off they only mutter. A panic is a crowd: every customer cries out (bank set 'panic', long yells), up
   to 7 at once, never all on the same instant. Effects sit under guns and music (`SFX_LEVEL`). User cannot hear
   what the voice cap drops: check admission (`_admit`: gap / max per name) before blaming a sound's level.
5. Synthwave music: darker; next to silent while all is quiet (a few spaced plucks), the beat (house, 126 BPM, four
   on the floor, off-beat open hat, pumping bass; original material only) starts bare with the fight, each chained
   kill adds a layer and a little volume (`Music.setCombo`), and
   it gets worked up with the alert phase and the heat of the fight (ai/Tension.js). Parts fade into one another
   (a filter on the whole mix, `Session.fade`); at the top of a chain a 32nd snare roll fills every fourth bar.
6. Level 1 (alley, road, bar, back room, back lot; 13 guards: hand to hand but two guns, the pool player's pistol
   and the boss's shotgun; a pistol hidden in the liquor store; no weapon in the start alley: a tire iron in the trunk
   of the first parked car, E at its tail (prop option `trunk`); a cue by the pool table; the player starts sitting
   against the alley wall and gets up at the first key, level `intro: 'sit'`, first try only)
   & MGS-style enemy AI (ai/Director.js), street life
   (traffic, passers-by), dressed rooftops. Closed shops (LIQUOR, VIDEO; level `alarms`, systems/Alarms.js) ring when
   broken into: a bell made of a recorded cut, a red beacon, guards nearby come to look, until the box is shot off.
   Street fauna (level `critters`, systems/Critters.js; silent but for the pigeons' wings, a cut of recorded air): rats
   run out from under a dumpster that is hit, pigeons go up at a shot or when run at, a cat bolts over a bin, flies, moths.
   User: a small level is fine, every detail polished, real scale, ambiance
   first. No MIRAGE marquee (rejected twice: ugly, useless). Guards ignore an unarmed player outside the level's
   `premises` until he gives himself away (Director.isThreat): realistic, organic, immersive. The bar room is public
   (he walks in like a customer, level `welcome`); the VIP room, the boss's back room and the back of house are not. Bar life: guards at a pastime
   (level `jobs`: pool, cards, the pimp counting his dope in the storeroom), customers and VIP-room dancers (`ambient.patrons`, sprites dancerN) who panic each his own way (`AMBIENT.panic`: most run, a few trip, some curl up sobbing in a corner or behind furniture, some freeze hands up) and run for
   the street when it kicks off. Guards at ease (user: "too flat", wants many animations, be creative): weapon put
   away while calm, in hand and low on alert, raised on a target (ai/Carry.js); they smoke, read a pager, stretch,
   fold their arms, chat in pairs, go for a leak (Enemy.pickActivity, ai/Pastimes.js); civilians use their hands
   too (`busyHands()`: pastimes, pockets, a bag, hands up in a panic).
   The bar's furniture is alive: pool balls that really roll, collide and drop (systems/PoolBalls.js, struck by the
   players, thrown by a shot or a bump), an arcade that rings and a jukebox that derails then goes dark
   (systems/Gadgets.js; till then it plays its own small band on the song's bars and chords, `Music.setJukebox`), snow on the boss's TV,
   a turning ceiling fan (render/PropLife.js) and a mirror ball whose spots are real lights sweeping the VIP room
   (prop light `spots`, Lighting.drawSpots; the user found drawn specks cheap), hung lamps that
   swing on a hit or a blast, wall extinguishers whose white cloud blocks sight (systems/Clouds.js, World.sightLine).
   Street furniture: a drinks machine that spits cans, a phone booth whose receiver dangles once hit, parking meters
   that bend and shed coins, newspaper boxes, steam from manholes, the oven's vent and pierced pipes
   (systems/Steam.js), a water pipe that leaks, loose papers blown by gusts and passing cars (systems/Papers.js;
   level `street` = dressing without a body, `lv.dress` in tools/levelkit.py).
   People: a tramp asleep on his cardboard in the start alley who wakes and runs (patron pastime 'sleep'), doormen
   who follow the player with their eyes (job 'door'), a bartender who polishes glasses and ducks behind his counter
   at the first shots (job 'wipe'), customers who shove their chair back, drop their glass and leave a cigarette
   burning when they run ('patronLeft', `AMBIENT.leave`).
   A guard killed whole is sometimes not quite dead: he drags himself a little way, groans once and lies still
   (`crawl` odds per wound in data/wounds.js, `CRAWL`, `Ragdoll.drag`; the user wants it short). Gun guards tip a
   table over for a shield before kneeling behind it (prop def `flips`, `Prop.flip`, `Tactics.tableToFlip`, `AI.flip`).
7. Sandbox (F1 panel in any level) + `?level=lab` physics lab, `?level=street` street-life testbed.

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
  User wants rounds counted: a pistol holds 7, the player starts with no reserve, a dead guard drops no spare
  magazine and level 1 has no ammunition box (a gun picked up holds what was left in it, that is all).
- Melee weapons are data (`swing` club | blade, `heft`, `material`, `thrust`, `snaps`, `finisher`): never test
  `=== WEAPONS.bat`. Blow effects: fx/Blows.js; finishers / takedowns per weapon: data/finishers.js; kill tags
  (collateral, slide kill, wallbang, from behind...): `SCORING.tags` + `Scoring.killTags`, fed by the `how` of `kill`.
- Vehicles (`Vehicle`) follow a sprite-space layout contract (VEHICLES in Vehicle.js); dead bodies are `Ragdoll`s.
- Sprites come from `python tools/generate_assets.py` (deterministic, size asserts). Optional sprites via `spriteOpt()`.
- level1.js and lab.js are generated: edit `tools/build_level1.py` / `tools/build_lab.py` (tools/levelkit.py checks
  spawns, furniture overlaps and rooftop pieces) and run them; never hand-edit the output.
- Keep code clean: no stray exports / unused imports, short useful comments.
