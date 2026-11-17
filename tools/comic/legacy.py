"""The first pass's people: 2D heads drawn as point lists (three quarters or profile), the hero asleep or sat as a
black mask for a rim of neon. Kept only for the panels not yet redrawn with the cast (tools/comic/cast.py); delete
what no panel uses any more.
"""
import math

from PIL import ImageDraw

from .kit import INK, hx, limb, spline

# ---------------------------------------------------------------- people
# A head is drawn in its own units: 100 from the crown to the chin, turned three quarters to the right (f -1: to the
# left), the origin on the crown. pal: skin (lit), shade (its shadow), deep (the darkest of it, usually INK).
def jaw_heavy():
    return [(0, 0), (18, 3), (30, 13), (35, 26), (37, 34, 0), (34, 40), (37, 47), (45, 59, 0), (41, 65), (36, 66, 0), (38, 72),
            (37, 76, 0), (38, 80), (34, 85, 0), (37, 93), (30, 103), (10, 106), (-6, 97), (-14, 86, 0),
            (-17, 72), (-30, 62), (-40, 44), (-38, 22), (-26, 7)]


def head_heavy(cv, t, pal, mood='strain'):
    """The heavy: shaved head, thick neck, broken nose, small deep eyes, a jaw like a brick."""
    sk, sh, dp = pal['skin'], pal['shade'], pal.get('deep', INK)
    neck = t([(-22, 64), (-34, 132), (40, 132), (30, 100), (12, 104)])
    cv.shape(neck, dp, t.ink())
    cv.fill(t([(22, 104), (30, 100), (40, 132, 0), (28, 132, 0)]), sh, clip=neck)       # the front of it, in the light
    head = t(jaw_heavy())
    cv.fill(head, sk)
    # the planes away from the light: behind a line down the temple, the cheekbone and the jaw
    cv.fill(t([(-60, -10), (4, -4), (10, 26), (4, 40), (2, 56), (12, 66), (16, 78), (10, 92), (4, 120), (-60, 120)]), sh, clip=head)
    cv.fill(t([(6, 40), (14, 37), (26, 40), (30, 46), (24, 51), (12, 52), (4, 50)]), sh, clip=head)     # the sockets
    cv.fill(t([(27, 44), (31, 56), (35, 64), (42, 65), (37, 59), (33, 47)]), sh, clip=head)             # the nose's shade
    cv.fill(t([(12, 99), (24, 93), (36, 93), (30, 103), (10, 106)]), sh, clip=head)                      # under the chin
    cv.fill(t([(24, 82), (30, 83), (35, 81), (30, 87)]), sh, clip=head)                                   # under the lip
    cv.ink(head, t.ink())
    # the ear
    ear = t([(-6, 44), (-14, 39), (-21, 46), (-20, 58), (-12, 67), (-5, 62)])
    cv.shape(ear, sh, 3)
    cv.brush(t([(-10, 46), (-15, 50), (-13, 58)]), 2.5, 1)
    # the eyes: small, deep, under a heavy brow
    eye = t([(5, 47), (13, 44), (21, 47), (13, 49)])
    cv.fill(eye, (220, 214, 200))
    cv.ellipse(*t.pt(15, 46.5), t.len(2.6), t.len(2.6), dp, clip=eye)
    cv.brush(t([(3, 47), (9, 43.5), (17, 43.5), (23, 47)]), 3, 1.5)
    cv.brush(t([(7, 49.5), (13, 50.5), (20, 48.5)]), 1, 1.5)
    far = t([(29, 47), (32, 44.5), (35, 47), (32, 48)])
    cv.fill(far, (220, 214, 200))
    cv.ellipse(*t.pt(32.5, 46.5), t.len(1.6), t.len(2), dp, clip=far)
    cv.brush(t([(28, 47), (32, 44), (35.5, 46.5)]), 2.5, 1)
    lift = 2 if mood == 'strain' else 0
    cv.brush(t([(2, 41 + lift), (10, 37), (20, 37.5 + lift), (27, 41 + lift)]), 2, 2, mid=5)
    cv.brush(t([(29, 40 + lift), (33, 38), (36, 39)]), 4, 2)
    # the nose: broken, wide
    cv.brush(t([(33, 58), (36, 64), (41, 64)]), 2.5, 1.5)
    cv.fill(t([(37, 63), (40.5, 62.5), (40, 64.5)]), dp)
    cv.brush(t([(36, 49), (38, 52)]), 1.5, 0.5)                           # the break in it
    # mouth and folds
    if mood == 'strain':
        cv.fill(t([(21, 76), (28, 73.5), (37, 75), (29, 78)]), dp)        # teeth set
        cv.brush(t([(23, 75.8), (29, 75.3), (35.5, 75.2)]), 1.5, 1.5, col=(214, 200, 176))
        cv.brush(t([(28, 61), (23, 71), (19, 77)]), 3, 1)
    else:
        cv.brush(t([(21, 76), (29, 75), (37, 76.5)]), 3, 2)
        cv.brush(t([(28, 62), (22, 72), (19, 78)]), 2.5, 1)
    cv.brush(t([(26, 81), (31, 82), (35, 80)]), 2, 1)                     # under the lower lip
    cv.brush(t([(8, 26), (18, 24), (28, 27)]), 1.5, 0.5, col=sh)          # creases on his brow
    cv.brush(t([(10, 31), (20, 30), (27, 32)]), 1.5, 0.5, col=sh)


def head_slick(cv, t, pal, light='under'):
    """The one with the match, in profile: black hair combed straight back with oil, a pencil moustache, a hooked
    nose, a hollow under the cheekbone, a long hard jaw. light 'under': lit from a flame below and in front of his face
    (what faces down takes the light, the brow and the forehead go dark); 'none': a dark shape and its edge."""
    sk, sh, dp, hair, shine = pal['skin'], pal['shade'], pal.get('deep', INK), pal['hair'], pal['shine']
    neck = t([(-24, 66), (-30, 130), (22, 130), (16, 112), (12, 100)])
    head = t([(33, 15), (27, 5), (14, -1), (-4, -3), (-22, 0), (-34, 10), (-40, 26), (-40, 44), (-34, 58), (-24, 70, 0),
              (-10, 84), (-4, 89, 0), (8, 97), (22, 101), (29, 99), (32, 93), (31, 86, 0), (35, 81), (35, 77, 0),
              (37, 73), (35, 68, 0), (39, 67), (45, 64, 0), (43, 58), (38, 49), (33, 42, 0), (36, 36), (36, 28)])
    cv.fill(neck, sk)
    if light == 'under':
        cv.fill(t([(-60, 104), (2, 104), (12, 100), (17, 110), (22, 130, 0), (-60, 130, 0)]), sh, clip=neck)
        cv.fill(t([(-60, 60, 0), (-14, 84), (-2, 100), (-8, 130, 0), (-60, 130, 0)]), dp, clip=neck)
        cv.brush(t([(14, 108), (17, 113), (16, 118)]), 2, 1)                                     # his Adam's apple
    else:
        cv.fill(t([(-70, -30, 0), (70, -30, 0), (70, 130, 0), (-70, 130, 0)]), sh, clip=neck, smooth=False)
    cv.ink(neck, t.ink())
    cv.fill(head, sk)
    if light == 'under':
        # the forehead, the temple and the top of the cheekbone turned away from the flame
        lit_line = [(70, 68, 0), (44, 61), (37, 52), (31, 50), (22, 53), (12, 56), (2, 58), (-8, 64), (-16, 74), (-28, 80),
                    (-70, 80, 0), (-70, -30, 0), (70, -30, 0)]
        cv.fill(t(lit_line), sh, clip=head)
        cv.fill(t([(-70, -30, 0), (70, -30, 0), (70, 30, 0), (34, 31), (20, 34), (4, 40), (-8, 52), (-24, 70, 0), (-70, 70, 0)]), dp, clip=head)
        cv.brush(t([(14, 41), (24, 39.5), (34, 40)]), 0.5, 0.5, mid=1.8, col=pal.get('glint'))   # the brow ridge's underside
    # the hair: combed straight back with oil, black, the comb's tracks shining
    hair_s = t([(70, -30, 0), (70, 12, 0), (33, 14), (20, 17), (8, 23), (0, 32), (-4, 44), (-6, 56, 0), (-12, 50),
                (-18, 58), (-24, 72, 0), (-70, 72, 0), (-70, -30, 0)])
    hm = cv.fill(hair_s, hair, clip=head)
    for a, m, b, w in [((30, 12), (6, 2), (-22, 4), 2.2), ((24, 17), (2, 9), (-26, 14), 1.4), ((14, 22), (-8, 18), (-30, 30), 1.6)]:
        cv.brush(t([a, m, b]), 0.5, 0.5, col=shine, mid=w, clip=hm)                         # the comb's tracks, in the light
    cv.ink(head, t.ink())
    cv.brush(t([(33, 14), (20, 17), (8, 23), (0, 32), (-4, 44), (-6, 56)]), 2, 1)
    # the ear, the sideburn cut square in front of it
    ear = t([(-8, 46), (-15, 42), (-21, 49), (-20, 61), (-13, 69), (-8, 64)])
    cv.shape(ear, sh if light == 'under' else hair, 3)
    cv.brush(t([(-12, 48), (-17, 52), (-15, 60), (-12, 63)]), 2.5, 1)
    if light == 'under':
        cv.brush(t([(-19, 64), (-13, 69), (-9, 66)]), 1, 1, col=sk)
    cv.fill(t([(-7, 50, 0), (-3, 50, 0), (-3, 60), (-5, 66, 0), (-7, 62)]), hair)
    # the eye in profile under a heavy brow: the white's corner, the iris, the lid, the glint of the flame
    glint = pal.get('glint', (255, 200, 120))
    eye = t([(22, 47), (29, 44.5, 0), (30, 48.5, 0), (24, 49.5)])
    cv.fill(eye, pal.get('white', sh))
    cv.fill(t([(26, 45), (29, 44.6, 0), (30, 48.5, 0), (26.4, 49)]), dp, clip=eye)
    cv.ellipse(*t.pt(28, 48), t.len(0.9), t.len(0.9), glint)
    cv.brush(t([(18, 46), (24, 43.6), (31, 44.6)]), 3.5, 1.5)                 # the upper lid
    cv.brush(t([(23, 50.4), (30, 48.8)]), 1, 2, col=glint)                    # the lower lid, catching the flame
    cv.brush(t([(19, 41.5), (25, 40), (31, 41.2)]), 0.5, 0.5, mid=1.5)        # the crease of the lid
    cv.brush(t([(14, 38), (24, 35.5), (35, 37)]), 2, 2.5, mid=5.5)            # the brow, low and straight
    cv.brush(t([(16, 54), (22, 55), (28, 53.5)]), 0.5, 0.5, mid=1.5, col=sh)  # the bag under the eye
    # the hooked nose, the nostril's wing
    cv.brush(t([(38, 49), (40, 52)]), 1.5, 0.5)
    cv.brush(t([(34, 61), (34, 65), (37, 67.5)]), 2.5, 1)
    cv.brush(t([(31, 61), (33, 58), (37, 59)]), 1, 1, col=sh)
    # the pencil moustache along the lip, the thin mouth, the chin
    cv.brush(t([(28, 71.6), (33, 71), (37.4, 71.8)]), 1.5, 2.6, col=hair)
    cv.brush(t([(27, 76.6), (31, 76.4), (35.4, 77)]), 1.5, 2.4)
    cv.brush(t([(29, 72), (27, 70), (26, 66)]), 0.4, 0.4, mid=1.4)            # the corner of the mouth
    cv.brush(t([(28, 64), (25, 70), (27, 76)]), 2, 0.5, col=sh)               # the fold from the nose
    cv.brush(t([(8, 64), (13, 72), (15, 78)]), 2, 0.5, col=sh)                # the hollow of the cheek
    cv.brush(t([(-9, 74), (-5, 86), (4, 95)]), 1, 2.5, col=sh)                # the jaw's edge
    cv.brush(t([(29, 84.5), (33, 85)]), 2, 0.5)                               # under the lip
    cv.brush(t([(20, 96), (28, 95)]), 0.5, 0.5, mid=1.5, col=sh)              # the cleft of the chin


def eye34(cv, t, x, y, w, pal, look=0.0, open_=1.0, glint=None):
    """A near eye in three quarters, centred (x, y), w wide: a dark iris half under a heavy upper lid, a little of the
    white each side of it (shaded, never pure), the lower lid. look -1..1 moves the iris; open_ 0: shut, the lashes."""
    dp, sh = pal.get('deep', INK), pal['shade']
    if open_ <= 0:
        cv.brush(t([(x - w / 2, y), (x - w / 6, y + 1.4), (x + w / 3, y + 0.8), (x + w / 2, y - 0.4)]), 1.5, 1.2, mid=3)
        cv.brush(t([(x - w / 3, y - 2.6), (x + w / 4, y - 2.6), (x + w / 2, y - 1.2)]), 0.5, 0.5, mid=1.4, col=sh)
        return
    h = w * 0.38 * open_
    al = t([(x - w / 2, y + 0.6, 0), (x - w / 5, y - h * 0.6), (x + w / 4, y - h * 0.55), (x + w / 2, y - h * 0.05, 0),
            (x + w / 5, y + h * 0.48), (x - w / 5, y + h * 0.44)])
    cv.fill(al, pal.get('white', (200, 186, 168)))
    ix = x + look * w * 0.2
    cv.ellipse(*t.pt(ix, y - h * 0.05), t.len(w * 0.24), t.len(w * 0.24), pal.get('iris', dp), clip=al)
    cv.ellipse(*t.pt(ix, y - h * 0.05), t.len(w * 0.1), t.len(w * 0.1), dp, clip=al)
    cv.fill(t([(x - w / 2, y - h, 0), (x + w / 2, y - h, 0), (x + w / 2, y - h * 0.05, 0), (x + w / 4, y - h * 0.3),
               (x - w / 5, y - h * 0.32), (x - w / 2, y + 0.6, 0)]), sh, clip=al)          # the lid's shadow on the eye
    if glint:
        cv.ellipse(*t.pt(ix + w * 0.07, y - h * 0.12), t.len(w * 0.045), t.len(w * 0.045), glint, clip=al)
    cv.brush(t([(x - w / 2 - 1, y + 0.8), (x - w / 5, y - h * 0.66), (x + w / 4, y - h * 0.6), (x + w / 2 + 0.6, y + 0.2)]), 2.2, 1.8, mid=3.8)
    cv.brush(t([(x - w / 4, y + h * 0.52), (x + w / 5, y + h * 0.52), (x + w / 2, y + 0.6)]), 0.6, 1.4)
    cv.brush(t([(x - w / 3, y - h * 0.6 - 2.6), (x + w / 4, y - h * 0.62 - 2.4), (x + w / 2, y - h * 0.2 - 1.4)]), 0.5, 0.5,
             mid=1.5, col=sh)                                            # the crease of the lid
    cv.brush(t([(x - w / 4, y + h * 0.6 + 2.4), (x + w / 6, y + h * 0.7 + 2.6)]), 0.4, 0.4, mid=1.2, col=sh)   # the bag


# ---------------------------------------------------------------- bodies, hands, floors
def finger(cv, pts, w, col, shade=None, side=1, band=0.45):
    """A finger (or an arm) along pts, w thick, inked; shade: a band of that colour down one side (side 1: the lower
    right one, -1 the other), band x w wide."""
    cv.brush(pts, w + 3, w + 1, col=INK)
    cv.brush(pts, w - 1.5, w - 2.5, col=col)
    if shade:
        a, b = pts[0], pts[-1]
        dx, dy = b[0] - a[0], b[1] - a[1]
        d = math.hypot(dx, dy) or 1
        off = (w - 1.5) / 2 - w * band / 2
        ox, oy = -dy / d * off * side, dx / d * off * side
        cv.brush([(p[0] + ox, p[1] + oy) for p in pts], w * band, w * band * 0.7, col=shade)


def figure_asleep(cv, x, y, s=1.0):
    """Him asleep on his side under a sheet, seen from the side, as one mask: his head on the pillow at the origin,
    the sheet over his shoulder, his hip and his drawn-up knees, his feet at +x; one arm hanging out over the bed's
    edge to the floor (local px, the mattress's top at y 0, the floor at y 46)."""
    P = lambda p: (x + p[0] * s, y + p[1] * s) + ((0,) if len(p) > 2 else ())
    m = cv.blank()
    d = ImageDraw.Draw(m)
    for pts in ([(-34, -40), (-26, -66), (-4, -80), (22, -76), (36, -60), (38, -42), (30, -30), (14, -26), (-12, -26), (-28, -30)],
                [(-30, -64), (-46, -62), (-52, -48), (-44, -40), (-36, -44)],                                 # his hair on the pillow
                [(26, -30, 0), (34, -60), (56, -88), (96, -98), (134, -86), (170, -62), (214, -60), (262, -84),
                 (300, -88), (340, -72), (380, -64), (420, -58), (444, -40), (452, -16), (454, 0, 0), (26, 0, 0)]):       # under the sheet
        d.polygon(spline([P(p) for p in pts]), fill=255)
    limb(m, [P((76, -50)), P((92, -6)), P((96, 14))], 20 * s, 16 * s)         # the arm over the edge ...
    limb(m, [P((96, 14)), P((98, 26)), P((100, 34))], 15 * s, 12 * s)         # ... the forearm down
    d.polygon(spline([P(p) for p in [(90, 30), (110, 30), (116, 42), (112, 52), (104, 54), (94, 48)]]), fill=255)   # the hand, open
    for k in range(3):
        limb(m, [P((97 + k * 6, 48)), P((96 + k * 6.5, 58 + (k % 2) * 3))], 5 * s, 4 * s)                    # its fingers
    return m


# The hero: a dark flat cap, brown hair down to his collar, a Mediterranean tan, three days' beard, a long charcoal
# coat with its collar up, a grey knit scarf, the strap of his satchel across his chest (generate_assets.py CHARS
# 'player'). Seen as a silhouette, or in profile with a light on part of his face.
def head_hero_side(cv, t, pal):
    """Him in profile, facing right (f -1: left), lit from in front of his face (a street lamp through a windscreen):
    the cap's peak throws its shadow over his eyes, the light takes the nose, the mouth, the beard along the jaw; the
    back of his head, his hair down to the collar and his ear stay in the dark. Origin on the crown, 100 to the chin."""
    sk, sh, dp, hair, hairL = pal['skin'], pal['shade'], pal.get('deep', INK), pal['hair'], pal['hairL']
    cap, capL, coat = pal['cap'], pal['capL'], pal['coat']
    # the coat's collar, turned up behind his neck, its petrol lining
    back = t([(-70, 140, 0), (-66, 104), (-56, 82), (-48, 66, 0), (-36, 72), (-26, 92), (-10, 110), (10, 118), (10, 140, 0)])
    cv.fill(back, coat)
    cv.fill(t([(-48, 66, 0), (-36, 72), (-30, 84), (-44, 82), (-52, 76)]), pal['lining'], clip=back)
    cv.ink(back, t.ink())
    # his hair, down to the collar from under the cap
    locks = t([(-6, 30), (-24, 28), (-40, 32), (-46, 50), (-46, 70), (-40, 88), (-30, 96), (-24, 84), (-18, 70), (-12, 58),
               (-8, 46)])
    cv.shape(locks, hair, t.ink())
    for a_, b_, c_ in (((-36, 40), (-42, 60), (-38, 82)), ((-26, 44), (-32, 64), (-30, 86)), ((-18, 48), (-22, 62), (-22, 76))):
        cv.brush(t([a_, b_, c_]), 0.5, 0.5, mid=2.2, col=hairL)
    neck = t([(-18, 70), (-22, 124), (26, 124), (22, 100), (8, 98)])
    cv.shape(neck, sh, t.ink())
    head = t([(26, 7), (33, 18), (36, 30), (37, 38, 0), (35, 43), (38, 50), (43, 59), (46, 64, 0), (43, 67), (38, 68, 0),
              (39.5, 72), (38, 75, 0), (39.5, 78.5), (36, 82, 0), (38, 89), (35, 97), (26, 102), (10, 99), (-2, 92),
              (-8, 84, 0), (-14, 76), (-24, 68), (-34, 54), (-38, 38), (-36, 20), (-28, 7), (-14, 0), (2, -2), (16, 1)])
    cv.fill(head, sh)
    lit = cv.fill(t([(80, -10, 0), (14, 4), (12, 26), (18, 42), (10, 56), (6, 72), (10, 88), (16, 104), (80, 120, 0)]), sk, clip=head)
    # three days' beard: the jaw, the chin and the lip, in the light and in the shade
    beard = t([(-6, 70), (8, 66), (22, 68), (33, 70), (41, 71), (40, 80), (40, 92), (35, 99), (26, 103), (10, 100), (-2, 92),
               (-10, 80)])
    cv.fill(beard, pal['stubble'], clip=lit)
    cv.fill(beard, pal['stubbleD'], clip=head, cut=lit)
    # the cap's shadow over the brow and the eye
    cv.fill(t([(80, -10, 0), (80, 44, 0), (48, 42), (36, 47), (24, 50), (12, 50), (0, 46), (-60, 40, 0), (-60, -10, 0)]), sh, clip=head)
    cv.ink(head, t.ink())
    # the ear, in the dark, half under his hair
    ear = t([(-6, 48), (-12, 43), (-19, 49), (-18, 61), (-12, 68), (-6, 64)])
    cv.shape(ear, sh, 3)
    cv.brush(t([(-10, 50), (-15, 54), (-13, 61)]), 2.5, 1)
    cv.fill(t([(-8, 38), (-22, 38), (-24, 50), (-14, 48), (-8, 52)]), hair)
    cv.brush(t([(-4, 44), (-2, 58), (-4, 66)]), 3, 1, col=hair)                  # the sideburn
    # the eye in the shadow of the peak: the white's corner, the iris, a glint
    eye = t([(27, 46), (32, 44.5, 0), (33, 48.5, 0), (28, 49.5)])
    cv.fill(eye, pal['white'])
    cv.fill(t([(29.5, 45), (32, 44.6, 0), (33, 48.5, 0), (29.8, 49)]), dp, clip=eye)
    cv.ellipse(*t.pt(31.4, 46.6), t.len(0.8), t.len(0.8), pal['glint'])
    cv.brush(t([(24, 45.5), (28, 43.8), (34, 44.4)]), 3, 1.5)                 # the upper lid
    cv.brush(t([(20, 40.5), (28, 38.4), (37, 39.5)]), 2, 2.5, mid=5)          # the brow, low and level
    # the nose, straight, the light down its ridge; the set mouth; the fold; under the lip
    cv.brush(t([(38, 51), (43, 59), (45.5, 63.5)]), 1, 0.5, mid=2, col=pal['shine'])
    cv.brush(t([(35, 61), (35, 65), (38, 67.5)]), 2.5, 1)
    cv.brush(t([(30, 75.4), (35, 75.2), (39, 75.4)]), 1.5, 2.6)
    cv.brush(t([(31, 64), (28, 70), (30, 76)]), 2, 0.5, col=sh)
    cv.brush(t([(31, 83), (35, 83.4)]), 2, 0.5)
    # the cap: a dark flat cap, its peak low over his eyes, the light along its front
    top = t([(-44, 34), (-44, 18), (-34, 2), (-14, -8), (12, -8), (32, 0), (42, 14), (46, 24, 0), (58, 30), (60, 34, 0), (44, 36),
             (32, 33), (10, 32), (-20, 32)])
    m = cv.shape(top, cap, t.ink())
    cv.fill(t([(32, 0), (42, 14), (46, 24, 0), (58, 30), (60, 34, 0), (50, 34), (40, 22), (30, 8)]), capL, clip=m)
    cv.brush(t([(-36, 20), (-10, 10), (20, 10), (40, 22)]), 0.5, 0.5, mid=2, col=hx('#0c0c12'), clip=m)   # its seam
    cv.ellipse(*t.pt(-2, -6), t.len(2.2), t.len(1.4), pal['lining'])                                       # its button
    # the scarf wound round his neck, grey knit, bunched under his chin, the light on its front
    scarf = t([(-26, 98), (-12, 104), (8, 108), (24, 104), (36, 108), (42, 116), (38, 126), (20, 130), (0, 128), (-24, 120)])
    m = cv.shape(scarf, pal['knit'], t.ink())
    cv.fill(t([(26, 102), (36, 108), (42, 116), (38, 126), (26, 128), (30, 114)]), pal['knitL'], clip=m)
    cv.brush(t([(-20, 110), (0, 116), (20, 116), (36, 112)]), 1, 0.5, mid=2.5, col=pal['knitD'], clip=m)
    for k in range(4):
        x = -16 + k * 12
        cv.brush(t([(x, 104 + k), (x + 2, 116 + k * 0.5)]), 0.5, 0.5, mid=1.4, col=pal['knitD'], clip=m)
    # the coat's front, its collar turned up against the scarf
    front = t([(10, 140, 0), (14, 122), (30, 124), (50, 118), (62, 132), (60, 140, 0)])
    cv.shape(front, coat, t.ink())
    cv.brush(t([(30, 124), (50, 118), (60, 130)]), 1, 0.5, mid=3, col=pal['coatL'])


def head_boss(cv, t, pal):
    """The boss, three quarters, dead: a heavy face gone slack, jowls, a big nose, thick grey brows, his grey hair
    combed straight back, the eyes shut, the mouth fallen a little open. Lit from the crown's side (the desk lamp)."""
    sk, sh, dp, hair, hairD = pal['skin'], pal['shade'], pal.get('deep', INK), pal['hair'], pal['hairD']
    head = t([(-2, 6), (16, 6), (28, 14), (34, 26), (36, 35, 0), (33, 40), (37, 48), (45, 62, 0), (42, 68), (36, 69, 0),
              (37, 74), (35, 78, 0), (37, 84), (33, 90, 0), (34, 98), (24, 108), (6, 110), (-8, 102), (-16, 90, 0),
              (-20, 74), (-30, 62), (-35, 44), (-33, 24), (-20, 10)])
    cv.fill(head, sk)
    cv.fill(t([(-60, 40, 0), (-4, 40), (-2, 56), (4, 70), (6, 88), (0, 104), (-4, 130), (-60, 130, 0)]), sh, clip=head)   # the far side
    cv.fill(t([(4, 62), (12, 68), (16, 88), (10, 98), (2, 84)]), sh, clip=head)                                     # the jowl
    cv.fill(t([(26, 46), (32, 58), (38, 68), (44, 68), (38, 62), (33, 48)]), sh, clip=head)                         # the nose's shade
    # grey hair combed straight back, its comb tracks
    hm = cv.fill(t([(-60, -20, 0), (60, -20, 0), (60, 8, 0), (30, 12), (14, 16), (2, 22), (-6, 34), (-8, 48, 0), (-18, 52),
                    (-60, 70, 0)]), hair, clip=head)
    for a_, b_ in (((26, 10), (-26, 14)), ((14, 16), (-30, 28)), ((2, 24), (-32, 42))):
        cv.brush(t([a_, ((a_[0] + b_[0]) / 2, (a_[1] + b_[1]) / 2 - 4), b_]), 0.5, 0.5, mid=2, col=hairD, clip=hm)
    cv.ink(head, t.ink())
    ear = t([(-8, 50), (-16, 44), (-23, 52), (-22, 66), (-14, 74), (-8, 68)])
    cv.shape(ear, sh, 3)
    cv.brush(t([(-12, 52), (-18, 57), (-16, 66)]), 2.5, 1)
    # the eyes shut, heavy grey brows, the bags under them
    eye34(cv, t, 15, 49, 15, pal, open_=0)
    cv.brush(t([(28, 49), (32, 50), (35, 48.5)]), 1.5, 1)
    cv.brush(t([(3, 42), (10, 37), (20, 36), (28, 40)]), 2.5, 2, mid=5.5, col=hair)
    cv.brush(t([(4, 42.6), (10, 37.8), (20, 36.8), (28, 40.6)]), 0.5, 0.5, mid=1.4)
    cv.brush(t([(29, 40), (33, 37.5), (36, 39)]), 3.5, 1.5, col=hair)
    cv.brush(t([(7, 56), (15, 59), (23, 56)]), 0.5, 0.5, mid=1.8, col=sh)
    # the big nose, the folds, the mouth fallen open
    cv.brush(t([(33, 62), (37, 69), (43, 69)]), 2.5, 1.5)
    cv.fill(t([(39, 67.5), (42.5, 67), (42, 69.4)]), dp)
    cv.brush(t([(30, 65), (22, 76), (18, 90)]), 3, 1)
    cv.brush(t([(12, 86), (16, 98), (22, 104)]), 1.5, 0.5)
    mouth = t([(22, 80), (29, 79), (35, 80), (33, 85), (27, 86), (23, 84)])
    cv.fill(mouth, dp)
    cv.ink(mouth, 2)
    cv.brush(t([(25, 89), (29, 90), (33, 88)]), 1, 0.5, col=sh)


def figure_sat(cv, x, y, s=1.0, f=1):
    """Him sat against a wall, slumped: one leg out along the ground, the other knee up with his forearm over it and
    the hand hanging, his head bowed onto his chest under his cap, as one mask (local px, his seat at the origin,
    facing +x, up is -y; f -1 mirrors him)."""
    P = lambda p: (x + p[0] * s * f, y + p[1] * s) + ((0,) if len(p) > 2 else ())
    m = cv.blank()
    d = ImageDraw.Draw(m)
    for pts in ([(-14, 2, 0), (-18, -30), (-14, -58), (-2, -70), (14, -72), (24, -60), (22, -30), (16, -6), (20, 2, 0)],   # back, coat
                [(-2, -70), (2, -82), (14, -86), (28, -82), (34, -72), (30, -62), (20, -58), (8, -60)],   # his head on his chest
                [(-4, -78), (2, -92), (16, -96), (30, -92), (40, -78), (46, -70, 0), (36, -72), (24, -78), (8, -76)],  # the cap
                [(-20, 4, 0), (-24, -8), (-30, -6, 0), (-32, 4, 0)]):                                      # the coat's tail
        d.polygon(spline([P(p) for p in pts]), fill=255)
    limb(m, [P((4, -6)), P((60, -4)), P((116, -4))], 17 * s, 13 * s)                 # the leg out along the ground
    d.polygon(spline([P(p) for p in [(110, -14), (122, -22), (128, -14), (126, 2, 0), (106, 2, 0)]]), fill=255)   # its boot
    limb(m, [P((8, -10)), P((40, -42)), P((44, -44))], 18 * s, 15 * s)               # the thigh up to the knee
    limb(m, [P((44, -44)), P((52, -20)), P((58, 0))], 14 * s, 12 * s)                # the shin down
    d.polygon(spline([P(p) for p in [(50, -6), (68, -6), (74, 2, 0), (48, 2, 0)]]), fill=255)   # its boot
    limb(m, [P((14, -62)), P((30, -44)), P((48, -46))], 12 * s, 10 * s)              # the arm onto the knee
    limb(m, [P((48, -46)), P((60, -36)), P((64, -24))], 9 * s, 7 * s)                # the forearm, the hand hanging
    d.polygon(spline([P(p) for p in [(-36, 2, 0), (-36, -18), (-26, -24, 0), (-18, -16), (-18, 2, 0)]]), fill=255)   # the satchel
    return m
