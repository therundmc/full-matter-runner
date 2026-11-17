"""Level 1's ending (drive, office, office_phone, matchbook)."""
import math

from PIL import Image, ImageChops, ImageDraw

from ..kit import (INK, PINK, PINK_D, PINK_DD, CYAN, CYAN_DD, FIRE, FIRE_D, FIRE_L, Cv, T, backlit, hx, panel,
                   rain_beads, ripples, silhouette)
from ..legacy import finger, head_boss, head_hero_side

DRIVE_MIRROR = (438, 44, 626, 84)   # the rear-view mirror's glass (panel px): the game draws the bar going away in it
DRIVE_GLASS = [(0, 24), (636, 30), (606, 228), (0, 222)]   # the windscreen: the game runs the rain and the wiper on it

@panel('drive', (1080, 288))
def panel_drive():
    """Level 1's ending, panel 1. In the van's cab, from beside him: he drives, his eyes under his cap's peak on the
    road; the windscreen in front of him, its rain and the street lamps; the rear-view mirror on it, where the game
    draws the bar's neon getting smaller (and the rain running down, the wiper going)."""
    cv = Cv(1080, 288, hx('#09080f'))
    glass = [(x, y, 0) for x, y in DRIVE_GLASS]
    gm = cv.mask(glass, smooth=False)
    vx, vy = 250, 142
    # the night through the windscreen: the sky, the street's buildings, the road running away
    cv.fill(glass, hx('#1a1438'), smooth=False)
    cv.fill([(0, 100, 0), (60, 98, 0), (60, 80, 0), (130, 80, 0), (130, 108, 0), (190, 108, 0), (190, 120, 0), (310, 122, 0),
             (310, 112, 0), (380, 112, 0), (380, 94, 0), (470, 94, 0), (470, 70, 0), (640, 66, 0), (640, 150, 0),
             (0, 150, 0)], hx('#0c0c20'), clip=gm, smooth=False)
    for i, (x, y) in enumerate(((84, 104), (100, 90), (148, 114), (330, 118), (356, 120), (402, 102), (420, 116), (488, 84),
                                (510, 100), (552, 80), (590, 94), (40, 112))):
        cv.rect(x, y, x + 4, y + 5, hx('#3a2c3a') if i % 3 else hx('#5a3a2a'), clip=gm)       # windows still lit, far
    cv.fill([(vx, vy, 0), (-260, 230, 0), (760, 230, 0)], hx('#141228'), clip=gm, smooth=False)
    for k in range(6):                                                       # the line down its middle
        u0, u1 = (k / 6) ** 1.6, ((k + 0.45) / 6) ** 1.6
        cv.brush([(vx + 40 * u0, vy + 88 * u0), (vx + 40 * u1, vy + 88 * u1)], 1 + 4 * u0, 1 + 4 * u1, col=hx('#6a6252'), clip=gm)
    cv.ellipse(vx - 8, vy - 2, 2.5, 2, hx('#e83a30'), clip=gm)               # a car far ahead, its rear lights
    cv.ellipse(vx + 4, vy - 2, 2.5, 2, hx('#e83a30'), clip=gm)
    # the street lamps on the right going by, their light on the wet road
    for s in (0.12, 0.22, 0.4, 0.78):
        x, top, base = vx + 420 * s, vy - 126 * s, vy + 80 * s
        cv.brush([(x, base), (x, top)], 1 + 7 * s, 1 + 6 * s, col=hx('#07060c'), clip=gm)
        cv.brush([(x, top), (x - 40 * s, top - 6 * s)], 1 + 5 * s, 1 + 4 * s, col=hx('#07060c'), clip=gm)
        lx, ly = x - 44 * s, top - 4 * s
        cv.ellipse(lx, ly + 10 * s, 30 * s + 4, 16 * s + 3, hx('#3a2a3a'), clip=gm)
        cv.ellipse(lx, ly, 12 * s + 2, 5 * s + 2, hx('#f0a040'), clip=gm)
        cv.ellipse(lx, ly, 7 * s + 1, 3 * s + 1, hx('#fff0c0'), clip=gm)
        ripples(cv, x - 20 * s, base - 4 * s, x - 14 * s, base + 40 * s + 4, 2 + 3 * s, 6 + 20 * s, (hx('#3e2430'), hx('#a8542a'), FIRE),
                hx('#141228'), seed=int(s * 100), n=8, breaks=5, clip=gm)                          # its light on the wet road
    rain_beads(cv, 4, 30, 600, 220, 26, (hx('#0e0e2a'), hx('#3e3e6a')), seed=11, clip=gm)
    # the rear-view mirror, the road behind in it
    mx0, my0, mx1, my1 = DRIVE_MIRROR
    cv.brush([(532, 20), (532, 38)], 8, 6, col=hx('#16141c'))
    mirror = [(mx0 - 12, my0 - 10, 0), (mx1 + 12, my0 - 6, 0), (mx1 + 10, my1 + 10, 0), (mx0 - 10, my1 + 6, 0)]
    cv.fill(mirror, hx('#1c1a24'), smooth=False)
    cv.rect(mx0, my0, mx1, my1, hx('#0e0c1c'))
    cv.fill([((mx0 + mx1) / 2, my0 + 18, 0), (mx0, my1, 0), (mx1, my1, 0)], hx('#16142a'), smooth=False)
    cv.ink(mirror, 4, smooth=False)
    cv.brush([(mx0 - 8, my1 + 6), (mx1 + 8, my1 + 10)], 2, 2, col=hx('#4a3a3a'))
    # the frame: the roof, the pillar, the side window behind him, the dashboard and its dials
    cv.fill([(0, 0, 0), (1080, 0, 0), (1080, 24, 0), (636, 30, 0), (0, 24, 0)], hx('#08070d'), smooth=False)
    cv.ink([(0, 24, 0), (636, 30, 0)], 5, closed=False, smooth=False)
    cv.fill([(676, 26, 0), (1080, 24, 0), (1080, 200, 0), (660, 236, 0)], hx('#0f0f1e'), smooth=False)
    rain_beads(cv, 690, 40, 1076, 190, 10, (hx('#0b0b18'), hx('#26263e')), seed=200)
    pillar = [(624, 28, 0), (676, 26, 0), (652, 236, 0), (598, 232, 0)]
    cv.fill(pillar, hx('#0c0b12'), smooth=False)
    cv.brush([(626, 30), (600, 230)], 2, 2, col=hx('#2a2434'))
    cv.ink(pillar, 4, smooth=False)
    dash = [(0, 222, 0), (606, 228, 0), (700, 238, 0), (740, 288, 0), (0, 288, 0)]
    cv.fill(dash, hx('#0b0a12'), smooth=False)
    cv.brush([(0, 223), (606, 229), (700, 239)], 3, 3, col=hx('#2c2a3c'))
    for cx in (500, 548):
        cv.ellipse(cx, 256, 17, 12, CYAN_DD)
        cv.ellipse(cx, 256, 13, 9, hx('#16404c'))
        cv.brush([(cx, 258), (cx - 8, 250)], 2, 1, col=CYAN)
    # the wheel, seen nearly edge on, its column into the dash
    rim = [(628 + 16 * math.cos(a) * math.cos(0.32) - 66 * math.sin(a) * math.sin(0.32),
            200 + 16 * math.cos(a) * math.sin(0.32) + 66 * math.sin(a) * math.cos(0.32)) for a in [k * math.pi / 12 for k in range(24)]]
    cv.brush([(628, 200), (560, 236)], 12, 14, col=INK)
    cv.ink(rim, 14)
    cv.ink(rim, 5, col=hx('#2e2440'))
    cv.ellipse(628, 200, 8, 10, hx('#16141c'))
    # him, black: his coat's shoulder, his head under the cap, his arm out to the wheel, his hand closed on its rim;
    # the street lamps ahead along his profile and his arm, the bar's neon behind him along his back
    pal = dict(skin=INK, shade=INK, stubble=INK, stubbleD=INK, hair=INK, hairL=INK, white=INK, glint=INK, shine=INK, cap=INK,
               capL=INK, coat=INK, coatL=INK, lining=INK, knit=INK, knitL=INK, knitD=INK)

    def him(c):
        c.fill([(1080, 288, 0), (708, 288, 0), (716, 236), (750, 192), (800, 166), (870, 156), (960, 162), (1040, 186),
                (1080, 196, 0)], INK)
        head_hero_side(c, T(842, 14, 1.24, -1), pal)
        c.fill([(840, 196), (780, 226), (700, 198), (650, 158), (668, 138), (712, 160), (790, 178), (836, 172)], INK)
        c.fill([(612, 150), (626, 132), (650, 130), (664, 142), (660, 162), (636, 170), (618, 166)], INK)
    m = silhouette(1080, 288, him)
    cv.im.paste(INK, (0, 0), m)
    backlit(cv, m, FIRE_D, ((-4, 0), (0, -3)))
    backlit(cv, m, FIRE, ((0, -2),))
    backlit(cv, m, PINK_D, ((3, 0),))
    cv.ellipse(*T(842, 14, 1.24, -1).pt(31.4, 46.6), 2.5, 2.5, FIRE_L)          # his eye, under the peak
    return cv


OFFICE_SMOKE = (214, 177)   # the cigar's lit end in the ashtray (panel px): the game draws its smoke
OFFICE_DRIP = (446, 203)    # where his blood runs off the desk's edge: the game lets it drip

@panel('office', (528, 282))
def panel_office():
    """Level 1's ending, panel 2. Behind him: the boss's back room in the dark, the bar's neon coming in through the
    blinds in stripes across everything. The boss fallen forward out of his armchair over his desk, his head on its
    side on the wood by the phone, his eyes shut, his blood spread to the desk's edge; the cigar still burning in the
    ashtray, a glass knocked over, rounds in the wall and the desk; the phone ringing (its receiver is office_phone,
    rattled by the game)."""
    cv = Cv(528, 282, hx('#140a1a'))
    suit, suitD = hx('#2e2440'), hx('#1a1428')
    cv.rect(0, 0, 528, 282, hx('#1a0e22'))
    cv.fill([(0, 0, 0), (528, 0, 0), (528, 120, 0), (0, 150, 0)], hx('#150b1c'), smooth=False)
    # the window on the left, its blinds down, the neon outside showing between the slats
    cv.rect(0, 14, 92, 160, hx('#4a0e2e'))
    cv.rect(0, 70, 92, 92, PINK)
    for y in range(16, 160, 12):
        cv.rect(0, y, 92, y + 7, hx('#1c0c1a'))
    cv.ink([(-6, 12, 0), (94, 12, 0), (94, 162, 0), (-6, 162, 0)], 6, smooth=False)
    # a framed picture knocked crooked, two rounds in the wall by it
    frame = [(130, 50, 0), (204, 44, 0), (210, 100, 0), (136, 108, 0)]
    cv.fill(frame, hx('#2a1a2a'), smooth=False)
    cv.ink(frame, 3, smooth=False)
    cv.fill([(138, 56, 0), (198, 51, 0), (202, 94, 0), (142, 100, 0)], hx('#1a1a3a'), smooth=False)
    cv.fill([(142, 84, 0), (200, 79, 0), (202, 94, 0), (142, 100, 0)], hx('#1a3040'), smooth=False)
    cv.ellipse(186, 64, 6, 6, FIRE)
    for x, y in ((228, 84), (254, 66)):
        cv.ellipse(x, y, 4, 4, INK)
        for a in range(5):
            ang = a * 1.3 + x
            cv.brush([(x + math.cos(ang) * 4, y + math.sin(ang) * 4), (x + math.cos(ang) * 10, y + math.sin(ang) * 10)], 1.5, 0.5,
                     col=hx('#0a0410'))
    # the armchair, its high back, the leather and its buttons
    chair = [(250, 200, 0), (256, 70), (290, 40), (380, 34), (440, 46), (468, 80), (474, 200, 0)]
    m = cv.fill(chair, hx('#2a0a1a'))
    cv.fill([(256, 70), (290, 40), (380, 34), (384, 46), (300, 54), (270, 80), (268, 200, 0), (250, 200, 0)], hx('#4a1428'), clip=m)
    for x in (300, 350, 400):
        cv.ellipse(x, 66 + (x - 300) * 0.02, 3, 3, hx('#14040c'), clip=m)
    cv.ink(chair, 4)
    # the desk across the front, rounds in its front
    top = [(0, 172, 0), (528, 164, 0), (528, 198, 0), (0, 208, 0)]
    cv.fill(top, hx('#2a1620'), smooth=False)
    cv.fill([(0, 208, 0), (528, 198, 0), (528, 282, 0), (0, 282, 0)], hx('#140a12'), smooth=False)
    cv.brush([(0, 208), (528, 198)], 4, 4)
    cv.brush([(0, 211), (528, 201)], 2, 2, col=hx('#3a1a2a'))
    for x in (176, 352):
        cv.brush([(x, 206 - x * 0.02), (x, 282)], 3, 3, col=hx('#1e0e18'))
    for x, y in ((92, 240), (300, 232)):
        cv.ellipse(x, y, 3.5, 3.5, INK)
        for a in range(4):
            ang = a * 1.6 + y
            cv.brush([(x, y), (x + math.cos(ang) * 9, y + math.sin(ang) * 6)], 1.5, 0.5, col=hx('#5a3040'))
    # a paper slid off onto the floor
    pts = [(120, 220, 0), (160, 230, 0), (152, 266, 0), (112, 256, 0)]
    cv.fill(pts, hx('#8a8098'), smooth=False)
    cv.ink(pts, 2, smooth=False)
    # the boss, fallen forward out of his chair over the desk: his back in its suit, his head down on the wood on its
    # side by the phone, his eyes shut; his blood spread from under him to the desk's edge
    back = [(396, 192), (400, 150), (420, 118), (456, 102), (494, 106), (518, 128), (528, 150, 0), (528, 192, 0)]
    m = cv.fill(back, suit)
    cv.fill([(494, 106), (518, 128), (528, 150, 0), (528, 192, 0), (480, 192), (500, 150)], suitD, clip=m)
    cv.brush([(456, 106), (468, 150), (470, 190)], 1.5, 0.5, mid=3, col=suitD)                 # the seam down his back
    cv.ink(back, 4)
    cv.fill([(330, 184), (380, 180), (430, 184), (446, 192), (448, 203, 0), (440, 203, 0), (430, 198), (380, 200), (334, 196)],
            hx('#5a0618'))
    cv.brush([(350, 190), (420, 191)], 1, 1, mid=2.5, col=hx('#c01a3a'))
    collar = [(398, 140), (420, 124), (434, 130), (430, 160), (412, 176), (400, 172)]
    cv.fill(collar, hx('#b8b0c8'))                                                               # his collar
    cv.ink(collar, 2)
    pal = dict(skin=hx('#b87890'), shade=hx('#4a1e40'), hair=hx('#9a90a8'), hairD=hx('#4a4258'), white=hx('#c8a8b8'))
    head_boss(cv, T(318, 150, 0.84, 1, -math.pi / 2 - 0.08), pal)
    # the ashtray, the cigar on its edge, its end still lit
    cv.ellipse(184, 184, 26, 7, hx('#2a2a3a'))
    cv.ellipse(184, 183, 18, 4, hx('#141420'))
    cv.ink([(158, 184), (184, 177), (210, 184), (184, 191)], 3)
    cv.brush([(172, 181), (212, 177)], 7, 6, col=hx('#3a1a18'))
    cv.brush([(174, 179), (210, 175)], 1.5, 1.5, col=hx('#6a3a2a'))
    cv.ellipse(*OFFICE_SMOKE, 3.5, 3.5, FIRE)
    # a glass on its side, its whisky spread across the desk
    cv.ellipse(492, 184, 30, 5, hx('#8a4a1e'))
    glass = [(470, 172, 0), (494, 168, 0), (496, 182, 0), (472, 186, 0)]
    cv.fill(glass, hx('#8aa0b8'), smooth=False)
    cv.fill([(470, 172, 0), (494, 168, 0), (494, 171, 0), (470, 175, 0)], hx('#e0f0ff'), smooth=False)
    cv.ink(glass, 2, smooth=False)
    # the phone's body and its dial, its cord
    cv.brush([(316, 182), (340, 196), (380, 200), (420, 196)], 2, 2, col=hx('#14121a'))
    cv.fill([(240, 150), (308, 148), (316, 166, 0), (232, 168, 0)], hx('#1e1a24'))
    cv.ink([(240, 150), (308, 148), (316, 166, 0), (232, 168, 0)], 3)
    base = [(232, 168, 0), (316, 164, 0), (322, 186, 0), (226, 190, 0)]
    cv.shape(base, hx('#14121a'), 3)
    cv.ellipse(274, 176, 16, 7, hx('#9a8aa8'))
    cv.ellipse(274, 176, 6, 3, hx('#2a2434'))
    for a in range(8):
        ang = math.pi * (0.9 + a * 0.16)
        cv.ellipse(274 + math.cos(ang) * 11, 176 + math.sin(ang) * 5, 1.6, 1.2, hx('#2a2434'))
    # the neon through the blinds, in stripes across the room, the chair, him and the desk
    bands = cv.blank()
    d = ImageDraw.Draw(bands)
    for k in range(8):
        y = 10 + k * 30
        d.polygon([(92, y + 20), (528, y + 116), (528, y + 126), (92, y + 27)], fill=255)
    layer = Image.new('RGB', (528, 282), (0, 0, 0))
    layer.paste(hx('#5a1236'), (0, 0), bands)
    cv.im = ImageChops.screen(cv.im, layer)
    return cv

@panel('office_phone', (528, 282))
def panel_office_phone():
    """Level 1's ending, panel 2's receiver on its own (transparent round it): the game rattles it on its cradle; its
    edge takes the neon."""
    cv = Cv(528, 282)
    rec = cv.mask([(226, 146), (234, 132), (250, 132), (256, 140), (296, 138), (302, 130), (318, 130), (326, 144), (318, 152),
                   (296, 150), (256, 152), (234, 156)])
    out = Image.new('RGBA', (528, 282), (0, 0, 0, 0))
    out.paste((10, 7, 12, 255), (0, 0), rec)
    out.paste((40, 26, 44, 255), (0, 0), ImageChops.multiply(rec, ImageChops.offset(rec, 0, 3)))
    out.paste((10, 7, 12, 255), (0, 0), ImageChops.multiply(rec, ImageChops.offset(rec, 0, 7)))
    out.paste(PINK_D + (255,), (0, 0), ImageChops.subtract(ImageChops.multiply(rec, ImageChops.offset(rec, 0, 3)),
                                                            ImageChops.offset(rec, 0, 5)))
    cv.im = out
    return cv

MATCH_COVER = [(96, 82), (360, 64), (366, 150), (102, 168)]   # the matchbook's printed face (panel px): the game letters it

@panel('matchbook', (528, 282))
def panel_matchbook():
    """Level 1's ending, panel 3. Close, at the wheel: his hand, black, holds up a matchbook he took off the boss's
    desk, a street lamp through the wet windscreen along its fingers: a flamingo on its pink cover (the game letters
    the name over it), the strip on its fold scorched where somebody struck a match."""
    cv = Cv(528, 282, hx('#0e0c22'))
    # the windscreen behind, out of focus: the lamps of the street, flat discs
    for cx, cy, r, col in ((60, 200, 46, hx('#1c1634')), (440, 70, 60, hx('#2a1a34')), (470, 60, 30, hx('#6a3a2a')),
                           (150, 250, 24, hx('#2a1c3a')), (330, 30, 20, hx('#1e1834')), (40, 40, 16, hx('#3a1430'))):
        cv.ellipse(cx, cy, r, r, col)
    rain_beads(cv, 0, 0, 528, 282, 16, (hx('#0a0a1c'), hx('#34305e')), seed=77)
    # the wheel's rim across the foot of the panel
    cv.brush([(528, 214), (420, 240), (300, 264), (200, 284)], 30, 26, col=INK)
    cv.brush([(528, 210), (420, 236), (300, 260), (200, 280)], 8, 6, col=hx('#2a2240'))
    # the matchbook: its shadow, the cover, the fold and its striking strip, the staple
    cover = [(96, 82, 0), (360, 64, 0), (372, 210, 0), (106, 228, 0)]
    cv.fill([(104, 92, 0), (368, 74, 0), (380, 220, 0), (112, 238, 0)], hx('#06060e'), smooth=False)
    cv.fill(cover, hx('#e85a86'), smooth=False)
    cv.fill([(96, 82, 0), (360, 64, 0), (361, 74, 0), (97, 92, 0)], hx('#ff9ab8'), smooth=False)
    cv.fill([(352, 64, 0), (360, 64, 0), (372, 210, 0), (364, 211, 0)], hx('#a83260'), smooth=False)
    cv.fill([(106, 196, 0), (370, 178, 0), (372, 210, 0), (106, 228, 0)], hx('#c8406e'), smooth=False)
    cv.fill([(110, 204, 0), (370, 186, 0), (371, 200, 0), (111, 218, 0)], hx('#3a1a24'), smooth=False)
    for k in range(5):
        x = 150 + k * 18
        cv.brush([(x, 211 - (x - 110) * 0.07), (x + 30, 207 - (x - 110) * 0.07)], 3, 1, col=INK)    # struck there
    cv.ellipse(236, 222, 5, 3, hx('#c8c8d0'))
    cv.ink(cover, 3, smooth=False)
    # the flamingo, cream on the pink, on one leg
    bird = hx('#f8ecd8')
    cv.brush([(148, 182), (150, 150)], 3, 3, col=bird)
    cv.brush([(150, 160), (162, 166), (154, 172)], 2.5, 2, col=bird)
    cv.fill([(130, 140), (150, 126), (176, 128), (186, 140), (168, 152), (140, 152)], bird)
    cv.brush([(178, 134), (190, 120), (178, 104), (170, 92), (180, 84)], 5, 4, col=bird)
    cv.ellipse(184, 84, 6, 5, bird)
    cv.brush([(188, 84), (198, 90), (196, 96)], 3, 1.5, col=INK)
    cv.brush([(130, 140), (118, 146)], 3, 1, col=bird)

    # his hand, black: the coat's cuff, the heel of the hand, the fingers behind the matchbook, the thumb over its
    # corner; the lamp along their tops
    def hand(c):
        c.fill([(528, 196, 0), (470, 200), (452, 246), (462, 282, 0), (528, 282, 0)], INK)
        c.fill([(474, 204), (430, 190), (384, 196), (362, 214), (372, 232), (414, 246), (460, 244)], INK)
        finger(c, [(408, 214), (380, 196), (350, 186)], 17, INK)
    m = silhouette(528, 282, hand)
    cv.im.paste(INK, (0, 0), m)
    backlit(cv, m, FIRE_D, ((0, -4), (-3, 0)))
    backlit(cv, m, FIRE, ((0, -2),))
    cv.brush([(470, 204), (454, 246)], 3, 2, col=PINK_DD)                                           # the cuff's edge
    return cv
