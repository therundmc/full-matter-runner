"""Street fauna (systems/Critters.js, drawn by render/CritterArt.js): pigeons, rats and the cat, at FINE
density like the people, facing +x, a frame for each step of their few gaits. Real size times BODY_SCALE (1.3, the
people's), so that they sit right beside them: a pigeon 32 cm, a rat 20 cm and its 18 cm tail, the cat 46 cm and its
25 cm tail. Each is built of rounded parts measured in cm, lit by the slope of the whole as the torsos are
(relief_paint)."""
import math
import random

from .core import Batch, Cv, dk, FINE, hx, LX, LY, LZ, mix, OUTLINE, ramp, shift, tone, VNoise


CRIT_CM = 32 * 1.3 * FINE / 100.0   # sprite px per cm


class Beast:
    """An animal from above: rounded parts (height fields, cm about its middle, which lies on the pixel (ox, oy) of a
    w x h canvas). A pixel belongs to the highest part over it and is lit by the slope of the whole."""

    def __init__(self, w, h, ox, oy):
        self.w, self.h, self.ox, self.oy = w, h, ox, oy
        self.parts = []

    def ell(self, name, cx, cy, rx, ry, hz, z=0.0, ang=0.0, p=2.0):
        """A half ellipsoid standing z cm off the floor; colour gets (u, v): cm from its middle along / across it."""
        ca, sa = math.cos(ang), math.sin(ang)

        def f(x, y):
            dx, dy = x - cx, y - cy
            u, v = dx * ca + dy * sa, -dx * sa + dy * ca
            e = (abs(u) / rx) ** p + (abs(v) / ry) ** p
            return (z + hz * math.sqrt(1.0 - e), u, v) if e < 1.0 else None
        self.parts.append((name, f))

    def tube(self, name, pts, r0, r1, hz, z=0.0, flip=False):
        """A round tube along pts (a tail, a leg, a wing) from r0 to r1 cm thick; colour gets (s, d): the share of its
        length from the first point, and the signed cm from its line (> 0 on its left, toward -y going along +x; on
        its right with flip, for the other one of a pair)."""
        sgn = 1 if flip else -1
        segs, total = [], 0.0
        for (ax, ay), (bx, by) in zip(pts, pts[1:]):
            ln = math.hypot(bx - ax, by - ay) or 1e-9
            segs.append((ax, ay, bx - ax, by - ay, ln, total))
            total += ln

        def f(x, y):
            best = None
            for ax, ay, dx, dy, ln, s0 in segs:
                t = max(0.0, min(1.0, ((x - ax) * dx + (y - ay) * dy) / (ln * ln)))
                d = math.hypot(x - ax - dx * t, y - ay - dy * t)
                if best is None or d < best[0]:
                    best = (d, (s0 + t * ln) / total, ((x - ax) * dy - (y - ay) * dx) / ln)
            d, s, side = best
            r = r0 + (r1 - r0) * s
            return (z + hz * (r / r0) * math.sqrt(1.0 - (d / r) ** 2), s, sgn * side) if d < r else None
        self.parts.append((name, f))

    def paint(self, colour, seed):
        """colour(name, a, b, L, X, Y) -> rgba or None (a, b: the part's own coordinates, X, Y: cm about the middle)."""
        cv = Cv(self.w, self.h, 1)
        H, Q = {}, {}
        for y in range(self.h):
            for x in range(self.w):
                X, Y = (x + 0.5 - self.ox) / CRIT_CM, (y + 0.5 - self.oy) / CRIT_CM
                best = None
                for name, f in self.parts:
                    r = f(X, Y)
                    if r and (best is None or r[0] > best[1][0]):
                        best = (name, r)
                if best:
                    H[(x, y)], Q[(x, y)] = best[1][0], best
        Ls = {}
        for (x, y), h in H.items():
            # (slopes eased: at this size a steep one breaks a part into bands of tone)
            gx = (H.get((x + 1, y), 0.0) - H.get((x - 1, y), 0.0)) * 0.4 * CRIT_CM
            gy = (H.get((x, y + 1), 0.0) - H.get((x, y - 1), 0.0)) * 0.4 * CRIT_CM
            L = max(0.0, (-gx * LX - gy * LY + LZ) / math.sqrt(gx * gx + gy * gy + 1.0))
            name, (_, a, b) = Q[(x, y)]
            # in the shade of a higher part on the side of the light
            for q in ((x - 1, y), (x, y - 1), (x - 1, y - 1)):
                if q in Q and Q[q][0] != name and H[q] - h > 0.9:
                    L *= 0.62
                    break
            Ls[(x, y)] = L
            c = colour(name, a, b, L, (x + 0.5 - self.ox) / CRIT_CM, (y + 0.5 - self.oy) / CRIT_CM)
            # right under the edge of a part well above it, or of a head: a dark seam
            if c is not None and any(q in Q and Q[q][0] != name and H[q] > h and (H[q] - h > 1.6 or Q[q][0] == 'head')
                                     and name not in ('muzzle', 'beak', 'ear') for q in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1))):
                c = dk(c, 0.42)
            if c is not None:
                cv.p[x, y] = c
        rng = random.Random(seed)
        n = VNoise(self.w, self.h, 4, rng)
        for (x, y) in H:
            c = cv.p[x, y]
            if c[3]:
                cv.p[x, y] = shift(c, int(round((n(x, y) - 0.5) * 6)) + rng.randint(-1, 1))
        # the ink, softened to a deep shade of the fur along the side toward the light
        add = []
        for (x, y) in H:
            if not cv.p[x, y][3]:
                continue
            for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                q = (x + dx, y + dy)
                if cv.pok(*q) and cv.p[q][3] < 100:
                    add.append((q, dk(cv.p[x, y], 0.62) if Ls[(x, y)] > 0.8 and dx + dy < 0 else OUTLINE))
        for q, c in add:
            if cv.p[q][3] < 100 or c == OUTLINE:
                cv.p[q] = c
        return cv

    def at(self, X, Y):
        """The pixel under the point (X, Y) cm."""
        return int(math.floor(self.ox + X * CRIT_CM)), int(math.floor(self.oy + Y * CRIT_CM))

    def dot(self, cv, X, Y, c):
        x, y = self.at(X, Y)
        if cv.pok(x, y) and cv.p[x, y][3]:
            cv.p[x, y] = c


# ---- the pigeon: blue-grey, two black bars on each wing, a pale rump, a green and purple sheen on the neck

PIG = ramp('#8a92a4', 0.5, 0.25, 0.3)
PIG_WING = ramp('#9ca4b4', 0.5, 0.25, 0.28)
PIG_DARK = ramp('#3e4250', 0.45, 0.22, 0.3)
PIG_HEAD = ramp('#646a82', 0.45, 0.22, 0.38)
PIG_PALE = ramp('#b8bec9', 0.42, 0.2, 0.25)
PIG_GREEN = ramp('#2fa078', 0.5, 0.25, 0.35)
PIG_PURPLE = ramp('#9a4a9a', 0.5, 0.25, 0.35)
PIG_SHEEN = tuple(mix(g, p, 0.5) for g, p in zip(PIG_GREEN, PIG_PURPLE))
PIG_FOOT = ramp('#d8848c', 0.45, 0.22, 0.25)
PIG_BEAK = hx('#2c2a32')
PIG_CERE = hx('#e6e2da')
PIG_EYE = hx('#c8501c')
PIG_BLOOD = hx('#7a1010')


def pig_colour(name, a, b, L, X, Y):
    if name == 'tail':
        return tone(PIG_DARK if a < -2.6 else PIG, L)               # the black band at its end
    if name == 'rump':
        return tone(PIG_PALE, L)
    if name == 'body':
        return tone(PIG, L)
    if name == 'wing':                                               # folded over the back
        if a < -5.6:
            return tone(PIG_DARK, L, 1)                              # the flight feathers, crossed over the rump
        if abs(b) < 3.0 and (-1.6 < a < -0.4 or -4.0 < a < -2.8):
            return tone(PIG_DARK, L)                                 # the two bars
        return tone(PIG_WING, L)
    if name in ('inner', 'outer'):                                   # spread: a along it from the body, b ahead of it
        if name == 'outer' and (a > 0.45 or b < -2.0):
            return tone(PIG_DARK, L, 1 if a > 0.7 else 0)            # the flight feathers, dark toward the tip
        if name == 'inner' and (-1.8 < b < -0.9 or -3.6 < b < -2.7) and a < 0.85:
            return tone(PIG_DARK, L)                                 # the two bars, along the wing
        if b < -4.2:
            return tone(PIG_DARK, L, 1)                              # its trailing edge
        return tone(PIG_WING, L)
    if name == 'neck':
        # the sheen turns from purple in the shade to green where the light catches it
        return tone(PIG_GREEN if L > 0.8 else PIG_SHEEN if L > 0.6 else PIG_PURPLE, L)
    if name == 'head':
        return tone(PIG_HEAD, L)
    if name == 'beak':
        return PIG_CERE if a < -0.4 else PIG_BEAK
    if name == 'foot':
        return tone(PIG_FOOT, L)
    if name == 'feather':
        return tone(PIG_DARK, L) if a < -0.6 else tone(PIG_PALE, L)  # its quill
    if name == 'belly':
        return tone(PIG_PALE, L)
    return None


def pig_head(b, cx, cy, z, r=2.7, ang=0.0):
    """Head and beak, (cx, cy) its middle, turned by ang; returns where its eyes are, either side."""
    ca, sa = math.cos(ang), math.sin(ang)
    b.ell('head', cx, cy, r, r * 0.86, 2.2, z=z, ang=ang)
    b.ell('beak', cx + ca * (r + 0.9), cy + sa * (r + 0.9), 1.5, 0.6, 0.5, z=z + 0.4, ang=ang)
    return [(cx + ca * 0.3 - sa * s * r * 0.62, cy + sa * 0.3 + ca * s * r * 0.62) for s in (-1, 1)]


def pigeon(head=0.0, peck=False, feet=()):
    """On the ground: head = cm the head is thrust forward (its bob as it walks), peck = head down to the ground,
    feet = the pink toes showing under the breast. 32 x 24 px (16 x 12 world px)."""
    b = Beast(32, 24, 15, 12)
    b.ell('tail', -11.4, 0, 4.6, 2.4, 1.0, z=0.8)
    b.ell('body', 0.0, 0, 7.6, 6.2, 3.6, z=1.0)
    for s in (-1, 1):
        b.ell('wing', -2.4, s * 2.6, 7.2, 3.6, 2.0, z=3.0, ang=-s * 0.1)
    for fx, fy in feet:
        b.ell('foot', fx, fy, 1.6, 0.8, 0.4)
    if peck:
        b.tube('neck', [(5.4, 0), (10.0, 0)], 3.4, 2.4, 2.0, z=1.2)
        eyes = pig_head(b, 11.8, 0, 0.2, r=2.6)
    else:
        b.ell('neck', 6.2 + head * 0.4, 0, 2.6, 3.6, 2.8, z=1.8)
        eyes = pig_head(b, 9.8 + head, 0, 3.6, r=3.2)
    cv = b.paint(pig_colour, 41 + int(head * 10) + len(feet) * 3 + peck)
    b.dot(cv, *eyes[0], PIG_EYE)                                     # the eye on the side of the light
    return cv


def pigeon_fly(k):
    """On the wing, from above: k 0 wings up (seen short), 1 level (the whole span, 65 cm), 2 down and forward.
    32 x 56 px (16 x 28 world px)."""
    b = Beast(32, 56, 16, 28)
    span, sweep = (0.56, 1.0, 0.8)[k], (-3.4, -1.4, 1.2)[k]
    b.ell('tail', -11.2, 0, 5.0, 3.8, 0.8, z=0.8)                    # fanned
    b.ell('rump', -6.0, 0, 3.6, 3.2, 2.2, z=1.0)
    b.ell('body', 0.8, 0, 7.0, 4.8, 3.4, z=1.0)
    b.ell('neck', 5.8, 0, 3.2, 3.4, 3.0, z=2.0)
    eyes = pig_head(b, 9.2, 0, 3.4, r=2.5)
    for s in (-1, 1):
        wrist, tip = (0.4 + sweep * 0.4, s * (3.6 + 12.5 * span)), (-4.6 + sweep, s * (3.6 + 27.0 * span))
        b.tube('inner', [(1.0, s * 2.8), wrist], 5.6, 4.8, 1.2, z=3.2, flip=s > 0)
        b.tube('outer', [wrist, tip], 4.8, 1.4, 1.0, z=3.0, flip=s > 0)
    cv = b.paint(pig_colour, 61 + k)
    for X, Y in eyes:
        b.dot(cv, X, Y, PIG_EYE)
    return cv


def pigeon_dead():
    """Dead on its side, its breast toward +y: a wing flung out, its pink feet curled, a few feathers about it.
    32 x 24 px (16 x 12 world px)."""
    b = Beast(32, 24, 16, 12)
    b.ell('tail', -11.0, 1.2, 4.6, 2.2, 0.8, z=0.4, ang=0.12)
    b.ell('body', -0.4, 0.8, 7.8, 4.4, 3.0, z=0.6)
    b.ell('belly', 0.6, 3.2, 6.0, 1.8, 1.2, z=1.6)
    b.ell('neck', 6.2, 1.6, 3.0, 3.0, 2.6, z=0.8, ang=0.3)
    eyes = pig_head(b, 9.6, 3.4, 0.8, r=2.4, ang=0.9)               # the head fallen back
    b.tube('inner', [(1.0, -2.0), (-1.6, -8.6)], 4.6, 4.2, 1.0, z=2.4)
    b.tube('outer', [(-1.6, -8.6), (-8.6, -11.8)], 4.2, 1.4, 0.8, z=2.2)
    for fx in (-0.6, 2.2):
        b.tube('foot', [(fx, 4.8), (fx + 0.8, 7.4), (fx + 2.0, 7.8)], 0.55, 0.45, 0.4)
    for X, Y, a in ((-10.8, -5.6, 0.5), (8.2, -6.6, -0.9), (-14.6, 6.8, 2.2), (12.6, 8.0, 0.3)):
        b.ell('feather', X, Y, 1.9, 0.7, 0.3, ang=a)
    cv = b.paint(pig_colour, 77)
    b.dot(cv, *eyes[1], PIG_BEAK)                                     # shut
    for X, Y in ((7.0, 3.4), (7.8, 2.6), (6.2, 4.0)):
        b.dot(cv, X, Y, PIG_BLOOD)
    return cv


# ---- the rat: brown-grey, a darker line down its back, pink ears, feet and tail

RAT = ramp('#86705e', 0.5, 0.26, 0.38)
RAT_BACK = ramp('#5a4a40', 0.5, 0.26, 0.3)
RAT_BELLY = ramp('#a69284', 0.45, 0.22, 0.25)
RAT_TAIL = ramp('#b88a88', 0.45, 0.22, 0.25)
RAT_PINK = ramp('#d49a96', 0.45, 0.22, 0.25)
RAT_EYE = hx('#0c0a10')
RAT_NOSE = hx('#e8a8a8')


def rat_colour(name, a, b, L, X, Y):
    if name in ('haunch', 'back', 'head'):
        return tone(RAT_BACK if abs(b) < 0.8 and name != 'head' else RAT, L)   # the darker line down its spine
    if name == 'snout':
        return tone(RAT, L, 1) if a < 0.6 else tone(RAT_PINK, L)
    if name == 'ear':
        return tone(RAT_PINK, L) if a > -0.2 else tone(RAT_PINK, L, -1)
    if name == 'tail':
        return tone(RAT_TAIL, L, -1 if a < 0.15 else 0)
    if name == 'paw':
        return tone(RAT_PINK, L)
    if name == 'belly':
        return tone(RAT_BELLY, L) if abs(b) < 2.2 else tone(RAT, L)
    return None


def rat(k=1, idle=False):
    """Running, k: 0 stretched out, 1 between, 2 bunched up, its hind feet by its front feet; idle: crouched, head up.
    40 x 16 px (20 x 8 world px), the middle of its body (not of its tail) on the middle of the canvas."""
    b = Beast(40, 16, 20, 8)
    st, wd, arch = ((1.16, 0.88, 0.0), (1.0, 1.0, 0.3), (0.84, 1.12, 0.8))[k]
    if idle:
        st, wd, arch = 0.9, 1.1, 0.6
    hx_ = 6.8 * st
    b.ell('haunch', -4.0 * st, 0, 5.6 * st, 3.9 * wd, 2.6 + arch, z=0.6)
    b.ell('back', 1.6 * st, 0, 5.2 * st, 3.2 * wd, 2.4 + arch * 0.6, z=0.6)
    b.ell('head', hx_, 0, 3.2, 2.2, 2.0, z=0.8)
    b.ell('snout', hx_ + 2.7, 0, 1.6, 1.1, 1.4, z=0.8)
    for s in (-1, 1):
        b.ell('ear', hx_ - 1.0, s * 2.0, 1.0, 1.0, 1.2, z=2.0)
    feet = (((8.2, 2.2), (-11.0, 2.6)), ((5.6, 2.8), (-5.4, 3.8)), ((3.4, 2.8), (0.8, 4.2)))[k]
    if idle:
        feet = ((5.4, 2.4), (-3.0, 3.8))
    for (fx, fy), r in zip(feet, (0.9, 1.3)):
        for s in (-1, 1):
            b.ell('paw', fx, s * fy, r, 0.6, 0.4)
    # the tail from the base of its back, whipping from side to side as it runs
    sw = 1.2 if idle else (-1.6, 0.6, 2.0)[k]
    t0 = -9.4 * st
    b.tube('tail', [(t0, 0), (t0 - 6, sw * 0.6), (t0 - 12, sw * 1.4), (t0 - 18, sw * 0.4 - (1.4 if idle else 0))],
           0.8, 0.4, 0.6, z=0.2)
    cv = b.paint(rat_colour, 90 + k + idle * 5)
    for s in (-1, 1):
        b.dot(cv, hx_ + 1.0, s * 1.3, RAT_EYE)
    b.dot(cv, hx_ + 4.0, 0, RAT_NOSE)
    return cv


def rat_dead():
    """Dead on its back, its pale belly up, the four pink feet curled in the air, the tail in a loop. 40 x 16 px."""
    b = Beast(40, 16, 20, 7)
    b.ell('belly', -0.8, 0, 8.4, 3.4, 2.6, z=0.4)
    b.ell('head', 7.8, 0.4, 3.0, 2.2, 1.8, z=0.4, ang=0.15)
    b.ell('snout', 10.4, 0.8, 1.5, 1.0, 1.2, z=0.4, ang=0.15)
    for (x0, y0, x1, y1) in ((4.2, -2.6, 5.8, -4.6), (4.6, 2.6, 6.4, 4.4), (-4.8, -2.8, -3.6, -5.2), (-5.2, 2.8, -4.4, 5.0)):
        b.tube('paw', [(x0, y0), (x1, y1)], 0.75, 0.6, 0.8, z=1.4)
    pts = [(-8.8, 0.4)] + [(-14.0 + 3.8 * math.cos(a), 3.0 + 3.8 * math.sin(a))
                           for a in (math.radians(d) for d in range(-110, 200, 30))]
    b.tube('tail', pts, 0.9, 0.4, 0.5, z=0.2)
    cv = b.paint(rat_colour, 97)
    b.dot(cv, 11.6, 0.8, RAT_NOSE)
    for X, Y in ((8.6, -1.2), (3.0, 0.4), (2.4, 1.0)):
        b.dot(cv, X, Y, PIG_BLOOD)
    return cv


# ---- the cat: a ginger street tabby, its stripes across the back and rings round the tail, a cream muzzle, bib
# and paws (it reads on the dark asphalt), eyes that catch the light

CAT = ramp('#d48238', 0.5, 0.26, 0.3)
CAT_STRIPE = ramp('#9a521e', 0.5, 0.26, 0.3)
CAT_CREAM = ramp('#eee2cc', 0.42, 0.2, 0.2)
CAT_EAR = ramp('#c8786e', 0.45, 0.22, 0.25)
CAT_EYE = hx('#d4f06a')
CAT_NOSE = hx('#d47c80')
CAT_W, CAT_H, CAT_O = 66, 30, (38, 15)   # 33 x 15 world px; the middle of its body (not of its tail) on (19, 7.5)


def cat_colour(bib=False, flank=False):
    def colour(name, a, b, L, X, Y):
        if bib and name == 'hips':                                   # sitting: stripes round the haunches
            r = math.hypot(a, b)
            return tone(CAT_STRIPE if (abs(b) < 0.7 and a < 0) or (r > 3.6 and math.sin(math.atan2(b, a) * 5) > 0.75) else CAT, L)
        if name in ('hips', 'chest', 'neck'):
            if bib and name == 'chest' and a > 0.8 and abs(b) < 3.8:
                return tone(CAT_CREAM, L)                            # its chest, under the chin
            if abs(b) < 0.8 and name != 'neck':
                return tone(CAT_STRIPE, L)                           # the line down its spine
            w = (X + 0.16 * b * b) * 2 * math.pi / 5.0 + 0.6 * math.sin(Y * 0.9)   # bent back down the flanks
            return tone(CAT_STRIPE if math.sin(w) > 0.55 and abs(b) > 1.4 else CAT, L)
        if name == 'flank':                                          # lying on its side: the cream belly along +y
            if b > 3.0:
                return tone(CAT_CREAM, L)
            w = X * 2 * math.pi / 4.6 + 0.5 * math.sin(Y * 0.8)
            return tone(CAT_STRIPE if math.sin(w) > 0.45 and b < 1.6 or b < -5.0 else CAT, L)
        if name == 'head':
            if -3.4 < a < 0.6 and min(abs(b), abs(abs(b) - 1.7)) < 0.32 and not flank:
                return tone(CAT_STRIPE, L)                           # the M on its forehead
            return tone(CAT, L)
        if name == 'muzzle':
            return tone(CAT_CREAM, L)
        if name == 'ear':
            return tone(CAT_EAR, L) if a > 0.5 else tone(CAT, L, -1)
        if name == 'leg':
            return tone(CAT_CREAM, L) if a > 0.74 else tone(CAT, L, -1 if b < 0 else 0)
        if name == 'paw':
            return tone(CAT_CREAM, L)
        if name == 'tail':
            if a > 0.88 or (a * 7.5) % 1.0 < 0.34:
                return tone(CAT_STRIPE, L)                           # the rings, its tip dark
            return tone(CAT, L)
        return None
    return colour


def cat_head(b, hx_, hy, ang, z, r=1.0, ears_back=False):
    """Head, muzzle and ears facing ang, (hx_, hy) its middle; returns where its eyes are."""
    ca, sa = math.cos(ang), math.sin(ang)
    at = lambda u, v: (hx_ + u * ca - v * sa, hy + u * sa + v * ca)
    b.ell('head', hx_, hy, 4.4 * r, 4.9 * r, 3.0, z=z, ang=ang)
    b.ell('muzzle', *at(3.9 * r, 0), 1.9, 2.3, 1.4, z=z + 0.8, ang=ang)
    for s in (-1, 1):
        if ears_back:   # flat back along the skull
            b.ell('ear', *at(-2.2 * r, s * 3.6 * r), 2.0, 1.2, 1.0, z=z + 2.4, ang=ang + s * 0.4, p=1.3)
        else:
            b.ell('ear', *at(-0.5 * r, s * 4.4 * r), 2.4, 1.9, 2.0, z=z + 2.8, ang=ang - s * 0.55, p=1.2)
    return [at(3.0 * r, s * 2.0 * r) for s in (-1, 1)], at(5.6 * r, 0)


def cat(hip, chest, head, paws, tail, w=1.0, lift=0.0, ang=0.0, ears_back=False, seed=0):
    """A cat standing, walking or running: hip, chest = middles of its haunches and ribs, head = (x, y), paws =
    [(from, to)] legs from under its body to the paw, tail = the points of its tail from its root."""
    b = Beast(CAT_W, CAT_H, *CAT_O)
    zb = 1.0 + lift
    for p0, p1 in paws:
        b.tube('leg', [p0, p1], 1.5, 1.3, 1.0, z=0.4)
    b.tube('tail', tail, 1.8, 1.4, 1.4, z=zb * 0.6)
    dx, dy = chest[0] - hip[0], chest[1] - hip[1]
    b.ell('hips', (hip[0] + chest[0]) / 2, (hip[1] + chest[1]) / 2, math.hypot(dx, dy) / 2 + 7.4, 5.9 * w, 4.4, z=zb,
          ang=math.atan2(dy, dx))                                    # one long back, from the haunches to the shoulders
    eyes, nose = cat_head(b, head[0] + 0.4, head[1], ang, zb + 2.2, r=1.1, ears_back=ears_back)
    cv = b.paint(cat_colour(), 120 + seed)
    for X, Y in eyes:
        b.dot(cv, X, Y, CAT_EYE)
    b.dot(cv, *nose, CAT_NOSE)
    return cv


def legs(front, hind, fx=7.0, hx_=-11.0):
    """Four legs from under the shoulders (fx) and the hips (hx_) to the paws given."""
    return [((fx, math.copysign(2.6, y)), (x, y)) for x, y in front] + \
           [((hx_, math.copysign(3.0, y)), (x, y)) for x, y in hind]


def cat_walk(f):
    """Walking, f 0..3: a diagonal pair of paws forward, then passing, then the other pair; it sways."""
    sw = (1, 0, -1, 0)[f]
    front = [(9.0 + 3.6 * sw, -4.6), (9.0 - 3.6 * sw, 4.6)]
    hind = [(-12.0 - 3.4 * sw, -4.8), (-12.0 + 3.4 * sw, 4.8)]
    tail = [(-16.0, 0), (-21.0, sw * 0.8), (-26.0, sw * 2.0 + 1.0), (-29.0, sw * 2.4 + 3.2)]   # carried up, a hook at its end
    return cat((-9.0, sw * 0.4), (4.0, -sw * 0.3), (15.5, 0), legs(front, hind), tail, ang=-sw * 0.05, seed=f)


def cat_run(k):
    """Bolting, k: 0 stretched out (front paws far ahead, hind far back), 1 between, 2 gathered (the hind paws
    landing outside and ahead of the front ones, its back arched)."""
    if k == 0:
        return cat((-12.0, 0), (5.0, 0), (18.5, 0), legs([(24.0, -2.2), (22.0, 2.6)], [(-25.0, -2.4), (-23.0, 2.8)], 8.0, -14.0),
                   [(-19.0, 0), (-30.0, 0.4), (-40.0, 1.2)], w=0.86, seed=10)
    if k == 1:
        return cat((-9.0, 0), (4.0, 0), (15.5, 0), legs([(14.0, -3.8), (11.0, 4.0)], [(-17.0, -4.6), (-15.0, 4.8)]),
                   [(-16.0, 0), (-27.0, -0.8), (-37.0, -1.4)], seed=11)
    return cat((-6.0, 0), (3.0, 0), (13.5, 0), legs([(0.0, -4.0), (2.0, 4.2)], [(5.0, -6.6), (6.5, 6.4)], 6.0, -8.0),
               [(-13.0, 0), (-24.0, 0.8), (-34.0, 2.2)], w=1.12, lift=1.0, seed=12)


def cat_low():
    """Crouched low, slinking under a car: flattened and wider, elbows out, ears laid back, its tail low."""
    return cat((-9.0, 0), (5.0, 0), (17.0, 0), legs([(13.0, -6.4), (15.0, 6.2)], [(-14.0, -6.6), (-12.0, 6.8)]),
               [(-16.0, 0), (-27.0, 0.6), (-38.0, 0.2)], w=1.16, lift=-0.8, ears_back=True, seed=20)


def cat_sit():
    """Sitting, watching: round haunches, the chest up, the head up over the front paws, the tail wrapped round."""
    b = Beast(CAT_W, CAT_H, *CAT_O)
    pts = [(-2.0 + 8.8 * math.cos(math.radians(d)), 8.8 * math.sin(math.radians(d))) for d in (185, 160, 135, 110, 85, 62, 42)]
    b.tube('tail', pts, 1.8, 1.5, 1.2, z=0.2)
    for s in (-1, 1):
        b.ell('paw', 11.8, s * 2.4, 1.9, 1.4, 1.0, z=0.4)
    b.ell('hips', -4.0, 0, 6.0, 6.6, 4.4, z=1.0)
    b.ell('chest', 1.8, 0, 4.6, 4.8, 4.6, z=2.6)
    eyes, nose = cat_head(b, 7.0, 0, 0.0, 6.8, r=1.24)                # the head up, near the eye
    cv = b.paint(cat_colour(bib=True), 130)
    for X, Y in eyes:
        b.dot(cv, X, Y, CAT_EYE)
    b.dot(cv, *nose, CAT_NOSE)
    return cv


def cat_dead():
    """Dead on its side, its back toward -y, the legs stretched out from its cream belly, the tail limp."""
    b = Beast(CAT_W, CAT_H, *CAT_O)
    for p0, p1 in (((10.0, 3.0), (15.0, 11.0)), ((7.0, 3.5), (9.5, 11.5)), ((-9.0, 3.5), (-13.5, 11.0)), ((-12.0, 3.0), (-18.0, 9.6))):
        b.tube('leg', [p0, p1], 1.5, 1.2, 1.0, z=0.2)
    b.tube('tail', [(-15.0, -2.0), (-25.0, -3.4), (-34.0, -1.0), (-39.0, 3.4)], 1.7, 1.4, 1.2, z=0.2)
    b.ell('flank', 0.0, -1.0, 16.0, 6.0, 4.0, z=0.4)
    b.ell('head', 19.6, -0.6, 5.0, 4.4, 3.2, z=0.4, ang=0.1)
    b.ell('muzzle', 24.0, 1.0, 2.2, 2.0, 1.4, z=1.0, ang=0.3)
    b.ell('ear', 19.4, -4.8, 2.0, 1.5, 1.4, z=1.6, ang=-1.3, p=1.3)
    cv = b.paint(cat_colour(flank=True), 140)
    for X, Y in ((21.0, -1.4), (22.0, -1.2)):
        b.dot(cv, X, Y, CAT_STRIPE[0])                               # its eye, shut
    b.dot(cv, 25.8, 1.2, CAT_NOSE)
    for X, Y in ((23.0, 3.4), (24.2, 3.8), (21.6, 4.0), (16.0, 2.2)):
        b.dot(cv, X, Y, PIG_BLOOD)
    return cv


def critters():
    """The frames of the street fauna by name (critters/<name>.png)."""
    out = dict(pigeon_idle=pigeon(), pigeon_peck=pigeon(peck=True))
    for i, (head, feet) in enumerate([(2.0, [(5.4, -5.0)]), (0.6, []), (-0.8, [(5.4, 5.0)])]):
        out['pigeon_walk%d' % i] = pigeon(head, feet=feet)
    for k in range(3):
        out['pigeon_fly%d' % k] = pigeon_fly(k)
    out['pigeon_dead'] = pigeon_dead()
    out['rat_idle'] = rat(idle=True)
    for k in range(3):
        out['rat_run%d' % k] = rat(k)
    out['rat_dead'] = rat_dead()
    out['cat_sit'] = cat_sit()
    for f in range(4):
        out['cat_walk%d' % f] = cat_walk(f)
    for k in range(3):
        out['cat_run%d' % k] = cat_run(k)
    out['cat_low'] = cat_low()
    out['cat_dead'] = cat_dead()
    return out


CRITTERS = Batch(critters)
GROUP = 'critters'
SPRITES = {
    'pigeon_idle': (CRITTERS('pigeon_idle'), (16, 12), 'dense req'),
    'pigeon_peck': (CRITTERS('pigeon_peck'), (16, 12), 'dense req'),
    'pigeon_dead': (CRITTERS('pigeon_dead'), (16, 12), 'dense req'),
    'rat_idle': (CRITTERS('rat_idle'), (20, 8), 'dense req'),
    'rat_dead': (CRITTERS('rat_dead'), (20, 8), 'dense req'),
    'cat_sit': (CRITTERS('cat_sit'), (33, 15), 'dense req'),
    'cat_low': (CRITTERS('cat_low'), (33, 15), 'dense req'),
    'cat_dead': (CRITTERS('cat_dead'), (33, 15), 'dense req'),
    'pigeon_walk0': (CRITTERS('pigeon_walk0'), (16, 12), 'dense req'),
    'pigeon_walk1': (CRITTERS('pigeon_walk1'), (16, 12), 'dense req'),
    'pigeon_walk2': (CRITTERS('pigeon_walk2'), (16, 12), 'dense req'),
    'pigeon_fly0': (CRITTERS('pigeon_fly0'), (16, 28), 'dense req'),
    'pigeon_fly1': (CRITTERS('pigeon_fly1'), (16, 28), 'dense req'),
    'pigeon_fly2': (CRITTERS('pigeon_fly2'), (16, 28), 'dense req'),
    'rat_run0': (CRITTERS('rat_run0'), (20, 8), 'dense req'),
    'rat_run1': (CRITTERS('rat_run1'), (20, 8), 'dense req'),
    'rat_run2': (CRITTERS('rat_run2'), (20, 8), 'dense req'),
    'cat_run0': (CRITTERS('cat_run0'), (33, 15), 'dense req'),
    'cat_run1': (CRITTERS('cat_run1'), (33, 15), 'dense req'),
    'cat_run2': (CRITTERS('cat_run2'), (33, 15), 'dense req'),
    'cat_walk0': (CRITTERS('cat_walk0'), (33, 15), 'dense req'),
    'cat_walk1': (CRITTERS('cat_walk1'), (33, 15), 'dense req'),
    'cat_walk2': (CRITTERS('cat_walk2'), (33, 15), 'dense req'),
    'cat_walk3': (CRITTERS('cat_walk3'), (33, 15), 'dense req'),
}
