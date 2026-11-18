---
name: qa
description: Make the QA robot play FULL MATTER RUNNER in a headless browser and read its report. Use after a
  gameplay, AI, physics or level change, when hunting a crash / stuck guard / softlock / leak / slow frame, or when
  the user asks "does it still play". Picks level, seed, --god and --plans from what changed, triages the findings,
  gives the replay command and compares with the previous run of the same level to spot a regression.
---

# qa: let the robot play, then read what it saw

Full reference: tools/qa/README.md (options, plans, detectors, report format). Read it the first time.

## 1. Choose the run

```
npm run qa -- --minutes <m> --level <id> [--seed n] [--god] [--plans a,b] [--realtime]
```

| what changed | options |
|---|---|
| level 1 layout, guards, doors, AI | `--level level1 --minutes 5`, then a second seed |
| one route (roof, trunk, fuse, liquor...) | `--plans <names from PLANS in tools/qa/bot.js>` |
| something deep in a level, the bot dies early | add `--god` |
| tutorial | `--level tutorial --god` to reach the window |
| props / physics / reload | `--level lab` |
| traffic, passers-by | `--level street` |
| audio voices, frame timing, the real loop | `--realtime` (slow: real time) |
| input handling, menus, pause, restarts, edge cases | `--chaos` (chaos plans only) or `--chaos-share 0.3`; one plan: `--chaos --plans monkey` |
| does a detector catch an old bug | `--root <a git worktree of the old commit>`: today's bot on that game |

Reuse the seed of the run you compare with (the latest reports used `--seed 5`). Levels: tutorial, level1, lab,
street (src/game/data/levels/index.js). Exit code: 0 no error, 1 errors, 2 the tool itself failed.

## 2. Read the report

`qa-report/<yyyymmdd-hhmmss>/`, newest folder:
1. `report.md`: result line, replay command, findings table (severity, kind, signature, count, first at).
2. For each finding kind: its first occurrence in report.md, then `findings[]` in `report.json`
   (`detail.stack` exceptions, `detail.front` stuck characters, `detail.series` leaks), its `NN_<kind>.png`,
   and `browser.log` around that time.
3. Statistics: coverage counters at 0 that should not be (see "What the bot cannot cover" in the README),
   plans failing at the same step, deaths by cause, speed line.

## 3. Triage

- error: a game bug to fix, unless its stack goes through `bot.js` (a tool bug).
- each finding names the `plan` it came under (chaos plans marked); `replayPlan` replays the run on that plan alone.
- the drawn picture is checked too: `pose` (NaN or wild pose numbers: a man drawn as his feet), `draw-scale` (drawn
  too small / big), `camera`; then `stuck-anim`, `ghost`, `prop-in-wall`, `vehicle-shoved`, `unreachable-item`,
  `door-state`, `civ-stuck`, `corpse-drift`, `loiter-provoked`, `sound-missing` (README table).
- warning: a lead; check it, say whether it is real.
- not covered: expected (README list) or a sign the route is broken.

## 4. Compare with the previous run

```
node .claude/skills/qa/compare.mjs              (newest run vs the previous one of the same level)
node .claude/skills/qa/compare.mjs <new> <old>  (two given qa-report/<stamp> folders)
```

It prints NEW / gone findings, coverage counters that fell to half or less, kills / clears / deaths and both speed
lines. Regression = a NEW error, a coverage drop on a feature the change touched, or a clearly slower mean or worst
step. Different seeds or minutes: counts are indicative only, re-run with the old options to be sure.

## 5. Report to the user (in French)

```
QA level1, 5 min, seed 5: PASS | FAIL (qa-report/<stamp>/report.md)
- erreurs: <kind> x<n>: <one line cause>  (capture NN_<kind>.png)
- avertissements: ...
- regression vs <old stamp>: none | <list>
- rejouer: npm run qa -- --minutes 5 --seed 5 --level level1
```

A replay is not bit-exact (audio admission and the music clock follow real time): a finding that does not come
back is still worth reading in its first-occurrence details.

## 6. In the background

```
npm run qa:watch                                  (endless: tutorial, level1, lab in turn, 2.5 min runs, Ctrl+C stops)
npm run qa:watch -- --runs 6 --levels level1      (a bounded batch)
npm run qa:watch -- --bisect [--good <sha>]       (and search the commit behind each new error)
```

Short runs one at a time, niced, seeds counting up, every second run `--chaos`. Read `qa-report/watch.md`: only
findings never seen before (deduped by kind + signature without positions / numbers), each with its replay command,
screenshot and commit; counts of known ones are in `qa-report/watch-db.json`; run folders that brought something new
stay in `qa-report/watch/`. Triage a new entry as in section 3, replay it with its command. `--bisect` replays a new
error twice, then binary-searches `good..HEAD` in a temporary git worktree (never touches the main checkout, always
removed); the result follows the entry ("first bad commit <sha>", "uncommitted", "not reproduced", or the range
left when `--bisect-max` runs out). Options and details: tools/qa/README.md, "Background runner".
