#!/usr/bin/env python3
"""Deterministic pixel-art asset generator for FullMatterRunner.

Run from the repo root:  python tools/generate_assets.py
Writes RGBA PNGs to assets/sprites/<group>/<name>.png.

Conventions
- 1 px = 1 world px, top-down camera, directional sprites face +x.
- Light comes from the top-left (-x, -y, +z).
- Characters / weapons / props get a 1 px dark outline; tiles wrap seamlessly.
Only depends on Pillow (no numpy). Output is fully deterministic (seeded RNG).
"""
import math
import os
import random

from PIL import Image, ImageDraw

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT_DIR = os.path.join(ROOT, 'assets', 'sprites')
RNG = random.Random(1337)

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


def jit(c, amt, rng=RNG):
    d = rng.randint(-amt, amt)
    return (max(0, min(255, c[0] + d)), max(0, min(255, c[1] + d)),
            max(0, min(255, c[2] + d)), c[3])


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


BAYER4 = [[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]]


def bayer(x, y, t):
    return BAYER4[y % 4][x % 4] / 16.0 < t


# --------------------------------------------------------------------------
# Canvas
# --------------------------------------------------------------------------

class Cv:
    """An RGBA canvas addressed in WORLD px. With s > 1 (a sprite painted finer than the world, see FINE) it holds
    s x s pixels per world px: set / rect / blend fill a whole world px, dot sets the single pixel under a world point,
    get reads it, and the shape painters, the outline and each() work pixel by pixel."""
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

    def each(self, x0, y0, x1, y1, fn):
        """fn(x, y, current) -> colour or None, for every pixel of the world px x0..x1, y0..y1 (x, y: the world px
        it lies in)."""
        s = self.s
        for j in range(y0 * s, (y1 + 1) * s):
            for i in range(x0 * s, (x1 + 1) * s):
                if self.pok(i, j):
                    c = fn(i // s, j // s, self.p[i, j])
                    if c is not None:
                        self.p[i, j] = c

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

    def recolor_edges(self, dark, light_c=None):
        """Shade pixels on the bottom/right silhouette edge (and top/left if light_c)."""
        ch = []
        for j in range(self.ph):
            for i in range(self.pw):
                if not self.pon(i, j):
                    continue
                if not self.pon(i + 1, j) or not self.pon(i, j + 1):
                    ch.append((i, j, dark(self.p[i, j])))
                elif light_c and (not self.pon(i - 1, j) or not self.pon(i, j - 1)):
                    ch.append((i, j, light_c(self.p[i, j])))
        for i, j, c in ch:
            self.p[i, j] = c


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

    def __init__(self, w, h, cell, rng=RNG):
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


def wood_fill(cv, x0, y0, x1, y1, base, plank=5, rng=RNG, vertical=False, mask=None):
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
    # the runner: a dark cap, brown hair down to his collar, a Mediterranean tan, a scarf pulled up over his mouth, a
    # long charcoal coat with its collar turned up, the strap of a leather satchel across it and the satchel on his
    # left hip, behind, jeans and boots. Dark from head to foot (the user found a bright cyan lining ugly and out of
    # place): the lining inside the collar and the cap's button are a deep petrol blue, a quiet accent.
    'player': dict(kind='player', top=ramp('#465062', 0.5, 0.25, 0.35), sleeve=None,
                   pants=ramp('#3c4a66'), shoe=ramp('#3a2a22', 0.4, 0.2, 0.3),
                   hair=ramp('#4a2e1c', 0.5, 0.25, 0.45), cap=ramp('#2e323e', 0.45, 0.22, 0.5),
                   lining=ramp('#2a5f6e', 0.45, 0.22, 0.3), knit=ramp('#868c98', 0.45, 0.22, 0.3),
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
        if abs(0.782 * u - 0.624 * v + 0.85) < 0.5:
            return ch['strap'][i]                # the satchel's strap: right shoulder in front, left hip behind
        if hr + 0.1 < hd < hr + 0.75 and hu > -2.2:
            return ch['lining'][max(1, i)]       # the coat's lining, inside the collar
        if hr + 0.75 <= hd < hr + 1.7 and hu > -2.2:
            return ch['top'][min(3, i + 1)]      # the collar, turned up
        return ch['top'][i]
    if k == 'thug' and hr + 0.1 < hd < hr + 1.3 and hu > -0.5:
        return ch['shirt'][1]
    if k == 'boss' and hr + 0.1 < hd < hr + 1.1 and hu > -1.2:
        return ch['top'][min(3, i + 1)]          # the suit's collar, up round his thick neck
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
    S, W = FINE, 20 * FINE
    rx, ry = ch['sh'][0] * S, ch['sh'][1] * S
    cx, cy = BODY_C[0] * S, BODY_C[1] * S
    hr = 3.8 * S
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
    hcx, hcy, hr = 11.0 * S, 10.0 * S, (4.1 if k == 'boss' else 3.8) * S
    head = Cv(W, W)
    skull = lambda x, y: lump(x - hcx, y - hcy, hr, hr * 0.94, hr * 0.95)
    face = lambda x, y, edge: x + 0.5 - hcx > hr - edge * S and abs(y + 0.5 - hcy) < hr * 0.8

    def face_px(x, y, L):
        u, v = x + 0.5 - hcx, y + 0.5 - hcy
        if abs(v) < 1.2 and u > hr - 1.4:
            return lt(ch['skin'][2], 0.25)           # the bridge of the nose catches the light
        return ch['skin'][1] if u < hr - 0.9 * S else ch['skin'][tidx(L)]   # the brow in shadow

    if k == 'player':
        # his hair down to his collar out from under the cap, the cap's six panels to its button, the visor
        hair = ch['hair']
        cl = hair_clumps(rng, hcx - 2.8 * S, hcy, 3.0 * S, 3.7 * S, (hcx, hcy), length=6.4, width=2.8, flow=0.5)
        relief_paint(head, lambda x, y: max(lump(x - hcx + 2.6 * S, y - hcy, 3.0 * S, 3.6 * S, 4.0) + clump_h(cl, x, y)
                                            * (1 if lump(x - hcx + 2.6 * S, y - hcy, 3.0 * S, 3.6 * S, 1) > 0 else 0), 0),
                     lambda x, y, L: clump_tone(hair, cl, x, y, L))
        capc = ch['cap']

        def cap_px(x, y, L):
            u, v = (x + 0.5 - hcx) / S, (y + 0.5 - hcy) / S
            i = tidx(L)
            if math.hypot(u, v) < 0.75:
                return ch['lining'][1]               # the button
            if abs(v) < 0.18 or abs(v * 0.5 + u * 0.87) < 0.18 or abs(v * 0.5 - u * 0.87) < 0.18:
                return capc[max(0, min(2, i) - 1)]   # the seams of its panels
            return capc[3] if L > 0.95 else capc[min(2, i)]
        relief_paint(head, lambda x, y: lump(x - hcx, y - hcy, hr, hr * 0.96, hr * 1.1), cap_px)
        for dv in range(-5, 6):
            tip = int(hcx + hr + 3.4 - abs(dv) * 0.42)
            for x in range(int(hcx + hr - 1.0), tip + 1):
                head.set(x, int(hcy + dv), capc[1] if x >= tip - 1 else capc[3] if -3 < dv < 0 else capc[2])
        for dv in range(-4, 5):
            head.set(int(hcx + hr - 1.0), int(hcy + dv), capc[0])  # where the visor meets the crown
        head.set(int(hcx + hr + 4), int(hcy), ch['skin'][2])       # the tip of his nose under it
    elif k == 'heavy':
        sk = ch['skin']
        relief_paint(head, skull, lambda x, y, L: lt(sk[2], 0.55) if L > 0.97 else sk[tidx(L)])
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
        if k == 'player' or st in ('hood', 'long', 'dancer'):
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
    return cv


def draw_torso(ch):
    """The shoulders of a standing character from straight above, facing +x, the head left off (draw_head): 40 x 40
    pixels for 20 x 20 world px (FINE density)."""
    W = 20 * FINE
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
        if abs(0.6 * u + 0.8 * v - 0.3) < 0.55:
            return ch['strap'][i]                # the satchel's strap across his chest
        if abs(v) < 1.3 and u < hx_ - 0.6:
            return ch['knit'][i]                 # his sweater, the coat open on it
        if 1.3 <= abs(v) < 1.75:
            return ch['top'][min(3, i + 1)]      # the coat's lapels
        if abs(v) < 2.1:
            return ch['top'][max(0, i - 1)]
        if u > hx_ - 1.0 and abs(v) < 3.2:
            return ch['top'][min(3, i + 1)]      # collar
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
            return ch['cap'][min(3, i + 1)]      # the scarf pulled up over his mouth
    if k == 'thug' and u > 1.3:
        return ch['hair'][i if int(v + 20) % 2 else max(0, i - 1)]
    if k == 'brute' and u > 1.1:
        return ch['bandana'][i]
    if k == 'heavy' and L > 0.95:
        return lt(ch['skin'][2], 0.6)
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


POSE_DOWN = dict(torso=(13.4, 8.0, 0.0, 4.3, 4.6), head_ang=0.0, head_r=3.6,
                 arms=[[(13.8, 2.0), (10.6, 1.9)], [(13.8, 14.0), (10.6, 14.1)]],
                 legs=[[(9.6, 6.2), (6.2, 5.5), (3.4, 4.9)], [(9.6, 9.8), (6.2, 10.6), (3.4, 11.2)]])
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
                head.set(*rot(hcx, hcy, ha, -3.0, vv), ch['cap'][2])
        mx, my = rot(hcx, hcy, ha, -2.0, 0.2)
        head.set(mx, my, BLOOD[0] if dead else dk(ch['skin'][1], 0.3))
        if dead:
            head.set(*rot(hcx, hcy, ha, -2.0, 1.2), BLOOD[2])
            head.set(*rot(hcx, hcy, ha, 0.9, -0.6), BLOOD[2])
        head.outline()
        cv.over(head)
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
    W['pistol'] = ascii_cv(drawn(27, 15, {
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
        13: [(1, 'DKKKKK')]}), gun)
    # an Uzi, side on, in its dark parkerized finish: the top cover with the rear sight, the cocking knob and the eared
    # front sight, the receiver's pressed rib with the ejection port and two rivets, the knurled barrel nut and the stub
    # of barrel; the stock folded under it (its strut along the belly, the butt plate hanging under the nut); the grip
    # under the middle with its grip safety, the magazine's base out of its heel, the big trigger guard
    def uzi(can):
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
        return drawn(46 if can else 33, 18, rows)
    W['uzi'] = ascii_cv(uzi(False), gun)
    W['uzi_silenced'] = ascii_cv(uzi(True), gun)
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
    W['rifle'] = ascii_cv(drawn(56, 16, {
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
        13: [(15, 'nn'), (26, 'nnnnn')]}), gun)
    # a heavy .50 anti-materiel rifle: the stock with its cheek rest and thick pad, the long receiver under a big
    # scope (eyepiece, turret, objective bell, a glint of its lens), the folding carry handle, the cooling holes of
    # the barrel shroud, the pistol grip, the trigger guard, the ten-round box magazine, the heavy fluted barrel with
    # the bipod folded under it, and the double-chamber muzzle brake at its end
    W['sniper'] = ascii_cv(drawn(72, 17, {
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
        15: [(14, 'nnnn'), (24, 'KKKKKKKKK')]}), gun)
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
    W['bat'] = ascii_cv(drawn(46, 9, {
        1: [(28, 'UuuuuuuiuuuuuuU')],
        2: [(1, 'iu'), (18, 'UUUUUUUUUU'), (28, 'uuuuuuuuuuuiuuuu')],
        3: [(1, 'iU'), (3, 'gTnTgTnTgTnTgT'), (17, 'uuuuuuuuuuu'), (28, 'uuiIiuUUuuuuUUuuu')],
        4: [(1, 'iU'), (3, 'TgTnTgTnTgTnTg'), (17, 'UUUUUUUUUUU'), (28, 'UUIiIUUUUhRhUUUUU')],
        5: [(1, 'iU'), (3, 'nTgTnTgTnTgTn'), (16, 'iiiiiiiiiiii'), (28, 'iiUiiiiiihhhRiiii')],
        6: [(1, 'iI'), (18, 'IIIIIIIIII'), (28, 'iiiiiiiiihhRiiii')],
        7: [(28, 'IIIIIIIIhhIIIII')]}), gun)
    # a big combat knife: the steel pommel, the ridged black rubber grip, a tall cross-guard, a wide clip-point blade
    # with the saw teeth along its spine, the lit flat, the fuller, the grind and the bright edge sweeping up to the tip
    W['knife'] = ascii_cv(drawn(30, 10, {
        1: [(12, 'MD')],
        2: [(12, 'LD'), (16, 'D'), (18, 'D'), (20, 'D'), (22, 'D')],
        3: [(1, 'SM'), (3, 'gngngngng'), (12, 'LD'), (14, 'M' * 10)],
        4: [(1, 'nS'), (3, 'GnGnGnGnG'), (12, 'MD'), (14, 'L' + 'S' * 9 + 'SSt')],
        5: [(1, 'MD'), (3, 'GnGnGnGnG'), (12, 'MD'), (14, 'DSMMMMMMMSSSStt')],
        6: [(1, 'DK'), (3, 'nTnTnTnTn'), (12, 'MD'), (14, 'D' + 's' * 12 + 't')],
        7: [(12, 'DK'), (14, 'D' + 't' * 11)],
        8: [(12, 'DK')]}), gun)
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
    W['tire_iron'] = ascii_cv(drawn(34, 15, {
        4: [(1, 'S')],
        5: [(1, 'SM')],
        6: [(2, 'MSMMMMLMMMMMMMSMMMMMMMMMSM')],
        7: [(2, 'DGGGGGxGGGGGGGGGGGxxGGGGGGGD')],
        8: [(3, 'nTTTTTTTTTTTTTTTTTTTTTTTTGGD')],
        9: [(28, 'MGD')],
        10: [(28, 'MGD')],
        11: [(27, 'LMMMD')],
        12: [(27, 'MGGGD')],
        13: [(27, 'KnnnK')]}), gun)
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
    """A gas bottle from above: blue steel shoulder, the guard ring around a brass valve with its red hand wheel."""
    S = 14
    c = S / 2
    cv = Cv(S, S)
    blue = ramp('#4f82c0', 0.55, 0.28, 0.35)
    fill_shape(cv, c, c, 6.0, 6.0, lambda u, v, L: shade(blue, L))
    ring(cv, c, c, 5.1, 6.05, lambda dx, dy, d: blue[0] if dx + dy > 0 else blue[1])
    ring(cv, c, c, 2.9, 4.2, lambda dx, dy, d: hx('#e4e9f0') if dx + dy < 0 else hx('#9aa4b4'))   # guard ring
    fill_shape(cv, c, c, 2.9, 2.9, lambda u, v, L: hx('#1c2a44'))
    fill_shape(cv, c, c, 1.5, 1.5, lambda u, v, L: hx('#e8b850') if u + v < 0 else hx('#b88a30'))  # brass valve
    cv.set(int(c), int(c), hx('#e02828'))
    cv.set(int(c) - 1, int(c), hx('#e02828'))
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
    """Office desk (the seat is on +y): green blotter and papers, a typewriter, rotary phone, files, a mug."""
    W, H = 48, 26
    cv = Cv(W, H)
    wood_fill(cv, 1, 1, W - 2, H - 2, hx('#5a3824'), plank=6, rng=random.Random(13))
    mottle(cv, random.Random(131), 6, 7)
    bevel_edges(cv, 1, 1, W - 2, H - 2, 0.2, 0.35)
    ol = dk(hx('#5a3824'), 0.6)

    def blotter(ly):
        g = ramp('#2e5a3e', 0.45, 0.22, 0.25)
        fill_shape(ly, 25.0, 18.0, 9.5, 5.0, lambda u, v, L: shade(g, L), kind='rect', corner=0.6, bevel=0.8)
        for y in range(13, 24):        # leather corner pockets
            for x in range(15, 35):
                if (x - 15) + (y - 13) < 3 or (34 - x) + (y - 13) < 3 or (x - 15) + (23 - y) < 3 or (34 - x) + (23 - y) < 3:
                    ly.set(x, y, hx('#4a2a1a'))
        fill_shape(ly, 29.5, 19.0, 3.0, 3.8, lambda u, v, L: hx('#f0ece2') if L > 0.55 else hx('#d6d0c4'),
                   ang=0.18, kind='rect', corner=0.3, bevel=0.5)
        for k in range(4):
            line(ly, 27.6 + 0.1 * k, 17.0 + k * 1.4, 31.0 + 0.1 * k, 17.6 + k * 1.4, hx('#a8a4b4'))
        line(ly, 20.0, 21.5, 24.5, 17.5, hx('#2a2a3a'))   # pen
        ly.set(24, 17, hx('#d8b040'))
    layer(cv, blotter, ol)

    def files(ly):
        for i, (x, y, a, col) in enumerate(((7.0, 9.0, -0.12, '#d8b878'), (7.5, 8.2, 0.08, '#c8a868'), (8.0, 7.6, -0.04, '#e0c488'))):
            fill_shape(ly, x, y, 4.6, 5.6, lambda u, v, L, col=col: shade(ramp(col, 0.4, 0.2, 0.3), L),
                       ang=a, kind='rect', corner=0.4, bevel=0.8)
        line(ly, 4.0, 4.0, 11.0, 3.6, hx('#f2eee4'))       # a sheet sticking out
        fill_shape(ly, 7.0, 21.0, 2.0, 2.0, lambda u, v, L: shade(WHITE, L))   # mug
        fill_shape(ly, 7.0, 21.0, 1.2, 1.2, lambda u, v, L: hx('#3a1e10'))
        ly.set(9, 21, WHITE[1])
    layer(cv, files, ol)

    def typewriter(ly):
        body = ramp('#3e4a5a', 0.5, 0.25, 0.4)
        fill_shape(ly, 25.0, 8.0, 7.5, 4.6, lambda u, v, L: shade(body, L), kind='rect', bevel=2.0, corner=1.6)
        fill_shape(ly, 25.0, 4.0, 8.2, 1.2, lambda u, v, L: shade(ramp('#26262e', 0.4, 0.2, 0.5), L), kind='rect', corner=1.0)
        ly.rect(20, 1, 29, 3, hx('#f2eee4'))               # sheet rolled in the platen
        for x in range(21, 29, 2):
            ly.set(x, 2, hx('#b0acb8'))
        for y in (8, 10):                                  # key rows
            for x in range(19 + (y == 10), 31, 2):
                ly.set(x, y, hx('#d8d4cc'))
        ly.rect(22, 11, 28, 11, hx('#d8d4cc'))             # space bar
        ly.set(33, 4, hx('#c8ccd8'))                       # carriage lever
    layer(cv, typewriter)

    def phone(ly):
        red = ramp('#b82830', 0.5, 0.25, 0.35)
        fill_shape(ly, 41.0, 9.5, 4.0, 3.4, lambda u, v, L: shade(red, L), kind='super', p=2.6)
        fill_capsule(ly, [(37.6, 7.0), (44.4, 7.0)], 1.3, lambda k, L, s, i, t: shade(red, L))   # handset
        ring(ly, 41.0, 10.6, 0.9, 2.1, lambda dx, dy, d: hx('#e8e4dc') if int(math.atan2(dy, dx) * 1.6) % 2 else hx('#2a1418'))
        line(ly, 44.5, 12.0, 46.0, 16.0, hx('#1a1018'))    # coiled cord
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
    """Potted areca palm: terracotta pot (the hitbox), fronds spilling past it."""
    S = 24
    c = S / 2
    cv = Cv(S, S)
    pot = ramp('#c06036', 0.45, 0.22, 0.35)
    ring(cv, c, c, 5.6, 7.4, lambda dx, dy, d: shade(pot, light(dx / d * 0.85, dy / d * 0.85)))
    fill_shape(cv, c, c, 5.7, 5.7, lambda u, v, L: mix(hx('#24160c'), hx('#4a3020'), L))
    smudge(cv, random.Random(161), 4, (6, 6, 18, 18), (0.8, 1.5), 0.25, hx('#7a6a50'))
    cv.outline()
    green = [ramp('#2a7a34', 0.6, 0.32, 0.3), ramp('#46a040', 0.55, 0.28, 0.35)]
    rng = random.Random(77)
    for lay, n in ((0, 6), (1, 4)):
        leaves = Cv(S, S)
        for i in range(n):
            a = i * 2 * math.pi / n + rng.uniform(-0.35, 0.35) + lay * 0.7
            ln = rng.uniform(9.0, 11.4) if lay == 0 else rng.uniform(6.0, 8.0)
            bend = rng.uniform(-0.35, 0.35)
            pts = []
            for k in range(7):
                t = 1.5 + (ln - 1.5) * k / 6.0
                aa = a + bend * (k / 6.0) ** 2
                pts.append((c + math.cos(aa) * t, c + math.sin(aa) * t))
            g = green[lay]

            def leaf(k, L, s, seg, t, g=g):
                if abs(s) < 0.3:
                    return lt(g[3], 0.2)
                return shade(g, L - 0.1 * (s > 0))
            for j in range(6):
                w = 1.5 * math.sin(math.pi * (j + 1.0) / 7.5) ** 0.7
                fill_capsule(leaves, [pts[j], pts[j + 1]], max(0.5, w), leaf)
        leaves.outline(hx('#0c2410'))
        cv.over(leaves)
    return cv


def p_tv():
    """80s woodgrain CRT on a black TV cart with a VCR, rabbit ears; the screen faces +y."""
    W, H = 24, 17
    cv = Cv(W, H)
    cart = ramp('#24222c', 0.4, 0.2, 0.45)
    fill_shape(cv, 12.0, 8.5, 11.0, 7.5, lambda u, v, L: shade(cart, L), kind='rect', bevel=1.2, corner=0.8)
    for (x, y) in ((1, 1), (22, 1), (1, 15), (22, 15)):
        cv.set(x, y, hx('#a8acb8'))        # chrome corner posts
    cv.outline()

    def tv(ly):
        back = ramp('#2e2a34', 0.45, 0.22, 0.4)
        fill_shape(ly, 12.0, 3.4, 5.6, 2.6, lambda u, v, L: shade(back, L), kind='rect', bevel=1.6, corner=1.6)
        for x in range(8, 17, 2):          # vent slots on the tube's housing
            ly.set(x, 3, back[0])
        wood_fill(ly, 2, 5, 21, 12, hx('#7a4a26'), plank=4, rng=random.Random(171))
        bevel_edges(ly, 2, 5, 21, 12, 0.25, 0.3)
        ly.set(2, 5, CLEAR)
        ly.set(21, 5, CLEAR)
        ly.rect(2, 12, 21, 12, hx('#b8bcc8'))   # silver bezel
        ly.set(18, 12, hx('#e8ecf4'))
        ly.set(20, 12, hx('#5a5a66'))
        line(ly, 11.0, 4.0, 5.0, 0.4, hx('#c8ccd8'))   # rabbit ears
        line(ly, 13.0, 4.0, 19.0, 0.4, hx('#c8ccd8'))
    layer(cv, tv)
    for x in range(3, 21):                 # the glass bulging past the bezel, lit by its own picture
        cv.set(x, 13, hx('#9ef6ff') if x % 7 else hx('#ffffff'))
    cv.set(2, 13, OUTLINE)
    cv.set(21, 13, OUTLINE)
    cv.rect(5, 14, 18, 15, hx('#3a3846'))  # VCR on the shelf
    cv.rect(5, 14, 18, 14, hx('#4e4c5c'))
    cv.rect(7, 15, 12, 15, hx('#14121a'))  # cassette slot
    for x in (15, 16, 17):                 # 12:00 blinking forever
        cv.set(x, 15, hx('#ff2a3a'))
    return cv, glow_from(cv, lambda x, y, c: (y == 13 and 3 <= x <= 20) or (y == 15 and 15 <= x <= 17))


def p_fridge():
    """Almond fridge seen from above: dusty top, cereal box on it, condenser at the back, door + handle at +y."""
    S = 24
    cv = Cv(S, S)
    cr = ramp('#ddd0aa', 0.42, 0.2, 0.4)
    fill_shape(cv, 12.0, 11.0, 11.0, 10.0, lambda u, v, L: shade(cr, L), kind='rect', bevel=2.4, corner=1.2)
    mottle(cv, random.Random(181), 5, 6)
    smudge(cv, random.Random(182), 5, (3, 3, 21, 17), (2.0, 3.5), 0.1, hx('#8a8070'))   # dust
    for x in range(3, 21):                 # condenser coils peeking out at the back
        cv.set(x, 1, hx('#3a3640') if x % 2 else hx('#5a5662'))
    cv.rect(1, 20, 22, 22, cr[1])          # door top edge
    cv.rect(1, 20, 22, 20, dk(cr[1], 0.25))
    cv.rect(3, 21, 11, 21, hx('#e8f0f8'))  # chrome handle
    cv.rect(3, 22, 11, 22, hx('#8a92a0'))
    cv.outline()

    def box(ly):                           # a pizza box someone left up there
        fill_shape(ly, 15.0, 9.0, 4.6, 4.6, lambda u, v, L: shade(ramp('#c8a46a', 0.45, 0.22, 0.3), L),
                   ang=0.18, kind='rect', bevel=1.0, corner=0.4)
        fill_shape(ly, 15.0, 9.0, 1.8, 1.8, lambda u, v, L: hx('#c02a24') if math.hypot(u, v) > 0.9 else hx('#f2e6c8'))
    layer(cv, box)
    return cv


def p_oven():
    """Gas range: enamel top, cast-iron grates, a pan on a burner, one blue flame, knobs and handle at +y."""
    S = 22
    cv = Cv(S, S)
    en = ramp('#e2ddd0', 0.42, 0.2, 0.35)
    fill_shape(cv, 11.0, 10.5, 10.0, 9.5, lambda u, v, L: shade(en, L), kind='rect', bevel=1.8, corner=1.2)
    cv.rect(1, 1, 20, 2, shade(en, 0.5))   # back guard
    cv.rect(1, 1, 20, 1, en[3])
    mottle(cv, random.Random(191), 5, 5)
    iron = hx('#24202a')
    for (bx, by) in ((6.0, 7.0), (16.0, 7.0), (6.0, 14.0), (16.0, 14.0)):
        fill_shape(cv, bx, by, 3.4, 3.4, lambda u, v, L: dk(en[1], 0.1), kind='rect', corner=1.0)
        ring(cv, bx, by, 1.2, 2.2, lambda dx, dy, d: hx('#4a4652') if light(dx / d, dy / d) > 0.5 else hx('#2e2a36'))
        line(cv, bx - 3.0, by, bx + 3.0, by, iron)       # grate bars
        line(cv, bx, by - 3.0, bx, by + 3.0, iron)
    ring(cv, 16.0, 14.0, 1.4, 2.4, lambda dx, dy, d: hx('#5ab8ff') if (int(math.atan2(dy, dx) * 2.5) % 2) else hx('#2a6aff'))
    smudge(cv, random.Random(192), 4, (2, 3, 19, 17), (1.0, 2.0), 0.3, hx('#6a4a20'))   # baked-on spills
    for x in (4, 8, 13, 17):
        fill_shape(cv, x + 0.5, 18.5, 0.9, 0.9, lambda u, v, L: shade(ramp('#2a2632', 0.4, 0.2, 0.6), L))
    cv.rect(3, 20, 18, 20, hx('#c8ccd6'))   # door handle
    cv.outline()

    def pan(ly):
        fill_shape(ly, 6.0, 7.0, 3.6, 3.6, lambda u, v, L: shade(ramp('#3a3640', 0.5, 0.25, 0.5), L))
        fill_shape(ly, 6.0, 7.0, 2.6, 2.6, lambda u, v, L: hx('#2a2630') if math.hypot(u + 0.6, v + 0.4) > 1.0 else hx('#f2d24a'))
        line(ly, 2.0, 4.0, 0.6, 2.4, hx('#1a1620'))      # handle
        line(ly, 2.6, 3.6, 1.2, 2.0, hx('#1a1620'))
    layer(cv, pan)
    return cv


def p_sink():
    """Stainless double sink: chrome mixer at the back, a dirty plate and a mug in the basins."""
    W, H = 28, 20
    cv = Cv(W, H)
    st = ramp('#a6aeba', 0.48, 0.22, 0.42)
    fill_shape(cv, 14.0, 10.0, 13.0, 9.0, lambda u, v, L: shade(st, L), kind='rect', bevel=1.6, corner=1.0)
    for y in range(1, 19):                 # brushed steel: faint streaks along x
        for x in range(1, 27):
            c = cv.get(x, y)
            if c[3] and (y * 7 + x // 9) % 5 == 0:
                cv.set(x, y, shift(c, 4))
    basin = ramp('#6a7280', 0.5, 0.26, 0.25)
    for bx in (7.5, 20.5):
        fill_shape(cv, bx, 11.5, 5.3, 6.0, lambda u, v, L: shade(basin, 1.05 - L * 0.95), kind='rect', bevel=2.8, corner=1.8)
        ring(cv, bx, 12.5, 0.0, 1.1, lambda dx, dy, d: hx('#2a2a34') if d < 0.6 else hx('#8a929e'))
    smudge(cv, random.Random(201), 6, (2, 5, 26, 18), (1.0, 2.0), 0.2, hx('#c8c0a0'))   # limescale
    cv.outline()

    def mixer(ly):
        fill_shape(ly, 14.0, 2.6, 1.6, 1.4, lambda u, v, L: shade(ramp('#d0d6e0', 0.5, 0.25, 0.5), L))
        fill_capsule(ly, [(14.0, 2.6), (11.5, 5.0), (9.5, 7.0)], 0.6, lambda k, L, s, i, t: shade(ramp('#d0d6e0', 0.5, 0.25, 0.5), L))
        ly.set(11, 2, hx('#2a7af0'))
        ly.set(17, 2, hx('#f03a3a'))
    layer(cv, mixer)

    def dishes(ly):
        fill_shape(ly, 20.5, 11.5, 3.6, 3.6, lambda u, v, L: shade(WHITE, L) if math.hypot(u, v) > 2.4 else hx('#e8e4d8'))
        ly.set(20, 11, hx('#b85a2a'))
        ly.set(21, 12, hx('#c8a040'))
        fill_shape(ly, 6.0, 13.5, 1.8, 1.8, lambda u, v, L: shade(ramp('#3a7ac0', 0.45, 0.22, 0.4), L))
        ly.set(6, 13, hx('#2a1810'))
    layer(cv, dishes)
    return cv


def p_toilet():
    """Toilet: tank with flush button (-y), elongated bowl, seat ring, water; a hint of grime."""
    W, H = 15, 23
    cv = Cv(W, H)
    wh = ramp('#ecebf0', 0.4, 0.18, 0.2)

    def bowl(ly):
        fill_shape(ly, 7.5, 14.5, 5.6, 7.4, lambda u, v, L: shade(wh, L))
        fill_shape(ly, 7.5, 15.0, 3.6, 5.2, lambda u, v, L: shade(ramp('#f4f0e2', 0.4, 0.2, 0.2), 1.1 - L * 0.7))
        fill_shape(ly, 7.5, 15.6, 2.4, 3.4, lambda u, v, L: hx('#8ec4d4') if L < 0.75 else hx('#bfe4ee'))
        ly.set(7, 16, hx('#4a8aa8'))
        ly.set(7, 17, hx('#5a9ab8'))
    layer(cv, bowl)
    smudge(cv, random.Random(211), 3, (5, 12, 10, 19), (0.8, 1.4), 0.2, hx('#a08a4a'))

    def tank(ly):
        fill_shape(ly, 7.5, 3.6, 6.4, 2.8, lambda u, v, L: shade(wh, L), kind='rect', bevel=1.6, corner=1.0)
        fill_shape(ly, 7.5, 3.6, 1.0, 1.0, lambda u, v, L: shade(ramp('#b8bcc8', 0.45, 0.2, 0.4), L))
        ly.set(4, 7, hx('#b8bcc8'))              # seat hinges
        ly.set(10, 7, hx('#b8bcc8'))
    layer(cv, tank)
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
    """Arcade cabinet from above: roof, lit marquee, CRT under its bezel, control panel, coin door at +y."""
    W, H = 24, 29
    cv, gl = Cv(W, H), Cv(W, H)
    cab = ramp('#2a1e3e', 0.5, 0.22, 0.35)
    fill_shape(cv, 12.0, 14.5, 11.0, 13.5, lambda u, v, L: shade(cab, L), kind='rect', bevel=1.6, corner=1.0)
    mottle(cv, random.Random(221), 4, 4)
    for y in range(2, 26):                 # side art stripes
        for x, col in ((1, NEON_PINK), (22, NEON_CYAN)):
            if y % 9 not in (0,):
                cv.set(x, y, dk(col, 0.25))
    marquee = [hx('#ff2a6d'), hx('#ff6b1a'), hx('#f9c80e')]
    for x in range(3, 21):                 # marquee light box, its lit top edge
        for y in (7, 8):
            c = lt(marquee[(x // 3) % 3], 0.3 if y == 7 else 0.1)
            cv.set(x, y, c)
            gl.set(x, y, c)
    cv.rect(3, 9, 20, 10, hx('#100c18'))    # bezel shadow
    screen = ["................",
              "..c.c.c.c...ww..",
              "...p.p.p.p......",
              "................",
              "........y.......",
              "................",
              "...........p....",
              ".......ggg......",
              ".......g.g......"]
    scol = {'c': NEON_CYAN, 'p': NEON_PINK, 'w': hx('#f4f0ff'), 'y': hx('#f9c80e'), 'g': hx('#3aff8a')}
    for j, row in enumerate(screen):
        for i, ch in enumerate(row):
            x, y = 4 + i, 10 + j
            c = scol[ch] if ch != '.' else (hx('#0c1238') if (y % 2) else hx('#121a4a'))
            cv.set(x, y, c)
            gl.set(x, y, c if ch != '.' else (40, 70, 170, 150))
    for y in range(10, 19):                # curved glass highlight
        cv.set(4, y, lt(cv.get(4, y), 0.25))
    panel = Cv(W, H)
    fill_shape(panel, 12.0, 22.0, 10.0, 2.8, lambda u, v, L: shade(ramp('#3e3650'), L), kind='rect', bevel=1.2, corner=0.8)
    for x in range(3, 21):
        panel.set(x, 20, hx('#ff2a6d') if x % 4 else hx('#f9c80e'))   # panel art edge
    fill_shape(panel, 6.5, 22.0, 1.3, 1.3, lambda u, v, L: shade(ramp('#e02a30', 0.45, 0.2, 0.45), L))
    for (x, c) in ((11, '#05d9e8'), (13, '#f9c80e'), (15, '#3aff8a'), (17, '#ff2a6d')):
        panel.set(x, 22, hx(c))
        panel.set(x, 23, dk(hx(c), 0.4))
        gl.set(x, 22, hx(c))
    panel.outline()
    cv.outline()
    cv.over(panel)
    cv.rect(7, 26, 16, 27, hx('#4a4458'))  # coin door
    for x in (9, 14):
        cv.set(x, 26, hx('#ff3a2a'))
        cv.set(x, 27, hx('#a01818'))
        gl.set(x, 26, hx('#ff3a2a'))
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
    """200 L steel drum, red, explosive: rolled chime, stamped rings, two bungs, hazard label, chipped paint, rust."""
    S = 20
    c = S / 2
    cv = Cv(S, S)
    red = ramp('#c81e28', 0.55, 0.28, 0.35)
    fill_shape(cv, c, c, 9.0, 9.0, lambda u, v, L: red[2])
    ring(cv, c, c, 7.6, 9.05, lambda dx, dy, d: shade(red, light(dx / d * 0.95, dy / d * 0.95)))
    ring(cv, c, c, 6.8, 7.6, lambda dx, dy, d: red[0] if light(dx / d, dy / d) > 0.5 else red[3])
    ring(cv, c, c, 4.2, 4.8, lambda dx, dy, d: red[1] if light(dx / d, dy / d) > 0.5 else lt(red[2], 0.15))
    for (bx, by, r_) in ((5.0, 9.0, 1.6), (15.2, 12.0, 1.0)):
        fill_shape(cv, bx, by, r_, r_, lambda u, v, L: shade(ramp('#9a9aa8', 0.5, 0.25, 0.4), L))
        cv.set(int(bx), int(by), hx('#4a4a58'))
    for y in range(S):                     # hazard diamond with a flame
        for x in range(S):
            d = abs(x + 0.5 - 11.0) + abs(y + 0.5 - 9.5)
            if d <= 3.6:
                cv.set(x, y, hx('#f2b80e') if d <= 3.0 else hx('#1a1420'))
    for (x, y) in ((11, 8), (10, 9), (11, 9), (10, 10), (11, 10), (12, 10)):
        cv.set(x, y, hx('#1a1420'))
    rng = random.Random(241)
    smudge(cv, rng, 4, (2, 2, 18, 18), (0.7, 1.1), 0.7, hx('#9a9aa8'))   # chipped to bare steel
    smudge(cv, rng, 4, (2, 2, 18, 18), (1.0, 2.0), 0.4, hx('#6a3416'))   # rust
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
    """PA cabinet: black tolex, steel corners, woofer with its surround and dust cap, small horn."""
    S = 16
    cv = Cv(S, S)
    fill_shape(cv, 8.0, 8.0, 7.0, 7.0, lambda u, v, L: shade(ramp('#26232e', 0.5, 0.2, 0.32), L),
               kind='rect', bevel=1.4, corner=1.0)
    mottle(cv, random.Random(251), 4, 4)
    ring(cv, 8.0, 9.0, 4.4, 5.6, lambda dx, dy, d: shade(ramp('#4e4a5e'), light(dx / d * 0.8, dy / d * 0.8)))
    fill_shape(cv, 8.0, 9.0, 4.4, 4.4, lambda u, v, L: shade(ramp('#1a1820', 0.3, 0.15, 0.6), 1.0 - L))
    fill_shape(cv, 8.0, 9.0, 1.6, 1.6, lambda u, v, L: shade(ramp('#5a5868', 0.4, 0.2, 0.4), L))
    cv.rect(6, 2, 10, 2, hx('#3a3646'))     # horn
    cv.rect(7, 2, 9, 2, hx('#0e0c12'))
    for (x, y) in ((1, 1), (2, 1), (1, 2), (13, 1), (14, 1), (14, 2), (1, 13), (1, 14), (2, 14), (14, 13), (13, 14), (14, 14)):
        cv.set(x, y, hx('#9a9aaa') if y < 8 else hx('#6a6a7a'))
    cv.outline()
    return cv


def p_dj_booth():
    """DJ booth: two direct-drive decks with records and tone arms, a mixer with VU LEDs, headphones; LED front at +y."""
    W, H = 60, 24
    cv = Cv(W, H)
    desk = ramp('#1c1826', 0.4, 0.2, 0.4)
    fill_shape(cv, 30.0, 12.0, 29.0, 11.0, lambda u, v, L: shade(desk, L), kind='rect', bevel=1.6, corner=1.0)
    mottle(cv, random.Random(261), 3, 6)
    plinth = ramp('#7a7a8a', 0.45, 0.22, 0.4)
    for tx, lab in ((10.5, hx('#e8303a')), (49.5, hx('#2a9ad8'))):
        fill_shape(cv, tx, 9.5, 8.0, 6.5, lambda u, v, L: shade(plinth, L), kind='rect', bevel=1.5, corner=1.0)
        ring(cv, tx - 1.2, 9.5, 5.4, 5.9, lambda dx, dy, d: hx('#d8dce6') if int(math.atan2(dy, dx) * 6) % 2 else hx('#8a8e9a'))
        ring(cv, tx - 1.2, 9.5, 0.0, 5.4, lambda dx, dy, d: hx('#16141c') if int(d * 1.5) % 2 else hx('#0c0a10'))
        fill_shape(cv, tx - 1.2, 9.5, 1.5, 1.5, lambda u, v, L: shade(ramp(lab, 0.4, 0.2, 0.3), L))
        cv.set(int(tx - 2.5), 7, hx('#4a4858'))   # vinyl sheen
        cv.set(int(tx - 3.5), 8, hx('#3a3848'))
        fill_capsule(cv, [(tx + 5.6, 4.6), (tx + 5.2, 10.0), (tx + 2.8, 12.6)], 0.5, lambda k, L, s, i, t: hx('#e0e4ee'))
        fill_shape(cv, tx + 5.6, 4.6, 1.0, 1.0, lambda u, v, L: shade(ramp('#9a9aaa'), L))
        cv.rect(int(tx + 6), 12, int(tx + 6), 14, hx('#2a2832'))   # pitch fader
        cv.set(int(tx + 6), 13, hx('#e8e8f0'))
    cv.rect(21, 3, 38, 16, hx('#2e2c38'))
    cv.rect(21, 3, 38, 3, hx('#46445a'))
    for x in (24, 27):                     # channel faders + EQ knobs
        cv.rect(x, 8, x, 13, hx('#100e16'))
        cv.set(x, 9 + (x % 3), hx('#e8e8f0'))
        for y in (4, 6):
            cv.set(x, y, hx('#b8b8c8'))
    for i, y in enumerate(range(13, 3, -1)):   # VU meters
        for x in (31, 33):
            on = i < (7 if x == 31 else 5)
            col = hx('#3aff6a') if i < 6 else hx('#f9c80e') if i < 8 else hx('#ff2a3a')
            cv.set(x, y, col if on else dk(col, 0.7))
    cv.rect(23, 15, 29, 15, hx('#100e16'))  # crossfader
    cv.set(26, 15, hx('#e8e8f0'))
    cv.set(36, 5, hx('#b8b8c8'))
    cv.set(36, 8, hx('#b8b8c8'))
    cv.outline()

    def phones(ly):
        fill_capsule(ly, [(14.5, 17.0), (17.0, 15.0), (20.5, 16.2)], 0.6, lambda k, L, s, i, t: hx('#3a3846'))
        for x in (14.5, 20.5):
            fill_shape(ly, x, 17.2, 1.6, 1.6, lambda u, v, L: shade(ramp('#3a3846', 0.45, 0.2, 0.4), L))
    layer(cv, phones)
    leds = ['#ff2a6d', '#05d9e8', '#f9c80e']
    for x in range(2, W - 2):              # front fascia: LED chaser over a pink tube
        cv.set(x, 19, hx(leds[(x // 4) % 3]) if x % 4 == 1 else hx('#2a2236'))
        cv.set(x, 20, hx('#ff2a6d') if x % 2 else hx('#ff5a8d'))
        cv.set(x, 21, hx('#c8205a'))
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
    """Steel dumpster: black plastic lids (the right one pushed open over bin bags), fork pockets, rust and grime."""
    W, H = 60, 36
    cv = Cv(W, H)
    g = ramp('#2c6a3c', 0.5, 0.26, 0.3)
    fill_shape(cv, 30.0, 18.0, 29.0, 17.0, lambda u, v, L: shade(g, L), kind='rect', bevel=2.0, corner=1.4)
    lid = ramp('#262a2c', 0.4, 0.18, 0.22)

    def lids(ly):
        for (x0, x1, y0, y1) in ((4, 29, 4, 31), (31, 56, 4, 21)):
            fill_shape(ly, (x0 + x1 + 1) / 2, (y0 + y1 + 1) / 2, (x1 - x0 + 1) / 2, (y1 - y0 + 1) / 2,
                       lambda u, v, L: shade(lid, L), kind='rect', bevel=1.5, corner=1.2)
            for y in range(y0 + 7, y1 - 3, 8):      # two low moulded ribs per lid
                for x in range(x0 + 2, x1 - 1):
                    ly.set(x, y, shift(lid[2], 10))
                    ly.set(x, y + 1, shift(lid[2], -8))
            for x in (x0 + 5, x1 - 5):              # hinge knuckles at the back
                ly.set(x, y0, hx('#5a5e66'))
    layer(cv, lids)
    bags = Cv(W, H)
    rng = random.Random(21)
    for _ in range(7):                     # bin bags in the open half
        bx, by, r_ = rng.uniform(34, 54), rng.uniform(24, 30), rng.uniform(2.6, 4.0)
        fill_shape(bags, bx, by, r_, r_ * 0.85, lambda u, v, L: shade(ramp('#262430', 0.4, 0.2, 0.7), L ** 1.6),
                   ang=rng.uniform(0, 3))
    fill_shape(bags, 49.0, 24.5, 3.0, 2.0, lambda u, v, L: shade(ramp('#a8865a', 0.4, 0.2, 0.3), L), ang=0.4,
               kind='rect', corner=0.4)       # a flattened cardboard box
    for y in range(H):
        for x in range(W):
            if not (31 <= x <= 56 and 23 <= y <= 31):
                bags.set(x, y, CLEAR)
    bags.outline(hx('#0c0a10'))
    cv.over(bags)
    for x in range(31, 57):
        cv.set(x, 22, hx('#0c0a10'))
    for (x0, x1) in ((1, 2), (57, 58)):    # fork pockets
        cv.rect(x0, 9, x1, 13, g[0])
        cv.rect(x0, 23, x1, 27, g[0])
    rng2 = random.Random(22)
    mottle(cv, rng2, 6, 5)
    smudge(cv, rng2, 10, (1, 1, 58, 34), (0.8, 2.4), 0.55, hx('#7a3e1a'))   # rust
    smudge(cv, rng2, 8, (4, 4, 56, 31), (1.5, 3.5), 0.18)                   # grime
    for x in range(6, 26):                 # a stripe of faded stencil on the rim
        if x % 3:
            cv.blend(x, 33, (220, 220, 210, 70))
    cv.outline()
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


def wget(cv, x, y):
    return cv.p[int(x) % cv.w, int(y) % cv.h]


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
WALL_TILES = [('wall', t_wall), ('brick', t_brick), ('roof', t_roof)]


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
        for k, fn in ((1, v1), (2, v2)):
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
    limb(leg, 20, 28, 98)
    limb(leg, 28, 28, 80)
    limb(arm, 18, 15, 114)
    limb(arm, 31, 15, 18)
    body.alpha_composite(rag_torso_up(ch).img, (16, 10))
    body.alpha_composite(rag_head_up(ch).img, (19, 1))
    out = Cv(H, W)
    out.img = body.rotate(-90, resample=Image.NEAREST, expand=True)
    out.p = out.img.load()
    return out


# --------------------------------------------------------------------------
# Magazines, shell boxes and ammo pickups (+x = bullet tips)
# --------------------------------------------------------------------------

def mags():
    out = {}
    st = {'O': OUTLINE, 'L': STEEL_L[3], 'M': STEEL_L[1], 'D': STEEL[0], 'B': BRASS[3], 'b': BRASS[2],
          'c': hx('#e07a3a'), 'K': hx('#0e0a14')}
    out['mag_pistol'] = ascii_cv(["Obc", "LMD", "LMD", "LMD", "LMD", "KKK"], st, ol=None)
    out['mag_uzi'] = ascii_cv(["Obc", "LMD", "LMD", "LMD", "LMD", "LMD", "LMD", "LMD", "KKK"], st, ol=None)
    stanag = ramp('#3a3a44', 0.45, 0.22, 0.45)   # the M16's: black, a slight curve forward
    out['mag_rifle'] = ascii_cv(["Obc.", "LMD.", "LMD.", "LMD.", "LMMD", ".LMD", ".LMD", ".LMD", ".KKK"],
                                dict(st, L=stanag[3], M=stanag[2], D=stanag[0]), ol=None)
    # the .50's: a long steel box, a fat round on top
    out['mag_sniper'] = ascii_cv(["OBbc", "LLMD", "LMMD", "LMMD", "LDDD", "LMMD", "LMMD", "KKKK"], st, ol=None)
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


def p_car():
    """80s four-door sedan, 4.4 x 1.8 m: boxy, chrome bumpers, quad headlights, thick C pillars."""
    k = Veh(140, 58, 29, 4401)
    body = SEDAN_BODY
    wheels = (30, 112)
    k.shell(body, 1, 138, 26.5, 5, 6, crown=2.2)
    k.arches(wheels)
    k.trap(34, 45, 19.5, 17.5, sheen=2)                      # rear window
    k.trap(81, 97, 17.5, 21.5, sheen=4)                      # windshield
    k.panel(body, 46, 80, 18.5)                              # roof
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
    return k.done()


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


def hood_debris(body, w, h, seed, stripe=None):
    """Hood blown off: buckled panel with a diagonal fold, dents, a scorched edge, torn corners."""
    rng = random.Random(seed)
    cv = Cv(w, h)
    burn = VNoise(w, h, 5, rng)
    fold = rng.uniform(0.4, 0.55)
    for y in range(1, h - 1):
        for x in range(1, w - 1):
            u, v = (x + 0.5) / w, (y + 0.5) / h
            d = (u - fold) + (v - 0.5) * 0.45
            c = soft(body, light(-0.55 if d < 0 else 0.3, (v - 0.5) * 0.6))
            if stripe and abs((y + 0.5) - h / 2) in (2.5, 3.5):
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


def door_debris(body, w, stripe=None):
    """Door ripped off, seen from above edge-on: skin, window frame with glass left in it, handle."""
    cv = Cv(w, 6)
    for x in range(1, w - 1):
        cv.set(x, 1, lt(body[2], 0.2))
        cv.set(x, 2, stripe or body[2])
        cv.set(x, 3, GLASS[2] if 4 < x < w - 8 else body[1])
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


def p_car_door():
    return door_debris(SEDAN_BODY, 34)


def p_car2_door():
    return door_debris(COUPE_BODY, 40, stripe=hx('#7a1fa2'))


def p_van_door():
    return door_debris(VAN_BODY, 30, stripe=hx('#ff6b1a'))


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
    dark edge, under the barrel's flange, the bonnet dome and its brass nut (the user: sharper and a little bigger)."""
    S = 14
    cv = Cv(S, S)
    red = ramp('#d0262c', 0.55, 0.28, 0.35)
    cap = ramp('#c8c8d8', 0.5, 0.25, 0.4)
    nut = ramp('#e0b02a', 0.5, 0.2, 0.4)

    def caps(ly):
        for (cx, cy, rx, ry) in ((2.3, 7.0, 1.4, 2.0), (11.7, 7.0, 1.4, 2.0), (7.0, 11.7, 2.0, 1.4)):
            fill_shape(ly, cx, cy, rx, ry, lambda u, v, L: shade(cap, L))

    def barrel(ly):
        fill_shape(ly, 7.0, 7.0, 4.1, 4.1, lambda u, v, L: red[1] if L < 0.5 else red[2])     # the flange
    layer(cv, caps)
    layer(cv, barrel)
    fill_shape(cv, 7.0, 7.0, 3.0, 3.0, lambda u, v, L: shade(red, L))                          # the bonnet
    ring(cv, 7.0, 7.0, 2.9, 3.4, lambda dx, dy, d: red[0])                                     # its edge
    fill_shape(cv, 7.0, 7.0, 1.5, 1.5, lambda u, v, L: shade(nut, L))
    cv.set(5, 5, hx('#ff9a8a'))               # the light on the dome
    cv.set(9, 8, hx('#8a8a98'))               # paint chipped to the iron
    return cv


def p_bench():
    """Park bench with backrest (-y): weathered slats worn pale where people sit, cast-iron ends, carved initials."""
    W, H = 52, 17
    cv = Cv(W, H)
    w = ramp('#a06a3a', 0.5, 0.25, 0.3)
    iron = ramp('#34343e', 0.4, 0.2, 0.45)
    rng = random.Random(41)
    nz = VNoise(W, H, 4, random.Random(42))
    for (y0, y1) in ((1, 2), (4, 5), (7, 9), (11, 12), (14, 15)):
        for y in range(y0, y1 + 1):
            for x in range(2, W - 2):
                c = w[3] if y == y0 else w[1] if y == y1 else w[2]
                c = shift(c, int((nz(x, y * 4) - 0.5) * 14))
                if y0 >= 7 and 8 < x < W - 9:
                    c = mix(c, hx('#c8a882'), 0.18 * math.sin(math.pi * (x - 8) / (W - 17)))   # sat-on wear
                cv.set(x, y, c)
    for y in (3, 6, 10, 13):                  # gaps: the iron frame and the ground below
        for x in range(2, W - 2):
            cv.set(x, y, hx('#1e1a24') if x in (25, 26) else hx('#2a2430'))
    for x0 in (1, W - 4):                     # cast-iron ends with a scrolled armrest
        for y in range(1, 16):
            cv.set(x0, y, iron[3] if y < 5 else iron[2])
            cv.set(x0 + 1, y, iron[2])
            cv.set(x0 + 2, y, iron[1])
        cv.set(x0 + 1, 15, iron[3])
    for x in (12, 13, 15, 16, 17):            # carved initials
        cv.set(x, 11, dk(w[1], 0.3))
    cv.set(36, 8, hx('#e8e4dc'))              # pigeon
    cv.set(37, 8, hx('#d0ccc4'))
    for x in (8, 9, 43, 44):                  # bolts
        cv.set(x, 8, iron[1])
    cv.outline()
    return cv


def p_chain_fence():
    """Chain-link gate panel, chest high: a galvanized top rail between two posts seen from above (the 32 x 4 hitbox),
    and the diamond mesh laid out on both sides, the way it shows when looking down through it."""
    W, H = 34, 16
    cv = Cv(W, H)
    st = ramp('#aeb4be', 0.5, 0.25, 0.4)
    for x in range(1, W - 1):                 # top rail, a tie wire every 4 px
        cv.set(x, 7, st[3] if x % 4 else st[2])
        cv.set(x, 8, st[1] if x % 4 else st[0])
    for x0 in (1, W - 5):                     # posts and their caps
        cv.rect(x0, 6, x0 + 3, 9, st[2])
        cv.rect(x0, 9, x0 + 3, 9, st[1])
        cv.rect(x0 + 1, 6, x0 + 2, 7, st[3])
    cv.outline()
    for y in list(range(0, 6)) + list(range(10, H)):   # the mesh: wires over a faint shade, fading away from the rail
        d = 5 - y if y < 6 else y - 10
        for x in range(2, W - 2):
            if not cv.get(x, y)[3]:
                wire = (x + y) % 4 == 0 or (x - y) % 4 == 0
                cv.set(x, y, alpha(st[3], 235 - 30 * d) if wire else alpha(OUTLINE, 72 - 11 * d))
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
    """Coin-op top loader from above: enamel cabinet, control panel and coin box at the back (-y), round glass lid."""
    S = 24
    cv = Cv(S, S)
    en = ramp('#dfe3e8', 0.42, 0.2, 0.4)
    fill_shape(cv, 12.0, 12.0, 11.0, 11.0, lambda u, v, L: shade(en, L), kind='rect', bevel=2.4, corner=1.6)
    mottle(cv, random.Random(191), 4, 6)
    pn = ramp('#566070', 0.45, 0.22, 0.35)
    cv.rect(2, 2, 21, 5, pn[1])
    cv.rect(2, 2, 21, 2, pn[2])
    cv.rect(2, 5, 21, 5, pn[0])
    for x in (4, 8):                                          # dials
        cv.set(x, 3, hx('#eef2f8'))
        cv.set(x, 4, hx('#98a0ae'))
    cv.set(11, 3, hx('#3aff8a'))                              # ready light
    cv.rect(15, 2, 19, 4, STEEL_L[2])                         # coin box and its slot
    cv.rect(15, 4, 19, 4, STEEL_L[1])
    cv.set(17, 3, OUTLINE)
    cloth = (hx('#8a3040'), hx('#c8ccd4'), hx('#3a5a9a'))

    def lid(dx, dy, d):
        if d > 6.2:
            return dk(en[0], 0.2)                             # the seal's shadow on the enamel
        if d > 4.8:
            return shade(CHROME, 0.25 + 0.9 * light(dx / d * 0.85, dy / d * 0.85))
        c = mix(GLASS[0], cloth[int((math.atan2(dy, dx) + math.pi) / (2 * math.pi) * 3 + d * 0.35) % 3], 0.28)
        return mix(c, hx('#dfeaff'), 0.55) if dx + dy < -2.6 and d > 2.2 else c
    ring(cv, 12.0, 14.0, 0.0, 7.0, lid)
    cv.outline()
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
    """A shop's alarm box on its front wall (-y): a pressed steel case, the slots of its bell, the red lens of its beacon."""
    cv = Cv(12, 8)
    cv.rect(1, 1, 10, 5, hx('#c4c8ce'))
    cv.rect(1, 1, 10, 1, hx('#e8eaee'))
    cv.rect(1, 5, 10, 5, hx('#8c909a'))
    for x in (2, 4):
        cv.rect(x, 2, x, 4, hx('#565a64'))
    cv.rect(7, 2, 9, 4, hx('#c2281e'))
    cv.set(7, 2, hx('#ff8070'))
    cv.rect(7, 4, 9, 4, hx('#8a1a14'))
    cv.outline()
    return cv


def p_fuse_box():
    """The house's fuse box on an outside wall (-y): a steel cabinet seen from above under its little bulkhead lamp, its
    two doors, a yellow hazard plate, the red handle of the main switch, the conduit that feeds it along the wall."""
    cv = Cv(26, 11)
    cv.rect(0, 0, 25, 1, hx('#4a4e58'))          # conduit along the wall
    cv.rect(0, 0, 25, 0, hx('#6e737e'))
    cv.rect(4, 2, 21, 8, hx('#8a909c'))          # cabinet
    cv.rect(4, 2, 21, 2, hx('#c0c6d0'))
    cv.rect(4, 8, 21, 8, hx('#5a5f6a'))
    cv.rect(12, 3, 12, 7, hx('#5e636e'))         # door seam
    cv.rect(6, 4, 10, 6, hx('#f0c81e'))          # hazard plate
    cv.rect(8, 4, 8, 5, hx('#2a2410'))
    cv.set(7, 6, hx('#2a2410'))
    cv.rect(14, 4, 15, 6, hx('#30343c'))         # meter window
    cv.set(14, 4, hx('#9ad8ff'))
    cv.rect(17, 4, 19, 6, hx('#c2281e'))         # main switch
    cv.rect(17, 4, 19, 4, hx('#ff8070'))
    cv.outline()
    return cv


def p_emergency_light():
    """A battery lamp on a wall (-y): a cream case and its two round heads, dull red until the mains fail."""
    cv, gl = Cv(14, 7), Cv(14, 7)
    cv.rect(2, 0, 11, 2, hx('#cfc8b4'))
    cv.rect(2, 0, 11, 0, hx('#ece6d4'))
    cv.rect(2, 2, 11, 2, hx('#948c78'))
    cv.set(7, 1, hx('#3aff8a'))
    for x0 in (3, 8):
        cv.rect(x0, 3, x0 + 2, 5, hx('#7a2a22'))
        cv.set(x0 + 1, 4, hx('#b04a3c'))
        gl.rect(x0, 3, x0 + 2, 5, (255, 110, 80, 200))
        gl.set(x0 + 1, 4, (255, 230, 210, 255))
    cv.outline()
    return cv, gl


def p_cash_case():
    """The boss's case lying open: its lid thrown back (-y), banded wads of notes in two rows."""
    cv = Cv(22, 16)
    cv.rect(1, 1, 20, 14, hx('#23232b'))
    cv.rect(2, 2, 19, 4, hx('#4a2a30'))            # the lining of the lid
    cv.rect(2, 2, 19, 2, hx('#5e3640'))
    cv.rect(1, 6, 20, 6, hx('#0e0e12'))            # the hinge
    for x in (2, 8, 14):
        for y in (7, 11):
            cv.rect(x, y, x + 4, y + 2, hx('#5a8a4a'))
            cv.rect(x, y, x + 4, y, hx('#7aa868'))
            cv.rect(x + 2, y, x + 2, y + 2, hx('#f2ead0'))   # its paper band
    cv.rect(9, 14, 12, 14, hx('#6a6a76'))          # the handle
    cv.outline()
    return cv


def p_ceiling_fan():
    """Ceiling fan from above: four thin blades the game spins, see-through enough to read who stands under it."""
    cv, hub = Cv(44, 44), Cv(44, 44)
    wood, edge = hx('#2c2228', 200), hx('#a8927a', 215)   # dark varnish: it has to read against a wooden floor
    for i in range(5, 21):
        for j in (-2, -1, 0, 1):
            col = edge if j == -2 else wood        # the leading edge catches the light
            cv.set(22 + i, 22 + j, col)
            cv.set(21 - i, 21 - j, col)
            cv.set(21 - j, 22 + i, col)
            cv.set(22 + j, 21 - i, col)
    for y in range(17, 27):
        for x in range(17, 27):
            d = math.hypot(x - 21.5, y - 21.5)
            if d < 4.6:
                hub.set(x, y, hx('#c9a24a') if d < 1.6 else hx('#34343e') if d > 3.2 else hx('#4a4a56'))
    hub.outline()
    cv.over(hub)
    return cv


def p_mirror_ball():
    """Mirror ball from above: little facets, lit from the top left."""
    cv = Cv(12, 12)
    tones = [hx('#566074'), hx('#8892a6'), hx('#c2cad6'), hx('#f4f8ff')]
    for y in range(1, 11):
        for x in range(1, 11):
            dx, dy = x - 5.5, y - 5.5
            if dx * dx + dy * dy > 22:
                continue
            L = 1 - math.hypot(dx + 1.6, dy + 1.6) / 7.5
            facet = (0.45, -0.25, 0.1)[(x + 2 * y) % 3]
            cv.set(x, y, tones[max(0, min(3, int(L * 3.2 + facet)))])
    cv.outline()
    return cv


def p_extinguisher():
    """Wall extinguisher on its bracket (the wall at -y): red cylinder, black valve and hose, a label."""
    cv = Cv(8, 11)
    cv.rect(1, 1, 6, 2, hx('#6a6a76'))             # the bracket
    cv.rect(1, 3, 6, 9, hx('#c0202a'))
    cv.rect(1, 3, 1, 9, hx('#8a1420'))
    cv.rect(5, 3, 5, 9, hx('#e8505a'))
    cv.rect(2, 5, 4, 6, hx('#f2ead0'))             # its label
    cv.rect(3, 2, 4, 3, hx('#14141a'))             # valve
    cv.rect(6, 3, 6, 7, hx('#14141a'))             # hose down its side
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
    """Parking meter head from above: grey dome, dark window, the red flag."""
    cv = Cv(7, 8)
    cv.rect(1, 1, 5, 6, hx('#8a909c'))
    cv.rect(1, 1, 5, 1, hx('#b4bac6'))
    cv.rect(2, 3, 4, 4, hx('#1c2028'))
    cv.set(3, 3, hx('#e03030'))
    cv.rect(2, 6, 4, 6, hx('#5a606c'))
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


def pipe(body, lite, shade, band):
    """A run of pipe along a wall (the wall at -y): brackets into the wall, two flanges."""
    def make():
        cv = Cv(96, 6)
        cv.rect(0, 2, 95, 4, hx(body))
        cv.rect(0, 2, 95, 2, hx(lite))
        cv.rect(0, 4, 95, 4, hx(shade))
        for x in (10, 47, 84):
            cv.rect(x, 0, x + 2, 5, hx('#3a3a44'))
        for x in (30, 66):
            cv.rect(x, 1, x + 1, 5, hx(band))
        cv.outline()
        return cv
    return make


def p_wall_vent():
    """Extractor outlet on a wall (the wall at -y): a louvred steel box."""
    cv = Cv(16, 7)
    cv.rect(1, 1, 14, 5, hx('#6a707c'))
    cv.rect(1, 1, 14, 1, hx('#8a909c'))
    for x in range(3, 13, 2):
        cv.rect(x, 2, x, 4, hx('#1c2028'))
    cv.outline()
    return cv


def p_manhole():
    """Manhole cover, painted on the road: dark cast iron, a rim, a few studs."""
    cv = Cv(16, 16)
    for y in range(16):
        for x in range(16):
            d = math.hypot(x - 7.5, y - 7.5)
            if d < 7.2:
                c = '#15171c' if d > 6.0 else '#30323a' if d > 5.0 else '#24262d'
                if d <= 4.2 and x % 3 == 1 and y % 3 == 1:
                    c = '#34363e'
                cv.set(x, y, hx(c))
    return cv


def p_cardboard_bed():
    """Flattened cardboard boxes someone sleeps on, painted on the ground: tan, creased, a strip of tape."""
    W, H = 36, 20
    cv = Cv(W, H)
    rng = random.Random(77)
    base = hx('#a5855a')
    for y in range(H):
        for x in range(W):
            edge = x in (0, W - 1) or y in (0, H - 1)
            cv.set(x, y, dk(base, 0.3) if edge else lt(base, rng.uniform(0, 0.07)) if rng.random() < 0.5 else dk(base, rng.uniform(0, 0.07)))
    for x in (12, 24):                       # where the flaps fold
        for y in range(1, H - 1):
            cv.set(x, y, dk(base, 0.2))
    for x in range(1, W - 1):                # the seam between two boxes
        if x not in (12, 24):
            cv.set(x, 10, dk(base, 0.12))
    cv.rect(14, 4, 22, 5, hx('#7a5a36'))     # tape
    for (x, y) in ((0, 0), (1, 0), (0, 1), (W - 1, H - 1), (W - 2, H - 1), (W - 1, H - 2), (W - 1, 0)):   # torn corners
        cv.set(x, y, CLEAR)
    return cv


def flipped_table(W, wood, leg, face=None, feet=4):
    """A table tipped on its side, seen from above: its top on edge along -y (a sliver of its upper face on the outside),
    the legs lying on the floor behind it (or the one pedestal and its foot)."""
    def paint():
        H = 27
        cv = Cv(W, H)
        rng = random.Random(W * 7 + feet)
        base, lg = hx(wood), hx(leg)
        top = hx(face) if face else lt(base, 0.28)
        for x in range(1, W - 1):
            g = rng.uniform(-0.06, 0.06)
            for y in range(1, 7):
                c = top if y < 3 else dk(base, 0.38) if y == 6 else base
                cv.set(x, y, lt(c, g) if g > 0 else dk(c, -g))
        for x in (1, W - 2):
            cv.set(x, 1, CLEAR)

        def post(x0, x1, y0, y1):
            cv.rect(x0, y0, x1, y1, lg)
            for y in range(y0, y1 + 1):
                cv.set(x0, y, lt(lg, 0.22))
                cv.set(x1, y, dk(lg, 0.28))
        if feet == 4:
            cv.rect(7, 7, W - 8, 8, dk(base, 0.22))          # the apron under the top
            for x0 in (4, W - 7):
                post(x0, x0 + 2, 7, H - 4)
                cv.rect(x0, H - 3, x0 + 2, H - 2, dk(lg, 0.45))   # the end of the leg
        else:
            c = W // 2
            post(c - 2, c + 1, 7, H - 6)
            cv.rect(c - 7, H - 5, c + 6, H - 3, dk(lg, 0.12))     # its round foot, on edge
            cv.rect(c - 7, H - 5, c + 6, H - 5, lt(lg, 0.2))
            cv.rect(c - 7, H - 2, c + 6, H - 2, dk(lg, 0.45))
        cv.outline()
        return cv
    return paint


def p_ladder():
    """A fixed steel ladder filling its gap in a wall, seen from above: two rails along the climb (y), rungs across,
    hand hoops at both ends; its shadow falls to the lower right, as off something that stands clear of the floor."""
    cv = Cv(32, 32)
    rail, hi, lo, sh = hx('#aab2c6'), hx('#dfe6f2'), STEEL_L[1], (8, 6, 16, 110)   # pale: it must be seen in the dark
    for dx, dy, shadow in ((2, 2, True), (0, 0, False)):
        for x0 in (6, 22):
            for y in range(2, 30):
                for x in range(x0, x0 + 3):
                    if not cv.ok(x + dx, y + dy):
                        continue
                    cv.set(x + dx, y + dy, sh if shadow else hi if x == x0 else lo if x == x0 + 2 else rail)
        for y in range(4, 29, 4):
            for x in range(9, 22):
                if cv.ok(x + dx, y + dy):
                    cv.set(x + dx, y + dy, sh if shadow else hi if y % 8 == 4 else rail)
    for y0 in (1, 29):                                   # the hoops one holds on to, at the top and at the foot
        for x in range(5, 26):
            cv.set(x, y0, hi)
            cv.set(x, y0 + 1, lo)
    return cv


def p_parapet():
    """The low wall at the edge of a roof where one can swing a leg over: a pale coping stone on a course of brick,
    worn in the middle by everybody who has."""
    cv = Cv(34, 12)
    rng = random.Random(77)
    stone, brick = hx('#b0aaa0'), hx('#7a4a40')
    for x in range(1, 33):
        worn = abs(x - 16.5) < 6
        for y in range(1, 11):
            if y in (1, 10):
                c = dk(brick, 0.12 if (x + y) % 9 else 0.3)   # the course under the coping, a joint now and then
            else:
                c = stone
                if y == 2:
                    c = lt(c, 0.16)
                elif y == 9:
                    c = dk(c, 0.22)
                if worn and 3 <= y <= 8:
                    c = dk(c, 0.08 + rng.uniform(0, 0.06))
                else:
                    g = rng.uniform(-0.04, 0.04)
                    c = lt(c, g) if g > 0 else dk(c, -g)
            cv.set(x, y, c)
    for x in (11, 22):                                   # two joints in the coping
        for y in range(2, 10):
            cv.set(x, y, dk(stone, 0.3))
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
    """The partition between two toilets, from above: a thin laminate panel, its bracket on the wall (-y), a steel foot
    in the middle and the post at its free end, graffiti scratched into its edge."""
    cv = Cv(6, 42)

    def panel(x, y, c):
        if x < 1.5:
            return hx('#b0bec8')
        if x >= 4.5:
            return hx('#62727e')
        return shift(hx('#8a9aa6'), int(math.sin(y * 1.7) * 2))
    px_paint(cv, 1, 1, 5, 41, panel)
    for y in (1, 20, 39.5):
        frect(cv, 1, y, 5, y + 1.5, hx('#c8ccd4'))
        frect(cv, 1, y + 1.0, 5, y + 1.5, hx('#8a8e9a'))
        stud(cv, 2.5, y + 0.5, hx('#8a8e9a'))
    for (y, ln) in ((7.0, 2.5), (11.5, 1.5), (28.0, 3.0)):
        line(cv, 2.5, y, 2.8, y + ln, hx('#5a6874'))
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
    """A doormat: coir, a darker border, worn in the middle."""
    cv = Cv(26, 14)
    cv.rect(1, 1, 24, 12, hx('#5a4a32'))
    cv.rect(3, 3, 22, 10, hx('#7a6644'))
    rng = random.Random(77)
    for _ in range(40):
        cv.set(rng.randint(3, 22), rng.randint(3, 10), hx('#8a7650') if rng.random() < 0.5 else hx('#665436'))
    cv.rect(9, 5, 16, 8, hx('#6e5c3e'))
    cv.outline()
    return cv


def p_stairs():
    """A flight of stairs going down (toward -y), from above: the treads darker and darker, a rail each side."""
    W, H = 66, 46
    cv = Cv(W, H)
    st = ramp('#6e6c74', 0.5, 0.25, 0.3)
    n = 9
    for i in range(n):
        y0 = 1 + int(i * (H - 2) / n)
        y1 = int((i + 1) * (H - 2) / n)
        f = 1.0 - 0.75 * (n - 1 - i) / (n - 1)          # the deeper, the darker
        c = tuple(int(v * f) for v in st[2][:3]) + (255,)
        cv.rect(4, y0, W - 5, y1, c)
        cv.rect(4, y1, W - 5, y1, tuple(int(v * f * 0.55) for v in st[2][:3]) + (255,))   # the nosing's shadow
        cv.rect(4, y0, W - 5, y0, tuple(min(255, int(v * f * 1.25)) for v in st[2][:3]) + (255,))
    for x in (1, W - 4):
        cv.rect(x, 1, x + 2, H - 2, hx('#2a2630'))
        cv.rect(x + 1, 1, x + 1, H - 2, hx('#4a4654'))
    cv.outline()
    return cv


def p_floor_hole():
    """Floorboards torn up over a hiding place: the dark hole, splintered ends, a tin box left open and empty beside it."""
    cv = Cv(30, 22)
    cv.rect(2, 3, 19, 18, hx('#0c0810'))
    cv.rect(3, 4, 18, 17, hx('#1a1218'))
    for (x, y, w) in ((1, 2, 7), (9, 2, 5), (15, 3, 6), (1, 19, 5), (8, 18, 8), (17, 19, 4)):
        cv.rect(x, y, x + w, y + 1, hx('#8a5a34'))
        cv.set(x + w, y, hx('#d8b070'))
    cv.rect(21, 7, 28, 15, hx('#5a6470'))
    cv.rect(22, 8, 27, 14, hx('#2a3038'))
    cv.rect(21, 5, 28, 6, hx('#8a94a0'))
    cv.set(24, 11, hx('#3fa66a'))
    cv.outline()
    return cv


def p_jerrycan():
    """A jerrycan on the floor, from above: red, its handle, the cap, the pressed cross on its side."""
    cv = Cv(11, 13)
    red = ramp('#c8281e', 0.5, 0.25, 0.3)
    cv.rect(1, 1, 9, 11, red[2])
    cv.rect(1, 1, 9, 2, red[3])
    cv.rect(1, 10, 9, 11, red[1])
    cv.rect(3, 4, 7, 4, red[0])
    cv.rect(5, 3, 5, 9, red[1])
    cv.rect(2, 7, 8, 7, red[1])
    cv.rect(7, 1, 8, 2, hx('#e0b040'))
    cv.outline()
    return cv


def p_runner():
    """A length of corridor carpet, worn, from above (its long way along x). No outline: lengths are laid end to end."""
    W, H = 96, 18
    cv = Cv(W, H)
    red = ramp('#5e2a34', 0.5, 0.25, 0.3)
    cv.rect(0, 0, W - 1, H - 1, red[1])
    cv.rect(0, 3, W - 1, H - 4, red[2])
    for y in (1, H - 2):
        cv.rect(0, y, W - 1, y, hx('#8a6a3a'))                    # its ochre piping
    rng = random.Random(311)
    for _ in range(150):                                          # the pile, trodden flat down the middle
        x, y = rng.randint(0, W - 1), rng.randint(3, H - 4)
        worn = abs(y - (H - 1) / 2) < 3.2
        cv.set(x, y, red[1] if worn and rng.random() < 0.75 else red[3] if rng.random() < 0.2 else red[2])
    return cv


def p_radiator():
    """A cast-iron radiator under a wall (the wall at -y), from above: its columns, the valve."""
    cv = Cv(30, 8)
    cv.rect(1, 1, 28, 6, hx('#8a8e98'))
    for x in range(2, 27, 3):
        cv.rect(x, 1, x, 6, hx('#c4c8d0'))
        cv.rect(x + 1, 1, x + 1, 6, hx('#6a6e78'))
    cv.rect(1, 6, 28, 6, hx('#4a4e58'))
    cv.rect(27, 3, 28, 4, hx('#b8262c'))
    cv.outline()
    return cv


def p_bike():
    """A bicycle leant on a wall, from above: both tyres end on, the frame's tube, the handlebar across, the saddle."""
    cv = Cv(46, 14)
    tyre, steel = hx('#1a1a20'), hx('#aab2bc')
    for x0 in (2, 30):
        cv.rect(x0, 6, x0 + 13, 7, tyre)
        cv.rect(x0 + 2, 6, x0 + 11, 6, hx('#3a3a44'))
    cv.rect(9, 6, 36, 7, hx('#c8402c'))
    cv.rect(9, 6, 36, 6, hx('#e86a50'))
    cv.rect(33, 2, 34, 11, steel)                                 # the handlebar and its grips
    cv.rect(33, 2, 34, 3, tyre)
    cv.rect(33, 10, 34, 11, tyre)
    cv.rect(14, 5, 19, 8, hx('#2a2026'))                          # the saddle
    cv.rect(15, 5, 18, 5, hx('#4a3a40'))
    cv.rect(22, 4, 24, 4, hx('#6a6e78'))                          # the pedals
    cv.rect(22, 9, 24, 9, hx('#6a6e78'))
    cv.outline()
    return cv


def p_bin_bag():
    """A full bin bag, from above: black plastic, the folds catching the light, the knot."""
    W, H = 15, 14
    cv = Cv(W, H)
    b = ramp('#2c2e3a', 0.5, 0.25, 0.45)
    for y in range(H):
        for x in range(W):
            u, v = (x - 7) / 6.6, (y - 6.5) / 6.1
            d = u * u + v * v
            if d > 1.0:
                continue
            fold = math.sin(math.atan2(v, u) * 3 + 0.6) > 0.86
            cv.set(x, y, b[3] if fold and 0.15 < d < 0.8 else b[1] if d > 0.62 else b[2])
    cv.rect(6, 5, 8, 7, b[0])
    cv.set(7, 6, hx('#8a8e9c'))
    cv.outline()
    return cv


def p_newspaper():
    """A folded newspaper left at a door: the headline, grey lines of text, a picture."""
    cv = Cv(13, 10)
    cv.rect(1, 1, 11, 8, hx('#d8d2c0'))
    cv.rect(2, 2, 10, 3, hx('#2a2630'))
    for y in (5, 7):
        cv.rect(2, y, 6, y, hx('#8a8678'))
    cv.rect(8, 5, 10, 7, hx('#6a6e78'))
    cv.rect(1, 8, 11, 8, hx('#b0a890'))
    cv.outline()
    return cv


def p_shoes():
    """A pair of shoes left on a doormat, from above (toes toward +x)."""
    cv = Cv(10, 9)
    for y0 in (1, 5):
        cv.rect(1, y0, 8, y0 + 2, hx('#5a3a22'))
        cv.rect(1, y0, 4, y0 + 2, hx('#1c1418'))                  # the opening
        cv.rect(6, y0, 8, y0, hx('#8a5c38'))
    cv.outline()
    return cv


# small dressing added one by one (the details list)
DETAIL_PROPS = dict(ladder=p_ladder, parapet=p_parapet, fuse_box=p_fuse_box,
                    cash_case=p_cash_case, ceiling_fan=p_ceiling_fan, mirror_ball=p_mirror_ball, extinguisher=p_extinguisher,
                    vending=p_vending, phone_booth=p_phone_booth, parking_meter=p_parking_meter, news_box=p_news_box,
                    pipe_steam=pipe('#8a5a3a', '#b07a52', '#5e3a24', '#c8c0a8'), pipe_water=pipe('#4a6a7a', '#6e8e9e', '#30485a', '#9aa2b0'),
                    wall_vent=p_wall_vent, manhole=p_manhole, cardboard_bed=p_cardboard_bed,
                    table_flipped=flipped_table(46, '#86552f', '#5a361e'),
                    table_round_flipped=flipped_table(30, '#8a5530', '#4a2c18', feet=1),
                    card_table_flipped=flipped_table(60, '#6a3518', '#4a2c18', face='#1f7a4c'),
                    urinal=p_urinal, stall=p_stall, apt_door=p_apt_door, doormat=p_doormat, stairs=p_stairs,
                    floor_hole=p_floor_hole, jerrycan=p_jerrycan, runner=p_runner, radiator=p_radiator, bike=p_bike,
                    bin_bag=p_bin_bag, newspaper=p_newspaper, shoes=p_shoes)
DETAIL_SIZES = dict(ladder=(32, 32), parapet=(34, 12), fuse_box=(26, 11), cash_case=(22, 16), ceiling_fan=(44, 44), mirror_ball=(12, 12), extinguisher=(8, 11),
                    vending=(28, 22), phone_booth=(26, 26), parking_meter=(7, 8), news_box=(16, 13),
                    pipe_steam=(96, 6), pipe_water=(96, 6), wall_vent=(16, 7), manhole=(16, 16), cardboard_bed=(36, 20),
                    table_flipped=(46, 27), table_round_flipped=(30, 27), card_table_flipped=(60, 27),
                    urinal=(14, 12), stall=(6, 42), apt_door=(34, 8), doormat=(26, 14), stairs=(66, 46),
                    floor_hole=(30, 22), jerrycan=(11, 13), runner=(96, 18), radiator=(30, 8), bike=(46, 14),
                    bin_bag=(15, 14), newspaper=(13, 10), shoes=(10, 9))

SHOP_PROPS = dict(bottle_shelf=p_bottle_shelf, back_bar=p_back_bar, washer=p_washer, neon_sign_liquor=p_neon_sign_liquor,
                  alarm_box=p_alarm_box,
                  neon_sign_video=p_neon_sign_video, neon_sign_wash=p_neon_sign_wash)
SHOP_SIZES = dict(bottle_shelf=(42, 13), back_bar=(42, 10), washer=(24, 24), neon_sign_liquor=(46, 14), neon_sign_video=(44, 14),
                  alarm_box=(12, 8),
                  neon_sign_wash=(50, 14))
SHOP_GLOWING = ['neon_sign_liquor', 'neon_sign_video', 'neon_sign_wash']


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
    cv, gl = Cv(16, 16), Cv(16, 16)
    foot = ramp('#3a3442', 0.5, 0.25, 0.4)
    fill_shape(cv, 9.5, 9.5, 4.2, 4.2, lambda u, v, L: tone(foot, L))
    shade = ramp('#c08a4c', 0.42, 0.2, 0.35)
    ring(cv, 8.0, 8.0, 2.0, 6.3, lambda dx, dy, d: tone(shade, 0.3 + 0.75 * light(dx / d * 0.75, dy / d * 0.75)))
    lamp_core(cv, gl, 8.0, 8.0, 1.7)
    cv.outline()
    ring(gl, 8.0, 8.0, 2.0, 6.3, lambda dx, dy, d: (255, 176, 96, int(70 - 8 * d)))
    return cv, gl


def p_table_lamp():
    cv, gl = Cv(18, 18), Cv(18, 18)
    wood = ramp('#6a4026', 0.45, 0.22, 0.3)
    fill_shape(cv, 9.0, 9.0, 8.0, 8.0, lambda u, v, L: tone(wood, L))
    ring(cv, 9.0, 9.0, 6.6, 7.2, lambda dx, dy, d: wood[1])
    shade = ramp('#d98a5a', 0.42, 0.2, 0.35)
    ring(cv, 9.0, 9.0, 1.6, 5.0, lambda dx, dy, d: tone(shade, 0.3 + 0.75 * light(dx / d * 0.75, dy / d * 0.75)))
    ring(cv, 9.0, 9.0, 5.0, 5.6, lambda dx, dy, d: dk(wood[0], 0.3))
    lamp_core(cv, gl, 9.0, 9.0, 1.8)
    cv.outline()
    ring(gl, 9.0, 9.0, 1.6, 5.0, lambda dx, dy, d: (255, 170, 110, int(90 - 10 * d)))
    return cv, gl


def p_wall_lamp():
    cv, gl = Cv(14, 7), Cv(14, 7)
    cv.rect(2, 0, 11, 1, BRASS[1])
    cv.rect(3, 0, 10, 0, BRASS[2])

    def dome(u, v, L):
        if v < 0:
            return None
        k = math.hypot(u / 5.0, v / 4.4)
        return HOT if k < 0.5 else hx('#ffe2a8') if k < 0.82 else hx('#f0b868')
    fill_shape(cv, 7.0, 2.0, 5.0, 4.4, dome)
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


def p_ceiling_lamp():
    cv, gl = Cv(18, 18), Cv(18, 18)
    enamel = ramp('#2f5a48', 0.5, 0.25, 0.4)
    ring(cv, 9.0, 9.0, 2.2, 7.4, lambda dx, dy, d: tone(enamel, 0.25 + 0.85 * light(dx / d * 0.8, dy / d * 0.8)))
    ring(cv, 9.0, 9.0, 6.6, 7.4, lambda dx, dy, d: tone(BRASS, light(dx / d * 0.9, dy / d * 0.9)))
    lamp_core(cv, gl, 9.0, 9.0, 2.5)
    cv.outline()
    # light leaking under the rim
    ring(gl, 9.0, 9.0, 7.0, 8.9, lambda dx, dy, d: (255, 214, 150, int(150 - 70 * (d - 7.0))))
    return cv, gl


def p_pool_lamp():
    cv, gl = Cv(46, 12), Cv(46, 12)
    enamel = ramp('#1f6a44', 0.5, 0.25, 0.4)
    fill_shape(cv, 23.0, 6.0, 22.0, 5.0, lambda u, v, L: tone(enamel, L), kind='rect', bevel=3.0, corner=2.0)
    for x in range(3, 43):
        cv.set(x, 1, BRASS[2])
        cv.set(x, 10, BRASS[1])
    # vents over each bulb
    for cx in (11, 23, 35):
        cv.rect(cx - 3, 5, cx + 2, 6, HOT)
        for x in range(cx - 3, cx + 3):
            for y in (5, 6):
                gl.set(x, y, (255, 246, 220, 200))
    cv.outline()
    for x in range(0, 46):
        for y in (0, 11):
            gl.set(x, y, (255, 214, 150, 110))
    return cv, gl


LIGHT_PROPS = dict(floor_lamp=p_floor_lamp, table_lamp=p_table_lamp, wall_lamp=p_wall_lamp,
                   tube_light=tube_fixture(hx('#cfe6ff'), hx('#ffffff')),
                   neon_tube_pink=tube_fixture(NEON_PINK, lt(NEON_PINK, 0.6)),
                   neon_tube_cyan=tube_fixture(NEON_CYAN, lt(NEON_CYAN, 0.6)),
                   ceiling_lamp=p_ceiling_lamp, pool_lamp=p_pool_lamp, emergency_light=p_emergency_light)
LIGHT_SIZES = dict(floor_lamp=(16, 16), table_lamp=(18, 18), wall_lamp=(14, 7), tube_light=(30, 5),
                   neon_tube_pink=(30, 5), neon_tube_cyan=(30, 5), ceiling_lamp=(18, 18), pool_lamp=(46, 12),
                   emergency_light=(14, 7))


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
    """Rooftop condenser, 1.4 x 1 m: the fan under its grille on the left, the louvred coil panel on the right."""
    W, H = 46, 32
    cv = Cv(W, H)
    body = ramp('#a39c90', 0.5, 0.26, 0.34)
    fill_shape(cv, W / 2, H / 2, W / 2 - 1, H / 2 - 1, lambda u, v, L: shade(body, L), kind='rect', bevel=2.2, corner=1.4)
    mottle(cv, random.Random(871), 5, 6)
    fr = 11.0

    def fan(u, v, L):
        d = math.hypot(u, v)
        if d > fr - 1.4:
            return shade(GALV, L)                              # pressed rim
        if d < 2.4:
            return GALV[1]                                     # hub
        blade = math.sin(math.atan2(v, u) * 5 + d * 0.3) > 0.2
        c = hx('#474a58') if blade else hx('#18141f')
        if abs(d - 5.6) < 0.55 or abs(u) < 0.55 or abs(v) < 0.55:
            c = mix(c, GALV[2], 0.6)                           # grille: one ring, two spokes
        return c
    fill_shape(cv, 16.0, 16.0, fr, fr, fan)
    for y in range(5, 27):                                     # louvres
        for x in range(31, 42):
            cv.set(x, y, (body[3], body[1], body[0])[(y - 5) % 3])
    rng = random.Random(872)
    smudge(cv, rng, 5, (3, 3, 43, 29), (1.0, 2.6), 0.5, hx('#7a4a26'))    # rust blooms
    smudge(cv, rng, 6, (2, 2, 44, 30), (1.5, 3.5), 0.16)                  # soot
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
    """Galvanised duct run, 2 m: flanged joints every 50 cm, dents and streaks."""
    W, H = 64, 12
    cv = Cv(W, H)
    fill_shape(cv, W / 2, H / 2, W / 2 - 1, H / 2 - 1, lambda u, v, L: shade(GALV, L), kind='rect', bevel=2.6, corner=0.6)
    rng = random.Random(873)
    mottle(cv, rng, 5, 4)
    for x in (16, 32, 48):
        for y in range(1, H - 1):
            cv.set(x, y, GALV[3])
            cv.set(x + 1, y, GALV[0])
    smudge(cv, rng, 6, (2, 2, 61, 9), (1.0, 2.2), 0.2)
    cv.outline()
    return cv


def speck_box(rng, x0, y0, x1, y1, p):
    """Random sparse pixels of a box."""
    return [(x, y) for y in range(y0, y1 + 1) for x in range(x0, x1 + 1) if rng.random() < p]


def r_hatch():
    """Roof access hatch, 70 cm: steel lid on a curb, two hinges, a pull handle."""
    S = 22
    cv = Cv(S, S)
    curb = ramp('#4a4c56', 0.5, 0.26, 0.3)
    lid = ramp('#737a84', 0.5, 0.26, 0.36)
    fill_shape(cv, S / 2, S / 2, S / 2 - 1, S / 2 - 1, lambda u, v, L: shade(curb, L), kind='rect', bevel=1.5, corner=1.0)
    layer(cv, lambda ly: fill_shape(ly, S / 2, S / 2, 7.5, 7.5, lambda u, v, L: shade(lid, L), kind='rect', bevel=1.6,
                                    corner=0.8), ol=curb[0])
    rng = random.Random(874)
    for (x, y) in speck_box(rng, 5, 5, 16, 16, 0.12):          # worn tread plate
        cv.set(x, y, shift(cv.get(x, y), 14))
    for x in (6, 15):                                          # hinges at the back
        cv.rect(x, 2, x + 1, 3, hx('#2a2c34'))
    cv.rect(8, 15, 13, 15, hx('#d8dee6'))                      # handle
    cv.rect(8, 16, 13, 16, hx('#2a2c34'))
    smudge(cv, rng, 3, (4, 4, 17, 17), (1.0, 2.0), 0.45, hx('#7a4a26'))
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
    """TV aerial: a short mast on its plate, the boom and its rake of elements, a coax running off."""
    S = 34
    cv = Cv(S, S)
    c = S / 2
    al, sh = hx('#b4bac4'), hx('#5c6270')
    for i, x in enumerate(range(5, 30, 4)):                    # elements, longest at the back
        n = 11 - i
        for y in range(int(c) - n, int(c) + n + 1):
            cv.set(x, y, al)
    for x in range(3, 31):                                     # boom
        cv.set(x, c - 1, al)
        cv.set(x, c, sh)
    fill_shape(cv, c, c, 3.0, 3.0, lambda u, v, L: shade(GALV, L), kind='rect', bevel=1.2, corner=0.6)
    fill_shape(cv, c, c, 1.3, 1.3, lambda u, v, L: hx('#2a2c34'))
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
                  skylight_tv=skylight(hx('#6aa0e8')), skylight_dark=skylight(hx('#2a3448'), lit=False))
ROOF_SIZES = dict(ac_unit=(46, 32), vent=(14, 14), duct=(64, 12), hatch=(22, 22), chimney=(20, 20), tank=(50, 50),
                  antenna=(34, 34), bulkhead=(62, 54), skylight=(46, 30), skylight_tv=(46, 30), skylight_dark=(46, 30))
ROOF_GLOWING = ['bulkhead', 'skylight', 'skylight_tv']


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
# Build
# --------------------------------------------------------------------------

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
    for i in range(3):
        out[('characters', 'gib_chunk%d' % i)] = gib_chunk(i)
    out[('characters', 'gib_eye')] = gib_eye()
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
    props = dict(table=p_table, table_round=p_table_round, card_table=p_card_table, dope_table=p_dope_table, gas_bottle=p_gas_bottle, dance_stage=p_dance_stage, desk=p_desk, chair=p_chair, armchair=p_armchair,
                 sofa=p_sofa, plant=p_plant, tv=p_tv, fridge=p_fridge, oven=p_oven, sink=p_sink,
                 toilet=p_toilet, bed=p_bed, pool_table=p_pool_table, arcade=p_arcade, crate=p_crate,
                 barrel=p_barrel, bookshelf=p_bookshelf, speaker=p_speaker, dj_booth=p_dj_booth,
                 bar_counter=p_bar_counter, car=p_car, dumpster=p_dumpster, trash_can=p_trash_can,
                 car2=p_car2, van=p_van, car_tire=p_car_tire, car_hood=p_car_hood, car_door=p_car_door,
                 car2_hood=p_car2_hood, car2_door=p_car2_door, van_hood=p_van_hood, van_door=p_van_door,
                 palm_tree=p_palm_tree, streetlight=p_streetlight, neon_sign_palm=p_neon_sign_palm,
                 neon_sign_bar=p_neon_sign_bar, neon_sign_arrow=p_neon_sign_arrow, jukebox=p_jukebox,
                 hydrant=p_hydrant, bench=p_bench, chain_fence=p_chain_fence)
    props.update(SHOP_PROPS)
    props.update(DETAIL_PROPS)
    for name, fn in props.items():
        r = fine(fn, name) if name in FINE_PROPS else fn()
        if isinstance(r, tuple):   # (sprite, emissive map)
            out[('props', name)], out[('props', name + '_glow')] = r
        else:
            out[('props', name)] = r
    out[('props', 'dj_booth_glow')] = glow_from(out[('props', 'dj_booth')], lambda x, y, c: is_neon(c))
    for name, fn in LIGHT_PROPS.items():
        out[('props', name)], out[('props', name + '_glow')] = fn()
    for name, fn in ROOF_PROPS.items():
        r = fn()
        if isinstance(r, tuple):
            out[('roof', name)], out[('roof', name + '_glow')] = r
        else:
            out[('roof', name)] = r
    for name, cv in tiles().items():
        out[('tiles', name)] = cv
    out[('structure', 'door')] = s_door()
    out[('structure', 'door_locked')] = s_door_locked()
    out[('structure', 'door_jamb')] = s_jamb(ramp('#6e4a32', 0.5, 0.26, 0.34))
    out[('structure', 'door_jamb_steel')] = s_jamb(STEEL_L)
    out[('structure', 'threshold')] = s_threshold()
    out[('structure', 'window')] = s_window()
    out[('structure', 'window_broken')] = s_window_broken()
    out[('structure', 'window_sill')] = s_window_sill()
    out[('structure', 'fence')] = s_fence()
    return out


GLOWING = ['arcade', 'tv', 'dj_booth', 'jukebox', 'neon_sign_palm', 'neon_sign_bar', 'neon_sign_arrow', 'streetlight',
           'car', 'car2', 'van']
# furniture at real scale (1 m = 32 px): sprite = hitbox in data/props.js + 1 px of outline on each side
PROP_SIZES = dict(table=(46, 28), table_round=(30, 30), card_table=(60, 38), dope_table=(46, 28), gas_bottle=(14, 14), dance_stage=(50, 50), desk=(48, 26), chair=(16, 16), armchair=(28, 28),
                  sofa=(66, 30), plant=(24, 24), tv=(24, 17), fridge=(24, 24), oven=(22, 22), sink=(28, 20),
                  toilet=(15, 23), bed=(46, 66), pool_table=(82, 46), arcade=(24, 29), crate=(21, 21),
                  barrel=(20, 20), bookshelf=(42, 13), speaker=(16, 16), dj_booth=(60, 24),
                  bar_counter=(32, 21), car=(140, 58), dumpster=(60, 36), trash_can=(17, 17),
                  car2=(134, 56), van=(160, 64), car_tire=(20, 7), car_hood=(38, 44), car_door=(34, 6),
                  car2_hood=(30, 40), car2_door=(40, 6), van_hood=(18, 48), van_door=(30, 6),
                  palm_tree=(104, 104), streetlight=(136, 16), neon_sign_palm=(40, 14), neon_sign_bar=(44, 14),
                  neon_sign_arrow=(30, 12), jukebox=(30, 22), hydrant=(14, 14), bench=(52, 17),
                  chain_fence=(34, 16))
FLOOR_NAMES = [t[0] for t in FLOOR_TILES]
PROP_SIZES.update(LIGHT_SIZES)
PROP_SIZES.update(SHOP_SIZES)
PROP_SIZES.update(DETAIL_SIZES)
GLOWING += list(LIGHT_SIZES) + SHOP_GLOWING
# the furniture, the street's dressing and the vehicles are painted at FINE density (their emissive maps too), like
# the people and the weapons: the sizes above are in world px. The neon signs and the lamps stay at the world's: they are light.
# (keep in step with FINE in src/engine/Assets.js)
FINE_PROPS = set(PROP_SIZES) - set(LIGHT_SIZES) - set(SHOP_GLOWING) - {'neon_sign_palm', 'neon_sign_bar', 'neon_sign_arrow'}


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
        + [('gib_chunk0', (6, 5)), ('gib_chunk1', (6, 5)), ('gib_chunk2', (6, 5)), ('gib_eye', (3, 3))]),
    # the weapons in hand are at FINE density: twice these world sizes
    'weapons': dict(pistol=(27, 15), uzi=(33, 18), uzi_silenced=(46, 18), shotgun=(51, 14), rifle=(56, 16),
                    sniper=(72, 17), bazooka=(52, 14), bat=(46, 9), knife=(30, 10), cue=(80, 6), cue_half=(46, 6), tire_iron=(34, 15),
                    rocket=(9, 4),
                    casing=(3, 2), shell=(4, 2), mag_pistol=(3, 6), mag_uzi=(3, 9), mag_rifle=(4, 9),
                    mag_sniper=(4, 8), shells_box=(8, 6), ammo_9mm=(9, 7), ammo_12g=(9, 7), ammo_762=(9, 7),
                    ammo_rocket=(12, 6)),
    'props': dict((n + g, (w * FINE, h * FINE) if n in FINE_PROPS else (w, h))
                  for n, (w, h) in PROP_SIZES.items() for g in ([''] + (['_glow'] if n in GLOWING else []))),
    'tiles': dict([(n + s, (32 * FINE, 32 * FINE)) for n in FLOOR_NAMES for s in ('', '_v1', '_v2')]
                  + [(n, (32, 32)) for n in ('wall', 'brick', 'roof')] + [('neon_floor_glow', (32 * FINE, 32 * FINE))]),
    'roof': dict(list(ROOF_SIZES.items()) + [(n + '_glow', ROOF_SIZES[n]) for n in ROOF_GLOWING]),
    'items': dict(butt=(4, 2), cigar=(6, 2), can=(6, 4), magazine=(8, 10), ashtray=(10, 10), bottle=(11, 5)),
    'structure': dict(door=(32, 9), door_locked=(32, 9), door_jamb=(5, 32), door_jamb_steel=(5, 32), threshold=(32, 32),
                      window=(32, 10), window_broken=(32, 10), window_sill=(32, 32), fence=(32, 6)),
}


def main():
    sprites = build()
    for (group, name), cv in sorted(sprites.items()):
        d = os.path.join(OUT_DIR, group)
        os.makedirs(d, exist_ok=True)
        cv.img.save(os.path.join(d, name + '.png'))
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
    print('generated %d sprites into %s' % (n, OUT_DIR))


if __name__ == '__main__':
    main()
