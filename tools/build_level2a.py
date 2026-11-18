#!/usr/bin/env python3
"""Builds src/game/data/levels/level2a.js (level 2A, the chase: docs/LEVEL2.md) with tools/levelkit.py.

    python tools/build_level2a.py

Segment 1, THE BACK ROAD (0:00-0:25 at 60 km/h): the van drives east (+x) in the south lane (right-hand traffic) of
a two-lane street lined with parked cars, shopfronts and their neon on both sides. The level is a straightened strip
(docs/LEVEL2.md: the road runs along +x, the bends of the route are only suggested by the scenery), 450 m long:
25 s at 60 km/h is about 420 m, then a run-out past the end.

Plan (north is up, rows):

    row  0       the buildings' back walls (the blind ones are flat roofs from here to their facade)
    rows 1-2     north shops, two metres deep behind their display windows
    row  3       north facade: windows, locked doors, the signs on the piers between them
    rows 4-6     north sidewalk (street furniture: by the kerb and against the wall)
    rows 7-8     north parking row (cars facing west)
    rows 9-12.5  north lane, westbound (its middle at 10.75)
    row  12      the centre line (drawn along 12.5)
    rows 12.5-16 south lane, eastbound: OURS (its middle at 14.25)
    rows 16-17   south parking row (cars facing east)
    rows 18-20   south sidewalk
    row  21      south facade
    rows 22-23   south shops; alleys run south off the map between the blocks
    row  24      the back walls

Alley mouths on the south side every 40 to 50 m. The one at cols 138-141 (about 0:08, 130 m from the start) is
event 1, OUT OF THE ALLEY (one of theirs comes out across his nose: systems/Pursuit.js): nothing stands in it nor in
the parking row before it. The pursuers come by distance along the road (`chase.events`, the column of the van's
middle that sets each off): the alley car, its red lane told when he is at ALLEY_AT (as it comes onto the picture),
so that at 60 km/h his nose would meet it in his lane 0.7 s later; one joining from behind at BEHIND_AT (two cars by
0:25).
"""
import random

from levelkit import Level

W, H = 450, 25
START = (8.5, 14.25)        # the van's centre, facing +x, in our lane
END = 428                   # past this column the level is over (25 s at 60 km/h from the start)
EVENT_ALLEY = 138           # first column of the alley kept clear for event 1 (M1b)
ALLEY_AT = 125              # event 1 set off with the car's middle at this column (about 0:07): its red lane comes on the picture
BEHIND_AT = 270             # the second car set off (it starts 24 m behind him and catches him about 0:20)
ALLEYS = (52, 96, EVENT_ALLEY, 186, 232, 281, 327, 374, 418)
ALLEY_W = 4
NORTH_SIGNS = ['neon_sign_liquor', 'neon_sign_bar', 'neon_sign_video', 'neon_sign_wash']   # as on the board, in order
MORE_SIGNS = ['neon_sign_open', 'neon_sign_beer', 'neon_sign_palm', 'neon_sign_bay', 'neon_sign_lips', 'neon_sign_arrow']
SHOPS = {   # kind: (floor, what stands inside)
    'liquor': (',', 'shelves'),
    'video': (';', 'tvs'),
    'wash': ('+', 'washers'),
    'bar': ('.', 'bar'),
    'shop': ('_', 'crates'),
}
SIGN_KIND = {'neon_sign_liquor': 'liquor', 'neon_sign_video': 'video', 'neon_sign_wash': 'wash', 'neon_sign_bar': 'bar',
             'neon_sign_beer': 'bar', 'neon_sign_bay': 'bar', 'neon_sign_lips': 'bar'}

rng = random.Random(2025)
lv = Level(W, H)

# ---------------------------------------------------------------- the street
lv.fill(0, 4, W - 1, 6, 's')
lv.fill(0, 7, W - 1, 17, '=')
lv.fill(0, 12, W - 1, 12, '-')
lv.fill(0, 18, W - 1, 20, 's')
for a in ALLEYS:
    lv.fill(a, 21, a + ALLEY_W - 1, H - 1, '_')


# a side of the street, block by block: a shop (its facade: windows, a locked door, a two-tile pier carrying its sign)
# or a blind building (a flat roof behind a plain wall). north: the facade on row 3, else on row 21
def side(north, signs):
    face, inner, back = (3, (1, 2), 0) if north else (21, (22, 23), 24)
    sign_row, deg = (4.09, 0) if north else (20.91, 180)
    x = 1
    shops = []
    while x < W - 6:
        alley = next((a for a in ALLEYS if not north and x <= a + ALLEY_W and a - x < 12), None)
        if alley is not None and alley - x < 6:
            x = alley + ALLEY_W + 1          # past the alley and its corner wall
            continue
        room = (alley - 1 if alley is not None else W - 1) - x
        w = rng.choice((5, 6, 6, 7, 7, 8))
        if room < w:
            x += max(1, room)
            continue
        if rng.random() < 0.3:
            x += rng.randint(3, 7)           # a blind wall, a roof behind it
            continue
        sign = signs.pop(0) if signs else rng.choice(MORE_SIGNS)
        kind = SIGN_KIND.get(sign, 'shop')
        floor, _ = SHOPS[kind]
        lv.fill(x, inner[0], x + w - 1, inner[1], floor)
        door = 0 if rng.random() < 0.5 else w - 1
        pier = (w - 2) // 2 if door else max(1, (w - 1) // 2)
        for i in range(w):
            if i == door:
                lv.put(x + i, face, 'L')
            elif i not in (pier, pier + 1):
                lv.put(x + i, face, 'G')
        lv.prop(sign, x + pier + 1.0, sign_row, deg)
        shops.append((x, w, kind, door))
        x += w + rng.randint(1, 3)
    return shops


lv.area('north shops')
north_shops = side(True, list(NORTH_SIGNS))
lv.area('south shops')
south_shops = side(False, ['neon_sign_wash', 'neon_sign_open'])


# what stands inside a shop (seen through its windows), lit by a lamp under its ceiling
def dress_shop(x, w, kind, door, north):
    wall_row, front_row, deg = (1.2, 2.55, 0) if north else (23.8, 22.45, 180)
    lamp_row = 2.0 if north else 23.0
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
            lv.prop('back_bar', c, (1.15 if north else 23.85), deg)
    else:
        for c in cols[::2]:
            lv.prop('crate', c, wall_row + (0.1 if north else -0.1), rng.randint(-15, 15))
    lv.prop('ceiling_lamp', x + w / 2, lamp_row)


for (x, w, kind, door) in north_shops:
    dress_shop(x, w, kind, door, True)
for (x, w, kind, door) in south_shops:
    dress_shop(x, w, kind, door, False)

# ---------------------------------------------------------------- the road
lv.area('road: lines, the parking rows')
for i in range(W // 3):
    lv.paint('road_edge', 1.5 + 3 * i, 9.0)
    lv.paint('road_edge', 1.5 + 3 * i, 16.0)


def clear_south(col):
    """The south parking row stays clear before the event's alley and at the start, where the van sets off."""
    return col < 22 or EVENT_ALLEY - 16 < col < EVENT_ALLEY + ALLEY_W + 4


lv.area('road: parked cars (lights off)')
for (row, deg, south) in ((8.0, 180, False), (17.0, 0, True)):
    col = 5.0
    while col < W - 4:
        lv.paint('parking_bay', col, row + 0.05, 90)
        if rng.random() < 0.45 and not (south and clear_south(col + 3)):
            model = rng.choice(('car', 'car', 'car2', 'car2', 'van'))
            lv.prop(model, col + 3.0 + rng.uniform(-0.25, 0.25), row + rng.uniform(-0.05, 0.05), deg, lights=False)
        col += 6.0
lv.dress('manholes', 64.3, 14.6)
lv.dress('manholes', 171.5, 10.4)
lv.dress('manholes', 266.4, 14.9)
lv.dress('manholes', 355.2, 11.1)


# ---------------------------------------------------------------- the sidewalks
# the street's furniture, everything that goes over or breaks when the van climbs the kerb: by the kerb (lights, bins,
# hydrants, news boxes, benches, meters) and against the walls (a phone booth, a drinks machine, bin bags, A-frames).
# Never in front of a door, never in an alley's mouth.
def doors_of(shops):
    return [x + d + 0.5 for (x, w, k, d) in shops]


def free(col, doors):
    return all(abs(col - d) > 1.4 for d in doors) and all(not (a - 1.0 < col < a + ALLEY_W + 1.0) for a in ALLEYS)


KERB = ['trash_can', 'trash_can', 'hydrant', 'news_box', 'bench', 'parking_meter', 'parking_meter']
WALLSIDE = ['bin_bag', 'sandwich_board', 'vending', 'phone_booth', 'trash_can', 'ash_urn']
for (north, shops) in ((True, north_shops), (False, south_shops)):
    lv.area('north sidewalk' if north else 'south sidewalk')
    doors = doors_of(shops)
    kerb_row, wall_row = (6.55, 4.42) if north else (18.45, 20.58)
    light_row, light_deg = (6.7, 90) if north else (18.3, 270)
    for col in range(12 if north else 24, W - 4, 24):
        lv.prop('streetlight', col + 0.5, light_row, light_deg)
    col = 6.0
    while col < W - 6:
        col += rng.uniform(3.0, 7.0)
        if (col - (12.5 if north else 24.5)) % 24 < 1.5 or (col - (12.5 if north else 24.5)) % 24 > 22.5:
            continue                       # not under a streetlight
        kind = rng.choice(KERB)
        if not north and not free(col, []):
            continue
        deg = 180 if (kind == 'bench' and north) else 0
        lv.prop(kind, col, kerb_row + (0.12 if kind == 'bench' and north else -0.12 if kind == 'bench' else 0), deg)
    col = 4.0
    while col < W - 6:
        col += rng.uniform(5.0, 11.0)
        if not free(col, doors):
            continue
        kind = rng.choice(WALLSIDE)
        row = wall_row + ((0.1 if north else -0.1) if kind in ('vending', 'phone_booth') else 0)
        lv.prop(kind, col, row, 0 if north else 180)
lv.dress('papers', 0, 4, W - 1, 6, 30)
lv.dress('papers', 0, 18, W - 1, 20, 30)
lv.dress('papers', 0, 7, W - 1, 17, 20)

# ---------------------------------------------------------------- the alleys
lv.area('alleys (the one at col 138 kept clear: event 1)')
for a in ALLEYS:
    if a == EVENT_ALLEY:
        continue
    lv.prop('dumpster', a + 0.8, 23.2, 90)
    lv.prop('trash_can', a + 3.3, 22.5)

# ---------------------------------------------------------------- the roofs of the blind buildings
lv.area('roofs')
for row in (1.0, 23.0):
    col = 2.0
    while col < W - 3:
        col += rng.uniform(5.0, 14.0)
        kind = rng.choice(('vent', 'vent', 'ac_unit', 'chimney', 'hatch'))
        if lv.is_roof(int(col), int(row)) and lv.is_roof(int(col) + 1, int(row)) and lv.is_roof(int(col) - 1, int(row)):
            lv.roof(kind, col, row + (0.6 if row < 5 else 0.0), 0)

# ---------------------------------------------------------------- the night
lv.wet = 0.35                                     # the street still wet from an earlier rain (seen)
lv.rain = 0
lights = [[x, 12.5, 9, '#5a6ad8' if (x // 15) % 2 else '#7a5ad8', 0.3] for x in range(10, W, 30)]

chase = {
    'van': list(START),
    'cruise': 8.9,              # px/step: 60 km/h
    'lanes': [10.75, 14.25],    # the lanes' middle rows: theirs (westbound), ours
    'kerbs': [7, 18],           # the carriageway between its kerbs (parking rows included), rows
    'end': END,
    # by the column of the van's middle (systems/Pursuit.js): 'alley' waits at `car` [col, row] facing north, lamps on
    'events': [
        {'at': ALLEY_AT, 'kind': 'alley', 'car': [EVENT_ALLEY + ALLEY_W / 2, 22.5]},
        {'at': BEHIND_AT, 'kind': 'behind'},
    ],
    'arms': {'weapon': 'pistol', 'mag': 7, 'spare': 7},   # a 1911, its magazine and a spare one (systems/Drive.js)
}

if __name__ == '__main__':
    lv.actor('@', int(START[0]), int(START[1]), face=0)
    lv.check(guards=0)
    lv.write('level2a', name='THE CHASE', subtitle='SUNSET BAY  -  MARCH 16TH 1986  -  1:40 AM',
             lights=lights, chase=chase, header=[
                 'Level 2A - "THE CHASE": the back road (segment 1 of docs/LEVEL2.md), driven east in the van.',
                 'Two lanes, a parking row each side, shopfronts and their neon, alleys to the south, street furniture',
                 'that goes over. The alley at col 138 is kept clear for event 1 (out of the alley, M1b).',
             ])
