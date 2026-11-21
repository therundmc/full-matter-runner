"""Level 2A, part two (docs/LEVEL2.md segment 2): the street closed by works and the detour round them, the
side street's sheds and loading bays, the freeway's on-ramp (its rails, lamps, signs and paint), the toll plaza under
its roof, the freeway over the side street, the channelizers of a gore or a lane drop."""
import math
import random

from PIL import Image

from .core import (
    alpha, Cv, dk, fill_capsule, fill_shape, frect, hx, layer, light, line, lt, LX, LY, mix, OUTLINE, px_paint, ramp,
    ring, shade, shift, smudge, stud, tone, VNoise, wood_fill
)
from .palette import (
    CHROME, DECO_PINK, DECO_TEAL, GLASS, PASTEL_PINK, PASTEL_TEAL, ROAD_WHITE, ROAD_YELLOW, RUBBER, SIGN_GREEN,
    SIGN_INK, SIGN_ORANGE, SIGN_RED, SIGN_WHITE, SIGN_YELLOW, STEEL_L, ZINC
)
from .type import words
from .neon import neon_halo, neon_words
from .tiles import tile_px
from .road import GUTTER, road_mark, road_text


FLASH = (hx('#ff9a14'), hx('#ffbe3a'), hx('#fff2c4'))
CONCRETE = ramp('#a8a49a', 0.46, 0.24, 0.22)


def sign_plate(cv, x0, y0, x1, y1, face, rim=SIGN_WHITE, r=1.5, border=1.0):
    """A sign's plate laid back to be read from above: its rim, the face inside it, the sheen of the lamps across its
    top left corner."""
    cx, cy, rx, ry = (x0 + x1) / 2, (y0 + y1) / 2, (x1 - x0) / 2, (y1 - y0) / 2
    rim = hx(rim) if isinstance(rim, str) else rim
    fill_shape(cv, cx, cy, rx, ry, lambda u, v, L: rim, kind='rect', corner=r, bevel=0.5)
    fr = ramp(face, 0.4, 0.2, 0.14)
    fill_shape(cv, cx, cy, rx - border, ry - border,
               lambda u, v, L: fr[3] if (u + rx) + (v + ry) < min(rx, ry) * 0.8 else fr[2],
               kind='rect', corner=max(0.5, r - border), bevel=0.5)


def sign_wear(cv, rng, box, n=4):
    """What a roadside sign collects: grime in soft patches, a few chips to the metal, a sticker's ghost."""
    smudge(cv, rng, n, box, (1.2, 3.0), 0.16)
    smudge(cv, rng, n // 2 + 1, box, (0.4, 0.9), 0.5, hx('#8a8e98'))


# ---- the road closed by the works, the way round them
def p_road_closed():
    """The road closed, from above, 4 m: a barricade across the street (two rails striped red and white, the stripes
    leaning down toward its middle, on four splayed steel legs, a sandbag over each pair of feet), the ROAD CLOSED
    plate bolted over its middle, an amber flasher on each end post (the emissive map; signal `flash`)."""
    W, H = 128, 24
    cv, gl = Cv(W, H), Cv(W, H)
    rng = random.Random(9601)

    def legs(ly):
        for x in (6.0, 18.0, W - 18.0, W - 6.0):
            frect(ly, x - 1.0, 1, x + 1.0, H - 1, shade(STEEL_L, 0.32))
            frect(ly, x - 1.0, 1, x + 1.0, 1.5, shade(STEEL_L, 0.75))
    layer(cv, legs)
    sand = ramp('#8a7650', 0.5, 0.26, 0.25)

    def bags(ly):
        for x in (12.0, W - 12.0):
            for y in (2.6, H - 2.6):
                fill_shape(ly, x, y, 7.4, 2.1, lambda u, v, L: shade(sand, 0.25 + L * 0.7), kind='super', p=2.6)
                frect(ly, x - 0.25, y - 1.6, x + 0.25, y + 1.6, dk(sand[1], 0.2))   # its tie
    layer(cv, bags)
    red, white = ramp('#d0242c', 0.5, 0.26, 0.3), ramp('#ece8de', 0.4, 0.2, 0.2)

    def rails(ly):
        for (y0, y1) in ((4.0, 9.0), (15.0, 20.0)):
            def rail(x, y, cur, y0=y0, y1=y1):
                d = x if x < W / 2 else W - x
                r = red if int((d + (y - y0)) // 6) % 2 == 0 else white
                t = (y - y0) / (y1 - y0)
                return shade(r, 0.86 if t < 0.2 else 0.3 if t > 0.8 else 0.62)
            px_paint(ly, 1, y0, W - 1, y1, rail)
    layer(cv, rails)

    def plate(ly):
        sign_plate(ly, 29, 4.5, W - 29, 19.5, '#ece8de', rim=SIGN_INK, r=1.0, border=0.5)
        words(ly, W / 2, 8.5, 'ROAD CLOSED', SIGN_INK, 1.0, centre=True)
        for x in (30.5, W - 31.0):
            for y in (5.5, 18.0):
                stud(ly, x, y, hx('#9a9aa2'))
    layer(cv, plate)
    for x in (6.0, W - 6.0):
        fill_shape(cv, x, 6.5, 2.7, 2.7, lambda u, v, L: SIGN_INK)
        fill_shape(cv, x, 6.5, 2.0, 2.0, lambda u, v, L: shade(ramp('#8a6a16', 0.5, 0.25, 0.4), 0.3 + L * 0.7))
        cv.dot(x - 0.75, 5.75, hx('#ffe9a0'))
        fill_shape(gl, x, 6.5, 2.0, 2.0, lambda u, v, L: FLASH[2] if u * u + v * v < 1.4 else FLASH[1])
        ring(gl, x, 6.5, 2.0, 4.2, lambda dx, dy, d: alpha(FLASH[0], 130 if d < 3.0 else 56))
    smudge(cv, rng, 9, (2, 4, W - 2, 20), (0.6, 1.6), 0.45, hx('#8a8a92'))   # chipped
    smudge(cv, rng, 7, (2, 2, W - 2, H - 2), (1.5, 3.5), 0.18)
    return cv, gl


def p_sign_detour(left=False):
    """The works' DETOUR sign on its folding stand, laid back to be read: an orange plate, black rim, the word and a
    bent arrow (up, then off to the right, or the left), the stand's splayed feet under it."""
    def make():
        W, H = 42, 28
        cv = Cv(W, H)
        rng = random.Random(9611 + left)
        s = -1 if left else 1

        def stand(ly):
            for x in (5.0, W - 5.0):
                frect(ly, x - 0.75, H - 7, x + 0.75, H - 1.5, shade(STEEL_L, 0.42))
                frect(ly, x - 3.5, H - 2.0, x + 3.5, H - 0.75, shade(STEEL_L, 0.3))   # its feet
        layer(cv, stand)

        def face(ly):
            sign_plate(ly, 1, 1, W - 1, H - 4, SIGN_ORANGE, rim=SIGN_INK, r=1.5, border=1.0)
            words(ly, W / 2, 3.5, 'DETOUR', SIGN_INK, 1.0, centre=True)

            def arrow(x, y, cur):
                u = (x - W / 2) * s
                stem = abs(u + 6.0) < 1.1 and 13.5 <= y < 21.5
                bar = -7.1 <= u < 7.5 and 13.5 <= y < 15.7
                head = 7.0 <= u < 12.0 and abs(y - 14.6) < (12.0 - u) * 0.8
                return SIGN_INK if stem or bar or head else None
            px_paint(ly, 2, 11, W - 2, 23, arrow)
        layer(cv, face)
        sign_wear(cv, rng, (2, 2, W - 2, H - 5))
        return cv
    return make


def p_jersey_barrier():
    """A concrete safety barrier from above, 3 m (laid end to end along x): its narrow top, the sloped faces down to
    the toes (the one toward the light lit), two lifting slots across the top, the joint loops at its ends, the drain
    notch at its foot; chipped along every arris down to the aggregate, a rust run from a bar, black where tyres rubbed
    its toe, an amber reflector on the top."""
    W, H = 96, 20
    cv = Cv(W, H)
    rng = random.Random(9621)
    chip = VNoise(W, 20, 2, rng)
    grit = VNoise(W, 20, 4, rng)
    agg = hx('#7a766e')

    def f(x, y, cur):
        t = y - H / 2
        a, e = abs(t), min(x, W - x)
        if a >= 9.5 or e < max(0.0, (a - 2.5) * 0.22):
            return None
        arris = abs(a - 2.5) < 0.6 or abs(a - 7.5) < 0.6 or a > 8.8 or e < 1.2
        if arris and chip(x, y) > 0.7:
            return None if (a > 8.8 or e < 1.2) and chip(x, y) > 0.78 else shift(agg, rng.randint(-8, 8))
        if a < 2.5:
            L = 0.84
        elif a < 7.5:
            L = 0.95 if t < 0 else 0.34
        else:
            L = 0.7 if t < 0 else 0.2
        if 44 <= x < 52 and a >= 7.5:
            return hx('#1c1a22')                                           # the drain notch
        c = shade(CONCRETE, L)
        return shift(c, int((grit(x, y) - 0.5) * 18))
    px_paint(cv, 0, 0, W, H, f)
    for x in (22, 74):                                                     # the lifting slots
        frect(cv, x - 1.5, 7.5, x + 1.5, 12.5, hx('#16141c'))
        frect(cv, x - 1.5, 7.5, x + 1.5, 8.0, dk(CONCRETE[1], 0.3))
    for y in (6.5, 13.5):                                                  # the joint loops
        frect(cv, 0.5, y - 0.75, 2.0, y + 0.75, shade(STEEL_L, 0.45))
        frect(cv, W - 2.0, y - 0.75, W - 0.5, y + 0.75, shade(STEEL_L, 0.3))
    for k in range(9):                                                     # rust run down the near face
        cv.dot(23.0 + k * 0.15, 12.5 + k * 0.6, alpha(hx('#8a4a22'), 200 - k * 16))
        cv.dot(23.5 + k * 0.15, 12.5 + k * 0.6, alpha(hx('#6a3a1c'), 150 - k * 12))
    frect(cv, 47, 8.5, 49, 11.5, hx('#e8901c'))                             # the reflector
    cv.dot(47.25, 8.75, hx('#ffe0a0'))
    tyre = VNoise(W, 20, 6, rng)
    px_paint(cv, 0, H / 2 + 7.0, W, H / 2 + 9.5, lambda x, y, cur: mix(cur, hx('#1a1820'), 0.55) if cur[3] and tyre(x, y) > 0.56 else None)
    smudge(cv, rng, 10, (2, 2, W - 2, H - 2), (1.5, 4.0), 0.14)
    cv.outline()
    return cv


def p_water_barrier():
    """A plastic water-filled barrier from above, 1.8 m: blow-moulded orange, faded to salmon where the sun sits on
    it, the moulded ribs across it, its fill cap and drain plug, the lugs that pin it to the next one (two at one end,
    one at the other), scuffed black where cars kissed it."""
    W, H = 60, 20
    cv = Cv(W, H)
    rng = random.Random(9631)
    org = ramp('#ee6a1e', 0.5, 0.26, 0.3)
    salmon = hx('#f2a274')

    def lugs(ly):
        for (x, y) in ((2.6, 5.5), (2.6, H - 5.5), (W - 2.6, H / 2)):
            fill_shape(ly, x, y, 2.4, 2.2, lambda u, v, L: shade(org, 0.2 + L * 0.6), kind='rect', corner=1.0, bevel=0.8)
            fill_shape(ly, x, y, 0.8, 0.8, lambda u, v, L: hx('#2a1810'))
    layer(cv, lugs)
    fade = VNoise(W, 20, 5, rng)

    def body(ly):
        def f(u, v, L):
            c = shade(org, 0.15 + L * 0.8)
            if abs(v) < 2.0:
                c = lt(c, 0.1)                                             # the spine along its top
            return mix(c, salmon, 0.45) if fade(u + W / 2, v + H / 2) > 0.62 and L > 0.5 else c
        fill_shape(ly, W / 2, H / 2, W / 2 - 4.5, H / 2 - 1.5, f, kind='rect', corner=4.0, bevel=4.0)
    layer(cv, body)
    for x in (16.0, 26.0, 34.0, 44.0):                                     # the ribs
        px_paint(cv, x, 3.5, x + 0.5, H - 3.5, lambda x_, y, cur: dk(cur, 0.35) if cur[3] and cur != OUTLINE else None)
        px_paint(cv, x + 0.5, 3.5, x + 1.0, H - 3.5, lambda x_, y, cur: lt(cur, 0.18) if cur[3] and cur != OUTLINE else None)
    fill_shape(cv, 21.0, 8.0, 2.3, 2.3, lambda u, v, L: shade(ramp('#e8e4da', 0.4, 0.2, 0.2), 0.3 + L * 0.7))   # the fill cap
    ring(cv, 21.0, 8.0, 1.3, 1.6, lambda dx, dy, d: hx('#9a968c'))
    fill_shape(cv, 39.5, 12.5, 1.1, 1.1, lambda u, v, L: hx('#3a2216'))     # the drain plug
    smudge(cv, rng, 6, (6, 3, W - 6, H - 3), (1.0, 3.0), 0.4, hx('#2a2228'))   # tyre scuffs
    smudge(cv, rng, 5, (6, 3, W - 6, H - 3), (1.5, 3.5), 0.15)
    return cv


def p_excavator():
    """A tracked excavator parked for the night, from above, 6 m by 3 m (facing +x): two steel tracks caked with mud,
    the house over them (the rounded counterweight at the back with its fleet number, the engine deck with its
    louvres, exhaust and air filter, a handrail, the cab on the left with its glass roof, its guard bars and a dead
    beacon), the boom reaching forward on the right of the cab with its rams and hoses, the bucket curled on the
    ground under its end, teeth toward the machine. Construction yellow gone dull, chipped to grey and rust at every
    edge, mud to the knees."""
    W, H = 192, 96
    cv = Cv(W, H)
    rng = random.Random(9641)
    yel = ramp('#d8a018', 0.5, 0.27, 0.28)
    mud = ramp('#5a4632', 0.5, 0.26, 0.26)
    trk = ramp('#3e3e46', 0.5, 0.25, 0.35)
    caked = VNoise(W, H, 4, rng)

    def tracks(ly):
        for (y0, y1, inner) in ((8.0, 30.0, 1), (66.0, 88.0, -1)):
            fill_shape(ly, 63, (y0 + y1) / 2, 53, (y1 - y0) / 2, lambda u, v, L: trk[2], kind='rect', corner=9.0, bevel=2.0)

            def shoe(x, y, cur, y0=y0, y1=y1, inner=inner):
                if not cur[3]:
                    return None
                t = (y - y0) / (y1 - y0)
                if (inner > 0 and t > 0.76) or (inner < 0 and t < 0.24):
                    c = shade(yel, 0.45)                                   # the track frame, inside
                    if abs((x - 20) % 24 - 12) < 2.2 and abs(t - (0.88 if inner > 0 else 0.12)) < 0.08:
                        c = shade(trk, 0.6)                                # a carrier roller
                else:
                    c = shade(trk, 0.72 if x % 4 < 0.75 else 0.42 if x % 4 > 3.25 else 0.55)   # the grousers
                    if t < 0.08 or t > 0.92:
                        c = dk(c, 0.2)
                if caked(x, y) > 0.66 or (x < 20 or x > 106) and caked(x, y) > 0.5:
                    c = tone(mud, 0.3 + caked(x * 2, y) * 0.7)
                return c
            px_paint(ly, 9, y0, 118, y1, shoe)
    layer(cv, tracks)

    def house(ly):
        fill_shape(ly, 70, 48, 42, 27, lambda u, v, L: shade(yel, 0.2 + L * 0.72), kind='rect', corner=5.0, bevel=3.0)
        fill_shape(ly, 31, 48, 13, 29, lambda u, v, L: shade(yel, 0.16 + L * 0.74), kind='super', p=3.0)   # the counterweight
    layer(cv, house)
    frect(cv, 41.5, 23, 42.25, 73, dk(yel[1], 0.35))                       # its seam
    for k in range(12):                                                    # the hazard band on its back
        px_paint(cv, 18.5, 26 + k * 3.7, 22.5, 28.0 + k * 3.7, lambda x, y, cur: SIGN_INK if cur[3] and cur != OUTLINE and int(x + y) % 4 < 2 else None)
    words(cv, 27.5, 46.0, '07', SIGN_INK, 0.5)
    for x in range(46, 68, 3):                                             # the engine deck's louvres
        frect(cv, x, 54, x + 1.5, 72, dk(yel[1], 0.4))
        frect(cv, x, 54, x + 1.5, 54.5, lt(yel[2], 0.2))
    fill_shape(cv, 50.0, 29.0, 3.4, 3.4, lambda u, v, L: shade(ramp('#5a5e68', 0.5, 0.25, 0.35), 0.2 + L * 0.8))   # air filter
    fill_shape(cv, 60.0, 30.0, 2.2, 2.2, lambda u, v, L: shade(CHROME, 0.3 + L * 0.6))   # the exhaust
    fill_shape(cv, 60.0, 30.0, 1.2, 1.2, lambda u, v, L: hx('#0c0a10'))
    smudge(cv, rng, 4, (54, 24, 72, 36), (2.0, 4.5), 0.35, hx('#1c1a1e'))   # soot
    frect(cv, 44, 22.0, 70, 22.75, shade(yel, 0.9))                        # the handrail
    frect(cv, 44, 22.75, 70, 23.25, dk(yel[1], 0.4))

    def cab(ly):
        fill_shape(ly, 90, 33, 17, 12, lambda u, v, L: shade(ramp('#3a3c44', 0.5, 0.25, 0.35), 0.25 + L * 0.7), kind='rect', corner=2.5, bevel=1.5)

        def glass(x, y, cur):
            c = shade(GLASS, 0.55 + 0.25 * (1 if (x - y) % 23 < 2.5 else 0))   # the street's lamps in it
            return lt(c, 0.25) if (x + y) % 31 < 1.0 else c
        px_paint(ly, 76, 24, 104, 43, glass)
        for y in (28.5, 33.5, 38.5):                                       # the guard bars over the roof
            frect(ly, 76, y - 0.5, 104, y + 0.5, shade(ramp('#3a3c44', 0.5, 0.25, 0.35), 0.75))
        fill_shape(ly, 100, 26.5, 1.8, 1.8, lambda u, v, L: shade(ramp('#b86a10', 0.5, 0.25, 0.35), 0.3 + L * 0.7))   # the beacon
    layer(cv, cab)
    chrome = lambda k, L, s, i, t: shade(CHROME, 0.3 + L * 0.7)
    barrel = lambda k, L, s, i, t: shade(ramp('#4a4c56', 0.5, 0.25, 0.35), 0.2 + L * 0.7)

    def rams(ly):
        for (a, b, m) in (((104, 49.5), (134, 50.5), (122, 50.2)), ((104, 66.0), (134, 61.5), (122, 63.3))):
            fill_capsule(ly, [a, m], 2.0, barrel)
            fill_capsule(ly, [m, b], 1.2, chrome)
    layer(cv, rams)
    worn = ramp('#6a6458', 0.5, 0.25, 0.3)

    def bucket(ly):
        fill_shape(ly, 178, 54, 12, 15, lambda u, v, L: shade(worn, 0.2 + L * 0.75) if abs(v) < 12 else shade(yel, 0.15 + L * 0.7), kind='rect', corner=4.0, bevel=3.0)
        for k in range(5):                                                 # the teeth, toward the machine
            y = 43.5 + k * 5.25
            px_paint(ly, 161, y - 1.6, 167, y + 1.6, lambda x, y_, cur, y=y: shade(STEEL_L, 0.55 if y_ < y else 0.3) if abs(y_ - y) < (x - 161) * 0.32 + 0.4 else None)
    layer(cv, bucket)
    smudge(cv, rng, 8, (164, 40, 190, 68), (1.5, 4.0), 0.55, mud[1])

    def boom(ly):
        fill_capsule(ly, [(100, 57.5), (142, 55.0), (172, 53.0)], 6.0, lambda k, L, s, i, t: shade(yel, 0.2 + L * 0.75))
    layer(cv, boom)
    for off in (-3.5, 3.5):                                                # the hoses along it
        line(cv, 106, 56.5 + off, 166, 53.2 + off * 0.7, hx('#141218'))
    fill_capsule(cv, [(122, 55.5), (150, 54.0)], 1.6, barrel)              # the stick's ram on top of it
    fill_capsule(cv, [(150, 54.0), (166, 53.2)], 1.0, chrome)
    fill_shape(cv, 171, 53, 3.4, 3.4, lambda u, v, L: shade(yel, 0.2 + L * 0.75))   # the stick's pin
    fill_shape(cv, 171, 53, 1.2, 1.2, lambda u, v, L: shade(CHROME, 0.4 + L * 0.6))
    fill_shape(cv, 101, 57.5, 2.0, 2.0, lambda u, v, L: shade(CHROME, 0.4 + L * 0.6))
    edge = VNoise(W, H, 3, rng)
    px_paint(cv, 14, 12, 180, 86, lambda x, y, cur: shift(hx('#6a6a70'), rng.randint(-10, 10)) if cur[3] and cur != OUTLINE and cur[0] > 150 and cur[2] < 90 and edge(x, y) > 0.9 and rng.random() < 0.6 else None)   # chipped to grey
    smudge(cv, rng, 14, (16, 14, 112, 82), (0.6, 1.6), 0.5, hx('#7a4220'))  # rust
    smudge(cv, rng, 12, (16, 14, 176, 82), (2.0, 6.0), 0.16)
    return cv


def p_dump_truck():
    """A tipper lorry parked at the works, from above, 7.5 m (facing +x): the long hood of an old American truck with
    its fenders over the front wheels, the grille and bumper, the cab with its marker lamps, mirrors out on their
    arms, the exhaust stack and the air cleaner behind it; the steel tipper body with its rim and ribs, the cab guard
    over the cab, its tailgate, full of earth heaped up to the middle, stones and a slab of asphalt in it; the rear
    tyres showing under its sides. Red cab, the body gone to rust and dents, mud everywhere low."""
    W, H = 240, 84
    cv = Cv(W, H)
    rng = random.Random(9651)
    cab = ramp('#c04a1c', 0.5, 0.27, 0.3)
    body = ramp('#59604e', 0.5, 0.25, 0.3)
    earth = ramp('#6a5440', 0.5, 0.26, 0.26)

    def wheels(ly):
        for x in (40.0, 66.0, 222.0):
            for y in (3.0, H - 3.0):
                fill_shape(ly, x, y, 8.5, 2.6 if x < 200 else 4.0, lambda u, v, L: shade(RUBBER, 0.3 + L * 0.5), kind='rect', corner=1.5, bevel=1.0)
    layer(cv, wheels)

    def front(ly):
        for y in (11.0, H - 11.0):                                         # the fenders
            fill_shape(ly, 220, y, 12, 5.5, lambda u, v, L: shade(cab, 0.15 + L * 0.75), kind='rect', corner=3.0, bevel=2.5)
        fill_shape(ly, 221, H / 2, 16, 24, lambda u, v, L: shade(cab, 0.2 + L * 0.75), kind='rect', corner=4.0, bevel=4.0)   # the hood
        frect(ly, 236, 12, 239.5, H - 12, shade(CHROME, 0.6))              # the bumper
        fill_shape(ly, 191, H / 2, 15.5, 35, lambda u, v, L: shade(cab, 0.2 + L * 0.72), kind='rect', corner=3.0, bevel=2.5)   # the cab
    layer(cv, front)
    for y in range(24, H - 23, 3):                                         # the hood's vents and grille
        frect(cv, 210, y, 216, y + 1.25, dk(cab[1], 0.4))
    frect(cv, 234.5, 22, 236, H - 22, shade(CHROME, 0.85))
    frect(cv, 200.5, 9, 205.5, H - 9, lambda c: shade(GLASS, 0.6) if c[3] else c)   # the windscreen's top
    for y in range(28, 58, 6):                                             # the marker lamps on the roof
        frect(cv, 197, y, 198.5, y + 2, hx('#e8901c'))
    for y, s in ((2.5, 1), (H - 2.5, -1)):                                 # the mirrors on their arms
        line(cv, 199, y + s * 6.5, 199, y + s * 1.0, shade(STEEL_L, 0.5))
        frect(cv, 197.5, y - 1.5, 201.5, y + 1.5, SIGN_INK)
    fill_shape(cv, 178, 10.5, 2.4, 2.4, lambda u, v, L: shade(CHROME, 0.3 + L * 0.7))   # the stack
    fill_shape(cv, 178, 10.5, 1.2, 1.2, lambda u, v, L: hx('#0c0a10'))
    fill_shape(cv, 178, H - 10.5, 3.0, 3.0, lambda u, v, L: shade(ramp('#3a3c44', 0.5, 0.25, 0.35), 0.2 + L * 0.8))

    def tipper(ly):
        fill_shape(ly, 89, H / 2, 85, 38.5, lambda u, v, L: shade(body, 0.25 + L * 0.65), kind='rect', corner=2.0, bevel=3.0)
        fill_shape(ly, 177, H / 2, 6, 36, lambda u, v, L: shade(body, 0.3 + L * 0.6), kind='rect', corner=1.5, bevel=1.5)   # the cab guard
    layer(cv, tipper)
    for x in range(176, 183, 2):
        frect(cv, x, 8, x + 0.75, H - 8, dk(body[1], 0.25))
    for x in range(20, 170, 22):                                           # the ribs' tops on the rim
        for y in (4.5, H - 6.5):
            frect(cv, x, y, x + 2.5, y + 2, shade(body, 0.85))
    frect(cv, 4.5, 6, 8, H - 6, shade(body, 0.4))                          # the tailgate
    rag, lumpy = VNoise(W, H, 5, rng), VNoise(W, H, 3, rng)

    def load(x, y, cur):
        dx, dy = (x - 88) / 78.0, (y - H / 2) / 33.0
        d = max(abs(dx) ** 3 + abs(dy) ** 3, 0) ** (1 / 3.0) + (rag(x, y) - 0.5) * 0.12
        if d > 1.0:
            return None
        k = 0.45 - 0.55 * (dx * 0.4 + dy * 0.9) * (1 - d * 0.6) + (lumpy(x, y) - 0.5) * 0.3 + (1 - d) * 0.25
        c = earth[0 if k < 0.26 else 1 if k < 0.48 else 2 if k < 0.74 else 3]   # the ramp's tones: no smooth slope
        q = clods(x, y)
        if 0.47 < q < 0.53:
            c = dk(c, 0.3)                                                 # the cracks between its clods
        elif 0.53 <= q < 0.57 and k > 0.3:
            c = lt(c, 0.12)                                                # a clod's lit lip
        return shift(c, rng.randint(-3, 3))
    clods = VNoise(W, H, 2, rng)
    px_paint(cv, 10, 8, 166, H - 8, load)
    for _ in range(16):
        x, y = rng.uniform(26, 150), rng.uniform(16, H - 16)
        fill_shape(cv, x, y, rng.uniform(1.0, 2.2), rng.uniform(0.8, 1.6), lambda u, v, L: shade(ramp('#8a8478', 0.5, 0.25, 0.3), 0.2 + L * 0.8), ang=rng.uniform(0, 3))
    fill_shape(cv, 112, 30, 8, 5, lambda u, v, L: shade(ramp('#3e4048', 0.45, 0.22, 0.3), 0.3 + L * 0.6), kind='rect', corner=0.8, ang=0.35)   # a slab of asphalt
    smudge(cv, rng, 18, (6, 4, 172, H - 4), (1.0, 3.0), 0.5, hx('#7a4220'))   # rust
    smudge(cv, rng, 10, (180, 6, 236, H - 6), (1.5, 4.0), 0.4, earth[1])    # mud on the cab
    smudge(cv, rng, 10, (4, 2, W - 4, H - 2), (2.0, 5.0), 0.14)
    return cv


def heap(W, H, seed, base, bits, grain=0.0, ol='#20160e'):
    """A heap tipped at the works, lying on the road: a mound lit on its near side, lumps in it, crumbs round its foot
    (bits: their colours), grain: a scatter pixel by pixel (millings)."""
    def make():
        cv = Cv(W, H)
        rng = random.Random(seed)
        r = ramp(base, 0.5, 0.26, 0.26)
        rag, lump = VNoise(W, H, 6, rng), VNoise(W, H, 3, rng)

        def f(x, y, cur):
            dx, dy = (x - W / 2) / (W / 2 - 3.0), (y - H / 2) / (H / 2 - 3.0)
            d = math.hypot(dx, dy) + (rag(x, y) - 0.5) * 0.35
            if d > 1.0:
                return None
            k = 0.5 - 0.4 * (dx * 0.6 + dy * 0.8) * d + (lump(x, y) - 0.5) * 0.35 + (1 - d) * 0.2
            if grain:
                k += rng.uniform(-grain, grain)
            return tone(r, max(0.0, min(1.0, k)))
        px_paint(cv, 0, 0, W, H, f)
        for _ in range(int(W * H / 160)):
            x, y = rng.uniform(4, W - 4), rng.uniform(4, H - 4)
            if cv.on(x, y):
                cv.dot(x, y, shift(rng.choice(bits), rng.randint(-8, 8)))
        for _ in range(18):
            a, d = rng.uniform(0, 6.28), rng.uniform(1.0, 1.15)
            cv.dot(W / 2 + math.cos(a) * d * (W / 2 - 3), H / 2 + math.sin(a) * d * (H / 2 - 3), r[rng.randint(0, 2)])
        cv.outline(hx(ol))
        return cv
    return make


def p_works_light():
    """A lighting tower at the works, from above, lit: its trailer (the generator's white canopy with an orange band,
    louvres, a fuel cap), the drawbar, the wheels under their arches, four outriggers out on their jack pads, the mast
    head high over the back of it, four floodlights on its bar turned toward +x (the emissive map: their lenses)."""
    W, H = 96, 72
    cv, gl = Cv(W, H), Cv(W, H)
    rng = random.Random(9661)
    can = ramp('#d8d6cc', 0.45, 0.22, 0.2)
    leg = ramp('#d8a21c', 0.5, 0.26, 0.3)

    def under(ly):
        for x in (24.0, 66.0):                                             # the outriggers and their pads
            for s in (-1, 1):
                fill_capsule(ly, [(x, H / 2 + s * 12), (x, H / 2 + s * 31)], 1.3, lambda k, L, s_, i, t: shade(leg, L))
                fill_shape(ly, x, H / 2 + s * 32, 3.2, 2.4, lambda u, v, L: shade(STEEL_L, 0.2 + L * 0.6), kind='rect', corner=0.6)
        for y in (H / 2 - 13.5, H / 2 + 13.5):
            fill_shape(ly, 46, y, 6.0, 2.4, lambda u, v, L: shade(RUBBER, 0.3 + L * 0.5), kind='rect', corner=1.2, bevel=0.8)
        fill_capsule(ly, [(76, H / 2), (W - 3, H / 2)], 1.4, lambda k, L, s, i, t: shade(STEEL_L, L))
        fill_shape(ly, W - 3.5, H / 2, 2.2, 2.2, lambda u, v, L: shade(STEEL_L, 0.3 + L * 0.7))
    layer(cv, under)

    def body(ly):
        fill_shape(ly, 48, H / 2, 29, 12, lambda u, v, L: shade(can, 0.2 + L * 0.72), kind='rect', bevel=3.0, corner=3.0)
    layer(cv, body)
    frect(cv, 19.5, H / 2 + 6, 76.5, H / 2 + 8.5, lambda c: mix(c, hx('#e8661c'), 0.85) if c[3] and c != OUTLINE else None)
    for x in range(50, 72, 3):
        frect(cv, x, H / 2 - 9, x + 1.5, H / 2 - 5, dk(can[1], 0.35))
    fill_shape(cv, 70, H / 2 + 2, 1.6, 1.6, lambda u, v, L: shade(RUBBER, 0.4 + L * 0.5))   # the fuel cap
    frect(cv, 58, H / 2 + 1, 64, H / 2 + 4, SIGN_INK)                      # its control panel's door
    frect(cv, 58.5, H / 2 + 1.5, 63.5, H / 2 + 2, hx('#e8e4d6'))
    smudge(cv, rng, 6, (20, H / 2 - 11, 76, H / 2 + 11), (1.5, 4.0), 0.2)
    m = ramp('#4e5362', 0.5, 0.25, 0.4)

    def head(ly):
        fill_shape(ly, 30, H / 2, 2.6, 2.6, lambda u, v, L: shade(m, L))   # the mast's top
        frect(ly, 28.5, 12, 31.5, H - 12, shade(m, 0.55))                  # its bar
        for y in (16.0, 28.5, 43.5, 56.0):
            fill_shape(ly, 34, y, 5.5, 5.0, lambda u, v, L: shade(ramp('#2a2c34', 0.45, 0.22, 0.4), 0.25 + L * 0.7), kind='rect', corner=1.0, bevel=1.2)
    layer(cv, head)
    for y in (16.0, 28.5, 43.5, 56.0):
        frect(cv, 37.5, y - 4, 39.5, y + 4, hx('#f4f6ff'))
        frect(cv, 37.0, y - 4, 37.5, y + 4, hx('#9aa4c0'))
        frect(gl, 37.0, y - 4, 39.5, y + 4, hx('#ffffff'))
        px_paint(gl, 39.5, y - 6.5, 46, y + 6.5, lambda x, y_, cur, y=y: alpha(hx('#e6eeff'), int(max(0, 150 - (x - 39.5) * 22 - abs(y_ - y) * 12))) if 150 - (x - 39.5) * 22 - abs(y_ - y) * 12 > 8 else None)
    return cv, gl


def p_site_fence():
    """A temporary site fence from above, a 3.5 m panel (laid end to end along x), laid back so the mesh shows: the
    tube frame, the welded mesh, the black rubber feet with their clamp at each end, a KEEP OUT plate wired on."""
    W, H = 112, 20
    cv = Cv(W, H)
    rng = random.Random(9671)

    def feet(ly):
        for x in (3.0, W - 3.0):
            fill_shape(ly, x, H / 2, 2.8, 9.0, lambda u, v, L: shade(ramp('#2c2a30', 0.45, 0.22, 0.4), 0.25 + L * 0.65), kind='rect', corner=1.2, bevel=1.2)
            for y in (5.5, 14.5):
                fill_shape(ly, x, y, 0.8, 0.8, lambda u, v, L: hx('#0c0a10'))
    layer(cv, feet)

    def panel(ly):
        def mesh(x, y, cur):
            if y < 5.5 or y >= 7.0 + 6.0:
                return None
            if y < 6.5 or y >= 12.0 or x < 4.5 or x >= W - 4.5:
                return shade(ZINC, 0.85 if y < 6.0 or x < 5.0 else 0.4)    # the frame's tube
            if (x * 2) % 4 < 1 or (y * 2) % 3 < 1:
                return shade(ZINC, 0.6)
            return None
        px_paint(ly, 2.5, 5.5, W - 2.5, 13.0, mesh)
    layer(cv, panel, hx('#262430'))
    for x in (2.0, W - 4.0):                                               # the clamps
        frect(cv, x, 8.0, x + 2.0, 10.5, shade(STEEL_L, 0.6))
    sign_plate(cv, W / 2 - 14, 6.5, W / 2 + 14, 12.0, '#ece8de', rim=SIGN_RED, r=0.5, border=0.5)
    words(cv, W / 2, 7.5, 'KEEP OUT', hx('#c8242c'), 0.5, centre=True)
    smudge(cv, rng, 6, (4, 6, W - 4, 13), (0.6, 1.5), 0.4, hx('#8a4a22'))
    return cv


def p_road_cut():
    """Where the works milled the road off and cut a trench across it, flat on the ground, 4 m by 2.5 m: the milled
    band (its grooves along the way the drum ran, a shade paler than the old asphalt, crumbs of millings in them), the
    step down at its sawn edges (lit on the far sides, in shadow under the near), a fresh trench patch across it,
    black and still glossy, its tar joint, the surveyor's orange marks for the gas main."""
    W, H = 128, 80
    cv = Cv(W, H)
    rng = random.Random(9681)
    rag, wave = VNoise(W, H, 4, rng), VNoise(W, H, 8, rng)
    mill = hx('#5e616b')

    def f(x, y, cur):
        e = min(x, y, W - x, H - y) + (rag(x, y) - 0.5) * 1.6
        if e < 0.8:
            return None
        if e < 2.2:                                                        # the sawn step down
            lit = (W - x < min(x, y, H - y)) or (H - y < min(x, y, W - x))
            return (108, 108, 120, 200) if lit else (16, 14, 22, 190)
        yy = y + (wave(x, y) - 0.5) * 2.0
        c = shift(mill, 7 if (yy * 2) % 2 < 1 else -6)                    # the grooves
        return alpha(shift(c, rng.randint(-5, 5)), 232)
    px_paint(cv, 0, 0, W, H, f)

    def patch(x, y, cur):
        if not cur[3]:
            return None
        e = min(x - 84, 100 - x, y - 2.5, H - 2.5 - y)
        if e < 0:
            return None
        if e < 1.0:
            return (22, 20, 30, 240)                                       # the tar joint
        return alpha(shift(hx('#2a2a34'), rng.randint(-4, 4)), 246) if rng.random() > 0.05 else (74, 80, 98, 240)
    px_paint(cv, 84, 2, 100, H - 2, patch)
    orange = alpha(hx('#ea6e24'), 220)
    for y in range(8, H - 8, 4):
        frect(cv, 71, y, 72.5, y + 2, orange)                              # the main's line
    words(cv, 63.5, 10, 'G', orange, 1.0)
    for _ in range(70):
        x, y = rng.uniform(4, W - 4), rng.uniform(4, H - 4)
        if cv.on(x, y) and not 83 < x < 101:
            cv.dot(x, y, rng.choice(((38, 38, 46, 255), (122, 122, 130, 255), (72, 72, 82, 255))))
    return cv


def arrow_mark(W, H, pts, wid, head, seed, col=ROAD_WHITE):
    """A painted arrow along the polyline pts (world px), wid px wide, its head (length, half width) at its end, worn
    as road paint is."""
    (ax, ay), (bx, by) = pts[-2], pts[-1]
    n = math.hypot(bx - ax, by - ay)
    ux, uy = (bx - ax) / n, (by - ay) / n
    sx, sy = bx - ux * head[0], by - uy * head[0]
    shaft = list(pts[:-1]) + [(sx + ux, sy + uy)]

    def seg(px, py, a, b):
        dx, dy = b[0] - a[0], b[1] - a[1]
        t = max(0.0, min(1.0, ((px - a[0]) * dx + (py - a[1]) * dy) / (dx * dx + dy * dy)))
        return math.hypot(px - a[0] - t * dx, py - a[1] - t * dy)

    def mask(x, y):
        if min(seg(x, y, shaft[i], shaft[i + 1]) for i in range(len(shaft) - 1)) < wid / 2:
            return True
        t = (x - sx) * ux + (y - sy) * uy
        return 0 <= t < head[0] and abs(-(x - sx) * uy + (y - sy) * ux) < head[1] * (1 - t / head[0])
    return lambda: road_mark(W, H, mask, seed, col)


def mirror_y(pts, H):
    return [(x, H - y) for (x, y) in pts]


# ---- the side street: sheds, loading bays, a yard
def p_roller_door():
    """A shed's roller shutter, shut, hung on its wall (the wall at -y) and laid back to be read: the galvanized hood
    of its drum, the guide rails, the slats with their dents and rust runs, the bottom bar with its lock and handle;
    sprayed over with a crew's tag in pink and cyan, dripping."""
    W, H = 96, 16
    cv = Cv(W, H)
    rng = random.Random(9691)
    slat = ramp('#7c8494', 0.5, 0.25, 0.3)
    dent = VNoise(W, 16, 4, rng)

    def door(x, y, cur):
        if y < 3.0:
            return shade(ZINC, 0.85 if y < 1.0 else 0.55 if y < 2.5 else 0.25)   # the hood
        if x < 2.0 or x >= W - 2.0:
            return shade(ZINC, 0.7 if x < 1.0 or x >= W - 1.0 else 0.35)   # the guide rails
        if y >= H - 2.5:
            return shade(slat, 0.4 if y < H - 1 else 0.2)                  # the bottom bar
        t = (y - 3.0) % 1.5
        c = shade(slat, 0.8 if t < 0.5 else 0.6 if t < 1.0 else 0.35)
        return dk(c, 0.18) if dent(x, y) > 0.72 else c
    px_paint(cv, 0, 0, W, H, door)
    for (x, y0) in ((14.0, 3.5), (52.0, 4.0), (77.0, 3.5)):                 # rust runs from the hood
        for k in range(12):
            cv.dot(x + 0.25 * (k % 2), y0 + k * 0.5, alpha(hx('#8a4a22'), 210 - k * 14))
    fill_shape(cv, W / 2, H - 1.5, 2.0, 1.0, lambda u, v, L: shade(CHROME, 0.3 + L * 0.6), kind='rect', corner=0.4)   # the lock
    frect(cv, 30, H - 2.0, 36, H - 1.0, shade(STEEL_L, 0.55))              # the handle
    pink, cyan = hx('#ff3a8a'), hx('#2ae0f0')
    trng = random.Random(9692)
    for (col, x0, n) in ((cyan, 20.0, 6), (pink, 22.0, 6), (pink, 58.0, 4)):   # the tag
        pts, x, y = [], x0, trng.uniform(6, 10)
        for _ in range(n):
            pts.append((x, y))
            x, y = x + trng.uniform(2.5, 5.0), max(5.0, min(H - 4.5, y + trng.uniform(-3.5, 3.5)))
        fill_capsule(cv, pts, 0.9, lambda k, L, s, i, t, col=col: col if k < 0.75 else mix(col, hx('#ffffff'), 0.3))
        for (px, py) in pts[1::2]:
            for k in range(trng.randint(2, 5)):
                cv.dot(px, py + 1 + k * 0.5, col)                           # drips
    cv.outline()
    return cv


def p_loading_dock():
    """A loading bay's edge from above, 4 m: the concrete apron worn by pallets, the dock leveller's chequer plate on
    its hinge, the steel nosing painted in yellow and black stripes, two laminated rubber bumpers standing out from
    it (+y), oil and tyre black on the ground in front."""
    W, H = 128, 28
    cv = Cv(W, H)
    rng = random.Random(9701)
    grit = VNoise(W, 28, 3, rng)

    def apron(x, y, cur):
        if y >= 21:
            return None
        if y >= 18.5:
            return SIGN_INK if int((x + y) // 3) % 2 else hx('#e0b020')     # the nosing
        if 34 <= x < 94 and 1.5 <= y < 17.5:
            if y < 2.5:
                return shade(STEEL_L, 0.3)                                 # the leveller's hinge
            u, v = (x + y) * 0.7071, (x - y) * 0.7071
            st = ramp('#5a5e68', 0.45, 0.22, 0.35)
            return lt(st[2], 0.12) if (u % 4 < 0.9 and v % 4 < 2.2) or (v % 4 < 0.9 and (u + 2) % 4 < 2.2) else st[2]
        return shift(shade(CONCRETE, 0.62 if y > 1 else 0.9), int((grit(x, y) - 0.5) * 20))
    px_paint(cv, 0, 0, W, H, apron)
    for x in (34.0, 93.5):
        frect(cv, x, 1.5, x + 0.5, 17.5, hx('#16141c'))
    for x in (22.0, 106.0):                                                # the bumpers
        fill_shape(cv, x, 23.5, 5.5, 4.0, lambda u, v, L: shade(RUBBER, 0.3 + L * 0.5), kind='rect', corner=0.8, bevel=1.0)
        for k in range(-4, 5, 2):
            frect(cv, x + k - 0.25, 20.5, x + k + 0.25, 27, RUBBER[0])
        for y in (20.5, 26.5):
            frect(cv, x - 5.5, y, x + 5.5, y + 0.75, shade(STEEL_L, 0.5))
    smudge(cv, rng, 8, (2, 2, W - 2, 18), (1.5, 4.0), 0.18)
    smudge(cv, rng, 5, (36, 3, 92, 17), (1.0, 3.0), 0.4, hx('#6a3e22'))
    cv.outline()
    return cv


def p_chainlink_gate():
    """A yard's double gate of chain link, shut, from above (laid back so the mesh shows), 4 m: two leaves in their
    galvanized frames meeting in the middle, the chain and padlock round them, the drop rod, the round posts they hang
    on, two strands of barbed wire along the top, a PRIVATE plate."""
    W, H = 128, 16
    cv = Cv(W, H)
    rng = random.Random(9711)

    def leaves(ly):
        def f(x, y, cur):
            if not 3 <= y < 13:
                return None
            u = x - 4 if x < W / 2 else x - W / 2 - 0.5
            if y < 4 or y >= 12 or u < 1.2 or u >= W / 2 - 4.7:
                return shade(ZINC, 0.85 if y < 3.6 else 0.4)               # the frames
            if abs((x + y * 1.4) % 3 - 1.5) < 0.3 or abs((x - y * 1.4) % 3 - 1.5) < 0.3:
                return shade(ZINC, 0.62)                                   # the diamonds
            return None
        px_paint(ly, 4, 3, W - 4, 13, f)
    layer(cv, leaves, hx('#262430'))
    for y in (1.0, 2.2):                                                   # the barbed wire
        line(cv, 3, y, W - 3, y, shade(ZINC, 0.55))
        for x in range(6, W - 4, 5):
            cv.dot(x + (y > 1.5) * 2, y - 0.5, shade(ZINC, 0.75))
            cv.dot(x + (y > 1.5) * 2, y + 0.5, shade(ZINC, 0.3))
    for x in (2.5, W - 2.5):
        fill_shape(cv, x, 8, 2.4, 2.4, lambda u, v, L: shade(ZINC, 0.2 + L * 0.8))   # the posts
    for k in range(7):                                                     # the chain
        fill_shape(cv, W / 2, 6.0 + k * 0.9, 0.7, 0.45, lambda u, v, L: shade(STEEL_L, 0.4 + L * 0.6))
    fill_shape(cv, W / 2 + 1.0, 12.6, 1.4, 1.2, lambda u, v, L: shade(ramp('#b88a2a', 0.5, 0.25, 0.35), 0.3 + L * 0.7), kind='rect', corner=0.4)
    frect(cv, W / 2 - 4.0, 12.5, W / 2 - 3.0, 15.5, shade(STEEL_L, 0.45))   # the drop rod
    sign_plate(cv, 30, 6.0, 52, 11.5, '#ece8de', rim=SIGN_RED, r=0.5, border=0.5)
    words(cv, 41, 7.0, 'PRIVATE', hx('#c8242c'), 0.5, centre=True)
    smudge(cv, rng, 6, (4, 3, W - 4, 13), (0.6, 1.5), 0.4, hx('#8a4a22'))
    return cv


def p_pallet_stack():
    """A stack of empty pallets left by a loading bay, from above, 1.2 m by 1 m: the top one's deck boards (one new and
    pale, the rest grey, one broken out to the pallet under it), the stringers seen between them, nail heads, the
    heat-treatment stamp; the ones under it stacked askew, their edges showing."""
    W, H = 40, 34
    cv = Cv(W, H)
    rng = random.Random(9721)
    old, new = ramp('#9a8a72', 0.5, 0.26, 0.24), ramp('#c8a46a', 0.5, 0.26, 0.24)

    def under(ly):
        fill_shape(ly, 20.5, 17.5, 18.4, 15.6, lambda u, v, L: shade(old, 0.22 + L * 0.3), kind='rect', corner=0.5, ang=0.05)
    layer(cv, under)

    def deck(ly):
        for k in range(7):
            x0 = 2 + k * 5
            r = new if k == 2 else old
            if k == 5:
                frect(ly, x0, 2, x0 + 4, 10.5, shade(r, 0.5))               # broken off short
                continue
            wood_fill(ly, x0, 2, x0 + 3, H - 3, r[2], plank=4, rng=random.Random(9722 + k), vertical=True)
    layer(cv, deck)
    for y in (4.0, 16.5, H - 5.0):                                         # the stringers between the boards
        for k in range(6):
            x = 6.0 + k * 5
            frect(cv, x, y - 1.5, x + 1.0, y + 1.5, lambda c: shade(old, 0.3) if not c[3] or c == OUTLINE else c)
    for k in range(7):
        for y in (4.0, 16.5, H - 5.0):
            if k != 5 or y < 10:
                stud(cv, 2.5 + k * 5, y - 0.5, hx('#5a5a62'))
                stud(cv, 4.5 + k * 5, y + 0.5, hx('#5a5a62'))
    words(cv, 13.0, 22.0, 'HT', alpha(hx('#2a2420'), 200), 0.5)
    smudge(cv, rng, 5, (2, 2, W - 2, H - 2), (1.5, 3.5), 0.16)
    return cv


def p_oil_drum():
    """A 55-gallon drum from above, left in a yard: its lid in dark blue paint gone to rust round the rolled rim, the
    two bungs, a dent, a black shine of oil where it was spilt filling it."""
    S = 20
    c0 = S / 2
    cv = Cv(S, S)
    rng = random.Random(9731)
    blue = ramp('#2a4a8a', 0.5, 0.26, 0.3)

    def lid(dx, dy, d):
        L = light(dx / 9.0, dy / 9.0)
        if d > 8.4:
            return shade(blue, 0.45 + L * 0.5)                             # the rolled rim
        if d > 7.6:
            return dk(blue[1], 0.3)
        return shade(blue, 0.45 + (dx + dy) * -0.012)
    ring(cv, c0, c0, 0.0, 9.4, lid)
    for (x, y, r) in ((6.5, 7.5, 1.5), (13.0, 12.5, 1.0)):
        fill_shape(cv, x, y, r + 0.5, r + 0.5, lambda u, v, L: shade(blue, 0.2 + L * 0.7))
        fill_shape(cv, x, y, r, r, lambda u, v, L: shade(STEEL_L, 0.3 + L * 0.5))
    smudge(cv, rng, 3, (5, 9, 15, 16), (2.0, 3.5), 0.55, hx('#0c0c14'))   # spilt oil
    cv.dot(9.0, 12.0, hx('#7a8aa8'))
    smudge(cv, rng, 10, (1, 1, S - 1, S - 1), (0.8, 2.2), 0.5, hx('#8a4a22'))
    fill_shape(cv, 14.5, 5.5, 2.0, 1.4, lambda u, v, L: dk(blue[2], 0.35), ang=0.6)   # a dent
    cv.outline()
    return cv


def p_sign_stop():
    """A STOP sign on its post, its face laid back to be read: a red octagon, a white rim, the word."""
    S = 20
    cv = Cv(S, S)
    rng = random.Random(9741)
    c0 = S / 2

    def octa(x, y, cur):
        u, v = abs(x - c0), abs(y - c0)
        d = max(u, v, (u + v) / 1.414)
        if d > 9.0:
            return None
        if d > 8.0:
            return SIGN_WHITE
        return hx('#d8303a') if (x - c0) + (y - c0) < -7 else hx('#c8242c')
    px_paint(cv, 0, 0, S, S, octa)
    words(cv, c0, 8.25, 'STOP', SIGN_WHITE, 0.5, centre=True)
    sign_wear(cv, rng, (2, 2, S - 2, S - 2), 3)
    cv.outline()
    return cv


# ---- the on-ramp and the freeway
def p_guardrail():
    """A 4 m length of steel guardrail from above (laid end to end along x, the road on its +y side): the W-beam
    rail laid back a little so its two ridges show, on its blockouts and two posts, the splice bolts at its end, a
    reflector tab on a post; zinc gone dull, rust blooming, black and bright where cars have rubbed it."""
    W, H = 128, 10
    cv = Cv(W, H)
    rng = random.Random(9751)

    def posts(ly):
        for x in (16.0, 80.0):
            fill_shape(ly, x, 3.0, 2.2, 2.2, lambda u, v, L: shade(ZINC, 0.15 + L * 0.6), kind='rect', corner=0.4, bevel=1.0)
            frect(ly, x - 1.5, 4.0, x + 1.5, 5.5, shade(ramp('#4a3a2a', 0.5, 0.25, 0.3), 0.5))   # the blockout
    layer(cv, posts)
    zinc = VNoise(W, 16, 6, rng)

    def rail(x, y, cur):
        t = y - 5.0
        c = shade(ZINC, (0.95, 0.72, 0.36, 0.78, 0.3, 0.55, 0.22)[min(6, int(t / 0.65))])
        return dk(c, 0.12) if zinc(x, y) > 0.66 else c
    ly = Cv(W, H, cv.s)
    px_paint(ly, 0, 5.0, W, 9.5, rail)
    ly.outline()
    cv.over(ly)
    for x in (16.0, 80.0):
        stud(cv, x - 0.25, 7.0, hx('#5a5e68'))
    for x in (W - 6.0, W - 2.5):
        for y in (6.0, 8.0):
            stud(cv, x, y, hx('#5a5e68'))
    frect(cv, W - 7.5, 5.0, W - 7.0, 9.5, dk(ZINC[1], 0.3))                # the splice's lap
    frect(cv, 79.0, 3.5, 81.0, 4.5, hx('#e8e4da'))                          # the reflector tab
    smudge(cv, rng, 8, (1, 5, W - 1, 9.5), (1.0, 3.0), 0.35, hx('#8a5a32'))
    for _ in range(3):                                                     # where cars rubbed it
        x0 = rng.uniform(4, W - 30)
        px_paint(cv, x0, 7.5, x0 + rng.uniform(10, 24), 9.5, lambda x, y, cur: (mix(cur, hx('#1a1820'), 0.5) if rng.random() < 0.8 else lt(cur, 0.4)) if cur[3] and cur != OUTLINE else None)
    return cv


def p_guardrail_end():
    """The guardrail's end toward the traffic (-x), from above: the energy-absorbing head the rail runs into (a steel
    box with its yellow and black striped face), the rail coming in from +x at the height of the guardrail's own, the
    breakaway wooden post and the steel one, the anchor cable to the first post's foot."""
    W, H = 64, 18
    cv = Cv(W, H)
    rng = random.Random(9761)

    def posts(ly):
        fill_shape(ly, 34, 7.0, 2.4, 2.4, lambda u, v, L: shade(ramp('#6a4a2e', 0.5, 0.25, 0.3), 0.15 + L * 0.7), kind='rect', corner=0.6, bevel=1.0)
        fill_shape(ly, 56, 7.0, 2.2, 2.2, lambda u, v, L: shade(ZINC, 0.15 + L * 0.6), kind='rect', corner=0.4, bevel=1.0)
    layer(cv, posts)
    line(cv, 8, 15.0, 33, 9.5, shade(STEEL_L, 0.5))                       # the anchor cable

    def rail(x, y, cur):
        t = y - 9.0
        return shade(ZINC, (0.95, 0.72, 0.36, 0.78, 0.3, 0.55, 0.22)[min(6, int(t / 0.65))])
    ly = Cv(W, H, cv.s)
    px_paint(ly, 18, 9.0, W, 13.5, rail)
    ly.outline()
    cv.over(ly)

    def head(ly):
        fill_shape(ly, 11, 10.5, 9.5, 6.5, lambda u, v, L: shade(ramp('#4e5362', 0.5, 0.25, 0.4), 0.2 + L * 0.7), kind='rect', corner=1.0, bevel=1.5)
        px_paint(ly, 1.5, 4.5, 6.5, 16.5, lambda x, y, cur: (SIGN_INK if int((x + y) // 2) % 2 else hx('#e8c020')) if cur[3] else None)
    layer(cv, head)
    for (x, y) in ((14, 6.5), (14, 14.5), (19, 6.5), (19, 14.5)):
        stud(cv, x, y, hx('#8a8e98'))
    smudge(cv, rng, 5, (2, 4, W - 2, 15), (1.0, 3.0), 0.3, hx('#8a5a32'))
    smudge(cv, rng, 4, (2, 4, 22, 16), (1.0, 2.5), 0.35)
    return cv


def flip_y(fn):
    """A painter's sprite mirrored top to bottom (a rail's end on the other side of the road: its posts behind it,
    away from the traffic, as the rail beside it laid there turned round)."""
    def make():
        cv = fn()
        cv.img = cv.img.transpose(Image.FLIP_TOP_BOTTOM)
        cv.p = cv.img.load()
        return cv
    return make


def p_guardrail_end_trail():
    """The guardrail's trailing end (the end the traffic leaves: turned round, at +x), from above, as guardrail_end's
    rows: no terminal and no stripes, the W-beam run on past its last post and ended in a rounded buffer end bent
    back toward the posts' side, the steel post under it, the splice bolts; rust, a smear of tyre black."""
    W, H = 64, 18
    cv = Cv(W, H)
    rng = random.Random(9762)

    def posts(ly):
        for x in (22.0, 56.0):
            fill_shape(ly, x, 7.0, 2.2, 2.2, lambda u, v, L: shade(ZINC, 0.15 + L * 0.6), kind='rect', corner=0.4, bevel=1.0)
            frect(ly, x - 1.5, 8.0, x + 1.5, 9.5, shade(ramp('#4a3a2a', 0.5, 0.25, 0.3), 0.5))   # the blockout
    layer(cv, posts)
    zinc = VNoise(W, 16, 6, rng)

    def rail(x, y, cur):
        t = y - 9.0
        c = shade(ZINC, (0.95, 0.72, 0.36, 0.78, 0.3, 0.55, 0.22)[min(6, int(t / 0.65))])
        return dk(c, 0.12) if zinc(x, y) > 0.66 else c

    def beam(ly):
        px_paint(ly, 9.0, 9.0, W, 13.5, rail)
        fill_shape(ly, 7.5, 10.0, 3.0, 3.5, lambda u, v, L: shade(ZINC, 0.25 + L * 0.65), kind='ellipse')   # the buffer end
        fill_shape(ly, 8.5, 10.5, 1.4, 2.0, lambda u, v, L: shade(ZINC, 0.15 + L * 0.3), kind='ellipse')    # its hollow
    layer(cv, beam)
    for x in (22.0, 56.0):
        stud(cv, x - 0.25, 11.0, hx('#5a5e68'))
    for (x, y) in ((13.0, 10.0), (13.0, 12.5), (16.0, 10.0), (16.0, 12.5)):
        stud(cv, x, y, hx('#5a5e68'))
    frect(cv, 18.0, 9.0, 18.5, 13.5, dk(ZINC[1], 0.3))                    # the splice's lap
    smudge(cv, rng, 6, (2, 4, W - 2, 14), (1.0, 3.0), 0.35, hx('#8a5a32'))
    smudge(cv, rng, 3, (26, 12, 44, 13.5), (1.5, 3.0), 0.4, hx('#1a1820'))   # tyre black where one rubbed it
    return cv


def p_crash_cushion(narrow=False):
    """A crash cushion in front of a pier or a rail's end, from above, 3 m: a steel-framed attenuator on its sled:
    yellow energy-absorbing cartridges in four bays between two zinc fender rails, a steel diaphragm between two
    bays, a rounded nose in yellow and black chevrons toward the traffic (-x), the backstop bolted at its foot (+x);
    scuffed, tyre black on its nose. (It was sand barrels: round drums that read as kegs lying in the road: the
    user, 2026-11-20.) `narrow`: before a toll island's nose (1.5 m wide: the 2.75 m one stood half a metre into
    each lane beside it), one cartridge a bay; the wide one three abreast."""
    W, H = (96, 44) if narrow else (96, 88)
    cv = Cv(W, H)
    rng = random.Random(9771)
    yel = ramp('#e8c020', 0.5, 0.26, 0.28)
    stl = ramp('#4e5362', 0.5, 0.25, 0.4)
    y0, y1 = 5.0, H - 5.0
    rows, bays = (1 if narrow else 3), 4
    bw, ch = 70.0 / bays, (y1 - y0 - 7.0) / (1 if narrow else 3)

    def bed(ly):                                                         # the sled the bays slide back on
        fill_shape(ly, 54.0, H / 2, 39.0, (y1 - y0) / 2 - 1.0, lambda u, v, L: shade(stl, 0.12 + L * 0.3), kind='rect', corner=1.0, bevel=1.0)
    layer(cv, bed)
    for i in range(bays):
        for j in range(rows):
            def cell(ly, cx=20.0 + bw * (i + 0.5), cy=y0 + 3.5 + ch * (j + 0.5), k=i * rows + j):
                fill_shape(ly, cx, cy, bw / 2 - 1.4, ch / 2 - 0.9, lambda u, v, L: shade(yel, 0.28 + L * 0.68), kind='rect', corner=1.6, bevel=2.2)
                frect(ly, cx - bw / 2 + 3.5, cy - 0.5, cx + bw / 2 - 3.5, cy + 0.5, shade(yel, 0.2))    # its moulded seam
                frect(ly, cx - 1.5, cy - 3.0, cx + 1.5, cy - 1.5, hx('#2e2c34') if k % 3 else hx('#f4f2ea'))   # its label
            layer(cv, cell)
    for i in range(1, bays):                                             # the diaphragms between two bays
        frect(cv, 20.0 + bw * i - 0.75, y0 + 1.0, 20.0 + bw * i + 0.75, y1 - 1.0, shade(stl, 0.75))

    def rails(ly):
        for y in (y0, y1 - 3.0):
            px_paint(ly, 16.0, y, 92.0, y + 3.0, lambda x, yy, cur, y=y: shade(ZINC, (0.95, 0.6, 0.3)[min(2, int(yy - y))]))
        fill_shape(ly, 93.0, H / 2, 2.0, (y1 - y0) / 2 + 1.0, lambda u, v, L: shade(stl, 0.3 + L * 0.6), kind='rect', corner=0.6, bevel=1.0)   # the backstop
    layer(cv, rails)
    for x in range(22, 92, 9):
        stud(cv, x, y0 + 1.5, hx('#8a8e98'))
        stud(cv, x, y1 - 1.5, hx('#8a8e98'))

    def nose(ly):
        fill_shape(ly, 11.5, H / 2, 8.5, (y1 - y0) / 2, lambda u, v, L: shade(yel, 0.3 + L * 0.65), kind='rect', corner=7.0, bevel=2.0)
        px_paint(ly, 3.0, y0, 20.0, y1, lambda x, y, cur: (SIGN_INK if int((x + abs(y - H / 2)) // 3) % 2 else None) if cur[3] else None)
    layer(cv, nose)
    smudge(cv, rng, 10, (3, 3, W - 3, H - 3), (1.5, 4.0), 0.2, hx('#c8b896'))
    smudge(cv, rng, 6, (3, 6, 24, H - 6), (1.0, 3.0), 0.4)
    return cv


def p_highway_lamp(single=False):
    """A freeway lamp from above (hung high: the pole's top, r 4.5, at the sprite's centre): two arms 2.8 m out along
    x and -x, a sodium cobra head at each end, their refractors glowing (the emissive map; the pools are the
    lighting system's). `single`: the one arm, along -x (turned toward the road: nothing lit on the waste ground
    behind it)."""
    W, H = 208, 20
    cv, gl = Cv(W, H), Cv(W, H)
    cx, cy = W / 2, H / 2
    m = ramp('#5a5e6e', 0.5, 0.25, 0.4)
    sides = (-1,) if single else (-1, 1)

    def arms(ly):
        for s in sides:
            fill_capsule(ly, [(cx + s * 3, cy), (cx + s * 82, cy)], 1.2, lambda k, L, s_, i, t: shade(m, L))
            fill_capsule(ly, [(cx + s * 3, cy + 0.6), (cx + s * 14, cy + 0.2)], 1.6, lambda k, L, s_, i, t: shade(m, L - 0.05))
        fill_shape(ly, cx, cy, 4.5, 4.5, lambda u, v, L: shade(m, L))
    layer(cv, arms)
    fill_shape(cv, cx - 1, cy - 1, 1.8, 1.8, lambda u, v, L: shade(m, 0.55 + L * 0.5))
    hot, warm = hx('#fff0c0'), hx('#ffc070')
    for s in sides:
        hx0 = cx + s * 90.0

        def lum(ly, hx0=hx0, s=s):
            fill_shape(ly, hx0 + s * 0.6, cy, 11.0, 5.6, lambda u, v, L: warm if L < 0.8 else hot, kind='super', p=2.4)
            fill_shape(ly, hx0 - s * 0.6, cy, 10.0, 4.6, lambda u, v, L: shade(ramp('#6a7066', 0.5, 0.25, 0.4), L), kind='super', p=2.4)
            line(ly, hx0 - 6.0, cy - 0.5, hx0 + 6.0, cy - 0.5, ramp('#6a7066', 0.5, 0.25, 0.4)[3])
        layer(cv, lum)
        px_paint(gl, hx0 - 12, 0, hx0 + 12, H, lambda x, y, cur: (255, 236, 176, 255) if cv.get(x, y)[:3] == hot[:3] else (255, 196, 110, 230) if cv.get(x, y)[:3] == warm[:3] else None)
    return cv, gl


def p_sign_freeway():
    """The ramp's FREEWAY ENTRANCE sign, laid back to be read: a green plate, its white rim, the route's shield (red
    crown, blue field, its number) over the two words."""
    W, H = 64, 48
    cv = Cv(W, H)
    rng = random.Random(9781)
    sign_plate(cv, 2, 1, W - 2, H - 1, SIGN_GREEN, r=2.0, border=1.0)
    frect(cv, 3.5, 2.5, W - 3.5, 3.0, SIGN_WHITE)
    c0 = W / 2

    def shield(x, y, cur):
        u, v = x - c0, y - 11.0
        half = 8.0 - (max(0.0, v - 2.0) ** 2) * 0.16
        if v < -7.5 or v > 7.5 or abs(u) > half:
            return None
        if abs(u) > half - 0.75 or v < -6.75:
            return SIGN_WHITE
        if v < -2.5:
            return hx('#c8242c') if not (v < -6.0 and abs(u) < 2.0) else SIGN_WHITE
        return hx('#2a4ea8')
    px_paint(cv, c0 - 9, 3, c0 + 9, 19, shield)
    words(cv, c0, 9.0, '9', SIGN_WHITE, 1.0, centre=True)
    words(cv, c0, 23.0, 'FREEWAY', SIGN_WHITE, 1.0, centre=True)
    words(cv, c0, 34.0, 'ENTRANCE', SIGN_WHITE, 1.0, centre=True)
    sign_wear(cv, rng, (3, 3, W - 3, H - 3), 5)
    cv.outline()
    return cv


def p_sign_wrong_way():
    """WRONG WAY, laid back to be read: a red plate, its white rim, the words in two lines."""
    W, H = 38, 26
    cv = Cv(W, H)
    rng = random.Random(9791)
    sign_plate(cv, 1, 1, W - 1, H - 1, SIGN_RED, r=1.0, border=1.0)
    words(cv, W / 2, 4.0, 'WRONG', SIGN_WHITE, 1.0, centre=True)
    words(cv, W / 2, 15.0, 'WAY', SIGN_WHITE, 1.0, centre=True)
    sign_wear(cv, rng, (2, 2, W - 2, H - 2))
    cv.outline()
    return cv


def p_sign_speed_55():
    """The freeway's SPEED LIMIT 55 (laid back to be read): a white plate, its black rim, the two small words and
    the number large."""
    W, H = 22, 28
    cv = Cv(W, H)
    rng = random.Random(9801)
    sign_plate(cv, 1, 1, W - 1, H - 1, '#ece8de', rim=SIGN_INK, r=1.0, border=0.5)
    words(cv, W / 2, 3.0, 'SPEED', SIGN_INK, 0.5, centre=True)
    words(cv, W / 2, 7.5, 'LIMIT', SIGN_INK, 0.5, centre=True)
    words(cv, W / 2, 13.0, '55', SIGN_INK, 1.5, centre=True)
    sign_wear(cv, rng, (2, 2, W - 2, H - 2), 3)
    cv.outline()
    return cv


def p_sign_toll_ahead():
    """TOLL 1/2 MILE on the ramp (laid back to be read): a green plate, its white rim, TOLL large, the distance under."""
    W, H = 54, 30
    cv = Cv(W, H)
    rng = random.Random(9811)
    sign_plate(cv, 1, 1, W - 1, H - 1, SIGN_GREEN, r=1.5, border=1.0)
    words(cv, W / 2, 4.0, 'TOLL', SIGN_WHITE, 1.5, centre=True)
    words(cv, W / 2, 19.0, '1/2 MILE', SIGN_WHITE, 1.0, centre=True)
    sign_wear(cv, rng, (2, 2, W - 2, H - 2))
    cv.outline()
    return cv


def p_reflector_post():
    """A flexible delineator post by the ramp's edge (laid back): white plastic, its amber reflector near the top,
    scuffed black where it was run over and stood back up."""
    W, H = 6, 12
    cv = Cv(W, H)
    fill_shape(cv, W / 2, H / 2, 1.6, 5.0, lambda u, v, L: shade(ramp('#e8e4da', 0.45, 0.22, 0.2), 0.3 + L * 0.7), kind='rect', corner=1.2, bevel=1.0)
    frect(cv, 2.0, 2.5, 4.0, 5.0, hx('#ee9a1c'))
    cv.dot(2.25, 2.75, hx('#ffe0a0'))
    frect(cv, 1.5, 9.0, 4.5, 10.5, hx('#3a3840'))
    cv.outline()
    return cv


def raised_marker(body, refl):
    """A raised pavement marker (a cat's eye) stuck on the lane line: its moulded body, the reflector facing the
    traffic (-x)."""
    def make():
        W, H = 8, 6
        cv = Cv(W, H)
        fill_shape(cv, W / 2, H / 2, 3.0, 2.0, lambda u, v, L: shade(ramp(body, 0.45, 0.22, 0.2), 0.3 + L * 0.7), kind='rect', corner=1.0, bevel=1.2)
        frect(cv, 1.0, 1.5, 2.0, 4.5, hx(refl))
        cv.dot(1.25, 1.75, lt(hx(refl), 0.5))
        cv.outline(hx('#1a1822'))
        return cv
    return make


def p_rumble_strip():
    """The shoulder's rumble strip, 3 m (laid end to end along x): grooves milled across it every 30 cm, each a
    shallow dish (its near wall in shadow, its far lip catching the light), grit in their bottoms."""
    W, H = 96, 16
    cv = Cv(W, H)
    rng = random.Random(9821)

    def f(x, y, cur):
        c = (x % 10) - 5.0
        d = (c / 3.2) ** 2 + ((y - H / 2) / 6.5) ** 2
        if d > 1.0:
            return None
        if c < -1.6:
            return (14, 12, 20, 120)
        if c > 2.2:
            return (120, 122, 132, 80)
        return (30, 28, 38, 92) if rng.random() > 0.08 else (90, 90, 100, 120)
    px_paint(cv, 0, 0, W, H, f)
    return cv


def plaza_lines(W, H, lines, seed, yellow=()):
    """Worn white lines painted along the given segments ((x0, y0), (x1, y1)), 4 px wide; those whose index is in
    `yellow` in the road's yellow (a left edge)."""
    def seg(x, y, a, b):
        dx, dy = b[0] - a[0], b[1] - a[1]
        t = max(0.0, min(1.0, ((x - a[0]) * dx + (y - a[1]) * dy) / (dx * dx + dy * dy)))
        return math.hypot(x - a[0] - t * dx, y - a[1] - t * dy)

    def make():
        cv = road_mark(W, H, lambda x, y: any(seg(x, y, a, b) < 2.0 for (i, (a, b)) in enumerate(lines) if i not in yellow), seed)
        if yellow:
            cv.over(road_mark(W, H, lambda x, y: any(seg(x, y, *lines[i]) < 2.0 for i in yellow), seed + 1, ROAD_YELLOW))
        return cv
    return make


def p_gore_hatch():
    """Where the ramp leaves (or joins) the lanes: the gore's white triangle, 8 m, its two edge lines and the
    chevrons inside pointing back at the traffic (-x)."""
    W, H = 256, 72

    def mask(x, y):
        t = (x - 4) / (W - 8)
        if t < 0 or t > 1:
            return False
        half, v = 2.0 + t * (H / 2 - 3.0), abs(y - H / 2)
        if v > half:
            return False
        return v > half - 2.6 or (x > 30 and (x - v * 1.2) % 28 < 3.2)
    return road_mark(W, H, mask, 9831)


# ---- the toll plaza
def p_toll_island():
    """A toll island from above, 8 m by 1.5 m (its nose toward the traffic at -x): a raised concrete slab in its kerb,
    the nose rounded and striped yellow and black, three yellow crash posts filled with concrete on it, the kerbs
    along both lanes painted yellow; joints across the slab, oil, gum and the dust of a toll lane."""
    W, H = 256, 48
    cv = Cv(W, H)
    rng = random.Random(9841)
    grit = VNoise(W, H, 4, rng)
    R, cy = 22.0, H / 2

    def f(x, y, cur):
        if x < R + 2:
            dx, dy = x - (R + 2), y - cy
            e = R - math.hypot(dx, dy)
            lit = dx * LX + dy * LY > 0
        else:
            e = min(y - 2, H - 2 - y, W - 2 - x)
            lit = e == y - 2
        if e < 0:
            return None
        if e < 2.4:                                                        # the kerb, painted
            c = ROAD_YELLOW if int((x + y) // 5) % 2 or x > 36 else SIGN_INK
            return lt(c, 0.12) if e < 1.0 and lit else dk(c, 0.3) if e < 1.0 else c
        if x < 36:
            return hx('#e0b828') if int((x + y) // 6) % 2 else hx('#1e1c24')   # the nose
        c = lt(tile_px('concrete', x, y), 0.24)                            # the world's own trowelled concrete, raised
        if x % 48 < 0.5 or abs(y - cy) < 0.25:
            return dk(c, 0.3)                                              # the joints
        return lt(c, 0.05) if grit(x, y) > 0.7 else c
    px_paint(cv, 0, 0, W, H, f)
    for (x, y) in ((12.0, cy), (22.0, cy - 11.0), (22.0, cy + 11.0)):      # the crash posts
        fill_shape(cv, x, y, 3.4, 3.4, lambda u, v, L: shade(ramp('#e8c020', 0.5, 0.26, 0.28), 0.25 + L * 0.75))
        ring(cv, x, y, 1.6, 2.2, lambda dx, dy, d: hx('#8a7016'))
    smudge(cv, rng, 5, (40, 4, W - 4, H - 4), (1.5, 3.0), 0.12)
    for _ in range(14):
        cv.dot(rng.uniform(40, W - 6), rng.uniform(5, H - 5), rng.choice((hx('#5a5860'), hx('#2a2830'), hx('#c8c4ba'))))
    cv.outline()
    return cv


def p_toll_booth_of(duck=False):
    """A toll booth from above, 1985 Florida, cut away as the houses are (no roof: what is in it is seen), 2 m by 1.2 m
    on its plinth, its window toward the lane (+y): pastel teal walls with a pink band and chrome corners, glass all
    round lit warm from inside (the emissive map), the counter with its till, the ticket roll, a coffee, a radio whose
    dial glows, a desk fan, a heater; the attendant on his stool turned to the window in his cap and uniform shirt
    (duck: he has ducked under his counter, his cap low by its end); the exact-change basket on its chrome pedestal
    ahead of it (-x), coins in its throat."""
    def make():
        W, H = 96, 44
        cv, gl = Cv(W, H), Cv(W, H)
        rng = random.Random(9851)
        x0, x1, y0, y1 = 30.0, 92.0, 4.0, 40.0
        teal, pink = ramp(PASTEL_TEAL, 0.45, 0.22, 0.22), ramp(PASTEL_PINK, 0.45, 0.22, 0.22)

        def plinth(ly):
            fill_shape(ly, (x0 + x1) / 2, (y0 + y1) / 2, (x1 - x0) / 2 + 2.5, (y1 - y0) / 2 + 2.5,
                       lambda u, v, L: shade(ramp('#d8c8b8', 0.46, 0.24, 0.2), 0.35 + L * 0.4), kind='rect', corner=1.5, bevel=1.5)
        layer(cv, plinth)

        def walls(x, y, cur):
            e = min(x - x0, x1 - x, y - y0, y1 - y)
            if e < 0:
                return None
            if e < 2.0:                                                       # the wall's top, pastel, its band
                lit_ = (x - x0 < 2.0) or (y - y0 < 2.0)
                c = shade(pink, 0.62 if lit_ else 0.4) if 0.7 <= e < 1.3 else shade(teal, 0.78 if lit_ else 0.5)
                return c
            return shade(ramp('#3a3440', 0.4, 0.2, 0.2), 0.45 + (grain(x, y) - 0.5) * 0.3)   # the rubber floor
        grain = VNoise(W, H, 2, rng)
        px_paint(cv, x0, y0, x1, y1, walls)
        wood = ramp('#9a7452', 0.5, 0.25, 0.3)
        frect(cv, x0 + 8, y1 - 9, x1 - 4, y1 - 3, shade(wood, 0.68))           # the counter under the window
        frect(cv, x0 + 8, y1 - 9, x1 - 4, y1 - 8.5, shade(wood, 0.95))
        fill_shape(cv, 72, y1 - 6, 4.5, 2.2, lambda u, v, L: shade(ramp('#3a3c44', 0.5, 0.25, 0.35), 0.3 + L * 0.6), kind='rect', corner=0.5)   # the till
        frect(cv, 70, y1 - 7.0, 74, y1 - 6.0, hx('#7ae09a'))
        frect(gl, 70, y1 - 7.0, 74, y1 - 6.0, alpha(hx('#9affc0'), 220))
        fill_shape(cv, 52, y1 - 6.5, 1.8, 1.8, lambda u, v, L: hx('#ece8da') if L > 0.4 else hx('#c8c2b0'))   # the ticket roll
        fill_shape(cv, 83, y1 - 6.0, 1.4, 1.4, lambda u, v, L: hx('#f6f0e2'))  # the coffee
        cv.dot(83, y1 - 6.0, hx('#4a2a14'))
        fill_shape(cv, 40, 10, 4.0, 3.0, lambda u, v, L: shade(ramp('#8a2a22', 0.5, 0.25, 0.3), 0.3 + L * 0.6), kind='rect', corner=0.8)   # the heater
        for y in (9.0, 10.0, 11.0):
            frect(cv, 37, y, 43, y + 0.4, hx('#ff8a3a'))
            frect(gl, 37, y, 43, y + 0.4, alpha(hx('#ffa050'), 200))
        # the radio on its shelf, its dial lit amber
        fill_shape(cv, 84, 9, 4.0, 2.2, lambda u, v, L: shade(ramp('#c8b8a0', 0.5, 0.25, 0.3), 0.3 + L * 0.6), kind='rect', corner=0.8)
        frect(cv, 81.5, 8.0, 85.5, 9.5, hx('#ffb040'))
        frect(gl, 81.5, 8.0, 85.5, 9.5, alpha(hx('#ffc060'), 230))
        cv.dot(87, 9, hx('#2a2a30'))
        line(cv, 87, 7, 90, 5, hx('#c8c8d0'))                                   # its aerial
        # the desk fan in the corner, its blades a blur of grey
        ring(cv, 88, 34, 0, 3.0, lambda dx, dy, d: hx('#8a8e98') if d > 2.3 else hx('#b8bcc4') if int(math.atan2(dy, dx) * 2) % 2 else hx('#6a6e78'))
        fill_shape(cv, 60, 20, 3.5, 3.5, lambda u, v, L: shade(ramp('#2a2a30', 0.45, 0.22, 0.35), 0.3 + L * 0.6))   # the stool
        shirt, cap = ramp('#6a9ad0', 0.5, 0.26, 0.3), ramp('#1e2a44', 0.45, 0.22, 0.3)

        def man(ly):
            if duck:
                # down under the counter's end, hunched, his cap low: only his back and cap over its edge
                fill_shape(ly, 46, 32.0, 6.0, 4.0, lambda u, v, L: shade(shirt, 0.1 + L * 0.55), kind='super', p=2.4)
                fill_shape(ly, 42.5, 32.5, 2.6, 2.6, lambda u, v, L: shade(cap, 0.2 + L * 0.6))
                fill_capsule(ly, [(48, 29.5), (50.5, 27.0)], 1.2, lambda k, L, s, i, t: shade(shirt, L * 0.8))   # an arm over his head
                return
            fill_shape(ly, 60, 24.0, 7.0, 4.2, lambda u, v, L: shade(shirt, 0.2 + L * 0.75), kind='super', p=2.4)   # his shoulders
            fill_capsule(ly, [(65, 26.0), (68, 30.5)], 1.3, lambda k, L, s, i, t: shade(shirt, L))                  # his arm to the window
            fill_shape(ly, 68.5, 31.0, 1.2, 1.2, lambda u, v, L: shade(ramp('#c88a62', 0.5, 0.25, 0.25), 0.3 + L * 0.7))
            fill_shape(ly, 60, 24.5, 2.8, 2.8, lambda u, v, L: shade(cap, 0.3 + L * 0.7))                          # his cap
            fill_shape(ly, 60, 27.6, 2.2, 1.0, lambda u, v, L: hx('#141a2a'))                                      # its peak
            cv.dot(60, 24.0, hx('#d8b030'))                                                                        # its badge
        layer(cv, man)
        glass = hx('#9fd8ec')
        for (a, b, c, d) in ((x0 + 6, y1 - 1.5, x1 - 2, y1), (x0 + 16, y0, x1 - 2, y0 + 1.5), (x0, y0 + 4, x0 + 1.5, y1 - 4), (x1 - 1.5, y0 + 4, x1, y1 - 4)):
            frect(cv, a, b, c, d, mix(glass, hx('#ffe2a8'), 0.4))
            frect(gl, a, b, c, d, alpha(hx('#ffe6b0'), 235))
        frect(cv, x0 + 1.5, y0, x0 + 15, y0 + 1.5, shade(teal, 0.4))           # its sliding door
        for (a, b) in ((x0, y0), (x1 - 2, y0), (x0, y1 - 2), (x1 - 2, y1 - 2)):
            frect(cv, a, b, a + 2, b + 2, CHROME[2])                           # the chrome corners
            cv.dot(a + 0.25, b + 0.25, CHROME[3])
        frect(cv, x0 + 3, y1, x1 - 1, y1 + 1.0, CHROME[2])                     # the chrome sill
        frect(cv, x0 + 3, y1 + 0.5, x1 - 1, y1 + 1.0, CHROME[1])
        px_paint(gl, x0 + 2, y0 + 2, x1 - 2, y1 - 2, lambda x, y, cur: cur if cur[3] else alpha(hx('#ffd890'), max(0, 70 - int(math.hypot(x - 62, y - 22) * 2.2) // 14 * 14)) if math.hypot(x - 62, y - 22) < 30 else None)

        def basket(ly):
            fill_shape(ly, 14, 30, 6.0, 6.0, lambda u, v, L: shade(CHROME, 0.35 + L * 0.6), kind='rect', corner=1.5, bevel=1.5)
            ring(ly, 14, 30, 0.0, 4.6, lambda dx, dy, d: shade(CHROME, 0.4 + light(dx / 5, dy / 5) * 0.6) if d > 3.6 else hx('#1a1a22') if (dx + dy) % 1.5 < 0.5 else hx('#2e2e38'))
        layer(cv, basket)
        for (dx, dy) in ((-1.0, 0.5), (1.0, -0.5), (0.0, 1.5), (-1.5, -1.0)):
            cv.dot(14 + dx, 30 + dy, hx('#e8e8f2'))                             # coins in its throat
        cv.dot(11.0, 26.5, hx('#ffffff'))                                       # the chrome's glint
        frect(gl, 10.5, 26.0, 11.5, 27.0, alpha(hx('#ffffff'), 140))
        smudge(cv, rng, 4, (2, 2, W - 2, H - 2), (1.0, 2.5), 0.15)
        return cv, gl
    return make


TOLL_LANES = (104, 248, 392, 536)   # the lanes' middles under the canopy, px from its top edge (the islands between)
TOLL_ISLES = (32, 176, 320, 464, 608)


def p_toll_canopy():
    """The toll plaza's roof from above, a 1985 Florida toll (hung high over the lanes: it fades over him as he drives
    under, as the railway bridge does), 6 m along the road by 20 m across it (along y): four lanes of 3 m under it
    between five islands of 1.5 m (TOLL_LANES, TOLL_ISLES). Art deco in pastel: the fascia the traffic comes in under
    (-x) pink with three teal speed lines and a stepped teal fin over each island, the one it leaves under (+x) teal
    and pink the other way, chrome caps, a neon tube along each (pink in, teal out); the sheet roof pale between them,
    gutters, two air units, a hatch, a puddle; the deco sign on its middle (neon TOLL in pink, SUNSET BAY in teal),
    each lane's number in a porthole of teal neon on the fascia in, the lamps along both. The emissive map holds the
    neon, the numbers and the lamps (they buzz: data/props.js `flicker`)."""
    W, H, F = 192, 640, 18
    cv, gl = Cv(W, H), Cv(W, H)
    rng = random.Random(9861)
    deck = ramp('#7a808c', 0.42, 0.2, 0.18)        # galvanised sheet, weathered (it sits under the plaza's floods)
    streak, rust = VNoise(W, H, 8, rng), VNoise(W, H, 5, rng)
    pink, teal = ramp(PASTEL_PINK, 0.42, 0.2, 0.22), ramp(PASTEL_TEAL, 0.42, 0.2, 0.22)

    def fin(u, y):
        """the stepped fin over the nearest island: its half width at u px in from the outer edge"""
        iy = min(TOLL_ISLES, key=lambda q: abs(q - y))
        return abs(y - iy) < 15 - 4 * int((u - 2) // 4)

    def roof(x, y, cur):
        if x < F or x >= W - F:                                            # the fascias
            u = x if x < F else W - x
            band, other = (pink, teal) if x < F else (teal, pink)
            if u < 1.0:
                return CHROME[3]
            if u < 2.0:
                return CHROME[1]
            if u >= F - 1.5:
                return shade(band, 0.22)                                   # its return under the roof's edge
            if fin(u, y) and u < F - 3:
                return shade(other, 0.72 if u < 6 else 0.6)
            if 1 <= u % 4 < 2 and 4 <= u < F - 3:
                return shade(other, 0.55)                                  # the speed lines
            return shade(band, 0.74 if u < 6 else 0.62)
        if y < 3 or y >= H - 3:                                            # the gutters
            return shade(ZINC, 0.75 if (y < 1 or y >= H - 3 and y < H - 2) else 0.35)
        t = y % 8
        c = shade(deck, 0.82 if t < 0.5 else 0.34 if t < 1.0 else 0.58)    # the seams
        if streak(x * 0.4, y * 2.0) > 0.7:
            c = dk(c, 0.07)
        if rust(x, y) > 0.88 and t >= 1.0:
            c = mix(c, hx('#7a5a46'), 0.18)
        return shift(c, rng.randint(-2, 2))
    px_paint(cv, 0, 0, W, H, roof)
    # a puddle on the roof, the pink of the sign in it
    px_paint(cv, 40, 140, 70, 160, lambda x, y, cur: (mix(cur, hx('#2a2438'), 0.4) if abs(y - 149) > 1.2 or not 46 < x < 62 else mix(cur, DECO_PINK, 0.25)) if math.hypot((x - 55) / 15, (y - 150) / 10) + (streak(x, y) - 0.5) * 0.4 < 1 else None)
    for (ax, ay) in ((60.0, 200.0), (128.0, 470.0)):
        def unit(ly, ax=ax, ay=ay):
            fill_shape(ly, ax, ay, 16, 11, lambda u, v, L: shade(ramp('#9a9ea8', 0.45, 0.22, 0.3), 0.25 + L * 0.65), kind='rect', corner=1.5, bevel=1.5)
            ring(ly, ax - 6, ay, 0.0, 6.0, lambda dx, dy, d: hx('#1a1a22') if int(d * 2) % 2 else shade(ramp('#9a9ea8', 0.45, 0.22, 0.3), 0.4))
            frect(ly, ax + 3, ay - 8, ax + 14, ay + 8, shade(ramp('#9a9ea8', 0.45, 0.22, 0.3), 0.45))
        layer(cv, unit)
        line(cv, ax, ay + 11, ax, 296 if ay < 320 else 344, hx('#2a2c34'))   # conduit to the sign
    layer(cv, lambda ly: fill_shape(ly, 150, 110, 8, 8, lambda u, v, L: shade(ramp('#7a7e88', 0.45, 0.22, 0.3), 0.25 + L * 0.65), kind='rect', corner=1.0, bevel=1.5))
    smudge(cv, rng, 30, (F + 2, 4, W - F - 2, H - 4), (3.0, 9.0), 0.12)
    for _ in range(8):                                                     # gulls' droppings
        cv.dot(rng.uniform(F + 2, W - F - 2), rng.uniform(4, H - 4), hx('#d8d4cc'))

    # the deco sign: a stepped pink plate, its teal crest, a dark face with the neon on it
    def sign(ly):
        cx, cy = W / 2, H / 2
        for (rx, ry, col, L0) in ((60, 30, pink, 0.5), (54, 36, teal, 0.55), (46, 40, pink, 0.6)):
            fill_shape(ly, cx, cy, rx, ry, lambda u, v, L, col=col, L0=L0: shade(col, L0 * 0.6 + L * 0.5), kind='rect', corner=1.0, bevel=1.5)
        frect(ly, cx - 52, cy - 24, cx + 52, cy + 24, hx('#1e1828'))
        frect(ly, cx - 52, cy - 24, cx + 52, cy - 23, CHROME[2])
    layer(cv, sign)
    neon_words(cv, gl, W / 2, H / 2 - 18, 'TOLL', DECO_PINK, 4.0)
    neon_words(cv, gl, W / 2, H / 2 + 14, 'SUNSET BAY', DECO_TEAL, 1.5)
    neon_halo(gl, (W / 2 - 54, H / 2 - 30, W / 2 + 54, H / 2 + 30), DECO_PINK, 3.0, 90)
    # the lanes' numbers, each in its porthole of teal neon on the fascia in
    for n, y in enumerate(TOLL_LANES):
        ring(cv, 9, y, 0, 7.5, lambda dx, dy, d: CHROME[2] if d > 6.5 else hx('#16121e'))
        ring(cv, 9, y, 5.6, 6.4, lambda dx, dy, d: DECO_TEAL)
        ring(gl, 9, y, 5.6, 6.4, lambda dx, dy, d: lt(DECO_TEAL, 0.3))
        neon_words(cv, gl, 9, y - 5.25, str(n + 1), DECO_TEAL, 1.5)
        neon_halo(gl, (0, y - 10, F, y + 10), DECO_TEAL, 2.0, 80)
    # the neon tubes along the fascias' inner edges, in lengths between the fins
    for (x, col) in ((F - 2.6, DECO_PINK), (W - F + 1.6, DECO_TEAL)):
        for y in range(4, H - 4):
            if any(abs(y - q) < 17 for q in TOLL_ISLES):
                continue
            frect(cv, x, y, x + 1.0, y + 1, lt(col, 0.15))
            frect(gl, x, y, x + 1.0, y + 1, lt(col, 0.4))
        neon_halo(gl, (x - 4, 0, x + 5, H), col, 2.0, 70)
    for y in range(32, H - 8, 72):                                         # the lamps along both fascias
        for x in ((F + 2.0, W - F - 4.0) if (y - 32) % 144 == 0 else (W - F - 4.0,)):
            frect(cv, x, y - 2, x + 2, y + 2, hx('#fff4d8'))
            frect(gl, x, y - 2, x + 2, y + 2, hx('#fff8e8'))
            ring(gl, x + 1, y, 2.0, 4.5, lambda dx, dy, d: alpha(hx('#ffe8c0'), 110 if d < 3.2 else 46))
    cv.outline()
    return cv, gl


def gate_arm(x0=None, x1=None, seed=0):
    """The toll lane's wooden gate arm from above, 3.5 m: its operator's yellow cabinet on the island (-x), the arm
    reaching out over the lane in red and white bands, two red reflectors, the rubber tip. x0 / x1: a broken piece of
    it, the arm from x0 to x1 only, its ends splintered."""
    def make():
        whole = x0 is None
        W, H = (112, 12) if whole else (int(x1 - x0) + 4, 6)
        cv = Cv(W, H)
        rng = random.Random(9871 + seed)
        dx = 0 if whole else x0 - 2
        cy = 6.0 if whole else 3.0
        red, white = ramp('#d0242c', 0.5, 0.26, 0.3), ramp('#ece8de', 0.4, 0.2, 0.2)
        a, b = (16.0, 110.0) if whole else (x0, x1)
        jag = [rng.uniform(-2.5, 2.5) for _ in range(24)]

        def arm(x, y, cur):
            X = x + dx
            t = y - cy
            if abs(t) >= 1.8:
                return None
            if not whole:
                k = int((t + 1.8) * 3)
                if X < a + jag[k] + 2.5 or X >= b - jag[12 + k] - 2.5:
                    return None
            if X >= 108.0:
                return shade(RUBBER, 0.6 if t < 0 else 0.3)                # the tip
            r = red if int(X // 12) % 2 == 0 else white
            return shade(r, 0.86 if t < -1.0 else 0.32 if t > 1.0 else 0.62)
        px_paint(cv, 0, 0, W, H, arm)
        for X in (44.0, 92.0):
            if whole or a < X < b:
                frect(cv, X - dx - 1.0, cy - 0.75, X - dx + 1.0, cy + 0.75, hx('#ff2a3a'))
        if whole:
            def cab(ly):
                fill_shape(ly, 9, cy, 8.0, 5.0, lambda u, v, L: shade(ramp('#e0b020', 0.5, 0.26, 0.28), 0.2 + L * 0.75), kind='rect', corner=1.0, bevel=1.5)
                fill_shape(ly, 14, cy, 2.4, 2.4, lambda u, v, L: shade(STEEL_L, 0.3 + L * 0.7))   # the pivot hub
            layer(cv, cab)
        smudge(cv, rng, 4, (2, 2, W - 2, H - 2), (0.6, 1.5), 0.4, hx('#8a6a4a'))
        cv.outline()
        return cv
    return make


def gate_steel(bent=False):
    """The toll lane shut for good, from above, 3.5 m: a hydraulic steel boom (box section, red and white reflective
    bands along its face) out of its armoured housing (hazard stripes), resting in its catch post across the lane, a
    white plate with a red X bolted to its middle. bent: after THE CRASH (systems/Toll.js): folded back where the car
    struck it, its tip torn out of the catch post, the bands scraped to the steel, the plate hanging askew."""
    def make():
        W, H = 112, 20
        cv = Cv(W, H)
        rng = random.Random(9881)
        st = ramp('#5a606c', 0.5, 0.25, 0.35)

        def dy(x):
            return -6.0 * max(0.0, 1 - abs(x - 62) / 44) if bent else 0.0

        def post(ly):
            fill_shape(ly, W - 4, H / 2, 3.0, 4.5, lambda u, v, L: shade(st, 0.2 + L * 0.7), kind='rect', corner=0.6, bevel=1.2)
        layer(cv, post)

        def boom(x, y, cur):
            t = y - H / 2 - dy(x)
            if abs(t) >= 3.0 or (bent and x > W - 12):
                return None
            c = shade(st, 0.86 if t < -2.0 else 0.28 if t > 2.0 else 0.58)
            if -1.0 <= t < 1.5 and int(x // 10) % 2:
                c = hx('#c8242c') if int(x // 20) % 2 else hx('#e8e4da')   # the reflective bands
            if bent and abs(x - 62) < 14 and grit(x, y) > 0.45:
                c = shade(STEEL_L, 0.7 if t < 0 else 0.4)                   # scraped to the steel where it struck
            return c
        grit = VNoise(W, H, 2, rng)
        ly = Cv(W, H, cv.s)
        px_paint(ly, 18, 0, W - 5, H, boom)
        ly.outline()
        cv.over(ly)

        def housing(ly):
            fill_shape(ly, 10, H / 2, 9.0, 8.5, lambda u, v, L: shade(ramp('#3a3e48', 0.5, 0.25, 0.35), 0.2 + L * 0.7), kind='rect', corner=1.2, bevel=2.0)
            px_paint(ly, 2.5, 2.5, 17.5, 4.5, lambda x, y, cur: hx('#e8c020') if int((x + y) // 2) % 2 else SIGN_INK)
        layer(cv, housing)
        px, py = W / 2 + (5 if bent else 0), H / 2 + dy(W / 2 + 5)

        def plate(ly):
            if bent:
                fill_shape(ly, px, py, 7.0, 6.0, lambda u, v, L: shade(ramp('#ece8de', 0.4, 0.2, 0.14), 0.3 + L * 0.6), ang=0.5, kind='rect', corner=0.8)
                return
            sign_plate(ly, W / 2 - 8, 2, W / 2 + 8, H - 2, '#ece8de', rim=SIGN_INK, r=0.8, border=0.5)

        layer(cv, plate)

        def x_(x, y, cur):
            u, v = x - px, y - py
            if bent:
                u, v = u * math.cos(0.5) + v * math.sin(0.5), -u * math.sin(0.5) + v * math.cos(0.5)
            return hx('#c8242c') if abs(u) < 4.8 and abs(v) < 4.8 and (abs(u - v) < 1.4 or abs(u + v) < 1.4) else None
        px_paint(cv, px - 8, max(0, py - 8), px + 8, min(H, py + 8), x_)
        if not bent:
            for (x, y) in ((W / 2 - 6.5, 3.5), (W / 2 + 6.0, 3.5), (W / 2 - 6.5, H - 4.0), (W / 2 + 6.0, H - 4.0)):
                stud(cv, x, y, hx('#8a8e98'))
        else:
            for _ in range(10):                                            # its paint flakes, a gouge
                cv.dot(rng.uniform(46, 80), H / 2 + rng.uniform(-3, 3) + dy(62), hx('#e8e4da') if rng.random() < 0.5 else hx('#c8242c'))
            line(cv, 52, H / 2 - 4.5, 72, H / 2 - 5.5, hx('#16141c'))
        smudge(cv, rng, 6, (18, 7, W - 6, 13), (0.8, 2.0), 0.4, hx('#8a5a32'))
        smudge(cv, rng, 4, (2, 2, W - 2, H - 2), (1.5, 3.5), 0.15)
        return cv
    return make


def lane_signal(go):
    """A lane signal over a toll lane (laid back to be read): a black box with its visor, an LED matrix face, lit
    either as a green arrow on along the road (+x: the lane is open, as the chase's tells draw it, render/LaneSign.js)
    or a red X (shut); the emissive map holds the lit LEDs."""
    def make():
        S = 20
        cv, gl = Cv(S, S), Cv(S, S)
        col = hx('#2af08a') if go else hx('#ff2c2c')
        c0 = S / 2
        fill_shape(cv, c0, c0, 9.0, 9.0, lambda u, v, L: shade(ramp('#26262e', 0.45, 0.22, 0.35), 0.25 + L * 0.7), kind='rect', corner=2.0, bevel=1.5)
        frect(cv, 2.0, 1.0, S - 2.0, 2.5, hx('#0c0c10'))                    # the visor's shadow
        frect(cv, 2.5, 3.0, S - 2.5, S - 2.5, hx('#0c0c12'))

        def sym(u, v):
            if go:
                return (abs(v) < 1.3 and -6.0 <= u < 1.0) or (0.0 <= u < 6.0 and abs(v) < (6.0 - u) * 0.95)
            return abs(u) < 5.6 and abs(v) < 5.6 and (abs(u - v) < 1.5 or abs(u + v) < 1.5)

        def face(x, y, cur):
            led = (x * 2) % 2 < 1 and (y * 2) % 2 < 1
            if not led:
                return None
            return dk(col, 0.25) if sym(x - c0, y - c0 - 0.25) else hx('#22222a')
        px_paint(cv, 3, 3.5, S - 3, S - 3, face)
        px_paint(gl, 2, 2, S - 2, S - 2, lambda x, y, cur: (lt(col, 0.45) if (x * 2) % 2 < 1 and (y * 2) % 2 < 1 else alpha(col, 120)) if sym(x - c0, y - c0 - 0.25) else None)
        cv.outline()
        return cv, gl
    return make


def p_sign_exact_change():
    """EXACT CHANGE over the island's first lane (laid back to be read): a yellow plate, its black rim, two lines."""
    W, H = 40, 24
    cv = Cv(W, H)
    rng = random.Random(9891)
    sign_plate(cv, 1, 1, W - 1, H - 1, SIGN_YELLOW, rim=SIGN_INK, r=1.0, border=0.75)
    words(cv, W / 2, 3.5, 'EXACT', SIGN_INK, 1.0, centre=True)
    words(cv, W / 2, 13.5, 'CHANGE', SIGN_INK, 1.0, centre=True)
    sign_wear(cv, rng, (2, 2, W - 2, H - 2))
    cv.outline()
    return cv


_FAN = [((0, 224 + k * 96), (320, 224 + k * 144)) for k in (-1, 0, 1)]   # the plaza's lane lines fanning out: 3 m lanes to 4.5 m
_TAPER = [((0, 168 + k * 80), (384, 168 + k * 160)) for k in (-1, 1)]    # 2 lanes of 2.5 m to 4: the edges, 12 m
# the four lanes' lines spreading over 13.25 m from 2.5 m apart to the islands' 4.5 m, each ending on the nose of the
# island's crash cushion (on its middle), the edges out to the outer two: turned round, the same from the planters past
# the gates
TOLL_FAN_L = 424
_TOLL_FAN = [((0, 296 + k * a), (TOLL_FAN_L, 296 + k * b)) for (a, b) in ((80, 144), (160, 288)) for k in (-1, 1)] + [((0, 296), (TOLL_FAN_L, 296))]
DETOUR_ARROW = [(2, 11), (48, 11), (60, 15), (66, 26), (66, 46)]
MERGE_ARROW = [(2, 31), (34, 31), (52, 27), (66, 19), (82, 11)]


# ---------------------------------------------------------------- level 2A, part two: the freeway over the side street
# Made to measure for tools/build_level2a.py: the freeway runs along the frontage road the detour comes out on and
# crosses the side street on a short bridge (the deck, hung high: it fades over him as he goes under; the shadow it
# lays on the street under it), and where the ramp joins it the freeway's lanes come in over 24 m to lie alongside
# ours (the gore between them, a long right triangle). The freeway's cross-section is the builder's: from the deck's
# north edge (row 33.5), its parapet, a shoulder, the yellow edge line on row 35.5, two lanes of 2.5 m (the dashes on
# row 38), the white edge line on row 40.5, a narrow shoulder and the south parapet to row 41.5.
FWY_DASH = (224, 320)        # the deck's one lane dash (px along it): the freeway's dashes lie every 12 m from col 432


def p_overpass():
    """The freeway's bridge over the side street, from above, 18 m along it and 8 m across (hung high: it fades over
    him as he drives under): two concrete parapets with their coping and a steel rail along the top, the deck's
    asphalt gone grey and polished in the wheel paths, oil down the middle of each lane, the yellow edge line, the
    lane's dash and the white edge line where the ground's paint carries on, a finger joint across each end and a
    slab joint in the middle sealed in black, scuppers along the parapets with a rust stain under each, patches."""
    W, H = 576, 256
    cv = Cv(W, H)
    rng = random.Random(9951)
    grit, slow = VNoise(W, H, 3, rng), VNoise(W, H, 22, rng)
    deck = hx('#4e5059')

    def surface(x, y, cur):
        c = shift(deck, int((grit(x, y) - 0.5) * 12 + (slow(x, y) - 0.5) * 16))
        for lane in (104.0, 184.0):                                       # the wheel paths polished, oil between
            d = abs(y - lane)
            if 18 < d < 30:
                c = shift(c, 5)
            elif d < 4 and slow(x * 0.7, y) > 0.55:
                c = mix(c, hx('#2e2c34'), 0.25)
        return c
    px_paint(cv, 0, 16, W, H - 16, surface)
    for (y0, y1, col) in ((62, 66, ROAD_YELLOW), (222, 226, ROAD_WHITE)):  # the edge lines
        px_paint(cv, 0, y0, W, y1, lambda x, y, cur, col=col: mix(cur, col, 0.85) if grit(x, y * 4) < 0.8 else None)
    px_paint(cv, FWY_DASH[0], 142, FWY_DASH[1], 146, lambda x, y, cur: mix(cur, ROAD_WHITE, 0.8) if grit(x, y) < 0.74 else None)

    def parapet(y0, y1, inner):
        """A parapet wall from y0 to y1, its face toward the deck at `inner` (the coping lit on its north side)."""
        def f(x, y, cur):
            t = (y - y0) / (y1 - y0)
            u = t if inner == y1 else 1 - t                               # 0: the outer edge, 1: the deck's side
            L = 0.86 if u < 0.25 else 0.66 if u < 0.7 else 0.3
            c = shade(CONCRETE, L)
            if (x + 7) % 96 < 1.0:
                c = dk(c, 0.35)                                            # its joints
            return shift(c, int((grit(x, y) - 0.5) * 16))
        px_paint(cv, 0, y0, W, y1, f)
        r = y0 + (y1 - y0) * 0.38
        frect(cv, 0, r - 0.75, W, r + 0.75, shade(STEEL_L, 0.42))          # the rail along its top
        frect(cv, 0, r - 0.75, W, r - 0.25, shade(STEEL_L, 0.82))
        for x in range(10, W, 64):
            frect(cv, x - 1.0, r - 1.5, x + 1.0, r + 1.5, shade(STEEL_L, 0.3))   # its posts
    parapet(0, 16, 16)
    parapet(H - 16, H, H - 16)
    for x in range(40, W, 96):                                             # scuppers, a rust stain under each
        for (y, d) in ((16.5, 1), (H - 17.5, -1)):
            frect(cv, x - 2.5, y, x + 2.5, y + 1.5, hx('#16141c'))
            for k in range(7):
                cv.dot(x - 1.0 + rng.uniform(-0.6, 0.6), y + d * (2.0 + k * 0.8), alpha(hx('#7a4a26'), 150 - k * 18))

    def joint(x0):
        """A finger joint across the deck: the steel plates, their teeth, the black gap between."""
        frect(cv, x0, 16, x0 + 5, H - 16, shade(STEEL_L, 0.36))
        for y in range(16, H - 16, 3):
            frect(cv, x0 + 1.5, y, x0 + 3.5, y + 1.5, shade(STEEL_L, 0.62))
        frect(cv, x0 + 2.25, 16, x0 + 2.75, H - 16, hx('#0e0c12'))
    joint(1)
    joint(W - 6)
    frect(cv, W / 2 - 0.75, 16, W / 2 + 0.75, H - 16, hx('#22212a'))         # the slab joint, sealed
    for (x, y, w, h) in ((96, 150, 42, 26), (402, 82, 30, 18), (300, 196, 56, 14)):   # patches of a newer black
        frect(cv, x, y, x + w, y + h, lambda cur: mix(cur, hx('#2c2c34'), 0.7))
        frect(cv, x, y, x + w, y + 0.75, hx('#1c1a22'))
    smudge(cv, rng, 40, (8, 18, W - 8, H - 18), (2, 6), 0.16)
    smudge(cv, rng, 14, (8, 18, W - 8, H - 18), (1, 3), 0.3, hx('#8a8e98'))
    cv.outline()
    return cv


def p_overpass_shadow():
    """The shadow the freeway's bridge lays on the street under it: dark, its edges a little softer."""
    W, H = 576, 256

    def f(x, y, cur):
        e = min(x, y, W - x, H - y)
        return GUTTER + (int(132 * min(1.0, 0.45 + e / 16)),)
    cv = Cv(W, H)
    px_paint(cv, 0, 0, W, H, f)
    return cv


def p_gore_taper():
    """Where the freeway's lanes come in alongside the ramp: the gore between them painted out, 24 m long and 2.5 m
    wide where it starts (-x), a long right triangle: its foot along the ramp's edge (+y), its other side the freeway's
    edge line slanting down to meet it at its point (+x), white bars across it slanting back at the traffic."""
    W, H = 768, 84
    top0, foot = 2.0, H - 2.0

    def mask(x, y):
        if not 2 <= x < W - 1:
            return False
        top = top0 + (foot - top0) * x / W
        if y < top - 2.0 or y > foot + 2.0:
            return False
        if y < top + 2.0 or y > foot - 2.0:
            return True                                                    # its two edge lines
        return (x + (y - top0) * 1.6) % 64 < 5.0                           # the bars
    return road_mark(W, H, mask, 9961)


# ---------------------------------------------------------------- level 2A: the channelizers (a gore, a lane drop)
# The flexible delineator posts of an American junction ("channelizers"), a line of them along a gore's edge: an
# orange tube 0.9 m tall and 0.1 m across glued to the asphalt on a black rubber base, two white reflective bands
# round its top. Seen from above: the base, the tube's cap and the bands round it (they catch the light: a faint
# emissive map). A car runs them down (data/destruction.js): the tube snaps off its base and flies, lying
# (channelizer_tube, its snapped end ragged), the base left with its stub (channelizer_base).
CHANNEL_ORANGE = ramp('#ff6a1a', 0.5, 0.26, 0.28)
CHANNEL_BAND = ramp('#f4f2ea', 0.42, 0.2, 0.12)


def channel_base(cv, c, rng):
    """The rubber base from above (0.3 m round): its bevelled rim, the moulded ring round the tube's socket, rubber
    left on it by the tyres that ran it over."""
    fill_shape(cv, c, c, 4.7, 4.7, lambda u, v, L: shade(RUBBER, 0.25 + L * 0.55), bevel=1.4)
    ring(cv, c, c, 3.3, 3.8, lambda dx, dy, d: shade(RUBBER, 0.15 + light(-dx / 3.8, -dy / 3.8) * 0.4))
    smudge(cv, rng, 3, (c - 4, c - 4, c + 4, c + 4), (0.8, 1.6), 0.25)


def p_channelizer():
    """A channelizer post from above, 12 x 12 world px: the base, the orange tube's cap in its middle, the two white
    reflective bands showing round it as a collar (the tube flexes: its top is never quite over its foot), lit from
    the top left; the emissive map holds the bands' faint glint (they send the lamps' light back)."""
    S = 12
    c = S / 2
    cv, gl = Cv(S, S), Cv(S, S)
    channel_base(cv, c, random.Random(10801))
    # (the tube's shadow down and to the right of it, on the base)
    fill_shape(cv, c + 0.9, c + 0.9, 2.4, 2.4, lambda u, v, L: shade(RUBBER, 0.02))

    def band(dx, dy, d):
        L = light(dx / 3.2, dy / 3.2) * 0.6 + 0.4
        return shade(CHANNEL_BAND, L) if 1.9 <= d < 2.75 else shade(CHANNEL_ORANGE, 0.2 + L * 0.5)   # (orange round it)
    ring(cv, c - 0.25, c - 0.25, 0.0, 3.25, band)
    fill_shape(cv, c - 0.25, c - 0.25, 1.9, 1.9, lambda u, v, L: shade(CHANNEL_ORANGE, 0.3 + L * 0.7))    # the cap
    cv.dot(c - 0.25, c - 0.25, dk(CHANNEL_ORANGE[1], 0.3))                                               # its dimple
    cv.dot(c - 1.9, c - 1.9, lt(CHANNEL_BAND[3], 0.6))                                                  # the glint
    cv.dot(c - 1.4, c - 2.4, lt(CHANNEL_BAND[3], 0.4))
    cv.outline()
    ring(gl, c - 0.25, c - 0.25, 1.9, 2.75, lambda dx, dy, d: alpha(hx('#fff6e0'), 150 if dx + dy < 0 else 100))
    return cv, gl


def p_channelizer_tube():
    """A channelizer's tube snapped off its base, lying (it flies): 0.9 m of orange plastic, its cap and the two white
    bands at one end, a scuff of tyre rubber across it, the other end torn ragged."""
    W, H = 28, 6
    cv = Cv(W, H)
    rng = random.Random(10802)
    snap = [rng.uniform(0.0, 1.6) for _ in range(H * cv.s)]

    def tube(x, y, cur):
        j = int(y * cv.s)
        if x < 1.0 + snap[min(j, len(snap) - 1)]:
            return None                                                     # the snapped end, ragged
        L = light(0, (y - H / 2) / (H / 2 - 0.8))
        if W - 2.0 <= x:
            return shade(CHANNEL_ORANGE, 0.2 + L * 0.6)                    # the cap
        if W - 6.5 <= x < W - 4.5 or W - 10.5 <= x < W - 8.5:
            return shade(CHANNEL_BAND, 0.35 + L * 0.65)                     # the reflective bands
        return shade(CHANNEL_ORANGE, 0.3 + L * 0.7)
    px_paint(cv, 0, 1.2, W - 1, H - 1.2, tube)
    px_paint(cv, 1.5, 1.2, 4.5, H - 1.2, lambda x, y, cur: dk(cur, 0.35) if cur and cur[3] else None)   # torn: darker
    smudge(cv, rng, 2, (8, 1, 16, H - 1), (1.0, 2.0), 0.35)                 # tyre rubber across it
    cv.outline()
    return cv


def p_channelizer_base():
    """What a car leaves of a channelizer: its rubber base still glued down, a ragged orange stub of the tube in its
    socket."""
    S = 12
    c = S / 2
    cv = Cv(S, S)
    rng = random.Random(10803)
    channel_base(cv, c, rng)

    def stub(dx, dy, d):
        a = math.atan2(dy, dx)
        if d > 1.7 + 0.35 * math.sin(a * 3 + 1.3) + 0.2 * math.sin(a * 7):
            return None
        return dk(shade(CHANNEL_ORANGE, 0.3 + light(dx / 2, dy / 2) * 0.5), 0.15 if d > 0.8 else 0.5)
    ring(cv, c, c, 0.0, 2.2, stub)
    cv.outline()
    return cv


GROUP = 'props'
SPRITES = {
    'road_cut': (p_road_cut, (128, 80), 'fine floor'),
    'sand_pile': (heap(72, 52, 9901, '#c4a46a', (hx('#e0c890'), hx('#9a7a48'), hx('#8a8478')), ol='#3a2a14'), (72, 52), 'fine floor'),
    'asphalt_pile': (heap(64, 48, 9902, '#3a3a42', (hx('#6a6a74'), hx('#22222a'), hx('#8a8a92')), grain=0.18, ol='#121018'), (64, 48), 'fine floor'),
    'detour_arrow_paint': (arrow_mark(96, 48, DETOUR_ARROW, 5.0, (14, 7), 9903, ROAD_YELLOW), (96, 48), 'fine floor'),
    'detour_arrow_paint_left': (arrow_mark(96, 48, mirror_y(DETOUR_ARROW, 48), 5.0, (14, 7), 9904, ROAD_YELLOW), (96, 48), 'fine floor stock'),
    'gore_hatch': (p_gore_hatch, (256, 72), 'fine floor stock'),
    'merge_arrow': (arrow_mark(96, 40, MERGE_ARROW, 5.0, (16, 8), 9905), (96, 40), 'fine floor'),
    'merge_arrow_s': (arrow_mark(96, 40, mirror_y(MERGE_ARROW, 40), 5.0, (16, 8), 9906), (96, 40), 'fine floor'),
    'raised_marker': (raised_marker('#e8e4da', '#f4f4ff'), (8, 6), 'fine floor'),
    'raised_marker_yellow': (raised_marker('#d8b030', '#ffb028'), (8, 6), 'fine floor'),
    'rumble_strip': (p_rumble_strip, (96, 16), 'fine floor'),
    'plaza_stripes': (plaza_lines(320, 448, _FAN, 9911), (320, 448), 'fine floor stock'),
    'lane_taper': (plaza_lines(384, 336, _TAPER, 9921, yellow=(1,)), (384, 336), 'fine floor'),
    'plaza_fan': (plaza_lines(TOLL_FAN_L, 592, _TOLL_FAN, 9922), (TOLL_FAN_L, 592), 'fine floor'),
    'road_closed': (p_road_closed, (128, 24), 'fine glow', (124, 8)),
    'sign_detour': (p_sign_detour(), (42, 28), 'fine', (38, 6)),
    'sign_detour_left': (p_sign_detour(True), (42, 28), 'fine stock', (38, 6)),
    'jersey_barrier': (p_jersey_barrier, (96, 20), 'fine', (96, 18)),
    'water_barrier': (p_water_barrier, (60, 20), 'fine', (56, 18)),
    'excavator': (p_excavator, (192, 96), 'fine', (184, 78)),
    'dump_truck': (p_dump_truck, (240, 84), 'fine', (236, 78)),
    'works_light': (p_works_light, (96, 72), 'fine glow', (60, 34)),
    'site_fence': (p_site_fence, (112, 20), 'fine', (110, 4)),
    'roller_door': (p_roller_door, (96, 16), 'fine hung'),
    'loading_dock': (p_loading_dock, (128, 28), 'fine', (128, 22)),
    'chainlink_gate': (p_chainlink_gate, (128, 16), 'fine', (126, 4)),
    'pallet_stack': (p_pallet_stack, (40, 34), 'fine', (38, 32)),
    'oil_drum': (p_oil_drum, (20, 20), 'fine', (18, 18)),
    'sign_stop': (p_sign_stop, (20, 20), 'fine stock', (5, 5)),
    'guardrail': (p_guardrail, (128, 10), 'fine', (128, 6)),
    'guardrail_end': (p_guardrail_end, (64, 18), 'fine', (60, 14)),
    'guardrail_end_r': (flip_y(p_guardrail_end), (64, 18), 'fine', (60, 14)),
    'guardrail_end_trail': (p_guardrail_end_trail, (64, 18), 'fine', (60, 14)),
    'guardrail_end_trail_r': (flip_y(p_guardrail_end_trail), (64, 18), 'fine', (60, 14)),
    'crash_cushion': (p_crash_cushion, (96, 88), 'fine', (84, 82)),
    'crash_cushion_narrow': (lambda: p_crash_cushion(True), (96, 44), 'fine', (84, 40)),
    'highway_lamp': (p_highway_lamp, (208, 20), 'fine glow', (8, 8)),
    'highway_lamp_single': (lambda: p_highway_lamp(True), (208, 20), 'fine glow', (8, 8)),
    'sign_freeway': (p_sign_freeway, (64, 48), 'fine', (6, 6)),
    'sign_wrong_way': (p_sign_wrong_way, (38, 26), 'fine', (5, 5)),
    'sign_speed_55': (p_sign_speed_55, (22, 28), 'fine', (5, 5)),
    'sign_toll_ahead': (p_sign_toll_ahead, (54, 30), 'fine', (6, 6)),
    'reflector_post': (p_reflector_post, (6, 12), 'fine', (3, 3)),
    'toll_island': (p_toll_island, (256, 48), 'fine', (254, 46)),
    'toll_booth': (p_toll_booth_of(), (96, 44), 'fine glow', (92, 38)),
    'toll_canopy': (p_toll_canopy, (192, 640), 'fine glow hung'),
    'gate_arm_wood': (gate_arm(), (112, 12), 'fine', (110, 4)),
    'gate_arm_bit_a': (gate_arm(20.0, 62.0, 1), (46, 6), 'fine', (42, 4)),
    'gate_arm_bit_b': (gate_arm(62.0, 92.0, 2), (34, 6), 'fine', (30, 4)),
    'gate_arm_bit_c': (gate_arm(92.0, 112.0, 3), (24, 6), 'fine', (20, 4)),
    'gate_steel': (gate_steel(), (112, 20), 'fine', (110, 8)),
    'lane_signal_go': (lane_signal(True), (20, 20), 'fine glow', (5, 5)),
    'lane_signal_stop': (lane_signal(False), (20, 20), 'fine glow', (5, 5)),
    'sign_exact_change': (p_sign_exact_change, (40, 24), 'fine', (5, 5)),
    'overpass': (p_overpass, (576, 256), 'fine hung'),
    'overpass_shadow': (p_overpass_shadow, (576, 256), 'fine floor'),
    'gore_taper': (p_gore_taper, (768, 84), 'fine floor'),
    'toll_booth_duck': (p_toll_booth_of(True), (96, 44), 'fine glow'),
    'gate_steel_bent': (gate_steel(True), (112, 20), 'fine'),
    'channelizer': (p_channelizer, (12, 12), 'fine glow', (6, 6)),
    'channelizer_tube': (p_channelizer_tube, (28, 6), 'fine'),
    'channelizer_base': (p_channelizer_base, (12, 12), 'fine'),
    **{'toll_lane_%d' % n: (road_text(str(n), 9912 + n, kx=3), (17, 44), 'fine floor')   # (bold: a lane's number reads from the wheel)
       for n in range(1, 5)},
}
