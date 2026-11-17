"""The comic kit's 2D layer: geometry (Catmull-Rom shapes, the T placement), the canvas and its ink brush, the
night's palette and what every page shares (rain beads, ripples on wet ground, a window on the night), and the panel
registry. See tools/comic/STYLE.md for the art direction and tools/generate_comic.py for the entry point.

Shapes are point lists through a Catmull-Rom spline (a point (x, y, 0) is a sharp corner), filled flat, optionally
clipped to another shape; `brush` draws a tapered ink stroke. Deterministic: no randomness at all.
"""
import math
import os

from PIL import Image, ImageChops, ImageDraw

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUT_DIR = os.path.join(ROOT, 'assets', 'sprites', 'comic')
SC = 3                         # panel px per title px
INK = (10, 7, 12)


def hx(s):
    s = s.lstrip('#')
    return (int(s[0:2], 16), int(s[2:4], 16), int(s[4:6], 16))



# ---------------------------------------------------------------- geometry
def spline(pts, closed=True, n=8):
    """Catmull-Rom through pts; a point (x, y, 0) is a corner (no tangent through it). Returns [(x, y)]."""
    if len(pts) < 3:
        return [(p[0], p[1]) for p in pts]
    m = len(pts)
    out = []

    def tan(i):
        p = pts[i % m]
        if len(p) > 2 or (not closed and (i == 0 or i == m - 1)):
            return (0.0, 0.0)
        a, b = pts[(i - 1) % m], pts[(i + 1) % m]
        return ((b[0] - a[0]) * 0.5, (b[1] - a[1]) * 0.5)

    segs = m if closed else m - 1
    for i in range(segs):
        p0, p1 = pts[i % m], pts[(i + 1) % m]
        t0, t1 = tan(i), tan(i + 1)
        steps = max(2, int(n * max(1.0, math.hypot(p1[0] - p0[0], p1[1] - p0[1]) / 24)))
        for k in range(steps):
            u = k / steps
            h00, h10, h01, h11 = 2 * u ** 3 - 3 * u ** 2 + 1, u ** 3 - 2 * u ** 2 + u, -2 * u ** 3 + 3 * u ** 2, u ** 3 - u ** 2
            out.append((h00 * p0[0] + h10 * t0[0] + h01 * p1[0] + h11 * t1[0],
                        h00 * p0[1] + h10 * t0[1] + h01 * p1[1] + h11 * t1[1]))
    if not closed:
        out.append((pts[-1][0], pts[-1][1]))
    return out


class T:
    """A placement: local units -> panel px. s: scale, (ox, oy): where the local origin goes, f: -1 mirrors x,
    rot: radians (turned about the origin)."""

    def __init__(self, ox, oy, s=1.0, f=1, rot=0.0):
        self.ox, self.oy, self.s, self.f, self.c, self.sn = ox, oy, s, f, math.cos(rot), math.sin(rot)

    def __call__(self, pts):
        out = []
        for p in pts:
            x, y = p[0] * self.f * self.s, p[1] * self.s
            q = (self.ox + x * self.c - y * self.sn, self.oy + x * self.sn + y * self.c)
            out.append(q + (0,) if len(p) > 2 else q)
        return out

    def pt(self, x, y):
        return self([(x, y)])[0]

    def len(self, v):
        return v * self.s

    def ink(self):
        """The weight of an outline round a head drawn at this scale: finer when it is small."""
        return 3 if self.s < 2 else 4


# ---------------------------------------------------------------- the canvas
class Cv:
    def __init__(self, w, h, bg=(0, 0, 0)):
        self.w, self.h = w, h
        self.im = Image.new('RGB', (w, h), bg)

    def blank(self):
        return Image.new('L', (self.w, self.h), 0)

    def mask(self, shape, smooth=True):
        """A shape (point list through the spline, or a mask already) as a mask."""
        if isinstance(shape, Image.Image):
            return shape
        m = self.blank()
        pts = spline(shape) if smooth else [(p[0], p[1]) for p in shape]
        if len(pts) >= 3:
            ImageDraw.Draw(m).polygon(pts, fill=255)
        return m

    def fill(self, shape, col, clip=None, cut=None, smooth=True):
        """Fill a shape flat; clip: only inside that shape; cut: not inside that one. Returns its mask."""
        m = self.mask(shape, smooth)
        if clip is not None:
            m = ImageChops.multiply(m, self.mask(clip))
        if cut is not None:
            m = ImageChops.subtract(m, self.mask(cut))
        self.im.paste(col, (0, 0), m)
        return m

    def rect(self, x0, y0, x1, y1, col, clip=None):
        return self.fill([(x0, y0, 0), (x1, y0, 0), (x1, y1, 0), (x0, y1, 0)], col, clip, smooth=False)

    def ellipse(self, cx, cy, rx, ry, col, clip=None):
        m = self.blank()
        ImageDraw.Draw(m).ellipse([cx - rx, cy - ry, cx + rx, cy + ry], fill=255)
        if clip is not None:
            m = ImageChops.multiply(m, self.mask(clip))
        self.im.paste(col, (0, 0), m)
        return m

    def ink(self, shape, w=3, col=INK, closed=True, smooth=True):
        """An outline of an even weight round a shape (or along an open line)."""
        pts = spline(shape, closed) if smooth else [(p[0], p[1]) for p in shape]
        if closed:
            pts = pts + [pts[0]]
        d = ImageDraw.Draw(self.im)
        d.line(pts, fill=col, width=int(round(w)), joint='curve')
        r = w / 2
        if r >= 1.5:
            for p in (pts[0], pts[-1]):
                d.ellipse([p[0] - r + 0.5, p[1] - r + 0.5, p[0] + r - 0.5, p[1] + r - 0.5], fill=col)

    def shape(self, pts, col, w=3, clip=None):
        """A flat shape with its ink line."""
        m = self.fill(pts, col, clip)
        if w:
            self.ink(pts, w)
        return m

    def brush(self, pts, w0, w1=None, col=INK, clip=None, mid=None):
        """A tapered stroke along pts: w0 at the start, w1 at the end (mid: the width half way, a swelling line)."""
        w1 = w0 if w1 is None else w1
        line = spline(pts, closed=False)
        n = len(line)
        if n < 2:
            return
        left, right = [], []
        for i, p in enumerate(line):
            a, b = line[max(0, i - 1)], line[min(n - 1, i + 1)]
            dx, dy = b[0] - a[0], b[1] - a[1]
            d = math.hypot(dx, dy) or 1.0
            u = i / (n - 1)
            w = (w0 + (mid - w0) * u * 2 if u < 0.5 else mid + (w1 - mid) * (u - 0.5) * 2) if mid is not None else w0 + (w1 - w0) * u
            w = max(0.0, w) / 2
            left.append((p[0] - dy / d * w, p[1] + dx / d * w))
            right.append((p[0] + dy / d * w, p[1] - dx / d * w))
        poly = left + right[::-1]
        m = self.blank()
        ImageDraw.Draw(m).polygon(poly, fill=255)
        if min(w0, w1) >= 2 and mid is None:
            for p, w in ((line[0], w0), (line[-1], w1)):
                ImageDraw.Draw(m).ellipse([p[0] - w / 2, p[1] - w / 2, p[0] + w / 2, p[1] + w / 2], fill=255)
        if clip is not None:
            m = ImageChops.multiply(m, self.mask(clip))
        self.im.paste(col, (0, 0), m)



    def save(self, name, size):
        assert self.im.size == size, (name, self.im.size, size)
        os.makedirs(OUT_DIR, exist_ok=True)
        self.im.save(os.path.join(OUT_DIR, name + '.png'))


def shift(m, dx, dy):
    """A mask moved by (dx, dy), what leaves it dropped (no wrapping round its edges)."""
    out = Image.new(m.mode, m.size, 0)
    out.paste(m, (dx, dy))
    return out


def runs(m, dx, dy, n=3):
    """A mask keeping only what is at least n px long along (dx, dy) (one unit step): the specks a rim leaves on the
    stairs of an edge nearly along its own light go."""
    e = m
    for k in range(1, n):
        e = ImageChops.darker(e, shift(m, -dx * k, -dy * k))
    out = e
    for k in range(1, n):
        out = ImageChops.lighter(out, shift(e, dx * k, dy * k))
    return out


def backlit(cv, m, col, sides=((3, 0), (-2, 0))):
    """The edges of a dark shape caught by a light behind it: a thin rim on each side given as (dx, dy), the way the
    light comes from (a rim lit from above or below runs along the edge, so what is shorter than 3 px across it is
    dropped, and the other way round)."""
    for dx, dy in sides:
        rim = ImageChops.subtract(m, shift(m, -dx, -dy))
        if dx == 0 or dy == 0:
            rim = runs(rim, 1 if dx == 0 else 0, 1 if dy == 0 else 0)
        cv.im.paste(col, (0, 0), rim)


def silhouette(w, h, paint):
    """What paint(cv) draws (fills, ink and all) on an empty w x h canvas, as one mask: a figure painted in full
    turned into the black shape the art direction wants of it."""
    key = (255, 0, 255)
    tmp = Cv(w, h, key)
    paint(tmp)
    return ImageChops.difference(tmp.im, Image.new('RGB', (w, h), key)).convert('L').point(lambda v: 255 if v else 0)


def limb(m, pts, w0, w1):
    """A tapered stroke into a mask (a limb of a figure)."""
    cv = Cv.__new__(Cv)
    cv.w, cv.h, cv.im = m.size[0], m.size[1], m
    cv.brush(pts, w0, w1, col=255)



def boards(cv, y0, y1, vx, vy, n, cols, gap=INK):
    """Floorboards running away to (vx, vy) between y0 and y1, n of them across the panel, in turn of cols."""
    w = cv.w
    xs = [(-0.6 + 2.2 * i / n) * w for i in range(n + 1)]
    k0 = (y0 - vy) / (y1 - vy)
    for i in range(n):
        a, b = xs[i], xs[i + 1]
        pa, pb = vx + (a - vx) * k0, vx + (b - vx) * k0
        cv.fill([(pa, y0, 0), (pb, y0, 0), (b, y1, 0), (a, y1, 0)], cols[i % len(cols)], smooth=False)
        cv.brush([(pa, y0), (a, y1)], 1, 3, col=gap)


# ---------------------------------------------------------------- the night: what every page shares
# The palette of the art direction: the night's blues and purples, the two neons, the fire.
NIGHT, FLOOR = hx('#0b0a14'), hx('#0e0d17')
PINK, PINK_D, PINK_DD = hx('#ff3a7a'), hx('#a02458'), hx('#3e1430')
CYAN, CYAN_D, CYAN_DD = hx('#3ad8e8'), hx('#1e6a7a'), hx('#14303a')
FIRE, FIRE_D, FIRE_L = hx('#ff8a20'), hx('#c8381a'), hx('#fff0a0')
VIOLET = hx('#2a1430')


def bead(i):
    """A number in [0, 1) for the i-th thing scattered somewhere: the same every run (no randomness in this tool)."""
    s = math.sin(i * 127.1 + 311.7) * 43758.5453
    return s - math.floor(s)


def rain_beads(cv, x0, y0, x1, y1, n, cols, seed=0, clip=None):
    """Drops of rain standing on a pane: n small drops, each dark with a lit fleck."""
    dark, lit = cols
    for i in range(n):
        x, y = x0 + bead(seed + i) * (x1 - x0), y0 + bead(seed + i + 500) * (y1 - y0)
        r = 1.5 + bead(seed + i + 900) * 2.5
        cv.ellipse(x, y, r, r * 1.2, dark, clip=clip)
        cv.ellipse(x - r * 0.3, y - r * 0.4, max(1, r * 0.4), max(1, r * 0.4), lit, clip=clip)


def ripples(cv, x0, y0, x1, y1, w0, w1, cols, gap, seed=0, n=22, breaks=9, clip=None):
    """A light come back off wet ground: a column from (x0, y0), w0 wide, to (x1, y1) nearer us, w1 wide; its flat
    tones cols (outer ... core) one inside the other, its edges ragged, broken across by bands of the ground (gap)
    that thicken as they come nearer."""
    def edge(i, side):
        u = i / n
        return (x0 + (x1 - x0) * u + side * (w0 + (w1 - w0) * u) * (0.35 + 0.3 * bead(seed + i * 2 + (side > 0))) +
                (bead(seed + i + 40) - 0.5) * 10 * u, y0 + (y1 - y0) * u ** 1.2)
    outer = None
    for lvl, col in enumerate(cols):
        k = (1.0, 0.5, 0.16, 0.06)[lvl] if len(cols) > 1 else 1.0
        pts = []
        for i in list(range(n + 1)) + list(range(n, -1, -1)):
            side = -1 if len(pts) <= n else 1
            p = edge(i, side)
            pts.append((x0 + (p[0] - x0) * k + (x1 - x0) * (i / n) * (1 - k), p[1]))
        cv.fill(pts, col, clip=clip)
        outer = pts if lvl == 0 else outer
    for i in range(1, breaks):
        y = y0 + (y1 - y0) * ((i + bead(seed + i) * 0.6) / breaks) ** 1.2
        xc = x0 + (x1 - x0) * i / breaks
        cv.brush([(xc - w1, y), (xc + w1, y)], 1 + i * 0.5, 1 + i * 0.3, col=gap, clip=outer)


def window_night(cv, x0, y0, x1, y1, seed=0, sign=True):
    """A window on the night street: the block across in the dark, a few lit windows, the bar's neon (pink, a cyan
    bar under it), rain standing on the glass; the frame and its cross in ink. Returns the glass's mask."""
    glass = [(x0, y0, 0), (x1, y0, 0), (x1, y1, 0), (x0, y1, 0)]
    gm = cv.fill(glass, hx('#1c1238'), smooth=False)
    w, h = x1 - x0, y1 - y0
    cv.fill([(x0, y0 + h * 0.34, 0), (x0 + w * 0.3, y0 + h * 0.34, 0), (x0 + w * 0.3, y0 + h * 0.22, 0), (x0 + w * 0.62, y0 + h * 0.22, 0),
             (x0 + w * 0.62, y0 + h * 0.4, 0), (x1, y0 + h * 0.4, 0), (x1, y1, 0), (x0, y1, 0)], hx('#120c24'), clip=gm, smooth=False)
    for i in range(9):
        lx, ly = x0 + w * (0.06 + 0.9 * bead(seed + i)), y0 + h * (0.3 + 0.2 * bead(seed + i + 30))
        cv.rect(lx, ly, lx + w * 0.03, ly + h * 0.04, hx('#3a2440') if i % 3 else hx('#5a3a3a'), clip=gm)
    if sign:
        cv.rect(x0 + w * 0.12, y0 + h * 0.56, x0 + w * 0.6, y0 + h * 0.64, PINK, clip=gm)
        cv.rect(x0 + w * 0.5, y0 + h * 0.72, x0 + w * 0.86, y0 + h * 0.76, CYAN, clip=gm)
    rain_beads(cv, x0, y0, x1, y1, int(w * h / 1600), (hx('#140e2a'), hx('#4a3a6a')), seed=seed + 7, clip=gm)
    cv.ink(glass, 6, smooth=False)
    cv.brush([((x0 + x1) / 2, y0), ((x0 + x1) / 2, y1)], 5, 5)
    cv.brush([(x0, y0 + h * 0.48), (x1, y0 + h * 0.48)], 5, 5)
    return gm



# ---------------------------------------------------------------- the panels
# name -> (painter, its size in panel px): SC x the panel's size in the title's px (Cinematic.js, Leap.js, Ending.js).
# Filled by the modules of tools/comic/panels (one per page) through @panel.
PANELS = {}


def panel(name, size):
    """Register a painter (no argument, returns a Cv of that size) as the still `name`."""
    def reg(paint):
        PANELS[name] = (paint, size)
        return paint
    return reg

