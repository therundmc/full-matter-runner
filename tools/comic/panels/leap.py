"""The leap's card: the alley in the rain, the next day (alley)."""
from .. import poster
from ..kit import BONE_D, CYAN, CYAN_D, INK, NIGHT, NIGHT_L, PINK, PINK_D, Cv, bead, panel, slab

ALLEY_SIGN = (604, 134, 62, 10)   # the street's neon at the alley's far end, x, y, w, h (the game flickers it)
ALLEY_PUDDLES = ((540, 360, 90, 12), (250, 392, 120, 10), (820, 390, 70, 8))   # (cx, cy, rx, ry): the game rings them


@panel('alley', (1008, 408))
def panel_alley():
    """"THE NEXT DAY." The alley where he came down, looking along it to the street: two walls closing on a slab of
    neon, its light come back off the wet ground in broken bars; THE RUNNER sat against the left wall in a patch of
    that pink, cap down, scarf up; a fire escape and a skip on the right."""
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
    # the neon come back off the wet ground: bars, wider as they come nearer
    for i in range(9):
        u = (i + 0.5) / 9
        y = 248 + (H - 248) * u ** 1.25
        w = 26 + 150 * u
        x = vx - 30 + (bead(i) - 0.5) * 30 * u
        cv.poly(slab(x - w * 0.5, y, x + w * 0.1, y + 5 + 12 * u, i, 2 + 3 * u), PINK if i % 3 else PINK_D)
        cv.poly(slab(x + w * 0.2, y + 2, x + w * 0.62, y + 6 + 9 * u, i + 20, 2 + 2 * u), CYAN_D if i % 2 else CYAN)
    for cx, cy, rx, ry in ALLEY_PUDDLES:
        cv.disc(cx, cy, rx, ry, NIGHT_L)
    # the pink thrown on the left wall, and him sat in it: knees up, head down
    cv.poly([(196, 150), (420, 164), (420, 330), (170, 356)], PINK_D)
    cv.poly([(238, 348), (232, 268), (250, 230), (300, 222), (318, 250), (322, 300), (352, 262), (384, 268), (396, 344), (420, 352),
             (420, 364), (236, 366)], INK)
    cv.poly(poster.ngon(280, 214, 22, 21, 7, 12), INK)                                       # his head
    cv.poly([(254, 204), (268, 190), (300, 190), (314, 204), (338, 214), (312, 212), (256, 212)], INK)   # the cap, its peak down
    cv.poly([(258, 226), (306, 222), (312, 242), (262, 250), (240, 290), (228, 286), (244, 240)], CYAN_D)   # the scarf
    cv.poly(slab(196, 318, 226, 364, 7, 2), INK)                                             # his satchel
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
