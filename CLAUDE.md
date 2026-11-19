# Project instructions - FULL MATTER RUNNER

## Working mode: the strongest model thinks, a cheaper one types (user's rule, to keep costs down)
- The main session (the most capable model) does the analysis: reading the code, reproducing and diagnosing bugs,
  measuring (headless browser), designing the change, writing the brief, then reviewing the diff, checking it in the
  game and committing.
- The implementation is delegated to a subagent (Agent tool, `model: 'opus'`): Opus 5.5 at the minimum, never
  Sonnet or Haiku (the user's call: those limits run out first). Never the strongest model to type.
- A brief is self-contained (the subagent starts cold): files and functions to touch, exact behaviour and numbers,
  tests to add, and the repo rules: no commit, no push, no server, ASCII-only source, `npm test` green, generated
  levels and sprites only through their tools. The subagent reports deviations; the main session decides.
- Done inline by the main session only: one-line fixes, bug hunts that need its own measurements, and what the user
  wants done by it: level design, the shader layer, the sprites (paint them yourself, do not delegate).

## Git
- Commit messages: one single sentence, no body/bullet list (attribution trailer allowed).
- `main` is the up-to-date, current version of the game (the old prototype is gone). Fetch and pull `main` before starting.
- Never work directly on `main`: each task gets its own clean, short-lived branch cut from `main`
  (`feature/<topic>`, `fix/<topic>`), merged back into `main` when done. Do not push unless asked.
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
- Gamepad (data/controls.js `PAD_BINDINGS`): the fire is on the bumpers (the user's pick): RB attacks / shoots / takes
  down (RT too, an alias), LB throws / picks up, LT looks further, A acts, X uses, Y reloads, START pauses. Rumble:
  systems/Rumble.js from the world's events, effects in data/rumble.js (`RUMBLE`: per gun family, blow, kill,
  finisher, death, blast, door, the car's `ride` beats; `mix`: the strongest per motor, never a drone), in play only
  with the pad in hand, scaled by the VIBRATION option (GAME page, Settings `rumble`).

## Art
- KEEP THE PIXEL ART: more detail, more real, never another style (no smooth shaded repaint). Strictly top-down.
- Detail comes from density: characters and weapons are painted at TWICE the pixel density (`FINE` in
  tools/generate_assets.py), plain pixel art, drawn at half size (`density` / `img.k` in engine/Assets.js; `sw` / `sh`
  give a sprite's size in world px; drawSprite and the decal bake honour `img.k`, a raw drawImage must scale by it).
  Furniture and vehicles follow (`FINE_PROPS`, kept in step in both files), floors too; neon signs stay at 1x.
  Level 1's detail pass is done (2026-11-18: furniture wear, floor wear in FloorWear.js, live props in PropLife.js,
  car interiors); still to do: car debris sprites to match, and the same care on every new level.
- The hero (the user's pick, 2026-11-18, "B v2"): brown hair to his collar, a Mediterranean tan (not brown or dark),
  a dark cap with a low crown and a short flat brim (its front edge petrol: it shows where he faces), a petrol gaiter
  up over his nose inside a funnel collar closed round his neck, a long ink-blue duster (`#3a4460`) with a tab on each
  shoulder, grey knit, jeans, boots, a leather satchel across him; the lining, the buttons and the cap's button a dark
  petrol blue. Never bright turquoise, never an animal mask. The duster's skirt flies behind him: two halves
  (`player_tail_l` / `_r`, KINDS `coat`) swung by entities/Skirt.js (numbers `COAT` in data/feel.js: it lags his
  turns, opens with his speed, hangs as a short hem at rest), drawn by CharacterAnim `drawSkirt`; on the floor it is
  spread under him (`player_rag_skirt`, Ragdoll `skirt`). Cosmetic only: no body, no hit circle.
- Walk and hands: entities/Gait.js (cadence and stride grow with speed, planted feet), arms and hands painted in
  render/LimbArt.js; long guns shouldered with `grip`, `fore`, `butt` (data/weapons.js); heads are their own sprite.
- `BODY_SCALE` = 1.3 (Config): a standing pose is drawn 1.3 x about the feet (CharacterAnim `bodyFrame`; pose numbers
  stay unscaled, so anything placed from a pose goes through it: muzzle, trails, what a guard holds), the body's
  circle is 10 px. Bodies on the floor: that build, PLAINLY painted (two tones a part) at the WORLD's pixel size.
- Wounds show on the body (data/wounds.js `MARKS`, fx/BodyMarks.js, render/BodyMarkArt.js). A man knocked down falls
  on his back, head AWAY from the blow (`downAngle`).
- Camera: `VIEW` = 290 world px high (engine/Camera.js); the scene is drawn at a whole zoom slightly larger than the
  window and the lens brings it down (Game resize). At the wheel the view is `CHASE.camera.view` = 360, still at a
  whole zoom (never a zoom that follows the speed: it blurred the pixel art); speed is sold by the lens's drive-only
  edge streaks (data/post.js `POST.speed.drive`, nothing near the middle) and the world's wind / wake (CHASE.fx).
- Rooms are tight: level 1 loses whole tiles (tools/build_level1.py `CUT_COLS` / `CUT_ROWS`, levelkit `cut_cols` /
  `cut_rows`); the builder keeps its drawing's coordinates, the kit moves them: keep things off the cut lines.
  Coordinates in tests and QA plans are the level's AFTER the cuts. A doorway needs room on one side; wall pieces
  have bodies, never hang one across a doorway (levelkit `check_on_wall`). Workers stand square at their post.
- Rules that stay: no window in the boss's office; no television in front of the boss's door; no awning over the
  bar's door (it hides the entrance).

## Audio
- Sounds and music will come from PAID packs bought online. Do not add new synthesized sounds.
- A full SFX library will be bought later: a feature that wants a sound gets a NAMED PLACEHOLDER (played through the
  normal Audio path, mapped to the closest recorded foley cut or silent), listed in assets/sound/PLACEHOLDERS.md
  (name, trigger, wanted sound) so the library can fill it.
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
- A hard game (the user's rule): NO checkpoints. Dying restarts the level from its beginning, never mid-level
  (the tutorial alone restarts at its last room reached, `Game.tutorialAt`). A long level is split in two levels
  instead: level 2 is 2a (the car chase, ending on the crash into the gas station) and 2b (the gas station fight,
  restarted from the crash); the FLAMINGO MOTEL (JITTERS) is level 3.
- LEVEL 2: docs/LEVEL2.md is its level design and roadmap (with the concept boards in docs/level2/). Read it before
  any level 2 work, keep to it, update it when a decision changes, and add a line to its progress log at every step.
  2A is built by tools/build_level2a.py (level `chase` block: van start, cruise, lanes, end col, events by col); the
  drive is systems/Drive.js with its numbers in data/chase.js (CHASE); his gun is the boss's Uzi taken off the
  passenger seat in a short beat the first time only (Drive `grab`, `skipGrab` on a retry; SEAT.grab); a map wider than CHUNKS.whole tiles is drawn
  in chunks (render/Chunks.js): paint a map layer through MapRenderer (`paint(fn, layer, x0, x1)`), never a canvas.
- Ammo per caliber: `weapon = { type, mag, reserve }`, player pools `player.ammo[caliber]`; reloading drops the mag
  with its rounds. A pistol holds 7, the player starts with no reserve, a dead guard drops no spare magazine, level 1
  has no ammunition box.
- Melee weapons are data (`swing`, `heft`, `material`, `thrust`, `snaps`, `finisher`, `wear`, `breaks`): never test
  `=== WEAPONS.bat`. They wear out in BLOWS (`wear`, data/weapons.js `WEAR`: a man 1, a thing 0.25, a whiff 0) and
  break on the one that uses them up (`breaks: 'snap' | 'lodge'`, `bends`, `Character.breakWeapon`). Killing an armed
  guard up close with free hands snatches his gun (`SNATCH` in data/feel.js).
- Finishers / takedowns per weapon: data/finishers.js (`CharacterAnim.execPose`); kill tags `SCORING.tags` +
  `Scoring.killTags`, fed by the `how` of `kill`; a body that does not crawl may twitch (`THROES`, data/wounds.js).
- Ways to die: a rare crawl ON HIS BELLY (about one in ten, `crawl` odds, `CRAWL`, fx/CrawlPose.js), `curl`, `SPASM`
  (fx/DyingPose.js), `BEHEAD`; a body thrown at a wall stays sat against it (Ragdoll `propUp`, `SIT`).
  Gun guards tip a table over as a shield (prop `flips`, `Prop.flip`, `Tactics.tableToFlip`).
- Guards ignore an unarmed player outside the level's `premises` (Director.isThreat). A stranger who acts up is
  challenged before being fought (ai/Conduct.js, data/conduct.js). Guards remember jams and replan (ai/Nav.js).
- Bar life: guards at their `jobs`, `ambient.patrons` who panic each his own way (`AMBIENT.panic`), weapons carried
  away / low / raised (ai/Carry.js), pastimes (ai/Pastimes.js, Enemy.pickActivity), hands busy (`busyHands()`); a
  customer at the arcade and a man at his washing work their machine (`arcadeAt`, `laundryAt`, Civilian.atMachine).
- Guards may start bare-handed (level `arms`, levelkit `actor(arms=...)`): their weapon kept somewhere (a bat behind
  a counter, against a wall, the cue), fetched once the fight is on (Enemy.armsDue / armUp, AI.arms), or a brawler
  ('fists': never picks one up). A knife guard's blade stays in his pocket until then (ai/Carry.js).
- Living furniture: systems/PoolBalls.js, systems/Gadgets.js (arcade, jukebox), render/PropLife.js, the mirror
  ball's spots (Lighting.drawSpots), extinguisher powder (systems/Smoke.js, World.sightLine), systems/Steam.js,
  systems/Papers.js.

## Level 1
- The boss is CUEBALL, the comic's heavy (kind `cueball`: data/bosses.js `BOSSES`, entities/Boss.js, systems/BossStage.js):
  his name card and a camera push-in on first sight, a fast pump-action fired from the hip (each shot told: the pump,
  then a glint at the muzzle), TWO hits (the first wounds him and sends him berserk), no takedown while he is whole.
  He waits in his armchair pulled up to his desk, his boots up on it (post `cueball`, BASES `desk`).
- 12 guards, three guns in the house (the poker dealer's pistol, the money counter's pistol, the boss's shotgun); the
  others bare-handed: the bartender's bat behind his counter, the doorman's against the front wall, the cue by the
  pool table for the VIP doorman, the pimp's blade on his table, two knives in pockets, two brawlers, the couch man's
  tire iron in hand. A spare pistol hidden up on the liquor store roof (by the lookout's chair), a tire iron in the
  trunk of the first parked car (prop option `trunk`,
  E at its tail); the player starts on the ground and gets up (level `intro`), the first time with a bottle of rum,
  the camera pushed in on him (systems/Opening.js, SHOTS `swig*`).
- Four ways in on foot (front door, gate, the gap, the liquor store: in by its door and up its own `ladder` to the
  roof, the only way up (no ladder on the street: the user's call); down by a `parapet`) and three windows (toilets, gaming room, VIP room). A walkable roof is floor tile `^`.
- Guards have the house's keys (`World.pathForGuard`, `Door.unlatch`): never lock a door without checking they still
  get out (the QA robot reports `guard-stuck`).
- The getaway is THE BOSS's convertible (model `convertible`, entities/Vehicle.js: `seat`, `door`, `cabin`, `hat`;
  systems/Outro.js `OUTRO`): he vaults the door into the seat (anyone can be sat at a wheel: `Vehicle.seatIn`,
  CharacterAnim `seatPose`, `ch.riding`, data/feel.js `SEAT`), the key, the wheelspin and its rubber, then
  `exit.route` (the path of the point `OUTRO.pivot` ahead of its middle; `exit.slide`: the share of the slide a
  bend) and the hat off the rear seat at the first hard swing; the boss's Uzi lies on the passenger seat (Vehicle
  `gun`, drawn by the car: not pickable in level 1, it is level 2A's gun). It cannot be destroyed (`armoured`). The car is 5.4 m
  in a 4 m lot: its row and the first bend are the only ones that clear the walls (tests/getaway.test.mjs drives the
  whole body down the route): check it in the browser after touching the route; the lab's station 20 replays it.
- Shop alarms (level `alarms`, systems/Alarms.js), the bar's fuse box (level `power`, systems/Power.js), street
  fauna (level `critters`, systems/Critters.js). The bar room is public (level `welcome`); the VIP room, the boss's
  back room and the back of house are not.

## Front end, story, tutorial
- ui/Menu.js (pages, DOM-free) / ui/MenuArt.js; progression systems/Progress.js (`CAMPAIGN` = tutorial then level1)
  and systems/Settings.js in localStorage; `Game.startLevel(id)`, `newGame()`, `?level=<id>` forces a level.
- Story: he ran packages for the bar's boss for six years and hid every dollar under his floor to leave town; the
  boss's men take it back and set his flat on fire with him in it. He gets out through the window; level 1 is the
  next night, at the bar. The three men (CUEBALL, LUCKY, JITTERS: tools/comic/STYLE.md) are his targets: CUEBALL is
  level 1's mini-boss in the back room; THE BOSS (bone suit, cigar), who owns the bar, is the big boss to bring down
  at the end of the campaign.
- Tutorial: tools/build_tutorial.py, systems/Tutorial.js (`HINTS`, waves of `dormant` guards, `slack`, `sharp`,
  `leaves` / `owed` rounds, restart at `Game.tutorialAt`), staged by data/staging.js: the opening (the man with the
  match, `OPENING`), lessons that are one short directed beat each (`BEAT`, `LESSONS` by hint id, `pace`: slow, a
  punch-in on what it is about, then the hand given back; never held until he acts), the camera's shots (`SHOTS`, systems/Direction.js,
  `Camera.scale`), the stove going at the end (`BLAST`). The fire: systems/FireSpread.js + data/fire.js (it runs
  along the level's `petrol` trails, levelkit `pour`; one touch kills; a stage's `hold` / `keep` keeps it out a
  while), its flames systems/Fires.js + render/FireArt.js; thick smoke closes the view in (`SMOKE.murk`,
  render/Murk.js). The man with the match is LUCKY (kind `lucky`, level `looks`: his pink scarf, `KINDS.tail`,
  Enemy.drawTail, his name card). A big table across the living room, on his way, teaches the vault. A lesson waits for its object to be on
  screen and near (`LESSONS.within`); during a reload the world all but stops and nobody fires (`RELOAD`); a man
  called is framed (`FRAME`, wave `frame`); the bat breaks on the corridor's gunman and his pistol is snatched with a
  spare magazine (`FORCE`, stage `snatch` / `spare`), then RELOAD; nobody surrenders there; the end is a chain of
  fire-balls down the corridor, set off as the last man falls (`BLAST.chain`, level `blast.chain`), and the way out is marked (`EXIT`, level `exit`).
- Cinematics: ui/Cinematic.js (opening), ui/cine/* (Page, Panels, Ink, Leap, Ending; a page is skipped by holding
  SPACE / pad A, never a stray key or click: Hold.js, `SKIP`), stills painted by
  tools/generate_comic.py (package tools/comic/, art bible tools/comic/STYLE.md); Menus and title: plain pixel art, flat shades, a dark outline, NO dither / screentone / gradient.
- Title (the user's pick: the poster + the hit list): ui/title/Title.js picks the picture; Poster.js (the comic's
  cover: three layers shifted with the mouse, the fire taking his building, rain, the four's signs, the neon logo),
  HitList.js (the LEVELS page and the screen between two levels, Game state `hitlist`: the targets' cards, the X
  drawn by a marker once), Options.js (OPTIONS and its pages, from the title and the pause: his table from above,
  a thing a section, its settings on a sheet of paper beside it), Beats.js (their clocks and sounds, DOM-free),
  Paper.js (the cut-paper sheet; the pause's panel, ui/MenuArt.js). Stills and their data: `python3 tools/comic/title.py`
  (assets/sprites/title/, src/game/data/titleart.js: generated, never hand-edit). No key-hint footer in the menus.
- Comic art direction (the user's pick, 2026-11-17): NEON POSTER, Saul Bass-like cut paper. Violet night, black and
  a few flat inks (pink, cyan, bone); no ink line, every shape a slightly crooked flat polygon; people are cut-out
  signs (head, coat, legs), never anatomy, hands or faces in detail; strong diagonals, wedges of light, shadows as
  spikes; repetition tells the story; caricature over realism. The boss's three men are caricatures with a name and
  ONE loud signature each (a colour and a shape) that reads the same in the comic and from above in the game.
  Check cinematics and menu in the browser after touching them.
- The QA robot plays the tutorial with `npm run qa -- --level tutorial` (add `--god` to reach the window).

## Run / test
- EVERY NEW FEATURE GETS A STATION IN THE LAB (the user's rule): tools/build_lab.py (`?level=lab`), its floor stencil
  numbered in reading order (LAB_LABELS in tools/generate_assets.py), passive dummies / props / weapons set up so the
  user can try it at once. A brief for a new gameplay, AI, physics or animation feature always asks for its station.
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
  times), F6 lens on / off, F7 cycles the aim cue (data/aim.js `AIM_STYLES`: CROSS, LINE, WEDGE, NOTCH, LOCK; also OPTIONS / GAME / AIM; lab station 23; LOCK's mark on the man: `AIM.lock.mark`, `?mark=ring|tick|point|corners` to compare). `window.game` in the console.
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
- The chase (level 2A, docs/LEVEL2.md): numbers in data/chase.js; events by distance in the level's `chase.events`
  (systems/Pursuit.js, systems/Lorries.js); what the car hits is torn (a sensor at once), flung by hand (Drive.fling) or
  the crash (`lasting`): never let a light thing hold it up. Play it by script after touching it (tools/shot.mjs).
- Sprites come from `python tools/generate_assets.py` (deterministic, size asserts). Optional sprites via `spriteOpt()`.
- level1.js, level2a.js, lab.js and tutorial.js are generated: edit `tools/build_level1.py` / `build_level2a.py` /
  `build_lab.py` / `build_tutorial.py`
  (tools/levelkit.py checks spawns, furniture overlaps and rooftop pieces) and run them; never hand-edit the output.
- Keep code clean: no stray exports / unused imports, short useful comments.

## Skills (.claude/skills/<name>/SKILL.md)
- `check`: before any commit (tests, ASCII diff, hand-edited generated files, QA when gameplay moved).
- `qa`: make the robot play a level, read the report, compare it with the previous run of that level.
- `regen`: after touching tools/generate_assets.py or a level builder (regenerate, test, one screenshot).
- `brief`: before delegating: write the self-contained brief and pick the subagent's model.
- `bugfix`: fixing a bug: reproduce, failing test first, fix, then `check`.
- `audio-import`: bringing a bought sound or music pack in (licence, build, credits, listen).
