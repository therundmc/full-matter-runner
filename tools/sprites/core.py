"""The painting kit every sprite is made with (no colour of its own but the ink): colour maths (hx, mix, dk / lt,
4-step ramps and their tones), the canvas Cv (addressed in world px, finer densities), the shape painters (ellipses,
superellipses, rounded rects, capsules, rings, lines, rects), tileable value noise, the light from the top left, the
outline and its softened ink, a pixel-fine grain, and fine(): a painter run at FINE density.

Conventions: 1 px = 1 world px (1 m = 32 px), top-down, directional sprites face +x, the light from the top left
(-x, -y, +z); characters, weapons and props get a 1 px dark outline, tiles wrap seamlessly. Only Pillow (no numpy);
every painter seeds its own random.Random, so the output is deterministic and adding one repaints nothing else."""
import math
import random

from PIL import Image


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
CLEAR = (0, 0, 0, 0)


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


FINE = 2    # characters and weapons are painted at twice the world's pixel density, still plain pixel art (the user
            # wants it kept: a smooth, shaded repaint was the wrong direction); the game draws them at half size
            # (engine/Assets.js `density`)


def curve(p0, p1, p2, n=8):
    """Points along a quadratic curve."""
    return [((1 - t) ** 2 * p0[0] + 2 * (1 - t) * t * p1[0] + t * t * p2[0],
             (1 - t) ** 2 * p0[1] + 2 * (1 - t) * t * p1[1] + t * t * p2[1]) for t in (i / n for i in range(n + 1))]


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


def pal(cols, t):
    """Piecewise blend through a list of colours, t in 0..1."""
    t = max(0.0, min(1.0, t)) * (len(cols) - 1)
    i = min(int(t), len(cols) - 2)
    return mix(cols[i], cols[i + 1], t - i)


def tint(c, d, t=None, k=0.0):
    """Brightness offset d, optionally pulled toward colour t by k."""
    c = shift(c, int(round(d)))
    return mix(c, t, k) if t and k > 0 else c


def on_wall(W, H, paint, seed=None):
    """Something on a wall seen from above (the wall at -y): paint(cv) draws it, then the outline and a little grime."""
    cv = Cv(W, H)
    paint(cv)
    if seed:
        smudge(cv, random.Random(seed), 2, (1, 1, W - 1, H - 1), (0.8, 1.4), 0.14)
    cv.outline()
    return cv


# --------------------------------------------------------------------------
# Glow maps for existing props
# --------------------------------------------------------------------------


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


class Batch:
    """Sprites painted together by one call (make() -> {name: canvas}): Batch(make)(name) is the painter of one of
    them, the call made once in a process (the build hands a whole batch to one worker)."""

    def __init__(self, make):
        self.make, self.done = make, None

    def __call__(self, name):
        def paint():
            if self.done is None:
                self.done = self.make()
            return self.done[name]
        paint.batch = self
        return paint
