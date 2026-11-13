#!/usr/bin/env python3
"""Builds src/game/data/levels/level1.js ("NEON NIGHTS": the MIRAGE bar).

The level is composed here instead of typed as ASCII so that the layout can be checked: every actor must stand on
a floor tile, and no piece of furniture may sit inside a wall, across a door, on a spawn or inside another piece.
Units: 1 tile = 1 m = 32 px. Props are placed by their centre, in tiles (floats).

    python tools/build_level1.py

Plan (north is up):

    rows  1-4    back lot: getaway van, the way out
    rows  6-10   storeroom | toilets | back room (the boss)
    rows 12-19   the bar: counter, booths, pool table, lounge
    rows 21-22   sidewalk, the MIRAGE sign on the facade
    rows 23-29   road: parking strip, two lanes of traffic
    rows 30-31   sidewalk
    rows 32-36   the alley where the player starts
    cols 11-13   service alley along the bar, from the street to the back lot
"""
import json
import os

W, H = 44, 38
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'src', 'game', 'data', 'levels', 'level1.js')

SOLID = set(' #X')
tiles = [['X'] * W for _ in range(H)]
actors = [[' '] * W for _ in range(H)]
props = []        # (area, type, col, row, deg, opt)
facing = {}
patrols = {}
spawns = []       # (col, row) of every character, for the overlap check


def fill(x0, y0, x1, y1, ch):
    for y in range(y0, y1 + 1):
        for x in range(x0, x1 + 1):
            tiles[y][x] = ch


def put(x, y, ch):
    tiles[y][x] = ch


def actor(ch, x, y, face=None, route=None):
    assert tiles[y][x] not in SOLID and tiles[y][x] not in 'DLGF', f'actor {ch} on a solid tile at {x},{y}'
    assert actors[y][x] == ' ', f'two actors at {x},{y}'
    actors[y][x] = ch
    if face is not None:
        facing[f'{x},{y}'] = face
    if route:
        patrols[f'{x},{y}'] = route
    if ch == '@' or ch.isalpha() and ch.lower() in 'pushrbk':
        spawns.append((x + 0.5, y + 0.5))


AREA = ['']


def area(name):
    AREA[0] = name


def prop(kind, col, row, deg=0, **opt):
    props.append((AREA[0], kind, col, row, deg, opt))


# ---------------------------------------------------------------- tiles
# back lot and service alley
fill(11, 1, 30, 4, '_')
fill(11, 5, 13, 20, '_')
# the bar: storeroom, toilets, back room, main room
fill(15, 6, 19, 10, '_')
fill(21, 6, 23, 10, '+')
fill(25, 6, 30, 10, ';')
fill(20, 6, 20, 10, '#')
fill(24, 6, 24, 10, '#')
fill(15, 11, 30, 11, '#')
fill(15, 12, 30, 19, '.')
fill(25, 16, 30, 19, ':')
put(16, 11, 'D')            # behind the counter -> storeroom
put(22, 11, 'D')            # toilets
put(27, 11, 'L')            # back room, locked: kick it or shoot it
put(14, 8, 'D')             # storeroom -> service alley
put(28, 5, 'D')             # back room -> back lot
put(26, 5, 'G')
for x in (15, 16, 24, 25, 27, 28):
    put(x, 20, 'G')         # facade windows
put(21, 20, 'D')
put(22, 20, 'D')            # front double door
# the street, open at both ends for the traffic
fill(0, 21, W - 1, 22, 's')
fill(0, 23, W - 1, 29, '=')
fill(0, 27, W - 1, 27, '-')
fill(0, 30, W - 1, 31, 's')
# the alley across the road
fill(20, 32, 23, 36, '_')

# ---------------------------------------------------------------- actors (13 guards)
actor('@', 21, 35, face=270)
actor('5', 22, 33)                                   # a bat by the dumpster: the first weapon
# street
actor('b', 24, 21, face=90)                          # bouncer
actor('P', 17, 22, route=[[16, 22], [27, 22]])       # pistol, walks the sidewalk
actor('k', 12, 12, face=270)                         # having a smoke in the service alley
# the bar
actor('h', 18, 12, face=90)                          # bartender, shotgun under the counter
actor('p', 24, 14, face=0)                           # watching the pool game
actor('p', 21, 16, face=180)
actor('U', 23, 18, route=[[23, 18], [24, 15], [29, 15], [29, 12], [24, 12]])
# back of house
actor('p', 17, 8, face=90)
actor('6', 18, 9)
actor('n', 16, 7)
actor('k', 22, 7, face=90)
actor('r', 30, 8, face=180)                          # the boss behind his desk
actor('u', 26, 9, face=45)
actor('s', 29, 10, face=200)
actor('v', 30, 10)
# back lot
actor('p', 19, 3, face=0)

# ---------------------------------------------------------------- props
area('the alley where it starts')
prop('dumpster', 23.42, 35.0, 90)
prop('trash_can', 20.45, 36.4)
prop('trash_can', 20.5, 35.6)
prop('crate', 20.45, 33.3, 8)
prop('string_lights', 22.0, 33.9)
prop('string_lights', 22.0, 36.1)
prop('wall_lamp', 20.09, 34.6, 270)

area('south sidewalk')
prop('streetlight', 15.5, 30.3, 270)
prop('streetlight', 28.5, 30.3, 270)
prop('bench', 12.5, 31.7, 180)
prop('trash_can', 14.0, 31.65)
prop('hydrant', 26.5, 30.35)
prop('neon_sign_palm', 28.5, 31.91, 180)
prop('palm_tree', 4.5, 31.2)
prop('palm_tree', 39.5, 31.2)

area('road: parked along the bar side')
prop('car2', 14.6, 24.0, 0, lights=False)
prop('car', 31.2, 24.0, 180)
prop('van', 38.6, 24.05, 180, lights=False)

area('north sidewalk and the facade')
prop('marquee', 19.0, 20.69)
prop('neon_sign_bar', 30.0, 21.09)
prop('neon_sign_arrow', 9.4, 21.09)
prop('plant', 20.6, 21.3)
prop('plant', 23.4, 21.3)
prop('streetlight', 6.5, 22.7, 90)
prop('streetlight', 35.5, 22.7, 90)
prop('bench', 36.6, 21.3)
prop('trash_can', 34.9, 21.35)
prop('hydrant', 11.6, 22.65)
prop('palm_tree', 2.5, 21.8)
prop('palm_tree', 41.6, 21.8)

area('service alley')
prop('wall_lamp', 11.09, 19.0, 270)
prop('trash_can', 13.5, 17.4)
prop('trash_can', 13.45, 18.25)
prop('crate', 11.45, 16.9, -6)
prop('dumpster', 11.62, 14.5, 90)
prop('neon_tube_cyan', 13.93, 9.9, 90)
prop('crate', 11.45, 9.8, 4)
prop('barrel', 11.45, 6.5)

area('back lot')
prop('van', 24.5, 2.3, 180, lights=False)
prop('dumpster', 15.2, 1.6)
prop('crate', 17.2, 1.45, 5)
prop('crate', 17.9, 1.5, -10)
prop('crate', 17.5, 2.15, 30)
prop('barrel', 12.0, 1.45)
prop('barrel', 12.65, 1.5)
prop('trash_can', 30.4, 4.4)
prop('wall_lamp', 17.5, 4.91, 180)
prop('tube_light', 29.9, 4.93, 180)

area('storeroom')
prop('bookshelf', 15.7, 6.2)
prop('bookshelf', 17.0, 6.2)
prop('sink', 18.35, 6.3)
prop('fridge', 19.55, 6.4)
prop('tube_light', 19.93, 8.5, 90)
prop('barrel', 15.4, 9.7)
prop('crate', 19.5, 9.7, 4)
prop('crate', 19.45, 10.45, -3)
prop('crate', 18.75, 10.5, 12)

area('toilets')
prop('toilet', 21.5, 6.4)
prop('toilet', 23.4, 6.4)
prop('sink', 23.7, 9.0, 90)
prop('tube_light', 21.07, 8.6, 270)
prop('trash_can', 21.4, 10.5)

area('back room')
prop('tv', 29.5, 6.3)
prop('table_lamp', 30.5, 6.4)
prop('plant', 25.45, 6.5)
prop('desk', 29.5, 8.3, 90)
prop('sofa', 25.5, 8.6, 270)
prop('table_round', 27.3, 7.9)
prop('chair', 27.3, 7.05, 90)
prop('chair', 28.15, 7.9, 180)
prop('chair', 27.3, 8.75, 270)
prop('ceiling_lamp', 27.3, 7.9)
prop('floor_lamp', 25.4, 10.55)

area('the bar: counter along the north wall')
for i in range(6):
    prop('bar_counter', 15.5 + i, 13.4)
for x in (15.6, 16.8, 18.0, 19.2, 20.4):
    prop('chair', x, 14.15, 270)
prop('bookshelf', 17.5, 12.2)
prop('bookshelf', 20.1, 12.2)
prop('neon_tube_pink', 18.8, 12.07)
for x in (16.5, 18.5, 20.5):
    prop('ceiling_lamp', x, 13.4)

area('the bar: booths, tables, pool, lounge')
for y in (16.2, 18.6):
    prop('sofa', 15.5, y, 270)
    prop('table', 16.5, y, 90)
    prop('chair', 17.3, y - 0.4, 180)
    prop('chair', 17.3, y + 0.4, 180)
prop('table_round', 20.0, 17.0)
prop('chair', 20.0, 16.15, 90)
prop('chair', 19.15, 17.0, 0)
prop('chair', 20.85, 17.0, 180)
prop('table_round', 24.4, 17.7)
prop('chair', 24.4, 16.85, 90)
prop('chair', 25.25, 17.7, 180)
prop('pool_table', 27.0, 14.0)
prop('pool_lamp', 27.0, 14.0)
prop('arcade', 30.5, 12.5, 90)
prop('wall_lamp', 30.91, 15.5, 90)
prop('jukebox', 23.6, 19.6, 180)
prop('plant', 20.55, 19.5)
prop('plant', 24.4, 12.45)
prop('armchair', 30.45, 17.1, 180)
prop('armchair', 29.9, 19.45, 270)
prop('table_round', 29.1, 18.1)
prop('floor_lamp', 30.6, 18.35)

# indirect fill only (no visible source): the glow of the city over the street
lights = [
    [8, 26.5, 9, '#5a6ad8', 0.3],
    [22, 26.5, 9, '#7a5ad8', 0.3],
    [36, 26.5, 9, '#5a6ad8', 0.3],
    [20, 2.5, 7, '#5a6ad8', 0.25],
]

ambient = {
    'traffic': [
        {'row': 26.2, 'dir': -1, 'speed': 9, 'gap': [7, 16], 'models': ['car', 'car2', 'van']},
        {'row': 28.75, 'dir': 1, 'speed': 10, 'gap': [6, 14], 'models': ['car', 'car2', 'van']},
    ],
    'walkers': [
        {'path': [[-1, 30.9], [45, 30.9]], 'gap': [9, 20], 'max': 2},
        {'path': [[45, 31.4], [-1, 31.4]], 'gap': [12, 26], 'max': 2},
    ],
}

exit_zone = {'x': 28.7, 'y': 2.4, 'r': 1.4}

# ---------------------------------------------------------------- checks
# hitboxes in px (src/game/data/props.js); None = hangs / sits on a wall, never in the way
SIZES = dict(
    table=(44, 26), table_round=(28, 28), desk=(46, 24), chair=(14, 14), armchair=(26, 26), sofa=(64, 28),
    plant=(15, 15), tv=(22, 15), fridge=(22, 22), oven=(20, 20), sink=(26, 18), toilet=(13, 21), bed=(44, 64),
    pool_table=(80, 44), arcade=(22, 27), crate=(19, 19), barrel=(18, 18), bookshelf=(40, 11), speaker=(14, 14),
    dj_booth=(58, 22), bar_counter=(32, 19), dumpster=(58, 34), trash_can=(15, 15), jukebox=(28, 20),
    hydrant=(8, 8), bench=(50, 15), palm_tree=(9, 9), streetlight=(6, 6), floor_lamp=(10, 10), table_lamp=(15, 15),
    car=(136, 54), car2=(130, 52), van=(156, 60),
    marquee=None, neon_sign_bar=None, neon_sign_palm=None, neon_sign_arrow=None, wall_lamp=None, tube_light=None,
    neon_tube_pink=None, neon_tube_cyan=None, ceiling_lamp=None, pool_lamp=None, string_lights=None,
)


def box(kind, col, row, deg):
    w, h = SIZES[kind]
    if round(deg) % 180 == 90:
        w, h = h, w
    elif round(deg) % 90:
        w = h = max(w, h)
    return (col - w / 64, row - h / 64, col + w / 64, row + h / 64)


def check():
    boxes = []
    for (_, kind, col, row, deg, _) in props:
        assert kind in SIZES, f'unknown prop {kind}'
        if SIZES[kind] is None:
            continue
        b = box(kind, col, row, deg)
        for y in range(int(b[1] + 0.02), int(b[3] - 0.02) + 1):
            for x in range(int(b[0] + 0.02), int(b[2] - 0.02) + 1):
                assert tiles[y][x] not in SOLID and tiles[y][x] not in 'DLG', f'{kind} at {col},{row} is in {tiles[y][x]!r} ({x},{y})'
        for (ok, ob) in boxes:
            # a bar is made of touching modules
            if kind == ok == 'bar_counter':
                continue
            assert not (b[0] < ob[2] - 0.01 and ob[0] < b[2] - 0.01 and b[1] < ob[3] - 0.01 and ob[1] < b[3] - 0.01), \
                f'{kind} at {col},{row} overlaps {ok}'
        for (sx, sy) in spawns:
            assert not (b[0] - 0.27 < sx < b[2] + 0.27 and b[1] - 0.27 < sy < b[3] + 0.27), f'{kind} at {col},{row} on a spawn {sx},{sy}'
        boxes.append((kind, b))
    guards = sum(ch.lower() in 'pushrbk' for row in actors for ch in row if ch.isalpha())
    assert guards == 13, guards


# ---------------------------------------------------------------- output
def js(v):
    return json.dumps(v).replace('"', "'")


def write():
    L = []
    L.append('// Level 1 - "NEON NIGHTS": an alley, a road, the MIRAGE bar, its back room, and the way out through the back lot.')
    L.append('// Generated by tools/build_level1.py (edit the script: it checks spawns and furniture overlaps), 1 tile = 1 m.')
    L.append('// tiles legend: see src/game/world/TileMap.js (FLOORS/WALLS) - D door, L locked door, G window.')
    L.append('// actors legend: @ player | p u s h r b k guards (UPPERCASE = patrols) | 1-9 weapons | n z = 9mm, v w = 7.62, g = 12 gauge.')
    L.append('// props: [type, col, row, deg, options?] - lights: false = a parked vehicle with its lights off.')
    L.append('export default {')
    L.append("  name: 'NEON NIGHTS',")
    L.append("  subtitle: 'SUNSET BAY  -  APRIL 3RD 1986  -  2:14 AM',")
    L.append(f"  exit: {{ x: {exit_zone['x']}, y: {exit_zone['y']}, r: {exit_zone['r']} }},")
    L.append('  facing: { ' + ', '.join(f"'{k}': {v}" for k, v in facing.items()) + ' },')
    L.append('  patrols: {')
    for k, v in patrols.items():
        L.append(f"    '{k}': {json.dumps(v)},")
    L.append('  },')
    L.append('  tiles: [')
    L += [f'    {json.dumps("".join(r))},' for r in tiles]
    L.append('  ],')
    L.append('  actors: [')
    L += [f'    {json.dumps("".join(r).rstrip())},' for r in actors]
    L.append('  ],')
    L.append('  props: [')
    cur, line = None, ''
    for (a, kind, col, row, deg, opt) in props:
        if a != cur:
            if line:
                L.append('   ' + line)
            L.append(f'    // {a}')
            cur, line = a, ''
        item = f" ['{kind}', {col:g}, {row:g}, {deg:g}" + (', { ' + ', '.join(f'{k}: {js(v).lower()}' for k, v in opt.items()) + ' }' if opt else '') + '],'
        if len(line) + len(item) > 116:
            L.append('   ' + line)
            line = ''
        line += item
    if line:
        L.append('   ' + line)
    L.append('  ],')
    L.append('  // indirect fill only: every visible light is a prop (lamps, signs, tubes, headlights)')
    L.append('  lights: [')
    L += [f'    {js(l)},' for l in lights]
    L.append('  ],')
    L.append('  // street life (systems/Ambient.js): traffic lanes and passers-by')
    L.append('  ambient: {')
    L.append('    traffic: [')
    for t in ambient['traffic']:
        L.append(f"      {{ row: {t['row']}, dir: {t['dir']}, speed: {t['speed']}, gap: {t['gap']}, models: {js(t['models'])} }},")
    L.append('    ],')
    L.append('    walkers: [')
    for w in ambient['walkers']:
        L.append(f"      {{ path: {json.dumps(w['path'])}, gap: {w['gap']}, max: {w['max']} }},")
    L.append('    ],')
    L.append('  },')
    L.append('};')
    with open(OUT, 'w', encoding='utf-8', newline='\n') as f:
        f.write('\n'.join(L) + '\n')
    print(f'wrote {OUT}: {W}x{H} tiles, {len(props)} props')


if __name__ == '__main__':
    check()
    write()
