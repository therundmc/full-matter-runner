"""The leap's card (alley)."""
from ..kit import INK, Cv, backlit, hx, panel, ripples
from ..legacy import figure_sat

ALLEY_END = (596, 690, 112, 238)   # the alley's far end, where the street is (panel px): the game flickers its neon
ALLEY_PUDDLES = ((540, 360, 90, 12), (250, 392, 120, 10), (820, 390, 70, 8))   # (cx, cy, rx, ry): the game rings them


@panel('alley', (1008, 408))
def panel_alley():
    """The leap's card ("THE NEXT DAY."): the alley in the rain at night, seen down its length from the dark; the
    street at its far end, its neon pink on the wet ground; him sat against the wall where he came down, his head on
    his chest under his cap, a bottle by his hand, nothing of him but his shape and the neon's edge on it. The game
    draws the rain falling, the rings on the puddles and the sign's flicker over it."""
    cv = Cv(1008, 408, hx('#0b0a14'))
    vx, vy = 640, 172
    o0, o1, oy0, oy1 = ALLEY_END
    pink, pinkD, pinkDD, cyan = hx('#ff3a7a'), hx('#a02458'), hx('#3e1430'), hx('#3ad8e8')
    iron = hx('#0a0910')
    left = [(0, -2, 0), (o0, oy0, 0), (o0, oy1, 0), (0, 410, 0)]
    right = [(1010, -2, 0), (o1, oy0, 0), (o1, oy1, 0), (1010, 410, 0)]
    cv.rect(0, 0, 1008, 408, hx('#0c0c18'))
    cv.fill(left, hx('#15131f'), smooth=False)
    cv.fill(right, hx('#191623'), smooth=False)
    cv.fill([(0, 410, 0), (o0, oy1, 0), (o1, oy1, 0), (1010, 410, 0)], hx('#0e0d17'), smooth=False)
    # the street beyond: the shop across it, its neon, the light it throws
    cv.rect(o0, oy0, o1, oy1, hx('#2a1430'))
    cv.rect(o0, oy0 + 74, o1, oy1, hx('#4a1c3e'))
    cv.rect(o0 + 8, oy0 + 22, o0 + 70, oy0 + 32, pink)
    cv.rect(o0 + 54, oy0 + 40, o0 + 82, oy0 + 46, cyan)
    cv.rect(o0, oy0 + 70, o1, oy0 + 74, hx('#1a0c1c'))
    # the neon grazing the walls near the far end, and the wet ground under it
    cv.fill([(o0 - 120, oy0 - 22, 0), (o0, oy0, 0), (o0, oy1, 0), (o0 - 120, oy1 + 30, 0)], hx('#221628'), clip=left, smooth=False)
    cv.fill([(o1 + 120, oy0 - 22, 0), (o1, oy0, 0), (o1, oy1, 0), (o1 + 120, oy1 + 30, 0)], hx('#2a1830'), clip=right, smooth=False)
    cv.fill([(o0, oy1, 0), (o1, oy1, 0), (860, 410, 0), (440, 410, 0)], hx('#1a1222'), smooth=False)
    # a few courses of brick where the light finds them, a drainpipe
    for k, y0 in enumerate((40, 96, 150, 206, 262, 318)):
        for x0, x1 in ((0, 150), (240, 420), (480, 590)):
            ya, yb = y0 + (vy - y0) * x0 / vx, y0 + (vy - y0) * x1 / vx
            cv.brush([(x0, ya), (x1, yb)], 2 - k * 0.15, 1, col=hx('#0e0c16'))
        for x0, x1 in ((1008, 900), (800, 700)):
            ya, yb = y0 + (vy - y0) * (1008 - x0) / (1008 - vx), y0 + (vy - y0) * (1008 - x1) / (1008 - vx)
            cv.brush([(x0, ya), (x1, yb)], 2, 1, col=hx('#100e18'))
    cv.rect(150, 20, 162, 362, hx('#0c0b12'))
    cv.brush([(161, 22), (161, 360)], 2, 2, col=pinkDD)
    for y in (90, 210, 320):
        cv.rect(146, y, 166, y + 6, hx('#0c0b12'))
    # the fire escape over the right wall: a landing, its rails, the ladder down
    cv.fill([(760, 66, 0), (900, 40, 0), (900, 56, 0), (760, 80, 0)], iron, smooth=False)
    for k in range(6):
        x = 770 + k * 24
        cv.brush([(x, 70 - (x - 760) * 0.18), (x, 22 - (x - 760) * 0.18)], 3, 3, col=iron)
    cv.brush([(760, 26), (900, 0)], 4, 4, col=iron)
    cv.brush([(762, 66), (900, 40)], 1.5, 1.5, col=pinkD)
    for x in (790, 830):
        cv.brush([(x, 74 - (x - 760) * 0.18), (x - 6, 210)], 3, 3, col=iron)
    for k in range(7):
        y = 92 + k * 18
        cv.brush([(788 - k * 0.8, y + 8), (826 - k * 0.8, y)], 2, 2, col=iron)
    # the dumpster on the right, its lid propped, its edges in the neon
    bin_ = [(742, 262, 0), (900, 246, 0), (918, 352, 0), (752, 368, 0)]
    m = cv.fill(bin_, hx('#16241e'), smooth=False)
    cv.fill([(742, 262, 0), (900, 246, 0), (906, 226, 0), (748, 240, 0)], hx('#1c2e26'), smooth=False)
    cv.ink(bin_, 4, smooth=False)
    backlit(cv, m, pinkD, ((-3, 0), (0, -3)))
    cv.brush([(748, 240), (906, 226)], 2, 2, col=pink)
    for k in range(3):
        cv.brush([(770 + k * 46, 280 - k * 4), (774 + k * 46, 350 - k * 4)], 2, 2, col=hx('#0e1814'))
    # the wet ground: the signs' light broken into ripples on the water, wider as they come toward us; the puddles
    for cx, cy, rx, ry in ALLEY_PUDDLES:
        cv.ellipse(cx, cy, rx, ry, hx('#171428'))
    ripples(cv, 636, oy1 + 4, 600, 404, 26, 90, (pinkDD, pinkD, pink), hx('#1a1222'), seed=30)
    ripples(cv, 668, oy1 + 4, 720, 404, 14, 46, (hx('#14303a'), hx('#1e6a7a'), cyan), hx('#1a1222'), seed=60)
    # him, sat against the left wall where he came down: black, the neon's edge on his cap, back, knee and boot
    m = figure_sat(cv, 236, 340, 1.3)
    cv.im.paste(INK, (0, 0), m)
    backlit(cv, m, pinkD, ((4, 0), (0, -4)))
    backlit(cv, m, pink, ((2, -2),))
    bottle = [(424, 340, 0), (424, 312), (430, 304, 0), (430, 290, 0), (437, 290, 0), (437, 304, 0), (443, 312), (443, 340, 0)]
    m = cv.fill(bottle, hx('#0c1a10'))
    backlit(cv, m, hx('#5ac08a'), ((3, 0), (0, -2)))
    return cv
