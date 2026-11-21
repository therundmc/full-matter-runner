"""MIAMI, 1986: the back alley's (level 2A's alley first). Generic and reusable, nothing tied to one spot (the
user: "everything Miami 80s, the street included"): what a back alley, a market corner or a sidewalk of Sunset Bay is
full of, in its pastels (pink, mint, peach, lilac, aqua) and its neon (pink, cyan, violet). What stands on the ground
(what a car ploughs through: crates, boxes, a fruit cart, a news stand, a scooter, a domino table, a wheeled
dumpster, lit box signs), hangs on a wall face (stucco trims, an AC unit dripping, graffiti), or hangs overhead
(laundry lines, a fire escape, palm fronds); its neon signs at the world's density (light). The pastel stucco walls
themselves are tiles (tiles.t_stucco: P, M, Y, V in the level's map)."""
import math
import random

from .core import (
    alpha, crease, Cv, dk, fill_shape, frect, glass_top, hx, layer, light, line, lt, mix, on_wall, OUTLINE, px_paint,
    ramp, shade, smudge, VNoise, wood_fill
)
from .palette import (
    BRASS, CARD, CHALK, CHROME, DARK_WOOD, HOT, NEON_CYAN, NEON_GREEN, NEON_PINK, PASTEL_PINK, PITCH, PUTTY, RUBBER,
    RUST_BROWN, STEEL_L
)
from .type import neon_text, words
from .neon import glow_from, Neon, sign_backing
from .furniture import p_dumpster
from .palms import leaf_over, palm_crown, PALM_DEAD, PALM_GREENS


MI_PINK, MI_MINT, MI_PEACH, MI_LILAC, MI_AQUA = PASTEL_PINK, '#8ad8c0', '#f4b896', '#b8a0e0', '#6ad0e0'
MI_VIOLET = hx('#b44aff')


def _fruit(cv, rng, x0, y0, x1, y1, r, rad, n, leaf=None):
    """A heap of round fruit (ramp r, radius rad) in the box x0..x1, y0..y1: lit from the top left, a few leaves."""
    for _ in range(n):
        fx, fy = rng.uniform(x0 + rad, x1 - rad), rng.uniform(y0 + rad, y1 - rad)
        fill_shape(cv, fx, fy, rad, rad * rng.uniform(0.85, 1.0), lambda u, v, L, r=r: shade(r, 0.18 + L * 0.8))
        if leaf and rng.random() < 0.3:
            cv.dot(fx + 0.5, fy - rad + 0.5, leaf)


def _crate(cv, rng, x0, y0, x1, y1, wood, r, rad, leaf=None):
    """An open slatted produce crate from above, heaped: its rim of slats, the dark inside, the fruit, a paper label."""
    frect(cv, x0, y0, x1, y1, shade(wood, 0.62))
    frect(cv, x0, y0, x1, y0 + 0.5, shade(wood, 0.9))
    frect(cv, x0, y1 - 0.5, x1, y1, shade(wood, 0.3))
    frect(cv, x0 + 1.2, y0 + 1.2, x1 - 1.2, y1 - 1.2, dk(wood[0], 0.4))
    for x in (x0, x1 - 1.0):
        frect(cv, x, y0, x + 1.0, y1, shade(wood, 0.5))
    _fruit(cv, rng, x0 + 1.0, y0 + 1.0, x1 - 1.0, y1 - 1.0, r, rad, int((x1 - x0) * (y1 - y0) / (rad * rad * 2.2)), leaf)
    frect(cv, x0 + 1.5, y1 - 0.6, x0 + 5.5, y1 + 0.2, CHALK)   # the grower's label on its front
    frect(cv, x0 + 2.0, y1 - 0.3, x0 + 5.0, y1, hx(rng.choice(('#c8202c', '#2a6ad8', '#2a8a4a'))))


ORANGES, MANGOS, LIMES = ramp('#ff8a1a', 0.5, 0.25, 0.3), ramp('#f0a830', 0.5, 0.26, 0.32), ramp('#6aa82a', 0.5, 0.25, 0.3)
TOMATOES = ramp('#d8302a', 0.5, 0.26, 0.3)
LEAF = hx('#3a7a2a')


def p_produce_crates():
    """Produce crates stacked out of a grocer's back door, from above, 1.25 m by 0.95 m: four slatted crates heaped
    with oranges, mangos, limes and tomatoes on a fifth set askew under them, their labels, a leaf here and there.
    The car's first thing to burst in an alley (fruit everywhere: destruction `fruit`)."""
    W, H = 40, 30
    cv = Cv(W, H)
    rng = random.Random(9901)
    wood = ramp('#c09060', 0.45, 0.22, 0.28)
    fill_shape(cv, W / 2 + 0.8, H / 2 + 0.6, W / 2 - 1.6, H / 2 - 1.4, lambda u, v, L: shade(wood, 0.2), kind='rect', corner=0.5, ang=0.04)

    def top(ly):
        for (x0, y0, x1, y1), r in zip(((1.5, 1.5, 19.5, 14.5), (20.5, 1.5, 38.5, 14.5), (1.5, 15.0, 19.5, 28.0), (20.5, 15.0, 38.5, 28.0)),
                                       (ORANGES, MANGOS, LIMES, TOMATOES)):
            _crate(ly, rng, x0, y0, x1, y1, wood, r, 1.9 if r is not LIMES else 1.5, LEAF)
    layer(cv, top)
    smudge(cv, rng, 4, (2, 2, W - 2, H - 2), (1.5, 3.0), 0.12)
    return cv


def p_box_stack():
    """Cardboard boxes stacked by a back door, from above, 1 m by 0.85 m: a big one under two smaller ones set askew,
    their tape, a palm printed on one, THIS SIDE UP arrows, a crushed corner, the rain's stains."""
    W, H = 34, 28
    cv = Cv(W, H)
    rng = random.Random(9911)
    card = CARD

    def box(ly, cx, cy, rx, ry, ang, tone):
        fill_shape(ly, cx, cy, rx, ry, lambda u, v, L: shade(card, tone + L * 0.35), kind='rect', bevel=1.2, corner=0.5, ang=ang)
        ca, sa = math.cos(ang), math.sin(ang)
        for t in range(-int(ry * 2) + 1, int(ry * 2)):
            q = t / 2.0
            for w in (-0.75, -0.25, 0.25, 0.75):                          # the tape down its middle
                ly.dot(cx + w * ca - q * sa, cy + w * sa + q * ca, mix(card[2], hx('#8a5a2a'), 0.6))
        for t in range(-int(rx * 2) + 2, int(rx * 2) - 1):
            q = t / 2.0
            ly.dot(cx + q * ca, cy + q * sa, dk(card[2], 0.3))            # where its flaps meet

    def stack(ly):
        box(ly, 17.0, 14.5, 15.5, 12.5, 0.0, 0.25)
        box(ly, 10.5, 10.0, 8.0, 7.0, -0.12, 0.42)
        box(ly, 23.5, 18.0, 8.5, 7.5, 0.18, 0.4)
    layer(cv, stack)
    green = hx('#2a7a4a', 190)
    for (dx, dy) in ((0, 0), (0, 1), (0, 2), (-1, -1), (1, -1), (-2, 0), (2, 0)):   # a palm, stamped
        cv.blend(25.0 + dx * 0.5, 15.0 + dy * 0.5, green)
    for (x, y) in ((6.5, 5.5), (28.5, 22.0)):
        for (dx, dy) in ((0, 0), (-1, 1), (1, 1), (0, 1), (0, 2)):        # arrows, THIS SIDE UP
            cv.blend(x + dx * 0.5, y + dy * 0.5, alpha(DARK_WOOD, 150))
    smudge(cv, rng, 5, (2, 2, W - 2, H - 2), (1.5, 3.5), 0.14)
    smudge(cv, rng, 2, (2, 2, W - 2, H - 2), (2.0, 3.0), 0.2, hx('#6a4a2a'))   # damp
    return cv


def p_fruit_cart():
    """A fruit seller's cart, from above, 1.9 m: a wooden barrow on two cart wheels (seen at its sides), its bed of
    tilted trays heaped with pineapples, coconuts, mangos and watermelon cut open (pink and green), a little pink and
    white striped umbrella over the far end, a hand-painted FRUTAS board, the shafts out in front."""
    W, H = 60, 34
    cv = Cv(W, H)
    rng = random.Random(9921)
    wood = ramp('#a86a3a', 0.45, 0.22, 0.3)
    for x in (16.0, 40.0):                                                # the wheels, under its sides
        for y in (2.2, H - 2.2):
            fill_shape(cv, x, y, 5.0, 1.6, lambda u, v, L: shade(ramp('#3a2a1e', 0.4, 0.2, 0.3), L), kind='rect', corner=0.8)
    for y in (9.0, 25.0):                                                 # the shafts
        frect(cv, 1.0, y - 0.6, 8.0, y + 0.6, shade(wood, 0.55))
    wood_fill(cv, 7, 3, W - 2, H - 3, wood[2], plank=4, rng=random.Random(9922))

    def bed(ly):
        frect(ly, 9.0, 5.0, W - 4.0, H - 5.0, dk(wood[0], 0.3))
        # pineapples
        for (x, y) in ((12.5, 9.0), (12.5, 15.5), (12.5, 22.0)):
            fill_shape(ly, x, y, 2.6, 3.0, lambda u, v, L: shade(ramp('#c8902a', 0.5, 0.25, 0.3), 0.2 + L * 0.7))
            for k in range(4):
                ly.dot(x - 1.5 + k, y - 1.0 + (k % 2), hx('#7a5018'))
            for (dx, dy) in ((-1.5, -3.5), (0, -4.0), (1.5, -3.5)):
                line(ly, x, y - 2.5, x + dx, y + dy, hx('#3a8a3a'))
        _fruit(ly, rng, 17.0, 5.5, 27.0, 17.0, ramp('#6a4a2a', 0.45, 0.22, 0.3), 2.2, 9)          # coconuts
        _fruit(ly, rng, 17.0, 17.5, 27.0, H - 5.5, MANGOS, 1.8, 12, LEAF)
        for (x, y) in ((31.5, 10.5), (31.5, 21.5)):                       # watermelon cut open
            fill_shape(ly, x, y, 4.2, 4.0, lambda u, v, L: hx('#2a6a2a') if (u * u + v * v) > 12.5 else
                       hx('#f4f0c8') if (u * u + v * v) > 10.5 else shade(ramp('#f04a6a', 0.45, 0.22, 0.3), 0.3 + L * 0.6))
            for k in range(5):
                ly.dot(x - 2 + rng.uniform(0, 4), y - 2 + rng.uniform(0, 4), hx('#1a1a1a'))
        _fruit(ly, rng, 37.0, 5.5, W - 5.0, 17.0, ORANGES, 1.7, 14, LEAF)
        _fruit(ly, rng, 37.0, 17.5, W - 5.0, H - 5.5, LIMES, 1.4, 16)
    layer(cv, bed)
    stripes = (ramp(MI_PINK, 0.45, 0.22, 0.25), ramp('#f4f0e2', 0.4, 0.2, 0.15))

    def brolly(ly):
        def gore(u, v, L):
            d = math.hypot(u, v)
            a = math.atan2(v, u) + math.pi / 6
            n = int(math.floor(a / (math.pi / 3))) % 6
            f = (a / (math.pi / 3)) % 1.0
            if d > 12.0 + 1.2 * (1 - math.sin(f * math.pi)):
                return None
            return shade(stripes[n % 2], max(0.05, min(0.95, 0.42 + 0.3 * (light(u / 13, v / 13) - 0.5) + 0.14 * math.sin(f * math.pi))))
        fill_shape(ly, W - 12.0, 10.0, 13.5, 13.5, gore)
        fill_shape(ly, W - 12.0, 10.0, 1.0, 1.0, lambda u, v, L: shade(BRASS, L))
    layer(cv, brolly)

    def board(ly):
        fill_shape(ly, 30.0, H - 2.6, 9.0, 2.4, lambda u, v, L: shade(ramp(MI_AQUA, 0.45, 0.22, 0.3), 0.4 + L * 0.4), kind='rect', corner=0.4)
    layer(cv, board)
    words(cv, 30.0, H - 4.4, 'FRUTAS', CHALK, 0.5, centre=True)
    smudge(cv, rng, 5, (8, 4, W - 3, H - 4), (1.5, 3.0), 0.12)
    return cv


def p_news_stand():
    """A sidewalk news rack from above, 1.1 m by 0.5 m: a green steel wire rack, its three tiers of the day's papers
    folded (headlines, photos) and the glossy magazines in their pockets (bright covers: a car, a tan, a TV star), a
    NEWS plate along its top, a brick holding the stack down."""
    W, H = 36, 18
    cv = Cv(W, H)
    rng = random.Random(9931)
    steel = ramp('#2a7a5a', 0.5, 0.26, 0.3)
    fill_shape(cv, W / 2, H / 2, W / 2 - 1, H / 2 - 1, lambda u, v, L: shade(steel, 0.3 + L * 0.4), kind='rect', bevel=1.0, corner=0.6)
    covers = ('#f04a8a', '#2ad0e0', '#f4c830', '#e8e4d6', '#f08a2a', '#8a4ad8', '#e8e4d6', '#4a8ae0')
    for k in range(8):                                                    # the magazines, front row
        x0 = 2.0 + k * 4.0
        c = hx(covers[k])
        frect(cv, x0, 9.5, x0 + 3.5, 15.5, c)
        frect(cv, x0, 9.5, x0 + 3.5, 10.5, lt(c, 0.4) if k % 3 else hx('#c8202c'))
        frect(cv, x0 + 0.5, 12.0, x0 + 3.0, 14.5, mix(c, hx(rng.choice(('#f0c8a8', '#1a1a2a', '#e8e4d6'))), 0.6))
    for k in range(4):                                                    # the papers, folded, at the back
        x0 = 2.0 + k * 8.0
        frect(cv, x0, 2.5, x0 + 7.5, 8.5, hx('#e8e4d6'))
        frect(cv, x0 + 0.5, 3.0, x0 + 7.0, 4.0, hx('#1a1a22'))
        frect(cv, x0 + 0.5, 4.8, x0 + 3.5, 7.8, hx('#9a9aa0'))
        for y in (5.0, 6.0, 7.0):
            frect(cv, x0 + 4.0, y, x0 + 7.0, y + 0.5, hx('#a8a8b0'))
    for x in range(2, W - 1, 4):                                          # the wire over them
        frect(cv, x, 1.5, x + 0.5, H - 1.5, lambda c: mix(c, steel[3], 0.5))
    frect(cv, 1.0, 0.5, W - 1.0, 4.5, shade(steel, 0.8))
    words(cv, W / 2, 0.75, 'NEWS', CHALK, 0.5, centre=True)
    fill_shape(cv, 9.0, 5.5, 2.0, 1.2, lambda u, v, L: shade(ramp('#9a4a3a', 0.45, 0.22, 0.3), L), kind='rect', corner=0.3)   # the brick
    smudge(cv, rng, 4, (1, 1, W - 1, H - 1), (1.0, 2.5), 0.15)
    cv.outline()
    return cv


def _cloth(ly, rng, x0, y0, w, h, base, pattern=None):
    """A thing hung on a line seen from above, blown a little: its top along the line, folds down its length, a
    pattern (stripes, a print), the pegs."""
    r = ramp(base, 0.45, 0.22, 0.3)

    def px(x, y, cur):
        if not (x0 <= x < x0 + w and y0 <= y < y0 + h):
            return None
        fold = 0.5 + 0.3 * math.sin((x - x0) * 1.3 + rng_phase) - (y - y0) / h * 0.25
        c = shade(r, max(0.05, min(0.95, fold)))
        if pattern == 'stripes' and int((x - x0) // 2) % 2:
            c = mix(c, CHALK, 0.7)
        elif pattern == 'print' and ((int(x * 2) * 7 + int(y * 2) * 13) % 11) == 0:
            c = hx(rng.choice(('#f4f0e2', '#f4c830', '#2a8a4a')))
        return c
    rng_phase = rng.uniform(0, 6)
    px_paint(ly, x0, y0, x0 + w, y0 + h, px)
    for x in (x0 + 0.5, x0 + w - 1.0):
        frect(ly, x, y0 - 0.5, x + 0.5, y0 + 1.0, hx('#e8c040'))          # the pegs


def p_laundry_line():
    """Washing hung across an alley from above, 5 m: two lines strung wall to wall a metre apart (their hooks at
    each end), on them a Hawaiian shirt, a pink one, jeans, a striped beach towel, a white sheet, a mint blouse, a
    bikini, pegs; hung high (it fades over him) and torn down by a car under it (prop `canopy`: the cloth flies)."""
    W, H = 160, 40
    cv = Cv(W, H)
    rng = random.Random(9941)
    for y in (12.0, 28.0):
        line(cv, 1.0, y, W - 1.0, y + 0.5, PUTTY)
        line(cv, 1.0, y + 0.5, W - 1.0, y + 1.0, alpha(hx('#5a5660'), 160))
        for x in (1.0, W - 2.5):
            frect(cv, x, y - 1.0, x + 1.5, y + 1.5, hx('#5a5e66'))
    ly = Cv(W, H)
    x = 6.0
    for (w, base, pat) in ((18, '#2ab8c8', 'print'), (14, MI_PINK, None), (12, '#3a5a9a', None), (22, '#f04a6a', 'stripes'),
                           (12, '#f4b896', None), (16, MI_MINT, None)):
        _cloth(ly, rng, x, 12.5, w, rng.choice((8, 9, 10)), base, pat)
        x += w + rng.uniform(3, 6)
    x = 10.0
    for (w, base, pat) in ((28, '#ece8de', None), (8, '#ff2a6d', None), (16, '#f4c830', 'stripes'), (20, MI_LILAC, 'print'),
                           (14, '#ece8de', None), (18, MI_AQUA, None)):
        _cloth(ly, rng, x, 28.5, w, rng.choice((7, 8, 9)), base, pat)
        x += w + rng.uniform(3, 7)
    ly.outline()
    cv.over(ly)
    return cv


def cloth_piece(w, h, base, pat, seed):
    """A piece of the washing torn off its line, lying crumpled on the ground (the laundry line's `pieces`)."""
    def make():
        cv = Cv(w, h)
        rng = random.Random(seed)
        r = ramp(base, 0.45, 0.22, 0.3)
        n = VNoise(w, h, 3, rng)

        def px(u, v, L):
            c = shade(r, max(0.05, min(0.95, 0.25 + n(w / 2 + u, h / 2 + v) * 0.6 + (L - 0.5) * 0.4)))
            if pat == 'stripes' and int((u + w) // 2) % 2:
                c = mix(c, CHALK, 0.65)
            return c
        fill_shape(cv, w / 2, h / 2, w / 2 - 1.2, h / 2 - 1.2, px, kind='super', p=3.0, ang=rng.uniform(-0.2, 0.2))
        crease(cv, [(2.5, h / 2), (w / 2, h / 2 - 1.5), (w - 3, h / 2 + 1)], 0.25)
        cv.outline()
        return cv
    return make


def neon_box(face, text, seed):
    """A lit box sign put out on the sidewalk at night, from above, 90 cm: its steel frame on two feet, the face a
    sheet of coloured perspex lit from inside (the emissive map), the words in dark capitals, a crack taped over."""
    def make():
        W, H = 36, 14
        cv, gl = Cv(W, H), Cv(W, H)
        rng = random.Random(seed)
        for x in (4.0, W - 4.0):                                          # the feet
            frect(cv, x - 1.5, 1.0, x + 1.5, H - 1.0, shade(STEEL_L, 0.3))
        fill_shape(cv, W / 2, H / 2, W / 2 - 1.5, H / 2 - 2.5, lambda u, v, L: shade(STEEL_L, 0.25 + L * 0.5), kind='rect', corner=0.6)
        fr = ramp(face, 0.3, 0.14, 0.4)

        def lit(u, v, L):
            return shade(fr, 0.62 + 0.3 * (1 - abs(u) / (W / 2)))
        fill_shape(cv, W / 2, H / 2, W / 2 - 3.0, H / 2 - 4.0, lit, kind='rect', corner=0.3)
        words(cv, W / 2, H / 2 - 1.75, text, hx('#1a1028'), 0.5, centre=True)
        frect(cv, 26.0, 4.5, 28.5, 5.0, alpha(hx('#c8c4b8'), 180))       # the tape over a crack
        cv.outline()
        gl = glow_from(cv, lambda x, y, c: 3.0 <= x < W - 3 and 4.0 <= y < H - 4 and c[3] and max(c[:3]) > 150)
        smudge(cv, rng, 2, (1, 1, W - 1, H - 1), (0.8, 1.6), 0.18)
        return cv, gl
    return make


def scooter(body, seed):
    """A motor scooter parked from above, 1.8 m: the round pastel body over its engine, the leg shield and the
    handlebar with its chrome mirrors and the headlight at the front (+x), the long two-tone saddle, the spare
    wheel on the back carrier, a sticker, scuffs."""
    def make():
        W, H = 58, 22
        cv = Cv(W, H)
        rng = random.Random(seed)
        r = ramp(body, 0.45, 0.22, 0.3)
        fill_shape(cv, 5.0, H / 2, 4.5, 4.5, lambda u, v, L: shade(RUBBER, 0.3 + L * 0.5))      # the spare wheel
        fill_shape(cv, 5.0, H / 2, 2.2, 2.2, lambda u, v, L: shade(CHROME, L))

        def frame(ly):
            fill_shape(ly, 22.0, H / 2, 15.0, 8.5, lambda u, v, L: shade(r, 0.15 + L * 0.85), kind='super', p=2.4)   # the body
            fill_shape(ly, 42.0, H / 2, 6.0, 4.0, lambda u, v, L: shade(r, 0.2 + L * 0.7), kind='rect', corner=1.6)   # the floor
            fill_shape(ly, 49.0, H / 2, 3.0, 7.0, lambda u, v, L: shade(r, 0.2 + L * 0.8), kind='super', p=2.6)      # the leg shield
        layer(cv, frame)

        def seat(ly):
            fill_shape(ly, 22.0, H / 2, 10.5, 3.6, lambda u, v, L: shade(ramp('#3a2a2a' if u < 0 else '#e8e4d6', 0.45, 0.2, 0.3), 0.2 + L * 0.7),
                       kind='rect', corner=1.6, bevel=1.4)
        layer(cv, seat)
        frect(cv, 52.0, 2.0, 53.0, H - 2.0, shade(CHROME, 0.6))             # the handlebar
        for y in (2.5, H - 2.5):
            fill_shape(cv, 52.5, y, 1.4, 1.0, lambda u, v, L: shade(RUBBER, 0.4 + L * 0.4))   # the grips
            fill_shape(cv, 50.5, y + (1.5 if y < H / 2 else -1.5), 1.2, 1.2, lambda u, v, L: shade(CHROME, L))   # mirrors
        fill_shape(cv, 55.0, H / 2, 1.6, 2.4, lambda u, v, L: HOT if L > 0.5 else shade(CHROME, L))   # the headlight
        fill_shape(cv, 33.0, 15.0, 1.4, 1.4, lambda u, v, L: CHALK)     # a sticker
        cv.dot(33.0, 15.0, NEON_PINK)
        smudge(cv, rng, 4, (8, 2, 50, H - 2), (1.0, 2.5), 0.16)
        cv.outline()
        return cv
    return make


def p_domino_table():
    """A folding card table out in the alley for the old men's dominoes, from above, 90 cm: its scuffed wooden top,
    the game laid out in a cross (white tiles, black pips), each man's hand stood up at his side, two glasses of rum,
    an ashtray, a cigar, a bottle cap."""
    S = 30
    cv = Cv(S, S)
    rng = random.Random(9951)
    wood = ramp('#8a5a32', 0.45, 0.22, 0.3)
    wood_fill(cv, 1, 1, S - 1, S - 1, wood[2], plank=5, rng=random.Random(9952))
    bone = ramp('#f2ead2', 0.3, 0.14, 0.1)

    def tile(ly, x, y, vert):
        w, h = (2.0, 3.5) if vert else (3.5, 2.0)
        fill_shape(ly, x, y, w / 2, h / 2, lambda u, v, L: shade(bone, 0.5 + L * 0.4), kind='rect', corner=0.3)
        ly.dot(x - (0 if vert else 0.75), y - (0.75 if vert else 0), hx('#1a1a1a'))
        if rng.random() < 0.6:
            ly.dot(x + (0 if vert else 0.75), y + (0.75 if vert else 0), hx('#1a1a1a'))

    def game(ly):
        for k in range(-3, 4):
            tile(ly, S / 2 + k * 3.8, S / 2, False)
        for k in (-2, -1, 1, 2):
            tile(ly, S / 2, S / 2 + k * 3.8 + (0.8 if k > 0 else -0.8), True)
        for (x0, y0, dx, dy) in ((4.0, 3.0, 2.5, 0), (4.0, S - 3.0, 2.5, 0), (3.0, 9.0, 0, 2.5), (S - 3.0, 9.0, 0, 2.5)):
            for k in range(4):                                            # the hands, stood on edge
                frect(ly, x0 + dx * k, y0 + dy * k, x0 + dx * k + (2.0 if dx else 0.8), y0 + dy * k + (0.8 if dx else 2.0), shade(bone, 0.7))
    layer(cv, game)
    for (x, y) in ((S - 6.0, 5.0), (6.0, S - 6.5)):
        glass_top(cv, x, y, 1.8, hx('#c8802a'))
    fill_shape(cv, S - 5.5, S - 5.0, 2.0, 2.0, lambda u, v, L: shade(ramp('#8a8e98', 0.4, 0.2, 0.3), L))   # the ashtray
    line(cv, S - 7.5, S - 4.0, S - 4.0, S - 6.5, hx('#5a3a22'))                                         # the cigar
    cv.dot(S - 4.0, S - 6.5, hx('#ff6a1a'))
    smudge(cv, rng, 4, (2, 2, S - 2, S - 2), (1.5, 3.0), 0.12)
    cv.outline()
    return cv


def recolour(fn, to, seed, tag=None):
    """Another colour of a painted thing: its green paint (the pixels where green leads) moved onto ramp `to` by
    their lightness, the rest kept; a graffiti tag sprayed on it maybe (tag: a neon colour)."""
    def make():
        cv = fn()
        r = ramp(to, 0.5, 0.26, 0.3)
        for j in range(cv.ph):
            for i in range(cv.pw):
                c = cv.p[i, j]
                if c[3] and c[1] > c[0] + 12 and c[1] >= c[2] and c != OUTLINE:
                    L = max(0.0, min(1.0, (c[1] - 30) / 140.0))
                    cv.p[i, j] = alpha(shade(r, L), c[3])
        if tag:
            rng = random.Random(seed)
            x, y = rng.uniform(6, 14), rng.uniform(26, 30)
            for k in range(28):
                x += rng.uniform(0.2, 0.7)
                y = max(25.0, min(33.0, y + rng.uniform(-0.8, 0.8)))
                cv.dot(x, y, hx(tag))
                if k % 3 == 0:
                    cv.dot(x, y + 0.5, hx(tag))
        return cv
    return make


def stucco_trim(base, stripe, seed):
    """Art deco on a wall face, from above (the wall at -y): a 3 m length of the stucco band along the foot of a
    pastel wall, three racing lines of the trim's colour run along it, the paint chipped and rain-streaked."""
    def paint(cv):
        r = ramp(base, 0.4, 0.2, 0.25)
        rng = random.Random(seed)
        frect(cv, 0, 0.5, 96, 4.5, shade(r, 0.6))
        frect(cv, 0, 0.5, 96, 1.0, shade(r, 0.9))
        for y in (1.6, 2.6, 3.6):
            frect(cv, 0, y, 96, y + 0.5, hx(stripe))
        for _ in range(7):
            x = rng.uniform(2, 92)
            frect(cv, x, 1.0, x + rng.uniform(0.5, 2.0), 4.5, lambda c: mix(c, hx('#8a8e96'), 0.5))   # chipped to the block
        smudge(cv, rng, 6, (1, 0, 95, 5), (1.5, 3.0), 0.16)
    return lambda: on_wall(96, 5, paint)


def p_ac_drip():
    """A window air-conditioner hung on a wall over an alley, from above (the wall at -y), 80 cm: its beige casing
    stained rust down the front, the fan's grille, a rag stuffed in a gap, and under it on the ground the dark wet
    stain its drip has kept fresh for years."""
    W, H = 28, 18
    cv = Cv(W, H)
    rng = random.Random(9961)

    def stain(ly):
        fill_shape(ly, 15.0, 13.5, 8.0, 3.6, lambda u, v, L: alpha(hx('#14121c'), int(120 * (1 - (u * u / 64 + v * v / 13)))))
    stain(cv)
    case = ramp('#d8ccb0', 0.45, 0.22, 0.28)

    def unit(ly):
        fill_shape(ly, 14.0, 5.5, 12.0, 5.0, lambda u, v, L: shade(case, 0.2 + L * 0.75), kind='rect', bevel=1.2, corner=0.8)
        for x in range(5, 24, 2):
            frect(ly, x, 3.0, x + 1.0, 9.0, lambda c: dk(c, 0.3))       # the grille's louvres
        fill_shape(ly, 14.0, 6.0, 3.0, 2.5, lambda u, v, L: shade(ramp('#3a3a44', 0.4, 0.2, 0.3), L))   # the fan behind
    layer(cv, unit)
    smudge(cv, rng, 5, (3, 4, 25, 10), (0.8, 2.0), 0.5, RUST_BROWN)
    frect(cv, 3.0, 9.5, 5.0, 10.5, hx('#c8c4b8'))                        # the rag
    for y in (11.5, 12.5, 14.0):
        cv.dot(15.0, y, alpha(hx('#9ac8e8'), 200))                       # the drip
    return cv


def p_fire_escape():
    """A fire escape's landing over an alley, from above (the wall at -y), 3 m by 1.3 m: black steel slats with the
    gaps showing the alley below, its railing, the drop ladder folded up, a potted geranium, a rusty chair. Hung high:
    it fades over him."""
    W, H = 96, 44
    cv = Cv(W, H)
    rng = random.Random(9971)
    iron = ramp('#2a2a34', 0.4, 0.2, 0.35)

    def deck(x, y, cur):
        if (int(x * 2) % 3) == 2:
            return alpha(PITCH, 120)
        return shade(iron, 0.35 + 0.25 * ((int(y) % 6) / 6.0))
    px_paint(cv, 2, 2, W - 2, H - 3, deck)
    frect(cv, 1, 1, W - 1, 2.5, shade(iron, 0.7))                        # its railing along the outer edge and ends
    frect(cv, 1, H - 3, W - 1, H - 1.5, shade(iron, 0.8))
    for x in (1, W - 2.5):
        frect(cv, x, 1, x + 1.5, H - 1.5, shade(iron, 0.7))
    for x in range(8, W - 4, 8):
        frect(cv, x, H - 3.5, x + 1.0, H - 1.0, shade(iron, 0.9))
    for k in range(9):                                                    # the drop ladder folded up at one end
        frect(cv, W - 22.0 + k * 2.0, 8.0, W - 21.0 + k * 2.0, 22.0, shade(iron, 0.85))
    frect(cv, W - 22.0, 8.0, W - 4.0, 9.0, shade(iron, 0.95))
    frect(cv, W - 22.0, 21.0, W - 4.0, 22.0, shade(iron, 0.95))

    def things(ly):
        fill_shape(ly, 14.0, 30.0, 4.0, 4.0, lambda u, v, L: shade(ramp('#c86a3a', 0.45, 0.22, 0.3), L))   # the pot
        for _ in range(16):
            ly.dot(14 + rng.uniform(-4, 4), 30 + rng.uniform(-4, 4), rng.choice((hx('#3a8a3a'), hx('#2a6a2a'), NEON_PINK, hx('#e83a4a'))))
        fill_shape(ly, 40.0, 26.0, 5.0, 5.0, lambda u, v, L: shade(ramp(MI_AQUA, 0.45, 0.22, 0.3), 0.2 + L * 0.6), kind='rect', corner=1.0)   # a chair
    layer(cv, things)
    smudge(cv, rng, 10, (2, 2, W - 2, H - 2), (1.0, 3.0), 0.5, hx('#7a3e1a'))
    cv.outline()
    return cv


def p_palm_fronds():
    """A palm's head seen from above where it leans over a wall into the alley, 2.75 m: long fronds out from its
    crown at the top edge (the trunk behind the wall), their leaflets combed out (palm_crown: the coconut palm's,
    one family with the street's), one dead and brown hanging, a cluster of coconuts. Hung high (it fades over him)."""
    W, H = 88, 64
    S = 128
    rng = random.Random(9981)
    fronds = []
    for k in range(11):
        a = math.pi * (0.04 + 0.92 * k / 10) + rng.uniform(-0.08, 0.08)
        fronds.append((a, rng.uniform(30, 44), rng.uniform(7.5, 9.0), rng.uniform(-0.3, 0.3), 2 if k == 5 else 0))
    fronds += [(math.pi * rng.uniform(0.2, 0.8), rng.uniform(16, 20), 6.0, 0.0, 1) for _ in range(3)]
    crown = palm_crown(S, 9982, fronds, PALM_GREENS['coconut'], PALM_DEAD, None, 4.0)
    nuts = Cv(S, S)
    for (dx, dy, col) in ((-3.4, 2.6, '#7a5a22'), (0.2, 4.4, '#5a7a2a'), (3.4, 2.4, '#7a5a22')):
        fill_shape(nuts, S / 2 + dx, S / 2 + dy, 2.2, 2.2, lambda u, v, L, col=col: shade(ramp(col, 0.5, 0.25, 0.35), 0.15 + L * 0.75))
    leaf_over(crown, nuts)
    cv = Cv(W, H)
    k = cv.s
    ox, oy = S / 2 - W / 2, S / 2 - 4.0                                    # its heart 4 px under the top edge
    cv.img.paste(crown.img.crop((int(ox * k), int(oy * k), int((ox + W) * k), int((oy + H) * k))), (0, 0))
    cv.p = cv.img.load()
    return cv


def graffiti_neon(cols, seed):
    """Graffiti in neon paint on a wall face from above (the wall at -y), 2 m: a wild-style piece's foot (fat
    letters' bottoms in pink, cyan, yellow, an outline in black, drips, a crown), what a passing car sees of it."""
    def paint(cv):
        rng = random.Random(seed)
        x = 2.0
        while x < 60:
            w = rng.uniform(4, 8)
            c = hx(rng.choice(cols))
            frect(cv, x, 1.0, x + w, rng.choice((3.5, 4.0, 4.5)), c)
            frect(cv, x, 1.0, x + w, 1.5, lt(c, 0.35))
            frect(cv, x + w - 0.5, 1.0, x + w, 4.0, OUTLINE)
            if rng.random() < 0.4:
                frect(cv, x + rng.uniform(1, w - 1), 4.0, x + rng.uniform(1, w - 1) + 0.5, 5.5, c)   # a drip
            x += w + rng.uniform(0.0, 1.5)
        for _ in range(4):
            cv.dot(rng.uniform(4, 60), rng.uniform(1.5, 3.5), CHALK)   # its shine
    return lambda: on_wall(64, 6, paint)


def p_neon_sign_botanica():
    """BOTANICA in cyan tubes, a violet candle flame and a star either side: the saints and herbs shop's back door."""
    cv, gl = sign_backing(62, 14), Cv(62, 14)
    ne = Neon(62, 14)
    ne.line([(4, 11), (4, 6), (6, 6), (6, 11)], MI_VIOLET)                       # a candle
    ne.line([(5, 4), (4, 3), (5, 2)], NEON_PINK)
    neon_text(ne, 10, 3, 'BOTANICA', NEON_CYAN)
    ne.line([(57, 4), (57, 10)], MI_VIOLET)                                      # a star
    ne.line([(54, 7), (60, 7)], MI_VIOLET)
    ne.render(cv, gl)
    return cv, gl


def p_neon_sign_cocktail():
    """A martini glass in pink tubes, its olive green, and COCKTAILS in violet: a bar's back door on an alley."""
    cv, gl = sign_backing(66, 14), Cv(66, 14)
    ne = Neon(66, 14)
    ne.line([(2, 2), (10, 2), (6, 7), (2, 2)], NEON_PINK)                        # the glass
    ne.line([(6, 7), (6, 11)], NEON_PINK)
    ne.line([(4, 11), (8, 11)], NEON_PINK)
    ne.dot(7, 4, NEON_GREEN)
    neon_text(ne, 13, 3, 'COCKTAILS', MI_VIOLET)
    ne.render(cv, gl)
    return cv, gl


GROUP = 'props'
SPRITES = {
    'produce_crates': (p_produce_crates, (40, 30), 'fine', (38, 28)),
    'box_stack': (p_box_stack, (34, 28), 'fine', (32, 26)),
    'fruit_cart': (p_fruit_cart, (60, 34), 'fine', (56, 30)),
    'news_stand': (p_news_stand, (36, 18), 'fine', (34, 14)),
    'laundry_line': (p_laundry_line, (160, 40), 'fine hung'),
    'laundry_shirt': (cloth_piece(20, 14, '#2ab8c8', None, 9942), (20, 14), 'fine'),
    'laundry_towel': (cloth_piece(24, 12, '#f04a6a', 'stripes', 9943), (24, 12), 'fine'),
    'laundry_sheet': (cloth_piece(32, 18, '#ece8de', None, 9944), (32, 18), 'fine'),
    'neon_box_pink': (neon_box(MI_PINK, 'COCKTAILS', 9945), (36, 14), 'fine glow', (34, 10)),
    'neon_box_cyan': (neon_box(MI_AQUA, 'OPEN 24', 9946), (36, 14), 'fine glow', (34, 10)),
    'scooter_mint': (scooter(MI_MINT, 9947), (58, 22), 'fine', (54, 18)),
    'scooter_pink': (scooter(MI_PINK, 9948), (58, 22), 'fine', (54, 18)),
    'domino_table': (p_domino_table, (30, 30), 'fine', (28, 28)),
    'dumpster_mint': (recolour(p_dumpster, MI_MINT, 9949, '#ff2a6d'), (60, 36), 'fine', (58, 34)),
    'dumpster_pink': (recolour(p_dumpster, MI_PINK, 9950, '#05d9e8'), (60, 36), 'fine', (58, 34)),
    'dumpster_aqua': (recolour(p_dumpster, MI_AQUA, 9953, '#f9c80e'), (60, 36), 'fine stock', (58, 34)),
    'stucco_trim_pink': (stucco_trim(MI_PINK, '#5ac8c8', 9954), (96, 5), 'fine hung'),
    'stucco_trim_mint': (stucco_trim(MI_MINT, '#f07aa0', 9955), (96, 5), 'fine stock hung'),
    'stucco_trim_peach': (stucco_trim(MI_PEACH, '#3aa8b8', 9956), (96, 5), 'fine stock hung'),
    'ac_drip': (p_ac_drip, (28, 18), 'fine hung'),
    'fire_escape': (p_fire_escape, (96, 44), 'fine hung'),
    'palm_fronds': (p_palm_fronds, (88, 64), 'fine hung'),
    'graffiti_neon_a': (graffiti_neon(('#ff2a6d', '#05d9e8', '#f9c80e'), 9957), (64, 6), 'fine hung'),
    'graffiti_neon_b': (graffiti_neon(('#b44aff', '#3aff8a', '#ff2a6d'), 9958), (64, 6), 'fine hung'),
    'neon_sign_botanica': (p_neon_sign_botanica, (62, 14), 'glow hung'),
    'neon_sign_cocktail': (p_neon_sign_cocktail, (66, 14), 'glow hung'),
}
