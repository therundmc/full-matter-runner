"""The NEON POSTER's cast and set pieces (see STYLE.md). The cast are cut-paper signs: a body of two or three black
slabs and ONE loud signature (on the head, or carried), the same seen from the side (`man`) and from straight above
(`above`), as the game shows them. No anatomy, no face, no hand.

A character is a function of a pose returning (parts, anchors) in its own units: 100 is a man's height (CUEBALL's
shoulders-to-floor plus head), the feet at y 0, up is -y, he faces +x. parts: [(ink, points)], ink 'body' for his
black (the caller may lift it against a dark ground) or a colour; anchors: name -> point (a hand, the head, the
mouth) for what the panel hangs on him."""
import math

from .kit import BONE, BONE_D, BROWN, CAP, CYAN, CYAN_D, FIRE, FIRE_D, FLUO, INK, NIGHT, NIGHT_L, NIGHT_LL, PINK, PINK_D, TAN, bead, slab, turned


BLOCK = (30, 14, 56)        # the buildings across the street, in a window


def ngon(cx, cy, rx, ry, n=8, turn=22.5):
    return [(cx + math.cos(math.radians(turn + k * 360 / n)) * rx, cy + math.sin(math.radians(turn + k * 360 / n)) * ry) for k in range(n)]


# ---------------------------------------------------------------- the three men, the boss, the runner
def cueball(pose='stand'):
    """CUEBALL, the heavy: a wall of a man on short legs, a bald bone dome; his sign the huge FLUO YELLOW shades
    across it."""
    parts = [
        ('body', [(-21, -36), (-3, -36), (-5, 0), (-23, 0)]), ('body', [(3, -36), (21, -36), (24, 0), (5, 0)]),
        ('body', [(-27, -84), (-8, -91), (8, -91), (27, -84), (31, -58), (25, -33), (-25, -33), (-31, -58)]),
        ('body', [(-27, -84), (-38, -75), (-41, -42), (-31, -39), (-26, -52)]),
    ]
    hand = (36, -39)
    if pose == 'reach':                                      # his near arm held out level: the torch
        parts.append(('body', [(27, -85), (54, -77), (55, -64), (29, -66)]))
        hand = (57, -70)
    else:
        parts.append(('body', [(27, -84), (38, -75), (41, -42), (31, -39), (26, -52)]))
    parts += [(BONE, ngon(0, -98, 10.5, 11)), (FLUO, [(-16, -105), (16, -106), (17, -94), (-15, -93)])]
    return parts, dict(hand=hand, hand_b=(-36, -39), head=(0, -98), mouth=(5, -89), top=(0, -109))


LUCKY_GEAR = 'scarf'   # his pink thing: 'scarf' (the user's pick), or 'pack', 'gloves', 'braces', 'bag' (the options sheet)


def lucky(pose='stand', gear=None):
    """LUCKY, the slick one, the man with the match: a beanpole, a head taller than anyone, in a coat to his ankles,
    his hair slicked flat to a point at the nape; his sign a long PINK scarf, a loud band round his neck, one end down
    his front, the other flying behind (LUCKY_GEAR; the other pink things tried are kept for the options sheet: a
    pack, gloves, braces over a shirt, a bag across him)."""
    gear = gear or LUCKY_GEAR
    coat = BONE if gear == 'braces' else 'body'              # braces: no coat, a pale shirt
    parts = [
        ('body', [(-9, -20), (-2, -20), (-3, 0), (-9, 0)]), ('body', [(2, -20), (9, -20), (9, 0), (3, 0)]),
        ('body', [(3, 0), (9, -4), (19, 0)]),
        (coat, [(-10, -98), (10, -98), (13, -90), (17, -13), (-19, -11), (-13, -90)]),
        (coat, [(-11, -97), (-17, -92), (-19, -52), (-14, -51)]), (coat, [(11, -97), (17, -92), (19, -52), (14, -51)]),
        ('body', ngon(1, -105, 6, 7, 6, 0)), ('body', [(5, -107), (11, -103), (5, -100)]),
        ('body', [(-3, -112), (-12, -103), (-4, -103)]),                                  # the slick's point
    ]
    if gear == 'pack':
        parts += [(PINK, [(-12, -94), (-29, -91), (-31, -56), (-15, -53)]),                # the pack, square on his back
                  (PINK_D, [(-13, -80), (-30, -78), (-30, -73), (-13, -75)]),              # its flap
                  (PINK, [(-12, -96), (7, -97), (9, -91), (-10, -90)]), (PINK, [(4, -96), (9, -96), (11, -66), (6, -66)])]   # the straps
    elif gear == 'gloves':
        parts += [(PINK, ngon(16.5, -48, 5, 6, 6, 0)), (PINK, ngon(-16.5, -48, 5, 6, 6, 0))]
    elif gear == 'braces':
        parts += [(PINK, [(-7, -98), (-3, -98), (-4, -52), (-8, -52)]), (PINK, [(4, -98), (8, -98), (9, -52), (5, -52)]),
                  ('body', [(-16, -54), (16, -54), (17, -13), (-19, -11)])]                # his trousers, high
    elif gear == 'scarf':
        parts += [(PINK, [(-10, -102), (10, -103), (12, -91), (-12, -90)]),               # the band, round his neck
                  (PINK, [(3, -92), (11, -92), (12, -66), (5, -65)]),                      # one end, down his front
                  (PINK, [(-9, -100), (-17, -97), (-42, -68), (-47, -52), (-38, -49), (-33, -61), (-12, -88)])]   # the other, flying
    elif gear == 'bag':
        parts += [(PINK, [(8, -97), (12, -95), (-14, -52), (-18, -55)]),                   # the strap across him
                  (PINK, [(-27, -58), (-9, -60), (-8, -40), (-26, -38)])]                  # the bag at his hip
    thin = lambda p: (p[0] * 0.84, p[1] * 1.1)               # a beanpole: narrower, taller than a man
    parts = [(ink, [thin(q) for q in pts]) for ink, pts in parts]
    anchors = dict(hand=(16, -51), hand_b=(-16, -51), head=(1, -105), mouth=(8, -100), top=(1, -112))
    return parts, {k: thin(v) for k, v in anchors.items()}


def lucky_above(gear=None):
    """LUCKY from straight above, facing +x, with that pink thing."""
    gear = gear or LUCKY_GEAR
    sh = [(-5, -14), (3, -15), (7, -9), (7, 9), (3, 15), (-5, 14), (-8, 0)]
    head = [('body', ngon(1, 0, 6.5, 6.5, 6, 0))]
    if gear == 'pack':
        return [('body', sh), (PINK, [(-21, -11), (-6, -12), (-6, 12), (-21, 11)]),
                (PINK_D, [(-15, -11.5), (-11, -11.6), (-11, 11.6), (-15, 11.5)])] + head
    if gear == 'gloves':
        return [('body', sh)] + head + [(PINK, ngon(10, -13, 4, 4, 6, 0)), (PINK, ngon(10, 13, 4, 4, 6, 0))]
    if gear == 'braces':
        return [(BONE, sh), (PINK, [(-6, -10), (6, -10), (6, -6), (-6, -6)]), (PINK, [(-6, 6), (6, 6), (6, 10), (-6, 10)])] + head
    if gear == 'scarf':
        return [('body', sh), (PINK, ngon(1, 0, 10, 10, 8)), (PINK, [(-5, -4), (-30, 5), (-34, 14), (-26, 15), (-5, 6)])] + head
    return [('body', sh), (PINK, [(4, -14), (8, -11), (-5, 13), (-9, 10)]), (PINK, [(-14, 8), (-3, 9), (-3, 20), (-14, 19)])] + head


def jitters(pose='stand'):
    """JITTERS, the young one: a runt, hunched, knees bent, never still; his sign a CYAN saw-tooth crest (the only
    hair that is a sign)."""
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
    """THE BOSS: the one man cut in BONE, a wide double-breasted suit, a black tie, a black slick of hair, a cigar."""
    parts = [
        (BONE_D, [(-15, -38), (-2, -38), (-3, 0), (-15, 0)]), (BONE_D, [(2, -38), (15, -38), (16, 0), (4, 0)]),
        (BONE, [(-20, -84), (-6, -89), (6, -89), (20, -84), (23, -52), (20, -35), (-20, -35), (-23, -52)]),
        (BONE, [(-20, -84), (-28, -77), (-29, -44), (-22, -43)]), (BONE, [(20, -84), (28, -77), (29, -44), (22, -43)]),
        (INK, [(-3, -89), (3, -89), (6, -58), (0, -48), (-6, -58)]),                      # his shirt and tie
        (PINK_D, ngon(1, -96, 8, 8.5)), (INK, [(-8, -98), (-5, -106), (6, -107), (10, -101), (2, -101)]),
        (BONE_D, [(8, -93), (19, -92), (19, -89), (8, -90)]), (FIRE, [(19, -92), (22, -92), (22, -89), (19, -89)]),
    ]
    return parts, dict(hand=(26, -43), head=(1, -96), mouth=(8, -91), top=(2, -107), ember=(21, -90))


def runner(pose='stand'):
    """THE RUNNER (the player): a long coat, its collar up; his sign the CAP, a sports cap: a round crown, a curved
    brim, a petrol-blue button and a petrol edge under the brim; a fitted petrol gaiter up over his nose: between the
    two, a slit of tan is all his face; brown hair to the collar behind."""
    parts = [
        ('body', [(-10, -30), (-2, -30), (-3, 0), (-10, 0)]), ('body', [(2, -30), (10, -30), (10, 0), (3, 0)]),
        ('body', [(-13, -86), (13, -86), (16, -26), (-17, -25)]),
        ('body', [(-13, -85), (-20, -80), (-21, -46), (-15, -45)]), ('body', [(13, -85), (20, -80), (21, -46), (15, -45)]),
        (BROWN, [(-8, -99), (-3, -99), (-4, -86), (-10, -85)]),                           # his hair, to the collar
        (TAN, [(-4, -99), (9, -99), (9, -94), (-4, -94)]),                                # the slit
        (CYAN_D, [(-5, -95.5), (9.5, -95.5), (10, -89), (7, -84), (-7, -84), (-6, -90)]),  # the gaiter
        ('body', [(-14, -85), (-11, -95), (-5, -86)]), ('body', [(5, -86), (12, -93), (14, -85)]),   # the collar, up
        ('body', [(-9, -97), (-9.5, -103), (-6, -108), (0, -110.5), (6, -109.5), (10, -105.5), (11, -97)]),   # the cap's crown
        ('body', [(9, -101), (17, -100.5), (22, -98), (23, -95.5), (16, -97), (9, -97)]),                      # its brim, curved
        (CYAN_D, [(10, -97), (16, -97), (23, -95.5), (22, -94), (15, -95.5), (10, -95.5)]), (CYAN_D, ngon(0, -110.5, 1.8, 1.4, 6, 0)),
    ]
    return parts, dict(hand=(18, -45), head=(1, -94), mouth=(8, -90), top=(0, -110.5))


def man(cv, who, cx, foot, h, pose='stand', face=1, body=INK, clip=None, lean=0.0):
    """Cut a character (cueball, lucky, ...) standing on (cx, foot): h px for 100 of his units, facing right (face 1)
    or left (-1), leaning lean degrees. body: the ink of his black (lift it on a dark ground). Returns his anchors
    in panel px."""
    parts, anchors = who(pose)
    for ink, pts in parts:
        cv.poly(turned(pts, cx, foot, lean, h / 100.0, face), body if ink == 'body' else ink, clip)
    return {k: turned([p], cx, foot, lean, h / 100.0, face)[0] for k, p in anchors.items()}


# seen from straight above, facing +x: [(ink, points)] in the same units
ABOVE = {
    'cueball': [('body', [(-10, -26), (4, -28), (11, -19), (12, 19), (4, 28), (-10, 26), (-14, 10), (-14, -10)]),
                (BONE, ngon(0, 0, 11, 11)), (FLUO, [(6, -13), (13, -10), (13, 10), (6, 13)])],
    'lucky': lucky_above(),
    'jitters': [('body', [(-5, -12), (3, -13), (7, -8), (7, 8), (3, 13), (-5, 12), (-8, 0)]),
                ('body', ngon(2, 0, 6.5, 6.5, 6, 0)),
                (CYAN, [(-6, -2), (-3, -6), (0, -2), (3, -6), (6, -2), (9, -6), (14, 0), (9, 6), (6, 2), (3, 6), (0, 2), (-3, 6), (-6, 2)])],
    'boss': [(BONE, [(-8, -21), (4, -22), (9, -15), (9, 15), (4, 22), (-8, 21), (-11, 0)]),
             (INK, ngon(2, 0, 8, 8)), (PINK_D, [(6, -5), (10, -4), (10, 4), (6, 5)]),
             (BONE_D, [(10, 1), (18, 2), (18, 4), (10, 4)]), (FIRE, [(18, 2), (21, 2), (21, 4), (18, 4)])],
    'runner': [('body', [(-6, -17), (4, -18), (8, -11), (8, 11), (4, 18), (-6, 17), (-9, 0)]),
               (BROWN, [(-11, -5), (-6, -6), (-6, 6), (-11, 5)]), (CYAN_D, [(-8, -6), (-5, -7), (-5, 7), (-8, 6)]),
               (CAP, [(6, -7.5), (11, -7), (15, -4), (16.5, 0), (15, 4), (11, 7), (6, 7.5)]),             # the brim
               (CYAN_D, [(13.5, -5), (15, -4), (16.5, 0), (15, 4), (13.5, 5), (14.8, 0)]),
               (CAP, ngon(1, 0, 8.5, 8.5, 8)), (CYAN_D, ngon(1, 0, 1.8, 1.8, 6, 0))],
}


def above(cv, name, cx, cy, s, deg=0.0, body=INK, clip=None, parts=None):
    """A character seen from straight above at (cx, cy), s px per unit, facing deg (0: right, 90: down). parts: his
    shapes when they are not ABOVE[name] (the options sheet)."""
    for ink, pts in parts or ABOVE[name]:
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
    cv.poly(turned([(-24, -11), (24, -11), (24, 11), (-24, 11)], cx, cy, deg, s), NIGHT_LL if shade else BONE, clip)
    cv.poly(turned([(-24, 6), (24, 6), (24, 11), (-24, 11)], cx, cy, deg, s), NIGHT_L if shade else BONE_D, clip)
    cv.poly(turned([(-6, -11), (6, -11), (6, 11), (-6, 11)], cx, cy, deg, s), PINK_D, clip)


def window(cv, x0, y0, x1, y1, seed=0, sign=True):
    """A window on the night street: a crooked pane, the bar's neon across the street a pink slab and a cyan one,
    its cross cut back out in the wall's violet. Returns the glass's mask."""
    w, h = x1 - x0, y1 - y0
    glass = cv.poly(slab(x0, y0, x1, y1, seed, 3), NIGHT_L)
    cv.poly([(x0, y0 + h * 0.58), (x0 + w * 0.3, y0 + h * 0.56), (x0 + w * 0.31, y0 + h * 0.33), (x0 + w * 0.67, y0 + h * 0.31),
             (x0 + w * 0.68, y0 + h * 0.52), (x1, y0 + h * 0.5), (x1, y1), (x0, y1)], BLOCK, clip=glass)   # the block across
    if sign:                                                # one slab of neon to a pane, clear of the cross
        cv.poly(slab(x0 + w * 0.08, y0 + h * 0.64, x0 + w * 0.42, y0 + h * 0.78, seed + 9, 2), PINK, clip=glass)
        cv.poly(slab(x0 + w * 0.6, y0 + h * 0.72, x0 + w * 0.9, y0 + h * 0.8, seed + 19, 2), CYAN, clip=glass)
    cv.bar((x0 + w * 0.5, y0 - 5), (x0 + w * 0.51, y1 + 5), 8, NIGHT)
    cv.bar((x0 - 5, y0 + h * 0.5), (x1 + 5, y0 + h * 0.48), 8, NIGHT)
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
        cv.bar(p, q, 4.5 * s, INK)
    return turned([(18, -3)], cx, cy, deg, s, f)[0]
