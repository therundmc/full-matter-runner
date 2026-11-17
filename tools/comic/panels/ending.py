"""Level 1's closing page (drive, office and its phone, matchbook)."""
from .. import poster
from ..kit import BLOOD, BONE, BONE_D, CYAN_D, FIRE, FIRE_D, INK, NIGHT, NIGHT_L, NIGHT_LL, PINK, PINK_D, Cv, panel, slab, turned

DRIVE_MIRROR = (438, 44, 626, 84)   # the rear-view mirror's glass: the game draws the bar going away in it
DRIVE_GLASS = [(0, 24), (636, 30), (606, 228), (0, 222)]   # the windscreen: the game runs the rain and the wiper on it
OFFICE_SMOKE = (214, 177)   # the cigar's lit end in the ashtray: the game draws its smoke
OFFICE_DRIP = (446, 203)    # where his blood runs off the desk's edge: the game lets it drip
MATCH_COVER = [(96, 82), (360, 64), (366, 150), (102, 168)]   # the matchbook's printed face: the game letters it
HANDSET = [(84, 150), (188, 146), (190, 160), (86, 164)]     # the phone's handset (office_phone, shaken by the game)


@panel('drive', (1080, 288))
def panel_drive():
    """"THE BAR GOT SMALLER IN THE MIRROR." From inside the van: the windscreen a slab of night, the road a black
    wedge to its vanishing point, the street lamps a row of discs getting smaller; the mirror; THE RUNNER at the
    wheel, cap and scarf in profile against his side window."""
    W, H = 1080, 288
    cv = Cv(W, H, INK)
    glass = cv.poly(DRIVE_GLASS, NIGHT)
    vx, vy = 236, 150
    cv.poly([(0, 150), (70, 150), (76, 122), (150, 124), (154, 140), (300, 138), (306, 108), (384, 110), (388, 142), (520, 140),
             (526, 118), (640, 120), (640, 160), (0, 160)], NIGHT_L, clip=glass)              # the town, going away
    cv.poly([(0, 156), (640, 152), (640, 240), (0, 240)], NIGHT_L, clip=glass)
    cv.poly([(vx, vy), (-80, 232), (560, 236)], INK, clip=glass)                             # the road
    for i in range(6):                                                                      # its line
        u0, u1 = 0.1 + i * 0.16, 0.18 + i * 0.16
        a, b = (vx + (150 - vx) * u0, vy + (236 - vy) * u0), (vx + (150 - vx) * u1, vy + (236 - vy) * u1)
        cv.bar(a, b, 1 + 6 * u0, BONE_D, w1=1 + 6 * u1, clip=glass)
    for i in range(6):                                                                      # the lamps, a row of them
        u = 0.86 ** (i * 2.2)
        x, y = vx + (590 - vx) * u, vy + (56 - vy) * u
        cv.bar((x, y), (x + 4 * u, vy + (228 - vy) * u), 5 * u + 1, INK, clip=glass)
        cv.disc(x, y, 3 + 13 * u, col=FIRE_D, clip=glass)
        cv.disc(x, y, 1.5 + 7 * u, col=FIRE, clip=glass)
    cv.disc(vx - 4, vy + 4, 2, col=PINK, clip=glass)
    cv.disc(vx + 4, vy + 4, 2, col=PINK, clip=glass)
    # the mirror, on its stalk
    mx0, my0, mx1, my1 = DRIVE_MIRROR
    cv.poly([(mx0 - 8, my0 - 8), (mx1 + 8, my0 - 6), (mx1 + 6, my1 + 8), (mx0 - 6, my1 + 6)], INK)
    cv.bar((530, 24), (532, my0 - 6), 12, INK)
    cv.poly([(mx0, my0), (mx1, my0), (mx1, my1), (mx0, my1)], (12, 8, 18))
    # the dash, the wheel
    cv.poly([(0, 222), (606, 228), (700, 250), (700, H), (0, H)], INK)
    cv.poly([(0, 222), (606, 228), (612, 236), (0, 230)], NIGHT_L)
    cv.disc(660, 262, 92, 104, NIGHT_LL)
    cv.disc(660, 262, 74, 86, INK)
    cv.bar((660, 262), (596, 196), 12, NIGHT_LL)
    cv.bar((660, 262), (742, 216), 12, NIGHT_LL)
    # his side window behind him, and him against it: the cap's peak, the scarf, the coat
    cv.poly([(770, 14), (W, 2), (W, 176), (800, 190)], NIGHT_LL)
    cv.poly([(840, 96), (W, 84), (W, 112), (846, 124)], PINK_D)
    cv.poly([(750, H), (800, 196), (880, 168), (980, 176), (W, 220), (W, H)], INK)            # his shoulders
    cv.poly(poster.ngon(900, 108, 54, 56, 7, 14), INK)                                       # his head
    cv.poly([(840, 112), (822, 124), (838, 134)], INK)                                       # his nose
    cv.poly([(958, 70), (940, 44), (880, 36), (836, 58), (780, 80), (834, 84), (860, 76)], INK)   # the cap
    cv.poly([(838, 136), (930, 128), (962, 150), (1010, 236), (984, 244), (940, 176), (850, 178), (832, 160)], CYAN_D)   # the scarf
    cv.bar((846, 232), (704, 222), 34, INK, w1=22)                                            # his arm to the wheel
    cv.poly(poster.ngon(700, 220, 17, 15, 6, 0), INK)
    return cv


def desk_edge(x):
    """The y of the desk's front edge at x (it passes through OFFICE_DRIP)."""
    return OFFICE_DRIP[1] + (446 - x) * 0.026


def office_phone(cv):
    """The handset alone: bone, on its cradle."""
    cv.poly(HANDSET, BONE)
    for x0, x1 in ((80, 108), (166, 194)):
        cv.poly(slab(x0, 144, x1, 170, x0, 2), BONE)
    cv.poly([(110, 160), (164, 158), (164, 163), (110, 165)], BONE_D)


@panel('office', (528, 282))
def panel_office():
    """"THE BOSS'S PHONE RANG. SOMEBODY WANTED NEWS." His back room: the blind's bars thrown across the wall, the
    desk a black slab, THE BOSS in bone fallen across it, his blood to its edge; the bone telephone, his cigar, far too
    big, still lit by his hand."""
    W, H = 528, 282
    cv = Cv(W, H, NIGHT)
    for i in range(7):                                                                      # the blind's bars, on a slant
        y = 20 + i * 30
        cv.poly([(-10, y + 40), (W + 10, y - 44), (W + 10, y - 30), (-10, y + 54)], PINK_D if i % 2 else NIGHT_L)
    cv.poly([(322, 52), (486, 44), (510, 190), (310, 190)], NIGHT_LL)                         # his chair
    cv.poly([(336, 66), (474, 60), (490, 180), (326, 180)], NIGHT_L)
    # the desk
    cv.poly([(26, 184), (506, 170), (W + 10, desk_edge(W + 10)), (-10, desk_edge(-10))], NIGHT_L)
    cv.poly([(-10, desk_edge(-10)), (W + 10, desk_edge(W + 10)), (W + 10, H), (-10, H)], INK)
    # the boss, fallen across it: the suit, an arm thrown out, the head down, the blood
    cv.poly([(296, 192), (316, 138), (392, 112), (478, 122), (W + 10, 164), (W + 10, 200), (300, 202)], BONE)
    cv.poly([(392, 112), (478, 122), (W + 10, 164), (W + 10, 178), (470, 140), (400, 128)], BONE_D)
    cv.poly([(300, 176), (226, 188), (222, 200), (304, 198)], BONE)
    cv.poly(poster.ngon(214, 196, 11, 9, 6, 0), PINK_D)                                      # his hand, open
    blood = [(318, 188), (400, 186), (444, 196), (452, desk_edge(452) + 1), (438, desk_edge(438) + 1), (350, 204), (306, 200)]
    cv.poly(blood, BLOOD)
    cv.poly(poster.ngon(338, 172, 30, 24, 7, 8), INK)                                        # his hair
    cv.poly([(310, 176), (330, 190), (356, 192), (366, 180), (340, 186)], PINK_D)             # his cheek on the wood
    # the telephone (its handset is office_phone), the ashtray, the cigar
    cv.poly(slab(92, 160, 184, 194, 3, 3), BONE_D)
    cv.disc(138, 178, 15, 11, BONE)
    cv.disc(138, 178, 6, 4, BONE_D)
    sx, sy = OFFICE_SMOKE
    cv.poly([(sx - 26, sy + 10), (sx + 24, sy + 8), (sx + 18, sy + 18), (sx - 20, sy + 20)], NIGHT_LL)
    cv.bar((sx + 74, sy + 14), (sx + 6, sy + 1), 20, BONE_D, w1=17)                           # the cigar, far too big, still lit
    cv.bar((sx + 50, sy + 9.5), (sx + 42, sy + 8), 20, PINK_D, w1=19)
    cv.poly(poster.ngon(sx + 2, sy, 11, 10, 6, 0), FIRE_D)
    cv.poly(poster.ngon(sx, sy, 6.5, 6, 6, 0), FIRE)
    cv.poly([(300, 196), (318, 204), (312, 232), (300, 240), (292, 230)], INK)                # his tie, over the desk's edge
    # papers on the floor in front
    for x, y, d in ((70, 250, -12), (150, 262, 20), (420, 256, 8)):
        cv.poly(turned([(-22, -8), (22, -8), (22, 8), (-22, 8)], x, y, d), NIGHT_L)
    return cv


@panel('office_phone', (528, 282))
def panel_office_phone():
    """The handset of the boss's telephone alone, on a clear sheet: the game shakes it on its cradle while it rings."""
    cv = Cv(528, 282, None)
    office_phone(cv)
    return cv


@panel('matchbook', (528, 282))
def panel_matchbook():
    """"OFF THE BOSS'S DESK." The matchbook, pink, on the black of the desk (the game letters FLAMINGO MOTEL on it):
    a bone flamingo, the striker, loose matches beside it; across the desk the shadow of the man who picked it up, his
    cap's peak."""
    W, H = 528, 282
    cv = Cv(W, H, NIGHT)
    for i in range(6):                                                                      # the blind's bars across the desk
        x = -60 + i * 110
        cv.poly([(x, -10), (x + 46, -10), (x + 46 - 120, H + 10), (x - 120, H + 10)], NIGHT_L)
    a, b, c, d = MATCH_COVER
    cv.poly([(a[0] + 14, a[1] + 16), (b[0] + 16, b[1] + 14), (c[0] + 20, c[1] + 36), (d[0] + 18, d[1] + 38)], INK)      # its shadow
    cv.poly([d, c, (c[0] + 2, c[1] + 20), (d[0] + 2, d[1] + 20)], INK)                                               # the striker
    cv.poly([(d[0] + 2, d[1] + 6), (c[0] + 2, c[1] + 6), (c[0] + 2, c[1] + 14), (d[0] + 2, d[1] + 14)], BONE_D)
    cv.poly(MATCH_COVER, PINK)
    cv.poly([(a[0], a[1]), (b[0], b[1]), (b[0] + 1, b[1] + 8), (a[0] + 1, a[1] + 8)], PINK_D)
    # the flamingo: a body, an S of a neck, one leg
    fx, fy = 146, 126
    cv.poly([(fx - 22, fy - 4), (fx - 4, fy - 14), (fx + 16, fy - 8), (fx + 22, fy + 4), (fx + 4, fy + 12), (fx - 14, fy + 8)], BONE)
    cv.path([(fx + 14, fy - 6), (fx + 24, fy - 20), (fx + 16, fy - 32), (fx + 24, fy - 42)], 5, BONE)
    cv.poly([(fx + 20, fy - 46), (fx + 34, fy - 44), (fx + 38, fy - 36), (fx + 28, fy - 38)], BONE)
    cv.poly([(fx + 34, fy - 44), (fx + 38, fy - 36), (fx + 36, fy - 32)], INK)
    cv.bar((fx + 2, fy + 10), (fx + 4, fy + 34), 3, BONE)
    cv.bar((fx - 6, fy + 8), (fx - 12, fy + 22), 3, BONE)
    cv.bar((fx - 12, fy + 22), (fx - 2, fy + 28), 3, BONE)
    # loose matches
    for x, y, deg in ((430, 96, 28), (452, 150, -40), (410, 190, 80), (476, 204, 12)):
        p, q = turned([(-30, 0), (30, 0)], x, y, deg)
        cv.bar(p, q, 6, BONE)
        cv.disc(q[0], q[1], 6, col=FIRE_D)
    # his shadow across the desk
    cv.poly([(-10, H + 10), (-10, 246), (60, 226), (96, 214), (104, 196), (150, 184), (186, 196), (244, 204), (192, 214), (196, 232),
             (250, 250), (300, H + 10)], INK)
    return cv
