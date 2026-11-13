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
        cv.set(x, 6, hx('#9ef6ff'))
        cv.set(x, 7, (5, 217, 232, 110))
    cv.set(1, 6, OUTLINE)
    cv.set(22, 6, OUTLINE)
    return cv


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
    cv = Cv(20, 16)
    cab = ramp('#2c1e44', 0.5, 0.2, 0.35)
    fill_shape(cv, 10.0, 6.0, 8.6, 5.2, lambda u, v, L: tone(cab, L), kind='rect', bevel=2.0, corner=1.0)
    for y in range(2, 8):
        cv.set(2, y, hx('#ff2a6d'))
        cv.set(17, y, hx('#05d9e8'))
    cv.rect(3, 8, 16, 10, hx('#ff2a6d'))
    cv.rect(3, 8, 16, 8, hx('#ff8ab4'))
    cv.rect(3, 10, 16, 10, hx('#05d9e8'))
    for x in (5, 9, 13):
        cv.set(x, 9, hx('#fff0f8'))
    panel = Cv(20, 16)
    fill_shape(panel, 10.0, 12.6, 7.5, 1.9, lambda u, v, L: tone(ramp('#3e3650'), L), kind='rect', bevel=1.2, corner=0.8)
    panel.set(6, 12, hx('#ff3a3a'))
    panel.set(6, 13, hx('#a01820'))
    panel.set(11, 13, hx('#05d9e8'))
    panel.set(13, 13, hx('#f9c80e'))
    panel.set(15, 13, hx('#ff2a6d'))
    panel.outline()
    cv.outline()
    cv.over(panel)
    return cv


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


def p_car():
    cv = Cv(76, 36)
    body = ramp('#ff2a6d', 0.55, 0.3, 0.4)
    cx, cy = 38.0, 18.0

    def hw(u):
        w = 14.6
        if u > 22:
            w -= (u - 22) * 0.12
        return w

    for y in range(36):
        for x in range(76):
            u, v = x + 0.5 - cx, y + 0.5 - cy
            if u < -35.6 or u > 35.6 or abs(v) > hw(u):
                continue
            # rounded corners
            cr = 5.5 if u > 0 else 4.0
            ex = abs(u) - (35.6 - cr)
            ey = abs(v) - (hw(u) - cr)
            if ex > 0 and ey > 0 and ex * ex + ey * ey > cr * cr:
                continue
            nv = v / hw(u)
            nu = max(0.0, (abs(u) - 30) / 6.0) * (1 if u > 0 else -1)
            L = light(nu * 0.8, (abs(nv) ** 3) * (1 if v > 0 else -1) * 0.95)
            col = tone(body, L)
            cv.set(x, y, col)
    glass = hx('#141826')
    glass_h = hx('#2e4a6a')
    # windshield (trapezoid), roof, rear window with louvres
    for x in range(41, 49):
        half = 10 - (x - 41) * 0.35
        for y in range(int(cy - half), int(cy + half)):
            cv.set(x, y, glass)
    for i, x in enumerate(range(42, 48)):
        cv.set(x, int(cy - 8 + i * 2), glass_h)
        cv.set(x, int(cy - 7 + i * 2), glass_h)
    for x in range(27, 41):
        for y in range(int(cy - 10), int(cy + 10)):
            cv.set(x, y, body[3] if y < cy - 6 else body[2] if y < cy + 6 else body[1])
    for x in range(20, 27):
        half = 8 + (x - 20) * 0.3
        for y in range(int(cy - half), int(cy + half)):
            cv.set(x, y, glass if x % 2 == 0 else body[0])
    # side windows hint
    for x in range(29, 41):
        cv.set(x, int(cy - 11), glass)
        cv.set(x, int(cy + 10), glass)
    # hood lines + vents
    for x in range(52, 70):
        cv.set(x, int(cy - 6), body[1])
        cv.set(x, int(cy + 5), body[1])
    for x in range(55, 62, 2):
        for y in range(int(cy - 2), int(cy + 2)):
            cv.set(x, y, body[0])
    # pop-up headlights (closed lids)
    for (yy) in (int(cy - 11), int(cy + 6)):
        cv.rect(65, yy, 70, yy + 4, body[2])
        for x in range(65, 71):
            cv.set(x, yy, body[0])
            cv.set(x, yy + 4, body[0])
        cv.rect(65, yy, 65, yy + 4, body[0])
        cv.rect(70, yy + 1, 70, yy + 3, hx('#fff6d0'))
    # tail lights
    for y in range(int(cy - 11), int(cy + 11)):
        cv.set(2, y, hx('#ff3030') if (y // 3) % 2 == 0 else hx('#c01020'))
        cv.set(3, y, hx('#7a0810'))
    # pin stripes (cyan)
    for x in range(8, 68):
        if not (20 <= x <= 48):
            cv.set(x, int(cy - 12), hx('#05d9e8'))
            cv.set(x, int(cy + 11), hx('#05d9e8'))
    # mirrors
    for (x, y) in [(43, 2), (44, 2), (43, 33), (44, 33)]:
        cv.set(x, y, body[1])
    cv.outline()
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
# Tiles (32x32, seamless)
# --------------------------------------------------------------------------

def tile(fn, seed):
    rng = random.Random(seed)
    cv = Cv(32, 32)
    fn(cv, rng)
    return cv


def t_wood(cv, rng):
    plank_h = 8
    offs = [0, 13, 5, 22]
    tones = [[rng.choice([-8, -4, 0, 4, 7]) for _ in range(2)] for _ in range(4)]
    grain = [[rng.choice([0, 0, -1, 1, 0, -1]) for _ in range(8)] for _ in range(32)]
    base = hx('#8a5a36')
    for y in range(32):
        for x in range(32):
            r = y // plank_h
            seg = 0
            c = shift(base, tones[r][seg])
            c = shift(c, grain[y][(x - offs[r]) % 32 // 4] * 5)
            if y % plank_h == plank_h - 1:
                c = dk(c, 0.3)
            elif y % plank_h == 0:
                c = lt(c, 0.06)
            if (x - offs[r]) % 32 == 0 and y % plank_h != plank_h - 1:
                c = dk(c, 0.25)
            if rng.random() < 0.05:
                c = shift(c, rng.choice([-5, 5]))
            cv.set(x, y, c)


def t_checker(cv, rng):
    wht, blk, grout = hx('#dcd6c6'), hx('#302c36'), hx('#8a8476')
    for y in range(32):
        for x in range(32):
            if x % 8 == 7 or y % 8 == 7:
                c = grout
            else:
                c = wht if ((x // 8) + (y // 8)) % 2 == 0 else blk
                if x % 8 == 0 or y % 8 == 0:
                    c = lt(c, 0.06)
                c = jit(c, 3, rng)
            cv.set(x, y, c)


def t_tile_blue(cv, rng):
    base, grout = hx('#8ec4dc'), hx('#5e8aa2')
    tones = [[rng.choice([-6, -3, 0, 3, 5]) for _ in range(4)] for _ in range(4)]
    for y in range(32):
        for x in range(32):
            if x % 8 == 7 or y % 8 == 7:
                c = grout
            else:
                c = shift(base, tones[y // 8][x // 8])
                if x % 8 == 0 or y % 8 == 0:
                    c = lt(c, 0.15)
                elif x % 8 == 6 or y % 8 == 6:
                    c = dk(c, 0.08)
                c = jit(c, 2, rng)
            cv.set(x, y, c)
    for ty in range(4):
        for tx in range(4):
            if rng.random() < 0.5:
                cv.set(tx * 8 + 1, ty * 8 + 1, hx('#e8f8ff'))


def t_carpet(base, pat, rng, cv, kind):
    n = VNoise(32, 32, 8, rng)
    for y in range(32):
        for x in range(32):
            c = shift(base, int((n(x, y) - 0.5) * 10))
            if kind == 'red':
                d = abs(x % 8 - 4) + abs(y % 8 - 4)
                if d == 3:
                    c = pat
                elif d == 0:
                    c = mix(pat, base, 0.4)
            else:
                zz = abs((x % 8) - 4)
                if (y % 16) == zz or (y % 16) == zz + 8:
                    c = pat
                if (x % 16 == 12) and (y % 16 == 4):
                    c = mix(pat, hx('#05d9e8'), 0.3)
            if rng.random() < 0.15:
                c = shift(c, rng.choice([-6, 6]))
            cv.set(x, y, c)


def t_concrete(cv, rng):
    n = VNoise(32, 32, 8, rng)
    n2 = VNoise(32, 32, 4, rng)
    base = hx('#76767a')
    for y in range(32):
        for x in range(32):
            c = shift(base, int((n(x, y) - 0.5) * 14 + (n2(x, y) - 0.5) * 6))
            r = rng.random()
            if r < 0.06:
                c = shift(c, -14)
            elif r < 0.1:
                c = shift(c, 10)
            cv.set(x, y, c)
    x, y = rng.randint(0, 31), rng.randint(0, 31)
    for _ in range(26):
        cv.set(x % 32, y % 32, dk(cv.get(x % 32, y % 32), 0.22))
        x += 1
        y += rng.choice([-1, 0, 0, 1])


def t_grass(cv, rng):
    n = VNoise(32, 32, 8, rng)
    base = hx('#2e5c28')
    for y in range(32):
        for x in range(32):
            cv.set(x, y, shift(base, int((n(x, y) - 0.5) * 14)))
    for _ in range(80):
        x, y = rng.randint(0, 31), rng.randint(0, 31)
        col = hx('#3e7430') if rng.random() < 0.55 else hx('#224822')
        ln = rng.choice([2, 2, 3])
        for k in range(ln):
            cv.set(x, (y + k) % 32, col if k else lt(col, 0.1))


def t_asphalt(cv, rng, line=False):
    n = VNoise(32, 32, 8, rng)
    base = hx('#2c3038')
    for y in range(32):
        for x in range(32):
            c = shift(base, int((n(x, y) - 0.5) * 8))
            r = rng.random()
            if r < 0.07:
                c = shift(c, 12)
            elif r < 0.13:
                c = shift(c, -7)
            elif r < 0.135:
                c = hx('#6a6e78')
            cv.set(x, y, c)
    if line:
        for y in (15, 16, 17):
            for x in range(32):
                c = hx('#e8b923') if y != 17 else hx('#c89818')
                if rng.random() < 0.1:
                    c = mix(c, cv.get(x, y), 0.6)
                cv.set(x, y, c)


def t_dirt(cv, rng):
    n = VNoise(32, 32, 8, rng)
    base = hx('#6a4a30')
    for y in range(32):
        for x in range(32):
            c = shift(base, int((n(x, y) - 0.5) * 16))
            if rng.random() < 0.12:
                c = shift(c, rng.choice([-9, 7]))
            cv.set(x, y, c)
    for _ in range(9):
        x, y = rng.randint(0, 31), rng.randint(0, 31)
        col = rng.choice([hx('#9a8a74'), hx('#8a7258'), hx('#a8987c')])
        cv.set(x, y, col)
        if rng.random() < 0.6:
            cv.set((x + 1) % 32, y, dk(col, 0.15))
        cv.set(x % 32, (y + 1) % 32, hx('#4a321e'))


def t_sidewalk(cv, rng):
    base = hx('#a6a6a2')
    tones = [[rng.choice([-6, -2, 0, 3, 6]) for _ in range(2)] for _ in range(2)]
    for y in range(32):
        for x in range(32):
            c = shift(base, tones[y // 16][x // 16])
            if x % 16 == 0 or y % 16 == 0:
                c = hx('#74746f')
            elif x % 16 == 1 or y % 16 == 1:
                c = lt(c, 0.1)
            elif x % 16 == 15 or y % 16 == 15:
                c = dk(c, 0.06)
            if rng.random() < 0.08:
                c = shift(c, rng.choice([-10, 8]))
            cv.set(x, y, c)


def t_neon(cv, rng):
    cells = [[hx(rng.choice(['#140a24', '#1a0c2e', '#100a20', '#1c0e30'])) for _ in range(2)] for _ in range(2)]
    pink, cyan = hx('#ff2a6d'), hx('#05d9e8')
    for y in range(32):
        for x in range(32):
            c = cells[y // 16][x // 16]
            if rng.random() < 0.08:
                c = shift(c, 6)
            gx, gy = x % 16, y % 16
            if gx in (1, 15):
                c = mix(c, cyan, 0.18)
            if gy in (1, 15):
                c = mix(c, pink, 0.18)
            if gx == 0:
                c = cyan
            if gy == 0:
                c = pink if gx != 0 else hx('#ffe8ff')
            cv.set(x, y, c)


def t_wall(cv, rng):
    n = VNoise(32, 32, 8, rng)
    base = hx('#d6caae')
    for y in range(32):
        for x in range(32):
            c = shift(base, int((n(x, y) - 0.5) * 10))
            if rng.random() < 0.1:
                c = shift(c, rng.choice([-6, 5]))
            cv.set(x, y, c)


def t_brick(cv, rng):
    mortar = hx('#2e1e1a')
    cols = ['#5e261e', '#6a2c22', '#56221c', '#703024', '#4e201a']
    bricks = {}
    for y in range(32):
        row = y // 4
        off = 4 if row % 2 else 0
        for x in range(32):
            bx = ((x + off) % 32) // 8
            key = (row, bx)
            if key not in bricks:
                bricks[key] = hx(rng.choice(cols))
            if y % 4 == 3 or (x + off) % 8 == 7:
                c = mortar
            else:
                c = bricks[key]
                if y % 4 == 0:
                    c = lt(c, 0.12)
                if rng.random() < 0.12:
                    c = shift(c, rng.choice([-8, 6]))
            cv.set(x, y, c)


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
    props = dict(table=p_table, table_round=p_table_round, desk=p_desk, chair=p_chair, armchair=p_armchair,
                 sofa=p_sofa, plant=p_plant, tv=p_tv, fridge=p_fridge, oven=p_oven, sink=p_sink,
                 toilet=p_toilet, bed=p_bed, pool_table=p_pool_table, arcade=p_arcade, crate=p_crate,
                 barrel=p_barrel, bookshelf=p_bookshelf, speaker=p_speaker, dj_booth=p_dj_booth,
                 bar_counter=p_bar_counter, car=p_car, dumpster=p_dumpster, trash_can=p_trash_can)
    for name, fn in props.items():
        out[('props', name)] = fn()
    tiles = dict(
        wood=lambda cv, r: t_wood(cv, r),
        checker=t_checker, tile_blue=t_tile_blue,
        carpet_red=lambda cv, r: t_carpet(hx('#5c1220'), hx('#741a2a'), r, cv, 'red'),
        carpet_purple=lambda cv, r: t_carpet(hx('#2e1648'), hx('#44225e'), r, cv, 'purple'),
        concrete=t_concrete, grass=t_grass, asphalt=lambda cv, r: t_asphalt(cv, r),
        asphalt_line=lambda cv, r: t_asphalt(cv, r, True), dirt=t_dirt, sidewalk=t_sidewalk,
        neon_floor=t_neon, wall=t_wall, brick=t_brick)
    for i, (name, fn) in enumerate(tiles.items()):
        out[('tiles', name)] = tile(fn, 500 + i)
    out[('structure', 'door')] = s_door()
    out[('structure', 'window')] = s_window()
    out[('structure', 'fence')] = s_fence()
    return out


EXPECTED = {
    'characters': dict([(c + s, sz) for c in CHARS for s, sz in [
        ('_torso', (20, 20)), ('_down', (26, 16)), ('_dead0', (30, 22)), ('_dead1', (30, 22)),
        ('_gib_head', (9, 9)), ('_gib_arm', (11, 4)), ('_gib_leg', (13, 5)), ('_gib_torso', (14, 12))]]
        + [('gib_chunk0', (6, 5)), ('gib_chunk1', (6, 5)), ('gib_chunk2', (6, 5)), ('gib_eye', (3, 3))]),
    'weapons': dict(pistol=(11, 5), uzi=(12, 7), uzi_silenced=(18, 7), shotgun=(22, 5), rifle=(24, 7),
                    sniper=(28, 5), bazooka=(26, 7), bat=(22, 4), knife=(10, 3), rocket=(9, 4),
                    casing=(3, 2), shell=(4, 2)),
    'props': dict(table=(40, 24), table_round=(28, 28), desk=(36, 22), chair=(12, 12), armchair=(18, 18),
                  sofa=(44, 18), plant=(18, 18), tv=(24, 8), fridge=(22, 20), oven=(22, 20), sink=(24, 14),
                  toilet=(12, 16), bed=(30, 44), pool_table=(64, 36), arcade=(20, 16), crate=(18, 18),
                  barrel=(14, 14), bookshelf=(40, 10), speaker=(14, 14), dj_booth=(48, 18),
                  bar_counter=(32, 14), car=(76, 36), dumpster=(36, 22), trash_can=(12, 12)),
    'tiles': dict((n, (32, 32)) for n in ['wood', 'checker', 'tile_blue', 'carpet_red', 'carpet_purple',
                                          'concrete', 'grass', 'asphalt', 'asphalt_line', 'dirt', 'sidewalk',
                                          'neon_floor', 'wall', 'brick']),
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
