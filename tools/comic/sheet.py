#!/usr/bin/env python3
"""The cast's model sheet (not shipped, not loaded by the game): each character standing front and three quarters,
his head front, three quarters and in profile, and the library of inked hands, under one plain light, to check proportions,
builds and likeness before drawing a panel.

Run from the repo root:  python tools/comic/sheet.py [out.png]
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from PIL import Image  # noqa: E402

from comic import hands  # noqa: E402
from comic.anatomy import stance  # noqa: E402
from comic.cast import BOSS, HEAVY, HERO, SLICK, YOUNG, Figure, Light  # noqa: E402
from comic.kit import Cv, hx  # noqa: E402
from comic.solid import Scene, Xf, ypr  # noqa: E402

BG = hx('#2a2440')
LIGHT = Light(key=(255, 238, 214), fill=(120, 104, 170), deep=1.0)
KEY = (-0.7, -0.45, 0.55)
RIMS = [((0.9, -0.2, -0.45), hx('#ff5a8a'), 0.72)]


def tile(w, h, paint, scale):
    """Render what paint(sc) adds (it may return a function to draw over the render: the inked hands)."""
    cv = Cv(w, h, BG)
    sc = Scene(w, h, light=KEY, rims=RIMS, scale=scale, rim_px=2, blacks=-0.05, simplify=5 if scale > 0.8 else 3,
               ink=2 if scale < 0.8 else 3, inner=2)
    after = paint(sc)
    sc.render(cv)
    if after:
        after(cv, sc)
    return cv.im


def posed(who, k, bare=False):
    """The character at ease, his weight on one leg (k: which way round), his head turned a little."""
    pose = stance('l' if k else 'r', turn=8 if k else -6)
    sg = 1 if k else -1
    pose.update(wrist_l=(84, -366, 2 + 6 * sg), wrist_r=(-86, -372, 0 - 6 * sg), elbow_l=(0.6, 0, -1),
                elbow_r=(-0.6, 0, -1))
    return Figure(who, pose=pose, bare=bare, face=dict(gaze=(1.0 * sg, 0.0)))


def figure_tile(who, yaw, bare=False):
    s = 0.4
    fig, place = posed(who, yaw > 0, bare), Xf(75, 318, s, ypr(yaw))

    def paint(sc):
        fig.add(sc, place, LIGHT)
        return lambda cv, sc_: fig.draw_hands(cv, sc_, place, LIGHT)
    return tile(150, 330, paint, s)


# each one's face at rest, as he is: the hero hard, the heavy scowling, the slick one smug, the young one grinning,
# the boss heavy-lidded and sour
MOODS = {'hero': dict(squint=0.3, brow_lift=(-0.4, -0.4), smile=(-0.2, -0.2)),
         'heavy': dict(squint=0.5, brow_lift=(-1.0, -1.0), smile=(-0.5, -0.4)),
         'slick': dict(squint=0.4, brow_lift=(0.0, 0.9), smile=(0.1, 0.9)),
         'young': dict(squint=0.2, brow_lift=(0.3, 0.6), smile=(0.8, 0.9)),
         'boss': dict(squint=0.1, brow_lift=(-0.5, -0.3), smile=(-0.6, -0.5))}


def head_tile(who, yaw, bare=False):
    s = 1.05
    fig = Figure(who, bare=bare, face=MOODS[who['name']])

    def paint(sc):
        fig.add(sc, Xf(75, 30 + 750 * s, s, ypr(yaw)), LIGHT)
    return tile(150, 170, paint, s)


def library(size=100, cols=8, cell=(130, 150)):
    """Every hand design of hands.DESIGNS, inked at size px, as one picture."""
    items = [(p, v) for p, views in hands.DESIGNS.items() for v in views]
    rows = (len(items) + cols - 1) // cols
    cv = Cv(cell[0] * cols, cell[1] * rows, BG)
    t = LIGHT.tones(HERO['colours']['skin'])
    for i, (p, v) in enumerate(items):
        x, y = (i % cols) * cell[0] + cell[0] // 2, (i // cols) * cell[1] + int(cell[1] * 0.06 + size * 1.05)
        hands.draw(cv, hands.design(p, v), (x, y), 0, size, light=(KEY[0], KEY[1]), skin=(t['lit'], t['shade']),
                   ink=3)
    return cv.im


def main(out, hands_out=None):
    cast = [HERO, HEAVY, SLICK, YOUNG, BOSS]
    W = 150 * 2 * len(cast) + 150
    lib = library()
    sheet = Image.new('RGB', (W, 330 + 170 + lib.size[1] + 10), BG)
    x = 0
    for who in cast:
        sheet.paste(figure_tile(who, 0), (x, 0))
        sheet.paste(figure_tile(who, 35), (x + 150, 0))
        x += 300
    sheet.paste(figure_tile(HERO, 35, bare=True), (x, 0))
    x = 0
    for who in cast:
        for k, yaw in enumerate((0, 35)):
            sheet.paste(head_tile(who, yaw), (x + k * 150, 330))
        x += 300
    sheet.paste(head_tile(HERO, 90, bare=True), (x, 330))
    sheet.paste(lib, ((W - lib.size[0]) // 2, 505))
    sheet.save(out)
    print('model sheet:', out)
    if hands_out:
        lib = library(size=110, cols=6, cell=(150, 170))
        lib.resize((lib.size[0] * 2, lib.size[1] * 2), Image.NEAREST).save(hands_out)
        print('hand library:', hands_out)


if __name__ == '__main__':
    main(sys.argv[1] if len(sys.argv) > 1 else 'model_sheet.png', sys.argv[2] if len(sys.argv) > 2 else None)
