# QA robot (`npm run qa`)

A robot plays the game in a headless browser (Edge, or Chrome) for a span of **game time**, watches the
simulation for problems and writes a report that an agent or the developer can read.

```
npm run qa -- [--minutes 10] [--seed 1] [--level level1] [--god] [--realtime] [--plans a,b] [--port 8123] [--keep-open]
```

| option | meaning |
|---|---|
| `--minutes` | game time to cover (default 10). Fast mode does ten game minutes in well under a minute. |
| `--seed` | seeds the bot's decisions and the game's `Math.random` (see "Replaying a seed"). |
| `--level` | level id (`level1`, `lab`, `street`), as `?level=` in the URL. |
| `--god` | the player is invulnerable (`player.invulnerable`) after each restart: long sessions deep into the level. |
| `--realtime` | the game's own `requestAnimationFrame` loop runs and the bot only sets the inputs before each frame: slower (real time), but exercises the real loop, frame timing and audio. Default is **fast**: the bot calls `game.update(1/60)` itself, 300 steps per page evaluation, and lets one real frame render between batches (render errors still show up). |
| `--plans` | only these plans are drawn (names from `PLANS` in `bot.js`, e.g. `--plans roofShop,fuse`): to work on one route. |
| `--port` | first port tried for the tool's own static server (the next free one is taken). |
| `--keep-open` | at the end, leave the browser and server up (DevTools URL printed) until Ctrl+C. |

Exit code: **0** no `error` finding, **1** at least one, **2** the tool itself failed (no browser found, the page
never reached its title screen...). Ctrl+C once stops the run and still writes the report. The browser (its whole
process tree) and the server are always shut down; the browser profile is a temporary folder, removed at the end.
Set `QA_BROWSER` to a browser binary to use another one.

Files: `run.mjs` (CLI, browser session, report assembly), `bot.js` (injected into the page as source text, never
imported by the game: the bot and the in-page detectors), `report.mjs` (whole-run analyses, `report.md` /
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
  | `roof` | up the fire escape at the street corner, across the liquor store roof, over the parapet into the back lot (a roll) |
  | `roofShop` | fire escape, down the shop's own ladder, the pistol behind the counter, back up, over the parapet into the service alley |
  | `liquor` | breaks the shop's locked front door open, vaults the counter, takes the pistol, vaults back out |
  | `fuse` | the tire iron if the trunk still has it, then the bar's fuse box in the back lot, struck or shot until the power is cut |
  | `throw` | the knife dropped in the gap, then every blade it holds is thrown at a guard 45 to 170 px away |
  | `road` | `--god` only: stands in a traffic lane until a driver brakes and honks (drivers see a man in the road late, by design: he is nearly always run over) |
  | `jukebox` | E at the jukebox: turned up (its band, the guards around deaf to small noises) |
  | `alarm` | E at the fire alarm by the toilets' door: bell, sprinklers, a slick floor, the customers run |
  | `kegs` | strikes the kegs behind the counter a few seconds: beer floods the corner (runners slip, counted in the stats) |
  | `passage` | into the TV shop (its locked door forced, the alarm rings), E at the trapdoor, up under the rug in the back room |

  A `use: kind` step walks to the device spot of that kind (systems/Uses.js) and presses E there.

  `lab` and `street` have `free` and `throw` (and `road` in `--god` on the street). A plan that breaks (no path,
  timeout, the weapon gone) is a `plan-failed` warning; a plan left on the roof is followed by a way down (`offRoof`);
- picks a goal and walks there along the guards' own grid path-finding (`engine/nav/Pathfinding.js`): the nearest
  living guard, a weapon on the floor (a loaded gun first when it has none), rounds on the floor, the car trunk, a
  door (to the cell past it), a window (it squares up and jumps through), a prop to strike or shoot for a few seconds
  (often when no guard is left), a random walkable cell, the exit once the level is cleared; re-plans every 2 s
  (0.6 s when chasing a guard). A goal behind a locked door is planned through it and the door is kicked / struck /
  shot open on the way. Furniture is not in the grid: when it makes no headway it presses Space (vault), then
  sidesteps, then gives the goal up. It waits on the kerb while a car comes down the lane it is about to step into;
- aims at the nearest guard in sight (knocked ones first), strikes in reach, fires guns once on target and within a
  sensible range (360 px, 210 with a shotgun; it holds its ground closer in), half the time creeps up behind an
  unaware guard for a takedown, finishes downed guards (Space), slides now and then, picks things up (E), opens the
  trunk, throws its weapon sometimes, reloads when it can. On a plan it only fights a guard who is on to it;
- handles the intro, gets up at the start (the player starts seated), restarts after death (R) and after the
  results screen (R), starts over when a session goes nowhere (5 game minutes, no kill for a minute), and a minute
  after clearing a level that has no exit (lab, street).

## Findings

Each finding is `{ kind, severity, sig, t, session, pos, detail, lastActions, count }`: `t` is run time (game s since
the start of the run), `worldT` the time inside that session's level, `lastActions` the bot's last ten actions, and
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
| `softlock` | error | `enemiesLeft === 0` but `world.cleared` false for 2 s; or cleared and no grid path from the player to the exit (not checked on a roof: its ways down are not in the grid); or the player stands in the exit of a cleared level and no results screen comes; or a fast batch never returned (`hang`). |
| `player-stuck` | warn | the bot pushed toward a waypoint for 3 s of game time (vault and sidestep tried) and moved under 8 px. `detail.front` lists what is right in front (props, doors, guards, windows, corpses), `detail.plan` the plan step. Often furniture the grid does not know: check the screenshot before blaming the game. |
| `plan-failed` | warn | a plan's step could not be done (`sig`: plan, step, why: no path, timeout, gave up the way, weapon taken...). A route of the level that no longer works (a ladder that does not take him, a counter he cannot vault) shows here first. |
| `guard-stuck` | warn | a guard whose `travel()` is being called toward a spot more than 40 px away has not moved 6 px in 6 s. `detail` has his state, tactic, target, remaining path, door / gate waits and what is in front of him. |
| `leak` | warn | a count (physics bodies, debris, particles, corpses, items, texts, projectiles) or the JS heap that keeps climbing through a session past a sensible cap, sampled every 10 s of game time (`detail.series`); or the heap at session starts rising run after run (`heap-across-sessions`). |
| `slow` | warn | fast mode: one `game.update` step over 50 ms (`worst-step`, with the physics share) or a mean step over 6 ms; realtime: `game.perf` mean update over 6 ms or a frame over 50 ms (the first 3 s are ignored). |
| `audio` | warn | the audio context is not `running` after the click, or (realtime only: fast mode squeezes game time) 40 active voices, the mixer's hard cap. |
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

## The report

`qa-report/<yyyymmdd-hhmmss>/` (ignored by git):

- `report.md`: result line, the replay command, a table of findings (severity, kind, signature, count, first
  occurrence, screenshot), the first occurrence of each with its details, stack and the bot's last actions, then
  statistics: sessions, deaths by cause and killer, clears (score, grade, time), kills by style, kill tags, weapons,
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
