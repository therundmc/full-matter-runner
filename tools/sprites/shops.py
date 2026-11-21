"""Shop fronts of the street: what shows behind the lit display windows, and their small neon wall signs (same
build as the bar's: a dark backing against the wall, 1 px tubes); the alarm box over a shop's door."""
import math
import random

from .core import (
    chrome_bar, Cv, dk, fill_shape, frect, hx, layer, light, line, lt, mix, mottle, px_paint, ramp, ring, shade, shift,
    stud, wood_fill
)
from .palette import (
    CHROME, ENAMEL, GLASS, GRAPHITE, GUNMETAL, NEON_AMBER, NEON_CYAN, NEON_GREEN, NEON_PINK, NEON_YELLOW, PURE_WHITE
)
from .type import neon_text
from .neon import Neon, sign_backing
from .furniture import knob


def rack_bottle(cv, x, y, col, cap, rng):
    """A bottle seen from straight above in a rack slot (2 x 2 world px at x, y; its first pixel row, second pixel in,
    is its glass: the game reads it, DamageArt rackSlots): the shoulder, the neck, the cap, a glint."""
    q = 1.0 / cv.s
    g0, g1, g2 = lt(col, 0.45), col, dk(col, 0.35)
    for (i, j, c) in ((1, 0, g0), (2, 0, g1), (0, 1, g0), (3, 1, g1), (0, 2, g1), (3, 2, g2), (1, 3, g2), (2, 3, g2)):
        cv.dot(x + i * q, y + j * q, c)
    cv.dot(x + q, y + q, lt(cap, 0.25))
    cv.dot(x + 2 * q, y + q, cap)
    cv.dot(x + q, y + 2 * q, dk(cap, 0.15))
    cv.dot(x + 2 * q, y + 2 * q, dk(cap, 0.4))
    if rng.random() < 0.2:
        cv.dot(x + q, y + q, lt(cap, 0.6))                             # the glint of a lamp on the cap


CAPS = [hx('#d8b048'), hx('#c8ccd4'), hx('#b8242a'), GRAPHITE, hx('#e8e4d8')]


def p_bottle_shelf():
    """Liquor shelf from above: back panel at -y, three ranks of bottle tops grouped by brand, price rail at +y."""
    W, H = 42, 13
    cv = Cv(W, H)
    wood = ramp('#4a2c1c', 0.45, 0.22, 0.3)
    gap = dk(wood[0], 0.25)
    frect(cv, 1, 1, W - 1, H - 1, gap)
    wood_fill(cv, 1, 1, W - 2, 2, wood[2], plank=2, rng=random.Random(231))
    frect(cv, 1, 1, W - 1, 1.5, wood[3])
    frect(cv, 1, 2.5, W - 1, 3, dk(wood[1], 0.2))                     # the shadow of the back board
    frect(cv, 1, 3, 3, H - 1, wood[2])
    frect(cv, 1, 3, 1.5, H - 1, wood[3])
    frect(cv, W - 3, 3, W - 1, H - 1, wood[1])
    frect(cv, W - 3, 3, W - 2.5, H - 1, dk(wood[1], 0.2))
    frect(cv, 3, H - 2, W - 3, H - 1, hx('#cfc8b4'))                  # price rail
    frect(cv, 3, H - 1.5, W - 3, H - 1, hx('#a8a08c'))
    rng = random.Random(23)
    glass = ['#2f7a3c', '#b4681c', '#bcd4cc', '#3c68b0', '#5a2a12', '#d0a02c', '#8a1f2a']
    rng.shuffle(glass)
    slot = 0
    while slot < 12:
        col = hx(glass.pop())
        cap = CAPS[rng.randrange(len(CAPS))]
        for _ in range(rng.choice([1, 2, 2, 3])):                     # a brand: a few bottles side by side, three deep
            if slot == 12:
                break
            x = 3 + slot * 3
            for rank, y in enumerate((3, 6, 9)):
                if rank == 2 and rng.random() < 0.2:                  # sold
                    continue
                rack_bottle(cv, x, y, col, cap, rng)
            frect(cv, x, H - 2, x + 2, H - 1.5, lt(col, 0.3))         # its price tag
            frect(cv, x + 0.5, H - 1.5, x + 1.5, H - 1, hx('#3a3440'))
            slot += 1
    cv.outline()
    return cv


def p_washer():
    """Coin-op top loader from above: white enamel cabinet, the console at the back (-y) with its timer dial, cycle knob,
    ready lamp and chrome coin slide, the lid with its seam, finger grip and round window on the wash, a box of
    powder and a few grains spilled."""
    S = 24
    cv = Cv(S, S)
    en = ENAMEL
    rng = random.Random(191)
    fill_shape(cv, 12.0, 12.0, 11.0, 11.0, lambda u, v, L: shade(en, L), kind='rect', bevel=1.6, corner=1.4)
    mottle(cv, random.Random(1912), 3, 6)
    pn = ramp('#566070', 0.45, 0.22, 0.35)
    fill_shape(cv, 12.0, 3.8, 10.4, 2.4, lambda u, v, L: shade(pn, L), kind='rect', bevel=0.9, corner=0.6)   # console
    frect(cv, 1.6, 6.2, 22.4, 6.7, lambda c: dk(en[1], 0.2))           # its shadow on the top
    knob(cv, 4.4, 3.8, 1.4, '#e8ecf2', -0.6, hx('#2a2e38'))            # the cycle knob
    fill_shape(cv, 9.0, 3.8, 1.6, 1.4, lambda u, v, L: hx('#1a1e24'), kind='rect', corner=0.4)   # the timer window
    line(cv, 8.2, 3.8, 9.8, 3.8, hx('#f0a830'))
    cv.dot(11.5, 3.0, NEON_GREEN)                                   # ready
    cv.dot(11.5, 4.5, hx('#2a4a30'))
    chrome_bar(cv, 14.0, 2.4, 21.0, 5.2)                               # the coin slide
    for x in (15.2, 17.2, 19.2):
        frect(cv, x, 3.4, x + 1.0, 4.2, GUNMETAL)                 # its coin slots
    stud(cv, 2.2, 2.0, pn[1])
    stud(cv, 21.6, 2.0, pn[1])

    def lid(x, y, c):
        return shade(en, 0.72 if y < 7.8 else 0.6 if y > 20.6 else 0.66)
    px_paint(cv, 4.5, 7.5, 19.5, 21.5, lid)
    for (x0, y0, x1, y1, f) in ((4.5, 7.5, 19.5, 8.0, lambda c: dk(c, 0.35)), (4.5, 8.0, 5.0, 21.5, lambda c: dk(c, 0.3)),
                                (4.5, 21.0, 19.5, 21.5, lambda c: lt(c, 0.25)), (19.0, 8.0, 19.5, 21.0, lambda c: lt(c, 0.2))):
        frect(cv, x0, y0, x1, y1, f)                                   # the lid's seam, shadowed and lit
    frect(cv, 9.5, 19.5, 14.5, 20.5, lambda c: dk(c, 0.22))           # its finger grip
    cloth = (hx('#8a3040'), hx('#c8ccd4'), hx('#3a5a9a'), hx('#d8b048'))

    def window(dx, dy, d):
        if d > 4.4:
            return shade(CHROME, 0.25 + 0.9 * light(dx / d * 0.85, dy / d * 0.85))
        k = int((math.atan2(dy, dx) + math.pi) / (2 * math.pi) * 5 + d * 0.5) % 4
        c = mix(GLASS[1], cloth[k], 0.45)
        return mix(c, hx('#e8f2ff'), 0.6) if dx + dy < -2.4 and d > 2.0 else c
    ring(cv, 12.0, 13.8, 0.0, 5.2, window)
    cv.outline()

    def powder(ly):
        fill_shape(ly, 20.4, 16.0, 1.6, 2.4, lambda u, v, L: hx('#f26a1a') if v < -0.6 else shade(ramp('#2a6ad8', 0.45, 0.22, 0.4), L),
                   ang=0.12, kind='rect', corner=0.3, bevel=0.6)
        ly.dot(20.0, 16.4, PURE_WHITE)
    layer(cv, powder)
    for _ in range(6):
        cv.dot(rng.uniform(17.5, 22.0), rng.uniform(18.5, 22.0), hx('#f4f6fc'))
    return cv


def p_neon_sign_liquor():
    cv, gl = sign_backing(46, 14), Cv(46, 14)
    ne = Neon(46, 14)
    ne.line([(5, 2), (5, 3)], NEON_AMBER)                                      # a bottle
    ne.line([(4, 4), (3, 5), (3, 11), (7, 11), (7, 5), (6, 4)], NEON_AMBER)
    neon_text(ne, 11, 3, 'LIQUOR', NEON_GREEN)
    ne.render(cv, gl)
    return cv, gl


def p_neon_sign_video():
    cv, gl = sign_backing(44, 14), Cv(44, 14)
    ne = Neon(44, 14)
    ne.line([(3, 5), (10, 5), (10, 10), (3, 10), (3, 5)], NEON_PINK)           # a TV set and its rabbit ears
    ne.line([(6, 4), (4, 2)], NEON_PINK)
    ne.line([(7, 4), (9, 2)], NEON_PINK)
    ne.line([(5, 8), (6, 7), (7, 8), (8, 7)], NEON_YELLOW)
    neon_text(ne, 15, 3, 'VIDEO', NEON_CYAN)
    ne.render(cv, gl)
    return cv, gl


def p_neon_sign_mirage():
    """The bar's name over the street, by its door: MIRAGE in pink tubes, a cyan stroke under it."""
    cv, gl = sign_backing(44, 14), Cv(44, 14)
    ne = Neon(44, 14)
    neon_text(ne, 7, 3, 'MIRAGE', NEON_PINK)
    ne.line([(7, 11), (37, 11)], NEON_CYAN)
    ne.render(cv, gl)
    return cv, gl


def p_neon_sign_open():
    """The OPEN sign of an American bar: red letters in a blue tube frame."""
    cv, gl = sign_backing(34, 16), Cv(34, 16)
    ne = Neon(34, 16)
    ne.line([(2, 2), (31, 2), (31, 13), (2, 13), (2, 2)], hx('#3a6aff'))
    neon_text(ne, 6, 5, 'OPEN', hx('#ff3a30'))
    ne.render(cv, gl)
    return cv, gl


def p_neon_sign_wash():
    cv, gl = sign_backing(50, 14), Cv(50, 14)
    ne = Neon(50, 14)
    x = neon_text(ne, 4, 3, 'WASH', hx('#7fe0ff'))
    neon_text(ne, x + 3, 3, '24H', NEON_YELLOW)
    ne.render(cv, gl)
    return cv, gl


def p_back_bar():
    """The bar's back shelves, hung on the wall (-y): a strip of mirror, two ranks of bottle tops (same grid as the
    liquor shelf: DESTRUCTION rack), the glass edge of the shelf lit pink from below."""
    W, H = 42, 10
    cv = Cv(W, H)
    wood = ramp('#3a2218', 0.45, 0.22, 0.3)
    gap = dk(wood[0], 0.25)
    frect(cv, 1, 1, W - 1, H - 1, gap)
    rng = random.Random(47)

    def mirror(x, y, c):                                               # the room's lights sliding across the mirror
        d = (x + (y - 1) * 3) % 12.0
        m = hx('#d4e4f0') if d < 1.0 else mix(hx('#d4e4f0'), hx('#8ea6ba'), 0.5) if d < 2.0 else hx('#8ea6ba')
        return shift(m, rng.randint(-6, 6)) if y > 1.5 else lt(m, 0.15)
    px_paint(cv, 1, 1, W - 1, 2, mirror)
    glass = ['#2f7a3c', '#b4681c', '#bcd4cc', '#3c68b0', '#5a2a12', '#d0a02c', '#8a1f2a', '#c8c8d8', '#7a3aa0']
    for rank, y in enumerate((2, 5)):
        for slot in range(12):
            if rng.random() < 0.08:                                   # one is out, on the counter
                continue
            rack_bottle(cv, 3 + slot * 3, y, hx(rng.choice(glass)), CAPS[rng.randrange(len(CAPS))], rng)

    def edge(x, y, c):
        if y < 7.5:
            return hx('#ffc0d8') if int(x * 2) % 14 == 3 else hx('#ff5f96')     # the glass edge, lit
        return hx('#d84a80')
    px_paint(cv, 1, 7, W - 1, 8, edge)
    wood_fill(cv, 1, 8, W - 2, 8, wood[1], plank=1, rng=random.Random(471))
    cv.outline()
    return cv


def p_alarm_box():
    """A shop's alarm box on its front wall (-y): a pressed steel case with its lit edge and screws, the louvres of its
    bell, the maker's plate, the red dome of its beacon."""
    cv = Cv(12, 8)
    st = ramp('#c4c8ce', 0.45, 0.22, 0.4)
    fill_shape(cv, 6.0, 3.5, 5.0, 2.5, lambda u, v, L: shade(st, L), kind='rect', bevel=0.8, corner=0.5)
    for x in (2.0, 3.0, 4.0):
        frect(cv, x, 2.0, x + 0.5, 5.0, hx('#565a64'))                 # the bell's louvres
        frect(cv, x + 0.5, 2.0, x + 1.0, 5.0, st[3])
    frect(cv, 2.0, 5.2, 5.0, 5.7, hx('#2a5ab0'))                       # the maker's plate
    fill_shape(cv, 8.4, 3.6, 1.8, 1.8, lambda u, v, L: shade(ramp('#c2281e', 0.45, 0.22, 0.5), L))   # the beacon
    cv.dot(7.75, 2.75, hx('#ffb0a0'))
    for (x, y) in ((1.5, 1.5), (10.0, 1.5), (1.5, 5.5), (10.0, 5.5)):
        cv.dot(x, y, st[0])
    cv.outline()
    return cv


GROUP = 'props'
SPRITES = {
    'bottle_shelf': (p_bottle_shelf, (42, 13), 'fine', (40, 11)),
    'back_bar': (p_back_bar, (42, 10), 'fine', (40, 8)),
    'washer': (p_washer, (24, 24), 'fine', (22, 22)),
    'neon_sign_liquor': (p_neon_sign_liquor, (46, 14), 'glow hung'),
    'alarm_box': (p_alarm_box, (12, 8), 'fine hung'),
    'neon_sign_video': (p_neon_sign_video, (44, 14), 'glow hung'),
    'neon_sign_wash': (p_neon_sign_wash, (50, 14), 'glow hung'),
    'neon_sign_mirage': (p_neon_sign_mirage, (44, 14), 'glow stock hung'),
    'neon_sign_open': (p_neon_sign_open, (34, 16), 'glow hung'),
}
