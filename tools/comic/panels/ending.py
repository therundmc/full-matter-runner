"""Level 1's closing page (drive, office and its phone, matchbook)."""
from .. import poster
from ..kit import BLOOD, BONE, BONE_D, BROWN, CYAN, CYAN_D, FIRE_D, FLUO, INK, NIGHT, NIGHT_L, NIGHT_LL, PINK, PINK_D, TAN, Cv, panel, slab, turned

DRIVE_MIRROR = (438, 44, 626, 84)   # the rear-view mirror's glass: the game draws the bar going away in it
DRIVE_GLASS = [(0, 24), (636, 30), (606, 228), (0, 222)]   # the windscreen: the game runs the rain and the wiper on it
OFFICE_SMOKE = (204, 242)   # the dropped shotgun's muzzle: the game draws its smoke
OFFICE_DRIP = (446, 203)    # where his blood runs off the desk's edge: the game lets it drip
MATCH_COVER = [(96, 82), (360, 64), (366, 150), (102, 168)]   # the matchbook's printed face: the game letters it
HANDSET = [(84, 150), (188, 146), (190, 160), (86, 164)]     # the phone's handset (office_phone, shaken by the game)


@panel('drive', (1080, 288))
def panel_drive():
    """"THE BAR GOT SMALLER IN THE MIRROR." From inside the van: the windscreen a slab of night, the road a black
    wedge to its vanishing point (the game runs its line and the street lamps past); the mirror; THE RUNNER at the
    wheel, the low cap over the closed collar, in profile against his side window."""
    W, H = 1080, 288
    cv = Cv(W, H, INK)
    glass = cv.poly(DRIVE_GLASS, NIGHT)
    vx, vy = 236, 150
    cv.poly([(0, 150), (70, 150), (76, 122), (150, 124), (154, 140), (300, 138), (306, 108), (384, 110), (388, 142), (520, 140),
             (526, 118), (640, 120), (640, 160), (0, 160)], NIGHT_L, clip=glass)              # the town, going away
    cv.poly([(0, 156), (640, 152), (640, 240), (0, 240)], NIGHT_L, clip=glass)
    cv.poly([(vx, vy), (-80, 232), (560, 236)], INK, clip=glass)                             # the road
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
    # his side window behind him, and him against it: the low cap, the closed collar, the coat
    cv.poly([(770, 14), (W, 2), (W, 176), (800, 190)], NIGHT_LL)
    cv.poly([(984, 92), (W, 86), (W, 112), (988, 120)], PINK_D)
    cv.poly([(750, H), (800, 196), (880, 168), (980, 176), (W, 220), (W, H)], INK)            # his shoulders
    cv.poly([(940, 66), (966, 96), (972, 156), (944, 160), (930, 100)], BROWN)                 # his hair, to the collar
    cv.poly([(846, 84), (940, 78), (944, 104), (842, 106)], TAN)                              # the slit of his face
    cv.poly([(832, 106), (950, 100), (958, 150), (940, 184), (860, 186), (834, 156), (820, 132)], INK)   # the funnel collar, closed over his nose
    cv.poly([(830, 104), (951, 98), (954, 113), (826, 120)], CYAN_D)                              # the gaiter, at its rim
    cv.poly([(968, 86), (966, 66), (948, 51), (912, 42), (876, 45), (852, 58), (842, 86)], INK)   # the cap: a low crown
    cv.poly([(858, 73), (802, 75), (802, 84), (846, 87)], INK)                                    # its brim: short, flat
    cv.poly([(846, 86), (940, 80), (941, 87), (845, 93)], INK)                                    # its shadow on the slit
    cv.poly([(802, 75), (812, 74.6), (812, 84.7), (802, 84)], CYAN_D)                             # the brim's petrol front edge
    cv.poly([(930, 190), (990, 124), (1012, 196)], INK)                                      # the collar, up
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
    """"THE PHONE RANG. THE BOSS WANTED NEWS." The bar's back room: the blind's bars thrown across the wall, the desk a
    black slab, CUEBALL fallen across it, the bald dome down in his blood, which runs to the desk's edge; his yellow
    shades on the floor, cracked, his shotgun dropped by them, still smoking; and the telephone, bone, the one thing
    of THE BOSS's in the room."""
    W, H = 528, 282
    cv = Cv(W, H, NIGHT)
    for i in range(7):                                                                      # the blind's bars, on a slant
        y = 20 + i * 30
        cv.poly([(-10, y + 40), (W + 10, y - 44), (W + 10, y - 30), (-10, y + 54)], PINK_D if i % 2 else NIGHT_L)
    cv.poly([(322, 52), (486, 44), (510, 190), (310, 190)], NIGHT_LL)                         # the chair
    cv.poly([(336, 66), (474, 60), (490, 180), (326, 180)], NIGHT_L)
    # the desk
    cv.poly([(26, 184), (506, 170), (W + 10, desk_edge(W + 10)), (-10, desk_edge(-10))], NIGHT_L)
    cv.poly([(-10, desk_edge(-10)), (W + 10, desk_edge(W + 10)), (W + 10, H), (-10, H)], INK)
    # CUEBALL, fallen across it: the wall of his back, an arm thrown out, the dome down, the blood
    cv.poly([(292, 194), (312, 132), (392, 100), (492, 112), (W + 10, 156), (W + 10, 202), (298, 204)], INK)
    cv.poly([(300, 174), (250, 184), (236, 190), (238, 200), (304, 199)], INK)
    blood = [(318, 188), (400, 186), (444, 196), (452, desk_edge(452) + 1), (438, desk_edge(438) + 1), (350, 204), (306, 200)]
    cv.poly(blood, BLOOD)
    cv.poly(poster.ngon(340, 174, 27, 23, 8, 10), BONE)                                      # his head, bare
    cv.poly([(322, 184), (360, 190), (352, 198), (324, 194)], BONE_D)
    # the telephone (its handset is office_phone)
    cv.poly(slab(92, 160, 184, 194, 3, 3), BONE_D)
    cv.disc(138, 178, 15, 11, BONE)
    cv.disc(138, 178, 6, 4, BONE_D)
    # on the floor before the desk: his shades, cracked, a piece off them; his shotgun
    lens = turned([(-36, -10), (36, -11), (37, 10), (-35, 11)], 96, 248, -11)
    cv.poly(lens, FLUO)
    cv.poly(turned([(-4, -12), (2, -12), (-3, -2), (5, 2), (0, 12), (-6, 12), (-1, 3), (-9, -2)], 100, 248, -11), INK)   # the crack
    cv.poly(turned([(-9, -6), (8, -8), (10, 5), (-6, 7)], 160, 264, 24), FLUO)
    mx, my = OFFICE_SMOKE
    cv.bar((mx, my), (332, 256), 10, BONE_D)                                                 # its barrel
    cv.poly([(256, 254), (312, 260), (311, 271), (255, 264)], NIGHT_LL)                       # its pump
    cv.poly([(326, 248), (396, 258), (404, 280), (386, 282), (334, 264)], NIGHT_LL)           # its stock
    return cv


@panel('office_phone', (528, 282))
def panel_office_phone():
    """The telephone's handset alone, on a clear sheet: the game shakes it on its cradle while it rings (the boss is
    calling). Bone, his ink: that is all the picture says of him."""
    cv = Cv(528, 282, None)
    office_phone(cv)
    return cv


@panel('matchbook', (528, 282))
def panel_matchbook():
    """"OFF CUEBALL'S DESK." The matchbook, pink, on the black of the desk (the game letters FLAMINGO MOTEL on it):
    a bone flamingo, and scrawled across its corner in cyan a saw-tooth mark, JITTERS' own (it is his room there);
    the striker, loose matches beside it; across the desk the shadow of the man who picks it up, his cap's brim."""
    W, H = 528, 282
    cv = Cv(W, H, NIGHT)
    for i in range(6):                                                                      # the blind's bars across the desk
        x = -60 + i * 110
        cv.poly([(x, -10), (x + 46, -10), (x + 46 - 120, H + 10), (x - 120, H + 10)], NIGHT_L)
    a, b, c, d = MATCH_COVER
    cv.poly([(a[0] + 10, a[1] + 12), (b[0] + 12, b[1] + 10), (c[0] + 14, c[1] + 30), (d[0] + 12, d[1] + 32)], INK)      # its shadow
    cv.poly([d, c, (c[0] + 2, c[1] + 20), (d[0] + 2, d[1] + 20)], INK)                                               # the striker
    cv.poly([(d[0] + 2, d[1] + 6), (c[0] + 2, c[1] + 6), (c[0] + 2, c[1] + 14), (d[0] + 2, d[1] + 14)], BONE_D)
    cv.poly(MATCH_COVER, PINK)
    cv.poly([(a[0], a[1]), (b[0], b[1]), (b[0] + 1, b[1] + 8), (a[0] + 1, a[1] + 8)], PINK_D)
    # the flamingo: a body, an S of a neck, a head and its black bill, one leg straight and one folded
    fx, fy = 132, 128
    cv.poly([(fx - 22, fy - 4), (fx - 4, fy - 14), (fx + 16, fy - 8), (fx + 22, fy + 4), (fx + 4, fy + 12), (fx - 14, fy + 8)], BONE)
    cv.path([(fx + 14, fy - 6), (fx + 24, fy - 18), (fx + 16, fy - 28), (fx + 22, fy - 36)], 6, BONE)
    cv.poly([(fx + 17, fy - 41), (fx + 30, fy - 41), (fx + 30, fy - 32), (fx + 19, fy - 32)], BONE)
    cv.poly([(fx + 30, fy - 41), (fx + 39, fy - 35), (fx + 30, fy - 30)], INK)
    cv.bar((fx + 3, fy + 9), (fx + 5, fy + 34), 4, BONE)
    cv.bar((fx - 6, fy + 7), (fx - 13, fy + 20), 4, BONE)
    cv.bar((fx - 13, fy + 20), (fx - 3, fy + 26), 4, BONE)
    # JITTERS' mark, in his cyan, across the cover's corner: his crest, scrawled
    cv.poly([(300, 90), (305, 72), (312, 83), (319, 68), (326, 81), (334, 66), (341, 79), (349, 70), (352, 86), (345, 83), (340, 90),
             (333, 80), (326, 92), (319, 80), (312, 93), (306, 84)], CYAN)
    # loose matches
    for x, y, deg in ((430, 96, 28), (452, 150, -40), (410, 190, 80), (476, 204, 12)):
        p, q = turned([(-30, 0), (30, 0)], x, y, deg)
        cv.bar(p, q, 6, BONE)
        cv.disc(q[0], q[1], 6, col=FIRE_D)
    # the shadow of the man who picks it up, across the desk's corner: his cap, its brim
    cv.poly([(-10, H + 10), (-10, 264), (34, 252), (52, 234), (80, 220), (116, 215), (148, 221), (166, 236), (170, 247), (244, 244),
             (244, 254), (176, 257), (180, 264), (196, H + 10)], INK)
    return cv
