#!/usr/bin/env python3
"""The art bible's do / don't crops (not shipped): the same subject drawn the old way and the way STYLE.md asks.

Run from the repo root:  python tools/comic/dodont.py <out-dir> [<old-stills-dir>]
Writes do_dont_face.png (a face lit flat without blacks or lines / lit hard with its blacks and inked lines) and, given
a folder of the first pass's stills (git show <rev>:assets/sprites/comic/<name>.png), do_dont_hands.png and
do_dont_figures.png (paddle hands and stick figures doubled off register / the hands and bodies of now).
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from PIL import Image, ImageDraw  # noqa: E402

from comic.cast import SLICK, Figure, Light  # noqa: E402
from comic.kit import OUT_DIR, Cv, hx  # noqa: E402
from comic.solid import Scene, Xf, ypr  # noqa: E402

BG = hx('#1a1228')


def head(vance):
    """The slick one's head, three quarters: flat (no blacks, no lines) or as the bible asks."""
    s = 1.3
    cv = Cv(200, 190, BG)
    light = Light(key=hx('#ffc890'), fill=hx('#5a4a90'), deep=1.0 if vance else 0.55)
    face = dict(smile=(0.1, 0.6)) if vance else dict(smile=(0.1, 0.6), lines=())
    fig = Figure(SLICK, face=face, face_black=-0.05 if vance else False)
    sc = Scene(200, 190, light=(-0.75, -0.3, 0.6) if vance else (-0.2, -0.3, 0.93), scale=s, simplify=5 if vance else 0,
               blacks=0.0 if vance else None, ink=2, inner=2 if vance else 1)
    fig.add(sc, Xf(100, 26 + 750 * s, s, ypr(-30)), light)
    sc.render(cv)
    return cv.im


def pair(dont, do, z, label=('DON\'T', 'DO')):
    w, h = dont.size
    out = Image.new('RGB', (w * z * 2 + 12, h * z + 18), (12, 8, 16))
    for k, im in enumerate((dont, do)):
        out.paste(im.resize((w * z, h * z), Image.NEAREST), (k * (w * z + 12), 18))
        ImageDraw.Draw(out).text((k * (w * z + 12) + 4, 3), label[k], fill=(240, 220, 120))
    return out


def main(out, old=None):
    os.makedirs(out, exist_ok=True)
    pair(head(False), head(True), 2).save(os.path.join(out, 'do_dont_face.png'))
    if old:
        a = Image.open(os.path.join(old, 'count.png')).convert('RGB').crop((0, 170, 200, 288))
        b = Image.open(os.path.join(OUT_DIR, 'count.png')).convert('RGB').crop((20, 170, 220, 288))
        pair(a, b, 3).save(os.path.join(out, 'do_dont_hands.png'))
        a = Image.open(os.path.join(old, 'door.png')).convert('RGB').crop((560, 0, 880, 282))
        b = Image.open(os.path.join(OUT_DIR, 'door.png')).convert('RGB').crop((560, 0, 880, 282))
        pair(a, b, 2).save(os.path.join(out, 'do_dont_figures.png'))
    print('do / don\'t crops in', out)


if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2] if len(sys.argv) > 2 else None)
