"""The leap's card: the alley in the rain, the next day (alley)."""
from .. import poster
from ..kit import BONE_D, BROWN, CYAN, CYAN_D, INK, NIGHT, NIGHT_L, PINK, PINK_D, TAN, Cv, bead, panel, slab

ALLEY_SIGN = (604, 134, 62, 10)   # the street's neon at the alley's far end, x, y, w, h (the game flickers it)
ALLEY_PUDDLES = ((540, 360, 90, 12), (250, 392, 120, 10), (820, 390, 70, 8))   # (cx, cy, rx, ry): the game rings them


@panel('alley', (1008, 408))
def panel_alley():
    """"THE NEXT DAY." The alley where he came down, looking along it to the street: two walls closing on a slab of
    neon, its light come back off the wet ground in broken bars; THE RUNNER sat against the left wall in a patch of
    that pink, the cap's brim over the gaiter; a fire escape and a skip on the right."""
    W, H = 1008, 408
    cv = Cv(W, H, NIGHT_L)
    vx = 648
    cv.poly([(0, -10), (596, 96), (596, 244), (0, H + 60)], NIGHT)                           # the left wall
    cv.poly([(W, -40), (700, 92), (700, 244), (W, H + 20)], NIGHT_L)                          # the right wall
    cv.poly([(596, 244), (700, 244), (W + 200, H), (-260, H)], INK)                          # the ground
    cv.poly([(0, -10), (W, -40), (700, 92), (596, 96)], INK)                                 # the sky between them
    # the street at the far end: its glow, the bar's sign
    cv.poly([(596, 96), (700, 92), (700, 244), (596, 244)], PINK_D)
    sx, sy, sw, sh = ALLEY_SIGN
    cv.poly([(sx, sy), (sx + sw, sy), (sx + sw, sy + sh), (sx, sy + sh)], PINK)
    cv.poly(slab(650, 152, 682, 160, 3, 1), CYAN)
    cv.poly([(596, 206), (700, 204), (700, 244), (596, 244)], NIGHT)
    for cx, cy, rx, ry in ALLEY_PUDDLES:
        cv.disc(cx, cy, rx, ry, NIGHT_L)
    # the neon come back off the wet ground: bars, wider as they come nearer
    for i in range(9):
        u = (i + 0.5) / 9
        y = 248 + (H - 248) * u ** 1.25
        w = 26 + 150 * u
        x = vx - 30 + (bead(i) - 0.5) * 30 * u
        cv.poly(slab(x - w * 0.5, y, x + w * 0.1, y + 6 + 12 * u, i, 1 + 2 * u), PINK if i % 3 else PINK_D)
        cv.poly(slab(x + w * 0.2, y + 2, x + w * 0.62, y + 7 + 9 * u, i + 20, 1 + 2 * u), CYAN_D if i % 2 else CYAN)
    # the pink thrown on the left wall, and him sat in it: knees up, head down
    cv.poly([(196, 150), (420, 164), (420, 330), (170, 356)], PINK_D)
    cv.poly([(238, 348), (232, 268), (250, 230), (300, 222), (318, 250), (322, 300), (352, 262), (384, 268), (396, 344), (420, 352),
             (420, 364), (236, 366)], INK)
    cv.poly([(248, 214), (262, 214), (262, 244), (246, 248)], BROWN)                          # his hair, to the collar
    cv.poly([(262, 212), (314, 212), (314, 222), (262, 222)], TAN)                           # the slit of his face
    cv.poly([(258, 221), (316, 220), (318, 238), (306, 250), (266, 252), (258, 240)], CYAN_D)   # the gaiter, up over his nose
    cv.poly([(250, 214), (249, 200), (257, 188), (280, 180), (302, 184), (314, 196), (316, 214)], INK)   # the cap: its crown
    cv.poly([(312, 203), (334, 204), (346, 210), (350, 217), (332, 213), (312, 214)], INK)               # its brim, curved
    cv.poly([(314, 214), (332, 213), (350, 217), (348, 221), (331, 217), (314, 218)], CYAN_D)
    cv.disc(280, 181, 4, col=CYAN_D)
    cv.poly([(240, 262), (250, 232), (262, 250)], INK)                                       # the collar, up
    cv.poly([(300, 252), (322, 236), (322, 262)], INK)
    cv.poly([(428, 338), (438, 318), (444, 318), (448, 362), (426, 362)], BONE_D)             # a bottle
    # the right wall: a fire escape, a skip
    for y0, y1 in ((60, 96), (150, 180)):
        cv.poly([(770, y0), (W, y0 - 26), (W, y0 - 14), (770, y0 + 10)], INK)
    for k in range(7):
        x = 790 + k * 34
        cv.bar((x, 62 - k * 3), (x - 4, 156 - k * 0.5), 5, INK)
    cv.bar((800, 66), (900, 168), 7, INK)
    cv.bar((826, 64), (926, 164), 7, INK)
    skip = [(744, 262), (916, 240), (926, 356), (760, 372)]
    cv.poly(skip, CYAN_D)
    cv.poly([(738, 250), (912, 226), (918, 244), (742, 268)], INK)
    for x in (800, 856):
        cv.bar((x, 262 - (x - 744) * 0.13), (x + 6, 366 - (x - 744) * 0.09), 5, INK)
    return cv
