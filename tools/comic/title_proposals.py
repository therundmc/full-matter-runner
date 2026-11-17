#!/usr/bin/env python3
"""The title screen's three proposals (not the game's title yet: the prototypes live behind `?title=a|b|c|ab`):

    python3 tools/comic/title_proposals.py              the live prototypes' layers, into assets/sprites/title/
    python3 tools/comic/title_proposals.py <out-dir>    the same, and the mocks and the comparison sheet in <out-dir>

A. THE NEON POSTER (poster.png, logo.png, logo_off.png; src/game/ui/title/PosterTitle.js)
B. THE HIT LIST    (board_0.png .. board_4.png, one per number of targets dead; src/game/ui/title/HitList.js)
C. THE NIGHT CITY  (no layer: the present title held at night, src/game/ui/title/NightSign.js)

The layers are optional sprites (engine/Assets.js): a missing one never breaks the game. The mocks: a_poster.png (the
key art), a_capsule.png, b_before.png, b_after.png, each with its 1920 x 1080 nearest upscale (*_1080.png); the
frame strips strip_<a|b|c>.png, from the frames taken of the live prototypes (frame_*.png). The sheet
overview.png puts beside them the pictures taken of the live prototypes when they are in <out-dir> (live_*.png,
taken with tools/shot.mjs at 1152 x 648 with ?post=0) and the pitch of each direction. Art in title_art.py."""
import os
import sys

from PIL import Image

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from comic import title_art as art  # noqa: E402
from comic.kit import BONE, BONE_D, CYAN, FIRE, INK, NIGHT, NIGHT_L, NIGHT_LL, PINK, ROOT, Cv, slab, text_mask  # noqa: E402

TITLE_DIR = os.path.join(ROOT, 'assets', 'sprites', 'title')
SIZE = (art.W, art.H)


def layers():
    """The stills the live prototypes animate. Returns what the JS must know of them."""
    os.makedirs(TITLE_DIR, exist_ok=True)
    cv, boss = art.poster_art(live=True)
    cv.im.save(os.path.join(TITLE_DIR, 'poster.png'))
    on, boxes = art.logo()
    on.save(os.path.join(TITLE_DIR, 'logo.png'))
    art.logo(lit=set())[0].save(os.path.join(TITLE_DIR, 'logo_off.png'))
    for done in range(len(art.TARGETS) + 1):
        art.board_art(done, live=True).im.save(os.path.join(TITLE_DIR, 'board_%d.png' % done))
    for n in os.listdir(TITLE_DIR):
        with Image.open(os.path.join(TITLE_DIR, n)) as im:
            assert im.size[0] % 3 == 0 and im.size[1] % 3 == 0, (n, im.size)
    return dict(ember=[round(v) for v in boss['ember']], letters=boxes,
                pins=[[round(v) for v in art.card_pin(t)] for t in art.TARGETS])


def big(im):
    return im.resize((1920, 1080), Image.NEAREST)


def save(im, out, name):
    im.save(os.path.join(out, name + '.png'))
    big(im).save(os.path.join(out, name + '_1080.png'))


def capsule():
    """A as a tall capsule (600 x 900): the same cut, stacked: the logo, the runner before the glow, the signs."""
    w, h = 600, 900
    cv = Cv(w, h, NIGHT)
    art.giant(cv, art.poster.cueball, 96, 900, 380, 1)
    art.giant(cv, art.poster.boss, 520, 905, 380, -1)
    art.giant(cv, art.poster.jitters, 40, 560, 300, 1)
    art.giant(cv, art.poster.lucky, 548, 560, 270, -1)
    glow = cv.disc(300, 640, 250, col=art.FIRE_D)
    art.skyline(cv, 690, 730, 760, 3, skip=(410, 490))
    art.burning(cv, 416, 484, 566, 760)
    art.smoke(cv, 452, 506, 3, glow, 5)
    cv.poly([(-10, 756), (w + 10, 754), (w + 10, h + 10), (-10, h + 10)], INK)
    art.poster.man(cv, art.poster.runner, 286, 850, 400, face=-1)
    art.rain(cv, 60, glow, 11)
    im, _ = art.logo(1.0)
    cv.im.paste(im, (30, 40), im)
    return cv.im


def mocks(out):
    os.makedirs(out, exist_ok=True)
    save(art.poster_art()[0].im, out, 'a_poster')
    capsule().save(os.path.join(out, 'a_capsule.png'))
    save(art.board_art(0).im, out, 'b_before')
    save(art.board_art(1).im, out, 'b_after')
    for n in sorted(os.listdir(out)):                                                        # the live pictures, upscaled too
        if n.startswith('live_') and not n.endswith('_1080.png'):
            with Image.open(os.path.join(out, n)) as im:
                if im.size == SIZE:
                    big(im.convert('RGB')).save(os.path.join(out, n[:-4] + '_1080.png'))


def strips(out):
    """strip_<a|b|c>.png: the frames taken of a live prototype (frame_<v>_<i>.png, the title's clock at 0.3, 0.9, 1.4,
    2.0 s: the sign lighting, then 5.0 to 5.6 s: what moves), at half size, four to a row."""
    tw, th, cols = 576, 324, 4
    for v in 'abc':
        names = sorted(n for n in os.listdir(out) if n.startswith('frame_%s_' % v) and n.endswith('.png'))
        if not names:
            continue
        rows = (len(names) + cols - 1) // cols
        sheet = Image.new('RGB', (cols * (tw + 6) + 6, rows * (th + 6) + 6), INK)
        for i, n in enumerate(names):
            with Image.open(os.path.join(out, n)) as im:
                sheet.paste(im.convert('RGB').resize((tw, th), Image.NEAREST), (6 + (i % cols) * (tw + 6), 6 + (i // cols) * (th + 6)))
        sheet.save(os.path.join(out, 'strip_%s.png' % v))


# ---------------------------------------------------------------- the comparison sheet
PITCH = {
    'A': ('A. THE NEON POSTER', PINK, [
        'THE TITLE IS THE COMIC\'S COVER: ONE MAN, BLACK, HIS BACK TO HIS',
        'BURNING HOME, AND THE FOUR HE IS AFTER OVER THE CITY, EACH HIS SIGN.',
        '',
        'SAYS: REVENGE, ONE AGAINST FOUR, THE CAST, THE STYLE. IN ONE LOOK.',
        'STEAM: IT IS THE KEY ART. CROPS TO EVERY CAPSULE (SEE THE TALL ONE);',
        '  THE CUT LOGO WORKS ALONE ON BLACK, SMALL.',
        'COST: LOW. THE STILL AND THE LOGO ARE DONE BY THE KIT; LEFT: SOUND',
        '  (RAIN, FIRE, A BUZZ), THE OTHER PAGES\' PANEL, A PASS ON THE CITY.',
        'RISKS: STATIC NEXT TO THE OLD TRAIN; THE FOUR SHOW BEFORE THE STORY',
        '  NAMES THEM (BUT AS SHADOWS); THE BOSS IN VIOLET, NOT IN BONE.',
    ]),
    'B': ('B. THE HIT LIST', CYAN, [
        'THE MENU IS HIS BOARD: THE FOUR CARDS PINNED UP, A RED STRING FROM',
        'HIS FLAT TO THE NEXT MAN, THE MATCHBOOK ONCE CUEBALL IS DEAD.',
        '',
        'SAYS: A LIST, AND WHERE YOU ARE ON IT. PROGRESS IS THE PICTURE.',
        'STEAM: WEAK AS KEY ART (NO HERO, NO LOGO IN THE MIDDLE); STRONG AS',
        '  A SCREENSHOT AND AS THE SCREEN BETWEEN LEVELS.',
        'COST: MEDIUM. FIVE STATES ARE DRAWN; LEFT: THE X CUT LIVE WHEN A',
        '  TARGET DIES, ONE NOTE A LEVEL AS THE CAMPAIGN GROWS, THE PAGES.',
        'RISKS: AS A TITLE IT IS A MENU, NOT A PICTURE: NO FIRST IMPACT;',
        '  IT SPOILS THE ORDER; IT MUST STAY FLAT (NO CORK, NO PHOTO).',
    ]),
    'C': ('C. THE NIGHT CITY', FIRE, [
        'THE PRESENT TITLE HELD AT NIGHT: HIS BUILDING BURNS IN THE SLIT',
        'BETWEEN THE TOWERS, HE STANDS ON THE LINE, THE TITLE IS A NEON SIGN.',
        '',
        'SAYS: A CITY, A FIRE, A MAN. NOT WHO HE IS AFTER.',
        'STEAM: A MOOD SHOT; NO KEY ART IN IT (THE MAN IS 30 PX TALL).',
        'COST: THE LEAST (THE CITY IS BUILT). LEFT: THE SIGN\'S LIGHT ON THE',
        '  GLASS, THE FIRE\'S ON THE STEEL, A REAL SHAPE FOR THE SIGN\'S FRAME.',
        'RISKS: TWO ART DIRECTIONS STAY (SOFT DETAILED PIXEL ART HERE, CUT',
        '  PAPER IN THE COMIC): THE FIRST PAGE OF THE COMIC CLASHES WITH IT.',
    ]),
}
VERDICT = [
    'RECOMMENDATION: A FOR THE TITLE, B FOR THE LEVELS PAGE AND BETWEEN LEVELS (?title=ab). AGREED WITH THE MAIN SESSION.',
    'A IS THE ONLY ONE THAT IS A COVER: IT TELLS THE STORY IN ONE PICTURE, IN THE COMIC\'S OWN HAND, AND IT IS THE CAPSULE.',
    'B IS NOT A TITLE BUT IT IS THE BEST LEVELS PAGE THERE CAN BE: A LEVEL IS A MAN, A DONE LEVEL IS A MAN CROSSED OUT.',
    'C KEEPS A FINE PICTURE AND THE PROBLEM WITH IT: KEEP ITS TRAIN FOR A LEVEL OR A CINEMATIC, NOT FOR THE TITLE.',
]


def letter(sheet, s, x, y, px, col=BONE):
    if s.strip():
        sheet.paste(col, (x, y), text_mask(s, px))


def overview(out):
    """One page: A, B and C side by side (the picture, the menu on it, the pitch), the A + B pair under them, the
    recommendation."""
    cw, pw, ph = 800, 768, 432
    Wd, Hd = cw * 3 + 32, 1700
    sheet = Image.new('RGB', (Wd, Hd), NIGHT)
    grey = Image.new('RGB', (pw, ph), NIGHT_L)

    def pic(name, x, y, tag):
        path = os.path.join(out, name + '.png')
        if os.path.exists(path):
            with Image.open(path) as im:
                sheet.paste(im.convert('RGB').resize((pw, ph), Image.NEAREST), (x, y))
        else:
            sheet.paste(grey, (x, y))
            letter(sheet, 'MISSING: ' + name.upper(), x + 20, y + 20, 12, NIGHT_LL)
        t = text_mask(tag, 12)
        sheet.paste(INK, (x, y + ph, x + t.size[0] + 16, y + ph + 22))
        sheet.paste(BONE_D, (x + 8, y + ph + 5), t)

    cols = [('A', [('live_a_title', 'LIVE: ?title=a'), ('live_a_levels', 'LIVE: ITS LEVELS PAGE')]),
            ('B', [('live_b_title', 'LIVE: ?title=b, BEFORE LEVEL 1'), ('live_b_after', 'LIVE: AFTER LEVEL 1, CUEBALL CROSSED OUT')]),
            ('C', [('live_c_title', 'LIVE: ?title=c'), ('live_c_levels', 'LIVE: ITS LEVELS PAGE')])]
    letter(sheet, 'FULL MATTER RUNNER - THE TITLE SCREEN: THREE DIRECTIONS', 32, 22, 26)
    for i, (key, pics) in enumerate(cols):
        x = 32 + i * cw
        name, ink, lines = PITCH[key]
        cv = Cv(pw, 44, NIGHT)
        cv.poly(slab(2, 3, pw - 4, 41, i * 5, 2), ink)
        sheet.paste(cv.im, (x, 70))
        letter(sheet, name, x + 14, 82, 20, INK)
        y = 124
        for n, tag in pics:
            pic(n, x, y, tag)
            y += ph + 34
        for k, line in enumerate(lines):
            letter(sheet, line, x, y + 8 + k * 20, 11, BONE if k < 2 else BONE_D)
    y = 124 + 2 * (ph + 34) + 8 + 10 * 20 + 26
    cv = Cv(Wd - 64, 44, NIGHT)
    cv.poly(slab(2, 3, Wd - 70, 41, 9, 2), BONE)
    sheet.paste(cv.im, (32, y))
    letter(sheet, 'A + B: THE POSTER FOR THE TITLE, THE BOARD FOR THE LEVELS PAGE', 46, y + 12, 20, INK)
    y += 54
    pic('live_ab_title', 32, y, 'LIVE: ?title=ab')
    pic('live_ab_levels', 32 + cw, y, 'LIVE: ITS LEVELS PAGE, AFTER LEVEL 1')
    cap = os.path.join(out, 'a_capsule.png')
    if os.path.exists(cap):
        with Image.open(cap) as im:
            sheet.paste(im.resize((288, 432), Image.NEAREST), (32 + 2 * cw, y))
        letter(sheet, 'A AS A TALL CAPSULE', 32 + 2 * cw + 300, y + 8, 12, BONE_D)
        letter(sheet, '(600 X 900, THE SAME', 32 + 2 * cw + 300, y + 30, 12, BONE_D)
        letter(sheet, 'CUT, STACKED)', 32 + 2 * cw + 300, y + 52, 12, BONE_D)
    y += ph + 44
    for k, line in enumerate(VERDICT):
        letter(sheet, line, 32, y + k * 24, 14, PINK if k == 0 else BONE)
    sheet.crop((0, 0, Wd, min(Hd, y + len(VERDICT) * 24 + 20))).save(os.path.join(out, 'overview.png'))


if __name__ == '__main__':
    info = layers()
    print('title layers in %s' % TITLE_DIR)
    for k, v in info.items():
        print('  %s: %s' % (k, v))
    if len(sys.argv) > 1:
        mocks(sys.argv[1])
        strips(sys.argv[1])
        overview(sys.argv[1])
        print('mocks and overview.png in %s' % sys.argv[1])
