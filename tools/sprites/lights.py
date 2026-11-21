"""Light fixtures (the visible sources of the lighting pass), each (sprite, emissive map); the wall-mounted ones
glow on their +y side (the prop turned to face the room). The overhead party bulbs."""
import math
import random

from .core import (
    alpha, Cv, dk, fill_shape, frect, hx, light, line, lt, mix, px_paint, ramp, ring, shade, smudge, stud, wood_fill
)
from .palette import BRASS, NEON_CYAN, NEON_PINK


HOT = hx('#fff6dc')


def lamp_core(cv, gl, cx, cy, r):
    """The bulb seen through the top of a shade."""
    fill_shape(cv, cx, cy, r, r, lambda u, v, L: HOT)
    fill_shape(gl, cx, cy, r, r, lambda u, v, L: (255, 246, 220, 200))


def p_floor_lamp():
    """Standard lamp from above: the cast foot showing past the pleated shade, the shade's wire ring, the bulb."""
    cv, gl = Cv(16, 16), Cv(16, 16)
    foot = ramp('#3a3442', 0.5, 0.25, 0.4)
    fill_shape(cv, 9.5, 9.5, 4.2, 4.2, lambda u, v, L: shade(foot, L))
    ring(cv, 9.5, 9.5, 3.4, 3.8, lambda dx, dy, d: lt(foot[3], 0.2) if dx + dy < 0 else None)
    pleated(cv, 8.0, 8.0, 2.0, 6.3, ramp('#c08a4c', 0.42, 0.2, 0.35))
    for a in (0.6, 2.7, 4.8):                                          # the wire spider holding the shade
        line(cv, 8.0 + math.cos(a) * 1.6, 8.0 + math.sin(a) * 1.6, 8.0 + math.cos(a) * 2.6, 8.0 + math.sin(a) * 2.6, hx('#5a4a3a'))
    lamp_core(cv, gl, 8.0, 8.0, 1.7)
    cv.dot(7.5, 7.5, hx('#ffffff'))
    cv.outline()
    ring(gl, 8.0, 8.0, 2.0, 6.3, lambda dx, dy, d: (255, 176, 96, int(70 - 8 * d)))
    return cv, gl


def p_table_lamp():
    """Side table with a lamp on it, from above: the round walnut top and its moulded edge, the pleated shade, the
    bulb, a coaster and the lamp's cord running off the edge."""
    cv, gl = Cv(18, 18), Cv(18, 18)
    wood = ramp('#6a4026', 0.45, 0.22, 0.3)
    wood_fill(cv, 1, 1, 16, 16, wood[2], plank=6, rng=random.Random(5683), mask=lambda x, y: math.hypot(x + 0.5 - 9, y + 0.5 - 9) <= 8.0)
    ring(cv, 9.0, 9.0, 7.0, 8.0, lambda dx, dy, d: shade(wood, light(dx / d * 0.9, dy / d * 0.9)))   # the moulded edge
    ring(cv, 9.0, 9.0, 6.6, 7.0, lambda dx, dy, d: wood[0])
    ring(cv, 4.6, 13.0, 1.0, 1.5, lambda dx, dy, d: dk(cv.get(4.6 + dx, 13.0 + dy), 0.2))   # a glass's ring
    line(cv, 11.0, 12.0, 15.6, 15.0, hx('#1a1418'))                    # the cord
    pleated(cv, 9.0, 9.0, 1.6, 5.2, ramp('#d98a5a', 0.42, 0.2, 0.35))
    lamp_core(cv, gl, 9.0, 9.0, 1.6)
    cv.dot(8.5, 8.5, hx('#ffffff'))
    cv.outline()
    ring(gl, 9.0, 9.0, 1.6, 5.2, lambda dx, dy, d: (255, 170, 110, int(90 - 10 * d)))
    return cv, gl


def p_wall_lamp():
    """Wall lamp (the wall at -y): a brass backplate with its two screws, a frosted glass half dome, hot where the bulb
    is, a dead moth in it."""
    cv, gl = Cv(14, 7), Cv(14, 7)
    fill_shape(cv, 7.0, 0.9, 4.6, 0.9, lambda u, v, L: shade(BRASS, L), kind='rect', corner=0.4, bevel=0.5)
    for x in (3.5, 10.0):
        stud(cv, x, 0.5, BRASS[1])

    def dome(u, v, L):
        if v < 0:
            return None
        k = math.hypot(u / 5.0, v / 4.4)
        c = HOT if k < 0.45 else mix(HOT, hx('#ffe2a8'), (k - 0.45) / 0.3) if k < 0.75 else mix(hx('#ffe2a8'), hx('#e0a058'), (k - 0.75) / 0.25)
        return c
    fill_shape(cv, 7.0, 2.0, 5.0, 4.4, dome)
    for k in range(5):                                                 # the frosting's ribs
        a = 0.35 + k * 0.6
        line(cv, 7.0 + math.cos(a) * 3.0, 2.0 + math.sin(a) * 3.0, 7.0 + math.cos(a) * 4.2, 2.0 + math.sin(a) * 4.0, hx('#f0c880'))
    cv.dot(9.0, 4.0, hx('#5a4a3a'))                                    # the moth
    cv.outline()
    fill_shape(gl, 7.0, 2.0, 5.0, 4.4, lambda u, v, L: None if v < 0 else (255, 226, 170, 170 if math.hypot(u / 5.0, v / 4.4) < 0.82 else 90))
    return cv, gl


def tube_fixture(col, hot):
    """Batten on the wall with a glowing tube under it."""
    def make():
        cv, gl = Cv(30, 5), Cv(30, 5)
        m = ramp('#4a4858', 0.5, 0.25, 0.4)
        cv.rect(0, 0, 29, 1, m[2])
        cv.rect(0, 0, 29, 0, m[3])
        for x0 in (0, 28):
            cv.rect(x0, 0, x0 + 1, 3, m[1])
        cv.rect(2, 2, 27, 2, hot)
        cv.rect(2, 3, 27, 3, col)
        cv.outline()
        for x in range(2, 28):
            cv.set(x, 4, alpha(col, 120))
            gl.set(x, 2, hot)
            gl.set(x, 3, col)
            gl.set(x, 4, alpha(col, 120))
        return cv, gl
    return make


def pleated(cv, cx, cy, r0, r1, base, n=16):
    """A pleated fabric shade from above, the bulb's light through it: the pleats running out from the top ring, lit
    on the side facing the lamp in the room, the rolled hem."""
    def f(dx, dy, d):
        a = math.atan2(dy, dx)
        p = math.sin(a * n)
        L = 0.3 + 0.75 * light(dx / d * 0.75, dy / d * 0.75) + p * 0.08
        col = shade(base, L)
        if d > r1 - 0.6:
            col = dk(col, 0.18) if dx + dy > 0 else lt(col, 0.12)      # the hem
        elif d < r0 + 0.5:
            col = lt(col, 0.3)                                         # the glow at the top ring
        return col
    ring(cv, cx, cy, r0, r1, f)


def p_tube_light():
    """A fluorescent batten on the wall (-y): the steel channel with its end caps and screws, the tube's pins, the tube
    hot down its middle, a darkened end where it is wearing out, the light it throws on the wall below."""
    cv, gl = Cv(30, 5), Cv(30, 5)
    col, hot = hx('#cfe6ff'), hx('#ffffff')
    m = ramp('#4a4858', 0.5, 0.25, 0.4)
    frect(cv, 0, 0, 30, 2, m[2])
    frect(cv, 0, 0, 30, 0.5, m[3])
    frect(cv, 0, 1.5, 30, 2, m[1])
    for x0 in (0, 28):
        fill_shape(cv, x0 + 1.0, 2.0, 1.0, 2.0, lambda u, v, L: shade(m, L), kind='rect', corner=0.4)   # end caps
        stud(cv, x0 + 0.75, 0.75, m[1])

    def tube(x, y, c):
        t = (y - 2.0) / 2.0
        k = hot if 0.25 < t < 0.55 else col if t < 0.8 else alpha(col, 200)
        if x > 25.5:
            k = mix(k, hx('#8a96a8'), 0.5)                             # the end going grey
        return k
    px_paint(cv, 2, 2, 28, 4, tube)
    for x in (2.0, 27.5):
        frect(cv, x, 2.5, x + 0.5, 3.5, hx('#c8ccd6'))                 # the pins
    cv.outline()
    px_paint(gl, 2, 2, 28, 4, lambda x, y, c: hot if 2.5 <= y < 3.0 else col)
    frect(cv, 2, 4.0, 28, 5.0, alpha(col, 110))
    frect(gl, 2, 4.0, 28, 5.0, alpha(col, 120))
    return cv, gl


def p_ceiling_lamp():
    """Enamel pendant shade from above: its green dome lit from the side, the brass rim and the rivets of the
    cord-grip at the top, the bulb seen past it, the light leaking under the rim."""
    cv, gl = Cv(18, 18), Cv(18, 18)
    enamel = ramp('#2f5a48', 0.5, 0.25, 0.4)
    ring(cv, 9.0, 9.0, 2.2, 7.4, lambda dx, dy, d: shade(enamel, 0.25 + 0.85 * light(dx / d * 0.8, dy / d * 0.8)) if not
         (abs(d - 4.6) < 0.25) else dk(enamel[1], 0.2))
    ring(cv, 9.0, 9.0, 6.7, 7.4, lambda dx, dy, d: shade(BRASS, light(dx / d * 0.9, dy / d * 0.9)))
    ring(cv, 9.0, 9.0, 2.2, 3.0, lambda dx, dy, d: shade(BRASS, light(dx / d, dy / d)))   # the cord-grip
    for k in range(6):
        a = k * math.pi / 3
        stud(cv, 9.0 + math.cos(a) * 2.6, 9.0 + math.sin(a) * 2.6, BRASS[1])
    smudge(cv, random.Random(5734), 3, (3, 3, 15, 15), (0.6, 1.2), 0.5, hx('#e8e4d8'))   # chips in the enamel
    lamp_core(cv, gl, 9.0, 9.0, 2.2)
    cv.dot(8.5, 8.5, hx('#ffffff'))
    cv.outline()
    ring(gl, 9.0, 9.0, 7.0, 8.9, lambda dx, dy, d: (255, 214, 150, int(150 - 70 * (d - 7.0))))   # light leaking under the rim
    return cv, gl


def p_pool_lamp():
    """Billiard light over the table: a long green enamel hood with its brass trim and end caps, the vents over each of
    its three bulbs, the chains' eyes, the light spilling under its long edges."""
    cv, gl = Cv(46, 12), Cv(46, 12)
    enamel = ramp('#1f6a44', 0.5, 0.25, 0.4)
    fill_shape(cv, 23.0, 6.0, 22.0, 5.0, lambda u, v, L: shade(enamel, L), kind='rect', bevel=3.0, corner=2.0)
    frect(cv, 3, 1.0, 43, 1.5, BRASS[3])                               # brass trim along both edges
    frect(cv, 3, 1.5, 43, 2.0, BRASS[2])
    frect(cv, 3, 10.0, 43, 10.5, BRASS[1])
    for x in (1.5, 44.5):
        fill_shape(cv, x, 6.0, 1.0, 4.0, lambda u, v, L: shade(BRASS, L), kind='rect', corner=0.8)   # end caps
    for cx in (11.0, 23.0, 35.0):
        frect(cv, cx - 3.0, 4.5, cx + 3.0, 7.5, dk(enamel[1], 0.3))
        for k in range(5):
            frect(cv, cx - 2.5 + k * 1.2, 5.0, cx - 2.0 + k * 1.2, 7.0, HOT)   # the vents, the bulb seen through
        frect(gl, cx - 3.0, 4.5, cx + 3.0, 7.5, (255, 246, 220, 200))
    for x in (6.0, 40.0):
        ring(cv, x, 6.0, 0.5, 1.0, lambda dx, dy, d: shade(BRASS, light(dx / d, dy / d)))   # chain eyes
    smudge(cv, random.Random(5746), 4, (4, 3, 42, 9), (1.0, 2.0), 0.12)
    cv.outline()
    frect(gl, 0, 0, 46, 1.0, (255, 214, 150, 110))
    frect(gl, 0, 11.0, 46, 12, (255, 214, 150, 110))
    return cv, gl


# --------------------------------------------------------------------------
# Overhead dressing: things mounted up high, drawn above everyone with a little parallax.
# --------------------------------------------------------------------------

def p_string_lights():
    """A sagging cable of party bulbs strung between two walls."""
    W, H = 128, 10
    cv, gl = Cv(W, H), Cv(W, H)
    cols = [hx('#ffd27a'), hx('#ff6b8a'), hx('#ffe9a0'), hx('#7fe8ff')]
    for x in range(W):
        y = 1 + int(round(5.0 * math.sin(math.pi * x / (W - 1))))
        cv.set(x, y, hx('#1c1826'))
        if x % 12 == 6:
            c = cols[(x // 12) % len(cols)]
            for dx in (0, 1):
                for dy in (1, 2):
                    cv.set(x + dx, y + dy, lt(c, 0.25))
                    gl.set(x + dx, y + dy, lt(c, 0.25))
            for dx, dy in ((-1, 1), (-1, 2), (2, 1), (2, 2), (0, 3), (1, 3)):
                gl.set(x + dx, y + dy, alpha(c, 100))
    return cv, gl


GROUP = 'props'
SPRITES = {
    'floor_lamp': (p_floor_lamp, (16, 16), 'fine glow', (10, 10)),
    'table_lamp': (p_table_lamp, (18, 18), 'fine glow', (15, 15)),
    'wall_lamp': (p_wall_lamp, (14, 7), 'fine glow hung'),
    'tube_light': (p_tube_light, (30, 5), 'fine glow hung'),
    'neon_tube_pink': (tube_fixture(NEON_PINK, lt(NEON_PINK, 0.6)), (30, 5), 'glow hung'),
    'neon_tube_cyan': (tube_fixture(NEON_CYAN, lt(NEON_CYAN, 0.6)), (30, 5), 'glow hung'),
    'ceiling_lamp': (p_ceiling_lamp, (18, 18), 'fine glow hung'),
    'pool_lamp': (p_pool_lamp, (46, 12), 'fine glow hung'),
    'string_lights': (p_string_lights, (128, 10), 'glow hung'),
}
