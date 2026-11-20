#!/usr/bin/env python3
"""Builds src/game/data/levels/level2a.js (level 2A, the chase: docs/LEVEL2.md) with tools/levelkit.py.

    python tools/build_level2a.py

Segment 1, THE BACK ROAD (0:00-0:25 at 60 km/h): THE BOSS's convertible drives east (+x) in the south lane
(right-hand traffic) of a two-lane street of Sunset Bay, 450 m of it, built section by section as a real street
is: kerbs along every sidewalk, parking on one side or the other or on neither, two junctions under traffic lights
with their crossings, a railway bridge, works in a parking lane, a bus stop, the lorry's yard, a fruit market, a diner.
It is a GRADIENT from level 1's suburb to Miami (THE HARMONY PASS, after the street's dice: palms, pastels, neon).
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
                 lanes, KEEP CLEAR painted before its gate; THE FRUIT MARKET (south, cols 325-354): the fronts set
                 back four metres, stalls under their awnings, crates, signs, strings of bulbs on a vacant corner:
                 the way round the lorry (it was a cafe's terrace: THE HARMONY PASS below replaces it)
    357-388   A  THE LIT CORNER: the diner, all glass and light
    389-403   J  THE CROSS STREET under traffic lights (its roadway cols 393-398): the last car comes out of it
    404-449   C  the way to the freeway (its sign over the road), DETOUR told from col 418
    446-473      THE WORKS: the street dug up past the side street's mouth (cones tapering both lanes into it, an
                 arrow board, ROAD CLOSED, water barriers, the road cut, the excavator and the dump truck, lit)

Then the detour (docs/LEVEL2.md "Segment 1, part two"): the script (systems/Route.js legs and bends) takes the car
right down THE SIDE STREET, past its mouth THE ALLEY (cols 444-448 between pink and mint stucco: what he ploughs
through, a parked car he scrapes), under
THE FREEWAY's bridge at its foot (rows 33.5-41.5), and left onto LEG 1 (lanes 44.25 / 46.75, one way east): THE
FRONTAGE ROAD along the freeway's embankment (sheds and docks on the south side, cols 446-497), THE ON-RAMP (its
own embankment, guardrails, cols 498-523), THE MERGE (the freeway's lanes come in alongside, cols 524-559). Then
THE TOLL (segment 2, docs/LEVEL2.md has its table, cols 560-699): the four lanes side by side spread to the plaza's
grid under its roof (cols 603-611: five islands, four booths, a gate at the end of each lane: a wooden arm or a steel
boom, told by its lane's signal), spread back, the outer two merge in: the freeway's start; the level ends at col 656.
"""
import math
import os
import random
import struct

from levelkit import Level, SIZES, SOLID as BLOCKS

WS, HS = 450, 24             # the street (segment 1): its columns and rows
W, H = 700, 64               # the map: the street, the detour down the side street, leg 1 (the on-ramp's start) below it,
                            # the toll east of col 560 (rows 56 on: the plaza's south half)
START = (8.5, 14.75)        # the car's centre, facing +x, in our lane
LANES = (12.25, 14.75)      # the lanes' middle rows: theirs (westbound), ours
# THE DETOUR (docs/LEVEL2.md "Legs and scripted bends", "Segment 1, part two"): works shut the street past the side
# street's mouth, the script takes the car right down the side street and left at its foot onto LEG 1
SIDE = (442, 449)           # the side street's roadway (cols, inclusive), a sidewalk two tiles wide either side
SIDE_X = 446                # its middle
# THE ALLEY (docs/LEVEL2.md "Segment 1, part two"; the user: "une petite contre-allee ou tu defonces tout"): past its
# mouth the side street is a back alley five metres between pastel stucco walls (cols ALLEY, rows 18-42), full of what
# the car ploughs through on the bend's line down its middle (CHASE.bend.smash)
ALLEY = (444, 448)          # its floor's columns (inclusive); its walls: col 443 (pink) and col 449 (mint)
ALLEY_X = 446.5             # its middle: the bend's line goes down it
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
END = 656                   # past this column of the last leg (the freeway's start, past the toll) the level is over:
                            # 44 columns of road left to run on as the picture goes black (the map's edge is never seen:
                            # at 672 it came on the picture half way through the fade, the car into it among the wrecks)
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
TERRACE = (325, 354)        # the open ground the lorry is dodged through, south (cols, inclusive): the fruit market
                            # (the cafe's terrace until the harmony pass, which keeps its geometry)
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
# (a double starts where a gap of the dashes would, in their rhythm, and runs on to the stop line: Coral Street's at col
# 46, the dashes again after a gap)
SOLID = ((28, 45), (62, 74), (132, 161), (238, 276), (306, 356), (374, 388), (404, WS - 1))
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
# (LAID THEN TAKEN AWAY: the harmony pass puts the fruit market there. It is still laid here because its tables draw
# from the street's dice: the parked cars and the shops after it stay where they were)
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
for c in range(LOADING[0] + 6, LOADING[1] + 1, 6):                   # (its first tee is the parking row's last)
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
for (c, r) in ((37.0, 12.5), (88.5, 12.4), (171.5, 14.6), (199.4, 12.0), (236.4, 15.0), (290.2, 12.6), (368.2, 14.4), (411.0, 12.3)):
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
S_DARK = ['bin_bag', 'bin_bag', 'crate', 'crate', 'trash_can', 'bin_bag', 'cardboard_box']   # (no barrel on his way: a death nobody
# told; no keg either, the user: "enleve les futs de biere qui trainent": a keg has no business on a sidewalk, and
# flung off it by his car it lay in the road. The list keeps its length: the street's dice roll on as they did)
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
# leg 1's paint by row: the yellow left edge 8 px off the kerb under the bank (it lay on the kerb), then on the ramp
# (no kerb) on the gore's own line; the lane line, its dashes 3 m every 9 in step with the toll's (they go on into it
# unbroken: 561 - 9 k); the white right edge and the shoulder's rumble strip on the toll's rows; the ramp's guardrail,
# its beam in line with its end's
EDGE_N, EDGE_RAMP = R0 + 0.25, R0
LANE_AT = 444
EDGE_S, RUMBLE_S, RAIL_S = R1 + 1.0, R1 + 1.33, R1 + 2.15 + 4.5 / 32
lv.area('part two: the ground')
for (x0, y0, x1, y1, t) in (
        (WS, 8, DEAD - 1, 10, 's'), (WS, 11, DEAD - 1, 15, '='), (WS, 16, DEAD - 1, 17, 's'),   # the street, on under the works
        (LEG1_W, F0 - 1, TOLL_X - 1, F0 - 1, '"'), (LEG1_W, F0, TOLL_X - 1, F1, '='),           # the freeway on its bank
        (LEG1_W, F1 + 1, TOLL_X - 1, R0 - 1, '"'), (M0, F1 + 1, TOLL_X - 1, R0 - 1, '='),       # the bank; the gore
        (S0 - 3, 18, S0 - 3, HS - 1, 'X'),                                                       # a blind wall for the shops cut
        (S0 - 2, 16, S1 + 2, R0 - 1, 's'), (S0, 16, S1, R0 - 1, '='),                            # the side street
        (DECK[0] + 1, F0 - 1, S0 - 3, F1, '_'), (S1 + 3, F0 - 1, DECK[1] - 2, F1, '_'),         # its abutments, under the deck
        (LEG1_W, R0, TOLL_X - 1, R1, '='),                                                       # the frontage road, the ramp
        (LEG1_W, R1 + 1, RAMP_X - 1, R1 + 2, 's'),                                               # its south sidewalk
        (RAMP_X, R1 + 1, TOLL_X - 1, R1 + 1, '='), (RAMP_X, R1 + 2, TOLL_X - 1, R1 + 4, '"'),   # the ramp's shoulder, its bank
        (RAMP_X, R1 + 5, TOLL_X - 1, H - 1, '~'),                                                # waste ground at its foot
        (YARD_S[0], R1 + 3, YARD_S[1], R1 + 3, '_'), (YARD_S[0] - 2, R1 + 4, YARD_S[1] + 3, H - 1, '_')):   # the yard south
    lv.fill(x0, y0, x1, y1, t)
lv.props[:] = [p for p in lv.props if not (S0 - 2.4 < p[2] < S1 + 3.4 and 15.5 < p[3] < HS + 1)]
boxes[:] = [b for b in boxes if not (b[2] > S0 - 2.4 and b[0] < S1 + 3.4 and b[3] > 15.5)]
# the big rounded corners of the side street's two mouths (lay_kerbs), the kerbs dropped where a lorry turns in
corners.update({(S0, 16): 'ne'})
low.update(('h', c, R1 + 1) for c in list(range(DOCK_S[0], DOCK_S[1] + 1)) + list(range(YARD_S[0], YARD_S[1] + 1)))
low.update(('h', c, 11) for c in list(range(441, 445)) + list(range(447, 451)))   # the tyre shop's two doors (north)


def pieces(kind, c0, c1, row, step=3.0, deg=0):
    """A line painted in lengths of `step` tiles end to end from c0 to c1 on `row` (edge lines, a rumble strip)."""
    c = c0
    while c + step <= c1 + 0.01:
        lv.paint(kind, c + step / 2, row, deg)
        c += step


def solid(kind, c0, c1, row, step=3.0):
    """A line painted unbroken from exactly c0 to exactly c1 (the last length laid back over the one before it: the
    same paint on the same line, nothing shows)."""
    pieces(kind, c0, c1, row, step)
    if (c1 - c0) % step > 0.01 and c1 - c0 >= step:
        lv.paint(kind, c1 - step / 2, row)


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

# ---------------------------------------------------------------- THE ALLEY (the side street past its mouth)
# The user (2026-11-20): "quand tu tournes, il faut que ce soit une petite contre-allee ou tu defonces tout sur le
# passage, qui vole avec des effets ... une voiture qui passe, des etincelles de partout ... Miami annees 80". Past the
# side street's mouth (rows 16-17, the turn's way in), a back alley five metres wide (cols 444-448) between two
# stucco walls, pink to the west (a bar's back door, COCKTAILS over it), mint to the east (a botanica's, its sign in
# cyan), down to the freeway's bridge (its abutments the alley's walls on to row 40) and out under it onto the
# frontage road. On the bend's line down its middle (col 446.5) and against its walls, all that the car ploughs
# through (CHASE.bend.smash: torn, thrown, burst; check_bend lets it stand there, nothing LASTING): produce crates,
# boxes, bins and bags, a fruit cart, a news rack, washing on two lines across it (torn down: `canopy`), the old men's
# domino table (the two of them dive away), a scooter, bottles, a hydrant (its geyser and mist under the bridge), a
# wheeled dumpster he clips (it spins away) and THE PARKED CAR against the east wall, its flank 5 px into his line: he
# scrapes it its whole length (sparks off both, a mirror torn off, dents, its alarm and hazards); the first pursuer to
# follow him scrapes it too and is wrecked on it (its option `snare`). Neon pools, sodium, a palm over the wall, fire
# escapes, AC units dripping, graffiti in neon paint, steam out of a cover lit cyan.
A0, A1 = ALLEY
lv.area('part two: the alley, its walls')
for (x0, y0, x1, y1, t) in (
        (S0 - 2, 18, A0 - 1, F0 - 2, 'X'), (A0 - 1, 18, A0 - 1, F0 - 2, 'P'), (S0 - 2, 18, A0 - 1, 18, 'P'),   # west: pink stucco
        (A1 + 1, 18, S1 + 2, 20, 's'),                                                                # (its mouth flared east: the tail out)
        (A1 + 1, 21, S1 + 2, F0 - 2, 'X'), (A1 + 1, 21, A1 + 1, F0 - 2, 'M'), (A1 + 1, 21, S1 + 2, 21, 'M'),   # east: mint
        (S1 + 3, 25, 457, 29, 'X'),                                                                   # (the yard behind it built over)
        (S0 - 2, F0 - 1, A0 - 1, F1, '#'), (A1 + 1, F0 - 1, S1 + 2, F1, '#'),                         # the bridge's abutments
        (S0 - 2, F1 + 1, A0 - 1, R0 - 1, '"'), (A1 + 1, F1 + 1, S1 + 2, R0 - 1, '"'),                 # its bank either side
        (A0, 18, A1, R0 - 1, '=')):                                                                   # the alley's floor
    lv.fill(x0, y0, x1, y1, t)
lv.paint('kerb_s_4', S0, R0 - 1 / 32)                                       # the kerb under the bank (its yellow line:
                                                                              # the frontage road's paint)
for c in range(A1 + 1, S1 + 3):
    lv.paint('kerb_s', c + 0.5, R0 - 1 / 32)
lv.put(A0 - 1, 26, 'L')                                                       # the bar's back door (west)
lv.put(A1 + 1, 24, 'L')                                                       # the botanica's (east)
for r in (25, 26, 27):                                                        # their reveals in the stucco too (the
    lv.put(A0 - 2, r, 'P')                                                    # brick behind showed round each door)
    lv.put(A1 + 2, r - 2, 'M')
W_FACE, E_FACE = A0 + 0.07, A1 + 1 - 0.07                                     # (a thing on a wall face: its middle there)
lv.area('part two: the alley, on its walls')
for r in (20.0, 31.0):
    lv.prop('stucco_trim_pink', W_FACE, r, 270)
lv.prop('neon_sign_cocktail', W_FACE, 28.0, 270)                             # over the bar's back door, beside it
lv.prop('neon_tube_pink', W_FACE, 24.6, 270)
lv.prop('neon_sign_botanica', E_FACE, 26.0, 90)
lv.prop('neon_tube_cyan', E_FACE, 22.4, 90)
lv.prop('graffiti_neon_b', W_FACE, 37.0, 270)                                # on the bridge's abutments
lv.prop('graffiti_neon_a', E_FACE, 38.0, 90)
lv.prop('ac_drip', W_FACE, 22.4, 270)
lv.prop('ac_drip', E_FACE, 27.7, 90)
lv.prop('ac_drip', W_FACE, 32.4, 270)
lv.prop('pipe_steam', W_FACE, 34.2, 270)
lv.area('part two: the alley, overhead')
lv.prop('palm_fronds', S1 + 1.0, 20.0, 180)                                  # over the east wall at the mouth
lv.prop('fire_escape', A0 + 44 / 64, 30.2, 270)
lv.prop('laundry_line', ALLEY_X, 23.2)
lv.prop('laundry_line', ALLEY_X, 29.8)
lv.area('part two: the alley, what the car ploughs through (in its order down it)')
must('neon_box_cyan', A1 + 2.6, 19.4, 90)                                    # on the sidewalk at its mouth
must('produce_crates', 446.4, 21.0, 0, on='=')                               # the first: the slow motion (ChaseCam 'smash')
must('box_stack', 445.4, 22.3, 12, on='=')
must('trash_can', 447.62, 22.2, on='=')
must('bin_bag', 447.35, 23.1, on='=')
must('bin_bag', 445.45, 23.6, on='=')
must('fruit_cart', 445.65, 25.4, 90, on='=')                                 # fruit everywhere
must('box_stack', 447.75, 25.4, 80, on='=')
must('news_stand', 447.45, 27.2, 90, on='=')
must('domino_table', 445.25, 28.45, 0, on='=')
for r in (27.8, 29.1):
    must('plastic_chair', 444.42, r, 90, on='=')
lv.patron('civ1', 444.42, 27.8, 0, 'cards')                                  # the old men at their dominoes: they dive away
lv.patron('civ3', 444.42, 29.1, 0, 'cards')
must('car', A1 + 1 - 0.86, 31.1, 90, on='=', lights=False, snare=True)       # THE PARKED CAR: scraped its whole length
must('scooter_pink', 445.45, 30.8, 90, on='=')
must('neon_box_pink', 445.45, 32.6, 90, on='=')
must('bottle_crate', 447.6, 33.75, on='=')
must('hydrant', 446.9, 35.0, on='=')                                          # its geyser under the bridge
must('dumpster_mint', 446.2, 37.6, 0, on='=')                               # clipped: it spins away
must('produce_crates', 445.4, 39.5, 90, on='=')
must('box_stack', 447.65, 39.6, 0, on='=')
lv.area('part two: the alley, its ground')
for (kind, c, r, deg) in (('road_patch_a', 445.2, 20.8, 90), ('road_crack_b', 447.6, 26.0, 0), ('oil_stain_a', 447.8, 30.5, 90),
                          ('road_patch_c', 445.4, 34.6, 0), ('road_crack_a', 447.2, 38.4, 180), ('drain', ALLEY_X, 32.4, 90),
                          ('manhole_sq', 445.2, 41.2, 90)):
    lv.paint(kind, c, r, deg)
lv.dress('manholes', 445.8, 24.4)                                             # a cover breathing steam, lit cyan
lv.dress('papers', A0, 18, A1 + 1, 42, 14)
lv.cat(444.5, 40.6)
lv.roof('ac_unit', S0 - 0.9, 28.0)
lv.roof('vent', S0 - 1.2, 22.0)
lv.roof('ac_unit', S1 + 2.0, 27.6)
# the alley's light: the bar's pink at its back door, the botanica's cyan, violet and pink under the bridge, a sodium
# lamp at its mouth (lights: [col, row, r tiles, colour, intensity])
ALLEY_LIGHTS = [[ALLEY_X, 18.6, 7, '#ffa860', 0.22], [A0 + 0.6, 27.0, 5, '#ff4a9a', 0.42], [A1 + 0.4, 25.6, 5, '#4ae8ff', 0.4],
                [A0 + 0.8, 24.6, 3, '#ff2a6d', 0.3], [A1 + 0.3, 22.4, 3, '#05d9e8', 0.3], [A1 + 2.6, 19.4, 3, '#6ae8ff', 0.25], [ALLEY_X, 36.5, 6, '#9a4aff', 0.34],
                [A0 + 0.6, 32.6, 3, '#ff6aa0', 0.3], [ALLEY_X, 41.5, 6, '#ffa860', 0.18]]

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
dashes(M1, TOLL_X, F1 + 0.5, 9, at=LANE_AT)                             # (on into the toll's lane lines, unbroken)
solid('edge_line', M1, M1 + 6, R0)                                       # past the gore's tip: solid, then the toll's dashes
for r in (F1 + 0.5, R0):
    lv.paint('raised_marker', TOLL_X - 2.0, r)                           # (a cat's eye between two, as the toll's)
for c in (470.5, 500.5):
    must('highway_lamp', c, F1 + 1.75, 90, on='"')

# ---------------------------------------------------------------- leg 1: the frontage road
# One way east, two lanes, a white dash between them every 9 m, the yellow edge line along its north kerb (the bank
# above it); on the south side sheds and docks: a body shop, a blind warehouse opposite the side street, the cold
# store's two loading bays (the kerb dropped along them), a yard behind its gate, a long shed with its pipes; sodium
# lamps on the south sidewalk; FREEWAY ENTRANCE where the sheds end.
lv.area('part two: the frontage road, its paint')
solid('edge_line_yellow', LEG1_W, A0, EDGE_N)                          # (broken across the alley's mouth)
solid('edge_line_yellow', A1 + 1, RAMP_X - 3, EDGE_N)
slant('edge_line_yellow', (RAMP_X - 3, EDGE_N), (RAMP_X, EDGE_RAMP))     # (past the kerb's end: onto the gore's line)
solid('edge_line_yellow', RAMP_X, M0, EDGE_RAMP)
dashes(LEG1_W, TOLL_X, R0 + 2.5, 9, at=LANE_AT)
for c in list(range(LEG1_W, S0 - 2 - 3, 4)) + list(range(S1 + 3, RAMP_X - 3, 4)):   # the kerb under the bank
    lv.paint('kerb_s_4', c + 2.0, R0 - 1 / 32)
for (kind, c, r, deg) in (('road_patch_c', 457.5, 44.3, 0), ('road_crack_a', 463.0, 46.9, 0), ('manhole_sq', 478.2, 44.5, 0),
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
put('bin_bag', 452.8, 49.5)
# (the used car lot past the motel: its apron flush with the sidewalk, the showroom's glass front behind it, a door in
# its middle; dressed with the rest of Miami below)
LOT_S = (486, 494)
lv.fill(LOT_S[0], R1 + 1, LOT_S[1], R1 + 2, '_')
lv.fill(LOT_S[0] + 1, R1 + 4, LOT_S[1] - 1, R1 + 5, '+')
for c in range(LOT_S[0] + 1, LOT_S[1]):
    lv.put(c, R1 + 3, 'L' if c == (LOT_S[0] + LOT_S[1]) // 2 else 'G')
for c in (445.0, 458.5, 482.5):                                         # (the first lights the T at the alley's foot)
    must('streetlight', c, R1 + 1.28, 270)
must('sign_oneway', S1 - 1.0, R1 + 1.7, 0)                               # across the T from the alley: east only
must('sign_freeway', RAMP_X - 3.0, R1 + 1.7, 0)
lv.dress('papers', LEG1_W, R1 + 1, RAMP_X - 1, R1 + 2, 12)
lv.cat(472.3, 49.5)
for (kind, c, r) in (('ac_unit', 430.6, 52.6), ('vent', 437.2, 51.8), ('duct', 446.0, 52.2), ('chimney', 452.8, 53.4),
                     ('ac_unit', 459.4, 52.4), ('vent', 462.6, 51.9), ('hatch', 478.6, 52.6), ('ac_unit', 482.6, 53.2),
                     ('vent', 490.0, 55.4), ('duct', 494.8, 55.2)):
    lv.roof(kind, c, r)                                                   # on the sheds' flat roofs

# ---------------------------------------------------------------- leg 1: the on-ramp and the merge
# The sheds end: the road climbs onto an embankment of its own: a paved shoulder with its rumble strip, the white edge
# line, a guardrail along the top of the bank (its end toward whoever comes), delineators either side, WRONG WAY for
# whoever comes up it the wrong way, SPEED LIMIT 55, TOLL 1/2 MILE; the freeway's lanes come in alongside (the gore),
# MERGE painted in our left lane; waste ground at the foot of the bank (off the picture).
lv.area('part two: the on-ramp')
solid('edge_line', RAMP_X + 0.25, TOLL_X, EDGE_S)                        # (clear of the sidewalk's last kerb)
solid('rumble_strip', RAMP_X + 1, TOLL_X, RUMBLE_S)
must('guardrail_end', RAMP_X + 1.0, R1 + 2.15, 0, on='"')                # its head on the bank
rail('guardrail', RAMP_X + 2, TOLL_X, RAIL_S, 180)                          # (its beam in line with the end's)
for c in range(RAMP_X + 2, TOLL_X - 2, 4):
    put('reflector_post', c + 0.5, R1 + 1.86, on='=')
for c in range(RAMP_X + 2, M0 - 1, 4):
    put('reflector_post', c + 0.5, R0 - 0.3, on='"')
# (the signs stand at the shoulder's edge, read at a glance: the bank beyond is off the picture)
must('sign_wrong_way', RAMP_X + 8.5, R1 + 1.7, 0, on='=')                # (read upright, as every sign: it was turned)
must('sign_wrong_way', RAMP_X + 8.5, R0 - 0.65, 0, on='"')
must('sign_speed_55', RAMP_X + 13.0, R1 + 1.7, 0, on='=')
must('sign_toll_ahead', RAMP_X + 21.0, R1 + 1.7, 0, on='=')
for c in (515.5, 545.5):
    must('highway_lamp', c, R1 + 2.65, 90, on='"')
lv.paint('merge_arrow', M0 + 12.0, LANES1[0])                           # (between two of the slabs' joints)
for c in range(RAMP_X + 6, TOLL_X, 9):                                   # cat's eyes in the middle of each gap, the
    lv.paint('raised_marker', c, R0 + 2.5)                               # yellow ones beside the left edge to the gore
    if c < M0:
        lv.paint('raised_marker_yellow', c, EDGE_RAMP + 0.19)
for (kind, c, r, deg) in (('road_crack_a', 506.0, 46.4, 0), ('road_patch_b', 519.5, 44.4, 0), ('road_crack_b', 538.0, 47.0, 90),
                          ('road_patch_c', 551.5, 44.2, 0)):
    lv.paint(kind, c, r, deg)

# ---------------------------------------------------------------- leg 1 dressed: Sunset Bay, 1985
# (docs/LEVEL2.md "Segment 1, part two"; sprites "Miami, 1985" in tools/generate_assets.py.) The picture at the wheel
# runs from the freeway's near lane to the fronts' foot: what tells the place is on the bank and on the sidewalk.
# NORTH, the freeway's bank: a camp out from under the bridge (a tarp, a mattress, a fire in a drum, a cart), a
# chain-link fence along the bank's foot with a hole cut in it by the camp, royal palms, the sun-tan billboard on its
# catwalk, a burnt-out car that came off the freeway through its rail; on the ramp's bank the radio's billboard and the
# crash cushion somebody hit. SOUTH: the cold store's mint canopy, the motel's back (its pole sign, MOTEL and VACANCY
# in neon, a pink canopy, hibiscus), a used car lot (a coupe up on its display ramp under two light poles and the
# pennants, AUTO SALES on its pole); on the ramp an old crash (tyre marks into a dented length of rail, glass and a
# hubcap on the shoulder), a call box, royal palms lit from their feet beyond the rail, hibiscus on the bank. The
# ramp's slabs: an expansion joint every 6 m, oil down the lanes.
lv.area('miami: the camp under the bridge (north bank)')
lv.paint('mattress_dumped', 453.7, 42.05, 4)
lv.patron('tramp', 453.6, 42.0, 0, 'sleep')
must('tent_tarp', 456.7, 42.0, 0, on='"')
must('barrel_fire', 459.4, 42.2, on='"')
lv.fire(459.4, 42.2)
lv.patron('tramp', 459.4, 41.55, 90, 'clasp')                             # warming his hands over it
put('shopping_cart', 461.5, 41.75, 20, on='"')
put('bin_bag', 458.0, 42.6, on='"')
lv.paint('litter_a', 462.6, 42.2)
lv.paint('litter_b', 452.9, 42.4, 180)
lv.area('miami: the freeway\'s bank (palms, the billboard, the burnt car, the fence)')
WRECK = (486.0, 41.85)                       # the car that came off the freeway, through its rail, and burned here
lv.props[:] = [p for p in lv.props if not (p[1] == 'guardrail' and abs(p[3] - (F1 + 1.15)) < 0.01 and 478.5 < p[2] < 491.5)]
boxes[:] = [b for b in boxes if not (abs((b[1] + b[3]) / 2 - (F1 + 1.15)) < 0.05 and 478.5 < (b[0] + b[2]) / 2 < 491.5)]


def end_to_end(kind, col, row, deg=0):
    """A length of rail or fence laid touching its neighbours (as `rail` lays them)."""
    boxes.append(Level.box(kind, col, row, deg))
    lv.prop(kind, col, row, deg)


end_to_end('guardrail_dented', 481.0, F1 + 1.15, 180)                    # bent in where it went through
must('car_burnt', WRECK[0] + 0.6, WRECK[1], 180, on='"')
lv.paint('litter_b', 491.0, 42.3)
for c in list(range(462, 481, 4)) + [489, 493]:                        # the fence along the bank's foot (the camp's
    end_to_end('chainlink_hole' if c == 466 else 'chainlink_fence', c + 2.0, R0 - 0.27)   # way through it)
must('royal_palm', 468.0, 42.0, on='"')
must('royal_palm_b', 493.6, 41.8, on='"')
lv.prop('billboard_tan', 477.0, 42.3 - 50 / 32)                          # (hung: its legs on the bank, its face over the rail)
lv.prop('billboard_radio', 511.0, 42.3 - 50 / 32)
must('crash_cushion_hit', 522.4, 42.1, 0, on='"=')
lv.paint('litter_a', 518.6, 42.3)                                         # (off the WRONG WAY's foot)
lv.area('miami: the cold store, the motel\'s back, the used car lot (south)')
lv.put(464, R1 + 3, 'L')                                                  # the cold store's office door, under its canopy
lv.prop('deco_canopy_mint', 464.5, R1 + 3 - 20 / 32)
must('royal_palm_b', 466.9, R1 + 1.55)
lv.paint('tree_grate', 466.9, R1 + 1.55)
must('pole_sign_motel', 472.7, R1 + 1.45)
lv.prop('neon_sign_motel', 474.6, R1 + 2.91)                             # (neon reads one way up: never turned)
must('hibiscus_hedge', 476.6, R1 + 2.42)
lv.prop('neon_sign_flamingo', 477.4, R1 + 2.91)
for c in range(LOT_S[0] - 14, LOT_S[0] + 1):                             # the motel's back in pink stucco, its door
    lv.put(c, R1 + 3, 'L' if c == 480 else 'P')                           # under the canopy (both were a blind brick wall)
lv.prop('deco_canopy_pink', 480.5, R1 + 3 - 20 / 32)
must('hibiscus_hedge_pink', 483.9, R1 + 2.42)
lv.prop('neon_sign_vacancy', 483.6, R1 + 2.91)
must('pole_sign_autos', 485.0, R1 + 1.45)
lv.paint('display_ramp', 490.6, R1 + 2.0)
must('car2', 490.6, R1 + 2.05, 0, on='_', lights=False)                 # an 80s coupe up on its ramp, for sale
for c in (487.8, 493.6):
    must('lot_light', c, R1 + 1.25, 0, on='_')
lv.prop('pennant_string', 490.7, R1 + 1.3)                               # strung between the poles (the two strung to the
                                                                         # door hid the coupe under their flags)
for c in range(LOT_S[0], LOT_S[1] + 1):                                  # its kerb, dropped at the way in
    lv.paint('kerb_n_low' if 489 <= c <= 491 else 'kerb_n', c + 0.5, R1 + 1 + 1 / 32)
lv.area('miami: the ramp (an old crash, a call box, palms and hibiscus on its bank, its slabs)')
lv.props[:] = [p for p in lv.props if not (p[1] == 'guardrail' and abs(p[3] - RAIL_S) < 0.01 and 526.5 < p[2] < 531.5)]
boxes[:] = [b for b in boxes if not (abs((b[1] + b[3]) / 2 - RAIL_S) < 0.05 and 526.5 < (b[0] + b[2]) / 2 < 531.5)]
end_to_end('guardrail_dented', 530.0, RAIL_S, 180)
lv.paint('tyre_marks', 527.0, 47.73)
lv.paint('crash_debris', 532.6, R1 + 1.45)
must('call_box', 538.5, R1 + 1.7, 0, on='=')
# the gantry over the gore's nose, where the two roads run side by side a lane apart: each panel over the middle of
# its own (at the gore's tip they meet: the far panel stood over the freeway's left edge)
lv.prop('sign_gantry', M0 + 2.5, F0 + 7.6)
for (kind, c) in (('royal_palm_b', 507.5), ('royal_palm', 525.0), ('royal_palm_b', 541.5), ('royal_palm', 556.0)):
    must(kind, c, R1 + 3.6, on='"')
must('hibiscus_hedge_pink', 533.6, R1 + 3.45, on='"')
must('hibiscus_hedge', 550.0, R1 + 3.45, on='"')
for c in range(M0 + 3, TOLL_X, 6):                                      # the freeway's concrete slabs from the gore on (the
    for r in (39.5, 45.5):                                               # ramp is asphalt): a joint every 6 m right across,
        lv.paint('expansion_joint', c, r)                                # in step with the toll approach's
for (c, r) in ((505.0, LANES1[0]), (520.0, LANES1[1]), (544.0, LANES1[0]), (553.0, LANES1[1]), (470.0, LANES1[1]),
               (533.0, 39.25), (551.0, 41.75)):
    lv.paint('oil_streak', c, r)
# the merge's far side (the freeway's lanes coming in: nobody of his is held up there): a load lost off a truck, the
# rubber of whoever braked for it, the bits of a mirror
lv.paint('mattress_dumped', 553.8, 39.3, 160)                           # (in a lane, clear of its lines)
lv.paint('tyre_marks', 543.5, 39.0 + 36 / 32 - 0.3)
lv.paint('crash_debris', 546.6, 41.9, 90)

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
# DECO_PROPS (tools/generate_assets.py; the ramp's MIAMI_PROPS too). What is seen of the plaza is its road (the view
# is 11 m high): the dressing is on it and at its edges. An art deco planter in flower at the end of each island past
# the gates (in the plaza's leg: between its lanes' bands), fan palms on the plaza's wide shoulders and along the
# verges with hibiscus at their feet, deco lamps by the roof, the toll office on the south shoulder before the islands
# with a trooper's car parked at it (the wheel kept off them: the plaza leg's `across`), a billboard for the Flamingo
# Motel (level 3) over the freeway's verge and the ramp's suntan one on the approach's, rain standing in puddles with
# the neon in them, oil under each booth, rubber before each gate.
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
lv.prop('billboard_tan', 583.0, 51.6)
for (kind, c, r) in (('puddle_neon', 604.0, 41.4), ('puddle_neon_b', 613.6, 46.6), ('puddle_neon_b', 596.0, 37.8),
                     ('puddle_neon', 619.0, 39.9), ('puddle_neon_b', 590.5, 45.8), ('puddle_neon', 600.5, 52.6)):
    lv.paint(kind, c, r)
for (k, r) in enumerate(PLAZA):
    lv.paint('oil_stain_b' if k % 2 else 'oil_stain_a', CANOPY_X - 0.4 + (k % 2) * 0.9, r + 0.2)   # under each booth's lane
    lv.paint('skid_marks', GATE_X - 2.4 - (k % 2) * 0.8, r + (0.15 if k % 2 else -0.2))             # rubber before its gate

# its lights (the night section adds them): sodium pools on the fan and the fan back (they were dark), the neon of the
# roof's fascias on the road (pink in, teal out), each booth's window, the office's sign, the billboards' lamps
TOLL_LIGHTS = [[c, r, 9, '#ffb46a', 0.3] for (c, r) in ((589, 36.0), (589, 50.0), (595, 43.0), (600, 35.5), (600, 50.5), (614, 35.5),
                                                       (614, 50.5), (619, 43.0), (624, 37.0), (624, 49.0), (633, 43.0), (642, 39.0),
                                                       (642, 47.0))]
TOLL_LIGHTS += [[604.4, r, 5, '#ff4aa6', 0.3] for r in (38.5, 47.5)] + [[611.8, r, 5, '#38f0dc', 0.28] for r in (38.5, 47.5)]
TOLL_LIGHTS += [[CANOPY_X + 0.3, r + 0.9, 3, '#ffd890', 0.25] for r in ISLANDS[:4]]
TOLL_LIGHTS += [[591.0, 52.0, 4, '#38f0dc', 0.3], [661.0, 47.6, 6, '#ff8ac8', 0.2], [583.0, 50.4, 6, '#8af0e8', 0.2]]


# ================================================================ THE HARMONY PASS: from the suburb to Miami
# (docs/LEVEL2.md "Segment 1, section by section": the column MIAMI of its table; the user, 2026-11-20: "le debut est
# raccord avec le suburb du niveau 1, mais la transition est trop brutale ... on s'approche de Miami mais on reste
# encore un peu en banlieue ... plus de palmiers ... des clodos et tout ... enleve les futs de biere".) The street is
# a GRADIENT, section by section, from level 1's district to the alley's pastel stucco and the ramp's royal palms:
#   0  (cols 0-61)     the bar's district as level 1 left it: brick, the shops' neon, nothing of Miami
#   1  (62-246)        the first scruffy cabbage palms among the street trees, a bail-bond bus bench, the strip's pole
#                      sign, fallen fronds; the derelict stretch: a stump, palms gone wild in the vacant lot, the homeless
#   2  (247-312)       the bus stop (a lawyer's bench, a pastel pay phone, young palms in grates), the first pastel
#                      front, then HOUSES: stucco in four pastels behind their front yards (garden walls, a chain-link
#                      fence, oleanders, lawn flamingos, mailboxes on posts, cabbage and coconut palms)
#   3  (313-356)       pastel awnings, peach and mint fronts; THE FRUIT MARKET (the lorry's dodge)
#   4  (357-403)       the diner under a deco canopy, young palms along its kerb, a flamingo in neon
#   5  (404-449)       stucco on every front, royal palms lit from their feet, hibiscus, deco canopies, neon tubes,
#                      rain in the gutters with the neon in it: the alley, the motel and the ramp follow
# Laid AFTER the street's dice are all thrown (nothing here draws from `rng`: the parked cars, the shops and the roofs
# stay where they were): things are taken away or swapped by hand, the new ones have their place.
def drop(pick):
    """Take away the props `pick(kind, col, row)` chooses, and the room they held."""
    gone = [p for p in lv.props if pick(p[1], p[2], p[3])]
    for p in gone:
        lv.props.remove(p)
        if SIZES.get(p[1]):
            b = Level.box(p[1], p[2], p[3], p[4])
            boxes[:] = [o for o in boxes if max(abs(o[k] - b[k]) for k in range(4)) > 0.1]
    return gone


def swap(kind, col, new, row=None, dc=0.0, deg=None, on='s'):
    """The prop `kind` at column `col` becomes a `new` one (at its own place unless told)."""
    old = drop(lambda k, c, r: k == kind and abs(c - col) < 0.25)
    assert len(old) == 1, f'{len(old)} {kind} at col {col}'
    (_, _, c, r, d, opt) = old[0]
    must(new, c + dc, r if row is None else row, d if deg is None else deg, on=on, **opt)


def unpaint(pick):
    lv.floor[:] = [f for f in lv.floor if not pick(f[0], f[1], f[2])]


def stucco(c0, c1, tile, north):
    """The plain wall of the fronts from c0 to c1 painted in a pastel (the windows and doors as they are)."""
    for c in range(c0, c1 + 1):
        r = 7 if north else s_face(c)
        if lv.tiles[r][c] == 'X':
            lv.put(c, r, tile)


HARMONY_LIGHTS = []         # [col, row, r tiles, colour, intensity] (the night section adds them)
PASTEL = {'awning_red': 'awning_pink', 'awning_green': 'awning_mint', 'awning_blue': 'awning_lavender', 'awning_wine': 'awning_peach'}

# ---------------------------------------------------------------- 1: the first palms (cols 62-147)
lv.area('harmony 1: the first palms, the strip')
swap('street_tree', 83.5, 'sabal_palm')
swap('street_tree', 92.5, 'sabal_palm_b')
must('bus_bench_bail', 81.0, 8.58)
lv.paint('sabal_frond_fallen', 94.4, 10.3, 20)
lv.paint('litter_bottles', 79.2, 9.4)
must('news_box_yellow', 109.6, 16.45)
must('news_box_red', 110.2, 16.45)
must('pole_sign_strip', 118.6, 17.25)                                     # PALM PLAZA: the strip's tenants on its pole
must('sabal_palm_ragged', 130.6, 16.5)
lv.paint('sabal_frond_fallen', 129.2, 17.2, 200)
# somebody's camp in the strip's blind doorway (nobody home: he is down the street with his cart)
must('doorway_camp', 134.2, 17.36, 180)
lv.paint('cardboard_sign', 135.9, 16.7)
lv.paint('litter_bottles', 132.4, 16.8, 90)
# under the railway bridge: a bedroll left by the bench, bottles
must('bedroll', 150.6, 17.6)
lv.paint('litter_bottles', 151.0, 16.7)
lv.paint('litter_a', 154.4, 8.5)

# ---------------------------------------------------------------- 1: the derelict stretch (cols 157-246)
lv.area('harmony 1: the dark stretch (palms gone wild in the lot, the homeless)')
must('palm_stump', 173.4, 8.45)                                           # one the city cut down
for (kind, c, r) in (('sabal_palm_ragged', 168.2, 7.0), ('sabal_palm_b', 210.6, 7.0)):
    must(kind, c, r, on='~"')                                             # in the lot, their crowns over the fence
must('coconut_palm_lean', 187.4, 6.9, 75, on='~"')                       # leaning out of the lot over the sidewalk
lv.paint('coconuts_fallen', 188.6, 8.5)
lv.paint('palm_frond_fallen', 185.6, 8.45)
lv.paint('sabal_frond_fallen', 169.4, 8.5, 150)
lv.paint('sabal_frond_fallen', 209.6, 8.5, 30)
# a man asleep on his cardboard against the blind wall, his things by him; another with his cart, smoking
lv.paint('cardboard_bed_blanket', 188.4, 17.4)
lv.patron('tramp', 188.3, 17.4, 180, 'sleep')
must('bags_pile', 186.6, 17.58, 180)
lv.paint('cardboard_sign', 190.3, 16.75)
lv.paint('litter_bottles', 187.4, 16.6)
must('cart_loaded', 219.3, 17.45, 0)
lv.patron('tramp', 220.3, 17.2, 250, 'smoke')
lv.paint('litter_bottles', 222.6, 16.7, 180)
lv.paint('litter_b', 203.6, 16.8)
lv.paint('litter_a', 239.0, 16.7, 90)
HARMONY_LIGHTS += [[187.5, 9.0, 5, '#7a5ad8', 0.2], [219.6, 17.0, 4, '#ffa860', 0.16], [173.0, 16.6, 6, '#7a5ad8', 0.16],
                   [168.2, 8.6, 4, '#5a6ad8', 0.16], [210.6, 8.6, 4, '#5a6ad8', 0.16], [233.0, 16.6, 6, '#7a5ad8', 0.16]]

# ---------------------------------------------------------------- 2: the bus stop (cols 247-271)
lv.area('harmony 2: the bus stop (a lawyer\'s bench, the pay phone, people waiting, young palms)')
swap('bench', 263.2, 'bus_bench_abogado', row=8.6)
must('payphone_pastel', 252.6, 8.45)
lv.patron('civ3', 252.6, 9.0, 270, 'phone')                               # a man at the pay phone
lv.patron('civ2', 255.7, 9.9, 90, 'cross')                                # waiting for the night bus
lv.patron('civ4', 263.2, 8.62, 90, 'watch')                               # sat on the bench
for c in (249.5, 267.5, 270.5):
    lv.paint('tree_grate', c, 10.2)
    must('palm_young', c, 10.2)
must('news_box_red', 253.2, 16.45)
must('news_box_yellow', 253.8, 16.45)
stucco(255, 263, 'Y', True)                                               # the first pastel front
stucco(265, 271, 'M', False)

# ---------------------------------------------------------------- 2: the houses and their front yards (cols 277-311, north)
# The shops of this block are houses: stucco in four pastels (their fronts on row 7 as before, two pairs of windows
# and a door each), a front yard two metres deep where the wide sidewalk was (rows 8-9, grass) behind a low garden
# wall or a chain-link fence along the sidewalk left (row 10), a path to each door, a mailbox on its post at the gate
lv.area('harmony 2: the houses, their front yards')
YARDS = ((277, 284, 'Y', 'garden_wall_cream'), (286, 293, 'M', 'yard_fence'), (295, 302, 'P', 'garden_wall_pink'),
         (304, 311, 'V', 'garden_wall_mint'))
drop(lambda k, c, r: 276.6 < c < 312.4 and 7.9 < r < 10.3)               # the shops' signs, awnings, benches, trees
unpaint(lambda k, c, r: k == 'tree_grate' and 276 < c < 312 and r < 11)
for c in range(276, 313):
    lv.put(c, 7, 'X')
lv.fill(277, 8, 311, 9, '"')
for (k, (a, b, tile, fence)) in enumerate(YARDS):
    door = (a + b) // 2
    for c in range(a, b + 1):
        lv.put(c, 7, 'L' if c == door else 'G' if c in (a + 1, a + 2, b - 2, b - 1) else tile)
    lv.fill(door, 8, door, 9, 's')                                        # the path to the door
    if fence == 'yard_fence':                                             # (chain-link, the oleander grown through it)
        must('yard_fence', a + 1.1, 9.92, on='"s')
        must('yard_fence_gate', b - 0.9, 9.92, on='"s')
    else:
        must(fence, a + 1.5, 9.84, on='"s')
        must(fence, b - 0.5, 9.84, on='"s')
    must('mailbox_post', door + 1.25, 10.2)
    lv.paint('lawn_dry_b', a + 1.5, 9.0, 0 if k % 2 else 180)
    lv.paint('lawn_dry_b', b - 0.5, 9.0, 180 if k % 2 else 0)
    lv.prop('wall_lamp', door + 1.5, 8.06, 0)                             # the porch light
    HARMONY_LIGHTS.append([door + 1.0, 8.8, 3, '#ffd9a0', 0.22])
for (kind, c, r, deg) in (('oleander_pink', 278.4, 8.7, 0), ('sabal_palm', 282.6, 9.0, 0), ('lawn_flamingos', 279.75, 9.15, 0),
                          ('sabal_palm_b', 287.6, 8.95, 0), ('oleander_white', 292.2, 8.7, 0),
                          ('oleander_white', 296.4, 8.7, 0), ('coconut_palm_lean', 300.6, 8.75, 40),
                          ('oleander_pink', 305.4, 8.7, 0), ('sabal_palm_ragged', 309.4, 9.0, 0), ('lawn_flamingos', 308.4, 9.15, 180)):
    must(kind, c, r, deg, on='"')
lv.paint('coconuts_fallen', 302.4, 10.4)
lv.paint('palm_frond_fallen', 299.0, 10.45, 185)
lv.paint('sabal_frond_fallen', 288.6, 10.4, 60)
lv.paint('sabal_frond_fallen', 310.6, 10.35, 200)

# ---------------------------------------------------------------- 3: THE FRUIT MARKET (the lorry's dodge, cols 325-354)
# The cafe's terrace is gone (the user: "les terrasses comme ca, pas sur ... peut-etre autre chose"). Of the three sets
# painted for it the fruit market is the one that reads at night and from the wheel: its stalls are lit (a bulb each,
# strings of them along its front), its awnings and fruit are the brightest things of the block, its signs are the
# street's Spanglish, and everything in it is torn or flung (stalls torn, their fruit and coconuts all over the road,
# crates and signs thrown: nothing `lasting`, nothing bolted but the stalls). The tyre yard is black rubber on a dark
# lot (and round things by a road were what read as kegs); the car wash has too little to send flying. The geometry
# is the terrace's: the fronts four metres back (row 21), open ground from the kerb to them, the way round the lorry
# at col 340 (the event's `gap`). Its ground: the sidewalk's row along the kerb, then beaten earth: a vacant corner.
lv.area('harmony 3: the fruit market (everything flies)')
drop(lambda k, c, r: T0 - 0.7 < c < T1 + 1.3 and 16 <= r < 23)           # the terrace, the cafe's signs and lamps
lv.patrons[:] = [p for p in lv.patrons if not (T0 < p[1] < T1 and 16 < p[2] < 21)]
lv.fill(T0, 17, T1, 20, '~')
lv.prop('neon_sign_palm', T0 + 3.0, 20.91)                                # the fruteria behind it
lv.prop('neon_sign_open', T1 - 2.0, 20.91)
for c in (T0 + 7.0, T0 + 16.5, T0 + 20.5):
    lv.prop('awning_peach', c, 20.44, 180)
for x in range(T0 + 2, T1, 5):
    lv.prop('ceiling_lamp', x + 0.5, 22.3)
    lv.prop('wall_lamp', x + 2.5, 20.9, 180)
STALLS = [(T0 + 3.4 + i * 5.5, 17.78, 'market_stall' if i % 2 == 0 else 'market_stall_coco') for i in range(5)]
STALLS += [(T0 + 6.2 + i * 5.5, 19.7, 'market_stall_coco' if i % 2 == 0 else 'market_stall') for i in range(4)]
for (c, r, kind) in STALLS:
    must(kind, c, r, on='~')
CRATES = ('fruit_crate_orange', 'fruit_crate_mango', 'fruit_crate_coconut')
n = 0
for i in range(5):                                                        # crates stacked between two stalls, by the kerb
    c = T0 + 3.4 + i * 5.5
    for (dx, r, deg) in ((1.75, 17.35, 0), (2.45, 17.5, 90), (1.8, 18.0, 0), (3.1, 18.15, 0), (2.6, 16.42, 0), (3.25, 16.4, 0), (-0.6, 16.4, 0))[:5 + i % 3]:
        n += 1
        if c + dx < T1 + 0.4:
            must(CRATES[n % 3], c + dx, r, deg, on='s~')
    if i % 2 == 0:
        must('market_sign', c + 0.6, 16.4)                               # MANGOS FRESH 3/$1, by the kerb
for i in range(7):
    lv.prop('string_lights', T0 + 3.2 + i * 3.9, 16.82)                   # bulbs strung along its front
must('sabal_palm_b', T0 + 0.7, 18.9, on='~')
must('coconut_palm_lean', T1 - 0.4, 19.5, 205, on='~')                   # leaning in over the last stalls
lv.paint('coconuts_fallen', T1 - 2.6, 18.6)
lv.paint('palm_frond_fallen', T0 + 1.9, 19.6, 30)
lv.paint('litter_b', T0 + 10.4, 18.9)
lv.paint('litter_a', T0 + 21.5, 18.8, 90)
lv.patron('civ2', T0 + 8.9, 18.85, 270, 'cross')                          # the man who keeps the stalls
lv.patron('civ4', T0 + 20.6, 16.75, 90, 'smoke')                          # a customer at this hour
stucco(T0, T1, 'Y', False)
# its block: pastel awnings from here on, peach and mint fronts
stucco(314, 322, 'Y', True)
stucco(323, 332, 'M', True)
stucco(343, 357, 'P', True)
stucco(316, 323, 'M', False)

# ---------------------------------------------------------------- 4: the lit corner, the cross street (cols 357-403)
lv.area('harmony 4: the diner under its canopy, young palms, more neon')
lv.prop('deco_canopy_pink', D0 + 15.5, 18 - 20 / 32, 180)                # over the diner's door
for c in (366.2, 373.6, 380.4):
    lv.paint('tree_grate', c, 16.5)
    must('palm_young', c, 16.5)
stucco(D0, D1, 'P', False)
stucco(362, 372, 'M', True)
stucco(374, 384, 'Y', True)
lv.prop('neon_sign_flamingo', 386.2, 8.09)                                # on the blind wall by the corner
lv.prop('neon_tube_pink', 360.4, 8.06, 0)
swap('news_box', 389.4, 'news_box_yellow')
swap('news_box', 390.52, 'news_box_red')
swap('mailbox', 401.4, 'mailbox_blue')

# ---------------------------------------------------------------- 5: to the freeway (cols 404-449)
# Sunset Bay's own: every front in stucco, royal palms in their grates lit from their feet (pink and cyan in turn, as
# the ramp's), hibiscus along the walls, a deco canopy over a door, tubes of neon, puddles holding it
lv.area('harmony 5: royal palms, hibiscus, deco canopies, stucco')
drop(lambda k, c, r: 404 < c < 441.5 and 8.2 < r < 10.3 and k in ('bench', 'trash_can', 'sandwich_board', 'vending', 'palm_tree'))
unpaint(lambda k, c, r: k == 'tree_grate' and 404 < c < 446 and r < 11)
for (k, c) in enumerate((408.5, 419.5, 428.5, 438.5)):
    lv.paint('tree_grate', c, 8.7)
    must('royal_palm' if k % 2 else 'royal_palm_b', c, 8.7)
    HARMONY_LIGHTS.append([c, 9.2, 2.6, '#ff4a9a' if k % 2 else '#3ae8ff', 0.5])
swap('bench', 442.2, 'bus_bench_bail', row=8.6, dc=-2.2)
for (kind, c) in (('hibiscus_hedge', 413.4), ('hibiscus_hedge_pink', 424.0), ('hibiscus_hedge', 434.2)):
    must(kind, c, 8.42)
for (x, w, kind, door, face) in north_shops:
    if x >= 400 and door == 0:
        lv.prop(('deco_canopy_mint', 'deco_canopy_peach', 'deco_canopy_lavender', 'deco_canopy_pink')[x % 4], x + 0.5, 8 + 20 / 32, 180)
for (c0, c1, tile) in ((400, 408, 'P'), (409, 418, 'M'), (419, 429, 'V'), (430, 440, 'Y')):
    stucco(c0, c1, tile, True)
for (c0, c1, tile) in ((400, 407, 'M'), (408, 417, 'Y'), (422, 431, 'P'), (432, 439, 'V')):
    stucco(c0, c1, tile, False)
drop(lambda k, c, r: k == 'paper_bundle' and abs(c - 414.1) < 0.5)
must('hibiscus_hedge_pink', 415.6, 17.58)
for c in (411.5, 426.5):
    lv.paint('tree_grate', c, 16.5)
    must('palm_young', c, 16.5)
lv.prop('neon_tube_pink', 416.6, 17.94, 180)
for (kind, c, r) in (('puddle_neon', 414.0, 11.9), ('puddle_neon_b', 427.4, 15.4), ('puddle_neon', 437.0, 12.3), ('puddle_neon_b', 384.0, 15.5)):
    lv.paint(kind, c, r)
lv.paint('palm_frond_fallen', 430.4, 10.5, 170)
lv.paint('litter_bottles', 443.2, 10.3)

# pastel awnings: one in two from the bus stop on, all of them from the market on
for (i, p) in enumerate(lv.props):
    if p[1] in PASTEL and p[2] < WS and (p[2] >= 313 or (p[2] >= 247 and int(p[2]) % 2 == 0)):
        lv.props[i] = (p[0], PASTEL[p[1]], *p[2:])

# ---------------------------------------------------------------- part two, tied to the street
# the same families down the frontage road: the street's news boxes by the motel, the camp's men have the same cart
# and cardboard as the street's, bottles and fronds on its sidewalk; no loose drum by the lane
lv.area('harmony: part two (the street\'s furniture carried on)')
if drop(lambda k, c, r: k == 'shopping_cart' and abs(c - 461.5) < 0.3):
    must('cart_loaded', 461.5, 41.75, 20, on='"')
lv.paint('cardboard_sign', 460.4, 42.55)
must('news_box_yellow', 473.7, 49.62)
must('news_box_red', 474.3, 49.62)
lv.paint('litter_bottles', 478.9, 48.6)
lv.paint('palm_frond_fallen', 468.4, 48.5, 200)
lv.paint('sabal_frond_fallen', 495.2, 43.4, 40)
if drop(lambda k, c, r: k == 'oil_drum' and abs(c - (DOCK_S[1] + 0.3)) < 0.2 and abs(r - (R1 + 2.6)) < 0.2):
    must('bin_bag', DOCK_S[1] + 0.3, R1 + 2.6)
# the cushion at the bank's nose: the plaza's own kind (it was two burst sand barrels: drums by a road again)
if drop(lambda k, c, r: k == 'crash_cushion_hit'):
    must('crash_cushion_narrow', 522.4, 42.1, 0, on='"=')
# the toll's approach and the freeway's start were bare asphalt in the dark (their verges are off the picture): the
# ramp's slabs carried on (a joint every 6 m, oil down the lanes), rubber, rain standing with the plaza's neon in it,
# sodium between the tall lamps
lv.area('harmony: the toll\'s approach, the freeway\'s start')
for c in range(TOLL0 + 3, FAN[0] - 1, 6):
    for r in (39.5, 45.5):                                                # (6 m each: the four lanes across)
        lv.paint('expansion_joint', c, r)
for (kind, c, r, deg) in (('oil_streak', 564.0, 44.25, 0), ('oil_streak', 571.0, 41.75, 0), ('oil_streak', 583.5, 46.75, 0), ('oil_streak', 567.5, 39.25, 0),
                          ('tyre_marks', 569.0, 45.6, 0), ('puddle_neon_b', 573.4, 47.4, 0), ('puddle_neon', 585.0, 38.4, 0),
                          ('crash_debris', 579.6, 48.6, 0), ('litter_a', 565.0, 48.5, 0),
                          ('oil_streak', 646.0, 44.25, 0), ('oil_streak', 656.0, 41.75, 0), ('puddle_neon', 650.5, 45.4, 0),
                          ('tyre_marks', 634.0, 40.6, 0), ('puddle_neon_b', 662.0, 42.6, 0), ('litter_b', 644.0, 39.6, 0)):
    lv.paint(kind, c, r, deg)
HARMONY_LIGHTS += [[568.0, 43.0, 9, '#ffb46a', 0.24], [575.5, 39.5, 8, '#ffa860', 0.2], [582.0, 46.5, 8, '#ffb46a', 0.24],
                   [585.5, 40.0, 5, '#ff4aa6', 0.16], [648.0, 43.0, 9, '#ffb46a', 0.22], [660.0, 43.0, 9, '#ffa860', 0.2]]

# ================================================================ POLISH: the street from its start to the dark stretch (cols 0-220)
# (the user, 2026-11-20: "il faut passer sur tout le niveau et peaufiner, avoir un rendu realiste, clean et pro".) Walked
# frame by frame and on a map of it at a world px a px: what the street's shared rules (the junctions, the drains every
# 34 m, the lamps every 12, a meter at every tee) laid wrong there is put right by hand. Laid after the street's dice
# (nothing here draws from `rng`), before the kerbs (`painted` is theirs).
lv.area('polish west: drains, paint and kerbs at Coral Street')
# a drain is never on a crossing, a bay's hatching, a tee or a hydrant's valve: each in its gutter beside it, Coral
# Street's at the inside corners of its bulb-outs, where the parking rows' gutters run into them
for (c, r, to) in ((CORAL[0] - 0.6, 11 + 8 / 32, (CORAL[0] - 4.9, 9 + 8 / 32)), (CORAL[1] + 1.6, 16 - 8 / 32, (CORAL[1] + 5.4, 16 - 8 / 32)),
                   (95.5, 18 - 8 / 32, (103.0, 16 - 8 / 32)), (163.5, 16 - 8 / 32, (160.6, 16 - 8 / 32)), (188.5, 9 + 8 / 32, (185.2, 9 + 8 / 32))):
    unpaint(lambda k, x, y, c=c, r=r: k == 'drain' and abs(x - c) < 0.05 and abs(y - r) < 0.05)
    lv.paint('drain', *to)
for c in (CORAL[0] - 1, CORAL[1] + 1):                                   # no red stub poking out from under a corner
    for r in (11, 16):
        painted.pop(('h', c, r), None)
# the news boxes off the crossing's kerb ramp (they stood on its landing), west of it by the kerb
drop(lambda k, c, r: k == 'news_box' and CORAL[0] - 3 < c < CORAL[0] - 1.4 and abs(r - 16.45) < 0.05)
for i in range(3):
    must('news_box', CORAL[0] - 5.0 + i * 0.56, 16.45)
lv.area('polish west: meters, signs, lamps')
# a meter serves the bay east of its tee: none at a row's last tee
drop(lambda k, c, r: k == 'parking_meter' and any(abs(c - (t + 0.2)) < 0.05 for t in (44, 88, 146, 200)))
if drop(lambda k, c, r: k == 'sign_noparking' and abs(c - (B0 - 0.6)) < 0.05):           # (not in front of a door)
    must('sign_noparking', B0 - 0.25, 8.7)
# PALM PLAZA's pole sign stood with its panels half in the south fronts (2 m of sidewalk under a 2.75 m sign) and against
# a lamp: it stands where the north sidewalk is three metres wide, at its end before the strip's block
drop(lambda k, c, r: k == 'pole_sign_strip')
must('pole_sign_strip', 102.4, 9.62)
# lamps: none under a palm's crown (84: off it and its drain) nor in front of a door (108); the dark stretch's (one in two by the rule, which
# with the bridge and an alley mouth left 60 m without one, and one over a barricade of the works) every 14 m on
# alternate sides, each one failing its own way
drop(lambda k, c, r: k == 'streetlight' and (abs(c - 84.5) < 0.05 or abs(c - 108.5) < 0.05 or DARK[0] < c < 220))
for (c, north, fault) in ((87.5, True, None), (105.9, True, None), (166.5, False, 'stutter'), (180.5, True, 'broken'),
                          (195.0, False, 'dying'), (208.5, True, 'broken')):
    row, deg = (n_kerb(int(c)) - 0.28, 90) if north else (s_kerb(int(c)) + 0.28, 270)
    must('streetlight', c, row, deg, **({'flicker': fault} if fault else {}))
lv.area('polish west: the vacant lot')
# no drum (docs/LEVEL2.md: "No keg, no drum"): a dumped mattress and a stack of pallets in the lot instead
drop(lambda k, c, r: k == 'barrel' and LOT[0] < c < 220)
lv.paint('mattress_dumped', LOT[0] + 20.6, 6.5, 14)
must('pallet_stack', LOT[0] + 53.4, 6.6, 15, on='~"')


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


# what the car may meet on a bend's line (CHASE.bend.smash: torn off, thrown and burst, never LASTING: tests/alley.test.mjs
# holds data/props.js to it), and the cars it scrapes along their flank (never across the line itself, `scrape` tiles
# off it at least)
SMASH = {'produce_crates', 'box_stack', 'trash_can', 'bin_bag', 'fruit_cart', 'news_stand', 'domino_table', 'plastic_chair',
         'scooter_pink', 'scooter_mint', 'bottle_crate', 'hydrant', 'neon_box_pink', 'neon_box_cyan', 'dumpster_mint',
         'dumpster_pink', 'dumpster_aqua', 'cardboard_box', 'crate', 'pallet_stack', 'oil_drum', 'traffic_cone'}
SCRAPE = {'car', 'car2', 'van'}


def check_bend(path, r, wall=1.5, prop=1.3, scrape=0.6):
    """The bend's line is clear: no wall, window or door within `wall` tiles of it, no prop within `prop` but what
    the car ploughs through (SMASH) and the cars it scrapes (SCRAPE: `scrape` off it)."""
    pts = bend_line(path, r)
    for (px, py) in pts:
        for y in range(int(py - wall), int(py + wall) + 1):
            for x in range(int(px - wall), int(px + wall) + 1):
                if lv.tiles[y][x] in BLOCKS or lv.tiles[y][x] in 'GDL':
                    d = math.hypot(max(x - px, 0, px - x - 1), max(y - py, 0, py - y - 1))
                    assert d >= wall, f'the bend\'s line at {px:.1f},{py:.1f} is {d:.2f} from the wall at {x},{y}'
    for (_, kind, col, row, deg, _) in lv.props:
        if SIZES.get(kind) is None or kind in SMASH:
            continue
        b = Level.box(kind, col, row, deg)
        for (px, py) in pts:
            d = math.hypot(max(b[0] - px, 0, px - b[2]), max(b[1] - py, 0, py - b[3]))
            assert d >= (scrape if kind in SCRAPE else prop), f'{kind} at {col},{row} is {d:.2f} from the bend\'s line at {px:.1f},{py:.1f}'


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
lights += ALLEY_LIGHTS                                                         # the alley's neon and sodium
lights += [[x, 46.0, 9, '#ffa860', 0.2] for x in (445, 458, 482)]              # the frontage road's (the first at the T)
lights += [[x, 39.0, 9, '#ffb46a', 0.22] for x in range(462, TOLL_X, 30)]       # the freeway's lamps along its bank
lights += [[x, 47.0, 9, '#ffa860', 0.26] for x in (515, 545)]                   # the ramp's
lights += [[x, 45.5, 9, '#5a6ad8' if (x // 15) % 2 else '#7a5ad8', 0.26] for x in (RAMP_X + 2, 530)]   # the night between
lights += [[x, MID, 10, '#5a6ad8' if (x // 15) % 2 else '#7a5ad8', 0.26] for x in range(TOLL0 + 4, W, 30)]   # the freeway's
lights += [[CANOPY_X, MID + d, 9, '#e8f0ff', 0.22] for d in (-6, 0, 6)]  # the plaza under its lit roof
lights += TOLL_LIGHTS                                                    # (the toll's block: its neon, pools, windows)
# leg 1 in 1985 (the neon, the billboards, the drum's fire and the lot are their props' own lights): the palms lit
# from their feet, pink and cyan in turn, the green signs from below, more sodium over the merge (it was the dark end)
lights += [[c, r, 2.6, '#ff4a9a' if k % 2 else '#3ae8ff', 0.5] for (k, (c, r)) in enumerate(((466.9, 48.8), (468.0, 42.3), (493.6, 42.1), (507.5, 50.3), (525.0, 50.3), (541.5, 50.3), (556.0, 50.3)))]
lights += [[c, r, 2.2, '#e8fff0', 0.4] for (c, r) in ((RAMP_X - 3.0, 49.2), (RAMP_X + 21.0, 48.3), (RAMP_X + 13.0, 48.3))]
lights += HARMONY_LIGHTS                                                 # (the harmony pass's: palms' feet, porches)
lights += [[531.0, 41.5, 8, '#ffb46a', 0.32], [541.0, 44.5, 9, '#ffa860', 0.3], [552.0, 45.5, 8, '#ffa860', 0.34], [557.0, 40.0, 8, '#ffb46a', 0.3]]

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
    {'at': BEND_AT, 'path': [[BEND_AT, LANES[1]], [ALLEY_X, LANES[1]], [ALLEY_X, LANES1[1]], [ALLEY_X + 14, LANES1[1]]],
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
    # THE CHECKPOINTS (systems/Checkpoints.js; the user's call: 2A alone keeps them, one a part as the road was cut: the user's two, the street and
    # from the detour on; a part added later brings its own):
    # the car's middle at `at` records it; a death after it restarts there, on its leg's lane (ours), rolling
    'checkpoints': [
        {'at': 0, 'name': 'THE STREET'},                      # part 1: the start
        {'at': SIDE_X + 16, 'name': 'THE ON-RAMP'},           # part 2: just out of the detour's turns, on leg 1
    ],
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


# the road's markings (lines, bars, tees, arrows, lettering, hatching) and its iron covers: what may never lie on one
# another (a cover is never painted over: the paint stops short of it, or it sits beside the line)
LINE_PAINT = {'zebra_a', 'zebra_b', 'stop_line', 'centre_double', 'park_tee', 'road_arrow', 'road_arrow_turn', 'road_bus',
              'road_stop', 'road_slow', 'road_keep', 'road_clear', 'road_only', 'hatch_bay', 'hatch_yard', 'edge_line',
              'edge_line_yellow', 'lane_dash_long', 'detour_arrow_paint', 'detour_arrow_paint_left', 'merge_arrow',
              'merge_arrow_s', 'gore_hatch', 'toll_text', 'toll_lane_1', 'toll_lane_2', 'toll_lane_3', 'toll_lane_4'}
COVERS = {'drain', 'manhole_sq', 'valve_cap'}
SPRITES = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'assets', 'sprites', 'props')


def paint_size(kind):
    """A road paint's size in tiles: its sprite's (painted at twice the world's density, as all of the road's are)."""
    with open(os.path.join(SPRITES, kind + '.png'), 'rb') as f:
        w, h = struct.unpack('>II', f.read(24)[16:24])
    return w / 64, h / 64


def check_paint_overlaps(col0, col1, eps=0.03):
    """Between columns col0 and col1 no two road markings overlap (two lines, a line on a crossing's bars, lettering on
    a line...), none lies on an iron cover, and none on the centre line's dashes (the tiles '-'); lengths of one line
    laid end to end only touch (or lie back over each other, on one row or one slant). A marking's box is its sprite's."""
    marks = []
    for (kind, x, y, deg) in lv.floor:
        if (kind in LINE_PAINT or kind in COVERS) and col0 <= x < col1:
            w, h = paint_size(kind)
            a = math.radians(deg)
            w, h = abs(w * math.cos(a)) + abs(h * math.sin(a)), abs(w * math.sin(a)) + abs(h * math.cos(a))
            marks.append((kind, x, y, (x - w / 2, y - h / 2, x + w / 2, y + h / 2), deg))
    marks += [('centre dash', c + 0.5, r + 0.5, (c, r + 0.4, c + 1, r + 0.6), 0) for r in range(H) for c in range(int(col0), min(W, int(col1)))
              if lv.tiles[r][c] == '-']
    for (i, (ka, xa, ya, a, da)) in enumerate(marks):
        for (kb, xb, yb, b, db) in marks[i + 1:]:
            if ka == kb == 'centre dash' or (ka in COVERS and kb in COVERS):
                continue
            if ka == kb and da == db and (da % 180 or abs(ya - yb) < 0.01):
                continue                  # (lengths of one line: laid back over each other to end on a column, or on a slant)
            assert not (a[0] < b[2] - eps and b[0] < a[2] - eps and a[1] < b[3] - eps and b[1] < a[3] - eps), \
                f'{ka} at {xa:.2f},{ya:.2f} overlaps {kb} at {xb:.2f},{yb:.2f}'


if __name__ == '__main__':
    lv.actor('@', int(START[0]), int(START[1]), face=0)
    check_lanes()
    check_paint_overlaps(0, 220)          # (the street's start to the dark stretch: polished; the rest to come)
    for B in BENDS:
        check_bend(B['path'], B['radius'])
    check_paint_overlaps(LEG1, TOLL_X)    # (the alley and leg 1: polished)
    lv.check(guards=0)
    lv.write('level2a', name='THE CHASE', subtitle='SUNSET BAY  -  MARCH 16TH 1986  -  1:40 AM',
             lights=lights, ambient=ambient, chase=chase, header=[
                 'Level 2A - "THE CHASE": the back road (segment 1 of docs/LEVEL2.md), driven east in THE BOSS\'s convertible.',
                 'Two lanes that nothing stands in, between kerbs; parking on the north side, on ours or on neither by',
                 'section; two junctions under traffic lights, a railway bridge, works, a bus stop, the yard the lorry backs',
                 'out of (event 2) with the fruit market as the way round, the diner on the lit corner; a gradient from',
                 'level 1\'s suburb to Miami (palms, pastel stucco, neon growing block by block). The alley at',
                 'col 138 is event 1. Then works shut it: the scripted detour down the alley onto leg 1 (systems/Route.js',
                 'legs and bends: the frontage road, the on-ramp, the merge), and THE TOLL: the road opens to four lanes, a plaza',
                 'under its lit roof, a wooden arm or a steel boom at the end of each lane (event 3), the freeway\'s start.',
             ])
