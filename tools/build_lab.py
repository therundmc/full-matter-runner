#!/usr/bin/env python3
"""Builds src/game/data/levels/lab.js (the physics lab / sandbox, ?level=lab) with tools/levelkit.py.

    python tools/build_lab.py

A test ground for what the game does, one station each, its name stencilled on the floor by it (props/label_*).
Plan (north is up, 1 tile = 1 m; columns and rows of the level):

    rows  1-5    1 RANGE (cols 1-8, rows 2-11 under a plaster back wall) | 2 EXECUTIONS (cols 10-30, a locked door from
                 the range) | the bar room (cols 32-46: 8 POOL, 9 JUKEBOX, 9 TRAPDOOR), its door on the hall
    rows  7-10   the range's firing line (guns on row 9, ammo on rows 10-11) | 3 SOOT (cols 10-14) | the passage to the
                 hall (cols 16-17) | 4 POWDER corridor (rows 8-9, cols 18-28) | the lobby (cols 32-38: 9 POWER, 7 BARS
                 under the bar room's windows, 7 CURTAIN) | the VIP room behind the curtain (cols 40-46)
    rows 12-16   the yard: the start, 5 STEAM on its north wall, junk, the other trapdoor | 6 LIQUIDS (cols 37-46)
    rows 17-18   sidewalk: the hydrant by the kerb
    rows 19-23   road: VEHICLES (a car, the van, and a car whose tank is by the hydrant), two barrels

    1 RANGE       every gun on the firing line, two rows of ammo boxes behind it; dummies, crates, a barrel, a bolted
                  table and a bookshelf down range against a plaster wall (bullet holes)
    2 EXECUTIONS  ten men facing the north wall, their backs to the lane; a weapon on the floor behind each (knife,
                  bat, tire iron, cue, nothing: fists, 1911, Uzi, M16, SUPER 90, .50 CAL): Space behind one
    3 SOOT        a closed room (a door, a window) with two gas bottles: the soot hangs and drifts out
    4 POWDER      an extinguisher on the wall of a dead-end corridor, a man (awake) at its far end; a silenced Uzi in
                  the passage: hole it without a sound and walk up to him in the white
    5 STEAM       a steam pipe to pierce on the yard's wall, a wall vent, a manhole
    6 LIQUIDS     a little bar on tiles: kegs behind the counter, the fire alarm and its sprinklers, a water pipe, two
                  dummies to bleed; the hydrant on the kerb outside, a car in the road whose tank leaks petrol
    7 CURTAIN     a velvet curtain in the VIP room's doorway, a man (awake) behind it facing it; BARS: the barred window
    8 POOL        a man bent over the pool table, its balls to send rolling (a round, a blow, a body into it)
    9 POWER       the bar room: lit behind its windows on the dark lobby, on the fuse box in the lobby (emergency
                  lights over its doors), the jukebox (E), a trapdoor (E) to the one in the yard; in the yard a wall
                  lamp that is going (flicker 'broken')
The guards are passive dummies (they see and hear nothing but go on at their job), except the two `awake` ones.
F1 is open from the start (game/debug/Sandbox.js); T wakes or freezes them all.
"""
from levelkit import Level

W, H = 48, 25
lv = Level(W, H)

# ---------------------------------------------------------------- tiles
lv.fill(1, 1, 46, 16, '#')                 # plaster inside the brick ring: it takes holes, rounds go through
# 1 RANGE: plaster back wall on row 1, open on the yard at its south end
lv.fill(1, 2, 8, 11, '_')
# 2 EXECUTIONS
lv.fill(10, 1, 30, 5, '.')
lv.put(9, 4, 'L')                          # a locked door from the range: kick it, shoot it
lv.put(31, 3, 'D')                         # to the bar room
# the passage from the yard to the execution hall
lv.fill(16, 6, 17, 11, '_')
# 3 SOOT: a closed room, a door and a window on the yard
lv.fill(10, 7, 14, 10, '_')
lv.put(11, 11, 'D')
lv.put(13, 11, 'G')
# 4 POWDER: a dead-end corridor off the passage
lv.fill(18, 8, 28, 9, '+')
# 9 POWER: the bar room, its windows and door on the lobby
lv.fill(32, 1, 46, 5, ':')
for x in (33, 34, 36):
    lv.put(x, 6, 'G')
lv.bar((36, 6))                            # 7 BARS: iron bars outside the glass
lv.put(38, 6, 'D')
# 7 CURTAIN: the lobby, the VIP room behind its curtained doorway
lv.fill(32, 7, 38, 10, ';')
lv.fill(40, 7, 46, 10, ';')
lv.put(39, 8, ';')
lv.fill(34, 11, 35, 11, '_')               # the lobby open on the yard
# the yard
lv.fill(1, 12, 35, 16, '_')
# 6 LIQUIDS: a little bar on tiles, doors on the yard and on the sidewalk
lv.fill(37, 12, 46, 15, '+')
lv.put(36, 13, 'D')
lv.put(41, 16, 'D')
# the street
lv.fill(1, 17, 46, 18, 's')
lv.fill(1, 19, 46, 23, '=')
lv.fill(1, 21, 46, 21, '-')

# ---------------------------------------------------------------- actors (18 guards)
lv.actor('@', 20, 14, face=270)

lv.area('1 range')
lv.paint('label_range', 4.6, 12.6)
for x, kind in zip(range(1, 8), ('pistol', 'uzi', 'uzi_silenced', 'rifle', 'shotgun', 'sniper', 'bazooka')):
    lv.drop(kind, x + 0.5, 9.45, 270)      # on the firing line, pointing down range
for x, ch in zip(range(1, 8), 'nnnvgvq'):
    lv.actor(ch, x, 10)                    # a box of rounds behind each gun ...
for x, ch in ((2, 'z'), (4, 'w'), (5, 'g'), (7, 'q')):
    lv.actor(ch, x, 11)                    # ... and a few more
lv.actor('m', 2, 4, face=90)               # dummies facing the shooter
lv.actor('r', 4, 5, face=90)
lv.actor('k', 6, 3, face=90)
lv.prop('bookshelf', 4.5, 2.2)
lv.prop('crate', 1.6, 2.6)
lv.prop('crate', 7.35, 2.65, 10)
lv.prop('barrel', 7.4, 5.6)
lv.prop('table', 4.5, 7.0)
lv.prop('chair', 3.3, 7.0, 0)
lv.prop('tube_light', 2.5, 2.07, 0)
lv.prop('tube_light', 6.5, 2.07, 0)
lv.prop('ceiling_lamp', 4.5, 9.4)
lv.prop('ceiling_lamp', 2.5, 5.0)
lv.prop('ceiling_lamp', 6.5, 5.0)

lv.area('2 executions')
lv.paint('label_executions', 20.5, 5.5)
WEAPONS = ('knife', 'bat', 'tire_iron', 'cue', None, 'pistol', 'uzi', 'rifle', 'shotgun', 'sniper')
for i, (ch, kind) in enumerate(zip('mjibkpushr', WEAPONS)):
    x = 11 + 2 * i
    lv.actor(ch, x, 1, face=270)           # his face to the wall, his back to the lane
    if kind:
        lv.drop(kind, x + 0.5, 4.35, 0)    # what to take him with (none under the fifth man: fists)
for x in (14.5, 20.5, 26.5):
    lv.prop('ceiling_lamp', x, 3.0)

lv.area('3 soot')
lv.paint('label_soot', 12.5, 12.6)
lv.prop('gas_bottle', 11.6, 8.0)
lv.prop('gas_bottle', 13.4, 8.7)
lv.prop('crate', 14.3, 7.5, 6)
lv.prop('jerrycan', 10.5, 7.4)
lv.prop('tube_light', 12.5, 7.07, 0)

lv.area('4 powder')
lv.paint('label_powder', 17.0, 12.6)
lv.drop('uzi_silenced', 16.7, 10.4, 0)     # hole it without a sound: he would come to a shot
lv.actor('z', 17, 10)
lv.prop('extinguisher', 20.5, 8.14, 0)
lv.actor('j', 28, 8, face=180, job='hall', awake=True)   # sees down the corridor
lv.prop('tube_light', 26.5, 8.07, 0)

lv.area('5 steam')
lv.paint('label_steam', 23.5, 13.25)
lv.prop('pipe_steam', 21.5, 12.07, 0)
lv.prop('wall_vent', 25.5, 12.07, 0)
lv.dress('manholes', 23.5, 14.6)

lv.area('the yard: junk to shove, a lamp that is going')
lv.prop('wall_lamp', 9.5, 12.08, 0, flicker='broken')
lv.prop('wall_lamp', 29.5, 12.08, 0)
lv.prop('dumpster', 31.4, 12.6)
lv.prop('trash_can', 27.6, 12.5)
lv.prop('trash_can', 28.3, 12.55)
lv.prop('crate', 28.4, 15.4, -8)
lv.prop('crate', 29.1, 15.6, 12)
lv.prop('chair', 26.6, 15.5, 30)
lv.prop('barrel', 33.6, 15.5)
lv.prop('plant', 1.6, 15.4)

lv.area('9 power: the bar room')
lv.paint('label_pool', 35.5, 1.5)
lv.prop('pool_table', 35.5, 3.0)
lv.prop('pool_lamp', 35.5, 3.0)
lv.actor('i', 35, 4, face=270, job='pool')  # 8 POOL: bent over the table
lv.prop('jukebox', 41.5, 1.35, 0)
lv.paint('label_jukebox', 41.5, 2.4)
lv.prop('table', 44.0, 3.2)
lv.prop('chair', 43.2, 3.95, 270)
lv.prop('chair', 44.8, 3.95, 270)
lv.prop('ceiling_lamp', 41.5, 3.4)
lv.prop('neon_tube_pink', 44.5, 1.07, 0)
lv.prop('wall_lamp', 46.91, 3.0, 90)
lv.paint('label_trapdoor', 41.3, 5.45)
lv.power(32, 1, 46, 5, 35.5, 7.08, 0)      # the fuse box in the lobby, under the windows
lv.prop('emergency_light', 37.4, 5.92, 180)
lv.prop('emergency_light', 32.09, 2.2, 270)
lv.passage(('trapdoor', 45.4, 5.0, 0), ('trapdoor', 31.0, 15.4, 0))

lv.area('7 curtain: the lobby and the VIP room')
lv.paint('label_power', 34.4, 7.65)
lv.paint('label_bars', 37.3, 7.65)
lv.paint('label_curtain', 35.6, 9.0)
lv.prop('curtain', 39.5, 8.5)
lv.actor('k', 44, 8, face=180, job='hall', awake=True)   # facing the curtain: he sees nothing through it
lv.prop('sofa', 43.5, 10.45)
lv.prop('wall_lamp', 46.91, 9.0, 90)

lv.area('6 liquids')
lv.paint('label_liquids', 34.0, 14.0)
for x in (43.5, 44.5, 45.5):
    lv.prop('bar_counter', x, 13.25)
for x in (44.4, 45.2):
    lv.prop('keg', x, 12.4)                # behind the counter: holed, they flood it with beer
lv.prop('beer_tap', 44.0, 13.1)
lv.sprinklers(38.5, 12.07, 0, [(37, 12, 46, 15)])
lv.prop('pipe_water', 46.93, 14.0, 90)
lv.prop('tube_light', 40.5, 12.07, 0)
lv.actor('b', 38, 14, face=0)              # dummies to bleed
lv.actor('u', 40, 13, face=90)
lv.prop('hydrant', 39.5, 18.62)            # on the kerb: the water runs down the gutter

lv.area('the street: vehicles to ram, hole and blow up')
lv.paint('label_vehicles', 16.0, 19.55)
lv.prop('car', 8.0, 20.1, 0)
lv.prop('van', 24.0, 22.5, 180)
lv.prop('car2', 43.2, 20.1, 0)            # its tank (the rear, west end) by the hydrant: the petrol runs with the water
lv.prop('barrel', 14.5, 22.4)
lv.prop('barrel', 33.0, 22.5)
lv.prop('streetlight', 10.5, 18.7, 90)
lv.prop('streetlight', 30.5, 18.7, 90)
lv.prop('vending', 5.5, 17.35)
lv.prop('parking_meter', 16.5, 18.75)
lv.prop('parking_meter', 19.5, 18.75)
lv.prop('news_box', 28.0, 17.4)
lv.pigeons(33.0, 17.6, 3)

# indirect fill only (no visible source): the glow of the city over the street
lights = [
    [12, 21, 9, '#5a6ad8', 0.3],
    [36, 21, 9, '#7a5ad8', 0.3],
]

if __name__ == '__main__':
    lv.check(guards=18)
    lv.write('lab', name='PHYSICS LAB', subtitle='SANDBOX  -  A STATION FOR EVERY SYSTEM', passive=True, lights=lights,
             header=[
                 'Physics lab: a test ground, one station each (range, executions, soot, powder, steam, liquids, curtain and bars,',
                 'pool, power / jukebox / trapdoor) and a street with the vehicles. Load with ?level=lab. Guards here are passive',
                 'dummies (blind and deaf, at their job), but the two kept `awake` for the sight tests.',
             ])
