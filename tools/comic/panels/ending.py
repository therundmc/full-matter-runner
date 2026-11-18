"""Level 1's closing page (drive, office and its phone, matchbook)."""
from .. import poster
from ..kit import BLOOD, BONE, BONE_D, BROWN, CYAN, CYAN_D, FIRE, FIRE_D, FLUO, INK, NIGHT, NIGHT_L, NIGHT_LL, PINK, PINK_D, Cv, bead, panel, slab, turned

DRIVE_VP = (790, 150)               # the road's vanishing point, under the city (the game runs the road's line from it)
DRIVE_LINE = (220, 288)             # where the road's middle line leaves the panel
DRIVE_CAR = (522, 158, 650, 224)    # the convertible's back: x0, y0 (its fins' tips), x1, y1 (the road under its wheels)
DRIVE_LIGHTS = ((528, 190), (644, 190))   # its tail lights, a blade in each fin (the game throws the spray up under them)
OFFICE_SMOKE = (204, 242)   # the dropped shotgun's muzzle: the game draws its smoke
OFFICE_DRIP = (446, 203)    # where his blood runs off the desk's edge: the game lets it drip
MATCH_COVER = [(96, 82), (360, 64), (366, 150), (102, 168)]   # the matchbook's printed face: the game letters it
HANDSET = [(84, 150), (188, 146), (190, 160), (86, 164)]     # the phone's handset (office_phone, shaken by the game)


@panel('drive', (1080, 288))
def panel_drive():
    """"HE TOOK THE BOSS'S CAR." A wide shot of the night: the wet road a black wedge running to the city far away,
    its glow a pink hump with the blocks black before it, a few windows lit; the boss's convertible small on it, seen
    from behind, roof down: long, low and bone, its two fins and the red blade of light in each, their light come
    back off the road, its chrome, its seats; him at the wheel, the cap, his coat's tails thrown up by the wind, and
    the boss's bone hat left on the back seat; street lamps getting smaller down the left; the bar's pink left
    behind on the road, near."""
    W, H = 1080, 288
    cv = Cv(W, H, NIGHT)
    (vx, vy), hz = DRIVE_VP, DRIVE_VP[1]
    road = [(vx - 3, vy), (vx + 3, vy), (560, H + 4), (-120, H + 4)]
    # the city, far off: its glow, the far districts low along the horizon, the blocks before the glow
    cv.disc(vx + 20, hz + 14, 190, 92, PINK_D)
    cv.disc(vx + 30, hz + 10, 96, 44, PINK)
    x, i = -20, 0
    while x < W + 20:                                        # the far districts
        w = 34 + bead(i + 40) * 46
        cv.poly(slab(x, hz - 8 - bead(i + 60) * 16, x + w, hz + 4, i + 80, 2), NIGHT_L)
        x, i = x + w - 4, i + 1
    lit = (BONE_D, PINK, CYAN, BONE_D, FIRE)
    for i, (x0, w, h) in enumerate(((604, 40, 34), (640, 30, 58), (676, 44, 44), (716, 26, 86), (748, 40, 62), (792, 34, 104), (830, 44, 52),
                                    (878, 30, 76), (912, 46, 40), (962, 36, 56), (1002, 50, 30))):
        cv.poly(slab(x0, hz - h, x0 + w, hz + 4, i + 7, 2), INK)
        for k in range(1 + (h > 50) + (h > 80)):             # a few windows lit
            wx, wy = x0 + 6 + bead(i * 5 + k) * (w - 18), hz - h + 8 + k * 22 + bead(i * 3 + k + 9) * 8
            cv.poly(slab(wx, wy, wx + 7, wy + 5, i + k, 0.6), lit[(i + k * 2) % len(lit)])
    # the ground: wet flats, the road
    cv.poly([(-10, hz + 2), (W + 10, hz), (W + 10, H + 4), (-10, H + 4)], NIGHT_L)
    rd = cv.poly(road, INK)
    for i in range(6):                                       # the city's glow come back off the road, far
        u = 0.08 + i * 0.07
        x, y = vx + (220 - vx) * u + 8, vy + (H - vy) * u
        cv.poly(slab(x - 6 - 60 * u, y, x + 10 + 70 * u, y + 2 + 8 * u, i + 3, 1), PINK_D, clip=rd)
    for i, (x, y, w) in enumerate(((36, 258, 150), (150, 272, 120), (10, 280, 90))):       # the bar's pink, left behind
        cv.poly(slab(x, y, x + w, y + 7, i + 50, 2), PINK if i == 0 else PINK_D, clip=rd)
    # street lamps down the left of the road, smaller and smaller
    for u in (0.76, 0.5, 0.33, 0.21, 0.13):
        x, y = vx + (-140 - vx) * u, vy + (H - vy) * u
        cv.bar((x, y), (x - 3 * u, y - 190 * u), 9 * u, INK, w1=6 * u)
        cv.bar((x - 3 * u, y - 190 * u), (x + 46 * u, y - 198 * u), 7 * u, INK)
        cv.disc(x + 46 * u, y - 190 * u, 15 * u, 11 * u, FIRE_D)
        cv.disc(x + 46 * u, y - 190 * u, 8 * u, 6 * u, FIRE)
        cv.poly(slab(x + 40 * u, y - 3 * u, x + 150 * u, y + 5 * u, int(u * 100), 1 + u), FIRE_D, clip=rd)   # its light on the road
    # the convertible, square from behind, in its lane (a side running off to the city read as a second block)
    x0, y0, x1, y1 = DRIVE_CAR
    mx, belt, sill = (x0 + x1) / 2, y0 + 20, y1 - 10         # its middle, the top of its deck, the bottom of its body
    for a, b in (((x0 + 18, belt), (x0 + 23, belt - 25)), ((x1 - 12, belt), (x1 - 15, belt - 26)), ((x0 + 22, belt - 24), (x1 - 14, belt - 26))):
        cv.bar(a, b, 3, BONE_D)                                                                               # the windshield's frame
    # him at the wheel, his coat's tails thrown up and back by the wind; the seats' roll; the boss's hat on the back seat
    hx0, hy = x0 + 36, belt - 9
    cv.poly([(hx0 - 12, hy - 1), (hx0 - 37, hy - 15), (hx0 - 54, hy - 11), (hx0 - 41, hy - 4), (hx0 - 22, hy + 8)], INK)
    cv.poly([(hx0 - 7, hy - 3), (hx0 - 26, hy - 27), (hx0 - 43, hy - 30), (hx0 - 32, hy - 17), (hx0 - 15, hy + 1)], CYAN_D)
    cv.poly(slab(x0 + 12, belt - 11, x1 - 9, belt + 3, 21, 1.5), PINK_D)
    cv.poly([(hx0 - 16, belt + 1), (hx0 - 14, hy - 3), (hx0 + 14, hy - 3), (hx0 + 17, belt + 1)], INK)        # his shoulders
    cv.poly([(hx0 - 7, hy - 2), (hx0 - 7, hy - 11), (hx0 + 7, hy - 11), (hx0 + 7, hy - 2)], BROWN)             # his hair
    cv.poly([(hx0 - 10, hy - 9), (hx0 - 10, hy - 17), (hx0 - 6, hy - 22), (hx0 - 1, hy - 23.5), (hx0 - 1, hy - 25), (hx0 + 2, hy - 25),
             (hx0 + 2, hy - 23.5), (hx0 + 6, hy - 22), (hx0 + 10, hy - 17), (hx0 + 10, hy - 9)], INK)         # the cap's dome, its button
    cv.poly([(hx0 + 9, hy - 15), (hx0 + 19, hy - 12.5), (hx0 + 18.5, hy - 10), (hx0 + 9, hy - 9.5)], INK)      # its brim, his head a little turned
    cv.poly([(hx0 + 11, hy - 11.6), (hx0 + 18.8, hy - 11.2), (hx0 + 18.5, hy - 10), (hx0 + 11, hy - 9.8)], CYAN_D)
    bx = x1 - 34
    cv.poly([(bx - 15, belt - 7), (bx + 15, belt - 9), (bx + 17, belt - 4), (bx - 16, belt - 2)], BONE)       # the hat: its brim
    cv.poly([(bx - 8, belt - 7), (bx - 7, belt - 18), (bx - 1, belt - 21), (bx + 6, belt - 20), (bx + 9, belt - 8)], BONE)
    cv.poly([(bx - 8, belt - 7), (bx - 7.6, belt - 11.5), (bx + 8.6, belt - 12.5), (bx + 9, belt - 8)], INK)   # its band
    # its back: the deck between the fins, the fins and their blades of red light, the bumper's chrome
    cv.poly([(x0 + 2, belt), (x1 - 2, belt - 1), (x1, sill), (x0, sill)], BONE_D)
    cv.poly([(x0 + 12, belt), (x1 - 12, belt - 1), (x1 - 13, belt + 5), (x0 + 13, belt + 5)], BONE)            # the deck's edge, lit
    cv.poly(slab(mx - 12, sill - 14, mx + 12, sill - 6, 4, 1), INK)                                            # its plate
    for f, fx in ((1, x0), (-1, x1)):
        cv.poly([(fx - 4 * f, sill), (fx - 5 * f, y0), (fx + 13 * f, belt + 1), (fx + 15 * f, sill)], BONE)
    for lx, ly in DRIVE_LIGHTS:
        f = 1 if lx < mx else -1
        cv.poly([(lx - 5 * f, y0 + 9), (lx + 5 * f, belt + 1), (lx + 5.5 * f, sill - 10), (lx - 5.5 * f, sill - 10)], FIRE_D)
        cv.poly([(lx - 2 * f, ly - 10), (lx + 2.5 * f, ly - 6), (lx + 2.5 * f, ly + 10), (lx - 2.5 * f, ly + 10)], FIRE)
    for wx in (x0 + 9, x1 - 9):                                                                                # the back wheels
        cv.poly(slab(wx - 10, y1 - 13, wx + 10, y1, int(wx), 1), INK)
    cv.poly(slab(x0 - 7, sill - 4, x1 + 7, sill + 5, 8, 1), INK)                                               # the bumper
    cv.poly(slab(x0 - 5, sill - 3, x1 + 5, sill + 1, 9, 0.6), BONE)
    for i in range(4):                                                                                      # their light on the wet road
        y, u = y1 + 8 + i * 13, i / 3
        for lx, _ in DRIVE_LIGHTS:
            d = (lx - (x0 + x1) / 2) * (1 + 0.4 * u) - 6 * i
            cv.poly(slab((x0 + x1) / 2 + d - 12 - 9 * u, y, (x0 + x1) / 2 + d + 12 + 9 * u, y + 4 + 3 * u, i * 2 + int(lx), 1 + u),
                    FIRE if i == 0 else FIRE_D, clip=rd)
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
