"""The title screen, cut with the comic kit (STYLE.md, NEON POSTER): the lettering FULL MATTER RUNNER as cut letters,
the poster (the title: THE RUNNER before his burning building, the four targets over the city as shadows with their
signs) and the hit list (the LEVELS page and the screen between levels: the targets' cards pinned to a board, red
string, the photo of his flat, the matchbook). tools/comic/title.py writes them out as the layers the game animates
(assets/sprites/title/, drawn by src/game/ui/title/Poster.js and HitList.js), with the points it draws over as data
(src/game/data/titleart.js), and as stills.

Everything is at SC = 3 px per title px (the title is 384 x 216), flat, aliased and deterministic."""
from PIL import Image, ImageChops, ImageDraw

from . import poster
from .kit import (BLOOD, BONE, BONE_D, BROWN, CYAN, CYAN_D, FIRE, FIRE_D, FIRE_DD, FIRE_L, INK, NIGHT, NIGHT_L, NIGHT_LL, PINK, PINK_D, Cv, bead,
                  slab, text_mask, turned)

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


LOGO_AT = (306, 14)            # the logo on the poster, its sheet's top left


# ---------------------------------------------------------------- A. the poster
# The poster is cut in three layers the game shifts against each other with the mouse (whole px): the sky with the
# four, the city with the fire's glow and his building, the street with THE RUNNER. Each is MX px wider than the
# sheet on both sides. What the game draws over them is written out as data (title.py -> src/game/data/titleart.js).
MX = 24
GLOW = (590, 452, 236)                         # the fire's glow: a disc
B = dict(x0=704, x1=800, roof=326, base=526)   # his building
FLOOR = 48                                     # a floor's height in it
RUNNER_AT = (560, 584, 330)                    # his middle, his feet, his height
SHADOW = {'body': NIGHT_L, BONE: NIGHT_LL, BONE_D: BONE_D, PINK_D: NIGHT_L}    # a giant in the sky: his black a violet, his sign kept


class Wide(Cv):
    """A layer of the poster: MX px wider than the sheet each side, its shapes given in the sheet's px."""

    def __init__(self, bg=None):
        super().__init__(W + 2 * MX, H, bg)

    def mask(self, pts):
        if isinstance(pts, Image.Image):
            return pts
        return super().mask([(p[0] + MX, p[1]) for p in pts])

    def disc(self, cx, cy, rx, ry=None, col=BONE, clip=None, cut=None):
        return super().disc(cx + MX, cy, rx, ry, col, clip, cut)


def giant(cv, who, cx, foot, h, face, inks=None):
    """One of the four as a shadow over the city: the figure in the night's violets, his sign in its full ink.
    Returns (his anchors, his sign's shapes [(ink, points)])."""
    inks = inks or SHADOW
    parts, anchors = who('stand')
    signs = []
    for ink, pts in parts:
        q = turned(pts, cx, foot, 0, h / 100.0, face)
        cv.poly(q, inks.get(ink, ink))
        if ink not in inks:
            signs.append((ink, q))
    return {k: turned([p], cx, foot, 0, h / 100.0, face)[0] for k, p in anchors.items()}, signs


def skyline(cv, y0, y1, base, seed=0, skip=None, x0=-60, x1=W + 60):
    """The city far off: black blocks side by side, their roofs between y0 and y1, down to `base`. Returns them:
    [(mask, x0, x1, top)]."""
    x, i, out = x0, 0, []
    while x < x1:
        w = 44 + bead(seed + i * 3) * 70
        top = y0 + bead(seed + i * 3 + 1) * (y1 - y0)
        if not (skip and x + w > skip[0] and x < skip[1]):
            out.append((cv.poly(slab(x, top, x + w + 2, base + 4, seed + i, 2.5), INK), x, x + w, top))
            if bead(seed + i * 3 + 2) > 0.72:                 # a water tank, a mast
                cv.poly(slab(x + w * 0.3, top - 16, x + w * 0.3 + 14, top + 2, seed + i + 50, 1.5), INK)
        x += w
        i += 1
    return out


def windows():
    """His building's windows: [(x, y, w, h, floor)], floor 0 the top one: two big ones a floor."""
    return [(B['x0'] + dx, B['roof'] + 20 + f * FLOOR, 22, 26, f) for f in range(4) for dx in (16, 58)]


ROOF_FLAMES = ((22, 44, 100), (52, 30, 62))    # the fire on the roof: (from the wall's left, its width, its height)


def tongue(cv, x, y, w, h, lean=0.0, seed=0, clip=None, tf=None, cores=3):
    """A flame from (x, y) its foot's middle: cut tongues one in the other, orange, yellow, a white-hot core (cores 2:
    without it), leaning with the wind."""
    for k, ink in list(zip((1.0, 0.6, 0.28), (FIRE, FIRE_L, BONE)))[:cores]:
        ww, hh, ln = w * k, h * k, lean * k
        j = (bead(seed + k * 10) - 0.5) * w * 0.12
        pts = [(x - ww / 2, y), (x - ww * 0.4 + ln * 0.3 + j, y - hh * 0.5), (x - ww * 0.12 + ln * 0.5, y - hh * 0.38), (x + ln, y - hh),
               (x + ww * 0.3 + ln * 0.55 - j, y - hh * 0.44), (x + ww / 2, y)]
        cv.poly(tf(pts) if tf else pts, ink, clip)


def tenement(cv, live):
    """His building, a tenement cut in a few big shapes like the rest of the poster: a crooked block under its
    cornice, the water tank on the roof, the fire escape down its side as a Z, two big windows a floor; the top floor
    on fire. live: no window and no flame (the game cuts them: dark, lit, burning)."""
    x0, x1, roof, base = B['x0'], B['x1'], B['roof'], B['base']
    cv.poly(slab(x0, roof, x1, base, 91, 4), INK)
    cv.poly(slab(x0 - 8, roof - 9, x1 + 8, roof + 4, 92, 3), INK)                             # the cornice
    cv.poly([(x1 - 50, roof - 6), (x1 - 8, roof - 7), (x1 - 12, roof - 50), (x1 - 46, roof - 48)], INK)   # the water tank
    cv.poly([(x1 - 55, roof - 46), (x1 - 4, roof - 48), (x1 - 30, roof - 70)], INK)
    # the fire escape: two landings and the stair between them
    ya, yb = roof + 20 + FLOOR + 30, roof + 20 + 2 * FLOOR + 30
    for y in (ya, yb):
        cv.poly(slab(x0 - 34, y - 4, x0 + 4, y + 4, 95 + y, 1.5), INK)
        cv.poly(slab(x0 - 34, y - 26, x0 - 27, y + 2, 96 + y, 1), INK)
    cv.bar((x0 - 6, ya), (x0 - 28, yb), 7, INK)
    if not live:
        for i, (x, y, w, h, f) in enumerate(windows()):
            q = slab(x, y, x + w, y + h, 60 + i, 2.5)
            if f == 0:
                cv.poly(q, FIRE)
                tongue(cv, x + w / 2, y + 6, w, 30 + 8 * i, 6, i, cores=2)                  # licking up the wall
            else:
                cv.poly(q, FIRE_L if (f == 1 and i % 2) or (f == 2 and i % 2 == 0) else NIGHT_L)
        for k, (dx, w, h) in enumerate(ROOF_FLAMES):
            tongue(cv, x0 + dx, roof - 6, w, h, 16, 20 + k)


def smoke(cv, x, y, n, glow, seed=0, reach=150, rise=250):
    """A column of smoke off the roof: crooked lumps going up and bending with the wind, growing; black before the
    fire's glow, a violet over the night."""
    for i in range(n):
        k = (i + 0.5) / n
        r = 15 + 40 * k
        cx, cy = x + reach * k * k, y - rise * k
        pts = [(cx + (c + (bead(seed + i * 9 + j) - 0.5) * 0.3) * r, cy + (s + (bead(seed + i * 9 + j + 4) - 0.5) * 0.3) * r * 0.8)
               for j, (c, s) in enumerate(((-1, -0.3), (-0.5, -1), (0.4, -0.9), (1, -0.2), (0.8, 0.7), (-0.1, 1), (-0.9, 0.6)))]
        cv.poly(pts, INK, clip=glow)
        cv.poly(pts, NIGHT_L, cut=glow)


def sky_layer():
    """The night, and the four over the city: CUEBALL and JITTERS on the left, LUCKY and THE BOSS on the right, all
    turned to him. Returns (the layer, their signs' shapes by name, the cigar's tip)."""
    cv = Wide(NIGHT)
    signs = {}
    _, signs['cueball'] = giant(cv, poster.cueball, 122, 650, 380, 1)
    _, signs['jitters'] = giant(cv, poster.jitters, 288, 640, 380, 1)
    boss, signs['boss'] = giant(cv, poster.boss, 1082, 650, 380, -1)
    _, signs['lucky'] = giant(cv, poster.lucky, 908, 640, 340, -1)
    return cv, signs, boss['ember']


def city_layer(live=False):
    """The fire's glow, the city black before it, its light thrown on the blocks about, his building. Returns (the
    layer, the glow's mask)."""
    cv = Wide(None)
    gx, gy, gr = GLOW
    glow = cv.disc(gx, gy, gr, col=FIRE_D)
    blocks = skyline(cv, 462, 500, 526, 3, skip=(B['x0'] - 34, B['x1'] + 8))
    mid = (B['x0'] + B['x1']) / 2
    for m, x0, x1, top in blocks:                              # the fire on the facades about: a wedge down from the roof's near end
        d = min(abs(x0 - mid), abs(x1 - mid))
        if d < 190 and not (x1 > RUNNER_AT[0] - 80 and x0 < RUNNER_AT[0] + 90):                # not behind him: it would read as his
            near, far = (x1, x0) if x1 < mid else (x0, x1)
            if abs(near - gx) < gr - 30:                       # before the glow only: over the night it reads as a flag
                cv.poly([(near, top - 6), (near + (far - near) * 0.55, top - 6), (near, top + 44 - d * 0.15)], FIRE_DD, clip=m)
            cv.poly([(near - 3, top - 6), (near + 3, top - 6), (near + 3, top + 30 - d * 0.1), (near - 3, top + 30 - d * 0.1)], FIRE, clip=m)
    tenement(cv, live)
    if not live:
        smoke(cv, B['x0'] + 30, B['roof'] - 60, 6, glow, 5)
        smoke(cv, B['x0'] + 70, B['roof'] - 70, 4, glow, 31, 110, 170)
    return cv, glow


def front_layer():
    """The wet street, the fire and the city's neons come back off it in broken bars, and THE RUNNER on it, black,
    the fire on his edges."""
    cv = Wide(None)
    gx = GLOW[0]
    cv.poly([(-90, 524), (W + 90, 522), (W + 90, H + 10), (-90, H + 10)], INK)
    for i in range(6):
        u = (i + 0.5) / 6
        y, w = 532 + 48 * u ** 1.2, 120 + 260 * u
        x = gx + (bead(i + 30) - 0.5) * 50 * u
        cv.poly(slab(x - w * 0.5, y, x + w * 0.08, y + 5 + 5 * u, i, 1 + u), FIRE_D if i % 3 else FIRE)
        cv.poly(slab(x + w * 0.16, y + 2, x + w * 0.5, y + 6 + 4 * u, i + 20, 1 + u), FIRE_D)
    for x, y, w, ink in ((70, 542, 90, PINK_D), (250, 558, 60, CYAN_D), (960, 550, 110, PINK_D), (1070, 564, 50, CYAN_D)):
        cv.poly(slab(x, y, x + w, y + 6, x, 1.5), ink)
    man = Wide(None)
    poster.man(man, poster.runner, RUNNER_AT[0], RUNNER_AT[1], RUNNER_AT[2], face=-1)
    cv.im.alpha_composite(man.im)
    # the fire on his edges: what of him has nothing of him 5 px to its right, down to the street's edge (his coat's tails take it)
    a = man.im.split()[3]
    moved = Image.new('L', a.size, 0)
    moved.paste(a, (-5, 0))
    rim = ImageChops.subtract(a, moved)
    keep = Image.new('L', a.size, 0)
    keep.paste(255, (0, 226, a.size[0], 524))
    cv.im.paste(FIRE + (255,), (0, 0), ImageChops.multiply(rim, keep))
    return cv


def flat(layer):
    """A layer as the sheet sees it at rest."""
    return layer.im.crop((MX, 0, MX + W, H))


def poster_art():
    """A. THE NEON POSTER as one still (the key art): the three layers at rest, the flames, the smoke, a few embers,
    the logo."""
    sky, _, _ = sky_layer()
    city, _ = city_layer()
    im = flat(sky).convert('RGBA')
    im.alpha_composite(flat(city))
    cv = Cv(W, H, None)
    for i in range(16):                                                                      # embers
        x, y = B['x0'] + bead(i + 70) * 150, 110 + bead(i + 80) * 210
        s = 6 if i % 3 else 4
        cv.poly(_r(x, y, x + s, y + s), FIRE_L if i % 2 else FIRE)
    im.alpha_composite(cv.im)
    im.alpha_composite(flat(front_layer()))
    lg, _ = logo()
    im.alpha_composite(lg, LOGO_AT)
    return im.convert('RGB')


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
PHOTO = (166, 300, -6.0)        # the photo of his flat: its middle, its lean
MATCHBOOK = (548, 432, 13.0)
BOARD_LOGO = (40, 30)           # the small logo's sheet on the board
LOGO_K = 0.5
BAR = [(560, -10), (860, -10), (520, H + 10), (220, H + 10)]      # the lamp's light across the board
BAR_Y = (27, 597)               # ...cut to the board


def ink_of(cv, col):
    return col + (255,) if cv.im.mode == 'RGBA' else col


def pasted(cv, mask, at, deg, ink):
    """A lettering mask laid turned deg about its middle, its middle at `at`."""
    m = mask.rotate(-deg, Image.NEAREST, expand=True) if deg else mask
    cv.im.paste(ink_of(cv, ink), (round(at[0] - m.size[0] / 2), round(at[1] - m.size[1] / 2)), m)


def pin(cv, x, y, ink=BONE):
    cv.disc(x + 3, y + 4, 7, col=INK)
    cv.disc(x, y, 7, col=ink)
    cv.disc(x - 2, y - 2, 2, col=BONE if ink != BONE else BONE_D)


def card_pin(t):
    (cx, cy), deg = t[4], t[5]
    return turned([(0, -CARD[1] / 2 + 12)], cx, cy, deg)[0]


def card_cross(t):
    """The X that crosses a dead man out: two marker strokes [(from, to, its width at the start, at the end)]."""
    (cx, cy), deg = t[4], t[5]
    w, h = CARD
    a, b, c, d = turned([(-w / 2 + 10, -h / 2 + 22), (w / 2 - 12, h / 2 - 56), (w / 2 - 8, -h / 2 + 26), (-w / 2 + 14, h / 2 - 60)], cx, cy, deg)
    return [(a, b, 22, 15), (c, d, 22, 15)]


def card_tag(t):
    """Where the NEXT tag sits on a card: (its middle, its lean)."""
    (cx, cy), deg = t[4], t[5]
    return turned([(CARD[0] / 2 - 34, -CARD[1] / 2 + 2)], cx, cy, deg)[0], deg + 6


def target_card(cv, t, state, live=False):
    """A target's card pinned to the board. state: 'next' (in his card's ink), 'later' (in the board's violet) or
    'dead' (gone dark). live: without the X and the NEXT tag (the game cuts them)."""
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
    if not live:
        if state == 'dead':
            for a, b, w0, w1 in card_cross(t):
                cv.bar(a, b, w0, BLOOD, w1=w1)
        if state == 'next':
            at, lean = card_tag(t)
            cv.poly(turned(slab(-36, -13, 36, 13, seed + 9, 2), at[0], at[1], lean), FIRE)
            pasted(cv, text_mask('NEXT', 16), at, lean, INK)
    p = card_pin(t)
    pin(cv, p[0], p[1], FIRE if state == 'next' else BONE)


def photo(cv, live=False):
    """The photo of his flat on fire: a bone print, the block black in the fire's glow. Returns its pin."""
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
    cv.poly(turned(_r(-34, -34, 38, -28), cx, cy, deg), INK, clip=m)                          # its cornice
    cv.poly(turned([(14, -34), (32, -34), (31, -50), (15, -50)], cx, cy, deg), INK, clip=m)   # its water tank
    for r in range(3):
        for c in range(2):
            cv.poly(turned(_r(-20 + c * 26, -18 + r * 24, -4 + c * 26, -4 + r * 24), cx, cy, deg), FIRE if r < 2 else NIGHT_L, clip=m)
    if not live:
        for x, w_, h_, k in ((-8, 22, 40, 3), (10, 16, 26, 4)):
            tongue(cv, x, -30, w_, h_, 5, k, clip=m, tf=lambda q: turned(q, cx, cy, deg))
    pasted(cv, text_mask('HOME', 20), turned([(0, h / 2 - 28)], cx, cy, deg)[0], deg, INK)
    p = turned([(0, -h / 2 + 10)], cx, cy, deg)[0]
    pin(cv, p[0], p[1])
    return p


def matchbook_pin():
    cx, cy, deg = MATCHBOOK
    return turned([(0, -46)], cx, cy, deg)[0]


def matchbook(cv):
    """The matchbook off CUEBALL's desk (level 1's ending): pink, a bone flamingo, JITTERS' mark scrawled on it."""
    cx, cy, deg = MATCHBOOK
    T = lambda pts: turned(pts, cx, cy, deg)
    quad = slab(-44, -56, 44, 56, 8, 2)
    cv.poly(T([(x + 6, y + 8) for x, y in quad]), INK)
    cv.poly(T(quad), PINK)
    cv.poly(T(_r(-45, 36, 45, 57)), INK)
    cv.poly(T(_r(-45, 42, 45, 49)), BONE_D)
    for ink, pts in FLAMINGO:
        cv.poly(T(pts), ink)
    cv.poly(T([(-38, -34), (-33, -48), (-28, -38), (-22, -50), (-16, -38), (-10, -47), (-8, -33), (-14, -36), (-20, -29), (-26, -37),
               (-32, -29)]), CYAN)                                                           # JITTERS' crest, scrawled
    p = matchbook_pin()
    pin(cv, p[0], p[1])
    return p


# the flamingo on the matchbook, about its cover's middle: its body, its neck in three cuts, its head, its bill, a leg
FLAMINGO = [
    (BONE, [(-20, -6), (-4, -15), (14, -10), (20, 1), (4, 8), (-12, 5)]),
    (BONE, [(10, -9), (15, -6), (25, -18), (20, -21)]), (BONE, [(25, -20), (20, -17), (13, -27), (18, -30)]),
    (BONE, [(13, -29), (18, -26), (23, -34), (18, -37)]),
    (BONE, _r(16, -40, 28, -32)), (INK, [(28, -40), (36, -35), (28, -30)]), (BONE, _r(2, 6, 6, 28)),
]


def board_bg():
    """The board on its black wall."""
    cv = Cv(W, H, INK)
    return cv, cv.poly(slab(22, 18, W - 22, H - 44, 2, 7), NIGHT)


def bar_cut():
    """The lamp's bar of light as the game cuts it: the bar between the board's top and bottom."""
    (ax, ay), (bx, _), (cx, cy), (dx, _) = BAR
    at = lambda x0, x1, y: x0 + (x1 - x0) * (y - ay) / (cy - ay)
    y0, y1 = BAR_Y
    return [(at(ax, dx, y0), y0), (at(bx, cx, y0), y0), (at(bx, cx, y1), y1), (at(ax, dx, y1), y1)]


def board_pins(done):
    """The pins the red string runs through, as far as he has got: his flat, the dead, the matchbook, the next."""
    cx, cy, deg = PHOTO
    pins = [turned([(0, -214 / 2 + 10)], cx, cy, deg)[0], card_pin(TARGETS[0])]
    if done >= 1:
        pins.append(matchbook_pin())
        pins += [card_pin(t) for t in TARGETS[1:done + 1]]
    return pins


def board_overlay(done, live=False):
    """What is pinned to the board, on a clear sheet: the small logo, the photo of his flat, the four cards in the
    order he takes them, the matchbook once CUEBALL is done. done: how many of them are dead (0..4)."""
    cv = Cv(W, H, None)
    im, _ = logo(LOGO_K)
    cv.im.alpha_composite(im, BOARD_LOGO)
    photo(cv, live)
    for i, t in enumerate(TARGETS):
        target_card(cv, t, 'dead' if i < done else 'next' if i == done else 'later', live)
    if done >= 1:
        matchbook(cv)
    return cv


def board_art(done=0):
    """B. THE HIT LIST as one still: the board, the lamp's bar of light, what is pinned, the red string from pin to
    pin."""
    cv, board = board_bg()
    cv.poly(bar_cut(), NIGHT_L, clip=board)
    im = cv.im.convert('RGBA')
    im.alpha_composite(board_overlay(done).im)
    top = Cv(W, H, None)
    pins = board_pins(done)
    for a, b in zip(pins, pins[1:]):
        top.bar((a[0], a[1] + 1), (b[0], b[1] + 1), 5, BLOOD)
    for p in pins:
        top.disc(p[0], p[1], 4, col=BLOOD)
    im.alpha_composite(top.im)
    return im.convert('RGB')


# ---------------------------------------------------------------- the options: what he carries, laid out
# OPTIONS is his table seen from above, the satchel emptied on it under a lamp: a thing a section, down the left (the
# walkman: AUDIO; the portable set: VIDEO; the knuckles: CONTROLS; the notebook: GAME; his cap: BACK). The game lifts
# the chosen one onto a slab of an ink that is not its own, and cuts its settings on a sheet of paper beside it
# (src/game/ui/title/Options.js).
THING = (240, 132)                             # a thing's cell in the sheet of them (its middle the thing's)
# name, its middle on the table, how it leans, the slab under it when it is the one chosen
THINGS = [('audio', (196, 84), -4, PINK), ('video', (344, 212), 3, CYAN), ('controls', (190, 326), -6, FIRE_D), ('game', (340, 446), 5, CYAN_D),
          ('back', (176, 566), -8, PINK_D)]
REELS = [(-26, 4), (22, 4)]                    # the walkman's reels about its middle (the game turns them)
SCREEN = (-52, -34, 38, 30)                    # the set's screen about its middle: x0, y0, x1, y1 (the game rolls a bar down it)


def thing(cv, name, cx, cy):
    """One of the five, about (cx, cy): a few flat shapes, no line."""
    T = lambda pts: [(cx + x, cy + y) for x, y in pts]
    if name == 'audio':                                      # a walkman, its cassette showing, the headphones' band
        cv.path(T([(40, -30), (78, -48), (102, -22), (98, 10)]), 9, INK)
        cv.poly(T(slab(86, 4, 110, 34, 3, 2)), CYAN)
        cv.poly(T(slab(-64, -40, 58, 44, 1, 4)), INK)
        cv.poly(T(slab(-50, -20, 46, 28, 2, 2)), BONE)
        cv.poly(T(slab(-50, -20, 46, -8, 4, 1)), CYAN)
        for x, y in REELS:
            cv.disc(cx + x, cy + y, 12, col=INK)
        for k in range(3):
            cv.poly(T(slab(-44 + k * 22, -52, -28 + k * 22, -38, 5 + k, 1)), BONE_D)
    elif name == 'video':                                    # a portable set: its screen, two dials, its aerial
        cv.bar((cx + 6, cy - 40), (cx - 40, cy - 64), 6, BONE_D)
        cv.bar((cx + 12, cy - 40), (cx + 62, cy - 62), 6, BONE_D)
        cv.poly(T(slab(-68, -46, 72, 46, 7, 4)), INK)
        cv.poly(T(slab(SCREEN[0], SCREEN[1], SCREEN[2], SCREEN[3], 8, 3)), PINK)
        cv.poly(T([(-46, -30), (-18, -30), (-40, 2), (-48, 2)]), BONE)
        for y in (-18, 12):
            cv.disc(cx + 54, cy + y, 9, col=BONE_D)
    elif name == 'controls':                                 # brass knuckles: four rings on a bar
        holes = cv.blank()
        for k in range(4):
            x, y = cx - 51 + k * 34, cy - 12 + (0 if k in (1, 2) else 5)
            ImageDraw.Draw(holes).ellipse([x - 9, y - 9, x + 9, y + 9], fill=255)
        for k in range(4):
            cv.disc(cx - 51 + k * 34, cy - 12 + (0 if k in (1, 2) else 5), 19, col=BONE, cut=holes)
        cv.poly(T([(-66, 4), (66, 2), (60, 38), (-58, 40)]), BONE_D, cut=holes)
    elif name == 'game':                                     # his notebook, a pencil across it
        cv.poly(T(slab(-56, -44, 56, 46, 9, 4)), BONE)
        cv.poly(T(slab(-56, -44, 56, -28, 10, 2)), PINK_D)
        for k in range(6):
            cv.poly(T(_r(-46 + k * 18, -50, -38 + k * 18, -34)), INK)
        for k, w in enumerate((70, 84, 52)):
            cv.poly(T(slab(-42, -12 + k * 18, -42 + w, -6 + k * 18, 11 + k, 1)), BONE_D)
        cv.bar((cx - 30, cy + 44), (cx + 62, cy - 8), 8, FIRE)
        cv.poly(T([(57, -12), (78, -18), (67, -1)]), INK)
    else:                                                    # his cap, from above (poster.RUNNER_CAP): the way out
        for ink, pts in poster.RUNNER_CAP:
            cv.poly(turned(pts, cx - 6, cy, 0, 4.6), ink)


def things_sheet():
    """The five things one under the other, each in its cell, and beside each its black cut-out (its shadow)."""
    w, h = THING
    cv = Cv(w * 2, h * len(THINGS), None)
    for i, (name, _, _, _) in enumerate(THINGS):
        thing(cv, name, w / 2, i * h + h / 2)
    a = cv.im.split()[3]
    cv.im.paste(INK + (255,), (w, 0), a.crop((0, 0, w, cv.h)))
    return cv


def options_bg():
    """His table from above: boards on a slant, the lamp's pool where his things lie, the satchel they came out of,
    its strap across the corner."""
    cv = Cv(W, H, NIGHT)
    poster.boards(cv, -150, 74, NIGHT_L, seed=4)
    pool = cv.disc(250, 330, 330, 380, NIGHT_LL)
    poster.board_gaps(cv, -150, 74, NIGHT_L, pool, w=5)
    cv.path([(-20, 470), (60, 520), (40, 610), (120, 670)], 20, BROWN)                        # the strap
    cv.poly([(-30, -30), (150, -30), (118, 60), (60, 104), (-30, 96)], BROWN)                 # the satchel's corner, its flap open
    cv.poly([(-30, -30), (96, -30), (70, 40), (-30, 52)], INK)
    cv.poly(slab(86, 44, 104, 62, 3, 1), BONE_D)                                               # its buckle
    return cv


def options_art(chosen=0):
    """The options as one still: the table, the things, the chosen one on its slab (the sheet of settings is the
    game's)."""
    cv = options_bg()
    w, h = THING
    sheet = things_sheet().im
    for i, (name, (x, y), deg, ink) in enumerate(THINGS):
        if i == chosen:
            cv.poly(turned(slab(-w / 2 + 8, -h / 2 + 6, w / 2 - 8, h / 2 - 6, i * 3, 5), x, y, deg), ink)
        cell = sheet.crop((0, i * h, w, (i + 1) * h))
        cv.im.paste(cell, (round(x - w / 2), round(y - h / 2)), cell)
    return cv.im
