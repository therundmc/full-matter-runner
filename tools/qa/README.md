# QA robot (`npm run qa`)

A robot plays the game in a headless browser (Edge, or Chrome) for a span of **game time**, watches the
simulation for problems and writes a report that an agent or the developer can read.

```
npm run qa -- [--minutes 10] [--seed 1] [--level level1] [--god] [--realtime] [--port 8123] [--keep-open]
```

| option | meaning |
|---|---|
| `--minutes` | game time to cover (default 10). Fast mode does ten game minutes in well under a minute. |
| `--seed` | seeds the bot's decisions and the game's `Math.random` (see "Replaying a seed"). |
| `--level` | level id (`level1`, `lab`, `street`), as `?level=` in the URL. |
| `--god` | the player is invulnerable (`player.invulnerable`) after each restart: long sessions deep into the level. |
| `--realtime` | the game's own `requestAnimationFrame` loop runs and the bot only sets the inputs before each frame: slower (real time), but exercises the real loop, frame timing and audio. Default is **fast**: the bot calls `game.update(1/60)` itself, 300 steps per page evaluation, and lets one real frame render between batches (render errors still show up). |
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

- picks a goal and walks there along the guards' own grid path-finding (`engine/nav/Pathfinding.js`): the nearest
  living guard, a weapon on the floor (a loaded gun first when it has none), the car trunk, a door (to the cell past
  it), a window (it squares up and jumps through), a random walkable cell, the exit once the level is cleared;
  re-plans every 2 s (0.6 s when chasing a guard). A goal behind a locked door is planned through it and the door
  is kicked / struck / shot open on the way. Furniture is not in the grid: when it makes no headway it presses
  Space (vault), then sidesteps, then gives the goal up;
- aims at the nearest guard in sight (knocked ones first), strikes in reach, fires guns (clicks, or holds for
  automatic ones), half the time creeps up behind an unaware guard for a takedown, finishes downed guards (Space),
  slides now and then, picks things up (E), opens the trunk, throws its weapon sometimes, reloads when it can;
- handles the intro, gets up at the start (the player starts seated), restarts after death (R) and after the
  results screen (R), and starts over when a session goes nowhere (5 game minutes, no kill for a minute).

## Findings

Each finding is `{ kind, severity, sig, t, session, pos, detail, lastActions, count }`: `t` is run time (game s since
the start of the run), `worldT` the time inside that session's level, `lastActions` the bot's last ten actions, and
repeats of the same `kind` + `sig` are counted, not stored again. One screenshot per kind is taken at its first
occurrence (fast mode puts the camera on the spot and rings it in red).

| kind | severity | meaning |
|---|---|---|
| `exception` | error | uncaught exception, unhandled rejection, `console.error`, a browser error log line, an error thrown by `game.update` (fast mode), every error a `safeDraw` swallows (`render: ...`), a page crash. `detail.stack` has the stack. |
| `nan` | error | a non-finite position or velocity on the player, a guard, a civilian, a prop, an item, ammo, debris or a corpse part. |
| `in-wall` | error | the player's, a living guard's or a civilian's centre inside a solid tile for more than 0.2 s while not vaulting (single-step contacts are only counted in the stats). |
| `unstick` | error | `player.unstick()` (the last-resort teleport out of a wall or a vehicle) actually moved the player: `detail.from` / `to`. |
| `out-of-map` | error | a living player or guard, or an item, outside the map rectangle (items: by more than 8 px; civilians: 16 tiles, they walk in from off the map). |
| `softlock` | error | `enemiesLeft === 0` but `world.cleared` false for 2 s; or cleared and no grid path from the player to the exit; or the player stands in the exit of a cleared level and no results screen comes; or a fast batch never returned (`hang`). |
| `player-stuck` | warn | the bot pushed toward a waypoint for 3 s of game time (vault and sidestep tried) and moved under 8 px. `detail.front` lists what is right in front (props, doors, guards, windows, corpses). Often furniture the grid does not know: check the screenshot before blaming the game. |
| `guard-stuck` | warn | a guard whose `travel()` is being called toward a spot more than 40 px away has not moved 6 px in 6 s. `detail` has his state, tactic, target, remaining path, door / gate waits and what is in front of him. |
| `leak` | warn | a count (physics bodies, debris, particles, corpses, items, texts, projectiles) or the JS heap that keeps climbing through a session past a sensible cap, sampled every 10 s of game time (`detail.series`); or the heap at session starts rising run after run (`heap-across-sessions`). |
| `slow` | warn | fast mode: one `game.update` step over 50 ms (`worst-step`, with the physics share) or a mean step over 6 ms; realtime: `game.perf` mean update over 6 ms or a frame over 50 ms (the first 3 s are ignored). |
| `audio` | warn | the audio context is not `running` after the click, or (realtime only: fast mode squeezes game time) 40 active voices, the mixer's hard cap. |
| `not-covered` | warn | runs of 5 game minutes and more: a feature never exercised (vault, window dive / vault, climb, slide, takedown, finisher, trunk, door opened / breached, weapon broken, pick-up, throw, reload, gun kill, melee kill, clear, exit). Either the bot cannot reach it or the game no longer offers it (level 1 has no spare ammo, so `reload` stays uncovered there). |

## The report

`qa-report/<yyyymmdd-hhmmss>/` (ignored by git):

- `report.md`: result line, the replay command, a table of findings (severity, kind, signature, count, first
  occurrence, screenshot), the first occurrence of each with its details, stack and the bot's last actions, then
  statistics: sessions, deaths by cause and killer, clears (score, grade, time), kills by style, kill tags, weapons,
  how far the bot got (most guards killed in a session), feature coverage, speed, the bot's state at the end;
- `report.json`: the same, machine readable, plus every leak sample, the per-session summaries and the perf samples;
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
