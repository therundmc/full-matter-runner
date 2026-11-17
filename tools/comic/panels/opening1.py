"""The opening, page 1: his last night (sleep, door)."""
from PIL import ImageChops

from .. import props
from ..anatomy import grip
from ..cast import HEAVY, SLICK, YOUNG, Figure, Light
from ..kit import INK, PINK, PINK_D, PINK_DD, VIOLET, FLOOR, NIGHT, Cv, backlit, hx, panel, window_night
from ..legacy import figure_asleep
from ..solid import Scene, Xf, rot, ypr

# ================================================================ the opening
# Each panel is painted at SC x its size in the title's px (Cinematic.js PAGES gives the same sizes). Three pages:
# his last night (asleep; the boss's men at his door), what they came for (the board, the box, the money; the petrol
# on his sofa), no loose ends (the match; the fire under his door; his eye opens).
CLOCK = (164, 150)    # page 1, panel 1: the bedside clock's digits (panel px); the game blinks its colon

SEGMENTS = {'0': 'abcdef', '1': 'bc', '2': 'abged', '3': 'abgcd', '4': 'fgbc', '5': 'afgcd', '6': 'afgedc', '7': 'abc',
            '8': 'abcdefg', '9': 'abcdfg'}


def digits(cv, x, y, s, h, col):
    """A clock's digits, seven segments each, h tall, from (x, y) their top left; ':' is two dots."""
    w, th = h * 0.5, max(3, round(h * 0.16))
    for ch in s:
        if ch == ':':
            for yy in (h * 0.28, h * 0.68):
                cv.rect(x, y + yy, x + th, y + yy + th, col)
            x += th * 3
            continue
        seg = {'a': (x, y, x + w, y + th), 'g': (x, y + (h - th) / 2, x + w, y + (h + th) / 2), 'd': (x, y + h - th, x + w, y + h),
               'f': (x, y, x + th, y + h / 2), 'e': (x, y + h / 2, x + th, y + h), 'b': (x + w - th, y, x + w, y + h / 2),
               'c': (x + w - th, y + h / 2, x + w, y + h)}
        for k in SEGMENTS[ch]:
            cv.rect(*seg[k], col)
        x += w + th * 2



@panel('sleep', (1080, 288))
def panel_sleep():
    """Page 1, panel 1. His bedroom in the dark, the bar's neon across the street through the rain on the window: him
    asleep on his side, a black shape under the sheet with the neon along its edge, his arm hanging out of the bed
    over an empty bottle; the clock on the table says 1:05; by the door his suitcase stands packed, his cap on the
    hook: he was leaving in the morning."""
    cv = Cv(1080, 288, hx('#110e20'))
    floor_y, top = 236, 190
    cv.rect(0, floor_y, 1080, 288, FLOOR)
    for x in range(-600, 1700, 64):                                             # the boards, running to the far wall
        cv.brush([(540 + (x - 540) * 0.5, floor_y), (540 + (x - 540) * 1.4, 288)], 1.5, 2.5, col=NIGHT)
    cv.brush([(0, floor_y), (1080, floor_y)], 4, 4)
    # the window over the bed, and the neon it throws down across the wall, the bed and the floor
    wx0, wy0, wx1, wy1 = 360, 8, 590, 132
    cv.fill([(wx0, wy1, 0), (wx1, wy1, 0), (wx1 + 150, floor_y + 52, 0), (wx0 + 150, floor_y + 52, 0)], hx('#1e1430'), smooth=False)
    cv.brush([((wx0 + wx1) / 2, wy1), ((wx0 + wx1) / 2 + 150, floor_y + 52)], 8, 12, col=hx('#110e20'))
    window_night(cv, wx0, wy0, wx1, wy1, seed=3)
    cv.rect(wx0 - 14, wy1 + 2, wx1 + 14, wy1 + 12, hx('#1a1428'))              # the sill
    cv.brush([(wx0 - 14, wy1 + 2), (wx1 + 14, wy1 + 2)], 2, 2, col=PINK_D)
    # the bed: its head, the mattress, the frame, in the dark, the neon along their tops
    head = [(258, 112), (276, 106), (282, floor_y, 0), (256, floor_y, 0)]
    m = cv.fill(head, hx('#16122a'))
    backlit(cv, m, PINK_D, ((0, -3), (3, 0)))
    cv.ink(head, 3)
    side = [(276, top, 0), (800, top, 0), (800, 226, 0), (276, 226, 0)]
    cv.fill(side, hx('#1a1630'), smooth=False)
    cv.fill([(wx0 + 60, top, 0), (wx1 + 110, top, 0), (wx1 + 130, 226, 0), (wx0 + 80, 226, 0)], hx('#2a1a3a'), smooth=False)
    cv.rect(276, 222, 800, 230, hx('#0e0b18'))
    for x in (284, 788):
        cv.rect(x, 230, x + 10, floor_y, INK)
    cv.ink(side, 3, smooth=False)
    pillow = [(282, 172), (300, 162), (360, 160), (372, 176), (360, top, 0), (284, top, 0)]
    m = cv.fill(pillow, hx('#2a2440'))
    backlit(cv, m, PINK_D, ((0, -3),))
    # him under the sheet, black, the neon along his back, his shoulder, his hip
    m = figure_asleep(cv, 322, top, 1.0)
    cv.im.paste(INK, (0, 0), m)
    backlit(cv, m, PINK_D, ((0, -4), (4, 0)))
    backlit(cv, m, PINK, ((1, -2),))
    # the empty bottle on its side on the floor, under his hand
    bottle = [(424, 266), (474, 262), (480, 256, 0), (500, 255, 0), (500, 262, 0), (480, 262, 0), (474, 272), (424, 276)]
    m = cv.fill(bottle, hx('#0c1a10'))
    backlit(cv, m, hx('#5ac08a'), ((0, -2), (2, 0)))
    # the bedside table, the clock on it: 1:05 in red
    table = [(130, 176, 0), (240, 176, 0), (240, floor_y, 0), (130, floor_y, 0)]
    m = cv.fill(table, hx('#141024'), smooth=False)
    backlit(cv, m, PINK_DD, ((0, -3),))
    cv.ink(table, 3, smooth=False)
    cv.brush([(136, 204), (234, 204)], 2, 2, col=INK)
    clock = [(150, 140, 0), (236, 140, 0), (238, 176, 0), (148, 176, 0)]
    cv.shape(clock, hx('#0c0a12'), 3, )
    cv.rect(156, 146, 230, 172, hx('#1a0608'))
    digits(cv, CLOCK[0] - 6, CLOCK[1], '1:05', 18, hx('#ff2a3a'))
    # his suitcase by the door, packed and strapped, and the door, his cap on its hook
    case = [(836, 160), (930, 156), (936, floor_y, 0), (830, floor_y, 0)]
    m = cv.fill(case, hx('#2a1a24'))
    cv.fill([(836, 160), (930, 156), (931, 166), (835, 170)], hx('#4a2a3a'), clip=case)
    for x in (860, 904):
        cv.rect(x, 158, x + 6, floor_y, hx('#120a10'))
    cv.ink(case, 3)
    backlit(cv, m, PINK_D, ((-3, 0), (0, -3)))
    cv.ink([(866, 156), (870, 140), (896, 139), (900, 155)], 6, closed=False)            # the handle
    cv.shape([(918, 170), (934, 172), (932, 192), (916, 190)], hx('#d8d0b4'), 2)            # its tag
    door = [(960, 34, 0), (1060, 34, 0), (1060, floor_y, 0), (960, floor_y, 0)]
    cv.fill(door, hx('#17132a'), smooth=False)
    for y0, y1 in ((52, 128), (144, 220)):
        cv.ink([(976, y0, 0), (1044, y0, 0), (1044, y1, 0), (976, y1, 0)], 3, col=hx('#0c0a16'), smooth=False)
    cv.ink(door, 7, smooth=False)
    cv.ellipse(970, 140, 5, 5, PINK_D)
    cv.brush([(1000, 44), (1000, 54)], 3, 3, col=INK)                                       # the hook, his cap on it
    cap = [(978, 74, 0), (980, 60), (994, 50), (1012, 50), (1024, 60), (1028, 66), (1046, 70, 0), (1044, 74, 0)]
    m = cv.fill(cap, INK)
    backlit(cv, m, PINK_D, ((-3, 0), (0, -3)))
    return cv

@panel('door', (1080, 282))
def panel_door():
    """Page 1, panel 2. From the dark of his flat: his front door forced, the three of them in it against the cold
    tube light of the landing, black but for the light along their edges and the window's neon on their other side,
    their shadows thrown long across his floor to us. The slick one has stepped in first, his torch held out into the
    room, its beam across the sofa; the heavy behind him square in the doorway, the crowbar that opened the door
    hanging from his fist; the young one at his shoulder, the jerrycan in his hand."""
    W, H = 1080, 282
    cv = Cv(W, H, hx('#0c0b16'))
    foot = 222                                                              # the floor at the door
    night, floor, deep = hx('#141228'), hx('#0e0e1c'), hx('#08070e')
    tube, tubeD, tubeDD = hx('#7ad8e4'), hx('#2e8a9c'), hx('#164a58')
    beam, beamD = hx('#3a3650'), hx('#24223a')
    cv.rect(0, 0, W, 210, night)
    cv.rect(0, 210, W, H, floor)
    for x in range(-400, 1500, 70):                                        # the boards, running to the door
        cv.brush([(745 + (x - 745) * 0.3, 210), (745 + (x - 745) * 1.6, 282)], 1.5, 2.5, col=deep)
    cv.brush([(0, 210), (W, 210)], 4, 4)
    # the window on the left wall, the neon of the bar across the street; its light on the floor
    window_night(cv, 50, 30, 200, 146, seed=11)
    cv.fill([(30, 282, 0), (80, 212, 0), (230, 212, 0), (200, 282, 0)], VIOLET, smooth=False)

    def room(c, clip=None):
        sofa_back = [(240, 146), (470, 142), (476, 188, 0), (236, 192, 0)]
        cv.fill(sofa_back, c[0], clip=clip)
        for x in (318, 396):
            cv.brush([(x, 148), (x + 1, 188)], 2, 2, col=c[2], clip=clip)
        cv.fill([(226, 186, 0), (488, 182, 0), (492, 222, 0), (222, 226, 0)], c[1], clip=clip, smooth=False)
        for arm in ([(214, 164), (240, 158), (246, 228, 0), (214, 230, 0)], [(470, 156), (498, 160), (500, 224, 0), (474, 226, 0)]):
            cv.fill(arm, c[0], clip=clip)
            cv.ink(arm, 3)
        cv.fill([(300, 232, 0), (440, 230, 0), (444, 242, 0), (296, 244, 0)], c[1], clip=clip, smooth=False)      # the table
        cv.fill([(310, 244, 0), (318, 244, 0), (318, 266, 0), (310, 266, 0)], c[2], clip=clip, smooth=False)
        cv.fill([(424, 242, 0), (432, 242, 0), (432, 264, 0), (424, 264, 0)], c[2], clip=clip, smooth=False)
        cv.ellipse(340, 228, 12, 4, c[2], clip=clip)                                                               # an ashtray
    room((deep, hx('#100e1c'), INK))
    sofa = cv.mask([(240, 146), (470, 142), (476, 188, 0), (236, 192, 0)])
    backlit(cv, sofa, PINK_DD, ((0, -3),))
    cv.ink([(240, 146), (470, 142), (476, 188, 0), (236, 192, 0)], 3)
    # the doorway (the game's tube flickers over 664..828 x 8..222), the landing behind it, the tube on its wall
    dx0, dx1, dy0, dy1 = 664, 828, 8, foot
    cv.rect(dx0, dy0, dx1, dy1, tube)
    cv.rect(dx0, dy0 + 158, dx1, dy1, tubeD)
    cv.rect(dx0, dy0 + 152, dx1, dy0 + 158, tubeDD)
    cv.rect(dx0, dy0, dx0 + 22, dy1, tubeD)                                # the landing's far wall, in shade
    cv.rect(760, 40, 816, 48, hx('#f0ffff'))
    cv.rect(dx0 - 10, 0, dx0, 282, deep)
    cv.rect(dx1, 0, dx1 + 10, 282, deep)
    cv.ink([(dx0, dy0, 0), (dx1, dy0, 0), (dx1, dy1, 0), (dx0, dy1, 0)], 6, smooth=False)
    # his door, swung in against the wall, its edge splintered at the lock
    door = [(dx0 - 10, dy0 - 8, 0), (604, 0, 0), (604, 254, 0), (dx0 - 10, dy1 + 4, 0)]
    cv.fill(door, hx('#1c1424'), smooth=False)
    cv.fill([(604, 0, 0), (616, 2, 0), (616, 250, 0), (604, 254, 0)], hx('#3a2a40'), smooth=False)
    cv.ink(door, 4, smooth=False)
    for k in range(6):
        y = 112 + k * 5
        cv.brush([(616, y), (628 + (k % 3) * 5, y - 3 + k)], 3, 0.5, col=hx('#d8e8f0'))
    cv.ellipse(632, 124, 4, 4, hx('#9ab0c0'))                              # the lock's tongue, torn out
    # the three of them: where they stand (body space -> panel px), how they stand
    s = 0.245
    light = Light(key=tube, fill=hx('#3a3658'), gain=1.0, deep=0.7)
    young = Figure(YOUNG, pose=dict(chest=ypr(-6, 0, 0), head=ypr(-14, 4, 0),
                                    ankle_r=(-40, -24, -6), ankle_l=(44, -24, 10), toe_r=(-0.3, 0, 1), toe_l=(0.1, 0, 1),
                                    wrist_l=(84, -362, 10), elbow_l=(0.4, 0, -1)),
                   hands=dict(l=dict(shape=grip(2.6), fwd=(0, 1, 0), palm=(-1, 0, 0))))
    heavy = Figure(HEAVY, pose=dict(head=ypr(-4, 6, 0), ankle_r=(-58, -24, 4), ankle_l=(58, -24, 0),
                                    toe_r=(-0.35, 0, 1), toe_l=(0.35, 0, 1),
                                    wrist_r=(-104, -372, 18), elbow_r=(-0.4, 0, -1)),
                   hands=dict(r=dict(shape=grip(4.0), fwd=(0, 0.3, 1), palm=(1, 0, 0))))
    torch_at = (-46, -566, 200)                                            # his torch hand, held out into the room
    slick = Figure(SLICK, pose=dict(chest=ypr(10, 0, 0), head=ypr(8, 8, 0), ankle_r=(-30, -24, 40),
                                    ankle_l=(40, -24, -36), toe_r=(-0.2, 0, 1), toe_l=(0.25, 0, 1),
                                    wrist_r=torch_at, elbow_r=(-0.6, 0.6, -0.4)),
                   hands=dict(r=dict(shape=grip(5.4), fwd=(0.05, 0.3, 1), palm=(1, 0, 0))))
    places = {'young': Xf(800, foot - 2, s * 0.96, ypr(-26)), 'heavy': Xf(744, foot + 2, s * 1.02, ypr(-8)),
              'slick': Xf(676, foot + 7, s * 1.04, ypr(-58))}
    lens = slick.hand_xf('r', places['slick'])((-46, 40, 12.5))
    # the light thrown in across the floor, and their shadows long in it
    spill = [(dx0, dy1, 0), (dx1, dy1, 0), (1000, 282, 0), (430, 282, 0)]
    cv.fill(spill, tubeDD, smooth=False)
    cv.fill([(dx0 + 10, dy1, 0), (dx1 - 10, dy1, 0), (930, 282, 0), (510, 282, 0)], hx('#1e6474'), smooth=False)
    for x0, w0, x1, w1 in [(676, 34, 520, 90), (744, 50, 744, 130), (800, 30, 900, 64)]:
        cv.fill([(x0 - w0 / 2, dy1, 0), (x0 + w0 / 2, dy1, 0), (x1 + w1 / 2, 282, 0), (x1 - w1 / 2, 282, 0)], hx('#0a1218'),
                clip=spill, smooth=False)
    # the torch's beam on the floor and the sofa, the room lit again under it
    beam_pts = [lens, (250, 282, 0), (560, 282, 0)]
    cv.fill(beam_pts, beamD, smooth=False)
    cv.fill([lens, (320, 282, 0), (500, 282, 0)], beam, smooth=False)
    room((hx('#4a3a5a'), hx('#5a4a6a'), hx('#2a2238')), clip=beam_pts)
    # the three of them, black against the light: the tube along their edges and over their heads, the window's
    # neon on their other side
    sc = Scene(W, H, light=(0.15, -0.35, -0.92), scale=s, ink=1, inner=1, shadows=False)
    young.add(sc, places['young'], light)
    heavy.add(sc, places['heavy'], light)
    slick.add(sc, places['slick'], light)
    for m, sk in props.jerrycan(light):
        sc.add(m, sk, young.hand_xf('l', places['young']).at((0, 116, 9.4)))
    for m, sk in props.crowbar(light, 250.0):
        sc.add(m, sk, heavy.hand_xf('r', places['heavy']).at((-14, 40, 11), rot((0, 0, 1), -90)))
    for m, sk in props.torch(light):
        sc.add(m, sk, slick.hand_xf('r', places['slick']).at((22, 40, 12.5), rot((0, 0, 1), 90)))
    m = sc.render(cv)
    backlit(cv, m, tube, ((2, 0), (0, -2)))
    # the window's neon only where they stand against the dark of the room, not against the landing's light
    backlit(cv, ImageChops.multiply(m, cv.mask([(0, 0, 0), (dx0, 0, 0), (dx0, H, 0), (0, H, 0)], False)), PINK_D, ((-2, 0),))
    cv.ellipse(lens[0], lens[1], 3, 3, hx('#f6f0ff'))
    return cv
