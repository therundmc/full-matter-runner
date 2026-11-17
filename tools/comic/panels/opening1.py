"""The opening, page 1: his last night (sleep, door)."""
import math

from PIL import ImageChops

from .. import painted, props
from ..anatomy import RELAXED, grip, stance
from ..cast import HERO, HEAVY, SLICK, YOUNG, Figure, Light
from ..kit import INK, PINK, PINK_D, PINK_DD, VIOLET, Cv, backlit, hx, panel, window_night
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
    """Page 1, panel 1 ("1:05 AM. HIS LAST NIGHT IN TOWN."). His bedroom in the dark, the room in big blacks: the
    bar's neon across the street comes in through the rain on the window (the game runs the rain on PANE) and lays
    its pink across the wall, the bed and him. He sleeps on his right side, his knees drawn up under the sheet, his
    left arm hanging out over the bed's edge to the floor, its hand open over an empty bottle; his face turned to
    us, eyes shut, the neon along its upturned side. The clock says 1:05 (the game blinks its colon); by the door his
    suitcase stands packed, his cap on the hook: he was leaving in the morning."""
    W, H = 1080, 288
    cv = Cv(W, H, INK)
    floor_y, top = 236, 190
    wall, wallL, floor = hx('#0a0812'), hx('#24142e'), hx('#0c0a14')
    neon, neonD = hx('#5a1e4a'), hx('#3a1434')
    cv.rect(0, 0, W, floor_y, wall)
    cv.rect(0, floor_y, W, H, floor)
    # the window over the bed, and the neon it throws down the wall, across the bed and onto the floor
    wx0, wy0, wx1, wy1 = 360, 8, 590, 132
    throw = [(wx0, wy1, 0), (wx1, wy1, 0), (wx1 + 170, H, 0), (wx0 + 120, H, 0)]
    cv.fill(throw, neonD, smooth=False)
    cv.fill([(wx0 + 20, wy1, 0), (wx1 - 20, wy1, 0), (wx1 + 120, H, 0), (wx0 + 160, H, 0)], neon, smooth=False)
    cv.brush([((wx0 + wx1) / 2, wy1), ((wx0 + wx1) / 2 + 150, H)], 7, 12, col=neonD)      # the window's cross
    window_night(cv, wx0, wy0, wx1, wy1, seed=3)
    cv.rect(wx0 - 14, wy1 + 2, wx1 + 14, wy1 + 10, INK)                                   # the sill
    cv.brush([(wx0 - 14, wy1 + 2), (wx1 + 14, wy1 + 2)], 2, 2, col=PINK_D)
    # the bed: its head, the mattress, the frame, black, the neon along their tops
    cv.fill([(258, 112), (276, 106), (282, floor_y, 0), (256, floor_y, 0)], INK)
    cv.brush([(258, 113), (276, 107)], 2, 2, col=PINK_D)
    mattress = [(276, top, 0), (804, top, 0), (804, 228, 0), (276, 228, 0)]
    cv.fill(mattress, INK, smooth=False)
    lit_side = cv.fill([(wx0 + 70, top, 0), (wx1 + 120, top, 0), (wx1 + 150, 228, 0), (wx0 + 100, 228, 0)], neonD, smooth=False)
    for x in (286, 790):
        cv.rect(x, 228, x + 10, floor_y, INK)
    pillow = [(282, 168), (298, 158), (352, 156), (380, 170), (372, top, 0), (284, top, 0)]
    cv.fill(pillow, hx('#1c1426'))
    cv.fill([(298, 158), (352, 156), (380, 170), (366, 172), (330, 166), (300, 168)], hx('#3a2440'))
    cv.ink(pillow, 2)
    # him, asleep on his right side: the body's feet origin at (ox, oy), his head to the left, his front to us
    s = 0.5
    light = Light(key=hx('#ff7aa8'), fill=hx('#4a3a70'), gain=0.95, deep=1.0)
    pose = dict(chest=ypr(0, 16, 0), head=ypr(-4, 8, 0),
                ankle_l=(30, -120, 150), ankle_r=(-26, -90, 110), knee_l=(0.1, -0.6, 1), knee_r=(-0.1, -0.6, 1),
                toe_l=(0, 1, 0.2), toe_r=(0, 1, 0.2),
                wrist_l=(-150, -548, 150), elbow_l=(0.6, 0.2, 1), wrist_r=(-40, -730, 70), elbow_r=(0, 1, 0.6))
    fig = Figure(HERO, pose=pose, bare=True, face=dict(lids=0.0, smile=(-0.1, -0.1)),
                 hands=dict(l=dict(shape=RELAXED, fwd=(-1, 0.1, 0.25), palm=(0, 0, 1))))
    place = Xf(706, 151, s, ypr(0, 0, -90))
    sc = Scene(W, H, light=(0.15, -0.9, 0.05), scale=s, ink=3, inner=2, blacks=0.08, simplify=7,
               rims=[((0.0, -1.0, -0.2), PINK, 0.8)], rim_px=2)
    fig.add(sc, place, light)
    # the bottle, on its side on the floor under his hand
    bottle = [(388, 266), (438, 262), (444, 256, 0), (464, 255, 0), (464, 262, 0), (444, 262, 0), (438, 272), (388, 276)]
    bm = cv.fill(bottle, hx('#0c1a10'))
    backlit(cv, bm, hx('#5ac08a'), ((0, -2), (2, 0)))
    sc.render(cv)
    # the sheet over him from the waist down, laid over the real shape of his hips and his drawn-up legs: its top
    # is the envelope of them (their joints and girths seen from here) a little out, then it falls to the mattress
    # and over the bed's edge; lit along its top by the neon, black underneath, folds pulled from the hip and knees
    b_ = fig.body
    spans = [(b_.pelvis_pt((0, -470, 0)), b_.root, 62), (b_.root, b_.pelvis_pt((0, -380, 0)), 74)]
    for side in ('r', 'l'):
        spans += [(b_.hip[side], b_.knee[side], 30), (b_.knee[side], b_.ankle[side], 22)]
    tops = {}
    for p0, p1, r in spans:
        for k in range(41):
            q = place(tuple(p0[i] + (p1[i] - p0[i]) * k / 40 for i in range(3)))
            for dx in range(-int(r * s), int(r * s) + 1):
                x = int(q[0]) + dx
                y = q[1] - math.sqrt(max(0.0, (r * s) ** 2 - dx * dx))
                tops[x] = min(tops.get(x, 1e9), y)
    xs = sorted(tops)
    x0, x1 = max(xs[0], int(place(b_.pelvis_pt((0, -470, 0)))[0]) + 4), xs[-1]
    smooth_top = []
    for x in range(x0, x1 + 1, 4):
        near = [tops[q] for q in range(x - 10, x + 11) if q in tops]
        smooth_top.append((x, min(top - 6, sum(near) / len(near) - 6)))
    contour = [(x0 - 8, top - 4)] + smooth_top + [(x1 + 18, top - 8), (x1 + 34, top, 0)]
    sheet = contour + [(x1 + 40, 238, 0), (x0 - 20, 238, 0), (x0 - 24, 214), (x0 - 16, top - 2)]
    sm = cv.fill(sheet, hx('#2a1c38'))
    cv.fill([(x, y + 1) for x, y in smooth_top] + [(x, y + 16) for x, y in reversed(smooth_top)], hx('#7a3a68'), clip=sm)
    cv.fill([(x0 - 40, 238, 0), (x1 + 60, 238, 0), (x1 + 60, 214, 0), (x0 - 40, 216, 0)], INK, clip=sm, smooth=False)
    # the folds: a few, bold, curved, each opening into a black hollow where it meets the mattress
    hip = min(smooth_top, key=lambda q: q[1])
    for dx, ex, bow, w in ((-4, -46, -10, 4.0), (30, 40, 12, 3.5), (96, 70, -8, 3.0), (170, 150, 10, 3.0)):
        a0 = (hip[0] + dx, dict(smooth_top).get(hip[0] + dx - (hip[0] + dx - x0) % 4, hip[1]) + 5)
        a1 = (hip[0] + ex, top + 22)
        mid = ((a0[0] + a1[0]) / 2 + bow, (a0[1] + a1[1]) / 2)
        cv.brush([a0, mid, a1], w * 0.4, w, col=INK, clip=sm)
        cv.fill([(a1[0] - w * 2, a1[1] - 2), (a1[0] + w * 2, a1[1] - 2), (a1[0] + w * 3, 240, 0), (a1[0] - w * 3, 240, 0)],
                INK, clip=sm, smooth=False)
    cv.ink(sheet, 3)
    backlit(cv, sm, PINK, ((0, -2),))
    # his hand hanging over the edge, open and slack, its fingertips just over the bottle's neck: painted by hand
    painted.stamp(cv, 'sleep_hand', 421, 219)
    # the bedside table, the clock on it: 1:05 in red (the game blinks the colon on COLON)
    table = [(130, 176, 0), (240, 176, 0), (240, floor_y, 0), (130, floor_y, 0)]
    tm = cv.fill(table, INK, smooth=False)
    backlit(cv, tm, PINK_DD, ((0, -3),))
    clock = [(150, 140, 0), (236, 140, 0), (238, 176, 0), (148, 176, 0)]
    cv.shape(clock, hx('#0c0a12'), 3)
    cv.rect(156, 146, 230, 172, hx('#1a0608'))
    digits(cv, CLOCK[0] - 6, CLOCK[1], '1:05', 18, hx('#ff2a3a'))
    cv.fill([(150, 176, 0), (238, 176, 0), (250, 190, 0), (140, 190, 0)], hx('#2a0810'), smooth=False)   # its glow
    # his suitcase by the door, packed and strapped, and the door, his cap on its hook: black, the neon on their edges
    case = [(836, 160), (930, 156), (936, floor_y, 0), (830, floor_y, 0)]
    cm = cv.fill(case, INK)
    backlit(cv, cm, PINK_D, ((-3, 0), (0, -3)))
    cv.ink([(866, 156), (870, 140), (896, 139), (900, 155)], 6, closed=False)            # the handle
    cv.shape([(918, 170), (934, 172), (932, 192), (916, 190)], hx('#8a7a88'), 2)            # its tag
    door = [(960, 34, 0), (1060, 34, 0), (1060, floor_y, 0), (960, floor_y, 0)]
    cv.fill(door, hx('#0e0b16'), smooth=False)
    for y0, y1 in ((52, 128), (144, 220)):
        cv.ink([(976, y0, 0), (1044, y0, 0), (1044, y1, 0), (976, y1, 0)], 2, col=hx('#1c1426'), smooth=False)
    cv.ink(door, 5, smooth=False)
    cv.ellipse(970, 140, 4, 4, PINK_D)
    cv.brush([(1000, 44), (1000, 54)], 3, 3, col=INK)                                       # the hook, his cap on it
    cap = [(980, 74, 0), (984, 60), (996, 52), (1012, 52), (1022, 58), (1034, 66), (1046, 70, 0), (1044, 74, 0)]
    m2 = cv.fill(cap, INK)
    backlit(cv, m2, PINK_D, ((-2, 0), (0, -2)))
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
    # the three of them, seen from low in the dark room (the camera's eye near the floor, looking up: they tower,
    # their heads drawn in): where they stand (body space -> panel px), how they stand, weight on a leg
    s = 0.245
    light = Light(key=tube, fill=hx('#3a3658'), gain=1.0, deep=1.0)
    sc = Scene(W, H, light=(0.15, -0.35, -0.92), scale=s, ink=3, inner=2, shadows=False, blacks=-0.55,
               keystone=(746.0, float(foot), 0.22))
    young_pose = stance('r', hips=8, shoulders=6, turn=-8, spread=18, step=10)
    young_pose.update(head=ypr(-16, 6, -6), wrist_l=(92, -360, 6), elbow_l=(0.5, 0, -1), wrist_r=(-60, -420, 46),
                      elbow_r=(-0.8, 0.2, -0.6))
    young = Figure(YOUNG, pose=young_pose, hands=dict(l=dict(shape=grip(2.6), fwd=(0, 1, 0), palm=(-1, 0, 0))))
    heavy_pose = stance('l', hips=4, shoulders=3, turn=4, spread=34, step=6, drop=12, lean=6)
    heavy_pose.update(head=ypr(-6, 12, 3), wrist_r=(-102, -376, 26), elbow_r=(-0.4, 0, -1), wrist_l=(96, -380, 18),
                      elbow_l=(0.4, 0, -1))
    heavy = Figure(HEAVY, pose=heavy_pose, hands=dict(r=dict(shape=grip(4.0), fwd=(0, 0.3, 1), palm=(1, 0, 0))))
    torch_at = (-46, -566, 200)                                            # his torch hand, held out into the room
    slick_pose = stance('r', hips=6, shoulders=4, turn=10, spread=10, step=-46)
    slick_pose.update(head=ypr(8, 10, 4), wrist_r=torch_at, elbow_r=(-0.6, 0.6, -0.4), wrist_l=(70, -400, 40),
                      elbow_l=(0.6, 0, -1))
    slick = Figure(SLICK, pose=slick_pose, hands=dict(r=dict(shape=grip(5.4), fwd=(0.05, 0.3, 1), palm=(1, 0, 0))))
    places = {'young': Xf(802, foot - 2, s * 0.96, ypr(-26, -5)), 'heavy': Xf(744, foot + 2, s * 1.04, ypr(-8, -5)),
              'slick': Xf(676, foot + 7, s * 1.04, ypr(-58, -5))}
    lens = (616.0, 67.0)                                                   # the painted torch's lens (painted.py)
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
    young.add(sc, places['young'], light)
    heavy.add(sc, places['heavy'], light)
    slick.add(sc, places['slick'], light)
    for m, sk in props.jerrycan(light):
        sc.add(m, sk, young.hand_xf('l', places['young']).at((0, 116, 9.4)))
    for m, sk in props.crowbar(light, 250.0):
        sc.add(m, sk, heavy.hand_xf('r', places['heavy']).at((-14, 40, 11), rot((0, 0, 1), -90)))
    m = sc.render(cv)
    backlit(cv, m, tube, ((2, 0), (0, -2)))
    # the window's neon only where they stand against the dark of the room, not against the landing's light
    backlit(cv, ImageChops.multiply(m, cv.mask([(0, 0, 0), (dx0, 0, 0), (dx0, H, 0), (0, H, 0)], False)), PINK_D, ((-2, 0),))
    # their hands, painted by hand over the cuffs the render leaves (painted.py): the slick one's fist on the torch,
    # its lens lit where the beam starts; the heavy's fists, the crowbar down from the right one against the
    # landing's light; the young one's fingers hooked under the jerrycan's handle
    painted.stamp(cv, 'door_torch', 612, 56)
    painted.stamp(cv, 'door_crowbar', 698, 112)
    painted.stamp(cv, 'door_fist', 756, 124)
    painted.stamp(cv, 'door_can', 804, 128)
    # in the foreground, close to us in the dark: the back of his armchair, black, the window's neon along its top
    chair = [(-10, 282, 0), (-10, 168), (40, 150), (120, 146), (176, 160), (184, 282, 0)]
    cm = cv.fill(chair, INK)
    backlit(cv, cm, PINK_D, ((0, -3),))
    backlit(cv, cm, PINK, ((0, -1),))
    return cv
