"""The level's devices and fittings (src/game/data/devices.js and the rest): fuse box, cash case, fan, mirror
ball, vending machines, pipes, a manhole, the toilets' stalls, doormats, stairs, the street's floor paint, a bike..."""
import math
import random

from .core import (
    alpha, bevel_edges, chrome_bar, CLEAR, crease, Cv, dash, dk, fgrain, fill_capsule, fill_shape, frect, hx, layer,
    light, line, lt, mix, px_paint, ramp, ring, shade, shift, smudge, stud, VNoise, wood_fill
)
from .palette import (
    BRASS, CHROME, GRAPHITE, GUNMETAL, IRON_GREY, KHAKI, PALE_STEEL, PARCHMENT, PURE_WHITE, PUTTY, RUBBER,
    SIGNAL_YELLOW, SILVER_GREY, SOOT, STEEL_GREY
)
from .type import FONT_TUBE, inked


def p_fuse_box():
    """The house's fuse box on an outside wall (-y), from above: the conduit along the wall and its clips, a grey steel
    cabinet with its rain hood, the seam of its two doors and their hinges, a yellow hazard plate, the meter's round
    window, the red handle of the main switch, a padlock, rust weeping from the hood."""
    cv = Cv(26, 11)
    frect(cv, 0, 0, 26, 1.5, hx('#4a4e58'))                            # the conduit along the wall
    frect(cv, 0, 0, 26, 0.5, hx('#6e737e'))
    for x in (2.0, 23.0):
        frect(cv, x, 0, x + 1.0, 1.5, hx('#8a909c'))
    st = ramp('#8a909c', 0.45, 0.22, 0.4)
    fill_shape(cv, 13.0, 5.4, 9.0, 3.6, lambda u, v, L: shade(st, L), kind='rect', bevel=0.8, corner=0.5)
    frect(cv, 4.0, 1.8, 22.0, 2.6, st[3])                              # its rain hood
    frect(cv, 4.0, 2.6, 22.0, 3.0, st[0])
    frect(cv, 12.75, 3.0, 13.25, 8.8, hx('#4e535e'))                   # the doors' seam
    for x in (4.5, 21.0):
        frect(cv, x, 3.5, x + 0.5, 8.5, hx('#5e636e'))                 # their hinges
    fill_shape(cv, 8.0, 5.8, 2.4, 1.8, lambda u, v, L: hx('#f0c81e'), kind='rect', corner=0.2)   # hazard plate
    for (x, y) in ((8.5, 4.5), (8.0, 5.0), (7.5, 5.5), (8.0, 5.5), (8.5, 5.5), (8.0, 6.0), (7.5, 6.5)):
        cv.dot(x, y, hx('#2a2410'))                                    # its bolt
    ring(cv, 15.4, 5.6, 1.1, 1.5, lambda dx, dy, d: shade(CHROME, light(dx / d, dy / d)))   # the meter's window
    fill_shape(cv, 15.4, 5.6, 1.1, 1.1, lambda u, v, L: hx('#cfe8f4') if u + v < -0.5 else hx('#7aa8c0'))
    line(cv, 15.4, 5.6, 16.0, 5.0, hx('#c02020'))
    fill_shape(cv, 19.0, 5.6, 1.4, 1.8, lambda u, v, L: shade(ramp('#c2281e', 0.45, 0.22, 0.4), L), kind='rect', corner=0.4)   # main switch
    fill_shape(cv, 13.0, 8.4, 0.7, 0.6, lambda u, v, L: shade(ramp('#c8a050', 0.45, 0.22, 0.4), L), kind='rect', corner=0.3)   # padlock
    smudge(cv, random.Random(5015), 4, (5, 3, 21, 9), (0.5, 1.2), 0.5, hx('#7a3e1a'))
    cv.outline()
    return cv


def p_emergency_light():
    """A small battery lamp on a wall (-y): a dark case and one red lens, dull until the mains fail (the user wanted a
    single discreet one, not two heads)."""
    cv, gl = Cv(8, 5), Cv(8, 5)
    case = ramp('#4a4650', 0.45, 0.22, 0.35)
    fill_shape(cv, 4.0, 1.6, 3.2, 1.4, lambda u, v, L: shade(case, L), kind='rect', corner=0.5, bevel=0.5)
    fill_shape(cv, 4.0, 3.2, 1.3, 1.1, lambda u, v, L: hx('#9a3a30') if L > 0.6 else hx('#6a221c'))
    cv.dot(3.6, 2.9, hx('#c86a5a'))
    fill_shape(gl, 4.0, 3.2, 1.5, 1.3, lambda u, v, L: (255, 110, 80, 190))
    fill_shape(gl, 4.0, 3.2, 0.6, 0.6, lambda u, v, L: (255, 220, 200, 255))
    cv.outline()
    return cv, gl


def p_cash_case():
    """The boss's attache case lying open, its lid thrown back (-y): the lid's red lining and elastic pocket, the brass
    hinges, banded wads of notes in two rows in the black shell, the chrome latches and the handle at +y."""
    cv = Cv(22, 16)
    shell = ramp('#26262e', 0.45, 0.22, 0.4)
    fill_shape(cv, 11.0, 3.6, 10.0, 2.6, lambda u, v, L: shade(shell, L), kind='rect', bevel=0.8, corner=0.8)   # the lid
    fill_shape(cv, 11.0, 3.6, 9.0, 1.8, lambda u, v, L: shade(ramp('#6a1e2a', 0.45, 0.22, 0.3), 1.0 - L * 0.6), kind='rect', corner=0.4)
    dash(cv, 3.0, 3.4, 19.0, 3.4, hx('#8a3040'), 1, 1)                 # the pocket's elastic
    frect(cv, 1.0, 6.2, 21.0, 6.8, hx('#0e0e12'))                      # the hinge line
    for x in (4.0, 16.0):
        frect(cv, x, 6.0, x + 2.0, 7.0, hx('#c8a050'))
        frect(cv, x, 6.0, x + 2.0, 6.5, hx('#f0d080'))
    fill_shape(cv, 11.0, 10.9, 10.0, 4.1, lambda u, v, L: shade(shell, L), kind='rect', bevel=0.8, corner=0.8)
    frect(cv, 2.0, 7.6, 20.0, 14.0, hx('#121216'))
    note = ramp('#6a9a5a', 0.45, 0.22, 0.3)
    for i, x in enumerate((2.4, 8.4, 14.4)):
        for j, y in enumerate((7.8, 11.0)):
            def wad(px, py, c, x=x, y=y):
                t = (py - y) / 2.8
                col = shade(note, 0.82 - t * 0.5)
                if int(py * 2) % 2 and px > x + 4.6:
                    col = dk(col, 0.15)                                # the edges of the notes
                if x + 2.2 <= px < x + 3.2:
                    col = hx('#f2ead0') if t < 0.6 else hx('#c8c0a4')  # the paper band
                return col
            px_paint(cv, x, y, x + 5.2, y + 2.8, wad)
            cv.dot(x + 2.5, y + 1.0, KHAKI)
    for x in (5.0, 15.5):                                              # latches
        chrome_bar(cv, x, 14.2, x + 1.5, 15.0)
    fill_capsule(cv, [(9.0, 15.0), (13.0, 15.0)], 0.5, lambda k, L, s, i, t: shade(RUBBER, L))   # the handle
    cv.outline()
    return cv


def p_ceiling_fan():
    """Ceiling fan from above: four dark wood paddles on brass irons, the motor housing with its cap, see-through enough
    to read who stands under it (the game spins it)."""
    cv, hub = Cv(44, 44), Cv(44, 44)
    wood = (hx('#2c2228', 200), hx('#3a2c30', 205), hx('#a8927a', 215))   # dark varnish: it has to read on a wooden floor
    c = 22.0
    for k in range(4):
        a = k * math.pi / 2

        def blade(u, v, L):
            col = wood[2] if v < -1.45 else wood[1] if L > 0.6 else wood[0]   # the leading edge catches the light
            return col
        bx, by = c + math.cos(a) * 13.0, c + math.sin(a) * 13.0
        fill_shape(cv, bx, by, 8.0, 2.0, blade, ang=a, kind='rect', corner=1.6, bevel=0.6)
        fill_capsule(hub, [(c + math.cos(a) * 3.5, c + math.sin(a) * 3.5), (c + math.cos(a) * 7.5, c + math.sin(a) * 7.5)], 0.7,
                     lambda kk, L, s, i, t: shade(ramp('#c9a24a', 0.45, 0.22, 0.4), L))   # the blade iron
    fill_shape(hub, c, c, 4.4, 4.4, lambda u, v, L: shade(ramp('#3a3a46', 0.45, 0.22, 0.45), L))   # motor
    ring(hub, c, c, 3.0, 3.4, lambda dx, dy, d: hx('#24242c'))
    fill_shape(hub, c, c, 1.6, 1.6, lambda u, v, L: shade(ramp('#c9a24a', 0.45, 0.22, 0.45), L))   # the brass cap
    hub.outline()
    cv.over(hub)
    return cv


def p_mirror_ball():
    """Mirror ball from above: rows of little square mirrors on a sphere, each catching the light its own way, the
    hot ones near the top left, the grout between them."""
    cv = Cv(12, 12)
    rng = random.Random(5090)

    jit_ = dict(((x, y), rng.uniform(-0.3, 0.3)) for x in range(12) for y in range(12))

    def ball(u, v, L):
        x, y = int(6.0 + u), int(6.0 + v)
        k = jit_[(x, y)]
        col = shade(ramp('#8892a6', 0.5, 0.25, 0.6), L + k)
        if ((6.0 + u) % 1.0) > 0.5 and ((6.0 + v) % 1.0) > 0.5:
            col = dk(col, 0.12)                                        # the grout at a mirror's corner
        return col
    fill_shape(cv, 6.0, 6.0, 5.0, 5.0, ball)
    for (x, y) in ((3.5, 3.5), (5.0, 2.5), (2.5, 5.5)):
        cv.dot(x, y, PURE_WHITE)
    cv.outline()
    return cv


def p_extinguisher():
    """Wall extinguisher on its bracket (the wall at -y), from above: the strap, the red cylinder's domed top, the black
    valve head with its lever and the gauge, the pin's yellow tag, the hose down its side."""
    cv = Cv(8, 11)
    frect(cv, 1.0, 1.0, 7.0, 2.5, hx('#5a5a66'))                       # the bracket on the wall
    frect(cv, 1.0, 1.0, 7.0, 1.5, hx('#8a8a96'))
    red = ramp('#c0202a', 0.5, 0.25, 0.4)
    fill_shape(cv, 4.0, 6.4, 3.0, 3.6, lambda u, v, L: shade(red, L))
    frect(cv, 1.0, 5.6, 7.0, 6.1, lambda c: dk(c, 0.2) if c[3] else None)   # the strap round it
    fill_shape(cv, 3.6, 6.0, 1.3, 1.1, lambda u, v, L: shade(ramp('#26242c', 0.45, 0.22, 0.5), L), kind='rect', corner=0.4)   # valve head
    fill_capsule(cv, [(3.6, 6.0), (3.6, 9.4)], 0.42, lambda k, L, s, i, t: shade(ramp('#3a3844', 0.45, 0.22, 0.5), L))   # its lever
    cv.dot(2.75, 5.25, hx('#f4f4ec'))                                  # the gauge
    cv.dot(3.0, 5.5, hx('#3aa85a'))
    cv.dot(4.75, 5.5, hx('#f2c81e'))                                   # the pin's tag
    fill_capsule(cv, [(4.8, 6.6), (6.0, 7.4), (6.4, 9.6)], 0.4, lambda k, L, s, i, t: shade(RUBBER, L))   # the hose
    cv.outline()
    return cv


def p_vending():
    """Street drinks machine from above, its lit front along +y: a dull red top dented and stickered, its vents, the
    logo's stripe, the glowing panel with the cans behind it and the buttons."""
    cv = Cv(28, 22)
    red = ramp('#7a2630', 0.45, 0.22, 0.25)

    def top(x, y, c):
        col = shade(red, 0.62 - (y - 1) / 15 * 0.2 + (0.18 if y < 2.5 else 0.0))
        if 3 < y < 5:
            col = lt(col, 0.1)                                         # what the street lamp leaves on it
        return col
    px_paint(cv, 1, 1, 27, 17, top)
    frect(cv, 1, 1, 27, 1.5, red[0])
    fill_shape(cv, 8.0, 9.5, 4.0, 2.6, lambda u, v, L: shade(red, 1.0 - L * 0.8), kind='rect', corner=0.6, bevel=0.8)   # a sunken panel
    for x in (17, 19, 21, 23):
        frect(cv, x, 7, x + 1, 12, dk(red[0], 0.25))                   # vents, lit on their lip
        frect(cv, x, 7, x + 1, 7.5, lt(red[2], 0.2))
    frect(cv, 3, 14.5, 25, 16, hx('#f2ece0'))                         # the logo's stripe over the front
    frect(cv, 5, 15, 13, 15.5, hx('#c81e28'))
    frect(cv, 14, 15, 17, 15.5, GRAPHITE)
    fill_shape(cv, 22.0, 9.0, 1.4, 1.0, lambda u, v, L: SIGNAL_YELLOW, ang=0.3, kind='rect', corner=0.2)   # a sticker
    smudge(cv, random.Random(4991), 4, (2, 2, 26, 13), (1.0, 2.2), 0.18)
    stud(cv, 2.0, 2.5, red[1])
    stud(cv, 25.5, 2.5, red[1])

    def front(x, y, c):
        col = hx('#f2f6ff') if y < 17.5 or y >= 20.5 else hx('#dce6f4')
        u = x - 2.0
        if 17.5 <= y < 20.5 and 0 <= u < 23 and u % 2.5 < 1.5:
            col = (hx('#ff5a6a'), hx('#58d8f0'), hx('#ffd84a'))[int(u // 7.5) % 3]   # the cans, three brands
            if y < 18.0:
                col = lt(col, 0.4)
        return col
    px_paint(cv, 1, 17, 27, 21, front)
    cv.outline()
    return cv


def p_phone_booth():
    """Phone booth from above, open along +y: steel frame, a tinted glass roof the phone shows through, a lit header,
    the receiver on its hook, the directory hanging on its chain."""
    cv, fr = Cv(26, 26), Cv(26, 26)
    steel = ramp('#5a6270', 0.45, 0.22, 0.4)
    frect(cv, 2, 2, 24, 24, hx('#8fd0e6', 70))
    for i in range(4, 21):                          # a glint across the glass
        cv.dot(i + 0.5, 24.5 - i, hx('#eaf8ff', 120))
        cv.dot(i + 1.0, 24.5 - i, hx('#eaf8ff', 60))

    def frame(x, y, c):
        edge = min(x - 1, y - 1, 25 - x)
        return steel[3] if edge < 0.5 and (x < 1.5 or y < 1.5) else steel[2] if edge < 1.0 else steel[1]
    for (x0, y0, x1, y1) in ((1, 1, 25, 3), (1, 1, 3, 25), (23, 1, 25, 25), (1, 23, 5, 25), (21, 23, 25, 25)):
        px_paint(fr, x0, y0, x1, y1, frame)
    frect(fr, 3, 3, 23, 5, hx('#dff4ff'))           # lit header
    frect(fr, 3, 4.5, 23, 5, hx('#a8d8f0'))
    fill_shape(fr, 11.5, 7.5, 3.6, 2.6, lambda u, v, L: shade(ramp('#343a46', 0.45, 0.22, 0.4), L), kind='rect', corner=0.6, bevel=0.8)   # the phone
    for k in range(9):                              # its keys
        fr.dot(9.5 + (k % 3) * 1.0, 6.5 + (k // 3) * 1.0, hx('#c8ccd8') if k != 4 else hx('#f0f2f8'))
    fill_capsule(fr, [(13.6, 6.0), (13.6, 9.4)], 0.6, lambda k, L, s, i, t: shade(ramp('#2a2e38', 0.4, 0.2, 0.5), L))   # the receiver
    fr.dot(14.5, 6.0, SIGNAL_YELLOW)                # coin slot
    fill_shape(fr, 5.4, 12.0, 1.2, 2.4, lambda u, v, L: hx('#f0e080') if L > 0.6 else hx('#c8b860'), kind='rect', corner=0.3, bevel=0.5)   # the directory
    line(fr, 5.4, 9.6, 6.2, 5.0, SILVER_GREY)     # its chain
    fr.outline()
    cv.over(fr)
    return cv


def p_parking_meter():
    """Parking meter head from above: a grey cast dome, its window with the red EXPIRED flag up, the coin slot."""
    cv = Cv(7, 8)
    fill_shape(cv, 3.5, 3.8, 2.6, 2.9, lambda u, v, L: shade(ramp('#8a909c', 0.5, 0.25, 0.45), L), kind='rect', bevel=1.2, corner=1.2)
    frect(cv, 2.0, 2.5, 5.0, 4.5, hx('#1c2028'))                       # the window
    frect(cv, 2.0, 2.5, 5.0, 3.0, hx('#5a7a8a'))
    frect(cv, 3.0, 3.0, 4.5, 4.0, hx('#e03030'))                       # the flag
    frect(cv, 3.0, 3.0, 4.5, 3.5, hx('#ff7060'))
    frect(cv, 2.5, 5.5, 4.5, 6.0, hx('#2a2e36'))                       # the coin slot
    cv.outline()
    return cv


def p_news_box():
    """Newspaper box from above: blue steel, the front page under its window (front along +y), the coin slot, the
    hinge of the lid, chipped paint and stickers."""
    cv = Cv(16, 13)
    blue = ramp('#2a5aa8', 0.45, 0.22, 0.35)

    def box(x, y, c):
        return shade(blue, 0.85 if y < 2.0 else 0.38 if y >= 10.5 else 0.62)
    px_paint(cv, 1, 1, 15, 12, box)
    frect(cv, 1, 2.5, 15, 3, dk(blue[1], 0.2))                         # the lid's hinge
    for x in (3.0, 12.5):
        frect(cv, x, 2.5, x + 0.5, 3, blue[3])

    def paper(x, y, c):
        if y < 4.5 or y >= 9.0 or x < 3.0 or x >= 13.0:
            return hx('#2a3a5a')                                       # the window's frame
        col = hx('#ece8dc')
        if 5.0 <= y < 6.0 and 3.5 <= x < 12.0:
            col = GRAPHITE                                        # the headline
        elif 6.5 <= y < 8.5 and 3.5 <= x < 6.5:
            col = hx('#8a8a90') if int(y * 2) % 2 else hx('#b8b4a8')   # a photograph
        elif 6.5 <= y < 8.5 and x >= 7.0 and int(y * 2) % 2 == 0:
            col = hx('#a8a8b0')                                        # its columns
        return col
    px_paint(cv, 2.5, 4, 13.5, 9.5, paper)
    for i in range(3, 13):
        cv.bpx(i * 2 + 4, 9, (255, 255, 255, 50))                      # the glass catching the light
    fill_shape(cv, 13.4, 10.8, 0.6, 0.4, lambda u, v, L: hx('#d8d8e0'), kind='rect', corner=0.1)   # coin slot
    smudge(cv, random.Random(5101), 4, (1, 1, 15, 12), (0.4, 0.9), 0.6, SILVER_GREY)   # chipped to the steel
    fill_shape(cv, 3.0, 1.7, 1.0, 0.5, lambda u, v, L: SIGNAL_YELLOW, kind='rect', corner=0.1)   # a sticker
    cv.outline()
    return cv


def pipe(body, lite, shade_, band):
    """A run of pipe along a wall (the wall at -y): a round tube lit along its top, clamps bolted into the wall, two
    flanges with their bolts, painted bands, rust and drips from the joints."""
    def make():
        cv = Cv(96, 6)
        tube = (hx(shade_), mix(hx(shade_), hx(body), 0.5), hx(body), hx(lite))

        def f(x, y, c):
            t = (y - 2.0) / 3.0
            col = shade(tube, 0.95 - t * 0.85)
            if 0.12 < t < 0.3:
                col = lt(tube[3], 0.15)
            return col
        px_paint(cv, 0, 2, 96, 5, f)
        for x in (10.0, 47.0, 84.0):                                    # clamps into the wall
            frect(cv, x, 0.5, x + 2.0, 5.5, hx('#3a3a44'))
            frect(cv, x, 0.5, x + 2.0, 1.0, hx('#6a6a76'))
            stud(cv, x + 0.5, 1.0, hx('#8a8a96'))
        for x in (30.0, 66.0):                                          # flanges and painted bands
            frect(cv, x, 1.0, x + 1.5, 5.5, hx(band))
            frect(cv, x, 1.0, x + 0.5, 5.5, lt(hx(band), 0.2))
            for y in (1.5, 4.5):
                stud(cv, x + 0.5, y, dk(hx(band), 0.3))
        smudge(cv, random.Random(len(body) + ord(body[1])), 10, (0, 2, 96, 5), (0.6, 1.6), 0.4, hx('#7a3e1a'))
        cv.outline()
        return cv
    return make


def p_wall_vent():
    """Extractor outlet on a wall (the wall at -y): a steel box, its louvres each lit on the lip, the screws, soot
    blown out over it."""
    cv = Cv(16, 7)
    st = ramp('#6a707c', 0.45, 0.22, 0.4)
    fill_shape(cv, 8.0, 3.0, 7.0, 2.0, lambda u, v, L: shade(st, L), kind='rect', bevel=0.7, corner=0.4)
    for x in range(3, 13, 2):
        frect(cv, x, 2.0, x + 1.0, 4.5, hx('#1c2028'))
        frect(cv, x, 2.0, x + 1.0, 2.5, lt(st[3], 0.1))
    for x in (1.5, 14.0):
        stud(cv, x, 2.5, st[1])
    smudge(cv, random.Random(5249), 4, (2, 1, 14, 5), (1.0, 2.0), 0.25)   # soot
    cv.outline()
    return cv


def p_manhole():
    """Manhole cover, painted on the road: cast iron worn smooth on its raised diamond pattern, the frame round it, two
    pick holes, the city's ring of letters, rust in the hollows."""
    cv = Cv(16, 16)
    iron = ramp('#30323a', 0.45, 0.22, 0.35)
    rng = random.Random(5260)
    c = 7.5

    def disc(x, y, col):
        dx, dy = x - c - 0.5, y - c - 0.5
        d = math.hypot(dx, dy)
        if d >= 7.4:
            return None
        if d > 6.4:
            return shade(iron, 0.3 + 0.5 * light(dx / d, dy / d)) if d > 6.9 else hx('#0e1014')   # frame, the gap
        if 5.0 < d <= 5.8:
            return dk(iron[1], 0.1) if int(math.atan2(dy, dx) * 9) % 3 else lt(iron[2], 0.1)   # the letters
        u, v = (dx + dy) * 0.7071, (dx - dy) * 0.7071
        if (u % 2.2 < 0.75) or (v % 2.2 < 0.75):
            return lt(iron[2], 0.1) if dx + dy < 0 else iron[2]        # raised diamond ribs, worn shiny
        return dk(iron[2], 0.18)
    px_paint(cv, 0, 0, 16, 16, disc)
    for (x, y) in ((5.0, 7.5), (10.0, 7.5)):
        fill_shape(cv, x + 0.5, y + 0.5, 0.6, 0.4, lambda u, v, L: hx('#08090c'), kind='rect', corner=0.2)   # pick holes
    smudge(cv, rng, 3, (2, 2, 14, 14), (0.6, 1.2), 0.3, hx('#6a3a1c'))
    return cv


def p_cardboard_bed():
    """Flattened cardboard boxes someone sleeps on, painted on the ground: kraft board with the corrugation showing
    through, the folds of the flaps, a printed logo half gone, brown tape, water stains and torn corners."""
    W, H = 36, 20
    cv = Cv(W, H)
    rng = random.Random(77)
    base = ramp('#a5855a', 0.4, 0.2, 0.25)
    nz = VNoise(W, H, 4, rng)

    def board(x, y, c):
        col = shade(base, 0.6 + (nz(x, y) - 0.5) * 0.3)
        if int(y * 2) % 3 == 0:
            col = shift(col, -4)                                       # the flutes under the liner
        if x < 18 and 1 <= y < 10 and x > 0.5:
            col = shift(col, 6)                                        # one box lighter than the other
        return col
    px_paint(cv, 0.5, 0.5, W - 0.5, H - 0.5, board)
    for x in (12.0, 24.5):                                             # where the flaps fold
        crease(cv, [(x, 1.0), (x + 0.3, H - 1.0)], 0.2)
    crease(cv, [(1.0, 10.0), (W - 1.0, 10.3)], 0.14)                   # the seam between two boxes
    for (x0, y0, x1, y1) in ((14.0, 4.0, 22.0, 5.5), (2.0, 13.0, 8.0, 14.0)):
        frect(cv, x0, y0, x1, y1, lambda c: mix(c, hx('#7a5a30'), 0.6))   # tape
        frect(cv, x0, y0, x1, y0 + 0.5, lambda c: lt(c, 0.12))
    for (x, y) in ((28.0, 4.0), (29.5, 4.0), (31.0, 4.0), (28.0, 5.5), (31.0, 5.5)):
        frect(cv, x, y, x + 1.0, y + 0.5, lambda c: mix(c, hx('#2a3a6a'), 0.45))   # what is left of a logo
    smudge(cv, rng, 4, (2, 2, 34, 18), (2.0, 4.0), 0.22)                # water stains
    smudge(cv, rng, 3, (2, 2, 34, 18), (1.0, 2.0), 0.2, hx('#5a4430'))
    bevel_edges(cv, 0, 0, W - 1, H - 1, 0.1, 0.3)
    for (x0, y0, x1, y1) in ((0, 0, 2, 1), (0, 1, 1, 2), (W - 2, H - 1, W, H), (W - 1, H - 2, W, H - 1), (W - 1, 0, W, 1),
                             (20, H - 0.5, 23, H)):
        frect(cv, x0, y0, x1, y1, CLEAR)                               # torn corners
    return cv


def flipped_table(W, wood, leg, face=None, feet=4):
    """A table tipped on its side, seen from above: its top on edge along -y (a sliver of its upper face on the outside,
    the thickness of the board with its end grain), the apron and the legs lying on the floor behind it with their
    turnings and brackets (or the one pedestal and its round foot)."""
    def paint():
        H = 27
        cv = Cv(W, H)
        base, lg = hx(wood), ramp(leg, 0.45, 0.22, 0.35)
        rng = random.Random(W * 7 + feet)
        if face:
            frect(cv, 1, 1, W - 1, 3, lambda c: hx(face))              # the felt, seen past the rail
            frect(cv, 1, 1, W - 1, 1.5, lt(hx(face), 0.2))
            dash(cv, 1.5, 2.5, W - 1.5, 2.5, dk(hx(face), 0.25), 1, 1)
        else:
            wood_fill(cv, 1, 1, W - 2, 2, lt(base, 0.2), plank=9, rng=rng)   # the varnished top, a sliver of it
            frect(cv, 1, 1, W - 1, 1.5, lt(base, 0.4))
        wood_fill(cv, 1, 3, W - 2, 6, base, plank=9, rng=rng)            # the board's thickness, on edge
        frect(cv, 1, 3, W - 1, 3.5, lt(base, 0.18))
        frect(cv, 1, 6, W - 1, 7, dk(base, 0.38))
        px_paint(cv, 1, 3.5, W - 1, 6, lambda x, y, c: dk(c, 0.12) if int(x * 2) % 5 == 0 else None)   # end grain
        smudge(cv, rng, 4, (2, 2, W - 2, 6), (0.8, 1.6), 0.25, hx('#e0c49a'))   # knocks through the varnish
        frect(cv, 1, 1, 2, 2, CLEAR)
        frect(cv, W - 2, 1, W - 1, 2, CLEAR)

        def post(pts, r):
            fill_capsule(cv, pts, r, lambda k, L, s, i, t: (dk(lg[1], 0.2) if 0.08 < t < 0.12 or 0.86 < t < 0.9 else shade(lg, L))
                         if t < 0.94 else shade(ramp('#9aa0ac', 0.45, 0.22, 0.4), L))   # turned rings, a steel foot
        if feet == 4:
            frect(cv, 6, 7, W - 6, 8.5, dk(base, 0.22))                # the apron under the top
            frect(cv, 6, 8, W - 6, 8.5, dk(base, 0.4))
            for x0 in (5.5, W - 5.5):
                post([(x0, 7.0), (x0, H - 2.4)], 1.35)
                frect(cv, x0 - 2.5, 7.0, x0 + 2.5, 9.0, hx('#5a5e68'))  # the corner bracket
                stud(cv, x0 - 1.5, 7.5, SILVER_GREY)
                stud(cv, x0 + 1.0, 7.5, SILVER_GREY)
        else:
            c = W / 2
            post([(c, 7.0), (c, H - 5.5)], 1.7)
            fill_shape(cv, c, H - 3.8, 7.0, 1.6, lambda u, v, L: shade(lg, L), kind='rect', corner=1.2, bevel=0.8)   # its foot, on edge
        cv.outline()
        return cv
    return paint


def p_ladder():
    """A fixed steel ladder filling its gap in a wall, seen from above: two round rails along the climb (y), rungs
    across with their welds, hand hoops at both ends; its shadow falls to the lower right, as off something that stands
    clear of the floor. Pale: it must be seen in the dark."""
    cv = Cv(32, 32)
    tube = ramp('#aab2c6', 0.45, 0.22, 0.4)
    sh = (8, 6, 16, 110)

    def paint(ly, shadow, dx=0.0, dy=0.0):
        col = (lambda k, L, s, i, t: sh) if shadow else (lambda k, L, s, i, t: lt(tube[3], 0.3) if L > 0.92 else shade(tube, L))
        for x0 in (7.5, 23.5):
            fill_capsule(ly, [(x0 + dx, 2.5 + dy), (x0 + dx, 29.5 + dy)], 1.3, col)
        for y in range(4, 29, 4):
            fill_capsule(ly, [(8.8 + dx, y + 0.5 + dy), (22.2 + dx, y + 0.5 + dy)], 0.75, col)
        for y0 in (1.2, 30.4):
            fill_capsule(ly, [(5.5 + dx, y0 + dy), (25.5 + dx, y0 + dy)], 0.7, col)
    shadow = Cv(32, 32)
    paint(shadow, True, 2.0, 2.0)
    cv.over(shadow)
    rails = Cv(32, 32)
    paint(rails, False)
    for y in range(4, 29, 4):
        for x0 in (8.6, 22.0):
            stud(rails, x0, y + 0.25, tube[1])                         # the welds
    smudge(rails, random.Random(5334), 6, (6, 2, 26, 30), (0.4, 0.9), 0.4, hx('#8a5a3a'))   # rust where the paint went
    cv.over(rails)
    return cv


def p_parapet():
    """The low wall at the edge of a roof where one can swing a leg over: concrete coping slabs on a course of brick,
    their joints, a crack, lichen, worn pale in the middle by everybody who has."""
    cv = Cv(34, 12)
    rng = random.Random(77)
    stone = ramp('#b0aaa0', 0.45, 0.22, 0.3)
    brick = hx('#7a4a40')
    nz = VNoise(34, 12, 2, rng)

    def course(x, y, c):
        k = int((x + (0.0 if y < 6 else 2.0)) / 4.0)
        col = shift(dk(brick, 0.1), [-6, 3, -2, 6, 0, -4, 4, -1, 2, 5][k % 10])
        if (x + (0.0 if y < 6 else 2.0)) % 4.0 < 0.5:
            col = hx('#5a5048')                                        # mortar
        return col
    px_paint(cv, 1, 1, 33, 2, course)
    px_paint(cv, 1, 10, 33, 11, course)

    def coping(x, y, c):
        col = shade(stone, 0.62 + (nz(x, y) - 0.5) * 0.18)
        if y < 2.5:
            col = shade(stone, 0.95)                                   # the rounded lip, lit
        elif y >= 9.5:
            col = shade(stone, 0.25)
        if abs(x - 17) < 6 and 3 <= y < 9:
            col = lt(col, 0.07 * (1 - abs(x - 17) / 6))                # worn pale
        return col
    px_paint(cv, 1, 2, 33, 10, coping)
    for x in (11.0, 22.5):                                             # the slabs' joints
        frect(cv, x, 2, x + 0.5, 10, dk(stone[1], 0.25))
        frect(cv, x + 0.5, 2, x + 1.0, 10, lt(stone[2], 0.1))
    line(cv, 26.0, 3.0, 27.5, 6.0, dk(stone[1], 0.2))                  # a crack
    line(cv, 27.5, 6.0, 27.0, 8.5, dk(stone[1], 0.2))
    smudge(cv, rng, 4, (2, 3, 32, 9), (0.6, 1.2), 0.45, hx('#8a9a5a'))   # lichen
    smudge(cv, rng, 3, (2, 3, 32, 9), (1.0, 2.0), 0.15)
    cv.outline()
    return cv


def p_urinal():
    """A wall urinal from above (the wall at -y): its back against the wall with the chrome flush valve, the bowl
    open toward the room, the drain and its cake, a ring of scale."""
    cv = Cv(14, 12)
    wh = ramp('#ecebf0', 0.4, 0.18, 0.2)

    def body(ly):
        fill_shape(ly, 7.0, 3.2, 5.6, 2.2, lambda u, v, L: shade(wh, L), kind='rect', bevel=1.2, corner=1.0)
        fill_shape(ly, 7.0, 6.0, 4.6, 4.4, lambda u, v, L: lt(wh[3], 0.2) if L > 0.97 else shade(wh, L))
        fill_shape(ly, 7.0, 6.2, 2.8, 2.8, lambda u, v, L: shade(ramp('#dcd8c8', 0.4, 0.2, 0.2), 1.1 - L * 0.7))
        ring(ly, 7.0, 6.4, 2.2, 2.8, lambda dx, dy, d: hx('#c8bc98') if dy > 0 else None)    # the scale
        fill_shape(ly, 7.0, 7.2, 1.0, 0.8, lambda u, v, L: hx('#5a8a6a') if L > 0.5 else hx('#3a6a4a'))   # the cake
        for (x, y) in ((6.0, 8.0), (7.0, 8.2), (8.0, 8.0)):
            ly.dot(x, y, hx('#4a4a52'))                                 # the drain's slots
        fill_shape(ly, 7.0, 1.8, 1.0, 0.8, lambda u, v, L: hx('#f4f6fc') if L > 0.7 else SILVER_GREY)   # the flush valve
        ly.dot(7.0, 2.8, hx('#6a6e7a'))
    layer(cv, body)
    return cv


def p_stall():
    """A restroom stall's partition, from above (its length along y, the wall at -y): a laminate panel in the bar's
    sea-green, its top edge lit, the chrome bracket on the wall, a chrome foot under it in the middle and the pilaster
    shoe at its free end, a strip of floor showing under it (it stops short of the floor), names scratched in."""
    cv = Cv(6, 50)
    lam = ramp('#6f8f86', 0.45, 0.24, 0.32)

    def panel(x, y, c):
        if x < 1.6:
            return lt(lam[3], 0.1)                                      # the lit top edge
        if x >= 4.4:
            return lam[0]
        return shade(lam, 0.6 + (math.sin(y * 0.9) * 0.04))
    px_paint(cv, 1, 1, 5, 49, panel)
    for y in (1.0, 24.0, 47.0):                                         # bracket, foot, shoe
        frect(cv, 0.5, y, 5.5, y + 2.0, CHROME[2])
        frect(cv, 0.5, y + 1.5, 5.5, y + 2.0, CHROME[1])
        cv.dot(1.0, y + 0.5, CHROME[3])
    for (y, ln) in ((8.0, 3.0), (15.5, 2.0), (33.0, 3.5), (40.0, 1.5)):  # scratched names
        line(cv, 2.8, y, 3.1, y + ln, dk(lam[1], 0.2))
    cv.outline()
    return cv


def p_apt_door():
    """A neighbour's door, shut, from above (the wall at -y): the leaf in its frame, its veneer, a brass number plate
    with its two screws, the knob and its rose, the hinges."""
    cv = Cv(34, 8)
    frect(cv, 1, 1, 33, 7, hx('#2a2030'))
    wood_fill(cv, 3, 2, 30, 5, hx('#6a4426'), plank=8, rng=random.Random(4747))
    frect(cv, 3, 2, 31, 2.5, hx('#9a6a40'))                            # the leaf's top edge, lit
    frect(cv, 3, 5.5, 31, 6, hx('#3e2616'))
    for hx_ in (3.0, 30.5):
        frect(cv, hx_, 2.5, hx_ + 0.5, 5.5, hx('#241a20'))             # the gap in the frame
    for hy in (2.5, 4.5):
        frect(cv, 4.0, hy, 5.0, hy + 0.5, hx('#a8a8b4'))               # hinges
    fill_shape(cv, 16.5, 3.5, 2.0, 1.0, lambda u, v, L: shade(ramp('#d8a838', 0.45, 0.22, 0.45), L), kind='rect', corner=0.3, bevel=0.5)
    stud(cv, 15.0, 3.25, hx('#7a5a20'))
    stud(cv, 17.5, 3.25, hx('#7a5a20'))
    ring(cv, 27.0, 4.0, 0.6, 1.2, lambda dx, dy, d: hx('#c8ccd4') if dx + dy < 0 else hx('#7a7e8a'))   # the rose
    fill_shape(cv, 27.0, 4.0, 0.7, 0.7, lambda u, v, L: hx('#f0f2f8') if L > 0.7 else hx('#a8acb8'))   # the knob
    cv.outline()
    return cv


def p_doormat():
    """A coir doormat: stiff fibres in short tufts, a darker woven border, worn flat and dirty in the middle."""
    cv = Cv(26, 14)
    rng = random.Random(77)
    coir = ramp('#8a7448', 0.45, 0.22, 0.3)

    def mat(x, y, c):
        border = x < 3 or x >= 23 or y < 3 or y >= 11
        t = rng.random()
        col = shade(coir, 0.44 if t < 0.25 else 0.56 if t < 0.7 else 0.68)
        if border:
            col = dk(col, 0.3) if (int(x * 2) + int(y * 2)) % 2 else dk(col, 0.22)   # the woven edge
        elif abs(x - 13) < 6 and abs(y - 7) < 3:
            col = mix(col, hx('#5a4a32'), 0.4)                         # trodden in
        return col
    px_paint(cv, 1, 1, 25, 13, mat)
    smudge(cv, rng, 3, (6, 4, 20, 10), (1.0, 2.0), 0.2)
    cv.outline()
    return cv


def p_stairs():
    """A flight of stairs going down (toward -y), from above: concrete treads, darker and darker, each with its lit
    steel nosing and a rubber strip, worn in the middle, grime in the corners, a steel rail each side on its posts."""
    W, H = 66, 46
    cv = Cv(W, H)
    st = ramp('#6e6c74', 0.5, 0.25, 0.3)
    n = 9
    rng = random.Random(5463)
    nz = VNoise(W, H, 3, rng)
    for i in range(n):
        y0 = 1 + i * (H - 2) / n
        y1 = 1 + (i + 1) * (H - 2) / n
        f = 1.0 - 0.72 * (n - 1 - i) / (n - 1)                          # the deeper, the darker

        def tread(x, y, c, y0=y0, y1=y1, f=f):
            t = (y - y0) / (y1 - y0)
            col = shade(st, 0.5 + (nz(x, y) - 0.5) * 0.25 - t * 0.12)
            if abs(x - W / 2) < 9:
                col = lt(col, 0.05)                                    # worn in the middle
            if x < 7 or x > W - 7:
                col = dk(col, 0.15)                                    # grime in the corners
            d = y - y0
            if d < 1.0:
                col = hx('#b8bcc8') if d < 0.5 else IRON_GREY      # the steel nosing
            elif 1.5 < d < 2.0 and 6 < x < W - 6:
                col = hx('#2a2830')                                    # rubber strip
            elif y1 - y < 1.0:
                col = dk(col, 0.4)                                     # in the shadow of the step above
            return tuple(int(v * f) for v in col[:3]) + (255,)
        px_paint(cv, 4, y0, W - 4, y1, tread)
    for x in (1.0, W - 4.0):                                           # rails
        fill_capsule(cv, [(x + 1.5, 1.6), (x + 1.5, H - 1.6)], 1.3, lambda k, L, s, i, t: shade(ramp('#4a4654', 0.45, 0.22, 0.45), L))
        for y in (6.0, 23.0, 40.0):
            fill_shape(cv, x + 1.5, y, 1.5, 1.5, lambda u, v, L: shade(ramp('#3a3644', 0.45, 0.22, 0.45), L))   # posts
    cv.outline()
    return cv


def p_floor_hole():
    """Floorboards torn up over a hiding place: the dark hole with a joist running across it, splintered board ends with
    their pale torn fibres and bent nails, a tin box left open and empty beside it."""
    cv = Cv(30, 22)
    frect(cv, 2, 3, 20, 19, hx('#0c0810'))
    frect(cv, 3, 4, 19, 18, hx('#16101a'))
    fill_shape(cv, 11.0, 11.0, 8.0, 1.6, lambda u, v, L: shade(ramp('#3a2418', 0.45, 0.22, 0.35), L * 0.7), kind='rect', corner=0.4)   # a joist
    for x in range(4, 18, 3):
        cv.dot(x + 0.5, 6.0 + (x % 4), hx('#2a2428'))                  # dust and droppings
    rng = random.Random(5484)
    wood = ramp('#8a5a34', 0.45, 0.22, 0.3)
    for (x, y, w) in ((1, 1.5, 7), (9, 1.5, 5), (15, 2.5, 6), (1, 18.5, 5), (8, 18.0, 8), (17, 19.0, 4)):
        wood_fill(cv, x, int(y), x + w - 1, int(y) + 1, wood[2], plank=2, rng=rng)
        bevel_edges(cv, x, int(y), x + w - 1, int(y) + 1, 0.2, 0.3)
        for k in range(4):                                             # the splintered end
            ly = y + k * 0.5
            frect(cv, x + w, ly, x + w + rng.uniform(0.5, 1.5), ly + 0.5, hx('#e0bc80') if k % 2 else hx('#c89a60'))
        stud(cv, x + 1.0, y + 0.5, hx('#6a6a76'))                      # a nail
    st = ramp('#5a6470', 0.45, 0.22, 0.4)
    fill_shape(cv, 25.0, 11.5, 3.8, 3.8, lambda u, v, L: shade(st, L), kind='rect', corner=0.6, bevel=0.8)   # the tin
    fill_shape(cv, 25.0, 11.8, 3.0, 3.0, lambda u, v, L: shade(ramp('#2a3038', 0.4, 0.2, 0.3), 1.0 - L * 0.7), kind='rect', corner=0.4)
    fill_shape(cv, 25.0, 6.0, 3.8, 1.0, lambda u, v, L: shade(ramp('#8a94a0', 0.45, 0.22, 0.4), L), kind='rect', corner=0.4)   # its lid, back
    cv.dot(24.0, 12.5, hx('#3fa66a'))                                  # one note left behind
    cv.outline()
    return cv


def p_jerrycan():
    """A jerrycan on the floor, from above: red pressed steel, its three handles over the top, the spout's cap on its
    clamp, the pressed X, chipped paint and a run of fuel."""
    cv = Cv(11, 13)
    red = ramp('#c8281e', 0.5, 0.25, 0.3)
    fill_shape(cv, 5.5, 6.5, 4.5, 5.5, lambda u, v, L: shade(red, L), kind='rect', bevel=1.2, corner=0.8)
    for (a, b) in (((2.2, 5.0), (8.8, 11.4)), ((8.8, 5.0), (2.2, 11.4))):   # the pressed X
        line(cv, a[0], a[1], b[0], b[1], red[1])
        line(cv, a[0] - 0.5, a[1], b[0] - 0.5, b[1], lt(red[2], 0.2))
    for x in (3.0, 5.5, 8.0):                                          # the three handles
        fill_capsule(cv, [(x, 1.8), (x, 4.4)], 0.5, lambda k, L, s, i, t: shade(red, L + 0.1))
    frect(cv, 2.2, 1.5, 8.8, 2.0, red[0])
    fill_shape(cv, 8.2, 2.4, 1.2, 1.2, lambda u, v, L: shade(ramp('#e0b040', 0.45, 0.22, 0.4), L))   # the cap
    line(cv, 7.0, 2.0, 9.4, 1.4, STEEL_GREY)                        # its clamp
    smudge(cv, random.Random(5500), 3, (2, 4, 9, 12), (0.4, 0.8), 0.7, STEEL_GREY)
    line(cv, 8.6, 3.4, 8.9, 6.6, alpha(hx('#5a3a20'), 160))            # a run of fuel
    cv.outline()
    return cv


def p_laundry_basket():
    """A laundromat's plastic basket on the floor, from above: a rounded oblong of blue plastic, its rim lit on the
    side toward the light, slots moulded round its sides, a hand hole at each end; a load of washing heaped in it (a
    white shirt, jeans, a red sweater, a grey towel, a striped sock hanging over the rim)."""
    W, H = 20, 15
    cv = Cv(W, H)
    blue = ramp('#3a86c8', 0.5, 0.25, 0.3)
    fill_shape(cv, 10.0, 7.5, 9.0, 6.5, lambda u, v, L: shade(blue, L), kind='rect', bevel=1.2, corner=2.2)
    fill_shape(cv, 10.0, 7.5, 7.4, 4.9, lambda u, v, L: dk(blue[0], 0.25), kind='rect', bevel=0.6, corner=1.6)   # its well
    for x in (4.0, 6.5, 9.0, 11.5, 14.0):                              # the slots along the long sides
        frect(cv, x, 1.6, x + 1.0, 2.1, dk(blue[0], 0.35))
        frect(cv, x, 12.9, x + 1.0, 13.4, dk(blue[0], 0.2))
    for x in (1.5, 17.5):                                              # the hand holes at the ends
        frect(cv, x, 6.0, x + 1.0, 9.0, hx('#16202c'))
    cloth = Cv(W, H)
    rng = random.Random(6017)
    heap = (((7.4, 9.6, 4.6, 2.4, 0.25), '#3e5c8c'),                  # jeans
            ((12.6, 6.4, 4.0, 2.5, -0.45), '#e8e6de'),                # a white shirt
            ((6.4, 5.4, 3.2, 2.0, 0.5), '#b0303a'),                   # a red sweater
            ((13.4, 10.0, 2.9, 1.9, 0.15), '#8a8c90'),                # a towel
            ((10.2, 8.0, 1.8, 1.3, 1.1), '#d8b048'))                  # a yellow T-shirt balled up
    for (x, y, rx, ry, a), c in heap:
        r = ramp(c, 0.4, 0.2, 0.25)

        def crumple(u, v, L, r=r, a=a):                                 # flat cloth, a few creases catching the light
            k = 0.62 + 0.25 * L + 0.18 * math.sin(u * 2.3 + v * 1.7 + a * 5)
            return shade(r, max(0.0, min(1.0, k)))
        fill_shape(cloth, x, y, rx, ry, crumple, ang=a, kind='super', p=2.2, pad=0.12 * rng.random())
    for (x0, y0, x1, y1) in ((5.0, 9.4, 8.6, 10.2), (11.2, 5.4, 13.8, 7.2), (5.6, 4.8, 7.2, 5.9), (12.4, 9.6, 14.6, 10.6)):
        line(cloth, x0, y0, x1, y1, alpha(hx('#101420'), 90))         # the creases
    cloth.outline()
    cv.over(cloth)
    fill_capsule(cv, [(15.6, 4.2), (17.2, 2.9), (18.2, 2.2)], 0.65,
                 lambda k, L, s, i, t: hx('#f0ece4') if (i + t) < 1.2 else hx('#c83a4a'))   # a sock over the rim, its red toe
    cv.outline()
    return cv


def p_runner():
    """A length of corridor carpet, worn, from above (its long way along x; lengths are laid end to end, so it wraps
    seamlessly on its 96 px and has no outline): ochre piping, a dark border, a red field with a soft lozenge every
    metre and a half, the pile trodden flat down the middle."""
    W, H = 96, 18
    cv = Cv(W, H)
    red = ramp('#5e2a34', 0.5, 0.25, 0.3)
    nz = VNoise(W, H, 2, random.Random(311))
    nw = VNoise(W, H, 8, random.Random(312))

    def pile(x, y, c):
        if y < 1.5 or y >= H - 1.5:
            col = KHAKI if 0.5 <= y < 1.5 or H - 1.5 <= y < H - 0.5 else red[0]
        elif y < 3.5 or y >= H - 3.5:
            col = red[1]
        else:
            col = red[2]
            u = (x % 48.0) - 24.0
            d = abs(u) / 10.0 + abs(y - H / 2) / 4.5
            if 0.86 < d < 1.0:
                col = mix(red[2], KHAKI, 0.35)                 # the lozenge
            elif d < 0.3:
                col = mix(red[2], hx('#2a3a5a'), 0.3)
        col = shift(col, int((nz(x, y) - 0.5) * 10))
        if abs(y - H / 2) < 4.5:
            col = mix(col, hx('#7a5a5a'), max(0.0, nw(x, y) - 0.45) * 0.5)   # trodden flat
        return col
    px_paint(cv, 0, 0, W, H, pile)
    return cv


def road_paint(W, H, seed):
    """Worn white road paint along x, H rows: the line itself on the middle rows, chipped and stained by tyres."""
    cv = Cv(W, H)
    rng = random.Random(seed)
    paint, worn = hx('#cfcabd'), hx('#9d998f')
    for y in range(1, H - 1):
        for x in range(W):
            if rng.random() < 0.08:
                continue                                        # chipped: the asphalt shows through
            cv.set(x, y, worn if rng.random() < 0.22 else paint)
    return cv


def p_road_edge():
    """A length of the solid white edge line between the parking strip and the lane (laid end to end along x)."""
    return road_paint(96, 4, 907)


def p_parking_bay():
    """A bay line painted across the parking strip, from the kerb to the edge line."""
    return road_paint(60, 4, 911)


def p_velvet_rope():
    """A length of queue rope from above: two brass posts on their weighted bases, a red velvet rope hung between
    their caps by its brass hooks, sagging a little toward the street (+y)."""
    W, H = 32, 9
    cv = Cv(W, H)
    posts = (4.0, 28.0)
    for x in posts:                                                    # the weighted bases, under everything
        fill_shape(cv, x, 4.5, 3.0, 3.0, lambda u, v, L: shade(BRASS, 0.2 + 0.7 * L))
        ring(cv, x, 4.5, 2.3, 3.0, lambda dx, dy, d: shade(BRASS, 0.25 + 0.75 * light(dx / d, dy / d)))
    cv.outline()
    velvet = ramp('#82101f', 0.5, 0.3, 0.4)
    rope = Cv(W, H)
    pts = [(posts[0] + (posts[1] - posts[0]) * t / 12, 4.4 + 2.6 * math.sin(math.pi * t / 12)) for t in range(13)]
    fill_capsule(rope, pts, 0.75, lambda k, L, s, i, t: lt(velvet[3], 0.25) if s < -0.35 else shade(velvet, 0.75 - s * 0.6))
    for i in range(1, 12, 2):                                          # the twist of the cord, catching the light
        x, y = pts[i]
        rope.dot(x - 0.25, y - 0.4, lt(velvet[3], 0.35))
    rope.outline(hx('#2a0610'))
    cv.over(rope)
    for x in posts:                                                    # the caps, the hooks on them
        fill_shape(cv, x, 4.4, 1.5, 1.5, lambda u, v, L: shade(BRASS, L))
        fill_shape(cv, x - 0.4, 3.9, 0.6, 0.6, lambda u, v, L: hx('#fff4cc'))
    return cv


def p_sandwich_board():
    """A chalkboard A-frame on the sidewalk, from above: two black boards hinged along its top bar (the ridge across
    the middle, lit on its near side), a wooden frame, chalk lines of the night's specials, a brass hinge each end."""
    W, H = 18, 14
    cv = Cv(W, H)
    wood = ramp('#7a4a2a', 0.5, 0.25, 0.3)
    slate = ramp('#262a2c', 0.5, 0.25, 0.3)
    fill_shape(cv, W / 2, H / 2, W / 2 - 1, H / 2 - 1, lambda u, v, L: shade(wood, L), kind='rect', bevel=0.8, corner=0.6)
    for (y0, y1, lit) in ((2.0, 6.5, 0.62), (7.5, 12.0, 0.42)):     # the two boards, the far one in the light
        px_paint(cv, 2.5, y0, W - 2.5, y1, lambda x, y, c, lit=lit: shade(slate, lit + 0.05 * math.sin(x * 1.7)))
    frect(cv, 1.5, 6.5, W - 1.5, 7.5, wood[3])                       # the ridge
    for (y, x0, x1) in ((3.0, 4.0, 13.0), (4.5, 4.5, 11.0), (5.5, 4.0, 12.0), (9.0, 4.0, 12.5), (10.5, 5.0, 10.0)):
        for x in range(int(x0 * 2), int(x1 * 2)):
            if (x * 7 + int(y * 3)) % 5:
                cv.dot(x / 2, y, PUTTY if x % 3 else hx('#e8a8b8'))   # chalk, now and then a pink word
    for x in (2.0, W - 3.0):
        stud(cv, x, 6.5, BRASS[2], big=True)                         # the hinges
    smudge(cv, random.Random(6811), 3, (2, 2, W - 2, H - 2), (1.0, 2.0), 0.18, hx('#5a5a58'))   # rubbed-out chalk
    cv.outline()
    return cv


def p_ash_urn():
    """A steel ashtray post by a bar's door, from above: a round brushed steel drum, its sand-filled bowl on top
    with butts stubbed out in it, a dent and a dull ring where hands steady it."""
    S = 12
    cv = Cv(S, S)
    steel = ramp('#8a90a0', 0.45, 0.22, 0.4)
    fill_shape(cv, S / 2, S / 2, S / 2 - 1, S / 2 - 1, lambda u, v, L: shade(steel, L))
    ring(cv, S / 2, S / 2, 3.0, 3.6, lambda dx, dy, d: steel[0] if dx + dy < 0 else steel[3])   # the bowl's rim
    fill_shape(cv, S / 2, S / 2, 3.0, 3.0, lambda u, v, L: shade(ramp('#b8a888', 0.5, 0.25, 0.3), 0.4 + L * 0.3))   # sand
    for (x, y, a) in ((4.6, 5.4, 0.3), (6.8, 4.6, 2.0), (6.0, 7.0, 4.1), (5.0, 6.6, 1.2)):   # the butts
        line(cv, x, y, x + math.cos(a) * 1.4, y + math.sin(a) * 1.4, hx('#e8e0cc'))
        cv.dot(x, y, hx('#c88a4a'))
    cv.dot(3.5, 3.0, hx('#e8ecf4'))                                  # the light on the drum
    smudge(cv, random.Random(6812), 2, (2, 2, S - 2, S - 2), (0.6, 1.0), 0.3)
    cv.outline()
    return cv


def p_entry_mat():
    """A rubber entrance mat at a bar's door, from above (the door at its top): black ribbed rubber worn grey where
    every customer wipes his feet, the bar's name moulded in it faded to a ghost, its bevelled edge."""
    W, H = 60, 22
    cv = Cv(W, H)
    rub = ramp('#24222a', 0.5, 0.25, 0.3)
    rng = random.Random(6813)

    def mat(x, y, c):
        rib = 0.55 if int(y * 2) % 2 else 0.4                         # the ribs across it
        worn = max(0.0, 1 - math.hypot((x - W / 2) / 18.0, (y - H / 2) / 8.0)) * 0.25
        return shade(rub, rib + worn + rng.uniform(-0.03, 0.03))
    px_paint(cv, 1, 1, W - 1, H - 1, mat)
    bevel_edges(cv, 1, 1, W - 2, H - 2, 0.2, 0.35)
    for n, ch in enumerate('MIRAGE'):                                # the name moulded in, nearly worn away
        for gx, gy in inked(FONT_TUBE[ch]):
            if rng.random() < 0.7:
                cv.dot(15 + n * 5 + gx * 0.8, 8 + gy * 0.9, lt(rub[2], 0.12))
    smudge(cv, rng, 6, (8, 4, W - 8, H - 4), (1.5, 3.0), 0.2, hx('#4a4440'))   # what the shoes left
    cv.outline()
    return cv


def p_entry_carpet():
    """The red carpet from the club's door to the kerb, from above (its long way along y, the door at the top): deep
    crimson pile between two gold bands, a brass bar holding it at the door, trodden flat and darker down the middle
    and soiled by the street toward the kerb. No outline: it lies on the sidewalk."""
    W, H = 60, 60
    cv = Cv(W, H)
    red = ramp('#7c1222', 0.5, 0.28, 0.35)
    rng = random.Random(2213)
    pile = VNoise(W * 2, H * 2, 3, rng)

    def f(x, y, c):
        k = pile(x * 2, y * 0.7)
        worn = max(0.0, 1 - abs(x - W / 2) / 13.0) * 0.6
        dirt = max(0.0, (y - H * 0.3) / (H * 0.7)) * 0.5 + worn * 0.25
        col = shade(red, 0.5 + (k - 0.5) * 0.5 - worn * 0.4)
        return mix(col, hx('#241a18'), dirt * (0.6 + k * 0.6))
    px_paint(cv, 0, 0, W, H, f)
    gold = ramp('#c89a38', 0.5, 0.26, 0.38)
    for x0 in (3.0, W - 5.0):                                          # the gold bands along its sides
        px_paint(cv, x0, 0, x0 + 2.0, H, lambda x, y, c: shade(gold, 0.85 if (y // 3) % 2 else 0.6))
        frect(cv, x0 - 0.5, 0, x0, H, dk(red[1], 0.2))
    frect(cv, 0, 0, W, 1.5, BRASS[2])                                  # the brass bar at the door
    frect(cv, 0, 1.0, W, 1.5, BRASS[0])
    for _ in range(22):                                                # what the shoes bring in off the street
        smudge(cv, rng, 1, (10, 14, W - 10, H - 1), (1.2, 3.2), 0.3, hx('#1a1210'))
    for _ in range(5):                                                 # spilled drinks dried dark
        smudge(cv, rng, 1, (6, 4, W - 6, H - 6), (2.5, 4.5), 0.25, hx('#2a0c10'))
    for _ in range(9):                                                 # trodden-in gum and ash
        x, y = rng.uniform(8, W - 8), rng.uniform(6, H - 3)
        fill_shape(cv, x, y, 0.8, 0.7, lambda u, v, L: hx('#4a4448') if L > 0.5 else hx('#2a2628'))
    for _ in range(3):                                                 # cigarettes put out on it
        x, y = rng.uniform(10, W - 10), rng.uniform(10, H - 6)
        fill_shape(cv, x, y, 1.1, 0.9, lambda u, v, L: hx('#140c0a'))
        cv.dot(x + 0.5, y - 0.5, hx('#5a4a40'))
    for x0 in (3.0, W - 5.0):                                          # the gold bands gone dull with grime
        smudge(cv, rng, 4, (x0, 20, x0 + 2, H), (1.5, 3.0), 0.35, hx('#3a2a18'))
    smudge(cv, rng, 6, (0, H - 6, W, H), (2.5, 4.0), 0.3, hx('#1a1614'))   # the kerb end, wet and black
    return cv


def p_radiator():
    """A cast-iron radiator under a wall (the wall at -y), from above: its rounded columns painted cream, the gaps, the
    feed pipe into the wall and the valve with its red wheel, paint chipped off the edges."""
    cv = Cv(30, 8)
    paint_ = ramp('#d8d2c0', 0.45, 0.22, 0.3)
    frect(cv, 1.0, 1.5, 28.0, 6.5, hx('#2a2830'))
    for x in range(2, 26, 2):                                          # the columns
        fill_shape(cv, x + 0.9, 4.0, 0.85, 2.6, lambda u, v, L: shade(paint_, L), kind='rect', corner=0.8, bevel=0.8)
    fill_capsule(cv, [(26.4, 0.0), (26.4, 4.0), (27.5, 4.0)], 0.5, lambda k, L, s, i, t: shade(CHROME, L))   # feed pipe
    ring(cv, 27.5, 4.0, 0.0, 1.0, lambda dx, dy, d: shade(ramp('#b8262c', 0.45, 0.22, 0.4), light(dx / (d or 1), dy / (d or 1))))   # valve wheel
    cv.dot(27.25, 3.75, hx('#ff8070'))
    smudge(cv, random.Random(5532), 5, (2, 1, 26, 7), (0.4, 0.8), 0.6, hx('#4a4a52'))   # paint chipped to the iron
    cv.outline()
    return cv


def p_bike():
    """A racing bike leant on a wall, from above: both tyres end on with their tread, the red frame's tubes and its
    highlight, the chainring and cranks with their pedals, the saddle, drop handlebars taped black."""
    cv = Cv(46, 14)
    for x0 in (2.0, 30.0):                                             # the wheels, seen on edge
        fill_capsule(cv, [(x0 + 0.6, 7.0), (x0 + 13.4, 7.0)], 0.9, lambda k, L, s, i, t: shade(RUBBER, L + 0.1))
        dash(cv, x0 + 1.0, 6.5, x0 + 13.0, 6.5, RUBBER[3], 1, 2)
        frect(cv, x0 + 6.0, 6.5, x0 + 8.0, 7.5, PALE_STEEL)         # the hub
    red = ramp('#c8402c', 0.5, 0.25, 0.35)
    fill_capsule(cv, [(9.0, 7.0), (37.0, 7.0)], 0.7, lambda k, L, s, i, t: lt(red[3], 0.2) if L > 0.9 else shade(red, L))   # top tube
    fill_capsule(cv, [(16.5, 6.6), (21.0, 6.0)], 0.5, lambda k, L, s, i, t: shade(red, L))   # the down tube under it
    fill_shape(cv, 22.0, 9.2, 1.8, 1.8, lambda u, v, L: shade(CHROME, L))   # the chainring
    fill_shape(cv, 22.0, 9.2, 0.8, 0.8, lambda u, v, L: hx('#2a2a32'))
    for (x, y) in ((22.0, 4.0), (22.0, 11.4)):                         # cranks and pedals
        line(cv, 22.0, 7.2, x, y, CHROME[1])
        frect(cv, x - 1.0, y - 0.5, x + 1.0, y + 0.5, hx('#2a2a32'))
    fill_shape(cv, 15.0, 7.0, 2.4, 1.3, lambda u, v, L: shade(ramp('#2a2026', 0.45, 0.22, 0.4), L), kind='super', p=2.4)   # the saddle
    fill_capsule(cv, [(34.5, 2.0), (35.5, 3.0), (35.5, 11.0), (34.5, 12.0)], 0.6,
                 lambda k, L, s, i, t: shade(RUBBER, L) if t > 0.0 and (i == 0 or i == 2) else shade(CHROME, L))   # the bars
    frect(cv, 34.5, 6.5, 36.5, 7.5, CHROME[1])                         # the stem
    cv.outline()
    return cv


def p_bin_bag():
    """A full bin bag, from above: black plastic stretched over what is inside, its folds running in to the knot and
    catching the light, the knot's two ears."""
    W, H = 15, 14
    cv = Cv(W, H)
    b = ramp('#2c2e3a', 0.5, 0.25, 0.22)
    cx, cy = 7.2, 6.8
    lumps = [(4.5, 5.0, 2.6), (10.0, 4.6, 2.4), (5.2, 9.4, 2.8), (10.4, 9.6, 2.2), (7.5, 7.0, 3.2)]

    def h(x, y):
        z = sum(math.exp(-((x - lx) ** 2 + (y - ly) ** 2) / (r * r)) for lx, ly, r in lumps)
        a = math.atan2(y - cy, x - cx)
        return z + 0.18 * math.sin(a * 7.0 + math.hypot(x - cx, y - cy) * 0.6)
    fill_shape(cv, 7.0, 6.6, 6.6, 6.0, lambda u, v, L: b[2])
    for j in range(cv.ph):
        for i in range(cv.pw):
            c = cv.p[i, j]
            if c[3] == 0:
                continue
            x, y = (i + 0.5) / cv.s, (j + 0.5) / cv.s
            gx, gy = (h(x + 0.5, y) - h(x - 0.5, y)), (h(x, y + 0.5) - h(x, y - 0.5))
            L = light(-gx * 0.9, -gy * 0.9)
            col = shade(b, L)
            if L > 0.97:
                col = lt(b[3], 0.2)                                    # the sheen of the plastic
            cv.p[i, j] = col
    fill_shape(cv, cx, cy, 1.2, 1.0, lambda u, v, L: shade(b, L))      # the knot
    for (ex, ey) in ((5.4, 5.6), (8.8, 5.4)):
        fill_capsule(cv, [(cx, cy), (ex, ey)], 0.5, lambda k, L, s, i, t: shade(b, L + 0.1))
    cv.outline()
    return cv


def p_newspaper():
    """A folded newspaper left at a door: the masthead, a headline, a photograph, grey columns of text, the fold."""
    cv = Cv(13, 10)
    paper = ramp('#dcd6c4', 0.4, 0.2, 0.2)
    fill_shape(cv, 6.5, 5.0, 5.4, 3.9, lambda u, v, L: shade(paper, L), kind='rect', corner=0.3, bevel=0.6, ang=0.04)
    frect(cv, 2.0, 1.8, 11.0, 2.8, hx('#1e1a24'))                      # the masthead
    frect(cv, 2.5, 2.2, 10.5, 2.4, hx('#8a8494'))
    frect(cv, 2.0, 3.5, 11.0, 4.0, hx('#3a3640'))                      # the headline
    frect(cv, 7.5, 4.5, 11.0, 7.5, IRON_GREY)                      # a photograph
    frect(cv, 8.0, 5.0, 10.0, 6.0, hx('#9a9ea8'))
    for y in (4.5, 5.5, 6.5, 7.5):
        frect(cv, 2.0, y, 7.0, y + 0.5, hx('#9a948a'))                 # columns of text
    frect(cv, 1.0, 8.0, 12.0, 8.5, lambda c: dk(c, 0.18) if c[3] else None)   # the fold
    cv.outline()
    return cv


def p_shoes():
    """A pair of shoes left on a doormat, from above (toes toward +x): brown leather uppers, the laces, the dark of the
    opening and its heel counter, the welt of the sole showing round them."""
    cv = Cv(10, 9)
    lea = ramp('#5a3a22', 0.45, 0.22, 0.35)
    for y0 in (2.4, 6.4):
        fill_shape(cv, 4.8, y0, 3.9, 1.6, lambda u, v, L: shade(RUBBER, L), kind='super', p=2.4)   # the welt
        fill_shape(cv, 4.9, y0, 3.5, 1.3, lambda u, v, L: shade(lea, L), kind='super', p=2.4)
        fill_shape(cv, 2.6, y0, 1.3, 0.8, lambda u, v, L: hx('#1c1418'), kind='super', p=2.2)   # the opening
        for k in range(3):                                             # the laces
            cv.dot(4.5 + k * 0.5, y0 - 0.5, PARCHMENT)
            cv.dot(4.5 + k * 0.5, y0 + 0.25, PARCHMENT)
        cv.dot(7.5, y0 - 0.75, lt(lea[3], 0.2))                        # the toe's polish
    cv.outline()
    return cv


# small dressing added one by one (the details list)

# ---------------------------------------------------------------- the level's devices (src/game/data/devices.js)
def p_keg():
    """A 50 l steel keg of draught beer from above: the rolled top chime with its two hand holes, the dished top and
    its weld seam, the black coupler on the spear with its lever and the beer line curling off to the tap, the
    brewery's coloured cap ring, a stencilled number, scuffs and a dent from the cellar steps."""
    S = 18
    c = S / 2
    cv = Cv(S, S)
    st = ramp('#b8bec8', 0.5, 0.26, 0.42)
    fill_shape(cv, c, c, 8.0, 8.0, lambda u, v, L: shade(st, 0.6 - (u + v) * 0.03))
    ring(cv, c, c, 7.1, 8.05, lambda dx, dy, d: shade(st, light(dx / d * 0.95, dy / d * 0.95)) if d > 7.6 else st[0])
    ring(cv, c, c, 6.5, 7.1, lambda dx, dy, d: shade(st, 0.9 - light(dx / d, dy / d) * 0.7))   # the chime's inner wall
    for (hx0, hy0) in ((c - 4.2, c - 5.6), (c + 2.4, c + 4.6)):            # the hand holes
        frect(cv, hx0, hy0, hx0 + 2.0, hy0 + 1.0, SOOT)
    ring(cv, c, c, 4.4, 4.8, lambda dx, dy, d: shade(st, 0.25 + light(dx / d, dy / d) * 0.7))  # the weld seam
    ring(cv, c, c, 2.6, 3.3, lambda dx, dy, d: hx('#2a6ad8') if dx + dy < 0 else hx('#1a4aa0'))   # the brewery's ring
    fill_shape(cv, c, c, 2.4, 2.4, lambda u, v, L: shade(ramp('#26242c', 0.45, 0.22, 0.5), L))   # the coupler
    fill_capsule(cv, [(c, c), (c + 3.6, c - 1.4)], 0.55, lambda k, L, s_, i, t: shade(ramp('#3a3844', 0.45, 0.22, 0.5), L))   # its lever
    fill_capsule(cv, [(c - 1.2, c + 1.0), (c - 4.0, c + 3.5), (c - 6.6, c + 2.6), (c - 8.6, c + 4.2)], 0.42,
                 lambda k, L, s_, i, t: hx('#e8c070') if L > 0.55 else hx('#b07a2a'))   # the beer line, beer in it
    for x in (6.0, 7.0, 8.0, 10.0, 11.0):
        cv.dot(x, 14.5, alpha(GUNMETAL, 170))                       # stencilled number
    rng = random.Random(4401)
    smudge(cv, rng, 4, (2, 2, 16, 16), (0.5, 1.0), 0.35, IRON_GREY)   # scuffs
    smudge(cv, rng, 1, (11, 3, 14, 6), (1.2, 1.6), 0.25)                 # a dent
    fgrain(cv, random.Random(4402), 3)
    cv.outline()
    return cv


def p_fire_alarm():
    """The bar's fire alarm pull station on a wall (-y), from above: a red cast box on its back plate, FIRE in white
    on its face, the white T-handle to pull down, the little glass rod across it, the bell's red dome beside it."""
    cv = Cv(12, 8)
    frect(cv, 1.0, 0.5, 11.0, 1.8, hx('#5a5a66'))                        # the back plate on the wall
    frect(cv, 1.0, 0.5, 11.0, 1.0, hx('#8a8a96'))
    red = ramp('#d01e26', 0.5, 0.25, 0.42)
    fill_shape(cv, 4.6, 4.2, 3.6, 2.8, lambda u, v, L: shade(red, L), kind='rect', bevel=0.8, corner=0.5)
    frect(cv, 2.2, 3.0, 7.0, 3.6, hx('#f4f2ec'))                         # FIRE
    frect(cv, 3.8, 5.0, 5.4, 7.2, hx('#f4f2ec'))                         # the T-handle, out toward the room
    frect(cv, 2.8, 6.4, 6.4, 7.2, hx('#f4f2ec'))
    frect(cv, 2.8, 6.8, 6.4, 7.2, hx('#c8c4b8'))
    line(cv, 2.6, 5.4, 6.6, 5.4, hx('#cfeaff'))                          # the glass rod
    fill_shape(cv, 9.2, 4.0, 1.8, 1.8, lambda u, v, L: shade(ramp('#c2281e', 0.45, 0.22, 0.5), L))   # the bell
    cv.dot(8.75, 3.5, hx('#ffb0a0'))
    cv.outline()
    return cv


def p_trapdoor():
    """A trapdoor in the floor of the TV shop's back, flush with it: an angle-iron frame, four worn planks, the iron
    ring sunk in its recess, the two strap hinges, grime in the joints and the scuffs of the hatch being dragged."""
    cv = Cv(26, 26)
    iron = ramp('#4a4c56', 0.45, 0.22, 0.4)
    frect(cv, 1.0, 1.0, 25.0, 25.0, iron[1])
    frect(cv, 1.0, 1.0, 25.0, 1.6, iron[3])
    frect(cv, 1.0, 1.0, 1.6, 25.0, iron[3])
    wood_fill(cv, 2, 2, 24, 24, hx('#6a4a30'), plank=5, rng=random.Random(5301), vertical=True)
    bevel_edges(cv, 2, 2, 23, 23, 0.2, 0.35)
    for x in (7.5, 12.5, 17.5):
        frect(cv, x, 2.5, x + 0.5, 23.5, hx('#2a1a10'))                  # the joints
    for y in (5.0, 19.5):                                                 # the strap hinges
        frect(cv, 2.5, y, 9.0, y + 1.5, iron[2])
        frect(cv, 2.5, y, 9.0, y + 0.5, iron[3])
        cv.dot(4.0, y + 1.0, iron[0])
        cv.dot(7.5, y + 1.0, iron[0])
    fill_shape(cv, 19.0, 13.0, 2.2, 2.2, lambda u, v, L: hx('#1a1410'))   # the ring's recess
    ring(cv, 19.0, 13.0, 1.3, 2.0, lambda dx, dy, d: shade(iron, light(dx / d, dy / d)))
    smudge(cv, random.Random(5302), 4, (3, 3, 23, 23), (1.0, 2.2), 0.25)
    cv.outline()
    return cv


def p_beer_tap():
    """A draught tower on the bar from above, the bartender's side at -y: the chrome T of the tower along the bar with
    its three spouts over the black drip tray, the three tap handles standing up in their brewers' colours (seen from
    over them: their tops and the shadow they throw onto the bar), a bar towel left folded by it, wet rings."""
    W, H = 22, 10
    cv = Cv(W, H)
    tray = ramp('#24262c', 0.45, 0.22, 0.5)
    fill_shape(cv, 11.0, 2.4, 9.5, 2.0, lambda u, v, L: shade(tray, L), kind='rect', bevel=0.8, corner=0.5)
    for x in range(3, 20, 2):                                           # the grate of the drip tray
        frect(cv, x, 1.0, x + 0.5, 3.8, tray[0])
    fill_shape(cv, 6.0, 2.6, 1.3, 0.9, lambda u, v, L: hx('#c8902a') if L > 0.4 else hx('#8a5a18'))   # beer left in it
    chrome_bar(cv, 2.0, 4.6, 20.0, 6.6)                                 # the tower's T along the bar
    for x in (2.0, 19.0):
        fill_shape(cv, x + 0.5, 5.6, 1.2, 1.2, lambda u, v, L: shade(CHROME, L))
    cv.outline()
    for i, (x, col) in enumerate(((5.5, '#b8262c'), (11.0, '#d8a838'), (16.5, '#1f6a3a'))):
        frect(cv, x - 0.5, 3.0, x + 0.5, 4.8, CHROME[2])                # the spout over the tray
        cv.dot(x, 3.0, CHROME[3])
        fill_shape(cv, x + 1.2, 8.4, 1.6, 0.9, lambda u, v, L: (10, 8, 12, 110))   # the handle's shadow on the bar
        hand = ramp(col, 0.45, 0.24, 0.42)
        fill_shape(cv, x, 7.4, 1.5, 1.7, lambda u, v, L: shade(hand, L), kind='rect', corner=0.7)
        frect(cv, x - 0.5, 6.6, x + 0.5, 7.0, hx('#f0e8d0'))           # the brewer's badge
        cv.dot(x - 0.5, 6.5, lt(hand[3], 0.4))
    cv.outline()
    return cv


def p_curtain():
    """A heavy velvet curtain hung across a doorway, from above (its rod along y): the brass rod and its rings, the
    cloth falling in deep folds either side of it, lit on the crests, the hem's gold fringe at both ends."""
    W, H = 8, 34
    cv = Cv(W, H)
    velvet = ramp('#7a0e22', 0.5, 0.3, 0.4)

    def folds(x, y, c):
        k = (math.sin(y * 1.15) + 1) / 2                                  # crest to trough along the curtain
        return shade(velvet, 0.2 + 0.75 * k - abs(x - W / 2) / W * 0.4)
    px_paint(cv, 1, 1, W - 1, H - 1, folds)
    frect(cv, 3.5, 0.5, 4.5, H - 0.5, BRASS[2])                         # the rod over it
    for y in range(3, H - 2, 4):
        cv.dot(4.0, y, BRASS[3])                                        # its rings
    for y in (1.0, H - 2.0):
        frect(cv, 1.0, y, W - 1.0, y + 1.0, hx('#c89a38'))             # the fringe at each end
    cv.outline()
    return cv


def p_rug():
    """The boss's rug, a worn Persian on the floor of his back room, one corner kicked back over itself: the deep red
    field and its navy medallion, the patterned border, the fringe, and under the turned corner the edge of the
    hatch's planks and its frame (what it hides)."""
    W, H = 40, 28
    cv = Cv(W, H)
    rng = random.Random(5311)
    red, navy, gold = ramp('#8a1a22', 0.45, 0.22, 0.3), ramp('#1e2a56', 0.45, 0.22, 0.3), hx('#c8a050')

    def field(x, y, c):
        bx = min(x - 2, W - 2 - x, y - 2, H - 2 - y)
        if bx < 2.0:
            col = navy[2] if (int(x) + int(y)) % 3 else gold
        elif bx < 2.5:
            col = gold
        else:
            dx, dy = (x - W / 2) / 10, (y - H / 2) / 7
            d = abs(dx) + abs(dy)
            col = navy[2] if d < 0.6 else gold if d < 0.75 else red[2] if (int(x * 0.5) + int(y * 0.5)) % 4 else red[1]
        return mix(col, hx('#3a2a26'), 0.18 * rng.random())             # worn, uneven
    px_paint(cv, 2, 2, W - 2, H - 2, field)
    for x in range(3, W - 3, 2):                                          # the fringe
        cv.dot(x, 1.25, hx('#e4d8b8'))
        cv.dot(x, H - 1.25, hx('#e4d8b8'))
    # the corner kicked back (bottom right): the hatch's planks under it, the fold of the rug's pale back
    for j in range(0, 9):
        for i in range(0, 9 - j):
            cv.set(W - 2.5 - i, H - 2.5 - j, hx('#5a3a20') if (i + j) % 3 else hx('#3a2412'))
    line(cv, W - 11.0, H - 2.0, W - 2.0, H - 11.0, hx('#2a2a32'))         # the frame's edge
    for k in range(0, 9):
        cv.dot(W - 11.5 + k, H - 11.5 + (8 - k), hx('#d8c8a8'))
    smudge(cv, rng, 3, (4, 4, W - 4, H - 4), (1.5, 3.0), 0.15)
    cv.outline()
    return cv


GROUP = 'props'
SPRITES = {
    'ladder': (p_ladder, (32, 32), 'fine', (30, 30)),
    'parapet': (p_parapet, (34, 12), 'fine', (32, 10)),
    'fuse_box': (p_fuse_box, (26, 11), 'fine hung'),
    'cash_case': (p_cash_case, (22, 16), 'fine', (20, 14)),
    'ceiling_fan': (p_ceiling_fan, (44, 44), 'fine hung'),
    'mirror_ball': (p_mirror_ball, (12, 12), 'fine hung'),
    'extinguisher': (p_extinguisher, (8, 11), 'fine hung'),
    'vending': (p_vending, (28, 22), 'fine', (26, 20)),
    'phone_booth': (p_phone_booth, (26, 26), 'fine', (24, 24)),
    'parking_meter': (p_parking_meter, (7, 8), 'fine', (5, 5)),
    'news_box': (p_news_box, (16, 13), 'fine', (14, 11)),
    'pipe_steam': (pipe('#8a5a3a', '#b07a52', '#5e3a24', '#c8c0a8'), (96, 6), 'fine hung'),
    'pipe_water': (pipe('#4a6a7a', '#6e8e9e', '#30485a', '#9aa2b0'), (96, 6), 'fine hung'),
    'wall_vent': (p_wall_vent, (16, 7), 'fine hung'),
    'manhole': (p_manhole, (16, 16), 'fine'),
    'cardboard_bed': (p_cardboard_bed, (36, 20), 'fine'),
    'table_flipped': (flipped_table(46, '#86552f', '#5a361e'), (46, 27), 'fine'),
    'table_round_flipped': (flipped_table(30, '#8a5530', '#4a2c18', feet=1), (30, 27), 'fine'),
    'card_table_flipped': (flipped_table(60, '#6a3518', '#4a2c18', face='#1f7a4c'), (60, 27), 'fine'),
    'urinal': (p_urinal, (14, 12), 'fine', (12, 10)),
    'stall': (p_stall, (6, 50), 'fine', (4, 48)),
    'apt_door': (p_apt_door, (34, 8), 'fine hung'),
    'doormat': (p_doormat, (26, 14), 'fine floor'),
    'stairs': (p_stairs, (66, 46), 'fine floor'),
    'floor_hole': (p_floor_hole, (30, 22), 'fine floor'),
    'jerrycan': (p_jerrycan, (11, 13), 'fine', (9, 11)),
    'laundry_basket': (p_laundry_basket, (20, 15), 'fine', (18, 13)),
    'runner': (p_runner, (96, 18), 'fine floor'),
    'road_edge': (p_road_edge, (96, 4), 'fine floor'),
    'parking_bay': (p_parking_bay, (60, 4), 'fine floor stock'),
    'velvet_rope': (p_velvet_rope, (32, 9), 'fine stock', (30, 6)),
    'entry_carpet': (p_entry_carpet, (60, 60), 'fine floor stock'),
    'radiator': (p_radiator, (30, 8), 'fine hung'),
    'bike': (p_bike, (46, 14), 'fine', (44, 12)),
    'sandwich_board': (p_sandwich_board, (18, 14), 'fine', (16, 12)),
    'ash_urn': (p_ash_urn, (12, 12), 'fine', (10, 10)),
    'entry_mat': (p_entry_mat, (60, 22), 'fine floor'),
    'bin_bag': (p_bin_bag, (15, 14), 'fine', (13, 12)),
    'newspaper': (p_newspaper, (13, 10), 'fine floor'),
    'shoes': (p_shoes, (10, 9), 'fine floor'),
    'keg': (p_keg, (18, 18), 'fine', (16, 16)),
    'fire_alarm': (p_fire_alarm, (12, 8), 'fine hung'),
    'trapdoor': (p_trapdoor, (26, 26), 'fine floor'),
    'rug': (p_rug, (40, 28), 'fine floor'),
    'beer_tap': (p_beer_tap, (22, 10), 'fine hung'),
    'curtain': (p_curtain, (8, 34), 'fine hung'),
    'emergency_light': (p_emergency_light, (8, 5), 'fine glow hung'),
}
