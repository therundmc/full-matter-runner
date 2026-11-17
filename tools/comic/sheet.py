#!/usr/bin/env python3
"""The cast sheet and the overview of the stills (not shipped):

    python3 tools/comic/sheet.py <cast.png> [<overview.png>]

The cast sheet: each character as a cut-paper figure, his name, his signature in words, and how he reads from
straight above at the game's scale (about 26 px across the shoulders, shown 4x), beside the game's current top-down
sprites. The overview: the 16 stills as painted by tools/generate_comic.py, on one sheet."""
import os
import sys

from PIL import Image, ImageFilter

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from comic.kit import BONE, CYAN, INK, NIGHT, NIGHT_L, NIGHT_LL, OUT_DIR, PINK, ROOT, Cv, hx, slab, text_mask  # noqa: E402
from comic import poster  # noqa: E402

# name, the function, his height on the sheet (px for his 100 units), the slab behind him, the words, px across from above
CAST = [
    ('CUEBALL', poster.cueball, 'cueball', 250, PINK, ['THE HEAVY. A WALL ON', 'SHORT LEGS. HIS SIGN:', 'A BALD BONE DOME,', 'BLACK SHADES ACROSS.'], 0.56),
    ('LUCKY', poster.lucky, 'lucky', 225, CYAN, ['THE SLICK ONE, THE MAN', 'WITH THE MATCH. A', 'BEANPOLE. HIS SIGN: A', 'HUGE PINK POMPADOUR.'], 0.74),
    ('JITTERS', poster.jitters, 'jitters', 250, BONE, ['THE YOUNG ONE. A RUNT,', 'HUNCHED, NEVER STILL.', 'HIS SIGN: A CYAN', 'SAW-TOOTH CREST.'], 0.74),
    ('THE BOSS', poster.boss, 'boss', 250, hx('#8a1d5c'), ['THE ONLY MAN CUT IN', 'BONE: A WIDE PALE SUIT,', 'BLACK HAIR, A CIGAR.', ''], 0.62),
    ('THE RUNNER', poster.runner, 'runner', 250, NIGHT_LL, ['THE PLAYER. CAP, LONG', 'COAT. HIS SIGN: THE', 'PETROL-BLUE SCARF', 'OVER HIS MOUTH.'], 0.68),
]
SPRITES = ['heavy', 'brute', 'thug', 'boss', 'player']
FLOOR = (70, 66, 80)


def top_down(name, s):
    """The character from above at the game's scale, facing right, with the game's dark outline: a 40 x 40 tile."""
    cv = Cv(40, 40, None)
    poster.above(cv, name, 19, 20, s, 0, body=hx('#1c1824'))
    a = cv.im.split()[3]
    out = Image.new('RGB', (40, 40), FLOOR)
    out.paste(INK, (0, 0), a.filter(ImageFilter.MaxFilter(3)))
    out.paste(cv.im, (0, 0), a)
    return out


def sprite(name):
    d = os.path.join(ROOT, 'assets', 'sprites', 'characters')
    tile = Image.new('RGBA', (40, 40), FLOOR + (255,))
    tile.alpha_composite(Image.open(os.path.join(d, name + '_torso.png')).convert('RGBA'))
    tile.alpha_composite(Image.open(os.path.join(d, name + '_head.png')).convert('RGBA'), (2, 8))
    return tile.convert('RGB').resize((20, 20), Image.NEAREST)      # painted at twice the density: the game draws it at half


def cast_sheet(path):
    cw, W, H = 330, 330 * len(CAST), 860
    cv = Cv(W, H, NIGHT)
    for i, (name, who, key, h, ground, words, s) in enumerate(CAST):
        x = i * cw
        cv.poly(slab(x + 30, 70, x + cw - 30, 430, i * 7, 10), ground)
        cv.poly(slab(x + 20, 404, x + cw - 20, 436, i * 7 + 3, 4), INK)
        poster.man(cv, who, x + cw / 2 - 8, 414, h, body=INK)
        t = text_mask(name, 30)
        cv.im.paste(BONE, (x + (cw - t.size[0]) // 2, 22), t)
        for k, line in enumerate(words):
            if line:
                t = text_mask(line, 12)
                cv.im.paste(BONE, (x + 30, 452 + k * 18), t)
        # from above: at the game's scale, then four times that
        tile = top_down(key, s)
        cv.im.paste(tile, (x + 30, 550))
        cv.im.paste(tile.resize((160, 160), Image.NEAREST), (x + 90, 548))
    t = text_mask('FROM ABOVE, AT THE GAME\'S SCALE (1X AND 4X)', 12)
    cv.im.paste(NIGHT_LL, (30, 524), t)
    t = text_mask('THE GAME\'S TOP-DOWN SPRITES TODAY (4X)', 12)
    cv.im.paste(NIGHT_LL, (30, 718), t)
    for i, n in enumerate(SPRITES):
        cv.im.paste(sprite(n).resize((80, 80), Image.NEAREST), (30 + i * 100, 740))
        t = text_mask(n.upper(), 9)
        cv.im.paste(NIGHT_LL, (30 + i * 100, 826), t)
    cv.im.save(path)


def overview(path):
    rows = [['sleep'], ['door'], ['pry', 'box', 'count'], ['pour'], ['match_dark'], ['match'], ['fire', 'wake_shut'], ['wake', 'matchbook'],
            ['alley'], ['drive'], ['office', 'office_phone']]
    ims = [[Image.open(os.path.join(OUT_DIR, n + '.png')).convert('RGBA') for n in r] for r in rows]
    half = (len(ims) + 1) // 2
    cols = [ims[:half + 1], ims[half + 1:]]
    hs = [sum(max(i.size[1] for i in r) + 10 for r in c) for c in cols]
    sheet = Image.new('RGB', (2 * 1100 + 10, max(hs) + 10), (60, 58, 66))
    for c, col in enumerate(cols):
        y = 10
        for r in col:
            x = 10 + c * 1100
            for im in r:
                sheet.paste(Image.alpha_composite(Image.new('RGBA', im.size, NIGHT_L + (255,)), im).convert('RGB'), (x, y))
                x += im.size[0] + 10
            y += max(i.size[1] for i in r) + 10
    sheet.save(path)


if __name__ == '__main__':
    cast_sheet(sys.argv[1])
    if len(sys.argv) > 2:
        overview(sys.argv[2])
