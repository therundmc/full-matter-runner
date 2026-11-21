"""THE PALMS, one family (royal, coconut, young royal: palm_crown's feather fronds; sabal and Washingtonia:
fan_leaf's fans; level 1's canary palm): one ink, one dead straw, the species' greens on the same ramps, every frond /
fan laid with leaf_over; the fronds and coconuts fallen on the ground."""
import math
import random

from .core import (
    crease, curve, Cv, dk, fill_capsule, fill_shape, hx, light, line, lt, LX, LY, px_paint, ramp, ring, shade, shift,
    smudge
)


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


PALM_INK = hx('#0c1a12')
PALM_DEAD = ramp('#8e7046', 0.55, 0.3, 0.25)
PALM_GREENS = dict(royal=(ramp('#2a7438', 0.6, 0.32, 0.26), ramp('#4a9440', 0.55, 0.3, 0.28)),
                   coconut=(ramp('#3c762e', 0.6, 0.32, 0.26), ramp('#76a23a', 0.55, 0.3, 0.28)),
                   sabal=(ramp('#2e6438', 0.6, 0.32, 0.26), ramp('#4a8644', 0.55, 0.3, 0.28)),
                   fan=(ramp('#2e7040', 0.6, 0.32, 0.26), ramp('#5a8e3c', 0.55, 0.3, 0.28)))


def leaf_over(cv, ly, ink=PALM_INK, cast=0.3, close=5):
    """Lay one leaf layer ly on cv: its hull (its alpha closed over the gaps between leaflets / segments) casts a
    1 world px shadow down and right on what cv already has, the ink goes round the hull's outside only (the gaps
    inside stay open: the leaves or the ground under them show through, no hatching of ink), then ly over it."""
    from PIL import ImageFilter
    a = ly.img.getchannel('A').point(lambda v: 255 if v >= 100 else 0)
    box = a.getbbox()
    if not box:
        return
    hull = a.filter(ImageFilter.MaxFilter(close)).filter(ImageFilter.MinFilter(close))
    hp, s = hull.load(), cv.s
    W, H = cv.pw, cv.ph
    x0, y0, x1, y1 = max(0, box[0] - 2), max(0, box[1] - 2), min(W, box[2] + s + 2), min(H, box[3] + s + 2)
    for j in range(y0, y1):
        for i in range(x0, x1):
            if cv.p[i, j][3] < 100 or cv.p[i, j] == ink:
                continue
            if hp[i, j]:
                if ly.p[i, j][3] < 100:
                    cv.p[i, j] = dk(cv.p[i, j], cast * 0.7)               # seen through a gap: in its shade
                continue
            if (i >= s and j >= s and hp[i - s, j - s]) or (i >= s - 1 and j >= s and hp[i - s + 1, j - s]):
                cv.p[i, j] = dk(cv.p[i, j], cast)                         # the shadow it casts on the leaves under it
    ink_at = []
    for j in range(y0, y1):
        for i in range(x0, x1):
            if hp[i, j] or ly.p[i, j][3] >= 100:
                continue
            if any(0 <= i + di < W and 0 <= j + dj < H and ly.p[i + di, j + dj][3] >= 100
                   for (di, dj) in ((1, 0), (-1, 0), (0, 1), (0, -1))):
                ink_at.append((i, j))
    for (i, j) in ink_at:
        ly.p[i, j] = ink
    cv.over(ly)


def palm_fan(seed, reach=1.0):
    """A Washingtonia, the Florida fan palm, from above, about 3 m across (reach: its crown's share of that): a skirt
    of dead fans hanging under the crown, then a ring of green fans on their stalks and a few young ones in the
    middle, every fan pleated (fan_leaf, the sabal's: one family), its tips split; the trunk's boss in the middle
    (the hitbox, r 4.5)."""
    def make():
        S = 96
        cv = Cv(S, S)
        rng = random.Random(seed)
        c0 = S / 2
        green, young = PALM_GREENS['fan']
        leaves = []
        for i in range(10):                                                # the skirt, hanging
            leaves.append((rng.uniform(0, 6.28), rng.uniform(8, 11) * reach, rng.uniform(10, 13) * reach, PALM_DEAD, 2))
        a0 = rng.uniform(0, 6.28)
        for i in range(12):                                                # the crown
            leaves.append((a0 + i * 6.28 / 12 + rng.uniform(-0.15, 0.15), rng.uniform(15, 19) * reach,
                           rng.uniform(17, 21) * reach, green, 0))
        for i in range(5):                                                 # the young fans, upright, in the middle
            leaves.append((a0 + 0.26 + i * 6.28 / 5 + rng.uniform(-0.2, 0.2), rng.uniform(5, 7) * reach,
                           rng.uniform(10, 12) * reach, young, 1))
        for (a, r0, R, g, kind) in leaves:
            ly = Cv(S, S)
            hxc, hyc = c0 + math.cos(a) * r0, c0 + math.sin(a) * r0
            fan_leaf(ly, hxc, hyc, a, R, g, 1.0 if kind == 2 else 1.3, 8 if kind == 2 else 11, rng, (), kind == 2,
                     0.55 if kind == 2 else 0.72, 0.62)                    # a Washingtonia's fan is split less deep
            fill_capsule(ly, [(c0 + math.cos(a) * 3, c0 + math.sin(a) * 3), (hxc, hyc),
                              (hxc + math.cos(a) * R * 0.3, hyc + math.sin(a) * R * 0.3)],
                         0.75, lambda k, L, s, i, t, g=g: shade(g, 0.5 + L * 0.35))   # the stalk, its costa into the fan
            leaf_over(cv, ly)
        trunk = Cv(S, S)
        boots(trunk, c0, 4.5, rng)
        leaf_over(cv, trunk)
        return cv
    return make


def palm_crown(S, seed, fronds, greens, dead_col, shaft, trunk_r):
    """A palm's crown from above, S world px square, painted pixel by pixel at the canvas's density: `fronds` [(angle,
    reach, width, bend, kind)] (kind 0 green, 1 a young one (lighter, drawn last), 2 dead and hanging (first)), each a
    rachis with its leaflets combed out either side, gaps between them, lit on the side that faces the light, the tip
    drooping away (darker, narrower); `shaft` the crownshaft's ramp (None: a fibrous boss) of radius trunk_r."""
    cv = Cv(S, S)
    c0, s = S / 2, cv.s
    rng = random.Random(seed)
    K = 18
    order = sorted(range(len(fronds)), key=lambda i: (0 if fronds[i][4] == 2 else 1 if fronds[i][4] == 0 else 2))
    for idx in order:
        a, ln, wid, bend, kind = fronds[idx]
        fr = Cv(S, S)
        pts = []
        for k in range(K):
            t = k / (K - 1.0)
            aa = a + bend * t * t
            r = trunk_r * 0.6 + ln * t
            pts.append((c0 + math.cos(aa) * r, c0 + math.sin(aa) * r))
        segs = []
        for k in range(K - 1):
            (ax, ay), (bx, by) = pts[k], pts[k + 1]
            dx, dy = bx - ax, by - ay
            segs.append((ax, ay, dx, dy, dx * dx + dy * dy))
        g = dead_col if kind == 2 else greens[1] if kind == 1 else greens[0]
        xs, ys = [p[0] for p in pts], [p[1] for p in pts]
        span = wid + 2
        phase = rng.uniform(0, 3)
        for j in range(max(0, int((min(ys) - span) * s)), min(cv.ph, int((max(ys) + span) * s) + 1)):
            for i in range(max(0, int((min(xs) - span) * s)), min(cv.pw, int((max(xs) + span) * s) + 1)):
                px_, py_ = (i + 0.5) / s, (j + 0.5) / s
                best = None
                for k, (ax, ay, dx, dy, ll) in enumerate(segs):
                    tt = max(0.0, min(1.0, ((px_ - ax) * dx + (py_ - ay) * dy) / ll))
                    qx, qy = px_ - ax - tt * dx, py_ - ay - tt * dy
                    d = qx * qx + qy * qy
                    if best is None or d < best[0]:
                        best = (d, (k + tt) / (K - 1.0), (qx * dy - qy * dx) / math.sqrt(ll))
                d, t, side = best
                d = math.sqrt(d)
                w = wid * math.sin(math.pi * min(1.0, t * 0.92 + 0.08)) ** 0.55 * (1.0 - 0.45 * t)
                if kind == 2:
                    w *= 0.7
                if d > w or t > 0.985 or t < 0.04:
                    continue
                q = t * ln * 0.9 - abs(side) * 1.5 + phase                # the leaflets slant out toward the tip
                f = q / 3.0 - math.floor(q / 3.0)
                if abs(side) < 0.55:
                    c = lt(g[2], 0.45) if kind != 2 else lt(g[2], 0.2)    # the rachis, pale
                else:
                    if f > (0.5 if kind == 2 else 0.62) and abs(side) > max(1.2, w * 0.38):
                        continue                                          # between two leaflets (open)
                    lit = side * (math.sin(a) * LX - math.cos(a) * LY) > 0
                    c = (g[3] if f < 0.3 else g[2]) if lit else (g[2] if f < 0.2 else g[1])   # each leaflet lit along one edge
                    if abs(side) > w * 0.78:
                        c = dk(c, 0.18)                                   # the leaflets' tips droop
                    if t > 0.72:
                        c = dk(c, 0.12 + (t - 0.72) * 0.5)                # the frond's end bends down, away
                    if kind == 2 and rng.random() < 0.12:
                        c = dk(c, 0.25)
                fr.p[i, j] = c
        leaf_over(cv, fr)
    top = Cv(S, S)
    if shaft:
        # the heart of the crown: the fronds' sheaths wrapped round the spear leaf, matte (seen from above, the
        # crownshaft is hidden under them: no glossy ball), creased where the sheaths overlap
        fill_shape(top, c0, c0, trunk_r * 0.72, trunk_r * 0.72, lambda u, v, L: shade(shaft, 0.18 + L * 0.6))
        for k in range(5):
            aa = k * 2 * math.pi / 5 + 0.4
            line(top, c0 + math.cos(aa) * 0.6, c0 + math.sin(aa) * 0.6, c0 + math.cos(aa + 0.5) * trunk_r * 0.7,
                 c0 + math.sin(aa + 0.5) * trunk_r * 0.7, dk(shaft[1], 0.2))
        line(top, c0 - 0.5, c0 - 0.5, c0 + 1.0, c0 - trunk_r * 0.6, lt(shaft[3], 0.15))   # the spear leaf
    else:
        boots(top, c0, trunk_r, random.Random(seed + 7))
    leaf_over(cv, top)
    return cv


def royal_palm(seed, n, dead):
    def make():
        """A royal palm from above (hung high: its trunk, smooth and pale grey, is the pole drawn up to it): sixteen
        long fronds arching out 2.1 to 2.4 m from the green crownshaft (a crown 4.5 to 5 m across: at 6 m it hung over
        every sign near it), plumed with leaflets, their ends dropping away; `dead` brown ones hanging under them, a
        few young ones up in the middle."""
        S = 160
        rng = random.Random(seed)
        greens = PALM_GREENS['royal']
        fronds = []
        for i in range(n):
            a = i * 2 * math.pi / n + rng.uniform(-0.16, 0.16)
            fronds.append((a, rng.uniform(64.0, 74.0), rng.uniform(8.5, 10.5), rng.uniform(-0.3, 0.3), 0))
        for i in range(5):
            a = rng.uniform(0, 2 * math.pi)
            fronds.append((a, rng.uniform(28.0, 38.0), 6.0, rng.uniform(-0.2, 0.2), 1))
        for i in range(dead):
            a = rng.uniform(0, 2 * math.pi)
            fronds.append((a, rng.uniform(33.0, 43.0), 7.5, rng.uniform(-0.15, 0.15), 2))
        return palm_crown(S, seed, fronds, greens, PALM_DEAD, ramp('#3a7a44', 0.5, 0.26, 0.3), 7.0)
    return make


STRAW = PALM_DEAD                                # a dead frond, standing or fallen (the palms' family)


def fan_leaf(ly, hxc, hyc, a, R, g, spread, nseg, rng, torn=(), dead=False, droop=0.7, split=0.42):
    """A palmetto's fan leaf from above, opening at (hxc, hyc) toward `a`: its segments fused at the heart, split
    beyond, each folded along its middle (one half lit, the other shaded), their tips split and drooping away (darker),
    the middle ones longest; `torn` segments broken short."""
    lens = [rng.uniform(0.8, 1.05) for _ in range(nseg)]

    def f(x, y, cur):
        dx, dy = x - hxc, y - hyc
        d = math.hypot(dx, dy)
        if d < 0.4:
            return None
        rel = (math.atan2(dy, dx) - a + math.pi) % (2 * math.pi) - math.pi
        if abs(rel) > spread:
            return None
        k = (rel + spread) / (2 * spread) * nseg
        seg, fr = int(k), k - int(k)
        reach = R * (0.6 + 0.4 * math.cos(rel / spread * math.pi / 2) ** 0.7) * lens[min(seg, nseg - 1)]
        if seg in torn:
            reach *= 0.5
        if d > reach:
            return None
        t = d / reach
        if t > split:
            gap = 0.12 + (t - split) / (1 - split) * 0.3                   # the segments narrow to their points
            if fr < gap or fr > 1 - gap + 0.04:
                return None                                                # between two segments
        if t > 0.8 and 0.44 < fr < 0.56:
            return None                                                    # each tip split in two
        th = a + rel
        nx, ny = (math.sin(th), -math.cos(th)) if fr < 0.5 else (-math.sin(th), math.cos(th))
        c = shade(g, 0.22 + 0.62 * light(nx * 0.8, ny * 0.8))
        if abs(fr - 0.5) < 0.07:
            c = g[2]                                                       # the fold
        if t > droop:
            c = dk(c, (t - droop) * 0.7)                                   # the ends hang away from the light
        if dead and rng.random() < 0.14:
            c = dk(c, 0.22)
        return c
    px_paint(ly, hxc - R - 1, hyc - R - 1, hxc + R + 1, hyc + R + 1, f)


def boots(cv, c0, r, rng):
    """The old leaf bases (boots) crisscrossing round a palmetto's crown, its trunk's top."""
    bark = ramp('#6a5038', 0.5, 0.26, 0.3)

    def f(dx, dy, d):
        a = math.atan2(dy, dx)
        q = (a * 5 / math.pi + d * 0.6) % 1.0
        q2 = (-a * 5 / math.pi + d * 0.6) % 1.0
        k = 0.25 + light(dx / r, dy / r) * 0.6 - (0.25 if min(q, q2) < 0.18 else 0)
        return shift(shade(bark, k), rng.randint(-5, 5))
    ring(cv, c0, c0, 0.0, r, f)


def sabal_palm(S, seed, n, dead, ragged=0.0):
    def make():
        """A sabal palmetto (cabbage palm) from above, the suburb's palm: a rounder, scruffier crown than a royal's, of
        fan leaves on long stalks, `dead` brown ones hanging under the green, a few young ones up in the middle, the
        boots of old leaves crisscrossing round its top (its rough trunk is the pole drawn up to it); `ragged`: the
        odds a segment is torn short."""
        cv = Cv(S, S)
        rng = random.Random(seed)
        c0 = S / 2
        leaves = [(rng.uniform(0, 2 * math.pi), rng.uniform(7, 12), rng.uniform(14, 19), 2) for _ in range(dead)]
        for i in range(n):
            leaves.append((i * 2 * math.pi / n + rng.uniform(-0.22, 0.22), rng.uniform(S * 0.15, S * 0.21), rng.uniform(S * 0.2, S * 0.25), 0))
        leaves += [(rng.uniform(0, 2 * math.pi), rng.uniform(6, 9), rng.uniform(12, 16), 1) for _ in range(4)]
        for (a, r0, R, kind) in leaves:
            ly = Cv(S, S)
            g = PALM_DEAD if kind == 2 else PALM_GREENS['sabal'][kind]
            hxc, hyc = c0 + math.cos(a) * r0, c0 + math.sin(a) * r0
            torn = {k for k in range(13) if rng.random() < ragged} if kind == 0 else ()
            fan_leaf(ly, hxc, hyc, a, R, g, 1.1 if kind == 2 else 1.45, 8 if kind == 2 else 10, rng, torn, kind == 2,
                     0.5 if kind == 2 else 0.7)
            fill_capsule(ly, [(c0 + math.cos(a) * 3, c0 + math.sin(a) * 3), (hxc, hyc), (hxc + math.cos(a) * R * 0.4, hyc + math.sin(a) * R * 0.4)],
                         0.75, lambda k, L, s, i, t, g=g: shade(g, 0.5 + L * 0.35))   # the stalk, its costa into the fan
            leaf_over(cv, ly)
        top = Cv(S, S)
        boots(top, c0, 4.5, rng)
        leaf_over(cv, top)
        return cv
    return make


def p_coconut_palm_lean():
    """A coconut palm leaning out over the sidewalk, from above, its foot at the sprite's middle: the trunk, ringed
    with leaf scars and flared at its foot, curving up and out 3 m to its crown (yellow-green fronds, a few dead
    ones, young ones up in the middle) with its coconuts clustered round the heart. The trunk is painted (no pole)."""
    W, H = 288, 112
    cv = Cv(W, H)
    rng = random.Random(10301)
    bx, by = W / 2, H / 2
    cx, cy = W / 2 + 98, H / 2 - 8
    pts = curve((bx, by), (bx + 60, by + 6), (cx, cy), 20)
    bark = ramp('#8a7458', 0.5, 0.26, 0.3)
    fill_shape(cv, bx, by, 5.4, 5.4, lambda u, v, L: shade(bark, 0.15 + L * 0.5))   # the flare at its foot
    run = 0.0
    for k in range(len(pts) - 1):
        (ax, ay), (qx, qy) = pts[k], pts[k + 1]
        seg = math.hypot(qx - ax, qy - ay)
        r = 4.0 - 1.2 * k / (len(pts) - 1)

        def f(kk, L, s, i, t, run=run, seg=seg, k=k):
            along = run + t * seg
            lit = 0.28 + L * 0.5 + 0.2 * k / (len(pts) - 1)               # higher, nearer the light
            if (along % 3.3) < 0.7:
                lit -= 0.22                                                 # its rings
            return shade(bark, lit)
        fill_capsule(cv, [(ax, ay), (qx, qy)], r, f)
        run += seg
    cv.outline()
    greens = PALM_GREENS['coconut']
    fronds = [(i * 2 * math.pi / 13 + rng.uniform(-0.18, 0.18), rng.uniform(32, 38), rng.uniform(8, 10), rng.uniform(-0.45, 0.45), 0) for i in range(13)]
    fronds += [(rng.uniform(0, 2 * math.pi), rng.uniform(26, 30), 7.0, rng.uniform(-0.2, 0.2), 2) for _ in range(3)]
    fronds += [(rng.uniform(0, 2 * math.pi), rng.uniform(16, 20), 6.0, 0.0, 1) for _ in range(4)]
    crown = palm_crown(88, 10302, fronds, greens, PALM_DEAD, None, 4.0)
    nuts = Cv(88, 88)
    for (dx, dy, col) in ((-4.2, 2.0, '#7a5a22'), (-1.2, 4.6, '#5a7a2a'), (3.2, 3.6, '#7a5a22'), (4.4, -1.4, '#6a8a2a'), (0.2, -4.6, '#7a5a22')):
        fill_shape(nuts, 44 + dx, 44 + dy, 2.4, 2.4, lambda u, v, L, col=col: shade(ramp(col, 0.5, 0.25, 0.35), 0.15 + L * 0.75))
    leaf_over(crown, nuts)
    cv.over(crown, int(cx - 44), int(cy - 44))
    return cv


def p_palm_young():
    """A young royal palm planted in a sidewalk grate, from above (the grate is floor paint, tree_grate; its thin
    trunk is the pole): eight fronds arching out a metre, two young ones up in the middle, one gone brown."""
    greens = PALM_GREENS['royal']
    rng = random.Random(10311)
    fronds = [(i * 2 * math.pi / 8 + rng.uniform(-0.2, 0.2), rng.uniform(24, 28), rng.uniform(6.5, 7.5), rng.uniform(-0.3, 0.3), 0) for i in range(8)]
    fronds += [(rng.uniform(0, 2 * math.pi), 13.0, 5.0, 0.0, 1) for _ in range(2)]
    fronds += [(rng.uniform(0, 2 * math.pi), 20.0, 5.5, 0.1, 2)]
    return palm_crown(64, 10312, fronds, greens, PALM_DEAD, ramp('#3a7a44', 0.5, 0.26, 0.3), 3.2)


def p_palm_stump():
    """What is left of a palm cut down, from above, 0.55 m: the rough grey-brown rind round a pale fibrous cut face
    speckled with its bundles, weathered dark at the heart, split by drying cracks, a sprout of grass at its foot."""
    S = 20
    cv = Cv(S, S)
    rng = random.Random(10321)
    c = S / 2
    rind = ramp('#6a5a48', 0.5, 0.26, 0.3)
    face = ramp('#c8b08a', 0.45, 0.22, 0.25)
    ring(cv, c, c, 0.0, 8.6, lambda dx, dy, d: shift(shade(rind, 0.2 + light(dx / 9, dy / 9) * 0.6), rng.randint(-8, 8)))

    def cut(dx, dy, d):
        k = 0.6 - 0.25 * (1 - d / 7.0) + (rng.random() - 0.5) * 0.18
        col = shade(face, k)
        if rng.random() < 0.18:
            col = dk(col, 0.25)                                            # the fibres' ends
        return col
    ring(cv, c, c, 0.0, 7.0, cut)
    for a in (0.4, 2.3, 4.1):
        crease(cv, [(c + math.cos(a) * 1.0, c + math.sin(a) * 1.0), (c + math.cos(a + 0.2) * 4.0, c + math.sin(a + 0.2) * 4.0),
                    (c + math.cos(a) * 6.8, c + math.sin(a) * 6.8)], 0.4)
    smudge(cv, rng, 3, (6, 6, 14, 14), (1.5, 3.0), 0.2)
    cv.outline()
    for (x, y) in ((2.5, 15.0), (3.5, 16.5), (16.5, 3.0), (17.5, 4.5)):
        line(cv, x, y, x + rng.uniform(-1, 1), y - 1.5, hx('#5a8a3a'))
    return cv


def p_palm_frond_fallen():
    """A dead palm frond lying where it fell (floor paint), 2.7 m: the boot of its base, the pale rachis tapering
    away along x with a little curl, the brown leaflets combed forward both sides, flattened, some broken off."""
    W, H = 88, 28
    cv = Cv(W, H)
    rng = random.Random(10331)

    def spine(x):
        return 14.0 + 3.0 * math.sin(x / W * math.pi * 1.2) - 0.0004 * (x - 10) ** 2 * 3

    for x0 in range(10, W - 4, 2):
        if rng.random() < 0.12:
            continue
        t = (x0 - 10) / (W - 14)
        ln = 9.5 * (1 - t * 0.75) * rng.uniform(0.7, 1.05)
        for side in (-1, 1):
            if rng.random() < 0.08:
                continue
            col = shade(STRAW, rng.uniform(0.25, 0.75))
            y0 = spine(x0)
            ax = x0 + ln * 0.7
            ay = y0 + side * ln * rng.uniform(0.55, 0.75)
            line(cv, x0, y0, ax, ay, col)
            line(cv, x0 + 0.5, y0, ax + 0.5, ay, dk(col, 0.2))
    fill_capsule(cv, [(6, spine(6)), (30, spine(30)), (60, spine(60)), (W - 3, spine(W - 3))], 0.9,
                 lambda k, L, s, i, t: shade(STRAW, 0.6 + L * 0.3))         # the rachis
    fill_shape(cv, 6, spine(6), 6.0, 3.6, lambda u, v, L: shade(ramp('#7a5a3a', 0.5, 0.26, 0.3), 0.2 + L * 0.6), ang=0.1)   # its boot
    cv.outline(hx('#2a1a10'))
    return cv


def p_sabal_frond_fallen():
    """A palmetto's fan leaf blown down (floor paint), 2 m: the long stalk, the fan dried brown and gone limp, its
    segments splayed flat."""
    W, H = 64, 44
    cv = Cv(W, H)
    rng = random.Random(10341)
    fan_leaf(cv, 30, 22, 0.15, 22, ramp('#8a6a40', 0.55, 0.3, 0.25), 2.0, 12, rng, {2, 9}, True, 0.6)
    fill_capsule(cv, [(2, 26), (16, 24), (36, 22)], 0.85, lambda k, L, s, i, t: shade(STRAW, 0.55 + L * 0.3))
    cv.outline(hx('#2a1a10'))
    return cv


def p_coconuts_fallen():
    """Coconuts fallen in a palm's litter (floor paint), 1.25 m: three in their husks (brown, one still green), one
    split open on the fibres, the boat of a dried flower spathe."""
    W, H = 40, 26
    cv = Cv(W, H)
    rng = random.Random(10351)
    fill_capsule(cv, [(4, 20), (14, 22), (24, 21)], 2.2, lambda k, L, s, i, t: shade(ramp('#9a7a4a', 0.5, 0.26, 0.3), 0.25 + L * 0.5 - (0.2 if k < 0.4 else 0)))
    for (x, y, col, rx, ry, a) in ((10, 9, '#7a5a22', 4.0, 3.2, 0.3), (19, 12, '#5a7a2a', 4.2, 3.4, -0.4), (31, 8, '#7a5a22', 3.8, 3.1, 1.2)):
        fill_shape(cv, x, y, rx, ry, lambda u, v, L, col=col: shift(shade(ramp(col, 0.5, 0.25, 0.35), 0.15 + L * 0.75), rng.randint(-6, 6)), ang=a)
    fill_shape(cv, 32, 19, 3.6, 2.6, lambda u, v, L: shade(ramp('#8a6a42', 0.5, 0.25, 0.3), 0.2 + L * 0.6), ang=0.5)
    fill_shape(cv, 32.3, 19.2, 2.2, 1.5, lambda u, v, L: hx('#f0ead8'), ang=0.5)   # split: its white flesh
    for (x, y) in ((27.0, 22.0), (37.0, 16.5), (29.0, 15.5)):
        line(cv, x, y, x + rng.uniform(-2, 2), y + rng.uniform(-2, 2), hx('#a0804a'))   # fibres
    cv.outline(hx('#1a0c10'))
    return cv


GROUP = 'props'
SPRITES = {
    'palm_fan': (palm_fan(10101), (96, 96), 'fine', (9, 9)),
    'palm_fan_small': (palm_fan(10102, 0.8), (96, 96), 'fine', (9, 9)),
    'royal_palm': (royal_palm(10161, 16, 2), (160, 160), 'fine', (16, 16)),
    'royal_palm_b': (royal_palm(10162, 14, 4), (160, 160), 'fine', (16, 16)),
    'palm_frond_fallen': (p_palm_frond_fallen, (88, 28), 'fine floor'),
    'sabal_frond_fallen': (p_sabal_frond_fallen, (64, 44), 'fine floor'),
    'coconuts_fallen': (p_coconuts_fallen, (40, 26), 'fine floor'),
    'sabal_palm': (sabal_palm(112, 10281, 12, 3), (112, 112), 'fine', (12, 12)),
    'sabal_palm_b': (sabal_palm(104, 10282, 10, 4, 0.08), (104, 104), 'fine', (12, 12)),
    'sabal_palm_ragged': (sabal_palm(112, 10283, 10, 8, 0.22), (112, 112), 'fine', (12, 12)),
    'coconut_palm_lean': (p_coconut_palm_lean, (288, 112), 'fine', (10, 10)),
    'palm_young': (p_palm_young, (64, 64), 'fine', (6, 6)),
    'palm_stump': (p_palm_stump, (20, 20), 'fine', (16, 16)),
    'palm_tree': (p_palm_tree, (104, 104), 'fine', (9, 9)),
}
