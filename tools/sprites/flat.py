"""The flat of the prologue (tools/build_tutorial.py): a poor man's place, six years of it. What lies on its
floors (floor paint, no body), its furniture and what hangs on its walls, what stands on its worktop and its stove."""
import math
import random

from .core import (
    alpha, ashtray, bevel_edges, CLEAR, crease, Cv, dash, dk, fgrain, fill_capsule, fill_shape, frect, glass_top, hx,
    layer, light, line, lt, mix, OUTLINE, px_paint, ramp, relief, ring, shade, shift, smudge, stud, VNoise, wood_fill
)
from .palette import BRASS, CHROME, RUBBER, STEEL_L, WHITE
from .furniture import knob, p_chair
from .barwall import wall_frame


def tide(cv, x, y, r, col, t=0.3, broken=None):
    """A dried stain's tide line: a ring of col blended into what is painted there (`broken`: a phase; the line then
    wanders in and out and is lost over a third of its way round, as a dried puddle's is)."""
    def f(dx, dy, d):
        if not cv.on(x + dx, y + dy):
            return None
        if broken is not None:
            a = math.atan2(dy, dx)
            if math.sin(a * 2 + broken) + 0.5 * math.sin(a * 5 + broken * 3) < -0.45 or abs(d - r + 0.5 - 0.5 * math.sin(a * 3 + broken)) > 0.3:
                return None
        return mix(cv.get(x + dx, y + dy), alpha(col, 255), t)
    ring(cv, x, y, r - (1.1 if broken is not None else 0.5), r + (0.1 if broken is not None else 0.0), f)


def bottle_down(cv, x, y, ang, glass, cap=None):
    """A bottle lying on its side at (x, y), its neck toward `ang`: the body, the shoulder, the neck, a glint."""
    g = ramp(glass, 0.5, 0.25, 0.5)
    ca, sa = math.cos(ang), math.sin(ang)
    fill_capsule(cv, [(x - ca * 1.8, y - sa * 1.8), (x + ca * 1.6, y + sa * 1.6)], 1.25, lambda k, L, s, i, t: shade(g, L))
    fill_capsule(cv, [(x + ca * 1.6, y + sa * 1.6), (x + ca * 4.0, y + sa * 4.0)], 0.6, lambda k, L, s, i, t: shade(g, L + 0.1))
    line(cv, x - ca * 1.5 - sa * 0.5, y - sa * 1.5 + ca * 0.5 - 0.5, x + ca * 0.5 - sa * 0.5, y + sa * 0.5 + ca * 0.5 - 0.5, lt(g[3], 0.3))
    if cap:
        cv.dot(x + ca * 4.2, y + sa * 4.2, hx(cap))


def p_mattress():
    """His bed: a bare mattress on the floor, its head at -y. Blue ticking stripes gone grey, the stitched piping
    round its edge, its tufts, sweat and damp stains with their tide lines, a cigarette burn, a flat pillow with no
    case, a grey army blanket kicked down to its foot, the corner of a sheet out from under it."""
    W, H = 46, 66
    cv = Cv(W, H)
    tick = ramp('#c9c2ae', 0.42, 0.2, 0.2)
    nz = VNoise(W, H, 11, random.Random(8611))

    def top(u, v, L):
        x = u + 23.0
        c = shade(tick, 0.52 + L * 0.3 + (nz(x, v + 33.0) - 0.5) * 0.3)
        m = x % 4.0
        if m < 0.5:
            return mix(c, hx('#5a6a8a'), 0.5)                          # the ticking's stripes
        return mix(c, hx('#5a6a8a'), 0.16) if 1.0 <= m < 1.5 else c
    fill_shape(cv, 23.0, 33.0, 21.0, 31.0, top, kind='rect', corner=2.5, bevel=2.2)
    for (a, b) in (((3.5, 3.5), (42.5, 3.5)), ((3.5, 62.5), (42.5, 62.5)), ((3.5, 3.5), (3.5, 62.5)), ((42.5, 3.5), (42.5, 62.5))):
        dash(cv, a[0], a[1], b[0], b[1], lambda c: dk(c, 0.2), 2, 1)   # the piping's stitches
    for y in range(11, 60, 10):                                        # the tufts, each in its dimple
        for x in (10.0, 23.0, 36.0):
            xx = x + (3.0 if (y // 10) % 2 else 0.0)
            cv.dot(xx, y, hx('#7a7468'))
            cv.dot(xx - 0.5, y - 0.5, lt(tick[3], 0.2))
    rng = random.Random(8612)
    for (x, y, r, col) in ((27.0, 26.0, 6.5, '#9a8648'), (14.0, 36.0, 4.5, '#8a7a50'), (33.0, 15.0, 3.2, '#7a6a4a')):
        smudge(cv, rng, 3, (x - 2, y - 2, x + 2, y + 2), (r * 0.6, r), 0.2, hx(col))   # sweat, damp, a spilled beer
        tide(cv, x, y, r + 1.0, hx('#6a5a34'), 0.34, broken=x)
    smudge(cv, rng, 5, (4, 4, 42, 30), (1.5, 3.0), 0.14)
    fill_shape(cv, 36.5, 30.0, 1.0, 0.8, lambda u, v, L: hx('#2a1c14'))  # a cigarette burn, its brown halo
    tide(cv, 36.5, 30.0, 1.8, hx('#6a4a2a'), 0.5)

    def pillow(ly):
        p = ramp('#d6cfbc', 0.42, 0.2, 0.2)
        fill_shape(ly, 17.0, 9.5, 10.5, 5.0, lambda u, v, L: shade(p, L * 0.9 + 0.08), ang=-0.1, kind='rect', bevel=3.6, corner=2.6)
        smudge(ly, random.Random(8613), 2, (12, 7, 22, 11), (2.0, 3.5), 0.22, hx('#a89a5a'))   # where his head lies
        crease(ly, [(9.0, 8.0), (14.0, 9.5), (20.0, 9.0)], 0.12)
    layer(cv, pillow, dk(hx('#8a8474'), 0.3))

    def sheet(ly):
        s = ramp('#cfd2d8', 0.4, 0.2, 0.2)
        fill_shape(ly, 8.0, 44.0, 6.5, 4.0, lambda u, v, L: shade(s, L * 0.8 + 0.15), ang=0.5, kind='rect', bevel=1.6, corner=1.0)
        crease(ly, [(4.0, 42.0), (9.0, 45.0), (12.0, 44.5)], 0.14)
    layer(cv, sheet, dk(hx('#8a8c94'), 0.3))
    wool = ramp('#5c6258', 0.5, 0.26, 0.26)
    bz = VNoise(W, H, 11, random.Random(8614))

    def hf(x, y):
        return bz(x, y) * 1.0 + 1.5 * math.sin(x * 0.42 + y * 0.2 + 1.0) + 0.9 * math.sin(y * 0.6 - x * 0.16)

    def blanket(ly):
        fill_shape(ly, 24.5, 53.0, 20.5, 11.0, lambda u, v, L: wool[2], ang=0.07, kind='rect', corner=3.0)
        px_paint(ly, 0, 38, W, 50, lambda x, y, c: CLEAR if c[3] and y < 44.5 + 2.2 * math.sin(x * 0.19 + 0.6) + 0.8 * math.sin(x * 0.47 + 2.0) else None)
        relief(ly, 0, 38, W - 1, H - 1, hf, wool, 0.85)
        px_paint(ly, 0, 38, W, H, lambda x, y, c: dk(c, 0.1) if c[3] and (int(x * 2) + int(y * 2)) % 2 and int(x * 2) % 4 != int(y) % 4 else None)   # its coarse weave
        px_paint(ly, 0, 56, W, 62, lambda x, y, c: lt(c, 0.22) if c[3] and (0.0 <= (y - 57.5 - x * 0.07) < 1.0 or 2.0 <= (y - 57.5 - x * 0.07) < 2.5) else None)
    layer(cv, blanket, dk(wool[0], 0.3))
    cv.outline()
    return cv


def p_clothes_pile():
    """Yesterday's clothes on the floor by the bed, each laid flat so it reads at a glance: a pair of jeans (the
    waistband and its belt, two legs apart, the orange seams, a back pocket), a white T-shirt (its two sleeves, the
    neck's hole) and one boot on its side."""
    W, H = 30, 24
    cv = Cv(W, H)
    denim = ramp('#3e5a86', 0.5, 0.25, 0.3)

    def jeans(ly):
        for (a, b) in (((7.0, 5.2), (25.0, 3.6)), ((7.0, 9.2), (24.0, 12.6))):       # the two legs
            fill_capsule(ly, [a, b], 2.4, lambda k, L, s, i, t: denim[1] if s > 0.55 else (denim[3] if s < -0.6 else denim[2]))
            dash(ly, a[0], a[1] - 1.5, b[0], b[1] - 1.5, hx('#d8a040'), 1, 1)        # the seam's orange thread
            frect(ly, b[0] - 0.5, b[1] - 2.5, b[0] + 0.5, b[1] + 2.5, denim[0])     # the hem turned up
        fill_shape(ly, 5.6, 7.2, 2.6, 4.6, lambda u, v, L: denim[2] if u > -1.2 else hx('#6a4a2a'), kind='rect', corner=0.6)   # the seat, the belt
        ly.dot(3.5, 7.0, hx('#e8d8a0'))                                              # its buckle
        ly.dot(3.5, 7.5, hx('#e8d8a0'))
        frect(ly, 9.0, 3.5, 12.0, 6.0, denim[1])                                     # a back pocket
        dash(ly, 9.0, 3.5, 12.0, 3.5, hx('#d8a040'), 1, 1)
    layer(cv, jeans)

    def shirt(ly):
        w = ramp('#e2ddd0', 0.4, 0.2, 0.2)
        for (a, b) in (((9.0, 16.0), (5.0, 14.2)), ((17.0, 16.0), (21.0, 14.2))):    # the sleeves
            fill_capsule(ly, [a, b], 1.9, lambda k, L, s, i, t: w[2] if s < 0.5 else w[1])
        fill_shape(ly, 13.0, 18.6, 4.4, 4.6, lambda u, v, L: w[1] if u > 2.8 or v > 3.4 else w[2], kind='rect', corner=0.6)   # the body
        fill_shape(ly, 13.0, 14.4, 1.8, 1.1, lambda u, v, L: hx('#8a8474'))          # the neck's hole
        crease(ly, [(10.5, 17.0), (13.0, 19.5), (12.0, 22.0)], 0.14)
        ly.dot(15.0, 19.0, hx('#b8a070'))                                            # a stain
        ly.dot(15.5, 19.5, hx('#b8a070'))
    layer(cv, shirt)

    def boot(ly):
        lea = ramp('#5a3a22', 0.45, 0.22, 0.35)
        fill_shape(ly, 24.6, 19.6, 4.0, 1.9, lambda u, v, L: shade(RUBBER, L), kind='super', p=2.4, ang=0.2)   # the sole
        fill_shape(ly, 24.4, 19.2, 3.6, 1.5, lambda u, v, L: lea[2] if v < 0.4 else lea[1], kind='super', p=2.4, ang=0.2)
        fill_shape(ly, 21.6, 18.4, 1.5, 1.2, lambda u, v, L: hx('#1c1418'))          # its mouth
        for k in range(3):
            ly.dot(23.5 + k * 1.0, 18.5 + k * 0.2, hx('#e8dcc0'))                    # the laces
    layer(cv, boot)
    return cv


def p_pizza_box():
    """A takeaway pizza box left open on the floor: the lid back (-y) with its grease rings, the tray with two crusts,
    one dry slice and the grease that soaked through the card."""
    cv = Cv(14, 14)
    card = ramp('#c8b48a', 0.42, 0.2, 0.2)
    fill_shape(cv, 7.0, 3.8, 6.0, 3.0, lambda u, v, L: shade(card, 0.45 + L * 0.3), kind='rect', bevel=0.8, corner=0.3)   # the lid
    fill_shape(cv, 7.0, 10.0, 6.0, 3.2, lambda u, v, L: shade(card, 0.4 + L * 0.3), kind='rect', bevel=0.8, corner=0.3)  # the tray
    frect(cv, 1.5, 6.8, 12.5, 7.3, dk(card[1], 0.25))                   # the hinge's fold
    rng = random.Random(8631)
    smudge(cv, rng, 4, (3, 8, 11, 12), (1.2, 2.2), 0.3, hx('#9a7a3a'))  # grease through the card
    tide(cv, 5.0, 3.6, 2.0, hx('#8a6a3a'), 0.35)
    tide(cv, 8.5, 4.2, 1.4, hx('#8a6a3a'), 0.3)
    for (x, y, a) in ((4.2, 9.6, 0.3), (9.8, 11.4, 2.2)):               # crusts
        fill_capsule(cv, [(x - math.cos(a) * 1.4, y - math.sin(a) * 1.4), (x, y - 0.5), (x + math.cos(a) * 1.4, y + math.sin(a) * 1.4)],
                     0.55, lambda k, L, s, i, t: shade(ramp('#c89a52', 0.45, 0.22, 0.3), L))
    for k in range(5):                                                 # the last slice, gone hard
        frect(cv, 7.0 + k * 0.25, 8.6 + k * 0.5, 9.6 - k * 0.25, 9.1 + k * 0.5, hx('#d8a838') if k else hx('#c08a48'))
    cv.dot(8.0, 9.5, hx('#a82a22'))
    cv.dot(8.6, 10.2, hx('#a82a22'))
    cv.outline()
    return cv


def p_bottles_empty():
    """Empties left on the floor by the sofa: three beer bottles on their sides, one green, two caps, a ring of what
    ran out of the last."""
    cv = Cv(16, 12)
    for (x, y, r) in ((9.5, 8.0, 3.0), (11.5, 9.0, 2.2)):               # the dried run
        fill_shape(cv, x, y, r, r * 0.7, lambda u, v, L: hx('#2a1806', 70))
    bottle_down(cv, 5.0, 3.5, 0.25, '#5a3410', '#e0b448')
    bottle_down(cv, 9.0, 8.0, 2.6, '#5a3410')
    bottle_down(cv, 11.5, 3.6, 1.2, '#2a5a34', '#c8c8d0')
    for (x, y) in ((2.5, 9.5), (14.0, 10.0)):                           # caps
        cv.dot(x, y, hx('#e0b448'))
        cv.dot(x + 0.5, y, hx('#a8802a'))
    cv.outline()
    return cv


def p_mail_pile():
    """The post pushed under the door and never opened: envelopes fallen over each other, a window one, a manila one,
    a red FINAL NOTICE band, a flyer."""
    cv = Cv(14, 11)

    def letter(x, y, a, col, kind):
        def paint(ly):
            p = ramp(col, 0.4, 0.2, 0.2)
            fill_shape(ly, x, y, 3.4, 2.2, lambda u, v, L: (dk(p[2], 0.12) if abs(v) > abs(u) * 0.62 and v < 0 and kind != 'flyer' else shade(p, 0.55 + L * 0.3)),
                       ang=a, kind='rect', corner=0.2, bevel=0.5)
            ca, sa = math.cos(a), math.sin(a)
            if kind == 'window':
                fill_shape(ly, x - ca * 0.8 - sa * 0.6, y - sa * 0.8 + ca * 0.6, 1.5, 0.6, lambda u, v, L: hx('#8aa0b4'), ang=a, kind='rect', corner=0.1)
            elif kind == 'notice':
                fill_shape(ly, x - sa * 1.2, y + ca * 1.2, 3.2, 0.45, lambda u, v, L: hx('#c8282e'), ang=a, kind='rect', corner=0.1)
            elif kind == 'flyer':
                fill_shape(ly, x, y - 0.2, 2.2, 0.5, lambda u, v, L: hx('#2a6ab8'), ang=a, kind='rect', corner=0.1)
                fill_shape(ly, x + sa * 1.0, y + ca * 1.0, 1.8, 0.3, lambda u, v, L: hx('#3a3640'), ang=a, kind='rect', corner=0.1)
            ly.dot(x + ca * 2.4 + sa * 1.2, y + sa * 2.4 - ca * 1.2, hx('#7a3a4a'))   # the stamp
        layer(cv, paint)
    letter(4.5, 3.6, 0.35, '#e6e0d0', 'plain')
    letter(9.2, 4.2, -0.5, '#f0d860', 'flyer')
    letter(6.0, 6.8, -0.15, '#c8a868', 'plain')
    letter(9.0, 7.6, 0.6, '#ece8dc', 'window')
    letter(4.6, 7.8, 1.2, '#ece8dc', 'notice')
    return cv


def p_boards_loose():
    """The floorboards they pried up, thrown aside: three boards across each other, the pale wood of their undersides,
    split ends, bent nails still in them, and the crowbar that did it."""
    W, H = 26, 14
    cv = Cv(W, H)
    nz = VNoise(W, H, 2, random.Random(8651))

    def board(x, y, a, ln, base, seed):
        def paint(ly):
            wd = ramp(base, 0.45, 0.22, 0.28)
            fill_shape(ly, x, y, ln, 1.6, lambda u, v, L: shift(shade(wd, 0.5 + L * 0.3), int((nz(u * 0.4 + seed, v * 2.0 + seed) - 0.5) * 22)),
                       ang=a, kind='rect', corner=0.2, bevel=0.5)
            ca, sa = math.cos(a), math.sin(a)
            for e in (-1, 1):
                ex, ey = x + ca * ln * e, y + sa * ln * e
                for k in range(3):                                     # the split end
                    ly.dot(ex - sa * (k - 1) * 0.8 + ca * e * 0.3 * (k % 2), ey + ca * (k - 1) * 0.8, hx('#e0bc80'))
                stud(ly, ex - ca * e * 1.5, ey - sa * e * 1.5, hx('#6a6a76'))
            line(ly, x + ca * 3 - sa * 1.6, y + sa * 3 + ca * 1.6, x + ca * 3.8 - sa * 2.8, y + sa * 3.8 + ca * 2.8, hx('#8a8a96'))   # a nail bent over
        layer(cv, paint)
    board(12.0, 4.0, 0.08, 10.5, '#9a6a3c', 1)
    board(13.5, 8.0, -0.16, 10.0, '#b89060', 5)                        # this one face down: its pale underside
    board(11.0, 10.5, 0.3, 8.5, '#8a5a34', 9)

    def bar(ly):
        st = ramp('#3a4458', 0.5, 0.25, 0.5)
        fill_capsule(ly, [(3.0, 12.6), (19.0, 2.6), (21.0, 2.0), (22.4, 3.2)], 0.6, lambda k, L, s, i, t: lt(st[3], 0.25) if L > 0.9 else shade(st, L))
        ly.dot(3.0, 12.6, hx('#c8ccd6'))                                # its chisel end, bright from the work
        ly.dot(3.5, 12.25, hx('#c8ccd6'))
    layer(cv, bar)
    return cv


def p_phone_floor():
    """His telephone, pulled off its shelf: a beige rotary set on the floor, the dial with its finger holes, the
    handset off and lying by it, the coiled cord between them and the line torn out of the wall."""
    cv = Cv(18, 12)
    pl = ramp('#c8b894', 0.45, 0.22, 0.25)
    for k in range(9):                                                 # the line off to the wall
        cv.dot(0.5 + k * 0.5, 9.5 - math.sin(k * 0.7) * 0.8, hx('#3a3640'))

    def set_(ly):
        fill_shape(ly, 6.0, 6.5, 3.6, 3.3, lambda u, v, L: shade(pl, L), kind='rect', bevel=1.4, corner=1.2, taper=0.2)
        ring(ly, 6.2, 6.6, 1.3, 2.2, lambda dx, dy, d: hx('#e8e2d0') if int((math.atan2(dy, dx) + math.pi) * 1.6) % 2 else hx('#4a4438'))
        fill_shape(ly, 6.2, 6.6, 1.0, 1.0, lambda u, v, L: shade(ramp('#8a8474', 0.4, 0.2, 0.3), L))
        for x in (3.4, 8.4):                                           # the cradle's two prongs
            frect(ly, x, 3.5, x + 0.5, 4.5, hx('#4a4438'))
    layer(cv, set_)

    def hand(ly):
        fill_capsule(ly, [(11.6, 3.4), (15.6, 6.4)], 0.75, lambda k, L, s, i, t: shade(pl, L + 0.05))
        for (x, y) in ((11.4, 3.2), (15.9, 6.6)):
            fill_shape(ly, x, y, 1.35, 1.35, lambda u, v, L: shade(pl, L))
        ly.dot(11.4, 3.2, hx('#4a4438'))
        ly.dot(15.9, 6.6, hx('#4a4438'))
    layer(cv, hand)
    for k in range(14):                                                # the coiled cord, sprung
        t = k / 13
        x, y = 9.2 + t * 6.2, 8.4 + math.sin(t * 3.0) * 1.6 + 1.0 * t
        cv.dot(x, y + (0.5 if k % 2 else 0.0), hx('#8a8068') if k % 2 else hx('#3a3640'))
    return cv


def p_trash_spill():
    """What ran out of a split rubbish bag: the wet under it, a crushed can, a milk carton on its side, eggshells, a
    banana skin gone black, coffee grounds, a tin's lid."""
    cv = Cv(18, 14)
    rng = random.Random(8671)
    for (x, y, rx, ry) in ((8.0, 7.0, 6.5, 4.5), (12.0, 9.0, 4.0, 3.0), (5.0, 9.5, 3.0, 2.2)):   # the wet (no outline)
        fill_shape(cv, x, y, rx, ry, lambda u, v, L: hx('#1c140c', 62))
    for _ in range(14):                                                # coffee grounds
        cv.dot(rng.uniform(4, 13), rng.uniform(4, 10), hx('#2a1a10', 220))

    def things(ly):
        fill_shape(ly, 5.0, 4.5, 1.9, 1.2, lambda u, v, L: shade(ramp('#b8262c', 0.45, 0.22, 0.4), L) if abs(u) < 1.2 else shade(CHROME, L),
                   ang=0.5, kind='rect', corner=0.4, bevel=0.6)           # a can, crushed
        fill_shape(ly, 12.0, 4.6, 2.6, 1.4, lambda u, v, L: hx('#3a6ab8') if u > 1.2 else shade(WHITE, 0.4 + L * 0.5), ang=-0.3, kind='rect', corner=0.2, bevel=0.5)   # milk carton
        for (a, ln) in ((0.3, 2.6), (1.5, 2.2), (2.7, 2.4), (4.2, 1.8)):  # the banana skin
            fill_capsule(ly, [(8.6, 9.6), (8.6 + math.cos(a) * ln, 9.6 + math.sin(a) * ln)], 0.5,
                         lambda k, L, s, i, t: mix(hx('#c8a030'), hx('#3a2a14'), 0.3 + t * 0.6))
        ring(ly, 13.6, 10.4, 0.7, 1.5, lambda dx, dy, d: shade(CHROME, light(dx / d, dy / d) + 0.2))   # a tin's lid
        for (x, y) in ((3.6, 8.2), (4.4, 8.9), (3.2, 9.4)):               # eggshells
            ly.dot(x, y, hx('#e8dcc8'))
            ly.dot(x + 0.5, y, hx('#c8b8a0'))
        fill_shape(ly, 15.0, 6.6, 1.3, 1.1, lambda u, v, L: shade(ramp('#d0c8b4', 0.4, 0.2, 0.2), L), kind='super', p=1.6)   # a ball of paper
    layer(cv, things)
    return cv


def p_cutlery_spill():
    """A kitchen drawer pulled right out and tipped on the floor (they looked everywhere): the empty drawer with its
    plastic tray, and what was in it thrown about, knives, forks, spoons, a tin opener."""
    cv = Cv(18, 10)

    def drawer(ly):
        wood_fill(ly, 1, 1, 8, 8, hx('#8a6238'), plank=4, rng=random.Random(8681))
        bevel_edges(ly, 1, 1, 8, 8, 0.2, 0.3)
        frect(ly, 2.0, 2.0, 8.0, 8.0, hx('#d8d2c0'))                    # the tray
        for x in (4.0, 6.0):
            frect(ly, x - 0.25, 2.0, x + 0.25, 8.0, hx('#a8a290'))
        frect(ly, 2.0, 2.0, 8.0, 2.5, hx('#a8a290'))
        frect(ly, 3.5, 8.5, 6.5, 9.0, hx('#c8ccd6'))                    # its handle
    layer(cv, drawer)

    def steel(ly):
        for (x, y, a, kind) in ((11.0, 2.5, 0.4, 'knife'), (14.0, 4.0, -0.9, 'fork'), (12.0, 6.5, 2.4, 'spoon'), (15.5, 7.5, 0.1, 'knife'), (10.5, 8.0, 1.3, 'fork')):
            ca, sa = math.cos(a), math.sin(a)
            line(ly, x - ca * 2.2, y - sa * 2.2, x, y, hx('#3a2a20') if kind == 'knife' else hx('#b8bcc8'))
            line(ly, x, y, x + ca * 2.2, y + sa * 2.2, hx('#e4e8f0'))
            if kind == 'spoon':
                fill_shape(ly, x + ca * 2.4, y + sa * 2.4, 0.9, 0.65, lambda u, v, L: shade(CHROME, L + 0.2), ang=a)
            elif kind == 'fork':
                ly.dot(x + ca * 2.4 - sa * 0.5, y + sa * 2.4 + ca * 0.5, hx('#e4e8f0'))
                ly.dot(x + ca * 2.4 + sa * 0.5, y + sa * 2.4 - ca * 0.5, hx('#e4e8f0'))
    layer(cv, steel, None)
    return cv


def p_nightstand():
    """His bedside table (its drawer on +y, pulled half out): the scratched top with its glass rings, the alarm clock's
    red digits, an ashtray that has not been emptied in a week, a glass of water, a matchbook."""
    cv = Cv(16, 14)
    wood_fill(cv, 1, 1, 14, 10, hx('#6a4a30'), plank=5, rng=random.Random(8701))
    bevel_edges(cv, 1, 1, 14, 10, 0.22, 0.3)
    frect(cv, 3.0, 11.0, 13.0, 13.0, hx('#5a3c26'))                     # the drawer, out
    frect(cv, 3.5, 11.0, 12.5, 12.5, hx('#1e1418'))
    frect(cv, 3.0, 12.5, 13.0, 13.0, hx('#7a5636'))
    cv.dot(8.0, 12.75, BRASS[3])
    tide(cv, 11.0, 7.5, 1.8, hx('#3a2418'), 0.35)                       # glass rings
    tide(cv, 6.5, 8.0, 1.5, hx('#3a2418'), 0.25)
    cv.outline()

    def things(ly):
        fill_shape(ly, 5.0, 3.6, 2.6, 1.7, lambda u, v, L: shade(ramp('#c8c0a8', 0.42, 0.2, 0.25), L), kind='rect', bevel=0.7, corner=0.4)   # the clock
        frect(ly, 3.0, 4.0, 7.0, 5.0, hx('#1a1014'))
        for x in (3.5, 4.5, 5.5, 6.25):
            ly.dot(x, 4.5, hx('#ff3a2a'))
        frect(ly, 4.0, 2.5, 6.0, 3.0, hx('#8a8474'))                    # the snooze bar
        ashtray(ly, 11.0, 4.0, random.Random(8702), 2.4)
        for (x, y, a) in ((10.0, 3.0, 0.6), (12.0, 4.6, 2.0), (11.4, 2.8, 1.2), (10.2, 5.0, 2.8)):   # butts heaped in it
            line(ly, x, y, x + math.cos(a) * 1.2, y + math.sin(a) * 1.2, hx('#efe6d4'))
            ly.dot(x, y, hx('#d89a50'))
        glass_top(ly, 11.0, 8.0, 1.6, hx('#8ab4c8'))
        frect(ly, 4.0, 7.5, 6.0, 9.0, hx('#b8262c'))                    # the matchbook
        frect(ly, 4.0, 7.5, 6.0, 8.0, hx('#e8dcc0'))
    layer(cv, things)
    return cv


def p_chair_jacket():
    """The bedroom's chair (p_chair) with his old leather jacket hung over its back, one sleeve down to the seat."""
    cv = p_chair()

    def jacket(ly):
        lea = ramp('#4a3424', 0.5, 0.25, 0.32)
        fill_shape(ly, 3.4, 8.0, 3.0, 6.4, lambda u, v, L: shade(lea, L), kind='super', p=2.8)
        fill_capsule(ly, [(4.5, 11.0), (7.5, 12.6), (9.5, 12.0)], 1.2, lambda k, L, s, i, t: shade(lea, L))   # a sleeve
        fill_capsule(ly, [(2.6, 3.4), (4.8, 5.0)], 0.7, lambda k, L, s, i, t: shade(lea, L + 0.15))   # the collar
        fill_capsule(ly, [(2.6, 12.6), (4.8, 11.0)], 0.7, lambda k, L, s, i, t: shade(lea, L + 0.15))
        crease(ly, [(2.0, 5.5), (3.4, 8.0), (2.4, 10.5)], 0.18)
        crease(ly, [(5.6, 11.6), (7.4, 12.4)], 0.16)
        for y in (6.5, 8.0, 9.5):
            ly.dot(5.25, y, hx('#b8a070'))                              # its press studs
        frect(ly, 9.5, 11.5, 10.5, 12.5, hx('#b8b0a0'))                 # the cuff's knit
    layer(cv, jacket)
    return cv


def p_duffel_bag():
    """His bag, packed to go: an olive canvas duffel from above, stuffed tight, the brass zip along its top, two
    webbing straps round it and their handles lying over, a luggage tag."""
    W, H = 22, 12
    cv = Cv(W, H)
    can = ramp('#5a6238', 0.5, 0.25, 0.3)
    nz = VNoise(W, H, 4, random.Random(8721))
    fill_shape(cv, 11.0, 6.0, 10.0, 4.6, lambda u, v, L: can[2], kind='super', p=3.2)
    relief(cv, 0, 0, W - 1, H - 1, lambda x, y: -((y - 6.0) ** 2) * 0.16 + nz(x, y) * 1.3 + 0.35 * math.sin(x * 1.1), can, 0.9)
    for x in (6.0, 15.0):                                              # the straps
        frect(cv, x, 1.5, x + 1.5, 10.5, lambda c: mix(c, hx('#2e3220'), 0.7) if c[3] else None)
        frect(cv, x, 1.5, x + 0.5, 10.5, lambda c: lt(c, 0.12) if c[3] else None)
    dash(cv, 3.0, 5.75, 19.0, 5.75, BRASS[2], 1, 1)                     # the zip
    cv.dot(19.5, 5.75, BRASS[3])
    fill_capsule(cv, [(6.8, 4.0), (9.0, 2.6), (13.0, 2.6), (15.6, 4.0)], 0.5, lambda k, L, s, i, t: shade(ramp('#2e3220', 0.45, 0.22, 0.4), L + 0.1))   # the handles
    fill_capsule(cv, [(6.8, 8.0), (9.5, 9.6), (12.5, 9.4), (15.6, 8.0)], 0.5, lambda k, L, s, i, t: shade(ramp('#2e3220', 0.45, 0.22, 0.4), L + 0.1))
    frect(cv, 1.5, 3.5, 2.5, 8.5, lambda c: dk(c, 0.2) if c[3] else None)   # the end's seam
    frect(cv, 19.5, 8.0, 21.0, 9.5, hx('#e8dcc0'))                      # the tag
    smudge(cv, random.Random(8722), 3, (3, 2, 19, 10), (1.0, 2.0), 0.16)
    cv.outline()
    return cv


def p_coffee_table():
    """The low table in front of the sofa: dark veneer, lifted at one corner, white rings where glasses stood, a
    cigarette's burn on its edge, last week's TV guide, the remote, a sticky patch."""
    W, H = 34, 20
    cv = Cv(W, H)
    wood_fill(cv, 1, 1, W - 2, H - 2, hx('#5a3a22'), plank=9, rng=random.Random(8731))
    bevel_edges(cv, 1, 1, W - 2, H - 2, 0.22, 0.32)
    rng = random.Random(8732)
    for (x, y, r) in ((7.0, 6.0, 2.2), (9.5, 8.0, 2.2), (24.0, 13.0, 2.0), (27.5, 6.0, 1.6), (15.0, 15.0, 2.2)):
        tide(cv, x, y, r, hx('#c8b8a0'), 0.22)                          # rings: wet glasses on cheap varnish
    smudge(cv, rng, 3, (12, 4, 22, 14), (2.0, 3.5), 0.18, hx('#2a1810'))
    for (x, y) in ((3.0, 17.5), (30.0, 1.5), (18.0, 17.75)):            # burns left on the edge
        frect(cv, x, y, x + 2.0, y + 0.5, hx('#1e1410'))
    px_paint(cv, W - 6, H - 5, W - 1, H - 1, lambda x, y, c: hx('#b89868') if c[3] and x + y > W + H - 6.5 else None)   # veneer gone at a corner
    for k in range(3):
        line(cv, rng.uniform(4, 28), rng.uniform(3, 16), rng.uniform(4, 28), rng.uniform(3, 16), hx('#7a5636', 130), blend=True)   # scratches
    cv.outline()

    def things(ly):
        fill_shape(ly, 20.0, 7.0, 3.6, 2.6, lambda u, v, L: hx('#d8c84a') if v < -0.8 else (hx('#c8402c') if u < -1.0 else hx('#e6e0d0')), ang=0.2, kind='rect', corner=0.2)   # the TV guide
        fill_shape(ly, 12.5, 12.0, 2.6, 1.0, lambda u, v, L: shade(ramp('#26242c', 0.45, 0.22, 0.5), L), ang=-0.3, kind='rect', corner=0.3, bevel=0.4)   # the remote
        for k in range(3):
            ly.dot(11.4 + k * 0.9, 12.3 - k * 0.28, hx('#b8262c') if k == 0 else hx('#8a8a96'))
    layer(cv, things)
    return cv


def p_record_player():
    """His one luxury: a turntable on a low cabinet (the wall at -y), a record on its platter with its red label, the
    tone arm on its rest, two knobs and the speed lever; beside it his records on edge, their spines worn white."""
    W, H = 22, 16
    cv = Cv(W, H)
    wood_fill(cv, 1, 1, W - 2, H - 2, hx('#7a5230'), plank=7, rng=random.Random(8741))
    bevel_edges(cv, 1, 1, W - 2, H - 2, 0.22, 0.3)
    cv.outline()

    def deck(ly):
        fill_shape(ly, 8.0, 8.0, 6.4, 5.8, lambda u, v, L: shade(ramp('#2e2c36', 0.45, 0.22, 0.4), 0.4 + L * 0.4), kind='rect', bevel=0.8, corner=0.6)
        fill_shape(ly, 7.2, 8.2, 4.6, 4.6, lambda u, v, L: shade(CHROME, L))    # the platter's rim
        fill_shape(ly, 7.2, 8.2, 4.2, 4.2, lambda u, v, L: (hx('#2a2830') if int(math.hypot(u, v) * 2.0) % 2 else hx('#141218')) if abs(u + v) > 0.9 else hx('#4a4856'))   # the grooves, a streak of light
        fill_shape(ly, 7.2, 8.2, 1.5, 1.5, lambda u, v, L: shade(ramp('#c8282e', 0.45, 0.22, 0.35), L))
        ly.dot(7.2, 8.2, hx('#e8ecf4'))
        fill_shape(ly, 13.2, 3.6, 0.9, 0.9, lambda u, v, L: shade(CHROME, L))    # the arm's pivot
        line(ly, 13.2, 3.6, 12.6, 10.2, hx('#d8dce6'))
        line(ly, 12.6, 10.2, 11.2, 11.6, hx('#d8dce6'))
        frect(ly, 10.5, 11.0, 12.0, 12.5, hx('#1a1820'))                # the head shell
        knob(ly, 13.2, 12.6, 0.7, '#1a1820', -0.6)
        ly.dot(2.5, 12.75, hx('#ff3a2a'))                               # its pilot light
    layer(cv, deck)
    cols = ('#c8402c', '#e6e0d0', '#2a4a9a', '#e8c040', '#1e1a24', '#3a8a5a', '#e6e0d0', '#8a2a6a', '#d87a2a')
    for k, col in enumerate(cols):                                     # the records on edge
        frect(cv, 15.5 + k * 0.5, 2.0 + (k % 3) * 0.5, 16.0 + k * 0.5, 13.5 - (k % 2) * 0.5, hx(col))
    frect(cv, 15.5, 7.0, 20.0, 7.5, lambda c: lt(c, 0.3))               # their spines rubbed white
    frect(cv, 15.0, 2.0, 15.5, 14.0, OUTLINE)
    frect(cv, 20.0, 2.0, 20.5, 14.0, OUTLINE)
    return cv


def p_worktop():
    """The kitchen's worktop (the wall at -y, its drawers on +y): cream formica worn through to brown at its edge, the
    aluminium strip along its front, a splash-back of small tiles, a chopping board with the end of a loaf and the bread
    knife, a burn where a pan was put down, and its two drawers pulled out and turned over, a few things left in them."""
    W, H = 40, 18
    cv = Cv(W, H)
    form = ramp('#cfc6ae', 0.42, 0.2, 0.2)
    rng = random.Random(8751)
    nz = VNoise(W, H, 3, rng)
    for (x0, x1) in ((3, 16), (22, 36)):                               # the drawers, out
        frect(cv, x0, 13.0, x1, 17.0, hx('#8a6238'))
        frect(cv, x0 + 0.5, 13.0, x1 - 0.5, 16.0, hx('#1e1418'))
        frect(cv, x0, 16.0, x1, 17.0, hx('#a87a48'))
        frect(cv, x0 + 4.0, 16.25, x1 - 4.0, 16.75, hx('#c8ccd6'))
    for (x, y, col) in ((6.0, 14.5, '#c8ccd6'), (9.0, 14.25, '#c8ccd6'), (12.5, 15.0, '#b8262c'), (26.0, 14.5, '#e8dcc0'), (31.0, 14.75, '#c8ccd6')):
        frect(cv, x, y, x + 2.0, y + 0.5, hx(col))                      # what they did not throw out of them
    fill_shape(cv, W / 2, 7.0, W / 2 - 1, 6.0, lambda u, v, L: shift(shade(form, 0.5 + L * 0.3), int((nz(u + 20, v + 7) - 0.5) * 12)), kind='rect', bevel=1.0, corner=0.4)
    for _ in range(40):                                                # the formica's fleck
        cv.dot(rng.uniform(2, W - 2), rng.uniform(3, 12), hx('#a89a7a') if rng.random() < 0.6 else hx('#e8e0c8'))
    for x in range(1, W - 1, 2):                                       # the splash-back's tiles
        frect(cv, x, 1.0, x + 2.0, 2.5, hx('#b8c8c4') if (x // 2) % 5 else hx('#8aa09a'))
        frect(cv, x, 1.0, x + 0.5, 2.5, hx('#7a8884'))
    frect(cv, 1.0, 2.5, W - 1.0, 3.0, hx('#6a6458'))                    # the grime in the joint
    frect(cv, 1.0, 12.0, W - 1.0, 13.0, hx('#b8bcc8'))                  # the aluminium edge
    frect(cv, 1.0, 12.0, W - 1.0, 12.5, hx('#e4e8f0'))
    px_paint(cv, 14, 10, 24, 12, lambda x, y, c: mix(c, hx('#7a5a3a'), 0.5) if c[3] and (x - 19) ** 2 / 25 + (y - 12) ** 2 / 3 < 1 else None)   # worn through
    tide(cv, 31.0, 7.0, 3.0, hx('#3a2a1a'), 0.5)                        # a pan's burn
    tide(cv, 31.0, 7.0, 2.4, hx('#5a4a2a'), 0.25)
    smudge(cv, rng, 5, (3, 4, 37, 11), (1.5, 2.6), 0.14, hx('#6a5a3a'))
    cv.outline()

    def things(ly):
        wood_fill(ly, 5, 5, 14, 10, hx('#b88a52'), plank=3, rng=random.Random(8752))   # the board
        bevel_edges(ly, 5, 5, 14, 10, 0.2, 0.3)
        fill_shape(ly, 8.0, 7.6, 2.4, 1.8, lambda u, v, L: shade(ramp('#a8763a', 0.45, 0.22, 0.3), L) if u < 1.4 else hx('#e8d8b0'), kind='super', p=2.6)   # the loaf's end
        line(ly, 10.5, 9.6, 14.5, 6.2, hx('#e4e8f0'))                   # the bread knife
        line(ly, 14.5, 6.2, 16.5, 4.6, hx('#3a2a20'))
        for (x, y) in ((11.5, 6.0), (12.5, 7.0), (6.0, 9.5)):
            ly.dot(x, y, hx('#e8d8b0'))                                 # crumbs
    layer(cv, things)
    return cv


def p_boiler():
    """The water heater over the sink's end of the kitchen wall (the wall at -y), from above: its white enamel case
    gone yellow, the flue's collar and the black of its mouth, the louvres, rust down from a seam, the copper feed
    along the wall and the joint that weeps (it drips: data/liquids.js `drips`)."""
    cv = Cv(16, 10)
    en = ramp('#d8d2bc', 0.42, 0.2, 0.22)
    fill_capsule(cv, [(0.5, 1.6), (4.0, 1.6)], 0.55, lambda k, L, s, i, t: shade(ramp('#b86a3a', 0.45, 0.22, 0.45), L))   # copper
    fill_shape(cv, 9.0, 5.0, 6.0, 4.0, lambda u, v, L: shade(en, L), kind='rect', bevel=1.2, corner=0.8)
    ring(cv, 9.0, 4.0, 0.0, 2.0, lambda dx, dy, d: hx('#141218') if d < 1.1 else shade(STEEL_L, light(dx / d, dy / d) + 0.1))   # the flue
    for x in (5.0, 6.0, 7.0, 11.0, 12.0, 13.0):                         # louvres
        frect(cv, x, 6.5, x + 0.5, 8.0, en[0])
    rng = random.Random(8761)
    smudge(cv, rng, 3, (4, 2, 14, 8), (0.8, 1.6), 0.4, hx('#8a4a22'))   # rust
    smudge(cv, rng, 2, (4, 2, 14, 8), (1.5, 2.5), 0.18, hx('#8a7a3a'))  # nicotine
    cv.dot(3.75, 2.25, hx('#3a8a7a'))                                  # the verdigris of the weeping joint
    cv.dot(4.0, 2.75, hx('#3a8a7a'))
    frect(cv, 13.0, 3.0, 14.0, 4.0, hx('#e8c81e'))                      # the gas board's tag
    cv.outline()
    return cv


def p_bucket():
    """A zinc pail put under a leak in the ceiling, from above: the rolled rim, the grey water in it with the ceiling
    lamp caught in it, a rust line at the water's level, its wire handle fallen to one side with its wooden grip."""
    cv = Cv(11, 11)
    c = 5.5
    zn = ramp('#9aa2ac', 0.5, 0.26, 0.4)
    fill_shape(cv, c, c, 4.6, 4.6, lambda u, v, L: shade(zn, L))
    fill_shape(cv, c, c, 3.7, 3.7, lambda u, v, L: mix(hx('#2e3a48'), hx('#4a5a6a'), max(0.0, min(1.0, 0.5 - (u + v) / 9))))
    ring(cv, c, c, 3.4, 3.9, lambda dx, dy, d: hx('#6a4a2a') if dx + dy > 1.0 else None)   # the rust at its level
    cv.dot(4.0, 4.0, hx('#c8dcec'))
    cv.dot(4.5, 3.75, hx('#8aa0b4'))
    fill_capsule(cv, [(1.2, 6.0), (2.6, 9.0), (5.5, 10.2), (8.4, 9.0), (9.8, 6.0)], 0.3, lambda k, L, s, i, t: hx('#4a4e58'))   # the handle
    frect(cv, 4.5, 9.75, 6.5, 10.75, hx('#8a6238'))
    cv.outline()
    return cv


def p_plant_dead():
    """A plant nobody watered: the terracotta pot, its soil cracked pale, dry brown stalks fallen outward, the leaves
    curled at their ends, a few dropped round the pot."""
    S = 20
    c = S / 2
    cv = Cv(S, S)
    rng = random.Random(8781)
    for _ in range(7):                                                 # the leaves it dropped (no outline)
        a, d = rng.uniform(0, 6.28), rng.uniform(6.5, 9.0)
        cv.dot(c + math.cos(a) * d, c + math.sin(a) * d, hx('#6a4a22', 90))

    def pot(ly):
        p = ramp('#b05a34', 0.45, 0.22, 0.35)
        fill_shape(ly, c, c, 5.6, 5.6, lambda u, v, L: shade(p, L))
        fill_shape(ly, c, c, 4.4, 4.4, lambda u, v, L: hx('#8a7a62') if (int(u * 1.3 + 7) + int(v * 1.1 + 9)) % 4 else hx('#4a3a2a'))   # cracked soil
        ring(ly, c, c, 4.4, 4.9, lambda dx, dy, d: p[0])
        ly.dot(c + 3.0, c - 4.5, hx('#e8dcc8'))                         # a chip out of the lip
    layer(cv, pot)

    def stalks(ly):
        for k in range(8):
            a = k * 0.785 + rng.uniform(-0.3, 0.3)
            ln = rng.uniform(5.0, 8.5)
            mx, my = c + math.cos(a) * ln * 0.5 + math.sin(a) * 1.0, c + math.sin(a) * ln * 0.5 - math.cos(a) * 1.0
            ex, ey = c + math.cos(a) * ln, c + math.sin(a) * ln
            col = hx('#8a6a3a') if k % 2 else hx('#6a4a26')
            line(ly, c + math.cos(a), c + math.sin(a), mx, my, col)
            line(ly, mx, my, ex, ey, col)
            ly.dot(ex, ey, hx('#a88a4a'))                               # the curled leaf at its end
            ly.dot(ex - math.sin(a) * 0.5, ey + math.cos(a) * 0.5, hx('#5a3a1a'))
    layer(cv, stalks, None)
    return cv


def p_mirror_cracked():
    """The bedroom's mirror (the wall at -y): a thin gilt frame, the glass starred from one corner where something hit
    it, a sliver gone and the board showing."""
    def face(cv, x0, x1, y0, y1):
        px_paint(cv, x0, y0, x1, y1, lambda x, y, c: mix(hx('#7a8a9a'), hx('#c8d4dc'), max(0.0, min(1.0, (x - x0) / (x1 - x0) * 0.7 + (y - y0) * 0.2))))
        for (ex, ey) in ((x0 + 0.5, y1 - 0.2), (x0 + 4.0, y0), (x1 - 2.0, y1), (x0 + 7.5, y1)):
            line(cv, x0 + 3.5, y0 + 0.9, ex, ey, hx('#2a3038'))
            line(cv, x0 + 3.75, y0 + 0.9, ex + 0.5, ey, hx('#f4f8fc'))
        frect(cv, x0 + 2.5, y0 + 0.5, x0 + 3.5, y0 + 1.0, hx('#5a4a3a'))   # the sliver that fell
    return wall_frame(14, '#b8923a', face, 8791)


def p_mailboxes():
    """The tenants' letter boxes on the landing wall (the wall at -y), from above: five green tin boxes in a row, their
    name cards, the slots, small locks, one door hanging open on an empty box, a letter left in another, rust."""
    W = 26
    cv = Cv(W, 7)
    tin = ramp('#5a6e5c', 0.5, 0.25, 0.35)
    fill_shape(cv, W / 2, 3.0, W / 2 - 1, 2.0, lambda u, v, L: shade(tin, L), kind='rect', bevel=0.8, corner=0.3)
    for k in range(5):
        x = 1.0 + k * 4.8
        frect(cv, x + 4.5, 1.0, x + 5.0, 5.0, tin[0])                   # the gap between two boxes
        frect(cv, x + 1.0, 1.5, x + 3.5, 2.0, hx('#141218'))            # the slot
        frect(cv, x + 1.0, 3.0, x + 3.5, 3.5, hx('#e8e2d0') if k != 3 else hx('#9a947e'))   # the name card
        cv.dot(x + 3.75, 4.25, BRASS[2])                               # the lock
    frect(cv, 6.5, 1.0, 9.5, 2.0, hx('#ece8dc'))                        # a letter left in the second
    frect(cv, 15.6, 3.5, 19.6, 5.0, hx('#141218'))                      # the fourth: open, nothing in it
    fill_shape(cv, 20.0, 5.4, 0.5, 1.4, lambda u, v, L: shade(tin, L + 0.15), kind='rect', corner=0.2)   # its door, edge on
    smudge(cv, random.Random(8801), 4, (2, 1, W - 2, 5), (0.6, 1.2), 0.45, hx('#7a4a26'))
    cv.outline()
    return cv


def p_calendar():
    """A calendar on a nail (the wall at -y): the garage's picture, the month's grid, days crossed off in red up to
    this one."""
    cv = Cv(9, 5)
    frect(cv, 1.0, 1.0, 8.0, 4.0, hx('#ece8dc'))
    frect(cv, 1.0, 1.0, 8.0, 2.0, hx('#2a6ab8'))
    frect(cv, 2.0, 1.25, 4.0, 1.75, hx('#e8c040'))
    for k in range(10):
        cv.dot(1.5 + (k % 5) * 1.25, 2.5 + (k // 5) * 0.75, hx('#c8282e') if k < 7 else hx('#8a8494'))
    cv.dot(4.5, 0.75, hx('#8a8a96'))                                   # the nail
    cv.outline()
    return cv


def c_pan():
    """A black iron frying pan from above (its handle toward +x): what was frying in it burnt on, the fat still
    smoking (it fumes: data/clutter.js `fume`)."""
    cv = Cv(10, 6)
    iron = ramp('#2a2830', 0.45, 0.22, 0.45)
    fill_capsule(cv, [(5.0, 3.0), (9.2, 3.0)], 0.6, lambda k, L, s, i, t: shade(iron, L + 0.1))
    fill_shape(cv, 3.0, 3.0, 2.7, 2.7, lambda u, v, L: shade(iron, L + 0.15))
    fill_shape(cv, 3.0, 3.0, 2.0, 2.0, lambda u, v, L: hx('#3a2410') if (u * 1.3 + v) % 1.6 < 0.9 else hx('#1a1210'))
    cv.dot(2.5, 2.5, hx('#c88a3a'))
    cv.dot(3.5, 3.25, hx('#8a5a2a'))
    cv.dot(9.0, 3.0, hx('#141218'))                                    # the hole to hang it by
    cv.outline()
    return cv


def c_kettle():
    """A whistling kettle from above (its spout toward +x): the dull steel dome, the black handle over it, the lid's
    knob, the spout (it steams: data/clutter.js `fume`)."""
    cv = Cv(6, 6)
    fill_shape(cv, 2.8, 3.0, 2.5, 2.5, lambda u, v, L: shade(CHROME, L + 0.05))
    frect(cv, 5.0, 2.5, 6.0, 3.5, CHROME[1])
    fill_capsule(cv, [(1.0, 3.0), (4.6, 3.0)], 0.5, lambda k, L, s, i, t: shade(ramp('#1e1c24', 0.45, 0.22, 0.5), L + 0.1))
    cv.dot(2.75, 3.0, hx('#8a8a96'))
    cv.outline()
    return cv


def c_plates():
    """Dirty plates stacked by the sink, from above: the top one smeared with sauce, a fork across it."""
    cv = Cv(6, 6)
    fill_shape(cv, 3.0, 3.0, 2.8, 2.8, lambda u, v, L: shade(WHITE, 0.3 + L * 0.6))
    fill_shape(cv, 3.0, 3.0, 1.9, 1.9, lambda u, v, L: (hx('#a84a2a') if (u * 2.0 - v) % 2.2 < 0.9 else hx('#d8c8a0')) if u + v < 1.2 else hx('#e6e2d8'))
    line(cv, 1.5, 4.5, 4.75, 1.5, hx('#b8bcc8'))
    cv.outline()
    return cv


def c_takeaway():
    """A carton of noodles from the place downstairs, from above: its four flaps open, the wire handle, what is left
    in it gone cold, the red of its print."""
    cv = Cv(6, 5)
    fill_shape(cv, 3.0, 2.5, 2.6, 2.1, lambda u, v, L: shade(WHITE, 0.35 + L * 0.5), kind='rect', corner=0.3, bevel=0.6)
    fill_shape(cv, 3.0, 2.5, 1.5, 1.1, lambda u, v, L: hx('#c8a04a') if (u * 2.5 + v * 1.5) % 1.5 < 0.8 else hx('#8a6a2a'), kind='rect', corner=0.3)
    cv.dot(1.0, 1.0, hx('#c8282e'))
    cv.dot(1.5, 1.0, hx('#c8282e'))
    line(cv, 0.75, 2.5, 5.25, 2.5, hx('#8a8a96'))
    cv.outline()
    return cv


def p_propane():
    """A 47 kg propane cylinder standing in a corridor, from above: bigger than the stove's bottle and safety red, the
    white shoulder band, the black guard collar open on one side, the brass valve and its hand wheel, the yellow
    flame diamond stuck on its shoulder, rust where it was rolled."""
    S = 18
    c = S / 2
    cv = Cv(S, S)
    red = ramp('#d0402a', 0.55, 0.28, 0.35)
    fill_shape(cv, c, c, 8.0, 8.0, lambda u, v, L: shade(red, L * 0.9 + 0.1))
    ring(cv, c, c, 7.3, 8.05, lambda dx, dy, d: red[0] if dx + dy > 1 else red[1])
    ring(cv, c, c, 5.6, 6.4, lambda dx, dy, d: hx('#ece8dc') if dx + dy < 4 else hx('#b8b4a8'))   # the shoulder band
    smudge(cv, random.Random(8901), 4, (2, 2, 16, 16), (0.6, 1.2), 0.5, hx('#7a3a22'))
    dark = ramp('#2a2830', 0.45, 0.22, 0.5)
    ring(cv, c, c, 3.4, 4.9, lambda dx, dy, d: None if abs(math.atan2(dy, dx) - 0.9) < 0.5 else shade(dark, light(dx / d * 0.9, dy / d * 0.9)))   # the collar
    fill_shape(cv, c, c, 3.4, 3.4, lambda u, v, L: hx('#161218'))
    fill_shape(cv, c, c, 1.9, 1.9, lambda u, v, L: shade(ramp('#d8a840', 0.45, 0.22, 0.4), L))   # the valve
    ring(cv, c, c, 1.1, 1.9, lambda dx, dy, d: shade(ramp('#1c1a20', 0.45, 0.22, 0.6), light(dx / d, dy / d)))   # its wheel
    cv.dot(c - 0.25, c - 0.25, hx('#ffe8a0'))
    for k in range(4):                                                 # the flame diamond
        frect(cv, 3.5 + abs(1.5 - k) * 0.5 - 0.25, 10.5 + k * 0.5, 5.5 - abs(1.5 - k) * 0.5 + 0.25, 11.0 + k * 0.5, hx('#f2c81e'))
    cv.dot(4.5, 11.5, hx('#1c1a20'))
    fgrain(cv, random.Random(8902), 3)
    cv.outline()
    return cv


def p_runner_corner():
    """Where the corridor's carpet (p_runner) turns: a square of it joined to a length coming down from the north
    (its top edge) and one going off west (its left edge), the piping and the border running round its outer two
    sides and round the inside of the turn, one lozenge in its field."""
    S = 18
    cv = Cv(S, S)
    red = ramp('#5e2a34', 0.5, 0.25, 0.3)
    nz = VNoise(S, S, 2, random.Random(8911))

    def pile(x, y, c):
        e = min(S - x, S - y)                                          # from the outer edges
        if x < 3.5 and y < 3.5:
            e = min(e, max(x, y))                                      # ... and from the inside of the turn
        if e < 1.5:
            col = hx('#8a6a3a') if e >= 0.5 else red[0]
        elif e < 3.5:
            col = red[1]
        else:
            col = red[2]
            d = abs(x - 9.5) / 4.5 + abs(y - 9.5) / 4.5
            if 0.86 < d < 1.0:
                col = mix(red[2], hx('#8a6a3a'), 0.35)
            elif d < 0.3:
                col = mix(red[2], hx('#2a3a5a'), 0.3)
        return shift(col, int((nz(x, y) - 0.5) * 10))
    px_paint(cv, 0, 0, S, S, pile)
    return cv


GROUP = 'props'
SPRITES = {
    'mattress': (p_mattress, (46, 66), 'fine floor'),
    'clothes_pile': (p_clothes_pile, (30, 24), 'fine floor'),
    'pizza_box': (p_pizza_box, (14, 14), 'fine floor'),
    'bottles_empty': (p_bottles_empty, (16, 12), 'fine floor'),
    'mail_pile': (p_mail_pile, (14, 11), 'fine floor'),
    'boards_loose': (p_boards_loose, (26, 14), 'fine floor'),
    'phone_floor': (p_phone_floor, (18, 12), 'fine floor'),
    'trash_spill': (p_trash_spill, (18, 14), 'fine floor'),
    'cutlery_spill': (p_cutlery_spill, (18, 10), 'fine floor'),
    'runner_corner': (p_runner_corner, (18, 18), 'fine floor'),
    'nightstand': (p_nightstand, (16, 14), 'fine', (14, 10)),
    'chair_jacket': (p_chair_jacket, (16, 16), 'fine', (14, 14)),
    'duffel_bag': (p_duffel_bag, (22, 12), 'fine', (20, 10)),
    'coffee_table': (p_coffee_table, (34, 20), 'fine', (32, 18)),
    'record_player': (p_record_player, (22, 16), 'fine', (20, 14)),
    'worktop': (p_worktop, (40, 18), 'fine', (38, 16)),
    'boiler': (p_boiler, (16, 10), 'fine hung'),
    'bucket': (p_bucket, (11, 11), 'fine', (9, 9)),
    'plant_dead': (p_plant_dead, (20, 20), 'fine', (12, 12)),
    'mirror_cracked': (p_mirror_cracked, (14, 5), 'fine hung'),
    'mailboxes': (p_mailboxes, (26, 7), 'fine hung'),
    'calendar': (p_calendar, (9, 5), 'fine hung'),
    'propane': (p_propane, (18, 18), 'fine', (16, 16)),
    'clutter/pan': (c_pan, (10, 6), 'fine'),
    'clutter/kettle': (c_kettle, (6, 6), 'fine'),
    'clutter/plates': (c_plates, (6, 6), 'fine'),
    'clutter/takeaway': (c_takeaway, (6, 5), 'fine'),
}
