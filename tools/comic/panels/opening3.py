"""The opening, page 3: no loose ends (match, fire, wake)."""
from .. import poster
from ..kit import BONE, BONE_D, BROWN, FIRE, FIRE_D, INK, NIGHT, NIGHT_L, NIGHT_LL, PINK, PINK_D, Cv, panel, slab

FLAME = (548, 200)    # match: where the match's head is (the game draws its flame there)
MOUTH = (638, 134)    # match: LUCKY's mouth (the balloon's tail, ui/Cinematic.js)
GAP = (150, 410, 236)  # fire: the gap under his door, x0, x1, y (the game makes it burn)


def panel_match(lit):
    """Page 3, panel 1 ("TORCH IT. HE'S IN THE BACK ROOM."). Close on LUCKY, in profile: a black wedge of a face
    under the slicked hair, the pink pack on his back, its strap over his shoulder, the match held up before him.
    Dark: the pack is all there is. Struck: the flame's light is two discs on the wall, his profile cut black out of them; the door to the
    back room shows."""
    W, H = 1080, 282
    cv = Cv(W, H, NIGHT)
    fx, fy = FLAME
    cv.poly(slab(120, 22, 286, H + 10, 5, 6), NIGHT_LL if lit else NIGHT_L)                  # the back room's door
    if lit:
        cv.poly(slab(142, 48, 264, 140, 9, 3), NIGHT_L)
        cv.poly(slab(142, 164, 264, H + 10, 11, 3), NIGHT_L)
        cv.disc(fx, fy, 190, col=FIRE_D)                                                    # the flame's light on the wall
        cv.disc(fx, fy, 96, col=FIRE)
    cv.disc(262, 150, 7, col=BONE_D if lit else NIGHT_LL)
    # his coat and collar, the pack on his back, its strap over his shoulder; his head: the hair slicked to a point,
    # the nose and chin cut forward
    cv.poly([(664, 172), (700, 186), (792, 178), (886, 200), (906, H + 6), (620, H + 6), (650, 206)], INK)
    pink = PINK if lit else PINK_D
    cv.poly([(870, 148), (1006, 156), (1014, H + 6), (890, H + 6)], pink)
    cv.poly([(872, 184), (1008, 192), (1009, 214), (873, 206)], PINK_D if lit else NIGHT_L)    # its flap
    cv.poly([(794, 182), (872, 152), (880, 176), (820, 200), (808, H + 6), (780, H + 6)], pink)   # its strap, over his shoulder
    profile = [(662, 60), (650, 94), (620, 114), (644, 122), (638, 134), (650, 140), (644, 158), (664, 172)]
    cv.poly([(700, 44), (744, 50), (778, 68), (822, 114), (790, 110), (786, 128), (760, 164), (700, 184)] + profile[::-1], INK)
    # the fist and the match
    fist = [(578, 252), (610, 240), (636, 258), (660, H + 6), (590, H + 6)]
    cv.poly(fist, INK)
    cv.bar((596, 252), (fx + 2, fy + 6), 6, BONE if lit else BONE_D)
    cv.disc(fx, fy, 6, col=FIRE_D if lit else PINK_D)
    return cv


@panel('match', (1080, 282))
def panel_match_lit():
    return panel_match(True)


@panel('match_dark', (1080, 282))
def panel_match_dark():
    return panel_match(False)


@panel('fire', (528, 288))
def panel_fire():
    """Page 3, panel 2. His bedroom door from inside: black, the fire a line of orange round it, its light thrown
    across his floor in rays from the gap under it."""
    W, H = 528, 288
    cv = Cv(W, H, NIGHT)
    gx0, gx1, gy = GAP
    cv.poly([(0, gy + 2), (W, gy - 2), (W, H), (0, H)], INK)
    cv.poly([(gx0 - 8, -6), (gx1 + 8, -6), (gx1 + 9, gy), (gx0 - 9, gy)], FIRE_D)             # the light round the door
    cv.poly([(gx0, 6), (gx1, 4), (gx1, gy), (gx0, gy)], INK)
    for y0, y1 in ((24, 112), (132, 216)):
        cv.poly(slab(gx0 + 26, y0, gx1 - 26, y1, y0, 3), NIGHT_L)
    cv.disc(gx1 - 14, 124, 6, col=FIRE)
    # the light on the floor: a wedge, rays in it
    wedge = cv.poly([(gx0, gy), (gx1, gy), (W + 90, H + 4), (-90, H + 4)], FIRE_D)
    for i in range(6):
        u0, u1 = (i + 0.2) / 6, (i + 0.62) / 6
        cv.poly([(gx0 + (gx1 - gx0) * u0, gy), (gx0 + (gx1 - gx0) * u1, gy), (-90 + (W + 180) * u1, H + 4), (-90 + (W + 180) * u0, H + 4)],
                FIRE, clip=wedge)
    # his bottle on the floor: black against it
    cv.poly([(40, 262), (104, 254), (108, 268), (44, 276)], INK)
    cv.poly([(104, 257), (122, 256), (122, 264), (106, 266)], INK)
    return cv


def panel_wake(open_):
    """Page 3, panel 3. His eye, as large as the panel: shut, a black line; open, bone, the fire in it."""
    W, H = 528, 288
    cv = Cv(W, H, FIRE_D)
    cv.poly([(0, 0), (W, 0), (W, 56), (452, 96), (400, 50), (320, 92), (236, 48), (150, 96), (70, 56), (0, 90)], BROWN)  # his hair
    cv.poly([(430, 96), (W, 70), (W, H), (476, H), (440, 200)], PINK_D)                      # the bridge of his nose, in shade
    cv.poly([(0, 232), (300, 250), (470, H), (0, H)], NIGHT_L)                               # the sheet
    cv.poly([(0, 244), (290, 262), (430, H), (0, H)], NIGHT_LL)
    cv.poly([(132, 132), (250, 100), (372, 108), (388, 126), (252, 122), (140, 150)], INK)   # the brow
    eye = [(150, 186), (214, 154), (300, 146), (372, 170), (310, 204), (220, 208)]
    if open_:
        em = cv.poly(eye, BONE)
        cv.disc(268, 174, 30, col=INK, clip=em)
        cv.poly([(256, 184), (262, 160), (270, 172), (276, 154), (284, 184)], FIRE, clip=em)  # the fire in it
        cv.poly([(150, 186), (214, 154), (300, 146), (372, 170), (300, 156), (216, 164)], INK)   # the lid
    else:
        cv.poly([(150, 186), (220, 196), (310, 194), (372, 170), (312, 206), (220, 210)], INK)
    cv.poly([(170, 226), (300, 232), (360, 214), (300, 222), (176, 220)], PINK_D)             # under it
    return cv


@panel('wake', (528, 288))
def panel_wake_open():
    return panel_wake(True)


@panel('wake_shut', (528, 288))
def panel_wake_shut():
    return panel_wake(False)
