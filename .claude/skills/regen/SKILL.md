---
name: regen
description: Regenerate the generated files of FULL MATTER RUNNER - sprites (tools/generate_assets.py, comic stills
  tools/generate_comic.py) and levels (tools/build_level1.py, build_tutorial.py, build_lab.py) - after editing their
  generator, then test and take one screenshot to check by eye. Use whenever a generator or tools/levelkit.py was
  touched, or a generated file looks out of date. Never hand-edit the outputs.
---

# regen: rebuild sprites and levels from their tools

Never edit the outputs: src/game/data/levels/level1.js, lab.js, tutorial.js, assets/sprites/**,
src/audio/bank.js. Edit the generator and run it. (street.js is hand-written.) Python 3 with Pillow.
Run everything from the repo root.

## 1. Run the generator(s) that changed

| changed | run | output |
|---|---|---|
| tools/generate_assets.py | `python tools/generate_assets.py` | assets/sprites/<group>/<name>.png |
| tools/generate_comic.py, tools/comic/** | `python tools/generate_comic.py` | assets/sprites/comic/*.png |
| tools/build_level1.py | `python tools/build_level1.py` | src/game/data/levels/level1.js |
| tools/build_tutorial.py | `python tools/build_tutorial.py` | src/game/data/levels/tutorial.js |
| tools/build_lab.py | `python tools/build_lab.py` | src/game/data/levels/lab.js |
| tools/levelkit.py | the three level builders | the three levels |

Expected output: `generated N sprites into ...` / `wrote ...: WxH tiles, N props, N roof pieces`.
generate_assets.py is deterministic and asserts every sprite's size: an AssertionError names the sprite and the
expected size; keep `FINE` / `FINE_PROPS` in step with engine/Assets.js.

## 2. levelkit errors

The kit stops on an `AssertionError` with the reason, for example:
- `<kind> at col,row is in 'X'`: a prop on a wall / door / window tile;
- `<kind> at col,row overlaps ...`: two pieces of furniture on each other;
- `<kind> at col,row on a spawn`: furniture on an actor;
- `N guards, expected 12`: a guard lost or added on level 1;
- `check_on_wall`: a wall piece hung across a doorway.
Level 1's builder works in its drawing's coordinates: whole tiles are cut afterwards (`CUT_COLS` / `CUT_ROWS`), so
keep things off the cut lines. Tests and QA plans use the coordinates AFTER the cuts.

## 3. What moved

```
git --no-pager diff --stat -- src/game/data/levels assets/sprites
```

Only the outputs you expected should change. A sprite that changed without reason means the generator's random
stream shifted (a new `rng` draw inserted before it): acceptable only if intended.

## 4. Tests

```
npm test
```

(tests/level1.test.mjs, tutorial.test.mjs, assets.test.mjs, roofs.test.mjs check the levels and sprites.)

## 5. One picture

```
npm run shot -- .claude/skills/regen/shot.json <outdir>
```

The scenario (shot.json next to this file) starts level 1, skips the intro, shoots the start alley, then moves the
player to the bar room (tile 20.5, 16.5) and shoots it. To look elsewhere edit the tile in the second `eval`
(px = tile * 32), or `query` for another level (`?level=lab`, `?level=tutorial`). Format: top of tools/shot.mjs.
Open the PNGs and look: scale, overlaps, readability, no checkerboard.

## 6. Then

If a level changed: the `qa` skill on that level. Before committing: the `check` skill. Commit the generator AND
its regenerated output together.
