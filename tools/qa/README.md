# QA robot (`npm run qa`)

A robot plays the game in a headless browser (Edge, or Chrome) for a span of **game time**, watches the
simulation for problems and writes a report that an agent or the developer can read.

```
npm run qa -- [--minutes 10] [--seed 1] [--level level1] [--god] [--realtime] [--plans a,b] [--chaos | --chaos-share 0.3]
  [--port 8123] [--keep-open] [--root dir] [--out dir] [--shots 8] [--quiet]
```

| option | meaning |
|---|---|
| `--minutes` | game time to cover (default 10). Fast mode does ten game minutes in well under a minute. |
| `--seed` | seeds the bot's decisions and the game's `Math.random` (see "Replaying a seed"). |
| `--level` | level id (`level1`, `tutorial`, `lab`, `street`, `level2a`), as `?level=` in the URL. |
| `--god` | the player is invulnerable (`player.invulnerable`) after each restart: long sessions deep into the level. |
| `--realtime` | the game's own `requestAnimationFrame` loop runs and the bot only sets the inputs before each frame: slower (real time), but exercises the real loop, frame timing and audio. Default is **fast**: the bot calls `game.update(1/60)` itself, 300 steps per page evaluation, and lets one real frame render between batches (render errors still show up). |
| `--plans` | only these plans are drawn (names from `PLANS` or `CHAOS` in `bot.js`, e.g. `--plans roofShop,fuse`): to work on one route, or to replay the plan a finding came under (its `replayPlan`). |
| `--chaos` | every plan drawn is a chaos plan (see "Chaos mode"). `--chaos-share 0.3`: that share of the draws only. |
| `--root` | play another checkout's game (an old commit in a `git worktree`) with THIS bot and its detectors: to check a detector catches an old bug, or to bisect. |
| `--out` | the report folder (default `qa-report/<stamp>/`). |
| `--shots` | at most that many screenshots (default 8, one per finding kind, each costs a rendered frame or two). |
| `--quiet` | no progress lines (the summary only). |
| `--port` | first port tried for the tool's own static server (the next free one is taken). |
| `--keep-open` | at the end, leave the browser and server up (DevTools URL printed) until Ctrl+C. |

Exit code: **0** no `error` finding, **1** at least one, **2** the tool itself failed (no browser found, the page
never reached its title screen...). Ctrl+C once stops the run and still writes the report. The browser (its whole
process tree) and the server are always shut down; the browser profile is a temporary folder, removed at the end.
Set `QA_BROWSER` to a browser binary to use another one.

Files: `run.mjs` (CLI, browser session, report assembly), `checks.js` (the pure checks, trackers and plan scheduler,
injected first and unit-tested in tests/qachecks.test.mjs), `bot.js` (injected into the page as source text, never
imported by the game: the bot, its chaos plans and the in-page detectors), `report.mjs` (whole-run analyses, `report.md` /
`report.json`), `cdp.mjs` (browser / DevTools plumbing, shared with `tools/shot.mjs`).

## What the bot does

It drives the game only through `game.input` (held keys, one-shot presses, mouse position and buttons), like a
player, and reads `window.game` to decide:

- starts each session on a **plan** (`PLANS` in `bot.js`), drawn from a seeded shuffled deck so that every plan
  comes up as often as the others over a run, and draws another one after 40 s of free play while guards are left.
  A plan is a short list of steps (walk along the grid, walk straight where the grid sees furniture, push and press
  Space over a ladder / parapet / counter, pick a weapon up, open the trunk, smash a prop, wait), then free play in
  the plan's style. Level 1:

  | plan | what it does |
  |---|---|
  | `free` | nothing set: free play from the start |
  | `trunk` | E at the first parked car's tail, takes the tire iron |
  | `roof` | into the liquor store (its door broken open, over the counter), up its own ladder, across the roof, over the parapet into the back lot (a roll) |
  | `roofShop` | into the liquor store, up its ladder, over the parapet into the service alley |
  | `liquor` | breaks the shop's locked front door open, vaults the counter, takes the pistol, vaults back out |
  | `fuse` | the tire iron if the trunk still has it, then the bar's fuse box in the back lot, struck or shot until the power is cut |
  | `throw` | the knife dropped in the gap, then every blade it holds is thrown at a guard 45 to 170 px away |
  | `road` | `--god` only: stands in a traffic lane until a driver brakes and honks (drivers see a man in the road late, by design: he is nearly always run over) |
  | `jukebox` | E at the jukebox: turned up (its band, the guards around deaf to small noises) |
  | `alarm` | E at the fire alarm by the toilets' door: bell, sprinklers, a slick floor, the customers run |
  | `kegs` | strikes the kegs behind the counter a few seconds: beer floods the corner (runners slip, counted in the stats) |
  | `passage` | into the TV shop (its locked door forced, the alarm rings), E at the trapdoor, up under the rug in the back room |

  A `use: kind` step walks to the device spot of that kind (systems/Uses.js) and presses E there.

  `lab` and `street` have `free` and `throw` (and `road` in `--god` on the street); the lab also `jukebox`, `alarm`,
  `kegs`, `passage` and `fuse`. `level2a` (the car chase) has one plan, `chase`: see "At the wheel" below. A plan
  that breaks (no path,
  timeout, the weapon gone) is a `plan-failed` warning; a plan left on the roof is followed by a way down (`offRoof`);
- keeps off what burns: its paths cost a long detour through a tile with fire in it, or with petrol the fire is
  coming to (`world.fireSpread.hot`); it still dies in a fire that closes on it (the tutorial, without `--god`);
- picks a goal and walks there along the guards' own grid path-finding (`engine/nav/Pathfinding.js`): the nearest
  living guard, a weapon on the floor (a loaded gun first when it has none), rounds on the floor, the car trunk, a
  door (to the cell past it), a window (it squares up and jumps through), a prop to strike or shoot for a few seconds
  (often when no guard is left), a random walkable cell, the exit once the level is cleared; re-plans every 2 s
  (0.6 s when chasing a guard). A goal behind a locked door is planned through it and the door is kicked / struck /
  shot open on the way. Furniture is not in the grid: when it makes no headway it presses Space (vault), then
  sidesteps, then gives the goal up. It waits on the kerb while a car comes down the lane it is about to step into;
- aims at the nearest guard in sight (knocked ones first), strikes in reach, fires guns once on target and within a
  sensible range (360 px, 210 with a shotgun; it holds its ground closer in), half the time creeps up behind an
  unaware guard for a takedown, finishes downed guards (left click), slides now and then, picks things up (E), opens the
  trunk, throws its weapon sometimes, reloads when it can. On a plan it only fights a guard who is on to it;
- handles the intro, gets up at the start (the player starts seated), restarts after death (R) and after the
  results screen (R), starts over when a session goes nowhere (5 game minutes, no kill for a minute), and a minute
  after clearing a level that has no exit (lab, street).

## At the wheel (level 2A)

`npm run qa -- --level level2a`: he drives the whole level (systems/Drive.js), so while `world.drive.on` the bot
does not walk (`playChase` in `bot.js`, its numbers in `CHASE_BOT`): it turns the wheel (W / S) toward a lane picked on
a slow random cycle (1.5 to 4 s each), one time in five toward a sidewalk instead, held 2.5 s into the building fronts
(where the car got caught); a told lorry is read as a player would (its way round, the bone arrows: its `gap`, held
until its tail is passed, no shove away from it) and a told toll sends it down a wooden lane (Toll.guide); SPACE aimed
at a pursuer alongside (within 70 px along the road, 45 to 120 px across);
else the Uzi held on the windscreen of the nearest pursuer still driven within 420 px and inside the gun's arc
(`drive.gun.aimAt`). It dies (a told shot, nose-on into a wall, the lorry), restarts with R, and plays the road again
to the TO BE CONTINUED card and the results. The detectors made for walking stay off at the wheel: `in-wall` for him
(he is carried in his seat), `prop-in-wall` (what the car throws aside lands against the fronts), `softlock` (no
guards: `enemiesLeft` is 0 from the start), `unreachable-item`; every `not-covered` feature but `exit` is "not in this
level". `stalled` is its own. The statistics add a line: shoves, bursts, stalls, the pursuers' men killed by how
their car was stopped (`how.car`). The deaths name the cell he died in at the wheel (the bot's last actions).

## Findings

Each finding is `{ kind, severity, sig, t, session, plan, chaos, pos, detail, lastActions, count, replay, replayPlan }`:
`t` is run time (game s since the start of the run), `worldT` the time inside that session's level, `plan` the plan
the bot was on (`chaos`: a chaos plan; `replayPlan`: the run narrowed to it), `lastActions` the bot's last ten actions, and
repeats of the same `kind` + `sig` are counted, not stored again. One screenshot per kind is taken at its first
occurrence (fast mode puts the camera on the spot and rings it in red).

| kind | severity | meaning |
|---|---|---|
| `exception` | error | uncaught exception, unhandled rejection, `console.error`, a browser error log line, an error thrown by `game.update` (fast mode), every error a `safeDraw` swallows (`render: ...`), a page crash. `detail.stack` has the stack. |
| `nan` | error | a non-finite position or velocity on the player, a guard, a civilian, a prop, an item, ammo, debris or a corpse part. |
| `in-wall` | error | the player's, a living guard's, a civilian's or a crawling dying guard's (`crawler`) centre inside a solid tile for more than 0.2 s while not vaulting (single-step contacts are only counted in the stats). |
| `lasting-dead` | error | a `lasting` prop (ladder, parapet: it closes a gap in a wall) destroyed or removed. `detail.lastHit` is the last blow it took. |
| `power-lit` | error | 1.5 s after the bar's power cut (`powerCut`), a prop on the cut mains (`world.power.wired`, or any lamp inside the power zone but the battery `standby` ones) still has `lightsOut` false. |
| `unstick` | error | `player.unstick()` (the last-resort teleport out of a wall or a vehicle) actually moved the player: `detail.from` / `to`. |
| `out-of-map` | error | a living player or guard, or an item, outside the map rectangle (items: by more than 8 px; civilians: 16 tiles, they walk in from off the map). |
| `stalled` | error | at the wheel (level 2A): the drive on, he alive, the road not over, and the car under 25 % of its cruise speed for 2 s (a crash stops it dead: that is a death, not this). `sig`: what held it (the first solid contact when it started); `detail.then` / `now`: what touched the car then and 2 s later (sensor or not, depth, normal, where), its speed, angle and bounds. |
| `softlock` | error | `enemiesLeft === 0` but `world.cleared` false for 2 s; or cleared and no grid path from the player to the exit (not checked on a roof: its ways down are not in the grid); or the player stands in the exit of a cleared level and no results screen comes; or a fast batch never returned (`hang`). |
| `player-stuck` | warn | the bot pushed toward a waypoint for 3 s of game time (vault and sidestep tried) and moved under 8 px. `detail.front` lists what is right in front (props, doors, guards, windows, corpses), `detail.plan` the plan step. Often furniture the grid does not know: check the screenshot before blaming the game. |
| `plan-failed` | warn | a plan's step could not be done (`sig`: plan, step, why: no path, timeout, gave up the way, weapon taken...). A route of the level that no longer works (a ladder that does not take him, a counter he cannot vault) shows here first. |
| `guard-stuck` | warn | a guard whose `travel()` is being called toward a spot more than 40 px away has not moved 6 px in 6 s. `detail` has his state, tactic, target, remaining path, door / gate waits and what is in front of him. |
| `leak` | warn | a count (physics bodies, debris, particles, corpses, items, texts, projectiles) or the JS heap that keeps climbing through a session past a sensible cap, sampled every 10 s of game time (`detail.series`); or the heap at session starts rising run after run (`heap-across-sessions`). |
| `slow` | warn | fast mode: one `game.update` step over 50 ms (`worst-step`, with the physics share) or a mean step over 6 ms; realtime: `game.perf` mean update over 6 ms or a frame over 50 ms (the first 3 s are ignored). |
| `audio` | warn | the audio context is not `running` after the click, or (realtime only: fast mode squeezes game time) 40 active voices, the mixer's hard cap. |
| `pose` | error | a character's drawn pose (Character `pose`: torso, hands, feet, weapon; his `facing` layers) has a non-finite number, a scale out of [0.6, 1.5], or a torso over 20 pose px off his body (`sig` who:field, `detail.moves` what he was in, a door hand's fields). Checked on every real frame and on a probe: ten characters drawn every half second into a 2 x 2 canvas. |
| `draw-scale` | error | a standing character drawn at under 0.8 or over 1.4 x his expected size (BODY_SCALE x the camera's zoom and scale), from the transform his draw is entered with (a crouch's shrink included, the pose's own squash left to `pose`). |
| `camera` | error | at a level start the camera scale is not the level's default (1 off the tutorial) or the zoom not the window's; a NaN; the player out of the picture for 1 s (not in a staged shot of the tutorial). |
| `stuck-anim` | error | the player locked in a finisher, a takedown, a kick, a vault (a roll included), a trunk or a passage longer than 1.5 x its length from the data (data/finishers.js `lockTime`, systems/Takedown.js `lockedFor`, data/feel.js, the passage's config) + 1 s. |
| `ghost` | error | a dead character who speaks (`speak`, a guard's `say`), steers himself, or a guard in combat whose target is a dead man. |
| `prop-in-wall` | error | a loose prop's centre inside a wall tile or a solid prop it collides with for over 1 s. |
| `vehicle-shoved` | error | a car that stood still 2 s moves over 6 px within 3 s while only people on foot touch it (no driver, blast, round or blow on it within 2 s, no other car against it). |
| `unreachable-item` | error | a weapon at rest that the player cannot get within pick-up reach of (inside a wall, a counter, under a car) for 1.5 s. |
| `sound-missing` | warn | a sound name played that src/audio/Audio.js has nothing for (its GUNS / FOLEY / ALIAS tables and recipes, Foley.js RECIPES): it plays nothing. |
| `door-state` | error | a door leaf NaN, past its stop, off its hinge, or locked with somebody standing in its leaf. |
| `civ-stuck` | error | a civilian fleeing or hiding, his way not done, who has not moved 6 px in 4 s; or one at the end of his way still in the world 4 s later (`done-lingering`). |
| `corpse-drift` | error | a body that still moves (over 1 px or 0.08 rad every sixth of a second, three times running) 5 s after death, or that turned over 150 degrees on itself (`spun`: from 1 s; from 0.3 s for a man slammed on a table, a counter, a crate), with no blast, car, round or man pushing it. |
| `loiter-provoked` | error | chaos `bouncerStare`: a guard got worked up (a challenge, a fight) at the unarmed player standing still on public ground in front of the doorman. `detail.said` has the guards' words. |
| `not-covered` | warn | runs of 5 game minutes and more: a feature never exercised (see the coverage list below), unless the level has nothing for it (no ladder, no fuse box, no traffic, no exit...: listed in the report as "not in this level"). Either the bot cannot reach it or the game no longer offers it. |

Coverage counters: `vault` (furniture, a hood), `windowDive` / `windowVault` (through a whole / broken pane),
`climb` (a gate, a fence), `ladderUp` / `ladderDown`, `roofDrop` (over a parapet), `roll` (the landing of a drop),
`slide`, `takedown`, `finisher`, `trunk`, `doorOpened`, `doorBreached` (a locked door forced), `weaponBroken`,
`pickup`, `throw`, `thrownKill` (a thrown blade kills, `how.thrown`), `reload`, `gunKill`, `meleeKill`, `powerCut`, `deviceUse` (E at a
device of the level; the report lists which, and the falls on a slick floor),
`horn` (a held-up driver, heard through `world.sound`), `dyingCrawl` / `dyingCurl` / `dyingSpasm` / `dyingThroat`
(how a guard dies on the floor, `Ragdoll.dying`; plain throes are only counted in the stats), `clear`, `exit` (the
results screen).

What the bot cannot cover on level 1, and why: `reload` needs rounds on the floor, and level 1 has no ammunition box
and no spare magazine on a dead guard: the only rounds are the partial magazine a guard with a gun drops when he
reloads early out of sight (`Enemy.needsReload`), rare; the bot goes for any it sees (the report counts "ammunition
seen on the floor"). `horn` only in `--god` (the `road` plan) or by chance while crossing. The lab covers `reload`.

The statistics also count the AI at work (`aiCheck`, the game's 'challenge' and 'heldUp' events): guards entering a
fight, a guard in a fight getting within reach of the player, guards held 3 s on one spot on their way (a softer
`guard-stuck`), the words had with the player by act and by the stage they reached (0 on his way .. 4 the fight), and
the drivers held up at gunpoint by what they did.

## Chaos mode

`--chaos` (or a share of the draws with `--chaos-share x`) draws the session plans from `CHAOS` in `bot.js`: the
tester trying to break the game. Each is a short scripted abuse (some take the controls over, the others are laid
over the bot's free play), seeded from the run's seed, the session and its name, so a replay goes the same way;
then free play. The findings carry the plan's name.

| plan | the abuse |
|---|---|
| `mashMoves` | attack, throw, Space, E, R hammered during a takedown, a finisher, a kick, a slide, a vault, a reload, a trunk |
| `pauseMash` | Escape in slow motion, under a kill banner, in a takedown or a finisher; held paused up to half a second |
| `restartMash` | Backspace in slow motion or in a finisher |
| `dieInExecution` | does not walk out of a finisher; the nearest guard shoots (or strikes) him dead in it (dies even in `--god`) |
| `throwAtWall` | the weapon in hand thrown at a wall point blank, picked up, six times |
| `vaultCorner` | Space at 45 degrees into the corners of tables, counters, crates |
| `slideInto` | a run and a slide into door leaves, the curtain, cars (then pushing at the car) |
| `shoveCar` | a car walked into side on for 4 s: one of the traffic stopped for him in its lane (invulnerable for it), else a parked one shot loose first |
| `doorCamp` | in a doorway, in and out across it, E now and then |
| `curtainRun` | through the VIP curtain and back ten times |
| `shoveFurniture` | loose furniture pushed into doorways |
| `emptyIntoProp` | a gun (picked up first) emptied into one prop, reloaded, emptied again |
| `bouncerStare` | level 1: three minutes unarmed and still in front of the doorman on public ground (`loiter-provoked`) |
| `pickDrop` | a weapon picked up and dropped at his feet fifty times |
| `deviceMash` | E hammered at every device (jukebox, alarm, trapdoors...) |
| `darkFight` | level 1, lab: the fuse box broken, then a fight in the dark |
| `roofFight` | level 1: a guard provoked, then up the fire escape onto the roof to fight there |
| `tutorialFire` | tutorial: straight into the fire |
| `menuMash` | keys and clicks at the pause menu, then the title (`game.toTitle`), then the opening cinematic |
| `monkey` | seeded random keys, aim and clicks for a minute |

In a chaos run the bot also mashes keys at the results screen and on the death screen before restarting.

## Cost

The report's "Bot overhead" line gives the bot's cost against the game's: ms per step of `game.update` and of the
bot (its brain and every check; the deeper checks, the pose probes and the draw wraps apart) and its share of the
step time (about 4 to 8 %). A 3 game minute level 1 run takes about 30 s real on an idle machine.

## The report

`qa-report/<yyyymmdd-hhmmss>/` (ignored by git):

- `report.md`: result line, the replay command, a table of findings (severity, kind, signature, count, first
  occurrence, screenshot), the first occurrence of each with its details, stack and the bot's last actions, then
  statistics: sessions, deaths by cause and killer, clears (score, grade, time, the results lines), kills by style, kill tags, weapons,
  how far the bot got (most guards killed in a session), feature coverage, how the dead went (crawl, curl, spasm,
  throat, throes), plans (started / done / cut short by a death / skipped as pointless, and where each failed), speed, the
  bot's state at the end;
- `report.json`: the same, machine readable, plus every leak sample, the per-session summaries (kills, cause of
  death, cleared, the plans of the session) and the perf samples;
- `NN_<kind>.png`: one screenshot per finding kind;
- `browser.log`: the page console and the browser log, time-stamped in real seconds since the start.

**How an agent should read it**: start with `report.md` (the result line and the findings table tell whether
anything is wrong and what), then the `findings` array of `report.json` for full details (`detail.stack` for
exceptions, `detail.front` for stuck characters, `detail.series` for leaks), then open the screenshot of each
kind, and `browser.log` for the context of an exception. Errors are game bugs to fix (or a tool bug: an error
whose stack goes through `bot.js` is the tool's); warnings are leads to check. Re-run with the printed replay
command to see whether a fix holds.

## Replaying a seed

The replay command is printed at the end and written in the report (same seed, level, minutes and mode). The bot's
decisions and the game's `Math.random` are seeded, and fast mode renders at fixed points, so a replay goes the same
way for a long while; it is not bit-exact (audio voice admission and the music clock depend on real time, and other
agents may have changed the game since). A finding that does not come back on a replay is still worth a look at its
first-occurrence details.

## Screenshot / scenario harness

`npm run shot -- <scenario.json> <outdir> [--port n]` runs a scripted scenario (waits, clicks, keys, page
evaluations, screenshots) in the same headless browser: the format and an example are documented at the top of
`tools/shot.mjs`.

## Background runner (`npm run qa:watch`)

```
npm run qa:watch -- [--minutes 2.5] [--levels tutorial,level1,lab] [--seed n] [--chaos-every 2] [--runs n]
  [--for minutes] [--keep-all] [--db file] [--bisect [--good sha] [--bisect-max 8]]
```

`tools/qa/watch.mjs` plays short runs of `run.mjs` one after the other, endlessly by default, and keeps only what
is new. One run at a time (one browser), each a child process under `nice -n 15` on Linux / macOS (normal
priority on Windows), in fast mode with `--quiet --shots 4`. Below Node 22 it adds `--experimental-websocket` for
the child itself.

| option | meaning |
|---|---|
| `--minutes` | game minutes a run (default 2.5). |
| `--levels` | levels in turn (default `tutorial,level1,lab`); tutorial runs add `--god` (the bot must reach the window). |
| `--seed` | first seed; each run takes the next one (default: a number from the clock, printed at the start). |
| `--chaos-every` | about one run in n is `--chaos`, each level taking its turn (default 2; 0 never). |
| `--runs` / `--for` | stop after n runs / after that many real minutes (checked between runs). Default: until Ctrl+C. |
| `--keep-all` | keep every run folder (default: only the runs that brought a new finding). |
| `--db` | the database file (default `qa-report/watch-db.json`). |
| `--bisect` | for each NEW `error`: replay it, then search the commit that brought it (below). |
| `--good` / `--bisect-max` | the known-good commit to search from / the most runs a search may cost (default 8). |

Files (all in `qa-report/`, ignored by git):

- `watch.md`: the log a human or an agent reads: ONLY findings never seen before, one block each (local time,
  severity, kind, signature, level, seed, plan, chaos or normal, commit and `dirty`, the replay command, the
  screenshot and report of the run), the `--bisect` result under it, and each distinct tool failure once.
- `watch-db.json`: every finding ever seen, deduped by kind + `normSig` (tools/qa/findings-db.mjs: positions `@x,y`,
  coordinate pairs, ids glued to words, decimals and long numbers taken out; exceptions keep their first line with
  every number as `#`), with its first and latest run, counts (`runs`, `hits`), per-level counts; the latest 500
  runs; `good[level]`: the commit of the latest complete run of that level with no error finding (`goodDirty`
  when the working tree had uncommitted changes then).
- `watch/<stamp>-<level>-<seed>[-chaos]/`: the run folders (report, screenshots, browser.log, `run.log` the child's
  output). A run that brought nothing new is deleted.

The terminal gets one line a run (`[watch] run 12 level1 seed 1012 chaos: PASS, 3 findings (0 new), 41 s`) and the
new findings. The commit under test is read with `git rev-parse HEAD` / `git status --porcelain` before each run:
the runner only READS the checkout, it plays whatever the working tree holds. A tool failure (exit 2: no
browser, the page never loaded, the bot threw) is logged once per message and the runner waits 30 s.

Ctrl+C (or SIGTERM): the running child gets a SIGINT and writes its report (its findings are merged), then the
database is saved and a summary printed (runs, new findings this session); a child still there after 20 s is killed
with its whole process group (browser included). A second Ctrl+C quits at once (same cleanup). Exit code 0.

### `--bisect`

For a new finding of severity `error`:

1. it is replayed twice with the same level, seed, minutes, chaos and god (at the working tree). A reproduction is a
   finding of the same kind and normalised signature, else of the same kind only (said so: "by kind only"). Not
   reproduced: no search.
2. the range is `git rev-list --first-parent --reverse <good>..HEAD`, good being `--good` or `good[level]` from the
   database (none known, or nothing between: no search, said why). Commits are tested in a TEMPORARY worktree
   (`git worktree add --detach` in the system temp folder, then `git -C <tmp> checkout --detach --force <sha>`), by
   running this checkout's `run.mjs --root <tmp>`: today's bot and detectors against that commit's game. When the
   working tree is dirty, HEAD is tested there first: a bug that does not show at HEAD is in the uncommitted changes
   ("uncommitted"). Then a binary search; a commit is bad when the finding shows in any of 2 tries, so a flaky
   finding can be called good by mistake (the result says so). `--bisect-max` caps the runs of the search (the
   2 replays not counted); when it runs out the result gives the range left.
3. the result goes under the finding in `watch.md` and into the entry's `bisect` field in the database.

Safety: no `git bisect`, no checkout, reset or stash in the main checkout; only `git worktree add/remove/prune`
touch the repository's worktree list, and the temporary worktree is always removed (`finally`, and on Ctrl+C).
A commit whose game cannot be played by today's bot (tool failure) stops the search with the range left.
