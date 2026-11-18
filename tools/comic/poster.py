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


def lucky_above(gear=None, reach=None):
    """LUCKY from straight above, facing +x, with that pink thing. The scarf: a man first (the coat's shoulders, the
    head with its slick's point at the nape), the pink a band round his neck and one short end behind a shoulder.
    reach: where a hand is, in his units (an arm held out from the shoulder on that side)."""
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
        parts = [('body', [(-8, -17), (-2, -20), (5, -18), (9, -11), (9, 11), (5, 18), (-2, 20), (-8, 17), (-11, 0)])]   # the coat's shoulders
        if reach:
            side = 1 if reach[1] >= 0 else -1
            (ax, ay), (bx, by) = (3, side * 15), reach
            d = math.hypot(bx - ax, by - ay) or 1.0
            nx, ny = -(by - ay) / d, (bx - ax) / d
            parts.append(('body', [(ax + nx * 4.5, ay + ny * 4.5), (bx + nx * 2.6, by + ny * 2.6), (bx - nx * 2.6, by - ny * 2.6),
                                   (ax - nx * 4.5, ay - ny * 4.5)]))
        return parts + [
            (PINK, [(-7, 2), (-9, 12), (-17, 16), (-20, 10), (-13, 7), (-12, 0)]),        # its end, short, down his back
            (PINK, [(6, -9), (0, -11), (-7, -8.5), (-11, -2), (-10.5, 5), (-6, 9.5), (0, 11), (6, 9)]),   # the band, round his nape
            ('body', ngon(2, 0, 7, 7, 6, 0)), ('body', [(-2, -5.5), (-7.5, -1), (-2, 4.5)]),      # his head, the slick's point
            (BONE_D, [(6, -3.4), (9.6, -2.4), (9.6, 2.4), (6, 3.4)]),                     # his brow: which way he looks
        ]
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


# THE RUNNER's cap side on, in his units (its base on his brow at y -97.5): a round low dome, highest over the brow,
# its button a nub on top; the brim a short wedge, thick at its root, dipping a little, its underside petrol
RUNNER_HAT = [
    ('body', [(-10.5, -97), (-11, -100.5), (-9, -104), (-5, -106.8), (-1.3, -108), (-1.1, -109.1), (1.7, -109.2), (1.8, -108.2), (5, -108),
              (9, -106.2), (11.3, -103), (12, -99.5), (11.5, -97.5)]),
    ('body', [(9.5, -101.5), (13, -101.8), (21, -98.6), (20.6, -96.6), (9.5, -97.2)]),
    (CYAN_D, [(12, -98.5), (20.9, -97.9), (20.6, -96.6), (12, -97)]),
]


def hat(cv, x, y, s, face=1, deg=0.0, body=INK, clip=None):
    """His cap alone, the middle of its base at (x, y), s px a unit, turned deg (on a hook, on a head cut by hand)."""
    for ink, pts in RUNNER_HAT:
        cv.poly(turned([(px, py + 97.5) for px, py in pts], x, y, deg, s, face), body if ink == 'body' else ink, clip)


def runner(pose='stand'):
    """THE RUNNER (the player): his sign the low CAP and the long COAT's split tails. A dark sports cap
    (RUNNER_HAT); a funnel collar closed up to his nose, the petrol gaiter showing at its rim: between the two, a
    slit of tan is all his face; brown hair to the collar behind. A duster to just below the knee, its back vent
    open to the waist: two tails flying behind him, the far one showing its petrol lining; the satchel on its strap
    across him."""
    parts = [
        (CYAN_D, [(-8, -58), (-27, -49), (-43, -49), (-39, -36), (-26, -33), (-7, -27)]),   # the far tail: its lining
        ('body', [(-10, -26), (-2, -26), (-3, 0), (-10, 0)]), ('body', [(2, -26), (9, -26), (10, -5), (15, -4), (16, 0), (3, 0)]),
        ('body', [(-13, -86), (13, -86), (15, -56), (14, -21), (-6, -23), (-16, -50)]),    # the duster, to below the knee
        ('body', [(-14, -64), (-24, -44), (-36, -26), (-41, -11), (-31, -10), (-25, -20), (-5, -24)]),   # the near tail
        ('body', [(-13, -85), (-20, -80), (-21, -46), (-15, -45)]), ('body', [(13, -85), (20, -80), (21, -46), (15, -45)]),
        (BROWN, [(-11, -86), (-6, -86.5), (13, -55), (9, -52)]),                          # the satchel's strap, across him
        (BROWN, [(8, -56), (20, -57), (21, -43), (9, -42)]),                              # the satchel, at his hip
        (BROWN, [(-10, -100), (-4, -100), (-5, -87), (-12.5, -86)]),                      # his hair, to the collar
        (TAN, [(-4, -100), (9, -100), (9, -94), (-4, -94)]),                              # the slit
        ('body', [(-10, -94), (11.5, -95), (9, -84), (-8, -84)]),                         # the funnel collar, closed
        (CYAN_D, [(-10, -94.4), (11.6, -95.2), (11.3, -92.3), (-9.7, -91.5)]),            # the gaiter, at its rim
        ('body', [(-4, -98), (9.5, -98), (9.5, -96.6), (-4, -96.6)]),                     # the cap's shadow, across the slit
    ] + RUNNER_HAT
    return parts, dict(hand=(18, -45), head=(1, -94), mouth=(8, -90), top=(0, -109.2))


def man(cv, who, cx, foot, h, pose='stand', face=1, body=INK, clip=None, lean=0.0):
    """Cut a character (cueball, lucky, ...) standing on (cx, foot): h px for 100 of his units, facing right (face 1)
    or left (-1), leaning lean degrees. body: the ink of his black (lift it on a dark ground). Returns his anchors
    in panel px."""
    parts, anchors = who(pose)
    for ink, pts in parts:
        cv.poly(turned(pts, cx, foot, lean, h / 100.0, face), body if ink == 'body' else ink, clip)
    return {k: turned([p], cx, foot, lean, h / 100.0, face)[0] for k, p in anchors.items()}


# THE RUNNER from straight above, facing +x: the coat (its two tails trailing, the lining in the vent, the satchel
# on its strap) and the cap alone (the options' table has it lying there)
RUNNER_COAT = [
    (CYAN_D, [(-6, -5), (-21, -5), (-24, 0), (-20, 5), (-6, 5)]),                         # the lining, in the open vent
    ('body', [(-5, -14), (-20, -16), (-32, -11), (-22, -6), (-8, -1)]),                   # one tail
    ('body', [(-5, 14), (-17, 17), (-28, 14), (-20, 6), (-8, 1)]),                        # the other
    ('body', [(-6, -17), (4, -18), (8, -11), (8, 11), (4, 18), (-6, 17), (-9, 0)]),
    (BROWN, [(5, -17.5), (7.5, -15), (-4, 14), (-7, 12)]),                                  # the strap
    (BROWN, [(-11, 9), (-4, 10), (-4, 18), (-11, 17)]),                                    # the satchel
    (BROWN, [(-11, -5), (-6, -6), (-6, 6), (-11, 5)]), (CYAN_D, [(-8, -6), (-5, -7), (-5, 7), (-8, 6)]),   # his hair, the collar's rim
]
RUNNER_CAP = [
    (CYAN_D, [(3, -8), (9.5, -7.4), (13.4, -4.6), (14.8, 0), (13.4, 4.6), (9.5, 7.4), (3, 8)]),   # the brim: a short crescent, its front edge petrol
    (CAP, [(3, -8), (8.8, -7.4), (12.2, -4.4), (13.4, 0), (12.2, 4.4), (8.8, 7.4), (3, 8)]),
    (CAP, ngon(0.5, 0, 8.6, 8.6, 12, 15)), (CYAN_D, ngon(0.5, 0, 1.3, 1.3, 6, 0)),
]

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
    'runner': RUNNER_COAT + RUNNER_CAP,
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
