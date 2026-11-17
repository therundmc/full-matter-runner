"""The opening, page 3: no loose ends (pour, match_dark, match, fire, wake_shut, wake)."""
import math

from ..kit import (INK, PINK, PINK_D, PINK_DD, CYAN, CYAN_D, CYAN_DD, FIRE, FIRE_D, FIRE_L, VIOLET, Cv, T, backlit,
                   hx, panel, ripples, window_night)
from ..legacy import eye34, finger, head_heavy, head_slick, jaw_heavy

FLAME = (536, 160)    # page 3, panel 1: where the match's head is (panel px); the game draws its flame there
GAP = (150, 410, 236)  # page 3, panel 2: the gap under his door, x0, x1, y (panel px); the game makes it burn


@panel('pour', (1080, 282))
def panel_pour():
    """Page 2, panel 4. His living room in the neon from the window: the heavy tips a jerrycan over the sofa, the
    petrol coming out in a rope and soaking it dark, running off onto the floor, where the window comes back in it
    broken in ripples, and away in a trail to the back of the flat. He says what the boss says (a balloon by the
    game)."""
    cv = Cv(1080, 282, hx('#110e22'))
    floor_y = 214
    cv.rect(0, floor_y, 1080, 282, hx('#0c0a18'))
    cv.brush([(0, floor_y), (1080, floor_y)], 4, 4)
    # the window behind, the bar's neon across the street; its light down the wall and the floor
    wx0, wy0, wx1, wy1 = 70, 16, 300, 172
    cv.fill([(wx0, wy1, 0), (wx1, wy1, 0), (wx1 + 90, 282, 0), (wx0 + 90, 282, 0)], VIOLET, smooth=False)
    window_night(cv, wx0, wy0, wx1, wy1, seed=21)
    # the way to the back of the flat on the right: a dark doorway, the corridor beyond
    cv.rect(980, 30, 1080, floor_y, hx('#07060c'))
    cv.rect(970, 24, 982, floor_y, hx('#1a1630'))
    cv.ink([(982, 30, 0), (1080, 30, 0)], 6, closed=False, smooth=False)
    # the sofa, long, its velvet in the neon; soaked dark where the petrol goes
    velvet, velvetD, velvetL = hx('#4a2250'), hx('#2a1232'), hx('#7a3a78')
    back = [(150, 132), (640, 124), (646, 182), (150, 190)]
    m = cv.shape(back, velvet, 4)
    cv.fill([(150, 132), (640, 124), (641, 132), (151, 140)], PINK_D, clip=back)
    for x in (300, 470):
        cv.brush([(x, 132), (x + 1, 182)], 2, 2, col=velvetD)
    seat = [(156, 182), (650, 176), (656, 210), (152, 220)]
    cv.shape(seat, velvetL, 4)
    cv.fill([(152, 210), (656, 200), (656, 210), (152, 220)], velvet, clip=seat)
    for x in (318, 486):
        cv.brush([(x, 180), (x + 4, 214)], 2, 2, col=velvetD)
    cv.shape([(150, 220, 0), (660, 208, 0), (660, 236, 0), (152, 248, 0)], velvetD, 4)
    for arm in ([(118, 150), (150, 144), (160, 160), (158, 250), (118, 254)], [(640, 138), (676, 142), (680, 238), (650, 240)]):
        cv.shape(arm, velvet, 4)
        cv.fill(arm[:2] + [(arm[1][0] + 2, arm[1][1] + 8), (arm[0][0], arm[0][1] + 8)], velvetL, clip=arm)
    wet = [(420, 150), (470, 142), (520, 150), (560, 146), (600, 160), (604, 190), (620, 212), (560, 222), (500, 214),
           (450, 222), (430, 196), (404, 176)]
    cv.fill(wet, hx('#1e0c26'))
    for a_, b_ in (((440, 160), (500, 154)), ((470, 206), (540, 202)), ((540, 176), (590, 178))):
        cv.brush([a_, b_], 2.5, 1, col=PINK)
    # the petrol off the sofa, a pool on the floor: the window comes back in it, broken; a trail to the doorway
    pool = [(300, 240), (420, 232), (560, 236), (700, 244), (760, 262), (690, 282, 0), (260, 282, 0), (240, 260)]
    pm = cv.fill(pool, hx('#140e26'))
    ripples(cv, 380, 240, 330, 284, 16, 50, (PINK_DD, PINK_D, PINK), hx('#140e26'), seed=5, n=10, breaks=6, clip=pm)
    ripples(cv, 470, 240, 470, 284, 8, 26, (CYAN_DD, CYAN_D, CYAN), hx('#140e26'), seed=9, n=10, breaks=6, clip=pm)
    cv.brush([(700, 250), (820, 236), (920, 226), (990, 216)], 22, 8, col=hx('#140e26'))
    for a_, b_ in (((730, 248), (780, 242)), ((850, 233), (880, 230)), ((940, 223), (960, 221))):
        cv.brush([a_, b_], 3, 1, col=PINK_D)
    # him, three quarters to the left, black but for his face in the neon, the jerrycan up in both gloved hands
    body = [(700, 282), (696, 220), (706, 176), (740, 150), (800, 140), (870, 154), (910, 210), (930, 282)]
    m = cv.fill(body, INK)
    backlit(cv, m, PINK_D, ((-3, 0), (0, -3)))
    backlit(cv, m, CYAN_D, ((3, 0),))
    pal = dict(skin=hx('#f094ac'), shade=hx('#3a1638'), lit=PINK_D)
    t = T(774, 6, 1.3, -1, 0.04)
    head_heavy(cv, t, pal, 'flat')
    backlit(cv, cv.mask(t(jaw_heavy())), CYAN, ((3, 0),))
    cv.brush([(736, 160), (756, 170), (786, 172), (814, 162)], 3.5, 3.5, col=hx('#c8d0e0'))       # his chain
    # the arms forward to the can
    for arm in ([(744, 162), (700, 168), (662, 148), (648, 168), (686, 202), (744, 204)],
                [(876, 176), (770, 200), (672, 186), (656, 216), (770, 238), (886, 230)]):
        backlit(cv, cv.fill(arm, INK), PINK_D, ((-3, 0), (0, -3)))
    can = [(570, 94, 0), (662, 122, 0), (646, 200, 0), (552, 172, 0)]
    cv.shape(can, hx('#c02a3a'), 4)
    cv.fill([(570, 94, 0), (662, 122, 0), (659, 134, 0), (567, 106, 0)], hx('#ff5a6a'), clip=can, smooth=False)
    cv.fill([(552, 172, 0), (646, 200, 0), (648, 188, 0), (554, 160, 0)], hx('#5a0c20'), clip=can, smooth=False)
    cv.brush([(566, 130), (646, 156)], 3, 3, col=hx('#5a0c20'))                                   # the pressed cross
    cv.brush([(612, 110), (598, 184)], 3, 3, col=hx('#5a0c20'))
    cv.shape([(586, 86, 0), (650, 106, 0), (646, 116, 0), (584, 96, 0)], hx('#7a1424'), 3)        # the handles
    cv.shape([(566, 108), (544, 110), (540, 122), (562, 124)], hx('#2a2a3a'), 3)                 # the spout
    glove_ = hx('#16121e')
    for pts in ([(670, 166), (658, 150), (650, 136)], [(674, 176), (662, 162), (654, 150)]):
        finger(cv, pts, 13, glove_, PINK_D, side=-1)
    for pts in ([(670, 204), (652, 196), (640, 188)], [(672, 214), (654, 208), (642, 202)]):
        finger(cv, pts, 13, glove_, PINK_D, side=-1)
    # the petrol: a twisting rope from the spout down onto the sofa, its splash
    for k in range(9):
        y = 118 + k * 7
        x = 540 - k * 2.2 + math.sin(k * 1.3) * 2
        cv.brush([(x, y), (x - 2, y + 7)], 5, 4, col=hx('#e0c890'))
        cv.brush([(x + 1, y + 1), (x - 1, y + 6)], 1.5, 1, col=hx('#fff8e0'))
    for a in range(7):
        ang = math.pi * (0.1 + a * 0.13)
        cv.brush([(520, 180), (520 + math.cos(ang) * 26, 180 - math.sin(ang) * 16)], 3, 1, col=hx('#f0d8a0'))
    return cv

def panel_match(lit):
    """Page 3, panel 1. Close: the one with the slicked hair strikes a match; it lights his face from below, the
    window's neon behind him along the back of his head. Behind, lost in the dark but for what the flame catches: the
    door of the back room where he sleeps, the petrol run across the floor to it, the flame coming back off it. lit
    False: before the match is struck, a shape in the dark with the neon's edge."""
    cv = Cv(1080, 282, hx('#08060e'))
    if lit:
        pal = dict(skin=hx('#ffa860'), shade=hx('#8a2a28'), deep=hx('#2a0a14'), hair=INK, shine=hx('#8a3a2a'),
                   glint=hx('#fff0b0'), white=hx('#d88a50'))
        glow, glare, wood, woodL = hx('#5a1a1c'), FIRE, hx('#24101a'), hx('#7a2c1c')
    else:
        pal = dict(skin=hx('#16131f'), shade=hx('#100d18'), deep=hx('#0c0a12'), hair=hx('#0a080e'), shine=hx('#1c1a2c'),
                   glint=hx('#2a2a44'), white=hx('#16131f'))
        glow, glare, wood, woodL = hx('#100e1a'), hx('#1e1c30'), hx('#0c0a14'), hx('#14121e')
    # the window behind him on the right: the night, the neon; its light on the wall
    window_night(cv, 940, 10, 1100, 200, seed=31)
    # the back room's door, shut; the dark under it; the petrol run across the boards to it, the flame in it
    cv.rect(150, 18, 300, 252, wood)
    for y0, y1 in ((40, 120), (140, 232)):
        cv.ink([(172, y0, 0), (278, y0, 0), (278, y1, 0), (172, y1, 0)], 3, col=woodL, smooth=False)
    cv.rect(286, 128, 294, 140, woodL)                                     # the knob
    cv.ink([(144, 12, 0), (306, 12, 0), (306, 252, 0), (144, 252, 0)], 8, smooth=False)
    cv.rect(300, 18, 306, 252, woodL)
    cv.rect(0, 252, 1080, 256, INK)
    cv.rect(150, 248, 300, 252, INK)
    if lit:
        trail = [(560, 282), (470, 270), (380, 262), (300, 256), (230, 254)]
        cv.brush(trail, 26, 8, col=hx('#1e0a10'))
        for a_, b_ in (((520, 276), (470, 271)), ((410, 266), (380, 263)), ((330, 258), (300, 257)), ((262, 255), (246, 255))):
            cv.brush([a_, b_], 3, 1, col=glare)
    # the sofa he soaked, a black bulk with the light along its arm
    sofa = [(330, 282), (336, 180), (352, 168), (372, 176), (376, 210), (440, 206), (446, 282)]
    cv.fill(sofa, INK)
    cv.brush([(338, 182), (352, 170), (370, 178)], 3, 1, col=glow)
    cv.brush([(378, 212), (438, 208)], 2, 1, col=glow)
    # his collar and shoulder: black leather, the flame on its front edges, the neon along its back
    coat = cv.fill([(600, 282), (626, 240), (680, 222), (740, 216), (840, 230), (920, 282)], INK)
    cv.fill([(600, 282), (626, 240), (646, 236), (626, 282)], glow, clip=coat)
    collar = cv.fill([(660, 282), (676, 236), (712, 226), (716, 282)], INK)
    cv.fill([(660, 282), (676, 236), (684, 236), (668, 282)], glow, clip=collar)
    backlit(cv, coat, PINK_D, ((3, 0), (0, -3)))
    t = T(712, 14, 2.3, -1)
    head_slick(cv, t, pal, 'under' if lit else 'none')
    backlit(cv, cv.mask(t([(33, 15), (27, 5), (14, -1), (-4, -3), (-22, 0), (-34, 10), (-40, 26), (-40, 44), (-34, 58),
                           (-24, 70, 0), (-10, 84), (-4, 89, 0), (-30, 130, 0)])), PINK, ((4, 0), (0, -3)))
    fx, fy = FLAME
    hand, handD = (hx('#ffa060'), hx('#8a2a28')) if lit else (hx('#16131f'), hx('#100d18'))
    # the left hand, low: the box in its fingers, the thumb over it
    box = [(456, 228), (536, 218), (540, 240), (460, 252)]
    cv.shape(box, hx('#c8903a') if lit else hx('#1a1620'), 3)
    cv.fill([(460, 246), (540, 234), (540, 240), (460, 252)], hx('#5a1a14') if lit else hx('#120e18'))
    if lit:
        cv.brush([(474, 232), (506, 228)], 4, 4, col=hx('#8a1a28'))          # the label, the striking strip
        cv.brush([(462, 249), (538, 237)], 2, 2, col=hx('#3a0a10'))
    cv.fill([(410, 282), (420, 262), (446, 254), (456, 282)], INK)          # his cuff
    palm = [(440, 282), (444, 258), (466, 248), (512, 248), (524, 262), (500, 282)]
    cv.shape(palm, hand, 3)
    cv.fill([(440, 282), (446, 268), (500, 270), (524, 262), (500, 282)], handD, clip=palm)
    for k in range(3):
        finger(cv, [(486 + k * 4, 254 + k * 9), (522 + k * 2, 250 + k * 7), (534, 244 + k * 6)], 11, hand, handD)
    finger(cv, [(478, 246), (500, 232), (520, 226)], 12, hand, handD)      # the thumb, over the box
    # the right hand, raised by his chin: the match pinched between thumb and finger, the flame up by his nose
    cv.fill([(626, 282), (618, 252), (640, 240), (668, 252), (676, 282)], INK)   # his cuff
    back = [(630, 256), (600, 236), (588, 214), (598, 202), (620, 206), (642, 226), (650, 246)]
    cv.shape(back, hand, 3)
    cv.fill([(630, 256), (612, 246), (640, 236), (650, 246)], handD, clip=back)
    for k in range(3):
        finger(cv, [(612 - k * 2, 220 + k * 10), (596 - k * 3, 224 + k * 10), (594 - k * 2, 232 + k * 9)], 11, hand, handD)
    finger(cv, [(598, 208), (580, 198), (568, 200)], 11, hand, handD)      # the index
    finger(cv, [(612, 236), (588, 218), (572, 206)], 12, hand, handD)      # the thumb
    cv.brush([(568, 202), (fx, fy)], 4, 3, col=hx('#f0d8b0') if lit else hx('#1e1a26'))
    cv.ellipse(fx, fy, 5, 6, hx('#3a0c08') if lit else hx('#160e14'))
    return cv

@panel('fire', (528, 288))
def panel_fire():
    """Page 3, panel 2. Back in his room, low on the floor: his door, shut; under it the fire comes through, its
    light thrown across the boards in ripples where the petrol ran under; his empty bottle on the floor catching it
    (the game makes the gap burn)."""
    cv = Cv(528, 288, hx('#0e0a18'))
    gx0, gx1, gy = GAP
    floor_y = gy + 4
    cv.rect(0, floor_y, 528, 288, hx('#120c16'))
    for x in range(-500, 1100, 56):
        cv.brush([(280 + (x - 280) * 0.45, floor_y), (280 + (x - 280) * 1.5, 288)], 1.5, 2.5, col=hx('#0a0610'))
    # the door and its frame, the fire showing round its edges
    cv.rect(gx0 - 26, 0, gx1 + 26, floor_y, hx('#160f22'))
    cv.rect(gx0 - 4, 0, gx1 + 4, gy, FIRE_D)                                 # the light round the door, in its frame
    door = [(gx0, 6, 0), (gx1, 6, 0), (gx1, gy, 0), (gx0, gy, 0)]
    cv.fill(door, hx('#1a1226'), smooth=False)
    for y0, y1 in ((26, 108), (126, 214)):
        cv.ink([(gx0 + 24, y0, 0), (gx1 - 24, y0, 0), (gx1 - 24, y1, 0), (gx0 + 24, y1, 0)], 4, col=hx('#0c0814'), smooth=False)
    cv.ellipse(gx1 - 22, 124, 6, 6, FIRE_D)
    cv.brush([(gx1 - 22, 118), (gx1 - 22, 130)], 2, 2, col=FIRE)
    cv.ink([(gx0 - 26, -10, 0), (gx1 + 26, -10, 0), (gx1 + 26, floor_y, 0), (gx0 - 26, floor_y, 0)], 6, smooth=False)
    cv.rect(gx0, gy, gx1, floor_y, FIRE)                                     # the gap under it
    # its light on the boards, broken where the petrol came under
    spill = [(gx0, floor_y, 0), (gx1, floor_y, 0), (gx1 + 160, 288, 0), (gx0 - 160, 288, 0)]
    cv.fill(spill, hx('#2a1018'), smooth=False)
    sm = cv.mask(spill, smooth=False)
    for i, (x0, x1, w0, w1) in enumerate(((200, 150, 20, 60), (290, 310, 30, 90), (370, 420, 14, 40))):
        ripples(cv, x0, floor_y + 2, x1, 290, w0, w1, (FIRE_D, FIRE, FIRE_L), hx('#2a1018'), seed=70 + i * 20, n=8, breaks=5, clip=sm)
    # the empty bottle on the floor by the bed's foot, the fire along it
    cv.rect(0, 120, 40, floor_y, hx('#0c0814'))
    bottle = [(30, 262), (96, 256), (102, 250, 0), (128, 250, 0), (128, 258, 0), (102, 258, 0), (96, 266), (30, 274)]
    m = cv.fill(bottle, hx('#0c1a10'))
    backlit(cv, m, FIRE, ((2, 0), (0, -2)))
    return cv

def panel_wake(open_):
    """Page 3, panel 3. So close the panel is his eye: him asleep on his side, his cheek in the pillow, in the dark;
    the fire coming in under his door lights the planes of his face orange from below, the window's neon edges his
    hair; his eye shut, then open on it (open_), the flame in it."""
    cv = Cv(528, 288)
    pal = dict(skin=hx('#c4542e'), shade=hx('#2a1020'), stubble=hx('#94381e'), white=hx('#e8c0a0'), iris=hx('#3a160e'),
               glint=FIRE_L, deep=INK)
    cv.rect(0, 0, 528, 288, pal['shade'])
    # the planes the fire finds: the cheekbone, the cheek down to the pillow, the side of the nose
    cv.fill([(110, 200), (200, 186), (300, 190), (360, 230), (380, 288, 0), (90, 288, 0)], pal['skin'])
    cv.fill([(150, 230), (240, 238), (320, 234), (360, 288, 0), (140, 288, 0)], pal['stubble'])
    cv.fill([(350, 30), (372, 100), (400, 170), (424, 230), (440, 288, 0), (470, 288, 0), (440, 180), (404, 60), (380, 0, 0),
             (352, 0, 0)], pal['skin'])
    cv.brush([(346, 10), (366, 90), (390, 160), (418, 240), (432, 288)], 3, 6)                       # the bridge of the nose
    # the far eye, past the nose, in the dark; the neon from the window along the far side of his face
    cv.brush([(452, 92), (474, 88), (496, 94)], 2, 1.5, mid=4)
    cv.fill([(510, 0, 0), (528, 0, 0), (528, 288, 0), (516, 288, 0), (500, 120)], PINK_D)
    # the near eye
    eye34(cv, T(0, 0, 1.0), 236, 136, 120, pal, look=0.7, open_=open_ * 0.85, glint=FIRE_L if open_ else None)
    cv.brush([(170, 176), (236, 186), (300, 178)], 0.5, 0.5, mid=3, col=INK)                         # the bag under it
    # the brow, and his hair fallen over it, black, the neon along its strands
    cv.brush([(150, 92), (210, 70), (280, 68), (330, 84)], 6, 4, mid=16, col=INK)
    hair = cv.fill([(0, 0, 0), (528, 0, 0), (528, 16, 0), (470, 26), (400, 14), (340, 30), (280, 16), (220, 34), (160, 18),
                    (100, 40), (50, 24), (0, 36, 0)], INK)
    for x0, x1, y1, w in ((60, 96, 80, 10), (150, 172, 58, 8), (236, 262, 54, 9), (300, 330, 66, 7), (400, 412, 44, 7)):
        cv.brush([(x0, 0), (x0 + (x1 - x0) * 0.5, y1 * 0.6), (x1, y1)], w, 1, col=INK)
    backlit(cv, hair, PINK_D, ((0, 3),))
    for x0, x1, y1 in ((63, 99, 50), (153, 175, 36), (239, 265, 34)):
        cv.brush([(x0, 0), (x0 + (x1 - x0) * 0.5, y1)], 2, 0.5, col=PINK_D)
    # the pillow pressing into his cheek, in the dark, its edge in the fire
    pillow = [(0, 196), (70, 184), (150, 214), (230, 236), (300, 288, 0), (0, 288, 0)]
    m = cv.fill(pillow, hx('#20162c'))
    cv.ink(pillow, 4)
    backlit(cv, m, FIRE_D, ((0, -3),))
    cv.brush([(40, 220), (100, 214), (150, 236)], 2, 1, col=hx('#120c1a'))
    return cv



panel('match_dark', (1080, 282))(lambda: panel_match(False))
panel('match', (1080, 282))(lambda: panel_match(True))
panel('wake_shut', (528, 288))(lambda: panel_wake(False))
panel('wake', (528, 288))(lambda: panel_wake(True))
