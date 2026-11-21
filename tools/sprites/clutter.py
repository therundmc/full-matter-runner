"""A bar's life: what stands on its furniture (the `clutter` group, systems/Clutter.js). Small, flat, a few
shades off what they stand on: they must never read as a weapon on the floor or as something in the way. FINE
density."""
import math
import random

from .core import ashtray, CLEAR, Cv, dk, fill_capsule, fill_shape, frect, hx, light, line, lt, ramp, ring, shade
from .palette import CASH, KHAKI, LINEN, NEON_GREEN, PAPER_WHITE, PARCHMENT, PURE_WHITE, PUTTY, STEEL_L


BEER = ramp('#d89a2a', 0.45, 0.22, 0.35)
FOAM = hx('#f2ead6')
GLASS_RIM = hx('#d8e4ea')
WHISKY = hx('#c47a26')


def drink_glass(cv, cx, cy, r, level, rng):
    """A straight glass from above: its lit rim, what is in it (level 1 full with a head of foam, 0.5 half, 0 the
    foam's lacing on the empty glass), the bottom's ring through it, a glint."""
    fill_shape(cv, cx, cy, r, r, lambda u, v, L: GLASS_RIM if L > 0.62 else hx('#9aaab4'))
    inner = r - 0.6
    if level >= 1:
        fill_shape(cv, cx, cy, inner, inner, lambda u, v, L: FOAM if math.hypot(u + 0.25, v + 0.25) < inner * 0.72 else BEER[2])
        cv.dot(cx + inner * 0.45, cy + inner * 0.45, BEER[1])
    elif level > 0:
        fill_shape(cv, cx, cy, inner, inner, lambda u, v, L: shade(BEER, 0.35 + 0.3 * L))
        ring(cv, cx, cy, inner * 0.55, inner * 0.7, lambda dx, dy, d: lt(BEER[2], 0.25) if dx + dy < 0 else None)
    else:
        fill_shape(cv, cx, cy, inner, inner, lambda u, v, L: hx('#6c7a84') if L < 0.5 else hx('#86949e'))
        for _ in range(4):                                             # the foam's lacing down the inside
            a = rng.uniform(0, 2 * math.pi)
            cv.dot(cx + math.cos(a) * inner * 0.75, cy + math.sin(a) * inner * 0.75, PUTTY)
    cv.dot(cx - r * 0.5, cy - r * 0.5, PURE_WHITE)


def c_pint(level, seed):
    def paint():
        cv = Cv(5, 5)
        drink_glass(cv, 2.5, 2.5, 1.95, level, random.Random(seed))
        cv.outline()
        return cv
    return paint


def c_pitcher():
    """A plastic pitcher of draught: the round jug, its handle and spout, the beer under a head."""
    cv = Cv(8, 7)
    fill_capsule(cv, [(5.6, 2.4), (7.0, 2.4), (7.0, 4.6), (5.6, 4.6)], 0.45, lambda k, L, s, i, t: hx('#c8d4dc') if L > 0.6 else hx('#8a98a2'))
    drink_glass(cv, 3.4, 3.5, 2.8, 1, random.Random(7101))
    fill_shape(cv, 0.9, 3.5, 0.6, 0.8, lambda u, v, L: GLASS_RIM)     # the spout
    cv.outline()
    return cv


def c_shot():
    cv = Cv(3, 3)
    fill_shape(cv, 1.5, 1.5, 1.2, 1.2, lambda u, v, L: GLASS_RIM if L > 0.6 else hx('#8a98a2'))
    fill_shape(cv, 1.55, 1.55, 0.7, 0.7, lambda u, v, L: hx('#8a4418'))
    cv.dot(1.0, 1.0, PURE_WHITE)
    cv.outline()
    return cv


def c_lowball():
    """A heavy whisky glass: two fingers of whisky, an ice cube in it."""
    cv = Cv(5, 5)
    fill_shape(cv, 2.5, 2.5, 2.0, 2.0, lambda u, v, L: GLASS_RIM if L > 0.6 else hx('#8a98a2'))
    fill_shape(cv, 2.55, 2.55, 1.35, 1.35, lambda u, v, L: WHISKY if u + v > -0.5 else lt(WHISKY, 0.2))
    fill_shape(cv, 2.2, 2.4, 0.65, 0.6, lambda u, v, L: hx('#eef4f6') if L > 0.5 else hx('#c4d4dc'), ang=0.4, kind='rect', corner=0.2, bevel=0.3)
    cv.dot(1.25, 1.25, PURE_WHITE)
    cv.outline()
    return cv


def c_beer_bottle():
    """A brown beer bottle standing, from above: its shoulders round the neck, the gold cap."""
    cv = Cv(4, 4)
    fill_shape(cv, 2.0, 2.0, 1.6, 1.6, lambda u, v, L: shade(ramp('#5a3410', 0.5, 0.25, 0.5), L))
    fill_shape(cv, 2.0, 2.0, 0.75, 0.75, lambda u, v, L: hx('#e0b448') if L > 0.5 else hx('#a8802a'))
    cv.outline()
    return cv


def c_liquor():
    """A square whisky bottle from above: dark amber glass, its black cap, the label's edge."""
    cv = Cv(5, 5)
    fill_shape(cv, 2.5, 2.5, 1.9, 1.9, lambda u, v, L: shade(ramp('#7a3c12', 0.5, 0.25, 0.5), L), kind='rect', corner=0.5, bevel=0.7)
    frect(cv, 0.7, 3.4, 4.3, 4.0, PARCHMENT)                      # the label round its foot
    fill_shape(cv, 2.5, 2.5, 0.8, 0.8, lambda u, v, L: hx('#2a2628') if L < 0.6 else hx('#4a4448'))
    cv.outline()
    return cv


def c_ashtray():
    cv = Cv(6, 6)
    ashtray(cv, 3.0, 3.0, random.Random(7102), 2.4)
    cv.outline()
    return cv


def c_cigar():
    """A cigar laid down to burn: brown leaf, the gold band, grey ash and the ember at its tip."""
    cv = Cv(7, 3)
    fill_capsule(cv, [(1.4, 1.5), (5.6, 1.5)], 0.75, lambda k, L, s, i, t: shade(ramp('#6a4022', 0.5, 0.25, 0.3), L))
    frect(cv, 4.3, 0.8, 4.9, 2.2, hx('#d8a838'))
    frect(cv, 0.8, 0.9, 1.6, 2.1, hx('#9a9690'))
    cv.dot(0.75, 1.5, hx('#ff6a1a'))
    cv.outline()
    return cv


def c_coaster():
    """A cardboard beer mat: cream, a red ring printed round it."""
    cv = Cv(5, 5)
    fill_shape(cv, 2.5, 2.5, 2.0, 2.0, lambda u, v, L: hx('#e4dac4') if L > 0.4 else hx('#cfc4ac'))
    ring(cv, 2.5, 2.5, 1.2, 1.6, lambda dx, dy, d: hx('#b8323a'))
    cv.outline(dk(hx('#cfc4ac'), 0.55))
    return cv


def c_napkin():
    """A paper napkin folded in four, a corner turned back."""
    cv = Cv(5, 5)
    fill_shape(cv, 2.5, 2.5, 1.9, 1.9, lambda u, v, L: hx('#d8d2c4') if u - v < 0 else hx('#beb6a8'), kind='rect', corner=0.3, bevel=0.5)
    line(cv, 0.8, 0.8, 4.2, 4.2, hx('#aaa294'))
    cv.outline(dk(hx('#beb6a8'), 0.55))
    return cv


def c_napkin_crumpled():
    cv = Cv(4, 4)
    rng = random.Random(7103)
    fill_shape(cv, 2.0, 2.0, 1.5, 1.3, lambda u, v, L: hx('#d4ccbe') if L > 0.5 else hx('#b4ac9c'), ang=0.5)
    for _ in range(3):
        cv.dot(rng.uniform(1.0, 3.0), rng.uniform(1.0, 3.0), hx('#b0a898'))
    cv.outline(dk(hx('#c8c0b0'), 0.55))
    return cv


def c_peanuts():
    """A steel bowl of peanuts in their shells."""
    cv = Cv(6, 6)
    ring(cv, 3.0, 3.0, 2.0, 2.5, lambda dx, dy, d: shade(STEEL_L, 0.2 + 0.85 * light(dx / d, dy / d)))
    fill_shape(cv, 3.0, 3.0, 2.0, 2.0, lambda u, v, L: KHAKI)
    rng = random.Random(7104)
    for _ in range(7):
        x, y, a = rng.uniform(1.8, 4.2), rng.uniform(1.8, 4.2), rng.uniform(0, math.pi)
        fill_shape(cv, x, y, 0.75, 0.42, lambda u, v, L: hx('#d8b070') if L > 0.55 else hx('#b08848'), ang=a)
    cv.outline()
    return cv


def c_till():
    """The bar's cash register, its keys toward the bartender (-y): a cream steel case, rows of keys, the green
    display at the back, the drawer's lip and the paper roll."""
    cv = Cv(13, 10)
    case = ramp('#b8b09c', 0.5, 0.25, 0.35)
    fill_shape(cv, 6.5, 5.0, 5.5, 4.0, lambda u, v, L: shade(case, L), kind='rect', corner=0.8, bevel=1.0)
    frect(cv, 2.0, 7.0, 11.0, 8.3, hx('#5a5448'))                     # the display's hood, at the back
    frect(cv, 3.0, 7.3, 8.0, 8.0, NEON_GREEN)                      # its digits' glow
    for k in range(4):
        for j in range(5):
            c = hx('#e8e2d0') if (j + k) % 4 else hx('#c8323a')
            frect(cv, 2.2 + j * 1.6, 1.8 + k * 1.2, 3.2 + j * 1.6, 2.6 + k * 1.2, c)
    fill_shape(cv, 11.0, 2.2, 0.9, 0.9, lambda u, v, L: PAPER_WHITE if L > 0.5 else hx('#d0c8b8'))   # the paper roll
    frect(cv, 1.5, 0.9, 11.5, 1.3, lambda c: dk(c, 0.3) if c[3] else None)   # the drawer's lip
    cv.outline()
    return cv


def c_cards():
    """A hand of three cards fanned out, face up."""
    cv = Cv(7, 6)
    for (x, a, pip) in ((2.0, -0.5, '#c01828'), (3.5, 0.0, '#1a1420'), (5.0, 0.5, '#c01828')):
        fill_shape(cv, x, 3.0, 1.15, 1.7, lambda u, v, L: hx('#f2ece0') if L > 0.5 else hx('#d8d0c2'), ang=a, kind='rect', corner=0.3, bevel=0.5)
        fill_shape(cv, x + math.sin(a) * 0.6, 3.0 - math.cos(a) * 0.6, 0.4, 0.5, lambda u, v, L, pip=pip: hx(pip), ang=a, kind='super', p=1.2)
    cv.outline()
    return cv


def c_chips():
    """A short stack of poker chips: the top one's rim marks."""
    cv = Cv(4, 4)
    fill_shape(cv, 2.0, 2.0, 1.5, 1.5, lambda u, v, L: shade(ramp('#c8303a', 0.45, 0.22, 0.35), L))
    for a in (0.3, 1.9, 3.5, 5.1):
        cv.dot(2.0 + math.cos(a) * 1.15, 2.0 + math.sin(a) * 1.15, LINEN)
    cv.dot(2.0, 2.0, hx('#e8a0a4'))
    cv.outline()
    return cv


def banknote(cv, cx, cy, w, h, a):
    green = CASH
    fill_shape(cv, cx, cy, w, h, lambda u, v, L: shade(green, L) if abs(u) > w * 0.25 else hx('#86b070'), ang=a, kind='rect', corner=0.2, bevel=0.4)


def c_bands():
    """A bundle of banknotes in its paper band."""
    cv = Cv(7, 4)
    banknote(cv, 3.5, 2.0, 2.6, 1.3, 0.0)
    frect(cv, 3.0, 0.7, 4.0, 3.3, hx('#e4d8b4'))
    cv.dot(3.25, 1.5, hx('#b8a878'))
    cv.outline()
    return cv


def c_bill():
    cv = Cv(5, 3)
    banknote(cv, 2.5, 1.5, 1.9, 1.0, 0.0)
    cv.outline(dk(hx('#5a8a4a'), 0.55))
    return cv


def c_rubber_bands():
    cv = Cv(5, 5)
    for (x, y, r, col) in ((2.2, 2.4, 1.3, '#c8a058'), (3.0, 2.8, 1.1, '#b84a3a'), (2.6, 2.0, 0.9, '#c8a058')):
        ring(cv, x, y, r - 0.35, r, lambda dx, dy, d, col=col: hx(col))
    return cv


def c_baggies():
    """Two small zip bags of white powder."""
    cv = Cv(6, 4)
    for (x, y, a) in ((2.0, 2.0, 0.2), (4.0, 2.2, -0.3)):
        fill_shape(cv, x, y, 1.4, 1.1, lambda u, v, L: hx('#f0eee8') if L > 0.45 else hx('#cfcac0'), ang=a, kind='rect', corner=0.3, bevel=0.5)
        cv.dot(x - 0.9, y - 0.6, hx('#9ab8cc'))                       # the zip
    cv.outline()
    return cv


def c_glass_broken():
    """What a glass shot where it stood leaves: its foot, a few shards, the drink in a wet ring round them."""
    cv = Cv(6, 6)
    fill_shape(cv, 3.0, 3.0, 2.6, 2.2, lambda u, v, L: hx('#5a3810', 120), ang=0.4)
    rng = random.Random(7105)
    ring(cv, 3.0, 3.0, 1.0, 1.4, lambda dx, dy, d: GLASS_RIM if rng.random() < 0.6 else None)
    for _ in range(4):
        cv.dot(rng.uniform(1.0, 5.0), rng.uniform(1.0, 5.0), hx('#e8f4fa'))
    return cv


# the VIP room's: champagne, its flutes and its bucket, the singles thrown at the dancer (flat, crumpled, folded to tuck
# in), a boa's feathers, a cork, a garter; kept a few shades off the carpet they lie on, smaller than any weapon
CHAMPAGNE = hx('#e2cc84')
BOA = ramp('#e8609a', 0.45, 0.22, 0.3)


def c_flute():
    """A champagne flute standing, from above: the narrow bowl's lit rim, the pale gold wine, a bubble, a glint."""
    cv = Cv(4, 4)
    fill_shape(cv, 2.0, 2.0, 1.55, 1.55, lambda u, v, L: GLASS_RIM if L > 0.62 else hx('#9aaab4'))
    fill_shape(cv, 2.05, 2.05, 1.0, 1.0, lambda u, v, L: lt(CHAMPAGNE, 0.3) if u + v < -0.4 else CHAMPAGNE)
    cv.dot(2.4, 2.3, hx('#fff6d6'))
    cv.dot(1.0, 1.0, PURE_WHITE)
    cv.outline()
    return cv


def c_flute_down():
    """A flute knocked over on the floor: its foot on edge, the stem, the bowl lying along, a last drop at its lip."""
    cv = Cv(7, 3)
    fill_shape(cv, 1.1, 1.5, 0.5, 1.2, lambda u, v, L: GLASS_RIM if L > 0.6 else hx('#8a98a2'))
    line(cv, 1.6, 1.5, 3.4, 1.5, hx('#c8d4dc'))
    fill_capsule(cv, [(3.9, 1.5), (5.8, 1.5)], 0.95,
                 lambda k, L, s, i, t: GLASS_RIM if L > 0.72 else hx('#a4b2bc') if k > 0.55 else hx('#c8bc88'))
    cv.dot(4.3, 1.0, PURE_WHITE)
    cv.outline()
    return cv


def c_bucket():
    """A steel champagne bucket from above: its rolled rim, crushed ice, the bottle's neck in its gold foil, a white
    cloth over the rim."""
    cv = Cv(9, 9)
    c, rng = 4.5, random.Random(7130)
    fill_shape(cv, c, c, 3.9, 3.9, lambda u, v, L: shade(STEEL_L, L))
    ice = [hx('#cfe0e8'), hx('#e6f2f6'), hx('#b4c8d2')]
    fill_shape(cv, c, c, 3.0, 3.0, lambda u, v, L: ice[rng.randrange(3)] if L > 0.3 else ice[2])
    fill_shape(cv, c + 0.7, c - 0.4, 1.6, 1.6, lambda u, v, L: shade(ramp('#1e4a2a', 0.45, 0.22, 0.5), L))
    fill_shape(cv, c + 0.7, c - 0.4, 0.8, 0.8, lambda u, v, L: hx('#e8c458') if L > 0.5 else hx('#a8822a'))
    fill_shape(cv, c - 2.4, c + 2.6, 1.6, 0.9, lambda u, v, L: hx('#f2eee6') if L > 0.45 else hx('#cac4ba'), ang=0.75)
    cv.outline()
    return cv


def c_single():
    """A one-dollar bill lying flat: the pale paper of its border, the green print inside it, the portrait's oval."""
    cv = Cv(5, 3)
    fill_shape(cv, 2.5, 1.5, 2.05, 1.05, lambda u, v, L: hx('#c8d4ac') if L > 0.5 else hx('#b0bc94'), kind='rect', corner=0.15, bevel=0.3)
    frect(cv, 1.0, 1.0, 4.0, 2.0, CASH[2])
    fill_shape(cv, 2.5, 1.5, 0.5, 0.5, lambda u, v, L: CASH[0])
    cv.outline(dk(hx('#6a8a5a'), 0.45))
    return cv


def c_singles():
    """A loose stack of one-dollar bills, fanned a little."""
    cv = Cv(7, 5)
    for (x, y, a) in ((3.3, 2.7, -0.35), (3.5, 2.4, 0.1), (3.6, 2.5, 0.42)):
        banknote(cv, x, y, 2.3, 1.05, a)
    cv.outline(dk(hx('#5a8a4a'), 0.55))
    return cv


def c_bill_crumpled():
    """A bill screwed up in a fist and thrown: a lumpy ball, its creases."""
    cv = Cv(4, 4)
    rng = random.Random(7131)
    paper = ramp('#8aa874', 0.4, 0.2, 0.35)
    fill_shape(cv, 2.0, 2.0, 1.45, 1.2, lambda u, v, L: shade(paper, L), ang=0.6, kind='super', p=1.7)
    for _ in range(4):
        cv.dot(rng.uniform(1.0, 3.0), rng.uniform(1.0, 3.0), hx('#c8d4ac') if rng.random() < 0.6 else dk(paper[1], 0.15))
    cv.outline(dk(hx('#5a8a4a'), 0.55))
    return cv


def c_bill_folded():
    """A bill folded long-ways, the way it is tucked into a garter or the stage's edge: its crease lit."""
    cv = Cv(5, 3)
    fill_shape(cv, 2.5, 1.5, 2.0, 0.7, lambda u, v, L: hx('#86b070') if v < -0.1 else CASH[1], kind='rect', corner=0.2, bevel=0.3)
    cv.outline(dk(hx('#5a8a4a'), 0.55))
    return cv


def c_feather(seed, bend):
    """A pink feather shed by a boa: a pale quill, soft barbs either side, no ink round it."""
    def paint():
        cv = Cv(5, 4)
        rng = random.Random(seed)
        pts = [(0.6 + 3.8 * t, 2.0 + bend * (t - 0.5) ** 2 * 4 - bend) for t in (k / 8 for k in range(9))]
        for (x, y) in pts[1:]:
            for side in (-1, 1):
                ln = rng.uniform(0.5, 1.3) * (1.1 - abs(x - 2.6) / 3.0)
                line(cv, x, y, x + rng.uniform(0.0, 0.5), y + side * ln, shade(BOA, rng.uniform(0.25, 0.9)))
        for (x, y) in pts:
            cv.dot(x, y, lt(BOA[3], 0.35))
        return cv
    return paint


def c_cork():
    """A champagne cork: its swollen mushroom top, the dark burn of the brand."""
    cv = Cv(3, 3)
    fill_shape(cv, 1.5, 1.5, 1.05, 1.05, lambda u, v, L: shade(ramp('#c89a5a', 0.45, 0.22, 0.3), L))
    cv.dot(1.7, 1.7, hx('#7a5630'))
    cv.outline()
    return cv


def c_sock():
    """A sock lost by the machines, from above: a white tube sock lying bent at the heel, two red rings at its top,
    its sole gone grey."""
    cv = Cv(6, 4)
    wool = ramp('#e4e0d6', 0.4, 0.2, 0.3)
    frect(cv, 0.5, 0.5, 4.0, 2.0, wool[2])
    frect(cv, 3.0, 2.0, 5.5, 3.5, wool[2])
    frect(cv, 0.5, 1.5, 4.0, 2.0, wool[1])
    frect(cv, 3.5, 3.0, 5.5, 3.5, hx('#9a968e'))                      # the sole
    for x in (1.0, 2.0):
        frect(cv, x, 0.5, x + 0.5, 2.0, hx('#c8323a'))
    cv.outline()
    return cv


def c_card():
    """One playing card dropped face down: its red back, a white border."""
    cv = Cv(3, 4)
    frect(cv, 0.5, 0.5, 2.5, 3.5, LINEN)
    frect(cv, 1.0, 1.0, 2.0, 3.0, hx('#a8282e'))
    cv.outline()
    return cv


def c_chip():
    """One poker chip on the floor: red clay, its white edge spots."""
    cv = Cv(3, 3)
    fill_shape(cv, 1.5, 1.5, 1.05, 1.05, lambda u, v, L: shade(ramp('#d8303a', 0.45, 0.22, 0.3), L))
    for (x, y) in ((1.25, 0.75), (1.75, 2.25), (0.75, 1.75), (2.25, 1.25)):
        cv.dot(x, y, LINEN)
    cv.outline()
    return cv


def c_garter():
    """A garter lost by the stage: a ring of red satin edged in black lace, a small bow."""
    cv = Cv(6, 5)
    fill_shape(cv, 3.0, 2.6, 2.5, 1.9, lambda u, v, L: hx('#1c1018') if (u + v) % 0.9 < 0.45 else hx('#3a2430'))
    fill_shape(cv, 3.0, 2.6, 2.0, 1.45, lambda u, v, L: shade(ramp('#c01838', 0.45, 0.22, 0.4), L))
    fill_shape(cv, 3.0, 2.6, 1.2, 0.75, lambda u, v, L: CLEAR)
    fill_shape(cv, 4.6, 1.1, 0.8, 0.55, lambda u, v, L: hx('#e8a0b4') if L > 0.5 else hx('#c86888'), ang=-0.5)
    cv.outline()
    return cv


GROUP = 'clutter'
SPRITES = {
    'pint_full': (c_pint(1, 7110), (5, 5), 'fine'),
    'pint_half': (c_pint(0.5, 7111), (5, 5), 'fine'),
    'pint_empty': (c_pint(0, 7112), (5, 5), 'fine'),
    'pitcher': (c_pitcher, (8, 7), 'fine'),
    'shot': (c_shot, (3, 3), 'fine'),
    'lowball': (c_lowball, (5, 5), 'fine'),
    'beer_bottle': (c_beer_bottle, (4, 4), 'fine'),
    'liquor': (c_liquor, (5, 5), 'fine'),
    'ashtray': (c_ashtray, (6, 6), 'fine'),
    'cigar': (c_cigar, (7, 3), 'fine'),
    'coaster': (c_coaster, (5, 5), 'fine'),
    'napkin': (c_napkin, (5, 5), 'fine'),
    'napkin_crumpled': (c_napkin_crumpled, (4, 4), 'fine'),
    'peanuts': (c_peanuts, (6, 6), 'fine'),
    'till': (c_till, (13, 10), 'fine'),
    'cards': (c_cards, (7, 6), 'fine'),
    'chips': (c_chips, (4, 4), 'fine'),
    'bands': (c_bands, (7, 4), 'fine'),
    'bill': (c_bill, (5, 3), 'fine'),
    'rubber_bands': (c_rubber_bands, (5, 5), 'fine'),
    'baggies': (c_baggies, (6, 4), 'fine'),
    'glass_broken': (c_glass_broken, (6, 6), 'fine'),
    'flute': (c_flute, (4, 4), 'fine'),
    'flute_down': (c_flute_down, (7, 3), 'fine'),
    'bucket': (c_bucket, (9, 9), 'fine'),
    'single': (c_single, (5, 3), 'fine'),
    'singles': (c_singles, (7, 5), 'fine'),
    'bill_crumpled': (c_bill_crumpled, (4, 4), 'fine'),
    'bill_folded': (c_bill_folded, (5, 3), 'fine'),
    'feather': (c_feather(7132, 0.0), (5, 4), 'fine'),
    'feather_curl': (c_feather(7133, 0.6), (5, 4), 'fine'),
    'cork': (c_cork, (3, 3), 'fine'),
    'garter': (c_garter, (6, 5), 'fine'),
    'sock': (c_sock, (6, 4), 'fine'),
    'card': (c_card, (3, 4), 'fine'),
    'chip': (c_chip, (3, 3), 'fine'),
}
