---
name: bugfix
description: Fix a bug in FULL MATTER RUNNER without regressions - reproduce it (unit test, npm run shot scenario,
  or a QA robot seed), write the failing test first, fix, see the test pass, run the check skill, propose a
  one-sentence commit message. Use when the user reports something broken or the QA report shows an error.
---

# bugfix: reproduce, pin it with a test, fix, check

## 1. Reproduce

Pick the cheapest way that shows the bug every time:

| bug kind | reproduce with |
|---|---|
| a rule, a number, AI, physics, data | a Node test: `node --test tests/<area>.test.mjs` (look at the neighbouring tests for how they build a world; tests/setup.mjs loads Matter) |
| something on screen, input, menu, cinematic | a scenario: `npm run shot -- <scenario.json> <outdir>` (format at the top of tools/shot.mjs; .claude/skills/regen/shot.json is a starting point) and look at the PNGs |
| seen by the QA robot | its replay command from report.md: `npm run qa -- --minutes m --seed n --level id` |

No reproduction, no fix: say what was tried and ask the user for the missing detail (level, weapon, what he did).
A QA replay is not bit-exact: read the first-occurrence details (stack, `detail.front`, last actions) in
`qa-report/<stamp>/report.json` when it does not come back.

## 2. Find the cause

Read the code path end to end; confirm with a measurement (an `eval` in a shot scenario, a log in a test) rather
than a guess. Name the root cause in one sentence before touching anything.

## 3. Write the failing test first

- Add it to the test file of the area (tests/<area>.test.mjs), named after the behaviour, not the bug number.
- Run it and see it FAIL for the right reason (the assertion, not a typo).
- If the bug truly cannot be tested in Node (pure rendering), keep the shot scenario as the proof instead and say so.
- Randomness: stub `Math.random` around the call (see `withRandom` in tests/squad.test.mjs) or use a seeded
  generator; never rely on luck.

## 4. Fix

- The smallest change at the cause, not at the symptom. Tuning goes in src/game/data/*.js.
- Generated files: fix the generator and run it (skill `regen`).
- Work to delegate: write it with the `brief` skill.

## 5. Verify

```
node --test tests/<area>.test.mjs
npm test
```

The new test passes, everything else stays green. Re-run the reproduction (scenario or QA seed) and see the bug gone.

## 6. check, then a commit message

Run the `check` skill. Then propose (do not commit without the user's ok) a one-sentence message in the repo's
style: the behaviour as it is now, for example

```
Keep a guard who loses his way at a locked door replanning through the next open one instead of walking into it.
```
