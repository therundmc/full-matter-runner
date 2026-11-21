"""The floor and wall-top tiles (seamless, 1 tile = 1 m). The scene is later darkened and lit by the neon pass
(coloured lights, wet reflections) and the map adds its own large-scale grime, so the tiles stay calm: mid-tones, low
local contrast, fine isotropic grain and nothing sitting at a fixed spot that would show the repeat. Base painters
wrap every coordinate; the variants (_v1 another draw, _v2.._v5 a detail) copy the base and only touch the inside of
a 2 px margin (asserted), fading their changes to zero.
The floors are painted at FINE density (64 x 64 pixels a tile): T is the tile's size in pixels, U the pixels per
world px (tile_density); the painters give positions and sizes in world px (times U) and their grain is pixel-fine.
The wall tops stay at the world's density (T = 32, U = 1); the stucco ones have five variants, each a whole new draw.
road_tile: a floor tile as the map lays it, for the road's sprites that paint the ground they cover again."""
import math
import random

from .core import Batch, Cv, FINE, hx, mix, tint
from .palette import FL_ASPHALT, FL_SIDEWALK, RUST_BROWN


T = 32
U = 1
VM = 2   # variant margin (pixels)


def wset(cv, x, y, c):
    cv.p[int(x) % cv.w, int(y) % cv.h] = c


def inside(x, y, m=None):
    m = VM if m is None else m
    return m <= x < T - m and m <= y < T - m


def smooth(t):
    t = max(0.0, min(1.0, t))
    return t * t * (3 - 2 * t)


def noise(rng, rx=0, ry=None, passes=2):
    """Wrapped white noise, box-blurred by (rx, ry), normalised to mean 0 / std 1 and clamped
    to +-2.2 so no single blob stands out (it would mark the 32 px repeat)."""
    ry = rx if ry is None else ry
    rx, ry = rx * U, ry * U          # radii in world px
    f = [[rng.random() - 0.5 for _ in range(T)] for _ in range(T)]
    for _ in range(passes if rx or ry else 0):
        if rx:
            f = [[sum(row[(x + k) % T] for k in range(-rx, rx + 1)) for x in range(T)] for row in f]
        if ry:
            f = [[sum(f[(y + k) % T][x] for k in range(-ry, ry + 1)) for x in range(T)] for y in range(T)]
    vals = [v for row in f for v in row]
    m = sum(vals) / len(vals)
    s = math.sqrt(sum((v - m) ** 2 for v in vals) / len(vals)) or 1.0
    return [[max(-2.2, min(2.2, (v - m) / s)) for v in row] for row in f]


def speck(rng, p):
    """Random sparse pixel set (aggregate stones, pores, fibres); p per world px, so finer specks are as many."""
    p = p / (U * U) * (1.5 if U > 1 else 1.0)
    return {(x, y) for y in range(T) for x in range(T) if rng.random() < p}


def surface(cv, base, rng, fine=3.0, soft=2.0, soft_r=1, light=(0.0, 0), dark=(0.0, 0), fn=None):
    """Generic calm surface: per-pixel grain + softly blurred grain + sparse light/dark specks."""
    n0, n1 = noise(rng), noise(rng, soft_r)
    lit, pit = speck(rng, light[0]), speck(rng, dark[0])
    for y in range(T):
        for x in range(T):
            d = n0[y][x] * fine + n1[y][x] * soft
            if (x, y) in lit:
                d += light[1]
            elif (x, y) in pit:
                d -= dark[1]
            c = tint(base, d)
            cv.set(x, y, fn(x, y, c, d) if fn else c)
    return n1


def patch(rng, cx, cy, rx, ry, rough=0.25):
    """Soft irregular mask {(x, y): w} with w -> 0 at its rim and before the variant margin."""
    harm = [(rng.uniform(0, 6.283), rng.uniform(0, rough), k) for k in (2, 3, 5)]
    cx, cy, rx, ry = cx * U, cy * U, rx * U, ry * U     # world px
    out = {}
    for y in range(VM, T - VM):
        for x in range(VM, T - VM):
            dx, dy = (x + 0.5 - cx) / rx, (y + 0.5 - cy) / ry
            a = math.atan2(dy, dx)
            e = math.hypot(dx, dy) / (1.0 + sum(amp * math.sin(a * k + ph) for ph, amp, k in harm))
            edge = min(x - VM + 1, T - VM - x, y - VM + 1, T - VM - y) / (3.0 * U)
            w = smooth(1.0 - e) * smooth(edge)
            if w > 0.01:
                out[(x, y)] = w
    return out


def apply_patch(cv, m, fn):
    for (x, y), w in m.items():
        cv.set(x, y, fn(x, y, cv.get(x, y), w))


def reroll(cv, fresh):
    """Blend in another draw of the same surface, fading in from the variant margin: the
    variant then shares nothing but its border with the base, so the 32 px repeat breaks up."""
    for y in range(T):
        for x in range(T):
            w = smooth((min(x, T - 1 - x, y, T - 1 - y) - VM + 0.5) / (3.0 * U))
            if w > 0:
                cv.set(x, y, mix(cv.get(x, y), fresh.get(x, y), w))


def scratch(cv, rng, x, y, ang, n, d, curve=0.25):
    """Thin faint line (scuff, hairline crack, tar seam) kept inside the variant margin (x, y, n in world px)."""
    fx, fy, n = (x + 0.5) * U, (y + 0.5) * U, n * U
    curve /= U
    for i in range(n):
        ix, iy = int(math.floor(fx)), int(math.floor(fy))
        if not inside(ix, iy, VM + 1):
            break
        k = smooth(min(i + 1, n - i) / (2.5 * U))   # taper both ends
        cv.set(ix, iy, tint(cv.get(ix, iy), d * k))
        ang += rng.uniform(-curve, curve)
        fx += math.cos(ang)
        fy += math.sin(ang)


# ---- wood: staggered planks along x, fine streaky grain --------------------------

FL_WOOD = hx('#7c5538')
FL_WOOD_ROWS = [5, 6, 5, 5, 6, 5]   # plank widths (px) -> 16-19 cm boards


def wood_rows():
    """(first pixel row, height in pixels) of each board."""
    rows, y0 = [], 0
    for hgt in FL_WOOD_ROWS:
        rows.append((y0, hgt * U))
        y0 += hgt * U
    return rows


def wood_joint(cv, x, y0, hgt, d=-12):
    """A board's end at world column x: a dark pixel line, the next board's end grain a touch lighter."""
    for y in range(y0, y0 + hgt - 1):
        cv.set(x * U, y, tint(cv.get(x * U, y), d))
        if U > 1:
            cv.set(x * U + 1, y, tint(cv.get(x * U + 1, y), 3))


def t_wood(cv, rng):
    grain = noise(rng, 6, 0, 2)          # long horizontal streaks
    fine = noise(rng)
    joints = [3, 21, 12, 28, 8, 17]       # one board end per row, never aligned with the next row
    for r, (y0, hgt) in enumerate(wood_rows()):
        tone, slope = rng.uniform(-4, 4), rng.choice([-1, 1]) * rng.uniform(3, 6)
        for yy in range(hgt):
            y = y0 + yy
            for x in range(T):
                # each board drifts in tone along its length, so the two sides of a joint differ
                d = tone + slope * (((x - joints[r] * U) % T) / T - 0.5) + grain[y][x] * 3.5 + fine[y][x] * 1.5
                if yy == 0:
                    d += 2
                if yy == hgt - 1:
                    d -= 13 if U == 1 else 9   # seam between boards (a hairline at the fine density)
                wset(cv, x, y, tint(FL_WOOD, d))
        wood_joint(cv, joints[r], y0, hgt)


def v_wood1(cv, rng):
    # one extra board end: breaks the 1 m rhythm without adding a mark
    y0, hgt = wood_rows()[rng.choice([1, 2, 3])]
    wood_joint(cv, rng.randint(7, 23), y0, hgt)


def v_wood2(cv, rng):
    # a replaced board: two extra ends and a slightly different tone in between
    y0, hgt = wood_rows()[2]
    a = rng.randint(5, 9)
    b = a + rng.randint(11, 15)
    for x in range((a + 1) * U, b * U):
        for y in range(y0, y0 + hgt - 1):
            cv.set(x, y, tint(cv.get(x, y), 5, hx('#6a4a36'), 0.08))
    wood_joint(cv, a, y0, hgt)
    wood_joint(cv, b, y0, hgt)


# ---- kitchen: worn sheet linoleum (no tiles, no checkerboard) --------------------

FL_LINO = hx('#a59b86')


def t_checker(cv, rng):
    mottle = noise(rng, 1, 0, 2)    # fine, slightly stretched jaspe mottling
    surface(cv, FL_LINO, rng, 2.0, 1.0, 1, (0.02, 6), (0.025, 8),
            fn=lambda x, y, c, d: tint(c, mottle[y][x] * 1.6))


def v_checker1(cv, rng):
    for _ in range(3):   # chair scuffs
        scratch(cv, rng, rng.randint(6, 24), rng.randint(6, 24), rng.uniform(0, 6.283), rng.randint(4, 7), -7, 0.35)


def v_checker2(cv, rng):
    # small cigarette burn: dark core, soft halo
    cx, cy = rng.randint(10, 21) + 0.5, rng.randint(10, 21) + 0.5
    apply_patch(cv, patch(rng, cx, cy, 2.6, 2.2, 0.2),
                lambda x, y, c, w: tint(c, -22 * w, hx('#4a3a2a'), 0.3 * w))


# ---- bathroom: large pale tiles (50 cm), soft grout -------------------------------

FL_TILE_B = hx('#a3b7bf')
FL_GROUT = hx('#94a4aa')


def t_tile_blue(cv, rng):
    glaze = noise(rng, 3)

    def fn(x, y, c, d):
        gx, gy = x % (16 * U), y % (16 * U)
        if gx == 0 or gy == 0:
            return tint(FL_GROUT, d * 0.6)
        c = tint(c, glaze[y][x] * 1.2)
        if gx == 1 or gy == 1:
            c = tint(c, 3)
        elif gx == 16 * U - 1 or gy == 16 * U - 1:
            c = tint(c, -3)
        return c
    surface(cv, FL_TILE_B, rng, 1.6, 1.0, 1, fn=fn)


def v_tile_blue1(cv, rng):
    # grimy grout along part of one joint
    y0 = rng.randint(4, 10) * U
    for y in range(y0, y0 + rng.randint(10, 16) * U):
        k = smooth(min(y - y0 + 1, 3 * U) / (3.0 * U))
        cv.set(16 * U, y, tint(cv.get(16 * U, y), -5 * k, hx('#6a6a58'), 0.12 * k))


def v_tile_blue2(cv, rng):
    # chipped corner where four tiles meet + a short hairline
    for (dx, dy, d) in [(1, 1, -16), (2, 1, -9), (1, 2, -9), (-1, 1, -6)]:
        cv.set(16 * U + dx, 16 * U + dy, tint(cv.get(16 * U + dx, 16 * U + dy), d, FL_GROUT, 0.4))
    scratch(cv, rng, 18, 18, rng.uniform(0.5, 1.0), 6, -8, 0.3)


# ---- carpets: low-contrast pile, tiny soft motif ---------------------------------

def t_carpet_red(cv, rng):
    base = hx('#80303e')

    def fn(x, y, c, d):
        m = (x % (8 * U), y % (8 * U))
        if m in ((0, 0), (4 * U, 4 * U)):              # tiny soft diamond lattice
            return tint(c, 5, hx('#a8704a'), 0.12)
        if m in ((2 * U, 2 * U), (6 * U, 6 * U), (2 * U, 6 * U), (6 * U, 2 * U)):
            return tint(c, -3)
        return c
    surface(cv, base, rng, 3.5, 1.3, 1, fn=fn)


def t_carpet_purple(cv, rng):
    base = hx('#563c6c')
    flecks = {p: rng.choice([hx('#3a9aa4'), hx('#c45a8c'), hx('#a89a60')]) for p in speck(rng, 0.035)}
    surface(cv, base, rng, 3.5, 1.3, 1,
            fn=lambda x, y, c, d: mix(c, flecks[(x, y)], 0.28) if (x, y) in flecks else c)


def v_carpet1(cv, rng):
    # pile flattened by traffic: a touch lighter and greyer
    apply_patch(cv, patch(rng, rng.uniform(13, 19), rng.uniform(13, 19), 10, 7, 0.3),
                lambda x, y, c, w: tint(c, 2 * w, hx('#7a6a74'), 0.05 * w))


def v_carpet2(cv, rng):
    # old drink stain with a slightly darker rim
    m = patch(rng, rng.uniform(12, 20), rng.uniform(12, 20), 5.5, 4.2, 0.3)
    apply_patch(cv, m, lambda x, y, c, w: tint(c, -8 * min(1.0, w * 1.6) + (3 if w > 0.55 else 0)))


# ---- concrete: smooth trowelled slab, fine pores ----------------------------------

FL_CONCRETE = hx('#6e6c74')


def t_concrete(cv, rng):
    surface(cv, FL_CONCRETE, rng, 2.6, 1.3, 1, (0.02, 7), (0.025, 12))


def v_concrete1(cv, rng):
    # faint old oil blot
    apply_patch(cv, patch(rng, rng.uniform(14, 18), rng.uniform(14, 18), 10, 8, 0.35),
                lambda x, y, c, w: tint(c, -3 * w, hx('#4a4450'), 0.05 * w))


def v_concrete2(cv, rng):
    # short hairline crack
    scratch(cv, rng, rng.randint(6, 10), rng.randint(8, 22), rng.uniform(-0.4, 0.4), rng.randint(14, 19), -10, 0.45)


# ---- grass: fine blades, gentle hue drift, no clumps -----------------------------

FL_GRASS = hx('#56703e')


def t_grass(cv, rng):
    hue = noise(rng, 1)
    tips, gaps = speck(rng, 0.045), speck(rng, 0.05)
    blades = noise(rng, 0, 1, 1)       # tiny vertical blade streaks

    def fn(x, y, c, d):
        h = hue[y][x]
        c = mix(c, hx('#7a8044') if h > 0 else hx('#3e6a4c'), min(0.18, abs(h) * 0.08))
        c = tint(c, blades[y][x] * 2.5)
        if (x, y) in tips:
            c = tint(c, 9, hx('#a6b06a'), 0.1)
        elif (x, y) in gaps:
            c = tint(c, -10, hx('#2a3a2a'), 0.08)
        return c
    surface(cv, FL_GRASS, rng, 3.6, 1.0, 1, fn=fn)


def v_grass1(cv, rng):
    # a few drier blades
    dry = speck(rng, 0.18)
    apply_patch(cv, patch(rng, rng.uniform(12, 20), rng.uniform(12, 20), 8, 6, 0.35),
                lambda x, y, c, w: mix(c, hx('#8a8450'), 0.35 * w) if (x, y) in dry else c)


def v_grass2(cv, rng):
    # small worn patch where the soil shows through
    soil = speck(rng, 0.55)
    apply_patch(cv, patch(rng, rng.uniform(13, 19), rng.uniform(13, 19), 5.5, 4.0, 0.35),
                lambda x, y, c, w: mix(c, tint(FL_DIRT, rng.uniform(-6, 6)), min(0.75, w * 1.1))
                if (x, y) in soil else mix(c, hx('#7a7a48'), 0.2 * w))


# ---- asphalt: mid blue-grey, fine aggregate --------------------------------------

LINE_Y = (15, 16, 17)   # world px rows of the painted line
FL_LINE_COL = hx('#cfae4c')


def t_asphalt(cv, rng, line=False):
    agg = speck(rng, 0.045)
    surface(cv, FL_ASPHALT, rng, 3.6, 1.3, 1, dark=(0.04, 11),
            fn=lambda x, y, c, d: tint(c, 9, hx('#8a8680'), 0.15) if (x, y) in agg else c)
    if line:
        wear = noise(rng)
        for x in range(T):
            for y in range(LINE_Y[0] * U, (LINE_Y[-1] + 1) * U):
                g = cv.get(x, y)
                c = mix(FL_LINE_COL, g, 0.12 if y // U == 16 else 0.24)
                c = tint(c, (sum(g[:3]) / 3 - sum(FL_ASPHALT[:3]) / 3) * 0.4)   # grain shows through the paint
                if wear[y][x] > 1.8:
                    c = mix(c, g, 0.4)                                      # worn flecks
                cv.set(x, y, c)


def worn_line(cv, rng, x0, x1, k):
    x0, x1 = x0 * U, x1 * U
    for x in range(x0, x1):
        f = smooth(min(x - x0 + 1, x1 - x) / (4.0 * U)) * k
        for y in range(LINE_Y[0] * U, (LINE_Y[-1] + 1) * U):
            if rng.random() < 0.7:
                cv.set(x, y, mix(cv.get(x, y), tint(FL_ASPHALT, rng.uniform(-3, 3)), f))


def tar_seam(cv, rng, x, y, ang, n):
    """Sealed crack: a soft, slightly darker meandering band (x, y, n in world px)."""
    fx, fy, n = (x + 0.5) * U, (y + 0.5) * U, n * U
    for i in range(n):
        ix, iy = int(math.floor(fx)), int(math.floor(fy))
        k = smooth(min(i + 1, n - i) / (3.0 * U))
        for (dx, dy, d) in [(0, 0, -8), (0, 1, -4)] + ([(0, 2, -3), (0, -1, -2)] if U > 1 else []):
            if inside(ix + dx, iy + dy, VM + 1):
                cv.set(ix + dx, iy + dy, tint(cv.get(ix + dx, iy + dy), d * k, hx('#3a3a48'), 0.15 * k))
        ang += rng.uniform(-0.3, 0.3) / U
        fx += math.cos(ang)
        fy += math.sin(ang)


def v_asphalt1(cv, rng):
    # a few loose aggregate pits (the re-rolled grain does the rest)
    for _ in range(5 * U):
        x, y = rng.randint(4 * U, 28 * U - 1), rng.randint(4 * U, 28 * U - 1)
        cv.set(x, y, tint(cv.get(x, y), -9))


def v_asphalt2(cv, rng):
    tar_seam(cv, rng, 5, rng.randint(9, 22), rng.uniform(-0.3, 0.3), 22)


def v_asphalt_line1(cv, rng):
    a = rng.randint(4, 10)
    worn_line(cv, rng, a, a + rng.randint(14, 18), 0.22)


def v_asphalt_line2(cv, rng):
    worn_line(cv, rng, 6, 20, 0.28)
    tar_seam(cv, rng, rng.randint(12, 18), 4, 1.57 + rng.uniform(-0.3, 0.3), 24)


# ---- dirt: packed earth, fine grit -----------------------------------------------

FL_DIRT = hx('#6c5846')


def t_dirt(cv, rng):
    grit = speck(rng, 0.03)

    def fn(x, y, c, d):
        if (x, y) in grit:
            return tint(c, 14, hx('#9a948a'), 0.25)
        if ((x - 1) % T, (y - 1) % T) in grit:
            return tint(c, -6)
        return c
    surface(cv, FL_DIRT, rng, 4.0, 1.2, 1, dark=(0.03, 9), fn=fn)


def v_dirt1(cv, rng):
    # damp, slightly darker ground
    apply_patch(cv, patch(rng, rng.uniform(14, 18), rng.uniform(14, 18), 11, 9, 0.35),
                lambda x, y, c, w: tint(c, -4 * w, hx('#4a3a3a'), 0.06 * w))


def v_dirt2(cv, rng):
    # a few small stones half buried
    for _ in range(3):
        x, y = rng.randint(8, 22) * U, rng.randint(8, 22) * U
        col = tint(hx('#8a8478'), rng.uniform(-8, 8))
        cv.set(x, y, tint(col, 6))
        cv.set(x + 1, y, col)
        cv.set(x + 1, y + 1, tint(cv.get(x + 1, y + 1), -12))
        cv.set(x, y + 1, tint(col, -8))


# ---- sidewalk: big light concrete slabs, thin joints -----------------------------


def t_sidewalk(cv, rng):
    def fn(x, y, c, d):
        if x == 0 or y == 0:
            return tint(c, -14, hx('#5a5662'), 0.12)
        if x == 1 or y == 1:
            return tint(c, 3)
        return c
    surface(cv, FL_SIDEWALK, rng, 2.8, 1.3, 1, (0.025, 8), (0.03, 10), fn=fn)


def v_sidewalk1(cv, rng):
    # a few flattened chewing-gum spots and a faint stain
    apply_patch(cv, patch(rng, rng.uniform(12, 20), rng.uniform(12, 20), 7, 5, 0.35),
                lambda x, y, c, w: tint(c, -3 * w))
    for _ in range(3):
        x, y = rng.randint(5, 26) * U, rng.randint(5, 26) * U
        cv.set(x, y, tint(cv.get(x, y), -12))
        cv.set(x + 1, y, tint(cv.get(x + 1, y), -7))


def v_sidewalk2(cv, rng):
    scratch(cv, rng, rng.randint(5, 9), rng.randint(6, 12), rng.uniform(0.5, 0.9), rng.randint(14, 18), -16, 0.45)


# ---- neon dance floor: dark frosted panels, thin glowing joints ------------------

JOINT_V, JOINT_H, JOINT_X = hx('#4ad8e4'), hx('#f0508c'), hx('#f4e8ff')
FL_PANEL = hx('#1e1530')


def neon_line_px(x, y):
    """Colour of the glowing joint at (x, y), or None (shared with neon_floor_glow)."""
    gx, gy = x % (16 * U), y % (16 * U)
    if gx == 0 and gy == 0:
        return JOINT_X
    if gx == 0:
        return JOINT_V
    if gy == 0:
        return JOINT_H
    return None


def t_neon(cv, rng):
    def fn(x, y, c, d):
        line = neon_line_px(x, y)
        if line:
            return line
        gx, gy = x % (16 * U), y % (16 * U)
        dxl, dyl = min(gx, 16 * U - gx), min(gy, 16 * U - gy)
        c = mix(c, JOINT_V, [0, 0.16, 0.08, 0.04][min(3, dxl)])
        return mix(c, JOINT_H, [0, 0.16, 0.08, 0.04][min(3, dyl)])
    surface(cv, FL_PANEL, rng, 1.6, 1.8, 2, fn=fn)


def neon_glow():
    cv = Cv(T, T)
    for y in range(T):
        for x in range(T):
            c = neon_line_px(x, y)
            if c:
                cv.set(x, y, c)
    return cv


def v_neon1(cv, rng):
    for _ in range(3):   # heel scuffs on the frosted panels
        scratch(cv, rng, rng.choice([rng.randint(4, 12), rng.randint(19, 27)]),
                rng.choice([rng.randint(4, 12), rng.randint(19, 27)]), rng.uniform(0, 6.283), 4, 6, 0.3)


def v_neon2(cv, rng):
    # one panel softly lit from below
    px, py = rng.choice([(0, 0), (1, 0), (0, 1), (1, 1)])
    for y in range((py * 16 + 2) * U, (py * 16 + 15) * U):
        for x in range((px * 16 + 2) * U, (px * 16 + 15) * U):
            if inside(x, y):
                d = max(abs((x + 0.5) / U - px * 16 - 8), abs((y + 0.5) / U - py * 16 - 8)) / 7.0
                cv.set(x, y, mix(cv.get(x, y), hx('#7a2a8a'), 0.28 * smooth(1.2 - d)))


# ---- wall tops ---------------------------------------------------------------------

def t_wall(cv, rng):
    # interior plaster seen from above: light, even, fine grain
    surface(cv, hx('#c2b4ae'), rng, 2.2, 1.2, 1, (0.02, 5), (0.02, 6))


def t_brick(cv, rng):
    # exterior brick top: running bond, muted reds, mortar close in value
    mortar = hx('#6a5a5c')
    fine = noise(rng)
    tones = {}
    for y in range(T):
        row = y // 4
        off = 4 if row % 2 else 0
        for x in range(T):
            bx = ((x + off) % T) // 8
            if (row, bx) not in tones:
                tones[(row, bx)] = (rng.uniform(-7, 7), rng.uniform(0, 0.25))
            gx, gy = (x + off) % 8, y % 4
            if gy == 3 or gx == 7:
                c = tint(mortar, fine[y][x] * 3)
            else:
                d, k = tones[(row, bx)]
                c = tint(hx('#8a4034'), d + fine[y][x] * 3.5, hx('#7a5a4a'), k)
                if gy == 0:
                    c = tint(c, 5)
                elif gy == 2:
                    c = tint(c, -4)
            cv.set(x, y, c)


def t_roof(cv, rng):
    # flat roof of a neighbouring building: gravel over bitumen, cool and even
    surface(cv, hx('#7e808e'), rng, 3.0, 1.6, 1, (0.03, 8), (0.035, 11))


# ---- light details for variety (variants 3 to 5 of every floor): cracks, chips, stains, burns. All kept inside the
# variant margin and faint: the map's own grime and the lighting do the rest.

# the user: the hole-like marks showed too much, the cracks not enough: cracks are drawn CRACK times darker and
# HOLE scales every pit, chip, burn and dot
CRACK, HOLE = 1.5, 0.5


def d_crack(cv, rng, d=-10, branches=2, n=(9, 15)):
    """A hairline crack with a few branches off it, wandering."""
    d *= CRACK
    x, y, a = rng.uniform(8, 14), rng.uniform(9, 23), rng.uniform(-0.6, 0.6) + rng.choice([0, 3.1416])
    ln = int(rng.randint(*n) * 1.3)
    scratch(cv, rng, int(x), int(y), a, ln, d, 0.55)
    for _ in range(branches + 1):
        k = rng.uniform(0.25, 0.8)
        bx, by = x + math.cos(a) * ln * k, y + math.sin(a) * ln * k
        scratch(cv, rng, int(bx), int(by), a + rng.choice([-1, 1]) * rng.uniform(0.5, 1.1), rng.randint(4, 8), d * 0.75, 0.55)


def d_chip(cv, rng, d=-10, rim=5, r=(1.4, 2.4)):
    """A small piece broken out of the surface: its hollow in shade, its lower-right rim catching the light."""
    cx, cy, rr = rng.uniform(10, 22), rng.uniform(10, 22), rng.uniform(*r)
    m = patch(rng, cx, cy, rr, rr * rng.uniform(0.7, 1.0), 0.45)

    def fn(x, y, c, w):
        if w > 0.45:
            return tint(c, d * HOLE)
        dx, dy = x / U - cx, y / U - cy
        return tint(c, rim * HOLE if dx + dy > 0 else d * 0.4 * HOLE)
    apply_patch(cv, m, fn)


def d_stain(cv, rng, col, k=0.22, r=(3.0, 5.5), d=-3):
    """An old spill or grime: a soft patch pulled toward col."""
    rr = rng.uniform(*r)
    m = patch(rng, rng.uniform(11, 21), rng.uniform(11, 21), rr, rr * rng.uniform(0.6, 0.9), 0.12)
    apply_patch(cv, m, lambda x, y, c, w: tint(c, d * w * 0.7, col, k * w * 0.65))   # a stain, not a hole


def d_burn(cv, rng, n=(1, 2)):
    """Cigarettes put out on it: a black pit and a brown ring."""
    for _ in range(rng.randint(*n)):
        cx, cy = rng.uniform(9, 23), rng.uniform(9, 23)
        m = patch(rng, cx, cy, 1.1, 0.9, 0.2)
        apply_patch(cv, m, lambda x, y, c, w: tint(c, -26 * HOLE, hx('#140c08'), 0.6 * HOLE) if w > 0.6
                    else tint(c, -8 * HOLE, hx('#5a3a20'), 0.3 * w * HOLE))


def d_dots(cv, rng, col, n=(3, 6), d=-4):
    """Small dots trodden in: chewing gum, drops of something."""
    for _ in range(rng.randint(*n)):
        cx, cy = rng.uniform(8, 24), rng.uniform(8, 24)
        m = patch(rng, cx, cy, 0.7, 0.6, 0.2)
        apply_patch(cv, m, lambda x, y, c, w: tint(c, d * HOLE, col, 0.45 * w * HOLE))


def d_knot(cv, rng):
    """A knot in a board: a dark eye in rings of grain."""
    cx, cy = rng.uniform(10, 22), rng.uniform(10, 22)
    m = patch(rng, cx, cy, 1.8, 1.0, 0.15)
    apply_patch(cv, m, lambda x, y, c, w: tint(c, (-16 if w > 0.7 else -6 if w > 0.35 else -2) * HOLE))


def d_wear(cv, rng, d=4, r=(4.0, 6.5)):
    """A patch worn pale by feet."""
    rr = rng.uniform(*r)
    m = patch(rng, rng.uniform(12, 20), rng.uniform(12, 20), rr, rr * 0.7, 0.35)
    apply_patch(cv, m, lambda x, y, c, w: tint(c, d * w))


def d_stones(cv, rng, n=(3, 6)):
    """Grit and small stones."""
    for _ in range(rng.randint(*n)):
        cx, cy = rng.uniform(8, 24), rng.uniform(8, 24)
        m = patch(rng, cx, cy, rng.uniform(0.5, 0.9), 0.5, 0.3)
        apply_patch(cv, m, lambda x, y, c, w: tint(c, (9 if w > 0.5 else -5) * HOLE))


OIL = hx('#16141c')
GRIME = hx('#2a2420')
DETAIL_VARIANTS = {
    'wood': (lambda cv, r: (d_crack(cv, r, -9, 0, (8, 13)), d_knot(cv, r)),
             lambda cv, r: d_burn(cv, r),
             lambda cv, r: d_stain(cv, r, hx('#3a2418'), 0.25)),
    'checker': (lambda cv, r: d_crack(cv, r, -8, 1),
                lambda cv, r: d_chip(cv, r, -9, 4),
                lambda cv, r: (d_stain(cv, r, GRIME, 0.18), d_burn(cv, r, (1, 1)))),
    'tile_blue': (lambda cv, r: d_crack(cv, r, -10, 1, (6, 10)),
                  lambda cv, r: d_chip(cv, r, -11, 5, (1.2, 1.8)),
                  lambda cv, r: d_stain(cv, r, hx('#3a3a2a'), 0.2)),
    'carpet_red': (lambda cv, r: d_burn(cv, r),
                   lambda cv, r: d_stain(cv, r, hx('#2a0c10'), 0.3),
                   lambda cv, r: d_wear(cv, r, 5)),
    'carpet_purple': (lambda cv, r: d_burn(cv, r),
                      lambda cv, r: d_stain(cv, r, hx('#1a0c20'), 0.3),
                      lambda cv, r: d_wear(cv, r, 5)),
    'concrete': (lambda cv, r: d_crack(cv, r, -11, 2, (11, 17)),
                 lambda cv, r: d_stain(cv, r, OIL, 0.3, (3.5, 6.0), -4),
                 lambda cv, r: d_chip(cv, r, -10, 5)),
    'grass': (lambda cv, r: d_stones(cv, r),
              lambda cv, r: d_stain(cv, r, hx('#2a3a1a'), 0.25),
              lambda cv, r: d_stain(cv, r, hx('#5a4a30'), 0.2, (2.5, 4.0))),
    'asphalt': (lambda cv, r: d_crack(cv, r, -9, 3, (10, 16)),
                lambda cv, r: d_stain(cv, r, OIL, 0.35, (4.0, 6.5), -5),
                lambda cv, r: d_chip(cv, r, -12, 3, (1.8, 2.8))),
    'asphalt_line': (lambda cv, r: d_crack(cv, r, -9, 2, (8, 13)),
                     lambda cv, r: d_stain(cv, r, OIL, 0.3, (3.0, 5.0), -4),
                     lambda cv, r: d_stones(cv, r, (2, 4))),
    'dirt': (lambda cv, r: d_stones(cv, r, (4, 8)),
             lambda cv, r: d_stain(cv, r, hx('#2a2018'), 0.25),
             lambda cv, r: d_crack(cv, r, -7, 1, (6, 10))),
    'sidewalk': (lambda cv, r: d_crack(cv, r, -12, 1, (10, 16)),
                 lambda cv, r: d_dots(cv, r, hx('#3a3438')),
                 lambda cv, r: d_chip(cv, r, -11, 6)),
    'neon_floor': (lambda cv, r: d_crack(cv, r, -7, 0, (6, 9)),
                   lambda cv, r: d_dots(cv, r, hx('#1a1018'), (2, 4)),
                   lambda cv, r: d_wear(cv, r, 3)),
}


FLOOR_TILES = [
    ('wood', t_wood, v_wood1, v_wood2),
    ('checker', t_checker, v_checker1, v_checker2),
    ('tile_blue', t_tile_blue, v_tile_blue1, v_tile_blue2),
    ('carpet_red', t_carpet_red, v_carpet1, v_carpet2),
    ('carpet_purple', t_carpet_purple, v_carpet1, v_carpet2),
    ('concrete', t_concrete, v_concrete1, v_concrete2),
    ('grass', t_grass, v_grass1, v_grass2),
    ('asphalt', t_asphalt, v_asphalt1, v_asphalt2),
    ('asphalt_line', lambda cv, r: t_asphalt(cv, r, True), v_asphalt_line1, v_asphalt_line2),
    ('dirt', t_dirt, v_dirt1, v_dirt2),
    ('sidewalk', t_sidewalk, v_sidewalk1, v_sidewalk2),
    ('neon_floor', t_neon, v_neon1, v_neon2),
]


def t_stucco(base):
    """Painted stucco over block seen from above (the parapet's top, Miami's pastels): the trowel's sweeps in three
    shades of the paint (a lit ridge where each sweep ends, the shade under it), a soft mottle where the paint has
    weathered, a few darker pits; seamless (everything wraps). The cap line along its open edges is the map's
    (render/MapRenderer.js), the city's grime the lighting's."""
    def paint(cv, rng):
        col = hx(base)
        n1, n2 = noise(rng, 1), noise(rng)
        sweep = [[0.0] * T for _ in range(T)]
        for _ in range(int(22 * U * U)):                                  # the trowel's sweeps: short arcs, wrapped
            cx, cy = rng.uniform(0, T), rng.uniform(0, T)
            r = rng.uniform(5, 11) * U
            a0, span = rng.uniform(0, 6.283), rng.uniform(0.7, 1.4)
            for k in range(int(r * span * 1.5)):
                a = a0 + span * k / (r * span * 1.5)
                for (dr, v) in ((0.0, 1.0), (1.0, -1.0)):                  # the ridge, then the shade under it
                    x, y = int(cx + math.cos(a) * (r + dr)) % T, int(cy + math.sin(a) * (r + dr)) % T
                    sweep[y][x] = v
        pits = speck(rng, 0.025)
        for y in range(T):
            for x in range(T):
                m = n1[y][x] + 0.5 * n2[y][x]
                d = -13 if m < -0.95 else 11 if m > 1.0 else 0             # three shades: worn, flat, fresh (strong
                d += 10 * sweep[y][x] if sweep[y][x] > 0 else 9 * sweep[y][x]   # enough to live through the night grade)
                if (x, y) in pits:
                    d -= 20
                cv.set(x, y, tint(col, d))
    return paint


def v_stucco_crack(cv, rng):
    """A settling crack across the cap, branching, the paint lifted along it."""
    d_crack(cv, rng, -26, 2, (12, 18))


def v_stucco_stain(cv, rng):
    """Where water stands on the cap: a grey-brown stain with a darker tide line."""
    d_stain(cv, rng, hx('#4a4038'), 0.5, (4.0, 7.0), -14)


def v_stucco_patch(cv, rng):
    """A patch made good in a paint that never matched: a squarish field a shade off, its edge showing."""
    x0, y0 = rng.uniform(5, 12), rng.uniform(5, 12)
    x1, y1 = x0 + rng.uniform(8, 14), y0 + rng.uniform(7, 12)
    d = rng.choice((-12, 13))
    for y in range(int(y0 * U), int(y1 * U)):
        for x in range(int(x0 * U), int(x1 * U)):
            if inside(x, y, VM + 1):
                edge = min(x - x0 * U, x1 * U - 1 - x, y - y0 * U, y1 * U - 1 - y) < U
                cv.set(x, y, tint(cv.get(x, y), d - (10 if edge else 0)))


def v_stucco_chip(cv, rng):
    """The paint and the render knocked off a corner of the block: the grey of the concrete under them, rust from a
    tie."""
    d_chip(cv, rng, -20, 10, (1.8, 2.8))
    m = patch(rng, rng.uniform(11, 21), rng.uniform(11, 21), 1.6, 1.2, 0.4)
    apply_patch(cv, m, lambda x, y, c, w: tint(c, -4 * w, hx('#8a8478'), 0.75 * w))
    d_stain(cv, rng, RUST_BROWN, 0.25, (1.5, 2.5), -3)


# the stucco's variants (MapRenderer wallTile: _v1 another draw, _v2.._v5 another with a detail, by each cell's hash)
STUCCO_VARIANTS = (lambda cv, r: None, v_stucco_crack, v_stucco_stain, v_stucco_patch, v_stucco_chip)
# (the stucco ones: src/game/world/TileMap.js WALLS P, M, Y, V)
WALL_TILES = [('wall', t_wall), ('brick', t_brick), ('roof', t_roof), ('stucco_pink', t_stucco('#f08aaa')),
              ('stucco_mint', t_stucco('#62d4ae')), ('stucco_peach', t_stucco('#f8aa7a')), ('stucco_lilac', t_stucco('#a888e4'))]
STUCCO_TILES = [n for (n, _) in WALL_TILES if n.startswith('stucco_')]


def tile_density(u):
    """Paint the next tiles at u pixels per world px (T, U, VM: see the head of this section)."""
    global T, U, VM
    U, T, VM = u, 32 * u, 2 * u


def tiles():
    out = {}
    tile_density(FINE)
    for i, (name, base_fn, v1, v2) in enumerate(FLOOR_TILES):
        base = Cv(T, T)
        base_fn(base, random.Random(500 + i))
        out[name] = base
        d3, d4, d5 = DETAIL_VARIANTS[name]
        for k, fn in ((1, v1), (2, v2), (3, d3), (4, d4), (5, d5)):
            cv = Cv(T, T)
            cv.img = base.img.copy()
            cv.p = cv.img.load()
            fresh = Cv(T, T)
            base_fn(fresh, random.Random(900 + i * 10 + k))
            reroll(cv, fresh)
            fn(cv, random.Random(700 + i * 10 + k))
            for y in range(T):
                for x in range(T):
                    if not inside(x, y):
                        assert cv.p[x, y] == base.p[x, y], '%s_v%d touches its border at %d,%d' % (name, k, x, y)
            out['%s_v%d' % (name, k)] = cv
    out['neon_floor_glow'] = neon_glow()
    tile_density(1)
    for i, (name, fn) in enumerate(WALL_TILES):
        cv = Cv(T, T)
        fn(cv, random.Random(600 + i))
        out[name] = cv
        if name not in STUCCO_TILES:
            continue
        for (k, detail) in enumerate(STUCCO_VARIANTS, 1):
            # (unlike the floors', a whole new draw, its border too: a border shared by every cell drew the grid in the
            # trowel's strokes; on a noise this fine two draws meet without a seam)
            v = Cv(T, T)
            fn(v, random.Random(640 + i * 10 + k))
            detail(v, random.Random(680 + i * 10 + k))
            out['%s_v%d' % (name, k)] = v
    return out


_ROAD_TILES = {}


def road_tile(name):
    """The floor tile `name` as the map lays it (its own pixels, FINE a world px): what a road sprite covers of the
    ground is painted again from it, so a rounded corner joins the tiles round it."""
    if name not in _ROAD_TILES:
        i, fn = next((i, t[1]) for i, t in enumerate(FLOOR_TILES) if t[0] == name)
        tile_density(FINE)
        cv = Cv(T, T, 1)
        fn(cv, random.Random(500 + i))
        tile_density(1)
        _ROAD_TILES[name] = cv
    return _ROAD_TILES[name]


def tile_px(name, x, y):
    """The pixel of tile `name` under the world point (x, y), px from any tile corner."""
    t = road_tile(name)
    return t.p[int(math.floor(x * FINE)) % t.pw, int(math.floor(y * FINE)) % t.ph]


TILES = Batch(tiles)
GROUP = 'tiles'
SPRITES = {
    **{n: (TILES(n), (32, 32), 'dense req') for n, *_ in FLOOR_TILES},
    **{'%s_v%d' % (n, k): (TILES('%s_v%d' % (n, k)), (32, 32), 'dense') for n, *_ in FLOOR_TILES for k in range(1, 6)},
    'neon_floor_glow': (TILES('neon_floor_glow'), (32, 32), 'dense'),
    **{n: (TILES(n), (32, 32), '' if n == 'roof' else 'req') for n, _ in WALL_TILES},
    **{'%s_v%d' % (n, k): (TILES('%s_v%d' % (n, k)), (32, 32), '') for n in STUCCO_TILES for k in range(1, 6)},
}
