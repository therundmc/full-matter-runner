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
    404-449   C  the way to the freeway (its sign over the road); the level ends at col 428
"""
import random

from levelkit import Level, SIZES

W, H = 450, 24
START = (8.5, 14.75)        # the car's centre, facing +x, in our lane
END = 428                   # past this column the level is over (25 s at 60 km/h from the start)
LANES = (12.25, 14.75)      # the lanes' middle rows: theirs (westbound), ours
EVENT_ALLEY = 138           # first column of the alley kept clear for event 1
ALLEY_AT = 111              # event 1 set off with the car's middle at this column (about 0:06): no brake at the wheel,
                            # so it is told early enough to cross AHEAD of him into the far lane (he keeps out of it)
BEHIND_AT = (165, 236, 262) # a car set off from behind at each (it starts 19 m back and is alongside 3 s later)
BEHIND_STYLE = ('rammer', 'blocker', 'gunner')
CROSS_AT = 368              # the last one, out of the cross street ahead of him, as early (about 0:22)
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
for x in range(W):
    lv.fill(x, 8, x, n_kerb(x) - 1, 's')
    lv.fill(x, n_kerb(x), x, s_kerb(x) - 1, '=')
    lv.fill(x, s_kerb(x), x, s_face(x) - 1, 's')
for (a, b) in (CORAL, CROSS):
    lv.fill(a + 1, 0, b - 1, H - 1, '=')
    for x in (a, b):                                    # its two sidewalks, up to the corners of ours
        lv.fill(x, 0, x, 7, 's')
        lv.fill(x, s_face(x), x, H - 1, 's')
for a in ALLEYS:
    lv.fill(a, s_face(a + 1), a + ALLEY_W - 1, H - 1, '_')
    lv.fill(a, 16, a + ALLEY_W - 1, s_face(a + 1) - 1, 's')
lv.fill(N_ALLEY[0], 0, N_ALLEY[1], 7, '_')
# the centre line: double and solid where nobody may pass (toward a junction, under the bridge, at the bus stop, past
# the yard, to the freeway: paint), else single dashes, two metres on, two off (a line that never breaks does not show
# the road going by); none across a junction
SOLID = ((30, 45), (62, 74), (132, 160), (238, 276), (306, 356), (374, 388), (404, W - 1))
BOXES = ((46, 61), (389, 403))
for c in range(0, W, 4):
    if not within(c, SOLID) and not within(c, BOXES) and not within(c + 1, SOLID):
        lv.fill(c, 13, min(W - 1, c + 1), 13, '-')
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
north_shops = side(True, 1, DARK[0] - 2, list(SIGNS_1)) + side(True, DARK[1] + 2, W - 4, list(SIGNS_2), 0.2)
lv.area('south shops')
south_shops = side(False, 1, DARK[0] - 2, list(SIGNS_1S)) + side(False, DARK[1] + 2, W - 4, list(reversed(SIGNS_2)), 0.2)


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
        lv.paint('centre_double', mid, H - 1.8, 90)
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
for r in list(range(0, 7)) + list(range(19, H)):
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
for col in range(12, W - 4, 12):
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
for c in range(18, W - 6, 34):                        # drains in the gutters, both sides
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
while col < W - 6:
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
lv.dress('papers', 0, 8, W - 1, 8, 20)
lv.dress('papers', 0, 16, W - 1, 17, 40)
lv.dress('papers', 0, 11, W - 1, 15, 24)

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
    while col < W - 3:
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
lights = [[x, 13.5, 9, '#5a6ad8' if (x // 15) % 2 else '#7a5ad8', 0.16 if DARK[0] < x < DARK[1] else 0.3] for x in range(10, W, 30)]
lights += [[x, 17.0, 8, '#ffd9a0', 0.35] for x in range(D0 + 3, D1, 9)]      # the diner spills onto its corner

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

chase = {
    'van': list(START),
    'cruise': 8.9,              # px/step: 60 km/h
    'lanes': list(LANES),       # the lanes' middle rows: theirs (westbound), ours
    'kerbs': [9, 16],           # the roadway between its kerbs where the parking row is on the north side (the
                                # lorry's stretch, most of the street), rows; the map says where it is elsewhere
    'mid': 13.0,                # the row the camera is drawn toward: the street's middle, between its two facades (the
                                # view is 360 px high: both rows of signs and the south shopfronts stay on the picture)
    'end': END,
    # the streets across [first col, last col, row above, row below]: the wheel does not take him down one (the
    # line of the building fronts is held across it: systems/Drive.js fronts)
    'across': [[CORAL[0], CORAL[1], 8, 18], [CROSS[0], CROSS[1], 8, 18]],
    'next': 'THE TOLL',         # what comes after it, on the card that closes the demo (Game: TO BE CONTINUED)
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
    ],
    # water standing in the gutter [col, row, r px]: spray under his wheels
    'water': [[36.0, 15.6, 30], [152.0, 14.2, 34], [247.0, 15.5, 30], [318.0, 14.6, 28], [404.0, 14.9, 34]],
    # the boss's Uzi off his passenger seat (taken in a short beat the first time: systems/Drive.js grab). At the wheel
    # it never runs dry (systems/CarGun.js): `mag` is what is in it when he gets out of the car (2B)
    'arms': {'weapon': 'uzi', 'mag': 30, 'seat': True},
    # how it opens, the first time: the car standing, he finishes his cigarette and flicks it out, then the engine
    # and the grab (systems/LastDrag.js, CHASE.intro)
    'intro': 'drag',
}


def check_lanes():
    """Nothing stands in the two lanes, anywhere (a parked car's flank included), and nothing loose stands within
    reach of them: a thing a car could knock into a lane is a thing in the lane."""
    for (_, kind, col, row, deg, _) in lv.props:
        if SIZES.get(kind) is None:
            continue
        b = Level.box(kind, col, row, deg)
        if roadway(int(col)) and not 8 <= row < 18:
            continue                                          # up or down a street across
        assert b[3] <= 11.0 or b[1] >= 16.0, f'{kind} at {col},{row} is in a lane'


if __name__ == '__main__':
    lv.actor('@', int(START[0]), int(START[1]), face=0)
    check_lanes()
    lv.check(guards=0)
    lv.write('level2a', name='THE CHASE', subtitle='SUNSET BAY  -  MARCH 16TH 1986  -  1:40 AM',
             lights=lights, ambient=ambient, chase=chase, header=[
                 'Level 2A - "THE CHASE": the back road (segment 1 of docs/LEVEL2.md), driven east in THE BOSS\'s convertible.',
                 'Two lanes that nothing stands in, between kerbs; parking on the north side, on ours or on neither by',
                 'section; two junctions under traffic lights, a railway bridge, works, a bus stop, the yard the lorry backs',
                 'out of (event 2) with the cafe\'s terrace as the way round, the diner on the lit corner. The alley at',
                 'col 138 is event 1.',
             ])
