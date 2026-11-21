"""The people (CHARS: the guards, the runner, the boss and his men, the civilians and the dancers): standing,
torso and head at FINE density (the arms are the game's, render/LimbArt.js), knocked down, the gibs, and the parts of
a body on the floor (entities/Ragdoll.js) at the world's density. A painter seeds itself by a character's place in
CHARS: a new one goes at the end."""
import math
import random

from PIL import Image

from .core import (
    ascii_cv, CLEAR, curve, Cv, dk, fill_shape, FINE, hx, lt, LX, LY, LZ, mottle, OUTLINE, ramp, smudge, tidx
)
from .palette import FLUO, WHITE


GORE_OL = hx('#2a0812')
BLOOD = ramp('#a3101e', 0.5, 0.28, 0.25)
FLESH = hx('#e8687e')
FLESH_L = hx('#ff9fb0')
BONE = hx('#f2ead2')
BONE_D = hx('#c4b494')


# --------------------------------------------------------------------------
# Characters
# --------------------------------------------------------------------------

SKIN = ramp('#eab08a', 0.46, 0.22, 0.3)
CHARS = {
    # the runner (the user's pick, 2026-11-18): a dark cap with a low crown and a short flat brim, brown hair down to
    # his collar, a Mediterranean tan, a petrol gaiter up over his nose inside a funnel collar closed round his neck,
    # a long ink-blue duster whose skirt flies behind him (player_tail), a tab on each shoulder, the strap of a leather
    # satchel across it and the satchel on his left hip, behind, jeans and boots. Dark from head to foot (the user
    # found a bright cyan lining ugly and out of place): the lining, the brim's front edge, the cap's button and the
    # coat's buttons are a deep petrol blue, a quiet accent.
    'player': dict(kind='player', top=ramp('#3a4460', 0.5, 0.25, 0.35), sleeve=None,
                   pants=ramp('#3c4a66'), shoe=ramp('#3a2a22', 0.4, 0.2, 0.3),
                   hair=ramp('#4a2e1c', 0.5, 0.25, 0.45), cap=ramp('#2c303c', 0.45, 0.22, 0.5),
                   lining=ramp('#2a6a7c', 0.45, 0.22, 0.3), knit=ramp('#868c98', 0.45, 0.22, 0.3),
                   strap=ramp('#8a5630', 0.45, 0.22, 0.35), skin=ramp('#dba274', 0.46, 0.22, 0.3), sh=(4.0, 8.0)),
    'thug': dict(kind='thug', top=ramp('#e6e0cf', 0.42, 0.2, 0.5), pants=ramp('#2a2632'),
                 shoe=ramp('#1e1820', 0.3, 0.15, 0.25), hair=ramp('#3a2c48', 0.55, 0.3, 0.45),
                 shirt=ramp('#2a2236'), skin=SKIN, sh=(4.0, 8.0)),
    'heavy': dict(kind='heavy', top=ramp('#4b2470', 0.5, 0.25, 0.3), pants=ramp('#4b2470', 0.5, 0.25, 0.3),
                  shoe=ramp('#ecebf2', 0.4, 0.2, 0.2), skin=ramp('#d9a07a', 0.46, 0.22, 0.3), sh=(4.6, 9.3)),
    'brute': dict(kind='brute', top=ramp('#b8262c', 0.5, 0.24, 0.3), pants=ramp('#4c4a2c'),
                  shoe=ramp('#5a3a22'), bandana=ramp('#d8303c', 0.5, 0.24, 0.3),
                  skin=ramp('#c88a60', 0.46, 0.22, 0.3), sh=(4.3, 8.4)),
}


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
    if k == 'cueball':
        return cueball_top_px(ch, u, v, L, r)
    if k == 'player':
        d = math.hypot(u, v)
        if u < -0.7 and d > r * 0.72:
            return ch['hair'][i if int(math.floor(v * 1.3 + 40)) % 2 else max(0, i - 1)]   # his hair, under the cap
        cap = ch['cap']
        if d < 0.8:
            return ch['lining'][1]                                                          # the button
        if abs(v) < 0.2 or abs(v * 0.5 + u * 0.87) < 0.2 or abs(v * 0.5 - u * 0.87) < 0.2:
            return cap[max(0, i - 1)]                                                       # the seams of its panels
        return cap[i]
    if u > r - 1.55:
        return ch['skin'][i]
    if k in ('thug', 'boss'):
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
    if k == 'player':
        if hr + 0.1 < hd < hr + 0.6:
            return ch['lining'][1]               # the funnel collar's petrol rim, all round his neck
        if hr + 0.6 <= hd < hr + 1.8:
            if hu > 0 and abs(hv) < 0.3:
                return ch['top'][0]              # where it closes, in front
            if hu > 0 and 0.9 < hv < 1.5:
                return ch['lining'][2] if hd > hr + 1.2 else ch['top'][1]   # the throat tab and its button
            if hu < 0 and abs(abs(hv) - hr * 0.7) < 0.3:
                return ch['top'][max(0, i - 1)]  # its seams, behind
            return ch['top'][min(2, i + 1)]
        if abs(0.782 * u - 0.624 * v + 0.85) < 0.5:
            return ch['strap'][i]                # the satchel's strap: right shoulder in front, left hip behind
        if abs(u) < 1.3 and 4.0 < abs(v) < 7.2:  # a tab on each shoulder, a petrol button at its end
            if abs(u) < 0.3 and abs(abs(v) - 6.2) < 0.3:
                return ch['lining'][2]
            if abs(u) > 0.8 or abs(v) > 6.8:
                return ch['top'][max(0, i - 1)]
        return ch['top'][i]
    if k == 'thug' and hr + 0.1 < hd < hr + 1.3 and hu > -0.5:
        return ch['shirt'][1]
    if k == 'boss' and hr + 0.1 < hd < hr + 1.1 and hu > -1.2:
        return ch['top'][min(3, i + 1)]          # the suit's collar, up round his thick neck
    if k == 'cueball':
        return cueball_shoulder_px(ch, u, v, i, hd, hr)
    return ch['top'][i]


def lump(u, v, rx, ry, hz, p=2.0):
    """Height of a half ellipsoid (radii rx, ry, height hz) at (u, v) from its centre; <= 0 outside it."""
    e = (abs(u) / rx) ** p + (abs(v) / ry) ** p
    return hz * math.sqrt(1.0 - e) if e < 1.0 else 0.0


def relief_paint(cv, hfun, colour, box=None):
    """Paint the pixels where the height field hfun(x, y) > 0, each lit by the field's own slope (one light for the
    whole figure, from behind and to the left of it as all the sprites are): shoulders, a skull, clumps of hair read as
    the round things they are, and where two of them meet shows as a crease. colour(x, y, L) -> rgba. Then a selective
    dark outline: the ink colour, softened to a deep shade of the cloth along its lit edge. Returns {(x, y): L}."""
    x0, y0, x1, y1 = box or (0, 0, cv.w - 1, cv.h - 1)
    H = {}
    for y in range(y0, y1 + 1):
        for x in range(x0, x1 + 1):
            h = hfun(x + 0.5, y + 0.5)
            if h > 0:
                H[(x, y)] = h
    Ls = {}
    for (x, y), h in H.items():
        gx = (H.get((x + 1, y), 0.0) - H.get((x - 1, y), 0.0)) * 0.5
        gy = (H.get((x, y + 1), 0.0) - H.get((x, y - 1), 0.0)) * 0.5
        n = math.sqrt(gx * gx + gy * gy + 1.0)
        L = max(0.0, (-gx * LX - gy * LY + LZ) / n)
        Ls[(x, y)] = L
        c = colour(x, y, L)
        if c is not None:
            cv.set(x, y, c)
    add = []
    for (x, y) in H:
        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            q = (x + dx, y + dy)
            if q not in H and cv.ok(*q) and cv.get(*q)[3] < 100:
                lit = Ls[(x, y)] > 0.8 and dx + dy < 0     # the edge toward the light
                add.append((q, dk(cv.get(x, y), 0.62) if lit else OUTLINE))
    for (x, y), c in add:
        cv.set(x, y, c)
    return Ls


def fold(cv, pts, ok, t=0.17):
    """A crease of cloth along a curve through pts (pixel coords): a dark line, and the ridge beside it on the side of
    the light a shade lighter. ok(x, y): the pixel is cloth."""
    seen = set()
    for i in range(len(pts) - 1):
        (ax, ay), (bx, by) = pts[i], pts[i + 1]
        n = int(max(abs(bx - ax), abs(by - ay)) * 2) + 1
        for k in range(n + 1):
            x, y = int(ax + (bx - ax) * k / n), int(ay + (by - ay) * k / n)
            if (x, y) in seen or not ok(x, y):
                continue
            seen.add((x, y))
            cv.set(x, y, dk(cv.get(x, y), t))
            if ok(x - 1, y - 1) and (x - 1, y - 1) not in seen:
                cv.set(x - 1, y - 1, lt(cv.get(x - 1, y - 1), t * 0.5))


BODY_C = (9.6, 10.0)   # the middle of the shoulders on the 20 x 20 (world px) torso sprite; the head's is (11, 10)


def torso_body(ch, rng):
    """The shoulders from above at FINE density, the arms left off (the game paints them, render/LimbArt.js): a
    chest-and-back, two round shoulder caps, the upper back bulging behind, each lit as the volume it is, then what
    cloth has: creases from the armpits down the back, the sleeve heads, a seam down the back, grime."""
    S, W = FINE, ch.get('canvas', 20) * FINE
    rx, ry = ch['sh'][0] * S, ch['sh'][1] * S
    pad = (W - 20 * FINE) / 2                        # a wider man's canvas grows round the same middle
    cx, cy = BODY_C[0] * S + pad, BODY_C[1] * S + pad
    hr = ch.get('head', 3.8) * S
    k, st = ch['kind'], ch.get('style')
    cap = ry * 0.38                                  # a shoulder cap's half width

    def h(x, y):
        u, v = x - cx, y - cy
        return max(lump(u + 0.3 * S, v, rx * 0.98, ry * 0.66, 7.0, 2.2),            # chest and back
                   lump(u + rx * 0.34, v, rx * 0.7, ry * 0.84, 6.0),                 # the upper back, behind
                   lump(u - 0.5 * S, v - (ry - cap), rx * 0.88, cap, 5.6),           # the shoulder caps, rolled
                   lump(u - 0.5 * S, v + (ry - cap), rx * 0.88, cap, 5.6))           # a little forward

    def colour(x, y, L):
        u, v = x + 0.5 - cx, y + 0.5 - cy
        c = shoulder_px(ch, u / S, v / S, L, (u - 1.4 * S) / S, v / S, hr / S)
        if k != 'brute' and st != 'dancer' and abs(abs(v) - (ry - cap * 1.7)) < 0.6 and abs(u) < rx * 0.7:
            c = dk(c, 0.12)                          # where the sleeve is sewn on
        if abs(v) < 0.55 and u < -1.5 * S and st != 'dancer':
            c = dk(c, 0.16)                          # the seam down the back
        return c
    body = Cv(W, W)
    relief_paint(body, h, colour)

    def cloth(x, y):
        c = body.get(x, y)
        if c[3] < 100 or c == OUTLINE:
            return False
        u, v = x + 0.5 - cx, y + 0.5 - cy
        if math.hypot(u - 1.4 * S, v) < hr + 1.2 * S:
            return False                             # under the head
        if k == 'brute':
            return abs(v) < 4.4 * S                  # his vest; bare shoulders
        if st == 'dancer':
            return -0.9 * S < u < 0.2 * S
        return True
    # creases: from each armpit round under the shoulder blade toward the small of the back, and one off the collar
    for sgn in (-1, 1):
        j = lambda: rng.uniform(-0.6, 0.6) * S
        fold(body, curve((cx + 0.4 * S + j(), cy + sgn * (ry - 2.2 * S)), (cx - 1.8 * S, cy + sgn * (ry - 1.6 * S) + j()),
                         (cx - rx + 1.3 * S, cy + sgn * (ry * 0.36) + j())), cloth)
        fold(body, curve((cx - 0.8 * S + j(), cy + sgn * (ry - 3.6 * S)), (cx - 2.2 * S, cy + sgn * 2.8 * S + j()),
                         (cx - rx + 1.0 * S, cy + sgn * 1.5 * S)), cloth, t=0.12)
    if k == 'thug' or st == 'suit':
        # shirt collar and tie in front of the neck, the lapels' notch either side
        shirt, tie = (ch['shirt'], hx('#8a1a3a')) if k == 'thug' else (WHITE, hx('#b8202a'))
        for dv in range(-3, 4):
            for du in range(0, 4 - abs(dv)):
                x, y = int(13.0 * S + du), int(10.0 * S + dv)
                if body.on(x, y):
                    body.set(x, y, tie if dv == 0 else shirt[2] if abs(dv) < 2 else shirt[1])
        for sgn in (-1, 1):
            for i in range(4):
                x, y = int(12.2 * S + i), int(10.0 * S + sgn * (4 + i * 0.9))
                if body.on(x, y):
                    body.set(x, y, dk(body.get(x, y), 0.3))
    if k == 'boss':
        # in front of his neck: the black shirt's open collar, his chest in its V, the chain on it; the jacket's lapels
        shirt, chain, sk = ch['shirt'], ch['chain'], ch['skin']
        for dv in range(-5, 6):
            for du in range(0, 6 - abs(dv) // 2):
                x, y = int(13.6 * S + du), int(10.0 * S + dv)
                if not body.on(x, y):
                    continue
                if abs(dv) <= 1 + du // 2:
                    c = sk[2] if du < 3 else sk[1]
                    if abs(abs(dv) - (1 + du // 2)) < 1 and du in (2, 3):
                        c = chain[3] if dv < 0 else chain[2]
                elif abs(dv) <= 3 + du // 2:
                    c = shirt[2] if dv < 0 else shirt[1]
                else:
                    c = ch['top'][3] if dv < 0 else ch['top'][1]
                body.set(x, y, c)
        for sgn in (-1, 1):
            for i in range(5):
                x, y = int(12.4 * S + i), int(10.0 * S + sgn * (5.4 + i * 0.8))
                if body.on(x, y):
                    body.set(x, y, dk(body.get(x, y), 0.28))   # the lapel's edge
    if k == 'cueball':
        cueball_jacket(body, ch, cx, cy, rx, ry)
    mottle(body, rng, amt=4, cell=4)
    smudge(body, rng, 3, (6, 6, W - 7, W - 7), r=(1.5, 3.0), t=0.14)
    return body


def hair_clumps(rng, cx, cy, rx, ry, crown, length=6.0, width=2.8, step=3.0, flow=0.0):
    """Clumps of hair over an oval (pixel coords): each a small ridge along the way it is combed, from the crown
    outward (flow > 0 bends them toward the back of the head, -x)."""
    out = []
    y = cy - ry
    while y <= cy + ry:
        x = cx - rx
        while x <= cx + rx:
            px_, py_ = x + rng.uniform(-0.7, 0.7), y + rng.uniform(-0.7, 0.7)
            if ((px_ - cx) / rx) ** 2 + ((py_ - cy) / ry) ** 2 <= 1.15:
                dx, dy = px_ - crown[0], py_ - crown[1]
                a = math.atan2(dy, dx) if dx * dx + dy * dy > 0.5 else math.pi
                a = math.atan2(math.sin(a) * (1 - flow), math.cos(a) * (1 - flow) - flow)
                out.append((px_, py_, a, length * rng.uniform(0.8, 1.2), width * rng.uniform(0.85, 1.15)))
            x += step
        y += step * 0.87
    return out


def clump_h(clumps, x, y):
    """Height the clumps add at (x, y): the highest one there."""
    best = 0.0
    for (cx, cy, a, l, w) in clumps:
        u = (x - cx) * math.cos(a) + (y - cy) * math.sin(a)
        v = -(x - cx) * math.sin(a) + (y - cy) * math.cos(a)
        best = max(best, lump(u, v, l * 0.5, w * 0.5, 1.1))
    return best


def clump_tone(ramp_, clumps, x, y, L):
    """A pixel of hair: a shade darker between two clumps, the light only on the top of a clump that faces it."""
    c = clump_h(clumps, x + 0.5, y + 0.5)
    i = min(2, tidx(L))
    if c < 0.45:
        return ramp_[max(0, i - 1)]
    if c > 0.85 and L > 0.86:
        return ramp_[3]
    return ramp_[i]


def torso_head(ch, rng):
    """The head from above at FINE density, face toward +x, on a 40 x 40 canvas laid like the torso's: a skull lit as
    a skull, hair in clumps combed the way it goes (or a cap, a hood, a bandana over it), the brow and the nose at the
    front, the ears."""
    S, W = FINE, 20 * FINE
    k, st = ch['kind'], ch.get('style')
    hcx, hcy, hr = 11.0 * S, 10.0 * S, ch.get('head', 4.1 if k == 'boss' else 3.8) * S
    head = Cv(W, W)
    skull = lambda x, y: lump(x - hcx, y - hcy, hr, hr * 0.94, hr * 0.95)
    face = lambda x, y, edge: x + 0.5 - hcx > hr - edge * S and abs(y + 0.5 - hcy) < hr * 0.8

    def face_px(x, y, L):
        u, v = x + 0.5 - hcx, y + 0.5 - hcy
        if abs(v) < 1.2 and u > hr - 1.4:
            return lt(ch['skin'][2], 0.25)           # the bridge of the nose catches the light
        return ch['skin'][1] if u < hr - 0.9 * S else ch['skin'][tidx(L)]   # the brow in shadow

    if k == 'player':
        # his hair down to his collar out from under the cap; the cap: a low crown in six panels to its button, a short
        # flat brim as wide as his brow with a petrol front edge and a line of shadow where it leaves the crown
        hair = ch['hair']
        cl = hair_clumps(rng, hcx - 2.8 * S, hcy, 3.0 * S, 3.7 * S, (hcx, hcy), length=6.4, width=2.8, flow=0.5)
        relief_paint(head, lambda x, y: max(lump(x - hcx + 2.6 * S, y - hcy, 3.0 * S, 3.6 * S, 4.0) + clump_h(cl, x, y)
                                            * (1 if lump(x - hcx + 2.6 * S, y - hcy, 3.0 * S, 3.6 * S, 1) > 0 else 0), 0),
                     lambda x, y, L: clump_tone(hair, cl, x, y, L))
        capc, lin = ch['cap'], ch['lining']
        brim = Cv(W, W)
        for dv in range(-6, 6):
            v = dv + 0.5
            if abs(v) > 5.2:
                continue
            tip = hcx + hr + 5.6 - (abs(v) / 5.2) ** 4 * 2.0
            for x in range(int(hcx + 2), int(tip) + 1):
                brim.set(x, int(hcy + dv), lin[2] if x >= int(tip) else capc[3] if -4 < v < -2.5 else
                         capc[2] if v < 2.5 else capc[1])
        brim.outline()
        head.over(brim)

        def cap_px(x, y, L):
            u, v = (x + 0.5 - hcx) / S, (y + 0.5 - hcy) / S
            i = tidx(L)
            if math.hypot(u, v) < 0.75:
                return lin[2]                        # the button
            if abs(v) < 0.18 or abs(v * 0.5 + u * 0.87) < 0.18 or abs(v * 0.5 - u * 0.87) < 0.18:
                return capc[max(0, min(2, i) - 1)]   # the seams of its panels
            if u > hr / S - 0.75 and abs(v) < 2.6:
                return capc[0]                       # the shadow where the brim leaves the crown
            if u < -hr / S + 0.8 and abs(v) < 1.3:
                return lin[1]                        # the strap's petrol tab, at the back
            return capc[3] if L > 0.95 else capc[min(2, i)]
        relief_paint(head, lambda x, y: lump(x - hcx, y - hcy, hr, hr * 0.96, hr * 1.0), cap_px)
    elif k == 'heavy':
        sk = ch['skin']
        relief_paint(head, skull, lambda x, y, L: lt(sk[2], 0.55) if L > 0.97 else sk[tidx(L)])
    elif k == 'cueball':
        cueball_dome(head, ch, skull, hcx, hcy, hr)
    elif k == 'brute':
        band = ch['bandana']

        def band_px(x, y, L):
            u, v = (x + 0.5 - hcx) / S, (y + 0.5 - hcy) / S
            if face(x, y, 1.5):
                return face_px(x, y, L)
            i = tidx(L)
            if u > hr / S - 2.4:
                return band[max(0, i - 1)]           # its folded edge over the brow
            if (int(math.floor(u * 1.4 + 20)) * 3 + int(math.floor(v * 1.4 + 20)) * 2) % 7 == 0 and i >= 2:
                return lt(band[2], 0.6)              # its print
            return band[i]
        relief_paint(head, skull, band_px)
        fold(head, curve((hcx - 1 * S, hcy - 3 * S), (hcx - 2.4 * S, hcy - 0.5 * S), (hcx - 3.4 * S, hcy + 0.5 * S)),
             lambda x, y: head.on(x, y) and head.get(x, y) != OUTLINE)
        for (x, y, c) in [(12, 18, 2), (11, 17, 2), (10, 16, 1), (9, 15, 1), (12, 21, 1), (11, 22, 1), (10, 23, 1),
                          (9, 24, 0), (13, 19, 3), (13, 20, 2)]:
            head.set(x, y, band[c])                  # the knot and its two tails
    elif st == 'hood':
        top = ch['top']

        def hood_px(x, y, L):
            u, v = (x + 0.5 - hcx) / S, (y + 0.5 - hcy) / S
            if u > hr / S - 1.4 and abs(v) < 2.2:
                return ch['skin'][max(0, tidx(L) - 1)] if abs(v) < 1.6 else ch['skin'][0]   # his face, in its shadow
            if u > hr / S - 2.2:
                return top[max(0, tidx(L) - 2)] if abs(v) < 2.8 else top[tidx(L)]   # the opening's rim
            return top[tidx(L)]
        relief_paint(head, lambda x, y: lump(x - hcx + 0.4 * S, y - hcy, hr + 0.9 * S, hr + 0.4 * S, hr), hood_px)
        fold(head, curve((hcx - 3.6 * S, hcy - 1 * S), (hcx - 1.4 * S, hcy - 0.4 * S), (hcx + 1.6 * S, hcy - 2.6 * S)),
             lambda x, y: head.on(x, y) and head.get(x, y) != OUTLINE)
    elif st == 'suit':
        sk, hair = ch['skin'], ch['hair']
        cl = hair_clumps(rng, hcx - 0.6 * S, hcy, hr, hr, (hcx + 5 * S, hcy), length=5.0, width=2.2, step=2.4)

        def bald_px(x, y, L):
            u, v = x + 0.5 - hcx, y + 0.5 - hcy
            if face(x, y, 1.4):
                return face_px(x, y, L)
            if math.hypot(u + 0.4 * S, v * 1.1) < hr * 0.7:
                return lt(sk[2], 0.4) if L > 0.97 else sk[min(3, tidx(L))]    # the bald crown, shining
            return clump_tone(hair, cl, x, y, L)                             # what is left round it
        relief_paint(head, skull, bald_px)
    elif st == 'trench':
        capc = ch['cap']

        def flat_px(x, y, L):
            u, v = (x + 0.5 - hcx) / S, (y + 0.5 - hcy) / S
            if u > hr / S - 1.1:
                return capc[max(0, tidx(L) - 2)]     # the visor
            if math.hypot(u + 0.4, v) < 0.8:
                return lt(capc[2], 0.3)              # the button on top
            return capc[tidx(L)]
        relief_paint(head, lambda x, y: lump(x - hcx, y - hcy, hr + 0.2 * S, hr, hr * 0.8, 2.3), flat_px)
        for dv in range(-5, 6):                      # its short brim, out over the brow
            tip = int(hcx + hr + 2.8 - abs(dv) * 0.35)
            for x in range(int(hcx + hr - 0.5), tip + 1):
                head.set(x, int(hcy + dv), capc[0] if x == int(hcx + hr - 0.5) else capc[1])
    else:
        # bare hair: slicked back (the guard), short, or long and full (down the back on the shoulders' sprite)
        hair = ch['hair']
        full = st in ('long', 'dancer')
        if k in ('thug', 'boss'):
            cl = hair_clumps(rng, hcx - 0.6 * S, hcy, hr, hr, (hcx + 6 * S, hcy), length=7.5, width=2.4, step=2.6)
        else:
            cl = hair_clumps(rng, hcx - 0.4 * S, hcy, hr + (0.6 if full else 0) * S, hr + (0.5 if full else 0) * S,
                             (hcx + 0.6 * S, hcy), length=7.0 if full else 5.6, width=3.2 if full else 2.8, flow=0.25)
        grow = 1.12 if full else 1.0

        def hh(x, y):
            base = lump(x - hcx + (0.4 * S if full else 0), y - hcy, hr * grow, hr * 0.94 * grow, hr * 0.95)
            return base + clump_h(cl, x, y) if base > 0 else 0

        def hair_px(x, y, L):
            if face(x, y, 1.0 if full else 1.4):
                return face_px(x, y, L)
            return clump_tone(hair, cl, x, y, L)
        relief_paint(head, hh, hair_px)
    if k == 'boss':
        # the cigar out of the corner of his mouth, its band, the ash and the ember at its end
        for t in range(10):
            x, y = int(hcx + hr + 1 + t * 0.92), int(hcy + 2.0 + t * 0.38)
            for d in (0, 1):
                c = hx('#6a4024') if d == 0 else hx('#4a2a16')
                if t == 2:
                    c = hx('#c8a040') if d == 0 else hx('#9a7a28')        # the band
                if t >= 8:
                    c = hx('#9a9a9a') if t == 8 else (hx('#ff7a2a') if d == 0 else hx('#c83a1a'))
                head.set(x, y + d, c)
    for sgn in (-1, 1):                              # ears
        ey = hcy + sgn * (hr * 0.94 + 0.2)
        if k in ('player', 'cueball') or st in ('hood', 'long', 'dancer'):
            continue
        for (dx, dy) in ((1, 0), (2, 0), (2, -sgn), (3, 0)):
            if head.get(int(hcx + dx), int(ey + dy))[3] < 100 or head.get(int(hcx + dx), int(ey + dy)) == OUTLINE:
                head.set(int(hcx + dx), int(ey + dy), ch['skin'][1 if dx < 3 else 2])
    if k == 'player':
        for sgn in (-1, 1):                          # his ears, just under the cap's edge
            ey = int(hcy + sgn * (hr * 0.96 + 0.6))
            for dx in (1, 2):
                head.set(int(hcx + dx), ey, ch['skin'][1])
    head.outline()
    return head


HEAD_W, HEAD_H = 36, 24   # the head sprite, centred on the head (FINE density)


def draw_head(ch):
    """The head of a standing character from straight above, facing +x, centred on its own middle so that it turns
    about it (CharacterAnim draws it over the shoulders, toward the aim): 36 x 24 pixels for 18 x 12 world px."""
    rng = random.Random(sum(ch['top'][2][:3]) * 37 + len(ch['kind']) * 11)
    full = torso_head(ch, rng)
    cv = Cv(HEAD_W, HEAD_H)
    x0, y0 = int(11.0 * FINE) - HEAD_W // 2, int(10.0 * FINE) - HEAD_H // 2
    cv.img = full.img.crop((x0, y0, x0 + HEAD_W, y0 + HEAD_H))
    cv.p = cv.img.load()
    if ch.get('scarf'):
        scarf_ring(cv, ch['scarf'])
    return cv


def draw_torso(ch):
    """The shoulders of a standing character from straight above, facing +x, the head left off (draw_head): 40 x 40
    pixels for 20 x 20 world px (FINE density)."""
    W = ch.get('canvas', 20) * FINE
    rng = random.Random(sum(ch['top'][2][:3]) * 31 + len(ch['kind']) * 7 + int(ch['sh'][1] * 10))
    cv = Cv(W, W)
    if ch.get('strap'):
        # the satchel, on his left hip, behind: under the edge of the jacket
        bag, lea = Cv(W, W), ch['strap']
        x0, y0 = int((9.6 - ch['sh'][0] - 1.5) * FINE), int((10.0 - 6.6) * FINE)
        for y in range(9):
            for x in range(8):
                if (x in (0, 7)) and (y in (0, 8)):
                    continue
                bag.set(x0 + x, y0 + y, lea[3] if x == 7 else lea[1] if y > 5 or x == 0 else lea[2])
        for x in range(1, 7):
            bag.set(x0 + x, y0 + 5, lea[0])                              # the flap's edge
        bag.set(x0 + 4, y0 + 6, hx('#e0b040'))                           # its buckle
        bag.outline()
        cv.over(bag)
    cv.over(torso_body(ch, rng))
    return cv


def chest_px(ch, u, v, L, hx_, hy_):
    """Front of torso while lying on the back. u toward the head, v across."""
    k = ch['kind']
    if k == 'civ':
        return civ_chest_px(ch, u, v, L, hx_, hy_)
    i = tidx(L)
    if k == 'player':
        if u > hx_ - 1.2 and abs(v) < 3.2:
            return ch['top'][min(3, i + 1)]      # the funnel collar
        if abs(0.6 * u + 0.8 * v - 0.3) < 0.55:
            return ch['strap'][i]                # the satchel's strap across his chest
        if u < -0.6 and abs(v) < 0.5 + (-0.6 - u) * 0.35:
            return ch['knit'][i]                 # his sweater, where the coat opens below the chest
        if u >= -0.6 and abs(v) < 0.5:
            return ch['lining'][2] if int(u * 0.8 + 20) % 2 else ch['top'][max(0, i - 1)]   # its placket, buttoned
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
    if k == 'boss':
        if abs(abs(v) - (0.4 + 0.42 * (u + hx_ * 0.6))) < 0.45 and u > hx_ - 3.4:
            return ch['chain'][min(3, i + 1)]    # the gold chain on his chest
        if abs(v) < 0.5 + 0.42 * (u + hx_ * 0.6) and u > hx_ - 3.0:
            return ch['skin'][i]                 # the shirt open on it
        if abs(v) < 1.9:
            return ch['shirt'][min(i, 2)]
        if abs(v) < 2.4:
            return ch['top'][min(3, i + 1)]      # the jacket's lapels
        return ch['top'][i]
    return ch['top'][i]


def face_px(ch, u, v, L, r):
    """Head seen from the front (lying on the back). u toward top of head."""
    k = ch['kind']
    if k == 'civ':
        return civ_face_px(ch, u, v, L, r)
    i = tidx(L)
    if k == 'player':
        if u > 1.5:
            return ch['cap'][i]                  # his cap, pushed back
        if u > 0.2 and abs(v) > 2.3 - 0.3 * u:
            return ch['hair'][i]                 # his hair either side of his face
        if u < -0.9:
            return ch['lining'][max(1, i)]       # the gaiter up over his mouth
    if k == 'thug' and u > 1.3:
        return ch['hair'][i if int(v + 20) % 2 else max(0, i - 1)]
    if k == 'brute' and u > 1.1:
        return ch['bandana'][i]
    if k == 'heavy' and L > 0.95:
        return lt(ch['skin'][2], 0.6)
    if k == 'cueball' and ch.get('worn') and -0.2 < u < 1.5:
        return ch['shades'][3 if v < -0.6 else 2]                             # the shades, still on him
    if k == 'boss':
        if u > 1.0:
            return ch['hair'][i if int(v * 1.5 + 20) % 2 else max(0, i - 1)]   # grey, combed back
        if u < -0.6 and abs(v) > r - 1.3:
            return ch['skin'][max(0, i - 1)]     # the jowls
    return ch['skin'][i]


def coat_spread(ch, w, h, cx, cy, ang, hip, half, length, flare):
    """The runner's coat spread on the floor under him, plainly painted: from his hips (hip px behind the torso's
    middle at (cx, cy), the head along ang) a skirt `length` long, `half` wide at the belt and `flare` wider a side at
    its hem, a tone a half, the vent open on the lining."""
    cv = Cv(w, h)
    top, lin = ch['top'], ch['lining']
    ca, sa = math.cos(ang), math.sin(ang)
    for y in range(h):
        for x in range(w):
            dx, dy = x + 0.5 - cx, y + 0.5 - cy
            u, v = dx * ca + dy * sa, -dx * sa + dy * ca
            t = (-hip - u) / length
            if t < 0 or t > 1 - 0.12 * (abs(v) / (half + flare)) ** 2:
                continue
            if abs(v) > half + flare * t:
                continue
            if abs(v) < 0.2 + 1.1 * t and t > 0.25:
                cv.set(x, y, lin[1])             # the lining, in the open vent
            else:
                cv.set(x, y, top[2] if v < 0 else top[1])
    cv.outline()
    return cv


RAG_SKIRT_W, RAG_SKIRT_H = 25, 15


def rag_skirt(ch):
    """That skirt as a part of a body on the floor (Ragdoll draws it under him, hung from his belt): its top edge at
    the belt, the hem toward +y."""
    return coat_spread(ch, RAG_SKIRT_W, RAG_SKIRT_H, RAG_SKIRT_W / 2, -0.5, -math.pi / 2, 0.0, 6.6, RAG_SKIRT_H - 1.5, 4.6)


TAIL_W, TAIL_H, TAIL_ROOT = 24, 18, 3   # a half of the standing runner's skirt (FINE px); its hinge: TAIL_ROOT px in


def player_tail(ch, side):
    """A half of the duster's skirt flying behind him, at FINE density (side -1: his left, the sprite's -y half): from
    its root (the right edge's middle, TAIL_ROOT px in, where the game hinges it on his back) to its hem toward -x,
    widening a little, long folds along it lit as the cloth they are, the hem a shade darker, the petrol lining
    showing along the vent (its inner edge). The game swings it, opens the vent and draws it out with his speed
    (src/game/entities/Skirt.js, CharacterAnim.drawSkirt)."""
    cv = Cv(TAIL_W, TAIL_H)
    x0, cy, L = TAIL_W - TAIL_ROOT, TAIL_H / 2, TAIL_W - TAIL_ROOT - 1.5
    top, lin = ch['top'], ch['lining']

    def geom(x, y):
        t = (x0 - x) / L
        if t < -0.2 or t > 1:
            return None
        tt = max(0.0, t)
        v = (cy - y) * side                      # + toward the vent
        w = 6.4 + 1.6 * tt
        if abs(v) > w or tt > 1 - 0.1 * (abs(v) / w) ** 2:
            return None
        return tt, v, w

    def h(x, y):
        g = geom(x, y)
        if not g:
            return 0.0
        tt, v, w = g
        ripple = math.sin(v * 0.62 * side + tt * 2.2 + side) * (0.25 + 1.1 * tt)
        return max(0.05, (2.4 - 0.9 * tt) * min(1.0, (w - abs(v)) / 2.0) + ripple)

    def colour(x, y, L_):
        tt, v, w = geom(x + 0.5, y + 0.5)
        i = tidx(L_)
        if tt > 0.25 and w - v < 2.0:
            return lin[max(1, min(2, i))]        # the lining, along the vent
        if tt > 0.9:
            return top[max(0, i - 1)]            # the hem
        return top[3] if L_ > 0.93 else top[min(2, i)]
    relief_paint(cv, h, colour)
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
# added after the others: a painter seeds itself by a character's place in CHARS, theirs must not move
CHARS.update(dict(
    # more of the bar's customers: a businessman going bald in his charcoal suit and red tie, a young one in a royal blue
    # tracksuit (white stripes down the sleeves), a redhead in an emerald top, a blond lad in a stonewashed denim jacket
    civ5=dict(kind='civ', style='suit', top=ramp('#4a4e5a', 0.45, 0.22, 0.35), pants=ramp('#3e424c'),
              shoe=ramp('#2a1a14', 0.4, 0.2, 0.35), hair=ramp('#6a5a4c', 0.5, 0.25, 0.4),
              skin=ramp('#e6ae8a', 0.46, 0.22, 0.3), sh=(4.3, 8.4)),
    civ6=dict(kind='civ', style='track', top=ramp('#2a46a8', 0.46, 0.22, 0.35), pants=ramp('#2a46a8', 0.46, 0.22, 0.35),
              shoe=ramp('#ecebf2', 0.4, 0.2, 0.2), hair=ramp('#2a1a12', 0.5, 0.25, 0.5),
              skin=ramp('#b8805a', 0.46, 0.22, 0.3), sh=(4.0, 7.9)),
    civ7=dict(kind='civ', style='long', top=ramp('#1f8a5a', 0.46, 0.22, 0.35), pants=ramp('#22202a'),
              shoe=ramp('#b8202a', 0.45, 0.22, 0.3), hair=ramp('#a0461e', 0.5, 0.25, 0.4),
              skin=ramp('#efc2a0', 0.46, 0.22, 0.3), sh=(3.8, 7.4)),
    civ8=dict(kind='civ', style='jacket', top=ramp('#6a8ab8', 0.46, 0.22, 0.35), trim=ramp('#e8dcc0', 0.4, 0.2, 0.3),
              pants=ramp('#2e3a52'), shoe=ramp('#5a3a22', 0.4, 0.2, 0.3), hair=ramp('#d8b860', 0.5, 0.25, 0.4),
              skin=ramp('#e2b08e', 0.46, 0.22, 0.3), sh=(4.1, 8.1)),
))
# the boss, his own man (level `looks`): older and heavy, a cream suit over a black shirt open on his chest, a gold
# chain, grey hair combed straight back, a cigar in the corner of his mouth; the same man as the comic's dead boss
# (tools/generate_comic.py head_boss: the grey hair, the jowls, the cream suit)
CHARS['boss'] = dict(kind='boss', top=ramp('#e2d6b6', 0.46, 0.22, 0.3), pants=ramp('#d6c8a6', 0.46, 0.22, 0.3),
                     shoe=ramp('#4a2a1a', 0.4, 0.2, 0.35), hair=ramp('#a8a8b0', 0.5, 0.26, 0.35),
                     shirt=ramp('#2a2228', 0.4, 0.2, 0.4), chain=ramp('#e8b840', 0.5, 0.25, 0.45),
                     skin=ramp('#d49a74', 0.46, 0.22, 0.3), sh=(5.0, 9.6))


# --------------------------------------------------------------------------
# CUEBALL, level 1's boss: the comic's heavy (tools/comic/STYLE.md, the cast), from straight above. A wall on short
# legs: the widest shoulders in the game, in black, on a canvas of their own (24 x 24 world px); no neck; a huge bald
# bone dome; wrap-round fluorescent yellow shades wider than his head, the brightest thing on him: a yellow band
# across the front of the dome, which shows where he faces. `_head_hurt`: after the first hit (entities/Boss.js) the
# shades knocked askew, a lens cracked, blood running over the dome. items/shades: what skitters off him when he dies.
# --------------------------------------------------------------------------
CHARS['cueball'] = dict(kind='cueball', top=ramp('#2a2832', 0.5, 0.25, 0.42), pants=ramp('#1e1c26', 0.45, 0.22, 0.3),
                        shoe=ramp('#16141c', 0.4, 0.2, 0.45), skin=ramp('#eee4cc', 0.42, 0.2, 0.3), shades=FLUO,
                        sleeve=ramp('#2a2832', 0.5, 0.25, 0.42), sh=(5.5, 11.4), canvas=24, head=4.7)


def cueball_top_px(ch, u, v, L, r):
    """His head at the world's pixel size (a gib, a body lying face down): the bare dome, the rolls of his nape."""
    sk = ch['skin']
    if L > 0.93:
        return lt(sk[3], 0.6)
    if u < -r * 0.45 and abs(math.hypot(u, v) - r * 0.72) < 0.5:
        return sk[1]
    return sk[tidx(L)]


def cueball_shoulder_px(ch, u, v, i, hd, hr):
    """His jacket from above: its collar rolled up round the dome (no neck shows), the padded shoulders' edge."""
    top = ch['top']
    if hr + 0.1 < hd < hr + 1.2:
        return top[min(3, i + 1)]
    if abs(v) > ch['sh'][1] - 1.6 and abs(u) < 2.2:
        return top[min(3, i + 1)]                # the pad's edge catches the light
    return top[i]


def cueball_jacket(body, ch, cx, cy, rx, ry):
    """What his black back shows: the yoke's seam from shoulder to shoulder, the vent at the bottom of the back."""
    top = ch['top']
    for j in range(int(cy - ry + 3 * FINE), int(cy + ry - 3 * FINE)):
        x = int(cx - rx * 0.42 - 1.6 * math.cos((j - cy) / ry * 1.5))
        if body.on(x, j) and body.get(x, j) != OUTLINE and abs(j - cy) > 1:
            body.set(x, j, top[0])
    for i in range(5):
        x = int(cx - rx + 1.5 + i)
        if body.on(x, int(cy)):
            body.set(x, int(cy), top[0])


def cueball_shades(u, v, hr, tilt=0.0, slip=0.0):
    """Where the shades are over a head of radius hr (pixels from its centre, +u the face): None off them, else
    (part, depth 0..1 from their front edge, across): 'lens' | 'arm' | 'bridge'. A wrap-round band, deepest at the
    front, wider than the head, its arms back to the ears; tilt (rad) and slip (px across): knocked askew."""
    v -= slip
    c, s = math.cos(-tilt), math.sin(-tilt)
    u, v = u * c - v * s, u * s + v * c
    R = hr + 1.0
    rho = math.hypot(u, v * 0.9)
    deep = 3.0 + 4.2 * max(0.0, u / R)
    if u < -1.5 or rho > R + 0.9 or rho < R - deep:
        return None
    k = (R + 0.9 - rho) / (deep + 0.9)
    if u < 3.4:
        return ('arm', k, v) if rho > R - 2.2 else None
    if abs(v) < 0.9 and rho > R - 1.6:
        return ('bridge', k, v)
    return ('lens', k, v)


def cueball_dome(head, ch, skull, hcx, hcy, hr):
    """The bald dome and the shades on it. ch['hurt']: the head after the first hit."""
    sk, Y, hurt = ch['skin'], ch['shades'], ch.get('hurt')
    tilt, slip = (0.42, 1.6) if hurt else (0.0, 0.0)

    def dome_px(x, y, L):
        u, v = x + 0.5 - hcx, y + 0.5 - hcy
        d = math.hypot(u, v)
        if L > 0.965:
            return lt(sk[3], 0.7)                        # the shine on the bone
        if u < -hr * 0.42 and (abs(d - hr * 0.74) < 0.6 or (abs(d - hr * 0.5) < 0.55 and abs(v) < hr * 0.42)):
            return sk[1]                                 # the rolls of his nape
        return sk[tidx(L)]
    relief_paint(head, skull, dome_px)
    for y in range(head.h):
        for x in range(head.w):
            u, v = x + 0.5 - hcx, y + 0.5 - hcy
            at = cueball_shades(u, v, hr, tilt, slip)
            if at is None:
                # their shadow on the dome, just behind them
                if head.on(x, y) and head.get(x, y) != OUTLINE and cueball_shades(u + 1.2, v, hr, tilt, slip):
                    head.set(x, y, dk(head.get(x, y), 0.2))
                continue
            part, k, across = at
            if part == 'arm':
                c = Y[1] if k > 0.5 else Y[2]
            elif part == 'bridge':
                c = Y[0]
            else:
                c = Y[3] if (k < 0.3 and across < -1.5) else Y[1] if k > 0.78 else Y[2]   # a glint along the lit lens
            head.set(x, y, c)
    nose = (hcx + hr + 1.9 + (0.6 if hurt else 0), hcy + (0.6 if hurt else 0))
    for dx in (0, 1):
        head.set(int(nose[0] + dx), int(nose[1]), sk[2] if dx == 0 else sk[1])   # the tip of his nose, under them
    if not hurt:
        return
    # the lens on his right cracked: a star of cracks from where it was struck, a chip gone out of it
    c0 = (hcx + hr * 0.62, hcy + hr * 0.78)
    crack = hx('#3a4406')
    for (dx, dy, n) in ((1.0, -0.2, 4), (-0.5, 1.0, 3), (0.4, -1.0, 4), (-1.0, -0.3, 3)):
        for t in range(n):
            x, y = int(c0[0] + dx * t), int(c0[1] + dy * t)
            if head.on(x, y) and head.get(x, y) in Y:
                head.set(x, y, crack)
    for (dx, dy) in ((0, 0), (1, 1)):
        head.set(int(c0[0] + dx), int(c0[1] + dy), hx('#241a22'))
    # blood: a gash on the dome, running down over the brow to the shades
    for (dx, dy, c) in ((-2, -3, 1), (-1, -3, 2), (0, -3, 2), (1, -2, 2), (2, -2, 1), (1, -3, 0), (3, -2, 2), (4, -1, 2),
                        (5, -1, 1), (6, -1, 2), (4, -2, 1), (-3, -2, 1), (-1, -2, 2), (0, -1, 1), (2, -4, 2), (-4, -1, 2)):
        x, y = int(hcx + dx), int(hcy + dy)
        if head.on(x, y) and head.get(x, y) != OUTLINE:
            head.set(x, y, BLOOD[c])


# ---- LUCKY, the man with the match (tools/comic/STYLE.md, the cast; level `looks`): a beanpole all in black, his
# hair slicked flat, and his sign from above: a pink scarf, a ring of it round his neck (painted on his head's sprite,
# round the head) and its end flying out behind him (a sprite of its own, lucky_scarf, that the game swings from his
# nape: entities/Enemy.js). Painted like a thug under it; the scarf is the only colour on him.
CHARS['lucky'] = dict(kind='thug', top=ramp('#24212c', 0.42, 0.2, 0.45), pants=ramp('#1c1a22'),
                      shoe=ramp('#141218', 0.3, 0.15, 0.25), hair=ramp('#17141c', 0.55, 0.3, 0.6),
                      shirt=ramp('#1a1820'), skin=SKIN, sh=(3.6, 7.4), scarf=ramp('#ff3a7a', 0.5, 0.25, 0.3))
SCARF_W, SCARF_H = 28, 12   # the scarf's flying end (FINE density: 14 x 6 world px), its knot end at x = 0


def scarf_ring(cv, sc):
    """The scarf round his neck seen from above, on the head's sprite (draw_head): a ring 2 world px wide all round
    the head, lit from the top left, a fold across it where it is knotted behind."""
    cx, cy = HEAD_W / 2, HEAD_H / 2
    for y in range(HEAD_H):
        for x in range(HEAD_W):
            if cv.p[x, y][3] > 100:
                continue
            u, v = x + 0.5 - cx, y + 0.5 - cy
            d = math.hypot(u, v)
            if 6.0 <= d < 11.0:
                lit = (-u - v) / (d * 1.414)                        # toward the top left
                c = sc[3] if lit > 0.55 and d > 8.5 else sc[2] if lit > -0.35 else sc[1]
                if u < -6 and abs(v - 1.5) < 0.8:
                    c = sc[0]                                       # the knot's fold, at the nape
                cv.p[x, y] = c
            elif 11.0 <= d < 12.0:
                cv.p[x, y] = OUTLINE


def lucky_scarf(sc):
    """The end of his scarf flying behind him: a band 5 world px wide and 14 long from its knot (x = 0, the middle of
    the left edge) to a forked tip, a wave along it, its upper edge lit, a fold down its length."""
    cv = Cv(SCARF_W, SCARF_H)
    for x in range(SCARF_W - 1):
        k = x / (SCARF_W - 1)
        mid = SCARF_H / 2 - 0.5 + math.sin(k * 5.2) * 1.3 * k         # it waves more toward its free end
        half = 2.4 + 2.2 * min(1, k * 2.2) - 0.8 * max(0, k - 0.7) / 0.3
        for y in range(SCARF_H):
            v = y + 0.5 - mid
            if abs(v) > half:
                continue
            if k > 0.86 and abs(v) < (k - 0.86) * 14:                # the fork at its tip
                continue
            c = sc[3] if v < -half + 1.4 else sc[1] if v > half - 1.6 else sc[2]
            if abs(v - 0.6) < 0.6 and 0.12 < k < 0.8:
                c = sc[1]                                           # the fold
            if x % 9 == 8 and abs(v) < half - 1:
                c = sc[0]                                           # creases across it
            cv.p[x, y] = c
    cv.outline()
    return cv


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
    if st == 'suit' and math.hypot(u + 0.3, v) < r * 0.62:
        return lt(ch['skin'][2], 0.3) if L > 0.95 else ch['skin'][i]     # his bald crown
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
    if st == 'suit' and hr + 0.1 < hd < hr + 0.8 and hu > -0.6:
        return WHITE[max(1, i)]                       # his shirt collar
    if st == 'track' and abs(abs(v) - 3.3) < 0.32:
        return WHITE[max(1, i)]                       # the stripes down the sleeves
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
    if st == 'suit':
        if abs(v) < 0.3 + 0.38 * (u + hx_) and u > -hx_ + 1.0:
            if abs(v) < 0.6 and -1.5 < u < hx_ - 0.8:
                return hx('#b8202a') if i >= 2 else hx('#7a1018')   # his tie
            return WHITE[max(1, min(i, 2))]
    if st == 'track':
        if abs(v) < 0.25:
            return WHITE[1]                           # the zip
        if abs(v) > hy_ - 1.4 and abs(v) < hy_ - 0.8:
            return WHITE[max(1, i)]
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
    if st in ('jacket', 'long', 'dancer', 'track') and (u > 1.2 or (st in ('long', 'dancer') and abs(v) > r - 1.0)):
        return ch['hair'][i]
    if st == 'suit' and u > 0.9 and abs(v) > r - 1.2:
        return ch['hair'][i]                          # the fringe left round his bald head
    return ch['skin'][i]


# --------------------------------------------------------------------------
# Ragdoll segments (intact, they match each character's palette)
# --------------------------------------------------------------------------

# ---- a body on the floor, part by part (entities/Ragdoll.js), at the WORLD's pixel size, like the furniture and the
# floors he lies on: at the finer density of the standing characters the user found the bodies "too high a
# resolution next to the rest of the assets". The build is that of the people on their feet (Config BODY_SCALE), a
# little narrower: shoulders 17 px, a head of 10, arms 4 thick, legs 5, about 1.5 m from crown to heel (between the
# stubby 1.2 m of the first bodies and a man's real length, which looked like another game). Painted plainly, two
# tones a part and what tells each kind apart, no more: every extra was rejected as clashing with the picture.
def lying(w, h, fn):
    """fn(x, y) -> colour or None for each pixel of a w x h part, then the outline."""
    cv = Cv(w, h)
    for y in range(h):
        for x in range(w):
            c = fn(x, y)
            if c is not None:
                cv.set(x, y, c)
    cv.outline()
    return cv


def torso_edge(y):
    """Half-width of a lying torso at row y (17 x 19, head toward -y): round shoulders, the waist, the hips."""
    if y < 2:
        return 5.0 + 1.3 * y
    if y <= 6:
        return 7.5
    if y <= 14:
        return 7.5 - (y - 6) / 8.0 * 1.2
    return 6.3 + (y - 14) / 3.0 * 0.4


def rag_torso(ch, back=False):
    """The trunk from the collar to the belt, 17 x 19, his front (the design of chest_px) or his back: the flanks in
    shade, the belt, the top of the trousers."""
    k = ch['kind']

    def px(x, y):
        if y < 1 or y > 17:
            return None
        d = abs(x - 8)
        hw = torso_edge(y)
        if d > hw:
            return None
        L = 0.4 if d > hw - 1.4 else 0.66               # the flank turns away
        i = tidx(L)
        u, v = (9 - y) / 9.0 * 6.9, (x - 8) / 7.5 * 5.9
        if y == 17:
            return ch['pants'][i]
        if y == 16:
            return hx('#1a1420') if k != 'heavy' else ch['pants'][max(0, i - 1)]
        if y < 2 and d < 2:
            return ch['skin'][max(1, i)]                 # the neck
        if not back:
            return chest_px(ch, u, v, L, 6.9, 5.9)
        if k == 'brute' and d > hw - 2.3:
            return ch['skin'][i]
        if k in ('thug', 'player') and y < 3 and d < 3:
            return ch['top'][min(3, i + 1)]              # collar
        if k == 'civ':
            return civ_chest_px(ch, u, v, L, 6.9, 5.9)
        if d < 0.5:
            return ch['top'][max(0, i - 1)]              # the seam down the back
        return ch['top'][i]
    return lying(17, 19, px)


def rag_torso_up(ch):
    """The torso of a body lying on its back: his front."""
    return rag_torso(ch)


def rag_torso_down(ch):
    """The torso of a body lying on its belly: his back."""
    return rag_torso(ch, back=True)


def rag_skull(ch, fn, ang):
    cv = Cv(10, 10)
    fill_shape(cv, 5.0, 5.0, 4.2, 4.2, lambda u, v, L: fn(ch, u / 1.13, v / 1.13, L, 3.7), ang=ang, pad=0.05)
    return cv


def rag_head(ch):
    """The head of a body lying face down (10 x 10): the back of the skull, the nape toward the shoulders (+y)."""
    cv = rag_skull(ch, head_top_px, math.pi / 2)
    cv.outline()
    return cv


def rag_head_up(ch):
    """The head of a body lying on its back (10 x 10, crown toward -y): his face, the eyes shut, nothing else."""
    cv = rag_skull(ch, face_px, -math.pi / 2)
    for x in (3, 6):
        cv.set(x, 5, hx('#2a1820'))
    cv.outline()
    return cv


def rag_arm(ch):
    """An arm from the shoulder (-x) to the hand (+x), 17 x 6: the sleeve, the cuff of those who wear one, the hand."""
    k = ch['kind']
    s = ch.get('sleeve') or (ch['skin'] if k == 'brute' else ch['top'])
    cuff = WHITE if k == 'thug' else None
    skin = ch['skin']

    def px(x, y):
        if x < 1 or x > 15 or y < 1 or y > 4:
            return None
        if (x < 2 or x > 14) and (y < 2 or y > 3):
            return None                                  # rounded ends
        i = 2 if y < 3 else 1
        if x >= 13:
            return skin[i]
        if cuff and x == 12:
            return cuff[i]
        if k == 'heavy' and y == 2:
            return WHITE[i]                              # the stripe down the sleeve
        return s[i]
    return lying(17, 6, px)


def rag_leg(ch):
    """A leg from the hip (-x) to the toe (+x), 20 x 7: the trouser leg and the shoe."""
    k = ch['kind']
    p, sh = ch['pants'], ch['shoe']

    def px(x, y):
        if x < 1 or x > 18 or y < 1 or y > 5:
            return None
        if x > 17 and (y < 2 or y > 4):
            return None                                  # the round of the toe
        i = 2 if y < 3 else 1
        if x >= 15:
            return sh[i]
        if k == 'heavy' and y == 3:
            return WHITE[i]
        return p[i]
    return lying(20, 7, px)


def knocked_down(ch):
    """A man knocked out cold, built from the parts of a body on the floor so he is the size of one: on his back, an arm
    thrown out, the other along him, the legs a little apart. 51 x 49, the head toward +x."""
    W, H = 49, 51
    body = Image.new('RGBA', (W, H), CLEAR)

    def limb(cv, rx, ry, deg):
        # the limb's root (its -x end) put on (rx, ry), pointing deg degrees from +x (y down)
        n = cv.w * 2 + 4
        tmp = Image.new('RGBA', (n, n), CLEAR)
        tmp.alpha_composite(cv.img, (n // 2 - 1, n // 2 - cv.h // 2))
        tmp = tmp.rotate(-deg, resample=Image.NEAREST)
        body.alpha_composite(tmp, (int(rx - n // 2), int(ry - n // 2)))
    leg, arm = rag_leg(ch), rag_arm(ch)
    if ch['kind'] == 'player':
        body.alpha_composite(rag_skirt(ch).img, (24 - RAG_SKIRT_W // 2, 27))   # his coat spread under him
    limb(leg, 20, 28, 98)
    limb(leg, 28, 28, 80)
    limb(arm, 18, 15, 114)
    limb(arm, 31, 15, 18)
    body.alpha_composite(rag_torso_up(ch).img, (16, 10))
    body.alpha_composite(rag_head_up(dict(ch, worn=True)).img, (19, 1))   # (what he wears on his face is still on)
    out = Cv(H, W)
    out.img = body.rotate(-90, resample=Image.NEAREST, expand=True)
    out.p = out.img.load()
    return out


# a man's sprites: part -> (its painter, given the man and his place in CHARS; its size in world px, None: his
# canvas; its flags)
BODY = dict(
    torso=(lambda ch, i: draw_torso(ch), None, 'dense req'),
    head=(lambda ch, i: draw_head(ch), (HEAD_W / FINE, HEAD_H / FINE), 'dense req'),
    down=(lambda ch, i: knocked_down(ch), (51, 49), 'req'),
    gib_head=(lambda ch, i: gib_head(ch), (9, 9), 'req'),
    gib_arm=(lambda ch, i: gib_arm(ch), (11, 4), 'req'),
    gib_leg=(lambda ch, i: gib_leg(ch), (13, 5), 'req'),
    gib_torso=(lambda ch, i: gib_torso(ch, i), (14, 12), 'req'),
    rag_torso=(lambda ch, i: rag_torso(ch), (17, 19), ''),
    rag_head=(lambda ch, i: rag_head(ch), (10, 10), ''),
    rag_arm=(lambda ch, i: rag_arm(ch), (17, 6), ''),
    rag_leg=(lambda ch, i: rag_leg(ch), (20, 7), ''),
    rag_torso_up=(lambda ch, i: rag_torso_up(ch), (17, 19), ''),
    rag_torso_down=(lambda ch, i: rag_torso_down(ch), (17, 19), ''),
    rag_head_up=(lambda ch, i: rag_head_up(ch), (10, 10), ''),
)

GROUP = 'characters'
SPRITES = {
    '%s_%s' % (cid, part): ((lambda ch=ch, i=i, fn=fn: fn(ch, i)), size or (ch.get('canvas', 20),) * 2, flags)
    for i, (cid, ch) in enumerate(CHARS.items()) for part, (fn, size, flags) in BODY.items()
}
SPRITES.update({
    'cueball_head_hurt': (lambda: draw_head(dict(CHARS['cueball'], hurt=True)), (HEAD_W / FINE, HEAD_H / FINE), 'dense'),
    'gib_chunk0': (lambda: gib_chunk(0), (6, 5), 'req'),
    'gib_chunk1': (lambda: gib_chunk(1), (6, 5), 'req'),
    'gib_chunk2': (lambda: gib_chunk(2), (6, 5), 'req'),
    'gib_eye': (gib_eye, (3, 3), 'req'),
    'lucky_scarf': (lambda: lucky_scarf(CHARS['lucky']['scarf']), (SCARF_W / FINE, SCARF_H / FINE), 'dense req'),
    'player_tail_l': (lambda: player_tail(CHARS['player'], -1), (TAIL_W / FINE, TAIL_H / FINE), 'dense req'),
    'player_tail_r': (lambda: player_tail(CHARS['player'], 1), (TAIL_W / FINE, TAIL_H / FINE), 'dense req'),
    'player_rag_skirt': (lambda: rag_skirt(CHARS['player']), (RAG_SKIRT_W, RAG_SKIRT_H), 'req'),
})
