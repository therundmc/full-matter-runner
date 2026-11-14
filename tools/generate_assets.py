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
    if k == 'civ':
        return civ_head_px(ch, u, v, L, r)
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
    if k == 'civ':
        return civ_chest_px(ch, u, v, L, hx_, hy_)
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
    if k == 'civ':
        return civ_face_px(ch, u, v, L, r)
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
    if st in ('jacket', 'long', 'dancer') and (u > 1.2 or (st != 'jacket' and abs(v) > r - 1.0)):
        return ch['hair'][i]
    return ch['skin'][i]


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
    # pool cue (1.25 m): dark butt, pale maple shaft, white ferrule, chalked tip; and its butt half once it has snapped
    cue = {'B': hx('#3a2418'), 'b': hx('#6a4426'), 'm': hx('#d8c090'), 'f': hx('#f0ece0'), 'c': hx('#3a8ad8')}
    W['cue'] = ascii_cv(['.' * 40, '.BBBBBBBbbbbbb' + 'm' * 22 + 'ffc.', '.' * 40], cue)
    W['cue_half'] = ascii_cv(['.' * 20, '.BBBBBBBbbbbbbmmmmm.', '.' * 20], cue)
    # tire iron: a steel bar, its socket end bent square
    W['tire_iron'] = ascii_cv(["................",
                               ".DMMMMMMMMMMLK..",
                               "............MK..",
                               "................"], gun)
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
    for y in range(y0, y1 + 1):
        for x in range(x0, x1 + 1):
            c = cv.get(x, y)
            if c[3] > 0 and c != OUTLINE:
                cv.p[x, y] = shift(c, int(round((n(x, y) - 0.5) * 2 * amt)))


def smudge(cv, rng, n, box, r=(1.0, 2.5), t=0.2, col=None):
    """Soft spots on painted pixels: dark grime, or a blend toward col (rust, dust, bare metal)."""
    x0, y0, x1, y1 = box
    for _ in range(n):
        cx, cy, rr = rng.uniform(x0, x1), rng.uniform(y0, y1), rng.uniform(*r)
        for y in range(int(cy - rr) - 1, int(cy + rr) + 2):
            for x in range(int(cx - rr) - 1, int(cx + rr) + 2):
                d = math.hypot(x + 0.5 - cx, y + 0.5 - cy) / rr
                c = cv.get(x, y)
                if d < 1 and c[3] > 0 and c != OUTLINE:
                    k = t * (1 - d * d)
                    cv.p[x, y] = mix(c, alpha(col, c[3]), k) if col else dk(c, k)


def layer(cv, paint, ol=OUTLINE):
    """Paint on a fresh layer, outline it (ol=None: no outline) and composite it onto cv."""
    ly = Cv(cv.w, cv.h)
    paint(ly)
    if ol:
        ly.outline(ol)
    cv.over(ly)
    return cv


def relief(cv, x0, y0, x1, y1, hf, r, amp=1.0, keep=None):
    """Shade painted pixels from a height field hf(x, y) (cloth folds, padding): normal from its gradient."""
    for y in range(y0, y1 + 1):
        for x in range(x0, x1 + 1):
            c = cv.get(x, y)
            if c[3] == 0 or c == OUTLINE or (keep and not keep(x, y)):
                continue
            gx = (hf(x + 1, y) - hf(x - 1, y)) * 0.5 * amp
            gy = (hf(x, y + 1) - hf(x, y - 1)) * 0.5 * amp
            cv.p[x, y] = shade(r, light(-gx, -gy))


def line(cv, x0, y0, x1, y1, col, blend=False):
    n = int(max(abs(x1 - x0), abs(y1 - y0))) + 1
    for i in range(n + 1):
        t = i / n
        x, y = x0 + (x1 - x0) * t, y0 + (y1 - y0) * t
        (cv.blend if blend else cv.set)(int(math.floor(x)), int(math.floor(y)), col)


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
            ly.set(int(x), int(y), hx(pip))
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
    for y in range(1, H - 1):
        for x in range(1, W - 1):
            dx, dy = x + 0.5 - cx, y + 0.5 - cy
            ex = dx - max(-half, min(half, dx))
            d = math.hypot(ex, dy) or 1e-6
            nx, ny = ex / d, dy / d
            if d > 18.0:
                continue
            if d > 14.2:
                c = shade(rail, light(nx, ny))
                cv.set(x, y, lt(c, 0.12) if 15.6 < d <= 16.5 else c)   # the padding's crown
            elif d > 13.3:
                cv.set(x, y, felt[0] if nx + ny > 0 else felt[1])
            else:
                c = shift(mix(felt[2], lt(felt[2], 0.2), max(0.0, 0.7 - d / 14)), int((fn(x, y) - 0.5) * 8))
                cv.set(x, y, lt(c, 0.1) if 9.3 < d <= 10.0 else c)     # the betting line

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
        bx, by = int(c + math.cos(a) * 17.6 - 0.5), int(c + math.sin(a) * 17.6 - 0.5)
        for ox, oy in ((0, 0), (1, 0), (0, 1), (1, 1)):
            cv.set(bx + ox, by + oy, hx('#fff0c0') if k % 2 else hx('#ff8ad0'))

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
    """Bistro chair: chrome tube frame, padded vinyl seat, curved backrest on -x."""
    cv = Cv(16, 16)
    vin = ramp('#8e2c38', 0.5, 0.26, 0.32)
    chrome = ramp('#9ea4b4', 0.55, 0.28, 0.5)

    def seat(ly):
        fill_shape(ly, 9.0, 8.0, 5.4, 5.6, lambda u, v, L: shade(vin, L), kind='super', p=3.0)
        ly.set(9, 7, vin[1])
        ly.set(10, 8, vin[1])
        ly.set(7, 5, vin[3])
    layer(cv, seat)

    def back(ly):
        fill_capsule(ly, [(3.6, 2.0), (2.3, 4.6), (2.0, 8.0), (2.3, 11.4), (3.6, 14.0)], 1.25,
                     lambda k, L, s, i, t: shade(chrome, L) if k > 0.55 else shade(vin, L))
    layer(cv, back)
    cv.outline()
    return cv


def p_armchair():
    """Chesterfield club armchair, oxblood leather with buttoned back; back on -x, seat facing +x."""
    S = 28
    cv = Cv(S, S)
    lea = ramp('#7e2224', 0.5, 0.26, 0.32)
    seam = dk(lea[0], 0.45)
    fill_shape(cv, 14.0, 14.0, 13.0, 13.0, lambda u, v, L: lea[0], kind='rect', corner=2.6)

    def seat(ly):
        fill_shape(ly, 17.6, 14.0, 8.4, 7.4, lambda u, v, L: shade(lea, L), kind='rect', bevel=3.4, corner=2.0)
        line(ly, 14.0, 13.0, 21.0, 15.0, lea[1])       # sat-in crease
    layer(cv, seat, seam)

    def arms(ly):
        for cy in (4.0, 24.0):
            fill_shape(ly, 15.5, cy, 11.6, 3.2, lambda u, v, L: shade(lea, L), kind='rect', bevel=2.4, corner=2.6)
            fill_shape(ly, 25.2, cy, 2.0, 2.6, lambda u, v, L: shade(lea, L + 0.08))   # rolled front of the arm
    layer(cv, arms, seam)

    def back(ly):
        fill_shape(ly, 4.4, 14.0, 3.6, 13.0, lambda u, v, L: shade(lea, L), kind='rect', bevel=2.6, corner=2.6)
        for y in (6, 10, 14, 18, 22):                  # buttons + the pleats between them
            ly.set(5, y, seam)
            ly.set(5, y - 1, lea[3])
            if y < 22:
                ly.set(4, y + 2, lea[1])
    layer(cv, back, seam)
    smudge(cv, random.Random(141), 5, (6, 6, 24, 22), (1.5, 3.0), 0.12, hx('#c88a70'))   # worn leather
    cv.outline()
    return cv


def p_sofa():
    """Three-seater: back along -y, rolled arms, three seat and back cushions, worn vinyl."""
    W, H = 66, 30
    cv = Cv(W, H)
    lea = ramp('#a8346c', 0.52, 0.27, 0.32)
    seam = dk(lea[0], 0.5)
    fill_shape(cv, 33.0, 15.0, 32.0, 14.0, lambda u, v, L: lea[0], kind='rect', corner=2.6)

    def frame(ly):
        fill_shape(ly, 33.0, 4.6, 32.0, 3.6, lambda u, v, L: shade(lea, L - 0.05), kind='rect', bevel=2.6, corner=2.6)
        for cx in (4.6, 61.4):
            fill_shape(ly, cx, 16.0, 3.6, 13.0, lambda u, v, L: shade(lea, L), kind='rect', bevel=2.8, corner=2.6)
    layer(cv, frame, seam)
    rng = random.Random(151)

    def cushions(ly):
        for i, cx in enumerate((17.0, 33.0, 49.0)):
            dy = rng.uniform(-0.3, 0.3)
            fill_shape(ly, cx, 19.5 + dy, 7.9, 8.6, lambda u, v, L: shade(lea, L), kind='rect', bevel=3.6, corner=2.2)
            fill_shape(ly, cx, 10.2, 7.9, 2.6, lambda u, v, L: shade(lea, L + 0.04), kind='rect', bevel=2.2, corner=2.0)
            ly.set(int(cx) - 3, 14, lt(lea[3], 0.3))
            ly.set(int(cx) - 2, 14, lt(lea[3], 0.3))
            line(ly, cx - 2.5, 20.0 + dy, cx + 2.0, 21.5 + dy, lea[1])   # sat-in dip
    layer(cv, cushions, seam)
    # one cushion split, foam showing
    for (x, y) in ((44, 22), (45, 22), (46, 23)):
        cv.set(x, y, hx('#e8d898'))
    cv.set(45, 23, hx('#c8b070'))
    smudge(cv, rng, 9, (8, 12, 58, 26), (1.5, 3.5), 0.14)
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
    """Pool table: wood rails with sights, leather pockets, worn felt lit from above, a game in progress, cue, chalk."""
    W, H = 82, 46
    cv = Cv(W, H)
    wood_fill(cv, 1, 1, W - 2, H - 2, hx('#6a3518'), plank=3, rng=random.Random(16))
    mottle(cv, random.Random(161), 6, 5)
    bevel_edges(cv, 1, 1, W - 2, H - 2, 0.25, 0.35)
    felt = ramp('#1f7a4c', 0.45, 0.22, 0.18)
    fn = VNoise(W, H, 5, random.Random(17))
    x0, y0, x1, y1 = 6, 6, W - 7, H - 7
    cx, cy = W / 2, H / 2
    for y in range(y0 - 1, y1 + 2):
        for x in range(x0 - 1, x1 + 2):
            if x in (x0 - 1, x1 + 1) or y in (y0 - 1, y1 + 1):
                cv.set(x, y, felt[0] if (x == x1 + 1 or y == y1 + 1) else felt[1])   # cushions
                continue
            d = math.hypot((x - cx) / (W * 0.5), (y - cy) / (H * 0.5))
            c = mix(felt[2], lt(felt[2], 0.2), max(0.0, 0.7 - d))     # lamp hot spot
            c = shift(c, int((fn(x, y) - 0.5) * 8))
            cv.set(x, y, c)
    for x in range(x0, x1 + 1):
        cv.set(x, y0, dk(cv.get(x, y0), 0.2))
    for y in range(y0, y1 + 1):
        cv.set(x0, y, dk(cv.get(x0, y), 0.2))
    smudge(cv, random.Random(162), 4, (x0 + 4, y0 + 4, x1 - 4, y1 - 4), (2.0, 3.5), 0.12)   # spilled beer
    for x in (16, 26, 36, 46, 56, 66):
        cv.set(x, 2, hx('#f0e6c8'))
        cv.set(x, H - 3, hx('#f0e6c8'))
    for y in (13, 23, 33):
        cv.set(2, y, hx('#f0e6c8'))
        cv.set(W - 3, y, hx('#f0e6c8'))
    for (px, py) in ((5.5, 5.5), (41.0, 4.6), (W - 5.5, 5.5), (5.5, H - 5.5), (41.0, H - 4.6), (W - 5.5, H - 5.5)):
        fill_shape(cv, px, py, 2.9, 2.9, lambda u, v, L: hx('#3a2418') if math.hypot(u, v) > 2.0 else hx('#08060c'))
    def cue(ly):
        fill_capsule(ly, [(9.0, 39.0), (19.4, 27.6)], 0.55, lambda k, L, s, i, t: hx('#3a6ad8') if t > 0.97 else hx('#f0dcb0'))
        fill_capsule(ly, [(4.0, 41.4), (9.0, 39.0)], 0.8, lambda k, L, s, i, t: hx('#2a1810') if t < 0.3 else hx('#7a3a1a'))
        fill_shape(ly, 70.0, 2.5, 0.9, 0.9, lambda u, v, L: hx('#3a8ad8'), kind='rect', corner=0.2)   # chalk on the rail
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
    for i in range(1, S - 1):
        for (x, y) in ((i, 1), (i, 2), (i, S - 3), (i, S - 2), (1, i), (2, i), (S - 3, i), (S - 2, i)):
            fr.set(x, y, w[3] if (x <= 2 or y <= 2) and not (x >= S - 3 or y >= S - 3) else w[1])
    for x in range(3, S - 3):              # batten across the middle
        fr.set(x, 10, w[3])
        fr.set(x, 11, w[1])
    for (x, y) in ((2, 2), (S - 3, 2), (2, S - 3), (S - 3, S - 3), (3, 10), (S - 4, 10)):
        fr.set(x, y, hx('#5a5a66'))
    cv.over(fr)
    ink = alpha(hx('#1a1218'), 150)
    for ax in (7, 13):                     # "this way up" arrows
        for (dx, dy) in ((0, 0), (-1, 1), (1, 1), (-2, 2), (2, 2), (0, 1), (0, 2), (0, 3), (0, 4)):
            cv.blend(ax + dx, 4 + dy, ink)
    for (y, x0, x1) in ((14, 5, 15), (16, 7, 13)):   # shipping marks: two stencilled words
        for x in range(x0, x1 + 1):
            if (x - x0) % 4 != 3:
                cv.blend(x, y, ink)
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
    """Bookcase from above: back panel at -y, two dividers, book tops (cover + page block), one lying flat."""
    W, H = 42, 13
    cv = Cv(W, H)
    wood = ramp('#5a3420', 0.45, 0.22, 0.3)
    cv.rect(1, 1, W - 2, H - 2, wood[1])
    cv.rect(1, 1, W - 2, 2, wood[2])
    cv.rect(1, 1, W - 2, 1, wood[3])
    cv.rect(1, H - 2, W - 2, H - 2, wood[2])
    rng = random.Random(19)
    cols = ['#9a2228', '#2a4aa8', '#c8a850', '#2c7a52', '#6a1f8a', '#d8d0bc', '#c85a1a', '#1a8a8a', '#3a2a44', '#7a5a3a']
    divs = (1, 2, 14, 27, W - 3, W - 2)
    x = 3
    while x < W - 3:
        if x in divs:
            x += 1
            continue
        if rng.random() < 0.1:
            x += 1                          # a gap
            continue
        bw = rng.choice([1, 2, 2, 3, 3])
        depth = rng.choice([6, 7, 7, 8])
        col = hx(rng.choice(cols))
        lit = rng.uniform(-0.1, 0.2)        # taller books catch more light
        xs = [xx for xx in range(x, x + bw) if xx not in divs and xx < W - 3]
        for i, xx in enumerate(xs):
            for y in range(3, 3 + depth):
                pages = len(xs) >= 3 and 0 < i < len(xs) - 1 and 3 < y < 2 + depth
                c = lt(col, lit) if lit > 0 else dk(col, -lit)
                if pages:
                    c = mix(c, hx('#d8ccb0'), 0.45)
                cv.set(xx, y, c)
            cv.set(xx, 2 + depth, dk(col, 0.35))
        x += max(1, len(xs))
    for xx in (14, 27):
        cv.rect(xx, 2, xx, H - 2, wood[2])
    cv.rect(1, 2, 2, H - 2, wood[2])
    cv.rect(W - 3, 2, W - 2, H - 2, wood[1])
    flat = Cv(W, H)                         # a book lying across the others
    fill_shape(flat, 33.0, 6.0, 4.4, 3.0, lambda u, v, L: shade(ramp('#8a2a2a', 0.45, 0.2, 0.35), L), ang=0.12,
               kind='rect', bevel=1.0, corner=0.4)
    flat.outline()
    cv.over(flat)
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
    nz = VNoise(W, H, 8, random.Random(20))         # wraps on 32 px: seamless
    for y in range(1, 15):
        for x in range(W):
            g = nz(x, y * 3) - 0.5                       # long streaks along the counter
            c = shift(wood[2], int(g * 16))
            if y == 1:
                c = wood[3]
            elif y == 2:
                c = wood[0]
            elif y in (6, 7):
                c = lt(c, 0.08 + 0.06 * math.sin(x * math.pi / 16) ** 2)   # sheen of the lamps
            elif y == 14:
                c = wood[1]
            cv.set(x, y, c)
    pad = ramp('#5e1a22', 0.5, 0.26, 0.3)
    for x in range(W):
        cv.set(x, 0, OUTLINE)
        cv.set(x, 15, pad[3])
        cv.set(x, 16, pad[2] if x % 16 else pad[0])     # tuck seams every half metre
        cv.set(x, 17, pad[1])
        cv.set(x, 18, OUTLINE)
        cv.set(x, 19, BRASS[3] if x % 16 not in (7, 8) else BRASS[2])
        cv.set(x, 20, OUTLINE)
    for x in (7, 8):                        # rail brackets
        cv.set(x, 18, BRASS[0])
        cv.set(x + 16, 18, BRASS[0])
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
    """Galvanised can lid: pressed concentric ribs, a handle bar, a dent and grime."""
    S = 17
    c = S / 2
    cv = Cv(S, S)
    m = ramp('#7a808c', 0.5, 0.25, 0.35)
    fill_shape(cv, c, c, 7.5, 7.5, lambda u, v, L: shade(m, L))
    for (r0, r1) in ((5.0, 5.8), (2.8, 3.5)):
        ring(cv, c, c, r0, r1, lambda dx, dy, d: m[1] if light(dx / d, dy / d) < 0.55 else m[3])
    rng = random.Random(271)
    mottle(cv, rng, 8, 4)
    smudge(cv, rng, 2, (4, 9, 12, 13), (1.6, 2.4), 0.25)    # dent
    smudge(cv, rng, 3, (2, 2, 15, 15), (1.0, 2.0), 0.3, hx('#5a4a36'))
    cv.outline()

    def handle(ly):
        fill_capsule(ly, [(5.6, 8.5), (11.4, 8.5)], 0.9, lambda k, L, s, i, t: shade(ramp('#9aa0ac', 0.5, 0.25, 0.4), L))
    layer(cv, handle, dk(m[0], 0.3))
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
    s = ch.get('sleeve') or (ch['skin'] if k == 'brute' else ch['top'])
    pal_ = {'a': s[3], 'S': s[2], 'd': s[1], 'c': s[0], 'h': ch['skin'][3], 'H': ch['skin'][2], 'k': ch['skin'][1],
            'w': WHITE[2], 'W': WHITE[1], 'r': ch.get('bandana', s)[2]}
    rows = {'player': [".aSSSSSwHh.", ".dddddWWkk."],
            'thug': [".aSSSSSwHh.", ".ddddddWkk."],
            'heavy': [".aSSSSSSHh.", ".wwwwwwwkk."],
            'brute': [".rSSSSSSHh.", ".rddddddkk."]}.get(k, [".aSSSSSSHh.", ".ddddddWkk."])
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
    for y in range(1, H - 1):
        for x in range(1, W - 1):
            u = (x + 0.5 - cx) / 14.0
            v = (y + 0.5 - 12.0) / 11.0
            e = (abs(u) ** 4 + max(0.0, -v) ** 4) ** 0.25 if v < 0 else abs(u)
            if e > 1.0 or y > H - 2:
                continue
            if e > 0.92:                      # chrome trim, lit from the top-left
                nx, ny = (u / (e or 1)) * 0.9, (min(0.0, v) / (e or 1)) * 0.9
                c = shade(chrome, light(nx, ny))
            elif e > 0.74:
                if v < 0.15:                  # bubble tubes following the arch
                    col = bands[min(2, int((e - 0.74) / 0.06))]
                    c = lt(col, 0.3) if (x + y) % 5 else lt(col, 0.6)
                    gl.set(x, y, lt(col, 0.1))
                else:                         # straight cyan tubes down the front corners
                    c = lt(NEON_CYAN, 0.2)
                    gl.set(x, y, NEON_CYAN)
            else:
                c = shade(body, 0.68)
            cv.set(x, y, c)
    # glass dome: the record magazine (discs on edge) around the platter
    for y in range(4, 14):
        for x in range(6, 24):
            u, v = (x + 0.5 - cx) / 9.0, (y + 0.5 - 11.0) / 7.5
            if u * u + min(0.0, v) ** 2 <= 1.0 and y <= 13:
                cv.set(x, y, hx('#140c1e') if (x + y) % 3 else hx('#1a1028'))
    labels = [NEON_PINK, hx('#f9c80e'), NEON_CYAN, hx('#3aff8a'), hx('#ff6b1a'), hx('#f4f0ff'), NEON_PINK]
    for i in range(7):
        a = math.pi * (1.1 + 0.8 * i / 6.0)
        x0, y0 = cx + math.cos(a) * 4.6, 11.5 + math.sin(a) * 4.6
        x1, y1 = cx + math.cos(a) * 7.4, 11.5 + math.sin(a) * 7.4
        line(cv, x0, y0, x1, y1, hx('#4a4458'))
        mx, my = (x0 + x1) / 2, (y0 + y1) / 2
        cv.set(int(mx), int(my), labels[i])
        gl.set(int(mx), int(my), dk(labels[i], 0.3))
    fill_shape(cv, cx, 11.0, 2.6, 2.6, lambda u, v, L: hx('#0c0a10') if math.hypot(u, v) > 0.9 else NEON_PINK)
    cv.set(int(cx - 1), 10, hx('#4a4858'))
    for y in range(5, 13):                    # reflection streak on the dome
        cv.blend(9 + (y - 5) // 3, y, (255, 255, 255, 60))
    # selector panel: two columns of title strips, a row of buttons, the coin light
    for (x0, x1) in ((5, 13), (17, 25)):
        for y in (15, 17):
            for x in range(x0, x1 + 1):
                c = hx('#efe4c8') if (x - x0) % 5 != 4 else hx('#6a5a50')
                cv.set(x, y, c)
                gl.set(x, y, (255, 240, 200, 70))
        for y in (14, 16, 18):
            for x in range(x0, x1 + 1):
                cv.set(x, y, shade(body, 0.45))
    for x in range(6, 25, 2):
        cv.set(x, 19, hx('#d8dce8') if x != 14 else hx('#ff3a3a'))
    gl.set(14, 19, hx('#ff3a3a'))
    cv.outline()
    return cv, gl


def p_hydrant():
    """Fire hydrant from above: bonnet dome with its pentagon nut, two hose caps and the front pumper outlet."""
    S = 10
    cv = Cv(S, S)
    red = ramp('#d0262c', 0.55, 0.28, 0.35)
    cap = ramp('#c8c8d8', 0.5, 0.25, 0.4)
    fill_shape(cv, 1.4, 5.0, 1.2, 1.4, lambda u, v, L: shade(cap, L))
    fill_shape(cv, 8.6, 5.0, 1.2, 1.4, lambda u, v, L: shade(cap, L))
    fill_shape(cv, 5.0, 8.5, 1.6, 1.2, lambda u, v, L: shade(cap, L))
    fill_shape(cv, 5.0, 5.0, 3.6, 3.6, lambda u, v, L: shade(red, L))
    ring(cv, 5.0, 5.0, 2.2, 2.8, lambda dx, dy, d: red[1] if light(dx / d, dy / d) > 0.5 else red[3])
    fill_shape(cv, 5.0, 5.0, 1.3, 1.3, lambda u, v, L: shade(ramp('#e0b02a', 0.5, 0.2, 0.4), L))
    cv.set(4, 4, hx('#fff8d0'))
    cv.set(7, 6, hx('#8a8a98'))              # paint chipped to the iron
    cv.outline()
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
    cv.rect(1, 1, W - 2, H - 2, dk(wood[0], 0.25))            # the dark between the bottles
    cv.rect(1, 1, W - 2, 1, wood[3])
    cv.rect(1, 2, W - 2, 2, wood[2])
    cv.rect(1, 2, 2, H - 2, wood[2])
    cv.rect(W - 3, 2, W - 2, H - 2, wood[1])
    cv.rect(3, H - 2, W - 4, H - 2, hx('#cfc8b4'))            # price rail
    rng = random.Random(23)
    glass = ['#2f7a3c', '#b4681c', '#bcd4cc', '#3c68b0', '#5a2a12', '#d0a02c', '#8a1f2a']
    rng.shuffle(glass)
    slot = 0
    while slot < 12:
        col = hx(glass.pop())
        for _ in range(rng.choice([1, 2, 2, 3])):             # a brand: a few bottles side by side, three deep
            if slot == 12:
                break
            x = 3 + slot * 3
            for rank, y in enumerate((3, 6, 9)):
                if rank == 2 and rng.random() < 0.2:          # sold
                    continue
                cv.set(x, y, lt(col, 0.5))
                cv.set(x + 1, y, col)
                cv.set(x, y + 1, col)
                cv.set(x + 1, y + 1, dk(col, 0.4))
            cv.set(x, H - 2, lt(col, 0.3))                    # its price tag
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
    cv.rect(1, 1, W - 2, H - 2, gap)
    rng = random.Random(47)
    for x in range(1, W - 1):                                 # the mirror: the room's lights slide across it
        m = hx('#8ea6ba') if (x // 3) % 4 else hx('#d4e4f0')
        cv.set(x, 1, shift(m, rng.randint(-8, 8)))
    glass = ['#2f7a3c', '#b4681c', '#bcd4cc', '#3c68b0', '#5a2a12', '#d0a02c', '#8a1f2a', '#c8c8d8', '#7a3aa0']
    for rank, y in enumerate((2, 5)):
        for slot in range(12):
            if rng.random() < 0.08:                           # one is out, on the counter
                continue
            col = hx(rng.choice(glass))
            x = 3 + slot * 3
            cv.set(x, y, lt(col, 0.5))
            cv.set(x + 1, y, col)
            cv.set(x, y + 1, col)
            cv.set(x + 1, y + 1, dk(col, 0.4))
    for x in range(1, W - 1):
        cv.set(x, 7, hx('#ff5f96') if x % 7 else hx('#ffc0d8'))   # lit edge
        cv.set(x, 8, wood[1])
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
    """Street drinks machine from above, its lit front along +y: a dull red top, vents, the glowing panel."""
    cv = Cv(28, 22)
    cv.rect(1, 1, 26, 16, hx('#7a2630'))
    cv.rect(1, 1, 26, 2, hx('#541820'))
    cv.rect(2, 3, 25, 4, hx('#8e3640'))            # what the street lamp leaves on it
    cv.rect(4, 7, 12, 12, hx('#6a2028'))           # a sunken panel
    for x in (17, 20, 23):
        cv.rect(x, 7, x + 1, 12, hx('#4e161e'))    # vents
    cv.rect(1, 17, 26, 20, hx('#f2f6ff'))          # the lit front
    cv.rect(2, 18, 9, 19, hx('#ff5a6a'))
    cv.rect(11, 18, 18, 19, hx('#58d8f0'))
    cv.rect(20, 18, 25, 19, hx('#ffd84a'))
    cv.outline()
    return cv


def p_phone_booth():
    """Phone booth from above, open along +y: steel frame, a tinted glass roof the phone shows through, a lit header."""
    cv, fr = Cv(26, 26), Cv(26, 26)
    steel = hx('#5a6270')
    cv.rect(2, 2, 23, 23, hx('#8fd0e6', 70))
    for i in range(4, 21):                          # a glint across the glass
        cv.set(i, 24 - i, hx('#eaf8ff', 110))
    fr.rect(1, 1, 24, 2, steel)                     # back and sides
    fr.rect(1, 1, 2, 24, steel)
    fr.rect(23, 1, 24, 24, steel)
    fr.rect(1, 23, 4, 24, steel)                    # door posts
    fr.rect(21, 23, 24, 24, steel)
    fr.rect(3, 3, 22, 4, hx('#dff4ff'))             # lit header
    fr.rect(8, 5, 15, 10, hx('#343a46'))            # the phone
    fr.rect(9, 6, 12, 9, hx('#9aa2b0'))             # its keys
    fr.set(14, 6, hx('#f9c80e'))                    # coin slot
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
    """Newspaper box from above: blue steel, the front page under its window (front along +y)."""
    cv = Cv(16, 13)
    cv.rect(1, 1, 14, 11, hx('#2a5aa8'))
    cv.rect(1, 1, 14, 2, hx('#4a7ac8'))
    cv.rect(1, 10, 14, 11, hx('#1c3e78'))
    cv.rect(3, 4, 12, 8, hx('#e8e4d8'))
    cv.rect(4, 5, 11, 5, hx('#3a3a40'))            # headline
    cv.rect(4, 7, 9, 7, hx('#8a8a90'))
    cv.set(13, 10, hx('#d8d8e0'))                  # coin slot
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


# small dressing added one by one (the details list)
DETAIL_PROPS = dict(cash_case=p_cash_case, ceiling_fan=p_ceiling_fan, mirror_ball=p_mirror_ball, extinguisher=p_extinguisher,
                    vending=p_vending, phone_booth=p_phone_booth, parking_meter=p_parking_meter, news_box=p_news_box,
                    pipe_steam=pipe('#8a5a3a', '#b07a52', '#5e3a24', '#c8c0a8'), pipe_water=pipe('#4a6a7a', '#6e8e9e', '#30485a', '#9aa2b0'),
                    wall_vent=p_wall_vent, manhole=p_manhole, cardboard_bed=p_cardboard_bed,
                    table_flipped=flipped_table(46, '#86552f', '#5a361e'),
                    table_round_flipped=flipped_table(30, '#8a5530', '#4a2c18', feet=1),
                    card_table_flipped=flipped_table(60, '#6a3518', '#4a2c18', face='#1f7a4c'))
DETAIL_SIZES = dict(cash_case=(22, 16), ceiling_fan=(44, 44), mirror_ball=(12, 12), extinguisher=(8, 11),
                    vending=(28, 22), phone_booth=(26, 26), parking_meter=(7, 8), news_box=(16, 13),
                    pipe_steam=(96, 6), pipe_water=(96, 6), wall_vent=(16, 7), manhole=(16, 16), cardboard_bed=(36, 20),
                    table_flipped=(46, 27), table_round_flipped=(30, 27), card_table_flipped=(60, 27))

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
    """Bar sign lying on the top of the facade wall, seen from above: dark tubes on the sprite, lit letters on the
    glow map. Letter i spans x = MARQUEE_X0 + i * MARQUEE_STEP - 1 .. + 12 (see props.js `sign`)."""
    W, H = 92, 24
    cv, gl = sign_backing(W, H), Cv(W, H)
    dim, hot = dk(NEON_PINK, 0.62), lt(NEON_PINK, 0.3)
    for i, ch in enumerate(MARQUEE_TEXT):
        x0 = MARQUEE_X0 + i * MARQUEE_STEP
        cells = [(x0 + cx * 2 + a, 5 + cy * 2 + b) for cy, row in enumerate(FONT_SIGN[ch])
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
    return cv, gl


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


LIGHT_PROPS.update(marquee=p_marquee, string_lights=p_string_lights)
LIGHT_SIZES.update(marquee=(92, 24), string_lights=(128, 10))


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
        r = fn()
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
                  neon_sign_arrow=(30, 12), jukebox=(30, 22), hydrant=(10, 10), bench=(52, 17),
                  chain_fence=(34, 16))
FLOOR_NAMES = [t[0] for t in FLOOR_TILES]
PROP_SIZES.update(LIGHT_SIZES)
PROP_SIZES.update(SHOP_SIZES)
PROP_SIZES.update(DETAIL_SIZES)
GLOWING += list(LIGHT_SIZES) + SHOP_GLOWING
EXPECTED = {
    'characters': dict([(c + s, sz) for c in CHARS for s, sz in [
        ('_torso', (20, 20)), ('_down', (26, 16)), ('_dead0', (30, 22)), ('_dead1', (30, 22)),
        ('_gib_head', (9, 9)), ('_gib_arm', (11, 4)), ('_gib_leg', (13, 5)), ('_gib_torso', (14, 12)),
        ('_rag_torso', (14, 16)), ('_rag_head', (9, 9)), ('_rag_arm', (11, 4)), ('_rag_leg', (13, 5))]]
        + [('gib_chunk0', (6, 5)), ('gib_chunk1', (6, 5)), ('gib_chunk2', (6, 5)), ('gib_eye', (3, 3))]),
    'weapons': dict(pistol=(11, 5), uzi=(12, 7), uzi_silenced=(18, 7), shotgun=(22, 5), rifle=(24, 7),
                    sniper=(28, 5), bazooka=(26, 7), bat=(22, 4), knife=(10, 3), cue=(40, 3), cue_half=(20, 3), tire_iron=(16, 4),
                    rocket=(9, 4),
                    casing=(3, 2), shell=(4, 2), mag_pistol=(3, 6), mag_uzi=(3, 9), mag_rifle=(4, 9),
                    mag_sniper=(3, 6), shells_box=(8, 6), ammo_9mm=(9, 7), ammo_12g=(9, 7), ammo_762=(9, 7),
                    ammo_rocket=(12, 6)),
    'props': dict(list(PROP_SIZES.items()) + [(n + '_glow', PROP_SIZES[n]) for n in GLOWING]),
    'tiles': dict([(n + s, (32, 32)) for n in FLOOR_NAMES for s in ('', '_v1', '_v2')]
                  + [(n, (32, 32)) for n in ('wall', 'brick', 'roof', 'neon_floor_glow')]),
    'roof': dict(list(ROOF_SIZES.items()) + [(n + '_glow', ROOF_SIZES[n]) for n in ROOF_GLOWING]),
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
