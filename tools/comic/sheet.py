#!/usr/bin/env python3
"""The sheets (not shipped):

    python3 tools/comic/sheet.py <out-dir>

writes cast.png (each character as a cut-paper figure, his name, his sign in words, and how he reads from straight
above at the game's scale, about 26 px across the shoulders, shown 1x and 4x, beside the game's top-down sprites of
today), lucky_options.png (the pink things tried on LUCKY, side on and from above; poster.LUCKY_GEAR picks one),
cards.png (the five cards at half size) and overview.png (the 16 stills as painted by tools/generate_comic.py)."""
import os
import sys

from PIL import Image, ImageFilter

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from comic.kit import BONE, CYAN, FIRE_D, INK, NIGHT, NIGHT_L, NIGHT_LL, OUT_DIR, PINK, PINK_D, ROOT, Cv, hx, slab, text_mask, turned  # noqa: E402
from comic import poster  # noqa: E402

# name, the function, his key from above, his height on the sheet (px for his 100 units), the slab behind him, the
# words, px per unit from above
CAST = [
    ('CUEBALL', poster.cueball, 'cueball', 250, PINK, ['THE HEAVY. A WALL ON', 'SHORT LEGS, A BALD DOME.', 'HIS SIGN: HUGE FLUO', 'YELLOW SHADES.'], 0.56),
    ('LUCKY', poster.lucky, 'lucky', 232, CYAN, ['THE SLICK ONE, THE MAN', 'WITH THE MATCH. A', 'BEANPOLE. HIS SIGN: A', 'LONG PINK SCARF.'], 0.74),
    ('JITTERS', poster.jitters, 'jitters', 250, BONE, ['THE YOUNG ONE. A RUNT,', 'HUNCHED, NEVER STILL.', 'HIS SIGN: A CYAN', 'SAW-TOOTH CREST.'], 0.74),
    ('THE BOSS', poster.boss, 'boss', 250, PINK_D, ['THE ONLY MAN CUT IN', 'BONE: A WIDE PALE SUIT,', 'A BLACK TIE, A CIGAR.', ''], 0.62),
    ('THE RUNNER', poster.runner, 'runner', 250, FIRE_D, ['THE PLAYER. HIS SIGN:', 'A DARK SPORTS CAP;', 'A PETROL GAITER UP TO', 'HIS EYES. COLLAR UP.'], 0.68),
]
GEAR = [('scarf', 'A SCARF'), ('pack', 'A PACK'), ('gloves', 'GLOVES'), ('braces', 'BRACES'), ('bag', 'A BAG ACROSS')]
SPRITES = ['heavy', 'brute', 'thug', 'boss', 'player']
FLOOR = (70, 66, 80)


def top_down(name, s, parts=None):
    """The character from above at the game's scale, facing right, with the game's dark outline: a 40 x 40 tile."""
    cv = Cv(40, 40, None)
    poster.above(cv, name, 20, 20, s, 0, body=hx('#1c1824'), parts=parts)
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


def letter(cv, s, x, y, px, col=BONE):
    cv.im.paste(col, (x, y), text_mask(s, px))


def figure_tile(cv, x, cw, who, h, ground, seed, tile, **kw):
    """One column: the figure on its slab, and under it how it reads from above (1x and 4x)."""
    cv.poly(slab(x + 30, 70, x + cw - 30, 430, seed, 10), ground)
    cv.poly(slab(x + 20, 404, x + cw - 20, 436, seed + 3, 4), INK)
    parts, _ = who('stand', **kw)
    for ink, pts in parts:
        cv.poly(turned(pts, x + cw / 2 - 8, 414, 0, h / 100.0), INK if ink == 'body' else ink)
    cv.im.paste(tile, (x + 30, 550))
    cv.im.paste(tile.resize((160, 160), Image.NEAREST), (x + 90, 548))


def cast_sheet(path):
    cw, W, H = 330, 330 * len(CAST), 860
    cv = Cv(W, H, NIGHT)
    for i, (name, who, key, h, ground, words, s) in enumerate(CAST):
        x = i * cw
        figure_tile(cv, x, cw, who, h, ground, i * 7, top_down(key, s))
        t = text_mask(name, 30)
        cv.im.paste(BONE, (x + (cw - t.size[0]) // 2, 22), t)
        for k, line in enumerate(words):
            if line:
                letter(cv, line, x + 30, 452 + k * 18, 12)
    letter(cv, 'FROM ABOVE, AT THE GAME\'S SCALE (1X AND 4X)', 30, 524, 12, NIGHT_LL)
    letter(cv, 'THE GAME\'S TOP-DOWN SPRITES TODAY (4X)', 30, 718, 12, NIGHT_LL)
    for i, n in enumerate(SPRITES):
        cv.im.paste(sprite(n).resize((80, 80), Image.NEAREST), (30 + i * 100, 740))
        letter(cv, n.upper(), 30 + i * 100, 826, 9, NIGHT_LL)
    cv.im.save(path)


def options_sheet(path):
    cw, W, H = 330, 330 * len(GEAR), 730
    cv = Cv(W, H, NIGHT)
    for i, (gear, words) in enumerate(GEAR):
        x = i * cw
        figure_tile(cv, x, cw, poster.lucky, 232, CYAN, i * 5, top_down('lucky', 0.74, poster.lucky_above(gear)), gear=gear)
        t = text_mask(words + (' (THE PICK)' if gear == poster.LUCKY_GEAR else ''), 18)
        cv.im.paste(PINK if gear == poster.LUCKY_GEAR else BONE, (x + (cw - t.size[0]) // 2, 28), t)
    letter(cv, 'LUCKY\'S PINK THING: SIDE ON, AND FROM ABOVE AT THE GAME\'S SCALE (1X AND 4X)', 30, 524, 12, NIGHT_LL)
    cv.im.save(path)


def cards_sheet(path):
    names = ['target_cueball', 'target_lucky', 'target_jitters', 'target_boss', 'card_runner']
    sheet = Image.new('RGB', (2 * 586 + 10, 3 * 334 + 10), (60, 58, 66))
    for i, n in enumerate(names):
        im = Image.open(os.path.join(OUT_DIR, n + '.png')).convert('RGB').resize((576, 324), Image.NEAREST)
        sheet.paste(im, (10 + (i % 2) * 586, 10 + (i // 2) * 334))
    sheet.save(path)


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
    out = sys.argv[1]
    cast_sheet(os.path.join(out, 'cast.png'))
    options_sheet(os.path.join(out, 'lucky_options.png'))
    cards_sheet(os.path.join(out, 'cards.png'))
    overview(os.path.join(out, 'overview.png'))
