#!/usr/bin/env python3
"""Deterministic pixel-art asset generator for FullMatterRunner.

Run from the repo root:  python tools/generate_assets.py
Writes RGBA PNGs to assets/sprites/<group>/<name>.png.

Conventions
- 1 px = 1 world px, top-down camera, directional sprites face +x.
- Light comes from the top-left (-x, -y, +z).
- Characters / weapons / props get a 1 px dark outline; tiles wrap seamlessly.
Only depends on Pillow (no numpy). Output is fully deterministic (every painter seeds its own random.Random).
"""
import math
import os
import random

from PIL import Image

from pngout import prune, save_png

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT_DIR = os.path.join(ROOT, 'assets', 'sprites')

# STOCK: props painted and listed in engine/Assets.js that no level places yet, kept for the levels to come (the
# user's call, 2026-11-21). tests/sprites.test.mjs checks every prop sprite is placed by a level, spawned by the code
# or named here: a new orphan is caught, and a stock sprite a level starts to use leaves this list.
STOCK = (
    'carwash_sign', 'carwash_board', 'wash_bucket', 'hose_reel', 'soap_puddle',                  # a car wash
    'tyre_stack', 'tyre_pile', 'tyre_loose', 'tyre_rack', 'tyre_sign',                           # a tyre yard
    'carport', 'tv_antenna', 'driveway', 'lawn_dry_a',                                           # the suburb
    'awning_pink', 'awning_mint', 'awning_wine', 'deco_office_teal', 'dumpster_aqua',
    'stucco_trim_mint', 'stucco_trim_peach', 'neon_sign_mirage',
    'sawhorse', 'sign_stop', 'sign_detour_left', 'detour_arrow_paint_left',                      # road works
    'parking_bay', 'plaza_line', 'plaza_stripes', 'road_arrow_turn', 'road_only', 'gore_hatch', 'expansion_joint',
    'velvet_rope', 'entry_carpet', 'bed', 'dj_booth',                                            # a club, a flat
)

# --------------------------------------------------------------------------
# Colour helpers
# --------------------------------------------------------------------------

def hx(s, a=255):
    s = s.lstrip('#')
    return (int(s[0:2], 16), int(s[2:4], 16), int(s[4:6], 16), a)


def mix(a, b, t):
    return tuple(int(round(a[i] + (b[i] - a[i]) * t)) for i in range(4))


DARK_T = (28, 10, 48)       # shadows drift toward a cold purple
LIGHT_T = (255, 248, 226)   # highlights drift toward a warm white


def dk(c, t=0.3):
    return mix(c, DARK_T + (c[3],), t)


def lt(c, t=0.3):
    return mix(c, LIGHT_T + (c[3],), t)


def alpha(c, a):
    return (c[0], c[1], c[2], a)


def ramp(c, d2=0.48, d1=0.24, l1=0.32):
    """4-step ramp: [shadow, dark, base, light]."""
    c = hx(c) if isinstance(c, str) else c
    return (dk(c, d2), dk(c, d1), c, lt(c, l1))


def tidx(L):
    if L < 0.24:
        return 0
    if L < 0.52:
        return 1
    if L < 0.88:
        return 2
    return 3


def tone(r, L, shift=0):
    return r[max(0, min(3, tidx(L) + shift))]


OUTLINE = hx('#140c1c')
GORE_OL = hx('#2a0812')
CLEAR = (0, 0, 0, 0)

BLOOD = ramp('#a3101e', 0.5, 0.28, 0.25)
BLOOD_POOL = hx('#7a0a16')
FLESH = hx('#e8687e')
FLESH_L = hx('#ff9fb0')
BONE = hx('#f2ead2')
BONE_D = hx('#c4b494')

# Light direction (normalised) -- from top-left, mostly from above.
_l = (-0.5, -0.65, 0.75)
_n = math.sqrt(sum(v * v for v in _l))
LX, LY, LZ = (_l[0] / _n, _l[1] / _n, _l[2] / _n)


def light(nx, ny):
    d = nx * nx + ny * ny
    if d > 1.0:
        s = 1.0 / math.sqrt(d)
        nx, ny, nz = nx * s, ny * s, 0.0
    else:
        nz = math.sqrt(1.0 - d)
    return max(0.0, nx * LX + ny * LY + nz * LZ)


# --------------------------------------------------------------------------
# Canvas
# --------------------------------------------------------------------------

class Cv:
    """An RGBA canvas addressed in WORLD px. With s > 1 (a sprite painted finer than the world, see FINE) it holds
    s x s pixels per world px: set / rect / blend fill a whole world px, dot sets the single pixel under a world point,
    get reads it, and the shape painters and the outline work pixel by pixel."""
    S = 1   # pixel density of new canvases (raised to FINE while the fine props are painted, see fine())

    def __init__(self, w, h, s=None):
        self.s = s or Cv.S
        self.w, self.h = w, h
        self.pw, self.ph = w * self.s, h * self.s
        self.img = Image.new('RGBA', (self.pw, self.ph), CLEAR)
        self.p = self.img.load()

    def ok(self, x, y):
        return 0 <= x < self.w and 0 <= y < self.h

    def pok(self, i, j):
        return 0 <= i < self.pw and 0 <= j < self.ph

    def set(self, x, y, c):
        x, y = int(x), int(y)
        if c is None or not self.ok(x, y):
            return
        s = self.s
        if s == 1:
            self.p[x, y] = c
            return
        for j in range(y * s, y * s + s):
            for i in range(x * s, x * s + s):
                self.p[i, j] = c

    def dot(self, x, y, c):
        """The one pixel under the world point (x, y)."""
        i, j = int(math.floor(x * self.s)), int(math.floor(y * self.s))
        if c is not None and self.pok(i, j):
            self.p[i, j] = c

    def get(self, x, y):
        if self.s == 1:
            x, y = int(x), int(y)
            return self.p[x, y] if self.ok(x, y) else CLEAR
        i, j = int(math.floor(x * self.s)), int(math.floor(y * self.s))
        return self.p[i, j] if self.pok(i, j) else CLEAR

    def on(self, x, y, th=100):
        return self.get(x, y)[3] >= th

    def pon(self, i, j, th=100):
        return self.pok(i, j) and self.p[i, j][3] >= th

    def bpx(self, i, j, c):
        """Blend c over the pixel (i, j)."""
        if not self.pok(i, j):
            return
        b = self.p[i, j]
        a = c[3] / 255.0
        if b[3] == 0:
            self.p[i, j] = c
            return
        oa = a + b[3] / 255.0 * (1 - a)
        rgb = tuple(int(round((c[k] * a + b[k] * (b[3] / 255.0) * (1 - a)) / oa)) for k in range(3))
        self.p[i, j] = rgb + (int(round(oa * 255)),)

    def blend(self, x, y, c):
        x, y = int(x), int(y)
        if not self.ok(x, y):
            return
        s = self.s
        for j in range(y * s, y * s + s):
            for i in range(x * s, x * s + s):
                self.bpx(i, j, c)

    def rect(self, x0, y0, x1, y1, c):
        for y in range(y0, y1 + 1):
            for x in range(x0, x1 + 1):
                self.set(x, y, c)

    def over(self, other, dx=0, dy=0):
        self.img.alpha_composite(other.img, (dx * self.s, dy * self.s))
        self.p = self.img.load()

    def outline(self, col=OUTLINE, diag=False, th=100):
        nb = [(1, 0), (-1, 0), (0, 1), (0, -1)]
        if diag:
            nb += [(1, 1), (-1, 1), (1, -1), (-1, -1)]
        add = []
        for j in range(self.ph):
            for i in range(self.pw):
                if self.p[i, j][3] < th and any(self.pon(i + a, j + b, th) for a, b in nb):
                    add.append((i, j))
        for i, j in add:
            self.p[i, j] = col
        return self


def ascii_cv(rows, pal, ol=OUTLINE):
    h, w = len(rows), len(rows[0])
    assert all(len(r) == w for r in rows), rows
    cv = Cv(w, h)
    for y, row in enumerate(rows):
        for x, ch in enumerate(row):
            if ch != '.':
                cv.set(x, y, pal[ch])
    if ol:
        cv.outline(ol)
    return cv


# --------------------------------------------------------------------------
# Shape painters (all coordinates are continuous; pixel centres at +0.5)
# --------------------------------------------------------------------------

def rot(cx, cy, ang, u, v):
    ca, sa = math.cos(ang), math.sin(ang)
    return cx + u * ca - v * sa, cy + u * sa + v * ca


def fill_shape(cv, cx, cy, rx, ry, fn, ang=0.0, kind='ellipse', p=2.0, bevel=2.0, corner=1.0, pad=0.0, taper=0.0):
    """Paint a (rotated) ellipse / superellipse / rounded rect. fn(u, v, L) -> colour|None."""
    ca, sa = math.cos(ang), math.sin(ang)
    R = math.hypot(rx, ry) + 1
    s = cv.s
    for j in range(int(math.floor(cy - R)) * s, (int(math.ceil(cy + R)) + 1) * s + s - 1):
        for i in range(int(math.floor(cx - R)) * s, (int(math.ceil(cx + R)) + 1) * s + s - 1):
            if not cv.pok(i, j):
                continue
            px, py = (i + 0.5) / s - cx, (j + 0.5) / s - cy
            u = px * ca + py * sa
            v = -px * sa + py * ca
            if kind in ('ellipse', 'super'):
                e = (abs(u) / rx) ** p + (abs(v) / ry) ** p
                if e > 1.0 + pad:
                    continue
                if kind == 'super':
                    nu = math.copysign((abs(u) / rx) ** (p - 1), u)
                    nv = math.copysign((abs(v) / ry) ** (p - 1), v)
                else:
                    nu, nv = u / rx, v / ry
            else:
                ryu = ry * (1.0 - taper * (rx - u) / (2.0 * rx))
                qx = abs(u) - (rx - corner)
                qy = abs(v) - (ryu - corner)
                if qx > corner or qy > corner:
                    continue
                if qx > 0 and qy > 0 and qx * qx + qy * qy > corner * corner:
                    continue
                nu = math.copysign(max(0.0, min(1.0, (abs(u) - (rx - bevel)) / bevel)), u) * 0.92
                nv = math.copysign(max(0.0, min(1.0, (abs(v) - (ryu - bevel)) / bevel)), v) * 0.92
            wx = nu * ca - nv * sa
            wy = nu * sa + nv * ca
            c = fn(u, v, light(wx, wy))
            if c is not None:
                cv.p[i, j] = c


def fill_capsule(cv, pts, r, fn):
    """Thick polyline. fn(k, L, side, seg, t) with k = dist/r, side = signed perp/r."""
    xs = [p[0] for p in pts]
    ys = [p[1] for p in pts]
    s = cv.s
    for j in range(int(min(ys) - r - 1) * s, int(max(ys) + r + 2) * s):
        for i in range(int(min(xs) - r - 1) * s, int(max(xs) + r + 2) * s):
            if not cv.pok(i, j):
                continue
            px, py = (i + 0.5) / s, (j + 0.5) / s
            best = None
            for k in range(len(pts) - 1):
                ax, ay = pts[k]
                bx, by = pts[k + 1]
                dx, dy = bx - ax, by - ay
                ll = dx * dx + dy * dy or 1e-9
                t = max(0.0, min(1.0, ((px - ax) * dx + (py - ay) * dy) / ll))
                qx, qy = ax + t * dx, ay + t * dy
                d = math.hypot(px - qx, py - qy)
                if best is None or d < best[0]:
                    side = ((px - ax) * dy - (py - ay) * dx) / math.sqrt(ll)
                    best = (d, qx, qy, k, t, side)
            d, qx, qy, k, t, side = best
            if d <= r:
                L = light((px - qx) / r * 0.95, (py - qy) / r * 0.95)
                c = fn(d / r, L, side / r, k, t)
                if c is not None:
                    cv.p[i, j] = c


def circle(cv, cx, cy, r, col):
    fill_shape(cv, cx, cy, r, r, lambda u, v, L: col)


def ring(cv, cx, cy, r0, r1, fn):
    s = cv.s
    for j in range(int(cy - r1 - 1) * s, int(cy + r1 + 2) * s):
        for i in range(int(cx - r1 - 1) * s, int(cx + r1 + 2) * s):
            dx, dy = (i + 0.5) / s - cx, (j + 0.5) / s - cy
            d = math.hypot(dx, dy)
            if r0 <= d <= r1 and cv.pok(i, j):
                c = fn(dx, dy, d)
                if c is not None:
                    cv.p[i, j] = c


# --------------------------------------------------------------------------
# Tileable noise
# --------------------------------------------------------------------------

class VNoise:
    """Smooth value noise that wraps on a w x h canvas (cell must divide w, h)."""

    def __init__(self, w, h, cell, rng):
        self.nx, self.ny, self.cell = max(1, w // cell), max(1, h // cell), cell
        self.v = [[rng.random() for _ in range(self.nx)] for _ in range(self.ny)]

    def __call__(self, x, y):
        gx, gy = x / self.cell, y / self.cell
        ix, iy = int(math.floor(gx)), int(math.floor(gy))
        fx, fy = gx - ix, gy - iy
        fx, fy = fx * fx * (3 - 2 * fx), fy * fy * (3 - 2 * fy)
        v = self.v
        a = v[iy % self.ny][ix % self.nx]
        b = v[iy % self.ny][(ix + 1) % self.nx]
        c = v[(iy + 1) % self.ny][ix % self.nx]
        d = v[(iy + 1) % self.ny][(ix + 1) % self.nx]
        return (a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + d * fx) * fy


def shift(c, d):
    return (max(0, min(255, c[0] + d)), max(0, min(255, c[1] + d)), max(0, min(255, c[2] + d)), c[3])


def wood_fine(cv, x0, y0, x1, y1, base, plank, rng, vertical, mask):
    """wood_fill at a fine canvas's own density: boards with a hairline gap and a lit arris, butt joints, long soft
    streaks of grain that wander a little, now and then a darker heart line or a small knot, a few pores."""
    s = cv.s
    along = (y1 - y0 + 1) if vertical else (x1 - x0 + 1)
    across = (x1 - x0 + 1) if vertical else (y1 - y0 + 1)
    nb = across // plank + 2
    tones = [rng.choice([-7, -4, -1, 2, 5]) for _ in range(nb)]
    seams = [rng.uniform(3, along - 4) if along > 8 else -9 for _ in range(nb)]
    knots = [(rng.uniform(2, along - 2), rng.uniform(0.3, 0.7) * plank) if rng.random() < 0.35 else None for _ in range(nb)]
    lines = across * s
    phase = [rng.uniform(0, 6.3) for _ in range(lines + 2)]
    amp = [rng.choice([0, 0, 1, 1, 2, -1, -2, -3]) for _ in range(lines + 2)]
    freq = [rng.uniform(0.08, 0.22) for _ in range(lines + 2)]
    for j in range(y0 * s, (y1 + 1) * s):
        for i in range(x0 * s, (x1 + 1) * s):
            if not cv.pok(i, j):
                continue
            if mask and not mask((i + 0.5) / s - 0.5, (j + 0.5) / s - 0.5):
                continue
            ia, ib = (j - y0 * s, i - x0 * s) if vertical else (i - x0 * s, j - y0 * s)
            a, b = (ia + 0.5) / s, (ib + 0.5) / s
            pi = int(b // plank)
            c = shift(base, tones[pi])
            # grain: each line of pixels along the board has its own slow wave of tone
            g = amp[ib] * (0.6 + 0.4 * math.sin(a * freq[ib] + phase[ib]))
            c = shift(c, int(round(g * 3)))
            kn = knots[pi]
            if kn:
                d = math.hypot((a - kn[0]) * 0.55, b - pi * plank - kn[1])
                if d < 1.1:
                    c = dk(c, 0.3 * (1.1 - d))
                elif d < 2.2 and int(d * 3) % 2:
                    c = dk(c, 0.08)
            row = ib - pi * plank * s
            if row == plank * s - 1:
                c = dk(c, 0.34)                      # the gap between two boards
            elif row == 0:
                c = lt(c, 0.07)                      # the board's edge catching the light
            if abs(a - seams[pi]) < 0.5 / s + 1e-6:
                c = dk(c, 0.3)                       # butt joint
            elif 0 < a - seams[pi] < 1.0 / s + 0.01:
                c = lt(c, 0.06)
            if rng.random() < 0.04:
                c = shift(c, rng.choice([-6, 4]))
            cv.p[i, j] = c


def wood_fill(cv, x0, y0, x1, y1, base, plank=5, *, rng, vertical=False, mask=None):
    """Planks with seams, grain streaks and subtle noise."""
    if cv.s > 1:
        return wood_fine(cv, x0, y0, x1, y1, base, plank, rng, vertical, mask)
    w, h = x1 - x0 + 1, y1 - y0 + 1
    along = h if vertical else w
    across = w if vertical else h
    grain = [[rng.choice([0, 0, 0, -1, 1, -2]) for _ in range(along // 4 + 2)] for _ in range(across)]
    tones = [rng.choice([-6, -3, 0, 3, 6]) for _ in range(across // plank + 2)]
    seams = [rng.randint(3, along - 4) if along > 8 else -1 for _ in range(across // plank + 2)]
    for y in range(y0, y1 + 1):
        for x in range(x0, x1 + 1):
            if mask and not mask(x, y):
                continue
            a = (y - y0) if vertical else (x - x0)
            b = (x - x0) if vertical else (y - y0)
            pi = b // plank
            c = shift(base, tones[pi])
            g = grain[b][a // 4]
            c = shift(c, g * 7)
            if b % plank == plank - 1 or a == seams[pi]:
                c = dk(c, 0.28)
            if rng.random() < 0.08:
                c = shift(c, rng.choice([-5, 5]))
            cv.set(x, y, c)


def bevel_edges(cv, x0, y0, x1, y1, lt_t=0.18, dk_t=0.3):
    if cv.s > 1:   # the outer pixel at full strength, the next one at half
        s = cv.s
        for d, k in ((0, 1.0), (1, 0.5)):
            for i in range(x0 * s, (x1 + 1) * s):
                for j, f in ((y0 * s + d, lt), ((y1 + 1) * s - 1 - d, dk)):
                    if cv.pon(i, j):
                        cv.p[i, j] = f(cv.p[i, j], (lt_t if f is lt else dk_t) * k)
            for j in range(y0 * s + d + 1, (y1 + 1) * s - 1 - d):
                for i, f in ((x0 * s + d, lt), ((x1 + 1) * s - 1 - d, dk)):
                    if cv.pon(i, j):
                        cv.p[i, j] = f(cv.p[i, j], (lt_t if f is lt else dk_t) * k)
        return
    for x in range(x0, x1 + 1):
        if cv.on(x, y0):
            cv.set(x, y0, lt(cv.get(x, y0), lt_t))
        if cv.on(x, y1):
            cv.set(x, y1, dk(cv.get(x, y1), dk_t))
    for y in range(y0 + 1, y1):
        if cv.on(x0, y):
            cv.set(x0, y, lt(cv.get(x0, y), lt_t))
        if cv.on(x1, y):
            cv.set(x1, y, dk(cv.get(x1, y), dk_t))


# --------------------------------------------------------------------------
# Characters
# --------------------------------------------------------------------------

SKIN = ramp('#eab08a', 0.46, 0.22, 0.3)
CHARS = {
    # the runner (the user's pick, 2026-11-18): a dark cap with a low crown and a short flat brim, brown hair down to
    # his collar, a Mediterranean tan, a petrol gaiter up over his nose inside a funnel collar closed round his neck,
    # a long ink-blue duster whose skirt flies behind him (player_tail), a tab on each shoulder, the strap of a leather
    # satchel across it and the satchel on his left hip, behind, jeans and boots. Dark from head to foot (the user
    # found a bright cyan lining ugly and out of place): the lining, the brim's front edge, the cap's button and the
    # coat's buttons are a deep petrol blue, a quiet accent.
    'player': dict(kind='player', top=ramp('#3a4460', 0.5, 0.25, 0.35), sleeve=None,
                   pants=ramp('#3c4a66'), shoe=ramp('#3a2a22', 0.4, 0.2, 0.3),
                   hair=ramp('#4a2e1c', 0.5, 0.25, 0.45), cap=ramp('#2c303c', 0.45, 0.22, 0.5),
                   lining=ramp('#2a6a7c', 0.45, 0.22, 0.3), knit=ramp('#868c98', 0.45, 0.22, 0.3),
                   strap=ramp('#8a5630', 0.45, 0.22, 0.35), skin=ramp('#dba274', 0.46, 0.22, 0.3), sh=(4.0, 8.0)),
    'thug': dict(kind='thug', top=ramp('#e6e0cf', 0.42, 0.2, 0.5), pants=ramp('#2a2632'),
                 shoe=ramp('#1e1820', 0.3, 0.15, 0.25), hair=ramp('#3a2c48', 0.55, 0.3, 0.45),
                 shirt=ramp('#2a2236'), skin=SKIN, sh=(4.0, 8.0)),
    'heavy': dict(kind='heavy', top=ramp('#4b2470', 0.5, 0.25, 0.3), pants=ramp('#4b2470', 0.5, 0.25, 0.3),
                  shoe=ramp('#ecebf2', 0.4, 0.2, 0.2), skin=ramp('#d9a07a', 0.46, 0.22, 0.3), sh=(4.6, 9.3)),
    'brute': dict(kind='brute', top=ramp('#b8262c', 0.5, 0.24, 0.3), pants=ramp('#4c4a2c'),
                  shoe=ramp('#5a3a22'), bandana=ramp('#d8303c', 0.5, 0.24, 0.3),
                  skin=ramp('#c88a60', 0.46, 0.22, 0.3), sh=(4.3, 8.4)),
}
WHITE = ramp('#f4f2ec', 0.35, 0.16, 0.2)


def head_top_px(ch, u, v, L, r):
    """Head seen from straight above, face toward +u."""
    k = ch['kind']
    if k == 'civ':
        return civ_head_px(ch, u, v, L, r)
    i = tidx(L)
    if k == 'heavy':
        if L > 0.95:
            return lt(ch['skin'][2], 0.6)
        return ch['skin'][i]
    if k == 'cueball':
        return cueball_top_px(ch, u, v, L, r)
    if k == 'player':
        d = math.hypot(u, v)
        if u < -0.7 and d > r * 0.72:
            return ch['hair'][i if int(math.floor(v * 1.3 + 40)) % 2 else max(0, i - 1)]   # his hair, under the cap
        cap = ch['cap']
        if d < 0.8:
            return ch['lining'][1]                                                          # the button
        if abs(v) < 0.2 or abs(v * 0.5 + u * 0.87) < 0.2 or abs(v * 0.5 - u * 0.87) < 0.2:
            return cap[max(0, i - 1)]                                                       # the seams of its panels
        return cap[i]
    if u > r - 1.55:
        return ch['skin'][i]
    if k in ('thug', 'boss'):
        streak = int(math.floor(v + 40)) % 2 == 0
        if streak and L > 0.6:
            return ch['hair'][3]
        return ch['hair'][max(0, i - 1)] if not streak else ch['hair'][min(i, 2)]
    if k == 'brute':
        if u > r - 2.4:
            return ch['bandana'][max(0, i - 1)]   # folded band edge
        dot = (int(math.floor(u + 20)) * 3 + int(math.floor(v + 20)) * 2) % 7 == 0
        if dot and i >= 2:
            return lt(ch['bandana'][2], 0.65)
        return ch['bandana'][i]
    return ch['skin'][i]


def shoulder_px(ch, u, v, L, hu, hv, hr):
    """Shoulders (u along facing, v across). hu/hv: offset from head centre."""
    k = ch['kind']
    if k == 'civ':
        return civ_shoulder_px(ch, u, v, L, hu, hv, hr)
    i = tidx(L)
    hd = math.hypot(hu, hv)
    if hd < hr + 1.6 and hu + hv * 0.4 > -0.5:
        i = max(0, i - 1)      # head shadow / ambient occlusion
    if k == 'brute':
        if abs(v) > 4.6:
            return ch['skin'][i]
        if abs(v) > 3.6 and u < -1.0:
            return ch['top'][max(0, i - 1)]     # strap shadow
        return ch['top'][i]
    if k == 'heavy' and abs(v) > 4.0 and -0.4 <= u < 0.6:
        return WHITE[max(1, i)]
    if k == 'player':
        if hr + 0.1 < hd < hr + 0.6:
            return ch['lining'][1]               # the funnel collar's petrol rim, all round his neck
        if hr + 0.6 <= hd < hr + 1.8:
            if hu > 0 and abs(hv) < 0.3:
                return ch['top'][0]              # where it closes, in front
            if hu > 0 and 0.9 < hv < 1.5:
                return ch['lining'][2] if hd > hr + 1.2 else ch['top'][1]   # the throat tab and its button
            if hu < 0 and abs(abs(hv) - hr * 0.7) < 0.3:
                return ch['top'][max(0, i - 1)]  # its seams, behind
            return ch['top'][min(2, i + 1)]
        if abs(0.782 * u - 0.624 * v + 0.85) < 0.5:
            return ch['strap'][i]                # the satchel's strap: right shoulder in front, left hip behind
        if abs(u) < 1.3 and 4.0 < abs(v) < 7.2:  # a tab on each shoulder, a petrol button at its end
            if abs(u) < 0.3 and abs(abs(v) - 6.2) < 0.3:
                return ch['lining'][2]
            if abs(u) > 0.8 or abs(v) > 6.8:
                return ch['top'][max(0, i - 1)]
        return ch['top'][i]
    if k == 'thug' and hr + 0.1 < hd < hr + 1.3 and hu > -0.5:
        return ch['shirt'][1]
    if k == 'boss' and hr + 0.1 < hd < hr + 1.1 and hu > -1.2:
        return ch['top'][min(3, i + 1)]          # the suit's collar, up round his thick neck
    if k == 'cueball':
        return cueball_shoulder_px(ch, u, v, i, hd, hr)
    return ch['top'][i]


FINE = 2    # characters and weapons are painted at twice the world's pixel density, still plain pixel art (the user
            # wants it kept: a smooth, shaded repaint was the wrong direction); the game draws them at half size
            # (engine/Assets.js `density`)
def lump(u, v, rx, ry, hz, p=2.0):
    """Height of a half ellipsoid (radii rx, ry, height hz) at (u, v) from its centre; <= 0 outside it."""
    e = (abs(u) / rx) ** p + (abs(v) / ry) ** p
    return hz * math.sqrt(1.0 - e) if e < 1.0 else 0.0


def relief_paint(cv, hfun, colour, box=None):
    """Paint the pixels where the height field hfun(x, y) > 0, each lit by the field's own slope (one light for the
    whole figure, from behind and to the left of it as all the sprites are): shoulders, a skull, clumps of hair read as
    the round things they are, and where two of them meet shows as a crease. colour(x, y, L) -> rgba. Then a selective
    dark outline: the ink colour, softened to a deep shade of the cloth along its lit edge. Returns {(x, y): L}."""
    x0, y0, x1, y1 = box or (0, 0, cv.w - 1, cv.h - 1)
    H = {}
    for y in range(y0, y1 + 1):
        for x in range(x0, x1 + 1):
            h = hfun(x + 0.5, y + 0.5)
            if h > 0:
                H[(x, y)] = h
    Ls = {}
    for (x, y), h in H.items():
        gx = (H.get((x + 1, y), 0.0) - H.get((x - 1, y), 0.0)) * 0.5
        gy = (H.get((x, y + 1), 0.0) - H.get((x, y - 1), 0.0)) * 0.5
        n = math.sqrt(gx * gx + gy * gy + 1.0)
        L = max(0.0, (-gx * LX - gy * LY + LZ) / n)
        Ls[(x, y)] = L
        c = colour(x, y, L)
        if c is not None:
            cv.set(x, y, c)
    add = []
    for (x, y) in H:
        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            q = (x + dx, y + dy)
            if q not in H and cv.ok(*q) and cv.get(*q)[3] < 100:
                lit = Ls[(x, y)] > 0.8 and dx + dy < 0     # the edge toward the light
                add.append((q, dk(cv.get(x, y), 0.62) if lit else OUTLINE))
    for (x, y), c in add:
        cv.set(x, y, c)
    return Ls


def fold(cv, pts, ok, t=0.17):
    """A crease of cloth along a curve through pts (pixel coords): a dark line, and the ridge beside it on the side of
    the light a shade lighter. ok(x, y): the pixel is cloth."""
    seen = set()
    for i in range(len(pts) - 1):
        (ax, ay), (bx, by) = pts[i], pts[i + 1]
        n = int(max(abs(bx - ax), abs(by - ay)) * 2) + 1
        for k in range(n + 1):
            x, y = int(ax + (bx - ax) * k / n), int(ay + (by - ay) * k / n)
            if (x, y) in seen or not ok(x, y):
                continue
            seen.add((x, y))
            cv.set(x, y, dk(cv.get(x, y), t))
            if ok(x - 1, y - 1) and (x - 1, y - 1) not in seen:
                cv.set(x - 1, y - 1, lt(cv.get(x - 1, y - 1), t * 0.5))


def curve(p0, p1, p2, n=8):
    """Points along a quadratic curve."""
    return [((1 - t) ** 2 * p0[0] + 2 * (1 - t) * t * p1[0] + t * t * p2[0],
             (1 - t) ** 2 * p0[1] + 2 * (1 - t) * t * p1[1] + t * t * p2[1]) for t in (i / n for i in range(n + 1))]


BODY_C = (9.6, 10.0)   # the middle of the shoulders on the 20 x 20 (world px) torso sprite; the head's is (11, 10)


def torso_body(ch, rng):
    """The shoulders from above at FINE density, the arms left off (the game paints them, render/LimbArt.js): a
    chest-and-back, two round shoulder caps, the upper back bulging behind, each lit as the volume it is, then what
    cloth has: creases from the armpits down the back, the sleeve heads, a seam down the back, grime."""
    S, W = FINE, ch.get('canvas', 20) * FINE
    rx, ry = ch['sh'][0] * S, ch['sh'][1] * S
    pad = (W - 20 * FINE) / 2                        # a wider man's canvas grows round the same middle
    cx, cy = BODY_C[0] * S + pad, BODY_C[1] * S + pad
    hr = ch.get('head', 3.8) * S
    k, st = ch['kind'], ch.get('style')
    cap = ry * 0.38                                  # a shoulder cap's half width

    def h(x, y):
        u, v = x - cx, y - cy
        return max(lump(u + 0.3 * S, v, rx * 0.98, ry * 0.66, 7.0, 2.2),            # chest and back
                   lump(u + rx * 0.34, v, rx * 0.7, ry * 0.84, 6.0),                 # the upper back, behind
                   lump(u - 0.5 * S, v - (ry - cap), rx * 0.88, cap, 5.6),           # the shoulder caps, rolled
                   lump(u - 0.5 * S, v + (ry - cap), rx * 0.88, cap, 5.6))           # a little forward

    def colour(x, y, L):
        u, v = x + 0.5 - cx, y + 0.5 - cy
        c = shoulder_px(ch, u / S, v / S, L, (u - 1.4 * S) / S, v / S, hr / S)
        if k != 'brute' and st != 'dancer' and abs(abs(v) - (ry - cap * 1.7)) < 0.6 and abs(u) < rx * 0.7:
            c = dk(c, 0.12)                          # where the sleeve is sewn on
        if abs(v) < 0.55 and u < -1.5 * S and st != 'dancer':
            c = dk(c, 0.16)                          # the seam down the back
        return c
    body = Cv(W, W)
    relief_paint(body, h, colour)

    def cloth(x, y):
        c = body.get(x, y)
        if c[3] < 100 or c == OUTLINE:
            return False
        u, v = x + 0.5 - cx, y + 0.5 - cy
        if math.hypot(u - 1.4 * S, v) < hr + 1.2 * S:
            return False                             # under the head
        if k == 'brute':
            return abs(v) < 4.4 * S                  # his vest; bare shoulders
        if st == 'dancer':
            return -0.9 * S < u < 0.2 * S
        return True
    # creases: from each armpit round under the shoulder blade toward the small of the back, and one off the collar
    for sgn in (-1, 1):
        j = lambda: rng.uniform(-0.6, 0.6) * S
        fold(body, curve((cx + 0.4 * S + j(), cy + sgn * (ry - 2.2 * S)), (cx - 1.8 * S, cy + sgn * (ry - 1.6 * S) + j()),
                         (cx - rx + 1.3 * S, cy + sgn * (ry * 0.36) + j())), cloth)
        fold(body, curve((cx - 0.8 * S + j(), cy + sgn * (ry - 3.6 * S)), (cx - 2.2 * S, cy + sgn * 2.8 * S + j()),
                         (cx - rx + 1.0 * S, cy + sgn * 1.5 * S)), cloth, t=0.12)
    if k == 'thug' or st == 'suit':
        # shirt collar and tie in front of the neck, the lapels' notch either side
        shirt, tie = (ch['shirt'], hx('#8a1a3a')) if k == 'thug' else (WHITE, hx('#b8202a'))
        for dv in range(-3, 4):
            for du in range(0, 4 - abs(dv)):
                x, y = int(13.0 * S + du), int(10.0 * S + dv)
                if body.on(x, y):
                    body.set(x, y, tie if dv == 0 else shirt[2] if abs(dv) < 2 else shirt[1])
        for sgn in (-1, 1):
            for i in range(4):
                x, y = int(12.2 * S + i), int(10.0 * S + sgn * (4 + i * 0.9))
                if body.on(x, y):
                    body.set(x, y, dk(body.get(x, y), 0.3))
    if k == 'boss':
        # in front of his neck: the black shirt's open collar, his chest in its V, the chain on it; the jacket's lapels
        shirt, chain, sk = ch['shirt'], ch['chain'], ch['skin']
        for dv in range(-5, 6):
            for du in range(0, 6 - abs(dv) // 2):
                x, y = int(13.6 * S + du), int(10.0 * S + dv)
                if not body.on(x, y):
                    continue
                if abs(dv) <= 1 + du // 2:
                    c = sk[2] if du < 3 else sk[1]
                    if abs(abs(dv) - (1 + du // 2)) < 1 and du in (2, 3):
                        c = chain[3] if dv < 0 else chain[2]
                elif abs(dv) <= 3 + du // 2:
                    c = shirt[2] if dv < 0 else shirt[1]
                else:
                    c = ch['top'][3] if dv < 0 else ch['top'][1]
                body.set(x, y, c)
        for sgn in (-1, 1):
            for i in range(5):
                x, y = int(12.4 * S + i), int(10.0 * S + sgn * (5.4 + i * 0.8))
                if body.on(x, y):
                    body.set(x, y, dk(body.get(x, y), 0.28))   # the lapel's edge
    if k == 'cueball':
        cueball_jacket(body, ch, cx, cy, rx, ry)
    mottle(body, rng, amt=4, cell=4)
    smudge(body, rng, 3, (6, 6, W - 7, W - 7), r=(1.5, 3.0), t=0.14)
    return body


def hair_clumps(rng, cx, cy, rx, ry, crown, length=6.0, width=2.8, step=3.0, flow=0.0):
    """Clumps of hair over an oval (pixel coords): each a small ridge along the way it is combed, from the crown
    outward (flow > 0 bends them toward the back of the head, -x)."""
    out = []
    y = cy - ry
    while y <= cy + ry:
        x = cx - rx
        while x <= cx + rx:
            px_, py_ = x + rng.uniform(-0.7, 0.7), y + rng.uniform(-0.7, 0.7)
            if ((px_ - cx) / rx) ** 2 + ((py_ - cy) / ry) ** 2 <= 1.15:
                dx, dy = px_ - crown[0], py_ - crown[1]
                a = math.atan2(dy, dx) if dx * dx + dy * dy > 0.5 else math.pi
                a = math.atan2(math.sin(a) * (1 - flow), math.cos(a) * (1 - flow) - flow)
                out.append((px_, py_, a, length * rng.uniform(0.8, 1.2), width * rng.uniform(0.85, 1.15)))
            x += step
        y += step * 0.87
    return out


def clump_h(clumps, x, y):
    """Height the clumps add at (x, y): the highest one there."""
    best = 0.0
    for (cx, cy, a, l, w) in clumps:
        u = (x - cx) * math.cos(a) + (y - cy) * math.sin(a)
        v = -(x - cx) * math.sin(a) + (y - cy) * math.cos(a)
        best = max(best, lump(u, v, l * 0.5, w * 0.5, 1.1))
    return best


def clump_tone(ramp_, clumps, x, y, L):
    """A pixel of hair: a shade darker between two clumps, the light only on the top of a clump that faces it."""
    c = clump_h(clumps, x + 0.5, y + 0.5)
    i = min(2, tidx(L))
    if c < 0.45:
        return ramp_[max(0, i - 1)]
    if c > 0.85 and L > 0.86:
        return ramp_[3]
    return ramp_[i]


def torso_head(ch, rng):
    """The head from above at FINE density, face toward +x, on a 40 x 40 canvas laid like the torso's: a skull lit as
    a skull, hair in clumps combed the way it goes (or a cap, a hood, a bandana over it), the brow and the nose at the
    front, the ears."""
    S, W = FINE, 20 * FINE
    k, st = ch['kind'], ch.get('style')
    hcx, hcy, hr = 11.0 * S, 10.0 * S, ch.get('head', 4.1 if k == 'boss' else 3.8) * S
    head = Cv(W, W)
    skull = lambda x, y: lump(x - hcx, y - hcy, hr, hr * 0.94, hr * 0.95)
    face = lambda x, y, edge: x + 0.5 - hcx > hr - edge * S and abs(y + 0.5 - hcy) < hr * 0.8

    def face_px(x, y, L):
        u, v = x + 0.5 - hcx, y + 0.5 - hcy
        if abs(v) < 1.2 and u > hr - 1.4:
            return lt(ch['skin'][2], 0.25)           # the bridge of the nose catches the light
        return ch['skin'][1] if u < hr - 0.9 * S else ch['skin'][tidx(L)]   # the brow in shadow

    if k == 'player':
        # his hair down to his collar out from under the cap; the cap: a low crown in six panels to its button, a short
        # flat brim as wide as his brow with a petrol front edge and a line of shadow where it leaves the crown
        hair = ch['hair']
        cl = hair_clumps(rng, hcx - 2.8 * S, hcy, 3.0 * S, 3.7 * S, (hcx, hcy), length=6.4, width=2.8, flow=0.5)
        relief_paint(head, lambda x, y: max(lump(x - hcx + 2.6 * S, y - hcy, 3.0 * S, 3.6 * S, 4.0) + clump_h(cl, x, y)
                                            * (1 if lump(x - hcx + 2.6 * S, y - hcy, 3.0 * S, 3.6 * S, 1) > 0 else 0), 0),
                     lambda x, y, L: clump_tone(hair, cl, x, y, L))
        capc, lin = ch['cap'], ch['lining']
        brim = Cv(W, W)
        for dv in range(-6, 6):
            v = dv + 0.5
            if abs(v) > 5.2:
                continue
            tip = hcx + hr + 5.6 - (abs(v) / 5.2) ** 4 * 2.0
            for x in range(int(hcx + 2), int(tip) + 1):
                brim.set(x, int(hcy + dv), lin[2] if x >= int(tip) else capc[3] if -4 < v < -2.5 else
                         capc[2] if v < 2.5 else capc[1])
        brim.outline()
        head.over(brim)

        def cap_px(x, y, L):
            u, v = (x + 0.5 - hcx) / S, (y + 0.5 - hcy) / S
            i = tidx(L)
            if math.hypot(u, v) < 0.75:
                return lin[2]                        # the button
            if abs(v) < 0.18 or abs(v * 0.5 + u * 0.87) < 0.18 or abs(v * 0.5 - u * 0.87) < 0.18:
                return capc[max(0, min(2, i) - 1)]   # the seams of its panels
            if u > hr / S - 0.75 and abs(v) < 2.6:
                return capc[0]                       # the shadow where the brim leaves the crown
            if u < -hr / S + 0.8 and abs(v) < 1.3:
                return lin[1]                        # the strap's petrol tab, at the back
            return capc[3] if L > 0.95 else capc[min(2, i)]
        relief_paint(head, lambda x, y: lump(x - hcx, y - hcy, hr, hr * 0.96, hr * 1.0), cap_px)
    elif k == 'heavy':
        sk = ch['skin']
        relief_paint(head, skull, lambda x, y, L: lt(sk[2], 0.55) if L > 0.97 else sk[tidx(L)])
    elif k == 'cueball':
        cueball_dome(head, ch, skull, hcx, hcy, hr)
    elif k == 'brute':
        band = ch['bandana']

        def band_px(x, y, L):
            u, v = (x + 0.5 - hcx) / S, (y + 0.5 - hcy) / S
            if face(x, y, 1.5):
                return face_px(x, y, L)
            i = tidx(L)
            if u > hr / S - 2.4:
                return band[max(0, i - 1)]           # its folded edge over the brow
            if (int(math.floor(u * 1.4 + 20)) * 3 + int(math.floor(v * 1.4 + 20)) * 2) % 7 == 0 and i >= 2:
                return lt(band[2], 0.6)              # its print
            return band[i]
        relief_paint(head, skull, band_px)
        fold(head, curve((hcx - 1 * S, hcy - 3 * S), (hcx - 2.4 * S, hcy - 0.5 * S), (hcx - 3.4 * S, hcy + 0.5 * S)),
             lambda x, y: head.on(x, y) and head.get(x, y) != OUTLINE)
        for (x, y, c) in [(12, 18, 2), (11, 17, 2), (10, 16, 1), (9, 15, 1), (12, 21, 1), (11, 22, 1), (10, 23, 1),
                          (9, 24, 0), (13, 19, 3), (13, 20, 2)]:
            head.set(x, y, band[c])                  # the knot and its two tails
    elif st == 'hood':
        top = ch['top']

        def hood_px(x, y, L):
            u, v = (x + 0.5 - hcx) / S, (y + 0.5 - hcy) / S
            if u > hr / S - 1.4 and abs(v) < 2.2:
                return ch['skin'][max(0, tidx(L) - 1)] if abs(v) < 1.6 else ch['skin'][0]   # his face, in its shadow
            if u > hr / S - 2.2:
                return top[max(0, tidx(L) - 2)] if abs(v) < 2.8 else top[tidx(L)]   # the opening's rim
            return top[tidx(L)]
        relief_paint(head, lambda x, y: lump(x - hcx + 0.4 * S, y - hcy, hr + 0.9 * S, hr + 0.4 * S, hr), hood_px)
        fold(head, curve((hcx - 3.6 * S, hcy - 1 * S), (hcx - 1.4 * S, hcy - 0.4 * S), (hcx + 1.6 * S, hcy - 2.6 * S)),
             lambda x, y: head.on(x, y) and head.get(x, y) != OUTLINE)
    elif st == 'suit':
        sk, hair = ch['skin'], ch['hair']
        cl = hair_clumps(rng, hcx - 0.6 * S, hcy, hr, hr, (hcx + 5 * S, hcy), length=5.0, width=2.2, step=2.4)

        def bald_px(x, y, L):
            u, v = x + 0.5 - hcx, y + 0.5 - hcy
            if face(x, y, 1.4):
                return face_px(x, y, L)
            if math.hypot(u + 0.4 * S, v * 1.1) < hr * 0.7:
                return lt(sk[2], 0.4) if L > 0.97 else sk[min(3, tidx(L))]    # the bald crown, shining
            return clump_tone(hair, cl, x, y, L)                             # what is left round it
        relief_paint(head, skull, bald_px)
    elif st == 'trench':
        capc = ch['cap']

        def flat_px(x, y, L):
            u, v = (x + 0.5 - hcx) / S, (y + 0.5 - hcy) / S
            if u > hr / S - 1.1:
                return capc[max(0, tidx(L) - 2)]     # the visor
            if math.hypot(u + 0.4, v) < 0.8:
                return lt(capc[2], 0.3)              # the button on top
            return capc[tidx(L)]
        relief_paint(head, lambda x, y: lump(x - hcx, y - hcy, hr + 0.2 * S, hr, hr * 0.8, 2.3), flat_px)
        for dv in range(-5, 6):                      # its short brim, out over the brow
            tip = int(hcx + hr + 2.8 - abs(dv) * 0.35)
            for x in range(int(hcx + hr - 0.5), tip + 1):
                head.set(x, int(hcy + dv), capc[0] if x == int(hcx + hr - 0.5) else capc[1])
    else:
        # bare hair: slicked back (the guard), short, or long and full (down the back on the shoulders' sprite)
        hair = ch['hair']
        full = st in ('long', 'dancer')
        if k in ('thug', 'boss'):
            cl = hair_clumps(rng, hcx - 0.6 * S, hcy, hr, hr, (hcx + 6 * S, hcy), length=7.5, width=2.4, step=2.6)
        else:
            cl = hair_clumps(rng, hcx - 0.4 * S, hcy, hr + (0.6 if full else 0) * S, hr + (0.5 if full else 0) * S,
                             (hcx + 0.6 * S, hcy), length=7.0 if full else 5.6, width=3.2 if full else 2.8, flow=0.25)
        grow = 1.12 if full else 1.0

        def hh(x, y):
            base = lump(x - hcx + (0.4 * S if full else 0), y - hcy, hr * grow, hr * 0.94 * grow, hr * 0.95)
            return base + clump_h(cl, x, y) if base > 0 else 0

        def hair_px(x, y, L):
            if face(x, y, 1.0 if full else 1.4):
                return face_px(x, y, L)
            return clump_tone(hair, cl, x, y, L)
        relief_paint(head, hh, hair_px)
    if k == 'boss':
        # the cigar out of the corner of his mouth, its band, the ash and the ember at its end
        for t in range(10):
            x, y = int(hcx + hr + 1 + t * 0.92), int(hcy + 2.0 + t * 0.38)
            for d in (0, 1):
                c = hx('#6a4024') if d == 0 else hx('#4a2a16')
                if t == 2:
                    c = hx('#c8a040') if d == 0 else hx('#9a7a28')        # the band
                if t >= 8:
                    c = hx('#9a9a9a') if t == 8 else (hx('#ff7a2a') if d == 0 else hx('#c83a1a'))
                head.set(x, y + d, c)
    for sgn in (-1, 1):                              # ears
        ey = hcy + sgn * (hr * 0.94 + 0.2)
        if k in ('player', 'cueball') or st in ('hood', 'long', 'dancer'):
            continue
        for (dx, dy) in ((1, 0), (2, 0), (2, -sgn), (3, 0)):
            if head.get(int(hcx + dx), int(ey + dy))[3] < 100 or head.get(int(hcx + dx), int(ey + dy)) == OUTLINE:
                head.set(int(hcx + dx), int(ey + dy), ch['skin'][1 if dx < 3 else 2])
    if k == 'player':
        for sgn in (-1, 1):                          # his ears, just under the cap's edge
            ey = int(hcy + sgn * (hr * 0.96 + 0.6))
            for dx in (1, 2):
                head.set(int(hcx + dx), ey, ch['skin'][1])
    head.outline()
    return head


HEAD_W, HEAD_H = 36, 24   # the head sprite, centred on the head (FINE density)


def draw_head(ch):
    """The head of a standing character from straight above, facing +x, centred on its own middle so that it turns
    about it (CharacterAnim draws it over the shoulders, toward the aim): 36 x 24 pixels for 18 x 12 world px."""
    rng = random.Random(sum(ch['top'][2][:3]) * 37 + len(ch['kind']) * 11)
    full = torso_head(ch, rng)
    cv = Cv(HEAD_W, HEAD_H)
    x0, y0 = int(11.0 * FINE) - HEAD_W // 2, int(10.0 * FINE) - HEAD_H // 2
    cv.img = full.img.crop((x0, y0, x0 + HEAD_W, y0 + HEAD_H))
    cv.p = cv.img.load()
    if ch.get('scarf'):
        scarf_ring(cv, ch['scarf'])
    return cv


def draw_torso(ch):
    """The shoulders of a standing character from straight above, facing +x, the head left off (draw_head): 40 x 40
    pixels for 20 x 20 world px (FINE density)."""
    W = ch.get('canvas', 20) * FINE
    rng = random.Random(sum(ch['top'][2][:3]) * 31 + len(ch['kind']) * 7 + int(ch['sh'][1] * 10))
    cv = Cv(W, W)
    if ch.get('strap'):
        # the satchel, on his left hip, behind: under the edge of the jacket
        bag, lea = Cv(W, W), ch['strap']
        x0, y0 = int((9.6 - ch['sh'][0] - 1.5) * FINE), int((10.0 - 6.6) * FINE)
        for y in range(9):
            for x in range(8):
                if (x in (0, 7)) and (y in (0, 8)):
                    continue
                bag.set(x0 + x, y0 + y, lea[3] if x == 7 else lea[1] if y > 5 or x == 0 else lea[2])
        for x in range(1, 7):
            bag.set(x0 + x, y0 + 5, lea[0])                              # the flap's edge
        bag.set(x0 + 4, y0 + 6, hx('#e0b040'))                           # its buckle
        bag.outline()
        cv.over(bag)
    cv.over(torso_body(ch, rng))
    return cv


def chest_px(ch, u, v, L, hx_, hy_):
    """Front of torso while lying on the back. u toward the head, v across."""
    k = ch['kind']
    if k == 'civ':
        return civ_chest_px(ch, u, v, L, hx_, hy_)
    i = tidx(L)
    if k == 'player':
        if u > hx_ - 1.2 and abs(v) < 3.2:
            return ch['top'][min(3, i + 1)]      # the funnel collar
        if abs(0.6 * u + 0.8 * v - 0.3) < 0.55:
            return ch['strap'][i]                # the satchel's strap across his chest
        if u < -0.6 and abs(v) < 0.5 + (-0.6 - u) * 0.35:
            return ch['knit'][i]                 # his sweater, where the coat opens below the chest
        if u >= -0.6 and abs(v) < 0.5:
            return ch['lining'][2] if int(u * 0.8 + 20) % 2 else ch['top'][max(0, i - 1)]   # its placket, buttoned
        return ch['top'][i]
    if k == 'thug':
        if abs(v) < 0.3 + 0.38 * (u + hx_) and u > -hx_ + 1.0:
            if abs(v) < 0.6 and -1.5 < u < hx_ - 0.8:
                return hx('#8a1a3a') if i >= 2 else hx('#5a1028')   # skinny tie
            return ch['shirt'][min(i, 2)]
        return ch['top'][i]
    if k == 'heavy':
        if abs(v) < 0.5:
            return WHITE[1]
        if hy_ - 1.6 < abs(v) < hy_ - 0.7:
            return WHITE[max(1, i)]
        return ch['top'][i]
    if k == 'brute':
        if u > hx_ - 1.4 and abs(v) < 2.0:
            return ch['skin'][i]
        if abs(v) > hy_ - 1.2:
            return ch['skin'][i]
        return ch['top'][i]
    if k == 'boss':
        if abs(abs(v) - (0.4 + 0.42 * (u + hx_ * 0.6))) < 0.45 and u > hx_ - 3.4:
            return ch['chain'][min(3, i + 1)]    # the gold chain on his chest
        if abs(v) < 0.5 + 0.42 * (u + hx_ * 0.6) and u > hx_ - 3.0:
            return ch['skin'][i]                 # the shirt open on it
        if abs(v) < 1.9:
            return ch['shirt'][min(i, 2)]
        if abs(v) < 2.4:
            return ch['top'][min(3, i + 1)]      # the jacket's lapels
        return ch['top'][i]
    return ch['top'][i]


def face_px(ch, u, v, L, r):
    """Head seen from the front (lying on the back). u toward top of head."""
    k = ch['kind']
    if k == 'civ':
        return civ_face_px(ch, u, v, L, r)
    i = tidx(L)
    if k == 'player':
        if u > 1.5:
            return ch['cap'][i]                  # his cap, pushed back
        if u > 0.2 and abs(v) > 2.3 - 0.3 * u:
            return ch['hair'][i]                 # his hair either side of his face
        if u < -0.9:
            return ch['lining'][max(1, i)]       # the gaiter up over his mouth
    if k == 'thug' and u > 1.3:
        return ch['hair'][i if int(v + 20) % 2 else max(0, i - 1)]
    if k == 'brute' and u > 1.1:
        return ch['bandana'][i]
    if k == 'heavy' and L > 0.95:
        return lt(ch['skin'][2], 0.6)
    if k == 'cueball' and ch.get('worn') and -0.2 < u < 1.5:
        return ch['shades'][3 if v < -0.6 else 2]                             # the shades, still on him
    if k == 'boss':
        if u > 1.0:
            return ch['hair'][i if int(v * 1.5 + 20) % 2 else max(0, i - 1)]   # grey, combed back
        if u < -0.6 and abs(v) > r - 1.3:
            return ch['skin'][max(0, i - 1)]     # the jowls
    return ch['skin'][i]


def sleeve_col(ch, k_, L, side):
    i = tidx(L)
    if ch['kind'] == 'brute':
        return ch['skin'][i]
    if ch['kind'] == 'heavy' and abs(side) < 0.3:
        return WHITE[max(1, i)]
    return ch['top'][i]


POSE_DEAD = dict(torso=(15.0, 11.4, -0.1, 4.6, 4.8), head_ang=-0.38, head_r=3.6,
                 arms=[[(21.0, 3.2), (25.6, 2.0)], [(17.4, 19.2), (12.6, 19.6)]],
                 legs=[[(11.0, 9.0), (7.0, 5.8), (3.0, 3.6)], [(11.0, 13.6), (7.6, 16.2), (4.0, 18.6)]])


def splat(cv, cx, cy, rx, ry, rng, ragged=0.35, cols=None):
    cols = cols or (BLOOD_POOL, BLOOD[1], BLOOD[2])
    for y in range(int(cy - ry - 2), int(cy + ry + 3)):
        for x in range(int(cx - rx - 2), int(cx + rx + 3)):
            e = ((x + 0.5 - cx) / rx) ** 2 + ((y + 0.5 - cy) / ry) ** 2
            if e <= 1.0 - ragged * rng.random() + ragged * 0.5:
                c = cols[0] if e > 0.55 else cols[1]
                cv.set(x, y, c)
    cv.set(int(cx - rx * 0.3), int(cy - ry * 0.3), cols[2])


def draw_body(ch, w, h, pose, dead=False, headless=False, seed=0):
    rng = random.Random(1337 + seed)
    cv = Cv(w, h)
    tcx, tcy, tang, thx, thy = pose['torso']
    neck = rot(tcx, tcy, tang, thx + 0.2, 0)
    ha = pose['head_ang']
    hr = pose['head_r']
    hcx, hcy = neck[0] + math.cos(ha) * (hr - 0.5), neck[1] + math.sin(ha) * (hr - 0.5)

    blood = Cv(w, h)
    if dead and not headless:
        splat(blood, hcx + 0.8, hcy + 1.2, hr + 1.4, hr + 0.6, rng)
    if headless:
        splat(blood, neck[0] + 1.6, neck[1] + 0.4, 2.6, 2.4, rng)
        for _ in range(9):
            a = ha + rng.uniform(-1.0, 1.0)
            d = rng.uniform(3.0, 8.0)
            x, y = neck[0] + math.cos(a) * d, neck[1] + math.sin(a) * d
            blood.set(x, y, BLOOD[rng.choice([1, 2, 2])])
            if rng.random() < 0.4:
                blood.set(x + 1, y, BLOOD[1])
    cv.over(blood)
    if ch['kind'] == 'player':
        cv.over(coat_spread(ch, w, h, tcx, tcy, tang, thx - 0.8, thy, 9.0, 4.4))

    # legs + shoes
    legs = Cv(w, h)
    for leg in pose['legs']:
        fill_capsule(legs, leg, 1.55, lambda k, L, s, i, t: tone(ch['pants'], L))
    for leg in pose['legs']:
        (ax, ay), (bx, by) = leg[-2], leg[-1]
        a = math.atan2(by - ay, bx - ax)
        fx, fy = bx + math.cos(a) * 0.4, by + math.sin(a) * 0.4
        fill_shape(legs, fx, fy, 1.5, 1.45, lambda u, v, L: tone(ch['shoe'], L), ang=a)
    legs.outline()
    cv.over(legs)

    # torso
    torso = Cv(w, h)
    fill_shape(torso, tcx, tcy, thx, thy, lambda u, v, L: chest_px(ch, u, v, L, thx, thy),
               ang=tang, kind='rect', bevel=2.2, corner=1.6, taper=0.22)
    if headless:
        def stump(u, v, L):
            d = math.hypot(u / 1.25, v / 2.0)
            if d < 0.35:
                return BONE
            if d < 0.6:
                return FLESH_L if L > 0.7 else FLESH
            return BLOOD[2] if d < 0.85 else BLOOD[1]
        sx, sy = rot(tcx, tcy, tang, thx - 0.2, 0)
        fill_shape(torso, sx, sy, 1.6, 2.4, stump, ang=tang)
        for (du, dv) in [(1.3, -1.6), (1.4, 0.8), (1.0, 2.2), (1.2, -0.4)]:
            px_, py_ = rot(sx, sy, tang, du, dv)
            torso.set(px_, py_, BLOOD[rng.choice([1, 2])])
    torso.outline()
    cv.over(torso)

    # arms + hands
    arms = Cv(w, h)
    for sgn, arm in zip((-1, 1), pose['arms']):
        sh = rot(tcx, tcy, tang, thx - 1.4, sgn * (thy - 0.7))
        pts = [sh] + arm
        fill_capsule(arms, pts[:-1] + [pts[-1]], 1.15,
                     lambda k, L, s, i, t: sleeve_col(ch, k, L, s))
    for arm in pose['arms']:
        hx_, hy_ = arm[-1]
        fill_shape(arms, hx_, hy_, 1.3, 1.3, lambda u, v, L: tone(ch['skin'], L))
    arms.outline()
    cv.over(arms)

    if not headless:
        head = Cv(w, h)
        fill_shape(head, hcx, hcy, hr, hr, lambda u, v, L: face_px(ch, u, v, L, hr), ang=ha, pad=0.05)
        k = ch['kind']
        if k == 'player':
            for vv in (-2.0, 0.0, 2.0):
                head.set(*rot(hcx, hcy, ha, hr + 0.5, vv), ch['hair'][2])
        eye = hx('#2a1420')
        for vv in (-1.5, 1.5):
            ex, ey = rot(hcx, hcy, ha, 0.1, vv)
            head.set(ex, ey, eye)
        if k == 'player':
            # his scarf, pulled down off his mouth
            for vv in (-1.5, -0.5, 0.5, 1.5):
                head.set(*rot(hcx, hcy, ha, -3.0, vv), ch['lining'][1])
        mx, my = rot(hcx, hcy, ha, -2.0, 0.2)
        head.set(mx, my, BLOOD[0] if dead else dk(ch['skin'][1], 0.3))
        if dead:
            head.set(*rot(hcx, hcy, ha, -2.0, 1.2), BLOOD[2])
            head.set(*rot(hcx, hcy, ha, 0.9, -0.6), BLOOD[2])
        head.outline()
        cv.over(head)
    return cv


def coat_spread(ch, w, h, cx, cy, ang, hip, half, length, flare):
    """The runner's coat spread on the floor under him, plainly painted: from his hips (hip px behind the torso's
    middle at (cx, cy), the head along ang) a skirt `length` long, `half` wide at the belt and `flare` wider a side at
    its hem, a tone a half, the vent open on the lining."""
    cv = Cv(w, h)
    top, lin = ch['top'], ch['lining']
    ca, sa = math.cos(ang), math.sin(ang)
    for y in range(h):
        for x in range(w):
            dx, dy = x + 0.5 - cx, y + 0.5 - cy
            u, v = dx * ca + dy * sa, -dx * sa + dy * ca
            t = (-hip - u) / length
            if t < 0 or t > 1 - 0.12 * (abs(v) / (half + flare)) ** 2:
                continue
            if abs(v) > half + flare * t:
                continue
            if abs(v) < 0.2 + 1.1 * t and t > 0.25:
                cv.set(x, y, lin[1])             # the lining, in the open vent
            else:
                cv.set(x, y, top[2] if v < 0 else top[1])
    cv.outline()
    return cv


RAG_SKIRT_W, RAG_SKIRT_H = 25, 15


def rag_skirt(ch):
    """That skirt as a part of a body on the floor (Ragdoll draws it under him, hung from his belt): its top edge at
    the belt, the hem toward +y."""
    return coat_spread(ch, RAG_SKIRT_W, RAG_SKIRT_H, RAG_SKIRT_W / 2, -0.5, -math.pi / 2, 0.0, 6.6, RAG_SKIRT_H - 1.5, 4.6)


TAIL_W, TAIL_H, TAIL_ROOT = 24, 18, 3   # a half of the standing runner's skirt (FINE px); its hinge: TAIL_ROOT px in


def player_tail(ch, side):
    """A half of the duster's skirt flying behind him, at FINE density (side -1: his left, the sprite's -y half): from
    its root (the right edge's middle, TAIL_ROOT px in, where the game hinges it on his back) to its hem toward -x,
    widening a little, long folds along it lit as the cloth they are, the hem a shade darker, the petrol lining
    showing along the vent (its inner edge). The game swings it, opens the vent and draws it out with his speed
    (src/game/entities/Skirt.js, CharacterAnim.drawSkirt)."""
    cv = Cv(TAIL_W, TAIL_H)
    x0, cy, L = TAIL_W - TAIL_ROOT, TAIL_H / 2, TAIL_W - TAIL_ROOT - 1.5
    top, lin = ch['top'], ch['lining']

    def geom(x, y):
        t = (x0 - x) / L
        if t < -0.2 or t > 1:
            return None
        tt = max(0.0, t)
        v = (cy - y) * side                      # + toward the vent
        w = 6.4 + 1.6 * tt
        if abs(v) > w or tt > 1 - 0.1 * (abs(v) / w) ** 2:
            return None
        return tt, v, w

    def h(x, y):
        g = geom(x, y)
        if not g:
            return 0.0
        tt, v, w = g
        ripple = math.sin(v * 0.62 * side + tt * 2.2 + side) * (0.25 + 1.1 * tt)
        return max(0.05, (2.4 - 0.9 * tt) * min(1.0, (w - abs(v)) / 2.0) + ripple)

    def colour(x, y, L_):
        tt, v, w = geom(x + 0.5, y + 0.5)
        i = tidx(L_)
        if tt > 0.25 and w - v < 2.0:
            return lin[max(1, min(2, i))]        # the lining, along the vent
        if tt > 0.9:
            return top[max(0, i - 1)]            # the hem
        return top[3] if L_ > 0.93 else top[min(2, i)]
    relief_paint(cv, h, colour)
    return cv


def gib_head(ch):
    cv = Cv(9, 9)
    hr = 3.4
    fill_shape(cv, 5.0, 4.5, hr, hr, lambda u, v, L: head_top_px(ch, u, v, L, hr), ang=0.5)
    # ragged neck at the -x/+y side
    for (x, y, c) in [(1, 5, BLOOD[1]), (1, 4, BLOOD[2]), (2, 6, BLOOD[2]), (2, 7, BLOOD[1]),
                      (2, 5, FLESH), (3, 7, BLOOD[2]), (1, 6, BLOOD[0]), (3, 6, BONE)]:
        cv.set(x, y, c)
    if ch['kind'] == 'player':
        cv.set(7, 6, hx('#0e0a16'))
        cv.set(6, 7, hx('#0e0a16'))
    cv.outline()
    return cv


def gib_arm(ch):
    s = ch.get('sleeve') or (ch['skin'] if ch['kind'] == 'brute' else ch['top'])
    pal = {'r': BLOOD[1], 'R': BLOOD[2], 'b': BONE, 's': s[3], 'S': s[2], 'd': s[1],
           'c': s[1] if ch['kind'] != 'heavy' else WHITE[2],
           'h': ch['skin'][3], 'H': ch['skin'][2], 'k': ch['skin'][1]}
    if ch['kind'] == 'heavy':
        pal['s'] = WHITE[2]
    if ch['kind'] == 'brute':
        pal['c'] = s[2]
    rows = ["...........",
            ".rRssssscH.",
            ".bRSSSSddk.",
            "..........."]
    return ascii_cv(rows, pal)


def gib_leg(ch):
    p, sh = ch['pants'], ch['shoe']
    pal = {'r': BLOOD[1], 'R': BLOOD[2], 'b': BONE, 'P': p[3], 'p': p[2], 'q': p[1],
           'O': sh[3], 'o': sh[2], 'Q': sh[1]}
    rows = [".............",
            "..RPPPPPPoOO.",
            ".brppppppooo.",
            ".rRqqqqqqQQQ.",
            "............."]
    return ascii_cv(rows, pal)


def gib_torso(ch, seed):
    rng = random.Random(4242 + seed)
    cv = Cv(14, 12)
    tear = []
    t = 0.0
    for _ in range(7):
        t = max(-0.9, min(0.9, t + rng.uniform(-0.9, 0.9)))
        tear += [t, t]

    def px(u, v, L):
        tu = -1.6 + tear[int(v + 6.5) % 14]
        if u < tu:
            if tu - u < 1.0:
                return BLOOD[2]
            if L > 0.8:
                return FLESH
            return BLOOD[1] if L > 0.45 else BLOOD[0]
        return chest_px(ch, u, v, L, 5.2, 4.6)
    fill_shape(cv, 7.6, 6.0, 5.6, 4.6, px, kind='rect', bevel=2.0, corner=2.2)
    # ragged edge + rib bones poking out
    for (x, y) in [(2, 2), (2, 9), (2, 6)]:
        cv.set(x, y, CLEAR)
    for (x, y, c) in [(3, 3, BONE), (3, 4, BONE), (2, 4, BONE_D), (3, 7, BONE), (3, 8, BONE), (2, 7, BONE_D),
                      (4, 5, FLESH_L), (1, 5, BLOOD[0])]:
        cv.set(x, y, c)
    cv.outline()
    return cv


def gib_chunk(i):
    rng = random.Random(900 + i)
    cv = Cv(6, 5)
    base = [BLOOD[1], FLESH, BLOOD[2]][i]
    hi = [BLOOD[3], FLESH_L, FLESH][i]
    dark = [BLOOD[0], dk(FLESH, 0.35), BLOOD[0]][i]

    def px(u, v, L):
        if L > 0.85:
            return hi
        if L < 0.45:
            return dark
        return base
    fill_shape(cv, 3.0, 2.5, 2.1 + rng.uniform(-0.2, 0.2), 1.6, px, ang=rng.uniform(-0.4, 0.4), pad=0.15)
    cv.set(rng.choice([1, 4]), rng.choice([1, 3]), CLEAR)
    if i == 1:
        cv.set(2, 2, dk(FLESH, 0.3))
        cv.set(3, 3, dk(FLESH, 0.3))
    if i == 2:
        cv.set(3, 1, BONE)
        cv.set(4, 1, BONE)
        cv.set(4, 2, BONE_D)
    cv.outline(GORE_OL)
    return cv


def gib_eye():
    pal = {'w': hx('#f4f0ea'), 'W': hx('#c8c0c8'), 'p': hx('#1a1a2a'), 'i': hx('#2a7ab0'), 'r': BLOOD[2], 'R': BLOOD[1]}
    return ascii_cv([".wW",
                     "wpW",
                     "rRr"], pal, ol=None)


# --------------------------------------------------------------------------
# Civilians (ambient passers-by, src/game/entities/Civilian.js)
# Light, varied everyday clothes so they never read as guards: a mustard windbreaker, a coral blouse with long
# hair, a beige trench coat with a flat cap, a sage hoodie with the hood up. kind='civ' routes the shared
# character painters (torso, bodies, gibs, ragdoll parts) to the civ_*_px functions below; 'style' picks the outfit.
# --------------------------------------------------------------------------

CIVILIANS = {
    'civ1': dict(kind='civ', style='jacket', top=ramp('#d9a441', 0.46, 0.22, 0.4), trim=ramp('#3a5a8a'),
                 pants=ramp('#4f6a98', 0.45, 0.22, 0.3), shoe=ramp('#e8e4da', 0.4, 0.2, 0.2),
                 hair=ramp('#5a3a24', 0.5, 0.25, 0.4), skin=SKIN, sh=(4.0, 8.0)),
    'civ2': dict(kind='civ', style='long', top=ramp('#f0a08a', 0.46, 0.22, 0.35), pants=ramp('#3a2c4a'),
                 shoe=ramp('#7a1f2a', 0.45, 0.22, 0.3), hair=ramp('#2a1a1e', 0.5, 0.25, 0.6),
                 skin=ramp('#d99a76', 0.46, 0.22, 0.3), sh=(3.8, 7.4)),
    'civ3': dict(kind='civ', style='trench', top=ramp('#bfae86', 0.45, 0.22, 0.35), cap=ramp('#5a5a66', 0.45, 0.22, 0.4),
                 pants=ramp('#55555f'), shoe=ramp('#3a2a20', 0.4, 0.2, 0.3),
                 skin=ramp('#e2b08e', 0.46, 0.22, 0.3), sh=(4.2, 8.2)),
    'civ4': dict(kind='civ', style='hood', top=ramp('#8fbf6a', 0.46, 0.22, 0.35), pants=ramp('#4a4a3a'),
                 shoe=ramp('#ecebf2', 0.4, 0.2, 0.2), skin=ramp('#c88a60', 0.46, 0.22, 0.3), sh=(4.1, 8.1)),
    # the dancers of the bar's VIP room: big hair, bare skin, two bright pieces and heels
    'dancer1': dict(kind='civ', style='dancer', top=ramp('#ff3d8a', 0.46, 0.22, 0.35), pants=SKIN, sleeve=SKIN,
                    shoe=ramp('#ff3d8a', 0.45, 0.22, 0.3), hair=ramp('#e8c66a', 0.5, 0.25, 0.35), skin=SKIN,
                    sh=(3.7, 7.2)),
    'dancer2': dict(kind='civ', style='dancer', top=ramp('#2fd6e0', 0.46, 0.22, 0.35),
                    pants=ramp('#b9774f', 0.46, 0.22, 0.3), sleeve=ramp('#b9774f', 0.46, 0.22, 0.3),
                    shoe=ramp('#f4f2ec', 0.4, 0.2, 0.2), hair=ramp('#b0382a', 0.5, 0.25, 0.4),
                    skin=ramp('#b9774f', 0.46, 0.22, 0.3), sh=(3.7, 7.2)),
    # the one asleep on his cardboard: an old olive coat, a woolly hat
    'tramp': dict(kind='civ', style='trench', top=ramp('#6f7350', 0.45, 0.22, 0.35), cap=ramp('#8a3a2a', 0.45, 0.22, 0.4),
                  pants=ramp('#3e3a34'), shoe=ramp('#2a2420', 0.4, 0.2, 0.3),
                  skin=ramp('#c8906c', 0.46, 0.22, 0.3), sh=(4.3, 8.3)),
}
CHARS.update(CIVILIANS)
# added after the others: a painter seeds itself by a character's place in CHARS, theirs must not move
CHARS.update(dict(
    # more of the bar's customers: a businessman going bald in his charcoal suit and red tie, a young one in a royal blue
    # tracksuit (white stripes down the sleeves), a redhead in an emerald top, a blond lad in a stonewashed denim jacket
    civ5=dict(kind='civ', style='suit', top=ramp('#4a4e5a', 0.45, 0.22, 0.35), pants=ramp('#3e424c'),
              shoe=ramp('#2a1a14', 0.4, 0.2, 0.35), hair=ramp('#6a5a4c', 0.5, 0.25, 0.4),
              skin=ramp('#e6ae8a', 0.46, 0.22, 0.3), sh=(4.3, 8.4)),
    civ6=dict(kind='civ', style='track', top=ramp('#2a46a8', 0.46, 0.22, 0.35), pants=ramp('#2a46a8', 0.46, 0.22, 0.35),
              shoe=ramp('#ecebf2', 0.4, 0.2, 0.2), hair=ramp('#2a1a12', 0.5, 0.25, 0.5),
              skin=ramp('#b8805a', 0.46, 0.22, 0.3), sh=(4.0, 7.9)),
    civ7=dict(kind='civ', style='long', top=ramp('#1f8a5a', 0.46, 0.22, 0.35), pants=ramp('#22202a'),
              shoe=ramp('#b8202a', 0.45, 0.22, 0.3), hair=ramp('#a0461e', 0.5, 0.25, 0.4),
              skin=ramp('#efc2a0', 0.46, 0.22, 0.3), sh=(3.8, 7.4)),
    civ8=dict(kind='civ', style='jacket', top=ramp('#6a8ab8', 0.46, 0.22, 0.35), trim=ramp('#e8dcc0', 0.4, 0.2, 0.3),
              pants=ramp('#2e3a52'), shoe=ramp('#5a3a22', 0.4, 0.2, 0.3), hair=ramp('#d8b860', 0.5, 0.25, 0.4),
              skin=ramp('#e2b08e', 0.46, 0.22, 0.3), sh=(4.1, 8.1)),
))
# the boss, his own man (level `looks`): older and heavy, a cream suit over a black shirt open on his chest, a gold
# chain, grey hair combed straight back, a cigar in the corner of his mouth; the same man as the comic's dead boss
# (tools/generate_comic.py head_boss: the grey hair, the jowls, the cream suit)
CHARS['boss'] = dict(kind='boss', top=ramp('#e2d6b6', 0.46, 0.22, 0.3), pants=ramp('#d6c8a6', 0.46, 0.22, 0.3),
                     shoe=ramp('#4a2a1a', 0.4, 0.2, 0.35), hair=ramp('#a8a8b0', 0.5, 0.26, 0.35),
                     shirt=ramp('#2a2228', 0.4, 0.2, 0.4), chain=ramp('#e8b840', 0.5, 0.25, 0.45),
                     skin=ramp('#d49a74', 0.46, 0.22, 0.3), sh=(5.0, 9.6))


# --------------------------------------------------------------------------
# CUEBALL, level 1's boss: the comic's heavy (tools/comic/STYLE.md, the cast), from straight above. A wall on short
# legs: the widest shoulders in the game, in black, on a canvas of their own (24 x 24 world px); no neck; a huge bald
# bone dome; wrap-round fluorescent yellow shades wider than his head, the brightest thing on him: a yellow band
# across the front of the dome, which shows where he faces. `_head_hurt`: after the first hit (entities/Boss.js) the
# shades knocked askew, a lens cracked, blood running over the dome. items/shades: what skitters off him when he dies.
# --------------------------------------------------------------------------
FLUO = [hx('#6e8208'), hx('#b0cc10'), hx('#e6ff1a'), hx('#fbffb4')]
CHARS['cueball'] = dict(kind='cueball', top=ramp('#2a2832', 0.5, 0.25, 0.42), pants=ramp('#1e1c26', 0.45, 0.22, 0.3),
                        shoe=ramp('#16141c', 0.4, 0.2, 0.45), skin=ramp('#eee4cc', 0.42, 0.2, 0.3), shades=FLUO,
                        sleeve=ramp('#2a2832', 0.5, 0.25, 0.42), sh=(5.5, 11.4), canvas=24, head=4.7)


def cueball_top_px(ch, u, v, L, r):
    """His head at the world's pixel size (a gib, a body lying face down): the bare dome, the rolls of his nape."""
    sk = ch['skin']
    if L > 0.93:
        return lt(sk[3], 0.6)
    if u < -r * 0.45 and abs(math.hypot(u, v) - r * 0.72) < 0.5:
        return sk[1]
    return sk[tidx(L)]


def cueball_shoulder_px(ch, u, v, i, hd, hr):
    """His jacket from above: its collar rolled up round the dome (no neck shows), the padded shoulders' edge."""
    top = ch['top']
    if hr + 0.1 < hd < hr + 1.2:
        return top[min(3, i + 1)]
    if abs(v) > ch['sh'][1] - 1.6 and abs(u) < 2.2:
        return top[min(3, i + 1)]                # the pad's edge catches the light
    return top[i]


def cueball_jacket(body, ch, cx, cy, rx, ry):
    """What his black back shows: the yoke's seam from shoulder to shoulder, the vent at the bottom of the back."""
    top = ch['top']
    for j in range(int(cy - ry + 3 * FINE), int(cy + ry - 3 * FINE)):
        x = int(cx - rx * 0.42 - 1.6 * math.cos((j - cy) / ry * 1.5))
        if body.on(x, j) and body.get(x, j) != OUTLINE and abs(j - cy) > 1:
            body.set(x, j, top[0])
    for i in range(5):
        x = int(cx - rx + 1.5 + i)
        if body.on(x, int(cy)):
            body.set(x, int(cy), top[0])


def cueball_shades(u, v, hr, tilt=0.0, slip=0.0):
    """Where the shades are over a head of radius hr (pixels from its centre, +u the face): None off them, else
    (part, depth 0..1 from their front edge, across): 'lens' | 'arm' | 'bridge'. A wrap-round band, deepest at the
    front, wider than the head, its arms back to the ears; tilt (rad) and slip (px across): knocked askew."""
    v -= slip
    c, s = math.cos(-tilt), math.sin(-tilt)
    u, v = u * c - v * s, u * s + v * c
    R = hr + 1.0
    rho = math.hypot(u, v * 0.9)
    deep = 3.0 + 4.2 * max(0.0, u / R)
    if u < -1.5 or rho > R + 0.9 or rho < R - deep:
        return None
    k = (R + 0.9 - rho) / (deep + 0.9)
    if u < 3.4:
        return ('arm', k, v) if rho > R - 2.2 else None
    if abs(v) < 0.9 and rho > R - 1.6:
        return ('bridge', k, v)
    return ('lens', k, v)


def cueball_dome(head, ch, skull, hcx, hcy, hr):
    """The bald dome and the shades on it. ch['hurt']: the head after the first hit."""
    sk, Y, hurt = ch['skin'], ch['shades'], ch.get('hurt')
    tilt, slip = (0.42, 1.6) if hurt else (0.0, 0.0)

    def dome_px(x, y, L):
        u, v = x + 0.5 - hcx, y + 0.5 - hcy
        d = math.hypot(u, v)
        if L > 0.965:
            return lt(sk[3], 0.7)                        # the shine on the bone
        if u < -hr * 0.42 and (abs(d - hr * 0.74) < 0.6 or (abs(d - hr * 0.5) < 0.55 and abs(v) < hr * 0.42)):
            return sk[1]                                 # the rolls of his nape
        return sk[tidx(L)]
    relief_paint(head, skull, dome_px)
    for y in range(head.h):
        for x in range(head.w):
            u, v = x + 0.5 - hcx, y + 0.5 - hcy
            at = cueball_shades(u, v, hr, tilt, slip)
            if at is None:
                # their shadow on the dome, just behind them
                if head.on(x, y) and head.get(x, y) != OUTLINE and cueball_shades(u + 1.2, v, hr, tilt, slip):
                    head.set(x, y, dk(head.get(x, y), 0.2))
                continue
            part, k, across = at
            if part == 'arm':
                c = Y[1] if k > 0.5 else Y[2]
            elif part == 'bridge':
                c = Y[0]
            else:
                c = Y[3] if (k < 0.3 and across < -1.5) else Y[1] if k > 0.78 else Y[2]   # a glint along the lit lens
            head.set(x, y, c)
    nose = (hcx + hr + 1.9 + (0.6 if hurt else 0), hcy + (0.6 if hurt else 0))
    for dx in (0, 1):
        head.set(int(nose[0] + dx), int(nose[1]), sk[2] if dx == 0 else sk[1])   # the tip of his nose, under them
    if not hurt:
        return
    # the lens on his right cracked: a star of cracks from where it was struck, a chip gone out of it
    c0 = (hcx + hr * 0.62, hcy + hr * 0.78)
    crack = hx('#3a4406')
    for (dx, dy, n) in ((1.0, -0.2, 4), (-0.5, 1.0, 3), (0.4, -1.0, 4), (-1.0, -0.3, 3)):
        for t in range(n):
            x, y = int(c0[0] + dx * t), int(c0[1] + dy * t)
            if head.on(x, y) and head.get(x, y) in Y:
                head.set(x, y, crack)
    for (dx, dy) in ((0, 0), (1, 1)):
        head.set(int(c0[0] + dx), int(c0[1] + dy), hx('#241a22'))
    # blood: a gash on the dome, running down over the brow to the shades
    for (dx, dy, c) in ((-2, -3, 1), (-1, -3, 2), (0, -3, 2), (1, -2, 2), (2, -2, 1), (1, -3, 0), (3, -2, 2), (4, -1, 2),
                        (5, -1, 1), (6, -1, 2), (4, -2, 1), (-3, -2, 1), (-1, -2, 2), (0, -1, 1), (2, -4, 2), (-4, -1, 2)):
        x, y = int(hcx + dx), int(hcy + dy)
        if head.on(x, y) and head.get(x, y) != OUTLINE:
            head.set(x, y, BLOOD[c])


def shades_item():
    """His shades on the floor, from above (the world's pixel size): the two lenses in a band, the arms folded back."""
    return ascii_cv(['.............',
                     '.dYYYYkyyyyd.',
                     '.dyyyykyyKyd.',
                     '.d.........d.',
                     '.d.........d.',
                     '.............'], {'Y': FLUO[3], 'y': FLUO[2], 'd': FLUO[1], 'k': FLUO[0], 'K': hx('#3a4406')})


# ---- LUCKY, the man with the match (tools/comic/STYLE.md, the cast; level `looks`): a beanpole all in black, his
# hair slicked flat, and his sign from above: a pink scarf, a ring of it round his neck (painted on his head's sprite,
# round the head) and its end flying out behind him (a sprite of its own, lucky_scarf, that the game swings from his
# nape: entities/Enemy.js). Painted like a thug under it; the scarf is the only colour on him.
CHARS['lucky'] = dict(kind='thug', top=ramp('#24212c', 0.42, 0.2, 0.45), pants=ramp('#1c1a22'),
                      shoe=ramp('#141218', 0.3, 0.15, 0.25), hair=ramp('#17141c', 0.55, 0.3, 0.6),
                      shirt=ramp('#1a1820'), skin=SKIN, sh=(3.6, 7.4), scarf=ramp('#ff3a7a', 0.5, 0.25, 0.3))
SCARF_W, SCARF_H = 28, 12   # the scarf's flying end (FINE density: 14 x 6 world px), its knot end at x = 0


def scarf_ring(cv, sc):
    """The scarf round his neck seen from above, on the head's sprite (draw_head): a ring 2 world px wide all round
    the head, lit from the top left, a fold across it where it is knotted behind."""
    cx, cy = HEAD_W / 2, HEAD_H / 2
    for y in range(HEAD_H):
        for x in range(HEAD_W):
            if cv.p[x, y][3] > 100:
                continue
            u, v = x + 0.5 - cx, y + 0.5 - cy
            d = math.hypot(u, v)
            if 6.0 <= d < 11.0:
                lit = (-u - v) / (d * 1.414)                        # toward the top left
                c = sc[3] if lit > 0.55 and d > 8.5 else sc[2] if lit > -0.35 else sc[1]
                if u < -6 and abs(v - 1.5) < 0.8:
                    c = sc[0]                                       # the knot's fold, at the nape
                cv.p[x, y] = c
            elif 11.0 <= d < 12.0:
                cv.p[x, y] = OUTLINE


def lucky_scarf(sc):
    """The end of his scarf flying behind him: a band 5 world px wide and 14 long from its knot (x = 0, the middle of
    the left edge) to a forked tip, a wave along it, its upper edge lit, a fold down its length."""
    cv = Cv(SCARF_W, SCARF_H)
    for x in range(SCARF_W - 1):
        k = x / (SCARF_W - 1)
        mid = SCARF_H / 2 - 0.5 + math.sin(k * 5.2) * 1.3 * k         # it waves more toward its free end
        half = 2.4 + 2.2 * min(1, k * 2.2) - 0.8 * max(0, k - 0.7) / 0.3
        for y in range(SCARF_H):
            v = y + 0.5 - mid
            if abs(v) > half:
                continue
            if k > 0.86 and abs(v) < (k - 0.86) * 14:                # the fork at its tip
                continue
            c = sc[3] if v < -half + 1.4 else sc[1] if v > half - 1.6 else sc[2]
            if abs(v - 0.6) < 0.6 and 0.12 < k < 0.8:
                c = sc[1]                                           # the fold
            if x % 9 == 8 and abs(v) < half - 1:
                c = sc[0]                                           # creases across it
            cv.p[x, y] = c
    cv.outline()
    return cv


def civ_head_px(ch, u, v, L, r):
    """Head from above, face toward +u: hair, a flat cap or a hood."""
    i = tidx(L)
    st = ch['style']
    if st == 'hood':
        if u > r - 1.3:
            return ch['skin'][i]                      # face peeking out of the hood
        if u > r - 2.3:
            return ch['top'][max(0, i - 1)]           # hood rim
        return ch['top'][i]
    if st == 'trench':
        if u > r - 1.1:
            return ch['cap'][max(0, i - 2)]           # visor
        if math.hypot(u + 0.4, v) < 0.8:
            return lt(ch['cap'][2], 0.3)              # button on top
        return ch['cap'][i]
    if u > r - 1.55:
        return ch['skin'][i]
    if st == 'suit' and math.hypot(u + 0.3, v) < r * 0.62:
        return lt(ch['skin'][2], 0.3) if L > 0.95 else ch['skin'][i]     # his bald crown
    if st in ('long', 'dancer'):
        streak = int(math.floor(v * 1.3 + 40)) % 3 == 0
        return ch['hair'][max(0, i - 1) if streak else i]
    streak = int(math.floor(v * 0.8 + u * 0.5 + 40)) % 4 == 0
    return ch['hair'][max(0, i - 1) if streak else i]


def civ_shoulder_px(ch, u, v, L, hu, hv, hr):
    i = tidx(L)
    st = ch['style']
    hd = math.hypot(hu, hv)
    if hd < hr + 1.6 and hu + hv * 0.4 > -0.5:
        i = max(0, i - 1)                             # head shadow
    if st in ('long', 'dancer') and -hr - 1.6 < hu < 0.4 and abs(hv) < hr * 0.75:
        return ch['hair'][max(0, i - 1)]              # hair down the back
    if st == 'hood' and hu < -0.6 and hd < hr + 1.7:
        return ch['top'][max(0, i - 1)]               # hood folds behind the neck
    if st == 'trench' and hr + 0.1 < hd < hr + 1.4 and hu > -0.9:
        return lt(ch['top'][2], 0.22)                 # turned-up collar
    if st == 'dancer':
        return ch['top'][i] if -0.9 < u < 0.2 else ch['skin'][i]   # bare shoulders, a strap across the back
    if st == 'jacket' and -0.7 < u < 0.5:
        return ch['trim'][i]                          # stripe across the back
    if st == 'suit' and hr + 0.1 < hd < hr + 0.8 and hu > -0.6:
        return WHITE[max(1, i)]                       # his shirt collar
    if st == 'track' and abs(abs(v) - 3.3) < 0.32:
        return WHITE[max(1, i)]                       # the stripes down the sleeves
    return ch['top'][i]


def civ_chest_px(ch, u, v, L, hx_, hy_):
    """Front of the torso, lying on the back (u toward the head)."""
    i = tidx(L)
    st = ch['style']
    if st == 'jacket':
        if abs(v) < 0.35:
            return ch['trim'][min(i, 2)]              # zip
    if st == 'long' and u > hx_ - 2.4 and abs(v) < 0.4 + (u - (hx_ - 2.4)) * 0.9:
        return ch['skin'][i]                          # neckline
    if st == 'dancer':
        return ch['top'][i] if hx_ - 3.4 < u < hx_ - 1.4 or u < -hx_ + 1.8 else ch['skin'][i]   # two pieces
    if st == 'trench':
        if abs(u + 0.6) < 0.5:
            return ch['top'][max(0, i - 2)]           # belt
        if abs(abs(v) - 1.7) < 0.4 and int(math.floor(u * 1.2 + 40)) % 2 == 0:
            return ch['top'][0]                       # double row of buttons
    if st == 'suit':
        if abs(v) < 0.3 + 0.38 * (u + hx_) and u > -hx_ + 1.0:
            if abs(v) < 0.6 and -1.5 < u < hx_ - 0.8:
                return hx('#b8202a') if i >= 2 else hx('#7a1018')   # his tie
            return WHITE[max(1, min(i, 2))]
    if st == 'track':
        if abs(v) < 0.25:
            return WHITE[1]                           # the zip
        if abs(v) > hy_ - 1.4 and abs(v) < hy_ - 0.8:
            return WHITE[max(1, i)]
    if st == 'hood':
        if u < -hx_ + 3.2 and abs(v) < 2.6:
            return ch['top'][max(0, i - 1)]           # front pocket
        if abs(abs(v) - 0.9) < 0.25 and u > hx_ - 2.6:
            return WHITE[max(1, i)]                   # drawstrings
    return ch['top'][i]


def civ_face_px(ch, u, v, L, r):
    """Head from the front (lying on the back, u toward the top of the head)."""
    i = tidx(L)
    st = ch['style']
    if st == 'hood' and (u > 0.6 or abs(v) > r - 1.0):
        return ch['top'][i]
    if st == 'trench' and u > 1.1:
        return ch['cap'][i]
    if st in ('jacket', 'long', 'dancer', 'track') and (u > 1.2 or (st in ('long', 'dancer') and abs(v) > r - 1.0)):
        return ch['hair'][i]
    if st == 'suit' and u > 0.9 and abs(v) > r - 1.2:
        return ch['hair'][i]                          # the fringe left round his bald head
    return ch['skin'][i]


# --------------------------------------------------------------------------
# Weapons (+x = muzzle)
# --------------------------------------------------------------------------

STEEL = ramp('#585a70', 0.5, 0.25, 0.45)
STEEL_L = ramp('#8a90a4', 0.45, 0.22, 0.35)
WOOD = ramp('#9a5a2c', 0.45, 0.22, 0.3)
OLIVE = ramp('#5d6a32', 0.45, 0.22, 0.3)
BRASS = ramp('#e0a830', 0.45, 0.22, 0.4)
DRAB = ramp('#4c5236', 0.45, 0.22, 0.3)    # olive drab polymer (the shotgun's stock and forend)


# ---- weapons at FINE density, each drawn by hand side on as the real thing (sights, serrations, a trigger guard,
# checkering, grain, tape, rust, old blood), lit from the top. A gun's barrel ends on its last column but one (the
# outline beyond it): the game fires from there, on the line `bore` (src/game/data/weapons.js, tests/muzzle.test.mjs)
def drawn(w, h, segs):
    """A drawing laid out by hand at FINE density: segs = { row: [(x, 'chars'), ...] } on a w x h grid of '.', one
    clear pixel kept all round for the outline."""
    g = [['.'] * w for _ in range(h)]
    for y, runs in segs.items():
        for x, s in runs:
            assert 1 <= y <= h - 2 and x >= 1 and x + len(s) <= w - 1, (w, h, x, y, s)
            for i, ch in enumerate(s):
                g[y][x + i] = ch
    return [''.join(r) for r in g]


def without(segs, runs):
    """segs less the runs that start at the x listed per row ({row: (x, ...)}): a gun with its magazine out"""
    return {y: [r for r in rs if r[0] not in runs.get(y, ())] for y, rs in segs.items()}


def weapon_breaks(W, pal, bat, knife, iron):
    """What the player's melee weapons break into (src/game/data/weapons.js `parts`, `bends`), cut from their own
    drawings so that every piece keeps its place on the weapon's line: the bat snapped across the taper of its
    handle (the handle with its splinters, the barrel with its own, raw pale wood at the break), the knife snapped
    at the guard (the handle with a stub of its tang, the blade), the tire iron bent up past the middle of its bar."""
    def put(rows, x, y, ch):
        rows[y] = rows[y][:x] + ch + rows[y][x + 1:]
    # the bat: where each row of the taper gives, the raw wood of the break, splinters left standing out of it
    cut = {2: 22, 3: 21, 4: 23, 5: 22, 6: 24}
    handle = [r[:cut[y]].ljust(25, '.') if y in cut else r[:25] for y, r in enumerate(bat)]
    head = [('.' * cut[y] + r[cut[y]:])[20:] if y in cut else r[20:] for y, r in enumerate(bat)]
    for y, c in cut.items():
        put(handle, c - 1, y, 'm')
        put(head, c - 20, y, 'm')
    put(handle, 21, 3, 'm'); put(handle, 22, 3, 'l'); put(handle, 22, 5, 'l')   # long splinters off the handle
    put(head, 22 - 20, 4, 'm'); put(head, 23 - 20, 6, 'l')                       # ... and off the barrel
    W['bat_handle'] = ascii_cv(handle, pal)
    W['bat_head'] = ascii_cv(head, pal)
    # the knife: the grip and guard with the stub of the tang; the blade, its base chipped
    hilt = [r[:14] + '..' for r in knife]
    put(hilt, 14, 4, 'M'); put(hilt, 14, 5, 'D')
    blade = ['.' + r[14:] for r in knife]
    put(blade, 1, 3, '.'); put(blade, 1, 7, '.')
    W['knife_handle'] = ascii_cv(hilt, pal)
    W['knife_blade'] = ascii_cv(blade, pal)
    # the tire iron bent up from the middle of its bar (each column past the bend raised a little more), a bright
    # stress mark on the outside of the bend
    rows = ['.' * len(iron[0]) for _ in range(len(iron) + 1)]
    for y, r in enumerate(iron):
        for x, ch in enumerate(r):
            if ch != '.':
                put(rows, x, y + 1 - (round((x - 15) * 0.32) if x > 15 else 0), ch)
    put(rows, 15, 9, 'S'); put(rows, 16, 9, 'S')
    W['tire_iron_bent'] = ascii_cv(rows, pal)


def weapons():
    W = {}
    gun = {'L': STEEL[3], 'M': STEEL[2], 'D': STEEL[1], 'K': STEEL[0], 'w': WOOD[3], 'W': WOOD[2],
           'V': WOOD[1], 'G': hx('#2a2230'), 'g': hx('#4a3e50'), 'S': STEEL_L[3], 's': STEEL_L[2],
           'c': hx('#36e8f0'), 'C': hx('#1a98a8'), 'o': OLIVE[3], 'O': OLIVE[2], 'Q': OLIVE[1], 'q': OLIVE[0],
           'y': hx('#f9c80e'), 'Y': hx('#b88a08'), 'r': hx('#b8262c'), 'R': hx('#7a1420'), 't': hx('#d8d8e0'),
           'T': hx('#2a2230'), 'x': hx('#7a4a32'), 'n': hx('#1c1820'), 'h': hx('#5a0c16'),
           'a': DRAB[3], 'A': DRAB[2], 'z': DRAB[1], 'Z': DRAB[0],
           # the pool cue: dark butt, its linen wrap, pale maple, the ferrule, the chalked tip (and their undersides)
           'B': hx('#3a2418'), 'k': hx('#241610'), 'b': hx('#6a4426'), 'j': hx('#4a2e1a'), 'm': hx('#d8c090'),
           'f': hx('#f0ece0'), 'e': hx('#c8c4b8'), 'l': hx('#a88e5c'),
           # the bat's ash, lit to shaded
           'u': hx('#dcb47c'), 'U': hx('#bc9058'), 'i': hx('#8e643a'), 'I': hx('#5e3e24')}
    # an M1911 .45, side on: the blued slide with its rear serrations, the ejection port, the bushing at the muzzle,
    # the hammer spur and the grip safety's beak at the back, the thumb safety and the slide stop on the frame, the
    # trigger in its guard, and the grip raked back under it in checkered walnut panels, a screw top and bottom
    PISTOL = {
        1: [(2, 'K'), (5, 'KK'), (23, 'K')],
        2: [(2, 'DK'), (4, 'M' + 'L' * 20 + 'S')],
        3: [(3, 'K'), (4, 'MKMKMKM'), (11, 'MM'), (13, 'nnnnn'), (18, 'MMMMMM'), (24, 'S'), (25, 'D')],
        4: [(4, 'DKDKDKD'), (11, 'DD'), (13, 'Knnnn'), (18, 'DDDDDD'), (24, 'L'), (25, 'K')],
        5: [(2, 'DD'), (4, 'K' * 22)],
        6: [(3, 'D'), (4, 'M'), (5, 'LKD'), (8, 'MMMM'), (12, 'KK'), (14, 'MMMMMMM')],
        7: [(3, 'D'), (4, 'wwwww'), (9, 'K'), (10, 'DDDDDDDDDDK')],
        8: [(3, 'D'), (4, 'wwSww'), (9, 'K'), (10, 'nMnnD')],
        9: [(2, 'D'), (3, 'WwVwWV'), (9, 'K'), (10, 'nDnnD')],
        10: [(2, 'D'), (3, 'VWwVW'), (8, 'KMMMDK')],
        11: [(1, 'D'), (2, 'WVWVWV'), (8, 'K')],
        12: [(1, 'D'), (2, 'VVSVV'), (7, 'K')],
        13: [(1, 'DKKKKK')]}
    W['pistol'] = ascii_cv(drawn(27, 15, PISTOL), gun)
    # (each magazine gun also has a `_bare` sprite: the same gun, its magazine out of the well; weapons.js `well`)
    W['pistol_bare'] = ascii_cv(drawn(27, 15, without(PISTOL, {13: (1,)})), gun)
    # an Uzi, side on, in its dark parkerized finish: the top cover with the rear sight, the cocking knob and the eared
    # front sight, the receiver's pressed rib with the ejection port and two rivets, the knurled barrel nut and the stub
    # of barrel; the stock folded under it (its strut along the belly, the butt plate hanging under the nut); the grip
    # under the middle with its grip safety, the magazine's base out of its heel, the big trigger guard
    def uzi(can, bare=False):
        rows = {
            1: [(3, 'MD'), (17, 'LM'), (23, 'DMD')],
            2: [(3, 'MML' + 'M' * 13 + 'L' + 'M' * 6)],
            3: [(2, 'D' * 24), (26, 'LSL')],
            4: [(2, 'K' * 24), (26, 'DKD')],
            5: [(2, 'MMMSMMMMSMM'), (13, 'nnnn'), (17, 'M' * 9), (26, 'LSL')],
            6: [(2, 'D' * 11), (13, 'Knnn'), (17, 'D' * 9), (26, 'DKD')],
            7: [(2, 'S'), (3, 'K' * 23), (26, 'MDM')],
            8: [(2, 'SM'), (4, 'MMMMMM'), (10, 'M'), (11, 'gGgGgG'), (17, 'DDDDDDD'), (24, 'SMD')],
            9: [(10, 'M'), (11, 'GgGgGg'), (17, 'K'), (19, 'M'), (23, 'D'), (25, 'MD')],
            10: [(10, 'M'), (11, 'gGgGgG'), (17, 'K'), (19, 'D'), (22, 'D'), (25, 'MD')],
            11: [(10, 'D'), (11, 'GgGgGg'), (17, 'DDDDDD'), (25, 'DK')],
            12: [(11, 'gGgGgG')],
            13: [(11, 'nnnnnn')],
            14: [(12, 'MMMD')],
            15: [(12, 'MMDD')],
            16: [(11, 'KDDDDK')]}
        if can:   # a long suppressor screwed on the nut: brushed steel, a ring at each end
            for y, c in {3: 'S', 4: 'L', 5: 'M', 6: 'D', 7: 'K'}.items():
                rows[y].append((29, 'D' + c * 14 + 'D'))
        else:
            rows[4].append((29, 'LLL'))
            rows[5].append((29, 'MMM'))
            rows[6].append((29, 'DDK'))
        if bare:   # the magazine's base out of the grip's heel
            rows = without(rows, {14: (12,), 15: (12,), 16: (11,)})
        return drawn(46 if can else 33, 18, rows)
    W['uzi'] = ascii_cv(uzi(False), gun)
    W['uzi_silenced'] = ascii_cv(uzi(True), gun)
    W['uzi_bare'] = ascii_cv(uzi(False, True), gun)
    W['uzi_silenced_bare'] = ascii_cv(uzi(True, True), gun)
    # a Benelli-style semi-auto combat shotgun: the olive pistol-grip stock and its rubber pad, the black receiver
    # with the ghost-ring rear sight and the rail on top, the ejection port and the bolt handle, a red shell in the
    # loading port under it, the trigger guard; the thick barrel over the round magazine tube (no box magazine: that
    # is the M16), the olive forend on the tube, the barrel clamp, the tube's cap and the winged front sight
    W['shotgun'] = ascii_cv(drawn(51, 14, {
        1: [(16, 'K'), (19, 'K'), (45, 'K'), (47, 'K')],
        2: [(16, 'KMMK'), (20, 'DnDnDnDn'), (45, 'KDK')],
        3: [(1, 'TT'), (3, 'a' * 12), (15, 'g' * 13)],
        4: [(1, 'TT'), (3, 'A' * 12), (15, 'GGGG'), (19, 'nnnnnn'), (25, 'GGG'), (28, 'L' * 22)],
        5: [(1, 'TT'), (3, 'A' * 12), (15, 'GgGG'), (19, 'nSLnnn'), (25, 'GGG'), (28, 'M' * 15), (43, 'K'), (44, 'MMMMMK')],
        6: [(1, 'TT'), (3, 'AzzzzzzzzzAA'), (15, 'G' * 13), (28, 'K' * 15), (43, 'K'), (44, 'KKKKKK')],
        7: [(1, 'TT'), (3, 'z' * 11), (15, 'nnnnnnnnnnnnn'), (28, 'aaaaaaaa'), (36, 'sssssss'), (43, 'K'), (44, 'SSL')],
        8: [(1, 'TT'), (3, 'zzzzzzzz'), (14, 'AAAA'), (18, 'KKKKKnyrrRK'), (28, 'AzAzAzAA'), (36, 'MMMMMMM'), (43, 'K'), (44, 'LMD')],
        9: [(1, 'TT'), (3, 'zzzZZ'), (13, 'zAAAA'), (18, 'D'), (21, 'K'), (28, 'zzzzzzzz'), (36, 'DDDDDDD'), (43, 'K'), (44, 'DDK')],
        10: [(1, 'TT'), (3, 'ZZ'), (13, 'AzAz'), (17, 'KKKKK'), (29, 'ZZZZZZZ'), (44, 'K')],
        11: [(12, 'zAzA')],
        12: [(12, 'ZZZZ')]}), gun)
    # an M16, side on like the others: the straight black stock in line with the bore, the receiver under its carry
    # handle (the rear sight at its back, the ejection port, the forward assist), the round ribbed handguard behind
    # its delta ring, the triangular front sight, the bare barrel, the slotted flash hider; the pistol grip and the
    # thirty-round magazine curving forward under it. Black and dark greys, a box magazine: nothing like the shotgun.
    RIFLE = {
        1: [(17, 'K'), (45, 'K')],
        2: [(16, 'MMMMMMMMMM'), (44, 'KK')],
        3: [(16, 'D'), (17, 'DK'), (19, 'nnnnnn'), (25, 'D'), (43, 'KMKK')],
        4: [(2, 'g'), (15, 'KKKKKKKKKKKK'), (27, 'MM'), (29, 'gGgGgGgGgGgGgG'), (43, 'KKKKK')],
        5: [(1, 'n'), (2, 'gggggggggggggM'), (16, 'MMMMMMMMMSM'), (27, 'DD'), (29, 'gGgGgGgGgGgGgG'), (43, 'DMDD'),
            (47, 'MMMM'), (51, 'MKMK')],
        6: [(1, 'n'), (2, 'GGGGGGGGGGGGGD'), (16, 'DDDDKKKKDMD'), (27, 'DD'), (29, 'GnGnGnGnGnGnGn'), (43, 'KKKK'),
            (47, 'DDDD'), (51, 'KDKD')],
        7: [(1, 'n'), (2, 'GGGGGGGGGGGGGK'), (16, 'KKKKKKKKKKK'), (27, 'KK'), (29, 'nnnnnnnnnnnnnn'), (44, 'KK')],
        8: [(1, 'n'), (2, 'nGGGGGGGGGGn'), (16, 'KKKKKKKDKKKK')],
        9: [(1, 'n'), (2, 'nnGGGGGGn'), (17, 'GgG'), (20, 'K'), (22, 'K'), (23, 'GgGGG')],
        10: [(2, 'nnGGn'), (16, 'GgG'), (20, 'KKK'), (24, 'GgGGG')],
        11: [(16, 'Ggn'), (24, 'GgGGG')],
        12: [(15, 'Ggn'), (25, 'GgGGG')],
        13: [(15, 'nn'), (26, 'nnnnn')]}
    W['rifle'] = ascii_cv(drawn(56, 16, RIFLE), gun)
    W['rifle_bare'] = ascii_cv(drawn(56, 16, without(RIFLE, {9: (23,), 10: (24,), 11: (24,), 12: (25,), 13: (26,)})), gun)
    # a heavy .50 anti-materiel rifle: the stock with its cheek rest and thick pad, the long receiver under a big
    # scope (eyepiece, turret, objective bell, a glint of its lens), the folding carry handle, the cooling holes of
    # the barrel shroud, the pistol grip, the trigger guard, the ten-round box magazine, the heavy fluted barrel with
    # the bipod folded under it, and the double-chamber muzzle brake at its end
    SNIPER = {
        1: [(11, 'gggg'), (20, 'KSSK'), (31, 'gggggg')],
        2: [(11, 'GGGG'), (15, 'ggggg'), (20, 'DMMD'), (24, 'ggggggg'), (31, 'GGGGGc')],
        3: [(11, 'GGGG'), (15, 'GGGGGGG'), (22, 'S'), (23, 'GGGGGGGG'), (31, 'GGGGGC')],
        4: [(11, 'nnnn'), (15, 'nn'), (17, 'KK'), (19, 'nnnnnnnnn'), (28, 'KK'), (30, 'n'), (31, 'nnnnnn'),
            (38, 'DLLLLD')],
        5: [(4, 'gggggg'), (13, 'DnDnDnDnDnDnDnDnDnDnDnDnD'), (38, 'K'), (43, 'K'), (64, 'LLLLLL')],
        6: [(1, 'TT'), (3, 'gggggggggg'), (13, 'L' * 32), (63, 'MnnMnnMD')],
        7: [(1, 'TT'), (3, 'GGGGGGGGGG'), (13, 'MMMMMMMM'), (21, 'nnnnn'), (26, 'MMMMMMMMMM'), (36, 'MnMnMnMnM'),
            (45, 'L' * 18), (63, 'MnnMnnMD')],
        8: [(1, 'TT'), (3, 'GnnnnnnnGG'), (13, 'MMMMMMMM'), (21, 'nSLnn'), (26, 'MMMMMMMMMM'), (36, 'DnDnDnDnD'),
            (45, 'MMDMMDMMDMMDMMDMMD'), (63, 'MnnMnnMD')],
        9: [(1, 'TT'), (3, 'GGGGGGGGGG'), (13, 'D' * 32), (45, 'D' * 18), (63, 'MnnMnnMD')],
        10: [(1, 'TT'), (3, 'GGGGGGGGG'), (13, 'D' * 22), (35, 'KKKKKKKKK'), (44, 'KDD'), (47, 'n' * 11), (58, 'K'),
             (63, 'MnnMnnMD')],
        11: [(1, 'TT'), (3, 'nnnnnnn'), (15, 'gGgG'), (19, 'n'), (20, 'D'), (23, 'K'), (25, 'MLLLLMD'), (44, 'KK'),
             (46, 'D' * 12), (58, 'KK'), (64, 'DDDDDD')],
        12: [(15, 'GgGg'), (19, 'KKKKK'), (25, 'MMMMMMD'), (58, 'K')],
        13: [(14, 'gGgG'), (25, 'MDDDDMD')],
        14: [(14, 'GgGg'), (25, 'MMMMMMD')],
        15: [(14, 'nnnn'), (24, 'KKKKKKKKK')]}
    W['sniper'] = ascii_cv(drawn(72, 17, SNIPER), gun)
    W['sniper_bare'] = ascii_cv(drawn(72, 17, without(SNIPER, {11: (25,), 12: (25,), 13: (25,), 14: (25,), 15: (24,)})), gun)
    # a bazooka of the M20 kind, side on: the flared venturi at the back, the olive tube with its clamps, the shoulder
    # rest under it, the pistol grip and trigger, the front grip, the reflex sight and the contact box on top, the
    # yellow band of a live round, the reinforced muzzle ring
    W['bazooka'] = ascii_cv(drawn(52, 14, {
        1: [(1, 'QO'), (21, 'DMMD'), (34, 'aA')],
        2: [(1, 'QOo'), (21, 'DcCD'), (25, 'K'), (34, 'Az')],
        3: [(1, 'qOo'), (4, 'o' * 4), (8, 'O'), (9, 'o' * 17), (26, 'O'), (27, 'o' * 13), (40, 'yy'), (42, 'oo'), (44, 'O'), (45, 'ooo'), (48, 'MLL')],
        4: [(1, 'qOO'), (4, 'O' * 4), (8, 'q'), (9, 'O' * 17), (26, 'q'), (27, 'O' * 13), (40, 'yy'), (42, 'OO'), (44, 'q'), (45, 'OOO'), (48, 'MMM')],
        5: [(1, 'qQO'), (4, 'O' * 4), (8, 'q'), (9, 'OOOxOOOOOOOOOOOOO'), (26, 'q'), (27, 'O' * 13), (40, 'yY'), (42, 'OO'), (44, 'q'), (45, 'OOO'), (48, 'MMD')],
        6: [(1, 'qQO'), (4, 'O' * 4), (8, 'q'), (9, 'O' * 17), (26, 'q'), (27, 'OOOOtOtOtOOOO'), (40, 'yY'), (42, 'OO'), (44, 'q'), (45, 'OOO'), (48, 'DMD')],
        7: [(1, 'qQQ'), (4, 'Q' * 4), (8, 'q'), (9, 'Q' * 17), (26, 'q'), (27, 'Q' * 13), (40, 'YY'), (42, 'QQ'), (44, 'q'), (45, 'QQQ'), (48, 'DMD')],
        8: [(1, 'qQQ'), (4, 'Q' * 4), (8, 'q'), (9, 'QQQQQQQQQQQQxQQQQ'), (26, 'q'), (27, 'Q' * 13), (40, 'YY'), (42, 'QQ'), (44, 'q'), (45, 'QQQ'), (48, 'DDD')],
        9: [(1, 'qQq'), (4, 'q' * 4), (8, 'q'), (9, 'q' * 17), (26, 'q'), (27, 'q' * 13), (40, 'qq'), (42, 'qq'), (44, 'q'), (45, 'qqq'), (48, 'DDK')],
        10: [(1, 'qQ'), (3, 'q' * 45), (48, 'KKK')],
        11: [(1, 'Qq'), (9, 'gGGGGg'), (17, 'gGG'), (20, 'KnK'), (29, 'gGG')],
        12: [(9, 'GGGGGG'), (16, 'gGGG'), (20, 'KKK'), (29, 'GGG')]}), gun)
    # a baseball bat in ash: the knob, the handle wound in black tape (its spiral catching the light, the end of it
    # ragged), the taper, the barrel's long grain and its burnt-in brand, two dents on top and an old stain under it
    BAT = drawn(46, 9, {
        1: [(28, 'UuuuuuuiuuuuuuU')],
        2: [(1, 'iu'), (18, 'UUUUUUUUUU'), (28, 'uuuuuuuuuuuiuuuu')],
        3: [(1, 'iU'), (3, 'gTnTgTnTgTnTgT'), (17, 'uuuuuuuuuuu'), (28, 'uuiIiuUUuuuuUUuuu')],
        4: [(1, 'iU'), (3, 'TgTnTgTnTgTnTg'), (17, 'UUUUUUUUUUU'), (28, 'UUIiIUUUUhRhUUUUU')],
        5: [(1, 'iU'), (3, 'nTgTnTgTnTgTn'), (16, 'iiiiiiiiiiii'), (28, 'iiUiiiiiihhhRiiii')],
        6: [(1, 'iI'), (18, 'IIIIIIIIII'), (28, 'iiiiiiiiihhRiiii')],
        7: [(28, 'IIIIIIIIhhIIIII')]})
    W['bat'] = ascii_cv(BAT, gun)
    # a big combat knife: the steel pommel, the ridged black rubber grip, a tall cross-guard, a wide clip-point blade
    # with the saw teeth along its spine, the lit flat, the fuller, the grind and the bright edge sweeping up to the tip
    KNIFE = drawn(30, 10, {
        1: [(12, 'MD')],
        2: [(12, 'LD'), (16, 'D'), (18, 'D'), (20, 'D'), (22, 'D')],
        3: [(1, 'SM'), (3, 'gngngngng'), (12, 'LD'), (14, 'M' * 10)],
        4: [(1, 'nS'), (3, 'GnGnGnGnG'), (12, 'MD'), (14, 'L' + 'S' * 9 + 'SSt')],
        5: [(1, 'MD'), (3, 'GnGnGnGnG'), (12, 'MD'), (14, 'DSMMMMMMMSSSStt')],
        6: [(1, 'DK'), (3, 'nTnTnTnTn'), (12, 'MD'), (14, 'D' + 's' * 12 + 't')],
        7: [(12, 'DK'), (14, 'D' + 't' * 11)],
        8: [(12, 'DK')]})
    W['knife'] = ascii_cv(KNIFE, gun)
    # a pool cue: the rubber bumper, the dark butt with its pearl inlays, the linen wrap, the forearm's spliced points,
    # the pearl joint collar, the maple shaft tapering to the white ferrule and the chalked blue tip
    BUTT = {1: [(1, 'n'), (2, 'BBBfBBBBBfBBBBBBBBB'), (21, 'bjbjbjbjbjbjbj'), (35, 'BBBmmmm')],
            2: [(1, 'n'), (2, 'BBBBBBBBBBBBBBBBBBB'), (21, 'jbjbjbjbjbjbjb'), (35, 'BBBBBBm')],
            3: [(1, 'n'), (2, 'kkkkkkkkkkkkkkkkkkk'), (21, 'bjbjbjbjbjbjbj'), (35, 'kkkkkkl')],
            4: [(1, 'n'), (2, 'kkkfkkkkkfkkkkkkkkk'), (21, 'jjjjjjjjjjjjjj'), (35, 'kkkllll')]}
    W['cue'] = ascii_cv(drawn(80, 6, {
        1: BUTT[1] + [(42, 'mmm'), (45, 'fe'), (47, 'm' * 14)],
        2: BUTT[2] + [(42, 'mmm'), (45, 'fe'), (47, 'm' * 28), (75, 'fff'), (78, 'c')],
        3: BUTT[3] + [(42, 'lll'), (45, 'ee'), (47, 'l' * 28), (75, 'eee'), (78, 'C')],
        4: BUTT[4] + [(42, 'lll'), (45, 'ee'), (47, 'l' * 14)]}), gun)
    # what is left of it once snapped across the forearm: the splinters it broke into
    W['cue_half'] = ascii_cv(drawn(46, 6, {
        1: BUTT[1] + [(42, 'm')],
        2: BUTT[2] + [(42, 'mmm')],
        3: BUTT[3] + [(42, 'll')],
        4: BUTT[4]}), gun)
    # a tire iron: black paint worn back to the steel, rust in the chips; the pry end flattened and turned up, the
    # other bent down into the hex socket
    IRON = drawn(34, 15, {
        4: [(1, 'S')],
        5: [(1, 'SM')],
        6: [(2, 'MSMMMMLMMMMMMMSMMMMMMMMMSM')],
        7: [(2, 'DGGGGGxGGGGGGGGGGGxxGGGGGGGD')],
        8: [(3, 'nTTTTTTTTTTTTTTTTTTTTTTTTGGD')],
        9: [(28, 'MGD')],
        10: [(28, 'MGD')],
        11: [(27, 'LMMMD')],
        12: [(27, 'MGGGD')],
        13: [(27, 'KnnnK')]})
    W['tire_iron'] = ascii_cv(IRON, gun)
    weapon_breaks(W, gun, BAT, KNIFE, IRON)
    # the magazines, at the guns' density and as wide as their wells (top row: the round on the lips, its bullet toward
    # the muzzle; bottom row: the base plate). They show sliding out of the well, falling, and lying on the floor.
    mag = dict(gun, B=BRASS[3], b=BRASS[1], c=hx('#e07a3a'))
    # the 1911's: blued steel, its witness holes down the side
    W['mag_pistol'] = ascii_cv(drawn(5, 14, dict([(1, [(1, 'bBc')]), (2, [(1, 'LMD')])]
                                               + [(y, [(1, 'LKD' if y in (4, 7) else 'LMD')]) for y in range(3, 12)]
                                               + [(12, [(1, 'KKK')])])), mag)
    # the Uzi's: a long straight stick of steel, ribbed down its side, a thick base plate
    W['mag_uzi'] = ascii_cv(drawn(5, 18, dict([(1, [(1, 'bBc')]), (2, [(1, 'LMD')])]
                                            + [(y, [(1, 'LDD' if y % 4 == 1 else 'LMD')]) for y in range(3, 15)]
                                            + [(15, [(1, 'DKD')]), (16, [(1, 'KKK')])])), mag)
    # the M16's: black, curving forward toward its base
    W['mag_rifle'] = ascii_cv(drawn(8, 16, dict([(1, [(1, 'bBBc')])]
                                              + [(y, [(1 + (y > 5) + (y > 10), 'gGGn')]) for y in range(2, 14)]
                                              + [(14, [(3, 'nnnn')])])), mag)
    # the .50's: a fat steel box, the big round lying on its lips, a rib round it
    W['mag_sniper'] = ascii_cv(drawn(9, 12, dict([(1, [(1, 'bBBBccc')]), (2, [(1, 'LLLLLMD')])]
                                               + [(y, [(1, 'LDDDDMD' if y == 5 else 'LMMMMMD')]) for y in range(3, 10)]
                                               + [(10, [(1, 'KKKKKKK')])])), mag)
    W['rocket'] = ascii_cv([".........",
                            ".QooorRt.",
                            ".qQQQRRR.",
                            "........."], gun)
    W['casing'] = ascii_cv(["yBb",
                            "Bbd"], {'y': lt(BRASS[2], 0.5), 'B': BRASS[2], 'b': BRASS[1], 'd': BRASS[0]}, ol=None)
    W['shell'] = ascii_cv(["BrRr",
                           "bRRd"], {'B': BRASS[3], 'b': BRASS[1], 'r': hx('#ff5050'), 'R': hx('#c8202a'),
                                     'd': hx('#7a1018')}, ol=None)
    return W


# small things the guards have in hand, drop or leave about (entities/PostArt.js, Enemy.dropHeld): a cigarette end and
# a cigar stub left smoking on the floor, a can kicked down the sidewalk, a magazine slid off a knee, the boss's ashtray
def items():
    I = {}
    I['butt'] = ascii_cv(["wwwo",
                          "dddo"], {'w': hx('#ece6d6'), 'd': hx('#c8c0ae'), 'o': hx('#d89a50')}, ol=None)
    # level 2A's opening (systems/LastDrag.js), both painted at FINE density (a pixel is half a world px; Assets.js
    # FINE_ITEMS): the end of a cigarette in his fingers, its filter toward -x, the paper, the ash, the ember at +x
    # (6 x 1 world px: longer than life, it has to read from above); and the butt once flicked, on the road, its
    # end still alight (3 x 1)
    I['cigarette'] = ascii_cv(["FFFfWWWWwaee",
                               "fffdwwwwwaee"], {'F': hx('#d8a868'), 'f': hx('#b88848'), 'd': hx('#96683a'), 'W': hx('#f4efe2'),
                                             'w': hx('#d2ccbc'), 'a': hx('#8a8680'), 'e': hx('#ff8a2a')}, ol=None)
    I['cig_butt'] = ascii_cv(["FFfWae",
                              "ffdwae"], {'F': hx('#d8a868'), 'f': hx('#b88848'), 'd': hx('#96683a'), 'W': hx('#f4efe2'),
                                          'w': hx('#d2ccbc'), 'a': hx('#8a8680'), 'e': hx('#ff7a20')}, ol=None)
    I['cigar'] = ascii_cv(["BbbgBa",
                           "BBbgBa"], {'B': hx('#5a341e'), 'b': hx('#7a4a2a'), 'g': hx('#c8a040'), 'a': hx('#8a8a8a')}, ol=None)
    I['can'] = ascii_cv(["......",
                         ".rWrs.",
                         ".RRRs.",
                         "......"], {'r': hx('#d8303a'), 'R': hx('#a01e28'), 'W': hx('#f0ece0'), 's': hx('#c8ccd4')})
    # a glossy cover: a picture, the title across its head, the print of its lines
    I['magazine'] = ascii_cv(["........",
                              ".tttttt.",
                              ".tTTTTt.",
                              ".pppppp.",
                              ".pPPPpp.",
                              ".pPPPpp.",
                              ".ppppbp.",
                              ".llllll.",
                              ".llllll.",
                              "........"], {'t': hx('#f0e6d0'), 'T': hx('#d8202a'), 'p': hx('#e8508a'), 'P': hx('#f0b090'),
                                            'b': hx('#4a7ab0'), 'l': hx('#d8d2c0')})
    I['ashtray'] = layer(Cv(10, 10), lambda ly: ashtray(ly, 5.0, 5.0, random.Random(901), 2.8))
    # a bottle of rum lying down, its neck toward +x: amber glass, the label, the cap
    I['bottle'] = ascii_cv(['...........',
                            '.bbLLbb....',
                            '.BbLLbbnnk.',
                            '.BBLLBB....',
                            '...........'], {'b': hx('#8a5424'), 'B': hx('#5a3416'), 'L': hx('#e8d8a8'), 'n': hx('#6a4020'),
                                            'k': hx('#c8a040')})
    return I


def px_paint(cv, x0, y0, x1, y1, fn):
    """fn(x, y, current) -> colour|None for every pixel whose centre (x, y: world px) lies in [x0, x1) x [y0, y1)."""
    s = cv.s
    for j in range(max(0, int(math.ceil(y0 * s - 0.5))), min(cv.ph, int(math.ceil(y1 * s - 0.5)))):
        for i in range(max(0, int(math.ceil(x0 * s - 0.5))), min(cv.pw, int(math.ceil(x1 * s - 0.5)))):
            c = fn((i + 0.5) / s, (j + 0.5) / s, cv.p[i, j])
            if c is not None:
                cv.p[i, j] = c


def frect(cv, x0, y0, x1, y1, c):
    """Fill [x0, x1) x [y0, y1) (world px, any fraction of one): c a colour, or fn(current) -> colour."""
    px_paint(cv, x0, y0, x1, y1, (lambda x, y, cur: c(cur)) if callable(c) else (lambda x, y, cur: c))


def dash(cv, x0, y0, x1, y1, col, on=1, off=1):
    """A dashed line one pixel wide (stitching, perforations): on / off in pixels. col: colour or fn(current)."""
    s = cv.s
    n = int(max(abs(x1 - x0), abs(y1 - y0)) * s) + 1
    for k in range(n + 1):
        if k % (on + off) >= on:
            continue
        t = k / n
        i, j = int(math.floor((x0 + (x1 - x0) * t) * s)), int(math.floor((y0 + (y1 - y0) * t) * s))
        if cv.pok(i, j) and cv.p[i, j][3]:
            cv.p[i, j] = col(cv.p[i, j]) if callable(col) else col


def stud(cv, x, y, base, big=False):
    """A screw / nail / button head at world (x, y): lit on its top-left pixel, shaded on the bottom-right."""
    q = 1.0 / cv.s
    cv.dot(x, y, lt(base, 0.35))
    cv.dot(x + q, y + q, dk(base, 0.4))
    if big:
        cv.dot(x + q, y, base)
        cv.dot(x, y + q, base)


def fgrain(cv, rng, amt=3, box=None, keep=None):
    """Pixel-fine grain on painted pixels: breaks the flat runs a world px paints, never a pattern."""
    x0, y0, x1, y1 = box or (0, 0, cv.w, cv.h)

    def f(x, y, c):
        if c[3] == 0 or c == OUTLINE or (keep and not keep(x, y, c)):
            return None
        return shift(c, rng.randint(-amt, amt))
    px_paint(cv, x0, y0, x1, y1, f)


def crease(cv, pts, t=0.16):
    """A fine crease in leather or vinyl: a dark pixel line, a lit one above-left of it."""
    q = 1.0 / cv.s
    for (ax, ay), (bx, by) in zip(pts, pts[1:]):
        n = int(max(abs(bx - ax), abs(by - ay)) * cv.s) + 1
        for k in range(n + 1):
            x, y = ax + (bx - ax) * k / n, ay + (by - ay) * k / n
            c = cv.get(x, y)
            if c[3] and c != OUTLINE:
                cv.dot(x, y, dk(c, t))
            c2 = cv.get(x - q, y - q)
            if c2[3] and c2 != OUTLINE:
                cv.dot(x - q, y - q, lt(c2, t * 0.6))


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


CAPS = [hx('#d8b048'), hx('#c8ccd4'), hx('#b8242a'), hx('#2a2a30'), hx('#e8e4d8')]


def tufted(cv, x0, y0, x1, y1, lea, nx, ny, stagger=True, rng=None):
    """Chesterfield buttoning over [x0, x1] x [y0, y1] (world px): buttons sunk in the leather in a diamond grid, the
    pleats running between them, each puff of leather between four buttons swelling toward the light."""
    bt = []
    for j in range(ny):
        for i in range(nx + (1 if stagger and j % 2 else 0)):
            off = 0.5 if stagger and j % 2 else 0.0
            bx = x0 + (i + 0.5 - off) * (x1 - x0) / nx
            by = y0 + (j + 0.5) * (y1 - y0) / ny
            if x0 - 0.1 <= bx <= x1 + 0.1:
                bt.append((bx, by))
    sx, sy = (x1 - x0) / nx, (y1 - y0) / ny

    def f(x, y, c):
        if c[3] == 0 or c == OUTLINE:
            return None
        d = min(math.hypot((x - bx) / sx, (y - by) / sy) for bx, by in bt)
        return shade(lea, 0.35 + 0.55 * min(1.0, d * 1.7) - (0.12 if y > (y0 + y1) / 2 else 0.0))
    px_paint(cv, x0, y0, x1, y1, f)
    for (bx, by) in bt:                                                # the pleats
        for (ex, ey) in bt:
            if 0 < abs(ex - bx) <= sx * 0.55 and 0 < ey - by <= sy * 1.01:
                line(cv, bx, by, ex, ey, dk(lea[1], 0.25))
    for (bx, by) in bt:
        stud(cv, bx - 0.25, by - 0.25, dk(lea[1], 0.2), big=True)


def plate(k, x, y0, y1):
    """A licence plate on the tail (2 world px deep, y0..y1): the bumper's dark recess, the plate, its embossed
    characters as dark dots."""
    for y in range(y0, y1 + 1):
        k.put(x, y, PLATE if y > y0 else RUBBER[1])
        k.put(x + 1, y, PLATE if y > y0 else RUBBER[1])
    for j in range((y0 + 1) * k.s + 1, (y1 + 1) * k.s - 1, 2):
        k.setp(x * k.s + 1, j, hx('#3a3a48'))


# --------------------------------------------------------------------------
# Props -- real scale (1 m = 32 px, a character is a 17 px disc). Sprite = hitbox + a 1 px outline on each
# side. Fronts face +y (screens, knobs, seats), backs -y; chairs and armchairs have their back on -x.
# Every painter seeds its own Random so changing one never shifts another.
# --------------------------------------------------------------------------

def shade(r, L):
    """Continuous tone(): a soft gradient through the 4-step ramp (cloth, enamel, chrome)."""
    stops = ((0.18, r[0]), (0.46, r[1]), (0.70, r[2]), (0.96, r[3]))
    if L <= stops[0][0]:
        return r[0]
    for (a, ca), (b, cb) in zip(stops, stops[1:]):
        if L <= b:
            return mix(ca, cb, (L - a) / (b - a))
    return r[3]


def mottle(cv, rng, amt=6, cell=5, box=None):
    """Low-frequency brightness drift on painted pixels (wear, grime): organic, never a pattern."""
    n = VNoise(cv.w, cv.h, cell, rng)
    x0, y0, x1, y1 = box or (0, 0, cv.w - 1, cv.h - 1)
    s = cv.s
    for j in range(y0 * s, (y1 + 1) * s):
        for i in range(x0 * s, (x1 + 1) * s):
            if not cv.pok(i, j):
                continue
            c = cv.p[i, j]
            if c[3] > 0 and c != OUTLINE:
                cv.p[i, j] = shift(c, int(round((n(i / s, j / s) - 0.5) * 2 * amt)))


def smudge(cv, rng, n, box, r=(1.0, 2.5), t=0.2, col=None):
    """Soft spots on painted pixels: dark grime, or a blend toward col (rust, dust, bare metal)."""
    x0, y0, x1, y1 = box
    s = cv.s
    for _ in range(n):
        cx, cy, rr = rng.uniform(x0, x1), rng.uniform(y0, y1), rng.uniform(*r)
        for j in range((int(cy - rr) - 1) * s, (int(cy + rr) + 2) * s):
            for i in range((int(cx - rr) - 1) * s, (int(cx + rr) + 2) * s):
                if not cv.pok(i, j):
                    continue
                d = math.hypot((i + 0.5) / s - cx, (j + 0.5) / s - cy) / rr
                c = cv.p[i, j]
                if d < 1 and c[3] > 0 and c != OUTLINE:
                    k = t * (1 - d * d)
                    cv.p[i, j] = mix(c, alpha(col, c[3]), k) if col else dk(c, k)


def layer(cv, paint, ol=OUTLINE):
    """Paint on a fresh layer, outline it (ol=None: no outline) and composite it onto cv."""
    ly = Cv(cv.w, cv.h, cv.s)
    paint(ly)
    if ol:
        ly.outline(ol)
    cv.over(ly)
    return cv


def relief(cv, x0, y0, x1, y1, hf, r, amp=1.0, keep=None):
    """Shade painted pixels from a height field hf(x, y) (cloth folds, padding): normal from its gradient."""
    s = cv.s
    for j in range(y0 * s, (y1 + 1) * s):
        for i in range(x0 * s, (x1 + 1) * s):
            if not cv.pok(i, j):
                continue
            c = cv.p[i, j]
            x, y = i / s, j / s
            if c[3] == 0 or c == OUTLINE or (keep and not keep(i // s, j // s)):
                continue
            gx = (hf(x + 1, y) - hf(x - 1, y)) * 0.5 * amp
            gy = (hf(x, y + 1) - hf(x, y - 1)) * 0.5 * amp
            cv.p[i, j] = shade(r, light(-gx, -gy))


def line(cv, x0, y0, x1, y1, col, blend=False):
    """A line one pixel wide (at the canvas's own density)."""
    s = cv.s
    n = int(max(abs(x1 - x0), abs(y1 - y0)) * s) + 1
    for i in range(n + 1):
        t = i / n
        x, y = x0 + (x1 - x0) * t, y0 + (y1 - y0) * t
        ix, iy = int(math.floor(x * s)), int(math.floor(y * s))
        if blend:
            cv.bpx(ix, iy, col)
        elif cv.pok(ix, iy):
            cv.p[ix, iy] = col


def glass_top(ly, cx, cy, r, drink, rim=hx('#dfe8ee')):
    """A glass seen from above: lit rim, the drink, a highlight."""
    fill_shape(ly, cx, cy, r, r, lambda u, v, L: rim if L > 0.7 else mix(rim, drink, 0.5))
    fill_shape(ly, cx + 0.15, cy + 0.15, r - 0.8, r - 0.8, lambda u, v, L: lt(drink, 0.25) if u + v < -0.6 else drink)
    ly.set(int(cx - r * 0.45), int(cy - r * 0.45), hx('#ffffff'))


def ashtray(ly, cx, cy, rng, r=2.8, ember=True):
    """Thick glass ashtray with ash and a couple of butts."""
    glass = ramp('#9fb2be', 0.5, 0.25, 0.45)
    fill_shape(ly, cx, cy, r, r, lambda u, v, L: shade(glass, L))
    fill_shape(ly, cx, cy, r - 1.0, r - 1.0, lambda u, v, L: mix(hx('#3e3a44'), hx('#6a6670'), (u - v) / (2 * r) + 0.5))
    for i in range(2):
        a = rng.uniform(0, 2 * math.pi)
        x1, y1 = cx + math.cos(a) * (r + 0.4), cy + math.sin(a) * (r + 0.4)
        line(ly, cx + math.cos(a) * 0.6, cy + math.sin(a) * 0.6, x1, y1, hx('#efe6d4'))
        ly.set(int(x1), int(y1), hx('#d89a50'))
        if ember and i == 0:
            ly.set(int(cx + math.cos(a) * 0.6), int(cy + math.sin(a) * 0.6), hx('#ff6b1a'))


def knob(cv, x, y, r, base, ang, mark=hx('#f4f2ec')):
    """A round control knob from above: its chrome skirt, the grip lit from the top left, the pointer line."""
    ring(cv, x, y, r * 0.62, r, lambda dx, dy, d: shade(CHROME, 0.2 + 0.85 * light(dx / d, dy / d)))
    fill_shape(cv, x, y, r * 0.64, r * 0.64, lambda u, v, L: shade(ramp(base, 0.5, 0.25, 0.45), L))
    line(cv, x, y, x + math.cos(ang) * r * 0.8, y + math.sin(ang) * r * 0.8, mark)


def chrome_bar(cv, x0, y0, x1, y1, ramp_=None):
    """A chrome tube or bar lying along x over [x0, x1) x [y0, y1): lit on top, a hot line of reflection, dark under."""
    r = ramp_ or ramp('#b8bcc8', 0.5, 0.26, 0.5)

    def f(x, y, c):
        t = (y - y0) / max(0.01, y1 - y0)
        col = shade(r, 0.95 - t * 0.9)
        if 0.18 < t < 0.42 and int(x * 2) % 11 not in (3, 4):
            col = lt(r[3], 0.35)
        return col
    px_paint(cv, x0, y0, x1, y1, f)


def brushed(cv, rng, box, amt=7, along_x=True):
    """Brushed steel: long hairline streaks along the grain, pixel-fine."""
    x0, y0, x1, y1 = box
    n = VNoise(cv.w * 4, cv.h * 4, 4, rng)

    def f(x, y, c):
        if c[3] == 0 or c == OUTLINE:
            return None
        k = n(x * 0.25, y * 8.0) if along_x else n(x * 8.0, y * 0.25)
        return shift(c, int((k - 0.5) * 2 * amt))
    px_paint(cv, x0, y0, x1, y1, f)


def can_top(cv, x, y, r, col):
    """A drinks can from above: the lit rim, the lid's ring, the ring-pull, its printed shoulder."""
    fill_shape(cv, x, y, r, r, lambda u, v, L: shade(ramp(col, 0.45, 0.22, 0.3), L))
    ring(cv, x, y, r * 0.55, r * 0.78, lambda dx, dy, d: hx('#e8ecf2') if dx + dy < 0 else hx('#9aa0ac'))
    fill_shape(cv, x, y, r * 0.55, r * 0.55, lambda u, v, L: hx('#c8ccd6') if L > 0.6 else hx('#a4aab6'))
    cv.dot(x + 0.25, y - 0.25, hx('#5a5e6a'))
    cv.dot(x - 0.25, y + 0.25, hx('#e8ecf2'))


def frond(ly, c, a, ln, bend, g, rng, leaflet=2.4, side=1.0):
    """An areca frond from above: a midrib arching out from (c, c) at angle a, pairs of narrow leaflets swept toward
    its tip, lit on the side facing the light."""
    pts = []
    for k in range(9):
        t = k / 8.0
        aa = a + bend * t * t
        r = 1.2 + (ln - 1.2) * t
        pts.append((c + math.cos(aa) * r, c + math.sin(aa) * r))
    for k in range(1, 9):
        t = k / 8.0
        x0, y0 = pts[k]
        dx, dy = pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1]
        d = math.hypot(dx, dy) or 1.0
        dx, dy = dx / d, dy / d
        ll = leaflet * math.sin(math.pi * min(1.0, 0.15 + t * 0.95)) ** 0.7 * rng.uniform(0.8, 1.1)
        for s in (-1, 1):
            nx, ny = -dy * s, dx * s
            ex, ey = x0 + (nx * 0.85 + dx * 0.55) * ll, y0 + (ny * 0.85 + dy * 0.55) * ll
            lit = light(nx, ny)
            fill_capsule(ly, [(x0, y0), (ex, ey)], 0.42 if t < 0.9 else 0.32,
                         lambda k_, L, sd, i, tt, lit=lit: shade(g, 0.25 + lit * 0.75 - tt * 0.15))
    fill_capsule(ly, pts, 0.3, lambda k_, L, sd, i, t: lt(g[2], 0.15))


def p_table():
    """Back-room table: worn varnished boards, poker cards, a beer, a full ashtray, ring stains."""
    W, H = 46, 28
    cv = Cv(W, H)
    rng = random.Random(11)
    wood_fill(cv, 1, 1, W - 2, H - 2, hx('#86552f'), plank=6, rng=rng)
    mottle(cv, random.Random(111), 8, 7)
    bevel_edges(cv, 1, 1, W - 2, H - 2, 0.22, 0.32)
    for (x, y) in ((1, 1), (W - 2, 1), (1, H - 2), (W - 2, H - 2)):
        cv.set(x, y, CLEAR)
    # varnish worn pale along the long edges where elbows rest
    smudge(cv, rng, 6, (8, 2, W - 8, 4), (2.0, 3.5), 0.16, hx('#c8a070'))
    smudge(cv, rng, 6, (8, H - 5, W - 8, H - 3), (2.0, 3.5), 0.16, hx('#c8a070'))
    for (sx, sy) in ((10.0, 9.0), (35.5, 19.0)):   # glass rings
        ring(cv, sx, sy, 1.7, 2.6, lambda dx, dy, d, sx=sx, sy=sy:
             dk(cv.get(sx + dx, sy + dy), 0.2) if (dx * 0.6 + dy) > -2.0 else None)
    ol = dk(hx('#86552f'), 0.6)

    def cards(ly):
        for (x, y, a, pip) in ((16.5, 11.5, 0.3, '#c01828'), (21.5, 10.5, -0.25, '#1a1420'), (26.5, 13.0, 0.6, '#c01828'),
                               (20.5, 18.5, -0.7, '#1a1420')):
            fill_shape(ly, x, y, 1.5, 2.1, lambda u, v, L: hx('#f2ece0') if L > 0.6 else hx('#d8d0c2'),
                       ang=a, kind='rect', corner=0.4, bevel=0.6)
            fill_shape(ly, x, y, 0.45, 0.6, lambda u, v, L, pip=pip: hx(pip), ang=a, kind='super', p=1.2)
        fill_shape(ly, 31.0, 7.5, 2.0, 2.6, lambda u, v, L: hx('#2a3a8a') if (int(u * 2 + v * 2) % 2) else hx('#34469a'),
                   ang=0.1, kind='rect', corner=0.5, bevel=0.6)   # the deck, face down
    layer(cv, cards, ol)

    def things(ly):
        ashtray(ly, 37.0, 9.5, random.Random(112))
        fill_shape(ly, 9.5, 19.0, 1.9, 1.9, lambda u, v, L: shade(ramp('#5a3a12', 0.5, 0.25, 0.5), L))  # beer bottle
        ly.set(9, 18, hx('#e8c860'))
        ly.set(10, 19, hx('#c8a040'))
        glass_top(ly, 13.5, 21.5, 1.9, hx('#d89a2a'))
    layer(cv, things)
    cv.outline()
    return cv


def p_table_round():
    """Round bar table: dark rim band, a drink on a beer mat, a small ashtray."""
    S = 30
    cv = Cv(S, S)
    c = S / 2
    wood_fill(cv, 1, 1, S - 2, S - 2, hx('#8a5530'), plank=5, rng=random.Random(12), vertical=True,
              mask=lambda x, y: math.hypot(x + 0.5 - c, y + 0.5 - c) <= 13.9)
    mottle(cv, random.Random(121), 7, 6)
    ring(cv, c, c, 12.6, 14.0, lambda dx, dy, d: shade(ramp('#6a3a1e', 0.45, 0.22, 0.35), light(dx / d, dy / d)))
    ring(cv, c, c, 12.0, 12.6, lambda dx, dy, d: dk(cv.get(c + dx, c + dy), 0.18))
    ring(cv, 11.0, 18.5, 1.8, 2.6, lambda dx, dy, d: dk(cv.get(11.0 + dx, 18.5 + dy), 0.18) if dx + dy > -2 else None)

    def things(ly):
        fill_shape(ly, 18.5, 11.0, 3.0, 3.0, lambda u, v, L: hx('#c8303a') if math.hypot(u, v) > 2.1 else hx('#e8e0cc'))
        glass_top(ly, 18.5, 11.0, 1.9, hx('#e89a30'))
        ashtray(ly, 10.0, 12.0, random.Random(122), 2.4)
    layer(cv, things)
    cv.outline()
    return cv


def p_card_table():
    """Poker table: an oval of green baize in a padded wood rail, the pot, hands dealt to five seats, drinks."""
    W, H = 60, 38
    cv = Cv(W, H)
    cx, cy = W / 2, H / 2
    half = cx - cy   # half-length of the straight sides
    felt = ramp('#1f7a4c', 0.45, 0.22, 0.18)
    rail = ramp('#6a3518', 0.45, 0.22, 0.35)
    fn = VNoise(W, H, 5, random.Random(171))
    def table(x, y, c):
        dx, dy = x - cx, y - cy
        ex = dx - max(-half, min(half, dx))
        d = math.hypot(ex, dy) or 1e-6
        nx, ny = ex / d, dy / d
        if d > 18.0:
            return None
        if d > 14.2:
            c = shade(rail, light(nx, ny))
            if 15.6 < d <= 16.5:
                c = lt(c, 0.12)                      # the padding's crown
            if abs(d - 14.8) < 0.25 and int(math.atan2(dy, ex) * 40 + dx * 1.3) % 3:
                c = lt(c, 0.16)                      # the stitching along its inner edge
            elif abs(d - 17.3) < 0.25:
                c = dk(c, 0.15)                      # where it rolls over
            return c
        if d > 13.3:
            return felt[0] if nx + ny > 0 else felt[1]
        c = shift(mix(felt[2], lt(felt[2], 0.2), max(0.0, 0.7 - d / 14)), int((fn(x, y) - 0.5) * 8))
        return lt(c, 0.1) if 9.3 < d <= 10.0 else c     # the betting line
    px_paint(cv, 1, 1, W - 1, H - 1, table)
    # years of games: the baize rubbed pale where the cards are dealt and the chips pushed, the ring a glass left, a
    # cigarette's burn in the cloth and one on the rail where it was left to burn down, the padding worn at the elbows
    wr = random.Random(174)
    smudge(cv, wr, 4, (13, 11, 47, 27), (2.0, 3.6), 0.13, lt(felt[2], 0.45))
    ring(cv, 44.4, 21.6, 1.5, 1.95, lambda dx, dy, d: dk(cv.get(44.4 + dx, 21.6 + dy), 0.16) if dx + dy > -1.4 else None)
    for (bx, by) in ((21.0, 12.5), (35.75, 34.25), (36.25, 34.25)):
        for (ox, oy) in ((-0.5, 0.0), (0.5, 0.0), (0.0, -0.5), (0.0, 0.5)):
            cv.dot(bx + ox, by + oy, mix(cv.get(bx + ox, by + oy), hx('#3a2a14'), 0.45))
        cv.dot(bx, by, hx('#16100c'))
    for box in ((13, 33, 21, 36), (39, 33, 47, 36), (2, 15, 5, 23)):
        smudge(cv, wr, 2, box, (1.2, 2.0), 0.3, lt(rail[2], 0.3))

    def things(ly):
        chips = ('#d8303a', '#e8e0cc', '#3a6ad8', '#e8c040', '#1a1420')
        rng = random.Random(172)
        for k, (x, y) in enumerate(((-3.2, -1.4), (0.0, -2.2), (3.2, -1.0), (-1.6, 1.6), (1.8, 2.0))):   # the pot
            circle(ly, cx + x, cy + y, 1.4, hx(chips[k]))
        for (x, y, a) in ((cx - 8.0, cy + 2.5, 0.4), (cx + 8.5, cy - 1.5, -0.5)):   # notes thrown in
            fill_shape(ly, x, y, 2.2, 1.2, lambda u, v, L: hx('#86b070') if abs(u) < 1.2 else hx('#5a8a4a'),
                       ang=a, kind='rect', corner=0.3, bevel=0.5)
        back, face = hx('#a8282e'), hx('#f0ece0')
        seats = ((cx - 21, cy, math.pi, False), (cx + 21, cy, 0.0, False), (17.0, cy + 8.5, math.pi / 2, False),
                 (43.0, cy + 8.5, math.pi / 2, True), (cx - 4.0, cy - 8.5, -math.pi / 2, False))
        for i, (sx, sy, a, up) in enumerate(seats):
            for s in (-1, 1):
                px, py = sx - math.sin(a) * s * 1.8, sy + math.cos(a) * s * 1.8
                fill_shape(ly, px, py, 1.5, 2.2, lambda u, v, L: face if up or abs(u) > 0.9 or abs(v) > 1.6 else back,
                           ang=a + s * 0.25, kind='rect', corner=0.5, bevel=0.5)
            if up:
                ly.set(int(sx - 2), int(sy), hx('#c01828'))
                ly.set(int(sx + 1), int(sy), hx('#1a1420'))
            for k in range(2 + i % 2):                                  # each player's stack, at his right hand
                circle(ly, sx - math.sin(a) * (5.5 + k * 2.2) - math.cos(a) * 1.5,
                       sy + math.cos(a) * (5.5 + k * 2.2) - math.sin(a) * 1.5, 1.2, hx(chips[rng.randrange(4)]))
        fill_shape(ly, cx + 3.5, cy - 8.5, 1.7, 2.4, lambda u, v, L: hx('#8a1f26') if (int(u * 2 + v * 2) % 2) else back,
                   ang=1.45, kind='rect', corner=0.5, bevel=0.6)        # the deck, by the dealer
        glass_top(ly, 12.5, 12.5, 1.7, hx('#c8842a'))
        glass_top(ly, 48.0, 25.5, 1.7, hx('#d89a2a'))
        ashtray(ly, 46.5, 11.5, random.Random(173), 2.3)
    layer(cv, things)
    cv.outline()
    return cv


def p_dope_table():
    """The pimp's counting table: taped bricks, bags, a scale, a mirror with lines cut on it, wads of cash, a lamp."""
    W, H = 46, 28
    cv = Cv(W, H)
    rng = random.Random(13)
    wood_fill(cv, 1, 1, W - 2, H - 2, hx('#6e4426'), plank=6, rng=rng)
    mottle(cv, random.Random(131), 8, 7)
    bevel_edges(cv, 1, 1, W - 2, H - 2, 0.22, 0.32)
    for (x, y) in ((1, 1), (W - 2, 1), (1, H - 2), (W - 2, H - 2)):
        cv.set(x, y, CLEAR)
    smudge(cv, rng, 7, (12, 6, 32, 22), (1.2, 2.6), 0.3, hx('#eeeae2'))   # powder dusted over the boards
    white = ramp('#e8e4dc', 0.3, 0.15, 0.4)
    green = ramp('#5a8a4a', 0.4, 0.2, 0.3)

    def goods(ly):
        for (x, y, a) in ((7.5, 7.0, 0.1), (8.0, 12.0, -0.08), (14.5, 6.5, 0.3), (7.0, 20.5, 1.5)):   # taped bricks
            fill_shape(ly, x, y, 3.2, 2.0, lambda u, v, L: hx('#9a7a44') if abs(u) < 0.6 else shade(white, L),
                       ang=a, kind='rect', corner=0.5, bevel=0.7)
        for (x, y) in ((17.5, 19.5), (20.5, 21.5), (16.0, 22.5), (22.5, 18.5), (13.5, 18.0)):          # small bags
            fill_shape(ly, x, y, 1.5, 1.2, lambda u, v, L: shade(white, L))
        fill_shape(ly, 23.5, 9.5, 4.2, 3.0, lambda u, v, L: hx('#c8dcec') if u - v > 1.5 else hx('#9ab8cc'),
                   ang=-0.15, kind='rect', corner=0.4, bevel=0.5)                                      # the mirror
        for k in range(3):
            line(ly, 21.0 + k * 2.0, 8.0, 21.6 + k * 2.0, 11.2, hx('#ffffff'))
        fill_shape(ly, 31.0, 19.5, 4.2, 3.4, lambda u, v, L: shade(STEEL, L), kind='rect', corner=0.6, bevel=0.8)   # the scale
        fill_shape(ly, 31.0, 19.0, 2.7, 2.7, lambda u, v, L: shade(ramp('#b8c0cc', 0.5, 0.25, 0.4), L))
        fill_shape(ly, 31.0, 19.0, 1.4, 1.2, lambda u, v, L: shade(white, L))
        ly.set(31, 22, hx('#ff5a3a'))
        for (x, y, a) in ((35.0, 5.5, 0.0), (41.0, 7.5, 1.57), (35.5, 11.5, 0.1), (40.5, 14.5, 0.0)):    # wads
            fill_shape(ly, x, y, 2.7, 1.6, lambda u, v, L: hx('#f2ead0') if abs(u) < 0.7 else shade(green, L),
                       ang=a, kind='rect', corner=0.3, bevel=0.6)
    layer(cv, goods, dk(hx('#6e4426'), 0.6))

    def lamp(ly):
        circle(ly, 41.5, 23.5, 2.0, hx('#2a2a34'))
        line(ly, 41.0, 23.0, 37.5, 21.5, hx('#3a3a48'))
        fill_shape(ly, 37.0, 21.5, 2.8, 2.2, lambda u, v, L: shade(ramp('#3f7a5a', 0.5, 0.25, 0.4), L), ang=0.4)
        ly.set(36, 21, hx('#fff4c0'))
        ly.set(36, 22, hx('#ffe08a'))
    layer(cv, lamp)
    cv.outline()
    return cv


def p_gas_bottle():
    """A propane bottle from above: the blue steel shoulder domed toward the light, a white stamped tare band, the guard
    collar with its two hand holes, the brass valve and the red hand wheel on its spokes."""
    S = 14
    c = S / 2
    cv = Cv(S, S)
    blue = ramp('#4f82c0', 0.55, 0.28, 0.35)
    fill_shape(cv, c, c, 6.0, 6.0, lambda u, v, L: shade(blue, L * 0.9 + 0.1))
    ring(cv, c, c, 5.4, 6.05, lambda dx, dy, d: blue[0] if dx + dy > 1 else blue[1])
    ring(cv, c, c, 4.4, 4.8, lambda dx, dy, d: hx('#e8e8e0') if abs(math.atan2(dy, dx) - 2.4) < 0.7 else None)   # the tare band
    smudge(cv, random.Random(2731), 4, (2, 2, 12, 12), (0.5, 1.0), 0.6, hx('#8a8e98'))   # knocks to the steel
    steel = ramp('#9aa4b4', 0.5, 0.25, 0.4)

    def collar(dx, dy, d):
        a = math.atan2(dy, dx)
        if abs(math.sin(a)) > 0.92 and 3.2 < d < 3.9:
            return hx('#1c2a44')                                       # the hand holes
        return shade(steel, light(dx / d * 0.9, dy / d * 0.9) if d > 3.5 else 0.9 - light(dx / d, dy / d) * 0.7)
    ring(cv, c, c, 2.8, 4.25, collar)
    fill_shape(cv, c, c, 2.8, 2.8, lambda u, v, L: hx('#1c2a44'))
    fill_shape(cv, c, c, 1.6, 1.6, lambda u, v, L: shade(ramp('#d8a840', 0.45, 0.22, 0.4), L))   # brass valve
    ring(cv, c, c, 1.0, 1.6, lambda dx, dy, d: shade(ramp('#d02828', 0.45, 0.22, 0.4), light(dx / d, dy / d)))   # hand wheel
    for a in (0.4, 2.5, 4.6):
        line(cv, c, c, c + math.cos(a) * 1.2, c + math.sin(a) * 1.2, hx('#a01818'))
    cv.dot(c - 0.25, c - 0.25, hx('#ffe8a0'))
    fgrain(cv, random.Random(2732), 3)
    cv.outline()
    return cv


def p_dance_stage():
    """Dance stage: a low round platform of dark lacquer with a brass edge and bulbs, a chrome pole in the middle."""
    S = 50
    cv = Cv(S, S)
    c = S / 2
    top = ramp('#3a1f4a', 0.45, 0.22, 0.3)
    riser = ramp('#1c1024', 0.4, 0.2, 0.5)
    fn = VNoise(S, S, 6, random.Random(181))
    for y in range(1, S - 1):
        for x in range(1, S - 1):
            d = math.hypot(x + 0.5 - c, y + 0.5 - c)
            if d <= 21.6:
                cv.set(x, y, shift(mix(top[2], top[3], max(0.0, 0.6 - d / 22)), int((fn(x, y) - 0.5) * 6)))
    rng = random.Random(182)
    for _ in range(54):                                                # glitter shed by the dancers, single specks
        a, d = rng.uniform(0, 2 * math.pi), 19.5 * math.sqrt(rng.random())
        x, y = c + math.cos(a) * d, c + math.sin(a) * d
        if d > 4.5:
            cv.dot(x, y, mix(cv.get(x, y), hx(rng.choice(('#f4e8c0', '#f8c8e8', '#c8f0f8', '#ffffff'))), rng.uniform(0.3, 0.55)))
    ring(cv, c, c, 13.0, 14.0, lambda dx, dy, d: top[3])
    ring(cv, c, c, 20.2, 21.6, lambda dx, dy, d: shade(ramp('#d8a848', 0.5, 0.25, 0.4), light(dx / d, dy / d)))
    ring(cv, c, c, 21.6, 24.0, lambda dx, dy, d: shade(riser, light(dx / d, dy / d)))
    for k in range(16):
        a = (k + 0.5) * math.pi / 8
        bx, by = c + math.cos(a) * 17.6, c + math.sin(a) * 17.6
        col = hx('#fff0c0') if k % 2 else hx('#ff8ad0')
        ring(cv, bx, by, 0.9, 1.3, lambda dx, dy, d: hx('#8a6a2a') if dx + dy < 0 else hx('#5a4418'))   # its brass socket
        fill_shape(cv, bx, by, 0.95, 0.95, lambda u, v, L, col=col: lt(col, 0.5) if L > 0.85 else col)
        cv.dot(bx - 0.5, by - 0.5, hx('#ffffff'))

    def pole(ly):
        fill_shape(ly, c, c, 4.2, 4.2, lambda u, v, L: shade(STEEL, L))
        fill_shape(ly, c, c, 2.4, 2.4, lambda u, v, L: shade(ramp('#aab4c4', 0.5, 0.25, 0.5), L))
        ly.set(c - 1, c - 1, hx('#ffffff'))
    layer(cv, pole)
    cv.outline()
    return cv


def p_desk():
    """Office desk (the seat on +y): mahogany with a tooled green leather inset, a typewriter with a sheet in it, a
    banker's lamp, a rotary phone, files and loose papers, a blotter with a letter and a pen, an ashtray with a cigar
    burning, a coffee mug and its ring."""
    W, H = 48, 26
    cv = Cv(W, H)
    wood_fill(cv, 1, 1, W - 2, H - 2, hx('#5a3020'), plank=6, rng=random.Random(13))
    mottle(cv, random.Random(131), 5, 7)
    bevel_edges(cv, 1, 1, W - 2, H - 2, 0.22, 0.35)
    for (x, y) in ((1, 1), (W - 2, 1), (1, H - 2), (W - 2, H - 2)):
        frect(cv, x + (0.5 if x > 1 else 0), y + (0.5 if y > 1 else 0), x + (1 if x > 1 else 0.5), y + (1 if y > 1 else 0.5), CLEAR)
    lea = ramp('#2a5a3c', 0.45, 0.22, 0.25)
    nz = VNoise(W, H, 3, random.Random(132))
    px_paint(cv, 4, 3.5, 44, 22.5, lambda x, y, c: shift(shade(lea, 0.62 + (nz(x, y) - 0.5) * 0.25), 0))
    for (x0, y0, x1, y1) in ((4, 3.5, 44, 4), (4, 4, 4.5, 22.5)):
        frect(cv, x0, y0, x1, y1, dk(lea[0], 0.3))                     # its edge sunk into the wood
    dash(cv, 5.0, 5.0, 43.0, 5.0, hx('#c8a050'), 1, 1)                 # the gold tooling
    dash(cv, 5.0, 21.5, 43.0, 21.5, hx('#a8843c'), 1, 1)
    dash(cv, 5.0, 5.0, 5.0, 21.5, hx('#c8a050'), 1, 1)
    dash(cv, 43.0, 5.0, 43.0, 21.5, hx('#a8843c'), 1, 1)
    smudge(cv, random.Random(133), 5, (8, 14, 40, 22), (1.5, 3.0), 0.14, hx('#6a8a6a'))   # leather rubbed pale
    ring(cv, 9.0, 19.5, 1.5, 2.1, lambda dx, dy, d: dk(cv.get(9.0 + dx, 19.5 + dy), 0.25) if dx - dy > -2 else None)   # a mug's ring
    ol = dk(hx('#5a3020'), 0.6)

    def paper(ly):
        fill_shape(ly, 24.5, 18.6, 7.0, 3.4, lambda u, v, L: shade(ramp('#1e3a2a', 0.45, 0.22, 0.25), L), kind='rect', corner=0.4, bevel=0.6)   # blotter
        for x in (17.5, 31.5):
            frect(ly, x - 0.5, 15.2, x + 0.5, 22.0, hx('#4a2a1a'))      # its leather ends
        fill_shape(ly, 26.0, 18.6, 2.8, 3.6, lambda u, v, L: hx('#f2eee4') if L > 0.5 else hx('#dad4c6'), ang=0.12,
                   kind='rect', corner=0.2, bevel=0.4)                 # a letter
        for k in range(5):
            line(ly, 24.0 + 0.12 * k, 16.4 + k * 1.0, 28.0 + 0.12 * k, 16.9 + k * 1.0, hx('#8a8a9a'))
        fill_capsule(ly, [(19.5, 21.0), (23.8, 17.0)], 0.4, lambda k, L, s, i, t: hx('#d8b040') if t > 0.9 else shade(ramp('#1a1a24', 0.4, 0.2, 0.6), L))   # pen
        for i, (x, y, a, col) in enumerate(((8.0, 9.5, -0.1, '#d8b878'), (8.5, 8.8, 0.08, '#c8a868'), (8.6, 8.2, -0.05, '#e8e0cc'))):
            fill_shape(ly, x, y, 3.8, 4.8, lambda u, v, L, col=col: shade(ramp(col, 0.4, 0.2, 0.3), L),
                       ang=a, kind='rect', corner=0.3, bevel=0.6)       # files, the top one a loose sheet
        for k in range(4):
            line(ly, 6.4, 5.8 + k * 1.2, 10.6, 5.6 + k * 1.2, hx('#a8a4b0'))
        fill_shape(ly, 14.0, 21.0, 2.2, 1.4, lambda u, v, L: hx('#f2eee4'), ang=-0.5, kind='rect', corner=0.2)   # a note
    layer(cv, paper, ol)

    def things(ly):
        fill_shape(ly, 9.0, 19.5, 1.9, 1.9, lambda u, v, L: shade(WHITE, L))   # the mug
        fill_shape(ly, 9.0, 19.5, 1.2, 1.2, lambda u, v, L: hx('#3a1e10') if L < 0.7 else hx('#5a3420'))
        fill_capsule(ly, [(10.9, 19.2), (11.6, 19.8)], 0.45, lambda k, L, s, i, t: shade(WHITE, L))
        ashtray(ly, 37.0, 19.5, random.Random(134), 2.3)
        fill_capsule(ly, [(35.4, 18.6), (31.6, 16.6)], 0.5, lambda k, L, s, i, t: hx('#ff6b1a') if t > 0.92 else hx('#6a4024') if t < 0.2 else hx('#8a5a34'))   # the cigar
        brass = ramp('#c8a050', 0.5, 0.25, 0.45)
        fill_shape(ly, 40.5, 6.5, 2.0, 2.0, lambda u, v, L: shade(brass, L))   # banker's lamp: its base,
        fill_capsule(ly, [(36.0, 7.4), (44.0, 7.4)], 1.5, lambda k, L, s, i, t: hx('#9ef0b0') if L > 0.9 else shade(ramp('#1e7a4a', 0.45, 0.22, 0.4), L))   # its green shade
        for x in (35.6, 44.4):
            fill_shape(ly, x, 7.4, 0.5, 1.3, lambda u, v, L: shade(brass, L), kind='rect', corner=0.2)
        stud(ly, 40.0, 4.5, brass[1])                                  # the pull chain
    layer(cv, things)

    def typewriter(ly):
        body = ramp('#3e4a5a', 0.5, 0.25, 0.4)
        frect(ly, 19.0, 1.0, 29.0, 3.6, hx('#f2eee4'))                 # the sheet rolled in the platen
        for k in range(3):
            line(ly, 20.0, 1.6 + k * 0.7, 27.5, 1.6 + k * 0.7, hx('#b0acb8'))
        fill_shape(ly, 24.0, 8.4, 7.6, 4.8, lambda u, v, L: shade(body, L), kind='rect', bevel=1.8, corner=1.6)
        fill_capsule(ly, [(16.0, 4.2), (32.0, 4.2)], 1.1, lambda k, L, s, i, t: shade(ramp('#26262e', 0.4, 0.2, 0.5), L))   # platen
        for x in (15.6, 32.4):
            fill_shape(ly, x, 4.2, 0.7, 0.9, lambda u, v, L: shade(CHROME, L))   # its knobs
        line(ly, 32.0, 3.0, 34.4, 1.6, CHROME[2])                      # the carriage return lever
        frect(ly, 18.0, 6.0, 30.0, 7.0, hx('#1a1a22'))                 # the type basket's slot
        for row, y in enumerate((7.8, 9.0, 10.2)):                     # the keys, round caps in rows
            for k in range(9 - row):
                x = 18.4 + row * 0.6 + k * 1.4
                fill_shape(ly, x, y, 0.5, 0.45, lambda u, v, L: hx('#f0ece4') if L > 0.6 else hx('#bcb8b0'))
        frect(ly, 21.0, 11.4, 27.0, 12.0, hx('#e0dcd4'))               # the space bar
        frect(ly, 21.0, 11.8, 27.0, 12.0, hx('#9a968e'))
    layer(cv, typewriter)

    def phone(ly):
        red = ramp('#b82830', 0.5, 0.25, 0.35)
        fill_shape(ly, 40.5, 14.0, 3.6, 3.0, lambda u, v, L: shade(red, L), kind='super', p=2.6)
        fill_capsule(ly, [(37.4, 11.6), (43.6, 11.6)], 1.2, lambda k, L, s, i, t: shade(red, L))   # the handset
        ring(ly, 40.5, 15.0, 0.6, 1.9, lambda dx, dy, d: hx('#f0ece4') if int(math.atan2(dy, dx) * 1.6 + 6) % 2 else hx('#3a1418'))
        fill_shape(ly, 40.5, 15.0, 0.6, 0.6, lambda u, v, L: hx('#f0ece4'))
        line(ly, 44.0, 15.6, 45.6, 20.4, hx('#1a1018'))                # the coiled cord
        line(ly, 44.4, 15.6, 46.0, 20.4, hx('#3a2228'))
    layer(cv, phone)
    cv.outline()
    return cv


def p_chair():
    """Bistro chair: chrome tube frame, padded vinyl seat with its piping and a taped split, curved backrest on -x."""
    cv = Cv(16, 16)
    vin = ramp('#8e2c38', 0.5, 0.26, 0.32)
    chrome = ramp('#9ea4b4', 0.55, 0.28, 0.5)

    def seat(ly):
        for (fx, fy) in ((3.4, 3.0), (14.2, 3.0), (3.4, 13.0), (14.2, 13.0)):   # the frame's feet peeking out
            fill_shape(ly, fx, fy, 0.9, 0.9, lambda u, v, L: shade(chrome, L))
        fill_shape(ly, 9.0, 8.0, 5.4, 5.6, lambda u, v, L: shade(vin, L), kind='super', p=3.0)
        fill_shape(ly, 9.0, 8.0, 4.5, 4.7, lambda u, v, L: None if (abs(u) / 4.5) ** 3 + (abs(v) / 4.7) ** 3 < 0.8
                   else lt(shade(vin, L), 0.1), kind='super', p=3.0)     # the welt round the cushion
        crease(ly, [(7.6, 6.0), (9.2, 8.4), (11.4, 9.0)], 0.14)        # sat in
        frect(ly, 10.0, 10.5, 12.5, 11.5, hx('#2a2830'))               # a split, taped over
        frect(ly, 10.0, 10.5, 12.5, 11.0, hx('#4a4852'))
    layer(cv, seat)

    def back(ly):
        fill_capsule(ly, [(3.6, 2.0), (2.3, 4.6), (2.0, 8.0), (2.3, 11.4), (3.6, 14.0)], 1.25,
                     lambda k, L, s, i, t: (lt(chrome[3], 0.3) if L > 0.85 else shade(chrome, L)) if k > 0.55 else shade(vin, L))
    layer(cv, back)
    cv.outline()
    return cv


def p_armchair():
    """Chesterfield club armchair, oxblood leather, buttoned back and arms, nailheads down the arm fronts; back on -x,
    seat facing +x."""
    S = 28
    cv = Cv(S, S)
    lea = ramp('#7e2224', 0.5, 0.26, 0.32)
    seam = dk(lea[0], 0.45)
    fill_shape(cv, 14.0, 14.0, 13.0, 13.0, lambda u, v, L: lea[0], kind='rect', corner=2.6)

    def seat(ly):
        fill_shape(ly, 17.6, 14.0, 8.4, 7.4, lambda u, v, L: shade(lea, L), kind='rect', bevel=3.4, corner=2.0)
        crease(ly, [(13.5, 12.4), (17.0, 13.6), (21.5, 15.6)], 0.16)   # sat-in creases
        crease(ly, [(14.5, 16.8), (18.5, 16.4)], 0.12)
        dash(ly, 10.4, 7.6, 25.0, 7.6, lambda c: lt(c, 0.1), 1, 1)     # the cushion's piping
        dash(ly, 10.4, 20.4, 25.0, 20.4, lambda c: dk(c, 0.1), 1, 1)
    layer(cv, seat, seam)

    def arms(ly):
        for cy in (4.0, 24.0):
            fill_shape(ly, 15.5, cy, 11.6, 3.2, lambda u, v, L: shade(lea, L), kind='rect', bevel=2.4, corner=2.6)
            tufted(ly, 5.5, cy - 2.2, 24.0, cy + 2.2, lea, 5, 1, stagger=False)
            fill_shape(ly, 25.2, cy, 2.0, 2.6, lambda u, v, L: shade(lea, L + 0.08))   # rolled front of the arm
            for k in range(5):                                         # its brass nailheads
                stud(ly, 26.6, cy - 2.0 + k * 1.0, hx('#c8a050'))
    layer(cv, arms, seam)

    def back(ly):
        fill_shape(ly, 4.4, 14.0, 3.6, 13.0, lambda u, v, L: shade(lea, L), kind='rect', bevel=2.6, corner=2.6)
        tufted(ly, 1.6, 2.4, 7.2, 25.6, lea, 2, 6)
    layer(cv, back, seam)
    smudge(cv, random.Random(141), 6, (6, 6, 24, 22), (1.5, 3.0), 0.14, hx('#c88a70'))   # worn leather
    fgrain(cv, random.Random(142), 3)
    cv.outline()
    return cv


def p_sofa():
    """Three-seater: back along -y, rolled arms, three seat and three buttoned back cushions, worn vinyl with its
    piping, a cushion split on the foam, a cigarette burn."""
    W, H = 66, 30
    cv = Cv(W, H)
    lea = ramp('#a8346c', 0.52, 0.27, 0.32)
    seam = dk(lea[0], 0.5)
    fill_shape(cv, 33.0, 15.0, 32.0, 14.0, lambda u, v, L: lea[0], kind='rect', corner=2.6)

    def frame(ly):
        fill_shape(ly, 33.0, 4.6, 32.0, 3.6, lambda u, v, L: shade(lea, L - 0.05), kind='rect', bevel=2.6, corner=2.6)
        for cx in (4.6, 61.4):
            fill_shape(ly, cx, 16.0, 3.6, 13.0, lambda u, v, L: shade(lea, L), kind='rect', bevel=2.8, corner=2.6)
            dash(ly, cx - 2.6, 4.0, cx - 2.6, 28.0, lambda c: lt(c, 0.1), 1, 1)   # the arm's piping
            crease(ly, [(cx - 1.0, 9.0), (cx + 0.6, 12.0)], 0.12)
        dash(ly, 2.0, 1.9, 64.0, 1.9, lambda c: lt(c, 0.12), 1, 1)
    layer(cv, frame, seam)
    rng = random.Random(151)

    def cushions(ly):
        for i, cx in enumerate((17.0, 33.0, 49.0)):
            dy = rng.uniform(-0.3, 0.3)
            fill_shape(ly, cx, 19.5 + dy, 7.9, 8.6, lambda u, v, L: shade(lea, L), kind='rect', bevel=3.6, corner=2.2)
            fill_shape(ly, cx, 10.2, 7.9, 2.6, lambda u, v, L: shade(lea, L + 0.04), kind='rect', bevel=2.2, corner=2.0)
            for bx in (cx - 3.6, cx + 3.6):                            # the back cushion's two buttons and their pleats
                line(ly, bx - 1.6, 9.0, bx, 10.2, dk(lea[1], 0.15))
                line(ly, bx + 1.6, 9.0, bx, 10.2, dk(lea[1], 0.15))
                stud(ly, bx - 0.25, 10.0, dk(lea[1], 0.2), big=True)
            dash(ly, cx - 7.0, 11.6 + dy, cx + 7.0, 11.6 + dy, lambda c: lt(c, 0.14), 1, 1)   # seat cushion piping
            dash(ly, cx - 7.2, 12.0 + dy, cx - 7.2, 27.0 + dy, lambda c: dk(c, 0.1), 1, 1)
            crease(ly, [(cx - 2.5, 20.0 + dy), (cx, 21.0 + dy), (cx + 2.0, 21.5 + dy)], 0.16)   # sat-in dip
            crease(ly, [(cx - 4.0, 16.0 + dy), (cx - 1.0, 15.2 + dy)], 0.1)
            for k in range(3):                                         # vinyl crazed on the front edge
                vx = cx - 5.0 + k * 3.7 + rng.uniform(-0.5, 0.5)
                line(ly, vx, 26.0 + dy, vx + rng.uniform(-0.6, 0.6), 27.4 + dy, dk(lea[2], 0.18))
    layer(cv, cushions, seam)
    # one cushion split, foam showing
    fill_shape(cv, 45.4, 22.6, 1.8, 0.7, lambda u, v, L: hx('#e8d898') if v < 0.2 else hx('#c8b070'), ang=0.35)
    line(cv, 43.4, 21.8, 47.6, 23.4, OUTLINE)
    fill_shape(cv, 24.0, 23.0, 0.6, 0.5, lambda u, v, L: hx('#1a1012'))   # cigarette burn
    ring(cv, 24.0, 23.0, 0.5, 1.0, lambda dx, dy, d: hx('#6a3a2a'))
    smudge(cv, rng, 9, (8, 12, 58, 26), (1.5, 3.5), 0.14)
    fgrain(cv, random.Random(152), 3)
    cv.outline()
    return cv


def p_plant():
    """Potted areca palm: a terracotta pot (the hitbox) with its rolled lip, dark soil and a few pebbles, three tiers of
    fronds spilling past it, the lowest in the shade of the others."""
    S = 24
    c = S / 2
    cv = Cv(S, S)
    pot = ramp('#c06036', 0.45, 0.22, 0.35)
    ring(cv, c, c, 5.4, 7.4, lambda dx, dy, d: shade(pot, light(dx / d * 0.85, dy / d * 0.85)) if d > 6.2 else
         shade(pot, 0.95 - light(dx / d * 0.7, dy / d * 0.7) * 0.7))
    ring(cv, c, c, 6.1, 6.4, lambda dx, dy, d: dk(cv.get(c + dx, c + dy), 0.18))   # under the lip
    rng = random.Random(161)
    soil = VNoise(S, S, 2, rng)
    fill_shape(cv, c, c, 5.5, 5.5, lambda u, v, L: mix(hx('#1e130a'), hx('#4a3020'), soil(c + u, c + v) * 0.8 + (u + v) * 0.02))
    for _ in range(6):
        a, r = rng.uniform(0, 6.3), rng.uniform(2.5, 5.0)
        fill_shape(cv, c + math.cos(a) * r, c + math.sin(a) * r, 0.45, 0.4, lambda u, v, L: hx('#a89a88') if L > 0.6 else hx('#6a5e50'))
    smudge(cv, rng, 4, (5, 5, 19, 19), (0.8, 1.5), 0.3, hx('#d8d0b8'))   # salts dried on the clay
    cv.outline()
    greens = [ramp('#1e5a28', 0.6, 0.32, 0.3), ramp('#2e7a34', 0.55, 0.3, 0.32), ramp('#48a040', 0.5, 0.28, 0.35)]
    rng = random.Random(77)
    for lay, n, ln in ((0, 6, 11.0), (1, 5, 9.0), (2, 4, 6.4)):
        leaves = Cv(S, S)
        for i in range(n):
            a = i * 2 * math.pi / n + rng.uniform(-0.3, 0.3) + lay * 0.62
            frond(leaves, c, a, ln * rng.uniform(0.9, 1.05), rng.uniform(-0.45, 0.45), greens[lay], rng,
                  2.6 if lay < 2 else 1.9)
        leaves.outline(hx('#0c2410'))
        cv.over(leaves)
    return cv


def p_tv():
    """80s woodgrain CRT on a black TV cart, from above, the screen facing +y: the tube's black housing tapering to the
    back with its vents and its cord, the walnut veneer of the cabinet, rabbit ears on their base, the silver bezel and
    the bulging glass lit by its picture, the channel knobs, the VCR on the cart's shelf blinking 12:00."""
    W, H = 24, 17
    cv = Cv(W, H)
    cart = ramp('#24222c', 0.4, 0.2, 0.45)
    fill_shape(cv, 12.0, 8.5, 11.0, 7.5, lambda u, v, L: shade(cart, L), kind='rect', bevel=1.0, corner=0.8)
    for (x, y) in ((1.5, 1.5), (22.5, 1.5), (1.5, 15.5), (22.5, 15.5)):
        fill_shape(cv, x, y, 0.75, 0.75, lambda u, v, L: shade(CHROME, L))   # the cart's chrome posts
    cv.outline()

    def set_(ly):
        back = ramp('#2e2a34', 0.45, 0.22, 0.4)
        fill_shape(ly, 12.0, 3.6, 6.6, 2.6, lambda u, v, L: shade(back, L), kind='rect', bevel=1.4, corner=1.6, taper=0.0)
        for x in range(8, 17):                                         # vent slots in the housing
            frect(ly, x + 0.25, 2.0, x + 0.75, 4.0, back[0])
        frect(ly, 13.5, 4.3, 16.0, 5.0, hx('#c8c4b4'))                 # the maker's sticker
        wood_fill(ly, 2, 5, 21, 12, hx('#6e4224'), plank=9, rng=random.Random(171))
        bevel_edges(ly, 2, 5, 21, 12, 0.25, 0.3)
        frect(ly, 2.0, 5.0, 2.5, 5.5, CLEAR)
        frect(ly, 21.5, 5.0, 22.0, 5.5, CLEAR)
        frect(ly, 2.0, 12.0, 22.0, 13.0, lambda c: hx('#c8ccd6'))      # the silver bezel
        frect(ly, 2.0, 12.0, 22.0, 12.5, hx('#e8ecf4'))
        frect(ly, 17.0, 12.0, 21.5, 13.0, hx('#9aa0ac'))               # the control column
        for x in (18.0, 19.5):
            knob(ly, x + 0.25, 12.5, 0.7, '#1a1820', -1.2)
        stud(ly, 21.0, 12.5, hx('#e03030'))                            # the power light
        fill_shape(ly, 11.6, 7.4, 1.6, 1.2, lambda u, v, L: shade(ramp('#2a2830', 0.45, 0.22, 0.5), L))   # the ears' base
        for (ex, ey) in ((4.6, 0.5), (19.6, 0.8)):
            line(ly, 11.6, 7.2, ex, ey, hx('#d8dce6'))
            line(ly, 11.6 + (0.5 if ex > 12 else -0.5), 7.4, ex + (0.5 if ex > 12 else -0.5), ey + 0.3, hx('#7a808c'))
            ly.dot(ex, ey, hx('#ffffff'))
        line(ly, 7.0, 2.0, 2.5, 0.5, hx('#141218'))                    # the cord off the back
    layer(cv, set_)
    pic = [hx('#9ef6ff'), hx('#ffd0a0'), hx('#7ab0ff'), hx('#ff9ac8'), hx('#c8f0ff')]

    def glass(x, y, c):                                                # the glass bulging past the bezel, its picture
        col = pic[int(x * 0.6) % 5]
        if y >= 13.5:
            col = mix(col, hx('#3a6a8a'), 0.45)
        if abs(x - 5.5) < 0.6 and y < 13.5:
            col = hx('#ffffff')                                        # a lamp caught on the curve
        return col
    px_paint(cv, 3.0, 13.0, 17.0, 14.0, glass)
    frect(cv, 2.5, 13.0, 3.0, 14.0, OUTLINE)
    frect(cv, 17.0, 13.0, 21.5, 14.0, hx('#5a5e6a'))
    frect(cv, 21.5, 13.0, 22.0, 14.0, OUTLINE)
    frect(cv, 4.0, 14.5, 20.0, 16.0, hx('#3a3846'))                   # the VCR on the shelf
    frect(cv, 4.0, 14.5, 20.0, 15.0, hx('#5a5868'))
    frect(cv, 6.0, 15.0, 12.0, 15.5, hx('#141218'))                   # its cassette door
    for x in (14.5, 15.0, 16.0, 16.5):                                 # 12:00 blinking forever
        cv.dot(x, 15.25, hx('#ff2a3a'))
    for x in (18.0, 19.0):
        cv.dot(x, 15.25, hx('#b8bcc8'))
    return cv, glow_from(cv, lambda x, y, c: (y == 13 and 3 <= x <= 16) or (y == 15 and 14 <= x <= 16 and c[0] > 200 and c[1] < 80))


def p_fridge():
    """Almond fridge from above, its door along +y: the enamel top, dustier toward the wall, its pressed panel, the
    condenser's coils standing off the back, the door's top edge on its black gasket, the chrome cap of the long
    handle and the hinge plate, a pizza box and a can left up there."""
    S = 24
    cv = Cv(S, S)
    cr = ramp('#ddd0aa', 0.42, 0.2, 0.4)
    rng = random.Random(181)

    def coils(x, y, c):                                                # the zigzag tube, its top catching the light
        return hx('#8a8696') if int(x * 2) % 3 == 0 and y < 1.5 else hx('#3a3640') if y < 1.5 else hx('#16121c')
    px_paint(cv, 2.5, 1, 21.5, 2.5, coils)
    fill_shape(cv, 12.0, 11.0, 11.0, 9.0, lambda u, v, L: shade(cr, L), kind='rect', bevel=1.4, corner=1.2)
    dust = VNoise(S, S, 4, rng)

    def top(x, y, c):                                                  # dust, thicker toward the wall nobody wipes
        if c[3] == 0 or c == OUTLINE:
            return None
        k = max(0.0, 0.5 - (y - 2) / 22.0) * 0.5 + (dust(x, y) - 0.5) * 0.12
        return mix(c, hx('#9a9078'), max(0.0, k))
    px_paint(cv, 1, 2, 23, 20, top)
    for (x0, y0, x1, y1) in ((2.5, 3.0, 21.5, 3.5), (2.5, 3.5, 3.0, 18.5)):
        frect(cv, x0, y0, x1, y1, lambda c: dk(c, 0.12))               # the pressed panel of the top, its shadowed side
    for (x0, y0, x1, y1) in ((2.5, 18.5, 21.5, 19.0), (21.0, 3.5, 21.5, 18.5)):
        frect(cv, x0, y0, x1, y1, lambda c: lt(c, 0.14))               # and its lit side
    for (x, y) in ((2.0, 2.5), (21.5, 2.5)):
        stud(cv, x, y, cr[1])

    def door(x, y, c):
        if y < 20.5:
            return hx('#1c1820')                                       # the gasket
        if y < 21.0:
            return lt(cr[3], 0.1)
        return cr[2] if y < 22.0 else cr[1]
    px_paint(cv, 1.5, 20, 22.5, 22.5, door)
    frect(cv, 1.5, 20.5, 2.0, 22.5, cr[3])
    frect(cv, 22.0, 20.5, 22.5, 22.5, cr[0])
    frect(cv, 18.5, 20.0, 22.0, 22.5, lambda c: shade(CHROME, 0.62))  # the hinge plate and its pin
    frect(cv, 18.5, 20.0, 22.0, 20.5, CHROME[3])
    stud(cv, 19.5, 21.0, CHROME[1])
    stud(cv, 21.0, 21.5, CHROME[1])
    chrome_bar(cv, 3.0, 20.5, 7.0, 23.0)                               # the handle's cap, standing proud of the door
    smudge(cv, rng, 3, (3, 19, 9, 23), (0.6, 1.2), 0.18)               # finger marks round it
    cv.outline()

    def things(ly):
        fill_shape(ly, 14.5, 9.5, 4.6, 4.4, lambda u, v, L: shade(ramp('#c8a46a', 0.45, 0.22, 0.3), L),
                   ang=0.16, kind='rect', bevel=0.9, corner=0.4)       # a pizza box
        fill_shape(ly, 14.6, 9.4, 2.0, 2.0, lambda u, v, L: hx('#c02a24') if math.hypot(u, v) > 1.2 else hx('#f2e6c8'))
        fill_shape(ly, 14.6, 9.4, 0.7, 0.7, lambda u, v, L: hx('#2a6a3a'))
        line(ly, 10.4, 12.0, 18.6, 13.4, dk(hx('#c8a46a'), 0.3))       # the lid's fold
        smudge(ly, rng, 2, (11, 6, 17, 12), (0.7, 1.2), 0.3, hx('#7a5020'))   # grease through the card
        can_top(ly, 6.0, 7.0, 1.5, hx('#c8202a'))
    layer(cv, things)
    return cv


def p_oven():
    """80s gas range from above, front along +y: the raised backguard with its clock, four burners in their chrome
    drip bowls under cast-iron grates (one lit blue), a pan frying an egg, a kettle, baked-on spills, the knobs on the
    front strip and the oven door's chrome handle."""
    S = 22
    cv = Cv(S, S)
    en = ramp('#e2ddd0', 0.42, 0.2, 0.35)
    rng = random.Random(191)
    fill_shape(cv, 11.0, 11.0, 10.0, 10.0, lambda u, v, L: shade(en, L), kind='rect', bevel=1.2, corner=1.0)
    mottle(cv, random.Random(1911), 4, 5)
    fill_shape(cv, 11.0, 2.4, 10.0, 1.5, lambda u, v, L: shade(ramp('#bdb4a0', 0.45, 0.22, 0.4), L), kind='rect',
               bevel=0.8, corner=0.6)                                  # backguard
    frect(cv, 1, 3.9, 21, 4.4, lambda c: dk(en[1], 0.25))             # its shadow on the cooktop
    frect(cv, 8.5, 1.5, 13.5, 3.2, hx('#141a16'))                     # the clock's window
    for x in (9.0, 10.0, 11.5, 12.5):
        cv.dot(x, 2.0, hx('#5aff8a'))
        cv.dot(x, 2.5, hx('#2a9a4a'))
    for x in (3.0, 18.5):
        stud(cv, x, 2.0, hx('#8a8474'))
    smudge(cv, rng, 5, (2, 5, 20, 16), (0.8, 1.8), 0.32, hx('#7a5226'))   # baked-on spills
    iron = ramp('#3a3640', 0.5, 0.25, 0.4)
    burners = ((6.0, 7.6), (16.0, 7.6), (6.0, 13.2), (16.0, 13.2))
    for (bx, by) in burners:
        ring(cv, bx, by, 1.5, 3.0, lambda dx, dy, d: shade(CHROME, 0.2 + 0.9 * light(-dx / d * 0.9, -dy / d * 0.9)))   # drip bowl
        ring(cv, bx, by, 2.9, 3.2, lambda dx, dy, d: dk(en[1], 0.3) if dx + dy < 0 else None)
        ring(cv, bx, by, 0.8, 1.5, lambda dx, dy, d: shade(iron, light(dx / d, dy / d)) if int(math.atan2(dy, dx) * 2.6) % 2 else iron[0])   # burner head, its ports
        fill_shape(cv, bx, by, 0.85, 0.85, lambda u, v, L: shade(ramp('#2a2630', 0.4, 0.2, 0.5), L))
    ring(cv, 16.0, 13.2, 1.5, 2.1, lambda dx, dy, d: (hx('#9adfff') if d < 1.75 else hx('#3a7aff')) if int(math.atan2(dy, dx) * 2.6) % 2 else hx('#2a5ae8'))
    for gx in (6.0, 16.0):                                             # two cast-iron grates, one over each pair
        for (pts, r_) in (([(gx - 3.6, 4.6), (gx + 3.6, 4.6), (gx + 3.6, 16.0), (gx - 3.6, 16.0), (gx - 3.6, 4.6)], 0.38),
                          ([(gx - 3.6, 10.4), (gx + 3.6, 10.4)], 0.38)):
            fill_capsule(cv, pts, r_, lambda k, L, s, i, t: shade(iron, L))
        for by in (7.6, 13.2):
            for a in (0.785, 2.356, 3.927, 5.498):                     # its fingers reaching in over the bowl
                ca, sa = math.cos(a), math.sin(a)
                fill_capsule(cv, [(gx + ca * 1.9, by + sa * 1.9), (gx + ca * 4.2, by + sa * 4.2)], 0.36,
                             lambda k, L, s, i, t: shade(iron, L))
    for i, x in enumerate((3.2, 7.1, 11.0, 14.9, 18.8)):              # the knobs on the front strip
        knob(cv, x, 18.0, 1.35, '#4a4652', -math.pi / 2 + (0.0, 0.9, -0.6, 2.2, 0.0)[i])
    frect(cv, 1.5, 16.2, 20.5, 16.6, lambda c: dk(c, 0.18))           # where the cooktop drops to the front strip
    chrome_bar(cv, 3.0, 19.6, 19.0, 21.0)                              # the oven door's handle
    for x in (3.0, 18.4):
        frect(cv, x, 19.4, x + 0.6, 21.0, CHROME[1])
    cv.outline()

    def pan(ly):
        fill_capsule(ly, [(2.6, 15.6), (0.6, 17.8)], 0.55, lambda k, L, s, i, t: shade(ramp('#1a1620', 0.4, 0.2, 0.6), L))
        fill_shape(ly, 6.0, 13.2, 3.6, 3.6, lambda u, v, L: shade(ramp('#3a3640', 0.5, 0.25, 0.5), L))
        fill_shape(ly, 6.0, 13.2, 2.8, 2.8, lambda u, v, L: hx('#26222c') if u + v > -1.6 else hx('#3a3644'))
        fill_shape(ly, 5.6, 13.0, 1.7, 1.4, lambda u, v, L: hx('#f6f2e6') if L > 0.4 else hx('#e2dccc'), ang=0.4)   # the egg
        fill_shape(ly, 5.7, 13.0, 0.65, 0.65, lambda u, v, L: hx('#ffd84a') if L > 0.6 else hx('#f2b42a'))

        def kettle(u, v, L):
            return shade(ramp('#c8402c', 0.5, 0.25, 0.4), L)
        fill_shape(ly, 16.0, 7.6, 2.9, 2.9, kettle)
        fill_shape(ly, 16.0, 7.6, 1.2, 1.2, lambda u, v, L: hx('#2a2630') if L < 0.6 else hx('#4a4652'))   # its lid knob
        fill_capsule(ly, [(18.4, 6.4), (19.8, 5.2)], 0.5, lambda k, L, s, i, t: shade(ramp('#c8402c', 0.5, 0.25, 0.4), L))   # spout
        fill_capsule(ly, [(13.6, 6.0), (16.0, 4.9), (18.4, 6.0)], 0.35, lambda k, L, s, i, t: hx('#1a1620'))   # bail handle
    layer(cv, pan)
    return cv


def p_sink():
    """Stainless double sink from above (the wall at -y): brushed deck with its rolled upstand, two deep basins lit on
    their far walls, strainers, a mixer tap with its spout over the left basin and a drop hanging from it, a plate and a
    mug left to soak, a sponge, limescale and water spots."""
    W, H = 28, 20
    cv = Cv(W, H)
    st = ramp('#a6aeba', 0.48, 0.22, 0.42)
    rng = random.Random(201)
    fill_shape(cv, 14.0, 10.0, 13.0, 9.0, lambda u, v, L: shade(st, L), kind='rect', bevel=1.2, corner=1.0)
    frect(cv, 1.5, 1.0, 26.5, 1.5, lt(st[3], 0.2))                    # the upstand rolled over at the wall
    frect(cv, 1.5, 2.0, 26.5, 2.5, dk(st[1], 0.1))
    brushed(cv, rng, (1, 1, 27, 19), 6)
    basin = ramp('#6a7280', 0.5, 0.26, 0.3)
    for bx in (7.5, 20.5):
        fill_shape(cv, bx, 11.5, 5.4, 6.1, lambda u, v, L: shade(basin, 1.05 - L * 0.95), kind='rect', bevel=2.4, corner=1.8)
        fill_shape(cv, bx, 11.5, 5.4, 6.1, lambda u, v, L: (lt(st[3], 0.25) if u > 0 and v > 0 else dk(st[0], 0.2))
                   if (abs(u) > 4.9 or abs(v) > 5.6) and (u > 0 and v > 0 or u < 0 and v < 0) else None, kind='rect', corner=1.8)
        brushed(cv, random.Random(int(bx * 10)), (int(bx) - 4, 7, int(bx) + 4, 16), 4, along_x=False)
        ring(cv, bx, 12.8, 0.9, 1.5, lambda dx, dy, d: lt(st[3], 0.2) if dx + dy < 0 else st[0])   # the strainer
        fill_shape(cv, bx, 12.8, 0.9, 0.9, lambda u, v, L: hx('#2a2a34'))
        for (ox, oy) in ((-0.5, 0.0), (0.5, 0.0), (0.0, -0.5), (0.0, 0.5)):
            cv.dot(bx + ox, 12.8 + oy, hx('#8a929e'))
        smudge(cv, rng, 2, (int(bx) - 3, 10, int(bx) + 3, 16), (1.0, 1.8), 0.22, hx('#d8d0b0'))   # limescale
    for _ in range(14):                                                # water spots dried on the deck
        x, y = rng.uniform(2, 26), rng.uniform(3, 18)
        if 2.0 < x < 13.0 and 5.4 < y < 17.6 or 15.0 < x < 26.0 and 5.4 < y < 17.6:
            continue
        cv.dot(x, y, lt(cv.get(x, y), 0.25))
    cv.outline()

    def tap(ly):
        tr = ramp('#d0d6e0', 0.5, 0.25, 0.55)
        fill_shape(ly, 14.0, 3.2, 3.6, 1.2, lambda u, v, L: shade(tr, L), kind='rect', corner=1.0, bevel=0.8)   # its plate
        for (x, dot) in ((11.0, hx('#2a7af0')), (17.0, hx('#f03a3a'))):   # the two cross-head handles
            fill_shape(ly, x, 3.2, 1.3, 1.3, lambda u, v, L: shade(tr, L), kind='super', p=1.3)
            fill_shape(ly, x, 3.2, 0.5, 0.5, lambda u, v, L, dot=dot: dot)
        fill_capsule(ly, [(14.0, 3.2), (12.6, 4.6), (10.4, 6.4), (9.2, 7.4)], 0.55,
                     lambda k, L, s, i, t: lt(tr[3], 0.3) if L > 0.9 else shade(tr, L))   # the spout
        ly.dot(9.0, 7.5, hx('#5a6070'))
    layer(cv, tap)
    cv.dot(8.75, 8.25, hx('#cfefff'))                                  # the drop hanging from it
    cv.dot(8.75, 8.75, hx('#7ab8e0'))

    def dishes(ly):
        fill_shape(ly, 20.8, 12.0, 3.4, 3.4, lambda u, v, L: shade(WHITE, L) if math.hypot(u, v) > 2.2 else hx('#e8e4d8'))
        ring(ly, 20.8, 12.0, 2.2, 2.5, lambda dx, dy, d: hx('#3a6ab0'))   # its blue band
        smudge(ly, rng, 2, (19, 10, 23, 14), (0.6, 1.0), 0.6, hx('#b85a2a'))   # sauce
        line(ly, 18.0, 9.6, 23.4, 15.0, hx('#c8ccd6'))                  # a fork across it
        line(ly, 18.0, 10.0, 23.0, 15.2, hx('#7a808c'))
        fill_shape(ly, 5.6, 14.2, 1.8, 1.8, lambda u, v, L: shade(ramp('#3a7ac0', 0.45, 0.22, 0.4), L))   # the mug
        fill_shape(ly, 5.6, 14.2, 1.1, 1.1, lambda u, v, L: hx('#2a1810'))
        fill_capsule(ly, [(7.4, 13.8), (8.0, 14.6)], 0.4, lambda k, L, s, i, t: shade(ramp('#3a7ac0', 0.45, 0.22, 0.4), L))
        fill_shape(ly, 24.0, 3.8, 1.8, 1.0, lambda u, v, L: hx('#f2d44a') if v > -0.3 else hx('#3a8a3a'), ang=-0.15,
                   kind='rect', corner=0.3, bevel=0.5)                 # the sponge
    layer(cv, dishes)
    return cv


def p_toilet():
    """Toilet from above, the wall at -y: the cistern under its lid with a spare roll on it and the chrome lever, the
    lid raised against it, the seat on its hinges, the bowl's porcelain rim, the water and the dark of the trap, a
    brown ring at the waterline and a streak of scale from under the rim."""
    W, H = 15, 23
    cv = Cv(W, H)
    wh = ramp('#ecebf0', 0.4, 0.18, 0.2)
    rng = random.Random(211)

    def bowl(ly):
        fill_shape(ly, 7.5, 14.6, 5.7, 7.3, lambda u, v, L: shade(wh, L))   # the seat
        fill_shape(ly, 7.5, 14.8, 4.2, 5.6, lambda u, v, L: shade(ramp('#f2f0ea', 0.4, 0.2, 0.2), 1.1 - L * 0.8))   # porcelain rim
        fill_shape(ly, 7.5, 15.0, 3.6, 4.9, lambda u, v, L: shade(ramp('#e4e2da', 0.4, 0.2, 0.2), 1.05 - L * 0.9))  # the bowl falling away
        fill_shape(ly, 7.5, 15.6, 2.5, 3.4, lambda u, v, L: hx('#9ac8d4') if L < 0.7 else hx('#c4e6ee'))           # the water
        fill_shape(ly, 7.5, 14.6, 1.1, 1.5, lambda u, v, L: hx('#3a6a80') if L < 0.6 else hx('#4e84a0'))           # the trap
        ly.dot(6.5, 16.5, hx('#f4fcff'))
    layer(cv, bowl)

    def stain(x, y, c):
        e = ((x - 7.5) / 2.6) ** 2 + ((y - 15.6) / 3.5) ** 2
        return mix(c, hx('#a8884a'), 0.45) if 0.85 < e <= 1.08 and c[3] else None   # the ring at the waterline
    px_paint(cv, 4, 11, 11, 20, stain)
    line(cv, 7.0, 10.2, 7.2, 12.4, mix(hx('#e4e2da'), hx('#c8a050'), 0.5))   # scale streaking down from the rim

    def tank(ly):
        fill_shape(ly, 7.5, 3.4, 6.5, 2.7, lambda u, v, L: shade(wh, L), kind='rect', bevel=1.2, corner=1.0)
        frect(ly, 1.5, 5.6, 13.5, 6.1, lambda c: dk(c, 0.18))         # the lid's overhang
        fill_shape(ly, 7.5, 6.9, 5.2, 0.7, lambda u, v, L: shade(wh, L - 0.1), kind='rect', corner=0.5, bevel=0.4)   # the raised lid, on edge
        chrome_bar(ly, 1.0, 4.4, 3.4, 5.4)                             # the flush lever
        fill_shape(ly, 9.8, 3.2, 1.7, 1.7, lambda u, v, L: shade(WHITE, L))   # a spare roll
        fill_shape(ly, 9.8, 3.2, 0.6, 0.6, lambda u, v, L: hx('#a89878'))
        for x in (4.0, 11.0):                                          # the seat's hinges
            fill_shape(ly, x, 7.9, 0.8, 0.6, lambda u, v, L: shade(CHROME, L), kind='rect', corner=0.2)
    layer(cv, tank)
    smudge(cv, rng, 3, (3, 1, 13, 6), (0.8, 1.4), 0.08)
    return cv


def p_bed():
    """Double bed: headboard at -y, two pillows, folded-back sheet, rumpled duvet with a turned corner."""
    W, H = 46, 66
    cv = Cv(W, H)
    wood_fill(cv, 1, 1, W - 2, H - 2, hx('#5a3424'), plank=5, rng=random.Random(14), vertical=True)
    cv.rect(1, 1, W - 2, 4, hx('#3e2418'))
    for x in range(1, W - 1):
        cv.set(x, 1, hx('#6e4632'))
    sheet = ramp('#5e2a8a', 0.52, 0.26, 0.34)
    mat = Cv(W, H)
    fill_shape(mat, 23.0, 34.0, 20.6, 29.0, lambda u, v, L: hx('#e8e2ea'), kind='rect', corner=1.5)
    for cx in (13.5, 32.5):
        fill_shape(mat, cx, 10.0, 8.4, 4.4, lambda u, v, L: shade(WHITE, L), kind='rect', bevel=3.2, corner=2.4)
    mat.set(11, 10, WHITE[1])
    mat.set(12, 10, WHITE[1])
    mat.set(34, 9, WHITE[1])
    mat.outline(dk(hx('#5a3424'), 0.5))
    cv.over(mat)
    rng = random.Random(15)
    # long soft folds running down from where someone kicked the duvet, the edges rolling over the mattress
    folds = [(1.2 + rng.uniform(-0.35, 0.35), rng.uniform(0.2, 0.3), rng.uniform(0.9, 1.5), rng.uniform(0, 6.28))
             for _ in range(3)]
    nz = VNoise(W, H, 11, random.Random(16))

    def hf(x, y):
        h = nz(x, y) * 1.6
        for (a, f, amp, ph) in folds:
            h += amp * math.sin((x * math.cos(a) + y * math.sin(a)) * f + ph)
        e = min(x - 1, W - 2 - x)
        return h - (max(0.0, 3.0 - e) ** 2) * 0.35
    duv = Cv(W, H)
    fill_shape(duv, 23.0, 39.5, 21.6, 24.0, lambda u, v, L: sheet[2], kind='rect', corner=2.0)
    for y in range(48, 64):                         # bottom-right corner kicked back
        for x in range(W):
            if duv.on(x, y) and (x - 30) + (y - 48) > 15:
                duv.set(x, y, CLEAR)
    relief(duv, 1, 15, W - 2, H - 2, hf, sheet, 0.8)

    def quilt(x, y, c):
        if c[3] == 0 or c == OUTLINE or y < 19:
            return None
        a, b = (x + y) % 7.0, (x - y) % 7.0
        if (a < 0.5 or b < 0.5) and int(x * 2 + y * 2) % 3:
            return dk(c, 0.13)                       # the quilting's stitches
        if a < 1.0 or b < 1.0:
            return lt(c, 0.05)                       # the down puffed up beside them
        return None
    px_paint(duv, 1, 15, W - 1, H - 1, quilt)
    for x in range(1, W - 1):                       # the sheet folded back over the duvet
        for y in (16, 17, 18):
            if duv.on(x, y):
                duv.set(x, y, WHITE[3] if y == 16 else WHITE[2] if y == 17 else WHITE[1])
    duv.outline()
    cv.over(duv)
    flap = Cv(W, H)                                 # the turned corner lies on the duvet, lining up
    for y in range(40, 64):
        for x in range(W - 1):
            s = (x - 30) + (y - 48)
            if 8 < s <= 15 and duv.on(x, y) and x < W - 3 and y < H - 3:
                flap.set(x, y, mix(hx('#d4c4e0'), hx('#a890c0'), (s - 8) / 7.0))
    flap.outline()
    cv.over(flap)
    cv.outline()
    return cv


def p_pool_table():
    """Pool table: wood rails with mother-of-pearl sights, leather pocket rims over their nets, rubber cushions, worn
    felt lit from above with its nap and chalk marks, the head string, a game in progress, cue, chalk."""
    W, H = 82, 46
    cv = Cv(W, H)
    wood_fill(cv, 1, 1, W - 2, H - 2, hx('#6a3518'), plank=3, rng=random.Random(16))
    mottle(cv, random.Random(161), 6, 5)
    bevel_edges(cv, 1, 1, W - 2, H - 2, 0.25, 0.35)
    felt = ramp('#1f7a4c', 0.45, 0.22, 0.18)
    fn = VNoise(W, H, 5, random.Random(17))
    rng = random.Random(163)
    x0, y0, x1, y1 = 6, 6, W - 7, H - 7
    cx, cy = W / 2, H / 2

    def cloth(x, y, c):
        if x < x0 or x >= x1 + 1 or y < y0 or y >= y1 + 1:     # the rubber cushions along the rails
            if x < x0 - 0.5 or y < y0 - 0.5:
                return felt[1]
            if x >= x1 + 1.5 or y >= y1 + 1.5:
                return felt[0]
            return lt(felt[2], 0.08) if (x < x0 or y < y0) else dk(felt[1], 0.1)
        d = math.hypot((x - cx) / (W * 0.5), (y - cy) / (H * 0.5))
        c = mix(felt[2], lt(felt[2], 0.2), max(0.0, 0.7 - d))   # lamp hot spot
        c = shift(c, int((fn(x, y) - 0.5) * 8) + rng.randint(-2, 2))   # the nap
        if x < x0 + 0.5 or y < y0 + 0.5:
            c = dk(c, 0.2)                                     # the cushions' shadow on the cloth
        return c
    px_paint(cv, x0 - 1, y0 - 1, x1 + 2, y1 + 2, cloth)
    dash(cv, 22.0, y0 + 1, 22.0, y1, lambda c: lt(c, 0.06), 1, 2)            # the head string, chalked faintly
    cv.dot(22.0, cy, lt(felt[3], 0.3))                                       # the spots
    cv.dot(60.0, cy, lt(felt[3], 0.3))
    smudge(cv, random.Random(162), 4, (x0 + 4, y0 + 4, x1 - 4, y1 - 4), (2.0, 3.5), 0.12)   # spilled beer
    smudge(cv, random.Random(164), 5, (x0 + 4, y0 + 4, x1 - 4, y1 - 4), (0.4, 1.0), 0.35, hx('#4a8ad8'))   # chalk
    for x in (16, 26, 36, 46, 56, 66):                                       # mother-of-pearl diamonds
        for y in (2.0, H - 3.0):
            fill_shape(cv, x + 0.5, y + 0.5, 0.9, 0.55, lambda u, v, L: hx('#f8f0dc') if L > 0.6 else hx('#cfc2a0'), kind='super', p=1.0)
    for y in (13, 23, 33):
        for x in (2.0, W - 3.0):
            fill_shape(cv, x + 0.5, y + 0.5, 0.55, 0.9, lambda u, v, L: hx('#f8f0dc') if L > 0.6 else hx('#cfc2a0'), kind='super', p=1.0)
    for (px, py) in ((5.5, 5.5), (41.0, 4.6), (W - 5.5, 5.5), (5.5, H - 5.5), (41.0, H - 4.6), (W - 5.5, H - 5.5)):
        ring(cv, px, py, 2.0, 2.9, lambda dx, dy, d: shade(ramp('#3a2418', 0.45, 0.22, 0.35), light(-dx / d, -dy / d)))
        ring(cv, px, py, 0.0, 2.0, lambda dx, dy, d: hx('#14101a') if (int((dx + 3) * 2) + int((dy + 3) * 2)) % 2 and d > 1.0 else hx('#08060c'))
        ring(cv, px, py, 2.6, 2.95, lambda dx, dy, d: hx('#c8a050') if dx + dy < -1.5 else None)   # the brass plate's edge

    def cue(ly):
        fill_capsule(ly, [(9.0, 39.0), (19.4, 27.6)], 0.55, lambda k, L, s, i, t: hx('#3a6ad8') if t > 0.97 else
                     hx('#f0ece0') if t > 0.94 else (hx('#fff4d8') if s < -0.3 else hx('#e8d4a8')))
        fill_capsule(ly, [(4.0, 41.4), (9.0, 39.0)], 0.8, lambda k, L, s, i, t: hx('#2a1810') if t < 0.3 else
                     (hx('#e8e4dc') if 0.55 < t < 0.6 else hx('#9a4a22') if s < -0.2 else hx('#7a3a1a')))
        fill_shape(ly, 70.0, 2.5, 0.9, 0.9, lambda u, v, L: hx('#5a9ae8') if L > 0.6 else hx('#3a7ad8'), kind='rect', corner=0.2)   # chalk on the rail
        ly.dot(69.5, 2.0, hx('#1a2a4a'))
    layer(cv, cue)
    cv.outline()
    return cv


def p_arcade():
    """Arcade cabinet from above, front at +y: the roof of the purple cabinet with its T-moulding, side art, the lit
    marquee, the CRT in its bezel playing a shooter under its curved glass, the control panel with its art, a ball-top
    stick and four buttons, cigarette burns on the panel, the coin door's two lit slots."""
    W, H = 24, 29
    cv, gl = Cv(W, H), Cv(W, H)
    cab = ramp('#2a1e3e', 0.5, 0.22, 0.35)
    fill_shape(cv, 12.0, 14.5, 11.0, 13.5, lambda u, v, L: shade(cab, L), kind='rect', bevel=1.4, corner=1.0)
    mottle(cv, random.Random(221), 4, 4)
    frect(cv, 1.0, 1.0, 23.0, 1.5, lt(cab[3], 0.15))                   # the T-moulding round the roof

    def side(x, y, c):                                                 # side art: a swoosh fading down the flank
        col = NEON_PINK if x < 12 else NEON_CYAN
        k = 0.15 + 0.35 * (0.5 + 0.5 * math.sin(y * 0.55))
        return dk(col, k) if (x < 12 and x < 2.0) or (x >= 12 and x >= 22.0) else None
    px_paint(cv, 1.0, 2.0, 23.0, 26.0, side)
    frect(cv, 2.0, 2.0, 22.0, 6.0, lambda c: dk(c, 0.1))               # the roof panel, a shade darker, its vents
    for x in range(5, 19, 2):
        frect(cv, x, 3.0, x + 1.0, 4.5, cab[0])
    marquee = [hx('#ff2a6d'), hx('#ff6b1a'), hx('#f9c80e')]

    def marq(x, y, c):
        col = lt(marquee[int((x - 3) / 6.0) % 3], 0.25 if y < 7.5 else 0.05)
        if 7.0 <= y < 8.5 and int(x * 2) % 3 == 0 and 5 < x < 19:
            col = hx('#fff6dc')                                        # the logo's letters
        return col
    px_paint(cv, 3.0, 6.5, 21.0, 9.0, marq)
    px_paint(gl, 3.0, 6.5, 21.0, 9.0, marq)
    frect(cv, 3.0, 9.0, 21.0, 10.0, hx('#100c18'))                     # bezel shadow
    sprites = {(7.0, 11.0): NEON_CYAN, (9.0, 11.0): NEON_CYAN, (11.0, 11.0): NEON_CYAN, (13.0, 11.0): NEON_CYAN,
               (8.0, 12.5): NEON_PINK, (10.0, 12.5): NEON_PINK, (12.0, 12.5): NEON_PINK, (14.0, 12.5): NEON_PINK,
               (11.5, 14.5): hx('#f9c80e'), (15.5, 13.5): hx('#f4f0ff')}

    def screen(x, y, c):
        col = hx('#0c1238') if int(y * 2) % 2 else hx('#121a4a')       # scanlines
        for (sx, sy), sc in sprites.items():
            if sx <= x < sx + 1.0 and sy <= y < sy + 0.5:
                col = sc
        if 10.0 <= x < 13.0 and 16.5 <= y < 17.5:
            col = hx('#3aff8a') if not (11.0 <= x < 12.0 and y >= 17.0) else hx('#121a4a')   # the player's ship
        if 18.0 <= x < 19.0 and 10.5 <= y < 11.0:
            col = hx('#f4f0ff')                                        # the score
        if x < 4.5:
            col = lt(col, 0.25)                                        # the curved glass catching the room
        return col
    px_paint(cv, 4.0, 10.0, 20.0, 18.5, screen)
    px_paint(gl, 4.0, 10.0, 20.0, 18.5, lambda x, y, c: (40, 70, 170, 150) if cv.get(x, y) in (hx('#0c1238'), hx('#121a4a')) else cv.get(x, y))
    cv.dot(11.5, 15.5, hx('#ffffff'))                                  # a shot going up
    gl.dot(11.5, 15.5, hx('#ffffff'))
    panel = Cv(W, H)
    fill_shape(panel, 12.0, 22.0, 10.0, 2.8, lambda u, v, L: shade(ramp('#3e3650'), L), kind='rect', bevel=1.0, corner=0.8)
    px_paint(panel, 2.5, 19.5, 21.5, 20.2, lambda x, y, c: hx('#ff2a6d') if int(x) % 4 else hx('#f9c80e'))   # panel art edge
    fill_shape(panel, 6.0, 22.4, 0.9, 0.9, lambda u, v, L: shade(ramp('#1a1820', 0.4, 0.2, 0.5), L))   # the stick's shaft hole
    fill_shape(panel, 5.7, 22.0, 1.3, 1.3, lambda u, v, L: lt(hx('#ff8080'), 0.3) if L > 0.9 else shade(ramp('#e02a30', 0.45, 0.2, 0.45), L))   # ball top
    for (x, c) in ((11.0, '#05d9e8'), (13.5, '#f9c80e'), (16.0, '#3aff8a'), (18.5, '#ff2a6d')):
        fill_shape(panel, x, 22.6, 0.85, 0.85, lambda u, v, L, c=c: lt(hx(c), 0.35) if L > 0.85 else shade(ramp(c, 0.45, 0.2, 0.3), L))
        fill_shape(gl, x, 22.6, 0.7, 0.7, lambda u, v, L, c=c: hx(c))
    fill_shape(panel, 15.0, 24.2, 0.5, 0.4, lambda u, v, L: hx('#1a1018'))   # a cigarette burn
    panel.outline()
    cv.outline()
    cv.over(panel)
    frect(cv, 7.0, 26.0, 17.0, 28.0, hx('#4a4458'))                   # coin door
    frect(cv, 7.0, 26.0, 17.0, 26.5, hx('#6a6478'))
    for x in (9.0, 14.0):
        frect(cv, x, 26.5, x + 1.0, 27.5, hx('#ff3a2a'))
        frect(cv, x + 0.25, 26.5, x + 0.75, 27.5, hx('#ffb0a0'))
        frect(gl, x, 26.5, x + 1.0, 27.5, hx('#ff3a2a'))
    return cv, gl


def p_crate():
    """Shipping crate lid: frame boards, planks, a batten, nails and faded stencils."""
    S = 21
    cv = Cv(S, S)
    w = ramp('#ad7642', 0.45, 0.22, 0.3)
    rng = random.Random(18)
    wood_fill(cv, 1, 1, S - 2, S - 2, w[2], plank=5, rng=rng)
    mottle(cv, random.Random(231), 7, 5)
    fr = Cv(S, S)
    frame = random.Random(232)
    for (x0, y0, x1, y1, lit) in ((1, 1, S - 2, 2, True), (1, S - 3, S - 2, S - 2, False), (1, 3, 2, S - 4, True),
                                  (S - 3, 3, S - 2, S - 4, False), (3, 10, S - 4, 11, True)):
        wood_fill(fr, x0, y0, x1, y1, w[3] if lit else w[2], plank=2 if y1 - y0 < x1 - x0 else 99, rng=frame,
                  vertical=y1 - y0 > x1 - x0)
        bevel_edges(fr, x0, y0, x1, y1, 0.2, 0.3)
    nails = ((1.5, 1.5), (S - 2.5, 1.5), (1.5, S - 2.5), (S - 2.5, S - 2.5), (3.5, 10.5), (S - 4.5, 10.5),
             (10.5, 1.5), (10.5, S - 2.5))
    for (x, y) in nails:
        stud(fr, x, y, hx('#6a6a76'))
        fr.dot(x + 0.5, y + 1.0, mix(fr.get(x + 0.5, y + 1.0), hx('#7a3a1c'), 0.5))   # a rust tear under it
    cv.over(fr)
    ink = alpha(hx('#1a1218'), 140)
    for ax in (7, 13):                     # "this way up" arrows
        for (dx, dy) in ((0, 0), (-1, 1), (1, 1), (-2, 2), (2, 2), (0, 1), (0, 2), (0, 3), (0, 4)):
            cv.blend(ax + dx, 4 + dy, ink)
    for (y, x0, x1) in ((14, 5, 15), (16, 7, 13)):   # shipping marks: two stencilled words, worn
        for x in range(x0, x1 + 1):
            if (x - x0) % 4 != 3:
                for (ox, oy) in ((0, 0), (0.5, 0), (0, 0.5), (0.5, 0.5)):
                    if frame.random() < 0.8:
                        cv.bpx(int((x + ox) * cv.s), int((y + oy) * cv.s), ink)
    fgrain(cv, random.Random(233), 4)
    cv.outline()
    return cv


def p_barrel():
    """200 L steel drum, red, explosive, from above: the rolled chime, the lid dished a little, its pressed ring, the
    two bungs, a hazard diamond with its flame, a stencilled code, chipped paint, rust and a dent."""
    S = 20
    c = S / 2
    cv = Cv(S, S)
    red = ramp('#c81e28', 0.55, 0.28, 0.35)
    fill_shape(cv, c, c, 9.0, 9.0, lambda u, v, L: shade(red, 0.62 - (u + v) * 0.02))
    ring(cv, c, c, 8.1, 9.05, lambda dx, dy, d: shade(red, light(dx / d * 0.95, dy / d * 0.95)) if d > 8.5 else red[0])
    ring(cv, c, c, 7.5, 8.1, lambda dx, dy, d: shade(red, 0.9 - light(dx / d, dy / d) * 0.75))   # the chime's inner wall
    ring(cv, c, c, 5.3, 5.9, lambda dx, dy, d: shade(red, 0.2 + light(dx / d, dy / d) * 0.8))   # a pressed ring
    for (bx, by, r_) in ((4.6, 8.0, 1.5), (15.0, 13.0, 0.95)):        # the bungs
        ring(cv, bx, by, r_, r_ + 0.5, lambda dx, dy, d: dk(red[1], 0.2) if dx + dy < 0 else lt(red[2], 0.2))
        fill_shape(cv, bx, by, r_, r_, lambda u, v, L: shade(ramp('#9a9aa8', 0.5, 0.25, 0.45), L))
        line(cv, bx - r_ * 0.6, by, bx + r_ * 0.6, by, hx('#4a4a58'))
    for (x, y) in ((10.5, 2.4), (10.5, 17.4)):
        frect(cv, x - 2.5, y - 0.25, x + 2.5, y + 0.25, alpha(hx('#f0e8d8'), 150))   # stencilled code, worn
    cx, cy = 11.0, 9.6

    def diamond(x, y, col):
        d = abs(x - cx) + abs(y - cy)
        if d > 3.9:
            return None
        if d > 3.4:
            return hx('#1a1420')
        if d > 3.0:
            return hx('#f2b80e') if (x - cx) + (y - cy) > 0 or d < 3.2 else hx('#fff0a0')
        return hx('#f2b80e')
    px_paint(cv, cx - 4, cy - 4, cx + 4, cy + 4, diamond)
    for (x, y) in ((11.0, 8.0), (10.5, 8.5), (11.0, 8.5), (11.5, 9.0), (10.5, 9.0), (10.0, 9.5), (11.0, 9.5),
                   (11.5, 9.5), (10.0, 10.0), (10.5, 10.0), (11.0, 10.0), (11.5, 10.0), (10.5, 10.5), (11.0, 10.5),
                   (9.5, 11.0), (10.0, 11.0), (10.5, 11.0), (11.0, 11.0), (11.5, 11.0), (12.0, 11.0)):
        cv.dot(x, y, hx('#1a1420'))                                    # the flame over its bar
    rng = random.Random(241)
    smudge(cv, rng, 5, (2, 2, 18, 18), (0.5, 0.9), 0.75, hx('#9a9aa8'))   # chipped to bare steel
    smudge(cv, rng, 5, (1, 1, 19, 19), (0.8, 1.8), 0.45, hx('#6a3416'))   # rust
    smudge(cv, rng, 1, (13, 4, 16, 7), (1.6, 2.0), 0.22)                # a dent
    fgrain(cv, random.Random(242), 3)
    cv.outline()
    return cv


def p_bookshelf():
    """Bookcase from above: back panel at -y, two dividers, book tops (spine, boards, the page block), one lying
    flat."""
    W, H = 42, 13
    cv = Cv(W, H)
    wood = ramp('#5a3420', 0.45, 0.22, 0.3)
    frect(cv, 1, 1, W - 1, H - 1, dk(wood[1], 0.35))
    wood_fill(cv, 1, 1, W - 2, 2, wood[2], plank=2, rng=random.Random(191))
    frect(cv, 1, 1, W - 1, 1.5, wood[3])
    wood_fill(cv, 1, H - 2, W - 2, H - 2, wood[2], plank=1, rng=random.Random(192))
    rng = random.Random(19)
    cols = ['#9a2228', '#2a4aa8', '#c8a850', '#2c7a52', '#6a1f8a', '#d8d0bc', '#c85a1a', '#1a8a8a', '#3a2a44', '#7a5a3a']
    divs = (1, 2, 14, 27, W - 3, W - 2)
    x = 3.0
    while x < W - 3:
        if int(x) in divs:
            x = int(x) + 1.0
            continue
        if rng.random() < 0.1:
            x += 0.5                           # a gap
            continue
        bw = rng.choice([1.0, 1.5, 1.5, 2.0, 2.5, 3.0])
        nxt = min([d for d in divs if d > x] + [W - 3])
        bw = min(bw, nxt - x)
        depth = rng.choice([6.0, 6.5, 7.0, 7.5, 8.0])
        col = hx(rng.choice(cols))
        lit = rng.uniform(-0.1, 0.2)           # taller books catch more light
        base = lt(col, lit) if lit > 0 else dk(col, -lit)

        def book(px, py, c, x=x, bw=bw, depth=depth, base=base, col=col):
            if px < x + 0.5:
                return lt(base, 0.18) if py < 3.5 + depth - 0.5 else dk(col, 0.35)   # the spine's rounded back
            if px >= x + bw - 0.5 and bw > 1:
                return dk(base, 0.15)          # the far board
            if bw >= 1.5 and py < 3 + depth - 1:
                return mix(base, hx('#e8dcc0'), 0.55) if int(py * 2) % 2 else mix(base, hx('#d8ccb0'), 0.5)   # pages
            return base if py < 3 + depth - 0.5 else dk(col, 0.35)
        px_paint(cv, x, 3, x + bw, 3 + depth, book)
        if bw >= 2:
            frect(cv, x + 0.5, 3.5, x + bw - 0.5, 4.0, lt(base, 0.25))   # a gilt band at the head
        x += bw
    for xx in (14, 27):
        frect(cv, xx, 2, xx + 1, H - 1, wood[2])
        frect(cv, xx, 2, xx + 0.5, H - 1, wood[3])
    frect(cv, 1, 2, 3, H - 1, wood[2])
    frect(cv, W - 3, 2, W - 1, H - 1, wood[1])
    flat = Cv(W, H)                         # a book lying across the others
    fill_shape(flat, 33.0, 6.0, 4.4, 3.0, lambda u, v, L: shade(ramp('#8a2a2a', 0.45, 0.2, 0.35), L), ang=0.12,
               kind='rect', bevel=1.0, corner=0.4)
    line(flat, 29.6, 3.4, 37.6, 4.4, hx('#d8b860'))     # its gilt title
    line(flat, 30.0, 8.0, 36.4, 8.8, hx('#e8dcc0'))     # the page block's edge
    flat.outline()
    cv.over(flat)
    fgrain(cv, random.Random(193), 3)
    cv.outline()
    return cv


def p_speaker():
    """PA cabinet: black tolex with its weave, steel corner caps, a woofer in its rubber surround with a dented dust
    cap, the horn's slot, screws round the baffle."""
    S = 16
    cv = Cv(S, S)
    fill_shape(cv, 8.0, 8.0, 7.0, 7.0, lambda u, v, L: shade(ramp('#26232e', 0.5, 0.2, 0.32), L), kind='rect', bevel=1.2, corner=1.0)
    px_paint(cv, 1, 1, 15, 15, lambda x, y, c: shift(c, 4) if (int(x * 2) + int(y * 2)) % 3 == 0 else None)   # the tolex's weave
    ring(cv, 8.0, 9.0, 4.4, 5.6, lambda dx, dy, d: shade(ramp('#3e3a4a', 0.45, 0.22, 0.45), light(dx / d * 0.85, dy / d * 0.85)))   # surround
    ring(cv, 8.0, 9.0, 5.6, 6.0, lambda dx, dy, d: hx('#121016'))
    fill_shape(cv, 8.0, 9.0, 4.4, 4.4, lambda u, v, L: shade(ramp('#1e1c24', 0.3, 0.15, 0.55), 1.05 - L))   # the cone
    for a in range(0, 360, 45):
        r_ = math.radians(a)
        line(cv, 8.0 + math.cos(r_) * 1.9, 9.0 + math.sin(r_) * 1.9, 8.0 + math.cos(r_) * 4.2, 9.0 + math.sin(r_) * 4.2,
             hx('#2a2832'))                                            # the cone's ribs
    fill_shape(cv, 8.0, 9.0, 1.7, 1.7, lambda u, v, L: shade(ramp('#5a5868', 0.4, 0.2, 0.45), L))   # dust cap
    cv.dot(8.5, 9.5, hx('#2a2832'))
    frect(cv, 5.0, 2.0, 11.0, 2.8, hx('#3a3646'))                      # the horn
    frect(cv, 5.5, 2.25, 10.5, 2.6, hx('#0e0c12'))
    for (x, y) in ((2.5, 4.0), (13.0, 4.0), (2.5, 14.0), (13.0, 14.0)):
        stud(cv, x, y, hx('#6a6a7a'))
    for (x, y) in ((1, 1), (13, 1), (1, 13), (13, 13)):                # steel corner caps
        fill_shape(cv, x + 1.0, y + 1.0, 1.0, 1.0, lambda u, v, L: shade(ramp('#9a9aaa', 0.5, 0.25, 0.4), L), kind='rect', corner=0.5)
    cv.outline()
    return cv


def p_dj_booth():
    """DJ booth: two direct-drive decks, records with their grooves and labels, strobe dots on the platters' rims, tone
    arms with their headshells, pitch faders; a mixer with its faders, EQ knobs and VU ladders; headphones thrown
    down; the LED chaser over a pink tube along the front (+y)."""
    W, H = 60, 24
    cv = Cv(W, H)
    desk = ramp('#1c1826', 0.4, 0.2, 0.4)
    fill_shape(cv, 30.0, 12.0, 29.0, 11.0, lambda u, v, L: shade(desk, L), kind='rect', bevel=1.4, corner=1.0)
    mottle(cv, random.Random(261), 3, 6)
    plinth = ramp('#7a7a8a', 0.45, 0.22, 0.4)
    for tx, lab in ((10.5, hx('#e8303a')), (49.5, hx('#2a9ad8'))):
        fill_shape(cv, tx, 9.5, 8.0, 6.5, lambda u, v, L: shade(plinth, L), kind='rect', bevel=1.2, corner=1.0)
        px = tx - 1.2
        ring(cv, px, 9.5, 5.4, 5.9, lambda dx, dy, d: hx('#e8ecf4') if int(math.atan2(dy, dx) * 12) % 2 else hx('#6a6e7a'))   # strobe dots
        ring(cv, px, 9.5, 0.0, 5.4, lambda dx, dy, d: hx('#1c1a22') if int(d * 3.2) % 2 else hx('#0c0a10'))   # grooves
        ring(cv, px, 9.5, 2.4, 5.2, lambda dx, dy, d: hx('#3e3c4a') if abs(math.atan2(dy, dx) + 2.3) < 0.18 else None)   # the light on the vinyl
        fill_shape(cv, px, 9.5, 1.6, 1.6, lambda u, v, L, lab=lab: shade(ramp(lab, 0.4, 0.2, 0.3), L))
        cv.dot(px, 9.5, hx('#e8e8f0'))                                 # the spindle
        fill_shape(cv, tx + 5.6, 4.4, 1.1, 1.1, lambda u, v, L: shade(ramp('#9a9aaa'), L))   # tone arm's pivot
        fill_capsule(cv, [(tx + 5.6, 4.4), (tx + 5.2, 10.0), (tx + 3.4, 12.2)], 0.35, lambda k, L, s, i, t: shade(CHROME, L))
        fill_shape(cv, tx + 3.0, 12.6, 0.7, 0.5, lambda u, v, L: hx('#2a2832'), ang=0.6, kind='rect', corner=0.2)   # headshell
        frect(cv, tx + 5.5, 11.5, tx + 6.5, 15.0, hx('#100e16'))       # pitch fader
        frect(cv, tx + 5.0, 13.0, tx + 7.0, 13.5, hx('#e8e8f0'))
    fill_shape(cv, 30.0, 9.5, 9.0, 6.6, lambda u, v, L: shade(ramp('#2e2c38', 0.45, 0.22, 0.4), L), kind='rect', bevel=0.8, corner=0.6)   # mixer
    for i, x in enumerate((23.5, 26.5)):                              # channel faders + EQ knobs
        for y in (4.4, 6.2, 8.0):
            knob(cv, x, y, 0.7, '#1a1820', -1.6 + i * 0.6 + y * 0.2)
        frect(cv, x - 0.25, 9.5, x + 0.25, 14.5, hx('#0c0a10'))
        frect(cv, x - 0.75, 11.0 + i * 1.5, x + 0.75, 11.75 + i * 1.5, hx('#e8e8f0'))
    for k in range(10):                                                # VU ladders
        y = 13.5 - k * 0.9
        col = hx('#3aff6a') if k < 6 else hx('#f9c80e') if k < 8 else hx('#ff2a3a')
        for x, lvl in ((31.0, 7), (33.0, 5)):
            frect(cv, x, y, x + 1.0, y + 0.5, col if k < lvl else dk(col, 0.72))
    frect(cv, 23.0, 15.0, 29.0, 15.5, hx('#100e16'))                   # crossfader
    frect(cv, 25.5, 14.7, 26.5, 15.8, hx('#e8e8f0'))
    for y in (5.0, 8.0):
        knob(cv, 36.5, y, 0.7, '#1a1820', 0.4 * y)
    cv.outline()

    def phones(ly):
        fill_capsule(ly, [(14.5, 17.0), (17.0, 15.0), (20.5, 16.2)], 0.55, lambda k, L, s, i, t: shade(ramp('#3a3846', 0.45, 0.2, 0.4), L))
        for x in (14.5, 20.5):
            fill_shape(ly, x, 17.2, 1.6, 1.6, lambda u, v, L: shade(ramp('#3a3846', 0.45, 0.2, 0.4), L))
            fill_shape(ly, x, 17.2, 0.8, 0.8, lambda u, v, L: hx('#141218'))
        line(ly, 20.5, 18.6, 23.0, 19.4, hx('#141218'))
    layer(cv, phones)
    leds = ['#ff2a6d', '#05d9e8', '#f9c80e']

    def fascia(x, y, c):                                               # the LED chaser over a pink tube
        if y < 19.5:
            return hx(leds[int(x / 4) % 3]) if int(x * 2) % 8 in (2, 3) else hx('#2a2236')
        if y < 20.5:
            return hx('#ffc0d8') if y < 20.0 else hx('#ff5a8d')
        return hx('#c8205a')
    px_paint(cv, 2.0, 19.0, W - 2.0, 21.5, fascia)
    return cv


def p_bar_counter():
    """One metre of bar (levels chain them along x, so it tiles seamlessly): bartender lip at -y, polished
    mahogany top, padded armrest and brass foot rail on the customer side (+y). The glasses standing on it are
    set out by the game (DESTRUCTION rack), so that no two metres are alike."""
    W, H = 32, 21
    cv = Cv(W, H)
    wood = ramp('#4a2418', 0.45, 0.2, 0.32)
    rng = random.Random(20)
    nz = VNoise(W, H * 4, 8, rng)                   # wraps on 32 px: seamless
    nf = VNoise(W, H * 8, 4, rng)
    pores = dict((r, rng.uniform(0, 5)) for r in rng.sample(range(6, 27), 7))

    def top(x, y, c):
        if y < 1.5:
            return lt(wood[3], 0.12) if y < 1.0 else wood[3]           # the rounded lip, catching the light
        if y < 2.5:
            return wood[0] if y < 2.0 else dk(wood[1], 0.1)
        g = (nz(x, y * 4) - 0.5) * 30 + (nf(x, y * 8) - 0.5) * 12      # long streaks of grain along the counter
        c = shift(wood[2], int(g))
        if pores.get(int(y * 2)) and (x * 0.37 + pores[int(y * 2)]) % 5.0 < 3.2:
            c = dk(c, 0.16)                                            # a dark vein of the grain
        k = 0.05 + 0.08 * math.sin(x * math.pi / 16) ** 2 * max(0.0, 1.0 - abs(y - 6.6) / 2.0)
        c = lt(c, k)                                                   # the lamps' sheen in the varnish
        if 5.5 <= y < 6.0 and int(x * 2) % 32 not in (0, 1, 17, 30):
            c = lt(c, 0.07)                                            # a harder line of reflection
        if y >= 13.5:
            c = dk(c, 0.18 if y < 14.0 else 0.3)                       # the front edge rolling over
        return c
    px_paint(cv, 0, 0.5, W, 14.5, top)
    frect(cv, 0, 0, W, 0.5, OUTLINE)
    for (gx, gy, r) in ((9.3, 9.2, 1.9), (24.6, 4.4, 1.7)):         # old glass rings in the varnish
        ring(cv, gx, gy, r - 0.3, r + 0.25, lambda dx, dy, d, gx=gx, gy=gy: dk(cv.get(gx + dx, gy + dy), 0.12) if dx + dy > -1.6 else None)
    for (sx, sy, ln, a) in ((4.5, 11.2, 3.0, 0.15), (19.0, 3.4, 2.2, -0.2), (27.5, 12.0, 1.6, 0.3)):   # scratches
        line(cv, sx, sy, sx + math.cos(a) * ln, sy + math.sin(a) * ln, lt(wood[2], 0.2))
    pad = ramp('#5e1a22', 0.5, 0.26, 0.3)

    def arm(x, y, c):
        t = (y - 14.5) / 3.5                                           # across the padded armrest
        col = shade(pad, 0.95 - t * 0.85)
        u = x % 16.0
        if u < 0.5 or u > 15.5:
            col = dk(pad[0], 0.25)                                     # tuck seam every half metre
        elif u < 1.5 or u > 14.5:
            col = dk(col, 0.12 * (1.5 - min(u, 16 - u)))               # the vinyl pulled into it
        return col
    px_paint(cv, 0, 14.5, W, 18.0, arm)
    dash(cv, 0, 15.25, W, 15.25, lambda c: lt(c, 0.12), 2, 1)          # piping stitches
    for (cx, cy) in ((6.0, 16.6), (21.0, 16.2), (28.5, 16.9)):        # creases where elbows lean
        crease(cv, [(cx - 1.4, cy - 0.3), (cx, cy), (cx + 1.6, cy - 0.2)], 0.12)
    frect(cv, 0, 18.0, W, 18.5, OUTLINE)

    brass = ramp('#b88a3a', 0.5, 0.26, 0.4)

    def rail(x, y, c):
        t = y - 18.5
        col = brass[3] if t < 0.5 else brass[2] if t < 1.0 else brass[1] if t < 1.5 else brass[0]
        if t < 0.5 and int(x * 2) % 9:
            col = lt(col, 0.3)                                         # the bright line along the tube
        return mix(col, hx('#5a4a2a'), max(0.0, nz(x * 2, 3) - 0.55) * 1.2)   # tarnish where hands never go
    px_paint(cv, 0, 18.5, W, 20.5, rail)
    frect(cv, 0, 20.5, W, 21, OUTLINE)
    for bx in (7.0, 23.0):                                             # rail brackets bolted to the front
        frect(cv, bx, 18.0, bx + 2.0, 20.5, brass[1])
        frect(cv, bx, 18.0, bx + 2.0, 18.5, brass[0])
        frect(cv, bx, 18.5, bx + 0.5, 20.5, brass[2])
        stud(cv, bx + 1.0, 19.0, brass[2])
    return cv


def p_dumpster():
    """Green steel dumpster from above, front along +y: its rolled rim with the side ribs, two black plastic lids with
    moulded ribs, hinge knuckles and a grip (the right one pushed back over bin bags and a box), the fork pockets, the
    casters peeking out at the corners, a stencilled name, rust and grime."""
    W, H = 60, 36
    cv = Cv(W, H)
    g = ramp('#2c6a3c', 0.5, 0.26, 0.3)
    rng = random.Random(21)
    for (x, y) in ((4.0, 34.4), (56.0, 34.4), (4.0, 1.6), (56.0, 1.6)):   # the casters
        fill_shape(cv, x, y, 2.2, 1.4, lambda u, v, L: shade(RUBBER, L), kind='rect', corner=0.6)
    fill_shape(cv, 30.0, 18.0, 29.0, 16.6, lambda u, v, L: shade(g, L), kind='rect', bevel=1.6, corner=1.2)
    for x in range(8, 54, 6):                                          # the ribs pressed into the sides, seen over the rim
        for (y0, y1) in ((1.4, 2.4), (33.6, 34.6)):
            frect(cv, x, y0, x + 1.0, y1, lambda cc: lt(cc, 0.16))
            frect(cv, x + 1.0, y0, x + 1.5, y1, lambda cc: dk(cc, 0.25))
    for (x0, x1) in ((1, 2.5), (57.5, 59)):                            # fork pockets
        for y in (9, 23):
            frect(cv, x0, y, x1, y + 4, g[0])
            frect(cv, x0, y, x1, y + 0.5, lt(g[1], 0.1))
    rng2 = random.Random(22)
    mottle(cv, rng2, 5, 5)
    smudge(cv, rng2, 12, (1, 1, 58, 34), (0.6, 2.2), 0.55, hx('#7a3e1a'))   # rust
    smudge(cv, rng2, 8, (1, 1, 58, 34), (1.5, 3.5), 0.16)                  # grime
    lid = ramp('#262a2c', 0.4, 0.18, 0.28)
    frect(cv, 31, 22, 57, 31.5, hx('#0c0a10'))                         # the dark of the open half

    def lids(ly):
        for (x0, x1, y0, y1) in ((3.5, 29.5, 3.5, 31.5), (30.5, 56.5, 3.5, 21.0)):
            fill_shape(ly, (x0 + x1) / 2, (y0 + y1) / 2, (x1 - x0) / 2, (y1 - y0) / 2,
                       lambda u, v, L: shade(lid, L), kind='rect', bevel=1.2, corner=1.0)
            for y in [y0 + 6.5 + k * 7 for k in range(4) if y0 + 6.5 + k * 7 < y1 - 3]:   # moulded ribs
                frect(ly, x0 + 1.5, y, x1 - 1.5, y + 0.5, lt(lid[2], 0.18))
                frect(ly, x0 + 1.5, y + 0.5, x1 - 1.5, y + 1.5, shift(lid[2], 6))
                frect(ly, x0 + 1.5, y + 1.5, x1 - 1.5, y + 2.0, lid[0])
            for x in (x0 + 4, x1 - 6):                                 # hinge knuckles at the back
                frect(ly, x, y0 - 0.5, x + 2.0, y0 + 1.0, hx('#5a5e66'))
                frect(ly, x, y0 - 0.5, x + 2.0, y0, hx('#8a8e98'))
            gx = (x0 + x1) / 2
            frect(ly, gx - 3.0, y1 - 2.0, gx + 3.0, y1 - 0.8, lid[0])  # the grip moulded in its front
            frect(ly, gx - 3.0, y1 - 0.8, gx + 3.0, y1 - 0.4, lt(lid[2], 0.12))
            fgrain(ly, rng, 3)
    layer(cv, lids)
    bags = Cv(W, H)
    for _ in range(7):                                                 # bin bags in the open half
        bx, by, r_ = rng.uniform(34, 54), rng.uniform(24, 30), rng.uniform(2.6, 4.0)
        fill_shape(bags, bx, by, r_, r_ * 0.85, lambda u, v, L: shade(ramp('#2a2834', 0.45, 0.2, 0.32), L),
                   ang=rng.uniform(0, 3))
        crease(bags, [(bx - r_ * 0.5, by - r_ * 0.2), (bx, by + r_ * 0.1), (bx + r_ * 0.4, by - r_ * 0.3)], 0.3)
    fill_shape(bags, 49.0, 25.0, 3.4, 2.2, lambda u, v, L: shade(ramp('#a8865a', 0.4, 0.2, 0.3), L), ang=0.4,
               kind='rect', corner=0.4)                                # a flattened cardboard box
    fill_shape(bags, 38.5, 28.5, 1.0, 1.0, lambda u, v, L: shade(ramp('#3a8a3a', 0.45, 0.22, 0.4), L))   # a bottle
    px_paint(bags, 0, 0, W, H, lambda x, y, cc: CLEAR if not (31 <= x < 57 and 22.5 <= y < 31.5) else None)
    bags.outline(hx('#0c0a10'))
    cv.over(bags)
    frect(cv, 31, 21.0, 57, 22.5, hx('#0c0a10'))                       # the shadow the raised lid casts in
    smudge(cv, rng2, 6, (4, 4, 56, 30), (1.5, 3.0), 0.1)               # grime on the lids
    for _ in range(9):                                                 # and what the pigeons left
        x, y = rng2.uniform(5, 55), rng2.uniform(5, 20)
        cv.dot(x, y, hx('#d8d4c8'))
        cv.dot(x + 0.5, y, hx('#a8a498'))
    for x in range(8, 26):                                             # a stencilled name on the rim, worn
        if x % 4 != 3 and rng2.random() < 0.8:
            frect(cv, x, 32.8, x + 1, 33.6, lambda cc: mix(cc, hx('#e8e4d8'), 0.45))
    cv.outline()
    return cv


def p_bin_lid():
    """A trash can's lid fallen off, lying upside down and tipped on its handle, from above: the dished underside in
    shade with its pressed rings, the rolled rim lit along its top edge, oval because it lies askew, grime inside."""
    W, H = 16, 12
    cv = Cv(W, H)
    m = ramp('#7a808c', 0.5, 0.25, 0.35)
    cx, cy = W / 2, H / 2
    fill_shape(cv, cx, cy, 7.2, 5.2, lambda u, v, L: shade(m, 0.25 + 0.35 * L))              # the dish, in shade
    fill_shape(cv, cx, cy, 5.4, 3.8, lambda u, v, L: shade(m, 0.12 + 0.3 * (1 - L)))         # deeper in the middle
    fill_shape(cv, cx, cy, 3.0, 2.0, lambda u, v, L: shade(m, 0.3 + 0.2 * L))                # a pressed ring
    fill_shape(cv, cx, cy, 2.2, 1.4, lambda u, v, L: shade(m, 0.15))
    for x in range(2, W - 2):                                                                  # the rim lit on top
        y = cy - 5.2 * math.sqrt(max(0.0, 1 - ((x + 0.5 - cx) / 7.2) ** 2))
        cv.dot(x + 0.5, y + 0.4, lt(m[3], 0.12))
    rng = random.Random(291)
    smudge(cv, rng, 3, (3, 3, 13, 9), (0.8, 1.6), 0.35, hx('#3a3228'))                         # grime
    smudge(cv, rng, 3, (2, 2, 14, 10), (0.4, 0.8), 0.5, hx('#7a3a1c'))                         # rust
    cv.outline()
    return cv


def p_trash_can_down():
    """The galvanised can knocked over, from above, its lid gone (the lid is the standing can's sprite, rolled off):
    the corrugated body lying along x with its pressed bands, the base at -x, the open mouth at +x black inside with
    the night's rubbish spilling out of it (a split bag, papers, a can), a fresh dent where it was hit."""
    W, H = 26, 17
    cv = Cv(W, H)
    m = ramp('#7a808c', 0.5, 0.25, 0.35)
    cy = H / 2

    def body(x, y, c):
        v = (y - cy) / 7.2                                            # across the cylinder: lit on its top side
        if abs(v) > 1:
            return None
        L = 0.95 - (v + 1) * 0.42
        if int(x) in (5, 6, 11, 12, 17):
            L += 0.12 if int(x) % 2 else -0.14                         # the pressed bands
        return shade(m, L)
    px_paint(cv, 1.5, cy - 7.2, 20.5, cy + 7.2, body)
    fill_shape(cv, 1.8, cy, 1.2, 7.0, lambda u, v, L: shade(m, 0.3 + 0.4 * L))   # the base's rim
    fill_shape(cv, 20.5, cy, 2.2, 7.2, lambda u, v, L: lt(m[3], 0.1) if u > 0.4 else m[2])   # the mouth's rim
    fill_shape(cv, 20.6, cy, 1.4, 6.2, lambda u, v, L: hx('#141216'))  # inside
    rng = random.Random(281)
    mottle(cv, rng, 8, 4)
    smudge(cv, rng, 2, (7, 3, 13, 9), (1.8, 2.6), 0.32)               # the dent
    smudge(cv, rng, 4, (2, 2, 20, 15), (0.4, 0.9), 0.6, hx('#7a3a1c'))   # rust
    cv.outline()

    def spill(ly):                                                     # what came out of it
        fill_shape(ly, 23.0, cy + 1.5, 2.6, 2.4, lambda u, v, L: shade(ramp('#26282c', 0.45, 0.25, 0.45), L))   # a split bag
        frect(ly, 21.5, cy - 4.5, 24.5, cy - 2.0, hx('#d8d2c0'))     # papers
        frect(ly, 22.0, cy - 4.0, 24.0, cy - 3.5, hx('#9a948a'))
        fill_shape(ly, 24.6, cy + 4.6, 1.0, 0.8, lambda u, v, L: hx('#b8262c') if L > 0.4 else hx('#7a1420'))   # a can
    layer(cv, spill, hx('#0c0a0c'))
    return cv


def p_trash_can():
    """Galvanised can lid: pressed concentric ribs, a handle bar on its clips, a dent, rust at the rim and grime."""
    S = 17
    c = S / 2
    cv = Cv(S, S)
    m = ramp('#7a808c', 0.5, 0.25, 0.35)
    fill_shape(cv, c, c, 7.5, 7.5, lambda u, v, L: shade(m, L))
    ring(cv, c, c, 6.9, 7.5, lambda dx, dy, d: lt(m[3], 0.15) if light(dx / d, dy / d) > 0.75 else m[1] if light(dx / d, dy / d) < 0.4 else None)
    for (r0, r1) in ((5.0, 5.8), (2.8, 3.5)):
        ring(cv, c, c, r0, r1, lambda dx, dy, d: m[1] if light(dx / d, dy / d) < 0.55 else m[3])
        ring(cv, c, c, r1, r1 + 0.5, lambda dx, dy, d: dk(m[2], 0.2) if light(dx / d, dy / d) > 0.55 else None)
    rng = random.Random(271)
    mottle(cv, rng, 8, 4)

    def spangle(x, y, cur):                                            # the galvanising's crystals
        if cur[3] == 0 or cur == OUTLINE:
            return None
        k = math.sin(x * 2.1 + math.sin(y * 1.3) * 2.0) * math.sin(y * 1.7 - x * 0.6)
        return shift(cur, int(k * 7))
    px_paint(cv, 0, 0, S, S, spangle)
    smudge(cv, rng, 2, (4, 9, 12, 13), (1.6, 2.4), 0.25)    # dent
    smudge(cv, rng, 3, (2, 2, 15, 15), (1.0, 2.0), 0.3, hx('#5a4a36'))
    smudge(cv, rng, 5, (1, 1, 16, 16), (0.4, 0.9), 0.6, hx('#7a3a1c'))   # rust spots
    fgrain(cv, random.Random(272), 4)
    cv.outline()

    def handle(ly):
        for hxp in (5.0, 12.0):
            fill_shape(ly, hxp, 8.5, 0.9, 1.3, lambda u, v, L: shade(ramp('#6a707c', 0.5, 0.25, 0.35), L), kind='rect', corner=0.4)
        fill_capsule(ly, [(5.6, 8.5), (11.4, 8.5)], 0.9, lambda k, L, s, i, t: lt(hx('#e8ecf4'), 0.1) if L > 0.9 else shade(ramp('#9aa0ac', 0.5, 0.25, 0.4), L))
    layer(cv, handle, dk(m[0], 0.3))
    return cv


# --------------------------------------------------------------------------
# Tiles (32x32, seamless, 1 tile = 1 m). The scene is later darkened and lit by
# the neon pass (coloured lights, wet reflections) and the map adds its own
# large-scale grime, so the tiles stay calm: mid-tones, low local contrast, fine
# isotropic grain and nothing sitting at a fixed spot that would show the 32 px
# repeat. Base painters wrap every coordinate; variants copy the base and only
# touch the inside of a 2 px margin (asserted), fading their changes to zero.
# The floors are painted at FINE density (64 x 64 pixels a tile): T is the tile's size in pixels, U the pixels per
# world px; the painters give positions and sizes in world px (times U) and their grain is pixel-fine. The wall tops
# stay at the world's density (T = 32, U = 1).
# --------------------------------------------------------------------------

T = 32
U = 1
VM = 2   # variant margin (pixels)


def wset(cv, x, y, c):
    cv.p[int(x) % cv.w, int(y) % cv.h] = c


def pal(cols, t):
    """Piecewise blend through a list of colours, t in 0..1."""
    t = max(0.0, min(1.0, t)) * (len(cols) - 1)
    i = min(int(t), len(cols) - 2)
    return mix(cols[i], cols[i + 1], t - i)


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


def tint(c, d, t=None, k=0.0):
    """Brightness offset d, optionally pulled toward colour t by k."""
    c = shift(c, int(round(d)))
    return mix(c, t, k) if t and k > 0 else c


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

FL_ASPHALT = hx('#575a65')
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

FL_SIDEWALK = hx('#94929a')


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

NEON_PINK, NEON_CYAN = hx('#ff2a6d'), hx('#05d9e8')
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
    d_stain(cv, rng, hx('#8a4a22'), 0.25, (1.5, 2.5), -3)


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


# --------------------------------------------------------------------------
# Ragdoll segments (intact, they match each character's palette)
# --------------------------------------------------------------------------

# ---- a body on the floor, part by part (entities/Ragdoll.js), at the WORLD's pixel size, like the furniture and the
# floors he lies on: at the finer density of the standing characters the user found the bodies "too high a
# resolution next to the rest of the assets". The build is that of the people on their feet (Config BODY_SCALE), a
# little narrower: shoulders 17 px, a head of 10, arms 4 thick, legs 5, about 1.5 m from crown to heel (between the
# stubby 1.2 m of the first bodies and a man's real length, which looked like another game). Painted plainly, two
# tones a part and what tells each kind apart, no more: every extra was rejected as clashing with the picture.
def lying(w, h, fn):
    """fn(x, y) -> colour or None for each pixel of a w x h part, then the outline."""
    cv = Cv(w, h)
    for y in range(h):
        for x in range(w):
            c = fn(x, y)
            if c is not None:
                cv.set(x, y, c)
    cv.outline()
    return cv


def torso_edge(y):
    """Half-width of a lying torso at row y (17 x 19, head toward -y): round shoulders, the waist, the hips."""
    if y < 2:
        return 5.0 + 1.3 * y
    if y <= 6:
        return 7.5
    if y <= 14:
        return 7.5 - (y - 6) / 8.0 * 1.2
    return 6.3 + (y - 14) / 3.0 * 0.4


def rag_torso(ch, back=False):
    """The trunk from the collar to the belt, 17 x 19, his front (the design of chest_px) or his back: the flanks in
    shade, the belt, the top of the trousers."""
    k = ch['kind']

    def px(x, y):
        if y < 1 or y > 17:
            return None
        d = abs(x - 8)
        hw = torso_edge(y)
        if d > hw:
            return None
        L = 0.4 if d > hw - 1.4 else 0.66               # the flank turns away
        i = tidx(L)
        u, v = (9 - y) / 9.0 * 6.9, (x - 8) / 7.5 * 5.9
        if y == 17:
            return ch['pants'][i]
        if y == 16:
            return hx('#1a1420') if k != 'heavy' else ch['pants'][max(0, i - 1)]
        if y < 2 and d < 2:
            return ch['skin'][max(1, i)]                 # the neck
        if not back:
            return chest_px(ch, u, v, L, 6.9, 5.9)
        if k == 'brute' and d > hw - 2.3:
            return ch['skin'][i]
        if k in ('thug', 'player') and y < 3 and d < 3:
            return ch['top'][min(3, i + 1)]              # collar
        if k == 'civ':
            return civ_chest_px(ch, u, v, L, 6.9, 5.9)
        if d < 0.5:
            return ch['top'][max(0, i - 1)]              # the seam down the back
        return ch['top'][i]
    return lying(17, 19, px)


def rag_torso_up(ch):
    """The torso of a body lying on its back: his front."""
    return rag_torso(ch)


def rag_torso_down(ch):
    """The torso of a body lying on its belly: his back."""
    return rag_torso(ch, back=True)


def rag_skull(ch, fn, ang):
    cv = Cv(10, 10)
    fill_shape(cv, 5.0, 5.0, 4.2, 4.2, lambda u, v, L: fn(ch, u / 1.13, v / 1.13, L, 3.7), ang=ang, pad=0.05)
    return cv


def rag_head(ch):
    """The head of a body lying face down (10 x 10): the back of the skull, the nape toward the shoulders (+y)."""
    cv = rag_skull(ch, head_top_px, math.pi / 2)
    cv.outline()
    return cv


def rag_head_up(ch):
    """The head of a body lying on its back (10 x 10, crown toward -y): his face, the eyes shut, nothing else."""
    cv = rag_skull(ch, face_px, -math.pi / 2)
    for x in (3, 6):
        cv.set(x, 5, hx('#2a1820'))
    cv.outline()
    return cv


def rag_arm(ch):
    """An arm from the shoulder (-x) to the hand (+x), 17 x 6: the sleeve, the cuff of those who wear one, the hand."""
    k = ch['kind']
    s = ch.get('sleeve') or (ch['skin'] if k == 'brute' else ch['top'])
    cuff = WHITE if k == 'thug' else None
    skin = ch['skin']

    def px(x, y):
        if x < 1 or x > 15 or y < 1 or y > 4:
            return None
        if (x < 2 or x > 14) and (y < 2 or y > 3):
            return None                                  # rounded ends
        i = 2 if y < 3 else 1
        if x >= 13:
            return skin[i]
        if cuff and x == 12:
            return cuff[i]
        if k == 'heavy' and y == 2:
            return WHITE[i]                              # the stripe down the sleeve
        return s[i]
    return lying(17, 6, px)


def rag_leg(ch):
    """A leg from the hip (-x) to the toe (+x), 20 x 7: the trouser leg and the shoe."""
    k = ch['kind']
    p, sh = ch['pants'], ch['shoe']

    def px(x, y):
        if x < 1 or x > 18 or y < 1 or y > 5:
            return None
        if x > 17 and (y < 2 or y > 4):
            return None                                  # the round of the toe
        i = 2 if y < 3 else 1
        if x >= 15:
            return sh[i]
        if k == 'heavy' and y == 3:
            return WHITE[i]
        return p[i]
    return lying(20, 7, px)


def knocked_down(ch):
    """A man knocked out cold, built from the parts of a body on the floor so he is the size of one: on his back, an arm
    thrown out, the other along him, the legs a little apart. 51 x 49, the head toward +x."""
    W, H = 49, 51
    body = Image.new('RGBA', (W, H), CLEAR)

    def limb(cv, rx, ry, deg):
        # the limb's root (its -x end) put on (rx, ry), pointing deg degrees from +x (y down)
        n = cv.w * 2 + 4
        tmp = Image.new('RGBA', (n, n), CLEAR)
        tmp.alpha_composite(cv.img, (n // 2 - 1, n // 2 - cv.h // 2))
        tmp = tmp.rotate(-deg, resample=Image.NEAREST)
        body.alpha_composite(tmp, (int(rx - n // 2), int(ry - n // 2)))
    leg, arm = rag_leg(ch), rag_arm(ch)
    if ch['kind'] == 'player':
        body.alpha_composite(rag_skirt(ch).img, (24 - RAG_SKIRT_W // 2, 27))   # his coat spread under him
    limb(leg, 20, 28, 98)
    limb(leg, 28, 28, 80)
    limb(arm, 18, 15, 114)
    limb(arm, 31, 15, 18)
    body.alpha_composite(rag_torso_up(ch).img, (16, 10))
    body.alpha_composite(rag_head_up(dict(ch, worn=True)).img, (19, 1))   # (what he wears on his face is still on)
    out = Cv(H, W)
    out.img = body.rotate(-90, resample=Image.NEAREST, expand=True)
    out.p = out.img.load()
    return out


# --------------------------------------------------------------------------
# Magazines, shell boxes and ammo pickups (+x = bullet tips)
# --------------------------------------------------------------------------

def mags():
    out = {}
    # (the guns' magazines are painted with the guns, weapons())
    red = ramp('#e8303a', 0.5, 0.25, 0.3)
    out['shells_box'] = ascii_cv(["OAAAAAAO",
                                  "AbBbBbBR",
                                  "ABbBbBbR",
                                  "AyyyyyyR",
                                  "ArrrrrrR",
                                  "ORRRRRRO"], {'O': OUTLINE, 'A': red[3], 'r': red[2], 'R': red[0], 'b': BRASS[2],
                                                'B': BRASS[3], 'y': hx('#f9c80e')}, ol=None)
    # floor pickups: bright boxes with a label stripe
    yel = ramp('#f9c80e', 0.5, 0.25, 0.45)
    out['ammo_9mm'] = ascii_cv([".........",
                                ".c.c.c.c.",
                                ".AAAAAAA.",
                                ".yyyyyyy.",
                                ".KKKKKKK.",
                                ".DDDDDDD.",
                                "........."], {'A': yel[3], 'y': yel[2], 'D': yel[0], 'K': hx('#1a1020'),
                                               'c': hx('#e07a3a')})
    out['ammo_12g'] = ascii_cv([".........",
                                ".BAAAAAa.",
                                ".brrrrrR.",
                                ".wwwwwww.",
                                ".BAAAAAa.",
                                ".brrrrrR.",
                                "........."], {'A': red[3], 'a': red[2], 'r': red[2], 'R': red[0], 'B': BRASS[3],
                                               'b': BRASS[1], 'w': hx('#f4f0ff')})
    grn = ramp('#3ad06a', 0.5, 0.25, 0.4)
    out['ammo_762'] = ascii_cv([".........",
                                "...KKK...",
                                ".AAAAAAA.",
                                ".gggggGd.",
                                ".yyyyyyd.",
                                ".DDDDDDD.",
                                "........."], {'A': grn[3], 'g': grn[2], 'G': grn[1], 'd': grn[1], 'D': grn[0],
                                               'y': hx('#f9c80e'), 'K': hx('#2a2a34')})
    ol_ = ramp('#7a8a3a', 0.5, 0.25, 0.4)
    out['ammo_rocket'] = ascii_cv(["............",
                                   ".Kk......r..",
                                   ".KAAAAyAArRr",
                                   ".KgggggyggRR",
                                   ".Kk......R..",
                                   "............"], {'A': ol_[3], 'g': ol_[1], 'y': hx('#ff6b1a'), 'r': hx('#ff5a4a'),
                                                     'R': hx('#c8202a'), 'K': hx('#2a2430'), 'k': hx('#4a4458')})
    return out


# --------------------------------------------------------------------------
# Vehicles (top-down, facing +x, real size at 1 m = 32 px): sedan 4.4 x 1.8 m (140 x 58), coupe 4.2 x 1.75 m
# (134 x 56), panel van 5.0 x 2.0 m (160 x 64). Only the mirrors use the outer 2 px on each side: the game's
# hitbox is the sprite minus 2 px all round. Glass, tank, hood, wheel and light positions are a contract with
# VEHICLES (src/game/entities/Vehicle.js) and LIGHTING.propLights (src/game/Config.js): keep them in sync.
# Tyres are drawn by the game under the body. Details are mirrored about the centre line.
# --------------------------------------------------------------------------

GLASS = [hx('#0a0e1a'), hx('#121a2e'), hx('#1c2944'), hx('#2a3c5e')]
CHROME = [hx('#3a3848'), hx('#77768c'), hx('#b8b8c8'), hx('#eeeef8')]
RUBBER = [hx('#141218'), hx('#211e28'), hx('#2e2a36'), hx('#45404f')]
ROAD_DIRT = hx('#5e4c3a')
RUST = [hx('#4a2416'), hx('#7a3a1c'), hx('#a0582a')]
PLATE = hx('#d8d2b8')
AMBER = hx('#ffaa2a')
SHEEN, NEON_SHEEN = hx('#8fd0ea'), hx('#ff7ab4')
HEAD_C, HEAD_GLOW = hx('#fff4d6'), (255, 240, 205, 255)
TAIL_C, TAIL_GLOW = hx('#ff2a3a'), (255, 36, 48, 255)
SEDAN_BODY = ramp('#ff2a6d', 0.55, 0.3, 0.4)
COUPE_BODY = ramp('#e8ecf4', 0.5, 0.24, 0.25)
VAN_BODY = ramp('#e2d2b0', 0.5, 0.26, 0.3)


def soft(r, L):
    """Continuous blend through a 4-tone ramp: big panels get soft gradients instead of bands."""
    return pal(r, (L - 0.12) / 0.8)


def darken(t):
    return lambda c, side: dk(c, t)


def ridge(t):
    """A crease catches the light on the top side and is shadowed on the bottom side."""
    return lambda c, side: lt(c, t) if side < 0 else dk(c, t)


class Veh:
    """One vehicle sprite + glow map at FINE density. The layout is given in world px (the 1 m = 32 px grid of the
    VEHICLES contract): an integer x or y names a world px, as on a plain sprite, and every primitive paints the pixels
    it covers. Rows are given on the top side (y < cy) and mirrored about the centre line."""

    def __init__(self, w, h, cy, seed):
        s = self.s = FINE
        self.cv, self.gl = Cv(w, h, s), Cv(w, h, s)
        self.cy = cy
        self.rng = random.Random(seed)
        self.mask, self.glass, self.half = set(), set(), {}

    # pixel <-> world: X, Y are the world px a pixel lies in, as a continuous value (pixel centre - 0.5)
    def X(self, i):
        return (i + 0.5) / self.s - 0.5

    def vj(self, j):
        """Signed distance of pixel row j from the centre line (world px)."""
        return (j + 0.5) / self.s - self.cy

    def mj(self, j):
        return 2 * self.cy * self.s - 1 - j

    def cols(self, x0, x1):
        return range(int(round(x0 * self.s)), int(round((x1 + 1) * self.s)))

    def top_rows(self, i, v0, v1):
        """Top-side pixel rows of column i whose |v| lies in (v0, v1]."""
        return [j for j in range(self.cy * self.s) if v0 < -self.vj(j) <= v1]

    def setp(self, i, j, c, both=True):
        """c: colour or fn(current, side) with side -1 on the top half, +1 on the bottom half."""
        for jj in ((j, self.mj(j)) if both else (j,)):
            if not self.cv.pok(i, jj):
                continue
            col = c(self.cv.p[i, jj], -1 if jj < self.cy * self.s else 1) if callable(c) else c
            if col is not None:
                self.cv.p[i, jj] = col

    def put(self, x, y, c, both=True):
        """A whole world px (and its mirror)."""
        s = self.s
        for j in range(int(y * s), int(y * s) + s):
            for i in range(int(x * s), int(x * s) + s):
                self.setp(i, j, c, both)

    def dot(self, x, y, c, both=True):
        """The single pixel under the world point (x, y)."""
        self.setp(int(math.floor(x * self.s)), int(math.floor(y * self.s)), c, both)

    def line(self, x0, y0, x1, y1, c, both=True, w=1):
        """A line w pixels wide through the middles of the world px (x0, y0) and (x1, y1)."""
        s = self.s
        a, b, e, f = (x0 + 0.5) * s, (y0 + 0.5) * s, (x1 + 0.5) * s, (y1 + 0.5) * s
        n = int(max(abs(e - a), abs(f - b))) + 1
        seen = set()
        for k in range(n + 1):
            px, py = a + (e - a) * k / n - 0.5, b + (f - b) * k / n - 0.5
            for d in range(w):
                p = (int(round(px)) + (d if abs(f - b) > abs(e - a) else 0), int(round(py)) + (0 if abs(f - b) > abs(e - a) else d))
                if p not in seen:
                    seen.add(p)
                    self.setp(p[0], p[1], c, both)

    def shell(self, body, x0, x1, hw, cr_rear, cr_front, nose=0, pinch=0.0, crown=3.0):
        """Body shell: rounded box (pinched toward the nose for a wedge), domed across, rolled at both ends."""
        for i in self.cols(x0, x1):
            x = self.X(i)
            u_r, u_f = x - x0, x1 - x
            h = hw - (pinch * ((x - (x1 - nose)) / nose) ** 2 if nose and x > x1 - nose else 0.0)
            self.half[i] = h
            cr = cr_rear if u_r < u_f else cr_front
            for j in range(self.cv.ph):
                v = self.vj(j)
                ex, ey = cr - min(u_r, u_f) - 0.5, abs(v) - (h - cr)
                if abs(v) > h or (ex > 0 and ey > 0 and ex * ex + ey * ey > cr * cr):
                    continue
                end = max(0.0, 1.0 - min(u_r, u_f) / 9.0) ** 1.5
                L = light((-end if u_r < u_f else end) * 0.8, math.copysign((abs(v) / h) ** crown, v) * 0.95) - v / h * 0.1
                self.cv.p[i, j] = soft(body, L)
                self.mask.add((i, j))

    def hw(self, x):
        """Half width of the shell at world x."""
        return self.half.get(int(round((x + 0.5) * self.s - 0.5)), 0.0)

    def panel(self, body, x0, x1, hw, r=3, crown=2.5, lift=0.0, rail=True):
        """Raised flat panel (roof): its own gentle dome, rounded corners, a lit drip rail along its edge."""
        for i in self.cols(x0, x1):
            x = self.X(i)
            for j in self.top_rows(i, -1, hw):
                ex, ey = r - min(x - x0, x1 - x) - 0.5, -self.vj(j) - (hw - r)
                if ex > 0 and ey > 0 and ex * ex + ey * ey > r * r:
                    continue
                for jj in (j, self.mj(j)):
                    v = self.vj(jj)
                    nv = math.copysign((abs(v) / hw) ** crown, v) * 0.7
                    c = soft(body, light(0.0, nv) + lift)
                    if rail and hw - abs(v) < 0.55:
                        c = lt(c, 0.18) if v < 0 else dk(c, 0.2)
                    self.cv.p[i, jj] = c

    def glass_col(self, x, y, x0, x1, h, sheen):
        """x, y: world (continuous); y is a pixel row's centre."""
        t = (y - self.cy + h) / (2 * h)
        c = pal(GLASS, 0.8 - t * 0.65 + (x - x0) / max(1, x1 - x0) * 0.1)
        if sheen is not None:   # one soft diagonal reflection (and a faint neon one)
            s = (x - x0) + (y - self.cy + h) * 0.6 - sheen
            if 0 <= s < 2.5:
                c = mix(c, SHEEN, 0.3 if s > 0.5 else 0.45)
            elif -1 <= s < 0 or 2.5 <= s < 3.5:
                c = mix(c, SHEEN, 0.12)
            elif 7 <= s < 8:
                c = mix(c, NEON_SHEEN, 0.14)
        return c

    def trap(self, x0, x1, hw0, hw1, sheen=None):
        """Windshield / rear window: trapezoid of glass, half width hw0 at x0 to hw1 at x1."""
        for i in self.cols(x0, x1):
            x = self.X(i)
            h = hw0 + (hw1 - hw0) * (x - x0) / max(1, x1 - x0)
            for j in self.top_rows(i, -1, h):
                for jj in (j, self.mj(j)):
                    self.cv.p[i, jj] = self.glass_col(x, (jj + 0.5) / self.s, x0, x1, h, sheen)
                    self.glass.add((i, jj))

    def side(self, x0, x1, inner, outer, pillars=()):
        """Side windows seen at a grazing angle between the roof (inner(x)) and the beltline (outer)."""
        for i in self.cols(x0, x1):
            x = self.X(i)
            if int(round(x)) in pillars:
                continue
            for j in self.top_rows(i, inner(x), outer):
                k = (-self.vj(j) - inner(x)) / max(0.5, outer - inner(x))
                self.cv.p[i, j] = pal(GLASS, 0.75 - k * 0.35)
                self.cv.p[i, self.mj(j)] = pal(GLASS, 0.3 - k * 0.25)
                self.glass |= {(i, j), (i, self.mj(j))}
        i = int((x0 + 3.5) * self.s)
        rows = self.top_rows(i, inner(x0 + 3), outer)
        for d in range(4):
            if rows:
                self.setp(i + d, rows[-1], lambda c, s: mix(c, SHEEN, 0.35 if s < 0 else 0.1))

    def inside(self, x0, y0, x1, y1, col, k=0.35, round_=False):
        """What is seen through the glass (seats, the dashboard, a thing left on it): the world rect x0..x1, y0..y1
        (any fraction of a px; an ellipse in it with round_), blended into the glass's pixels only, dim: it is night
        in there. Not mirrored."""
        s = self.s
        mx, my, rx, ry = (x0 + x1) / 2, (y0 + y1) / 2, (x1 - x0) / 2, (y1 - y0) / 2
        for j in range(int(y0 * s), int(math.ceil(y1 * s))):
            for i in range(int(x0 * s), int(math.ceil(x1 * s))):
                if (i, j) not in self.glass:
                    continue
                if round_ and (((i + 0.5) / s - mx) / rx) ** 2 + (((j + 0.5) / s - my) / ry) ** 2 > 1.0:
                    continue
                self.cv.p[i, j] = mix(self.cv.p[i, j], col, k)

    def wheel(self, x, y, r, col=None, k=0.4):
        """The steering wheel through the windshield: its rim and a spoke."""
        s, col = self.s, col or hx('#5c5864')
        for j in range(int((y - r - 1) * s), int((y + r + 1) * s)):
            for i in range(int((x - r - 1) * s), int((x + r + 1) * s)):
                d = math.hypot((i + 0.5) / s - x, (j + 0.5) / s - y)
                spoke = d < r and abs((j + 0.5) / s - y) < 0.3
                if (i, j) in self.glass and (abs(d - r) < 0.45 or spoke):
                    self.cv.p[i, j] = mix(self.cv.p[i, j], col, k)

    def film(self, x0, x1, pivots, r, k=0.11):
        """A windshield nobody washed: a film of road dust on the glass between x0 and x1, wiped clean in the arcs the
        blades sweep (pivots: their (x, y) feet, r: the blade's reach), a line of dirt pushed up at the end of each."""
        s = self.s
        for (i, j) in sorted(self.glass):
            x, y = (i + 0.5) / s, (j + 0.5) / s
            if not x0 <= x <= x1 + 1:
                continue
            d = min(math.hypot(x - px, y - py) for (px, py) in pivots)
            if d > r + 0.5:
                self.cv.p[i, j] = mix(self.cv.p[i, j], ROAD_DIRT, k * (0.6 + 0.8 * self.rng.random()))
            elif d > r - 0.5:
                self.cv.p[i, j] = mix(self.cv.p[i, j], ROAD_DIRT, k * 1.6)

    def dent(self, x, y, r):
        """A shallow dent in a panel: its upper left wall in shade, its lower right catching the light. Top side only."""
        s = self.s
        for j in range(int((y - r) * s), int((y + r) * s) + 1):
            for i in range(int((x - r) * s), int((x + r) * s) + 1):
                u, v = ((i + 0.5) / s - x) / r, ((j + 0.5) / s - y) / r
                d = math.hypot(u, v)
                if d >= 1.0 or (i, j) not in self.mask or (i, j) in self.glass:
                    continue
                t = (u + v) * 0.7 * (1.0 - d * d)
                self.cv.p[i, j] = lt(self.cv.p[i, j], 0.3 * t) if t > 0 else dk(self.cv.p[i, j], -0.4 * t)

    def seal(self):
        """Rubber seals: body pixels touching glass get darker."""
        edge = {(x + a, y + b) for (x, y) in self.glass for a, b in ((1, 0), (-1, 0), (0, 1), (0, -1))}
        for p in sorted(edge - self.glass):
            if p in self.mask:
                self.cv.p[p] = dk(self.cv.p[p], 0.42)

    def arches(self, wheels, r=11):
        """Fender lips over the wheels: a lit crest and the flare falling away into shadow."""
        for wx in wheels:
            for i in self.cols(wx - r, wx + r):
                x = self.X(i)
                crest = self.half.get(i, 0) - 3.5 + 2.2 * ((x - wx) / r) ** 2
                for j in self.top_rows(i, crest, 99):
                    if (i, j) in self.mask and (i, j) not in self.glass:
                        self.setp(i, j, darken(0.2) if -self.vj(j) > crest + 0.5 else ridge(0.14))

    def grime(self, wheels, amount=1.0, rust=6, scratches=3):
        """Road film on the sills and around the arches, a few rust specks and scratches."""
        n = VNoise(self.cv.w, self.cv.h, 7, self.rng)
        for (i, j) in sorted(self.mask - self.glass):
            x, v = self.X(i), abs(self.vj(j))
            hw = self.half[i]
            k = max(0.0, (v - (hw - 6)) / 6.0) * 0.4
            for wx in wheels:
                k += max(0.0, 1.0 - math.hypot((x - wx) / 1.5, hw - v) / 10.0) * 0.32
            k *= amount * (0.3 + 1.3 * n(x, (j + 0.5) / self.s))
            if k > 0.03:
                self.cv.p[i, j] = mix(self.cv.p[i, j], ROAD_DIRT, min(0.5, k))
        for _ in range(rust):
            x = self.rng.choice(wheels) + self.rng.uniform(-13, 13)
            y = self.cy - self.hw(x) + self.rng.uniform(0.3, 2.5)
            if self.rng.random() < 0.5:
                y = 2 * self.cy - y
            for k in range(self.rng.randint(2, 6)):
                p = (int(x * self.s) + self.rng.randint(-1, 1) * (k > 0), int(y * self.s) + self.rng.randint(-1, 1) * (k > 0))
                if p in self.mask:
                    self.cv.p[p] = mix(self.cv.p[p], RUST[self.rng.randint(0, 2)], 0.7)
        for _ in range(scratches):
            x = self.rng.uniform(20, self.cv.w - 30)
            y = self.cy - self.hw(x) + self.rng.uniform(1.5, 4)
            ln = self.rng.uniform(3, 8)
            a = self.rng.uniform(-0.15, 0.15)
            for k in range(int(ln * self.s)):
                p = (int(x * self.s) + k, int((y + math.sin(a) * k / self.s) * self.s))
                if p in self.mask:
                    self.cv.p[p] = lt(self.cv.p[p], 0.22)

    def gloss(self, x0, x1, k=0.12):
        """The paint's gloss: a soft band of the night sky's light sliding diagonally over the panels from x0 to x1,
        a harder line along its middle."""
        for (i, j) in sorted(self.mask - self.glass):
            x, v = self.X(i), self.vj(j)
            if not x0 <= x <= x1 or v > 0:
                continue
            d = abs((x - x0) / max(1, x1 - x0) - 0.5 + (v / 30.0) * 0.6)
            if d < 0.12:
                self.cv.p[i, j] = lt(self.cv.p[i, j], k * (1.0 - d / 0.12) + (0.06 if d < 0.012 else 0.0))

    def rim(self):
        """Lower edge a touch darker, upper edge catching the light."""
        for (i, j) in sorted(self.mask):
            if (i, j + 1) not in self.mask:
                self.cv.p[i, j] = dk(self.cv.p[i, j], 0.25)
            elif (i, j - 1) not in self.mask:
                self.cv.p[i, j] = lt(self.cv.p[i, j], 0.14)

    def lamp(self, x0, x1, y0, y1, col, glow, frame, back=None):
        """Light cluster (mirrored): framed lens with its reflector's rings, brighter top row; the lens goes into the
        glow map. back: the framed (inner) column, x0 by default (front lights)."""
        s = self.s
        bx = x0 if back is None else back
        cx, cy = (x0 + x1 + 1) / 2, (y0 + y1 + 1) / 2
        for j in range(y0 * s, (y1 + 1) * s):
            for i in range(x0 * s, (x1 + 1) * s):
                edge = j in (y0 * s, (y1 + 1) * s - 1) or i // s == bx and (i % s == (0 if back is None else s - 1))
                if edge:
                    c = frame
                else:
                    d = math.hypot((i + 0.5) / s - cx, ((j + 0.5) / s - cy) * 0.8)
                    c = lt(col, 0.5) if j < y0 * s + s else (col if int(d * 2.2) % 2 else lt(col, 0.18))
                self.setp(i, j, c)
                if not edge:
                    self.gl.p[i, j] = glow
                    self.gl.p[i, self.mj(j)] = glow

    def bumper(self, x0, x1, tones, strip=None):
        """Bumper across the whole end, lit from the top; a rubber strip along it (strip: its column)."""
        for i in self.cols(x0, x1):
            for j in range(self.cv.ph):
                if (i, j) in self.mask:
                    t = 0.95 - (j / self.cv.ph) * 0.75 - (0.15 if i in (x0 * self.s, (x1 + 1) * self.s - 1) and x0 != x1 else 0)
                    c = pal(tones, t)
                    if strip is not None and i == int(strip * self.s):
                        c = RUBBER[1]
                    self.cv.p[i, j] = c

    def mirror(self, x0, x1, tones, glass_end):
        """Door mirror on its arm, sticking out past the body: the arm, the housing lit on top, its glass facing
        back."""
        top = min(j for (i, j) in self.mask if x0 * self.s <= i < (x1 + 1) * self.s)
        s = self.s
        for i in range(x0 * s, (x1 + 1) * s):
            for d in (1, 2):
                if i // s == glass_end and d == 1:
                    c = GLASS[2] if i % s else GLASS[1]
                else:
                    c = tones[3] if d == 2 and i // s > x0 else tones[2] if d == 1 else tones[1]
                if i // s == x0:
                    c = dk(tones[1], 0.2) if d == 1 else None    # the arm is thin
                if c is not None:
                    self.setp(i, top - d, c)

    def done(self):
        self.cv.outline()
        return self.cv, self.gl


def p_car(body=SEDAN_BODY, stripe=None, keep=None):
    """80s four-door sedan, 4.4 x 1.8 m: boxy, chrome bumpers, quad headlights, thick C pillars. stripe: a colour run
    down its middle from the trunk to the nose over the panels, under the glass (the pursuers' car, p_pursuer).
    keep: a list the painter's Veh is appended to (its mask and glass: the cruiser and the burnt-out car are this
    sedan repainted)."""
    k = Veh(140, 58, 29, 4401)
    wheels = (30, 112)
    k.shell(body, 1, 138, 26.5, 5, 6, crown=2.2)
    k.arches(wheels)
    k.trap(34, 45, 19.5, 17.5, sheen=2)                      # rear window
    k.trap(81, 97, 17.5, 21.5, sheen=4)                      # windshield
    # through the glass, dim: the front seats' backs and the wheel (the driver's on the left), the dashboard and a pack
    # of cigarettes left on it; behind, the rear seat's back, the parcel shelf and a box of tissues on it
    for y in (15.0, 33.0):
        k.inside(81.0, y, 84.0, y + 10.0, hx('#8a6a4a'), 0.3)
    k.wheel(88.5, 19.5, 3.2)
    k.inside(92.5, 9.0, 98.0, 49.0, hx('#5a4c40'), 0.42)
    k.inside(94.0, 37.5, 96.0, 39.0, hx('#e8e0d0'), 0.6)
    k.inside(41.0, 11.0, 46.0, 47.0, hx('#8a6a4a'), 0.28)
    k.inside(34.0, 10.0, 39.0, 48.0, hx('#4a4038'), 0.4)
    k.inside(35.0, 24.5, 38.0, 27.0, hx('#9ab8d8'), 0.6)
    k.film(81, 97, ((97.5, 26.5), (97.5, 45.5)), 12.5)
    k.dent(19.5, 12.5, 2.8)                                  # somebody backed into the trunk's corner
    k.panel(body, 46, 80, 18.5)                              # roof
    if stripe:
        center_stripe(k, 4, 136, stripe)
    k.side(47, 85, lambda x: 18.5 if x <= 80 else 19.0 + (x - 81) / 4, 22.0, pillars=(64, 65))
    k.line(42, 6, 90, 6, lambda c, s: mix(c, CHROME[3 if s < 0 else 1], 0.6))   # beltline trim
    k.line(42, 6, 90, 6, lambda c, s: mix(c, CHROME[1], 0.4), w=1)
    for x in (40, 65, 90):                                   # door seams
        k.line(x, 2, x, 5, darken(0.45))
    for x in (45, 69):                                       # door handles: chrome, the key under
        k.line(x, 4, x + 2, 4, lambda c, s: CHROME[3 if s < 0 else 2], w=2)
        k.dot(x + 2.8, 4.8, RUBBER[0])
    k.line(6, 8, 6, 28, darken(0.4))                         # trunk lid
    k.line(6, 8, 33, 8, darken(0.4))
    k.line(9, 28, 10, 28, CHROME[2], w=2)                    # trunk lock
    k.line(98, 8, 98, 28, darken(0.45))                      # cowl gap
    for x in range(100, 106, 2):                             # the cowl's air vent slots
        k.line(x, 23, x, 27, darken(0.15))
    k.line(98, 8, 133, 8, darken(0.4))                       # hood shut lines
    k.line(101, 20, 130, 20, ridge(0.18))                    # hood creases
    k.line(9, 20, 30, 20, ridge(0.15))                       # trunk lid crease
    k.put(131, 28, CHROME[3])                                # hood ornament
    k.dot(131.5, 28.0, hx('#ffffff'))
    for (y0, y1, side) in ((26, 14, False), (45, 33, False)):   # parked wipers: the chrome arm, the black blade
        k.line(97, y0, 96, y1, CHROME[1], both=False)
        k.line(96, y0 - 1, 95, y1 + 1, RUBBER[0], both=False)
    k.line(90, 28, 91, 28, RUBBER[1], both=False)            # the rear-view mirror behind the windshield
    k.line(90, 29, 91, 29, RUBBER[1], both=False)
    k.line(24, 3, 27, 3, darken(0.3), both=False)            # fuel filler flap
    k.line(24, 4, 27, 4, darken(0.15), both=False)
    k.dot(25.5, 3.5, CHROME[2], both=False)
    k.put(20, 53, RUBBER[0], both=False)                     # antenna base, the mast lying back
    k.line(20, 53, 9, 54, CHROME[2], both=False)
    k.grime(wheels)
    k.seal()
    k.gloss(98, 134)
    k.gloss(46, 80, 0.09)
    k.gloss(6, 33, 0.08)
    k.rim()
    k.bumper(137, 138, CHROME, strip=137.5)
    k.bumper(1, 2, CHROME, strip=1.5)
    for x in (137, 138):                                     # rubber bumper guards
        k.line(x, 13, x, 15, RUBBER[1 if x == 137 else 0])
    for y in range(20, 29):                                  # grille: chrome frame, black slats
        for x in range(134, 137):
            k.put(x, y, CHROME[1] if y == 20 or x == 134 else RUBBER[0])
    for j in range(21 * k.s, 29 * k.s):
        for i in range(135 * k.s, 137 * k.s):
            k.setp(i, j, CHROME[2] if j % 3 == 0 else RUBBER[0] if j % 3 == 1 else RUBBER[2])
    k.lamp(134, 136, 8, 13, HEAD_C, HEAD_GLOW, CHROME[2])     # quad headlights
    k.lamp(134, 136, 13, 18, HEAD_C, HEAD_GLOW, CHROME[2])
    k.line(135, 5, 136, 5, AMBER, w=2)
    k.line(135, 6, 136, 6, dk(AMBER, 0.2), w=2)
    k.lamp(3, 5, 5, 17, TAIL_C, TAIL_GLOW, hx('#7a0818'), back=5)      # wide tail lights
    k.line(4, 18, 5, 18, hx('#e8e4dc'), w=2)                  # reverse lights
    plate(k, 3, 23, 28)
    k.mirror(86, 90, body, 90)
    if keep is not None:
        keep.append(k)
    return k.done()


def center_stripe(k, x0, x1, col):
    """One stripe 2 world px wide down the centre line from x0 to x1, over the panels only (the glass stays clear),
    the paint's shading kept through it."""
    for i in k.cols(x0, x1):
        for j in range(28 * k.s, 30 * k.s):
            if (i, j) in k.mask and (i, j) not in k.glass:
                k.cv.p[i, j] = mix(k.cv.p[i, j], col, 0.82)


# the pursuers' sedan: black, one pink stripe (docs/LEVEL2.md: the only black cars on the road). Its black leans warm
# (red over blue) so that Vehicle.js never takes a pixel of it for glass
PURSUER_BODY = ramp('#1e1a1f', 0.5, 0.25, 0.3)
PURSUER_STRIPE = hx('#ff2a6d')


def p_pursuer():
    """The boss's men's sedan: the 80s four-door in black with a single pink stripe down its length."""
    return p_car(PURSUER_BODY, PURSUER_STRIPE)


def p_car2():
    """80s sports coupe, 4.2 x 1.75 m: low wedge, pop-up headlights, T-top, fastback hatch, rear wing."""
    k = Veh(134, 56, 28, 4202)
    body = COUPE_BODY
    teal, purp = NEON_CYAN, hx('#7a1fa2')
    wheels = (28, 106)
    k.shell(body, 1, 132, 25.5, 4, 5, nose=30, pinch=3.0, crown=2.6)
    k.arches(wheels, r=10)
    for x in list(range(5, 22)) + list(range(100, 128)):     # twin racing stripes
        k.put(x, 23, teal)
        k.put(x, 24, dk(teal, 0.25))
    for j in (23 * k.s, 25 * k.s - 1):
        for i in list(range(5 * k.s, 22 * k.s)) + list(range(100 * k.s, 128 * k.s)):
            k.setp(i, j, lambda c, s: lt(c, 0.25) if j == 23 * k.s and s < 0 else dk(c, 0.15))
    k.line(6, 4, 125, 4, lambda c, s: purp if s < 0 else dk(purp, 0.25), w=2)   # side stripe
    k.trap(22, 49, 14.5, 17.5, sheen=6)                      # fastback hatch glass
    for x in range(26, 48, 3):                               # its heater wires
        k.line(x, 13, x, 13, lambda c, s: dk(c, 0.25), both=True)
    k.trap(78, 98, 17.0, 21.0, sheen=5)                      # raked windshield
    # through the glass: the two buckets' backs, the wheel, a black dash with the radar detector's box on it; under the
    # hatch, the luggage deck and a sports bag thrown on it
    for y in (15.0, 31.0):
        k.inside(78.0, y, 81.5, y + 10.0, hx('#7a2434'), 0.3)
    k.wheel(86.5, 19.5, 3.0)
    k.inside(91.0, 8.0, 99.0, 48.0, hx('#3c3a46'), 0.45)
    k.inside(93.0, 26.5, 95.0, 29.0, hx('#8a8e9c'), 0.5)
    k.inside(22.0, 12.0, 44.0, 44.0, hx('#3a3640'), 0.3)
    k.inside(30.0, 28.5, 40.0, 35.5, hx('#8a2a2a'), 0.42, round_=True)
    k.inside(33.0, 31.5, 37.0, 32.5, hx('#d8d4c8'), 0.4)
    k.film(78, 98, ((98.5, 26.5),), 13.5, 0.07)
    k.panel(body, 50, 77, 17.5)                              # roof
    for i in range(53 * k.s, 75 * k.s):                      # T-top: smoked panels around the centre bar
        for j in range(13 * k.s, 25 * k.s):
            x, y = (i + 0.5) / k.s, (j + 0.5) / k.s
            c = pal(GLASS, 0.75 - (y - 13) / 12 * 0.45)
            if 9 <= (x - 53) + (y - 13) * 0.6 < 11.5:
                c = mix(c, SHEEN, 0.28)
            frame = i < 53 * k.s + 2 or i >= 75 * k.s - 2 or j < 13 * k.s + 2 or j >= 25 * k.s - 2
            k.setp(i, j, RUBBER[2] if frame else (lambda cur, sd, c=c: c if sd < 0 else dk(c, 0.15)))
    k.side(51, 85, lambda x: 17.5 if x <= 77 else 18.5 + (x - 78) / 5, 20.5, pillars=(62,))
    for x in (55, 93):                                       # long doors
        k.line(x, 2, x, 6, darken(0.45))
    k.line(58, 5, 60, 5, RUBBER[1], w=2)                     # flush handles
    k.line(99, 8, 99, 27, darken(0.45))                      # cowl gap
    k.line(99, 8, 126, 8, darken(0.4))
    for i, x in enumerate(range(104, 111)):                  # NACA ducts
        k.put(x, 13, RUBBER[0])
        if i > 3:
            k.put(x, 14, RUBBER[1])
    for x in range(112, 123):                                # pop-up headlight pods (raised)
        for y in range(9, 17):
            edge = x in (112, 122) or y in (9, 16)
            k.put(x, y, dk(body[1], 0.3) if edge else body[3] if y < 12 else body[2])
    k.line(123, 10, 123, 17, darken(0.3))                    # their shadow
    k.line(113, 17, 123, 17, darken(0.3))
    k.line(98, 26, 97, 13, CHROME[1], both=False)            # single wiper
    k.line(97, 25, 96, 14, RUBBER[0], both=False)
    k.line(24, 2, 26, 2, darken(0.3), both=False)            # filler flap
    k.grime(wheels, amount=0.8, rust=3, scratches=2)
    k.seal()
    k.gloss(99, 128)
    k.gloss(13, 22, 0.08)
    k.rim()
    for x in range(6, 12):                                   # rear wing on its endplates
        for y in range(3, 28):
            if y < 5:
                c = RUBBER[0]
            else:
                c = RUBBER[3] if x == 7 else RUBBER[2] if x < 10 else RUBBER[1] if x < 11 else RUBBER[0]
            if x > 6 or y < 5:
                k.put(x, y, c)
    k.line(8, 5, 8, 27, lambda c, s: lt(c, 0.3))             # the wing's lit leading edge
    k.line(12, 5, 12, 27, darken(0.35))
    k.bumper(1, 1, RUBBER)
    k.bumper(130, 132, RUBBER)
    for y in range(5, 28):                                   # full-width tail light bar, plate in the middle
        for x in (2, 3, 4):
            if y > 23 and x < 4:
                continue
            lens = x > 2 and y > 5 and y % 3
            k.put(x, y, TAIL_C if lens else hx('#3a0818'))
            if lens and y < 24:
                for j in range(y * k.s, y * k.s + k.s):
                    for i in range(x * k.s, x * k.s + k.s):
                        k.gl.p[i, j] = TAIL_GLOW
                        k.gl.p[i, k.mj(j)] = TAIL_GLOW
    plate(k, 2, 24, 27)
    k.lamp(120, 122, 10, 15, HEAD_C, HEAD_GLOW, RUBBER[1])   # pop-ups, up
    k.line(128, 24, 128, 27, RUBBER[0])                      # air intake
    k.line(129, 24, 129, 27, RUBBER[1])
    k.line(128, 6, 129, 6, AMBER, w=2)
    k.line(128, 7, 128, 8, dk(AMBER, 0.2), w=2)
    k.mirror(84, 88, body, 88)
    return k.done()


def p_van():
    """80s panel van, 5.0 x 2.0 m: long ribbed box roof, short hood, black bumpers, sliding side door."""
    k = Veh(160, 64, 32, 5003)
    body = VAN_BODY
    sunset = [hx('#f9c80e'), hx('#ff6b1a'), hx('#ff2a6d'), hx('#7a1fa2')]
    wheels = (38, 140)
    k.shell(body, 1, 158, 29.5, 3, 8, crown=3.0)
    k.arches(wheels, r=12)
    k.panel(body, 7, 122, 24.5, r=2, crown=4.0, lift=0.04)  # box roof
    for x in range(20, 120, 14):                             # roof ribs
        k.line(x, 8, x, 31, lambda c, s: lt(c, 0.12), w=2)
        k.line(x + 1, 8, x + 1, 31, darken(0.14))
    k.line(7, 7, 122, 7, darken(0.22))                       # drip rail
    for i, col in enumerate(sunset):                         # sunset side stripes
        k.line(8, 3 + i, 106 - i * 3, 3 + i, lambda c, s, col=col: col if s < 0 else dk(col, 0.2), w=2)
    k.trap(123, 137, 23.0, 26.5, sheen=3)                    # windshield
    # through it: the two seats' backs, the big flat wheel, the dash: a paper cup, a road map unfolded, a rag
    for y in (11.0, 39.0):
        k.inside(123.0, y, 126.0, y + 14.0, hx('#6a5a4a'), 0.3)
    k.wheel(130.5, 19.0, 4.2)
    k.inside(132.5, 7.0, 138.0, 57.0, hx('#4a443c'), 0.42)
    k.inside(134.0, 30.5, 136.0, 32.5, hx('#e8e0d0'), 0.6, round_=True)
    k.inside(133.5, 40.0, 136.5, 46.0, hx('#cfc6a4'), 0.5)
    k.inside(134.0, 12.0, 136.0, 15.0, hx('#8a3a30'), 0.4)
    k.film(123, 137, ((137.5, 30.5), (137.5, 50.5)), 17.5, 0.13)
    k.side(111, 126, lambda x: 24.5 if x <= 122 else 24.5 + (x - 122) / 4, 27.0)
    for x in range(54, 67):                                  # smoked roof vent
        for y in range(25, 32):
            frame = x in (54, 66) or y == 25
            k.put(x, y, (CHROME[1] if y == 25 or x == 54 else RUBBER[1]) if frame
                  else k.glass_col(x + 0.5, y + 0.5, 54, 66, 7, sheen=3))
    for x in range(10, 39):                                  # roof rack: rails and rungs
        k.put(x, 15, CHROME[2] if x % 13 else CHROME[3])
        k.put(x, 16, darken(0.3))
    k.line(10, 15, 38, 15, lambda c, s: lt(c, 0.3))
    for x in (12, 25, 37):
        k.line(x, 16, x, 47, CHROME[2], both=False, w=2)
        k.line(x + 1, 17, x + 1, 47, darken(0.3), both=False)
    for x in (110, 138):                                     # cab doors
        k.line(x, 2, x, 7, darken(0.45))
    k.line(112, 4, 114, 4, CHROME[2], w=2)
    for x in (70, 108):                                      # sliding door (right side only)
        k.line(x, 56, x, 61, darken(0.45), both=False)
    k.line(70, 58, 108, 58, darken(0.15), both=False)
    k.line(138, 8, 138, 31, darken(0.45))                    # short hood
    k.line(138, 9, 153, 9, darken(0.4))
    k.line(140, 22, 152, 22, ridge(0.1))
    k.line(137, 30, 136, 13, CHROME[1], both=False)          # wipers
    k.line(136, 29, 135, 14, RUBBER[0], both=False)
    k.line(137, 50, 136, 33, CHROME[1], both=False)
    k.line(136, 49, 135, 34, RUBBER[0], both=False)
    for y in (31, 32):                                       # rear doors: split and handle
        k.line(4, y, 7, y, darken(0.35 if y == 31 else 0.2), both=False)
    k.put(5, 34, CHROME[2], both=False)
    k.grime(wheels, amount=1.3, rust=10, scratches=4)
    k.seal()
    k.gloss(139, 154, 0.08)
    k.rim()
    k.bumper(1, 3, RUBBER)
    k.bumper(157, 158, RUBBER)
    for y in range(21, 32):                                  # grille
        for x in range(154, 157):
            k.put(x, y, CHROME[1] if y == 21 or x == 154 else RUBBER[0])
    for j in range(22 * k.s, 32 * k.s):
        for i in range(155 * k.s, 157 * k.s):
            k.setp(i, j, CHROME[0] if j % 2 else RUBBER[0])
    k.lamp(154, 156, 11, 15, HEAD_C, HEAD_GLOW, CHROME[2])   # stacked square headlights
    k.lamp(154, 156, 15, 19, HEAD_C, HEAD_GLOW, CHROME[2])
    k.line(155, 8, 156, 8, AMBER, w=2)
    k.line(155, 9, 156, 9, dk(AMBER, 0.2), w=2)
    k.lamp(4, 6, 4, 11, TAIL_C, TAIL_GLOW, hx('#7a0818'), back=6)      # tall tail lights on the corner posts
    k.line(5, 3, 6, 3, AMBER, w=2)
    for x in range(125, 131):                                # big black mirrors
        k.put(x, 1, RUBBER[3] if x == 126 else GLASS[1] if x == 130 else RUBBER[2])
    return k.done()


CONV_BODY = ramp('#ece2c8', 0.5, 0.24, 0.3)          # bone, a touch whiter than the van's
CONV_LEATHER = [hx('#3a0a12'), hx('#6a101c'), hx('#981826'), hx('#c8323a')]   # blood-red tuck-and-roll
CONV_CARPET = [hx('#12080c'), hx('#200c12'), hx('#2c1018')]
CONV_GOLD = [hx('#6a4a14'), hx('#b8862a'), hx('#e8c050'), hx('#fff0a0')]
CONV_VINYL = [hx('#16141a'), hx('#24212a'), hx('#34303c'), hx('#4a4556')]


def p_convertible():
    """The boss's convertible, roof down, 5.4 x 2.0 m: bone body, blood-red tuck-and-roll, twin gold pinstripes, a
    chrome spear down the belt, fins with tall blades of tail light, a dummy spare pressed in the deck. The open
    cabin is the VEHICLES `cabin` (the driver sits at `seat`, behind the wheel, on the -y side)."""
    body, seat = CONV_BODY, CONV_LEATHER
    W, H, CY, WHEELS = 172, 64, 32, (36, 140)
    k = Veh(W, H, CY, 5407)
    s = k.s
    k.shell(body, 1, 170, 29.5, 5, 7, nose=34, pinch=1.5, crown=2.6)
    k.arches(WHEELS, r=12)

    def region(x0, y0, x1, y1, fn):
        """Paint the pixels of the world rect (not mirrored): fn(x, y) -> colour or None, x, y pixel centres."""
        for j in range(int(y0 * s), int(math.ceil(y1 * s))):
            for i in range(int(x0 * s), int(math.ceil(x1 * s))):
                if (i, j) in k.mask:
                    c = fn((i + 0.5) / s, (j + 0.5) / s)
                    if c is not None:
                        k.cv.p[i, j] = c

    X0, X1, Y0, Y1 = 55.0, 113.0, 7.0, 57.0            # the cockpit's well

    def well(x, y):
        return X0 <= x < X1 and Y0 <= y < Y1

    def pleat(tones, x, y, x0, x1, lit=0.0, pitch=3.0, y0=Y0 + 1):
        """Tuck-and-roll: rolls running fore and aft, each a little dome; a button row would be too fine."""
        u = ((y - y0) % pitch) / pitch
        t = 0.72 - abs(u - 0.4) * 0.9 + lit - (y - CY) / 64 * 0.18
        if x - x0 < 0.6 or x1 - x < 0.6:
            t -= 0.3
        return pal(tones, t)

    # the floor first, then what stands on it
    region(X0, Y0, X1, Y1, lambda x, y: pal(CONV_CARPET, 0.5 + 0.4 * math.sin(x * 1.7 + y * 0.9) * 0.3))

    def bench(xb0, xb1, xc1, split):
        """A bench: its back (xb0..xb1, higher: lighter) and its cushion (xb1..xc1)."""
        def f(x, y):
            if not (Y0 + 1 <= y < Y1 - 1):
                return None
            if split and abs(y - CY) < 1.0:
                return dk(seat[0], 0.2)
            if x < xb1:
                c = pleat(seat, x, y, xb0, xb1, 0.16)
                if x - xb0 < 1.0:                    # the back's top roll, piped
                    c = lt(c, 0.18)
                return c
            c = pleat(seat, x, y, xb1, xc1, -0.06)
            if x - xb1 < 1.2:                        # the back's shadow on the cushion
                c = dk(c, 0.38)
            return c
        region(xb0, Y0, xc1, Y1, f)

    bench(59, 65, 77, False)                        # the rear bench
    bench(84, 90, 101, True)                        # the front one, split
    # the folded top under its boot, behind the rear seat: black vinyl, chrome snaps
    def boot(x, y):
        if not (5.5 <= y < 58.5):
            return None
        t = 0.75 - abs((x - 52.0) / 6.5) ** 2 * 0.5 - (y - 6) / 52 * 0.35
        return pal(CONV_VINYL, t)
    region(47, 5, 59, 59, boot)
    for y in range(8, 32, 6):
        k.dot(47.8, y + 0.2, CHROME[3])
        k.dot(47.8, 63.3 - y, CHROME[2])
    # door cards: the near one in shadow, the far one lit; chrome sill plates, armrests
    region(X0 + 4, Y0, X1 - 6, Y0 + 1.5, lambda x, y: dk(seat[0], 0.35))
    region(X0 + 4, Y1 - 1.5, X1 - 6, Y1, lambda x, y: seat[2] if y > Y1 - 1 else seat[1])
    for (a, b) in ((66, 76), (91, 100)):
        region(a, Y0 + 1.5, b, Y0 + 3, lambda x, y: seat[1])
        region(a, Y1 - 3, b, Y1 - 1.5, lambda x, y: seat[3] if y < Y1 - 2.4 else seat[2])
    # the well's own shadow: its rear and near walls throw it in
    for (i, j) in sorted(k.mask):
        x, y = (i + 0.5) / s, (j + 0.5) / s
        if well(x, y) and 59 <= x and (y - Y0 < 2.2 and not (84 <= x < 90 or 59 <= x < 65)):
            k.cv.p[i, j] = dk(k.cv.p[i, j], 0.3)
    # the dashboard: a padded top, the binnacle's hood before the driver, a chrome strip, the radio, the ashtray
    def dash(x, y):
        if not (Y0 <= y < Y1):
            return None
        t = 0.55 + (x - 106) / 7 * 0.35 - (y - Y0) / 50 * 0.2
        c = pal(seat[:3], t)
        if x < 106.6:
            c = CHROME[2] if int(y * 2) % 7 else CHROME[3]
        return c
    region(106, Y0, X1, Y1, dash)
    region(107, 13, 112, 26, lambda x, y: pal(CONV_VINYL, 0.3 + (x - 107) / 5 * 0.5))          # the binnacle
    for gy in (16.5, 22.5):                                                              # two dials, lit green
        k.dot(107.4, gy, hx('#7ae8b0'), both=False)
        k.dot(107.4, gy + 0.5, hx('#3a9a78'), both=False)
    region(106.6, 29, 108, 35, lambda x, y: RUBBER[0])                                   # the radio's face
    k.dot(107.2, 30.2, hx('#ff8a20'), both=False)
    k.dot(107.2, 33.8, CHROME[3], both=False)
    # the wheel, seen from straight above: raked up toward him on its column, it is a thin ring across the car (the
    # VEHICLES `wheel`: x, y, half its width, half its depth), up against the dash; only its top edge catches the light
    wx, wy, wa, wb = 103.6, 19.5, 5.4, 1.6
    region(wx, wy - 0.6, 106.2, wy + 0.6, lambda x, y: RUBBER[0])                         # the column into the dash
    def rim(x, y):
        o = ((x - wx) / (wb + 0.5)) ** 2 + ((y - wy) / (wa + 0.5)) ** 2
        i = ((x - wx) / max(wb - 0.5, 0.1)) ** 2 + ((y - wy) / (wa - 0.5)) ** 2
        if o <= 1.0 and i >= 1.0:
            if x >= wx + 0.4:                                    # the top of the rim, nearest the glass: lit
                return hx('#d8ceb4') if y < wy + 2 else hx('#a89e86')
            return hx('#7a705c') if y < wy else hx('#5a5244')       # its bottom edge, under the hands, in shadow
        if o < 1.0 and abs(y - wy) < 0.5:                         # the spoke across, then the hub on the column
            return CONV_GOLD[1] if abs(x - wx) < 0.6 else hx('#5a5244')
        return None
    region(wx - 3, wy - 7, wx + 3, wy + 7, rim)
    # the shifter on the column, the mirror on the header, the dice hanging from it
    k.line(105, 21, 105.5, 23.5, CHROME[2], both=False)
    k.dot(105.6, 24.1, hx('#f6f0e0'), both=False)
    # things left in it (his hat on the rear seat is a sprite of its own, boss_hat: it flies off): a cigar burn in
    # the passenger's cushion, a cigar going in the dash's ashtray
    for (x, y, c) in ((95.0, 43.0, hx('#120808')), (95.5, 43.0, hx('#120808')), (95.0, 43.5, hx('#120808')), (94.5, 43.0, hx('#4a2a1a')),
                      (96.0, 43.0, hx('#5a3020')), (95.0, 42.5, hx('#4a2a1a')), (95.5, 43.5, hx('#5a3020')), (95.0, 44.0, hx('#d0806a')),
                      (95.5, 42.5, hx('#4a1210')), (94.5, 43.5, hx('#4a1210'))):
        k.dot(x, y, c, both=False)                  # the burn
    region(108.5, 37, 111, 41, lambda x, y: CHROME[1] if (x < 109 or y < 37.5) else RUBBER[0])   # the ashtray, pulled out
    k.line(109, 38, 110, 40, hx('#7a5230'), both=False)                                          # the cigar in it
    k.dot(110.6, 40.8, hx('#ff8a20'), both=False)
    k.dot(108.9, 37.6, hx('#d8d0c0'), both=False)
    # the windshield from above: a raked band of glass in its chrome frame, the vent wings
    k.trap(113, 118, 25.5, 27.0, sheen=2)
    k.film(113, 118, ((118.5, 30.5), (118.5, 52.5)), 30, 0.06)
    for i in k.cols(113, 113):
        for j in range(int(5 * s), int(59 * s)):
            if (i, j) in k.mask and i == 113 * s:
                k.cv.p[i, j] = CHROME[3] if j < CY * s else CHROME[2]
    k.line(112, 31, 112, 32, CHROME[1], both=False, w=2)                                         # the mirror
    for (cx, cy) in ((109.5, 30.0), (110.0, 33.0)):                                              # the dice
        for dx in (0, 0.5, 1.0):
            for dy in (0, 0.5, 1.0):
                c = hx('#fff8e6') if dx + dy < 1.0 else hx('#d8cab0') if dx + dy < 2.0 else hx('#9a8c74')
                if (dx, dy) == (0.5, 0.5):
                    c = hx('#1a161e')
                k.dot(cx + dx, cy + dy, c, both=False)
    k.line(111, 31, 112, 32, RUBBER[2], both=False)
    k.line(108, 4, 112, 6, CHROME[2])                                                           # vent wings
    k.line(108, 5, 111, 6, GLASS[3])
    # ---- the body's dressing (both roofs)
    for x0, x1 in ((6, 46), (120, 164)):                 # twin gold pinstripes down the deck and the hood
        k.line(x0, 26, x1, 26, lambda c, sd: mix(c, CONV_GOLD[1], 0.8))
    k.line(6, 5, 164, 5, lambda c, sd: mix(c, CHROME[3 if sd < 0 else 1], 0.7))   # the belt's chrome spear
    k.line(6, 6, 164, 6, lambda c, sd: mix(c, CONV_GOLD[2] if sd < 0 else CONV_GOLD[0], 0.75), w=1)
    for x in (58, 84, 112):                               # door seams and pulls
        k.line(x, 2, x, 6, darken(0.4))
    k.line(88, 4, 91, 4, lambda c, sd: CHROME[3 if sd < 0 else 2], w=2)
    k.line(119, 8, 119, 31, darken(0.45))                 # cowl gap
    for x in range(121, 127, 2):
        k.line(x, 22, x, 27, darken(0.14))
    k.line(119, 9, 165, 9, darken(0.32))                  # hood shut lines
    k.line(124, 31, 162, 31, ridge(0.2))                  # its centre spine
    k.line(124, 18, 160, 18, ridge(0.1))
    for (y0, y1) in ((30, 14), (52, 36)):                 # parked wipers
        k.line(118, y0, 117, y1, CHROME[1], both=False)
    # the hood's mascot: a gold stand-up thing on a chrome foot
    k.put(163, 31, CHROME[2])
    k.put(163, 32, CHROME[1], both=False)
    k.put(164, 31, CONV_GOLD[2])
    k.dot(164.1, 31.1, CONV_GOLD[3])
    k.dot(165.2, 31.6, CONV_GOLD[1])
    # the deck: lid lines, and the bad taste: a dummy spare's hump pressed in the lid, a gold cap in its middle
    k.line(8, 9, 8, 31, darken(0.36))
    k.line(8, 9, 44, 9, darken(0.32))
    def hump(c, i, j):
        x, y = (i + 0.5) / s, (j + 0.5) / s
        d = math.hypot(x - 22.0, y - 32.0)
        if 9.6 <= d < 11.2:
            n = (-(x - 22) - (y - 32) * 1.4) / (d * 1.72)
            return lt(dk(c, 0.06), 0.3 * n) if n > 0 else dk(c, 0.06 - 0.3 * n)
        if d < 9.6:
            return lt(c, 0.05) if (d > 8.4 and y < 32) else c
        return None
    for (i, j) in sorted(k.mask):
        c = hump(k.cv.p[i, j], i, j)
        if c is not None:
            k.cv.p[i, j] = c
    for (dx, dy, c) in ((0, 0, CONV_GOLD[3]), (0.5, 0, CONV_GOLD[2]), (0, 0.5, CONV_GOLD[2]), (0.5, 0.5, CONV_GOLD[1]), (-0.5, 0, CONV_GOLD[2]), (0, -0.5, CONV_GOLD[2]),
                        (1.0, 0, CONV_GOLD[1]), (0, 1.0, CONV_GOLD[0]), (-0.5, 0.5, CONV_GOLD[1]), (0.5, -0.5, CONV_GOLD[2]), (-0.5, -0.5, CONV_GOLD[2]), (1.0, 0.5, CONV_GOLD[0]), (0.5, 1.0, CONV_GOLD[0])):
        k.dot(21.8 + dx, 31.8 + dy, c, both=False)
    k.line(4, 3, 30, 3, lambda c, sd: lt(c, 0.2) if sd < 0 else dk(c, 0.1))     # the fins' crest: a hard lit edge
    k.line(4, 4, 34, 4, darken(0.12))
    k.line(28, 2, 31, 2, darken(0.3), both=False)         # filler flap
    k.put(48, 60, RUBBER[0], both=False)                  # aerial
    k.line(48, 60, 38, 61, CHROME[2], both=False)
    k.grime(WHEELS, amount=0.55, rust=1, scratches=2)     # kept clean: somebody is paid to
    k.seal()
    k.gloss(120, 166, 0.14)
    k.gloss(6, 46, 0.1)
    k.rim()
    k.bumper(169, 170, CHROME, strip=None)
    k.bumper(1, 2, CHROME, strip=None)
    for x in (169, 170):                                  # gold over-riders
        k.line(x, 21, x, 22, CONV_GOLD[2] if x == 169 else CONV_GOLD[1])
    for y in range(18, 32):                               # a tall waterfall grille
        for x in range(165, 169):
            k.put(x, y, CHROME[1] if y == 18 or x == 165 else RUBBER[0])
    for j in range(19 * s, 32 * s):
        for i in range(166 * s, 169 * s):
            k.setp(i, j, CHROME[3] if j % 2 == 0 else CHROME[1])
    k.lamp(166, 168, 6, 11, HEAD_C, HEAD_GLOW, CHROME[2])
    k.lamp(166, 168, 11, 16, HEAD_C, HEAD_GLOW, CHROME[2])
    k.line(166, 4, 167, 4, AMBER, w=2)
    k.lamp(3, 4, 3, 15, TAIL_C, TAIL_GLOW, hx('#7a0818'), back=4)       # tall blades of tail light in the fins
    k.line(3, 17, 4, 17, hx('#e8e4dc'), w=2)
    plate(k, 3, 27, 31)
    k.mirror(104, 108, [CHROME[0], CHROME[1], CHROME[2], CHROME[3]], 108)
    return k.done()


def p_boss_hat():
    """THE BOSS's bone hat seen from above (it lies on the convertible's rear seat, VEHICLES `hat`, and flies off):
    a wide brim, its edge rolled, a black band on the side away from the light, the crown's crease."""
    cv = Cv(14, 12)
    cx, cy = 7.0, 6.0

    def f(x, y, c):
        d = math.hypot((x - cx) / 6.2, (y - cy) / 5.6)
        if d > 1.0:
            return None
        if d > 0.9:
            return OUTLINE if x + y > cx + cy + 1 else hx('#b8a890')
        u = (x - cx) + (y - cy)                         # along the light
        if d > 0.56:                                    # the brim
            return hx('#f2e8d2') if u < 1.0 else hx('#d8cab0')
        if d > 0.44 and u > -3.0:
            return hx('#2a1c22')                        # the band
        col = hx('#fff8e6') if u < -1.0 else hx('#e6dabe')
        if abs((y - cy) - (x - cx) * 0.25) < 0.55 and -1.5 < x - cx < 1.8:
            col = hx('#c2b494')                         # the crown's crease
        return col
    px_paint(cv, 0, 0, 14, 12, f)
    return cv


def p_car_tire():
    """Tyre seen from above (tread up), 0.62 m x 0.22 m: the tread blocks and the grooves between them, the shoulders
    rolling off into shadow."""
    cv = Cv(20, 7, FINE)

    def f(x, y, c):
        if (x < 1 or x > 19) and (y < 1 or y > 6):
            return None
        t = (y - 3.5) / 3.5
        L = 0.7 - abs(t) * 0.5 - t * 0.15
        col = pal(RUBBER, L)
        if abs(t) < 0.6 and int(x * 2 + (1 if t > 0 else 0)) % 3 == 0:
            col = RUBBER[0]                   # the grooves across the tread
        if abs(y - 3.5) < 0.3:
            col = RUBBER[0]                   # the centre groove
        return col
    px_paint(cv, 0, 0, 20, 7, f)
    return cv


def hood_debris(body, w, h, seed, stripe=None, stripe_at=(2.5, 3.5)):
    """Hood blown off: buckled panel with a diagonal fold, dents, a scorched edge, torn corners. stripe: its colour
    on the rows that far (world px) from the middle (twin stripes by default, one down the middle with (0.5,))."""
    rng = random.Random(seed)
    cv = Cv(w, h)
    burn = VNoise(w, h, 5, rng)
    fold = rng.uniform(0.4, 0.55)
    for y in range(1, h - 1):
        for x in range(1, w - 1):
            u, v = (x + 0.5) / w, (y + 0.5) / h
            d = (u - fold) + (v - 0.5) * 0.45
            c = soft(body, light(-0.55 if d < 0 else 0.3, (v - 0.5) * 0.6))
            if stripe and abs((y + 0.5) - h / 2) in stripe_at:
                c = stripe
            if -0.02 < d < 0.025:
                c = lt(c, 0.3) if d < 0 else dk(c, 0.35)
            c = mix(c, hx('#1a1012'), max(0.0, (1 - u) * 1.6 - 0.9 + burn(x, y) * 0.5))
            cv.set(x, y, c)
    for _ in range(4):
        cx, cy, r = rng.uniform(4, w - 4), rng.uniform(4, h - 4), rng.uniform(1.5, 3.0)
        for y in range(int(cy - r), int(cy + r) + 1):
            for x in range(int(cx - r), int(cx + r) + 1):
                if math.hypot(x - cx, y - cy) < r and cv.on(x, y):
                    cv.set(x, y, dk(cv.get(x, y), 0.25) if y > cy else lt(cv.get(x, y), 0.12))
    for (x0, y0) in ((1, 1), (w - 2, 1), (1, h - 2), (w - 2, h - 2)):
        for i in range(rng.randint(2, 4)):
            for j in range(rng.randint(1, 4 - min(i, 3))):
                cv.set(x0 + (i if x0 == 1 else -i), y0 + (j if y0 == 1 else -j), CLEAR)
    cv.outline()
    return cv


def door_debris(body, w, stripe=None, inner=None):
    """Door ripped off, seen from above edge-on: skin, window frame with glass left in it (inner: an open car's
    door has none, its trim shows instead), handle."""
    cv = Cv(w, 6)
    for x in range(1, w - 1):
        cv.set(x, 1, lt(body[2], 0.2))
        cv.set(x, 2, stripe or body[2])
        cv.set(x, 3, (inner or GLASS[2]) if 4 < x < w - 8 else body[1])
        cv.set(x, 4, body[0])
    cv.set(w - 7, 1, CHROME[3])
    cv.set(w - 6, 1, CHROME[2])
    cv.outline()
    return cv


def p_car_hood():
    return hood_debris(SEDAN_BODY, 38, 44, 4411)


def p_car2_hood():
    return hood_debris(COUPE_BODY, 30, 40, 4212, stripe=NEON_CYAN)


def p_van_hood():
    return hood_debris(VAN_BODY, 18, 48, 5013)


def p_convertible_hood():
    return hood_debris(CONV_BODY, 46, 46, 5417, stripe=CONV_GOLD[1])


def p_convertible_door():
    return door_debris(CONV_BODY, 28, stripe=CHROME[3], inner=CONV_LEATHER[2])


def p_car_door():
    return door_debris(SEDAN_BODY, 34)


def p_car2_door():
    return door_debris(COUPE_BODY, 40, stripe=hx('#7a1fa2'))


def p_van_door():
    return door_debris(VAN_BODY, 30, stripe=hx('#ff6b1a'))


def p_pursuer_hood():
    return hood_debris(PURSUER_BODY, 38, 44, 4421, stripe=PURSUER_STRIPE, stripe_at=(0.5,))


def p_pursuer_door():
    return door_debris(PURSUER_BODY, 34)


# --------------------------------------------------------------------------
# Street props and neon
# --------------------------------------------------------------------------

def p_palm_tree():
    """Canary palm crown (~3.2 m) seen from above: two tiers of feathery fronds, a couple of dead ones, coconuts.
    The trunk (the hitbox, r 4.5) is the fibrous boss in the middle."""
    S = 104
    cv = Cv(S, S)
    rng = random.Random(31)
    c0 = S / 2
    fronds = []
    for tier in range(2):
        n = 9 if tier == 0 else 7
        for i in range(n):
            a = i * 2 * math.pi / n + (0.4 if tier else 0.0) + rng.uniform(-0.2, 0.2)
            ln = rng.uniform(41.0, 49.0) if tier == 0 else rng.uniform(29.0, 37.0)
            dead = tier == 0 and i in (2, 6)
            fronds.append((tier, a, ln * (0.85 if dead else 1.0), rng.uniform(-0.35, 0.35), dead))
    greens = [ramp('#1c6a34', 0.6, 0.35, 0.2), ramp('#2c9a34', 0.55, 0.3, 0.22)]
    brown = ramp('#8a6a36', 0.55, 0.3, 0.25)
    K = 24
    for idx, (tier, a, ln, bend, dead) in enumerate(fronds):
        fr = Cv(S, S)
        pts = []
        for k in range(K):
            t = k / (K - 1.0)
            aa = a + bend * t * t
            r = 3.0 + ln * t
            pts.append((c0 + math.cos(aa) * r, c0 + math.sin(aa) * r))
        g = brown if dead else greens[tier]
        xs, ys = [p[0] for p in pts], [p[1] for p in pts]
        for y in range(max(0, int(min(ys)) - 10), min(S, int(max(ys)) + 11)):
            for x in range(max(0, int(min(xs)) - 10), min(S, int(max(xs)) + 11)):
                px_, py_ = x + 0.5, y + 0.5
                best = None
                for k in range(K - 1):
                    ax, ay = pts[k]
                    bx, by = pts[k + 1]
                    dx, dy = bx - ax, by - ay
                    ll = dx * dx + dy * dy
                    tt = max(0.0, min(1.0, ((px_ - ax) * dx + (py_ - ay) * dy) / ll))
                    d = math.hypot(px_ - ax - tt * dx, py_ - ay - tt * dy)
                    if best is None or d < best[0]:
                        side = ((px_ - ax) * dy - (py_ - ay) * dx) / math.sqrt(ll)
                        best = (d, (k + tt) / (K - 1.0), side)
                d, t, side = best
                w = (6.0 if dead else 9.0) * math.sin(math.pi * min(1.0, t * 0.95 + 0.05)) ** 0.6 * (1.0 - 0.3 * t)
                if d > w or t > 0.995 or t < 0.05:
                    continue
                q = t * ln - abs(side) * 1.25
                fr_ = q / 3.0 - math.floor(q / 3.0)
                if abs(side) < 0.9:
                    c = (hx('#c8b060') if dead else hx('#b8c84a')) if t > 0.1 else hx('#7a6a3a')
                else:
                    if fr_ > (0.5 if dead else 0.62):
                        continue                      # gap between two leaflets
                    lit = side * (math.sin(a) * LX - math.cos(a) * LY) > 0
                    c = g[3] if lit else g[1]
                    if fr_ < 0.2 and lit:
                        c = g[2]
                    if abs(side) > w * 0.8:
                        c = dk(c, 0.15)               # leaflet tips droop away from the light
                if tier == 0:
                    c = dk(c, 0.22)
                fr.set(x, y, c)
        fr.outline(hx('#081a14'))
        cv.over(fr)
        if idx == 8:                      # coconuts between the two tiers
            nuts = Cv(S, S)
            for (dx, dy) in ((-3.6, 2.4), (-1.0, 4.4), (2.6, 3.4)):
                fill_shape(nuts, c0 + dx, c0 + dy, 2.0, 2.0, lambda u, v, L: shade(ramp('#7a5a22', 0.5, 0.25, 0.35), L))
            nuts.outline(hx('#1a0c10'))
            cv.over(nuts)
    trunk = Cv(S, S)
    fill_shape(trunk, c0, c0, 4.5, 4.5, lambda u, v, L: shade(ramp('#6a4228', 0.5, 0.25, 0.35), L))
    for (dx, dy) in ((-2.4, 1.4), (1.8, -2.2), (2.2, 2.0)):
        fill_shape(trunk, c0 + dx, c0 + dy, 1.6, 1.6, lambda u, v, L: shade(ramp('#5a3a1a', 0.45, 0.2, 0.4), L))
    trunk.outline(hx('#1a0c10'))
    cv.over(trunk)
    return cv


def p_streetlight():
    """Cobra-head streetlight: the pole top (hitbox, r 3) at the sprite centre, a 1.75 m arm toward +x and the
    luminaire, its glass refractor glowing around the housing."""
    W, H = 136, 16
    cv, gl = Cv(W, H), Cv(W, H)
    cx, cy = W / 2, H / 2
    m = ramp('#5a5e6e', 0.5, 0.25, 0.4)
    hx0 = cx + 56.0                         # luminaire centre

    def arm(ly):
        fill_capsule(ly, [(cx + 1.5, cy), (hx0 - 8.0, cy)], 1.0, lambda k, L, s, i, t: shade(m, L))
        fill_capsule(ly, [(cx + 2.0, cy + 0.6), (cx + 9.0, cy + 0.2)], 1.4, lambda k, L, s, i, t: shade(m, L - 0.05))
        fill_shape(ly, cx, cy, 3.0, 3.0, lambda u, v, L: shade(m, L))
        ly.set(int(cx - 1), int(cy - 1), m[3])
    layer(cv, arm)

    def lum(ly):
        fill_shape(ly, hx0 + 0.6, cy, 10.6, 5.2, lambda u, v, L: hx('#ffd27a') if L < 0.8 else hx('#fff4d0'), kind='super', p=2.4)
        fill_shape(ly, hx0 - 0.6, cy, 9.6, 4.4, lambda u, v, L: shade(ramp('#6a7066', 0.5, 0.25, 0.4), L), kind='super', p=2.4)
        line(ly, hx0 - 6.0, cy - 0.5, hx0 + 6.0, cy - 0.5, ramp('#6a7066', 0.5, 0.25, 0.4)[3])   # housing seam
        ly.set(int(hx0 - 7), int(cy), hx('#3a3e3a'))      # photocell
    layer(cv, lum)
    for y in range(H):
        for x in range(int(hx0 - 12), W):
            c = cv.get(x, y)
            if c[3] and (c[:3] == hx('#ffd27a')[:3] or c[:3] == hx('#fff4d0')[:3]):
                gl.set(x, y, (255, 228, 160, 255) if c[0:3] == hx('#fff4d0')[:3] else (255, 200, 110, 230))
    return cv, gl


class Neon:
    """Collects 1 px neon tubes, then renders halo + tube on the sprite and the glow map."""

    def __init__(self, w, h):
        self.w, self.h = w, h
        self.px = {}

    def dot(self, x, y, col):
        self.px[(int(x), int(y))] = col

    def line(self, pts, col):
        for (ax, ay), (bx, by) in zip(pts, pts[1:]):
            n = int(max(abs(bx - ax), abs(by - ay))) + 1
            for k in range(n + 1):
                t = k / n
                self.dot(round(ax + (bx - ax) * t), round(ay + (by - ay) * t), col)

    def arc(self, cx, cy, r, a0, a1, col, ry=None):
        ry = ry or r
        n = int(abs(a1 - a0) * max(r, ry) * 1.5) + 2
        for k in range(n + 1):
            a = a0 + (a1 - a0) * k / n
            self.dot(round(cx + math.cos(a) * r - 0.5), round(cy + math.sin(a) * ry - 0.5), col)

    def render(self, cv, gl):
        for (x, y), col in self.px.items():
            for dx in (-1, 0, 1):
                for dy in (-1, 0, 1):
                    q = (x + dx, y + dy)
                    if q not in self.px and cv.on(*q, 1):
                        cv.set(*q, mix(cv.get(*q), col, 0.32 if dx == 0 or dy == 0 else 0.18))
        for (x, y), col in self.px.items():
            cv.set(x, y, lt(col, 0.35))
            gl.set(x, y, lt(col, 0.2))


def sign_backing(w, h):
    cv = Cv(w, h)
    bk = ramp('#1e1030', 0.4, 0.2, 0.3)
    fill_shape(cv, w / 2, h / 2, w / 2 - 1, h / 2 - 1, lambda u, v, L: tone(bk, L), kind='rect', bevel=1.2, corner=1.5)
    for (x, y) in [(2, 2), (w - 3, 2), (2, h - 3), (w - 3, h - 3)]:
        cv.set(x, y, hx('#5a4a6a'))
    cv.outline()
    return cv


def p_neon_sign_palm():
    cv, gl = sign_backing(40, 14), Cv(40, 14)
    ne = Neon(40, 14)
    pink, cyan, orange, yel = NEON_PINK, NEON_CYAN, hx('#ff6b1a'), hx('#f9c80e')
    ne.arc(27.5, 10.5, 6.5, math.pi, 2 * math.pi, orange)       # sun
    for (y, half, col) in [(6, 4, yel), (8, 5, orange)]:
        ne.line([(27 - half + 1, y), (27 + half, y)], col)
    ne.line([(4, 11), (36, 11)], pink)                            # horizon
    ne.line([(10, 10), (11, 7), (12, 4)], cyan)                   # palm trunk
    for (pts) in [[(12, 4), (9, 3), (6, 5)], [(12, 4), (15, 3), (18, 5)], [(12, 4), (10, 6), (8, 8)],
                  [(12, 4), (14, 6), (16, 8)], [(12, 4), (12, 2)]]:
        ne.line(pts, cyan if pts[-1][1] != 2 else hx('#3aff8a'))
    ne.render(cv, gl)
    return cv, gl


FONT_BAR = {
    'B': ["#####.", "#....#", "#....#", "#####.", "#....#", "#....#", "#....#", "#####."],
    'A': [".####.", "#....#", "#....#", "#....#", "######", "#....#", "#....#", "#....#"],
    'R': ["#####.", "#....#", "#....#", "#####.", "#..#..", "#...#.", "#....#", "#....#"],
}


def p_neon_sign_bar():
    cv, gl = sign_backing(44, 14), Cv(44, 14)
    ne = Neon(44, 14)
    x0 = 16
    for ch in 'BAR':
        for y, row in enumerate(FONT_BAR[ch]):
            for x, c in enumerate(row):
                if c == '#':
                    ne.dot(x0 + x, 3 + y, NEON_PINK)
        x0 += 8
    # cocktail glass
    ne.line([(4, 3), (12, 3), (8, 7), (4, 3)], NEON_CYAN)
    ne.line([(8, 7), (8, 10)], NEON_CYAN)
    ne.line([(6, 10), (10, 10)], NEON_CYAN)
    ne.dot(10, 2, hx('#3aff8a'))
    ne.dot(11, 1, hx('#3aff8a'))
    ne.dot(7, 4, hx('#f9c80e'))
    ne.render(cv, gl)
    return cv, gl


def p_neon_sign_arrow():
    cv, gl = sign_backing(30, 12), Cv(30, 12)
    ne = Neon(30, 12)
    yel = hx('#f9c80e')
    ne.line([(3, 4), (18, 4), (18, 2), (26, 6), (18, 9), (18, 7), (3, 7), (3, 4)], yel)
    ne.render(cv, gl)
    for x in range(5, 18, 3):
        for y in (5, 6):
            cv.set(x, y, lt(NEON_PINK, 0.3))
            gl.set(x, y, NEON_PINK)
    return cv, gl


def p_jukebox():
    """Jukebox from above: chrome-trimmed arch with bubble tubes, the record magazine and platter under the glass
    dome, title strips and buttons on the selector panel (+y)."""
    W, H = 30, 22
    cv, gl = Cv(W, H), Cv(W, H)
    cx = W / 2
    body = ramp('#4a1838', 0.5, 0.25, 0.35)
    chrome = ramp('#b8bccc', 0.5, 0.25, 0.4)
    bands = [NEON_PINK, hx('#ff6b1a'), hx('#f9c80e')]
    rng = random.Random(661)
    bubbles = set((rng.randrange(0, 60), rng.randrange(0, 44)) for _ in range(40))

    def arch(x, y, cur):
        u = (x - cx) / 14.0
        v = (y - 12.0) / 11.0
        e = (abs(u) ** 4 + max(0.0, -v) ** 4) ** 0.25 if v < 0 else abs(u)
        if e > 1.0 or y > H - 1:
            return None
        if e > 0.92:                          # chrome trim, lit from the top-left
            nx, ny = (u / (e or 1)) * 0.9, (min(0.0, v) / (e or 1)) * 0.9
            L = light(nx, ny)
            c = shade(chrome, L)
            return lt(c, 0.4) if 0.955 < e < 0.975 and L > 0.6 else c
        if e > 0.74:
            if v < 0.15:                      # bubble tubes following the arch
                col = bands[min(2, int((e - 0.74) / 0.06))]
                k = (e - 0.74) % 0.06 / 0.06
                c = lt(col, 0.45 if 0.3 < k < 0.6 else 0.2)
                if (int(x * 2), int(y * 2)) in bubbles:
                    c = lt(col, 0.75)         # a bubble rising
                gl.dot(x, y, lt(col, 0.1))
            else:                             # straight cyan tubes down the front corners
                c = lt(NEON_CYAN, 0.35 if abs(abs(u) - 0.83) < 0.03 else 0.15)
                gl.dot(x, y, NEON_CYAN)
            return c
        return shade(body, 0.68 + (0.06 if (x * 3 + y) % 4 < 0.5 else 0.0))
    px_paint(cv, 1, 1, W - 1, H - 1, arch)

    def dome(x, y, cur):                      # glass dome: the record magazine (discs on edge) around the platter
        u, v = (x - cx) / 9.0, (y - 11.0) / 7.5
        if u * u + min(0.0, v) ** 2 > 1.0:
            return None
        return hx('#1a1028') if int(math.atan2(y - 11.5, x - cx) * 22) % 2 else hx('#100a18')
    px_paint(cv, 6, 4, 24, 14, dome)
    labels = [NEON_PINK, hx('#f9c80e'), NEON_CYAN, hx('#3aff8a'), hx('#ff6b1a'), hx('#f4f0ff'), NEON_PINK]
    for i in range(7):
        a = math.pi * (1.1 + 0.8 * i / 6.0)
        x0, y0 = cx + math.cos(a) * 4.6, 11.5 + math.sin(a) * 4.6
        x1, y1 = cx + math.cos(a) * 7.4, 11.5 + math.sin(a) * 7.4
        line(cv, x0, y0, x1, y1, hx('#4a4458'))
        mx, my = (x0 + x1) / 2, (y0 + y1) / 2
        for (ox, oy) in ((0, 0), (0.5, 0), (0, 0.5)):
            cv.dot(mx + ox, my + oy, labels[i])
            gl.dot(mx + ox, my + oy, dk(labels[i], 0.3))
    ring(cv, cx, 11.0, 0.0, 2.6, lambda dx, dy, d: hx('#16121e') if int(d * 3) % 2 else hx('#0c0a10'))
    fill_shape(cv, cx, 11.0, 0.9, 0.9, lambda u, v, L: NEON_PINK if L > 0.4 else dk(NEON_PINK, 0.3))
    cv.dot(cx - 1.5, 10.0, hx('#5a5868'))
    for y in range(10, 26):                   # reflection streak on the dome
        cv.bpx(18 + (y - 10) // 3, y, (255, 255, 255, 70))
        cv.bpx(21 + (y - 10) // 3, y + 2, (255, 255, 255, 30))
    # selector panel: two columns of title strips, a row of buttons, the coin light
    for (x0, x1) in ((5, 14), (17, 26)):
        frect(cv, x0, 14, x1, 19, shade(body, 0.45))
        for y in (15, 17):
            for k in range((x1 - x0) // 5 + 1):
                sx = x0 + k * 5
                frect(cv, sx, y, min(x1, sx + 4), y + 1, hx('#efe4c8'))
                frect(cv, sx + 0.5, y + 0.5, min(x1, sx + 4) - 0.5, y + 1, hx('#b8a890'))   # a typed title
                frect(cv, sx, y, min(x1, sx + 4), y + 1, lambda c: c)
                px_paint(gl, sx, y, min(x1, sx + 4), y + 1, lambda x, y, c: (255, 240, 200, 70))
        frect(cv, x0, 14, x1, 14.5, lt(shade(body, 0.45), 0.15))
    for x in range(6, 25, 2):
        fill_shape(cv, x + 0.5, 19.5, 0.6, 0.6, lambda u, v, L, x=x: (hx('#ff3a3a') if x == 14 else shade(chrome, L)))
    gl.set(14, 19, hx('#ff3a3a'))
    cv.outline()
    return cv, gl


def p_hydrant():
    """Fire hydrant from above, 14 x 14: two hose caps on the sides and the pumper outlet in front, each with its own
    dark edge and the chain that keeps it, under the barrel's bolted flange, the bonnet dome and its pentagon brass nut
    (the user: sharper and a little bigger)."""
    S = 14
    cv = Cv(S, S)
    red = ramp('#d0262c', 0.55, 0.28, 0.35)
    cap = ramp('#c8c8d8', 0.5, 0.25, 0.4)
    nut = ramp('#e0b02a', 0.5, 0.2, 0.4)

    def caps(ly):
        for (cx, cy, rx, ry) in ((2.3, 7.0, 1.4, 2.0), (11.7, 7.0, 1.4, 2.0), (7.0, 11.7, 2.0, 1.4)):
            fill_shape(ly, cx, cy, rx, ry, lambda u, v, L: shade(cap, L))
            fill_shape(ly, cx, cy, rx * 0.45, ry * 0.45, lambda u, v, L: shade(cap, 1.0 - L * 0.6), kind='super', p=1.2)   # its nut

    def barrel(ly):
        fill_shape(ly, 7.0, 7.0, 4.1, 4.1, lambda u, v, L: red[1] if L < 0.5 else red[2])     # the flange
        for k in range(6):
            a = k * math.pi / 3 + 0.3
            stud(ly, 7.0 + math.cos(a) * 3.6 - 0.25, 7.0 + math.sin(a) * 3.6 - 0.25, red[1])   # its bolts
    layer(cv, caps)
    layer(cv, barrel)
    fill_shape(cv, 7.0, 7.0, 3.0, 3.0, lambda u, v, L: shade(red, L))                          # the bonnet
    ring(cv, 7.0, 7.0, 2.9, 3.4, lambda dx, dy, d: red[0])                                     # its edge
    fill_shape(cv, 7.0, 7.0, 1.5, 1.5, lambda u, v, L: shade(nut, L), kind='super', p=1.1)     # pentagon-ish nut
    cv.dot(5.0, 5.0, hx('#ff9a8a'))                                    # the light on the dome
    cv.dot(5.5, 5.0, hx('#ff9a8a'))
    smudge(cv, random.Random(4747), 3, (3, 3, 11, 11), (0.4, 0.7), 0.7, hx('#8a8a98'))   # paint chipped to the iron
    line(cv, 3.0, 8.6, 5.4, 10.6, hx('#6a6a78'))                       # a cap's chain
    return cv


def p_bench():
    """Park bench with backrest (-y): weathered slats with their grain and bolts, worn pale where people sit, cast-iron
    scrolled ends, carved initials, what a pigeon left."""
    W, H = 52, 17
    cv = Cv(W, H)
    w = ramp('#a06a3a', 0.5, 0.25, 0.3)
    iron = ramp('#34343e', 0.4, 0.2, 0.45)
    frect(cv, 2, 1, W - 2, 16, hx('#1e1a24'))                          # the ground and frame under the gaps
    for (x0, x1) in ((24.5, 27.5),):
        frect(cv, x0, 1, x1, 16, hx('#2a2632'))                        # the middle support
    for k, (y0, y1) in enumerate(((1, 2), (4, 5), (7, 9), (11, 12), (14, 15))):
        wood_fill(cv, 2, y0, W - 3, y1, w[2], plank=y1 - y0 + 1, rng=random.Random(41 + k))
        bevel_edges(cv, 2, y0, W - 3, y1, 0.22, 0.32)
        if y0 >= 7:
            px_paint(cv, 9, y0, W - 9, y1 + 1, lambda x, y, c: mix(c, hx('#c8a882'), 0.2 * math.sin(math.pi * (x - 9) / (W - 18))))   # sat-on wear
        for x in (8.0, 25.5, 43.0):
            stud(cv, x, y0 + (y1 - y0 + 1) / 2.0 - 0.25, iron[1])     # carriage bolts
    for x0 in (1, W - 4):                                              # cast-iron ends with a scrolled armrest
        fill_capsule(cv, [(x0 + 1.5, 1.6), (x0 + 1.5, 15.4)], 1.4, lambda k, L, s, i, t: shade(iron, L + (0.15 if t < 0.25 else 0.0)))
        ring(cv, x0 + 1.5, 15.0, 0.5, 1.2, lambda dx, dy, d: iron[3] if dx + dy < 0 else iron[1])   # the scroll
    for (x, y) in ((12.0, 11.5), (12.5, 11.5), (14.0, 11.5), (15.0, 11.5), (15.5, 11.5), (17.0, 11.5)):
        cv.dot(x, y, dk(w[1], 0.35))                                   # carved initials
    for (x, y) in ((36.0, 8.0), (36.5, 8.5), (37.0, 8.0)):
        cv.dot(x, y, hx('#e8e4dc'))                                    # pigeon
    smudge(cv, random.Random(42), 5, (3, 1, W - 3, 16), (1.0, 2.5), 0.14)
    cv.outline()
    return cv


def p_chain_fence():
    """Chain-link gate panel, chest high: a galvanized top rail between two posts seen from above (the 32 x 4 hitbox),
    with its tie wires, and the diamond mesh laid out on both sides, one fine wire wide, the way it shows when looking
    down through it, fading away from the rail."""
    W, H = 34, 16
    cv = Cv(W, H)
    st = ramp('#aeb4be', 0.5, 0.25, 0.4)
    fill_capsule(cv, [(1.5, 7.5), (W - 1.5, 7.5)], 0.95, lambda k, L, s, i, t: lt(st[3], 0.2) if L > 0.9 else shade(st, L))   # top rail
    for x in range(4, W - 4, 4):
        frect(cv, x, 7.0, x + 0.5, 8.5, st[0])                         # tie wires
    for x0 in (1.0, W - 5.0):                                          # posts and their caps
        fill_shape(cv, x0 + 2.0, 7.5, 2.0, 2.0, lambda u, v, L: shade(st, L))
        fill_shape(cv, x0 + 2.0, 7.5, 1.0, 1.0, lambda u, v, L: shade(st, L + 0.15))
    cv.outline()
    s = cv.s
    for j in range(cv.ph):
        y = (j + 0.5) / s
        if 6.0 <= y < 10.0:
            continue
        d = (5.5 - y) if y < 6 else (y - 9.5)
        for i in range(2 * s, (W - 2) * s):
            if cv.p[i, j][3]:
                continue
            x = (i + 0.5) / s
            wire = (i + j) % (4 * s) == 0 or (i - j) % (4 * s) == 0
            knot = (i + j) % (4 * s) == 0 and (i - j) % (4 * s) == 0
            if knot:
                cv.p[i, j] = alpha(lt(st[3], 0.2), int(250 - 30 * d))
            elif wire:
                cv.p[i, j] = alpha(st[3], int(225 - 30 * d))
            else:
                cv.p[i, j] = alpha(OUTLINE, int(60 - 9 * d))
    return cv


# --------------------------------------------------------------------------
# Shop fronts of the street: what shows behind the lit display windows, and their small neon wall signs
# (same build as the bar's: a dark backing against the wall, 1 px tubes).
# --------------------------------------------------------------------------

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
    en = ramp('#dfe3e8', 0.42, 0.2, 0.4)
    rng = random.Random(191)
    fill_shape(cv, 12.0, 12.0, 11.0, 11.0, lambda u, v, L: shade(en, L), kind='rect', bevel=1.6, corner=1.4)
    mottle(cv, random.Random(1912), 3, 6)
    pn = ramp('#566070', 0.45, 0.22, 0.35)
    fill_shape(cv, 12.0, 3.8, 10.4, 2.4, lambda u, v, L: shade(pn, L), kind='rect', bevel=0.9, corner=0.6)   # console
    frect(cv, 1.6, 6.2, 22.4, 6.7, lambda c: dk(en[1], 0.2))           # its shadow on the top
    knob(cv, 4.4, 3.8, 1.4, '#e8ecf2', -0.6, hx('#2a2e38'))            # the cycle knob
    fill_shape(cv, 9.0, 3.8, 1.6, 1.4, lambda u, v, L: hx('#1a1e24'), kind='rect', corner=0.4)   # the timer window
    line(cv, 8.2, 3.8, 9.8, 3.8, hx('#f0a830'))
    cv.dot(11.5, 3.0, hx('#3aff8a'))                                   # ready
    cv.dot(11.5, 4.5, hx('#2a4a30'))
    chrome_bar(cv, 14.0, 2.4, 21.0, 5.2)                               # the coin slide
    for x in (15.2, 17.2, 19.2):
        frect(cv, x, 3.4, x + 1.0, 4.2, hx('#2a2a34'))                 # its coin slots
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
        ly.dot(20.0, 16.4, hx('#ffffff'))
    layer(cv, powder)
    for _ in range(6):
        cv.dot(rng.uniform(17.5, 22.0), rng.uniform(18.5, 22.0), hx('#f4f6fc'))
    return cv


# 7 px tall capitals, one tube wide
FONT_SHOP = {
    'L': ["#....", "#....", "#....", "#....", "#....", "#....", "#####"],
    'I': ["#", "#", "#", "#", "#", "#", "#"],
    'Q': [".###.", "#...#", "#...#", "#...#", "#.#.#", "#..#.", ".##.#"],
    'U': ["#...#", "#...#", "#...#", "#...#", "#...#", "#...#", ".###."],
    'O': [".###.", "#...#", "#...#", "#...#", "#...#", "#...#", ".###."],
    'R': ["####.", "#...#", "#...#", "####.", "#.#..", "#..#.", "#...#"],
    'V': ["#...#", "#...#", "#...#", "#...#", ".#.#.", ".#.#.", "..#.."],
    'D': ["####.", "#...#", "#...#", "#...#", "#...#", "#...#", "####."],
    'E': ["#####", "#....", "#....", "####.", "#....", "#....", "#####"],
    'W': ["#...#", "#...#", "#...#", "#.#.#", "#.#.#", "##.##", "#...#"],
    'A': [".###.", "#...#", "#...#", "#####", "#...#", "#...#", "#...#"],
    'S': [".####", "#....", "#....", ".###.", "....#", "....#", "####."],
    'H': ["#...#", "#...#", "#...#", "#####", "#...#", "#...#", "#...#"],
    '2': [".###.", "#...#", "....#", "...#.", "..#..", ".#...", "#####"],
    '4': ["...#.", "..##.", ".#.#.", "#..#.", "#####", "...#.", "...#."],
    'M': ["#...#", "##.##", "#.#.#", "#.#.#", "#...#", "#...#", "#...#"],
    'G': [".####", "#....", "#....", "#.###", "#...#", "#...#", ".###."],
    'N': ["#...#", "##..#", "#.#.#", "#.#.#", "#..##", "#...#", "#...#"],
    'P': ["####.", "#...#", "#...#", "####.", "#....", "#....", "#...."],
}
NEON_GREEN, NEON_AMBER, NEON_YELLOW = hx('#3aff8a'), hx('#ffa62a'), hx('#f9c80e')


def neon_text(ne, x, y, text, col):
    """Writes `text` in tubes from (x, y); returns the x where the next word would start."""
    for ch in text:
        for gy, row in enumerate(FONT_SHOP[ch]):
            for gx, c in enumerate(row):
                if c == '#':
                    ne.dot(x + gx, y + gy, col)
        x += len(FONT_SHOP[ch][0]) + 1
    return x


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


def p_fuse_box():
    """The house's fuse box on an outside wall (-y), from above: the conduit along the wall and its clips, a grey steel
    cabinet with its rain hood, the seam of its two doors and their hinges, a yellow hazard plate, the meter's round
    window, the red handle of the main switch, a padlock, rust weeping from the hood."""
    cv = Cv(26, 11)
    frect(cv, 0, 0, 26, 1.5, hx('#4a4e58'))                            # the conduit along the wall
    frect(cv, 0, 0, 26, 0.5, hx('#6e737e'))
    for x in (2.0, 23.0):
        frect(cv, x, 0, x + 1.0, 1.5, hx('#8a909c'))
    st = ramp('#8a909c', 0.45, 0.22, 0.4)
    fill_shape(cv, 13.0, 5.4, 9.0, 3.6, lambda u, v, L: shade(st, L), kind='rect', bevel=0.8, corner=0.5)
    frect(cv, 4.0, 1.8, 22.0, 2.6, st[3])                              # its rain hood
    frect(cv, 4.0, 2.6, 22.0, 3.0, st[0])
    frect(cv, 12.75, 3.0, 13.25, 8.8, hx('#4e535e'))                   # the doors' seam
    for x in (4.5, 21.0):
        frect(cv, x, 3.5, x + 0.5, 8.5, hx('#5e636e'))                 # their hinges
    fill_shape(cv, 8.0, 5.8, 2.4, 1.8, lambda u, v, L: hx('#f0c81e'), kind='rect', corner=0.2)   # hazard plate
    for (x, y) in ((8.5, 4.5), (8.0, 5.0), (7.5, 5.5), (8.0, 5.5), (8.5, 5.5), (8.0, 6.0), (7.5, 6.5)):
        cv.dot(x, y, hx('#2a2410'))                                    # its bolt
    ring(cv, 15.4, 5.6, 1.1, 1.5, lambda dx, dy, d: shade(CHROME, light(dx / d, dy / d)))   # the meter's window
    fill_shape(cv, 15.4, 5.6, 1.1, 1.1, lambda u, v, L: hx('#cfe8f4') if u + v < -0.5 else hx('#7aa8c0'))
    line(cv, 15.4, 5.6, 16.0, 5.0, hx('#c02020'))
    fill_shape(cv, 19.0, 5.6, 1.4, 1.8, lambda u, v, L: shade(ramp('#c2281e', 0.45, 0.22, 0.4), L), kind='rect', corner=0.4)   # main switch
    fill_shape(cv, 13.0, 8.4, 0.7, 0.6, lambda u, v, L: shade(ramp('#c8a050', 0.45, 0.22, 0.4), L), kind='rect', corner=0.3)   # padlock
    smudge(cv, random.Random(5015), 4, (5, 3, 21, 9), (0.5, 1.2), 0.5, hx('#7a3e1a'))
    cv.outline()
    return cv


def p_emergency_light():
    """A small battery lamp on a wall (-y): a dark case and one red lens, dull until the mains fail (the user wanted a
    single discreet one, not two heads)."""
    cv, gl = Cv(8, 5), Cv(8, 5)
    case = ramp('#4a4650', 0.45, 0.22, 0.35)
    fill_shape(cv, 4.0, 1.6, 3.2, 1.4, lambda u, v, L: shade(case, L), kind='rect', corner=0.5, bevel=0.5)
    fill_shape(cv, 4.0, 3.2, 1.3, 1.1, lambda u, v, L: hx('#9a3a30') if L > 0.6 else hx('#6a221c'))
    cv.dot(3.6, 2.9, hx('#c86a5a'))
    fill_shape(gl, 4.0, 3.2, 1.5, 1.3, lambda u, v, L: (255, 110, 80, 190))
    fill_shape(gl, 4.0, 3.2, 0.6, 0.6, lambda u, v, L: (255, 220, 200, 255))
    cv.outline()
    return cv, gl


def p_cash_case():
    """The boss's attache case lying open, its lid thrown back (-y): the lid's red lining and elastic pocket, the brass
    hinges, banded wads of notes in two rows in the black shell, the chrome latches and the handle at +y."""
    cv = Cv(22, 16)
    shell = ramp('#26262e', 0.45, 0.22, 0.4)
    fill_shape(cv, 11.0, 3.6, 10.0, 2.6, lambda u, v, L: shade(shell, L), kind='rect', bevel=0.8, corner=0.8)   # the lid
    fill_shape(cv, 11.0, 3.6, 9.0, 1.8, lambda u, v, L: shade(ramp('#6a1e2a', 0.45, 0.22, 0.3), 1.0 - L * 0.6), kind='rect', corner=0.4)
    dash(cv, 3.0, 3.4, 19.0, 3.4, hx('#8a3040'), 1, 1)                 # the pocket's elastic
    frect(cv, 1.0, 6.2, 21.0, 6.8, hx('#0e0e12'))                      # the hinge line
    for x in (4.0, 16.0):
        frect(cv, x, 6.0, x + 2.0, 7.0, hx('#c8a050'))
        frect(cv, x, 6.0, x + 2.0, 6.5, hx('#f0d080'))
    fill_shape(cv, 11.0, 10.9, 10.0, 4.1, lambda u, v, L: shade(shell, L), kind='rect', bevel=0.8, corner=0.8)
    frect(cv, 2.0, 7.6, 20.0, 14.0, hx('#121216'))
    note = ramp('#6a9a5a', 0.45, 0.22, 0.3)
    for i, x in enumerate((2.4, 8.4, 14.4)):
        for j, y in enumerate((7.8, 11.0)):
            def wad(px, py, c, x=x, y=y):
                t = (py - y) / 2.8
                col = shade(note, 0.82 - t * 0.5)
                if int(py * 2) % 2 and px > x + 4.6:
                    col = dk(col, 0.15)                                # the edges of the notes
                if x + 2.2 <= px < x + 3.2:
                    col = hx('#f2ead0') if t < 0.6 else hx('#c8c0a4')  # the paper band
                return col
            px_paint(cv, x, y, x + 5.2, y + 2.8, wad)
            cv.dot(x + 2.5, y + 1.0, hx('#8a6a3a'))
    for x in (5.0, 15.5):                                              # latches
        chrome_bar(cv, x, 14.2, x + 1.5, 15.0)
    fill_capsule(cv, [(9.0, 15.0), (13.0, 15.0)], 0.5, lambda k, L, s, i, t: shade(RUBBER, L))   # the handle
    cv.outline()
    return cv


def p_ceiling_fan():
    """Ceiling fan from above: four dark wood paddles on brass irons, the motor housing with its cap, see-through enough
    to read who stands under it (the game spins it)."""
    cv, hub = Cv(44, 44), Cv(44, 44)
    wood = (hx('#2c2228', 200), hx('#3a2c30', 205), hx('#a8927a', 215))   # dark varnish: it has to read on a wooden floor
    c = 22.0
    for k in range(4):
        a = k * math.pi / 2

        def blade(u, v, L):
            col = wood[2] if v < -1.45 else wood[1] if L > 0.6 else wood[0]   # the leading edge catches the light
            return col
        bx, by = c + math.cos(a) * 13.0, c + math.sin(a) * 13.0
        fill_shape(cv, bx, by, 8.0, 2.0, blade, ang=a, kind='rect', corner=1.6, bevel=0.6)
        fill_capsule(hub, [(c + math.cos(a) * 3.5, c + math.sin(a) * 3.5), (c + math.cos(a) * 7.5, c + math.sin(a) * 7.5)], 0.7,
                     lambda kk, L, s, i, t: shade(ramp('#c9a24a', 0.45, 0.22, 0.4), L))   # the blade iron
    fill_shape(hub, c, c, 4.4, 4.4, lambda u, v, L: shade(ramp('#3a3a46', 0.45, 0.22, 0.45), L))   # motor
    ring(hub, c, c, 3.0, 3.4, lambda dx, dy, d: hx('#24242c'))
    fill_shape(hub, c, c, 1.6, 1.6, lambda u, v, L: shade(ramp('#c9a24a', 0.45, 0.22, 0.45), L))   # the brass cap
    hub.outline()
    cv.over(hub)
    return cv


def p_mirror_ball():
    """Mirror ball from above: rows of little square mirrors on a sphere, each catching the light its own way, the
    hot ones near the top left, the grout between them."""
    cv = Cv(12, 12)
    rng = random.Random(5090)

    jit_ = dict(((x, y), rng.uniform(-0.3, 0.3)) for x in range(12) for y in range(12))

    def ball(u, v, L):
        x, y = int(6.0 + u), int(6.0 + v)
        k = jit_[(x, y)]
        col = shade(ramp('#8892a6', 0.5, 0.25, 0.6), L + k)
        if ((6.0 + u) % 1.0) > 0.5 and ((6.0 + v) % 1.0) > 0.5:
            col = dk(col, 0.12)                                        # the grout at a mirror's corner
        return col
    fill_shape(cv, 6.0, 6.0, 5.0, 5.0, ball)
    for (x, y) in ((3.5, 3.5), (5.0, 2.5), (2.5, 5.5)):
        cv.dot(x, y, hx('#ffffff'))
    cv.outline()
    return cv


def p_extinguisher():
    """Wall extinguisher on its bracket (the wall at -y), from above: the strap, the red cylinder's domed top, the black
    valve head with its lever and the gauge, the pin's yellow tag, the hose down its side."""
    cv = Cv(8, 11)
    frect(cv, 1.0, 1.0, 7.0, 2.5, hx('#5a5a66'))                       # the bracket on the wall
    frect(cv, 1.0, 1.0, 7.0, 1.5, hx('#8a8a96'))
    red = ramp('#c0202a', 0.5, 0.25, 0.4)
    fill_shape(cv, 4.0, 6.4, 3.0, 3.6, lambda u, v, L: shade(red, L))
    frect(cv, 1.0, 5.6, 7.0, 6.1, lambda c: dk(c, 0.2) if c[3] else None)   # the strap round it
    fill_shape(cv, 3.6, 6.0, 1.3, 1.1, lambda u, v, L: shade(ramp('#26242c', 0.45, 0.22, 0.5), L), kind='rect', corner=0.4)   # valve head
    fill_capsule(cv, [(3.6, 6.0), (3.6, 9.4)], 0.42, lambda k, L, s, i, t: shade(ramp('#3a3844', 0.45, 0.22, 0.5), L))   # its lever
    cv.dot(2.75, 5.25, hx('#f4f4ec'))                                  # the gauge
    cv.dot(3.0, 5.5, hx('#3aa85a'))
    cv.dot(4.75, 5.5, hx('#f2c81e'))                                   # the pin's tag
    fill_capsule(cv, [(4.8, 6.6), (6.0, 7.4), (6.4, 9.6)], 0.4, lambda k, L, s, i, t: shade(RUBBER, L))   # the hose
    cv.outline()
    return cv


def p_vending():
    """Street drinks machine from above, its lit front along +y: a dull red top dented and stickered, its vents, the
    logo's stripe, the glowing panel with the cans behind it and the buttons."""
    cv = Cv(28, 22)
    red = ramp('#7a2630', 0.45, 0.22, 0.25)

    def top(x, y, c):
        col = shade(red, 0.62 - (y - 1) / 15 * 0.2 + (0.18 if y < 2.5 else 0.0))
        if 3 < y < 5:
            col = lt(col, 0.1)                                         # what the street lamp leaves on it
        return col
    px_paint(cv, 1, 1, 27, 17, top)
    frect(cv, 1, 1, 27, 1.5, red[0])
    fill_shape(cv, 8.0, 9.5, 4.0, 2.6, lambda u, v, L: shade(red, 1.0 - L * 0.8), kind='rect', corner=0.6, bevel=0.8)   # a sunken panel
    for x in (17, 19, 21, 23):
        frect(cv, x, 7, x + 1, 12, dk(red[0], 0.25))                   # vents, lit on their lip
        frect(cv, x, 7, x + 1, 7.5, lt(red[2], 0.2))
    frect(cv, 3, 14.5, 25, 16, hx('#f2ece0'))                         # the logo's stripe over the front
    frect(cv, 5, 15, 13, 15.5, hx('#c81e28'))
    frect(cv, 14, 15, 17, 15.5, hx('#2a2a30'))
    fill_shape(cv, 22.0, 9.0, 1.4, 1.0, lambda u, v, L: hx('#f9c80e'), ang=0.3, kind='rect', corner=0.2)   # a sticker
    smudge(cv, random.Random(4991), 4, (2, 2, 26, 13), (1.0, 2.2), 0.18)
    stud(cv, 2.0, 2.5, red[1])
    stud(cv, 25.5, 2.5, red[1])

    def front(x, y, c):
        col = hx('#f2f6ff') if y < 17.5 or y >= 20.5 else hx('#dce6f4')
        u = x - 2.0
        if 17.5 <= y < 20.5 and 0 <= u < 23 and u % 2.5 < 1.5:
            col = (hx('#ff5a6a'), hx('#58d8f0'), hx('#ffd84a'))[int(u // 7.5) % 3]   # the cans, three brands
            if y < 18.0:
                col = lt(col, 0.4)
        return col
    px_paint(cv, 1, 17, 27, 21, front)
    cv.outline()
    return cv


def p_phone_booth():
    """Phone booth from above, open along +y: steel frame, a tinted glass roof the phone shows through, a lit header,
    the receiver on its hook, the directory hanging on its chain."""
    cv, fr = Cv(26, 26), Cv(26, 26)
    steel = ramp('#5a6270', 0.45, 0.22, 0.4)
    frect(cv, 2, 2, 24, 24, hx('#8fd0e6', 70))
    for i in range(4, 21):                          # a glint across the glass
        cv.dot(i + 0.5, 24.5 - i, hx('#eaf8ff', 120))
        cv.dot(i + 1.0, 24.5 - i, hx('#eaf8ff', 60))

    def frame(x, y, c):
        edge = min(x - 1, y - 1, 25 - x)
        return steel[3] if edge < 0.5 and (x < 1.5 or y < 1.5) else steel[2] if edge < 1.0 else steel[1]
    for (x0, y0, x1, y1) in ((1, 1, 25, 3), (1, 1, 3, 25), (23, 1, 25, 25), (1, 23, 5, 25), (21, 23, 25, 25)):
        px_paint(fr, x0, y0, x1, y1, frame)
    frect(fr, 3, 3, 23, 5, hx('#dff4ff'))           # lit header
    frect(fr, 3, 4.5, 23, 5, hx('#a8d8f0'))
    fill_shape(fr, 11.5, 7.5, 3.6, 2.6, lambda u, v, L: shade(ramp('#343a46', 0.45, 0.22, 0.4), L), kind='rect', corner=0.6, bevel=0.8)   # the phone
    for k in range(9):                              # its keys
        fr.dot(9.5 + (k % 3) * 1.0, 6.5 + (k // 3) * 1.0, hx('#c8ccd8') if k != 4 else hx('#f0f2f8'))
    fill_capsule(fr, [(13.6, 6.0), (13.6, 9.4)], 0.6, lambda k, L, s, i, t: shade(ramp('#2a2e38', 0.4, 0.2, 0.5), L))   # the receiver
    fr.dot(14.5, 6.0, hx('#f9c80e'))                # coin slot
    fill_shape(fr, 5.4, 12.0, 1.2, 2.4, lambda u, v, L: hx('#f0e080') if L > 0.6 else hx('#c8b860'), kind='rect', corner=0.3, bevel=0.5)   # the directory
    line(fr, 5.4, 9.6, 6.2, 5.0, hx('#9aa0ac'))     # its chain
    fr.outline()
    cv.over(fr)
    return cv


def p_parking_meter():
    """Parking meter head from above: a grey cast dome, its window with the red EXPIRED flag up, the coin slot."""
    cv = Cv(7, 8)
    fill_shape(cv, 3.5, 3.8, 2.6, 2.9, lambda u, v, L: shade(ramp('#8a909c', 0.5, 0.25, 0.45), L), kind='rect', bevel=1.2, corner=1.2)
    frect(cv, 2.0, 2.5, 5.0, 4.5, hx('#1c2028'))                       # the window
    frect(cv, 2.0, 2.5, 5.0, 3.0, hx('#5a7a8a'))
    frect(cv, 3.0, 3.0, 4.5, 4.0, hx('#e03030'))                       # the flag
    frect(cv, 3.0, 3.0, 4.5, 3.5, hx('#ff7060'))
    frect(cv, 2.5, 5.5, 4.5, 6.0, hx('#2a2e36'))                       # the coin slot
    cv.outline()
    return cv


def p_news_box():
    """Newspaper box from above: blue steel, the front page under its window (front along +y), the coin slot, the
    hinge of the lid, chipped paint and stickers."""
    cv = Cv(16, 13)
    blue = ramp('#2a5aa8', 0.45, 0.22, 0.35)

    def box(x, y, c):
        return shade(blue, 0.85 if y < 2.0 else 0.38 if y >= 10.5 else 0.62)
    px_paint(cv, 1, 1, 15, 12, box)
    frect(cv, 1, 2.5, 15, 3, dk(blue[1], 0.2))                         # the lid's hinge
    for x in (3.0, 12.5):
        frect(cv, x, 2.5, x + 0.5, 3, blue[3])

    def paper(x, y, c):
        if y < 4.5 or y >= 9.0 or x < 3.0 or x >= 13.0:
            return hx('#2a3a5a')                                       # the window's frame
        col = hx('#ece8dc')
        if 5.0 <= y < 6.0 and 3.5 <= x < 12.0:
            col = hx('#2a2a30')                                        # the headline
        elif 6.5 <= y < 8.5 and 3.5 <= x < 6.5:
            col = hx('#8a8a90') if int(y * 2) % 2 else hx('#b8b4a8')   # a photograph
        elif 6.5 <= y < 8.5 and x >= 7.0 and int(y * 2) % 2 == 0:
            col = hx('#a8a8b0')                                        # its columns
        return col
    px_paint(cv, 2.5, 4, 13.5, 9.5, paper)
    for i in range(3, 13):
        cv.bpx(i * 2 + 4, 9, (255, 255, 255, 50))                      # the glass catching the light
    fill_shape(cv, 13.4, 10.8, 0.6, 0.4, lambda u, v, L: hx('#d8d8e0'), kind='rect', corner=0.1)   # coin slot
    smudge(cv, random.Random(5101), 4, (1, 1, 15, 12), (0.4, 0.9), 0.6, hx('#9aa0ac'))   # chipped to the steel
    fill_shape(cv, 3.0, 1.7, 1.0, 0.5, lambda u, v, L: hx('#f9c80e'), kind='rect', corner=0.1)   # a sticker
    cv.outline()
    return cv


def pipe(body, lite, shade_, band):
    """A run of pipe along a wall (the wall at -y): a round tube lit along its top, clamps bolted into the wall, two
    flanges with their bolts, painted bands, rust and drips from the joints."""
    def make():
        cv = Cv(96, 6)
        tube = (hx(shade_), mix(hx(shade_), hx(body), 0.5), hx(body), hx(lite))

        def f(x, y, c):
            t = (y - 2.0) / 3.0
            col = shade(tube, 0.95 - t * 0.85)
            if 0.12 < t < 0.3:
                col = lt(tube[3], 0.15)
            return col
        px_paint(cv, 0, 2, 96, 5, f)
        for x in (10.0, 47.0, 84.0):                                    # clamps into the wall
            frect(cv, x, 0.5, x + 2.0, 5.5, hx('#3a3a44'))
            frect(cv, x, 0.5, x + 2.0, 1.0, hx('#6a6a76'))
            stud(cv, x + 0.5, 1.0, hx('#8a8a96'))
        for x in (30.0, 66.0):                                          # flanges and painted bands
            frect(cv, x, 1.0, x + 1.5, 5.5, hx(band))
            frect(cv, x, 1.0, x + 0.5, 5.5, lt(hx(band), 0.2))
            for y in (1.5, 4.5):
                stud(cv, x + 0.5, y, dk(hx(band), 0.3))
        smudge(cv, random.Random(len(body) + ord(body[1])), 10, (0, 2, 96, 5), (0.6, 1.6), 0.4, hx('#7a3e1a'))
        cv.outline()
        return cv
    return make


def p_wall_vent():
    """Extractor outlet on a wall (the wall at -y): a steel box, its louvres each lit on the lip, the screws, soot
    blown out over it."""
    cv = Cv(16, 7)
    st = ramp('#6a707c', 0.45, 0.22, 0.4)
    fill_shape(cv, 8.0, 3.0, 7.0, 2.0, lambda u, v, L: shade(st, L), kind='rect', bevel=0.7, corner=0.4)
    for x in range(3, 13, 2):
        frect(cv, x, 2.0, x + 1.0, 4.5, hx('#1c2028'))
        frect(cv, x, 2.0, x + 1.0, 2.5, lt(st[3], 0.1))
    for x in (1.5, 14.0):
        stud(cv, x, 2.5, st[1])
    smudge(cv, random.Random(5249), 4, (2, 1, 14, 5), (1.0, 2.0), 0.25)   # soot
    cv.outline()
    return cv


def p_manhole():
    """Manhole cover, painted on the road: cast iron worn smooth on its raised diamond pattern, the frame round it, two
    pick holes, the city's ring of letters, rust in the hollows."""
    cv = Cv(16, 16)
    iron = ramp('#30323a', 0.45, 0.22, 0.35)
    rng = random.Random(5260)
    c = 7.5

    def disc(x, y, col):
        dx, dy = x - c - 0.5, y - c - 0.5
        d = math.hypot(dx, dy)
        if d >= 7.4:
            return None
        if d > 6.4:
            return shade(iron, 0.3 + 0.5 * light(dx / d, dy / d)) if d > 6.9 else hx('#0e1014')   # frame, the gap
        if 5.0 < d <= 5.8:
            return dk(iron[1], 0.1) if int(math.atan2(dy, dx) * 9) % 3 else lt(iron[2], 0.1)   # the letters
        u, v = (dx + dy) * 0.7071, (dx - dy) * 0.7071
        if (u % 2.2 < 0.75) or (v % 2.2 < 0.75):
            return lt(iron[2], 0.1) if dx + dy < 0 else iron[2]        # raised diamond ribs, worn shiny
        return dk(iron[2], 0.18)
    px_paint(cv, 0, 0, 16, 16, disc)
    for (x, y) in ((5.0, 7.5), (10.0, 7.5)):
        fill_shape(cv, x + 0.5, y + 0.5, 0.6, 0.4, lambda u, v, L: hx('#08090c'), kind='rect', corner=0.2)   # pick holes
    smudge(cv, rng, 3, (2, 2, 14, 14), (0.6, 1.2), 0.3, hx('#6a3a1c'))
    return cv


def p_cardboard_bed():
    """Flattened cardboard boxes someone sleeps on, painted on the ground: kraft board with the corrugation showing
    through, the folds of the flaps, a printed logo half gone, brown tape, water stains and torn corners."""
    W, H = 36, 20
    cv = Cv(W, H)
    rng = random.Random(77)
    base = ramp('#a5855a', 0.4, 0.2, 0.25)
    nz = VNoise(W, H, 4, rng)

    def board(x, y, c):
        col = shade(base, 0.6 + (nz(x, y) - 0.5) * 0.3)
        if int(y * 2) % 3 == 0:
            col = shift(col, -4)                                       # the flutes under the liner
        if x < 18 and 1 <= y < 10 and x > 0.5:
            col = shift(col, 6)                                        # one box lighter than the other
        return col
    px_paint(cv, 0.5, 0.5, W - 0.5, H - 0.5, board)
    for x in (12.0, 24.5):                                             # where the flaps fold
        crease(cv, [(x, 1.0), (x + 0.3, H - 1.0)], 0.2)
    crease(cv, [(1.0, 10.0), (W - 1.0, 10.3)], 0.14)                   # the seam between two boxes
    for (x0, y0, x1, y1) in ((14.0, 4.0, 22.0, 5.5), (2.0, 13.0, 8.0, 14.0)):
        frect(cv, x0, y0, x1, y1, lambda c: mix(c, hx('#7a5a30'), 0.6))   # tape
        frect(cv, x0, y0, x1, y0 + 0.5, lambda c: lt(c, 0.12))
    for (x, y) in ((28.0, 4.0), (29.5, 4.0), (31.0, 4.0), (28.0, 5.5), (31.0, 5.5)):
        frect(cv, x, y, x + 1.0, y + 0.5, lambda c: mix(c, hx('#2a3a6a'), 0.45))   # what is left of a logo
    smudge(cv, rng, 4, (2, 2, 34, 18), (2.0, 4.0), 0.22)                # water stains
    smudge(cv, rng, 3, (2, 2, 34, 18), (1.0, 2.0), 0.2, hx('#5a4430'))
    bevel_edges(cv, 0, 0, W - 1, H - 1, 0.1, 0.3)
    for (x0, y0, x1, y1) in ((0, 0, 2, 1), (0, 1, 1, 2), (W - 2, H - 1, W, H), (W - 1, H - 2, W, H - 1), (W - 1, 0, W, 1),
                             (20, H - 0.5, 23, H)):
        frect(cv, x0, y0, x1, y1, CLEAR)                               # torn corners
    return cv


def flipped_table(W, wood, leg, face=None, feet=4):
    """A table tipped on its side, seen from above: its top on edge along -y (a sliver of its upper face on the outside,
    the thickness of the board with its end grain), the apron and the legs lying on the floor behind it with their
    turnings and brackets (or the one pedestal and its round foot)."""
    def paint():
        H = 27
        cv = Cv(W, H)
        base, lg = hx(wood), ramp(leg, 0.45, 0.22, 0.35)
        rng = random.Random(W * 7 + feet)
        if face:
            frect(cv, 1, 1, W - 1, 3, lambda c: hx(face))              # the felt, seen past the rail
            frect(cv, 1, 1, W - 1, 1.5, lt(hx(face), 0.2))
            dash(cv, 1.5, 2.5, W - 1.5, 2.5, dk(hx(face), 0.25), 1, 1)
        else:
            wood_fill(cv, 1, 1, W - 2, 2, lt(base, 0.2), plank=9, rng=rng)   # the varnished top, a sliver of it
            frect(cv, 1, 1, W - 1, 1.5, lt(base, 0.4))
        wood_fill(cv, 1, 3, W - 2, 6, base, plank=9, rng=rng)            # the board's thickness, on edge
        frect(cv, 1, 3, W - 1, 3.5, lt(base, 0.18))
        frect(cv, 1, 6, W - 1, 7, dk(base, 0.38))
        px_paint(cv, 1, 3.5, W - 1, 6, lambda x, y, c: dk(c, 0.12) if int(x * 2) % 5 == 0 else None)   # end grain
        smudge(cv, rng, 4, (2, 2, W - 2, 6), (0.8, 1.6), 0.25, hx('#e0c49a'))   # knocks through the varnish
        frect(cv, 1, 1, 2, 2, CLEAR)
        frect(cv, W - 2, 1, W - 1, 2, CLEAR)

        def post(pts, r):
            fill_capsule(cv, pts, r, lambda k, L, s, i, t: (dk(lg[1], 0.2) if 0.08 < t < 0.12 or 0.86 < t < 0.9 else shade(lg, L))
                         if t < 0.94 else shade(ramp('#9aa0ac', 0.45, 0.22, 0.4), L))   # turned rings, a steel foot
        if feet == 4:
            frect(cv, 6, 7, W - 6, 8.5, dk(base, 0.22))                # the apron under the top
            frect(cv, 6, 8, W - 6, 8.5, dk(base, 0.4))
            for x0 in (5.5, W - 5.5):
                post([(x0, 7.0), (x0, H - 2.4)], 1.35)
                frect(cv, x0 - 2.5, 7.0, x0 + 2.5, 9.0, hx('#5a5e68'))  # the corner bracket
                stud(cv, x0 - 1.5, 7.5, hx('#9aa0ac'))
                stud(cv, x0 + 1.0, 7.5, hx('#9aa0ac'))
        else:
            c = W / 2
            post([(c, 7.0), (c, H - 5.5)], 1.7)
            fill_shape(cv, c, H - 3.8, 7.0, 1.6, lambda u, v, L: shade(lg, L), kind='rect', corner=1.2, bevel=0.8)   # its foot, on edge
        cv.outline()
        return cv
    return paint


def p_ladder():
    """A fixed steel ladder filling its gap in a wall, seen from above: two round rails along the climb (y), rungs
    across with their welds, hand hoops at both ends; its shadow falls to the lower right, as off something that stands
    clear of the floor. Pale: it must be seen in the dark."""
    cv = Cv(32, 32)
    tube = ramp('#aab2c6', 0.45, 0.22, 0.4)
    sh = (8, 6, 16, 110)

    def paint(ly, shadow, dx=0.0, dy=0.0):
        col = (lambda k, L, s, i, t: sh) if shadow else (lambda k, L, s, i, t: lt(tube[3], 0.3) if L > 0.92 else shade(tube, L))
        for x0 in (7.5, 23.5):
            fill_capsule(ly, [(x0 + dx, 2.5 + dy), (x0 + dx, 29.5 + dy)], 1.3, col)
        for y in range(4, 29, 4):
            fill_capsule(ly, [(8.8 + dx, y + 0.5 + dy), (22.2 + dx, y + 0.5 + dy)], 0.75, col)
        for y0 in (1.2, 30.4):
            fill_capsule(ly, [(5.5 + dx, y0 + dy), (25.5 + dx, y0 + dy)], 0.7, col)
    shadow = Cv(32, 32)
    paint(shadow, True, 2.0, 2.0)
    cv.over(shadow)
    rails = Cv(32, 32)
    paint(rails, False)
    for y in range(4, 29, 4):
        for x0 in (8.6, 22.0):
            stud(rails, x0, y + 0.25, tube[1])                         # the welds
    smudge(rails, random.Random(5334), 6, (6, 2, 26, 30), (0.4, 0.9), 0.4, hx('#8a5a3a'))   # rust where the paint went
    cv.over(rails)
    return cv


def p_parapet():
    """The low wall at the edge of a roof where one can swing a leg over: concrete coping slabs on a course of brick,
    their joints, a crack, lichen, worn pale in the middle by everybody who has."""
    cv = Cv(34, 12)
    rng = random.Random(77)
    stone = ramp('#b0aaa0', 0.45, 0.22, 0.3)
    brick = hx('#7a4a40')
    nz = VNoise(34, 12, 2, rng)

    def course(x, y, c):
        k = int((x + (0.0 if y < 6 else 2.0)) / 4.0)
        col = shift(dk(brick, 0.1), [-6, 3, -2, 6, 0, -4, 4, -1, 2, 5][k % 10])
        if (x + (0.0 if y < 6 else 2.0)) % 4.0 < 0.5:
            col = hx('#5a5048')                                        # mortar
        return col
    px_paint(cv, 1, 1, 33, 2, course)
    px_paint(cv, 1, 10, 33, 11, course)

    def coping(x, y, c):
        col = shade(stone, 0.62 + (nz(x, y) - 0.5) * 0.18)
        if y < 2.5:
            col = shade(stone, 0.95)                                   # the rounded lip, lit
        elif y >= 9.5:
            col = shade(stone, 0.25)
        if abs(x - 17) < 6 and 3 <= y < 9:
            col = lt(col, 0.07 * (1 - abs(x - 17) / 6))                # worn pale
        return col
    px_paint(cv, 1, 2, 33, 10, coping)
    for x in (11.0, 22.5):                                             # the slabs' joints
        frect(cv, x, 2, x + 0.5, 10, dk(stone[1], 0.25))
        frect(cv, x + 0.5, 2, x + 1.0, 10, lt(stone[2], 0.1))
    line(cv, 26.0, 3.0, 27.5, 6.0, dk(stone[1], 0.2))                  # a crack
    line(cv, 27.5, 6.0, 27.0, 8.5, dk(stone[1], 0.2))
    smudge(cv, rng, 4, (2, 3, 32, 9), (0.6, 1.2), 0.45, hx('#8a9a5a'))   # lichen
    smudge(cv, rng, 3, (2, 3, 32, 9), (1.0, 2.0), 0.15)
    cv.outline()
    return cv


def p_urinal():
    """A wall urinal from above (the wall at -y): its back against the wall with the chrome flush valve, the bowl
    open toward the room, the drain and its cake, a ring of scale."""
    cv = Cv(14, 12)
    wh = ramp('#ecebf0', 0.4, 0.18, 0.2)

    def body(ly):
        fill_shape(ly, 7.0, 3.2, 5.6, 2.2, lambda u, v, L: shade(wh, L), kind='rect', bevel=1.2, corner=1.0)
        fill_shape(ly, 7.0, 6.0, 4.6, 4.4, lambda u, v, L: lt(wh[3], 0.2) if L > 0.97 else shade(wh, L))
        fill_shape(ly, 7.0, 6.2, 2.8, 2.8, lambda u, v, L: shade(ramp('#dcd8c8', 0.4, 0.2, 0.2), 1.1 - L * 0.7))
        ring(ly, 7.0, 6.4, 2.2, 2.8, lambda dx, dy, d: hx('#c8bc98') if dy > 0 else None)    # the scale
        fill_shape(ly, 7.0, 7.2, 1.0, 0.8, lambda u, v, L: hx('#5a8a6a') if L > 0.5 else hx('#3a6a4a'))   # the cake
        for (x, y) in ((6.0, 8.0), (7.0, 8.2), (8.0, 8.0)):
            ly.dot(x, y, hx('#4a4a52'))                                 # the drain's slots
        fill_shape(ly, 7.0, 1.8, 1.0, 0.8, lambda u, v, L: hx('#f4f6fc') if L > 0.7 else hx('#9aa0ac'))   # the flush valve
        ly.dot(7.0, 2.8, hx('#6a6e7a'))
    layer(cv, body)
    return cv


def p_stall():
    """A restroom stall's partition, from above (its length along y, the wall at -y): a laminate panel in the bar's
    sea-green, its top edge lit, the chrome bracket on the wall, a chrome foot under it in the middle and the pilaster
    shoe at its free end, a strip of floor showing under it (it stops short of the floor), names scratched in."""
    cv = Cv(6, 50)
    lam = ramp('#6f8f86', 0.45, 0.24, 0.32)

    def panel(x, y, c):
        if x < 1.6:
            return lt(lam[3], 0.1)                                      # the lit top edge
        if x >= 4.4:
            return lam[0]
        return shade(lam, 0.6 + (math.sin(y * 0.9) * 0.04))
    px_paint(cv, 1, 1, 5, 49, panel)
    for y in (1.0, 24.0, 47.0):                                         # bracket, foot, shoe
        frect(cv, 0.5, y, 5.5, y + 2.0, CHROME[2])
        frect(cv, 0.5, y + 1.5, 5.5, y + 2.0, CHROME[1])
        cv.dot(1.0, y + 0.5, CHROME[3])
    for (y, ln) in ((8.0, 3.0), (15.5, 2.0), (33.0, 3.5), (40.0, 1.5)):  # scratched names
        line(cv, 2.8, y, 3.1, y + ln, dk(lam[1], 0.2))
    cv.outline()
    return cv


def p_apt_door():
    """A neighbour's door, shut, from above (the wall at -y): the leaf in its frame, its veneer, a brass number plate
    with its two screws, the knob and its rose, the hinges."""
    cv = Cv(34, 8)
    frect(cv, 1, 1, 33, 7, hx('#2a2030'))
    wood_fill(cv, 3, 2, 30, 5, hx('#6a4426'), plank=8, rng=random.Random(4747))
    frect(cv, 3, 2, 31, 2.5, hx('#9a6a40'))                            # the leaf's top edge, lit
    frect(cv, 3, 5.5, 31, 6, hx('#3e2616'))
    for hx_ in (3.0, 30.5):
        frect(cv, hx_, 2.5, hx_ + 0.5, 5.5, hx('#241a20'))             # the gap in the frame
    for hy in (2.5, 4.5):
        frect(cv, 4.0, hy, 5.0, hy + 0.5, hx('#a8a8b4'))               # hinges
    fill_shape(cv, 16.5, 3.5, 2.0, 1.0, lambda u, v, L: shade(ramp('#d8a838', 0.45, 0.22, 0.45), L), kind='rect', corner=0.3, bevel=0.5)
    stud(cv, 15.0, 3.25, hx('#7a5a20'))
    stud(cv, 17.5, 3.25, hx('#7a5a20'))
    ring(cv, 27.0, 4.0, 0.6, 1.2, lambda dx, dy, d: hx('#c8ccd4') if dx + dy < 0 else hx('#7a7e8a'))   # the rose
    fill_shape(cv, 27.0, 4.0, 0.7, 0.7, lambda u, v, L: hx('#f0f2f8') if L > 0.7 else hx('#a8acb8'))   # the knob
    cv.outline()
    return cv


def p_doormat():
    """A coir doormat: stiff fibres in short tufts, a darker woven border, worn flat and dirty in the middle."""
    cv = Cv(26, 14)
    rng = random.Random(77)
    coir = ramp('#8a7448', 0.45, 0.22, 0.3)

    def mat(x, y, c):
        border = x < 3 or x >= 23 or y < 3 or y >= 11
        t = rng.random()
        col = shade(coir, 0.44 if t < 0.25 else 0.56 if t < 0.7 else 0.68)
        if border:
            col = dk(col, 0.3) if (int(x * 2) + int(y * 2)) % 2 else dk(col, 0.22)   # the woven edge
        elif abs(x - 13) < 6 and abs(y - 7) < 3:
            col = mix(col, hx('#5a4a32'), 0.4)                         # trodden in
        return col
    px_paint(cv, 1, 1, 25, 13, mat)
    smudge(cv, rng, 3, (6, 4, 20, 10), (1.0, 2.0), 0.2)
    cv.outline()
    return cv


def p_stairs():
    """A flight of stairs going down (toward -y), from above: concrete treads, darker and darker, each with its lit
    steel nosing and a rubber strip, worn in the middle, grime in the corners, a steel rail each side on its posts."""
    W, H = 66, 46
    cv = Cv(W, H)
    st = ramp('#6e6c74', 0.5, 0.25, 0.3)
    n = 9
    rng = random.Random(5463)
    nz = VNoise(W, H, 3, rng)
    for i in range(n):
        y0 = 1 + i * (H - 2) / n
        y1 = 1 + (i + 1) * (H - 2) / n
        f = 1.0 - 0.72 * (n - 1 - i) / (n - 1)                          # the deeper, the darker

        def tread(x, y, c, y0=y0, y1=y1, f=f):
            t = (y - y0) / (y1 - y0)
            col = shade(st, 0.5 + (nz(x, y) - 0.5) * 0.25 - t * 0.12)
            if abs(x - W / 2) < 9:
                col = lt(col, 0.05)                                    # worn in the middle
            if x < 7 or x > W - 7:
                col = dk(col, 0.15)                                    # grime in the corners
            d = y - y0
            if d < 1.0:
                col = hx('#b8bcc8') if d < 0.5 else hx('#6a6e78')      # the steel nosing
            elif 1.5 < d < 2.0 and 6 < x < W - 6:
                col = hx('#2a2830')                                    # rubber strip
            elif y1 - y < 1.0:
                col = dk(col, 0.4)                                     # in the shadow of the step above
            return tuple(int(v * f) for v in col[:3]) + (255,)
        px_paint(cv, 4, y0, W - 4, y1, tread)
    for x in (1.0, W - 4.0):                                           # rails
        fill_capsule(cv, [(x + 1.5, 1.6), (x + 1.5, H - 1.6)], 1.3, lambda k, L, s, i, t: shade(ramp('#4a4654', 0.45, 0.22, 0.45), L))
        for y in (6.0, 23.0, 40.0):
            fill_shape(cv, x + 1.5, y, 1.5, 1.5, lambda u, v, L: shade(ramp('#3a3644', 0.45, 0.22, 0.45), L))   # posts
    cv.outline()
    return cv


def p_floor_hole():
    """Floorboards torn up over a hiding place: the dark hole with a joist running across it, splintered board ends with
    their pale torn fibres and bent nails, a tin box left open and empty beside it."""
    cv = Cv(30, 22)
    frect(cv, 2, 3, 20, 19, hx('#0c0810'))
    frect(cv, 3, 4, 19, 18, hx('#16101a'))
    fill_shape(cv, 11.0, 11.0, 8.0, 1.6, lambda u, v, L: shade(ramp('#3a2418', 0.45, 0.22, 0.35), L * 0.7), kind='rect', corner=0.4)   # a joist
    for x in range(4, 18, 3):
        cv.dot(x + 0.5, 6.0 + (x % 4), hx('#2a2428'))                  # dust and droppings
    rng = random.Random(5484)
    wood = ramp('#8a5a34', 0.45, 0.22, 0.3)
    for (x, y, w) in ((1, 1.5, 7), (9, 1.5, 5), (15, 2.5, 6), (1, 18.5, 5), (8, 18.0, 8), (17, 19.0, 4)):
        wood_fill(cv, x, int(y), x + w - 1, int(y) + 1, wood[2], plank=2, rng=rng)
        bevel_edges(cv, x, int(y), x + w - 1, int(y) + 1, 0.2, 0.3)
        for k in range(4):                                             # the splintered end
            ly = y + k * 0.5
            frect(cv, x + w, ly, x + w + rng.uniform(0.5, 1.5), ly + 0.5, hx('#e0bc80') if k % 2 else hx('#c89a60'))
        stud(cv, x + 1.0, y + 0.5, hx('#6a6a76'))                      # a nail
    st = ramp('#5a6470', 0.45, 0.22, 0.4)
    fill_shape(cv, 25.0, 11.5, 3.8, 3.8, lambda u, v, L: shade(st, L), kind='rect', corner=0.6, bevel=0.8)   # the tin
    fill_shape(cv, 25.0, 11.8, 3.0, 3.0, lambda u, v, L: shade(ramp('#2a3038', 0.4, 0.2, 0.3), 1.0 - L * 0.7), kind='rect', corner=0.4)
    fill_shape(cv, 25.0, 6.0, 3.8, 1.0, lambda u, v, L: shade(ramp('#8a94a0', 0.45, 0.22, 0.4), L), kind='rect', corner=0.4)   # its lid, back
    cv.dot(24.0, 12.5, hx('#3fa66a'))                                  # one note left behind
    cv.outline()
    return cv


def p_jerrycan():
    """A jerrycan on the floor, from above: red pressed steel, its three handles over the top, the spout's cap on its
    clamp, the pressed X, chipped paint and a run of fuel."""
    cv = Cv(11, 13)
    red = ramp('#c8281e', 0.5, 0.25, 0.3)
    fill_shape(cv, 5.5, 6.5, 4.5, 5.5, lambda u, v, L: shade(red, L), kind='rect', bevel=1.2, corner=0.8)
    for (a, b) in (((2.2, 5.0), (8.8, 11.4)), ((8.8, 5.0), (2.2, 11.4))):   # the pressed X
        line(cv, a[0], a[1], b[0], b[1], red[1])
        line(cv, a[0] - 0.5, a[1], b[0] - 0.5, b[1], lt(red[2], 0.2))
    for x in (3.0, 5.5, 8.0):                                          # the three handles
        fill_capsule(cv, [(x, 1.8), (x, 4.4)], 0.5, lambda k, L, s, i, t: shade(red, L + 0.1))
    frect(cv, 2.2, 1.5, 8.8, 2.0, red[0])
    fill_shape(cv, 8.2, 2.4, 1.2, 1.2, lambda u, v, L: shade(ramp('#e0b040', 0.45, 0.22, 0.4), L))   # the cap
    line(cv, 7.0, 2.0, 9.4, 1.4, hx('#8a8e98'))                        # its clamp
    smudge(cv, random.Random(5500), 3, (2, 4, 9, 12), (0.4, 0.8), 0.7, hx('#8a8e98'))
    line(cv, 8.6, 3.4, 8.9, 6.6, alpha(hx('#5a3a20'), 160))            # a run of fuel
    cv.outline()
    return cv


def p_laundry_basket():
    """A laundromat's plastic basket on the floor, from above: a rounded oblong of blue plastic, its rim lit on the
    side toward the light, slots moulded round its sides, a hand hole at each end; a load of washing heaped in it (a
    white shirt, jeans, a red sweater, a grey towel, a striped sock hanging over the rim)."""
    W, H = 20, 15
    cv = Cv(W, H)
    blue = ramp('#3a86c8', 0.5, 0.25, 0.3)
    fill_shape(cv, 10.0, 7.5, 9.0, 6.5, lambda u, v, L: shade(blue, L), kind='rect', bevel=1.2, corner=2.2)
    fill_shape(cv, 10.0, 7.5, 7.4, 4.9, lambda u, v, L: dk(blue[0], 0.25), kind='rect', bevel=0.6, corner=1.6)   # its well
    for x in (4.0, 6.5, 9.0, 11.5, 14.0):                              # the slots along the long sides
        frect(cv, x, 1.6, x + 1.0, 2.1, dk(blue[0], 0.35))
        frect(cv, x, 12.9, x + 1.0, 13.4, dk(blue[0], 0.2))
    for x in (1.5, 17.5):                                              # the hand holes at the ends
        frect(cv, x, 6.0, x + 1.0, 9.0, hx('#16202c'))
    cloth = Cv(W, H)
    rng = random.Random(6017)
    heap = (((7.4, 9.6, 4.6, 2.4, 0.25), '#3e5c8c'),                  # jeans
            ((12.6, 6.4, 4.0, 2.5, -0.45), '#e8e6de'),                # a white shirt
            ((6.4, 5.4, 3.2, 2.0, 0.5), '#b0303a'),                   # a red sweater
            ((13.4, 10.0, 2.9, 1.9, 0.15), '#8a8c90'),                # a towel
            ((10.2, 8.0, 1.8, 1.3, 1.1), '#d8b048'))                  # a yellow T-shirt balled up
    for (x, y, rx, ry, a), c in heap:
        r = ramp(c, 0.4, 0.2, 0.25)

        def crumple(u, v, L, r=r, a=a):                                 # flat cloth, a few creases catching the light
            k = 0.62 + 0.25 * L + 0.18 * math.sin(u * 2.3 + v * 1.7 + a * 5)
            return shade(r, max(0.0, min(1.0, k)))
        fill_shape(cloth, x, y, rx, ry, crumple, ang=a, kind='super', p=2.2, pad=0.12 * rng.random())
    for (x0, y0, x1, y1) in ((5.0, 9.4, 8.6, 10.2), (11.2, 5.4, 13.8, 7.2), (5.6, 4.8, 7.2, 5.9), (12.4, 9.6, 14.6, 10.6)):
        line(cloth, x0, y0, x1, y1, alpha(hx('#101420'), 90))         # the creases
    cloth.outline()
    cv.over(cloth)
    fill_capsule(cv, [(15.6, 4.2), (17.2, 2.9), (18.2, 2.2)], 0.65,
                 lambda k, L, s, i, t: hx('#f0ece4') if (i + t) < 1.2 else hx('#c83a4a'))   # a sock over the rim, its red toe
    cv.outline()
    return cv


def p_runner():
    """A length of corridor carpet, worn, from above (its long way along x; lengths are laid end to end, so it wraps
    seamlessly on its 96 px and has no outline): ochre piping, a dark border, a red field with a soft lozenge every
    metre and a half, the pile trodden flat down the middle."""
    W, H = 96, 18
    cv = Cv(W, H)
    red = ramp('#5e2a34', 0.5, 0.25, 0.3)
    nz = VNoise(W, H, 2, random.Random(311))
    nw = VNoise(W, H, 8, random.Random(312))

    def pile(x, y, c):
        if y < 1.5 or y >= H - 1.5:
            col = hx('#8a6a3a') if 0.5 <= y < 1.5 or H - 1.5 <= y < H - 0.5 else red[0]
        elif y < 3.5 or y >= H - 3.5:
            col = red[1]
        else:
            col = red[2]
            u = (x % 48.0) - 24.0
            d = abs(u) / 10.0 + abs(y - H / 2) / 4.5
            if 0.86 < d < 1.0:
                col = mix(red[2], hx('#8a6a3a'), 0.35)                 # the lozenge
            elif d < 0.3:
                col = mix(red[2], hx('#2a3a5a'), 0.3)
        col = shift(col, int((nz(x, y) - 0.5) * 10))
        if abs(y - H / 2) < 4.5:
            col = mix(col, hx('#7a5a5a'), max(0.0, nw(x, y) - 0.45) * 0.5)   # trodden flat
        return col
    px_paint(cv, 0, 0, W, H, pile)
    return cv


def road_paint(W, H, seed):
    """Worn white road paint along x, H rows: the line itself on the middle rows, chipped and stained by tyres."""
    cv = Cv(W, H)
    rng = random.Random(seed)
    paint, worn = hx('#cfcabd'), hx('#9d998f')
    for y in range(1, H - 1):
        for x in range(W):
            if rng.random() < 0.08:
                continue                                        # chipped: the asphalt shows through
            cv.set(x, y, worn if rng.random() < 0.22 else paint)
    return cv


def p_road_edge():
    """A length of the solid white edge line between the parking strip and the lane (laid end to end along x)."""
    return road_paint(96, 4, 907)


def p_parking_bay():
    """A bay line painted across the parking strip, from the kerb to the edge line."""
    return road_paint(60, 4, 911)


# Stencilled floor labels of the physics lab's stations (tools/build_lab.py, painted with Level.paint): worn yellow
# floor-marking paint, 5 x 7 capitals, each font pixel 2 x 2 world px (letters 14 px = 0.44 m tall).
FONT_STENCIL = {
    'A': [".###.", "#...#", "#...#", "#####", "#...#", "#...#", "#...#"],
    'B': ["####.", "#...#", "#...#", "####.", "#...#", "#...#", "####."],
    'C': [".####", "#....", "#....", "#....", "#....", "#....", ".####"],
    'D': ["####.", "#...#", "#...#", "#...#", "#...#", "#...#", "####."],
    'E': ["#####", "#....", "#....", "####.", "#....", "#....", "#####"],
    'F': ["#####", "#....", "#....", "####.", "#....", "#....", "#...."],
    'G': [".####", "#....", "#....", "#.###", "#...#", "#...#", ".###."],
    'I': ["#####", "..#..", "..#..", "..#..", "..#..", "..#..", "#####"],
    'J': ["....#", "....#", "....#", "....#", "....#", "#...#", ".###."],
    'H': ["#...#", "#...#", "#...#", "#####", "#...#", "#...#", "#...#"],
    'V': ["#...#", "#...#", "#...#", "#...#", ".#.#.", ".#.#.", "..#.."],
    'Y': ["#...#", "#...#", ".#.#.", "..#..", "..#..", "..#..", "..#.."],
    'K': ["#...#", "#..#.", "#.#..", "##...", "#.#..", "#..#.", "#...#"],
    'L': ["#....", "#....", "#....", "#....", "#....", "#....", "#####"],
    'M': ["#...#", "##.##", "#.#.#", "#.#.#", "#...#", "#...#", "#...#"],
    'N': ["#...#", "##..#", "#.#.#", "#.#.#", "#..##", "#...#", "#...#"],
    'O': [".###.", "#...#", "#...#", "#...#", "#...#", "#...#", ".###."],
    'P': ["####.", "#...#", "#...#", "####.", "#....", "#....", "#...."],
    'Q': [".###.", "#...#", "#...#", "#...#", "#.#.#", "#..#.", ".##.#"],
    'R': ["####.", "#...#", "#...#", "####.", "#.#..", "#..#.", "#...#"],
    'S': [".####", "#....", "#....", ".###.", "....#", "....#", "####."],
    'T': ["#####", "..#..", "..#..", "..#..", "..#..", "..#..", "..#.."],
    'U': ["#...#", "#...#", "#...#", "#...#", "#...#", "#...#", ".###."],
    'W': ["#...#", "#...#", "#...#", "#.#.#", "#.#.#", "##.##", "#...#"],
    'X': ["#...#", "#...#", ".#.#.", "..#..", ".#.#.", "#...#", "#...#"],
    '0': [".###.", "#...#", "#..##", "#.#.#", "##..#", "#...#", ".###."],
    '1': ["..#..", ".##..", "..#..", "..#..", "..#..", "..#..", ".###."],
    '2': [".###.", "#...#", "....#", "...#.", "..#..", ".#...", "#####"],
    '3': ["####.", "....#", "....#", ".###.", "....#", "....#", "####."],
    '4': ["...#.", "..##.", ".#.#.", "#..#.", "#####", "...#.", "...#."],
    '5': ["#####", "#....", "####.", "....#", "....#", "#...#", ".###."],
    '6': [".###.", "#....", "#....", "####.", "#...#", "#...#", ".###."],
    '7': ["#####", "....#", "...#.", "..#..", ".#...", ".#...", ".#..."],
    '8': [".###.", "#...#", "#...#", ".###.", "#...#", "#...#", ".###."],
    '9': [".###.", "#...#", "#...#", ".####", "....#", "....#", ".###."],
    ' ': [".....", ".....", ".....", ".....", ".....", ".....", "....."],
}
LAB_LABELS = dict(range='1 RANGE', executions='2 EXECUTIONS', soot='3 SOOT', pool='4 POOL', bars='5 BARS',
                  curtain='6 CURTAIN', jukebox='8 JUKEBOX', trapdoor='9 TRAPDOOR', powder='10 POWDER',
                  steam='11 STEAM', power='12 POWER', liquids='13 LIQUIDS', vehicles='17 VEHICLES',
                  takedowns='7 TAKEDOWNS', doors='14 DOORS', cueball='15 CUEBALL', fire='16 FIRE', coat='18 COAT',
                  drive='19 DRIVE', getaway='20 GETAWAY', lorry='21 LORRY', grab='22 GRAB', aim='23 AIM',
                  arcade='24 ARCADE', laundry='25 LAUNDRY', arms='26 ARMS', throw='27 THROW', killcam='28 KILL CAM', shield='29 SHIELD',
                  signals='30 SIGNALS', chasecam='31 CHASE CAM', chasefx='32 CHASE FX', flat='34 FLAT', seeps='33 SEEPS', propane='35 PROPANE', bend='36 BEND',
                  toll='37 TOLL', billboard='38 BILLBOARD')   # (in the order they were added, not by number: each keeps its seed)
STENCIL_K = 2   # world px per font pixel
STENCIL_PAD = 4  # world px of dark plate round the letters (1 px of it clear)


def stencil_size(text):
    return (len(text) * 6 - 1) * STENCIL_K + 2 * STENCIL_PAD, 7 * STENCIL_K + 2 * STENCIL_PAD


def stencil(text, seed):
    """A label stencilled on the floor: bright yellow paint on a dark painted plate (it reads on any floor), worn and
    chipped where it was walked on (1 px clear margin)."""
    W, H = stencil_size(text)
    cv = Cv(W, H)
    rng = random.Random(seed)
    plate, scuff = hx('#17141e', 205), hx('#2a2530', 190)
    paint, worn = hx('#ffd23a', 240), hx('#c8a640', 215)
    for y in range(1, H - 1):
        for x in range(1, W - 1):
            edge = x in (1, W - 2) or y in (1, H - 2)
            if edge and (x in (1, W - 2)) and (y in (1, H - 2)):
                continue                                        # the plate's corners clipped
            if edge and rng.random() < 0.3:
                continue                                        # its edge worn ragged
            cv.set(x, y, scuff if rng.random() < 0.08 else plate)
    k = STENCIL_K
    for n, ch in enumerate(text):
        for gy, row in enumerate(FONT_STENCIL[ch]):
            for gx, c in enumerate(row):
                if c != '#':
                    continue
                for j in range(k):
                    for i in range(k):
                        if rng.random() < 0.07:
                            continue                            # chipped: the plate shows through
                        cv.set(STENCIL_PAD + (n * 6 + gx) * k + i, STENCIL_PAD + gy * k + j,
                               worn if rng.random() < 0.2 else paint)
    return cv


LABEL_PROPS = dict(('label_' + n, (lambda t=t, s=i: stencil(t, 1201 + s))) for i, (n, t) in enumerate(LAB_LABELS.items()))
LABEL_SIZES = dict(('label_' + n, stencil_size(t)) for n, t in LAB_LABELS.items())


def p_velvet_rope():
    """A length of queue rope from above: two brass posts on their weighted bases, a red velvet rope hung between
    their caps by its brass hooks, sagging a little toward the street (+y)."""
    W, H = 32, 9
    cv = Cv(W, H)
    posts = (4.0, 28.0)
    for x in posts:                                                    # the weighted bases, under everything
        fill_shape(cv, x, 4.5, 3.0, 3.0, lambda u, v, L: shade(BRASS, 0.2 + 0.7 * L))
        ring(cv, x, 4.5, 2.3, 3.0, lambda dx, dy, d: shade(BRASS, 0.25 + 0.75 * light(dx / d, dy / d)))
    cv.outline()
    velvet = ramp('#82101f', 0.5, 0.3, 0.4)
    rope = Cv(W, H)
    pts = [(posts[0] + (posts[1] - posts[0]) * t / 12, 4.4 + 2.6 * math.sin(math.pi * t / 12)) for t in range(13)]
    fill_capsule(rope, pts, 0.75, lambda k, L, s, i, t: lt(velvet[3], 0.25) if s < -0.35 else shade(velvet, 0.75 - s * 0.6))
    for i in range(1, 12, 2):                                          # the twist of the cord, catching the light
        x, y = pts[i]
        rope.dot(x - 0.25, y - 0.4, lt(velvet[3], 0.35))
    rope.outline(hx('#2a0610'))
    cv.over(rope)
    for x in posts:                                                    # the caps, the hooks on them
        fill_shape(cv, x, 4.4, 1.5, 1.5, lambda u, v, L: shade(BRASS, L))
        fill_shape(cv, x - 0.4, 3.9, 0.6, 0.6, lambda u, v, L: hx('#fff4cc'))
    return cv


def p_sandwich_board():
    """A chalkboard A-frame on the sidewalk, from above: two black boards hinged along its top bar (the ridge across
    the middle, lit on its near side), a wooden frame, chalk lines of the night's specials, a brass hinge each end."""
    W, H = 18, 14
    cv = Cv(W, H)
    wood = ramp('#7a4a2a', 0.5, 0.25, 0.3)
    slate = ramp('#262a2c', 0.5, 0.25, 0.3)
    fill_shape(cv, W / 2, H / 2, W / 2 - 1, H / 2 - 1, lambda u, v, L: shade(wood, L), kind='rect', bevel=0.8, corner=0.6)
    for (y0, y1, lit) in ((2.0, 6.5, 0.62), (7.5, 12.0, 0.42)):     # the two boards, the far one in the light
        px_paint(cv, 2.5, y0, W - 2.5, y1, lambda x, y, c, lit=lit: shade(slate, lit + 0.05 * math.sin(x * 1.7)))
    frect(cv, 1.5, 6.5, W - 1.5, 7.5, wood[3])                       # the ridge
    for (y, x0, x1) in ((3.0, 4.0, 13.0), (4.5, 4.5, 11.0), (5.5, 4.0, 12.0), (9.0, 4.0, 12.5), (10.5, 5.0, 10.0)):
        for x in range(int(x0 * 2), int(x1 * 2)):
            if (x * 7 + int(y * 3)) % 5:
                cv.dot(x / 2, y, hx('#d8d4c8') if x % 3 else hx('#e8a8b8'))   # chalk, now and then a pink word
    for x in (2.0, W - 3.0):
        stud(cv, x, 6.5, BRASS[2], big=True)                         # the hinges
    smudge(cv, random.Random(6811), 3, (2, 2, W - 2, H - 2), (1.0, 2.0), 0.18, hx('#5a5a58'))   # rubbed-out chalk
    cv.outline()
    return cv


def p_ash_urn():
    """A steel ashtray post by a bar's door, from above: a round brushed steel drum, its sand-filled bowl on top
    with butts stubbed out in it, a dent and a dull ring where hands steady it."""
    S = 12
    cv = Cv(S, S)
    steel = ramp('#8a90a0', 0.45, 0.22, 0.4)
    fill_shape(cv, S / 2, S / 2, S / 2 - 1, S / 2 - 1, lambda u, v, L: shade(steel, L))
    ring(cv, S / 2, S / 2, 3.0, 3.6, lambda dx, dy, d: steel[0] if dx + dy < 0 else steel[3])   # the bowl's rim
    fill_shape(cv, S / 2, S / 2, 3.0, 3.0, lambda u, v, L: shade(ramp('#b8a888', 0.5, 0.25, 0.3), 0.4 + L * 0.3))   # sand
    for (x, y, a) in ((4.6, 5.4, 0.3), (6.8, 4.6, 2.0), (6.0, 7.0, 4.1), (5.0, 6.6, 1.2)):   # the butts
        line(cv, x, y, x + math.cos(a) * 1.4, y + math.sin(a) * 1.4, hx('#e8e0cc'))
        cv.dot(x, y, hx('#c88a4a'))
    cv.dot(3.5, 3.0, hx('#e8ecf4'))                                  # the light on the drum
    smudge(cv, random.Random(6812), 2, (2, 2, S - 2, S - 2), (0.6, 1.0), 0.3)
    cv.outline()
    return cv


def p_entry_mat():
    """A rubber entrance mat at a bar's door, from above (the door at its top): black ribbed rubber worn grey where
    every customer wipes his feet, the bar's name moulded in it faded to a ghost, its bevelled edge."""
    W, H = 60, 22
    cv = Cv(W, H)
    rub = ramp('#24222a', 0.5, 0.25, 0.3)
    rng = random.Random(6813)

    def mat(x, y, c):
        rib = 0.55 if int(y * 2) % 2 else 0.4                         # the ribs across it
        worn = max(0.0, 1 - math.hypot((x - W / 2) / 18.0, (y - H / 2) / 8.0)) * 0.25
        return shade(rub, rib + worn + rng.uniform(-0.03, 0.03))
    px_paint(cv, 1, 1, W - 1, H - 1, mat)
    bevel_edges(cv, 1, 1, W - 2, H - 2, 0.2, 0.35)
    for n, ch in enumerate('MIRAGE'):                                # the name moulded in, nearly worn away
        for gy, row in enumerate(FONT_SHOP[ch]):
            for gx, c in enumerate(row):
                if c == '#' and rng.random() < 0.7:
                    cv.dot(15 + n * 5 + gx * 0.8, 8 + gy * 0.9, lt(rub[2], 0.12))
    smudge(cv, rng, 6, (8, 4, W - 8, H - 4), (1.5, 3.0), 0.2, hx('#4a4440'))   # what the shoes left
    cv.outline()
    return cv


def p_entry_carpet():
    """The red carpet from the club's door to the kerb, from above (its long way along y, the door at the top): deep
    crimson pile between two gold bands, a brass bar holding it at the door, trodden flat and darker down the middle
    and soiled by the street toward the kerb. No outline: it lies on the sidewalk."""
    W, H = 60, 60
    cv = Cv(W, H)
    red = ramp('#7c1222', 0.5, 0.28, 0.35)
    rng = random.Random(2213)
    pile = VNoise(W * 2, H * 2, 3, rng)

    def f(x, y, c):
        k = pile(x * 2, y * 0.7)
        worn = max(0.0, 1 - abs(x - W / 2) / 13.0) * 0.6
        dirt = max(0.0, (y - H * 0.3) / (H * 0.7)) * 0.5 + worn * 0.25
        col = shade(red, 0.5 + (k - 0.5) * 0.5 - worn * 0.4)
        return mix(col, hx('#241a18'), dirt * (0.6 + k * 0.6))
    px_paint(cv, 0, 0, W, H, f)
    gold = ramp('#c89a38', 0.5, 0.26, 0.38)
    for x0 in (3.0, W - 5.0):                                          # the gold bands along its sides
        px_paint(cv, x0, 0, x0 + 2.0, H, lambda x, y, c: shade(gold, 0.85 if (y // 3) % 2 else 0.6))
        frect(cv, x0 - 0.5, 0, x0, H, dk(red[1], 0.2))
    frect(cv, 0, 0, W, 1.5, BRASS[2])                                  # the brass bar at the door
    frect(cv, 0, 1.0, W, 1.5, BRASS[0])
    for _ in range(22):                                                # what the shoes bring in off the street
        smudge(cv, rng, 1, (10, 14, W - 10, H - 1), (1.2, 3.2), 0.3, hx('#1a1210'))
    for _ in range(5):                                                 # spilled drinks dried dark
        smudge(cv, rng, 1, (6, 4, W - 6, H - 6), (2.5, 4.5), 0.25, hx('#2a0c10'))
    for _ in range(9):                                                 # trodden-in gum and ash
        x, y = rng.uniform(8, W - 8), rng.uniform(6, H - 3)
        fill_shape(cv, x, y, 0.8, 0.7, lambda u, v, L: hx('#4a4448') if L > 0.5 else hx('#2a2628'))
    for _ in range(3):                                                 # cigarettes put out on it
        x, y = rng.uniform(10, W - 10), rng.uniform(10, H - 6)
        fill_shape(cv, x, y, 1.1, 0.9, lambda u, v, L: hx('#140c0a'))
        cv.dot(x + 0.5, y - 0.5, hx('#5a4a40'))
    for x0 in (3.0, W - 5.0):                                          # the gold bands gone dull with grime
        smudge(cv, rng, 4, (x0, 20, x0 + 2, H), (1.5, 3.0), 0.35, hx('#3a2a18'))
    smudge(cv, rng, 6, (0, H - 6, W, H), (2.5, 4.0), 0.3, hx('#1a1614'))   # the kerb end, wet and black
    return cv


def p_radiator():
    """A cast-iron radiator under a wall (the wall at -y), from above: its rounded columns painted cream, the gaps, the
    feed pipe into the wall and the valve with its red wheel, paint chipped off the edges."""
    cv = Cv(30, 8)
    paint_ = ramp('#d8d2c0', 0.45, 0.22, 0.3)
    frect(cv, 1.0, 1.5, 28.0, 6.5, hx('#2a2830'))
    for x in range(2, 26, 2):                                          # the columns
        fill_shape(cv, x + 0.9, 4.0, 0.85, 2.6, lambda u, v, L: shade(paint_, L), kind='rect', corner=0.8, bevel=0.8)
    fill_capsule(cv, [(26.4, 0.0), (26.4, 4.0), (27.5, 4.0)], 0.5, lambda k, L, s, i, t: shade(CHROME, L))   # feed pipe
    ring(cv, 27.5, 4.0, 0.0, 1.0, lambda dx, dy, d: shade(ramp('#b8262c', 0.45, 0.22, 0.4), light(dx / (d or 1), dy / (d or 1))))   # valve wheel
    cv.dot(27.25, 3.75, hx('#ff8070'))
    smudge(cv, random.Random(5532), 5, (2, 1, 26, 7), (0.4, 0.8), 0.6, hx('#4a4a52'))   # paint chipped to the iron
    cv.outline()
    return cv


def p_bike():
    """A racing bike leant on a wall, from above: both tyres end on with their tread, the red frame's tubes and its
    highlight, the chainring and cranks with their pedals, the saddle, drop handlebars taped black."""
    cv = Cv(46, 14)
    for x0 in (2.0, 30.0):                                             # the wheels, seen on edge
        fill_capsule(cv, [(x0 + 0.6, 7.0), (x0 + 13.4, 7.0)], 0.9, lambda k, L, s, i, t: shade(RUBBER, L + 0.1))
        dash(cv, x0 + 1.0, 6.5, x0 + 13.0, 6.5, RUBBER[3], 1, 2)
        frect(cv, x0 + 6.0, 6.5, x0 + 8.0, 7.5, hx('#c8ccd6'))         # the hub
    red = ramp('#c8402c', 0.5, 0.25, 0.35)
    fill_capsule(cv, [(9.0, 7.0), (37.0, 7.0)], 0.7, lambda k, L, s, i, t: lt(red[3], 0.2) if L > 0.9 else shade(red, L))   # top tube
    fill_capsule(cv, [(16.5, 6.6), (21.0, 6.0)], 0.5, lambda k, L, s, i, t: shade(red, L))   # the down tube under it
    fill_shape(cv, 22.0, 9.2, 1.8, 1.8, lambda u, v, L: shade(CHROME, L))   # the chainring
    fill_shape(cv, 22.0, 9.2, 0.8, 0.8, lambda u, v, L: hx('#2a2a32'))
    for (x, y) in ((22.0, 4.0), (22.0, 11.4)):                         # cranks and pedals
        line(cv, 22.0, 7.2, x, y, CHROME[1])
        frect(cv, x - 1.0, y - 0.5, x + 1.0, y + 0.5, hx('#2a2a32'))
    fill_shape(cv, 15.0, 7.0, 2.4, 1.3, lambda u, v, L: shade(ramp('#2a2026', 0.45, 0.22, 0.4), L), kind='super', p=2.4)   # the saddle
    fill_capsule(cv, [(34.5, 2.0), (35.5, 3.0), (35.5, 11.0), (34.5, 12.0)], 0.6,
                 lambda k, L, s, i, t: shade(RUBBER, L) if t > 0.0 and (i == 0 or i == 2) else shade(CHROME, L))   # the bars
    frect(cv, 34.5, 6.5, 36.5, 7.5, CHROME[1])                         # the stem
    cv.outline()
    return cv


def p_bin_bag():
    """A full bin bag, from above: black plastic stretched over what is inside, its folds running in to the knot and
    catching the light, the knot's two ears."""
    W, H = 15, 14
    cv = Cv(W, H)
    b = ramp('#2c2e3a', 0.5, 0.25, 0.22)
    cx, cy = 7.2, 6.8
    lumps = [(4.5, 5.0, 2.6), (10.0, 4.6, 2.4), (5.2, 9.4, 2.8), (10.4, 9.6, 2.2), (7.5, 7.0, 3.2)]

    def h(x, y):
        z = sum(math.exp(-((x - lx) ** 2 + (y - ly) ** 2) / (r * r)) for lx, ly, r in lumps)
        a = math.atan2(y - cy, x - cx)
        return z + 0.18 * math.sin(a * 7.0 + math.hypot(x - cx, y - cy) * 0.6)
    fill_shape(cv, 7.0, 6.6, 6.6, 6.0, lambda u, v, L: b[2])
    for j in range(cv.ph):
        for i in range(cv.pw):
            c = cv.p[i, j]
            if c[3] == 0:
                continue
            x, y = (i + 0.5) / cv.s, (j + 0.5) / cv.s
            gx, gy = (h(x + 0.5, y) - h(x - 0.5, y)), (h(x, y + 0.5) - h(x, y - 0.5))
            L = light(-gx * 0.9, -gy * 0.9)
            col = shade(b, L)
            if L > 0.97:
                col = lt(b[3], 0.2)                                    # the sheen of the plastic
            cv.p[i, j] = col
    fill_shape(cv, cx, cy, 1.2, 1.0, lambda u, v, L: shade(b, L))      # the knot
    for (ex, ey) in ((5.4, 5.6), (8.8, 5.4)):
        fill_capsule(cv, [(cx, cy), (ex, ey)], 0.5, lambda k, L, s, i, t: shade(b, L + 0.1))
    cv.outline()
    return cv


def p_newspaper():
    """A folded newspaper left at a door: the masthead, a headline, a photograph, grey columns of text, the fold."""
    cv = Cv(13, 10)
    paper = ramp('#dcd6c4', 0.4, 0.2, 0.2)
    fill_shape(cv, 6.5, 5.0, 5.4, 3.9, lambda u, v, L: shade(paper, L), kind='rect', corner=0.3, bevel=0.6, ang=0.04)
    frect(cv, 2.0, 1.8, 11.0, 2.8, hx('#1e1a24'))                      # the masthead
    frect(cv, 2.5, 2.2, 10.5, 2.4, hx('#8a8494'))
    frect(cv, 2.0, 3.5, 11.0, 4.0, hx('#3a3640'))                      # the headline
    frect(cv, 7.5, 4.5, 11.0, 7.5, hx('#6a6e78'))                      # a photograph
    frect(cv, 8.0, 5.0, 10.0, 6.0, hx('#9a9ea8'))
    for y in (4.5, 5.5, 6.5, 7.5):
        frect(cv, 2.0, y, 7.0, y + 0.5, hx('#9a948a'))                 # columns of text
    frect(cv, 1.0, 8.0, 12.0, 8.5, lambda c: dk(c, 0.18) if c[3] else None)   # the fold
    cv.outline()
    return cv


def p_shoes():
    """A pair of shoes left on a doormat, from above (toes toward +x): brown leather uppers, the laces, the dark of the
    opening and its heel counter, the welt of the sole showing round them."""
    cv = Cv(10, 9)
    lea = ramp('#5a3a22', 0.45, 0.22, 0.35)
    for y0 in (2.4, 6.4):
        fill_shape(cv, 4.8, y0, 3.9, 1.6, lambda u, v, L: shade(RUBBER, L), kind='super', p=2.4)   # the welt
        fill_shape(cv, 4.9, y0, 3.5, 1.3, lambda u, v, L: shade(lea, L), kind='super', p=2.4)
        fill_shape(cv, 2.6, y0, 1.3, 0.8, lambda u, v, L: hx('#1c1418'), kind='super', p=2.2)   # the opening
        for k in range(3):                                             # the laces
            cv.dot(4.5 + k * 0.5, y0 - 0.5, hx('#e8dcc0'))
            cv.dot(4.5 + k * 0.5, y0 + 0.25, hx('#e8dcc0'))
        cv.dot(7.5, y0 - 0.75, lt(lea[3], 0.2))                        # the toe's polish
    cv.outline()
    return cv


# small dressing added one by one (the details list)

# ---------------------------------------------------------------- the level's devices (src/game/data/devices.js)
def p_keg():
    """A 50 l steel keg of draught beer from above: the rolled top chime with its two hand holes, the dished top and
    its weld seam, the black coupler on the spear with its lever and the beer line curling off to the tap, the
    brewery's coloured cap ring, a stencilled number, scuffs and a dent from the cellar steps."""
    S = 18
    c = S / 2
    cv = Cv(S, S)
    st = ramp('#b8bec8', 0.5, 0.26, 0.42)
    fill_shape(cv, c, c, 8.0, 8.0, lambda u, v, L: shade(st, 0.6 - (u + v) * 0.03))
    ring(cv, c, c, 7.1, 8.05, lambda dx, dy, d: shade(st, light(dx / d * 0.95, dy / d * 0.95)) if d > 7.6 else st[0])
    ring(cv, c, c, 6.5, 7.1, lambda dx, dy, d: shade(st, 0.9 - light(dx / d, dy / d) * 0.7))   # the chime's inner wall
    for (hx0, hy0) in ((c - 4.2, c - 5.6), (c + 2.4, c + 4.6)):            # the hand holes
        frect(cv, hx0, hy0, hx0 + 2.0, hy0 + 1.0, hx('#1a1820'))
    ring(cv, c, c, 4.4, 4.8, lambda dx, dy, d: shade(st, 0.25 + light(dx / d, dy / d) * 0.7))  # the weld seam
    ring(cv, c, c, 2.6, 3.3, lambda dx, dy, d: hx('#2a6ad8') if dx + dy < 0 else hx('#1a4aa0'))   # the brewery's ring
    fill_shape(cv, c, c, 2.4, 2.4, lambda u, v, L: shade(ramp('#26242c', 0.45, 0.22, 0.5), L))   # the coupler
    fill_capsule(cv, [(c, c), (c + 3.6, c - 1.4)], 0.55, lambda k, L, s_, i, t: shade(ramp('#3a3844', 0.45, 0.22, 0.5), L))   # its lever
    fill_capsule(cv, [(c - 1.2, c + 1.0), (c - 4.0, c + 3.5), (c - 6.6, c + 2.6), (c - 8.6, c + 4.2)], 0.42,
                 lambda k, L, s_, i, t: hx('#e8c070') if L > 0.55 else hx('#b07a2a'))   # the beer line, beer in it
    for x in (6.0, 7.0, 8.0, 10.0, 11.0):
        cv.dot(x, 14.5, alpha(hx('#2a2a34'), 170))                       # stencilled number
    rng = random.Random(4401)
    smudge(cv, rng, 4, (2, 2, 16, 16), (0.5, 1.0), 0.35, hx('#6a6e78'))   # scuffs
    smudge(cv, rng, 1, (11, 3, 14, 6), (1.2, 1.6), 0.25)                 # a dent
    fgrain(cv, random.Random(4402), 3)
    cv.outline()
    return cv


def p_fire_alarm():
    """The bar's fire alarm pull station on a wall (-y), from above: a red cast box on its back plate, FIRE in white
    on its face, the white T-handle to pull down, the little glass rod across it, the bell's red dome beside it."""
    cv = Cv(12, 8)
    frect(cv, 1.0, 0.5, 11.0, 1.8, hx('#5a5a66'))                        # the back plate on the wall
    frect(cv, 1.0, 0.5, 11.0, 1.0, hx('#8a8a96'))
    red = ramp('#d01e26', 0.5, 0.25, 0.42)
    fill_shape(cv, 4.6, 4.2, 3.6, 2.8, lambda u, v, L: shade(red, L), kind='rect', bevel=0.8, corner=0.5)
    frect(cv, 2.2, 3.0, 7.0, 3.6, hx('#f4f2ec'))                         # FIRE
    frect(cv, 3.8, 5.0, 5.4, 7.2, hx('#f4f2ec'))                         # the T-handle, out toward the room
    frect(cv, 2.8, 6.4, 6.4, 7.2, hx('#f4f2ec'))
    frect(cv, 2.8, 6.8, 6.4, 7.2, hx('#c8c4b8'))
    line(cv, 2.6, 5.4, 6.6, 5.4, hx('#cfeaff'))                          # the glass rod
    fill_shape(cv, 9.2, 4.0, 1.8, 1.8, lambda u, v, L: shade(ramp('#c2281e', 0.45, 0.22, 0.5), L))   # the bell
    cv.dot(8.75, 3.5, hx('#ffb0a0'))
    cv.outline()
    return cv


def p_trapdoor():
    """A trapdoor in the floor of the TV shop's back, flush with it: an angle-iron frame, four worn planks, the iron
    ring sunk in its recess, the two strap hinges, grime in the joints and the scuffs of the hatch being dragged."""
    cv = Cv(26, 26)
    iron = ramp('#4a4c56', 0.45, 0.22, 0.4)
    frect(cv, 1.0, 1.0, 25.0, 25.0, iron[1])
    frect(cv, 1.0, 1.0, 25.0, 1.6, iron[3])
    frect(cv, 1.0, 1.0, 1.6, 25.0, iron[3])
    wood_fill(cv, 2, 2, 24, 24, hx('#6a4a30'), plank=5, rng=random.Random(5301), vertical=True)
    bevel_edges(cv, 2, 2, 23, 23, 0.2, 0.35)
    for x in (7.5, 12.5, 17.5):
        frect(cv, x, 2.5, x + 0.5, 23.5, hx('#2a1a10'))                  # the joints
    for y in (5.0, 19.5):                                                 # the strap hinges
        frect(cv, 2.5, y, 9.0, y + 1.5, iron[2])
        frect(cv, 2.5, y, 9.0, y + 0.5, iron[3])
        cv.dot(4.0, y + 1.0, iron[0])
        cv.dot(7.5, y + 1.0, iron[0])
    fill_shape(cv, 19.0, 13.0, 2.2, 2.2, lambda u, v, L: hx('#1a1410'))   # the ring's recess
    ring(cv, 19.0, 13.0, 1.3, 2.0, lambda dx, dy, d: shade(iron, light(dx / d, dy / d)))
    smudge(cv, random.Random(5302), 4, (3, 3, 23, 23), (1.0, 2.2), 0.25)
    cv.outline()
    return cv


def p_beer_tap():
    """A draught tower on the bar from above, the bartender's side at -y: the chrome T of the tower along the bar with
    its three spouts over the black drip tray, the three tap handles standing up in their brewers' colours (seen from
    over them: their tops and the shadow they throw onto the bar), a bar towel left folded by it, wet rings."""
    W, H = 22, 10
    cv = Cv(W, H)
    tray = ramp('#24262c', 0.45, 0.22, 0.5)
    fill_shape(cv, 11.0, 2.4, 9.5, 2.0, lambda u, v, L: shade(tray, L), kind='rect', bevel=0.8, corner=0.5)
    for x in range(3, 20, 2):                                           # the grate of the drip tray
        frect(cv, x, 1.0, x + 0.5, 3.8, tray[0])
    fill_shape(cv, 6.0, 2.6, 1.3, 0.9, lambda u, v, L: hx('#c8902a') if L > 0.4 else hx('#8a5a18'))   # beer left in it
    chrome_bar(cv, 2.0, 4.6, 20.0, 6.6)                                 # the tower's T along the bar
    for x in (2.0, 19.0):
        fill_shape(cv, x + 0.5, 5.6, 1.2, 1.2, lambda u, v, L: shade(CHROME, L))
    cv.outline()
    for i, (x, col) in enumerate(((5.5, '#b8262c'), (11.0, '#d8a838'), (16.5, '#1f6a3a'))):
        frect(cv, x - 0.5, 3.0, x + 0.5, 4.8, CHROME[2])                # the spout over the tray
        cv.dot(x, 3.0, CHROME[3])
        fill_shape(cv, x + 1.2, 8.4, 1.6, 0.9, lambda u, v, L: (10, 8, 12, 110))   # the handle's shadow on the bar
        hand = ramp(col, 0.45, 0.24, 0.42)
        fill_shape(cv, x, 7.4, 1.5, 1.7, lambda u, v, L: shade(hand, L), kind='rect', corner=0.7)
        frect(cv, x - 0.5, 6.6, x + 0.5, 7.0, hx('#f0e8d0'))           # the brewer's badge
        cv.dot(x - 0.5, 6.5, lt(hand[3], 0.4))
    cv.outline()
    return cv


def p_curtain():
    """A heavy velvet curtain hung across a doorway, from above (its rod along y): the brass rod and its rings, the
    cloth falling in deep folds either side of it, lit on the crests, the hem's gold fringe at both ends."""
    W, H = 8, 34
    cv = Cv(W, H)
    velvet = ramp('#7a0e22', 0.5, 0.3, 0.4)

    def folds(x, y, c):
        k = (math.sin(y * 1.15) + 1) / 2                                  # crest to trough along the curtain
        return shade(velvet, 0.2 + 0.75 * k - abs(x - W / 2) / W * 0.4)
    px_paint(cv, 1, 1, W - 1, H - 1, folds)
    frect(cv, 3.5, 0.5, 4.5, H - 0.5, BRASS[2])                         # the rod over it
    for y in range(3, H - 2, 4):
        cv.dot(4.0, y, BRASS[3])                                        # its rings
    for y in (1.0, H - 2.0):
        frect(cv, 1.0, y, W - 1.0, y + 1.0, hx('#c89a38'))             # the fringe at each end
    cv.outline()
    return cv


def p_rug():
    """The boss's rug, a worn Persian on the floor of his back room, one corner kicked back over itself: the deep red
    field and its navy medallion, the patterned border, the fringe, and under the turned corner the edge of the
    hatch's planks and its frame (what it hides)."""
    W, H = 40, 28
    cv = Cv(W, H)
    rng = random.Random(5311)
    red, navy, gold = ramp('#8a1a22', 0.45, 0.22, 0.3), ramp('#1e2a56', 0.45, 0.22, 0.3), hx('#c8a050')

    def field(x, y, c):
        bx = min(x - 2, W - 2 - x, y - 2, H - 2 - y)
        if bx < 2.0:
            col = navy[2] if (int(x) + int(y)) % 3 else gold
        elif bx < 2.5:
            col = gold
        else:
            dx, dy = (x - W / 2) / 10, (y - H / 2) / 7
            d = abs(dx) + abs(dy)
            col = navy[2] if d < 0.6 else gold if d < 0.75 else red[2] if (int(x * 0.5) + int(y * 0.5)) % 4 else red[1]
        return mix(col, hx('#3a2a26'), 0.18 * rng.random())             # worn, uneven
    px_paint(cv, 2, 2, W - 2, H - 2, field)
    for x in range(3, W - 3, 2):                                          # the fringe
        cv.dot(x, 1.25, hx('#e4d8b8'))
        cv.dot(x, H - 1.25, hx('#e4d8b8'))
    # the corner kicked back (bottom right): the hatch's planks under it, the fold of the rug's pale back
    for j in range(0, 9):
        for i in range(0, 9 - j):
            cv.set(W - 2.5 - i, H - 2.5 - j, hx('#5a3a20') if (i + j) % 3 else hx('#3a2412'))
    line(cv, W - 11.0, H - 2.0, W - 2.0, H - 11.0, hx('#2a2a32'))         # the frame's edge
    for k in range(0, 9):
        cv.dot(W - 11.5 + k, H - 11.5 + (8 - k), hx('#d8c8a8'))
    smudge(cv, rng, 3, (4, 4, W - 4, H - 4), (1.5, 3.0), 0.15)
    cv.outline()
    return cv

DETAIL_PROPS = dict(ladder=p_ladder, parapet=p_parapet, fuse_box=p_fuse_box,
                    cash_case=p_cash_case, ceiling_fan=p_ceiling_fan, mirror_ball=p_mirror_ball, extinguisher=p_extinguisher,
                    vending=p_vending, phone_booth=p_phone_booth, parking_meter=p_parking_meter, news_box=p_news_box,
                    pipe_steam=pipe('#8a5a3a', '#b07a52', '#5e3a24', '#c8c0a8'), pipe_water=pipe('#4a6a7a', '#6e8e9e', '#30485a', '#9aa2b0'),
                    wall_vent=p_wall_vent, manhole=p_manhole, cardboard_bed=p_cardboard_bed,
                    table_flipped=flipped_table(46, '#86552f', '#5a361e'),
                    table_round_flipped=flipped_table(30, '#8a5530', '#4a2c18', feet=1),
                    card_table_flipped=flipped_table(60, '#6a3518', '#4a2c18', face='#1f7a4c'),
                    urinal=p_urinal, stall=p_stall, apt_door=p_apt_door, doormat=p_doormat, stairs=p_stairs,
                    floor_hole=p_floor_hole, jerrycan=p_jerrycan, laundry_basket=p_laundry_basket, runner=p_runner, road_edge=p_road_edge, parking_bay=p_parking_bay, velvet_rope=p_velvet_rope,
                    entry_carpet=p_entry_carpet, radiator=p_radiator, bike=p_bike,
                    sandwich_board=p_sandwich_board, ash_urn=p_ash_urn, entry_mat=p_entry_mat,
                    bin_bag=p_bin_bag, newspaper=p_newspaper, shoes=p_shoes,
                    keg=p_keg, fire_alarm=p_fire_alarm,
                    trapdoor=p_trapdoor, rug=p_rug, beer_tap=p_beer_tap, curtain=p_curtain)
DETAIL_SIZES = dict(ladder=(32, 32), parapet=(34, 12), fuse_box=(26, 11), cash_case=(22, 16), ceiling_fan=(44, 44), mirror_ball=(12, 12), extinguisher=(8, 11),
                    vending=(28, 22), phone_booth=(26, 26), parking_meter=(7, 8), news_box=(16, 13),
                    pipe_steam=(96, 6), pipe_water=(96, 6), wall_vent=(16, 7), manhole=(16, 16), cardboard_bed=(36, 20),
                    table_flipped=(46, 27), table_round_flipped=(30, 27), card_table_flipped=(60, 27),
                    urinal=(14, 12), stall=(6, 50), apt_door=(34, 8), doormat=(26, 14), stairs=(66, 46),
                    floor_hole=(30, 22), jerrycan=(11, 13), laundry_basket=(20, 15), runner=(96, 18), road_edge=(96, 4), parking_bay=(60, 4), velvet_rope=(32, 9), entry_carpet=(60, 60), radiator=(30, 8), bike=(46, 14),
                    bin_bag=(15, 14), newspaper=(13, 10), shoes=(10, 9),
                    sandwich_board=(18, 14), ash_urn=(12, 12), entry_mat=(60, 22),
                    keg=(18, 18), fire_alarm=(12, 8), trapdoor=(26, 26), rug=(40, 28), beer_tap=(22, 10), curtain=(8, 34))

SHOP_PROPS = dict(bottle_shelf=p_bottle_shelf, back_bar=p_back_bar, washer=p_washer, neon_sign_liquor=p_neon_sign_liquor,
                  alarm_box=p_alarm_box,
                  neon_sign_video=p_neon_sign_video, neon_sign_wash=p_neon_sign_wash,
                  neon_sign_mirage=p_neon_sign_mirage, neon_sign_open=p_neon_sign_open)
SHOP_SIZES = dict(bottle_shelf=(42, 13), back_bar=(42, 10), washer=(24, 24), neon_sign_liquor=(46, 14), neon_sign_video=(44, 14),
                  alarm_box=(12, 8),
                  neon_sign_wash=(50, 14), neon_sign_mirage=(44, 14), neon_sign_open=(34, 16))
SHOP_GLOWING = ['neon_sign_liquor', 'neon_sign_video', 'neon_sign_wash', 'neon_sign_mirage', 'neon_sign_open']


# --------------------------------------------------------------------------
# A bar's life: what stands on its furniture (the `clutter` group, systems/Clutter.js) and what hangs on its walls
# (props, the wall at -y, the room along +y). Small, flat, a few shades off what they stand on: they must never read
# as a weapon on the floor or as something in the way. Painted at FINE density; the two beer neons at the world's.
# --------------------------------------------------------------------------

BEER = ramp('#d89a2a', 0.45, 0.22, 0.35)
FOAM = hx('#f2ead6')
GLASS_RIM = hx('#d8e4ea')
WHISKY = hx('#c47a26')


def drink_glass(cv, cx, cy, r, level, rng):
    """A straight glass from above: its lit rim, what is in it (level 1 full with a head of foam, 0.5 half, 0 the
    foam's lacing on the empty glass), the bottom's ring through it, a glint."""
    fill_shape(cv, cx, cy, r, r, lambda u, v, L: GLASS_RIM if L > 0.62 else hx('#9aaab4'))
    inner = r - 0.6
    if level >= 1:
        fill_shape(cv, cx, cy, inner, inner, lambda u, v, L: FOAM if math.hypot(u + 0.25, v + 0.25) < inner * 0.72 else BEER[2])
        cv.dot(cx + inner * 0.45, cy + inner * 0.45, BEER[1])
    elif level > 0:
        fill_shape(cv, cx, cy, inner, inner, lambda u, v, L: shade(BEER, 0.35 + 0.3 * L))
        ring(cv, cx, cy, inner * 0.55, inner * 0.7, lambda dx, dy, d: lt(BEER[2], 0.25) if dx + dy < 0 else None)
    else:
        fill_shape(cv, cx, cy, inner, inner, lambda u, v, L: hx('#6c7a84') if L < 0.5 else hx('#86949e'))
        for _ in range(4):                                             # the foam's lacing down the inside
            a = rng.uniform(0, 2 * math.pi)
            cv.dot(cx + math.cos(a) * inner * 0.75, cy + math.sin(a) * inner * 0.75, hx('#d8d4c8'))
    cv.dot(cx - r * 0.5, cy - r * 0.5, hx('#ffffff'))


def c_pint(level, seed):
    def paint():
        cv = Cv(5, 5)
        drink_glass(cv, 2.5, 2.5, 1.95, level, random.Random(seed))
        cv.outline()
        return cv
    return paint


def c_pitcher():
    """A plastic pitcher of draught: the round jug, its handle and spout, the beer under a head."""
    cv = Cv(8, 7)
    fill_capsule(cv, [(5.6, 2.4), (7.0, 2.4), (7.0, 4.6), (5.6, 4.6)], 0.45, lambda k, L, s, i, t: hx('#c8d4dc') if L > 0.6 else hx('#8a98a2'))
    drink_glass(cv, 3.4, 3.5, 2.8, 1, random.Random(7101))
    fill_shape(cv, 0.9, 3.5, 0.6, 0.8, lambda u, v, L: GLASS_RIM)     # the spout
    cv.outline()
    return cv


def c_shot():
    cv = Cv(3, 3)
    fill_shape(cv, 1.5, 1.5, 1.2, 1.2, lambda u, v, L: GLASS_RIM if L > 0.6 else hx('#8a98a2'))
    fill_shape(cv, 1.55, 1.55, 0.7, 0.7, lambda u, v, L: hx('#8a4418'))
    cv.dot(1.0, 1.0, hx('#ffffff'))
    cv.outline()
    return cv


def c_lowball():
    """A heavy whisky glass: two fingers of whisky, an ice cube in it."""
    cv = Cv(5, 5)
    fill_shape(cv, 2.5, 2.5, 2.0, 2.0, lambda u, v, L: GLASS_RIM if L > 0.6 else hx('#8a98a2'))
    fill_shape(cv, 2.55, 2.55, 1.35, 1.35, lambda u, v, L: WHISKY if u + v > -0.5 else lt(WHISKY, 0.2))
    fill_shape(cv, 2.2, 2.4, 0.65, 0.6, lambda u, v, L: hx('#eef4f6') if L > 0.5 else hx('#c4d4dc'), ang=0.4, kind='rect', corner=0.2, bevel=0.3)
    cv.dot(1.25, 1.25, hx('#ffffff'))
    cv.outline()
    return cv


def c_beer_bottle():
    """A brown beer bottle standing, from above: its shoulders round the neck, the gold cap."""
    cv = Cv(4, 4)
    fill_shape(cv, 2.0, 2.0, 1.6, 1.6, lambda u, v, L: shade(ramp('#5a3410', 0.5, 0.25, 0.5), L))
    fill_shape(cv, 2.0, 2.0, 0.75, 0.75, lambda u, v, L: hx('#e0b448') if L > 0.5 else hx('#a8802a'))
    cv.outline()
    return cv


def c_liquor():
    """A square whisky bottle from above: dark amber glass, its black cap, the label's edge."""
    cv = Cv(5, 5)
    fill_shape(cv, 2.5, 2.5, 1.9, 1.9, lambda u, v, L: shade(ramp('#7a3c12', 0.5, 0.25, 0.5), L), kind='rect', corner=0.5, bevel=0.7)
    frect(cv, 0.7, 3.4, 4.3, 4.0, hx('#e8dcc0'))                      # the label round its foot
    fill_shape(cv, 2.5, 2.5, 0.8, 0.8, lambda u, v, L: hx('#2a2628') if L < 0.6 else hx('#4a4448'))
    cv.outline()
    return cv


def c_ashtray():
    cv = Cv(6, 6)
    ashtray(cv, 3.0, 3.0, random.Random(7102), 2.4)
    cv.outline()
    return cv


def c_cigar():
    """A cigar laid down to burn: brown leaf, the gold band, grey ash and the ember at its tip."""
    cv = Cv(7, 3)
    fill_capsule(cv, [(1.4, 1.5), (5.6, 1.5)], 0.75, lambda k, L, s, i, t: shade(ramp('#6a4022', 0.5, 0.25, 0.3), L))
    frect(cv, 4.3, 0.8, 4.9, 2.2, hx('#d8a838'))
    frect(cv, 0.8, 0.9, 1.6, 2.1, hx('#9a9690'))
    cv.dot(0.75, 1.5, hx('#ff6a1a'))
    cv.outline()
    return cv


def c_coaster():
    """A cardboard beer mat: cream, a red ring printed round it."""
    cv = Cv(5, 5)
    fill_shape(cv, 2.5, 2.5, 2.0, 2.0, lambda u, v, L: hx('#e4dac4') if L > 0.4 else hx('#cfc4ac'))
    ring(cv, 2.5, 2.5, 1.2, 1.6, lambda dx, dy, d: hx('#b8323a'))
    cv.outline(dk(hx('#cfc4ac'), 0.55))
    return cv


def c_napkin():
    """A paper napkin folded in four, a corner turned back."""
    cv = Cv(5, 5)
    fill_shape(cv, 2.5, 2.5, 1.9, 1.9, lambda u, v, L: hx('#d8d2c4') if u - v < 0 else hx('#beb6a8'), kind='rect', corner=0.3, bevel=0.5)
    line(cv, 0.8, 0.8, 4.2, 4.2, hx('#aaa294'))
    cv.outline(dk(hx('#beb6a8'), 0.55))
    return cv


def c_napkin_crumpled():
    cv = Cv(4, 4)
    rng = random.Random(7103)
    fill_shape(cv, 2.0, 2.0, 1.5, 1.3, lambda u, v, L: hx('#d4ccbe') if L > 0.5 else hx('#b4ac9c'), ang=0.5)
    for _ in range(3):
        cv.dot(rng.uniform(1.0, 3.0), rng.uniform(1.0, 3.0), hx('#b0a898'))
    cv.outline(dk(hx('#c8c0b0'), 0.55))
    return cv


def c_peanuts():
    """A steel bowl of peanuts in their shells."""
    cv = Cv(6, 6)
    ring(cv, 3.0, 3.0, 2.0, 2.5, lambda dx, dy, d: shade(STEEL_L, 0.2 + 0.85 * light(dx / d, dy / d)))
    fill_shape(cv, 3.0, 3.0, 2.0, 2.0, lambda u, v, L: hx('#8a6a3a'))
    rng = random.Random(7104)
    for _ in range(7):
        x, y, a = rng.uniform(1.8, 4.2), rng.uniform(1.8, 4.2), rng.uniform(0, math.pi)
        fill_shape(cv, x, y, 0.75, 0.42, lambda u, v, L: hx('#d8b070') if L > 0.55 else hx('#b08848'), ang=a)
    cv.outline()
    return cv


def c_till():
    """The bar's cash register, its keys toward the bartender (-y): a cream steel case, rows of keys, the green
    display at the back, the drawer's lip and the paper roll."""
    cv = Cv(13, 10)
    case = ramp('#b8b09c', 0.5, 0.25, 0.35)
    fill_shape(cv, 6.5, 5.0, 5.5, 4.0, lambda u, v, L: shade(case, L), kind='rect', corner=0.8, bevel=1.0)
    frect(cv, 2.0, 7.0, 11.0, 8.3, hx('#5a5448'))                     # the display's hood, at the back
    frect(cv, 3.0, 7.3, 8.0, 8.0, hx('#3aff8a'))                      # its digits' glow
    for k in range(4):
        for j in range(5):
            c = hx('#e8e2d0') if (j + k) % 4 else hx('#c8323a')
            frect(cv, 2.2 + j * 1.6, 1.8 + k * 1.2, 3.2 + j * 1.6, 2.6 + k * 1.2, c)
    fill_shape(cv, 11.0, 2.2, 0.9, 0.9, lambda u, v, L: hx('#f4f0e6') if L > 0.5 else hx('#d0c8b8'))   # the paper roll
    frect(cv, 1.5, 0.9, 11.5, 1.3, lambda c: dk(c, 0.3) if c[3] else None)   # the drawer's lip
    cv.outline()
    return cv


def c_cards():
    """A hand of three cards fanned out, face up."""
    cv = Cv(7, 6)
    for (x, a, pip) in ((2.0, -0.5, '#c01828'), (3.5, 0.0, '#1a1420'), (5.0, 0.5, '#c01828')):
        fill_shape(cv, x, 3.0, 1.15, 1.7, lambda u, v, L: hx('#f2ece0') if L > 0.5 else hx('#d8d0c2'), ang=a, kind='rect', corner=0.3, bevel=0.5)
        fill_shape(cv, x + math.sin(a) * 0.6, 3.0 - math.cos(a) * 0.6, 0.4, 0.5, lambda u, v, L, pip=pip: hx(pip), ang=a, kind='super', p=1.2)
    cv.outline()
    return cv


def c_chips():
    """A short stack of poker chips: the top one's rim marks."""
    cv = Cv(4, 4)
    fill_shape(cv, 2.0, 2.0, 1.5, 1.5, lambda u, v, L: shade(ramp('#c8303a', 0.45, 0.22, 0.35), L))
    for a in (0.3, 1.9, 3.5, 5.1):
        cv.dot(2.0 + math.cos(a) * 1.15, 2.0 + math.sin(a) * 1.15, hx('#f0ece0'))
    cv.dot(2.0, 2.0, hx('#e8a0a4'))
    cv.outline()
    return cv


def banknote(cv, cx, cy, w, h, a):
    green = ramp('#5a8a4a', 0.4, 0.2, 0.3)
    fill_shape(cv, cx, cy, w, h, lambda u, v, L: shade(green, L) if abs(u) > w * 0.25 else hx('#86b070'), ang=a, kind='rect', corner=0.2, bevel=0.4)


def c_bands():
    """A bundle of banknotes in its paper band."""
    cv = Cv(7, 4)
    banknote(cv, 3.5, 2.0, 2.6, 1.3, 0.0)
    frect(cv, 3.0, 0.7, 4.0, 3.3, hx('#e4d8b4'))
    cv.dot(3.25, 1.5, hx('#b8a878'))
    cv.outline()
    return cv


def c_bill():
    cv = Cv(5, 3)
    banknote(cv, 2.5, 1.5, 1.9, 1.0, 0.0)
    cv.outline(dk(hx('#5a8a4a'), 0.55))
    return cv


def c_rubber_bands():
    cv = Cv(5, 5)
    for (x, y, r, col) in ((2.2, 2.4, 1.3, '#c8a058'), (3.0, 2.8, 1.1, '#b84a3a'), (2.6, 2.0, 0.9, '#c8a058')):
        ring(cv, x, y, r - 0.35, r, lambda dx, dy, d, col=col: hx(col))
    return cv


def c_baggies():
    """Two small zip bags of white powder."""
    cv = Cv(6, 4)
    for (x, y, a) in ((2.0, 2.0, 0.2), (4.0, 2.2, -0.3)):
        fill_shape(cv, x, y, 1.4, 1.1, lambda u, v, L: hx('#f0eee8') if L > 0.45 else hx('#cfcac0'), ang=a, kind='rect', corner=0.3, bevel=0.5)
        cv.dot(x - 0.9, y - 0.6, hx('#9ab8cc'))                       # the zip
    cv.outline()
    return cv


def c_glass_broken():
    """What a glass shot where it stood leaves: its foot, a few shards, the drink in a wet ring round them."""
    cv = Cv(6, 6)
    fill_shape(cv, 3.0, 3.0, 2.6, 2.2, lambda u, v, L: hx('#5a3810', 120), ang=0.4)
    rng = random.Random(7105)
    ring(cv, 3.0, 3.0, 1.0, 1.4, lambda dx, dy, d: GLASS_RIM if rng.random() < 0.6 else None)
    for _ in range(4):
        cv.dot(rng.uniform(1.0, 5.0), rng.uniform(1.0, 5.0), hx('#e8f4fa'))
    return cv


# the VIP room's: champagne, its flutes and its bucket, the singles thrown at the dancer (flat, crumpled, folded to tuck
# in), a boa's feathers, a cork, a garter; kept a few shades off the carpet they lie on, smaller than any weapon
CHAMPAGNE = hx('#e2cc84')
CASH = ramp('#5a8a4a', 0.4, 0.2, 0.3)
BOA = ramp('#e8609a', 0.45, 0.22, 0.3)


def c_flute():
    """A champagne flute standing, from above: the narrow bowl's lit rim, the pale gold wine, a bubble, a glint."""
    cv = Cv(4, 4)
    fill_shape(cv, 2.0, 2.0, 1.55, 1.55, lambda u, v, L: GLASS_RIM if L > 0.62 else hx('#9aaab4'))
    fill_shape(cv, 2.05, 2.05, 1.0, 1.0, lambda u, v, L: lt(CHAMPAGNE, 0.3) if u + v < -0.4 else CHAMPAGNE)
    cv.dot(2.4, 2.3, hx('#fff6d6'))
    cv.dot(1.0, 1.0, hx('#ffffff'))
    cv.outline()
    return cv


def c_flute_down():
    """A flute knocked over on the floor: its foot on edge, the stem, the bowl lying along, a last drop at its lip."""
    cv = Cv(7, 3)
    fill_shape(cv, 1.1, 1.5, 0.5, 1.2, lambda u, v, L: GLASS_RIM if L > 0.6 else hx('#8a98a2'))
    line(cv, 1.6, 1.5, 3.4, 1.5, hx('#c8d4dc'))
    fill_capsule(cv, [(3.9, 1.5), (5.8, 1.5)], 0.95,
                 lambda k, L, s, i, t: GLASS_RIM if L > 0.72 else hx('#a4b2bc') if k > 0.55 else hx('#c8bc88'))
    cv.dot(4.3, 1.0, hx('#ffffff'))
    cv.outline()
    return cv


def c_bucket():
    """A steel champagne bucket from above: its rolled rim, crushed ice, the bottle's neck in its gold foil, a white
    cloth over the rim."""
    cv = Cv(9, 9)
    c, rng = 4.5, random.Random(7130)
    fill_shape(cv, c, c, 3.9, 3.9, lambda u, v, L: shade(STEEL_L, L))
    ice = [hx('#cfe0e8'), hx('#e6f2f6'), hx('#b4c8d2')]
    fill_shape(cv, c, c, 3.0, 3.0, lambda u, v, L: ice[rng.randrange(3)] if L > 0.3 else ice[2])
    fill_shape(cv, c + 0.7, c - 0.4, 1.6, 1.6, lambda u, v, L: shade(ramp('#1e4a2a', 0.45, 0.22, 0.5), L))
    fill_shape(cv, c + 0.7, c - 0.4, 0.8, 0.8, lambda u, v, L: hx('#e8c458') if L > 0.5 else hx('#a8822a'))
    fill_shape(cv, c - 2.4, c + 2.6, 1.6, 0.9, lambda u, v, L: hx('#f2eee6') if L > 0.45 else hx('#cac4ba'), ang=0.75)
    cv.outline()
    return cv


def c_single():
    """A one-dollar bill lying flat: the pale paper of its border, the green print inside it, the portrait's oval."""
    cv = Cv(5, 3)
    fill_shape(cv, 2.5, 1.5, 2.05, 1.05, lambda u, v, L: hx('#c8d4ac') if L > 0.5 else hx('#b0bc94'), kind='rect', corner=0.15, bevel=0.3)
    frect(cv, 1.0, 1.0, 4.0, 2.0, CASH[2])
    fill_shape(cv, 2.5, 1.5, 0.5, 0.5, lambda u, v, L: CASH[0])
    cv.outline(dk(hx('#6a8a5a'), 0.45))
    return cv


def c_singles():
    """A loose stack of one-dollar bills, fanned a little."""
    cv = Cv(7, 5)
    for (x, y, a) in ((3.3, 2.7, -0.35), (3.5, 2.4, 0.1), (3.6, 2.5, 0.42)):
        banknote(cv, x, y, 2.3, 1.05, a)
    cv.outline(dk(hx('#5a8a4a'), 0.55))
    return cv


def c_bill_crumpled():
    """A bill screwed up in a fist and thrown: a lumpy ball, its creases."""
    cv = Cv(4, 4)
    rng = random.Random(7131)
    paper = ramp('#8aa874', 0.4, 0.2, 0.35)
    fill_shape(cv, 2.0, 2.0, 1.45, 1.2, lambda u, v, L: shade(paper, L), ang=0.6, kind='super', p=1.7)
    for _ in range(4):
        cv.dot(rng.uniform(1.0, 3.0), rng.uniform(1.0, 3.0), hx('#c8d4ac') if rng.random() < 0.6 else dk(paper[1], 0.15))
    cv.outline(dk(hx('#5a8a4a'), 0.55))
    return cv


def c_bill_folded():
    """A bill folded long-ways, the way it is tucked into a garter or the stage's edge: its crease lit."""
    cv = Cv(5, 3)
    fill_shape(cv, 2.5, 1.5, 2.0, 0.7, lambda u, v, L: hx('#86b070') if v < -0.1 else CASH[1], kind='rect', corner=0.2, bevel=0.3)
    cv.outline(dk(hx('#5a8a4a'), 0.55))
    return cv


def c_feather(seed, bend):
    """A pink feather shed by a boa: a pale quill, soft barbs either side, no ink round it."""
    def paint():
        cv = Cv(5, 4)
        rng = random.Random(seed)
        pts = [(0.6 + 3.8 * t, 2.0 + bend * (t - 0.5) ** 2 * 4 - bend) for t in (k / 8 for k in range(9))]
        for (x, y) in pts[1:]:
            for side in (-1, 1):
                ln = rng.uniform(0.5, 1.3) * (1.1 - abs(x - 2.6) / 3.0)
                line(cv, x, y, x + rng.uniform(0.0, 0.5), y + side * ln, shade(BOA, rng.uniform(0.25, 0.9)))
        for (x, y) in pts:
            cv.dot(x, y, lt(BOA[3], 0.35))
        return cv
    return paint


def c_cork():
    """A champagne cork: its swollen mushroom top, the dark burn of the brand."""
    cv = Cv(3, 3)
    fill_shape(cv, 1.5, 1.5, 1.05, 1.05, lambda u, v, L: shade(ramp('#c89a5a', 0.45, 0.22, 0.3), L))
    cv.dot(1.7, 1.7, hx('#7a5630'))
    cv.outline()
    return cv


def c_sock():
    """A sock lost by the machines, from above: a white tube sock lying bent at the heel, two red rings at its top,
    its sole gone grey."""
    cv = Cv(6, 4)
    wool = ramp('#e4e0d6', 0.4, 0.2, 0.3)
    frect(cv, 0.5, 0.5, 4.0, 2.0, wool[2])
    frect(cv, 3.0, 2.0, 5.5, 3.5, wool[2])
    frect(cv, 0.5, 1.5, 4.0, 2.0, wool[1])
    frect(cv, 3.5, 3.0, 5.5, 3.5, hx('#9a968e'))                      # the sole
    for x in (1.0, 2.0):
        frect(cv, x, 0.5, x + 0.5, 2.0, hx('#c8323a'))
    cv.outline()
    return cv


def c_card():
    """One playing card dropped face down: its red back, a white border."""
    cv = Cv(3, 4)
    frect(cv, 0.5, 0.5, 2.5, 3.5, hx('#f0ece0'))
    frect(cv, 1.0, 1.0, 2.0, 3.0, hx('#a8282e'))
    cv.outline()
    return cv


def c_chip():
    """One poker chip on the floor: red clay, its white edge spots."""
    cv = Cv(3, 3)
    fill_shape(cv, 1.5, 1.5, 1.05, 1.05, lambda u, v, L: shade(ramp('#d8303a', 0.45, 0.22, 0.3), L))
    for (x, y) in ((1.25, 0.75), (1.75, 2.25), (0.75, 1.75), (2.25, 1.25)):
        cv.dot(x, y, hx('#f0ece0'))
    cv.outline()
    return cv


def c_garter():
    """A garter lost by the stage: a ring of red satin edged in black lace, a small bow."""
    cv = Cv(6, 5)
    fill_shape(cv, 3.0, 2.6, 2.5, 1.9, lambda u, v, L: hx('#1c1018') if (u + v) % 0.9 < 0.45 else hx('#3a2430'))
    fill_shape(cv, 3.0, 2.6, 2.0, 1.45, lambda u, v, L: shade(ramp('#c01838', 0.45, 0.22, 0.4), L))
    fill_shape(cv, 3.0, 2.6, 1.2, 0.75, lambda u, v, L: CLEAR)
    fill_shape(cv, 4.6, 1.1, 0.8, 0.55, lambda u, v, L: hx('#e8a0b4') if L > 0.5 else hx('#c86888'), ang=-0.5)
    cv.outline()
    return cv


CLUTTER_PAINT = dict(pint_full=c_pint(1, 7110), pint_half=c_pint(0.5, 7111), pint_empty=c_pint(0, 7112), pitcher=c_pitcher,
                     shot=c_shot, lowball=c_lowball, beer_bottle=c_beer_bottle, liquor=c_liquor, ashtray=c_ashtray,
                     cigar=c_cigar, coaster=c_coaster, napkin=c_napkin, napkin_crumpled=c_napkin_crumpled,
                     peanuts=c_peanuts, till=c_till, cards=c_cards, chips=c_chips, bands=c_bands, bill=c_bill,
                     rubber_bands=c_rubber_bands, baggies=c_baggies, glass_broken=c_glass_broken,
                     flute=c_flute, flute_down=c_flute_down, bucket=c_bucket, single=c_single, singles=c_singles,
                     bill_crumpled=c_bill_crumpled, bill_folded=c_bill_folded, feather=c_feather(7132, 0.0),
                     feather_curl=c_feather(7133, 0.6), cork=c_cork, garter=c_garter, sock=c_sock, card=c_card,
                     chip=c_chip)
# world px (keep in step with CLUTTER_SPRITES in src/engine/Assets.js)
CLUTTER_SIZES = dict(pint_full=(5, 5), pint_half=(5, 5), pint_empty=(5, 5), pitcher=(8, 7), shot=(3, 3), lowball=(5, 5),
                     beer_bottle=(4, 4), liquor=(5, 5), ashtray=(6, 6), cigar=(7, 3), coaster=(5, 5), napkin=(5, 5),
                     napkin_crumpled=(4, 4), peanuts=(6, 6), till=(13, 10), cards=(7, 6), chips=(4, 4), bands=(7, 4),
                     bill=(5, 3), rubber_bands=(5, 5), baggies=(6, 4), glass_broken=(6, 6), flute=(4, 4), flute_down=(7, 3),
                     bucket=(9, 9), single=(5, 3), singles=(7, 5), bill_crumpled=(4, 4), bill_folded=(5, 3), feather=(5, 4),
                     feather_curl=(5, 4), cork=(3, 3), garter=(6, 5), sock=(6, 4), card=(3, 4), chip=(3, 3))


def wall_frame(W, frame, face, seed):
    """Something framed on a wall, seen from above (the wall at -y): the top of its frame along the wall, and below it,
    leaning out a little, a sliver of what it shows (face(cv, x0, x1, y0, y1)) under glass that catches the light."""
    cv = Cv(W, 5)
    fr = ramp(frame, 0.5, 0.25, 0.4)
    fill_shape(cv, W / 2, 1.5, W / 2 - 1, 0.6, lambda u, v, L: shade(fr, L), kind='rect', corner=0.2, bevel=0.3)
    frect(cv, 1.0, 2.0, W - 1.0, 4.0, fr[1])
    face(cv, 1.6, W - 1.6, 2.2, 3.8)
    for i in range(3):                                                 # the glass's glint
        cv.dot(2.5 + i * 0.5, 2.25 + i * 0.5, hx('#ffffff', 150))
    smudge(cv, random.Random(seed), 2, (1, 1, W - 1, 4), (0.8, 1.4), 0.15)
    cv.outline()
    return cv


def p_frame_photo():
    """An old signed photo in a black frame: two men shaking hands, in greys."""
    def face(cv, x0, x1, y0, y1):
        frect(cv, x0, y0, x1, y1, hx('#a8a49c'))
        frect(cv, x0, y0 + 1.0, x1, y1, hx('#8a867e'))
        for x in (x0 + 2.0, x1 - 3.0):
            frect(cv, x, y0 + 0.2, x + 1.0, y1, hx('#3a3836'))
        cv.dot(x1 - 1.0, y1 - 0.5, hx('#2a2a40'))
    return wall_frame(12, '#2a2628', face, 7120)


def p_frame_gold():
    """A gilt frame: a dark old painting in it, a red sky."""
    def face(cv, x0, x1, y0, y1):
        frect(cv, x0, y0, x1, y1, hx('#7a2a22'))
        frect(cv, x0, y0 + 0.8, x1, y1, hx('#3a2a3a'))
        frect(cv, x0 + 3.0, y0 + 0.5, x0 + 5.0, y1, hx('#1e1a22'))
    return wall_frame(14, '#c8a040', face, 7121)


def p_poster_fight():
    """A boxing bill behind a thin frame: cream paper, the red band of the date, two fighters squared up."""
    def face(cv, x0, x1, y0, y1):
        frect(cv, x0, y0, x1, y1, hx('#e2d6b4'))
        frect(cv, x0, y0, x1, y0 + 0.6, hx('#b8282e'))
        for x in (x0 + 3.0, x1 - 4.0):
            frect(cv, x, y0 + 0.7, x + 1.0, y1, hx('#2a2228'))
        frect(cv, x0 + 6.0, y0 + 1.0, x1 - 6.0, y0 + 1.5, hx('#2a2228'))
    return wall_frame(16, '#4a4448', face, 7122)


def p_poster_band():
    """A gig poster: black paper, a pink and a cyan stroke of a band's name."""
    def face(cv, x0, x1, y0, y1):
        frect(cv, x0, y0, x1, y1, hx('#1e1a26'))
        frect(cv, x0 + 1.0, y0 + 0.3, x1 - 2.0, y0 + 0.8, hx('#e83a8a'))
        frect(cv, x0 + 2.0, y0 + 1.2, x1 - 1.0, y0 + 1.6, hx('#3ad8e8'))
    return wall_frame(14, '#2a2a30', face, 7123)


def p_conduit():
    """A run of electrical conduit along a back-of-house wall (the wall at -y): a thin galvanised tube, two saddles
    screwed into the wall, a junction box with its cover plate, a little rust at the joints."""
    W = 48
    cv = Cv(W, 5)
    zinc = ramp('#868a94', 0.5, 0.25, 0.35)
    px_paint(cv, 1, 1.5, W - 1, 3.0, lambda x, y, c: zinc[3] if y < 2.0 else zinc[2] if y < 2.5 else zinc[0])
    for x in (7.0, 39.0):                                              # saddles
        frect(cv, x, 1.0, x + 1.5, 3.5, zinc[1])
        cv.dot(x + 0.25, 1.25, lt(zinc[3], 0.2))
    frect(cv, 20.0, 1.0, 26.0, 4.0, zinc[1])                           # the junction box, its cover lit along the top
    frect(cv, 20.0, 1.0, 26.0, 1.5, zinc[3])
    frect(cv, 20.5, 1.5, 25.5, 3.5, zinc[2])
    for x in (21.0, 25.0):
        stud(cv, x, 2.5, zinc[1])
    smudge(cv, random.Random(7131), 4, (1, 1, W - 1, 4), (0.5, 1.2), 0.4, hx('#7a4a26'))
    cv.outline()
    return cv


def p_flyers():
    """Bills pasted on a street wall, one over the other, seen from above (the wall at -y): slivers of faded paper, their
    lower edges torn ragged, a bare patch where one came off, a corner peeling away. No frame, no glass."""
    W = 26
    cv = Cv(W, 5)
    rng = random.Random(7132)
    # (x0, x1, paper, band colour or None, how far down it still hangs)
    bills = ((1.5, 7.0, '#cfc5a8', '#9a3a34', 3.4), (6.0, 11.5, '#b98a98', '#2a2630', 3.0),
             (13.0, 19.0, '#93a8b4', '#c8b25a', 3.6), (18.5, 24.5, '#c4b684', None, 3.2))
    for (x0, x1, paper, band, low) in bills:
        col, edge = hx(paper), {}

        def f(x, y, c, x0=x0, col=col, band=band, low=low, edge=edge):
            k = int(x * cv.s)
            if k not in edge:
                edge[k] = low - rng.choice((0.0, 0.0, 0.5, 0.5, 1.0))  # torn: never a straight edge
            if y >= edge[k]:
                return None
            if band and 1.5 <= y < 2.0 and x - x0 > 0.5:
                return hx(band)
            return dk(col, 0.25) if y < 1.5 else col if y < edge[k] - 0.5 else lt(col, 0.18)
        px_paint(cv, x0, 1.0, x1, 4.0, f)
    cv.dot(12.0, 1.5, hx('#b8b0a0'))                                   # what is left of the one that came off
    cv.dot(12.5, 1.0, hx('#a8a090'))
    for k in range(3):                                                 # a corner curling off the wall, lit
        frect(cv, 23.0 + k * 0.5, 3.0 + k * 0.5, 24.5, 3.5 + k * 0.5, hx('#e6dcb8'))
    smudge(cv, rng, 3, (1, 1, W - 1, 4), (0.8, 1.6), 0.18)
    cv.outline(hx('#1a1620', 170))
    return cv


def p_tag():
    """A tag sprayed on the ground of an alley, from above: three quick strokes of a name nobody reads and a line under
    it, the paint gone thin where feet and rain have been, a little overspray. No outline: it is in the concrete."""
    W, H = 30, 18
    cv = Cv(W, H)
    rng = random.Random(7133)
    nz = VNoise(W, H, 6, rng)
    strokes = (((3.0, 12.0), (6.0, 4.0), (9.0, 11.0), (12.0, 5.0), (14.0, 10.5)),
               ((16.5, 5.5), (20.0, 4.0), (21.5, 7.5), (17.5, 9.5), (16.5, 12.5), (21.0, 13.0), (25.0, 10.5)),
               ((4.0, 15.2), (14.0, 14.4), (26.0, 15.4), (24.2, 13.6)))
    paint = hx('#b0487a')

    def dist(x, y):
        best = 99.0
        for pts in strokes:
            for (ax, ay), (bx, by) in zip(pts, pts[1:]):
                dx, dy = bx - ax, by - ay
                t = max(0.0, min(1.0, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy)))
                best = min(best, math.hypot(x - ax - dx * t, y - ay - dy * t))
        for (ax, ay) in ((27.2, 5.0), (27.8, 7.6)):                    # two dots after it
            best = min(best, math.hypot(x - ax, y - ay) + 0.15)
        return best

    def f(x, y, c):
        d, worn = dist(x, y), nz(x, y)
        if d < 0.7:
            return None if worn < 0.34 else paint[:3] + (70 if worn < 0.5 else 118,)
        if d < 1.3 and rng.random() < 0.3 and worn > 0.4:
            return paint[:3] + (40,)                                   # overspray
        return None
    px_paint(cv, 0, 0, W, H, f)
    return cv


def p_dartboard():
    """A dartboard on the wall, seen from above: the black ring of its rim, the board's top half leaning out at us,
    the sectors black and cream, the red and green rings, two darts in it, their flights toward us."""
    cv = Cv(11, 5)
    cx, cy = 5.5, 1.2

    def board(u, v, L):
        if v < -0.05:
            return None
        d = math.hypot(u / 4.5, v / 3.2)
        if d > 0.86:
            return shade(ramp('#2a2428', 0.5, 0.25, 0.4), L)
        a = int((math.atan2(v, u) + math.pi) / (math.pi / 10))
        if 0.62 < d < 0.72 or d < 0.12:
            return hx('#c8282e') if a % 2 else hx('#2a8a4a')
        return hx('#e6dcc0') if a % 2 else hx('#1e1a1c')
    fill_shape(cv, cx, cy, 4.5, 3.2, board)
    for (x, y, col) in ((4.2, 2.2, '#3a6ad8'), (6.8, 1.8, '#e8c040')):
        line(cv, x, y, x + 0.5, y + 1.6, hx('#c8ccd4'))
        cv.dot(x + 0.5, y + 1.8, hx(col))
    cv.outline()
    return cv


def p_pay_phone():
    """A coin phone on the wall: its steel box with the keypad and the coin slot, the armoured cord (the receiver on
    its hook is drawn live, render/PropLife.js `handset`)."""
    cv = Cv(10, 7)
    steel = ramp('#7a808c', 0.5, 0.25, 0.4)
    fill_shape(cv, 5.0, 2.7, 4.0, 2.2, lambda u, v, L: shade(steel, L), kind='rect', corner=0.5, bevel=0.7)
    frect(cv, 1.0, 0.6, 9.0, 1.2, hx('#c8282e'))                       # the red band of its top
    for k in range(9):
        cv.dot(5.5 + (k % 3) * 0.9, 2.0 + (k // 3) * 0.8, hx('#d8dce4'))
    frect(cv, 8.3, 2.0, 8.7, 3.2, hx('#2a2a30'))                       # the coin slot
    fill_capsule(cv, [(3.5, 4.4), (3.0, 5.6), (3.8, 6.2)], 0.35, lambda k, L, s, i, t: shade(STEEL, L))
    cv.outline()
    return cv


def p_coat_hooks():
    """A brass rail of hooks by the door: a leather jacket and a grey raincoat hung on it, a hat on the last hook."""
    cv = Cv(18, 7)
    frect(cv, 1.0, 0.7, 17.0, 1.4, hx('#8a6a30'))
    for x in (3.0, 7.5, 12.0, 15.5):
        stud(cv, x, 1.0, BRASS[2], big=True)

    def coat(x, base, seed):
        r = ramp(base, 0.5, 0.25, 0.3)
        fill_shape(cv, x, 3.3, 2.8, 2.4, lambda u, v, L: shade(r, L) if v > -1.6 else None, kind='super', p=2.6)
        line(cv, x, 1.6, x, 5.4, dk(r[1], 0.2))                         # its fold down the middle
        smudge(cv, random.Random(seed), 2, (int(x - 2), 2, int(x + 2), 5), (0.8, 1.4), 0.2)
    coat(4.0, '#3a2a22', 7124)
    coat(9.0, '#6a6a62', 7125)
    fill_shape(cv, 15.2, 3.0, 1.9, 1.7, lambda u, v, L: shade(ramp('#2a2a34', 0.5, 0.25, 0.4), L))   # the hat
    ring(cv, 15.2, 3.0, 1.0, 1.3, lambda dx, dy, d: hx('#5a2a2a'))
    cv.outline()
    return cv


def p_towel_dispenser():
    """A paper towel dispenser: a white plastic box on the wall, a towel hanging out of its slot."""
    cv = Cv(9, 5)
    fill_shape(cv, 4.5, 2.0, 3.6, 1.4, lambda u, v, L: shade(ramp('#e8eaee', 0.35, 0.18, 0.2), L), kind='rect', corner=0.5, bevel=0.6)
    frect(cv, 3.0, 3.2, 6.0, 4.2, hx('#e8e2d2'))
    frect(cv, 3.0, 3.2, 6.0, 3.5, hx('#c8c0b0'))
    cv.outline()
    return cv


BAR_GLYPHS = {
    'B': ["####.", "#...#", "#...#", "####.", "#...#", "#...#", "####."],
    'Y': ["#...#", "#...#", ".#.#.", "..#..", "..#..", "..#..", "..#.."],
}


def bar_text(ne, x, y, text, col):
    font = {**FONT_SHOP, **BAR_GLYPHS}
    for ch in text:
        for gy, row in enumerate(font[ch]):
            for gx, c in enumerate(row):
                if c == '#':
                    ne.dot(x + gx, y + gy, col)
        x += len(font[ch][0]) + 1
    return x


def p_neon_sign_beer():
    """A small beer neon: an amber mug with its white head, BEER in red."""
    cv, gl = sign_backing(36, 14), Cv(36, 14)
    ne = Neon(36, 14)
    ne.line([(3, 4), (3, 11), (8, 11), (8, 4)], NEON_AMBER)
    ne.line([(9, 6), (10, 6), (10, 9), (9, 9)], NEON_AMBER)
    ne.line([(3, 3), (8, 3)], hx('#f4f0e6'))
    bar_text(ne, 12, 3, 'BEER', hx('#ff3a30'))
    ne.render(cv, gl)
    return cv, gl


def p_neon_sign_bay():
    """BAY, the town's lager, in pink over a cyan wave: the neon behind the bar."""
    cv, gl = sign_backing(26, 14), Cv(26, 14)
    ne = Neon(26, 14)
    bar_text(ne, 4, 2, 'BAY', NEON_PINK)
    pts = [(4 + k, 11 + (0 if k % 4 in (0, 1) else -1 if k % 4 == 2 else 1)) for k in range(18)]
    for (x, y) in pts:
        ne.dot(x, y, NEON_CYAN)
    ne.render(cv, gl)
    return cv, gl


def p_poster_pinup():
    """A pin-up print in a thin gilt frame: a hot pink ground, a black stockinged leg kicked up across it, a star."""
    def face(cv, x0, x1, y0, y1):
        frect(cv, x0, y0, x1, y1, hx('#d8508a'))
        line(cv, x0 + 2.0, y1 - 0.2, x0 + 6.5, y0 + 0.4, hx('#1a1218'))
        line(cv, x0 + 2.5, y1 - 0.2, x0 + 7.0, y0 + 0.4, hx('#1a1218'))
        cv.dot(x1 - 2.0, y0 + 0.8, hx('#f4d860'))
    return wall_frame(12, '#b08a3a', face, 7140)


def p_poster_revue():
    """A revue's bill: black paper, a gold band of lettering, a red feather fan, behind a thin black frame."""
    def face(cv, x0, x1, y0, y1):
        frect(cv, x0, y0, x1, y1, hx('#1e1a26'))
        frect(cv, x0 + 1.0, y0 + 0.3, x1 - 1.0, y0 + 0.8, hx('#d8b048'))
        for k in range(4):
            line(cv, x0 + 6.0, y1, x0 + 4.5 + k, y0 + 1.2, hx('#c8283a'))
    return wall_frame(14, '#2a2430', face, 7141)


def p_mirror_strip():
    """A long strip of mirror on the wall behind the stage, seen from above: its chrome edge along the wall, the glass
    leaning out a touch below it, the room's pink and a few glints caught in it."""
    W = 44
    cv = Cv(W, 4)
    rng = random.Random(7142)
    fill_shape(cv, W / 2, 1.0, W / 2 - 0.6, 0.55, lambda u, v, L: shade(STEEL_L, L), kind='rect', corner=0.2, bevel=0.3)
    nz = VNoise(W, 4, 9, rng)
    px_paint(cv, 1.0, 1.6, W - 1.0, 3.4, lambda x, y, c: mix(hx('#3a3048'), hx('#8a3a68'), 0.1 + 0.6 * nz(x, y)))
    for _ in range(3):
        x = rng.uniform(3, W - 5)
        line(cv, x, 3.3, x + 1.0, 1.7, hx('#d8c8e8'))
    cv.outline()
    return cv


def p_neon_sign_lips():
    """Red neon lips (no words), the tube's bow of the upper lip and the full lower lip, on a dark plate."""
    cv, gl = sign_backing(24, 12), Cv(24, 12)
    ne = Neon(24, 12)
    red = hx('#ff2a4a')
    ne.line([(3, 6), (5, 4), (7, 3), (9, 2), (10, 2), (11, 3), (12, 3), (13, 2), (14, 2), (16, 3), (18, 4), (20, 6)], red)
    ne.line([(3, 6), (20, 6)], red)
    ne.line([(3, 6), (5, 8), (8, 9), (15, 9), (18, 8), (20, 6)], red)
    ne.render(cv, gl)
    return cv, gl


def p_cocktail_table():
    """The VIP room's low table from above: a round top of smoked black glass in a chrome rim, the room's pink lying
    across it, its one foot dark under the glass, the rings of glasses put down on it."""
    S = 26
    cv = Cv(S, S)
    c = S / 2
    fill_shape(cv, c, c, 12.0, 12.0, lambda u, v, L: shade(STEEL_L, L))
    glass = ramp('#1e1428', 0.45, 0.22, 0.45)
    nz = VNoise(S, S, 7, random.Random(7143))
    fill_shape(cv, c, c, 11.0, 11.0, lambda u, v, L: mix(shade(glass, 0.5 - (u + v) / 50), hx('#c8508a'),
                                                         max(0.0, 0.22 - abs(u - v * 0.4 + 3.0) / 18) + 0.05 * nz(c + u, c + v)))
    fill_shape(cv, c, c, 4.0, 4.0, lambda u, v, L: dk(cv.get(c + u, c + v), 0.25))   # its foot under the glass
    for (x, y, r) in ((8.0, 17.5, 1.9), (16.5, 8.0, 1.5)):
        ring(cv, x, y, r - 0.35, r, lambda dx, dy, d, x=x, y=y: lt(cv.get(x + dx, y + dy), 0.12) if dx - dy > -1.5 else None)
    for (x, y) in ((7.0, 7.5), (8.0, 6.5), (18.5, 15.0)):
        cv.dot(x, y, hx('#f0e8f8'))
    cv.outline()
    return cv


BAR_PROPS = dict(frame_photo=p_frame_photo, frame_gold=p_frame_gold, poster_fight=p_poster_fight, poster_band=p_poster_band,
                 dartboard=p_dartboard, pay_phone=p_pay_phone, coat_hooks=p_coat_hooks, towel_dispenser=p_towel_dispenser,
                 neon_sign_beer=p_neon_sign_beer, neon_sign_bay=p_neon_sign_bay, poster_pinup=p_poster_pinup,
                 poster_revue=p_poster_revue, mirror_strip=p_mirror_strip, neon_sign_lips=p_neon_sign_lips,
                 cocktail_table=p_cocktail_table, conduit=p_conduit, flyers=p_flyers, tag=p_tag)
BAR_SIZES = dict(frame_photo=(12, 5), frame_gold=(14, 5), poster_fight=(16, 5), poster_band=(14, 5), dartboard=(11, 5),
                 pay_phone=(10, 7), coat_hooks=(18, 7), towel_dispenser=(9, 5), neon_sign_beer=(36, 14), neon_sign_bay=(26, 14),
                 poster_pinup=(12, 5), poster_revue=(14, 5), mirror_strip=(44, 4), neon_sign_lips=(24, 12), cocktail_table=(26, 26),
                 conduit=(48, 5), flyers=(26, 5), tag=(30, 18))
BAR_NEON = ['neon_sign_beer', 'neon_sign_bay', 'neon_sign_lips']   # light: at the world's density, with their glow maps


# --------------------------------------------------------------------------
# Glow maps for existing props
# --------------------------------------------------------------------------

def is_neon(c, sat=110, val=190):
    return c[3] > 0 and max(c[:3]) - min(c[:3]) >= sat and max(c[:3]) >= val


def glow_from(cv, pred):
    """Emissive map of a sprite: its pixels for which pred(x, y, colour) holds (x, y: the world px they lie in)."""
    gl = Cv(cv.w, cv.h, cv.s)
    s = cv.s
    for j in range(cv.ph):
        for i in range(cv.pw):
            c = cv.p[i, j]
            if pred(i // s, j // s, c):
                gl.p[i, j] = c
    return gl


# --------------------------------------------------------------------------
# Light fixtures (the visible sources of the lighting pass). Each returns (sprite, emissive map).
# Wall-mounted ones glow on their +y side (rotate the prop to face the room).
# --------------------------------------------------------------------------

HOT = hx('#fff6dc')


def lamp_core(cv, gl, cx, cy, r):
    """The bulb seen through the top of a shade."""
    fill_shape(cv, cx, cy, r, r, lambda u, v, L: HOT)
    fill_shape(gl, cx, cy, r, r, lambda u, v, L: (255, 246, 220, 200))


def p_floor_lamp():
    """Standard lamp from above: the cast foot showing past the pleated shade, the shade's wire ring, the bulb."""
    cv, gl = Cv(16, 16), Cv(16, 16)
    foot = ramp('#3a3442', 0.5, 0.25, 0.4)
    fill_shape(cv, 9.5, 9.5, 4.2, 4.2, lambda u, v, L: shade(foot, L))
    ring(cv, 9.5, 9.5, 3.4, 3.8, lambda dx, dy, d: lt(foot[3], 0.2) if dx + dy < 0 else None)
    pleated(cv, 8.0, 8.0, 2.0, 6.3, ramp('#c08a4c', 0.42, 0.2, 0.35))
    for a in (0.6, 2.7, 4.8):                                          # the wire spider holding the shade
        line(cv, 8.0 + math.cos(a) * 1.6, 8.0 + math.sin(a) * 1.6, 8.0 + math.cos(a) * 2.6, 8.0 + math.sin(a) * 2.6, hx('#5a4a3a'))
    lamp_core(cv, gl, 8.0, 8.0, 1.7)
    cv.dot(7.5, 7.5, hx('#ffffff'))
    cv.outline()
    ring(gl, 8.0, 8.0, 2.0, 6.3, lambda dx, dy, d: (255, 176, 96, int(70 - 8 * d)))
    return cv, gl


def p_table_lamp():
    """Side table with a lamp on it, from above: the round walnut top and its moulded edge, the pleated shade, the
    bulb, a coaster and the lamp's cord running off the edge."""
    cv, gl = Cv(18, 18), Cv(18, 18)
    wood = ramp('#6a4026', 0.45, 0.22, 0.3)
    wood_fill(cv, 1, 1, 16, 16, wood[2], plank=6, rng=random.Random(5683), mask=lambda x, y: math.hypot(x + 0.5 - 9, y + 0.5 - 9) <= 8.0)
    ring(cv, 9.0, 9.0, 7.0, 8.0, lambda dx, dy, d: shade(wood, light(dx / d * 0.9, dy / d * 0.9)))   # the moulded edge
    ring(cv, 9.0, 9.0, 6.6, 7.0, lambda dx, dy, d: wood[0])
    ring(cv, 4.6, 13.0, 1.0, 1.5, lambda dx, dy, d: dk(cv.get(4.6 + dx, 13.0 + dy), 0.2))   # a glass's ring
    line(cv, 11.0, 12.0, 15.6, 15.0, hx('#1a1418'))                    # the cord
    pleated(cv, 9.0, 9.0, 1.6, 5.2, ramp('#d98a5a', 0.42, 0.2, 0.35))
    lamp_core(cv, gl, 9.0, 9.0, 1.6)
    cv.dot(8.5, 8.5, hx('#ffffff'))
    cv.outline()
    ring(gl, 9.0, 9.0, 1.6, 5.2, lambda dx, dy, d: (255, 170, 110, int(90 - 10 * d)))
    return cv, gl


def p_wall_lamp():
    """Wall lamp (the wall at -y): a brass backplate with its two screws, a frosted glass half dome, hot where the bulb
    is, a dead moth in it."""
    cv, gl = Cv(14, 7), Cv(14, 7)
    fill_shape(cv, 7.0, 0.9, 4.6, 0.9, lambda u, v, L: shade(BRASS, L), kind='rect', corner=0.4, bevel=0.5)
    for x in (3.5, 10.0):
        stud(cv, x, 0.5, BRASS[1])

    def dome(u, v, L):
        if v < 0:
            return None
        k = math.hypot(u / 5.0, v / 4.4)
        c = HOT if k < 0.45 else mix(HOT, hx('#ffe2a8'), (k - 0.45) / 0.3) if k < 0.75 else mix(hx('#ffe2a8'), hx('#e0a058'), (k - 0.75) / 0.25)
        return c
    fill_shape(cv, 7.0, 2.0, 5.0, 4.4, dome)
    for k in range(5):                                                 # the frosting's ribs
        a = 0.35 + k * 0.6
        line(cv, 7.0 + math.cos(a) * 3.0, 2.0 + math.sin(a) * 3.0, 7.0 + math.cos(a) * 4.2, 2.0 + math.sin(a) * 4.0, hx('#f0c880'))
    cv.dot(9.0, 4.0, hx('#5a4a3a'))                                    # the moth
    cv.outline()
    fill_shape(gl, 7.0, 2.0, 5.0, 4.4, lambda u, v, L: None if v < 0 else (255, 226, 170, 170 if math.hypot(u / 5.0, v / 4.4) < 0.82 else 90))
    return cv, gl


def tube_fixture(col, hot):
    """Batten on the wall with a glowing tube under it."""
    def make():
        cv, gl = Cv(30, 5), Cv(30, 5)
        m = ramp('#4a4858', 0.5, 0.25, 0.4)
        cv.rect(0, 0, 29, 1, m[2])
        cv.rect(0, 0, 29, 0, m[3])
        for x0 in (0, 28):
            cv.rect(x0, 0, x0 + 1, 3, m[1])
        cv.rect(2, 2, 27, 2, hot)
        cv.rect(2, 3, 27, 3, col)
        cv.outline()
        for x in range(2, 28):
            cv.set(x, 4, alpha(col, 120))
            gl.set(x, 2, hot)
            gl.set(x, 3, col)
            gl.set(x, 4, alpha(col, 120))
        return cv, gl
    return make


def pleated(cv, cx, cy, r0, r1, base, n=16):
    """A pleated fabric shade from above, the bulb's light through it: the pleats running out from the top ring, lit
    on the side facing the lamp in the room, the rolled hem."""
    def f(dx, dy, d):
        a = math.atan2(dy, dx)
        p = math.sin(a * n)
        L = 0.3 + 0.75 * light(dx / d * 0.75, dy / d * 0.75) + p * 0.08
        col = shade(base, L)
        if d > r1 - 0.6:
            col = dk(col, 0.18) if dx + dy > 0 else lt(col, 0.12)      # the hem
        elif d < r0 + 0.5:
            col = lt(col, 0.3)                                         # the glow at the top ring
        return col
    ring(cv, cx, cy, r0, r1, f)


def p_tube_light():
    """A fluorescent batten on the wall (-y): the steel channel with its end caps and screws, the tube's pins, the tube
    hot down its middle, a darkened end where it is wearing out, the light it throws on the wall below."""
    cv, gl = Cv(30, 5), Cv(30, 5)
    col, hot = hx('#cfe6ff'), hx('#ffffff')
    m = ramp('#4a4858', 0.5, 0.25, 0.4)
    frect(cv, 0, 0, 30, 2, m[2])
    frect(cv, 0, 0, 30, 0.5, m[3])
    frect(cv, 0, 1.5, 30, 2, m[1])
    for x0 in (0, 28):
        fill_shape(cv, x0 + 1.0, 2.0, 1.0, 2.0, lambda u, v, L: shade(m, L), kind='rect', corner=0.4)   # end caps
        stud(cv, x0 + 0.75, 0.75, m[1])

    def tube(x, y, c):
        t = (y - 2.0) / 2.0
        k = hot if 0.25 < t < 0.55 else col if t < 0.8 else alpha(col, 200)
        if x > 25.5:
            k = mix(k, hx('#8a96a8'), 0.5)                             # the end going grey
        return k
    px_paint(cv, 2, 2, 28, 4, tube)
    for x in (2.0, 27.5):
        frect(cv, x, 2.5, x + 0.5, 3.5, hx('#c8ccd6'))                 # the pins
    cv.outline()
    px_paint(gl, 2, 2, 28, 4, lambda x, y, c: hot if 2.5 <= y < 3.0 else col)
    frect(cv, 2, 4.0, 28, 5.0, alpha(col, 110))
    frect(gl, 2, 4.0, 28, 5.0, alpha(col, 120))
    return cv, gl


def p_ceiling_lamp():
    """Enamel pendant shade from above: its green dome lit from the side, the brass rim and the rivets of the
    cord-grip at the top, the bulb seen past it, the light leaking under the rim."""
    cv, gl = Cv(18, 18), Cv(18, 18)
    enamel = ramp('#2f5a48', 0.5, 0.25, 0.4)
    ring(cv, 9.0, 9.0, 2.2, 7.4, lambda dx, dy, d: shade(enamel, 0.25 + 0.85 * light(dx / d * 0.8, dy / d * 0.8)) if not
         (abs(d - 4.6) < 0.25) else dk(enamel[1], 0.2))
    ring(cv, 9.0, 9.0, 6.7, 7.4, lambda dx, dy, d: shade(BRASS, light(dx / d * 0.9, dy / d * 0.9)))
    ring(cv, 9.0, 9.0, 2.2, 3.0, lambda dx, dy, d: shade(BRASS, light(dx / d, dy / d)))   # the cord-grip
    for k in range(6):
        a = k * math.pi / 3
        stud(cv, 9.0 + math.cos(a) * 2.6, 9.0 + math.sin(a) * 2.6, BRASS[1])
    smudge(cv, random.Random(5734), 3, (3, 3, 15, 15), (0.6, 1.2), 0.5, hx('#e8e4d8'))   # chips in the enamel
    lamp_core(cv, gl, 9.0, 9.0, 2.2)
    cv.dot(8.5, 8.5, hx('#ffffff'))
    cv.outline()
    ring(gl, 9.0, 9.0, 7.0, 8.9, lambda dx, dy, d: (255, 214, 150, int(150 - 70 * (d - 7.0))))   # light leaking under the rim
    return cv, gl


def p_pool_lamp():
    """Billiard light over the table: a long green enamel hood with its brass trim and end caps, the vents over each of
    its three bulbs, the chains' eyes, the light spilling under its long edges."""
    cv, gl = Cv(46, 12), Cv(46, 12)
    enamel = ramp('#1f6a44', 0.5, 0.25, 0.4)
    fill_shape(cv, 23.0, 6.0, 22.0, 5.0, lambda u, v, L: shade(enamel, L), kind='rect', bevel=3.0, corner=2.0)
    frect(cv, 3, 1.0, 43, 1.5, BRASS[3])                               # brass trim along both edges
    frect(cv, 3, 1.5, 43, 2.0, BRASS[2])
    frect(cv, 3, 10.0, 43, 10.5, BRASS[1])
    for x in (1.5, 44.5):
        fill_shape(cv, x, 6.0, 1.0, 4.0, lambda u, v, L: shade(BRASS, L), kind='rect', corner=0.8)   # end caps
    for cx in (11.0, 23.0, 35.0):
        frect(cv, cx - 3.0, 4.5, cx + 3.0, 7.5, dk(enamel[1], 0.3))
        for k in range(5):
            frect(cv, cx - 2.5 + k * 1.2, 5.0, cx - 2.0 + k * 1.2, 7.0, HOT)   # the vents, the bulb seen through
        frect(gl, cx - 3.0, 4.5, cx + 3.0, 7.5, (255, 246, 220, 200))
    for x in (6.0, 40.0):
        ring(cv, x, 6.0, 0.5, 1.0, lambda dx, dy, d: shade(BRASS, light(dx / d, dy / d)))   # chain eyes
    smudge(cv, random.Random(5746), 4, (4, 3, 42, 9), (1.0, 2.0), 0.12)
    cv.outline()
    frect(gl, 0, 0, 46, 1.0, (255, 214, 150, 110))
    frect(gl, 0, 11.0, 46, 12, (255, 214, 150, 110))
    return cv, gl


LIGHT_PROPS = dict(floor_lamp=p_floor_lamp, table_lamp=p_table_lamp, wall_lamp=p_wall_lamp,
                   tube_light=p_tube_light,
                   neon_tube_pink=tube_fixture(NEON_PINK, lt(NEON_PINK, 0.6)),
                   neon_tube_cyan=tube_fixture(NEON_CYAN, lt(NEON_CYAN, 0.6)),
                   ceiling_lamp=p_ceiling_lamp, pool_lamp=p_pool_lamp, emergency_light=p_emergency_light)
LIGHT_SIZES = dict(floor_lamp=(16, 16), table_lamp=(18, 18), wall_lamp=(14, 7), tube_light=(30, 5),
                   neon_tube_pink=(30, 5), neon_tube_cyan=(30, 5), ceiling_lamp=(18, 18), pool_lamp=(46, 12),
                   emergency_light=(8, 5))


# --------------------------------------------------------------------------
# Overhead dressing: things mounted up high, drawn above everyone with a little parallax.
# --------------------------------------------------------------------------

def p_string_lights():
    """A sagging cable of party bulbs strung between two walls."""
    W, H = 128, 10
    cv, gl = Cv(W, H), Cv(W, H)
    cols = [hx('#ffd27a'), hx('#ff6b8a'), hx('#ffe9a0'), hx('#7fe8ff')]
    for x in range(W):
        y = 1 + int(round(5.0 * math.sin(math.pi * x / (W - 1))))
        cv.set(x, y, hx('#1c1826'))
        if x % 12 == 6:
            c = cols[(x // 12) % len(cols)]
            for dx in (0, 1):
                for dy in (1, 2):
                    cv.set(x + dx, y + dy, lt(c, 0.25))
                    gl.set(x + dx, y + dy, lt(c, 0.25))
            for dx, dy in ((-1, 1), (-1, 2), (2, 1), (2, 2), (0, 3), (1, 3)):
                gl.set(x + dx, y + dy, alpha(c, 100))
    return cv, gl


LIGHT_PROPS.update(string_lights=p_string_lights)
LIGHT_SIZES.update(string_lights=(128, 10))


# --------------------------------------------------------------------------
# Rooftop dressing: plant, skylights and stair heads on the flat roofs of the neighbouring buildings.
# Scenery painted once on the wall layer (render/MapRenderer.js), listed in src/game/data/roofs.js.
# The lit ones return (sprite, emissive map).
# --------------------------------------------------------------------------

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


ROOF_PROPS = dict(ac_unit=r_ac_unit, vent=r_vent, duct=r_duct, hatch=r_hatch, chimney=r_chimney, tank=r_tank,
                  antenna=r_antenna, bulkhead=r_bulkhead, skylight=skylight(hx('#f0a850')),
                  skylight_tv=skylight(hx('#6aa0e8')), skylight_dark=skylight(hx('#2a3448'), lit=False),
                  rail_bed=lambda: r_rail_bed())
ROOF_SIZES = dict(ac_unit=(46, 32), vent=(14, 14), duct=(64, 12), hatch=(22, 22), chimney=(20, 20), tank=(50, 50),
                  antenna=(34, 34), bulkhead=(62, 54), skylight=(46, 30), skylight_tv=(46, 30), skylight_dark=(46, 30),
                  rail_bed=(148, 32))
ROOF_GLOWING = ['bulkhead', 'skylight', 'skylight_tv']
# the plant on the roofs is painted at FINE density like the props (three of them are props on the walkable roof);
# the lit pieces stay at the world's (keep in step with ROOF_FINE in src/engine/Assets.js)
ROOF_FINE = {'ac_unit', 'vent', 'duct', 'hatch', 'chimney', 'tank', 'antenna', 'rail_bed'}


# --------------------------------------------------------------------------
# Structure
# --------------------------------------------------------------------------

DOOR_WOOD = ramp('#a86a38', 0.5, 0.24, 0.34)
ALU = ramp('#9aa0b0', 0.5, 0.26, 0.4)
SILL = ramp('#625e72', 0.5, 0.24, 0.3)


def _leaf(w):
    """Door leaf seen from above, hinge at x = 0, latch at x = 31. Rows 1..7 = the leaf, rows 0 and 8 = what sticks
    out of its faces (handle). Door.js keeps both ends and tiles the middle (x 8..19) to the leaf length."""
    cv = Cv(32, 9)
    for x in range(1, 31):
        cv.set(x, 2, w[3])
        for y in (3, 4, 5):
            cv.set(x, y, w[2])
        cv.set(x, 6, w[1])
    # long quiet grain, no pattern
    for x, y, n in ((9, 3, 5), (17, 5, 6), (3, 4, 3), (24, 4, 3)):
        for k in range(n):
            cv.set(x + k, y, mix(w[2], w[1], 0.55))
    # stiles at both ends (end grain)
    for x in (1, 30):
        for y in range(2, 7):
            cv.set(x, y, mix(cv.get(x, y), w[0], 0.45))
    cv.outline()
    # hinge: two steel knuckles on the faces, the pin between them
    for x in (2, 3, 4):
        cv.set(x, 1, STEEL_L[3] if x == 3 else STEEL_L[2])
        cv.set(x, 7, STEEL_L[1])
    cv.rect(2, 3, 3, 5, STEEL[0])
    cv.set(2, 3, STEEL_L[3])
    cv.set(3, 3, STEEL_L[2])
    cv.set(2, 4, STEEL_L[2])
    # latch plate on the edge
    cv.rect(30, 3, 30, 5, STEEL_L[2])
    return cv


def s_door():
    cv = _leaf(DOOR_WOOD)
    # lever handle on each face: the rose on the leaf, the brass lever proud of it
    for y, c0, c1 in ((0, BRASS[3], BRASS[2]), (8, BRASS[2], BRASS[1])):
        cv.rect(22, y, 26, y, c1)
        cv.rect(25, y, 26, y, c0)
        cv.set(21, y, OUTLINE)
        cv.set(27, y, OUTLINE)
    cv.set(26, 1, BRASS[2])
    cv.set(26, 7, BRASS[1])
    return cv


def s_stall_door():
    """A restroom stall's door from above, hinge at x = 0: a thinner laminate leaf in the partitions' sea-green, the
    chrome slide latch and its red / green tell-tale at the free end, a coat hook on the inside face."""
    cv = _leaf(ramp('#6f8f86', 0.45, 0.24, 0.32))
    for x in (26, 27, 28):                                              # the slide latch, both faces
        cv.set(x, 1, CHROME[3] if x == 27 else CHROME[2])
        cv.set(x, 7, CHROME[2] if x == 27 else CHROME[1])
    cv.set(29, 1, hx('#3aa05a'))                                        # vacant
    cv.set(14, 7, CHROME[3])                                            # the coat hook
    cv.set(14, 8, CHROME[1])
    return cv


def s_door_locked():
    """Reinforced door: the same leaf under steel straps, a lock case through it and a dead bolt in the edge."""
    cv = _leaf(ramp('#8a5a36', 0.5, 0.24, 0.3))
    for x0 in (8, 15):
        for y in range(1, 8):
            cv.set(x0, y, STEEL_L[3] if y < 3 else STEEL_L[2] if y < 6 else STEEL_L[1])
            cv.set(x0 + 1, y, STEEL_L[2] if y < 3 else STEEL_L[1] if y < 6 else STEEL_L[0])
        cv.set(x0, 4, STEEL[0])        # rivet
    # lock case, proud of both faces
    cv.rect(21, 0, 28, 8, OUTLINE)
    cv.rect(22, 1, 27, 7, STEEL_L[1])
    cv.rect(22, 1, 27, 2, STEEL_L[3])
    cv.rect(22, 3, 27, 5, STEEL_L[2])
    cv.rect(24, 3, 25, 5, BRASS[2])    # cylinder
    cv.set(24, 3, BRASS[3])
    cv.set(25, 5, BRASS[0])
    cv.set(24, 4, OUTLINE)             # keyhole
    cv.rect(29, 3, 31, 5, STEEL_L[3])  # dead bolt
    cv.rect(29, 5, 31, 5, STEEL_L[1])
    return cv


# ---- door skins: one kind of door per place (src/game/data/doors.js DOORS.kinds), painted at FINE density. A leaf
# seen from above is a long thin plank: what tells the kinds apart is its colour, its edges and what stands proud of
# its faces (rows 0-1 and 7-8: a push bar, plates, a chain), a glass strip where it has glass. Hinge at x = 0, the
# latch end at the far end; Door.js keeps both ends and tiles the middle to the leaf's length (its kind's `caps`).

def _plank(w, n=32, grain=()):
    """The leaf's body in the ramp w, rows 2..6 (lit top edge, dark bottom), end stiles; grain: (x, y, len) streaks."""
    cv = Cv(n, 9)
    for x in range(1, n - 1):
        cv.set(x, 2, w[3])
        for y in (3, 4, 5):
            cv.set(x, y, w[2])
        cv.set(x, 6, w[1])
    for x, y, k in grain:
        for i in range(k):
            cv.dot(x + i * 0.5, y + 0.25, mix(w[2], w[1], 0.5))
    for x in (1, n - 2):
        for y in range(2, 7):
            cv.set(x, y, mix(cv.get(x, y), w[0], 0.45))
    return cv


def _knuckles(cv, steel=STEEL_L):
    """Two hinge knuckles proud of the faces, the pin in the leaf's end."""
    for x in (2, 3, 4):
        cv.set(x, 1, steel[3] if x == 3 else steel[2])
        cv.set(x, 7, steel[1])
    cv.rect(2, 3, 3, 5, STEEL[0])
    cv.set(2, 3, steel[3])
    cv.set(3, 3, steel[2])


def _lever(cv, x, col=BRASS):
    """A lever handle on each face near the latch: the rose, the lever proud of it."""
    for y, c0, c1 in ((0, col[3], col[2]), (8, col[2], col[1])):
        cv.rect(x, y, x + 4, y, c1)
        cv.rect(x + 3, y, x + 4, y, c0)
        cv.set(x - 1, y, OUTLINE)
        cv.set(x + 5, y, OUTLINE)
    cv.set(x + 4, 1, col[2])
    cv.set(x + 4, 7, col[1])


def _latch_plate(cv, n=32):
    cv.rect(n - 2, 3, n - 2, 5, STEEL_L[2])


def _glass(cv, x0, x1, y0=3, y1=5, tint='#a8d0e4', wire=None):
    """A glass strip through the leaf: pale, a glint; wire: the mesh of wired glass."""
    g = ramp(tint, 0.35, 0.18, 0.3)
    for x in range(x0, x1 + 1):
        for y in range(y0, y1 + 1):
            cv.set(x, y, g[2] if y > y0 else g[3])
    cv.dot(x0 + 0.5, y0 + 0.5, hx('#f4fbff'))
    cv.dot(x0 + 1.0, y0 + 0.5, hx('#f4fbff'))
    if wire:
        s = cv.s
        for j in range(y0 * s, (y1 + 1) * s):
            for i in range(x0 * s, (x1 + 1) * s):
                if (i + j) % 4 == 0 or (i - j) % 4 == 0:
                    cv.p[i, j] = hx(wire)


def _shatter(cv, x0, x1, y0=3, y1=5, keep_wire=None):
    """The glass gone out of its strip: a few shards left at the edges (the wire of wired glass holds)."""
    s = cv.s
    rng = random.Random(x0 * 31 + x1)
    for j in range(y0 * s, (y1 + 1) * s):
        for i in range(x0 * s, (x1 + 1) * s):
            if keep_wire and cv.p[i, j] == hx(keep_wire):
                continue
            edge = min(i - x0 * s, (x1 + 1) * s - 1 - i)
            cv.p[i, j] = hx('#d8ecf6') if edge == 0 and rng.random() < 0.45 else CLEAR
    return cv


def s_door_fire():
    """The emergency exit: a heavy grey steel leaf, a red push bar across its inside face on two housings, a brushed
    kick plate on the other, scuffs."""
    w = ramp('#7c828e', 0.5, 0.25, 0.36)
    cv = _plank(w, 32, ((6, 3, 10), (19, 5, 12)))
    for x, y in ((7, 4), (8.5, 5), (13, 3), (21, 4), (25.5, 5), (11, 5)):
        cv.dot(x, y + 0.25, w[0])                                   # scuffs
    cv.outline()
    _knuckles(cv)
    red = ramp('#d0262c', 0.45, 0.22, 0.32)
    for x in range(8, 27):                                          # the push bar, proud of the face on its housings
        cv.set(x, 8, red[2])
        cv.dot(x, 8.0, red[3])
    for x in (6, 7, 27, 28):
        cv.set(x, 7, STEEL[1])
        cv.set(x, 8, STEEL[0] if x in (6, 28) else STEEL[2])
    cv.set(5, 8, OUTLINE)
    cv.set(29, 8, OUTLINE)
    for x in range(4, 28):                                          # the kick plate on the other face
        cv.dot(x, 1.5, STEEL_L[3] if x % 3 else STEEL_L[2])
    _latch_plate(cv)
    return cv


def _door_bar():
    """The bar's front: dark varnished wood, a round porthole of glass in a brass ring, a brass push plate on the
    street face and a pull bar on the other."""
    w = ramp('#5c3424', 0.5, 0.24, 0.38)
    cv = _plank(w, 32, ((3, 3, 6), (17, 5, 10), (20, 3, 6)))
    cv.rect(9, 2, 14, 6, BRASS[1])                                  # the porthole's ring
    cv.rect(9, 2, 14, 2, BRASS[3])
    _glass(cv, 10, 13)
    cv.outline()
    _knuckles(cv)
    cv.rect(20, 1, 25, 1, BRASS[2])                                 # the push plate, flat on the face
    cv.rect(20, 1, 21, 1, BRASS[3])
    for x in range(20, 26):                                         # the pull bar on its standoffs
        cv.set(x, 8, BRASS[2] if x % 2 else BRASS[3])
    cv.set(20, 7, BRASS[1])
    cv.set(25, 7, BRASS[1])
    cv.set(19, 8, OUTLINE)
    cv.set(26, 8, OUTLINE)
    cv.rect(3, 7, 7, 7, BRASS[1])                                   # the kick plate's edge
    _latch_plate(cv)
    return cv


def s_door_bar():
    return _door_bar()


def s_door_bar_broken():
    return _shatter(_door_bar(), 10, 13)


def s_door_swing():
    """Half of the toilets' swinging doors (a cafe pair): a short teal-painted leaf of louvres on a double-action
    pivot, a white MEN plate, a chrome push plate on each face; no latch."""
    w = ramp('#4f8c80', 0.45, 0.22, 0.34)
    cv = _plank(w, 16)
    s = cv.s
    for i in range(4 * s, 13 * s):                                  # the louvres' slats, one in two pixels
        if i % 2 == 0:
            for j in range(3 * s, 6 * s):
                cv.p[i, j] = w[1]
    cv.outline()
    cv.rect(1, 3, 2, 5, STEEL[1])                                   # the pivot: a steel boss at its foot
    cv.set(1, 3, STEEL_L[3])
    cv.rect(6, 1, 9, 1, hx('#e8e6dc'))                              # the plate: MEN
    cv.dot(7.5, 1.5, hx('#2a4ca0'))
    cv.dot(8.0, 1.5, hx('#2a4ca0'))
    for y in (1, 7):
        cv.rect(11, y, 13, y, CHROME[2] if y == 1 else CHROME[1])   # push plates
    return cv


def s_door_staff():
    """A storeroom / staff door: a plain institutional blue-grey paint, chipped and scuffed low, a white STAFF ONLY
    plate, a steel lever."""
    w = ramp('#5d6e82', 0.5, 0.24, 0.32)
    cv = _plank(w, 32)
    for x, y, c in ((5, 5, w[0]), (6.5, 5, w[0]), (9, 4, hx('#8d8a82')), (24, 5, w[0]), (14, 5, w[0]), (15, 3, hx('#8d8a82'))):
        cv.dot(x, y + 0.25, c)                                      # scuffs and chipped paint (the grey undercoat)
    cv.outline()
    _knuckles(cv)
    cv.rect(11, 1, 18, 1, hx('#e6e2d6'))                            # STAFF ONLY
    for x in range(11, 18):
        cv.dot(x + 0.25, 1.5, hx('#2a2430'))
    _lever(cv, 22, CHROME)
    _latch_plate(cv)
    return cv


def s_door_office():
    """The boss's door: oxblood leather buttoned in diamonds over padding, brass studs round its faces, a brass
    lever."""
    w = ramp('#6c1e26', 0.5, 0.26, 0.3)
    cv = _plank(w, 32)
    for k, x in enumerate(range(5, 28, 3)):                         # the buttons, diamond-tufted
        y = 3 if k % 2 else 5
        cv.dot(x, y + 0.25, w[0])
        cv.dot(x + 0.5, y - 0.25, w[3])
    cv.outline()
    _knuckles(cv)
    for x in range(5, 29, 2):                                       # brass studs along both faces
        cv.dot(x + 0.25, 1.75, BRASS[3])
        cv.dot(x + 0.25, 7.25, BRASS[2])
    _lever(cv, 22)
    _latch_plate(cv)
    return cv


def s_door_gaming():
    """The gaming room's door: a deep green gloss with a gold pinstripe on its top edge, a brass peephole through
    it, a brass lever."""
    w = ramp('#2a5a3c', 0.5, 0.24, 0.36)
    cv = _plank(w, 32)
    for x in range(3, 29):
        cv.dot(x + 0.25, 2.75, BRASS[2])                            # the pinstripe
    cv.rect(15, 3, 16, 5, BRASS[1])                                 # the peephole through the leaf
    cv.dot(15.5, 4.0, OUTLINE)
    cv.outline()
    _knuckles(cv)
    cv.set(15, 1, BRASS[3])
    cv.set(15, 7, BRASS[2])
    _lever(cv, 22)
    _latch_plate(cv)
    return cv


def s_door_flat():
    """A cheap flat's door: a thin oak-effect laminate, a brass number on the corridor face, a peephole, the security
    chain hanging on its track inside."""
    w = ramp('#a27c54', 0.45, 0.22, 0.3)
    cv = _plank(w, 32, ((4, 3, 14), (14, 5, 18)))
    cv.outline()
    _knuckles(cv)
    cv.rect(12, 1, 14, 1, BRASS[2])                                 # the number
    cv.dot(12.5, 1.5, OUTLINE)
    cv.dot(13.5, 1.5, OUTLINE)
    cv.set(16, 1, BRASS[3])                                         # the peephole's lens
    cv.rect(25, 7, 28, 7, CHROME[2])                                # the chain's track ...
    for k, x in enumerate((24, 23, 22, 21.5)):                      # ... and the chain hanging off it
        cv.dot(x + 0.5, 8.0 + (0.5 if k % 2 else 0), CHROME[3] if k % 2 else CHROME[1])
    _lever(cv, 22, CHROME)
    _latch_plate(cv)
    return cv


def _door_wired():
    """A corridor fire door: cream-painted steel, a long panel of wired glass, a steel push plate."""
    w = ramp('#b9ae92', 0.45, 0.22, 0.3)
    cv = _plank(w, 32)
    _glass(cv, 8, 20, tint='#b4d2c8', wire='#56645e')
    cv.outline()
    _knuckles(cv)
    for y in (1, 7):
        cv.rect(22, y, 26, y, STEEL_L[2] if y == 1 else STEEL_L[1])
    _latch_plate(cv)
    return cv


def s_door_wired():
    return _door_wired()


def s_door_wired_broken():
    return _shatter(_door_wired(), 8, 20, keep_wire='#56645e')


def _door_shop():
    """A shop's glass door: an aluminium frame round a pane the length of it, a pull bar on each face."""
    alu = ramp('#b2b8c4', 0.45, 0.22, 0.3)
    cv = _plank(alu, 32)
    _glass(cv, 5, 26, tint='#94c0d8')
    cv.outline()
    _knuckles(cv)
    for y, c in ((0, CHROME[3]), (8, CHROME[2])):
        cv.rect(22, y, 26, y, c)
        cv.set(21, y, OUTLINE)
        cv.set(27, y, OUTLINE)
    for y in (1, 7):
        cv.set(22, y, CHROME[1])
        cv.set(26, y, CHROME[1])
    _latch_plate(cv)
    return cv


def s_door_shop():
    return _door_shop()


def s_door_shop_broken():
    return _shatter(_door_shop(), 5, 26)


DOOR_SKINS = dict(door_fire=s_door_fire, door_bar=s_door_bar, door_bar_broken=s_door_bar_broken, door_swing=s_door_swing,
                  door_staff=s_door_staff, door_office=s_door_office, door_gaming=s_door_gaming, door_flat=s_door_flat,
                  door_wired=s_door_wired, door_wired_broken=s_door_wired_broken, door_shop=s_door_shop,
                  door_shop_broken=s_door_shop_broken)
DOOR_SKIN_SIZES = dict((n, (16, 9) if n == 'door_swing' else (32, 9)) for n in DOOR_SKINS)


def s_jamb(w):
    """Door frame post set into the end of a wall (5 px wide across the 32 px of wall): x = 4 faces the opening."""
    cv = Cv(5, 32)
    cv.rect(0, 0, 4, 31, OUTLINE)
    for y in range(1, 31):
        cv.set(1, y, w[1])
        cv.set(2, y, w[3])
        cv.set(3, y, w[2])
    for y in (1, 30):                  # casing on both wall faces
        cv.rect(1, y, 3, y, w[3])
    cv.rect(1, 15, 3, 16, mix(w[1], w[0], 0.5))   # joint where the stop sits
    return cv


def s_threshold():
    """Floor of a doorway (one tile of a run along x): the reveal in the wall's shade and a worn metal sill bar."""
    cv = Cv(32, 32)
    for y in range(32):
        d = abs(y - 15.5) / 15.5
        for x in range(32):
            cv.set(x, y, (16, 10, 24, int(96 - 44 * d)))
    cv.rect(0, 12, 31, 12, OUTLINE)
    cv.rect(0, 19, 31, 19, OUTLINE)
    for x in range(32):
        cv.set(x, 13, STEEL_L[2])
        cv.set(x, 14, STEEL_L[1])
        for y in (15, 16):
            cv.set(x, y, STEEL[2])
        cv.set(x, 17, STEEL[1])
        cv.set(x, 18, STEEL[0])
    for x in (5, 26):                  # screws
        cv.set(x, 15, STEEL[0])
        cv.set(x, 16, STEEL_L[2])
    return cv


def s_window_sill():
    """Window ledge (one tile of a run along x): the wall cut down to sill height, lower and darker than its top."""
    cv = Cv(32, 32)
    rng = random.Random(77)
    for y in range(32):
        for x in range(32):
            c = SILL[2]
            if y in (2, 3):
                c = SILL[3]
            elif y in (27, 28, 29):
                c = SILL[1]
            elif 10 <= y <= 21:
                c = mix(SILL[2], SILL[1], 0.5)      # the rebate the frame sits in
            cv.set(x, y, tint(c, rng.uniform(-3, 3)))
    cv.rect(0, 0, 31, 1, OUTLINE)
    cv.rect(0, 30, 31, 31, OUTLINE)
    cv.rect(0, 12, 31, 19, mix(SILL[0], OUTLINE, 0.5))   # glazing channel: dark once the glass is gone
    return cv


def _window_frame(cv, mullion):
    cv.rect(0, 0, 31, 0, OUTLINE)
    cv.rect(0, 9, 31, 9, OUTLINE)
    for x in range(32):
        cv.set(x, 1, ALU[3])
        cv.set(x, 8, ALU[1])
    for x0 in (0, 29):                 # end posts
        cv.rect(x0, 1, x0 + 2, 8, ALU[2])
        cv.rect(x0, 1, x0 + 2, 2, ALU[3])
        cv.rect(x0, 7, x0 + 2, 8, ALU[1])
        xi = x0 + 2 if x0 == 0 else x0
        cv.rect(xi, 2, xi, 7, OUTLINE)
    if mullion:
        cv.rect(15, 1, 16, 8, ALU[2])
        cv.rect(15, 1, 16, 2, ALU[3])
        cv.rect(15, 7, 16, 8, ALU[1])
        cv.rect(14, 2, 14, 7, OUTLINE)
        cv.rect(17, 2, 17, 7, OUTLINE)


def s_window():
    """Glazed window seen from above (along x, 10 px across): aluminium rails and posts, a glazing bar, tinted glass."""
    cv = Cv(32, 10)
    for x in range(3, 29):
        cv.set(x, 2, (214, 250, 255, 205))
        cv.set(x, 3, (150, 226, 240, 170))
        cv.set(x, 4, (118, 206, 228, 160))
        cv.set(x, 5, (104, 192, 222, 160))
        cv.set(x, 6, (86, 168, 208, 170))
        cv.set(x, 7, (60, 128, 178, 200))
    # reflections: two slanted glints per pane
    for x0 in (5, 9, 20, 24):
        for k in range(4):
            cv.set(x0 + k, 6 - k, (255, 255, 255, 235))
            if x0 in (5, 20):
                cv.set(x0 + k + 1, 6 - k, (236, 252, 255, 200))
    _window_frame(cv, True)
    return cv


def s_window_broken():
    """The same frame with the glass gone: teeth left in the rebates, the glazing bar snapped."""
    cv = Cv(32, 10)
    _window_frame(cv, False)
    g0, g1 = (226, 252, 255, 240), (150, 220, 240, 215)
    # (x, from the top rail?, depth): shards standing in both rails
    for x, top, d in ((4, 1, 3), (5, 1, 2), (9, 1, 1), (12, 1, 2), (19, 1, 1), (22, 1, 3), (23, 1, 2), (27, 1, 1),
                      (6, 0, 1), (10, 0, 2), (11, 0, 3), (18, 0, 2), (21, 0, 1), (26, 0, 3), (27, 0, 2)):
        for k in range(d):
            cv.set(x, 2 + k if top else 7 - k, g0 if k == 0 else g1)
    # daggers left against the posts
    for x, y in ((3, 3), (4, 4), (3, 4), (3, 5), (28, 4), (27, 5), (28, 5), (28, 6)):
        cv.set(x, y, g1 if (x + y) % 2 else g0)
    # stubs of the snapped glazing bar
    for y, c in ((2, ALU[2]), (7, ALU[1])):
        cv.rect(15, y, 16, y, c)
    cv.set(15, 3, ALU[1])
    cv.set(16, 6, ALU[0])
    return cv


def s_fence():
    cv = Cv(32, 6)
    w = ramp('#8a6440', 0.45, 0.22, 0.3)
    for x in range(1, 31):
        cv.set(x, 2, w[3])
        cv.set(x, 3, w[1])
    for x in range(5, 28, 4):
        cv.rect(x, 1, x + 1, 4, w[2])
        cv.set(x, 1, w[3])
        cv.set(x + 1, 4, w[1])
    cv.outline()
    for x0 in (0, 29):
        cv.rect(x0, 0, x0 + 2, 5, w[1])
        cv.rect(x0, 0, x0 + 2, 0, w[2])
        cv.set(x0 + 1, 1, w[3])
        cv.rect(x0, 5, x0 + 2, 5, OUTLINE)
        cv.rect(x0 + 2 if x0 == 0 else x0, 0, x0 + 2 if x0 == 0 else x0, 5, w[0])
    return cv


# --------------------------------------------------------------------------
# Street fauna (systems/Critters.js, drawn by render/CritterArt.js): pigeons, rats and the cat, at FINE density like
# the people, facing +x, a frame for each step of their few gaits. Real size times BODY_SCALE (1.3, the people's), so
# that they sit right beside them: a pigeon 32 cm, a rat 20 cm and its 18 cm tail, the cat 46 cm and its 25 cm tail.
# Each is built of rounded parts measured in cm, lit by the slope of the whole as the torsos are (relief_paint).
# --------------------------------------------------------------------------

CRIT_CM = 32 * 1.3 * FINE / 100.0   # sprite px per cm


class Beast:
    """An animal from above: rounded parts (height fields, cm about its middle, which lies on the pixel (ox, oy) of a
    w x h canvas). A pixel belongs to the highest part over it and is lit by the slope of the whole."""

    def __init__(self, w, h, ox, oy):
        self.w, self.h, self.ox, self.oy = w, h, ox, oy
        self.parts = []

    def ell(self, name, cx, cy, rx, ry, hz, z=0.0, ang=0.0, p=2.0):
        """A half ellipsoid standing z cm off the floor; colour gets (u, v): cm from its middle along / across it."""
        ca, sa = math.cos(ang), math.sin(ang)

        def f(x, y):
            dx, dy = x - cx, y - cy
            u, v = dx * ca + dy * sa, -dx * sa + dy * ca
            e = (abs(u) / rx) ** p + (abs(v) / ry) ** p
            return (z + hz * math.sqrt(1.0 - e), u, v) if e < 1.0 else None
        self.parts.append((name, f))

    def tube(self, name, pts, r0, r1, hz, z=0.0, flip=False):
        """A round tube along pts (a tail, a leg, a wing) from r0 to r1 cm thick; colour gets (s, d): the share of its
        length from the first point, and the signed cm from its line (> 0 on its left, toward -y going along +x; on
        its right with flip, for the other one of a pair)."""
        sgn = 1 if flip else -1
        segs, total = [], 0.0
        for (ax, ay), (bx, by) in zip(pts, pts[1:]):
            ln = math.hypot(bx - ax, by - ay) or 1e-9
            segs.append((ax, ay, bx - ax, by - ay, ln, total))
            total += ln

        def f(x, y):
            best = None
            for ax, ay, dx, dy, ln, s0 in segs:
                t = max(0.0, min(1.0, ((x - ax) * dx + (y - ay) * dy) / (ln * ln)))
                d = math.hypot(x - ax - dx * t, y - ay - dy * t)
                if best is None or d < best[0]:
                    best = (d, (s0 + t * ln) / total, ((x - ax) * dy - (y - ay) * dx) / ln)
            d, s, side = best
            r = r0 + (r1 - r0) * s
            return (z + hz * (r / r0) * math.sqrt(1.0 - (d / r) ** 2), s, sgn * side) if d < r else None
        self.parts.append((name, f))

    def paint(self, colour, seed):
        """colour(name, a, b, L, X, Y) -> rgba or None (a, b: the part's own coordinates, X, Y: cm about the middle)."""
        cv = Cv(self.w, self.h, 1)
        H, Q = {}, {}
        for y in range(self.h):
            for x in range(self.w):
                X, Y = (x + 0.5 - self.ox) / CRIT_CM, (y + 0.5 - self.oy) / CRIT_CM
                best = None
                for name, f in self.parts:
                    r = f(X, Y)
                    if r and (best is None or r[0] > best[1][0]):
                        best = (name, r)
                if best:
                    H[(x, y)], Q[(x, y)] = best[1][0], best
        Ls = {}
        for (x, y), h in H.items():
            # (slopes eased: at this size a steep one breaks a part into bands of tone)
            gx = (H.get((x + 1, y), 0.0) - H.get((x - 1, y), 0.0)) * 0.4 * CRIT_CM
            gy = (H.get((x, y + 1), 0.0) - H.get((x, y - 1), 0.0)) * 0.4 * CRIT_CM
            L = max(0.0, (-gx * LX - gy * LY + LZ) / math.sqrt(gx * gx + gy * gy + 1.0))
            name, (_, a, b) = Q[(x, y)]
            # in the shade of a higher part on the side of the light
            for q in ((x - 1, y), (x, y - 1), (x - 1, y - 1)):
                if q in Q and Q[q][0] != name and H[q] - h > 0.9:
                    L *= 0.62
                    break
            Ls[(x, y)] = L
            c = colour(name, a, b, L, (x + 0.5 - self.ox) / CRIT_CM, (y + 0.5 - self.oy) / CRIT_CM)
            # right under the edge of a part well above it, or of a head: a dark seam
            if c is not None and any(q in Q and Q[q][0] != name and H[q] > h and (H[q] - h > 1.6 or Q[q][0] == 'head')
                                     and name not in ('muzzle', 'beak', 'ear') for q in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1))):
                c = dk(c, 0.42)
            if c is not None:
                cv.p[x, y] = c
        rng = random.Random(seed)
        n = VNoise(self.w, self.h, 4, rng)
        for (x, y) in H:
            c = cv.p[x, y]
            if c[3]:
                cv.p[x, y] = shift(c, int(round((n(x, y) - 0.5) * 6)) + rng.randint(-1, 1))
        # the ink, softened to a deep shade of the fur along the side toward the light
        add = []
        for (x, y) in H:
            if not cv.p[x, y][3]:
                continue
            for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                q = (x + dx, y + dy)
                if cv.pok(*q) and cv.p[q][3] < 100:
                    add.append((q, dk(cv.p[x, y], 0.62) if Ls[(x, y)] > 0.8 and dx + dy < 0 else OUTLINE))
        for q, c in add:
            if cv.p[q][3] < 100 or c == OUTLINE:
                cv.p[q] = c
        return cv

    def at(self, X, Y):
        """The pixel under the point (X, Y) cm."""
        return int(math.floor(self.ox + X * CRIT_CM)), int(math.floor(self.oy + Y * CRIT_CM))

    def dot(self, cv, X, Y, c):
        x, y = self.at(X, Y)
        if cv.pok(x, y) and cv.p[x, y][3]:
            cv.p[x, y] = c


# ---- the pigeon: blue-grey, two black bars on each wing, a pale rump, a green and purple sheen on the neck

PIG = ramp('#8a92a4', 0.5, 0.25, 0.3)
PIG_WING = ramp('#9ca4b4', 0.5, 0.25, 0.28)
PIG_DARK = ramp('#3e4250', 0.45, 0.22, 0.3)
PIG_HEAD = ramp('#646a82', 0.45, 0.22, 0.38)
PIG_PALE = ramp('#b8bec9', 0.42, 0.2, 0.25)
PIG_GREEN = ramp('#2fa078', 0.5, 0.25, 0.35)
PIG_PURPLE = ramp('#9a4a9a', 0.5, 0.25, 0.35)
PIG_SHEEN = tuple(mix(g, p, 0.5) for g, p in zip(PIG_GREEN, PIG_PURPLE))
PIG_FOOT = ramp('#d8848c', 0.45, 0.22, 0.25)
PIG_BEAK = hx('#2c2a32')
PIG_CERE = hx('#e6e2da')
PIG_EYE = hx('#c8501c')
PIG_BLOOD = hx('#7a1010')


def pig_colour(name, a, b, L, X, Y):
    if name == 'tail':
        return tone(PIG_DARK if a < -2.6 else PIG, L)               # the black band at its end
    if name == 'rump':
        return tone(PIG_PALE, L)
    if name == 'body':
        return tone(PIG, L)
    if name == 'wing':                                               # folded over the back
        if a < -5.6:
            return tone(PIG_DARK, L, 1)                              # the flight feathers, crossed over the rump
        if abs(b) < 3.0 and (-1.6 < a < -0.4 or -4.0 < a < -2.8):
            return tone(PIG_DARK, L)                                 # the two bars
        return tone(PIG_WING, L)
    if name in ('inner', 'outer'):                                   # spread: a along it from the body, b ahead of it
        if name == 'outer' and (a > 0.45 or b < -2.0):
            return tone(PIG_DARK, L, 1 if a > 0.7 else 0)            # the flight feathers, dark toward the tip
        if name == 'inner' and (-1.8 < b < -0.9 or -3.6 < b < -2.7) and a < 0.85:
            return tone(PIG_DARK, L)                                 # the two bars, along the wing
        if b < -4.2:
            return tone(PIG_DARK, L, 1)                              # its trailing edge
        return tone(PIG_WING, L)
    if name == 'neck':
        # the sheen turns from purple in the shade to green where the light catches it
        return tone(PIG_GREEN if L > 0.8 else PIG_SHEEN if L > 0.6 else PIG_PURPLE, L)
    if name == 'head':
        return tone(PIG_HEAD, L)
    if name == 'beak':
        return PIG_CERE if a < -0.4 else PIG_BEAK
    if name == 'foot':
        return tone(PIG_FOOT, L)
    if name == 'feather':
        return tone(PIG_DARK, L) if a < -0.6 else tone(PIG_PALE, L)  # its quill
    if name == 'belly':
        return tone(PIG_PALE, L)
    return None


def pig_head(b, cx, cy, z, r=2.7, ang=0.0):
    """Head and beak, (cx, cy) its middle, turned by ang; returns where its eyes are, either side."""
    ca, sa = math.cos(ang), math.sin(ang)
    b.ell('head', cx, cy, r, r * 0.86, 2.2, z=z, ang=ang)
    b.ell('beak', cx + ca * (r + 0.9), cy + sa * (r + 0.9), 1.5, 0.6, 0.5, z=z + 0.4, ang=ang)
    return [(cx + ca * 0.3 - sa * s * r * 0.62, cy + sa * 0.3 + ca * s * r * 0.62) for s in (-1, 1)]


def pigeon(head=0.0, peck=False, feet=()):
    """On the ground: head = cm the head is thrust forward (its bob as it walks), peck = head down to the ground,
    feet = the pink toes showing under the breast. 32 x 24 px (16 x 12 world px)."""
    b = Beast(32, 24, 15, 12)
    b.ell('tail', -11.4, 0, 4.6, 2.4, 1.0, z=0.8)
    b.ell('body', 0.0, 0, 7.6, 6.2, 3.6, z=1.0)
    for s in (-1, 1):
        b.ell('wing', -2.4, s * 2.6, 7.2, 3.6, 2.0, z=3.0, ang=-s * 0.1)
    for fx, fy in feet:
        b.ell('foot', fx, fy, 1.6, 0.8, 0.4)
    if peck:
        b.tube('neck', [(5.4, 0), (10.0, 0)], 3.4, 2.4, 2.0, z=1.2)
        eyes = pig_head(b, 11.8, 0, 0.2, r=2.6)
    else:
        b.ell('neck', 6.2 + head * 0.4, 0, 2.6, 3.6, 2.8, z=1.8)
        eyes = pig_head(b, 9.8 + head, 0, 3.6, r=3.2)
    cv = b.paint(pig_colour, 41 + int(head * 10) + len(feet) * 3 + peck)
    b.dot(cv, *eyes[0], PIG_EYE)                                     # the eye on the side of the light
    return cv


def pigeon_fly(k):
    """On the wing, from above: k 0 wings up (seen short), 1 level (the whole span, 65 cm), 2 down and forward.
    32 x 56 px (16 x 28 world px)."""
    b = Beast(32, 56, 16, 28)
    span, sweep = (0.56, 1.0, 0.8)[k], (-3.4, -1.4, 1.2)[k]
    b.ell('tail', -11.2, 0, 5.0, 3.8, 0.8, z=0.8)                    # fanned
    b.ell('rump', -6.0, 0, 3.6, 3.2, 2.2, z=1.0)
    b.ell('body', 0.8, 0, 7.0, 4.8, 3.4, z=1.0)
    b.ell('neck', 5.8, 0, 3.2, 3.4, 3.0, z=2.0)
    eyes = pig_head(b, 9.2, 0, 3.4, r=2.5)
    for s in (-1, 1):
        wrist, tip = (0.4 + sweep * 0.4, s * (3.6 + 12.5 * span)), (-4.6 + sweep, s * (3.6 + 27.0 * span))
        b.tube('inner', [(1.0, s * 2.8), wrist], 5.6, 4.8, 1.2, z=3.2, flip=s > 0)
        b.tube('outer', [wrist, tip], 4.8, 1.4, 1.0, z=3.0, flip=s > 0)
    cv = b.paint(pig_colour, 61 + k)
    for X, Y in eyes:
        b.dot(cv, X, Y, PIG_EYE)
    return cv


def pigeon_dead():
    """Dead on its side, its breast toward +y: a wing flung out, its pink feet curled, a few feathers about it.
    32 x 24 px (16 x 12 world px)."""
    b = Beast(32, 24, 16, 12)
    b.ell('tail', -11.0, 1.2, 4.6, 2.2, 0.8, z=0.4, ang=0.12)
    b.ell('body', -0.4, 0.8, 7.8, 4.4, 3.0, z=0.6)
    b.ell('belly', 0.6, 3.2, 6.0, 1.8, 1.2, z=1.6)
    b.ell('neck', 6.2, 1.6, 3.0, 3.0, 2.6, z=0.8, ang=0.3)
    eyes = pig_head(b, 9.6, 3.4, 0.8, r=2.4, ang=0.9)               # the head fallen back
    b.tube('inner', [(1.0, -2.0), (-1.6, -8.6)], 4.6, 4.2, 1.0, z=2.4)
    b.tube('outer', [(-1.6, -8.6), (-8.6, -11.8)], 4.2, 1.4, 0.8, z=2.2)
    for fx in (-0.6, 2.2):
        b.tube('foot', [(fx, 4.8), (fx + 0.8, 7.4), (fx + 2.0, 7.8)], 0.55, 0.45, 0.4)
    for X, Y, a in ((-10.8, -5.6, 0.5), (8.2, -6.6, -0.9), (-14.6, 6.8, 2.2), (12.6, 8.0, 0.3)):
        b.ell('feather', X, Y, 1.9, 0.7, 0.3, ang=a)
    cv = b.paint(pig_colour, 77)
    b.dot(cv, *eyes[1], PIG_BEAK)                                     # shut
    for X, Y in ((7.0, 3.4), (7.8, 2.6), (6.2, 4.0)):
        b.dot(cv, X, Y, PIG_BLOOD)
    return cv


# ---- the rat: brown-grey, a darker line down its back, pink ears, feet and tail

RAT = ramp('#86705e', 0.5, 0.26, 0.38)
RAT_BACK = ramp('#5a4a40', 0.5, 0.26, 0.3)
RAT_BELLY = ramp('#a69284', 0.45, 0.22, 0.25)
RAT_TAIL = ramp('#b88a88', 0.45, 0.22, 0.25)
RAT_PINK = ramp('#d49a96', 0.45, 0.22, 0.25)
RAT_EYE = hx('#0c0a10')
RAT_NOSE = hx('#e8a8a8')


def rat_colour(name, a, b, L, X, Y):
    if name in ('haunch', 'back', 'head'):
        return tone(RAT_BACK if abs(b) < 0.8 and name != 'head' else RAT, L)   # the darker line down its spine
    if name == 'snout':
        return tone(RAT, L, 1) if a < 0.6 else tone(RAT_PINK, L)
    if name == 'ear':
        return tone(RAT_PINK, L) if a > -0.2 else tone(RAT_PINK, L, -1)
    if name == 'tail':
        return tone(RAT_TAIL, L, -1 if a < 0.15 else 0)
    if name == 'paw':
        return tone(RAT_PINK, L)
    if name == 'belly':
        return tone(RAT_BELLY, L) if abs(b) < 2.2 else tone(RAT, L)
    return None


def rat(k=1, idle=False):
    """Running, k: 0 stretched out, 1 between, 2 bunched up, its hind feet by its front feet; idle: crouched, head up.
    40 x 16 px (20 x 8 world px), the middle of its body (not of its tail) on the middle of the canvas."""
    b = Beast(40, 16, 20, 8)
    st, wd, arch = ((1.16, 0.88, 0.0), (1.0, 1.0, 0.3), (0.84, 1.12, 0.8))[k]
    if idle:
        st, wd, arch = 0.9, 1.1, 0.6
    hx_ = 6.8 * st
    b.ell('haunch', -4.0 * st, 0, 5.6 * st, 3.9 * wd, 2.6 + arch, z=0.6)
    b.ell('back', 1.6 * st, 0, 5.2 * st, 3.2 * wd, 2.4 + arch * 0.6, z=0.6)
    b.ell('head', hx_, 0, 3.2, 2.2, 2.0, z=0.8)
    b.ell('snout', hx_ + 2.7, 0, 1.6, 1.1, 1.4, z=0.8)
    for s in (-1, 1):
        b.ell('ear', hx_ - 1.0, s * 2.0, 1.0, 1.0, 1.2, z=2.0)
    feet = (((8.2, 2.2), (-11.0, 2.6)), ((5.6, 2.8), (-5.4, 3.8)), ((3.4, 2.8), (0.8, 4.2)))[k]
    if idle:
        feet = ((5.4, 2.4), (-3.0, 3.8))
    for (fx, fy), r in zip(feet, (0.9, 1.3)):
        for s in (-1, 1):
            b.ell('paw', fx, s * fy, r, 0.6, 0.4)
    # the tail from the base of its back, whipping from side to side as it runs
    sw = 1.2 if idle else (-1.6, 0.6, 2.0)[k]
    t0 = -9.4 * st
    b.tube('tail', [(t0, 0), (t0 - 6, sw * 0.6), (t0 - 12, sw * 1.4), (t0 - 18, sw * 0.4 - (1.4 if idle else 0))],
           0.8, 0.4, 0.6, z=0.2)
    cv = b.paint(rat_colour, 90 + k + idle * 5)
    for s in (-1, 1):
        b.dot(cv, hx_ + 1.0, s * 1.3, RAT_EYE)
    b.dot(cv, hx_ + 4.0, 0, RAT_NOSE)
    return cv


def rat_dead():
    """Dead on its back, its pale belly up, the four pink feet curled in the air, the tail in a loop. 40 x 16 px."""
    b = Beast(40, 16, 20, 7)
    b.ell('belly', -0.8, 0, 8.4, 3.4, 2.6, z=0.4)
    b.ell('head', 7.8, 0.4, 3.0, 2.2, 1.8, z=0.4, ang=0.15)
    b.ell('snout', 10.4, 0.8, 1.5, 1.0, 1.2, z=0.4, ang=0.15)
    for (x0, y0, x1, y1) in ((4.2, -2.6, 5.8, -4.6), (4.6, 2.6, 6.4, 4.4), (-4.8, -2.8, -3.6, -5.2), (-5.2, 2.8, -4.4, 5.0)):
        b.tube('paw', [(x0, y0), (x1, y1)], 0.75, 0.6, 0.8, z=1.4)
    pts = [(-8.8, 0.4)] + [(-14.0 + 3.8 * math.cos(a), 3.0 + 3.8 * math.sin(a))
                           for a in (math.radians(d) for d in range(-110, 200, 30))]
    b.tube('tail', pts, 0.9, 0.4, 0.5, z=0.2)
    cv = b.paint(rat_colour, 97)
    b.dot(cv, 11.6, 0.8, RAT_NOSE)
    for X, Y in ((8.6, -1.2), (3.0, 0.4), (2.4, 1.0)):
        b.dot(cv, X, Y, PIG_BLOOD)
    return cv


# ---- the cat: a ginger street tabby, its stripes across the back and rings round the tail, a cream muzzle, bib
# and paws (it reads on the dark asphalt), eyes that catch the light

CAT = ramp('#d48238', 0.5, 0.26, 0.3)
CAT_STRIPE = ramp('#9a521e', 0.5, 0.26, 0.3)
CAT_CREAM = ramp('#eee2cc', 0.42, 0.2, 0.2)
CAT_EAR = ramp('#c8786e', 0.45, 0.22, 0.25)
CAT_EYE = hx('#d4f06a')
CAT_NOSE = hx('#d47c80')
CAT_W, CAT_H, CAT_O = 66, 30, (38, 15)   # 33 x 15 world px; the middle of its body (not of its tail) on (19, 7.5)


def cat_colour(bib=False, flank=False):
    def colour(name, a, b, L, X, Y):
        if bib and name == 'hips':                                   # sitting: stripes round the haunches
            r = math.hypot(a, b)
            return tone(CAT_STRIPE if (abs(b) < 0.7 and a < 0) or (r > 3.6 and math.sin(math.atan2(b, a) * 5) > 0.75) else CAT, L)
        if name in ('hips', 'chest', 'neck'):
            if bib and name == 'chest' and a > 0.8 and abs(b) < 3.8:
                return tone(CAT_CREAM, L)                            # its chest, under the chin
            if abs(b) < 0.8 and name != 'neck':
                return tone(CAT_STRIPE, L)                           # the line down its spine
            w = (X + 0.16 * b * b) * 2 * math.pi / 5.0 + 0.6 * math.sin(Y * 0.9)   # bent back down the flanks
            return tone(CAT_STRIPE if math.sin(w) > 0.55 and abs(b) > 1.4 else CAT, L)
        if name == 'flank':                                          # lying on its side: the cream belly along +y
            if b > 3.0:
                return tone(CAT_CREAM, L)
            w = X * 2 * math.pi / 4.6 + 0.5 * math.sin(Y * 0.8)
            return tone(CAT_STRIPE if math.sin(w) > 0.45 and b < 1.6 or b < -5.0 else CAT, L)
        if name == 'head':
            if -3.4 < a < 0.6 and min(abs(b), abs(abs(b) - 1.7)) < 0.32 and not flank:
                return tone(CAT_STRIPE, L)                           # the M on its forehead
            return tone(CAT, L)
        if name == 'muzzle':
            return tone(CAT_CREAM, L)
        if name == 'ear':
            return tone(CAT_EAR, L) if a > 0.5 else tone(CAT, L, -1)
        if name == 'leg':
            return tone(CAT_CREAM, L) if a > 0.74 else tone(CAT, L, -1 if b < 0 else 0)
        if name == 'paw':
            return tone(CAT_CREAM, L)
        if name == 'tail':
            if a > 0.88 or (a * 7.5) % 1.0 < 0.34:
                return tone(CAT_STRIPE, L)                           # the rings, its tip dark
            return tone(CAT, L)
        return None
    return colour


def cat_head(b, hx_, hy, ang, z, r=1.0, ears_back=False):
    """Head, muzzle and ears facing ang, (hx_, hy) its middle; returns where its eyes are."""
    ca, sa = math.cos(ang), math.sin(ang)
    at = lambda u, v: (hx_ + u * ca - v * sa, hy + u * sa + v * ca)
    b.ell('head', hx_, hy, 4.4 * r, 4.9 * r, 3.0, z=z, ang=ang)
    b.ell('muzzle', *at(3.9 * r, 0), 1.9, 2.3, 1.4, z=z + 0.8, ang=ang)
    for s in (-1, 1):
        if ears_back:   # flat back along the skull
            b.ell('ear', *at(-2.2 * r, s * 3.6 * r), 2.0, 1.2, 1.0, z=z + 2.4, ang=ang + s * 0.4, p=1.3)
        else:
            b.ell('ear', *at(-0.5 * r, s * 4.4 * r), 2.4, 1.9, 2.0, z=z + 2.8, ang=ang - s * 0.55, p=1.2)
    return [at(3.0 * r, s * 2.0 * r) for s in (-1, 1)], at(5.6 * r, 0)


def cat(hip, chest, head, paws, tail, w=1.0, lift=0.0, ang=0.0, ears_back=False, seed=0):
    """A cat standing, walking or running: hip, chest = middles of its haunches and ribs, head = (x, y), paws =
    [(from, to)] legs from under its body to the paw, tail = the points of its tail from its root."""
    b = Beast(CAT_W, CAT_H, *CAT_O)
    zb = 1.0 + lift
    for p0, p1 in paws:
        b.tube('leg', [p0, p1], 1.5, 1.3, 1.0, z=0.4)
    b.tube('tail', tail, 1.8, 1.4, 1.4, z=zb * 0.6)
    dx, dy = chest[0] - hip[0], chest[1] - hip[1]
    b.ell('hips', (hip[0] + chest[0]) / 2, (hip[1] + chest[1]) / 2, math.hypot(dx, dy) / 2 + 7.4, 5.9 * w, 4.4, z=zb,
          ang=math.atan2(dy, dx))                                    # one long back, from the haunches to the shoulders
    eyes, nose = cat_head(b, head[0] + 0.4, head[1], ang, zb + 2.2, r=1.1, ears_back=ears_back)
    cv = b.paint(cat_colour(), 120 + seed)
    for X, Y in eyes:
        b.dot(cv, X, Y, CAT_EYE)
    b.dot(cv, *nose, CAT_NOSE)
    return cv


def legs(front, hind, fx=7.0, hx_=-11.0):
    """Four legs from under the shoulders (fx) and the hips (hx_) to the paws given."""
    return [((fx, math.copysign(2.6, y)), (x, y)) for x, y in front] + \
           [((hx_, math.copysign(3.0, y)), (x, y)) for x, y in hind]


def cat_walk(f):
    """Walking, f 0..3: a diagonal pair of paws forward, then passing, then the other pair; it sways."""
    sw = (1, 0, -1, 0)[f]
    front = [(9.0 + 3.6 * sw, -4.6), (9.0 - 3.6 * sw, 4.6)]
    hind = [(-12.0 - 3.4 * sw, -4.8), (-12.0 + 3.4 * sw, 4.8)]
    tail = [(-16.0, 0), (-21.0, sw * 0.8), (-26.0, sw * 2.0 + 1.0), (-29.0, sw * 2.4 + 3.2)]   # carried up, a hook at its end
    return cat((-9.0, sw * 0.4), (4.0, -sw * 0.3), (15.5, 0), legs(front, hind), tail, ang=-sw * 0.05, seed=f)


def cat_run(k):
    """Bolting, k: 0 stretched out (front paws far ahead, hind far back), 1 between, 2 gathered (the hind paws
    landing outside and ahead of the front ones, its back arched)."""
    if k == 0:
        return cat((-12.0, 0), (5.0, 0), (18.5, 0), legs([(24.0, -2.2), (22.0, 2.6)], [(-25.0, -2.4), (-23.0, 2.8)], 8.0, -14.0),
                   [(-19.0, 0), (-30.0, 0.4), (-40.0, 1.2)], w=0.86, seed=10)
    if k == 1:
        return cat((-9.0, 0), (4.0, 0), (15.5, 0), legs([(14.0, -3.8), (11.0, 4.0)], [(-17.0, -4.6), (-15.0, 4.8)]),
                   [(-16.0, 0), (-27.0, -0.8), (-37.0, -1.4)], seed=11)
    return cat((-6.0, 0), (3.0, 0), (13.5, 0), legs([(0.0, -4.0), (2.0, 4.2)], [(5.0, -6.6), (6.5, 6.4)], 6.0, -8.0),
               [(-13.0, 0), (-24.0, 0.8), (-34.0, 2.2)], w=1.12, lift=1.0, seed=12)


def cat_low():
    """Crouched low, slinking under a car: flattened and wider, elbows out, ears laid back, its tail low."""
    return cat((-9.0, 0), (5.0, 0), (17.0, 0), legs([(13.0, -6.4), (15.0, 6.2)], [(-14.0, -6.6), (-12.0, 6.8)]),
               [(-16.0, 0), (-27.0, 0.6), (-38.0, 0.2)], w=1.16, lift=-0.8, ears_back=True, seed=20)


def cat_sit():
    """Sitting, watching: round haunches, the chest up, the head up over the front paws, the tail wrapped round."""
    b = Beast(CAT_W, CAT_H, *CAT_O)
    pts = [(-2.0 + 8.8 * math.cos(math.radians(d)), 8.8 * math.sin(math.radians(d))) for d in (185, 160, 135, 110, 85, 62, 42)]
    b.tube('tail', pts, 1.8, 1.5, 1.2, z=0.2)
    for s in (-1, 1):
        b.ell('paw', 11.8, s * 2.4, 1.9, 1.4, 1.0, z=0.4)
    b.ell('hips', -4.0, 0, 6.0, 6.6, 4.4, z=1.0)
    b.ell('chest', 1.8, 0, 4.6, 4.8, 4.6, z=2.6)
    eyes, nose = cat_head(b, 7.0, 0, 0.0, 6.8, r=1.24)                # the head up, near the eye
    cv = b.paint(cat_colour(bib=True), 130)
    for X, Y in eyes:
        b.dot(cv, X, Y, CAT_EYE)
    b.dot(cv, *nose, CAT_NOSE)
    return cv


def cat_dead():
    """Dead on its side, its back toward -y, the legs stretched out from its cream belly, the tail limp."""
    b = Beast(CAT_W, CAT_H, *CAT_O)
    for p0, p1 in (((10.0, 3.0), (15.0, 11.0)), ((7.0, 3.5), (9.5, 11.5)), ((-9.0, 3.5), (-13.5, 11.0)), ((-12.0, 3.0), (-18.0, 9.6))):
        b.tube('leg', [p0, p1], 1.5, 1.2, 1.0, z=0.2)
    b.tube('tail', [(-15.0, -2.0), (-25.0, -3.4), (-34.0, -1.0), (-39.0, 3.4)], 1.7, 1.4, 1.2, z=0.2)
    b.ell('flank', 0.0, -1.0, 16.0, 6.0, 4.0, z=0.4)
    b.ell('head', 19.6, -0.6, 5.0, 4.4, 3.2, z=0.4, ang=0.1)
    b.ell('muzzle', 24.0, 1.0, 2.2, 2.0, 1.4, z=1.0, ang=0.3)
    b.ell('ear', 19.4, -4.8, 2.0, 1.5, 1.4, z=1.6, ang=-1.3, p=1.3)
    cv = b.paint(cat_colour(flank=True), 140)
    for X, Y in ((21.0, -1.4), (22.0, -1.2)):
        b.dot(cv, X, Y, CAT_STRIPE[0])                               # its eye, shut
    b.dot(cv, 25.8, 1.2, CAT_NOSE)
    for X, Y in ((23.0, 3.4), (24.2, 3.8), (21.6, 4.0), (16.0, 2.2)):
        b.dot(cv, X, Y, PIG_BLOOD)
    return cv


def critters():
    """The frames of the street fauna by name (critters/<name>.png)."""
    out = dict(pigeon_idle=pigeon(), pigeon_peck=pigeon(peck=True))
    for i, (head, feet) in enumerate([(2.0, [(5.4, -5.0)]), (0.6, []), (-0.8, [(5.4, 5.0)])]):
        out['pigeon_walk%d' % i] = pigeon(head, feet=feet)
    for k in range(3):
        out['pigeon_fly%d' % k] = pigeon_fly(k)
    out['pigeon_dead'] = pigeon_dead()
    out['rat_idle'] = rat(idle=True)
    for k in range(3):
        out['rat_run%d' % k] = rat(k)
    out['rat_dead'] = rat_dead()
    out['cat_sit'] = cat_sit()
    for f in range(4):
        out['cat_walk%d' % f] = cat_walk(f)
    for k in range(3):
        out['cat_run%d' % k] = cat_run(k)
    out['cat_low'] = cat_low()
    out['cat_dead'] = cat_dead()
    return out


# --------------------------------------------------------------------------
# Build
# --------------------------------------------------------------------------

# --------------------------------------------------------------------------
# Level 2A, the back road (docs/LEVEL2.md): the box lorry that backs out across the street (event 2), a canvas
# awning (the base of the shops' awnings), a neon sign.
LORRY_BOX = ramp('#d2cbb8', 0.5, 0.26, 0.3)
LORRY_CAB = ramp('#c8902c', 0.55, 0.3, 0.36)


def p_lorry():
    """A box lorry from above, 8.75 x 2.5 m, facing +x: the aluminium box body (roof ribs, its rails, a patch riveted
    on, the roll door's header at the tail), the chassis showing between it and the cab, the mustard cab (a short
    hood, the windshield, a sun visor, big mirrors, marker lamps), tail lamps and the white reversing lamps at the
    back corners (lit in the glow map: it is backing)."""
    k = Veh(280, 80, 40, 8801)
    box, cab = LORRY_BOX, LORRY_CAB
    k.shell(RUBBER, 200, 222, 27.0, 1, 1, crown=8.0)        # the chassis and the tank between cab and box
    k.shell(cab, 214, 278, 35.5, 5, 9, crown=2.6)           # the cab
    k.shell(box, 1, 208, 38.5, 3, 3, crown=9.0)             # the box body
    k.arches((240,), r=13)
    for x in range(14, 204, 16):                             # roof ribs
        k.line(x, 3, x, 39, lambda c, s: lt(c, 0.1), w=2)
        k.line(x + 1, 3, x + 1, 39, darken(0.12))
    k.line(3, 2, 206, 2, lambda c, s: lt(c, 0.22))           # the roof's side rails
    k.line(3, 3, 206, 3, darken(0.16))
    for x in (2, 3, 4):                                      # the roll door's header
        k.line(x, 3, x, 39, darken(0.3 if x == 4 else 0.18))
    k.line(205, 3, 205, 39, darken(0.25))                    # the front bulkhead's cap
    for y in range(8, 34):                                   # a patch riveted on the roof, off the centre (one side)
        for x in range(118, 150):
            edge = y in (8, 33) or x in (118, 149)
            k.put(x, y, (lambda c, s: dk(c, 0.2)) if edge else (lambda c, s: lt(c, 0.07)), both=False)
    for (x, y) in ((120, 10), (147, 10), (120, 31), (147, 31), (133, 10), (133, 31)):
        k.dot(x, y, CHROME[2], both=False)
    for y in range(54, 67):                                  # a translucent roof light, the other side
        for x in range(60, 96):
            k.put(x, y, (lambda c, s, x=x, y=y: mix(c, hx('#9aa6a8'), 0.5 if (x + y) % 9 else 0.3)), both=False)
    k.panel(cab, 222, 250, 30.5, r=3, crown=4.0, lift=0.04)  # the cab's roof
    k.line(250, 6, 250, 39, darken(0.35))                    # the sun visor over the screen
    k.line(251, 6, 251, 39, lambda c, s: lt(c, 0.12))
    k.trap(252, 262, 30.5, 32.5, sheen=3)                    # windshield
    for y in (15.0, 51.0):                                   # through it: two seats, the wheel, the dash, a thermos
        k.inside(252.0, y, 255.5, y + 14.0, hx('#5a4a3a'), 0.3)
    k.wheel(258.0, 24.0, 4.6)
    k.inside(259.5, 9.0, 263.0, 71.0, hx('#3e3a34'), 0.42)
    k.inside(260.0, 46.0, 262.0, 49.0, hx('#b8c0c8'), 0.5)
    k.film(252, 262, ((263.0, 38.0), (263.0, 62.0)), 20.0, 0.13)
    k.side(228, 251, lambda x: 30.5, 33.0)
    for x in (226, 252):                                     # cab doors
        k.line(x, 5, x, 9, darken(0.45))
    k.line(238, 6, 241, 6, CHROME[2], w=2)
    k.line(264, 7, 264, 39, darken(0.4))                     # the short hood
    k.line(266, 22, 275, 22, ridge(0.1))
    for y in (12, 13, 26):                                   # marker lamps on the roof's front edge
        k.put(246, y, AMBER)
    for x in (211, 212):                                     # the exhaust stack behind the cab (one side)
        for y in (15, 16, 17):
            k.put(x, y, CHROME[1] if x == 211 else CHROME[3], both=False)
    k.grime((54, 68, 240), amount=1.5, rust=16, scratches=7)
    k.seal()
    k.gloss(264, 277, 0.08)
    k.rim()
    k.bumper(276, 278, CHROME)
    k.bumper(1, 2, RUBBER)
    for y in range(28, 40):                                  # grille
        for x in range(273, 276):
            k.put(x, y, CHROME[1] if y == 28 or x == 273 else RUBBER[0])
    k.lamp(273, 275, 9, 15, HEAD_C, HEAD_GLOW, CHROME[2])
    k.lamp(273, 275, 17, 21, HEAD_C, HEAD_GLOW, CHROME[2])
    k.lamp(2, 4, 4, 10, TAIL_C, TAIL_GLOW, hx('#7a0818'), back=4)     # tail lamps on the corner posts
    k.lamp(2, 4, 12, 16, HEAD_C, HEAD_GLOW, CHROME[1], back=4)        # the reversing lamps, lit
    k.line(3, 18, 4, 18, AMBER, w=2)
    return k.done()


AWNING_A, AWNING_B = ramp('#e0842c', 0.5, 0.26, 0.3), ramp('#eadfc6', 0.45, 0.24, 0.25)


def p_awning():
    """A cafe's canvas awning from above, hung on the facade (the wall at -y), reaching 1.1 m out over the terrace:
    broad orange and bone stripes running out from the wall, the cloth sagging a little between its three arms (their
    shadow lines), a scalloped valance along the front, the roller's steel box against the wall."""
    W, H = 98, 38
    cv = Cv(W, H)
    frect(cv, 1, 1, W - 1, 4.5, shade(STEEL_L, 0.55))                      # the roller's box
    frect(cv, 1, 1, W - 1, 1.5, shade(STEEL_L, 0.9))
    frect(cv, 1, 4.0, W - 1, 4.5, shade(STEEL_L, 0.2))

    def cloth(x, y, cur):
        if y > 32.5 and (y - 32.5) > 3.6 * abs(math.sin((x - 1.0) * math.pi / 8.0)) + 0.6:
            return None                                                    # the valance: scallops
        r = AWNING_A if int((x - 1.0) // 8) % 2 == 0 else AWNING_B
        arm = min(abs(x - a) for a in (4.0, 49.0, 94.0))
        sag = 0.5 + 0.22 * math.cos(arm / 45.0 * math.pi) - (y - 4.5) / 28.0 * 0.22
        if y > 32.5:
            sag -= 0.16
        return shade(r, max(0.05, min(0.95, sag)))
    px_paint(cv, 1, 4.5, W - 1, 37, cloth)
    for a in (4.0, 49.0, 94.0):                                            # the arms seen through the cloth
        px_paint(cv, a - 0.5, 5, a + 0.5, 32, lambda x, y, cur: dk(cur, 0.2))
    frect(cv, 1, 32.0, W - 1, 32.5, lambda c: dk(c, 0.3))                  # the front bar's seam
    rng = random.Random(8811)
    smudge(cv, rng, 9, (2, 6, W - 2, 32), (1.5, 4.0), 0.14, hx('#4a4038'))  # soot and rain marks
    smudge(cv, rng, 3, (2, 6, W - 2, 32), (0.8, 1.6), 0.4, hx('#e8e6dc'))   # pigeons
    cv.outline()
    return cv


FONT_SHOP.update({
    'C': [".####", "#....", "#....", "#....", "#....", "#....", ".####"],
    'F': ["#####", "#....", "#....", "####.", "#....", "#....", "#...."],
})


def p_neon_sign_diner():
    """DINER in warm tubes, a cup steaming beside it."""
    cv, gl = sign_backing(46, 14), Cv(46, 14)
    ne = Neon(46, 14)
    ne.line([(3, 7), (3, 10), (4, 11), (7, 11), (8, 10), (8, 7), (3, 7)], NEON_CYAN)    # a cup
    ne.line([(9, 8), (10, 9), (9, 10)], NEON_CYAN)
    ne.line([(5, 5), (4, 4), (5, 3), (4, 2)], NEON_PINK)                                # its steam
    neon_text(ne, 14, 3, 'DINER', NEON_AMBER)
    ne.render(cv, gl)
    return cv, gl


# ---- the chase's street: more to hit (traffic cones, a road barrier, boxes, bundles of papers, a fruit stand, a
# shopping cart, a post box), shop awnings in other colours, and the pieces a car loses (bumpers, a mirror, a hubcap,
# a headlight, its plate, its grille)
def awning_of(a, b, seed):
    """A shop's awning: the cafe's (p_awning) in other cloth, `a` / `b` the two stripes' ramps."""
    def make():
        global AWNING_A, AWNING_B
        was = AWNING_A, AWNING_B
        AWNING_A, AWNING_B = a, b
        try:
            cv = p_awning()
        finally:
            AWNING_A, AWNING_B = was
        smudge(cv, random.Random(seed), 4, (2, 6, 96, 32), (1.5, 3.5), 0.1, hx('#3a3430'))
        return cv
    return make


def p_traffic_cone():
    """A traffic cone from above, 70 cm: its square black rubber foot with rounded corners, the orange cone rising
    to a dark open tip, two white reflective bands round it, scuffs."""
    S = 12
    c = S / 2
    cv = Cv(S, S)
    fill_shape(cv, c, c, 5.4, 5.4, lambda u, v, L: shade(RUBBER, 0.3 + L * 0.5), kind='rect', bevel=1.0, corner=1.6)
    orange = ramp('#ff6a1a', 0.5, 0.26, 0.28)

    def cone(dx, dy, d):
        L = light(dx / 4.2, dy / 4.2)
        col = shade(orange, 0.25 + L * 0.7)
        if 1.7 <= d < 2.3 or 3.1 <= d < 3.6:
            col = mix(hx('#f4f2ea'), col, 0.25 if L > 0.4 else 0.45)       # the reflective bands
        return col
    ring(cv, c, c, 0.0, 4.2, cone)
    fill_shape(cv, c, c, 0.8, 0.8, lambda u, v, L: hx('#2a120a'))           # the open tip
    smudge(cv, random.Random(9101), 3, (1, 1, 11, 11), (0.6, 1.4), 0.25)
    cv.outline()
    return cv


def p_sawhorse():
    """A road works barrier from above, 1.25 m: a plank painted in red and white diagonal stripes on two splayed
    steel trestles (their feet stick out each side), a flashing lamp clamped to one end, chipped."""
    W, H = 40, 12
    cv = Cv(W, H)
    for x in (5.0, W - 5.0):                                                # the trestles' feet
        frect(cv, x - 1.0, 1, x + 1.0, H - 1, shade(STEEL_L, 0.3))
        frect(cv, x - 1.0, 1, x + 1.0, 1.5, shade(STEEL_L, 0.7))
    red, white = ramp('#d0242c', 0.5, 0.26, 0.3), ramp('#ece8de', 0.4, 0.2, 0.2)

    def plank(x, y, cur):
        r = red if int((x + y) // 4) % 2 == 0 else white
        return shade(r, 0.82 if y < 4.5 else 0.3 if y >= 7.5 else 0.6)
    px_paint(cv, 1, 3.5, W - 1, 8.5, plank)
    fill_shape(cv, 7.5, 6.0, 1.8, 1.8, lambda u, v, L: shade(ramp('#ffb21a', 0.5, 0.25, 0.4), 0.3 + L * 0.7))   # the lamp
    cv.dot(7.0, 5.5, hx('#fff3c0'))
    smudge(cv, random.Random(9111), 5, (2, 4, W - 2, 8), (0.6, 1.5), 0.45, hx('#8a8a92'))   # chipped to the wood
    cv.outline()
    return cv


def p_cardboard_box():
    """A cardboard box from above, 50 cm: its four flaps folded shut, a strip of brown tape down the middle, a
    printed arrow, crushed at a corner, a damp stain."""
    W, H = 16, 14
    cv = Cv(W, H)
    card = ramp('#b88a52', 0.45, 0.22, 0.25)
    fill_shape(cv, W / 2, H / 2, W / 2 - 1, H / 2 - 1, lambda u, v, L: shade(card, 0.35 + L * 0.45), kind='rect', bevel=1.2, corner=0.5)
    frect(cv, 1.5, H / 2 - 0.25, W - 1.5, H / 2 + 0.25, dk(card[2], 0.3))      # where the flaps meet
    frect(cv, W / 2 - 0.25, 1.5, W / 2 + 0.25, H - 1.5, dk(card[2], 0.2))
    frect(cv, W / 2 - 1.5, 1, W / 2 + 1.5, H - 1, lambda c: mix(c, hx('#8a5a2a'), 0.6))   # the tape
    frect(cv, W / 2 - 1.5, 1, W / 2 - 1.0, H - 1, lambda c: lt(c, 0.15))
    for (dx, dy) in ((0, 0), (-1, 1), (1, 1), (0, 1), (0, 2)):                # a printed arrow
        cv.blend(3.5 + dx * 0.5, 3.0 + dy * 0.5, alpha(hx('#3a2414'), 150))
    px_paint(cv, W - 4, H - 4, W - 1, H - 1, lambda x, y, cur: dk(cur, 0.25) if x + y > W + H - 6 else None)   # crushed
    smudge(cv, random.Random(9121), 2, (3, 3, W - 3, H - 3), (1.5, 2.5), 0.18)
    cv.outline()
    return cv


def p_paper_bundle():
    """A bundle of tomorrow's papers from above, dropped for the news stand: folded sheets stacked a little askew,
    the front page's headline and photo, tied with a cross of white plastic strap."""
    W, H = 14, 10
    cv = Cv(W, H)
    fill_shape(cv, W / 2 + 0.4, H / 2 + 0.4, W / 2 - 1.2, H / 2 - 1.2, lambda u, v, L: hx('#b8b2a2'), kind='rect', corner=0.3, ang=0.06)
    paper = ramp('#e8e4d6', 0.35, 0.16, 0.1)
    fill_shape(cv, W / 2, H / 2, W / 2 - 1.4, H / 2 - 1.4, lambda u, v, L: shade(paper, 0.5 + L * 0.4), kind='rect', bevel=0.8, corner=0.3)
    frect(cv, 3, 2.5, W - 3, 3.2, hx('#2a2a30'))                              # the headline
    frect(cv, 3, 4.0, 6.5, 7.0, lambda c: hx('#9a9aa0'))                     # the photo
    for y in (4.2, 5.2, 6.2):
        frect(cv, 7.2, y, W - 3, y + 0.5, hx('#a8a8b0'))                      # the columns
    frect(cv, 1, H / 2 - 0.3, W - 1, H / 2 + 0.3, hx('#f6f6fa'))              # the strap
    frect(cv, W / 2 - 0.3, 1, W / 2 + 0.3, H - 1, hx('#f6f6fa'))
    cv.outline()
    return cv


def p_fruit_stand():
    """A grocer's fruit stand put out on the sidewalk from above, 1.1 m: a slatted wooden rack holding three crates
    (oranges, red apples, green limes), heaped, a price card stuck in each, a strip of fake grass along the front."""
    W, H = 36, 18
    cv = Cv(W, H)
    w = ramp('#8a5a32', 0.45, 0.22, 0.3)
    wood_fill(cv, 1, 1, W - 2, H - 2, w[2], plank=3, rng=random.Random(9131))
    fruit = ((ramp('#ff8a1a', 0.5, 0.25, 0.3), 2.0), (ramp('#c8202c', 0.5, 0.26, 0.3), 1.9), (ramp('#6aa82a', 0.5, 0.25, 0.3), 1.6))
    rng = random.Random(9132)
    for k, (r, rad) in enumerate(fruit):
        x0 = 2.0 + k * 11.0
        frect(cv, x0, 2, x0 + 10, H - 4, shade(w, 0.25))                     # the crate's inside
        for _ in range(14):
            fx, fy = rng.uniform(x0 + rad, x0 + 10 - rad), rng.uniform(2 + rad, H - 4 - rad)
            fill_shape(cv, fx, fy, rad, rad, lambda u, v, L, r=r: shade(r, 0.2 + L * 0.75))
        frect(cv, x0 + 6.5, 2.5, x0 + 9.5, 4.5, hx('#f4f0e2'))               # the price card
        frect(cv, x0 + 7.0, 3.2, x0 + 9.0, 3.7, hx('#2a2a30'))
    frect(cv, 1, H - 3.5, W - 1, H - 1, lambda c: hx('#3a8a3a'))              # the fake grass
    for x in range(2, W - 1, 2):
        cv.dot(x, H - 3.0, hx('#5aaa4a'))
    cv.outline()
    return cv


def p_shopping_cart():
    """A shopping cart from above, left out on the sidewalk: its wire basket (a grid of thin bars, the floor seen
    through), the child seat folded at the back, the red handle, the four castors poking out."""
    W, H = 22, 14
    cv = Cv(W, H)
    for (x, y) in ((2.5, 1.5), (2.5, H - 1.5), (W - 3.5, 1.5), (W - 3.5, H - 1.5)):
        fill_shape(cv, x, y, 1.1, 0.8, lambda u, v, L: shade(RUBBER, 0.4 + L * 0.4))
    wire = ramp('#b8bcc8', 0.5, 0.25, 0.25)

    def basket(x, y, cur):
        if x < 4 or x >= W - 2 or y < 2 or y >= H - 2:
            return None
        edge = x < 4.6 or x >= W - 2.6 or y < 2.6 or y >= H - 2.6
        bar = (x * 2) % 3 < 0.6 or (y * 2) % 3 < 0.6
        return shade(wire, 0.75) if edge else shade(wire, 0.45) if bar else None
    px_paint(cv, 0, 0, W, H, basket)
    frect(cv, 1, 2, 2, H - 2, hx('#c8202c'))                                  # the handle
    frect(cv, 1, 2, 2, 2.5, lt(hx('#c8202c'), 0.3))
    frect(cv, 4, 2, 7, H - 2, lambda c: dk(c, 0.15) if c[3] else c)          # the child seat folded
    cv.outline()
    return cv


def p_mailbox():
    """A street post box from above, 45 cm square: green enamel, its domed top lit on one side, the letter slot's
    lip along the front (+y), a plate with the collection times, scratches."""
    S = 14
    cv = Cv(S, S)
    green = ramp('#2a6a4a', 0.5, 0.25, 0.3)
    fill_shape(cv, S / 2, S / 2, S / 2 - 1, S / 2 - 1, lambda u, v, L: shade(green, 0.15 + L * 0.8), kind='super', p=4.0)
    frect(cv, 3.5, S - 3.6, S - 3.5, S - 2.6, hx('#10201a'))                 # the slot
    frect(cv, 3.5, S - 3.6, S - 3.5, S - 3.3, lt(green[2], 0.3))
    frect(cv, 4.5, 4.5, S - 4.5, 6.5, hx('#e8e4d6'))                          # the times
    frect(cv, 5.0, 5.2, S - 5.0, 5.6, hx('#5a5a60'))
    smudge(cv, random.Random(9141), 4, (2, 2, S - 2, S - 2), (0.5, 1.2), 0.5, hx('#9aa0a8'))
    cv.outline()
    return cv


def p_car_bumper(chrome=True):
    """A bumper torn off, from above: a long bar (chrome, or black plastic on the newer cars) bent where it hit,
    its end ripped, the rubber strip along it."""
    def make():
        W, H = 40, 6
        cv = Cv(W, H)
        r = CHROME if chrome else RUBBER

        def bar(x, y, cur):
            bend = 0.7 * math.sin(x / W * math.pi * 1.3)
            yy = y - bend
            if yy < 1.0 or yy >= 5.0 or (x > W - 4 and yy > 3.5 - (x - W + 4)):
                return None
            col = shade(r, 0.92 if yy < 1.8 else 0.55 if yy < 3.4 else 0.3)
            if 3.0 <= yy < 3.6:
                col = RUBBER[1]                                               # the rubber strip
            return col
        px_paint(cv, 1, 0, W - 1, H, bar)
        smudge(cv, random.Random(9151 + chrome), 3, (2, 1, W - 4, 5), (0.8, 2.0), 0.3)
        cv.outline()
        return cv
    return make


def p_car_mirror():
    """A wing mirror snapped off: its housing (black), the cracked glass in it, the stalk's torn end."""
    W, H = 8, 6
    cv = Cv(W, H)
    fill_shape(cv, 4.6, 3.0, 3.0, 2.0, lambda u, v, L: shade(RUBBER, 0.3 + L * 0.6), kind='super', p=3.0)
    fill_shape(cv, 4.6, 3.0, 2.0, 1.2, lambda u, v, L: shade(GLASS, 0.5 + L * 0.5), kind='super', p=3.0)
    cv.dot(4.0, 2.5, hx('#dfe8ff'))
    frect(cv, 1, 2.5, 2, 3.5, shade(CHROME, 0.5))
    cv.outline()
    return cv


def p_car_hubcap():
    """A hubcap rolled away: a chrome dish, its spokes pressed in, the rim dented."""
    S = 10
    c = S / 2
    cv = Cv(S, S)

    def dish(dx, dy, d):
        a = math.atan2(dy, dx)
        L = light(dx / 4.0, dy / 4.0)
        spoke = abs(math.sin(a * 3)) < 0.25 and 1.2 < d < 3.4
        return shade(CHROME, (0.25 if spoke else 0.45) + L * 0.55) if d < 3.6 else shade(CHROME, 0.3 + L * 0.6)
    ring(cv, c, c, 0.0, 4.2, dish)
    fill_shape(cv, c, c, 0.9, 0.9, lambda u, v, L: shade(CHROME, 0.4 + L * 0.6))
    cv.outline()
    return cv


def p_car_headlight():
    """A headlight knocked out: its chrome bezel, the reflector inside, the lens cracked open, a wire trailing."""
    W, H = 8, 6
    cv = Cv(W, H)
    fill_shape(cv, 4.0, 3.0, 3.0, 2.2, lambda u, v, L: shade(CHROME, 0.3 + L * 0.6))
    fill_shape(cv, 4.0, 3.0, 2.0, 1.4, lambda u, v, L: mix(hx('#f4f0d8'), shade(CHROME, L), 0.4))
    for (x, y) in ((3.0, 2.5), (4.0, 3.0), (5.0, 3.5)):
        cv.dot(x, y, hx('#5a5a66'))                                           # the crack
    frect(cv, 7, 3, 8, 3.5, hx('#c8202c'))                                    # the wire
    cv.outline()
    return cv


def p_car_plate():
    """A number plate off a bumper: pale yellow, a dark rim, its characters pressed in (no real plate), bent at a
    corner."""
    W, H = 12, 5
    cv = Cv(W, H)
    frect(cv, 1, 1, W - 1, H - 1, hx('#e8d878'))
    frect(cv, 1, 1, W - 1, 1.5, hx('#f6ecb0'))
    for x in (2.5, 4.0, 5.5, 7.5, 9.0):
        frect(cv, x, 2.0, x + 1.0, 3.5, hx('#2a2a40'))
    px_paint(cv, W - 3, 1, W - 1, H - 1, lambda x, y, cur: dk(cur, 0.3) if x + y > W + 1 else None)
    cv.outline()
    return cv


def p_car_grille():
    """A piece of a radiator grille: a chrome frame round black slats, two of them bent out."""
    W, H = 16, 6
    cv = Cv(W, H)
    frect(cv, 1, 1, W - 1, H - 1, shade(CHROME, 0.7))
    for x in range(2, W - 2, 2):
        frect(cv, x + 0.5, 2, x + 1.5, H - 2, RUBBER[1])
    frect(cv, 1, 1, W - 1, 1.5, shade(CHROME, 0.95))
    px_paint(cv, 9, 2, 12, H - 2, lambda x, y, cur: shade(CHROME, 0.4))     # bent out
    cv.outline()
    return cv


# ---------------------------------------------------------------- the road of level 2A (tools/build_level2a.py)
# A real street, piece by piece. Painted on the floor (level `floor`): the kerbs (stones along every sidewalk edge,
# their rounded corners, dropped at driveways and crossings, red or yellow where nobody may stop), the paint on the
# asphalt (crossings, stop lines, arrows, words, the double centre line, parking tees, a hatched box), what is let
# into it (drains, covers, patches, sealed cracks, tree grates), the works' trench. Standing on it (props): traffic
# lights on their mast arms, a bus shelter, signs on their posts, bollards, trees, the works (an arrow board, a
# compressor, barricades), the railway over the street, the freeway sign at its end. Every painter has its own
# random.Random: adding one here repaints nothing else.
ROAD_WHITE, ROAD_YELLOW = hx('#d4cfc2'), hx('#d2aa3a')   # THE road paint of every kit (lines, words, kerbs, islands)
ROAD_WEAR = 0.6     # one wear for all of it (road_mark): the street's lines, arrows and words, the ramp's, the toll's
ROAD_WEAR_RUN = -0.6   # the long lines laid end to end (centre, edges, lane dashes): the same piece every 3 m, so
                       # its worn-through holes would repeat as a dash; they only thin (their noise wraps: no seam)
KERB = ramp('#a3a0a8', 0.5, 0.26, 0.28)
KERB_RED, KERB_YELLOW = hx('#b23a30'), ROAD_YELLOW
GUTTER = (16, 12, 24)
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
        row = FONT_STENCIL[word[n]][int(gy // ky)]
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


def tiny_text(cv, x, y, text, col):
    """Small print, a pixel of the sprite a pixel of the font (FONT_STENCIL): (x, y) its top left, world px."""
    s = cv.s
    i0, j0 = int(round(x * s)), int(round(y * s))
    for n, ch in enumerate(text):
        for gy, row in enumerate(FONT_STENCIL[ch]):
            for gx, c in enumerate(row):
                if c == '#' and cv.pok(i0 + n * 6 + gx, j0 + gy):
                    cv.p[i0 + n * 6 + gx, j0 + gy] = col


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
                for gy, row in enumerate(FONT_STENCIL[ch]):
                    for gx, c in enumerate(row):
                        if c == '#':
                            cv.set(x0 + 9 + i * 6 + gx, 14 + gy * 2, white)
                            cv.set(x0 + 9 + i * 6 + gx, 15 + gy * 2, white)
            px_paint(cv, x0 + 62, 13, x0 + 104, 34, lambda x, y, cur, x0=x0: white if (abs(x - x0 - 86) < 3 and 19 <= y < 32) or (13 <= y < 21 and abs(x - x0 - 86) < (y - 12) * 1.25) else None)
        else:
            for k, wd in enumerate(words):
                for i, ch in enumerate(wd):
                    for gy, row in enumerate(FONT_STENCIL[ch]):
                        for gx, c in enumerate(row):
                            if c == '#':
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


ROAD_PAINT = dict(   # painted on the floor (levelkit FLOOR): name -> (painter, size in world px)
    kerb_in=(p_kerb_in, (6, 6)),
    kerb_ramp_n=(kerb_ramp('n'), (64, 20)), kerb_ramp_s=(kerb_ramp('s'), (64, 20)),
    zebra_a=(lambda: road_mark(96, 20, lambda x, y: 0.5 <= x < 95.5 and 1 <= y < 19, 9311), (96, 20)),
    zebra_b=(lambda: road_mark(96, 20, lambda x, y: 0.5 <= x < 95.5 and 1 <= y < 19, 9312, wear=ROAD_WEAR + 0.3), (96, 20)),
    stop_line=(lambda: road_mark(14, 80, lambda x, y: 1 <= x < 13 and 1 <= y < 79, 9313), (14, 80)),
    centre_double=(lambda: road_mark(96, 8, lambda x, y: 0.5 <= y < 3 or 5 <= y < 7.5, 9314, ROAD_YELLOW, ROAD_WEAR_RUN), (96, 8)),
    park_tee=(lambda: road_mark(24, 60, lambda x, y: abs(x - 12) < 1.6 or y >= 56.8, 9315), (24, 60)),
    road_arrow=(p_road_arrow, (96, 28)), road_arrow_turn=(p_road_arrow_turn, (66, 40)),
    road_bus=(road_text('BUS', 9321), (38, 44)), road_stop=(road_text('STOP', 9322), (51, 44)),
    road_slow=(road_text('SLOW', 9323), (51, 44)), road_keep=(road_text('KEEP', 9324), (51, 44)),
    road_clear=(road_text('CLEAR', 9325), (64, 44)), road_only=(road_text('ONLY', 9326), (51, 44)),
    hatch_yard=(road_hatch(192, 60, 9331), (192, 60)), hatch_bay=(road_hatch(120, 56, 9332), (120, 56)),
    drain=(iron_cover(26, 10, 9341, slots=True), (26, 10)), manhole_sq=(iron_cover(24, 18, 9342), (24, 18)),
    valve_cap=(iron_cover(8, 8, 9343, round_=True), (8, 8)),
    road_patch_a=(road_patch(70, 44, 9344), (70, 44)), road_patch_b=(road_patch(124, 26, 9345, '#42454e', 190), (124, 26)),
    road_patch_c=(road_patch(42, 38, 9346, '#666870', 150), (42, 38)),
    road_crack_a=(road_crack(90, 40, 9347), (90, 40)), road_crack_b=(road_crack(60, 72, 9348), (60, 72)),
    tree_grate=(p_tree_grate, (40, 40)), trench=(p_trench, (150, 44)), spoil=(p_spoil, (46, 34)),
    steel_plate=(p_steel_plate, (70, 50)), viaduct_shadow=(p_viaduct_shadow, (164, 320)),
    # level 1's street (tools/build_level1.py): the hatched stub between its crossing and the next bay, LOADING in
    # yellow in the liquor store's bay, what engines dripped in the bays, rubber before the crossing
    hatch_kerb=(road_hatch(104, 56, 9333), (104, 56)), road_loading=(road_text('LOADING', 9327, ROAD_YELLOW, 4), (90, 30)),
    oil_stain_a=(oil_stain(26, 20, 9380), (26, 20)), oil_stain_b=(oil_stain(40, 26, 9381), (40, 26)),
    skid_marks=(p_skid_marks, (110, 54)),
)
for _i, _s in enumerate('nsew'):
    _sz = (32, 8) if _s in 'ns' else (8, 32)
    ROAD_PAINT['kerb_' + _s] = (kerb_strip(_s, seed=_i), _sz)
    ROAD_PAINT['kerb_%s_low' % _s] = (kerb_strip(_s, low=True, seed=20 + _i), _sz)
    if _s in 'ns':
        ROAD_PAINT['kerb_%s_4' % _s] = (kerb_strip(_s, 128, seed=4 + _i), (128, 8))
        ROAD_PAINT['kerb_%s_red' % _s] = (kerb_strip(_s, paint=KERB_RED, seed=8 + _i), _sz)
        ROAD_PAINT['kerb_%s_yellow' % _s] = (kerb_strip(_s, paint=KERB_YELLOW, seed=12 + _i), _sz)
for _q in ('ne', 'nw', 'se', 'sw'):
    ROAD_PAINT['kerb_corner_' + _q] = (kerb_corner(48, _q), (52, 52))
    ROAD_PAINT['kerb_bend_' + _q] = (kerb_corner(12, _q), (16, 16))
ROAD_PROPS = dict(traffic_light=p_traffic_light, bus_shelter=p_bus_shelter, sign_noparking=p_sign_noparking,
                  sign_oneway=p_sign_oneway, sign_speed=p_sign_speed, sign_bus=p_sign_bus, sign_works=p_sign_works,
                  bollard=p_bollard, street_tree=p_street_tree, arrow_board=p_arrow_board, compressor=p_compressor,
                  barricade=p_barricade, viaduct=p_viaduct, gantry_sign=p_gantry_sign)
ROAD_SIZES = dict(traffic_light=(216, 30), bus_shelter=(128, 48), sign_noparking=(12, 12), sign_oneway=(26, 10),
                  sign_speed=(12, 14), sign_bus=(12, 14), sign_works=(18, 18), bollard=(9, 9), street_tree=(88, 88),
                  arrow_board=(78, 42), compressor=(72, 40), barricade=(66, 12), viaduct=(148, 324),
                  gantry_sign=(310, 40))
ROAD_GLOWING = ['traffic_light', 'bus_shelter', 'arrow_board', 'barricade']   # (their emissive maps painted fine, with them)
ROAD_PROPS.update((n, fn) for n, (fn, _) in ROAD_PAINT.items())
ROAD_SIZES.update((n, sz) for n, (_, sz) in ROAD_PAINT.items())


CHASE_PROPS = dict(lorry=p_lorry, awning=p_awning, neon_sign_diner=p_neon_sign_diner,
                   awning_red=awning_of(ramp('#b82030', 0.5, 0.26, 0.3), ramp('#eadfc6', 0.45, 0.24, 0.25), 8851),
                   awning_green=awning_of(ramp('#2a7a4a', 0.5, 0.26, 0.3), ramp('#eadfc6', 0.45, 0.24, 0.25), 8852),
                   awning_blue=awning_of(ramp('#2a4a9a', 0.5, 0.26, 0.3), ramp('#d8dce6', 0.45, 0.24, 0.25), 8853),
                   awning_wine=awning_of(ramp('#6a1a3a', 0.5, 0.26, 0.3), ramp('#6a1a3a', 0.62, 0.36, 0.2), 8854),
                   traffic_cone=p_traffic_cone, sawhorse=p_sawhorse, cardboard_box=p_cardboard_box,
                   paper_bundle=p_paper_bundle, fruit_stand=p_fruit_stand, shopping_cart=p_shopping_cart,
                   mailbox=p_mailbox, car_bumper=p_car_bumper(True), car_bumper_black=p_car_bumper(False),
                   car_mirror=p_car_mirror, car_hubcap=p_car_hubcap, car_headlight=p_car_headlight,
                   car_plate=p_car_plate, car_grille=p_car_grille)
CHASE_SIZES = dict(lorry=(280, 80), awning=(98, 38), neon_sign_diner=(46, 14),
                   awning_red=(98, 38), awning_green=(98, 38), awning_blue=(98, 38), awning_wine=(98, 38),
                   traffic_cone=(12, 12), sawhorse=(40, 12), cardboard_box=(16, 14), paper_bundle=(14, 10),
                   fruit_stand=(36, 18), shopping_cart=(22, 14), mailbox=(14, 14), car_bumper=(40, 6),
                   car_bumper_black=(40, 6), car_mirror=(8, 6), car_hubcap=(10, 10), car_headlight=(8, 6),
                   car_plate=(12, 5), car_grille=(16, 6))
CHASE_NEON = ['neon_sign_diner']   # light: at the world's density, with their glow maps
CHASE_PROPS.update(ROAD_PROPS)
CHASE_SIZES.update(ROAD_SIZES)


# ---------------------------------------------------------------- level 2A, part two (docs/LEVEL2.md segment 2)
# Made to measure for what comes after the back road: the street closed by works and the detour round them, a short
# side street of sheds and loading bays, the freeway's on-ramp (its rails, lamps, signs and paint) and the toll plaza
# under its roof. The street's rules hold: FINE density, real sizes (1 m = 32 px), every painter its own
# random.Random, signs laid back to be read from above. RAMP_PAINT is floor paint (levelkit FLOOR), RAMP_PROPS stand.
FONT_STENCIL.setdefault('/', ["....#", "...#.", "...#.", "..#..", ".#...", ".#...", "#...."])
SIGN_WHITE, SIGN_INK = hx('#ece8de'), hx('#17151d')
SIGN_GREEN, SIGN_RED, SIGN_YELLOW, SIGN_ORANGE = '#1c6a4c', '#c8242c', '#e8b828', '#f08a1c'
FLASH = (hx('#ff9a14'), hx('#ffbe3a'), hx('#fff2c4'))
CONCRETE = ramp('#a8a49a', 0.46, 0.24, 0.22)
ZINC = ramp('#9aa0a8', 0.5, 0.25, 0.3)


def words_w(text, k=1.0):
    return (len(text) * 6 - 1) * k


def words(cv, x, y, text, col, k=1.0, centre=False):
    """Capitals of FONT_STENCIL, a font pixel k world px square (0.5: one pixel of a fine sprite), (x, y) its top left
    (centre: x is the middle of the line)."""
    if centre:
        x = round((x - words_w(text, k) / 2) * 2) / 2
    for n, ch in enumerate(text):
        for gy, row in enumerate(FONT_STENCIL[ch]):
            for gx, c in enumerate(row):
                if c == '#':
                    x0, y0 = x + (n * 6 + gx) * k, y + gy * k
                    frect(cv, x0, y0, x0 + k, y0 + k, col)


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


PASTEL_PINK, PASTEL_TEAL = '#f0a0bc', '#58c4b8'          # 1985 Florida: the toll's art deco (and DECO_PROPS')
DECO_PINK, DECO_TEAL = hx('#ff4aa6'), hx('#38f0dc')                 # their neon


def neon_halo(gl, box, col, r=2.5, a=96):
    """The soft halo of a neon tube on an emissive map: every clear pixel of box (world px) within r world px of a lit
    one gets col, fainter in four flat bands with the distance."""
    x0, y0, x1, y1 = box
    s, R = gl.s, int(math.ceil(r * gl.s))
    lit = [(i, j) for j in range(max(0, int(y0 * s)), min(gl.ph, int(y1 * s))) for i in range(max(0, int(x0 * s)), min(gl.pw, int(x1 * s)))
           if gl.p[i, j][3] > 200]
    near = {}
    for (i, j) in lit:
        for dj in range(-R, R + 1):
            for di in range(-R, R + 1):
                q = (i + di, j + dj)
                d = math.hypot(di, dj) / s
                if d <= r and gl.pok(*q) and gl.p[q][3] == 0 and d < near.get(q, 99):
                    near[q] = d
    for q, d in near.items():
        gl.p[q] = alpha(col, int(a * (1.25 - math.ceil(d / r * 4) / 4)))


def neon_words(cv, gl, x, y, text, col, k, centre=True):
    """Neon letters: the tube on the sprite (its colour, a paler core where the lamps catch it), lit on the emissive
    map a little paler still, its halo round it."""
    words(cv, x, y, text, dk(col, 0.25), k, centre)
    words(cv, x - 0.5, y - 0.5, text, lt(col, 0.2), k, centre)
    words(gl, x, y, text, lt(col, 0.35), k, centre)


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
RAMP_PAINT = dict(   # painted on the floor (levelkit FLOOR): name -> (painter, size in world px)
    road_cut=(p_road_cut, (128, 80)),
    sand_pile=(heap(72, 52, 9901, '#c4a46a', (hx('#e0c890'), hx('#9a7a48'), hx('#8a8478')), ol='#3a2a14'), (72, 52)),
    asphalt_pile=(heap(64, 48, 9902, '#3a3a42', (hx('#6a6a74'), hx('#22222a'), hx('#8a8a92')), grain=0.18, ol='#121018'), (64, 48)),
    detour_arrow_paint=(arrow_mark(96, 48, DETOUR_ARROW, 5.0, (14, 7), 9903, ROAD_YELLOW), (96, 48)),
    detour_arrow_paint_left=(arrow_mark(96, 48, mirror_y(DETOUR_ARROW, 48), 5.0, (14, 7), 9904, ROAD_YELLOW), (96, 48)),
    gore_hatch=(p_gore_hatch, (256, 72)),
    merge_arrow=(arrow_mark(96, 40, MERGE_ARROW, 5.0, (16, 8), 9905), (96, 40)),
    merge_arrow_s=(arrow_mark(96, 40, mirror_y(MERGE_ARROW, 40), 5.0, (16, 8), 9906), (96, 40)),
    lane_dash_long=(lambda: road_mark(96, 6, lambda x, y: 1 <= x < 95 and 1 <= y < 5, 9907, wear=ROAD_WEAR_RUN), (96, 6)),
    edge_line=(lambda: road_mark(96, 6, lambda x, y: 1 <= y < 5, 9908, wear=ROAD_WEAR_RUN), (96, 6)),
    edge_line_yellow=(lambda: road_mark(96, 6, lambda x, y: 1 <= y < 5, 9909, ROAD_YELLOW, ROAD_WEAR_RUN), (96, 6)),
    raised_marker=(raised_marker('#e8e4da', '#f4f4ff'), (8, 6)),
    raised_marker_yellow=(raised_marker('#d8b030', '#ffb028'), (8, 6)),
    rumble_strip=(p_rumble_strip, (96, 16)),
    toll_text=(road_text('TOLL', 9910), (51, 44)),
    plaza_stripes=(plaza_lines(320, 448, _FAN, 9911), (320, 448)),
    plaza_line=(lambda: road_mark(128, 6, lambda x, y: 1 <= x < 127 and 1 <= y < 5, 9912, wear=ROAD_WEAR_RUN), (128, 6)),
    # made to measure for 2A's toll (tools/build_level2a.py): two lanes' edges flaring out to four lanes of 2.5 m
    # (laid turned round past the plaza: the outer two end, the left edge in yellow), and four lanes spreading to the
    # plaza's grid (TOLL_LANES: 4.5 m apart), their lines onto the islands' crash cushions (turned round: the same
    # from the planters past the gates)
    lane_taper=(plaza_lines(384, 336, _TAPER, 9921, yellow=(1,)), (384, 336)),
    plaza_fan=(plaza_lines(TOLL_FAN_L, 592, _TOLL_FAN, 9922), (TOLL_FAN_L, 592)),
)
for _n in range(1, 5):   # (bold: a lane's number reads from the wheel)
    RAMP_PAINT['toll_lane_%d' % _n] = (road_text(str(_n), 9912 + _n, kx=3), (17, 44))
RAMP_PROPS = dict(road_closed=p_road_closed, sign_detour=p_sign_detour(), sign_detour_left=p_sign_detour(True),
                  jersey_barrier=p_jersey_barrier, water_barrier=p_water_barrier, excavator=p_excavator,
                  dump_truck=p_dump_truck, works_light=p_works_light, site_fence=p_site_fence,
                  roller_door=p_roller_door, loading_dock=p_loading_dock, chainlink_gate=p_chainlink_gate,
                  pallet_stack=p_pallet_stack, oil_drum=p_oil_drum, sign_stop=p_sign_stop,
                  guardrail=p_guardrail, guardrail_end=p_guardrail_end, guardrail_end_r=flip_y(p_guardrail_end),
                  guardrail_end_trail=p_guardrail_end_trail, guardrail_end_trail_r=flip_y(p_guardrail_end_trail),
                  crash_cushion=p_crash_cushion,
                  crash_cushion_narrow=lambda: p_crash_cushion(True),
                  highway_lamp=p_highway_lamp, highway_lamp_single=lambda: p_highway_lamp(True), sign_freeway=p_sign_freeway, sign_wrong_way=p_sign_wrong_way,
                  sign_speed_55=p_sign_speed_55, sign_toll_ahead=p_sign_toll_ahead, reflector_post=p_reflector_post,
                  toll_island=p_toll_island, toll_booth=p_toll_booth_of(), toll_canopy=p_toll_canopy,
                  gate_arm_wood=gate_arm(), gate_arm_bit_a=gate_arm(20.0, 62.0, 1), gate_arm_bit_b=gate_arm(62.0, 92.0, 2),
                  gate_arm_bit_c=gate_arm(92.0, 112.0, 3), gate_steel=gate_steel(),
                  lane_signal_go=lane_signal(True), lane_signal_stop=lane_signal(False),
                  sign_exact_change=p_sign_exact_change)
RAMP_SIZES = dict(road_closed=(128, 24), sign_detour=(42, 28), sign_detour_left=(42, 28), jersey_barrier=(96, 20),
                  water_barrier=(60, 20), excavator=(192, 96), dump_truck=(240, 84), works_light=(96, 72),
                  site_fence=(112, 20), roller_door=(96, 16), loading_dock=(128, 28), chainlink_gate=(128, 16),
                  pallet_stack=(40, 34), oil_drum=(20, 20), sign_stop=(20, 20), guardrail=(128, 10),
                  guardrail_end=(64, 18), guardrail_end_r=(64, 18), guardrail_end_trail=(64, 18), guardrail_end_trail_r=(64, 18),
                  crash_cushion=(96, 88), crash_cushion_narrow=(96, 44), highway_lamp=(208, 20), highway_lamp_single=(208, 20),
                  sign_freeway=(64, 48),
                  sign_wrong_way=(38, 26), sign_speed_55=(22, 28), sign_toll_ahead=(54, 30), reflector_post=(6, 12),
                  toll_island=(256, 48), toll_booth=(96, 44), toll_canopy=(192, 640), gate_arm_wood=(112, 12),
                  gate_arm_bit_a=(46, 6), gate_arm_bit_b=(34, 6), gate_arm_bit_c=(24, 6), gate_steel=(112, 20),
                  lane_signal_go=(20, 20), lane_signal_stop=(20, 20), sign_exact_change=(40, 24))
RAMP_GLOWING = ['road_closed', 'works_light', 'highway_lamp', 'highway_lamp_single', 'toll_booth', 'toll_canopy', 'lane_signal_go', 'lane_signal_stop']
RAMP_PROPS.update((n, fn) for n, (fn, _) in RAMP_PAINT.items())
RAMP_SIZES.update((n, sz) for n, (_, sz) in RAMP_PAINT.items())
CHASE_PROPS.update(RAMP_PROPS)
CHASE_SIZES.update(RAMP_SIZES)
ROAD_GLOWING += RAMP_GLOWING


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


FWY_PROPS = dict(overpass=p_overpass, overpass_shadow=p_overpass_shadow, gore_taper=p_gore_taper)
FWY_SIZES = dict(overpass=(576, 256), overpass_shadow=(576, 256), gore_taper=(768, 84))
CHASE_PROPS.update(FWY_PROPS)
CHASE_SIZES.update(FWY_SIZES)


# ---------------------------------------------------------------- ART DECO 1985: pastel, neon, palms (DECO_PROPS)
# Generic dressing for any street or road of Sunset Bay (first painted for 2A's toll, tools/build_level2a.py; meant
# for the back road too): nothing here is tied to one spot. FINE density, real sizes (1 m = 32 px), every painter its
# own random.Random; the art deco's pastels (PASTEL_PINK / PASTEL_TEAL) and its neon (DECO_PINK / DECO_TEAL) are the
# toll's. DECO_PAINT is floor paint (levelkit FLOOR), DECO_PROPS stand; DECO_GLOWING have an emissive map.

# ---- THE PALMS, one family (royal, coconut, young royal: palm_crown's feather fronds; sabal and Washingtonia:
# fan_leaf's fans): one ink, one dead straw, the species' greens on the same ramps, every frond / fan laid with
# leaf_over (its gaps left open on what is under it, its ink only round its outside, a 1 px shadow cast down and
# right on the leaves under it: light from the top left, as everywhere).
PALM_INK = hx('#0c1a12')
PALM_DEAD = ramp('#8e7046', 0.55, 0.3, 0.25)
PALM_GREENS = dict(royal=(ramp('#2a7438', 0.6, 0.32, 0.26), ramp('#4a9440', 0.55, 0.3, 0.28)),
                   coconut=(ramp('#3c762e', 0.6, 0.32, 0.26), ramp('#76a23a', 0.55, 0.3, 0.28)),
                   sabal=(ramp('#2e6438', 0.6, 0.32, 0.26), ramp('#4a8644', 0.55, 0.3, 0.28)),
                   fan=(ramp('#2e7040', 0.6, 0.32, 0.26), ramp('#5a8e3c', 0.55, 0.3, 0.28)))


def leaf_over(cv, ly, ink=PALM_INK, cast=0.3, close=5):
    """Lay one leaf layer ly on cv: its hull (its alpha closed over the gaps between leaflets / segments) casts a
    1 world px shadow down and right on what cv already has, the ink goes round the hull's outside only (the gaps
    inside stay open: the leaves or the ground under them show through, no hatching of ink), then ly over it."""
    from PIL import ImageFilter
    a = ly.img.getchannel('A').point(lambda v: 255 if v >= 100 else 0)
    box = a.getbbox()
    if not box:
        return
    hull = a.filter(ImageFilter.MaxFilter(close)).filter(ImageFilter.MinFilter(close))
    hp, s = hull.load(), cv.s
    W, H = cv.pw, cv.ph
    x0, y0, x1, y1 = max(0, box[0] - 2), max(0, box[1] - 2), min(W, box[2] + s + 2), min(H, box[3] + s + 2)
    for j in range(y0, y1):
        for i in range(x0, x1):
            if cv.p[i, j][3] < 100 or cv.p[i, j] == ink:
                continue
            if hp[i, j]:
                if ly.p[i, j][3] < 100:
                    cv.p[i, j] = dk(cv.p[i, j], cast * 0.7)               # seen through a gap: in its shade
                continue
            if (i >= s and j >= s and hp[i - s, j - s]) or (i >= s - 1 and j >= s and hp[i - s + 1, j - s]):
                cv.p[i, j] = dk(cv.p[i, j], cast)                         # the shadow it casts on the leaves under it
    ink_at = []
    for j in range(y0, y1):
        for i in range(x0, x1):
            if hp[i, j] or ly.p[i, j][3] >= 100:
                continue
            if any(0 <= i + di < W and 0 <= j + dj < H and ly.p[i + di, j + dj][3] >= 100
                   for (di, dj) in ((1, 0), (-1, 0), (0, 1), (0, -1))):
                ink_at.append((i, j))
    for (i, j) in ink_at:
        ly.p[i, j] = ink
    cv.over(ly)


def palm_fan(seed, reach=1.0):
    """A Washingtonia, the Florida fan palm, from above, about 3 m across (reach: its crown's share of that): a skirt
    of dead fans hanging under the crown, then a ring of green fans on their stalks and a few young ones in the
    middle, every fan pleated (fan_leaf, the sabal's: one family), its tips split; the trunk's boss in the middle
    (the hitbox, r 4.5)."""
    def make():
        S = 96
        cv = Cv(S, S)
        rng = random.Random(seed)
        c0 = S / 2
        green, young = PALM_GREENS['fan']
        leaves = []
        for i in range(10):                                                # the skirt, hanging
            leaves.append((rng.uniform(0, 6.28), rng.uniform(8, 11) * reach, rng.uniform(10, 13) * reach, PALM_DEAD, 2))
        a0 = rng.uniform(0, 6.28)
        for i in range(12):                                                # the crown
            leaves.append((a0 + i * 6.28 / 12 + rng.uniform(-0.15, 0.15), rng.uniform(15, 19) * reach,
                           rng.uniform(17, 21) * reach, green, 0))
        for i in range(5):                                                 # the young fans, upright, in the middle
            leaves.append((a0 + 0.26 + i * 6.28 / 5 + rng.uniform(-0.2, 0.2), rng.uniform(5, 7) * reach,
                           rng.uniform(10, 12) * reach, young, 1))
        for (a, r0, R, g, kind) in leaves:
            ly = Cv(S, S)
            hxc, hyc = c0 + math.cos(a) * r0, c0 + math.sin(a) * r0
            fan_leaf(ly, hxc, hyc, a, R, g, 1.0 if kind == 2 else 1.3, 8 if kind == 2 else 11, rng, (), kind == 2,
                     0.55 if kind == 2 else 0.72, 0.62)                    # a Washingtonia's fan is split less deep
            fill_capsule(ly, [(c0 + math.cos(a) * 3, c0 + math.sin(a) * 3), (hxc, hyc),
                              (hxc + math.cos(a) * R * 0.3, hyc + math.sin(a) * R * 0.3)],
                         0.75, lambda k, L, s, i, t, g=g: shade(g, 0.5 + L * 0.35))   # the stalk, its costa into the fan
            leaf_over(cv, ly)
        trunk = Cv(S, S)
        boots(trunk, c0, 4.5, rng)
        leaf_over(cv, trunk)
        return cv
    return make


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


SUN_BANDS = ('#2c1648', '#5a1e6a', '#a0287a', '#e8407a', '#ff7a5a', '#ffb24a')


def board_sheets(cv, x0, y0, x1, y1, step, stuff, rng):
    """A billboard's face with its paper torn off (entities/Board.js bares it down to this): the sheets it was pasted
    on, `step` px wide, steel ('steel': galvanised, a seam a sheet and one across, rivets along them, a streak of rust
    under some) or plywood ('wood': its grain along x, the sheets' joints); the paste gone yellow in blotches, scraps
    of old paper left on it, grime down its foot."""
    n, fine_n = VNoise(cv.w, cv.h, 16, rng), VNoise(cv.w, cv.h, 2, rng)
    ym = round((y0 + y1) / 2)
    steel = stuff == 'steel'
    base = ramp('#868c96', 0.45, 0.22, 0.3) if steel else ramp('#a07a52', 0.5, 0.25, 0.3)

    def sheet(x, y, cur):
        k = int((x - x0) // step)
        L = 0.5 + (0.05 if k % 2 else -0.03) + (n(x, y) - 0.5) * 0.1
        if not steel:
            L += (fine_n(x * 0.2, y * 2.5) - 0.5) * 0.16                      # the grain, along the sheet
        c = shade(base, L)
        if (x - x0) % step < 0.5 or abs(y - ym) < 0.5:
            c = dk(c, 0.45)                                                  # the joints
        elif (x - x0) % step < 1.0 or 0.5 <= y - ym < 1.0:
            c = mix(c, hx('#e8ecf0') if steel else hx('#d0b08a'), 0.25)   # their lit lip
        if n(x * 1.3 + 40, y * 1.3) > 0.74:
            c = mix(c, hx('#c8b87a'), 0.16)                                  # the paste, gone yellow
        if y > y1 - 9:
            c = dk(c, (y - (y1 - 9)) / 9 * 0.3)                              # grime down its foot
        return c
    px_paint(cv, x0, y0, x1, y1, sheet)
    if steel:
        for x in range(int(x0), int(x1) + 1, step):
            for y in range(int(y0) + 4, int(y1) - 2, 9):
                for (rx, ry) in ((x + 1.5, y), (x - 1.5, y)):
                    if x0 < rx < x1:
                        cv.dot(rx, ry, hx('#d8dce2'))                        # rivets either side of a joint
                        if rng.random() < 0.15:
                            frect(cv, rx - 0.5, ry + 0.5, rx, ry + rng.uniform(3, 8), lambda c: mix(c, hx('#8a4a2a'), 0.45))
    for _ in range(9):                                                       # scraps of the paper left stuck on
        sx, sy = rng.uniform(x0 + 2, x1 - 8), rng.uniform(y0 + 2, y1 - 6)
        w, h = rng.uniform(2, 7), rng.uniform(1.5, 4)
        tone = mix(hx('#ece6d4'), hx('#c8a8c8'), rng.random() * 0.5)
        px_paint(cv, sx, sy, sx + w, sy + h, lambda x, y, c, sx=sx, w=w, t=tone: t if (x - sx) < w * (0.6 + 0.4 * n(x * 3, y * 3)) else None)


def board_lattice(ly, x0, y0, x1, y1, step, steel, rim):
    """What is left of a billboard's face when its sheets are torn out too: the frame round it (rim px), the uprights
    every `step` px, two stringers across, a brace in each bay; nothing between (what is under it shows)."""
    frect(ly, x0 - 3, y0 - 3, x1 + 3, y0 - 3 + rim, shade(steel, 0.45))
    frect(ly, x0 - 3, y0 - 3, x1 + 3, y0 - 2, shade(steel, 0.8))
    frect(ly, x0 - 3, y1 + 3 - rim, x1 + 3, y1 + 3, shade(steel, 0.3))
    frect(ly, x0 - 3, y0, x0 - 3 + rim, y1, shade(steel, 0.45))
    frect(ly, x1 + 3 - rim, y0, x1 + 3, y1, shade(steel, 0.35))
    sy = (y0 + (y1 - y0) * 0.3, y0 + (y1 - y0) * 0.68)
    for y in sy:                                                             # the stringers
        frect(ly, x0, y - 1, x1, y + 1, shade(steel, 0.5))
        frect(ly, x0, y - 1, x1, y - 0.5, shade(steel, 0.8))
    ups = [x for x in range(int(x0) + step, int(x1) - 8, step)]
    for x in ups:                                                            # the uprights
        frect(ly, x - 1, y0, x + 1, y1, shade(steel, 0.42))
        frect(ly, x - 1, y0, x - 0.5, y1, shade(steel, 0.75))
    for a, b in zip([x0] + ups, ups + [x1]):                                 # a brace in each bay
        fill_capsule(ly, [(a + 1, sy[1]), (b - 1, sy[0])], 0.6, lambda k, L, s, i, t: shade(steel, 0.3 + L * 0.3))


def billboard_ad(head, sub, small, seed, scene='motel', face='poster'):
    """A roadside billboard from above, 12 m long, laid back to be read (as the signs are): the board in its white
    frame on its catwalk and two steel legs, four lamps on goosenecks along its top lighting it (the emissive map:
    their bulbs and the face they light). Its face: an eighties sunset (flat bands, the striped sun) with palm
    silhouettes and a flamingo (scene 'motel') or a pair of shades (any other) on the left, the name in neon pink
    (head), a line in teal (sub), a line in bone (small) on violet. face: 'poster' (whole), 'bare' (the paper gone: the
    plywood it was pasted on) or 'frame' (the plywood gone too: the steel lattice behind the white frame), the layers
    entities/Board.js tears it down to (no emissive map)."""
    def make():
        W, H = 384, 112
        cv, gl = Cv(W, H), Cv(W, H)
        rng = random.Random(seed)
        fx0, fy0, fx1, fy1 = 6, 8, W - 6, 86
        for x in (90, W - 90):                                              # the legs, the catwalk
            frect(cv, x - 3, fy1, x + 3, H - 2, shade(STEEL_L, 0.45))
            frect(cv, x - 3, fy1, x - 2, H - 2, shade(STEEL_L, 0.8))
        frect(cv, fx0 + 4, fy1, fx1 - 4, fy1 + 6, shade(ZINC, 0.4))
        for x in range(fx0 + 6, fx1 - 4, 3):
            frect(cv, x, fy1 + 1, x + 1, fy1 + 5, shade(ZINC, 0.7))
        if face != 'poster':
            if face == 'frame':
                for (a, b, c, d) in ((fx0, fy0, fx1, fy0 + 2), (fx0, fy1 - 2, fx1, fy1), (fx0, fy0, fx0 + 2, fy1), (fx1 - 2, fy0, fx1, fy1)):
                    frect(cv, a, b, c, d, hx('#ece8de'))                      # the white frame, empty
                layer(cv, lambda ly: board_lattice(ly, fx0 + 5, fy0 + 5, fx1 - 5, fy1 - 5, 64, STEEL_L, 3))
            else:
                frect(cv, fx0, fy0, fx1, fy1, hx('#ece8de'))
                board_sheets(cv, fx0 + 2, fy0 + 2, fx1 - 2, fy1 - 2, 64, 'wood', random.Random(seed + 11))
            for x in (60, 150, 240, 330):                                   # the lamps, as on the whole board
                frect(cv, x - 0.5, 1, x + 0.5, fy0, shade(STEEL_L, 0.5))
                fill_shape(cv, x, 2.5, 3.0, 2.0, lambda u, v, L: shade(ZINC, 0.3 + L * 0.6), kind='rect', corner=0.8)
                frect(cv, x - 2, 3.5, x + 2, 4.5, hx('#fff4d8'))
            cv.outline()
            return cv
        frect(cv, fx0, fy0, fx1, fy1, hx('#ece8de'))                         # the frame
        sx1, hor = 128, 58

        def poster(x, y, cur):
            if x < sx1:
                if y >= hor:                                                # the sea, the sun's road on it
                    k = int((y - hor) // 5)
                    c = hx(('#3a2a78', '#2a3a8a', '#1a2a6a', '#122058')[min(3, k)])
                    return mix(c, hx('#ffb24a'), 0.5) if abs(x - 66) < 18 - (y - hor) * 0.6 and int(y) % 3 == 0 else c
                if math.hypot(x - 66, y - hor) < 26 and not (y > hor - 14 and int(y - hor) % 4 in (0, 1)):
                    return hx('#ffd04a') if y < hor - 14 else hx('#ff8a3a')  # the striped sun
                return hx(SUN_BANDS[min(5, int((y - fy0 - 2) / ((hor - fy0) / 6)))])
            return hx('#2a1640')                                            # the violet panel
        px_paint(cv, fx0 + 2, fy0 + 2, fx1 - 2, fy1 - 2, poster)

        def silhouettes(ly):
            ink = hx('#140a1c')
            if scene == 'motel':
                prng = random.Random(seed + 5)
                for (bx, top, lean, size) in ((28, 24, -5, 15), (46, 34, 4, 12)):   # two palms
                    poster_palm(ly, (bx, hor + 2), (bx + lean, top), size, ink, prng)
                frect(ly, 0, 0, fx0 + 2, H, CLEAR)                          # kept inside the face
                frect(ly, 0, 0, W, fy0 + 2, CLEAR)
                fl = hx('#ff6ab0')                                          # the flamingo on one leg
                fill_shape(ly, 98, hor - 10, 8, 5, lambda u, v, L: fl, ang=-0.3)
                fill_capsule(ly, [(104, hor - 13), (108, hor - 26), (104, hor - 32), (100, hor - 30)], 1.3, lambda k, L, s, i, t: fl)
                fill_capsule(ly, [(98, hor - 6), (98, hor + 10)], 0.6, lambda k, L, s, i, t: fl)
            else:
                for cx in (52, 80):                                         # the shades
                    fill_shape(ly, cx, hor - 20, 12, 8, lambda u, v, L: ink, kind='super', p=3)
                    frect(ly, cx - 8, hor - 25, cx - 4, hor - 23, hx('#ff8ad0'))
                frect(ly, 62, hor - 22, 70, hor - 19, ink)
        layer(cv, silhouettes, ol=None)
        neon_words(cv, gl, (sx1 + fx1) / 2, 18, head, DECO_PINK, 3.5)
        neon_words(cv, gl, (sx1 + fx1) / 2, 48, sub, DECO_TEAL, 2.0)
        words(cv, (sx1 + fx1) / 2, 69, small, hx('#efe6d2'), 1.25, centre=True)
        neon_halo(gl, (sx1, fy0, fx1, fy1), DECO_PINK, 2.0, 70)
        px_paint(gl, fx0, fy0, fx1, fy1, lambda x, y, cur: cur if cur[3] else alpha(hx('#ffe8c8'), 34))   # the face lit
        for x in (60, 150, 240, 330):                                       # the lamps on their goosenecks
            frect(cv, x - 0.5, 1, x + 0.5, fy0, shade(STEEL_L, 0.5))
            fill_shape(cv, x, 2.5, 3.0, 2.0, lambda u, v, L: shade(ZINC, 0.3 + L * 0.6), kind='rect', corner=0.8)
            frect(cv, x - 2, 3.5, x + 2, 4.5, hx('#fff4d8'))
            frect(gl, x - 2, 3.5, x + 2, 4.5, hx('#fff8e8'))
        smudge(cv, rng, 16, (fx0, fy0, fx1, fy1), (2.0, 5.0), 0.1)
        for _ in range(6):                                                  # a corner of the paper peeling
            x = rng.uniform(fx0 + 10, fx1 - 10)
            frect(cv, x, fy0 + 2, x + rng.uniform(4, 10), fy0 + 3, hx('#d8d0c0'))
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


DECO_PROPS = dict(palm_fan=palm_fan(10101), palm_fan_small=palm_fan(10102, 0.8),
                   hibiscus_bush=hibiscus_bush('#ff5aa0', 10111), hibiscus_bush_red=hibiscus_bush('#e8283c', 10112),
                   planter_deco_pink=planter_deco(PASTEL_PINK, '#e8283c', 10121), planter_deco_teal=planter_deco(PASTEL_TEAL, '#ff5aa0', 10122),
                   police_car=p_police_car, deco_office_pink=deco_office(PASTEL_PINK, 10131),
                   deco_office_teal=deco_office(PASTEL_TEAL, 10132),
                   billboard_motel=billboard_ad('FLAMINGO', 'MOTEL', 'VACANCY  COLOR TV  POOL', 10151, 'motel'),
                   # what entities/Board.js tears its face down to: the bare plywood, then the lattice
                   billboard_motel_bare=billboard_ad('', '', '', 10151, 'motel', 'bare'),
                   billboard_motel_frame=billboard_ad('', '', '', 10151, 'motel', 'frame'),
                   deco_lamp=p_deco_lamp,
                   # the toll's own states (systems/TollFx.js, systems/Toll.js): the attendant ducked, the boom bent
                   toll_booth_duck=p_toll_booth_of(True), gate_steel_bent=gate_steel(True))
DECO_PAINT = dict(puddle_neon=(puddle_neon(96, 48, 10161), (96, 48)), puddle_neon_b=(puddle_neon(64, 40, 10162), (64, 40)))
DECO_SIZES = dict(palm_fan=(96, 96), palm_fan_small=(96, 96), hibiscus_bush=(32, 32), hibiscus_bush_red=(32, 32),
                   planter_deco_pink=(48, 48), planter_deco_teal=(48, 48), police_car=(140, 58),
                   deco_office_pink=(160, 96), deco_office_teal=(160, 96), billboard_motel=(384, 112),
                   billboard_motel_bare=(384, 112), billboard_motel_frame=(384, 112),
                   deco_lamp=(32, 32), toll_booth_duck=(96, 44), gate_steel_bent=(112, 20))
DECO_GLOWING = ['deco_office_pink', 'deco_office_teal', 'billboard_motel', 'deco_lamp', 'toll_booth_duck']
DECO_PROPS.update((n, fn) for n, (fn, _) in DECO_PAINT.items())
DECO_SIZES.update((n, sz) for n, (_, sz) in DECO_PAINT.items())
CHASE_PROPS.update(DECO_PROPS)
CHASE_SIZES.update(DECO_SIZES)
ROAD_GLOWING += DECO_GLOWING


# ---------------------------------------------------------------- MIAMI, 1986: the back alley's (level 2A's alley first)
# Generic and reusable, nothing tied to one spot (the user: "everything Miami 80s, the street included"): what a back
# alley, a market corner or a sidewalk of Sunset Bay is full of, in its pastels (pink, mint, peach, lilac, aqua) and
# its neon (pink, cyan, violet). FINE density like the street, real sizes (1 m = 32 px), every painter its own
# random.Random (the street's own dressing is "Miami, 1985" below: MIAMI_PROPS). ALLEY_PROPS stand on the ground
# (what a car ploughs through: crates, boxes, a fruit cart, a news stand, a scooter, a domino table, a wheeled
# dumpster, lit box signs), hang on a wall face (stucco trims, an AC unit dripping, graffiti), or hang overhead
# (laundry lines, a fire escape, palm fronds); ALLEY_NEON are lit signs at the world's density (light). The pastel stucco WALLS themselves are tiles (t_stucco: P, M, Y, V in the level's map).
MI_PINK, MI_MINT, MI_PEACH, MI_LILAC, MI_AQUA = '#f0a0bc', '#8ad8c0', '#f4b896', '#b8a0e0', '#6ad0e0'
MI_VIOLET = hx('#b44aff')
for _ch in 'BTKY':
    FONT_SHOP.setdefault(_ch, FONT_STENCIL[_ch])


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
    frect(cv, x0 + 1.5, y1 - 0.6, x0 + 5.5, y1 + 0.2, hx('#f4f0e2'))   # the grower's label on its front
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
    card = ramp('#b88a52', 0.45, 0.22, 0.25)

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
            cv.blend(x + dx * 0.5, y + dy * 0.5, alpha(hx('#3a2414'), 150))
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
    words(cv, 30.0, H - 4.4, 'FRUTAS', hx('#f4f0e2'), 0.5, centre=True)
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
    words(cv, W / 2, 0.75, 'NEWS', hx('#f4f0e2'), 0.5, centre=True)
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
            c = mix(c, hx('#f4f0e2'), 0.7)
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
        line(cv, 1.0, y, W - 1.0, y + 0.5, hx('#d8d4c8'))
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
                c = mix(c, hx('#f4f0e2'), 0.65)
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
        fill_shape(cv, 55.0, H / 2, 1.6, 2.4, lambda u, v, L: hx('#fff6dc') if L > 0.5 else shade(CHROME, L))   # the headlight
        fill_shape(cv, 33.0, 15.0, 1.4, 1.4, lambda u, v, L: hx('#f4f0e2'))     # a sticker
        cv.dot(33.0, 15.0, hx('#ff2a6d'))
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
    smudge(cv, rng, 5, (3, 4, 25, 10), (0.8, 2.0), 0.5, hx('#8a4a22'))
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
            return alpha(hx('#0c0a10'), 120)
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
            ly.dot(14 + rng.uniform(-4, 4), 30 + rng.uniform(-4, 4), rng.choice((hx('#3a8a3a'), hx('#2a6a2a'), hx('#ff2a6d'), hx('#e83a4a'))))
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
            frect(cv, x + w - 0.5, 1.0, x + w, 4.0, hx('#140c1c'))
            if rng.random() < 0.4:
                frect(cv, x + rng.uniform(1, w - 1), 4.0, x + rng.uniform(1, w - 1) + 0.5, 5.5, c)   # a drip
            x += w + rng.uniform(0.0, 1.5)
        for _ in range(4):
            cv.dot(rng.uniform(4, 60), rng.uniform(1.5, 3.5), hx('#f4f0e2'))   # its shine
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


ALLEY_PROPS = dict(
    produce_crates=p_produce_crates, box_stack=p_box_stack, fruit_cart=p_fruit_cart, news_stand=p_news_stand,
    laundry_line=p_laundry_line,
    laundry_shirt=cloth_piece(20, 14, '#2ab8c8', None, 9942), laundry_towel=cloth_piece(24, 12, '#f04a6a', 'stripes', 9943),
    laundry_sheet=cloth_piece(32, 18, '#ece8de', None, 9944),
    neon_box_pink=neon_box(MI_PINK, 'COCKTAILS', 9945), neon_box_cyan=neon_box(MI_AQUA, 'OPEN 24', 9946),
    scooter_mint=scooter(MI_MINT, 9947), scooter_pink=scooter(MI_PINK, 9948),
    domino_table=p_domino_table,
    dumpster_mint=recolour(p_dumpster, MI_MINT, 9949, '#ff2a6d'), dumpster_pink=recolour(p_dumpster, MI_PINK, 9950, '#05d9e8'),
    dumpster_aqua=recolour(p_dumpster, MI_AQUA, 9953, '#f9c80e'),
    stucco_trim_pink=stucco_trim(MI_PINK, '#5ac8c8', 9954), stucco_trim_mint=stucco_trim(MI_MINT, '#f07aa0', 9955),
    stucco_trim_peach=stucco_trim(MI_PEACH, '#3aa8b8', 9956),
    ac_drip=p_ac_drip, fire_escape=p_fire_escape, palm_fronds=p_palm_fronds,
    graffiti_neon_a=graffiti_neon(('#ff2a6d', '#05d9e8', '#f9c80e'), 9957), graffiti_neon_b=graffiti_neon(('#b44aff', '#3aff8a', '#ff2a6d'), 9958),
)
ALLEY_SIZES = dict(
    produce_crates=(40, 30), box_stack=(34, 28), fruit_cart=(60, 34), news_stand=(36, 18), laundry_line=(160, 40),
    laundry_shirt=(20, 14), laundry_towel=(24, 12), laundry_sheet=(32, 18), neon_box_pink=(36, 14), neon_box_cyan=(36, 14),
    scooter_mint=(58, 22), scooter_pink=(58, 22), domino_table=(30, 30), dumpster_mint=(60, 36), dumpster_pink=(60, 36),
    dumpster_aqua=(60, 36), stucco_trim_pink=(96, 5), stucco_trim_mint=(96, 5), stucco_trim_peach=(96, 5), ac_drip=(28, 18),
    fire_escape=(96, 44), palm_fronds=(88, 64), graffiti_neon_a=(64, 6), graffiti_neon_b=(64, 6),
)
ALLEY_GLOWING = ['neon_box_pink', 'neon_box_cyan']
ALLEY_NEON = dict(neon_sign_botanica=p_neon_sign_botanica, neon_sign_cocktail=p_neon_sign_cocktail)   # light: the world's density
ALLEY_NEON_SIZES = dict(neon_sign_botanica=(62, 14), neon_sign_cocktail=(66, 14))
CHASE_PROPS.update(ALLEY_PROPS)
CHASE_PROPS.update(ALLEY_NEON)
CHASE_SIZES.update(ALLEY_SIZES)
CHASE_SIZES.update(ALLEY_NEON_SIZES)
CHASE_NEON += list(ALLEY_NEON)
ROAD_GLOWING += ALLEY_GLOWING


# --------------------------------------------------------------------------
# The flat of the prologue (tools/build_tutorial.py): a poor man's place, six years of it. What lies on its floors
# (FLAT_PAINT: floor paint, no body), its furniture and what hangs on its walls (FLAT_PROPS), what stands on its
# worktop and its stove (FLAT_CLUTTER). Every painter has its own seeds: nothing here moves another sprite.
# --------------------------------------------------------------------------

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


# floor paint (no body: levelkit FLOOR), in world px
FLAT_PAINT = dict(mattress=(p_mattress, (46, 66)), clothes_pile=(p_clothes_pile, (30, 24)), pizza_box=(p_pizza_box, (14, 14)),
                  bottles_empty=(p_bottles_empty, (16, 12)), mail_pile=(p_mail_pile, (14, 11)),
                  boards_loose=(p_boards_loose, (26, 14)), phone_floor=(p_phone_floor, (18, 12)),
                  trash_spill=(p_trash_spill, (18, 14)), cutlery_spill=(p_cutlery_spill, (18, 10)),
                  runner_corner=(p_runner_corner, (18, 18)))
FLAT_PROPS = dict(nightstand=p_nightstand, chair_jacket=p_chair_jacket, duffel_bag=p_duffel_bag, coffee_table=p_coffee_table,
                  record_player=p_record_player, worktop=p_worktop, boiler=p_boiler, bucket=p_bucket, plant_dead=p_plant_dead,
                  mirror_cracked=p_mirror_cracked, mailboxes=p_mailboxes, calendar=p_calendar, propane=p_propane)
FLAT_SIZES = dict(nightstand=(16, 14), chair_jacket=(16, 16), duffel_bag=(22, 12), coffee_table=(34, 20),
                  record_player=(22, 16), worktop=(40, 18), boiler=(16, 10), bucket=(11, 11), plant_dead=(20, 20),
                  mirror_cracked=(14, 5), mailboxes=(26, 7), calendar=(9, 5), propane=(18, 18))
FLAT_PROPS.update((n, fn) for n, (fn, _) in FLAT_PAINT.items())
FLAT_SIZES.update((n, sz) for n, (_, sz) in FLAT_PAINT.items())
# what stands on the worktop and the stove (clutter/<name>, src/game/data/clutter.js)
FLAT_CLUTTER = dict(pan=(c_pan, (10, 6)), kettle=(c_kettle, (6, 6)), plates=(c_plates, (6, 6)), takeaway=(c_takeaway, (6, 5)))
CLUTTER_PAINT.update((n, fn) for n, (fn, _) in FLAT_CLUTTER.items())
CLUTTER_SIZES.update((n, sz) for n, (_, sz) in FLAT_CLUTTER.items())


# --------------------------------------------------------------------------
# The rooms of level 1 (tools/build_level1.py): what a liquor store, a TV shop, a laundromat, a bar's back and an
# office are full of. All at FINE density, plain pixel art, from above, the light from the top left. A piece that
# stands against a wall has its back at -y; what hangs on a wall has the wall at -y (as the bar's pictures have).
# (The calendars on its walls are the flat's: FLAT_PROPS `calendar`.)
# Every painter draws its own numbers (a seeded Random each): none of them moves another sprite.
# --------------------------------------------------------------------------
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


def on_wall(W, H, paint, seed=None):
    """Something on a wall seen from above (the wall at -y): paint(cv) draws it, then the outline and a little grime."""
    cv = Cv(W, H)
    paint(cv)
    if seed:
        smudge(cv, random.Random(seed), 2, (1, 1, W - 1, H - 1), (0.8, 1.4), 0.14)
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


INTERIOR_PROPS = dict(shop_shelf=p_shop_shelf, wine_rack=p_wine_rack, beer_cases=p_beer_cases, lottery_stand=p_lottery_stand,
                      tv_stack=p_tv_stack, vcr_shelf=p_vcr_shelf, tv_box=p_tv_box, repair_bench=p_repair_bench,
                      dryer=p_dryer, folding_table=p_folding_table, soap_vend=p_soap_vend, laundry_cart=p_laundry_cart,
                      plastic_chair=p_plastic_chair, cig_machine=p_cig_machine, ice_bin=p_ice_bin, coat_rack=p_coat_rack,
                      bottle_crate=p_bottle_crate, wet_sign=p_wet_sign, mop_bucket=p_mop_bucket, water_cooler=p_water_cooler,
                      filing_cabinet=p_filing_cabinet, safe=p_safe, pallet=p_pallet, steel_shelf=p_steel_shelf,
                      hand_truck=p_hand_truck, security_mirror=p_security_mirror, cig_rack=p_cig_rack,
                      price_board=p_price_board, tape_rack=p_tape_rack, notice_board=p_notice_board,
                      coin_changer=p_coin_changer, hand_dryer=p_hand_dryer, graffiti=p_graffiti,
                      wall_clock=p_wall_clock, cleaning_rack=p_cleaning_rack, bar_mat=p_bar_mat,
                      cardboard_flat=p_cardboard_flat)
# world px: the hitbox of data/props.js + 1 px of outline on each side (keep in step with INTERIOR_PROPS in
# src/engine/Assets.js and SIZES / ON_WALL in tools/levelkit.py); the last two are floor paint
INTERIOR_SIZES = dict(shop_shelf=(42, 13), wine_rack=(42, 13), beer_cases=(22, 18), lottery_stand=(14, 12), tv_stack=(32, 20),
                      vcr_shelf=(42, 13), tv_box=(22, 18), repair_bench=(48, 24), dryer=(24, 24), folding_table=(46, 22),
                      soap_vend=(20, 12), laundry_cart=(26, 17), plastic_chair=(15, 15), cig_machine=(24, 17),
                      ice_bin=(20, 15), coat_rack=(20, 20), bottle_crate=(16, 12), wet_sign=(11, 9), mop_bucket=(18, 18),
                      water_cooler=(15, 15), filing_cabinet=(18, 22), safe=(24, 24), pallet=(40, 32), steel_shelf=(42, 14),
                      hand_truck=(14, 24), security_mirror=(12, 6), cig_rack=(28, 6), price_board=(24, 5), tape_rack=(30, 6),
                      notice_board=(22, 5), coin_changer=(12, 7), hand_dryer=(10, 7), graffiti=(28, 4),
                      wall_clock=(9, 5), cleaning_rack=(22, 7), bar_mat=(64, 14), cardboard_flat=(30, 20))
INTERIOR_GLOWING = ['tv_stack', 'soap_vend', 'cig_machine']   # their emissive maps painted fine, with them
CLUTTER_PAINT.update(glass_rack=c_glass_rack, phone=c_phone, papers=c_papers, mug=c_mug, vhs=c_vhs, soap=c_soap,
                     folded=c_folded, ledger=c_ledger, adding=c_adding, ashtray_full=c_ashtray_full)
CLUTTER_SIZES.update(glass_rack=(9, 9), phone=(8, 7), papers=(8, 7), mug=(5, 4), vhs=(7, 5), soap=(5, 6), folded=(9, 7),
                     ledger=(9, 7), adding=(7, 9), ashtray_full=(7, 7))


def build():
    out = {}
    for i, (cid, ch) in enumerate(CHARS.items()):
        g = 'characters'
        out[(g, cid + '_torso')] = draw_torso(ch)
        out[(g, cid + '_head')] = draw_head(ch)
        out[(g, cid + '_down')] = knocked_down(ch)
        out[(g, cid + '_dead0')] = draw_body(ch, 30, 22, POSE_DEAD, dead=True, seed=i)
        out[(g, cid + '_dead1')] = draw_body(ch, 30, 22, POSE_DEAD, dead=True, headless=True, seed=i)
        out[(g, cid + '_gib_head')] = gib_head(ch)
        out[(g, cid + '_gib_arm')] = gib_arm(ch)
        out[(g, cid + '_gib_leg')] = gib_leg(ch)
        out[(g, cid + '_gib_torso')] = gib_torso(ch, i)
    out[('characters', 'cueball_head_hurt')] = draw_head(dict(CHARS['cueball'], hurt=True))
    for i in range(3):
        out[('characters', 'gib_chunk%d' % i)] = gib_chunk(i)
    out[('characters', 'gib_eye')] = gib_eye()
    out[('characters', 'lucky_scarf')] = lucky_scarf(CHARS['lucky']['scarf'])
    out[('characters', 'player_tail_l')] = player_tail(CHARS['player'], -1)
    out[('characters', 'player_tail_r')] = player_tail(CHARS['player'], 1)
    out[('characters', 'player_rag_skirt')] = rag_skirt(CHARS['player'])
    for name, cv in weapons().items():
        out[('weapons', name)] = cv
    for i, (cid, ch) in enumerate(CHARS.items()):
        out[('characters', cid + '_rag_torso')] = rag_torso(ch)
        out[('characters', cid + '_rag_head')] = rag_head(ch)
        out[('characters', cid + '_rag_torso_up')] = rag_torso_up(ch)
        out[('characters', cid + '_rag_torso_down')] = rag_torso_down(ch)
        out[('characters', cid + '_rag_head_up')] = rag_head_up(ch)
        out[('characters', cid + '_rag_arm')] = rag_arm(ch)
        out[('characters', cid + '_rag_leg')] = rag_leg(ch)
    for name, cv in mags().items():
        out[('weapons', name)] = cv
    for name, cv in items().items():
        out[('items', name)] = cv
    out[('items', 'shades')] = shades_item()
    props = dict(table=p_table, table_round=p_table_round, card_table=p_card_table, dope_table=p_dope_table, gas_bottle=p_gas_bottle, dance_stage=p_dance_stage, desk=p_desk, chair=p_chair, armchair=p_armchair,
                 sofa=p_sofa, plant=p_plant, tv=p_tv, fridge=p_fridge, oven=p_oven, sink=p_sink,
                 toilet=p_toilet, bed=p_bed, pool_table=p_pool_table, arcade=p_arcade, crate=p_crate,
                 barrel=p_barrel, bookshelf=p_bookshelf, speaker=p_speaker, dj_booth=p_dj_booth,
                 bar_counter=p_bar_counter, car=p_car, dumpster=p_dumpster, trash_can=p_trash_can, trash_can_down=p_trash_can_down, bin_lid=p_bin_lid,
                 car2=p_car2, van=p_van, car_tire=p_car_tire, car_hood=p_car_hood, car_door=p_car_door,
                 car2_hood=p_car2_hood, car2_door=p_car2_door, van_hood=p_van_hood, van_door=p_van_door,
                 convertible=p_convertible, convertible_hood=p_convertible_hood, convertible_door=p_convertible_door,
                 boss_hat=p_boss_hat,
                 pursuer=p_pursuer, pursuer_hood=p_pursuer_hood, pursuer_door=p_pursuer_door,
                 palm_tree=p_palm_tree, streetlight=p_streetlight, neon_sign_palm=p_neon_sign_palm,
                 neon_sign_bar=p_neon_sign_bar, neon_sign_arrow=p_neon_sign_arrow, jukebox=p_jukebox,
                 hydrant=p_hydrant, bench=p_bench, chain_fence=p_chain_fence)
    props.update(SHOP_PROPS)
    props.update(DETAIL_PROPS)
    props.update(BAR_PROPS)
    props.update(LABEL_PROPS)
    props.update(CHASE_PROPS)
    props.update(FLAT_PROPS)
    props.update(INTERIOR_PROPS)
    for name, fn in props.items():
        r = fine(fn, name) if name in FINE_PROPS else fn()
        if isinstance(r, tuple):   # (sprite, emissive map)
            out[('props', name)], out[('props', name + '_glow')] = r
        else:
            out[('props', name)] = r
    out[('props', 'dj_booth_glow')] = glow_from(out[('props', 'dj_booth')], lambda x, y, c: is_neon(c))
    for name, fn in LIGHT_PROPS.items():
        out[('props', name)], out[('props', name + '_glow')] = fine(fn, name) if name in FINE_PROPS else fn()
    for name, fn in ROOF_PROPS.items():
        r = fine(fn, name) if name in ROOF_FINE else fn()
        if isinstance(r, tuple):
            out[('roof', name)], out[('roof', name + '_glow')] = r
        else:
            out[('roof', name)] = r
    for name, cv in tiles().items():
        out[('tiles', name)] = cv
    for name, fn in CLUTTER_PAINT.items():
        out[('clutter', name)] = fine(fn, 'clutter_' + name)
    out[('structure', 'door')] = s_door()
    out[('structure', 'door_locked')] = s_door_locked()
    out[('structure', 'stall_door')] = s_stall_door()
    for name, fn in DOOR_SKINS.items():
        out[('structure', name)] = fine(fn, name)
    out[('structure', 'door_jamb')] = s_jamb(ramp('#6e4a32', 0.5, 0.26, 0.34))
    out[('structure', 'door_jamb_steel')] = s_jamb(STEEL_L)
    out[('structure', 'threshold')] = s_threshold()
    out[('structure', 'window')] = s_window()
    out[('structure', 'window_broken')] = s_window_broken()
    out[('structure', 'window_sill')] = s_window_sill()
    out[('structure', 'fence')] = s_fence()
    for name, cv in critters().items():
        out[('critters', name)] = cv
    return out


# ---------------------------------------------------------------- Miami, 1985: Sunset Bay's night dressing
# Generic and reusable (no piece tied to one spot; tools/build_level2a.py's frontage road and on-ramp use them first):
# pastel stucco and neon, royal palms, hibiscus, billboards, a dealer's lot, and the freeway's grime (a burnt-out car,
# a camp under the bridge, a dented rail, an old crash). FINE density like the 2A props, every painter its own seeds.
# MIAMI_PROPS stand, MIAMI_PAINT is floor paint (levelkit FLOOR), MIAMI_NEON are neon signs on a wall (the world's
# density, as the other neon signs). Colour variants where they cost nothing: the canopies, the hedges, the awnings,
# the palms, the billboards, the pole signs.
FONT_STENCIL.setdefault('.', [".....", ".....", ".....", ".....", ".....", ".....", "..#.."])
FONT_STENCIL.setdefault('-', [".....", ".....", ".....", ".###.", ".....", ".....", "....."])
FONT_STENCIL.setdefault('Z', ["#####", "....#", "...#.", "..#..", ".#...", "#....", "#####"])
STUCCO = dict(pink='#f0a8c0', mint='#9edcc6', peach='#f6c49c', lavender='#c2b0e4')
NEON_OF = dict(pink=NEON_CYAN, mint=NEON_PINK, peach=NEON_PINK, lavender=NEON_CYAN)   # the tube each colour wears


def tube_text(ne, x, y, text, col, k=2):
    """Neon letters of FONT_SHOP on a grid k px apart, the strokes ONE tube wide (bigger letters, still tubes)."""
    for ch in text:
        g = FONT_SHOP[ch]
        for gy, row in enumerate(g):
            for gx, c in enumerate(row):
                if c != '#':
                    continue
                for (dx, dy) in ((1, 0), (0, 1), (1, 1), (-1, 1)):
                    nx, ny = gx + dx, gy + dy
                    if 0 <= ny < len(g) and 0 <= nx < len(row) and g[ny][nx] == '#':
                        if dx and dy and (g[gy][nx] == '#' or g[ny][gx] == '#'):
                            continue                                      # (a diagonal only where nothing turns the corner)
                        ne.line([(x + gx * k, y + gy * k), (x + nx * k, y + ny * k)], col)
                ne.dot(x + gx * k, y + gy * k, col)
        x += (len(g[0]) + 1) * k
    return x


def tube_w(text, k=2):
    return sum((len(FONT_SHOP[c][0]) + 1) * k for c in text) - k - (k - 1)


def palm_crown(S, seed, fronds, greens, dead_col, shaft, trunk_r):
    """A palm's crown from above, S world px square, painted pixel by pixel at the canvas's density: `fronds` [(angle,
    reach, width, bend, kind)] (kind 0 green, 1 a young one (lighter, drawn last), 2 dead and hanging (first)), each a
    rachis with its leaflets combed out either side, gaps between them, lit on the side that faces the light, the tip
    drooping away (darker, narrower); `shaft` the crownshaft's ramp (None: a fibrous boss) of radius trunk_r."""
    cv = Cv(S, S)
    c0, s = S / 2, cv.s
    rng = random.Random(seed)
    K = 18
    order = sorted(range(len(fronds)), key=lambda i: (0 if fronds[i][4] == 2 else 1 if fronds[i][4] == 0 else 2))
    for idx in order:
        a, ln, wid, bend, kind = fronds[idx]
        fr = Cv(S, S)
        pts = []
        for k in range(K):
            t = k / (K - 1.0)
            aa = a + bend * t * t
            r = trunk_r * 0.6 + ln * t
            pts.append((c0 + math.cos(aa) * r, c0 + math.sin(aa) * r))
        segs = []
        for k in range(K - 1):
            (ax, ay), (bx, by) = pts[k], pts[k + 1]
            dx, dy = bx - ax, by - ay
            segs.append((ax, ay, dx, dy, dx * dx + dy * dy))
        g = dead_col if kind == 2 else greens[1] if kind == 1 else greens[0]
        xs, ys = [p[0] for p in pts], [p[1] for p in pts]
        span = wid + 2
        phase = rng.uniform(0, 3)
        for j in range(max(0, int((min(ys) - span) * s)), min(cv.ph, int((max(ys) + span) * s) + 1)):
            for i in range(max(0, int((min(xs) - span) * s)), min(cv.pw, int((max(xs) + span) * s) + 1)):
                px_, py_ = (i + 0.5) / s, (j + 0.5) / s
                best = None
                for k, (ax, ay, dx, dy, ll) in enumerate(segs):
                    tt = max(0.0, min(1.0, ((px_ - ax) * dx + (py_ - ay) * dy) / ll))
                    qx, qy = px_ - ax - tt * dx, py_ - ay - tt * dy
                    d = qx * qx + qy * qy
                    if best is None or d < best[0]:
                        best = (d, (k + tt) / (K - 1.0), (qx * dy - qy * dx) / math.sqrt(ll))
                d, t, side = best
                d = math.sqrt(d)
                w = wid * math.sin(math.pi * min(1.0, t * 0.92 + 0.08)) ** 0.55 * (1.0 - 0.45 * t)
                if kind == 2:
                    w *= 0.7
                if d > w or t > 0.985 or t < 0.04:
                    continue
                q = t * ln * 0.9 - abs(side) * 1.5 + phase                # the leaflets slant out toward the tip
                f = q / 3.0 - math.floor(q / 3.0)
                if abs(side) < 0.55:
                    c = lt(g[2], 0.45) if kind != 2 else lt(g[2], 0.2)    # the rachis, pale
                else:
                    if f > (0.5 if kind == 2 else 0.62) and abs(side) > max(1.2, w * 0.38):
                        continue                                          # between two leaflets (open)
                    lit = side * (math.sin(a) * LX - math.cos(a) * LY) > 0
                    c = (g[3] if f < 0.3 else g[2]) if lit else (g[2] if f < 0.2 else g[1])   # each leaflet lit along one edge
                    if abs(side) > w * 0.78:
                        c = dk(c, 0.18)                                   # the leaflets' tips droop
                    if t > 0.72:
                        c = dk(c, 0.12 + (t - 0.72) * 0.5)                # the frond's end bends down, away
                    if kind == 2 and rng.random() < 0.12:
                        c = dk(c, 0.25)
                fr.p[i, j] = c
        leaf_over(cv, fr)
    top = Cv(S, S)
    if shaft:
        # the heart of the crown: the fronds' sheaths wrapped round the spear leaf, matte (seen from above, the
        # crownshaft is hidden under them: no glossy ball), creased where the sheaths overlap
        fill_shape(top, c0, c0, trunk_r * 0.72, trunk_r * 0.72, lambda u, v, L: shade(shaft, 0.18 + L * 0.6))
        for k in range(5):
            aa = k * 2 * math.pi / 5 + 0.4
            line(top, c0 + math.cos(aa) * 0.6, c0 + math.sin(aa) * 0.6, c0 + math.cos(aa + 0.5) * trunk_r * 0.7,
                 c0 + math.sin(aa + 0.5) * trunk_r * 0.7, dk(shaft[1], 0.2))
        line(top, c0 - 0.5, c0 - 0.5, c0 + 1.0, c0 - trunk_r * 0.6, lt(shaft[3], 0.15))   # the spear leaf
    else:
        boots(top, c0, trunk_r, random.Random(seed + 7))
    leaf_over(cv, top)
    return cv


def royal_palm(seed, n, dead):
    def make():
        """A royal palm from above (hung high: its trunk, smooth and pale grey, is the pole drawn up to it): sixteen
        long fronds arching out 2.1 to 2.4 m from the green crownshaft (a crown 4.5 to 5 m across: at 6 m it hung over
        every sign near it), plumed with leaflets, their ends dropping away; `dead` brown ones hanging under them, a
        few young ones up in the middle."""
        S = 160
        rng = random.Random(seed)
        greens = PALM_GREENS['royal']
        fronds = []
        for i in range(n):
            a = i * 2 * math.pi / n + rng.uniform(-0.16, 0.16)
            fronds.append((a, rng.uniform(64.0, 74.0), rng.uniform(8.5, 10.5), rng.uniform(-0.3, 0.3), 0))
        for i in range(5):
            a = rng.uniform(0, 2 * math.pi)
            fronds.append((a, rng.uniform(28.0, 38.0), 6.0, rng.uniform(-0.2, 0.2), 1))
        for i in range(dead):
            a = rng.uniform(0, 2 * math.pi)
            fronds.append((a, rng.uniform(33.0, 43.0), 7.5, rng.uniform(-0.15, 0.15), 2))
        return palm_crown(S, seed, fronds, greens, PALM_DEAD, ramp('#3a7a44', 0.5, 0.26, 0.3), 7.0)
    return make


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


def poster_palm(cv, base, top, size, ink, rng):
    """A coconut palm's silhouette as a poster prints it (the billboards'): a trunk tapering and curving from base
    to top, fronds arching out of its head and drooping, each tapering to its tip with its leaflets hanging under it
    in short strokes. size: a frond's reach (world px)."""
    (bx, by), (tx, ty) = base, top
    mx, my = (bx + tx) / 2 + (tx - bx) * 0.25, (by + ty) / 2
    pts = curve((bx, by), (mx, my), (tx, ty), 10)
    for k in range(len(pts) - 1):
        fill_capsule(cv, [pts[k], pts[k + 1]], size * 0.13 * (1.0 - 0.45 * k / (len(pts) - 1)), lambda *a: ink)
    for a in (-2.95, -2.45, -1.95, -1.45, -0.95, -0.45, 0.05, 2.75, 0.4):
        a += rng.uniform(-0.12, 0.12)
        L = size * rng.uniform(0.85, 1.05)
        droop = 0.55 if abs(math.sin(a)) < 0.6 else 0.3
        prev = (tx, ty)
        for q in range(1, 13):
            t = q / 12.0
            p = (tx + math.cos(a) * L * t, ty + math.sin(a) * L * t + droop * L * t * t)
            fill_capsule(cv, [prev, p], max(0.5, size * 0.08 * (1.0 - 0.8 * t)), lambda *a_: ink)
            if 0.2 < t < 0.95:
                lx, ly = p[0] + math.cos(a + 1.6) * size * 0.16 * (1 - t), p[1] + abs(math.sin(a + 1.6)) * size * 0.2 * (1 - t) + size * 0.05
                line(cv, p[0], p[1], lx, ly, ink)                             # its leaflets hang under it
            prev = p
    fill_shape(cv, tx, ty + size * 0.06, size * 0.11, size * 0.09, lambda u, v, L: ink)   # the nuts' cluster


def billboard(kind, face='poster'):
    def make():
        """A billboard on its catwalk from above, laid back to be read, 8 m: the poster in its steel frame (`tan`: a
        sun-tan oil over a striped sunset and the sea, a palm cut out against it; `radio`: a station's sunset over a
        neon grid), paper peeling at a seam, grime down its foot; the catwalk's grating and rail under it, four lamps
        on their arms leaning up over the poster (the emissive map: their lenses). face: 'poster' (whole), 'bare'
        (the paper gone: the steel sheets it was pasted on) or 'frame' (the sheets gone too: the lattice behind),
        the layers entities/Board.js tears it down to (no emissive map)."""
        W, H = 256, 112
        cv, gl = Cv(W, H), Cv(W, H)
        rng = random.Random(9990 + len(kind))
        x0, y0, x1, y1 = 6, 4, W - 6, 86
        n = VNoise(W, H, 8, rng)

        def frame(ly):
            frect(ly, x0 - 3, y0 - 3, x1 + 3, y1 + 3, shade(STEEL_L, 0.35))
            frect(ly, x0 - 3, y0 - 3, x1 + 3, y0 - 2, shade(STEEL_L, 0.8))
        if face == 'frame':
            layer(cv, lambda ly: board_lattice(ly, x0, y0, x1, y1, 48, STEEL_L, 3))
        else:
            layer(cv, frame)
        if face == 'bare':
            board_sheets(cv, x0, y0, x1, y1, 48, 'steel', random.Random(9970 + len(kind)))
        elif face == 'poster':
            if kind == 'tan':
                sky = [(0.0, hx('#8a6ad0')), (0.35, hx('#e070b0')), (0.62, hx('#ff9a8a')), (0.78, hx('#ffc070'))]
                hz = 64.0

                def poster(x, y, cur):
                    t = (y - y0) / (hz - y0)
                    if y >= hz:
                        w = math.floor((y - hz) / (y1 - hz) * 4) / 3.0           # the sea in four flat bands
                        c = mix(hx('#2aa0b0'), hx('#165a80'), min(1.0, w))
                        if abs(x - 188) < 30 - w * 10 and int(y * 2) % 3 == 0:
                            c = mix(c, hx('#ffd080'), 0.55 - w * 0.4)          # the sun's road on the sea
                        return c
                    t = (math.floor(t * 9) + 0.5) / 9                          # the sky in nine flat bands (a print)
                    for (a, ca), (b, cb) in zip(sky, sky[1:] + [(1.0, hx('#ffd890'))]):
                        if t <= b:
                            return mix(ca, cb, (t - a) / (b - a))
                    return sky[-1][1]
                px_paint(cv, x0, y0, x1, y1, poster)

                def sun(x, y, cur):
                    d = math.hypot(x - 188, y - hz)
                    if d > 28 or y > hz:
                        return None
                    if y > hz - 16 and int((hz - y) / 2.5) % 2 == 1:
                        return None                                            # the retro bands cut through it
                    return mix(hx('#fff080'), hx('#ff7a3a'), math.floor((y - (hz - 28)) / 7) / 3.0)   # in flat bands
                px_paint(cv, 160, hz - 30, 218, hz, sun)
                poster_palm(cv, (34, y1), (56, 22), 24, hx('#3a1a4a'), random.Random(9995))
                words(cv, 160 - 66, 10, 'COCOA GOLD', hx('#3a1a4a'), 2.0)      # its shadow, then the words
                words(cv, 160 - 67, 9, 'COCOA GOLD', hx('#fff4e0'), 2.0)
                words(cv, 160 - 30, 28, 'TANNING OIL', hx('#3a1a4a'), 1.0)
                fill_shape(cv, 112, 62, 7.0, 15.0, lambda u, v, L: shade(ramp('#c87a2a', 0.5, 0.26, 0.35), 0.3 + L * 0.7), kind='rect', corner=3.0)
                frect(cv, 109, 44, 115, 48, hx('#f4f0e0'))                    # the bottle: its cap, its label
                frect(cv, 106.5, 57, 117.5, 69, hx('#fff4e0'))
                words(cv, 112, 59, 'SPF', hx('#c8242c'), 0.5, centre=True)
                words(cv, 112, 64, '4', hx('#c8242c'), 0.5, centre=True)
            else:
                hz = 58.0

                def poster(x, y, cur):
                    if y < hz:
                        return mix(hx('#2a1050'), hx('#d0408a'), math.floor((y - y0) / (hz - y0) * 8) / 7.0)   # flat bands
                    w = (y - hz) / (y1 - hz)
                    c = mix(hx('#1a0830'), hx('#2a0a40'), w)
                    gx = (x - W / 2) / (1.0 + w * 4.0)
                    if abs((gx + 300) % 14 - 7) < 0.6 + w * 0.4 or int((w ** 0.5) * 9 * 4) % 4 == 0:
                        c = mix(c, NEON_CYAN, 0.7)                             # the neon grid running away
                    return c
                px_paint(cv, x0, y0, x1, y1, poster)

                def sun(x, y, cur):
                    d = math.hypot(x - W / 2, y - hz)
                    if d > 34 or y > hz or (y > hz - 20 and int((hz - y) / 3) % 2 == 1):
                        return None
                    return mix(hx('#ffe060'), hx('#ff3a8a'), math.floor((y - (hz - 34)) / 34 * 5) / 4.0)
                px_paint(cv, W / 2 - 36, hz - 36, W / 2 + 36, hz, sun)
                words(cv, W / 2 + 1, 13, 'WAVE 98', hx('#1a0830'), 3.0, centre=True)
                words(cv, W / 2, 12, 'WAVE 98', hx('#fff0f8'), 3.0, centre=True)
                words(cv, W / 2 + 0.5, 36.5, 'FM  THE HOTTEST HITS', hx('#1a0830'), 1.0, centre=True)   # its shadow: read over the sun
                words(cv, W / 2, 36, 'FM  THE HOTTEST HITS', NEON_CYAN, 1.0, centre=True)
            # paper and weather: the seams of the sheets, a peeled strip, grime down its foot, droppings on its top
            for x in range(x0 + 48, x1, 48):
                px_paint(cv, x, y0, x + 0.5, y1, lambda x_, y_, c: dk(c, 0.12))
            px_paint(cv, x1 - 30, y0, x1, y0 + 14, lambda x, y, c: (hx('#e8e2d0') if (x - (x1 - 30)) + (y - y0) * 1.6 > 18 + n(x, y) * 6 else None))
            for y in range(int(y1) - 10, int(y1)):
                px_paint(cv, x0, y, x1, y + 1, lambda x, y_, c: dk(c, (y_ - (y1 - 10)) / 10 * 0.35 * n(x, y_)))
            smudge(cv, rng, 8, (x0, y0, x1, y0 + 4), (0.5, 1.0), 0.6, hx('#ece8dc'))
        cv.outline()

        def catwalk(ly):
            frect(ly, x0 - 2, y1 + 3, x1 + 2, y1 + 15, shade(STEEL_L, 0.4))
            for x in range(int(x0), int(x1), 2):
                frect(ly, x, y1 + 4, x + 1, y1 + 14, shade(STEEL_L, 0.22))  # its grating
            frect(ly, x0 - 2, y1 + 14, x1 + 2, y1 + 15.5, shade(STEEL_L, 0.75))   # the rail
            for x in (40, 128, 216):
                fill_shape(ly, x, y1 + 20, 4.0, 3.0, lambda u, v, L: shade(STEEL_L, 0.2 + L * 0.6), kind='rect', corner=1.0)   # the legs' tops
        layer(cv, catwalk)
        for x in (38.0, 102.0, 154.0, 218.0):                              # the lamps on their arms
            fill_capsule(cv, [(x, y1 + 12), (x, y1 - 6)], 1.0, lambda k, L, s, i, t: shade(STEEL_L, L))
            fill_shape(cv, x, y1 - 8, 5.0, 2.6, lambda u, v, L: shade(ramp('#4e5362', 0.5, 0.25, 0.4), 0.2 + L * 0.6), kind='rect', corner=1.0)
            frect(cv, x - 4, y1 - 8, x + 4, y1 - 6.5, hx('#fff6dc'))
            frect(gl, x - 4, y1 - 8, x + 4, y1 - 6.5, hx('#fff0d0'))
        return (cv, gl) if face == 'poster' else cv
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


MIAMI_PAINT = dict(   # floor paint (levelkit FLOOR): name -> (painter, size in world px)
    mattress_dumped=(p_mattress_dumped, (68, 46)),
    litter_a=(litter(10151, 5), (72, 40)), litter_b=(litter(10152, 3), (72, 40)),
    tyre_marks=(p_tyre_marks, (256, 72)), crash_debris=(p_crash_debris, (72, 44)),
    display_ramp=(p_display_ramp, (176, 64)), expansion_joint=(p_expansion_joint, (8, 192)),
    oil_streak=(p_oil_streak, (256, 20)),
)
MIAMI_PROPS = dict(royal_palm=royal_palm(10161, 16, 2), royal_palm_b=royal_palm(10162, 14, 4),
                   hibiscus_hedge=hibiscus_hedge('#e8283c', 10171), hibiscus_hedge_pink=hibiscus_hedge('#ff6fa8', 10172),
                   billboard_tan=billboard('tan'), billboard_radio=billboard('radio'),
                   # what entities/Board.js tears their faces down to: the bare steel sheets, then the lattice
                   billboard_tan_bare=billboard('tan', 'bare'), billboard_tan_frame=billboard('tan', 'frame'),
                   billboard_radio_bare=billboard('radio', 'bare'), billboard_radio_frame=billboard('radio', 'frame'),
                   pole_sign_motel=pole_sign('motel'), pole_sign_autos=pole_sign('autos'),
                   car_burnt=p_car_burnt, tent_tarp=p_tent_tarp, barrel_fire=p_barrel_fire,
                   chainlink_fence=chainlink(0), chainlink_hole=chainlink(1), guardrail_dented=p_guardrail_dented,
                   call_box=p_call_box, pennant_string=p_pennant_string,
                   lot_light=p_lot_light, sign_gantry=p_sign_gantry,
                   awning_pink=awning_of(ramp('#f08ab0', 0.5, 0.26, 0.3), ramp('#f4f0e6', 0.45, 0.24, 0.25), 10181),
                   awning_mint=awning_of(ramp('#7ad0b0', 0.5, 0.26, 0.3), ramp('#f4f0e6', 0.45, 0.24, 0.25), 10182),
                   awning_peach=awning_of(ramp('#f4a878', 0.5, 0.26, 0.3), ramp('#f4f0e6', 0.45, 0.24, 0.25), 10183),
                   awning_lavender=awning_of(ramp('#b49ae0', 0.5, 0.26, 0.3), ramp('#f4f0e6', 0.45, 0.24, 0.25), 10184))
for _c in STUCCO:
    MIAMI_PROPS['deco_canopy_' + _c] = deco_canopy(_c)
MIAMI_SIZES = dict(royal_palm=(160, 160), royal_palm_b=(160, 160), hibiscus_hedge=(96, 26), hibiscus_hedge_pink=(96, 26),
                   billboard_tan=(256, 112), billboard_radio=(256, 112), billboard_tan_bare=(256, 112),
                   billboard_tan_frame=(256, 112), billboard_radio_bare=(256, 112), billboard_radio_frame=(256, 112), pole_sign_motel=(80, 56), pole_sign_autos=(80, 56),
                   car_burnt=(140, 58), tent_tarp=(72, 52), barrel_fire=(24, 24), chainlink_fence=(128, 14),
                   chainlink_hole=(128, 14), guardrail_dented=(128, 10), call_box=(18, 20),
                   pennant_string=(112, 16), lot_light=(72, 24), sign_gantry=(80, 448), awning_pink=(98, 38), awning_mint=(98, 38),
                   awning_peach=(98, 38), awning_lavender=(98, 38),
                   **{'deco_canopy_' + _c: (128, 40) for _c in STUCCO})
MIAMI_GLOWING = ['billboard_tan', 'billboard_radio', 'pole_sign_motel', 'pole_sign_autos', 'barrel_fire', 'lot_light', 'sign_gantry'] + ['deco_canopy_' + _c for _c in STUCCO]
MIAMI_NEON = dict(neon_sign_motel=wall_neon('motel'), neon_sign_vacancy=wall_neon('vacancy'), neon_sign_flamingo=wall_neon('flamingo'))
MIAMI_NEON_SIZES = dict(neon_sign_motel=(40, 14), neon_sign_vacancy=(46, 14), neon_sign_flamingo=(26, 14))
MIAMI_PROPS.update((n, fn) for n, (fn, _) in MIAMI_PAINT.items())
MIAMI_SIZES.update((n, sz) for n, (_, sz) in MIAMI_PAINT.items())
CHASE_PROPS.update(MIAMI_PROPS)
CHASE_SIZES.update(MIAMI_SIZES)
CHASE_PROPS.update(MIAMI_NEON)
CHASE_SIZES.update(MIAMI_NEON_SIZES)
CHASE_NEON += list(MIAMI_NEON)
ROAD_GLOWING += MIAMI_GLOWING


# ---------------------------------------------------------------- the suburb going to Miami
# Level 2A's street is still the suburb, but Miami is near: palms take over from the street trees, pastel stucco, a
# strip's pole sign, the homeless and their things (as on the frontage road), and what the lorry's dodge can go through
# on the sidewalk (a fruit market on a vacant corner, a car wash's forecourt, a used tyre yard). Generic and reusable
# (no piece tied to one spot), FINE density as the other 2A props, every painter its own seeds. SUBURB_PROPS stand,
# SUBURB_PAINT is floor paint (levelkit FLOOR); the lit ones' emissive maps in SUBURB_GLOWING. Hand-painted signs are in
# English and Spanish (invented names, no real brand).
FONT_STENCIL.setdefault('$', ["..#..", ".####", "#.#..", ".###.", "..#.#", "####.", "..#.."])
FONT_SHOP.setdefault('Z', ["#####", "....#", "...#.", "..#..", ".#...", "#....", "#####"])
STRAW = PALM_DEAD                                # a dead frond, standing or fallen (the palms' family)
CREAM = '#efe2c4'
PLY = ramp('#c8a878', 0.45, 0.22, 0.25)          # weathered plywood


def hand_words(cv, x, y, text, col, k=1.0, seed=0, centre=False, wob=0.4):
    """Capitals of FONT_STENCIL painted by hand (a brush or a marker): every letter a little off the line, askew in
    its place and of its own tone, the stroke dry here and there."""
    rng = random.Random(seed)
    if centre:
        x = x - words_w(text, k) / 2
    for n, ch in enumerate(text):
        dx, dy = rng.uniform(-wob, wob) * 0.5 * k, rng.uniform(-wob, wob) * k
        sh, tn = rng.uniform(-0.14, 0.14), rng.randint(-10, 10)
        for gy, row in enumerate(FONT_STENCIL[ch]):
            for gx, c in enumerate(row):
                if c != '#' or rng.random() < 0.05:
                    continue
                x0, y0 = x + (n * 6 + gx + sh * (3 - gy)) * k + dx, y + gy * k + dy
                frect(cv, x0, y0, x0 + k, y0 + k, shift(col, tn))


def fan_leaf(ly, hxc, hyc, a, R, g, spread, nseg, rng, torn=(), dead=False, droop=0.7, split=0.42):
    """A palmetto's fan leaf from above, opening at (hxc, hyc) toward `a`: its segments fused at the heart, split
    beyond, each folded along its middle (one half lit, the other shaded), their tips split and drooping away (darker),
    the middle ones longest; `torn` segments broken short."""
    lens = [rng.uniform(0.8, 1.05) for _ in range(nseg)]

    def f(x, y, cur):
        dx, dy = x - hxc, y - hyc
        d = math.hypot(dx, dy)
        if d < 0.4:
            return None
        rel = (math.atan2(dy, dx) - a + math.pi) % (2 * math.pi) - math.pi
        if abs(rel) > spread:
            return None
        k = (rel + spread) / (2 * spread) * nseg
        seg, fr = int(k), k - int(k)
        reach = R * (0.6 + 0.4 * math.cos(rel / spread * math.pi / 2) ** 0.7) * lens[min(seg, nseg - 1)]
        if seg in torn:
            reach *= 0.5
        if d > reach:
            return None
        t = d / reach
        if t > split:
            gap = 0.12 + (t - split) / (1 - split) * 0.3                   # the segments narrow to their points
            if fr < gap or fr > 1 - gap + 0.04:
                return None                                                # between two segments
        if t > 0.8 and 0.44 < fr < 0.56:
            return None                                                    # each tip split in two
        th = a + rel
        nx, ny = (math.sin(th), -math.cos(th)) if fr < 0.5 else (-math.sin(th), math.cos(th))
        c = shade(g, 0.22 + 0.62 * light(nx * 0.8, ny * 0.8))
        if abs(fr - 0.5) < 0.07:
            c = g[2]                                                       # the fold
        if t > droop:
            c = dk(c, (t - droop) * 0.7)                                   # the ends hang away from the light
        if dead and rng.random() < 0.14:
            c = dk(c, 0.22)
        return c
    px_paint(ly, hxc - R - 1, hyc - R - 1, hxc + R + 1, hyc + R + 1, f)


def boots(cv, c0, r, rng):
    """The old leaf bases (boots) crisscrossing round a palmetto's crown, its trunk's top."""
    bark = ramp('#6a5038', 0.5, 0.26, 0.3)

    def f(dx, dy, d):
        a = math.atan2(dy, dx)
        q = (a * 5 / math.pi + d * 0.6) % 1.0
        q2 = (-a * 5 / math.pi + d * 0.6) % 1.0
        k = 0.25 + light(dx / r, dy / r) * 0.6 - (0.25 if min(q, q2) < 0.18 else 0)
        return shift(shade(bark, k), rng.randint(-5, 5))
    ring(cv, c0, c0, 0.0, r, f)


def sabal_palm(S, seed, n, dead, ragged=0.0):
    def make():
        """A sabal palmetto (cabbage palm) from above, the suburb's palm: a rounder, scruffier crown than a royal's, of
        fan leaves on long stalks, `dead` brown ones hanging under the green, a few young ones up in the middle, the
        boots of old leaves crisscrossing round its top (its rough trunk is the pole drawn up to it); `ragged`: the
        odds a segment is torn short."""
        cv = Cv(S, S)
        rng = random.Random(seed)
        c0 = S / 2
        leaves = [(rng.uniform(0, 2 * math.pi), rng.uniform(7, 12), rng.uniform(14, 19), 2) for _ in range(dead)]
        for i in range(n):
            leaves.append((i * 2 * math.pi / n + rng.uniform(-0.22, 0.22), rng.uniform(S * 0.15, S * 0.21), rng.uniform(S * 0.2, S * 0.25), 0))
        leaves += [(rng.uniform(0, 2 * math.pi), rng.uniform(6, 9), rng.uniform(12, 16), 1) for _ in range(4)]
        for (a, r0, R, kind) in leaves:
            ly = Cv(S, S)
            g = PALM_DEAD if kind == 2 else PALM_GREENS['sabal'][kind]
            hxc, hyc = c0 + math.cos(a) * r0, c0 + math.sin(a) * r0
            torn = {k for k in range(13) if rng.random() < ragged} if kind == 0 else ()
            fan_leaf(ly, hxc, hyc, a, R, g, 1.1 if kind == 2 else 1.45, 8 if kind == 2 else 10, rng, torn, kind == 2,
                     0.5 if kind == 2 else 0.7)
            fill_capsule(ly, [(c0 + math.cos(a) * 3, c0 + math.sin(a) * 3), (hxc, hyc), (hxc + math.cos(a) * R * 0.4, hyc + math.sin(a) * R * 0.4)],
                         0.75, lambda k, L, s, i, t, g=g: shade(g, 0.5 + L * 0.35))   # the stalk, its costa into the fan
            leaf_over(cv, ly)
        top = Cv(S, S)
        boots(top, c0, 4.5, rng)
        leaf_over(cv, top)
        return cv
    return make


def p_coconut_palm_lean():
    """A coconut palm leaning out over the sidewalk, from above, its foot at the sprite's middle: the trunk, ringed
    with leaf scars and flared at its foot, curving up and out 3 m to its crown (yellow-green fronds, a few dead
    ones, young ones up in the middle) with its coconuts clustered round the heart. The trunk is painted (no pole)."""
    W, H = 288, 112
    cv = Cv(W, H)
    rng = random.Random(10301)
    bx, by = W / 2, H / 2
    cx, cy = W / 2 + 98, H / 2 - 8
    pts = curve((bx, by), (bx + 60, by + 6), (cx, cy), 20)
    bark = ramp('#8a7458', 0.5, 0.26, 0.3)
    fill_shape(cv, bx, by, 5.4, 5.4, lambda u, v, L: shade(bark, 0.15 + L * 0.5))   # the flare at its foot
    run = 0.0
    for k in range(len(pts) - 1):
        (ax, ay), (qx, qy) = pts[k], pts[k + 1]
        seg = math.hypot(qx - ax, qy - ay)
        r = 4.0 - 1.2 * k / (len(pts) - 1)

        def f(kk, L, s, i, t, run=run, seg=seg, k=k):
            along = run + t * seg
            lit = 0.28 + L * 0.5 + 0.2 * k / (len(pts) - 1)               # higher, nearer the light
            if (along % 3.3) < 0.7:
                lit -= 0.22                                                 # its rings
            return shade(bark, lit)
        fill_capsule(cv, [(ax, ay), (qx, qy)], r, f)
        run += seg
    cv.outline()
    greens = PALM_GREENS['coconut']
    fronds = [(i * 2 * math.pi / 13 + rng.uniform(-0.18, 0.18), rng.uniform(32, 38), rng.uniform(8, 10), rng.uniform(-0.45, 0.45), 0) for i in range(13)]
    fronds += [(rng.uniform(0, 2 * math.pi), rng.uniform(26, 30), 7.0, rng.uniform(-0.2, 0.2), 2) for _ in range(3)]
    fronds += [(rng.uniform(0, 2 * math.pi), rng.uniform(16, 20), 6.0, 0.0, 1) for _ in range(4)]
    crown = palm_crown(88, 10302, fronds, greens, PALM_DEAD, None, 4.0)
    nuts = Cv(88, 88)
    for (dx, dy, col) in ((-4.2, 2.0, '#7a5a22'), (-1.2, 4.6, '#5a7a2a'), (3.2, 3.6, '#7a5a22'), (4.4, -1.4, '#6a8a2a'), (0.2, -4.6, '#7a5a22')):
        fill_shape(nuts, 44 + dx, 44 + dy, 2.4, 2.4, lambda u, v, L, col=col: shade(ramp(col, 0.5, 0.25, 0.35), 0.15 + L * 0.75))
    leaf_over(crown, nuts)
    cv.over(crown, int(cx - 44), int(cy - 44))
    return cv


def p_palm_young():
    """A young royal palm planted in a sidewalk grate, from above (the grate is floor paint, tree_grate; its thin
    trunk is the pole): eight fronds arching out a metre, two young ones up in the middle, one gone brown."""
    greens = PALM_GREENS['royal']
    rng = random.Random(10311)
    fronds = [(i * 2 * math.pi / 8 + rng.uniform(-0.2, 0.2), rng.uniform(24, 28), rng.uniform(6.5, 7.5), rng.uniform(-0.3, 0.3), 0) for i in range(8)]
    fronds += [(rng.uniform(0, 2 * math.pi), 13.0, 5.0, 0.0, 1) for _ in range(2)]
    fronds += [(rng.uniform(0, 2 * math.pi), 20.0, 5.5, 0.1, 2)]
    return palm_crown(64, 10312, fronds, greens, PALM_DEAD, ramp('#3a7a44', 0.5, 0.26, 0.3), 3.2)


def p_palm_stump():
    """What is left of a palm cut down, from above, 0.55 m: the rough grey-brown rind round a pale fibrous cut face
    speckled with its bundles, weathered dark at the heart, split by drying cracks, a sprout of grass at its foot."""
    S = 20
    cv = Cv(S, S)
    rng = random.Random(10321)
    c = S / 2
    rind = ramp('#6a5a48', 0.5, 0.26, 0.3)
    face = ramp('#c8b08a', 0.45, 0.22, 0.25)
    ring(cv, c, c, 0.0, 8.6, lambda dx, dy, d: shift(shade(rind, 0.2 + light(dx / 9, dy / 9) * 0.6), rng.randint(-8, 8)))

    def cut(dx, dy, d):
        k = 0.6 - 0.25 * (1 - d / 7.0) + (rng.random() - 0.5) * 0.18
        col = shade(face, k)
        if rng.random() < 0.18:
            col = dk(col, 0.25)                                            # the fibres' ends
        return col
    ring(cv, c, c, 0.0, 7.0, cut)
    for a in (0.4, 2.3, 4.1):
        crease(cv, [(c + math.cos(a) * 1.0, c + math.sin(a) * 1.0), (c + math.cos(a + 0.2) * 4.0, c + math.sin(a + 0.2) * 4.0),
                    (c + math.cos(a) * 6.8, c + math.sin(a) * 6.8)], 0.4)
    smudge(cv, rng, 3, (6, 6, 14, 14), (1.5, 3.0), 0.2)
    cv.outline()
    for (x, y) in ((2.5, 15.0), (3.5, 16.5), (16.5, 3.0), (17.5, 4.5)):
        line(cv, x, y, x + rng.uniform(-1, 1), y - 1.5, hx('#5a8a3a'))
    return cv


def p_palm_frond_fallen():
    """A dead palm frond lying where it fell (floor paint), 2.7 m: the boot of its base, the pale rachis tapering
    away along x with a little curl, the brown leaflets combed forward both sides, flattened, some broken off."""
    W, H = 88, 28
    cv = Cv(W, H)
    rng = random.Random(10331)

    def spine(x):
        return 14.0 + 3.0 * math.sin(x / W * math.pi * 1.2) - 0.0004 * (x - 10) ** 2 * 3

    for x0 in range(10, W - 4, 2):
        if rng.random() < 0.12:
            continue
        t = (x0 - 10) / (W - 14)
        ln = 9.5 * (1 - t * 0.75) * rng.uniform(0.7, 1.05)
        for side in (-1, 1):
            if rng.random() < 0.08:
                continue
            col = shade(STRAW, rng.uniform(0.25, 0.75))
            y0 = spine(x0)
            ax = x0 + ln * 0.7
            ay = y0 + side * ln * rng.uniform(0.55, 0.75)
            line(cv, x0, y0, ax, ay, col)
            line(cv, x0 + 0.5, y0, ax + 0.5, ay, dk(col, 0.2))
    fill_capsule(cv, [(6, spine(6)), (30, spine(30)), (60, spine(60)), (W - 3, spine(W - 3))], 0.9,
                 lambda k, L, s, i, t: shade(STRAW, 0.6 + L * 0.3))         # the rachis
    fill_shape(cv, 6, spine(6), 6.0, 3.6, lambda u, v, L: shade(ramp('#7a5a3a', 0.5, 0.26, 0.3), 0.2 + L * 0.6), ang=0.1)   # its boot
    cv.outline(hx('#2a1a10'))
    return cv


def p_sabal_frond_fallen():
    """A palmetto's fan leaf blown down (floor paint), 2 m: the long stalk, the fan dried brown and gone limp, its
    segments splayed flat."""
    W, H = 64, 44
    cv = Cv(W, H)
    rng = random.Random(10341)
    fan_leaf(cv, 30, 22, 0.15, 22, ramp('#8a6a40', 0.55, 0.3, 0.25), 2.0, 12, rng, {2, 9}, True, 0.6)
    fill_capsule(cv, [(2, 26), (16, 24), (36, 22)], 0.85, lambda k, L, s, i, t: shade(STRAW, 0.55 + L * 0.3))
    cv.outline(hx('#2a1a10'))
    return cv


def p_coconuts_fallen():
    """Coconuts fallen in a palm's litter (floor paint), 1.25 m: three in their husks (brown, one still green), one
    split open on the fibres, the boat of a dried flower spathe."""
    W, H = 40, 26
    cv = Cv(W, H)
    rng = random.Random(10351)
    fill_capsule(cv, [(4, 20), (14, 22), (24, 21)], 2.2, lambda k, L, s, i, t: shade(ramp('#9a7a4a', 0.5, 0.26, 0.3), 0.25 + L * 0.5 - (0.2 if k < 0.4 else 0)))
    for (x, y, col, rx, ry, a) in ((10, 9, '#7a5a22', 4.0, 3.2, 0.3), (19, 12, '#5a7a2a', 4.2, 3.4, -0.4), (31, 8, '#7a5a22', 3.8, 3.1, 1.2)):
        fill_shape(cv, x, y, rx, ry, lambda u, v, L, col=col: shift(shade(ramp(col, 0.5, 0.25, 0.35), 0.15 + L * 0.75), rng.randint(-6, 6)), ang=a)
    fill_shape(cv, 32, 19, 3.6, 2.6, lambda u, v, L: shade(ramp('#8a6a42', 0.5, 0.25, 0.3), 0.2 + L * 0.6), ang=0.5)
    fill_shape(cv, 32.3, 19.2, 2.2, 1.5, lambda u, v, L: hx('#f0ead8'), ang=0.5)   # split: its white flesh
    for (x, y) in ((27.0, 22.0), (37.0, 16.5), (29.0, 15.5)):
        line(cv, x, y, x + rng.uniform(-2, 2), y + rng.uniform(-2, 2), hx('#a0804a'))   # fibres
    cv.outline(hx('#1a0c10'))
    return cv


def bus_bench(kind):
    def make():
        """A bus stop's bench from above, 2 m: the cast concrete seat, its backrest laid back to be read with a faded
        ad painted on it (`bail`: BAIL in red on sun-bleached yellow, 24 HRS and a number; `abogado`: a lawyer's,
        ABOGADO in cream on a blue band, LLAME and a number), its paint peeling to the concrete, a tag in marker
        on the seat, gum, a chip off a corner."""
        W, H = 64, 26
        cv = Cv(W, H)
        rng = random.Random(10361 + len(kind))
        con = ramp('#b8b2a4', 0.46, 0.24, 0.22)
        fill_shape(cv, W / 2, 19.5, W / 2 - 2, 5.5, lambda u, v, L: shift(shade(con, 0.3 + L * 0.55), rng.randint(-5, 5)), kind='rect', corner=1.5, bevel=1.5)
        for x in (5.0, W - 5.0):
            frect(cv, x - 2, 24.5, x + 2, 25.5, shade(con, 0.2))              # the legs' feet
        n = VNoise(W, H, 5, rng)
        bg, ink = (ramp('#e8cc58', 0.45, 0.22, 0.2), hx('#c8282c')) if kind == 'bail' else (ramp('#7ab8d8', 0.45, 0.22, 0.2), hx('#f4f0e6'))

        def back(x, y, cur):
            if x < 2 or x >= W - 2 or y < 1 or y >= 13.5:
                return None
            if x < 3 or x >= W - 3 or y < 2 or y >= 12.5:
                return shade(con, 0.75 if y < 2 else 0.35)                     # the cast frame round the panel
            c = mix(shade(bg, 0.6), hx(CREAM), 0.25 + n(x, y) * 0.35)        # bleached by the sun
            return c
        px_paint(cv, 0, 0, W, H, back)
        if kind == 'bail':
            hand_words(cv, 5, 3.5, 'BAIL', ink, 1.3, 10371, wob=0.1)
            words(cv, 40, 3.5, '24 HRS', hx('#2a2a30'), 0.5)
            words(cv, 36, 8.0, '555-0187', hx('#2a2a30'), 0.5)
            frect(cv, 34.5, 3, 35, 12, hx('#c8282c'))
        else:
            frect(cv, 3, 2, W - 3, 8.5, lambda c: mix(hx('#24508a'), c, 0.25))
            words(cv, W / 2, 2.0, 'ABOGADO', ink, 1.0, centre=True)
            words(cv, W / 2, 9.0, 'LLAME 555-0142', hx('#1e3a6a'), 0.5, centre=True)
        px_paint(cv, 3, 2, W - 3, 12.5, lambda x, y, c: shade(con, 0.5) if n(x * 2.3, y * 2.3) > 0.78 else None)   # peeled
        tag = [(38 + i * 1.1, 19 + 1.8 * math.sin(i * 1.3) + rng.uniform(-0.4, 0.4)) for i in range(14)]
        for (a, b) in zip(tag, tag[1:]):
            line(cv, a[0], a[1], b[0], b[1], hx('#1a1a22'))                     # a tag in marker
        for _ in range(7):
            cv.dot(rng.uniform(6, W - 6), rng.uniform(16, 23), hx('#6a6670'))  # gum
        px_paint(cv, W - 6, 21, W - 1, 26, lambda x, y, c: CLEAR if x + (y - 21) * 0.8 > W - 2 else None)   # a chip off
        smudge(cv, rng, 6, (3, 14, W - 3, 24), (1.5, 3.5), 0.14)
        cv.outline()
        return cv
    return make


def p_payphone_pastel():
    """A pay phone on its post by a strip mall, from above, laid back to be read: a pastel hood round the steel
    phone (the keypad, the coin slot, the black handset on its hook, the armoured cord), PHONE lit on the band over
    it (the emissive map: the band's letters and their glow)."""
    W, H = 20, 18
    cv, gl = Cv(W, H), Cv(W, H)
    rng = random.Random(10381)
    hood = ramp(STUCCO['mint'], 0.5, 0.26, 0.24)

    def shell(x, y, cur):
        if x < 1 or x >= W - 1 or y < 1 or y >= H - 1:
            return None
        if y < 6:
            return hx('#1e5a7a')                                           # the band
        if x < 3 or x >= W - 3:
            return shade(hood, 0.75 if x < 3 else 0.35)                    # its sides
        if y >= H - 2.5:
            return shade(hood, 0.3)
        return shade(STEEL_L, 0.45)                                        # the phone's face
    px_paint(cv, 0, 0, W, H, shell)
    frect(cv, 1, 1, W - 1, 1.5, lt(hx('#1e5a7a'), 0.3))
    for k in range(12):                                                    # the keypad
        cv.dot(9.5 + (k % 3) * 1.5, 8.5 + (k // 3) * 1.5, hx('#e8e8f0') if k != 9 else hx('#c8282c'))
    frect(cv, 14.5, 8.0, 15.5, 9.0, hx('#1a1a20'))                         # the coin slot
    fill_capsule(cv, [(5.5, 7.5), (5.5, 14.5)], 1.1, lambda k, L, s, i, t: shade(RUBBER, 0.25 + L * 0.6))   # the handset
    line(cv, 5.0, 15.0, 7.0, 16.0, shade(STEEL_L, 0.7))
    words(cv, W / 2, 2.0, 'PHONE', hx('#fff4d0'), 0.5, centre=True)
    words(gl, W / 2, 2.0, 'PHONE', hx('#fff0c8'), 0.5, centre=True)
    smudge(cv, rng, 4, (2, 6, W - 2, H - 2), (0.8, 1.8), 0.2)
    cv.outline()
    return cv, gl


def news_box_of(body, top, seed):
    def make():
        """A newspaper box from above in a colour of 1985 (front along +y): its enamel, a coloured lid with the
        paper's band on it, the front page under its window, the coin slot, chipped and sun-faded."""
        cv = Cv(16, 13)
        rng = random.Random(seed)
        r = ramp(body, 0.45, 0.22, 0.3)
        px_paint(cv, 1, 1, 15, 12, lambda x, y, c: shade(r, 0.85 if y < 2.0 else 0.38 if y >= 10.5 else 0.62))
        frect(cv, 2, 1.5, 14, 3.5, hx(top))                                 # its band
        frect(cv, 3, 2.25, 13, 2.75, hx('#f4f0e6'))
        frect(cv, 1, 3.5, 15, 4, dk(r[1], 0.2))                             # the lid's hinge

        def paper(x, y, c):
            if y < 5 or y >= 9.5 or x < 3.0 or x >= 13.0:
                return hx('#2a2a34')
            col = hx('#ece8dc')
            if 5.5 <= y < 6.5 and 3.5 <= x < 12.0:
                col = hx('#2a2a30')
            elif 7.0 <= y < 9.0 and 3.5 <= x < 6.5:
                col = hx('#8a8a90') if int(y * 2) % 2 else hx('#b8b4a8')
            elif 7.0 <= y < 9.0 and x >= 7.0 and int(y * 2) % 2 == 0:
                col = hx('#a8a8b0')
            return col
        px_paint(cv, 2.5, 4.5, 13.5, 10, paper)
        fill_shape(cv, 13.4, 11.0, 0.6, 0.4, lambda u, v, L: hx('#d8d8e0'), kind='rect', corner=0.1)
        smudge(cv, rng, 5, (1, 1, 15, 12), (0.4, 0.9), 0.6, hx('#9aa0ac'))
        smudge(cv, rng, 3, (1, 1, 15, 4), (1.5, 3.0), 0.25, hx(CREAM))       # faded
        cv.outline()
        return cv
    return make


def p_mailbox_blue():
    """A collection mailbox on the corner, from above, 0.55 m: its domed blue top lit along one side, the pull-down
    chute along the front (+y), a white plate with the pickup times, scratches, a sticker, rust at its foot."""
    W, H = 18, 16
    cv = Cv(W, H)
    rng = random.Random(10391)
    blue = ramp('#2a4a8a', 0.5, 0.25, 0.32)
    for (x, y) in ((2.5, 2.5), (W - 2.5, 2.5), (2.5, H - 2.0), (W - 2.5, H - 2.0)):
        fill_shape(cv, x, y, 1.2, 1.2, lambda u, v, L: shade(blue, 0.2), kind='rect', corner=0.3)   # its legs' feet
    fill_shape(cv, W / 2, H / 2 - 0.5, W / 2 - 2, H / 2 - 2, lambda u, v, L: shade(blue, 0.2 + L * 0.7 + (0.12 if abs(u) < 2 else 0)), kind='super', p=3.0)
    fill_shape(cv, W / 2, H - 3.2, 5.0, 1.4, lambda u, v, L: shade(ramp('#3a4a6a', 0.5, 0.25, 0.4), 0.3 + L * 0.6), kind='rect', corner=0.6)   # the chute
    frect(cv, 5.5, 4.5, W - 5.5, 7.0, hx('#ece8de'))
    frect(cv, 6.0, 5.2, W - 6.0, 5.6, hx('#2a3a6a'))
    frect(cv, 6.0, 6.2, W - 8.0, 6.5, hx('#c8282c'))
    fill_shape(cv, 4.5, 9.5, 1.0, 0.7, lambda u, v, L: hx('#f9c80e'), kind='rect', corner=0.2)   # a sticker
    smudge(cv, rng, 5, (2, 2, W - 2, H - 2), (0.4, 0.9), 0.5, hx('#9aa0ac'))
    smudge(cv, rng, 3, (2, H - 5, W - 2, H - 2), (0.8, 1.8), 0.35, hx('#8a4a22'))
    cv.outline()
    return cv


def mailbox_post(number, box, seed):
    def make():
        """A house's mailbox on its post at the end of the drive, from above, 0.6 m: the tunnel-topped box (its curved
        top lit along its ridge), the door at +x, the red flag up on its side, the house's number, rust. One a house
        (the block's numbers, its own paint): never the same number twice along a street."""
        W, H = 20, 10
        cv = Cv(W, H)
        rng = random.Random(seed)
        aq = ramp(box, 0.5, 0.26, 0.28)
        fill_shape(cv, W / 2 - 1, H / 2 + 0.5, W / 2 - 3, H / 2 - 2.5, lambda u, v, L: shade(aq, 0.2 + 0.7 * (1 - abs(v + 0.6) / 3.5) ** 1.5 + L * 0.15), kind='rect', corner=0.8, bevel=0.5)
        frect(cv, W - 4.5, 2.5, W - 3.5, H - 1.5, lambda c: dk(c, 0.35) if c[3] else c)   # the door's seam
        fill_shape(cv, W - 2.7, H / 2 + 0.5, 0.6, 1.0, lambda u, v, L: shade(STEEL_L, 0.5 + L * 0.4))   # its latch
        frect(cv, 6, 0.5, 12, 2.0, hx('#d02a2a'))                              # the flag, up
        frect(cv, 6, 0.5, 12, 1.0, hx('#ff5a4a'))
        light = sum(hx(box)[:3]) > 420                                         # (dark figures on a pale box)
        words(cv, 4, 4.0, number, hx('#2a2430') if light else hx('#f4f0e6'), 0.5)
        smudge(cv, rng, 4, (3, 2, W - 3, H - 1), (0.6, 1.4), 0.4, hx('#8a4a22'))
        cv.outline()
        return cv
    return make


def house_window(lit, seed):
    def make():
        """A house's window on its front wall (the wall at -y), laid back to be read, 1.75 m: two jalousie panes side by
        side in a white aluminium frame, their glass louvres stepped one over the next (each lit along its top edge),
        the crank under each, a concrete sill. `lit`: a lamp on inside, warm through the louvres, the shadow of the
        blind's cord and a curtain's edge (the emissive map); else the night in them, dark blue glass, a streak of the
        street's light."""
        W, H = 56, 14
        cv, gl = Cv(W, H), Cv(W, H)
        rng = random.Random(seed)
        frame = ramp('#e8e4dc', 0.42, 0.22, 0.3)
        warm = ramp('#ffb860', 0.5, 0.25, 0.25)
        night = ramp('#3a4a68', 0.55, 0.3, 0.3)
        y0, y1 = 1.0, 11.0                                                 # the glass's head and foot

        def body(ly):
            fill_shape(ly, W / 2, (y0 + y1) / 2, W / 2 - 1.0, (y1 - y0) / 2 + 0.5, lambda u, v, L: shade(frame, 0.45 + L * 0.4), kind='rect', corner=0.5, bevel=0.5)
            fill_shape(ly, W / 2, H - 1.75, W / 2, 1.25, lambda u, v, L: shade(ramp('#d8d0c0', 0.45, 0.22, 0.3), 0.3 + L * 0.5), kind='rect', corner=0.4, bevel=0.5)   # the sill
        layer(cv, body)
        for (a, b) in ((3.0, W / 2 - 1.0), (W / 2 + 1.0, W - 3.0)):         # two panes, a mullion between them
            for k in range(6):                                             # six louvres, each over the next
                ya = y0 + 0.75 + k * 1.5
                for x in range(int(a * 2), int(b * 2)):
                    for jj in range(3):
                        yy = ya + jj * 0.5
                        xx = (x + 0.5) / 2
                        if lit:
                            c = shade(warm, (0.95, 0.75, 0.45)[jj])
                            if abs(xx - (a + 4.0)) < 0.3 or (xx > b - 6.0 and k < 5):
                                c = dk(c, 0.35)                          # the blind's cord, the curtain drawn
                        else:
                            c = shade(night, (0.85, 0.45, 0.25)[jj])
                            if abs((xx - a) - (yy - y0) * 1.6 - 5.0) < 1.0:
                                c = lt(c, 0.25)                           # the street's light across the glass
                        cv.dot(xx, yy, c)
                        if lit:
                            gl.dot(xx, yy, alpha(c, 235 if jj < 2 else 180))
            frect(cv, a, y1 - 0.5, b, y1, dk(frame[1], 0.2))
            fill_shape(cv, (a + b) / 2, y1 + 0.5, 1.2, 0.5, lambda u, v, L: shade(STEEL_L, 0.4 + L * 0.5), kind='rect', corner=0.2)   # the crank
        frect(cv, W / 2 - 1.0, y0, W / 2 + 1.0, y1, lambda c: shade(frame, 0.7))   # the mullion
        smudge(cv, rng, 4, (2, y1, W - 2, H - 1), (1.0, 2.5), 0.25)       # the sill's dirt
        smudge(cv, rng, 2, (2, y0, W - 2, y1), (1.0, 2.0), 0.12, hx('#c8b896'))
        return (cv, gl) if lit else cv
    return make


def p_house_door():
    """A house's front door on its wall (the wall at -y), laid back to be read: a panelled door of stained wood in its
    white frame, a brass knob and a peephole, a fan light of louvres over it, a step of concrete at its foot and the
    porch light beside it on its bracket, a frosted lantern (lit: the emissive map)."""
    W, H = 48, 16
    cv, gl = Cv(W, H), Cv(W, H)
    rng = random.Random(10421)
    frame = ramp('#e8e4dc', 0.42, 0.22, 0.3)
    teal = ramp('#7a4a2c', 0.5, 0.26, 0.3)                                # (wood: never read as the windows' glass)

    def step(ly):
        fill_shape(ly, 20.0, H - 1.75, 16.0, 1.75, lambda u, v, L: shade(ramp('#b8b0a4', 0.45, 0.22, 0.3), 0.25 + L * 0.55), kind='rect', corner=0.5, bevel=0.75)
    layer(cv, step)

    def door(ly):
        fill_shape(ly, 20.0, 6.75, 14.0, 6.25, lambda u, v, L: shade(frame, 0.45 + L * 0.4), kind='rect', corner=0.4, bevel=0.5)
        fill_shape(ly, 20.0, 7.5, 12.0, 5.0, lambda u, v, L: shade(teal, 0.35 + L * 0.45), kind='rect', corner=0.2, bevel=0.5)
    layer(cv, door)
    for (k, x) in enumerate(range(9, 31, 2)):                              # the fan light's louvres
        frect(cv, x, 1.0, x + 1.0, 2.0, hx('#4a5a74') if k % 2 else hx('#5e7090'))
    for (px0, px1) in ((10.0, 19.0), (21.0, 30.0)):                        # the panels, sunk and lit along their top
        for (py0, py1) in ((4.0, 7.5), (8.5, 11.5)):
            frect(cv, px0, py0, px1, py1, lambda c: dk(c, 0.12))
            frect(cv, px0, py0, px1, py0 + 0.5, lambda c: dk(c, 0.3))
            frect(cv, px0, py1 - 0.5, px1, py1, lambda c: lt(c, 0.18))
    fill_shape(cv, 28.5, 8.0, 0.9, 0.9, lambda u, v, L: shade(ramp('#d8a840', 0.45, 0.22, 0.3), 0.4 + L * 0.6))   # the knob
    cv.dot(20.0, 5.0, hx('#1a1820'))                                      # the peephole
    smudge(cv, rng, 3, (8, 3, 32, 12), (1.0, 2.5), 0.18)

    def lamp(ly):
        frect(ly, 38.0, 4.5, 43.0, 5.5, shade(ramp('#2e2c34', 0.5, 0.25, 0.3), 0.5))   # its bracket
        fill_shape(ly, 40.5, 6.5, 2.5, 3.5, lambda u, v, L: shade(ramp('#2e2c34', 0.5, 0.25, 0.3), 0.3 + L * 0.5), kind='rect', corner=0.8)
    layer(cv, lamp)
    hot, warm = hx('#fff4d8'), hx('#ffd08a')
    px_paint(cv, 39.0, 4.5, 42.0, 9.0, lambda x, y, cur: hot if abs(x - 40.5) < 0.8 and 5.5 < y < 8.0 else warm)
    frect(cv, 38.5, 3.0, 42.5, 4.0, shade(ramp('#2e2c34', 0.5, 0.25, 0.3), 0.6))   # its cap
    px_paint(gl, 39.0, 4.5, 42.0, 9.0, lambda x, y, cur: (255, 244, 216, 255) if abs(x - 40.5) < 0.8 and 5.5 < y < 8.0 else (255, 208, 138, 230))
    return cv, gl


def p_pole_sign_strip():
    """A shopping strip's pole sign by the road, from above, laid back to be read (its pole the prop's): a stepped
    deco cabinet in teal, PALM PLAZA in pink tubes on a dark header, and four backlit tenant panels: LIQUOR, PAWN,
    CHECKS CASHED, BODEGA (the PAWN panel broken at a corner, its tubes showing), grime, a bird's nest on top
    (the emissive map: the tubes, the panels' faces)."""
    W, H = 112, 88
    cv, gl = Cv(W, H), Cv(W, H)
    rng = random.Random(10411)
    pole_cabinet(cv, W, H, '#5ab8b0', CREAM, rng)
    frect(cv, 8, 10, W - 8, 22, hx('#1e1030'))
    ne = Neon(W, H)
    x = neon_text(ne, (W - 56) // 2, 13, 'PALM', NEON_PINK)
    neon_text(ne, x + 4, 13, 'PLAZA', NEON_PINK)
    ne.line([(12, 20), (W - 13, 20)], NEON_CYAN)
    panels = (('LIQUOR', '#f4f0e6', '#c8242c'), ('PAWN', '#f0c828', '#1a1a20'), ('CHECKS CASHED', '#f4f0e6', '#1c6a3c'),
              ('BODEGA', '#c8242c', '#f4f0e6'))
    for k, (txt, face, ink) in enumerate(panels):
        y0 = 25 + k * 14
        frect(cv, 7, y0, W - 7, y0 + 12, shade(STEEL_L, 0.3))
        frect(cv, 8, y0 + 1, W - 8, y0 + 11, hx(face))
        frect(cv, 8, y0 + 1, W - 8, y0 + 2, lambda c: lt(c, 0.25))
        words(cv, W / 2, y0 + 3, txt, hx(ink), 1.0, centre=True)
        frect(gl, 8, y0 + 1, W - 8, y0 + 11, alpha(mix(hx(face), hx('#ffffff'), 0.4), 110))
        words(gl, W / 2, y0 + 3, txt, alpha(dk(hx(ink), 0.5), 0), 1.0, centre=True)
    hole = [(W - 26, 39), (W - 8, 39), (W - 8, 50), (W - 17, 50)]
    px_paint(cv, W - 26, 39, W - 8, 50, lambda x, y, c: hx('#0e0c16') if (y - 39) * 0.9 > (W - 26 - x) * -1.2 and x > W - 26 + (y - 39) * 0.8 else None)
    px_paint(gl, W - 26, 39, W - 8, 50, lambda x, y, c: CLEAR if x > W - 26 + (y - 39) * 0.8 else None)
    for y in (41.5, 47.5):                                                  # its tubes, bare
        frect(cv, W - 22 + (y - 39) * 0.8, y, W - 8, y + 1, hx('#f4fff8'))
        frect(gl, W - 22 + (y - 39) * 0.8, y, W - 8, y + 1, hx('#f0fff4'))
    del hole
    smudge(cv, rng, 10, (7, 24, W - 7, H - 6), (1.5, 4.0), 0.14)
    fill_shape(cv, 20, 6, 4.0, 2.2, lambda u, v, L: shift(hx('#6a5038') if rng.random() < 0.6 else hx('#9a8058'), rng.randint(-10, 10)))   # a nest
    ne.render(cv, gl)
    cv.outline()
    return cv, gl


def yard_fence(gate):
    def make():
        """A front yard's chain-link fence from above, 4 m, waist high, laid back a little: its top rail, the posts
        with their dome caps, the diamond mesh; `gate`: the gate in its middle between two heavier posts, its own
        frame, a fork latch; bougainvillea climbing one end, magenta among its leaves; rust."""
        W, H = 128, 12
        cv = Cv(W, H)
        rng = random.Random(10421 + gate)
        mesh = hx('#a8aeb8')

        def m(x, y, cur):
            u, v = x - 1.0, (y - 3.5) * 2.4
            if (abs((u + v) % 3.5 - 1.75) < 0.32) or (abs((u - v) % 3.5 - 1.75) < 0.32):
                c = shift(mesh, rng.randint(-14, 6))
                return alpha(dk(c, 0.15) if gate and 48 < x < 80 else c, 200)
            return None
        px_paint(cv, 0, 3.5, W, 10.5, m)
        frect(cv, 0, 2.6, W, 3.6, shade(ZINC, 0.75))
        frect(cv, 0, 2.6, W, 3.0, shade(ZINC, 0.95))
        posts = (2.0, 126.0) + ((48.0, 80.0) if gate else (64.0,))
        if gate:
            for (a, b) in (((49.5, 3.5), (78.5, 3.5)), ((49.5, 10.0), (78.5, 10.0)), ((49.5, 3.5), (49.5, 10.0)), ((78.5, 3.5), (78.5, 10.0))):
                line(cv, a[0], a[1], b[0], b[1], shade(ZINC, 0.85))
            frect(cv, 78.5, 4.5, 80.5, 6.0, shade(ZINC, 0.4))                # the latch
            px_paint(cv, 48.5, 2.5, 79.5, 3.7, lambda x, y, c: CLEAR)        # the gate's top rail is its own
            line(cv, 49.5, 3.2, 78.5, 3.2, shade(ZINC, 0.9))
        for x in posts:
            r = 2.0 if gate and x in (48.0, 80.0) else 1.6
            fill_shape(cv, x, 3.1, r, r, lambda u, v, L: shade(ZINC, 0.2 + L * 0.8))
        smudge(cv, rng, 6, (0, 2, W, 11), (1.0, 2.5), 0.4, hx('#8a5a32'))
        leaf, bloom = ramp('#2e6a34', 0.55, 0.3, 0.3), ramp('#e02a8a', 0.45, 0.24, 0.3)
        vine = Cv(W, H, cv.s)
        for _ in range(70):
            x, y = rng.uniform(96, W - 1) if rng.random() < 0.8 else rng.uniform(86, 96), rng.uniform(1.0, 11.0)
            if rng.random() < 0.42:
                fill_shape(vine, x, y, 1.0, 0.8, lambda u, v, L: shade(bloom, 0.3 + L * 0.65), ang=rng.uniform(0, 3))
            else:
                fill_shape(vine, x, y, 1.3, 0.7, lambda u, v, L: shade(leaf, 0.2 + L * 0.7), ang=rng.uniform(0, 3))
        vine.outline(hx('#0e2010'))
        cv.over(vine)
        return cv
    return make


def garden_wall(name):
    def make():
        """A low stucco garden wall from above, 3 m, laid back a little: its rounded coping lit along its top, a
        sliver of its face below in `name`'s pastel with a run of breeze blocks in its middle (their round openings
        dark), a pier at each end under a pyramid cap, the stucco cracked through and chipped to the grey block, rain
        stains, a rust run from a rebar."""
        W, H = 96, 14
        cv = Cv(W, H)
        rng = random.Random(10431 + len(name))
        st = ramp(STUCCO.get(name, CREAM), 0.5, 0.26, 0.24)
        cap = ramp('#e8e2d4', 0.45, 0.22, 0.22)
        n = VNoise(W, H, 4, rng)

        def face(x, y, cur):
            if y < 2.5 or y >= 12.5 or x < 1 or x >= W - 1:
                return None
            if y < 7:
                return shift(shade(cap, 0.82 if y < 3.5 else 0.6 if y < 5.5 else 0.38), rng.randint(-3, 3))   # the coping
            c = shade(st, 0.5 - (y - 7) * 0.04 + (n(x, y) - 0.5) * 0.16)
            if 30 <= x < 66:
                bx, by = (x - 30) % 6.0, y - 9.75
                if math.hypot(bx - 3.0, by) < 1.6:
                    return hx('#1e1a24')                                   # a breeze block's opening
                if bx < 0.4:
                    c = dk(c, 0.18)
            return c
        px_paint(cv, 0, 0, W, H, face)
        for x0 in (0.0, W - 8.0):                                           # the piers and their caps
            fill_shape(cv, x0 + 4, 7.0, 4.0, 6.0, lambda u, v, L: shade(st, 0.3 + L * 0.55), kind='rect', corner=0.5, bevel=1.2)
            fill_shape(cv, x0 + 4, 4.5, 3.4, 3.4, lambda u, v, L: shade(cap, 0.25 + L * 0.7 + (0.15 if u + v < 0 else -0.1)), kind='rect', corner=0.4, bevel=3.0)
        cx = rng.uniform(20, 76)
        crease(cv, [(cx, 2.5), (cx + 1.5, 6.0), (cx + 0.5, 9.0), (cx + 2.0, 12.5)], 0.45)
        crease(cv, [(cx + 30, 7.0), (cx + 31, 12.5)], 0.35)
        px_paint(cv, 70, 2.5, 76, 5.0, lambda x, y, c: shade(ramp('#8e8a84', 0.45, 0.22, 0.3), 0.5) if (x - 70) * 0.5 + (y - 2.5) < 2.4 else None)   # chipped
        smudge(cv, rng, 8, (2, 7, W - 2, 12.5), (1.5, 3.5), 0.16)
        px_paint(cv, 24, 7, 25, 12.5, lambda x, y, c: mix(c, hx('#8a4a22'), 0.4 * (1 - (y - 7) / 6)) if c[3] else None)   # rust run
        cv.outline()
        return cv
    return make


def p_carport():
    """An aluminium carport over a drive from above, 6 x 3.25 m (hung over the car parked under it, which shows
    through): green corrugated fibreglass panels, translucent, their ribs running down the slope from the house (-y)
    to the gutter, lapped at their seams; the purlins under them; the white fascia and gutter along the front and
    the ends; a yellowed panel, one cracked through, leaves and grime along the gutter, a moss streak."""
    W, H = 192, 104
    cv = Cv(W, H)
    rng = random.Random(10441)
    n = VNoise(W, H, 16, rng)

    def roof(x, y, cur):
        if x < 2 or x >= W - 2 or y < 2 or y >= H - 2:
            return None
        if y >= H - 7:
            return shade(ramp('#e8e6dc', 0.4, 0.2, 0.2), 0.85 if y < H - 6 else 0.5 if y < H - 3.5 else 0.3)   # the gutter
        if x < 4 or x >= W - 4:
            return shade(ramp('#e8e6dc', 0.4, 0.2, 0.2), 0.7 if x < 4 else 0.35)
        pnl = int((x - 4) // 26)
        base = hx('#d8d4a0') if pnl == 4 else hx('#b4d4a4')
        rib = 0.5 + 0.5 * math.sin((x - 4) * 2 * math.pi / 3.25)
        c = mix(dk(base, 0.25), lt(base, 0.25), rib * 0.8 + (n(x, y) - 0.5) * 0.3)
        a = 165
        if (x - 4) % 26 < 1.2:
            c, a = dk(base, 0.35), 230                                        # the lap
        if abs(y - 34) < 1.5 or abs(y - 70) < 1.5:
            c, a = mix(c, hx('#6a6e78'), 0.6), 230                          # a purlin under it
        return alpha(c, a)
    px_paint(cv, 0, 0, W, H, roof)
    px_paint(cv, 118, 30, 140, 56, lambda x, y, c: CLEAR if abs((x - 118) * 1.1 - (y - 30) - 2 * math.sin(y)) < 1.4 or (x - 128) ** 2 + (y - 44) ** 2 < 7 else None)   # cracked through
    for _ in range(26):                                                    # leaves in the gutter, on the roof
        x, y = rng.uniform(6, W - 6), rng.choice((rng.uniform(H - 7, H - 4), rng.uniform(8, H - 10)))
        fill_shape(cv, x, y, rng.uniform(1.0, 1.8), 0.7, lambda u, v, L: shade(ramp(rng.choice(('#8a6a3a', '#6a7a3a', '#a0803a')), 0.5, 0.25, 0.3), 0.3 + L * 0.5), ang=rng.uniform(0, 3))
    smudge(cv, rng, 10, (6, H - 18, W - 6, H - 7), (2.0, 5.0), 0.25, hx('#4a5a2a'))   # moss, grime
    smudge(cv, rng, 8, (6, 6, W - 6, H - 8), (3.0, 7.0), 0.12)
    cv.outline()
    return cv


def p_driveway():
    """A house's concrete drive (floor paint), 6 x 3.25 m: two slabs split by a sawn joint, the tracks of the tyres
    worn paler, an oil stain where the car stands, cracks, grass in the joints, its edges broken."""
    W, H = 192, 104
    cv = Cv(W, H)
    rng = random.Random(10451)
    con = ramp('#a8a49a', 0.46, 0.24, 0.22)
    n, n2 = VNoise(W, H, 8, rng), VNoise(W, H, 3, rng)

    def f(x, y, cur):
        e = min(x, y, W - x, H - y) + (n(x * 2, y * 2) - 0.5) * 2.5
        if e < 0.5:
            return None
        k = 0.5 + (n(x, y) - 0.5) * 0.16 + (n2(x, y) - 0.5) * 0.06
        if any(abs(y - t) < 8 for t in (H / 2 - 16, H / 2 + 16)) and 10 < x < W - 10:
            k += 0.06                                                      # the tyres' tracks
        c = shade(con, k)
        if abs(x - W / 2) < 0.6 or abs(y - H / 2) < 0.5:
            c = dk(c, 0.3)                                                 # the joints
            if rng.random() < 0.3:
                c = hx('#4a6a32')                                          # grass in them
        return c
    px_paint(cv, 0, 0, W, H, f)
    for (x, y, r) in ((112, 52, 13), (96, 50, 7)):
        smudge(cv, rng, 4, (x - 4, y - 4, x + 4, y + 4), (r * 0.5, r), 0.3, hx('#1a1820'))
    crease(cv, [(20, 8), (34, 22), (38, 40), (52, 48)], 0.3)
    crease(cv, [(150, H - 6), (160, 70), (176, 64)], 0.3)
    return cv


def p_tv_antenna():
    """A roof's TV aerial from above (hung high on a roof's edge), 1.75 m: the boom along x on its mast's clamp, the
    elements across it shortening from the reflector to the directors, the dipole's black box and the flat lead
    running back to the mast, one element bent by a storm, a guy wire, rust at the joints."""
    W, H = 56, 30
    cv = Cv(W, H)
    rng = random.Random(10461)
    al = ramp('#a8acb4', 0.5, 0.25, 0.35)
    line(cv, 4, 15, 52, 15, shade(al, 0.85))
    line(cv, 4, 15.5, 52, 15.5, shade(al, 0.35))
    for k, x in enumerate(range(6, 52, 5)):
        h = 12.0 - k * 0.8
        if k == 6:
            line(cv, x, 15, x - 2, 15 - h, shade(al, 0.8))                   # bent
            line(cv, x, 15, x + 0.5, 15 + h, shade(al, 0.8))
        else:
            line(cv, x, 15 - h, x, 15 + h, shade(al, 0.85))
        stud(cv, x, 15, hx('#6a6e78'))
    fill_shape(cv, 17, 15, 2.2, 1.6, lambda u, v, L: shade(RUBBER, 0.3 + L * 0.6), kind='rect', corner=0.4)   # the dipole's box
    fill_capsule(cv, [(17, 16.5), (24, 19), (28, 16)], 0.4, lambda k, L, s, i, t: hx('#3a3630'))   # the lead
    fill_shape(cv, 28, 15, 2.4, 2.4, lambda u, v, L: shade(STEEL_L, 0.25 + L * 0.6))   # the mast and its clamp
    line(cv, 28, 15, 2, 28, alpha(hx('#7a7e88'), 200))                       # a guy wire
    smudge(cv, rng, 4, (4, 12, 52, 18), (0.6, 1.4), 0.45, hx('#8a5a32'))
    cv.outline(hx('#1a1a22'))
    return cv


def p_lawn_flamingos():
    """A pair of plastic lawn flamingos from above, on their wire legs in a front yard: the pink bodies, the wings'
    moulded lines, the S of the necks, the heads with their black-tipped beaks, one faded by the sun."""
    W, H = 30, 20
    cv = Cv(W, H)
    for (x, y, a, col, flip) in ((10, 11, 0.3, '#ff6aa0', 1), (21, 8, -0.5, '#f0a0b8', -1)):
        pink = ramp(col, 0.5, 0.26, 0.3)

        def bird(ly, x=x, y=y, a=a, pink=pink, flip=flip):
            ca, sa = math.cos(a), math.sin(a)
            fill_shape(ly, x, y, 4.4, 2.9, lambda u, v, L: shade(pink, 0.25 + L * 0.7) if u > -3.4 else shade(pink, 0.15 + L * 0.4), ang=a)
            crease(ly, [(x - ca * 3 - sa * 1, y - sa * 3 + ca * 1), (x + ca * 1, y + sa * 1), (x + ca * 3 - sa * 0.5, y + sa * 3)], 0.25)
            nx, ny = x + ca * 3.8, y + sa * 3.8
            neck = curve((nx, ny), (nx + ca * 4 + sa * 4 * flip, ny + sa * 4 - ca * 4 * flip), (nx + ca * 6.5 - sa * 0.5 * flip, ny + sa * 6.5 + ca * 0.5 * flip), 8)
            fill_capsule(ly, neck, 0.6, lambda k, L, s, i, t: shade(pink, 0.45 + L * 0.5))
            hx_, hy_ = neck[-1]
            fill_shape(ly, hx_, hy_, 1.4, 1.4, lambda u, v, L: shade(pink, 0.4 + L * 0.5))
            fill_capsule(ly, [(hx_ + ca * 1.0, hy_ + sa * 1.0), (hx_ + ca * 2.6, hy_ + sa * 2.6)], 0.55, lambda k, L, s, i, t: hx('#1a1a20') if t > 0.5 else hx('#f0e8d8'))
            ly.dot(hx_ - sa * 0.6, hy_ + ca * 0.6, hx('#1a1a20'))
        layer(cv, bird)
    return cv


def lawn(W, H, seed):
    def make():
        """A front yard's lawn gone to seed (floor paint, over dirt or between walls): St Augustine grass in soft
        drifts of green, dry straw patches burnt by the sun, a bare spot or two, its edge ragged."""
        cv = Cv(W, H)
        rng = random.Random(seed)
        n, dry, fine_ = VNoise(W, H, 16, rng), VNoise(W, H, 24, rng), VNoise(W, H, 2, rng)
        g, s = ramp('#4a7434', 0.5, 0.26, 0.28), ramp('#a0945a', 0.45, 0.24, 0.24)

        def f(x, y, cur):
            e = min(x, y, W - x, H - y) + (n(x * 3, y * 3) - 0.5) * 6
            if e < 1:
                return None
            k = 0.45 + (fine_(x, y) - 0.5) * 0.16 + (n(x, y) - 0.5) * 0.12
            d = dry(x, y) * 0.8 + n(x * 2, y * 2) * 0.2
            c = shade(g, k)
            if d > 0.58:
                c = mix(c, shade(s, k + 0.05), min(0.85, (d - 0.58) * 2.5))
            if d > 0.84:
                c = mix(c, hx('#6c5846'), min(0.7, (d - 0.84) * 5))         # bare
            c = shift(c, rng.randint(-7, 7))
            if rng.random() < 0.07:
                c = dk(c, 0.22)                                            # a blade's shadow
            return alpha(c, int(255 * min(1.0, (e - 1) / 2.5)))
        px_paint(cv, 0, 0, W, H, f)
        return cv
    return make


def oleander(flower, seed):
    def make():
        """An oleander bush from above, 1.75 m: its narrow leaves in whorls of three, dark and leathery, lit on their
        top faces, crowding into a rough dome; clusters of flowers at the stems' ends, a few petals dropped."""
        W, H = 56, 48
        cv = Cv(W, H)
        rng = random.Random(seed)
        leaf = ramp('#2a5a2e', 0.6, 0.32, 0.3)
        fill_shape(cv, W / 2, H / 2, W / 2 - 4, H / 2 - 4, lambda u, v, L: shade(leaf, 0.08 + L * 0.2), kind='super', p=2.4)
        tips = []
        for _ in range(110):
            a, r = rng.uniform(0, 2 * math.pi), rng.random() ** 0.5
            x, y = W / 2 + math.cos(a) * r * (W / 2 - 7), H / 2 + math.sin(a) * r * (H / 2 - 7)
            ly = Cv(W, H, cv.s)
            for k in range(3):
                b = a + k * 2.1 + rng.uniform(-0.3, 0.3)
                ln = rng.uniform(3.0, 5.0)
                tx, ty = x + math.cos(b) * ln, y + math.sin(b) * ln
                lit = light(-math.sin(b), math.cos(b)) * 0.4 + 0.22 + (1 - r) * 0.3   # the dome's top nearer the light
                fill_capsule(ly, [(x, y), (tx, ty)], 0.75, lambda kk, L, s, i, t, lit=lit: shade(leaf, lit + (0.15 if s < 0 else 0)))
            if rng.random() < 0.4:
                tips.append((x + math.cos(a) * 1.5, y + math.sin(a) * 1.5))
            ly.outline(hx('#0e2212'))
            cv.over(ly)
        pet = ramp(flower, 0.45, 0.22, 0.3)
        for (x, y) in tips:
            for _ in range(rng.randint(3, 5)):
                fx, fy, r = x + rng.uniform(-1.6, 1.6), y + rng.uniform(-1.6, 1.6), rng.uniform(1.0, 1.4)
                ring(cv, fx, fy, 0.0, r, lambda dx, dy, d, r=r: shade(pet, 0.35 + light(dx / r, dy / r) * 0.6) if d > 0.35 else hx('#e8c050'))
        for _ in range(8):
            cv.dot(rng.uniform(3, W - 3), rng.uniform(3, H - 3), pet[2])
        return cv
    return make


def cart_frame(cv, W, H):
    """A shopping cart's castors, wire basket and red handle (p_shopping_cart's, at any size)."""
    for (x, y) in ((2.5, 1.5), (2.5, H - 1.5), (W - 3.5, 1.5), (W - 3.5, H - 1.5)):
        fill_shape(cv, x, y, 1.1, 0.8, lambda u, v, L: shade(RUBBER, 0.4 + L * 0.4))
    wire = ramp('#b8bcc8', 0.5, 0.25, 0.25)

    def basket(x, y, cur):
        if x < 4 or x >= W - 2 or y < 2 or y >= H - 2:
            return None
        edge = x < 4.6 or x >= W - 2.6 or y < 2.6 or y >= H - 2.6
        bar = (x * 2) % 3 < 0.6 or (y * 2) % 3 < 0.6
        return shade(wire, 0.75) if edge else shade(wire, 0.45) if bar else None
    px_paint(cv, 0, 0, W, H, basket)
    frect(cv, 1, 2, 2, H - 2, hx('#c8202c'))
    frect(cv, 1, 2, 2, 2.5, lt(hx('#c8202c'), 0.3))


def p_cart_loaded():
    """A shopping cart someone lives out of, from above: heaped over its basket with a black bin bag, a white grocery
    bag knotted, a clear sack of crushed cans, a grey blanket thrown over one side and hanging over its edge, a broom
    handle across, a bag hung on the handle."""
    W, H = 24, 16
    cv = Cv(W, H)
    rng = random.Random(10471)
    cart_frame(cv, W, H)

    def load(ly):
        fill_shape(ly, 15.5, 6.0, 5.0, 3.6, lambda u, v, L: shade(ramp('#2a2c34', 0.5, 0.26, 0.45), 0.15 + L * 0.8), kind='super', p=2.2)
        fill_shape(ly, 9.0, 5.5, 3.2, 2.6, lambda u, v, L: shade(ramp('#e8e4da', 0.4, 0.2, 0.2), 0.3 + L * 0.6), ang=0.4)
        fill_shape(ly, 9.5, 11.0, 4.0, 2.6, lambda u, v, L: alpha(shade(ramp('#d8dce0', 0.4, 0.2, 0.2), 0.4 + L * 0.5), 230), kind='super', p=2.4)
        for _ in range(9):
            x, y = rng.uniform(6.5, 12.5), rng.uniform(9.5, 12.5)
            ly.dot(x, y, rng.choice((hx('#c8c8d0'), hx('#c82a2a'), hx('#e8e8ee'), hx('#2a5ab8'))))
        fill_shape(ly, 17.5, 11.5, 4.5, 3.4, lambda u, v, L: shade(ramp('#6a6e62', 0.5, 0.26, 0.3), 0.2 + L * 0.6), kind='rect', corner=1.5)
        frect(ly, 13.5, 13.0, 22.0, 15.5, lambda c: shade(ramp('#6a6e62', 0.5, 0.26, 0.3), 0.3))   # over the edge
    layer(cv, load)
    crease(cv, [(14.5, 9.5), (17, 12), (21, 13)], 0.25)
    fill_capsule(cv, [(3, 3.5), (22, 8.5)], 0.6, lambda k, L, s, i, t: shade(WOOD, 0.4 + L * 0.5))   # the broom handle
    fill_shape(cv, 1.5, 9.0, 1.4, 2.2, lambda u, v, L: shade(ramp('#3a6ab8', 0.45, 0.22, 0.3), 0.3 + L * 0.6))   # a bag on the handle
    cv.outline()
    return cv


def p_bedroll():
    """A sleeping bag rolled and tied, from above, 0.85 m: orange nylon quilted across, its layers spiralling at the
    ends, two cords knotted round it, a stain."""
    W, H = 28, 12
    cv = Cv(W, H)
    rng = random.Random(10481)
    ny = ramp('#c8622a', 0.5, 0.26, 0.3)

    def f(k, L, s, i, t):
        c = shade(ny, 0.2 + L * 0.7)
        x = 3 + t * 22
        if x % 4.0 < 0.5:
            c = dk(c, 0.18)                                                # its quilting
        return c
    fill_capsule(cv, [(5, 6), (23, 6)], 4.6, f)
    for x in (4.0, W - 4.0):
        ring(cv, x, 6, 0.0, 3.6, lambda dx, dy, d: shade(ny, 0.35 + 0.35 * math.sin(d * 3.0 + math.atan2(dy, dx))))   # the roll's ends
    for x in (9.0, 19.0):
        frect(cv, x, 1.4, x + 1.0, 10.6, hx('#4a3424'))
    smudge(cv, rng, 3, (6, 2, 22, 10), (1.0, 2.5), 0.25, hx('#5a3a20'))
    cv.outline()
    return cv


def p_cardboard_bed_blanket():
    """A bed on the sidewalk (floor paint), 2.1 m: two flattened boxes, a grey army blanket rumpled over them with its
    two dark stripes, a denim jacket rolled for a pillow at its head (-x), a paperback face down."""
    W, H = 68, 32
    cv = Cv(W, H)
    rng = random.Random(10491)
    card = ramp('#a5855a', 0.4, 0.2, 0.25)
    nz = VNoise(W, H, 4, rng)
    px_paint(cv, 1, 2, W - 1, H - 2, lambda x, y, c: shift(shade(card, 0.55 + (nz(x, y) - 0.5) * 0.3), -4 if int(y * 2) % 3 == 0 else 0))
    crease(cv, [(34, 2), (34.5, H - 2)], 0.2)
    fold = VNoise(W, H, 6, rng)
    bl = ramp('#6a6e5a', 0.5, 0.26, 0.28)

    def blanket(ly):
        def f(u, v, L):
            x, y = u + 38, v + 16
            k = 0.42 + (fold(x, y) - fold(x + 1.5, y + 1.5)) * 0.8 + L * 0.15
            c = shade(bl, max(0.05, min(0.95, k)))
            if 8 < (x - 18) % 30 < 10.5:
                c = dk(c, 0.35)                                            # its stripes
            return c
        fill_shape(ly, 38, 16, 26, 12, f, kind='rect', corner=3.0, bevel=2.0, ang=0.03)
    layer(cv, blanket)
    fill_capsule(cv, [(6, 9), (7, 23)], 3.6, lambda k, L, s, i, t: shade(ramp('#3a5a8a', 0.5, 0.26, 0.3), 0.2 + L * 0.65 - (0.15 if (t * 14) % 3 < 0.6 else 0)))
    fill_shape(cv, 58, 7, 3.0, 2.2, lambda u, v, L: shade(ramp('#c83a2a', 0.45, 0.22, 0.3), 0.3 + L * 0.5), ang=0.3, kind='rect', corner=0.3)
    smudge(cv, rng, 5, (2, 2, W - 2, H - 2), (2.0, 4.0), 0.15)
    cv.outline(hx('#1a1410'))
    return cv


def p_cardboard_sign():
    """A begging sign (floor paint), 0.95 m: a torn flap of a box, HUNGRY and GOD BLESS in black marker, the second
    line squeezed as the room ran out."""
    W, H = 30, 18
    cv = Cv(W, H)
    rng = random.Random(10501)
    card = ramp('#b8925e', 0.4, 0.2, 0.25)
    rag = VNoise(W, H, 3, rng)
    px_paint(cv, 0, 0, W, H, lambda x, y, c: shade(card, 0.55 + (rag(x * 2, y * 2) - 0.5) * 0.2) if min(x, y, W - x, H - y) + (rag(x, y) - 0.5) * 2.5 > 1.0 else None)
    hand_words(cv, W / 2, 3.5, 'HUNGRY', hx('#1a1620'), 0.75, 10502, centre=True)
    hand_words(cv, W / 2, 10.5, 'GOD BLESS', hx('#1a1620'), 0.5, 10503, centre=True)
    smudge(cv, rng, 3, (2, 2, W - 2, H - 2), (1.5, 3.0), 0.2)
    cv.outline(hx('#1a1410'))
    return cv


def p_bags_pile():
    """Someone's things heaped against a wall from above, 1.4 m: three black bin bags knotted at the neck, white
    grocery bags, a red plaid laundry bag, a brown suitcase with a belt round it, a blue tarp's corner."""
    W, H = 46, 24
    cv = Cv(W, H)
    rng = random.Random(10511)
    blk = ramp('#2a2c34', 0.5, 0.26, 0.45)

    def tarp(ly):
        fill_shape(ly, 8, 7, 8.0, 5.0, lambda u, v, L: shade(ramp('#2a5ab8', 0.5, 0.26, 0.3), 0.3 + L * 0.5), ang=-0.2, kind='rect', corner=1.0)
    layer(cv, tarp)

    def case(ly):
        fill_shape(ly, 30, 7, 9.0, 5.5, lambda u, v, L: shade(ramp('#7a5034', 0.5, 0.26, 0.3), 0.2 + L * 0.65), ang=0.1, kind='rect', corner=1.2, bevel=1.5)
        fill_capsule(ly, [(26, 1.8), (27, 12.5)], 0.5, lambda k, L, s, i, t: hx('#2a1a10'))
    layer(cv, case)
    for (x, y, rx, ry, a) in ((10, 15, 7.0, 6.0, 0.4), (21, 13, 6.0, 5.5, -0.3), (40, 15, 5.5, 5.0, 0.8)):
        def bag(ly, x=x, y=y, rx=rx, ry=ry, a=a):
            fill_shape(ly, x, y, rx, ry, lambda u, v, L: shade(blk, 0.1 + L * 0.85 + (0.2 if L > 0.82 else 0)), ang=a, kind='super', p=2.2)
            fill_shape(ly, x + math.cos(a) * rx * 0.8, y + math.sin(a) * rx * 0.8, 1.2, 1.0, lambda u, v, L: shade(blk, 0.6))   # the knot
        layer(cv, bag)
    for (x, y) in ((30, 19), (34, 21)):
        layer(cv, lambda ly, x=x, y=y: fill_shape(ly, x, y, 2.8, 2.2, lambda u, v, L: shade(ramp('#e8e4da', 0.4, 0.2, 0.2), 0.3 + L * 0.6), ang=rng.uniform(0, 3)))

    def plaid(ly):
        def f(u, v, L):
            c = shade(ramp('#b8282c', 0.5, 0.26, 0.3), 0.25 + L * 0.6)
            if int((u + 10) * 1.0) % 4 == 0 or int((v + 10) * 1.0) % 4 == 0:
                c = mix(c, hx('#1a1a30'), 0.45)
            return c
        fill_shape(ly, 16, 5, 4.5, 3.6, f, ang=0.5)
    layer(cv, plaid)
    return cv


def p_doorway_camp():
    """A man's camp in a shop's doorway from above, 2.25 m (the wall and its door at -y): the shutter's steel grille
    along the wall, a brown tarp tied to it and pulled down to two bricks over a cardboard bed, a blanket's edge out
    of its mouth, his boots set side by side, a blue milk crate for a table with a radio and a candle in a can, a
    bottle, a carrier bag."""
    W, H = 72, 48
    cv = Cv(W, H)
    rng = random.Random(10521)
    px_paint(cv, 2, 0.5, W - 2, 4.5, lambda x, y, c: shade(STEEL_L, 0.75 if x % 3 < 1 else 0.3) if y < 4 else shade(STEEL_L, 0.5))   # the grille
    frect(cv, 6, 6, 58, 40, hx('#b88a52'))                                  # the cardboard
    fill_shape(cv, 30, 38, 18, 4.0, lambda u, v, L: shade(ramp('#6a3a5a', 0.5, 0.26, 0.3), 0.3 + L * 0.5), kind='rect', corner=2.0)
    tarp = ramp('#7a5a3a', 0.5, 0.26, 0.3)

    def sheet(u, v, L):
        y = v + 18
        k = 0.75 - y / 36 * 0.5 - 0.1 * abs(math.sin((u + 26) / 13.0 * math.pi))
        return shade(tarp, max(0.05, min(0.95, k)))
    layer(cv, lambda ly: fill_shape(ly, 32, 18, 26, 14, sheet, kind='rect', corner=2.0, bevel=1.5), hx('#1a1008'))
    for x in (9.0, 32.0, 55.0):
        line(cv, x, 3.0, x, 6.5, hx('#d8d0b8'))                             # tied to the grille
    for x in range(10, 56, 9):
        stud(cv, x, 6.5, hx('#c8c8d0'))                                     # its grommets
    for pts in (((14, 8), (18, 20), (16, 30)), ((46, 10), (50, 22)), ((24, 12), (30, 24), (36, 28)), ((38, 8), (40, 16))):
        crease(cv, list(pts), 0.3)
    frect(cv, 27, 17, 34, 18.5, lambda c: mix(c, hx('#a8a8a0'), 0.6))      # duct tape over a tear
    for x in (8.0, 56.0):
        fill_shape(cv, x, 32.5, 3.2, 2.0, lambda u, v, L: shade(ramp('#a04a2a', 0.5, 0.25, 0.3), 0.3 + L * 0.6), kind='rect', corner=0.5)   # bricks
    for (x, y) in ((16.5, 43.0), (21.0, 43.5)):
        fill_shape(cv, x, y, 1.8, 3.6, lambda u, v, L: shade(ramp('#4a3424', 0.5, 0.26, 0.35), 0.2 + L * 0.7), kind='super', p=2.5)   # boots
    fill_shape(cv, 64, 24, 6.0, 6.0, lambda u, v, L: shade(ramp('#2a5ab8', 0.5, 0.26, 0.3), 0.3 + L * 0.6), kind='rect', corner=0.8, bevel=1.0)
    for k in range(4):
        frect(cv, 59.5 + k * 2.5, 19, 60.5 + k * 2.5, 29, lambda c: dk(c, 0.3))   # the crate's slots
    fill_shape(cv, 62.5, 22, 3.0, 2.0, lambda u, v, L: shade(ramp('#3a3a42', 0.5, 0.25, 0.35), 0.3 + L * 0.6), kind='rect', corner=0.4)   # the radio
    ring(cv, 67, 27, 0.0, 1.4, lambda dx, dy, d: shade(STEEL_L, 0.5) if d > 0.7 else hx('#ffd080'))   # the candle in its can
    bottle_down(cv, 44, 44, 0.3, '#5a3a14')
    fill_shape(cv, 4, 42, 2.6, 2.4, lambda u, v, L: shade(ramp('#e8e4da', 0.4, 0.2, 0.2), 0.3 + L * 0.6))
    smudge(cv, rng, 6, (6, 6, 58, 40), (2.0, 4.0), 0.14)
    cv.outline()
    return cv


def p_litter_bottles():
    """What a corner collects (floor paint), 2 m: a bottle in its brown paper bag, a malt liquor bottle on its side
    and the brown glass of another one broken, crushed beer cans, butts, a scratched lottery ticket."""
    W, H = 64, 32
    cv = Cv(W, H)
    rng = random.Random(10531)
    fill_shape(cv, 18, 14, 5.0, 2.6, lambda u, v, L: shade(ramp('#a8845a', 0.4, 0.2, 0.25), 0.3 + L * 0.6), ang=0.5, kind='rect', corner=1.0)
    crease(cv, [(15, 12), (20, 16)], 0.25)
    fill_capsule(cv, [(22.0, 16.5), (24.5, 17.8)], 0.6, lambda k, L, s, i, t: shade(ramp('#5a3a14', 0.5, 0.25, 0.5), L + 0.1))
    bottle_down(cv, 44, 10, 2.6, '#5a3a14')
    bottle_down(cv, 36, 24, -0.4, '#2a5a2a')
    for _ in range(26):
        x, y = rng.gauss(52, 4), rng.gauss(22, 3)
        cv.dot(x, y, rng.choice((hx('#7a4a14'), hx('#a8702a'), hx('#c89a5a'))))
    for (x, y, col) in ((8, 24, '#c8c8d0'), (28, 6, '#2a5ab8'), (56, 8, '#c82a2a')):
        fill_shape(cv, x, y, 2.6, 1.6, lambda u, v, L, col=col: shade(ramp(col, 0.5, 0.25, 0.3), 0.2 + L * 0.6), ang=rng.uniform(0, 3), kind='super', p=2.0)
    for _ in range(6):
        x, y, a = rng.uniform(4, W - 4), rng.uniform(4, H - 4), rng.uniform(0, 3)
        fill_capsule(cv, [(x, y), (x + math.cos(a) * 1.8, y + math.sin(a) * 1.8)], 0.4, lambda k, L, s, i, t: hx('#e8c890') if t < 0.4 else hx('#f0eee8'))
    fill_shape(cv, 10, 8, 2.2, 1.4, lambda u, v, L: hx('#d8e8c0'), ang=0.3, kind='rect', corner=0.2)
    frect(cv, 9, 7.5, 11.5, 8.5, hx('#8a9a70'))
    cv.outline(hx('#14121a'))
    return cv


def fruit_heap(cv, x0, y0, x1, y1, kind, rng):
    """Fruit heaped in a crate's or a table's [x0, x1) x [y0, y1): oranges, mangoes (red to yellow to green), limes,
    avocados, or green coconuts."""
    cols = dict(orange=('#ff8a1a',), mango=('#d83a2a', '#f0a020', '#8ab030'), lime=('#6aa82a',), avocado=('#3a5a22',),
                coconut=('#5a8a2a', '#6a9a30', '#8a6a2a'))[kind]
    rad = dict(orange=1.9, mango=2.0, lime=1.5, avocado=1.8, coconut=2.9)[kind]
    n = int((x1 - x0) * (y1 - y0) / (rad * rad * 2.4)) + 2
    for _ in range(n):
        x, y = rng.uniform(x0 + rad * 0.8, x1 - rad * 0.8), rng.uniform(y0 + rad * 0.8, y1 - rad * 0.8)
        col = ramp(rng.choice(cols), 0.5, 0.26, 0.3)
        sq = 0.78 if kind in ('mango', 'avocado') else 1.0

        def f(u, v, L, col=col):
            return shade(col, 0.15 + L * 0.8)
        fill_shape(cv, x, y, rad, rad * sq, f, ang=rng.uniform(0, 3))
        if kind == 'mango':
            fill_shape(cv, x - 0.4, y - 0.4, rad * 0.6, rad * 0.5, lambda u, v, L: alpha(hx('#f0c030'), 255) if rng.random() < 0.7 else None)
        if kind == 'coconut':
            cv.dot(x, y, dk(col[1], 0.3))


def crate_box(cv, x0, y0, x1, y1, seed):
    """A slatted fruit crate's rim and floor seen from above, its inside dark between the slats."""
    w = ramp('#b89060', 0.45, 0.22, 0.28)
    frect(cv, x0, y0, x1, y1, shade(w, 0.2))
    for (a, b, c, d) in ((x0, y0, x1, y0 + 1.5), (x0, y1 - 1.5, x1, y1), (x0, y0, x0 + 1.5, y1), (x1 - 1.5, y0, x1, y1)):
        frect(cv, a, b, c, d, shade(w, 0.75 if b == y0 or a == x0 else 0.4))
    px_paint(cv, x0 + 1.5, y0 + 1.5, x1 - 1.5, y1 - 1.5, lambda x, y, c: shade(w, 0.35) if int(y - y0) % 3 == 0 else None)


def market_stall(kind):
    def make():
        """A fruit stall on a vacant corner from above, 2.5 m: a striped canvas awning over its back half sun-faded,
        a scalloped valance, a bare bulb hung from its front edge (the emissive map), and under it on the trestle
        table crates of fruit in plain sight; `fruit`: oranges, mangoes, limes and avocados, a hanging scale, paper
        bags; `coco`: green coconuts heaped, a few husked, a bundle of sugar cane, a machete on its block, a cooler."""
        W, H = 80, 48
        cv, gl = Cv(W, H), Cv(W, H)
        rng = random.Random(10541 + len(kind))
        frect(cv, 3, 22, W - 3, 46, lambda c: c)
        fill_shape(cv, W / 2, 35, W / 2 - 3, 11, lambda u, v, L: shade(PLY, 0.3 + L * 0.5), kind='rect', corner=0.8, bevel=1.0)   # the table
        frect(cv, 3, 45, W - 3, 46, shade(PLY, 0.2))
        if kind == 'fruit':
            for k, (fk) in enumerate(('orange', 'mango', 'lime', 'avocado')):
                x0 = 6 + k * 17.5
                crate_box(cv, x0, 26, x0 + 16, 43, 0)
                fruit_heap(cv, x0 + 1.5, 27.5, x0 + 14.5, 41.5, fk, rng)
                frect(cv, x0 + 10, 39, x0 + 15, 42, hx('#f4f0e2'))
                hand_words(cv, x0 + 10.5, 39.7, ('1', '3', '5', '2')[k], hx('#c8282c'), 0.3, 10550 + k)
            ring(cv, 74, 30, 0.0, 3.0, lambda dx, dy, d: shade(STEEL_L, 0.3 + light(dx / 3, dy / 3) * 0.6) if d > 2.2 else hx('#f4f2ea'))   # the scale
            line(cv, 74, 30, 75.5, 28.6, hx('#c8282c'))
            awn = (ramp('#f08a3a', 0.5, 0.26, 0.3), ramp('#f4f0e6', 0.45, 0.24, 0.25))
        else:
            fruit_heap(cv, 6, 25, 44, 44, 'coconut', rng)
            for (x, y) in ((14, 30), (24, 38), (36, 29)):
                fill_shape(cv, x, y, 2.4, 2.2, lambda u, v, L: shade(ramp('#8a6a3a', 0.5, 0.25, 0.3), 0.2 + L * 0.7))
                cv.dot(x - 0.5, y - 0.5, hx('#2a1a10'))
            for k in range(5):
                fill_capsule(cv, [(47, 27 + k * 1.6), (76, 28 + k * 1.4)], 0.75, lambda kk, L, s, i, t: hx('#c8b860') if (t * 30) % 6 < 0.5 else shade(ramp('#a8b85a', 0.5, 0.25, 0.3), 0.3 + L * 0.6))   # cane
            fill_shape(cv, 56, 40, 6.0, 3.6, lambda u, v, L: shade(ramp('#8a6a42', 0.5, 0.25, 0.3), 0.3 + L * 0.5))   # the block
            fill_capsule(cv, [(52, 39), (62, 41)], 0.6, lambda k, L, s, i, t: shade(STEEL_L, 0.5 + L * 0.4) if t > 0.3 else hx('#3a2418'))   # machete
            fill_shape(cv, 71, 39, 5.0, 4.0, lambda u, v, L: shade(ramp('#f4f2ea', 0.4, 0.2, 0.2), 0.3 + L * 0.6), kind='rect', corner=0.8)   # the cooler
            awn = (ramp('#3a9a5a', 0.5, 0.26, 0.3), ramp('#f4f0e6', 0.45, 0.24, 0.25))
        fd = VNoise(W, H, 8, rng)

        def cloth(x, y, cur):
            if y > 20 and (y - 20) > 3.0 * abs(math.sin((x - 2.0) * math.pi / 8.0)) + 0.5:
                return None
            r = awn[0] if int((x - 2.0) // 8) % 2 == 0 else awn[1]
            k = 0.62 - (y - 2) / 20 * 0.2 + (fd(x, y) - 0.5) * 0.1
            c = shade(r, k)
            return mix(c, hx(CREAM), 0.25 * fd(x * 2, y))                   # faded
        px_paint(cv, 2, 2, W - 2, 24, cloth)
        frect(cv, 2, 2, W - 2, 3, shade(STEEL_L, 0.45))                      # the frame along its back
        smudge(cv, rng, 6, (4, 3, W - 4, 20), (1.5, 4.0), 0.12)
        cv.outline()
        line(cv, 40, 19, 40, 23.5, hx('#2a2a30'))                            # the bulb on its cord
        fill_shape(cv, 40, 24.5, 1.3, 1.3, lambda u, v, L: hx('#fff4c0'))
        fill_shape(gl, 40, 24.5, 1.3, 1.3, lambda u, v, L: hx('#ffe8a0'))
        return cv, gl
    return make


def fruit_crate(kind):
    def make():
        """A crate of fruit set out on the sidewalk, from above, 0.6 m: its slatted sides, the fruit heaped in it
        (`kind`), a grower's paper label on the end board."""
        W, H = 20, 14
        cv = Cv(W, H)
        rng = random.Random(10561 + len(kind))
        crate_box(cv, 1, 1, W - 1, H - 1, 0)
        fruit_heap(cv, 2.5, 2.5, W - 2.5, H - 2.5, kind, rng)
        frect(cv, 1, 4.5, 2.5, 9.5, hx(('#2a6ab8', '#c8282c', '#2a8a4a')[len(kind) % 3]))
        cv.outline()
        return cv
    return make


def plywood_sign(W, H, lines, seed, legs=True):
    """A hand-painted plywood sign laid back to be read (an A-frame's legs behind it): its primer patchy, `lines`
    [(text, ink, k, y)] in brush capitals, paint run down from a few strokes, a nail at each corner."""
    cv = Cv(W, H)
    rng = random.Random(seed)
    if legs:
        for x in (4.0, W - 4.0):
            fill_capsule(cv, [(x, 1.5), (x, 3.5)], 1.0, lambda k, L, s, i, t: shade(PLY, 0.2 + L * 0.4))
    n = VNoise(W, H, 4, rng)
    fill_shape(cv, W / 2, H / 2 + 1, W / 2 - 1.5, H / 2 - 2, lambda u, v, L: mix(shade(PLY, 0.5 + L * 0.3), hx('#f0ece0'), 0.7 * n(u + W, v + H) + 0.2), kind='rect', corner=0.5, bevel=1.0)
    for (txt, ink, k, y) in lines:
        hand_words(cv, W / 2, y, txt, hx(ink), k, seed + len(txt), centre=True)
        for _ in range(2):
            x = W / 2 + rng.uniform(-words_w(txt, k) / 2, words_w(txt, k) / 2)
            yy = y + 7 * k
            if cv.get(x, yy - 0.3)[:3] == hx(ink)[:3]:
                frect(cv, x, yy, x + 0.5, yy + rng.uniform(1.0, 2.5), hx(ink))   # a run of paint
    for (x, y) in ((2.5, 3.0), (W - 3.0, 3.0), (2.5, H - 2.0), (W - 3.0, H - 2.0)):
        stud(cv, x, y, hx('#6a6670'))
    smudge(cv, rng, 4, (2, 2, W - 2, H - 2), (1.0, 3.0), 0.14)
    cv.outline()
    return cv


def p_market_sign():
    """The fruit stall's sign on its A-frame (hand-painted): MANGOS in red, FRESH 3/$1 in green under it."""
    return plywood_sign(44, 18, (('MANGOS', '#c8282c', 1.0, 3.5), ('FRESH 3/$1', '#1c6a3c', 0.5, 12.0)), 10571)


def p_carwash_sign():
    """A car wash's big sign on its two stakes by the kerb (hand-painted): CAR WASH in blue and $3 in red."""
    cv = plywood_sign(72, 20, (), 10581, legs=False)
    hand_words(cv, 5, 5.0, 'CAR WASH', hx('#1e4ab0'), 1.0, 10583)
    hand_words(cv, 55, 3.5, '$3', hx('#c8282c'), 1.3, 10582)
    for x in (6.0, 66.0):
        fill_shape(cv, x, 17.5, 2.0, 1.6, lambda u, v, L: shade(ramp('#8a6a42', 0.5, 0.25, 0.3), 0.3 + L * 0.6), kind='rect', corner=0.3)   # the stakes
    return cv


def p_carwash_board():
    """The car wash's sandwich board (hand-painted): HAND / WASH / WAX $5."""
    return plywood_sign(24, 18, (('HAND', '#1e4ab0', 0.5, 4.0), ('WASH', '#1e4ab0', 0.5, 8.0), ('WAX $5', '#c8282c', 0.5, 12.0)), 10591)


def p_wash_bucket():
    """A car wash's bucket from above, 0.45 m: red plastic, its rim lit, soapy grey water with the foam riding on it,
    a yellow sponge floating, the wire handle laid over, suds run down its side."""
    S = 14
    cv = Cv(S, S)
    rng = random.Random(10601)
    c = S / 2
    red = ramp('#c83a2a', 0.5, 0.26, 0.3)
    ring(cv, c, c, 0.0, 6.2, lambda dx, dy, d: shade(red, 0.3 + light(dx / 6, dy / 6) * 0.6))
    ring(cv, c, c, 0.0, 5.0, lambda dx, dy, d: mix(hx('#7a8a92'), hx('#f4f6f8'), 0.8) if rng.random() < 0.55 else hx('#8a9aa2'))
    fill_shape(cv, c + 1.0, c - 0.5, 2.4, 1.6, lambda u, v, L: shade(ramp('#f0c828', 0.45, 0.22, 0.3), 0.3 + L * 0.6), ang=0.4, kind='rect', corner=0.6)
    line(cv, 1.5, c + 1.5, S - 1.5, c + 1.5, shade(STEEL_L, 0.7))
    cv.outline()
    return cv


def p_hose_reel():
    """A hose reel cart from above, 0.85 m: the green hose wound on its drum between the two dark green frames, the
    wheels at its ends, the handle at -x, the hose's end run out with a brass nozzle."""
    W, H = 28, 18
    cv = Cv(W, H)
    fr = ramp('#2a4a32', 0.5, 0.26, 0.35)
    hose = ramp('#3a9a3a', 0.5, 0.26, 0.3)
    for x in (6.0, 22.0):
        fill_shape(cv, x, 9, 1.4, 7.4, lambda u, v, L: shade(fr, 0.2 + L * 0.7), kind='rect', corner=0.5)
        for y in (1.6, 16.4):
            fill_shape(cv, x, y, 2.4, 1.0, lambda u, v, L: shade(RUBBER, 0.3 + L * 0.5), kind='rect', corner=0.4)
    for k in range(9):
        y = 3.0 + k * 1.5
        fill_capsule(cv, [(7.5, y), (20.5, y + 0.3)], 0.85, lambda kk, L, s, i, t: shade(hose, 0.2 + L * 0.75))
    fill_capsule(cv, [(1.5, 3), (1.5, 15)], 0.8, lambda k, L, s, i, t: shade(fr, 0.4 + L * 0.5))   # the handle
    line(cv, 1.5, 3, 6, 3, shade(fr, 0.6))
    line(cv, 1.5, 15, 6, 15, shade(fr, 0.4))
    fill_capsule(cv, [(20.5, 15.5), (24.5, 16.5), (26.5, 13.0)], 0.85, lambda k, L, s, i, t: shade(hose, 0.3 + L * 0.6))
    fill_shape(cv, 26.6, 11.6, 0.9, 1.4, lambda u, v, L: shade(BRASS, 0.3 + L * 0.7), kind='rect', corner=0.4)
    cv.outline()
    return cv


def p_soap_puddle():
    """The car wash's puddle (floor paint), 2.25 m: a thin film of soapy water darkening the ground, its edge ragged,
    islands of foam with their bubbles, a rainbow sheen, a chamois dropped in it."""
    W, H = 72, 40
    cv = Cv(W, H)
    rng = random.Random(10611)
    n, f2 = VNoise(W, H, 12, rng), VNoise(W, H, 3, rng)

    def f(x, y, cur):
        d = math.hypot((x - W / 2) / (W / 2 - 2), (y - H / 2) / (H / 2 - 2)) + (n(x, y) - 0.5) * 0.6
        if d > 1:
            return None
        a = int(120 * min(1.0, (1 - d) * 5))
        c = (70, 84, 100, a)
        if rng.random() < max(0.0, f2(x, y) - 0.5) * 3.2 * (1 - d):
            c = (232, 238, 244, min(220, a + 110))                         # suds, thinning out to the edge
        elif 0.6 < f2(x * 0.7, y * 0.7) < 0.63:
            c = (150, 90, 160, a) if x < W / 2 else (80, 160, 140, a)      # the sheen
        return c
    px_paint(cv, 0, 0, W, H, f)
    for _ in range(30):
        x, y = rng.uniform(10, W - 10), rng.uniform(6, H - 6)
        if cv.get(x, y)[3] > 200:
            ring(cv, x, y, 0.4, 0.9, lambda dx, dy, d: (255, 255, 255, 230) if dx + dy < 0 else None)
    fill_shape(cv, 50, 24, 4.0, 2.4, lambda u, v, L: shade(ramp('#d8b070', 0.45, 0.22, 0.25), 0.3 + L * 0.5), ang=0.6, kind='super', p=2.2)
    return cv


def tyre_flat(cv, x, y, R, rng, letters=False, r_in=None):
    """A tyre lying flat from above: its sidewall a ring of black rubber lit on its top left, the tread's blocks
    round its outer edge, the rim's hole dark, raised white letters on the wall if `letters`, scuffs."""
    r_in = r_in or R * 0.52

    def f(dx, dy, d):
        if d < r_in:
            return None
        a = math.atan2(dy, dx)
        k = 0.2 + light(dx / R, dy / R) * 0.45 * (1 if d > (R + r_in) / 2 else -0.6) + 0.12
        c = shade(RUBBER, k)
        if d > R - 1.0 and int((a + math.pi) * R * 0.9) % 2 == 0:
            c = dk(c, 0.25)                                                # the tread
        if letters and abs(d - (R + r_in) / 2) < 0.5 and 0.3 < (a % 1.6) < 1.2 and int(a * 12) % 2:
            c = hx('#d8d4c8')
        return shift(c, rng.randint(-4, 4))
    ring(cv, x, y, 0.0, R, f)
    ring(cv, x, y, r_in - 0.6, r_in, lambda dx, dy, d: shade(RUBBER, 0.6 if dx + dy < 0 else 0.15))


def p_tyre_loose():
    """A used tyre lying flat, from above, 0.7 m: raised white letters on its wall, the tread worn."""
    S = 22
    cv = Cv(S, S)
    tyre_flat(cv, S / 2, S / 2, 10.0, random.Random(10621), True)
    cv.outline()
    return cv


def p_tyre_stack():
    """Four used tyres stacked by the kerb, from above, 0.75 m: never square on one another, the edges of the lower
    ones showing, the top one's hole dark down the stack, chalked prices."""
    S = 24
    cv = Cv(S, S)
    rng = random.Random(10631)
    for k in range(4):
        layer(cv, lambda ly, k=k: tyre_flat(ly, S / 2 + rng.uniform(-1.4, 1.4), S / 2 + rng.uniform(-1.4, 1.4), 9.8 - k * 0.1, rng, k == 3))
    ring(cv, S / 2, S / 2, 0.0, 4.4, lambda dx, dy, d: hx('#0e0c12') if cv.get(S / 2 + dx, S / 2 + dy)[3] == 0 else None)
    hand_words(cv, 5, 2.5, '5', hx('#f4f0e6'), 0.5, 10632)
    return cv


def p_tyre_pile():
    """A heap of used tyres in a yard, from above, 1.75 m: some flat, two on their edge with the tread across them, a
    whitewall among them, a puddle in one's hole."""
    W, H = 56, 40
    cv = Cv(W, H)
    rng = random.Random(10641)
    for (x, y, R) in ((14, 26, 10.0), (32, 28, 10.5), (44, 16, 9.5), (24, 12, 10.0)):
        layer(cv, lambda ly, x=x, y=y, R=R: tyre_flat(ly, x, y, R, rng, rng.random() < 0.4))
    for (x, y, a) in ((40, 32, 0.3), (16, 10, -0.7)):
        def edge(ly, x=x, y=y, a=a):
            def f(u, v, L):
                c = shade(RUBBER, 0.25 + L * 0.5)
                if int((u + 20) * 1.4) % 3 == 0:
                    c = dk(c, 0.3)                                         # the tread across it
                return c
            fill_shape(ly, x, y, 10.0, 3.8, f, ang=a, kind='rect', corner=3.0, bevel=2.0)
        layer(cv, edge)
    ring(cv, 32, 28, 0.0, 3.0, lambda dx, dy, d: (60, 70, 90, 220))
    ring(cv, 32, 28, 3.0, 3.6, lambda dx, dy, d: hx('#f0ece4') if cv.get(32 + dx, 28 + dy)[3] else None)   # a whitewall
    cv.outline()
    return cv


def p_tyre_rack():
    """A used tyre rack from above, 2 m: two steel rails along x on their posts, eight tyres stood on their edge side
    by side in it, their treads facing up, chalk on two of them."""
    W, H = 64, 20
    cv = Cv(W, H)
    rng = random.Random(10651)
    for y in (3.0, 17.0):
        frect(cv, 1, y - 1, W - 1, y + 1, shade(STEEL_L, 0.35))
        frect(cv, 1, y - 1, W - 1, y - 0.5, shade(STEEL_L, 0.8))
    for k in range(8):
        x = 5.0 + k * 7.6 + rng.uniform(-0.4, 0.4)

        def t(ly, x=x, k=k):
            def f(u, v, L):
                c = shade(RUBBER, 0.25 + L * 0.5)
                if int((v + 20) * 1.5) % 3 == 0 and abs(u) < 2.0:
                    c = dk(c, 0.3)
                return c
            fill_shape(ly, x, 10, 3.4, 9.0, f, kind='rect', corner=2.5, bevel=1.5)
        layer(cv, t)
    hand_words(cv, 11.5, 7, '8', hx('#f4f0e6'), 0.5, 10652)
    hand_words(cv, 34.5, 7, '12', hx('#f4f0e6'), 0.5, 10653)
    for x in (1.5, W - 1.5):
        fill_shape(cv, x, 10, 1.2, 8.5, lambda u, v, L: shade(STEEL_L, 0.3 + L * 0.5), kind='rect', corner=0.3)
    return cv


def p_tyre_sign():
    """A used tyre yard's sign (hand-painted): LLANTAS in yellow-on-black, USED TIRES $10 under it."""
    cv = plywood_sign(48, 18, (('LLANTAS', '#1a1a20', 1.0, 3.0), ('USED TIRES $10', '#c8282c', 0.5, 12.0)), 10661)
    return cv


SUBURB_PAINT = dict(   # floor paint (levelkit FLOOR): name -> (painter, size in world px)
    palm_frond_fallen=(p_palm_frond_fallen, (88, 28)), sabal_frond_fallen=(p_sabal_frond_fallen, (64, 44)),
    coconuts_fallen=(p_coconuts_fallen, (40, 26)), driveway=(p_driveway, (192, 104)),
    lawn_dry_a=(lawn(128, 96, 10671), (128, 96)), lawn_dry_b=(lawn(96, 64, 10672), (96, 64)),
    cardboard_bed_blanket=(p_cardboard_bed_blanket, (68, 32)), cardboard_sign=(p_cardboard_sign, (30, 18)),
    litter_bottles=(p_litter_bottles, (64, 32)), soap_puddle=(p_soap_puddle, (72, 40)),
)
SUBURB_PROPS = dict(sabal_palm=sabal_palm(112, 10281, 12, 3), sabal_palm_b=sabal_palm(104, 10282, 10, 4, 0.08),
                    sabal_palm_ragged=sabal_palm(112, 10283, 10, 8, 0.22), coconut_palm_lean=p_coconut_palm_lean,
                    palm_young=p_palm_young, palm_stump=p_palm_stump,
                    bus_bench_bail=bus_bench('bail'), bus_bench_abogado=bus_bench('abogado'), payphone_pastel=p_payphone_pastel,
                    news_box_yellow=news_box_of('#e8b820', '#c8282c', 10701), news_box_red=news_box_of('#c02a2a', '#1a1a20', 10702),
                    mailbox_blue=p_mailbox_blue, mailbox_post=mailbox_post('1402', '#5ab8b0', 10401),
                    mailbox_post_b=mailbox_post('1410', '#2e2c34', 10402), mailbox_post_c=mailbox_post('1418', '#ece4d2', 10403),
                    mailbox_post_d=mailbox_post('1426', '#a84a3a', 10404), pole_sign_strip=p_pole_sign_strip,
                    house_window=house_window(False, 10422), house_window_lit=house_window(True, 10423), house_door=p_house_door,
                    yard_fence=yard_fence(0), yard_fence_gate=yard_fence(1), carport=p_carport, tv_antenna=p_tv_antenna,
                    lawn_flamingos=p_lawn_flamingos, oleander_pink=oleander('#f07aa8', 10711), oleander_white=oleander('#f4ecdc', 10712),
                    cart_loaded=p_cart_loaded, bedroll=p_bedroll, bags_pile=p_bags_pile, doorway_camp=p_doorway_camp,
                    market_stall=market_stall('fruit'), market_stall_coco=market_stall('coco'),
                    fruit_crate_orange=fruit_crate('orange'), fruit_crate_mango=fruit_crate('mango'),
                    fruit_crate_coconut=fruit_crate('coconut'), market_sign=p_market_sign,
                    carwash_sign=p_carwash_sign, carwash_board=p_carwash_board, wash_bucket=p_wash_bucket, hose_reel=p_hose_reel,
                    tyre_stack=p_tyre_stack, tyre_pile=p_tyre_pile, tyre_loose=p_tyre_loose, tyre_rack=p_tyre_rack, tyre_sign=p_tyre_sign)
for _c in ('pink', 'mint'):
    SUBURB_PROPS['garden_wall_' + _c] = garden_wall(_c)
SUBURB_PROPS['garden_wall_cream'] = garden_wall('cream')
SUBURB_SIZES = dict(sabal_palm=(112, 112), sabal_palm_b=(104, 104), sabal_palm_ragged=(112, 112), coconut_palm_lean=(288, 112),
                    palm_young=(64, 64), palm_stump=(20, 20), bus_bench_bail=(64, 26), bus_bench_abogado=(64, 26),
                    payphone_pastel=(20, 18), news_box_yellow=(16, 13), news_box_red=(16, 13), mailbox_blue=(18, 16),
                    mailbox_post=(20, 10), mailbox_post_b=(20, 10), mailbox_post_c=(20, 10), mailbox_post_d=(20, 10),
                    house_window=(56, 14), house_window_lit=(56, 14), house_door=(48, 16), pole_sign_strip=(112, 88), yard_fence=(128, 12), yard_fence_gate=(128, 12),
                    carport=(192, 104), tv_antenna=(56, 30), lawn_flamingos=(30, 20), oleander_pink=(56, 48),
                    oleander_white=(56, 48), cart_loaded=(24, 16), bedroll=(28, 12), bags_pile=(46, 24), doorway_camp=(72, 48),
                    market_stall=(80, 48), market_stall_coco=(80, 48), fruit_crate_orange=(20, 14), fruit_crate_mango=(20, 14),
                    fruit_crate_coconut=(20, 14), market_sign=(44, 18), carwash_sign=(72, 20), carwash_board=(24, 18),
                    wash_bucket=(14, 14), hose_reel=(28, 18), tyre_stack=(24, 24), tyre_pile=(56, 40), tyre_loose=(22, 22),
                    tyre_rack=(64, 20), tyre_sign=(48, 18), garden_wall_pink=(96, 14), garden_wall_mint=(96, 14),
                    garden_wall_cream=(96, 14))
SUBURB_GLOWING = ['payphone_pastel', 'pole_sign_strip', 'market_stall', 'market_stall_coco', 'house_window_lit', 'house_door']
SUBURB_PROPS.update((n, fn) for n, (fn, _) in SUBURB_PAINT.items())
SUBURB_SIZES.update((n, sz) for n, (_, sz) in SUBURB_PAINT.items())
assert not set(SUBURB_SIZES) & set(CHASE_SIZES), set(SUBURB_SIZES) & set(CHASE_SIZES)   # never a name taken
CHASE_PROPS.update(SUBURB_PROPS)
CHASE_SIZES.update(SUBURB_SIZES)
ROAD_GLOWING += SUBURB_GLOWING


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


CHANNEL_PROPS = dict(channelizer=p_channelizer, channelizer_tube=p_channelizer_tube, channelizer_base=p_channelizer_base)
CHANNEL_SIZES = dict(channelizer=(12, 12), channelizer_tube=(28, 6), channelizer_base=(12, 12))
assert not set(CHANNEL_SIZES) & set(CHASE_SIZES), set(CHANNEL_SIZES) & set(CHASE_SIZES)
CHASE_PROPS.update(CHANNEL_PROPS)
CHASE_SIZES.update(CHANNEL_SIZES)
ROAD_GLOWING += ['channelizer']


GLOWING = ['arcade', 'tv', 'dj_booth', 'jukebox', 'neon_sign_palm', 'neon_sign_bar', 'neon_sign_arrow', 'streetlight',
           'car', 'car2', 'van', 'convertible', 'pursuer']
# furniture at real scale (1 m = 32 px): sprite = hitbox in data/props.js + 1 px of outline on each side
PROP_SIZES = dict(table=(46, 28), table_round=(30, 30), card_table=(60, 38), dope_table=(46, 28), gas_bottle=(14, 14), dance_stage=(50, 50), desk=(48, 26), chair=(16, 16), armchair=(28, 28),
                  sofa=(66, 30), plant=(24, 24), tv=(24, 17), fridge=(24, 24), oven=(22, 22), sink=(28, 20),
                  toilet=(15, 23), bed=(46, 66), pool_table=(82, 46), arcade=(24, 29), crate=(21, 21),
                  barrel=(20, 20), bookshelf=(42, 13), speaker=(16, 16), dj_booth=(60, 24),
                  bar_counter=(32, 21), car=(140, 58), dumpster=(60, 36), trash_can=(17, 17), trash_can_down=(26, 17), bin_lid=(16, 12),
                  car2=(134, 56), van=(160, 64), car_tire=(20, 7), car_hood=(38, 44), car_door=(34, 6),
                  car2_hood=(30, 40), car2_door=(40, 6), van_hood=(18, 48), van_door=(30, 6),
                  convertible=(172, 64), convertible_hood=(46, 46), convertible_door=(28, 6), boss_hat=(14, 12),
                  pursuer=(140, 58), pursuer_hood=(38, 44), pursuer_door=(34, 6),
                  palm_tree=(104, 104), streetlight=(136, 16), neon_sign_palm=(40, 14), neon_sign_bar=(44, 14),
                  neon_sign_arrow=(30, 12), jukebox=(30, 22), hydrant=(14, 14), bench=(52, 17),
                  chain_fence=(34, 16))
FLOOR_NAMES = [t[0] for t in FLOOR_TILES]
PROP_SIZES.update(LIGHT_SIZES)
PROP_SIZES.update(SHOP_SIZES)
PROP_SIZES.update(DETAIL_SIZES)
PROP_SIZES.update(LABEL_SIZES)
PROP_SIZES.update(BAR_SIZES)
PROP_SIZES.update(CHASE_SIZES)
PROP_SIZES.update(FLAT_SIZES)
PROP_SIZES.update(INTERIOR_SIZES)
GLOWING += list(LIGHT_SIZES) + SHOP_GLOWING + BAR_NEON + CHASE_NEON + ['lorry'] + ROAD_GLOWING + INTERIOR_GLOWING
# the furniture, the street's dressing and the vehicles are painted at FINE density (their emissive maps too), like
# the people and the weapons: the sizes above are in world px. The neon signs, neon tubes and party bulbs stay at the
# world's: they are light (the lamps' fittings are painted fine, their glow maps with them); the lab's stencilled
# labels too.
# (keep in step with FINE in src/engine/Assets.js)
FINE_PROPS = (set(PROP_SIZES) - set(SHOP_GLOWING) - set(LABEL_SIZES) - set(BAR_NEON) - set(CHASE_NEON)
              - {'neon_sign_palm', 'neon_sign_bar', 'neon_sign_arrow', 'neon_tube_pink', 'neon_tube_cyan', 'string_lights'})


def soft_ink(cv):
    """Selective outline (as on the people): where the ink runs along the side of a thing that faces the light (top
    left), it softens to a deep shade of what it outlines."""
    ch = []
    for j in range(cv.ph):
        for i in range(cv.pw):
            if cv.p[i, j] != OUTLINE:
                continue
            for dx, dy in ((1, 0), (0, 1)):
                if not cv.pon(i - dx, j - dy, 1) and cv.pon(i + dx, j + dy) and cv.p[i + dx, j + dy] != OUTLINE:
                    ch.append((i, j, dk(cv.p[i + dx, j + dy], 0.62)))
                    break
    for i, j, c in ch:
        cv.p[i, j] = c


def fine(fn, name):
    """Run a painter on canvases FINE times denser than the world (see Cv), then soften its ink on the lit side and
    give it a pixel-fine grain (whatever it painted a world px at a time is not left flat)."""
    Cv.S = FINE
    try:
        r = fn()
    finally:
        Cv.S = 1
    cv = r[0] if isinstance(r, tuple) else r
    soft_ink(cv)
    fgrain(cv, random.Random(sum(ord(c) * (i + 1) for i, c in enumerate(name))), 2)
    return r
EXPECTED = {
    'characters': dict([(c + s, sz) for c in CHARS for s, sz in [
        ('_torso', (40, 40)), ('_head', (HEAD_W, HEAD_H)), ('_down', (51, 49)), ('_dead0', (30, 22)), ('_dead1', (30, 22)),
        ('_gib_head', (9, 9)), ('_gib_arm', (11, 4)), ('_gib_leg', (13, 5)), ('_gib_torso', (14, 12)),
        ('_rag_torso', (17, 19)), ('_rag_head', (10, 10)), ('_rag_arm', (17, 6)), ('_rag_leg', (20, 7)),
        ('_rag_torso_up', (17, 19)), ('_rag_torso_down', (17, 19)), ('_rag_head_up', (10, 10))]]
        + [('gib_chunk0', (6, 5)), ('gib_chunk1', (6, 5)), ('gib_chunk2', (6, 5)), ('gib_eye', (3, 3)),
           ('cueball_torso', (48, 48)), ('cueball_head_hurt', (HEAD_W, HEAD_H)),
           ('lucky_scarf', (SCARF_W, SCARF_H)), ('player_tail_l', (TAIL_W, TAIL_H)), ('player_tail_r', (TAIL_W, TAIL_H)),
           ('player_rag_skirt', (RAG_SKIRT_W, RAG_SKIRT_H))]),   # his own: wider, and his head hurt
    # the weapons in hand are at FINE density: twice these world sizes
    'weapons': dict(pistol=(27, 15), uzi=(33, 18), uzi_silenced=(46, 18), shotgun=(51, 14), rifle=(56, 16),
                    sniper=(72, 17), bazooka=(52, 14), bat=(46, 9), knife=(30, 10), cue=(80, 6), cue_half=(46, 6), tire_iron=(34, 15),
                    rocket=(9, 4),
                    # what they break into (weapon_breaks)
                    bat_handle=(25, 9), bat_head=(26, 9), knife_handle=(16, 10), knife_blade=(17, 10), tire_iron_bent=(34, 16),
                    pistol_bare=(27, 15), uzi_bare=(33, 18), uzi_silenced_bare=(46, 18), rifle_bare=(56, 16),
                    sniper_bare=(72, 17),
                    casing=(3, 2), shell=(4, 2), mag_pistol=(5, 14), mag_uzi=(5, 18), mag_rifle=(8, 16),
                    mag_sniper=(9, 12), shells_box=(8, 6), ammo_9mm=(9, 7), ammo_12g=(9, 7), ammo_762=(9, 7),
                    ammo_rocket=(12, 6)),
    'props': dict((n + g, (w * FINE, h * FINE) if n in FINE_PROPS else (w, h))
                  for n, (w, h) in PROP_SIZES.items() for g in ([''] + (['_glow'] if n in GLOWING else []))),
    'tiles': dict([(n + s, (32 * FINE, 32 * FINE)) for n in FLOOR_NAMES for s in ('', '_v1', '_v2', '_v3', '_v4', '_v5')]
                  + [(n, (32, 32)) for n in ('wall', 'brick', 'roof', 'stucco_pink', 'stucco_mint', 'stucco_peach', 'stucco_lilac')]
                  + [(n + '_v%d' % k, (32, 32)) for n in STUCCO_TILES for k in range(1, 6)]
                  + [('neon_floor_glow', (32 * FINE, 32 * FINE))]),
    'roof': dict([(n, (w * FINE, h * FINE) if n in ROOF_FINE else (w, h)) for n, (w, h) in ROOF_SIZES.items()]
                 + [(n + '_glow', ROOF_SIZES[n]) for n in ROOF_GLOWING]),
    'clutter': dict((n, (w * FINE, h * FINE)) for n, (w, h) in CLUTTER_SIZES.items()),
    # the street fauna at FINE density (critters()): a pigeon on the ground 16 x 12 world px, on the wing 16 x 28, a rat
    # 20 x 8, the cat 33 x 15 (in step with the critters/ sprites of src/engine/Assets.js)
    'critters': dict((n, (32, 56) if n.startswith('pigeon_fly') else (32, 24) if n.startswith('pigeon')
                      else (40, 16) if n.startswith('rat') else (CAT_W, CAT_H))
                     for n in ['pigeon_idle', 'pigeon_peck', 'pigeon_dead', 'rat_idle', 'rat_dead', 'cat_sit', 'cat_low',
                               'cat_dead'] + ['%s%d' % (n, i) for n in ('pigeon_walk', 'pigeon_fly', 'rat_run', 'cat_run')
                                              for i in range(3)] + ['cat_walk%d' % i for i in range(4)]),
    'items': dict(butt=(4, 2), cigarette=(12, 2), cig_butt=(6, 2), cigar=(6, 2), can=(6, 4), magazine=(8, 10), ashtray=(10, 10), bottle=(11, 5), shades=(13, 6)),
    'structure': dict(door=(32, 9), door_locked=(32, 9), stall_door=(32, 9), door_jamb=(5, 32), door_jamb_steel=(5, 32), threshold=(32, 32),
                      window=(32, 10), window_broken=(32, 10), window_sill=(32, 32), fence=(32, 6),
                      # the door skins at FINE density (keep in step with DOOR_SKINS in src/engine/Assets.js)
                      **dict((n, (w * FINE, h * FINE)) for n, (w, h) in DOOR_SKIN_SIZES.items())),
}


def main():
    sprites = build()
    written = 0
    for (group, name), cv in sorted(sprites.items()):
        d = os.path.join(OUT_DIR, group)
        os.makedirs(d, exist_ok=True)
        written += save_png(cv.img, os.path.join(d, name + '.png'))
    # what this generator no longer makes goes (its own groups only: comic/ and title/ are tools/comic's)
    for group in sorted({g for g, _ in sprites}):
        for name in prune(os.path.join(OUT_DIR, group), {n for g, n in sprites if g == group}):
            print('deleted stale %s/%s.png' % (group, name))
    # verify every expected file exists with the exact size
    n = 0
    for group, items in EXPECTED.items():
        for name, size in items.items():
            path = os.path.join(OUT_DIR, group, name + '.png')
            assert os.path.isfile(path), 'missing ' + path
            with Image.open(path) as im:
                assert im.size == size, '%s is %s, expected %s' % (path, im.size, size)
                assert im.mode == 'RGBA', path
            n += 1
    assert n == len(sprites), (n, len(sprites))
    print('generated %d sprites into %s (%d written, the others unchanged)' % (n, OUT_DIR, written))


if __name__ == '__main__':
    main()
