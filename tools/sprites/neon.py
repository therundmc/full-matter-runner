"""Neon: 1 px tubes collected on a Neon then rendered (their halo on the sprite, the tube on it and on the
emissive map), a wall sign's dark backing, the halo of a lit tube on an emissive map, neon words, and glow maps made
from a sprite's own neon pixels."""
import math

from .core import alpha, Cv, dk, fill_shape, hx, lt, mix, ramp, tone
from .type import words


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
