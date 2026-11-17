---
name: brief
description: Write the self-contained brief for a subagent that will implement a change in FULL MATTER RUNNER, and
  pick its model (Opus 5.5 at the minimum, never Sonnet or Haiku, never the strongest model for typing). Use every
  time work is delegated through the Agent tool, after the analysis is done.
---

# brief: hand the typing to a cheaper model

The main session has already read the code, reproduced / measured, and decided the design. The brief turns that
into instructions a subagent can follow COLD: it has not seen this conversation, CLAUDE.md is its only context.

## Choose the model

- `opus` (Opus 5.5) for every delegated job, small or large: the minimum the user allows. Never `sonnet` or `haiku`.
- Never the strongest model to type. Not delegated at all: one-line fixes, level design, the shader layer, sprites.

## Template (fill every section; write "none" rather than drop one)

```
CONTEXT
<2-4 lines: what the game is doing today, what is wrong or missing, why the change.>

FILES AND FUNCTIONS
- src/...js: <function / class / constant> - <what to change there>
- tools/build_level1.py (then run it) - <...>
Do not touch: <files that look related but must stay as they are>.

BEHAVIOUR (exact)
- <rule 1, with numbers and units: px (1 m = 32 px), s, kg, odds 0..1>
- <edge cases: player dead, level without this feature, retry, pause>
- <data goes in src/game/data/*.js, not hard-coded>

TESTS TO ADD
- tests/<name>.test.mjs: <case> -> <expected value>
- <how to build the situation: helpers used by the neighbouring tests>

REPO RULES
- No commit, no push, no server left running, never `git add`.
- ASCII only in source, comments and docs.
- `npm test` must be green at the end (paste its summary lines).
- Generated files only through their tools: levels via tools/build_*.py, sprites via tools/generate_assets.py,
  the foley bank via tools/build_sounds.mjs. Never edit their output.
- engine/ never imports game/; logic modules stay DOM-free; reactions go through world.events.
- Follow the surrounding style: short useful comments, no unused exports / imports.

REPORT BACK
- The files changed, one line each.
- Every deviation from this brief and why (a number changed, a function renamed, a case not handled).
- What you could not verify (needs a browser, a listen, the QA robot).
```

## Before sending

- Every path and name in the brief exists (grep it): no invented function.
- Numbers come from the measurement, not from memory.
- The test cases would fail on the current code.

## When it comes back

Read the full diff yourself, run the `check` skill, look at it in the game when it shows on screen, then decide.
Deviations are the main session's call, not the subagent's.
