#!/usr/bin/env python3
"""Builds src/game/data/levels/level1.js ("NEON NIGHTS": the MIRAGE bar) with tools/levelkit.py.

    python tools/build_level1.py

Plan (north is up):

    rows  1-4    back lot: getaway van, the way out
    rows  6-10   storeroom | toilets | back room (the boss)
    rows 12-19   the bar: counter, booths, card table, pool table, VIP room
    rows 21-22   sidewalk
    rows 23-29   road: parking strip, two lanes of traffic
    rows 30-31   sidewalk
    rows 32-36   the alley where the player starts
    cols 11-13   service alley along the bar, from the street to the back lot
    col  32      the gap between the bar and the next building

The street is alive at 2:14 AM: three shop fronts throw their light on the sidewalks through their display windows
(a liquor store and a TV shop, closed, on either side of the bar; a laundromat open all night next to the start alley).
They are public ground, and nothing in them leads anywhere.

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
# the VIP room in the south-east corner: no window, an open doorway on the main room
lv.fill(25, 16, 30, 19, '#')
lv.fill(26, 17, 30, 19, ':')
lv.put(25, 18, ':')
lv.put(16, 11, 'D')            # behind the counter -> storeroom
lv.put(22, 11, 'D')            # toilets
lv.put(27, 11, 'L')            # back room, locked: kick it or shoot it
lv.put(14, 8, 'D')             # storeroom -> service alley
lv.put(28, 5, 'L')             # back room -> back lot, locked: the back way in has to be forced
lv.put(26, 5, 'G')
lv.put(31, 14, 'G')            # the pool corner, seen from the gap
for x in (15, 16, 24):
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
# shop fronts, 3 m deep behind their display windows: liquor store (west of the bar) and TV shop (east), both locked
# for the night, and the laundromat by the start alley, open
lv.fill(3, 17, 8, 19, ',')
lv.fill(5, 20, 7, 20, 'G')
lv.put(8, 20, 'L')
lv.fill(36, 17, 39, 19, ';')
lv.fill(36, 20, 38, 20, 'G')
lv.put(39, 20, 'L')
lv.fill(27, 33, 31, 35, '+')
lv.fill(27, 32, 29, 32, 'G')
lv.put(30, 32, 'D')

# ---------------------------------------------------------------- actors (15 guards)
# Blades, bats and a tire iron: thirteen men with their hands. Two guns in the whole house: the pool player's pistol
# in the bar room, the boss's shotgun in the back room. One more for the taking, behind the liquor store's counter
# (it is closed: breaking in rings its bell). A pistol holds seven rounds, and nobody carries a spare magazine.
lv.actor('@', 20, 34, face=0)
lv.intro = 'sit'                                        # on the ground, his back to the wall: he gets up

# The street, the start alley, the bar room and its toilets are public ground: anyone may walk in for a drink.
# Off limits: the back lot, the service alley behind its gate, the gap, and inside the bar the storeroom, the
# boss's back room, behind the counter and the VIP room. Whoever is seen there is thrown out the hard way.
lv.guard(11, 0, 32, 4)                                  # back lot
lv.guard(11, 5, 13, 20)                                 # service alley, behind the gate
lv.guard(32, 5, 32, 19)                                 # the gap
lv.guard(14, 5, 20, 11)                                 # storeroom and its door
lv.guard(24, 5, 31, 11)                                 # back room and its door
lv.guard(15, 12, 20, 12)                                # behind the counter
lv.guard(25, 16, 30, 19)                                # VIP room and its doorway
# customers hang about freely in the bar room and the toilets (not in front of the VIP door: the bouncer's spot)
lv.host(21, 12, 30, 12)
lv.host(15, 13, 30, 15)
lv.host(15, 16, 23, 19)
lv.host(21, 6, 23, 11)
# street
lv.actor('b', 24, 21, face=90, job='door')                   # bouncer
lv.actor('J', 17, 22, route=[[16, 22], [27, 22]])       # a blade in his pocket, walks the sidewalk
lv.actor('k', 12, 12, face=270)                         # having a smoke in the service alley
# the bar
lv.actor('b', 18, 12, face=90, job='wipe')                   # bartender, a bat under the counter
lv.actor('p', 24, 14, face=349, job='pool')             # playing pool: the one pistol of the bar room
lv.actor('0', 25, 15)                                   # a cue left against the pool table
lv.actor('k', 20, 16, face=90, job='cards')             # dealing at the card table
lv.actor('b', 24, 17, face=65, job='door')                   # bouncer of the VIP room, an eye on its door
# customers (civilians): they run for the street when it kicks off
lv.patron('civ1', 16.8, 14.15, 270, 'drink')            # on the counter stools
lv.patron('civ3', 19.2, 14.15, 270, 'drink')
lv.patron('civ2', 15.6, 16.2, 0, 'drink')               # a couple in the first booth
lv.patron('civ4', 17.3, 15.8, 180, 'watch')
lv.patron('civ4', 19.25, 17.5, 0, 'cards')              # the poker game
lv.patron('civ1', 21.55, 17.5, 180, 'cards')
lv.patron('civ2', 20.82, 18.32, 270, 'cards')
lv.patron('civ3', 28.35, 14.0, 180, 'cue')              # waiting for his turn at the pool table
lv.patron('civ1', 26.55, 17.5, 40, 'drink')             # the VIP room: three customers, two dancers
lv.patron('civ3', 26.55, 19.45, -27, 'watch')
lv.patron('civ4', 28.6, 17.5, 60, 'drink')
lv.patron('dancer1', 29.5, 18.9, 180, 'dance')
lv.patron('dancer2', 27.9, 18.75, 190, 'dance')
# back of house
lv.actor('j', 17, 8, face=90, job='count')              # the pimp, alone, counting his dope
lv.actor('6', 19, 7)
lv.actor('k', 22, 7, face=90)
lv.actor('h', 30, 8, face=180)                          # the boss behind his desk, a shotgun across it
lv.actor('m', 26, 9, face=45)
lv.actor('k', 28, 9, face=20, job='count')              # counting the night's banknotes by the boss's case
lv.actor('i', 29, 10, face=200)                         # his bodyguard, a tire iron in his fist
lv.actor('6', 32, 17)                                   # a blade someone dropped in the gap
lv.actor('1', 8, 17)                                    # what the liquor store keeps behind its counter
# back lot: he walks along the back wall, past the back room's door, and turns round short of the gap
lv.actor('M', 19, 4, route=[[13, 4], [29, 4]])
lv.actor('b', 26, 4, face=270, job='door')              # posted by the back door, his back to the wall

# ---------------------------------------------------------------- props
lv.area('the alley where it starts')
lv.prop('dumpster', 23.42, 35.0, 90)
lv.prop('trash_can', 20.45, 36.4)
lv.prop('trash_can', 20.5, 35.6)
lv.prop('crate', 20.45, 33.3, 8)
lv.prop('trash_can', 23.3, 32.5)                        # on the cat's way out
lv.cat(23.4, 34.5)                                      # on the dumpster, watching him
lv.pigeons(16.5, 30.6, 3)
lv.prop('string_lights', 22.0, 33.9)
lv.prop('string_lights', 22.0, 36.1)
lv.prop('wall_lamp', 20.09, 34.6, 270)

lv.area('south sidewalk')
lv.prop('streetlight', 15.5, 30.3, 270)
lv.prop('streetlight', 28.5, 30.3, 270)
lv.prop('bench', 12.5, 31.7, 180)
lv.prop('hydrant', 26.5, 30.35)
lv.prop('phone_booth', 34.6, 31.61, 180)                # its back to the wall, open on the street
lv.prop('news_box', 10.7, 31.8, 180)
lv.dress('papers', 0, 30, 43, 31, 9)
lv.dress('papers', 20, 32, 23, 36, 3)
lv.dress('beds', 22.1, 36.5, 0)                          # a tramp asleep on his cardboard, against the wall
lv.patron('tramp', 22.1, 36.5, 180, 'sleep')
lv.prop('neon_sign_palm', 17.0, 31.91, 180)
lv.prop('palm_tree', 4.5, 31.2)
lv.prop('palm_tree', 39.5, 31.2)

lv.area('road: parked along the bar side')
lv.prop('car2', 14.6, 24.0, 0, lights=False, trunk='tire_iron')   # E at its tail: a tire iron in the trunk
lv.prop('car', 31.2, 24.0, 180)
lv.prop('van', 38.6, 24.05, 180, lights=False)

lv.area('north sidewalk and the facade')
lv.prop('neon_sign_bar', 30.0, 21.09)
lv.prop('neon_sign_arrow', 9.6, 21.09)
lv.prop('plant', 20.6, 21.3)
lv.prop('plant', 23.4, 21.3)
lv.prop('streetlight', 6.5, 22.7, 90)
lv.prop('streetlight', 35.5, 22.7, 90)
lv.prop('bench', 37.5, 22.62, 180)                      # on the kerb, facing the TV shop's window
lv.prop('trash_can', 40.5, 21.35)
lv.pigeons(33.3, 21.7, 2)
lv.prop('hydrant', 11.6, 22.65)
lv.prop('vending', 18.5, 21.33)                         # drinks machine against the bar's front
lv.prop('news_box', 26.6, 21.19)
for col in (12.3, 16.9, 28.8, 33.6, 41.3):              # a meter at the head of each parking bay
    lv.prop('parking_meter', col, 22.78)
lv.dress('papers', 0, 21, 43, 22, 9)
lv.dress('papers', 0, 23, 43, 29, 6)
lv.dress('manholes', 9.5, 25.2)
lv.dress('manholes', 27.3, 28.5)
lv.prop('palm_tree', 2.5, 21.8)
lv.prop('palm_tree', 41.6, 21.8)

lv.area('liquor store')
lv.prop('neon_sign_liquor', 4.0, 21.09)
lv.alarm(3, 17, 8, 19, 4.87, 21.1)
for x in (3.7, 5.0, 6.3):
    lv.prop('bottle_shelf', x, 17.2)
lv.prop('bottle_shelf', 8.3, 17.2)                      # behind the counter
lv.prop('bar_counter', 7.5, 18.4)
lv.prop('bar_counter', 8.5, 18.4)
lv.prop('bottle_shelf', 5.0, 18.5)
lv.prop('fridge', 3.4, 18.5, 270)
lv.prop('fridge', 3.4, 19.25, 270)
lv.prop('bottle_shelf', 5.7, 19.78, 180)                # the window display
lv.prop('crate', 6.9, 19.6, 10)
lv.prop('crate', 7.52, 19.62, -5)
lv.prop('ceiling_lamp', 4.6, 19.0)
lv.prop('ceiling_lamp', 6.9, 18.9)

lv.area('TV shop')
lv.prop('neon_sign_video', 34.9, 21.09)
lv.alarm(36, 17, 39, 19, 35.8, 21.1)
for x in (36.5, 37.5, 38.5):
    lv.prop('tv', x, 19.7)                              # left on all night, facing the street
lv.prop('tv', 37.7, 18.45)
lv.prop('bookshelf', 36.7, 17.2)
lv.prop('bookshelf', 38.0, 17.2)
lv.prop('desk', 39.5, 18.1, 90)
lv.prop('speaker', 36.3, 18.2)
lv.prop('speaker', 36.3, 18.75)
lv.prop('neon_tube_pink', 36.07, 18.5, 270)

lv.area('laundromat')
lv.prop('neon_sign_wash', 25.55, 31.91)
for x in (27.4, 28.12, 28.84, 29.56):
    lv.prop('washer', x, 35.6, 180)
lv.prop('washer', 31.6, 34.1, 90)
lv.prop('washer', 31.6, 34.82, 90)
lv.prop('bench', 28.3, 33.4)
lv.prop('trash_can', 31.6, 33.35)
lv.prop('plant', 31.55, 35.6)
lv.prop('tube_light', 28.5, 35.93, 180)
lv.prop('tube_light', 30.5, 35.93, 180)

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
lv.prop('gas_bottle', 13.72, 6.55)                      # the stove's gas, against the bar's wall
lv.prop('gas_bottle', 13.7, 7.05)
lv.prop('pipe_steam', 13.93, 13.6, 90)                  # the bar's heating, along its wall: a round makes it whistle
lv.dress('manholes', 12.5, 10.6)
lv.dress('papers', 11, 1, 13, 19, 4)

lv.area('back lot')
lv.prop('van', 24.5, 2.3, 180, lights=False)
lv.prop('dumpster', 15.2, 1.6)
lv.prop('crate', 17.2, 1.45, 5)
lv.prop('crate', 17.9, 1.5, -10)
lv.prop('crate', 17.5, 2.15, 30)
lv.prop('barrel', 12.0, 1.45)
lv.prop('barrel', 12.65, 1.5)
lv.prop('trash_can', 31.5, 1.5)
lv.pigeons(27.5, 2.6, 2)
lv.prop('crate', 32.4, 1.45, -8)
lv.prop('wall_lamp', 17.5, 4.91, 180)
lv.prop('wall_vent', 16.3, 4.92, 180)                   # the oven's extractor steams into the lot
lv.prop('pipe_water', 20.2, 1.07)
lv.dress('papers', 14, 1, 32, 4, 4)
lv.prop('tube_light', 29.9, 4.93, 180)
lv.prop('gas_bottle', 30.4, 4.74)

lv.area('storeroom')
lv.prop('bookshelf', 15.7, 6.2)
lv.prop('oven', 17.1, 6.38)
lv.prop('sink', 18.35, 6.3)
lv.prop('fridge', 19.55, 6.4)
lv.prop('tube_light', 19.93, 8.5, 90)
lv.prop('dope_table', 17.5, 9.32)
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
lv.prop('cash_case', 30.5, 9.8, 8)                      # the boss's takings, open by his desk
lv.prop('extinguisher', 27.5, 6.14)                     # on the wall behind him

lv.area('the bar: counter along the north wall')
for i in range(6):
    lv.prop('bar_counter', 15.5 + i, 13.4)
for x in (15.6, 16.8, 18.0, 19.2, 20.4):
    lv.prop('chair', x, 14.15, 270)
for x in (17.59, 19.41, 20.71):                           # the bottles: racked on the wall, either side of the
    lv.prop('back_bar', x, 12.16)                        # bartender and of the neon over his head
lv.prop('neon_tube_pink', 18.5, 12.05)
for x in (16.5, 18.5, 20.5):
    lv.prop('ceiling_lamp', x, 13.4)

lv.area('the bar: booths, card table, pool')
for y in (16.2, 18.6):
    lv.prop('sofa', 15.5, y, 270)
    lv.prop('table', 16.5, y, 90)
    lv.prop('chair', 17.3, y - 0.4, 180)
    lv.prop('chair', 17.3, y + 0.4, 180)
lv.prop('card_table', 20.4, 17.5)
lv.prop('chair', 19.25, 17.5, 0)
lv.prop('chair', 21.55, 17.5, 180)
lv.prop('chair', 19.98, 18.34, 262)
lv.prop('chair', 20.82, 18.32, 270)
lv.prop('pool_table', 26.6, 14.0)
lv.prop('pool_lamp', 26.6, 14.0)
lv.prop('arcade', 30.5, 12.5, 90)
lv.prop('wall_lamp', 30.91, 15.5, 90)
lv.prop('jukebox', 23.6, 19.6, 180)
lv.prop('ceiling_fan', 23.2, 15.7)                      # turning over the middle of the room
lv.prop('extinguisher', 23.6, 12.14)                    # by the toilets' door
lv.prop('plant', 20.55, 19.5)
lv.prop('plant', 24.4, 12.45)

lv.area('the bar: VIP room')
lv.prop('dance_stage', 30.0, 18.9)
lv.prop('mirror_ball', 28.5, 18.6)                      # its specks turn round the room
lv.prop('sofa', 28.4, 17.45)
lv.prop('armchair', 26.5, 17.5, 0)
lv.prop('armchair', 26.5, 19.45, 0)
lv.prop('plant', 30.55, 17.4)
lv.prop('neon_tube_pink', 28.0, 19.93, 180)

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
lv.roof('antenna', 7.6, 12.9, 20)
lv.roof('chimney', 1.4, 17.6)
lv.roof('vent', 1.6, 19.0)

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
lv.roof('bulkhead', 37.0, 14.75, 180)
lv.roof('antenna', 41.6, 15.2, -15)
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
lv.roof('chimney', 33.7, 33.7)
lv.roof('skylight_tv', 34.6, 35.8)
lv.roof('ac_unit', 36.0, 33.6)
lv.roof('duct', 37.72, 33.6)
lv.roof('tank', 37.3, 35.4)
lv.roof('ac_unit', 40.0, 36.4)
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
    lv.check(guards=15)
    lv.write('level1', name='NEON NIGHTS', subtitle='SUNSET BAY  -  APRIL 3RD 1986  -  2:14 AM', exit=exit_zone,
             objective=['CLEAN OUT THE BAR', 'GET TO THE VAN IN THE BACK LOT'],
             lights=lights, ambient=ambient, header=[
                 'Level 1 - "NEON NIGHTS": an alley, a road, the MIRAGE bar, its back room, and the way out through the back lot.',
                 'Three ways in: the front door, the chain-link gate of the service alley (west), the dark gap behind the',
                 'anonymous door right of the bar (east). Lit shop fronts on the street: liquor, TV, laundromat.',
             ])
