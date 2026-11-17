# Project instructions - FULL MATTER RUNNER

## Working mode: the strongest model thinks, a cheaper one types (user's rule, to keep costs down)
- The main session (the most capable model) does the analysis: reading the code, reproducing and diagnosing bugs,
  measuring (headless browser), designing the change, writing the brief, then reviewing the diff, checking it in the
  game and committing.
- The implementation is delegated to a subagent on a cheaper model fitted to the job (Agent tool, `model`): Sonnet
  for small, fully specified edits; Opus for larger multi-file work or anything subtle. Never the strongest to type.
- A brief is self-contained (the subagent starts cold): files and functions to touch, exact behaviour and numbers,
  tests to add, and the repo rules: no commit, no push, no server, ASCII-only source, `npm test` green, generated
  levels and sprites only through their tools. The subagent reports deviations; the main session decides.
- Done inline by the main session only: one-line fixes, bug hunts that need its own measurements, and what the user
  wants done by it: level design, the shader layer, the sprites (paint them yourself, do not delegate).

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
- Real scale: engine/physics/Units.js, 1 m = 32 px (a car is about 4.4 x 1.8 m); tight rooms, vehicles at real size.
- Clean, documented, decoupled, scalable code (levels, weapons, enemies, mechanics), testable (logic/render/physics/data split).
- Keyboard is AZERTY (we use `e.code`, so KeyW/A/S/D = ZQSD).

## Art
- KEEP THE PIXEL ART: more detail, more real, never another style (no smooth shaded repaint). Strictly top-down.
- Detail comes from density: characters and weapons are painted at TWICE the pixel density (`FINE` in
  tools/generate_assets.py), plain pixel art, drawn at half size (`density` / `img.k` in engine/Assets.js; `sw` / `sh`
  give a sprite's size in world px; drawSprite and the decal bake honour `img.k`, a raw drawImage must scale by it).
  Furniture and vehicles follow (`FINE_PROPS`, kept in step in both files), floors too; neon signs stay at 1x.
  Still to do: the detail pass on furniture, cars and floors (to the level of the characters and weapons).
- The hero (an original take on the user's reference): brown hair to his collar, a Mediterranean tan (not brown or
  dark), a dark cap, a scarf up over his mouth, a long charcoal coat collar up, grey knit, jeans, boots, a leather
  satchel across him; the lining and the cap's button a dark petrol blue. Never bright turquoise, never an animal mask.
- Walk and hands: entities/Gait.js (cadence and stride grow with speed, planted feet), arms and hands painted in
  render/LimbArt.js; long guns shouldered with `grip`, `fore`, `butt` (data/weapons.js); heads are their own sprite.
- `BODY_SCALE` = 1.3 (Config): a standing pose is drawn 1.3 x about the feet (CharacterAnim `bodyFrame`; pose numbers
  stay unscaled, so anything placed from a pose goes through it: muzzle, trails, what a guard holds), the body's
  circle is 10 px. Bodies on the floor: that build, PLAINLY painted (two tones a part) at the WORLD's pixel size.
- Wounds show on the body (data/wounds.js `MARKS`, fx/BodyMarks.js, render/BodyMarkArt.js). A man knocked down falls
  on his back, head AWAY from the blow (`downAngle`).
- Camera: `VIEW` = 290 world px high (engine/Camera.js); the scene is drawn at a whole zoom slightly larger than the
  window and the lens brings it down (Game resize).
- Rooms are tight: level 1 loses whole tiles (tools/build_level1.py `CUT_COLS` / `CUT_ROWS`, levelkit `cut_cols` /
  `cut_rows`); the builder keeps its drawing's coordinates, the kit moves them: keep things off the cut lines.
  Coordinates in tests and QA plans are the level's AFTER the cuts. A doorway needs room on one side; wall pieces
  have bodies, never hang one across a doorway (levelkit `check_on_wall`). Workers stand square at their post.
- Rules that stay: no window in the boss's office; no television in front of the boss's door; no awning over the
  bar's door (it hides the entrance).

## Audio
- Sounds and music will come from PAID packs bought online. Do not add new synthesized sounds.
- The synthesized audio is temporary, replaced pack by pack: sounds in src/audio/Foley.js, Synth.js, Beds.js and the
  synthesized part of Audio.js; music in Synthwave.js, groove/, score.js, tracks/.
- Recorded today: gunshots in assets/sound/shots; the foley bank assets/sound/foley.wav + src/audio/bank.js, built by
  `node tools/build_sounds.mjs <packs-dir>` from tools/sounds.json (never edit bank.js by hand).
- Keep Music.js's public API (setTrack, start, stop, setIntensity, setCombat, setCombo, setJukebox): recorded music
  must bring layers / stems per intensity (calm, tension, fight, kill chain) behind it.
- Every pack goes in assets/sound/CREDITS.md with its licence. Paid packs' source files are not redistributable:
  keep them out of the repo (an ignored folder) when the licence says so.
- A sound you cannot hear: check voice admission (`_admit` in Audio.js: gap / max per name) before its level.

## Gameplay
- Ammo per caliber: `weapon = { type, mag, reserve }`, player pools `player.ammo[caliber]`; reloading drops the mag
  with its rounds. A pistol holds 7, the player starts with no reserve, a dead guard drops no spare magazine, level 1
  has no ammunition box.
- Melee weapons are data (`swing`, `heft`, `material`, `thrust`, `snaps`, `finisher`, `wear`, `breaks`): never test
  `=== WEAPONS.bat`. They break on the kill that uses them up (`breaks: 'snap' | 'lodge'`, `Character.breakWeapon`).
- Finishers / takedowns per weapon: data/finishers.js (`CharacterAnim.execPose`); kill tags `SCORING.tags` +
  `Scoring.killTags`, fed by the `how` of `kill`; a body that does not crawl may twitch (`THROES`, data/wounds.js).
- Ways to die: a rare crawl ON HIS BELLY (about one in ten, `crawl` odds, `CRAWL`, fx/CrawlPose.js), `curl`, `SPASM`
  (fx/DyingPose.js), `BEHEAD`; a body thrown at a wall stays sat against it (Ragdoll `propUp`, `SIT`).
  Gun guards tip a table over as a shield (prop `flips`, `Prop.flip`, `Tactics.tableToFlip`).
- Guards ignore an unarmed player outside the level's `premises` (Director.isThreat). A stranger who acts up is
  challenged before being fought (ai/Conduct.js, data/conduct.js). Guards remember jams and replan (ai/Nav.js).
- Bar life: guards at their `jobs`, `ambient.patrons` who panic each his own way (`AMBIENT.panic`), weapons carried
  away / low / raised (ai/Carry.js), pastimes (ai/Pastimes.js, Enemy.pickActivity), hands busy (`busyHands()`).
- Living furniture: systems/PoolBalls.js, systems/Gadgets.js (arcade, jukebox), render/PropLife.js, the mirror
  ball's spots (Lighting.drawSpots), extinguisher powder (systems/Smoke.js, World.sightLine), systems/Steam.js,
  systems/Papers.js.

## Level 1
- 12 guards, two guns in the house (the poker dealer's pistol, the boss's shotgun), a pistol behind the liquor
  store's counter, a cue by the pool table, a tire iron in the trunk of the first parked car (prop option `trunk`,
  E at its tail); the player starts on the ground and gets up (level `intro`).
- Five ways in on foot (front door, gate, the gap, the liquor store roof by a `ladder`, the shop's own ladder; down
  by a `parapet`) and three windows (toilets, gaming room, VIP room). A walkable roof is floor tile `^`.
- Guards have the house's keys (`World.pathForGuard`, `Door.unlatch`): never lock a door without checking they still
  get out (the QA robot reports `guard-stuck`).
- The getaway van (systems/Outro.js) follows `exit.route` and cannot be destroyed (`armoured`): check it in the
  browser after touching the route.
- Shop alarms (level `alarms`, systems/Alarms.js), the bar's fuse box (level `power`, systems/Power.js), street
  fauna (level `critters`, systems/Critters.js). The bar room is public (level `welcome`); the VIP room, the boss's
  back room and the back of house are not.

## Front end, story, tutorial
- ui/Menu.js (pages, DOM-free) / ui/MenuArt.js; progression systems/Progress.js (`CAMPAIGN` = tutorial then level1)
  and systems/Settings.js in localStorage; `Game.startLevel(id)`, `newGame()`, `?level=<id>` forces a level.
- Story: he ran packages for the bar's boss for six years and hid every dollar under his floor to leave town; the
  boss's men take it back and set his flat on fire with him in it. He gets out through the window; level 1 is the
  next night, at the bar.
- Tutorial: tools/build_tutorial.py, systems/Tutorial.js (`HINTS`, waves of `dormant` guards, `slack`, `sharp`,
  `leaves` / `owed` rounds, restart at `Game.tutorialAt`), fires in systems/Fires.js.
- Cinematics: ui/Cinematic.js (opening), ui/cine/* (Page, Panels, Ink, Leap, Ending), stills painted by
  tools/generate_comic.py; title screen ui/TitleScene.js + ui/title/*. Style: plain pixel art, flat shades, a dark
  outline, NO dither / screentone / gradient. Check cinematics and menu in the browser after touching them.
- The QA robot plays the tutorial with `npm run qa -- --level tutorial` (add `--god` to reach the window).

## Run / test
- index.html starts the game through a service worker (sw.js) that fetches every file fresh (mixed cached modules
  gave "does not provide an export named ..."). If it comes back: Ctrl+Shift+R once.
- `npm run play` (tools/play.mjs, port 8100): serves the LAST COMMIT. This is what the user plays while agents edit
  the working tree: tell him to use it, and commit finished work so he sees it.
- `npm start` (tools/serve.mjs: first free port from 8000, no browser cache), then the address it prints.
- `npm run qa -- --minutes 10 [--seed n] [--level id] [--god] [--realtime] [--plans a,b]`: a robot plays in a headless
  browser and writes `qa-report/<stamp>/report.md` (+ json, screenshots). Run it after any gameplay or level change
  and read the report (tools/qa/README.md). `npm run shot -- scenario.json outdir`: scenario / screenshot harness.
- `npm test` (= `node --test tests/*.test.mjs`): Node unit tests, Matter loaded as a global by tests/setup.mjs.
- The WebGL last pass, the lens (render/PostGL.js + render/Lens.js): tune in data/post.js, never hard-code. Barely
  there at rest; a KILL is what it underlines; no blur in play. `?post=0` turns it off, F6 toggles it.
- Debug keys: F1 sandbox (game/debug/Sandbox.js), F2 enemy vision, F3 overview, F4 physics overlay (FPS, frame
  times), F6 lens on / off. `window.game` in the console.
- Headless checks: Edge `--headless=new --remote-debugging-port` over DevTools (tools/qa/cdp.mjs). Prefer the Node
  static server to Python's. Never kill processes you didn't start.

## Architecture & conventions
- Read docs/ARCHITECTURE.md first (layers, step order, events, physics model).
- `engine/` never imports `game/`. Logic modules stay DOM-free (canvas work in game/render or entity draw()).
- New gameplay reactions: emit/listen on `world.events` instead of wiring direct calls.
- Physics: give every dynamic body kg + mu (`setMaterial`) and a `material`; read velocities with
  `Body.getVelocity/getSpeed/getAngularVelocity` (normalized to 60 Hz); use `impulse()` (momentum) for hits/blasts;
  heavy objects use `world.physics.freezeIfHeavy(body)`.
- Vehicles (`Vehicle`) follow a sprite-space layout contract (VEHICLES in Vehicle.js); dead bodies are `Ragdoll`s.
- Sprites come from `python tools/generate_assets.py` (deterministic, size asserts). Optional sprites via `spriteOpt()`.
- level1.js, lab.js and tutorial.js are generated: edit `tools/build_level1.py` / `build_lab.py` / `build_tutorial.py`
  (tools/levelkit.py checks spawns, furniture overlaps and rooftop pieces) and run them; never hand-edit the output.
- Keep code clean: no stray exports / unused imports, short useful comments.

## Skills (.claude/skills/<name>/SKILL.md)
- `check`: before any commit (tests, ASCII diff, hand-edited generated files, QA when gameplay moved).
- `qa`: make the robot play a level, read the report, compare it with the previous run of that level.
- `regen`: after touching tools/generate_assets.py or a level builder (regenerate, test, one screenshot).
- `brief`: before delegating: write the self-contained brief and pick the subagent's model.
- `bugfix`: fixing a bug: reproduce, failing test first, fix, then `check`.
- `audio-import`: bringing a bought sound or music pack in (licence, build, credits, listen).
