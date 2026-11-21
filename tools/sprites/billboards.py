"""Billboards on their posts: the faces (sheets pasted up, an ad painted on them), torn down to their bare
boards (`_bare`) and to their frame (`_frame`, entities/Board.js, render/BoardArt.js)."""
import math
import random

from .core import (
    alpha, CLEAR, curve, Cv, dk, fill_capsule, fill_shape, frect, hx, layer, line, mix, px_paint, ramp, shade, smudge,
    VNoise
)
from .palette import DECO_PINK, DECO_TEAL, NEON_CYAN, STEEL_L, ZINC
from .type import words
from .neon import neon_halo, neon_words


SUN_BANDS = ('#2c1648', '#5a1e6a', '#a0287a', '#e8407a', '#ff7a5a', '#ffb24a')


def board_sheets(cv, x0, y0, x1, y1, step, stuff, rng):
    """A billboard's face with its paper torn off (entities/Board.js bares it down to this): the sheets it was pasted
    on, `step` px wide, steel ('steel': galvanised, a seam a sheet and one across, rivets along them, a streak of rust
    under some) or plywood ('wood': its grain along x, the sheets' joints); the paste gone yellow in blotches, scraps
    of old paper left on it, grime down its foot."""
    n, fine_n = VNoise(cv.w, cv.h, 16, rng), VNoise(cv.w, cv.h, 2, rng)
    ym = round((y0 + y1) / 2)
    steel = stuff == 'steel'
    base = ramp('#868c96', 0.45, 0.22, 0.3) if steel else ramp('#a07a52', 0.5, 0.25, 0.3)

    def sheet(x, y, cur):
        k = int((x - x0) // step)
        L = 0.5 + (0.05 if k % 2 else -0.03) + (n(x, y) - 0.5) * 0.1
        if not steel:
            L += (fine_n(x * 0.2, y * 2.5) - 0.5) * 0.16                      # the grain, along the sheet
        c = shade(base, L)
        if (x - x0) % step < 0.5 or abs(y - ym) < 0.5:
            c = dk(c, 0.45)                                                  # the joints
        elif (x - x0) % step < 1.0 or 0.5 <= y - ym < 1.0:
            c = mix(c, hx('#e8ecf0') if steel else hx('#d0b08a'), 0.25)   # their lit lip
        if n(x * 1.3 + 40, y * 1.3) > 0.74:
            c = mix(c, hx('#c8b87a'), 0.16)                                  # the paste, gone yellow
        if y > y1 - 9:
            c = dk(c, (y - (y1 - 9)) / 9 * 0.3)                              # grime down its foot
        return c
    px_paint(cv, x0, y0, x1, y1, sheet)
    if steel:
        for x in range(int(x0), int(x1) + 1, step):
            for y in range(int(y0) + 4, int(y1) - 2, 9):
                for (rx, ry) in ((x + 1.5, y), (x - 1.5, y)):
                    if x0 < rx < x1:
                        cv.dot(rx, ry, hx('#d8dce2'))                        # rivets either side of a joint
                        if rng.random() < 0.15:
                            frect(cv, rx - 0.5, ry + 0.5, rx, ry + rng.uniform(3, 8), lambda c: mix(c, hx('#8a4a2a'), 0.45))
    for _ in range(9):                                                       # scraps of the paper left stuck on
        sx, sy = rng.uniform(x0 + 2, x1 - 8), rng.uniform(y0 + 2, y1 - 6)
        w, h = rng.uniform(2, 7), rng.uniform(1.5, 4)
        tone = mix(hx('#ece6d4'), hx('#c8a8c8'), rng.random() * 0.5)
        px_paint(cv, sx, sy, sx + w, sy + h, lambda x, y, c, sx=sx, w=w, t=tone: t if (x - sx) < w * (0.6 + 0.4 * n(x * 3, y * 3)) else None)


def board_lattice(ly, x0, y0, x1, y1, step, steel, rim):
    """What is left of a billboard's face when its sheets are torn out too: the frame round it (rim px), the uprights
    every `step` px, two stringers across, a brace in each bay; nothing between (what is under it shows)."""
    frect(ly, x0 - 3, y0 - 3, x1 + 3, y0 - 3 + rim, shade(steel, 0.45))
    frect(ly, x0 - 3, y0 - 3, x1 + 3, y0 - 2, shade(steel, 0.8))
    frect(ly, x0 - 3, y1 + 3 - rim, x1 + 3, y1 + 3, shade(steel, 0.3))
    frect(ly, x0 - 3, y0, x0 - 3 + rim, y1, shade(steel, 0.45))
    frect(ly, x1 + 3 - rim, y0, x1 + 3, y1, shade(steel, 0.35))
    sy = (y0 + (y1 - y0) * 0.3, y0 + (y1 - y0) * 0.68)
    for y in sy:                                                             # the stringers
        frect(ly, x0, y - 1, x1, y + 1, shade(steel, 0.5))
        frect(ly, x0, y - 1, x1, y - 0.5, shade(steel, 0.8))
    ups = [x for x in range(int(x0) + step, int(x1) - 8, step)]
    for x in ups:                                                            # the uprights
        frect(ly, x - 1, y0, x + 1, y1, shade(steel, 0.42))
        frect(ly, x - 1, y0, x - 0.5, y1, shade(steel, 0.75))
    for a, b in zip([x0] + ups, ups + [x1]):                                 # a brace in each bay
        fill_capsule(ly, [(a + 1, sy[1]), (b - 1, sy[0])], 0.6, lambda k, L, s, i, t: shade(steel, 0.3 + L * 0.3))


def billboard_ad(head, sub, small, seed, scene='motel', face='poster'):
    """A roadside billboard from above, 12 m long, laid back to be read (as the signs are): the board in its white
    frame on its catwalk and two steel legs, four lamps on goosenecks along its top lighting it (the emissive map:
    their bulbs and the face they light). Its face: an eighties sunset (flat bands, the striped sun) with palm
    silhouettes and a flamingo (scene 'motel') or a pair of shades (any other) on the left, the name in neon pink
    (head), a line in teal (sub), a line in bone (small) on violet. face: 'poster' (whole), 'bare' (the paper gone: the
    plywood it was pasted on) or 'frame' (the plywood gone too: the steel lattice behind the white frame), the layers
    entities/Board.js tears it down to (no emissive map)."""
    def make():
        W, H = 384, 112
        cv, gl = Cv(W, H), Cv(W, H)
        rng = random.Random(seed)
        fx0, fy0, fx1, fy1 = 6, 8, W - 6, 86
        for x in (90, W - 90):                                              # the legs, the catwalk
            frect(cv, x - 3, fy1, x + 3, H - 2, shade(STEEL_L, 0.45))
            frect(cv, x - 3, fy1, x - 2, H - 2, shade(STEEL_L, 0.8))
        frect(cv, fx0 + 4, fy1, fx1 - 4, fy1 + 6, shade(ZINC, 0.4))
        for x in range(fx0 + 6, fx1 - 4, 3):
            frect(cv, x, fy1 + 1, x + 1, fy1 + 5, shade(ZINC, 0.7))
        if face != 'poster':
            if face == 'frame':
                for (a, b, c, d) in ((fx0, fy0, fx1, fy0 + 2), (fx0, fy1 - 2, fx1, fy1), (fx0, fy0, fx0 + 2, fy1), (fx1 - 2, fy0, fx1, fy1)):
                    frect(cv, a, b, c, d, hx('#ece8de'))                      # the white frame, empty
                layer(cv, lambda ly: board_lattice(ly, fx0 + 5, fy0 + 5, fx1 - 5, fy1 - 5, 64, STEEL_L, 3))
            else:
                frect(cv, fx0, fy0, fx1, fy1, hx('#ece8de'))
                board_sheets(cv, fx0 + 2, fy0 + 2, fx1 - 2, fy1 - 2, 64, 'wood', random.Random(seed + 11))
            for x in (60, 150, 240, 330):                                   # the lamps, as on the whole board
                frect(cv, x - 0.5, 1, x + 0.5, fy0, shade(STEEL_L, 0.5))
                fill_shape(cv, x, 2.5, 3.0, 2.0, lambda u, v, L: shade(ZINC, 0.3 + L * 0.6), kind='rect', corner=0.8)
                frect(cv, x - 2, 3.5, x + 2, 4.5, hx('#fff4d8'))
            cv.outline()
            return cv
        frect(cv, fx0, fy0, fx1, fy1, hx('#ece8de'))                         # the frame
        sx1, hor = 128, 58

        def poster(x, y, cur):
            if x < sx1:
                if y >= hor:                                                # the sea, the sun's road on it
                    k = int((y - hor) // 5)
                    c = hx(('#3a2a78', '#2a3a8a', '#1a2a6a', '#122058')[min(3, k)])
                    return mix(c, hx('#ffb24a'), 0.5) if abs(x - 66) < 18 - (y - hor) * 0.6 and int(y) % 3 == 0 else c
                if math.hypot(x - 66, y - hor) < 26 and not (y > hor - 14 and int(y - hor) % 4 in (0, 1)):
                    return hx('#ffd04a') if y < hor - 14 else hx('#ff8a3a')  # the striped sun
                return hx(SUN_BANDS[min(5, int((y - fy0 - 2) / ((hor - fy0) / 6)))])
            return hx('#2a1640')                                            # the violet panel
        px_paint(cv, fx0 + 2, fy0 + 2, fx1 - 2, fy1 - 2, poster)

        def silhouettes(ly):
            ink = hx('#140a1c')
            if scene == 'motel':
                prng = random.Random(seed + 5)
                for (bx, top, lean, size) in ((28, 24, -5, 15), (46, 34, 4, 12)):   # two palms
                    poster_palm(ly, (bx, hor + 2), (bx + lean, top), size, ink, prng)
                frect(ly, 0, 0, fx0 + 2, H, CLEAR)                          # kept inside the face
                frect(ly, 0, 0, W, fy0 + 2, CLEAR)
                fl = hx('#ff6ab0')                                          # the flamingo on one leg
                fill_shape(ly, 98, hor - 10, 8, 5, lambda u, v, L: fl, ang=-0.3)
                fill_capsule(ly, [(104, hor - 13), (108, hor - 26), (104, hor - 32), (100, hor - 30)], 1.3, lambda k, L, s, i, t: fl)
                fill_capsule(ly, [(98, hor - 6), (98, hor + 10)], 0.6, lambda k, L, s, i, t: fl)
            else:
                for cx in (52, 80):                                         # the shades
                    fill_shape(ly, cx, hor - 20, 12, 8, lambda u, v, L: ink, kind='super', p=3)
                    frect(ly, cx - 8, hor - 25, cx - 4, hor - 23, hx('#ff8ad0'))
                frect(ly, 62, hor - 22, 70, hor - 19, ink)
        layer(cv, silhouettes, ol=None)
        neon_words(cv, gl, (sx1 + fx1) / 2, 18, head, DECO_PINK, 3.5)
        neon_words(cv, gl, (sx1 + fx1) / 2, 48, sub, DECO_TEAL, 2.0)
        words(cv, (sx1 + fx1) / 2, 69, small, hx('#efe6d2'), 1.25, centre=True)
        neon_halo(gl, (sx1, fy0, fx1, fy1), DECO_PINK, 2.0, 70)
        px_paint(gl, fx0, fy0, fx1, fy1, lambda x, y, cur: cur if cur[3] else alpha(hx('#ffe8c8'), 34))   # the face lit
        for x in (60, 150, 240, 330):                                       # the lamps on their goosenecks
            frect(cv, x - 0.5, 1, x + 0.5, fy0, shade(STEEL_L, 0.5))
            fill_shape(cv, x, 2.5, 3.0, 2.0, lambda u, v, L: shade(ZINC, 0.3 + L * 0.6), kind='rect', corner=0.8)
            frect(cv, x - 2, 3.5, x + 2, 4.5, hx('#fff4d8'))
            frect(gl, x - 2, 3.5, x + 2, 4.5, hx('#fff8e8'))
        smudge(cv, rng, 16, (fx0, fy0, fx1, fy1), (2.0, 5.0), 0.1)
        for _ in range(6):                                                  # a corner of the paper peeling
            x = rng.uniform(fx0 + 10, fx1 - 10)
            frect(cv, x, fy0 + 2, x + rng.uniform(4, 10), fy0 + 3, hx('#d8d0c0'))
        cv.outline()
        return cv, gl
    return make


def poster_palm(cv, base, top, size, ink, rng):
    """A coconut palm's silhouette as a poster prints it (the billboards'): a trunk tapering and curving from base
    to top, fronds arching out of its head and drooping, each tapering to its tip with its leaflets hanging under it
    in short strokes. size: a frond's reach (world px)."""
    (bx, by), (tx, ty) = base, top
    mx, my = (bx + tx) / 2 + (tx - bx) * 0.25, (by + ty) / 2
    pts = curve((bx, by), (mx, my), (tx, ty), 10)
    for k in range(len(pts) - 1):
        fill_capsule(cv, [pts[k], pts[k + 1]], size * 0.13 * (1.0 - 0.45 * k / (len(pts) - 1)), lambda *a: ink)
    for a in (-2.95, -2.45, -1.95, -1.45, -0.95, -0.45, 0.05, 2.75, 0.4):
        a += rng.uniform(-0.12, 0.12)
        L = size * rng.uniform(0.85, 1.05)
        droop = 0.55 if abs(math.sin(a)) < 0.6 else 0.3
        prev = (tx, ty)
        for q in range(1, 13):
            t = q / 12.0
            p = (tx + math.cos(a) * L * t, ty + math.sin(a) * L * t + droop * L * t * t)
            fill_capsule(cv, [prev, p], max(0.5, size * 0.08 * (1.0 - 0.8 * t)), lambda *a_: ink)
            if 0.2 < t < 0.95:
                lx, ly = p[0] + math.cos(a + 1.6) * size * 0.16 * (1 - t), p[1] + abs(math.sin(a + 1.6)) * size * 0.2 * (1 - t) + size * 0.05
                line(cv, p[0], p[1], lx, ly, ink)                             # its leaflets hang under it
            prev = p
    fill_shape(cv, tx, ty + size * 0.06, size * 0.11, size * 0.09, lambda u, v, L: ink)   # the nuts' cluster


def billboard(kind, face='poster'):
    def make():
        """A billboard on its catwalk from above, laid back to be read, 8 m: the poster in its steel frame (`tan`: a
        sun-tan oil over a striped sunset and the sea, a palm cut out against it; `radio`: a station's sunset over a
        neon grid), paper peeling at a seam, grime down its foot; the catwalk's grating and rail under it, four lamps
        on their arms leaning up over the poster (the emissive map: their lenses). face: 'poster' (whole), 'bare'
        (the paper gone: the steel sheets it was pasted on) or 'frame' (the sheets gone too: the lattice behind),
        the layers entities/Board.js tears it down to (no emissive map)."""
        W, H = 256, 112
        cv, gl = Cv(W, H), Cv(W, H)
        rng = random.Random(9990 + len(kind))
        x0, y0, x1, y1 = 6, 4, W - 6, 86
        n = VNoise(W, H, 8, rng)

        def frame(ly):
            frect(ly, x0 - 3, y0 - 3, x1 + 3, y1 + 3, shade(STEEL_L, 0.35))
            frect(ly, x0 - 3, y0 - 3, x1 + 3, y0 - 2, shade(STEEL_L, 0.8))
        if face == 'frame':
            layer(cv, lambda ly: board_lattice(ly, x0, y0, x1, y1, 48, STEEL_L, 3))
        else:
            layer(cv, frame)
        if face == 'bare':
            board_sheets(cv, x0, y0, x1, y1, 48, 'steel', random.Random(9970 + len(kind)))
        elif face == 'poster':
            if kind == 'tan':
                sky = [(0.0, hx('#8a6ad0')), (0.35, hx('#e070b0')), (0.62, hx('#ff9a8a')), (0.78, hx('#ffc070'))]
                hz = 64.0

                def poster(x, y, cur):
                    t = (y - y0) / (hz - y0)
                    if y >= hz:
                        w = math.floor((y - hz) / (y1 - hz) * 4) / 3.0           # the sea in four flat bands
                        c = mix(hx('#2aa0b0'), hx('#165a80'), min(1.0, w))
                        if abs(x - 188) < 30 - w * 10 and int(y * 2) % 3 == 0:
                            c = mix(c, hx('#ffd080'), 0.55 - w * 0.4)          # the sun's road on the sea
                        return c
                    t = (math.floor(t * 9) + 0.5) / 9                          # the sky in nine flat bands (a print)
                    for (a, ca), (b, cb) in zip(sky, sky[1:] + [(1.0, hx('#ffd890'))]):
                        if t <= b:
                            return mix(ca, cb, (t - a) / (b - a))
                    return sky[-1][1]
                px_paint(cv, x0, y0, x1, y1, poster)

                def sun(x, y, cur):
                    d = math.hypot(x - 188, y - hz)
                    if d > 28 or y > hz:
                        return None
                    if y > hz - 16 and int((hz - y) / 2.5) % 2 == 1:
                        return None                                            # the retro bands cut through it
                    return mix(hx('#fff080'), hx('#ff7a3a'), math.floor((y - (hz - 28)) / 7) / 3.0)   # in flat bands
                px_paint(cv, 160, hz - 30, 218, hz, sun)
                poster_palm(cv, (34, y1), (56, 22), 24, hx('#3a1a4a'), random.Random(9995))
                words(cv, 160 - 66, 10, 'COCOA GOLD', hx('#3a1a4a'), 2.0)      # its shadow, then the words
                words(cv, 160 - 67, 9, 'COCOA GOLD', hx('#fff4e0'), 2.0)
                words(cv, 160 - 30, 28, 'TANNING OIL', hx('#3a1a4a'), 1.0)
                fill_shape(cv, 112, 62, 7.0, 15.0, lambda u, v, L: shade(ramp('#c87a2a', 0.5, 0.26, 0.35), 0.3 + L * 0.7), kind='rect', corner=3.0)
                frect(cv, 109, 44, 115, 48, hx('#f4f0e0'))                    # the bottle: its cap, its label
                frect(cv, 106.5, 57, 117.5, 69, hx('#fff4e0'))
                words(cv, 112, 59, 'SPF', hx('#c8242c'), 0.5, centre=True)
                words(cv, 112, 64, '4', hx('#c8242c'), 0.5, centre=True)
            else:
                hz = 58.0

                def poster(x, y, cur):
                    if y < hz:
                        return mix(hx('#2a1050'), hx('#d0408a'), math.floor((y - y0) / (hz - y0) * 8) / 7.0)   # flat bands
                    w = (y - hz) / (y1 - hz)
                    c = mix(hx('#1a0830'), hx('#2a0a40'), w)
                    gx = (x - W / 2) / (1.0 + w * 4.0)
                    if abs((gx + 300) % 14 - 7) < 0.6 + w * 0.4 or int((w ** 0.5) * 9 * 4) % 4 == 0:
                        c = mix(c, NEON_CYAN, 0.7)                             # the neon grid running away
                    return c
                px_paint(cv, x0, y0, x1, y1, poster)

                def sun(x, y, cur):
                    d = math.hypot(x - W / 2, y - hz)
                    if d > 34 or y > hz or (y > hz - 20 and int((hz - y) / 3) % 2 == 1):
                        return None
                    return mix(hx('#ffe060'), hx('#ff3a8a'), math.floor((y - (hz - 34)) / 34 * 5) / 4.0)
                px_paint(cv, W / 2 - 36, hz - 36, W / 2 + 36, hz, sun)
                words(cv, W / 2 + 1, 13, 'WAVE 98', hx('#1a0830'), 3.0, centre=True)
                words(cv, W / 2, 12, 'WAVE 98', hx('#fff0f8'), 3.0, centre=True)
                words(cv, W / 2 + 0.5, 36.5, 'FM  THE HOTTEST HITS', hx('#1a0830'), 1.0, centre=True)   # its shadow: read over the sun
                words(cv, W / 2, 36, 'FM  THE HOTTEST HITS', NEON_CYAN, 1.0, centre=True)
            # paper and weather: the seams of the sheets, a peeled strip, grime down its foot, droppings on its top
            for x in range(x0 + 48, x1, 48):
                px_paint(cv, x, y0, x + 0.5, y1, lambda x_, y_, c: dk(c, 0.12))
            px_paint(cv, x1 - 30, y0, x1, y0 + 14, lambda x, y, c: (hx('#e8e2d0') if (x - (x1 - 30)) + (y - y0) * 1.6 > 18 + n(x, y) * 6 else None))
            for y in range(int(y1) - 10, int(y1)):
                px_paint(cv, x0, y, x1, y + 1, lambda x, y_, c: dk(c, (y_ - (y1 - 10)) / 10 * 0.35 * n(x, y_)))
            smudge(cv, rng, 8, (x0, y0, x1, y0 + 4), (0.5, 1.0), 0.6, hx('#ece8dc'))
        cv.outline()

        def catwalk(ly):
            frect(ly, x0 - 2, y1 + 3, x1 + 2, y1 + 15, shade(STEEL_L, 0.4))
            for x in range(int(x0), int(x1), 2):
                frect(ly, x, y1 + 4, x + 1, y1 + 14, shade(STEEL_L, 0.22))  # its grating
            frect(ly, x0 - 2, y1 + 14, x1 + 2, y1 + 15.5, shade(STEEL_L, 0.75))   # the rail
            for x in (40, 128, 216):
                fill_shape(ly, x, y1 + 20, 4.0, 3.0, lambda u, v, L: shade(STEEL_L, 0.2 + L * 0.6), kind='rect', corner=1.0)   # the legs' tops
        layer(cv, catwalk)
        for x in (38.0, 102.0, 154.0, 218.0):                              # the lamps on their arms
            fill_capsule(cv, [(x, y1 + 12), (x, y1 - 6)], 1.0, lambda k, L, s, i, t: shade(STEEL_L, L))
            fill_shape(cv, x, y1 - 8, 5.0, 2.6, lambda u, v, L: shade(ramp('#4e5362', 0.5, 0.25, 0.4), 0.2 + L * 0.6), kind='rect', corner=1.0)
            frect(cv, x - 4, y1 - 8, x + 4, y1 - 6.5, hx('#fff6dc'))
            frect(gl, x - 4, y1 - 8, x + 4, y1 - 6.5, hx('#fff0d0'))
        return (cv, gl) if face == 'poster' else cv
    return make


GROUP = 'props'
SPRITES = {
    'billboard_motel': (billboard_ad('FLAMINGO', 'MOTEL', 'VACANCY  COLOR TV  POOL', 10151, 'motel'), (384, 112), 'fine glow hung'),
    'billboard_motel_bare': (billboard_ad('', '', '', 10151, 'motel', 'bare'), (384, 112), 'fine'),
    'billboard_motel_frame': (billboard_ad('', '', '', 10151, 'motel', 'frame'), (384, 112), 'fine'),
    'billboard_tan': (billboard('tan'), (256, 112), 'fine glow hung'),
    'billboard_radio': (billboard('radio'), (256, 112), 'fine glow hung'),
    'billboard_tan_bare': (billboard('tan', 'bare'), (256, 112), 'fine'),
    'billboard_tan_frame': (billboard('tan', 'frame'), (256, 112), 'fine'),
    'billboard_radio_bare': (billboard('radio', 'bare'), (256, 112), 'fine'),
    'billboard_radio_frame': (billboard('radio', 'frame'), (256, 112), 'fine'),
}
