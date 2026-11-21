"""The vehicles (entities/Vehicle.js, VEHICLES: their sprite-space layout) and the pieces they lose, at FINE
density, each with its emissive map (lamps, dash)."""
import math
import random

from .core import CLEAR, Cv, dk, FINE, hx, light, lt, mix, OUTLINE, pal, px_paint, ramp, VNoise
from .palette import AMBER, CHROME, GLASS, HEAD_C, HEAD_GLOW, NEON_CYAN, RUBBER, TAIL_C, TAIL_GLOW


def plate(k, x, y0, y1):
    """A licence plate on the tail (2 world px deep, y0..y1): the bumper's dark recess, the plate, its embossed
    characters as dark dots."""
    for y in range(y0, y1 + 1):
        k.put(x, y, PLATE if y > y0 else RUBBER[1])
        k.put(x + 1, y, PLATE if y > y0 else RUBBER[1])
    for j in range((y0 + 1) * k.s + 1, (y1 + 1) * k.s - 1, 2):
        k.setp(x * k.s + 1, j, hx('#3a3a48'))


# --------------------------------------------------------------------------
# Vehicles (top-down, facing +x, real size at 1 m = 32 px): sedan 4.4 x 1.8 m (140 x 58), coupe 4.2 x 1.75 m
# (134 x 56), panel van 5.0 x 2.0 m (160 x 64). Only the mirrors use the outer 2 px on each side: the game's
# hitbox is the sprite minus 2 px all round. Glass, tank, hood, wheel and light positions are a contract with
# VEHICLES (src/game/entities/Vehicle.js) and LIGHTING.propLights (src/game/Config.js): keep them in sync.
# Tyres are drawn by the game under the body. Details are mirrored about the centre line.
# --------------------------------------------------------------------------


ROAD_DIRT = hx('#5e4c3a')
RUST = [hx('#4a2416'), hx('#7a3a1c'), hx('#a0582a')]
PLATE = hx('#d8d2b8')
SHEEN, NEON_SHEEN = hx('#8fd0ea'), hx('#ff7ab4')
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
    """One vehicle sprite + glow map at FINE density. The layout is given in world px (the 1 m = 32 px grid of the
    VEHICLES contract): an integer x or y names a world px, as on a plain sprite, and every primitive paints the pixels
    it covers. Rows are given on the top side (y < cy) and mirrored about the centre line."""

    def __init__(self, w, h, cy, seed):
        s = self.s = FINE
        self.cv, self.gl = Cv(w, h, s), Cv(w, h, s)
        self.cy = cy
        self.rng = random.Random(seed)
        self.mask, self.glass, self.half = set(), set(), {}

    # pixel <-> world: X, Y are the world px a pixel lies in, as a continuous value (pixel centre - 0.5)
    def X(self, i):
        return (i + 0.5) / self.s - 0.5

    def vj(self, j):
        """Signed distance of pixel row j from the centre line (world px)."""
        return (j + 0.5) / self.s - self.cy

    def mj(self, j):
        return 2 * self.cy * self.s - 1 - j

    def cols(self, x0, x1):
        return range(int(round(x0 * self.s)), int(round((x1 + 1) * self.s)))

    def top_rows(self, i, v0, v1):
        """Top-side pixel rows of column i whose |v| lies in (v0, v1]."""
        return [j for j in range(self.cy * self.s) if v0 < -self.vj(j) <= v1]

    def setp(self, i, j, c, both=True):
        """c: colour or fn(current, side) with side -1 on the top half, +1 on the bottom half."""
        for jj in ((j, self.mj(j)) if both else (j,)):
            if not self.cv.pok(i, jj):
                continue
            col = c(self.cv.p[i, jj], -1 if jj < self.cy * self.s else 1) if callable(c) else c
            if col is not None:
                self.cv.p[i, jj] = col

    def put(self, x, y, c, both=True):
        """A whole world px (and its mirror)."""
        s = self.s
        for j in range(int(y * s), int(y * s) + s):
            for i in range(int(x * s), int(x * s) + s):
                self.setp(i, j, c, both)

    def dot(self, x, y, c, both=True):
        """The single pixel under the world point (x, y)."""
        self.setp(int(math.floor(x * self.s)), int(math.floor(y * self.s)), c, both)

    def line(self, x0, y0, x1, y1, c, both=True, w=1):
        """A line w pixels wide through the middles of the world px (x0, y0) and (x1, y1)."""
        s = self.s
        a, b, e, f = (x0 + 0.5) * s, (y0 + 0.5) * s, (x1 + 0.5) * s, (y1 + 0.5) * s
        n = int(max(abs(e - a), abs(f - b))) + 1
        seen = set()
        for k in range(n + 1):
            px, py = a + (e - a) * k / n - 0.5, b + (f - b) * k / n - 0.5
            for d in range(w):
                p = (int(round(px)) + (d if abs(f - b) > abs(e - a) else 0), int(round(py)) + (0 if abs(f - b) > abs(e - a) else d))
                if p not in seen:
                    seen.add(p)
                    self.setp(p[0], p[1], c, both)

    def shell(self, body, x0, x1, hw, cr_rear, cr_front, nose=0, pinch=0.0, crown=3.0):
        """Body shell: rounded box (pinched toward the nose for a wedge), domed across, rolled at both ends."""
        for i in self.cols(x0, x1):
            x = self.X(i)
            u_r, u_f = x - x0, x1 - x
            h = hw - (pinch * ((x - (x1 - nose)) / nose) ** 2 if nose and x > x1 - nose else 0.0)
            self.half[i] = h
            cr = cr_rear if u_r < u_f else cr_front
            for j in range(self.cv.ph):
                v = self.vj(j)
                ex, ey = cr - min(u_r, u_f) - 0.5, abs(v) - (h - cr)
                if abs(v) > h or (ex > 0 and ey > 0 and ex * ex + ey * ey > cr * cr):
                    continue
                end = max(0.0, 1.0 - min(u_r, u_f) / 9.0) ** 1.5
                L = light((-end if u_r < u_f else end) * 0.8, math.copysign((abs(v) / h) ** crown, v) * 0.95) - v / h * 0.1
                self.cv.p[i, j] = soft(body, L)
                self.mask.add((i, j))

    def hw(self, x):
        """Half width of the shell at world x."""
        return self.half.get(int(round((x + 0.5) * self.s - 0.5)), 0.0)

    def panel(self, body, x0, x1, hw, r=3, crown=2.5, lift=0.0, rail=True):
        """Raised flat panel (roof): its own gentle dome, rounded corners, a lit drip rail along its edge."""
        for i in self.cols(x0, x1):
            x = self.X(i)
            for j in self.top_rows(i, -1, hw):
                ex, ey = r - min(x - x0, x1 - x) - 0.5, -self.vj(j) - (hw - r)
                if ex > 0 and ey > 0 and ex * ex + ey * ey > r * r:
                    continue
                for jj in (j, self.mj(j)):
                    v = self.vj(jj)
                    nv = math.copysign((abs(v) / hw) ** crown, v) * 0.7
                    c = soft(body, light(0.0, nv) + lift)
                    if rail and hw - abs(v) < 0.55:
                        c = lt(c, 0.18) if v < 0 else dk(c, 0.2)
                    self.cv.p[i, jj] = c

    def glass_col(self, x, y, x0, x1, h, sheen):
        """x, y: world (continuous); y is a pixel row's centre."""
        t = (y - self.cy + h) / (2 * h)
        c = pal(GLASS, 0.8 - t * 0.65 + (x - x0) / max(1, x1 - x0) * 0.1)
        if sheen is not None:   # one soft diagonal reflection (and a faint neon one)
            s = (x - x0) + (y - self.cy + h) * 0.6 - sheen
            if 0 <= s < 2.5:
                c = mix(c, SHEEN, 0.3 if s > 0.5 else 0.45)
            elif -1 <= s < 0 or 2.5 <= s < 3.5:
                c = mix(c, SHEEN, 0.12)
            elif 7 <= s < 8:
                c = mix(c, NEON_SHEEN, 0.14)
        return c

    def trap(self, x0, x1, hw0, hw1, sheen=None):
        """Windshield / rear window: trapezoid of glass, half width hw0 at x0 to hw1 at x1."""
        for i in self.cols(x0, x1):
            x = self.X(i)
            h = hw0 + (hw1 - hw0) * (x - x0) / max(1, x1 - x0)
            for j in self.top_rows(i, -1, h):
                for jj in (j, self.mj(j)):
                    self.cv.p[i, jj] = self.glass_col(x, (jj + 0.5) / self.s, x0, x1, h, sheen)
                    self.glass.add((i, jj))

    def side(self, x0, x1, inner, outer, pillars=()):
        """Side windows seen at a grazing angle between the roof (inner(x)) and the beltline (outer)."""
        for i in self.cols(x0, x1):
            x = self.X(i)
            if int(round(x)) in pillars:
                continue
            for j in self.top_rows(i, inner(x), outer):
                k = (-self.vj(j) - inner(x)) / max(0.5, outer - inner(x))
                self.cv.p[i, j] = pal(GLASS, 0.75 - k * 0.35)
                self.cv.p[i, self.mj(j)] = pal(GLASS, 0.3 - k * 0.25)
                self.glass |= {(i, j), (i, self.mj(j))}
        i = int((x0 + 3.5) * self.s)
        rows = self.top_rows(i, inner(x0 + 3), outer)
        for d in range(4):
            if rows:
                self.setp(i + d, rows[-1], lambda c, s: mix(c, SHEEN, 0.35 if s < 0 else 0.1))

    def inside(self, x0, y0, x1, y1, col, k=0.35, round_=False):
        """What is seen through the glass (seats, the dashboard, a thing left on it): the world rect x0..x1, y0..y1
        (any fraction of a px; an ellipse in it with round_), blended into the glass's pixels only, dim: it is night
        in there. Not mirrored."""
        s = self.s
        mx, my, rx, ry = (x0 + x1) / 2, (y0 + y1) / 2, (x1 - x0) / 2, (y1 - y0) / 2
        for j in range(int(y0 * s), int(math.ceil(y1 * s))):
            for i in range(int(x0 * s), int(math.ceil(x1 * s))):
                if (i, j) not in self.glass:
                    continue
                if round_ and (((i + 0.5) / s - mx) / rx) ** 2 + (((j + 0.5) / s - my) / ry) ** 2 > 1.0:
                    continue
                self.cv.p[i, j] = mix(self.cv.p[i, j], col, k)

    def wheel(self, x, y, r, col=None, k=0.4):
        """The steering wheel through the windshield: its rim and a spoke."""
        s, col = self.s, col or hx('#5c5864')
        for j in range(int((y - r - 1) * s), int((y + r + 1) * s)):
            for i in range(int((x - r - 1) * s), int((x + r + 1) * s)):
                d = math.hypot((i + 0.5) / s - x, (j + 0.5) / s - y)
                spoke = d < r and abs((j + 0.5) / s - y) < 0.3
                if (i, j) in self.glass and (abs(d - r) < 0.45 or spoke):
                    self.cv.p[i, j] = mix(self.cv.p[i, j], col, k)

    def film(self, x0, x1, pivots, r, k=0.11):
        """A windshield nobody washed: a film of road dust on the glass between x0 and x1, wiped clean in the arcs the
        blades sweep (pivots: their (x, y) feet, r: the blade's reach), a line of dirt pushed up at the end of each."""
        s = self.s
        for (i, j) in sorted(self.glass):
            x, y = (i + 0.5) / s, (j + 0.5) / s
            if not x0 <= x <= x1 + 1:
                continue
            d = min(math.hypot(x - px, y - py) for (px, py) in pivots)
            if d > r + 0.5:
                self.cv.p[i, j] = mix(self.cv.p[i, j], ROAD_DIRT, k * (0.6 + 0.8 * self.rng.random()))
            elif d > r - 0.5:
                self.cv.p[i, j] = mix(self.cv.p[i, j], ROAD_DIRT, k * 1.6)

    def dent(self, x, y, r):
        """A shallow dent in a panel: its upper left wall in shade, its lower right catching the light. Top side only."""
        s = self.s
        for j in range(int((y - r) * s), int((y + r) * s) + 1):
            for i in range(int((x - r) * s), int((x + r) * s) + 1):
                u, v = ((i + 0.5) / s - x) / r, ((j + 0.5) / s - y) / r
                d = math.hypot(u, v)
                if d >= 1.0 or (i, j) not in self.mask or (i, j) in self.glass:
                    continue
                t = (u + v) * 0.7 * (1.0 - d * d)
                self.cv.p[i, j] = lt(self.cv.p[i, j], 0.3 * t) if t > 0 else dk(self.cv.p[i, j], -0.4 * t)

    def seal(self):
        """Rubber seals: body pixels touching glass get darker."""
        edge = {(x + a, y + b) for (x, y) in self.glass for a, b in ((1, 0), (-1, 0), (0, 1), (0, -1))}
        for p in sorted(edge - self.glass):
            if p in self.mask:
                self.cv.p[p] = dk(self.cv.p[p], 0.42)

    def arches(self, wheels, r=11):
        """Fender lips over the wheels: a lit crest and the flare falling away into shadow."""
        for wx in wheels:
            for i in self.cols(wx - r, wx + r):
                x = self.X(i)
                crest = self.half.get(i, 0) - 3.5 + 2.2 * ((x - wx) / r) ** 2
                for j in self.top_rows(i, crest, 99):
                    if (i, j) in self.mask and (i, j) not in self.glass:
                        self.setp(i, j, darken(0.2) if -self.vj(j) > crest + 0.5 else ridge(0.14))

    def grime(self, wheels, amount=1.0, rust=6, scratches=3):
        """Road film on the sills and around the arches, a few rust specks and scratches."""
        n = VNoise(self.cv.w, self.cv.h, 7, self.rng)
        for (i, j) in sorted(self.mask - self.glass):
            x, v = self.X(i), abs(self.vj(j))
            hw = self.half[i]
            k = max(0.0, (v - (hw - 6)) / 6.0) * 0.4
            for wx in wheels:
                k += max(0.0, 1.0 - math.hypot((x - wx) / 1.5, hw - v) / 10.0) * 0.32
            k *= amount * (0.3 + 1.3 * n(x, (j + 0.5) / self.s))
            if k > 0.03:
                self.cv.p[i, j] = mix(self.cv.p[i, j], ROAD_DIRT, min(0.5, k))
        for _ in range(rust):
            x = self.rng.choice(wheels) + self.rng.uniform(-13, 13)
            y = self.cy - self.hw(x) + self.rng.uniform(0.3, 2.5)
            if self.rng.random() < 0.5:
                y = 2 * self.cy - y
            for k in range(self.rng.randint(2, 6)):
                p = (int(x * self.s) + self.rng.randint(-1, 1) * (k > 0), int(y * self.s) + self.rng.randint(-1, 1) * (k > 0))
                if p in self.mask:
                    self.cv.p[p] = mix(self.cv.p[p], RUST[self.rng.randint(0, 2)], 0.7)
        for _ in range(scratches):
            x = self.rng.uniform(20, self.cv.w - 30)
            y = self.cy - self.hw(x) + self.rng.uniform(1.5, 4)
            ln = self.rng.uniform(3, 8)
            a = self.rng.uniform(-0.15, 0.15)
            for k in range(int(ln * self.s)):
                p = (int(x * self.s) + k, int((y + math.sin(a) * k / self.s) * self.s))
                if p in self.mask:
                    self.cv.p[p] = lt(self.cv.p[p], 0.22)

    def gloss(self, x0, x1, k=0.12):
        """The paint's gloss: a soft band of the night sky's light sliding diagonally over the panels from x0 to x1,
        a harder line along its middle."""
        for (i, j) in sorted(self.mask - self.glass):
            x, v = self.X(i), self.vj(j)
            if not x0 <= x <= x1 or v > 0:
                continue
            d = abs((x - x0) / max(1, x1 - x0) - 0.5 + (v / 30.0) * 0.6)
            if d < 0.12:
                self.cv.p[i, j] = lt(self.cv.p[i, j], k * (1.0 - d / 0.12) + (0.06 if d < 0.012 else 0.0))

    def rim(self):
        """Lower edge a touch darker, upper edge catching the light."""
        for (i, j) in sorted(self.mask):
            if (i, j + 1) not in self.mask:
                self.cv.p[i, j] = dk(self.cv.p[i, j], 0.25)
            elif (i, j - 1) not in self.mask:
                self.cv.p[i, j] = lt(self.cv.p[i, j], 0.14)

    def lamp(self, x0, x1, y0, y1, col, glow, frame, back=None):
        """Light cluster (mirrored): framed lens with its reflector's rings, brighter top row; the lens goes into the
        glow map. back: the framed (inner) column, x0 by default (front lights)."""
        s = self.s
        bx = x0 if back is None else back
        cx, cy = (x0 + x1 + 1) / 2, (y0 + y1 + 1) / 2
        for j in range(y0 * s, (y1 + 1) * s):
            for i in range(x0 * s, (x1 + 1) * s):
                edge = j in (y0 * s, (y1 + 1) * s - 1) or i // s == bx and (i % s == (0 if back is None else s - 1))
                if edge:
                    c = frame
                else:
                    d = math.hypot((i + 0.5) / s - cx, ((j + 0.5) / s - cy) * 0.8)
                    c = lt(col, 0.5) if j < y0 * s + s else (col if int(d * 2.2) % 2 else lt(col, 0.18))
                self.setp(i, j, c)
                if not edge:
                    self.gl.p[i, j] = glow
                    self.gl.p[i, self.mj(j)] = glow

    def bumper(self, x0, x1, tones, strip=None):
        """Bumper across the whole end, lit from the top; a rubber strip along it (strip: its column)."""
        for i in self.cols(x0, x1):
            for j in range(self.cv.ph):
                if (i, j) in self.mask:
                    t = 0.95 - (j / self.cv.ph) * 0.75 - (0.15 if i in (x0 * self.s, (x1 + 1) * self.s - 1) and x0 != x1 else 0)
                    c = pal(tones, t)
                    if strip is not None and i == int(strip * self.s):
                        c = RUBBER[1]
                    self.cv.p[i, j] = c

    def mirror(self, x0, x1, tones, glass_end):
        """Door mirror on its arm, sticking out past the body: the arm, the housing lit on top, its glass facing
        back."""
        top = min(j for (i, j) in self.mask if x0 * self.s <= i < (x1 + 1) * self.s)
        s = self.s
        for i in range(x0 * s, (x1 + 1) * s):
            for d in (1, 2):
                if i // s == glass_end and d == 1:
                    c = GLASS[2] if i % s else GLASS[1]
                else:
                    c = tones[3] if d == 2 and i // s > x0 else tones[2] if d == 1 else tones[1]
                if i // s == x0:
                    c = dk(tones[1], 0.2) if d == 1 else None    # the arm is thin
                if c is not None:
                    self.setp(i, top - d, c)

    def done(self):
        self.cv.outline()
        return self.cv, self.gl


def p_car(body=SEDAN_BODY, stripe=None, keep=None):
    """80s four-door sedan, 4.4 x 1.8 m: boxy, chrome bumpers, quad headlights, thick C pillars. stripe: a colour run
    down its middle from the trunk to the nose over the panels, under the glass (the pursuers' car, p_pursuer).
    keep: a list the painter's Veh is appended to (its mask and glass: the cruiser and the burnt-out car are this
    sedan repainted)."""
    k = Veh(140, 58, 29, 4401)
    wheels = (30, 112)
    k.shell(body, 1, 138, 26.5, 5, 6, crown=2.2)
    k.arches(wheels)
    k.trap(34, 45, 19.5, 17.5, sheen=2)                      # rear window
    k.trap(81, 97, 17.5, 21.5, sheen=4)                      # windshield
    # through the glass, dim: the front seats' backs and the wheel (the driver's on the left), the dashboard and a pack
    # of cigarettes left on it; behind, the rear seat's back, the parcel shelf and a box of tissues on it
    for y in (15.0, 33.0):
        k.inside(81.0, y, 84.0, y + 10.0, hx('#8a6a4a'), 0.3)
    k.wheel(88.5, 19.5, 3.2)
    k.inside(92.5, 9.0, 98.0, 49.0, hx('#5a4c40'), 0.42)
    k.inside(94.0, 37.5, 96.0, 39.0, hx('#e8e0d0'), 0.6)
    k.inside(41.0, 11.0, 46.0, 47.0, hx('#8a6a4a'), 0.28)
    k.inside(34.0, 10.0, 39.0, 48.0, hx('#4a4038'), 0.4)
    k.inside(35.0, 24.5, 38.0, 27.0, hx('#9ab8d8'), 0.6)
    k.film(81, 97, ((97.5, 26.5), (97.5, 45.5)), 12.5)
    k.dent(19.5, 12.5, 2.8)                                  # somebody backed into the trunk's corner
    k.panel(body, 46, 80, 18.5)                              # roof
    if stripe:
        center_stripe(k, 4, 136, stripe)
    k.side(47, 85, lambda x: 18.5 if x <= 80 else 19.0 + (x - 81) / 4, 22.0, pillars=(64, 65))
    k.line(42, 6, 90, 6, lambda c, s: mix(c, CHROME[3 if s < 0 else 1], 0.6))   # beltline trim
    k.line(42, 6, 90, 6, lambda c, s: mix(c, CHROME[1], 0.4), w=1)
    for x in (40, 65, 90):                                   # door seams
        k.line(x, 2, x, 5, darken(0.45))
    for x in (45, 69):                                       # door handles: chrome, the key under
        k.line(x, 4, x + 2, 4, lambda c, s: CHROME[3 if s < 0 else 2], w=2)
        k.dot(x + 2.8, 4.8, RUBBER[0])
    k.line(6, 8, 6, 28, darken(0.4))                         # trunk lid
    k.line(6, 8, 33, 8, darken(0.4))
    k.line(9, 28, 10, 28, CHROME[2], w=2)                    # trunk lock
    k.line(98, 8, 98, 28, darken(0.45))                      # cowl gap
    for x in range(100, 106, 2):                             # the cowl's air vent slots
        k.line(x, 23, x, 27, darken(0.15))
    k.line(98, 8, 133, 8, darken(0.4))                       # hood shut lines
    k.line(101, 20, 130, 20, ridge(0.18))                    # hood creases
    k.line(9, 20, 30, 20, ridge(0.15))                       # trunk lid crease
    k.put(131, 28, CHROME[3])                                # hood ornament
    k.dot(131.5, 28.0, hx('#ffffff'))
    for (y0, y1, side) in ((26, 14, False), (45, 33, False)):   # parked wipers: the chrome arm, the black blade
        k.line(97, y0, 96, y1, CHROME[1], both=False)
        k.line(96, y0 - 1, 95, y1 + 1, RUBBER[0], both=False)
    k.line(90, 28, 91, 28, RUBBER[1], both=False)            # the rear-view mirror behind the windshield
    k.line(90, 29, 91, 29, RUBBER[1], both=False)
    k.line(24, 3, 27, 3, darken(0.3), both=False)            # fuel filler flap
    k.line(24, 4, 27, 4, darken(0.15), both=False)
    k.dot(25.5, 3.5, CHROME[2], both=False)
    k.put(20, 53, RUBBER[0], both=False)                     # antenna base, the mast lying back
    k.line(20, 53, 9, 54, CHROME[2], both=False)
    k.grime(wheels)
    k.seal()
    k.gloss(98, 134)
    k.gloss(46, 80, 0.09)
    k.gloss(6, 33, 0.08)
    k.rim()
    k.bumper(137, 138, CHROME, strip=137.5)
    k.bumper(1, 2, CHROME, strip=1.5)
    for x in (137, 138):                                     # rubber bumper guards
        k.line(x, 13, x, 15, RUBBER[1 if x == 137 else 0])
    for y in range(20, 29):                                  # grille: chrome frame, black slats
        for x in range(134, 137):
            k.put(x, y, CHROME[1] if y == 20 or x == 134 else RUBBER[0])
    for j in range(21 * k.s, 29 * k.s):
        for i in range(135 * k.s, 137 * k.s):
            k.setp(i, j, CHROME[2] if j % 3 == 0 else RUBBER[0] if j % 3 == 1 else RUBBER[2])
    k.lamp(134, 136, 8, 13, HEAD_C, HEAD_GLOW, CHROME[2])     # quad headlights
    k.lamp(134, 136, 13, 18, HEAD_C, HEAD_GLOW, CHROME[2])
    k.line(135, 5, 136, 5, AMBER, w=2)
    k.line(135, 6, 136, 6, dk(AMBER, 0.2), w=2)
    k.lamp(3, 5, 5, 17, TAIL_C, TAIL_GLOW, hx('#7a0818'), back=5)      # wide tail lights
    k.line(4, 18, 5, 18, hx('#e8e4dc'), w=2)                  # reverse lights
    plate(k, 3, 23, 28)
    k.mirror(86, 90, body, 90)
    if keep is not None:
        keep.append(k)
    return k.done()


def center_stripe(k, x0, x1, col):
    """One stripe 2 world px wide down the centre line from x0 to x1, over the panels only (the glass stays clear),
    the paint's shading kept through it."""
    for i in k.cols(x0, x1):
        for j in range(28 * k.s, 30 * k.s):
            if (i, j) in k.mask and (i, j) not in k.glass:
                k.cv.p[i, j] = mix(k.cv.p[i, j], col, 0.82)


# the pursuers' sedan: black, one pink stripe (docs/LEVEL2.md: the only black cars on the road). Its black leans warm
# (red over blue) so that Vehicle.js never takes a pixel of it for glass
PURSUER_BODY = ramp('#1e1a1f', 0.5, 0.25, 0.3)
PURSUER_STRIPE = hx('#ff2a6d')


def p_pursuer():
    """The boss's men's sedan: the 80s four-door in black with a single pink stripe down its length."""
    return p_car(PURSUER_BODY, PURSUER_STRIPE)


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
    for j in (23 * k.s, 25 * k.s - 1):
        for i in list(range(5 * k.s, 22 * k.s)) + list(range(100 * k.s, 128 * k.s)):
            k.setp(i, j, lambda c, s: lt(c, 0.25) if j == 23 * k.s and s < 0 else dk(c, 0.15))
    k.line(6, 4, 125, 4, lambda c, s: purp if s < 0 else dk(purp, 0.25), w=2)   # side stripe
    k.trap(22, 49, 14.5, 17.5, sheen=6)                      # fastback hatch glass
    for x in range(26, 48, 3):                               # its heater wires
        k.line(x, 13, x, 13, lambda c, s: dk(c, 0.25), both=True)
    k.trap(78, 98, 17.0, 21.0, sheen=5)                      # raked windshield
    # through the glass: the two buckets' backs, the wheel, a black dash with the radar detector's box on it; under the
    # hatch, the luggage deck and a sports bag thrown on it
    for y in (15.0, 31.0):
        k.inside(78.0, y, 81.5, y + 10.0, hx('#7a2434'), 0.3)
    k.wheel(86.5, 19.5, 3.0)
    k.inside(91.0, 8.0, 99.0, 48.0, hx('#3c3a46'), 0.45)
    k.inside(93.0, 26.5, 95.0, 29.0, hx('#8a8e9c'), 0.5)
    k.inside(22.0, 12.0, 44.0, 44.0, hx('#3a3640'), 0.3)
    k.inside(30.0, 28.5, 40.0, 35.5, hx('#8a2a2a'), 0.42, round_=True)
    k.inside(33.0, 31.5, 37.0, 32.5, hx('#d8d4c8'), 0.4)
    k.film(78, 98, ((98.5, 26.5),), 13.5, 0.07)
    k.panel(body, 50, 77, 17.5)                              # roof
    for i in range(53 * k.s, 75 * k.s):                      # T-top: smoked panels around the centre bar
        for j in range(13 * k.s, 25 * k.s):
            x, y = (i + 0.5) / k.s, (j + 0.5) / k.s
            c = pal(GLASS, 0.75 - (y - 13) / 12 * 0.45)
            if 9 <= (x - 53) + (y - 13) * 0.6 < 11.5:
                c = mix(c, SHEEN, 0.28)
            frame = i < 53 * k.s + 2 or i >= 75 * k.s - 2 or j < 13 * k.s + 2 or j >= 25 * k.s - 2
            k.setp(i, j, RUBBER[2] if frame else (lambda cur, sd, c=c: c if sd < 0 else dk(c, 0.15)))
    k.side(51, 85, lambda x: 17.5 if x <= 77 else 18.5 + (x - 78) / 5, 20.5, pillars=(62,))
    for x in (55, 93):                                       # long doors
        k.line(x, 2, x, 6, darken(0.45))
    k.line(58, 5, 60, 5, RUBBER[1], w=2)                     # flush handles
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
    k.line(98, 26, 97, 13, CHROME[1], both=False)            # single wiper
    k.line(97, 25, 96, 14, RUBBER[0], both=False)
    k.line(24, 2, 26, 2, darken(0.3), both=False)            # filler flap
    k.grime(wheels, amount=0.8, rust=3, scratches=2)
    k.seal()
    k.gloss(99, 128)
    k.gloss(13, 22, 0.08)
    k.rim()
    for x in range(6, 12):                                   # rear wing on its endplates
        for y in range(3, 28):
            if y < 5:
                c = RUBBER[0]
            else:
                c = RUBBER[3] if x == 7 else RUBBER[2] if x < 10 else RUBBER[1] if x < 11 else RUBBER[0]
            if x > 6 or y < 5:
                k.put(x, y, c)
    k.line(8, 5, 8, 27, lambda c, s: lt(c, 0.3))             # the wing's lit leading edge
    k.line(12, 5, 12, 27, darken(0.35))
    k.bumper(1, 1, RUBBER)
    k.bumper(130, 132, RUBBER)
    for y in range(5, 28):                                   # full-width tail light bar, plate in the middle
        for x in (2, 3, 4):
            if y > 23 and x < 4:
                continue
            lens = x > 2 and y > 5 and y % 3
            k.put(x, y, TAIL_C if lens else hx('#3a0818'))
            if lens and y < 24:
                for j in range(y * k.s, y * k.s + k.s):
                    for i in range(x * k.s, x * k.s + k.s):
                        k.gl.p[i, j] = TAIL_GLOW
                        k.gl.p[i, k.mj(j)] = TAIL_GLOW
    plate(k, 2, 24, 27)
    k.lamp(120, 122, 10, 15, HEAD_C, HEAD_GLOW, RUBBER[1])   # pop-ups, up
    k.line(128, 24, 128, 27, RUBBER[0])                      # air intake
    k.line(129, 24, 129, 27, RUBBER[1])
    k.line(128, 6, 129, 6, AMBER, w=2)
    k.line(128, 7, 128, 8, dk(AMBER, 0.2), w=2)
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
        k.line(x, 8, x, 31, lambda c, s: lt(c, 0.12), w=2)
        k.line(x + 1, 8, x + 1, 31, darken(0.14))
    k.line(7, 7, 122, 7, darken(0.22))                       # drip rail
    for i, col in enumerate(sunset):                         # sunset side stripes
        k.line(8, 3 + i, 106 - i * 3, 3 + i, lambda c, s, col=col: col if s < 0 else dk(col, 0.2), w=2)
    k.trap(123, 137, 23.0, 26.5, sheen=3)                    # windshield
    # through it: the two seats' backs, the big flat wheel, the dash: a paper cup, a road map unfolded, a rag
    for y in (11.0, 39.0):
        k.inside(123.0, y, 126.0, y + 14.0, hx('#6a5a4a'), 0.3)
    k.wheel(130.5, 19.0, 4.2)
    k.inside(132.5, 7.0, 138.0, 57.0, hx('#4a443c'), 0.42)
    k.inside(134.0, 30.5, 136.0, 32.5, hx('#e8e0d0'), 0.6, round_=True)
    k.inside(133.5, 40.0, 136.5, 46.0, hx('#cfc6a4'), 0.5)
    k.inside(134.0, 12.0, 136.0, 15.0, hx('#8a3a30'), 0.4)
    k.film(123, 137, ((137.5, 30.5), (137.5, 50.5)), 17.5, 0.13)
    k.side(111, 126, lambda x: 24.5 if x <= 122 else 24.5 + (x - 122) / 4, 27.0)
    for x in range(54, 67):                                  # smoked roof vent
        for y in range(25, 32):
            frame = x in (54, 66) or y == 25
            k.put(x, y, (CHROME[1] if y == 25 or x == 54 else RUBBER[1]) if frame
                  else k.glass_col(x + 0.5, y + 0.5, 54, 66, 7, sheen=3))
    for x in range(10, 39):                                  # roof rack: rails and rungs
        k.put(x, 15, CHROME[2] if x % 13 else CHROME[3])
        k.put(x, 16, darken(0.3))
    k.line(10, 15, 38, 15, lambda c, s: lt(c, 0.3))
    for x in (12, 25, 37):
        k.line(x, 16, x, 47, CHROME[2], both=False, w=2)
        k.line(x + 1, 17, x + 1, 47, darken(0.3), both=False)
    for x in (110, 138):                                     # cab doors
        k.line(x, 2, x, 7, darken(0.45))
    k.line(112, 4, 114, 4, CHROME[2], w=2)
    for x in (70, 108):                                      # sliding door (right side only)
        k.line(x, 56, x, 61, darken(0.45), both=False)
    k.line(70, 58, 108, 58, darken(0.15), both=False)
    k.line(138, 8, 138, 31, darken(0.45))                    # short hood
    k.line(138, 9, 153, 9, darken(0.4))
    k.line(140, 22, 152, 22, ridge(0.1))
    k.line(137, 30, 136, 13, CHROME[1], both=False)          # wipers
    k.line(136, 29, 135, 14, RUBBER[0], both=False)
    k.line(137, 50, 136, 33, CHROME[1], both=False)
    k.line(136, 49, 135, 34, RUBBER[0], both=False)
    for y in (31, 32):                                       # rear doors: split and handle
        k.line(4, y, 7, y, darken(0.35 if y == 31 else 0.2), both=False)
    k.put(5, 34, CHROME[2], both=False)
    k.grime(wheels, amount=1.3, rust=10, scratches=4)
    k.seal()
    k.gloss(139, 154, 0.08)
    k.rim()
    k.bumper(1, 3, RUBBER)
    k.bumper(157, 158, RUBBER)
    for y in range(21, 32):                                  # grille
        for x in range(154, 157):
            k.put(x, y, CHROME[1] if y == 21 or x == 154 else RUBBER[0])
    for j in range(22 * k.s, 32 * k.s):
        for i in range(155 * k.s, 157 * k.s):
            k.setp(i, j, CHROME[0] if j % 2 else RUBBER[0])
    k.lamp(154, 156, 11, 15, HEAD_C, HEAD_GLOW, CHROME[2])   # stacked square headlights
    k.lamp(154, 156, 15, 19, HEAD_C, HEAD_GLOW, CHROME[2])
    k.line(155, 8, 156, 8, AMBER, w=2)
    k.line(155, 9, 156, 9, dk(AMBER, 0.2), w=2)
    k.lamp(4, 6, 4, 11, TAIL_C, TAIL_GLOW, hx('#7a0818'), back=6)      # tall tail lights on the corner posts
    k.line(5, 3, 6, 3, AMBER, w=2)
    for x in range(125, 131):                                # big black mirrors
        k.put(x, 1, RUBBER[3] if x == 126 else GLASS[1] if x == 130 else RUBBER[2])
    return k.done()


CONV_BODY = ramp('#ece2c8', 0.5, 0.24, 0.3)          # bone, a touch whiter than the van's
CONV_LEATHER = [hx('#3a0a12'), hx('#6a101c'), hx('#981826'), hx('#c8323a')]   # blood-red tuck-and-roll
CONV_CARPET = [hx('#12080c'), hx('#200c12'), hx('#2c1018')]
CONV_GOLD = [hx('#6a4a14'), hx('#b8862a'), hx('#e8c050'), hx('#fff0a0')]
CONV_VINYL = [hx('#16141a'), hx('#24212a'), hx('#34303c'), hx('#4a4556')]


def p_convertible():
    """The boss's convertible, roof down, 5.4 x 2.0 m: bone body, blood-red tuck-and-roll, twin gold pinstripes, a
    chrome spear down the belt, fins with tall blades of tail light, a dummy spare pressed in the deck. The open
    cabin is the VEHICLES `cabin` (the driver sits at `seat`, behind the wheel, on the -y side)."""
    body, seat = CONV_BODY, CONV_LEATHER
    W, H, CY, WHEELS = 172, 64, 32, (36, 140)
    k = Veh(W, H, CY, 5407)
    s = k.s
    k.shell(body, 1, 170, 29.5, 5, 7, nose=34, pinch=1.5, crown=2.6)
    k.arches(WHEELS, r=12)

    def region(x0, y0, x1, y1, fn):
        """Paint the pixels of the world rect (not mirrored): fn(x, y) -> colour or None, x, y pixel centres."""
        for j in range(int(y0 * s), int(math.ceil(y1 * s))):
            for i in range(int(x0 * s), int(math.ceil(x1 * s))):
                if (i, j) in k.mask:
                    c = fn((i + 0.5) / s, (j + 0.5) / s)
                    if c is not None:
                        k.cv.p[i, j] = c

    X0, X1, Y0, Y1 = 55.0, 113.0, 7.0, 57.0            # the cockpit's well

    def well(x, y):
        return X0 <= x < X1 and Y0 <= y < Y1

    def pleat(tones, x, y, x0, x1, lit=0.0, pitch=3.0, y0=Y0 + 1):
        """Tuck-and-roll: rolls running fore and aft, each a little dome; a button row would be too fine."""
        u = ((y - y0) % pitch) / pitch
        t = 0.72 - abs(u - 0.4) * 0.9 + lit - (y - CY) / 64 * 0.18
        if x - x0 < 0.6 or x1 - x < 0.6:
            t -= 0.3
        return pal(tones, t)

    # the floor first, then what stands on it
    region(X0, Y0, X1, Y1, lambda x, y: pal(CONV_CARPET, 0.5 + 0.4 * math.sin(x * 1.7 + y * 0.9) * 0.3))

    def bench(xb0, xb1, xc1, split):
        """A bench: its back (xb0..xb1, higher: lighter) and its cushion (xb1..xc1)."""
        def f(x, y):
            if not (Y0 + 1 <= y < Y1 - 1):
                return None
            if split and abs(y - CY) < 1.0:
                return dk(seat[0], 0.2)
            if x < xb1:
                c = pleat(seat, x, y, xb0, xb1, 0.16)
                if x - xb0 < 1.0:                    # the back's top roll, piped
                    c = lt(c, 0.18)
                return c
            c = pleat(seat, x, y, xb1, xc1, -0.06)
            if x - xb1 < 1.2:                        # the back's shadow on the cushion
                c = dk(c, 0.38)
            return c
        region(xb0, Y0, xc1, Y1, f)

    bench(59, 65, 77, False)                        # the rear bench
    bench(84, 90, 101, True)                        # the front one, split
    # the folded top under its boot, behind the rear seat: black vinyl, chrome snaps
    def boot(x, y):
        if not (5.5 <= y < 58.5):
            return None
        t = 0.75 - abs((x - 52.0) / 6.5) ** 2 * 0.5 - (y - 6) / 52 * 0.35
        return pal(CONV_VINYL, t)
    region(47, 5, 59, 59, boot)
    for y in range(8, 32, 6):
        k.dot(47.8, y + 0.2, CHROME[3])
        k.dot(47.8, 63.3 - y, CHROME[2])
    # door cards: the near one in shadow, the far one lit; chrome sill plates, armrests
    region(X0 + 4, Y0, X1 - 6, Y0 + 1.5, lambda x, y: dk(seat[0], 0.35))
    region(X0 + 4, Y1 - 1.5, X1 - 6, Y1, lambda x, y: seat[2] if y > Y1 - 1 else seat[1])
    for (a, b) in ((66, 76), (91, 100)):
        region(a, Y0 + 1.5, b, Y0 + 3, lambda x, y: seat[1])
        region(a, Y1 - 3, b, Y1 - 1.5, lambda x, y: seat[3] if y < Y1 - 2.4 else seat[2])
    # the well's own shadow: its rear and near walls throw it in
    for (i, j) in sorted(k.mask):
        x, y = (i + 0.5) / s, (j + 0.5) / s
        if well(x, y) and 59 <= x and (y - Y0 < 2.2 and not (84 <= x < 90 or 59 <= x < 65)):
            k.cv.p[i, j] = dk(k.cv.p[i, j], 0.3)
    # the dashboard: a padded top, the binnacle's hood before the driver, a chrome strip, the radio, the ashtray
    def dash(x, y):
        if not (Y0 <= y < Y1):
            return None
        t = 0.55 + (x - 106) / 7 * 0.35 - (y - Y0) / 50 * 0.2
        c = pal(seat[:3], t)
        if x < 106.6:
            c = CHROME[2] if int(y * 2) % 7 else CHROME[3]
        return c
    region(106, Y0, X1, Y1, dash)
    region(107, 13, 112, 26, lambda x, y: pal(CONV_VINYL, 0.3 + (x - 107) / 5 * 0.5))          # the binnacle
    for gy in (16.5, 22.5):                                                              # two dials, lit green
        k.dot(107.4, gy, hx('#7ae8b0'), both=False)
        k.dot(107.4, gy + 0.5, hx('#3a9a78'), both=False)
    region(106.6, 29, 108, 35, lambda x, y: RUBBER[0])                                   # the radio's face
    k.dot(107.2, 30.2, hx('#ff8a20'), both=False)
    k.dot(107.2, 33.8, CHROME[3], both=False)
    # the wheel, seen from straight above: raked up toward him on its column, it is a thin ring across the car (the
    # VEHICLES `wheel`: x, y, half its width, half its depth), up against the dash; only its top edge catches the light
    wx, wy, wa, wb = 103.6, 19.5, 5.4, 1.6
    region(wx, wy - 0.6, 106.2, wy + 0.6, lambda x, y: RUBBER[0])                         # the column into the dash
    def rim(x, y):
        o = ((x - wx) / (wb + 0.5)) ** 2 + ((y - wy) / (wa + 0.5)) ** 2
        i = ((x - wx) / max(wb - 0.5, 0.1)) ** 2 + ((y - wy) / (wa - 0.5)) ** 2
        if o <= 1.0 and i >= 1.0:
            if x >= wx + 0.4:                                    # the top of the rim, nearest the glass: lit
                return hx('#d8ceb4') if y < wy + 2 else hx('#a89e86')
            return hx('#7a705c') if y < wy else hx('#5a5244')       # its bottom edge, under the hands, in shadow
        if o < 1.0 and abs(y - wy) < 0.5:                         # the spoke across, then the hub on the column
            return CONV_GOLD[1] if abs(x - wx) < 0.6 else hx('#5a5244')
        return None
    region(wx - 3, wy - 7, wx + 3, wy + 7, rim)
    # the shifter on the column, the mirror on the header, the dice hanging from it
    k.line(105, 21, 105.5, 23.5, CHROME[2], both=False)
    k.dot(105.6, 24.1, hx('#f6f0e0'), both=False)
    # things left in it (his hat on the rear seat is a sprite of its own, boss_hat: it flies off): a cigar burn in
    # the passenger's cushion, a cigar going in the dash's ashtray
    for (x, y, c) in ((95.0, 43.0, hx('#120808')), (95.5, 43.0, hx('#120808')), (95.0, 43.5, hx('#120808')), (94.5, 43.0, hx('#4a2a1a')),
                      (96.0, 43.0, hx('#5a3020')), (95.0, 42.5, hx('#4a2a1a')), (95.5, 43.5, hx('#5a3020')), (95.0, 44.0, hx('#d0806a')),
                      (95.5, 42.5, hx('#4a1210')), (94.5, 43.5, hx('#4a1210'))):
        k.dot(x, y, c, both=False)                  # the burn
    region(108.5, 37, 111, 41, lambda x, y: CHROME[1] if (x < 109 or y < 37.5) else RUBBER[0])   # the ashtray, pulled out
    k.line(109, 38, 110, 40, hx('#7a5230'), both=False)                                          # the cigar in it
    k.dot(110.6, 40.8, hx('#ff8a20'), both=False)
    k.dot(108.9, 37.6, hx('#d8d0c0'), both=False)
    # the windshield from above: a raked band of glass in its chrome frame, the vent wings
    k.trap(113, 118, 25.5, 27.0, sheen=2)
    k.film(113, 118, ((118.5, 30.5), (118.5, 52.5)), 30, 0.06)
    for i in k.cols(113, 113):
        for j in range(int(5 * s), int(59 * s)):
            if (i, j) in k.mask and i == 113 * s:
                k.cv.p[i, j] = CHROME[3] if j < CY * s else CHROME[2]
    k.line(112, 31, 112, 32, CHROME[1], both=False, w=2)                                         # the mirror
    for (cx, cy) in ((109.5, 30.0), (110.0, 33.0)):                                              # the dice
        for dx in (0, 0.5, 1.0):
            for dy in (0, 0.5, 1.0):
                c = hx('#fff8e6') if dx + dy < 1.0 else hx('#d8cab0') if dx + dy < 2.0 else hx('#9a8c74')
                if (dx, dy) == (0.5, 0.5):
                    c = hx('#1a161e')
                k.dot(cx + dx, cy + dy, c, both=False)
    k.line(111, 31, 112, 32, RUBBER[2], both=False)
    k.line(108, 4, 112, 6, CHROME[2])                                                           # vent wings
    k.line(108, 5, 111, 6, GLASS[3])
    # ---- the body's dressing (both roofs)
    for x0, x1 in ((6, 46), (120, 164)):                 # twin gold pinstripes down the deck and the hood
        k.line(x0, 26, x1, 26, lambda c, sd: mix(c, CONV_GOLD[1], 0.8))
    k.line(6, 5, 164, 5, lambda c, sd: mix(c, CHROME[3 if sd < 0 else 1], 0.7))   # the belt's chrome spear
    k.line(6, 6, 164, 6, lambda c, sd: mix(c, CONV_GOLD[2] if sd < 0 else CONV_GOLD[0], 0.75), w=1)
    for x in (58, 84, 112):                               # door seams and pulls
        k.line(x, 2, x, 6, darken(0.4))
    k.line(88, 4, 91, 4, lambda c, sd: CHROME[3 if sd < 0 else 2], w=2)
    k.line(119, 8, 119, 31, darken(0.45))                 # cowl gap
    for x in range(121, 127, 2):
        k.line(x, 22, x, 27, darken(0.14))
    k.line(119, 9, 165, 9, darken(0.32))                  # hood shut lines
    k.line(124, 31, 162, 31, ridge(0.2))                  # its centre spine
    k.line(124, 18, 160, 18, ridge(0.1))
    for (y0, y1) in ((30, 14), (52, 36)):                 # parked wipers
        k.line(118, y0, 117, y1, CHROME[1], both=False)
    # the hood's mascot: a gold stand-up thing on a chrome foot
    k.put(163, 31, CHROME[2])
    k.put(163, 32, CHROME[1], both=False)
    k.put(164, 31, CONV_GOLD[2])
    k.dot(164.1, 31.1, CONV_GOLD[3])
    k.dot(165.2, 31.6, CONV_GOLD[1])
    # the deck: lid lines, and the bad taste: a dummy spare's hump pressed in the lid, a gold cap in its middle
    k.line(8, 9, 8, 31, darken(0.36))
    k.line(8, 9, 44, 9, darken(0.32))
    def hump(c, i, j):
        x, y = (i + 0.5) / s, (j + 0.5) / s
        d = math.hypot(x - 22.0, y - 32.0)
        if 9.6 <= d < 11.2:
            n = (-(x - 22) - (y - 32) * 1.4) / (d * 1.72)
            return lt(dk(c, 0.06), 0.3 * n) if n > 0 else dk(c, 0.06 - 0.3 * n)
        if d < 9.6:
            return lt(c, 0.05) if (d > 8.4 and y < 32) else c
        return None
    for (i, j) in sorted(k.mask):
        c = hump(k.cv.p[i, j], i, j)
        if c is not None:
            k.cv.p[i, j] = c
    for (dx, dy, c) in ((0, 0, CONV_GOLD[3]), (0.5, 0, CONV_GOLD[2]), (0, 0.5, CONV_GOLD[2]), (0.5, 0.5, CONV_GOLD[1]), (-0.5, 0, CONV_GOLD[2]), (0, -0.5, CONV_GOLD[2]),
                        (1.0, 0, CONV_GOLD[1]), (0, 1.0, CONV_GOLD[0]), (-0.5, 0.5, CONV_GOLD[1]), (0.5, -0.5, CONV_GOLD[2]), (-0.5, -0.5, CONV_GOLD[2]), (1.0, 0.5, CONV_GOLD[0]), (0.5, 1.0, CONV_GOLD[0])):
        k.dot(21.8 + dx, 31.8 + dy, c, both=False)
    k.line(4, 3, 30, 3, lambda c, sd: lt(c, 0.2) if sd < 0 else dk(c, 0.1))     # the fins' crest: a hard lit edge
    k.line(4, 4, 34, 4, darken(0.12))
    k.line(28, 2, 31, 2, darken(0.3), both=False)         # filler flap
    k.put(48, 60, RUBBER[0], both=False)                  # aerial
    k.line(48, 60, 38, 61, CHROME[2], both=False)
    k.grime(WHEELS, amount=0.55, rust=1, scratches=2)     # kept clean: somebody is paid to
    k.seal()
    k.gloss(120, 166, 0.14)
    k.gloss(6, 46, 0.1)
    k.rim()
    k.bumper(169, 170, CHROME, strip=None)
    k.bumper(1, 2, CHROME, strip=None)
    for x in (169, 170):                                  # gold over-riders
        k.line(x, 21, x, 22, CONV_GOLD[2] if x == 169 else CONV_GOLD[1])
    for y in range(18, 32):                               # a tall waterfall grille
        for x in range(165, 169):
            k.put(x, y, CHROME[1] if y == 18 or x == 165 else RUBBER[0])
    for j in range(19 * s, 32 * s):
        for i in range(166 * s, 169 * s):
            k.setp(i, j, CHROME[3] if j % 2 == 0 else CHROME[1])
    k.lamp(166, 168, 6, 11, HEAD_C, HEAD_GLOW, CHROME[2])
    k.lamp(166, 168, 11, 16, HEAD_C, HEAD_GLOW, CHROME[2])
    k.line(166, 4, 167, 4, AMBER, w=2)
    k.lamp(3, 4, 3, 15, TAIL_C, TAIL_GLOW, hx('#7a0818'), back=4)       # tall blades of tail light in the fins
    k.line(3, 17, 4, 17, hx('#e8e4dc'), w=2)
    plate(k, 3, 27, 31)
    k.mirror(104, 108, [CHROME[0], CHROME[1], CHROME[2], CHROME[3]], 108)
    return k.done()


def p_boss_hat():
    """THE BOSS's bone hat seen from above (it lies on the convertible's rear seat, VEHICLES `hat`, and flies off):
    a wide brim, its edge rolled, a black band on the side away from the light, the crown's crease."""
    cv = Cv(14, 12)
    cx, cy = 7.0, 6.0

    def f(x, y, c):
        d = math.hypot((x - cx) / 6.2, (y - cy) / 5.6)
        if d > 1.0:
            return None
        if d > 0.9:
            return OUTLINE if x + y > cx + cy + 1 else hx('#b8a890')
        u = (x - cx) + (y - cy)                         # along the light
        if d > 0.56:                                    # the brim
            return hx('#f2e8d2') if u < 1.0 else hx('#d8cab0')
        if d > 0.44 and u > -3.0:
            return hx('#2a1c22')                        # the band
        col = hx('#fff8e6') if u < -1.0 else hx('#e6dabe')
        if abs((y - cy) - (x - cx) * 0.25) < 0.55 and -1.5 < x - cx < 1.8:
            col = hx('#c2b494')                         # the crown's crease
        return col
    px_paint(cv, 0, 0, 14, 12, f)
    return cv


def p_car_tire():
    """Tyre seen from above (tread up), 0.62 m x 0.22 m: the tread blocks and the grooves between them, the shoulders
    rolling off into shadow."""
    cv = Cv(20, 7, FINE)

    def f(x, y, c):
        if (x < 1 or x > 19) and (y < 1 or y > 6):
            return None
        t = (y - 3.5) / 3.5
        L = 0.7 - abs(t) * 0.5 - t * 0.15
        col = pal(RUBBER, L)
        if abs(t) < 0.6 and int(x * 2 + (1 if t > 0 else 0)) % 3 == 0:
            col = RUBBER[0]                   # the grooves across the tread
        if abs(y - 3.5) < 0.3:
            col = RUBBER[0]                   # the centre groove
        return col
    px_paint(cv, 0, 0, 20, 7, f)
    return cv


def hood_debris(body, w, h, seed, stripe=None, stripe_at=(2.5, 3.5)):
    """Hood blown off: buckled panel with a diagonal fold, dents, a scorched edge, torn corners. stripe: its colour
    on the rows that far (world px) from the middle (twin stripes by default, one down the middle with (0.5,))."""
    rng = random.Random(seed)
    cv = Cv(w, h)
    burn = VNoise(w, h, 5, rng)
    fold = rng.uniform(0.4, 0.55)
    for y in range(1, h - 1):
        for x in range(1, w - 1):
            u, v = (x + 0.5) / w, (y + 0.5) / h
            d = (u - fold) + (v - 0.5) * 0.45
            c = soft(body, light(-0.55 if d < 0 else 0.3, (v - 0.5) * 0.6))
            if stripe and abs((y + 0.5) - h / 2) in stripe_at:
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


def door_debris(body, w, stripe=None, inner=None):
    """Door ripped off, seen from above edge-on: skin, window frame with glass left in it (inner: an open car's
    door has none, its trim shows instead), handle."""
    cv = Cv(w, 6)
    for x in range(1, w - 1):
        cv.set(x, 1, lt(body[2], 0.2))
        cv.set(x, 2, stripe or body[2])
        cv.set(x, 3, (inner or GLASS[2]) if 4 < x < w - 8 else body[1])
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


def p_convertible_hood():
    return hood_debris(CONV_BODY, 46, 46, 5417, stripe=CONV_GOLD[1])


def p_convertible_door():
    return door_debris(CONV_BODY, 28, stripe=CHROME[3], inner=CONV_LEATHER[2])


def p_car_door():
    return door_debris(SEDAN_BODY, 34)


def p_car2_door():
    return door_debris(COUPE_BODY, 40, stripe=hx('#7a1fa2'))


def p_van_door():
    return door_debris(VAN_BODY, 30, stripe=hx('#ff6b1a'))


def p_pursuer_hood():
    return hood_debris(PURSUER_BODY, 38, 44, 4421, stripe=PURSUER_STRIPE, stripe_at=(0.5,))


def p_pursuer_door():
    return door_debris(PURSUER_BODY, 34)


GROUP = 'props'
SPRITES = {
    'car': (p_car, (140, 58), 'fine glow req', (136, 54)),
    'car2': (p_car2, (134, 56), 'fine glow', (130, 52)),
    'van': (p_van, (160, 64), 'fine glow', (156, 60)),
    'car_tire': (p_car_tire, (20, 7), 'fine'),
    'car_hood': (p_car_hood, (38, 44), 'fine'),
    'car_door': (p_car_door, (34, 6), 'fine'),
    'car2_hood': (p_car2_hood, (30, 40), 'fine'),
    'car2_door': (p_car2_door, (40, 6), 'fine'),
    'van_hood': (p_van_hood, (18, 48), 'fine'),
    'van_door': (p_van_door, (30, 6), 'fine'),
    'convertible': (p_convertible, (172, 64), 'fine glow', (168, 60)),
    'convertible_hood': (p_convertible_hood, (46, 46), 'fine'),
    'convertible_door': (p_convertible_door, (28, 6), 'fine'),
    'boss_hat': (p_boss_hat, (14, 12), 'fine'),
    'pursuer': (p_pursuer, (140, 58), 'fine glow', (136, 54)),
    'pursuer_hood': (p_pursuer_hood, (38, 44), 'fine'),
    'pursuer_door': (p_pursuer_door, (34, 6), 'fine'),
}
