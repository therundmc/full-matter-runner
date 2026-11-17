#!/usr/bin/env python3
"""The game's comic panels: the opening (ui/Cinematic.js), the leap's card (ui/cine/Leap.js) and level 1's closing
page (ui/cine/Ending.js), all framed and animated by ui/cine/Panels.js.

Run from the repo root:  python tools/generate_comic.py
Writes RGB / RGBA PNGs to assets/sprites/comic/<name>.png (loaded as optional sprites by engine/Assets.js).

The painting lives in the package tools/comic: kit.py (the canvas of flat cut shapes, the inks, the lettering, the
panel registry), poster.py (the cast as cut-paper signs, the set pieces) and panels/<page>.py (one module per page,
each panel a function registered with @panel). Read tools/comic/STYLE.md before drawing. Everything is drawn aliased at SC panel px
per title px (the title's logical screen is 384 x 216), so the game draws a panel at its logical size with nearest
neighbour and it stays crisp; only the still art is here: what moves (the flame, smoke, the rain, the typed words) is
drawn live by the game. Deterministic: no randomness at all.
"""
import os

from PIL import Image

from comic.kit import OUT_DIR, PANELS
import comic.panels  # noqa: F401  (registers every panel)


def main():
    for name, (paint, size) in PANELS.items():
        paint().save(name, size)
    for name, (_, size) in PANELS.items():
        path = os.path.join(OUT_DIR, name + '.png')
        with Image.open(path) as im:
            assert im.size == size, (path, im.size, size)
    print('generated %d comic panels into %s' % (len(PANELS), OUT_DIR))


if __name__ == '__main__':
    main()
