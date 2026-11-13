#!/usr/bin/env python3
"""Builds src/game/data/levels/level1.js ("NEON NIGHTS": the MIRAGE bar) with tools/levelkit.py.

    python tools/build_level1.py

Plan (north is up):

    rows  1-4    back lot: getaway van, the way out
    rows  6-10   storeroom | toilets | back room (the boss)
    rows 12-19   the bar: counter, booths, pool table, lounge
    rows 21-22   sidewalk
    rows 23-29   road: parking strip, two lanes of traffic
    rows 30-31   sidewalk
    rows 32-36   the alley where the player starts
    cols 11-13   service alley along the bar, from the street to the back lot
    col  32      the gap between the bar and the next building

Three ways in, none of them free:
    the front    double door under the neon: the bouncer, the sidewalk patrol, the whole room at once
    the gate     west service alley, closed by a chain-link gate to climb (Space): the shortest way to the back, but
                 under a lamp, in full view of the street through the mesh, with a man smoking a few metres further
    the gap      an anonymous door right of the bar opens on a dark one-metre gap: nobody posted there and no light,
                 but it is the long way round, with no room to dodge, past a window of the bar, and it comes out
                 in the back lot under the tube light where a guard walks his round
"""
from levelkit import Level

W, H = 44, 38
lv = Level(W, H)

# ---------------------------------------------------------------- tiles
# back lot and service alley
lv.fill(11, 1, 32, 4, '_')
lv.fill(11, 5, 13, 20, '_')
# the gap between the bar and the next building: a door like any other on the street, a window of the bar on it
lv.fill(32, 5, 32, 19, '_')
lv.put(32, 20, 'D')
# the bar: storeroom, toilets, back room, main room
lv.fill(15, 6, 19, 10, '_')
lv.fill(21, 6, 23, 10, '+')
lv.fill(25, 6, 30, 10, ';')
lv.fill(20, 6, 20, 10, '#')
lv.fill(24, 6, 24, 10, '#')
lv.fill(15, 11, 30, 11, '#')
lv.fill(15, 12, 30, 19, '.')
lv.fill(25, 16, 30, 19, ':')
lv.put(16, 11, 'D')            # behind the counter -> storeroom
lv.put(22, 11, 'D')            # toilets
lv.put(27, 11, 'L')            # back room, locked: kick it or shoot it
lv.put(14, 8, 'D')             # storeroom -> service alley
lv.put(28, 5, 'D')             # back room -> back lot
lv.put(26, 5, 'G')
lv.put(31, 14, 'G')            # the pool corner, seen from the gap
for x in (15, 16, 24, 25, 27, 28):
    lv.put(x, 20, 'G')         # facade windows
lv.put(21, 20, 'D')
lv.put(22, 20, 'D')            # front double door
# the street, open at both ends for the traffic
lv.fill(0, 21, W - 1, 22, 's')
lv.fill(0, 23, W - 1, 29, '=')
lv.fill(0, 27, W - 1, 27, '-')
lv.fill(0, 30, W - 1, 31, 's')
# the alley across the road
lv.fill(20, 32, 23, 36, '_')

# ---------------------------------------------------------------- actors (13 guards)
lv.actor('@', 21, 35, face=270)
# the bar, its service alley, the gap and the back lot are off limits; the street and the start alley are public ground
lv.guard(11, 0, 32, 19)
lv.guard(11, 20, 13, 20)                                # behind the gate
lv.actor('5', 22, 33)                                   # a bat by the dumpster: the first weapon
# street
lv.actor('b', 24, 21, face=90)                          # bouncer
lv.actor('P', 17, 22, route=[[16, 22], [27, 22]])       # pistol, walks the sidewalk
lv.actor('k', 12, 12, face=270)                         # having a smoke in the service alley
# the bar
lv.actor('h', 18, 12, face=90)                          # bartender, shotgun under the counter
lv.actor('p', 24, 14, face=0)                           # watching the pool game
lv.actor('p', 21, 16, face=180)
lv.actor('U', 23, 18, route=[[23, 18], [24, 15], [29, 15], [29, 12], [24, 12]])
# back of house
lv.actor('p', 17, 8, face=90)
lv.actor('6', 18, 9)
lv.actor('n', 16, 7)
lv.actor('k', 22, 7, face=90)
lv.actor('r', 30, 8, face=180)                          # the boss behind his desk
lv.actor('u', 26, 9, face=45)
lv.actor('s', 29, 10, face=200)
lv.actor('v', 30, 10)
# back lot: he walks along the back wall, past the back room's door, and turns round short of the gap
lv.actor('P', 19, 4, route=[[13, 4], [29, 4]])

# ---------------------------------------------------------------- props
lv.area('the alley where it starts')
lv.prop('dumpster', 23.42, 35.0, 90)
lv.prop('trash_can', 20.45, 36.4)
lv.prop('trash_can', 20.5, 35.6)
lv.prop('crate', 20.45, 33.3, 8)
lv.prop('string_lights', 22.0, 33.9)
lv.prop('string_lights', 22.0, 36.1)
lv.prop('wall_lamp', 20.09, 34.6, 270)

lv.area('south sidewalk')
lv.prop('streetlight', 15.5, 30.3, 270)
lv.prop('streetlight', 28.5, 30.3, 270)
lv.prop('bench', 12.5, 31.7, 180)
lv.prop('trash_can', 14.0, 31.65)
lv.prop('hydrant', 26.5, 30.35)
lv.prop('neon_sign_palm', 28.5, 31.91, 180)
lv.prop('palm_tree', 4.5, 31.2)
lv.prop('palm_tree', 39.5, 31.2)

lv.area('road: parked along the bar side')
lv.prop('car2', 14.6, 24.0, 0, lights=False)
lv.prop('car', 31.2, 24.0, 180)
lv.prop('van', 38.6, 24.05, 180, lights=False)

lv.area('north sidewalk and the facade')
lv.prop('neon_sign_bar', 30.0, 21.09)
lv.prop('neon_sign_arrow', 9.4, 21.09)
lv.prop('plant', 20.6, 21.3)
lv.prop('plant', 23.4, 21.3)
lv.prop('streetlight', 6.5, 22.7, 90)
lv.prop('streetlight', 35.5, 22.7, 90)
lv.prop('bench', 36.6, 21.3)
lv.prop('trash_can', 34.9, 21.35)
lv.prop('hydrant', 11.6, 22.65)
lv.prop('palm_tree', 2.5, 21.8)
lv.prop('palm_tree', 41.6, 21.8)

lv.area('service alley')
for x in (11.5, 12.5, 13.5):
    lv.prop('chain_fence', x, 20.88)                    # the gate, flush with the facade
lv.prop('wall_lamp', 11.09, 19.0, 270)
lv.prop('trash_can', 13.5, 17.4)
lv.prop('trash_can', 13.45, 18.25)
lv.prop('crate', 11.45, 16.9, -6)
lv.prop('dumpster', 11.62, 14.5, 90)
lv.prop('neon_tube_cyan', 13.93, 9.9, 90)
lv.prop('crate', 11.45, 9.8, 4)
lv.prop('barrel', 11.45, 6.5)

lv.area('back lot')
lv.prop('van', 24.5, 2.3, 180, lights=False)
lv.prop('dumpster', 15.2, 1.6)
lv.prop('crate', 17.2, 1.45, 5)
lv.prop('crate', 17.9, 1.5, -10)
lv.prop('crate', 17.5, 2.15, 30)
lv.prop('barrel', 12.0, 1.45)
lv.prop('barrel', 12.65, 1.5)
lv.prop('trash_can', 31.5, 1.5)
lv.prop('crate', 32.4, 1.45, -8)
lv.prop('wall_lamp', 17.5, 4.91, 180)
lv.prop('tube_light', 29.9, 4.93, 180)

lv.area('storeroom')
lv.prop('bookshelf', 15.7, 6.2)
lv.prop('bookshelf', 17.0, 6.2)
lv.prop('sink', 18.35, 6.3)
lv.prop('fridge', 19.55, 6.4)
lv.prop('tube_light', 19.93, 8.5, 90)
lv.prop('barrel', 15.4, 9.7)
lv.prop('crate', 19.5, 9.7, 4)
lv.prop('crate', 19.45, 10.45, -3)
lv.prop('crate', 18.75, 10.5, 12)

lv.area('toilets')
lv.prop('toilet', 21.5, 6.4)
lv.prop('toilet', 23.4, 6.4)
lv.prop('sink', 23.7, 9.0, 90)
lv.prop('tube_light', 21.07, 8.6, 270)
lv.prop('trash_can', 21.4, 10.5)

lv.area('back room')
lv.prop('tv', 29.5, 6.3)
lv.prop('table_lamp', 30.5, 6.4)
lv.prop('plant', 25.45, 6.5)
lv.prop('desk', 29.5, 8.3, 90)
lv.prop('sofa', 25.5, 8.6, 270)
lv.prop('table_round', 27.3, 7.9)
lv.prop('chair', 27.3, 7.05, 90)
lv.prop('chair', 28.15, 7.9, 180)
lv.prop('chair', 27.3, 8.75, 270)
lv.prop('ceiling_lamp', 27.3, 7.9)
lv.prop('floor_lamp', 25.4, 10.55)

lv.area('the bar: counter along the north wall')
for i in range(6):
    lv.prop('bar_counter', 15.5 + i, 13.4)
for x in (15.6, 16.8, 18.0, 19.2, 20.4):
    lv.prop('chair', x, 14.15, 270)
lv.prop('bookshelf', 17.5, 12.2)
lv.prop('bookshelf', 20.1, 12.2)
lv.prop('neon_tube_pink', 18.8, 12.07)
for x in (16.5, 18.5, 20.5):
    lv.prop('ceiling_lamp', x, 13.4)

lv.area('the bar: booths, tables, pool, lounge')
for y in (16.2, 18.6):
    lv.prop('sofa', 15.5, y, 270)
    lv.prop('table', 16.5, y, 90)
    lv.prop('chair', 17.3, y - 0.4, 180)
    lv.prop('chair', 17.3, y + 0.4, 180)
lv.prop('table_round', 20.0, 17.0)
lv.prop('chair', 20.0, 16.15, 90)
lv.prop('chair', 19.15, 17.0, 0)
lv.prop('chair', 20.85, 17.0, 180)
lv.prop('table_round', 24.4, 17.7)
lv.prop('chair', 24.4, 16.85, 90)
lv.prop('chair', 25.25, 17.7, 180)
lv.prop('pool_table', 27.0, 14.0)
lv.prop('pool_lamp', 27.0, 14.0)
lv.prop('arcade', 30.5, 12.5, 90)
lv.prop('wall_lamp', 30.91, 15.5, 90)
lv.prop('jukebox', 23.6, 19.6, 180)
lv.prop('plant', 20.55, 19.5)
lv.prop('plant', 24.4, 12.45)
lv.prop('armchair', 30.45, 17.1, 180)
lv.prop('armchair', 29.9, 19.45, 270)
lv.prop('table_round', 29.1, 18.1)
lv.prop('floor_lamp', 30.6, 18.35)

# ---------------------------------------------------------------- rooftops of the neighbouring buildings
lv.area('west block, along the service alley')
lv.roof('skylight_dark', 7.4, 1.7)
lv.roof('tank', 3.2, 4.3)
lv.roof('vent', 8.6, 3.6)
lv.roof('vent', 8.6, 4.6)
lv.roof('ac_unit', 8.7, 6.6, 90)
lv.roof('duct', 7.0, 6.6)
lv.roof('ac_unit', 8.7, 8.4, 90)
lv.roof('bulkhead', 5.6, 10.4)
lv.roof('chimney', 2.4, 9.2)
lv.roof('hatch', 8.9, 12.6)
lv.roof('skylight', 4.2, 14.9)
lv.roof('skylight', 6.2, 14.9)
lv.roof('antenna', 8.6, 17.4, 20)
lv.roof('chimney', 2.4, 17.6)
lv.roof('vent', 5.2, 18.6)

lv.area('east block, behind the bar')
lv.roof('skylight', 35.2, 2.6, 90)
lv.roof('vent', 34.4, 5.2)
lv.roof('chimney', 38.6, 4.4)
lv.roof('ac_unit', 34.6, 7.6, 90)
lv.roof('ac_unit', 34.6, 9.4, 90)
lv.roof('duct', 36.2, 9.4)
lv.roof('tank', 40.2, 8.6)
lv.roof('skylight_tv', 35.6, 12.6)
lv.roof('skylight_dark', 38.2, 12.6)
lv.roof('hatch', 34.5, 14.9)
lv.roof('bulkhead', 37.0, 16.4, 180)
lv.roof('antenna', 34.8, 18.2, -15)
lv.roof('vent', 41.4, 18.4)

lv.area('south west block, by the alley')
lv.roof('chimney', 2.6, 34.4)
lv.roof('skylight_dark', 5.4, 35.6)
lv.roof('vent', 8.2, 33.8)
lv.roof('antenna', 9.8, 36.2, 35)
lv.roof('ac_unit', 12.4, 34.1)
lv.roof('duct', 14.13, 34.1)
lv.roof('hatch', 13.0, 36.6)
lv.roof('skylight', 16.0, 35.7)
lv.roof('vent', 18.4, 33.6)
lv.roof('vent', 18.4, 37.3)

lv.area('south east block, by the alley')
lv.roof('vent', 25.6, 36.9)
lv.roof('skylight_tv', 27.4, 35.3)
lv.roof('chimney', 29.6, 33.8)
lv.roof('ac_unit', 31.6, 36.3)
lv.roof('ac_unit', 33.4, 36.3)
lv.roof('duct', 32.5, 35.2)
lv.roof('tank', 36.4, 35.4)
lv.roof('skylight_dark', 39.6, 34.4)
lv.roof('antenna', 42.0, 36.4, -25)

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

if __name__ == '__main__':
    lv.check(guards=13)
    lv.write('level1', name='NEON NIGHTS', subtitle='SUNSET BAY  -  APRIL 3RD 1986  -  2:14 AM', exit=exit_zone,
             lights=lights, ambient=ambient, header=[
                 'Level 1 - "NEON NIGHTS": an alley, a road, the MIRAGE bar, its back room, and the way out through the back lot.',
                 'Three ways in: the front door, the chain-link gate of the service alley (west), the dark gap behind the',
                 'anonymous door right of the bar (east).',
             ])
