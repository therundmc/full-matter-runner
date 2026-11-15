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
  rejected. Strictly top-down. Never a rooster or animal mask. The hero (his reference picture, 2026-11-15, an
  original take on it): brown hair to his collar, a Mediterranean tan ("south of France", not brown or dark), a dark
  cap, a scarf up over his mouth, a long charcoal coat collar up, grey knit, jeans, boots, a leather satchel across
  him. No bright turquoise on him ("pas joli, ca denote"): the lining and the cap's button are a dark petrol blue.
- How detail is added: a sprite is painted at TWICE the pixel density (`FINE` in tools/generate_assets.py), plain pixel
  art, and the engine draws it at half size (`density` / `img.k` in engine/Assets.js; `sw` / `sh` give a sprite's size
  in world px; drawSprite, the decal bake and the weapon drawing honour `img.k`; a raw drawImage must scale by it).
  Done: the standing characters (`_torso`, 40 x 40: seams, creases, collar, ears, nose, strands) and the twelve
  weapons (`fine()`: the 1x drawing doubled, bevelled, then sights, serrations, checkering, grain, tape, rust, old
  blood; pistol, shotgun, bat, knife and tire iron drawn natively as real silhouettes, `drawn()`). Not done:
  furniture, cars, floors.
- Gait and hands (2026-11-15, he found the walk "too mini-game", the hands squares, a long gun held on a stick arm):
  entities/Gait.js (cadence and stride grow with speed, planted feet, a torso that carries past a stop), arms and
  hands painted in render/LimbArt.js (two-bone arms, fist / loose / flat hands), long guns shouldered with `grip`,
  `fore`, `butt` in data/weapons.js; heads are their own sprite (`_head`). The assault rifle is the M16 (key `rifle`), the pistol a 1911
  with walnut grips, the shotgun a SUPER 90 (olive and black, tube magazine), the sniper a .50 CAL (his choices).
- Size of people (his verdicts, in order: bodies at real length next to small standing sprites were "completely
  different proportions"; then "seen from above they must be bigger too"; then the bodies "a bit too wide"):
  `BODY_SCALE` = 1.3 (Config). A standing pose is drawn as a whole 1.3 x about the feet (CharacterAnim `bodyFrame`;
  pose numbers stay in unscaled px, so anything drawn or placed from a pose goes through it: muzzle, trails, what a
  guard holds), weapons follow in the hand and on the floor, the body's circle is 10 px. Bodies on the floor are
  painted at that build, about 1.5 m long, shoulders 17 px, PLAINLY (two tones a part: any more detail "clashes
  with the rest") and at the WORLD's pixel size, not the finer one ("too high a resolution next to the rest"). A wound shows on the body (data/wounds.js `MARKS`, fx/BodyMarks.js, render/BodyMarkArt.js: bullet
  holes, a cut, the blood of a blow). A man knocked down falls on his back, head AWAY from the blow (`downAngle`).
- Camera: `VIEW` = 330 world px high (engine/Camera.js); he said this zoom is right. The scene is drawn at a whole
  zoom on a canvas a little larger than the window and the lens brings it down (Game.resize).
- Rooms (2026-11-15, his verdict: "the furniture too small or the rooms too big", "maybe shrink the rooms a little"):
  level 1 is tightened by whole tiles taken out (tools/build_level1.py `CUT_COLS` / `CUT_ROWS`, levelkit `cut_cols` /
  `cut_rows`): the builder keeps its drawing's coordinates, the kit moves them; keep things off the cut lines. Two
  columns are cut (CUT_COLS 19, 29); the bar room's row cut was given back ("no room to get through"): 14 x 8 m with
  walkways of about 1.2 m between its furniture. Coordinates in tests and the QA robot's plans are the level's (after
  the cuts). A doorway needs room on one side at least; wall pieces have bodies, never hang one across a doorway
  (levelkit `check_on_wall` refuses it). Standing workers are placed square at what they work at (posts `front`).
  No television in front of the boss's door; no window in the boss's office (he had it taken out).

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
   Footsteps: one heard when a drawn foot lands (entities/Gait.js: about 1.8 a second walking, 3 at a run; the old cycle was "sixteenth
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
   three windows to dive through (the toilets on the back lot, the pool corner and the VIP room on the gap).
   A walkable roof is floor tile `^`. Guards have the keys of the house (`World.pathForGuard`, `Door.unlatch`):
   never lock a door without checking they can still get out (the QA robot reports `guard-stuck`).
   The level ends in the getaway van (systems/Outro.js): it follows the level's `exit.route` (out of the lot in a
   slide, down the service alley, through the gate, onto the road, fade to black), flat out; nothing stops or pushes
   it, what it runs into is smashed or thrown (`Vehicle.driveTo` / `ram`), and it cannot be destroyed during the
   level (`armoured`). The user wants this scene to look good: check it in the browser after touching the route.
   & MGS-style enemy AI (ai/Director.js), street life
   (traffic, passers-by), dressed rooftops. Closed shops (LIQUOR, VIDEO; level `alarms`, systems/Alarms.js) ring when
   broken into: a bell made of a recorded cut, a red beacon, guards nearby come to look, until the box is shot off.
   No pergola over the bar's door (tried, "too ugly"): a wall lamp each side of it.
   The bar hangs on a fuse box on its back wall, in the back lot (level `power`, systems/Power.js, prop `fuse_box`):
   smashed or shot, the lights stutter and die, the jukebox and the fans stop, and only the red battery lamps over the
   doors are left (props with `standby`); guards see far less in it, and those who heard the box come and look.
   Street fauna (level `critters`, systems/Critters.js; silent but for the pigeons' wings, a cut of recorded air): rats
   run out from under a dumpster that is hit, pigeons go up at a shot or when run at, a cat bolts over a bin, flies, moths.
   User: a small level is fine, every detail polished, real scale, ambiance
   first. No MIRAGE marquee (rejected twice: ugly, useless). Guards ignore an unarmed player outside the level's
   `premises` until he gives himself away (Director.isThreat): realistic, organic, immersive. The bar room is public
   (he walks in like a customer, level `welcome`; the back door is locked, the back way in has to be forced); the VIP room, the boss's back room and the back of house are not. Bar life: guards at a pastime
   (level `jobs`: pool, cards, the pimp counting his dope in the storeroom), a few customers and a VIP-room dancer (`ambient.patrons`, sprites dancerN; eight in all: thirteen was "too many") who panic each his own way (`AMBIENT.panic`: most run, a few trip, some curl up sobbing in a corner or behind furniture, some freeze hands up) and run for
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
   data/wounds.js, `CRAWL`, fx/CrawlPose.js; the user wants it short, rare (about one man in ten: more was "too much"), organic, and ON
   HIS BELLY, not on his back); or he curls up on his wound (`curl`), or a leg kicks a few times (`SPASM`), fx/DyingPose.js. A man
   beheaded on his feet sinks onto his knees, the neck spurting, then pitches forward (`BEHEAD`, the user's idea). Gun guards tip a
   table over for a shield before kneeling behind it (prop def `flips`, `Prop.flip`, `Tactics.tableToFlip`, `AI.flip`).
   A body thrown toward a wall within reach of its slide is slammed against it and stays sat there, legs out, head
   dropped (Ragdoll.propUp, `SIT`: his wish, he saw them bounce off; a shot or a shove lays it flat).
7. Sandbox (F1 panel in any level) + `?level=lab` physics lab, `?level=street` street-life testbed.
8. Front end and tutorial (2026-11-15, built while he slept: NOT yet validated, expect feedback).
   The title screen and the pause are a real menu (ui/Menu.js = pages and navigation, DOM-free; ui/MenuArt.js = its
   picture; Game.updateMenu / applyMenu): continue, new game, level select with locked levels and best results,
   options by category (audio, video: lens / shake / fullscreen, controls, game: replay the tutorial, reset). The
   progression (systems/Progress.js, `CAMPAIGN` = tutorial then level1) and the settings are saved in localStorage.
   `Game.startLevel(id)` starts a level, `newGame()` retries the current one, `?level=<id>` still forces a level.
   The story (his call: the screaming woman was "vu et revu", find another reason for him to snap): he ran packages
   for the bar's boss for six years and kept every dollar under his floor to leave town; that night the boss's men
   take the money back, shoot the building's super who came up about the noise, and set the flat on fire with him in it.
   The tutorial (level `tutorial`, tools/build_tutorial.py, systems/Tutorial.js): his flat (bedroom, living room with
   the hole in the floor, kitchen, entrance hall with the super's body), his front door, the building's corridor
   (neighbours' doors, doormats, carpet runner, radiators, a bike, bin bags: he asked that one understands door,
   flat, corridor, window), the landing where three men come up the stairs, the window at the corridor's end. One move
   a place, said by a key cap and a few words next to what it is done to (`HINTS`); the guards of a place are
   `dormant` until its wave is called (a guard may be in two stages' waves), slower than real ones (`slack`); the
   shooter's gun keeps 2 rounds (`leaves`, and `owed` on a retry past him); a death starts again at the last place
   reached (`Game.tutorialAt`). The flat burns room after room behind him (level `fires`, systems/Fires.js: looks
   only); the petrol man in the living room lights it as the player walks in (fires with a `delay`), taken down too
   late. The corridor's gunman is a `sharp` wave (woken knowing, gun drawn, `standT` holding his ground, quick
   `slack`, normal `rate` of fire): he fires as the player turns the corner, the slide is what dodges it (his wish).
   What lies flat (doormats, stairs, the runner, the floor hole) is floor paint (level `floor`, levelkit
   `paint`), not props, so no round stops on it. The dive out ends in state `fall`: a moment of slow motion going
   black, then the leap heard in the dark (ui/cine/Leap.js: glass, wind, the landing, the roll; he found the comic
   page of it "even uglier", it was removed), "THE NEXT DAY." (his words; level 1 is dated the next night), then level 1. The title screen is the street seen FROM HIS WINDOW
   (ui/cine/Pane.js: rain running down the glass, the frame, his bottle on the sill; the user's idea). NEW GAME plays
   the opening first (ui/Cinematic.js, state `cinematic`; he wants a real AAA-style intro, pixel art with a real art
   direction, rich detail): the camera pulls back from that window into his bedroom (ui/cine/Room.js: map with his
   rounds, crossed-off calendar, half-packed suitcase, bicycle in the near plane) while the street behind the glass
   drops to the room's coarse pixels and fogs (he found the sharp window "too contrasted" with the room); boards torn
   up next door, his eye opens; comic page one (ui/cine/Page.js lays out panels, captions, balloons, sound words;
   ui/cine/Panels.js paints them): the men at his front door, the crowbar under his boards, the tin box, the money
   counted; the super shouts and is shot; page two: the super on his face, the petrol on the sofa ("NO LOOSE ENDS."),
   a match struck (synthesized `match` sound), "TORCH IT."; he dresses, the view tips onto the floor plan. About
   30 s, slow on purpose ("go slower so one understands"), skippable. Style: plain pixel art, flat shades, a dark
   outline, NO dither / screentone ("trop pointille"); pixel tools in ui/cine/Ink.js.
   Check the cinematic and the menu in the browser after touching them; the QA robot plays the tutorial with
   `npm run qa -- --level tutorial` (add `--god` to see it through to the window).

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
  data/finishers.js (a man who is down: ANY attack on him, or Space, starts his execution, and the player is locked in
  its animation, `CharacterAnim.execPose`: fists = astride him, thumbs in his eyes; knife = astride, stabbed again and
  again; club = skull crushed from over him; bat = home run; gun = a foot on his chest, his head blown off); kill tags (collateral, slide kill, wallbang, from behind, spin, weapon break...): `SCORING.tags`
  + `Scoring.killTags`, fed by the `how` of `kill`. A body that does not crawl may twitch a moment (`THROES`, data/wounds.js).
- Vehicles (`Vehicle`) follow a sprite-space layout contract (VEHICLES in Vehicle.js); dead bodies are `Ragdoll`s.
- Sprites come from `python tools/generate_assets.py` (deterministic, size asserts). Optional sprites via `spriteOpt()`.
- level1.js and lab.js are generated: edit `tools/build_level1.py` / `tools/build_lab.py` (tools/levelkit.py checks
  spawns, furniture overlaps and rooftop pieces) and run them; never hand-edit the output.
- Keep code clean: no stray exports / unused imports, short useful comments.
