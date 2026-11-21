"""The road of level 2A (tools/build_level2a.py), a real street piece by piece: what is painted on its ground
(kerbs, markings, words, covers, patches, the works' trench) and what stands on it (traffic lights, a bus shelter,
signs, bollards, trees, the works, the railway over it, the freeway sign)."""
import math
import random

from .core import (
    alpha, Cv, dk, fill_capsule, fill_shape, frect, hx, layer, line, lt, LX, LY, mix, px_paint, ramp, ring, shade,
    shift, smudge, tone, VNoise
)
from .palette import FL_ASPHALT, FL_SIDEWALK, ROAD_WHITE, ROAD_YELLOW, RUBBER, STEEL, STEEL_L
from .type import FONT, inked, tiny_text
from .tiles import tile_px


ROAD_WEAR = 0.6     # one wear for all of it (road_mark): the street's lines, arrows and words, the ramp's, the toll's
ROAD_WEAR_RUN = -0.6   # the long lines laid end to end (centre, edges, lane dashes): the same piece every 3 m, so
                       # its worn-through holes would repeat as a dash; they only thin (their noise wraps: no seam)
KERB = ramp('#a3a0a8', 0.5, 0.26, 0.28)
KERB_RED, KERB_YELLOW = hx('#b23a30'), ROAD_YELLOW
GUTTER = (16, 12, 24)


def road_mark(W, H, mask, seed, col=ROAD_WHITE, wear=ROAD_WEAR):
    """Paint on the asphalt, worn: mask(x, y) is where the marking is (world px, a pixel's centre). Thermoplastic laid
    on a road: chipped where the aggregate shows through, thinned to grey in slow patches, never a clean decal."""
    cv = Cv(W, H)
    rng = random.Random(seed)
    slow, quick = VNoise(max(W, 16), max(H, 16), 8, rng), VNoise(max(W, 16), max(H, 16), 2, rng)   # cells that divide a 3 m piece: it wraps

    def f(x, y, cur):
        if not mask(x, y):
            return None
        w = slow(x, y) * 0.62 + quick(x, y) * 0.38 + 0.07 * (wear - 1.0)
        if w > 0.73:
            return None                                                   # worn through: the asphalt
        c = mix(col, FL_ASPHALT, 0.4) if w > 0.64 else col                # thinned round the holes
        return alpha(shift(c, rng.randint(-3, 3)), 240)
    px_paint(cv, 0, 0, W, H, f)
    return cv


def kerb_col(v, lit, paint=None, low=False):
    """A kerb's colour v px across it, from the sidewalk (v < 0: the stone's top, 5 px) over its edge (0) down its
    face (1.5 px: lit when it looks up or left, in shadow else) into the gutter; None outside. low: a dropped kerb
    (flush: a driveway, a crossing). paint: the colour it is painted (red: no stopping; yellow: loading)."""
    if v < -5 or v >= 3:
        return None
    if low:
        if v < -4.5:
            return dk(KERB[2], 0.24)
        if v < 0:
            return hx('#8b8991')
        return hx('#4c4a56') if v < 0.5 else alpha(GUTTER + (255,), 34) if v < 2 else None
    top = mix(KERB[2], paint, 0.84) if paint else KERB[2]
    if v < -4.5:
        return dk(KERB[2], 0.3)                                            # the joint with the slabs
    if v < -1:
        return top
    if v < 0:
        return top if lit else lt(top, 0.22)                               # its rounded edge
    if v < 1.5:
        face = lt(KERB[3], 0.12) if lit else hx('#2b2834')
        return mix(face, paint, 0.5) if paint else face
    a = (38, 16) if lit else (74, 30)
    return alpha(GUTTER + (255,), a[0] if v < 2.25 else a[1])


def kerb_strip(side, L=32, paint=None, low=False, seed=0):
    """A length of kerb, L px, laid along a sidewalk's edge with the road on its `side` ('n', 's', 'e', 'w'): the
    edge itself runs 5 px from the sidewalk side of the sprite (3 px of face and gutter beyond it)."""
    def make():
        horiz = side in 'ns'
        W, H = (L, 8) if horiz else (8, L)
        cv = Cv(W, H)
        rng = random.Random(9300 + seed)
        lit = side in 'nw'
        chipped = VNoise(max(L, 16), 16, 3, rng)

        def f(x, y, cur):
            u, t = (x, y) if horiz else (y, x)
            v = t - 5 if side in 'se' else 3 - t
            worn = paint is not None and chipped(u, t) > 0.7 and -4.5 <= v < 1.5
            c = kerb_col(v, lit, None if worn else paint, low)
            if c is not None and -4.5 <= v < 1.5 and u % 32 < 0.5 and not low:
                c = dk(c, 0.34)                                            # between two stones
            return c
        px_paint(cv, 0, 0, W, H, f)
        for _ in range(0 if low else L // 11):                             # nicks in its edge
            u, v = rng.uniform(1, L - 1), rng.uniform(-1.4, -0.2)
            t = v + 5 if side in 'se' else 3 - v
            cv.dot(*((u, t) if horiz else (t, u)), dk(KERB[1], 0.2))
        return cv
    return make


def kerb_corner(R, q):
    """The corner of a sidewalk rounded R px, the road toward `q` of it ('se': south and east...): a square R + 4 px
    wide laid over the corner, the slabs inside the arc, the kerb along it, the asphalt beyond (both from the map's
    own tiles: the square is aligned on them by where the builder lays it)."""
    qx, qy = (1 if 'e' in q else -1), (1 if 's' in q else -1)
    N = R + 4

    def make():
        cv = Cv(N, N)

        def f(x, y, cur):
            dx, dy = (x - R if qx > 0 else x - 4), (y - R if qy > 0 else y - 4)   # from the corner point, world
            ex, ey = dx * qx + R, dy * qy + R                              # from the arc's centre, toward the road
            d = math.hypot(ex, ey)
            v = d - R
            if v < -5:
                return tile_px('sidewalk', dx, dy)
            if v >= 3:
                return tile_px('asphalt', dx, dy)
            lit = (ex * qx * LX + ey * qy * LY) / max(d, 1e-6) > 0.12
            c = kerb_col(v, lit)
            if v >= 1.5:
                return mix(tile_px('asphalt', dx, dy), GUTTER + (255,), c[3] / 255.0)
            if v >= -4.5 and (math.atan2(ey, ex) * R + 16) % 32 < 0.5:
                c = dk(c, 0.34)
            return c
        px_paint(cv, 0, 0, N, N, f)
        return cv
    return make


def p_kerb_in():
    """Where two kerbs meet round a corner of road (the sidewalk on three sides of it): the stone that fills it."""
    cv = Cv(6, 6)
    px_paint(cv, 0.5, 0.5, 5.5, 5.5, lambda x, y, cur: KERB[2])
    return cv


def kerb_ramp(side):
    """The apron of a dropped kerb at a crossing, 2 m of sidewalk sloping down to the road on its `side` ('n' / 's'):
    brushed concrete scored across the slope, a flare at each end."""
    def make():
        W, H = 64, 20
        cv = Cv(W, H)
        rng = random.Random(9340 + ord(side))
        base = dk(FL_SIDEWALK, 0.1) if side == 's' else lt(FL_SIDEWALK, 0.08)

        def f(x, y, cur):
            v = (H - y) if side == 's' else y                              # px up the slope from the kerb
            fl = min(x, W - x)
            if fl < 10 and v > fl * 1.9 + 1:
                return None                                                # beyond a flare
            c = base
            if fl < 10:
                c = lt(FL_SIDEWALK, 0.05) if (x < W / 2) == (side == 's') else dk(FL_SIDEWALK, 0.16)
            elif v % 4 < 0.5:
                c = dk(c, 0.16)                                            # scored
            if v >= H - 0.5 or (fl >= 10 and abs(fl - 10) < 0.5):
                c = dk(FL_SIDEWALK, 0.26)                                  # its joints
            return shift(c, rng.randint(-3, 3))
        px_paint(cv, 0, 0, W, H, f)
        return cv
    return make


def road_text(word, seed, col=None, ky=6, kx=2):
    """A word stencilled on the lane, its letters drawn out long as they are on a road (read by who drives over it:
    the builder turns it). col: its paint (white unless told); ky: px a row of the stencil (4: a word painted in a
    parking bay, read from the sidewalk, not drawn out); kx: px a column (3: a lane's number, bold enough to read)."""
    gap = 3
    step = 5 * kx + gap
    W, H = len(word) * step - gap + 2, 7 * ky + 2

    def mask(x, y):
        gx, gy = x - 1, y - 1
        n = int(gx // step)
        if gx < 0 or n >= len(word) or gx - n * step >= 5 * kx or not 0 <= gy < 7 * ky:
            return False
        row = FONT[word[n]][int(gy // ky)]
        return row[int((gx - n * step) // kx)] == '#'
    return lambda: road_mark(W, H, mask, seed, col or ROAD_WHITE)


def p_road_arrow():
    """A lane arrow, 3 m, straight on (toward +x)."""
    def mask(x, y):
        v = abs(y - 14)
        return (2 <= x < 60 and v < 2.6) or (56 <= x < 94 and v < (94 - x) * 0.3)
    return road_mark(96, 28, mask, 9351)


def p_road_arrow_turn():
    """A lane arrow that turns right (along +x, then to +y)."""
    def mask(x, y):
        return (2 <= x < 54 and abs(y - 9) < 2.6) or (abs(x - 51.5) < 2.6 and 9 <= y < 22) or (20 <= y < 39 and abs(x - 51.5) < (39 - y) * 0.56)
    return road_mark(66, 40, mask, 9352)


def road_hatch(W, H, seed):
    """A box hatched in yellow: keep clear."""
    def mask(x, y):
        e = min(x - 1, y - 1, W - 1 - x, H - 1 - y)
        return e >= 0 and (e < 2.6 or (x + y) % 15 < 3.2)
    return lambda: road_mark(W, H, mask, seed, ROAD_YELLOW)


def oil_stain(W, H, seed):
    """What engines drip in the same bay night after night: a stain soaked into the ground, nearly black in its
    middle, paler rings round it where it spread, a few drops beside it (flat steps: no gradient)."""
    def make():
        cv = Cv(W, H)
        rng = random.Random(seed)
        rag = VNoise(max(W, 16), max(H, 16), 4, rng)
        m = min(W, H)
        blobs = [(rng.uniform(0.3, 0.7) * W, rng.uniform(0.36, 0.64) * H, rng.uniform(0.2, 0.33) * m) for _ in range(3)]

        def f(x, y, cur):
            k = max(1 - math.hypot(x - bx, y - by) / (br * (0.7 + rag(x, y) * 0.7)) for (bx, by, br) in blobs)
            if k <= 0:
                return None
            return (17, 16, 23, 150) if k > 0.55 else (22, 21, 30, 96) if k > 0.24 else (27, 25, 35, 50)
        px_paint(cv, 1, 1, W - 1, H - 1, f)
        for _ in range(6):
            cv.dot(rng.uniform(2, W - 2), rng.uniform(2, H - 2), (20, 19, 27, 110))
        return cv
    return make


def p_skid_marks():
    """Rubber laid by two locked wheels, 3.4 m of it (the car going toward +x): heavy where the brakes bit, thinner
    and broken where the tyres skipped, drifting a little to one side."""
    W, H = 110, 54
    cv = Cv(W, H)
    rng = random.Random(9382)
    skip = VNoise(W, H, 3, rng)

    def f(x, y, cur):
        u = x / W
        for y0 in (5.0, 43.0):
            if abs(y - (y0 + 5.0 * u * u)) < 1.7 - 0.5 * u and 2 <= x < W - 2:
                if skip(x, y * 3) > 0.42 + 0.4 * (1 - u) or rng.random() < 0.04:
                    return None
                return (19, 18, 25, 150 if u > 0.55 else 104 if u > 0.25 else 58)
        return None
    px_paint(cv, 0, 0, W, H, f)
    return cv


def iron_cover(W, H, seed, round_=False, slots=False):
    """A cast iron cover let into the ground, flat: its frame, the tread worn bright on its ribs (or a drain's slots),
    rust in the hollows."""
    def make():
        cv = Cv(W, H)
        iron = ramp('#32343c', 0.45, 0.22, 0.35)
        rng = random.Random(seed)

        def f(x, y, cur):
            if round_:
                d = W / 2 - math.hypot(x - W / 2, y - H / 2)
            else:
                d = min(x, y, W - x, H - y)
            if d < 0.5:
                return None
            if d < 1.5:
                return shade(iron, 0.62 if (x + y) < (W + H) / 2 else 0.3)     # the frame, lit up and left
            if d < 2.0:
                return hx('#0e1014')
            if slots:
                return hx('#08090c') if (x - 3) % 4 < 2.4 and 2.6 < y < H - 2.6 else shade(iron, 0.5)
            u, v = (x + y) * 0.7071, (x - y) * 0.7071
            return lt(iron[2], 0.08) if (u % 2.4 < 0.8) or (v % 2.4 < 0.8) else dk(iron[2], 0.2)
        px_paint(cv, 0, 0, W, H, f)
        if not slots and not round_:
            for x in (W * 0.3, W * 0.7):
                frect(cv, x - 1, H / 2 - 0.5, x + 1, H / 2 + 0.5, hx('#08090c'))   # the key holes
        if round_:
            fill_shape(cv, W / 2, H / 2, 1.3, 1.3, lambda u, v, L: shade(iron, 0.3 + L * 0.6), kind='rect', corner=0.2, bevel=0.5)
        smudge(cv, rng, 3, (1, 1, W - 1, H - 1), (0.6, 1.4), 0.3, hx('#6a3a1c'))
        if slots:
            for _ in range(3):                                             # what the gutter washed onto it
                cv.dot(rng.uniform(3, W - 3), rng.uniform(3, H - 3), rng.choice((hx('#6a5a30'), hx('#3a4a2a'), hx('#8a8474'))))
        return cv
    return make


def road_patch(W, H, seed, col='#474a54', a=176):
    """A patch let into the road where it was dug: sawn square, its joint sealed with tar, darker than the old
    asphalt round it (or paler: an old one)."""
    def make():
        cv = Cv(W, H)
        rng = random.Random(seed)
        rag = VNoise(W, H, 5, rng)
        base = hx(col)

        def f(x, y, cur):
            e = min(x, y, W - x, H - y) + (rag(x, y) - 0.5) * 1.6
            if e < 0.8:
                return None
            if e < 2.0:
                return (30, 28, 40, 150)                                   # the tar along the cut
            return alpha(shift(base, rng.randint(-5, 5)), a)
        px_paint(cv, 0, 0, W, H, f)
        return cv
    return make


def road_crack(W, H, seed):
    """A crack across the lane sealed with tar: a dark shining thread that wanders and forks."""
    def make():
        cv = Cv(W, H)
        rng = random.Random(seed)
        tar = lambda k, L, s, i, t: (26, 24, 36, 205) if k < 0.7 else (30, 28, 40, 120)

        def run(x, y, a, n, r):
            pts = [(x, y)]
            for _ in range(n):
                a += rng.uniform(-0.45, 0.45)
                x, y = x + math.cos(a) * 6, y + math.sin(a) * 6
                if not (2 < x < W - 2 and 2 < y < H - 2):
                    break
                pts.append((x, y))
            if len(pts) > 1:
                fill_capsule(cv, pts, r, tar)
            return pts
        a0 = math.atan2(H * 0.5, W) * rng.choice((-1, 1))
        main = run(3, H * (0.25 if a0 > 0 else 0.75), a0, 40, 0.9)
        for k in (len(main) // 3, 2 * len(main) // 3):
            run(*main[k], a0 + rng.choice((-1, 1)) * rng.uniform(0.7, 1.2), rng.randint(2, 5), 0.6)
        return cv
    return make


def p_tree_grate():
    """The cast iron grate round a street tree, 1.25 m square in the sidewalk: slots fanning out from the hole the
    trunk comes up through, the earth in it, the seam where its two halves meet."""
    S = 40
    cv = Cv(S, S)
    iron = ramp('#34363e', 0.45, 0.22, 0.35)
    rng = random.Random(9361)

    def f(x, y, cur):
        dx, dy = x - S / 2, y - S / 2
        d, e = math.hypot(dx, dy), min(x, y, S - x, S - y)
        if e < 0.5:
            return None
        if e < 2:
            return shade(iron, 0.62 if x + y < S else 0.3)
        if d < 7.5:
            return shift(hx('#3a2a1c'), rng.randint(-6, 6))                # the earth
        if d < 8.5 or abs(x - S / 2) < 0.5:
            return dk(iron[1], 0.3)
        band = int((d - 9.5) // 3.2)
        slot = 0 <= band < 3 and (d - 9.5) % 3.2 < 2.0 and e > 3.5 and ((math.atan2(dy, dx) / math.pi + 1) * (5 + band * 3) + band * 0.5) % 1 < 0.7
        return hx('#17120e') if slot else shade(iron, 0.52 if dx + dy < 0 else 0.42)
    px_paint(cv, 0, 0, S, S, f)
    smudge(cv, rng, 4, (3, 3, S - 3, S - 3), (1.0, 2.2), 0.3, hx('#5a3a1e'))
    return cv


def p_trench():
    """The works' trench in the parking lane, 4.7 m: the asphalt sawn and broken out, its edge crumbling, the earth
    walls (the far ones lit), an old iron main along the bottom with a new collar on it, water standing."""
    W, H = 150, 44
    cv = Cv(W, H)
    rng = random.Random(9371)
    rag = VNoise(W, H, 6, rng)
    earth = ramp('#5a4634', 0.5, 0.26, 0.28)
    pipe = ramp('#7a4a34', 0.5, 0.26, 0.3)

    def f(x, y, cur):
        e = min(x, y, W - x, H - y) + (rag(x, y) - 0.5) * 3.0
        if e < 1:
            return None
        if e < 2.6:
            return shift(hx('#7a7c86'), rng.randint(-8, 8))                # the broken edge of the asphalt
        if e < 7:                                                          # the walls: the ones that face the light
            return shade(earth, 0.82 if (y > H / 2 and H - y < x and H - y < W - x) or (x > W / 2 and W - x <= min(y, H - y)) else 0.3)
        if abs(y - H * 0.56) < 3.2:                                        # the main
            c = shade(pipe, 0.9 - abs(y - H * 0.56 + 1.2) / 4.0)
            return shade(STEEL_L, 0.8 - abs(y - H * 0.56 + 1.2) / 4.0) if 70 <= x < 77 else c
        if math.hypot((x - 40) / 16.0, (y - H * 0.56) / 5.0) < 1:
            return hx('#1c2430')                                           # water
        return shift(earth[0], rng.randint(-5, 5))
    px_paint(cv, 0, 0, W, H, f)
    for _ in range(26):                                                    # lumps of asphalt and stones fallen in
        cv.dot(rng.uniform(9, W - 9), rng.uniform(9, H - 9), rng.choice((hx('#6a6c76'), earth[2], hx('#8a8474'))))
    return cv


def p_spoil():
    """What came out of the trench, heaped beside it: a mound of earth, lit on its near side, lumps of asphalt and
    stones in it, crumbs fallen round its foot."""
    W, H = 46, 34
    cv = Cv(W, H)
    rng = random.Random(9372)
    earth = ramp('#6a5440', 0.5, 0.26, 0.26)
    rag = VNoise(W, H, 5, rng)
    lump = VNoise(W, H, 3, rng)

    def heap(x, y, cur):
        dx, dy = (x - W / 2) / (W / 2 - 3.0), (y - H / 2) / (H / 2 - 3.0)
        d = math.hypot(dx, dy) + (rag(x, y) - 0.5) * 0.45
        if d > 1.0:
            return None
        k = 0.5 - 0.42 * (dx * 0.6 + dy * 0.8) * d + (lump(x, y) - 0.5) * 0.5 + (1 - d) * 0.22   # higher: lighter
        return tone(earth, max(0.0, min(1.0, k)))
    px_paint(cv, 0, 0, W, H, heap)
    for _ in range(9):
        x, y = rng.uniform(8, W - 11), rng.uniform(7, H - 9)
        if cv.on(x, y) and cv.on(x + 3, y + 2):
            frect(cv, x, y, x + rng.uniform(2, 3.5), y + rng.uniform(1.5, 2.5), shift(hx('#5a5c68'), rng.randint(-8, 14)))
    for _ in range(14):
        a, d = rng.uniform(0, 6.28), rng.uniform(1.0, 1.12)
        cv.dot(W / 2 + math.cos(a) * d * (W / 2 - 3), H / 2 + math.sin(a) * d * (H / 2 - 3), earth[rng.randint(0, 2)])
    cv.outline(hx('#20160e'))
    return cv


def p_steel_plate():
    """A steel road plate laid over a cut in the road: chequer plate gone dull, four lifting holes, cold asphalt
    packed along its edges."""
    W, H = 70, 50
    cv = Cv(W, H)
    rng = random.Random(9373)
    st = ramp('#4c505c', 0.45, 0.22, 0.35)

    def f(x, y, cur):
        e = min(x, y, W - x, H - y)
        if e < 1:
            return None
        if e < 3:
            return (34, 32, 42, 200)                                       # the cold patch round it
        if e < 4:
            return shade(st, 0.8 if x + y < (W + H) / 2 else 0.25)
        u, v = (x + y) * 0.7071, (x - y) * 0.7071
        return lt(st[2], 0.1) if (u % 5 < 0.9 and v % 5 < 2.6) or (v % 5 < 0.9 and (u + 2.5) % 5 < 2.6) else st[2]
    px_paint(cv, 0, 0, W, H, f)
    for (x, y) in ((9, 9), (W - 9, 9), (9, H - 9), (W - 9, H - 9)):
        fill_shape(cv, x, y, 1.6, 1.0, lambda u, v, L: hx('#0c0c12'))
    smudge(cv, rng, 6, (5, 5, W - 5, H - 5), (2, 5), 0.25, hx('#6a3e22'))
    smudge(cv, rng, 3, (5, 5, W - 5, H - 5), (3, 6), 0.2)
    return cv


def p_viaduct_shadow():
    """The shadow the railway bridge lays across the street."""
    W, H = 164, 320
    cv = Cv(W, H)
    px_paint(cv, 0, 0, W, H, lambda x, y, cur: GUTTER + (112 if 3 <= x < W - 3 else 58,))
    return cv


# ---- what stands on it
LENSES = (   # green, amber, red, from the pole out: (the glass dark, [halo, lens, its hot middle] lit)
    (ramp('#1a5236', 0.5, 0.25, 0.3), (hx('#18d878'), hx('#3cf090'), hx('#dcffe8'))),
    (ramp('#62501a', 0.5, 0.25, 0.3), (hx('#ff9a14'), hx('#ffb82e'), hx('#fff2c4'))),
    (ramp('#641e1c', 0.5, 0.25, 0.3), (hx('#ff2c1c'), hx('#ff4c36'), hx('#ffd4c6'))),
)


def p_traffic_light():
    """Traffic lights on a mast arm, from above: the pole's top (the hitbox, r 4) at the sprite's centre, the arm
    3 m out along +x, two signal heads hung on it over the lane and laid back so that their faces show (as the
    wall signs are): yellow housings, three hooded lenses each, facing -y, red on the driver's left. The emissive
    map holds every lens lit (data/props.js `lamps` cuts it: systems/Signals.js lights one colour at a time)."""
    W, H = 216, 30
    cv, gl = Cv(W, H), Cv(W, H)
    cx, cy = W / 2, H / 2
    m = ramp('#4e5362', 0.5, 0.25, 0.4)
    yel = ramp('#cf9c1c', 0.5, 0.26, 0.3)

    def arm(ly):
        fill_capsule(ly, [(cx + 2, cy), (cx + 101, cy)], 1.5, lambda k, L, s, i, t: shade(m, L))
        fill_capsule(ly, [(cx + 2, cy + 1.6), (cx + 18, cy + 0.4)], 1.2, lambda k, L, s, i, t: shade(m, L - 0.08))   # its gusset
        fill_shape(ly, cx, cy, 4.0, 4.0, lambda u, v, L: shade(m, L))
        fill_shape(ly, cx + 101.5, cy, 1.9, 1.9, lambda u, v, L: shade(m, L))   # the arm's end cap
    layer(cv, arm)
    fill_shape(cv, cx - 0.6, cy - 0.6, 1.5, 1.5, lambda u, v, L: shade(m, 0.55 + L * 0.5))   # the pole's cap
    for hx0 in (cx + 52, cx + 88):
        def head(ly, hx0=hx0):
            for bx in (hx0 - 9, hx0 + 9):
                frect(ly, bx - 0.75, 11.5, bx + 0.75, cy - 1, shade(m, 0.45))   # the brackets to the arm
            fill_shape(ly, hx0, 7.0, 17.0, 5.6, lambda u, v, L: shade(yel, 0.28 + L * 0.62), kind='rect', bevel=1.3, corner=1.6)
        layer(cv, head)
        for k, (off, on) in enumerate(LENSES):
            lx = hx0 - 11 + k * 11
            fill_shape(cv, lx, 7.0, 4.4, 4.4, lambda u, v, L: hx('#131119'))                     # the hood round it
            fill_shape(cv, lx, 7.2, 3.2, 3.2, lambda u, v, L, off=off: shade(off, 0.2 + L * 0.7))   # the glass, dark
            cv.dot(lx - 1.25, 6.0, lt(off[3], 0.45))
            ring(cv, lx, 7.0, 3.4, 4.4, lambda dx, dy, d: hx('#0b0a0f') if dy < -1.0 else None)   # the hood's lip
            fill_shape(gl, lx, 7.2, 3.2, 3.2, lambda u, v, L, on=on: on[2] if u * u + v * v < 2.6 else on[1])
            ring(gl, lx, 7.2, 3.2, 5.3, lambda dx, dy, d, on=on: alpha(on[0], 150 if d < 4.2 else 64))
    return cv, gl


def p_bus_shelter():
    """A bus shelter from above, 4 m by 1.45 m, open along +y (the kerb): a tinted glass roof in a steel frame,
    through it the slatted bench against the back pane and the route map on it, the backlit advertising case that
    closes its left end (a soda bottle: no brand), the gutter along the front."""
    W, H = 128, 48
    cv, fr, gl = Cv(W, H), Cv(W, H), Cv(W, H)
    steel = ramp('#59616f', 0.45, 0.22, 0.4)
    wood = ramp('#8a5c36', 0.5, 0.26, 0.3)
    glass = hx('#8fcfe4')
    frect(cv, 2, 2, W - 2, H - 2, alpha(glass, 62))
    for i in range(8, 40):                                                  # the street's lamps in the glass
        for (x0, a) in ((34, 110), (37, 50), (92, 90)):
            cv.dot(x0 + i * 0.75, H - 5 - i, alpha(hx('#eaf8ff'), a))

    def under(c):
        return mix(c, glass, 0.3)                                           # seen through the roof
    for (y0, y1) in ((9.0, 11.5), (12.5, 15.0), (16.0, 18.5)):              # the bench
        frect(fr, 30, y0, 114, y1, under(shade(wood, 0.62)))
        frect(fr, 30, y0, 114, y0 + 0.5, under(shade(wood, 0.9)))
    for x in (36, 72, 108):
        frect(fr, x - 1, 8.5, x + 1, 19.5, under(shade(steel, 0.35)))
    frect(fr, 46, 3.5, 78, 7.0, under(hx('#e8e4d8')))                       # the route map
    for (y, c) in ((4.5, '#c8402c'), (5.5, '#2a6ab0')):
        frect(fr, 48, y, 76, y + 0.5, under(hx(c)))

    def frame(x, y, c):
        e = min(x - 1, y - 1, W - 1 - x, H - 1 - y)
        return steel[3] if e < 0.5 and (x < 1.5 or y < 1.5) else steel[2] if e < 1.0 else steel[1]
    for (x0, y0, x1, y1) in ((1, 1, W - 1, 3), (1, 1, 3, H - 1), (W - 3, 1, W - 1, H - 1), (1, H - 4, W - 1, H - 1)):
        px_paint(fr, x0, y0, x1, y1, frame)
    frect(fr, 1, H - 4, W - 1, H - 3.5, steel[3])                           # the gutter's lip
    for x in (44, 86):
        frect(fr, x - 0.75, 3, x + 0.75, H - 4, steel[1])                   # the purlins
    case = ramp('#2c303a', 0.45, 0.22, 0.4)
    frect(fr, 4, 5, 12, 43, shade(case, 0.5))                               # the advertising case
    frect(fr, 5.5, 6.5, 10.5, 41.5, hx('#dfeeff'))
    frect(fr, 6.5, 12, 9.5, 30, hx('#c8402c'))                              # its bottle
    frect(fr, 7.25, 8.5, 8.75, 12, hx('#c8402c'))
    frect(fr, 6.5, 18, 9.5, 21, hx('#f4f0e2'))
    frect(fr, 6.5, 33, 9.5, 34, hx('#2a3448'))
    frect(fr, 6.5, 36, 9.5, 37, hx('#2a3448'))
    fr.outline()
    cv.over(fr)
    frect(gl, 5.5, 6.5, 10.5, 41.5, hx('#dfeeff'))
    px_paint(gl, 12.5, 6.5, 16, 41.5, lambda x, y, cur: alpha(hx('#cfe6ff'), 70 if x < 14 else 30))
    return cv, gl


def p_sign_noparking():
    """A no-parking sign on its post, its face laid back to be read from above (as the wall signs are): a white
    disc, the P struck out in red."""
    S = 12
    cv = Cv(S, S)
    fill_shape(cv, S / 2, S / 2, 5, 5, lambda u, v, L: hx('#c8242c') if u * u + v * v > 13.5 else hx('#ece8de'))
    tiny_text(cv, S / 2 - 1.25, S / 2 - 1.75, 'P', hx('#18161e'))
    for k in range(-12, 13):
        cv.dot(S / 2 + k * 0.25, S / 2 + k * 0.25, hx('#c8242c'))
        cv.dot(S / 2 + k * 0.25 + 0.5, S / 2 + k * 0.25, hx('#c8242c'))
    cv.outline()
    return cv


def p_sign_oneway():
    """A one-way sign: a black plate, the white arrow along +x."""
    W, H = 26, 10
    cv = Cv(W, H)
    frect(cv, 1, 1, W - 1, H - 1, hx('#ece8de'))
    frect(cv, 1.5, 1.5, W - 1.5, H - 1.5, hx('#17151d'))
    px_paint(cv, 3, 2, W - 3, H - 2, lambda x, y, cur: hx('#ece8de') if (x < 17 and abs(y - 5) < 1.1) or (16 <= x < 23 and abs(y - 5) < (23 - x) * 0.5) else None)
    cv.outline()
    return cv


def p_sign_speed():
    """A speed limit sign: a white plate, 35."""
    W, H = 12, 14
    cv = Cv(W, H)
    frect(cv, 1, 1, W - 1, H - 1, hx('#17151d'))
    frect(cv, 1.5, 1.5, W - 1.5, H - 1.5, hx('#ece8de'))
    frect(cv, 3, 3, W - 3, 3.5, hx('#5a5860'))
    frect(cv, 3, 4.5, W - 3, 5, hx('#5a5860'))
    tiny_text(cv, 3.25, 7, '35', hx('#17151d'))
    cv.outline()
    return cv


def p_sign_bus():
    """A bus stop's sign: a blue plate, a white bus on it."""
    W, H = 12, 14
    cv = Cv(W, H)
    frect(cv, 1, 1, W - 1, H - 1, hx('#ece8de'))
    frect(cv, 1.5, 1.5, W - 1.5, H - 1.5, hx('#2a56b0'))
    frect(cv, 2.5, 4, W - 2.5, 9, hx('#ece8de'))                             # the bus
    frect(cv, 3, 5, W - 3, 6.5, hx('#2a56b0'))
    for x in (4.5, 6.5):
        frect(cv, x, 5, x + 0.5, 6.5, hx('#ece8de'))
    for x in (3.5, 7.5):
        frect(cv, x, 9, x + 1, 10, hx('#ece8de'))
    frect(cv, 3, 11.5, W - 3, 12, hx('#b8c8e8'))
    cv.outline()
    return cv


def p_sign_works():
    """The works' warning: an orange diamond on a low stand, a man with a shovel on it (near enough)."""
    S = 18
    cv = Cv(S, S)
    c0 = S / 2
    for x in (2.5, S - 3.5):                                                # the stand's feet
        frect(cv, x, c0 - 0.5, x + 1, S - 1.5, shade(STEEL_L, 0.4))
    px_paint(cv, 0, 0, S, S, lambda x, y, cur: (hx('#17151d') if abs(x - c0) + abs(y - c0) > 6.6 else hx('#f08a1c')) if abs(x - c0) + abs(y - c0) < 7.6 else None)
    fill_shape(cv, c0 - 0.5, c0 - 3.2, 1.0, 1.0, lambda u, v, L: hx('#17151d'))    # his head
    frect(cv, c0 - 1.25, c0 - 2.25, c0 + 0.25, c0 + 1.5, hx('#17151d'))            # him
    line(cv, c0 + 0.25, c0 - 1.5, c0 + 3.0, c0 + 2.0, hx('#17151d'))               # the shovel
    frect(cv, c0 - 3.5, c0 + 2.0, c0 + 3.5, c0 + 2.75, hx('#17151d'))              # the heap
    cv.outline()
    return cv


def p_bollard():
    """A steel bollard from above, 22 cm: its domed cap, a yellow band round it."""
    S = 9
    cv = Cv(S, S)
    st = ramp('#484c5a', 0.5, 0.25, 0.4)
    fill_shape(cv, S / 2, S / 2, 3.5, 3.5, lambda u, v, L: hx('#d8b030') if 4.4 < u * u + v * v < 8.4 else shade(st, L))
    cv.dot(3.5, 3.5, st[3])
    cv.outline()
    return cv


def p_street_tree():
    """A young street tree from above, its crown 2.6 m across (the trunk, r 4, under its middle): clumps of leaves in
    three tiers, the lower ones in shade, the top ones in the lamps' light, flat tones (no dither), twigs of sky
    between the clumps at its rim."""
    S = 88
    c0 = S / 2
    cv = Cv(S, S)
    rng = random.Random(9461)
    greens = ramp('#34803c', 0.62, 0.34, 0.26)
    for tier, (n, rr, dist, lo, hi) in enumerate(((12, 12.5, 27.0, 0.0, 0.5), (9, 12.0, 16.0, 0.12, 0.74), (5, 11.5, 5.5, 0.3, 0.98))):
        def clumps(ly, tier=tier, n=n, rr=rr, dist=dist, lo=lo, hi=hi):
            for i in range(n):
                a = i * 2 * math.pi / n + rng.uniform(-0.22, 0.22) + tier * 0.3
                d = dist + rng.uniform(-2.5, 2.5)
                r = rr + rng.uniform(-2.0, 1.5)
                fill_shape(ly, c0 + math.cos(a) * d - tier * 1.5, c0 + math.sin(a) * d - tier * 2.0, r, r * rng.uniform(0.82, 1.0),
                           lambda u, v, L: tone(greens, lo + L * (hi - lo) * 1.25), ang=rng.uniform(0, 3.1))
        layer(cv, clumps, hx('#0e2616'))
    for _ in range(120):                                                    # leaves catching the light, holes of shade
        x, y = rng.uniform(6, S - 6), rng.uniform(6, S - 6)
        c = cv.get(x, y)
        if c[3] and c != hx('#0e2616'):
            lit = (x - c0) + (y - c0) < rng.uniform(-10, 30)
            cv.dot(x, y, lt(c, 0.3) if lit else dk(c, 0.3))
    return cv


def p_arrow_board():
    """The works' arrow board on its trailer, the board laid back to be read (as the signs are): a black panel of
    amber lamps, three chevrons pointing along -x that come on one after the other (systems/Signals.js; the emissive
    map holds them all), the trailer's two wheels and its drawbar showing under it."""
    W, H = 78, 42
    cv, gl = Cv(W, H), Cv(W, H)
    tr = ramp('#d8a21c', 0.5, 0.26, 0.3)

    def trailer(ly):
        for y in (4.0, H - 4.0):
            fill_shape(ly, W / 2, y, 5.0, 2.4, lambda u, v, L: shade(RUBBER, 0.3 + L * 0.5), kind='rect', corner=1.0, bevel=0.8)
        frect(ly, W / 2 - 14, 7, W / 2 + 14, H - 7, shade(tr, 0.45))
        fill_capsule(ly, [(W / 2 + 14, H / 2), (W - 2.5, H / 2)], 1.3, lambda k, L, s, i, t: shade(STEEL_L, L))   # the drawbar
    layer(cv, trailer)

    def board(ly):
        fill_shape(ly, W / 2 - 4, H / 2, 31, 15, lambda u, v, L: shade(ramp('#1c1c24', 0.4, 0.2, 0.5), 0.3 + L * 0.6), kind='rect', bevel=1.2, corner=1.0)
    layer(cv, board)
    amber = (hx('#ff9a14'), hx('#ffbe3a'), hx('#fff2c4'))
    for k in range(3):
        tip = 13 + k * 19
        for i in range(-3, 4):
            x, y = tip + abs(i) * 3.4, H / 2 + i * 3.6
            fill_shape(cv, x, y, 1.5, 1.5, lambda u, v, L: shade(ramp('#5a4612', 0.5, 0.25, 0.3), 0.3 + L * 0.6))
            fill_shape(gl, x, y, 1.5, 1.5, lambda u, v, L: amber[2] if u * u + v * v < 0.8 else amber[1])
            ring(gl, x, y, 1.5, 2.6, lambda dx, dy, d: alpha(amber[0], 120))
    return cv, gl


def p_compressor():
    """A towed air compressor from above, 2.2 m: a yellow sheet steel canopy with its lifting eye and exhaust cap,
    louvres along the far side, two wheels under their arches, the drawbar and its jockey wheel, the air hose coiled
    on its hook and trailing off."""
    W, H = 72, 40
    cv = Cv(W, H)
    yel = ramp('#d8a21c', 0.5, 0.26, 0.3)
    rng = random.Random(9471)

    def under(ly):
        for y in (5.0, H - 5.0):
            fill_shape(ly, 30, y, 6.0, 2.6, lambda u, v, L: shade(RUBBER, 0.3 + L * 0.5), kind='rect', corner=1.2, bevel=0.8)
        fill_capsule(ly, [(52, H / 2), (W - 3, H / 2)], 1.4, lambda k, L, s, i, t: shade(STEEL_L, L))
        fill_shape(ly, W - 9, H / 2 + 3.5, 1.8, 1.8, lambda u, v, L: shade(RUBBER, 0.3 + L * 0.5))
        fill_capsule(ly, [(8, H - 8), (3, H - 4), (5, H - 2), (16, H - 2.5)], 0.9, lambda k, L, s, i, t: shade(ramp('#a82a22', 0.5, 0.25, 0.3), L))   # the hose
    layer(cv, under)

    def body(ly):
        fill_shape(ly, 29, H / 2, 26, 13, lambda u, v, L: shade(yel, 0.2 + L * 0.72), kind='rect', bevel=3.0, corner=3.0)
    layer(cv, body)
    for x in range(8, 50, 3):                                               # the louvres
        frect(cv, x, 9, x + 1.5, 12, dk(yel[1], 0.35))
    frect(cv, 3.5, H / 2 - 9, 4.5, H / 2 + 9, dk(yel[1], 0.2))              # the doors' seam and handles
    frect(cv, 28.5, 8, 29, H - 8, dk(yel[1], 0.3))
    fill_shape(cv, 40, H / 2 + 4, 2.4, 2.4, lambda u, v, L: shade(STEEL, 0.2 + L * 0.7))    # the exhaust's cap
    fill_shape(cv, 22, H / 2, 1.6, 1.6, lambda u, v, L: shade(STEEL_L, 0.3 + L * 0.7))      # the lifting eye
    fill_shape(cv, 22, H / 2, 0.7, 0.7, lambda u, v, L: hx('#17151d'))
    frect(cv, 9, H / 2 + 6, 20, H / 2 + 9, hx('#17151d'))                   # its plate (no name)
    frect(cv, 10, H / 2 + 7, 19, H / 2 + 7.5, hx('#e8e4d6'))
    smudge(cv, rng, 7, (4, 8, 54, H - 8), (1.5, 4.0), 0.22)
    smudge(cv, rng, 5, (4, 8, 54, H - 8), (0.6, 1.4), 0.5, hx('#7a4a26'))   # rust where the paint went
    return cv


def p_barricade():
    """A works barricade from above, 2 m: two boards striped orange and white on steel legs, a flashing amber lamp
    on each end (the emissive map: both; systems/Signals.js blinks them)."""
    W, H = 66, 12
    cv, gl = Cv(W, H), Cv(W, H)
    for x in (7.0, W - 7.0):
        frect(cv, x - 1.0, 1, x + 1.0, H - 1, shade(STEEL_L, 0.32))
        frect(cv, x - 1.0, 1, x + 1.0, 1.5, shade(STEEL_L, 0.7))
    org, white = ramp('#f07a1c', 0.5, 0.26, 0.3), ramp('#ece8de', 0.4, 0.2, 0.2)

    def plank(x, y, cur):
        r = org if int((x + y * 1.2) // 5) % 2 == 0 else white
        return shade(r, 0.84 if y < 4.5 else 0.3 if y >= 7.5 else 0.62)
    px_paint(cv, 1, 3.5, W - 1, 8.5, plank)
    amber = (hx('#ff9a14'), hx('#ffbe3a'), hx('#fff2c4'))
    for x in (7.0, W - 7.0):
        fill_shape(cv, x, 6.0, 2.0, 2.0, lambda u, v, L: shade(ramp('#8a6a16', 0.5, 0.25, 0.4), 0.3 + L * 0.7))
        fill_shape(gl, x, 6.0, 2.0, 2.0, lambda u, v, L: amber[2] if u * u + v * v < 1.4 else amber[1])
        ring(gl, x, 6.0, 2.0, 3.6, lambda dx, dy, d: alpha(amber[0], 130 if d < 2.8 else 60))
    smudge(cv, random.Random(9481), 6, (2, 4, W - 2, 8), (0.6, 1.5), 0.4, hx('#8a8a92'))
    cv.outline()
    return cv, gl


def p_viaduct():
    """The railway over the street, from above (hung high: it fades over him as he goes under): a single-track
    through bridge 4.6 m wide spanning the road from wall to wall along y. Two riveted plate girders, a timber
    walkway inside each, the sleepers and the two rails on their stringers, the street seen between the sleepers."""
    W, H = 148, 324
    cv = Cv(W, H)
    steel = ramp('#3c4350', 0.5, 0.25, 0.35)
    tim = ramp('#54402e', 0.5, 0.25, 0.3)
    rail = ramp('#8e939c', 0.5, 0.25, 0.4)
    rails = (W / 2 - 23, W / 2 + 23)

    def deck(x, y, cur):
        for g0 in (2, W - 13):
            if g0 <= x < g0 + 11:
                t = x - g0
                c = shade(steel, 0.82 if t < 1.5 else 0.25 if t >= 9.5 else 0.5)
                if y % 16 < 1.0:
                    c = dk(c, 0.28)                                        # a stiffener
                elif (y % 16 - 8.25) ** 2 + (t % 4 - 2.0) ** 2 < 0.3:
                    c = lt(c, 0.25)                                        # rivets
                return c
        if 13 <= x < 28 or W - 28 <= x < W - 13:
            c = shade(tim, 0.62 if int(x // 5) % 2 else 0.5)               # the walkway's boards
            return dk(c, 0.3) if x % 5 < 0.5 or (y + int(x // 5) * 13) % 41 < 0.5 else c
        if 28 <= x < 31 or W - 31 <= x < W - 28:
            return shade(steel, 0.38)
        if y % 16 < 7:
            return shade(tim, 0.72 if y % 16 < 1 else 0.3 if y % 16 >= 6 else 0.5)   # a sleeper
        if min(abs(x - r) for r in rails) < 2.5:
            return shade(steel, 0.32)                                      # the stringer under a rail
        if y % 64 > 55 and abs((x - 31) % 43 - (y % 64 - 55) * 4.7) < 1.0:
            return shade(steel, 0.28)                                      # a brace, now and then
        return None
    px_paint(cv, 0, 0, W, H, deck)
    for r in rails:
        frect(cv, r - 1.5, 0, r + 1.5, H, shade(rail, 0.3))
        frect(cv, r - 0.75, 0, r + 0.5, H, shade(rail, 0.92))              # the rail's head, worn bright
    rng = random.Random(9491)
    smudge(cv, rng, 40, (2, 2, W - 2, H - 2), (2, 6), 0.3, hx('#6a3e22'))  # rust
    smudge(cv, rng, 24, (30, 2, W - 30, H - 2), (3, 7), 0.3)               # oil down the middle
    cv.outline()
    return cv


def p_gantry_sign():
    """The freeway's sign over the end of the street, from above (hung high): a steel truss from one sidewalk to
    the other (along x), its two green panels laid back toward who drives up to them so that they are read:
    FREEWAY and an arrow, TOLL 1 MILE; a lamp bar under each."""
    W, H = 310, 40
    cv = Cv(W, H)
    st = ramp('#6a7080', 0.5, 0.25, 0.4)
    green = ramp('#1c6a4c', 0.5, 0.26, 0.25)
    white = hx('#ece8de')

    def truss(x, y, cur):
        if not 1 <= y < 8:
            return None
        if y < 2 or y >= 7:
            return shade(st, 0.85 if y < 2 else 0.3)
        return shade(st, 0.55) if abs((x % 12) - (y - 2) * 2.4) < 1.1 or abs((x % 12) - 12 + (y - 2) * 2.4) < 1.1 else None
    px_paint(cv, 4, 0, W - 4, 9, truss)
    for x in (4.5, W - 4.5):
        fill_shape(cv, x, 4.5, 3.6, 3.6, lambda u, v, L: shade(st, L), kind='rect', corner=0.8, bevel=1.2)   # the posts' tops
    for (x0, x1, words) in ((34, 146, ('FREEWAY',)), (164, 276, ('TOLL', '1 MILE'))):
        px_paint(cv, x0, 9, x1, 38, lambda x, y, cur, x0=x0, x1=x1: white if min(x - x0, x1 - x, y - 9, 38 - y) < 1 or 2 <= min(x - x0, x1 - x, y - 9, 38 - y) < 3 else shade(green, 0.62 if y < 24 else 0.5))
        if len(words) == 1:
            for i, ch in enumerate(words[0]):
                for gx, gy in inked(FONT[ch]):
                    cv.set(x0 + 9 + i * 6 + gx, 14 + gy * 2, white)
                    cv.set(x0 + 9 + i * 6 + gx, 15 + gy * 2, white)
            px_paint(cv, x0 + 62, 13, x0 + 104, 34, lambda x, y, cur, x0=x0: white if (abs(x - x0 - 86) < 3 and 19 <= y < 32) or (13 <= y < 21 and abs(x - x0 - 86) < (y - 12) * 1.25) else None)
        else:
            for k, wd in enumerate(words):
                for i, ch in enumerate(wd):
                    for gx, gy in inked(FONT[ch]):
                        cv.set(x0 + 12 + k * 40 + i * 6 + gx, 20 + gy, white)
        frect(cv, x0 + 6, 38, x1 - 6, 39, shade(st, 0.4))                   # the lamp bar
        for x in range(x0 + 16, x1 - 8, 26):
            frect(cv, x, 37.5, x + 4, 39, hx('#fff0c8'))
    cv.outline()
    return cv


def r_rail_bed():
    """A metre of the railway on its embankment (laid end to end along y, toward the bridge over the street):
    ballast between two low walls, the sleepers, the two rails."""
    W, H = 148, 32
    cv = Cv(W, H)
    rng = random.Random(9495)
    tim = ramp('#54402e', 0.5, 0.25, 0.3)
    rail = ramp('#8e939c', 0.5, 0.25, 0.4)
    wall = ramp('#6e6c74', 0.45, 0.22, 0.3)
    stones = (hx('#6a6660'), hx('#7a766e'), hx('#5a5650'), hx('#86827a'))

    def bed(x, y, cur):
        if x < 13 or x >= W - 13:
            t = x if x < 13 else x - (W - 13)
            return shade(wall, 0.8 if t < 1.5 else 0.28 if t >= 11 else 0.55)
        if 31 <= x < W - 31 and y % 16 < 7:
            return shade(tim, 0.72 if y % 16 < 1 else 0.3 if y % 16 >= 6 else 0.5)
        return shift(rng.choice(stones), rng.randint(-6, 6))
    px_paint(cv, 0, 0, W, H, bed)
    for r in (W / 2 - 23, W / 2 + 23):
        frect(cv, r - 1.5, 0, r + 1.5, H, shade(rail, 0.3))
        frect(cv, r - 0.75, 0, r + 0.5, H, shade(rail, 0.92))
    return cv


GROUP = 'props'
SPRITES = {
    'roof/rail_bed': (lambda: r_rail_bed(), (148, 32), 'fine'),
    'kerb_in': (p_kerb_in, (6, 6), 'fine floor'),
    'kerb_ramp_n': (kerb_ramp('n'), (64, 20), 'fine floor'),
    'kerb_ramp_s': (kerb_ramp('s'), (64, 20), 'fine floor'),
    'zebra_a': (lambda: road_mark(96, 20, lambda x, y: 0.5 <= x < 95.5 and 1 <= y < 19, 9311), (96, 20), 'fine floor'),
    'zebra_b': (lambda: road_mark(96, 20, lambda x, y: 0.5 <= x < 95.5 and 1 <= y < 19, 9312, wear=ROAD_WEAR + 0.3), (96, 20), 'fine floor'),
    'stop_line': (lambda: road_mark(14, 80, lambda x, y: 1 <= x < 13 and 1 <= y < 79, 9313), (14, 80), 'fine floor'),
    'centre_double': (lambda: road_mark(96, 8, lambda x, y: 0.5 <= y < 3 or 5 <= y < 7.5, 9314, ROAD_YELLOW, ROAD_WEAR_RUN), (96, 8), 'fine floor'),
    'park_tee': (lambda: road_mark(24, 60, lambda x, y: abs(x - 12) < 1.6 or y >= 56.8, 9315), (24, 60), 'fine floor'),
    'road_arrow': (p_road_arrow, (96, 28), 'fine floor'),
    'road_arrow_turn': (p_road_arrow_turn, (66, 40), 'fine floor stock'),
    'road_bus': (road_text('BUS', 9321), (38, 44), 'fine floor'),
    'road_stop': (road_text('STOP', 9322), (51, 44), 'fine floor'),
    'road_slow': (road_text('SLOW', 9323), (51, 44), 'fine floor'),
    'road_keep': (road_text('KEEP', 9324), (51, 44), 'fine floor'),
    'road_clear': (road_text('CLEAR', 9325), (64, 44), 'fine floor'),
    'road_only': (road_text('ONLY', 9326), (51, 44), 'fine floor stock'),
    'hatch_yard': (road_hatch(192, 60, 9331), (192, 60), 'fine floor'),
    'hatch_bay': (road_hatch(120, 56, 9332), (120, 56), 'fine floor'),
    'drain': (iron_cover(26, 10, 9341, slots=True), (26, 10), 'fine floor'),
    'manhole_sq': (iron_cover(24, 18, 9342), (24, 18), 'fine floor'),
    'valve_cap': (iron_cover(8, 8, 9343, round_=True), (8, 8), 'fine floor'),
    'road_patch_a': (road_patch(70, 44, 9344), (70, 44), 'fine floor'),
    'road_patch_b': (road_patch(124, 26, 9345, '#42454e', 190), (124, 26), 'fine floor'),
    'road_patch_c': (road_patch(42, 38, 9346, '#666870', 150), (42, 38), 'fine floor'),
    'road_crack_a': (road_crack(90, 40, 9347), (90, 40), 'fine floor'),
    'road_crack_b': (road_crack(60, 72, 9348), (60, 72), 'fine floor'),
    'tree_grate': (p_tree_grate, (40, 40), 'fine floor'),
    'trench': (p_trench, (150, 44), 'fine floor'),
    'spoil': (p_spoil, (46, 34), 'fine floor'),
    'steel_plate': (p_steel_plate, (70, 50), 'fine floor'),
    'viaduct_shadow': (p_viaduct_shadow, (164, 320), 'fine floor'),
    'hatch_kerb': (road_hatch(104, 56, 9333), (104, 56), 'fine floor'),
    'road_loading': (road_text('LOADING', 9327, ROAD_YELLOW, 4), (90, 30), 'fine floor'),
    'oil_stain_a': (oil_stain(26, 20, 9380), (26, 20), 'fine floor'),
    'oil_stain_b': (oil_stain(40, 26, 9381), (40, 26), 'fine floor'),
    'skid_marks': (p_skid_marks, (110, 54), 'fine floor'),
    'traffic_light': (p_traffic_light, (216, 30), 'fine glow', (8, 8)),
    'bus_shelter': (p_bus_shelter, (128, 48), 'fine glow', (126, 46)),
    'sign_noparking': (p_sign_noparking, (12, 12), 'fine', (5, 5)),
    'sign_oneway': (p_sign_oneway, (26, 10), 'fine', (5, 5)),
    'sign_speed': (p_sign_speed, (12, 14), 'fine', (5, 5)),
    'sign_bus': (p_sign_bus, (12, 14), 'fine', (5, 5)),
    'sign_works': (p_sign_works, (18, 18), 'fine', (14, 14)),
    'bollard': (p_bollard, (9, 9), 'fine', (7, 7)),
    'street_tree': (p_street_tree, (88, 88), 'fine', (8, 8)),
    'arrow_board': (p_arrow_board, (78, 42), 'fine glow', (60, 34)),
    'compressor': (p_compressor, (72, 40), 'fine', (54, 28)),
    'barricade': (p_barricade, (66, 12), 'fine glow', (64, 7)),
    'viaduct': (p_viaduct, (148, 324), 'fine hung'),
    'gantry_sign': (p_gantry_sign, (310, 40), 'fine hung'),
    'lane_dash_long': (lambda: road_mark(96, 6, lambda x, y: 1 <= x < 95 and 1 <= y < 5, 9907, wear=ROAD_WEAR_RUN), (96, 6), 'fine floor'),
    'edge_line': (lambda: road_mark(96, 6, lambda x, y: 1 <= y < 5, 9908, wear=ROAD_WEAR_RUN), (96, 6), 'fine floor'),
    'edge_line_yellow': (lambda: road_mark(96, 6, lambda x, y: 1 <= y < 5, 9909, ROAD_YELLOW, ROAD_WEAR_RUN), (96, 6), 'fine floor'),
    'toll_text': (road_text('TOLL', 9910), (51, 44), 'fine floor'),
    'plaza_line': (lambda: road_mark(128, 6, lambda x, y: 1 <= x < 127 and 1 <= y < 5, 9912, wear=ROAD_WEAR_RUN), (128, 6), 'fine floor stock'),
}
# the kerb stones along a sidewalk's edge, on each of its sides (low: dropped for a drive; _4: four tiles long; red,
# yellow: painted), and round its corners (a bend: a small one)
for _i, _s in enumerate('nsew'):
    _sz = (32, 8) if _s in 'ns' else (8, 32)
    SPRITES['kerb_' + _s] = (kerb_strip(_s, seed=_i), _sz, 'fine floor')
    SPRITES['kerb_%s_low' % _s] = (kerb_strip(_s, low=True, seed=20 + _i), _sz, 'fine floor')
    if _s in 'ns':
        SPRITES['kerb_%s_4' % _s] = (kerb_strip(_s, 128, seed=4 + _i), (128, 8), 'fine floor')
        SPRITES['kerb_%s_red' % _s] = (kerb_strip(_s, paint=KERB_RED, seed=8 + _i), _sz, 'fine floor')
        SPRITES['kerb_%s_yellow' % _s] = (kerb_strip(_s, paint=KERB_YELLOW, seed=12 + _i), _sz, 'fine floor')
for _q in ('ne', 'nw', 'se', 'sw'):
    SPRITES['kerb_corner_' + _q] = (kerb_corner(48, _q), (52, 52), 'fine floor')
    SPRITES['kerb_bend_' + _q] = (kerb_corner(12, _q), (16, 16), 'fine floor')
