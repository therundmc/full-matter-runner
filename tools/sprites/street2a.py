"""Level 2A, the back road (docs/LEVEL2.md): the box lorry that backs out across the street, a canvas awning
(the base of the shops' awnings), a neon sign; the chase's street things to hit, and the pieces a car loses."""
import math
import random

from .core import alpha, Cv, dk, fill_shape, frect, hx, light, lt, mix, px_paint, ramp, ring, shade, smudge, wood_fill
from .palette import (
    AMBER, CHROME, GLASS, HEAD_C, HEAD_GLOW, NEON_AMBER, NEON_CYAN, NEON_PINK, RUBBER, STEEL_L, TAIL_C, TAIL_GLOW
)
from .type import neon_text
from .neon import Neon, sign_backing
from .vehicles import darken, ridge, Veh


LORRY_BOX = ramp('#d2cbb8', 0.5, 0.26, 0.3)
LORRY_CAB = ramp('#c8902c', 0.55, 0.3, 0.36)


def p_lorry():
    """A box lorry from above, 8.75 x 2.5 m, facing +x: the aluminium box body (roof ribs, its rails, a patch riveted
    on, the roll door's header at the tail), the chassis showing between it and the cab, the mustard cab (a short
    hood, the windshield, a sun visor, big mirrors, marker lamps), tail lamps and the white reversing lamps at the
    back corners (lit in the glow map: it is backing)."""
    k = Veh(280, 80, 40, 8801)
    box, cab = LORRY_BOX, LORRY_CAB
    k.shell(RUBBER, 200, 222, 27.0, 1, 1, crown=8.0)        # the chassis and the tank between cab and box
    k.shell(cab, 214, 278, 35.5, 5, 9, crown=2.6)           # the cab
    k.shell(box, 1, 208, 38.5, 3, 3, crown=9.0)             # the box body
    k.arches((240,), r=13)
    for x in range(14, 204, 16):                             # roof ribs
        k.line(x, 3, x, 39, lambda c, s: lt(c, 0.1), w=2)
        k.line(x + 1, 3, x + 1, 39, darken(0.12))
    k.line(3, 2, 206, 2, lambda c, s: lt(c, 0.22))           # the roof's side rails
    k.line(3, 3, 206, 3, darken(0.16))
    for x in (2, 3, 4):                                      # the roll door's header
        k.line(x, 3, x, 39, darken(0.3 if x == 4 else 0.18))
    k.line(205, 3, 205, 39, darken(0.25))                    # the front bulkhead's cap
    for y in range(8, 34):                                   # a patch riveted on the roof, off the centre (one side)
        for x in range(118, 150):
            edge = y in (8, 33) or x in (118, 149)
            k.put(x, y, (lambda c, s: dk(c, 0.2)) if edge else (lambda c, s: lt(c, 0.07)), both=False)
    for (x, y) in ((120, 10), (147, 10), (120, 31), (147, 31), (133, 10), (133, 31)):
        k.dot(x, y, CHROME[2], both=False)
    for y in range(54, 67):                                  # a translucent roof light, the other side
        for x in range(60, 96):
            k.put(x, y, (lambda c, s, x=x, y=y: mix(c, hx('#9aa6a8'), 0.5 if (x + y) % 9 else 0.3)), both=False)
    k.panel(cab, 222, 250, 30.5, r=3, crown=4.0, lift=0.04)  # the cab's roof
    k.line(250, 6, 250, 39, darken(0.35))                    # the sun visor over the screen
    k.line(251, 6, 251, 39, lambda c, s: lt(c, 0.12))
    k.trap(252, 262, 30.5, 32.5, sheen=3)                    # windshield
    for y in (15.0, 51.0):                                   # through it: two seats, the wheel, the dash, a thermos
        k.inside(252.0, y, 255.5, y + 14.0, hx('#5a4a3a'), 0.3)
    k.wheel(258.0, 24.0, 4.6)
    k.inside(259.5, 9.0, 263.0, 71.0, hx('#3e3a34'), 0.42)
    k.inside(260.0, 46.0, 262.0, 49.0, hx('#b8c0c8'), 0.5)
    k.film(252, 262, ((263.0, 38.0), (263.0, 62.0)), 20.0, 0.13)
    k.side(228, 251, lambda x: 30.5, 33.0)
    for x in (226, 252):                                     # cab doors
        k.line(x, 5, x, 9, darken(0.45))
    k.line(238, 6, 241, 6, CHROME[2], w=2)
    k.line(264, 7, 264, 39, darken(0.4))                     # the short hood
    k.line(266, 22, 275, 22, ridge(0.1))
    for y in (12, 13, 26):                                   # marker lamps on the roof's front edge
        k.put(246, y, AMBER)
    for x in (211, 212):                                     # the exhaust stack behind the cab (one side)
        for y in (15, 16, 17):
            k.put(x, y, CHROME[1] if x == 211 else CHROME[3], both=False)
    k.grime((54, 68, 240), amount=1.5, rust=16, scratches=7)
    k.seal()
    k.gloss(264, 277, 0.08)
    k.rim()
    k.bumper(276, 278, CHROME)
    k.bumper(1, 2, RUBBER)
    for y in range(28, 40):                                  # grille
        for x in range(273, 276):
            k.put(x, y, CHROME[1] if y == 28 or x == 273 else RUBBER[0])
    k.lamp(273, 275, 9, 15, HEAD_C, HEAD_GLOW, CHROME[2])
    k.lamp(273, 275, 17, 21, HEAD_C, HEAD_GLOW, CHROME[2])
    k.lamp(2, 4, 4, 10, TAIL_C, TAIL_GLOW, hx('#7a0818'), back=4)     # tail lamps on the corner posts
    k.lamp(2, 4, 12, 16, HEAD_C, HEAD_GLOW, CHROME[1], back=4)        # the reversing lamps, lit
    k.line(3, 18, 4, 18, AMBER, w=2)
    return k.done()


AWNING_A, AWNING_B = ramp('#e0842c', 0.5, 0.26, 0.3), ramp('#eadfc6', 0.45, 0.24, 0.25)


def p_awning(stripe_a=AWNING_A, stripe_b=AWNING_B):
    """A cafe's canvas awning from above, hung on the facade (the wall at -y), reaching 1.1 m out over the terrace:
    broad orange and bone stripes (the two ramps) running out from the wall, the cloth sagging a little between its
    three arms (their shadow lines), a scalloped valance along the front, the roller's steel box against the wall."""
    W, H = 98, 38
    cv = Cv(W, H)
    frect(cv, 1, 1, W - 1, 4.5, shade(STEEL_L, 0.55))                      # the roller's box
    frect(cv, 1, 1, W - 1, 1.5, shade(STEEL_L, 0.9))
    frect(cv, 1, 4.0, W - 1, 4.5, shade(STEEL_L, 0.2))

    def cloth(x, y, cur):
        if y > 32.5 and (y - 32.5) > 3.6 * abs(math.sin((x - 1.0) * math.pi / 8.0)) + 0.6:
            return None                                                    # the valance: scallops
        r = stripe_a if int((x - 1.0) // 8) % 2 == 0 else stripe_b
        arm = min(abs(x - a) for a in (4.0, 49.0, 94.0))
        sag = 0.5 + 0.22 * math.cos(arm / 45.0 * math.pi) - (y - 4.5) / 28.0 * 0.22
        if y > 32.5:
            sag -= 0.16
        return shade(r, max(0.05, min(0.95, sag)))
    px_paint(cv, 1, 4.5, W - 1, 37, cloth)
    for a in (4.0, 49.0, 94.0):                                            # the arms seen through the cloth
        px_paint(cv, a - 0.5, 5, a + 0.5, 32, lambda x, y, cur: dk(cur, 0.2))
    frect(cv, 1, 32.0, W - 1, 32.5, lambda c: dk(c, 0.3))                  # the front bar's seam
    rng = random.Random(8811)
    smudge(cv, rng, 9, (2, 6, W - 2, 32), (1.5, 4.0), 0.14, hx('#4a4038'))  # soot and rain marks
    smudge(cv, rng, 3, (2, 6, W - 2, 32), (0.8, 1.6), 0.4, hx('#e8e6dc'))   # pigeons
    cv.outline()
    return cv


def p_neon_sign_diner():
    """DINER in warm tubes, a cup steaming beside it."""
    cv, gl = sign_backing(46, 14), Cv(46, 14)
    ne = Neon(46, 14)
    ne.line([(3, 7), (3, 10), (4, 11), (7, 11), (8, 10), (8, 7), (3, 7)], NEON_CYAN)    # a cup
    ne.line([(9, 8), (10, 9), (9, 10)], NEON_CYAN)
    ne.line([(5, 5), (4, 4), (5, 3), (4, 2)], NEON_PINK)                                # its steam
    neon_text(ne, 14, 3, 'DINER', NEON_AMBER)
    ne.render(cv, gl)
    return cv, gl


# ---- the chase's street: more to hit (traffic cones, a road barrier, boxes, bundles of papers, a fruit stand, a
# shopping cart, a post box), shop awnings in other colours, and the pieces a car loses (bumpers, a mirror, a hubcap,
# a headlight, its plate, its grille)
def awning_of(a, b, seed):
    """A shop's awning: the cafe's (p_awning) in other cloth, `a` / `b` the two stripes' ramps."""
    def make():
        cv = p_awning(a, b)
        smudge(cv, random.Random(seed), 4, (2, 6, 96, 32), (1.5, 3.5), 0.1, hx('#3a3430'))
        return cv
    return make


def p_traffic_cone():
    """A traffic cone from above, 70 cm: its square black rubber foot with rounded corners, the orange cone rising
    to a dark open tip, two white reflective bands round it, scuffs."""
    S = 12
    c = S / 2
    cv = Cv(S, S)
    fill_shape(cv, c, c, 5.4, 5.4, lambda u, v, L: shade(RUBBER, 0.3 + L * 0.5), kind='rect', bevel=1.0, corner=1.6)
    orange = ramp('#ff6a1a', 0.5, 0.26, 0.28)

    def cone(dx, dy, d):
        L = light(dx / 4.2, dy / 4.2)
        col = shade(orange, 0.25 + L * 0.7)
        if 1.7 <= d < 2.3 or 3.1 <= d < 3.6:
            col = mix(hx('#f4f2ea'), col, 0.25 if L > 0.4 else 0.45)       # the reflective bands
        return col
    ring(cv, c, c, 0.0, 4.2, cone)
    fill_shape(cv, c, c, 0.8, 0.8, lambda u, v, L: hx('#2a120a'))           # the open tip
    smudge(cv, random.Random(9101), 3, (1, 1, 11, 11), (0.6, 1.4), 0.25)
    cv.outline()
    return cv


def p_sawhorse():
    """A road works barrier from above, 1.25 m: a plank painted in red and white diagonal stripes on two splayed
    steel trestles (their feet stick out each side), a flashing lamp clamped to one end, chipped."""
    W, H = 40, 12
    cv = Cv(W, H)
    for x in (5.0, W - 5.0):                                                # the trestles' feet
        frect(cv, x - 1.0, 1, x + 1.0, H - 1, shade(STEEL_L, 0.3))
        frect(cv, x - 1.0, 1, x + 1.0, 1.5, shade(STEEL_L, 0.7))
    red, white = ramp('#d0242c', 0.5, 0.26, 0.3), ramp('#ece8de', 0.4, 0.2, 0.2)

    def plank(x, y, cur):
        r = red if int((x + y) // 4) % 2 == 0 else white
        return shade(r, 0.82 if y < 4.5 else 0.3 if y >= 7.5 else 0.6)
    px_paint(cv, 1, 3.5, W - 1, 8.5, plank)
    fill_shape(cv, 7.5, 6.0, 1.8, 1.8, lambda u, v, L: shade(ramp('#ffb21a', 0.5, 0.25, 0.4), 0.3 + L * 0.7))   # the lamp
    cv.dot(7.0, 5.5, hx('#fff3c0'))
    smudge(cv, random.Random(9111), 5, (2, 4, W - 2, 8), (0.6, 1.5), 0.45, hx('#8a8a92'))   # chipped to the wood
    cv.outline()
    return cv


def p_cardboard_box():
    """A cardboard box from above, 50 cm: its four flaps folded shut, a strip of brown tape down the middle, a
    printed arrow, crushed at a corner, a damp stain."""
    W, H = 16, 14
    cv = Cv(W, H)
    card = ramp('#b88a52', 0.45, 0.22, 0.25)
    fill_shape(cv, W / 2, H / 2, W / 2 - 1, H / 2 - 1, lambda u, v, L: shade(card, 0.35 + L * 0.45), kind='rect', bevel=1.2, corner=0.5)
    frect(cv, 1.5, H / 2 - 0.25, W - 1.5, H / 2 + 0.25, dk(card[2], 0.3))      # where the flaps meet
    frect(cv, W / 2 - 0.25, 1.5, W / 2 + 0.25, H - 1.5, dk(card[2], 0.2))
    frect(cv, W / 2 - 1.5, 1, W / 2 + 1.5, H - 1, lambda c: mix(c, hx('#8a5a2a'), 0.6))   # the tape
    frect(cv, W / 2 - 1.5, 1, W / 2 - 1.0, H - 1, lambda c: lt(c, 0.15))
    for (dx, dy) in ((0, 0), (-1, 1), (1, 1), (0, 1), (0, 2)):                # a printed arrow
        cv.blend(3.5 + dx * 0.5, 3.0 + dy * 0.5, alpha(hx('#3a2414'), 150))
    px_paint(cv, W - 4, H - 4, W - 1, H - 1, lambda x, y, cur: dk(cur, 0.25) if x + y > W + H - 6 else None)   # crushed
    smudge(cv, random.Random(9121), 2, (3, 3, W - 3, H - 3), (1.5, 2.5), 0.18)
    cv.outline()
    return cv


def p_paper_bundle():
    """A bundle of tomorrow's papers from above, dropped for the news stand: folded sheets stacked a little askew,
    the front page's headline and photo, tied with a cross of white plastic strap."""
    W, H = 14, 10
    cv = Cv(W, H)
    fill_shape(cv, W / 2 + 0.4, H / 2 + 0.4, W / 2 - 1.2, H / 2 - 1.2, lambda u, v, L: hx('#b8b2a2'), kind='rect', corner=0.3, ang=0.06)
    paper = ramp('#e8e4d6', 0.35, 0.16, 0.1)
    fill_shape(cv, W / 2, H / 2, W / 2 - 1.4, H / 2 - 1.4, lambda u, v, L: shade(paper, 0.5 + L * 0.4), kind='rect', bevel=0.8, corner=0.3)
    frect(cv, 3, 2.5, W - 3, 3.2, hx('#2a2a30'))                              # the headline
    frect(cv, 3, 4.0, 6.5, 7.0, lambda c: hx('#9a9aa0'))                     # the photo
    for y in (4.2, 5.2, 6.2):
        frect(cv, 7.2, y, W - 3, y + 0.5, hx('#a8a8b0'))                      # the columns
    frect(cv, 1, H / 2 - 0.3, W - 1, H / 2 + 0.3, hx('#f6f6fa'))              # the strap
    frect(cv, W / 2 - 0.3, 1, W / 2 + 0.3, H - 1, hx('#f6f6fa'))
    cv.outline()
    return cv


def p_fruit_stand():
    """A grocer's fruit stand put out on the sidewalk from above, 1.1 m: a slatted wooden rack holding three crates
    (oranges, red apples, green limes), heaped, a price card stuck in each, a strip of fake grass along the front."""
    W, H = 36, 18
    cv = Cv(W, H)
    w = ramp('#8a5a32', 0.45, 0.22, 0.3)
    wood_fill(cv, 1, 1, W - 2, H - 2, w[2], plank=3, rng=random.Random(9131))
    fruit = ((ramp('#ff8a1a', 0.5, 0.25, 0.3), 2.0), (ramp('#c8202c', 0.5, 0.26, 0.3), 1.9), (ramp('#6aa82a', 0.5, 0.25, 0.3), 1.6))
    rng = random.Random(9132)
    for k, (r, rad) in enumerate(fruit):
        x0 = 2.0 + k * 11.0
        frect(cv, x0, 2, x0 + 10, H - 4, shade(w, 0.25))                     # the crate's inside
        for _ in range(14):
            fx, fy = rng.uniform(x0 + rad, x0 + 10 - rad), rng.uniform(2 + rad, H - 4 - rad)
            fill_shape(cv, fx, fy, rad, rad, lambda u, v, L, r=r: shade(r, 0.2 + L * 0.75))
        frect(cv, x0 + 6.5, 2.5, x0 + 9.5, 4.5, hx('#f4f0e2'))               # the price card
        frect(cv, x0 + 7.0, 3.2, x0 + 9.0, 3.7, hx('#2a2a30'))
    frect(cv, 1, H - 3.5, W - 1, H - 1, lambda c: hx('#3a8a3a'))              # the fake grass
    for x in range(2, W - 1, 2):
        cv.dot(x, H - 3.0, hx('#5aaa4a'))
    cv.outline()
    return cv


def p_shopping_cart():
    """A shopping cart from above, left out on the sidewalk: its wire basket (a grid of thin bars, the floor seen
    through), the child seat folded at the back, the red handle, the four castors poking out."""
    W, H = 22, 14
    cv = Cv(W, H)
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
    frect(cv, 1, 2, 2, H - 2, hx('#c8202c'))                                  # the handle
    frect(cv, 1, 2, 2, 2.5, lt(hx('#c8202c'), 0.3))
    frect(cv, 4, 2, 7, H - 2, lambda c: dk(c, 0.15) if c[3] else c)          # the child seat folded
    cv.outline()
    return cv


def p_mailbox():
    """A street post box from above, 45 cm square: green enamel, its domed top lit on one side, the letter slot's
    lip along the front (+y), a plate with the collection times, scratches."""
    S = 14
    cv = Cv(S, S)
    green = ramp('#2a6a4a', 0.5, 0.25, 0.3)
    fill_shape(cv, S / 2, S / 2, S / 2 - 1, S / 2 - 1, lambda u, v, L: shade(green, 0.15 + L * 0.8), kind='super', p=4.0)
    frect(cv, 3.5, S - 3.6, S - 3.5, S - 2.6, hx('#10201a'))                 # the slot
    frect(cv, 3.5, S - 3.6, S - 3.5, S - 3.3, lt(green[2], 0.3))
    frect(cv, 4.5, 4.5, S - 4.5, 6.5, hx('#e8e4d6'))                          # the times
    frect(cv, 5.0, 5.2, S - 5.0, 5.6, hx('#5a5a60'))
    smudge(cv, random.Random(9141), 4, (2, 2, S - 2, S - 2), (0.5, 1.2), 0.5, hx('#9aa0a8'))
    cv.outline()
    return cv


def p_car_bumper(chrome=True):
    """A bumper torn off, from above: a long bar (chrome, or black plastic on the newer cars) bent where it hit,
    its end ripped, the rubber strip along it."""
    def make():
        W, H = 40, 6
        cv = Cv(W, H)
        r = CHROME if chrome else RUBBER

        def bar(x, y, cur):
            bend = 0.7 * math.sin(x / W * math.pi * 1.3)
            yy = y - bend
            if yy < 1.0 or yy >= 5.0 or (x > W - 4 and yy > 3.5 - (x - W + 4)):
                return None
            col = shade(r, 0.92 if yy < 1.8 else 0.55 if yy < 3.4 else 0.3)
            if 3.0 <= yy < 3.6:
                col = RUBBER[1]                                               # the rubber strip
            return col
        px_paint(cv, 1, 0, W - 1, H, bar)
        smudge(cv, random.Random(9151 + chrome), 3, (2, 1, W - 4, 5), (0.8, 2.0), 0.3)
        cv.outline()
        return cv
    return make


def p_car_mirror():
    """A wing mirror snapped off: its housing (black), the cracked glass in it, the stalk's torn end."""
    W, H = 8, 6
    cv = Cv(W, H)
    fill_shape(cv, 4.6, 3.0, 3.0, 2.0, lambda u, v, L: shade(RUBBER, 0.3 + L * 0.6), kind='super', p=3.0)
    fill_shape(cv, 4.6, 3.0, 2.0, 1.2, lambda u, v, L: shade(GLASS, 0.5 + L * 0.5), kind='super', p=3.0)
    cv.dot(4.0, 2.5, hx('#dfe8ff'))
    frect(cv, 1, 2.5, 2, 3.5, shade(CHROME, 0.5))
    cv.outline()
    return cv


def p_car_hubcap():
    """A hubcap rolled away: a chrome dish, its spokes pressed in, the rim dented."""
    S = 10
    c = S / 2
    cv = Cv(S, S)

    def dish(dx, dy, d):
        a = math.atan2(dy, dx)
        L = light(dx / 4.0, dy / 4.0)
        spoke = abs(math.sin(a * 3)) < 0.25 and 1.2 < d < 3.4
        return shade(CHROME, (0.25 if spoke else 0.45) + L * 0.55) if d < 3.6 else shade(CHROME, 0.3 + L * 0.6)
    ring(cv, c, c, 0.0, 4.2, dish)
    fill_shape(cv, c, c, 0.9, 0.9, lambda u, v, L: shade(CHROME, 0.4 + L * 0.6))
    cv.outline()
    return cv


def p_car_headlight():
    """A headlight knocked out: its chrome bezel, the reflector inside, the lens cracked open, a wire trailing."""
    W, H = 8, 6
    cv = Cv(W, H)
    fill_shape(cv, 4.0, 3.0, 3.0, 2.2, lambda u, v, L: shade(CHROME, 0.3 + L * 0.6))
    fill_shape(cv, 4.0, 3.0, 2.0, 1.4, lambda u, v, L: mix(hx('#f4f0d8'), shade(CHROME, L), 0.4))
    for (x, y) in ((3.0, 2.5), (4.0, 3.0), (5.0, 3.5)):
        cv.dot(x, y, hx('#5a5a66'))                                           # the crack
    frect(cv, 7, 3, 8, 3.5, hx('#c8202c'))                                    # the wire
    cv.outline()
    return cv


def p_car_plate():
    """A number plate off a bumper: pale yellow, a dark rim, its characters pressed in (no real plate), bent at a
    corner."""
    W, H = 12, 5
    cv = Cv(W, H)
    frect(cv, 1, 1, W - 1, H - 1, hx('#e8d878'))
    frect(cv, 1, 1, W - 1, 1.5, hx('#f6ecb0'))
    for x in (2.5, 4.0, 5.5, 7.5, 9.0):
        frect(cv, x, 2.0, x + 1.0, 3.5, hx('#2a2a40'))
    px_paint(cv, W - 3, 1, W - 1, H - 1, lambda x, y, cur: dk(cur, 0.3) if x + y > W + 1 else None)
    cv.outline()
    return cv


def p_car_grille():
    """A piece of a radiator grille: a chrome frame round black slats, two of them bent out."""
    W, H = 16, 6
    cv = Cv(W, H)
    frect(cv, 1, 1, W - 1, H - 1, shade(CHROME, 0.7))
    for x in range(2, W - 2, 2):
        frect(cv, x + 0.5, 2, x + 1.5, H - 2, RUBBER[1])
    frect(cv, 1, 1, W - 1, 1.5, shade(CHROME, 0.95))
    px_paint(cv, 9, 2, 12, H - 2, lambda x, y, cur: shade(CHROME, 0.4))     # bent out
    cv.outline()
    return cv


GROUP = 'props'
SPRITES = {
    'lorry': (p_lorry, (280, 80), 'fine glow', (276, 76)),
    'awning': (p_awning, (98, 38), 'fine hung'),
    'neon_sign_diner': (p_neon_sign_diner, (46, 14), 'glow hung'),
    'awning_red': (awning_of(ramp('#b82030', 0.5, 0.26, 0.3), ramp('#eadfc6', 0.45, 0.24, 0.25), 8851), (98, 38), 'fine hung'),
    'awning_green': (awning_of(ramp('#2a7a4a', 0.5, 0.26, 0.3), ramp('#eadfc6', 0.45, 0.24, 0.25), 8852), (98, 38), 'fine hung'),
    'awning_blue': (awning_of(ramp('#2a4a9a', 0.5, 0.26, 0.3), ramp('#d8dce6', 0.45, 0.24, 0.25), 8853), (98, 38), 'fine hung'),
    'awning_wine': (awning_of(ramp('#6a1a3a', 0.5, 0.26, 0.3), ramp('#6a1a3a', 0.62, 0.36, 0.2), 8854), (98, 38), 'fine stock hung'),
    'traffic_cone': (p_traffic_cone, (12, 12), 'fine', (10, 10)),
    'sawhorse': (p_sawhorse, (40, 12), 'fine stock', (38, 8)),
    'cardboard_box': (p_cardboard_box, (16, 14), 'fine', (15, 13)),
    'paper_bundle': (p_paper_bundle, (14, 10), 'fine', (13, 9)),
    'fruit_stand': (p_fruit_stand, (36, 18), 'fine', (34, 16)),
    'shopping_cart': (p_shopping_cart, (22, 14), 'fine', (20, 12)),
    'mailbox': (p_mailbox, (14, 14), 'fine', (13, 13)),
    'car_bumper': (p_car_bumper(True), (40, 6), 'fine'),
    'car_bumper_black': (p_car_bumper(False), (40, 6), 'fine'),
    'car_mirror': (p_car_mirror, (8, 6), 'fine'),
    'car_hubcap': (p_car_hubcap, (10, 10), 'fine'),
    'car_headlight': (p_car_headlight, (8, 6), 'fine'),
    'car_plate': (p_car_plate, (12, 5), 'fine'),
    'car_grille': (p_car_grille, (16, 6), 'fine'),
    'awning_pink': (awning_of(ramp('#f08ab0', 0.5, 0.26, 0.3), ramp('#f4f0e6', 0.45, 0.24, 0.25), 10181), (98, 38), 'fine stock hung'),
    'awning_mint': (awning_of(ramp('#7ad0b0', 0.5, 0.26, 0.3), ramp('#f4f0e6', 0.45, 0.24, 0.25), 10182), (98, 38), 'fine stock hung'),
    'awning_peach': (awning_of(ramp('#f4a878', 0.5, 0.26, 0.3), ramp('#f4f0e6', 0.45, 0.24, 0.25), 10183), (98, 38), 'fine hung'),
    'awning_lavender': (awning_of(ramp('#b49ae0', 0.5, 0.26, 0.3), ramp('#f4f0e6', 0.45, 0.24, 0.25), 10184), (98, 38), 'fine hung'),
}
