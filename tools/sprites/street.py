"""Level 1's street: its lamps, its neon wall signs, the jukebox, a hydrant, a bench, a chain fence."""
import math
import random

from .core import (
    alpha, bevel_edges, Cv, dk, fill_capsule, fill_shape, frect, hx, layer, light, line, lt, mix, OUTLINE, px_paint,
    ramp, ring, shade, smudge, stud, wood_fill
)
from .palette import NEON_CYAN, NEON_GREEN, NEON_PINK, PITCH, SIGNAL_ORANGE, SIGNAL_YELLOW
from .type import FONT_BAR, inked
from .neon import Neon, sign_backing


def p_streetlight():
    """Cobra-head streetlight: the pole top (hitbox, r 3) at the sprite centre, a 1.75 m arm toward +x and the
    luminaire, its glass refractor glowing around the housing."""
    W, H = 136, 16
    cv, gl = Cv(W, H), Cv(W, H)
    cx, cy = W / 2, H / 2
    m = ramp('#5a5e6e', 0.5, 0.25, 0.4)
    hx0 = cx + 56.0                         # luminaire centre

    def arm(ly):
        fill_capsule(ly, [(cx + 1.5, cy), (hx0 - 8.0, cy)], 1.0, lambda k, L, s, i, t: shade(m, L))
        fill_capsule(ly, [(cx + 2.0, cy + 0.6), (cx + 9.0, cy + 0.2)], 1.4, lambda k, L, s, i, t: shade(m, L - 0.05))
        fill_shape(ly, cx, cy, 3.0, 3.0, lambda u, v, L: shade(m, L))
        ly.set(int(cx - 1), int(cy - 1), m[3])
    layer(cv, arm)

    def lum(ly):
        fill_shape(ly, hx0 + 0.6, cy, 10.6, 5.2, lambda u, v, L: hx('#ffd27a') if L < 0.8 else hx('#fff4d0'), kind='super', p=2.4)
        fill_shape(ly, hx0 - 0.6, cy, 9.6, 4.4, lambda u, v, L: shade(ramp('#6a7066', 0.5, 0.25, 0.4), L), kind='super', p=2.4)
        line(ly, hx0 - 6.0, cy - 0.5, hx0 + 6.0, cy - 0.5, ramp('#6a7066', 0.5, 0.25, 0.4)[3])   # housing seam
        ly.set(int(hx0 - 7), int(cy), hx('#3a3e3a'))      # photocell
    layer(cv, lum)
    for y in range(H):
        for x in range(int(hx0 - 12), W):
            c = cv.get(x, y)
            if c[3] and (c[:3] == hx('#ffd27a')[:3] or c[:3] == hx('#fff4d0')[:3]):
                gl.set(x, y, (255, 228, 160, 255) if c[0:3] == hx('#fff4d0')[:3] else (255, 200, 110, 230))
    return cv, gl


def p_neon_sign_palm():
    cv, gl = sign_backing(40, 14), Cv(40, 14)
    ne = Neon(40, 14)
    pink, cyan, orange, yel = NEON_PINK, NEON_CYAN, SIGNAL_ORANGE, SIGNAL_YELLOW
    ne.arc(27.5, 10.5, 6.5, math.pi, 2 * math.pi, orange)       # sun
    for (y, half, col) in [(6, 4, yel), (8, 5, orange)]:
        ne.line([(27 - half + 1, y), (27 + half, y)], col)
    ne.line([(4, 11), (36, 11)], pink)                            # horizon
    ne.line([(10, 10), (11, 7), (12, 4)], cyan)                   # palm trunk
    for (pts) in [[(12, 4), (9, 3), (6, 5)], [(12, 4), (15, 3), (18, 5)], [(12, 4), (10, 6), (8, 8)],
                  [(12, 4), (14, 6), (16, 8)], [(12, 4), (12, 2)]]:
        ne.line(pts, cyan if pts[-1][1] != 2 else NEON_GREEN)
    ne.render(cv, gl)
    return cv, gl


def p_neon_sign_bar():
    cv, gl = sign_backing(44, 14), Cv(44, 14)
    ne = Neon(44, 14)
    x0 = 16
    for ch in 'BAR':
        for x, y in inked(FONT_BAR[ch]):
            ne.dot(x0 + x, 3 + y, NEON_PINK)
        x0 += 8
    # cocktail glass
    ne.line([(4, 3), (12, 3), (8, 7), (4, 3)], NEON_CYAN)
    ne.line([(8, 7), (8, 10)], NEON_CYAN)
    ne.line([(6, 10), (10, 10)], NEON_CYAN)
    ne.dot(10, 2, NEON_GREEN)
    ne.dot(11, 1, NEON_GREEN)
    ne.dot(7, 4, SIGNAL_YELLOW)
    ne.render(cv, gl)
    return cv, gl


def p_neon_sign_arrow():
    cv, gl = sign_backing(30, 12), Cv(30, 12)
    ne = Neon(30, 12)
    yel = SIGNAL_YELLOW
    ne.line([(3, 4), (18, 4), (18, 2), (26, 6), (18, 9), (18, 7), (3, 7), (3, 4)], yel)
    ne.render(cv, gl)
    for x in range(5, 18, 3):
        for y in (5, 6):
            cv.set(x, y, lt(NEON_PINK, 0.3))
            gl.set(x, y, NEON_PINK)
    return cv, gl


def p_jukebox():
    """Jukebox from above: chrome-trimmed arch with bubble tubes, the record magazine and platter under the glass
    dome, title strips and buttons on the selector panel (+y)."""
    W, H = 30, 22
    cv, gl = Cv(W, H), Cv(W, H)
    cx = W / 2
    body = ramp('#4a1838', 0.5, 0.25, 0.35)
    chrome = ramp('#b8bccc', 0.5, 0.25, 0.4)
    bands = [NEON_PINK, SIGNAL_ORANGE, SIGNAL_YELLOW]
    rng = random.Random(661)
    bubbles = set((rng.randrange(0, 60), rng.randrange(0, 44)) for _ in range(40))

    def arch(x, y, cur):
        u = (x - cx) / 14.0
        v = (y - 12.0) / 11.0
        e = (abs(u) ** 4 + max(0.0, -v) ** 4) ** 0.25 if v < 0 else abs(u)
        if e > 1.0 or y > H - 1:
            return None
        if e > 0.92:                          # chrome trim, lit from the top-left
            nx, ny = (u / (e or 1)) * 0.9, (min(0.0, v) / (e or 1)) * 0.9
            L = light(nx, ny)
            c = shade(chrome, L)
            return lt(c, 0.4) if 0.955 < e < 0.975 and L > 0.6 else c
        if e > 0.74:
            if v < 0.15:                      # bubble tubes following the arch
                col = bands[min(2, int((e - 0.74) / 0.06))]
                k = (e - 0.74) % 0.06 / 0.06
                c = lt(col, 0.45 if 0.3 < k < 0.6 else 0.2)
                if (int(x * 2), int(y * 2)) in bubbles:
                    c = lt(col, 0.75)         # a bubble rising
                gl.dot(x, y, lt(col, 0.1))
            else:                             # straight cyan tubes down the front corners
                c = lt(NEON_CYAN, 0.35 if abs(abs(u) - 0.83) < 0.03 else 0.15)
                gl.dot(x, y, NEON_CYAN)
            return c
        return shade(body, 0.68 + (0.06 if (x * 3 + y) % 4 < 0.5 else 0.0))
    px_paint(cv, 1, 1, W - 1, H - 1, arch)

    def dome(x, y, cur):                      # glass dome: the record magazine (discs on edge) around the platter
        u, v = (x - cx) / 9.0, (y - 11.0) / 7.5
        if u * u + min(0.0, v) ** 2 > 1.0:
            return None
        return hx('#1a1028') if int(math.atan2(y - 11.5, x - cx) * 22) % 2 else hx('#100a18')
    px_paint(cv, 6, 4, 24, 14, dome)
    labels = [NEON_PINK, SIGNAL_YELLOW, NEON_CYAN, NEON_GREEN, SIGNAL_ORANGE, hx('#f4f0ff'), NEON_PINK]
    for i in range(7):
        a = math.pi * (1.1 + 0.8 * i / 6.0)
        x0, y0 = cx + math.cos(a) * 4.6, 11.5 + math.sin(a) * 4.6
        x1, y1 = cx + math.cos(a) * 7.4, 11.5 + math.sin(a) * 7.4
        line(cv, x0, y0, x1, y1, hx('#4a4458'))
        mx, my = (x0 + x1) / 2, (y0 + y1) / 2
        for (ox, oy) in ((0, 0), (0.5, 0), (0, 0.5)):
            cv.dot(mx + ox, my + oy, labels[i])
            gl.dot(mx + ox, my + oy, dk(labels[i], 0.3))
    ring(cv, cx, 11.0, 0.0, 2.6, lambda dx, dy, d: hx('#16121e') if int(d * 3) % 2 else PITCH)
    fill_shape(cv, cx, 11.0, 0.9, 0.9, lambda u, v, L: NEON_PINK if L > 0.4 else dk(NEON_PINK, 0.3))
    cv.dot(cx - 1.5, 10.0, hx('#5a5868'))
    for y in range(10, 26):                   # reflection streak on the dome
        cv.bpx(18 + (y - 10) // 3, y, (255, 255, 255, 70))
        cv.bpx(21 + (y - 10) // 3, y + 2, (255, 255, 255, 30))
    # selector panel: two columns of title strips, a row of buttons, the coin light
    for (x0, x1) in ((5, 14), (17, 26)):
        frect(cv, x0, 14, x1, 19, shade(body, 0.45))
        for y in (15, 17):
            for k in range((x1 - x0) // 5 + 1):
                sx = x0 + k * 5
                frect(cv, sx, y, min(x1, sx + 4), y + 1, hx('#efe4c8'))
                frect(cv, sx + 0.5, y + 0.5, min(x1, sx + 4) - 0.5, y + 1, hx('#b8a890'))   # a typed title
                frect(cv, sx, y, min(x1, sx + 4), y + 1, lambda c: c)
                px_paint(gl, sx, y, min(x1, sx + 4), y + 1, lambda x, y, c: (255, 240, 200, 70))
        frect(cv, x0, 14, x1, 14.5, lt(shade(body, 0.45), 0.15))
    for x in range(6, 25, 2):
        fill_shape(cv, x + 0.5, 19.5, 0.6, 0.6, lambda u, v, L, x=x: (hx('#ff3a3a') if x == 14 else shade(chrome, L)))
    gl.set(14, 19, hx('#ff3a3a'))
    cv.outline()
    return cv, gl


def p_hydrant():
    """Fire hydrant from above, 14 x 14: two hose caps on the sides and the pumper outlet in front, each with its own
    dark edge and the chain that keeps it, under the barrel's bolted flange, the bonnet dome and its pentagon brass nut
    (the user: sharper and a little bigger)."""
    S = 14
    cv = Cv(S, S)
    red = ramp('#d0262c', 0.55, 0.28, 0.35)
    cap = ramp('#c8c8d8', 0.5, 0.25, 0.4)
    nut = ramp('#e0b02a', 0.5, 0.2, 0.4)

    def caps(ly):
        for (cx, cy, rx, ry) in ((2.3, 7.0, 1.4, 2.0), (11.7, 7.0, 1.4, 2.0), (7.0, 11.7, 2.0, 1.4)):
            fill_shape(ly, cx, cy, rx, ry, lambda u, v, L: shade(cap, L))
            fill_shape(ly, cx, cy, rx * 0.45, ry * 0.45, lambda u, v, L: shade(cap, 1.0 - L * 0.6), kind='super', p=1.2)   # its nut

    def barrel(ly):
        fill_shape(ly, 7.0, 7.0, 4.1, 4.1, lambda u, v, L: red[1] if L < 0.5 else red[2])     # the flange
        for k in range(6):
            a = k * math.pi / 3 + 0.3
            stud(ly, 7.0 + math.cos(a) * 3.6 - 0.25, 7.0 + math.sin(a) * 3.6 - 0.25, red[1])   # its bolts
    layer(cv, caps)
    layer(cv, barrel)
    fill_shape(cv, 7.0, 7.0, 3.0, 3.0, lambda u, v, L: shade(red, L))                          # the bonnet
    ring(cv, 7.0, 7.0, 2.9, 3.4, lambda dx, dy, d: red[0])                                     # its edge
    fill_shape(cv, 7.0, 7.0, 1.5, 1.5, lambda u, v, L: shade(nut, L), kind='super', p=1.1)     # pentagon-ish nut
    cv.dot(5.0, 5.0, hx('#ff9a8a'))                                    # the light on the dome
    cv.dot(5.5, 5.0, hx('#ff9a8a'))
    smudge(cv, random.Random(4747), 3, (3, 3, 11, 11), (0.4, 0.7), 0.7, hx('#8a8a98'))   # paint chipped to the iron
    line(cv, 3.0, 8.6, 5.4, 10.6, hx('#6a6a78'))                       # a cap's chain
    return cv


def p_bench():
    """Park bench with backrest (-y): weathered slats with their grain and bolts, worn pale where people sit, cast-iron
    scrolled ends, carved initials, what a pigeon left."""
    W, H = 52, 17
    cv = Cv(W, H)
    w = ramp('#a06a3a', 0.5, 0.25, 0.3)
    iron = ramp('#34343e', 0.4, 0.2, 0.45)
    frect(cv, 2, 1, W - 2, 16, hx('#1e1a24'))                          # the ground and frame under the gaps
    for (x0, x1) in ((24.5, 27.5),):
        frect(cv, x0, 1, x1, 16, hx('#2a2632'))                        # the middle support
    for k, (y0, y1) in enumerate(((1, 2), (4, 5), (7, 9), (11, 12), (14, 15))):
        wood_fill(cv, 2, y0, W - 3, y1, w[2], plank=y1 - y0 + 1, rng=random.Random(41 + k))
        bevel_edges(cv, 2, y0, W - 3, y1, 0.22, 0.32)
        if y0 >= 7:
            px_paint(cv, 9, y0, W - 9, y1 + 1, lambda x, y, c: mix(c, hx('#c8a882'), 0.2 * math.sin(math.pi * (x - 9) / (W - 18))))   # sat-on wear
        for x in (8.0, 25.5, 43.0):
            stud(cv, x, y0 + (y1 - y0 + 1) / 2.0 - 0.25, iron[1])     # carriage bolts
    for x0 in (1, W - 4):                                              # cast-iron ends with a scrolled armrest
        fill_capsule(cv, [(x0 + 1.5, 1.6), (x0 + 1.5, 15.4)], 1.4, lambda k, L, s, i, t: shade(iron, L + (0.15 if t < 0.25 else 0.0)))
        ring(cv, x0 + 1.5, 15.0, 0.5, 1.2, lambda dx, dy, d: iron[3] if dx + dy < 0 else iron[1])   # the scroll
    for (x, y) in ((12.0, 11.5), (12.5, 11.5), (14.0, 11.5), (15.0, 11.5), (15.5, 11.5), (17.0, 11.5)):
        cv.dot(x, y, dk(w[1], 0.35))                                   # carved initials
    for (x, y) in ((36.0, 8.0), (36.5, 8.5), (37.0, 8.0)):
        cv.dot(x, y, hx('#e8e4dc'))                                    # pigeon
    smudge(cv, random.Random(42), 5, (3, 1, W - 3, 16), (1.0, 2.5), 0.14)
    cv.outline()
    return cv


def p_chain_fence():
    """Chain-link gate panel, chest high: a galvanized top rail between two posts seen from above (the 32 x 4 hitbox),
    with its tie wires, and the diamond mesh laid out on both sides, one fine wire wide, the way it shows when looking
    down through it, fading away from the rail."""
    W, H = 34, 16
    cv = Cv(W, H)
    st = ramp('#aeb4be', 0.5, 0.25, 0.4)
    fill_capsule(cv, [(1.5, 7.5), (W - 1.5, 7.5)], 0.95, lambda k, L, s, i, t: lt(st[3], 0.2) if L > 0.9 else shade(st, L))   # top rail
    for x in range(4, W - 4, 4):
        frect(cv, x, 7.0, x + 0.5, 8.5, st[0])                         # tie wires
    for x0 in (1.0, W - 5.0):                                          # posts and their caps
        fill_shape(cv, x0 + 2.0, 7.5, 2.0, 2.0, lambda u, v, L: shade(st, L))
        fill_shape(cv, x0 + 2.0, 7.5, 1.0, 1.0, lambda u, v, L: shade(st, L + 0.15))
    cv.outline()
    s = cv.s
    for j in range(cv.ph):
        y = (j + 0.5) / s
        if 6.0 <= y < 10.0:
            continue
        d = (5.5 - y) if y < 6 else (y - 9.5)
        for i in range(2 * s, (W - 2) * s):
            if cv.p[i, j][3]:
                continue
            x = (i + 0.5) / s
            wire = (i + j) % (4 * s) == 0 or (i - j) % (4 * s) == 0
            knot = (i + j) % (4 * s) == 0 and (i - j) % (4 * s) == 0
            if knot:
                cv.p[i, j] = alpha(lt(st[3], 0.2), int(250 - 30 * d))
            elif wire:
                cv.p[i, j] = alpha(st[3], int(225 - 30 * d))
            else:
                cv.p[i, j] = alpha(OUTLINE, int(60 - 9 * d))
    return cv


GROUP = 'props'
SPRITES = {
    'streetlight': (p_streetlight, (136, 16), 'fine glow', (6, 6)),
    'neon_sign_palm': (p_neon_sign_palm, (40, 14), 'glow hung'),
    'neon_sign_bar': (p_neon_sign_bar, (44, 14), 'glow hung'),
    'neon_sign_arrow': (p_neon_sign_arrow, (30, 12), 'glow hung'),
    'jukebox': (p_jukebox, (30, 22), 'fine glow', (28, 20)),
    'hydrant': (p_hydrant, (14, 14), 'fine', (11, 11)),
    'bench': (p_bench, (52, 17), 'fine', (50, 15)),
    'chain_fence': (p_chain_fence, (34, 16), 'fine', (32, 4)),
}
