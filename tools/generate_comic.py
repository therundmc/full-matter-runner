#!/usr/bin/env python3
"""The opening's comic panels (ui/Cinematic.js, ui/cine/Panels.js), drawn like a noir thriller album.

Run from the repo root:  python tools/generate_comic.py
Writes RGB / RGBA PNGs to assets/sprites/comic/<name>.png (loaded as optional sprites by engine/Assets.js).

Style: ligne claire. Clean ink outlines of an even weight, flat colour areas of two or three tones each, big solid
black shadows, one light per panel, a few colours a panel (night blue, sodium yellow, the orange of a match, blood).
Never a gradient, a dither or a screentone. Everything is drawn aliased at SC panel px per title px (the title's
logical screen is 384 x 216), so the game draws a panel at its logical size with nearest neighbour and it stays crisp.
Only the still art is here: what moves (the lamp's flicker, smoke, the match's flame, the blood spreading, the
typed words) is drawn live by the game over it.

Shapes are point lists through a Catmull-Rom spline (a point (x, y, 0) is a sharp corner), filled flat, optionally
clipped to another shape; `brush` draws a tapered ink stroke. Deterministic: no randomness at all.
"""
import math
import os

from PIL import Image, ImageChops, ImageDraw

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
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


# ---------------------------------------------------------------- people
# A head is drawn in its own units: 100 from the crown to the chin, turned three quarters to the right (f -1: to the
# left), the origin on the crown. pal: skin (lit), shade (its shadow), deep (the darkest of it, usually INK).
def jaw_heavy():
    return [(0, 0), (18, 3), (30, 13), (35, 26), (37, 34, 0), (34, 40), (37, 47), (45, 59, 0), (41, 65), (36, 66, 0), (38, 72),
            (37, 76, 0), (38, 80), (34, 85, 0), (37, 93), (30, 103), (10, 106), (-6, 97), (-14, 86, 0),
            (-17, 72), (-30, 62), (-40, 44), (-38, 22), (-26, 7)]


def head_heavy(cv, t, pal, mood='strain'):
    """The heavy: shaved head, thick neck, broken nose, small deep eyes, a jaw like a brick."""
    sk, sh, dp = pal['skin'], pal['shade'], pal.get('deep', INK)
    neck = t([(-22, 64), (-34, 132), (40, 132), (30, 100), (12, 104)])
    cv.shape(neck, dp, t.ink())
    cv.fill(t([(22, 104), (30, 100), (40, 132, 0), (28, 132, 0)]), sh, clip=neck)       # the front of it, in the light
    head = t(jaw_heavy())
    cv.fill(head, sk)
    # the planes away from the light: behind a line down the temple, the cheekbone and the jaw
    cv.fill(t([(-60, -10), (4, -4), (10, 26), (4, 40), (2, 56), (12, 66), (16, 78), (10, 92), (4, 120), (-60, 120)]), sh, clip=head)
    cv.fill(t([(6, 40), (14, 37), (26, 40), (30, 46), (24, 51), (12, 52), (4, 50)]), sh, clip=head)     # the sockets
    cv.fill(t([(27, 44), (31, 56), (35, 64), (42, 65), (37, 59), (33, 47)]), sh, clip=head)             # the nose's shade
    cv.fill(t([(12, 99), (24, 93), (36, 93), (30, 103), (10, 106)]), sh, clip=head)                      # under the chin
    cv.fill(t([(24, 82), (30, 83), (35, 81), (30, 87)]), sh, clip=head)                                   # under the lip
    cv.ink(head, t.ink())
    # the ear
    ear = t([(-6, 44), (-14, 39), (-21, 46), (-20, 58), (-12, 67), (-5, 62)])
    cv.shape(ear, sh, 3)
    cv.brush(t([(-10, 46), (-15, 50), (-13, 58)]), 2.5, 1)
    # the eyes: small, deep, under a heavy brow
    eye = t([(5, 47), (13, 44), (21, 47), (13, 49)])
    cv.fill(eye, (220, 214, 200))
    cv.ellipse(*t.pt(15, 46.5), t.len(2.6), t.len(2.6), dp, clip=eye)
    cv.brush(t([(3, 47), (9, 43.5), (17, 43.5), (23, 47)]), 3, 1.5)
    cv.brush(t([(7, 49.5), (13, 50.5), (20, 48.5)]), 1, 1.5)
    far = t([(29, 47), (32, 44.5), (35, 47), (32, 48)])
    cv.fill(far, (220, 214, 200))
    cv.ellipse(*t.pt(32.5, 46.5), t.len(1.6), t.len(2), dp, clip=far)
    cv.brush(t([(28, 47), (32, 44), (35.5, 46.5)]), 2.5, 1)
    lift = 2 if mood == 'strain' else 0
    cv.brush(t([(2, 41 + lift), (10, 37), (20, 37.5 + lift), (27, 41 + lift)]), 2, 2, mid=5)
    cv.brush(t([(29, 40 + lift), (33, 38), (36, 39)]), 4, 2)
    # the nose: broken, wide
    cv.brush(t([(33, 58), (36, 64), (41, 64)]), 2.5, 1.5)
    cv.fill(t([(37, 63), (40.5, 62.5), (40, 64.5)]), dp)
    cv.brush(t([(36, 49), (38, 52)]), 1.5, 0.5)                           # the break in it
    # mouth and folds
    if mood == 'strain':
        cv.fill(t([(21, 76), (28, 73.5), (37, 75), (29, 78)]), dp)        # teeth set
        cv.brush(t([(23, 75.8), (29, 75.3), (35.5, 75.2)]), 1.5, 1.5, col=(214, 200, 176))
        cv.brush(t([(28, 61), (23, 71), (19, 77)]), 3, 1)
    else:
        cv.brush(t([(21, 76), (29, 75), (37, 76.5)]), 3, 2)
        cv.brush(t([(28, 62), (22, 72), (19, 78)]), 2.5, 1)
    cv.brush(t([(26, 81), (31, 82), (35, 80)]), 2, 1)                     # under the lower lip
    cv.brush(t([(8, 26), (18, 24), (28, 27)]), 1.5, 0.5, col=sh)          # creases on his brow
    cv.brush(t([(10, 31), (20, 30), (27, 32)]), 1.5, 0.5, col=sh)


def head_slick(cv, t, pal, light='under'):
    """The one with the match, in profile: black hair combed straight back with oil, a pencil moustache, a hooked
    nose, a hollow under the cheekbone, a long hard jaw. light 'under': lit from a flame below and in front of his face
    (what faces down takes the light, the brow and the forehead go dark); 'none': a dark shape and its edge."""
    sk, sh, dp, hair, shine = pal['skin'], pal['shade'], pal.get('deep', INK), pal['hair'], pal['shine']
    neck = t([(-24, 66), (-30, 130), (22, 130), (16, 112), (12, 100)])
    head = t([(33, 15), (27, 5), (14, -1), (-4, -3), (-22, 0), (-34, 10), (-40, 26), (-40, 44), (-34, 58), (-24, 70, 0),
              (-10, 84), (-4, 89, 0), (8, 97), (22, 101), (29, 99), (32, 93), (31, 86, 0), (35, 81), (35, 77, 0),
              (37, 73), (35, 68, 0), (39, 67), (45, 64, 0), (43, 58), (38, 49), (33, 42, 0), (36, 36), (36, 28)])
    cv.fill(neck, sk)
    if light == 'under':
        cv.fill(t([(-60, 104), (2, 104), (12, 100), (17, 110), (22, 130, 0), (-60, 130, 0)]), sh, clip=neck)
        cv.fill(t([(-60, 60, 0), (-14, 84), (-2, 100), (-8, 130, 0), (-60, 130, 0)]), dp, clip=neck)
        cv.brush(t([(14, 108), (17, 113), (16, 118)]), 2, 1)                                     # his Adam's apple
    else:
        cv.fill(t([(-70, -30, 0), (70, -30, 0), (70, 130, 0), (-70, 130, 0)]), sh, clip=neck, smooth=False)
    cv.ink(neck, t.ink())
    cv.fill(head, sk)
    if light == 'under':
        # the forehead, the temple and the top of the cheekbone turned away from the flame
        lit_line = [(70, 68, 0), (44, 61), (37, 52), (31, 50), (22, 53), (12, 56), (2, 58), (-8, 64), (-16, 74), (-28, 80),
                    (-70, 80, 0), (-70, -30, 0), (70, -30, 0)]
        cv.fill(t(lit_line), sh, clip=head)
        cv.fill(t([(-70, -30, 0), (70, -30, 0), (70, 30, 0), (34, 31), (20, 34), (4, 40), (-8, 52), (-24, 70, 0), (-70, 70, 0)]), dp, clip=head)
        cv.brush(t([(14, 41), (24, 39.5), (34, 40)]), 0.5, 0.5, mid=1.8, col=pal.get('glint'))   # the brow ridge's underside
    # the hair: combed straight back with oil, black, the comb's tracks shining
    hair_s = t([(70, -30, 0), (70, 12, 0), (33, 14), (20, 17), (8, 23), (0, 32), (-4, 44), (-6, 56, 0), (-12, 50),
                (-18, 58), (-24, 72, 0), (-70, 72, 0), (-70, -30, 0)])
    hm = cv.fill(hair_s, hair, clip=head)
    for a, m, b, w in [((30, 12), (6, 2), (-22, 4), 2.2), ((24, 17), (2, 9), (-26, 14), 1.4), ((14, 22), (-8, 18), (-30, 30), 1.6)]:
        cv.brush(t([a, m, b]), 0.5, 0.5, col=shine, mid=w, clip=hm)                         # the comb's tracks, in the light
    cv.ink(head, t.ink())
    cv.brush(t([(33, 14), (20, 17), (8, 23), (0, 32), (-4, 44), (-6, 56)]), 2, 1)
    # the ear, the sideburn cut square in front of it
    ear = t([(-8, 46), (-15, 42), (-21, 49), (-20, 61), (-13, 69), (-8, 64)])
    cv.shape(ear, sh if light == 'under' else hair, 3)
    cv.brush(t([(-12, 48), (-17, 52), (-15, 60), (-12, 63)]), 2.5, 1)
    if light == 'under':
        cv.brush(t([(-19, 64), (-13, 69), (-9, 66)]), 1, 1, col=sk)
    cv.fill(t([(-7, 50, 0), (-3, 50, 0), (-3, 60), (-5, 66, 0), (-7, 62)]), hair)
    # the eye in profile under a heavy brow: the white's corner, the iris, the lid, the glint of the flame
    glint = pal.get('glint', (255, 200, 120))
    eye = t([(22, 47), (29, 44.5, 0), (30, 48.5, 0), (24, 49.5)])
    cv.fill(eye, pal.get('white', sh))
    cv.fill(t([(26, 45), (29, 44.6, 0), (30, 48.5, 0), (26.4, 49)]), dp, clip=eye)
    cv.ellipse(*t.pt(28, 48), t.len(0.9), t.len(0.9), glint)
    cv.brush(t([(18, 46), (24, 43.6), (31, 44.6)]), 3.5, 1.5)                 # the upper lid
    cv.brush(t([(23, 50.4), (30, 48.8)]), 1, 2, col=glint)                    # the lower lid, catching the flame
    cv.brush(t([(19, 41.5), (25, 40), (31, 41.2)]), 0.5, 0.5, mid=1.5)        # the crease of the lid
    cv.brush(t([(14, 38), (24, 35.5), (35, 37)]), 2, 2.5, mid=5.5)            # the brow, low and straight
    cv.brush(t([(16, 54), (22, 55), (28, 53.5)]), 0.5, 0.5, mid=1.5, col=sh)  # the bag under the eye
    # the hooked nose, the nostril's wing
    cv.brush(t([(38, 49), (40, 52)]), 1.5, 0.5)
    cv.brush(t([(34, 61), (34, 65), (37, 67.5)]), 2.5, 1)
    cv.brush(t([(31, 61), (33, 58), (37, 59)]), 1, 1, col=sh)
    # the pencil moustache along the lip, the thin mouth, the chin
    cv.brush(t([(28, 71.6), (33, 71), (37.4, 71.8)]), 1.5, 2.6, col=hair)
    cv.brush(t([(27, 76.6), (31, 76.4), (35.4, 77)]), 1.5, 2.4)
    cv.brush(t([(29, 72), (27, 70), (26, 66)]), 0.4, 0.4, mid=1.4)            # the corner of the mouth
    cv.brush(t([(28, 64), (25, 70), (27, 76)]), 2, 0.5, col=sh)               # the fold from the nose
    cv.brush(t([(8, 64), (13, 72), (15, 78)]), 2, 0.5, col=sh)                # the hollow of the cheek
    cv.brush(t([(-9, 74), (-5, 86), (4, 95)]), 1, 2.5, col=sh)                # the jaw's edge
    cv.brush(t([(29, 84.5), (33, 85)]), 2, 0.5)                               # under the lip
    cv.brush(t([(20, 96), (28, 95)]), 0.5, 0.5, mid=1.5, col=sh)              # the cleft of the chin


def head_young(cv, t, pal):
    """The young one, three quarters: a square jaw under a three days' beard, a broken nose, thick low brows, hair
    combed back hard into a short ponytail, a stitched scar from the brow down the cheek; a crooked grin at what he
    counts, his eyes down on it. Lit from the front, low."""
    sk, sh, dp, hair, shine = pal['skin'], pal['shade'], pal.get('deep', INK), pal['hair'], pal['shine']
    tail = t([(-30, 50), (-40, 56), (-44, 68), (-42, 82), (-36, 74), (-31, 62)])
    cv.shape(tail, hair, 3)
    cv.brush(t([(-37, 60), (-40, 70), (-39, 78)]), 1, 0.5, col=shine, mid=2)
    cv.shape(t([(-30, 52), (-35, 49), (-37, 56), (-32, 59)]), pal.get('band', (90, 30, 40)), 2)
    neck = t([(-16, 70), (-24, 130), (40, 130), (28, 102), (12, 104)])
    cv.shape(neck, dp, t.ink())
    cv.fill(t([(20, 104), (28, 102), (40, 130, 0), (26, 130, 0)]), sh, clip=neck)
    cv.brush(t([(26, 108), (30, 114), (29, 120)]), 2, 1)                 # his Adam's apple
    jaw = [(0, 2), (16, 4), (27, 11), (33, 23), (35, 34, 0), (32, 40), (36, 47), (38, 52), (43, 61, 0), (39, 65), (35, 66, 0),
           (37, 71), (36, 76, 0), (37, 80), (33, 85, 0), (35, 94), (31, 103, 0), (14, 106), (-4, 99), (-12, 88, 0),
           (-15, 72), (-28, 60), (-35, 42), (-33, 22), (-20, 7)]
    head = t(jaw)
    cv.fill(head, sk)
    away = t([(-60, -10, 0), (2, -4), (9, 26), (4, 40), (1, 56), (10, 66), (14, 82), (8, 96), (4, 120), (-60, 120, 0)])
    cv.fill(away, sh, clip=head)                                         # the planes turned from the light
    cv.fill(t([(5, 39), (15, 37), (27, 39), (30, 45), (22, 47.5), (8, 48)]), sh, clip=head)        # the sockets
    cv.fill(t([(27, 45), (31, 56), (35, 65), (41, 66), (37, 60), (33, 48)]), sh, clip=head)
    cv.fill(t([(4, 58), (14, 60), (22, 66), (14, 70), (6, 68)]), sh, clip=head)                    # under the cheekbone
    cv.fill(t([(10, 102), (22, 97), (34, 96), (31, 103), (14, 106)]), dp, clip=head)               # under the chin
    # the beard, three days of it, on the lit side
    cv.fill(t([(10, 68), (18, 67), (28, 68), (38, 70), (38, 80), (36, 94), (31, 103), (14, 106), (6, 98), (12, 84)]),
            pal.get('stubble', sh), clip=head, cut=away)
    # the hair, combed back hard from a widow's peak, a lock come loose
    cv.fill(t([(60, -20, 0), (60, 9, 0), (30, 12), (22, 17), (18, 14), (12, 20), (4, 24), (-2, 33), (-6, 45), (-8, 57, 0),
               (-16, 51), (-60, 74, 0), (-60, -20, 0)]), hair, clip=head)
    for a, b in [((24, 8), (-18, 6)), ((16, 14), (-26, 18)), ((6, 22), (-30, 32))]:
        cv.brush(t([a, ((a[0] + b[0]) / 2, (a[1] + b[1]) / 2 - 5), b]), 0.5, 1, col=shine, mid=2.5, clip=head)
    cv.ink(head, t.ink())
    cv.brush(t([(30, 12), (22, 17), (18, 14), (12, 20), (4, 24), (-2, 33), (-6, 45), (-8, 57)]), 2, 1)
    cv.brush(t([(20, 14), (26, 24), (25, 32)]), 2.5, 0.5, col=hair)      # the loose lock
    ear = t([(-7, 46), (-14, 41), (-20, 48), (-19, 59), (-12, 67), (-6, 62)])
    cv.shape(ear, sh, 3)
    cv.brush(t([(-11, 48), (-16, 52), (-14, 59)]), 2.5, 1)
    cv.ellipse(*t.pt(-13, 66), t.len(1.6), t.len(1.6), pal.get('gold', (232, 190, 80)))   # a stud in his ear
    # the eyes, narrowed, down on the money; thick low brows
    eye34(cv, t, 15, 47, 14, pal, look=0.7, open_=0.6, glint=pal.get('glint'))
    far = t([(28.5, 47), (31.5, 45.5), (34.5, 46.5), (32, 48)])
    cv.fill(far, pal.get('white', (200, 186, 168)))
    cv.ellipse(*t.pt(32.5, 47), t.len(1.4), t.len(1.4), dp, clip=far)
    cv.brush(t([(28, 47), (31.5, 45), (35, 46)]), 2.5, 1)
    cv.brush(t([(4, 41), (12, 38.5), (22, 39.5), (28, 42)]), 3, 2.5, mid=5.5)
    cv.brush(t([(29.5, 41.5), (33, 40), (36, 41)]), 4, 1.5)
    # the nose, broken once
    cv.brush(t([(36, 50), (38, 53)]), 2, 0.5)
    cv.brush(t([(33, 59), (36, 65), (41, 65.5)]), 2.5, 1)
    cv.fill(t([(37, 64.5), (40, 64), (39.5, 65.8)]), dp)
    # the crooked grin: the near corner pulled up, a few teeth
    mouth = t([(17, 72), (24, 73), (35, 74.5), (33, 76.4), (24, 76.6), (19, 75)])
    cv.fill(mouth, dp)
    cv.fill(t([(19, 73), (24, 73.8), (30, 74.6), (29, 75.4), (23, 75.2), (20, 74.4)]), pal.get('teeth', (214, 204, 180)), clip=mouth)
    cv.ink(mouth, 2)
    cv.brush(t([(14, 69), (17, 72), (18, 77)]), 2, 0.5)                 # the crease of the grin
    cv.brush(t([(28, 62), (22, 68), (17, 72)]), 2.5, 1)
    cv.brush(t([(24, 81), (30, 81.5), (34, 80)]), 2, 1)
    # the scar: through the brow and down the cheek, pale, stitched
    scar = pal.get('scar', (236, 190, 170))
    cv.brush(t([(9, 34), (12, 41)]), 2, 2, col=scar)
    cv.brush(t([(7, 54), (12, 62), (15, 72)]), 2.5, 1.5, col=scar)
    for k in range(3):
        y = 57 + k * 5
        cv.brush(t([(6 + k * 3, y + 2), (12 + k * 3, y - 1)]), 1, 1, col=sh)


def head_old(cv, t, pal):
    """The building's super, three quarters, the moment he is shot: a wide tired face, jowls, a big nose, bags under
    the eyes, grey hair gone from the top and thick over the ears, reading glasses; the eyes gone wide, the brows up,
    the mouth open on a cry that does not come."""
    sk, sh, dp, hair, hairD = pal['skin'], pal['shade'], pal.get('deep', INK), pal['hair'], pal['hairD']
    head = t([(-2, 11), (16, 11), (27, 18), (33, 28), (35, 35, 0), (32, 40), (36, 48), (45, 62, 0), (42, 68), (36, 69, 0),
              (37, 74), (35, 78, 0), (37, 84), (33, 88, 0), (33, 95), (24, 104), (8, 106), (-6, 98), (-14, 86, 0),
              (-18, 72), (-28, 62), (-33, 44), (-31, 27), (-19, 15)])
    neck = t([(-8, 84), (-10, 118), (24, 118), (22, 104), (10, 104)])
    cv.shape(neck, sh, 3)
    cv.brush(t([(16, 104), (18, 110), (17, 118)]), 1.5, 1)                 # the old man's neck, its cords
    cv.fill(head, sk)
    cv.fill(t([(-60, -10, 0), (-4, -4), (2, 26), (-1, 40), (-4, 56), (2, 70), (4, 86), (-2, 100), (-6, 120), (-60, 120, 0)]), sh, clip=head)
    cv.fill(t([(4, 62), (12, 66), (14, 84), (8, 92), (2, 80)]), sh, clip=head)                       # the hollow of the cheek
    cv.fill(t([(4, 40), (14, 37), (26, 40), (30, 47), (22, 52), (8, 52)]), sh, clip=head)
    cv.fill(t([(27, 46), (32, 58), (37, 67), (44, 68), (38, 62), (33, 48)]), sh, clip=head)
    cv.fill(t([(8, 100), (20, 96), (32, 95), (24, 104), (8, 106)]), sh, clip=head)
    # grey hair: gone from the top, thick and untidy over the ears and the back
    cv.fill(t([(-60, 10, 0), (-20, 8), (-8, 24), (-4, 40), (-6, 56, 0), (-16, 60), (-60, 80, 0)]), hair, clip=head)
    for a, b in [((-10, 26), (-30, 30)), ((-8, 40), (-34, 46)), ((-12, 52), (-32, 58))]:
        cv.brush(t([a, b]), 1.5, 0.5, col=hairD, clip=head)
    cv.ink(head, t.ink())
    tufts = t([(-6, 28), (-4, 22), (0, 30), (2, 24), (2, 34)])
    cv.brush(tufts, 2, 1, col=hair)
    ear = t([(-6, 46), (-15, 40), (-22, 48), (-21, 62), (-13, 72), (-6, 66)])
    cv.shape(ear, sh, 3)
    cv.brush(t([(-10, 48), (-16, 53), (-14, 63)]), 2.5, 1)
    # the eyes, open on nothing: no glint, the lids half down
    eye34(cv, t, 14, 47, 15, dict(pal, white=pal.get('white', (190, 180, 160))), look=0.5, open_=1.15)
    far = t([(28, 47), (31.5, 45), (35, 46.5), (32, 48.5)])
    cv.fill(far, pal.get('white', (190, 180, 160)))
    cv.ellipse(*t.pt(31.5, 46.6), t.len(1.4), t.len(1.6), dp, clip=far)
    cv.brush(t([(27.5, 47), (31.5, 44.5), (35, 46)]), 2.5, 1)
    # thick grey brows, the lines of sixty years
    cv.brush(t([(3, 40), (10, 35), (20, 34), (27, 38)]), 2.5, 2, mid=5, col=hair)
    cv.brush(t([(29, 38), (33, 35.5), (36, 37)]), 3.5, 1.5, col=hair)
    cv.brush(t([(4, 40), (10, 35.6), (20, 34.6), (27, 38.4)]), 0.5, 0.5, mid=1.4)
    for y in (24, 29):
        cv.brush(t([(8, y), (18, y - 2), (28, y)]), 0.5, 0.5, mid=1.6)
    for k in range(3):
        cv.brush(t([(4, 44 + k * 3), (-1, 43 + k * 4)]), 1.2, 0.3)          # crow's feet
    cv.brush(t([(6, 55), (14, 58), (22, 55)]), 0.5, 0.5, mid=1.8)          # the bags
    cv.brush(t([(8, 59), (15, 62), (22, 59)]), 0.4, 0.4, mid=1.2, col=sh)
    # a big nose, the deep folds, the jowls, the mouth fallen open
    cv.brush(t([(33, 61), (37, 68), (43, 68)]), 2.5, 1.5)
    cv.fill(t([(39, 66.5), (42.5, 66), (42, 68.4)]), dp)
    cv.brush(t([(30, 64), (22, 74), (18, 86)]), 3, 1)
    cv.brush(t([(12, 82), (16, 94), (22, 100)]), 1.5, 0.5)                 # the jowl
    mouth = t([(23, 78), (29, 77), (35, 78), (33, 83), (28, 85), (24, 83)])
    cv.fill(mouth, dp)
    cv.fill(t([(25, 77.5), (30, 77.2), (34, 78), (30, 79)]), (196, 184, 160), clip=mouth)
    cv.ink(mouth, 2)
    cv.brush(t([(25, 87), (29, 88), (33, 86)]), 1, 0.5, col=sh)            # the lower lip
    # his reading glasses, knocked askew
    fr = pal.get('frame', (58, 42, 26))
    cv.ink(t([(4, 44), (14, 41), (24, 45), (23, 53), (13, 56), (5, 52)]), 2.5, col=fr)
    cv.ink(t([(29, 44), (34, 42.5), (37, 45), (36, 51), (31, 52)]), 2, col=fr)
    cv.brush(t([(24, 46), (29, 45)]), 2, 2, col=fr)
    cv.brush(t([(4, 46), (-6, 46), (-14, 50)]), 2, 1.5, col=fr)
    cv.brush(t([(26, 89), (31, 89.5)]), 1.5, 0.5)


def head_hero(cv, pal, open_):
    """Him, asleep on his side, so close the panel is his eye: the brow, brown hair fallen over it, the bridge of the
    nose, the cheek pressed into the pillow, three days' beard; the eye shut, or open on the noise (open_)."""
    sk, sh, hair, hairL = pal['skin'], pal['shade'], pal['hair'], pal['hairL']
    cv.rect(0, 0, 450, 174, sk)
    cv.fill([(0, 0, 0), (60, 0), (90, 60), (80, 120), (40, 174, 0), (0, 174, 0)], sh)                  # the temple, away
    cv.fill([(120, 66), (180, 50), (250, 54), (290, 72), (250, 80), (180, 76)], sh)                    # under the brow
    cv.fill([(300, 20), (318, 80), (340, 140), (360, 174, 0), (450, 174, 0), (450, 0, 0), (310, 0, 0)], sh)   # beyond the nose
    cv.fill([(150, 120), (230, 130), (300, 124), (330, 174, 0), (120, 174, 0)], pal['stubble'])
    cv.brush([(296, 10), (312, 70), (330, 120), (352, 174)], 3, 5)                                   # the bridge of the nose
    cv.brush([(336, 30), (346, 60)], 1.5, 0.5, col=sh)
    # the far eye, past the nose, in the dark, and the neon from the window along his face
    cv.brush([(372, 74), (392, 70), (412, 76)], 2, 1.5, mid=4)
    cv.brush([(372, 52), (400, 46), (424, 54)], 4, 2, mid=9, col=hair)
    cv.fill([(436, 0, 0), (450, 0, 0), (450, 174, 0), (440, 174, 0), (430, 90)], pal['neon'])
    # the near eye
    t = T(0, 0, 1.0)
    eye34(cv, t, 196, 92, 92, pal, look=0.7, open_=open_ * 0.85, glint=pal.get('glint') if open_ > 0 else None)
    cv.brush([(150, 128), (200, 136), (250, 130)], 0.5, 0.5, mid=2.5, col=sh)                      # the bag under it
    # the brow, and his hair fallen over it
    cv.brush([(120, 60), (170, 44), (230, 42), (282, 54)], 6, 4, mid=15, col=hair)
    cv.fill([(0, 0, 0), (450, 0, 0), (450, 14, 0), (400, 22), (340, 12), (300, 26), (250, 14), (200, 30), (150, 16),
             (100, 34), (50, 20), (0, 30, 0)], hair)
    for x0, x1, y1, w in ((60, 90, 70, 9), (130, 150, 50, 7), (210, 236, 46, 8), (262, 300, 60, 6), (330, 340, 40, 6)):
        cv.brush([(x0, 0), (x0 + (x1 - x0) * 0.5, y1 * 0.6), (x1, y1)], w, 1, col=hair)
        cv.brush([(x0 + 3, 0), (x0 + 3 + (x1 - x0) * 0.5, y1 * 0.5)], 2, 0.5, col=hairL)
    # the pillow pressing into his cheek
    pillow = [(0, 140), (60, 128), (130, 150), (200, 160), (260, 174, 0), (0, 174, 0)]
    cv.shape(pillow, pal['pillow'], 4)
    cv.brush([(40, 150), (90, 146), (130, 160)], 2, 1, col=pal['pillowD'])


def eye34(cv, t, x, y, w, pal, look=0.0, open_=1.0, glint=None):
    """A near eye in three quarters, centred (x, y), w wide: a dark iris half under a heavy upper lid, a little of the
    white each side of it (shaded, never pure), the lower lid. look -1..1 moves the iris; open_ 0: shut, the lashes."""
    dp, sh = pal.get('deep', INK), pal['shade']
    if open_ <= 0:
        cv.brush(t([(x - w / 2, y), (x - w / 6, y + 1.4), (x + w / 3, y + 0.8), (x + w / 2, y - 0.4)]), 1.5, 1.2, mid=3)
        cv.brush(t([(x - w / 3, y - 2.6), (x + w / 4, y - 2.6), (x + w / 2, y - 1.2)]), 0.5, 0.5, mid=1.4, col=sh)
        return
    h = w * 0.38 * open_
    al = t([(x - w / 2, y + 0.6, 0), (x - w / 5, y - h * 0.6), (x + w / 4, y - h * 0.55), (x + w / 2, y - h * 0.05, 0),
            (x + w / 5, y + h * 0.48), (x - w / 5, y + h * 0.44)])
    cv.fill(al, pal.get('white', (200, 186, 168)))
    ix = x + look * w * 0.2
    cv.ellipse(*t.pt(ix, y - h * 0.05), t.len(w * 0.24), t.len(w * 0.24), pal.get('iris', dp), clip=al)
    cv.ellipse(*t.pt(ix, y - h * 0.05), t.len(w * 0.1), t.len(w * 0.1), dp, clip=al)
    cv.fill(t([(x - w / 2, y - h, 0), (x + w / 2, y - h, 0), (x + w / 2, y - h * 0.05, 0), (x + w / 4, y - h * 0.3),
               (x - w / 5, y - h * 0.32), (x - w / 2, y + 0.6, 0)]), sh, clip=al)          # the lid's shadow on the eye
    if glint:
        cv.ellipse(*t.pt(ix + w * 0.07, y - h * 0.12), t.len(w * 0.045), t.len(w * 0.045), glint, clip=al)
    cv.brush(t([(x - w / 2 - 1, y + 0.8), (x - w / 5, y - h * 0.66), (x + w / 4, y - h * 0.6), (x + w / 2 + 0.6, y + 0.2)]), 2.2, 1.8, mid=3.8)
    cv.brush(t([(x - w / 4, y + h * 0.52), (x + w / 5, y + h * 0.52), (x + w / 2, y + 0.6)]), 0.6, 1.4)
    cv.brush(t([(x - w / 3, y - h * 0.6 - 2.6), (x + w / 4, y - h * 0.62 - 2.4), (x + w / 2, y - h * 0.2 - 1.4)]), 0.5, 0.5,
             mid=1.5, col=sh)                                            # the crease of the lid
    cv.brush(t([(x - w / 4, y + h * 0.6 + 2.4), (x + w / 6, y + h * 0.7 + 2.6)]), 0.4, 0.4, mid=1.2, col=sh)   # the bag


# ---------------------------------------------------------------- bodies, hands, floors
def finger(cv, pts, w, col, shade=None, side=1, band=0.45):
    """A finger (or an arm) along pts, w thick, inked; shade: a band of that colour down one side (side 1: the lower
    right one, -1 the other), band x w wide."""
    cv.brush(pts, w + 3, w + 1, col=INK)
    cv.brush(pts, w - 1.5, w - 2.5, col=col)
    if shade:
        a, b = pts[0], pts[-1]
        dx, dy = b[0] - a[0], b[1] - a[1]
        d = math.hypot(dx, dy) or 1
        off = (w - 1.5) / 2 - w * band / 2
        ox, oy = -dy / d * off * side, dx / d * off * side
        cv.brush([(p[0] + ox, p[1] + oy) for p in pts], w * band, w * band * 0.7, col=shade)


def leather(cv, pts, lit, edge=None, w=4):
    """A black leather jacket's part: black, its folds caught by the light in flat streaks (edge: those streaks,
    each a point list)."""
    m = cv.fill(pts, INK)
    for e in edge or []:
        cv.fill(e, lit, clip=m)
    if w:
        cv.ink(pts, w)
    return m


def backlit(cv, m, col, sides=((3, 0), (-2, 0))):
    """The edges of a dark shape caught by a light behind it: a thin rim on each side given as (dx, dy), the way the
    light comes from."""
    for dx, dy in sides:
        cv.im.paste(col, (0, 0), ImageChops.subtract(m, ImageChops.offset(m, -dx, -dy)))


def limb(m, pts, w0, w1):
    """A tapered stroke into a mask (a limb of a figure)."""
    cv = Cv.__new__(Cv)
    cv.w, cv.h, cv.im = m.size[0], m.size[1], m
    cv.brush(pts, w0, w1, col=255)


def figure(cv, j, x, y, s=1.0, f=1):
    """A man standing, as one mask, from his joints (local px, feet at 0, up is negative y; f -1 mirrors him):
    head (x, y, rx, ry), neck, sh (shoulders l, r), hip (l, r), arms [[shoulder, elbow, hand, w]], legs [[hip, knee,
    foot, w]], extra [point lists] (hair, a tail, what he holds). Returns the mask."""
    P = lambda p: (x + p[0] * s * f, y + p[1] * s)
    m = cv.blank()
    d = ImageDraw.Draw(m)
    hx_, hy_, rx, ry = j['head']
    c = P((hx_, hy_))
    d.ellipse([c[0] - rx * s, c[1] - ry * s, c[0] + rx * s, c[1] + ry * s], fill=255)
    sl, sr = j['sh']
    hl, hr = j['hip']
    nk = j['neck']
    d.polygon(spline([P(sl) + (0,), P((sl[0] * 0.5, nk[1] + 6)), P(nk), P((sr[0] * 0.5, nk[1] + 6)), P(sr) + (0,),
                      P((sr[0] - 6, sr[1] + (hr[1] - sr[1]) * 0.45)), P(hr) + (0,), P(hl) + (0,),
                      P((sl[0] + 6, sl[1] + (hl[1] - sl[1]) * 0.45))]), fill=255)
    d.rectangle([min(P((-6, nk[1]))[0], P((6, nk[1]))[0]), P((0, hy_))[1], max(P((-6, nk[1]))[0], P((6, nk[1]))[0]), P(nk)[1] + 4], fill=255)
    for sh_, el, hd, w in j['arms']:
        limb(m, [P(sh_), P(el), P(hd)], w * s, w * 0.7 * s)
    for hp, kn, ft, w in j['legs']:
        limb(m, [P(hp), P(kn), P(ft)], w * s, w * 0.7 * s)
        d.polygon(spline([P((ft[0] - 4, ft[1] - 4)), P((ft[0] + 12 * f, ft[1] - 3)), P((ft[0] + 13 * f, ft[1] + 1, 0)),
                          P((ft[0] - 5, ft[1] + 1, 0))]), fill=255)
    for pts in j.get('extra', []):
        d.polygon(spline([P(p) + ((0,) if len(p) > 2 else ()) for p in pts]), fill=255)
    for pts, w in j.get('rods', []):
        limb(m, [P(p) for p in pts], w * s, w * s)
    return m


# the three of them standing, about 200 px tall at s 1, feet at 0: the heavy square on, the slick one turned to the
# left (his torch held out, his nose and his combed hair against the light), the young one turned to the right (his
# ponytail)
HEAVY = dict(head=(0, -176, 12, 14), neck=(0, -162), sh=((-36, -156), (36, -156)), hip=((-26, -94), (26, -94)),
             arms=[[(-34, -150), (-44, -112), (-42, -80), 17], [(34, -150), (44, -112), (42, -80), 17]],
             legs=[[(-14, -94), (-17, -48), (-19, 0), 19], [(14, -94), (17, -48), (19, 0), 19]],
             extra=[[(-11, -166), (11, -166), (17, -152), (-17, -152)], [(-11, -179), (-14, -177), (-14, -171), (-11, -170)],
                    [(11, -179), (14, -177), (14, -171), (11, -170)]],
             rods=[[[(42, -82), (52, -4)], 6]])
SLICK = dict(head=(0, -182, 10, 13), neck=(0, -166), sh=((-25, -160), (25, -160)), hip=((-18, -98), (18, -98)),
             arms=[[(-23, -156), (-46, -140), (-74, -142), 11], [(23, -156), (30, -124), (28, -96), 11]],
             legs=[[(-9, -98), (-12, -50), (-15, 0), 14], [(9, -98), (10, -50), (10, 0), 14]],
             extra=[[(-9, -186), (-15, -180, 0), (-9, -176)], [(-9, -192), (2, -197), (12, -190), (13, -176), (6, -178)]],
             rods=[[[(-72, -142), (-86, -144)], 7]])
YOUNG = dict(head=(0, -178, 10, 13), neck=(0, -162), sh=((-24, -156), (24, -156)), hip=((-17, -96), (17, -96)),
             arms=[[(-22, -152), (-30, -124), (-20, -100), 11], [(22, -152), (30, -124), (20, -100), 11]],
             legs=[[(-9, -96), (-11, -48), (-13, 0), 13], [(9, -96), (11, -48), (13, 0), 13]],
             extra=[[(-7, -186), (-14, -182), (-18, -170), (-16, -154), (-11, -162), (-8, -174)],
                    [(9, -182), (15, -176, 0), (9, -172)]])


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


# ================================================================ the panels
# Each panel is painted at SC x its size in the title's px (Cinematic.js PAGES gives the same sizes).
FLAME = (536, 160)    # page 2, panel 3: where the match's head is (panel px); the game draws its flame there


def panel_eye(open_):
    """Before the pages, over the room: his eye, shut, then open on the noise. In the night's blue, the neon of the
    bar across the street on his face through the window."""
    cv = Cv(450, 174)
    pal = dict(skin=hx('#a8706a'), shade=hx('#5a3448'), stubble=hx('#9a6462'), hair=hx('#2a1812'), hairL=hx('#5a3a2a'),
               white=hx('#c8b0b0'), iris=hx('#4a2a18'), glint=hx('#ff8ab0'), neon=hx('#ff3a7a'),
               pillow=hx('#3a3a5a'), pillowD=hx('#24243a'))
    head_hero(cv, pal, 1.0 if open_ else 0.0)
    return cv


def panel_door():
    """Page 1, panel 1. From the dark of his flat: his front door forced, the three of them in it against the yellow
    light of the landing, their shadows thrown long across his floor to us; the torch looking for something."""
    cv = Cv(1080, 288, hx('#0c0b16'))
    foot = 226                                                              # the floor at the door
    night, floor, deep = hx('#15152c'), hx('#0e0e1c'), hx('#08070e')
    sodium, sodiumD, sodiumDD = hx('#f0b44c'), hx('#b8782a'), hx('#5a3416')
    beam, beamD = hx('#3a3650'), hx('#24223a')
    cv.rect(0, 0, 1080, 214, night)
    cv.rect(0, 214, 1080, 288, floor)
    for x in range(-400, 1500, 70):                                        # the boards, running to the door
        cv.brush([(745 + (x - 745) * 0.3, 214), (745 + (x - 745) * 1.6, 288)], 1.5, 2.5, col=deep)
    cv.brush([(0, 214), (1080, 214)], 4, 4)
    # the window on the left wall: the night, the neon of the bar across the street; its light on the floor
    cv.rect(50, 34, 200, 150, hx('#1a1030'))
    cv.rect(66, 62, 132, 70, hx('#ff2a6d'))
    cv.rect(146, 96, 188, 101, hx('#2a8ac8'))
    cv.ink([(50, 34, 0), (200, 34, 0), (200, 150, 0), (50, 150, 0)], 6, smooth=False)
    cv.brush([(125, 34), (125, 150)], 5, 5)
    cv.brush([(50, 92), (200, 92)], 5, 5)
    cv.fill([(30, 288, 0), (80, 216, 0), (230, 216, 0), (200, 288, 0)], hx('#2a1430'), smooth=False)
    # his sofa and the low table in front of it, in the dark (lit again below where the torch's beam falls)
    torch = (694 - 86, foot - 138)
    beam_pts = [torch, (290, 288, 0), (570, 288, 0)]

    def room(c, clip=None):
        sofa_back = [(240, 150), (470, 146), (476, 192, 0), (236, 196, 0)]
        cv.fill(sofa_back, c[0], clip=clip)
        for x in (318, 396):
            cv.brush([(x, 152), (x + 1, 192)], 2, 2, col=c[2], clip=clip)
        cv.fill([(226, 190, 0), (488, 186, 0), (492, 226, 0), (222, 230, 0)], c[1], clip=clip, smooth=False)
        for arm in ([(214, 168), (240, 162), (246, 232, 0), (214, 234, 0)], [(470, 160), (498, 164), (500, 228, 0), (474, 230, 0)]):
            cv.fill(arm, c[0], clip=clip)
            cv.ink(arm, 3)
        cv.fill([(300, 236, 0), (440, 234, 0), (444, 246, 0), (296, 248, 0)], c[1], clip=clip, smooth=False)      # the table
        cv.fill([(310, 248, 0), (318, 248, 0), (318, 270, 0), (310, 270, 0)], c[2], clip=clip, smooth=False)
        cv.fill([(424, 246, 0), (432, 246, 0), (432, 268, 0), (424, 268, 0)], c[2], clip=clip, smooth=False)
        cv.fill([(370, 206, 0), (380, 206, 0), (382, 234, 0), (368, 234, 0)], c[3], clip=clip, smooth=False)      # a bottle
        cv.ellipse(340, 232, 12, 4, c[2], clip=clip)                                                               # an ashtray
    room((deep, hx('#100e1c'), INK, hx('#121024')))
    cv.ink([(240, 150), (470, 146), (476, 192, 0), (236, 196, 0)], 3)
    # the doorway, the landing behind it in sodium yellow, the lamp on its wall
    dx0, dx1, dy0, dy1 = 664, 828, 8, foot
    cv.rect(dx0, dy0, dx1, dy1, sodium)
    cv.rect(dx0, dy0 + 162, dx1, dy1, sodiumD)
    cv.rect(dx0, dy0 + 156, dx1, dy0 + 162, sodiumDD)
    cv.rect(dx0, dy0, dx0 + 22, dy1, sodiumD)                              # the landing's far wall, in shade
    cv.ellipse(806, 60, 10, 8, hx('#fff6d0'))
    cv.brush([(806, 68), (806, 76)], 6, 6, col=sodiumDD)
    cv.rect(dx0 - 10, 0, dx0, 288, deep)
    cv.rect(dx1, 0, dx1 + 10, 288, deep)
    cv.ink([(dx0, dy0, 0), (dx1, dy0, 0), (dx1, dy1, 0), (dx0, dy1, 0)], 6, smooth=False)
    # his door, swung in against the wall, its edge splintered at the lock
    door = [(dx0 - 10, dy0 - 8, 0), (604, 0, 0), (604, 258, 0), (dx0 - 10, dy1 + 4, 0)]
    cv.fill(door, hx('#1c1424'), smooth=False)
    cv.fill([(604, 0, 0), (616, 2, 0), (616, 254, 0), (604, 258, 0)], hx('#3a2a40'), smooth=False)
    cv.ink(door, 4, smooth=False)
    for k in range(6):
        y = 116 + k * 5
        cv.brush([(616, y), (628 + (k % 3) * 5, y - 3 + k)], 3, 0.5, col=hx('#e8c890'))
    cv.ellipse(632, 128, 4, 4, hx('#c8a050'))                              # the lock's tongue, torn out
    # the light thrown in across the floor, and their shadows long in it
    spill = [(dx0, dy1, 0), (dx1, dy1, 0), (1000, 288, 0), (430, 288, 0)]
    cv.fill(spill, sodiumDD, smooth=False)
    cv.fill([(dx0 + 10, dy1, 0), (dx1 - 10, dy1, 0), (930, 288, 0), (510, 288, 0)], hx('#7a4e1e'), smooth=False)
    for x0, w0, x1, w1 in [(694, 30, 560, 80), (754, 46, 760, 120), (808, 26, 900, 60)]:
        cv.fill([(x0 - w0 / 2, dy1, 0), (x0 + w0 / 2, dy1, 0), (x1 + w1 / 2, 288, 0), (x1 - w1 / 2, 288, 0)], hx('#120a0c'),
                clip=spill, smooth=False)
    # the three of them, dark against the light, its edge on them; the torch's beam on the floor
    cv.fill(beam_pts, beamD, smooth=False)
    cv.fill([torch, (350, 288, 0), (520, 288, 0)], beam, smooth=False)
    room((hx('#4a3a5a'), hx('#5a4a6a'), hx('#2a2238'), hx('#6a8a6a')), clip=beam_pts)
    for j, x, y, sc, f in ((YOUNG, 808, dy1 - 2, 0.95, 1), (HEAVY, 754, dy1 + 2, 1.04, 1), (SLICK, 694, dy1 + 6, 1.0, 1)):
        m = figure(cv, j, x, y, sc, f)
        cv.im.paste(INK, (0, 0), m)
        backlit(cv, m, sodium, ((3, 0), (-2, 0), (0, -2)))
    cv.ellipse(*torch, 5, 5, hx('#fff6d0'))
    return cv


def panel_pry():
    """Page 1, panel 2. Down at the floor: the heavy on one knee, his weight on a crowbar under one of the boards;
    it comes up screaming on its nails. A torch from the left lights him and the hole."""
    cv = Cv(348, 282, hx('#120c10'))
    wood, wood2, woodD, woodL = hx('#5a3424'), hx('#523020'), hx('#3e2218'), hx('#8a5a3a')
    sk = dict(skin=hx('#eaa86a'), shade=hx('#7a4026'), lit=hx('#7a5240'))
    cv.rect(0, 0, 348, 130, hx('#17111c'))
    cv.rect(0, 112, 348, 130, hx('#22161e'))                                # the skirting, the wall's foot
    cv.brush([(0, 112), (348, 112)], 2, 2, col=INK)
    boards(cv, 130, 282, 150, -200, 9, [wood, wood2], gap=hx('#1a0c08'))
    # the hole: a board out, the dark under it, the corner of a tin box catching the light
    hole = [(10, 236, 0), (150, 206, 0), (164, 230, 0), (18, 266, 0)]
    cv.fill(hole, INK, smooth=False)
    cv.fill([(60, 244, 0), (126, 230, 0), (132, 248, 0), (66, 262, 0)], hx('#6a7480'), smooth=False)
    cv.fill([(60, 244, 0), (126, 230, 0), (127, 234, 0), (61, 248, 0)], hx('#c8d0d8'), smooth=False)
    # the board coming up on its nails, splintering
    board = [(4, 230, 0), (128, 178, 0), (140, 188, 0), (12, 240, 0)]
    cv.shape(board, woodL, 3)
    cv.fill([(4, 230, 0), (12, 240, 0), (10, 246, 0), (2, 236, 0)], woodD, smooth=False)
    for x, y in ((40, 220), (100, 194)):
        cv.brush([(x, y), (x + 2, y + 18)], 2.5, 1.5, col=hx('#c8ccd4'))
    for k in range(5):
        cv.brush([(128 + k * 3, 182 + k * 2), (146 + k * 5, 172 + k * 5)], 2.5, 0.5, col=hx('#f0d0a0'))   # splinters
    # the crowbar, from his fists down under the board
    cv.brush([(214, 146), (126, 196), (118, 204), (126, 210)], 11, 9)
    cv.brush([(213, 143), (126, 193)], 3, 3, col=hx('#a83a30'))
    # him: the bulk of his jacket, his head bent over the work
    body = [(170, 282), (176, 210), (204, 170), (256, 150), (320, 148), (348, 160), (348, 282)]
    leather(cv, body, sk['lit'], [[(176, 210), (204, 170), (212, 174), (186, 214)]])
    head_heavy(cv, T(262, 10, 1.22, -1, -0.28), sk, 'strain')
    cv.brush([(208, 156), (224, 166), (250, 168), (272, 160)], 3, 3, col=hx('#e8c050'))     # his gold chain
    cv.brush([(212, 158), (226, 166)], 1, 1, col=hx('#fff0a0'))
    # his arms down to the bar, the gloved fists closed on it
    for arm in ([(272, 168), (238, 166), (216, 152), (204, 170), (204, 204), (230, 222), (268, 212)],
                [(214, 200), (186, 190), (168, 186), (158, 204), (172, 226), (206, 232)]):
        backlit(cv, cv.fill(arm, INK), sk['lit'], ((-3, 0), (0, -3)))
    for k in range(3):
        finger(cv, [(224 - k * 4, 140 + k * 9), (210 - k * 4, 142 + k * 9), (206 - k * 4, 150 + k * 9)], 10, hx('#1a1422'), sk['lit'], side=-1, band=0.3)
    for k in range(3):
        finger(cv, [(176 - k * 4, 176 + k * 9), (162 - k * 4, 178 + k * 9), (158 - k * 4, 186 + k * 9)], 10, hx('#1a1422'), sk['lit'], side=-1, band=0.3)
    return cv


def panel_box():
    """Page 1, panel 3. From above, in a torch's circle: the tin box open in the hole in the floor, his six years in
    banded bundles, his passport, a bus ticket and the postcard of a beach; a gloved hand takes it all."""
    cv = Cv(348, 282, hx('#08060a'))
    circle = cv.blank()
    ImageDraw.Draw(circle).ellipse([14, 10, 340, 290], fill=255)
    # under the torch: the boards round the hole, lit; outside it, the dark
    for i in range(7):
        y = -20 + i * 46
        cv.fill([(0, y, 0), (348, y - 20, 0), (348, y + 24, 0), (0, y + 44, 0)], hx('#6a4430') if i % 2 else hx('#5e3c2a'),
                clip=circle, smooth=False)
        cv.brush([(0, y + 44), (348, y + 24)], 3, 3, col=hx('#24140c'), clip=circle)
    cv.fill([(0, -20, 0), (348, -20, 0), (348, 300, 0), (0, 300, 0)], hx('#1a0f0c'), cut=circle, smooth=False)
    hole = [(40, 60, 0), (300, 40, 0), (318, 236, 0), (52, 258, 0)]
    cv.fill(hole, INK, smooth=False)
    # the box, its lid thrown back
    box = [(70, 84, 0), (282, 70, 0), (292, 214, 0), (78, 230, 0)]
    cv.fill(box, hx('#5a646e'), smooth=False)
    cv.fill([(80, 92, 0), (274, 80, 0), (282, 206, 0), (86, 220, 0)], hx('#2a3038'), smooth=False)
    cv.ink(box, 3, smooth=False)
    lid = [(70, 84, 0), (282, 70, 0), (276, 50, 0), (66, 62, 0)]
    cv.fill(lid, hx('#8a949e'), smooth=False)
    cv.ink(lid, 3, smooth=False)
    # the bundles: green notes in a paper band
    for r in range(3):
        for c in range(4):
            if (r, c) in ((0, 3), (2, 1)):
                continue
            x, y = 90 + c * 46 - r * 1, 96 + r * 40 - c * 3
            note = [(x, y, 0), (x + 42, y - 3, 0), (x + 44, y + 34, 0), (x + 2, y + 37, 0)]
            cv.fill(note, hx('#5e8a5a'), smooth=False)
            cv.fill([(x, y, 0), (x + 42, y - 3, 0), (x + 42.5, y + 4, 0), (x + 0.5, y + 7, 0)], hx('#8ab07a'), smooth=False)
            cv.ellipse(x + 22, y + 17, 7, 7, hx('#3e6a44'))
            cv.fill([(x + 17, y - 1, 0), (x + 25, y - 2, 0), (x + 28, y + 35, 0), (x + 20, y + 36, 0)], hx('#d8c08a'), smooth=False)
            cv.ink(note, 2, smooth=False)
    # the postcard (a beach at sunset), the ticket, his passport
    dx, dy = -100, 22
    card = [(222 + dx, 88 + dy, 0), (284 + dx, 84 + dy, 0), (286 + dx, 126 + dy, 0), (224 + dx, 130 + dy, 0)]
    cv.fill(card, hx('#f0a050'), smooth=False)
    cv.fill([(222 + dx, 110 + dy, 0), (285 + dx, 106 + dy, 0), (286 + dx, 126 + dy, 0), (224 + dx, 130 + dy, 0)], hx('#2a7a9a'), smooth=False)
    cv.ellipse(266 + dx, 100 + dy, 7, 7, hx('#ffe080'), clip=card)
    cv.brush([(238 + dx, 120 + dy), (242 + dx, 98 + dy)], 2.5, 1.5, col=hx('#3a2a1a'))         # a palm tree
    cv.fill([(242 + dx, 98 + dy), (230 + dx, 94 + dy), (240 + dx, 96 + dy), (252 + dx, 92 + dy), (244 + dx, 98 + dy),
             (254 + dx, 104 + dy)], hx('#2a3a1a'))
    cv.ink(card, 2, smooth=False)
    cv.shape([(108, 176, 0), (150, 172, 0), (152, 186, 0), (110, 190, 0)], hx('#d8d0b4'), 2)
    cv.brush([(116, 180), (144, 177)], 2, 2, col=hx('#b8262c'))
    cv.shape([(186, 168, 0), (226, 165, 0), (229, 214, 0), (189, 217, 0)], hx('#24345a'), 2)
    cv.ellipse(208, 184, 8, 8, hx('#c8a040'))
    cv.brush([(196, 204), (220, 202)], 2, 2, col=hx('#c8a040'))
    # the glove coming in from the top right, a bundle in its fingers
    lit, glove_ = hx('#6a5a66'), hx('#1a1422')
    x, y = 222, 104
    cv.fill([(x + 4, y + 8, 0), (x + 54, y + 2, 0), (x + 58, y + 44, 0), (x + 8, y + 50, 0)], hx('#14100c'), smooth=False)   # its shadow
    cv.shape([(x, y, 0), (x + 50, y - 6, 0), (x + 54, y + 36, 0), (x + 4, y + 42, 0)], hx('#6e9a66'), 2)
    cv.fill([(x + 21, y - 3, 0), (x + 30, y - 4, 0), (x + 34, y + 38, 0), (x + 25, y + 39, 0)], hx('#d8c08a'), smooth=False)
    leather(cv, [(348, 0, 0), (276, 0, 0), (262, 46), (300, 64), (348, 40, 0)], lit, [[(276, 0, 0), (262, 46), (270, 48), (284, 0, 0)]])
    cv.shape([(250, 64), (282, 44), (306, 62), (300, 92), (268, 104), (244, 96)], glove_, 3)        # the back of the hand
    cv.brush([(256, 70), (282, 52)], 4, 2, col=lit)
    for k in range(4):
        finger(cv, [(256 + k * 13, 98 - k * 2), (250 + k * 13, 116 - k), (244 + k * 13, 124 - k)], 12, glove_, lit, side=-1, band=0.3)
    finger(cv, [(250, 76), (232, 92), (226, 110)], 13, glove_, lit, side=-1, band=0.3)                # the thumb
    return cv


def panel_count():
    """Page 1, panel 4. The young one, close, riffling a brick of notes under his nose with his thumb, grinning."""
    cv = Cv(348, 282, hx('#0e1a16'))
    cv.fill([(0, 0, 0), (348, 0, 0), (348, 110, 0), (0, 190, 0)], hx('#14261e'), smooth=False)
    pal = dict(skin=hx('#d8a070'), shade=hx('#6e3e2c'), stubble=hx('#a87656'), hair=hx('#140e0a'), shine=hx('#4a3a30'),
               glint=hx('#fff4d0'), lit=hx('#4a5a52'))
    body = [(40, 282), (80, 214), (150, 190), (250, 196), (320, 226), (348, 282)]
    leather(cv, body, hx('#3a4a44'), [[(80, 214), (150, 190), (160, 198), (90, 224)]])
    cv.fill([(150, 192), (186, 236), (214, 196)], hx('#d8d0c0'))             # his shirt, open at the neck
    head_young(cv, T(214, 14, 1.6, -1, 0.12), pal)
    # the brick of notes, its band, the top notes riffled up by his thumb
    green, greenD, greenL, band = hx('#6a9462'), hx('#3e6a44'), hx('#9ac08a'), hx('#d8c08a')
    stack = [(30, 214, 0), (130, 196, 0), (150, 232, 0), (52, 254, 0)]
    cv.shape(stack, green, 3)
    side = [(52, 254, 0), (150, 232, 0), (150, 248, 0), (54, 272, 0)]
    cv.shape(side, greenL, 3)
    for k in range(4):
        y = 238 + k * 4
        cv.brush([(54, y + 18 - k * 0.5), (150, y - 4)], 1, 1, col=greenD)
    cv.fill([(76, 206, 0), (94, 203, 0), (114, 244, 0), (98, 248, 0)], band, smooth=False)
    cv.fill([(98, 248, 0), (114, 244, 0), (114, 260, 0), (99, 264, 0)], band, smooth=False)
    for k in range(5):
        a = 0.2 + k * 0.1
        x0, y0 = 36 + k * 3, 214 - k * 2
        c, s_ = math.cos(-a), math.sin(-a)
        note = [(x0, y0, 0), (x0 + 104 * c, y0 + 104 * s_, 0), (x0 + 104 * c + 6, y0 + 104 * s_ - 26, 0), (x0 + 6, y0 - 26, 0)]
        cv.shape(note, greenL if k % 2 else green, 2)
        cv.ellipse(x0 + 60 * c + 3, y0 + 60 * s_ - 13, 6, 6, greenD)
    # his hands: the fingers under the brick, the thumb on the notes
    glove_ = hx('#1a1422')
    for k in range(3):
        finger(cv, [(20, 250 + k * 9), (44, 262 + k * 7), (70, 264 + k * 5)], 13, glove_, pal['lit'], side=-1, band=0.3)
    finger(cv, [(150, 260), (156, 236), (146, 214), (130, 204)], 14, glove_, pal['lit'], side=-1, band=0.3)
    leather(cv, [(0, 240), (22, 246), (28, 282), (0, 282)], pal['lit'])
    leather(cv, [(150, 282), (148, 256), (176, 250), (190, 282)], pal['lit'])
    return cv


def panel_super():
    """Page 2, panel 1. Over the shooter's shoulder: the building's super in the doorway, against the landing's
    light, hit; he sags against the jamb, a hand to his chest, his torch dropping, his face caught in another man's
    torch. The pistol still smokes (the game draws the smoke, and the blood, 'super_blood', spreading)."""
    cv = Cv(528, 288, hx('#0c0b16'))
    sodium, sodiumD, sodiumDD = hx('#f0b44c'), hx('#b8782a'), hx('#5a3416')
    cv.rect(0, 0, 528, 288, hx('#15152c'))
    cv.rect(0, 250, 528, 288, hx('#0e0e1c'))
    # the doorway and the landing, its lamp
    dx0, dx1 = 286, 476
    cv.rect(dx0, 0, dx1, 250, sodium)
    cv.rect(dx0, 190, dx1, 250, sodiumD)
    cv.rect(dx0, 184, dx1, 190, sodiumDD)
    cv.rect(dx0, 0, dx0 + 26, 250, sodiumD)                              # the landing's far wall, in shade
    cv.ellipse(452, 40, 9, 7, hx('#fff6d0'))
    cv.rect(dx0 - 12, 0, dx0, 288, hx('#08070e'))
    cv.rect(dx1, 0, dx1 + 14, 288, hx('#08070e'))
    cv.ink([(dx0, -10, 0), (dx1, -10, 0), (dx1, 250, 0), (dx0, 250, 0)], 6, smooth=False)
    cv.fill([(dx0, 250, 0), (dx1, 250, 0), (528, 288, 0), (250, 288, 0)], sodiumDD, smooth=False)
    # him: a cardigan over a shirt and tie, sagging against the jamb on the right
    cardigan, cardiganD = hx('#8a6a3a'), hx('#4a3418')
    body = [(344, 288, 0), (348, 196), (352, 170, 0), (382, 152), (400, 148, 0), (424, 150), (452, 162, 0), (462, 196),
            (466, 288, 0)]
    m = cv.fill(body, cardigan)
    cv.fill([(430, 150), (452, 162, 0), (462, 196), (466, 288, 0), (436, 288, 0), (440, 200)], cardiganD, clip=body)
    shirt = [(382, 152), (400, 148, 0), (424, 150), (412, 196), (404, 222, 0), (394, 196)]
    cv.fill(shirt, hx('#d8d0c0'), clip=body)                                                           # his shirt
    cv.fill([(398, 156), (408, 156), (410, 212), (404, 220), (398, 212)], hx('#5a2a2a'), clip=shirt)    # the tie
    cv.ink(shirt, 2)
    cv.ink(body, 4)
    backlit(cv, m, sodium, ((-3, 0),))
    for y in (232, 254, 276):
        cv.ellipse(405 - (y - 232) * 0.05, y, 3, 3, hx('#3a2a14'))                                        # buttons
    cv.brush([(404, 222), (406, 288)], 2, 2, col=cardiganD)
    # the hand on his chest, the other arm dropping its torch
    finger(cv, [(356, 176), (346, 214), (360, 236)], 26, cardigan, cardiganD)
    finger(cv, [(360, 236), (376, 214), (388, 196)], 24, cardigan, cardiganD)
    hand = [(378, 196), (396, 182), (414, 186), (414, 198), (398, 210), (382, 210)]
    cv.shape(hand, hx('#d8b098'), 3)
    for k in range(3):
        cv.brush([(392 + k * 6, 190 - k), (404 + k * 4, 202 - k * 2)], 1.5, 1)
    finger(cv, [(452, 170), (466, 214), (468, 246)], 24, cardiganD, INK)
    cv.shape([(458, 244), (476, 242), (478, 258), (460, 260)], hx('#d8b098'), 3)
    cv.shape([(440, 262), (470, 256), (474, 270), (444, 276)], hx('#3a3a44'), 3)
    cv.ellipse(441, 270, 5, 5, hx('#fff4c0'))
    # his head, three quarters toward the gun, in the torch's cold light
    pal = dict(skin=hx('#e8c8b0'), shade=hx('#7a5a58'), hair=hx('#c8c4bc'), hairD=hx('#7a7670'), white=hx('#e0dcd8'),
               iris=hx('#4a5a6a'))
    head_old(cv, T(414, 26, 1.18, -1, -0.1), pal)
    cv.shape([(382, 160, 0), (404, 150, 0), (404, 176, 0)], hx('#d8d0c0'), 3)                       # his collar
    cv.shape([(428, 160, 0), (406, 150, 0), (404, 176, 0)], hx('#c8c0b0'), 3)
    # the shooter, close, from behind his shoulder: the back of his combed head, the arm out, the pistol
    m = cv.fill([(0, 288), (0, 190), (40, 160), (100, 152), (150, 164), (176, 200), (190, 288)], INK)
    backlit(cv, m, hx('#3a3050'), ((3, -1),))
    m = cv.fill([(130, 176), (232, 148), (246, 162), (150, 212)], INK)
    backlit(cv, m, hx('#5a4a6a'), ((0, -3),))
    gun = [(222, 138, 0), (296, 130, 0), (298, 144, 0), (252, 148, 0), (250, 168, 0), (232, 170, 0), (234, 150, 0), (222, 150, 0)]
    m = cv.fill(gun, INK, smooth=False)
    backlit(cv, m, sodiumD, ((3, 0), (0, -2)))
    cv.brush([(232, 132), (292, 128)], 2, 1, col=hx('#6a6a7a'))
    fist = [(206, 150), (224, 140), (246, 144), (252, 160), (244, 176), (222, 178), (208, 166)]
    m = cv.fill(fist, hx('#16121c'))
    backlit(cv, m, hx('#5a4a6a'), ((0, -2), (2, 0)))
    for k in range(3):
        cv.brush([(226 + k * 7, 150 + k), (230 + k * 6, 172 - k)], 1.5, 1, col=hx('#3a3048'))       # his knuckles
    cv.brush([(246, 146), (262, 150), (266, 158)], 4, 3, col=hx('#16121c'))                          # the finger on the trigger
    m = cv.fill([(66, 104), (96, 94), (124, 100), (138, 122), (140, 150), (132, 170), (104, 180), (78, 174), (60, 146)], hx('#0c0808'))
    for a_, m_, b_ in (((70, 112), (98, 100), (128, 110)), ((66, 128), (100, 116), (134, 128)), ((64, 144), (100, 134), (136, 146))):
        cv.brush([a_, m_, b_], 0.5, 0.5, mid=2.2, col=hx('#5a4a6a'), clip=m)                         # the comb's tracks
    backlit(cv, m, hx('#6a5a7a'), ((3, 0), (0, -2)))
    cv.shape([(136, 136), (146, 132), (148, 150), (138, 158)], hx('#3a2422'), 3)                          # his ear
    cv.brush([(140, 140), (143, 150)], 1.5, 1, col=hx('#1a1012'))
    m = cv.fill([(58, 176), (104, 186), (150, 170), (160, 196), (100, 210), (48, 196)], INK)              # the collar up
    backlit(cv, m, hx('#3a3050'), ((2, -2),))
    return cv


def panel_super_blood():
    """Page 2, panel 1's blood, on its own (transparent round it): the game lets it spread from under his hand and
    run down his shirt."""
    cv = Cv(528, 288)
    out = Image.new('RGBA', (528, 288), (0, 0, 0, 0))
    stain = cv.mask([(388, 208), (404, 205), (418, 210), (420, 230), (412, 252), (416, 272), (410, 288, 0), (394, 288, 0),
                     (398, 262), (390, 242), (386, 224)])
    d = ImageDraw.Draw(stain)
    d.line([(392, 236), (386, 270)], fill=255, width=4)
    d.line([(416, 226), (424, 258)], fill=255, width=3)
    stain = ImageChops.subtract(stain, cv.mask([(378, 196), (396, 182), (414, 186), (414, 198), (398, 210), (382, 210)]))
    d = ImageDraw.Draw(stain)
    for a_, b_ in (((392, 196), (398, 206)), ((402, 194), (406, 204))):
        d.line([a_, b_], fill=255, width=3)                 # between his fingers
    out.paste((140, 12, 22, 255), (0, 0), stain)
    out.paste((82, 6, 14, 255), (0, 0), ImageChops.multiply(stain, cv.mask([(406, 196), (440, 196), (440, 288, 0), (404, 288, 0)])))
    cv.im = out
    return cv


def panel_pour():
    """Page 2, panel 2. His living room in the neon from the window: the heavy tips a jerrycan over the sofa, the
    petrol coming out in a rope and soaking it dark. He says what the boss says (a balloon by the game)."""
    cv = Cv(528, 288, hx('#110e22'))
    pink, pinkD, blue = hx('#ff3a7a'), hx('#8a1e50'), hx('#2a5a9a')
    cv.rect(0, 218, 528, 288, hx('#0c0a18'))
    cv.brush([(0, 218), (528, 218)], 4, 4)
    # the window behind, the bar's neon across the street, its light on the floor
    cv.rect(30, 20, 220, 170, hx('#1c1238'))
    cv.rect(48, 98, 150, 110, pink)
    cv.rect(130, 132, 204, 138, blue)
    cv.ink([(30, 20, 0), (220, 20, 0), (220, 170, 0), (30, 170, 0)], 6, smooth=False)
    cv.brush([(125, 20), (125, 170)], 5, 5)
    cv.brush([(30, 92), (220, 92)], 5, 5)
    cv.fill([(30, 218, 0), (220, 218, 0), (290, 288, 0), (0, 288, 0)], hx('#2a1430'), smooth=False)
    # the sofa, three quarters: its back, the seat's cushions, the arm; soaked dark where the petrol goes
    velvet, velvetD, velvetL = hx('#5a2a4a'), hx('#3a1830'), hx('#8a4a70')
    back = [(14, 168), (250, 160), (256, 214), (16, 222)]
    cv.shape(back, velvet, 4)
    cv.fill([(14, 168), (250, 160), (251, 168), (15, 176)], velvetL, clip=back)
    for x in (92, 172):
        cv.brush([(x, 166), (x + 1, 214)], 2, 2, col=velvetD)
    seat = [(24, 214), (262, 206), (270, 240), (20, 252)]
    cv.shape(seat, velvetL, 4)
    cv.fill([(20, 240), (270, 230), (270, 240), (20, 252)], velvet, clip=seat)
    for x in (104, 186):
        cv.brush([(x, 212), (x + 4, 246)], 2, 2, col=velvetD)
    cv.shape([(18, 252, 0), (272, 240, 0), (272, 264, 0), (20, 276, 0)], velvetD, 4)
    cv.shape([(0, 186), (26, 180), (34, 196), (32, 270), (0, 274)], velvet, 4)                    # the arm
    cv.fill([(0, 186), (26, 180), (28, 188), (0, 194)], velvetL)
    wet = [(84, 192), (120, 184), (150, 192), (176, 188), (200, 204), (190, 226), (204, 242), (150, 248), (120, 238),
           (86, 244), (96, 220), (74, 206)]
    cv.fill(wet, hx('#2e1428'))
    for a_, b_ in (((96, 204), (140, 198)), ((130, 232), (176, 228)), ((160, 210), (186, 210))):
        cv.brush([a_, b_], 2.5, 1, col=pinkD)
    # him, three quarters to the left, the jerrycan up in both gloved hands
    body = [(300, 288), (296, 230), (306, 186), (340, 160), (400, 150), (470, 164), (510, 220), (528, 288)]
    leather(cv, body, pinkD, [[(296, 230), (306, 186), (316, 188), (306, 232)], [(306, 186), (340, 160), (346, 166), (314, 190)]])
    pal = dict(skin=hx('#d898a0'), shade=hx('#4e2a48'), lit=pinkD)
    head_heavy(cv, T(374, 16, 1.3, -1, 0.04), pal, 'flat')
    cv.brush([(336, 170), (356, 180), (386, 182), (414, 172)], 3.5, 3.5, col=hx('#e8c050'))       # his gold chain
    cv.brush([(340, 172), (358, 180)], 1, 1, col=hx('#fff0a0'))
    # the arms forward to the can
    glove_ = hx('#1a1422')
    for arm in ([(344, 172), (300, 178), (262, 158), (248, 178), (286, 212), (344, 214)],
                [(476, 186), (370, 210), (272, 196), (256, 226), (370, 248), (486, 240)]):
        backlit(cv, cv.fill(arm, INK), pinkD, ((-3, 0), (0, -3)))
    can = [(170, 104, 0), (262, 132, 0), (246, 210, 0), (152, 182, 0)]
    cv.shape(can, hx('#b02a1c'), 4)
    cv.fill([(170, 104, 0), (262, 132, 0), (259, 144, 0), (167, 116, 0)], hx('#e04a3a'), clip=can, smooth=False)
    cv.fill([(152, 182, 0), (246, 210, 0), (248, 198, 0), (154, 170, 0)], hx('#6a140c'), clip=can, smooth=False)
    cv.brush([(166, 140), (246, 166)], 3, 3, col=hx('#6a140c'))                                   # the pressed cross
    cv.brush([(212, 120), (198, 194)], 3, 3, col=hx('#6a140c'))
    cv.shape([(186, 96, 0), (250, 116, 0), (246, 126, 0), (184, 106, 0)], hx('#8a1a10'), 3)       # the handles
    cv.shape([(166, 118), (144, 120), (140, 132), (162, 134)], hx('#3a3a44'), 3)                 # the spout
    for pts in ([(270, 176), (258, 160), (250, 146)], [(274, 186), (262, 172), (254, 160)]):
        finger(cv, pts, 13, glove_, pinkD, side=-1)
    for pts in ([(270, 214), (252, 206), (240, 198)], [(272, 224), (254, 218), (242, 212)]):
        finger(cv, pts, 13, glove_, pinkD, side=-1)
    # the petrol: a twisting rope from the spout down to the sofa, its splash
    for k in range(10):
        y = 128 + k * 7
        x = 140 - k * 2.2 + math.sin(k * 1.3) * 2
        cv.brush([(x, y), (x - 2, y + 7)], 5, 4, col=hx('#d8a85a'))
        cv.brush([(x + 1, y + 1), (x - 1, y + 6)], 1.5, 1, col=hx('#fff0c0'))
    for a in range(7):
        ang = math.pi * (0.1 + a * 0.13)
        cv.brush([(118, 196), (118 + math.cos(ang) * 26, 196 - math.sin(ang) * 16)], 3, 1, col=hx('#e8c070'))
    return cv


def panel_match(lit):
    """Page 2, panel 3. Close: the one with the slicked hair strikes a match; it lights his face from below. Behind,
    lost in the dark but for what the flame catches: the door of the back room where he sleeps, the petrol run across
    the floor to it. lit False: before the match is struck, a shape in the dark."""
    cv = Cv(1080, 282, hx('#07050a'))
    if lit:
        pal = dict(skin=hx('#f2a45a'), shade=hx('#8e4020'), hair=hx('#0c0808'), shine=hx('#8a4420'), glint=hx('#ffd890'),
                   white=hx('#c87a40'))
        glow, glare, wood, woodL = hx('#5a1e0c'), hx('#d0702a'), hx('#2a1008'), hx('#6a2c12')
    else:
        pal = dict(skin=hx('#16131f'), shade=hx('#100d18'), deep=hx('#0c0a12'), hair=hx('#0a080e'), shine=hx('#1c1a2c'),
                   glint=hx('#2a2a44'), white=hx('#16131f'))
        glow, glare, wood, woodL = hx('#100e1a'), hx('#1e1c30'), hx('#0c0a14'), hx('#14121e')
    # the back room's door, shut; the dark under it; the petrol run across the boards to it, the flame in it
    cv.rect(150, 18, 300, 252, wood)
    for y0, y1 in ((40, 120), (140, 232)):
        cv.ink([(172, y0, 0), (278, y0, 0), (278, y1, 0), (172, y1, 0)], 3, col=woodL, smooth=False)
    cv.rect(286, 128, 294, 140, woodL)                                     # the knob
    cv.ink([(144, 12, 0), (306, 12, 0), (306, 252, 0), (144, 252, 0)], 8, col=hx('#120806') if lit else INK, smooth=False)
    cv.rect(300, 18, 306, 252, woodL)
    cv.rect(0, 252, 1080, 256, hx('#120806') if lit else INK)
    cv.rect(150, 248, 300, 252, INK)
    if lit:
        trail = [(560, 282), (470, 270), (380, 262), (300, 256), (230, 254)]
        cv.brush(trail, 26, 8, col=hx('#1e0c06'))
        for a_, b_ in (((520, 276), (470, 271)), ((410, 266), (380, 263)), ((330, 258), (300, 257)), ((262, 255), (246, 255))):
            cv.brush([a_, b_], 3, 1, col=glare)
    # the sofa he soaked, a black bulk with the light along its arm
    sofa = [(330, 282), (336, 180), (352, 168), (372, 176), (376, 210), (440, 206), (446, 282)]
    cv.fill(sofa, INK)
    cv.brush([(338, 182), (352, 170), (370, 178)], 3, 1, col=glow)
    cv.brush([(378, 212), (438, 208)], 2, 1, col=glow)
    # his collar and shoulder: black leather, its edges caught by the flame
    leather(cv, [(600, 282), (626, 240), (680, 222), (740, 216), (840, 230), (920, 282)], glow,
            [[(600, 282), (626, 240), (646, 236), (626, 282)]])
    leather(cv, [(660, 282), (676, 236), (712, 226), (716, 282)], glow, [[(660, 282), (676, 236), (684, 236), (668, 282)]])
    head_slick(cv, T(712, 14, 2.3, -1), pal, 'under' if lit else 'none')
    fx, fy = FLAME
    hand, handD = (hx('#e89a58'), hx('#8a3a1c')) if lit else (hx('#16131f'), hx('#100d18'))
    # the left hand, low: the box in its fingers, the thumb over it
    box = [(456, 228), (536, 218), (540, 240), (460, 252)]
    cv.shape(box, hx('#c89a3a') if lit else hx('#1a1620'), 3)
    cv.fill([(460, 246), (540, 234), (540, 240), (460, 252)], hx('#5a2410') if lit else hx('#120e18'))
    if lit:
        cv.brush([(474, 232), (506, 228)], 4, 4, col=hx('#8a2a18'))          # the label, the striking strip
        cv.brush([(462, 249), (538, 237)], 2, 2, col=hx('#3a1408'))
    leather(cv, [(410, 282), (420, 262), (446, 254), (456, 282)], glow)          # his cuff
    palm = [(440, 282), (444, 258), (466, 248), (512, 248), (524, 262), (500, 282)]
    cv.shape(palm, hand, 3)
    cv.fill([(440, 282), (446, 268), (500, 270), (524, 262), (500, 282)], handD, clip=palm)
    for k in range(3):
        finger(cv, [(486 + k * 4, 254 + k * 9), (522 + k * 2, 250 + k * 7), (534, 244 + k * 6)], 11, hand, handD)
    finger(cv, [(478, 246), (500, 232), (520, 226)], 12, hand, handD)      # the thumb, over the box
    # the right hand, raised by his chin: the match pinched between thumb and finger, the flame up by his nose
    leather(cv, [(626, 282), (618, 252), (640, 240), (668, 252), (676, 282)], glow)   # his cuff
    back = [(630, 256), (600, 236), (588, 214), (598, 202), (620, 206), (642, 226), (650, 246)]
    cv.shape(back, hand, 3)
    cv.fill([(630, 256), (612, 246), (640, 236), (650, 246)], handD, clip=back)
    for k in range(3):
        finger(cv, [(612 - k * 2, 220 + k * 10), (596 - k * 3, 224 + k * 10), (594 - k * 2, 232 + k * 9)], 11, hand, handD)
    finger(cv, [(598, 208), (580, 198), (568, 200)], 11, hand, handD)      # the index
    finger(cv, [(612, 236), (588, 218), (572, 206)], 12, hand, handD)      # the thumb
    cv.brush([(568, 202), (fx, fy)], 4, 3, col=hx('#e8d0a0') if lit else hx('#1e1a26'))
    cv.ellipse(fx, fy, 5, 6, hx('#3a0c08') if lit else hx('#160e14'))
    return cv


# ================================================================ the leap's card and level 1's ending
# The hero: a dark flat cap, brown hair down to his collar, a Mediterranean tan, three days' beard, a long charcoal
# coat with its collar up, a grey knit scarf, the strap of his satchel across his chest (generate_assets.py CHARS
# 'player'). Seen as a silhouette or in profile, his eyes in the shadow of his cap's peak.
def bead(i):
    """A number in [0, 1) for the i-th thing scattered somewhere: the same every run (no randomness in this tool)."""
    s = math.sin(i * 127.1 + 311.7) * 43758.5453
    return s - math.floor(s)


def head_hero_side(cv, t, pal):
    """Him in profile, facing right (f -1: left), lit from in front of his face (a street lamp through a windscreen):
    the cap's peak throws its shadow over his eyes, the light takes the nose, the mouth, the beard along the jaw; the
    back of his head, his hair down to the collar and his ear stay in the dark. Origin on the crown, 100 to the chin."""
    sk, sh, dp, hair, hairL = pal['skin'], pal['shade'], pal.get('deep', INK), pal['hair'], pal['hairL']
    cap, capL, coat = pal['cap'], pal['capL'], pal['coat']
    # the coat's collar, turned up behind his neck, its petrol lining
    back = t([(-70, 140, 0), (-66, 104), (-56, 82), (-48, 66, 0), (-36, 72), (-26, 92), (-10, 110), (10, 118), (10, 140, 0)])
    cv.fill(back, coat)
    cv.fill(t([(-48, 66, 0), (-36, 72), (-30, 84), (-44, 82), (-52, 76)]), pal['lining'], clip=back)
    cv.ink(back, t.ink())
    # his hair, down to the collar from under the cap
    locks = t([(-6, 30), (-24, 28), (-40, 32), (-46, 50), (-46, 70), (-40, 88), (-30, 96), (-24, 84), (-18, 70), (-12, 58),
               (-8, 46)])
    cv.shape(locks, hair, t.ink())
    for a_, b_, c_ in (((-36, 40), (-42, 60), (-38, 82)), ((-26, 44), (-32, 64), (-30, 86)), ((-18, 48), (-22, 62), (-22, 76))):
        cv.brush(t([a_, b_, c_]), 0.5, 0.5, mid=2.2, col=hairL)
    neck = t([(-18, 70), (-22, 124), (26, 124), (22, 100), (8, 98)])
    cv.shape(neck, sh, t.ink())
    head = t([(26, 7), (33, 18), (36, 30), (37, 38, 0), (35, 43), (38, 50), (43, 59), (46, 64, 0), (43, 67), (38, 68, 0),
              (39.5, 72), (38, 75, 0), (39.5, 78.5), (36, 82, 0), (38, 89), (35, 97), (26, 102), (10, 99), (-2, 92),
              (-8, 84, 0), (-14, 76), (-24, 68), (-34, 54), (-38, 38), (-36, 20), (-28, 7), (-14, 0), (2, -2), (16, 1)])
    cv.fill(head, sh)
    lit = cv.fill(t([(80, -10, 0), (14, 4), (12, 26), (18, 42), (10, 56), (6, 72), (10, 88), (16, 104), (80, 120, 0)]), sk, clip=head)
    # three days' beard: the jaw, the chin and the lip, in the light and in the shade
    beard = t([(-6, 70), (8, 66), (22, 68), (33, 70), (41, 71), (40, 80), (40, 92), (35, 99), (26, 103), (10, 100), (-2, 92),
               (-10, 80)])
    cv.fill(beard, pal['stubble'], clip=lit)
    cv.fill(beard, pal['stubbleD'], clip=head, cut=lit)
    # the cap's shadow over the brow and the eye
    cv.fill(t([(80, -10, 0), (80, 44, 0), (48, 42), (36, 47), (24, 50), (12, 50), (0, 46), (-60, 40, 0), (-60, -10, 0)]), sh, clip=head)
    cv.ink(head, t.ink())
    # the ear, in the dark, half under his hair
    ear = t([(-6, 48), (-12, 43), (-19, 49), (-18, 61), (-12, 68), (-6, 64)])
    cv.shape(ear, sh, 3)
    cv.brush(t([(-10, 50), (-15, 54), (-13, 61)]), 2.5, 1)
    cv.fill(t([(-8, 38), (-22, 38), (-24, 50), (-14, 48), (-8, 52)]), hair)
    cv.brush(t([(-4, 44), (-2, 58), (-4, 66)]), 3, 1, col=hair)                  # the sideburn
    # the eye in the shadow of the peak: the white's corner, the iris, a glint
    eye = t([(27, 46), (32, 44.5, 0), (33, 48.5, 0), (28, 49.5)])
    cv.fill(eye, pal['white'])
    cv.fill(t([(29.5, 45), (32, 44.6, 0), (33, 48.5, 0), (29.8, 49)]), dp, clip=eye)
    cv.ellipse(*t.pt(31.4, 46.6), t.len(0.8), t.len(0.8), pal['glint'])
    cv.brush(t([(24, 45.5), (28, 43.8), (34, 44.4)]), 3, 1.5)                 # the upper lid
    cv.brush(t([(20, 40.5), (28, 38.4), (37, 39.5)]), 2, 2.5, mid=5)          # the brow, low and level
    # the nose, straight, the light down its ridge; the set mouth; the fold; under the lip
    cv.brush(t([(38, 51), (43, 59), (45.5, 63.5)]), 1, 0.5, mid=2, col=pal['shine'])
    cv.brush(t([(35, 61), (35, 65), (38, 67.5)]), 2.5, 1)
    cv.brush(t([(30, 75.4), (35, 75.2), (39, 75.4)]), 1.5, 2.6)
    cv.brush(t([(31, 64), (28, 70), (30, 76)]), 2, 0.5, col=sh)
    cv.brush(t([(31, 83), (35, 83.4)]), 2, 0.5)
    # the cap: a dark flat cap, its peak low over his eyes, the light along its front
    top = t([(-44, 34), (-44, 18), (-34, 2), (-14, -8), (12, -8), (32, 0), (42, 14), (46, 24, 0), (58, 30), (60, 34, 0), (44, 36),
             (32, 33), (10, 32), (-20, 32)])
    m = cv.shape(top, cap, t.ink())
    cv.fill(t([(32, 0), (42, 14), (46, 24, 0), (58, 30), (60, 34, 0), (50, 34), (40, 22), (30, 8)]), capL, clip=m)
    cv.brush(t([(-36, 20), (-10, 10), (20, 10), (40, 22)]), 0.5, 0.5, mid=2, col=hx('#0c0c12'), clip=m)   # its seam
    cv.ellipse(*t.pt(-2, -6), t.len(2.2), t.len(1.4), pal['lining'])                                       # its button
    # the scarf wound round his neck, grey knit, bunched under his chin, the light on its front
    scarf = t([(-26, 98), (-12, 104), (8, 108), (24, 104), (36, 108), (42, 116), (38, 126), (20, 130), (0, 128), (-24, 120)])
    m = cv.shape(scarf, pal['knit'], t.ink())
    cv.fill(t([(26, 102), (36, 108), (42, 116), (38, 126), (26, 128), (30, 114)]), pal['knitL'], clip=m)
    cv.brush(t([(-20, 110), (0, 116), (20, 116), (36, 112)]), 1, 0.5, mid=2.5, col=pal['knitD'], clip=m)
    for k in range(4):
        x = -16 + k * 12
        cv.brush(t([(x, 104 + k), (x + 2, 116 + k * 0.5)]), 0.5, 0.5, mid=1.4, col=pal['knitD'], clip=m)
    # the coat's front, its collar turned up against the scarf
    front = t([(10, 140, 0), (14, 122), (30, 124), (50, 118), (62, 132), (60, 140, 0)])
    cv.shape(front, coat, t.ink())
    cv.brush(t([(30, 124), (50, 118), (60, 130)]), 1, 0.5, mid=3, col=pal['coatL'])


def head_boss(cv, t, pal):
    """The boss, three quarters, dead: a heavy face gone slack, jowls, a big nose, thick grey brows, his grey hair
    combed straight back, the eyes shut, the mouth fallen a little open. Lit from the crown's side (the desk lamp)."""
    sk, sh, dp, hair, hairD = pal['skin'], pal['shade'], pal.get('deep', INK), pal['hair'], pal['hairD']
    head = t([(-2, 6), (16, 6), (28, 14), (34, 26), (36, 35, 0), (33, 40), (37, 48), (45, 62, 0), (42, 68), (36, 69, 0),
              (37, 74), (35, 78, 0), (37, 84), (33, 90, 0), (34, 98), (24, 108), (6, 110), (-8, 102), (-16, 90, 0),
              (-20, 74), (-30, 62), (-35, 44), (-33, 24), (-20, 10)])
    cv.fill(head, sk)
    cv.fill(t([(-60, 40, 0), (-4, 40), (-2, 56), (4, 70), (6, 88), (0, 104), (-4, 130), (-60, 130, 0)]), sh, clip=head)   # the far side
    cv.fill(t([(4, 62), (12, 68), (16, 88), (10, 98), (2, 84)]), sh, clip=head)                                     # the jowl
    cv.fill(t([(26, 46), (32, 58), (38, 68), (44, 68), (38, 62), (33, 48)]), sh, clip=head)                         # the nose's shade
    # grey hair combed straight back, its comb tracks
    hm = cv.fill(t([(-60, -20, 0), (60, -20, 0), (60, 8, 0), (30, 12), (14, 16), (2, 22), (-6, 34), (-8, 48, 0), (-18, 52),
                    (-60, 70, 0)]), hair, clip=head)
    for a_, b_ in (((26, 10), (-26, 14)), ((14, 16), (-30, 28)), ((2, 24), (-32, 42))):
        cv.brush(t([a_, ((a_[0] + b_[0]) / 2, (a_[1] + b_[1]) / 2 - 4), b_]), 0.5, 0.5, mid=2, col=hairD, clip=hm)
    cv.ink(head, t.ink())
    ear = t([(-8, 50), (-16, 44), (-23, 52), (-22, 66), (-14, 74), (-8, 68)])
    cv.shape(ear, sh, 3)
    cv.brush(t([(-12, 52), (-18, 57), (-16, 66)]), 2.5, 1)
    # the eyes shut, heavy grey brows, the bags under them
    eye34(cv, t, 15, 49, 15, pal, open_=0)
    cv.brush(t([(28, 49), (32, 50), (35, 48.5)]), 1.5, 1)
    cv.brush(t([(3, 42), (10, 37), (20, 36), (28, 40)]), 2.5, 2, mid=5.5, col=hair)
    cv.brush(t([(4, 42.6), (10, 37.8), (20, 36.8), (28, 40.6)]), 0.5, 0.5, mid=1.4)
    cv.brush(t([(29, 40), (33, 37.5), (36, 39)]), 3.5, 1.5, col=hair)
    cv.brush(t([(7, 56), (15, 59), (23, 56)]), 0.5, 0.5, mid=1.8, col=sh)
    # the big nose, the folds, the mouth fallen open
    cv.brush(t([(33, 62), (37, 69), (43, 69)]), 2.5, 1.5)
    cv.fill(t([(39, 67.5), (42.5, 67), (42, 69.4)]), dp)
    cv.brush(t([(30, 65), (22, 76), (18, 90)]), 3, 1)
    cv.brush(t([(12, 86), (16, 98), (22, 104)]), 1.5, 0.5)
    mouth = t([(22, 80), (29, 79), (35, 80), (33, 85), (27, 86), (23, 84)])
    cv.fill(mouth, dp)
    cv.ink(mouth, 2)
    cv.brush(t([(25, 89), (29, 90), (33, 88)]), 1, 0.5, col=sh)


def figure_sat(cv, x, y, s=1.0, f=1):
    """Him sat against a wall, slumped: one leg out along the ground, the other knee up with his forearm over it and
    the hand hanging, his head bowed onto his chest under his cap, as one mask (local px, his seat at the origin,
    facing +x, up is -y; f -1 mirrors him)."""
    P = lambda p: (x + p[0] * s * f, y + p[1] * s) + ((0,) if len(p) > 2 else ())
    m = cv.blank()
    d = ImageDraw.Draw(m)
    for pts in ([(-14, 2, 0), (-18, -30), (-14, -58), (-2, -70), (14, -72), (24, -60), (22, -30), (16, -6), (20, 2, 0)],   # back, coat
                [(-2, -70), (2, -82), (14, -86), (28, -82), (34, -72), (30, -62), (20, -58), (8, -60)],   # his head on his chest
                [(-4, -78), (2, -92), (16, -96), (30, -92), (40, -78), (46, -70, 0), (36, -72), (24, -78), (8, -76)],  # the cap
                [(-20, 4, 0), (-24, -8), (-30, -6, 0), (-32, 4, 0)]):                                      # the coat's tail
        d.polygon(spline([P(p) for p in pts]), fill=255)
    limb(m, [P((4, -6)), P((60, -4)), P((116, -4))], 17 * s, 13 * s)                 # the leg out along the ground
    d.polygon(spline([P(p) for p in [(110, -14), (122, -22), (128, -14), (126, 2, 0), (106, 2, 0)]]), fill=255)   # its boot
    limb(m, [P((8, -10)), P((40, -42)), P((44, -44))], 18 * s, 15 * s)               # the thigh up to the knee
    limb(m, [P((44, -44)), P((52, -20)), P((58, 0))], 14 * s, 12 * s)                # the shin down
    d.polygon(spline([P(p) for p in [(50, -6), (68, -6), (74, 2, 0), (48, 2, 0)]]), fill=255)   # its boot
    limb(m, [P((14, -62)), P((30, -44)), P((48, -46))], 12 * s, 10 * s)              # the arm onto the knee
    limb(m, [P((48, -46)), P((60, -36)), P((64, -24))], 9 * s, 7 * s)                # the forearm, the hand hanging
    d.polygon(spline([P(p) for p in [(-36, 2, 0), (-36, -18), (-26, -24, 0), (-18, -16), (-18, 2, 0)]]), fill=255)   # the satchel
    return m


def rain_beads(cv, x0, y0, x1, y1, n, cols, seed=0, clip=None):
    """Drops of rain standing on a pane: n small drops, each dark with a lit fleck."""
    dark, lit = cols
    for i in range(n):
        x, y = x0 + bead(seed + i) * (x1 - x0), y0 + bead(seed + i + 500) * (y1 - y0)
        r = 1.5 + bead(seed + i + 900) * 2.5
        cv.ellipse(x, y, r, r * 1.2, dark, clip=clip)
        cv.ellipse(x - r * 0.3, y - r * 0.4, max(1, r * 0.4), max(1, r * 0.4), lit, clip=clip)


ALLEY_END = (596, 690, 112, 238)   # the alley's far end, where the street is (panel px): the game flickers its neon
ALLEY_PUDDLES = ((540, 360, 90, 12), (250, 392, 120, 10), (820, 390, 70, 8))   # (cx, cy, rx, ry): the game rings them


def panel_alley():
    """The leap's card ("THE NEXT DAY."): the alley in the rain at night, seen down its length from the dark; the
    street at its far end, its neon pink on the wet ground; him sat against the wall where he came down, his head on
    his chest under his cap, a bottle by his hand, nothing of him but his shape and the neon's edge on it. The game
    draws the rain falling, the rings on the puddles and the sign's flicker over it."""
    cv = Cv(1008, 408, hx('#0b0a14'))
    vx, vy = 640, 172
    o0, o1, oy0, oy1 = ALLEY_END
    pink, pinkD, pinkDD, cyan = hx('#ff3a7a'), hx('#a02458'), hx('#3e1430'), hx('#3ad8e8')
    iron = hx('#0a0910')
    left = [(0, -2, 0), (o0, oy0, 0), (o0, oy1, 0), (0, 410, 0)]
    right = [(1010, -2, 0), (o1, oy0, 0), (o1, oy1, 0), (1010, 410, 0)]
    cv.rect(0, 0, 1008, 408, hx('#0c0c18'))
    cv.fill(left, hx('#15131f'), smooth=False)
    cv.fill(right, hx('#191623'), smooth=False)
    cv.fill([(0, 410, 0), (o0, oy1, 0), (o1, oy1, 0), (1010, 410, 0)], hx('#0e0d17'), smooth=False)
    # the street beyond: the shop across it, its neon, the light it throws
    cv.rect(o0, oy0, o1, oy1, hx('#2a1430'))
    cv.rect(o0, oy0 + 74, o1, oy1, hx('#4a1c3e'))
    cv.rect(o0 + 8, oy0 + 22, o0 + 70, oy0 + 32, pink)
    cv.rect(o0 + 54, oy0 + 40, o0 + 82, oy0 + 46, cyan)
    cv.rect(o0, oy0 + 70, o1, oy0 + 74, hx('#1a0c1c'))
    # the neon grazing the walls near the far end, and the wet ground under it
    cv.fill([(o0 - 120, oy0 - 22, 0), (o0, oy0, 0), (o0, oy1, 0), (o0 - 120, oy1 + 30, 0)], hx('#221628'), clip=left, smooth=False)
    cv.fill([(o1 + 120, oy0 - 22, 0), (o1, oy0, 0), (o1, oy1, 0), (o1 + 120, oy1 + 30, 0)], hx('#2a1830'), clip=right, smooth=False)
    cv.fill([(o0, oy1, 0), (o1, oy1, 0), (860, 410, 0), (440, 410, 0)], hx('#1a1222'), smooth=False)
    # a few courses of brick where the light finds them, a drainpipe
    for k, y0 in enumerate((40, 96, 150, 206, 262, 318)):
        for x0, x1 in ((0, 150), (240, 420), (480, 590)):
            ya, yb = y0 + (vy - y0) * x0 / vx, y0 + (vy - y0) * x1 / vx
            cv.brush([(x0, ya), (x1, yb)], 2 - k * 0.15, 1, col=hx('#0e0c16'))
        for x0, x1 in ((1008, 900), (800, 700)):
            ya, yb = y0 + (vy - y0) * (1008 - x0) / (1008 - vx), y0 + (vy - y0) * (1008 - x1) / (1008 - vx)
            cv.brush([(x0, ya), (x1, yb)], 2, 1, col=hx('#100e18'))
    cv.rect(150, 20, 162, 362, hx('#0c0b12'))
    cv.brush([(161, 22), (161, 360)], 2, 2, col=pinkDD)
    for y in (90, 210, 320):
        cv.rect(146, y, 166, y + 6, hx('#0c0b12'))
    # the fire escape over the right wall: a landing, its rails, the ladder down
    cv.fill([(760, 66, 0), (900, 40, 0), (900, 56, 0), (760, 80, 0)], iron, smooth=False)
    for k in range(6):
        x = 770 + k * 24
        cv.brush([(x, 70 - (x - 760) * 0.18), (x, 22 - (x - 760) * 0.18)], 3, 3, col=iron)
    cv.brush([(760, 26), (900, 0)], 4, 4, col=iron)
    cv.brush([(762, 66), (900, 40)], 1.5, 1.5, col=pinkD)
    for x in (790, 830):
        cv.brush([(x, 74 - (x - 760) * 0.18), (x - 6, 210)], 3, 3, col=iron)
    for k in range(7):
        y = 92 + k * 18
        cv.brush([(788 - k * 0.8, y + 8), (826 - k * 0.8, y)], 2, 2, col=iron)
    # the dumpster on the right, its lid propped, its edges in the neon
    bin_ = [(742, 262, 0), (900, 246, 0), (918, 352, 0), (752, 368, 0)]
    m = cv.fill(bin_, hx('#16241e'), smooth=False)
    cv.fill([(742, 262, 0), (900, 246, 0), (906, 226, 0), (748, 240, 0)], hx('#1c2e26'), smooth=False)
    cv.ink(bin_, 4, smooth=False)
    backlit(cv, m, pinkD, ((-3, 0), (0, -3)))
    cv.brush([(748, 240), (906, 226)], 2, 2, col=pink)
    for k in range(3):
        cv.brush([(770 + k * 46, 280 - k * 4), (774 + k * 46, 350 - k * 4)], 2, 2, col=hx('#0e1814'))
    # the wet ground: the signs' light broken into ripples on the water, wider as they come toward us; the puddles
    for cx, cy, rx, ry in ALLEY_PUDDLES:
        cv.ellipse(cx, cy, rx, ry, hx('#171428'))
    for x0, x1, w0, w1, cols, seed in ((636, 600, 26, 90, (pinkDD, pinkD, pink), 30), (668, 720, 14, 46, (hx('#14303a'), hx('#1e6a7a'), cyan), 60)):
        n = 22
        edge = lambda i, side: (x0 + (x1 - x0) * (i / n) + side * (w0 + (w1 - w0) * (i / n)) * (0.35 + 0.3 * bead(seed + i * 2 + (side > 0))) +
                                (bead(seed + i + 40) - 0.5) * 10 * (i / n), oy1 + 4 + (404 - oy1) * (i / n) ** 1.2)
        outer = None
        for lvl, (col, k) in enumerate(zip(cols, (1.0, 0.5, 0.16))):
            pts = [(x0 + (p[0] - x0) * k + (x1 - x0) * (i / n) * (1 - k), p[1]) for i, p in ((i, edge(i, -1)) for i in range(n + 1))]
            pts += [(x0 + (p[0] - x0) * k + (x1 - x0) * (i / n) * (1 - k), p[1]) for i, p in ((i, edge(i, 1)) for i in range(n, -1, -1))]
            cv.fill(pts, col)
            outer = pts if lvl == 0 else outer
        for i in range(1, 9):                                               # the ripples breaking it
            y = oy1 + 4 + (404 - oy1) * ((i + bead(seed + i) * 0.6) / 9) ** 1.2
            cv.brush([(x0 + (x1 - x0) * i / 9 - w1, y), (x0 + (x1 - x0) * i / 9 + w1, y)], 1 + i * 0.5, 1 + i * 0.3, col=hx('#1a1222'), clip=outer)
    # him, sat against the left wall where he came down: black, the neon's edge on his cap, back, knee and boot
    m = figure_sat(cv, 236, 340, 1.3)
    cv.im.paste(INK, (0, 0), m)
    backlit(cv, m, pinkD, ((4, 0), (0, -4)))
    backlit(cv, m, pink, ((2, -2),))
    bottle = [(424, 340, 0), (424, 312), (430, 304, 0), (430, 290, 0), (437, 290, 0), (437, 304, 0), (443, 312), (443, 340, 0)]
    m = cv.fill(bottle, hx('#0c1a10'))
    backlit(cv, m, hx('#5ac08a'), ((3, 0), (0, -2)))
    return cv



DRIVE_MIRROR = (438, 44, 626, 84)   # the rear-view mirror's glass (panel px): the game draws the bar going away in it
DRIVE_GLASS = [(0, 24), (636, 30), (606, 228), (0, 222)]   # the windscreen: the game runs the rain and the wiper on it


def panel_drive():
    """Level 1's ending, panel 1. In the van's cab, from beside him: he drives, his eyes under his cap's peak on the
    road; the windscreen in front of him, its rain and the street lamps; the rear-view mirror on it, where the game
    draws the bar's neon getting smaller (and the rain running down, the wiper going)."""
    cv = Cv(1080, 288, hx('#09080f'))
    glass = [(x, y, 0) for x, y in DRIVE_GLASS]
    gm = cv.mask(glass, smooth=False)
    vx, vy = 250, 142
    # the night through the windscreen: the sky, the street's buildings, the road running away
    cv.fill(glass, hx('#14163a'), smooth=False)
    cv.fill([(0, 100, 0), (60, 98, 0), (60, 80, 0), (130, 80, 0), (130, 108, 0), (190, 108, 0), (190, 120, 0), (310, 122, 0),
             (310, 112, 0), (380, 112, 0), (380, 94, 0), (470, 94, 0), (470, 70, 0), (640, 66, 0), (640, 150, 0),
             (0, 150, 0)], hx('#0c0c20'), clip=gm, smooth=False)
    for i, (x, y) in enumerate(((84, 104), (100, 90), (148, 114), (330, 118), (356, 120), (402, 102), (420, 116), (488, 84),
                                (510, 100), (552, 80), (590, 94), (40, 112))):
        cv.rect(x, y, x + 4, y + 5, hx('#3a2c3a') if i % 3 else hx('#5a3a2a'), clip=gm)       # windows still lit, far
    cv.fill([(vx, vy, 0), (-260, 230, 0), (760, 230, 0)], hx('#121222'), clip=gm, smooth=False)
    for k in range(6):                                                       # the line down its middle
        u0, u1 = (k / 6) ** 1.6, ((k + 0.45) / 6) ** 1.6
        cv.brush([(vx + 40 * u0, vy + 88 * u0), (vx + 40 * u1, vy + 88 * u1)], 1 + 4 * u0, 1 + 4 * u1, col=hx('#6a6252'), clip=gm)
    cv.ellipse(vx - 8, vy - 2, 2.5, 2, hx('#e83a30'), clip=gm)               # a car far ahead, its rear lights
    cv.ellipse(vx + 4, vy - 2, 2.5, 2, hx('#e83a30'), clip=gm)
    # the street lamps on the right going by, their light on the wet road
    for s in (0.12, 0.22, 0.4, 0.78):
        x, top, base = vx + 420 * s, vy - 126 * s, vy + 80 * s
        cv.brush([(x, base), (x, top)], 1 + 7 * s, 1 + 6 * s, col=hx('#07060c'), clip=gm)
        cv.brush([(x, top), (x - 40 * s, top - 6 * s)], 1 + 5 * s, 1 + 4 * s, col=hx('#07060c'), clip=gm)
        lx, ly = x - 44 * s, top - 4 * s
        cv.ellipse(lx, ly + 10 * s, 30 * s + 4, 16 * s + 3, hx('#3a2a3a'), clip=gm)
        cv.ellipse(lx, ly, 12 * s + 2, 5 * s + 2, hx('#f0a040'), clip=gm)
        cv.ellipse(lx, ly, 7 * s + 1, 3 * s + 1, hx('#fff0c0'), clip=gm)
        cv.brush([(lx, vy + 16 * s + 2), (lx + 3 * s, vy + 84 * s + 4)], 2 + 6 * s, 1, col=hx('#3e2c2a'), clip=gm)   # its light on the wet road
        cv.brush([(lx, vy + 16 * s + 2), (lx + 1 * s, vy + 40 * s + 3)], 1 + 3 * s, 0.5, col=hx('#a8642a'), clip=gm)
    rain_beads(cv, 4, 30, 600, 220, 26, (hx('#0e0e2a'), hx('#3e3e6a')), seed=11, clip=gm)
    # the rear-view mirror, the road behind in it
    mx0, my0, mx1, my1 = DRIVE_MIRROR
    cv.brush([(532, 20), (532, 38)], 8, 6, col=hx('#16141c'))
    mirror = [(mx0 - 12, my0 - 10, 0), (mx1 + 12, my0 - 6, 0), (mx1 + 10, my1 + 10, 0), (mx0 - 10, my1 + 6, 0)]
    cv.fill(mirror, hx('#1c1a24'), smooth=False)
    cv.rect(mx0, my0, mx1, my1, hx('#0e0c1c'))
    cv.fill([((mx0 + mx1) / 2, my0 + 18, 0), (mx0, my1, 0), (mx1, my1, 0)], hx('#16142a'), smooth=False)
    cv.ink(mirror, 4, smooth=False)
    cv.brush([(mx0 - 8, my1 + 6), (mx1 + 8, my1 + 10)], 2, 2, col=hx('#4a3a3a'))
    # the frame: the roof, the pillar, the side window behind him, the dashboard and its dials
    cv.fill([(0, 0, 0), (1080, 0, 0), (1080, 24, 0), (636, 30, 0), (0, 24, 0)], hx('#08070d'), smooth=False)
    cv.ink([(0, 24, 0), (636, 30, 0)], 5, closed=False, smooth=False)
    cv.fill([(676, 26, 0), (1080, 24, 0), (1080, 200, 0), (660, 236, 0)], hx('#0f0f1e'), smooth=False)
    rain_beads(cv, 690, 40, 1076, 190, 10, (hx('#0b0b18'), hx('#26263e')), seed=200)
    pillar = [(624, 28, 0), (676, 26, 0), (652, 236, 0), (598, 232, 0)]
    cv.fill(pillar, hx('#0c0b12'), smooth=False)
    cv.brush([(626, 30), (600, 230)], 2, 2, col=hx('#2a2434'))
    cv.ink(pillar, 4, smooth=False)
    dash = [(0, 222, 0), (606, 228, 0), (700, 238, 0), (740, 288, 0), (0, 288, 0)]
    cv.fill(dash, hx('#0b0a12'), smooth=False)
    cv.brush([(0, 223), (606, 229), (700, 239)], 3, 3, col=hx('#2c2a3c'))
    for cx in (500, 548):
        cv.ellipse(cx, 256, 17, 12, hx('#0e2a22'))
        cv.ellipse(cx, 256, 13, 9, hx('#14382c'))
        cv.brush([(cx, 258), (cx - 8, 250)], 2, 1, col=hx('#8af0b0'))
    # him: the coat's shoulder and back, the strap of his satchel across it
    pal = dict(skin=hx('#e3965a'), shade=hx('#4c2e40'), stubble=hx('#a8683e'), stubbleD=hx('#3a2236'), hair=hx('#24160e'),
               hairL=hx('#4a2c18'), white=hx('#b88a6a'), glint=hx('#ffd890'), shine=hx('#ffc890'), cap=hx('#16171f'),
               capL=hx('#5a4a50'), coat=hx('#262a36'), coatL=hx('#6a5a5a'), lining=hx('#2a5f6e'), knit=hx('#4a4c58'),
               knitL=hx('#a8907a'), knitD=hx('#34363f'))
    coatL = pal['coatL']
    body = [(1080, 288, 0), (708, 288, 0), (716, 236), (750, 192), (800, 166), (870, 156), (960, 162), (1040, 186), (1080, 196, 0)]
    m = cv.fill(body, pal['coat'])
    cv.fill([(708, 288, 0), (716, 236), (750, 192), (800, 166), (808, 176), (764, 202), (734, 244), (730, 288, 0)], coatL, clip=m)
    cv.ink(body, 4)
    cv.brush([(900, 160), (840, 220), (790, 288)], 13, 13, col=INK)
    cv.brush([(900, 160), (840, 220), (790, 288)], 8, 8, col=hx('#6a4024'))
    cv.brush([(896, 160), (836, 220), (786, 288)], 2, 2, col=hx('#a86a3a'))
    head_hero_side(cv, T(842, 14, 1.24, -1), pal)
    # the wheel, seen nearly edge on, its column into the dash, and his arm out to it, his hand closed on its rim
    rim = [(628 + 16 * math.cos(a) * math.cos(0.32) - 66 * math.sin(a) * math.sin(0.32),
            200 + 16 * math.cos(a) * math.sin(0.32) + 66 * math.sin(a) * math.cos(0.32)) for a in [k * math.pi / 12 for k in range(24)]]
    cv.brush([(628, 200), (560, 236)], 12, 14, col=INK)
    cv.ink(rim, 14)
    cv.ink(rim, 5, col=hx('#2e2a38'))
    cv.ellipse(628, 200, 8, 10, hx('#16141c'))
    sleeve = [(840, 196), (780, 226), (700, 198), (650, 158), (668, 138), (712, 160), (790, 178), (836, 172)]
    m = cv.fill(sleeve, pal['coat'])
    cv.fill([(650, 158), (668, 138), (712, 160), (790, 178), (786, 188), (708, 172)], coatL, clip=m)
    cv.ink(sleeve, 4)
    fist = [(612, 150), (626, 132), (650, 130), (664, 142), (660, 162), (636, 170), (618, 166)]
    cv.shape(fist, pal['skin'], 3)
    cv.fill([(636, 170), (660, 162), (664, 142), (654, 152), (630, 160)], pal['shade'], clip=fist)
    for k in range(3):
        cv.brush([(622 + k * 10, 138 + k), (618 + k * 10, 160 - k)], 1.5, 1)
    return cv


OFFICE_SMOKE = (214, 177)   # the cigar's lit end in the ashtray (panel px): the game draws its smoke
OFFICE_DRIP = (446, 203)    # where his blood runs off the desk's edge: the game lets it drip


def panel_office():
    """Level 1's ending, panel 2. Behind him: the boss's back room, the desk lamp its only light. The boss fallen
    forward out of his armchair over his desk, his head on its side on the wood by the phone, his eyes shut, his blood
    spread to the desk's edge; the cigar still burning in the ashtray, a glass knocked over, rounds in the wall and
    the desk; the phone ringing (its receiver is office_phone, rattled by the game)."""
    cv = Cv(528, 282, hx('#160a0e'))
    cream, creamD = hx('#d8c8a4'), hx('#8a7a64')
    cv.rect(0, 0, 528, 282, hx('#24101a'))
    cv.fill([(0, 0, 0), (528, 0, 0), (528, 120, 0), (0, 150, 0)], hx('#1a0a12'), smooth=False)
    # a framed picture knocked crooked, two rounds in the wall by it
    frame = [(26, 64, 0), (104, 56, 0), (110, 116, 0), (32, 124, 0)]
    cv.fill(frame, hx('#5a3a18'), smooth=False)
    cv.ink(frame, 3, smooth=False)
    cv.fill([(34, 70, 0), (98, 64, 0), (102, 110, 0), (38, 116, 0)], hx('#2a3a4a'), smooth=False)
    cv.fill([(38, 100, 0), (100, 94, 0), (102, 110, 0), (38, 116, 0)], hx('#3a5a4a'), smooth=False)
    cv.ellipse(84, 78, 7, 7, hx('#d0a050'))
    for x, y in ((140, 92), (176, 74)):
        cv.ellipse(x, y, 4, 4, INK)
        for a in range(5):
            ang = a * 1.3 + x
            cv.brush([(x + math.cos(ang) * 4, y + math.sin(ang) * 4), (x + math.cos(ang) * 10, y + math.sin(ang) * 10)], 1.5, 0.5,
                     col=hx('#0e0408'))
    # the armchair, its high back, the leather and its buttons
    chair = [(250, 200, 0), (256, 70), (290, 40), (380, 34), (440, 46), (468, 80), (474, 200, 0)]
    m = cv.fill(chair, hx('#3a0e10'))
    cv.fill([(256, 70), (290, 40), (380, 34), (384, 46), (300, 54), (270, 80), (268, 200, 0), (250, 200, 0)], hx('#6a2220'), clip=m)
    for x in (300, 350, 400):
        cv.ellipse(x, 66 + (x - 300) * 0.02, 3, 3, hx('#1e0608'), clip=m)
    cv.ink(chair, 4)
    # the desk across the front, the lamp's pool on it, rounds in its front
    top = [(0, 172, 0), (528, 164, 0), (528, 198, 0), (0, 208, 0)]
    cv.fill(top, hx('#4a2814'), smooth=False)
    cv.ellipse(150, 186, 210, 24, hx('#a8743a'), clip=top)
    cv.ellipse(150, 186, 130, 14, hx('#c88c48'), clip=top)
    cv.fill([(0, 208, 0), (528, 198, 0), (528, 282, 0), (0, 282, 0)], hx('#22120a'), smooth=False)
    cv.brush([(0, 208), (528, 198)], 4, 4)
    cv.brush([(0, 211), (528, 201)], 2, 2, col=hx('#6a3a1a'))
    for x in (176, 352):
        cv.brush([(x, 206 - x * 0.02), (x, 282)], 3, 3, col=hx('#2a160c'))
    for x, y in ((92, 240), (300, 232)):
        cv.ellipse(x, y, 3.5, 3.5, INK)
        for a in range(4):
            ang = a * 1.6 + y
            cv.brush([(x, y), (x + math.cos(ang) * 9, y + math.sin(ang) * 6)], 1.5, 0.5, col=hx('#8a5a30'))
    # a paper slid off onto the floor
    pts = [(120, 220, 0), (160, 230, 0), (152, 266, 0), (112, 256, 0)]
    cv.fill(pts, hx('#d8d0bc'), smooth=False)
    cv.ink(pts, 2, smooth=False)
    # the boss, fallen forward out of his chair over the desk: his back in its cream suit, his head down on the wood
    # on its side by the phone, his eyes shut; his blood spread from under him to the desk's edge
    back = [(396, 192), (400, 150), (420, 118), (456, 102), (494, 106), (518, 128), (528, 150, 0), (528, 192, 0)]
    m = cv.fill(back, cream)
    cv.fill([(494, 106), (518, 128), (528, 150, 0), (528, 192, 0), (480, 192), (500, 150)], creamD, clip=m)
    cv.brush([(456, 106), (468, 150), (470, 190)], 1.5, 0.5, mid=3, col=creamD)               # the seam down his back
    cv.ink(back, 4)
    cv.fill([(330, 184), (380, 180), (430, 184), (446, 192), (448, 203, 0), (440, 203, 0), (430, 198), (380, 200), (334, 196)],
            hx('#6a0a12'))
    cv.brush([(350, 190), (420, 191)], 1, 1, mid=2.5, col=hx('#a8202a'))
    cv.fill([(398, 140), (420, 124), (434, 130), (430, 160), (412, 176), (400, 172)], hx('#e8e4d8'))   # his collar
    cv.ink([(398, 140), (420, 124), (434, 130), (430, 160), (412, 176), (400, 172)], 2)
    pal = dict(skin=hx('#d49a74'), shade=hx('#7a4a40'), hair=hx('#a8a8b0'), hairD=hx('#5a5a66'), white=hx('#c8b8a8'))
    head_boss(cv, T(318, 150, 0.84, 1, -math.pi / 2 - 0.08), pal)
    # the ashtray, the cigar on its edge
    cv.ellipse(184, 184, 26, 7, hx('#3a4a4a'))
    cv.ellipse(184, 183, 18, 4, hx('#1a2222'))
    cv.ink([(158, 184), (184, 177), (210, 184), (184, 191)], 3)
    cv.brush([(172, 181), (212, 177)], 7, 6, col=hx('#5a3418'))
    cv.brush([(174, 179), (210, 175)], 1.5, 1.5, col=hx('#8a5a2a'))
    cv.ellipse(*OFFICE_SMOKE, 3.5, 3.5, hx('#ff6a20'))
    # a glass on its side, its whisky spread across the desk
    cv.ellipse(492, 184, 30, 5, hx('#a86a22'))
    glass = [(470, 172, 0), (494, 168, 0), (496, 182, 0), (472, 186, 0)]
    cv.fill(glass, hx('#a8c0c0'), smooth=False)
    cv.fill([(470, 172, 0), (494, 168, 0), (494, 171, 0), (470, 175, 0)], hx('#e8f4f4'), smooth=False)
    cv.ink(glass, 2, smooth=False)
    # the lamp: a green glass shade, its brass, the light under it
    cv.brush([(78, 186), (82, 140)], 6, 6, col=hx('#8a6a2a'))
    cv.ellipse(80, 188, 28, 6, hx('#6a4a1a'))
    cv.ink([(52, 188), (80, 182), (108, 188), (80, 194)], 3)
    shade_ = [(30, 140), (40, 116), (80, 106), (120, 116), (132, 140), (80, 146)]
    cv.shape(shade_, hx('#1e5a34'), 3)
    cv.fill([(40, 116), (80, 106), (120, 116), (110, 122), (80, 114), (50, 122)], hx('#4aa86a'), clip=shade_)
    cv.fill([(36, 140), (80, 146), (128, 140), (80, 152)], hx('#fff0b0'))
    # the phone's body and its dial, its cord
    cv.brush([(316, 182), (340, 196), (380, 200), (420, 196)], 2, 2, col=hx('#14121a'))
    cv.fill([(240, 150), (308, 148), (316, 166, 0), (232, 168, 0)], hx('#1e1a24'))
    cv.ink([(240, 150), (308, 148), (316, 166, 0), (232, 168, 0)], 3)
    base = [(232, 168, 0), (316, 164, 0), (322, 186, 0), (226, 190, 0)]
    cv.shape(base, hx('#14121a'), 3)
    cv.ellipse(274, 176, 16, 7, hx('#c8c0a8'))
    cv.ellipse(274, 176, 6, 3, hx('#3a3440'))
    for a in range(8):
        ang = math.pi * (0.9 + a * 0.16)
        cv.ellipse(274 + math.cos(ang) * 11, 176 + math.sin(ang) * 5, 1.6, 1.2, hx('#3a3440'))
    return cv


def panel_office_phone():
    """Level 1's ending, panel 2's receiver on its own (transparent round it): the game rattles it on its cradle."""
    cv = Cv(528, 282)
    rec = cv.mask([(226, 146), (234, 132), (250, 132), (256, 140), (296, 138), (302, 130), (318, 130), (326, 144), (318, 152),
                   (296, 150), (256, 152), (234, 156)])
    out = Image.new('RGBA', (528, 282), (0, 0, 0, 0))
    out.paste((10, 7, 12, 255), (0, 0), rec)
    out.paste((34, 30, 42, 255), (0, 0), ImageChops.multiply(rec, ImageChops.offset(rec, 0, 3)))
    out.paste((10, 7, 12, 255), (0, 0), ImageChops.multiply(rec, ImageChops.offset(rec, 0, 7)))
    out.paste((140, 124, 120, 255), (0, 0), ImageChops.subtract(ImageChops.multiply(rec, ImageChops.offset(rec, 0, 3)),
                                                                ImageChops.offset(rec, 0, 5)))
    cv.im = out
    return cv


MATCH_COVER = [(96, 82), (360, 64), (366, 150), (102, 168)]   # the matchbook's printed face (panel px): the game letters it


def panel_matchbook():
    """Level 1's ending, panel 3. Close, at the wheel: his hand holds up a matchbook he took off the boss's desk, in
    the light of a street lamp through the wet windscreen: a flamingo on its pink cover (the game letters the name
    over it), the strip on its fold scorched where somebody struck a match."""
    cv = Cv(528, 282, hx('#0c0e22'))
    # the windscreen behind, out of focus: the lamps of the street, flat discs
    for cx, cy, r, col in ((60, 200, 46, hx('#1c1834')), (440, 70, 60, hx('#2a1e2c')), (470, 60, 30, hx('#5a3a2a')),
                           (150, 250, 24, hx('#2a2236')), (330, 30, 20, hx('#1e1a34'))):
        cv.ellipse(cx, cy, r, r, col)
    rain_beads(cv, 0, 0, 528, 282, 16, (hx('#0a0c1c'), hx('#34365e')), seed=77)
    # the wheel's rim across the foot of the panel
    cv.brush([(528, 214), (420, 240), (300, 264), (200, 284)], 30, 26, col=INK)
    cv.brush([(528, 210), (420, 236), (300, 260), (200, 280)], 8, 6, col=hx('#2a2634'))
    skin, skinD, skinL = hx('#e09a62'), hx('#7a4430'), hx('#f4c08a')
    # his coat's cuff and the heel of his hand, his fingers behind the matchbook
    cuff = [(528, 196, 0), (470, 200), (452, 246), (462, 282, 0), (528, 282, 0)]
    cv.shape(cuff, hx('#262a36'), 4)
    cv.brush([(470, 202), (454, 246)], 3, 2, col=hx('#6a5a5a'))
    palm = [(474, 204), (430, 190), (384, 196), (362, 214), (372, 232), (414, 246), (460, 244)]
    cv.shape(palm, skin, 3)
    cv.fill([(362, 214), (372, 232), (414, 246), (460, 244), (420, 230)], skinD, clip=palm)
    # the matchbook: its shadow, the cover, the fold and its striking strip, the staple
    cover = [(96, 82, 0), (360, 64, 0), (372, 210, 0), (106, 228, 0)]
    cv.fill([(104, 92, 0), (368, 74, 0), (380, 220, 0), (112, 238, 0)], hx('#06060e'), smooth=False)
    cv.fill(cover, hx('#e85a86'), smooth=False)
    cv.fill([(96, 82, 0), (360, 64, 0), (361, 74, 0), (97, 92, 0)], hx('#ff9ab8'), smooth=False)
    cv.fill([(352, 64, 0), (360, 64, 0), (372, 210, 0), (364, 211, 0)], hx('#a83260'), smooth=False)
    cv.fill([(106, 196, 0), (370, 178, 0), (372, 210, 0), (106, 228, 0)], hx('#c8406e'), smooth=False)
    cv.fill([(110, 204, 0), (370, 186, 0), (371, 200, 0), (111, 218, 0)], hx('#5a3424'), smooth=False)
    for k in range(5):
        x = 150 + k * 18
        cv.brush([(x, 211 - (x - 110) * 0.07), (x + 30, 207 - (x - 110) * 0.07)], 3, 1, col=INK)    # struck there
    cv.ellipse(236, 222, 5, 3, hx('#c8c8d0'))
    cv.ink(cover, 3, smooth=False)
    # the flamingo, cream on the pink, on one leg
    bird = hx('#f8ecd8')
    cv.brush([(148, 182), (150, 150)], 3, 3, col=bird)
    cv.brush([(150, 160), (162, 166), (154, 172)], 2.5, 2, col=bird)
    cv.fill([(130, 140), (150, 126), (176, 128), (186, 140), (168, 152), (140, 152)], bird)
    cv.brush([(178, 134), (190, 120), (178, 104), (170, 92), (180, 84)], 5, 4, col=bird)
    cv.ellipse(184, 84, 6, 5, bird)
    cv.brush([(188, 84), (198, 90), (196, 96)], 3, 1.5, col=INK)
    cv.brush([(130, 140), (118, 146)], 3, 1, col=bird)
    # his thumb over the cover's corner, its nail
    finger(cv, [(408, 214), (380, 196), (350, 186)], 17, skin, skinD, side=1)
    cv.fill([(344, 180), (356, 178), (360, 188), (350, 192)], skinL)
    cv.ink([(344, 180), (356, 178), (360, 188), (350, 192)], 2)
    return cv


# name -> (painter, its size in panel px): SC x the panel's size in the title's px (Cinematic.js, Panels.js)
PANELS = {
    'eye_shut': (lambda: panel_eye(False), (450, 174)),
    'eye': (lambda: panel_eye(True), (450, 174)),
    'door': (panel_door, (1080, 288)),
    'pry': (panel_pry, (348, 282)),
    'box': (panel_box, (348, 282)),
    'count': (panel_count, (348, 282)),
    'super': (panel_super, (528, 288)),
    'super_blood': (panel_super_blood, (528, 288)),
    'pour': (panel_pour, (528, 288)),
    'match_dark': (lambda: panel_match(False), (1080, 282)),
    'match': (lambda: panel_match(True), (1080, 282)),
    'alley': (panel_alley, (1008, 408)),
    'drive': (panel_drive, (1080, 288)),
    'office': (panel_office, (528, 282)),
    'office_phone': (panel_office_phone, (528, 282)),
    'matchbook': (panel_matchbook, (528, 282)),
}


def main():
    for name, (paint, size) in PANELS.items():
        paint().save(name, size)
    for name, (_, size) in PANELS.items():
        path = os.path.join(OUT_DIR, name + '.png')
        with Image.open(path) as im:
            assert im.size == size, (path, im.size, size)
    print('generated %d comic panels into %s' % (len(PANELS), OUT_DIR))


if __name__ == '__main__':
    main()
