"""The suburb going to Miami: pastel stucco, a strip's pole sign, the homeless and their things, a fruit
market on a vacant corner, a car wash's forecourt, a used tyre yard. Hand-painted signs in English and Spanish
(invented names, no real brand)."""
import math
import random

from .core import (
    alpha, CLEAR, crease, curve, Cv, dk, fill_capsule, fill_shape, frect, hx, layer, light, line, lt, mix, px_paint,
    ramp, ring, shade, shift, smudge, stud, VNoise
)
from .palette import (
    BRASS, CHALK, GRAPHITE, GUNMETAL, IRON_GREY, LINEN, NEON_CYAN, NEON_PINK, PALE_GREY, PAPER_WHITE, PURE_WHITE,
    PUTTY, RUBBER, RUST_BROWN, SIGN_WHITE, SIGNAL_YELLOW, SILVER_GREY, SOOT, STEEL_L, STUCCO, WALNUT, WOOD, ZINC
)
from .type import hand_words, neon_text, words, words_w
from .neon import Neon
from .tiles import FL_DIRT
from .ramp_toll import CONCRETE
from .flat import bottle_down
from .miami import pole_cabinet


CREAM = '#efe2c4'
PLY = ramp('#c8a878', 0.45, 0.22, 0.25)          # weathered plywood


def bus_bench(kind):
    def make():
        """A bus stop's bench from above, 2 m: the cast concrete seat, its backrest laid back to be read with a faded
        ad painted on it (`bail`: BAIL in red on sun-bleached yellow, 24 HRS and a number; `abogado`: a lawyer's,
        ABOGADO in cream on a blue band, LLAME and a number), its paint peeling to the concrete, a tag in marker
        on the seat, gum, a chip off a corner."""
        W, H = 64, 26
        cv = Cv(W, H)
        rng = random.Random(10361 + len(kind))
        con = ramp('#b8b2a4', 0.46, 0.24, 0.22)
        fill_shape(cv, W / 2, 19.5, W / 2 - 2, 5.5, lambda u, v, L: shift(shade(con, 0.3 + L * 0.55), rng.randint(-5, 5)), kind='rect', corner=1.5, bevel=1.5)
        for x in (5.0, W - 5.0):
            frect(cv, x - 2, 24.5, x + 2, 25.5, shade(con, 0.2))              # the legs' feet
        n = VNoise(W, H, 5, rng)
        bg, ink = (ramp('#e8cc58', 0.45, 0.22, 0.2), hx('#c8282c')) if kind == 'bail' else (ramp('#7ab8d8', 0.45, 0.22, 0.2), PAPER_WHITE)

        def back(x, y, cur):
            if x < 2 or x >= W - 2 or y < 1 or y >= 13.5:
                return None
            if x < 3 or x >= W - 3 or y < 2 or y >= 12.5:
                return shade(con, 0.75 if y < 2 else 0.35)                     # the cast frame round the panel
            c = mix(shade(bg, 0.6), hx(CREAM), 0.25 + n(x, y) * 0.35)        # bleached by the sun
            return c
        px_paint(cv, 0, 0, W, H, back)
        if kind == 'bail':
            hand_words(cv, 5, 3.5, 'BAIL', ink, 1.3, 10371, wob=0.1)
            words(cv, 40, 3.5, '24 HRS', GRAPHITE, 0.5)
            words(cv, 36, 8.0, '555-0187', GRAPHITE, 0.5)
            frect(cv, 34.5, 3, 35, 12, hx('#c8282c'))
        else:
            frect(cv, 3, 2, W - 3, 8.5, lambda c: mix(hx('#24508a'), c, 0.25))
            words(cv, W / 2, 2.0, 'ABOGADO', ink, 1.0, centre=True)
            words(cv, W / 2, 9.0, 'LLAME 555-0142', hx('#1e3a6a'), 0.5, centre=True)
        px_paint(cv, 3, 2, W - 3, 12.5, lambda x, y, c: shade(con, 0.5) if n(x * 2.3, y * 2.3) > 0.78 else None)   # peeled
        tag = [(38 + i * 1.1, 19 + 1.8 * math.sin(i * 1.3) + rng.uniform(-0.4, 0.4)) for i in range(14)]
        for (a, b) in zip(tag, tag[1:]):
            line(cv, a[0], a[1], b[0], b[1], hx('#1a1a22'))                     # a tag in marker
        for _ in range(7):
            cv.dot(rng.uniform(6, W - 6), rng.uniform(16, 23), hx('#6a6670'))  # gum
        px_paint(cv, W - 6, 21, W - 1, 26, lambda x, y, c: CLEAR if x + (y - 21) * 0.8 > W - 2 else None)   # a chip off
        smudge(cv, rng, 6, (3, 14, W - 3, 24), (1.5, 3.5), 0.14)
        cv.outline()
        return cv
    return make


def p_payphone_pastel():
    """A pay phone on its post by a strip mall, from above, laid back to be read: a pastel hood round the steel
    phone (the keypad, the coin slot, the black handset on its hook, the armoured cord), PHONE lit on the band over
    it (the emissive map: the band's letters and their glow)."""
    W, H = 20, 18
    cv, gl = Cv(W, H), Cv(W, H)
    rng = random.Random(10381)
    hood = ramp(STUCCO['mint'], 0.5, 0.26, 0.24)

    def shell(x, y, cur):
        if x < 1 or x >= W - 1 or y < 1 or y >= H - 1:
            return None
        if y < 6:
            return hx('#1e5a7a')                                           # the band
        if x < 3 or x >= W - 3:
            return shade(hood, 0.75 if x < 3 else 0.35)                    # its sides
        if y >= H - 2.5:
            return shade(hood, 0.3)
        return shade(STEEL_L, 0.45)                                        # the phone's face
    px_paint(cv, 0, 0, W, H, shell)
    frect(cv, 1, 1, W - 1, 1.5, lt(hx('#1e5a7a'), 0.3))
    for k in range(12):                                                    # the keypad
        cv.dot(9.5 + (k % 3) * 1.5, 8.5 + (k // 3) * 1.5, hx('#e8e8f0') if k != 9 else hx('#c8282c'))
    frect(cv, 14.5, 8.0, 15.5, 9.0, hx('#1a1a20'))                         # the coin slot
    fill_capsule(cv, [(5.5, 7.5), (5.5, 14.5)], 1.1, lambda k, L, s, i, t: shade(RUBBER, 0.25 + L * 0.6))   # the handset
    line(cv, 5.0, 15.0, 7.0, 16.0, shade(STEEL_L, 0.7))
    words(cv, W / 2, 2.0, 'PHONE', hx('#fff4d0'), 0.5, centre=True)
    words(gl, W / 2, 2.0, 'PHONE', hx('#fff0c8'), 0.5, centre=True)
    smudge(cv, rng, 4, (2, 6, W - 2, H - 2), (0.8, 1.8), 0.2)
    cv.outline()
    return cv, gl


def news_box_of(body, top, seed):
    def make():
        """A newspaper box from above in a colour of 1985 (front along +y): its enamel, a coloured lid with the
        paper's band on it, the front page under its window, the coin slot, chipped and sun-faded."""
        cv = Cv(16, 13)
        rng = random.Random(seed)
        r = ramp(body, 0.45, 0.22, 0.3)
        px_paint(cv, 1, 1, 15, 12, lambda x, y, c: shade(r, 0.85 if y < 2.0 else 0.38 if y >= 10.5 else 0.62))
        frect(cv, 2, 1.5, 14, 3.5, hx(top))                                 # its band
        frect(cv, 3, 2.25, 13, 2.75, PAPER_WHITE)
        frect(cv, 1, 3.5, 15, 4, dk(r[1], 0.2))                             # the lid's hinge

        def paper(x, y, c):
            if y < 5 or y >= 9.5 or x < 3.0 or x >= 13.0:
                return GUNMETAL
            col = hx('#ece8dc')
            if 5.5 <= y < 6.5 and 3.5 <= x < 12.0:
                col = GRAPHITE
            elif 7.0 <= y < 9.0 and 3.5 <= x < 6.5:
                col = hx('#8a8a90') if int(y * 2) % 2 else hx('#b8b4a8')
            elif 7.0 <= y < 9.0 and x >= 7.0 and int(y * 2) % 2 == 0:
                col = hx('#a8a8b0')
            return col
        px_paint(cv, 2.5, 4.5, 13.5, 10, paper)
        fill_shape(cv, 13.4, 11.0, 0.6, 0.4, lambda u, v, L: hx('#d8d8e0'), kind='rect', corner=0.1)
        smudge(cv, rng, 5, (1, 1, 15, 12), (0.4, 0.9), 0.6, SILVER_GREY)
        smudge(cv, rng, 3, (1, 1, 15, 4), (1.5, 3.0), 0.25, hx(CREAM))       # faded
        cv.outline()
        return cv
    return make


def p_mailbox_blue():
    """A collection mailbox on the corner, from above, 0.55 m: its domed blue top lit along one side, the pull-down
    chute along the front (+y), a white plate with the pickup times, scratches, a sticker, rust at its foot."""
    W, H = 18, 16
    cv = Cv(W, H)
    rng = random.Random(10391)
    blue = ramp('#2a4a8a', 0.5, 0.25, 0.32)
    for (x, y) in ((2.5, 2.5), (W - 2.5, 2.5), (2.5, H - 2.0), (W - 2.5, H - 2.0)):
        fill_shape(cv, x, y, 1.2, 1.2, lambda u, v, L: shade(blue, 0.2), kind='rect', corner=0.3)   # its legs' feet
    fill_shape(cv, W / 2, H / 2 - 0.5, W / 2 - 2, H / 2 - 2, lambda u, v, L: shade(blue, 0.2 + L * 0.7 + (0.12 if abs(u) < 2 else 0)), kind='super', p=3.0)
    fill_shape(cv, W / 2, H - 3.2, 5.0, 1.4, lambda u, v, L: shade(ramp('#3a4a6a', 0.5, 0.25, 0.4), 0.3 + L * 0.6), kind='rect', corner=0.6)   # the chute
    frect(cv, 5.5, 4.5, W - 5.5, 7.0, SIGN_WHITE)
    frect(cv, 6.0, 5.2, W - 6.0, 5.6, hx('#2a3a6a'))
    frect(cv, 6.0, 6.2, W - 8.0, 6.5, hx('#c8282c'))
    fill_shape(cv, 4.5, 9.5, 1.0, 0.7, lambda u, v, L: SIGNAL_YELLOW, kind='rect', corner=0.2)   # a sticker
    smudge(cv, rng, 5, (2, 2, W - 2, H - 2), (0.4, 0.9), 0.5, SILVER_GREY)
    smudge(cv, rng, 3, (2, H - 5, W - 2, H - 2), (0.8, 1.8), 0.35, RUST_BROWN)
    cv.outline()
    return cv


def mailbox_post(number, box, seed):
    def make():
        """A house's mailbox on its post at the end of the drive, from above, 0.6 m: the tunnel-topped box (its curved
        top lit along its ridge), the door at +x, the red flag up on its side, the house's number, rust. One a house
        (the block's numbers, its own paint): never the same number twice along a street."""
        W, H = 20, 10
        cv = Cv(W, H)
        rng = random.Random(seed)
        aq = ramp(box, 0.5, 0.26, 0.28)
        fill_shape(cv, W / 2 - 1, H / 2 + 0.5, W / 2 - 3, H / 2 - 2.5, lambda u, v, L: shade(aq, 0.2 + 0.7 * (1 - abs(v + 0.6) / 3.5) ** 1.5 + L * 0.15), kind='rect', corner=0.8, bevel=0.5)
        frect(cv, W - 4.5, 2.5, W - 3.5, H - 1.5, lambda c: dk(c, 0.35) if c[3] else c)   # the door's seam
        fill_shape(cv, W - 2.7, H / 2 + 0.5, 0.6, 1.0, lambda u, v, L: shade(STEEL_L, 0.5 + L * 0.4))   # its latch
        frect(cv, 6, 0.5, 12, 2.0, hx('#d02a2a'))                              # the flag, up
        frect(cv, 6, 0.5, 12, 1.0, hx('#ff5a4a'))
        light = sum(hx(box)[:3]) > 420                                         # (dark figures on a pale box)
        words(cv, 4, 4.0, number, hx('#2a2430') if light else PAPER_WHITE, 0.5)
        smudge(cv, rng, 4, (3, 2, W - 3, H - 1), (0.6, 1.4), 0.4, RUST_BROWN)
        cv.outline()
        return cv
    return make


def house_window(lit, seed):
    def make():
        """A house's window on its front wall (the wall at -y), laid back to be read, 1.75 m: two jalousie panes side by
        side in a white aluminium frame, their glass louvres stepped one over the next (each lit along its top edge),
        the crank under each, a concrete sill. `lit`: a lamp on inside, warm through the louvres, the shadow of the
        blind's cord and a curtain's edge (the emissive map); else the night in them, dark blue glass, a streak of the
        street's light."""
        W, H = 56, 14
        cv, gl = Cv(W, H), Cv(W, H)
        rng = random.Random(seed)
        frame = ramp('#e8e4dc', 0.42, 0.22, 0.3)
        warm = ramp('#ffb860', 0.5, 0.25, 0.25)
        night = ramp('#3a4a68', 0.55, 0.3, 0.3)
        y0, y1 = 1.0, 11.0                                                 # the glass's head and foot

        def body(ly):
            fill_shape(ly, W / 2, (y0 + y1) / 2, W / 2 - 1.0, (y1 - y0) / 2 + 0.5, lambda u, v, L: shade(frame, 0.45 + L * 0.4), kind='rect', corner=0.5, bevel=0.5)
            fill_shape(ly, W / 2, H - 1.75, W / 2, 1.25, lambda u, v, L: shade(ramp('#d8d0c0', 0.45, 0.22, 0.3), 0.3 + L * 0.5), kind='rect', corner=0.4, bevel=0.5)   # the sill
        layer(cv, body)
        for (a, b) in ((3.0, W / 2 - 1.0), (W / 2 + 1.0, W - 3.0)):         # two panes, a mullion between them
            for k in range(6):                                             # six louvres, each over the next
                ya = y0 + 0.75 + k * 1.5
                for x in range(int(a * 2), int(b * 2)):
                    for jj in range(3):
                        yy = ya + jj * 0.5
                        xx = (x + 0.5) / 2
                        if lit:
                            c = shade(warm, (0.95, 0.75, 0.45)[jj])
                            if abs(xx - (a + 4.0)) < 0.3 or (xx > b - 6.0 and k < 5):
                                c = dk(c, 0.35)                          # the blind's cord, the curtain drawn
                        else:
                            c = shade(night, (0.85, 0.45, 0.25)[jj])
                            if abs((xx - a) - (yy - y0) * 1.6 - 5.0) < 1.0:
                                c = lt(c, 0.25)                           # the street's light across the glass
                        cv.dot(xx, yy, c)
                        if lit:
                            gl.dot(xx, yy, alpha(c, 235 if jj < 2 else 180))
            frect(cv, a, y1 - 0.5, b, y1, dk(frame[1], 0.2))
            fill_shape(cv, (a + b) / 2, y1 + 0.5, 1.2, 0.5, lambda u, v, L: shade(STEEL_L, 0.4 + L * 0.5), kind='rect', corner=0.2)   # the crank
        frect(cv, W / 2 - 1.0, y0, W / 2 + 1.0, y1, lambda c: shade(frame, 0.7))   # the mullion
        smudge(cv, rng, 4, (2, y1, W - 2, H - 1), (1.0, 2.5), 0.25)       # the sill's dirt
        smudge(cv, rng, 2, (2, y0, W - 2, y1), (1.0, 2.0), 0.12, hx('#c8b896'))
        return (cv, gl) if lit else cv
    return make


def p_house_door():
    """A house's front door on its wall (the wall at -y), laid back to be read: a panelled door of stained wood in its
    white frame, a brass knob and a peephole, a fan light of louvres over it, a step of concrete at its foot and the
    porch light beside it on its bracket, a frosted lantern (lit: the emissive map)."""
    W, H = 48, 16
    cv, gl = Cv(W, H), Cv(W, H)
    rng = random.Random(10421)
    frame = ramp('#e8e4dc', 0.42, 0.22, 0.3)
    teal = ramp('#7a4a2c', 0.5, 0.26, 0.3)                                # (wood: never read as the windows' glass)

    def step(ly):
        fill_shape(ly, 20.0, H - 1.75, 16.0, 1.75, lambda u, v, L: shade(ramp('#b8b0a4', 0.45, 0.22, 0.3), 0.25 + L * 0.55), kind='rect', corner=0.5, bevel=0.75)
    layer(cv, step)

    def door(ly):
        fill_shape(ly, 20.0, 6.75, 14.0, 6.25, lambda u, v, L: shade(frame, 0.45 + L * 0.4), kind='rect', corner=0.4, bevel=0.5)
        fill_shape(ly, 20.0, 7.5, 12.0, 5.0, lambda u, v, L: shade(teal, 0.35 + L * 0.45), kind='rect', corner=0.2, bevel=0.5)
    layer(cv, door)
    for (k, x) in enumerate(range(9, 31, 2)):                              # the fan light's louvres
        frect(cv, x, 1.0, x + 1.0, 2.0, hx('#4a5a74') if k % 2 else hx('#5e7090'))
    for (px0, px1) in ((10.0, 19.0), (21.0, 30.0)):                        # the panels, sunk and lit along their top
        for (py0, py1) in ((4.0, 7.5), (8.5, 11.5)):
            frect(cv, px0, py0, px1, py1, lambda c: dk(c, 0.12))
            frect(cv, px0, py0, px1, py0 + 0.5, lambda c: dk(c, 0.3))
            frect(cv, px0, py1 - 0.5, px1, py1, lambda c: lt(c, 0.18))
    fill_shape(cv, 28.5, 8.0, 0.9, 0.9, lambda u, v, L: shade(ramp('#d8a840', 0.45, 0.22, 0.3), 0.4 + L * 0.6))   # the knob
    cv.dot(20.0, 5.0, SOOT)                                      # the peephole
    smudge(cv, rng, 3, (8, 3, 32, 12), (1.0, 2.5), 0.18)

    def lamp(ly):
        frect(ly, 38.0, 4.5, 43.0, 5.5, shade(ramp('#2e2c34', 0.5, 0.25, 0.3), 0.5))   # its bracket
        fill_shape(ly, 40.5, 6.5, 2.5, 3.5, lambda u, v, L: shade(ramp('#2e2c34', 0.5, 0.25, 0.3), 0.3 + L * 0.5), kind='rect', corner=0.8)
    layer(cv, lamp)
    hot, warm = hx('#fff4d8'), hx('#ffd08a')
    px_paint(cv, 39.0, 4.5, 42.0, 9.0, lambda x, y, cur: hot if abs(x - 40.5) < 0.8 and 5.5 < y < 8.0 else warm)
    frect(cv, 38.5, 3.0, 42.5, 4.0, shade(ramp('#2e2c34', 0.5, 0.25, 0.3), 0.6))   # its cap
    px_paint(gl, 39.0, 4.5, 42.0, 9.0, lambda x, y, cur: (255, 244, 216, 255) if abs(x - 40.5) < 0.8 and 5.5 < y < 8.0 else (255, 208, 138, 230))
    return cv, gl


def p_pole_sign_strip():
    """A shopping strip's pole sign by the road, from above, laid back to be read (its pole the prop's): a stepped
    deco cabinet in teal, PALM PLAZA in pink tubes on a dark header, and four backlit tenant panels: LIQUOR, PAWN,
    CHECKS CASHED, BODEGA (the PAWN panel broken at a corner, its tubes showing), grime, a bird's nest on top
    (the emissive map: the tubes, the panels' faces)."""
    W, H = 112, 88
    cv, gl = Cv(W, H), Cv(W, H)
    rng = random.Random(10411)
    pole_cabinet(cv, W, H, '#5ab8b0', CREAM, rng)
    frect(cv, 8, 10, W - 8, 22, hx('#1e1030'))
    ne = Neon(W, H)
    x = neon_text(ne, (W - 56) // 2, 13, 'PALM', NEON_PINK)
    neon_text(ne, x + 4, 13, 'PLAZA', NEON_PINK)
    ne.line([(12, 20), (W - 13, 20)], NEON_CYAN)
    panels = (('LIQUOR', '#f4f0e6', '#c8242c'), ('PAWN', '#f0c828', '#1a1a20'), ('CHECKS CASHED', '#f4f0e6', '#1c6a3c'),
              ('BODEGA', '#c8242c', '#f4f0e6'))
    for k, (txt, face, ink) in enumerate(panels):
        y0 = 25 + k * 14
        frect(cv, 7, y0, W - 7, y0 + 12, shade(STEEL_L, 0.3))
        frect(cv, 8, y0 + 1, W - 8, y0 + 11, hx(face))
        frect(cv, 8, y0 + 1, W - 8, y0 + 2, lambda c: lt(c, 0.25))
        words(cv, W / 2, y0 + 3, txt, hx(ink), 1.0, centre=True)
        frect(gl, 8, y0 + 1, W - 8, y0 + 11, alpha(mix(hx(face), PURE_WHITE, 0.4), 110))
        words(gl, W / 2, y0 + 3, txt, alpha(dk(hx(ink), 0.5), 0), 1.0, centre=True)
    hole = [(W - 26, 39), (W - 8, 39), (W - 8, 50), (W - 17, 50)]
    px_paint(cv, W - 26, 39, W - 8, 50, lambda x, y, c: hx('#0e0c16') if (y - 39) * 0.9 > (W - 26 - x) * -1.2 and x > W - 26 + (y - 39) * 0.8 else None)
    px_paint(gl, W - 26, 39, W - 8, 50, lambda x, y, c: CLEAR if x > W - 26 + (y - 39) * 0.8 else None)
    for y in (41.5, 47.5):                                                  # its tubes, bare
        frect(cv, W - 22 + (y - 39) * 0.8, y, W - 8, y + 1, hx('#f4fff8'))
        frect(gl, W - 22 + (y - 39) * 0.8, y, W - 8, y + 1, hx('#f0fff4'))
    del hole
    smudge(cv, rng, 10, (7, 24, W - 7, H - 6), (1.5, 4.0), 0.14)
    fill_shape(cv, 20, 6, 4.0, 2.2, lambda u, v, L: shift(hx('#6a5038') if rng.random() < 0.6 else hx('#9a8058'), rng.randint(-10, 10)))   # a nest
    ne.render(cv, gl)
    cv.outline()
    return cv, gl


def yard_fence(gate):
    def make():
        """A front yard's chain-link fence from above, 4 m, waist high, laid back a little: its top rail, the posts
        with their dome caps, the diamond mesh; `gate`: the gate in its middle between two heavier posts, its own
        frame, a fork latch; bougainvillea climbing one end, magenta among its leaves; rust."""
        W, H = 128, 12
        cv = Cv(W, H)
        rng = random.Random(10421 + gate)
        mesh = hx('#a8aeb8')

        def m(x, y, cur):
            u, v = x - 1.0, (y - 3.5) * 2.4
            if (abs((u + v) % 3.5 - 1.75) < 0.32) or (abs((u - v) % 3.5 - 1.75) < 0.32):
                c = shift(mesh, rng.randint(-14, 6))
                return alpha(dk(c, 0.15) if gate and 48 < x < 80 else c, 200)
            return None
        px_paint(cv, 0, 3.5, W, 10.5, m)
        frect(cv, 0, 2.6, W, 3.6, shade(ZINC, 0.75))
        frect(cv, 0, 2.6, W, 3.0, shade(ZINC, 0.95))
        posts = (2.0, 126.0) + ((48.0, 80.0) if gate else (64.0,))
        if gate:
            for (a, b) in (((49.5, 3.5), (78.5, 3.5)), ((49.5, 10.0), (78.5, 10.0)), ((49.5, 3.5), (49.5, 10.0)), ((78.5, 3.5), (78.5, 10.0))):
                line(cv, a[0], a[1], b[0], b[1], shade(ZINC, 0.85))
            frect(cv, 78.5, 4.5, 80.5, 6.0, shade(ZINC, 0.4))                # the latch
            px_paint(cv, 48.5, 2.5, 79.5, 3.7, lambda x, y, c: CLEAR)        # the gate's top rail is its own
            line(cv, 49.5, 3.2, 78.5, 3.2, shade(ZINC, 0.9))
        for x in posts:
            r = 2.0 if gate and x in (48.0, 80.0) else 1.6
            fill_shape(cv, x, 3.1, r, r, lambda u, v, L: shade(ZINC, 0.2 + L * 0.8))
        smudge(cv, rng, 6, (0, 2, W, 11), (1.0, 2.5), 0.4, WALNUT)
        leaf, bloom = ramp('#2e6a34', 0.55, 0.3, 0.3), ramp('#e02a8a', 0.45, 0.24, 0.3)
        vine = Cv(W, H, cv.s)
        for _ in range(70):
            x, y = rng.uniform(96, W - 1) if rng.random() < 0.8 else rng.uniform(86, 96), rng.uniform(1.0, 11.0)
            if rng.random() < 0.42:
                fill_shape(vine, x, y, 1.0, 0.8, lambda u, v, L: shade(bloom, 0.3 + L * 0.65), ang=rng.uniform(0, 3))
            else:
                fill_shape(vine, x, y, 1.3, 0.7, lambda u, v, L: shade(leaf, 0.2 + L * 0.7), ang=rng.uniform(0, 3))
        vine.outline(hx('#0e2010'))
        cv.over(vine)
        return cv
    return make


def garden_wall(name):
    def make():
        """A low stucco garden wall from above, 3 m, laid back a little: its rounded coping lit along its top, a
        sliver of its face below in `name`'s pastel with a run of breeze blocks in its middle (their round openings
        dark), a pier at each end under a pyramid cap, the stucco cracked through and chipped to the grey block, rain
        stains, a rust run from a rebar."""
        W, H = 96, 14
        cv = Cv(W, H)
        rng = random.Random(10431 + len(name))
        st = ramp(STUCCO.get(name, CREAM), 0.5, 0.26, 0.24)
        cap = ramp('#e8e2d4', 0.45, 0.22, 0.22)
        n = VNoise(W, H, 4, rng)

        def face(x, y, cur):
            if y < 2.5 or y >= 12.5 or x < 1 or x >= W - 1:
                return None
            if y < 7:
                return shift(shade(cap, 0.82 if y < 3.5 else 0.6 if y < 5.5 else 0.38), rng.randint(-3, 3))   # the coping
            c = shade(st, 0.5 - (y - 7) * 0.04 + (n(x, y) - 0.5) * 0.16)
            if 30 <= x < 66:
                bx, by = (x - 30) % 6.0, y - 9.75
                if math.hypot(bx - 3.0, by) < 1.6:
                    return hx('#1e1a24')                                   # a breeze block's opening
                if bx < 0.4:
                    c = dk(c, 0.18)
            return c
        px_paint(cv, 0, 0, W, H, face)
        for x0 in (0.0, W - 8.0):                                           # the piers and their caps
            fill_shape(cv, x0 + 4, 7.0, 4.0, 6.0, lambda u, v, L: shade(st, 0.3 + L * 0.55), kind='rect', corner=0.5, bevel=1.2)
            fill_shape(cv, x0 + 4, 4.5, 3.4, 3.4, lambda u, v, L: shade(cap, 0.25 + L * 0.7 + (0.15 if u + v < 0 else -0.1)), kind='rect', corner=0.4, bevel=3.0)
        cx = rng.uniform(20, 76)
        crease(cv, [(cx, 2.5), (cx + 1.5, 6.0), (cx + 0.5, 9.0), (cx + 2.0, 12.5)], 0.45)
        crease(cv, [(cx + 30, 7.0), (cx + 31, 12.5)], 0.35)
        px_paint(cv, 70, 2.5, 76, 5.0, lambda x, y, c: shade(ramp('#8e8a84', 0.45, 0.22, 0.3), 0.5) if (x - 70) * 0.5 + (y - 2.5) < 2.4 else None)   # chipped
        smudge(cv, rng, 8, (2, 7, W - 2, 12.5), (1.5, 3.5), 0.16)
        px_paint(cv, 24, 7, 25, 12.5, lambda x, y, c: mix(c, RUST_BROWN, 0.4 * (1 - (y - 7) / 6)) if c[3] else None)   # rust run
        cv.outline()
        return cv
    return make


def p_carport():
    """An aluminium carport over a drive from above, 6 x 3.25 m (hung over the car parked under it, which shows
    through): green corrugated fibreglass panels, translucent, their ribs running down the slope from the house (-y)
    to the gutter, lapped at their seams; the purlins under them; the white fascia and gutter along the front and
    the ends; a yellowed panel, one cracked through, leaves and grime along the gutter, a moss streak."""
    W, H = 192, 104
    cv = Cv(W, H)
    rng = random.Random(10441)
    n = VNoise(W, H, 16, rng)

    def roof(x, y, cur):
        if x < 2 or x >= W - 2 or y < 2 or y >= H - 2:
            return None
        if y >= H - 7:
            return shade(ramp('#e8e6dc', 0.4, 0.2, 0.2), 0.85 if y < H - 6 else 0.5 if y < H - 3.5 else 0.3)   # the gutter
        if x < 4 or x >= W - 4:
            return shade(ramp('#e8e6dc', 0.4, 0.2, 0.2), 0.7 if x < 4 else 0.35)
        pnl = int((x - 4) // 26)
        base = hx('#d8d4a0') if pnl == 4 else hx('#b4d4a4')
        rib = 0.5 + 0.5 * math.sin((x - 4) * 2 * math.pi / 3.25)
        c = mix(dk(base, 0.25), lt(base, 0.25), rib * 0.8 + (n(x, y) - 0.5) * 0.3)
        a = 165
        if (x - 4) % 26 < 1.2:
            c, a = dk(base, 0.35), 230                                        # the lap
        if abs(y - 34) < 1.5 or abs(y - 70) < 1.5:
            c, a = mix(c, IRON_GREY, 0.6), 230                          # a purlin under it
        return alpha(c, a)
    px_paint(cv, 0, 0, W, H, roof)
    px_paint(cv, 118, 30, 140, 56, lambda x, y, c: CLEAR if abs((x - 118) * 1.1 - (y - 30) - 2 * math.sin(y)) < 1.4 or (x - 128) ** 2 + (y - 44) ** 2 < 7 else None)   # cracked through
    for _ in range(26):                                                    # leaves in the gutter, on the roof
        x, y = rng.uniform(6, W - 6), rng.choice((rng.uniform(H - 7, H - 4), rng.uniform(8, H - 10)))
        fill_shape(cv, x, y, rng.uniform(1.0, 1.8), 0.7, lambda u, v, L: shade(ramp(rng.choice(('#8a6a3a', '#6a7a3a', '#a0803a')), 0.5, 0.25, 0.3), 0.3 + L * 0.5), ang=rng.uniform(0, 3))
    smudge(cv, rng, 10, (6, H - 18, W - 6, H - 7), (2.0, 5.0), 0.25, hx('#4a5a2a'))   # moss, grime
    smudge(cv, rng, 8, (6, 6, W - 6, H - 8), (3.0, 7.0), 0.12)
    cv.outline()
    return cv


def p_driveway():
    """A house's concrete drive (floor paint), 6 x 3.25 m: two slabs split by a sawn joint, the tracks of the tyres
    worn paler, an oil stain where the car stands, cracks, grass in the joints, its edges broken."""
    W, H = 192, 104
    cv = Cv(W, H)
    rng = random.Random(10451)
    con = CONCRETE
    n, n2 = VNoise(W, H, 8, rng), VNoise(W, H, 3, rng)

    def f(x, y, cur):
        e = min(x, y, W - x, H - y) + (n(x * 2, y * 2) - 0.5) * 2.5
        if e < 0.5:
            return None
        k = 0.5 + (n(x, y) - 0.5) * 0.16 + (n2(x, y) - 0.5) * 0.06
        if any(abs(y - t) < 8 for t in (H / 2 - 16, H / 2 + 16)) and 10 < x < W - 10:
            k += 0.06                                                      # the tyres' tracks
        c = shade(con, k)
        if abs(x - W / 2) < 0.6 or abs(y - H / 2) < 0.5:
            c = dk(c, 0.3)                                                 # the joints
            if rng.random() < 0.3:
                c = hx('#4a6a32')                                          # grass in them
        return c
    px_paint(cv, 0, 0, W, H, f)
    for (x, y, r) in ((112, 52, 13), (96, 50, 7)):
        smudge(cv, rng, 4, (x - 4, y - 4, x + 4, y + 4), (r * 0.5, r), 0.3, SOOT)
    crease(cv, [(20, 8), (34, 22), (38, 40), (52, 48)], 0.3)
    crease(cv, [(150, H - 6), (160, 70), (176, 64)], 0.3)
    return cv


def p_tv_antenna():
    """A roof's TV aerial from above (hung high on a roof's edge), 1.75 m: the boom along x on its mast's clamp, the
    elements across it shortening from the reflector to the directors, the dipole's black box and the flat lead
    running back to the mast, one element bent by a storm, a guy wire, rust at the joints."""
    W, H = 56, 30
    cv = Cv(W, H)
    rng = random.Random(10461)
    al = ramp('#a8acb4', 0.5, 0.25, 0.35)
    line(cv, 4, 15, 52, 15, shade(al, 0.85))
    line(cv, 4, 15.5, 52, 15.5, shade(al, 0.35))
    for k, x in enumerate(range(6, 52, 5)):
        h = 12.0 - k * 0.8
        if k == 6:
            line(cv, x, 15, x - 2, 15 - h, shade(al, 0.8))                   # bent
            line(cv, x, 15, x + 0.5, 15 + h, shade(al, 0.8))
        else:
            line(cv, x, 15 - h, x, 15 + h, shade(al, 0.85))
        stud(cv, x, 15, IRON_GREY)
    fill_shape(cv, 17, 15, 2.2, 1.6, lambda u, v, L: shade(RUBBER, 0.3 + L * 0.6), kind='rect', corner=0.4)   # the dipole's box
    fill_capsule(cv, [(17, 16.5), (24, 19), (28, 16)], 0.4, lambda k, L, s, i, t: hx('#3a3630'))   # the lead
    fill_shape(cv, 28, 15, 2.4, 2.4, lambda u, v, L: shade(STEEL_L, 0.25 + L * 0.6))   # the mast and its clamp
    line(cv, 28, 15, 2, 28, alpha(hx('#7a7e88'), 200))                       # a guy wire
    smudge(cv, rng, 4, (4, 12, 52, 18), (0.6, 1.4), 0.45, WALNUT)
    cv.outline(hx('#1a1a22'))
    return cv


def p_lawn_flamingos():
    """A pair of plastic lawn flamingos from above, on their wire legs in a front yard: the pink bodies, the wings'
    moulded lines, the S of the necks, the heads with their black-tipped beaks, one faded by the sun."""
    W, H = 30, 20
    cv = Cv(W, H)
    for (x, y, a, col, flip) in ((10, 11, 0.3, '#ff6aa0', 1), (21, 8, -0.5, '#f0a0b8', -1)):
        pink = ramp(col, 0.5, 0.26, 0.3)

        def bird(ly, x=x, y=y, a=a, pink=pink, flip=flip):
            ca, sa = math.cos(a), math.sin(a)
            fill_shape(ly, x, y, 4.4, 2.9, lambda u, v, L: shade(pink, 0.25 + L * 0.7) if u > -3.4 else shade(pink, 0.15 + L * 0.4), ang=a)
            crease(ly, [(x - ca * 3 - sa * 1, y - sa * 3 + ca * 1), (x + ca * 1, y + sa * 1), (x + ca * 3 - sa * 0.5, y + sa * 3)], 0.25)
            nx, ny = x + ca * 3.8, y + sa * 3.8
            neck = curve((nx, ny), (nx + ca * 4 + sa * 4 * flip, ny + sa * 4 - ca * 4 * flip), (nx + ca * 6.5 - sa * 0.5 * flip, ny + sa * 6.5 + ca * 0.5 * flip), 8)
            fill_capsule(ly, neck, 0.6, lambda k, L, s, i, t: shade(pink, 0.45 + L * 0.5))
            hx_, hy_ = neck[-1]
            fill_shape(ly, hx_, hy_, 1.4, 1.4, lambda u, v, L: shade(pink, 0.4 + L * 0.5))
            fill_capsule(ly, [(hx_ + ca * 1.0, hy_ + sa * 1.0), (hx_ + ca * 2.6, hy_ + sa * 2.6)], 0.55, lambda k, L, s, i, t: hx('#1a1a20') if t > 0.5 else hx('#f0e8d8'))
            ly.dot(hx_ - sa * 0.6, hy_ + ca * 0.6, hx('#1a1a20'))
        layer(cv, bird)
    return cv


def lawn(W, H, seed):
    def make():
        """A front yard's lawn gone to seed (floor paint, over dirt or between walls): St Augustine grass in soft
        drifts of green, dry straw patches burnt by the sun, a bare spot or two, its edge ragged."""
        cv = Cv(W, H)
        rng = random.Random(seed)
        n, dry, fine_ = VNoise(W, H, 16, rng), VNoise(W, H, 24, rng), VNoise(W, H, 2, rng)
        g, s = ramp('#4a7434', 0.5, 0.26, 0.28), ramp('#a0945a', 0.45, 0.24, 0.24)

        def f(x, y, cur):
            e = min(x, y, W - x, H - y) + (n(x * 3, y * 3) - 0.5) * 6
            if e < 1:
                return None
            k = 0.45 + (fine_(x, y) - 0.5) * 0.16 + (n(x, y) - 0.5) * 0.12
            d = dry(x, y) * 0.8 + n(x * 2, y * 2) * 0.2
            c = shade(g, k)
            if d > 0.58:
                c = mix(c, shade(s, k + 0.05), min(0.85, (d - 0.58) * 2.5))
            if d > 0.84:
                c = mix(c, FL_DIRT, min(0.7, (d - 0.84) * 5))         # bare
            c = shift(c, rng.randint(-7, 7))
            if rng.random() < 0.07:
                c = dk(c, 0.22)                                            # a blade's shadow
            return alpha(c, int(255 * min(1.0, (e - 1) / 2.5)))
        px_paint(cv, 0, 0, W, H, f)
        return cv
    return make


def oleander(flower, seed):
    def make():
        """An oleander bush from above, 1.75 m: its narrow leaves in whorls of three, dark and leathery, lit on their
        top faces, crowding into a rough dome; clusters of flowers at the stems' ends, a few petals dropped."""
        W, H = 56, 48
        cv = Cv(W, H)
        rng = random.Random(seed)
        leaf = ramp('#2a5a2e', 0.6, 0.32, 0.3)
        fill_shape(cv, W / 2, H / 2, W / 2 - 4, H / 2 - 4, lambda u, v, L: shade(leaf, 0.08 + L * 0.2), kind='super', p=2.4)
        tips = []
        for _ in range(110):
            a, r = rng.uniform(0, 2 * math.pi), rng.random() ** 0.5
            x, y = W / 2 + math.cos(a) * r * (W / 2 - 7), H / 2 + math.sin(a) * r * (H / 2 - 7)
            ly = Cv(W, H, cv.s)
            for k in range(3):
                b = a + k * 2.1 + rng.uniform(-0.3, 0.3)
                ln = rng.uniform(3.0, 5.0)
                tx, ty = x + math.cos(b) * ln, y + math.sin(b) * ln
                lit = light(-math.sin(b), math.cos(b)) * 0.4 + 0.22 + (1 - r) * 0.3   # the dome's top nearer the light
                fill_capsule(ly, [(x, y), (tx, ty)], 0.75, lambda kk, L, s, i, t, lit=lit: shade(leaf, lit + (0.15 if s < 0 else 0)))
            if rng.random() < 0.4:
                tips.append((x + math.cos(a) * 1.5, y + math.sin(a) * 1.5))
            ly.outline(hx('#0e2212'))
            cv.over(ly)
        pet = ramp(flower, 0.45, 0.22, 0.3)
        for (x, y) in tips:
            for _ in range(rng.randint(3, 5)):
                fx, fy, r = x + rng.uniform(-1.6, 1.6), y + rng.uniform(-1.6, 1.6), rng.uniform(1.0, 1.4)
                ring(cv, fx, fy, 0.0, r, lambda dx, dy, d, r=r: shade(pet, 0.35 + light(dx / r, dy / r) * 0.6) if d > 0.35 else hx('#e8c050'))
        for _ in range(8):
            cv.dot(rng.uniform(3, W - 3), rng.uniform(3, H - 3), pet[2])
        return cv
    return make


def cart_frame(cv, W, H):
    """A shopping cart's castors, wire basket and red handle (p_shopping_cart's, at any size)."""
    for (x, y) in ((2.5, 1.5), (2.5, H - 1.5), (W - 3.5, 1.5), (W - 3.5, H - 1.5)):
        fill_shape(cv, x, y, 1.1, 0.8, lambda u, v, L: shade(RUBBER, 0.4 + L * 0.4))
    wire = ramp('#b8bcc8', 0.5, 0.25, 0.25)

    def basket(x, y, cur):
        if x < 4 or x >= W - 2 or y < 2 or y >= H - 2:
            return None
        edge = x < 4.6 or x >= W - 2.6 or y < 2.6 or y >= H - 2.6
        bar = (x * 2) % 3 < 0.6 or (y * 2) % 3 < 0.6
        return shade(wire, 0.75) if edge else shade(wire, 0.45) if bar else None
    px_paint(cv, 0, 0, W, H, basket)
    frect(cv, 1, 2, 2, H - 2, hx('#c8202c'))
    frect(cv, 1, 2, 2, 2.5, lt(hx('#c8202c'), 0.3))


def p_cart_loaded():
    """A shopping cart someone lives out of, from above: heaped over its basket with a black bin bag, a white grocery
    bag knotted, a clear sack of crushed cans, a grey blanket thrown over one side and hanging over its edge, a broom
    handle across, a bag hung on the handle."""
    W, H = 24, 16
    cv = Cv(W, H)
    rng = random.Random(10471)
    cart_frame(cv, W, H)

    def load(ly):
        fill_shape(ly, 15.5, 6.0, 5.0, 3.6, lambda u, v, L: shade(ramp('#2a2c34', 0.5, 0.26, 0.45), 0.15 + L * 0.8), kind='super', p=2.2)
        fill_shape(ly, 9.0, 5.5, 3.2, 2.6, lambda u, v, L: shade(ramp('#e8e4da', 0.4, 0.2, 0.2), 0.3 + L * 0.6), ang=0.4)
        fill_shape(ly, 9.5, 11.0, 4.0, 2.6, lambda u, v, L: alpha(shade(ramp('#d8dce0', 0.4, 0.2, 0.2), 0.4 + L * 0.5), 230), kind='super', p=2.4)
        for _ in range(9):
            x, y = rng.uniform(6.5, 12.5), rng.uniform(9.5, 12.5)
            ly.dot(x, y, rng.choice((PALE_GREY, hx('#c82a2a'), hx('#e8e8ee'), hx('#2a5ab8'))))
        fill_shape(ly, 17.5, 11.5, 4.5, 3.4, lambda u, v, L: shade(ramp('#6a6e62', 0.5, 0.26, 0.3), 0.2 + L * 0.6), kind='rect', corner=1.5)
        frect(ly, 13.5, 13.0, 22.0, 15.5, lambda c: shade(ramp('#6a6e62', 0.5, 0.26, 0.3), 0.3))   # over the edge
    layer(cv, load)
    crease(cv, [(14.5, 9.5), (17, 12), (21, 13)], 0.25)
    fill_capsule(cv, [(3, 3.5), (22, 8.5)], 0.6, lambda k, L, s, i, t: shade(WOOD, 0.4 + L * 0.5))   # the broom handle
    fill_shape(cv, 1.5, 9.0, 1.4, 2.2, lambda u, v, L: shade(ramp('#3a6ab8', 0.45, 0.22, 0.3), 0.3 + L * 0.6))   # a bag on the handle
    cv.outline()
    return cv


def p_bedroll():
    """A sleeping bag rolled and tied, from above, 0.85 m: orange nylon quilted across, its layers spiralling at the
    ends, two cords knotted round it, a stain."""
    W, H = 28, 12
    cv = Cv(W, H)
    rng = random.Random(10481)
    ny = ramp('#c8622a', 0.5, 0.26, 0.3)

    def f(k, L, s, i, t):
        c = shade(ny, 0.2 + L * 0.7)
        x = 3 + t * 22
        if x % 4.0 < 0.5:
            c = dk(c, 0.18)                                                # its quilting
        return c
    fill_capsule(cv, [(5, 6), (23, 6)], 4.6, f)
    for x in (4.0, W - 4.0):
        ring(cv, x, 6, 0.0, 3.6, lambda dx, dy, d: shade(ny, 0.35 + 0.35 * math.sin(d * 3.0 + math.atan2(dy, dx))))   # the roll's ends
    for x in (9.0, 19.0):
        frect(cv, x, 1.4, x + 1.0, 10.6, hx('#4a3424'))
    smudge(cv, rng, 3, (6, 2, 22, 10), (1.0, 2.5), 0.25, hx('#5a3a20'))
    cv.outline()
    return cv


def p_cardboard_bed_blanket():
    """A bed on the sidewalk (floor paint), 2.1 m: two flattened boxes, a grey army blanket rumpled over them with its
    two dark stripes, a denim jacket rolled for a pillow at its head (-x), a paperback face down."""
    W, H = 68, 32
    cv = Cv(W, H)
    rng = random.Random(10491)
    card = ramp('#a5855a', 0.4, 0.2, 0.25)
    nz = VNoise(W, H, 4, rng)
    px_paint(cv, 1, 2, W - 1, H - 2, lambda x, y, c: shift(shade(card, 0.55 + (nz(x, y) - 0.5) * 0.3), -4 if int(y * 2) % 3 == 0 else 0))
    crease(cv, [(34, 2), (34.5, H - 2)], 0.2)
    fold = VNoise(W, H, 6, rng)
    bl = ramp('#6a6e5a', 0.5, 0.26, 0.28)

    def blanket(ly):
        def f(u, v, L):
            x, y = u + 38, v + 16
            k = 0.42 + (fold(x, y) - fold(x + 1.5, y + 1.5)) * 0.8 + L * 0.15
            c = shade(bl, max(0.05, min(0.95, k)))
            if 8 < (x - 18) % 30 < 10.5:
                c = dk(c, 0.35)                                            # its stripes
            return c
        fill_shape(ly, 38, 16, 26, 12, f, kind='rect', corner=3.0, bevel=2.0, ang=0.03)
    layer(cv, blanket)
    fill_capsule(cv, [(6, 9), (7, 23)], 3.6, lambda k, L, s, i, t: shade(ramp('#3a5a8a', 0.5, 0.26, 0.3), 0.2 + L * 0.65 - (0.15 if (t * 14) % 3 < 0.6 else 0)))
    fill_shape(cv, 58, 7, 3.0, 2.2, lambda u, v, L: shade(ramp('#c83a2a', 0.45, 0.22, 0.3), 0.3 + L * 0.5), ang=0.3, kind='rect', corner=0.3)
    smudge(cv, rng, 5, (2, 2, W - 2, H - 2), (2.0, 4.0), 0.15)
    cv.outline(hx('#1a1410'))
    return cv


def p_cardboard_sign():
    """A begging sign (floor paint), 0.95 m: a torn flap of a box, HUNGRY and GOD BLESS in black marker, the second
    line squeezed as the room ran out."""
    W, H = 30, 18
    cv = Cv(W, H)
    rng = random.Random(10501)
    card = ramp('#b8925e', 0.4, 0.2, 0.25)
    rag = VNoise(W, H, 3, rng)
    px_paint(cv, 0, 0, W, H, lambda x, y, c: shade(card, 0.55 + (rag(x * 2, y * 2) - 0.5) * 0.2) if min(x, y, W - x, H - y) + (rag(x, y) - 0.5) * 2.5 > 1.0 else None)
    hand_words(cv, W / 2, 3.5, 'HUNGRY', hx('#1a1620'), 0.75, 10502, centre=True)
    hand_words(cv, W / 2, 10.5, 'GOD BLESS', hx('#1a1620'), 0.5, 10503, centre=True)
    smudge(cv, rng, 3, (2, 2, W - 2, H - 2), (1.5, 3.0), 0.2)
    cv.outline(hx('#1a1410'))
    return cv


def p_bags_pile():
    """Someone's things heaped against a wall from above, 1.4 m: three black bin bags knotted at the neck, white
    grocery bags, a red plaid laundry bag, a brown suitcase with a belt round it, a blue tarp's corner."""
    W, H = 46, 24
    cv = Cv(W, H)
    rng = random.Random(10511)
    blk = ramp('#2a2c34', 0.5, 0.26, 0.45)

    def tarp(ly):
        fill_shape(ly, 8, 7, 8.0, 5.0, lambda u, v, L: shade(ramp('#2a5ab8', 0.5, 0.26, 0.3), 0.3 + L * 0.5), ang=-0.2, kind='rect', corner=1.0)
    layer(cv, tarp)

    def case(ly):
        fill_shape(ly, 30, 7, 9.0, 5.5, lambda u, v, L: shade(ramp('#7a5034', 0.5, 0.26, 0.3), 0.2 + L * 0.65), ang=0.1, kind='rect', corner=1.2, bevel=1.5)
        fill_capsule(ly, [(26, 1.8), (27, 12.5)], 0.5, lambda k, L, s, i, t: hx('#2a1a10'))
    layer(cv, case)
    for (x, y, rx, ry, a) in ((10, 15, 7.0, 6.0, 0.4), (21, 13, 6.0, 5.5, -0.3), (40, 15, 5.5, 5.0, 0.8)):
        def bag(ly, x=x, y=y, rx=rx, ry=ry, a=a):
            fill_shape(ly, x, y, rx, ry, lambda u, v, L: shade(blk, 0.1 + L * 0.85 + (0.2 if L > 0.82 else 0)), ang=a, kind='super', p=2.2)
            fill_shape(ly, x + math.cos(a) * rx * 0.8, y + math.sin(a) * rx * 0.8, 1.2, 1.0, lambda u, v, L: shade(blk, 0.6))   # the knot
        layer(cv, bag)
    for (x, y) in ((30, 19), (34, 21)):
        layer(cv, lambda ly, x=x, y=y: fill_shape(ly, x, y, 2.8, 2.2, lambda u, v, L: shade(ramp('#e8e4da', 0.4, 0.2, 0.2), 0.3 + L * 0.6), ang=rng.uniform(0, 3)))

    def plaid(ly):
        def f(u, v, L):
            c = shade(ramp('#b8282c', 0.5, 0.26, 0.3), 0.25 + L * 0.6)
            if int((u + 10) * 1.0) % 4 == 0 or int((v + 10) * 1.0) % 4 == 0:
                c = mix(c, hx('#1a1a30'), 0.45)
            return c
        fill_shape(ly, 16, 5, 4.5, 3.6, f, ang=0.5)
    layer(cv, plaid)
    return cv


def p_doorway_camp():
    """A man's camp in a shop's doorway from above, 2.25 m (the wall and its door at -y): the shutter's steel grille
    along the wall, a brown tarp tied to it and pulled down to two bricks over a cardboard bed, a blanket's edge out
    of its mouth, his boots set side by side, a blue milk crate for a table with a radio and a candle in a can, a
    bottle, a carrier bag."""
    W, H = 72, 48
    cv = Cv(W, H)
    rng = random.Random(10521)
    px_paint(cv, 2, 0.5, W - 2, 4.5, lambda x, y, c: shade(STEEL_L, 0.75 if x % 3 < 1 else 0.3) if y < 4 else shade(STEEL_L, 0.5))   # the grille
    frect(cv, 6, 6, 58, 40, hx('#b88a52'))                                  # the cardboard
    fill_shape(cv, 30, 38, 18, 4.0, lambda u, v, L: shade(ramp('#6a3a5a', 0.5, 0.26, 0.3), 0.3 + L * 0.5), kind='rect', corner=2.0)
    tarp = ramp('#7a5a3a', 0.5, 0.26, 0.3)

    def sheet(u, v, L):
        y = v + 18
        k = 0.75 - y / 36 * 0.5 - 0.1 * abs(math.sin((u + 26) / 13.0 * math.pi))
        return shade(tarp, max(0.05, min(0.95, k)))
    layer(cv, lambda ly: fill_shape(ly, 32, 18, 26, 14, sheet, kind='rect', corner=2.0, bevel=1.5), hx('#1a1008'))
    for x in (9.0, 32.0, 55.0):
        line(cv, x, 3.0, x, 6.5, hx('#d8d0b8'))                             # tied to the grille
    for x in range(10, 56, 9):
        stud(cv, x, 6.5, PALE_GREY)                                     # its grommets
    for pts in (((14, 8), (18, 20), (16, 30)), ((46, 10), (50, 22)), ((24, 12), (30, 24), (36, 28)), ((38, 8), (40, 16))):
        crease(cv, list(pts), 0.3)
    frect(cv, 27, 17, 34, 18.5, lambda c: mix(c, hx('#a8a8a0'), 0.6))      # duct tape over a tear
    for x in (8.0, 56.0):
        fill_shape(cv, x, 32.5, 3.2, 2.0, lambda u, v, L: shade(ramp('#a04a2a', 0.5, 0.25, 0.3), 0.3 + L * 0.6), kind='rect', corner=0.5)   # bricks
    for (x, y) in ((16.5, 43.0), (21.0, 43.5)):
        fill_shape(cv, x, y, 1.8, 3.6, lambda u, v, L: shade(ramp('#4a3424', 0.5, 0.26, 0.35), 0.2 + L * 0.7), kind='super', p=2.5)   # boots
    fill_shape(cv, 64, 24, 6.0, 6.0, lambda u, v, L: shade(ramp('#2a5ab8', 0.5, 0.26, 0.3), 0.3 + L * 0.6), kind='rect', corner=0.8, bevel=1.0)
    for k in range(4):
        frect(cv, 59.5 + k * 2.5, 19, 60.5 + k * 2.5, 29, lambda c: dk(c, 0.3))   # the crate's slots
    fill_shape(cv, 62.5, 22, 3.0, 2.0, lambda u, v, L: shade(ramp('#3a3a42', 0.5, 0.25, 0.35), 0.3 + L * 0.6), kind='rect', corner=0.4)   # the radio
    ring(cv, 67, 27, 0.0, 1.4, lambda dx, dy, d: shade(STEEL_L, 0.5) if d > 0.7 else hx('#ffd080'))   # the candle in its can
    bottle_down(cv, 44, 44, 0.3, '#5a3a14')
    fill_shape(cv, 4, 42, 2.6, 2.4, lambda u, v, L: shade(ramp('#e8e4da', 0.4, 0.2, 0.2), 0.3 + L * 0.6))
    smudge(cv, rng, 6, (6, 6, 58, 40), (2.0, 4.0), 0.14)
    cv.outline()
    return cv


def p_litter_bottles():
    """What a corner collects (floor paint), 2 m: a bottle in its brown paper bag, a malt liquor bottle on its side
    and the brown glass of another one broken, crushed beer cans, butts, a scratched lottery ticket."""
    W, H = 64, 32
    cv = Cv(W, H)
    rng = random.Random(10531)
    fill_shape(cv, 18, 14, 5.0, 2.6, lambda u, v, L: shade(ramp('#a8845a', 0.4, 0.2, 0.25), 0.3 + L * 0.6), ang=0.5, kind='rect', corner=1.0)
    crease(cv, [(15, 12), (20, 16)], 0.25)
    fill_capsule(cv, [(22.0, 16.5), (24.5, 17.8)], 0.6, lambda k, L, s, i, t: shade(ramp('#5a3a14', 0.5, 0.25, 0.5), L + 0.1))
    bottle_down(cv, 44, 10, 2.6, '#5a3a14')
    bottle_down(cv, 36, 24, -0.4, '#2a5a2a')
    for _ in range(26):
        x, y = rng.gauss(52, 4), rng.gauss(22, 3)
        cv.dot(x, y, rng.choice((hx('#7a4a14'), hx('#a8702a'), hx('#c89a5a'))))
    for (x, y, col) in ((8, 24, '#c8c8d0'), (28, 6, '#2a5ab8'), (56, 8, '#c82a2a')):
        fill_shape(cv, x, y, 2.6, 1.6, lambda u, v, L, col=col: shade(ramp(col, 0.5, 0.25, 0.3), 0.2 + L * 0.6), ang=rng.uniform(0, 3), kind='super', p=2.0)
    for _ in range(6):
        x, y, a = rng.uniform(4, W - 4), rng.uniform(4, H - 4), rng.uniform(0, 3)
        fill_capsule(cv, [(x, y), (x + math.cos(a) * 1.8, y + math.sin(a) * 1.8)], 0.4, lambda k, L, s, i, t: hx('#e8c890') if t < 0.4 else hx('#f0eee8'))
    fill_shape(cv, 10, 8, 2.2, 1.4, lambda u, v, L: hx('#d8e8c0'), ang=0.3, kind='rect', corner=0.2)
    frect(cv, 9, 7.5, 11.5, 8.5, hx('#8a9a70'))
    cv.outline(hx('#14121a'))
    return cv


def fruit_heap(cv, x0, y0, x1, y1, kind, rng):
    """Fruit heaped in a crate's or a table's [x0, x1) x [y0, y1): oranges, mangoes (red to yellow to green), limes,
    avocados, or green coconuts."""
    cols = dict(orange=('#ff8a1a',), mango=('#d83a2a', '#f0a020', '#8ab030'), lime=('#6aa82a',), avocado=('#3a5a22',),
                coconut=('#5a8a2a', '#6a9a30', '#8a6a2a'))[kind]
    rad = dict(orange=1.9, mango=2.0, lime=1.5, avocado=1.8, coconut=2.9)[kind]
    n = int((x1 - x0) * (y1 - y0) / (rad * rad * 2.4)) + 2
    for _ in range(n):
        x, y = rng.uniform(x0 + rad * 0.8, x1 - rad * 0.8), rng.uniform(y0 + rad * 0.8, y1 - rad * 0.8)
        col = ramp(rng.choice(cols), 0.5, 0.26, 0.3)
        sq = 0.78 if kind in ('mango', 'avocado') else 1.0

        def f(u, v, L, col=col):
            return shade(col, 0.15 + L * 0.8)
        fill_shape(cv, x, y, rad, rad * sq, f, ang=rng.uniform(0, 3))
        if kind == 'mango':
            fill_shape(cv, x - 0.4, y - 0.4, rad * 0.6, rad * 0.5, lambda u, v, L: alpha(hx('#f0c030'), 255) if rng.random() < 0.7 else None)
        if kind == 'coconut':
            cv.dot(x, y, dk(col[1], 0.3))


def crate_box(cv, x0, y0, x1, y1, seed):
    """A slatted fruit crate's rim and floor seen from above, its inside dark between the slats."""
    w = ramp('#b89060', 0.45, 0.22, 0.28)
    frect(cv, x0, y0, x1, y1, shade(w, 0.2))
    for (a, b, c, d) in ((x0, y0, x1, y0 + 1.5), (x0, y1 - 1.5, x1, y1), (x0, y0, x0 + 1.5, y1), (x1 - 1.5, y0, x1, y1)):
        frect(cv, a, b, c, d, shade(w, 0.75 if b == y0 or a == x0 else 0.4))
    px_paint(cv, x0 + 1.5, y0 + 1.5, x1 - 1.5, y1 - 1.5, lambda x, y, c: shade(w, 0.35) if int(y - y0) % 3 == 0 else None)


def market_stall(kind):
    def make():
        """A fruit stall on a vacant corner from above, 2.5 m: a striped canvas awning over its back half sun-faded,
        a scalloped valance, a bare bulb hung from its front edge (the emissive map), and under it on the trestle
        table crates of fruit in plain sight; `fruit`: oranges, mangoes, limes and avocados, a hanging scale, paper
        bags; `coco`: green coconuts heaped, a few husked, a bundle of sugar cane, a machete on its block, a cooler."""
        W, H = 80, 48
        cv, gl = Cv(W, H), Cv(W, H)
        rng = random.Random(10541 + len(kind))
        frect(cv, 3, 22, W - 3, 46, lambda c: c)
        fill_shape(cv, W / 2, 35, W / 2 - 3, 11, lambda u, v, L: shade(PLY, 0.3 + L * 0.5), kind='rect', corner=0.8, bevel=1.0)   # the table
        frect(cv, 3, 45, W - 3, 46, shade(PLY, 0.2))
        if kind == 'fruit':
            for k, (fk) in enumerate(('orange', 'mango', 'lime', 'avocado')):
                x0 = 6 + k * 17.5
                crate_box(cv, x0, 26, x0 + 16, 43, 0)
                fruit_heap(cv, x0 + 1.5, 27.5, x0 + 14.5, 41.5, fk, rng)
                frect(cv, x0 + 10, 39, x0 + 15, 42, CHALK)
                hand_words(cv, x0 + 10.5, 39.7, ('1', '3', '5', '2')[k], hx('#c8282c'), 0.3, 10550 + k)
            ring(cv, 74, 30, 0.0, 3.0, lambda dx, dy, d: shade(STEEL_L, 0.3 + light(dx / 3, dy / 3) * 0.6) if d > 2.2 else hx('#f4f2ea'))   # the scale
            line(cv, 74, 30, 75.5, 28.6, hx('#c8282c'))
            awn = (ramp('#f08a3a', 0.5, 0.26, 0.3), ramp('#f4f0e6', 0.45, 0.24, 0.25))
        else:
            fruit_heap(cv, 6, 25, 44, 44, 'coconut', rng)
            for (x, y) in ((14, 30), (24, 38), (36, 29)):
                fill_shape(cv, x, y, 2.4, 2.2, lambda u, v, L: shade(ramp('#8a6a3a', 0.5, 0.25, 0.3), 0.2 + L * 0.7))
                cv.dot(x - 0.5, y - 0.5, hx('#2a1a10'))
            for k in range(5):
                fill_capsule(cv, [(47, 27 + k * 1.6), (76, 28 + k * 1.4)], 0.75, lambda kk, L, s, i, t: hx('#c8b860') if (t * 30) % 6 < 0.5 else shade(ramp('#a8b85a', 0.5, 0.25, 0.3), 0.3 + L * 0.6))   # cane
            fill_shape(cv, 56, 40, 6.0, 3.6, lambda u, v, L: shade(ramp('#8a6a42', 0.5, 0.25, 0.3), 0.3 + L * 0.5))   # the block
            fill_capsule(cv, [(52, 39), (62, 41)], 0.6, lambda k, L, s, i, t: shade(STEEL_L, 0.5 + L * 0.4) if t > 0.3 else hx('#3a2418'))   # machete
            fill_shape(cv, 71, 39, 5.0, 4.0, lambda u, v, L: shade(ramp('#f4f2ea', 0.4, 0.2, 0.2), 0.3 + L * 0.6), kind='rect', corner=0.8)   # the cooler
            awn = (ramp('#3a9a5a', 0.5, 0.26, 0.3), ramp('#f4f0e6', 0.45, 0.24, 0.25))
        fd = VNoise(W, H, 8, rng)

        def cloth(x, y, cur):
            if y > 20 and (y - 20) > 3.0 * abs(math.sin((x - 2.0) * math.pi / 8.0)) + 0.5:
                return None
            r = awn[0] if int((x - 2.0) // 8) % 2 == 0 else awn[1]
            k = 0.62 - (y - 2) / 20 * 0.2 + (fd(x, y) - 0.5) * 0.1
            c = shade(r, k)
            return mix(c, hx(CREAM), 0.25 * fd(x * 2, y))                   # faded
        px_paint(cv, 2, 2, W - 2, 24, cloth)
        frect(cv, 2, 2, W - 2, 3, shade(STEEL_L, 0.45))                      # the frame along its back
        smudge(cv, rng, 6, (4, 3, W - 4, 20), (1.5, 4.0), 0.12)
        cv.outline()
        line(cv, 40, 19, 40, 23.5, GRAPHITE)                            # the bulb on its cord
        fill_shape(cv, 40, 24.5, 1.3, 1.3, lambda u, v, L: hx('#fff4c0'))
        fill_shape(gl, 40, 24.5, 1.3, 1.3, lambda u, v, L: hx('#ffe8a0'))
        return cv, gl
    return make


def fruit_crate(kind):
    def make():
        """A crate of fruit set out on the sidewalk, from above, 0.6 m: its slatted sides, the fruit heaped in it
        (`kind`), a grower's paper label on the end board."""
        W, H = 20, 14
        cv = Cv(W, H)
        rng = random.Random(10561 + len(kind))
        crate_box(cv, 1, 1, W - 1, H - 1, 0)
        fruit_heap(cv, 2.5, 2.5, W - 2.5, H - 2.5, kind, rng)
        frect(cv, 1, 4.5, 2.5, 9.5, hx(('#2a6ab8', '#c8282c', '#2a8a4a')[len(kind) % 3]))
        cv.outline()
        return cv
    return make


def plywood_sign(W, H, lines, seed, legs=True):
    """A hand-painted plywood sign laid back to be read (an A-frame's legs behind it): its primer patchy, `lines`
    [(text, ink, k, y)] in brush capitals, paint run down from a few strokes, a nail at each corner."""
    cv = Cv(W, H)
    rng = random.Random(seed)
    if legs:
        for x in (4.0, W - 4.0):
            fill_capsule(cv, [(x, 1.5), (x, 3.5)], 1.0, lambda k, L, s, i, t: shade(PLY, 0.2 + L * 0.4))
    n = VNoise(W, H, 4, rng)
    fill_shape(cv, W / 2, H / 2 + 1, W / 2 - 1.5, H / 2 - 2, lambda u, v, L: mix(shade(PLY, 0.5 + L * 0.3), LINEN, 0.7 * n(u + W, v + H) + 0.2), kind='rect', corner=0.5, bevel=1.0)
    for (txt, ink, k, y) in lines:
        hand_words(cv, W / 2, y, txt, hx(ink), k, seed + len(txt), centre=True)
        for _ in range(2):
            x = W / 2 + rng.uniform(-words_w(txt, k) / 2, words_w(txt, k) / 2)
            yy = y + 7 * k
            if cv.get(x, yy - 0.3)[:3] == hx(ink)[:3]:
                frect(cv, x, yy, x + 0.5, yy + rng.uniform(1.0, 2.5), hx(ink))   # a run of paint
    for (x, y) in ((2.5, 3.0), (W - 3.0, 3.0), (2.5, H - 2.0), (W - 3.0, H - 2.0)):
        stud(cv, x, y, hx('#6a6670'))
    smudge(cv, rng, 4, (2, 2, W - 2, H - 2), (1.0, 3.0), 0.14)
    cv.outline()
    return cv


def p_market_sign():
    """The fruit stall's sign on its A-frame (hand-painted): MANGOS in red, FRESH 3/$1 in green under it."""
    return plywood_sign(44, 18, (('MANGOS', '#c8282c', 1.0, 3.5), ('FRESH 3/$1', '#1c6a3c', 0.5, 12.0)), 10571)


def p_carwash_sign():
    """A car wash's big sign on its two stakes by the kerb (hand-painted): CAR WASH in blue and $3 in red."""
    cv = plywood_sign(72, 20, (), 10581, legs=False)
    hand_words(cv, 5, 5.0, 'CAR WASH', hx('#1e4ab0'), 1.0, 10583)
    hand_words(cv, 55, 3.5, '$3', hx('#c8282c'), 1.3, 10582)
    for x in (6.0, 66.0):
        fill_shape(cv, x, 17.5, 2.0, 1.6, lambda u, v, L: shade(ramp('#8a6a42', 0.5, 0.25, 0.3), 0.3 + L * 0.6), kind='rect', corner=0.3)   # the stakes
    return cv


def p_carwash_board():
    """The car wash's sandwich board (hand-painted): HAND / WASH / WAX $5."""
    return plywood_sign(24, 18, (('HAND', '#1e4ab0', 0.5, 4.0), ('WASH', '#1e4ab0', 0.5, 8.0), ('WAX $5', '#c8282c', 0.5, 12.0)), 10591)


def p_wash_bucket():
    """A car wash's bucket from above, 0.45 m: red plastic, its rim lit, soapy grey water with the foam riding on it,
    a yellow sponge floating, the wire handle laid over, suds run down its side."""
    S = 14
    cv = Cv(S, S)
    rng = random.Random(10601)
    c = S / 2
    red = ramp('#c83a2a', 0.5, 0.26, 0.3)
    ring(cv, c, c, 0.0, 6.2, lambda dx, dy, d: shade(red, 0.3 + light(dx / 6, dy / 6) * 0.6))
    ring(cv, c, c, 0.0, 5.0, lambda dx, dy, d: mix(hx('#7a8a92'), hx('#f4f6f8'), 0.8) if rng.random() < 0.55 else hx('#8a9aa2'))
    fill_shape(cv, c + 1.0, c - 0.5, 2.4, 1.6, lambda u, v, L: shade(ramp('#f0c828', 0.45, 0.22, 0.3), 0.3 + L * 0.6), ang=0.4, kind='rect', corner=0.6)
    line(cv, 1.5, c + 1.5, S - 1.5, c + 1.5, shade(STEEL_L, 0.7))
    cv.outline()
    return cv


def p_hose_reel():
    """A hose reel cart from above, 0.85 m: the green hose wound on its drum between the two dark green frames, the
    wheels at its ends, the handle at -x, the hose's end run out with a brass nozzle."""
    W, H = 28, 18
    cv = Cv(W, H)
    fr = ramp('#2a4a32', 0.5, 0.26, 0.35)
    hose = ramp('#3a9a3a', 0.5, 0.26, 0.3)
    for x in (6.0, 22.0):
        fill_shape(cv, x, 9, 1.4, 7.4, lambda u, v, L: shade(fr, 0.2 + L * 0.7), kind='rect', corner=0.5)
        for y in (1.6, 16.4):
            fill_shape(cv, x, y, 2.4, 1.0, lambda u, v, L: shade(RUBBER, 0.3 + L * 0.5), kind='rect', corner=0.4)
    for k in range(9):
        y = 3.0 + k * 1.5
        fill_capsule(cv, [(7.5, y), (20.5, y + 0.3)], 0.85, lambda kk, L, s, i, t: shade(hose, 0.2 + L * 0.75))
    fill_capsule(cv, [(1.5, 3), (1.5, 15)], 0.8, lambda k, L, s, i, t: shade(fr, 0.4 + L * 0.5))   # the handle
    line(cv, 1.5, 3, 6, 3, shade(fr, 0.6))
    line(cv, 1.5, 15, 6, 15, shade(fr, 0.4))
    fill_capsule(cv, [(20.5, 15.5), (24.5, 16.5), (26.5, 13.0)], 0.85, lambda k, L, s, i, t: shade(hose, 0.3 + L * 0.6))
    fill_shape(cv, 26.6, 11.6, 0.9, 1.4, lambda u, v, L: shade(BRASS, 0.3 + L * 0.7), kind='rect', corner=0.4)
    cv.outline()
    return cv


def p_soap_puddle():
    """The car wash's puddle (floor paint), 2.25 m: a thin film of soapy water darkening the ground, its edge ragged,
    islands of foam with their bubbles, a rainbow sheen, a chamois dropped in it."""
    W, H = 72, 40
    cv = Cv(W, H)
    rng = random.Random(10611)
    n, f2 = VNoise(W, H, 12, rng), VNoise(W, H, 3, rng)

    def f(x, y, cur):
        d = math.hypot((x - W / 2) / (W / 2 - 2), (y - H / 2) / (H / 2 - 2)) + (n(x, y) - 0.5) * 0.6
        if d > 1:
            return None
        a = int(120 * min(1.0, (1 - d) * 5))
        c = (70, 84, 100, a)
        if rng.random() < max(0.0, f2(x, y) - 0.5) * 3.2 * (1 - d):
            c = (232, 238, 244, min(220, a + 110))                         # suds, thinning out to the edge
        elif 0.6 < f2(x * 0.7, y * 0.7) < 0.63:
            c = (150, 90, 160, a) if x < W / 2 else (80, 160, 140, a)      # the sheen
        return c
    px_paint(cv, 0, 0, W, H, f)
    for _ in range(30):
        x, y = rng.uniform(10, W - 10), rng.uniform(6, H - 6)
        if cv.get(x, y)[3] > 200:
            ring(cv, x, y, 0.4, 0.9, lambda dx, dy, d: (255, 255, 255, 230) if dx + dy < 0 else None)
    fill_shape(cv, 50, 24, 4.0, 2.4, lambda u, v, L: shade(ramp('#d8b070', 0.45, 0.22, 0.25), 0.3 + L * 0.5), ang=0.6, kind='super', p=2.2)
    return cv


def tyre_flat(cv, x, y, R, rng, letters=False, r_in=None):
    """A tyre lying flat from above: its sidewall a ring of black rubber lit on its top left, the tread's blocks
    round its outer edge, the rim's hole dark, raised white letters on the wall if `letters`, scuffs."""
    r_in = r_in or R * 0.52

    def f(dx, dy, d):
        if d < r_in:
            return None
        a = math.atan2(dy, dx)
        k = 0.2 + light(dx / R, dy / R) * 0.45 * (1 if d > (R + r_in) / 2 else -0.6) + 0.12
        c = shade(RUBBER, k)
        if d > R - 1.0 and int((a + math.pi) * R * 0.9) % 2 == 0:
            c = dk(c, 0.25)                                                # the tread
        if letters and abs(d - (R + r_in) / 2) < 0.5 and 0.3 < (a % 1.6) < 1.2 and int(a * 12) % 2:
            c = PUTTY
        return shift(c, rng.randint(-4, 4))
    ring(cv, x, y, 0.0, R, f)
    ring(cv, x, y, r_in - 0.6, r_in, lambda dx, dy, d: shade(RUBBER, 0.6 if dx + dy < 0 else 0.15))


def p_tyre_loose():
    """A used tyre lying flat, from above, 0.7 m: raised white letters on its wall, the tread worn."""
    S = 22
    cv = Cv(S, S)
    tyre_flat(cv, S / 2, S / 2, 10.0, random.Random(10621), True)
    cv.outline()
    return cv


def p_tyre_stack():
    """Four used tyres stacked by the kerb, from above, 0.75 m: never square on one another, the edges of the lower
    ones showing, the top one's hole dark down the stack, chalked prices."""
    S = 24
    cv = Cv(S, S)
    rng = random.Random(10631)
    for k in range(4):
        layer(cv, lambda ly, k=k: tyre_flat(ly, S / 2 + rng.uniform(-1.4, 1.4), S / 2 + rng.uniform(-1.4, 1.4), 9.8 - k * 0.1, rng, k == 3))
    ring(cv, S / 2, S / 2, 0.0, 4.4, lambda dx, dy, d: hx('#0e0c12') if cv.get(S / 2 + dx, S / 2 + dy)[3] == 0 else None)
    hand_words(cv, 5, 2.5, '5', PAPER_WHITE, 0.5, 10632)
    return cv


def p_tyre_pile():
    """A heap of used tyres in a yard, from above, 1.75 m: some flat, two on their edge with the tread across them, a
    whitewall among them, a puddle in one's hole."""
    W, H = 56, 40
    cv = Cv(W, H)
    rng = random.Random(10641)
    for (x, y, R) in ((14, 26, 10.0), (32, 28, 10.5), (44, 16, 9.5), (24, 12, 10.0)):
        layer(cv, lambda ly, x=x, y=y, R=R: tyre_flat(ly, x, y, R, rng, rng.random() < 0.4))
    for (x, y, a) in ((40, 32, 0.3), (16, 10, -0.7)):
        def edge(ly, x=x, y=y, a=a):
            def f(u, v, L):
                c = shade(RUBBER, 0.25 + L * 0.5)
                if int((u + 20) * 1.4) % 3 == 0:
                    c = dk(c, 0.3)                                         # the tread across it
                return c
            fill_shape(ly, x, y, 10.0, 3.8, f, ang=a, kind='rect', corner=3.0, bevel=2.0)
        layer(cv, edge)
    ring(cv, 32, 28, 0.0, 3.0, lambda dx, dy, d: (60, 70, 90, 220))
    ring(cv, 32, 28, 3.0, 3.6, lambda dx, dy, d: hx('#f0ece4') if cv.get(32 + dx, 28 + dy)[3] else None)   # a whitewall
    cv.outline()
    return cv


def p_tyre_rack():
    """A used tyre rack from above, 2 m: two steel rails along x on their posts, eight tyres stood on their edge side
    by side in it, their treads facing up, chalk on two of them."""
    W, H = 64, 20
    cv = Cv(W, H)
    rng = random.Random(10651)
    for y in (3.0, 17.0):
        frect(cv, 1, y - 1, W - 1, y + 1, shade(STEEL_L, 0.35))
        frect(cv, 1, y - 1, W - 1, y - 0.5, shade(STEEL_L, 0.8))
    for k in range(8):
        x = 5.0 + k * 7.6 + rng.uniform(-0.4, 0.4)

        def t(ly, x=x, k=k):
            def f(u, v, L):
                c = shade(RUBBER, 0.25 + L * 0.5)
                if int((v + 20) * 1.5) % 3 == 0 and abs(u) < 2.0:
                    c = dk(c, 0.3)
                return c
            fill_shape(ly, x, 10, 3.4, 9.0, f, kind='rect', corner=2.5, bevel=1.5)
        layer(cv, t)
    hand_words(cv, 11.5, 7, '8', PAPER_WHITE, 0.5, 10652)
    hand_words(cv, 34.5, 7, '12', PAPER_WHITE, 0.5, 10653)
    for x in (1.5, W - 1.5):
        fill_shape(cv, x, 10, 1.2, 8.5, lambda u, v, L: shade(STEEL_L, 0.3 + L * 0.5), kind='rect', corner=0.3)
    return cv


def p_tyre_sign():
    """A used tyre yard's sign (hand-painted): LLANTAS in yellow-on-black, USED TIRES $10 under it."""
    cv = plywood_sign(48, 18, (('LLANTAS', '#1a1a20', 1.0, 3.0), ('USED TIRES $10', '#c8282c', 0.5, 12.0)), 10661)
    return cv


GROUP = 'props'
SPRITES = {
    'driveway': (p_driveway, (192, 104), 'fine floor stock'),
    'lawn_dry_a': (lawn(128, 96, 10671), (128, 96), 'fine floor stock'),
    'lawn_dry_b': (lawn(96, 64, 10672), (96, 64), 'fine floor'),
    'cardboard_bed_blanket': (p_cardboard_bed_blanket, (68, 32), 'fine floor'),
    'cardboard_sign': (p_cardboard_sign, (30, 18), 'fine floor'),
    'litter_bottles': (p_litter_bottles, (64, 32), 'fine floor'),
    'soap_puddle': (p_soap_puddle, (72, 40), 'fine floor stock'),
    'bus_bench_bail': (bus_bench('bail'), (64, 26), 'fine', (62, 22)),
    'bus_bench_abogado': (bus_bench('abogado'), (64, 26), 'fine', (62, 22)),
    'payphone_pastel': (p_payphone_pastel, (20, 18), 'fine glow', (5, 5)),
    'news_box_yellow': (news_box_of('#e8b820', '#c8282c', 10701), (16, 13), 'fine', (14, 11)),
    'news_box_red': (news_box_of('#c02a2a', '#1a1a20', 10702), (16, 13), 'fine', (14, 11)),
    'mailbox_blue': (p_mailbox_blue, (18, 16), 'fine', (16, 14)),
    'mailbox_post': (mailbox_post('1402', '#5ab8b0', 10401), (20, 10), 'fine', (5, 5)),
    'mailbox_post_b': (mailbox_post('1410', '#2e2c34', 10402), (20, 10), 'fine', (5, 5)),
    'mailbox_post_c': (mailbox_post('1418', '#ece4d2', 10403), (20, 10), 'fine', (5, 5)),
    'mailbox_post_d': (mailbox_post('1426', '#a84a3a', 10404), (20, 10), 'fine', (5, 5)),
    'pole_sign_strip': (p_pole_sign_strip, (112, 88), 'fine glow', (8, 8)),
    'house_window': (house_window(False, 10422), (56, 14), 'fine hung'),
    'house_window_lit': (house_window(True, 10423), (56, 14), 'fine glow hung'),
    'house_door': (p_house_door, (48, 16), 'fine glow hung'),
    'yard_fence': (yard_fence(0), (128, 12), 'fine', (128, 4)),
    'yard_fence_gate': (yard_fence(1), (128, 12), 'fine', (128, 4)),
    'carport': (p_carport, (192, 104), 'fine stock hung'),
    'tv_antenna': (p_tv_antenna, (56, 30), 'fine stock hung'),
    'lawn_flamingos': (p_lawn_flamingos, (30, 20), 'fine', (28, 18)),
    'oleander_pink': (oleander('#f07aa8', 10711), (56, 48), 'fine', (48, 40)),
    'oleander_white': (oleander('#f4ecdc', 10712), (56, 48), 'fine', (48, 40)),
    'cart_loaded': (p_cart_loaded, (24, 16), 'fine', (22, 14)),
    'bedroll': (p_bedroll, (28, 12), 'fine', (26, 10)),
    'bags_pile': (p_bags_pile, (46, 24), 'fine', (44, 22)),
    'doorway_camp': (p_doorway_camp, (72, 48), 'fine', (68, 40)),
    'market_stall': (market_stall('fruit'), (80, 48), 'fine glow', (78, 44)),
    'market_stall_coco': (market_stall('coco'), (80, 48), 'fine glow', (78, 44)),
    'fruit_crate_orange': (fruit_crate('orange'), (20, 14), 'fine', (18, 12)),
    'fruit_crate_mango': (fruit_crate('mango'), (20, 14), 'fine', (18, 12)),
    'fruit_crate_coconut': (fruit_crate('coconut'), (20, 14), 'fine', (18, 12)),
    'market_sign': (p_market_sign, (44, 18), 'fine', (42, 14)),
    'carwash_sign': (p_carwash_sign, (72, 20), 'fine stock', (70, 6)),
    'carwash_board': (p_carwash_board, (24, 18), 'fine stock', (22, 14)),
    'wash_bucket': (p_wash_bucket, (14, 14), 'fine stock', (12, 12)),
    'hose_reel': (p_hose_reel, (28, 18), 'fine stock', (26, 16)),
    'tyre_stack': (p_tyre_stack, (24, 24), 'fine stock', (22, 22)),
    'tyre_pile': (p_tyre_pile, (56, 40), 'fine stock', (52, 36)),
    'tyre_loose': (p_tyre_loose, (22, 22), 'fine stock', (20, 20)),
    'tyre_rack': (p_tyre_rack, (64, 20), 'fine stock', (62, 18)),
    'tyre_sign': (p_tyre_sign, (48, 18), 'fine stock', (46, 14)),
    **{'garden_wall_' + c: (garden_wall(c), (96, 14), 'fine', (96, 10)) for c in ('pink', 'mint', 'cream')},
}
