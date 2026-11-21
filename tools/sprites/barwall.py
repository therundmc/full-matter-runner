"""What hangs on a bar's walls (props, the wall at -y, the room along +y): pictures, posters, a dartboard, the
pay phone, the coat hooks, the beer neons (at the world's density), the VIP room's mirror and its low table."""
import math
import random

from .core import (
    Cv, dk, fill_capsule, fill_shape, frect, hx, line, lt, mix, px_paint, ramp, ring, shade, smudge, stud, VNoise
)
from .palette import BRASS, GRAPHITE, NEON_AMBER, NEON_CYAN, NEON_PINK, PAPER_WHITE, STEEL, STEEL_L
from .type import neon_text
from .neon import Neon, sign_backing


def wall_frame(W, frame, face, seed):
    """Something framed on a wall, seen from above (the wall at -y): the top of its frame along the wall, and below it,
    leaning out a little, a sliver of what it shows (face(cv, x0, x1, y0, y1)) under glass that catches the light."""
    cv = Cv(W, 5)
    fr = ramp(frame, 0.5, 0.25, 0.4)
    fill_shape(cv, W / 2, 1.5, W / 2 - 1, 0.6, lambda u, v, L: shade(fr, L), kind='rect', corner=0.2, bevel=0.3)
    frect(cv, 1.0, 2.0, W - 1.0, 4.0, fr[1])
    face(cv, 1.6, W - 1.6, 2.2, 3.8)
    for i in range(3):                                                 # the glass's glint
        cv.dot(2.5 + i * 0.5, 2.25 + i * 0.5, hx('#ffffff', 150))
    smudge(cv, random.Random(seed), 2, (1, 1, W - 1, 4), (0.8, 1.4), 0.15)
    cv.outline()
    return cv


def p_frame_photo():
    """An old signed photo in a black frame: two men shaking hands, in greys."""
    def face(cv, x0, x1, y0, y1):
        frect(cv, x0, y0, x1, y1, hx('#a8a49c'))
        frect(cv, x0, y0 + 1.0, x1, y1, hx('#8a867e'))
        for x in (x0 + 2.0, x1 - 3.0):
            frect(cv, x, y0 + 0.2, x + 1.0, y1, hx('#3a3836'))
        cv.dot(x1 - 1.0, y1 - 0.5, hx('#2a2a40'))
    return wall_frame(12, '#2a2628', face, 7120)


def p_frame_gold():
    """A gilt frame: a dark old painting in it, a red sky."""
    def face(cv, x0, x1, y0, y1):
        frect(cv, x0, y0, x1, y1, hx('#7a2a22'))
        frect(cv, x0, y0 + 0.8, x1, y1, hx('#3a2a3a'))
        frect(cv, x0 + 3.0, y0 + 0.5, x0 + 5.0, y1, hx('#1e1a22'))
    return wall_frame(14, '#c8a040', face, 7121)


def p_poster_fight():
    """A boxing bill behind a thin frame: cream paper, the red band of the date, two fighters squared up."""
    def face(cv, x0, x1, y0, y1):
        frect(cv, x0, y0, x1, y1, hx('#e2d6b4'))
        frect(cv, x0, y0, x1, y0 + 0.6, hx('#b8282e'))
        for x in (x0 + 3.0, x1 - 4.0):
            frect(cv, x, y0 + 0.7, x + 1.0, y1, hx('#2a2228'))
        frect(cv, x0 + 6.0, y0 + 1.0, x1 - 6.0, y0 + 1.5, hx('#2a2228'))
    return wall_frame(16, '#4a4448', face, 7122)


def p_poster_band():
    """A gig poster: black paper, a pink and a cyan stroke of a band's name."""
    def face(cv, x0, x1, y0, y1):
        frect(cv, x0, y0, x1, y1, hx('#1e1a26'))
        frect(cv, x0 + 1.0, y0 + 0.3, x1 - 2.0, y0 + 0.8, hx('#e83a8a'))
        frect(cv, x0 + 2.0, y0 + 1.2, x1 - 1.0, y0 + 1.6, hx('#3ad8e8'))
    return wall_frame(14, '#2a2a30', face, 7123)


def p_conduit():
    """A run of electrical conduit along a back-of-house wall (the wall at -y): a thin galvanised tube, two saddles
    screwed into the wall, a junction box with its cover plate, a little rust at the joints."""
    W = 48
    cv = Cv(W, 5)
    zinc = ramp('#868a94', 0.5, 0.25, 0.35)
    px_paint(cv, 1, 1.5, W - 1, 3.0, lambda x, y, c: zinc[3] if y < 2.0 else zinc[2] if y < 2.5 else zinc[0])
    for x in (7.0, 39.0):                                              # saddles
        frect(cv, x, 1.0, x + 1.5, 3.5, zinc[1])
        cv.dot(x + 0.25, 1.25, lt(zinc[3], 0.2))
    frect(cv, 20.0, 1.0, 26.0, 4.0, zinc[1])                           # the junction box, its cover lit along the top
    frect(cv, 20.0, 1.0, 26.0, 1.5, zinc[3])
    frect(cv, 20.5, 1.5, 25.5, 3.5, zinc[2])
    for x in (21.0, 25.0):
        stud(cv, x, 2.5, zinc[1])
    smudge(cv, random.Random(7131), 4, (1, 1, W - 1, 4), (0.5, 1.2), 0.4, hx('#7a4a26'))
    cv.outline()
    return cv


def p_flyers():
    """Bills pasted on a street wall, one over the other, seen from above (the wall at -y): slivers of faded paper, their
    lower edges torn ragged, a bare patch where one came off, a corner peeling away. No frame, no glass."""
    W = 26
    cv = Cv(W, 5)
    rng = random.Random(7132)
    # (x0, x1, paper, band colour or None, how far down it still hangs)
    bills = ((1.5, 7.0, '#cfc5a8', '#9a3a34', 3.4), (6.0, 11.5, '#b98a98', '#2a2630', 3.0),
             (13.0, 19.0, '#93a8b4', '#c8b25a', 3.6), (18.5, 24.5, '#c4b684', None, 3.2))
    for (x0, x1, paper, band, low) in bills:
        col, edge = hx(paper), {}

        def f(x, y, c, x0=x0, col=col, band=band, low=low, edge=edge):
            k = int(x * cv.s)
            if k not in edge:
                edge[k] = low - rng.choice((0.0, 0.0, 0.5, 0.5, 1.0))  # torn: never a straight edge
            if y >= edge[k]:
                return None
            if band and 1.5 <= y < 2.0 and x - x0 > 0.5:
                return hx(band)
            return dk(col, 0.25) if y < 1.5 else col if y < edge[k] - 0.5 else lt(col, 0.18)
        px_paint(cv, x0, 1.0, x1, 4.0, f)
    cv.dot(12.0, 1.5, hx('#b8b0a0'))                                   # what is left of the one that came off
    cv.dot(12.5, 1.0, hx('#a8a090'))
    for k in range(3):                                                 # a corner curling off the wall, lit
        frect(cv, 23.0 + k * 0.5, 3.0 + k * 0.5, 24.5, 3.5 + k * 0.5, hx('#e6dcb8'))
    smudge(cv, rng, 3, (1, 1, W - 1, 4), (0.8, 1.6), 0.18)
    cv.outline(hx('#1a1620', 170))
    return cv


def p_tag():
    """A tag sprayed on the ground of an alley, from above: three quick strokes of a name nobody reads and a line under
    it, the paint gone thin where feet and rain have been, a little overspray. No outline: it is in the concrete."""
    W, H = 30, 18
    cv = Cv(W, H)
    rng = random.Random(7133)
    nz = VNoise(W, H, 6, rng)
    strokes = (((3.0, 12.0), (6.0, 4.0), (9.0, 11.0), (12.0, 5.0), (14.0, 10.5)),
               ((16.5, 5.5), (20.0, 4.0), (21.5, 7.5), (17.5, 9.5), (16.5, 12.5), (21.0, 13.0), (25.0, 10.5)),
               ((4.0, 15.2), (14.0, 14.4), (26.0, 15.4), (24.2, 13.6)))
    paint = hx('#b0487a')

    def dist(x, y):
        best = 99.0
        for pts in strokes:
            for (ax, ay), (bx, by) in zip(pts, pts[1:]):
                dx, dy = bx - ax, by - ay
                t = max(0.0, min(1.0, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy)))
                best = min(best, math.hypot(x - ax - dx * t, y - ay - dy * t))
        for (ax, ay) in ((27.2, 5.0), (27.8, 7.6)):                    # two dots after it
            best = min(best, math.hypot(x - ax, y - ay) + 0.15)
        return best

    def f(x, y, c):
        d, worn = dist(x, y), nz(x, y)
        if d < 0.7:
            return None if worn < 0.34 else paint[:3] + (70 if worn < 0.5 else 118,)
        if d < 1.3 and rng.random() < 0.3 and worn > 0.4:
            return paint[:3] + (40,)                                   # overspray
        return None
    px_paint(cv, 0, 0, W, H, f)
    return cv


def p_dartboard():
    """A dartboard on the wall, seen from above: the black ring of its rim, the board's top half leaning out at us,
    the sectors black and cream, the red and green rings, two darts in it, their flights toward us."""
    cv = Cv(11, 5)
    cx, cy = 5.5, 1.2

    def board(u, v, L):
        if v < -0.05:
            return None
        d = math.hypot(u / 4.5, v / 3.2)
        if d > 0.86:
            return shade(ramp('#2a2428', 0.5, 0.25, 0.4), L)
        a = int((math.atan2(v, u) + math.pi) / (math.pi / 10))
        if 0.62 < d < 0.72 or d < 0.12:
            return hx('#c8282e') if a % 2 else hx('#2a8a4a')
        return hx('#e6dcc0') if a % 2 else hx('#1e1a1c')
    fill_shape(cv, cx, cy, 4.5, 3.2, board)
    for (x, y, col) in ((4.2, 2.2, '#3a6ad8'), (6.8, 1.8, '#e8c040')):
        line(cv, x, y, x + 0.5, y + 1.6, hx('#c8ccd4'))
        cv.dot(x + 0.5, y + 1.8, hx(col))
    cv.outline()
    return cv


def p_pay_phone():
    """A coin phone on the wall: its steel box with the keypad and the coin slot, the armoured cord (the receiver on
    its hook is drawn live, render/PropLife.js `handset`)."""
    cv = Cv(10, 7)
    steel = ramp('#7a808c', 0.5, 0.25, 0.4)
    fill_shape(cv, 5.0, 2.7, 4.0, 2.2, lambda u, v, L: shade(steel, L), kind='rect', corner=0.5, bevel=0.7)
    frect(cv, 1.0, 0.6, 9.0, 1.2, hx('#c8282e'))                       # the red band of its top
    for k in range(9):
        cv.dot(5.5 + (k % 3) * 0.9, 2.0 + (k // 3) * 0.8, hx('#d8dce4'))
    frect(cv, 8.3, 2.0, 8.7, 3.2, GRAPHITE)                       # the coin slot
    fill_capsule(cv, [(3.5, 4.4), (3.0, 5.6), (3.8, 6.2)], 0.35, lambda k, L, s, i, t: shade(STEEL, L))
    cv.outline()
    return cv


def p_coat_hooks():
    """A brass rail of hooks by the door: a leather jacket and a grey raincoat hung on it, a hat on the last hook."""
    cv = Cv(18, 7)
    frect(cv, 1.0, 0.7, 17.0, 1.4, hx('#8a6a30'))
    for x in (3.0, 7.5, 12.0, 15.5):
        stud(cv, x, 1.0, BRASS[2], big=True)

    def coat(x, base, seed):
        r = ramp(base, 0.5, 0.25, 0.3)
        fill_shape(cv, x, 3.3, 2.8, 2.4, lambda u, v, L: shade(r, L) if v > -1.6 else None, kind='super', p=2.6)
        line(cv, x, 1.6, x, 5.4, dk(r[1], 0.2))                         # its fold down the middle
        smudge(cv, random.Random(seed), 2, (int(x - 2), 2, int(x + 2), 5), (0.8, 1.4), 0.2)
    coat(4.0, '#3a2a22', 7124)
    coat(9.0, '#6a6a62', 7125)
    fill_shape(cv, 15.2, 3.0, 1.9, 1.7, lambda u, v, L: shade(ramp('#2a2a34', 0.5, 0.25, 0.4), L))   # the hat
    ring(cv, 15.2, 3.0, 1.0, 1.3, lambda dx, dy, d: hx('#5a2a2a'))
    cv.outline()
    return cv


def p_towel_dispenser():
    """A paper towel dispenser: a white plastic box on the wall, a towel hanging out of its slot."""
    cv = Cv(9, 5)
    fill_shape(cv, 4.5, 2.0, 3.6, 1.4, lambda u, v, L: shade(ramp('#e8eaee', 0.35, 0.18, 0.2), L), kind='rect', corner=0.5, bevel=0.6)
    frect(cv, 3.0, 3.2, 6.0, 4.2, hx('#e8e2d2'))
    frect(cv, 3.0, 3.2, 6.0, 3.5, hx('#c8c0b0'))
    cv.outline()
    return cv


def p_neon_sign_beer():
    """A small beer neon: an amber mug with its white head, BEER in red."""
    cv, gl = sign_backing(36, 14), Cv(36, 14)
    ne = Neon(36, 14)
    ne.line([(3, 4), (3, 11), (8, 11), (8, 4)], NEON_AMBER)
    ne.line([(9, 6), (10, 6), (10, 9), (9, 9)], NEON_AMBER)
    ne.line([(3, 3), (8, 3)], PAPER_WHITE)
    neon_text(ne, 12, 3, 'BEER', hx('#ff3a30'))
    ne.render(cv, gl)
    return cv, gl


def p_neon_sign_bay():
    """BAY, the town's lager, in pink over a cyan wave: the neon behind the bar."""
    cv, gl = sign_backing(26, 14), Cv(26, 14)
    ne = Neon(26, 14)
    neon_text(ne, 4, 2, 'BAY', NEON_PINK)
    pts = [(4 + k, 11 + (0 if k % 4 in (0, 1) else -1 if k % 4 == 2 else 1)) for k in range(18)]
    for (x, y) in pts:
        ne.dot(x, y, NEON_CYAN)
    ne.render(cv, gl)
    return cv, gl


def p_poster_pinup():
    """A pin-up print in a thin gilt frame: a hot pink ground, a black stockinged leg kicked up across it, a star."""
    def face(cv, x0, x1, y0, y1):
        frect(cv, x0, y0, x1, y1, hx('#d8508a'))
        line(cv, x0 + 2.0, y1 - 0.2, x0 + 6.5, y0 + 0.4, hx('#1a1218'))
        line(cv, x0 + 2.5, y1 - 0.2, x0 + 7.0, y0 + 0.4, hx('#1a1218'))
        cv.dot(x1 - 2.0, y0 + 0.8, hx('#f4d860'))
    return wall_frame(12, '#b08a3a', face, 7140)


def p_poster_revue():
    """A revue's bill: black paper, a gold band of lettering, a red feather fan, behind a thin black frame."""
    def face(cv, x0, x1, y0, y1):
        frect(cv, x0, y0, x1, y1, hx('#1e1a26'))
        frect(cv, x0 + 1.0, y0 + 0.3, x1 - 1.0, y0 + 0.8, hx('#d8b048'))
        for k in range(4):
            line(cv, x0 + 6.0, y1, x0 + 4.5 + k, y0 + 1.2, hx('#c8283a'))
    return wall_frame(14, '#2a2430', face, 7141)


def p_mirror_strip():
    """A long strip of mirror on the wall behind the stage, seen from above: its chrome edge along the wall, the glass
    leaning out a touch below it, the room's pink and a few glints caught in it."""
    W = 44
    cv = Cv(W, 4)
    rng = random.Random(7142)
    fill_shape(cv, W / 2, 1.0, W / 2 - 0.6, 0.55, lambda u, v, L: shade(STEEL_L, L), kind='rect', corner=0.2, bevel=0.3)
    nz = VNoise(W, 4, 9, rng)
    px_paint(cv, 1.0, 1.6, W - 1.0, 3.4, lambda x, y, c: mix(hx('#3a3048'), hx('#8a3a68'), 0.1 + 0.6 * nz(x, y)))
    for _ in range(3):
        x = rng.uniform(3, W - 5)
        line(cv, x, 3.3, x + 1.0, 1.7, hx('#d8c8e8'))
    cv.outline()
    return cv


def p_neon_sign_lips():
    """Red neon lips (no words), the tube's bow of the upper lip and the full lower lip, on a dark plate."""
    cv, gl = sign_backing(24, 12), Cv(24, 12)
    ne = Neon(24, 12)
    red = hx('#ff2a4a')
    ne.line([(3, 6), (5, 4), (7, 3), (9, 2), (10, 2), (11, 3), (12, 3), (13, 2), (14, 2), (16, 3), (18, 4), (20, 6)], red)
    ne.line([(3, 6), (20, 6)], red)
    ne.line([(3, 6), (5, 8), (8, 9), (15, 9), (18, 8), (20, 6)], red)
    ne.render(cv, gl)
    return cv, gl


def p_cocktail_table():
    """The VIP room's low table from above: a round top of smoked black glass in a chrome rim, the room's pink lying
    across it, its one foot dark under the glass, the rings of glasses put down on it."""
    S = 26
    cv = Cv(S, S)
    c = S / 2
    fill_shape(cv, c, c, 12.0, 12.0, lambda u, v, L: shade(STEEL_L, L))
    glass = ramp('#1e1428', 0.45, 0.22, 0.45)
    nz = VNoise(S, S, 7, random.Random(7143))
    fill_shape(cv, c, c, 11.0, 11.0, lambda u, v, L: mix(shade(glass, 0.5 - (u + v) / 50), hx('#c8508a'),
                                                         max(0.0, 0.22 - abs(u - v * 0.4 + 3.0) / 18) + 0.05 * nz(c + u, c + v)))
    fill_shape(cv, c, c, 4.0, 4.0, lambda u, v, L: dk(cv.get(c + u, c + v), 0.25))   # its foot under the glass
    for (x, y, r) in ((8.0, 17.5, 1.9), (16.5, 8.0, 1.5)):
        ring(cv, x, y, r - 0.35, r, lambda dx, dy, d, x=x, y=y: lt(cv.get(x + dx, y + dy), 0.12) if dx - dy > -1.5 else None)
    for (x, y) in ((7.0, 7.5), (8.0, 6.5), (18.5, 15.0)):
        cv.dot(x, y, hx('#f0e8f8'))
    cv.outline()
    return cv


GROUP = 'props'
SPRITES = {
    'frame_photo': (p_frame_photo, (12, 5), 'fine hung'),
    'frame_gold': (p_frame_gold, (14, 5), 'fine hung'),
    'poster_fight': (p_poster_fight, (16, 5), 'fine hung'),
    'poster_band': (p_poster_band, (14, 5), 'fine hung'),
    'dartboard': (p_dartboard, (11, 5), 'fine hung'),
    'pay_phone': (p_pay_phone, (10, 7), 'fine hung'),
    'coat_hooks': (p_coat_hooks, (18, 7), 'fine hung'),
    'towel_dispenser': (p_towel_dispenser, (9, 5), 'fine hung'),
    'neon_sign_beer': (p_neon_sign_beer, (36, 14), 'glow hung'),
    'neon_sign_bay': (p_neon_sign_bay, (26, 14), 'glow hung'),
    'poster_pinup': (p_poster_pinup, (12, 5), 'fine hung'),
    'poster_revue': (p_poster_revue, (14, 5), 'fine hung'),
    'mirror_strip': (p_mirror_strip, (44, 4), 'fine hung'),
    'neon_sign_lips': (p_neon_sign_lips, (24, 12), 'glow hung'),
    'cocktail_table': (p_cocktail_table, (26, 26), 'fine', (24, 24)),
    'conduit': (p_conduit, (48, 5), 'fine hung'),
    'flyers': (p_flyers, (26, 5), 'fine hung'),
    'tag': (p_tag, (30, 18), 'fine floor'),
}
