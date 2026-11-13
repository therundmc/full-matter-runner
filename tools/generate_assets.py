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
    def __init__(self, w, h):
        self.w, self.h = w, h
        self.img = Image.new('RGBA', (w, h), CLEAR)
        self.p = self.img.load()

    def ok(self, x, y):
        return 0 <= x < self.w and 0 <= y < self.h

    def set(self, x, y, c):
        x, y = int(x), int(y)
        if c is not None and self.ok(x, y):
            self.p[x, y] = c

    def get(self, x, y):
        x, y = int(x), int(y)
        return self.p[x, y] if self.ok(x, y) else CLEAR

    def on(self, x, y, th=100):
        return self.get(x, y)[3] >= th

    def blend(self, x, y, c):
        x, y = int(x), int(y)
        if not self.ok(x, y):
            return
        b = self.p[x, y]
        a = c[3] / 255.0
        if b[3] == 0:
            self.p[x, y] = c
            return
        oa = a + b[3] / 255.0 * (1 - a)
        rgb = tuple(int(round((c[i] * a + b[i] * (b[3] / 255.0) * (1 - a)) / oa)) for i in range(3))
        self.p[x, y] = rgb + (int(round(oa * 255)),)

    def rect(self, x0, y0, x1, y1, c):
        for y in range(y0, y1 + 1):
            for x in range(x0, x1 + 1):
                self.set(x, y, c)

    def each(self, x0, y0, x1, y1, fn):
        """fn(x, y, current) -> colour or None."""
        for y in range(y0, y1 + 1):
            for x in range(x0, x1 + 1):
                if self.ok(x, y):
                    c = fn(x, y, self.p[x, y])
                    if c is not None:
                        self.p[x, y] = c

    def over(self, other, dx=0, dy=0):
        self.img.alpha_composite(other.img, (dx, dy))
        self.p = self.img.load()

    def outline(self, col=OUTLINE, diag=False, th=100):
        nb = [(1, 0), (-1, 0), (0, 1), (0, -1)]
        if diag:
            nb += [(1, 1), (-1, 1), (1, -1), (-1, -1)]
        add = []
        for y in range(self.h):
            for x in range(self.w):
                if self.p[x, y][3] < th and any(self.on(x + a, y + b, th) for a, b in nb):
                    add.append((x, y))
        for x, y in add:
            self.p[x, y] = col
        return self

    def recolor_edges(self, dark, light_c=None):
        """Shade pixels on the bottom/right silhouette edge (and top/left if light_c)."""
        ch = []
        for y in range(self.h):
            for x in range(self.w):
                if not self.on(x, y):
                    continue
                if not self.on(x + 1, y) or not self.on(x, y + 1):
                    ch.append((x, y, dark(self.p[x, y])))
                elif light_c and (not self.on(x - 1, y) or not self.on(x, y - 1)):
                    ch.append((x, y, light_c(self.p[x, y])))
        for x, y, c in ch:
            self.p[x, y] = c


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
    for y in range(int(math.floor(cy - R)), int(math.ceil(cy + R)) + 1):
        for x in range(int(math.floor(cx - R)), int(math.ceil(cx + R)) + 1):
            if not cv.ok(x, y):
                continue
            px, py = x + 0.5 - cx, y + 0.5 - cy
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
                cv.set(x, y, c)


def fill_capsule(cv, pts, r, fn):
    """Thick polyline. fn(k, L, side, seg, t) with k = dist/r, side = signed perp/r."""
    xs = [p[0] for p in pts]
    ys = [p[1] for p in pts]
    for y in range(int(min(ys) - r - 1), int(max(ys) + r + 2)):
        for x in range(int(min(xs) - r - 1), int(max(xs) + r + 2)):
            if not cv.ok(x, y):
                continue
            px, py = x + 0.5, y + 0.5
            best = None
            for i in range(len(pts) - 1):
                ax, ay = pts[i]
                bx, by = pts[i + 1]
                dx, dy = bx - ax, by - ay
                ll = dx * dx + dy * dy or 1e-9
                t = max(0.0, min(1.0, ((px - ax) * dx + (py - ay) * dy) / ll))
                qx, qy = ax + t * dx, ay + t * dy
                d = math.hypot(px - qx, py - qy)
                if best is None or d < best[0]:
                    side = ((px - ax) * dy - (py - ay) * dx) / math.sqrt(ll)
                    best = (d, qx, qy, i, t, side)
            d, qx, qy, i, t, side = best
            if d <= r:
                L = light((px - qx) / r * 0.95, (py - qy) / r * 0.95)
                c = fn(d / r, L, side / r, i, t)
                if c is not None:
                    cv.set(x, y, c)


def circle(cv, cx, cy, r, col):
    fill_shape(cv, cx, cy, r, r, lambda u, v, L: col)


def ring(cv, cx, cy, r0, r1, fn):
    for y in range(int(cy - r1 - 1), int(cy + r1 + 2)):
        for x in range(int(cx - r1 - 1), int(cx + r1 + 2)):
            d = math.hypot(x + 0.5 - cx, y + 0.5 - cy)
            if r0 <= d <= r1 and cv.ok(x, y):
                c = fn(x + 0.5 - cx, y + 0.5 - cy, d)
                if c is not None:
                    cv.set(x, y, c)


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


def wood_fill(cv, x0, y0, x1, y1, base, plank=5, rng=RNG, vertical=False, mask=None):
    """Planks with seams, grain streaks and subtle noise."""
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
    'player': dict(kind='player', top=ramp('#1fb5b5', 0.5, 0.25, 0.35), sleeve=None,
                   pants=ramp('#2c3a6a'), shoe=ramp('#ecebf2', 0.4, 0.2, 0.2),
                   hair=ramp('#f2cc58', 0.45, 0.22, 0.45), skin=SKIN, sh=(4.0, 8.0)),
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
    i = tidx(L)
    if k == 'heavy':
        if L > 0.95:
            return lt(ch['skin'][2], 0.6)
        return ch['skin'][i]
    if u > r - 1.55:
        return ch['skin'][i]
    if k == 'player':
        streak = int(math.floor(v * 0.9 - u * 0.35 + 40)) % 3 == 0
        return ch['hair'][max(0, i - 1) if streak else i]
    if k == 'thug':
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
    if k == 'player' and hr + 0.1 < hd < hr + 1.4 and hu > -1.6:
        return WHITE[max(1, i)]
    if k == 'thug' and hr + 0.1 < hd < hr + 1.3 and hu > -0.5:
        return ch['shirt'][1]
    return ch['top'][i]


def draw_torso(ch):
    cv = Cv(20, 20)
    rx, ry = ch['sh']
    hcx, hcy, hr = 11.0, 10.0, 4.1
    body = Cv(20, 20)
    fill_shape(body, 9.6, 10.0, rx, ry,
               lambda u, v, L: shoulder_px(ch, u, v, L, u - 1.4, v, hr), kind='super', p=2.4)
    body.outline()
    cv.over(body)
    head = Cv(20, 20)
    fill_shape(head, hcx, hcy, hr, hr, lambda u, v, L: head_top_px(ch, u, v, L, hr), pad=0.08)
    k = ch['kind']
    if k == 'player':
        # messy hair tufts poking out at the back and sides
        for (u, v, c) in [(-4.6, -1.0, 1), (-4.6, 1.5, 2), (-3.3, -3.4, 1), (-3.2, 3.6, 0), (-1.0, -4.6, 2), (-0.6, 4.5, 1)]:
            head.set(math.floor(hcx + u), math.floor(hcy + v), ch['hair'][c])
        # sunglasses on the front edge
        for yy in range(int(hcy) - 2, int(hcy) + 2):
            xs = [x for x in range(20) if head.on(x, yy)]
            if xs:
                head.set(max(xs), yy, hx('#0e0a16'))
                if yy == int(hcy) - 2:
                    head.set(max(xs), yy, hx('#36e8f0'))
    if k in ('player', 'thug', 'brute'):
        # ears
        head.set(int(hcx) + 1, int(hcy - hr) - 1, ch['skin'][1])
        head.set(int(hcx) + 1, int(hcy + hr), ch['skin'][1])
    if k == 'heavy':
        head.set(int(hcx) + 1, int(hcy - hr) - 1, ch['skin'][1])
        head.set(int(hcx) + 1, int(hcy + hr), ch['skin'][1])
    if k == 'brute':
        # bandana knot tails trailing behind
        for (x, y, c) in [(6, 9, 2), (5, 8, 1), (6, 10, 1), (5, 11, 1), (4, 11, 0)]:
            head.set(x, y, ch['bandana'][c])
    head.outline()
    cv.over(head)
    return cv


def chest_px(ch, u, v, L, hx_, hy_):
    """Front of torso while lying on the back. u toward the head, v across."""
    k = ch['kind']
    i = tidx(L)
    if k == 'player':
        if abs(v) < 1.3 and u < hx_ - 0.6:
            return WHITE[max(1, i)]
        if abs(v) < 2.1:
            return ch['top'][max(0, i - 1)]
        if u > hx_ - 1.0 and abs(v) < 3.2:
            return WHITE[max(1, i)]   # collar
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
    return ch['top'][i]


def face_px(ch, u, v, L, r):
    """Head seen from the front (lying on the back). u toward top of head."""
    k = ch['kind']
    i = tidx(L)
    if k == 'player' and u > 1.0 - 0.25 * abs(v):
        return ch['hair'][i]
    if k == 'thug' and u > 1.3:
        return ch['hair'][i if int(v + 20) % 2 else max(0, i - 1)]
    if k == 'brute' and u > 1.1:
        return ch['bandana'][i]
    if k == 'heavy' and L > 0.95:
        return lt(ch['skin'][2], 0.6)
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
            # sunglasses knocked askew
            for vv in (-2.4, -1.5, -0.6, 0.6, 1.5):
                ex, ey = rot(hcx, hcy, ha, 0.1 + vv * 0.15, vv)
                head.set(ex, ey, hx('#0e0a16'))
            head.set(*rot(hcx, hcy, ha, 0.0, -1.5), hx('#36e8f0'))
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
    s = ch['skin'] if ch['kind'] == 'brute' else ch['top']
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
# Weapons (+x = muzzle)
# --------------------------------------------------------------------------

STEEL = ramp('#585a70', 0.5, 0.25, 0.45)
STEEL_L = ramp('#8a90a4', 0.45, 0.22, 0.35)
WOOD = ramp('#9a5a2c', 0.45, 0.22, 0.3)
OLIVE = ramp('#5d6a32', 0.45, 0.22, 0.3)
BRASS = ramp('#e0a830', 0.45, 0.22, 0.4)


def weapons():
    W = {}
    gun = {'L': STEEL[3], 'M': STEEL[2], 'D': STEEL[1], 'K': STEEL[0], 'w': WOOD[3], 'W': WOOD[2],
           'V': WOOD[1], 'G': hx('#2a2230'), 'g': hx('#4a3e50'), 'S': STEEL_L[3], 's': STEEL_L[2],
           'c': hx('#36e8f0'), 'o': OLIVE[3], 'O': OLIVE[2], 'Q': OLIVE[1], 'q': OLIVE[0],
           'y': hx('#f9c80e'), 'r': hx('#b8262c'), 'R': hx('#7a1420'), 't': hx('#d8d8e0'), 'T': hx('#2a2230')}
    W['pistol'] = ascii_cv(["...........",
                            ".LLLLLLLLS.",
                            ".DMMMMMMMK.",
                            ".GGgK......",
                            "..........."], gun)
    W['uzi'] = ascii_cv(["............",
                         ".LLLLLLLLL..",
                         ".DMMMMMMMMS.",
                         "..KDGG.D....",
                         "....GG......",
                         "....Gg......",
                         "............"], gun)
    W['uzi_silenced'] = ascii_cv(["..................",
                                  ".LLLLLLLLL.SSSSSS.",
                                  ".DMMMMMMMMMsssssS.",
                                  "..KDGG.D...DDDDDD.",
                                  "....GG............",
                                  "....Gg............",
                                  ".................."], gun)
    W['shotgun'] = ascii_cv(["......................",
                             "....wwwLLLLLLLLLLLLLS.",
                             ".wwWWWVMMMMwwwwwDDDDK.",
                             ".VVV...K..VVVVV.......",
                             "......................"], gun)
    W['rifle'] = ascii_cv(["........................",
                           "..........K.........K...",
                           ".wwww.LLLLLLwwwwwLLLLLS.",
                           ".WWWWVMMMMMMVVVVVDDDDDK.",
                           ".VV....GG.MD............",
                           "........G..MD...........",
                           "........................"], gun)
    W['sniper'] = ascii_cv(["............................",
                            ".........SSSSSSSSc..........",
                            ".GGgggGGMMMMMMMMMMLLLLLLLLS.",
                            ".GGG.....K..................",
                            "............................"], gun)
    W['bazooka'] = ascii_cv(["..........................",
                             ".QQo..........K...........",
                             ".QOoooooooooooooooyyoooOQ.",
                             ".qOOOOOOOOOOOOOOOOyyOOOOq.",
                             ".qQQQQQQQQQQQQQQQQyyQQQQq.",
                             ".qq.......GG.T............",
                             ".........................."], gun)
    W['bat'] = ascii_cv(["......................",
                         "..t.....wwwwwwwwwwww..",
                         ".VTtTtTVWWWWWWWWWWWWV.",
                         "......................"], gun)
    W['knife'] = ascii_cv(["..........",
                           ".GgGKsSSt.",
                           ".........."], gun)
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


# --------------------------------------------------------------------------
# Props
# --------------------------------------------------------------------------

def p_table():
    cv = Cv(40, 24)
    wood_fill(cv, 1, 1, 38, 22, hx('#8c5a32'), plank=5, rng=random.Random(11))
    bevel_edges(cv, 1, 1, 38, 22)
    # coffee ring stain
    ring(cv, 11, 9, 2.0, 3.0, lambda dx, dy, d: dk(cv.get(11 + dx, 9 + dy), 0.22) if (dx + dy) > -2.5 else None)
    # ashtray with a smouldering butt
    fill_shape(cv, 29.5, 14.5, 3.2, 3.2, lambda u, v, L: tone(ramp('#9aa4b4'), L))
    fill_shape(cv, 29.5, 14.5, 1.9, 1.9, lambda u, v, L: hx('#3a3440') if L < 0.8 else hx('#5a5466'))
    cv.set(30, 14, hx('#f0e8d8'))
    cv.set(31, 14, hx('#f0e8d8'))
    cv.set(32, 13, hx('#ff6b1a'))
    cv.outline()
    return cv


def p_table_round():
    cv = Cv(28, 28)
    c = 14.0
    wood_fill(cv, 1, 1, 26, 26, hx('#8c5a32'), plank=4, rng=random.Random(12), vertical=True,
              mask=lambda x, y: math.hypot(x + 0.5 - c, y + 0.5 - c) <= 12.9)
    ring(cv, c, c, 11.6, 13.0, lambda dx, dy, d: tone(ramp('#7a4a28'), light(dx / d, dy / d)))
    # drink + coaster
    fill_shape(cv, 18.5, 10.5, 2.2, 2.2, lambda u, v, L: hx('#d8d0c0'))
    fill_shape(cv, 18.5, 10.5, 1.5, 1.5, lambda u, v, L: hx('#ffd27a') if L > 0.7 else hx('#e89a30'))
    cv.set(18, 9, hx('#fff8e0'))
    cv.outline()
    return cv


def p_desk():
    cv = Cv(36, 22)
    wood_fill(cv, 1, 1, 34, 20, hx('#5c3a26'), plank=5, rng=random.Random(13))
    bevel_edges(cv, 1, 1, 34, 20)
    # papers
    paper = Cv(36, 22)
    fill_shape(paper, 6.0, 8.0, 3.2, 4.0, lambda u, v, L: hx('#f2eee4') if L > 0.5 else hx('#d8d2c4'),
               ang=-0.2, kind='rect', corner=0.5)
    for (x, y) in [(5, 6), (6, 6), (7, 6), (5, 8), (6, 8), (5, 10), (6, 10), (7, 10)]:
        paper.set(x, y, hx('#9a96a8'))
    paper.outline(dk(hx('#5c3a26'), 0.55))
    cv.over(paper)
    # CRT monitor (screen faces +y)
    mon = Cv(36, 22)
    beige = ramp('#d8ccaa', 0.42, 0.2, 0.35)
    fill_shape(mon, 18.0, 6.5, 6.5, 5.0, lambda u, v, L: tone(beige, L), kind='rect', bevel=2.5, corner=2.0)
    for x in range(14, 22, 2):
        mon.set(x, 3, beige[0])
        mon.set(x, 4, beige[0])
    mon.rect(13, 11, 22, 11, beige[1])
    mon.outline()
    for x in range(13, 23):
        mon.blend(x, 12, (90, 255, 160, 150))
    cv.over(mon)
    # keyboard + mouse
    kb = Cv(36, 22)
    kb.rect(12, 14, 24, 17, beige[2])
    for y in (15, 16):
        for x in range(13, 24):
            if (x + y) % 2 == 0:
                kb.set(x, y, beige[1])
    kb.rect(12, 14, 24, 14, beige[3])
    fill_shape(kb, 28.5, 15.5, 1.1, 1.5, lambda u, v, L: tone(beige, L))
    kb.outline()
    cv.over(kb)
    # coffee mug
    mug = Cv(36, 22)
    fill_shape(mug, 30.0, 5.0, 1.9, 1.9, lambda u, v, L: tone(WHITE, L))
    mug.set(29, 4, hx('#4a2a14'))
    mug.set(30, 4, hx('#3a1e10'))
    mug.set(29, 5, hx('#3a1e10'))
    mug.set(30, 5, hx('#2a140a'))
    mug.set(32, 5, WHITE[1])
    mug.outline()
    cv.over(mug)
    cv.outline()
    return cv


def p_chair():
    cv = Cv(12, 12)
    wood = ramp('#8a5230', 0.45, 0.22, 0.3)
    seat = ramp('#7a2a3a', 0.45, 0.22, 0.3)
    fill_shape(cv, 6.5, 6.0, 4.4, 4.4, lambda u, v, L: tone(seat, L), kind='rect', bevel=2.0, corner=1.4)
    back = Cv(12, 12)
    fill_shape(back, 2.0, 6.0, 1.1, 5.0, lambda u, v, L: tone(wood, L), kind='rect', bevel=1.0, corner=0.8)
    back.outline()
    cv.over(back)
    cv.outline()
    return cv


def p_armchair():
    cv = Cv(18, 18)
    vel = ramp('#b01a30', 0.55, 0.28, 0.35)
    seam = dk(vel[0], 0.45)
    fill_shape(cv, 9.0, 9.0, 8.0, 8.0, lambda u, v, L: vel[0], kind='rect', corner=2.0)
    seat = Cv(18, 18)
    fill_shape(seat, 10.5, 9.0, 4.4, 4.0, lambda u, v, L: tone(vel, L), kind='rect', bevel=2.4, corner=1.4)
    seat.set(10, 8, vel[0])
    seat.set(11, 9, vel[1])
    seat.outline(seam)
    cv.over(seat)
    back = Cv(18, 18)
    fill_shape(back, 3.2, 9.0, 2.2, 8.0, lambda u, v, L: tone(vel, L), kind='rect', bevel=1.8, corner=1.6)
    back.outline(seam)
    cv.over(back)
    arms_ = Cv(18, 18)
    fill_shape(arms_, 10.5, 2.4, 6.5, 1.4, lambda u, v, L: tone(vel, L), kind='rect', bevel=1.4, corner=1.3)
    fill_shape(arms_, 10.5, 15.6, 6.5, 1.4, lambda u, v, L: tone(vel, L), kind='rect', bevel=1.4, corner=1.3)
    arms_.outline(seam)
    cv.over(arms_)
    for y in (5, 9, 13):
        cv.set(3, y, vel[0])
    cv.outline()
    return cv


def p_sofa():
    cv = Cv(44, 18)
    lea = ramp('#b8368e', 0.5, 0.25, 0.35)
    fill_shape(cv, 22.0, 9.0, 21.0, 8.0, lambda u, v, L: lea[0], kind='rect', corner=2.0)
    cush = Cv(44, 18)
    for cx in (11.0, 22.0, 33.0):
        fill_shape(cush, cx, 10.5, 5.3, 5.6, lambda u, v, L: tone(lea, L), kind='rect', bevel=2.6, corner=1.8)
    for cx in (11, 22, 33):
        cush.set(cx - 2, 8, lt(lea[3], 0.4))
        cush.set(cx - 1, 8, lt(lea[3], 0.4))
    cush.outline(dk(lea[0], 0.5))
    cv.over(cush)
    frame = Cv(44, 18)
    fill_shape(frame, 22.0, 2.6, 21.0, 1.7, lambda u, v, L: tone(lea, L, -1 if L < 0.88 else 0),
               kind='rect', bevel=1.5, corner=1.5)
    fill_shape(frame, 3.0, 9.5, 2.0, 7.5, lambda u, v, L: tone(lea, L), kind='rect', bevel=1.6, corner=1.8)
    fill_shape(frame, 41.0, 9.5, 2.0, 7.5, lambda u, v, L: tone(lea, L), kind='rect', bevel=1.6, corner=1.8)
    for x in range(6, 39, 3):
        frame.set(x, 2, lea[3])
    frame.outline(dk(lea[0], 0.5))
    cv.over(frame)
    cv.outline()
    return cv


def p_plant():
    cv = Cv(18, 18)
    pot = ramp('#c8643a', 0.45, 0.22, 0.35)
    ring(cv, 9.0, 9.0, 2.8, 4.6, lambda dx, dy, d: tone(pot, light(dx / d * 0.8, dy / d * 0.8)))
    fill_shape(cv, 9.0, 9.0, 2.9, 2.9, lambda u, v, L: hx('#3e2818') if L > 0.7 else hx('#2a1a10'))
    cv.outline()
    leaves = Cv(18, 18)
    green = ramp('#3fa040', 0.55, 0.28, 0.35)
    rng = random.Random(77)
    n = 6
    for i in range(n):
        a = i * 2 * math.pi / n + rng.uniform(-0.25, 0.25) + 0.2
        ln = rng.uniform(7.0, 7.9)
        bend = rng.uniform(-0.25, 0.25)
        pts = []
        for k in range(6):
            t = 2.0 + (ln - 2.0) * k / 5.0
            aa = a + bend * k / 5.0
            pts.append((9.0 + math.cos(aa) * t, 9.0 + math.sin(aa) * t))

        def leaf(k, L, s, seg, t):
            if abs(s) < 0.25:
                return green[3]
            return tone(green, L)
        for j in range(5):
            w = 1.3 * math.sin(math.pi * (j + 1.0) / 6.5) ** 0.8
            fill_capsule(leaves, [pts[j], pts[j + 1]], max(0.5, w), leaf)
    leaves.outline(hx('#0c2410'))
    cv.over(leaves)
    return cv


def p_tv():
    cv = Cv(24, 8)
    blk = ramp('#2a2632', 0.5, 0.2, 0.35)
    fill_shape(cv, 12.0, 3.5, 11.0, 2.6, lambda u, v, L: tone(blk, L), kind='rect', bevel=1.5, corner=1.0)
    for x in range(5, 19, 2):
        cv.set(x, 2, blk[0])
    cv.rect(2, 5, 21, 5, hx('#05d9e8'))
    cv.outline()
    for x in range(2, 22):
        cv.set(x, 5, NEON_PINK if 8 <= x <= 11 else hx('#05d9e8'))
        cv.set(x, 6, hx('#9ef6ff') if x % 5 else hx('#ffffff'))
        cv.set(x, 7, (5, 217, 232, 110))
    cv.set(1, 6, OUTLINE)
    cv.set(22, 6, OUTLINE)
    cv.set(19, 3, hx('#ff2a3a'))
    return cv, glow_from(cv, lambda x, y, c: y >= 5 and 2 <= x <= 21 or (x, y) == (19, 3))


def p_fridge():
    cv = Cv(22, 20)
    cr = ramp('#e8e2cc', 0.42, 0.18, 0.4)
    fill_shape(cv, 11.0, 9.0, 10.0, 8.0, lambda u, v, L: tone(cr, L), kind='rect', bevel=3.0, corner=1.4)
    cv.rect(2, 16, 19, 18, cr[1])
    cv.rect(2, 16, 19, 16, dk(cr[1], 0.2))
    cv.rect(4, 18, 9, 18, hx('#b8c0cc'))
    cv.rect(4, 17, 9, 17, hx('#e8f0f8'))
    for x in range(4, 18, 2):
        cv.set(x, 3, cr[1])
    cv.outline()
    return cv


def p_oven():
    cv = Cv(22, 20)
    st = ramp('#d6d8de', 0.42, 0.2, 0.4)
    fill_shape(cv, 11.0, 9.5, 10.0, 8.5, lambda u, v, L: tone(st, L), kind='rect', bevel=2.0, corner=1.4)
    cv.rect(2, 2, 19, 13, hx('#26222c'))
    for (bx, by, on) in [(6.0, 5.0, False), (15.0, 5.0, True), (6.0, 11.0, False), (15.0, 11.0, False)]:
        ring(cv, bx, by, 1.6, 2.9, lambda dx, dy, d: hx('#5a5866') if light(dx / d, dy / d) > 0.5 else hx('#3e3c48'))
        if on:
            ring(cv, bx, by, 1.4, 2.6, lambda dx, dy, d: hx('#ff6b1a') if (int(d * 2) % 2 == 0) else hx('#ffb03a'))
        cv.set(int(bx), int(by), hx('#14121a'))
    for x in (4, 8, 13, 17):
        cv.set(x, 16, hx('#2a2632'))
        cv.set(x, 15, st[3])
    cv.set(10, 16, hx('#ff2a3a'))
    cv.outline()
    return cv


def p_sink():
    cv = Cv(24, 14)
    st = ramp('#a8b0bc', 0.45, 0.2, 0.4)
    fill_shape(cv, 12.0, 7.0, 11.0, 6.0, lambda u, v, L: tone(st, L), kind='rect', bevel=1.5, corner=1.0)
    for bx in (6.5, 17.5):
        fill_shape(cv, bx, 8.0, 4.4, 4.0, lambda u, v, L: tone(ramp('#6a7280', 0.5, 0.25, 0.25), 1.0 - L * 0.9),
                   kind='rect', bevel=2.5, corner=1.6)
        cv.set(int(bx), 8, hx('#2a2a34'))
    cv.rect(11, 1, 12, 4, hx('#d8e0ea'))
    cv.set(11, 4, hx('#f8ffff'))
    cv.set(9, 2, hx('#2a8af0'))
    cv.set(14, 2, hx('#f03a3a'))
    cv.outline()
    return cv


def p_toilet():
    cv = Cv(12, 16)
    wh = ramp('#eeeef4', 0.4, 0.18, 0.2)
    fill_shape(cv, 6.0, 10.0, 4.4, 5.3, lambda u, v, L: tone(wh, L))
    fill_shape(cv, 6.0, 10.4, 2.6, 3.4, lambda u, v, L: hx('#8ecfe4') if L < 0.75 else hx('#c4ecf6'))
    cv.set(6, 11, hx('#5aa8c8'))
    cv.outline()
    tank = Cv(12, 16)
    fill_shape(tank, 6.0, 3.0, 5.0, 2.2, lambda u, v, L: tone(wh, L), kind='rect', bevel=1.4, corner=1.0)
    tank.set(8, 2, hx('#b8bcc8'))
    tank.outline()
    cv.over(tank)
    return cv


def p_bed():
    cv = Cv(30, 44)
    wood_fill(cv, 1, 1, 28, 42, hx('#5a3424'), plank=4, rng=random.Random(14), vertical=True)
    cv.rect(1, 1, 28, 3, hx('#3e2418'))
    sheet = ramp('#6a2a9a', 0.5, 0.25, 0.35)
    mat = Cv(30, 44)
    fill_shape(mat, 15.0, 23.0, 12.6, 18.6, lambda u, v, L: hx('#ece6f0'), kind='rect', corner=1.5)
    fill_shape(mat, 15.0, 7.5, 9.6, 3.4, lambda u, v, L: tone(WHITE, L), kind='rect', bevel=2.5, corner=2.0)
    mat.set(12, 7, WHITE[1])
    mat.set(18, 8, WHITE[1])
    mat.outline(dk(hx('#5a3424'), 0.5))
    cv.over(mat)
    duv = Cv(30, 44)
    rng = random.Random(15)
    wr = [(rng.randint(5, 24), rng.randint(17, 38)) for _ in range(6)]

    def dpx(u, v, L):
        if v < -15.0:
            return tone(WHITE, L)
        c = tone(sheet, L)
        return c
    fill_shape(duv, 15.0, 28.5, 13.0, 13.6, dpx, kind='rect', bevel=3.0, corner=1.5)
    for (x, y) in wr:
        for k in range(3):
            if duv.on(x + k, y + k):
                duv.set(x + k, y + k, sheet[1])
            if duv.on(x + k + 1, y + k):
                duv.set(x + k + 1, y + k, sheet[3])
    duv.outline()
    cv.over(duv)
    cv.outline()
    return cv


def p_pool_table():
    cv = Cv(64, 36)
    wood_fill(cv, 1, 1, 62, 34, hx('#6e3a1c'), plank=3, rng=random.Random(16))
    bevel_edges(cv, 1, 1, 62, 34, 0.25, 0.35)
    felt = ramp('#1f7a4c', 0.45, 0.2, 0.15)
    fn = VNoise(64, 36, 4, random.Random(17))
    cv.rect(5, 5, 58, 30, felt[1])
    for y in range(6, 30):
        for x in range(6, 58):
            c = felt[2]
            if fn(x, y) > 0.72:
                c = shift(c, 6)
            cv.set(x, y, c)
    for x in range(6, 58):
        cv.set(x, 6, felt[1])
    for y in range(6, 30):
        cv.set(6, y, felt[1])
    for (px, py) in [(5.5, 5.5), (32.0, 4.8), (58.5, 5.5), (5.5, 30.5), (32.0, 31.2), (58.5, 30.5)]:
        fill_shape(cv, px, py, 2.3, 2.3, lambda u, v, L: hx('#0c0a10') if L < 0.85 else hx('#2a2430'))
    for x in (12, 19, 25, 39, 45, 52):
        cv.set(x, 2, hx('#f0e6c8'))
        cv.set(x, 33, hx('#f0e6c8'))
    for y in (12, 18, 24):
        cv.set(2, y, hx('#f0e6c8'))
        cv.set(61, y, hx('#f0e6c8'))
    balls = Cv(64, 36)
    for (bx, by, col) in [(44.5, 18.5, '#f9c80e'), (46.5, 17.2, '#d02030'), (46.5, 19.8, '#2a5ad8'),
                          (48.6, 16.0, '#7a1fa2'), (48.6, 18.5, '#101018'), (48.6, 21.0, '#ff6b1a'),
                          (16.5, 17.5, '#f4f2ea'), (36.0, 25.0, '#1a9a4a')]:
        r_ = ramp(col, 0.45, 0.2, 0.45)
        fill_shape(balls, bx, by, 1.5, 1.5, lambda u, v, L, r_=r_: tone(r_, L))
    balls.outline(hx('#0a2a18'))
    cv.over(balls)
    # cue stick
    stick = Cv(64, 36)
    fill_capsule(stick, [(4.0, 31.0), (14.0, 19.4)], 0.6, lambda k, L, s, i, t: hx('#f0d8a8') if t > 0.9 else hx('#c08850'))
    stick.outline()
    cv.over(stick)
    cv.outline()
    return cv


def p_arcade():
    cv, gl = Cv(20, 16), Cv(20, 16)
    cab = ramp('#2c1e44', 0.5, 0.2, 0.35)
    fill_shape(cv, 10.0, 6.0, 8.6, 5.2, lambda u, v, L: tone(cab, L), kind='rect', bevel=2.0, corner=1.0)
    marquee = [hx('#ff2a6d'), hx('#ff6b1a'), hx('#f9c80e')]
    for x in range(3, 17):     # lit marquee at the back
        for y in (1, 2):
            c = lt(marquee[(x // 2 + y) % 3], 0.25)
            cv.set(x, y, c)
            gl.set(x, y, c)
    for y in range(3, 9):      # side art tubes
        for x, col in ((2, NEON_PINK), (17, NEON_CYAN)):
            cv.set(x, y, lt(col, 0.2))
            gl.set(x, y, col)
    screen = ["............",
              ".c.c.c..ww..",
              "..p.p.p.....",
              ".....y......",
              "....ggg..p..",
              "....g.g....."]
    scol = {'c': NEON_CYAN, 'p': NEON_PINK, 'w': hx('#f4f0ff'), 'y': hx('#f9c80e'), 'g': hx('#3aff8a')}
    for j, row in enumerate(screen):
        for i, ch in enumerate(row):
            x, y = 4 + i, 4 + j
            c = scol[ch] if ch != '.' else (hx('#0c1030') if (y % 2) else hx('#141a44'))
            cv.set(x, y, c)
            gl.set(x, y, c if ch != '.' else (40, 70, 170, 150))
    panel = Cv(20, 16)
    fill_shape(panel, 10.0, 12.6, 7.5, 1.9, lambda u, v, L: tone(ramp('#3e3650'), L), kind='rect', bevel=1.2, corner=0.8)
    for (x, y, c) in [(6, 12, '#ff3a3a'), (6, 13, '#a01820'), (11, 13, '#05d9e8'), (13, 13, '#f9c80e'),
                      (15, 13, '#ff2a6d')]:
        panel.set(x, y, hx(c))
        if (x, y) != (6, 13):
            gl.set(x, y, hx(c))
    panel.outline()
    cv.outline()
    cv.over(panel)
    return cv, gl


def p_crate():
    cv = Cv(18, 18)
    w = ramp('#b47a42', 0.45, 0.22, 0.3)
    wood_fill(cv, 1, 1, 16, 16, w[2], plank=4, rng=random.Random(18))
    fr = Cv(18, 18)
    for i in range(1, 17):
        for (x, y) in [(i, 1), (i, 2), (i, 15), (i, 16), (1, i), (2, i), (15, i), (16, i)]:
            fr.set(x, y, w[3] if (x <= 2 or y <= 2) and not (x >= 15 or y >= 15) else w[1])
    fill_capsule(fr, [(3.5, 3.5), (14.5, 14.5)], 1.1, lambda k, L, s, i, t: w[3] if s < 0 else w[1])
    for (x, y) in [(2, 2), (15, 2), (2, 15), (15, 15)]:
        fr.set(x, y, hx('#5a5a66'))
    cv.over(fr)
    cv.outline()
    return cv


def p_barrel():
    cv = Cv(14, 14)
    red = ramp('#d8202c', 0.55, 0.28, 0.35)
    c = 7.0
    fill_shape(cv, c, c, 6.0, 6.0, lambda u, v, L: red[1])
    # raised rim: lit top-left, shadowed bottom-right; inner groove inverted
    ring(cv, c, c, 4.6, 6.1, lambda dx, dy, d: tone(red, light(dx / d * 0.95, dy / d * 0.95)))
    ring(cv, c, c, 3.9, 4.6, lambda dx, dy, d: red[0] if light(dx / d, dy / d) > 0.5 else red[3])
    # yellow hazard diamond with a black flame
    for y in range(14):
        for x in range(14):
            d = abs(x + 0.5 - c) + abs(y + 0.5 - c)
            if d <= 3.6:
                cv.set(x, y, hx('#f9c80e') if d <= 3.0 else hx('#1a1420'))
    for (x, y) in [(7, 5), (6, 6), (7, 6), (6, 7), (7, 7), (8, 7)]:
        cv.set(x, y, hx('#1a1420'))
    cv.set(7, 7, hx('#ff6b1a'))
    cv.set(5, 5, hx('#fff2a0'))
    cv.set(10, 3, hx('#9a9aaa'))   # bung cap
    cv.set(10, 4, hx('#5a5a6a'))
    cv.outline()
    return cv


def p_bookshelf():
    cv = Cv(40, 10)
    wood = ramp('#5a3420', 0.45, 0.22, 0.3)
    cv.rect(1, 1, 38, 8, wood[2])
    cv.rect(1, 1, 38, 1, wood[3])
    cv.rect(1, 8, 38, 8, wood[1])
    rng = random.Random(19)
    cols = ['#b8262c', '#2a5ad8', '#e6c860', '#2c8a5a', '#7a1fa2', '#e8e0d0', '#ff6b1a', '#1fb5b5', '#3a2a44']
    x = 2
    while x < 38:
        if x in (13, 26):
            cv.rect(x, 2, x, 7, wood[1])
            x += 1
            continue
        bw = rng.choice([1, 1, 2, 2, 3])
        depth = rng.choice([4, 5, 5, 6])
        col = hx(rng.choice(cols))
        for xx in range(x, min(x + bw, 38)):
            if xx in (13, 26):
                break
            for y in range(2, 2 + depth):
                cv.set(xx, y, col if y > 2 else lt(col, 0.3))
            cv.set(xx, 2 + depth - 1, dk(col, 0.3))
        x += bw
    cv.outline()
    return cv


def p_speaker():
    cv = Cv(14, 14)
    fill_shape(cv, 7.0, 7.0, 6.0, 6.0, lambda u, v, L: tone(ramp('#2a2632', 0.5, 0.2, 0.3), L),
               kind='rect', bevel=1.5, corner=1.0)
    ring(cv, 7.0, 7.0, 3.9, 5.1, lambda dx, dy, d: tone(ramp('#55526a'), light(dx / d * 0.8, dy / d * 0.8)))
    fill_shape(cv, 7.0, 7.0, 3.9, 3.9, lambda u, v, L: tone(ramp('#1a1820', 0.3, 0.15, 0.6), 1.0 - L))
    fill_shape(cv, 7.0, 7.0, 1.5, 1.5, lambda u, v, L: tone(ramp('#5a5868', 0.4, 0.2, 0.4), L))
    for (x, y) in [(1, 1), (12, 1), (1, 12), (12, 12)]:
        cv.set(x, y, hx('#8a8a9a'))
    cv.outline()
    return cv


def p_dj_booth():
    cv = Cv(48, 18)
    desk = ramp('#1e1a28', 0.4, 0.2, 0.4)
    fill_shape(cv, 24.0, 8.0, 23.0, 7.0, lambda u, v, L: tone(desk, L), kind='rect', bevel=1.6, corner=1.0)
    for tx in (10.5, 37.5):
        fill_shape(cv, tx, 7.5, 6.6, 5.6, lambda u, v, L: tone(ramp('#5a5a6a'), L), kind='rect', bevel=1.5, corner=1.0)
        ring(cv, tx - 0.5, 7.5, 0.0, 4.8, lambda dx, dy, d: hx('#1a1820') if int(d) % 2 else hx('#0e0c12'))
        circle(cv, tx - 0.5, 7.5, 1.4, hx('#ff2a6d') if tx < 20 else hx('#05d9e8'))
        cv.set(int(tx - 1), 7, hx('#f0f0f8'))
        fill_capsule(cv, [(tx + 5.0, 3.0), (tx + 4.4, 8.0), (tx + 2.8, 10.0)], 0.5, lambda k, L, s, i, t: hx('#d8dce8'))
    cv.rect(20, 3, 27, 12, hx('#34323e'))
    for x in (21, 23, 25):
        cv.rect(x, 4, x, 9, hx('#14121a'))
        cv.set(x, 5 + (x % 3), hx('#e8e8f0'))
    for x in (26, 27):
        cv.set(x, 4, hx('#f9c80e'))
        cv.set(x, 6, hx('#05d9e8'))
    cv.rect(21, 11, 26, 11, hx('#14121a'))
    cv.set(23, 11, hx('#e8e8f0'))
    cv.outline()
    leds = ['#ff2a6d', '#05d9e8', '#f9c80e']
    for i, x in enumerate(range(3, 46, 3)):
        cv.set(x, 14, hx(leds[i % 3]))
    for x in range(2, 46):
        cv.set(x, 15, hx('#ff2a6d') if x % 2 else hx('#ff5a8d'))
        cv.set(x, 16, (255, 42, 109, 120))
    cv.set(1, 15, OUTLINE)
    cv.set(46, 15, OUTLINE)
    return cv


def p_bar_counter():
    cv = Cv(32, 14)
    wood = ramp('#4a2418', 0.45, 0.2, 0.3)
    rng = random.Random(20)
    grain = [[rng.choice([0, 0, 0, 0, -1, 1]) for _ in range(32)] for _ in range(14)]
    for y in range(1, 10):
        for x in range(32):
            c = wood[2]
            g = grain[y][x // 4 * 4 % 32]
            c = shift(c, g * 6)
            if y == 1:
                c = wood[3]
            if y == 3 and (x % 16) in (2, 3, 4, 5, 6, 7):
                c = lt(c, 0.12)
            if y == 9:
                c = wood[1]
            cv.set(x, y, c)
    for x in range(32):
        cv.set(x, 0, OUTLINE)
        cv.set(x, 10, wood[0])
        cv.set(x, 11, BRASS[3] if x % 8 != 0 else BRASS[2])
        cv.set(x, 12, BRASS[1])
        cv.set(x, 13, OUTLINE)
    for x in (8, 24):
        cv.set(x, 10, BRASS[0])
    return cv


def p_dumpster():
    cv = Cv(36, 22)
    g = ramp('#2f7040', 0.5, 0.25, 0.3)
    fill_shape(cv, 18.0, 11.0, 17.0, 10.0, lambda u, v, L: g[1], kind='rect', corner=1.0)
    lid = Cv(36, 22)
    for (x0, x1) in [(2, 17), (18, 33)]:
        for y in range(3, 19):
            for x in range(x0, x1 + 1):
                c = g[2]
                if (y - 3) % 4 == 0:
                    c = g[3]
                elif (y - 3) % 4 == 3:
                    c = g[1]
                if x == x0:
                    c = lt(c, 0.1)
                if x == x1:
                    c = dk(c, 0.2)
                lid.set(x, y, c)
    cv.over(lid)
    cv.rect(1, 1, 34, 2, g[0])
    for x in range(3, 34, 5):
        cv.set(x, 1, hx('#8a8a96'))
    rng = random.Random(21)
    for _ in range(14):
        x, y = rng.randint(2, 33), rng.randint(3, 19)
        cv.set(x, y, hx('#8a4a22') if rng.random() < 0.6 else hx('#5a3018'))
    cv.outline()
    return cv


def p_trash_can():
    cv = Cv(12, 12)
    m = ramp('#5a606c', 0.5, 0.25, 0.35)
    fill_shape(cv, 6.0, 6.0, 5.0, 5.0, lambda u, v, L: tone(m, L))
    ring(cv, 6.0, 6.0, 2.5, 3.4, lambda dx, dy, d: m[1] if light(dx / d, dy / d) < 0.6 else m[3])
    cv.rect(4, 6, 7, 6, m[0])
    cv.rect(4, 5, 7, 5, m[3])
    cv.outline()
    return cv


# --------------------------------------------------------------------------
# Tiles (32x32, seamless, 1 tile = 1 m). The scene is later darkened and lit by
# the neon pass (coloured lights, wet reflections) and the map adds its own
# large-scale grime, so the tiles stay calm: mid-tones, low local contrast, fine
# isotropic grain and nothing sitting at a fixed spot that would show the 32 px
# repeat. Base painters wrap every coordinate; variants copy the base and only
# touch the inside of a 2 px margin (asserted), fading their changes to zero.
# --------------------------------------------------------------------------

T = 32
VM = 2   # variant margin


def wset(cv, x, y, c):
    cv.p[int(x) % cv.w, int(y) % cv.h] = c


def wget(cv, x, y):
    return cv.p[int(x) % cv.w, int(y) % cv.h]


def pal(cols, t):
    """Piecewise blend through a list of colours, t in 0..1."""
    t = max(0.0, min(1.0, t)) * (len(cols) - 1)
    i = min(int(t), len(cols) - 2)
    return mix(cols[i], cols[i + 1], t - i)


def inside(x, y, m=VM):
    return m <= x < T - m and m <= y < T - m


def smooth(t):
    t = max(0.0, min(1.0, t))
    return t * t * (3 - 2 * t)


def noise(rng, rx=0, ry=None, passes=2):
    """Wrapped white noise, box-blurred by (rx, ry), normalised to mean 0 / std 1 and clamped
    to +-2.2 so no single blob stands out (it would mark the 32 px repeat)."""
    ry = rx if ry is None else ry
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
    """Random sparse pixel set (aggregate stones, pores, fibres)."""
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
    out = {}
    for y in range(VM, T - VM):
        for x in range(VM, T - VM):
            dx, dy = (x + 0.5 - cx) / rx, (y + 0.5 - cy) / ry
            a = math.atan2(dy, dx)
            e = math.hypot(dx, dy) / (1.0 + sum(amp * math.sin(a * k + ph) for ph, amp, k in harm))
            edge = min(x - VM + 1, T - VM - x, y - VM + 1, T - VM - y) / 3.0
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
            w = smooth((min(x, T - 1 - x, y, T - 1 - y) - 1.5) / 3.0)
            if w > 0:
                cv.set(x, y, mix(cv.get(x, y), fresh.get(x, y), w))


def scratch(cv, rng, x, y, ang, n, d, curve=0.25):
    """Thin faint line (scuff, hairline crack, tar seam) kept inside the variant margin."""
    fx, fy = x + 0.5, y + 0.5
    for i in range(n):
        ix, iy = int(math.floor(fx)), int(math.floor(fy))
        if not inside(ix, iy, VM + 1):
            break
        k = smooth(min(i + 1, n - i) / 2.5)   # taper both ends
        cv.set(ix, iy, tint(cv.get(ix, iy), d * k))
        ang += rng.uniform(-curve, curve)
        fx += math.cos(ang)
        fy += math.sin(ang)


# ---- wood: staggered planks along x, fine streaky grain --------------------------

FL_WOOD = hx('#7c5538')
FL_WOOD_ROWS = [5, 6, 5, 5, 6, 5]   # plank widths (px) -> 16-19 cm boards


def wood_rows():
    rows, y0 = [], 0
    for hgt in FL_WOOD_ROWS:
        rows.append((y0, hgt))
        y0 += hgt
    return rows


def wood_joint(cv, x, y0, hgt, d=-12):
    for y in range(y0, y0 + hgt - 1):
        cv.set(x, y, tint(cv.get(x, y), d))


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
                d = tone + slope * (((x - joints[r]) % T) / T - 0.5) + grain[y][x] * 3.5 + fine[y][x] * 1.5
                if yy == 0:
                    d += 2
                if yy == hgt - 1:
                    d -= 13                 # seam between boards
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
    for x in range(a + 1, b):
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
        gx, gy = x % 16, y % 16
        if gx == 0 or gy == 0:
            return tint(FL_GROUT, d * 0.6)
        c = tint(c, glaze[y][x] * 1.2)
        if gx == 1 or gy == 1:
            c = tint(c, 3)
        elif gx == 15 or gy == 15:
            c = tint(c, -3)
        return c
    surface(cv, FL_TILE_B, rng, 1.6, 1.0, 1, fn=fn)


def v_tile_blue1(cv, rng):
    # grimy grout along part of one joint
    y0 = rng.randint(4, 10)
    for y in range(y0, y0 + rng.randint(10, 16)):
        k = smooth(min(y - y0 + 1, 3) / 3.0)
        cv.set(16, y, tint(cv.get(16, y), -5 * k, hx('#6a6a58'), 0.12 * k))


def v_tile_blue2(cv, rng):
    # chipped corner where four tiles meet + a short hairline
    for (dx, dy, d) in [(1, 1, -16), (2, 1, -9), (1, 2, -9), (-1, 1, -6)]:
        cv.set(16 + dx, 16 + dy, tint(cv.get(16 + dx, 16 + dy), d, FL_GROUT, 0.4))
    scratch(cv, rng, 18, 18, rng.uniform(0.5, 1.0), 6, -8, 0.3)


# ---- carpets: low-contrast pile, tiny soft motif ---------------------------------

def t_carpet_red(cv, rng):
    base = hx('#80303e')

    def fn(x, y, c, d):
        if (x % 8, y % 8) in ((0, 0), (4, 4)):          # tiny soft diamond lattice
            return tint(c, 5, hx('#a8704a'), 0.12)
        if (x % 8, y % 8) in ((2, 2), (6, 6), (2, 6), (6, 2)):
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
LINE_Y = (15, 16, 17)
FL_LINE_COL = hx('#cfae4c')


def t_asphalt(cv, rng, line=False):
    agg = speck(rng, 0.045)
    surface(cv, FL_ASPHALT, rng, 3.6, 1.3, 1, dark=(0.04, 11),
            fn=lambda x, y, c, d: tint(c, 9, hx('#8a8680'), 0.15) if (x, y) in agg else c)
    if line:
        wear = noise(rng)
        for x in range(T):
            for y in LINE_Y:
                g = cv.get(x, y)
                c = mix(FL_LINE_COL, g, 0.12 if y == 16 else 0.24)
                c = tint(c, (sum(g[:3]) / 3 - sum(FL_ASPHALT[:3]) / 3) * 0.4)   # grain shows through the paint
                if wear[y][x] > 1.8:
                    c = mix(c, g, 0.4)                                      # worn flecks
                cv.set(x, y, c)


def worn_line(cv, rng, x0, x1, k):
    for x in range(x0, x1):
        f = smooth(min(x - x0 + 1, x1 - x) / 4.0) * k
        for y in LINE_Y:
            if rng.random() < 0.7:
                cv.set(x, y, mix(cv.get(x, y), tint(FL_ASPHALT, rng.uniform(-3, 3)), f))


def tar_seam(cv, rng, x, y, ang, n):
    """Sealed crack: a soft, slightly darker meandering band."""
    fx, fy = x + 0.5, y + 0.5
    for i in range(n):
        ix, iy = int(math.floor(fx)), int(math.floor(fy))
        k = smooth(min(i + 1, n - i) / 3.0)
        for (dx, dy, d) in ((0, 0, -8), (0, 1, -4)):
            if inside(ix + dx, iy + dy, VM + 1):
                cv.set(ix + dx, iy + dy, tint(cv.get(ix + dx, iy + dy), d * k, hx('#3a3a48'), 0.15 * k))
        ang += rng.uniform(-0.3, 0.3)
        fx += math.cos(ang)
        fy += math.sin(ang)


def v_asphalt1(cv, rng):
    # a few loose aggregate pits (the re-rolled grain does the rest)
    for _ in range(5):
        x, y = rng.randint(4, 27), rng.randint(4, 27)
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
        x, y = rng.randint(8, 22), rng.randint(8, 22)
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
        x, y = rng.randint(5, 26), rng.randint(5, 26)
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
    gx, gy = x % 16, y % 16
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
        gx, gy = x % 16, y % 16
        dxl, dyl = min(gx, 16 - gx), min(gy, 16 - gy)
        c = mix(c, JOINT_V, [0, 0.16, 0.05][min(2, dxl)])
        return mix(c, JOINT_H, [0, 0.16, 0.05][min(2, dyl)])
    surface(cv, FL_PANEL, rng, 1.6, 1.8, 2, fn=fn)


def neon_glow():
    cv = Cv(32, 32)
    for y in range(32):
        for x in range(32):
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
    for y in range(py * 16 + 2, py * 16 + 15):
        for x in range(px * 16 + 2, px * 16 + 15):
            if inside(x, y):
                d = max(abs(x + 0.5 - px * 16 - 8), abs(y + 0.5 - py * 16 - 8)) / 7.0
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
WALL_TILES = [('wall', t_wall), ('brick', t_brick)]


def tiles():
    out = {}
    for i, (name, base_fn, v1, v2) in enumerate(FLOOR_TILES):
        base = Cv(32, 32)
        base_fn(base, random.Random(500 + i))
        out[name] = base
        for k, fn in ((1, v1), (2, v2)):
            cv = Cv(32, 32)
            cv.img = base.img.copy()
            cv.p = cv.img.load()
            fresh = Cv(32, 32)
            base_fn(fresh, random.Random(900 + i * 10 + k))
            reroll(cv, fresh)
            fn(cv, random.Random(700 + i * 10 + k))
            for y in range(32):
                for x in range(32):
                    if not inside(x, y):
                        assert cv.p[x, y] == base.p[x, y], '%s_v%d touches its border at %d,%d' % (name, k, x, y)
            out['%s_v%d' % (name, k)] = cv
    for i, (name, fn) in enumerate(WALL_TILES):
        cv = Cv(32, 32)
        fn(cv, random.Random(600 + i))
        out[name] = cv
    out['neon_floor_glow'] = neon_glow()
    return out


# --------------------------------------------------------------------------
# Ragdoll segments (intact, they match each character's palette)
# --------------------------------------------------------------------------

def rag_torso(ch):
    cv = Cv(14, 16)
    k = ch['kind']
    hx_, hy_ = 6.9, 5.9

    def px(u, v, L):
        i = tidx(L)
        if u < -hx_ + 2.3:     # belt + top of the trousers
            if u > -hx_ + 1.3:
                if abs(v) < 0.9:
                    return BRASS[3] if L > 0.6 else BRASS[2]
                return hx('#1a1420') if k != 'heavy' else ch['pants'][max(0, i - 1)]
            return ch['pants'][i]
        if u > hx_ - 1.3 and abs(v) < 1.3:
            return ch['skin'][max(1, i)]      # neck
        return chest_px(ch, u, v, L, hx_, hy_)
    fill_shape(cv, 7.0, 8.0, hx_, hy_, px, ang=-math.pi / 2, kind='rect', bevel=2.2, corner=1.8, taper=0.2)
    if k == 'thug':
        for (x, y) in [(5, 6), (8, 6)]:
            cv.set(x, y, ch['top'][3])    # lapels
    if k == 'player':
        cv.set(4, 9, hx('#ff2a6d'))       # pin badge
    cv.outline()
    return cv


def rag_head(ch):
    cv = Cv(9, 9)
    hr = 3.5
    fill_shape(cv, 4.5, 4.5, hr, hr, lambda u, v, L: head_top_px(ch, u, v, L, hr), pad=0.08)
    k = ch['kind']
    if k == 'player':
        for (x, y) in [(1, 3), (1, 5), (2, 1), (2, 7)]:
            cv.set(x, y, ch['hair'][1])
        cv.set(7, 3, hx('#0e0a16'))
        cv.set(7, 4, hx('#0e0a16'))
        cv.set(7, 5, hx('#0e0a16'))
        cv.set(7, 3, hx('#36e8f0'))
    if k == 'brute':
        cv.set(1, 4, ch['bandana'][1])
        cv.set(0, 5, ch['bandana'][0])
    cv.set(5, 0, ch['skin'][1])
    cv.set(5, 8, ch['skin'][1])
    cv.outline()
    return cv


def rag_arm(ch):
    k = ch['kind']
    s = ch['skin'] if k == 'brute' else ch['top']
    pal_ = {'a': s[3], 'S': s[2], 'd': s[1], 'c': s[0], 'h': ch['skin'][3], 'H': ch['skin'][2], 'k': ch['skin'][1],
            'w': WHITE[2], 'W': WHITE[1], 'r': ch.get('bandana', s)[2]}
    rows = {'player': [".aSSSSSwHh.", ".dddddWWkk."],
            'thug': [".aSSSSSwHh.", ".ddddddWkk."],
            'heavy': [".aSSSSSSHh.", ".wwwwwwwkk."],
            'brute': [".rSSSSSSHh.", ".rddddddkk."]}[k]
    rows = ["..........."] + rows + ["..........."]
    return ascii_cv(rows, pal_)


def rag_leg(ch):
    p, sh = ch['pants'], ch['shoe']
    pal_ = {'P': p[3], 'p': p[2], 'q': p[1], 'Q': p[0], 'O': sh[3], 'o': sh[2], 'x': sh[1], 'X': sh[0],
            's': WHITE[2]}
    rows = [".............",
            ".PppppppqOOo.",
            ".pppppppqoox.",
            ".qqqqqqqQxxX.",
            "............."]
    if ch['kind'] == 'heavy':
        rows[1] = ".PpppppppOOo."
        rows[2] = ".ssssssssoox."
    return ascii_cv(rows, pal_)


# --------------------------------------------------------------------------
# Magazines, shell boxes and ammo pickups (+x = bullet tips)
# --------------------------------------------------------------------------

def mags():
    out = {}
    st = {'O': OUTLINE, 'L': STEEL_L[3], 'M': STEEL_L[1], 'D': STEEL[0], 'B': BRASS[3], 'b': BRASS[2],
          'c': hx('#e07a3a'), 'K': hx('#0e0a14')}
    out['mag_pistol'] = ascii_cv(["Obc", "LMD", "LMD", "LMD", "LMD", "KKK"], st, ol=None)
    out['mag_uzi'] = ascii_cv(["Obc", "LMD", "LMD", "LMD", "LMD", "LMD", "LMD", "LMD", "KKK"], st, ol=None)
    ak = ramp('#d0602a', 0.5, 0.25, 0.35)
    out['mag_rifle'] = ascii_cv(["Obc.", "LMD.", "LMD.", "LMMD", ".LMD", ".LMD", ".LMD", ".LMD", ".KKK"],
                                dict(st, L=ak[3], M=ak[2], D=ak[0]), ol=None)
    pol = ramp('#3a3e2c', 0.4, 0.2, 0.45)
    out['mag_sniper'] = ascii_cv(["Obc", "LMD", "LMD", "LMD", "LMD", "KKK"], dict(st, L=pol[3], M=pol[2], D=pol[0]),
                                 ol=None)
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
    """One vehicle sprite + glow map. Rows are given on the top side (y < cy) and mirrored."""

    def __init__(self, w, h, cy, seed):
        self.cv, self.gl = Cv(w, h), Cv(w, h)
        self.cy = cy
        self.rng = random.Random(seed)
        self.mask, self.glass, self.half = set(), set(), {}

    def v(self, y):
        return y + 0.5 - self.cy

    def m(self, y):
        return 2 * self.cy - 1 - y

    def put(self, x, y, c, both=True):
        """c: colour or fn(current, side) with side -1 on the top half, +1 on the bottom half."""
        for yy in ((y, self.m(y)) if both else (y,)):
            col = c(self.cv.get(x, yy), -1 if yy < self.cy else 1) if callable(c) else c
            self.cv.set(x, yy, col)

    def line(self, x0, y0, x1, y1, c, both=True):
        n = max(abs(x1 - x0), abs(y1 - y0), 1)
        for i in range(n + 1):
            self.put(int(round(x0 + (x1 - x0) * i / n)), int(round(y0 + (y1 - y0) * i / n)), c, both)

    def rows(self, x, v0, v1):
        """Top-side rows at column x whose |v| lies in (v0, v1]."""
        return [y for y in range(self.cy) if v0 < -self.v(y) <= v1]

    def shell(self, body, x0, x1, hw, cr_rear, cr_front, nose=0, pinch=0.0, crown=3.0):
        """Body shell: rounded box (pinched toward the nose for a wedge), domed across, rolled at both ends."""
        for x in range(x0, x1 + 1):
            u_r, u_f = x - x0, x1 - x
            h = hw - (pinch * ((x - (x1 - nose)) / nose) ** 2 if nose and x > x1 - nose else 0.0)
            self.half[x] = h
            cr = cr_rear if u_r < u_f else cr_front
            for y in range(self.cv.h):
                v = self.v(y)
                ex, ey = cr - min(u_r, u_f) - 0.5, abs(v) - (h - cr)
                if abs(v) > h or (ex > 0 and ey > 0 and ex * ex + ey * ey > cr * cr):
                    continue
                end = max(0.0, 1.0 - min(u_r, u_f) / 9.0) ** 1.5
                L = light((-end if u_r < u_f else end) * 0.8, math.copysign((abs(v) / h) ** crown, v) * 0.95) - v / h * 0.1
                self.cv.set(x, y, soft(body, L))
                self.mask.add((x, y))

    def panel(self, body, x0, x1, hw, r=3, crown=2.5, lift=0.0):
        """Raised flat panel (roof): its own gentle dome, rounded corners."""
        for x in range(x0, x1 + 1):
            for y in self.rows(x, -1, hw):
                ex, ey = r - min(x - x0, x1 - x) - 0.5, -self.v(y) - (hw - r)
                if ex > 0 and ey > 0 and ex * ex + ey * ey > r * r:
                    continue
                for yy in (y, self.m(y)):
                    v = self.v(yy)
                    nv = math.copysign((abs(v) / hw) ** crown, v) * 0.7
                    self.cv.set(x, yy, soft(body, light(0.0, nv) + lift))

    def glass_col(self, x, y, x0, x1, h, sheen):
        t = (self.v(y) + h) / (2 * h)
        c = pal(GLASS, 0.8 - t * 0.65 + (x - x0) / max(1, x1 - x0) * 0.1)
        if sheen is not None:   # one soft diagonal reflection (and a faint neon one)
            s = (x - x0) + (self.v(y) + h) * 0.6 - sheen
            if 0 <= s < 2.5:
                c = mix(c, SHEEN, 0.3)
            elif -1 <= s < 0 or 2.5 <= s < 3.5:
                c = mix(c, SHEEN, 0.12)
            elif 7 <= s < 8:
                c = mix(c, NEON_SHEEN, 0.14)
        return c

    def trap(self, x0, x1, hw0, hw1, sheen=None):
        """Windshield / rear window: trapezoid of glass, half width hw0 at x0 to hw1 at x1."""
        for x in range(x0, x1 + 1):
            h = hw0 + (hw1 - hw0) * (x - x0) / max(1, x1 - x0)
            for y in self.rows(x, -1, h):
                for yy in (y, self.m(y)):
                    self.cv.set(x, yy, self.glass_col(x, yy, x0, x1, h, sheen))
                    self.glass.add((x, yy))

    def side(self, x0, x1, inner, outer, pillars=()):
        """Side windows seen at a grazing angle between the roof (inner(x)) and the beltline (outer)."""
        for x in range(x0, x1 + 1):
            if x in pillars:
                continue
            for y in self.rows(x, inner(x), outer):
                k = (-self.v(y) - inner(x)) / max(0.5, outer - inner(x))
                self.cv.set(x, y, pal(GLASS, 0.75 - k * 0.35))
                self.cv.set(x, self.m(y), pal(GLASS, 0.3 - k * 0.25))
                self.glass |= {(x, y), (x, self.m(y))}
        self.put(x0 + 3, self.rows(x0 + 3, inner(x0 + 3), outer)[-1], lambda c, s: mix(c, SHEEN, 0.35 if s < 0 else 0.1))

    def seal(self):
        """Rubber seals: body pixels touching glass get darker."""
        edge = {(x + a, y + b) for (x, y) in self.glass for a, b in ((1, 0), (-1, 0), (0, 1), (0, -1))}
        for p in sorted(edge - self.glass):
            if p in self.mask:
                self.cv.set(p[0], p[1], dk(self.cv.get(*p), 0.38))

    def arches(self, wheels, r=11):
        """Fender lips over the wheels: a lit crest and the flare falling away into shadow."""
        for wx in wheels:
            for x in range(wx - r, wx + r + 1):
                crest = self.half[x] - 3.5 + 2.2 * ((x - wx) / r) ** 2
                for y in self.rows(x, crest, 99):
                    if (x, y) in self.mask and (x, y) not in self.glass:
                        self.put(x, y, darken(0.2) if -self.v(y) > crest + 1 else ridge(0.14))

    def grime(self, wheels, amount=1.0, rust=6, scratches=3):
        """Road film on the sills and around the arches, a few rust specks and scratches."""
        n = VNoise(self.cv.w, self.cv.h, 7, self.rng)
        for (x, y) in sorted(self.mask - self.glass):
            v, hw = abs(self.v(y)), self.half[x]
            k = max(0.0, (v - (hw - 6)) / 6.0) * 0.4
            for wx in wheels:
                k += max(0.0, 1.0 - math.hypot((x - wx) / 1.5, hw - v) / 10.0) * 0.32
            k *= amount * (0.3 + 1.3 * n(x, y))
            if k > 0.03:
                self.cv.set(x, y, mix(self.cv.get(x, y), ROAD_DIRT, min(0.5, k)))
        for _ in range(rust):
            x = int(self.rng.choice(wheels) + self.rng.uniform(-13, 13))
            y = int(math.floor(self.cy - self.half[x] + self.rng.uniform(0.5, 3)))
            if self.rng.random() < 0.5:
                y = self.m(y)
            for i in range(self.rng.randint(1, 4)):
                p = (x + self.rng.randint(-1, 1) * (i > 0), y + self.rng.randint(-1, 1) * (i > 0))
                if p in self.mask:
                    self.cv.set(p[0], p[1], mix(self.cv.get(*p), RUST[self.rng.randint(0, 2)], 0.7))
        for _ in range(scratches):
            x = self.rng.randint(20, self.cv.w - 30)
            y = int(math.floor(self.cy - self.half[x] + self.rng.uniform(1.5, 4)))
            ln = self.rng.randint(4, 9)
            for i in range(ln):
                p = (x + i, y + (i * 2 > ln) * self.rng.choice((0, 0, 1)))
                if p in self.mask:
                    self.cv.set(p[0], p[1], lt(self.cv.get(*p), 0.22))

    def rim(self):
        """Lower edge a touch darker, upper edge catching the light."""
        for (x, y) in sorted(self.mask):
            if (x, y + 1) not in self.mask:
                self.cv.set(x, y, dk(self.cv.get(x, y), 0.25))
            elif (x, y - 1) not in self.mask:
                self.cv.set(x, y, lt(self.cv.get(x, y), 0.12))

    def lamp(self, x0, x1, y0, y1, col, glow, frame, back=None):
        """Light cluster (mirrored): framed lens, brighter top row; the lens goes into the glow map.
        back: the framed (inner) column, x0 by default (front lights)."""
        for y in range(y0, y1 + 1):
            for x in range(x0, x1 + 1):
                edge = y in (y0, y1) or x == (x0 if back is None else back)
                c = frame if edge else (lt(col, 0.45) if y == y0 + 1 else col)
                self.put(x, y, c)
                if not edge:
                    self.gl.set(x, y, glow)
                    self.gl.set(x, self.m(y), glow)

    def bumper(self, x0, x1, tones):
        """Bumper across the whole end, lit from the top."""
        for x in range(x0, x1 + 1):
            for y in range(self.cv.h):
                if (x, y) in self.mask:
                    t = 0.95 - (y / self.cv.h) * 0.75 - (0.15 if x in (x0, x1) and x0 != x1 else 0)
                    self.cv.set(x, y, pal(tones, t))

    def mirror(self, x0, x1, tones, glass_end):
        """Door mirror on its arm, sticking out past the body; the glass faces back."""
        y = min(y for (x, y) in self.mask if x0 <= x <= x1) - 1
        for x in range(x0, x1 + 1):
            self.put(x, y, GLASS[1] if x == glass_end else tones[3] if x == x0 + 1 else tones[2])

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
    k.line(42, 6, 90, 6, lambda c, s: mix(c, CHROME[2 if s < 0 else 1], 0.55))   # beltline trim
    for x in (40, 65, 90):                                   # door seams
        k.line(x, 2, x, 5, darken(0.4))
    for x in (45, 69):                                       # door handles
        k.line(x, 4, x + 2, 4, lambda c, s: CHROME[3 if s < 0 else 2])
    k.line(6, 8, 6, 28, darken(0.4))                         # trunk lid
    k.line(6, 8, 33, 8, darken(0.4))
    k.line(9, 28, 10, 28, CHROME[2])                         # trunk lock
    k.line(98, 8, 98, 28, darken(0.45))                      # cowl gap
    k.line(98, 8, 133, 8, darken(0.4))                       # hood shut lines
    k.line(101, 20, 130, 20, ridge(0.18))                    # hood creases
    k.line(9, 20, 30, 20, ridge(0.15))                       # trunk lid crease
    k.put(131, 28, CHROME[3])                                # hood ornament
    k.line(96, 26, 95, 14, RUBBER[0], both=False)            # parked wipers
    k.line(96, 45, 95, 33, RUBBER[0], both=False)
    k.line(24, 3, 27, 3, darken(0.3), both=False)            # fuel filler flap
    k.line(24, 4, 27, 4, darken(0.15), both=False)
    k.put(20, 53, RUBBER[0], both=False)                     # antenna base
    k.put(21, 53, CHROME[2], both=False)
    k.grime(wheels)
    k.seal()
    k.rim()
    k.bumper(137, 138, CHROME)
    k.bumper(1, 2, CHROME)
    for x in (137, 138):                                     # rubber bumper guards
        k.line(x, 13, x, 15, RUBBER[1 if x == 137 else 0])
    for y in range(20, 29):                                  # grille
        for x in range(134, 137):
            k.put(x, y, CHROME[1] if y == 20 or x == 134 else RUBBER[0] if y % 2 else RUBBER[2])
    k.lamp(134, 136, 8, 13, HEAD_C, HEAD_GLOW, CHROME[2])     # quad headlights
    k.lamp(134, 136, 13, 18, HEAD_C, HEAD_GLOW, CHROME[2])
    k.line(135, 5, 136, 5, AMBER)
    k.line(135, 6, 136, 6, dk(AMBER, 0.2))
    k.lamp(3, 5, 5, 17, TAIL_C, TAIL_GLOW, hx('#7a0818'), back=5)      # wide tail lights
    k.line(4, 18, 5, 18, hx('#e8e4dc'))                       # reverse lights
    for y in range(23, 29):                                   # licence plate
        k.line(3, y, 4, y, PLATE if y > 23 else RUBBER[1])
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
    k.line(6, 4, 125, 4, lambda c, s: purp if s < 0 else dk(purp, 0.25))   # side stripe
    k.trap(22, 49, 14.5, 17.5, sheen=6)                      # fastback hatch glass
    k.trap(78, 98, 17.0, 21.0, sheen=5)                      # raked windshield
    k.panel(body, 50, 77, 17.5)                              # roof
    for x in range(53, 75):                                  # T-top: smoked panels around the centre bar
        for y in range(13, 25):
            c = pal(GLASS, 0.75 - (y - 13) / 11 * 0.45)
            if 9 <= (x - 53) + (y - 13) * 0.6 < 11.5:
                c = mix(c, SHEEN, 0.28)
            frame = x in (53, 74) or y in (13, 24)
            k.put(x, y, RUBBER[2] if frame else lambda cur, sd, c=c: c if sd < 0 else dk(c, 0.15))
    k.side(51, 85, lambda x: 17.5 if x <= 77 else 18.5 + (x - 78) / 5, 20.5, pillars=(62,))
    for x in (55, 93):                                       # long doors
        k.line(x, 2, x, 6, darken(0.4))
    k.line(58, 5, 60, 5, RUBBER[1])                          # flush handles
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
    k.line(97, 26, 96, 13, RUBBER[0], both=False)            # single wiper
    k.line(24, 2, 26, 2, darken(0.3), both=False)            # filler flap
    k.grime(wheels, amount=0.8, rust=3, scratches=2)
    k.seal()
    k.rim()
    for x in range(6, 12):                                   # rear wing on its endplates
        for y in range(3, 28):
            if y < 5:
                c = RUBBER[0]
            else:
                c = RUBBER[3] if x == 7 else RUBBER[2] if x < 10 else RUBBER[1] if x < 11 else RUBBER[0]
            if x > 6 or y < 5:
                k.put(x, y, c)
    k.line(12, 5, 12, 27, darken(0.35))
    k.bumper(1, 1, RUBBER)
    k.bumper(130, 132, RUBBER)
    for y in range(5, 28):                                   # full-width tail light bar, plate in the middle
        for x in (2, 3, 4):
            if y > 23 and x < 4:
                k.put(x, y, PLATE if y > 24 else RUBBER[1])
            else:
                lens = x > 2 and y > 5 and y % 3
                k.put(x, y, TAIL_C if lens else hx('#3a0818'))
                if lens and y < 24:
                    k.gl.set(x, y, TAIL_GLOW)
                    k.gl.set(x, k.m(y), TAIL_GLOW)
    k.lamp(120, 122, 10, 15, HEAD_C, HEAD_GLOW, RUBBER[1])   # pop-ups, up
    k.line(128, 24, 128, 27, RUBBER[0])                      # air intake
    k.line(129, 24, 129, 27, RUBBER[1])
    k.line(128, 6, 129, 6, AMBER)
    k.line(128, 7, 128, 8, dk(AMBER, 0.2))
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
        k.line(x, 8, x, 31, lambda c, s: lt(c, 0.1))
        k.line(x + 1, 8, x + 1, 31, darken(0.12))
    k.line(7, 7, 122, 7, darken(0.22))                       # drip rail
    for i, col in enumerate(sunset):                         # sunset side stripes
        k.line(8, 3 + i, 106 - i * 3, 3 + i, lambda c, s, col=col: col if s < 0 else dk(col, 0.2))
    k.trap(123, 137, 23.0, 26.5, sheen=3)                    # windshield
    k.side(111, 126, lambda x: 24.5 if x <= 122 else 24.5 + (x - 122) / 4, 27.0)
    for x in range(54, 67):                                  # smoked roof vent
        for y in range(25, 32):
            frame = x in (54, 66) or y == 25
            k.put(x, y, (CHROME[1] if y == 25 or x == 54 else RUBBER[1]) if frame
                  else k.glass_col(x, y, 54, 66, 7, sheen=3))
    for x in range(10, 39):                                  # roof rack: rails and rungs
        k.put(x, 15, CHROME[2] if x % 13 else CHROME[3])
        k.put(x, 16, darken(0.3))
    for x in (12, 25, 37):
        k.line(x, 16, x, 47, CHROME[2], both=False)
        k.line(x + 1, 17, x + 1, 47, darken(0.3), both=False)
    for x in (110, 138):                                     # cab doors
        k.line(x, 2, x, 7, darken(0.4))
    k.line(112, 4, 114, 4, CHROME[2])
    for x in (70, 108):                                      # sliding door (right side only)
        k.line(x, 56, x, 61, darken(0.4), both=False)
    k.line(70, 58, 108, 58, darken(0.15), both=False)
    k.line(138, 8, 138, 31, darken(0.45))                    # short hood
    k.line(138, 9, 153, 9, darken(0.4))
    k.line(140, 22, 152, 22, ridge(0.1))
    k.line(136, 30, 135, 13, RUBBER[0], both=False)          # wipers
    k.line(136, 50, 135, 33, RUBBER[0], both=False)
    for y in (31, 32):                                       # rear doors: split and handle
        k.line(4, y, 7, y, darken(0.35 if y == 31 else 0.2), both=False)
    k.put(5, 34, CHROME[2], both=False)
    k.grime(wheels, amount=1.3, rust=10, scratches=4)
    k.seal()
    k.rim()
    k.bumper(1, 3, RUBBER)
    k.bumper(157, 158, RUBBER)
    for y in range(21, 32):                                  # grille
        for x in range(154, 157):
            k.put(x, y, CHROME[1] if y == 21 or x == 154 else RUBBER[0] if y % 2 else CHROME[0])
    k.lamp(154, 156, 11, 15, HEAD_C, HEAD_GLOW, CHROME[2])   # stacked square headlights
    k.lamp(154, 156, 15, 19, HEAD_C, HEAD_GLOW, CHROME[2])
    k.line(155, 8, 156, 8, AMBER)
    k.line(155, 9, 156, 9, dk(AMBER, 0.2))
    k.lamp(4, 6, 4, 11, TAIL_C, TAIL_GLOW, hx('#7a0818'), back=6)      # tall tail lights on the corner posts
    k.line(5, 3, 6, 3, AMBER)
    for x in range(125, 131):                                # big black mirrors
        k.put(x, 1, RUBBER[3] if x == 126 else GLASS[1] if x == 130 else RUBBER[2])
    return k.done()


def p_car_tire():
    """Tyre seen from above (tread up), 0.62 m x 0.22 m."""
    cv = Cv(20, 7)
    for y in range(7):
        for x in range(20):
            if x in (0, 19) and y in (0, 6):
                continue
            c = RUBBER[1] if (x + (y > 3)) % 3 == 0 else RUBBER[2]
            if y == 3:
                c = RUBBER[0]
            if y == 0 or x == 0:
                c = RUBBER[3]
            elif y == 6 or x == 19:
                c = RUBBER[0]
            cv.set(x, y, c)
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
    S = 56
    cv = Cv(S, S)
    rng = random.Random(31)
    c0 = S / 2
    layers = []
    for layer in range(2):
        n = 8 if layer == 0 else 7
        for i in range(n):
            a = i * 2 * math.pi / n + (0.45 if layer else 0.0) + rng.uniform(-0.18, 0.18)
            ln = rng.uniform(22.0, 26.0) if layer == 0 else rng.uniform(17.0, 21.0)
            layers.append((layer, a, ln, rng.uniform(-0.35, 0.35)))
    greens = [ramp('#1c6a34', 0.6, 0.35, 0.2), ramp('#2c9a34', 0.55, 0.3, 0.22)]
    for (layer, a, ln, bend) in layers:
        fr = Cv(S, S)
        pts = []
        for k in range(20):
            t = k / 19.0
            aa = a + bend * t * t
            r = 2.0 + ln * t
            pts.append((c0 + math.cos(aa) * r, c0 + math.sin(aa) * r))
        g = greens[layer]
        for y in range(S):
            for x in range(S):
                px_, py_ = x + 0.5, y + 0.5
                best = None
                for k in range(19):
                    ax, ay = pts[k]
                    bx, by = pts[k + 1]
                    dx, dy = bx - ax, by - ay
                    ll = dx * dx + dy * dy
                    tt = max(0.0, min(1.0, ((px_ - ax) * dx + (py_ - ay) * dy) / ll))
                    d = math.hypot(px_ - ax - tt * dx, py_ - ay - tt * dy)
                    if best is None or d < best[0]:
                        side = ((px_ - ax) * dy - (py_ - ay) * dx) / math.sqrt(ll)
                        best = (d, (k + tt) / 19.0, side)
                d, t, side = best
                w = 5.6 * math.sin(math.pi * min(1.0, t * 0.95 + 0.05)) ** 0.6 * (1.0 - 0.3 * t)
                if d > w or t > 0.995 or t < 0.06:
                    continue
                q = t * ln - abs(side) * 1.25
                fr_ = q / 2.0 - math.floor(q / 2.0)
                if abs(side) < 0.75:
                    c = hx('#b8c84a') if t > 0.12 else hx('#7a6a3a')
                else:
                    if fr_ > 0.62:
                        continue                      # gap between two leaflets
                    lit = side * (math.sin(a) * LX - math.cos(a) * LY) > 0
                    c = g[3] if lit else g[1]
                    if fr_ < 0.2 and lit:
                        c = g[2]
                if layer == 0:
                    c = dk(c, 0.25)
                fr.set(x, y, c)
        fr.outline(hx('#081a14'))
        cv.over(fr)
    trunk = Cv(S, S)
    fill_shape(trunk, c0, c0, 3.6, 3.6, lambda u, v, L: tone(ramp('#6a4228', 0.5, 0.25, 0.35), L))
    for (dx, dy) in [(-2.2, 1.2), (1.6, -2.0), (2.0, 1.8)]:
        fill_shape(trunk, c0 + dx, c0 + dy, 1.5, 1.5, lambda u, v, L: tone(ramp('#5a3a1a', 0.45, 0.2, 0.4), L))
    trunk.outline(hx('#1a0c10'))
    cv.over(trunk)
    return cv


def p_streetlight():
    cv, gl = Cv(14, 10), Cv(14, 10)
    m = ramp('#5a5a72', 0.5, 0.25, 0.4)
    for x in range(0, 4):
        cv.set(x, 4, m[2])
        cv.set(x, 5, m[1])
    fill_shape(cv, 8.5, 5.0, 4.6, 3.9, lambda u, v, L: tone(m, L), kind='super', p=2.6)
    for x in range(6, 12):
        cv.set(x, 2, m[3])
    for y in range(4, 7):
        for x in range(6, 12):
            c = hx('#fff8e0') if 7 <= x <= 10 and y == 5 else hx('#ffd27a')
            cv.set(x, y, c)
            gl.set(x, y, (255, 236, 180, 255) if c == hx('#fff8e0') else (255, 200, 110, 230))
    cv.outline()
    cv.set(0, 4, m[2])
    cv.set(0, 5, m[1])
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
    cv, gl = Cv(20, 14), Cv(20, 14)
    wood = ramp('#5a1a4a', 0.5, 0.25, 0.35)
    fill_shape(cv, 10.0, 7.0, 9.0, 6.0, lambda u, v, L: tone(wood, L), kind='rect', bevel=1.5, corner=2.6)
    bands = [NEON_PINK, hx('#ff6b1a'), hx('#f9c80e'), NEON_CYAN]
    for i, col in enumerate(bands):     # glowing dome bands, back to front
        y = 2 + i
        for x in range(3 - (i == 0), 17 + (i == 0)):
            c = lt(col, 0.3) if (x + i) % 5 else lt(col, 0.6)
            cv.set(x, y, c)
            gl.set(x, y, lt(col, 0.15))
    for x in range(3, 17):
        cv.set(x, 6, hx('#c8c8dc') if x % 2 else hx('#8a8aa0'))
    for y in range(7, 12):
        for x in range(4, 16):
            c = hx('#2a1a30') if (x + y) % 2 else hx('#4a3a50')
            cv.set(x, y, c)
    for y in range(3, 12):
        for x in (2, 17):
            cv.set(x, y, lt(NEON_CYAN, 0.2) if y > 5 else cv.get(x, y))
            if y > 5:
                gl.set(x, y, NEON_CYAN)
    for (x, col) in [(6, NEON_PINK), (8, hx('#f9c80e')), (11, NEON_CYAN), (13, hx('#3aff8a'))]:
        cv.set(x, 11, col)
        gl.set(x, 11, col)
    cv.outline()
    return cv, gl


def p_hydrant():
    cv = Cv(8, 8)
    red = ramp('#e02a30', 0.55, 0.28, 0.35)
    fill_shape(cv, 1.9, 4.0, 1.0, 1.2, lambda u, v, L: tone(ramp('#c8c8d8'), L))
    fill_shape(cv, 6.1, 4.0, 1.0, 1.2, lambda u, v, L: tone(ramp('#c8c8d8'), L))
    fill_shape(cv, 4.0, 4.0, 2.7, 2.7, lambda u, v, L: tone(red, L))
    fill_shape(cv, 4.0, 4.0, 1.4, 1.4, lambda u, v, L: tone(ramp('#f9c80e', 0.5, 0.2, 0.4), L))
    cv.set(3, 3, hx('#fff8d0'))
    cv.outline()
    return cv


def p_bench():
    cv = Cv(36, 12)
    w = ramp('#b8682e', 0.5, 0.25, 0.35)
    iron = ramp('#3a3a4c', 0.4, 0.2, 0.45)
    rng = random.Random(41)
    for (y0, y1) in [(1, 2), (4, 6), (8, 10)]:
        for y in range(y0, y1 + 1):
            for x in range(2, 34):
                c = w[3] if y == y0 else w[1] if y == y1 else w[2]
                if rng.random() < 0.12:
                    c = shift(c, rng.choice([-10, 8]))
                cv.set(x, y, c)
    for x0 in (1, 32):
        for y in range(1, 11):
            cv.set(x0, y, iron[3] if y < 4 else iron[2])
            cv.set(x0 + 1, y, iron[1])
            cv.set(x0 + 2, y, iron[0])
    for x in (12, 23):
        cv.set(x, 5, iron[2])
        cv.set(x, 9, iron[2])
    cv.outline()
    return cv


# --------------------------------------------------------------------------
# Glow maps for existing props
# --------------------------------------------------------------------------

def is_neon(c, sat=110, val=190):
    return c[3] > 0 and max(c[:3]) - min(c[:3]) >= sat and max(c[:3]) >= val


def glow_from(cv, pred):
    gl = Cv(cv.w, cv.h)
    for y in range(cv.h):
        for x in range(cv.w):
            c = cv.get(x, y)
            if pred(x, y, c):
                gl.set(x, y, c)
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
                   ceiling_lamp=p_ceiling_lamp, pool_lamp=p_pool_lamp)
LIGHT_SIZES = dict(floor_lamp=(16, 16), table_lamp=(18, 18), wall_lamp=(14, 7), tube_light=(30, 5),
                   neon_tube_pink=(30, 5), neon_tube_cyan=(30, 5), ceiling_lamp=(18, 18), pool_lamp=(46, 12))


# --------------------------------------------------------------------------
# Overhead dressing: things mounted up high, drawn above everyone with a little parallax.
# --------------------------------------------------------------------------

FONT_SIGN = {
    'M': ["#...#", "##.##", "#.#.#", "#.#.#", "#...#", "#...#", "#...#"],
    'I': ["#####", "..#..", "..#..", "..#..", "..#..", "..#..", "#####"],
    'R': ["####.", "#...#", "#...#", "####.", "#.#..", "#..#.", "#...#"],
    'A': [".###.", "#...#", "#...#", "#####", "#...#", "#...#", "#...#"],
    'G': [".####", "#....", "#....", "#.###", "#...#", "#...#", ".###."],
    'E': ["#####", "#....", "#....", "####.", "#....", "#....", "#####"],
}
MARQUEE_TEXT, MARQUEE_X0, MARQUEE_STEP = 'MIRAGE', 8, 13


def p_marquee():
    """Bar sign: dark tubes on the sprite, lit letters on the glow map, the two halves of the bulb chase
    stacked on a third sheet. Letter i spans x = MARQUEE_X0 + i * MARQUEE_STEP - 1 .. + 12 (see props.js `sign`)."""
    W, H = 92, 28
    cv, gl, bulbs = sign_backing(W, H), Cv(W, H), Cv(W, H * 2)
    dim, hot = dk(NEON_PINK, 0.62), lt(NEON_PINK, 0.3)
    for i, ch in enumerate(MARQUEE_TEXT):
        x0 = MARQUEE_X0 + i * MARQUEE_STEP
        cells = [(x0 + cx * 2 + a, 7 + cy * 2 + b) for cy, row in enumerate(FONT_SIGN[ch])
                 for cx, c in enumerate(row) if c == '#' for a in (0, 1) for b in (0, 1)]
        on = set(cells)
        for (x, y) in cells:
            cv.set(x, y, dim)
            gl.set(x, y, hot)
        for (x, y) in cells:        # soft halo, kept inside the letter's own column band
            for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                q = (x + dx, y + dy)
                if q not in on and x0 - 1 <= q[0] <= x0 + 10:
                    gl.set(q[0], q[1], alpha(NEON_PINK, 110))
    # bulb chase around the frame
    ring_pts = [(x, 3) for x in range(4, W - 4, 4)] + [(W - 5, y) for y in range(7, H - 4, 4)] \
        + [(x, H - 4) for x in range(W - 8, 3, -4)] + [(4, y) for y in range(H - 8, 6, -4)]
    for k, (x, y) in enumerate(ring_pts):
        cv.set(x, y, hx('#5a4320'))
        for dx, dy, a in ((0, 0, 255), (1, 0, 90), (-1, 0, 90), (0, 1, 90), (0, -1, 90)):
            bulbs.set(x + dx, y + dy + (k % 2) * H, (255, 214, 140, a))
    return cv, gl, bulbs


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


LIGHT_PROPS['string_lights'] = p_string_lights
LIGHT_SIZES.update(marquee=(92, 28), string_lights=(128, 10))


# --------------------------------------------------------------------------
# Structure
# --------------------------------------------------------------------------

def s_door():
    cv = Cv(32, 5)
    w = ramp('#9a6236', 0.45, 0.22, 0.3)
    for x in range(1, 31):
        cv.set(x, 1, w[3])
        cv.set(x, 2, w[2] if x % 7 else w[1])
        cv.set(x, 3, w[1])
    for y in (1, 2, 3):
        cv.set(1, y, w[0])
        cv.set(2, y, dk(cv.get(2, y), 0.3))
    cv.set(1, 2, hx('#8a8a96'))
    cv.outline()
    cv.set(28, 0, BRASS[3])
    cv.set(28, 4, BRASS[1])
    cv.set(28, 2, BRASS[2])
    return cv


def s_window():
    cv = Cv(32, 4)
    for x in range(32):
        cv.set(x, 0, (120, 200, 220, 210))
        cv.set(x, 1, (170, 240, 250, 170))
        cv.set(x, 2, (150, 230, 245, 170))
        cv.set(x, 3, (100, 170, 200, 210))
    for sx in (4, 5, 17, 25):
        cv.set(sx, 1, (255, 255, 255, 230))
        cv.set(sx + 1, 2, (255, 255, 255, 200))
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
        out[(g, cid + '_down')] = draw_body(ch, 26, 16, POSE_DOWN, seed=i)
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
        out[('characters', cid + '_rag_arm')] = rag_arm(ch)
        out[('characters', cid + '_rag_leg')] = rag_leg(ch)
    for name, cv in mags().items():
        out[('weapons', name)] = cv
    props = dict(table=p_table, table_round=p_table_round, desk=p_desk, chair=p_chair, armchair=p_armchair,
                 sofa=p_sofa, plant=p_plant, tv=p_tv, fridge=p_fridge, oven=p_oven, sink=p_sink,
                 toilet=p_toilet, bed=p_bed, pool_table=p_pool_table, arcade=p_arcade, crate=p_crate,
                 barrel=p_barrel, bookshelf=p_bookshelf, speaker=p_speaker, dj_booth=p_dj_booth,
                 bar_counter=p_bar_counter, car=p_car, dumpster=p_dumpster, trash_can=p_trash_can,
                 car2=p_car2, van=p_van, car_tire=p_car_tire, car_hood=p_car_hood, car_door=p_car_door,
                 car2_hood=p_car2_hood, car2_door=p_car2_door, van_hood=p_van_hood, van_door=p_van_door,
                 palm_tree=p_palm_tree, streetlight=p_streetlight, neon_sign_palm=p_neon_sign_palm,
                 neon_sign_bar=p_neon_sign_bar, neon_sign_arrow=p_neon_sign_arrow, jukebox=p_jukebox,
                 hydrant=p_hydrant, bench=p_bench)
    for name, fn in props.items():
        r = fn()
        if isinstance(r, tuple):   # (sprite, emissive map)
            out[('props', name)], out[('props', name + '_glow')] = r
        else:
            out[('props', name)] = r
    out[('props', 'dj_booth_glow')] = glow_from(out[('props', 'dj_booth')], lambda x, y, c: is_neon(c))
    for name, fn in LIGHT_PROPS.items():
        out[('props', name)], out[('props', name + '_glow')] = fn()
    out[('props', 'marquee')], out[('props', 'marquee_glow')], out[('props', 'marquee_bulbs')] = p_marquee()
    for name, cv in tiles().items():
        out[('tiles', name)] = cv
    out[('structure', 'door')] = s_door()
    out[('structure', 'window')] = s_window()
    out[('structure', 'fence')] = s_fence()
    return out


GLOWING = ['arcade', 'tv', 'dj_booth', 'jukebox', 'neon_sign_palm', 'neon_sign_bar', 'neon_sign_arrow', 'streetlight',
           'car', 'car2', 'van']
PROP_SIZES = dict(table=(40, 24), table_round=(28, 28), desk=(36, 22), chair=(12, 12), armchair=(18, 18),
                  sofa=(44, 18), plant=(18, 18), tv=(24, 8), fridge=(22, 20), oven=(22, 20), sink=(24, 14),
                  toilet=(12, 16), bed=(30, 44), pool_table=(64, 36), arcade=(20, 16), crate=(18, 18),
                  barrel=(14, 14), bookshelf=(40, 10), speaker=(14, 14), dj_booth=(48, 18),
                  bar_counter=(32, 14), car=(140, 58), dumpster=(36, 22), trash_can=(12, 12),
                  car2=(134, 56), van=(160, 64), car_tire=(20, 7), car_hood=(38, 44), car_door=(34, 6),
                  car2_hood=(30, 40), car2_door=(40, 6), van_hood=(18, 48), van_door=(30, 6),
                  palm_tree=(56, 56), streetlight=(14, 10), neon_sign_palm=(40, 14), neon_sign_bar=(44, 14),
                  neon_sign_arrow=(30, 12), jukebox=(20, 14), hydrant=(8, 8), bench=(36, 12))
FLOOR_NAMES = [t[0] for t in FLOOR_TILES]
PROP_SIZES.update(LIGHT_SIZES)
PROP_SIZES['marquee_bulbs'] = (92, 56)
GLOWING += list(LIGHT_SIZES)
EXPECTED = {
    'characters': dict([(c + s, sz) for c in CHARS for s, sz in [
        ('_torso', (20, 20)), ('_down', (26, 16)), ('_dead0', (30, 22)), ('_dead1', (30, 22)),
        ('_gib_head', (9, 9)), ('_gib_arm', (11, 4)), ('_gib_leg', (13, 5)), ('_gib_torso', (14, 12)),
        ('_rag_torso', (14, 16)), ('_rag_head', (9, 9)), ('_rag_arm', (11, 4)), ('_rag_leg', (13, 5))]]
        + [('gib_chunk0', (6, 5)), ('gib_chunk1', (6, 5)), ('gib_chunk2', (6, 5)), ('gib_eye', (3, 3))]),
    'weapons': dict(pistol=(11, 5), uzi=(12, 7), uzi_silenced=(18, 7), shotgun=(22, 5), rifle=(24, 7),
                    sniper=(28, 5), bazooka=(26, 7), bat=(22, 4), knife=(10, 3), rocket=(9, 4),
                    casing=(3, 2), shell=(4, 2), mag_pistol=(3, 6), mag_uzi=(3, 9), mag_rifle=(4, 9),
                    mag_sniper=(3, 6), shells_box=(8, 6), ammo_9mm=(9, 7), ammo_12g=(9, 7), ammo_762=(9, 7),
                    ammo_rocket=(12, 6)),
    'props': dict(list(PROP_SIZES.items()) + [(n + '_glow', PROP_SIZES[n]) for n in GLOWING]),
    'tiles': dict([(n + s, (32, 32)) for n in FLOOR_NAMES for s in ('', '_v1', '_v2')]
                  + [(n, (32, 32)) for n in ('wall', 'brick', 'neon_floor_glow')]),
    'structure': dict(door=(32, 5), window=(32, 4), fence=(32, 6)),
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
