"""Miami, 1985: Sunset Bay's night dressing, generic and reusable: pastel stucco and neon, hibiscus hedges,
deco canopies, pole signs, a dealer's lot, and the freeway's grime (a burnt-out car, a camp under the bridge, a
dented rail, an old crash)."""
import math
import random

from .core import (
    alpha, CLEAR, crease, Cv, dk, fill_capsule, fill_shape, frect, hx, layer, light, line, lt, mix, OUTLINE, px_paint,
    ramp, ring, shade, shift, smudge, stud, VNoise
)
from .palette import (
    CHROME, NEON_AMBER, NEON_CYAN, NEON_PINK, NEON_YELLOW, RUBBER, SIGN_GREEN, SIGN_INK, SIGN_WHITE, SIGN_YELLOW,
    STEEL_L, STUCCO, ZINC
)
from .type import neon_text, tube_text, tube_w, words
from .neon import Neon, sign_backing
from .vehicles import p_car
from .ramp_toll import sign_plate, sign_wear
from .flat import tide


NEON_OF = dict(pink=NEON_CYAN, mint=NEON_PINK, peach=NEON_PINK, lavender=NEON_CYAN)   # the tube each colour wears


def hibiscus_hedge(flower, seed):
    def make():
        """A hibiscus hedge from above, 3 m, clipped round: glossy dark leaves in clumps lit from the top left, the
        flowers open on its top and sides (five petals, a dark eye, the yellow stamen), buds, petals dropped round its
        foot, the soil showing at its ends."""
        W, H = 96, 26
        cv = Cv(W, H)
        rng = random.Random(seed)
        leaf = ramp('#2a6a3a', 0.55, 0.3, 0.26)        # hibiscus_into's leaf: the bushes' and the hedges' one family
        fill_shape(cv, W / 2, H / 2 + 1.0, W / 2 - 1.0, H / 2 - 2.0, lambda u, v, L: shade(ramp('#3a2a1c', 0.5, 0.25, 0.3), 0.3 + L * 0.3), kind='rect', corner=4.0)
        rx, ry = W / 2 - 3.0, H / 2 - 2.5

        def inside(x, y):
            return (abs(x - W / 2) / rx) ** 3.2 + (abs(y - H / 2) / ry) ** 3.2 <= 1.0

        def hedge(ly):
            fill_shape(ly, W / 2, H / 2, rx, ry, lambda u, v, L: shade(leaf, 0.08 + L * 0.2), kind='super', p=3.2)   # its depth
            for _ in range(int(W * H / 7)):                               # glossy leaves in clumps, lit from the top left
                x, y = rng.uniform(2, W - 2), rng.uniform(1.5, H - 1.5)
                if not inside(x, y):
                    continue
                q = rng.uniform(2.0, 3.2)
                top = 0.15 * (1 - (y - 2) / (H - 4))                         # the hedge's top half nearer the light
                fill_shape(ly, x, y, q, q * 0.68, lambda u, v, L, top=top: shade(leaf, 0.12 + L * 0.72 + top), ang=rng.uniform(0, 3.14))
            px_paint(ly, 0, 0, W, H, lambda x, y, c: CLEAR if c[3] and not inside(x, y) else None)
        layer(cv, hedge, hx('#0c1e14'))
        pet = ramp(flower, 0.45, 0.22, 0.3)
        for _ in range(17):
            x, y = rng.uniform(7, W - 7), rng.uniform(5, H - 5)
            if not cv.on(x, y):
                continue
            r, rot0 = rng.uniform(2.0, 2.8), rng.uniform(0, 1.3)

            def bloom(dx, dy, d, r=r, rot0=rot0):
                a = math.atan2(dy, dx) + rot0
                edge = r * (0.62 + 0.38 * abs(math.cos(a * 2.5)))
                if d > edge:
                    return None
                if d < 0.55:
                    return hx('#5a0a1a')
                return shade(pet, 0.35 + light(dx / r, dy / r) * 0.6 + (0.1 if d > edge - 0.5 else 0))
            ring(cv, x, y, 0.0, r, bloom)
            cv.dot(x - 0.5, y - 0.5, hx('#f4d040'))                       # the stamen
        for _ in range(9):
            x, y = rng.uniform(5, W - 5), rng.uniform(4, H - 4)
            if cv.on(x, y):
                fill_shape(cv, x, y, 0.9, 0.6, lambda u, v, L: shade(pet, 0.3 + L * 0.4), ang=rng.uniform(0, 3))   # buds
        for _ in range(6):
            cv.dot(rng.choice((rng.uniform(1, 4), rng.uniform(W - 4, W - 1))), rng.uniform(2, H - 2), pet[2])     # petals dropped
        return cv
    return make


def deco_canopy(name):
    def make():
        """An art-deco eyebrow canopy from above, 4 m along a front (its wall at -y), 1.1 m out: a stucco slab in
        `name`'s pastel, its front corners rounded off, three racing lines grooved along its lip, the lip's face, a
        neon tube run along its edge and round its ends (the emissive map; its light falls under it), rain streaks,
        a crack, a pigeon's leavings."""
        W, H = 128, 40
        cv, gl = Cv(W, H), Cv(W, H)
        rng = random.Random(9970 + len(name))
        st = ramp(STUCCO[name], 0.5, 0.26, 0.24)
        tube = NEON_OF[name]

        def slab(x, y, cur):
            r = 11.0
            cx = min(max(x, 2 + r), W - 2 - r)
            if y > 34 - r and math.hypot(x - cx, y - (34 - r)) > r:
                return None
            if x < 2 or x > W - 2 or y > 34:
                return None
            d = 34 - r - y
            edge = r - math.hypot(x - cx, y - (34 - r)) if y > 34 - r else min(34 - y, x - 2, W - 2 - x)
            k = 0.62 + (0.12 if y < 6 else 0) - (0.3 if edge < 2.0 else 0) - (0.08 if d < -6 else 0)
            for g in (5.0, 8.0, 11.0):                                     # the racing lines along its lip
                if abs(edge - g) < 0.5:
                    k -= 0.28
                elif abs(edge - g - 0.75) < 0.4:
                    k += 0.14
            return shift(shade(st, k), rng.randint(-2, 2))
        px_paint(cv, 0, 0, W, H, slab)
        frect(cv, 2, 0, W - 2, 1.5, lambda c: dk(c, 0.3) if c[3] else c)   # its joint with the wall
        smudge(cv, rng, 10, (4, 2, W - 4, 30), (1.5, 4.0), 0.12)
        for _ in range(6):                                                 # rain streaks off its lip
            x0 = rng.uniform(8, W - 8)
            px_paint(cv, x0, 14, x0 + 1.0, rng.uniform(24, 32), lambda x, y, c: dk(c, 0.1) if c[3] else None)
        crease(cv, [(rng.uniform(30, 90), 2.0), (rng.uniform(30, 90), 9.0), (rng.uniform(30, 90), 15.0)], 0.3)
        smudge(cv, rng, 3, (6, 3, W - 6, 20), (0.6, 1.2), 0.5, hx('#ece8dc'))
        cv.outline()
        ne = Neon(W, H)
        r = 11.0
        pts = [(2.5, 23.0)] + [(round(2.5 + r - r * math.cos(a), 1), round(23.0 + r * math.sin(a), 1)) for a in [k * math.pi / 12 for k in range(1, 7)]]
        pts += [(W - 2.5 - r + r * math.cos(a), 23.0 + r * math.sin(a)) for a in [k * math.pi / 12 for k in range(6, -1, -1)]]
        pts = [(int(round(x)), int(round(y))) for (x, y) in pts]
        ne.line(pts, tube)
        ne.render(cv, gl)
        return cv, gl
    return make


def pole_cabinet(cv, W, H, body, rim, rng):
    """A pole sign's cabinet laid back to be read: a stepped deco top, its face, a rim of chrome, rivets."""
    st, rm = ramp(body, 0.5, 0.26, 0.24), ramp(rim, 0.45, 0.22, 0.35)

    def f(x, y, cur):
        cx = W / 2
        top = 2 + (0 if abs(x - cx) < 10 else 3 if abs(x - cx) < 20 else 6)
        if y < top or y > H - 3 or x < 2 or x > W - 2:
            return None
        e = min(y - top, H - 3 - y, x - 2, W - 2 - x)
        if e < 1.5:
            return shade(rm, 0.5 + (0.4 if (x + y) % 9 < 3 else 0))
        return shift(shade(st, 0.55 + (0.15 if y < H / 3 else 0)), rng.randint(-2, 2))
    px_paint(cv, 0, 0, W, H, f)
    for x in (4.0, W - 4.0):
        for y in (9.0, H - 5.0):
            stud(cv, x, y, hx('#c8c8d0'))
    smudge(cv, rng, 8, (3, 3, W - 3, H - 3), (1.5, 3.5), 0.14)


def pole_sign(kind):
    def make():
        """A tall pole sign by the road from above, laid back to be read (its pole the prop's, drawn up to it): a
        stepped deco cabinet; `motel`: MOTEL in pink tubes, VACANCY in cyan on a dark plate, a starburst over it, a
        row of bulbs chasing round its foot; `autos`: AUTO / SALES in amber and pink, an arrow down to the lot."""
        W, H = 80, 56
        cv, gl = Cv(W, H), Cv(W, H)
        rng = random.Random(9980 + len(kind))
        ne = Neon(W, H)
        if kind == 'motel':
            pole_cabinet(cv, W, H, STUCCO['peach'], '#5ad0c8', rng)
            frect(cv, 9, 33, W - 9, 46, hx('#1e1030'))
            tube_text(ne, (W - tube_w('MOTEL')) // 2, 14, 'MOTEL', NEON_PINK)
            neon_text(ne, (W - 41) // 2, 36, 'VACANCY', NEON_CYAN)
            for a in range(8):                                             # the starburst
                aa = a * math.pi / 4
                ne.line([(round(W / 2 + math.cos(aa) * 1.5), round(7 + math.sin(aa) * 1.5)),
                         (round(W / 2 + math.cos(aa) * (4.5 if a % 2 else 3.0)), round(7 + math.sin(aa) * (4.5 if a % 2 else 3.0)))], NEON_YELLOW)
        else:
            pole_cabinet(cv, W, H, STUCCO['lavender'], '#f0d870', rng)
            frect(cv, 7, 12, W - 7, 46, hx('#1e1030'))
            tube_text(ne, (W - tube_w('AUTO')) // 2, 14, 'AUTO', NEON_AMBER)
            neon_text(ne, (W - 29) // 2, 34, 'SALES', NEON_PINK)
            ne.line([(W // 2 - 3, 44), (W // 2, 47), (W // 2 + 3, 44)], NEON_CYAN)
            for (x0, x1) in ((6, 16), (W - 16, W - 6)):
                ne.line([(x0, 6), (x1, 6)], NEON_CYAN)
        for x in range(6, W - 5, 4):                                       # the bulbs round its foot
            frect(cv, x, H - 7, x + 1.5, H - 5.5, hx('#fff0c0'))
            frect(gl, x, H - 7, x + 1.5, H - 5.5, hx('#ffe0a0'))
        ne.render(cv, gl)
        cv.outline()
        return cv, gl
    return make


def wall_neon(kind):
    def make():
        """A neon sign on a front (the world's density, as the other neon signs): MOTEL with its arrow, VACANCY, or a
        flamingo on one leg."""
        if kind == 'motel':
            cv, gl = sign_backing(40, 14), Cv(40, 14)
            ne = Neon(40, 14)
            neon_text(ne, 3, 3, 'MOTEL', NEON_PINK)
            ne.line([(33, 4), (36, 7), (33, 10)], NEON_AMBER)
            ne.line([(30, 7), (36, 7)], NEON_AMBER)
        elif kind == 'vacancy':
            cv, gl = sign_backing(46, 14), Cv(46, 14)
            ne = Neon(46, 14)
            neon_text(ne, 3, 3, 'VACANCY', NEON_CYAN)
        else:
            cv, gl = sign_backing(26, 14), Cv(26, 14)
            ne = Neon(26, 14)
            ne.line([(4, 6), (6, 5), (9, 5), (12, 6), (13, 7), (11, 8), (8, 8), (5, 7), (4, 6)], NEON_PINK)   # the body, closed
            ne.line([(13, 7), (15, 6), (15, 4), (14, 3), (15, 2), (17, 2), (18, 3)], NEON_PINK)   # the S of the neck, the head
            ne.line([(18, 3), (19, 4), (19, 5)], NEON_AMBER)               # the beak, bent down
            ne.line([(9, 8), (9, 12)], NEON_PINK)                          # the leg it stands on
            ne.line([(10, 8), (12, 10), (10, 10)], NEON_PINK)              # the other folded
            ne.line([(3, 12), (22, 12)], NEON_CYAN)                        # the water it stands in
        ne.render(cv, gl)
        return cv, gl
    return make


def p_car_burnt():
    """A car burnt out and left, from above, 4.4 m: the street's sedan (p_car: the same body, panels and shut lines)
    after the fire. The paint burnt off to rust and soot from the engine back (the fire started under the hood), a
    patch of its old aqua left on the trunk lid, no glass (the cabin open: the seats' springs bare, the dashboard's
    frame), the hood gone and the engine bay black, the roof sagged, the bumpers and lamps blackened, no tyres (the
    bare rims), ash and glass round it."""
    W, H = 140, 58
    ks = []
    cv, _ = p_car(ramp('#8c8c90', 0.46, 0.22, 0.12), keep=ks)
    k = ks[0]
    rng = random.Random(10011)
    n, fine_n = VNoise(W, H, 6, rng), VNoise(W, H, 2, rng)
    rust, soot, ash = ramp('#7a3e22', 0.5, 0.26, 0.3), ramp('#2a2024', 0.5, 0.26, 0.3), hx('#8a8078')
    s_ = cv.s
    for (i, j) in sorted(k.mask):
        x, y = (i + 0.5) / s_, (j + 0.5) / s_
        v = y - k.cy
        c = cv.p[i, j]
        lum = (c[0] * 0.3 + c[1] * 0.55 + c[2] * 0.15) / 255.0
        if (i, j) in k.glass or (40.5 < x < 97.5 and abs(v) < 17.5 and not (46 <= x <= 80)):
            # the glass gone: the cabin open, black, the seats' springs and the dashboard's frame in it
            c = mix(hx('#120c10'), hx('#2a1e20'), n(x * 1.4, y * 1.4))
            if 47 < x < 92 and abs(v) < 16 and (int(x * 2) % 5 == 0 or int(y * 2) % 5 == 0) and fine_n(x, y) > 0.35:
                c = hx('#5a4a44')
            if 91.5 < x < 94 and abs(v) < 18:
                c = shade(soot, 0.45)
        elif x > 98.5 and abs(v) < 19.5 and x < 134:
            c = mix(hx('#110d10'), hx('#3a2a24'), n(x * 1.5, y * 1.5))     # the hood gone: the engine bay
        else:
            burn = max(0.0, min(1.0, (x - 20) / 95 + (n(x, y) - 0.5) * 0.6))
            c = mix(shade(rust, 0.15 + lum * 0.9), shade(soot, 0.2 + lum * 0.7), burn)
            if x < 30 and -4 < v < 12 and n(x * 2, y) > 0.5:
                c = mix(c, hx('#5ab0b0'), 0.7 * min(1.0, lum * 1.3))       # its old paint, left on the trunk
            elif fine_n(x * 1.5, y * 1.5) > 0.8:
                c = mix(c, ash, 0.35)                                      # ash lying on it
            if 46 <= x <= 80 and abs(v) < 17:
                c = dk(c, 0.25 * (1 - abs(v) / 17.0))                      # the roof sagged in
        cv.p[i, j] = shift(c, rng.randint(-3, 3))
    # the engine block in its bay, the radiator's frame
    fill_shape(cv, 114, H / 2, 9.0, 10.0, lambda u, v, L: shade(ramp('#3a3236', 0.5, 0.25, 0.3), 0.2 + L * 0.5), kind='rect', corner=2.0)
    frect(cv, 130, 10, 132, H - 10, lambda c: shade(soot, 0.35))
    # no tyres: the bare rims at the wheels (the rubber burnt away)
    for wx in (30, 112):
        for y0 in (1.0, H - 4.0):
            frect(cv, wx - 7, y0, wx + 7, y0 + 3, lambda c: shade(STEEL_L, 0.25) if c[3] else c)
    smudge(cv, rng, 10, (6, 6, W - 6, H - 6), (2.0, 5.0), 0.22)
    cv.outline()
    for _ in range(40):                                                    # glass crumbs and ash round it
        x, y = rng.uniform(2, W - 2), rng.choice((rng.uniform(0.5, 2.5), rng.uniform(H - 2.5, H - 0.5)))
        if not cv.on(x, y):
            cv.dot(x, y, rng.choice((hx('#9ac8d8'), hx('#6a6670'), hx('#d8e8ee'))))
    return cv


def p_tent_tarp():
    """A blue tarp pitched as a lean-to on the bank, from above, 2.2 m: the plastic pulled over a ridge rope, sagging
    between its grommets, creased and patched with tape, its guy lines out to stakes, a brick and a tyre holding a
    corner down, the mouth open to a flattened carton and an old sleeping bag."""
    W, H = 72, 52
    cv = Cv(W, H)
    rng = random.Random(10021)
    tarp = ramp('#2a5ab8', 0.5, 0.26, 0.3)
    for (a, b) in (((4, 4), (12, 12)), ((W - 4, 4), (W - 12, 12)), ((4, H - 4), (12, H - 16))):
        line(cv, a[0], a[1], b[0], b[1], hx('#c8c0a8'))                   # guy lines
        fill_shape(cv, a[0], a[1], 1.0, 1.0, lambda u, v, L: hx('#8a6a3a'))
    frect(cv, 18, H - 14, 54, H - 3, hx('#b88a52'))                       # the carton at its mouth
    fill_shape(cv, 36, H - 12, 12, 5, lambda u, v, L: shade(ramp('#3a5a2a', 0.5, 0.25, 0.3), 0.3 + L * 0.5), kind='super', p=2.5)

    def sheet(u, v, L):
        x, y = u + 36, v + 22
        ridge = 18.0 + (x - 10) * 0.05
        d = (y - ridge) / 16.0
        k = 0.7 - abs(d) * 0.35 + (0.22 if d < 0 else -0.08)
        k -= 0.12 * abs(math.sin((x - 10) / 11.0 * math.pi))                # the sag between the grommets
        if abs(y - ridge) < 0.6:
            k += 0.2
        return shade(tarp, max(0.05, min(0.95, k)))
    layer(cv, lambda ly: fill_shape(ly, 36, 22, 30, 17, sheet, kind='rect', corner=3.0, bevel=2.0), hx('#0a1430'))
    for x in (10, 21, 32, 43, 54, 64):
        stud(cv, x, 6.0, hx('#c8c8d0'))
        stud(cv, x, 38.0, hx('#c8c8d0'))
    frect(cv, 40, 12, 52, 15, hx('#a8a8a0'))                               # duct tape
    crease(cv, [(14, 8), (22, 20), (26, 34)], 0.25)
    crease(cv, [(50, 30), (58, 22), (62, 10)], 0.2)
    fill_shape(cv, 8, 34, 4.5, 4.5, lambda u, v, L: shade(RUBBER, 0.2 + L * 0.6))   # the tyre, the brick
    fill_shape(cv, 8, 34, 2.0, 2.0, lambda u, v, L: hx('#1a1620'))
    fill_shape(cv, 63, 35, 3.5, 2.0, lambda u, v, L: shade(ramp('#a04a2a', 0.5, 0.25, 0.3), 0.3 + L * 0.6), kind='rect', corner=0.5)
    smudge(cv, rng, 8, (8, 6, 64, 38), (2.0, 4.0), 0.14)
    cv.outline()
    return cv


def p_barrel_fire():
    """A drum with a fire in it, from above: rusted steel, its rolling rings, a lip bent where it was cut open, holes
    punched round its top glowing, the coals inside and the charred ends of pallet wood (the emissive map: the
    coals, the flame's heart, the holes)."""
    S = 24
    cv, gl = Cv(S, S), Cv(S, S)
    c = S / 2
    rng = random.Random(10031)
    rust = ramp('#7a3a24', 0.5, 0.26, 0.3)
    ring(cv, c, c, 0.0, 10.6, lambda dx, dy, d: shift(shade(rust, 0.25 + light(dx / 11, dy / 11) * 0.7), rng.randint(-8, 8)))
    ring(cv, c, c, 9.4, 10.0, lambda dx, dy, d: dk(cv.get(c + dx, c + dy), 0.3))
    n = VNoise(S, S, 3, rng)

    def coals(dx, dy, d):
        k = n(c + dx, c + dy) * (1 - d / 9.0)
        return mix(hx('#3a1410'), hx('#ffd060'), min(1.0, k * 1.9)) if k > 0.12 else hx('#1a0c0c')
    ring(cv, c, c, 0.0, 8.8, coals)
    ring(gl, c, c, 0.0, 8.8, lambda dx, dy, d: mix(hx('#ff6a1a'), hx('#fff0a0'), min(1.0, n(c + dx, c + dy) * (1 - d / 9.0) * 1.9)) if n(c + dx, c + dy) * (1 - d / 9.0) > 0.18 else None)
    for (a, b) in (((5, 9), (17, 13)), ((8, 17), (16, 6)), ((6, 13), (12, 18))):
        fill_capsule(cv, [a, b], 1.2, lambda k, L, s, i, t: mix(hx('#140c0c'), hx('#4a2a1a'), L))   # the wood, charred
    for k in range(10):
        a = k * math.pi / 5 + 0.3
        x, y = c + math.cos(a) * 10.0, c + math.sin(a) * 10.0
        cv.dot(x, y, hx('#ffa040'))
        gl.dot(x, y, hx('#ff8a30'))
    cv.outline()
    return cv, gl


def p_mattress_dumped():
    """A mattress dumped outdoors, from above, 2 m: its ticking gone grey-yellow with rain, a long tear with the foam
    and a spring out of it, rust from its springs bleeding through, water stains in rings, a corner chewed."""
    W, H = 68, 46
    cv = Cv(W, H)
    rng = random.Random(10041)
    tick = ramp('#b8ae90', 0.45, 0.22, 0.2)
    nz = VNoise(W, H, 9, rng)

    def top(u, v, L):
        x, y = u + W / 2, v + H / 2
        c = shade(tick, 0.42 + L * 0.3 + (nz(x, y) - 0.5) * 0.4 - 0.12 * math.exp(-((x - 30) ** 2 + (y - 24) ** 2) / 260))
        if x % 4.0 < 0.6:
            c = mix(c, hx('#6a6a7a'), 0.35)
        return c
    fill_shape(cv, W / 2, H / 2, W / 2 - 2, H / 2 - 2, top, kind='rect', corner=4.0, bevel=2.5, ang=0.04)
    for (x, y, r) in ((20, 14, 7), (44, 30, 9), (54, 12, 5)):
        smudge(cv, rng, 3, (x - 2, y - 2, x + 2, y + 2), (r * 0.6, r), 0.25, hx('#8a7a48'))
        tide(cv, x, y, r + 1.0, hx('#5a4a2a'), 0.35, broken=x)
    for (x, y) in ((14, 30), (38, 8), (58, 36), (28, 38)):
        smudge(cv, rng, 2, (x - 1, y - 1, x + 1, y + 1), (1.0, 2.0), 0.4, hx('#8a4a22'))   # rust from the springs
    px_paint(cv, 26, 20, 48, 26, lambda x, y, c: (hx('#e8dcb0') if abs(y - 23 - (x - 37) * 0.12) < 1.6 + math.sin(x) * 0.5 else c) if c[3] else None)
    ring(cv, 40, 23, 1.2, 2.4, lambda dx, dy, d: shade(STEEL_L, 0.3 + light(dx / 2.4, dy / 2.4) * 0.6))   # a spring out
    frect(cv, W - 8, H - 7, W - 2, H - 2, lambda c: hx('#e8dcb0') if c[3] else c)
    cv.outline()
    return cv


def litter(seed, n_cans, grass=True):
    def make():
        """What collects on a freeway's bank, from above (floor paint): crushed cans, a bottle and its broken neck,
        cigarette packs, a fast-food cup and its lid, wet paper, a tyre's scrap of tread, faded by the sun."""
        W, H = 72, 40
        cv = Cv(W, H)
        rng = random.Random(seed)
        cols = (hx('#c82a2a'), hx('#e8e4da'), hx('#2a5ab8'), hx('#e8c020'), hx('#3a8a4a'))
        for _ in range(n_cans):
            x, y, a = rng.uniform(6, W - 6), rng.uniform(5, H - 5), rng.uniform(0, 3)
            col = rng.choice(cols)
            fill_shape(cv, x, y, 3.0, 1.6, lambda u, v, L, col=col: shade(ramp(col, 0.5, 0.25, 0.3), 0.3 + L * 0.6), ang=a, kind='rect', corner=0.8)
            cv.dot(x + math.cos(a) * 2.5, y + math.sin(a) * 2.5, hx('#c8c8d0'))
        x, y = rng.uniform(10, W - 10), rng.uniform(8, H - 8)
        fill_shape(cv, x, y, 5.5, 1.8, lambda u, v, L: mix(hx('#3a6a3a'), hx('#a8d8a0'), L * 0.6), ang=rng.uniform(0, 3), kind='rect', corner=1.6)
        for _ in range(4):
            x, y = rng.uniform(4, W - 4), rng.uniform(4, H - 4)
            fill_shape(cv, x, y, 3.2, 2.2, lambda u, v, L: shade(ramp('#e8e4d6', 0.4, 0.2, 0.2), 0.3 + L * 0.5), ang=rng.uniform(0, 3), kind='super', p=2.2)   # wet paper
        x, y = rng.uniform(10, W - 10), rng.uniform(8, H - 8)
        fill_shape(cv, x, y, 3.0, 3.0, lambda u, v, L: shade(ramp('#e8e0d0', 0.4, 0.2, 0.2), 0.3 + L * 0.7))   # the cup
        fill_shape(cv, x, y, 1.8, 1.8, lambda u, v, L: hx('#c82a2a'))
        x, y = rng.uniform(10, W - 10), rng.uniform(8, H - 8)
        fill_shape(cv, x, y, 2.6, 1.6, lambda u, v, L: shade(ramp('#e8e4da', 0.4, 0.2, 0.2), 0.4 + L * 0.5), ang=0.4, kind='rect', corner=0.4)   # a pack
        frect(cv, x - 1.6, y - 0.4, x + 1.6, y + 0.4, hx('#c82a2a'))
        x, y = rng.uniform(12, W - 12), rng.uniform(8, H - 8)
        fill_capsule(cv, [(x - 8, y - 1), (x, y + 1.5), (x + 7, y - 0.5)], 1.6, lambda k, L, s, i, t: shade(RUBBER, 0.2 + L * 0.6))   # tread
        for _ in range(16):
            cv.dot(rng.uniform(2, W - 2), rng.uniform(2, H - 2), rng.choice((hx('#5a8a4a'), hx('#9ac8d8'), hx('#d8d4c8'))))
        cv.outline(hx('#1a1a14'))
        return cv
    return make


def chainlink(hole):
    def make():
        """A 4 m run of chain-link fence from above, laid back a little: its top rail and three posts with their caps,
        the diamond mesh between them catching the light, a strand of barbed wire along its top, rust; `hole`: a
        flap cut in it and rolled back, the cut ends of the wire bristling."""
        W, H = 128, 14
        cv = Cv(W, H)
        rng = random.Random(10051 + hole)
        mesh = hx('#a8aeb8')

        def m(x, y, cur):
            if hole and 46 <= x <= 84:
                return None
            u, v = x - 1.0, (y - 4.0) * 2.0
            if (abs((u + v) % 4.0 - 2.0) < 0.35) or (abs((u - v) % 4.0 - 2.0) < 0.35):
                return alpha(shift(mesh, rng.randint(-14, 6)), 200)
            return None
        px_paint(cv, 0, 4.0, W, 12.0, m)
        frect(cv, 0, 3.0, W, 4.2, shade(ZINC, 0.75))                         # the top rail
        frect(cv, 0, 3.0, W, 3.4, shade(ZINC, 0.95))
        if hole:
            px_paint(cv, 46, 0, 84, 4.6, lambda x, y, c: CLEAR)
            fill_capsule(cv, [(48, 11.5), (66, 12.5), (82, 11.0)], 1.6, lambda k, L, s, i, t: shade(ZINC, 0.3 + L * 0.5) if (i + int(t * 9)) % 2 else alpha(mesh, 220))   # the flap rolled back
            for x in (46.0, 84.0):
                for y in (5.0, 7.0, 9.0, 11.0):
                    line(cv, x, y, x + (2.0 if x > 60 else -2.0) * rng.uniform(-1, 1), y + rng.uniform(-1, 1), mesh)
        for x in (2.0, 64.0, 126.0):
            fill_shape(cv, x, 3.6, 1.8, 1.8, lambda u, v, L: shade(ZINC, 0.2 + L * 0.8))
        for (a, b) in (((0, 46), (84, W)) if hole else ((0, W),)):
            line(cv, a, 1.5, b, 1.5, hx('#8a8e98'))                          # the barbed strand
            for x in range(a + 3, b, 6):
                line(cv, x - 0.6, 0.8, x + 0.6, 2.2, hx('#6a6e78'))
        smudge(cv, rng, 6, (0, 2, W, 12), (1.0, 2.5), 0.4, hx('#8a5a32'))
        return cv
    return make


def p_guardrail_dented():
    """A length of the guardrail a car went into (laid like p_guardrail, the road on its +y side): the W-beam bent in
    off the road over two metres, creased where it folded, its zinc scraped bright in long streaks and smeared with
    tyre black, the post at the dent knocked back askew, its reflector gone."""
    W, H = 128, 10
    cv = Cv(W, H)
    rng = random.Random(10061)

    def dent(x):
        return 3.6 * math.exp(-((x - 70.0) / 20.0) ** 2)

    def posts(ly):
        fill_shape(ly, 16.0, 3.0, 2.2, 2.2, lambda u, v, L: shade(ZINC, 0.15 + L * 0.6), kind='rect', corner=0.4, bevel=1.0)
        fill_shape(ly, 82.0, 1.6, 2.2, 1.6, lambda u, v, L: shade(ZINC, 0.15 + L * 0.6), ang=0.5, kind='rect', corner=0.4, bevel=1.0)
    layer(cv, posts)
    zinc = VNoise(W, 16, 6, rng)

    def rail(x, y, cur):
        t = y - 5.0 + dent(x)
        if t < 0 or t >= 4.5:
            return None
        c = shade(ZINC, (0.95, 0.72, 0.36, 0.78, 0.3, 0.55, 0.22)[min(6, int(t / 0.65))])
        if abs(x - 60) < 2 or abs(x - 79) < 1.5:
            c = dk(c, 0.35)                                               # its creases
        return dk(c, 0.12) if zinc(x, y) > 0.66 else c
    ly = Cv(W, H, cv.s)
    px_paint(ly, 0, 0.5, W, 9.5, rail)
    ly.outline()
    cv.over(ly)
    for x in (W - 6.0, W - 2.5):
        for y in (6.0, 8.0):
            stud(cv, x, y, hx('#5a5e68'))
    for _ in range(9):                                                    # scraped bright, tyre black
        x0, x1 = rng.uniform(30, 70), rng.uniform(78, 110)
        y = rng.uniform(6.5, 9.0)
        px_paint(cv, x0, y, x1, y + 0.5, lambda x, y_, c: (lt(c, 0.5) if rng.random() < 0.7 else hx('#1a1820')) if c[3] and c != OUTLINE else None)
    smudge(cv, rng, 6, (40, 1, 100, 9.5), (1.5, 3.5), 0.4)
    smudge(cv, rng, 5, (1, 5, W - 1, 9.5), (1.0, 3.0), 0.35, hx('#8a5a32'))
    return cv


def p_call_box():
    """A freeway call box from above, laid back to be read (on its post): the yellow box, its solar panel on top, CALL
    in blue on its door, the box's number under it."""
    W, H = 18, 20
    cv = Cv(W, H)
    rng = random.Random(10081)
    fill_shape(cv, W / 2, 3.5, 7.5, 2.5, lambda u, v, L: mix(hx('#1a2a5a'), hx('#5a7ac8'), 0.2 + L * 0.5) if int((u + 8) * 2) % 3 else hx('#c8c8d0'), kind='rect', corner=0.5)
    sign_plate(cv, 2, 6.5, W - 2, H - 1, SIGN_YELLOW, rim=SIGN_INK, r=1.0, border=0.75)
    frect(cv, 3.5, 8.5, W - 3.5, 12.0, hx('#2a4ea8'))
    words(cv, W / 2, 8.8, 'CALL', SIGN_WHITE, 0.5, centre=True)
    words(cv, W / 2, 14.0, '512', SIGN_INK, 0.5, centre=True)              # (its number fits its door)
    sign_wear(cv, rng, (3, 7, W - 3, H - 2), 3)
    cv.outline()
    return cv


def p_tyre_marks():
    """Tyre marks of a car that swerved into the rail (floor paint), 8 m: its two sides' tracks (a tyre's width,
    16 cm) running straight, then curving off to +y, the rear tyres swinging out of the front ones' line as it slid
    and scrubbing wider, rubber streaked along the way it went, lighter where it bounced, fading in where it began."""
    W, H = 256, 72
    cv = Cv(W, H)
    rng = random.Random(10091)
    n = VNoise(W, H, 12, rng)
    hops = [(rng.uniform(120, 150), rng.uniform(8, 12)), (rng.uniform(190, 215), rng.uniform(6, 10))]

    def path(x):
        k = max(0.0, (x - 70) / (W - 70))
        return 10.0 + 44.0 * k * k

    def f(x, y, cur):
        k = max(0.0, (x - 70) / (W - 70))
        hw = 2.4 + 1.6 * k                                                 # scrubbed wider as it slid
        best = None
        for off in (0.0, 16.0 * (1 - 0.3 * k)):                            # the two sides of the car
            for rear in (0.0, 6.0 * k):                                    # the rear swings out
                d = y - (path(x) + off + rear)
                if abs(d) <= hw and (best is None or abs(d) < abs(best)):
                    best = d
        if best is None:
            return None
        a = 118 * min(1.0, x / 70.0) * (0.7 + 0.3 * n(x, y))
        if int((best + hw) * 2) % 3 == 0:
            a *= 0.72                                                      # streaks along the way it went
        for (hx0, hl) in hops:
            if hx0 <= x < hx0 + hl:
                a *= 0.35                                                  # it bounced
        return (16, 13, 18, int(a))
    px_paint(cv, 0, 0, W, H, f)
    return cv


def p_crash_debris():
    """What an old crash left on the shoulder (floor paint), 2 m: windscreen glass in crumbs, an indicator's amber
    shards, a tail light's red, a strip of chrome trim, a hubcap face down, plastic splinters, all ground into the
    asphalt."""
    W, H = 72, 44
    cv = Cv(W, H)
    rng = random.Random(10101)
    for _ in range(160):
        x, y = rng.gauss(W / 2, W / 5), rng.gauss(H / 2, H / 5)
        if 1 < x < W - 1 and 1 < y < H - 1:
            cv.dot(x, y, rng.choice((hx('#a8d0e0'), hx('#d8eef4'), hx('#6a8a98'), hx('#f0f8ff'))))
    for (col, k) in (('#ffa62a', 6), ('#d0242c', 7), ('#2a2a32', 8)):
        for _ in range(k):
            x, y, a = rng.uniform(8, W - 8), rng.uniform(6, H - 6), rng.uniform(0, 3)
            fill_shape(cv, x, y, rng.uniform(0.8, 1.8), rng.uniform(0.5, 1.0), lambda u, v, L, col=col: shade(ramp(col, 0.4, 0.2, 0.3), 0.3 + L * 0.6), ang=a)
    fill_capsule(cv, [(10, 32), (30, 36)], 0.9, lambda k, L, s, i, t: shade(CHROME, 0.3 + L * 0.7))   # a strip of trim
    ring(cv, 52, 16, 0.0, 6.0, lambda dx, dy, d: shade(CHROME, 0.25 + light(dx / 6, dy / 6) * 0.6 - (0.2 if 2.0 < d < 2.6 else 0)))   # the hubcap
    fill_shape(cv, 52, 16, 1.2, 1.2, lambda u, v, L: shade(CHROME, 0.4 + L * 0.5))
    cv.outline(hx('#121018'))
    return cv


def p_display_ramp():
    """A car dealer's display ramp (floor paint under the car it shows off), 5.5 m: two steel tracks of diamond
    plate rising toward +x, their sides painted in yellow and black, a chock at each wheel's foot, bolts, scuffs."""
    W, H = 176, 64
    cv = Cv(W, H)
    rng = random.Random(10111)
    for y0 in (6.0, 42.0):
        def track(x, y, cur, y0=y0):
            if not (4 <= x <= W - 4 and y0 <= y <= y0 + 16):
                return None
            if y - y0 < 1.5 or y0 + 16 - y < 1.5:
                return hx('#e8c020') if int((x + y) // 3) % 2 else SIGN_INK
            k = 0.35 + 0.4 * (x - 4) / (W - 8)                            # lit more as it rises
            if (int(x * 2) + int(y * 2)) % 5 == 0:
                k += 0.25                                                  # the diamond plate's bosses
            return shade(STEEL_L, min(0.95, k))
        px_paint(cv, 0, 0, W, H, track)
        for x in (24.0, 150.0):
            fill_shape(cv, x, y0 + 8, 3.0, 7.0, lambda u, v, L: shade(ramp('#e8c020', 0.5, 0.25, 0.3), 0.3 + L * 0.6), kind='rect', corner=1.0)
    smudge(cv, rng, 10, (4, 4, W - 4, H - 4), (2.0, 4.0), 0.2)
    cv.outline()
    return cv


def p_pennant_string():
    """A string of pennants over a car lot, from above, 3.5 m (hung): the rope sagging between its two ends, the
    plastic flags hanging off it to +y, pink, aqua, yellow and white in turn, each turned a little in the wind, lit
    on one face and dark on the other."""
    W, H = 112, 16
    cv = Cv(W, H)
    rng = random.Random(10121)
    cols = ('#ff5aa0', '#3ad8d0', '#f8d040', '#f4f2ea')

    def rope(x):
        return 2.5 + 3.5 * math.sin(math.pi * x / W)
    for k, x in enumerate(range(5, W - 4, 7)):
        y = rope(x)
        tw = rng.uniform(-0.25, 0.25)
        col = ramp(cols[k % 4], 0.5, 0.26, 0.3)
        tip = (x + 3.0 + tw * 10, y + 9.0)

        def flag(xx, yy, cur, x=x, y=y, tip=tip, col=col):
            ax, ay, bx, by = x, y, x + 6.0, rope(x + 6.0)
            d1 = (bx - ax) * (yy - ay) - (by - ay) * (xx - ax)
            d2 = (tip[0] - bx) * (yy - by) - (tip[1] - by) * (xx - bx)
            d3 = (ax - tip[0]) * (yy - tip[1]) - (ay - tip[1]) * (xx - tip[0])
            if (d1 >= 0 and d2 >= 0 and d3 >= 0) or (d1 <= 0 and d2 <= 0 and d3 <= 0):
                return shade(col, 0.75 if xx < (ax + bx) / 2 + (yy - ay) * 0.2 else 0.4)
            return None
        layer(cv, lambda ly, flag=flag, x=x: px_paint(ly, x - 1, 0, x + 12, H, flag), hx('#1a1020'))
    for x in range(0, W * 2):
        cv.dot(x / 2, rope(x / 2) - 0.5, hx('#4a4a52'))
    return cv


def p_lot_light():
    """A car lot's light pole from above (hung high: the pole's top at the sprite's middle): a cross bar along x and
    a box floodlight at each end turned down to +y, their lenses lit (the emissive map)."""
    W, H = 72, 24
    cv, gl = Cv(W, H), Cv(W, H)
    m = ramp('#5a5e6e', 0.5, 0.25, 0.4)

    def bar(ly):
        fill_capsule(ly, [(8, 10), (W - 8, 10)], 1.4, lambda k, L, s, i, t: shade(m, L))
        fill_shape(ly, W / 2, 10, 3.5, 3.5, lambda u, v, L: shade(m, L))
        for x in (10.0, W - 10.0):
            fill_shape(ly, x, 13, 8.0, 6.0, lambda u, v, L: shade(m, 0.2 + L * 0.6), kind='rect', corner=1.0)
    layer(cv, bar)
    for x in (10.0, W - 10.0):
        frect(cv, x - 6.5, 15.5, x + 6.5, 18.5, hx('#fffaf0'))
        frect(gl, x - 6.5, 15.5, x + 6.5, 18.5, hx('#f8fbff'))
    return cv, gl


def p_expansion_joint():
    """A concrete ramp's expansion joint across the road (floor paint), 6 m: the steel angle either side of a black
    sealed gap, worn bright where the tyres run, grit in it."""
    W, H = 8, 192
    cv = Cv(W, H)
    rng = random.Random(10131)

    def f(x, y, cur):
        wheel = any(abs(y - c) < 14 for c in (20.0, 60.0, 100.0, 140.0, 172.0))
        if 3.2 <= x < 4.8:
            return hx('#0e0c12') if rng.random() > 0.08 else hx('#5a5660')
        if 1.6 <= x < 3.2 or 4.8 <= x < 6.4:
            return shift(shade(STEEL_L, 0.55 if wheel else 0.35), rng.randint(-6, 6))
        return None
    px_paint(cv, 0, 0, W, H, f)
    return cv


def p_oil_streak():
    """The dark streak down a lane's middle where engines drip (floor paint), 8 m: soft-edged, darker in drops, a
    rainbow sheen where it is still wet."""
    W, H = 256, 20
    cv = Cv(W, H)
    rng = random.Random(10141)
    n = VNoise(W, 24, 8, rng)

    def f(x, y, cur):
        w = 4.0 + 3.0 * n(x, 4)
        d = abs(y - H / 2 - (n(x * 0.5, 12) - 0.5) * 4) / w
        if d > 1:
            return None
        a = int(70 * (1 - d * d) * min(1.0, x / 30.0, (W - x) / 30.0))
        if n(x * 4, y * 2) > 0.8:
            a += 40
        return (18, 14, 20, a)
    px_paint(cv, 0, 0, W, H, f)
    for _ in range(6):
        x = rng.uniform(40, W - 40)
        fill_shape(cv, x, H / 2, 3.0, 1.6, lambda u, v, L: (60, 40, 90, 60) if u < 0 else (30, 80, 70, 50))
    return cv


def p_sign_gantry():
    """An overhead sign gantry across a freeway from above (hung high), 14 m from post to post along y: its box truss
    (two chords, the zigzag between them, a catwalk's grating), and two green panels hung on it facing the traffic
    (-x), laid back to be read: TOLL PLAZA 1/4 MILE over the far lanes, ALL LANES TOLL and its fare over the near
    ones, each lit from below by two lamps on their arms (the emissive map). No lane arrow: seen from above, a sign's
    arrow down its face points at the shoulder, not down a lane (the user, 2026-11-20)."""
    W, H = 80, 448
    cv, gl = Cv(W, H), Cv(W, H)
    rng = random.Random(10151)

    def truss(ly):
        for y0 in (2.0, H - 14.0):                                         # the posts' heads
            fill_shape(ly, 62, y0 + 6, 7.0, 6.0, lambda u, v, L: shade(STEEL_L, 0.2 + L * 0.6), kind='rect', corner=1.0)
        frect(ly, 54, 8, 70, H - 8, shade(STEEL_L, 0.3))
        for x in (55.0, 68.0):                                             # the chords
            frect(ly, x - 1.0, 8, x + 1.0, H - 8, shade(STEEL_L, 0.75))
        for y in range(10, H - 12, 12):                                    # the zigzag
            line(ly, 56, y, 67, y + 6, shade(STEEL_L, 0.6))
            line(ly, 67, y + 6, 56, y + 12, shade(STEEL_L, 0.6))
    layer(cv, truss)
    for (y0, y1, lines, fare) in ((56, 176, ('TOLL', 'PLAZA', '1/4 MILE'), None), (300, 412, ('ALL', 'LANES', 'TOLL'), '$1.00')):
        sign_plate(cv, 4, y0, 54, y1, SIGN_GREEN, r=2.0, border=1.0)
        top = y0 + 10
        for (k, txt) in enumerate(lines):
            words(cv, 29, top + k * 14, txt, SIGN_WHITE, 1.0, centre=True)
        frect(cv, 10, top + 40, 48, top + 41, SIGN_WHITE)
        if fare:
            words(cv, 29, top + 50, fare, SIGN_WHITE, 1.0, centre=True)
        sign_wear(cv, rng, (6, y0 + 2, 52, y1 - 2), 6)
        for y in (y0 + 5.0, y1 - 5.0):                                     # its lamps, on arms out of the truss
            fill_capsule(cv, [(54, y), (6, y)], 0.8, lambda k, L, s, i, t: shade(STEEL_L, L))
            fill_shape(cv, 4, y, 2.5, 4.0, lambda u, v, L: shade(ramp('#4e5362', 0.5, 0.25, 0.4), 0.2 + L * 0.6), kind='rect', corner=1.0)
            frect(cv, 2.0, y - 3, 3.5, y + 3, hx('#f4fff0'))
            frect(gl, 2.0, y - 3, 3.5, y + 3, hx('#f0fff0'))
    cv.outline()
    return cv, gl


GROUP = 'props'
SPRITES = {
    'mattress_dumped': (p_mattress_dumped, (68, 46), 'fine floor'),
    'litter_a': (litter(10151, 5), (72, 40), 'fine floor'),
    'litter_b': (litter(10152, 3), (72, 40), 'fine floor'),
    'tyre_marks': (p_tyre_marks, (256, 72), 'fine floor'),
    'crash_debris': (p_crash_debris, (72, 44), 'fine floor'),
    'display_ramp': (p_display_ramp, (176, 64), 'fine floor'),
    'expansion_joint': (p_expansion_joint, (8, 192), 'fine floor stock'),
    'oil_streak': (p_oil_streak, (256, 20), 'fine floor'),
    'hibiscus_hedge': (hibiscus_hedge('#e8283c', 10171), (96, 26), 'fine', (92, 20)),
    'hibiscus_hedge_pink': (hibiscus_hedge('#ff6fa8', 10172), (96, 26), 'fine', (92, 20)),
    'pole_sign_motel': (pole_sign('motel'), (80, 56), 'fine glow', (8, 8)),
    'pole_sign_autos': (pole_sign('autos'), (80, 56), 'fine glow', (8, 8)),
    'car_burnt': (p_car_burnt, (140, 58), 'fine', (136, 54)),
    'tent_tarp': (p_tent_tarp, (72, 52), 'fine', (64, 44)),
    'barrel_fire': (p_barrel_fire, (24, 24), 'fine glow', (20, 20)),
    'chainlink_fence': (chainlink(0), (128, 14), 'fine', (128, 4)),
    'chainlink_hole': (chainlink(1), (128, 14), 'fine', (128, 4)),
    'guardrail_dented': (p_guardrail_dented, (128, 10), 'fine', (128, 6)),
    'call_box': (p_call_box, (18, 20), 'fine', (5, 5)),
    'pennant_string': (p_pennant_string, (112, 16), 'fine hung'),
    'lot_light': (p_lot_light, (72, 24), 'fine glow', (6, 6)),
    'sign_gantry': (p_sign_gantry, (80, 448), 'fine glow hung'),
    'neon_sign_motel': (wall_neon('motel'), (40, 14), 'glow hung'),
    'neon_sign_vacancy': (wall_neon('vacancy'), (46, 14), 'glow hung'),
    'neon_sign_flamingo': (wall_neon('flamingo'), (26, 14), 'glow hung'),
    **{'deco_canopy_' + c: (deco_canopy(c), (128, 40), 'fine glow hung') for c in STUCCO},
}
