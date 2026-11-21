"""ART DECO 1985: generic dressing for any street or road of Sunset Bay (first painted for 2A's toll, meant for
the back road too), nothing tied to one spot: hibiscus, deco planters and lamp, an office, a trooper's car, puddles
with the neon in them. FINE density, real sizes; the art deco's pastels (PASTEL_PINK / PASTEL_TEAL) and its neon
(DECO_PINK / DECO_TEAL) are the toll's."""
import math
import random

from .core import (
    alpha, Cv, fill_shape, frect, hx, layer, light, LX, LY, mix, px_paint, ramp, ring, shade, shift, smudge, VNoise
)
from .palette import CHROME, DECO_PINK, DECO_TEAL, PASTEL_PINK, PASTEL_TEAL, ZINC
from .type import words
from .neon import neon_halo, neon_words
from .vehicles import p_car


def hibiscus_into(cv, cx, cy, r, petal, rng):
    """A hibiscus shrub painted onto cv round (cx, cy), r world px across its leaves: glossy leaves in clumps, five-
    petalled flowers on it (petal: their colour), each with its dark throat and a yellow stamen."""
    leaf = ramp('#2a6a3a', 0.55, 0.3, 0.26)
    ly = Cv(cv.w, cv.h, cv.s)
    for _ in range(int(r * 2.2)):
        a, d = rng.uniform(0, 6.28), r * math.sqrt(rng.random()) * 0.8
        x, y, q = cx + math.cos(a) * d, cy + math.sin(a) * d, rng.uniform(2.2, 3.6)
        fill_shape(ly, x, y, q, q * 0.7, lambda u, v, L: shade(leaf, 0.15 + L * 0.8), ang=rng.uniform(0, 3.14))
    ly.outline(hx('#0c1e14'))
    cv.over(ly)
    pr = ramp(petal, 0.5, 0.26, 0.28)
    fl = Cv(cv.w, cv.h, cv.s)
    for _ in range(max(3, int(r * 0.5))):
        a, d = rng.uniform(0, 6.28), r * math.sqrt(rng.random()) * 0.7
        x, y, s0 = cx + math.cos(a) * d, cy + math.sin(a) * d, rng.uniform(0, 1.26)
        for p in range(5):
            b = s0 + p * 1.2566
            fill_shape(fl, x + math.cos(b) * 1.5, y + math.sin(b) * 1.5, 1.8, 1.2, lambda u, v, L: shade(pr, 0.3 + L * 0.7), ang=b)
        fl.dot(x, y, hx('#7a0a24'))
        fl.dot(x + 0.5, y - 0.5, hx('#ffe060'))
    fl.outline(hx('#3a0a1a'))
    cv.over(fl)


def hibiscus_bush(petal, seed):
    """A hibiscus bush from above, a metre across, in flower (petal: pink, red...): planted in a bed, a verge, a lot."""
    def make():
        cv = Cv(32, 32)
        hibiscus_into(cv, 16, 16, 14, petal, random.Random(seed))
        return cv
    return make


def planter_deco(paint, petal, seed):
    """An art deco planter from above, 1.4 m square: cast concrete in three steps, painted (paint: a pastel), the lit
    edges chipped to the grey, its soil and a hibiscus in flower; it stands at the end of an island, on a forecourt, by
    a door."""
    def make():
        S = 48
        cv = Cv(S, S)
        rng = random.Random(seed)
        pr = ramp(paint, 0.45, 0.22, 0.2)

        def body(ly):
            for (h, L0) in ((22, 0.4), (20, 0.62), (18, 0.5)):
                fill_shape(ly, S / 2, S / 2, h, h, lambda u, v, L, L0=L0: shade(pr, L0 * 0.5 + L * 0.5), kind='rect', corner=2.0, bevel=1.5)
            frect(ly, S / 2 - 16, S / 2 - 16, S / 2 + 16, S / 2 + 16, hx('#3a2a20'))
        layer(cv, body)
        for _ in range(12):
            cv.dot(rng.uniform(4, 9) if rng.random() < 0.5 else rng.uniform(4, S - 4), rng.uniform(4, 9), hx('#a8a49a'))   # chips
        smudge(cv, rng, 6, (3, 3, S - 3, S - 3), (1.5, 3.0), 0.15)
        hibiscus_into(cv, S / 2, S / 2, 15, petal, rng)
        return cv
    return make


def p_police_car():
    """A state trooper's cruiser of the eighties from above, parked (lights off, nobody in it), 4.4 m: the street's
    sedan (p_car: the same body, glass and trim) in white, a pastel teal band across its hood and its trunk lid, the
    light bar across its roof (two red and two blue lenses, dark), the roof number for
    the helicopter, a spotlight on the driver's pillar (-y), a push bar on its nose; dust on its sills. Nose to +x."""
    W, H = 140, 58
    ks = []
    cv, _ = p_car(ramp('#e2e2e6', 0.46, 0.22, 0.12), keep=ks)
    k = ks[0]
    rng = random.Random(10141)
    teal = hx(PASTEL_TEAL)
    s_ = cv.s
    for (i, j) in sorted(k.mask - k.glass):
        x, y = (i + 0.5) / s_, (j + 0.5) / s_
        c = cv.p[i, j]
        paint = abs(c[0] - c[1]) < 14 and abs(c[1] - c[2]) < 14 and c[0] > 120   # the white paint, not the chrome
        if not paint:
            continue
        if 108 <= x < 113 or 12 <= x < 16:
            cv.p[i, j] = mix(c, teal, 0.8)                                 # the livery
    words(cv, 67.0, H / 2 - 5.25, '17', hx('#16141c'), 1.5, centre=True)    # the roof number, read from the air

    def bar(ly):
        fill_shape(ly, 52, H / 2, 3.0, 18.0, lambda u, v, L: shade(CHROME, 0.2 + L * 0.6), kind='rect', corner=1.2, bevel=1.0)
        for (y, col) in ((-13, '#7a1a22'), (-6, '#7a1a22'), (6, '#1a2a6a'), (13, '#1a2a6a')):
            fill_shape(ly, 52, H / 2 + y, 2.0, 2.6, lambda u, v, L, col=col: shade(ramp(col, 0.4, 0.2, 0.4), 0.2 + L * 0.7))
    layer(cv, bar)
    layer(cv, lambda ly: fill_shape(ly, 84, 9.0, 2.0, 1.5, lambda u, v, L: shade(CHROME, 0.3 + L * 0.7)))   # the spotlight

    def push(ly):
        for y in (12.0, H - 12.0):
            frect(ly, W - 4, y - 1.5, W - 1, y + 1.5, hx('#1a1a20'))
        frect(ly, W - 2, 10, W - 1, H - 10, hx('#26262e'))
    layer(cv, push)
    smudge(cv, rng, 10, (4, 2, W - 4, 7), (1.5, 3.0), 0.16, hx('#8a7a5a'))   # road dust on the sills
    smudge(cv, rng, 10, (4, H - 7, W - 4, H - 2), (1.5, 3.0), 0.16, hx('#8a7a5a'))
    return cv


def deco_office(paint, seed, sign='OFFICE'):
    """A small art deco office from above, 5 m by 3 m (its roof: the houses' rule): a parapet in pastel (paint) with a
    streamline corner rounded at its north-east (+x, -y), a stepped fin over its door at the north front (-y), its
    neon name along that front laid back to be read (sign, DECO_TEAL), a glass block skylight lit from inside, an air
    unit, vent pipes, a hatch on the gravel. The emissive map: the sign, the glass blocks."""
    def make():
        W, H = 160, 96
        cv, gl = Cv(W, H), Cv(W, H)
        rng = random.Random(seed)
        pr, grit = ramp(paint, 0.45, 0.22, 0.2), VNoise(W, H, 2, rng)
        R = 24.0

        def inside(x, y, m):
            if x < m or y < 14 + m or x >= W - m or y >= H - m:
                return False
            cx, cy = W - R, 14 + R
            return not (x > cx and y < cy and math.hypot(x - cx, y - cy) > R - m)

        def roof(x, y, cur):
            if not inside(x, y, 0):
                return None
            if not inside(x, y, 4):                                         # the parapet's coping
                return shade(pr, 0.82 if not inside(x, y, 1.5) else 0.6)
            return shift(shade(ramp('#56525e', 0.4, 0.2, 0.2), 0.5), int((grit(x, y) - 0.5) * 20))   # tar and gravel
        px_paint(cv, 0, 0, W, H, roof)
        for k in range(3):                                                  # the eyebrow ledge along its front
            frect(cv, 8, 9 + k * 1.5, W - R - 2, 10 + k * 1.5, shade(pr, 0.9 - k * 0.2))

        def fin(ly):
            for (w, h, L0) in ((16, 14, 0.5), (11, 18, 0.66), (6, 22, 0.8)):
                fill_shape(ly, 40, 14, w, h / 2 + 2, lambda u, v, L, L0=L0: shade(pr, L0 * 0.6 + L * 0.4), kind='rect', corner=1.0, bevel=1.2)
        layer(cv, fin)
        # its name over the front, a dark band with the neon on it
        frect(cv, 60, 1, W - R - 4, 9, hx('#1a1622'))
        neon_words(cv, gl, (60 + W - R - 4) / 2, 1.5, sign, DECO_TEAL, 1.0)
        neon_halo(gl, (58, 0, W - R - 2, 11), DECO_TEAL, 1.6, 80)
        for i in range(4):                                                  # the glass block skylight
            for j in range(3):
                x, y = 92 + i * 7, 46 + j * 7
                frect(cv, x, y, x + 6, y + 6, hx('#a8d8e0') if (i + j) % 2 else hx('#c0e4ea'))
                frect(cv, x, y, x + 6, y + 0.5, hx('#e8f8fa'))
                frect(gl, x + 0.5, y + 0.5, x + 5.5, y + 5.5, alpha(hx('#d8f0ff'), 120))

        def plant(ly):
            fill_shape(ly, 34, 64, 14, 10, lambda u, v, L: shade(ramp('#9a9ea8', 0.45, 0.22, 0.3), 0.25 + L * 0.65), kind='rect', corner=1.5, bevel=1.5)
            ring(ly, 28, 64, 0.0, 6.5, lambda dx, dy, d: hx('#1a1a22') if int(d * 2) % 2 else shade(ramp('#9a9ea8', 0.45, 0.22, 0.3), 0.4))
            for (x, y) in ((130, 80), (140, 70)):
                fill_shape(ly, x, y, 2.4, 2.4, lambda u, v, L: shade(ZINC, 0.2 + L * 0.7))
            fill_shape(ly, 70, 80, 6, 6, lambda u, v, L: shade(ramp('#6a6e78', 0.45, 0.22, 0.3), 0.25 + L * 0.65), kind='rect', corner=1.0, bevel=1.5)
        layer(cv, plant)
        smudge(cv, rng, 14, (6, 18, W - 6, H - 6), (2.0, 6.0), 0.14)
        for _ in range(16):
            cv.dot(rng.uniform(8, W - 8), rng.uniform(20, H - 8), hx('#e8e4dc'))
        cv.outline()
        return cv, gl
    return make


def puddle_neon(W, H, seed):
    """Rain left standing on the asphalt, from above: a film of water darker than the road (the aggregate still
    shows through it), a damp ring round it, and what it mirrors broken up by its ripples: the neon round it (pink,
    teal) and a lamp's warm white as short smeared bands along the road, a few glints on its far edge. Never an ink
    blot: no outline, the road under it."""
    def make():
        cv = Cv(W, H)
        rng = random.Random(seed)
        n, rip = VNoise(W, H, 8, rng), VNoise(W, H, 2, rng)
        bands = [(rng.uniform(0.12, 0.55) * W, rng.uniform(0.3, 0.7) * H, rng.uniform(0.18, 0.34) * W, rng.uniform(1.2, 2.2), c)
                 for c in (DECO_PINK, DECO_TEAL, hx('#ffe6c4'), DECO_PINK)]

        def f(x, y, cur):
            e = ((x - W / 2) / (W / 2)) ** 2 + ((y - H / 2) / (H / 2)) ** 2 + (n(x, y) - 0.5) * 0.9
            if e > 0.86:
                return None
            if e > 0.72:
                return hx('#0c0a16', 54)                                    # the damp ring
            c = hx('#100e1e', 96 if e > 0.4 else 112)                       # the water over the road
            for (sx, sy, ln, hh, col) in bands:
                dy = abs(y - sy) / hh
                if sx <= x < sx + ln and dy < 1.0 and rip(x * 0.6, y * 2.5) > 0.38:
                    k = (1 - dy) * min(1.0, (x - sx) / 4.0, (sx + ln - x) / 4.0)
                    c = alpha(mix(c, col, 0.55 * k), int(c[3] + (190 - c[3]) * k))
            if 0.64 < e <= 0.72 and (x - W / 2) * LX + (y - H / 2) * LY > 0 and rip(x * 0.5, y * 0.5) > 0.6:
                c = hx('#8a8ab8', 120)                                       # a glint on its far edge
            return c
        px_paint(cv, 0, 0, W, H, f)
        return cv
    return make


def p_deco_lamp():
    """An art deco lamp post from above: its fluted collar in pastel teal, a frosted glass globe lit from within (the
    emissive map), its crown cap; the post under it (the hitbox, r 3)."""
    S = 32
    cv, gl = Cv(S, S), Cv(S, S)
    c0 = S / 2
    ring(cv, c0, c0, 7.0, 10.0, lambda dx, dy, d: shade(ramp(PASTEL_TEAL, 0.45, 0.22, 0.2), 0.3 + light(dx / 10, dy / 10) * 0.6) if int(math.atan2(dy, dx) * 4) % 2 else shade(ramp(PASTEL_TEAL, 0.45, 0.22, 0.2), 0.2))
    fill_shape(cv, c0, c0, 7.0, 7.0, lambda u, v, L: mix(hx('#fff4e0'), hx('#d8c8b0'), 0.4 - L * 0.4))
    fill_shape(cv, c0, c0, 2.2, 2.2, lambda u, v, L: shade(CHROME, 0.3 + L * 0.6))
    fill_shape(gl, c0, c0, 7.0, 7.0, lambda u, v, L: hx('#fff8e8'))
    ring(gl, c0, c0, 7.0, 12.0, lambda dx, dy, d: alpha(hx('#ffe8c0'), 90 if d < 9.5 else 40))
    cv.outline()
    return cv, gl


GROUP = 'props'
SPRITES = {
    'hibiscus_bush': (hibiscus_bush('#ff5aa0', 10111), (32, 32), 'fine', (24, 24)),
    'hibiscus_bush_red': (hibiscus_bush('#e8283c', 10112), (32, 32), 'fine', (24, 24)),
    'planter_deco_pink': (planter_deco(PASTEL_PINK, '#e8283c', 10121), (48, 48), 'fine', (44, 44)),
    'planter_deco_teal': (planter_deco(PASTEL_TEAL, '#ff5aa0', 10122), (48, 48), 'fine', (44, 44)),
    'police_car': (p_police_car, (140, 58), 'fine', (136, 54)),
    'deco_office_pink': (deco_office(PASTEL_PINK, 10131), (160, 96), 'fine glow', (156, 80)),
    'deco_office_teal': (deco_office(PASTEL_TEAL, 10132), (160, 96), 'fine glow stock', (156, 80)),
    'deco_lamp': (p_deco_lamp, (32, 32), 'fine glow', (6, 6)),
    'puddle_neon': (puddle_neon(96, 48, 10161), (96, 48), 'fine floor'),
    'puddle_neon_b': (puddle_neon(64, 40, 10162), (64, 40), 'fine floor'),
}
