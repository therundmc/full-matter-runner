"""Structure: the doors (the old plain leaves at the world's density; the skins, one kind of door per place,
src/game/data/doors.js DOORS.kinds, at FINE density), their jambs and thresholds, the windows, the fence."""
import random

from .core import CLEAR, Cv, hx, mix, OUTLINE, ramp, tint
from .palette import ALU, BRASS, CHROME, STEEL, STEEL_L


DOOR_WOOD = ramp('#a86a38', 0.5, 0.24, 0.34)
SILL = ramp('#625e72', 0.5, 0.24, 0.3)


def _leaf(w):
    """Door leaf seen from above, hinge at x = 0, latch at x = 31. Rows 1..7 = the leaf, rows 0 and 8 = what sticks
    out of its faces (handle). Door.js keeps both ends and tiles the middle (x 8..19) to the leaf length."""
    cv = Cv(32, 9)
    for x in range(1, 31):
        cv.set(x, 2, w[3])
        for y in (3, 4, 5):
            cv.set(x, y, w[2])
        cv.set(x, 6, w[1])
    # long quiet grain, no pattern
    for x, y, n in ((9, 3, 5), (17, 5, 6), (3, 4, 3), (24, 4, 3)):
        for k in range(n):
            cv.set(x + k, y, mix(w[2], w[1], 0.55))
    # stiles at both ends (end grain)
    for x in (1, 30):
        for y in range(2, 7):
            cv.set(x, y, mix(cv.get(x, y), w[0], 0.45))
    cv.outline()
    # hinge: two steel knuckles on the faces, the pin between them
    for x in (2, 3, 4):
        cv.set(x, 1, STEEL_L[3] if x == 3 else STEEL_L[2])
        cv.set(x, 7, STEEL_L[1])
    cv.rect(2, 3, 3, 5, STEEL[0])
    cv.set(2, 3, STEEL_L[3])
    cv.set(3, 3, STEEL_L[2])
    cv.set(2, 4, STEEL_L[2])
    # latch plate on the edge
    cv.rect(30, 3, 30, 5, STEEL_L[2])
    return cv


def s_door():
    cv = _leaf(DOOR_WOOD)
    # lever handle on each face: the rose on the leaf, the brass lever proud of it
    for y, c0, c1 in ((0, BRASS[3], BRASS[2]), (8, BRASS[2], BRASS[1])):
        cv.rect(22, y, 26, y, c1)
        cv.rect(25, y, 26, y, c0)
        cv.set(21, y, OUTLINE)
        cv.set(27, y, OUTLINE)
    cv.set(26, 1, BRASS[2])
    cv.set(26, 7, BRASS[1])
    return cv


def s_stall_door():
    """A restroom stall's door from above, hinge at x = 0: a thinner laminate leaf in the partitions' sea-green, the
    chrome slide latch and its red / green tell-tale at the free end, a coat hook on the inside face."""
    cv = _leaf(ramp('#6f8f86', 0.45, 0.24, 0.32))
    for x in (26, 27, 28):                                              # the slide latch, both faces
        cv.set(x, 1, CHROME[3] if x == 27 else CHROME[2])
        cv.set(x, 7, CHROME[2] if x == 27 else CHROME[1])
    cv.set(29, 1, hx('#3aa05a'))                                        # vacant
    cv.set(14, 7, CHROME[3])                                            # the coat hook
    cv.set(14, 8, CHROME[1])
    return cv


def s_door_locked():
    """Reinforced door: the same leaf under steel straps, a lock case through it and a dead bolt in the edge."""
    cv = _leaf(ramp('#8a5a36', 0.5, 0.24, 0.3))
    for x0 in (8, 15):
        for y in range(1, 8):
            cv.set(x0, y, STEEL_L[3] if y < 3 else STEEL_L[2] if y < 6 else STEEL_L[1])
            cv.set(x0 + 1, y, STEEL_L[2] if y < 3 else STEEL_L[1] if y < 6 else STEEL_L[0])
        cv.set(x0, 4, STEEL[0])        # rivet
    # lock case, proud of both faces
    cv.rect(21, 0, 28, 8, OUTLINE)
    cv.rect(22, 1, 27, 7, STEEL_L[1])
    cv.rect(22, 1, 27, 2, STEEL_L[3])
    cv.rect(22, 3, 27, 5, STEEL_L[2])
    cv.rect(24, 3, 25, 5, BRASS[2])    # cylinder
    cv.set(24, 3, BRASS[3])
    cv.set(25, 5, BRASS[0])
    cv.set(24, 4, OUTLINE)             # keyhole
    cv.rect(29, 3, 31, 5, STEEL_L[3])  # dead bolt
    cv.rect(29, 5, 31, 5, STEEL_L[1])
    return cv


# ---- door skins: one kind of door per place (src/game/data/doors.js DOORS.kinds), painted at FINE density. A leaf
# seen from above is a long thin plank: what tells the kinds apart is its colour, its edges and what stands proud of
# its faces (rows 0-1 and 7-8: a push bar, plates, a chain), a glass strip where it has glass. Hinge at x = 0, the
# latch end at the far end; Door.js keeps both ends and tiles the middle to the leaf's length (its kind's `caps`).

def _plank(w, n=32, grain=()):
    """The leaf's body in the ramp w, rows 2..6 (lit top edge, dark bottom), end stiles; grain: (x, y, len) streaks."""
    cv = Cv(n, 9)
    for x in range(1, n - 1):
        cv.set(x, 2, w[3])
        for y in (3, 4, 5):
            cv.set(x, y, w[2])
        cv.set(x, 6, w[1])
    for x, y, k in grain:
        for i in range(k):
            cv.dot(x + i * 0.5, y + 0.25, mix(w[2], w[1], 0.5))
    for x in (1, n - 2):
        for y in range(2, 7):
            cv.set(x, y, mix(cv.get(x, y), w[0], 0.45))
    return cv


def _knuckles(cv, steel=STEEL_L):
    """Two hinge knuckles proud of the faces, the pin in the leaf's end."""
    for x in (2, 3, 4):
        cv.set(x, 1, steel[3] if x == 3 else steel[2])
        cv.set(x, 7, steel[1])
    cv.rect(2, 3, 3, 5, STEEL[0])
    cv.set(2, 3, steel[3])
    cv.set(3, 3, steel[2])


def _lever(cv, x, col=BRASS):
    """A lever handle on each face near the latch: the rose, the lever proud of it."""
    for y, c0, c1 in ((0, col[3], col[2]), (8, col[2], col[1])):
        cv.rect(x, y, x + 4, y, c1)
        cv.rect(x + 3, y, x + 4, y, c0)
        cv.set(x - 1, y, OUTLINE)
        cv.set(x + 5, y, OUTLINE)
    cv.set(x + 4, 1, col[2])
    cv.set(x + 4, 7, col[1])


def _latch_plate(cv, n=32):
    cv.rect(n - 2, 3, n - 2, 5, STEEL_L[2])


def _glass(cv, x0, x1, y0=3, y1=5, tint='#a8d0e4', wire=None):
    """A glass strip through the leaf: pale, a glint; wire: the mesh of wired glass."""
    g = ramp(tint, 0.35, 0.18, 0.3)
    for x in range(x0, x1 + 1):
        for y in range(y0, y1 + 1):
            cv.set(x, y, g[2] if y > y0 else g[3])
    cv.dot(x0 + 0.5, y0 + 0.5, hx('#f4fbff'))
    cv.dot(x0 + 1.0, y0 + 0.5, hx('#f4fbff'))
    if wire:
        s = cv.s
        for j in range(y0 * s, (y1 + 1) * s):
            for i in range(x0 * s, (x1 + 1) * s):
                if (i + j) % 4 == 0 or (i - j) % 4 == 0:
                    cv.p[i, j] = hx(wire)


def _shatter(cv, x0, x1, y0=3, y1=5, keep_wire=None):
    """The glass gone out of its strip: a few shards left at the edges (the wire of wired glass holds)."""
    s = cv.s
    rng = random.Random(x0 * 31 + x1)
    for j in range(y0 * s, (y1 + 1) * s):
        for i in range(x0 * s, (x1 + 1) * s):
            if keep_wire and cv.p[i, j] == hx(keep_wire):
                continue
            edge = min(i - x0 * s, (x1 + 1) * s - 1 - i)
            cv.p[i, j] = hx('#d8ecf6') if edge == 0 and rng.random() < 0.45 else CLEAR
    return cv


def s_door_fire():
    """The emergency exit: a heavy grey steel leaf, a red push bar across its inside face on two housings, a brushed
    kick plate on the other, scuffs."""
    w = ramp('#7c828e', 0.5, 0.25, 0.36)
    cv = _plank(w, 32, ((6, 3, 10), (19, 5, 12)))
    for x, y in ((7, 4), (8.5, 5), (13, 3), (21, 4), (25.5, 5), (11, 5)):
        cv.dot(x, y + 0.25, w[0])                                   # scuffs
    cv.outline()
    _knuckles(cv)
    red = ramp('#d0262c', 0.45, 0.22, 0.32)
    for x in range(8, 27):                                          # the push bar, proud of the face on its housings
        cv.set(x, 8, red[2])
        cv.dot(x, 8.0, red[3])
    for x in (6, 7, 27, 28):
        cv.set(x, 7, STEEL[1])
        cv.set(x, 8, STEEL[0] if x in (6, 28) else STEEL[2])
    cv.set(5, 8, OUTLINE)
    cv.set(29, 8, OUTLINE)
    for x in range(4, 28):                                          # the kick plate on the other face
        cv.dot(x, 1.5, STEEL_L[3] if x % 3 else STEEL_L[2])
    _latch_plate(cv)
    return cv


def _door_bar():
    """The bar's front: dark varnished wood, a round porthole of glass in a brass ring, a brass push plate on the
    street face and a pull bar on the other."""
    w = ramp('#5c3424', 0.5, 0.24, 0.38)
    cv = _plank(w, 32, ((3, 3, 6), (17, 5, 10), (20, 3, 6)))
    cv.rect(9, 2, 14, 6, BRASS[1])                                  # the porthole's ring
    cv.rect(9, 2, 14, 2, BRASS[3])
    _glass(cv, 10, 13)
    cv.outline()
    _knuckles(cv)
    cv.rect(20, 1, 25, 1, BRASS[2])                                 # the push plate, flat on the face
    cv.rect(20, 1, 21, 1, BRASS[3])
    for x in range(20, 26):                                         # the pull bar on its standoffs
        cv.set(x, 8, BRASS[2] if x % 2 else BRASS[3])
    cv.set(20, 7, BRASS[1])
    cv.set(25, 7, BRASS[1])
    cv.set(19, 8, OUTLINE)
    cv.set(26, 8, OUTLINE)
    cv.rect(3, 7, 7, 7, BRASS[1])                                   # the kick plate's edge
    _latch_plate(cv)
    return cv


def s_door_bar():
    return _door_bar()


def s_door_bar_broken():
    return _shatter(_door_bar(), 10, 13)


def s_door_swing():
    """Half of the toilets' swinging doors (a cafe pair): a short teal-painted leaf of louvres on a double-action
    pivot, a white MEN plate, a chrome push plate on each face; no latch."""
    w = ramp('#4f8c80', 0.45, 0.22, 0.34)
    cv = _plank(w, 16)
    s = cv.s
    for i in range(4 * s, 13 * s):                                  # the louvres' slats, one in two pixels
        if i % 2 == 0:
            for j in range(3 * s, 6 * s):
                cv.p[i, j] = w[1]
    cv.outline()
    cv.rect(1, 3, 2, 5, STEEL[1])                                   # the pivot: a steel boss at its foot
    cv.set(1, 3, STEEL_L[3])
    cv.rect(6, 1, 9, 1, hx('#e8e6dc'))                              # the plate: MEN
    cv.dot(7.5, 1.5, hx('#2a4ca0'))
    cv.dot(8.0, 1.5, hx('#2a4ca0'))
    for y in (1, 7):
        cv.rect(11, y, 13, y, CHROME[2] if y == 1 else CHROME[1])   # push plates
    return cv


def s_door_staff():
    """A storeroom / staff door: a plain institutional blue-grey paint, chipped and scuffed low, a white STAFF ONLY
    plate, a steel lever."""
    w = ramp('#5d6e82', 0.5, 0.24, 0.32)
    cv = _plank(w, 32)
    for x, y, c in ((5, 5, w[0]), (6.5, 5, w[0]), (9, 4, hx('#8d8a82')), (24, 5, w[0]), (14, 5, w[0]), (15, 3, hx('#8d8a82'))):
        cv.dot(x, y + 0.25, c)                                      # scuffs and chipped paint (the grey undercoat)
    cv.outline()
    _knuckles(cv)
    cv.rect(11, 1, 18, 1, hx('#e6e2d6'))                            # STAFF ONLY
    for x in range(11, 18):
        cv.dot(x + 0.25, 1.5, hx('#2a2430'))
    _lever(cv, 22, CHROME)
    _latch_plate(cv)
    return cv


def s_door_office():
    """The boss's door: oxblood leather buttoned in diamonds over padding, brass studs round its faces, a brass
    lever."""
    w = ramp('#6c1e26', 0.5, 0.26, 0.3)
    cv = _plank(w, 32)
    for k, x in enumerate(range(5, 28, 3)):                         # the buttons, diamond-tufted
        y = 3 if k % 2 else 5
        cv.dot(x, y + 0.25, w[0])
        cv.dot(x + 0.5, y - 0.25, w[3])
    cv.outline()
    _knuckles(cv)
    for x in range(5, 29, 2):                                       # brass studs along both faces
        cv.dot(x + 0.25, 1.75, BRASS[3])
        cv.dot(x + 0.25, 7.25, BRASS[2])
    _lever(cv, 22)
    _latch_plate(cv)
    return cv


def s_door_gaming():
    """The gaming room's door: a deep green gloss with a gold pinstripe on its top edge, a brass peephole through
    it, a brass lever."""
    w = ramp('#2a5a3c', 0.5, 0.24, 0.36)
    cv = _plank(w, 32)
    for x in range(3, 29):
        cv.dot(x + 0.25, 2.75, BRASS[2])                            # the pinstripe
    cv.rect(15, 3, 16, 5, BRASS[1])                                 # the peephole through the leaf
    cv.dot(15.5, 4.0, OUTLINE)
    cv.outline()
    _knuckles(cv)
    cv.set(15, 1, BRASS[3])
    cv.set(15, 7, BRASS[2])
    _lever(cv, 22)
    _latch_plate(cv)
    return cv


def s_door_flat():
    """A cheap flat's door: a thin oak-effect laminate, a brass number on the corridor face, a peephole, the security
    chain hanging on its track inside."""
    w = ramp('#a27c54', 0.45, 0.22, 0.3)
    cv = _plank(w, 32, ((4, 3, 14), (14, 5, 18)))
    cv.outline()
    _knuckles(cv)
    cv.rect(12, 1, 14, 1, BRASS[2])                                 # the number
    cv.dot(12.5, 1.5, OUTLINE)
    cv.dot(13.5, 1.5, OUTLINE)
    cv.set(16, 1, BRASS[3])                                         # the peephole's lens
    cv.rect(25, 7, 28, 7, CHROME[2])                                # the chain's track ...
    for k, x in enumerate((24, 23, 22, 21.5)):                      # ... and the chain hanging off it
        cv.dot(x + 0.5, 8.0 + (0.5 if k % 2 else 0), CHROME[3] if k % 2 else CHROME[1])
    _lever(cv, 22, CHROME)
    _latch_plate(cv)
    return cv


def _door_wired():
    """A corridor fire door: cream-painted steel, a long panel of wired glass, a steel push plate."""
    w = ramp('#b9ae92', 0.45, 0.22, 0.3)
    cv = _plank(w, 32)
    _glass(cv, 8, 20, tint='#b4d2c8', wire='#56645e')
    cv.outline()
    _knuckles(cv)
    for y in (1, 7):
        cv.rect(22, y, 26, y, STEEL_L[2] if y == 1 else STEEL_L[1])
    _latch_plate(cv)
    return cv


def s_door_wired():
    return _door_wired()


def s_door_wired_broken():
    return _shatter(_door_wired(), 8, 20, keep_wire='#56645e')


def _door_shop():
    """A shop's glass door: an aluminium frame round a pane the length of it, a pull bar on each face."""
    alu = ramp('#b2b8c4', 0.45, 0.22, 0.3)
    cv = _plank(alu, 32)
    _glass(cv, 5, 26, tint='#94c0d8')
    cv.outline()
    _knuckles(cv)
    for y, c in ((0, CHROME[3]), (8, CHROME[2])):
        cv.rect(22, y, 26, y, c)
        cv.set(21, y, OUTLINE)
        cv.set(27, y, OUTLINE)
    for y in (1, 7):
        cv.set(22, y, CHROME[1])
        cv.set(26, y, CHROME[1])
    _latch_plate(cv)
    return cv


def s_door_shop():
    return _door_shop()


def s_door_shop_broken():
    return _shatter(_door_shop(), 5, 26)


def s_jamb(w):
    """Door frame post set into the end of a wall (5 px wide across the 32 px of wall): x = 4 faces the opening."""
    cv = Cv(5, 32)
    cv.rect(0, 0, 4, 31, OUTLINE)
    for y in range(1, 31):
        cv.set(1, y, w[1])
        cv.set(2, y, w[3])
        cv.set(3, y, w[2])
    for y in (1, 30):                  # casing on both wall faces
        cv.rect(1, y, 3, y, w[3])
    cv.rect(1, 15, 3, 16, mix(w[1], w[0], 0.5))   # joint where the stop sits
    return cv


def s_threshold():
    """Floor of a doorway (one tile of a run along x): the reveal in the wall's shade and a worn metal sill bar."""
    cv = Cv(32, 32)
    for y in range(32):
        d = abs(y - 15.5) / 15.5
        for x in range(32):
            cv.set(x, y, (16, 10, 24, int(96 - 44 * d)))
    cv.rect(0, 12, 31, 12, OUTLINE)
    cv.rect(0, 19, 31, 19, OUTLINE)
    for x in range(32):
        cv.set(x, 13, STEEL_L[2])
        cv.set(x, 14, STEEL_L[1])
        for y in (15, 16):
            cv.set(x, y, STEEL[2])
        cv.set(x, 17, STEEL[1])
        cv.set(x, 18, STEEL[0])
    for x in (5, 26):                  # screws
        cv.set(x, 15, STEEL[0])
        cv.set(x, 16, STEEL_L[2])
    return cv


def s_window_sill():
    """Window ledge (one tile of a run along x): the wall cut down to sill height, lower and darker than its top."""
    cv = Cv(32, 32)
    rng = random.Random(77)
    for y in range(32):
        for x in range(32):
            c = SILL[2]
            if y in (2, 3):
                c = SILL[3]
            elif y in (27, 28, 29):
                c = SILL[1]
            elif 10 <= y <= 21:
                c = mix(SILL[2], SILL[1], 0.5)      # the rebate the frame sits in
            cv.set(x, y, tint(c, rng.uniform(-3, 3)))
    cv.rect(0, 0, 31, 1, OUTLINE)
    cv.rect(0, 30, 31, 31, OUTLINE)
    cv.rect(0, 12, 31, 19, mix(SILL[0], OUTLINE, 0.5))   # glazing channel: dark once the glass is gone
    return cv


def _window_frame(cv, mullion):
    cv.rect(0, 0, 31, 0, OUTLINE)
    cv.rect(0, 9, 31, 9, OUTLINE)
    for x in range(32):
        cv.set(x, 1, ALU[3])
        cv.set(x, 8, ALU[1])
    for x0 in (0, 29):                 # end posts
        cv.rect(x0, 1, x0 + 2, 8, ALU[2])
        cv.rect(x0, 1, x0 + 2, 2, ALU[3])
        cv.rect(x0, 7, x0 + 2, 8, ALU[1])
        xi = x0 + 2 if x0 == 0 else x0
        cv.rect(xi, 2, xi, 7, OUTLINE)
    if mullion:
        cv.rect(15, 1, 16, 8, ALU[2])
        cv.rect(15, 1, 16, 2, ALU[3])
        cv.rect(15, 7, 16, 8, ALU[1])
        cv.rect(14, 2, 14, 7, OUTLINE)
        cv.rect(17, 2, 17, 7, OUTLINE)


def s_window():
    """Glazed window seen from above (along x, 10 px across): aluminium rails and posts, a glazing bar, tinted glass."""
    cv = Cv(32, 10)
    for x in range(3, 29):
        cv.set(x, 2, (214, 250, 255, 205))
        cv.set(x, 3, (150, 226, 240, 170))
        cv.set(x, 4, (118, 206, 228, 160))
        cv.set(x, 5, (104, 192, 222, 160))
        cv.set(x, 6, (86, 168, 208, 170))
        cv.set(x, 7, (60, 128, 178, 200))
    # reflections: two slanted glints per pane
    for x0 in (5, 9, 20, 24):
        for k in range(4):
            cv.set(x0 + k, 6 - k, (255, 255, 255, 235))
            if x0 in (5, 20):
                cv.set(x0 + k + 1, 6 - k, (236, 252, 255, 200))
    _window_frame(cv, True)
    return cv


def s_window_broken():
    """The same frame with the glass gone: teeth left in the rebates, the glazing bar snapped."""
    cv = Cv(32, 10)
    _window_frame(cv, False)
    g0, g1 = (226, 252, 255, 240), (150, 220, 240, 215)
    # (x, from the top rail?, depth): shards standing in both rails
    for x, top, d in ((4, 1, 3), (5, 1, 2), (9, 1, 1), (12, 1, 2), (19, 1, 1), (22, 1, 3), (23, 1, 2), (27, 1, 1),
                      (6, 0, 1), (10, 0, 2), (11, 0, 3), (18, 0, 2), (21, 0, 1), (26, 0, 3), (27, 0, 2)):
        for k in range(d):
            cv.set(x, 2 + k if top else 7 - k, g0 if k == 0 else g1)
    # daggers left against the posts
    for x, y in ((3, 3), (4, 4), (3, 4), (3, 5), (28, 4), (27, 5), (28, 5), (28, 6)):
        cv.set(x, y, g1 if (x + y) % 2 else g0)
    # stubs of the snapped glazing bar
    for y, c in ((2, ALU[2]), (7, ALU[1])):
        cv.rect(15, y, 16, y, c)
    cv.set(15, 3, ALU[1])
    cv.set(16, 6, ALU[0])
    return cv


def s_fence():
    cv = Cv(32, 6)
    w = ramp('#8a6440', 0.45, 0.22, 0.3)
    for x in range(1, 31):
        cv.set(x, 2, w[3])
        cv.set(x, 3, w[1])
    for x in range(5, 28, 4):
        cv.rect(x, 1, x + 1, 4, w[2])
        cv.set(x, 1, w[3])
        cv.set(x + 1, 4, w[1])
    cv.outline()
    for x0 in (0, 29):
        cv.rect(x0, 0, x0 + 2, 5, w[1])
        cv.rect(x0, 0, x0 + 2, 0, w[2])
        cv.set(x0 + 1, 1, w[3])
        cv.rect(x0, 5, x0 + 2, 5, OUTLINE)
        cv.rect(x0 + 2 if x0 == 0 else x0, 0, x0 + 2 if x0 == 0 else x0, 5, w[0])
    return cv


GROUP = 'structure'
SPRITES = {
    'door': (s_door, (32, 9), 'req'),
    'door_locked': (s_door_locked, (32, 9), 'req'),
    'stall_door': (s_stall_door, (32, 9), 'req'),
    'door_jamb': (lambda: s_jamb(ramp('#6e4a32', 0.5, 0.26, 0.34)), (5, 32), 'req'),
    'door_jamb_steel': (lambda: s_jamb(STEEL_L), (5, 32), 'req'),
    'threshold': (s_threshold, (32, 32), 'req'),
    'window': (s_window, (32, 10), 'req'),
    'window_broken': (s_window_broken, (32, 10), 'req'),
    'window_sill': (s_window_sill, (32, 32), 'req'),
    'fence': (s_fence, (32, 6), 'req'),
    # the skins, one kind of door per place (data/doors.js DOORS.kinds)
    'door_fire': (s_door_fire, (32, 9), 'fine req'),
    'door_bar': (s_door_bar, (32, 9), 'fine req'),
    'door_bar_broken': (s_door_bar_broken, (32, 9), 'fine req'),
    'door_swing': (s_door_swing, (16, 9), 'fine req'),
    'door_staff': (s_door_staff, (32, 9), 'fine req'),
    'door_office': (s_door_office, (32, 9), 'fine req'),
    'door_gaming': (s_door_gaming, (32, 9), 'fine req'),
    'door_flat': (s_door_flat, (32, 9), 'fine req'),
    'door_wired': (s_door_wired, (32, 9), 'fine req'),
    'door_wired_broken': (s_door_wired_broken, (32, 9), 'fine req'),
    'door_shop': (s_door_shop, (32, 9), 'fine req'),
    'door_shop_broken': (s_door_shop_broken, (32, 9), 'fine req'),
}
