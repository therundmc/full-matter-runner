---
name: regen
description: Regenerate the generated files of FULL MATTER RUNNER - sprites (tools/generate_assets.py, comic stills
  tools/generate_comic.py, title stills tools/comic/title.py) and levels (tools/build_level1.py, build_level2a.py,
  build_tutorial.py, build_lab.py) - after editing their generator, then test and take one screenshot to check by eye. Use whenever a generator or tools/levelkit.py was
  touched, or a generated file looks out of date. Never hand-edit the outputs.
---

# regen: rebuild sprites and levels from their tools

Never edit the outputs: src/game/data/levels/level1.js, level2a.js, lab.js, tutorial.js, assets/sprites/**,
src/game/data/titleart.js, src/audio/bank.js. Edit the generator and run it. Python 3 with Pillow (made with
Python 3.11 / Pillow 9.4; another version is fine: the sprite and comic generators leave a PNG whose pixels did not
change untouched, so a different zlib does not rewrite the whole folder). Run everything from the repo root.

## 1. Run the generator(s) that changed

| changed | run | output |
|---|---|---|
| tools/sprites/** (a kit), tools/generate_assets.py | `python tools/generate_assets.py` (`--only <kit>,...` for some kits) | assets/sprites/<group>/<name>.png, src/engine/spritelist.js, tools/sprite_tables.py |
| tools/generate_comic.py, tools/comic/** | `python tools/generate_comic.py` | assets/sprites/comic/*.png |
| tools/comic/title.py, title_art.py | `python tools/comic/title.py` | assets/sprites/title/*.png, src/game/data/titleart.js |
| tools/build_level1.py | `python tools/build_level1.py` | src/game/data/levels/level1.js |
| tools/build_level2a.py | `python tools/build_level2a.py` | src/game/data/levels/level2a.js |
| tools/build_tutorial.py | `python tools/build_tutorial.py` | src/game/data/levels/tutorial.js |
| tools/build_lab.py | `python tools/build_lab.py` | src/game/data/levels/lab.js |
| tools/levelkit.py | the four level builders | the four levels |

Order: the sprites FIRST, then the levels: build_level2a.py reads the props' PNGs (their sizes and shapes, to keep
the lanes clear), so a prop sprite that changed means 2A is rebuilt after it. The sprite and comic generators also
delete a PNG of their own folders that they no longer make (a sprite renamed or dropped); tests/assets.test.mjs
checks every sprite is placed, spawned or flagged `stock` (tools/sprites/registry.py).

Expected output: `generated N sprites into ...` / `wrote ...: WxH tiles, N props, N roof pieces`.
The sprites are painted by the kits of tools/sprites/ (one module a family), each listing them in its SPRITES
`{name: (painter, size, flags[, box])}` (the format: tools/sprites/registry.py). A new sprite is ONE line there: the
game's load lists and densities (src/engine/spritelist.js) and the level builder's tables (tools/sprite_tables.py:
SIZES, FLOOR, ROOF_SIZES) are generated from it, never edited by hand. The generator is deterministic (every painter
seeds its own random.Random; it paints in parallel, `-j 1` in one process) and asserts every sprite's size: an
AssertionError names the sprite and the expected size. `python tools/generate_assets.py --check` paints and compares
with what is on disk without writing (exit 1 on any difference): run it to prove a refactor changed no pixel.

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
