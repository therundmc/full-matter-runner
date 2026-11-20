#!/usr/bin/env python3
"""Builds src/game/data/levels/level2a.js (level 2A, the chase: docs/LEVEL2.md) with tools/levelkit.py.

    python tools/build_level2a.py

Segment 1, THE BACK ROAD (0:00-0:25 at 60 km/h): THE BOSS's convertible drives east (+x) in the south lane
(right-hand traffic) of a two-lane street of Sunset Bay, 450 m of it, built section by section as a real street
is: kerbs along every sidewalk, parking on one side or the other or on neither, two junctions under traffic lights
with their crossings, a railway bridge, works in a parking lane, a bus stop, the lorry's yard, a terrace, a diner.
NOTHING stands in the two lanes: they are the pursuers' and his (docs/LEVEL2.md has the table of the sections).

The two lanes never move (rows 11 to 15: theirs, westbound, its middle on row 12.25; ours on 14.75; the centre
line along 13.5). What lies either side of them is one of three cross-sections (north is up, rows):

    A  parking NORTH   facade 7 | sidewalk 8      | parking 9-10 | lanes | sidewalk 16-17              | facade 18
    B  parking SOUTH   facade 7 | sidewalk 8-10   |              | lanes | parking 16-17 | sidewalk 18 | facade 19
    C  no parking      facade 7 | sidewalk 8-10   |              | lanes | sidewalk 16-17              | facade 18

The street by its columns (the events' columns are `chase.events`: the column of the car's middle that sets each
off):

    0-45      A  THE SHOPS: LIQUOR, BAR, VIDEO, WASH 24H, meters along the parking row
    46-61     J  CORAL STREET under traffic lights (its roadway cols 51-56, one way south): crossings, stop lines
    62-104    B  parking on OUR side, a wide north sidewalk with trees, a loading bay hatched in yellow
    105-147   A  shops again; the alley of cols 138-141 is event 1 (told with the car at ALLEY_AT)
    148-156      THE RAILWAY BRIDGE over the street (no parking under it), SLOW painted before it
    157-246   A  THE DARK STRETCH: a vacant lot behind a chain fence (north), blind walls (south), one lamp in two;
                 the gas works in the parking row (cols 203-231): a trench, a compressor, an arrow board, barricades
    247-271   C  THE BUS STOP: a shelter on the wide north sidewalk, BUS STOP on their lane, red kerbs
    272-312   B  parking on our side again (cols 278-309)
    313-356   A  (no car parked) THE YARD (north, cols 337-342): the lorry of event 2 backs out of it across both
                 lanes, KEEP CLEAR painted before its gate; THE TERRACE (south, cols 325-354): the cafe set back
                 four metres, bollards along its kerb, tables, parasols, planters, awnings: the way round the lorry
    357-388   A  THE LIT CORNER: the diner, all glass and light
    389-403   J  THE CROSS STREET under traffic lights (its roadway cols 393-398): the last car comes out of it
    404-449   C  the way to the freeway (its sign over the road), DETOUR told from col 418
    446-473      THE WORKS: the street dug up past the side street's mouth (cones tapering both lanes into it, an
                 arrow board, ROAD CLOSED, water barriers, the road cut, the excavator and the dump truck, lit)

Then the detour (docs/LEVEL2.md "Segment 1, part two"): the script (systems/Route.js legs and bends) takes the car
right down THE SIDE STREET (cols 440-451: sheds, a loading dock, a yard behind its gate, STOP at both ends), under
THE FREEWAY's bridge at its foot (rows 33.5-41.5), and left onto LEG 1 (lanes 44.25 / 46.75, one way east): THE
FRONTAGE ROAD along the freeway's embankment (sheds and docks on the south side, cols 446-497), THE ON-RAMP (its
own embankment, guardrails, cols 498-523), THE MERGE (the freeway's lanes come in alongside, cols 524-559). Then
THE TOLL (segment 2, docs/LEVEL2.md has its table, cols 560-699): the four lanes side by side spread to the plaza's
grid under its roof (cols 603-611: five islands, four booths, a gate at the end of each lane: a wooden arm or a steel
boom, told by its lane's signal), spread back, the outer two merge in: the freeway's start; the level ends at col 672.
"""
import math
import random

from levelkit import Level, SIZES, SOLID as BLOCKS

WS, HS = 450, 24             # the street (segment 1): its columns and rows
W, H = 700, 64               # the map: the street, the detour down the side street, leg 1 (the on-ramp's start) below it,
                            # the toll east of col 560 (rows 56 on: the plaza's south half)
START = (8.5, 14.75)        # the car's centre, facing +x, in our lane
LANES = (12.25, 14.75)      # the lanes' middle rows: theirs (westbound), ours
# THE DETOUR (docs/LEVEL2.md "Legs and scripted bends", "Segment 1, part two"): works shut the street past the side
# street's mouth, the script takes the car right down the side street and left at its foot onto LEG 1
SIDE = (442, 449)           # the side street's roadway (cols, inclusive), a sidewalk two tiles wide either side
SIDE_X = 446                # its middle: the bend's line goes down it
BEND_AT = 438               # the column of the car's middle where the script takes the wheel (leg 0)
BEND_R = 6                  # tiles: the radius of its two turns
WORKS_X = 451               # the works across the street, from this column (past the side street's mouth)
DEAD = 474                  # the street carried on to this column under the works (a blind end, out of sight)
LEG1 = 446                  # leg 1 holds the columns from here to the map's end (leg 0 the ones before)
LEG1_W = 424                # its road from this column (the frontage road comes from the west, out of sight)
ROAD1 = (43, 47)            # its roadway's rows (two lanes, one way east)
LANES1 = (44.25, 46.75)     # its lanes' middle rows (the lane line on row 45.5)
FWY = (34, 40)              # the freeway's asphalt rows along leg 1 (its lanes 35.5-38 and 38-40.5), up on its bank
DECK = (437, 455)           # its bridge over the side street (cols: the deck from 437 to 455, rows 33.5 to 41.5)
RAMP_X = 498                # the frontage road's south blocks end: the on-ramp's embankment from this column
MERGE = (524, 548)          # the freeway's lanes come in alongside ours over these columns (the gore between)
TOLL_X = 560                # the toll from this column on (leg 1's lanes carried on into it)
END = 672                   # past this column of the last leg (the freeway's start, past the toll) the level is over
EVENT_ALLEY = 138           # first column of the alley kept clear for event 1
ALLEY_AT = 111              # event 1 set off with the car's middle at this column (about 0:06): no brake at the wheel,
                            # so it is told early enough to cross AHEAD of him into the far lane (he keeps out of it)
BEHIND_AT = (165, 236, 262) # a car set off from behind at each (it starts 19 m back and is alongside 3 s later)
BEHIND_STYLE = ('rammer', 'blocker', 'gunner')
CROSS_AT = 368              # the last one, out of the cross street ahead of him, as early (about 0:22)
FRONTAGE_AT = 468           # one more from behind on the frontage road, out of the detour (leg 1)
ALLEY_W = 4
ALLEYS = (22, 105, EVENT_ALLEY, 190, 232, 272, 418)   # south (none just before the terrace: he comes at it along the sidewalk)
N_ALLEY = (99, 100)         # a passage through the north block (people come and go by it)
CORAL = (50, 57)            # the first street across: its sidewalks' columns; the roadway between them
CROSS = (392, 399)          # the second one
BRIDGE = (148, 156)         # the railway bridge
DARK = (157, 246)           # the dark stretch
LOT = (160, 226)            # its vacant lot, north
WORKS = (203, 231)          # the gas works in its parking row
BUS = (247, 271)            # the bus stop's stretch
YARD = (337, 342)           # the lorry's yard, north (cols, inclusive)
LORRY_AT = 303              # event 2 told with the car's middle at this column (about 0:18)
TERRACE = (325, 354)        # the cafe's terrace, south (cols, inclusive)
DINER = (358, 388)
# the three cross-sections by column (inclusive spans): the first row of road north (the sidewalk above it), the
# first row of sidewalk south, the south facade's row; anything else is A
WIDE_N = ((46, 104), (247, 312), (388, 449))            # the north sidewalk three metres wide (B, C, a junction's corners)
PARK_S = ((64, 101), (278, 309))                        # the parking row on our side
FACE_19 = ((57, 104), (276, 324))                       # the south fronts a row back
SIGNAL_AT = 7.0             # s into the traffic lights' cycle at the start: amber as he comes to the first, red as he
                            # runs it; red again at the second, whose cross street is then on green (the last car's)
SIGNS_1 = ['neon_sign_liquor', 'neon_sign_bar', 'neon_sign_video', 'neon_sign_wash']   # as on the board, in order
SIGNS_1S = ['neon_sign_wash', 'neon_sign_open', 'neon_sign_beer', 'neon_sign_palm']
SIGNS_2 = ['neon_sign_lips', 'neon_sign_palm', 'neon_sign_beer', 'neon_sign_video', 'neon_sign_open', 'neon_sign_bay',
           'neon_sign_arrow', 'neon_sign_liquor', 'neon_sign_bar']
SHOPS = {   # kind: (floor, what stands inside)
    'liquor': (',', 'shelves'),
    'video': (';', 'tvs'),
    'wash': ('+', 'washers'),
    'bar': ('.', 'bar'),
    'shop': ('_', 'crates'),
}
SIGN_KIND = {'neon_sign_liquor': 'liquor', 'neon_sign_video': 'video', 'neon_sign_wash': 'wash', 'neon_sign_bar': 'bar',
             'neon_sign_beer': 'bar', 'neon_sign_bay': 'bar', 'neon_sign_lips': 'bar'}

rng = random.Random(2026)
lv = Level(W, H)


def within(col, spans):
    return any(a <= col <= b for (a, b) in spans)


def n_kerb(col):
    """The first row of road under the north sidewalk at this column."""
    return 11 if within(col, WIDE_N) else 9


def s_kerb(col):
    """The first row of sidewalk south of the road."""
    return 18 if within(col, PARK_S) else 16


def s_face(col):
    """The row of the south fronts."""
    return 21 if TERRACE[0] <= col <= TERRACE[1] else 19 if within(col, FACE_19) else 18


def roadway(x):
    """The roadway of a street across, if this column is in one (its sidewalks' columns are not)."""
    return CORAL[0] < x < CORAL[1] or CROSS[0] < x < CROSS[1]


# ---------------------------------------------------------------- the ground
for x in range(WS):
    lv.fill(x, 8, x, n_kerb(x) - 1, 's')
    lv.fill(x, n_kerb(x), x, s_kerb(x) - 1, '=')
    lv.fill(x, s_kerb(x), x, s_face(x) - 1, 's')
for (a, b) in (CORAL, CROSS):
    lv.fill(a + 1, 0, b - 1, HS - 1, '=')
    for x in (a, b):                                    # its two sidewalks, up to the corners of ours
        lv.fill(x, 0, x, 7, 's')
        lv.fill(x, s_face(x), x, HS - 1, 's')
for a in ALLEYS:
    lv.fill(a, s_face(a + 1), a + ALLEY_W - 1, HS - 1, '_')
    lv.fill(a, 16, a + ALLEY_W - 1, s_face(a + 1) - 1, 's')
lv.fill(N_ALLEY[0], 0, N_ALLEY[1], 7, '_')
# the centre line: double and solid where nobody may pass (toward a junction, under the bridge, at the bus stop, past
# the yard, to the freeway: paint), else single dashes, two metres on, two off (a line that never breaks does not show
# the road going by); none across a junction
SOLID = ((30, 45), (62, 74), (132, 160), (238, 276), (306, 356), (374, 388), (404, WS - 1))
BOXES = ((46, 61), (389, 403))
for c in range(0, WS, 4):
    if not within(c, SOLID) and not within(c, BOXES) and not within(c + 1, SOLID):
        lv.fill(c, 13, min(WS - 1, c + 1), 13, '-')
for (a, b) in SOLID:
    for c in range(a, b + 1, 3):
        if c + 3 <= b + 1:
            lv.paint('centre_double', c + 1.5, 13.5)

# the vacant lot: beaten earth and weeds behind a chain fence along the sidewalk
lv.fill(LOT[0], 1, LOT[1], 7, '~')
for _ in range(90):
    x, y = rng.randint(LOT[0], LOT[1]), rng.randint(1, 7)
    lv.put(x, y, '"')
    if rng.random() < 0.6 and x < LOT[1]:
        lv.put(x + 1, y, '"')
# the yard the lorry backs out of: concrete from the back wall to the sidewalk
lv.fill(YARD[0], 1, YARD[1], 7, '_')
T0, T1 = TERRACE
lv.fill(T0, 22, T1, 22, '.')                            # the cafe behind its front

boxes = []      # what stands on the ground so far, in tiles: (x0, y0, x1, y1)


def put(kind, col, row, deg=0, pad=0.04, on='s', **opt):
    """A prop on the ground (`on`: the tiles it may stand on: a sidewalk unless told), unless it would touch one
    already there. True if put."""
    b = Level.box(kind, col, row, deg)
    b = (b[0] - pad, b[1] - pad, b[2] + pad, b[3] + pad)
    if any(not (b[0] >= o[2] or o[0] >= b[2] or b[1] >= o[3] or o[1] >= b[3]) for o in boxes):
        return False
    assert lv.tiles[int(row)][int(col)] in on, f'{kind} at {col},{row} stands on {lv.tiles[int(row)][int(col)]!r}'
    boxes.append(b)
    lv.prop(kind, col, row, deg, **opt)
    return True


def must(kind, col, row, deg=0, **opt):
    """A prop that is part of the design: it has its place."""
    assert put(kind, col, row, deg, **opt), f'{kind} at {col},{row} has no room'


# ---------------------------------------------------------------- the fronts
# a side of the street between two columns, block by block: a shop (its facade: windows, a locked door, a two-tile pier
# carrying its sign) or a blind building (a flat roof behind a plain wall). The north fronts are on row 7, the south
# ones on the row s_face gives
def side(north, x0, x1, signs, blind=0.25):
    keep = [(CORAL[0] - 1, CORAL[1] + 1), (CROSS[0] - 1, CROSS[1] + 1), (BRIDGE[0] - 1, BRIDGE[1] + 2)]
    if north:
        keep += [(LOT[0] - 1, LOT[1] + 1), (YARD[0] - 1, YARD[1] + 1), (N_ALLEY[0] - 1, N_ALLEY[1] + 1)]
    else:
        keep += [(a - 1, a + ALLEY_W) for a in ALLEYS] + [(TERRACE[0] - 1, TERRACE[1] + 1), (DINER[0] - 1, DINER[1] + 1)]
    x = x0
    shops = []
    while x < x1 - 5:
        w = rng.choice((5, 6, 6, 7, 7, 8))
        face = 7 if north else s_face(x)
        if x + w > x1 or any(x <= b and a <= x + w - 1 for (a, b) in keep) or (not north and s_face(x + w - 1) != face):
            x += 1
            continue
        if rng.random() < blind:
            x += rng.randint(3, 5)           # a blind wall, a roof behind it
            continue
        sign = signs.pop(0) if signs else rng.choice(SIGNS_2)
        kind = SIGN_KIND.get(sign, 'shop')
        inner = (5, 6) if north else (face + 1, face + 2)
        lv.fill(x, inner[0], x + w - 1, inner[1], SHOPS[kind][0])
        door = 0 if rng.random() < 0.5 else w - 1
        pier = (w - 2) // 2 if door else max(1, (w - 1) // 2)
        for i in range(w):
            if i == door:
                lv.put(x + i, face, 'L')
            elif i not in (pier, pier + 1):
                lv.put(x + i, face, 'G')
        lv.prop(sign, x + pier + 1.0, 8.09 if north else face - 0.09)      # (the signs read one way up: never turned)
        shops.append((x, w, kind, door, face))
        x += w + rng.randint(1, 2)
    return shops


lv.area('north shops')
north_shops = side(True, 1, DARK[0] - 2, list(SIGNS_1)) + side(True, DARK[1] + 2, WS - 4, list(SIGNS_2), 0.2)
lv.area('south shops')
south_shops = side(False, 1, DARK[0] - 2, list(SIGNS_1S)) + side(False, DARK[1] + 2, WS - 4, list(reversed(SIGNS_2)), 0.2)


# what stands inside a shop (seen through its windows), lit by a lamp under its ceiling, close to the glass
def dress_shop(x, w, kind, door, face, north):
    wall_row, front_row, deg = (5.2, 6.55, 0) if north else (face + 2.8, face + 1.45, 180)
    lamp_row = 6.3 if north else face + 1.7
    keep = x + door + 0.5      # the door's own column inside stays clear
    cols = [x + 0.75 + i * 1.3 for i in range(int((w - 0.5) / 1.3))]
    cols = [c for c in cols if abs(c - keep) > 0.9]
    what = SHOPS[kind][1]
    if what == 'shelves':
        for c in cols:
            lv.prop('bottle_shelf', c, wall_row, deg)
    elif what == 'tvs':
        for c in cols[:3]:
            lv.prop('tv', c, front_row, 180 - deg)
        if cols:
            lv.prop('bookshelf', cols[-1], wall_row, deg)
    elif what == 'washers':
        for c in cols:
            lv.prop('washer', c, wall_row + (0.25 if north else -0.25), deg)
    elif what == 'bar':
        for c in cols:
            lv.prop('back_bar', c, 5.15 if north else face + 2.85, deg)
    else:
        for c in cols[::2]:
            lv.prop('crate', c, wall_row + (0.1 if north else -0.1), rng.randint(-15, 15))
    lv.prop('ceiling_lamp', x + w / 2, lamp_row)


for s in north_shops:
    dress_shop(*s, True)
for s in south_shops:
    dress_shop(*s, False)

# ---------------------------------------------------------------- the diner on the lit corner (south)
lv.area('the diner')
D0, D1 = DINER
lv.fill(D0, 19, D1, 21, ',')
for x in range(D0, D1 + 1):
    lv.put(x, 18, 'G')
for x in (D0 + 6, D0 + 7, D0 + 22, D0 + 23):       # two piers carrying its signs
    lv.put(x, 18, 'X')
lv.put(D0 + 15, 18, 'L')
lv.prop('neon_sign_diner', D0 + 7.0, 17.91)
lv.prop('neon_sign_diner', D0 + 23.0, 17.91)
for i, x in enumerate(range(D0 + 1, D1 - 3, 4)):      # booths against the glass, the counter behind
    if abs(x + 0.5 - (D0 + 15.5)) < 1.6:
        continue
    lv.prop('table', x + 1.0, 19.75, 90)
    lv.prop('chair', x + 0.2, 19.6, 0)
    lv.prop('chair', x + 1.8, 19.7, 180)
for x in range(D0 + 2, D1 - 1):
    lv.prop('bar_counter', x + 0.5, 21.5, 0)
lv.prop('jukebox', D1 - 0.6, 20.6, 180)
for x in range(D0 + 5, D1 - 1, 6):
    lv.prop('tube_light', x + 0.5, 19.07, 0)
    lv.prop('ceiling_lamp', x + 2.5, 20.2)
lv.patron('civ1', D0 + 11.5, 20.85, 90, 'drink')
lv.patron('civ3', D0 + 19.5, 20.85, 90, 'drink')

# ---------------------------------------------------------------- the cafe and its terrace (south, set back)
lv.area('the cafe: its front, the awnings')
for x in range(T0 + 1, T1):
    lv.put(x, 21, 'G')
for x in (T0 + 2, T0 + 3, T1 - 3, T1 - 2):
    lv.put(x, 21, 'X')
lv.put(T0 + 12, 21, 'L')
lv.prop('neon_sign_cafe', T0 + 3.0, 20.91)
lv.prop('neon_sign_cafe', T1 - 2.0, 20.91)
for c in (T0 + 7.0, T0 + 16.5, T0 + 20.5):
    lv.prop('awning', c, 20.44, 180)
for x in range(T0 + 2, T1, 5):
    lv.prop('ceiling_lamp', x + 0.5, 22.3)
    lv.prop('wall_lamp', x + 2.5, 20.9, 180)
lv.area('the terrace: planters and bollards along its kerb, tables, chairs, parasols (everything flies)')
for c in (T0 + 1.6, T0 + 5.2, T0 + 8.8, T0 + 12.4, T0 + 16.0, T0 + 19.6, T0 + 23.2):     # planters along the kerb,
    must('planter', c, 16.32)                         # a steel bollard between two: the cars kept off it
    must('bollard', c + 1.8, 16.3)
for c in (T0 + 26.4, T0 + 27.9, T0 + 29.4):
    must('bollard', c, 16.3)
must('planter', T0 + 0.35, 18.0, 90)
must('planter', T1 + 0.65, 18.0, 90)
n = 0
for (row, shift) in ((17.35, 0.0), (18.75, 1.7), (19.9, 0.4)):
    c = T0 + 2.2 + shift
    while c < T1 - 0.5:
        tc, tr = c + rng.uniform(-0.3, 0.3), row + rng.uniform(-0.12, 0.12)
        if put('table_round', tc, tr):
            n += 1
            for (dx, dy, deg) in ((-0.74, 0.1, 0), (0.74, -0.1, 180), (0.05, 0.76, 90))[:2 + n % 2]:
                put('chair', tc + dx + rng.uniform(-0.06, 0.06), tr + dy, deg + rng.randint(-25, 25))
            if n % 3 != 2:
                put('parasol', tc + 0.6, tr - 0.6)
        c += rng.uniform(2.9, 3.7)
lv.patron('civ2', T0 + 6.4, 18.85, 180, 'drink')
lv.patron('civ4', T0 + 20.7, 17.45, 180, 'drink')

# ---------------------------------------------------------------- the two junctions
# A street across under traffic lights. Its four corners are rounded (the sidewalks come out to the lanes there: no
# car parks within ten metres of a crossing); a crossing either side of it on our street and one across each of its
# own arms, the kerbs dropped at their ends; a stop line before each crossing for who comes at it; four mast arms,
# each on the far corner of the lane it is for, its heads over that lane (US far-side signals). Ours and the cross
# street's lights run the same cycle half of it apart.
corners = {}        # (col, row) of a tile corner -> the big rounded corner laid there
low = set()         # kerb edges dropped flush: ('h', col, row of the edge) / ('v', col of the edge, row)
painted = {}        # kerb edges painted: the same keys -> 'red' | 'yellow'


def crossing(c0, r0, r1, wear=0):
    """Zebra bars across our street: three metres wide from column c0, a bar a metre from row r0 to r1 (the roadway);
    the kerbs dropped two metres at both ends, their aprons."""
    for r in range(r0, r1):
        lv.paint('zebra_b' if (r + wear) % 3 == 0 else 'zebra_a', c0 + 1.5, r + 0.5)
    for c in (c0, c0 + 1):
        low.update((('h', c, r0), ('h', c, r1)))
    lv.paint('kerb_ramp_s', c0 + 1.0, r0 - 15 / 32)
    lv.paint('kerb_ramp_n', c0 + 1.0, r1 + 15 / 32)


def junction(a, b, one_way, name):
    lv.area(f'{name}: traffic lights, signs')
    rw0, rw1 = a + 1, b                               # its roadway: columns rw0 .. rw1 - 1
    fw, fe = s_face(a - 1), s_face(b + 1)
    for (c, r, q) in ((rw0, 11, 'se'), (rw1, 11, 'sw'), (rw0, 16, 'ne'), (rw1, 16, 'nw')):
        corners[(c, r)] = q
    crossing(a - 3, 11, 16)
    crossing(b + 1, 11, 16, 1)
    for c in range(rw0, rw1):                         # across its own arms: the bars along them
        lv.paint('zebra_a' if c % 2 else 'zebra_b', c + 0.5, 6.5, 90)
        lv.paint('zebra_b' if c % 2 else 'zebra_a', c + 0.5, max(fw, fe) + 1.5, 90)
    for r in (5, 6):
        low.update((('v', rw0, r), ('v', rw1, r)))
    for r in (max(fw, fe) + 1, max(fw, fe) + 2):
        low.update((('v', rw0, r), ('v', rw1, r)))
    lv.paint('stop_line', a - 3.75, LANES[1])         # ours, then theirs
    lv.paint('stop_line', b + 4.75, LANES[0])
    lv.paint('road_arrow', a - 9.0, LANES[1])
    lv.paint('road_arrow', b + 10.0, LANES[0], 180)
    mid = (rw0 + rw1) / 2
    if one_way:                                       # two lanes south: one line across both, an arrow in each
        for c in (rw0 + 1.5, rw1 - 1.5):
            lv.paint('stop_line', c, 4.55, 90)
            lv.paint('road_arrow', c, 2.3, 90)
    else:
        lv.paint('stop_line', rw0 + 1.5, 4.55, 90)
        lv.paint('stop_line', rw1 - 1.5, max(fw, fe) + 3.45, 90)
        lv.paint('centre_double', mid, 2.2, 90)
        lv.paint('centre_double', mid, HS - 1.8, 90)
    # the mast arms: the pole on the far corner, the arm over the lane it is for (heads toward who comes)
    cross = SIGNAL_AT + 9
    must('traffic_light', b + 0.62, 16.38, 270, phase=SIGNAL_AT)            # ours: south-east corner, arm north
    must('traffic_light', a + 0.38, 10.62, 90, phase=SIGNAL_AT)             # theirs: north-west corner, arm south
    must('traffic_light', a + 0.38, 16.38, 0, phase=cross)                  # southbound: south-west corner, arm east
    if not one_way:
        must('traffic_light', b + 0.62, 10.62, 180, phase=cross)            # northbound: north-east corner, arm west
    else:
        must('sign_oneway', b + 0.6, 10.5, 90)
        must('sign_oneway', a + 0.4, 17.4, 90)
    for (c, r) in ((a - 1, 11), (a, 11), (b, 11), (b + 1, 11), (a - 1, 16), (a, 16), (b, 16), (b + 1, 16)):
        painted[('h', c, r)] = 'red'                  # nobody stops on a corner
    lv.area(f'{name}: what stands on its corners')
    must('hydrant', a - 3.5, 10.5)
    lv.paint('valve_cap', a - 3.5, 11.6)
    for c in range(a - 4, a - 2):
        painted[('h', c, 11)] = 'red'
    must('mailbox', b + 2.4, 10.35)
    must('trash_can', b + 3.3, 8.55)
    for i in range(3):
        must('news_box', a - 2.6 + i * 0.56, 16.45)
    must('trash_can', a - 3.6, 17.5)
    lv.paint('drain', a - 0.6, 11 + 8 / 32)
    lv.paint('drain', b + 1.6, 16 - 8 / 32)
    lv.paint('manhole_sq', mid - 1.2, 13.4)


junction(*CORAL, True, 'Coral Street')
junction(*CROSS, False, 'the cross street')
lv.area('Coral Street: who waits at its red light')
must('car2', CORAL[0] + 2.5, 2.15, 90, on='=')
must('car', CORAL[1] - 1.5, 2.2, 90, on='=')

# ---------------------------------------------------------------- the parking rows
# a row of bays six metres long, a white tee where two meet; a meter at each on the sidewalk; cars in some
lv.area('parking: cars (lights off), meters')
N_BAYS = [(14, 44, 0.6), (110, 146, 0.55), (158, 200, 0.28), (234, 240, 0.5), (358, 382, 0.6)]   # (first tee, last tee, how full)
S_BAYS = [(64, 88, 0.62), (278, 308, 0.6)]
LOADING = (88, 100)         # two bays on our side kept for deliveries: hatched, a yellow kerb, nobody parked
MODELS = ('car', 'car', 'car2', 'car2', 'van')


# THINNED (the user, after playing: "too many cars on the sides"): 12 cars where the draw gave 21. The draw is kept as
# it was (the street's other dice roll on), then these bays (their first tee's column) are left empty: an old patch
# or a sealed crack where a car stood for years, a cone somebody left in two of them. EMPTY is by section: the shops
# 1 of 4, B 1 of 3, A 2 of 4, the dark stretch 2 of 4, B 2 of 4, the lit corner 1 of 2
EMPTY = {26: 'road_patch_b', 70: 'road_crack_a', 116: 'road_patch_a', 140: 'cone', 158: 'road_crack_b', 182: 'cone',
         284: 'road_patch_c', 302: 'road_patch_a', 370: 'road_crack_a'}
# parked badly: [tiles along the row (astride the tee between two bays), rows toward the sidewalk (two wheels up on
# the kerb)]. Never turned: a car askew in a row 2.5 m from the lane's edge would have a corner in the lane
CROOKED = {20: (1.5, 0.0), 82: (-0.4, 0.13), 176: (0.5, 0.12), 296: (-1.2, 0.0)}
PARKED = []                 # the cars left in the rows: (col, north)


def bays(c0, c1, full, north):
    row, deg, meter = (10.0, 180, 8.7) if north else (17.0, 0, 18.3)
    for c in range(c0, c1 + 1, 6):
        lv.paint('park_tee', c, row, 0 if north else 180)
        put('parking_meter', c + 0.2, meter)
        if c < c1 and rng.random() < full:
            model, x = rng.choice(MODELS), c + 3.0 + rng.uniform(-0.2, 0.2)
            y = row + rng.uniform(-0.04, 0.04) + (0.02 if north else -0.02)
            if c in EMPTY:
                if EMPTY[c] == 'cone':
                    put('traffic_cone', x + 1.3, row + (-0.5 if north else 0.5), on='=')
                else:
                    lv.paint(EMPTY[c], x, row + (-0.1 if north else 0.1))
                continue
            turn, onto = CROOKED.get(c, (0, 0))
            must(model, x + turn, y + (-onto if north else onto), deg, on='=', lights=False)
            PARKED.append((x + turn, north))


for (c0, c1, full) in N_BAYS:
    bays(c0, c1, full, True)
for (c0, c1, full) in S_BAYS:
    bays(c0, c1, full, False)
assert len(PARKED) == 12 and not set(EMPTY) - {c for (c0, c1, _) in N_BAYS + S_BAYS for c in range(c0, c1, 6)}, len(PARKED)
for c in range(LOADING[0], LOADING[1] + 1, 6):
    lv.paint('park_tee', c, 17.0, 180)
lv.paint('hatch_bay', LOADING[0] + 3.0, 17.0)
lv.paint('hatch_bay', LOADING[0] + 9.0, 17.0)
for c in range(LOADING[0], LOADING[1]):
    painted[('h', c, 18)] = 'yellow'
must('sign_noparking', LOADING[0] + 1.0, 18.3)

# ---------------------------------------------------------------- the railway bridge
lv.area('the railway bridge')
B0, B1 = BRIDGE
BX = (B0 + B1 + 1) / 2
lv.prop('viaduct', BX, 13.0)
lv.paint('viaduct_shadow', BX + 0.35, 13.0)
for r in list(range(0, 7)) + list(range(19, HS)):
    lv.roof('rail_bed', BX, r + 0.5)
lv.paint('road_slow', B0 - 5.0, LANES[1], 90)
lv.paint('road_slow', B1 + 6.0, LANES[0], 270)
must('sign_noparking', B0 - 0.6, 8.7)
for c in range(B0 - 1, B1 + 2):
    painted[('h', c, 9)] = 'red'
lv.pigeons(BX - 1.0, 16.6, 3)        # under the bridge, on our kerb: they roost on it

# ---------------------------------------------------------------- the works (the dark stretch's parking row)
# the gas board has the parking row up: told to who comes down their lane (from the east) by a sign, an arrow board
# and a barricade across the row, cones along the lane's edge (all inside the row: the lane itself stays whole)
lv.area('the works')
W0, W1 = WORKS
must('sign_works', W1 + 0.4, 9.9, 270, on='=')
must('barricade', W1 - 1.0, 10.0, 90, on='=')
must('arrow_board', W1 - 3.3, 9.95, 270, on='=')
must('compressor', W1 - 7.4, 9.8, 180, on='=')
lv.paint('trench', W0 + 11.0, 10.0)
lv.paint('spoil', W0 + 15.2, 9.75)
lv.paint('steel_plate', W0 + 4.4, 10.0)
for c in (W0 + 9.8, W0 + 12.2):                        # along the trench, on the lane's side
    must('barricade', c, 10.86, 0, on='=')
must('barricade', W0 + 1.0, 10.0, 90, on='=')
for i in range(12):
    put('traffic_cone', W0 + 2.2 + i * 2.2, 10.66, on='=')
for c in range(W0, W1 + 1):
    painted[('h', c, 9)] = 'yellow'

# ---------------------------------------------------------------- the bus stop
lv.area('the bus stop')
must('bus_shelter', BUS[0] + 11.0, 8.97)
must('sign_bus', BUS[0] + 7.4, 10.6)
must('trash_can', BUS[0] + 13.6, 8.6)
must('bench', BUS[0] + 16.2, 8.5)
lv.paint('road_bus', BUS[0] + 13.2, LANES[0], 270)
lv.paint('road_stop', BUS[0] + 9.0, LANES[0], 270)
for c in range(BUS[0] + 3, BUS[0] + 19):
    painted[('h', c, 11)] = 'red'
lv.paint('road_patch_a', BUS[0] + 10.0, 12.2)

# ---------------------------------------------------------------- the yard's gate
lv.area('the yard')
lv.paint('hatch_yard', (YARD[0] + YARD[1] + 1) / 2, 10.0)
lv.paint('road_keep', YARD[0] - 2.2, LANES[1], 90)
lv.paint('road_clear', YARD[0] + 0.3, LANES[1], 90)
lv.paint('road_keep', YARD[1] + 3.2, LANES[0], 270)
lv.paint('road_clear', YARD[1] + 0.7, LANES[0], 270)
for c in range(YARD[0] - 1, YARD[1] + 2):
    low.add(('h', c, 9))
for c in list(range(YARD[0] - 6, YARD[0] - 1)) + list(range(YARD[1] + 2, YARD[1] + 7)):
    painted[('h', c, 9)] = 'yellow'
must('sign_noparking', YARD[0] - 1.4, 8.7)
must('sign_noparking', YARD[1] + 2.4, 8.7)

# ---------------------------------------------------------------- the end: the way to the freeway
lv.area('the freeway sign')
lv.prop('gantry_sign', 416.0, 13.0, 90)
lv.paint('road_arrow', 410.0, LANES[1])
lv.paint('road_arrow', 422.0, LANES[1])
for c in (408.5, 421.5, 427.5, 433.5, 439.5):
    if put('palm_tree', c, 9.8):
        lv.paint('tree_grate', c, 9.8)

# ---------------------------------------------------------------- the sidewalks
# What a street has, where it has it. Along the kerb (bolted: a car tears them off): lamps every 24 m on alternate
# sides, hydrants, signs, trees in their grates on the wide sidewalks. Against the walls: what the shops put out,
# benches, bins, a phone booth, vending machines (the loose things there, well back from the kerb: nothing is ever
# knocked into a lane before he comes). Never in front of a door, in an alley's mouth, on a crossing.
lv.area('street lamps')


def clear_of(col, spans, pad=1.5):
    return all(not (a - pad < col < b + 1 + pad) for (a, b) in spans)


JUNCTIONS = [(CORAL[0] - 4, CORAL[1] + 4), (CROSS[0] - 4, CROSS[1] + 4)]
MOUTHS_S = [(a, a + ALLEY_W - 1) for a in ALLEYS] + JUNCTIONS + [TERRACE]
MOUTHS_N = [YARD, N_ALLEY, (BUS[0] + 6, BUS[0] + 18), BRIDGE] + JUNCTIONS
for col in range(12, WS - 4, 12):
    north = (col // 12) % 2 == 1
    if not clear_of(col + 0.5, MOUTHS_N if north else MOUTHS_S) or within(col, (BRIDGE,)):
        continue
    dark = DARK[0] < col < DARK[1]
    if dark and (col // 24) % 2:
        continue                           # one lamp in two in the dark stretch
    row, deg = (n_kerb(col) - 0.28, 90) if north else (s_kerb(col) + 0.28, 270)
    put('streetlight', col + 0.5, row, deg, **({'flicker': 'broken'} if dark else {}))

lv.area('trees in their grates (the wide north sidewalks)')
for (a, b) in ((62, 98), (276, 312)):
    for c in range(a + 3, b, 9):
        if clear_of(c, MOUTHS_N, 2.5):
            lv.paint('tree_grate', c + 0.5, 9.9)
            put('street_tree', c + 0.5, 9.9)

lv.area('signs, hydrants, covers')
for (kind, c, r, deg) in (('sign_speed', 16.4, 16.3, 0), ('sign_noparking', 62.4, 10.6, 0), ('hydrant', 107.0, 8.55, 0),
                          ('sign_speed', 113.6, 16.3, 0), ('hydrant', 163.5, 16.4, 0), ('sign_noparking', 248.4, 10.6, 0),
                          ('hydrant', 274.0, 10.5, 0), ('sign_noparking', 313.5, 8.7, 0), ('hydrant', 320.5, 16.4, 0),
                          ('sign_speed', 406.5, 16.3, 0), ('hydrant', 444.0, 16.4, 0)):
    must(kind, c, r, deg)
for c in range(105, 110):
    painted[('h', c, 9)] = 'red'
for (c, r) in ((40.3, 14.9), (88.5, 12.4), (171.5, 14.6), (199.4, 12.0), (236.4, 15.0), (290.2, 12.6), (368.2, 14.4), (411.0, 12.3)):
    lv.dress('manholes', c, r)
for (kind, c, r, deg) in (('manhole_sq', 27.5, 16.9, 0), ('road_crack_a', 33.0, 12.2, 0), ('road_patch_c', 71.0, 14.6, 0),
                          ('manhole_sq', 80.2, 9.2, 90), ('road_crack_b', 92.5, 12.6, 0), ('road_patch_a', 121.0, 14.7, 0),
                          ('valve_cap', 107.0, 9.6, 0), ('road_crack_a', 130.0, 14.4, 180), ('road_patch_b', 168.0, 12.1, 0),
                          ('road_crack_b', 181.0, 14.2, 90), ('road_patch_c', 196.0, 14.9, 0), ('road_crack_a', 222.0, 14.6, 0),
                          ('road_patch_a', 243.0, 14.6, 0), ('manhole_sq', 265.5, 9.3, 0), ('road_crack_b', 284.0, 13.0, 0),
                          ('road_patch_c', 297.5, 12.3, 0), ('road_crack_a', 318.0, 12.4, 180), ('road_patch_b', 352.0, 14.8, 0),
                          ('road_crack_a', 365.0, 12.3, 0), ('road_patch_a', 381.0, 12.3, 0), ('manhole_sq', 407.0, 9.0, 0),
                          ('road_crack_b', 413.0, 13.6, 0), ('road_patch_c', 436.0, 14.6, 0), ('valve_cap', 163.5, 15.6, 0),
                          ('valve_cap', 320.5, 15.6, 0), ('valve_cap', 274.0, 11.5, 0)):
    lv.paint(kind, c, r, deg)
for c in range(18, WS - 6, 34):                        # drains in the gutters, both sides
    if clear_of(c, JUNCTIONS, 3):
        lv.paint('drain', c + 0.5, n_kerb(c) + 8 / 32)
        lv.paint('drain', c + 9.5, s_kerb(c + 9) - 8 / 32)


def doors_of(shops):
    return [x + d + 0.5 for (x, w, k, d, f) in shops]


lv.area('north sidewalk: against the walls (the wide ones)')
doors = doors_of(north_shops)
for (a, b) in ((62, 98), (276, 312), (404, 446)):
    col = a + 2.0
    kinds = ['bench', 'trash_can', 'sandwich_board', 'vending', 'bench', 'plant', 'news_box', 'bench', 'ash_urn', 'fruit_stand']
    while col < b - 2:
        if all(abs(col - d) > 1.6 for d in doors) and clear_of(col, MOUTHS_N):
            kind = kinds.pop(0) if kinds else 'bench'
            put(kind, col, 8.52 if kind != 'vending' else 8.4, 0)
            if kind == 'bench':
                put('trash_can', col + 1.2, 8.5)
        col += rng.uniform(4.5, 7.5)

lv.area('south sidewalk: against the walls')
S_WALL = ['sandwich_board', 'bench', 'vending', 'plant', 'fruit_stand', 'trash_can', 'ash_urn', 'cardboard_box', 'bench',
          'paper_bundle', 'fruit_stand', 'crate', 'shopping_cart', 'phone_booth', 'bench', 'trash_can', 'sandwich_board']
S_DARK = ['bin_bag', 'bin_bag', 'crate', 'crate', 'trash_can', 'keg', 'cardboard_box']   # (no barrel on his way: a death nobody told)
doors = doors_of(south_shops) + [D0 + 15.5]
order = list(S_WALL)
col = 4.0
while col < WS - 6:
    col += rng.uniform(3.2, 6.0)
    f = s_face(int(col))
    if f - s_kerb(int(col)) < 2 or f != s_face(int(col - 1.4)) or f != s_face(int(col + 1.4)):
        continue                           # a sidewalk a metre wide (behind a parking row): left clear
    if any(abs(col - d) < 1.5 for d in doors) or not clear_of(col, MOUTHS_S, 1.2) or D0 - 1 < col < D1 + 1:
        continue
    dark = DARK[0] < col < DARK[1]
    if not order:
        order = list(S_WALL)
        rng.shuffle(order)
    kind = rng.choice(S_DARK) if dark else order.pop(0)
    put(kind, col, f - 0.42 - (0.1 if kind in ('vending', 'phone_booth') else 0), 180)
# the diner's front: a phone booth, news boxes in a row, benches, a bin, a vending machine
lv.area('the diner\'s front')
for (kind, c, r, deg) in (('phone_booth', D0 - 1.6, 17.5, 180), ('news_box', D0 + 2.0, 16.45, 0), ('news_box', D0 + 2.6, 16.45, 0),
                          ('news_box', D0 + 3.2, 16.45, 0), ('bench', D0 + 10.5, 17.6, 0), ('trash_can', D0 + 12.6, 17.6, 0),
                          ('bench', D0 + 19.0, 17.6, 0), ('vending', D0 + 26.4, 17.5, 180)):
    put(kind, c, r, deg)
# shop awnings over the windows (never over the pier and its sign): torn down by a car along the fronts (Drive `canopy`)
lv.area('shop awnings')
AWNINGS = ('awning_red', 'awning_green', 'awning_blue', 'awning_wine')
for (north, shops) in ((True, north_shops), (False, south_shops)):
    for (x, w, kind, door, face) in shops:
        pier = (w - 2) // 2 if door else max(1, (w - 1) // 2)
        runs = [(1 if door == 0 else 0, pier), (pier + 2, w - 1 if door == w - 1 else w)]
        a, b = max(runs, key=lambda r: r[1] - r[0])
        if b - a < 3 or rng.random() < 0.3:
            continue
        lv.prop(rng.choice(AWNINGS), x + (a + b) / 2, 8.56 if north else face - 0.56, 0 if north else 180)
lv.dress('papers', 0, 8, WS - 1, 8, 20)
lv.dress('papers', 0, 16, WS - 1, 17, 40)
lv.dress('papers', 0, 11, WS - 1, 15, 24)

# ---------------------------------------------------------------- the dark stretch
lv.area('the dark stretch: the fence, the vacant lot')
for x in range(LOT[0], LOT[1] + 1):
    if x not in (LOT[0] + 31, LOT[0] + 32):                   # a gap somebody cut in it
        lv.prop('chain_fence', x + 0.5, 7.94)
for (kind, c, r, deg, opt) in (('dumpster', LOT[0] + 4.0, 5.0, 12, {}), ('car2', LOT[0] + 14.0, 4.6, 205, {'lights': False}),
                               ('barrel', LOT[0] + 20.2, 6.8, 0, {}), ('barrel', LOT[0] + 21.0, 6.5, 0, {}), ('crate', LOT[0] + 22.4, 6.6, 20, {}),
                               ('van', LOT[0] + 40.0, 3.8, 172, {'lights': False}), ('dumpster', LOT[0] + 50.5, 6.2, 0, {}),
                               ('barrel', LOT[0] + 53.4, 6.9, 0, {}), ('crate', LOT[0] + 58.0, 5.5, 40, {}), ('crate', LOT[0] + 58.8, 6.2, 10, {}),
                               ('car', LOT[0] + 62.0, 5.2, 160, {'lights': False})):
    put(kind, c, r, deg, on='~"', **opt)
lv.area('the dark stretch: the blind walls (south)')
x = DARK[0] + 2.0
while x < DARK[1] - 4:
    kind = rng.choice(('flyers', 'flyers', 'conduit', 'pipe_steam', 'wall_vent', 'pipe_water'))
    half = {'flyers': 0.4, 'conduit': 0.75, 'pipe_steam': 1.5, 'pipe_water': 1.5, 'wall_vent': 0.25}[kind]
    c = x + half
    if all(c + half < a - 0.2 or c - half > a + ALLEY_W + 0.2 for a in ALLEYS):
        lv.prop(kind, c, 17.93 if kind != 'flyers' else 17.94, 180)
    x += half * 2 + rng.uniform(2.0, 6.0)

# ---------------------------------------------------------------- the alleys
lv.area('alleys (the one at col 138 kept clear: event 1)')
for a in ALLEYS:
    for c in range(a, a + ALLEY_W):
        low.add(('h', c, 16))                                 # the kerb dropped across its mouth
    if a == EVENT_ALLEY:
        continue
    lv.prop('dumpster', a + 0.8, 22.2, 90)
    lv.prop('trash_can', a + 3.3, 21.5)

# ================================================================ PART TWO: the works, the detour, the on-ramp
# (docs/LEVEL2.md "Segment 1, part two", its table). Works shut the street past the side street's mouth; the script
# (the level's `bends`, systems/Route.js) takes the car right down the side street (+y), under the freeway's bridge,
# and left at its foot onto LEG 1: the frontage road, one way east at the foot of the freeway's bank, that leaves its
# sheds for an embankment of its own as the on-ramp and meets the freeway's lanes before the toll. Built after the
# street (its dice all thrown: the street is the same one); what stood where the side street now runs is taken away.
# Leg 1's cross-section (rows): the freeway's asphalt 34-40 (its lanes 35.5-38 and 38-40.5, its edge lines on 35.5
# and 40.5, its guardrails on 33.85 and 41.15), its bank 41-42 (grass), the road 43-47, then the south sidewalk 48-49
# and the sheds' fronts on row 50 (the frontage road), or the shoulder 48 and the ramp's own bank (the on-ramp).
S0, S1 = SIDE
R0, R1 = ROAD1
F0, F1 = FWY
M0, M1 = MERGE
DOCK_S = (453, 464)          # the cold store's loading bays on the frontage road (south, cols)
YARD_S = (468, 471)          # the opening of the yard gate south of it (cols)
YARD_E = (452, 457, 25, 29)  # the yard behind its gate on the side street (east): cols, rows
lv.area('part two: the ground')
for (x0, y0, x1, y1, t) in (
        (WS, 8, DEAD - 1, 10, 's'), (WS, 11, DEAD - 1, 15, '='), (WS, 16, DEAD - 1, 17, 's'),   # the street, on under the works
        (LEG1_W, F0 - 1, TOLL_X - 1, F0 - 1, '"'), (LEG1_W, F0, TOLL_X - 1, F1, '='),           # the freeway on its bank
        (LEG1_W, F1 + 1, TOLL_X - 1, R0 - 1, '"'), (M0, F1 + 1, TOLL_X - 1, R0 - 1, '='),       # the bank; the gore
        (S0 - 3, 18, S0 - 3, HS - 1, 'X'),                                                       # a blind wall for the shops cut
        (S0 - 2, 16, S1 + 2, R0 - 1, 's'), (S0, 16, S1, R0 - 1, '='),                            # the side street
        (DECK[0] + 1, F0 - 1, S0 - 3, F1, '_'), (S1 + 3, F0 - 1, DECK[1] - 2, F1, '_'),         # its abutments, under the deck
        (YARD_E[0], YARD_E[2], YARD_E[1], YARD_E[3], '_'),                                       # the yard behind the gate
        (LEG1_W, R0, TOLL_X - 1, R1, '='),                                                       # the frontage road, the ramp
        (LEG1_W, R1 + 1, RAMP_X - 1, R1 + 2, 's'),                                               # its south sidewalk
        (RAMP_X, R1 + 1, TOLL_X - 1, R1 + 1, '='), (RAMP_X, R1 + 2, TOLL_X - 1, R1 + 4, '"'),   # the ramp's shoulder, its bank
        (RAMP_X, R1 + 5, TOLL_X - 1, H - 1, '~'),                                                # waste ground at its foot
        (YARD_S[0], R1 + 3, YARD_S[1], R1 + 3, '_'), (YARD_S[0] - 2, R1 + 4, YARD_S[1] + 3, H - 1, '_')):   # the yard south
    lv.fill(x0, y0, x1, y1, t)
lv.props[:] = [p for p in lv.props if not (S0 - 2.4 < p[2] < S1 + 3.4 and 15.5 < p[3] < HS + 1)]
boxes[:] = [b for b in boxes if not (b[2] > S0 - 2.4 and b[0] < S1 + 3.4 and b[3] > 15.5)]
# the big rounded corners of the side street's two mouths (lay_kerbs), the kerbs dropped where a lorry turns in
corners.update({(S0, 16): 'ne', (S1 + 1, 16): 'nw', (S0, R0): 'se', (S1 + 1, R0): 'sw'})
low.update(('v', S0, r) for r in range(28, 33))                          # the loading dock's apron (west)
low.update(('v', S1 + 1, r) for r in range(YARD_E[2], YARD_E[3] + 1))    # the yard's gate (east)
low.update(('h', c, R1 + 1) for c in list(range(DOCK_S[0], DOCK_S[1] + 1)) + list(range(YARD_S[0], YARD_S[1] + 1)))
low.update(('h', c, 11) for c in list(range(441, 445)) + list(range(447, 451)))   # the tyre shop's two doors (north)


def pieces(kind, c0, c1, row, step=3.0, deg=0):
    """A line painted in lengths of `step` tiles end to end from c0 to c1 on `row` (edge lines, a rumble strip)."""
    c = c0
    while c + step <= c1 + 0.01:
        lv.paint(kind, c + step / 2, row, deg)
        c += step


def dashes(c0, c1, row, gap, kind='lane_dash_long', at=0, length=3.0):
    """A mark (3 m dashes) every `gap` tiles from c0 to c1 on `row`, in step with column `at`."""
    c = c0 + (at - c0) % gap
    while c + length <= c1 + 0.01:
        lv.paint(kind, c + length / 2, row)
        c += gap


def slant(kind, a, b, gap=3.0, dash=3.0):
    """Lengths of paint `dash` tiles long every `gap` along the slanted line from a to b (the freeway's lanes coming
    in), each turned along it."""
    n, deg = math.dist(a, b), math.degrees(math.atan2(b[1] - a[1], b[0] - a[0]))
    t = 0.0
    while t + dash <= n + 0.01:
        m = (t + dash / 2) / n
        lv.paint(kind, a[0] + (b[0] - a[0]) * m, a[1] + (b[1] - a[1]) * m, round(deg, 2))
        t += gap


def rail(kind, c0, c1, row, deg, on='"'):
    """Lengths of a guardrail or a fence laid end to end (touching, not overlapping) from c0 to c1 on `row`."""
    n = SIZES[kind][0] / 32
    c = c0
    while c + n <= c1 + 0.01:
        assert lv.tiles[int(row)][int(c + n / 2)] in on, f'{kind} at {c + n / 2},{row}'
        boxes.append(Level.box(kind, c + n / 2, row, deg))
        lv.prop(kind, c + n / 2, row, deg)
        c += n


# ---------------------------------------------------------------- the works across the street
# The gas main's trench taken on across the whole street past the side street's mouth: DETOUR told from col 424
# (signs both sides, the arrow painted twice in our lane: on, then right), then cones tapering both lanes into the side
# street, an arrow board pointing down it, ROAD CLOSED with its flashers, water barriers, the road cut, the excavator
# and the dump truck parked for the night, three lighting towers, the site fenced along both kerbs. The tyre shop on
# the north corner has its shutters down.
lv.area('part two: DETOUR told')
must('sign_detour', 424.5, 9.15, 0)
must('sign_detour', 431.5, 16.6, 0)
must('sign_detour', S0 - 3.2, 16.6, 0)
lv.paint('detour_arrow_paint', 424.0, LANES[1])
lv.paint('detour_arrow_paint', 433.5, LANES[1])
lv.area('part two: the works')
for (c, r) in ((446.7, 11.45), (447.45, 12.25), (448.2, 13.05), (448.95, 13.85), (449.7, 14.65), (450.45, 15.45)):
    must('traffic_cone', c, r, on='=')                                    # the taper: both lanes into the side street
must('arrow_board', 449.35, 12.3, 270, on='=')                           # (its arrows down the side street)
must('road_closed', WORKS_X + 0.1, 13.5, 90, on='=')
for r in (11.95, 13.8, 15.65):
    must('water_barrier', WORKS_X + 1.6, r, 90, on='=')
must('barricade', WORKS_X + 2.45, 16.95, 90)                              # the south sidewalk shut too
lv.paint('road_cut', WORKS_X + 5.0, 12.25)                               # (the plant right behind the barriers: seen
lv.paint('road_cut', WORKS_X + 5.0, 14.75)                               # from the turn, which sees no further)
lv.paint('road_cut', WORKS_X + 9.0, 12.25)
lv.paint('steel_plate', WORKS_X + 9.2, 14.6)
lv.paint('sand_pile', WORKS_X + 14.6, 15.1)
lv.paint('asphalt_pile', WORKS_X + 14.0, 12.0, 30)
must('excavator', WORKS_X + 6.6, 12.3, 180, on='=')                     # on the milled band, its bucket at the barriers
must('dump_truck', WORKS_X + 8.9, 14.9, 180, on='=')                    # waiting to be loaded
must('works_light', 449.6, 9.35, 0)                                       # their floods along the works
must('works_light', WORKS_X + 4.0, 16.95, 0)
must('works_light', DEAD - 3.0, 9.35, 180)
for c in range(int(WORKS_X) + 3, DEAD - 4, 4):
    put('site_fence', c + 1.8, 10.86, 0)
    put('site_fence', c + 1.8, 16.3, 0)
for r in (11.95, 15.05):
    must('jersey_barrier', DEAD - 1.0, r, 90, on='=')
must('sign_works', 446.4, 8.75, 0)
lv.area('part two: the tyre shop on the north corner, shut')
for c in (442.5, 448.5):
    lv.prop('roller_door', c, 8.07, 0)
    lv.prop('wall_lamp', c + 2.05, 8.06, 0)
lv.paint('oil_stain_b', 442.6, 10.2)
lv.paint('oil_stain_a', 448.0, 10.4, 90)
lv.prop('flyers', 445.5, 8.06, 0)

# ---------------------------------------------------------------- the side street
# Light industry, eight metres of asphalt and two sidewalks, two-way, no line: a shed with its shutter and a loading
# dock (west), a yard behind its chain-link gate with a car in it (east), pipes on the blind walls, two sodium lamps,
# patches and a cover breathing steam, the freeway's bridge over its foot. STOP for whoever comes up it to the street,
# STOP for whoever comes down it to the frontage road (one way east: ONE WAY across the way).
lv.area('part two: the side street, west')
lv.prop('pipe_steam', S0 - 1.93, 19.6, 270)
must('dumpster', S0 - 1.4, 21.6, 90)
put('bin_bag', S0 - 0.55, 20.25)
put('bin_bag', S0 - 0.5, 22.9)
put('streetlight', S0 - 0.28, 24.0, 0)
lv.prop('roller_door', S0 - 1.93, 26.2, 270)
lv.prop('graffiti', S0 - 1.93, 23.0, 270)
for (c, r) in ((S0 - 1.45, 27.65), (S0 - 0.7, 27.5)):
    put('oil_drum', c, r)
lv.prop('roller_door', S0 - 1.93, 30.6, 270)
must('loading_dock', S0 - 1.64, 30.6, 270)
put('pallet_stack', S0 - 0.75, 32.6, 90)
lv.paint('oil_stain_a', S0 - 0.7, 29.6, 90)
lv.area('part two: the side street, east')
lv.prop('conduit', S1 + 2.93, 19.4, 90)
lv.prop('pipe_water', S1 + 2.93, 21.6, 90)
lv.prop('wall_lamp', S1 + 2.93, 24.0, 90)
must('chainlink_gate', S1 + 3.12, (YARD_E[2] + YARD_E[3] + 1) / 2, 90, on='_')
must('car2', YARD_E[1] - 1.6, 27.4, 90, on='_', lights=False)
put('pallet_stack', YARD_E[0] + 1.2, YARD_E[2] + 0.6, on='_')
put('oil_drum', YARD_E[0] + 1.0, YARD_E[3] + 0.45, on='_')
put('oil_drum', YARD_E[0] + 1.6, YARD_E[3] + 0.6, on='_')
put('streetlight', S1 + 1.28, 30.6, 180)
put('trash_can', S1 + 2.45, 31.6)
lv.prop('flyers', S1 + 2.94, 31.5, 90)
lv.area('part two: the side street, its paint and its covers')
for c in (S1 - 2.75, S1 - 1.25):                                         # STOP before the street (northbound half)
    lv.paint('stop_line', c, 17.6, 90)
lv.paint('road_stop', S1 - 2.0, 19.5)
must('sign_stop', S1 + 1.6, 17.55, 0)
for c in (S0 + 1.25, S0 + 2.75):                                         # STOP before the frontage road (southbound)
    lv.paint('stop_line', c, R0 - 0.6, 90)
lv.paint('road_stop', S0 + 2.0, R0 - 2.4, 180)
must('sign_stop', S0 - 0.75, R0 - 0.7, 180)
must('sign_oneway', S0 + 3.0, R1 + 1.45, 0)                             # across the way: ONE WAY, east
must('sign_oneway', S1 + 1.7, R0 - 0.65, 0)
for (kind, c, r, deg) in (('road_patch_a', 444.4, 22.8, 90), ('road_crack_b', 448.2, 26.6, 0), ('road_patch_c', 443.6, 30.4, 0),
                          ('road_patch_b', 446.6, 35.2, 90), ('road_crack_a', 444.0, 38.8, 180), ('drain', S0 + 0.25, 21.0, 90),
                          ('drain', S1 + 0.75, 28.0, 90), ('manhole_sq', 445.0, 32.5, 90)):
    lv.paint(kind, c, r, deg)
lv.dress('manholes', 447.7, 24.6)
lv.dress('papers', S0 - 2, 18, S1 + 2, 33, 9)
lv.cat(S1 + 1.6, 33.0)
lv.area('part two: the freeway\'s bridge over the side street')
lv.prop('overpass', (DECK[0] + DECK[1]) / 2, (F0 - 0.5 + F1 + 1.5) / 2)
lv.paint('overpass_shadow', (DECK[0] + DECK[1]) / 2, (F0 - 0.5 + F1 + 1.5) / 2)
lv.roof('ac_unit', 436.8, 26.6)
lv.roof('vent', 437.2, 23.4)
lv.roof('duct', 455.0, 20.8)
lv.roof('vent', 455.2, 31.6)

# ---------------------------------------------------------------- the freeway on its bank (north of leg 1)
# Two lanes east, its edge lines yellow (left) and white (right), its dashes every 12 m; a guardrail along each side of
# it, its bank down to the frontage road in grass, its lamps on the bank with an arm over it and one over us. Where the
# ramp meets it (MERGE) its lanes come in alongside ours over 24 m, the gore painted out between.
lv.area('part two: the freeway')
for (c0, c1) in ((LEG1_W, DECK[0]), (DECK[1], M0)):
    pieces('edge_line_yellow', c0, c1, F0 + 1.5)
    pieces('edge_line', c0, c1, F1 + 0.5)
    dashes(c0, c1, F0 + 4.0, 12, at=432)
    rail('guardrail', c0, min(c1, DECK[1] + 16) - 1, F0 - 0.15, 0)        # (its far side seen from the side street only)
    rail('guardrail', c0, c1 - 1, F1 + 1.15, 180)
slant('edge_line_yellow', (M0, F0 + 1.5), (M1, F0 + 4.0))
slant('lane_dash_long', (M0, F0 + 4.0), (M1, F1 + 0.5), gap=12)
lv.paint('gore_taper', (M0 + M1) / 2, F1 + 0.5 + (84 / 2 - 2) / 32)
pieces('edge_line_yellow', M1, TOLL_X, F0 + 4.0)
dashes(M1, TOLL_X, F1 + 0.5, 12, at=432)
dashes(M1, TOLL_X, R0, 12, at=438)
for c in (470.5, 500.5):
    must('highway_lamp', c, F1 + 1.75, 90, on='"')

# ---------------------------------------------------------------- leg 1: the frontage road
# One way east, two lanes, a white dash between them every 9 m, the yellow edge line along its north kerb (the bank
# above it); on the south side sheds and docks: a body shop, a blind warehouse opposite the side street, the cold
# store's two loading bays (the kerb dropped along them), a yard behind its gate, a long shed with its pipes; sodium
# lamps on the south sidewalk; FREEWAY ENTRANCE where the sheds end.
lv.area('part two: the frontage road, its paint')
pieces('edge_line_yellow', LEG1_W, S0 - 2, R0 + 0.08)                   # (broken across the side street's mouth)
pieces('edge_line_yellow', S1 + 3, M0, R0 + 0.08)
dashes(LEG1_W, RAMP_X, R0 + 2.5, 9, at=455)
dashes(RAMP_X, TOLL_X, R0 + 2.5, 12, at=438)
for c in list(range(LEG1_W, S0 - 2 - 3, 4)) + list(range(S1 + 3, RAMP_X - 3, 4)):   # the kerb under the bank
    lv.paint('kerb_s_4', c + 2.0, R0 - 1 / 32)
for (kind, c, r, deg) in (('road_patch_c', 457.5, 44.3, 0), ('road_crack_a', 463.0, 46.9, 0), ('manhole_sq', 475.2, 45.4, 0),
                          ('road_patch_b', 481.0, 46.6, 0), ('road_crack_b', 489.5, 44.0, 90), ('drain', 466.5, R1 + 1 - 8 / 32, 0),
                          ('drain', 490.5, R1 + 1 - 8 / 32, 0), ('oil_stain_b', 458.0, 48.9, 0), ('oil_stain_a', 461.5, 49.2, 0),
                          ('road_arrow', 462.0, LANES1[0], 0), ('road_arrow', 462.0, LANES1[1], 0)):
    lv.paint(kind, c, r, deg)
lv.dress('manholes', 484.6, 44.6)
lv.area('part two: the frontage road, its south side')
for c in (428.5, 433.5):                                                  # the body shop
    lv.prop('roller_door', c, R1 + 2.93, 180)
    low.update(('h', k, R1 + 1) for k in range(int(c) - 1, int(c) + 2))
lv.prop('flyers', S0 - 0.5, R1 + 2.94, 180)                              # the warehouse opposite the side street
lv.prop('conduit', S0 + 6.0, R1 + 2.93, 180)
must('hydrant', S1 + 0.4, R1 + 1.45)
lv.paint('valve_cap', S1 + 0.4, R1 + 0.7)
for c in (DOCK_S[0] + 2.5, DOCK_S[0] + 7.5):                             # the cold store's two bays
    lv.prop('roller_door', c, R1 + 2.93, 180)
    must('loading_dock', c, R1 + 2.64, 180)
put('pallet_stack', DOCK_S[0] - 0.35, R1 + 2.4)
put('pallet_stack', DOCK_S[1] - 1.0, R1 + 2.45, 90)
put('oil_drum', DOCK_S[1] + 0.3, R1 + 2.6)
must('chainlink_gate', (YARD_S[0] + YARD_S[1] + 1) / 2, R1 + 3.12, 0, on='_')
for (kind, c, r, deg) in (('pallet_stack', 467.4, 51.6, 10), ('oil_drum', 472.8, 51.4, 0), ('oil_drum', 473.4, 51.9, 0),
                          ('crate', 470.6, 53.2, 20), ('dumpster', 466.9, 54.0, 0)):
    put(kind, c, r, deg, on='_')
lv.prop('pipe_water', 480.0, R1 + 2.93, 180)                             # the long shed
lv.prop('wall_vent', 483.6, R1 + 2.93, 180)
lv.prop('roller_door', 487.5, R1 + 2.93, 180)
lv.prop('wall_lamp', 490.2, R1 + 2.94, 180)
lv.prop('graffiti', 477.0, R1 + 2.94, 180)
low.update(('h', k, R1 + 1) for k in range(486, 490))
put('dumpster', 476.4, R1 + 2.4, 0)
for (kind, c, r) in (('bin_bag', 478.0, 49.45), ('cardboard_box', 474.6, 49.5), ('oil_drum', 491.5, 49.45), ('bin_bag', 452.8, 49.5)):
    put(kind, c, r)
for c in (458.5, 482.5):
    must('streetlight', c, R1 + 1.28, 270)
must('sign_freeway', RAMP_X - 3.0, R1 + 1.7, 0)
lv.dress('papers', LEG1_W, R1 + 1, RAMP_X - 1, R1 + 2, 12)
lv.cat(472.3, 49.5)
for (kind, c, r) in (('ac_unit', 430.6, 52.6), ('vent', 437.2, 51.8), ('duct', 446.0, 52.2), ('chimney', 452.8, 53.4),
                     ('ac_unit', 459.4, 52.4), ('vent', 462.6, 51.9), ('hatch', 478.6, 52.6), ('ac_unit', 484.2, 52.2),
                     ('vent', 489.0, 51.8), ('duct', 492.8, 53.2)):
    lv.roof(kind, c, r)                                                   # on the sheds' flat roofs

# ---------------------------------------------------------------- leg 1: the on-ramp and the merge
# The sheds end: the road climbs onto an embankment of its own: a paved shoulder with its rumble strip, the white edge
# line, a guardrail along the top of the bank (its end toward whoever comes), delineators either side, WRONG WAY for
# whoever comes up it the wrong way, SPEED LIMIT 55, TOLL 1/2 MILE; the freeway's lanes come in alongside (the gore),
# MERGE painted in our left lane; waste ground at the foot of the bank (off the picture).
lv.area('part two: the on-ramp')
pieces('edge_line', RAMP_X, TOLL_X, R1 + 0.92)
pieces('rumble_strip', RAMP_X + 1, TOLL_X, R1 + 1.45)
must('guardrail_end', RAMP_X - 0.1, R1 + 2.15, 0, on='"s')
rail('guardrail', RAMP_X + 1, TOLL_X, R1 + 2.15, 180)
for c in range(RAMP_X + 2, TOLL_X - 2, 4):
    put('reflector_post', c + 0.5, R1 + 1.86, on='=')
for c in range(RAMP_X + 2, M0 - 1, 4):
    put('reflector_post', c + 0.5, R0 - 0.3, on='"')
# (the signs stand at the shoulder's edge, read at a glance: the bank beyond is off the picture)
must('sign_wrong_way', RAMP_X + 7.0, R1 + 1.7, 270, on='=')
must('sign_wrong_way', RAMP_X + 7.0, R0 - 0.65, 270, on='"')
must('sign_speed_55', RAMP_X + 13.0, R1 + 1.7, 0, on='=')
must('sign_toll_ahead', RAMP_X + 21.0, R1 + 1.7, 0, on='=')
for c in (515.5, 545.5):
    must('highway_lamp', c, R1 + 2.65, 90, on='"')
lv.paint('merge_arrow', M0 + 15.0, LANES1[0])
dashes(RAMP_X, TOLL_X, R0 + 0.08, 12, kind='raised_marker_yellow', at=444, length=0.25)
dashes(RAMP_X, TOLL_X, R0 + 2.5, 12, kind='raised_marker', at=444, length=0.25)
for (kind, c, r, deg) in (('road_crack_a', 506.0, 46.4, 0), ('road_patch_b', 519.5, 44.4, 0), ('road_crack_b', 538.0, 47.0, 90),
                          ('road_patch_c', 552.0, 45.0, 0)):
    lv.paint(kind, c, r, deg)

# ---------------------------------------------------------------- THE TOLL (cols 560 on; docs/LEVEL2.md segment 2)
# The four lanes side by side the merge leaves (the freeway's two, leg 1's two) spread to the plaza's grid
# under its lit roof (four lanes of 3 m between five islands of 1.5 m: TOLL_LANES in tools/generate_assets.py), each
# lane shut at the islands' end by a gate: a wooden arm (it flies: a small cost) or a steel boom (nose-on, the crash),
# told by its lane's signal over the island (a green arrow, a red X), the gates themselves, and by the chase (systems/
# Toll.js: bone arrows down the wooden lanes, red chevrons at the edge for the steel ones, 1.5 s out). Past the
# plaza they spread back to 2.5 m, the outer two merge in, and the freeway starts on the middle two. A freeway:
# no sidewalks, no kerbs; paved shoulders, guardrails along the grass verges, tall lamps.
TOLL0 = TOLL_X              # the toll's ground from this column on (what leg 1 had there is taken away)
FAN = (587, 603)            # the four spread to the plaza's grid, the outer edges out to the outer islands' noses
NOSE = 603.0                # the islands' noses (8 m long: to col 611); a crash cushion before each
CANOPY_X = 608.0            # the roof's middle (6 m along the road: cols 605-611)
GATE_X = 611.1              # the gates, at the islands' ends (the roof's exit)
AFTER = (611, 627)          # the four lanes spread back to 2.5 m (the fan turned round)
PLAZA_TO = 613              # the plaza's leg ends just past the gates (CHASE.toll.past: theirs go for their slots)
DROP = (640, 652)           # the outer two end: merge arrows before, a hatched gore over each
RAIL = (35.88, 50.12)       # the guardrails' rows: along the four lanes, the plaza's wide shoulders, the freeway's two
RAIL_PLAZA = (30.88, 55.12)
RAIL_FWY = (38.88, 47.12)
MID = 43.0                  # the road's middle row all the way (the four lanes' at col 559)
TOLL_CRUISE = 13.3          # px/step: 90 km/h
APPROACH = (39.25, 41.75, 44.25, 46.75)                               # four lanes of 2.5 m: the freeway's two, leg 1's two
PLAZA = tuple(MID - 10 + y / 32 for y in (104, 248, 392, 536))        # the plaza's lanes: 36.25, 40.75, 45.25, 49.75
ISLANDS = tuple(MID - 10 + y / 32 for y in (32, 176, 320, 464, 608))  # 34, 38.5, 43, 47.5, 52
FREEWAY = (41.75, 44.25)    # the freeway's start past it: the middle two
# lane by lane, north first (fixed by design, the level's `chase.toll.gates`): ours (leg 1's south lane, the fourth
# here) is shut: he has to steer, a lane up, to a wooden arm; his other lane of leg 1 is wooden, the freeway's two
# wood and steel
GATES = ('wood', 'steel', 'wood', 'steel')
ACROSS = ('gate_arm_wood', 'gate_steel')   # what stands across a lane on purpose (check_lanes)

lv.area('the toll: its ground (a freeway: paved shoulders, grass verges)')
lv.props[:] = [p for p in lv.props if p[2] < TOLL0 - 0.5]         # (leg 1's lamps carried on past it: the toll's now)
lv.floor[:] = [f for f in lv.floor if f[1] < TOLL0]
lv.fill(TOLL0, 27, W - 1, H - 2, '"')
for (x0, x1, r0, r1) in ((TOLL0, FAN[0] - 1, 36, 49), (FAN[0], AFTER[1] - 1, 31, 54), (AFTER[1], DROP[1] - 1, 36, 49),
                         (DROP[1], W - 1, 39, 46)):
    lv.fill(x0, r0, x1, r1, '=')
for (x, y) in ((566, 32), (574, 52), (591, 28), (633, 52), (659, 35), (684, 49), (618, 57)):   # the verge worn bare in patches
    lv.fill(x, y, x + 2, y + 1, '~')

lv.area('the toll: the paint (the lanes spreading to the plaza and back, merging)')
lv.paint('plaza_fan', FAN[0] + 8.0, MID)                              # 2.5 m lanes to the plaza's 4.5 m, edges to the islands
lv.paint('plaza_fan', AFTER[0] + 8.0, MID, 180)                       # and back
lv.paint('lane_taper', DROP[0] + 6.0, MID, 180)                       # the outer two end
for (a, b, rows) in ((TOLL0, FAN[0], (38.0, 48.0)), (AFTER[1], DROP[0], (38.0, 48.0)), (DROP[1], W - 1, (40.5, 45.5))):
    for c in range(a, b - 2, 3):                                      # the edge lines, solid
        for r in rows:
            lv.paint('edge_line', c + 1.5, r)
for (a, b, rows) in ((TOLL0, FAN[0], (40.5, MID, 45.5)), (AFTER[1], DROP[0], (40.5, MID, 45.5)), (DROP[1], W - 1, (MID,))):
    for c in range(a + 1, b - 3, 9):                                  # the lane lines: dashes of 3 m every 9
        for r in rows:
            lv.paint('lane_dash_long', c + 1.5, r)
            if c + 6 < b - 1:
                lv.paint('raised_marker', c + 6.0, r)                 # a cat's eye between two
for (k, r) in enumerate(APPROACH):
    lv.paint('toll_text', 576.0, r, 90)                               # TOLL in every lane, its number after
    lv.paint(f'toll_lane_{k + 1}', 581.5, r, 90)
for c in range(TOLL0, FAN[0] - 2, 3):                                 # the shoulders' rumble strips
    lv.paint('rumble_strip', c + 1.5, 37.67)
    lv.paint('rumble_strip', c + 1.5, 48.33)
lv.paint('merge_arrow_s', 633.5, APPROACH[0])                         # the outer two: merge in
lv.paint('merge_arrow', 633.5, APPROACH[3])
lv.paint('gore_hatch', DROP[1] - 4.0, APPROACH[0], 180)
lv.paint('gore_hatch', DROP[1] - 4.0, APPROACH[3], 180)
for (c, r) in ((566.5, 43.6), (584.0, 41.1), (597.0, 46.8), (608.5, 41.5), (621.0, 44.7), (645.0, 42.1), (663.0, 43.8)):
    lv.paint(('oil_stain_a', 'oil_stain_b', 'road_patch_a', 'oil_stain_b', 'road_crack_b', 'road_patch_c', 'oil_stain_a')[int(c) % 7], c, r)

lv.area('the toll: the plaza (islands, their cushions, the booths, the lane signals, the gates, the roof)')
for (i, r) in enumerate(ISLANDS):
    lv.prop('crash_cushion_narrow', NOSE - 84 / 64 - 0.05, r)          # (no wider than the island: never in a lane)
    lv.prop('toll_island', NOSE + 254 / 64, r)
    if i < 4:
        lv.prop('toll_booth', CANOPY_X, r)                            # the lane under it (+y) is its own
    if i > 0:                                                         # the lane above it: its signal
        lv.prop('lane_signal_go' if GATES[i - 1] == 'wood' else 'lane_signal_stop', NOSE + 1.4, r)
lv.prop('sign_exact_change', NOSE + 1.4, ISLANDS[0])
for (k, r) in enumerate(PLAZA):
    # across its lane from the island above it (its cabinet there): the arm's middle 11 px, the boom's 12 above the
    # lane's middle (its tip, its catch post just short of the island below)
    if GATES[k] == 'wood':
        lv.prop('gate_arm_wood', GATE_X, r - 11 / 32, 90)
    else:
        lv.prop('gate_steel', GATE_X, r - 12 / 32, 90)
lv.prop('toll_canopy', CANOPY_X, MID)
lv.patron('civ2', CANOPY_X + 1.2, 54.05, 270, 'smoke')               # one of the staff on the shoulder, on his break

lv.area('the toll: guardrails, lamps, signs')
# each run of rail starts with its end toward who comes; where the road narrows (past the plaza, at the lane drop) a
# car still out wide meets that end: there it is a crash cushion (it bursts, the rail's thin end behind it only
# clips him: never a death nobody told), not the terminal (`lasting`, as wide as a car's nose would need: the crash)
for (a, b, top, bottom, cushion) in ((TOLL0, FAN[0], *RAIL, False), (FAN[0], AFTER[1], *RAIL_PLAZA, False),
                                     (AFTER[1], DROP[1], *RAIL, True), (DROP[1], W - 1, *RAIL_FWY, True)):
    for r in (top, bottom):
        if cushion:
            lv.prop('crash_cushion', a + 84 / 64 + 0.05, r + (0.55 if r > MID else -0.55))
        else:
            lv.prop('guardrail_end', a + 30 / 32, r)
        for c in range(a + (3 if cushion else 2), b - 3, 4):
            lv.prop('guardrail', c + 2.0, r)
    for c in range(a + 3, b - 1, 6):
        lv.prop('reflector_post', c + 0.5, top - 0.35)
        lv.prop('reflector_post', c + 0.5, bottom + 0.35)
for (c, r) in ((563.5, 34.95), (579.5, 51.05), (594.5, 30.0), (598.5, 56.0), (633.5, 34.95), (648.5, 51.05),
               (664.5, 37.95), (680.5, 48.05), (695.5, 37.95)):
    lv.prop('highway_lamp', c, r, 90)                                 # its heads out over the road and the verge
for (kind, c, r) in (('sign_toll_ahead', 562.6, 51.0), ('sign_speed_55', 568.6, 35.2), ('sign_freeway', 656.6, 48.2),
                     ('sign_speed_55', 670.6, 38.2)):
    lv.prop(kind, c, r)

lv.area('the toll: Sunset Bay, 1985 (palms, hibiscus, the deco office and its trooper, the billboards, the wet)')
# MIAMI_PROPS (tools/generate_assets.py). What is seen of the plaza is its road (the view is 11 m high): the dressing
# is on it and at its edges. An art deco planter in flower at the end of each island past the gates (in the plaza's
# leg: between its lanes' bands), fan palms on the plaza's wide shoulders and along the verges with hibiscus at their
# feet, deco lamps by the roof, the toll office on the south shoulder before the islands with a trooper's car parked
# at it (the wheel kept off them: the plaza leg's `across`), a billboard for the Flamingo Motel (level 3) over the
# freeway's verge and a radio's on the approach's, rain standing in puddles with the neon in them, oil under each
# booth, rubber before each gate.
for (i, r) in enumerate(ISLANDS):
    lv.prop('planter_deco_pink' if i % 2 else 'planter_deco_teal', GATE_X + 1.2, r)
for (c, r, kind) in ((589.5, 32.3, 'palm_fan'), (597.0, 31.9, 'palm_fan_small'), (615.5, 32.2, 'palm_fan'),
                     (623.0, 32.6, 'palm_fan_small'), (603.2, 54.3, 'palm_fan_small'), (614.5, 53.7, 'palm_fan'),
                     (622.0, 54.1, 'palm_fan_small'), (567.0, 34.3, 'palm_fan'), (573.0, 51.8, 'palm_fan_small'),
                     (585.0, 34.2, 'palm_fan_small'), (631.0, 34.3, 'palm_fan'), (639.0, 51.8, 'palm_fan'),
                     (647.0, 34.4, 'palm_fan_small'), (657.0, 37.2, 'palm_fan'), (667.0, 48.7, 'palm_fan_small')):
    lv.prop(kind, c, r)
    inside = 588 <= c < 627                                            # (on the plaza's shoulder: toward its road, off the rail)
    lv.prop('hibiscus_bush' if int(c) % 2 else 'hibiscus_bush_red', c + 0.9, r + (0.5 if r > MID else -0.5) * (-1.2 if inside else 1))
for (c, r) in ((604.6, 32.7), (606.0, 53.4), (612.6, 32.7)):
    lv.prop('deco_lamp', c, r)
lv.prop('deco_office_pink', 591.0, 53.5)                               # its sign to the road
lv.prop('police_car', 597.2, 53.9)                                     # nobody in it, lights off
lv.prop('hibiscus_bush', 588.0, 51.9)
lv.prop('billboard_motel', 661.0, 48.9)                                # hung over the verge, read from the freeway
lv.prop('billboard_radio', 583.0, 51.6)
for (kind, c, r) in (('puddle_neon', 604.0, 41.4), ('puddle_neon_b', 613.6, 46.6), ('puddle_neon_b', 596.0, 37.8),
                     ('puddle_neon', 619.0, 39.9), ('puddle_neon_b', 590.5, 45.8), ('puddle_neon', 600.5, 52.6)):
    lv.paint(kind, c, r)
for (k, r) in enumerate(PLAZA):
    lv.paint('oil_stain_b' if k % 2 else 'oil_stain_a', CANOPY_X - 0.4 + (k % 2) * 0.9, r + 0.2)   # under each booth's lane
    lv.paint('skid_marks', GATE_X - 2.4 - (k % 2) * 0.8, r + (0.15 if k % 2 else -0.2))             # rubber before its gate

# its lights (the night section adds them): sodium pools on the fan and the fan back (they were dark), the neon of the
# roof's fascias on the road (pink in, teal out), each booth's window, the office's sign, the billboards' lamps
TOLL_LIGHTS = [[c, r, 7, '#ffb46a', 0.22] for (c, r) in ((590, 36.5), (590, 49.5), (598, 43.0), (617, 37.5), (617, 48.5), (624, 43.0))]
TOLL_LIGHTS += [[604.4, r, 5, '#ff4aa6', 0.3] for r in (38.5, 47.5)] + [[611.8, r, 5, '#38f0dc', 0.28] for r in (38.5, 47.5)]
TOLL_LIGHTS += [[CANOPY_X + 0.3, r + 0.9, 3, '#ffd890', 0.25] for r in ISLANDS[:4]]
TOLL_LIGHTS += [[591.0, 52.0, 4, '#38f0dc', 0.3], [661.0, 47.6, 6, '#ff8ac8', 0.2], [583.0, 50.4, 6, '#8af0e8', 0.2]]


def bend_line(pts, r, step=0.25):
    """The points along a bend's line (tiles), as systems/Outro.js routePath lays it: straight lines, each inner corner
    rounded off by an arc of radius r (shortened when the lines are too short for it)."""
    out, cur = [], tuple(pts[0])

    def line(a, b):
        n = max(1, int(math.dist(a, b) / step))
        out.extend((a[0] + (b[0] - a[0]) * i / n, a[1] + (b[1] - a[1]) * i / n) for i in range(n))
    for i in range(1, len(pts) - 1):
        P, B = pts[i], pts[i + 1]
        l1, l2 = math.dist(cur, P), math.dist(P, B)
        d1, d2 = ((P[0] - cur[0]) / l1, (P[1] - cur[1]) / l1), ((B[0] - P[0]) / l2, (B[1] - P[1]) / l2)
        sign = 1 if d1[0] * d2[1] - d1[1] * d2[0] >= 0 else -1
        phi = math.acos(max(-1.0, min(1.0, d1[0] * d2[0] + d1[1] * d2[1])))
        half = math.tan(phi / 2)
        rr = min(r, l1 * 0.98 / half, l2 * 0.49 / half)
        a = (P[0] - d1[0] * rr * half, P[1] - d1[1] * rr * half)
        line(cur, a)
        c = (a[0] - d1[1] * sign * rr, a[1] + d1[0] * sign * rr)
        a0, n = math.atan2(a[1] - c[1], a[0] - c[0]), max(2, int(rr * phi / step))
        out.extend((c[0] + rr * math.cos(a0 + sign * phi * k / n), c[1] + rr * math.sin(a0 + sign * phi * k / n)) for k in range(n))
        cur = (P[0] + d2[0] * rr * half, P[1] + d2[1] * rr * half)
    line(cur, tuple(pts[-1]))
    return out + [tuple(pts[-1])]


def check_bend(path, r, wall=1.5, prop=1.3):
    """The bend's line is clear: no wall, window or door within `wall` tiles of it, no prop within `prop`."""
    pts = bend_line(path, r)
    for (px, py) in pts:
        for y in range(int(py - wall), int(py + wall) + 1):
            for x in range(int(px - wall), int(px + wall) + 1):
                if lv.tiles[y][x] in BLOCKS or lv.tiles[y][x] in 'GDL':
                    d = math.hypot(max(x - px, 0, px - x - 1), max(y - py, 0, py - y - 1))
                    assert d >= wall, f'the bend\'s line at {px:.1f},{py:.1f} is {d:.2f} from the wall at {x},{y}'
    for (_, kind, col, row, deg, _) in lv.props:
        if SIZES.get(kind) is None:
            continue
        b = Level.box(kind, col, row, deg)
        for (px, py) in pts:
            d = math.hypot(max(b[0] - px, 0, px - b[2]), max(b[1] - py, 0, py - b[3]))
            assert d >= prop, f'{kind} at {col},{row} is {d:.2f} from the bend\'s line at {px:.1f},{py:.1f}'


# ---------------------------------------------------------------- the kerbs
# a kerb along every edge between a sidewalk and the road, laid from the tiles: straight lengths (four metres at a
# time where nothing else is asked), dropped or painted where the lists above say, a small bend at every outer corner
# (the big rounded one at a junction's), the stone that fills an inner one
lv.area('kerbs')
ROAD_T, WALK = '=-', 's'


def tile(x, y):
    return lv.tiles[y][x] if 0 <= x < W and 0 <= y < H else ' '


def lay_kerbs():
    runs = {}                                                 # (row of the edge, side) -> the columns of plain kerb
    for y in range(H - 1):
        for x in range(W):
            up, dn = tile(x, y), tile(x, y + 1)
            side = 's' if up in WALK and dn in ROAD_T else 'n' if up in ROAD_T and dn in WALK else None
            if not side:
                continue
            key = ('h', x, y + 1)
            look = '_low' if key in low else '_' + painted[key] if key in painted else ''
            row = y + 1 + (-1 if side == 's' else 1) / 32
            if look:
                lv.paint(f'kerb_{side}{look}', x + 0.5, row)
            else:
                runs.setdefault((row, side), []).append(x)
    for (row, side), cols in runs.items():
        i = 0
        while i < len(cols):
            if i + 3 < len(cols) and cols[i + 3] == cols[i] + 3:
                lv.paint(f'kerb_{side}_4', cols[i] + 2.0, row)
                i += 4
            else:
                lv.paint(f'kerb_{side}', cols[i] + 0.5, row)
                i += 1
    for y in range(H):
        for x in range(W - 1):
            lf, rt = tile(x, y), tile(x + 1, y)
            side = 'e' if lf in WALK and rt in ROAD_T else 'w' if lf in ROAD_T and rt in WALK else None
            if side:
                lv.paint(f'kerb_{side}' + ('_low' if ('v', x + 1, y) in low else ''), x + 1 + (-1 if side == 'e' else 1) / 32, y + 0.5)
    for y in range(1, H):
        for x in range(1, W):
            q = {'nw': tile(x - 1, y - 1), 'ne': tile(x, y - 1), 'sw': tile(x - 1, y), 'se': tile(x, y)}
            walk = [k for k, t in q.items() if t in WALK]
            road = [k for k, t in q.items() if t in ROAD_T]
            if len(walk) == 1 and len(road) == 3:             # an outer corner: the road toward the opposite quarter
                to = {'nw': 'se', 'ne': 'sw', 'sw': 'ne', 'se': 'nw'}[walk[0]]
                qx, qy = (1 if 'e' in to else -1), (1 if 's' in to else -1)
                big = corners.get((x, y)) == to
                d = (22 if big else 4) / 32                   # (the piece is R + 4 px wide: its middle that far in)
                lv.paint(('kerb_corner_' if big else 'kerb_bend_') + to, x - qx * d, y - qy * d)
            elif len(walk) == 3 and len(road) == 1:           # an inner corner
                qx, qy = (1 if 'e' in road[0] else -1), (1 if 's' in road[0] else -1)
                lv.paint('kerb_in', x - qx * 2.5 / 32, y - qy * 2.5 / 32)
    assert all(tile(c, r - 1) in WALK or tile(c - 1, r - 1) in WALK or tile(c, r) in WALK or tile(c - 1, r) in WALK for (c, r) in corners)


lay_kerbs()

# ---------------------------------------------------------------- the roofs of the blind buildings
lv.area('roofs')
for row in (2.0, 5.5, 20.0, 22.4):
    col = 2.0
    while col < WS - 3:
        col += rng.uniform(4.0, 11.0)
        kind = rng.choice(('vent', 'vent', 'ac_unit', 'ac_unit', 'chimney', 'hatch', 'duct'))
        if B0 - 3 < col < B1 + 4:
            continue                                          # the railway's
        if all(lv.is_roof(int(col) + dx, int(row) + dy) for dx in (-1, 0, 1) for dy in (-1, 0, 1)):
            lv.roof(kind, col, row, 0)

# ---------------------------------------------------------------- life
# three flocks in all (the user: fewer pigeons), each where it tells something: this one, the bridge's, and one
# back in his lane past the lorry
lv.pigeons(34.0, 14.6, 4)           # in his lane: up as he comes
lv.pigeons(371.0, 14.3, 3)
lv.cat(30.0, 16.7)
lv.cat(177.0, 8.5)
lv.cat(320.0, 17.6)

# ---------------------------------------------------------------- the night
lv.wet = 0.35                                     # the street still wet from an earlier rain (seen)
lv.rain = 0
lights = [[x, 13.5, 9, '#5a6ad8' if (x // 15) % 2 else '#7a5ad8', 0.16 if DARK[0] < x < DARK[1] else 0.3] for x in range(10, WS, 30)]
lights += [[x, 17.0, 8, '#ffd9a0', 0.35] for x in range(D0 + 3, D1, 9)]      # the diner spills onto its corner
lights += [[SIDE_X, r, 8, '#ffa860', 0.2] for r in (22, 30)]                  # the side street's sodium
lights += [[x, 46.0, 9, '#ffa860', 0.2] for x in (458, 482)]                   # the frontage road's
lights += [[x, 39.0, 9, '#ffb46a', 0.22] for x in range(462, TOLL_X, 30)]       # the freeway's lamps along its bank
lights += [[x, 47.0, 9, '#ffa860', 0.26] for x in (515, 545)]                   # the ramp's
lights += [[x, 45.5, 9, '#5a6ad8' if (x // 15) % 2 else '#7a5ad8', 0.26] for x in (RAMP_X + 2, 530)]   # the night between
lights += [[x, MID, 10, '#5a6ad8' if (x // 15) % 2 else '#7a5ad8', 0.26] for x in range(TOLL0 + 4, W, 30)]   # the freeway's
lights += [[CANOPY_X, MID + d, 9, '#e8f0ff', 0.22] for d in (-6, 0, 6)]  # the plaza under its lit roof
lights += TOLL_LIGHTS                                                    # (the toll's block: its neon, pools, windows)

# people on the sidewalks, out of an alley or a street and into the next (they run from a car on the kerb, or die
# under it)
ambient = {
    'traffic': [],
    'walkers': [
        {'path': [[CORAL[1] + 0.5, 1.0], [CORAL[1] + 0.5, 9.2], [N_ALLEY[0] + 1.0, 9.2], [N_ALLEY[0] + 1.0, 1.5]], 'gap': [5, 9], 'max': 2},
        {'path': [[192, 21.5], [192, 17.1], [234, 17.1], [234, 21.5]], 'gap': [5, 9], 'max': 2},
        {'path': [[420, 21.5], [420, 17.1], [401, 17.1], [401, 16.5], [356, 16.9]], 'gap': [5, 9], 'max': 2},
    ],
}

# THE ROUTE (systems/Route.js): straight legs along +x, the bends between them scripted. A leg: the columns it holds
# [from, to), its lanes' middle rows (ours last), the row the camera is drawn toward (`mid`: the street's middle,
# between its two facades; the view is 360 px high), its cruise (px/step), its kerbs (the roadway's first row, the
# first sidewalk row: where the parking row is on the north side, the lorry's stretch), its streets across [first col,
# last col, row above, row below] (the line of the building fronts held across them: systems/Drive.js fronts; the
# chase's own `across` hold on every leg)
LEGS = [
    {'from': 0, 'to': LEG1, 'lanes': list(LANES), 'mid': 13.0, 'cruise': 8.9, 'kerbs': [9, 16],
     'across': [[SIDE[0] - 2, SIDE[1] + 2, 8, 18]]},
    # leg 1: the frontage road, the on-ramp, the merge (one way east, both lanes ours). Framed from the freeway's near
    # lane to the sheds' fronts; 70 km/h (a cruise is the leg's whole: one step up from the street's, the toll's next);
    # the wheel kept between the bank and the sheds, the dock's edges or the ramp's guardrail (`across`)
    {'from': LEG1, 'to': TOLL0, 'lanes': list(LANES1), 'mid': 44.5, 'cruise': 10.4,
     'kerbs': [ROAD1[0], ROAD1[1] + 1],
     'across': [[LEG1, TOLL_X - 1, ROAD1[0] - 0.4, H], [DOCK_S[0] - 2, DOCK_S[1] + 1, 0, ROAD1[1] + 2.2],
                [RAMP_X - 1, TOLL_X - 1, 0, ROAD1[1] + 1.9]]},
    # THE TOLL: no bend, the legs follow one another by column (the car goes on in its row from one to the next:
    # Drive's framing eased across). The approach (the four lanes side by side the merge left: the freeway's two and
    # leg 1's), the plaza from the fan to just past the gates (its four lanes under the roof; the camera follows him
    # across: `track`, the plaza is 20 m wide), four lanes again from there (the fan back: theirs are on the lanes the
    # paint closes to before the road narrows, never out wide into its crash cushions), the freeway's two (the middle
    # ones) from where the outer two start to end. The wheel is held inside the guardrails (`across`), and brought in
    # ahead of where the road narrows (Drive.fronts looks C.frontAhead tiles on): the rail's thin end is never nose-on
    {'from': TOLL0, 'to': FAN[0], 'lanes': list(APPROACH), 'mid': MID, 'cruise': TOLL_CRUISE,
     'across': [[TOLL0, FAN[0] - 1, RAIL[0] + 0.22, RAIL[1] - 0.22]]},
    {'from': FAN[0], 'to': PLAZA_TO, 'lanes': list(PLAZA), 'mid': MID, 'cruise': TOLL_CRUISE, 'track': 0.7,
     'across': [[FAN[0], PLAZA_TO - 1, RAIL_PLAZA[0] + 0.22, RAIL_PLAZA[1] - 0.22], [FAN[0], 600, 0, 51.9]]},   # (off the office)
    {'from': PLAZA_TO, 'to': DROP[0], 'lanes': list(APPROACH), 'mid': MID, 'cruise': TOLL_CRUISE,
     'across': [[PLAZA_TO, AFTER[1] - 3, RAIL_PLAZA[0] + 0.22, RAIL_PLAZA[1] - 0.22],
                [AFTER[1] - 2, DROP[0] - 1, RAIL[0] + 0.22, RAIL[1] - 0.22]]},
    {'from': DROP[0], 'to': W, 'lanes': list(FREEWAY), 'mid': MID, 'cruise': TOLL_CRUISE,
     'across': [[c, c + 3, RAIL[0] + 0.22 + k, RAIL[1] - 0.22 - k] for (k, c) in enumerate(range(DROP[0], DROP[1], 4))]
     + [[DROP[1], W - 1, RAIL_FWY[0] + 0.22, RAIL_FWY[1] - 0.22]]},
]
# a bend: the car's middle at `at` (col) on its leg, the script drives it along `path` (its corners [col, row], each
# inner one rounded off by an arc of `radius` tiles) and hands it to leg `to` on the lane the path ends on
BENDS = [
    {'at': BEND_AT, 'path': [[BEND_AT, LANES[1]], [SIDE_X, LANES[1]], [SIDE_X, LANES1[1]], [SIDE_X + 14, LANES1[1]]],
     'radius': BEND_R, 'to': 1},
]

chase = {
    'van': list(START),
    'cruise': 8.9,              # px/step: 60 km/h
    # (the first leg's, as before there were legs: lanes, kerbs, mid)
    'lanes': list(LANES),
    'kerbs': [9, 16],
    'mid': 13.0,
    # the streets across [first col, last col, row above, row below]: the wheel does not take him down one (the
    # line of the building fronts is held across it: systems/Drive.js fronts)
    'across': [[CORAL[0], CORAL[1], 8, 18], [CROSS[0], CROSS[1], 8, 18]],
    'legs': LEGS,
    'bends': BENDS,
    'end': END,                 # on the last leg
    'next': 'THE MOTORWAY',     # what comes after it, on the card that closes the demo (Game: TO BE CONTINUED)
    # THE TOLL (systems/Toll.js, CHASE.toll; event 3 of docs/LEVEL2.md): the gates at col `at`, lane by lane north
    # first: the plaza's rows (`lanes`), the same lanes' rows on the approach (`from`), the columns they spread over
    # (`fan`: the way told and driven, straight from its end on), the islands' noses (`nose`: the lanes' mouths, where
    # each lane's signal is told big), each one's gate (`gates`: 'wood' | 'steel')
    'toll': {'at': GATE_X, 'lanes': list(PLAZA), 'from': list(APPROACH), 'fan': [FAN[0], FAN[1] - 4], 'nose': NOSE, 'gates': list(GATES)},
    # by the column of the car's middle. 'alley' (systems/Pursuit.js) waits at `car` [col, row] facing north, lamps on;
    # 'lorry' (systems/Lorries.js): the lorry waits at `lorry` [col, row] its cab to the north, and backs `back` tiles
    # south across the lanes; `gap` [col, row]: the way round its tail, shown by bone arrows
    'events': [
        # (`style`: how each car fights, systems/Pursuit.js: the first tells its shots, the second rams, then a
        # blocker ahead of him with a gunner behind it, and the last one out of the cross street rams)
        {'at': ALLEY_AT, 'kind': 'alley', 'car': [EVENT_ALLEY + ALLEY_W / 2, 21.0], 'style': 'gunner'},
        *[{'at': c, 'kind': 'behind', 'style': st} for (c, st) in zip(BEHIND_AT, BEHIND_STYLE)],
        {'at': LORRY_AT, 'kind': 'lorry', 'lorry': [(YARD[0] + YARD[1] + 1) / 2, 6.69], 'back': 5, 'gap': [(YARD[0] + YARD[1] + 1) / 2, 18.3]},
        {'at': CROSS_AT, 'kind': 'alley', 'car': [(CROSS[0] + CROSS[1] + 1) / 2 + 1.5, 21.0], 'style': 'rammer'},
        # out of the detour: one more from behind on the frontage road (it starts at col 458, past the bend's way
        # out), a rammer: the ramp's guardrails are what to shove it into
        {'at': FRONTAGE_AT, 'kind': 'behind', 'style': 'rammer'},
        # the toll: two more from behind as the road opens; the first takes a steel lane (`gate`: it does not follow
        # him: it wrecks on the boom, his kill), the other follows him through a wooden arm
        {'at': TOLL0 + 1, 'kind': 'behind', 'style': 'rammer', 'gate': 'steel'},
        {'at': TOLL0 + 11, 'kind': 'behind', 'style': 'gunner'},
    ],
    # water standing in the gutter [col, row, r px]: spray under his wheels
    'water': [[36.0, 15.6, 30], [152.0, 14.2, 34], [247.0, 15.5, 30], [318.0, 14.6, 28], [404.0, 14.9, 34],
              [444.2, 29.4, 26], [470.0, 47.5, 30], [493.0, 47.4, 26]],
    # the boss's Uzi off his passenger seat (taken in a short beat the first time: systems/Drive.js grab). At the wheel
    # it never runs dry (systems/CarGun.js): `mag` is what is in it when he gets out of the car (2B)
    'arms': {'weapon': 'uzi', 'mag': 30, 'seat': True},
    # how it opens, the first time: the car standing, he finishes his cigarette and flicks it out, then the engine
    # and the grab (systems/LastDrag.js, CHASE.intro)
    'intro': 'drag',
}


def lane_bands(leg):
    """The rows a leg's lanes cover: [(top, bottom)], one band across them all (lanes side by side: leg 0's two are
    the roadway's rows 11 to 15, leg 1's ROAD1), or one a lane on the plaza (islands between them: a lane 3 m wide,
    the crash cushions before the islands' noses kept out of it too)."""
    L = sorted(leg['lanes'])
    if L == sorted(PLAZA):
        return [(r - 1.5, r + 1.5) for r in L]
    half = (L[1] - L[0]) / 2
    return [(L[0] - half, L[-1] + half)]


def check_lanes():
    """Nothing stands in the lanes of a leg, anywhere along it (a parked car's flank included), and nothing loose
    stands within reach of them: a thing a car could knock into a lane is a thing in the lane. A toll's gates stand
    across theirs on purpose."""
    for (_, kind, col, row, deg, _) in lv.props:
        if SIZES.get(kind) is None or kind in ACROSS:
            continue
        b = Level.box(kind, col, row, deg)
        if roadway(int(col)) and not 8 <= row < 18:
            continue                                          # up or down a street across
        for leg in LEGS:
            if leg['from'] <= col < leg['to']:
                for (top, bottom) in lane_bands(leg):
                    assert b[3] <= top or b[1] >= bottom, f'{kind} at {col},{row} is in a lane'


if __name__ == '__main__':
    lv.actor('@', int(START[0]), int(START[1]), face=0)
    check_lanes()
    for B in BENDS:
        check_bend(B['path'], B['radius'])
    lv.check(guards=0)
    lv.write('level2a', name='THE CHASE', subtitle='SUNSET BAY  -  MARCH 16TH 1986  -  1:40 AM',
             lights=lights, ambient=ambient, chase=chase, header=[
                 'Level 2A - "THE CHASE": the back road (segment 1 of docs/LEVEL2.md), driven east in THE BOSS\'s convertible.',
                 'Two lanes that nothing stands in, between kerbs; parking on the north side, on ours or on neither by',
                 'section; two junctions under traffic lights, a railway bridge, works, a bus stop, the yard the lorry backs',
                 'out of (event 2) with the cafe\'s terrace as the way round, the diner on the lit corner. The alley at',
                 'col 138 is event 1. Then works shut it: the scripted detour down the side street onto leg 1 (a plain',
                 'test layout for now: systems/Route.js legs and bends), and THE TOLL: the road opens to four lanes, a plaza',
                 'under its lit roof, a wooden arm or a steel boom at the end of each lane (event 3), the freeway\'s start.',
             ])
