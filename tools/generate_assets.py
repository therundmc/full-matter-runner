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
# Tiles (32x32, seamless). Base painters wrap every coordinate; variants copy the
# base and only decorate inside a 2 px margin, so they tile with the base.
# --------------------------------------------------------------------------

T = 32
VM = 2   # variant margin


def wset(cv, x, y, c):
    cv.p[int(x) % cv.w, int(y) % cv.h] = c


def wget(cv, x, y):
    return cv.p[int(x) % cv.w, int(y) % cv.h]


def wmix(cv, x, y, c, t):
    wset(cv, x, y, mix(wget(cv, x, y), c, t))


def fbm(rng, cells=(16, 8, 4), w=(0.55, 0.3, 0.15)):
    ns = [VNoise(T, T, c, rng) for c in cells]
    return lambda x, y: sum(n(x, y) * k for n, k in zip(ns, w))


def pal(cols, t):
    """Piecewise blend through a list of colours, t in 0..1."""
    t = max(0.0, min(1.0, t)) * (len(cols) - 1)
    i = min(int(t), len(cols) - 2)
    return mix(cols[i], cols[i + 1], t - i)


def inside(x, y, m=VM):
    return m <= x < T - m and m <= y < T - m


def blob(cx, cy, rx, ry, rng, rough=0.22):
    """Noisy ellipse -> {(x, y): e} with e = 0 at the centre, 1 on the rim."""
    harm = [(rng.uniform(0, 6.283), rng.uniform(0, rough), k) for k in (2, 3, 5)]
    out = {}
    for y in range(int(cy - ry * 1.4 - 2), int(cy + ry * 1.4 + 3)):
        for x in range(int(cx - rx * 1.4 - 2), int(cx + rx * 1.4 + 3)):
            dx, dy = (x + 0.5 - cx) / rx, (y + 0.5 - cy) / ry
            a = math.atan2(dy, dx)
            r = 1.0 + sum(amp * math.sin(a * k + ph) for ph, amp, k in harm)
            e = math.hypot(dx, dy) / r
            if e <= 1.0:
                out[(x, y)] = e
    return out


def crack_pts(rng, x, y, ang, n, margin=VM, branch=0.12, depth=0):
    pts = []
    fx, fy = x + 0.5, y + 0.5
    for _ in range(n):
        ix, iy = int(math.floor(fx)), int(math.floor(fy))
        if margin is not None and not inside(ix, iy, margin):
            break
        pts.append((ix % T, iy % T))
        ang += rng.uniform(-0.5, 0.5)
        fx += math.cos(ang)
        fy += math.sin(ang)
        if depth < 2 and rng.random() < branch:
            pts += crack_pts(rng, ix, iy, ang + rng.choice([-1, 1]) * rng.uniform(0.7, 1.3), max(2, n // 3),
                             margin, branch * 0.4, depth + 1)
    return pts


def draw_crack(cv, pts, dark=0.55, lip=0.2, col=None):
    s = set(pts)
    for (x, y) in pts:
        if (x, (y + 1) % T) not in s and (inside(x, y + 1) or not inside(x, y)):
            wset(cv, x, y + 1, lt(wget(cv, x, y + 1), lip))
    for (x, y) in pts:
        wset(cv, x, y, col if col else dk(wget(cv, x, y), dark))


def stain(cv, rng, cx, cy, rx, ry, col, t=0.5, rim=0.15, rough=0.25):
    for (x, y), e in blob(cx, cy, rx, ry, rng, rough).items():
        if inside(x, y):
            k = t + (rim if e > 0.78 else 0.0)
            cv.set(x, y, mix(cv.get(x, y), col, min(1.0, k)))


def butt(cv, x, y, horiz=True):
    """Cigarette butt with a smouldering tip."""
    pts = [(x, y), (x + 1, y), (x + 2, y)] if horiz else [(x, y), (x, y + 1), (x, y + 2)]
    for i, (px, py) in enumerate(pts):
        cv.set(px, py, [hx('#e89a4a'), hx('#f2eee4'), hx('#d8d2c4')][i])
    cv.set(pts[-1][0] + (1 if horiz else 0), pts[-1][1] + (0 if horiz else 1), hx('#5a4a52'))


def leaf(cv, x, y, col, rng):
    pts = rng.choice([[(0, 0), (1, 0), (1, 1), (2, 1)], [(0, 0), (0, 1), (1, 1), (1, 2)],
                      [(0, 1), (1, 0), (1, 1), (2, 0)], [(1, 0), (0, 1), (1, 1), (0, 2)]])
    for i, (dx, dy) in enumerate(pts):
        cv.set(x + dx, y + dy, lt(col, 0.2) if i == 0 else dk(col, 0.2) if i == 3 else col)
    cv.set(x + pts[-1][0] + 1, y + pts[-1][1] + 1, dk(cv.get(x + pts[-1][0] + 1, y + pts[-1][1] + 1), 0.25))


def flower(cv, x, y, petal, centre, wrap=False):
    put = (lambda a, b, c: wset(cv, a, b, c)) if wrap else cv.set
    for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
        put(x + dx, y + dy, petal if dy <= 0 else dk(petal, 0.25))
    put(x, y, centre)
    put(x + 1, y + 2, dk(wget(cv, x + 1, y + 2), 0.3))


def pebble(cv, x, y, col, wrap=True):
    put = (lambda a, b, c: wset(cv, a, b, c)) if wrap else cv.set
    get = (lambda a, b: wget(cv, a, b)) if wrap else cv.get
    put(x, y, lt(col, 0.25))
    put(x + 1, y, col)
    put(x, y + 1, col)
    put(x + 1, y + 1, dk(col, 0.25))
    put(x + 1, y + 2, dk(get(x + 1, y + 2), 0.4))
    put(x + 2, y + 1, dk(get(x + 2, y + 1), 0.4))


# ---- wood -------------------------------------------------------------------

def t_wood(cv, rng):
    cols = [hx('#b06a32'), hx('#9a5628'), hx('#c27c3c'), hx('#a45e2c'), hx('#8a4a24'), hx('#b8743a')]
    offs = [3, 19, 11, 27]
    seam = hx('#2a1028')
    n = fbm(rng, (16, 8, 4), (0.4, 0.35, 0.25))
    for r in range(4):
        base = rng.choice(cols)
        streaks = []
        for _ in range(6):
            streaks.append((rng.randint(1, 6), rng.randint(0, 31), rng.randint(5, 16), rng.choice([-1, -1, 1])))
        for yy in range(8):
            y = r * 8 + yy
            for x in range(32):
                rel = (x - offs[r]) % 32
                c = shift(base, int(-8 + rel * 0.5 + (n(x, y) - 0.5) * 14))
                for (sy, sx, ln, sg) in streaks:
                    d = (x - sx) % 32
                    if sy == yy and d < ln:
                        c = dk(c, 0.2) if sg < 0 else lt(c, 0.1)
                if yy == 0:
                    c = lt(c, 0.16)
                elif yy == 6:
                    c = dk(c, 0.1)
                elif yy == 7:
                    c = seam
                if rel == 0 and yy != 7:
                    c = seam
                elif rel == 31 and yy != 7:
                    c = dk(c, 0.2)
                elif rel == 1 and yy != 7:
                    c = lt(c, 0.1)
                if yy == 1 and rng.random() < 0.12:
                    c = lt(c, 0.3)   # varnish glint
                elif rng.random() < 0.06:
                    c = shift(c, rng.choice([-7, 6]))
                wset(cv, x, y, c)
        for dx in (-3, 3):
            for yy in (2, 5):
                wset(cv, offs[r] + dx, r * 8 + yy, hx('#3a2230'))
                wset(cv, offs[r] + dx + 1, r * 8 + yy, lt(wget(cv, offs[r] + dx + 1, r * 8 + yy), 0.15))


def v_wood1(cv, rng):
    stain(cv, rng, rng.randint(10, 21), rng.randint(10, 21), 5.5, 4.0, hx('#3a0e26'), 0.42, 0.2)
    bx, by = rng.choice([(6, 22), (24, 7), (22, 24)])
    for (x, y), e in blob(bx + 0.5, by + 0.5, 2.2, 1.8, rng, 0.1).items():
        cv.set(x, y, hx('#1a0c14') if e < 0.5 else mix(cv.get(x, y), hx('#3a1a14'), 0.6))
    cv.set(bx - 1, by - 1, hx('#ff6b1a'))


def v_wood2(cv, rng):
    for (kx, ky) in [(rng.randint(5, 12), 11), (rng.randint(19, 26), 27)]:
        for (x, y), e in blob(kx + 0.5, ky + 0.5, 2.4, 1.4, rng, 0.05).items():
            if inside(x, y):
                c = cv.get(x, y)
                cv.set(x, y, hx('#2a1018') if e < 0.45 else dk(c, 0.3) if e < 0.75 else lt(c, 0.12))
    for _ in range(4):
        x, y = rng.randint(4, 24), rng.randint(3, 26)
        for k in range(rng.randint(4, 7)):
            if inside(x + k, y + k // 2):
                cv.set(x + k, y + k // 2, lt(cv.get(x + k, y + k // 2), 0.28))
    draw_crack(cv, crack_pts(rng, 6, 20, 0.0, 18, branch=0.05), 0.6, 0.12)


# ---- checker ------------------------------------------------------------------

def t_checker(cv, rng):
    W_ = ramp('#efe4cc', 0.42, 0.18, 0.4)
    B_ = ramp('#2a1e3c', 0.45, 0.22, 0.4)
    grout = hx('#56486a')
    n = fbm(rng, (16, 8), (0.6, 0.4))
    glint = {(tx, ty) for tx in range(4) for ty in range(4) if rng.random() < 0.6}
    for y in range(32):
        for x in range(32):
            gx, gy = x % 8, y % 8
            if gx == 7 or gy == 7:
                c = jit(grout, 4, rng)
            else:
                white = ((x // 8) + (y // 8)) % 2 == 0
                r_ = W_ if white else B_
                c = r_[2]
                if gx == 0 or gy == 0:
                    c = r_[3]
                elif gx == 6 or gy == 6:
                    c = r_[1]
                c = shift(c, int((n(x, y) - 0.5) * 12))
                if (x // 8, y // 8) in glint and gx + gy in (3, 4) and 1 <= gx <= 3:
                    c = lt(c, 0.35 if not white else 0.5)
                c = jit(c, 3, rng)
            cv.set(x, y, c)


def v_checker1(cv, rng):
    tx, ty = rng.choice([(1, 1), (2, 2)])
    draw_crack(cv, crack_pts(rng, tx * 8 + 1, ty * 8 + 2, 0.6, 12, branch=0.3), 0.6, 0.0)
    ox, oy = rng.choice([(2, 1), (1, 2)])
    for (dx, dy) in [(5, 5), (6, 5), (5, 6), (6, 6), (4, 6), (6, 4)]:
        cv.set(ox * 8 + dx, oy * 8 + dy, hx('#6a6070') if dx + dy > 10 else hx('#827890'))


def v_checker2(cv, rng):
    stain(cv, rng, rng.randint(12, 20), rng.randint(12, 20), 7.0, 5.0, hx('#5a4a3a'), 0.22, 0.12, 0.3)
    for _ in range(4):
        x, y = rng.randint(3, 25), rng.randint(3, 27)
        for k in range(3):
            cv.set(x + k, y + (1 if k == 1 else 0), hx('#1a1220'))


# ---- blue tiles ---------------------------------------------------------------

def t_tile_blue(cv, rng):
    cols = [hx('#4cbce0'), hx('#3eaad6'), hx('#5ccae8'), hx('#38a0d0'), hx('#46b2dc')]
    grout = hx('#163a5e')
    tc = [[rng.choice(cols) for _ in range(4)] for _ in range(4)]
    for y in range(32):
        for x in range(32):
            gx, gy = x % 8, y % 8
            if gx == 7 or gy == 7:
                c = grout
            else:
                c = tc[y // 8][x // 8]
                c = shift(c, int(-gy * 1.2))
                if gx == 0 or gy == 0:
                    c = lt(c, 0.32)
                elif gx == 6 or gy == 6:
                    c = dk(c, 0.22)
                c = jit(c, 2, rng)
            cv.set(x, y, c)
    for ty in range(4):
        for tx in range(4):
            if rng.random() < 0.55:
                for (dx, dy) in [(1, 2), (2, 1)]:
                    cv.set(tx * 8 + dx, ty * 8 + dy, hx('#e8fcff'))


def v_tile_blue1(cv, rng):
    draw_crack(cv, crack_pts(rng, 9, 12, 0.4, 16, branch=0.25), 0.55, 0.15)
    tx, ty = 2, rng.choice([1, 2])
    for y in range(ty * 8 + 3, ty * 8 + 7):
        for x in range(tx * 8 + 3, tx * 8 + 7):
            if (x - tx * 8) + (y - ty * 8) >= 8:
                cv.set(x, y, hx('#6a6a7a') if (x + y) % 3 else hx('#4a4a5a'))
    cv.set(tx * 8 + 5, ty * 8 + 3, hx('#e8fcff'))


def v_tile_blue2(cv, rng):
    acc = [ramp('#ff3a8a', 0.45, 0.2, 0.35), ramp('#1e3a9a', 0.45, 0.2, 0.35)]
    for k, (tx, ty) in enumerate(rng.sample([(1, 1), (2, 2), (1, 2), (2, 1)], 2)):
        r_ = acc[k]
        for gy in range(7):
            for gx in range(7):
                c = r_[3] if gx == 0 or gy == 0 else r_[1] if gx == 6 or gy == 6 else r_[2]
                cv.set(tx * 8 + gx, ty * 8 + gy, c)
        cv.set(tx * 8 + 1, ty * 8 + 2, lt(r_[3], 0.5))
        cv.set(tx * 8 + 2, ty * 8 + 1, lt(r_[3], 0.5))
    for _ in range(5):
        x, y = rng.randint(3, 28), rng.randint(3, 28)
        cv.set(x, y, hx('#f0ffff'))
        cv.set(x, y + 1, dk(cv.get(x, y + 1), 0.25))


# ---- carpets ------------------------------------------------------------------

def t_carpet_red(cv, rng):
    base = hx('#6c1030')
    line, inner, gold = hx('#e0407a'), hx('#2c0418'), hx('#f2b440')
    n = fbm(rng, (16, 8, 4), (0.45, 0.35, 0.2))
    for y in range(32):
        for x in range(32):
            c = shift(base, int((n(x, y) - 0.5) * 18))
            if rng.random() < 0.3:
                c = shift(c, rng.choice([-9, 7]))
            dx, dy = abs(x % 16 - 8), abs(y % 16 - 8)
            d = dx + dy
            if d == 8:
                c = line if (x + y) % 4 else lt(line, 0.25)
            elif d in (7, 9):
                c = inner
            elif d <= 1:
                c = gold if d == 0 else dk(gold, 0.25)
            elif d == 4 and (x + y) % 2 == 0:
                c = mix(line, c, 0.45)
            elif d == 16:
                c = gold
            elif d == 15:
                c = mix(gold, c, 0.55)
            cv.set(x, y, c)


def t_carpet_purple(cv, rng):
    base = hx('#2a1250')
    cyan, pink, yel = hx('#24ccdc'), hx('#ff3a8e'), hx('#f2c232')
    n = fbm(rng, (16, 8, 4), (0.45, 0.35, 0.2))
    for y in range(32):
        for x in range(32):
            c = shift(base, int((n(x, y) - 0.5) * 16))
            if rng.random() < 0.3:
                c = shift(c, rng.choice([-7, 7]))
            cv.set(x, y, c)

    def put(x, y, c):
        wset(cv, x, y, c if rng.random() > 0.12 else dk(c, 0.25))
    for i in range(13):    # cyan zigzag
        put(1 + i, 6 - abs(i % 4 - 2), cyan)
    for i in range(9):     # yellow zigzag
        put(17 + i, 19 + abs(i % 4 - 2), yel)
    for t_ in range(9):    # pink triangle outline
        put(20 + t_ * 0.8, 3 + t_, pink)
        put(20 - t_ * 0.6, 3 + t_ * 0.9, pink)
        put(14.6 + t_ * 1.0, 11, pink)
    for (x, y) in [(5, 20), (9, 23), (4, 26)]:   # dots
        for dx, dy in ((0, 0), (1, 0), (0, 1), (1, 1)):
            put(x + dx, y + dy, yel if (dx, dy) != (0, 0) else lt(yel, 0.3))
    ring_pts = [(round(26 + math.cos(a / 8 * 6.283) * 2.6), round(27 + math.sin(a / 8 * 6.283) * 2.6)) for a in range(8)]
    for (x, y) in ring_pts:
        put(x, y, cyan)
    for i in range(7):     # pink squiggle
        put(12 + i, 28 + round(math.sin(i * 1.4)), pink)
    for (x, y) in [(29, 14), (30, 15), (28, 15), (14, 21), (2, 15)]:
        put(x, y, mix(cyan, base, 0.2))


def v_carpet1(cv, rng, col):
    stain(cv, rng, rng.randint(10, 21), rng.randint(10, 21), 6.0, 4.5, col, 0.5, 0.2, 0.3)
    bx, by = rng.choice([(7, 24), (24, 8)])
    for (x, y), e in blob(bx + 0.5, by + 0.5, 1.8, 1.5, rng, 0.1).items():
        cv.set(x, y, hx('#120810') if e < 0.55 else hx('#3a2018'))


def v_carpet2(cv, rng):
    for (x, y), e in blob(rng.randint(12, 19), rng.randint(12, 19), 8.0, 6.0, rng, 0.3).items():
        if inside(x, y):
            c = cv.get(x, y)
            g = (c[0] + c[1] + c[2]) // 3
            cv.set(x, y, mix(c, (g + 18, g + 14, g + 22, 255), 0.35 * (1 - e) + 0.1))
    butt(cv, rng.randint(5, 9), rng.randint(20, 26))
    for _ in range(6):
        cv.set(rng.randint(3, 28), rng.randint(3, 28), hx(rng.choice(['#ff2a6d', '#05d9e8', '#f9c80e', '#f4f0ff'])))


# ---- concrete -----------------------------------------------------------------

def t_concrete(cv, rng):
    n = fbm(rng, (16, 8, 4), (0.5, 0.3, 0.2))
    cols = [hx('#4a4658'), hx('#625e72'), hx('#78748a'), hx('#8c889c')]
    for y in range(32):
        for x in range(32):
            c = pal(cols, n(x, y) * 1.3 - 0.15)
            r = rng.random()
            if r < 0.07:
                c = shift(c, -18)
            elif r < 0.13:
                c = shift(c, 14)
            elif r < 0.145:
                c = hx('#9a8a7a')
            elif r < 0.155:
                c = hx('#5a6a8a')
            if x == 0 or y == 0:
                c = hx('#2e2a3a')
            elif x == 1 or y == 1:
                c = lt(c, 0.14)
            cv.set(x, y, c)
    draw_crack(cv, crack_pts(rng, 6, 20, -0.4, 20, margin=None, branch=0.1), 0.35, 0.1)


def v_concrete1(cv, rng):
    stain(cv, rng, 16, 16, 6.5, 6.0, hx('#24202e'), 0.3, 0.1, 0.3)
    frame = ramp('#6a6878', 0.5, 0.25, 0.35)
    for y in range(12, 20):
        for x in range(12, 20):
            if x in (12, 19) or y in (12, 19):
                c = frame[3] if (x == 12 or y == 12) and not (x == 19 or y == 19) else frame[0]
            else:
                c = hx('#0e0a14') if x % 2 == 0 else frame[1]
                if x % 2 and y == 13:
                    c = frame[3]
            cv.set(x, y, c)
    for (x, y) in [(14, 20), (14, 21), (17, 20)]:
        cv.set(x, y, hx('#6a3a2a'))


def v_concrete2(cv, rng):
    cx, cy = rng.randint(11, 20), rng.randint(11, 20)
    for (x, y), e in blob(cx, cy, 7.0, 5.0, rng, 0.3).items():
        if inside(x, y):
            c = mix(cv.get(x, y), hx('#14101c'), 0.65 if e < 0.85 else 0.4)
            if 0.45 < e < 0.65:
                c = mix(c, hx('#3a7a8a') if (x + y) % 3 else hx('#8a3a9a'), 0.35)
            cv.set(x, y, c)
    cv.set(cx - 2, cy - 2, hx('#9aa0d0'))
    cv.set(cx - 1, cy - 2, hx('#6a70a0'))
    draw_crack(cv, crack_pts(rng, 4, 6, 0.7, 26, branch=0.2), 0.55, 0.15)


# ---- grass --------------------------------------------------------------------

GRASS_BLADE = [hx('#0f2e1e'), hx('#1f5a2a'), hx('#348a32'), hx('#5cb43c'), hx('#a8e05a')]


def tuft(cv, x, y, rng, h=3, put=None, tall=False):
    """V-shaped clump: outer blades lean outwards, the tallest one in the middle catches the light."""
    put = put or (lambda a, b, c: wset(cv, a, b, c))
    get = lambda a, b: wget(cv, a, b)
    for dx in (-1, 0, 1):
        put(x + dx, y + 1, dk(get(x + dx, y + 1), 0.4))
    for dx in rng.sample([-2, -1, 0, 1, 2], rng.randint(3, 4)):
        hh = max(2, h + (1 if tall else 0) - abs(dx) // 2 + rng.choice([0, 0, 1]))
        for j in range(hh):
            px_ = x + dx + ((1 if dx > 0 else -1) if dx and j >= hh - 1 else 0)
            if j == 0:
                c = GRASS_BLADE[1]
            elif j == hh - 1:
                c = GRASS_BLADE[4] if abs(dx) < 2 else GRASS_BLADE[3]
            else:
                c = GRASS_BLADE[2] if j < hh - 2 else GRASS_BLADE[3]
            put(px_, y - j, c)


def t_grass(cv, rng):
    n = fbm(rng, (16, 8, 4), (0.5, 0.3, 0.2))
    m = fbm(rng, (8, 4), (0.6, 0.4))
    cols = [hx('#0c261c'), hx('#143c24'), hx('#1e5428'), hx('#2c6a2e')]
    for y in range(32):
        for x in range(32):
            c = pal(cols, n(x, y) * 1.25 - 0.1)
            if m(x, y) > 0.66:
                c = mix(c, hx('#1a5a4a'), 0.35)   # cool clover patches
            if rng.random() < 0.18:
                c = shift(c, rng.choice([-10, 8]))
            cv.set(x, y, c)
    for _ in range(34):
        tuft(cv, rng.randint(0, 31), rng.randint(0, 31), rng, rng.choice([3, 3, 4]))
    for (x, y, p, c) in [(6, 9, '#ff5aa0', '#fff07a'), (23, 21, '#f4f2ff', '#f9c80e')]:
        flower(cv, x, y, hx(p), hx(c), wrap=True)
    for (x, y) in [(15, 28), (27, 5)]:
        wset(cv, x, y, hx('#f9d84a'))
        wset(cv, x, y + 1, dk(wget(cv, x, y + 1), 0.3))


def v_grass1(cv, rng):
    cols = [hx('#e07a2a'), hx('#c8442a'), hx('#e8b83a'), hx('#8a5a2a')]
    for _ in range(7):
        leaf(cv, rng.randint(3, 24), rng.randint(3, 24), rng.choice(cols), rng)
    fx, fy = rng.randint(8, 22), rng.randint(8, 22)
    for (dx, dy) in [(0, 0), (3, 1), (1, 3)]:
        flower(cv, fx + dx, fy + dy, hx('#ff4a9a'), hx('#fff07a'))


def v_grass2(cv, rng):
    cx, cy = rng.randint(10, 13), rng.randint(17, 21)
    for (x, y), e in blob(cx, cy, 4.0, 3.0, rng, 0.3).items():
        if inside(x, y):
            cv.set(x, y, pal([hx('#4a2e26'), hx('#6a4630'), hx('#3a2a2a')], e + rng.uniform(-0.2, 0.2)))
    pebble(cv, cx - 1, cy - 1, hx('#a89a8a'), wrap=False)
    pebble(cv, cx + 2, cy + 1, hx('#8a7a7a'), wrap=False)
    wx, wy = rng.randint(19, 24), rng.randint(7, 12)
    for a in range(7):     # weed rosette
        ang = a / 7 * 6.283
        for k in range(1, 4):
            x, y = round(wx + math.cos(ang) * k), round(wy + math.sin(ang) * k * 0.8)
            cv.set(x, y, hx('#5aa83a') if k == 3 else hx('#2e6a2a'))
    for (dx, dy) in [(0, 0), (-4, 6), (5, 7), (-9, 14)]:
        x, y = wx + dx, wy + dy
        if inside(x, y) and inside(x + 2, y + 2):
            cv.set(x, y, hx('#fff07a'))
            cv.set(x + 1, y, hx('#f9c80e'))
            cv.set(x, y + 1, hx('#f9c80e'))
            cv.set(x + 1, y + 1, hx('#e88a1a'))
            cv.set(x + 1, y + 2, hx('#173c24'))
    for _ in range(6):
        x, y = rng.randint(4, 27), rng.randint(6, 27)
        tuft(cv, x, y, rng, 4, put=lambda a, b, c: cv.set(a, b, c) if inside(a, b) else None, tall=True)


# ---- asphalt ------------------------------------------------------------------

ASPH = [hx('#12121c'), hx('#1a1a28'), hx('#232335'), hx('#2e2e44')]


def t_asphalt(cv, rng, line=False):
    n = fbm(rng, (16, 8, 4), (0.5, 0.3, 0.2))
    wet = fbm(rng, (16, 8), (0.7, 0.3))
    for y in range(32):
        for x in range(32):
            c = pal(ASPH, n(x, y) * 1.3 - 0.15)
            r = rng.random()
            if r < 0.11:
                c = shift(c, 15)
            elif r < 0.14:
                c = hx('#565670')
            elif r < 0.22:
                c = shift(c, -8)
            elif r < 0.227:
                c = hx('#6a5a66')
            w = wet(x, y)
            if w > 0.58:
                k = min(1.0, (w - 0.58) / 0.18)
                c = mix(c, hx('#2c2c66'), 0.35 * k)
                if r < 0.05 * k:
                    c = rng.choice([hx('#8ac8ff'), hx('#ff8ac8'), hx('#b8b8ff')])
            cv.set(x, y, c)
    if line:
        for x in range(32):
            for y, col in ((15, hx('#ffe066')), (16, hx('#f9c80e')), (17, hx('#c8920a'))):
                c = col
                if rng.random() < 0.14:
                    c = mix(c, cv.get(x, y), 0.65)
                if wet(x, y) > 0.6:
                    c = mix(c, hx('#ff9a6a'), 0.15)
                cv.set(x, y, c)
    draw_crack(cv, crack_pts(rng, 3, 7, 0.5, 22, margin=None, branch=0.15), 0.45, 0.12)


def manhole(cv, rng, cx=16.0, cy=16.0, R=8.2):
    iron = ramp('#3e3c52', 0.5, 0.25, 0.4)
    for y in range(32):
        for x in range(32):
            dx, dy = x + 0.5 - cx, y + 0.5 - cy
            d = math.hypot(dx, dy)
            if d > R + 1.8:
                continue
            if d > R + 0.8:
                cv.set(x, y, dk(cv.get(x, y), 0.3))
                continue
            if d > R:
                cv.set(x, y, hx('#08060e'))
                continue
            L = light(dx / max(d, 0.1) * 0.95, dy / max(d, 0.1) * 0.95)
            if d > R - 1.3:
                c = tone(iron, L)
            elif 0.62 * R < d < 0.62 * R + 1.0:
                c = iron[3] if L > 0.5 else iron[1]
            elif d < 0.55 * R and x % 3 == 0 and y % 3 == 0:
                c = iron[3]
            elif d < 0.55 * R and x % 3 == 1 and y % 3 == 1:
                c = iron[0]
            else:
                c = iron[1] if (x * 7 + y * 3) % 5 else iron[2]
            if rng.random() < 0.08:
                c = mix(c, hx('#6a3a2a'), 0.5)
            cv.set(x, y, c)
    for (x, y) in [(int(cx) - 3, int(cy) + 5), (int(cx) + 2, int(cy) + 5)]:
        cv.set(x, y, hx('#08060e'))


def puddle(cv, rng, cx, cy, rx, ry):
    pts = blob(cx, cy, rx, ry, rng, 0.16)
    for (x, y), e in pts.items():
        if not inside(x, y):
            continue
        dy = y + 0.5 - cy
        c = pal([hx('#0c0a1c'), hx('#1a1640'), hx('#2a2258')], (dy / ry + 1.0) * 0.5)
        if e > 0.8:
            c = mix(cv.get(x, y), hx('#0a0a14'), 0.45)
        if e < 0.8 and -2.0 <= dy < -1.0 and (x * 7) % 6:
            c = mix(c, NEON_PINK, 0.65 if x % 3 else 0.4)
        elif e < 0.72 and 1.0 <= dy < 2.0 and x % 5 != 4:
            c = mix(c, NEON_CYAN, 0.5)
        cv.set(x, y, c)
    keys = sorted(k for k, e in pts.items() if e < 0.5 and inside(*k))
    for _ in range(2):
        cv.set(*rng.choice(keys), hx('#e8f0ff'))


def v_asphalt1(cv, rng):
    draw_crack(cv, crack_pts(rng, 5, 8, 0.3, 24, branch=0.35), 0.7, 0.3)
    stain(cv, rng, rng.randint(18, 22), rng.randint(18, 22), 4.0, 3.0, hx('#0a0812'), 0.55, 0.0)
    for (x, y) in [(8, 23), (10, 24), (9, 26)]:
        cv.set(x, y, hx('#0a0812'))


def v_asphalt2(cv, rng):
    manhole(cv, rng, 16.0, 16.0)


def v_asphalt_line1(cv, rng):
    draw_crack(cv, crack_pts(rng, 5, 6, 1.1, 28, branch=0.3), 0.75, 0.32)
    for x in range(rng.randint(18, 22), 26):
        for y in (15, 16, 17):
            if rng.random() < 0.6:
                cv.set(x, y, mix(cv.get(x, y), hx('#1a1a28'), 0.75))


def v_asphalt_line2(cv, rng):
    puddle(cv, rng, rng.randint(13, 18), 16.5, 8.0, 5.0)


# ---- dirt ---------------------------------------------------------------------

def t_dirt(cv, rng):
    n = fbm(rng, (16, 8, 4), (0.45, 0.35, 0.2))
    cols = [hx('#3a2028'), hx('#5a3830'), hx('#7a5038'), hx('#946a46')]
    for y in range(32):
        for x in range(32):
            c = pal(cols, n(x, y) * 1.3 - 0.12)
            r = rng.random()
            if r < 0.14:
                c = shift(c, -12)
            elif r < 0.24:
                c = shift(c, 9)
            cv.set(x, y, c)
    for _ in range(5):
        pebble(cv, rng.randint(0, 31), rng.randint(0, 31), rng.choice([hx('#b8a48a'), hx('#8a7a8a'), hx('#c8b49a')]))
    for _ in range(16):
        x, y = rng.randint(0, 31), rng.randint(0, 31)
        wset(cv, x, y, rng.choice([hx('#a8907a'), hx('#7a6a7a'), hx('#c8a882')]))
        wset(cv, x + 1, y + 1, dk(wget(cv, x + 1, y + 1), 0.35))
    for _ in range(14):
        x, y = rng.randint(0, 31), rng.randint(0, 31)
        wset(cv, x, y, hx('#2a161e'))
    for _ in range(3):
        x, y = rng.randint(0, 31), rng.randint(0, 31)
        wset(cv, x, y, hx('#8a9a3a'))
        wset(cv, x + 1, y - 1, hx('#b0b84a'))


def v_dirt1(cv, rng):
    for k, (sx, sy) in enumerate([(8, 6), (14, 15), (9, 22)]):
        for y in range(5):
            for x in range(3):
                if (x, y) in ((0, 0), (2, 0), (0, 4), (2, 4)) or y == 3 and x == 1:
                    continue
                c = dk(cv.get(sx + x, sy + y), 0.55 if y % 2 == 0 else 0.35)
                cv.set(sx + x, sy + y, c)
        for y in range(5):
            cv.set(sx + 3, sy + y, lt(cv.get(sx + 3, sy + y), 0.18))
    for _ in range(4):
        pebble(cv, rng.randint(18, 26), rng.randint(4, 26), rng.choice([hx('#c8b49a'), hx('#8a8a9a')]), wrap=False)


def v_dirt2(cv, rng):
    cx, cy = rng.randint(14, 18), rng.randint(14, 18)
    for (x, y), e in blob(cx, cy, 8.0, 5.0, rng, 0.3).items():
        if not inside(x, y):
            continue
        if e > 0.82:
            c = mix(cv.get(x, y), hx('#2a1418'), 0.5)
        else:
            c = hx('#24141e') if (x + y * 2) % 7 else hx('#2e1a24')
            if abs(y + 0.5 - cy + 1) < 0.6 and e < 0.6:
                c = hx('#5a3a7a')
            elif abs(y + 0.5 - cy - 1) < 0.6 and e < 0.4:
                c = hx('#3a4a6a')
        cv.set(x, y, c)
    cv.set(cx - 3, cy - 2, hx('#a890c8'))
    for _ in range(3):
        tuft(cv, rng.randint(4, 27), rng.choice([rng.randint(4, 7), rng.randint(25, 27)]), rng, 3,
             put=lambda a, b, c: cv.set(a, b, c) if inside(a, b) else None)


# ---- sidewalk -----------------------------------------------------------------

def t_sidewalk(cv, rng):
    n = fbm(rng, (8, 4), (0.6, 0.4))
    tones = [[rng.choice([-8, -3, 0, 4, 8]) for _ in range(2)] for _ in range(2)]
    tints = [[hx(rng.choice(['#aca6b8', '#a6aab4', '#b0aaaa', '#aaa6b2'])) for _ in range(2)] for _ in range(2)]
    seam = hx('#3a3448')
    for y in range(32):
        for x in range(32):
            c = shift(tints[y // 16][x // 16], tones[y // 16][x // 16] + int((n(x, y) - 0.5) * 14))
            r = rng.random()
            if r < 0.08:
                c = shift(c, -16)
            elif r < 0.13:
                c = shift(c, 12)
            gx, gy = x % 16, y % 16
            if gx == 0 or gy == 0:
                c = seam
            elif gx == 1 or gy == 1:
                c = lt(c, 0.2)
            elif gx == 15 or gy == 15:
                c = dk(c, 0.16)
            cv.set(x, y, c)
    for (x, y) in [(5, 9), (22, 4), (26, 24)]:
        cv.set(x, y, hx('#5a5466'))
        cv.set(x + 1, y, hx('#6a6476'))
        cv.set(x, y + 1, hx('#4a4456'))


def v_sidewalk1(cv, rng):
    draw_crack(cv, crack_pts(rng, 17, 3, 1.2, 14, branch=0.4), 0.55, 0.18)
    draw_crack(cv, crack_pts(rng, 3, 25, -0.2, 11, branch=0.2), 0.55, 0.18)
    butt(cv, rng.randint(6, 10), rng.randint(5, 10))
    butt(cv, rng.randint(20, 24), rng.randint(20, 26), horiz=False)


def v_sidewalk2(cv, rng):
    sx, sy = rng.randint(7, 10), rng.randint(19, 23)
    for _ in range(5):     # dried spatter
        stain(cv, rng, sx + rng.uniform(-3, 3), sy + rng.uniform(-2, 2), rng.uniform(0.9, 1.8), rng.uniform(0.8, 1.4),
              hx('#2a2434'), 0.5, 0.0, 0.1)
    for (dx, dy) in [(0, 0), (1, 0), (-1, 0), (0, 1), (0, -1), (1, 1), (-1, -1), (2, 0), (0, 2)]:
        c = hx('#2a2434') if abs(dx) + abs(dy) < 2 else hx('#5a5666')
        cv.set(16 + dx, 16 + dy, c)
    cv.set(17, 17, hx('#c8c4d0'))
    for c_ in [hx('#e07a2a'), hx('#c8442a'), hx('#e8b83a')]:
        leaf(cv, rng.randint(19, 24), rng.randint(4, 12), c_, rng)


# ---- neon dance floor ---------------------------------------------------------

NEON_PINK, NEON_CYAN = hx('#ff2a6d'), hx('#05d9e8')


def neon_line_px(x, y):
    """Colour of the glowing grid line at (x, y), or None."""
    gx, gy = x % 16, y % 16
    if gx == 0 and gy == 0:
        return hx('#fff4ff')
    if gx == 0:
        return lt(NEON_CYAN, 0.35) if gy in (1, 15) else mix(NEON_CYAN, hx('#ffffff'), 0.25)
    if gy == 0:
        return lt(NEON_PINK, 0.35) if gx in (1, 15) else mix(NEON_PINK, hx('#ffffff'), 0.2)
    return None


def t_neon(cv, rng):
    panels = [[hx(rng.choice(['#170a2c', '#1c0c34', '#140826', '#200e3a'])) for _ in range(2)] for _ in range(2)]
    for y in range(32):
        for x in range(32):
            gx, gy = x % 16, y % 16
            c = panels[y // 16][x // 16]
            c = mix(c, hx('#3a1a66'), 0.22 * max(0.0, 1.0 - (gx + gy) / 16.0))
            if 3 <= gx <= 13 and 3 <= gy <= 13 and (gx - gy) in (4, 5) and gx + gy < 24:
                c = mix(c, hx('#5a3a9a'), 0.35)
            if rng.random() < 0.1:
                c = shift(c, rng.choice([-5, 6]))
            dxl, dyl = min(gx, 16 - gx), min(gy, 16 - gy)
            c = mix(c, NEON_CYAN, [0, 0.42, 0.18, 0.07][min(3, dxl)])
            c = mix(c, NEON_PINK, [0, 0.42, 0.18, 0.07][min(3, dyl)])
            if gx in (3, 13) and gy in (3, 13):
                c = hx('#5a4a7a')
            line = neon_line_px(x, y)
            cv.set(x, y, line if line else c)


def neon_glow():
    cv = Cv(32, 32)
    for y in range(32):
        for x in range(32):
            c = neon_line_px(x, y)
            if c:
                cv.set(x, y, c)
    return cv


def lit_panel(cv, px, py, col, hot):
    for y in range(py * 16 + 2, py * 16 + 14):
        for x in range(px * 16 + 2, px * 16 + 14):
            d = max(abs(x + 0.5 - px * 16 - 8), abs(y + 0.5 - py * 16 - 8)) / 6.0
            c = mix(hot, col, min(1.0, d * 1.1))
            if bayer(x, y, d - 0.75):
                c = dk(c, 0.3)
            cv.set(x, y, c)


def v_neon1(cv, rng):
    lit_panel(cv, *rng.choice([(0, 0), (1, 1)]), hx('#c0189a'), hx('#ff9ae0'))


def v_neon2(cv, rng):
    lit_panel(cv, 1, 0, hx('#0a8ab8'), hx('#9af6ff'))
    pts = crack_pts(rng, 6, 22, 0.3, 9, margin=3, branch=0.6)
    for (x, y) in pts:
        if 2 <= x % 16 <= 14 and 2 <= y % 16 <= 14:
            cv.set(x, y, hx('#b8a0e8'))


# ---- wall tops ----------------------------------------------------------------

def t_wall(cv, rng):
    n = fbm(rng, (16, 8, 4), (0.5, 0.3, 0.2))
    cols = [hx('#a8949a'), hx('#c6b4b0'), hx('#dccabc'), hx('#ecdccc')]
    for y in range(32):
        for x in range(32):
            c = pal(cols, n(x, y) * 1.2 - 0.05)
            if bayer(x * 3 + y, y * 5 + x, 0.18):
                c = dk(c, 0.07)
            r = rng.random()
            if r < 0.06:
                c = dk(c, 0.12)
            elif r < 0.12:
                c = lt(c, 0.15)
            cv.set(x, y, c)
    draw_crack(cv, crack_pts(rng, 20, 9, 2.2, 10, margin=None, branch=0.3), 0.18, 0.1)


def t_brick(cv, rng):
    mortar = hx('#3a2a3e')
    cols = ['#8a2c24', '#9a3428', '#7a2620', '#a83e2a', '#6c2420', '#94301e']
    bricks = {}
    for y in range(32):
        row = y // 4
        off = 4 if row % 2 else 0
        for x in range(32):
            bx = ((x + off) % 32) // 8
            key = (row, bx)
            if key not in bricks:
                bricks[key] = hx('#4a2034') if rng.random() < 0.08 else hx(rng.choice(cols))
            gx, gy = (x + off) % 8, y % 4
            if gy == 3 or gx == 7:
                c = jit(mortar, 6, rng)
                if rng.random() < 0.12:
                    c = hx('#5a4a5a')
            else:
                c = bricks[key]
                if gy == 0:
                    c = lt(c, 0.2)
                elif gy == 2:
                    c = dk(c, 0.15)
                if gx == 0:
                    c = lt(c, 0.08)
                elif gx == 6:
                    c = dk(c, 0.1)
                r = rng.random()
                if r < 0.12:
                    c = shift(c, -14)
                elif r < 0.2:
                    c = shift(c, 10)
            cv.set(x, y, c)


FLOOR_TILES = [
    ('wood', t_wood, v_wood1, v_wood2),
    ('checker', t_checker, v_checker1, v_checker2),
    ('tile_blue', t_tile_blue, v_tile_blue1, v_tile_blue2),
    ('carpet_red', t_carpet_red, lambda cv, r: v_carpet1(cv, r, hx('#280418')), v_carpet2),
    ('carpet_purple', t_carpet_purple, lambda cv, r: v_carpet1(cv, r, hx('#120624')), v_carpet2),
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
# Vehicles (top-down, facing +x). Layout contract shared by car/car2/van:
# windshield x 46..54 (van 62..70), rear window x 14..20, lights at the
# front/back edges on y 5..9 and 27..31. Wheels are drawn by the game.
# --------------------------------------------------------------------------

GLASS = [hx('#0c1020'), hx('#141c34'), hx('#1e2c4c'), hx('#2c4068')]
HEAD_C, HEAD_GLOW = hx('#fff4d6'), (255, 240, 205, 255)
TAIL_C, TAIL_GLOW = hx('#ff2a3a'), (255, 36, 48, 255)


def car_body(cv, W, cy, hw, body, x0, x1, cr_rear, cr_front, flat=0.0):
    for y in range(cv.h):
        for x in range(x0, x1 + 1):
            v = y + 0.5 - cy
            if abs(v) > hw:
                continue
            u_r, u_f = x - x0, x1 - x
            cr = cr_rear if u_r < u_f else cr_front
            ex = cr - min(u_r, u_f) - 0.5
            ey = abs(v) - (hw - cr)
            if ex > 0 and ey > 0 and ex * ex + ey * ey > cr * cr:
                continue
            nv = v / hw
            edge = max(0.0, 1.0 - min(u_r, u_f) / 4.0)
            L = light((-edge if u_r < u_f else edge) * 0.7, math.copysign(abs(nv) ** (3 + flat), v) * 0.95)
            cv.set(x, y, tone(body, L))


def glass_px(x, y, x0, x1, y0, y1, streaks=True):
    t = (y - y0) / max(1, y1 - y0)
    c = pal(GLASS, 0.9 - t * 0.8 + (x - x0) / max(1, x1 - x0) * 0.25)
    if streaks:
        s = (x - x0) + (y - y0) * 0.3
        if 2.0 <= s < 3.0 or 4.0 <= s < 4.6:
            c = mix(c, hx('#7ad8f0'), 0.5)
        elif 8.0 <= s < 9.0:
            c = mix(c, hx('#ff7ab4'), 0.4)
    return c


def windshield(cv, x0, x1, cy, h0, h1, body):
    for x in range(x0, x1 + 1):
        half = h0 + (h1 - h0) * (x - x0) / max(1, x1 - x0)
        ya, yb = int(math.ceil(cy - half)), int(math.floor(cy + half - 0.01))
        for y in range(ya, yb + 1):
            c = glass_px(x, y, x0, x1, ya, yb)
            if y in (ya, yb) or x == x0:
                c = body[0]
            cv.set(x, y, c)
    cv.set(x0 + 2, int(cy - h0) + 2, hx('#e8f8ff'))


def rear_window(cv, x0, x1, cy, half, body, louvres=False):
    for x in range(x0, x1 + 1):
        h = half - (x1 - x) * 0.25
        ya, yb = int(math.ceil(cy - h)), int(math.floor(cy + h - 0.01))
        for y in range(ya, yb + 1):
            c = glass_px(x, y, x0, x1, ya, yb, streaks=False)
            if y in (ya, yb) or x == x1:
                c = body[0]
            elif louvres and x % 2 == 0:
                c = mix(c, body[1], 0.55)
            cv.set(x, y, c)
    cv.set(x1 - 2, int(cy - half) + 2, hx('#7ad8f0'))


def lamps(cv, gl, xs, ys_list, col, glow, frame):
    for ys in ys_list:
        for y in range(ys[0], ys[1] + 1):
            for x in range(xs[0], xs[1] + 1):
                edge = y in ys and x == xs[0]
                c = frame if edge else (lt(col, 0.45) if y == ys[0] + 1 or (y - ys[0] + x) % 4 == 0 else col)
                cv.set(x, y, c)
                if not edge:
                    gl.set(x, y, glow)


def mirror(cv, x, y, body):
    cv.set(x, y, body[3])
    cv.set(x + 1, y, body[2])


def p_car():
    cv, gl = Cv(76, 36), Cv(76, 36)
    body = ramp('#ff2a6d', 0.55, 0.3, 0.4)
    cy = 18.5
    car_body(cv, 76, cy, 15.5, body, 1, 74, 3.0, 4.5)
    mirror(cv, 45, 2, body)
    mirror(cv, 45, 34, body)
    for x in range(21, 46):   # roof + side glass
        for y in range(6, 31):
            dv = abs(y + 0.5 - cy)
            if dv > 10.3:
                cv.set(x, y, GLASS[2] if y < cy else GLASS[0])
                if y == 6 and x % 5 == 0:
                    cv.set(x, y, hx('#5aa8d8'))
            elif dv > 9.3:
                cv.set(x, y, body[0])
            else:
                cv.set(x, y, body[3] if y < cy - 6 else body[2] if y < cy + 5 else body[1])
    for x in range(26, 42):
        cv.set(x, 11, lt(body[3], 0.3) if x < 34 else body[3])
    rear_window(cv, 14, 20, cy, 11.0, body, louvres=True)
    windshield(cv, 46, 54, cy, 11.0, 13.5, body)
    for y in (12, 25):     # hood creases
        for x in range(56, 71):
            cv.set(x, y, body[1] if y > cy else body[3])
            cv.set(x, y + 1, body[0] if y > cy else body[1])
    for x in range(57, 64, 2):    # hood louvres
        for y in range(15, 23):
            cv.set(x, y, hx('#2a0a1c'))
            cv.set(x + 1, y, body[3])
    for x in range(5, 12, 3):     # engine cover slats behind the cabin
        for y in range(10, 27):
            cv.set(x, y, body[1])
    for x in range(4, 72):        # cyan pin stripes
        cv.set(x, 4, NEON_CYAN)
        cv.set(x, 32, dk(NEON_CYAN, 0.25))
    for x in (24, 45):
        for y in (3, 4, 5, 31, 32, 33):
            cv.set(x, y, body[0])
    cv.outline()
    for y in range(10, 27):       # rear light bar + front grille
        cv.set(1, y, hx('#5a0a1c') if y % 2 else hx('#2a0612'))
        cv.set(2, y, hx('#7a1024') if y % 2 else hx('#3a0818'))
        cv.set(74, y, hx('#1a1424') if y % 2 else hx('#6a6478'))
    lamps(cv, gl, (72, 74), [(5, 9), (27, 31)], HEAD_C, HEAD_GLOW, hx('#c8c8d8'))
    lamps(cv, gl, (1, 2), [(5, 9), (27, 31)], TAIL_C, TAIL_GLOW, hx('#7a0818'))
    return cv, gl


def p_car2():
    cv, gl = Cv(76, 36), Cv(76, 36)
    body = ramp('#e8ecf4', 0.5, 0.24, 0.25)
    teal, purp = NEON_CYAN, hx('#7a1fa2')
    cy = 18.5
    car_body(cv, 76, cy, 15.5, body, 1, 74, 2.5, 3.5, flat=1.0)
    mirror(cv, 46, 2, body)
    mirror(cv, 46, 34, body)
    for x in range(21, 46):   # T-top roof: smoked glass panels around a white bar
        for y in range(6, 31):
            dv = abs(y + 0.5 - cy)
            if dv > 10.3:
                cv.set(x, y, GLASS[1])
            elif dv > 9.3 or x in (21, 45):
                cv.set(x, y, body[1])
            elif dv < 1.6:
                cv.set(x, y, body[3] if y < cy else body[2])
            else:
                c = glass_px(x, y, 21, 45, 6, 30, streaks=False)
                if (x - 21) + (y - 6) * 0.7 in (9, 10) or (x - 21) - (y - 6) * 0.3 == 14:
                    c = mix(c, hx('#a0e8ff'), 0.5)
                cv.set(x, y, c)
    rear_window(cv, 14, 20, cy, 11.0, body)
    windshield(cv, 46, 54, cy, 11.0, 13.5, body)
    for x in list(range(3, 14)) + list(range(55, 72)):   # twin racing stripes
        for y in (15, 16, 21, 22):
            cv.set(x, y, teal if y in (15, 21) else dk(teal, 0.25))
    for x in range(56, 64, 2):
        for y in (8, 9, 10, 27, 28, 29):
            cv.set(x, y, dk(body[0], 0.4))
    for x in range(4, 72):
        cv.set(x, 5, purp)
        cv.set(x, 31, dk(purp, 0.2))
    for y in range(5, 32):        # rear wing
        cv.set(4, y, hx('#2a2434'))
        cv.set(5, y, hx('#4a4458') if y % 4 else hx('#2a2434'))
    for x in (25, 46):
        for y in (3, 4, 32, 33):
            cv.set(x, y, body[0])
    cv.outline()
    for y in range(10, 27):
        cv.set(1, y, hx('#2a2434'))
        cv.set(2, y, hx('#5a1028') if y % 3 else hx('#2a2434'))
        cv.set(74, y, hx('#2a2434') if y % 2 else hx('#9a96aa'))
    lamps(cv, gl, (72, 74), [(5, 9), (27, 31)], HEAD_C, HEAD_GLOW, hx('#2a2434'))
    for y in (7, 29):
        cv.set(73, y, hx('#2a2434'))
        gl.set(73, y, CLEAR)
    lamps(cv, gl, (1, 2), [(5, 9), (27, 31)], TAIL_C, TAIL_GLOW, hx('#3a0818'))
    return cv, gl


def p_van():
    cv, gl = Cv(84, 38), Cv(84, 38)
    body = ramp('#e2d2b0', 0.5, 0.26, 0.3)
    cy = 19.0
    car_body(cv, 84, cy, 16.0, body, 1, 82, 2.0, 5.0, flat=1.5)
    mirror(cv, 63, 2, body)
    mirror(cv, 63, 35, body)
    sunset = [hx('#f9c80e'), hx('#ff6b1a'), hx('#ff2a6d'), hx('#7a1fa2')]
    for x in range(3, 62):    # roof panel with ribs
        for y in range(8, 31):
            c = body[2] if y > 9 else body[3]
            if y == 30:
                c = body[1]
            if x % 6 == 0 and 4 < x < 60:
                c = body[1]
            elif x % 6 == 1 and 4 < x < 60:
                c = body[3]
            cv.set(x, y, c)
    for i, col in enumerate(sunset):   # sunset side stripes
        for x in range(3, 70 - i * 2):
            cv.set(x, 4 + i, col)
            cv.set(x, 33 - i, dk(col, 0.2))
    for x in range(29, 41):   # smoked roof hatch
        for y in range(14, 25):
            c = pal(GLASS, 0.8 - (y - 14) / 10 * 0.55)
            if x in (29, 40) or y in (14, 24):
                c = hx('#4a4458') if (x == 40 or y == 24) else hx('#8a849a')
            elif (x - 29) + (y - 14) * 0.5 in (4, 4.5, 5):
                c = mix(c, hx('#a0e8ff'), 0.5)
            cv.set(x, y, c)
    for y in (11, 27):        # roof rack rails + rungs
        for x in range(7, 24):
            cv.set(x, y, hx('#5a546a'))
            cv.set(x, y + 1, hx('#2a2434'))
    for x in (8, 14, 20):
        for y in range(12, 27):
            cv.set(x, y, hx('#5a546a'))
            cv.set(x + 1, y, hx('#2a2434'))
    windshield(cv, 62, 70, cy, 12.5, 14.4, body)
    for x in range(73, 80):
        cv.set(x, 18, body[3])
        cv.set(x, 19, body[1])
    for y in range(4, 34):
        cv.set(2, y, body[1])
    for x in range(1, 4):
        cv.set(x, 18, body[0])
    for x in (45, 61):
        for y in (3, 4, 33, 34):
            cv.set(x, y, body[0])
    cv.outline()
    for y in range(11, 26):
        cv.set(81, y, hx('#1a1424') if y % 2 else hx('#a8a4b8'))
        cv.set(82, y, hx('#2a2434'))
    lamps(cv, gl, (80, 82), [(5, 9), (27, 31)], HEAD_C, HEAD_GLOW, hx('#c8c8d8'))
    lamps(cv, gl, (1, 2), [(5, 9), (27, 31)], TAIL_C, TAIL_GLOW, hx('#7a0818'))
    return cv, gl


def p_car_tire():
    cv = Cv(9, 5)
    for y in range(5):
        for x in range(9):
            if (x in (0, 8)) and (y in (0, 4)):
                continue
            c = hx('#2a2634') if (x + (y > 2)) % 2 else hx('#16121e')
            if y == 0 or x == 0:
                c = hx('#3e3a4a') if x % 2 else hx('#2a2634')
            cv.set(x, y, c)
    for (x, y, c) in [(3, 1, '#d8dce8'), (4, 1, '#f4f6ff'), (5, 1, '#a8acc0'), (3, 2, '#a8acc0'),
                      (4, 2, '#5a5e70'), (5, 2, '#8a8ea0'), (3, 3, '#8a8ea0'), (4, 3, '#6a6e80'), (5, 3, '#5a5e70')]:
        cv.set(x, y, hx(c))
    return cv


def p_car_hood():
    cv = Cv(20, 30)
    body = ramp('#ff2a6d', 0.55, 0.3, 0.4)
    for y in range(1, 29):
        for x in range(1, 19):
            k = 0.5 + 0.5 * math.sin((x + y * 0.6) * 0.45)
            bend = (x + 0.6 * y) - 20.0
            c = body[2] if k > 0.35 else body[1]
            if y < 4:
                c = body[3]
            if -1.0 < bend < 0.6:
                c = body[3]
            elif 0.6 <= bend < 2.0:
                c = body[0]
            cv.set(x, y, c)
    for y in (8, 21):
        for x in range(3, 17):
            cv.set(x, y, body[1] if y > 15 else body[3])
    for x in range(4, 11, 2):
        for y in range(11, 18):
            cv.set(x, y, hx('#2a0a1c'))
    for (x, y) in [(1, 1), (18, 1), (18, 2), (17, 28), (18, 28), (18, 27), (1, 28)]:
        cv.set(x, y, CLEAR)
    cv.set(15, 26, hx('#9a96aa'))
    cv.outline()
    return cv


def p_car_door():
    cv = Cv(18, 4)
    body = ramp('#ff2a6d', 0.55, 0.3, 0.4)
    for x in range(1, 17):
        cv.set(x, 0, body[3])
        cv.set(x, 1, body[2])
        cv.set(x, 2, GLASS[2] if 3 < x < 14 else body[1])
        cv.set(x, 3, body[0])
    cv.set(0, 1, OUTLINE)
    cv.set(0, 2, OUTLINE)
    cv.set(17, 1, OUTLINE)
    cv.set(17, 2, OUTLINE)
    cv.set(13, 1, hx('#e8e8f4'))
    cv.set(5, 0, NEON_CYAN)
    cv.set(6, 0, NEON_CYAN)
    cv.set(7, 0, NEON_CYAN)
    return cv


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
                  bar_counter=(32, 14), car=(76, 36), dumpster=(36, 22), trash_can=(12, 12),
                  car2=(76, 36), van=(84, 38), car_tire=(9, 5), car_hood=(20, 30), car_door=(18, 4),
                  palm_tree=(56, 56), streetlight=(14, 10), neon_sign_palm=(40, 14), neon_sign_bar=(44, 14),
                  neon_sign_arrow=(30, 12), jukebox=(20, 14), hydrant=(8, 8), bench=(36, 12))
FLOOR_NAMES = [t[0] for t in FLOOR_TILES]
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
