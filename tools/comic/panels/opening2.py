"""The opening, page 2: what they came for (pry, box, count, pour). The three small panels look straight down, as the
game does: the men are their signs seen from above."""
from .. import poster
from ..kit import BONE, BONE_D, CYAN, CYAN_D, INK, NIGHT, NIGHT_L, NIGHT_LL, PINK, PINK_D, Cv, panel, slab, star, turned

SLANT, PITCH = -70, 38         # his floorboards seen from above, on all three small panels
SPOUT = (540, 122)             # pour: the can's spout (the game runs the petrol down from it to the sofa)


def floor(cv, pool, light, gap):
    """His boards from above and the pool of light on them: (cx, cy, r), its ink, the ink of the gaps in it."""
    poster.boards(cv, SLANT, PITCH)
    m = cv.disc(pool[0], pool[1], pool[2], col=light)
    poster.board_gaps(cv, SLANT, PITCH, gap, m)
    return m


@panel('pry', (348, 288))
def panel_pry():
    """Page 2, panel 1 ("THEY KNEW WHERE HE HID IT."). From above, in the torch's pool: CUEBALL's shoulders and bone
    dome over the crowbar, the board coming up off the black of the hole, its nails with it; LUCKY looking on, his
    pink scarf round his neck, its end behind him."""
    W, H = 348, 288
    cv = Cv(W, H, NIGHT)
    floor(cv, (196, 176, 150), CYAN_D, NIGHT)
    hole = [(226, 72), (262, 74), (228, 236), (192, 232)]
    cv.poly(hole, INK)
    board = turned([(-17, -84), (17, -82), (18, 82), (-18, 84)], 262, 150, 4)
    cv.poly(board, BONE)
    cv.poly(turned([(10, -82), (17, -82), (18, 82), (11, 83)], 262, 150, 4), BONE_D)
    for y in (-66, 62):
        for x in (-8, 6):
            cv.disc(*turned([(x, y)], 262, 150, 4)[0], 3, col=INK)
    poster.crowbar(cv, (128, 214), (226, 148), 8)
    cv.poly(star(228, 146, 16, 5, 5, seed=2), BONE)
    cv.poly([(50, 228), (128, 196), (150, 216), (128, 290), (60, 290)], INK)                 # his arms down on the bar
    poster.above(cv, 'cueball', 92, 262, 2.3, -42)
    poster.above(cv, 'lucky', 292, 206, 2.0, 160)
    return cv


@panel('box', (348, 288))
def panel_box():
    """Page 2, panel 2 ("SIX YEARS OF RUNS FOR THE BOSS."). Straight down the hole: his tin box open, the bricks in
    rows, his passport, a postcard of a beach. Round it the three of them lean in: the dome and its yellow
    shades, the pink scarf, the crest."""
    W, H = 348, 288
    cv = Cv(W, H, NIGHT)
    floor(cv, (176, 172, 150), CYAN_D, NIGHT)
    cv.poly(slab(74, 84, 284, 252, 3, 6), INK)
    cv.poly(slab(92, 98, 268, 238, 5, 4), NIGHT_LL)                                          # the tin
    cv.poly(slab(98, 104, 262, 232, 7, 3), NIGHT_L)
    for r in range(4):
        for c in range(2):
            poster.brick(cv, 128 + c * 54 + (r % 2) * 2, 122 + r * 30, -2 + (r * 3 + c * 5) % 5, 1.0)
    cv.poly(turned([(-20, -27), (20, -27), (20, 27), (-20, 27)], 236, 138, 8), CYAN_D)       # his passport
    cv.poly(turned([(-8, -8), (8, -8), (8, 8), (-8, 8)], 236, 134, 53), BONE)
    card = turned([(-24, -17), (24, -17), (24, 17), (-24, 17)], 234, 202, -9)               # the postcard: a beach, a sun
    cm = cv.poly(card, PINK)
    cv.poly(turned([(-24, 2), (24, 2), (24, 17), (-24, 17)], 234, 202, -9), CYAN, clip=cm)
    cv.disc(240, 198, 9, col=BONE, clip=cm)
    cv.poly(turned([(-24, 6), (24, 6), (24, 17), (-24, 17)], 234, 202, -9), CYAN, clip=cm)
    poster.above(cv, 'cueball', 30, 262, 2.3, -40)
    poster.above(cv, 'lucky', 296, 158, 1.9, 192)
    poster.above(cv, 'jitters', 150, 284, 2.2, -78)
    return cv


@panel('count', (348, 288))
def panel_count():
    """Page 2, panel 3 ("EVERY DOLLAR. HIS WAY OUT."). From above: every brick laid out in rows on his boards,
    counted; his tin, emptied, at the corner; LUCKY standing over them, his pink scarf's end
    behind him, his shadow one long spike laid up the rows."""
    W, H = 348, 288
    cv = Cv(W, H, NIGHT)
    floor(cv, (176, 250, 236), CYAN, CYAN_D)
    # his tin, emptied, top right: one brick left in it
    cv.poly(turned([(-58, -40), (58, -42), (60, 40), (-56, 42)], 296, 40, -16), NIGHT_LL)
    tin = cv.poly(turned([(-50, -32), (50, -34), (52, 32), (-48, 34)], 296, 40, -16), INK)
    poster.brick(cv, 280, 52, -22, 0.9, clip=tin)
    # his shadow up the rows: one long spike
    sm = cv.mask([(112, 204), (200, 204), (214, 66), (190, 62)])
    rows = []
    for r in range(4):
        for c in range(5):
            k = r * 5 + c
            rows.append((52 + c * 58 - r * 9 + (k * 7) % 5 - 2, 92 + r * 34 + c * 3 + (k * 3) % 4 - 2, -3 + (k * 11) % 7 - 3))
    rows[13] = (rows[13][0] + 8, rows[13][1] - 4, 24)                                       # one just put down, askew
    for x, y, d in rows:
        poster.brick(cv, x, y, d)
    cv.paste(INK, sm)
    for x, y, d in rows:
        poster.brick(cv, x, y, d, clip=sm, shade=True)
    poster.above(cv, 'lucky', 156, 206, 3.0, -100)
    return cv


@panel('pour', (1080, 282))
def panel_pour():
    """Page 2, panel 4 ("THE BOSS SAYS: NO LOOSE ENDS."). Side on, against the big window and the bar's neon: JITTERS
    tips the can over the sofa, the petrol a bone thread; CUEBALL stands over him, the one who speaks. The neon lies
    on the floor in a wedge, their shadows in it."""
    W, H = 1080, 282
    cv = Cv(W, H, NIGHT)
    fl = 214
    cv.poly([(0, fl + 4), (W, fl - 2), (W, H), (0, H)], INK)
    cv.poly(slab(60, 30, 150, fl + 2, 5, 5), NIGHT_L)                                        # the door to the back room
    cv.disc(134, 128, 5, col=BONE_D)
    # the window behind them: the bar across the street, its sign
    glass = cv.poly(slab(566, 18, 880, 176, 9, 6), PINK_D)
    cv.poly(slab(600, 58, 706, 88, 11, 3), PINK, clip=glass)                                 # one slab of neon to a pane
    cv.poly(slab(756, 116, 856, 132, 13, 2), CYAN, clip=glass)
    cv.bar((722, 10), (726, 184), 9, NIGHT)
    cv.bar((556, 100), (890, 94), 9, NIGHT)
    wedge = cv.poly([(566, fl), (880, fl - 2), (1010, H + 4), (470, H + 4)], PINK_D)
    for cx, tip, w in ((604, 500, 70), (742, 760, 110)):
        cv.poly([(cx - 16, fl), (cx + 16, fl), (tip + w, H + 4), (tip - w, H + 4)], INK, clip=wedge)
    # his sofa, long and low, the stain spreading where the petrol falls
    cv.poly([(232, 132), (548, 124), (556, 178), (226, 184)], NIGHT_LL)
    for x in (336, 444):
        cv.bar((x, 126), (x + 3, 182), 5, NIGHT)
    cv.poly([(206, 176), (574, 168), (578, fl), (204, fl + 4)], NIGHT_L)
    for arm in (slab(196, 150, 232, fl + 4, 3, 3), slab(552, 144, 588, fl + 2, 7, 3)):
        cv.poly(arm, NIGHT_LL)
    cv.disc(516, 188, 50, 13, INK)                                                          # the stain
    # the two of them
    poster.man(cv, poster.cueball, 742, fl + 4, 150, face=-1)
    a = poster.man(cv, poster.jitters, 604, fl + 3, 150, 'tip', face=-1)
    deg, s = -112, 0.95
    sp = turned([(18, -3)], 0, 0, deg, s, -1)[0]
    can = (SPOUT[0] - sp[0], SPOUT[1] - sp[1])
    cv.bar(a['hand'], can, 9, INK)
    poster.jerrycan(cv, can[0], can[1], s, deg, f=-1)
    cv.bar(SPOUT, (518, 180), 4, BONE, w1=2)
    return cv
