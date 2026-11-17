---
name: check
description: Pre-commit guard for FULL MATTER RUNNER. Use before proposing or making any commit, after a subagent
  hands work back, or when the user asks whether the working tree is clean to commit. Runs the unit tests, checks the
  diff is ASCII, catches hand-edited generated files, runs the QA robot when gameplay or a level moved, and gives a
  short OK / KO verdict. It never commits.
---

# check: is the working tree fit to commit?

Run every step even when an early one fails, then give one verdict. Do not fix anything here, do not commit,
do not `git add`.

## 1. Unit tests

```
npm test
```

Read the summary lines (`# pass`, `# fail`). Any `not ok` is a KO: note the test name and file.
If one failure looks random, re-run once; if it passes, report it as flaky, not as OK.

## 2. ASCII diff and generated files

```
node .claude/skills/check/check.mjs
```

It reads `git diff HEAD` (staged and unstaged) and the untracked files (`git ls-files --others --exclude-standard`),
skipping `.claude/worktrees/`, and reports:
- `non-ASCII`: an added line with a byte above 127 (accents, typographic quotes, dashes, arrows). Source, comments
  and docs stay ASCII.
- `generated`: an output changed while its generator did not:

| output | generator |
|---|---|
| src/game/data/levels/level1.js | tools/build_level1.py (+ tools/levelkit.py) |
| src/game/data/levels/lab.js | tools/build_lab.py (+ levelkit) |
| src/game/data/levels/tutorial.js | tools/build_tutorial.py (+ levelkit) |
| src/audio/bank.js, assets/sound/foley.wav | tools/build_sounds.mjs, tools/sounds.json |
| assets/sprites/comic/** | tools/generate_comic.py or tools/comic/** |
| assets/sprites/** | tools/generate_assets.py |

A `generated` line is a KO unless regenerating gives the same file: run the generator (skill `regen`), then
`git diff --stat` on the output; if it differs from the working tree, the output was edited by hand.
(src/game/data/levels/street.js is hand-written: not a generated file.)

## 3. QA robot, only when gameplay or a level moved

Needed when the diff touches src/game/ (outside render/, ui/ and pure art), tools/build_*.py, tools/levelkit.py
or src/game/data/levels/. Not needed for docs, tests only, audio data, sprites only.

```
npm run qa -- --minutes 3 --level <level1|tutorial|lab|street>
```

Pick the level the change concerns (several: one run each). Exit code 0 = no error finding, 1 = errors,
2 = the tool failed (no browser...). Read `qa-report/<stamp>/report.md`: the result line and the findings table.
Errors are KO; warnings are listed as leads. For a deeper read use the `qa` skill.

## 4. Verdict

Answer in French, short:

```
check: OK            (or KO)
- npm test: 573/573
- ASCII: ok           | 2 lines: <file>: <excerpt>
- generated: ok       | level1.js changed without build_level1.py
- QA level1 3 min seed <n>: PASS, 0 finding | 1 error guard-stuck (qa-report/<stamp>)
```

Then the list of problems to fix, most serious first. Stop there: committing is the user's call.
