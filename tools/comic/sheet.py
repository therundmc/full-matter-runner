#!/usr/bin/env python3
"""The cast's model sheet (not shipped, not loaded by the game): each character standing front and three quarters,
his head front, three quarters and in profile, and the hand shapes, under one plain light, to check proportions,
builds and likeness before drawing a panel.

Run from the repo root:  python tools/comic/sheet.py [out.png]
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from PIL import Image  # noqa: E402

from comic.anatomy import FIST, OPEN, PINCH, RELAXED, Hand, flat, grip  # noqa: E402
from comic.cast import BOSS, HEAVY, HERO, SLICK, YOUNG, Figure, Light, hand_parts  # noqa: E402
from comic.kit import Cv, hx  # noqa: E402
from comic.solid import Scene, Xf, frame, ypr  # noqa: E402

BG = hx('#2a2440')
LIGHT = Light(key=(255, 238, 214), fill=(120, 104, 170))
KEY = (-0.45, -0.55, 0.7)
RIMS = [((0.9, -0.2, -0.45), hx('#ff5a8a'), 0.72)]


def tile(w, h, paint, scale):
    cv = Cv(w, h, BG)
    sc = Scene(w, h, light=KEY, rims=RIMS, scale=scale, rim_px=2)
    paint(sc)
    sc.render(cv)
    return cv.im


def figure_tile(who, yaw, bare=False):
    s = 0.4
    return tile(150, 330, lambda sc: Figure(who, bare=bare).add(sc, Xf(75, 318, s, ypr(yaw)), LIGHT), s)


def head_tile(who, yaw, bare=False):
    s = 1.05
    fig = Figure(who, bare=bare)

    def paint(sc):
        fig.add(sc, Xf(75, 30 + 750 * s, s, ypr(yaw)), LIGHT)
    return tile(150, 170, paint, s)


def hand_tile(shape, view):
    s = 1.65

    def paint(sc):
        for m, skin in hand_parts(Hand(shape), LIGHT, HERO['colours']['skin']):
            sc.add(m, skin, Xf.raw(tuple(tuple(v * s for v in row) for row in view), (60, 160, 0)))
    return tile(120, 170, paint, s)


def main(out):
    cast = [HERO, HEAVY, SLICK, YOUNG, BOSS]
    W = 150 * 2 * len(cast) + 150
    sheet = Image.new('RGB', (W, 330 + 170 + 170 + 20), BG)
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
    views = [frame((0, -1, 0), (0, 0, -1)), frame((0, -1, 0), (-1, 0, 0))]
    x = 0
    for shape in (RELAXED, OPEN, FIST, PINCH, grip(6), flat(thumb=(-4, 30, 12))):
        for v in views:
            sheet.paste(hand_tile(shape, v), (x, 500))
            x += 120
    sheet.save(out)
    print('model sheet:', out)


if __name__ == '__main__':
    main(sys.argv[1] if len(sys.argv) > 1 else 'model_sheet.png')
