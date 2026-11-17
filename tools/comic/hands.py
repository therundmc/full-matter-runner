"""Hands drawn the way a comic artist draws them, not rendered: each design is a few inked shapes (the back of the
hand or the palm, the thumb with its fleshy base, the fingers as tapered planes broken at the joints, square
knuckles), a black shadow cut into each shape on the side away from the light, and two or three interior lines (the
knuckle row, a tendon, the thumb's crease). Seen small, a design falls back to a silhouette: a mitten, the thumb,
one line.

A design is a RIGHT hand in its own units (100 from the wrist to the middle fingertip), the wrist at (0, 0), the
fingers up (-y), the thumb's side on -x. Its parts and lines carry a layer: 'back' (behind what the hand holds) or
'front' (in front of it). DESIGNS[pose][view] builds one; draw() inks it at a place, an angle and a size (a left
hand is drawn mirrored); Figure.draw_hands (cast.py) places a figure's hands where its 3D arms end.
"""
import math

from PIL import Image, ImageChops, ImageFilter

from .kit import INK, Cv, shift


# ---------------------------------------------------------------- shapes
def _dir(a):
    r = math.radians(a)
    return (math.sin(r), -math.cos(r))


def digit(base, angles, lens, w, taper=0.74, nail=True, pad=0):
    """A finger (or a thumb) from base: its phalanges along angles (degrees from straight up, + clockwise) with
    lengths lens, w wide at its root, thinner to its tip. Each phalanx is a plane: straight on its back, a little
    full in its middle, broken at the joints; pad: the side its pads swell on, seen from the side (+1 its right, -1
    its left, 0 seen from the back or the palm: both sides a little full); the knuckles bump out on the other side.
    Returns (outline (corners marked (x, y, 0)), joints, tip, nail outline or None)."""
    left, right = [], []
    total = float(sum(lens))
    P, run, joints = base, 0.0, []
    d = _dir(angles[0])
    full = {-1: (0.16, 0.0), 1: (0.0, 0.16), 0: (0.07, 0.07)}[pad]
    for i, (a, L) in enumerate(zip(angles, lens)):
        d = _dir(a)
        n = (-d[1], d[0])
        w0 = w * (1 - (1 - taper) * run / total) * (1.06 if i else 1.0)
        w1 = w * (1 - (1 - taper) * (run + L) / total)
        wm = (w0 + w1) / 2
        Q = (P[0] + d[0] * L, P[1] + d[1] * L)
        M = (P[0] + d[0] * L * 0.5, P[1] + d[1] * L * 0.5)
        left += [(P[0] - n[0] * w0 / 2, P[1] - n[1] * w0 / 2, 0),
                 (M[0] - n[0] * wm * (0.5 + full[0]), M[1] - n[1] * wm * (0.5 + full[0])),
                 (Q[0] - n[0] * w1 / 2, Q[1] - n[1] * w1 / 2, 0)]
        right += [(P[0] + n[0] * w0 / 2, P[1] + n[1] * w0 / 2, 0),
                  (M[0] + n[0] * wm * (0.5 + full[1]), M[1] + n[1] * wm * (0.5 + full[1])),
                  (Q[0] + n[0] * w1 / 2, Q[1] + n[1] * w1 / 2, 0)]
        joints.append(Q)
        P, run = Q, run + L
    r = w * taper / 2
    n = (-d[1], d[0])
    cap = [(P[0] - n[0] * r * 0.85 + d[0] * r * 0.45, P[1] - n[1] * r * 0.85 + d[1] * r * 0.45),
           (P[0] + d[0] * r * 0.9, P[1] + d[1] * r * 0.9),
           (P[0] + n[0] * r * 0.85 + d[0] * r * 0.45, P[1] + n[1] * r * 0.85 + d[1] * r * 0.45)]
    nl = None
    if nail:
        c = (P[0] - d[0] * lens[-1] * 0.18, P[1] - d[1] * lens[-1] * 0.18)
        hw, hl = r * 0.58, lens[-1] * 0.3
        off = -pad * r * 0.25
        c = (c[0] + n[0] * off, c[1] + n[1] * off)
        nl = [(c[0] + n[0] * hw - d[0] * hl, c[1] + n[1] * hw - d[1] * hl, 0),
              (c[0] + n[0] * hw + d[0] * hl, c[1] + n[1] * hw + d[1] * hl),
              (c[0] + d[0] * (hl + 1.0), c[1] + d[1] * (hl + 1.0)),
              (c[0] - n[0] * hw + d[0] * hl, c[1] - n[1] * hw + d[1] * hl),
              (c[0] - n[0] * hw - d[0] * hl, c[1] - n[1] * hw - d[1] * hl, 0)]
    return left + cap + right[::-1], joints, P, nl


class Design:
    """A hand drawing: parts drawn in order (later on top), interior lines, anchors (named points in its units)."""

    def __init__(self, small=None):
        self.parts, self.lines, self.anchors = [], [], {}
        self.small = small        # [(points, kind 'skin' | 'line')]: how it is drawn small, or None: its own mitten

    def add(self, pts, layer='front', shadow=0.35, kind='skin'):
        """A shape: kind 'palm', 'finger', 'thumb' (skin), 'nail', 'prop:#rrggbb' (a thing held, in that colour);
        shadow: how much of it (0..1, measured across it along the light) is cut off in black on the side away
        from the light, by a straight edge: a plane in shadow, as an inker designs it."""
        self.parts.append(dict(pts=pts, layer=layer, shadow=shadow, kind=kind))

    def line(self, pts, w0=2.0, w1=1.0, layer='front', key=False):
        """An interior ink line, w0 px at its start tapering to w1 (doubled on a close-up); key: kept when small."""
        self.lines.append(dict(pts=pts, w0=w0, w1=w1, layer=layer, key=key))

    def finger(self, base, angles, lens, w, layer='front', nail=False, wrinkles=False, creases=False, taper=0.74,
               kind='finger', fs=(1.0, 1.0, 1.0), pad=0, shadow=0.3):
        """A finger: fs foreshortens its phalanges (a finger bent toward us looks shorter); wrinkles over its
        knuckles (the back), creases across its joints (the palm). Returns its tip."""
        lens = tuple(L * f for L, f in zip(lens, fs))
        out, joints, tip, nl = digit(base, angles, lens, w, taper, nail, pad)
        self.add(out, layer, shadow=shadow, kind=kind)
        if nl:
            self.add(nl, layer, shadow=0.0, kind='nail')
        for k, j in enumerate(joints[:-1]):
            d = _dir(angles[k + 1])
            n = (-d[1], d[0])
            if wrinkles:
                ww = w * 0.26
                self.line([(j[0] - n[0] * ww, j[1] - n[1] * ww), (j[0] + d[0] * 1.3, j[1] + d[1] * 1.3),
                           (j[0] + n[0] * ww, j[1] + n[1] * ww)], 1.4, 1.0, layer)
            if creases:
                ww = w * 0.34
                self.line([(j[0] - n[0] * ww, j[1] - n[1] * ww), (j[0] + n[0] * ww, j[1] + n[1] * ww)], 1.6, 1.0,
                          layer)
        return tip


# finger roots on the back of a right hand (index on the -x side): root, width, phalanges
ROOTS = {'index': ((-12.5, -46.0), 10.8, (20.0, 12.0, 9.0)), 'middle': ((-2.2, -49.0), 11.4, (22.0, 14.0, 10.0)),
         'ring': ((7.8, -47.0), 10.6, (20.0, 13.0, 9.5)), 'little': ((16.2, -42.0), 9.0, (15.0, 9.5, 8.5))}
ORDER = ('little', 'ring', 'index', 'middle')
BACK = [(-14, 0, 0), (14, 0, 0), (18.5, -18), (20.5, -36), (18, -43), (8, -48.5), (-2.5, -50), (-12.5, -47.5),
        (-18.5, -42, 0), (-19.5, -30), (-17.5, -16)]
PALM = [(-14, 0, 0), (14, 0, 0), (18, -10), (21, -24), (19.5, -40, 0), (13, -46.5), (2.5, -49.5), (-8, -48),
        (-17, -44), (-20, -34), (-19.5, -18), (-16, -7)]


def _f(d, name, angles, fs=(1.0, 1.0, 1.0), flip=False, dx=0.0, dy=0.0, **kw):
    """One of ROOTS's fingers (flip: its mirror, for a palm view)."""
    (bx, by), w, lens = ROOTS[name]
    return d.finger(((-bx if flip else bx) + dx, by + dy), angles, lens, w, fs=fs, **kw)


def _knuckles(d, pts, layer='front'):
    for i, (x, y) in enumerate(pts):
        d.line([(x - 4.4, y + 2.6), (x - 1.6, y - 0.6), (x + 1.6, y - 0.6), (x + 4.4, y + 2.6)], 2.0, 1.2, layer,
               key=(i == 1))


# ---------------------------------------------------------------- the poses
def relaxed_back():
    """The back of the hand to us, at rest: the fingers together and a little curled (shorter as they bend to us),
    the thumb hanging along the side."""
    d = Design()
    d.finger((-12.0, -8.0), (-30, -18, -8), (22.0, 14.0, 12.0), 14.0, nail=True, kind='thumb', taper=0.7, pad=-1,
             shadow=0.3)
    d.add(BACK, shadow=0.25, kind='palm')
    for name, a, fs in (('little', (12, 20, 30), (0.9, 0.8, 0.7)), ('ring', (5, 12, 20), (0.95, 0.85, 0.75)),
                        ('index', (-6, -1, 6), (0.97, 0.88, 0.8)), ('middle', (0, 6, 12), (0.97, 0.88, 0.8))):
        _f(d, name, a, fs=fs, nail=True, wrinkles=True)
    _knuckles(d, [(-12.5, -46.5), (-2.2, -49.5), (7.8, -47.5), (16.2, -42.5)])
    d.line([(-3.0, -42), (-2.0, -26), (-0.5, -10)], 1.8, 0.6)                    # a tendon
    d.line([(-13.0, -13), (-9.0, -19), (-4.5, -21)], 1.6, 0.6)                   # the thumb's root under the skin
    d.anchors = dict(tip=(3.0, -94.0))
    return d


def relaxed_palm():
    """The palm to us, at rest: the fingers curled a little, the creases across their joints, the ball of the
    thumb and its crease."""
    d = Design()
    d.add(PALM, shadow=0.22, kind='palm')
    for name, a, fs in (('little', (-12, -20, -30), (0.9, 0.82, 0.75)), ('ring', (-5, -12, -20), (0.94, 0.86, 0.8)),
                        ('index', (6, 1, -6), (0.96, 0.9, 0.84)), ('middle', (0, -6, -12), (0.96, 0.9, 0.84))):
        _f(d, name, a, fs=fs, flip=True, creases=True)
    d.add([(9, -3), (17, -8), (21.5, -20), (20, -31), (13, -32), (7.5, -22), (6.5, -10)], shadow=0.4, kind='thumb')
    d.finger((16.5, -18.0), (30, 20, 10), (17.0, 14.0, 12.0), 14.0, kind='thumb', taper=0.7, pad=-1, shadow=0.35)
    d.line([(7.0, -5), (5.5, -18), (9, -29), (15, -34)], 2.2, 0.8, key=True)    # the thumb's crease round its ball
    d.line([(-18, -36), (-7, -39.5), (5, -37)], 2.0, 0.6)                       # the heart line
    d.line([(-18.5, -27), (-9, -28.5), (1, -26)], 1.6, 0.6)
    d.anchors = dict(tip=(-3.0, -94.0))
    return d


def relaxed_side():
    """Seen from the thumb's side, hanging at rest: the index's whole length in front, the others stepped behind
    it, curled more, the thumb along in front of them."""
    d = Design()
    d.add([(-8, 0, 0), (9, 0, 0), (11.5, -20), (10, -38), (5, -47), (-6, -46), (-9.5, -28)], shadow=0.45,
          kind='palm')
    for i, a in enumerate(((16, 34, 52), (12, 28, 44), (8, 22, 36))):
        d.finger((4.5 - i * 2.2, -44.0 + i * 1.8), a, (20.0, 12.0, 9.0), 10.4, fs=(0.97, 0.92, 0.9), pad=1,
                 shadow=0.35)
    d.finger((-1.5, -46.5), (3, 14, 26), (21.0, 13.0, 9.0), 10.8, nail=True, wrinkles=True, pad=1, shadow=0.4)
    d.add([(-8, -4), (-13.5, -13), (-15, -26), (-10.5, -33), (-5, -29), (-4, -14)], shadow=0.4, kind='thumb')
    d.finger((-11.0, -23.0), (-6, 10, 24), (14.0, 13.0, 11.0), 12.5, nail=True, kind='thumb', taper=0.72, pad=1,
             shadow=0.35)
    d.line([(5.5, -46), (8, -43), (10, -38)], 2.0, 1.0, key=True)               # the knuckle's bump
    d.line([(-7, -12), (-9, -22)], 1.6, 0.8)
    d.anchors = dict(tip=(14.0, -92.0))
    return d


def fist_front():
    """A fist round a bar, seen from in front (the bar along x through it): four curled fingers, their middle
    bones to us in a stepped row, the knuckle ridge above them, the thumb wrapped across in front."""
    d = Design()
    d.add([(-15, 0, 0), (15, 0, 0), (19, -18), (20, -32), (16.5, -42, 0), (-17, -42, 0), (-20.5, -30), (-18.5, -16)],
          shadow=0.42, kind='palm')
    d.anchors = dict(bar=(0.0, -52.0), tip=(0.0, -64.0))
    for i, (x, w, top) in enumerate(((16.3, 9.6, -60.0), (7.6, 11.0, -64.0), (-2.6, 11.6, -65.0), (-13.2, 11.0, -63.0))):
        y = -42.0 + (2.0 if i == 0 else 0.0)
        d.add([(x - w / 2, y, 0), (x + w / 2, y, 0), (x + w / 2 + 0.4, top + 5, 0), (x + w / 2 - 1.5, top, 0),
               (x - w / 2 + 1.5, top, 0), (x - w / 2 - 0.4, top + 5, 0)], shadow=0.3, kind='finger')
        mid = (y + top) / 2 + 1.5
        d.line([(x - w / 2 + 2.0, mid + 1.5), (x, mid), (x + w / 2 - 2.0, mid + 1.5)], 1.8, 1.0)   # its middle joint
    _knuckles(d, [(-13.2, -42.5), (-2.6, -43), (7.6, -42.5), (16.3, -40.5)])
    # the thumb: from the heel of the hand, up its side and across the front of the index and middle fingers
    d.add([(-19, -16), (-24, -28), (-23, -42), (-16, -52), (-4, -56.5), (4, -55), (4.5, -50.5), (-6, -49),
           (-13, -43), (-15, -30)], shadow=0.38, kind='thumb')
    d.add([(-3, -56), (3.5, -54.6), (3.8, -51.2), (-3, -51.8)], shadow=0.0, kind='nail')
    d.line([(-18, -30), (-16, -40), (-10, -46)], 2.0, 0.8, key=True)
    return d


def fist_side(d=None):
    """A fist round a bar seen from the thumb's side (the bar across through its middle, along the view): the
    curled fingers' front, the thumb over them. Returns the bar's centre if drawn into another design d."""
    own = d is None
    d = d or Design()
    d.add([(-10, 0, 0), (10, 0, 0), (12.5, -16), (12, -33), (-11, -33), (-12, -16)], shadow=0.45, kind='palm')
    d.add([(-11, -33, 0), (12, -33, 0), (14.5, -42), (13, -54), (4, -59), (-6, -58), (-12.5, -50), (-13, -40)],
          shadow=0.42, kind='finger')
    d.line([(-11, -44), (-2, -45.5), (7, -44)], 1.8, 1.0)
    d.line([(-9, -52), (1, -54)], 1.6, 0.8)
    d.add([(-11, -12), (-16.5, -24), (-16, -38), (-8, -48), (2.5, -49), (4.5, -45), (-5, -41.5), (-9.5, -30)],
          shadow=0.35, kind='thumb')
    d.add([(-2, -49), (3.5, -48.4), (3.0, -45.2), (-2.2, -45.5)], shadow=0.0, kind='nail')
    d.line([(-12.5, -22), (-12, -33)], 1.6, 0.8, key=True)
    if own:
        d.anchors = dict(bar=(0.0, -46.0), tip=(0.0, -60.0))
        return d
    return (0.0, -46.0)


def hook_front():
    """Holding a flat thing by its edge, seen from in front: the palm under it, the fingers curled up its front
    face, their backs and their knuckles to us, their tips hooked over its top; the thumb along its end. Anchor
    'edge': where its top front edge lies."""
    d = Design()
    d.add([(-15, 0, 0), (15, 0, 0), (19, -12), (20, -24, 0), (-20, -24, 0), (-18.5, -10)], layer='back', shadow=0.5,
          kind='palm')
    d.anchors = dict(edge=(0.0, -44.0), tip=(0.0, -50.0))
    for i, (x, w, top) in enumerate(((16.2, 9.4, -42.0), (7.6, 11.0, -46.5), (-2.6, 11.6, -47.5), (-13.0, 11.0, -46.0))):
        y0 = -22.0 + (2.5 if i == 0 else 0.0)
        # its first bones bent up out of the palm, its middle bone up the face, its last bone over the top
        d.add([(x - w / 2, y0, 0), (x + w / 2, y0, 0), (x + w / 2 + 0.3, top + 6, 0), (x + w / 2 - 1.2, top + 1, 0),
               (x, top - 0.8), (x - w / 2 + 1.2, top + 1, 0), (x - w / 2 - 0.3, top + 6, 0)], shadow=0.32,
              kind='finger')
        d.add([(x - w * 0.27, top + 1.0, 0), (x + w * 0.27, top + 1.0, 0), (x + w * 0.24, top + 5.0),
               (x - w * 0.24, top + 5.0)], shadow=0.0, kind='nail')
        mid = (y0 + top) / 2 + 2
        d.line([(x - w / 2 + 2.0, mid + 1.6), (x, mid), (x + w / 2 - 2.0, mid + 1.6)], 1.8, 1.0)    # its middle joint
    _knuckles(d, [(-13.0, -22.5), (-2.6, -23), (7.6, -22.5), (16.2, -20)])
    d.add([(-19.5, -6), (-25.5, -16), (-27, -30), (-23.5, -37), (-19, -30), (-17.5, -15)], shadow=0.38, kind='thumb')
    d.add([(-26.5, -32), (-23.8, -36.5), (-21.6, -32.5), (-24.2, -29)], shadow=0.0, kind='nail')
    d.line([(-22, -12), (-23, -24)], 1.6, 0.8, key=True)
    return d


def pinch_side():
    """Thumb and index pinching something small (a match), seen from the thumb's side, the other fingers curled.
    Anchor 'pinch': where the thing is held."""
    d = Design()
    d.add([(-8, 0, 0), (9, 0, 0), (12, -18), (10.5, -37), (4, -45), (-6, -44), (-10, -26)], shadow=0.45, kind='palm')
    for i in range(3):
        d.finger((5.5 - i * 2.0, -40.0 + i * 2.0), (44, 110, 165), (17.0, 11.0, 8.0), 10.2, fs=(0.95, 0.9, 0.9), pad=1,
                 shadow=0.55)
    tip = d.finger((-1.0, -44.5), (-8, 24, 58), (20.0, 12.0, 9.0), 10.6, nail=True, wrinkles=True, pad=1, shadow=0.4)
    d.add([(-8, -4), (-14, -14), (-15.5, -27), (-10.5, -33), (-5, -28), (-4, -14)], shadow=0.4, kind='thumb')
    d.finger((-11.5, -24.0), (-6, 16, 40), (15.0, 13.0, 11.0), 12.2, nail=True, kind='thumb', taper=0.72, pad=1,
             shadow=0.35)
    d.anchors = dict(pinch=(tip[0] - 1.5, tip[1] + 1.5), tip=tip)
    d.line([(7.5, -40), (10, -36), (11.5, -30)], 2.0, 1.0, key=True)
    return d


def point_side():
    """The index pointing out straight, the others curled, the thumb over them; seen from the thumb's side."""
    d = Design()
    d.add([(-8, 0, 0), (9, 0, 0), (12, -18), (10.5, -37), (4, -45), (-6, -44), (-10, -26)], shadow=0.45, kind='palm')
    for i in range(3):
        d.finger((5.5 - i * 2.0, -40.0 + i * 2.0), (70, 150, 200), (17.0, 11.0, 8.0), 10.2, fs=(0.95, 0.9, 0.9), pad=1,
                 shadow=0.55)
    d.finger((-1.0, -44.5), (-3, -2, -1), (20.0, 12.0, 9.0), 10.6, nail=True, wrinkles=True, pad=1, shadow=0.4)
    d.add([(-8, -4), (-14, -14), (-15.5, -27), (-10.5, -33), (-5, -28), (-4, -14)], shadow=0.4, kind='thumb')
    d.finger((-11.5, -24.0), (24, 58, 78), (14.0, 12.0, 10.0), 12.2, nail=True, kind='thumb', taper=0.72, pad=1,
             shadow=0.35)
    d.line([(7.5, -40), (10, -36), (11.5, -30)], 2.0, 1.0, key=True)
    d.anchors = dict(tip=(-1.0, -88.0))
    return d


def open_back():
    d = Design()
    d.finger((-12.0, -8.0), (-58, -50, -42), (22.0, 16.0, 13.0), 14.0, nail=True, kind='thumb', taper=0.7, pad=-1,
             shadow=0.3)
    d.add(BACK, shadow=0.25, kind='palm')
    for name, a in zip(ORDER, ((24, 27, 30), (9, 11, 13), (-14, -15, -16), (-1, 0, 1))):
        _f(d, name, a, nail=True, wrinkles=True)
    _knuckles(d, [(-12.5, -46.5), (-2.2, -49.5), (7.8, -47.5), (16.2, -42.5)])
    d.line([(-3.0, -42), (-2.0, -26), (-0.5, -10)], 1.8, 0.6)
    d.anchors = dict(tip=(-1.0, -98.0))
    return d


def open_palm():
    d = Design()
    d.add(PALM, shadow=0.22, kind='palm')
    for name, a in zip(ORDER, ((-24, -27, -30), (-9, -11, -13), (14, 15, 16), (1, 0, -1))):
        _f(d, name, a, flip=True, creases=True)
    d.add([(9, -3), (17, -8), (21.5, -20), (20, -31), (13, -32), (7.5, -22), (6.5, -10)], shadow=0.4, kind='thumb')
    d.finger((17.5, -18.0), (58, 50, 42), (18.0, 15.0, 12.0), 14.0, kind='thumb', taper=0.7, pad=-1, shadow=0.35)
    d.line([(7.0, -5), (5.5, -18), (9, -29), (15, -34)], 2.2, 0.8, key=True)
    d.line([(-18, -36), (-7, -39.5), (5, -37)], 2.0, 0.6)
    d.anchors = dict(tip=(1.0, -98.0))
    return d


def riffle_side():
    """Under the end of a stack seen from the thumb's side: the fingers behind and under it, the thumb in front, up
    its end and bent over its top edge to press the notes it bends up. Anchors 'thumb' (the thumb's pad), 'edge'."""
    d = Design()
    d.add([(-8, 0, 0), (9, 0, 0), (12, -18), (10.5, -34), (3, -42), (-6, -40), (-10, -22)], layer='back', shadow=0.4,
          kind='palm')
    for i in range(4):
        d.finger((6.0 - i * 2.6, -36.0 + i * 1.5), (26, 40, 56), (18.0, 12.0, 8.0), 10.2, layer='back',
                 fs=(0.95, 0.9, 0.9), pad=1, shadow=0.3)
    d.add([(-8, -2), (-14.5, -12), (-16.5, -26), (-11.5, -33), (-5, -29), (-4, -12)], shadow=0.3, kind='thumb')
    tip = d.finger((-11.5, -26.0), (4, 34, 78), (17.0, 14.0, 12.0), 12.8, nail=True, kind='thumb', taper=0.74,
                   pad=1, shadow=0.25)
    d.line([(-9, -10), (-11, -21)], 1.6, 0.8, key=True)
    d.line([(-7, -40), (-4, -45)], 1.6, 0.8)
    d.anchors = dict(thumb=(tip[0] - 2.0, tip[1] + 4.0), edge=(2.0, -46.0), tip=(14.0, -70.0))
    return d


def torch_side():
    """A fist round a torch held out level, seen from the thumb's side, the torch drawn with it: its lens at
    anchor 'lens'."""
    d = Design()
    d.add([(-30, -52, 0), (32, -52, 0), (32, -40, 0), (-30, -40, 0)], layer='back', shadow=0.4, kind='prop:#3a3a44')
    d.add([(32, -55, 0), (46, -60, 0), (46, -32, 0), (32, -37, 0)], layer='back', shadow=0.4, kind='prop:#6a6a78')
    d.add([(46, -60, 0), (49, -60, 0), (49, -32, 0), (46, -32, 0)], layer='back', shadow=0.0, kind='prop:#fff8e0')
    fist_side(d)
    d.anchors = dict(lens=(49.0, -46.0), tip=(48.0, -46.0))
    return d


def can_back():
    """Hanging from a handle, the back of the hand to us: the fingers hooked round a bar across under them (their
    first bones forward, the rest curled under: short), the thumb against the side. Anchor 'bar'."""
    d = Design()
    d.finger((-12.0, -8.0), (-16, 4, 28), (20.0, 13.0, 11.0), 13.5, nail=True, kind='thumb', taper=0.7, pad=-1,
             shadow=0.3)
    d.add(BACK, shadow=0.25, kind='palm')
    for name, a in zip(ORDER, ((10, 60, 120), (4, 60, 118), (-6, 56, 114), (-1, 58, 116))):
        _f(d, name, a, fs=(0.75, 0.5, 0.45), wrinkles=True)
    _knuckles(d, [(-12.5, -46.5), (-2.2, -49.5), (7.8, -47.5), (16.2, -42.5)])
    d.anchors = dict(bar=(1.0, -60.0), tip=(1.0, -66.0))
    return d


def mirror_pts(pts):
    return [(-p[0],) + tuple(p[1:]) for p in pts]


# small hands: the mitten (the palm and the fingers together), the thumb, one line
MITTEN = [([(-13, 0, 0), (13, 0, 0), (16, -30), (15.5, -60), (11, -80), (1, -86), (-9, -80), (-13.5, -52)], 'skin'),
          ([(-11, -8), (-17.5, -24), (-18.5, -42), (-14.5, -50), (-10.5, -38), (-9, -20)], 'skin'),
          ([(-12, -56), (-2, -60), (12, -56)], 'line')]
MITT_FIST = [([(-15, 0, 0), (15, 0, 0), (18, -28), (17, -50), (8, -60), (-8, -60), (-18, -50), (-19, -26)], 'skin'),
             ([(-19, -28), (-15, -45), (-4, -52), (7, -51), (7, -45), (-6, -42), (-12, -30)], 'skin'),
             ([(-14, -38), (0, -40), (15, -38)], 'line')]


def _small(build, mitt):
    def make():
        d = build()
        d.small = mitt
        return d
    return make


DESIGNS = {
    'relaxed': {'back': _small(relaxed_back, MITTEN), 'palm': _small(relaxed_palm, [(mirror_pts(p), k) for p, k in MITTEN]),
                'side': _small(relaxed_side, MITTEN)},
    'fist': {'front': _small(fist_front, MITT_FIST), 'side': _small(fist_side, MITT_FIST)},
    'grip': {'front': _small(fist_front, MITT_FIST), 'side': _small(fist_side, MITT_FIST)},
    'hook': {'front': hook_front},
    'pinch': {'side': pinch_side},
    'match': {'side': pinch_side},
    'point': {'side': point_side},
    'open': {'back': open_back, 'palm': open_palm},
    'riffle': {'side': riffle_side},
    'torch': {'side': _small(torch_side, MITT_FIST)},
    'can': {'back': _small(can_back, MITT_FIST)},
}


def design(pose, view=None):
    views = DESIGNS[pose]
    return views[view]() if view in views else next(iter(views.values()))()


# ---------------------------------------------------------------- inking
def draw(cv, d, at, angle=0.0, size=60.0, mirror=False, light=(-0.6, -0.6), skin=None, ink=3, layers=('back', 'front'),
         visible=None, small=None):
    """Ink design d onto cv: its wrist at the panel point at, turned angle degrees (0: fingers up, + clockwise),
    size px from the wrist to the fingertips, mirrored for a left hand; light: the panel direction the light comes
    from (x, y); skin: (lit, shade) colours; ink: the contour's weight in px (interior lines are 2 tapering to 1 on a
    close-up, 1 when small); layers: which of its layers to draw; visible: a mask where it may show (what is in front
    of it hidden). small (default: size under 44 px): a silhouette, a mitten and its thumb, one line. Returns the
    mask of what was drawn."""
    W, H = cv.w, cv.h
    k = size / 100.0
    c, s = math.cos(math.radians(angle)), math.sin(math.radians(angle))
    sg = -1.0 if mirror else 1.0

    def P(p):
        x, y = p[0] * sg * k, p[1] * k
        q = (at[0] + x * c - y * s, at[1] + x * s + y * c)
        return q + ((0,) if len(p) > 2 else ())
    small = size < 44 if small is None else small
    lit, shade = skin or ((220, 160, 120), (120, 70, 80))
    L = math.hypot(*light) or 1.0
    lx, ly = light[0] / L, light[1] / L
    layer = Cv(W, H, (0, 0, 0))
    layer.im = cv.im.copy()
    drawn = Image.new('L', (W, H), 0)
    w_out = max(1, ink)
    grow = lambda m, r: m.filter(ImageFilter.MaxFilter(2 * r + 1)) if r > 0 else m

    def ink_part(m, col, frac, pts):
        layer.im.paste(col, (0, 0), m)
        if frac > 0:
            # a plane in shadow: the shape is cut along its own length (its main axis), the side away from the
            # light in black, frac of its width deep: a finger, the thumb, the edge of the hand as square forms
            n = len(pts)
            cx = sum(p[0] for p in pts) / n
            cy = sum(p[1] for p in pts) / n
            sxx = sum((p[0] - cx) ** 2 for p in pts)
            syy = sum((p[1] - cy) ** 2 for p in pts)
            sxy = sum((p[0] - cx) * (p[1] - cy) for p in pts)
            th = 0.5 * math.atan2(2 * sxy, sxx - syy)
            ux, uy = -math.sin(th), math.cos(th)          # across the shape
            if ux * lx + uy * ly > 0:
                ux, uy = -ux, -uy                        # toward the dark side
            proj = [(p[0] - cx) * ux + (p[1] - cy) * uy for p in pts]
            t = max(proj) - (max(proj) - min(proj)) * frac
            far = 4 * (W + H)
            ax, ay = cx + ux * t, cy + uy * t
            vx, vy = -uy, ux
            half = [(ax + vx * far, ay + vy * far, 0), (ax - vx * far, ay - vy * far, 0),
                    (ax - vx * far + ux * far, ay - vy * far + uy * far, 0),
                    (ax + vx * far + ux * far, ay + vy * far + uy * far, 0)]
            layer.im.paste(INK, (0, 0), ImageChops.multiply(m, layer.mask(half, smooth=False)))
        # a shape's own line, where it lies on the others: thin, a little heavier on its dark side
        ring = grow(m, 1)
        if w_out >= 2:
            ring = ImageChops.lighter(ring, shift(ring, round(-lx), round(-ly)))
        ring = ImageChops.subtract(ring, m)
        layer.im.paste(INK, (0, 0), ring)
        return ImageChops.lighter(m, ring)

    def colour(kind):
        if kind.startswith('prop:'):
            h = kind[5:].lstrip('#')
            return (int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16))
        if kind == 'nail':
            return tuple(min(255, int(v * 1.12 + 18)) for v in lit)
        return lit
    if small and d.small:
        # the silhouette a comic artist draws a small hand as: a mitten, its thumb, one line
        for pts, kind in d.small:
            q = [P(p) for p in pts]
            if kind == 'line':
                layer.brush(q, 1.4, 1.0)
            else:
                drawn = ImageChops.lighter(drawn, ink_part(layer.mask(q), colour(kind), 0.4, q))
        for p in d.parts:
            if p['layer'] in layers and p['kind'].startswith('prop:'):
                pts = [P(q) for q in p['pts']]
                drawn = ImageChops.lighter(drawn, ink_part(layer.mask(pts), colour(p['kind']), p['shadow'], pts))
    elif small:
        mitten = Image.new('L', (W, H), 0)
        for p in d.parts:
            if p['layer'] in layers and p['kind'] in ('palm', 'finger'):
                mitten = ImageChops.lighter(mitten, layer.mask([P(q) for q in p['pts']]))
        allpts = [P(q) for p in d.parts if p['layer'] in layers and p['kind'] in ('palm', 'finger') for q in p['pts']]
        if allpts:
            drawn = ImageChops.lighter(drawn, ink_part(mitten, lit, 0.4, allpts))
        for p in d.parts:
            if p['layer'] in layers and (p['kind'] == 'thumb' or p['kind'].startswith('prop:')):
                pts = [P(q) for q in p['pts']]
                drawn = ImageChops.lighter(drawn, ink_part(layer.mask(pts), colour(p['kind']), p['shadow'], pts))
        for ln in d.lines:
            if ln['layer'] in layers and ln['key']:
                layer.brush([P(q) for q in ln['pts']], 1.2, 1.0)
    else:
        for p in d.parts:
            if p['layer'] in layers:
                pts = [P(q) for q in p['pts']]
                drawn = ImageChops.lighter(drawn, ink_part(layer.mask(pts), colour(p['kind']), p['shadow'], pts))
        for ln in d.lines:
            if ln['layer'] in layers and (size >= 70 or ln['key'] or ln['w0'] >= 1.9):
                f = 1.0 if size < 80 else 1.25
                layer.brush([P(q) for q in ln['pts']], ln['w0'] * f, ln['w1'] * f)
    # the hand's contour against everything else: the heavy line
    if w_out > 1:
        out = grow(drawn, w_out - 1)
        out = ImageChops.lighter(out, shift(out, round(-lx), round(-ly)))
        out = ImageChops.subtract(out, drawn)
        layer.im.paste(INK, (0, 0), out)
        drawn = ImageChops.lighter(drawn, out)
    if visible is not None:
        drawn = ImageChops.multiply(drawn, visible)
    cv.im.paste(layer.im, (0, 0), drawn)
    return drawn


def place(d, at, angle, size, mirror=False, name='tip'):
    """Where design d's anchor name lands drawn with these at, angle, size, mirror (panel px)."""
    a = d.anchors.get(name, (0.0, -100.0))
    k = size / 100.0
    c, s = math.cos(math.radians(angle)), math.sin(math.radians(angle))
    x, y = a[0] * (-1.0 if mirror else 1.0) * k, a[1] * k
    return (at[0] + x * c - y * s, at[1] + x * s + y * c)


def aim(d, wrist, target, name, mirror=False):
    """The angle and size that put design d's wrist at wrist and its anchor name on target (panel px)."""
    a = d.anchors[name]
    ax, ay = a[0] * (-1.0 if mirror else 1.0), a[1]
    dx, dy = target[0] - wrist[0], target[1] - wrist[1]
    size = 100.0 * math.hypot(dx, dy) / (math.hypot(ax, ay) or 1.0)
    ang = math.degrees(math.atan2(dy, dx) - math.atan2(ay, ax))
    return ang, size
