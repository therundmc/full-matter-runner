#!/usr/bin/env python3
"""Builds src/game/data/levels/lab.js (the physics lab / sandbox, ?level=lab) with tools/levelkit.py.

    python tools/build_lab.py

A lit test facility, one station each. A wide concourse runs west to east through the middle; the range closes its
west end, the other stations are bays and rooms opening onto it, a north row and a south row, the street beyond the
south row. Each station's name and number are stencilled on the floor at its entrance (props/label_*), numbered in
reading order: west to east, the north row before the south row. Walls are one tile thick (plaster, `#`).
Plan (north is up, 1 tile = 1 m; columns and rows of the level, a few rows left out; D door, G window, B the barred
window, ~ the curtained doorway, L the locked door; the rows 1-6 bays open on row 7, the rows 12-16 ones on row 11):

              0         1         2         3         4         5
              0123456789012345678901234567890123456789012345678901
         0    XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX
         1    X#         #                     #     #      #    X
         3    X# 1 RANGE #    2 EXECUTIONS     #3SOOT# 4POOL#6VIPX
         4    X#         L                     #     #      #    X
         6    X# fired   #                     #     #      #    X
         7    X#         ##########   ###########D#G###D##B###~##X
         8    X# west                                            X
         9    X#                <=====  the concourse  =====>    X
        10    X#                                                 X
        11    X#         ##   ###  ##  ##    #####D#####D########X
        12    X#         #7JUK #8TR #9 #      #11lobb #12 LIQUIDSX
        13    X#         #     #    #  #10 YD #       #          X
        14    X#         ############  #      ##G#G#D##          X
        15    X#         # 9 POWDER corridor  #lit rm #          X
        16    X#         #             #      #       #          X
        17    X##########################    ##############D#####X
        18    X  sidewalk: the trapdoor (west end), the hydrant  X
        21    X  road: 13 VEHICLES (car, van, leaking car)       X
        25    XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX

     1 RANGE       the whole west end, fired west: every gun on the firing line (col 8), two rows of ammo boxes behind
                   it; dummies, crates, a barrel, a bolted table and a bookshelf down range against the plaster back
                   wall (bullet holes); a locked door into the executions hall (kick it, shoot it)
     2 EXECUTIONS  ten men facing the north wall, their backs to the lane; a weapon on the floor behind each (knife,
                   bat, tire iron, cue, nothing: fists, 1911, Uzi, M16, SUPER 90, .50 CAL): left click behind one
     3 SOOT        a closed room (a door, a window on the concourse) with two gas bottles: the soot hangs and drifts out
     4 POOL        a man bent over the pool table, its balls to send rolling (a round, a blow, a body into it)
     5 BARS        the pool room's barred window on the concourse
     6 CURTAIN     a velvet curtain in the VIP room's doorway, a man (awake) behind it facing it
     7 JUKEBOX     a jukebox (E) in a niche
     8 TRAPDOOR    a trapdoor (E) in a niche, the other one on the sidewalk at the west end
     9 POWDER      an extinguisher on the wall of a dead-end corridor round a corner, a man (awake) at its far end; a
                   silenced Uzi at its mouth: hole it without a sound and walk up to him in the white
    10 STEAM       the yard to the street: a steam pipe to pierce on its wall, a wall vent, a manhole, junk to shove,
                   the one lamp in the lab that is going (flicker 'broken')
    11 POWER       a dim lobby, the fuse box on its wall, a lit room behind its windows (emergency lights over its door)
    12 LIQUIDS     a little bar on tiles: kegs behind the counter, the fire alarm and its sprinklers, a water pipe, two
                   dummies to bleed; the hydrant on the kerb outside, a car in the road whose tank leaks petrol
    13 VEHICLES    the street: a car, the van, the leaking car, barrels, streetlights
The guards are passive dummies (they see and hear nothing but go on at their job), except the two `awake` ones.
F1 is open from the start (game/debug/Sandbox.js); T wakes or freezes them all.
"""
from levelkit import Level

W, H = 52, 26
lv = Level(W, H)

# ---------------------------------------------------------------- tiles
lv.fill(1, 1, 50, 17, '#')                 # plaster inside the brick ring, carved into one-tile walls below
# 1 RANGE: the whole west end, its plaster back wall on col 1, open on the concourse
lv.fill(2, 1, 10, 16, '_')
lv.fill(11, 8, 11, 10, '_')
lv.put(11, 4, 'L')                         # a locked door into the executions hall
# the concourse
lv.fill(12, 8, 50, 10, '_')
# north row
lv.fill(12, 1, 32, 6, '.')                 # 2 EXECUTIONS
lv.fill(21, 7, 23, 7, '_')
lv.fill(34, 1, 38, 6, '_')                 # 3 SOOT: closed, a door and a window
lv.put(35, 7, 'D')
lv.put(37, 7, 'G')
lv.fill(40, 1, 45, 6, ':')                 # 4 POOL
lv.put(41, 7, 'D')
lv.put(44, 7, 'G')
lv.bar((44, 7))                            # 5 BARS: iron bars outside the glass
lv.fill(47, 1, 50, 6, ';')                 # 6 CURTAIN: the VIP room behind its curtained doorway
lv.put(48, 7, ';')
# south row
lv.fill(12, 12, 16, 13, '.')               # 7 JUKEBOX: a niche
lv.fill(13, 11, 15, 11, '.')
lv.fill(18, 12, 21, 13, '_')               # 8 TRAPDOOR: a niche
lv.fill(19, 11, 20, 11, '_')
lv.fill(23, 11, 24, 16, '+')               # 9 POWDER: the mouth, then the corridor west along rows 15-16
lv.fill(12, 15, 22, 16, '+')
lv.fill(26, 12, 31, 16, '_')               # 10 STEAM: the yard, open on the concourse and the sidewalk
lv.fill(27, 11, 30, 11, '_')
lv.fill(27, 17, 30, 17, '_')
lv.fill(33, 12, 39, 13, ';')               # 11 POWER: the lobby ...
lv.put(36, 11, 'D')
lv.fill(33, 15, 39, 16, '.')               # ... and the lit room behind its windows
for x in (34, 36):
    lv.put(x, 14, 'G')
lv.put(38, 14, 'D')
lv.fill(41, 12, 50, 16, '+')               # 12 LIQUIDS: a little bar on tiles, doors on the concourse and the sidewalk
lv.put(42, 11, 'D')
lv.put(45, 17, 'D')
# the street
lv.fill(1, 18, 50, 19, 's')
lv.fill(1, 20, 50, 24, '=')
lv.fill(1, 22, 50, 22, '-')

# ---------------------------------------------------------------- actors (18 guards)
lv.actor('@', 27, 9, face=270)

lv.area('the concourse')
for x in (14.5, 20.5, 26.5, 32.5, 39.5, 46.5):
    lv.prop('ceiling_lamp', x, 9.0)
for x in (17.5, 29.5, 46.0):
    lv.prop('wall_lamp', x, 8.08, 0)
for x in (17.5, 25.5, 40.0, 48.5):
    lv.prop('wall_lamp', x, 10.92, 180)
lv.prop('plant', 50.5, 10.5)
lv.prop('plant', 32.5, 8.45)

lv.area('1 range')
lv.paint('label_range', 11.5, 9.0)
for y, kind in zip(range(6, 13), ('pistol', 'uzi', 'uzi_silenced', 'rifle', 'shotgun', 'sniper', 'bazooka')):
    lv.drop(kind, 8.55, y + 0.5, 180)      # on the firing line, pointing down range
for y, ch in zip(range(6, 13), 'nnnvgvq'):
    lv.actor(ch, 9, y)                     # a box of rounds behind each gun ...
for y, ch in ((7, 'z'), (9, 'w'), (10, 'g'), (12, 'q')):
    lv.actor(ch, 10, y)                    # ... and a few more
lv.actor('m', 3, 6, face=0)                # dummies facing the shooter
lv.actor('r', 5, 9, face=0)
lv.actor('k', 3, 12, face=0)
lv.prop('bookshelf', 2.2, 9.5, 270)        # against the plaster back wall
lv.prop('crate', 2.65, 2.4)
lv.prop('crate', 2.7, 15.3, 10)
lv.prop('barrel', 6.0, 14.0)
lv.prop('table', 5.0, 4.0)
lv.prop('chair', 3.9, 4.0, 0)
for y in (3.5, 9.0, 14.5):
    lv.prop('ceiling_lamp', 6.0, y)
for y in (5.5, 12.5):
    lv.prop('wall_lamp', 2.08, y, 270)
lv.prop('ceiling_lamp', 9.5, 2.5)

lv.area('2 executions')
lv.paint('label_executions', 22.0, 8.35)
WEAPONS = ('knife', 'bat', 'tire_iron', 'cue', None, 'pistol', 'uzi', 'rifle', 'shotgun', 'sniper')
for i, (ch, kind) in enumerate(zip('mjibkpushr', WEAPONS)):
    x = 13 + 2 * i
    lv.actor(ch, x, 1, face=270)           # his face to the wall, his back to the lane
    if kind:
        lv.drop(kind, x + 0.5, 4.35, 0)    # what to take him with (none under the fifth man: fists)
for x in (16.0, 22.0, 28.0):
    lv.prop('ceiling_lamp', x, 3.5)

lv.area('3 soot')
lv.paint('label_soot', 36.0, 8.35)
lv.prop('gas_bottle', 35.6, 3.0)
lv.prop('gas_bottle', 37.4, 3.7)
lv.prop('crate', 38.3, 1.5, 6)
lv.prop('jerrycan', 34.5, 1.4)
lv.prop('ceiling_lamp', 36.5, 3.5)

lv.area('4 pool, 5 bars')
lv.paint('label_pool', 41.4, 8.35)
lv.paint('label_bars', 44.6, 8.35)
lv.prop('pool_table', 43.0, 3.9)
lv.prop('pool_lamp', 43.0, 3.9)
lv.actor('i', 43, 5, face=270, job='pool')  # bent over the table, the lamp over him
lv.prop('wall_lamp', 40.08, 2.0, 270)
lv.prop('wall_lamp', 45.92, 2.0, 90)

lv.area('6 curtain')
lv.paint('label_curtain', 48.4, 8.35)
lv.prop('curtain', 48.5, 7.5, 90)
lv.actor('k', 48, 3, face=90, job='hall', awake=True)   # facing the curtain: he sees nothing through it
lv.prop('sofa', 49.0, 1.5)
lv.prop('wall_lamp', 50.91, 4.0, 90)

lv.area('7 jukebox')
lv.paint('label_jukebox', 14.5, 10.65)
lv.prop('jukebox', 14.5, 13.64, 180)
lv.prop('chair', 12.6, 12.6, 20)
lv.prop('wall_lamp', 16.0, 13.92, 180)

lv.area('8 trapdoor')
lv.paint('label_trapdoor', 20.0, 10.65)
lv.prop('wall_lamp', 18.6, 13.92, 180)

lv.area('9 powder')
lv.paint('label_powder', 24.3, 10.65)
lv.drop('uzi_silenced', 23.6, 12.4, 0)     # hole it without a sound: he would come to a shot
lv.actor('z', 24, 12)
lv.prop('extinguisher', 20.5, 15.14, 0)
lv.actor('j', 12, 15, face=0, job='hall', awake=True)    # sees down the corridor, not round its corner
lv.prop('wall_lamp', 15.5, 15.08, 0)
lv.prop('wall_lamp', 24.92, 13.5, 90)

lv.area('10 steam: the yard, junk to shove')
lv.paint('label_steam', 28.5, 10.65)
lv.prop('pipe_steam', 26.07, 14.5, 270)
lv.prop('wall_vent', 31.93, 13.6, 90)
lv.dress('manholes', 28.6, 14.6)
lv.prop('wall_lamp', 31.92, 15.5, 90)
lv.prop('wall_lamp', 26.08, 12.4, 270, flicker='broken')   # the one lamp that is going
lv.prop('dumpster', 31.42, 15.6, 90)
lv.prop('trash_can', 31.45, 12.45)
lv.prop('trash_can', 30.8, 12.5)
lv.prop('crate', 26.55, 16.4, -8)
lv.prop('crate', 27.3, 16.5, 12)
lv.prop('chair', 29.6, 12.9, 30)
lv.prop('barrel', 26.6, 13.4)

lv.area('11 power: the lobby and the lit room')
lv.paint('label_power', 36.0, 10.65)
lv.power(33, 15, 39, 16, 37.5, 13.92, 180)  # the fuse box in the lobby, between the windows and the door
lv.prop('emergency_light', 37.4, 15.08, 0)
lv.prop('emergency_light', 33.08, 15.5, 270)
for x in (34.5, 37.5):
    lv.prop('ceiling_lamp', x, 16.0)
lv.prop('wall_lamp', 39.92, 15.6, 90)
lv.prop('table', 35.5, 16.35)
lv.prop('chair', 34.4, 16.35, 0)

lv.area('12 liquids')
lv.paint('label_liquids', 42.6, 10.65)
for x in (47.5, 48.5, 49.5):
    lv.prop('bar_counter', x, 13.25)
for x in (48.4, 49.2):
    lv.prop('keg', x, 12.4)                # behind the counter: holed, they flood it with beer
lv.prop('beer_tap', 48.0, 13.1)
lv.sprinklers(43.5, 12.07, 0, [(41, 12, 50, 16)])
lv.prop('pipe_water', 50.93, 15.0, 90)
lv.prop('wall_lamp', 45.5, 12.08, 0)
lv.prop('ceiling_lamp', 45.0, 15.0)
lv.actor('b', 42, 14, face=0)              # dummies to bleed
lv.actor('u', 44, 15, face=90)
lv.prop('hydrant', 43.5, 19.62)            # on the kerb: the water runs down the gutter

lv.area('13 vehicles: the street, to ram, hole and blow up')
lv.paint('label_vehicles', 28.5, 18.6)
lv.passage(('trapdoor', 20.0, 12.9, 0), ('trapdoor', 2.5, 18.6, 0))
lv.prop('car', 8.0, 21.1, 0)
lv.prop('van', 24.0, 23.5, 180)
lv.prop('car2', 47.2, 21.1, 0)             # its tank (the rear, west end) by the hydrant: the petrol runs with the water
lv.prop('barrel', 14.5, 23.4)
lv.prop('barrel', 33.0, 23.5)
for x in (10.5, 20.5, 32.5, 41.0):
    lv.prop('streetlight', x, 19.7, 90)
lv.prop('vending', 5.5, 18.35)
lv.prop('parking_meter', 16.5, 19.75)
lv.prop('parking_meter', 23.5, 19.75)
lv.prop('news_box', 37.5, 18.4)
lv.pigeons(34.0, 18.8, 3)
for x in (6.5, 18.5, 34.5, 47.5):
    lv.prop('wall_lamp', x, 18.08, 0)      # over the sidewalk, on the facade

# indirect fill only (no visible source): the glow of the city over the street
lights = [
    [12, 22, 9, '#5a6ad8', 0.3],
    [38, 22, 9, '#7a5ad8', 0.3],
]
# a brighter night than the bar's (LIGHTING.ambient), everywhere one plays: a lab is for seeing what happens. The
# lamps are bulbs and wall lamps, no tubes or neon (the failing ones render/Flicker.js picks among them would add to
# the one lamp going in the yard)
light = dict(inside=[0.36, 0.33, 0.48], street=[0.36, 0.35, 0.52], wall=[0.3, 0.27, 0.42])

if __name__ == '__main__':
    lv.check(guards=18)
    lv.write('lab', name='PHYSICS LAB', subtitle='SANDBOX  -  A STATION FOR EVERY SYSTEM', passive=True, lights=lights, light=light,
             header=[
                 'Physics lab: a test facility, a concourse with a station on each side (range, executions, soot, pool, bars,',
                 'curtain, jukebox, trapdoor, powder, steam, power, liquids) and a street with the vehicles. Load with ?level=lab.',
                 'Guards here are passive dummies (blind and deaf, at their job), but the two kept `awake` for the sight tests.',
             ])
