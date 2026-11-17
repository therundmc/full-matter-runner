"""The title screen's proposals, cut with the comic kit (STYLE.md, NEON POSTER): the lettering FULL MATTER RUNNER as
cut letters, the poster (direction A: the runner before his burning building, the four targets looming as shadows
with their signs) and the hit list (direction B: the targets' cards pinned to a board, red string, the photo of his
flat, the matchbook). tools/comic/title_proposals.py writes them out as the layers of the live prototypes
(assets/sprites/title/, drawn by src/game/ui/title/PosterTitle.js and HitList.js) and as mocks.

Everything is at SC = 3 px per title px (the title is 384 x 216), flat, aliased and deterministic. The points the
game draws over are named constants here and in the JS that reads them: move one, move the other."""
from PIL import Image

from . import poster
from .kit import (BLOOD, BONE, BONE_D, CYAN, CYAN_D, FIRE, FIRE_D, FLUO, INK, NIGHT, NIGHT_L, NIGHT_LL, PINK, PINK_D, Cv, bead, slab,
                  text_mask, turned)

W, H = 1152, 648

# ---------------------------------------------------------------- the lettering: letters cut by hand
SV = 0.17                      # a stroke's width, for a letter 1 tall


def _r(x0, y0, x1, y1):
    return [(x0, y0), (x1, y0), (x1, y1), (x0, y1)]


# letter: (its width for a height of 1, its strokes as polygons)
GLYPHS = {
    'F': (0.52, [_r(0, 0, SV, 1), _r(0, 0, 0.52, 0.17), _r(0, 0.42, 0.42, 0.59)]),
    'U': (0.58, [_r(0, 0, SV, 1), _r(0.58 - SV, 0, 0.58, 1), _r(0, 0.83, 0.58, 1)]),
    'L': (0.48, [_r(0, 0, SV, 1), _r(0, 0.83, 0.48, 1)]),
    'M': (0.74, [_r(0, 0, SV, 1), _r(0.74 - SV, 0, 0.74, 1), [(0, 0), (0.2, 0), (0.37, 0.5), (0.54, 0), (0.74, 0), (0.45, 0.8), (0.29, 0.8)]]),
    'A': (0.64, [[(0, 1), (0.23, 0), (0.41, 0), (0.19, 1)], [(0.64, 1), (0.41, 0), (0.23, 0), (0.45, 1)], _r(0.12, 0.6, 0.52, 0.76)]),
    'T': (0.56, [_r(0, 0, 0.56, 0.17), _r(0.28 - SV / 2, 0, 0.28 + SV / 2, 1)]),
    'E': (0.48, [_r(0, 0, SV, 1), _r(0, 0, 0.48, 0.17), _r(0, 0.42, 0.4, 0.59), _r(0, 0.83, 0.48, 1)]),
    'R': (0.58, [_r(0, 0, SV, 1), _r(0, 0, 0.5, 0.17), _r(0.58 - SV, 0.05, 0.58, 0.54), _r(0, 0.42, 0.5, 0.59),
                 [(0.22, 0.59), (0.42, 0.59), (0.6, 1), (0.4, 1)]]),
    'N': (0.62, [_r(0, 0, SV, 1), _r(0.62 - SV, 0, 0.62, 1), [(0, 0), (0.2, 0), (0.62, 1), (0.42, 1)]]),
    ' ': (0.34, []),
}


def word(cv, s, x, y, h, ink, seed=0, gap=None, tile=None, lit=None, off=None):
    """A word in cut letters from (x, y) its top left, h tall: each letter a little turned, a little off its line, its
    corners a little off. tile: an ink, a crooked slab behind each letter (a cut-out tile). lit: which letters are on
    (a set of indices; None: all), the others in `off`. Returns each letter's box [x0, y0, x1, y1] (its tile's)."""
    gap = h * 0.2 if gap is None else gap
    pad = h * 0.13
    boxes = []
    for i, ch in enumerate(s):
        wf, strokes = GLYPHS[ch]
        w = wf * h
        if strokes:
            deg = (bead(seed + i * 5) - 0.5) * 5
            dy = (bead(seed + i * 5 + 1) - 0.5) * h * 0.07
            if tile is not None:
                cv.poly(slab(x - pad, y + dy - pad, x + w + pad, y + dy + h + pad, seed + i * 5 + 2, h * 0.045), tile)
            col = ink if lit is None or i in lit else off
            for k, pts in enumerate(strokes):
                q = [((px - wf / 2) * h + (bead(seed + i * 31 + k * 7 + j) - 0.5) * h * 0.035,
                      (py - 0.5) * h + (bead(seed + i * 31 + k * 7 + j + 3) - 0.5) * h * 0.035) for j, (px, py) in enumerate(pts)]
                cv.poly(turned(q, x + w / 2, y + dy + h / 2, deg), col)
            boxes.append([round(x - pad - 3), round(y + dy - pad - 3), round(x + w + pad + 3), round(y + dy + h + pad + 3)])
        x += w + gap
    return boxes


def word_width(s, h, gap=None):
    gap = h * 0.2 if gap is None else gap
    return sum(GLYPHS[c][0] * h for c in s) + gap * (len(s) - 1)


# The logo: FULL MATTER in bone over RUNNER, each of its letters pink on a black tile (a neon sign in cut paper: a
# letter that fails goes to the pink's dark). Three sizes: the poster's, the board's, the capsule's.
def logo(k=1.0, lit=None, full=BONE):
    """The logo on a clear sheet, k x its poster size (540 x 186). Returns (the sheet's image, RUNNER's letter boxes)."""
    w, h = round(540 * k), round(186 * k)
    cv = Cv(w, h, None)
    hb, hs = 100 * k, 44 * k
    wb = word_width('RUNNER', hb, 26 * k)
    x0 = (w - wb) / 2
    gs = (wb - sum(GLYPHS[c][0] * hs for c in 'FULL MATTER')) / 10
    word(cv, 'FULL MATTER', x0, 4 * k, hs, full, 40, gs)
    boxes = word(cv, 'RUNNER', x0, 66 * k, hb, PINK, 7, 26 * k, tile=INK, lit=lit, off=PINK_D)
    return cv.im, boxes


LOGO_AT = (306, 14)            # the logo on the poster, its sheet's top left (PosterTitle.js LOGO)


# ---------------------------------------------------------------- A. the poster
# what the game draws over (PosterTitle.js): the fire's glow (a disc), the roof the flames and the embers leave, the
# boss's cigar tip, the menu's line
GLOW = (590, 452, 236)
ROOF = (712, 780, 356)          # the burning building: x0, x1, its roof's y
MENU_Y = 614

SHADOW = {'body': NIGHT_L, BONE: NIGHT_LL, BONE_D: BONE_D, PINK_D: NIGHT_L}    # a giant in the sky: his black a violet, his sign kept


def giant(cv, who, cx, foot, h, face, inks=None, clip=None, cut=None):
    """One of the four as a shadow over the city: the figure in the night's violets, his sign in its full ink."""
    inks = inks or SHADOW
    parts, anchors = who('stand')
    for ink, pts in parts:
        cv.poly(turned(pts, cx, foot, 0, h / 100.0, face), inks.get(ink, ink), clip, cut)
    return {k: turned([p], cx, foot, 0, h / 100.0, face)[0] for k, p in anchors.items()}


def skyline(cv, y0, y1, base, seed=0, skip=None):
    """The city far off: black blocks side by side, their roofs between y0 and y1, down to `base`."""
    x, i = -20, 0
    while x < cv.w + 20:
        w = 44 + bead(seed + i * 3) * 70
        top = y0 + bead(seed + i * 3 + 1) * (y1 - y0)
        if not (skip and x + w > skip[0] and x < skip[1]):
            cv.poly(slab(x, top, x + w + 2, base + 4, seed + i, 2.5), INK)
            if bead(seed + i * 3 + 2) > 0.72:                 # a water tank, a mast
                cv.poly(slab(x + w * 0.3, top - 16, x + w * 0.3 + 14, top + 2, seed + i + 50, 1.5), INK)
        x += w
        i += 1


def burning(cv, x0, x1, roof, base, flames=True):
    """His building: a black block, its high windows fire, the flames over its roof."""
    cv.poly(slab(x0, roof, x1, base, 91, 2), INK)
    w = (x1 - x0 - 30) / 2
    for r in range(4):
        for c in range(2):
            x, y = x0 + 10 + c * (w + 10), roof + 20 + r * 30
            if r < 2 or (r == 2 and c == 1):
                cv.poly(slab(x, y, x + w, y + 17, 60 + r * 2 + c, 1.5), FIRE if r < 2 else FIRE_D)
    if flames:
        cv.poly([(x0 + 4, roof + 4), (x0 + 12, roof - 34), (x0 + 22, roof - 12), (x0 + 34, roof - 56), (x0 + 46, roof - 16), (x0 + 56, roof - 40),
                 (x1 - 4, roof + 4)], FIRE)


def smoke(cv, x, y, n, glow, seed=0, dx=10, dy=-44):
    """The smoke off it: crooked lumps going up with the wind, black before the fire's glow, a violet over the night."""
    for i in range(n):
        r = 17 + i * 8
        pts = [(x + i * dx + (bead(seed + i * 9 + k) - 0.5) * 8 + r * c, y + i * dy + r * 0.8 * s)
               for k, (c, s) in enumerate(((-1, -0.3), (-0.5, -1), (0.4, -0.9), (1, -0.2), (0.8, 0.7), (-0.1, 1), (-0.9, 0.6)))]
        cv.poly(pts, INK, clip=glow)
        cv.poly(pts, NIGHT_L, cut=glow)


def rain(cv, n, glow=None, seed=0, slant=0.32, ink=NIGHT_LL):
    """Rain as the game will draw it live, stopped: short slanted cuts, fire where the glow is behind them."""
    for i in range(n):
        x, y, l = bead(seed + i * 3) * (cv.w + 200) - 100, bead(seed + i * 3 + 1) * cv.h, 22 + bead(seed + i * 3 + 2) * 30
        a, b = (x, y), (x + l * slant, y + l)
        if glow is None:
            cv.bar(a, b, 3, ink)
        else:
            cv.bar(a, b, 3, ink, cut=glow)
            cv.bar(a, b, 3, INK, clip=glow)


def poster_art(live=False):
    """A. THE NEON POSTER: THE RUNNER black before the glow of his burning building, his back to it, in the rain; the
    four he is after as shadows over the city, each with his sign. live: the layer the game animates (no rain, no
    embers, no logo: it draws them)."""
    cv = Cv(W, H, NIGHT)
    gx, gy, gr = GLOW
    # the four, over the city: CUEBALL and JITTERS on the left, LUCKY and THE BOSS on the right, all turned to him
    giant(cv, poster.cueball, 122, 650, 380, 1)
    giant(cv, poster.jitters, 288, 640, 380, 1)
    boss = giant(cv, poster.boss, 1082, 650, 380, -1)
    giant(cv, poster.lucky, 908, 640, 340, -1)
    glow = cv.disc(gx, gy, gr, col=FIRE_D)
    skyline(cv, 462, 500, 524, 3, skip=(ROOF[0] - 6, ROOF[1] + 6))
    burning(cv, ROOF[0], ROOF[1], ROOF[2], 524, flames=not live)
    if not live:
        smoke(cv, 748, 300, 3, glow, 5)
    # the wet street: black, the fire come back off it in broken bars, wider as they come nearer
    cv.poly([(-10, 522), (W + 10, 520), (W + 10, H + 10), (-10, H + 10)], INK)
    for i in range(6):
        u = (i + 0.5) / 6
        y, w = 530 + 50 * u ** 1.2, 120 + 260 * u
        x = gx + (bead(i + 30) - 0.5) * 50 * u
        cv.poly(slab(x - w * 0.5, y, x + w * 0.08, y + 5 + 5 * u, i, 1 + u), FIRE_D if i % 3 else FIRE)
        cv.poly(slab(x + w * 0.16, y + 2, x + w * 0.5, y + 6 + 4 * u, i + 20, 1 + u), FIRE_D)
    for x, y, w, ink in ((70, 540, 90, PINK_D), (250, 556, 60, CYAN_D), (960, 548, 110, PINK_D), (1070, 562, 50, CYAN_D)):
        cv.poly(slab(x, y, x + w, y + 6, x, 1.5), ink)                                       # the city's neons, come back too
    poster.man(cv, poster.runner, 560, 584, 330, face=-1)
    if not live:
        for i in range(9):                                                                  # embers
            x, y = 690 + bead(i + 70) * 70, 200 + bead(i + 80) * 120
            cv.poly(_r(x, y, x + 6, y + 6), FIRE)
        rain(cv, 70, glow, 11)
        im, _ = logo()
        cv.im.paste(im, LOGO_AT, im)
    return cv, boss


# ---------------------------------------------------------------- B. the hit list
# the order he takes them in (the matchbook off CUEBALL's desk leads to JITTERS), each: his figure, the ink of his
# card when he is the one to get, where it is pinned (its middle), how it leans, his figure's height
TARGETS = [
    ('cueball', 'CUEBALL', poster.cueball, PINK, (420, 212), -3.0, 150),
    ('jitters', 'JITTERS', poster.jitters, BONE, (622, 236), 2.5, 150),
    ('lucky', 'LUCKY', poster.lucky, CYAN, (822, 206), -2.0, 128),
    ('boss', 'THE BOSS', poster.boss, PINK_D, (1022, 226), 3.0, 150),
]
CARD = (172, 236)
PHOTO = (166, 300, -6.0)        # the photo of his flat: its middle, its lean (HitList.js PHOTO: the fire in it lives)
MATCHBOOK = (548, 432, 13.0)
BOARD_LOGO = (40, 30)           # the small logo's sheet on the board (HitList.js LOGO)
LOGO_K = 0.5


def pasted(cv, mask, at, deg, ink):
    """A lettering mask laid turned deg about its middle, its middle at `at`."""
    m = mask.rotate(-deg, Image.NEAREST, expand=True) if deg else mask
    cv.im.paste(ink, (round(at[0] - m.size[0] / 2), round(at[1] - m.size[1] / 2)), m)


def pin(cv, x, y, ink=BONE):
    cv.disc(x + 3, y + 4, 7, col=INK)
    cv.disc(x, y, 7, col=ink)
    cv.disc(x - 2, y - 2, 2, col=BONE if ink != BONE else BONE_D)


def card_pin(t):
    (cx, cy), deg = t[4], t[5]
    return turned([(0, -CARD[1] / 2 + 12)], cx, cy, deg)[0]


def target_card(cv, t, state):
    """A target's card pinned to the board. state: 'next' (in his card's ink, tagged), 'later' (in the board's violet)
    or 'dead' (gone dark, a red X cut across him)."""
    key, name, who, ink, (cx, cy), deg, fh = t
    w, h = CARD
    seed = len(name) * 7
    quad = slab(-w / 2, -h / 2, w / 2, h / 2, seed, 4)
    cv.poly(turned([(x + 7, y + 9) for x, y in quad], cx, cy, deg), INK)                    # its shadow on the board
    ground = {'next': ink, 'later': NIGHT_LL, 'dead': NIGHT_L}[state]
    m = cv.poly(turned(quad, cx, cy, deg), ground)
    foot = turned([(-4 if key == 'boss' else 6 if key == 'lucky' else 0, h / 2 - 44)], cx, cy, deg)[0]
    poster.man(cv, who, foot[0], foot[1], fh, clip=m, lean=deg)
    cv.poly(turned(slab(-w / 2 - 4, h / 2 - 46, w / 2 + 4, h / 2 + 10, seed + 3, 2), cx, cy, deg), INK, clip=m)
    pasted(cv, text_mask(name, 20), turned([(0, h / 2 - 23)], cx, cy, deg)[0], deg, BONE if state == 'next' else BONE_D)
    if state == 'dead':
        a, b, c, d = turned([(-w / 2 + 10, -h / 2 + 22), (w / 2 - 12, h / 2 - 56), (w / 2 - 8, -h / 2 + 26), (-w / 2 + 14, h / 2 - 60)], cx, cy, deg)
        cv.bar(a, b, 22, BLOOD, w1=15)
        cv.bar(c, d, 15, BLOOD, w1=22)
    if state == 'next':
        tag = turned([(w / 2 - 34, -h / 2 + 2)], cx, cy, deg)[0]
        cv.poly(turned(slab(-36, -13, 36, 13, seed + 9, 2), tag[0], tag[1], deg + 6), FIRE)
        pasted(cv, text_mask('NEXT', 16), tag, deg + 6, INK)
    p = card_pin(t)
    pin(cv, p[0], p[1], FIRE if state == 'next' else BONE)


def photo(cv, live=False):
    """The photo of his flat on fire: a bone print, the block black in the fire's glow."""
    cx, cy, deg = PHOTO
    w, h = 196, 214
    quad = slab(-w / 2, -h / 2, w / 2, h / 2, 5, 3)
    cv.poly(turned([(x + 7, y + 9) for x, y in quad], cx, cy, deg), INK)
    cv.poly(turned(quad, cx, cy, deg), BONE)
    m = cv.poly(turned(_r(-w / 2 + 14, -h / 2 + 14, w / 2 - 14, h / 2 - 54), cx, cy, deg), NIGHT)
    g = turned([(8, 40)], cx, cy, deg)[0]
    cv.disc(g[0], g[1], 78, col=FIRE_D, clip=m)
    for x0, x1, top in ((-90, -40, 20), (44, 92, 6)):
        cv.poly(turned(_r(x0, top, x1, 60), cx, cy, deg), INK, clip=m)
    cv.poly(turned(_r(-30, -30, 34, 60), cx, cy, deg), INK, clip=m)
    for r in range(3):
        for c in range(2):
            cv.poly(turned(_r(-20 + c * 26, -18 + r * 24, -4 + c * 26, -4 + r * 24), cx, cy, deg), FIRE if r < 2 else FIRE_D, clip=m)
    if not live:
        cv.poly(turned([(-28, -28), (-20, -56), (-10, -38), (2, -70), (14, -40), (22, -54), (32, -28)], cx, cy, deg), FIRE, clip=m)
    pasted(cv, text_mask('HOME', 20), turned([(0, h / 2 - 28)], cx, cy, deg)[0], deg, INK)
    p = turned([(0, -h / 2 + 10)], cx, cy, deg)[0]
    pin(cv, p[0], p[1])
    return p


def matchbook(cv):
    """The matchbook off CUEBALL's desk (level 1's ending): pink, a bone flamingo, JITTERS' mark scrawled on it."""
    cx, cy, deg = MATCHBOOK
    T = lambda pts: turned(pts, cx, cy, deg)
    quad = slab(-44, -56, 44, 56, 8, 2)
    cv.poly(T([(x + 6, y + 8) for x, y in quad]), INK)
    cv.poly(T(quad), PINK)
    cv.poly(T(_r(-45, 36, 45, 57)), INK)
    cv.poly(T(_r(-45, 42, 45, 49)), BONE_D)
    cv.poly(T([(-20, -6), (-4, -15), (14, -10), (20, 1), (4, 8), (-12, 5)]), BONE)             # the flamingo
    a, b, c, d = T([(13, -8), (22, -19), (15, -28), (20, -35)])
    cv.path([a, b, c, d], 5, BONE)
    cv.poly(T(_r(16, -40, 28, -32)), BONE)
    cv.poly(T([(28, -40), (36, -35), (28, -30)]), INK)
    p, q = T([(3, 6), (5, 28)])
    cv.bar(p, q, 4, BONE)
    cv.poly(T([(-38, -34), (-33, -48), (-28, -38), (-22, -50), (-16, -38), (-10, -47), (-8, -33), (-14, -36), (-20, -29), (-26, -37),
               (-32, -29)]), CYAN)                                                           # JITTERS' crest, scrawled
    p = T([(0, -46)])[0]
    pin(cv, p[0], p[1])
    return p


def board_art(done=0, live=False):
    """B. THE HIT LIST: a board on a black wall, a bar of light across it; the photo of his flat, the four cards in
    the order he takes them, a red string from pin to pin as far as he has got, the matchbook once CUEBALL is done.
    done: how many of them are dead (0..4). live: the layer the game animates (the photo's flames are its own)."""
    cv = Cv(W, H, INK)
    board = cv.poly(slab(22, 18, W - 22, H - 44, 2, 7), NIGHT)
    cv.poly([(560, -10), (860, -10), (520, H + 10), (220, H + 10)], NIGHT_L, clip=board)      # the one diagonal: a bar of light
    im, _ = logo(LOGO_K)
    cv.im.paste(im, BOARD_LOGO, im)
    pins = [photo(cv, live)]
    for i, t in enumerate(TARGETS):
        target_card(cv, t, 'dead' if i < done else 'next' if i == done else 'later')
    if done >= 1:
        pins.append(card_pin(TARGETS[0]))
        pins.append(matchbook(cv))
        pins += [card_pin(t) for t in TARGETS[1:done + 1]]
    else:
        pins.append(card_pin(TARGETS[0]))
    for a, b in zip(pins, pins[1:]):                                                          # the string, pin to pin
        cv.bar((a[0], a[1] + 1), (b[0], b[1] + 1), 5, BLOOD)
    for i, p in enumerate(pins):                                                              # its knots, over it
        cv.disc(p[0], p[1], 4, col=BLOOD)
    return cv
