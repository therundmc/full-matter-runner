"""Level 1's furniture at real scale (1 m = 32 px; a sprite is its hitbox in data/props.js and a px of outline
each side), painted at FINE density, and the street bins."""
import math
import random

from .core import (
    alpha, ashtray, bevel_edges, brushed, can_top, chrome_bar, circle, CLEAR, crease, Cv, dash, dk, fgrain,
    fill_capsule, fill_shape, fine, frect, glass_top, hx, layer, light, line, lt, mix, mottle, OUTLINE, px_paint, ramp,
    relief, ring, shade, shift, smudge, stud, VNoise, wood_fill
)
from .palette import (
    CASH, CHROME, GUNMETAL, HOT, LED_RED, LINEN, NEON_CYAN, NEON_GREEN, NEON_PINK, PALE_STEEL, PARCHMENT, PITCH,
    PURE_WHITE, PUTTY, RUBBER, SIGNAL_ORANGE, SIGNAL_YELLOW, SILVER_GREY, STEEL, STEEL_GREY, TYRE_BLACK, WHITE
)
from .neon import glow_from, is_neon


def tufted(cv, x0, y0, x1, y1, lea, nx, ny, stagger=True, rng=None):
    """Chesterfield buttoning over [x0, x1] x [y0, y1] (world px): buttons sunk in the leather in a diamond grid, the
    pleats running between them, each puff of leather between four buttons swelling toward the light."""
    bt = []
    for j in range(ny):
        for i in range(nx + (1 if stagger and j % 2 else 0)):
            off = 0.5 if stagger and j % 2 else 0.0
            bx = x0 + (i + 0.5 - off) * (x1 - x0) / nx
            by = y0 + (j + 0.5) * (y1 - y0) / ny
            if x0 - 0.1 <= bx <= x1 + 0.1:
                bt.append((bx, by))
    sx, sy = (x1 - x0) / nx, (y1 - y0) / ny

    def f(x, y, c):
        if c[3] == 0 or c == OUTLINE:
            return None
        d = min(math.hypot((x - bx) / sx, (y - by) / sy) for bx, by in bt)
        return shade(lea, 0.35 + 0.55 * min(1.0, d * 1.7) - (0.12 if y > (y0 + y1) / 2 else 0.0))
    px_paint(cv, x0, y0, x1, y1, f)
    for (bx, by) in bt:                                                # the pleats
        for (ex, ey) in bt:
            if 0 < abs(ex - bx) <= sx * 0.55 and 0 < ey - by <= sy * 1.01:
                line(cv, bx, by, ex, ey, dk(lea[1], 0.25))
    for (bx, by) in bt:
        stud(cv, bx - 0.25, by - 0.25, dk(lea[1], 0.2), big=True)


def knob(cv, x, y, r, base, ang, mark=hx('#f4f2ec')):
    """A round control knob from above: its chrome skirt, the grip lit from the top left, the pointer line."""
    ring(cv, x, y, r * 0.62, r, lambda dx, dy, d: shade(CHROME, 0.2 + 0.85 * light(dx / d, dy / d)))
    fill_shape(cv, x, y, r * 0.64, r * 0.64, lambda u, v, L: shade(ramp(base, 0.5, 0.25, 0.45), L))
    line(cv, x, y, x + math.cos(ang) * r * 0.8, y + math.sin(ang) * r * 0.8, mark)


def frond(ly, c, a, ln, bend, g, rng, leaflet=2.4, side=1.0):
    """An areca frond from above: a midrib arching out from (c, c) at angle a, pairs of narrow leaflets swept toward
    its tip, lit on the side facing the light."""
    pts = []
    for k in range(9):
        t = k / 8.0
        aa = a + bend * t * t
        r = 1.2 + (ln - 1.2) * t
        pts.append((c + math.cos(aa) * r, c + math.sin(aa) * r))
    for k in range(1, 9):
        t = k / 8.0
        x0, y0 = pts[k]
        dx, dy = pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1]
        d = math.hypot(dx, dy) or 1.0
        dx, dy = dx / d, dy / d
        ll = leaflet * math.sin(math.pi * min(1.0, 0.15 + t * 0.95)) ** 0.7 * rng.uniform(0.8, 1.1)
        for s in (-1, 1):
            nx, ny = -dy * s, dx * s
            ex, ey = x0 + (nx * 0.85 + dx * 0.55) * ll, y0 + (ny * 0.85 + dy * 0.55) * ll
            lit = light(nx, ny)
            fill_capsule(ly, [(x0, y0), (ex, ey)], 0.42 if t < 0.9 else 0.32,
                         lambda k_, L, sd, i, tt, lit=lit: shade(g, 0.25 + lit * 0.75 - tt * 0.15))
    fill_capsule(ly, pts, 0.3, lambda k_, L, sd, i, t: lt(g[2], 0.15))


def p_table():
    """Back-room table: worn varnished boards, poker cards, a beer, a full ashtray, ring stains."""
    W, H = 46, 28
    cv = Cv(W, H)
    rng = random.Random(11)
    wood_fill(cv, 1, 1, W - 2, H - 2, hx('#86552f'), plank=6, rng=rng)
    mottle(cv, random.Random(111), 8, 7)
    bevel_edges(cv, 1, 1, W - 2, H - 2, 0.22, 0.32)
    for (x, y) in ((1, 1), (W - 2, 1), (1, H - 2), (W - 2, H - 2)):
        cv.set(x, y, CLEAR)
    # varnish worn pale along the long edges where elbows rest
    smudge(cv, rng, 6, (8, 2, W - 8, 4), (2.0, 3.5), 0.16, hx('#c8a070'))
    smudge(cv, rng, 6, (8, H - 5, W - 8, H - 3), (2.0, 3.5), 0.16, hx('#c8a070'))
    for (sx, sy) in ((10.0, 9.0), (35.5, 19.0)):   # glass rings
        ring(cv, sx, sy, 1.7, 2.6, lambda dx, dy, d, sx=sx, sy=sy:
             dk(cv.get(sx + dx, sy + dy), 0.2) if (dx * 0.6 + dy) > -2.0 else None)
    ol = dk(hx('#86552f'), 0.6)

    def cards(ly):
        for (x, y, a, pip) in ((16.5, 11.5, 0.3, '#c01828'), (21.5, 10.5, -0.25, '#1a1420'), (26.5, 13.0, 0.6, '#c01828'),
                               (20.5, 18.5, -0.7, '#1a1420')):
            fill_shape(ly, x, y, 1.5, 2.1, lambda u, v, L: hx('#f2ece0') if L > 0.6 else hx('#d8d0c2'),
                       ang=a, kind='rect', corner=0.4, bevel=0.6)
            fill_shape(ly, x, y, 0.45, 0.6, lambda u, v, L, pip=pip: hx(pip), ang=a, kind='super', p=1.2)
        fill_shape(ly, 31.0, 7.5, 2.0, 2.6, lambda u, v, L: hx('#2a3a8a') if (int(u * 2 + v * 2) % 2) else hx('#34469a'),
                   ang=0.1, kind='rect', corner=0.5, bevel=0.6)   # the deck, face down
    layer(cv, cards, ol)

    def things(ly):
        ashtray(ly, 37.0, 9.5, random.Random(112))
        fill_shape(ly, 9.5, 19.0, 1.9, 1.9, lambda u, v, L: shade(ramp('#5a3a12', 0.5, 0.25, 0.5), L))  # beer bottle
        ly.set(9, 18, hx('#e8c860'))
        ly.set(10, 19, hx('#c8a040'))
        glass_top(ly, 13.5, 21.5, 1.9, hx('#d89a2a'))
    layer(cv, things)
    cv.outline()
    return cv


def p_table_round():
    """Round bar table: dark rim band, a drink on a beer mat, a small ashtray."""
    S = 30
    cv = Cv(S, S)
    c = S / 2
    wood_fill(cv, 1, 1, S - 2, S - 2, hx('#8a5530'), plank=5, rng=random.Random(12), vertical=True,
              mask=lambda x, y: math.hypot(x + 0.5 - c, y + 0.5 - c) <= 13.9)
    mottle(cv, random.Random(121), 7, 6)
    ring(cv, c, c, 12.6, 14.0, lambda dx, dy, d: shade(ramp('#6a3a1e', 0.45, 0.22, 0.35), light(dx / d, dy / d)))
    ring(cv, c, c, 12.0, 12.6, lambda dx, dy, d: dk(cv.get(c + dx, c + dy), 0.18))
    ring(cv, 11.0, 18.5, 1.8, 2.6, lambda dx, dy, d: dk(cv.get(11.0 + dx, 18.5 + dy), 0.18) if dx + dy > -2 else None)

    def things(ly):
        fill_shape(ly, 18.5, 11.0, 3.0, 3.0, lambda u, v, L: hx('#c8303a') if math.hypot(u, v) > 2.1 else hx('#e8e0cc'))
        glass_top(ly, 18.5, 11.0, 1.9, hx('#e89a30'))
        ashtray(ly, 10.0, 12.0, random.Random(122), 2.4)
    layer(cv, things)
    cv.outline()
    return cv


def p_card_table():
    """Poker table: an oval of green baize in a padded wood rail, the pot, hands dealt to five seats, drinks."""
    W, H = 60, 38
    cv = Cv(W, H)
    cx, cy = W / 2, H / 2
    half = cx - cy   # half-length of the straight sides
    felt = ramp('#1f7a4c', 0.45, 0.22, 0.18)
    rail = ramp('#6a3518', 0.45, 0.22, 0.35)
    fn = VNoise(W, H, 5, random.Random(171))
    def table(x, y, c):
        dx, dy = x - cx, y - cy
        ex = dx - max(-half, min(half, dx))
        d = math.hypot(ex, dy) or 1e-6
        nx, ny = ex / d, dy / d
        if d > 18.0:
            return None
        if d > 14.2:
            c = shade(rail, light(nx, ny))
            if 15.6 < d <= 16.5:
                c = lt(c, 0.12)                      # the padding's crown
            if abs(d - 14.8) < 0.25 and int(math.atan2(dy, ex) * 40 + dx * 1.3) % 3:
                c = lt(c, 0.16)                      # the stitching along its inner edge
            elif abs(d - 17.3) < 0.25:
                c = dk(c, 0.15)                      # where it rolls over
            return c
        if d > 13.3:
            return felt[0] if nx + ny > 0 else felt[1]
        c = shift(mix(felt[2], lt(felt[2], 0.2), max(0.0, 0.7 - d / 14)), int((fn(x, y) - 0.5) * 8))
        return lt(c, 0.1) if 9.3 < d <= 10.0 else c     # the betting line
    px_paint(cv, 1, 1, W - 1, H - 1, table)
    # years of games: the baize rubbed pale where the cards are dealt and the chips pushed, the ring a glass left, a
    # cigarette's burn in the cloth and one on the rail where it was left to burn down, the padding worn at the elbows
    wr = random.Random(174)
    smudge(cv, wr, 4, (13, 11, 47, 27), (2.0, 3.6), 0.13, lt(felt[2], 0.45))
    ring(cv, 44.4, 21.6, 1.5, 1.95, lambda dx, dy, d: dk(cv.get(44.4 + dx, 21.6 + dy), 0.16) if dx + dy > -1.4 else None)
    for (bx, by) in ((21.0, 12.5), (35.75, 34.25), (36.25, 34.25)):
        for (ox, oy) in ((-0.5, 0.0), (0.5, 0.0), (0.0, -0.5), (0.0, 0.5)):
            cv.dot(bx + ox, by + oy, mix(cv.get(bx + ox, by + oy), hx('#3a2a14'), 0.45))
        cv.dot(bx, by, hx('#16100c'))
    for box in ((13, 33, 21, 36), (39, 33, 47, 36), (2, 15, 5, 23)):
        smudge(cv, wr, 2, box, (1.2, 2.0), 0.3, lt(rail[2], 0.3))

    def things(ly):
        chips = ('#d8303a', '#e8e0cc', '#3a6ad8', '#e8c040', '#1a1420')
        rng = random.Random(172)
        for k, (x, y) in enumerate(((-3.2, -1.4), (0.0, -2.2), (3.2, -1.0), (-1.6, 1.6), (1.8, 2.0))):   # the pot
            circle(ly, cx + x, cy + y, 1.4, hx(chips[k]))
        for (x, y, a) in ((cx - 8.0, cy + 2.5, 0.4), (cx + 8.5, cy - 1.5, -0.5)):   # notes thrown in
            fill_shape(ly, x, y, 2.2, 1.2, lambda u, v, L: hx('#86b070') if abs(u) < 1.2 else hx('#5a8a4a'),
                       ang=a, kind='rect', corner=0.3, bevel=0.5)
        back, face = hx('#a8282e'), LINEN
        seats = ((cx - 21, cy, math.pi, False), (cx + 21, cy, 0.0, False), (17.0, cy + 8.5, math.pi / 2, False),
                 (43.0, cy + 8.5, math.pi / 2, True), (cx - 4.0, cy - 8.5, -math.pi / 2, False))
        for i, (sx, sy, a, up) in enumerate(seats):
            for s in (-1, 1):
                px, py = sx - math.sin(a) * s * 1.8, sy + math.cos(a) * s * 1.8
                fill_shape(ly, px, py, 1.5, 2.2, lambda u, v, L: face if up or abs(u) > 0.9 or abs(v) > 1.6 else back,
                           ang=a + s * 0.25, kind='rect', corner=0.5, bevel=0.5)
            if up:
                ly.set(int(sx - 2), int(sy), hx('#c01828'))
                ly.set(int(sx + 1), int(sy), hx('#1a1420'))
            for k in range(2 + i % 2):                                  # each player's stack, at his right hand
                circle(ly, sx - math.sin(a) * (5.5 + k * 2.2) - math.cos(a) * 1.5,
                       sy + math.cos(a) * (5.5 + k * 2.2) - math.sin(a) * 1.5, 1.2, hx(chips[rng.randrange(4)]))
        fill_shape(ly, cx + 3.5, cy - 8.5, 1.7, 2.4, lambda u, v, L: hx('#8a1f26') if (int(u * 2 + v * 2) % 2) else back,
                   ang=1.45, kind='rect', corner=0.5, bevel=0.6)        # the deck, by the dealer
        glass_top(ly, 12.5, 12.5, 1.7, hx('#c8842a'))
        glass_top(ly, 48.0, 25.5, 1.7, hx('#d89a2a'))
        ashtray(ly, 46.5, 11.5, random.Random(173), 2.3)
    layer(cv, things)
    cv.outline()
    return cv


def p_dope_table():
    """The pimp's counting table: taped bricks, bags, a scale, a mirror with lines cut on it, wads of cash, a lamp."""
    W, H = 46, 28
    cv = Cv(W, H)
    rng = random.Random(13)
    wood_fill(cv, 1, 1, W - 2, H - 2, hx('#6e4426'), plank=6, rng=rng)
    mottle(cv, random.Random(131), 8, 7)
    bevel_edges(cv, 1, 1, W - 2, H - 2, 0.22, 0.32)
    for (x, y) in ((1, 1), (W - 2, 1), (1, H - 2), (W - 2, H - 2)):
        cv.set(x, y, CLEAR)
    smudge(cv, rng, 7, (12, 6, 32, 22), (1.2, 2.6), 0.3, hx('#eeeae2'))   # powder dusted over the boards
    white = ramp('#e8e4dc', 0.3, 0.15, 0.4)
    green = CASH

    def goods(ly):
        for (x, y, a) in ((7.5, 7.0, 0.1), (8.0, 12.0, -0.08), (14.5, 6.5, 0.3), (7.0, 20.5, 1.5)):   # taped bricks
            fill_shape(ly, x, y, 3.2, 2.0, lambda u, v, L: hx('#9a7a44') if abs(u) < 0.6 else shade(white, L),
                       ang=a, kind='rect', corner=0.5, bevel=0.7)
        for (x, y) in ((17.5, 19.5), (20.5, 21.5), (16.0, 22.5), (22.5, 18.5), (13.5, 18.0)):          # small bags
            fill_shape(ly, x, y, 1.5, 1.2, lambda u, v, L: shade(white, L))
        fill_shape(ly, 23.5, 9.5, 4.2, 3.0, lambda u, v, L: hx('#c8dcec') if u - v > 1.5 else hx('#9ab8cc'),
                   ang=-0.15, kind='rect', corner=0.4, bevel=0.5)                                      # the mirror
        for k in range(3):
            line(ly, 21.0 + k * 2.0, 8.0, 21.6 + k * 2.0, 11.2, PURE_WHITE)
        fill_shape(ly, 31.0, 19.5, 4.2, 3.4, lambda u, v, L: shade(STEEL, L), kind='rect', corner=0.6, bevel=0.8)   # the scale
        fill_shape(ly, 31.0, 19.0, 2.7, 2.7, lambda u, v, L: shade(ramp('#b8c0cc', 0.5, 0.25, 0.4), L))
        fill_shape(ly, 31.0, 19.0, 1.4, 1.2, lambda u, v, L: shade(white, L))
        ly.set(31, 22, hx('#ff5a3a'))
        for (x, y, a) in ((35.0, 5.5, 0.0), (41.0, 7.5, 1.57), (35.5, 11.5, 0.1), (40.5, 14.5, 0.0)):    # wads
            fill_shape(ly, x, y, 2.7, 1.6, lambda u, v, L: hx('#f2ead0') if abs(u) < 0.7 else shade(green, L),
                       ang=a, kind='rect', corner=0.3, bevel=0.6)
    layer(cv, goods, dk(hx('#6e4426'), 0.6))

    def lamp(ly):
        circle(ly, 41.5, 23.5, 2.0, GUNMETAL)
        line(ly, 41.0, 23.0, 37.5, 21.5, hx('#3a3a48'))
        fill_shape(ly, 37.0, 21.5, 2.8, 2.2, lambda u, v, L: shade(ramp('#3f7a5a', 0.5, 0.25, 0.4), L), ang=0.4)
        ly.set(36, 21, hx('#fff4c0'))
        ly.set(36, 22, hx('#ffe08a'))
    layer(cv, lamp)
    cv.outline()
    return cv


def p_gas_bottle():
    """A propane bottle from above: the blue steel shoulder domed toward the light, a white stamped tare band, the guard
    collar with its two hand holes, the brass valve and the red hand wheel on its spokes."""
    S = 14
    c = S / 2
    cv = Cv(S, S)
    blue = ramp('#4f82c0', 0.55, 0.28, 0.35)
    fill_shape(cv, c, c, 6.0, 6.0, lambda u, v, L: shade(blue, L * 0.9 + 0.1))
    ring(cv, c, c, 5.4, 6.05, lambda dx, dy, d: blue[0] if dx + dy > 1 else blue[1])
    ring(cv, c, c, 4.4, 4.8, lambda dx, dy, d: hx('#e8e8e0') if abs(math.atan2(dy, dx) - 2.4) < 0.7 else None)   # the tare band
    smudge(cv, random.Random(2731), 4, (2, 2, 12, 12), (0.5, 1.0), 0.6, STEEL_GREY)   # knocks to the steel
    steel = ramp('#9aa4b4', 0.5, 0.25, 0.4)

    def collar(dx, dy, d):
        a = math.atan2(dy, dx)
        if abs(math.sin(a)) > 0.92 and 3.2 < d < 3.9:
            return hx('#1c2a44')                                       # the hand holes
        return shade(steel, light(dx / d * 0.9, dy / d * 0.9) if d > 3.5 else 0.9 - light(dx / d, dy / d) * 0.7)
    ring(cv, c, c, 2.8, 4.25, collar)
    fill_shape(cv, c, c, 2.8, 2.8, lambda u, v, L: hx('#1c2a44'))
    fill_shape(cv, c, c, 1.6, 1.6, lambda u, v, L: shade(ramp('#d8a840', 0.45, 0.22, 0.4), L))   # brass valve
    ring(cv, c, c, 1.0, 1.6, lambda dx, dy, d: shade(ramp('#d02828', 0.45, 0.22, 0.4), light(dx / d, dy / d)))   # hand wheel
    for a in (0.4, 2.5, 4.6):
        line(cv, c, c, c + math.cos(a) * 1.2, c + math.sin(a) * 1.2, hx('#a01818'))
    cv.dot(c - 0.25, c - 0.25, hx('#ffe8a0'))
    fgrain(cv, random.Random(2732), 3)
    cv.outline()
    return cv


def p_dance_stage():
    """Dance stage: a low round platform of dark lacquer with a brass edge and bulbs, a chrome pole in the middle."""
    S = 50
    cv = Cv(S, S)
    c = S / 2
    top = ramp('#3a1f4a', 0.45, 0.22, 0.3)
    riser = ramp('#1c1024', 0.4, 0.2, 0.5)
    fn = VNoise(S, S, 6, random.Random(181))
    for y in range(1, S - 1):
        for x in range(1, S - 1):
            d = math.hypot(x + 0.5 - c, y + 0.5 - c)
            if d <= 21.6:
                cv.set(x, y, shift(mix(top[2], top[3], max(0.0, 0.6 - d / 22)), int((fn(x, y) - 0.5) * 6)))
    rng = random.Random(182)
    for _ in range(54):                                                # glitter shed by the dancers, single specks
        a, d = rng.uniform(0, 2 * math.pi), 19.5 * math.sqrt(rng.random())
        x, y = c + math.cos(a) * d, c + math.sin(a) * d
        if d > 4.5:
            cv.dot(x, y, mix(cv.get(x, y), hx(rng.choice(('#f4e8c0', '#f8c8e8', '#c8f0f8', '#ffffff'))), rng.uniform(0.3, 0.55)))
    ring(cv, c, c, 13.0, 14.0, lambda dx, dy, d: top[3])
    ring(cv, c, c, 20.2, 21.6, lambda dx, dy, d: shade(ramp('#d8a848', 0.5, 0.25, 0.4), light(dx / d, dy / d)))
    ring(cv, c, c, 21.6, 24.0, lambda dx, dy, d: shade(riser, light(dx / d, dy / d)))
    for k in range(16):
        a = (k + 0.5) * math.pi / 8
        bx, by = c + math.cos(a) * 17.6, c + math.sin(a) * 17.6
        col = hx('#fff0c0') if k % 2 else hx('#ff8ad0')
        ring(cv, bx, by, 0.9, 1.3, lambda dx, dy, d: hx('#8a6a2a') if dx + dy < 0 else hx('#5a4418'))   # its brass socket
        fill_shape(cv, bx, by, 0.95, 0.95, lambda u, v, L, col=col: lt(col, 0.5) if L > 0.85 else col)
        cv.dot(bx - 0.5, by - 0.5, PURE_WHITE)

    def pole(ly):
        fill_shape(ly, c, c, 4.2, 4.2, lambda u, v, L: shade(STEEL, L))
        fill_shape(ly, c, c, 2.4, 2.4, lambda u, v, L: shade(ramp('#aab4c4', 0.5, 0.25, 0.5), L))
        ly.set(c - 1, c - 1, PURE_WHITE)
    layer(cv, pole)
    cv.outline()
    return cv


def p_desk():
    """Office desk (the seat on +y): mahogany with a tooled green leather inset, a typewriter with a sheet in it, a
    banker's lamp, a rotary phone, files and loose papers, a blotter with a letter and a pen, an ashtray with a cigar
    burning, a coffee mug and its ring."""
    W, H = 48, 26
    cv = Cv(W, H)
    wood_fill(cv, 1, 1, W - 2, H - 2, hx('#5a3020'), plank=6, rng=random.Random(13))
    mottle(cv, random.Random(131), 5, 7)
    bevel_edges(cv, 1, 1, W - 2, H - 2, 0.22, 0.35)
    for (x, y) in ((1, 1), (W - 2, 1), (1, H - 2), (W - 2, H - 2)):
        frect(cv, x + (0.5 if x > 1 else 0), y + (0.5 if y > 1 else 0), x + (1 if x > 1 else 0.5), y + (1 if y > 1 else 0.5), CLEAR)
    lea = ramp('#2a5a3c', 0.45, 0.22, 0.25)
    nz = VNoise(W, H, 3, random.Random(132))
    px_paint(cv, 4, 3.5, 44, 22.5, lambda x, y, c: shift(shade(lea, 0.62 + (nz(x, y) - 0.5) * 0.25), 0))
    for (x0, y0, x1, y1) in ((4, 3.5, 44, 4), (4, 4, 4.5, 22.5)):
        frect(cv, x0, y0, x1, y1, dk(lea[0], 0.3))                     # its edge sunk into the wood
    dash(cv, 5.0, 5.0, 43.0, 5.0, hx('#c8a050'), 1, 1)                 # the gold tooling
    dash(cv, 5.0, 21.5, 43.0, 21.5, hx('#a8843c'), 1, 1)
    dash(cv, 5.0, 5.0, 5.0, 21.5, hx('#c8a050'), 1, 1)
    dash(cv, 43.0, 5.0, 43.0, 21.5, hx('#a8843c'), 1, 1)
    smudge(cv, random.Random(133), 5, (8, 14, 40, 22), (1.5, 3.0), 0.14, hx('#6a8a6a'))   # leather rubbed pale
    ring(cv, 9.0, 19.5, 1.5, 2.1, lambda dx, dy, d: dk(cv.get(9.0 + dx, 19.5 + dy), 0.25) if dx - dy > -2 else None)   # a mug's ring
    ol = dk(hx('#5a3020'), 0.6)

    def paper(ly):
        fill_shape(ly, 24.5, 18.6, 7.0, 3.4, lambda u, v, L: shade(ramp('#1e3a2a', 0.45, 0.22, 0.25), L), kind='rect', corner=0.4, bevel=0.6)   # blotter
        for x in (17.5, 31.5):
            frect(ly, x - 0.5, 15.2, x + 0.5, 22.0, hx('#4a2a1a'))      # its leather ends
        fill_shape(ly, 26.0, 18.6, 2.8, 3.6, lambda u, v, L: hx('#f2eee4') if L > 0.5 else hx('#dad4c6'), ang=0.12,
                   kind='rect', corner=0.2, bevel=0.4)                 # a letter
        for k in range(5):
            line(ly, 24.0 + 0.12 * k, 16.4 + k * 1.0, 28.0 + 0.12 * k, 16.9 + k * 1.0, hx('#8a8a9a'))
        fill_capsule(ly, [(19.5, 21.0), (23.8, 17.0)], 0.4, lambda k, L, s, i, t: hx('#d8b040') if t > 0.9 else shade(ramp('#1a1a24', 0.4, 0.2, 0.6), L))   # pen
        for i, (x, y, a, col) in enumerate(((8.0, 9.5, -0.1, '#d8b878'), (8.5, 8.8, 0.08, '#c8a868'), (8.6, 8.2, -0.05, '#e8e0cc'))):
            fill_shape(ly, x, y, 3.8, 4.8, lambda u, v, L, col=col: shade(ramp(col, 0.4, 0.2, 0.3), L),
                       ang=a, kind='rect', corner=0.3, bevel=0.6)       # files, the top one a loose sheet
        for k in range(4):
            line(ly, 6.4, 5.8 + k * 1.2, 10.6, 5.6 + k * 1.2, hx('#a8a4b0'))
        fill_shape(ly, 14.0, 21.0, 2.2, 1.4, lambda u, v, L: hx('#f2eee4'), ang=-0.5, kind='rect', corner=0.2)   # a note
    layer(cv, paper, ol)

    def things(ly):
        fill_shape(ly, 9.0, 19.5, 1.9, 1.9, lambda u, v, L: shade(WHITE, L))   # the mug
        fill_shape(ly, 9.0, 19.5, 1.2, 1.2, lambda u, v, L: hx('#3a1e10') if L < 0.7 else hx('#5a3420'))
        fill_capsule(ly, [(10.9, 19.2), (11.6, 19.8)], 0.45, lambda k, L, s, i, t: shade(WHITE, L))
        ashtray(ly, 37.0, 19.5, random.Random(134), 2.3)
        fill_capsule(ly, [(35.4, 18.6), (31.6, 16.6)], 0.5, lambda k, L, s, i, t: SIGNAL_ORANGE if t > 0.92 else hx('#6a4024') if t < 0.2 else hx('#8a5a34'))   # the cigar
        brass = ramp('#c8a050', 0.5, 0.25, 0.45)
        fill_shape(ly, 40.5, 6.5, 2.0, 2.0, lambda u, v, L: shade(brass, L))   # banker's lamp: its base,
        fill_capsule(ly, [(36.0, 7.4), (44.0, 7.4)], 1.5, lambda k, L, s, i, t: hx('#9ef0b0') if L > 0.9 else shade(ramp('#1e7a4a', 0.45, 0.22, 0.4), L))   # its green shade
        for x in (35.6, 44.4):
            fill_shape(ly, x, 7.4, 0.5, 1.3, lambda u, v, L: shade(brass, L), kind='rect', corner=0.2)
        stud(ly, 40.0, 4.5, brass[1])                                  # the pull chain
    layer(cv, things)

    def typewriter(ly):
        body = ramp('#3e4a5a', 0.5, 0.25, 0.4)
        frect(ly, 19.0, 1.0, 29.0, 3.6, hx('#f2eee4'))                 # the sheet rolled in the platen
        for k in range(3):
            line(ly, 20.0, 1.6 + k * 0.7, 27.5, 1.6 + k * 0.7, hx('#b0acb8'))
        fill_shape(ly, 24.0, 8.4, 7.6, 4.8, lambda u, v, L: shade(body, L), kind='rect', bevel=1.8, corner=1.6)
        fill_capsule(ly, [(16.0, 4.2), (32.0, 4.2)], 1.1, lambda k, L, s, i, t: shade(ramp('#26262e', 0.4, 0.2, 0.5), L))   # platen
        for x in (15.6, 32.4):
            fill_shape(ly, x, 4.2, 0.7, 0.9, lambda u, v, L: shade(CHROME, L))   # its knobs
        line(ly, 32.0, 3.0, 34.4, 1.6, CHROME[2])                      # the carriage return lever
        frect(ly, 18.0, 6.0, 30.0, 7.0, hx('#1a1a22'))                 # the type basket's slot
        for row, y in enumerate((7.8, 9.0, 10.2)):                     # the keys, round caps in rows
            for k in range(9 - row):
                x = 18.4 + row * 0.6 + k * 1.4
                fill_shape(ly, x, y, 0.5, 0.45, lambda u, v, L: hx('#f0ece4') if L > 0.6 else hx('#bcb8b0'))
        frect(ly, 21.0, 11.4, 27.0, 12.0, hx('#e0dcd4'))               # the space bar
        frect(ly, 21.0, 11.8, 27.0, 12.0, hx('#9a968e'))
    layer(cv, typewriter)

    def phone(ly):
        red = ramp('#b82830', 0.5, 0.25, 0.35)
        fill_shape(ly, 40.5, 14.0, 3.6, 3.0, lambda u, v, L: shade(red, L), kind='super', p=2.6)
        fill_capsule(ly, [(37.4, 11.6), (43.6, 11.6)], 1.2, lambda k, L, s, i, t: shade(red, L))   # the handset
        ring(ly, 40.5, 15.0, 0.6, 1.9, lambda dx, dy, d: hx('#f0ece4') if int(math.atan2(dy, dx) * 1.6 + 6) % 2 else hx('#3a1418'))
        fill_shape(ly, 40.5, 15.0, 0.6, 0.6, lambda u, v, L: hx('#f0ece4'))
        line(ly, 44.0, 15.6, 45.6, 20.4, hx('#1a1018'))                # the coiled cord
        line(ly, 44.4, 15.6, 46.0, 20.4, hx('#3a2228'))
    layer(cv, phone)
    cv.outline()
    return cv


def p_chair():
    """Bistro chair: chrome tube frame, padded vinyl seat with its piping and a taped split, curved backrest on -x."""
    cv = Cv(16, 16)
    vin = ramp('#8e2c38', 0.5, 0.26, 0.32)
    chrome = ramp('#9ea4b4', 0.55, 0.28, 0.5)

    def seat(ly):
        for (fx, fy) in ((3.4, 3.0), (14.2, 3.0), (3.4, 13.0), (14.2, 13.0)):   # the frame's feet peeking out
            fill_shape(ly, fx, fy, 0.9, 0.9, lambda u, v, L: shade(chrome, L))
        fill_shape(ly, 9.0, 8.0, 5.4, 5.6, lambda u, v, L: shade(vin, L), kind='super', p=3.0)
        fill_shape(ly, 9.0, 8.0, 4.5, 4.7, lambda u, v, L: None if (abs(u) / 4.5) ** 3 + (abs(v) / 4.7) ** 3 < 0.8
                   else lt(shade(vin, L), 0.1), kind='super', p=3.0)     # the welt round the cushion
        crease(ly, [(7.6, 6.0), (9.2, 8.4), (11.4, 9.0)], 0.14)        # sat in
        frect(ly, 10.0, 10.5, 12.5, 11.5, hx('#2a2830'))               # a split, taped over
        frect(ly, 10.0, 10.5, 12.5, 11.0, hx('#4a4852'))
    layer(cv, seat)

    def back(ly):
        fill_capsule(ly, [(3.6, 2.0), (2.3, 4.6), (2.0, 8.0), (2.3, 11.4), (3.6, 14.0)], 1.25,
                     lambda k, L, s, i, t: (lt(chrome[3], 0.3) if L > 0.85 else shade(chrome, L)) if k > 0.55 else shade(vin, L))
    layer(cv, back)
    cv.outline()
    return cv


def p_armchair():
    """Chesterfield club armchair, oxblood leather, buttoned back and arms, nailheads down the arm fronts; back on -x,
    seat facing +x."""
    S = 28
    cv = Cv(S, S)
    lea = ramp('#7e2224', 0.5, 0.26, 0.32)
    seam = dk(lea[0], 0.45)
    fill_shape(cv, 14.0, 14.0, 13.0, 13.0, lambda u, v, L: lea[0], kind='rect', corner=2.6)

    def seat(ly):
        fill_shape(ly, 17.6, 14.0, 8.4, 7.4, lambda u, v, L: shade(lea, L), kind='rect', bevel=3.4, corner=2.0)
        crease(ly, [(13.5, 12.4), (17.0, 13.6), (21.5, 15.6)], 0.16)   # sat-in creases
        crease(ly, [(14.5, 16.8), (18.5, 16.4)], 0.12)
        dash(ly, 10.4, 7.6, 25.0, 7.6, lambda c: lt(c, 0.1), 1, 1)     # the cushion's piping
        dash(ly, 10.4, 20.4, 25.0, 20.4, lambda c: dk(c, 0.1), 1, 1)
    layer(cv, seat, seam)

    def arms(ly):
        for cy in (4.0, 24.0):
            fill_shape(ly, 15.5, cy, 11.6, 3.2, lambda u, v, L: shade(lea, L), kind='rect', bevel=2.4, corner=2.6)
            tufted(ly, 5.5, cy - 2.2, 24.0, cy + 2.2, lea, 5, 1, stagger=False)
            fill_shape(ly, 25.2, cy, 2.0, 2.6, lambda u, v, L: shade(lea, L + 0.08))   # rolled front of the arm
            for k in range(5):                                         # its brass nailheads
                stud(ly, 26.6, cy - 2.0 + k * 1.0, hx('#c8a050'))
    layer(cv, arms, seam)

    def back(ly):
        fill_shape(ly, 4.4, 14.0, 3.6, 13.0, lambda u, v, L: shade(lea, L), kind='rect', bevel=2.6, corner=2.6)
        tufted(ly, 1.6, 2.4, 7.2, 25.6, lea, 2, 6)
    layer(cv, back, seam)
    smudge(cv, random.Random(141), 6, (6, 6, 24, 22), (1.5, 3.0), 0.14, hx('#c88a70'))   # worn leather
    fgrain(cv, random.Random(142), 3)
    cv.outline()
    return cv


def p_sofa():
    """Three-seater: back along -y, rolled arms, three seat and three buttoned back cushions, worn vinyl with its
    piping, a cushion split on the foam, a cigarette burn."""
    W, H = 66, 30
    cv = Cv(W, H)
    lea = ramp('#a8346c', 0.52, 0.27, 0.32)
    seam = dk(lea[0], 0.5)
    fill_shape(cv, 33.0, 15.0, 32.0, 14.0, lambda u, v, L: lea[0], kind='rect', corner=2.6)

    def frame(ly):
        fill_shape(ly, 33.0, 4.6, 32.0, 3.6, lambda u, v, L: shade(lea, L - 0.05), kind='rect', bevel=2.6, corner=2.6)
        for cx in (4.6, 61.4):
            fill_shape(ly, cx, 16.0, 3.6, 13.0, lambda u, v, L: shade(lea, L), kind='rect', bevel=2.8, corner=2.6)
            dash(ly, cx - 2.6, 4.0, cx - 2.6, 28.0, lambda c: lt(c, 0.1), 1, 1)   # the arm's piping
            crease(ly, [(cx - 1.0, 9.0), (cx + 0.6, 12.0)], 0.12)
        dash(ly, 2.0, 1.9, 64.0, 1.9, lambda c: lt(c, 0.12), 1, 1)
    layer(cv, frame, seam)
    rng = random.Random(151)

    def cushions(ly):
        for i, cx in enumerate((17.0, 33.0, 49.0)):
            dy = rng.uniform(-0.3, 0.3)
            fill_shape(ly, cx, 19.5 + dy, 7.9, 8.6, lambda u, v, L: shade(lea, L), kind='rect', bevel=3.6, corner=2.2)
            fill_shape(ly, cx, 10.2, 7.9, 2.6, lambda u, v, L: shade(lea, L + 0.04), kind='rect', bevel=2.2, corner=2.0)
            for bx in (cx - 3.6, cx + 3.6):                            # the back cushion's two buttons and their pleats
                line(ly, bx - 1.6, 9.0, bx, 10.2, dk(lea[1], 0.15))
                line(ly, bx + 1.6, 9.0, bx, 10.2, dk(lea[1], 0.15))
                stud(ly, bx - 0.25, 10.0, dk(lea[1], 0.2), big=True)
            dash(ly, cx - 7.0, 11.6 + dy, cx + 7.0, 11.6 + dy, lambda c: lt(c, 0.14), 1, 1)   # seat cushion piping
            dash(ly, cx - 7.2, 12.0 + dy, cx - 7.2, 27.0 + dy, lambda c: dk(c, 0.1), 1, 1)
            crease(ly, [(cx - 2.5, 20.0 + dy), (cx, 21.0 + dy), (cx + 2.0, 21.5 + dy)], 0.16)   # sat-in dip
            crease(ly, [(cx - 4.0, 16.0 + dy), (cx - 1.0, 15.2 + dy)], 0.1)
            for k in range(3):                                         # vinyl crazed on the front edge
                vx = cx - 5.0 + k * 3.7 + rng.uniform(-0.5, 0.5)
                line(ly, vx, 26.0 + dy, vx + rng.uniform(-0.6, 0.6), 27.4 + dy, dk(lea[2], 0.18))
    layer(cv, cushions, seam)
    # one cushion split, foam showing
    fill_shape(cv, 45.4, 22.6, 1.8, 0.7, lambda u, v, L: hx('#e8d898') if v < 0.2 else hx('#c8b070'), ang=0.35)
    line(cv, 43.4, 21.8, 47.6, 23.4, OUTLINE)
    fill_shape(cv, 24.0, 23.0, 0.6, 0.5, lambda u, v, L: hx('#1a1012'))   # cigarette burn
    ring(cv, 24.0, 23.0, 0.5, 1.0, lambda dx, dy, d: hx('#6a3a2a'))
    smudge(cv, rng, 9, (8, 12, 58, 26), (1.5, 3.5), 0.14)
    fgrain(cv, random.Random(152), 3)
    cv.outline()
    return cv


def p_plant():
    """Potted areca palm: a terracotta pot (the hitbox) with its rolled lip, dark soil and a few pebbles, three tiers of
    fronds spilling past it, the lowest in the shade of the others."""
    S = 24
    c = S / 2
    cv = Cv(S, S)
    pot = ramp('#c06036', 0.45, 0.22, 0.35)
    ring(cv, c, c, 5.4, 7.4, lambda dx, dy, d: shade(pot, light(dx / d * 0.85, dy / d * 0.85)) if d > 6.2 else
         shade(pot, 0.95 - light(dx / d * 0.7, dy / d * 0.7) * 0.7))
    ring(cv, c, c, 6.1, 6.4, lambda dx, dy, d: dk(cv.get(c + dx, c + dy), 0.18))   # under the lip
    rng = random.Random(161)
    soil = VNoise(S, S, 2, rng)
    fill_shape(cv, c, c, 5.5, 5.5, lambda u, v, L: mix(hx('#1e130a'), hx('#4a3020'), soil(c + u, c + v) * 0.8 + (u + v) * 0.02))
    for _ in range(6):
        a, r = rng.uniform(0, 6.3), rng.uniform(2.5, 5.0)
        fill_shape(cv, c + math.cos(a) * r, c + math.sin(a) * r, 0.45, 0.4, lambda u, v, L: hx('#a89a88') if L > 0.6 else hx('#6a5e50'))
    smudge(cv, rng, 4, (5, 5, 19, 19), (0.8, 1.5), 0.3, hx('#d8d0b8'))   # salts dried on the clay
    cv.outline()
    greens = [ramp('#1e5a28', 0.6, 0.32, 0.3), ramp('#2e7a34', 0.55, 0.3, 0.32), ramp('#48a040', 0.5, 0.28, 0.35)]
    rng = random.Random(77)
    for lay, n, ln in ((0, 6, 11.0), (1, 5, 9.0), (2, 4, 6.4)):
        leaves = Cv(S, S)
        for i in range(n):
            a = i * 2 * math.pi / n + rng.uniform(-0.3, 0.3) + lay * 0.62
            frond(leaves, c, a, ln * rng.uniform(0.9, 1.05), rng.uniform(-0.45, 0.45), greens[lay], rng,
                  2.6 if lay < 2 else 1.9)
        leaves.outline(hx('#0c2410'))
        cv.over(leaves)
    return cv


def p_tv():
    """80s woodgrain CRT on a black TV cart, from above, the screen facing +y: the tube's black housing tapering to the
    back with its vents and its cord, the walnut veneer of the cabinet, rabbit ears on their base, the silver bezel and
    the bulging glass lit by its picture, the channel knobs, the VCR on the cart's shelf blinking 12:00."""
    W, H = 24, 17
    cv = Cv(W, H)
    cart = ramp('#24222c', 0.4, 0.2, 0.45)
    fill_shape(cv, 12.0, 8.5, 11.0, 7.5, lambda u, v, L: shade(cart, L), kind='rect', bevel=1.0, corner=0.8)
    for (x, y) in ((1.5, 1.5), (22.5, 1.5), (1.5, 15.5), (22.5, 15.5)):
        fill_shape(cv, x, y, 0.75, 0.75, lambda u, v, L: shade(CHROME, L))   # the cart's chrome posts
    cv.outline()

    def set_(ly):
        back = ramp('#2e2a34', 0.45, 0.22, 0.4)
        fill_shape(ly, 12.0, 3.6, 6.6, 2.6, lambda u, v, L: shade(back, L), kind='rect', bevel=1.4, corner=1.6, taper=0.0)
        for x in range(8, 17):                                         # vent slots in the housing
            frect(ly, x + 0.25, 2.0, x + 0.75, 4.0, back[0])
        frect(ly, 13.5, 4.3, 16.0, 5.0, hx('#c8c4b4'))                 # the maker's sticker
        wood_fill(ly, 2, 5, 21, 12, hx('#6e4224'), plank=9, rng=random.Random(171))
        bevel_edges(ly, 2, 5, 21, 12, 0.25, 0.3)
        frect(ly, 2.0, 5.0, 2.5, 5.5, CLEAR)
        frect(ly, 21.5, 5.0, 22.0, 5.5, CLEAR)
        frect(ly, 2.0, 12.0, 22.0, 13.0, lambda c: PALE_STEEL)      # the silver bezel
        frect(ly, 2.0, 12.0, 22.0, 12.5, hx('#e8ecf4'))
        frect(ly, 17.0, 12.0, 21.5, 13.0, SILVER_GREY)               # the control column
        for x in (18.0, 19.5):
            knob(ly, x + 0.25, 12.5, 0.7, '#1a1820', -1.2)
        stud(ly, 21.0, 12.5, hx('#e03030'))                            # the power light
        fill_shape(ly, 11.6, 7.4, 1.6, 1.2, lambda u, v, L: shade(ramp('#2a2830', 0.45, 0.22, 0.5), L))   # the ears' base
        for (ex, ey) in ((4.6, 0.5), (19.6, 0.8)):
            line(ly, 11.6, 7.2, ex, ey, hx('#d8dce6'))
            line(ly, 11.6 + (0.5 if ex > 12 else -0.5), 7.4, ex + (0.5 if ex > 12 else -0.5), ey + 0.3, hx('#7a808c'))
            ly.dot(ex, ey, PURE_WHITE)
        line(ly, 7.0, 2.0, 2.5, 0.5, TYRE_BLACK)                    # the cord off the back
    layer(cv, set_)
    pic = [hx('#9ef6ff'), hx('#ffd0a0'), hx('#7ab0ff'), hx('#ff9ac8'), hx('#c8f0ff')]

    def glass(x, y, c):                                                # the glass bulging past the bezel, its picture
        col = pic[int(x * 0.6) % 5]
        if y >= 13.5:
            col = mix(col, hx('#3a6a8a'), 0.45)
        if abs(x - 5.5) < 0.6 and y < 13.5:
            col = PURE_WHITE                                        # a lamp caught on the curve
        return col
    px_paint(cv, 3.0, 13.0, 17.0, 14.0, glass)
    frect(cv, 2.5, 13.0, 3.0, 14.0, OUTLINE)
    frect(cv, 17.0, 13.0, 21.5, 14.0, hx('#5a5e6a'))
    frect(cv, 21.5, 13.0, 22.0, 14.0, OUTLINE)
    frect(cv, 4.0, 14.5, 20.0, 16.0, hx('#3a3846'))                   # the VCR on the shelf
    frect(cv, 4.0, 14.5, 20.0, 15.0, hx('#5a5868'))
    frect(cv, 6.0, 15.0, 12.0, 15.5, TYRE_BLACK)                   # its cassette door
    for x in (14.5, 15.0, 16.0, 16.5):                                 # 12:00 blinking forever
        cv.dot(x, 15.25, LED_RED)
    for x in (18.0, 19.0):
        cv.dot(x, 15.25, hx('#b8bcc8'))
    return cv, glow_from(cv, lambda x, y, c: (y == 13 and 3 <= x <= 16) or (y == 15 and 14 <= x <= 16 and c[0] > 200 and c[1] < 80))


def p_fridge():
    """Almond fridge from above, its door along +y: the enamel top, dustier toward the wall, its pressed panel, the
    condenser's coils standing off the back, the door's top edge on its black gasket, the chrome cap of the long
    handle and the hinge plate, a pizza box and a can left up there."""
    S = 24
    cv = Cv(S, S)
    cr = ramp('#ddd0aa', 0.42, 0.2, 0.4)
    rng = random.Random(181)

    def coils(x, y, c):                                                # the zigzag tube, its top catching the light
        return hx('#8a8696') if int(x * 2) % 3 == 0 and y < 1.5 else hx('#3a3640') if y < 1.5 else hx('#16121c')
    px_paint(cv, 2.5, 1, 21.5, 2.5, coils)
    fill_shape(cv, 12.0, 11.0, 11.0, 9.0, lambda u, v, L: shade(cr, L), kind='rect', bevel=1.4, corner=1.2)
    dust = VNoise(S, S, 4, rng)

    def top(x, y, c):                                                  # dust, thicker toward the wall nobody wipes
        if c[3] == 0 or c == OUTLINE:
            return None
        k = max(0.0, 0.5 - (y - 2) / 22.0) * 0.5 + (dust(x, y) - 0.5) * 0.12
        return mix(c, hx('#9a9078'), max(0.0, k))
    px_paint(cv, 1, 2, 23, 20, top)
    for (x0, y0, x1, y1) in ((2.5, 3.0, 21.5, 3.5), (2.5, 3.5, 3.0, 18.5)):
        frect(cv, x0, y0, x1, y1, lambda c: dk(c, 0.12))               # the pressed panel of the top, its shadowed side
    for (x0, y0, x1, y1) in ((2.5, 18.5, 21.5, 19.0), (21.0, 3.5, 21.5, 18.5)):
        frect(cv, x0, y0, x1, y1, lambda c: lt(c, 0.14))               # and its lit side
    for (x, y) in ((2.0, 2.5), (21.5, 2.5)):
        stud(cv, x, y, cr[1])

    def door(x, y, c):
        if y < 20.5:
            return hx('#1c1820')                                       # the gasket
        if y < 21.0:
            return lt(cr[3], 0.1)
        return cr[2] if y < 22.0 else cr[1]
    px_paint(cv, 1.5, 20, 22.5, 22.5, door)
    frect(cv, 1.5, 20.5, 2.0, 22.5, cr[3])
    frect(cv, 22.0, 20.5, 22.5, 22.5, cr[0])
    frect(cv, 18.5, 20.0, 22.0, 22.5, lambda c: shade(CHROME, 0.62))  # the hinge plate and its pin
    frect(cv, 18.5, 20.0, 22.0, 20.5, CHROME[3])
    stud(cv, 19.5, 21.0, CHROME[1])
    stud(cv, 21.0, 21.5, CHROME[1])
    chrome_bar(cv, 3.0, 20.5, 7.0, 23.0)                               # the handle's cap, standing proud of the door
    smudge(cv, rng, 3, (3, 19, 9, 23), (0.6, 1.2), 0.18)               # finger marks round it
    cv.outline()

    def things(ly):
        fill_shape(ly, 14.5, 9.5, 4.6, 4.4, lambda u, v, L: shade(ramp('#c8a46a', 0.45, 0.22, 0.3), L),
                   ang=0.16, kind='rect', bevel=0.9, corner=0.4)       # a pizza box
        fill_shape(ly, 14.6, 9.4, 2.0, 2.0, lambda u, v, L: hx('#c02a24') if math.hypot(u, v) > 1.2 else hx('#f2e6c8'))
        fill_shape(ly, 14.6, 9.4, 0.7, 0.7, lambda u, v, L: hx('#2a6a3a'))
        line(ly, 10.4, 12.0, 18.6, 13.4, dk(hx('#c8a46a'), 0.3))       # the lid's fold
        smudge(ly, rng, 2, (11, 6, 17, 12), (0.7, 1.2), 0.3, hx('#7a5020'))   # grease through the card
        can_top(ly, 6.0, 7.0, 1.5, hx('#c8202a'))
    layer(cv, things)
    return cv


def p_oven():
    """80s gas range from above, front along +y: the raised backguard with its clock, four burners in their chrome
    drip bowls under cast-iron grates (one lit blue), a pan frying an egg, a kettle, baked-on spills, the knobs on the
    front strip and the oven door's chrome handle."""
    S = 22
    cv = Cv(S, S)
    en = ramp('#e2ddd0', 0.42, 0.2, 0.35)
    rng = random.Random(191)
    fill_shape(cv, 11.0, 11.0, 10.0, 10.0, lambda u, v, L: shade(en, L), kind='rect', bevel=1.2, corner=1.0)
    mottle(cv, random.Random(1911), 4, 5)
    fill_shape(cv, 11.0, 2.4, 10.0, 1.5, lambda u, v, L: shade(ramp('#bdb4a0', 0.45, 0.22, 0.4), L), kind='rect',
               bevel=0.8, corner=0.6)                                  # backguard
    frect(cv, 1, 3.9, 21, 4.4, lambda c: dk(en[1], 0.25))             # its shadow on the cooktop
    frect(cv, 8.5, 1.5, 13.5, 3.2, hx('#141a16'))                     # the clock's window
    for x in (9.0, 10.0, 11.5, 12.5):
        cv.dot(x, 2.0, hx('#5aff8a'))
        cv.dot(x, 2.5, hx('#2a9a4a'))
    for x in (3.0, 18.5):
        stud(cv, x, 2.0, hx('#8a8474'))
    smudge(cv, rng, 5, (2, 5, 20, 16), (0.8, 1.8), 0.32, hx('#7a5226'))   # baked-on spills
    iron = ramp('#3a3640', 0.5, 0.25, 0.4)
    burners = ((6.0, 7.6), (16.0, 7.6), (6.0, 13.2), (16.0, 13.2))
    for (bx, by) in burners:
        ring(cv, bx, by, 1.5, 3.0, lambda dx, dy, d: shade(CHROME, 0.2 + 0.9 * light(-dx / d * 0.9, -dy / d * 0.9)))   # drip bowl
        ring(cv, bx, by, 2.9, 3.2, lambda dx, dy, d: dk(en[1], 0.3) if dx + dy < 0 else None)
        ring(cv, bx, by, 0.8, 1.5, lambda dx, dy, d: shade(iron, light(dx / d, dy / d)) if int(math.atan2(dy, dx) * 2.6) % 2 else iron[0])   # burner head, its ports
        fill_shape(cv, bx, by, 0.85, 0.85, lambda u, v, L: shade(ramp('#2a2630', 0.4, 0.2, 0.5), L))
    ring(cv, 16.0, 13.2, 1.5, 2.1, lambda dx, dy, d: (hx('#9adfff') if d < 1.75 else hx('#3a7aff')) if int(math.atan2(dy, dx) * 2.6) % 2 else hx('#2a5ae8'))
    for gx in (6.0, 16.0):                                             # two cast-iron grates, one over each pair
        for (pts, r_) in (([(gx - 3.6, 4.6), (gx + 3.6, 4.6), (gx + 3.6, 16.0), (gx - 3.6, 16.0), (gx - 3.6, 4.6)], 0.38),
                          ([(gx - 3.6, 10.4), (gx + 3.6, 10.4)], 0.38)):
            fill_capsule(cv, pts, r_, lambda k, L, s, i, t: shade(iron, L))
        for by in (7.6, 13.2):
            for a in (0.785, 2.356, 3.927, 5.498):                     # its fingers reaching in over the bowl
                ca, sa = math.cos(a), math.sin(a)
                fill_capsule(cv, [(gx + ca * 1.9, by + sa * 1.9), (gx + ca * 4.2, by + sa * 4.2)], 0.36,
                             lambda k, L, s, i, t: shade(iron, L))
    for i, x in enumerate((3.2, 7.1, 11.0, 14.9, 18.8)):              # the knobs on the front strip
        knob(cv, x, 18.0, 1.35, '#4a4652', -math.pi / 2 + (0.0, 0.9, -0.6, 2.2, 0.0)[i])
    frect(cv, 1.5, 16.2, 20.5, 16.6, lambda c: dk(c, 0.18))           # where the cooktop drops to the front strip
    chrome_bar(cv, 3.0, 19.6, 19.0, 21.0)                              # the oven door's handle
    for x in (3.0, 18.4):
        frect(cv, x, 19.4, x + 0.6, 21.0, CHROME[1])
    cv.outline()

    def pan(ly):
        fill_capsule(ly, [(2.6, 15.6), (0.6, 17.8)], 0.55, lambda k, L, s, i, t: shade(ramp('#1a1620', 0.4, 0.2, 0.6), L))
        fill_shape(ly, 6.0, 13.2, 3.6, 3.6, lambda u, v, L: shade(ramp('#3a3640', 0.5, 0.25, 0.5), L))
        fill_shape(ly, 6.0, 13.2, 2.8, 2.8, lambda u, v, L: hx('#26222c') if u + v > -1.6 else hx('#3a3644'))
        fill_shape(ly, 5.6, 13.0, 1.7, 1.4, lambda u, v, L: hx('#f6f2e6') if L > 0.4 else hx('#e2dccc'), ang=0.4)   # the egg
        fill_shape(ly, 5.7, 13.0, 0.65, 0.65, lambda u, v, L: hx('#ffd84a') if L > 0.6 else hx('#f2b42a'))

        def kettle(u, v, L):
            return shade(ramp('#c8402c', 0.5, 0.25, 0.4), L)
        fill_shape(ly, 16.0, 7.6, 2.9, 2.9, kettle)
        fill_shape(ly, 16.0, 7.6, 1.2, 1.2, lambda u, v, L: hx('#2a2630') if L < 0.6 else hx('#4a4652'))   # its lid knob
        fill_capsule(ly, [(18.4, 6.4), (19.8, 5.2)], 0.5, lambda k, L, s, i, t: shade(ramp('#c8402c', 0.5, 0.25, 0.4), L))   # spout
        fill_capsule(ly, [(13.6, 6.0), (16.0, 4.9), (18.4, 6.0)], 0.35, lambda k, L, s, i, t: hx('#1a1620'))   # bail handle
    layer(cv, pan)
    return cv


def p_sink():
    """Stainless double sink from above (the wall at -y): brushed deck with its rolled upstand, two deep basins lit on
    their far walls, strainers, a mixer tap with its spout over the left basin and a drop hanging from it, a plate and a
    mug left to soak, a sponge, limescale and water spots."""
    W, H = 28, 20
    cv = Cv(W, H)
    st = ramp('#a6aeba', 0.48, 0.22, 0.42)
    rng = random.Random(201)
    fill_shape(cv, 14.0, 10.0, 13.0, 9.0, lambda u, v, L: shade(st, L), kind='rect', bevel=1.2, corner=1.0)
    frect(cv, 1.5, 1.0, 26.5, 1.5, lt(st[3], 0.2))                    # the upstand rolled over at the wall
    frect(cv, 1.5, 2.0, 26.5, 2.5, dk(st[1], 0.1))
    brushed(cv, rng, (1, 1, 27, 19), 6)
    basin = ramp('#6a7280', 0.5, 0.26, 0.3)
    for bx in (7.5, 20.5):
        fill_shape(cv, bx, 11.5, 5.4, 6.1, lambda u, v, L: shade(basin, 1.05 - L * 0.95), kind='rect', bevel=2.4, corner=1.8)
        fill_shape(cv, bx, 11.5, 5.4, 6.1, lambda u, v, L: (lt(st[3], 0.25) if u > 0 and v > 0 else dk(st[0], 0.2))
                   if (abs(u) > 4.9 or abs(v) > 5.6) and (u > 0 and v > 0 or u < 0 and v < 0) else None, kind='rect', corner=1.8)
        brushed(cv, random.Random(int(bx * 10)), (int(bx) - 4, 7, int(bx) + 4, 16), 4, along_x=False)
        ring(cv, bx, 12.8, 0.9, 1.5, lambda dx, dy, d: lt(st[3], 0.2) if dx + dy < 0 else st[0])   # the strainer
        fill_shape(cv, bx, 12.8, 0.9, 0.9, lambda u, v, L: GUNMETAL)
        for (ox, oy) in ((-0.5, 0.0), (0.5, 0.0), (0.0, -0.5), (0.0, 0.5)):
            cv.dot(bx + ox, 12.8 + oy, hx('#8a929e'))
        smudge(cv, rng, 2, (int(bx) - 3, 10, int(bx) + 3, 16), (1.0, 1.8), 0.22, hx('#d8d0b0'))   # limescale
    for _ in range(14):                                                # water spots dried on the deck
        x, y = rng.uniform(2, 26), rng.uniform(3, 18)
        if 2.0 < x < 13.0 and 5.4 < y < 17.6 or 15.0 < x < 26.0 and 5.4 < y < 17.6:
            continue
        cv.dot(x, y, lt(cv.get(x, y), 0.25))
    cv.outline()

    def tap(ly):
        tr = ramp('#d0d6e0', 0.5, 0.25, 0.55)
        fill_shape(ly, 14.0, 3.2, 3.6, 1.2, lambda u, v, L: shade(tr, L), kind='rect', corner=1.0, bevel=0.8)   # its plate
        for (x, dot) in ((11.0, hx('#2a7af0')), (17.0, hx('#f03a3a'))):   # the two cross-head handles
            fill_shape(ly, x, 3.2, 1.3, 1.3, lambda u, v, L: shade(tr, L), kind='super', p=1.3)
            fill_shape(ly, x, 3.2, 0.5, 0.5, lambda u, v, L, dot=dot: dot)
        fill_capsule(ly, [(14.0, 3.2), (12.6, 4.6), (10.4, 6.4), (9.2, 7.4)], 0.55,
                     lambda k, L, s, i, t: lt(tr[3], 0.3) if L > 0.9 else shade(tr, L))   # the spout
        ly.dot(9.0, 7.5, hx('#5a6070'))
    layer(cv, tap)
    cv.dot(8.75, 8.25, hx('#cfefff'))                                  # the drop hanging from it
    cv.dot(8.75, 8.75, hx('#7ab8e0'))

    def dishes(ly):
        fill_shape(ly, 20.8, 12.0, 3.4, 3.4, lambda u, v, L: shade(WHITE, L) if math.hypot(u, v) > 2.2 else hx('#e8e4d8'))
        ring(ly, 20.8, 12.0, 2.2, 2.5, lambda dx, dy, d: hx('#3a6ab0'))   # its blue band
        smudge(ly, rng, 2, (19, 10, 23, 14), (0.6, 1.0), 0.6, hx('#b85a2a'))   # sauce
        line(ly, 18.0, 9.6, 23.4, 15.0, PALE_STEEL)                  # a fork across it
        line(ly, 18.0, 10.0, 23.0, 15.2, hx('#7a808c'))
        fill_shape(ly, 5.6, 14.2, 1.8, 1.8, lambda u, v, L: shade(ramp('#3a7ac0', 0.45, 0.22, 0.4), L))   # the mug
        fill_shape(ly, 5.6, 14.2, 1.1, 1.1, lambda u, v, L: hx('#2a1810'))
        fill_capsule(ly, [(7.4, 13.8), (8.0, 14.6)], 0.4, lambda k, L, s, i, t: shade(ramp('#3a7ac0', 0.45, 0.22, 0.4), L))
        fill_shape(ly, 24.0, 3.8, 1.8, 1.0, lambda u, v, L: hx('#f2d44a') if v > -0.3 else hx('#3a8a3a'), ang=-0.15,
                   kind='rect', corner=0.3, bevel=0.5)                 # the sponge
    layer(cv, dishes)
    return cv


def p_toilet():
    """Toilet from above, the wall at -y: the cistern under its lid with a spare roll on it and the chrome lever, the
    lid raised against it, the seat on its hinges, the bowl's porcelain rim, the water and the dark of the trap, a
    brown ring at the waterline and a streak of scale from under the rim."""
    W, H = 15, 23
    cv = Cv(W, H)
    wh = ramp('#ecebf0', 0.4, 0.18, 0.2)
    rng = random.Random(211)

    def bowl(ly):
        fill_shape(ly, 7.5, 14.6, 5.7, 7.3, lambda u, v, L: shade(wh, L))   # the seat
        fill_shape(ly, 7.5, 14.8, 4.2, 5.6, lambda u, v, L: shade(ramp('#f2f0ea', 0.4, 0.2, 0.2), 1.1 - L * 0.8))   # porcelain rim
        fill_shape(ly, 7.5, 15.0, 3.6, 4.9, lambda u, v, L: shade(ramp('#e4e2da', 0.4, 0.2, 0.2), 1.05 - L * 0.9))  # the bowl falling away
        fill_shape(ly, 7.5, 15.6, 2.5, 3.4, lambda u, v, L: hx('#9ac8d4') if L < 0.7 else hx('#c4e6ee'))           # the water
        fill_shape(ly, 7.5, 14.6, 1.1, 1.5, lambda u, v, L: hx('#3a6a80') if L < 0.6 else hx('#4e84a0'))           # the trap
        ly.dot(6.5, 16.5, hx('#f4fcff'))
    layer(cv, bowl)

    def stain(x, y, c):
        e = ((x - 7.5) / 2.6) ** 2 + ((y - 15.6) / 3.5) ** 2
        return mix(c, hx('#a8884a'), 0.45) if 0.85 < e <= 1.08 and c[3] else None   # the ring at the waterline
    px_paint(cv, 4, 11, 11, 20, stain)
    line(cv, 7.0, 10.2, 7.2, 12.4, mix(hx('#e4e2da'), hx('#c8a050'), 0.5))   # scale streaking down from the rim

    def tank(ly):
        fill_shape(ly, 7.5, 3.4, 6.5, 2.7, lambda u, v, L: shade(wh, L), kind='rect', bevel=1.2, corner=1.0)
        frect(ly, 1.5, 5.6, 13.5, 6.1, lambda c: dk(c, 0.18))         # the lid's overhang
        fill_shape(ly, 7.5, 6.9, 5.2, 0.7, lambda u, v, L: shade(wh, L - 0.1), kind='rect', corner=0.5, bevel=0.4)   # the raised lid, on edge
        chrome_bar(ly, 1.0, 4.4, 3.4, 5.4)                             # the flush lever
        fill_shape(ly, 9.8, 3.2, 1.7, 1.7, lambda u, v, L: shade(WHITE, L))   # a spare roll
        fill_shape(ly, 9.8, 3.2, 0.6, 0.6, lambda u, v, L: hx('#a89878'))
        for x in (4.0, 11.0):                                          # the seat's hinges
            fill_shape(ly, x, 7.9, 0.8, 0.6, lambda u, v, L: shade(CHROME, L), kind='rect', corner=0.2)
    layer(cv, tank)
    smudge(cv, rng, 3, (3, 1, 13, 6), (0.8, 1.4), 0.08)
    return cv


def p_bed():
    """Double bed: headboard at -y, two pillows, folded-back sheet, rumpled duvet with a turned corner."""
    W, H = 46, 66
    cv = Cv(W, H)
    wood_fill(cv, 1, 1, W - 2, H - 2, hx('#5a3424'), plank=5, rng=random.Random(14), vertical=True)
    cv.rect(1, 1, W - 2, 4, hx('#3e2418'))
    for x in range(1, W - 1):
        cv.set(x, 1, hx('#6e4632'))
    sheet = ramp('#5e2a8a', 0.52, 0.26, 0.34)
    mat = Cv(W, H)
    fill_shape(mat, 23.0, 34.0, 20.6, 29.0, lambda u, v, L: hx('#e8e2ea'), kind='rect', corner=1.5)
    for cx in (13.5, 32.5):
        fill_shape(mat, cx, 10.0, 8.4, 4.4, lambda u, v, L: shade(WHITE, L), kind='rect', bevel=3.2, corner=2.4)
    mat.set(11, 10, WHITE[1])
    mat.set(12, 10, WHITE[1])
    mat.set(34, 9, WHITE[1])
    mat.outline(dk(hx('#5a3424'), 0.5))
    cv.over(mat)
    rng = random.Random(15)
    # long soft folds running down from where someone kicked the duvet, the edges rolling over the mattress
    folds = [(1.2 + rng.uniform(-0.35, 0.35), rng.uniform(0.2, 0.3), rng.uniform(0.9, 1.5), rng.uniform(0, 6.28))
             for _ in range(3)]
    nz = VNoise(W, H, 11, random.Random(16))

    def hf(x, y):
        h = nz(x, y) * 1.6
        for (a, f, amp, ph) in folds:
            h += amp * math.sin((x * math.cos(a) + y * math.sin(a)) * f + ph)
        e = min(x - 1, W - 2 - x)
        return h - (max(0.0, 3.0 - e) ** 2) * 0.35
    duv = Cv(W, H)
    fill_shape(duv, 23.0, 39.5, 21.6, 24.0, lambda u, v, L: sheet[2], kind='rect', corner=2.0)
    for y in range(48, 64):                         # bottom-right corner kicked back
        for x in range(W):
            if duv.on(x, y) and (x - 30) + (y - 48) > 15:
                duv.set(x, y, CLEAR)
    relief(duv, 1, 15, W - 2, H - 2, hf, sheet, 0.8)

    def quilt(x, y, c):
        if c[3] == 0 or c == OUTLINE or y < 19:
            return None
        a, b = (x + y) % 7.0, (x - y) % 7.0
        if (a < 0.5 or b < 0.5) and int(x * 2 + y * 2) % 3:
            return dk(c, 0.13)                       # the quilting's stitches
        if a < 1.0 or b < 1.0:
            return lt(c, 0.05)                       # the down puffed up beside them
        return None
    px_paint(duv, 1, 15, W - 1, H - 1, quilt)
    for x in range(1, W - 1):                       # the sheet folded back over the duvet
        for y in (16, 17, 18):
            if duv.on(x, y):
                duv.set(x, y, WHITE[3] if y == 16 else WHITE[2] if y == 17 else WHITE[1])
    duv.outline()
    cv.over(duv)
    flap = Cv(W, H)                                 # the turned corner lies on the duvet, lining up
    for y in range(40, 64):
        for x in range(W - 1):
            s = (x - 30) + (y - 48)
            if 8 < s <= 15 and duv.on(x, y) and x < W - 3 and y < H - 3:
                flap.set(x, y, mix(hx('#d4c4e0'), hx('#a890c0'), (s - 8) / 7.0))
    flap.outline()
    cv.over(flap)
    cv.outline()
    return cv


def p_pool_table():
    """Pool table: wood rails with mother-of-pearl sights, leather pocket rims over their nets, rubber cushions, worn
    felt lit from above with its nap and chalk marks, the head string, a game in progress, cue, chalk."""
    W, H = 82, 46
    cv = Cv(W, H)
    wood_fill(cv, 1, 1, W - 2, H - 2, hx('#6a3518'), plank=3, rng=random.Random(16))
    mottle(cv, random.Random(161), 6, 5)
    bevel_edges(cv, 1, 1, W - 2, H - 2, 0.25, 0.35)
    felt = ramp('#1f7a4c', 0.45, 0.22, 0.18)
    fn = VNoise(W, H, 5, random.Random(17))
    rng = random.Random(163)
    x0, y0, x1, y1 = 6, 6, W - 7, H - 7
    cx, cy = W / 2, H / 2

    def cloth(x, y, c):
        if x < x0 or x >= x1 + 1 or y < y0 or y >= y1 + 1:     # the rubber cushions along the rails
            if x < x0 - 0.5 or y < y0 - 0.5:
                return felt[1]
            if x >= x1 + 1.5 or y >= y1 + 1.5:
                return felt[0]
            return lt(felt[2], 0.08) if (x < x0 or y < y0) else dk(felt[1], 0.1)
        d = math.hypot((x - cx) / (W * 0.5), (y - cy) / (H * 0.5))
        c = mix(felt[2], lt(felt[2], 0.2), max(0.0, 0.7 - d))   # lamp hot spot
        c = shift(c, int((fn(x, y) - 0.5) * 8) + rng.randint(-2, 2))   # the nap
        if x < x0 + 0.5 or y < y0 + 0.5:
            c = dk(c, 0.2)                                     # the cushions' shadow on the cloth
        return c
    px_paint(cv, x0 - 1, y0 - 1, x1 + 2, y1 + 2, cloth)
    dash(cv, 22.0, y0 + 1, 22.0, y1, lambda c: lt(c, 0.06), 1, 2)            # the head string, chalked faintly
    cv.dot(22.0, cy, lt(felt[3], 0.3))                                       # the spots
    cv.dot(60.0, cy, lt(felt[3], 0.3))
    smudge(cv, random.Random(162), 4, (x0 + 4, y0 + 4, x1 - 4, y1 - 4), (2.0, 3.5), 0.12)   # spilled beer
    smudge(cv, random.Random(164), 5, (x0 + 4, y0 + 4, x1 - 4, y1 - 4), (0.4, 1.0), 0.35, hx('#4a8ad8'))   # chalk
    for x in (16, 26, 36, 46, 56, 66):                                       # mother-of-pearl diamonds
        for y in (2.0, H - 3.0):
            fill_shape(cv, x + 0.5, y + 0.5, 0.9, 0.55, lambda u, v, L: hx('#f8f0dc') if L > 0.6 else hx('#cfc2a0'), kind='super', p=1.0)
    for y in (13, 23, 33):
        for x in (2.0, W - 3.0):
            fill_shape(cv, x + 0.5, y + 0.5, 0.55, 0.9, lambda u, v, L: hx('#f8f0dc') if L > 0.6 else hx('#cfc2a0'), kind='super', p=1.0)
    for (px, py) in ((5.5, 5.5), (41.0, 4.6), (W - 5.5, 5.5), (5.5, H - 5.5), (41.0, H - 4.6), (W - 5.5, H - 5.5)):
        ring(cv, px, py, 2.0, 2.9, lambda dx, dy, d: shade(ramp('#3a2418', 0.45, 0.22, 0.35), light(-dx / d, -dy / d)))
        ring(cv, px, py, 0.0, 2.0, lambda dx, dy, d: hx('#14101a') if (int((dx + 3) * 2) + int((dy + 3) * 2)) % 2 and d > 1.0 else hx('#08060c'))
        ring(cv, px, py, 2.6, 2.95, lambda dx, dy, d: hx('#c8a050') if dx + dy < -1.5 else None)   # the brass plate's edge

    def cue(ly):
        fill_capsule(ly, [(9.0, 39.0), (19.4, 27.6)], 0.55, lambda k, L, s, i, t: hx('#3a6ad8') if t > 0.97 else
                     LINEN if t > 0.94 else (hx('#fff4d8') if s < -0.3 else hx('#e8d4a8')))
        fill_capsule(ly, [(4.0, 41.4), (9.0, 39.0)], 0.8, lambda k, L, s, i, t: hx('#2a1810') if t < 0.3 else
                     (hx('#e8e4dc') if 0.55 < t < 0.6 else hx('#9a4a22') if s < -0.2 else hx('#7a3a1a')))
        fill_shape(ly, 70.0, 2.5, 0.9, 0.9, lambda u, v, L: hx('#5a9ae8') if L > 0.6 else hx('#3a7ad8'), kind='rect', corner=0.2)   # chalk on the rail
        ly.dot(69.5, 2.0, hx('#1a2a4a'))
    layer(cv, cue)
    cv.outline()
    return cv


def p_arcade():
    """Arcade cabinet from above, front at +y: the roof of the purple cabinet with its T-moulding, side art, the lit
    marquee, the CRT in its bezel playing a shooter under its curved glass, the control panel with its art, a ball-top
    stick and four buttons, cigarette burns on the panel, the coin door's two lit slots."""
    W, H = 24, 29
    cv, gl = Cv(W, H), Cv(W, H)
    cab = ramp('#2a1e3e', 0.5, 0.22, 0.35)
    fill_shape(cv, 12.0, 14.5, 11.0, 13.5, lambda u, v, L: shade(cab, L), kind='rect', bevel=1.4, corner=1.0)
    mottle(cv, random.Random(221), 4, 4)
    frect(cv, 1.0, 1.0, 23.0, 1.5, lt(cab[3], 0.15))                   # the T-moulding round the roof

    def side(x, y, c):                                                 # side art: a swoosh fading down the flank
        col = NEON_PINK if x < 12 else NEON_CYAN
        k = 0.15 + 0.35 * (0.5 + 0.5 * math.sin(y * 0.55))
        return dk(col, k) if (x < 12 and x < 2.0) or (x >= 12 and x >= 22.0) else None
    px_paint(cv, 1.0, 2.0, 23.0, 26.0, side)
    frect(cv, 2.0, 2.0, 22.0, 6.0, lambda c: dk(c, 0.1))               # the roof panel, a shade darker, its vents
    for x in range(5, 19, 2):
        frect(cv, x, 3.0, x + 1.0, 4.5, cab[0])
    marquee = [NEON_PINK, SIGNAL_ORANGE, SIGNAL_YELLOW]

    def marq(x, y, c):
        col = lt(marquee[int((x - 3) / 6.0) % 3], 0.25 if y < 7.5 else 0.05)
        if 7.0 <= y < 8.5 and int(x * 2) % 3 == 0 and 5 < x < 19:
            col = HOT                                        # the logo's letters
        return col
    px_paint(cv, 3.0, 6.5, 21.0, 9.0, marq)
    px_paint(gl, 3.0, 6.5, 21.0, 9.0, marq)
    frect(cv, 3.0, 9.0, 21.0, 10.0, hx('#100c18'))                     # bezel shadow
    sprites = {(7.0, 11.0): NEON_CYAN, (9.0, 11.0): NEON_CYAN, (11.0, 11.0): NEON_CYAN, (13.0, 11.0): NEON_CYAN,
               (8.0, 12.5): NEON_PINK, (10.0, 12.5): NEON_PINK, (12.0, 12.5): NEON_PINK, (14.0, 12.5): NEON_PINK,
               (11.5, 14.5): SIGNAL_YELLOW, (15.5, 13.5): hx('#f4f0ff')}

    def screen(x, y, c):
        col = hx('#0c1238') if int(y * 2) % 2 else hx('#121a4a')       # scanlines
        for (sx, sy), sc in sprites.items():
            if sx <= x < sx + 1.0 and sy <= y < sy + 0.5:
                col = sc
        if 10.0 <= x < 13.0 and 16.5 <= y < 17.5:
            col = NEON_GREEN if not (11.0 <= x < 12.0 and y >= 17.0) else hx('#121a4a')   # the player's ship
        if 18.0 <= x < 19.0 and 10.5 <= y < 11.0:
            col = hx('#f4f0ff')                                        # the score
        if x < 4.5:
            col = lt(col, 0.25)                                        # the curved glass catching the room
        return col
    px_paint(cv, 4.0, 10.0, 20.0, 18.5, screen)
    px_paint(gl, 4.0, 10.0, 20.0, 18.5, lambda x, y, c: (40, 70, 170, 150) if cv.get(x, y) in (hx('#0c1238'), hx('#121a4a')) else cv.get(x, y))
    cv.dot(11.5, 15.5, PURE_WHITE)                                  # a shot going up
    gl.dot(11.5, 15.5, PURE_WHITE)
    panel = Cv(W, H)
    fill_shape(panel, 12.0, 22.0, 10.0, 2.8, lambda u, v, L: shade(ramp('#3e3650'), L), kind='rect', bevel=1.0, corner=0.8)
    px_paint(panel, 2.5, 19.5, 21.5, 20.2, lambda x, y, c: NEON_PINK if int(x) % 4 else SIGNAL_YELLOW)   # panel art edge
    fill_shape(panel, 6.0, 22.4, 0.9, 0.9, lambda u, v, L: shade(ramp('#1a1820', 0.4, 0.2, 0.5), L))   # the stick's shaft hole
    fill_shape(panel, 5.7, 22.0, 1.3, 1.3, lambda u, v, L: lt(hx('#ff8080'), 0.3) if L > 0.9 else shade(ramp('#e02a30', 0.45, 0.2, 0.45), L))   # ball top
    for (x, c) in ((11.0, '#05d9e8'), (13.5, '#f9c80e'), (16.0, '#3aff8a'), (18.5, '#ff2a6d')):
        fill_shape(panel, x, 22.6, 0.85, 0.85, lambda u, v, L, c=c: lt(hx(c), 0.35) if L > 0.85 else shade(ramp(c, 0.45, 0.2, 0.3), L))
        fill_shape(gl, x, 22.6, 0.7, 0.7, lambda u, v, L, c=c: hx(c))
    fill_shape(panel, 15.0, 24.2, 0.5, 0.4, lambda u, v, L: hx('#1a1018'))   # a cigarette burn
    panel.outline()
    cv.outline()
    cv.over(panel)
    frect(cv, 7.0, 26.0, 17.0, 28.0, hx('#4a4458'))                   # coin door
    frect(cv, 7.0, 26.0, 17.0, 26.5, hx('#6a6478'))
    for x in (9.0, 14.0):
        frect(cv, x, 26.5, x + 1.0, 27.5, hx('#ff3a2a'))
        frect(cv, x + 0.25, 26.5, x + 0.75, 27.5, hx('#ffb0a0'))
        frect(gl, x, 26.5, x + 1.0, 27.5, hx('#ff3a2a'))
    return cv, gl


def p_crate():
    """Shipping crate lid: frame boards, planks, a batten, nails and faded stencils."""
    S = 21
    cv = Cv(S, S)
    w = ramp('#ad7642', 0.45, 0.22, 0.3)
    rng = random.Random(18)
    wood_fill(cv, 1, 1, S - 2, S - 2, w[2], plank=5, rng=rng)
    mottle(cv, random.Random(231), 7, 5)
    fr = Cv(S, S)
    frame = random.Random(232)
    for (x0, y0, x1, y1, lit) in ((1, 1, S - 2, 2, True), (1, S - 3, S - 2, S - 2, False), (1, 3, 2, S - 4, True),
                                  (S - 3, 3, S - 2, S - 4, False), (3, 10, S - 4, 11, True)):
        wood_fill(fr, x0, y0, x1, y1, w[3] if lit else w[2], plank=2 if y1 - y0 < x1 - x0 else 99, rng=frame,
                  vertical=y1 - y0 > x1 - x0)
        bevel_edges(fr, x0, y0, x1, y1, 0.2, 0.3)
    nails = ((1.5, 1.5), (S - 2.5, 1.5), (1.5, S - 2.5), (S - 2.5, S - 2.5), (3.5, 10.5), (S - 4.5, 10.5),
             (10.5, 1.5), (10.5, S - 2.5))
    for (x, y) in nails:
        stud(fr, x, y, hx('#6a6a76'))
        fr.dot(x + 0.5, y + 1.0, mix(fr.get(x + 0.5, y + 1.0), hx('#7a3a1c'), 0.5))   # a rust tear under it
    cv.over(fr)
    ink = alpha(hx('#1a1218'), 140)
    for ax in (7, 13):                     # "this way up" arrows
        for (dx, dy) in ((0, 0), (-1, 1), (1, 1), (-2, 2), (2, 2), (0, 1), (0, 2), (0, 3), (0, 4)):
            cv.blend(ax + dx, 4 + dy, ink)
    for (y, x0, x1) in ((14, 5, 15), (16, 7, 13)):   # shipping marks: two stencilled words, worn
        for x in range(x0, x1 + 1):
            if (x - x0) % 4 != 3:
                for (ox, oy) in ((0, 0), (0.5, 0), (0, 0.5), (0.5, 0.5)):
                    if frame.random() < 0.8:
                        cv.bpx(int((x + ox) * cv.s), int((y + oy) * cv.s), ink)
    fgrain(cv, random.Random(233), 4)
    cv.outline()
    return cv


def p_barrel():
    """200 L steel drum, red, explosive, from above: the rolled chime, the lid dished a little, its pressed ring, the
    two bungs, a hazard diamond with its flame, a stencilled code, chipped paint, rust and a dent."""
    S = 20
    c = S / 2
    cv = Cv(S, S)
    red = ramp('#c81e28', 0.55, 0.28, 0.35)
    fill_shape(cv, c, c, 9.0, 9.0, lambda u, v, L: shade(red, 0.62 - (u + v) * 0.02))
    ring(cv, c, c, 8.1, 9.05, lambda dx, dy, d: shade(red, light(dx / d * 0.95, dy / d * 0.95)) if d > 8.5 else red[0])
    ring(cv, c, c, 7.5, 8.1, lambda dx, dy, d: shade(red, 0.9 - light(dx / d, dy / d) * 0.75))   # the chime's inner wall
    ring(cv, c, c, 5.3, 5.9, lambda dx, dy, d: shade(red, 0.2 + light(dx / d, dy / d) * 0.8))   # a pressed ring
    for (bx, by, r_) in ((4.6, 8.0, 1.5), (15.0, 13.0, 0.95)):        # the bungs
        ring(cv, bx, by, r_, r_ + 0.5, lambda dx, dy, d: dk(red[1], 0.2) if dx + dy < 0 else lt(red[2], 0.2))
        fill_shape(cv, bx, by, r_, r_, lambda u, v, L: shade(ramp('#9a9aa8', 0.5, 0.25, 0.45), L))
        line(cv, bx - r_ * 0.6, by, bx + r_ * 0.6, by, hx('#4a4a58'))
    for (x, y) in ((10.5, 2.4), (10.5, 17.4)):
        frect(cv, x - 2.5, y - 0.25, x + 2.5, y + 0.25, alpha(hx('#f0e8d8'), 150))   # stencilled code, worn
    cx, cy = 11.0, 9.6

    def diamond(x, y, col):
        d = abs(x - cx) + abs(y - cy)
        if d > 3.9:
            return None
        if d > 3.4:
            return hx('#1a1420')
        if d > 3.0:
            return hx('#f2b80e') if (x - cx) + (y - cy) > 0 or d < 3.2 else hx('#fff0a0')
        return hx('#f2b80e')
    px_paint(cv, cx - 4, cy - 4, cx + 4, cy + 4, diamond)
    for (x, y) in ((11.0, 8.0), (10.5, 8.5), (11.0, 8.5), (11.5, 9.0), (10.5, 9.0), (10.0, 9.5), (11.0, 9.5),
                   (11.5, 9.5), (10.0, 10.0), (10.5, 10.0), (11.0, 10.0), (11.5, 10.0), (10.5, 10.5), (11.0, 10.5),
                   (9.5, 11.0), (10.0, 11.0), (10.5, 11.0), (11.0, 11.0), (11.5, 11.0), (12.0, 11.0)):
        cv.dot(x, y, hx('#1a1420'))                                    # the flame over its bar
    rng = random.Random(241)
    smudge(cv, rng, 5, (2, 2, 18, 18), (0.5, 0.9), 0.75, hx('#9a9aa8'))   # chipped to bare steel
    smudge(cv, rng, 5, (1, 1, 19, 19), (0.8, 1.8), 0.45, hx('#6a3416'))   # rust
    smudge(cv, rng, 1, (13, 4, 16, 7), (1.6, 2.0), 0.22)                # a dent
    fgrain(cv, random.Random(242), 3)
    cv.outline()
    return cv


def p_bookshelf():
    """Bookcase from above: back panel at -y, two dividers, book tops (spine, boards, the page block), one lying
    flat."""
    W, H = 42, 13
    cv = Cv(W, H)
    wood = ramp('#5a3420', 0.45, 0.22, 0.3)
    frect(cv, 1, 1, W - 1, H - 1, dk(wood[1], 0.35))
    wood_fill(cv, 1, 1, W - 2, 2, wood[2], plank=2, rng=random.Random(191))
    frect(cv, 1, 1, W - 1, 1.5, wood[3])
    wood_fill(cv, 1, H - 2, W - 2, H - 2, wood[2], plank=1, rng=random.Random(192))
    rng = random.Random(19)
    cols = ['#9a2228', '#2a4aa8', '#c8a850', '#2c7a52', '#6a1f8a', '#d8d0bc', '#c85a1a', '#1a8a8a', '#3a2a44', '#7a5a3a']
    divs = (1, 2, 14, 27, W - 3, W - 2)
    x = 3.0
    while x < W - 3:
        if int(x) in divs:
            x = int(x) + 1.0
            continue
        if rng.random() < 0.1:
            x += 0.5                           # a gap
            continue
        bw = rng.choice([1.0, 1.5, 1.5, 2.0, 2.5, 3.0])
        nxt = min([d for d in divs if d > x] + [W - 3])
        bw = min(bw, nxt - x)
        depth = rng.choice([6.0, 6.5, 7.0, 7.5, 8.0])
        col = hx(rng.choice(cols))
        lit = rng.uniform(-0.1, 0.2)           # taller books catch more light
        base = lt(col, lit) if lit > 0 else dk(col, -lit)

        def book(px, py, c, x=x, bw=bw, depth=depth, base=base, col=col):
            if px < x + 0.5:
                return lt(base, 0.18) if py < 3.5 + depth - 0.5 else dk(col, 0.35)   # the spine's rounded back
            if px >= x + bw - 0.5 and bw > 1:
                return dk(base, 0.15)          # the far board
            if bw >= 1.5 and py < 3 + depth - 1:
                return mix(base, PARCHMENT, 0.55) if int(py * 2) % 2 else mix(base, hx('#d8ccb0'), 0.5)   # pages
            return base if py < 3 + depth - 0.5 else dk(col, 0.35)
        px_paint(cv, x, 3, x + bw, 3 + depth, book)
        if bw >= 2:
            frect(cv, x + 0.5, 3.5, x + bw - 0.5, 4.0, lt(base, 0.25))   # a gilt band at the head
        x += bw
    for xx in (14, 27):
        frect(cv, xx, 2, xx + 1, H - 1, wood[2])
        frect(cv, xx, 2, xx + 0.5, H - 1, wood[3])
    frect(cv, 1, 2, 3, H - 1, wood[2])
    frect(cv, W - 3, 2, W - 1, H - 1, wood[1])
    flat = Cv(W, H)                         # a book lying across the others
    fill_shape(flat, 33.0, 6.0, 4.4, 3.0, lambda u, v, L: shade(ramp('#8a2a2a', 0.45, 0.2, 0.35), L), ang=0.12,
               kind='rect', bevel=1.0, corner=0.4)
    line(flat, 29.6, 3.4, 37.6, 4.4, hx('#d8b860'))     # its gilt title
    line(flat, 30.0, 8.0, 36.4, 8.8, PARCHMENT)     # the page block's edge
    flat.outline()
    cv.over(flat)
    fgrain(cv, random.Random(193), 3)
    cv.outline()
    return cv


def p_speaker():
    """PA cabinet: black tolex with its weave, steel corner caps, a woofer in its rubber surround with a dented dust
    cap, the horn's slot, screws round the baffle."""
    S = 16
    cv = Cv(S, S)
    fill_shape(cv, 8.0, 8.0, 7.0, 7.0, lambda u, v, L: shade(ramp('#26232e', 0.5, 0.2, 0.32), L), kind='rect', bevel=1.2, corner=1.0)
    px_paint(cv, 1, 1, 15, 15, lambda x, y, c: shift(c, 4) if (int(x * 2) + int(y * 2)) % 3 == 0 else None)   # the tolex's weave
    ring(cv, 8.0, 9.0, 4.4, 5.6, lambda dx, dy, d: shade(ramp('#3e3a4a', 0.45, 0.22, 0.45), light(dx / d * 0.85, dy / d * 0.85)))   # surround
    ring(cv, 8.0, 9.0, 5.6, 6.0, lambda dx, dy, d: hx('#121016'))
    fill_shape(cv, 8.0, 9.0, 4.4, 4.4, lambda u, v, L: shade(ramp('#1e1c24', 0.3, 0.15, 0.55), 1.05 - L))   # the cone
    for a in range(0, 360, 45):
        r_ = math.radians(a)
        line(cv, 8.0 + math.cos(r_) * 1.9, 9.0 + math.sin(r_) * 1.9, 8.0 + math.cos(r_) * 4.2, 9.0 + math.sin(r_) * 4.2,
             hx('#2a2832'))                                            # the cone's ribs
    fill_shape(cv, 8.0, 9.0, 1.7, 1.7, lambda u, v, L: shade(ramp('#5a5868', 0.4, 0.2, 0.45), L))   # dust cap
    cv.dot(8.5, 9.5, hx('#2a2832'))
    frect(cv, 5.0, 2.0, 11.0, 2.8, hx('#3a3646'))                      # the horn
    frect(cv, 5.5, 2.25, 10.5, 2.6, hx('#0e0c12'))
    for (x, y) in ((2.5, 4.0), (13.0, 4.0), (2.5, 14.0), (13.0, 14.0)):
        stud(cv, x, y, hx('#6a6a7a'))
    for (x, y) in ((1, 1), (13, 1), (1, 13), (13, 13)):                # steel corner caps
        fill_shape(cv, x + 1.0, y + 1.0, 1.0, 1.0, lambda u, v, L: shade(ramp('#9a9aaa', 0.5, 0.25, 0.4), L), kind='rect', corner=0.5)
    cv.outline()
    return cv


def p_dj_booth():
    """DJ booth: two direct-drive decks, records with their grooves and labels, strobe dots on the platters' rims, tone
    arms with their headshells, pitch faders; a mixer with its faders, EQ knobs and VU ladders; headphones thrown
    down; the LED chaser over a pink tube along the front (+y)."""
    W, H = 60, 24
    cv = Cv(W, H)
    desk = ramp('#1c1826', 0.4, 0.2, 0.4)
    fill_shape(cv, 30.0, 12.0, 29.0, 11.0, lambda u, v, L: shade(desk, L), kind='rect', bevel=1.4, corner=1.0)
    mottle(cv, random.Random(261), 3, 6)
    plinth = ramp('#7a7a8a', 0.45, 0.22, 0.4)
    for tx, lab in ((10.5, hx('#e8303a')), (49.5, hx('#2a9ad8'))):
        fill_shape(cv, tx, 9.5, 8.0, 6.5, lambda u, v, L: shade(plinth, L), kind='rect', bevel=1.2, corner=1.0)
        px = tx - 1.2
        ring(cv, px, 9.5, 5.4, 5.9, lambda dx, dy, d: hx('#e8ecf4') if int(math.atan2(dy, dx) * 12) % 2 else hx('#6a6e7a'))   # strobe dots
        ring(cv, px, 9.5, 0.0, 5.4, lambda dx, dy, d: hx('#1c1a22') if int(d * 3.2) % 2 else PITCH)   # grooves
        ring(cv, px, 9.5, 2.4, 5.2, lambda dx, dy, d: hx('#3e3c4a') if abs(math.atan2(dy, dx) + 2.3) < 0.18 else None)   # the light on the vinyl
        fill_shape(cv, px, 9.5, 1.6, 1.6, lambda u, v, L, lab=lab: shade(ramp(lab, 0.4, 0.2, 0.3), L))
        cv.dot(px, 9.5, hx('#e8e8f0'))                                 # the spindle
        fill_shape(cv, tx + 5.6, 4.4, 1.1, 1.1, lambda u, v, L: shade(ramp('#9a9aaa'), L))   # tone arm's pivot
        fill_capsule(cv, [(tx + 5.6, 4.4), (tx + 5.2, 10.0), (tx + 3.4, 12.2)], 0.35, lambda k, L, s, i, t: shade(CHROME, L))
        fill_shape(cv, tx + 3.0, 12.6, 0.7, 0.5, lambda u, v, L: hx('#2a2832'), ang=0.6, kind='rect', corner=0.2)   # headshell
        frect(cv, tx + 5.5, 11.5, tx + 6.5, 15.0, hx('#100e16'))       # pitch fader
        frect(cv, tx + 5.0, 13.0, tx + 7.0, 13.5, hx('#e8e8f0'))
    fill_shape(cv, 30.0, 9.5, 9.0, 6.6, lambda u, v, L: shade(ramp('#2e2c38', 0.45, 0.22, 0.4), L), kind='rect', bevel=0.8, corner=0.6)   # mixer
    for i, x in enumerate((23.5, 26.5)):                              # channel faders + EQ knobs
        for y in (4.4, 6.2, 8.0):
            knob(cv, x, y, 0.7, '#1a1820', -1.6 + i * 0.6 + y * 0.2)
        frect(cv, x - 0.25, 9.5, x + 0.25, 14.5, PITCH)
        frect(cv, x - 0.75, 11.0 + i * 1.5, x + 0.75, 11.75 + i * 1.5, hx('#e8e8f0'))
    for k in range(10):                                                # VU ladders
        y = 13.5 - k * 0.9
        col = hx('#3aff6a') if k < 6 else SIGNAL_YELLOW if k < 8 else LED_RED
        for x, lvl in ((31.0, 7), (33.0, 5)):
            frect(cv, x, y, x + 1.0, y + 0.5, col if k < lvl else dk(col, 0.72))
    frect(cv, 23.0, 15.0, 29.0, 15.5, hx('#100e16'))                   # crossfader
    frect(cv, 25.5, 14.7, 26.5, 15.8, hx('#e8e8f0'))
    for y in (5.0, 8.0):
        knob(cv, 36.5, y, 0.7, '#1a1820', 0.4 * y)
    cv.outline()

    def phones(ly):
        fill_capsule(ly, [(14.5, 17.0), (17.0, 15.0), (20.5, 16.2)], 0.55, lambda k, L, s, i, t: shade(ramp('#3a3846', 0.45, 0.2, 0.4), L))
        for x in (14.5, 20.5):
            fill_shape(ly, x, 17.2, 1.6, 1.6, lambda u, v, L: shade(ramp('#3a3846', 0.45, 0.2, 0.4), L))
            fill_shape(ly, x, 17.2, 0.8, 0.8, lambda u, v, L: TYRE_BLACK)
        line(ly, 20.5, 18.6, 23.0, 19.4, TYRE_BLACK)
    layer(cv, phones)
    leds = ['#ff2a6d', '#05d9e8', '#f9c80e']

    def fascia(x, y, c):                                               # the LED chaser over a pink tube
        if y < 19.5:
            return hx(leds[int(x / 4) % 3]) if int(x * 2) % 8 in (2, 3) else hx('#2a2236')
        if y < 20.5:
            return hx('#ffc0d8') if y < 20.0 else hx('#ff5a8d')
        return hx('#c8205a')
    px_paint(cv, 2.0, 19.0, W - 2.0, 21.5, fascia)
    return cv


def p_dj_booth_lit():
    """The DJ booth (painted fine, its ink and grain on) and its emissive map: its own neon pixels."""
    cv = fine(p_dj_booth, 'dj_booth')
    return cv, glow_from(cv, lambda x, y, c: is_neon(c))


def p_bar_counter():
    """One metre of bar (levels chain them along x, so it tiles seamlessly): bartender lip at -y, polished
    mahogany top, padded armrest and brass foot rail on the customer side (+y). The glasses standing on it are
    set out by the game (DESTRUCTION rack), so that no two metres are alike."""
    W, H = 32, 21
    cv = Cv(W, H)
    wood = ramp('#4a2418', 0.45, 0.2, 0.32)
    rng = random.Random(20)
    nz = VNoise(W, H * 4, 8, rng)                   # wraps on 32 px: seamless
    nf = VNoise(W, H * 8, 4, rng)
    pores = dict((r, rng.uniform(0, 5)) for r in rng.sample(range(6, 27), 7))

    def top(x, y, c):
        if y < 1.5:
            return lt(wood[3], 0.12) if y < 1.0 else wood[3]           # the rounded lip, catching the light
        if y < 2.5:
            return wood[0] if y < 2.0 else dk(wood[1], 0.1)
        g = (nz(x, y * 4) - 0.5) * 30 + (nf(x, y * 8) - 0.5) * 12      # long streaks of grain along the counter
        c = shift(wood[2], int(g))
        if pores.get(int(y * 2)) and (x * 0.37 + pores[int(y * 2)]) % 5.0 < 3.2:
            c = dk(c, 0.16)                                            # a dark vein of the grain
        k = 0.05 + 0.08 * math.sin(x * math.pi / 16) ** 2 * max(0.0, 1.0 - abs(y - 6.6) / 2.0)
        c = lt(c, k)                                                   # the lamps' sheen in the varnish
        if 5.5 <= y < 6.0 and int(x * 2) % 32 not in (0, 1, 17, 30):
            c = lt(c, 0.07)                                            # a harder line of reflection
        if y >= 13.5:
            c = dk(c, 0.18 if y < 14.0 else 0.3)                       # the front edge rolling over
        return c
    px_paint(cv, 0, 0.5, W, 14.5, top)
    frect(cv, 0, 0, W, 0.5, OUTLINE)
    for (gx, gy, r) in ((9.3, 9.2, 1.9), (24.6, 4.4, 1.7)):         # old glass rings in the varnish
        ring(cv, gx, gy, r - 0.3, r + 0.25, lambda dx, dy, d, gx=gx, gy=gy: dk(cv.get(gx + dx, gy + dy), 0.12) if dx + dy > -1.6 else None)
    for (sx, sy, ln, a) in ((4.5, 11.2, 3.0, 0.15), (19.0, 3.4, 2.2, -0.2), (27.5, 12.0, 1.6, 0.3)):   # scratches
        line(cv, sx, sy, sx + math.cos(a) * ln, sy + math.sin(a) * ln, lt(wood[2], 0.2))
    pad = ramp('#5e1a22', 0.5, 0.26, 0.3)

    def arm(x, y, c):
        t = (y - 14.5) / 3.5                                           # across the padded armrest
        col = shade(pad, 0.95 - t * 0.85)
        u = x % 16.0
        if u < 0.5 or u > 15.5:
            col = dk(pad[0], 0.25)                                     # tuck seam every half metre
        elif u < 1.5 or u > 14.5:
            col = dk(col, 0.12 * (1.5 - min(u, 16 - u)))               # the vinyl pulled into it
        return col
    px_paint(cv, 0, 14.5, W, 18.0, arm)
    dash(cv, 0, 15.25, W, 15.25, lambda c: lt(c, 0.12), 2, 1)          # piping stitches
    for (cx, cy) in ((6.0, 16.6), (21.0, 16.2), (28.5, 16.9)):        # creases where elbows lean
        crease(cv, [(cx - 1.4, cy - 0.3), (cx, cy), (cx + 1.6, cy - 0.2)], 0.12)
    frect(cv, 0, 18.0, W, 18.5, OUTLINE)

    brass = ramp('#b88a3a', 0.5, 0.26, 0.4)

    def rail(x, y, c):
        t = y - 18.5
        col = brass[3] if t < 0.5 else brass[2] if t < 1.0 else brass[1] if t < 1.5 else brass[0]
        if t < 0.5 and int(x * 2) % 9:
            col = lt(col, 0.3)                                         # the bright line along the tube
        return mix(col, hx('#5a4a2a'), max(0.0, nz(x * 2, 3) - 0.55) * 1.2)   # tarnish where hands never go
    px_paint(cv, 0, 18.5, W, 20.5, rail)
    frect(cv, 0, 20.5, W, 21, OUTLINE)
    for bx in (7.0, 23.0):                                             # rail brackets bolted to the front
        frect(cv, bx, 18.0, bx + 2.0, 20.5, brass[1])
        frect(cv, bx, 18.0, bx + 2.0, 18.5, brass[0])
        frect(cv, bx, 18.5, bx + 0.5, 20.5, brass[2])
        stud(cv, bx + 1.0, 19.0, brass[2])
    return cv


def p_dumpster():
    """Green steel dumpster from above, front along +y: its rolled rim with the side ribs, two black plastic lids with
    moulded ribs, hinge knuckles and a grip (the right one pushed back over bin bags and a box), the fork pockets, the
    casters peeking out at the corners, a stencilled name, rust and grime."""
    W, H = 60, 36
    cv = Cv(W, H)
    g = ramp('#2c6a3c', 0.5, 0.26, 0.3)
    rng = random.Random(21)
    for (x, y) in ((4.0, 34.4), (56.0, 34.4), (4.0, 1.6), (56.0, 1.6)):   # the casters
        fill_shape(cv, x, y, 2.2, 1.4, lambda u, v, L: shade(RUBBER, L), kind='rect', corner=0.6)
    fill_shape(cv, 30.0, 18.0, 29.0, 16.6, lambda u, v, L: shade(g, L), kind='rect', bevel=1.6, corner=1.2)
    for x in range(8, 54, 6):                                          # the ribs pressed into the sides, seen over the rim
        for (y0, y1) in ((1.4, 2.4), (33.6, 34.6)):
            frect(cv, x, y0, x + 1.0, y1, lambda cc: lt(cc, 0.16))
            frect(cv, x + 1.0, y0, x + 1.5, y1, lambda cc: dk(cc, 0.25))
    for (x0, x1) in ((1, 2.5), (57.5, 59)):                            # fork pockets
        for y in (9, 23):
            frect(cv, x0, y, x1, y + 4, g[0])
            frect(cv, x0, y, x1, y + 0.5, lt(g[1], 0.1))
    rng2 = random.Random(22)
    mottle(cv, rng2, 5, 5)
    smudge(cv, rng2, 12, (1, 1, 58, 34), (0.6, 2.2), 0.55, hx('#7a3e1a'))   # rust
    smudge(cv, rng2, 8, (1, 1, 58, 34), (1.5, 3.5), 0.16)                  # grime
    lid = ramp('#262a2c', 0.4, 0.18, 0.28)
    frect(cv, 31, 22, 57, 31.5, PITCH)                         # the dark of the open half

    def lids(ly):
        for (x0, x1, y0, y1) in ((3.5, 29.5, 3.5, 31.5), (30.5, 56.5, 3.5, 21.0)):
            fill_shape(ly, (x0 + x1) / 2, (y0 + y1) / 2, (x1 - x0) / 2, (y1 - y0) / 2,
                       lambda u, v, L: shade(lid, L), kind='rect', bevel=1.2, corner=1.0)
            for y in [y0 + 6.5 + k * 7 for k in range(4) if y0 + 6.5 + k * 7 < y1 - 3]:   # moulded ribs
                frect(ly, x0 + 1.5, y, x1 - 1.5, y + 0.5, lt(lid[2], 0.18))
                frect(ly, x0 + 1.5, y + 0.5, x1 - 1.5, y + 1.5, shift(lid[2], 6))
                frect(ly, x0 + 1.5, y + 1.5, x1 - 1.5, y + 2.0, lid[0])
            for x in (x0 + 4, x1 - 6):                                 # hinge knuckles at the back
                frect(ly, x, y0 - 0.5, x + 2.0, y0 + 1.0, hx('#5a5e66'))
                frect(ly, x, y0 - 0.5, x + 2.0, y0, STEEL_GREY)
            gx = (x0 + x1) / 2
            frect(ly, gx - 3.0, y1 - 2.0, gx + 3.0, y1 - 0.8, lid[0])  # the grip moulded in its front
            frect(ly, gx - 3.0, y1 - 0.8, gx + 3.0, y1 - 0.4, lt(lid[2], 0.12))
            fgrain(ly, rng, 3)
    layer(cv, lids)
    bags = Cv(W, H)
    for _ in range(7):                                                 # bin bags in the open half
        bx, by, r_ = rng.uniform(34, 54), rng.uniform(24, 30), rng.uniform(2.6, 4.0)
        fill_shape(bags, bx, by, r_, r_ * 0.85, lambda u, v, L: shade(ramp('#2a2834', 0.45, 0.2, 0.32), L),
                   ang=rng.uniform(0, 3))
        crease(bags, [(bx - r_ * 0.5, by - r_ * 0.2), (bx, by + r_ * 0.1), (bx + r_ * 0.4, by - r_ * 0.3)], 0.3)
    fill_shape(bags, 49.0, 25.0, 3.4, 2.2, lambda u, v, L: shade(ramp('#a8865a', 0.4, 0.2, 0.3), L), ang=0.4,
               kind='rect', corner=0.4)                                # a flattened cardboard box
    fill_shape(bags, 38.5, 28.5, 1.0, 1.0, lambda u, v, L: shade(ramp('#3a8a3a', 0.45, 0.22, 0.4), L))   # a bottle
    px_paint(bags, 0, 0, W, H, lambda x, y, cc: CLEAR if not (31 <= x < 57 and 22.5 <= y < 31.5) else None)
    bags.outline(PITCH)
    cv.over(bags)
    frect(cv, 31, 21.0, 57, 22.5, PITCH)                       # the shadow the raised lid casts in
    smudge(cv, rng2, 6, (4, 4, 56, 30), (1.5, 3.0), 0.1)               # grime on the lids
    for _ in range(9):                                                 # and what the pigeons left
        x, y = rng2.uniform(5, 55), rng2.uniform(5, 20)
        cv.dot(x, y, PUTTY)
        cv.dot(x + 0.5, y, hx('#a8a498'))
    for x in range(8, 26):                                             # a stencilled name on the rim, worn
        if x % 4 != 3 and rng2.random() < 0.8:
            frect(cv, x, 32.8, x + 1, 33.6, lambda cc: mix(cc, hx('#e8e4d8'), 0.45))
    cv.outline()
    return cv


def p_bin_lid():
    """A trash can's lid fallen off, lying upside down and tipped on its handle, from above: the dished underside in
    shade with its pressed rings, the rolled rim lit along its top edge, oval because it lies askew, grime inside."""
    W, H = 16, 12
    cv = Cv(W, H)
    m = ramp('#7a808c', 0.5, 0.25, 0.35)
    cx, cy = W / 2, H / 2
    fill_shape(cv, cx, cy, 7.2, 5.2, lambda u, v, L: shade(m, 0.25 + 0.35 * L))              # the dish, in shade
    fill_shape(cv, cx, cy, 5.4, 3.8, lambda u, v, L: shade(m, 0.12 + 0.3 * (1 - L)))         # deeper in the middle
    fill_shape(cv, cx, cy, 3.0, 2.0, lambda u, v, L: shade(m, 0.3 + 0.2 * L))                # a pressed ring
    fill_shape(cv, cx, cy, 2.2, 1.4, lambda u, v, L: shade(m, 0.15))
    for x in range(2, W - 2):                                                                  # the rim lit on top
        y = cy - 5.2 * math.sqrt(max(0.0, 1 - ((x + 0.5 - cx) / 7.2) ** 2))
        cv.dot(x + 0.5, y + 0.4, lt(m[3], 0.12))
    rng = random.Random(291)
    smudge(cv, rng, 3, (3, 3, 13, 9), (0.8, 1.6), 0.35, hx('#3a3228'))                         # grime
    smudge(cv, rng, 3, (2, 2, 14, 10), (0.4, 0.8), 0.5, hx('#7a3a1c'))                         # rust
    cv.outline()
    return cv


def p_trash_can_down():
    """The galvanised can knocked over, from above, its lid gone (the lid is the standing can's sprite, rolled off):
    the corrugated body lying along x with its pressed bands, the base at -x, the open mouth at +x black inside with
    the night's rubbish spilling out of it (a split bag, papers, a can), a fresh dent where it was hit."""
    W, H = 26, 17
    cv = Cv(W, H)
    m = ramp('#7a808c', 0.5, 0.25, 0.35)
    cy = H / 2

    def body(x, y, c):
        v = (y - cy) / 7.2                                            # across the cylinder: lit on its top side
        if abs(v) > 1:
            return None
        L = 0.95 - (v + 1) * 0.42
        if int(x) in (5, 6, 11, 12, 17):
            L += 0.12 if int(x) % 2 else -0.14                         # the pressed bands
        return shade(m, L)
    px_paint(cv, 1.5, cy - 7.2, 20.5, cy + 7.2, body)
    fill_shape(cv, 1.8, cy, 1.2, 7.0, lambda u, v, L: shade(m, 0.3 + 0.4 * L))   # the base's rim
    fill_shape(cv, 20.5, cy, 2.2, 7.2, lambda u, v, L: lt(m[3], 0.1) if u > 0.4 else m[2])   # the mouth's rim
    fill_shape(cv, 20.6, cy, 1.4, 6.2, lambda u, v, L: hx('#141216'))  # inside
    rng = random.Random(281)
    mottle(cv, rng, 8, 4)
    smudge(cv, rng, 2, (7, 3, 13, 9), (1.8, 2.6), 0.32)               # the dent
    smudge(cv, rng, 4, (2, 2, 20, 15), (0.4, 0.9), 0.6, hx('#7a3a1c'))   # rust
    cv.outline()

    def spill(ly):                                                     # what came out of it
        fill_shape(ly, 23.0, cy + 1.5, 2.6, 2.4, lambda u, v, L: shade(ramp('#26282c', 0.45, 0.25, 0.45), L))   # a split bag
        frect(ly, 21.5, cy - 4.5, 24.5, cy - 2.0, hx('#d8d2c0'))     # papers
        frect(ly, 22.0, cy - 4.0, 24.0, cy - 3.5, hx('#9a948a'))
        fill_shape(ly, 24.6, cy + 4.6, 1.0, 0.8, lambda u, v, L: hx('#b8262c') if L > 0.4 else hx('#7a1420'))   # a can
    layer(cv, spill, hx('#0c0a0c'))
    return cv


def p_trash_can():
    """Galvanised can lid: pressed concentric ribs, a handle bar on its clips, a dent, rust at the rim and grime."""
    S = 17
    c = S / 2
    cv = Cv(S, S)
    m = ramp('#7a808c', 0.5, 0.25, 0.35)
    fill_shape(cv, c, c, 7.5, 7.5, lambda u, v, L: shade(m, L))
    ring(cv, c, c, 6.9, 7.5, lambda dx, dy, d: lt(m[3], 0.15) if light(dx / d, dy / d) > 0.75 else m[1] if light(dx / d, dy / d) < 0.4 else None)
    for (r0, r1) in ((5.0, 5.8), (2.8, 3.5)):
        ring(cv, c, c, r0, r1, lambda dx, dy, d: m[1] if light(dx / d, dy / d) < 0.55 else m[3])
        ring(cv, c, c, r1, r1 + 0.5, lambda dx, dy, d: dk(m[2], 0.2) if light(dx / d, dy / d) > 0.55 else None)
    rng = random.Random(271)
    mottle(cv, rng, 8, 4)

    def spangle(x, y, cur):                                            # the galvanising's crystals
        if cur[3] == 0 or cur == OUTLINE:
            return None
        k = math.sin(x * 2.1 + math.sin(y * 1.3) * 2.0) * math.sin(y * 1.7 - x * 0.6)
        return shift(cur, int(k * 7))
    px_paint(cv, 0, 0, S, S, spangle)
    smudge(cv, rng, 2, (4, 9, 12, 13), (1.6, 2.4), 0.25)    # dent
    smudge(cv, rng, 3, (2, 2, 15, 15), (1.0, 2.0), 0.3, hx('#5a4a36'))
    smudge(cv, rng, 5, (1, 1, 16, 16), (0.4, 0.9), 0.6, hx('#7a3a1c'))   # rust spots
    fgrain(cv, random.Random(272), 4)
    cv.outline()

    def handle(ly):
        for hxp in (5.0, 12.0):
            fill_shape(ly, hxp, 8.5, 0.9, 1.3, lambda u, v, L: shade(ramp('#6a707c', 0.5, 0.25, 0.35), L), kind='rect', corner=0.4)
        fill_capsule(ly, [(5.6, 8.5), (11.4, 8.5)], 0.9, lambda k, L, s, i, t: lt(hx('#e8ecf4'), 0.1) if L > 0.9 else shade(ramp('#9aa0ac', 0.5, 0.25, 0.4), L))
    layer(cv, handle, dk(m[0], 0.3))
    return cv


GROUP = 'props'
SPRITES = {
    'table': (p_table, (46, 28), 'fine req', (44, 26)),
    'table_round': (p_table_round, (30, 30), 'fine req', (28, 28)),
    'card_table': (p_card_table, (60, 38), 'fine', (58, 36)),
    'dope_table': (p_dope_table, (46, 28), 'fine', (44, 26)),
    'gas_bottle': (p_gas_bottle, (14, 14), 'fine', (12, 12)),
    'dance_stage': (p_dance_stage, (50, 50), 'fine', (48, 48)),
    'desk': (p_desk, (48, 26), 'fine req', (46, 24)),
    'chair': (p_chair, (16, 16), 'fine req', (14, 14)),
    'armchair': (p_armchair, (28, 28), 'fine req', (26, 26)),
    'sofa': (p_sofa, (66, 30), 'fine req', (64, 28)),
    'plant': (p_plant, (24, 24), 'fine req', (15, 15)),
    'tv': (p_tv, (24, 17), 'fine glow req', (22, 15)),
    'fridge': (p_fridge, (24, 24), 'fine req', (22, 22)),
    'oven': (p_oven, (22, 22), 'fine req', (20, 20)),
    'sink': (p_sink, (28, 20), 'fine req', (26, 18)),
    'toilet': (p_toilet, (15, 23), 'fine req', (13, 21)),
    'bed': (p_bed, (46, 66), 'fine floor req stock', (44, 64)),
    'pool_table': (p_pool_table, (82, 46), 'fine req', (80, 44)),
    'arcade': (p_arcade, (24, 29), 'fine glow req', (22, 27)),
    'crate': (p_crate, (21, 21), 'fine req', (19, 19)),
    'barrel': (p_barrel, (20, 20), 'fine req', (18, 18)),
    'bookshelf': (p_bookshelf, (42, 13), 'fine req', (40, 11)),
    'speaker': (p_speaker, (16, 16), 'fine req', (14, 14)),
    'dj_booth': (p_dj_booth_lit, (60, 24), 'dense glow req stock', (58, 22)),
    'bar_counter': (p_bar_counter, (32, 21), 'fine req', (32, 19)),
    'dumpster': (p_dumpster, (60, 36), 'fine req', (58, 34)),
    'trash_can': (p_trash_can, (17, 17), 'fine req', (15, 15)),
    'trash_can_down': (p_trash_can_down, (26, 17), 'fine'),
    'bin_lid': (p_bin_lid, (16, 12), 'fine'),
}
