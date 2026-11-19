#!/usr/bin/env python3
"""Builds src/game/data/levels/level2a.js (level 2A, the chase: docs/LEVEL2.md) with tools/levelkit.py.

    python tools/build_level2a.py

Segment 1, THE BACK ROAD (0:00-0:25 at 60 km/h): THE BOSS's convertible drives east (+x) in the south lane
(right-hand traffic) of a narrow two-lane street: one row of parked cars (the north side), shopfronts and their neon
close on both sides so that both facades stay on the picture (the view is about 380 px high at 60 km/h, the street
320 px from wall to wall). The level is a straightened strip (docs/LEVEL2.md), 450 m long: 25 s at 60 km/h is about
420 m, then a run-out past the end.

Plan (north is up, rows):

    rows 0-3     the back of the north blocks (roofs); the lorry's yard cuts through them
    row  4       the north shops' back wall
    rows 5-6     north shops, two metres deep behind their display windows
    row  7       north facade: windows, locked doors, the signs on the piers between them
    row  8       north sidewalk (one metre: meters, hydrants, bins)
    rows 9-10    the parking row (cars facing west, their middle on row 10.0)
    rows 11-13.5 north lane, westbound (its middle at 12.25); the centre line drawn along 13.5 (row 13)
    rows 13.5-16 south lane, eastbound: OURS (its middle at 14.75)
    rows 16-17   south sidewalk (the kerb at 16.0: bins, news boxes, benches... everything goes over)
    row  18      south facade
    rows 19-20   south shops; alleys run south off the map between the blocks
    rows 21-23   the back of the south blocks

The street changes along its length (cols):

    0-146     THE SHOPS: LIQUOR, BAR, VIDEO, WASH 24H as on the board; the alley at 138 is event 1
    150-246   THE DARK STRETCH: a vacant lot behind a chain fence (north), blind walls, pipes and steam (south),
              one lamp in two
    250-318   SHOPS again, other signs; people on the sidewalk
    320-352   THE YARD (north, cols 337-342): the lorry of event 2 backs out of it across both lanes; THE TERRACE
              (south, cols 325-354): the cafe set back four metres, its tables, parasols, planters and awnings: the way
              round the lorry's tail
    353-391   THE LIT CORNER: the diner, all glass and light, a phone booth, news boxes
    392-399   the cross street
    400-449   the run-out; the level ends at col 428

Events by distance along the road (`chase.events`, the column of the car's middle that sets each off): the alley car
(its red lane told when he is at ALLEY_AT), one joining from behind at each of BEHIND_AT, the lorry told at LORRY_AT
(its beeps and the chevrons first, then it moves: systems/Lorries.js), a last car out of the cross street at CROSS_AT.
"""
import random

from levelkit import Level

W, H = 450, 24
START = (8.5, 14.75)        # the car's centre, facing +x, in our lane
END = 428                   # past this column the level is over (25 s at 60 km/h from the start)
LANES = (12.25, 14.75)      # the lanes' middle rows: theirs (westbound), ours
EVENT_ALLEY = 138           # first column of the alley kept clear for event 1
ALLEY_AT = 111              # event 1 set off with the car's middle at this column (about 0:06): no brake at the wheel,
                            # so it is told early enough to cross AHEAD of him into the far lane (he keeps out of it)
BEHIND_AT = (165, 250)      # a car set off from behind at each (it starts 19 m back and is alongside 3 s later)
CROSS_AT = 368              # the last one, out of the cross street ahead of him, as early (about 0:22)
ALLEYS = (52, 96, EVENT_ALLEY, 186, 232, 281, 418)   # (none just before the terrace: he comes at it along the sidewalk)
ALLEY_W = 4
DARK = (150, 246)           # the dark stretch
LOT = (156, 226)            # its vacant lot, north
YARD = (337, 342)           # the lorry's yard, north (cols, inclusive)
LORRY_AT = 303              # event 2 told with the car's middle at this column (about 0:18)
TERRACE = (325, 354)        # the cafe's terrace, south (cols, inclusive)
DINER = (358, 388)
CROSS = (392, 399)          # the cross street
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

# ---------------------------------------------------------------- the street
lv.fill(0, 8, W - 1, 8, 's')
lv.fill(0, 9, W - 1, 15, '=')
# the centre line in DASHES (two metres on, two off): a line that never breaks does not show the road going by
for c in range(0, W, 4):
    lv.fill(c, 13, min(W - 1, c + 1), 13, '-')
lv.fill(0, 16, W - 1, 17, 's')
for a in ALLEYS:
    lv.fill(a, 18, a + ALLEY_W - 1, H - 1, '_')
lv.fill(CROSS[0], 0, CROSS[1], H - 1, '=')
lv.fill(CROSS[0], 8, CROSS[1], 8, '=')
lv.fill(CROSS[0], 16, CROSS[1], 17, '=')

# the vacant lot: beaten earth and weeds behind a chain fence along the sidewalk
lv.fill(LOT[0], 1, LOT[1], 7, '~')
for _ in range(90):
    x, y = rng.randint(LOT[0], LOT[1]), rng.randint(1, 7)
    lv.put(x, y, '"')
    if rng.random() < 0.6 and x < LOT[1]:
        lv.put(x + 1, y, '"')
# the yard the lorry backs out of: concrete from the back wall to the sidewalk
lv.fill(YARD[0], 1, YARD[1], 7, '_')
# the terrace: the cafe's front set back, the sidewalk four metres deep there
lv.fill(TERRACE[0], 16, TERRACE[1], 20, 's')
lv.fill(TERRACE[0], 22, TERRACE[1], 22, '.')

boxes = []      # what stands on the ground so far, in tiles: (x0, y0, x1, y1)


def put(kind, col, row, deg=0, pad=0.04, **opt):
    """A prop, unless it would touch one already there (the street's furniture is strewn at random). True if put."""
    b = Level.box(kind, col, row, deg)
    b = (b[0] - pad, b[1] - pad, b[2] + pad, b[3] + pad)
    if any(not (b[0] >= o[2] or o[0] >= b[2] or b[1] >= o[3] or o[1] >= b[3]) for o in boxes):
        return False
    boxes.append(b)
    lv.prop(kind, col, row, deg, **opt)
    return True


def blocked(x0, x1, spans):
    return any(x0 <= b and a <= x1 for (a, b) in spans)


# a side of the street between two columns, block by block: a shop (its facade: windows, a locked door, a two-tile pier
# carrying its sign) or a blind building (a flat roof behind a plain wall). north: the facade on row 7, else on row 18
def side(north, x0, x1, signs, blind=0.25):
    face, inner = (7, (5, 6)) if north else (18, (19, 20))
    sign_row, deg = (8.09, 0) if north else (17.91, 0)      # (the signs read one way up: never turned)
    keep = [(a - 1, a + ALLEY_W) for a in ALLEYS] if not north else []
    keep += [(CROSS[0] - 1, CROSS[1] + 1)]
    keep += [(LOT[0] - 1, LOT[1] + 1), (YARD[0] - 1, YARD[1] + 1)] if north else [(TERRACE[0] - 1, TERRACE[1] + 1), (DINER[0] - 1, DINER[1] + 1)]
    x = x0
    shops = []
    while x < x1 - 5:
        w = rng.choice((5, 6, 6, 7, 7, 8))
        if x + w > x1 or blocked(x, x + w - 1, keep):
            x += 1
            continue
        if rng.random() < blind:
            x += rng.randint(3, 5)           # a blind wall, a roof behind it
            continue
        sign = signs.pop(0) if signs else rng.choice(SIGNS_2)
        kind = SIGN_KIND.get(sign, 'shop')
        lv.fill(x, inner[0], x + w - 1, inner[1], SHOPS[kind][0])
        door = 0 if rng.random() < 0.5 else w - 1
        pier = (w - 2) // 2 if door else max(1, (w - 1) // 2)
        for i in range(w):
            if i == door:
                lv.put(x + i, face, 'L')
            elif i not in (pier, pier + 1):
                lv.put(x + i, face, 'G')
        lv.prop(sign, x + pier + 1.0, sign_row, deg)
        shops.append((x, w, kind, door))
        x += w + rng.randint(1, 2)
    return shops


lv.area('north shops')
north_shops = side(True, 1, DARK[0] - 2, list(SIGNS_1)) + side(True, DARK[1] + 2, W - 4, list(SIGNS_2), 0.2)
lv.area('south shops')
south_shops = side(False, 1, DARK[0] - 2, list(SIGNS_1S)) + side(False, DARK[1] + 2, W - 4, list(reversed(SIGNS_2)), 0.2)


# what stands inside a shop (seen through its windows), lit by a lamp under its ceiling, close to the glass
def dress_shop(x, w, kind, door, north):
    wall_row, front_row, deg = (5.2, 6.55, 0) if north else (20.8, 19.45, 180)
    lamp_row = 6.3 if north else 19.7
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
            lv.prop('back_bar', c, (5.15 if north else 20.85), deg)
    else:
        for c in cols[::2]:
            lv.prop('crate', c, wall_row + (0.1 if north else -0.1), rng.randint(-15, 15))
    lv.prop('ceiling_lamp', x + w / 2, lamp_row)


for (x, w, kind, door) in north_shops:
    dress_shop(x, w, kind, door, True)
for (x, w, kind, door) in south_shops:
    dress_shop(x, w, kind, door, False)

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
T0, T1 = TERRACE
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
lv.area('the terrace: tables, chairs, parasols, planters (everything flies)')
for c in (T0 + 1.6, T0 + 5.2, T0 + 8.8, T0 + 12.4, T0 + 16.0, T0 + 19.6, T0 + 23.2):     # planters along the kerb
    put('planter', c, 16.32)
put('planter', T0 + 0.35, 18.0, 90)
put('planter', T1 + 0.65, 18.0, 90)
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

# ---------------------------------------------------------------- the road
lv.area('road: lines, the parking row')
# (the edge line of the parking row in dashes too, three metres on, three off: the other beat of the road going by)
for i in range(0, W // 3, 2):
    if not CROSS[0] - 2 <= 1.5 + 3 * i <= CROSS[1] + 2:
        lv.paint('road_edge', 1.5 + 3 * i, 11.0)


def clear_parking(col):
    """No car parked at the start, in front of the lorry's yard, on the cross street."""
    return col < 14 or YARD[0] - 4 < col < YARD[1] + 5 or CROSS[0] - 3 < col < CROSS[1] + 4


lv.area('road: parked cars (lights off)')
col = 5.0
while col < W - 4:
    if not clear_parking(col + 3):
        lv.paint('parking_bay', col, 10.05, 90)
        dark = DARK[0] < col < DARK[1]
        if rng.random() < (0.3 if dark else 0.55):
            model = rng.choice(('car', 'car', 'car2', 'car2', 'van'))
            put(model, col + 3.0 + rng.uniform(-0.25, 0.25), 10.0 + rng.uniform(-0.04, 0.04), 180, lights=False)
    col += 6.0
for (c, r) in ((40.3, 14.9), (88.5, 12.4), (171.5, 14.6), (199.4, 12.0), (236.4, 15.0), (290.2, 12.6), (368.2, 14.4), (411.0, 12.3)):
    lv.dress('manholes', c, r)


# ---------------------------------------------------------------- the sidewalks
# the street's furniture, everything that goes over or breaks when the car climbs the kerb: by the kerb (lights, bins,
# hydrants, news boxes, benches, meters) and against the walls (a phone booth, a drinks machine, bin bags, A-frames,
# crates). Never in front of a door, never in an alley's mouth, on the terrace, in the yard's gate.
def doors_of(shops):
    return [x + d + 0.5 for (x, w, k, d) in shops] + [D0 + 15.5]


def free(col, doors, north):
    if any(abs(col - d) < 1.4 for d in doors) or CROSS[0] - 1.5 < col < CROSS[1] + 2.5:
        return False
    if north:
        return not YARD[0] - 1.5 < col < YARD[1] + 2.5
    return all(not (a - 1.0 < col < a + ALLEY_W + 1.0) for a in ALLEYS) and not T0 - 1.5 < col < T1 + 2.5


N_KERB = ['trash_can', 'hydrant', 'parking_meter', 'parking_meter', 'parking_meter', 'bin_bag', 'news_box']
S_KERB = ['trash_can', 'trash_can', 'hydrant', 'news_box', 'news_box', 'bench', 'sandwich_board', 'crate', 'bin_bag']
S_WALL = ['bin_bag', 'bin_bag', 'sandwich_board', 'vending', 'phone_booth', 'trash_can', 'ash_urn', 'crate', 'plant']
S_DARK = ['bin_bag', 'bin_bag', 'crate', 'crate', 'trash_can', 'keg', 'sandwich_board']   # (no barrel on his way: a death nobody told)
for (north, shops) in ((True, north_shops), (False, south_shops)):
    lv.area('north sidewalk' if north else 'south sidewalk')
    doors = doors_of(shops) if not north else [x + d + 0.5 for (x, w, k, d) in shops]
    light_row, light_deg = (8.72, 90) if north else (16.28, 270)
    for col in range(12 if north else 24, W - 4, 24):
        dark = DARK[0] < col < DARK[1]
        if (dark and (col // 24) % 2) or not free(col + 0.5, [], north):
            continue                       # one lamp in two in the dark stretch
        put('streetlight', col + 0.5, light_row, light_deg, **({'flicker': 'broken'} if dark else {}))
    col = 6.0
    while col < W - 6:
        col += rng.uniform(2.2, 5.0)
        if not free(col, [], north):
            continue
        dark = DARK[0] < col < DARK[1]
        kind = rng.choice(S_DARK if dark and not north else N_KERB if north else S_KERB)
        row = 8.6 if north else 16.42
        put(kind, col, row + (0.06 if kind == 'bench' else 0), 0)
    if north:
        continue
    col = 4.0
    while col < W - 6:
        col += rng.uniform(3.0, 7.0)
        if not free(col, doors, north) or D0 - 1 < col < D1 + 1:
            continue
        dark = DARK[0] < col < DARK[1]
        kind = rng.choice(S_DARK if dark else S_WALL)
        put(kind, col, 17.58 - (0.1 if kind in ('vending', 'phone_booth') else 0), 180)
# the diner's front: a phone booth, news boxes in a row, a bench, bins
for (kind, c, r, deg) in (('phone_booth', D0 - 1.6, 17.5, 180), ('news_box', D0 + 2.0, 16.4, 0), ('news_box', D0 + 2.6, 16.4, 0),
                          ('news_box', D0 + 3.2, 16.4, 0), ('bench', D0 + 10.5, 17.6, 0), ('trash_can', D0 + 12.6, 17.6, 0),
                          ('bench', D0 + 19.0, 17.6, 0), ('hydrant', D0 + 26.0, 16.4, 0), ('vending', D0 + 29.4, 17.5, 180)):
    put(kind, c, r, deg)
lv.dress('papers', 0, 8, W - 1, 8, 20)
lv.dress('papers', 0, 16, W - 1, 17, 40)
lv.dress('papers', 0, 9, W - 1, 15, 30)

# ---------------------------------------------------------------- the dark stretch
lv.area('the dark stretch: the fence, the vacant lot')
for x in range(LOT[0], LOT[1] + 1):
    if x not in (LOT[0] + 31, LOT[0] + 32):                   # a gap somebody cut in it
        lv.prop('chain_fence', x + 0.5, 7.94)
for (kind, c, r, deg, opt) in (('dumpster', LOT[0] + 4.0, 5.0, 12, {}), ('car2', LOT[0] + 14.0, 4.6, 205, {'lights': False}),
                               ('barrel', LOT[0] + 20.2, 6.8, 0, {}), ('barrel', LOT[0] + 21.0, 6.5, 0, {}), ('crate', LOT[0] + 22.4, 6.6, 20, {}),
                               ('van', LOT[0] + 40.0, 3.8, 172, {'lights': False}), ('dumpster', LOT[0] + 50.5, 6.2, 0, {}),
                               ('barrel', LOT[0] + 53.4, 6.9, 0, {}), ('crate', LOT[0] + 58.0, 5.5, 40, {}), ('crate', LOT[0] + 58.8, 6.2, 10, {}),
                               ('car', LOT[0] + 64.0, 5.2, 160, {'lights': False})):
    put(kind, c, r, deg, **opt)
lv.area('the dark stretch: the blind walls (south)')
x = DARK[0] + 2.0
while x < DARK[1] - 4:
    kind = rng.choice(('flyers', 'flyers', 'conduit', 'pipe_steam', 'wall_vent', 'pipe_water'))
    half = {'flyers': 0.4, 'conduit': 0.75, 'pipe_steam': 1.5, 'pipe_water': 1.5, 'wall_vent': 0.25}[kind]
    c = x + half
    if all(not (a - 0.2 < c - half and c + half < a + ALLEY_W + 0.2 or (c + half > a - 0.1 and c - half < a + ALLEY_W + 0.1)) for a in ALLEYS):
        lv.prop(kind, c, 17.93 if kind != 'flyers' else 17.94, 180)
    x += half * 2 + rng.uniform(2.0, 6.0)

# ---------------------------------------------------------------- the alleys
lv.area('alleys (the one at col 138 kept clear: event 1)')
for a in ALLEYS:
    if a == EVENT_ALLEY:
        continue
    lv.prop('dumpster', a + 0.8, 22.2, 90)
    lv.prop('trash_can', a + 3.3, 21.5)

# ---------------------------------------------------------------- the roofs of the blind buildings
lv.area('roofs')
for row in (2.0, 5.5, 20.0, 22.4):
    col = 2.0
    while col < W - 3:
        col += rng.uniform(4.0, 11.0)
        kind = rng.choice(('vent', 'vent', 'ac_unit', 'ac_unit', 'chimney', 'hatch', 'duct'))
        if all(lv.is_roof(int(col) + dx, int(row) + dy) for dx in (-1, 0, 1) for dy in (-1, 0, 1)):
            lv.roof(kind, col, row, 0)

# ---------------------------------------------------------------- life
lv.pigeons(64.0, 14.6, 6)           # in his lane: up as he comes
lv.pigeons(118.0, 12.6, 5)
lv.pigeons(214.0, 14.9, 7)
lv.pigeons(262.0, 16.6, 5)
lv.pigeons(371.0, 14.3, 6)
lv.cat(101.0, 16.7)
lv.cat(177.0, 8.5)
lv.cat(296.0, 16.8)

# ---------------------------------------------------------------- the night
lv.wet = 0.35                                     # the street still wet from an earlier rain (seen)
lv.rain = 0
lights = [[x, 13.5, 9, '#5a6ad8' if (x // 15) % 2 else '#7a5ad8', 0.16 if DARK[0] < x < DARK[1] else 0.3] for x in range(10, W, 30)]
lights += [[x, 17.0, 8, '#ffd9a0', 0.35] for x in range(D0 + 3, D1, 9)]      # the diner spills onto its corner

# people on the sidewalks, out of an alley and into the next (they run from a car on the kerb, or die under it)
ambient = {
    'traffic': [],
    'walkers': [
        {'path': [[54, 21.5], [54, 17.1], [97.5, 17.1], [97.5, 21.5]], 'gap': [5, 9], 'max': 2},
        {'path': [[283, 21.5], [283, 17.1], [234, 17.1], [234, 21.5]], 'gap': [5, 9], 'max': 2},
        {'path': [[420, 21.5], [420, 17.1], [401, 17.1], [401, 16.5], [356, 16.9]], 'gap': [5, 9], 'max': 2},
    ],
}

chase = {
    'van': list(START),
    'cruise': 8.9,              # px/step: 60 km/h
    'lanes': list(LANES),       # the lanes' middle rows: theirs (westbound), ours
    'kerbs': [9, 16],           # the carriageway between its kerbs (the parking row included), rows
    'mid': 13.0,                # the row the camera is drawn toward: the street's middle, between its two facades (the
                                # view is 360 px high: both rows of signs and the south shopfronts stay on the picture)
    'end': END,
    'next': 'THE TOLL',         # what comes after it, on the card that closes the demo (Game: TO BE CONTINUED)
    # by the column of the car's middle. 'alley' (systems/Pursuit.js) waits at `car` [col, row] facing north, lamps on;
    # 'lorry' (systems/Lorries.js): the lorry waits at `lorry` [col, row] its cab to the north, and backs `back` tiles
    # south across the lanes; `gap` [col, row]: the way round its tail, shown by bone arrows
    'events': [
        {'at': ALLEY_AT, 'kind': 'alley', 'car': [EVENT_ALLEY + ALLEY_W / 2, 21.0]},
        *[{'at': c, 'kind': 'behind'} for c in BEHIND_AT],
        {'at': LORRY_AT, 'kind': 'lorry', 'lorry': [(YARD[0] + YARD[1] + 1) / 2, 6.69], 'back': 5, 'gap': [(YARD[0] + YARD[1] + 1) / 2, 18.3]},
        {'at': CROSS_AT, 'kind': 'alley', 'car': [(CROSS[0] + CROSS[1] + 1) / 2 + 1.0, 21.0]},
    ],
    # water standing in the gutter [col, row, r px]: spray under his wheels
    'water': [[76.0, 15.6, 30], [152.0, 14.2, 34], [247.0, 15.5, 30], [318.0, 14.6, 28], [404.0, 14.9, 34]],
    # the boss's Uzi off his passenger seat (taken in a short beat the first time: systems/Drive.js grab). At the wheel
    # it never runs dry (systems/CarGun.js): `mag` is what is in it when he gets out of the car (2B)
    'arms': {'weapon': 'uzi', 'mag': 30, 'seat': True},
}

if __name__ == '__main__':
    lv.actor('@', int(START[0]), int(START[1]), face=0)
    lv.check(guards=0)
    lv.write('level2a', name='THE CHASE', subtitle='SUNSET BAY  -  MARCH 16TH 1986  -  1:40 AM',
             lights=lights, ambient=ambient, chase=chase, header=[
                 'Level 2A - "THE CHASE": the back road (segment 1 of docs/LEVEL2.md), driven east in THE BOSS\'s convertible.',
                 'Two narrow lanes, a parking row on the north side, shopfronts and their neon close on both sides; a block',
                 'of shops, a dark stretch with a vacant lot, shops again, the yard the lorry backs out of (event 2) with the',
                 'cafe\'s terrace as the way round, the diner on the lit corner. The alley at col 138 is event 1.',
             ])
