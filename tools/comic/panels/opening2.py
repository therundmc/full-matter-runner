"""The opening, page 2: what they came for (pry, box, count)."""
from PIL import Image, ImageChops, ImageDraw

from .. import props
from ..anatomy import flat
from ..cast import SLICK, Figure, Light
from ..kit import INK, PINK, PINK_D, FIRE_L, Cv, T, backlit, boards, hx, panel
from ..legacy import finger, head_heavy, jaw_heavy
from ..solid import Scene, Xf, add, frame, mv, sub, unit, ypr


@panel('pry', (348, 288))
def panel_pry():
    """Page 2, panel 1. Down at the floor: the heavy on one knee, his weight on a crowbar under one of the boards;
    it comes up screaming on its nails. A torch from the left lights his face cold and the hole; the window's neon
    behind him runs along his back."""
    cv = Cv(348, 288, hx('#120c1c'))
    wood, wood2, woodD, woodL = hx('#2e2240'), hx('#281e3a'), hx('#1c1428'), hx('#6a5a8a')
    sk = dict(skin=hx('#d8c8e8'), shade=hx('#3e2652'), lit=PINK_D)
    cv.rect(0, 0, 348, 130, hx('#141022'))
    cv.rect(0, 112, 348, 130, hx('#1c1630'))                                # the skirting, the wall's foot
    cv.brush([(0, 112), (348, 112)], 2, 2, col=INK)
    boards(cv, 130, 288, 150, -200, 9, [hx('#4a3c64'), hx('#42365a')], gap=hx('#140e20'))
    pool = cv.blank()
    ImageDraw.Draw(pool).ellipse([-80, 150, 220, 300], fill=255)            # the torch's pool on the boards
    dark = Cv(348, 288)
    boards(dark, 130, 288, 150, -200, 9, [wood, wood2], gap=hx('#0e0a16'))
    cv.im.paste(dark.im, (0, 0), ImageChops.subtract(cv.mask([(0, 130, 0), (348, 130, 0), (348, 288, 0), (0, 288, 0)], False), pool))
    # the hole: a board out, the dark under it, the corner of a tin box catching the light
    hole = [(10, 236, 0), (150, 206, 0), (164, 230, 0), (18, 266, 0)]
    cv.fill(hole, INK, smooth=False)
    cv.fill([(60, 244, 0), (126, 230, 0), (132, 248, 0), (66, 262, 0)], hx('#4a5a6e'), smooth=False)
    cv.fill([(60, 244, 0), (126, 230, 0), (127, 234, 0), (61, 248, 0)], hx('#c8e0f0'), smooth=False)
    # the board coming up on its nails, splintering
    board = [(4, 230, 0), (128, 178, 0), (140, 188, 0), (12, 240, 0)]
    cv.shape(board, woodL, 3)
    cv.fill([(4, 230, 0), (12, 240, 0), (10, 246, 0), (2, 236, 0)], woodD, smooth=False)
    for x, y in ((40, 220), (100, 194)):
        cv.brush([(x, y), (x + 2, y + 18)], 2.5, 1.5, col=hx('#c8d0e0'))
    for k in range(5):
        cv.brush([(128 + k * 3, 182 + k * 2), (146 + k * 5, 172 + k * 5)], 2.5, 0.5, col=hx('#e8e0f8'))   # splinters
    # the crowbar, from his fists down under the board
    cv.brush([(214, 146), (126, 196), (118, 204), (126, 210)], 11, 9)
    cv.brush([(213, 143), (126, 193)], 3, 3, col=hx('#d02a44'))
    # him: the bulk of his jacket, black, the neon along its back; his head bent over the work
    body = [(170, 288), (176, 210), (204, 170), (256, 150), (320, 148), (348, 160), (348, 288)]
    m = cv.fill(body, INK)
    backlit(cv, m, PINK_D, ((3, 0), (0, -3)))
    head_heavy(cv, T(262, 10, 1.22, -1, -0.28), sk, 'strain')
    hm = cv.mask(T(262, 10, 1.22, -1, -0.28)(jaw_heavy()))
    backlit(cv, hm, PINK, ((3, 0),))
    cv.brush([(208, 156), (224, 166), (250, 168), (272, 160)], 3, 3, col=hx('#c8d0e0'))     # his chain
    # his arms down to the bar, the gloved fists closed on it
    for arm in ([(272, 168), (238, 166), (216, 152), (204, 170), (204, 204), (230, 222), (268, 212)],
                [(214, 200), (186, 190), (168, 186), (158, 204), (172, 226), (206, 232)]):
        backlit(cv, cv.fill(arm, INK), hx('#8a7aa8'), ((-3, 0), (0, -3)))
    for k in range(3):
        finger(cv, [(224 - k * 4, 140 + k * 9), (210 - k * 4, 142 + k * 9), (206 - k * 4, 150 + k * 9)], 10, hx('#16121e'), hx('#8a7aa8'), side=-1, band=0.3)
    for k in range(3):
        finger(cv, [(176 - k * 4, 176 + k * 9), (162 - k * 4, 178 + k * 9), (158 - k * 4, 186 + k * 9)], 10, hx('#16121e'), hx('#8a7aa8'), side=-1, band=0.3)
    return cv

@panel('box', (348, 288))
def panel_box():
    """Page 2, panel 2. From above, in a torch's cold circle: the tin box open in the hole in the floor, his six
    years in banded bundles, his passport, a bus ticket and the postcard of a beach; a gloved hand takes it all."""
    cv = Cv(348, 288, hx('#08060e'))
    circle = cv.blank()
    ImageDraw.Draw(circle).ellipse([14, 10, 340, 294], fill=255)
    # under the torch: the boards round the hole, lit; outside it, the dark
    for i in range(8):
        y = -20 + i * 46
        cv.fill([(0, y, 0), (348, y - 20, 0), (348, y + 24, 0), (0, y + 44, 0)], hx('#3a3050') if i % 2 else hx('#342a48'),
                clip=circle, smooth=False)
        cv.brush([(0, y + 44), (348, y + 24)], 3, 3, col=hx('#120c1c'), clip=circle)
    cv.fill([(0, -20, 0), (348, -20, 0), (348, 300, 0), (0, 300, 0)], hx('#0e0a18'), cut=circle, smooth=False)
    hole = [(40, 60, 0), (300, 40, 0), (318, 236, 0), (52, 258, 0)]
    cv.fill(hole, INK, smooth=False)
    # the box, its lid thrown back
    box = [(70, 84, 0), (282, 70, 0), (292, 214, 0), (78, 230, 0)]
    cv.fill(box, hx('#4a5a70'), smooth=False)
    cv.fill([(80, 92, 0), (274, 80, 0), (282, 206, 0), (86, 220, 0)], hx('#1a2234'), smooth=False)
    cv.ink(box, 3, smooth=False)
    lid = [(70, 84, 0), (282, 70, 0), (276, 50, 0), (66, 62, 0)]
    cv.fill(lid, hx('#8a9ab4'), smooth=False)
    cv.ink(lid, 3, smooth=False)
    # the bundles: green notes in a paper band
    for r in range(3):
        for c in range(4):
            if (r, c) in ((0, 3), (2, 1)):
                continue
            x, y = 90 + c * 46 - r * 1, 96 + r * 40 - c * 3
            note = [(x, y, 0), (x + 42, y - 3, 0), (x + 44, y + 34, 0), (x + 2, y + 37, 0)]
            cv.fill(note, hx('#3e8a6e'), smooth=False)
            cv.fill([(x, y, 0), (x + 42, y - 3, 0), (x + 42.5, y + 4, 0), (x + 0.5, y + 7, 0)], hx('#7ad0a8'), smooth=False)
            cv.ellipse(x + 22, y + 17, 7, 7, hx('#24604c'))
            cv.fill([(x + 17, y - 1, 0), (x + 25, y - 2, 0), (x + 28, y + 35, 0), (x + 20, y + 36, 0)], hx('#e0d8c0'), smooth=False)
            cv.ink(note, 2, smooth=False)
    # the postcard (a beach at sunset), the ticket, his passport
    dx, dy = -100, 22
    card = [(222 + dx, 88 + dy, 0), (284 + dx, 84 + dy, 0), (286 + dx, 126 + dy, 0), (224 + dx, 130 + dy, 0)]
    cv.fill(card, hx('#ff7a5a'), smooth=False)
    cv.fill([(222 + dx, 110 + dy, 0), (285 + dx, 106 + dy, 0), (286 + dx, 126 + dy, 0), (224 + dx, 130 + dy, 0)], hx('#2a6aa8'), smooth=False)
    cv.ellipse(266 + dx, 100 + dy, 7, 7, FIRE_L, clip=card)
    cv.brush([(238 + dx, 120 + dy), (242 + dx, 98 + dy)], 2.5, 1.5, col=INK)                     # a palm tree
    cv.fill([(242 + dx, 98 + dy), (230 + dx, 94 + dy), (240 + dx, 96 + dy), (252 + dx, 92 + dy), (244 + dx, 98 + dy),
             (254 + dx, 104 + dy)], INK)
    cv.ink(card, 2, smooth=False)
    cv.shape([(108, 176, 0), (150, 172, 0), (152, 186, 0), (110, 190, 0)], hx('#d8d0e0'), 2)
    cv.brush([(116, 180), (144, 177)], 2, 2, col=PINK)
    cv.shape([(186, 168, 0), (226, 165, 0), (229, 214, 0), (189, 217, 0)], hx('#1e2a5a'), 2)
    cv.ellipse(208, 184, 8, 8, hx('#c8a040'))
    cv.brush([(196, 204), (220, 202)], 2, 2, col=hx('#c8a040'))
    # the glove coming in from the top right, black, the light along its edge, a bundle in its fingers
    rim = hx('#9ab8d0')
    x, y = 222, 104
    cv.fill([(x + 4, y + 8, 0), (x + 54, y + 2, 0), (x + 58, y + 44, 0), (x + 8, y + 50, 0)], hx('#0c0a14'), smooth=False)   # its shadow
    cv.shape([(x, y, 0), (x + 50, y - 6, 0), (x + 54, y + 36, 0), (x + 4, y + 42, 0)], hx('#4e9a7e'), 2)
    cv.fill([(x + 21, y - 3, 0), (x + 30, y - 4, 0), (x + 34, y + 38, 0), (x + 25, y + 39, 0)], hx('#e0d8c0'), smooth=False)
    arm = cv.fill([(348, 0, 0), (276, 0, 0), (262, 46), (300, 64), (348, 40, 0)], INK)
    hand = cv.fill([(250, 64), (282, 44), (306, 62), (300, 92), (268, 104), (244, 96)], INK)        # the back of the hand
    backlit(cv, ImageChops.lighter(arm, hand), rim, ((-3, 0), (0, -3)))
    for k in range(4):
        finger(cv, [(256 + k * 13, 98 - k * 2), (250 + k * 13, 116 - k), (244 + k * 13, 124 - k)], 12, hx('#16121e'), rim, side=-1, band=0.25)
    finger(cv, [(250, 76), (232, 92), (226, 110)], 13, hx('#16121e'), rim, side=-1, band=0.25)        # the thumb
    return cv

@panel('count', (348, 288))
def panel_count():
    """Page 2, panel 3 ("EVERY DOLLAR. HIS WAY OUT."). The slick one, close, holds the hero's money up to his face:
    the banded brick flat on his left hand, his right hand under its far end, the right thumb riffling the top notes
    up in a fan; he looks down at it with a half smile. The lamp low in front lights his face from below (the brow
    and the forehead in shadow) and the money; the window's pink neon behind him runs along his back and his skull;
    his shadow climbs the wall behind, thrown up by the lamp."""
    W, H = 348, 288
    cv = Cv(W, H, hx('#170e26'))
    s = 1.2
    place = Xf(266, 30 + 750 * s, s, ypr(-40))
    light = Light(key=hx('#ffc890'), fill=hx('#5a4a90'), gain=1.12)
    # his left hand under the brick, palm up and tipped toward us, the fingers across to his right
    fwd_l, palm_l = unit((-0.9, 0.1, 0.42)), unit((0.05, -0.8, 0.6))
    pose = dict(chest=ypr(4, 10, 0), head=ypr(-14, 10, 4), wrist_l=(46, -612, 116), elbow_l=(1, 0.7, -0.3))
    hands = dict(l=dict(shape=flat(curl=10, thumb=(-8, 47, 21)), fwd=fwd_l, palm=palm_l))
    face = dict(smile=(0.15, 0.85), gaze=(-1.8, 2.8), lids=0.5, squint=0.45, brow_lift=(0.0, 0.6))
    Hl = Figure(SLICK, pose=pose, hands=hands).hand_frame('l')
    Wl = Figure(SLICK, pose=pose, hands=hands).body.wrist['l']
    on_brick = lambda p: add(Wl, mv(Hl, p))           # the left hand's own space -> body space
    # the right hand under the brick's far end, palm up, its fingers back along under it, its thumb up over the edge
    # on the riffled notes
    fwd_r, palm_r = mv(Hl, (0, -1, 0)), mv(Hl, (0, 0, 1))
    Hr = frame(fwd_r, palm_r)
    Wr = on_brick((2, 140, 0.5))
    inv = tuple(tuple(Hr[j][i] for j in range(3)) for i in range(3))
    thumb = mv(inv, sub(on_brick((5, 104, 36)), Wr))
    pose.update(wrist_r=Wr, elbow_r=(-0.5, 1, -0.2))
    hands['r'] = dict(shape=dict(fingers=[(-3, 2, 4, 3), (0, 2, 4, 3), (3, 3, 5, 3), (7, 4, 6, 4)],
                                 thumb=(40, 40, 0, 0), thumb_tip=thumb), fwd=fwd_r, palm=palm_r)
    fig = Figure(SLICK, pose=pose, hands=hands, face=face, t_face=0.2, hand_shadows=False,
                 head_light=(0.12, 0.92, 0.36))
    sc = Scene(W, H, light=(-0.5, -0.45, 0.75), rims=[((0.85, -0.25, -0.45), PINK, 0.62)], scale=s, rim_px=3,
               simplify=7, ink=2, inner=1)
    fig.add(sc, place, light)
    lxf = fig.hand_xf('l', place)
    m, sk = props.brick(light)
    sc.add(m, sk, lxf.at((0, 74, 7.5)), cast=False)
    m, sk = props.riffled(light, lift=17.0)
    sc.add(m, sk, lxf.at((0, 74, 19.7)), cast=False)
    # the wall: the lamp's warm light fanned up it from below, the window's neon at the right
    wall, glow, glow2 = hx('#170e26'), hx('#2e1830'), hx('#3e2034')
    cv.fill([(0, H, 0), (0, 70, 0), (150, -10, 0), (348, -10, 0), (348, 40, 0), (190, H, 0)], glow, smooth=False)
    cv.fill([(0, H, 0), (0, 150, 0), (120, 40, 0), (215, 40, 0), (110, H, 0)], glow2, smooth=False)
    cv.rect(316, 0, 348, 176, hx('#3a1232'))
    cv.rect(316, 0, 348, 4, PINK_D)
    cv.rect(328, 0, 334, 176, wall)
    cv.ink([(316, -4, 0), (352, -4, 0), (352, 176, 0), (316, 176, 0)], 4, smooth=False)
    # his shadow up the wall, thrown by the lamp below: his shape, larger, up and to the right
    probe = Cv(W, H)
    sil = sc.render(probe)
    big = sil.transform((W, H), Image.AFFINE, (1 / 1.35, 0, -40 / 1.35, 0, 1 / 1.35, 70 / 1.35), Image.NEAREST)
    cv.im.paste(wall, (0, 0), ImageChops.multiply(big, cv.mask([(0, H, 0), (0, 70, 0), (150, -10, 0), (348, -10, 0),
                                                                 (348, 40, 0), (190, H, 0)], False)))
    sc.render(cv)
    return cv
