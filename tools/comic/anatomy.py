"""The cast's anatomy, built in 3D for tools/comic/solid.py to render flat with its ink: the head (a loft of rings
round its vertical axis, its profile, width and depth curves with bumps for the sockets, the cheekbones, the nose's
wings; eyes, brows, lips and nostrils painted on per px), the hair and cap shells over it, the ears and the neck; the
body (a torso lofted along a bending spine, arms and legs by two-bone IK, shoes); the hand (a palm, the fingers' and
the thumb's bones, posed by shapes or with the thumb's tip aimed at a point).

Units: a head is 100 from crown (y 0) to chin (y 100), x to his left (+x: the viewer's right when he faces us), z out
of his face, y down. A man is 7.5 heads tall. Read tools/comic/STYLE.md first.
"""
import math

from .kit import INK
from .solid import IDENT, Mesh, Xf, add, cross, dot, grid, lerp, mul, mv, rot, sub, tube, unit


# ---------------------------------------------------------------- curves
class Curve:
    """A smooth curve through (x, y) knots (x increasing), read as f(x); flat beyond its ends."""

    def __init__(self, knots):
        self.k = sorted(knots)

    def __call__(self, x):
        k = self.k
        if x <= k[0][0]:
            return k[0][1]
        if x >= k[-1][0]:
            return k[-1][1]
        i = 1
        while k[i][0] < x:
            i += 1
        (x0, y0), (x1, y1) = k[i - 1], k[i]
        h = x1 - x0
        m0 = (y1 - k[i - 2][1]) / (x1 - k[i - 2][0]) if i >= 2 else (y1 - y0) / h
        m1 = (k[i + 1][1] - y0) / (k[i + 1][0] - x0) if i + 1 < len(k) else (y1 - y0) / h
        u = (x - x0) / h
        return ((2 * u ** 3 - 3 * u ** 2 + 1) * y0 + (u ** 3 - 2 * u ** 2 + u) * h * m0 + (-2 * u ** 3 + 3 * u ** 2) * y1 +
                (u ** 3 - u ** 2) * h * m1)


def smooth(e0, e1, x):
    u = max(0.0, min(1.0, (x - e0) / (e1 - e0)))
    return u * u * (3 - 2 * u)


def bell(u):
    """1 at 0, 0 from |u| >= 1, smooth."""
    return (1 - u * u) ** 2 if -1 < u < 1 else 0.0


def spow(v, e):
    return math.copysign(abs(v) ** e, v)


def tone3(lit, shade, deep=None, hi=None):
    """A colour for each level of the light."""
    return {'hi': hi or lit, 'lit': lit, 'shade': shade, 'deep': deep or shade}


# ---------------------------------------------------------------- the head
# The rings of a head, about its vertical axis: at each height y, the half width W, the z of its widest point (zm),
# of its back (zb), of the plain front of the face (zf) and of the profile down the middle (zp, the nose and the lips
# and the chin standing out of zf over a half width fw); then bumps (x, y, rx, ry, depth) on the front, mirrored.
HEAD = dict(
    W=[(0, 0), (2, 12), (6, 21), (12, 27.5), (20, 31.5), (30, 33.5), (40, 33.5), (48, 32.5), (55, 31.5), (60, 30.5),
       (66, 29), (72, 27.5), (78, 26), (84, 24.5), (88, 22.5), (92, 19), (95, 15), (97.5, 10), (99.5, 4), (100, 0)],
    zm=[(0, -4), (30, -3), (55, 0), (70, 0), (84, -1), (90, 4), (95, 12), (100, 22)],
    zb=[(0, -4), (2, -16), (6, -27), (12, -36), (20, -42), (30, -45.5), (40, -46), (50, -44), (58, -40), (64, -34),
        (68, -26), (72, -16), (76, -9), (84, -6), (90, 0), (95, 8), (100, 22)],
    zf=[(0, -4), (2, 6), (6, 17), (12, 27), (20, 34), (30, 38.5), (38, 40), (46, 38.5), (56, 37), (66, 36.5), (74, 36),
        (82, 35), (88, 33.5), (93, 31), (97, 26), (100, 22)],
    zp=[(0, -4), (2, 6), (6, 17), (12, 27.5), (20, 35), (28, 39.5), (34, 41.5), (38, 42.5), (41, 41.5), (43.5, 39.5),
        (46, 40), (50, 42.5), (55, 45.5), (60, 49), (63.5, 51.5), (65.5, 52), (67, 50.5), (68.5, 47.5), (70, 43.5),
        (71.5, 42.3), (74, 43.2), (75.8, 42.8), (76.8, 41.6), (78, 42.1), (79.6, 42.3), (81.5, 41.3), (84, 38.6), (87, 39),
        (90.5, 40.6), (93.5, 39.8), (96.5, 35.5), (98.8, 29), (100, 22)],
    fw=[(0, 40), (30, 40), (37, 32), (41, 14), (44, 7.5), (50, 7), (58, 8), (63, 9.5), (66, 11.5), (68.5, 13),
        (70, 19), (74, 21), (77, 22), (80, 19), (84, 17), (90, 17), (96, 18), (100, 20)],
    bumps=[(14.5, 45.0, 9.5, 6.0, -5.0), (16.0, 53.5, 9.0, 4.0, 1.6), (10, 44, 4, 3, -1.5), (14, 39.5, 11, 3.5, 1.8), (24, 56, 9, 7, 3.5),
           (8.5, 66.5, 4.5, 3.5, 3.5), (13, 71, 7, 7, 1.8), (11.5, 77, 3, 3, -1.2), (27, 36, 6, 8, -1.5)],
)

# the lines an inker puts in a face, in its front view (|x|, y): (name, polyline, width at its start, at its end,
# the least z it is drawn at); Head(lines=(...)) picks them
FACE_LINES = [
    ('naso', [(9.5, 65.0), (12.8, 70.5), (14.2, 76.0), (14.6, 81.0)], 1.1, 0.25, 20),        # nose to mouth
    ('bags', [(9.5, 52.8), (14.5, 54.4), (20.0, 52.6)], 0.8, 0.2, 15),                      # under the eyes
    ('cheek', [(26.5, 52.0), (24.0, 60.0), (20.5, 67.0)], 0.9, 0.2, 0),                     # the cheekbone's edge
    ('jaw', [(28.5, 72.0), (24.0, 85.0), (15.0, 94.5)], 1.0, 0.3, -12),                     # the jaw's side plane
    ('forehead', [(3.0, 25.5), (11.0, 24.2), (19.0, 26.0)], 0.7, 0.2, 20),
    ('forehead', [(4.0, 30.5), (12.0, 29.4), (18.5, 31.0)], 0.6, 0.2, 20),
    ('crows', [(21.0, 46.0), (24.5, 44.2)], 0.6, 0.2, 5),
    ('crows', [(21.0, 47.6), (24.5, 49.0)], 0.6, 0.2, 5),
    ('chin', [(0.0, 90.5), (0.0, 96.0)], 0.9, 0.3, 20),                                     # a cleft chin
    ('marionette', [(12.4, 78.5), (13.6, 85.0)], 0.7, 0.2, 15),                             # mouth corners down
    ('furrow', [(2.6, 38.0), (3.2, 44.0)], 0.7, 0.3, 30),                                   # between the brows
]


def near(x, y, pts, w0, w1):
    """Is (x, y) on the polyline pts drawn w0 wide at its start thinning to w1 at its end?"""
    total = sum(math.dist(pts[i], pts[i + 1]) for i in range(len(pts) - 1)) or 1.0
    run = 0.0
    for i in range(len(pts) - 1):
        (ax_, ay), (bx, by) = pts[i], pts[i + 1]
        dx, dy = bx - ax_, by - ay
        L2 = dx * dx + dy * dy or 1e-9
        t = max(0.0, min(1.0, ((x - ax_) * dx + (y - ay) * dy) / L2))
        d = math.hypot(x - ax_ - dx * t, y - ay - dy * t)
        seg = math.sqrt(L2)
        w = w0 + (w1 - w0) * (run + seg * t) / total
        if d < w / 2:
            return True
        run += seg
    return False


# the face's features, in its front view (x, y): eyes, brows, mouth
EYE = dict(x=14.5, y=46.5, hw=6.4, up=2.6, lo=1.6, iris=2.8)
CENTRE = (0.0, 48.0, -2.0)    # the middle of the skull: hair and cap stand out from it


def head_angles():
    out = []
    for a in range(-180, -120, 12):
        out.append(float(a))
    for a in range(-120, -55, 5):
        out.append(float(a))
    a = -55.0
    while a <= 55.01:
        out.append(a)
        a += 2.5
    for a in range(60, 121, 5):
        out.append(float(a))
    for a in range(132, 181, 12):
        out.append(float(a))
    return out


def head_rows():
    ys = []
    y = 0.0
    while y < 34:
        ys.append(y)
        y += 2.5 if y > 4 else 1.0
    while y < 100:
        ys.append(y)
        y += 1.2
    ys.append(100.0)
    return ys


class Head:
    """A head from a spec (HEAD's keys, any of them replaced) and the character's mods:
    jaw (wider lower face, + / -), chin (+ forward), nose (scale of the nose's relief), hook (the bridge's bump),
    brow (+ heavier ridge), cheek (- hollow under the cheekbone), jowl (+ heavy jowls), neck (radius), smile (left,
    right: -1 down .. 1 up, the mouth's corners), squint (0..1), lids (0 shut .. 1 open), gaze (x, y of the irises)."""

    def __init__(self, **mods):
        self.m = dict(jaw=0.0, chin=0.0, nose=1.0, hook=0.0, brow=0.0, cheek=0.0, jowl=0.0, neck=18.0, smile=(0.0, 0.0),
                      squint=0.0, lids=1.0, gaze=(0.0, 0.0), skull=1.0, width=1.0, tip=0.0, eye=1.0, lines=(), heavy_lids=0.0)
        self.m.update(mods)
        m = self.m
        self.W = Curve(HEAD['W'])
        self.zm, self.zb, self.zf, self.fw = Curve(HEAD['zm']), Curve(HEAD['zb']), Curve(HEAD['zf']), Curve(HEAD['fw'])
        self.zp = Curve(HEAD['zp'])
        bumps = list(HEAD['bumps'])
        bumps.append((14, 39.5, 12, 3.5, 2.5 * m['brow']))
        bumps.append((20, 69, 7, 8, 3.0 * m['cheek']))
        bumps.append((22, 86, 8, 8, 4.0 * m['jowl']))
        bumps.append((0, 52, 4, 5, 2.5 * m['hook']))
        self.bumps = [b for b in bumps if b[4]]

    def width(self, y):
        m = self.m
        w = self.W(y) * m['width']
        w *= 1 + m['jaw'] * smooth(55, 86, y) * (1 - smooth(92, 100, y) * 0.5)
        w *= 1 + m['jowl'] * 0.12 * smooth(70, 88, y)
        return w

    def relief(self, x, y):
        m = self.m
        base = self.zp(y) - self.zf(y)
        if 44 <= y <= 71:
            base = base * m['nose'] + m['tip'] * smooth(60, 66, y) * (1 - smooth(68, 71, y)) * 3
        elif 84 <= y:
            base += m['chin'] * smooth(84, 92, y) * (1 - smooth(97, 100, y))
        r = base * bell(x / max(1.0, self.fw(y)))
        ax = abs(x)
        for bx, by, rx, ry, amp in self.bumps:
            r += amp * bell((ax - bx) / rx) * bell((y - by) / ry)
        return r

    def point(self, y, a, off=0.0):
        """The surface at height y, a degrees round (0: the front, 90: +x), pushed off by off out from CENTRE."""
        e = 0.85
        s, c = math.sin(math.radians(a)), math.cos(math.radians(a))
        W = self.width(y)
        zm = self.zm(y)
        if c >= 0:
            z = zm + (self.zf(y) - zm) * spow(c, e)
        else:
            z = zm + (zm - self.zb(y)) * spow(c, e)
        x = W * spow(s, e)
        if c > 0:
            z += self.relief(x, y) * math.sqrt(c)
        if y < 12:      # the skull's dome
            k = self.m['skull']
            z = zm + (z - zm) * k
        p = (x, y, z)
        if off:
            d = unit(sub(p, CENTRE))
            p = add(p, mul(d, off))
        return p

    GEOMETRY = ('jaw', 'chin', 'nose', 'hook', 'brow', 'cheek', 'jowl', 'skull', 'width', 'tip')
    _meshes = {}

    def mesh(self):
        """The head's loft (the same build gives the same mesh: kept)."""
        key = tuple(self.m[k] for k in self.GEOMETRY)
        if key not in Head._meshes:
            ang = head_angles()
            rows = [[self.point(y, a) for a in ang] for y in head_rows()]
            m = grid(rows, centers=[(0, y, self.zm(y)) for y in head_rows()])
            m.normals_()
            Head._meshes[key] = m
        return Head._meshes[key]

    def shell(self, off, y_max=100.0):
        """A shell over the head (hair, a cap): off(p, phi) -> how far it stands out at the surface point p (phi:
        degrees round from the front, 0..180 either side), negative where it sinks under the skin."""
        ang = head_angles()
        rows = []
        for y in [y for y in head_rows() if y <= y_max]:
            row = []
            for a in ang:
                p = self.point(y, a)
                row.append(self.point(y, a, off(p, abs(a))))
            rows.append(row)
        return grid(rows, centers=[(0, y, self.zm(y)) for y in head_rows() if y <= y_max])

    def ear(self, side):
        """An ear (side +1: on +x), a thin shell standing a little off the head, its top tipped back."""
        x = side * (self.width(55) - 0.5)
        path = [(x, 42.5, -2.0), (x + side * 2.5, 55.0, -6.0), (x + side * 1.5, 68.0, -7.5)]
        m = tube(path, lambda u, a: 7.5 * math.sin(math.pi * (0.08 + 0.84 * u)) ** 0.6, n=12, up=(0, 0, 1),
                 squash=lambda u: 0.42, attr=lambda u, a, p: (u, a if side > 0 else (360 - a) % 360, 0.0))
        return m

    def neck(self):
        r = self.m['neck']
        return tube([(0, 64, -17), (0, 104, -11), (0, 150, -4)], lambda u, a: r * (1 + 0.1 * u), n=20, up=(0, 0, 1),
                    squash=lambda u: 1.1, caps=(False, False), attr=lambda u, a, p: p)

    # ---------------------------------------------------------------- the face, painted on
    def mouth_y(self, x):
        """The line between the lips at x, the corners lifted by the smile."""
        sm = self.m['smile'][0 if x < 0 else 1]
        u = min(1.0, abs(x) / 11.0)
        return 77.0 - sm * 3.2 * u ** 2.2 + abs(sm) * 0.3 * u

    def face(self, pal, extra=None, least=0.0):
        """The skin's tex: eyes, brows, lids, lips, nostrils and the face's lines painted per px from the model point
        (x, y, z); least: the narrowest a line may be (model units)."""
        m = self.m
        E = dict(EYE, hw=EYE['hw'] * m['eye'], up=EYE['up'] * m['eye'], lo=EYE['lo'] * m['eye'],
                 iris=EYE['iris'] * m['eye'])
        skin, lip = pal['skin'], pal.get('lip', pal['skin'])
        white, iris = pal['white'], pal['iris']
        brow = pal['brow']
        gx, gy = m['gaze']
        open_ = m['lids'] * (1 - 0.45 * m['squint'])
        lines = set(m['lines'])
        heavy = m['heavy_lids']

        def tex(a, level, n):
            x, y, z = a[0], a[1], a[2]
            ax = abs(x)
            if extra:
                c = extra(x, y, z, level)
                if c is not None:
                    return c
            if z < 4:
                return None
            # the eyes
            xe, ye = ax - E['x'], y - E['y']
            if abs(xe) < E['hw'] + 1.4 and -6 < ye < 5:
                u = xe / E['hw']
                inner = 1 if (xe < 0) else 0
                top = -E['up'] * open_ * (1 - u * u) * (1 + 0.15 * inner) - 0.2
                bot = E['lo'] * max(0.25, open_) * (1 - u * u) * (1 - 0.6 * m['squint']) + 0.25
                if abs(u) < 1:
                    if open_ > 0.05 and top < ye < bot:
                        # the eyeball: the iris (looking gx, gy), the lid's shadow over its top
                        di = math.hypot(x - math.copysign(E['x'], x) - gx, ye - gy)
                        if di < E['iris']:
                            if di < E['iris'] * 0.42:
                                return INK
                            if ye < top + 0.9:
                                return iris['deep']
                            return iris[level]
                        if ye < top + 0.9:
                            return white['shade']
                        return white[level]
                    if top - 1.3 < ye <= top:
                        return INK                               # the upper lid's lashes
                    if bot <= ye < bot + 0.6:
                        return skin['shade'] if level in ('lit', 'hi') else skin['deep']
                    if top - 3.4 - heavy * 1.5 < ye <= top - 2.4 and open_ > 0.3 and level != 'deep':
                        return INK if heavy else (skin['shade'] if level in ('lit', 'hi') else None)   # the lid's crease
                    if heavy and top - 2.4 < ye <= top - 1.3:
                        return skin['shade']                                    # the heavy lid hanging over it
                if 1 <= u < 1.25 and abs(ye) < 0.8:
                    return INK                                   # the outer corner
            # what a penciller draws in: the planes' breaks, the folds and lines of a face that has lived
            if level != 'deep':
                for key, pts, w0, w1, zmin in FACE_LINES:
                    if key in lines and zmin < z and near(ax, y, pts, max(w0, least), max(w1, least * 0.6)):
                        return INK
            # the brows
            bx = ax - 6.0
            if 0 <= bx < 20 and 34 < y < 44:
                k = bx / 20.0
                by = 40.2 - 2.2 * math.sin(math.pi * min(1.0, k * 1.3)) + 1.0 * k - m['brow'] * 0.6
                lift = pal.get('brow_lift', (0, 0))[0 if x < 0 else 1]
                by -= lift * 2.0 * k
                th = 2.6 * (1 - 0.55 * k) + 0.6
                if abs(y - by) < th / 2:
                    return brow[level]
            # the nostrils
            for sx in (-4.6, 4.6):
                if ((x - sx) / 2.4) ** 2 + ((y - 68.6) / 1.15) ** 2 < 1 and z < self.zp(68.6) - 2:
                    return INK
            # the mouth
            if ax < 12.5 and 70 < y < 84:
                my = self.mouth_y(x)
                if ax < 11 and abs(y - my) < 0.75 - 0.35 * (ax / 11):
                    return INK
                if 11 <= ax < 12.4 and abs(y - (my - 0.6)) < 0.6 and max(m['smile']) > 0.2:
                    return INK
                if ax < 9.5 and my - 2.8 * (1 - (ax / 10) ** 2) < y < my:
                    return lip[level]
                if ax < 9.5 and my < y < my + 3.2 * (1 - (ax / 10) ** 2):
                    return lip[level]
            return None
        return tex


# ---------------------------------------------------------------- hair
def hair_off(line, thick, band=1.8):
    """A hair shell's off(p, phi): thick(phi, y) out where y is above the line, sinking under the skin below it."""
    def off(p, phi):
        k = (line(phi) - p[1]) / band
        k = max(-1.0, min(1.0, k))
        return thick(phi, p[1]) * k if k > 0 else 1.2 * k
    return off


def phi_of(p):
    return math.degrees(math.atan2(abs(p[0]), p[2] - CENTRE[2]))


# ---------------------------------------------------------------- lofts
def section(W, zf, zb, e=0.85, angles=None):
    """A cross-section: half width W, front z zf, back z zb (negative), a superellipse; [(x, z)] round from the front
    (angle 0) through +x."""
    out = []
    for a in angles or [i * 10.0 for i in range(37)]:
        s, c = math.sin(math.radians(a)), math.cos(math.radians(a))
        out.append((W * spow(s, e), (zf if c >= 0 else -zb) * spow(c, e)))
    return out


def place_ring(c, side, front, sec):
    return [add(c, add(mul(side, x), mul(front, z))) for x, z in sec]


def blend_rot(a, b, w):
    """A rotation between a and b (w 0..1), its columns lerped and squared up again."""
    col = lambda m, j: (m[0][j], m[1][j], m[2][j])
    y = unit(lerp(col(a, 1), col(b, 1), w))
    z = unit(lerp(col(a, 2), col(b, 2), w))
    z = unit(sub(z, mul(y, dot(z, y))))
    x = cross(y, z)
    return ((x[0], y[0], z[0]), (x[1], y[1], z[1]), (x[2], y[2], z[2]))


# ---------------------------------------------------------------- the body
# A man 7.5 heads tall (a head: 100), standing, facing +z, the floor at y 0 (up is -y): the torso's rings (y, half
# width, front z, back z) for a medium build in clothes, the joints, the bones' lengths.
TORSO = [(-366, 30, 20, -26), (-376, 44, 27, -34), (-395, 62, 33, -46), (-440, 59, 33, -40), (-480, 55, 35, -35),
         (-520, 60, 41, -39), (-555, 66, 45, -43), (-585, 72, 42, -45), (-604, 78, 32, -40), (-616, 70, 24, -36),
         (-630, 46, 14, -30), (-643, 24, 6, -22), (-650, 8, 1, -9)]
PELVIS_Y = -392
BONES = dict(upper=144, fore=120, thigh=192, shin=178, ankle=24, shoulder_y=-598, hip_y=-394, hip_x=33)


def ik(a, t, l1, l2, pole):
    """Two bones from a toward t (lengths l1, l2), the joint between them bent toward pole (a direction): returns the
    joint and the end (t, or as far as the bones reach toward it)."""
    d = sub(t, a)
    dist = math.sqrt(dot(d, d)) or 1e-6
    dist_c = max(abs(l1 - l2) + 1e-3, min(l1 + l2 - 1e-3, dist))
    u = mul(d, 1 / dist)
    end = add(a, mul(u, dist_c))
    x = (l1 * l1 - l2 * l2 + dist_c * dist_c) / (2 * dist_c)
    h = math.sqrt(max(0.0, l1 * l1 - x * x))
    p = sub(pole, mul(u, dot(pole, u)))
    if dot(p, p) < 1e-9:
        p = cross(u, (1, 0, 0))
    p = unit(p)
    return add(add(a, mul(u, x)), mul(p, h)), end


def mm_(a, b):
    return tuple(tuple(sum(a[i][k] * b[k][j] for k in range(3)) for j in range(3)) for i in range(3))


class Fold:
    """A fold of cloth round a limb, drawn as an inker draws it: a line across the limb at u (0..1 along it, 0 at
    the shoulder or the hip) centred on angle a0 (0: inside the bend), span degrees either side, bent along by
    slope (u's change from its middle to its ends: + a smile, - a frown, kind 's' a spiral), w its width (model
    units) in the middle, thinning to nothing at its ends; depth: how far the cloth bunches out along it."""

    def __init__(self, u, a0=0.0, span=80.0, slope=0.0, w=1.6, depth=1.0, kind='v'):
        self.u, self.a0, self.span, self.slope, self.w, self.depth, self.kind = u, a0, span, slope, w, depth, kind

    def at(self, u, ang, L):
        """How far (model units, along the limb) the point (u, ang) is from the fold's line, and the line's width
        there; None outside its span."""
        da = (ang - self.a0 + 180.0) % 360.0 - 180.0
        if abs(da) >= self.span:
            return None
        k = da / self.span
        uc = self.u + self.slope * (k if self.kind == 's' else abs(k))
        return abs(u - uc) * L, self.w * math.cos(k * math.pi / 2)

    def ridge(self, u, ang, L):
        if not self.depth:
            return 0.0
        hit = self.at(u, ang, L)
        if hit is None:
            return 0.0
        d, w = hit
        return self.depth * bell(d / 3.5) * (w / self.w)


def fold_tex(folds, under=None, least=0.0):
    """A sleeve's or a leg's tex: its folds inked (not where the light has gone to black), then under's tex. least:
    the narrowest a fold's line may be (model units: a px at the scene's scale, so that it still shows small)."""
    def tex(a, level, n):
        u, ang, ue, L = a
        if level != 'deep':
            for f in folds:
                hit = f.at(u, ang, L)
                if hit and hit[0] < max(hit[1], least * (hit[1] / f.w) ** 0.3) / 2:
                    return INK
        return under(a, level, n) if under else None
    return tex


def sleeve_folds(ue, bend):
    """The folds of a sleeve bent bend degrees at the elbow (u ue): bunched inside the elbow, pulled round the
    forearm, a drag line from the armpit; cuffs bunch at the wrist."""
    k = min(1.0, bend / 60.0)
    return [Fold(ue - 0.025, 0, 70, -0.02, 1.8, 1.4 * k), Fold(ue + 0.01, 0, 85, 0.03, 2.0, 1.8 * k),
            Fold(ue + 0.05, 10, 60, 0.025, 1.4, 1.0 * k), Fold(ue + 0.16, 40, 95, 0.05, 1.3, 0.6, 's'),
            Fold(ue + 0.3, -30, 80, -0.04, 1.1, 0.4, 's'), Fold(0.16, 200, 70, 0.08, 1.2, 0.0, 's'),
            Fold(0.95, 180, 110, -0.012, 1.2, 0.8)]


def trouser_folds(ue, bend):
    """A trouser leg's folds: behind the knee as it bends, across the front of the knee, the break over the shoe."""
    k = min(1.0, bend / 45.0)
    return [Fold(ue - 0.02, 0, 70, -0.015, 1.8, 1.4 * k), Fold(ue + 0.015, 0, 80, 0.02, 1.6, 1.2 * k),
            Fold(ue - 0.06, 180, 60, 0.02, 1.2, 0.0), Fold(0.2, 140, 70, 0.06, 1.2, 0.0, 's'),
            Fold(0.935, 180, 100, -0.012, 1.5, 1.6), Fold(0.965, 150, 70, 0.01, 1.3, 1.2)]


def bend_of(a, b, c):
    """The angle (degrees) a limb a-b-c bends at b: 0 straight."""
    u, v = unit(sub(b, a)), unit(sub(c, b))
    return math.degrees(math.acos(max(-1.0, min(1.0, dot(u, v)))))


def stance(weight='l', hips=7.0, shoulders=5.0, turn=0.0, lean=0.0, spread=26.0, step=24.0, drop=8.0, head=None):
    """A standing pose with its weight on one leg (contrapposto): that leg under him, its hip up, the pelvis's
    turn and tilt, the shoulders tilted against the hips, the free leg out (spread) and forward (step) with its knee
    bent, the head tilted back toward the weight. Returns Body's pose keys (add arms, hands, a head turn after)."""
    sg = 1 if weight == 'l' else -1
    free = 'r' if weight == 'l' else 'l'
    hx_ = BONES['hip_x']
    return {
        'root': (sg * 9.0, PELVIS_Y + drop, 0.0),
        'pelvis': mm_(rot((0, 1, 0), turn), rot((0, 0, 1), -sg * hips)),
        'chest': mm_(rot((0, 0, 1), sg * (hips + shoulders)), rot((1, 0, 0), -lean)),
        'head': head or rot((0, 0, 1), -sg * shoulders * 0.8),
        'ankle_' + weight: (sg * 6.0, -BONES['ankle'], -2.0),
        'ankle_' + free: (-sg * (hx_ + spread), -BONES['ankle'], step),
        'knee_' + free: (-sg * 0.3, 0.0, 1.0),
        'toe_' + weight: (sg * 0.25, 0.0, 1.0),
        'toe_' + free: (-sg * 0.45, 0.0, 1.0),
    }


class Build:
    """How a man is built: width (chest and shoulders' bulk), depth, belly (more front at the waist), chest (more
    front at the ribs), hips, shoulder (half the distance between the shoulder joints), limb (thickness of arms and
    legs)."""

    def __init__(self, width=1.0, depth=1.0, belly=0.0, chest=0.0, hips=1.0, shoulder=74.0, limb=1.0):
        self.width, self.depth, self.belly, self.chest, self.hips = width, depth, belly, chest, hips
        self.shoulder, self.limb = shoulder, limb

    def ring(self, y, W, zf, zb):
        w = W * (self.hips + (self.width - self.hips) * smooth(-440, -560, y))
        zf = zf * self.depth + self.belly * bell((y + 475) / 75) + self.chest * bell((y + 560) / 50)
        return w, zf, zb * self.depth


class Body:
    """A man's body posed, in body space (standing at the origin, facing +z, the floor at y 0): the spine (the pelvis
    turned by pelvis, the chest by chest, bending between them), the arms to their wrists (IK, the elbow toward a
    pole), the legs to their ankles, the head on the neck. pose keys (all optional):
      root (x, y, z): the pelvis's centre (standing: (0, PELVIS_Y, 0)); pelvis, chest, head: turns (ypr), each on the
      one before; wrist_r / wrist_l (x, y, z), elbow_r / elbow_l (pole directions); ankle_r / ankle_l (x, y, z),
      knee_r / knee_l (poles), toe_r / toe_l (where the feet point).
    'r' is his right (on -x), 'l' his left."""

    def __init__(self, build, pose):
        self.b, self.p = build, pose
        b = build
        self.root = pose.get('root', (0.0, PELVIS_Y, 0.0))
        self.Rp = pose.get('pelvis', IDENT)
        self.Rc = mm_(self.Rp, pose.get('chest', IDENT))
        self.Rh = mm_(self.Rc, pose.get('head', IDENT))
        S = b.shoulder
        sy = BONES['shoulder_y']
        self.shoulder = {'r': self.chest_pt((-(S - 4), sy, -4)), 'l': self.chest_pt((S - 4, sy, -4))}
        hx_ = BONES['hip_x'] * b.hips
        self.hip = {'r': self.pelvis_pt((-hx_, BONES['hip_y'], 2)), 'l': self.pelvis_pt((hx_, BONES['hip_y'], 2))}
        self.elbow, self.wrist, self.knee, self.ankle, self.toe = {}, {}, {}, {}, {}
        for s, sx in (('r', -1), ('l', 1)):
            hang = (sx * (S + 8), -352, 4)
            w = pose.get('wrist_' + s, hang)
            self.elbow[s], self.wrist[s] = ik(self.shoulder[s], w, BONES['upper'], BONES['fore'],
                                              pose.get('elbow_' + s, (sx * 0.3, 0, -1)))
            a = pose.get('ankle_' + s, (sx * (hx_ + 4), -BONES['ankle'], 0))
            self.knee[s], self.ankle[s] = ik(self.hip[s], a, BONES['thigh'], BONES['shin'],
                                             pose.get('knee_' + s, (sx * 0.1, 0, 1)))
            self.toe[s] = pose.get('toe_' + s, (sx * 0.14, 0, 1))

    # -------------------------------------------------------------- the spine
    def spine_rot(self, y):
        return blend_rot(self.Rp, self.Rc, smooth(-460, -580, y))

    def spine_c(self, y):
        """The spine's point at standing height y (integrated from the pelvis through its bend)."""
        c, y0 = self.root, float(PELVIS_Y)
        while abs(y - y0) > 1e-6:
            dy = max(-8.0, min(8.0, y - y0))
            c = add(c, mv(self.spine_rot(y0 + dy / 2), (0, dy, 0)))
            y0 += dy
        return c

    def chest_pt(self, p):
        return add(self.spine_c(p[1]), mv(self.spine_rot(p[1]), (p[0], 0, p[2])))

    def pelvis_pt(self, p):
        return add(self.root, mv(self.Rp, (p[0], p[1] - PELVIS_Y, p[2])))

    def torso(self, rings=None, step=7.5):
        """The torso's loft through rings (TORSO's or the caller's (y, half width, front z, back z), from the bottom
        up); attr: the point standing (x, y, z), for the clothes' tex."""
        rows, at, centers = [], [], []
        ang = [i * step for i in range(int(round(360 / step)) + 1)]
        for y, W, zf, zb in rings or TORSO:
            w, f, bk = self.b.ring(y, W, zf, zb)
            sec = section(w, f, bk, 0.8, ang)
            R = self.spine_rot(y)
            c = self.spine_c(y)
            rows.append(place_ring(c, mv(R, (1, 0, 0)), mv(R, (0, 0, 1)), sec))
            at.append([(x, y, z) for x, z in sec])
            centers.append(c)
        return grid(rows, at, centers)

    def head_xf(self, xf):
        """The head's placement (its own units: crown 0, chin 100) on this body placed by xf."""
        pivot_model = (0.0, 86.0, -14.0)
        pivot = self.chest_pt((0, -664, -12))
        m = mm_(xf.m, self.Rh)
        return Xf.raw(m, sub(xf(pivot), mv(m, pivot_model)))

    def limb(self, a, b, c, r_top, r_mid, r_end, up=None, bulge=(0.0, 0.0), n=16, ends=(True, True), squash=None,
             folds=()):
        """A limb (an arm, a leg, in its sleeve) through a, b (the elbow or the knee), c: its radius r_top at a, r_mid
        at the joint, r_end at c; bulge (upper, lower): more at the middle of each bone; folds: [Fold] the cloth
        bunched there (the radius ridged where each one runs). Its angle 0 looks into the bend (inside the elbow,
        behind the knee: `up` when the limb is straight). attr: (u, angle, u at b, length)."""
        l1, l2 = math.dist(a, b), math.dist(b, c)
        L = l1 + l2
        ue = l1 / L
        inside = sub(lerp(a, c, ue), b)
        if dot(inside, inside) > 1.0:
            up = unit(inside)
        up = up or (0, 0, 1)

        def radius(u, ang):
            if u <= ue:
                k = u / ue
                r = r_top + (r_mid - r_top) * k + bulge[0] * bell((k - 0.4) / 0.6)
            else:
                k = (u - ue) / (1 - ue)
                r = r_mid + (r_end - r_mid) * k + bulge[1] * bell((k - 0.3) / 0.6)
            for f in folds:
                r += f.ridge(u, ang, L)
            return r
        return tube([a, b, c], radius, n=n, up=up, caps=ends, squash=squash, attr=lambda u, ang, p: (u, ang, ue, L))


# ---------------------------------------------------------------- feet
def shoe(ankle, toe_dir, length=104.0, width=19.0, height=26.0, heel=24.0):
    """A shoe or a boot under an ankle: from its heel behind the ankle to its toe along toe_dir, its sole flat on the
    floor. attr: (u along it, a round it (0: its top), 0)."""
    d = unit((toe_dir[0], 0.0, toe_dir[2]))
    floor = ankle[1] + BONES['ankle']
    start = (ankle[0] - d[0] * heel, floor - height * 0.45, ankle[2] - d[2] * heel)
    path = [start, add(start, mul(d, length * 0.5)), add(start, mul(d, length))]

    def radius(u, a):
        top = math.cos(math.radians(a)) > 0
        return height * (0.62 - 0.3 * smooth(0.35, 1.0, u)) if top else height * 0.5
    m = tube(path, radius, n=16, up=(0, -1, 0), squash=lambda u: width / height * (1.0 + 0.15 * bell((u - 0.7) / 0.3)),
             attr=lambda u, a, p: (u, a, 0.0))
    m.verts = [(v[0], min(v[1], floor), v[2]) for v in m.verts]
    m.normals = None
    return m


# ---------------------------------------------------------------- hands
# A right hand in its own space: the wrist at the origin, the fingers along +y, the palm facing +z, the thumb on -x
# (a left hand is its mirror). Each finger (index, middle, ring, little): its knuckle, its three bones, its radius at
# the base and at the tip; the thumb: its root in the palm, its three bones, its radii.
FINGERS = [((-11.5, 41.0, 0.0), (17.5, 10.5, 8.0), 4.1, 3.3), ((-3.5, 43.0, 0.0), (19.0, 12.0, 8.5), 4.2, 3.4),
           ((4.5, 41.5, 0.0), (18.0, 11.5, 8.5), 4.0, 3.2), ((12.0, 37.0, 0.0), (14.0, 8.5, 7.5), 3.5, 2.8)]
THUMB = ((-9.0, 5.0, 2.0), (21.0, 14.0, 11.5), 5.4, 4.0)

# Shapes: each finger (spread toward the little finger, bend at the knuckle, at the middle joint, at the last), the
# thumb (spread away from the hand toward -x, lift out of the palm toward +z, bend, bend), in degrees.
RELAXED = dict(fingers=[(-1, 26, 40, 18), (0, 30, 44, 20), (1, 34, 46, 20), (3, 38, 48, 20)], thumb=(12, 24, 16, 18))
OPEN = dict(fingers=[(-9, 2, 4, 2), (-1, 0, 4, 2), (6, 2, 5, 3), (14, 4, 6, 4)], thumb=(48, 22, 2, 4))
FIST = dict(fingers=[(-2, 86, 100, 56), (0, 90, 102, 56), (2, 92, 102, 56), (4, 94, 102, 56)], thumb=(10, 30, 0, 0),
            thumb_tip=(1.0, 37.0, 24.0))
PINCH = dict(fingers=[(-4, 42, 52, 26), (0, 58, 70, 36), (4, 66, 76, 38), (8, 72, 80, 38)], thumb=(30, 40, 0, 0),
             thumb_tip='index')


def grip(r, spread=2.0):
    """Fingers closed round a bar of radius r lying across the palm."""
    out = []
    for i, (_, (l1, l2, l3), r0, _r1) in enumerate(FINGERS):
        R = r + r0
        out.append(((i - 1.2) * spread, 28 + math.degrees(l1 * 0.5 / R) * 0.9 + i * 3,
                    math.degrees((l1 * 0.5 + l2 * 0.5) / R), math.degrees((l2 * 0.5 + l3 * 0.5) / R)))
    return dict(fingers=out, thumb=(12, 34, 0, 0), thumb_tip=(-1.0, 44.0 - r * 0.3, 9.0 + 2 * r + 4.0))


def flat(curl=12.0, thumb=None):
    """Fingers held out nearly straight under something flat, their tips curling up round its far edge; thumb: where
    the thumb's tip presses (on top of it), else held out."""
    return dict(fingers=[(-4, 6, curl * 0.6, curl), (-1, 4, curl * 0.7, curl), (3, 6, curl * 0.8, curl),
                         (8, 10, curl, curl)], thumb=(40, 40, 10, 10), thumb_tip=thumb)


class Hand:
    """A hand in a shape (RELAXED, FIST, grip(r), ...): its bones in hand space (a right hand) and its meshes."""

    def __init__(self, shape):
        self.shape = shape
        self.bones = []          # [(start, end, r0, r1, back (where its nail looks), last bone?)]
        for (base, lens, r0, r1), (spread, *bends) in zip(FINGERS, shape['fingers']):
            d0 = unit((math.sin(math.radians(spread)), math.cos(math.radians(spread)), 0.0))
            k = unit(cross(d0, (0, 0, 1)))
            p, acc = base, 0.0
            for i, (L, b) in enumerate(zip(lens, bends)):
                acc += b
                R = rot(k, acc)
                d, back = mv(R, d0), mv(R, (0, 0, -1))
                q = add(p, mul(d, L))
                self.bones.append((p, q, r0 + (r1 - r0) * i / 3, r0 + (r1 - r0) * (i + 1) / 3, back, i == 2))
                p = q
        base, lens, r0, r1 = THUMB
        spread, lift, b1, b2 = shape['thumb']
        cl, sl = math.cos(math.radians(lift)), math.sin(math.radians(lift))
        d = (-math.sin(math.radians(spread)) * cl, math.cos(math.radians(spread)) * cl, sl)
        across = unit((0.62, 0.08, 0.78))
        target = shape.get('thumb_tip')
        if target == 'index':        # the pad of the thumb on the pad of the index
            target = add(self.bones[2][1], (-2.5, 1.0, 3.5))
        if target is not None:
            d = unit(lerp(d, unit(sub(target, base)), 0.35))
        q = add(base, mul(d, lens[0]))
        self.bones.append((base, q, r0 * 1.25, r0 * 1.05, unit(sub(mul(d, dot(d, across)), across)), False))
        self.web = (lerp(base, q, 0.55), q, FINGERS[0][0])
        if target is not None:
            # the last two bones reach for the target, the joint between them bowed away from the palm
            pole = unit(sub(mul(d, dot(d, across)), across))
            j, end = ik(q, target, lens[1], lens[2], pole)
            pts = [q, j, end]
        else:
            pts, p, back = [q], q, None
            for L, b in zip(lens[1:], (b1, b2)):
                d = mv(rot(unit(cross(d, across)), b), d)
                p = add(p, mul(d, L))
                pts.append(p)
        for i in (1, 2):
            a_, b_ = pts[i - 1], pts[i]
            dd = unit(sub(b_, a_))
            back = unit(sub(mul(dd, dot(dd, across)), across))
            self.bones.append((a_, b_, r0 + (r1 - r0) * i / 3, r0 + (r1 - r0) * (i + 1) / 3, back, i == 2))
        self.tips = [b[1] for b in self.bones if b[5]]

    def palm(self):
        """The palm: a loft from the wrist to the knuckles, the ball of the thumb on its -x side."""
        rows, at, centers = [], [], []
        ang = [i * 10.0 for i in range(37)]
        for y in (0.0, 3.0, 9.0, 17.0, 25.0, 32.0, 37.0, 40.0, 42.5, 44.0):
            W = 12.5 + 5.5 * smooth(0, 30, y) - 3.0 * smooth(38, 44, y)
            zf, zb = 6.5 - 1.5 * y / 44, 6.0 - 1.0 * y / 44
            if y >= 42:
                zf, zb = zf * 0.6, zb * 0.6
            row = []
            for x, z in section(W, zf, -zb, 0.55, ang):
                yy = y - (x + 12) * 0.16 * smooth(30, 44, y)           # the knuckles slant: the little finger's lower
                th = 4.5 * bell((x + 9) / 9) * bell((y - 16) / 13) if z > 0 else 0.0     # the ball of the thumb
                row.append((x, yy, z + th))
            rows.append(row)
            at.append([(p[0], p[1], p[2]) for p in row])
            centers.append((0.0, y, 0.0))
        return grid(rows, at, centers)

    def meshes(self):
        """[(mesh, part)], part 'palm', 'finger' or 'tip' (a last bone: its nail is painted on by the skin's tex)."""
        out = [(self.palm(), 'palm')]
        # the web of skin from the thumb's root to the index's knuckle
        m0, m1, idx = self.web
        k = add(idx, (1.0, -3.0, 0.5))
        out.append((tube([m0, lerp(m1, k, 0.5), k], lambda u, ang: 4.6 - 1.0 * u, n=10, up=(0, 0, 1),
                         squash=lambda u: 0.6, attr=lambda u, ang, p: p), 'palm'))
        for a, b, ra, rb, back, tip in self.bones:
            L = math.dist(a, b)
            out.append((tube([a, b], lambda u, ang, ra=ra, rb=rb: ra + (rb - ra) * u, n=10, up=back,
                             attr=lambda u, ang, p, t=tip, L=L: (u, ang, 1.0 if t else 0.0, L)), 'tip' if tip else 'finger'))
        return out


def mirrored(mesh):
    """A mesh mirrored in x (a left hand from a right one), its faces turned back the right way (attrs kept)."""
    return Mesh([(-v[0], v[1], v[2]) for v in mesh.verts], [(i, k, j) for i, j, k in mesh.tris], mesh.attrs,
                mesh.smooth)
