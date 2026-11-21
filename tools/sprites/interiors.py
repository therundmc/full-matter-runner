"""The rooms of level 1 (tools/build_level1.py): what a liquor store, a TV shop, a laundromat, a bar's back
and an office are full of, at FINE density, and what stands on their furniture (the clutter group). A piece that
stands against a wall has its back at -y; what hangs on a wall has the wall at -y (as the bar's pictures have). (The
calendars on its walls are the flat's.) Every painter draws its own numbers: none of them moves another sprite."""
import math
import random

from .core import (
    alpha, ashtray, bevel_edges, brushed, can_top, chrome_bar, CLEAR, Cv, dk, fill_capsule, fill_shape, frect,
    glass_top, hx, layer, light, line, lt, mix, mottle, on_wall, px_paint, ramp, ring, rot, shade, smudge, stud,
    VNoise, wood_fill
)
from .palette import ALU, BRASS, CASH, CHROME, GLASS, RUBBER, WOOD
from .neon import glow_from
from .furniture import knob


GOODS = ('#c8242c', '#e8c040', '#2a6ad8', '#3a9a4a', '#e87a2a', '#e8e4d8', '#7a3aa0', '#1a8a8a')
CARD = ramp('#b88a52', 0.45, 0.22, 0.25)
FORMICA = ramp('#d8d4c8', 0.4, 0.2, 0.25)
ENAMEL = ramp('#dfe3e8', 0.42, 0.2, 0.4)
GREY_STEEL = ramp('#8a909c', 0.5, 0.25, 0.4)


def slab(cv, x0, y0, x1, y1, r, lo=0.3, hi=0.5, bevel=1.0, corner=0.5, ang=0.0):
    """A flat top lit from the top left over [x0, x1) x [y0, y1) (world px), turned by ang about its middle."""
    fill_shape(cv, (x0 + x1) / 2, (y0 + y1) / 2, (x1 - x0) / 2, (y1 - y0) / 2, lambda u, v, L: shade(r, lo + L * hi),
               ang=ang, kind='rect', bevel=bevel, corner=corner)


def carton(cv, x0, y0, x1, y1, seed, ang=0.0, r=CARD, tape=True):
    """A cardboard box from above: where its flaps meet, a strip of tape, the damp and the scuffs."""
    slab(cv, x0, y0, x1, y1, r, 0.35, 0.45, 1.0, 0.4, ang)
    cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
    if tape:
        fill_shape(cv, cx, cy, (x1 - x0) / 2 - 0.3, 0.6, lambda u, v, L: mix(r[2], hx('#8a5a2a'), 0.55), ang=ang, kind='rect', corner=0.1)
    fill_shape(cv, cx, cy, 0.2, (y1 - y0) / 2 - 0.6, lambda u, v, L: dk(r[1], 0.25), ang=ang, kind='rect', corner=0.1)
    smudge(cv, random.Random(seed), 2, (int(x0), int(y0), int(x1), int(y1)), (0.8, 1.6), 0.16)


def shelf_frame(W, H, r, rail=True):
    """A shelf unit from above, its back at -y: the dark deck between its back board, its two ends and (rail) the
    price rail along its front."""
    cv = Cv(W, H)
    frect(cv, 1, 1, W - 1, H - 1, dk(r[0], 0.3))
    frect(cv, 1, 1, W - 1, 2.5, r[2])
    frect(cv, 1, 1, W - 1, 1.5, r[3])
    frect(cv, 1, 2.5, W - 1, 3, dk(r[0], 0.45))
    for x in (1, W - 2):
        frect(cv, x, 2.5, x + 1, H - 1, r[1])
    if rail:
        frect(cv, 2, H - 2, W - 2, H - 1, hx('#e2dccb'))
        frect(cv, 2, H - 1.5, W - 2, H - 1, hx('#aaa290'))
    return cv


def packet(cv, x, y, w, h, col):
    """A printed box standing on a shelf, from above: its lit top edge, its label, its shaded side."""
    col = hx(col) if isinstance(col, str) else col
    frect(cv, x, y, x + w, y + h, col)
    frect(cv, x, y, x + w, y + 0.5, lt(col, 0.35))
    frect(cv, x + 0.5, y + h * 0.42, x + w - 0.5, y + h * 0.42 + 0.5, hx('#f4f0e2') if sum(col[:3]) < 520 else hx('#3a3440'))
    frect(cv, x + w - 0.5, y + 0.5, x + w, y + h, dk(col, 0.4))


def p_shop_shelf():
    """A shop's steel gondola from above, 1.25 m: two ranks of groceries (boxes of cereal and soap powder, cans by the
    brand, a gap where something sold out), the price rail and its coloured tags along the front."""
    W, H = 42, 13
    cv = shelf_frame(W, H, ramp('#b8bcc6', 0.5, 0.25, 0.3))
    rng = random.Random(4101)
    x = 2.5
    while x < W - 5.5:
        col = GOODS[rng.randrange(len(GOODS))]
        if rng.random() < 0.55:
            w = rng.choice((3.0, 3.5, 4.0))
            for y in (3.2, 7.0):
                if rng.random() > 0.12:
                    packet(cv, x, y, w - 0.5, 3.3, col)
            x0, x = x, x + w + 0.5
        else:
            n = rng.choice((2, 3))
            for i in range(n):
                for y in (4.8, 8.4):
                    if rng.random() > 0.12:
                        can_top(cv, x + 1.2 + i * 2.5, y, 1.15, col)
            x0, x = x, x + n * 2.5 + 0.5
        frect(cv, x0 + 0.5, H - 2, x0 + 2.0, H - 1.5, lt(hx(col), 0.2))
    cv.outline()
    return cv


def p_wine_rack():
    """A wine rack from above, 1.25 m: bottles lying in their cradles, punts to the wall and necks toward the aisle
    (dark green and brown glass, a pale label, a foil capsule in red, gold or black), two cradles empty."""
    W, H = 42, 13
    wood = ramp('#5a3420', 0.45, 0.22, 0.3)
    cv = shelf_frame(W, H, wood, rail=False)
    frect(cv, 2, H - 2, W - 2, H - 1, wood[1])                          # the front bar the necks rest on
    frect(cv, 2, H - 2, W - 2, H - 1.5, wood[2])
    rng = random.Random(4102)
    glass = ('#1e4a2a', '#2a5a30', '#4a2a14', '#1a2a1e', '#5a3a16')
    foil = ('#b8242a', '#d8b048', '#1c1c22', '#e8e4d8')
    for k in range(12):
        x = 3.0 + k * 3.0
        if k in (4, 9):
            frect(cv, x, 3.2, x + 2.0, H - 2, dk(wood[0], 0.2))         # an empty cradle
            continue
        g = ramp(glass[rng.randrange(len(glass))], 0.5, 0.25, 0.5)
        fill_capsule(cv, [(x + 1.0, 4.0), (x + 1.0, 8.0)], 1.0, lambda q, L, s_, i, t, g=g: shade(g, 0.25 + L * 0.7))
        frect(cv, x + 0.5, 8.4, x + 1.5, 10.6, g[1])                    # the neck
        frect(cv, x + 0.5, 8.4, x + 1.0, 10.6, g[2])
        frect(cv, x + 0.5, 10.4, x + 1.5, 11.4, hx(foil[rng.randrange(len(foil))]))   # its capsule
        frect(cv, x + 0.2, 5.0, x + 1.8, 7.0, hx('#e8e0cc'))            # the label
        frect(cv, x + 0.5, 5.6, x + 1.5, 6.1, hx('#7a2a2a') if k % 3 else hx('#2a2a3a'))
        cv.dot(x + 0.4, 4.0, hx('#cfe8d8'))                             # a glint on the shoulder
    cv.outline()
    return cv


def p_beer_cases():
    """Beer by the case, stacked on the shop floor, from above: two cases side by side and a third thrown across
    them, printed cardboard (a band of the brand's colour edged in gold), a hand hole at each end."""
    W, H = 22, 18
    cv = Cv(W, H)

    def case(ly, x0, y0, x1, y1, ang, band):
        slab(ly, x0, y0, x1, y1, CARD, 0.35, 0.45, 0.9, 0.4, ang)
        cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
        fill_shape(ly, cx, cy, (x1 - x0) / 2 - 0.6, 1.3, lambda u, v, L: hx(band) if abs(v) < 0.9 else hx('#e8c040'), ang=ang, kind='rect', corner=0.1)
        fill_shape(ly, cx, cy, (x1 - x0) / 2 - 2.2, 0.35, lambda u, v, L: hx('#f4ecd0'), ang=ang, kind='rect', corner=0.1)
        for sx in (-1, 1):
            hx_, hy_ = rot(cx, cy, ang, sx * ((x1 - x0) / 2 - 1.0), 0)
            fill_shape(ly, hx_, hy_, 0.35, 1.0, lambda u, v, L: hx('#2a1c10'), ang=ang, kind='rect', corner=0.1)
    layer(cv, lambda ly: (case(ly, 1.5, 9.0, 11.0, 16.5, 0.0, '#b8242a'), case(ly, 11.3, 9.2, 20.5, 16.5, 0.0, '#b8242a')))

    layer(cv, lambda ly: case(ly, 5.5, 1.5, 16.0, 9.0, 0.14, '#2a4a9a'))
    smudge(cv, random.Random(4103), 3, (2, 2, W - 2, H - 2), (1.0, 2.0), 0.16)
    return cv


def p_lottery_stand():
    """The lottery's counter stand from above, 35 cm: a yellow header card (LOTTO in red), under it the pads of
    scratch tickets in their clear bins, six colours, the top one of a pad half pulled out; a pen on its chain."""
    W, H = 14, 12
    cv = Cv(W, H)
    slab(cv, 1, 1, W - 1, H - 1, ramp('#3a3a44', 0.45, 0.22, 0.4), 0.3, 0.5, 0.8, 0.5)
    frect(cv, 1.5, 1.5, W - 1.5, 3.5, hx('#f0c820'))
    frect(cv, 1.5, 1.5, W - 1.5, 2.0, hx('#fff0a0'))
    for x in (2.5, 4.0, 5.5, 7.0, 8.5, 10.0):
        frect(cv, x, 2.4, x + 1.0, 3.0, hx('#c8242c'))
    cols = ('#e8508a', '#2a9ad8', '#3aa84a', '#e87a2a', '#7a3aa0', '#e8e4d8')
    for k, col in enumerate(cols):
        x, y = 2.0 + (k % 3) * 3.5, 4.4 + (k // 3) * 3.2
        packet(cv, x, y, 3.0, 2.6, col)
        cv.dot(x + 0.5, y + 0.6, hx('#fff6dc'))
    frect(cv, 9.2, 3.6, 12.4, 4.6, hx('#f4f0e2'))                      # the ticket half pulled out
    frect(cv, 9.7, 3.9, 11.9, 4.2, hx('#e8508a'))
    line(cv, 12.2, 8.0, 12.6, 10.4, hx('#9aa0ac'))                     # the pen's chain
    frect(cv, 11.6, 10.2, 12.8, 10.8, hx('#2a4a9a'))
    cv.outline()
    return cv


TV_PIC = ('#9ef6ff', '#ffd0a0', '#7ab0ff', '#ff9ac8', '#c8f0ff', '#b8ffc8')


def p_tv_stack():
    """The shop's wall of sets from above, 95 cm: three televisions shoulder to shoulder on a black steel stand, a
    fourth and a portable stood on top of them, all left on (their glass bulging past the bezels, each on another
    channel: render/PropLife.js rolls a bar down them), the price cards taped to their tops, the cables in a snarl
    behind."""
    W, H = 32, 20
    cv = Cv(W, H)
    stand = ramp('#24222c', 0.4, 0.2, 0.45)
    slab(cv, 1, 1, W - 1, H - 1, stand, 0.3, 0.5, 1.0, 0.8)
    for (x0, y0, x1, y1) in ((4.0, 1.4, 9.0, 3.0), (12.0, 2.0, 20.0, 2.6), (22.0, 1.4, 27.0, 3.2)):   # the cables behind
        fill_capsule(cv, [(x0, y0), ((x0 + x1) / 2, y1), (x1, y0 + 0.4)], 0.4, lambda q, L, s_, i, t: hx('#0e0c12'))
    cv.outline()
    sets = ((2.0, 11.5, '#6e4224'), (11.5, 21.0, '#2e2a34'), (21.0, 30.0, '#8a8e98'))

    def bottom(ly):
        for k, (x0, x1, col) in enumerate(sets):
            r = ramp(col, 0.45, 0.22, 0.35)
            slab(ly, x0, 6.0, x1 - 0.5, 15.0, r, 0.3, 0.5, 0.9, 0.5)
            slab(ly, x0 + 1.5, 3.4, x1 - 2.0, 6.4, ramp('#2e2a34', 0.45, 0.22, 0.4), 0.25, 0.5, 1.0, 1.0)   # the tube's housing
            for x in range(int(x0) + 3, int(x1) - 3):
                frect(ly, x + 0.25, 4.0, x + 0.75, 5.4, hx('#141218'))   # its vents
            frect(ly, x0, 15.0, x1 - 0.5, 16.0, hx('#c8ccd6') if k != 1 else hx('#3a3846'))   # the bezel
            frect(ly, x0, 15.0, x1 - 0.5, 15.5, hx('#e8ecf4') if k != 1 else hx('#5a5868'))
            frect(ly, x0 + 1.0, 8.0, x0 + 4.0, 10.0, hx('#f4f0e2'))     # the price card
            frect(ly, x0 + 1.5, 8.7, x0 + 3.5, 9.2, hx('#c8242c'))
            stud(ly, x1 - 1.5, 15.5, hx('#e03030'))
    layer(cv, bottom)

    def upper(ly):
        slab(ly, 6.0, 5.0, 14.5, 12.0, ramp('#3a3440', 0.45, 0.22, 0.35), 0.3, 0.5, 0.9, 0.5, 0.05)   # a set stood on two others
        frect(ly, 6.2, 11.6, 14.3, 12.6, hx('#9aa0ac'))
        slab(ly, 20.5, 6.5, 26.5, 11.5, ramp('#c8242c', 0.45, 0.22, 0.35), 0.3, 0.5, 0.9, 0.9, -0.08)   # a red portable
        frect(ly, 20.8, 11.2, 26.2, 12.0, hx('#2a2a30'))
        line(ly, 23.5, 8.5, 28.5, 4.0, hx('#d8dce6'))                   # its aerial
        ly.dot(28.5, 4.0, hx('#ffffff'))
    layer(cv, upper)

    def glass(x0, x1, y0, y1, k):
        def f(x, y, c):
            col = hx(TV_PIC[(int((x - x0) * 0.7) + k) % len(TV_PIC)])
            if y >= (y0 + y1) / 2:
                col = mix(col, hx('#3a6a8a'), 0.45)
            return hx('#ffffff') if abs(x - x0 - 1.5) < 0.5 and y < (y0 + y1) / 2 else col
        px_paint(cv, x0, y0, x1, y1, f)
    for k, (x0, x1, _) in enumerate(sets):
        glass(x0 + 1.0, x1 - 2.5, 16.0, 17.0, k * 2)
    glass(7.0, 13.5, 12.6, 13.4, 3)
    glass(21.3, 25.7, 12.0, 12.8, 5)
    screens = ((3, 9, 16), (12, 18, 16), (22, 27, 16), (7, 13, 12), (21, 25, 12))
    return cv, glow_from(cv, lambda x, y, c: any(y in (yy, yy + 1) and a <= x <= b for (a, b, yy) in screens) and c[2] > 150)


def p_vcr_shelf():
    """The video recorders' shelf from above, 1.25 m: five machines side by side, black and silver, each with its
    cassette door, a row of keys and a red clock (render/PropLife.js blinks their 12:00), a camcorder, boxed tapes
    stood on end, a price tag hanging from each."""
    W, H = 42, 13
    cv = shelf_frame(W, H, ramp('#4a4a56', 0.5, 0.25, 0.3))
    for k in range(4):
        x0 = 2.5 + k * 7.5
        r = ramp('#2a2a34' if k % 2 == 0 else '#8a8e98', 0.45, 0.22, 0.4)
        slab(cv, x0, 3.2, x0 + 7.0, 10.6, r, 0.3, 0.5, 0.7, 0.3)
        frect(cv, x0 + 0.8, 8.4, x0 + 4.2, 9.4, hx('#0e0c12'))           # the cassette door
        frect(cv, x0 + 0.8, 8.4, x0 + 4.2, 8.9, hx('#3a3846'))
        for x in (x0 + 4.8, x0 + 5.3):
            cv.dot(x, 9.0, hx('#ff2a3a'))                               # 12:00
        for x in (x0 + 1.0, x0 + 2.0, x0 + 3.0):
            cv.dot(x, 9.9, hx('#b8bcc8'))                               # its keys
        frect(cv, x0 + 5.0, 4.0, x0 + 6.4, 5.6, hx('#f4f0e2'))          # the price tag
        frect(cv, x0 + 5.3, 4.6, x0 + 6.1, 5.0, hx('#c8242c'))
    for k, col in enumerate(('#c8242c', '#1c1c22', '#e8e4d8', '#2a4a9a', '#1c1c22')):   # tapes on end
        packet(cv, 33.0 + k * 1.5, 3.4 + (k % 2) * 0.4, 1.3, 4.6, col)
    slab(cv, 33.0, 8.4, 39.5, 10.8, ramp('#3a3a44', 0.45, 0.22, 0.4), 0.3, 0.5, 0.7, 0.5)   # a camcorder
    ring(cv, 38.6, 9.6, 0.0, 1.0, lambda dx, dy, d: hx('#7ab0ff') if d < 0.5 else hx('#141218'))
    cv.outline()
    return cv


def p_tv_box():
    """A television still in its box on the shop floor, from above, 60 cm: printed cardboard (the set drawn in blue
    line, the maker's red band, THIS WAY UP arrows), a plastic strap round it, one corner stove in."""
    W, H = 22, 18
    cv = Cv(W, H)
    carton(cv, 1, 1, W - 1, H - 1, 4105, tape=False)
    frect(cv, 2, 2, W - 2, 4.5, hx('#c8242c'))                         # the maker's band
    frect(cv, 3, 2.9, 12, 3.6, hx('#f4ecd0'))
    for (x0, y0, x1, y1) in ((4.0, 6.5, 13.0, 6.9), (4.0, 12.6, 13.0, 13.0), (4.0, 6.5, 4.4, 13.0), (12.6, 6.5, 13.0, 13.0)):
        frect(cv, x0, y0, x1, y1, hx('#2a4a9a'))                       # the set, in blue line
    frect(cv, 5.5, 8.0, 11.5, 11.5, lambda c: mix(c, hx('#2a4a9a'), 0.35))
    for x in (15.5, 18.0):                                             # the arrows
        frect(cv, x, 8.0, x + 0.5, 12.5, hx('#3a2414'))
        cv.dot(x - 0.5, 8.6, hx('#3a2414'))
        cv.dot(x + 0.5, 8.6, hx('#3a2414'))
    frect(cv, 1, 14.4, W - 1, 15.0, hx('#f0e8a0'))                     # the strap
    px_paint(cv, W - 5, 1, W - 1, 5, lambda x, y, cur: dk(cur, 0.28) if cur[3] and x - y > W - 7 else None)   # stove in
    cv.outline()
    return cv


def p_repair_bench():
    """The repair man's bench from above, 1.4 m: a scarred wooden top, a set lying open on its back (the chassis: a
    green board, the tube's neck and its yoke of copper, valves, a blown capacitor), a green-screened scope, the
    soldering iron in its coil stand (hot: systems/Seeps.js), a reel of solder, screwdrivers, a parts tray, the lamp on
    its arm, a mug, burns and flux on the wood."""
    W, H = 48, 24
    cv = Cv(W, H)
    wood_fill(cv, 1, 1, W - 2, H - 2, hx('#6a4a2c'), plank=6, rng=random.Random(4106))
    bevel_edges(cv, 1, 1, W - 2, H - 2, 0.2, 0.3)
    rng = random.Random(4107)
    smudge(cv, rng, 7, (3, 3, W - 3, H - 3), (1.0, 2.6), 0.22)
    for _ in range(5):                                                 # burns of the iron
        cv.dot(rng.uniform(26, 44), rng.uniform(14, 21), hx('#1a100c'))
    cv.outline()

    def things(ly):
        slab(ly, 18.0, 3.0, 37.0, 18.0, ramp('#2e2a34', 0.45, 0.22, 0.4), 0.3, 0.4, 1.0, 0.8)   # the set's shell
        slab(ly, 19.5, 4.5, 35.5, 16.5, ramp('#2a6a3a', 0.45, 0.22, 0.3), 0.35, 0.3, 0.4, 0.3)   # its board
        for (x0, y0, x1, y1) in ((20.5, 6.0, 26.0, 6.3), (20.5, 6.0, 20.8, 12.0), (22.0, 14.0, 30.0, 14.3), (29.5, 9.0, 29.8, 14.0)):
            frect(ly, x0, y0, x1, y1, hx('#b8d86a'))                   # its tracks
        fill_capsule(ly, [(27.5, 10.5), (33.5, 10.5)], 1.7, lambda q, L, s_, i, t: shade(ramp('#3a3a44', 0.5, 0.25, 0.5), L))   # the tube's neck
        ring(ly, 30.0, 10.5, 1.2, 2.6, lambda dx, dy, d: hx('#c87a3a') if int(math.atan2(dy, dx) * 5) % 2 else hx('#8a4a1c'))   # the yoke
        for (x, y, c) in ((22.0, 8.5, '#c8ccd4'), (24.5, 8.5, '#c8ccd4'), (22.5, 11.5, '#2a4a9a'), (33.5, 6.2, '#e8c040'), (25.0, 15.0, '#c8242c')):
            can_top(ly, x, y, 0.9, c)                                   # valves and capacitors
        ly.dot(33.5, 14.5, hx('#1a100c'))                               # the one that blew
        slab(ly, 3.0, 9.0, 13.0, 19.0, ramp('#8a8e98', 0.45, 0.22, 0.4), 0.3, 0.5, 0.8, 0.5)   # the scope
        frect(ly, 4.2, 10.2, 9.2, 15.2, hx('#0c2a1a'))
        for i in range(9):
            ly.dot(4.6 + i * 0.5, 12.7 + math.sin(i * 1.3) * 1.6, hx('#3aff8a'))
        for (x, y) in ((10.8, 10.8), (10.8, 13.0), (10.8, 15.2)):
            knob(ly, x, y, 0.8, '#1a1820', -0.8)
        slab(ly, 3.0, 2.5, 8.0, 6.5, ramp('#3a6ab8', 0.45, 0.22, 0.4), 0.3, 0.5, 0.6, 0.4)   # the parts tray
        for k, c in enumerate(('#e8c040', '#c8ccd4', '#c8242c', '#e8e4d8')):
            frect(ly, 3.6 + (k % 2) * 2.2, 3.1 + (k // 2) * 1.8, 5.2 + (k % 2) * 2.2, 4.3 + (k // 2) * 1.8, dk(hx(c), 0.1))
        ring(ly, 40.5, 7.5, 0.9, 2.2, lambda dx, dy, d: shade(CHROME, 0.3 + 0.7 * light(dx / d, dy / d)))   # a reel of solder
        fill_capsule(ly, [(38.5, 14.0), (44.5, 11.2)], 0.6, lambda q, L, s_, i, t: hx('#e87a2a') if i + t < 0.55 else shade(CHROME, L))   # the iron
        ly.dot(44.6, 11.1, hx('#ff8a2a'))
        ring(ly, 44.0, 12.4, 1.2, 1.8, lambda dx, dy, d: shade(CHROME, 0.3 + 0.6 * light(dx / d, dy / d)) if int(math.atan2(dy, dx) * 3) % 2 else None)
        for (x0, y0, x1, y1, c) in ((39.0, 17.5, 45.0, 18.6, '#c8242c'), (38.0, 19.6, 44.0, 20.4, '#e8c040')):
            fill_capsule(ly, [(x0, y0), ((x0 + x1) / 2, (y0 + y1) / 2)], 0.5, lambda q, L, s_, i, t, c=c: hx(c))   # screwdrivers
            line(ly, (x0 + x1) / 2, (y0 + y1) / 2, x1, y1, hx('#c8ccd4'))
        glass_top(ly, 15.5, 4.5, 1.6, hx('#3a2414'))                    # coffee, cold
        fill_shape(ly, 9.5, 5.0, 2.6, 2.6, lambda u, v, L: shade(ramp('#3a8a5a', 0.5, 0.25, 0.4), L))   # the lamp's shade
        fill_shape(ly, 9.5, 5.0, 1.0, 1.0, lambda u, v, L: hx('#fff0c0'))
        fill_capsule(ly, [(9.5, 5.0), (4.0, 20.0)], 0.4, lambda q, L, s_, i, t: shade(CHROME, L) if t > 0.25 or i else None)
    layer(cv, things)
    return cv


def p_dryer():
    """A coin dryer from above, 70 cm: a white enamel top with lint on it, the console along the back (a timer dial,
    the coin slide, a lamp), the chrome ring of its door bulging off the front with the load seen through the glass
    (render/PropLife.js tumbles it), the flexible vent hose off its back, a dryer sheet left on top."""
    S = 24
    cv = Cv(S, S)
    fill_shape(cv, 12.0, 11.0, 11.0, 10.0, lambda u, v, L: shade(ENAMEL, L), kind='rect', bevel=1.6, corner=1.4)
    mottle(cv, random.Random(4108), 3, 6)
    pn = ramp('#6a5a4a', 0.45, 0.22, 0.35)
    fill_shape(cv, 12.0, 3.8, 10.4, 2.4, lambda u, v, L: shade(pn, L), kind='rect', bevel=0.9, corner=0.6)
    frect(cv, 1.6, 6.2, 22.4, 6.7, lambda c: dk(ENAMEL[1], 0.2))
    knob(cv, 5.0, 3.8, 1.6, '#e8ecf2', 0.9, hx('#c8242c'))             # the timer
    chrome_bar(cv, 13.0, 2.6, 20.0, 5.0)
    for x in (14.2, 16.2, 18.2):
        frect(cv, x, 3.4, x + 1.0, 4.2, hx('#2a2a34'))
    cv.dot(10.0, 3.0, hx('#ffb02a'))                                   # running
    for (x0, y0, x1, y1, f) in ((3.5, 8.0, 20.5, 8.5, lambda c: dk(c, 0.25)), (3.5, 8.0, 4.0, 19.0, lambda c: dk(c, 0.2)),
                                (20.0, 8.5, 20.5, 19.0, lambda c: lt(c, 0.2))):
        frect(cv, x0, y0, x1, y1, f)                                   # the top panel's seam
    rng = random.Random(4109)
    for _ in range(14):                                                # lint
        cv.dot(rng.uniform(4, 20), rng.uniform(9, 18), hx('#b4bccc') if rng.random() < 0.7 else hx('#8a90a0'))
    frect(cv, 14.0, 12.0, 18.5, 15.0, hx('#f0eef8'))                   # a dryer sheet
    frect(cv, 14.0, 12.0, 18.5, 12.5, hx('#d0d0e8'))
    cv.outline()

    def door(ly):                                                      # the door's ring past the front edge
        ring(ly, 12.0, 20.0, 0.0, 5.4, lambda dx, dy, d: None if dy < 0.6 else
             shade(CHROME, 0.25 + 0.9 * light(dx / d * 0.85, dy / d * 0.85)) if d > 4.2 else mix(GLASS[1], hx('#8a3040'), 0.4))
    layer(cv, door)
    fill_capsule(cv, [(17.0, 1.4), (19.5, 0.9), (21.5, 1.6)], 0.9, lambda q, L, s_, i, t: shade(GREY_STEEL, 0.3 + 0.5 * ((i + t) * 4 % 1)))   # the hose
    return cv


def p_folding_table():
    """The laundromat's folding table from above, 1.35 m: cream formica with a chipped steel edge, a pile of folded
    towels, a shirt half folded, a box of soap powder and its spilt grains, a paper cup, last month's magazine, rings."""
    W, H = 46, 22
    cv = Cv(W, H)
    slab(cv, 1, 1, W - 1, H - 1, FORMICA, 0.45, 0.4, 1.0, 1.0)
    ring_ = ramp('#9aa0ac', 0.5, 0.25, 0.4)
    for (x0, y0, x1, y1) in ((1, 1, W - 1, 1.6), (1, H - 1.6, W - 1, H - 1), (1, 1, 1.6, H - 1), (W - 1.6, 1, W - 1, H - 1)):
        frect(cv, x0, y0, x1, y1, ring_[2] if y0 < 2 or x0 < 2 else ring_[1])
    rng = random.Random(4110)
    smudge(cv, rng, 5, (3, 3, W - 3, H - 3), (1.2, 2.6), 0.1)
    for (x, y) in ((27.0, 14.0), (30.5, 15.5)):                        # rings of cups
        ring(cv, x, y, 1.3, 1.7, lambda dx, dy, d: lambda_dark(cv, x + dx, y + dy) if dx - dy < 1.4 else None)
    cv.outline()

    def things(ly):
        for k, c in enumerate(('#8a8c90', '#e8e6de', '#3a86c8')):       # folded towels, piled
            r = ramp(c, 0.4, 0.2, 0.25)
            slab(ly, 4.0 + k * 0.5, 4.0 + k * 0.7, 13.0 + k * 0.5, 11.0 + k * 0.7, r, 0.4, 0.4, 0.8, 0.8, 0.04 * k)
        frect(ly, 5.5, 8.0, 13.5, 8.5, hx('#2a5a8a'))
        r = ramp('#e8e6de', 0.4, 0.2, 0.25)                             # a shirt half folded
        slab(ly, 16.0, 5.0, 25.0, 12.5, r, 0.45, 0.4, 0.8, 1.0, -0.12)
        fill_capsule(ly, [(24.0, 6.0), (27.5, 9.5)], 1.3, lambda q, L, s_, i, t: shade(r, 0.35 + L * 0.5))
        line(ly, 20.0, 5.6, 21.0, 12.0, dk(r[1], 0.15))
        ly.dot(20.3, 7.0, hx('#9aa0ac'))
        ly.dot(20.5, 9.0, hx('#9aa0ac'))
        packet(ly, 33.0, 3.5, 4.0, 5.5, '#f26a1a')                      # soap powder
        frect(ly, 33.0, 3.5, 37.0, 5.0, hx('#2a6ad8'))
        slab(ly, 36.0, 12.0, 43.0, 19.0, ramp('#c8242c', 0.4, 0.2, 0.25), 0.4, 0.4, 0.5, 0.3, 0.2)   # the magazine
        slab(ly, 37.4, 13.6, 41.4, 16.4, ramp('#e8c8a0', 0.4, 0.2, 0.25), 0.5, 0.3, 0.3, 0.2, 0.2)
        glass_top(ly, 30.0, 6.0, 1.5, hx('#5a3a1c'))                    # a paper cup of coffee
    layer(cv, things)
    for _ in range(9):
        cv.dot(rng.uniform(31, 39), rng.uniform(9.2, 11.4), hx('#f4f6fc'))   # the grains
    return cv


def lambda_dark(cv, x, y):
    """The pixel under (x, y) a shade darker (a ring left on a top), None off the canvas."""
    c = cv.get(x, y)
    return dk(c, 0.14) if c[3] else None


def p_soap_vend():
    """The soap machine against the laundromat's wall, from above, 55 cm: a blue steel cabinet, its lit window on the
    little boxes of powder and softener in their columns, the pull knobs under each, the coin slot, a sticker."""
    W, H = 20, 12
    cv = Cv(W, H)
    blue = ramp('#3a6ab8', 0.5, 0.25, 0.35)
    slab(cv, 1, 1, W - 1, H - 1, blue, 0.3, 0.5, 1.0, 0.6)
    frect(cv, 2.5, 2.5, 14.5, 7.5, hx('#eaf2ff'))                      # the window
    for k, c in enumerate(('#f26a1a', '#2a9ad8', '#e8e4d8', '#e8508a')):
        packet(cv, 3.0 + k * 2.9, 3.0, 2.3, 4.0, c)
    for k in range(4):
        knob(cv, 4.1 + k * 2.9, 9.2, 0.8, '#c8ccd4', 1.57)
    chrome_bar(cv, 15.8, 3.0, 18.2, 8.0)
    frect(cv, 16.6, 4.0, 17.4, 6.0, hx('#2a2a34'))
    frect(cv, 15.6, 8.8, 18.4, 10.2, hx('#f0c820'))                    # 25c
    cv.outline()
    return cv, glow_from(cv, lambda x, y, c: 3 <= y <= 6 and 3 <= x <= 14)


def p_laundry_cart():
    """A laundromat's wire cart from above, 75 cm: a chromed frame on four castors, the white canvas bag hung in it,
    a damp sheet and a pink towel heaped inside, the hanging rail across it with two wire hangers."""
    W, H = 26, 17
    cv = Cv(W, H)
    for (x, y) in ((2.5, 2.0), (2.5, H - 2.0), (W - 2.5, 2.0), (W - 2.5, H - 2.0)):
        fill_shape(cv, x, y, 1.2, 0.9, lambda u, v, L: shade(RUBBER, 0.4 + L * 0.4))
    canvas = ramp('#e2dccb', 0.4, 0.2, 0.2)
    slab(cv, 2.5, 2.5, W - 2.5, H - 2.5, canvas, 0.3, 0.5, 1.4, 1.6)
    fill_shape(cv, W / 2, H / 2, W / 2 - 4.5, H / 2 - 4.5, lambda u, v, L: dk(canvas[0], 0.2), kind='rect', corner=1.2, bevel=0.5)
    cv.outline()

    def load(ly):
        for (x, y, rx, ry, a, c) in ((10.0, 8.0, 5.0, 3.2, 0.3, '#e8e6de'), (16.0, 9.2, 4.0, 2.8, -0.4, '#e8a0b4'), (12.5, 10.5, 3.0, 1.8, 0.1, '#bcd8e8')):
            r = ramp(c, 0.4, 0.2, 0.25)
            fill_shape(ly, x, y, rx, ry, lambda u, v, L, r=r, a=a: shade(r, max(0.0, min(1.0, 0.6 + 0.25 * L + 0.18 * math.sin(u * 2.1 + v * 1.9 + a * 5)))),
                       ang=a, kind='super', p=2.2)
    layer(cv, load)
    chrome_bar(cv, 2.0, 7.8, W - 2.0, 8.8)                             # the rail
    for x in (6.5, 19.0):
        line(cv, x, 8.3, x - 1.5, 5.0, hx('#c8ccd6'))
        line(cv, x, 8.3, x + 1.5, 5.0, hx('#c8ccd6'))
    return cv


def p_plastic_chair():
    """A moulded plastic chair from above, 40 cm: an orange shell, its seat dished and scratched pale, the back's lip
    along -y, four chrome feet poking out."""
    S = 15
    cv = Cv(S, S)
    for (x, y) in ((2.0, 2.5), (S - 2.0, 2.5), (2.0, S - 2.0), (S - 2.0, S - 2.0)):
        fill_shape(cv, x, y, 0.9, 0.9, lambda u, v, L: shade(CHROME, L))
    org = ramp('#e87a2a', 0.5, 0.25, 0.35)
    fill_shape(cv, S / 2, S / 2 + 0.5, S / 2 - 1.5, S / 2 - 2.0, lambda u, v, L: shade(org, 0.75 - L * 0.5 if abs(u) < 3.5 and abs(v) < 3 else L),
               kind='super', p=3.2)
    fill_shape(cv, S / 2, 2.6, S / 2 - 1.5, 1.4, lambda u, v, L: shade(org, 0.4 + L * 0.6), kind='rect', corner=1.0, bevel=0.8)   # the back
    smudge(cv, random.Random(4111), 3, (4, 5, S - 4, S - 4), (0.6, 1.2), 0.25, hx('#f4c8a0'))
    cv.outline()
    return cv


def p_cig_machine():
    """The cigarette machine from above, 70 cm: a walnut-grain cabinet, its lit strip of brands along the front (a
    column a brand: red, white, blue, gold, green), the row of chrome pull knobs, the coin slot and its plate, burns
    where people park their smokes on its top, an empty pack."""
    W, H = 24, 17
    cv = Cv(W, H)
    wood_fill(cv, 1, 1, W - 2, H - 2, hx('#5a3a20'), plank=8, rng=random.Random(4112))
    bevel_edges(cv, 1, 1, W - 2, H - 2, 0.2, 0.3)
    frect(cv, 2, 9.0, W - 2, 12.5, hx('#fff0c8'))                      # the lit strip
    for k, c in enumerate(('#c8242c', '#e8e4d8', '#2a4a9a', '#d8b048', '#3a9a4a', '#c8242c', '#1c1c22')):
        packet(cv, 2.5 + k * 2.8, 9.4, 2.2, 2.8, c)
    for k in range(7):
        knob(cv, 3.6 + k * 2.8, 14.2, 0.8, '#c8ccd4', 1.57)
    chrome_bar(cv, 17.0, 2.5, 21.5, 6.5)
    frect(cv, 18.8, 3.4, 19.6, 5.4, hx('#2a2a34'))
    rng = random.Random(4113)
    for _ in range(4):
        cv.dot(rng.uniform(3, 15), rng.uniform(3, 8), hx('#1a100c'))    # burns
    slab(cv, 5.0, 3.0, 8.5, 5.5, ramp('#e8e4d8', 0.4, 0.2, 0.2), 0.5, 0.3, 0.3, 0.2, 0.4)   # an empty pack
    frect(cv, 5.8, 3.4, 7.6, 4.0, hx('#c8242c'))
    cv.outline()
    return cv, glow_from(cv, lambda x, y, c: 9 <= y <= 12 and 2 <= x <= W - 3)


def p_ice_bin():
    """The bar's ice bin from above, 55 cm: a stainless chest, its sliding lid half back on the cubes heaped inside,
    the scoop's handle sticking out, a bar towel over one corner, the sweat running down its front."""
    W, H = 20, 15
    cv = Cv(W, H)
    st = ramp('#b8bcc8', 0.5, 0.26, 0.42)
    slab(cv, 1, 1, W - 1, H - 1, st, 0.3, 0.55, 1.0, 0.6)
    brushed(cv, random.Random(4114), (1, 1, W - 1, H - 1), 5)
    frect(cv, 9.0, 3.0, W - 3.0, H - 3.0, hx('#3a4a5a'))               # the open half
    rng = random.Random(4115)
    for _ in range(26):
        x, y = rng.uniform(9.2, W - 4.0), rng.uniform(3.2, H - 4.0)
        frect(cv, x, y, x + 1.0, y + 1.0, hx('#dff2ff') if rng.random() < 0.6 else hx('#a8cce0'))
        cv.dot(x, y, hx('#ffffff'))
    frect(cv, 3.0, 3.0, 9.0, 3.5, dk(st[1], 0.2))                      # the lid's edge
    fill_capsule(cv, [(11.0, 9.0), (15.5, 5.0)], 0.6, lambda q, L, s_, i, t: shade(CHROME, L))   # the scoop
    slab(cv, 1.5, 9.5, 6.5, 13.5, ramp('#e8e6de', 0.4, 0.2, 0.2), 0.45, 0.4, 0.8, 0.6, 0.15)   # the towel
    frect(cv, 2.2, 10.6, 6.0, 11.1, hx('#c8242c'))
    cv.outline()
    return cv


def p_coat_rack():
    """A coat stand from above, 60 cm across its coats: the turned wooden post and its brass hooks, a tan raincoat
    and a black leather jacket hung on it, a hat on top."""
    S = 20
    c = S / 2
    cv = Cv(S, S)
    for (a, col, rx, ry) in ((0.5, '#a8906a', 5.6, 3.6), (3.5, '#2a2428', 5.2, 3.4)):
        r = ramp(col, 0.5, 0.25, 0.3)
        x, y = c + math.cos(a) * 3.6, c + math.sin(a) * 3.6
        fill_shape(cv, x, y, rx, ry, lambda u, v, L, r=r: shade(r, max(0.0, min(1.0, 0.25 + L * 0.6 + 0.12 * math.sin(u * 1.9)))), ang=a + 1.57, kind='super', p=2.4)
        line(cv, x - math.sin(a) * 2.5, y + math.cos(a) * 2.5, x + math.sin(a) * 2.5, y - math.cos(a) * 2.5, dk(r[1], 0.25))
    cv.outline()

    def top(ly):
        fill_shape(ly, c, c, 3.4, 3.4, lambda u, v, L: shade(ramp('#3a3430', 0.5, 0.25, 0.4), L))   # the hat's brim
        fill_shape(ly, c, c, 1.9, 2.2, lambda u, v, L: shade(ramp('#4a443e', 0.5, 0.25, 0.4), 0.2 + L * 0.7))
        ring(ly, c, c, 1.9, 2.3, lambda dx, dy, d: hx('#1c1814'))
    layer(cv, top)
    return cv


def p_bottle_crate():
    """A crate of empties from above, 40 cm: red plastic, its hand holes, the grid of twelve cells, most with the
    crown-less mouth of a brown bottle in it, three empty."""
    W, H = 16, 12
    cv = Cv(W, H)
    red = ramp('#b82030', 0.5, 0.25, 0.35)
    slab(cv, 1, 1, W - 1, H - 1, red, 0.3, 0.55, 0.8, 0.6)
    frect(cv, 2.5, 2.5, W - 2.5, H - 2.5, dk(red[0], 0.35))
    for k in range(12):
        x, y = 3.6 + (k % 4) * 2.9, 3.6 + (k // 4) * 2.4
        if k in (2, 7, 9):
            continue
        ring(cv, x, y, 0.0, 1.0, lambda dx, dy, d: hx('#1a100c') if d < 0.5 else (hx('#8a5a2a') if dx + dy < 0 else hx('#5a3a16')))
    for x in (1.0, W - 1.5):
        frect(cv, x, 5.0, x + 0.5, 7.0, hx('#3a0a12'))
    cv.outline()
    return cv


def p_wet_sign():
    """A yellow CAUTION WET FLOOR sign stood open on the tiles, from above, 30 cm: its two leaves seen edge on from
    the top hinge, the black pictogram and band on each, scuffed."""
    W, H = 11, 9
    cv = Cv(W, H)
    yel = ramp('#f0c820', 0.5, 0.25, 0.35)
    slab(cv, 1, 1, W - 1, H - 1, yel, 0.3, 0.55, 0.6, 0.6)
    frect(cv, 1.5, H / 2 - 0.4, W - 1.5, H / 2 + 0.4, yel[3])           # the hinge
    for y in (2.0, 6.2):
        frect(cv, 2.5, y, W - 2.5, y + 0.6, hx('#1c1c22'))
    for (x, y) in ((5.0, 3.0), (5.5, 3.5), (6.0, 3.0), (5.5, 5.2)):
        cv.dot(x, y, hx('#1c1c22'))
    smudge(cv, random.Random(4116), 2, (2, 2, W - 2, H - 2), (0.6, 1.0), 0.3, hx('#8a7a3a'))
    cv.outline()
    return cv


def p_mop_bucket():
    """A mop bucket on its castors from above, 40 cm: yellow plastic, the grey water to its rim with a scum of suds, the
    wringer's red jaws across one side, the mop stood in it, its grey strings fanned over the rim and its handle
    leaning out."""
    S = 18
    c = S / 2 - 1
    cv = Cv(S, S)
    yel = ramp('#e8c020', 0.5, 0.25, 0.35)
    fill_shape(cv, c, c + 1, 6.6, 6.6, lambda u, v, L: shade(yel, L), kind='super', p=3.0)
    fill_shape(cv, c, c + 1, 5.2, 5.2, lambda u, v, L: mix(hx('#4a5258'), hx('#6a747a'), 0.5 + 0.5 * math.sin(u * 1.3 + v)), kind='super', p=3.0)
    rng = random.Random(4117)
    for _ in range(12):
        cv.dot(c + rng.uniform(-4, 4), c + 1 + rng.uniform(-4, 4), hx('#c8d0d4'))   # suds
    frect(cv, c - 5.0, c - 4.0, c + 5.0, c - 1.6, hx('#b8242a'))       # the wringer
    frect(cv, c - 5.0, c - 4.0, c + 5.0, c - 3.5, hx('#e04a4a'))
    for x in (-3.0, -1.0, 1.0, 3.0):
        frect(cv, c + x, c - 3.2, c + x + 0.6, c - 1.8, hx('#5a0e14'))
    cv.outline()

    def mop(ly):
        for k in range(7):                                             # the strings over the rim
            a = 0.2 + k * 0.22
            fill_capsule(ly, [(c + 1.5, c + 2.5), (c + 1.5 + math.cos(a) * 5.5, c + 2.5 + math.sin(a) * 5.5)], 0.55,
                         lambda q, L, s_, i, t, k=k: hx('#9a9a94') if k % 2 else hx('#7c7c78'))
        fill_capsule(ly, [(c + 1.5, c + 2.5), (S - 1.2, 1.2)], 0.55, lambda q, L, s_, i, t: shade(WOOD, 0.35 + L * 0.5))   # the handle
    layer(cv, mop)
    return cv


def p_water_cooler():
    """An office water cooler from above, 40 cm: the upturned bottle's blue dome with the lights of the room in it and
    its water line, the white cabinet's shoulders, the two taps (blue, red) and the drip tray on the front, the paper
    cups' tube on its side."""
    S = 15
    c = S / 2
    cv = Cv(S, S)
    fill_shape(cv, c, c, 6.5, 6.5, lambda u, v, L: shade(ramp('#e2e4e8', 0.4, 0.2, 0.3), L), kind='super', p=3.4)
    frect(cv, c - 3.0, S - 3.4, c + 3.0, S - 1.6, hx('#5a626c'))       # the drip tray
    for x in (c - 2.2, c - 0.2, c + 1.8):
        frect(cv, x, S - 3.0, x + 0.5, S - 2.0, hx('#2a3038'))
    cv.dot(c - 1.5, S - 4.0, hx('#2a6ad8'))
    cv.dot(c + 1.5, S - 4.0, hx('#c8242c'))
    water = ramp('#8fc8e8', 0.5, 0.25, 0.5)
    fill_shape(cv, c, c - 0.6, 4.6, 4.6, lambda u, v, L: shade(water, 0.2 + L * 0.8))
    ring(cv, c, c - 0.6, 2.6, 3.0, lambda dx, dy, d: lt(water[2], 0.35))   # the water line
    fill_shape(cv, c - 1.6, c - 2.4, 1.0, 0.7, lambda u, v, L: hx('#ffffff'), ang=-0.6)
    fill_shape(cv, c, c - 0.6, 1.2, 1.2, lambda u, v, L: water[1])
    fill_capsule(cv, [(S - 2.0, 3.0), (S - 2.0, 8.0)], 0.9, lambda q, L, s_, i, t: hx('#f4f0e2') if L > 0.4 else hx('#c8c4b4'))   # cups
    cv.outline()
    return cv


def p_filing_cabinet():
    """A steel filing cabinet from above, 50 cm deep: olive paint chipped to the metal at its corners, the top drawer
    left a hand open on the tabs of its folders, a stack of files and a ring binder dumped on top, a coffee ring, dust
    along the back."""
    W, H = 18, 22
    cv = Cv(W, H)
    ol = ramp('#6a705a', 0.5, 0.25, 0.35)
    slab(cv, 1, 1, W - 1, H - 4, ol, 0.3, 0.5, 1.0, 0.5)
    slab(cv, 1.5, H - 5.5, W - 1.5, H - 1, ramp('#5a604c', 0.5, 0.25, 0.35), 0.3, 0.4, 0.6, 0.3)   # the open drawer
    frect(cv, 2.5, H - 4.6, W - 2.5, H - 2.2, hx('#1a1a14'))
    for k, col in enumerate(('#e2d8a8', '#d8c890', '#e8e0c0', '#c8b878', '#e2d8a8', '#d0c088')):   # folder tabs
        frect(cv, 3.0 + k * 2.0, H - 4.4 + (k % 2) * 0.5, 4.5 + k * 2.0, H - 2.6, hx(col))
    chrome_bar(cv, 6.0, H - 1.9, W - 6.0, H - 1.2)                     # its handle
    smudge(cv, random.Random(4118), 3, (1, 1, W - 1, 4), (0.8, 1.4), 0.3, hx('#9aa0a8'))   # chipped to the metal
    frect(cv, 1.5, 1.5, W - 1.5, 2.5, lambda c: mix(c, hx('#b8b2a4'), 0.3))   # dust
    cv.outline()

    def things(ly):
        for k, col in enumerate(('#d8c890', '#e8e0c0', '#c8b878')):
            slab(ly, 3.0 + k * 0.6, 4.0 + k * 0.8, 11.0 + k * 0.6, 11.5 + k * 0.8, ramp(col, 0.4, 0.2, 0.2), 0.45, 0.4, 0.4, 0.2, 0.1 - k * 0.12)
        slab(ly, 9.0, 10.5, 15.5, 15.5, ramp('#2a4a9a', 0.45, 0.22, 0.3), 0.35, 0.45, 0.5, 0.3, -0.3)   # a ring binder
        frect(ly, 10.0, 12.6, 14.0, 13.4, hx('#f4f0e2'))
    layer(cv, things)
    ring(cv, 5.0, 14.5, 1.2, 1.6, lambda dx, dy, d: lambda_dark(cv, 5.0 + dx, 14.5 + dy) if dx + dy < 1.2 else None)
    return cv


def p_safe():
    """A floor safe from above, 70 cm: a block of dark green steel with rounded shoulders, a brass plate, the door's
    edge along the front with its three hinges' knuckles, the dial and the spoked handle seen from over them, a
    ledger and a strapped bundle forgotten on top, dust."""
    S = 24
    cv = Cv(S, S)
    gr = ramp('#2e3a36', 0.5, 0.25, 0.4)
    slab(cv, 1, 1, S - 1, S - 1, gr, 0.25, 0.6, 1.6, 1.2)
    mottle(cv, random.Random(4119), 3, 5)
    frect(cv, 2.0, S - 4.5, S - 2.0, S - 4.0, dk(gr[0], 0.3))           # the door's seam
    for y in (S - 3.6,):
        for x in (3.0, 5.0):
            stud(cv, x, y, hx('#6a705a'), big=True)
    ring(cv, 12.0, S - 2.6, 0.0, 1.5, lambda dx, dy, d: shade(CHROME, 0.3 + 0.7 * light(dx / max(d, 0.1), dy / max(d, 0.1))) if d > 0.6 else hx('#1c1c22'))   # the dial
    for a in (0.0, 2.09, 4.19):                                        # the handle's spokes
        line(cv, 18.0, S - 2.6, 18.0 + math.cos(a) * 1.8, S - 2.6 + math.sin(a) * 1.8, hx('#d8dce6'))
    frect(cv, 8.0, 3.0, 16.0, 5.0, BRASS[2])                           # the maker's plate
    frect(cv, 8.0, 3.0, 16.0, 3.5, BRASS[3])
    frect(cv, 9.5, 3.9, 14.5, 4.3, BRASS[0])
    cv.outline()

    def things(ly):
        slab(ly, 3.5, 8.0, 12.5, 15.5, ramp('#5a1a1e', 0.45, 0.22, 0.3), 0.35, 0.45, 0.6, 0.4, 0.12)   # the ledger
        frect(ly, 5.0, 10.0, 9.0, 10.6, hx('#d8b048'))
        slab(ly, 14.0, 9.0, 20.5, 13.0, CASH, 0.4, 0.4, 0.5, 0.3, -0.25)   # a strapped bundle
        fill_shape(ly, 17.25, 11.0, 0.8, 2.0, lambda u, v, L: hx('#f4f0e2'), ang=-0.25, kind='rect', corner=0.1)
    layer(cv, things)
    return cv


def p_pallet():
    """A pallet of stock from above, 1.2 m: the slats of the pallet showing along one side and between the boxes, cases
    of spirits and mixers stacked on it (cardboard, printed bands, one shrink-wrapped block of cans glinting), a
    packing slip under a strap, one box slit open."""
    W, H = 40, 32
    cv = Cv(W, H)
    wood_fill(cv, 1, 1, W - 2, H - 2, hx('#a07848'), plank=5, rng=random.Random(4120), vertical=True)
    for x in range(6, W - 2, 6):
        frect(cv, x, 1, x + 1, H - 1, hx('#2a1c10'))                   # between two slats
    cv.outline()

    def stock(ly):
        carton(ly, 2.0, 2.0, 15.0, 14.0, 4121)
        carton(ly, 15.5, 2.5, 28.0, 13.0, 4122, 0.04)
        carton(ly, 2.5, 14.5, 14.0, 29.0, 4123, -0.03)
        carton(ly, 21.0, 16.0, 33.0, 28.5, 4124, 0.08)
        for (x0, y0, x1, col) in ((3.0, 4.0, 14.0, '#c8242c'), (16.5, 4.5, 27.0, '#2a4a9a'), (3.5, 17.0, 13.0, '#3a9a4a')):
            frect(ly, x0, y0, x1, y0 + 1.6, hx(col))
            frect(ly, x0 + 1.0, y0 + 0.5, x0 + 6.0, y0 + 1.0, hx('#f4ecd0'))
        slab(ly, 14.5, 14.0, 21.0, 22.0, ramp('#9aa8b8', 0.45, 0.22, 0.4), 0.4, 0.5, 0.8, 0.6)   # cans in shrink-wrap
        for i in range(12):
            can_top(ly, 15.8 + (i % 3) * 2.0, 15.2 + (i // 3) * 1.9, 0.85, '#d8dce4')
        frect(ly, 22.5, 20.0, 31.5, 20.6, hx('#f0e8a0'))               # a strap, a slip under it
        slab(ly, 24.0, 17.5, 29.0, 22.5, ramp('#f4f0e2', 0.3, 0.15, 0.1), 0.6, 0.3, 0.2, 0.1, 0.08)
        frect(ly, 24.8, 18.6, 28.0, 19.0, hx('#5a5a60'))
        frect(ly, 6.0, 21.0, 11.0, 25.5, hx('#2a1c10'))                # the box slit open
        for (bx, by) in ((7.2, 22.2), (9.6, 22.2), (7.2, 24.4), (9.6, 24.4)):
            can_top(ly, bx, by, 0.95, '#3a6a3a')
    layer(cv, stock)
    return cv


def p_steel_shelf():
    """Storeroom shelving from above, 1.25 m: slotted grey steel uprights, a top shelf loaded with catering tins,
    jars, a case of napkins, a coil of beer line, rolls of till paper, a box of light bulbs, dust on all of it."""
    W, H = 42, 14
    cv = shelf_frame(W, H, GREY_STEEL, rail=False)
    for x in (1.2, W - 1.8):
        for y in (3.5, 6.0, 8.5, 11.0):
            cv.dot(x, y, hx('#1c1c22'))                                 # the uprights' slots
    for k, col in enumerate(('#c8242c', '#c8242c', '#e8c040', '#d8dce4')):   # catering tins
        can_top(cv, 5.0 + k * 4.4, 6.0, 2.0, col)
        frect(cv, 4.0 + k * 4.4, 9.2, 6.0 + k * 4.4, 11.6, hx(col))
        frect(cv, 4.0 + k * 4.4, 10.0, 6.0 + k * 4.4, 10.5, hx('#f4f0e2'))
    carton(cv, 22.0, 3.5, 30.0, 11.5, 4125)
    ring(cv, 34.5, 6.5, 1.4, 3.0, lambda dx, dy, d: hx('#e8c070') if int(d * 2.2) % 2 else hx('#b07a2a'))   # the beer line
    for k in range(3):
        can_top(cv, 32.5 + k * 2.4, 11.0, 1.0, '#f4f0e2')              # till rolls
    smudge(cv, random.Random(4126), 6, (3, 3, W - 3, H - 3), (1.0, 2.2), 0.18, hx('#b8b2a4'))   # dust
    cv.outline()
    return cv


def p_hand_truck():
    """A hand truck laid against the stock, from above, 70 cm: red tubular steel, the two rails and their three
    rungs, the bent handles, the steel toe plate, two fat rubber wheels."""
    W, H = 14, 24
    cv = Cv(W, H)
    red = ramp('#c8242c', 0.5, 0.25, 0.4)
    for x in (2.2, W - 2.2):
        fill_shape(cv, x, H - 5.0, 1.3, 2.6, lambda u, v, L: shade(RUBBER, 0.3 + L * 0.6), kind='rect', corner=0.8, bevel=0.6)
    slab(cv, 2.5, H - 4.5, W - 2.5, H - 1.0, GREY_STEEL, 0.3, 0.6, 0.6, 0.3)   # the toe plate
    for x in (4.0, W - 4.0):
        fill_capsule(cv, [(x, H - 4.0), (x, 4.0), (x + (1.2 if x < W / 2 else -1.2), 1.5)], 0.7, lambda q, L, s_, i, t: shade(red, L))
    for y in (6.5, 11.5, 16.5):
        fill_capsule(cv, [(4.0, y), (W - 4.0, y)], 0.55, lambda q, L, s_, i, t: shade(red, 0.3 + L * 0.5))
    for x in (5.2, W - 5.2):
        frect(cv, x - 0.6, 1.0, x + 0.6, 2.4, hx('#1c1c22'))            # the grips
    cv.outline()
    return cv


def p_security_mirror():
    """The shop's convex mirror up in a corner: a dome of glass on its bracket, the whole shop bent small in it (the
    shelves' colours, the lit window), a hard glint."""
    def paint(cv):
        frect(cv, 5.0, 0.6, 7.0, 2.0, hx('#3a3a44'))                   # the bracket
        fill_shape(cv, 6.0, 3.2, 5.0, 2.6, lambda u, v, L: shade(ramp('#9ab0c4', 0.5, 0.25, 0.5), 0.2 + L * 0.8))
        for (x, c) in ((3.0, '#c8242c'), (4.5, '#e8c040'), (7.0, '#2a6ad8'), (8.5, '#f4f0e2')):
            cv.dot(x, 3.6, hx(c))
            cv.dot(x + 0.5, 3.6, hx(c))
        cv.dot(3.5, 2.2, hx('#ffffff'))
        cv.dot(4.0, 2.0, hx('#ffffff'))
    return on_wall(12, 6, paint)


def p_cig_rack():
    """The cigarettes behind a shop's counter: an overhead rack on the wall, the cartons' ends in rows by the brand
    (red, white, gold, blue, green), a strip of price tags, a gap where the cheap ones go fastest."""
    def paint(cv):
        frect(cv, 1, 0.6, 27, 5.0, hx('#3a3440'))
        frect(cv, 1, 0.6, 27, 1.2, hx('#5a5868'))
        cols = ('#c8242c', '#c8242c', '#e8e4d8', '#d8b048', '#2a4a9a', '#2a4a9a', '#3a9a4a', '#e8e4d8', '#c8242c', '#1c1c22', '#d8b048')
        for k, c in enumerate(cols):
            if k == 6:
                continue
            packet(cv, 1.6 + k * 2.3, 1.6, 1.9, 2.4, c)
        frect(cv, 1.5, 4.2, 26.5, 4.8, hx('#f4f0e2'))
        for k in range(11):
            cv.dot(2.0 + k * 2.3, 4.4, hx('#3a3440'))
    return on_wall(28, 6, paint)


def p_price_board():
    """The liquor store's price list on the wall: a black letter board in an aluminium frame, rows of white plastic
    letters, the specials in yellow, a few letters fallen out."""
    def paint(cv):
        fill_shape(cv, 12.0, 1.5, 11.0, 0.6, lambda u, v, L: shade(ALU, L), kind='rect', corner=0.2, bevel=0.3)
        frect(cv, 1.0, 2.0, 23.0, 4.0, hx('#1c1c22'))
        rng = random.Random(4127)
        for y in (2.4, 3.2):
            x = 1.8
            while x < 21.5:
                n = rng.choice((2, 3, 4))
                if rng.random() > 0.15:
                    frect(cv, x, y, x + n * 0.5, y + 0.5, hx('#f0c820') if rng.random() < 0.2 else hx('#f4f0e2'))
                x += n * 0.5 + 1.0
    return on_wall(24, 5, paint)


def p_tape_rack():
    """Video tapes for rent on a wall rack: the boxes' spines in rows, the loud colours of the covers, NEW stickers,
    a few slots out."""
    def paint(cv):
        frect(cv, 1, 0.6, 29, 5.0, hx('#2a2a34'))
        frect(cv, 1, 0.6, 29, 1.2, hx('#4a4a56'))
        rng = random.Random(4128)
        cols = ('#c8242c', '#e8c040', '#2a6ad8', '#1c1c22', '#e8508a', '#3a9a4a', '#e87a2a', '#7a3aa0', '#e8e4d8')
        for k in range(18):
            if k in (5, 13):
                continue
            c = cols[rng.randrange(len(cols))]
            packet(cv, 1.6 + k * 1.5, 1.6, 1.2, 2.9, c)
            if rng.random() < 0.25:
                cv.dot(1.9 + k * 1.5, 2.2, hx('#fff23a'))
    return on_wall(30, 6, paint)


def p_notice_board():
    """A cork board on the wall: cards and notices pinned one over the other (a lost cat, rooms to let with its
    fringe of phone numbers, a yellow flyer, the machine's rules), coloured pins."""
    def paint(cv):
        fill_shape(cv, 11.0, 1.5, 10.0, 0.6, lambda u, v, L: shade(WOOD, L), kind='rect', corner=0.2, bevel=0.3)
        frect(cv, 1.0, 2.0, 21.0, 4.0, hx('#b08a5a'))
        for (x0, x1, c) in ((1.8, 5.8, '#f4f0e2'), (6.4, 9.6, '#f0e060'), (10.4, 15.0, '#e8e4d8'), (15.6, 18.0, '#e8a0b4'), (18.4, 20.4, '#f4f0e2')):
            frect(cv, x0, 2.2, x1, 3.8, hx(c))
            frect(cv, x0 + 0.5, 2.9, x1 - 0.5, 3.2, hx('#6a6a70'))
            cv.dot(x0 + 0.5, 2.3, hx('#c8242c') if x0 < 10 else hx('#2a6ad8'))
        for x in (10.8, 11.6, 12.4, 13.2, 14.0):
            cv.dot(x, 3.6, hx('#b0aca0'))                               # the fringe of numbers
    return on_wall(22, 5, paint, 4129)


def p_coin_changer():
    """The change machine on the laundromat's wall: a steel box, the slot for the dollar bills lit green, the cup
    where the quarters drop, a strip of tape over a scratched OUT OF ORDER."""
    def paint(cv):
        fill_shape(cv, 6.0, 3.0, 5.0, 2.5, lambda u, v, L: shade(GREY_STEEL, L), kind='rect', corner=0.5, bevel=0.7)
        frect(cv, 2.0, 1.4, 10.0, 2.2, hx('#2a4a9a'))
        frect(cv, 3.0, 3.0, 7.0, 3.6, hx('#1c1c22'))
        cv.dot(7.6, 3.2, hx('#3aff8a'))
        frect(cv, 3.5, 4.4, 8.5, 6.0, hx('#3a3a44'))                   # the cup
        frect(cv, 3.5, 4.4, 8.5, 4.9, hx('#1c1c22'))
        cv.dot(5.0, 5.4, hx('#d8dce4'))
        frect(cv, 2.0, 2.4, 10.0, 2.9, hx('#e8e0b0'))                  # the tape
    return on_wall(12, 7, paint, 4130)


def p_hand_dryer():
    """The toilets' hot-air hand dryer: a white enamel shell gone yellow, the chrome nozzle turned up, the big steel
    button, a cigarette burn, its cover hanging by one screw."""
    def paint(cv):
        en = ramp('#d8d4c0', 0.42, 0.2, 0.3)
        fill_shape(cv, 5.0, 2.8, 4.0, 2.3, lambda u, v, L: shade(en, L), kind='rect', corner=1.0, bevel=1.0, ang=0.1)
        fill_shape(cv, 5.0, 5.2, 1.6, 1.1, lambda u, v, L: shade(CHROME, L))   # the nozzle
        fill_shape(cv, 5.0, 5.4, 0.9, 0.5, lambda u, v, L: hx('#141218'))
        fill_shape(cv, 6.8, 2.6, 1.0, 1.0, lambda u, v, L: shade(CHROME, 0.3 + L * 0.7))   # the button
        cv.dot(3.0, 2.0, hx('#3a2414'))
        stud(cv, 2.0, 1.2, hx('#8a8e98'))
    return on_wall(10, 7, paint, 4131)


def p_graffiti():
    """What is written on a toilet wall, seen from above as the strip of it nearest the floor: marker scrawls, a
    phone number, a heart, in black, red and a blue biro, gone over twice."""
    cv = Cv(28, 4)
    rng = random.Random(4132)
    frect(cv, 1, 1, 27, 3, hx('#8a8e96', 70))
    x = 1.5
    while x < 25.5:
        col = hx(rng.choice(('#1c1c22', '#1c1c22', '#b8242a', '#2a4a9a')), 215)
        n = rng.choice((2, 3, 5))
        y = 1.0
        for i in range(n * 2):
            y = max(1.0, min(2.5, y + rng.choice((-0.5, 0.0, 0.5))))
            cv.dot(x + i * 0.5, y, col)
            if rng.random() < 0.4:
                cv.dot(x + i * 0.5, y + 0.5, col)
        x += n + 1.0
    return cv


def p_wall_clock():
    """A round office clock on the wall, seen from above: the black rim, the white face tipped toward the room, the
    hour marks, the two hands at a quarter past two (the second hand is drawn live: render/PropLife.js)."""
    def paint(cv):
        fill_shape(cv, 4.5, 2.4, 3.5, 1.9, lambda u, v, L: shade(ramp('#1c1c22', 0.4, 0.2, 0.5), L))
        fill_shape(cv, 4.5, 2.6, 2.8, 1.4, lambda u, v, L: hx('#f4f0e2') if L > 0.3 else hx('#d8d4c4'))
        for x in (2.2, 4.5, 6.8):
            cv.dot(x, 2.6, hx('#1c1c22'))
        line(cv, 4.5, 2.6, 5.6, 2.2, hx('#1c1c22'))
        line(cv, 4.5, 2.6, 4.5, 3.6, hx('#1c1c22'))
    return on_wall(9, 5, paint)


def p_cleaning_rack():
    """The brooms on their hooks: a rail on the wall, a push broom (its head of stiff bristles toward the room), a
    string mop gone grey, a dustpan, a spray bottle and a yellow glove on the last hook."""
    def paint(cv):
        frect(cv, 1.0, 0.7, 21.0, 1.4, hx('#6a6e78'))
        for x in (3.5, 9.0, 14.0, 18.5):
            stud(cv, x, 1.0, hx('#c8ccd6'))
        frect(cv, 3.2, 1.4, 3.8, 4.0, WOOD[2])                         # the broom
        slab(cv, 1.2, 4.0, 6.8, 6.4, ramp('#8a6a3a', 0.45, 0.22, 0.3), 0.3, 0.5, 0.4, 0.3)
        for x in (1.6, 2.6, 3.6, 4.6, 5.6):
            frect(cv, x, 5.4, x + 0.5, 6.4, hx('#3a2a1c'))
        frect(cv, 8.7, 1.4, 9.3, 3.6, WOOD[1])                         # the mop
        for k in range(5):
            line(cv, 9.0, 3.6, 7.2 + k * 0.9, 6.2, hx('#9a9a94') if k % 2 else hx('#7c7c78'))
        slab(cv, 12.0, 2.0, 16.0, 5.6, ramp('#2a6ad8', 0.45, 0.22, 0.3), 0.3, 0.5, 0.5, 0.4)   # the dustpan
        slab(cv, 17.4, 2.0, 19.8, 4.6, ramp('#e8508a', 0.45, 0.22, 0.4), 0.3, 0.5, 0.5, 0.6)   # the spray
        frect(cv, 18.0, 4.6, 19.2, 5.4, hx('#f0c820'))                 # the glove
    return on_wall(22, 7, paint, 4133)


def p_bar_mat():
    """The rubber duckboard behind a bar, painted on its floor, 2 m by 45 cm: black ribbed rubber worn grey down the
    middle where the bartender walks, its drain holes, a corner curled, bottle caps and a lime wedge trodden into it,
    beer dried in the ribs. No outline (it lies flat)."""
    W, H = 64, 14
    cv = Cv(W, H)
    rb = ramp('#26222c', 0.4, 0.2, 0.3)
    n = VNoise(W, H, 6, random.Random(4134))

    def mat(x, y, c):
        if (x < 1.5 and y < 1.5 and x + y < 2.2) or (x > W - 2.5 and y > H - 2.5 and (W - x) + (H - y) < 3.2):
            return None                                                # its corners, one curled
        rib = int(y * 2) % 3 == 0
        worn = max(0.0, 1 - abs(y - H / 2) / 4.5) * (0.5 + n(x, y))
        col = shade(rb, 0.35 + (0.25 if rib else 0.0) + worn * 0.3)
        if int(x * 2) % 8 == 3 and int(y * 2) % 6 == 4:
            col = hx('#0c0a10')                                        # a drain hole
        return alpha(col, 235)
    px_paint(cv, 0, 0, W, H, mat)
    rng = random.Random(4135)
    for _ in range(5):
        can_top(cv, rng.uniform(4, W - 4), rng.uniform(3, H - 3), 0.7, rng.choice(('#d8b048', '#c8ccd4', '#b8242a')))
    fill_shape(cv, 41.0, 9.5, 1.3, 0.8, lambda u, v, L: hx('#8ab83a') if v > -0.2 else hx('#d8e89a'), ang=0.6)   # the lime
    smudge(cv, rng, 6, (2, 2, W - 2, H - 2), (1.5, 3.0), 0.25, hx('#5a4020'))
    return cv


def p_cardboard_flat():
    """A flattened carton laid as a mat inside a back door, painted on the floor: brown cardboard gone dark and soft
    with wet, the boot prints on it, its flaps' creases, a torn corner. No outline."""
    W, H = 30, 20
    cv = Cv(W, H)
    slab(cv, 0.5, 0.5, W - 0.5, H - 0.5, CARD, 0.3, 0.3, 0.3, 0.4, 0.03)
    for x in (9.0, 21.0):
        frect(cv, x, 1, x + 0.5, H - 1, lambda c: dk(c, 0.2) if c[3] else c)
    px_paint(cv, 0, 0, 5, 4, lambda x, y, c: CLEAR if x + y < 3.5 else None)
    rng = random.Random(4136)
    smudge(cv, rng, 9, (2, 2, W - 2, H - 2), (2.0, 4.5), 0.3)
    for (x, y, a) in ((8.0, 7.0, 0.3), (14.0, 12.5, 0.2), (20.5, 7.5, 0.35)):   # boot prints
        fill_shape(cv, x, y, 2.4, 1.2, lambda u, v, L: alpha(hx('#2e261e'), 120) if int(u * 2) % 2 else None, ang=a)
        fill_shape(cv, x - 3.2 * math.cos(a), y - 3.2 * math.sin(a), 1.1, 1.0, lambda u, v, L: alpha(hx('#2e261e'), 110), ang=a)
    return cv


# ---- what stands on their furniture (data/clutter.js)
def c_glass_rack():
    """A dishwasher rack of clean glasses on the back of the bar, from above: a grey plastic tray, nine rims."""
    cv = Cv(9, 9)
    slab(cv, 0.5, 0.5, 8.5, 8.5, ramp('#8a909c', 0.45, 0.22, 0.3), 0.3, 0.5, 0.5, 0.4)
    for k in range(9):
        x, y = 2.0 + (k % 3) * 2.5, 2.0 + (k // 3) * 2.5
        ring(cv, x, y, 0.5, 1.05, lambda dx, dy, d: hx('#eef6fa') if dx + dy < 0 else hx('#b8c8d0'))
        cv.dot(x, y, hx('#5a626c'))
    cv.outline()
    return cv


def c_phone():
    """A desk telephone from above: a black body, the receiver across its cradle, the dial's ring of holes, its cord."""
    cv = Cv(8, 7)
    bk = ramp('#26242c', 0.4, 0.2, 0.5)
    slab(cv, 1.0, 1.5, 7.0, 6.5, bk, 0.3, 0.6, 0.8, 0.8)
    ring(cv, 4.0, 4.6, 0.6, 1.5, lambda dx, dy, d: hx('#d8dce4') if int((math.atan2(dy, dx) + 3.2) * 1.6) % 2 else hx('#8a8e98'))
    fill_capsule(cv, [(1.2, 1.4), (6.8, 1.4)], 0.9, lambda q, L, s_, i, t: shade(bk, 0.3 + L * 0.7))
    cv.outline()
    return cv


def c_papers():
    """Loose paperwork from above: three sheets askew, typed lines, a red stamp, a paper clip."""
    cv = Cv(8, 7)
    for (a, c) in ((0.25, '#d8d2c0'), (-0.15, '#ece8dc'), (0.05, '#f6f2e8')):
        slab(cv, 1.2, 0.8, 6.8, 6.2, ramp(c, 0.3, 0.15, 0.1), 0.6, 0.3, 0.2, 0.1, a)
    for y in (2.0, 3.0, 4.0):
        frect(cv, 2.2, y, 5.6, y + 0.4, hx('#8a8a90'))
    frect(cv, 4.2, 4.8, 5.8, 5.6, hx('#c8242c', 200))
    cv.dot(2.0, 1.2, hx('#c8ccd6'))
    cv.outline()
    return cv


def c_mug():
    """A mug of coffee from above: white china, a brown ring inside its rim, the handle."""
    cv = Cv(5, 4)
    frect(cv, 3.5, 1.5, 4.5, 2.5, hx('#d8d4c8'))
    glass_top(cv, 2.0, 2.0, 1.6, hx('#3a2414'), hx('#f4f0e2'))
    cv.outline()
    return cv


def c_vhs():
    """A video cassette from above: black plastic, its two reel windows, a hand-written label."""
    cv = Cv(7, 5)
    slab(cv, 0.5, 0.5, 6.5, 4.5, ramp('#1c1c22', 0.4, 0.2, 0.5), 0.3, 0.6, 0.5, 0.3)
    frect(cv, 1.5, 1.0, 5.5, 2.0, hx('#f4f0e2'))
    frect(cv, 2.0, 1.3, 4.0, 1.6, hx('#2a4a9a'))
    for x in (2.2, 4.4):
        cv.dot(x, 3.2, hx('#5a5868'))
    cv.outline()
    return cv


def c_soap():
    """A box of soap powder from above, its flap torn open: orange and blue print, the white powder in it."""
    cv = Cv(5, 6)
    packet(cv, 0.5, 0.5, 4.0, 5.0, '#f26a1a')
    frect(cv, 0.5, 0.5, 4.5, 2.0, hx('#2a6ad8'))
    frect(cv, 1.2, 0.8, 3.8, 1.6, hx('#f4f6fc'))
    cv.outline()
    return cv


def c_folded():
    """Washing folded in a pile, from above: three pieces squared up, a blue stripe on the top one."""
    cv = Cv(9, 7)
    for k, c in enumerate(('#8a8c90', '#e8a0b4', '#e8e6de')):
        slab(cv, 0.6 + k * 0.4, 0.6 + k * 0.4, 7.6 + k * 0.4, 5.6 + k * 0.4, ramp(c, 0.4, 0.2, 0.25), 0.45, 0.4, 0.7, 0.7)
    frect(cv, 2.0, 3.6, 7.6, 4.1, hx('#2a5a8a'))
    cv.outline()
    return cv


def c_ledger():
    """The house's ledger from above: oxblood cloth boards, a gold label, a pencil across it."""
    cv = Cv(9, 7)
    slab(cv, 0.6, 0.6, 8.4, 6.4, ramp('#5a1a1e', 0.45, 0.22, 0.3), 0.35, 0.45, 0.5, 0.4)
    frect(cv, 0.6, 0.6, 1.4, 6.4, hx('#2a0a0e'))
    frect(cv, 3.0, 2.0, 6.5, 3.2, hx('#d8b048'))
    line(cv, 2.5, 5.5, 7.5, 4.2, hx('#e8c040'))
    cv.dot(7.5, 4.2, hx('#1c1c22'))
    cv.outline()
    return cv


def c_adding():
    """An adding machine from above: a beige body, its keys in rows, the paper tape curling off the back."""
    cv = Cv(7, 9)
    slab(cv, 0.6, 2.4, 6.4, 8.4, ramp('#c8c0a8', 0.42, 0.2, 0.25), 0.35, 0.5, 0.7, 0.5)
    for k in range(12):
        cv.dot(1.6 + (k % 4) * 1.2, 4.6 + (k // 4) * 1.1, hx('#3a3a44') if k % 4 < 3 else hx('#c8242c'))
    frect(cv, 1.5, 3.0, 5.5, 3.8, hx('#0c2a1a'))
    fill_capsule(cv, [(3.5, 2.4), (3.0, 1.2), (4.4, 0.7)], 0.8, lambda q, L, s_, i, t: hx('#f4f0e2') if L > 0.35 else hx('#d0ccbc'))
    cv.outline()
    return cv


def c_ashtray_full():
    """A glass ashtray nobody emptied all night, from above: heaped ash, six butts crushed in it, one still burning."""
    cv = Cv(7, 7)
    rng = random.Random(4137)
    ashtray(cv, 3.5, 3.5, rng, 3.0)
    fill_shape(cv, 3.5, 3.5, 1.9, 1.9, lambda u, v, L: mix(hx('#56525c'), hx('#8a8690'), 0.5 + 0.5 * math.sin(u * 3.1 + v * 2.3)))
    for _ in range(5):
        a = rng.uniform(0, 2 * math.pi)
        x, y = 3.5 + math.cos(a) * 1.2, 3.5 + math.sin(a) * 1.2
        cv.dot(x, y, hx('#efe6d4'))
        cv.dot(x + 0.5 * math.cos(a), y + 0.5 * math.sin(a), hx('#d89a50'))
    cv.dot(3.5, 3.0, hx('#ff6b1a'))
    cv.outline()
    return cv


GROUP = 'props'
SPRITES = {
    'shop_shelf': (p_shop_shelf, (42, 13), 'fine', (40, 11)),
    'wine_rack': (p_wine_rack, (42, 13), 'fine', (40, 11)),
    'beer_cases': (p_beer_cases, (22, 18), 'fine', (20, 16)),
    'lottery_stand': (p_lottery_stand, (14, 12), 'fine', (12, 10)),
    'tv_stack': (p_tv_stack, (32, 20), 'fine glow', (30, 18)),
    'vcr_shelf': (p_vcr_shelf, (42, 13), 'fine', (40, 11)),
    'tv_box': (p_tv_box, (22, 18), 'fine', (20, 16)),
    'repair_bench': (p_repair_bench, (48, 24), 'fine', (46, 22)),
    'dryer': (p_dryer, (24, 24), 'fine', (22, 22)),
    'folding_table': (p_folding_table, (46, 22), 'fine', (44, 20)),
    'soap_vend': (p_soap_vend, (20, 12), 'fine glow', (18, 10)),
    'laundry_cart': (p_laundry_cart, (26, 17), 'fine', (24, 15)),
    'plastic_chair': (p_plastic_chair, (15, 15), 'fine', (13, 13)),
    'cig_machine': (p_cig_machine, (24, 17), 'fine glow', (22, 15)),
    'ice_bin': (p_ice_bin, (20, 15), 'fine', (18, 13)),
    'coat_rack': (p_coat_rack, (20, 20), 'fine', (8, 8)),
    'bottle_crate': (p_bottle_crate, (16, 12), 'fine', (14, 10)),
    'wet_sign': (p_wet_sign, (11, 9), 'fine', (9, 7)),
    'mop_bucket': (p_mop_bucket, (18, 18), 'fine', (12, 12)),
    'water_cooler': (p_water_cooler, (15, 15), 'fine', (13, 13)),
    'filing_cabinet': (p_filing_cabinet, (18, 22), 'fine', (16, 20)),
    'safe': (p_safe, (24, 24), 'fine', (22, 22)),
    'pallet': (p_pallet, (40, 32), 'fine', (38, 30)),
    'steel_shelf': (p_steel_shelf, (42, 14), 'fine', (40, 12)),
    'hand_truck': (p_hand_truck, (14, 24), 'fine', (12, 22)),
    'security_mirror': (p_security_mirror, (12, 6), 'fine hung'),
    'cig_rack': (p_cig_rack, (28, 6), 'fine hung'),
    'price_board': (p_price_board, (24, 5), 'fine hung'),
    'tape_rack': (p_tape_rack, (30, 6), 'fine hung'),
    'notice_board': (p_notice_board, (22, 5), 'fine hung'),
    'coin_changer': (p_coin_changer, (12, 7), 'fine hung'),
    'hand_dryer': (p_hand_dryer, (10, 7), 'fine hung'),
    'graffiti': (p_graffiti, (28, 4), 'fine hung'),
    'wall_clock': (p_wall_clock, (9, 5), 'fine hung'),
    'cleaning_rack': (p_cleaning_rack, (22, 7), 'fine hung'),
    'bar_mat': (p_bar_mat, (64, 14), 'fine floor'),
    'cardboard_flat': (p_cardboard_flat, (30, 20), 'fine floor'),
    'clutter/glass_rack': (c_glass_rack, (9, 9), 'fine'),
    'clutter/phone': (c_phone, (8, 7), 'fine'),
    'clutter/papers': (c_papers, (8, 7), 'fine'),
    'clutter/mug': (c_mug, (5, 4), 'fine'),
    'clutter/vhs': (c_vhs, (7, 5), 'fine'),
    'clutter/soap': (c_soap, (5, 6), 'fine'),
    'clutter/folded': (c_folded, (9, 7), 'fine'),
    'clutter/ledger': (c_ledger, (9, 7), 'fine'),
    'clutter/adding': (c_adding, (7, 9), 'fine'),
    'clutter/ashtray_full': (c_ashtray_full, (7, 7), 'fine'),
}
