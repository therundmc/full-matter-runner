"""Rooftop dressing: plant, skylights and stair heads on the flat roofs of the neighbouring buildings, painted
once on the wall layer (render/MapRenderer.js, src/game/data/roofs.js); the lit ones return (sprite, emissive map)."""
import math
import random

from .core import (
    alpha, chrome_bar, Cv, dk, fill_capsule, fill_shape, frect, hx, layer, light, line, lt, mix, mottle, OUTLINE,
    px_paint, ramp, shade, shift, smudge, stud, VNoise
)


GALV = ramp('#8e939c', 0.5, 0.26, 0.36)       # galvanised sheet


def r_ac_unit():
    """Rooftop condenser, 1.4 x 1 m: the fan's blades under its wire grille on the left, the louvred coil panel on the
    right, the service panel's screws and label, rust blooms and soot."""
    W, H = 46, 32
    cv = Cv(W, H)
    body = ramp('#a39c90', 0.5, 0.26, 0.34)
    fill_shape(cv, W / 2, H / 2, W / 2 - 1, H / 2 - 1, lambda u, v, L: shade(body, L), kind='rect', bevel=2.0, corner=1.4)
    mottle(cv, random.Random(871), 5, 6)
    fr = 11.0

    def fan(u, v, L):
        d = math.hypot(u, v)
        if d > fr - 1.2:
            return shade(GALV, L)                              # pressed rim
        if d > fr - 1.7:
            return GALV[0]
        a = math.atan2(v, u)
        if d < 2.4:
            return shade(GALV, 0.9 - d * 0.15)                 # hub
        blade = math.sin(a * 4 + d * 0.28) > 0.25
        c = shade(ramp('#474a58', 0.45, 0.22, 0.3), 0.4 + 0.4 * math.sin(a * 4 + d * 0.28)) if blade else hx('#18141f')
        if any(abs(d - r) < 0.28 for r in (4.0, 6.4, 8.6)) or abs(math.sin(a * 4)) < 0.05:
            c = mix(c, GALV[3], 0.7)                           # the wire grille: rings and spokes
        return c
    fill_shape(cv, 16.0, 16.0, fr, fr, fan)

    def louvres(x, y, c):
        t = (y - 5.0) % 1.5
        return body[3] if t < 0.5 else body[1] if t < 1.0 else body[0]
    px_paint(cv, 31, 5, 42, 27, louvres)
    frect(cv, 30.5, 4.5, 42.5, 5.0, body[0])
    for (x, y) in ((3.0, 3.0), (43.0, 3.0), (3.0, 28.5), (43.0, 28.5), (29.0, 3.0), (29.0, 28.5)):
        stud(cv, x, y, body[1])
    frect(cv, 31.0, 28.0, 37.0, 29.5, hx('#e8e4d8'))                  # the maker's label, faded
    frect(cv, 31.5, 28.5, 35.0, 29.0, hx('#8a8478'))
    rng = random.Random(872)
    smudge(cv, rng, 6, (3, 3, 43, 29), (0.8, 2.4), 0.5, hx('#7a4a26'))    # rust blooms
    smudge(cv, rng, 6, (2, 2, 44, 30), (1.5, 3.5), 0.16)                  # soot
    for x in (4.0, 12.0, 21.0):
        line(cv, x, 27.5, x + 0.3, 30.5, alpha(hx('#6a3a1c'), 150))       # rust running off the casing
    cv.outline()
    return cv


def r_vent():
    """Turbine ventilator, 40 cm: spun vanes around a domed cap."""
    S = 14
    cv = Cv(S, S)

    def px(u, v, L):
        d = math.hypot(u, v)
        if d < 2.3:
            return shade(GALV, min(1.0, L + 0.12))
        vane = math.sin(math.atan2(v, u) * 9 + d * 0.9)
        return shade(GALV, L * (0.78 + 0.22 * vane)) if vane > -0.35 else dk(GALV[0], 0.25)
    fill_shape(cv, S / 2, S / 2, 6.0, 6.0, px)
    cv.outline()
    return cv


def r_duct():
    """Galvanised duct run, 2 m: flanged joints every 50 cm with their bolts, the sheet's spangle, dents and streaks."""
    W, H = 64, 12
    cv = Cv(W, H)
    fill_shape(cv, W / 2, H / 2, W / 2 - 1, H / 2 - 1, lambda u, v, L: shade(GALV, L), kind='rect', bevel=2.6, corner=0.6)
    rng = random.Random(873)
    mottle(cv, rng, 5, 4)
    px_paint(cv, 1, 1, W - 1, H - 1, lambda x, y, c: shift(c, int(math.sin(x * 2.3 + math.sin(y * 1.7) * 2) * 4)) if c[3] else None)
    for x in (16, 32, 48):
        frect(cv, x, 1, x + 0.5, H - 1, GALV[3])
        frect(cv, x + 0.5, 1, x + 1.5, H - 1, GALV[2])
        frect(cv, x + 1.5, 1, x + 2.0, H - 1, GALV[0])
        for y in (2.5, 8.5):
            stud(cv, x + 0.75, y, GALV[1])
    smudge(cv, rng, 3, (2, 2, 61, 9), (1.4, 2.4), 0.2)                 # dents
    for _ in range(6):
        x = rng.uniform(3, 60)
        line(cv, x, 7.0, x + 0.4, 10.5, alpha(hx('#5a5048'), 60))      # streaks down its side
    cv.outline()
    return cv


def r_hatch():
    """Roof access hatch, 70 cm: a steel lid on its curb, tread plate worn shiny, two hinges at the back, a pull handle,
    the hasp, rust."""
    S = 22
    cv = Cv(S, S)
    curb = ramp('#4a4c56', 0.5, 0.26, 0.3)
    lid = ramp('#737a84', 0.5, 0.26, 0.36)
    fill_shape(cv, S / 2, S / 2, S / 2 - 1, S / 2 - 1, lambda u, v, L: shade(curb, L), kind='rect', bevel=1.5, corner=1.0)

    def lid_(ly):
        fill_shape(ly, S / 2, S / 2, 7.5, 7.5, lambda u, v, L: shade(lid, L), kind='rect', bevel=1.4, corner=0.8)

        def tread(x, y, c):                                    # tread plate: little raised bars, alternating
            u, v = (x - 4.0) % 2.0, (y - 4.0) % 2.0
            k = int((x - 4.0) / 2.0) + int((y - 4.0) / 2.0)
            on = (0.2 < u < 1.8 and 0.6 < v < 1.4) if k % 2 else (0.6 < u < 1.4 and 0.2 < v < 1.8)
            return lt(c, 0.1) if on and c[3] else None
        px_paint(ly, 5, 5, 17, 17, tread)
    layer(cv, lid_, ol=curb[0])
    for x in (6.0, 14.0):                                      # hinges at the back
        fill_capsule(cv, [(x, 2.6), (x + 2.0, 2.6)], 0.6, lambda k, L, s, i, t: shade(ramp('#2a2c34', 0.4, 0.2, 0.5), L))
    chrome_bar(cv, 8.0, 15.4, 14.0, 16.6)                      # handle
    frect(cv, 10.5, 17.5, 11.5, 19.0, hx('#2a2c34'))           # hasp
    rng = random.Random(874)
    smudge(cv, rng, 4, (4, 4, 17, 17), (0.8, 1.8), 0.45, hx('#7a4a26'))
    cv.outline()
    return cv


def r_chimney():
    """Chimney stack, 60 cm: weathered cap stone, two clay pots, soot around the flues."""
    S = 20
    cv = Cv(S, S)
    stone = ramp('#8e877e', 0.5, 0.26, 0.32)
    clay = ramp('#a85c3a', 0.5, 0.26, 0.3)
    fill_shape(cv, S / 2, S / 2, S / 2 - 1, S / 2 - 1, lambda u, v, L: shade(stone, L), kind='rect', bevel=2.0, corner=0.8)
    rng = random.Random(875)
    mottle(cv, rng, 6, 5)
    smudge(cv, rng, 5, (4, 4, 15, 15), (2.0, 3.5), 0.4)        # soot

    def pots(ly):
        for px_ in (6.5, 13.5):
            fill_shape(ly, px_, 10.0, 3.2, 3.2, lambda u, v, L: hx('#120c14') if math.hypot(u, v) < 1.9 else shade(clay, L))
    layer(cv, pots)
    cv.outline()
    return cv


def r_tank():
    """Water tank, 1.5 m across: conical tin roof (seams running up to the cap) over the wooden staves."""
    S = 50
    cv = Cv(S, S)
    tin = ramp('#77726c', 0.52, 0.27, 0.34)
    wood = ramp('#6a4a36', 0.5, 0.26, 0.3)
    R = S / 2 - 1.0

    def px(u, v, L):
        d = math.hypot(u, v)
        if d > R - 2.2:
            return shade(wood, L)                              # the staves showing under the eaves
        a = math.atan2(v, u)
        c = shade(tin, light(math.cos(a) * 0.62, math.sin(a) * 0.62))   # a cone: one slope, lit by its bearing
        if d > 3.5 and abs(math.sin(a * 6 + 0.4)) < 0.07 + 0.25 / d:
            c = dk(c, 0.32)                                    # standing seams
        return c
    fill_shape(cv, S / 2, S / 2, R, R, px)
    rng = random.Random(876)
    mottle(cv, rng, 5, 5)
    smudge(cv, rng, 9, (6, 6, 43, 43), (1.5, 3.5), 0.42, hx('#7a4424'))   # rust
    layer(cv, lambda ly: fill_shape(ly, S / 2, S / 2, 2.6, 2.6, lambda u, v, L: shade(GALV, L)), ol=tin[0])
    cv.outline()
    return cv


def r_antenna():
    """TV aerial: a short mast on its plate with four bolts, the boom and its rake of round elements (longest at the
    back) with their clamps, a coax running off."""
    S = 34
    cv = Cv(S, S)
    c = S / 2
    al = ramp('#b4bac4', 0.5, 0.25, 0.4)
    for i, x in enumerate(range(5, 30, 4)):                    # elements, longest at the back
        n = 11 - i
        fill_capsule(cv, [(x + 0.5, c - n), (x + 0.5, c + n)], 0.35, lambda k, L, s, i_, t: shade(al, L))
        frect(cv, x, c - 1.5, x + 1.0, c + 0.5, hx('#3a3e48'))   # its clamp
    fill_capsule(cv, [(3.0, c - 0.5), (31.0, c - 0.5)], 0.6, lambda k, L, s, i, t: shade(al, L))   # boom
    fill_shape(cv, c, c, 3.0, 3.0, lambda u, v, L: shade(GALV, L), kind='rect', bevel=1.2, corner=0.6)
    for (dx, dy) in ((-2.2, -2.2), (1.8, -2.2), (-2.2, 1.8), (1.8, 1.8)):
        stud(cv, c + dx, c + dy, GALV[1])
    fill_shape(cv, c, c, 1.3, 1.3, lambda u, v, L: shade(ramp('#2a2c34', 0.4, 0.2, 0.4), L))
    fill_capsule(cv, [(c + 1.0, c + 1.0), (c + 4.0, c + 6.0), (c + 3.0, S - 2.0)], 0.4, lambda k, L, s, i, t: hx('#1a1a20'))   # the coax
    return cv


def r_bulkhead():
    """Stair head, 1.9 x 1.6 m: tarred lid inside a brick kerb, the door (and its bulkhead lamp) on the +y side."""
    W, H = 62, 54
    cv, gl = Cv(W, H), Cv(W, H)
    brick = ramp('#7c4a40', 0.5, 0.26, 0.3)
    tar = ramp('#55565f', 0.5, 0.26, 0.3)
    fill_shape(cv, W / 2, H / 2 - 1.5, W / 2 - 1, H / 2 - 2.5, lambda u, v, L: shade(brick, L), kind='rect', bevel=2.0, corner=0.8)
    layer(cv, lambda ly: fill_shape(ly, W / 2, H / 2 - 1.5, W / 2 - 5, H / 2 - 6.5, lambda u, v, L: shade(tar, L),
                                    kind='rect', bevel=1.4, corner=0.8), ol=brick[0])
    rng = random.Random(877)
    mottle(cv, rng, 6, 6)
    smudge(cv, rng, 8, (6, 5, 55, 44), (2.0, 4.5), 0.16)
    cv.outline()
    # the lamp over the door: a caged bulkhead light on the wall face
    lamp = hx('#ffd9a0')
    for x in range(27, 35):
        cv.set(x, H - 3, hx('#2a2c34'))
        cv.set(x, H - 2, lamp)
        gl.set(x, H - 2, lamp)
    cv.set(26, H - 2, hx('#2a2c34'))
    cv.set(35, H - 2, hx('#2a2c34'))
    for x in range(26, 36):
        cv.set(x, H - 1, OUTLINE)
    return cv, gl


def skylight(glass, lit=True):
    """Roof light, 1.4 x 0.9 m: three wired-glass panes in an aluminium curb. Lit ones glow from the room below."""
    def make():
        W, H = 46, 30
        cv, gl = Cv(W, H), Cv(W, H)
        fr = ramp('#666a74', 0.5, 0.26, 0.4)
        fill_shape(cv, W / 2, H / 2, W / 2 - 1, H / 2 - 1, lambda u, v, L: shade(fr, L), kind='rect', bevel=2.2, corner=1.0)
        grime = VNoise(48, 32, 8, random.Random(878))
        for y in range(4, H - 4):
            for x in range(4, W - 4):
                px_ = (x - 4) % 13
                if px_ == 12:
                    continue                                   # glazing bar
                edge = min(px_, 11 - px_, y - 4, H - 5 - y)
                k = 0.45 + 0.4 * grime(x, y) + 0.05 * min(edge, 3)
                if lit:
                    c = mix(dk(glass, 0.4), lt(glass, 0.45), max(0.0, min(1.0, k)))
                    gl.set(x, y, c)
                else:
                    c = mix(dk(glass, 0.35), glass, k)
                    if abs((x + y) % 23 - 9) < 2:
                        c = lt(c, 0.12)                        # the sky in the glass
                cv.set(x, y, c)
        for x in range(4, W - 4):                              # the curb's shadow on the glass
            cv.set(x, 4, dk(cv.get(x, 4), 0.35))
        cv.outline()
        return (cv, gl) if lit else cv
    return make


GROUP = 'roof'
SPRITES = {
    'ac_unit': (r_ac_unit, (46, 32), 'fine'),
    'vent': (r_vent, (14, 14), 'fine'),
    'duct': (r_duct, (64, 12), 'fine'),
    'hatch': (r_hatch, (22, 22), 'fine'),
    'chimney': (r_chimney, (20, 20), 'fine'),
    'tank': (r_tank, (50, 50), 'fine'),
    'antenna': (r_antenna, (34, 34), 'fine'),
    'bulkhead': (r_bulkhead, (62, 54), 'glow'),
    'skylight': (skylight(hx('#f0a850')), (46, 30), 'glow'),
    'skylight_tv': (skylight(hx('#6aa0e8')), (46, 30), 'glow'),
    'skylight_dark': (skylight(hx('#2a3448'), lit=False), (46, 30), ''),
}
