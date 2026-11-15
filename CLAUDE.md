# Project instructions — FULL MATTER RUNNER

## Working mode: the strongest model thinks, a cheaper one types (user's rule, to keep costs down)
- The main session (Claude Fable, the most capable model) does the analysis: reading the code, reproducing and
  diagnosing bugs, measuring (headless browser), designing the change, writing the brief, then reviewing the diff,
  checking it in the game and committing.
- The implementation itself is delegated to a subagent on a cheaper model fitted to the job (Agent tool, `model`):
  Sonnet for small, fully specified edits; Opus for larger multi-file work or anything subtle. Never Fable for typing.
- A brief is self-contained (the subagent starts cold): files and functions to touch, exact behaviour and numbers,
  tests to add, and the repo rules: no commit, no push, no server, ASCII-only source, `npm test` green, generated
  levels and sprites only through their tools. The subagent reports deviations; the main session decides.
- Done inline by the main session only: one-line fixes, and bug hunts that need its own measurements.
- Exceptions the user asked for: level design, the shader layer, and (2026-11-15) the VISUAL REWORK of the sprites:
  "do it yourself, do not delegate to other agents". The main session paints those itself.

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

## Visual rework (2026-11-15: the user's verdicts, after three wrong turns of mine)
- KEEP THE PIXEL ART. He wants "a bit more detail, more real", not another style: a smooth shaded repaint ("blocs
  degueulasses"), a new hero in a rain poncho ("skin degueulasse") and anything that leaves pixel art were all
  rejected. Strictly top-down. The hero stays the blond man in the cyan jacket. Never a rooster or animal mask.
- How detail is added: a sprite is painted at TWICE the pixel density (`FINE` in tools/generate_assets.py), plain pixel
  art, and the engine draws it at half size (`density` / `img.k` in engine/Assets.js; `sw` / `sh` give a sprite's size
  in world px; drawSprite, the decal bake and the weapon drawing honour `img.k`; a raw drawImage must scale by it).
  Done: the standing characters (`_torso`, 40 x 40: seams, creases, collar, ears, nose, strands) and the twelve
  weapons (`fine()`: the 1x drawing doubled, bevelled, then sights, serrations, checkering, grain, tape, rust, old
  blood; pistol, shotgun, bat, knife and tire iron drawn natively as real silhouettes, `drawn()`). Not done:
  furniture, cars, floors.
- Size of people (his verdicts, in order: bodies at real length next to small standing sprites were "completely
  different proportions"; then "seen from above they must be bigger too"; then the bodies "a bit too wide"):
  `BODY_SCALE` = 1.3 (Config). A standing pose is drawn as a whole 1.3 x about the feet (CharacterAnim `bodyFrame`;
  pose numbers stay in unscaled px, so anything drawn or placed from a pose goes through it: muzzle, trails, what a
  guard holds), weapons follow in the hand and on the floor, the body's circle is 10 px. Bodies on the floor are
  painted at that build, about 1.5 m long, shoulders 17 px, PLAINLY (two tones a part: any more detail "clashes
  with the rest"). A wound shows on the body (data/wounds.js `MARKS`, fx/BodyMarks.js, render/BodyMarkArt.js: bullet
  holes, a cut, the blood of a blow). A man knocked down falls on his back, head AWAY from the blow (`downAngle`).
- Camera: `VIEW` = 330 world px high (engine/Camera.js); he said this zoom is right. The scene is drawn at a whole
  zoom on a canvas a little larger than the window and the lens brings it down (Game.resize).
- Rooms: not moved. With people 1.3 x bigger the back rooms are about right in body widths; move walls only if he
  still finds them too big (asked before the scale change). No television in front of the boss's door.

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
   animations + slide on Space. Still weak: combat visual feedback.
   Most non-gun sounds = cuts of a recorded CC0 foley bank (assets/sound/foley.wav + src/audio/bank.js, built by
   `node tools/build_sounds.mjs <packs-dir>` from tools/sounds.json). Synthesized sounds: the user first rejected
   them as clicky, "Mario"-like, then (2026-11-14) allowed them, alone or mixed with a recording, for everything
   EXCEPT guns and explosions, where they sound cheap: those stay recordings. Synthesized today: the kill confirm
   (a punch, a knock and a short muted note that climbs a scale over the chain; he dropped the chime as too arcade and
   the metal "dink" as a bottle),
   the doors, the guards' voices under their recording, the car horn (`_horn`: a driver held up by somebody honks). No bolt sound between sniper shots. No meat / wet / squish
   recording for flesh, ever: blows are dry punches and thuds. Guards shout, the dying cry out. Music is liked as is.
   Footsteps: one heard every `STRIDE` px (three or four a second at a run; one per drawn stride was "sixteenth
   notes"), quiet (`STEP_LEVEL`). The jukebox's own band is OFF ("horrible"). The night has a quiet synthesized bed
   (systems/Ambience.js, level `gain` of air / gust / hum / drip / walla in the audio META): the city's far wash, gusts
   with the papers, the hum of props with `hum`, drops off props with `drip`, the customers' murmur while at ease.
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
6. Level 1 (alley, road, bar, back room, back lot; 14 guards: hand to hand but two guns, the pool player's pistol
   and the boss's shotgun; a pistol hidden in the liquor store; no weapon in the start alley: a tire iron in the trunk
   of the first parked car, E at its tail (prop option `trunk`); a cue by the pool table; the player starts sitting
   against the alley wall and gets up at the first key, level `intro: 'sit'`, first try only).
   Made to be replayed another way (user: "plein de possibilites"): five ways in on foot (front door, gate to
   climb, the dark gap, the liquor store roof reached by a `ladder` from the street corner, the shop itself whose
   own ladder goes up to that roof; the roof is left by a `parapet` drop into the service alley or the back lot; no
   door between the shop and the alley, the user had it removed; the roof is dressed with real props, `sprite` option) and
   four windows to dive through (toilets and boss's room on the back lot, pool corner and VIP room on the gap).
   A walkable roof is floor tile `^`. Guards have the keys of the house (`World.pathForGuard`, `Door.unlatch`):
   never lock a door without checking they can still get out (the QA robot reports `guard-stuck`).
   The level ends in the getaway van (systems/Outro.js)
   & MGS-style enemy AI (ai/Director.js), street life
   (traffic, passers-by), dressed rooftops. Closed shops (LIQUOR, VIDEO; level `alarms`, systems/Alarms.js) ring when
   broken into: a bell made of a recorded cut, a red beacon, guards nearby come to look, until the box is shot off.
   The bar hangs on a fuse box on its back wall, in the back lot (level `power`, systems/Power.js, prop `fuse_box`):
   smashed or shot, the lights stutter and die, the jukebox and the fans stop, and only the red battery lamps over the
   doors are left (props with `standby`); guards see far less in it, and those who heard the box come and look.
   Street fauna (level `critters`, systems/Critters.js; silent but for the pigeons' wings, a cut of recorded air): rats
   run out from under a dumpster that is hit, pigeons go up at a shot or when run at, a cat bolts over a bin, flies, moths.
   User: a small level is fine, every detail polished, real scale, ambiance
   first. No MIRAGE marquee (rejected twice: ugly, useless). Guards ignore an unarmed player outside the level's
   `premises` until he gives himself away (Director.isThreat): realistic, organic, immersive. The bar room is public
   (he walks in like a customer, level `welcome`; the back door is locked, the back way in has to be forced); the VIP room, the boss's back room and the back of house are not. Bar life: guards at a pastime
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
   A guard killed whole is sometimes not quite dead: he gets onto his belly and drags himself a little way on his
   forearms, head first, away from his killer, uneven pulls, one may fail, then lies still (`crawl` odds per wound in
   data/wounds.js, `CRAWL`, fx/CrawlPose.js; the user wants it short, rare, organic, and ON HIS BELLY, not on his
   back); or he curls up on his wound (`curl`), or a leg kicks a few times (`SPASM`), fx/DyingPose.js. Gun guards tip a
   table over for a shield before kneeling behind it (prop def `flips`, `Prop.flip`, `Tactics.tableToFlip`, `AI.flip`).
7. Sandbox (F1 panel in any level) + `?level=lab` physics lab, `?level=street` street-life testbed.

## Run / test
- index.html starts the game through a small service worker (sw.js) that fetches every file fresh, because the user
  runs `python -m http.server` out of habit and his browser then mixed cached and new modules ("does not provide an
  export named ...", three times). If that error comes back: Ctrl+Shift+R once.
- `npm run play` (tools/play.mjs, port 8100): serves the LAST COMMIT, re-exported at each page load when a new commit
  came in. This is what the user should play while agents are editing the working tree (it is broken half of the time
  then, and he was hit by it twice). Tell him to use it, and commit finished work so he sees it.
- `npm start` (tools/serve.mjs: first free port from 8000, no browser cache) then the address it prints
  (`?level=lab` for the physics lab). The user often has an old server still running on 8000: a second
  `python -m http.server 8000` then fails with "address already in use", which he reads as "the server is broken".
- `npm run qa -- --minutes 10 [--seed n] [--god] [--realtime]`: a robot plays the game in a headless browser and
  writes `qa-report/<stamp>/report.md` (+ json, screenshots): exceptions, bodies in walls, stuck guards, softlocks,
  leaks, slow frames, features never exercised. Run it after any gameplay or level change and read the report
  (tools/qa/README.md). `npm run shot -- scenario.json outdir`: the scenario / screenshot harness it shares.
- `npm test` (= `node --test tests/*.test.mjs`): Node unit tests, Matter loaded as a global by tests/setup.mjs.
- The picture goes through a WebGL last pass, the lens (render/PostGL.js + render/Lens.js, settings data/post.js: radial
  colour fringe, shock waves, heat shimmer, glow, grading per situation, tube / tape look, speed smear, soft edges,
  shafts of light, zoom kick and impact frame on a kill); HUD and screens are drawn on a canvas above it. `?post=0`
  turns it off (old 2D grading), F6 toggles it. Tune in data/post.js, never hard-code. The user's verdict: at rest it
  must be barely there (a boosted resting look was "far too much"); it is a KILL that the lens underlines (fringe, zoom,
  colours pushed, impact frame); no blur in play (soft edges, speed smear, colour bleed are off: "does not look good").
- Debug keys: F1 sandbox panel (game/debug/Sandbox.js: spawn tools + cheats, keys listed on screen), F2 enemy
  vision, F3 overview, F4 physics overlay (with FPS and frame times), F6 lens on / off (the picture with and without the
  WebGL last pass, to compare). `window.game` in the console.
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
- Melee weapons are data (`swing` club | blade, `heft`, `material`, `thrust`, `snaps`, `finisher`, `wear`, `breaks`):
  never test `=== WEAPONS.bat`. The player's melee weapons break on the kill that uses them up (`wear` kills, carried
  by the dropped item): snapped in two (`breaks: 'snap'`, `snaps` left in the hand) or left planted in the body
  (`'lodge'`), `Character.breakWeapon`, drawn on the body by Ragdoll `stuck`. Strike gestures 0-3 (3 = a club's spin,
  a blade's overhead stab). Blow effects: fx/Blows.js; finishers (sequences of `beats`) / takedowns per weapon:
  data/finishers.js; kill tags (collateral, slide kill, wallbang, from behind, spin, weapon break...): `SCORING.tags`
  + `Scoring.killTags`, fed by the `how` of `kill`. A body that does not crawl may twitch a moment (`THROES`, data/wounds.js).
- Vehicles (`Vehicle`) follow a sprite-space layout contract (VEHICLES in Vehicle.js); dead bodies are `Ragdoll`s.
- Sprites come from `python tools/generate_assets.py` (deterministic, size asserts). Optional sprites via `spriteOpt()`.
- level1.js and lab.js are generated: edit `tools/build_level1.py` / `tools/build_lab.py` (tools/levelkit.py checks
  spawns, furniture overlaps and rooftop pieces) and run them; never hand-edit the output.
- Keep code clean: no stray exports / unused imports, short useful comments.
