"""The NEON POSTER's cast and set pieces (see STYLE.md). The cast are cut-paper signs: a body of two or three black
slabs and ONE loud signature on the head, the same seen from the side (`man`) and from straight above (`above`), as
the game shows them. No anatomy, no face, no hand.

A character is a function of a pose returning (parts, anchors) in its own units: 100 is a man's height (CUEBALL's
shoulders-to-floor plus head), the feet at y 0, up is -y, he faces +x. parts: [(ink, points)], ink 'body' for his
black (the caller may lift it against a dark ground) or a colour; anchors: name -> point (a hand, the head, the
mouth) for what the panel hangs on him."""
import math

from .kit import BONE, BONE_D, CYAN, CYAN_D, FIRE, FIRE_D, INK, NIGHT, NIGHT_L, NIGHT_LL, PINK, PINK_D, bead, slab, turned


BLOCK = (30, 14, 56)        # the buildings across the street, in a window


def ngon(cx, cy, rx, ry, n=8, turn=22.5):
    return [(cx + math.cos(math.radians(turn + k * 360 / n)) * rx, cy + math.sin(math.radians(turn + k * 360 / n)) * ry) for k in range(n)]


# ---------------------------------------------------------------- the three men, the boss, the runner
def cueball(pose='stand'):
    """CUEBALL, the heavy: a wall of a man on short legs; his sign a bald BONE dome, a black bar of shades across it."""
    parts = [
        ('body', [(-21, -36), (-3, -36), (-5, 0), (-23, 0)]), ('body', [(3, -36), (21, -36), (24, 0), (5, 0)]),
        ('body', [(-27, -84), (-8, -91), (8, -91), (27, -84), (31, -58), (25, -33), (-25, -33), (-31, -58)]),
        ('body', [(-27, -84), (-38, -75), (-41, -42), (-31, -39)]),
    ]
    hand = (36, -39)
    if pose == 'bar':                                        # his near arm out a little, a bar hanging from the fist
        parts.append(('body', [(27, -84), (40, -76), (45, -46), (35, -42)]))
        hand = (40, -43)
    else:
        parts.append(('body', [(27, -84), (38, -75), (41, -42), (31, -39)]))
    parts += [(BONE, ngon(0, -98, 10.5, 11)), ('body', [(-11, -99), (11, -100), (11, -95), (-11, -94)])]
    return parts, dict(hand=hand, hand_b=(-36, -39), head=(0, -98), mouth=(5, -91), top=(0, -109))


def lucky(pose='stand'):
    """LUCKY, the slick one, the man with the match: a beanpole in a long coat; his sign an enormous PINK pompadour
    thrown forward."""
    parts = [
        ('body', [(-10, -34), (-2, -34), (-3, 0), (-9, 0)]), ('body', [(2, -34), (10, -34), (9, 0), (3, 0)]),
        ('body', [(3, 0), (9, -4), (18, 0)]),
        ('body', [(-11, -98), (11, -98), (13, -90), (12, -33), (-14, -31), (-13, -90)]),
        ('body', [(-11, -97), (-17, -92), (-18, -52), (-13, -51)]),
    ]
    hand = (16, -51)
    if pose == 'reach':                                      # his near arm held out level: the torch, the match
        parts.append(('body', [(9, -96), (34, -91), (35, -86), (10, -86)]))
        hand = (36, -88)
    else:
        parts.append(('body', [(11, -97), (17, -92), (18, -52), (13, -51)]))
    parts += [('body', ngon(1, -105, 6, 7, 6, 0)), ('body', [(5, -107), (11, -103), (5, -100)]),
              (PINK, [(-10, -108), (-8, -119), (3, -128), (18, -131), (29, -122), (23, -112), (12, -115), (6, -109)])]
    thin = lambda p: (p[0] * 0.84, p[1] * 1.1)               # a beanpole: narrower, taller than a man
    parts = [(ink, [thin(q) for q in pts]) for ink, pts in parts]
    anchors = dict(hand=hand, hand_b=(-16, -51), head=(1, -105), mouth=(8, -100), top=(8, -131))
    return parts, {k: thin(v) for k, v in anchors.items()}


def jitters(pose='stand'):
    """JITTERS, the young one: a runt, hunched, knees bent, never still; his sign a CYAN saw-tooth crest."""
    parts = [
        ('body', [(-11, -33), (-2, -33), (-7, -17), (-3, 0), (-12, 0), (-16, -17)]),
        ('body', [(3, -33), (12, -33), (17, -17), (13, 0), (5, 0), (8, -17)]), ('body', [(5, 0), (12, -4), (19, 0)]),
        ('body', [(-13, -57), (8, -63), (15, -52), (13, -32), (-12, -31), (-15, -46)]),
        ('body', [(-12, -56), (-19, -51), (-18, -30), (-12, -30)]),
    ]
    hand = (17, -30)
    if pose == 'tip':                                        # his near arm up and out: the can tipped
        parts.append(('body', [(9, -60), (29, -66), (30, -60), (12, -51)]))
        hand = (31, -63)
    else:
        parts.append(('body', [(11, -59), (18, -54), (20, -32), (14, -31)]))
    parts += [('body', ngon(5, -69, 6.5, 7, 6, 0)), ('body', [(9, -71), (15, -67), (9, -64)]),
              (CYAN, [(-3, -73), (-7, -84), (-1, -77), (0, -89), (4, -78), (8, -88), (10, -77), (15, -82), (11, -72), (4, -75)])]
    return parts, dict(hand=hand, hand_b=(-15, -30), head=(5, -69), mouth=(12, -65), top=(4, -89))


def boss(pose='stand'):
    """THE BOSS: the one man cut in BONE, a wide double-breasted suit, a black slick of hair, a cigar."""
    parts = [
        (BONE_D, [(-15, -38), (-2, -38), (-3, 0), (-15, 0)]), (BONE_D, [(2, -38), (15, -38), (16, 0), (4, 0)]),
        (BONE, [(-20, -84), (-6, -89), (6, -89), (20, -84), (23, -52), (20, -35), (-20, -35), (-23, -52)]),
        (BONE, [(-20, -84), (-28, -77), (-29, -44), (-22, -43)]), (BONE, [(20, -84), (28, -77), (29, -44), (22, -43)]),
        (INK, [(-2, -89), (2, -89), (5, -60), (0, -52), (-5, -60)]),                      # his shirt and tie
        (PINK_D, ngon(1, -96, 8, 8.5)), (INK, [(-8, -98), (-5, -106), (6, -107), (10, -101), (2, -101)]),
        (BONE_D, [(8, -93), (19, -92), (19, -89), (8, -90)]), (FIRE, [(19, -92), (22, -92), (22, -89), (19, -89)]),
    ]
    return parts, dict(hand=(26, -43), head=(1, -96), mouth=(8, -91), top=(2, -107))


def runner(pose='stand'):
    """THE RUNNER (the player): a long coat, collar up, a cap; his sign the scarf over his mouth, petrol blue."""
    parts = [
        ('body', [(-10, -30), (-2, -30), (-3, 0), (-10, 0)]), ('body', [(2, -30), (10, -30), (10, 0), (3, 0)]),
        ('body', [(-13, -86), (13, -86), (16, -26), (-17, -25)]),
        ('body', [(-13, -85), (-20, -80), (-21, -46), (-15, -45)]), ('body', [(13, -85), (20, -80), (21, -46), (15, -45)]),
        ('body', ngon(1, -94, 7, 7.5, 6, 0)),
        ('body', [(-7, -98), (-4, -103), (8, -103), (17, -97), (8, -97)]),                # the cap and its peak
        (CYAN_D, [(-7, -92), (9, -93), (10, -85), (-13, -83), (-18, -70), (-22, -72), (-15, -87)]),   # the scarf, its tail behind
    ]
    return parts, dict(hand=(18, -45), head=(1, -94), mouth=(8, -90), top=(2, -103))


def man(cv, who, cx, foot, h, pose='stand', face=1, body=INK, clip=None, lean=0.0):
    """Cut a character (cueball, lucky, ...) standing on (cx, foot): h px for 100 of his units, facing right (face 1)
    or left (-1), leaning lean degrees. body: the ink of his black (lift it on a dark ground). Returns his anchors
    in panel px."""
    parts, anchors = who(pose)
    for ink, pts in parts:
        cv.poly(turned(pts, cx, foot, lean, h / 100.0, face), body if ink == 'body' else ink, clip)
    return {k: turned([p], cx, foot, lean, h / 100.0, face)[0] for k, p in anchors.items()}


# seen from straight above, facing +x: (parts, how far the shoulders reach)
ABOVE = {
    'cueball': [('body', [(-10, -26), (4, -28), (11, -19), (12, 19), (4, 28), (-10, 26), (-14, 10), (-14, -10)]),
                (BONE, ngon(1, 0, 11, 11)), ('body', [(9.5, -7), (12.5, -5), (12.5, 5), (9.5, 7)])],
    'lucky': [('body', [(-5, -14), (3, -15), (7, -9), (7, 9), (3, 15), (-5, 14), (-8, 0)]),
              ('body', ngon(1, 0, 6.5, 6.5, 6, 0)), (PINK, [(-5, -6), (6, -8), (18, -4), (22, 1), (9, 7), (-5, 6)])],
    'jitters': [('body', [(-5, -12), (3, -13), (7, -8), (7, 8), (3, 13), (-5, 12), (-8, 0)]),
                ('body', ngon(2, 0, 6.5, 6.5, 6, 0)),
                (CYAN, [(-6, -2), (-3, -6), (0, -2), (3, -6), (6, -2), (9, -6), (14, 0), (9, 6), (6, 2), (3, 6), (0, 2), (-3, 6), (-6, 2)])],
    'boss': [(BONE, [(-8, -21), (4, -22), (9, -15), (9, 15), (4, 22), (-8, 21), (-11, 0)]),
             (INK, ngon(2, 0, 8, 8)), (PINK_D, [(6, -5), (10, -4), (10, 4), (6, 5)]), (BONE_D, [(10, 1), (18, 2), (18, 4), (10, 4)])],
    'runner': [('body', [(-6, -17), (4, -18), (8, -11), (8, 11), (4, 18), (-6, 17), (-9, 0)]),
               (CYAN_D, [(-9, -9), (-2, -10), (-2, 10), (-9, 9), (-16, 5), (-15, 1)]),
               ('body', ngon(2, 0, 7, 7, 6, 0)), ('body', [(4, -7), (13, -4), (13, 4), (4, 7)])],
}


def above(cv, name, cx, cy, s, deg=0.0, body=INK, clip=None):
    """A character seen from straight above at (cx, cy), s px per unit, facing deg (0: right, 90: down)."""
    for ink, pts in ABOVE[name]:
        cv.poly(turned(pts, cx, cy, deg, s), body if ink == 'body' else ink, clip)


# ---------------------------------------------------------------- set pieces
def boards(cv, slant, pitch=38, col=NIGHT_L, clip=None, x0=-200, seed=0):
    """Floorboards seen from above: every other one a slab of col, leaning `slant` px over the panel's height."""
    i, x = 0, x0
    while x < cv.w + abs(slant) + pitch:
        if i % 2:
            k = (bead(seed + i) - 0.5) * 3
            cv.poly([(x, -10), (x + pitch - 4, -10), (x + pitch - 4 + slant + k, cv.h + 10), (x + slant - k, cv.h + 10)], col, clip)
        x += pitch
        i += 1


def board_gaps(cv, slant, pitch, col, clip, x0=-200, w=3):
    """The gaps between those boards, where a light shows them."""
    x = x0
    while x < cv.w + abs(slant) + pitch:
        cv.bar((x, -10), (x + slant, cv.h + 10), w, col, clip=clip)
        x += pitch


def brick(cv, cx, cy, deg=0.0, s=1.0, clip=None, shade=False):
    """A banded brick of notes seen from above: bone, its band dark pink, a darker cut along one long side; shade:
    in a shadow (violet)."""
    cv.poly(turned([(-24, -11), (24, -12), (25, 11), (-23, 12)], cx, cy, deg, s), NIGHT_LL if shade else BONE, clip)
    cv.poly(turned([(-23, 6), (25, 5), (25, 11), (-23, 12)], cx, cy, deg, s), NIGHT_L if shade else BONE_D, clip)
    cv.poly(turned([(-6, -12), (6, -12), (7, 12), (-5, 12)], cx, cy, deg, s), PINK_D, clip)


def window(cv, x0, y0, x1, y1, seed=0, sign=True):
    """A window on the night street: a crooked pane, the bar's neon across the street a pink slab and a cyan one,
    its cross cut back out in the wall's violet. Returns the glass's mask."""
    w, h = x1 - x0, y1 - y0
    glass = cv.poly(slab(x0, y0, x1, y1, seed, 4), NIGHT_L)
    cv.poly([(x0, y0 + h * 0.5), (x0 + w * 0.34, y0 + h * 0.46), (x0 + w * 0.36, y0 + h * 0.3), (x0 + w * 0.7, y0 + h * 0.28),
             (x0 + w * 0.72, y0 + h * 0.52), (x1, y0 + h * 0.5), (x1, y1), (x0, y1)], BLOCK, clip=glass)   # the block across
    if sign:
        cv.poly(slab(x0 + w * 0.1, y0 + h * 0.58, x0 + w * 0.62, y0 + h * 0.7, seed + 9, 2), PINK, clip=glass)
        cv.poly(slab(x0 + w * 0.5, y0 + h * 0.78, x0 + w * 0.9, y0 + h * 0.84, seed + 19, 1.5), CYAN, clip=glass)
    cv.bar((x0 + w * 0.5, y0 - 4), (x0 + w * 0.52, y1 + 4), 7, NIGHT)
    cv.bar((x0 - 4, y0 + h * 0.5), (x1 + 4, y0 + h * 0.47), 7, NIGHT)
    return glass



def torch(cv, at, face=1, s=1.0):
    """A torch held out at `at`, pointing where he faces: a black barrel, its lens bone. Returns the lens's point."""
    x, y = at
    cv.poly([(x - 4 * s * face, y - 5 * s), (x + 14 * s * face, y - 6 * s), (x + 14 * s * face, y + 6 * s), (x - 4 * s * face, y + 5 * s)], INK)
    cv.disc(x + 15 * s * face, y, 4 * s, 7 * s, BONE)
    return (x + 16 * s * face, y)


def crowbar(cv, a, b, w=6, col=BONE):
    """A crowbar from a (the hand) to b (its claw): a strip and its hook."""
    dx, dy = b[0] - a[0], b[1] - a[1]
    cv.bar(a, b, w, col)
    cv.bar(b, (b[0] - dy * 0.14 + dx * 0.04, b[1] + dx * 0.14 + dy * 0.04), w, col, w1=w * 0.5)


def jerrycan(cv, cx, cy, s=1.0, deg=0.0, col=FIRE_D, f=1):
    """A jerrycan about its handle's middle (cx, cy), hanging (deg 0) or tipped (f -1: mirrored): a slab, its X
    pressed in, a spout. Returns the spout's tip."""
    cv.poly(turned([(-13, 4), (13, 3), (15, 40), (-14, 41)], cx, cy, deg, s, f), col)
    cv.poly(turned([(-8, -3), (8, -3), (8, 4), (-8, 4)], cx, cy, deg, s, f), col)
    cv.poly(turned([(-4, 0), (4, 0), (4, 4), (-4, 4)], cx, cy, deg, s, f), NIGHT)
    cv.poly(turned([(9, 4), (15, -4), (19, -2), (14, 6)], cx, cy, deg, s, f), col)              # the spout
    for a, b in (((-9, 10), (10, 35)), ((10, 10), (-9, 35))):
        p, q = turned([a, b], cx, cy, deg, s, f)
        cv.bar(p, q, 3 * s, INK)
    return turned([(18, -3)], cx, cy, deg, s, f)[0]
