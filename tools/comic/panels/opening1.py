"""The opening, page 1: his last night (sleep, door)."""
from .. import poster
from ..kit import BONE, BONE_D, CYAN, CYAN_D, INK, NIGHT, NIGHT_L, NIGHT_LL, PINK, PINK_D, Cv, digits, hx, panel, slab, star

# Each panel is painted at SC x its size in the title's px (Cinematic.js PAGES gives the same sizes). What the game
# draws over a still is at fixed points, named here and in ui/cine/Panels.js: move one, move the other.
PANE = (360, 8, 590, 132)      # sleep: his window's glass (the game runs the rain on it)
CLOCK = (156, 146, 230, 172)   # sleep: the clock's face, its ground #1a0608 (the game blinks the colon at 172, 154)
DOORWAY = (670, 0, 910, 196)   # door: the doorway (the game's tube flickers over that box)


@panel('sleep', (1080, 288))
def panel_sleep():
    """Page 1, panel 1 ("1:05 AM. HIS LAST NIGHT IN TOWN."). His bedroom, side on: the bar's neon comes in through
    the window in one pink wedge (a cyan sliver along it) across the bed, where he is a range of hills under the
    sheet, a black head on a bone pillow. The clock says 1:05; by the door his suitcase stands packed, his cap on
    the hook."""
    W, H = 1080, 288
    cv = Cv(W, H, NIGHT)
    cv.poly([(0, 238), (W, 232), (W, H), (0, H)], INK)                                       # the floor
    x0, y0, x1, y1 = PANE
    poster.window(cv, x0, y0, x1, y1, seed=3)
    wedge = cv.poly([(x0, y1), (x1, y1), (850, H), (500, H)], PINK_D)
    cv.poly([(x1 - 40, y1), (x1, y1), (850, H), (770, H)], CYAN_D)
    # the bed: a black frame, the sheet over him lit where the wedge crosses it
    cv.poly(slab(246, 104, 268, 240, 5, 2), INK)
    cv.poly([(262, 196), (744, 190), (748, 222), (262, 226)], INK)
    for x in (280, 722):
        cv.poly(slab(x, 222, x + 14, 240, x, 1), INK)
    cv.poly([(270, 172), (340, 166), (346, 194), (272, 198)], BONE_D)                        # his pillow
    hills = [(326, 200), (344, 176), (386, 152), (440, 142), (486, 160), (540, 150), (600, 128), (650, 150), (712, 184), (744, 198)]
    cv.poly(hills, NIGHT_LL)
    cv.poly(hills, PINK, clip=wedge)
    cv.poly([(600, 128), (650, 150), (712, 184), (744, 198), (620, 198)], PINK_D, clip=wedge)   # the far side of his knees
    cv.poly(poster.ngon(318, 174, 17, 15, 7, 10), INK)                                       # his head, turned to the wall
    cv.poly([(326, 162), (346, 170), (340, 186)], INK)
    # the clock on the night table
    cv.poly(slab(128, 180, 244, 240, 11, 3), NIGHT_L)
    cv.poly(slab(148, 138, 238, 180, 13, 2), INK)
    cx0, cy0, cx1, cy1 = CLOCK
    cv.poly([(cx0, cy0), (cx1, cy0), (cx1, cy1), (cx0, cy1)], hx('#1a0608'))
    digits(cv, cx0 + 2, cy0 + 4, '1:05', 18, hx('#ff2a3a'))
    # the door, his cap on its hook, the suitcase packed by it
    cv.poly(slab(962, 26, 1056, 236, 21, 5), NIGHT_L)
    cv.disc(978, 136, 5, col=PINK_D)
    cv.poly([(990, 52), (1004, 40), (1030, 40), (1042, 54), (1060, 58), (1042, 62), (990, 62)], INK)
    case = slab(826, 150, 944, 236, 31, 3)
    cv.poly(case, BONE_D)
    for x in (848, 908):
        cv.poly(slab(x, 148, x + 12, 238, x, 1), INK)
    cv.path([(866, 150), (868, 136), (902, 136), (904, 150)], 6, INK)
    cv.poly([(826, 236), (944, 236), (1000, 262), (860, 264)], NIGHT)                         # its shadow
    return cv


@panel('door', (1080, 282))
def panel_door():
    """Page 1, panel 2 ("THE BOSS'S MEN LET THEMSELVES IN."). His front door thrown open, its lock a burst of
    splinters; the three of them cut out against the landing's tube: LUCKY in first, his torch into the room,
    CUEBALL filling the doorway, the crowbar hanging from his fist, JITTERS at his elbow with the can. The light
    lies on the floor in one wedge, their shadows three spikes in it."""
    W, H = 1080, 282
    cv = Cv(W, H, NIGHT)
    dx0, dy0, dx1, fl = DOORWAY
    cv.poly([(0, fl + 6), (W, fl - 4), (W, H), (0, H)], INK)
    poster.window(cv, 40, 54, 152, 150, seed=7)
    # the doorway: the tube's cyan, the landing's wall in shade to the right, the tube itself
    cv.poly([(dx0, dy0 - 6), (dx1, dy0 - 6), (dx1, fl), (dx0, fl + 3)], CYAN)
    cv.poly([(852, -6), (dx1, -6), (dx1, fl), (846, fl + 1)], CYAN_D)
    cv.poly(slab(716, 20, 800, 30, 3, 1.5), BONE)
    # his door, thrown open: a lighter slab, its lock a burst
    cv.poly([(dx0, -6), (604, -6), (592, 228), (dx0 - 2, fl + 3)], NIGHT_L)
    cv.poly(star(634, 134, 34, 11, 7, seed=4, turn=8, squash=0.85), BONE)
    cv.disc(634, 134, 6, col=INK)
    # the light on his floor, their shadows in it
    wedge = cv.poly([(dx0, fl + 3), (dx1, fl), (1040, H + 4), (280, H + 4)], CYAN_D)
    for cx, tip, w in ((692, 430, 44), (776, 700, 110), (884, 1000, 52)):
        cv.poly([(cx - 16, fl), (cx + 16, fl), (tip + w, H + 4), (tip - w, H + 4)], INK, clip=wedge)
    # the torch's beam down into the room, the sofa black across it
    beam = cv.poly([(646, 68), (650, 82), (470, H + 4), (300, H + 4)], NIGHT_LL)
    cv.poly([(214, 168), (236, 150), (480, 146), (506, 164), (510, 214), (214, 218)], INK)
    cv.poly([(236, 150), (480, 146), (486, 170), (232, 174)], NIGHT_LL, clip=beam)
    # the three of them
    a = poster.man(cv, poster.cueball, 776, fl + 3, 164, 'bar')
    poster.crowbar(cv, (a['hand'][0], a['hand'][1] - 4), (a['hand'][0] + 6, fl - 14))
    a = poster.man(cv, poster.jitters, 884, fl + 2, 150, face=-1)
    poster.jerrycan(cv, a['hand_b'][0] + 2, a['hand_b'][1] + 2, 0.8)
    a = poster.man(cv, poster.lucky, 692, fl + 5, 128, 'reach', face=-1)
    poster.torch(cv, a['hand'], face=-1)
    return cv
